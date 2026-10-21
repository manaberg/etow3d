import { STEP, TILE, randInt } from './core/constants.js';
import { Input } from './core/input.js';
import { TimeSlower } from './core/timeslower.js';
import { World } from './world/world.js';
import { DungeonLevels } from './world/levels.js';
import { Gfx } from './render/renderer.js';
import { buildCursor } from './render/models.js';
import { Mage } from './entities/mage.js';
import { Orc } from './entities/orc.js';
import { Clericorc, Mageorc, Boss } from './entities/bosses.js';
import { DuelWizard } from './entities/duelWizard.js';
import { DuelRules } from './entities/duelRules.js';
import { Zone, MirrorImage } from './entities/spells.js';
import { Scroll, Potion, Ring, Stairs } from './entities/items.js';
import { DuelLoot } from './entities/duelLoot.js';
import { Battle } from './entities/battle.js';
import { Soldier } from './entities/soldier.js';
import { Hud } from './ui/hud.js';

// Power word kill: damage to the target (at least its own pwkillDamage) and to
// every orc within the splash radius around it.
const PWKILL = {
  tier1: { target: 175, splash: 175, radius: 150 },
  tier2: { target: 300, splash: 230, radius: 230 }
};

const STAT_KEYS = [
  'wincount', 'killcount', 'bosscount', 'micount', 'fbcount', 'lgcount', 'iscount', 'bzcount', 'bkcount',
  'hscount', 'tscount', 'shcount', 'lscount', 'imcount', 'fecount', 'incount', 'crcount', 'tlcount', 'pwkcount',
  'bluepotcount', 'redpotcount', 'scrollcount', 'orccount', 'knightcount', 'shamancount'
];

export class Game {
  constructor({ container, hudRoot, mode, difficulty, rules, onExit }) {
    this.mode = mode;
    // battles are duels between two wizards with armies: they share the duel
    // rules (spell damage, global cooldown, the rival's brain and HUD panel)
    this.battleMode = mode === 'battle';
    this.duelMode = mode === 'duel' || this.battleMode;
    this.battle = null;
    this.difficulty = difficulty || 'hard';
    // duels are progressive (start with one spell, loot the rest) unless classic
    this.progressive = mode === 'duel' && rules !== 'classic';
    this.duelLoot = null;
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
    // enemies idle until they see, hear or get hit by the player
    this.aggroSightRange = 460;
    this.aggroHearRange = 130;
    this.aggroMemoryFrames = 480;
    this.aggroCallRange = 320;

    this.cursor = buildCursor();
    this.gfx.add(this.cursor);

    if (this.battleMode) {
      this.battle = new Battle(this);
      this.battle.startRound();
    } else if (this.duelMode) {
      this.startDuel();
    } else {
      this.startFloor(null);
    }
    this.hud.build();
    if (this.battle) {
      this.hud.onBattleRound(this.battle);
    }

    this.last = performance.now();
    this.acc = 0;
    this.elapsed = 0;
    this.frameHandle = requestAnimationFrame((t) => this.frame(t));
  }

  // --------------------------------------------------------------- floors

  // `options` overrides the map size and layout (battlefields).
  buildWorld(options) {
    for (const e of this.entities) {
      e.dispose();
    }
    this.entities = [];
    this.player = null;
    const plan = DungeonLevels.getPlan(this.depth);
    // survival floors grow with depth; duels get a compact dungeon of six
    // rooms, big enough to hide, flank and race for loot
    if (!options) {
      options = this.duelMode
        ? { cols: 56, rows: 38, roomCount: 6 }
        : { cols: 34 + plan.rooms * 4, rows: 22 + plan.rooms * 3, roomCount: plan.rooms };
    }
    this.world = new World(options, () => this.navFrame);
    this.gfx.buildLevel(this.world, this.battleMode);
    this.currentRoomIndex = -1;
  }

  // Builds the current depth's dungeon, places the player (carrying over
  // spells, rings and stats from the floor above) and populates it.
  startFloor(carry) {
    this.buildWorld();
    this.stairs = null;
    this.descendRequested = false;
    const spawn = this.world.getRoomSpawnPoint(this.world.getMainRoom(), 4);
    const player = this.spawn(Mage, spawn.x, spawn.y);
    this.player = player;
    if (carry) {
      Object.assign(player, carry);
    }
    this.populateFloor(DungeonLevels.getPlan(this.depth), player);
    this.floorSlain = 0;
    this.bannerFrames = 240;
    this.hud.onFloorChanged();
    return player;
  }

  startDuel() {
    this.buildWorld();
    // the duelists start in the two rooms farthest apart; no stairs, and the
    // whole (small) map is known from the start
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
    const player = this.spawn(Mage, ps.x, ps.y);
    this.player = player;
    this.configureDuelPlayer(player);
    const rs = this.world.getRoomSpawnPoint(rooms[pair[1]], 3);
    this.rival = this.spawn(DuelWizard, rs.x, rs.y, { difficulty: this.difficulty });
    if (this.progressive) {
      this.duelLoot = new DuelLoot(this);
      this.duelLoot.setup(player, this.rival);
    }
    this.duelWinnerDeclared = false;
  }

  configureDuelPlayer(player) {
    const flags = [
      'hasFireball', 'hasFb2', 'hasLightning', 'hasLg2', 'hasIronshot', 'hasIs2', 'hasBlink', 'hasBk2', 'hasTimestop',
      'hasShield', 'hasHaste', 'hasStun', 'hasImage', 'hasBlizzard', 'hasBz2', 'hasRay', 'hasInvis', 'hasFear',
      'hasPwkill', 'hasPwk2', 'hasTele', 'hasMrring', 'hasSpring', 'hasFrring', 'hasElring', 'hasMsring'
    ];
    for (const flag of flags) {
      player[flag] = true;
    }
    player.is2Charges = 3;
    // the rival moves at 120, the duel player's 100 with the ring of speed
    player.desiredVel = 100;
    player.hp = player.maxHp = DuelRules.hp;
    player.stunDuration = DuelRules.stunFrames;
    player.fearDuration = DuelRules.fearFrames;
    player.manergy = player.maxManergy;
  }

  snapshotPlayer(player) {
    const carry = {};
    for (const key of Object.keys(player)) {
      // spellbook and ring flags (hasFireball, hasMsring...)
      if (/^has[A-Z]/.test(key)) {
        carry[key] = player[key];
      }
    }
    for (const key of ['hp', 'manergy', 'maxManergy', 'is2Charges', 'timePlayed']) {
      carry[key] = player[key];
    }
    return carry;
  }

  requestDescend() {
    this.descendRequested = true;
  }

  descend() {
    const carry = this.snapshotPlayer(this.player);
    // a breather on the stairs: full manergy and a little health
    carry.manergy = carry.maxManergy;
    carry.hp += 30;
    this.depth = Math.min(DungeonLevels.count, this.depth + 1);
    this.time = new TimeSlower();
    this.startFloor(carry);
  }

  getKillsToUnseal() {
    const needed = Math.ceil(this.levelEnemyTotal * DungeonLevels.unlockShare);
    return Math.max(0, needed - this.floorSlain);
  }

  isStairsOpen() {
    return !!this.stairs && this.getKillsToUnseal() === 0;
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

  spawnOrcPack(plan, roomIndex, count) {
    const room = this.world.rooms[roomIndex];
    for (let i = 0; i < count; i++) {
      const spot = this.world.getRoomSpawnPoint(room, 2);
      this.spawn(Orc, spot.x, spot.y, {
        orcClass: DungeonLevels.pickClass(plan),
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
    total += this.spawnOrcPack(plan, stairsRoom, guards);
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
    if (plan.boss) {
      const spot = world.getRoomSpawnPoint(rooms[stairsRoom], 4, 96);
      this.spawn(Boss, spot.x, spot.y, { homeRoom: stairsRoom });
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

  // The floor's dark wizard, in a lair room, with a fresh random spellbook.
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
      homeRoom: roomIndex,
      label: 'DARK WIZARD'
    });
    const pool = Object.keys(wizard.spellBook).filter((s) => s !== 'missile');
    wizard.known = new Set();
    for (let n = Math.min(pool.length, rules.spells(this.depth)); n > 0; n--) {
      wizard.known.add(pool.splice(randInt(0, pool.length - 1), 1)[0]);
    }
    return 1;
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
  }

  dropPotion(from, settings = {}) {
    return this.spawn(Potion, from.pos.x + from.size.x / 2 - 24, from.pos.y + from.size.y / 2 - 24, settings);
  }

  dropScroll(from, tier, offset = 0) {
    return this.spawn(Scroll, from.pos.x + from.size.x / 2 - 24 + offset, from.pos.y + from.size.y / 2 - 24 + offset, { tier });
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
    return this.entities.filter((e) => !e.killed && (e instanceof Orc || e instanceof Clericorc || e instanceof Mageorc || e instanceof Boss || e instanceof DuelWizard));
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
    if (team === 'player') {
      return this.entities.filter((e) => !e.killed && (
        e instanceof Orc || e instanceof Clericorc || e instanceof Mageorc || e instanceof Boss || e instanceof DuelWizard ||
        (e instanceof MirrorImage && e.source !== this.player) || (e instanceof Soldier && e.side === 'enemy')
      ));
    }
    return this.entities.filter((e) => !e.killed && (
      e === this.player || (e instanceof MirrorImage && e.source === this.player) || (e instanceof Soldier && e.side === 'player')
    ));
  }

  firstImage() {
    return this.entities.find((e) => e instanceof MirrorImage && !e.killed && e.source === this.player) || null;
  }

  nearestHostile(from, range) {
    let best = null;
    let bestDistance = range;
    for (const e of this.hostilesOf('player')) {
      const d = from.distanceTo(e);
      if (d < bestDistance) {
        bestDistance = d;
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

  hoveredItem() {
    const g = this.input.ground;
    return this.entities.find((e) => !e.killed && (e instanceof Scroll || e instanceof Potion || e instanceof Ring) && e.containsPoint(g.x, g.y, 14)) || null;
  }

  // Slow factor from the zones covering an entity (blizzards of the other side).
  zoneSlow(entity) {
    let slow = 1;
    const friendlyTeam = entity === this.player || (entity instanceof MirrorImage && entity.source === this.player) ? 'player' : 'enemy';
    for (const e of this.entities) {
      if (e instanceof Zone && !e.killed && e.kind === 'blizzard' && e.team !== friendlyTeam && e.covers(entity)) {
        slow = Math.min(slow, entity.slowIn ? entity.slowIn(e) : 0.5);
      } else if (e instanceof Zone && !e.killed && e.kind === 'guardians' && e.team !== friendlyTeam && e.covers(entity)) {
        slow = Math.min(slow, 0.6);
      }
    }
    return slow;
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
        orc.hurt(spec.splash);
      }
    }
    if (target instanceof DuelWizard) {
      DuelRules.applyHit(target, 'pwkill', this.player);
      return;
    }
    target.hurt(Math.max(target.pwkillDamage, spec.target));
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

  deathFx(entity) {
    const c = entity.center();
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

  onPlayerDeath(player) {
    if (this.state !== 'playing') {
      return;
    }
    const c = player.center();
    this.deathFx(player);
    if (this.battle) {
      // losing your wizard loses this battle, not the match
      this.battle.onWizardDown('player');
      return;
    }
    this.state = 'over';
    if (this.duelMode) {
      this.hud.showEnd({ title: 'DUEL LOST', text: 'The rival wizard (' + this.difficulty.toUpperCase() + ') defeated you.', stats: this.stats, duel: true });
      return;
    }
    this.fx.burst(c.x, c.y, 1.4, { color: 0x6aa8ff, count: 60, speed: 6, life: 1.2, size: 1.2 });
    this.saveGame(player).then((msg) => {
      this.hud.showEnd({
        title: 'YOU DIED',
        text: 'Fell on depth ' + this.depth + ' of ' + DungeonLevels.count + ' :: ' + DungeonLevels.getPlan(this.depth).name,
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
        text: 'You slew the warlord and escaped the end of the world.',
        stats: this.stats,
        saved: msg,
        time: this.player.timePlayed,
        win: true
      });
    });
  }

  onDuelVictory() {
    if (this.battle) {
      this.battle.onWizardDown('enemy');
      return;
    }
    if (this.duelWinnerDeclared) {
      return;
    }
    this.duelWinnerDeclared = true;
    this.state = 'over';
    this.stats.wincount++;
    this.hud.showEnd({ title: 'DUEL WON', text: 'You defeated the rival wizard (' + this.difficulty.toUpperCase() + ').', stats: this.stats, duel: true, win: true });
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

  setPaused(paused) {
    if (this.state !== 'playing') {
      return;
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
    if (this.bannerFrames > 0) {
      this.bannerFrames--;
    }
  }

  frame(now) {
    this.frameHandle = requestAnimationFrame((t) => this.frame(t));
    const dt = Math.min(0.1, (now - this.last) / 1000);
    this.last = now;
    if (this.input.consume('pause')) {
      this.setPaused(!this.paused);
    }
    if (this.input.consume('map')) {
      this.hud.toggleMap();
    }
    this.gfx.zoomBy(this.input.takeWheel());
    if (this.input.mouse.inside || this.input.mouse.x || this.input.mouse.y) {
      const g = this.gfx.pickGround(this.input.mouse);
      if (g) {
        this.input.ground.x = g.x;
        this.input.ground.y = g.y;
      }
    }
    if (!this.paused && this.state === 'playing') {
      this.acc += dt;
      let steps = 0;
      while (this.acc >= STEP && steps < 5) {
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

  render(dt) {
    const time = this.elapsed;
    for (const e of this.entities) {
      // instanced battle orcs have no view of their own but still pose
      if (e.view || e.instance) {
        e.syncView(time, dt);
      }
    }
    if (this.battle) {
      this.battle.syncMarkers(time);
    }
    if (this.army) {
      this.army.flush();
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
    const hostile = this.player && this.hoveredHostile();
    const item = !hostile && this.player && this.hoveredItem();
    // commander mode: the cursor lights up blue over your own regiments
    const own = !hostile && this.battle && this.battle.commander && this.battle.unitAt(this.input.mouse, 'player');
    ring.material.color.setHex(hostile ? 0xff4040 : (item ? 0xffd060 : (own ? 0x6aa8ff : 0xffffff)));
    const s = hostile || item || own ? 1.6 + Math.sin(time * 8) * 0.1 : 1;
    ring.scale.set(s, s, s);
    ring.rotation.z = time;
    this.cursor.visible = this.input.mouse.inside && this.state === 'playing';
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
    this.input.dispose();
    this.hud.dispose();
    this.gfx.dispose();
  }
}
