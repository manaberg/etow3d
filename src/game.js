import { STEP, TILE, randInt, clamp } from './core/constants.js';
import { Input } from './core/input.js';
import { TimeSlower } from './core/timeslower.js';
import { World } from './world/world.js';
import { DungeonLevels, Trials } from './world/levels.js';
import { floorLook } from './world/looks.js';
import { Gfx } from './render/renderer.js';
import { buildCursor } from './render/models.js';
import { Mage, SpellBook } from './entities/mage.js';
import { BarSlots, WizardLevels, CircleFloors, bookId } from './entities/spellbar.js';
import { Orc } from './entities/orc.js';
import { Clericorc, Mageorc, Boss } from './entities/bosses.js';
import { Dragon, DragonAges } from './entities/dragon.js';
import { DuelWizard } from './entities/duelWizard.js';
import { DuelRules } from './entities/duelRules.js';
import { Zone, MirrorImage, Projectile } from './entities/spells.js';
import { Item, Scroll, Potion, Ring, GearItem, Stairs, studySpell } from './entities/items.js';
import { Kits, outfit, rollGear } from './entities/gear.js';
import { DuelLoot } from './entities/duelLoot.js';
import { spawnReflection, rollSpoils, spoilName } from './entities/mirror.js';
import { actionKeyLabel } from './core/bindings.js';
import { setting } from './core/settings.js';
import { Battle } from './entities/battle.js';
import { Soldier } from './entities/soldier.js';
import { Hud } from './ui/hud.js';
import { TouchControls, TOUCH_TURN } from './ui/touch.js';
import { isTouch } from './core/device.js';

// camera: radians turned per pixel the mouse is dragged, and per second a
// turn key is held, at 100% (the controls screen scales both)
const CAMERA_DRAG = 0.003;
const CAMERA_TURN = 1.4;

// Power word kill: damage to the target (at least its own pwkillDamage) and to
// every orc within the splash radius around it.
const PWKILL = {
  tier1: { target: 175, splash: 175, radius: 150 },
  tier2: { target: 300, splash: 230, radius: 230 }
};

// the zones that slow whoever stands in them
const SLOWING_ZONES = new Set(['blizzard', 'guardians', 'gloom']);

const STAT_KEYS = [
  'wincount', 'killcount', 'bosscount', 'micount', 'fbcount', 'lgcount', 'iscount', 'bzcount', 'bkcount',
  'hscount', 'tscount', 'shcount', 'lscount', 'imcount', 'fecount', 'incount', 'crcount', 'tlcount', 'pwkcount',
  'bluepotcount', 'redpotcount', 'scrollcount', 'orccount', 'knightcount', 'shamancount'
];

export class Game {
  // `mobile`: the mobile descent, made for touch screens: every floor a
  // tunnel from the start to the stairs (dungeon.js planTunnel), and duels
  // for trials, no battles.
  constructor({ container, hudRoot, onExit, mobile = false }) {
    this.mobile = mobile;
    // the descent: twenty dungeon floors with trials against the wizard's
    // reflection between them (levels.js Trials), and the stage the run is on
    this.run = Trials.schedule({ battles: !mobile });
    this.stage = 0;
    // the current trial (a stage of the run), or null on a dungeon floor.
    // Trials are fought by the duel rules (duel damage and health); a battle
    // is a duel with armies.
    this.trial = null;
    this.duelMode = false;
    this.battleMode = false;
    this.battle = null;
    this.rival = null;
    this.duelLoot = null;
    // the player's health before a trial put it on the duel scale
    this.trialBase = null;
    this.onExit = onExit;
    this.gfx = new Gfx(container);
    this.fx = this.gfx.fx;
    this.input = new Input(this.gfx.canvas);
    this.time = new TimeSlower();
    this.hud = new Hud(hudRoot, this);
    this.stats = {};
    for (const key of STAT_KEYS) {
      this.stats[key] = 0;
    }
    this.entities = [];
    this.player = null;
    this.navFrame = 0;
    this.depth = 1;
    this.levelEnemyTotal = 0;
    this.floorSlain = 0;
    this.stairs = null;
    this.stairsRoomIndex = -1;
    this.descendRequested = false;
    this.currentRoomIndex = -1;
    this.bannerFrames = 0;
    this.state = 'playing';
    this.paused = false;
    this.inventoryOpen = false;
    // enemies idle until they see, hear or get hit by the player
    this.aggroSightRange = 460;
    this.aggroHearRange = 130;
    this.aggroMemoryFrames = 480;
    this.aggroCallRange = 320;

    this.cursor = buildCursor();
    this.gfx.add(this.cursor);

    this.startStage(null);
    this.hud.build();
    // the on-screen controls of a touch screen (core/device.js picks them)
    this.touch = new TouchControls(this);

    this.last = performance.now();
    this.acc = 0;
    this.elapsed = 0;
    this.frameHandle = requestAnimationFrame((t) => this.frame(t));
  }

  // --------------------------------------------------------------- floors

  // `options` overrides the map size and layout (duels and battlefields).
  buildWorld(options) {
    for (const e of this.entities) {
      e.dispose();
    }
    this.entities = [];
    this.player = null;
    if (!options) {
      // dungeon floors grow with depth, and every floor is laid out after
      // its name (looks.js), some bigger
      const plan = DungeonLevels.getPlan(this.depth);
      const look = floorLook(this.depth);
      const scale = look.mapScale || 1;
      options = {
        cols: Math.round((34 + plan.rooms * 4) * scale),
        rows: Math.round((22 + plan.rooms * 3) * scale),
        roomCount: plan.rooms,
        look,
        // the mobile descent's tunnels size their own map
        tunnel: this.mobile
      };
    }
    this.world = new World(options, () => this.navFrame);
    this.gfx.buildLevel(this.world, this.battleMode);
    this.currentRoomIndex = -1;
  }

  // Starts the run's current stage: a dungeon floor, a duel or a battle.
  // `carry` is what the wizard brings down the stairs (null at the start).
  startStage(carry) {
    const stage = this.run[this.stage];
    this.depth = stage.depth;
    this.trial = stage.kind === 'dungeon' ? null : stage;
    this.duelMode = !!this.trial;
    this.battleMode = stage.kind === 'battle';
    // clear the last stage away (the battle's soldiers before their instances)
    for (const e of this.entities) {
      e.dispose();
    }
    this.entities = [];
    this.player = null;
    this.rival = null;
    this.duelLoot = null;
    if (this.battle) {
      this.battle.dispose();
      this.battle = null;
    }
    if (this.army) {
      this.army.clear();
    }
    this.gfx.setBattlefield(this.battleMode, isTouch());
    // the mobile descent starts every stage looking up the tunnel (north),
    // as a new run does; the descent keeps the camera where it was left
    if (this.mobile) {
      this.gfx.resetView(true);
    }
    this.stairs = null;
    this.descendRequested = false;
    this.state = 'playing';
    this.bannerFrames = 240;
    if (stage.kind === 'battle') {
      this.battle = new Battle(this);
      this.battle.start(carry);
    } else if (stage.kind === 'duel') {
      this.startDuel(stage, carry);
    } else {
      this.startFloor(carry);
    }
    this.hud.onFloorChanged();
  }

  // The wizard, with everything carried down the stairs (spells, bar, ranks,
  // level, gear and stats), or at the start of the run in an apprentice's kit.
  spawnPlayer(x, y, carry) {
    const player = this.spawn(Mage, x, y);
    this.player = player;
    if (carry) {
      const { inventory, ...rest } = carry;
      Object.assign(player, rest);
      player.takeInventory(inventory);
    } else {
      outfit(player, Kits.apprentice);
    }
    return player;
  }

  // Builds the current depth's dungeon, places the player and populates it.
  startFloor(carry) {
    this.buildWorld();
    this.warlordSlain = false;
    const spawn = this.world.getRoomSpawnPoint(this.world.getMainRoom(), 4);
    const player = this.spawnPlayer(spawn.x, spawn.y, carry);
    this.populateFloor(DungeonLevels.getPlan(this.depth), player);
    this.floorSlain = 0;
    return player;
  }

  // A duel trial: a small dungeon of six rooms, big enough to hide, flank and
  // race for potions, the wizards starting in the two rooms farthest apart;
  // or an open arena (a pillarless hall) to fight face to face. No stairs,
  // and the whole (small) map is known from the start.
  startDuel(stage, carry) {
    if (stage.arena) {
      this.buildWorld({ cols: 44, rows: 30, roomCount: 1, minRoomW: 30, maxRoomW: 30, minRoomH: 16, maxRoomH: 16 });
      const room = this.world.getMainRoom();
      room.visited = true;
      const center = this.world.getRoomCenterPixel(room);
      const offset = Math.min(520, Math.floor(room.w * TILE / 2) - 150);
      this.startTrialDuelists(center.x - offset - 24, center.y - 24, center.x + offset - 24, center.y - 24, carry);
    } else {
      this.buildWorld({ cols: 56, rows: 38, roomCount: 6 });
      const rooms = this.world.rooms;
      let pair = [0, Math.min(1, rooms.length - 1)];
      let farthest = -1;
      for (let a = 0; a < rooms.length; a++) {
        for (let b = a + 1; b < rooms.length; b++) {
          const ca = this.world.getRoomCenterPixel(rooms[a]);
          const cb = this.world.getRoomCenterPixel(rooms[b]);
          const d = Math.hypot(ca.x - cb.x, ca.y - cb.y);
          if (d > farthest) {
            farthest = d;
            pair = [a, b];
          }
        }
      }
      for (const room of rooms) {
        room.visited = true;
      }
      const ps = this.world.getRoomSpawnPoint(rooms[pair[0]], 3);
      const rs = this.world.getRoomSpawnPoint(rooms[pair[1]], 3);
      this.startTrialDuelists(ps.x, ps.y, rs.x, rs.y, carry);
    }
    this.duelLoot = new DuelLoot(this);
  }

  // The two wizards of a trial: the player, whole and on the duel scale
  // (Trials.hpScale), and its reflection (mirror.js).
  startTrialDuelists(px, py, rx, ry, carry) {
    const player = this.spawnPlayer(px, py, carry);
    this.trialBase = { maxHp: player.maxHp, gearHp: player.gearStats.maxHp || 0 };
    player.maxHp = Math.round(player.maxHp * Trials.hpScale);
    player.hp = player.maxHp;
    player.manergy = player.maxManergy;
    this.rival = spawnReflection(this, rx, ry, player);
  }

  // Back from the duel scale: the share of health left carries on (with
  // whatever gear worn in the trial added or took away).
  leaveTrial(player) {
    const base = this.trialBase;
    const share = clamp(player.hp / player.maxHp, 0, 1);
    player.maxHp = base.maxHp + (player.gearStats.maxHp || 0) - base.gearHp;
    player.hp = Math.max(1, Math.round(player.maxHp * share));
    this.trialBase = null;
  }

  snapshotPlayer(player) {
    const carry = {};
    for (const key of Object.keys(player)) {
      // spellbook flags (hasFireball, hasFb2...)
      if (/^has[A-Z]/.test(key)) {
        carry[key] = player[key];
      }
    }
    // the inventory goes down too, with the pools its gear has already raised
    for (const key of ['hp', 'maxHp', 'manergy', 'maxManergy', 'is2Charges', 'missileTier', 'timePlayed', 'inventory', 'gearStats',
      'slotLimit', 'level', 'xp']) {
      carry[key] = player[key];
    }
    // and the spell bar, the ranks and the order spells were learnt in
    carry.bar = player.bar.slice();
    carry.ranks = { ...player.ranks };
    carry.learnOrder = player.learnOrder.slice();
    return carry;
  }

  requestDescend() {
    this.descendRequested = true;
  }

  // On to the run's next stage.
  descend() {
    if (this.trialBase) {
      this.leaveTrial(this.player);
    }
    const carry = this.snapshotPlayer(this.player);
    // a breather on the stairs: full manergy and a little health
    carry.manergy = carry.maxManergy;
    carry.hp += 30;
    this.stage = Math.min(this.run.length - 1, this.stage + 1);
    this.time = new TimeSlower();
    this.startStage(carry);
  }

  // What the stage is called (the HUD's title and banner).
  stageName() {
    return this.trial ? Trials.name(this.trial) : DungeonLevels.getPlan(this.depth).name;
  }

  getKillsToUnseal() {
    const needed = Math.ceil(this.levelEnemyTotal * DungeonLevels.unlockShare);
    return Math.max(0, needed - this.floorSlain);
  }

  isStairsOpen() {
    return !!this.stairs && (this.getKillsToUnseal() === 0 || this.warlordSlain);
  }

  // Rooms away from the start, picked by size, sometimes by theme.
  pickLairRoom(lairs, preferTheme) {
    const rooms = this.world.rooms;
    if (preferTheme && Math.random() < 0.6) {
      const themed = lairs.filter((i) => rooms[i].theme === preferTheme);
      if (themed.length > 0) {
        return themed[randInt(0, themed.length - 1)];
      }
    }
    let total = 0;
    for (const i of lairs) {
      total += rooms[i].w * rooms[i].h;
    }
    let roll = Math.random() * total;
    for (const i of lairs) {
      roll -= rooms[i].w * rooms[i].h;
      if (roll < 0) {
        return i;
      }
    }
    return lairs[lairs.length - 1];
  }

  // A pack is one race: orcs, or a warband of dwarves, humans or elves.
  spawnOrcPack(plan, roomIndex, count, race = DungeonLevels.pickRace(plan)) {
    const room = this.world.rooms[roomIndex];
    for (let i = 0; i < count; i++) {
      const spot = this.world.getRoomSpawnPoint(room, 2);
      this.spawn(Orc, spot.x, spot.y, {
        orcClass: DungeonLevels.pickClass(plan),
        race,
        depth: this.depth,
        isChampion: Math.random() < plan.champion,
        homeRoom: roomIndex
      });
    }
    return count;
  }

  populateFloor(plan, player) {
    const world = this.world;
    const rooms = world.rooms;
    const start = player.center();
    // the throne room is always the one farthest from the start
    let stairsRoom = world.findRoomIndexByTheme('throne');
    if (stairsRoom < 0) {
      stairsRoom = rooms.length - 1;
    }
    // orcs live in rooms whose nearest edge is out of sight of the start,
    // so nothing notices the player before they move
    let lairs = [];
    const all = [];
    for (let i = 0; i < rooms.length; i++) {
      if (i === world.mainRoomIndex) {
        continue;
      }
      all.push(i);
      if (world.roomDistance(rooms[i], start.x, start.y) > this.aggroSightRange + 100) {
        lairs.push(i);
      }
    }
    if (lairs.length < 2) {
      lairs = all.slice()
        .sort((a, b) => world.roomDistance(rooms[b], start.x, start.y) - world.roomDistance(rooms[a], start.x, start.y))
        .slice(0, Math.max(1, Math.ceil(all.length / 2)));
    }
    let total = 0;
    // a guard pack waits by the stairs (or around the warlord)
    const guards = Math.min(plan.orcs, 2 + Math.floor(this.depth / 3));
    total += this.spawnOrcPack(plan, stairsRoom, guards, plan.boss ? 'orc' : undefined);
    let remaining = plan.orcs - guards;
    while (remaining > 0) {
      const packSize = Math.min(remaining, randInt(3, 5 + Math.floor(this.depth / 3)));
      total += this.spawnOrcPack(plan, this.pickLairRoom(lairs, 'barracks'), packSize);
      remaining -= packSize;
    }
    const minis = [[Clericorc, plan.clerics || 0, 'crypt'], [Mageorc, plan.mages || 0, 'library']];
    for (const [Kind, count, theme] of minis) {
      for (let n = 0; n < count; n++) {
        const roomIndex = this.pickLairRoom(lairs, theme);
        const spot = world.getRoomSpawnPoint(rooms[roomIndex], 3);
        this.spawn(Kind, spot.x, spot.y, { homeRoom: roomIndex });
        total++;
      }
    }
    total += this.spawnFloorWizard(lairs);
    // dragons lair in the biggest rooms, the greatest in the throne room
    if (plan.dragons) {
      const lairsBySize = lairs.slice().sort((a, b) => rooms[b].w * rooms[b].h - rooms[a].w * rooms[a].h);
      let next = 0;
      for (const age of ['ancient', 'adult', 'young', 'wyrmling']) {
        for (let n = 0; n < (plan.dragons.ages[age] || 0); n++) {
          const roomIndex = lairsBySize[next++ % lairsBySize.length];
          const color = plan.dragons.colors[randInt(0, plan.dragons.colors.length - 1)];
          this.spawnDragon(roomIndex, color, age);
          total++;
        }
      }
    }
    if (plan.boss === 'warlord') {
      const spot = world.getRoomSpawnPoint(rooms[stairsRoom], 4, 96);
      this.spawn(Boss, spot.x, spot.y, { homeRoom: stairsRoom });
      total++;
    } else if (plan.boss === 'wyrm') {
      this.spawnDragon(stairsRoom, 'gold', 'great');
      total++;
    } else {
      const spot = world.getRoomSpawnPoint(rooms[stairsRoom], 4, 96);
      this.stairs = this.spawn(Stairs, spot.x, spot.y);
      this.stairsRoomIndex = stairsRoom;
    }
    // loot waiting on the floor; it stays until picked up
    for (let s = 0; s < plan.scrolls; s++) {
      const spot = world.getRoomSpawnPoint(rooms[this.pickLairRoom(all, 'library')], 2);
      this.spawn(Scroll, spot.x, spot.y, { persistent: true, tier: Math.random() < plan.tier2 ? 1 : 0 });
    }
    for (let p = 0; p < plan.potions; p++) {
      const spot = world.getRoomSpawnPoint(rooms[this.pickLairRoom(all, 'alchemy')], 2);
      this.spawn(Potion, spot.x, spot.y, { persistent: true });
    }
    for (let r = 0; r < plan.rings; r++) {
      const spot = world.getRoomSpawnPoint(rooms[stairsRoom], 3);
      this.spawn(Ring, spot.x, spot.y, { persistent: true });
    }
    this.levelEnemyTotal = total;
  }

  // The floor's dark wizard, in a lair room, with a fresh random spellbook
  // from the circles the floor has reached.
  spawnFloorWizard(lairs) {
    const rules = DungeonLevels.wizard;
    const roomIndex = this.pickLairRoom(lairs, 'library');
    const spot = this.world.getRoomSpawnPoint(this.world.rooms[roomIndex], 3);
    const hp = rules.hp(this.depth);
    const wizard = this.spawn(DuelWizard, spot.x, spot.y, {
      difficulty: rules.difficulty(this.depth),
      hp,
      maxHp: hp,
      hitScale: rules.hitScale,
      controlScale: rules.controlScale,
      desiredVel: rules.speed,
      homeRoom: roomIndex,
      label: 'DARK WIZARD'
    });
    const open = (s) => {
      const spell = SpellBook.find((b) => b.id === bookId(s));
      return spell && CircleFloors[spell.circle] <= this.depth;
    };
    const pool = Object.keys(wizard.spellBook).filter((s) => s !== 'missile' && open(s));
    wizard.known = new Set();
    wizard.ranks = {};
    for (let n = Math.min(pool.length, rules.spells(this.depth)); n > 0; n--) {
      const id = pool.splice(randInt(0, pool.length - 1), 1)[0];
      wizard.known.add(id);
      wizard.ranks[id] = rules.rank(this.depth);
    }
    wizard.missileTier = rules.missileTier(this.depth);
    return 1;
  }

  spawnDragon(roomIndex, color, age) {
    const size = DragonAges[age].size;
    const spot = this.world.getRoomSpawnPoint(this.world.rooms[roomIndex], 3, size);
    return this.spawn(Dragon, spot.x, spot.y, { color, age, depth: this.depth, homeRoom: roomIndex });
  }

  // The warlord fell on floor 10: the run goes on, down to the dragons. The
  // stairs open where he died.
  onWarlordSlain(boss) {
    const c = boss.center();
    this.stairs = this.spawn(Stairs, c.x - 48, c.y - 48);
    this.stairsRoomIndex = boss.homeRoom;
    this.warlordSlain = true;
    this.hud.toast('THE WARLORD IS SLAIN :: THE STAIRS DOWN TO THE DRAGONS OPEN', '#ffd060');
  }

  // Deeper orcs drop more; champions drop the most. Potions stay scarce.
  rollOrcLoot(orc) {
    if (this.duelMode) {
      return;
    }
    const plan = DungeonLevels.getPlan(this.depth);
    const potionChance = orc.isChampion ? 0.35 : 0.02 + this.depth * 0.005;
    const scrollChance = orc.isChampion ? 0.5 : 0.015 + this.depth * 0.007;
    if (Math.random() < potionChance) {
      this.dropPotion(orc);
    }
    if (Math.random() < scrollChance) {
      this.dropScroll(orc, Math.random() < plan.tier2 ? 1 : 0, 24);
    }
    // now and then a piece of gear (whatever it wore drops as well, orc.js);
    // the mage's magic find makes gear a little more common and finer
    const magicFind = this.player ? this.player.bonus('magicFind') : 0;
    const gearChance = (orc.isChampion ? 0.15 : 0.01 + this.depth * 0.003) * (1 + magicFind / 2);
    if (Math.random() < gearChance) {
      this.dropGear(orc, rollGear(this.depth, { minRarity: orc.isChampion ? 'magic' : undefined, magicFind }));
    }
  }

  // An item (gear.js) on the floor somewhere around a body.
  dropGear(from, item) {
    const a = Math.random() * Math.PI * 2;
    const r = 20 + Math.random() * 30;
    const c = from.center();
    return this.spawn(GearItem, c.x - 24 + Math.cos(a) * r, c.y - 24 + Math.sin(a) * r, { item });
  }

  dropPotion(from, settings = {}) {
    return this.spawn(Potion, from.pos.x + from.size.x / 2 - 24, from.pos.y + from.size.y / 2 - 24, settings);
  }

  // `spell`: a scroll of that one spell (a slain dark wizard's)
  dropScroll(from, tier, offset = 0, spell = null) {
    return this.spawn(Scroll, from.pos.x + from.size.x / 2 - 24 + offset, from.pos.y + from.size.y / 2 - 24 + offset, { tier, spell });
  }

  dropRing(from) {
    return this.spawn(Ring, from.pos.x + from.size.x / 2 + 24, from.pos.y + from.size.y / 2 + 24);
  }

  // --------------------------------------------------------------- entities

  spawn(Kind, x, y, settings) {
    const entity = new Kind(this, x, y, settings);
    this.entities.push(entity);
    return entity;
  }

  byType(Kind) {
    return this.entities.filter((e) => e instanceof Kind && !e.killed);
  }

  orcs() {
    return this.byType(Orc);
  }

  floorEnemies() {
    return this.entities.filter((e) => !e.killed && (e instanceof Orc || e instanceof Clericorc || e instanceof Mageorc || e instanceof Boss || e instanceof DuelWizard || e instanceof Dragon));
  }

  duelRival() {
    return this.rival && !this.rival.killed ? this.rival : null;
  }

  // Bodies a team's spells can hit.
  hostilesOf(team) {
    // battles call this for every bolt every step: build each list once per step
    if (this.battle) {
      if (this._hostileFrame !== this.navFrame) {
        this._hostileFrame = this.navFrame;
        this._hostiles = {};
      }
      if (!this._hostiles[team]) {
        this._hostiles[team] = this.listHostiles(team);
      }
      return this._hostiles[team];
    }
    return this.listHostiles(team);
  }

  listHostiles(team) {
    // battle soldiers and dragons belong to a side; dungeon dragons have none
    if (team === 'player') {
      return this.entities.filter((e) => !e.killed && (
        e instanceof Orc || e instanceof Clericorc || e instanceof Mageorc || e instanceof Boss || (e instanceof Dragon && e.side !== 'player') ||
        e instanceof DuelWizard || (e instanceof MirrorImage && e.source !== this.player) || (e instanceof Soldier && e.side === 'enemy')
      ));
    }
    return this.entities.filter((e) => !e.killed && (
      e === this.player || (e instanceof MirrorImage && e.source === this.player) ||
      ((e instanceof Soldier || e instanceof Dragon) && e.side === 'player')
    ));
  }

  firstImage() {
    return this.entities.find((e) => e instanceof MirrorImage && !e.killed && e.source === this.player) || null;
  }

  // The nearest foe of `team` within range of a body.
  nearestHostile(from, range, team = 'player') {
    let best = null;
    let bestDistance = range;
    for (const e of this.hostilesOf(team)) {
      const d = from.distanceTo(e);
      if (d < bestDistance) {
        bestDistance = d;
        best = e;
      }
    }
    return best;
  }

  // The foe of `team` whose centre is nearest a point, within range.
  hostileNear(point, range, team = 'player') {
    let best = null;
    let bestD = range;
    for (const e of this.hostilesOf(team)) {
      const c = e.center();
      const d = Math.hypot(c.x - point.x, c.y - point.y);
      if (d < bestD) {
        bestD = d;
        best = e;
      }
    }
    return best;
  }

  hoveredHostile() {
    const g = this.input.ground;
    let best = null;
    let bestD = Infinity;
    for (const e of this.hostilesOf('player')) {
      if (e.containsPoint(g.x, g.y, 14)) {
        const c = e.center();
        const d = Math.hypot(c.x - g.x, c.y - g.y);
        if (d < bestD) {
          bestD = d;
          best = e;
        }
      }
    }
    return best;
  }

  // Survival: the item whose name tag (drawn by the HUD last frame) the
  // cursor is on, else the one under the cursor.
  pointedItem() {
    if (this.duelMode || !this.player || this.player.dead || this.state !== 'playing') {
      return null;
    }
    const m = this.input.mouse;
    // a fingertip is wider than the mouse's point
    const slop = isTouch() ? 10 : 0;
    if (m.inside) {
      for (const tag of this.hud.itemTags) {
        if (!tag.item.killed && m.x >= tag.x0 - slop && m.x <= tag.x1 + slop && m.y >= tag.y0 - slop && m.y <= tag.y1 + slop) {
          return tag.item;
        }
      }
    }
    return this.hoveredItem();
  }

  hoveredItem() {
    const g = this.input.ground;
    return this.entities.find((e) => !e.killed && e instanceof Item && e.containsPoint(g.x, g.y, 14)) || null;
  }

  // Slow factor from the zones covering an entity (blizzards of the other side).
  zoneSlow(entity) {
    let slow = 1;
    // battle soldiers and dragons carry their side
    const friendlyTeam = entity.side || (entity === this.player || (entity instanceof MirrorImage && entity.source === this.player) ? 'player' : 'enemy');
    this.liveZones();
    for (const e of this._slowZones) {
      if (e.killed || e.team === friendlyTeam || !e.covers(entity)) {
        continue;
      }
      if (e.kind === 'blizzard') {
        slow = Math.min(slow, entity.slowIn ? entity.slowIn(e) : 0.5);
      } else if (e.kind === 'guardians') {
        slow = Math.min(slow, 0.6);
      } else if (e.kind === 'gloom') {
        slow = Math.min(slow, 0.55);
      }
    }
    return slow;
  }

  // The bolts in flight, gathered once a step: magic missiles look for
  // bolts to shoot down.
  liveBolts() {
    if (this._boltFrame !== this.navFrame || !this._bolts) {
      this._boltFrame = this.navFrame;
      this._bolts = this.entities.filter((e) => e instanceof Projectile && !e.killed);
    }
    return this._bolts;
  }

  // The zones on the ground, gathered once a step: every moving body asks.
  liveZones() {
    if (this._zoneFrame !== this.navFrame || !this._zones) {
      this._zoneFrame = this.navFrame;
      this._zones = this.entities.filter((e) => e instanceof Zone && !e.killed);
      this._slowZones = this._zones.filter((e) => SLOWING_ZONES.has(e.kind));
    }
    return this._zones;
  }

  // The word kills around its target too: every orc within the splash takes
  // the splash damage (battle armies included). Tier 2 widens and deepens it.
  powerWordKill(target) {
    const tier2 = !!(this.player && this.player.hasPwk2);
    const spec = tier2 ? PWKILL.tier2 : PWKILL.tier1;
    const c = target.center();
    this.skullFx(c.x, c.y, spec.radius);
    if (target instanceof MirrorImage) {
      target.pop();
      return;
    }
    const pool = this.battle ? this.battle.units('enemy') : this.orcs();
    for (const orc of pool) {
      if (orc !== target && !orc.killed && orc.distanceTo(target) < spec.radius) {
        orc.hurt(spec.splash, 'necrotic');
      }
    }
    if (target instanceof DuelWizard) {
      DuelRules.applyHit(target, 'pwkill', this.player);
      return;
    }
    target.hurt(Math.max(target.pwkillDamage, spec.target), 'necrotic');
  }

  // --------------------------------------------------------------- awareness & navigation

  // True line of sight through the collision map (walls and pillars block it).
  hasRoomLineOfSight(a, b) {
    if (!a || !b) {
      return false;
    }
    const ca = a.center();
    const cb = b.center();
    const dx = ca.x - cb.x;
    const dy = ca.y - cb.y;
    if (dx * dx + dy * dy > 1000 * 1000) {
      return false;
    }
    return this.world.hasLineOfSight(ca.x, ca.y, cb.x, cb.y);
  }

  // Whether `a` could walk straight to `b`: sight carries over water, lava
  // and chasms, feet do not.
  hasWalkingLine(a, b) {
    const pf = this.world.pathfinder;
    const ca = a.center();
    const cb = b.center();
    return pf.isSegmentClear(ca.x, ca.y, cb.x, cb.y, pf.radiusForSize(a.size.x, a.size.y));
  }

  // Called by every enemy each step with its own line-of-sight result.
  // Returns whether the enemy should be hunting the player.
  updateAggro(enemy, player, hasSight) {
    if (this.duelMode) {
      return true;
    }
    const hurt = enemy._lastHp !== undefined && enemy.hp < enemy._lastHp;
    enemy._lastHp = enemy.hp;
    if (!player || player.invis || player.dead) {
      // invisibility shakes off every pursuer
      enemy.aggro = false;
      return false;
    }
    const distance = enemy.distanceTo(player);
    const sight = enemy.sightRange || this.aggroSightRange;
    if (hurt || distance < this.aggroHearRange || (hasSight && (enemy.aggro || distance < sight))) {
      this.alertEnemy(enemy, true);
    } else if (enemy.aggro && this.navFrame - enemy._aggroFrame > this.aggroMemoryFrames) {
      // lost track of the player: give up and head home
      enemy.aggro = false;
      enemy._wander = null;
    }
    return !!enemy.aggro;
  }

  alertEnemy(enemy, rally) {
    const wasAggro = enemy.aggro;
    enemy.aggro = true;
    enemy._aggroFrame = this.navFrame;
    enemy._wander = null;
    if (wasAggro || !rally) {
      return;
    }
    // war cry: allies who can see this one join the hunt
    const c = enemy.center();
    this.fx.emit(c.x, c.y, enemy.rig ? enemy.rig.height + 0.6 : 3, { color: 0xff3020, life: 0.7, size: 1.6, vy: 1 });
    for (const other of this.floorEnemies()) {
      if (other !== enemy && !other.aggro && other.distanceTo(enemy) < this.aggroCallRange && this.hasRoomLineOfSight(other, enemy)) {
        this.alertEnemy(other, false);
      }
    }
  }

  // Unaware enemies stand guard and now and then stroll around their home
  // room. Strolls use the same wall-safe navigation as chasing.
  idleEntity(enemy) {
    const wander = enemy._wander;
    if (wander) {
      const center = enemy.center();
      const dx = wander.pos.x + 1 - center.x;
      const dy = wander.pos.y + 1 - center.y;
      if (dx * dx + dy * dy > 24 * 24 && this.navFrame < wander.until &&
        this.navigateEntityToward(enemy, wander, enemy.desiredVel * 0.45, 600)) {
        return;
      }
      enemy._wander = null;
    }
    enemy.vel.x = 0;
    enemy.vel.y = 0;
    if (this.navFrame < (enemy._idleUntil || 0)) {
      return;
    }
    enemy._idleUntil = this.navFrame + randInt(120, 420);
    if (Math.random() < 0.4) {
      return;
    }
    if (enemy.homeRoom === undefined || enemy.homeRoom === null) {
      const home = enemy.center();
      enemy.homeRoom = this.world.getRoomIndexForWorldPoint(home.x, home.y);
    }
    const room = this.world.rooms[enemy.homeRoom];
    if (!room) {
      return;
    }
    const spot = this.world.getRoomSpawnPoint(room, 3, enemy.size.x);
    const wanderTarget = {
      id: 'wander' + enemy.id,
      pos: { x: spot.x + enemy.size.x / 2 - 1, y: spot.y + enemy.size.y / 2 - 1 },
      size: { x: 2, y: 2 },
      until: this.navFrame + 720,
      center() {
        return { x: this.pos.x + 1, y: this.pos.y + 1 };
      }
    };
    enemy._wander = wanderTarget;
  }

  steerEntityToward(entity, worldX, worldY, speed) {
    const center = entity.center();
    const dx = worldX - center.x;
    const dy = worldY - center.y;
    const distance = Math.sqrt(dx * dx + dy * dy);
    if (distance < 2) {
      entity.vel.x = 0;
      entity.vel.y = 0;
      return false;
    }
    const moveSpeed = Math.min(speed || entity.desiredVel || 80, entity.maxSpeed || Infinity);
    entity.vel.x = (dx / distance) * moveSpeed;
    entity.vel.y = (dy / distance) * moveSpeed;
    return true;
  }

  // Chase a moving target. Walks straight at it when the way is clear,
  // otherwise follows a flow field shared by everyone chasing that target.
  // Routes keep one spare tile between body and walls when they can.
  navigateEntityToward(entity, target, speed, repathFrames) {
    const pf = this.world.pathfinder;
    if (!entity || !target) {
      return false;
    }
    const fit = pf.radiusForSize(entity.size.x, entity.size.y);
    const center = entity.center();
    const targetCenter = target.center();
    const tile = pf.worldToTile(center.x, center.y);
    const targetTile = pf.worldToTile(targetCenter.x, targetCenter.y);
    if (!pf.isPassable(tile.x, tile.y, fit)) {
      // knocked too close to a wall: step back into open space first
      const recover = pf.findNearestPassable(tile.x, tile.y, fit, 3);
      if (!recover) {
        return false;
      }
      const recoverWorld = pf.tileToWorldCenter(recover.x, recover.y);
      return this.steerEntityToward(entity, recoverWorld.x, recoverWorld.y, speed);
    }
    for (const radius of [fit + 1, fit]) {
      if (pf.isSegmentClear(center.x, center.y, targetCenter.x, targetCenter.y, radius)) {
        return this.steerEntityToward(entity, targetCenter.x, targetCenter.y, speed);
      }
      const field = pf.getField('chase:' + target.id + ':' + radius, targetTile, radius, repathFrames);
      if (!pf.isPassable(tile.x, tile.y, radius)) {
        // hugging a wall: drift onto a roomier tile if one leads to the target
        const roomy = pf.findNearestPassable(tile.x, tile.y, radius, 2);
        if (roomy && pf.fieldDistance(field, roomy) < Infinity) {
          const roomyWorld = pf.tileToWorldCenter(roomy.x, roomy.y);
          if (pf.isSegmentClear(center.x, center.y, roomyWorld.x, roomyWorld.y, fit)) {
            return this.steerEntityToward(entity, roomyWorld.x, roomyWorld.y, speed);
          }
        }
        continue;
      }
      if (pf.fieldDistance(field, tile) === Infinity) {
        continue;
      }
      const step = pf.nextStepFromField(field, center.x, center.y, radius, 10);
      if (!step) {
        // as close as this body can get (target is hugging a wall)
        entity.vel.x = 0;
        entity.vel.y = 0;
        return true;
      }
      const stepWorld = pf.tileToWorldCenter(step.x, step.y);
      return this.steerEntityToward(entity, stepWorld.x, stepWorld.y, speed);
    }
    return false;
  }

  updateCurrentRoom(player) {
    const c = player.center();
    const index = this.world.getRoomIndexForWorldPoint(c.x, c.y);
    if (index === this.currentRoomIndex) {
      return;
    }
    this.currentRoomIndex = index;
    if (index >= 0 && !this.world.rooms[index].visited) {
      this.world.rooms[index].visited = true;
      if (this.hud.minimap) {
        this.hud.minimap.render();
      }
    }
  }

  // --------------------------------------------------------------- effects

  healFx(target) {
    const c = target.center();
    this.fx.column(c.x, c.y, 30, { color: [0x60ff80, 0xc0ffc0], count: 22, rise: 2.4, life: 0.9, size: 0.8 });
    this.fx.ring(c.x, c.y, { color: 0x60ff80, radius: 50, life: 0.5 });
  }

  deathFx(entity, light) {
    const c = entity.center();
    if (light) {
      // battles: thousands fall, so a little spray each
      this.fx.burst(c.x, c.y, 1.2, { color: [0x8a1010, 0xd02020], count: 8, speed: 4, life: 0.5, size: 1, gravity: 9, lift: 2 });
      return;
    }
    const big = entity.size.x > 48 ? 2 : 1;
    this.fx.burst(c.x, c.y, 1.2 * big, { color: [0x8a1010, 0xd02020, 0x401010], count: 40 * big, speed: 5 * big, life: 0.7, size: 1.1 * big, gravity: 9, lift: 2 });
    this.fx.burst(c.x, c.y, 0.5, { color: 0x403830, count: 16 * big, speed: 2 * big, life: 1.2, size: 2 * big, flat: true, drag: 3 });
  }

  pickupFx(item, color) {
    const c = item.center();
    this.fx.column(c.x, c.y, 24, { color: [color, 0xffffff], count: 26, rise: 3, life: 0.8, size: 0.7 });
    this.fx.ring(c.x, c.y, { color, radius: 40, life: 0.4 });
  }

  skullFx(x, y, radius = 150) {
    this.fx.burst(x, y, 1.6, { color: [0x9a0a2a, 0xff2050, 0x200008], count: 50, speed: 6, life: 0.8, size: 1.3 });
    this.fx.ring(x, y, { color: 0xff2050, radius, life: 0.5 });
    this.gfx.flash(x, y, 2, 0xff1040, 60, 0.4);
    this.gfx.addShake(0.35);
  }

  onTimestop() {
    this.hud.timestopFlash();
  }

  // --------------------------------------------------------------- outcomes

  // The wizard fell, on a dungeon floor or in a trial: the run is over.
  onPlayerDeath(player) {
    if (this.state !== 'playing') {
      return;
    }
    const c = player.center();
    this.deathFx(player);
    this.state = 'over';
    this.fx.burst(c.x, c.y, 1.4, { color: 0x6aa8ff, count: 60, speed: 6, life: 1.2, size: 1.2 });
    const where = (this.trial ? 'Slain by your reflection below depth ' : 'Fell on depth ') + this.depth + ' of ' + DungeonLevels.count + ' :: ' + this.stageName();
    this.saveGame(player).then((msg) => {
      this.hud.showEnd({
        title: 'YOU DIED',
        text: where,
        stats: this.stats,
        saved: msg,
        time: player.timePlayed
      });
    });
  }

  onVictory() {
    if (this.state !== 'playing') {
      return;
    }
    this.state = 'over';
    this.stats.wincount++;
    this.saveGame(this.player).then((msg) => {
      this.hud.showEnd({
        title: 'VICTORY',
        text: 'You slew the great golden wyrm and escaped the end of the world.',
        stats: this.stats,
        saved: msg,
        time: this.player.timePlayed,
        win: true
      });
    });
  }

  // The reflection fell.
  onDuelVictory() {
    if (this.battle) {
      this.battle.onWizardDown();
      return;
    }
    this.winTrial('Your reflection fell.');
  }

  // A trial won: the wizard takes one of the spoils (mirror.js), then goes on
  // down the stairs.
  winTrial(why) {
    if (this.state !== 'playing') {
      return;
    }
    this.state = 'intermission';
    const player = this.player;
    const spoils = rollSpoils(player, this.depth);
    this.hud.showTrialEnd({
      won: true,
      title: this.battle ? 'BATTLE WON' : 'DUEL WON',
      text: why,
      choices: spoils.map((id) => ({ id, name: spoilName(player, id) })),
      onPick: (id) => {
        if (id) {
          this.hud.toast(studySpell(player, id), '#ffd040');
        }
        this.descend();
      }
    });
  }

  // A battle lost with the wizard still standing: on down the stairs, without
  // the spoils.
  loseTrial(why) {
    if (this.state !== 'playing') {
      return;
    }
    this.state = 'intermission';
    this.hud.showTrialEnd({
      won: false,
      title: 'BATTLE LOST',
      text: why + ' You escape down the stairs, without the spoils.',
      choices: [],
      onPick: () => this.descend()
    });
  }

  // Posts the run to the backend like the 2D game did; works without one.
  async saveGame(player) {
    const body = new URLSearchParams();
    for (const key of STAT_KEYS) {
      body.set(key, String(this.stats[key]));
    }
    body.set('timeplayed', String(Math.round(player ? player.timePlayed : 0)));
    try {
      const res = await fetch('/gamestates/gamesave', { method: 'POST', body, credentials: 'same-origin' });
      if (!res.ok) {
        return null;
      }
      return (await res.text()).trim();
    } catch {
      return null;
    }
  }

  // --------------------------------------------------------------- loop

  // The inventory screen (ui/inventory.js) holds the game still while open.
  // `tab` is 'gear' or 'spells' (the spellbook).
  toggleInventory(open = !this.inventoryOpen, tab = 'gear') {
    if (open && (this.state !== 'playing' || this.paused || !this.player || this.player.dead || !this.player.inventory)) {
      return;
    }
    this.inventoryOpen = open;
    this.hud.showInventory(open, tab);
    if (!open) {
      // clicks on the screen must not turn into spells when play resumes
      this.input.queued.clear();
    }
  }

  // The spellbook key opens the inventory on the spellbook, or closes it.
  toggleSpellbook() {
    if (this.inventoryOpen && this.hud.inventoryScreen.tab === 'spells') {
      this.toggleInventory(false);
    } else {
      this.toggleInventory(true, 'spells');
    }
  }

  // ------------------------------------------------------------ experience

  // A foe fell on a dungeon floor: experience for the kill (spellbar.js
  // WizardLevels), and whatever the mage's gear gives back for one, up to
  // the maximum (never taking away what a potion put above it). Trials give
  // none; their reward is the spoils.
  onEnemySlain(enemy) {
    const player = this.player;
    if (!this.duelMode && player && !player.dead) {
      player.gainXp(WizardLevels.xpFor(enemy) * (1 + player.bonus('xpGain')));
      player.hp = Math.max(player.hp, Math.min(player.maxHp, player.hp + player.bonus('killHeal')));
      player.manergy = Math.max(player.manergy, Math.min(player.maxManergy, player.manergy + player.bonus('killManergy')));
    }
  }

  onPlayerLevel(player, opened) {
    // touch screens have no keys to name
    const keys = isTouch() ? [] : opened.map((i) => actionKeyLabel(BarSlots[i].action));
    this.hud.toast('LEVEL ' + player.level + ' :: +' + WizardLevels.hp + ' HP :: +' + WizardLevels.manergy + ' MANERGY', '#ffd040');
    if (keys.length) {
      this.hud.toast('NEW SPELL SLOT :: ' + keys.join(' '), '#ffd040');
    } else if (opened.length) {
      this.hud.toast(opened.length === 1 ? 'NEW SPELL SLOT' : opened.length + ' NEW SPELL SLOTS', '#ffd040');
    }
    const c = player.center();
    this.fx.column(c.x, c.y, 26, { color: [0xffd040, 0xfff0c0], count: 40, rise: 3, life: 0.9, size: 0.8 });
    this.fx.ring(c.x, c.y, { color: 0xffd040, radius: 70, life: 0.5 });
  }

  setPaused(paused) {
    if (this.state !== 'playing') {
      return;
    }
    if (paused && this.inventoryOpen) {
      this.toggleInventory(false);
    }
    this.paused = paused;
    this.hud.showPause(paused);
  }

  step() {
    this.input.beginStep();
    this.navFrame++;
    this.time.update();
    const player = this.player;
    const count = this.entities.length;
    for (let i = 0; i < count; i++) {
      const e = this.entities[i];
      if (!e.killed) {
        e.update(this.time.factorFor(e));
      }
    }
    const before = this.entities.length;
    this.entities = this.entities.filter((e) => {
      if (e.killed) {
        e.dispose();
        return false;
      }
      return true;
    });
    if (before !== this.entities.length && this.rival && this.rival.killed) {
      this.rival = null;
    }
    if (this.bannerFrames > 0) {
      this.bannerFrames--;
    }
    if (this.duelMode) {
      if (player) {
        this.updateCurrentRoom(player);
      }
      if (this.duelLoot) {
        this.duelLoot.update();
      }
      if (this.battle) {
        this.battle.update();
      }
      return;
    }
    if (!player) {
      return;
    }
    if (this.descendRequested) {
      this.descend();
      return;
    }
    this.updateCurrentRoom(player);
    this.floorSlain = Math.max(0, this.levelEnemyTotal - this.floorEnemies().length);
  }

  frame(now) {
    this.frameHandle = requestAnimationFrame((t) => this.frame(t));
    const dt = Math.min(0.1, (now - this.last) / 1000);
    this.last = now;
    if (this.input.consume('inventory')) {
      // the inventory key closes the spellbook as well
      this.toggleInventory(!this.inventoryOpen, 'gear');
    }
    if (this.input.consume('spellbook')) {
      this.toggleSpellbook();
    }
    if (this.input.consume('pause')) {
      // Esc closes the inventory before it pauses
      if (this.inventoryOpen) {
        this.toggleInventory(false);
      } else {
        this.setPaused(!this.paused);
      }
    }
    if (this.input.consume('map')) {
      this.hud.toggleMap();
    }
    if (this.input.consume('loot_names')) {
      this.hud.lootNames = !this.hud.lootNames;
      this.hud.toast(this.hud.lootNames ? 'ITEM NAMES SHOWN' : 'ITEM NAMES ONLY UNDER THE CURSOR', '#f3e6c4');
    }
    this.gfx.zoomBy(this.input.takeWheel());
    this.turnCamera(dt);
    // a touch screen aims by itself or by finger (ui/touch.js); else the
    // ground under the mouse is the aim
    if (!this.touch.update() && (this.input.mouse.inside || this.input.mouse.x || this.input.mouse.y)) {
      const g = this.gfx.pickGround(this.input.mouse);
      if (g) {
        this.input.ground.x = g.x;
        this.input.ground.y = g.y;
      }
    }
    if (!this.paused && !this.inventoryOpen && this.state === 'playing') {
      this.acc += dt;
      let steps = 0;
      // a step that ends the stage (a trial won, the wizard fallen) is the last
      while (this.acc >= STEP && steps < 5 && this.state === 'playing') {
        this.step();
        this.acc -= STEP;
        steps++;
      }
      if (steps === 5) {
        this.acc = 0;
      }
    } else if (this.state !== 'playing') {
      // keep the world alive behind the end screen
      this.acc = 0;
    }
    this.elapsed += dt;
    this.render(dt);
  }

  // The camera turns while its drag button is held and the mouse moves,
  // while a finger drags across the view of a touch screen, or while a turn
  // key is held; it stays where it was left, except that on a touch screen
  // it swings round behind the wizard as it walks (touch.js followYaw).
  turnCamera(dt) {
    const input = this.input;
    const look = input.takeLook();
    const drag = CAMERA_DRAG * setting('cameraDrag');
    const turn = CAMERA_TURN * setting('cameraTurn');
    const finger = this.touch.takeLook();
    const touchDrag = CAMERA_DRAG * TOUCH_TURN * setting('touchTurn');
    // commander mode: a left-button drag selects regiments instead
    let yaw = this.battle && this.battle.drag ? 0 : -look.x * drag;
    let pitch = this.battle && this.battle.drag ? 0 : look.y * drag * 0.7;
    yaw -= finger.x * touchDrag;
    pitch += finger.y * touchDrag * 0.7;
    // and on a touch screen it follows behind the walking wizard
    yaw += this.touch.followYaw(dt);
    if (input.held.has('camera_left')) { yaw += turn * dt; }
    if (input.held.has('camera_right')) { yaw -= turn * dt; }
    this.gfx.rotate(yaw, pitch);
    if (input.consume('camera_reset')) {
      this.gfx.resetView();
    }
  }

  render(dt) {
    const time = this.elapsed;
    if (this.army) {
      this.army.begin();
    }
    for (const e of this.entities) {
      // instanced battle orcs and batched bolts have no view of their own
      // but still pose
      if (e.view || e.instance || e.batched) {
        e.syncView(time, dt);
      }
    }
    if (this.battle) {
      this.battle.syncMarkers(time);
    }
    if (this.army) {
      this.army.flush();
    }
    if (this.bolts) {
      this.bolts.flush();
    }
    const player = this.player;
    let focus = player ? player.center() : { x: 0, y: 0 };
    if (this.battle && this.battle.commander) {
      // commander mode: the camera roams free of the wizard
      focus = this.battle.cam;
    }
    this.updateCursor(time);
    this.gfx.render(this.paused ? 0 : dt, time, focus.x, focus.y, false);
    this.hud.update(dt);
  }

  updateCursor(time) {
    const g = this.input.ground;
    this.cursor.position.set(g.x / TILE, 0, g.y / TILE);
    const ring = this.cursor.userData.ring;
    const touch = isTouch();
    const hostile = this.player && this.hoveredHostile();
    const item = !hostile && this.player && this.hoveredItem();
    // commander mode: the cursor lights up blue over your own regiments
    const own = !hostile && !touch && this.battle && this.battle.commander && this.battle.unitAt(this.input.mouse, 'player');
    ring.material.color.setHex(hostile ? 0xff4040 : (item ? 0xffd060 : (own ? 0x6aa8ff : 0xffffff)));
    const s = hostile || item || own ? 1.6 + Math.sin(time * 8) * 0.1 : 1;
    ring.scale.set(s, s, s);
    ring.rotation.z = time;
    // on a touch screen it marks what the wizard aims at
    this.cursor.visible = (touch ? this.touch.cursorShown : this.input.mouse.inside) && this.state === 'playing';
  }

  dispose() {
    cancelAnimationFrame(this.frameHandle);
    for (const e of this.entities) {
      e.dispose();
    }
    this.entities = [];
    if (this.battle) {
      this.battle.dispose();
    }
    if (this.army) {
      this.army.dispose();
    }
    if (this.bolts) {
      this.bolts.dispose();
    }
    this.input.dispose();
    this.touch.dispose();
    this.hud.dispose();
    this.gfx.dispose();
  }
}
