import { Enemy } from './enemy.js';
import { Projectile, Zone, MirrorImage, BoltKinds, castMissiles, missileTier, staffHead } from './spells.js';
import { DuelRules } from './duelRules.js';
import { Arcana, ArcanaCast, FlamingSphere, Meteor, arcanaZoneDamage, liftHeight, pullToward } from './arcana.js';
import { arcanaFx } from './enemy.js';
import { syncSheep } from './mage.js';
import { buildMage } from '../render/models.js';
import { Kits, outfit } from './gear.js';
import { TILE, UNIT } from '../core/constants.js';
import { GLOBAL_COOLDOWN, rankCooldown, rankPower } from './spellbar.js';

// An invisible player: it notices them only within `near` px (centre to
// centre, about a stride apart), and otherwise searches around where it last
// knew them, ever less sure of the spot: within `start` px at first, `grow`
// px more each frame unseen, up to `max`, picking a new spot every `every`
// frames. It fires blind only for `blind` frames after it last knew the
// spot; a spell the player casts gives the spot again.
const SEARCH = { near: 72, start: 100, grow: 2, max: 200, every: 45, blind: 60 };

// The rival wizard: the player's reflection in the trials (mirror.js). It
// reads every bolt in flight, scores sixteen escape directions a short horizon
// ahead, shields or blinks out of hits it cannot dodge, and learns how far to
// lead its shots from where the player actually went. Duels are fought in a
// small dungeon: it only sees and shoots along clear lines of sight, follows
// the corridors (flow fields) to hunt a player it cannot see, and runs for
// potions when they are worth the trip.
export class DuelWizard extends Enemy {
  defaults() {
    super.defaults();
    this.hp = this.maxHp = DuelRules.hp;
    this.manergy = 100;
    this.maxManergy = 100;
    this.manergyRegen = 0.5;
    this.desiredVel = 120;
    this.isDuelWizard = true;
    this.blizzardSlow = [0.5, 0.5];
    this.difficulty = 'hard';
    // cooldowns and costs mirror the player's duel loadout (all tier 2 spells and rings)
    this.spellBook = {
      missile: { cd: 24, cost: 0, need: 0 },
      fireball: { cd: 48, cost: 20, need: 20 },
      ironshot: { cd: 300, cost: 40, need: 40 },
      lightning: { cd: 200, cost: 35, need: 30 },
      root: { cd: 400, cost: 30, need: 30 },
      blink: { cd: 200, cost: 40, need: 40 },
      shield: { cd: 200, cost: 40, need: 40 },
      haste: { cd: 1000, cost: 70, need: 70 },
      invis: { cd: 1000, cost: 70, need: 70 },
      timestop: { cd: 1000, cost: 70, need: 50 },
      image: { cd: 1000, cost: 50, need: 50 },
      blizzard: { cd: 600, cost: 50, need: 40 },
      fear: { cd: 400, cost: 50, need: 50 },
      pwkill: { cd: 300, cost: 30, need: 50 },
      ray: { cd: 0, cost: 10, need: 10 },
      // the D&D spells (arcana.js)
      scorch: { cd: 90, cost: 25, need: 25 },
      cone: { cd: 240, cost: 35, need: 35 },
      thunder: { cd: 300, cost: 30, need: 30 },
      meteor: { cd: 900, cost: 70, need: 70 },
      guardians: { cd: 1000, cost: 60, need: 60 },
      cloud: { cd: 700, cost: 50, need: 50 },
      heal: { cd: 600, cost: 40, need: 40 },
      polymorph: { cd: 500, cost: 40, need: 40 },
      disintegrate: { cd: 360, cost: 50, need: 50 },
      weapon: { cd: 900, cost: 50, need: 50 },
      sleep: { cd: 600, cost: 30, need: 30 },
      agathys: { cd: 900, cost: 40, need: 40 },
      curse: { cd: 500, cost: 30, need: 30 },
      sphere: { cd: 800, cost: 40, need: 40 },
      counter: { cd: 600, cost: 30, need: 30 },
      swap: { cd: 500, cost: 30, need: 30 },
      phantasm: { cd: 600, cost: 45, need: 45 },
      confusion: { cd: 700, cost: 45, need: 45 },
      maelstrom: { cd: 800, cost: 55, need: 55 },
      gravity: { cd: 900, cost: 70, need: 70 }
    };
    this.shieldDuration = 125;
    this.hasteDuration = 250;
    this.invisDuration = 250;
    this.timestopDuration = 225;
    // preferred distance to the player per tactic
    this.tacticRanges = { kite: 380, engage: 225, punish: 250, pressure: 310, retreat: 520, hunt: 360 };
    this.stunDuration = DuelRules.stunFrames;
    this.fearDuration = DuelRules.fearFrames;
    this.label = 'RIVAL WIZARD';
    // spells it can cast (null knows them all); the reflection is handed a set
    this.known = null;
    // magic missile darts per cast (spells.js MissileTiers); the reflection
    // sets it
    this.missileTier = 3;
    this.isWizard = true;
    // spell ranks (spellbar.js); its tier 2 spells count as rank II
    this.ranks = {};
  }

  init() {
    this.ai = DuelRules.difficulties[this.difficulty] || DuelRules.difficulties.hard;
    this.cdLeft = {};
    for (const spell in this.spellBook) {
      this.cdLeft[spell] = 0;
    }
    this.ironCharges = 2;
    // power word kill being spoken: { left } frames
    this.channel = null;
    this.frame = 0;
    this.acc = 0;
    // short grace period at the start of the duel
    this.castLock = 45;
    // frames each school stays locked after a cast (DuelRules.schools)
    // frames of the global cooldown left (spellbar.js GLOBAL_COOLDOWN)
    this.gcd = 0;
    this.tactic = 'kite';
    this.strafeSign = 1;
    this.strafeTimer = 0;
    this.moveDir = { x: 0, y: 0 };
    this.fearDir = { x: 0, y: 0 };
    this.shieldFrames = 0;
    this.hasteFrames = 0;
    this.invisFrames = 0;
    this.timestopFrames = 0;
    this.rayFrames = 0;
    this.recentDamage = 0;
    this.threats = [];
    this.zones = [];
    this.bestMove = null;
    this.seen = null;
    this.search = null;
    this.target = null;
    this.lastPlayerCastFrame = -1;
    this.decoyId = -1;
    this.decoyFrame = -1;
    this.decoyFooled = false;
    this.newThreat = false;
    this.inSlowZone = false;
    // where the pathfinder says to go (unit vector) and how hard to pull that way
    this.navDir = null;
    this.navPull = 0;
    this.lootGoal = null;
    this.lootValue = 0;
    // lead model: how far ahead of the player to aim, learnt from where the player actually went
    this.leadModel = [{ k: 0, err: 30 }, { k: 0.5, err: 30 }, { k: 1, err: 30 }];
    this.pendingShots = [];
    this.aggro = true;
    this.rig = buildMage({ robe: 0x8a1a1a, hat: 0x2a0a0a, trim: 0xb0b0b0, orb: 0xff5040, beard: 0x404040 });
    this.view = this.rig.root;
    this.game.gfx.add(this.view);
    // the Red Order's kit: the player's apprentice gear in red, same properties
    outfit(this, Kits.rival);
  }

  get shielded() {
    return this.shieldFrames > 0;
  }

  get hasted() {
    return this.hasteFrames > 0;
  }

  get invis() {
    return this.invisFrames > 0;
  }

  // ----------------------------------------------------------------- helpers
  center(entity) {
    const e = entity || this;
    return { x: e.pos.x + e.size.x / 2, y: e.pos.y + e.size.y / 2 };
  }

  knows(spell) {
    return spell === 'missile' || !this.known || this.known.has(spell);
  }

  ready(spell) {
    const book = this.spellBook[spell];
    if (!this.knows(spell) || this.cdLeft[spell] > 0 || this.manergy <= book.need || (spell !== 'missile' && this.gcd > 0)) {
      return false;
    }
    return !(spell === 'ironshot' && this.ironCharges <= 0);
  }

  spend(spell, offensive) {
    this.cdLeft[spell] = spell === 'missile' ? missileTier(this).cd : this.spellBook[spell].cd * rankCooldown(this, spell);
    this.manergy -= this.spellBook[spell].cost;
    if (spell !== 'missile') {
      this.gcd = GLOBAL_COOLDOWN;
    }
    if (offensive) {
      this.castLock = this.ai.castLock;
      // attacking breaks invisibility
      this.invisFrames = 0;
    }
  }

  // Power word kill being spoken, one frame: it stands still; a root, fear or
  // polymorph breaks it off. It lands if the player is still alive, visible
  // and in sight; otherwise it costs nothing but a moment's pause.
  speakWord(player) {
    const game = this.game;
    this.vel.x = 0;
    this.vel.y = 0;
    if (this.isStunned || this.isFeared || this.sheepFrames > 0) {
      this.channel = null;
      this.cdLeft.pwkill = Math.max(this.cdLeft.pwkill, 60);
      return;
    }
    const me = this.center();
    if (Math.random() < 0.6) {
      // the word gathers at the raised staff
      const head = staffHead(this) || { x: me.x, y: me.y, h: 2.2 };
      game.fx.emit(head.x, head.y, head.h, { color: Math.random() < 0.7 ? 0x9a40ff : 0x200830, life: 0.5, size: 0.7, vy: 2 });
    }
    if (--this.channel.left > 0) {
      return;
    }
    this.channel = null;
    const pc = player ? player.center() : null;
    if (!player || player.dead || player.invis || !this.canSee(pc.x, pc.y)) {
      this.cdLeft.pwkill = Math.max(this.cdLeft.pwkill, 60);
      return;
    }
    game.skullFx(pc.x, pc.y);
    DuelRules.applyHit(player, 'pwkill', this);
    this.spend('pwkill', true);
  }

  arenaBounds() {
    if (!this._bounds) {
      const world = this.game.world;
      this._bounds = { left: 0, top: 0, right: world.pixelWidth, bottom: world.pixelHeight };
    }
    return this._bounds;
  }

  spotFree(x, y) {
    return this.game.world.canStandAt(x + 1, y + 1, 46, 46);
  }

  clampToArena(p, margin) {
    const b = this.arenaBounds();
    const m = margin || 24;
    return {
      x: Math.max(b.left + m, Math.min(b.right - m, p.x)),
      y: Math.max(b.top + m, Math.min(b.bottom - m, p.y))
    };
  }

  // open space around a point, from the pathfinder's distance-to-wall map
  wallClearance(cx, cy) {
    const pf = this.game.world.pathfinder;
    const t = pf.worldToTile(cx, cy);
    if (!pf.inBounds(t.x, t.y)) {
      return 0;
    }
    return (pf.clearance[t.y * pf.width + t.x] + 0.5) * TILE;
  }

  canSee(x, y) {
    const me = this.center();
    return this.game.world.hasLineOfSight(me.x, me.y, x, y);
  }

  moveSpeed() {
    let speed = this.desiredVel;
    if (this.hasted) {
      speed *= 2;
    }
    if (this.inSlowZone) {
      speed *= 0.5;
    }
    if (this.chillFrames > 0) {
      speed *= 0.4;
    }
    if (this.sheepFrames > 0) {
      speed *= 0.7;
    }
    return speed;
  }

  // which player spell an entity is, from the ai's point of view
  hostileKind(e) {
    if (!(e instanceof Projectile) || e.team !== 'player') {
      return null;
    }
    return e.kind;
  }

  threatWeight(kind) {
    // a root is worth more than its damage: it sets up the player's whole combo
    if (kind === 'root') {
      return 170;
    }
    return DuelRules.damage[kind] || 20;
  }

  onDuelDamage(dmg) {
    this.recentDamage += dmg;
  }

  // ----------------------------------------------------------------- hits
  takeSpell(p, k) {
    const game = this.game;
    if (this.shielded) {
      // reflect it straight back as one of our own bolts
      p.duel = true;
      p.reflect('enemy');
      return;
    }
    // bolts with no duel number land as they do on any monster
    if (!(p.kind in DuelRules.damage)) {
      super.takeSpell(p, k);
      return;
    }
    p.kill();
    DuelRules.applyHit(this, p.kind, game.player);
    if (p.kind !== 'root') {
      const c = this.center();
      game.fx.burst(c.x, c.y, 1.4, { color: [0xff4040, 0xffffff], count: 14, speed: 4, life: 0.4, size: 0.8 });
    }
  }

  inZone(zone, k) {
    if (zone.kind === 'blizzard') {
      this.zoneHurt((zone.tier ? DuelRules.blizzard2Damage : DuelRules.blizzardDamage) * k, false);
    } else if ((zone.kind === 'guardians' || zone.kind === 'cloud' || zone.kind === 'maelstrom') && zone.timeOwner) {
      this.zoneHurt(arcanaZoneDamage(zone, k), true);
      if (zone.kind === 'maelstrom' && !this.lift) {
        pullToward(this, zone, DuelRules.arcana.maelstrom.pull, k);
      }
    } else if (zone.kind === 'fire') {
      // battles: the ground the player's dragons set burning, as for the mage
      this.zoneHurt(10, true);
      zone.kill();
    } else if (zone.kind === 'cloud' || zone.kind === 'acid' || zone.kind === 'meteors') {
      this.zoneHurt((zone.kind === 'acid' ? 0.35 : zone.kind === 'meteors' ? 0.3 : 0.25) * k, true);
    }
  }

  // Ground damage on the duel scale, after a curse and a ward of frost.
  zoneHurt(dmg, counted) {
    if (this.curseFrames > 0) {
      dmg *= this.curseMult;
    }
    this.hp -= this.soak(dmg);
    if (counted) {
      this.onDuelDamage(dmg);
    }
  }

  // Confusion: it reels about for a moment and its aim goes wild.
  confuse(frames) {
    this.confusedFrames = Math.max(this.confusedFrames, frames);
    this.fearFor(frames);
  }

  // Counterspell: every spell but magic missile waits, and a word being
  // spoken is lost.
  silence(frames) {
    this.gcd = Math.max(this.gcd, frames);
    this.rayFrames = 0;
    if (this.channel) {
      this.channel = null;
      this.cdLeft.pwkill = Math.max(this.cdLeft.pwkill, 60);
    }
    const c = this.center();
    this.game.fx.burst(c.x, c.y, 2.8, { color: [0x9ac8ff, 0xffffff], count: 16, speed: 2, life: 0.6, size: 0.6 });
  }

  // a sheep for a moment: it still runs, but casts nothing
  polymorph(frames) {
    this.sheepFrames = Math.max(this.sheepFrames, frames);
    this.isFeared = false;
  }

  stun(frames) {
    this.isStunned = true;
    this.stunFrames = 0;
    this.stunDuration = frames || DuelRules.stunFrames;
    const c = this.center();
    this.game.fx.column(c.x, c.y, 30, { color: [0x40ff60, 0x20a040], count: 16, rise: 1.2, life: 0.8, size: 0.7 });
  }

  fear() {
    this.isFeared = true;
    this.fearFrames = 0;
  }

  // ----------------------------------------------------------------- main loop
  update(k) {
    const game = this.game;
    const player = game.player;
    // a killing blow landed since its last step: no healing word out of it
    if (this.hp <= 0) {
      this.die();
      return;
    }
    // the brain runs on whole frames, so a time stop slows its thinking too
    this.acc += k;
    const deploying = game.battle && !game.battle.fighting;
    while (this.acc >= 1) {
      this.acc -= 1;
      this.frame++;
      this.tickTimers();
      if (this.channel) {
        this.speakWord(player);
      } else if (player && !player.dead && !deploying) {
        this.inSlowZone = game.zoneSlow(this) < 1;
        this.think(player);
      } else {
        this.vel.x = 0;
        this.vel.y = 0;
      }
    }
    this.move(k);
    this.stepKnock(k);
    if (this.hp <= 0) {
      this.die();
    }
  }

  tickTimers() {
    for (const spell in this.cdLeft) {
      if (this.cdLeft[spell] > 0) {
        this.cdLeft[spell]--;
      }
    }
    if (this.cdLeft.ironshot === 0 && this.ironCharges === 0) {
      this.ironCharges = 2;
    }
    if (this.manergy < this.maxManergy) {
      this.manergy = Math.min(this.maxManergy, this.manergy + this.manergyRegen);
    }
    if (this.shieldFrames > 0) { this.shieldFrames--; }
    if (this.hasteFrames > 0) { this.hasteFrames--; }
    if (this.invisFrames > 0) { this.invisFrames--; }
    if (this.timestopFrames > 0) { this.timestopFrames--; }
    this.tickDebuffs(1);
    if (this.castLock > 0) {
      this.castLock--;
    }
    if (this.gcd > 0) {
      this.gcd--;
    }
    if (this.rayFrames > 0) {
      this.rayFrames--;
    }
    this.recentDamage *= 0.985;
    this.strafeTimer--;
    if (this.strafeTimer <= 0) {
      // change strafe direction at irregular intervals so the player cannot time it
      this.strafeSign = Math.random() < 0.5 ? -1 : 1;
      this.strafeTimer = 30 + Math.floor(Math.random() * 70);
    }
  }

  die() {
    const game = this.game;
    game.stats.killcount++;
    game.deathFx(this);
    this.kill();
    game.onDuelVictory();
  }

  // ----------------------------------------------------------------- brain
  think(player) {
    this.perceive(player);
    if (this.game.battle) {
      this.watchArmy();
    }
    this.updateLeadModel(player);
    if (this.frame % this.ai.decisionInterval === 0 || this.newThreat) {
      this.chooseTactic(player);
    }
    if (this.frame % 12 === 0) {
      this.chooseLoot(player);
    }
    this.planRoute();
    this.decideMovement(player);
    // a sheep can only run; asleep or in the air it can do nothing at all
    if (this.sheepFrames > 0 || this.sleepFrames > 0 || this.lift) {
      return false;
    }
    this.decideDefense(player);
    if (this.castLock <= 0) {
      this.decideOffense(player);
    }
  }

  perceive(player) {
    const tick = 1 / 60;
    const game = this.game;
    const me = this.center();
    const pc = this.center(player);
    const dx = pc.x - me.x;
    const dy = pc.y - me.y;
    // invisible players are only noticed up close (SEARCH), or by the spells
    // they cast; walls hide everyone
    const visible = (!player.invis || Math.sqrt(dx * dx + dy * dy) < SEARCH.near) && this.canSee(pc.x, pc.y);
    this.newThreat = false;
    this.threats = [];
    this.zones = [];
    for (const e of game.entities) {
      if (e.killed) {
        continue;
      }
      if (e instanceof Zone && e.team === 'player') {
        this.zones.push({ x: e.pos.x, y: e.pos.y, w: e.size.x, h: e.size.y });
        continue;
      }
      if (e instanceof Meteor && e.team === 'player') {
        const mc = e.center();
        const r = Arcana.meteor.blast;
        this.zones.push({ x: mc.x - r, y: mc.y - r, w: r * 2, h: r * 2 });
        continue;
      }
      if (e instanceof FlamingSphere && e.team === 'player') {
        const sc = e.center();
        const r = Arcana.sphere.radius + 20;
        this.zones.push({ x: sc.x - r, y: sc.y - r, w: r * 2, h: r * 2 });
        continue;
      }
      const kind = this.hostileKind(e);
      if (!kind) {
        continue;
      }
      if (e._seenFrame === undefined) {
        e._seenFrame = this.frame;
        // the gentler brains never notice some of the player's bolts
        e._unnoticed = Math.random() < (this.ai.missChance || 0);
        if (!e.duel) {
          // a fresh spell shows where the caster is standing
          this.lastPlayerCastFrame = this.frame;
          if (!visible) {
            const cast = this.center(e);
            this.seen = { x: cast.x, y: cast.y, vx: 0, vy: 0, frame: this.frame };
          }
        }
      }
      if (e._unnoticed || this.frame - e._seenFrame < this.ai.reaction) {
        continue;
      }
      if (this.frame - e._seenFrame === this.ai.reaction) {
        this.newThreat = true;
      }
      this.threats.push({
        x: e.pos.x,
        y: e.pos.y,
        w: e.size.x,
        h: e.size.y,
        vx: e.vel.x * tick,
        vy: e.vel.y * tick,
        life: Math.max(0, e.life),
        kind,
        dmg: this.threatWeight(kind)
      });
    }
    if (visible) {
      this.seen = {
        x: pc.x,
        y: pc.y,
        vx: player.isStunned ? 0 : player.vel.x,
        vy: player.isStunned ? 0 : player.vel.y,
        frame: this.frame
      };
    }
    // the player's mirror image: maybe chase it until the player gives themselves away
    const image = game.firstImage();
    if (image && image.id !== this.decoyId) {
      this.decoyId = image.id;
      this.decoyFrame = this.frame;
      this.decoyFooled = Math.random() < this.ai.decoyFoolChance;
    }
    if (!image || this.lastPlayerCastFrame > this.decoyFrame || this.frame - this.decoyFrame > 150) {
      this.decoyFooled = false;
    }
    if (image && (this.decoyFooled || !visible)) {
      const ic = this.center(image);
      this.target = { x: ic.x, y: ic.y, vx: image.vel.x, vy: image.vel.y, visible: true, real: false, entity: image };
    } else if (visible) {
      this.target = { x: pc.x, y: pc.y, vx: this.seen.vx, vy: this.seen.vy, visible: true, real: true, entity: player };
    } else if (this.seen) {
      // dead reckoning from the last sighting, at most one second ahead
      const lost = this.frame - this.seen.frame;
      const age = Math.min(60, lost) * tick;
      const off = player.invis ? this.searchOffset(lost) : { x: 0, y: 0 };
      const guess = this.clampToArena({ x: this.seen.x + this.seen.vx * age + off.x, y: this.seen.y + this.seen.vy * age + off.y }, 30);
      this.target = { x: guess.x, y: guess.y, vx: 0, vy: 0, visible: false, real: true, entity: null };
    } else {
      // not seen yet: it heads for the player, an invisible one only roughly
      const off = player.invis ? this.searchOffset(Infinity) : null;
      const guess = off ? this.clampToArena({ x: pc.x + off.x, y: pc.y + off.y }, 30) : pc;
      this.target = { x: guess.x, y: guess.y, vx: 0, vy: 0, visible: false, real: true, entity: null };
    }
  }

  // How far off the spot it searches for an invisible player, `lost` frames
  // after it last knew where they were (SEARCH).
  searchOffset(lost) {
    const s = this.search;
    if (!s || s.seen !== this.seen || this.frame - s.frame >= SEARCH.every) {
      const r = Math.min(SEARCH.max, SEARCH.start + lost * SEARCH.grow) * Math.sqrt(Math.random());
      const a = Math.random() * Math.PI * 2;
      this.search = { x: Math.cos(a) * r, y: Math.sin(a) * r, frame: this.frame, seen: this.seen };
    }
    return this.search;
  }

  chooseTactic(player) {
    const hpRatio = this.hp / this.maxHp;
    const playerRatio = player.hp / player.maxHp;
    const t = this.target;
    if ((player.isStunned || player.helpless) && t.real && t.visible) {
      this.tactic = 'punish';
    } else if (!t.visible) {
      this.tactic = 'hunt';
    } else if ((hpRatio < 0.3 && playerRatio > hpRatio + 0.1) || this.manergy < 25) {
      this.tactic = 'retreat';
    } else if (playerRatio < 0.22) {
      this.tactic = 'pressure';
    } else if (this.engageReady(player)) {
      this.tactic = 'engage';
    } else {
      this.tactic = 'kite';
    }
  }

  // Battles: the player's orcs nearby, to keep clear of and to shoot at.
  watchArmy() {
    const me = this.center();
    this.foes = [];
    this.game.battle.eachNear(me.x, me.y, 520, 'player', (u) => {
      if (u.isWizard) {
        return;
      }
      const d = Math.hypot(u._cx - me.x, u._cy - me.y);
      if (d < 520) {
        this.foes.push({ unit: u, x: u._cx, y: u._cy, d });
      }
    });
    this.foes.sort((a, b) => a.d - b.d);
  }

  // Battles: with no clean shot at the wizard, or orcs closing in, turn the
  // spells on the army: fireballs and blizzards into crowds, lightning that
  // chains through the ranks, missiles at whoever is closest.
  fightArmy(player, wizardShot) {
    const foes = (this.foes || []).filter((f) => !f.unit.killed && this.canSee(f.x, f.y));
    if (!foes.length) {
      return false;
    }
    const near = foes[0];
    if (wizardShot && near.d > 200) {
      return false;
    }
    const crowd = (f, r) => foes.filter((o) => Math.hypot(o.x - f.x, o.y - f.y) < r).length;
    const best = foes.slice(0, 8).reduce((a, f) => (crowd(f, 100) > crowd(a, 100) ? f : a), near);
    const me = this.center();
    const at = (f) => Math.atan2(f.y - me.y, f.x - me.x);
    if (this.ready('blizzard') && this.manergy >= 50 && crowd(best, 150) >= 3) {
      this.game.spawn(Zone, best.x, best.y, { kind: 'blizzard', team: 'enemy', radius: 192, tier: 1, life: 240, timeOwner: this });
      this.spend('blizzard', true);
      return true;
    }
    if (this.ready('fireball') && this.manergy >= 20 && best.d < 390 && (crowd(best, 100) >= 2 || best.d < 200)) {
      this.fireBolt('fireball', at(best));
      this.spend('fireball', true);
      return true;
    }
    if (this.ready('lightning') && this.manergy >= 35 && near.d < 295) {
      this.fireBolt('lightning', at(near));
      this.spend('lightning', true);
      return true;
    }
    if (this.ready('thunder') && this.manergy >= 30 && near.d < Arcana.thunder.radius - 20) {
      ArcanaCast.thunder(this);
      this.spend('thunder', true);
      return true;
    }
    if (this.ready('meteor') && this.manergy >= 70 && best.d < 650 && crowd(best, 120) >= 4) {
      ArcanaCast.meteor(this, best);
      this.spend('meteor', true);
      return true;
    }
    if (this.ready('cone') && this.manergy >= 35 && near.d < Arcana.cone.range - 30 && crowd(near, 120) >= 2) {
      ArcanaCast.cone(this, at(near));
      this.spend('cone', true);
      return true;
    }
    // the ground spells into the thickest ranks
    for (const [id, cost, radius] of [['maelstrom', 55, 150], ['gravity', 70, 130], ['confusion', 45, 120], ['sleep', 30, 120]]) {
      if (this.ready(id) && this.manergy >= cost && best.d < 560 && crowd(best, radius) >= 4) {
        ArcanaCast[id](this, best);
        this.spend(id, true);
        return true;
      }
    }
    if (this.ready('missile') && near.d < 480) {
      this.fireBolt('missile', at(near), near.unit);
      this.spend('missile', true);
      this.castLock = Math.min(this.castLock, 4);
      return true;
    }
    return false;
  }

  // Duel trials: is a potion worth running for right now?
  chooseLoot(player) {
    this.lootGoal = null;
    this.lootValue = 0;
    if (!this.game.duelLoot || this.tactic === 'punish') {
      return;
    }
    const me = this.center();
    const pc = this.center(player);
    let best = 0;
    for (const e of this.game.entities) {
      if (!e.isLoot || e.killed || e.isBlue === undefined) {
        continue;
      }
      const value = e.isBlue ? 1 - this.manergy / this.maxManergy : Math.min(1, (this.maxHp - this.hp) / DuelRules.loot.redHeal);
      const c = e.center();
      const mine = Math.hypot(c.x - me.x, c.y - me.y);
      const theirs = Math.hypot(c.x - pc.x, c.y - pc.y);
      // mid-fight only grab what is close; never run a race the player is sure to win
      if (this.target.visible && (mine > 320 || theirs < mine * 0.5)) {
        continue;
      }
      const score = value / (1 + mine / 400);
      if (score > best && value > 0.25) {
        best = score;
        this.lootGoal = e;
        this.lootValue = value;
      }
    }
  }

  // Where the corridors lead: toward loot worth taking, or toward a player
  // out of sight. Nothing when the player is in plain view and no loot calls.
  planRoute() {
    let goal = null;
    let pull = 0;
    if (this.lootGoal && !this.lootGoal.killed) {
      goal = this.lootGoal;
      pull = 14 + 16 * this.lootValue;
    } else if (!this.target.visible) {
      const t = this.target;
      goal = this.huntMark || (this.huntMark = {
        id: 'rival-hunt-' + this.id,
        pos: { x: 0, y: 0 },
        size: { x: 2, y: 2 },
        center() {
          return { x: this.pos.x + 1, y: this.pos.y + 1 };
        }
      });
      goal.pos.x = t.x - 1;
      goal.pos.y = t.y - 1;
      pull = 18;
    }
    this.navDir = null;
    this.navPull = 0;
    if (!goal) {
      return;
    }
    if (this.game.battle) {
      // open country: straight for it (a flow field over a whole
      // battlefield is too dear to rebuild this often)
      const me = this.center();
      const g = goal.center();
      const len = Math.hypot(g.x - me.x, g.y - me.y);
      if (len > 0) {
        this.navDir = { x: (g.x - me.x) / len, y: (g.y - me.y) / len };
        this.navPull = pull;
      }
      return;
    }
    // borrow the shared chase navigation, keep only the direction it picks
    const vx = this.vel.x;
    const vy = this.vel.y;
    if (this.game.navigateEntityToward(this, goal, 100, 20)) {
      const len = Math.hypot(this.vel.x, this.vel.y);
      if (len > 0) {
        this.navDir = { x: this.vel.x / len, y: this.vel.y / len };
        this.navPull = pull;
      }
    }
    this.vel.x = vx;
    this.vel.y = vy;
  }

  engageReady(player) {
    // go in for the root combo when the player cannot answer it
    if (!this.ready('root') || this.manergy < 65 || player.shielded) {
      return false;
    }
    const playerCanShield = player.prepared('shield') && player.cd.shield < 30 && player.manergy > 40;
    const playerCanBlink = player.prepared('blink') && player.cd.blink <= 0 && player.manergy > 40;
    return !playerCanShield && (!playerCanBlink || this.ai.advanced);
  }

  playerHasAutoThreat(player) {
    // the player's lightning and root lock on to anything within 300
    // only what the player has on the bar can be cast at it
    const lightning = player.prepared('lightning') && player.cd.lightning <= 20 && player.manergy > 25;
    const root = player.prepared('stun') && player.cd.stun <= 20 && player.manergy > 25;
    return lightning || root;
  }

  // ----------------------------------------------------------------- movement
  decideMovement(player) {
    const tick = 1 / 60;
    const speed = this.moveSpeed();
    if (this.isStunned) {
      this.vel.x = 0;
      this.vel.y = 0;
      this.bestMove = this.scoreMove({ x: 0, y: 0 }, 0, player);
      return;
    }
    if (this.isFeared) {
      if (Math.floor(this.fearFrames) % 20 === 0) {
        const fa = Math.random() * Math.PI * 2;
        this.fearDir = { x: Math.cos(fa), y: Math.sin(fa) };
      }
      this.vel.x = this.fearDir.x * this.desiredVel;
      this.vel.y = this.fearDir.y * this.desiredVel;
      this.bestMove = this.scoreMove(this.fearDir, this.desiredVel * tick, player);
      return;
    }
    const step = speed * tick;
    const current = this.scoreMove(this.moveDir, step, player);
    const replan = this.frame % this.ai.decisionInterval === 0 || this.newThreat || current.hit.dmg > 0;
    let best = current;
    if (replan) {
      for (let k = -1; k < 16; k++) {
        const dir = k < 0 ? { x: 0, y: 0 } : { x: Math.cos(k * Math.PI / 8), y: Math.sin(k * Math.PI / 8) };
        const option = this.scoreMove(dir, step, player);
        if (option.score > best.score) {
          best = option;
        }
      }
    }
    this.bestMove = best;
    this.moveDir = best.dir;
    this.vel.x = best.dir.x * speed;
    this.vel.y = best.dir.y * speed;
  }

  // simulate moving in dir for a short horizon against every known projectile and zone
  scoreMove(dir, step, player) {
    const horizon = 36;
    const stride = 2;
    let x = this.pos.x;
    let y = this.pos.y;
    let blocked = false;
    let score = 0;
    const hit = { dmg: 0, frame: 999, kinds: {} };
    const done = [];
    for (let f = stride; f <= horizon; f += stride) {
      if (!blocked && step > 0) {
        const nx = this.pos.x + dir.x * step * f;
        const ny = this.pos.y + dir.y * step * f;
        if (this.spotFree(nx, ny)) {
          x = nx;
          y = ny;
        } else {
          blocked = true;
          score -= 25;
        }
      }
      for (let i = 0; i < this.threats.length; i++) {
        const th = this.threats[i];
        if (done[i] || f > th.life) {
          continue;
        }
        // sweep the projectile box over the last stride so fast bolts cannot tunnel through
        const tx = th.x + th.vx * f;
        const ty = th.y + th.vy * f;
        const sx = Math.min(tx, tx - th.vx * stride);
        const sy = Math.min(ty, ty - th.vy * stride);
        const sw = th.w + Math.abs(th.vx * stride);
        const sh = th.h + Math.abs(th.vy * stride);
        const m = 5;
        if (x - m < sx + sw && x + 48 + m > sx && y - m < sy + sh && y + 48 + m > sy) {
          done[i] = true;
          hit.dmg += th.dmg;
          hit.kinds[th.kind] = true;
          hit.frame = Math.min(hit.frame, f);
          score -= th.dmg * 3 * (1 + (horizon - f) / horizon);
        }
      }
      for (const zn of this.zones) {
        if (x + 48 > zn.x && x < zn.x + zn.w && y + 48 > zn.y && y < zn.y + zn.h) {
          score -= 3;
        }
      }
    }
    const t = this.target;
    const cx = x + 24;
    const cy = y + 24;
    const dist = Math.hypot(t.x - cx, t.y - cy);
    if (t.visible) {
      // sway the preferred range a little so the spacing is not static
      const desired = this.tacticRanges[this.tactic] + Math.sin(this.frame / 50) * 35;
      score -= Math.abs(dist - desired) * 0.12;
    }
    if (this.navDir) {
      score += (dir.x * this.navDir.x + dir.y * this.navDir.y) * this.navPull;
    }
    // battles: orcs in melee reach are worse than most bolts
    if (this.foes) {
      for (const f of this.foes) {
        if (f.d > 300) {
          break;
        }
        const d = Math.hypot(f.x - cx, f.y - cy);
        if (d < 130) {
          score -= (130 - d) * 0.6;
        }
      }
    }
    // stay out of the player's auto-target range unless we are going in on purpose
    if (this.tactic !== 'engage' && this.tactic !== 'punish' && dist < 315 && this.playerHasAutoThreat(player)) {
      score -= (315 - dist) * 0.5;
    }
    // walls and corners are where duels are lost
    // (but corridors are fine when the route runs through them)
    const clearance = this.wallClearance(cx, cy);
    if (clearance < 120) {
      score -= (120 - clearance) * (this.navDir ? 0.06 : 0.25);
    }
    if (dir.x || dir.y) {
      const me = this.center();
      const lx = -(t.y - me.y);
      const ly = t.x - me.x;
      const len = Math.sqrt(lx * lx + ly * ly) || 1;
      const lateral = (dir.x * lx + dir.y * ly) / len;
      // moving across the player's line of fire is harder to hit than moving along it
      score += Math.abs(lateral) * 4 + lateral * this.strafeSign * 5;
      score += (dir.x * this.moveDir.x + dir.y * this.moveDir.y) * 2;
    } else {
      score -= 4;
    }
    return { dir, score, hit };
  }

  // ----------------------------------------------------------------- defense
  decideDefense(player) {
    // counterspell a word of death being spoken close by
    if (player.channel && this.ready('counter') && this.distanceTo(player) < Arcana.counter.radius * rankPower(this, 'counter')) {
      ArcanaCast.counter(this);
      this.spend('counter', false);
      return;
    }
    const hit = this.bestMove ? this.bestMove.hit : null;
    if (!hit || hit.dmg <= 0 || hit.frame > 14) {
      return;
    }
    const dangerous = hit.dmg >= 55 || hit.kinds.root || hit.kinds.ironshot;
    // a shield is the best answer: it blocks and sends the spell back
    if (!this.shielded && this.ready('shield') && (dangerous || hit.dmg >= 40)) {
      this.castShield();
      return;
    }
    // else unmake what is coming
    if (!this.shielded && this.ready('counter') && (dangerous || hit.dmg >= 40)) {
      ArcanaCast.counter(this);
      this.spend('counter', false);
      return;
    }
    if (!this.shielded && dangerous && this.ready('blink')) {
      const spot = this.findBlinkSpot(player, 'escape');
      if (spot) {
        this.blinkTo(spot);
      }
    }
  }

  castShield() {
    this.spend('shield', false);
    this.shieldFrames = this.shieldDuration;
    const c = this.center();
    this.game.fx.ring(c.x, c.y, { color: 0xff6060, radius: 50, life: 0.4 });
    this.rig.gesture('raise');
  }

  blinkTo(spot) {
    const fx = this.game.fx;
    const c = this.center();
    fx.burst(c.x, c.y, 1.2, { color: 0xff5050, count: 26, speed: 5, life: 0.5, size: 0.9 });
    this.pos.x = spot.x;
    this.pos.y = spot.y;
    fx.burst(spot.x + 24, spot.y + 24, 1.2, { color: 0xff9090, count: 26, speed: 5, life: 0.5, size: 0.9 });
    this.spend('blink', false);
  }

  findBlinkSpot(player, purpose) {
    const me = this.center();
    const t = this.target;
    const wanted = purpose === 'engage' ? 225 : 400;
    let best = null;
    let bestScore = -Infinity;
    for (let i = 0; i < 32; i++) {
      const angle = Math.random() * Math.PI * 2;
      const radius = 170 + Math.random() * 280;
      const px = me.x + Math.cos(angle) * radius - 24;
      const py = me.y + Math.sin(angle) * radius - 24;
      if (!this.spotFree(px, py)) {
        continue;
      }
      let score = 0;
      // standing still at the new spot, does anything already flying hit us?
      for (const th of this.threats) {
        for (let f = 2; f <= 30 && f <= th.life; f += 2) {
          const tx = th.x + th.vx * f;
          const ty = th.y + th.vy * f;
          if (px - 8 < tx + th.w && px + 56 > tx && py - 8 < ty + th.h && py + 56 > ty) {
            score -= th.dmg * 4;
            break;
          }
        }
      }
      for (const zn of this.zones) {
        if (px + 48 > zn.x && px < zn.x + zn.w && py + 48 > zn.y && py < zn.y + zn.h) {
          score -= 60;
        }
      }
      const dist = Math.hypot(t.x - (px + 24), t.y - (py + 24));
      score -= Math.abs(dist - wanted) * 0.3;
      const clearance = this.wallClearance(px + 24, py + 24);
      if (clearance < 140) {
        score -= (140 - clearance) * 0.4;
      }
      if (score > bestScore) {
        bestScore = score;
        best = { x: px, y: py };
      }
    }
    return best;
  }

  // ----------------------------------------------------------------- offense
  decideOffense(player) {
    const game = this.game;
    const t = this.target;
    const me = this.center();
    const dx = t.x - me.x;
    const dy = t.y - me.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const real = t.real && t.visible;
    const rooted = real && player.isStunned;
    const feared = real && player.isFeared;
    // asleep or hanging in the air: the next blow lands for certain
    const helpless = rooted || feared || (real && player.helpless);
    // keep enough manergy to answer the next big spell with a shield or blink
    let reserve = ((this.knows('shield') && this.cdLeft.shield < 30) || (this.knows('blink') && this.cdLeft.blink < 30)) ? 40 : 0;
    if (rooted || this.tactic === 'pressure') {
      reserve = 0;
    }
    const spare = this.manergy - reserve;

    // healing word: patch up out of the line of fire, or when losing
    if (this.ready('heal') && this.maxHp - this.hp >= DuelRules.arcana.heal.amount * 0.8 &&
      (!t.visible || this.tactic === 'retreat' || this.hp / this.maxHp < 0.45)) {
      ArcanaCast.heal(this);
      this.spend('heal', false);
      return;
    }
    // armor of agathys whenever the fight is on and the frost is gone
    if (this.ready('agathys') && this.wardHp <= 0 && t.visible && dist < 600 && spare >= 40) {
      ArcanaCast.agathys(this);
      this.spend('agathys', false);
      return;
    }
    // an invisible player it lost a while ago (or never saw): search, do not
    // waste spells
    if (!t.visible && player.invis && (!this.seen || this.frame - this.seen.frame > SEARCH.blind)) {
      return;
    }
    const wizardShot = this.canSee(t.x, t.y) && t.visible && dist < 520;
    if (game.battle && this.fightArmy(player, wizardShot)) {
      return;
    }
    // nothing to shoot at through a wall
    if (!this.canSee(t.x, t.y)) {
      return;
    }
    // trade places with the player to get out of the player's ground spells
    // (and leave the player in its own)
    const inPlayerZone = this.zones.some((zn) => me.x > zn.x && me.x < zn.x + zn.w && me.y > zn.y && me.y < zn.y + zn.h);
    if (real && this.ready('swap') && spare >= 30 && (this.inSlowZone || inPlayerZone) && ArcanaCast.swap(this, player)) {
      this.spend('swap', false);
      return;
    }
    // while invisible, hold fire unless an opening appears
    if (this.invis && !helpless && !(this.tactic === 'engage' && dist < 290)) {
      return;
    }
    // power word kill cannot be dodged or reflected, but it takes a second
    // to speak, standing still (speakWord)
    if (real && dist < 650 && this.ready('pwkill') && (spare >= 30 || player.hp <= DuelRules.damage.pwkill) &&
      Math.random() < this.ai.pwkillRate) {
      this.channel = { left: DuelRules.pwkillCast };
      this.rig.gesture('raise');
      this.vel.x = 0;
      this.vel.y = 0;
      game.hud.toast('YOUR REFLECTION SPEAKS A WORD OF DEATH', '#c040ff');
      return;
    }
    // time stop: everyone crawls except us, then unload
    if (this.ai.advanced && real && dist < 420 && !player.shielded && this.ready('timestop') && this.manergy >= 90 &&
      !game.time.active && player.hp / player.maxHp > 150 / DuelRules.hp) {
      game.time.alterTimeScale(0.2, 0, 4, 0.2, this);
      this.timestopFrames = this.timestopDuration;
      this.spend('timestop', false);
      game.fx.ring(me.x, me.y, { color: 0xff8080, radius: 600, life: 0.8 });
      game.onTimestop();
      this.rig.gesture('raise');
      return;
    }
    // a curse first, while there is manergy left for what follows
    if (real && this.ready('curse') && spare >= 70 && player.curseFrames <= 0 && ArcanaCast.curse(this, player)) {
      this.spend('curse', true);
      return;
    }
    // engage: blink into root range when the combo is ready
    if (this.ai.advanced && this.tactic === 'engage' && real && dist > 360 && this.ready('blink') && this.manergy >= 110) {
      const spot = this.findBlinkSpot(player, 'engage');
      if (spot) {
        this.blinkTo(spot);
        return;
      }
    }
    // thunderwave: shove off a player who got too close
    if (real && dist < Arcana.thunder.radius - 20 && this.ready('thunder') && spare >= 30) {
      ArcanaCast.thunder(this);
      this.spend('thunder', true);
      return;
    }
    // polymorph: a sheep cannot cast, so use it to get away or to go in
    if (real && !helpless && player.sheepFrames <= 0 && dist < Arcana.polymorph.range - 40 && this.ready('polymorph') && spare >= 40 &&
      (this.tactic === 'retreat' || this.tactic === 'engage' || this.recentDamage > 60) && ArcanaCast.polymorph(this, player)) {
      this.spend('polymorph', true);
      return;
    }
    // sleep, confusion and a nightmare take the player out of the fight for
    // a moment (a blow ends the sleep, so it sets up the biggest one)
    const ahead = (k) => this.clampToArena({ x: t.x + t.vx * k, y: t.y + t.vy * k }, 60);
    if (real && !helpless && !player.shielded && dist < 520 && this.ready('sleep') && spare >= 30) {
      ArcanaCast.sleep(this, ahead(0.3));
      this.spend('sleep', true);
      return;
    }
    if (real && !helpless && dist < 560 && this.ready('confusion') && spare >= 45) {
      ArcanaCast.confusion(this, ahead(0.3));
      this.spend('confusion', true);
      return;
    }
    if (real && !helpless && !player.nightmare && this.ready('phantasm') && spare >= 45 && ArcanaCast.phantasm(this, player)) {
      this.spend('phantasm', true);
      return;
    }
    // root: sets up everything else
    if (real && !player.isStunned && dist < 290 && this.ready('root') && spare >= 30 && this.clearOfShield(player, 'root', dist)) {
      this.fireBolt('root', this.aimAngle('root', t, true));
      this.spend('root', true);
      this.castLock = 2;
      return;
    }
    // disintegrate is instant: only the aim can miss, and a shield soaks it
    if (real && dist < Arcana.disintegrate.range - 40 && this.ready('disintegrate') && spare >= 50 && !player.shielded) {
      ArcanaCast.disintegrate(this, Math.atan2(dy, dx) + this.aimError());
      this.spend('disintegrate', true);
      return;
    }
    // iron shot: only when it will land
    if (this.ready('ironshot') && spare >= 40 && dist < 480 && this.clearOfShield(player, 'ironshot', dist)) {
      const arrival = this.arrivalFrames('ironshot', dist);
      const shieldThreat = player.prepared('shield') && player.cd.shield <= 0 && player.manergy > 40;
      if (helpless || arrival <= 9 || (!shieldThreat && this.hitChance('ironshot', dist) > 0.7)) {
        this.fireBolt('ironshot', this.aimAngle('ironshot', t, true));
        if (this.ironCharges === 1) {
          this.cdLeft.ironshot = this.spellBook.ironshot.cd;
        }
        this.ironCharges--;
        this.manergy -= this.spellBook.ironshot.cost;
        this.gcd = GLOBAL_COOLDOWN;
        this.castLock = helpless ? 2 : this.ai.castLock;
        this.invisFrames = 0;
        return;
      }
    }
    // scorching ray: three fanned rays cover a dodge either way (mix it up
    // with the fireball)
    if (this.ready('scorch') && spare >= 25 && dist < 420 && (helpless || this.hitChance('scorch', dist) > 0.35) &&
      this.clearOfShield(player, 'scorch', dist) && (!this.ready('fireball') || Math.random() < 0.5)) {
      ArcanaCast.scorch(this, this.aimAngle('scorch', t, true));
      this.spend('scorch', true);
      return;
    }
    // cone of cold: up close it hurts and slows the player for what follows
    if (real && dist < Arcana.cone.range - 30 && this.ready('cone') && spare >= 35) {
      ArcanaCast.cone(this, Math.atan2(dy, dx));
      this.spend('cone', true);
      return;
    }
    // fireball: two orbs, one at the best lead and one at the runner-up to cover both dodges
    if (this.ready('fireball') && spare >= 20 && dist < 390 && (helpless || dist < 320 || this.hitChance('fireball', dist) > 0.45) &&
      this.clearOfShield(player, 'fireball', dist)) {
      const ranked = this.rankedLeads();
      this.fireBolt('fireball', this.aimAngle('fireball', t, true, ranked[0].k));
      this.fireBolt('fireball', this.aimAngle('fireball', t, false, helpless ? ranked[0].k : ranked[1].k));
      this.spend('fireball', true);
      return;
    }
    // lightning: same lock-on range as the player's
    if (real && dist < 295 && this.ready('lightning') && spare >= 35 && this.clearOfShield(player, 'lightning', dist)) {
      this.fireBolt('lightning', this.aimAngle('lightning', t, true));
      this.spend('lightning', true);
      return;
    }
    // blizzard: drop it where the player is going, or right on them if they are stuck
    if (this.ready('blizzard') && spare >= 50 && dist < 650 && t.visible) {
      const lead = rooted ? 0 : 0.6;
      const spot = this.clampToArena({ x: t.x + t.vx * lead, y: t.y + t.vy * lead }, 60);
      game.spawn(Zone, spot.x, spot.y, { kind: 'blizzard', team: 'enemy', radius: 192, tier: 1, life: 240, timeOwner: this });
      this.spend('blizzard', true);
      return;
    }
    // meteor swarm: the rocks land late, so drop them where the player will be
    // (it costs more than the shield reserve leaves, so it waits for near-full manergy)
    if (this.ready('meteor') && this.manergy >= 90 && dist < 650 && t.visible) {
      const lead = helpless ? 0 : 0.8;
      ArcanaCast.meteor(this, this.clampToArena({ x: t.x + t.vx * lead, y: t.y + t.vy * lead }, 60));
      this.spend('meteor', true);
      return;
    }
    // reverse gravity: everything the player has, it hangs in the air
    if (real && !player.shielded && this.ready('gravity') && this.manergy >= 90 && dist < 560) {
      ArcanaCast.gravity(this, ahead(helpless ? 0 : 0.2));
      this.spend('gravity', true);
      return;
    }
    // maelstrom: drag the player into the eye, away from cover
    if (this.ready('maelstrom') && spare >= 55 && dist < 600 && t.visible) {
      ArcanaCast.maelstrom(this, ahead(0.5));
      this.spend('maelstrom', true);
      return;
    }
    // cloudkill: roll a cloud over the player
    if (this.ready('cloud') && spare >= 50 && dist < 600 && t.visible) {
      ArcanaCast.cloud(this, this.clampToArena({ x: t.x + t.vx * 0.4, y: t.y + t.vy * 0.4 }, 60));
      this.spend('cloud', true);
      return;
    }
    // spirit guardians when the fight is close, a spiritual weapon whenever the player is in reach
    if (this.ready('guardians') && spare >= 60 && dist < 300) {
      ArcanaCast.guardians(this);
      this.spend('guardians', false);
      return;
    }
    if (this.ready('weapon') && spare >= 50 && real && dist < Arcana.weapon.reach) {
      ArcanaCast.weapon(this);
      this.spend('weapon', false);
      return;
    }
    // a flaming sphere rolls after the player (FlamingSphere.goal)
    if (this.ready('sphere') && spare >= 40 && real && dist < 520) {
      ArcanaCast.sphere(this);
      this.spend('sphere', false);
      return;
    }
    // fear: scramble the player before the next combo, or push them off when they crowd us
    if (real && dist < 430 && !player.isStunned && !player.isFeared && this.ready('fear') && spare >= 50 &&
      (dist < 190 || this.cdLeft.root < 40 || this.cdLeft.fireball === 0)) {
      player.isFeared = true;
      player.fearFrames = 0;
      player.fearDuration = DuelRules.fearFrames;
      this.spend('fear', true);
      game.fx.ring(me.x, me.y, { color: 0xc040ff, radius: 430, life: 0.6 });
      return;
    }
    // decoy when the player is landing hits
    if (this.ready('image') && spare >= 50 && this.recentDamage > 90) {
      this.castImage();
      return;
    }
    // invisibility to break off and reset when losing
    if (this.ready('invis') && this.tactic === 'retreat' && this.manergy > 75) {
      this.invisFrames = this.invisDuration;
      this.spend('invis', false);
      this.rig.gesture('raise');
      return;
    }
    // haste to escape or to close in
    if (this.ready('haste') && this.manergy > 75 && ((this.tactic === 'retreat' && dist < 320) || (this.tactic === 'engage' && dist > 420))) {
      this.hasteFrames = this.hasteDuration;
      this.spend('haste', false);
      this.rig.gesture('raise');
      return;
    }
    // magic missile is free: keep the pressure on
    if (this.ready('missile') && dist < 590 && this.clearOfShield(player, 'missile', dist)) {
      if (t.visible) {
        this.fireBolt('missile', this.aimAngle('missile', t, true), t.entity);
      } else {
        // blind fire around where the player probably is
        this.fireBolt('missile', Math.atan2(dy, dx) + (Math.random() - 0.5) * 0.35);
      }
      this.spend('missile', true);
      this.castLock = Math.min(this.castLock, 4);
      return;
    }
    // lifesteal ray when overflowing with manergy and nothing else to do
    // (starting it waits for and starts the global cooldown; keeping it going
    // does not)
    if (real && dist < 380 && this.knows('ray') && !player.shielded && this.hp < this.maxHp && (this.manergy > 92 || this.rayFrames > 0) && this.manergy > 10 &&
      (this.rayFrames > 0 || this.gcd <= 0)) {
      if (this.rayFrames <= 0) {
        this.rayFrames = 6;
        this.gcd = GLOBAL_COOLDOWN;
      }
      this.fireBolt('ray', this.aimAngle('ray', t, false));
      this.manergy -= this.spellBook.ray.cost;
    }
  }

  castImage() {
    // the decoy runs one way while we strafe the other
    const me = this.center();
    const t = this.target;
    const lx = -(t.y - me.y);
    const ly = t.x - me.x;
    const len = Math.sqrt(lx * lx + ly * ly) || 1;
    const side = this.strafeSign;
    this.game.spawn(MirrorImage, this.pos.x, this.pos.y, {
      source: this,
      wander: { x: (lx / len) * side, y: (ly / len) * side },
      life: 240,
      robe: 0x8a1a1a,
      hat: 0x2a0a0a,
      timeOwner: this
    });
    this.strafeSign = -side;
    this.strafeTimer = 90;
    this.spend('image', false);
    this.rig.gesture('raise');
  }

  clearOfShield(player, kind, dist) {
    // never shoot into an active shield unless it drops before the shot arrives
    if (!player.shielded) {
      return true;
    }
    return this.arrivalFrames(kind, dist) > player.shieldFrames + 2;
  }

  arrivalFrames(kind, dist) {
    return (dist / BoltKinds[kind].speed) * 60;
  }

  hitChance(kind, dist) {
    // how much of the player's dodge room the shot leaves
    const flight = dist / BoltKinds[kind].speed;
    const dodge = (this.target.entity && this.target.entity.desiredVel ? this.target.entity.desiredVel : 120) * flight;
    const cover = 24 + BoltKinds[kind].size / 2;
    return Math.min(1, cover / Math.max(1, dodge));
  }

  rankedLeads() {
    return this.leadModel.slice().sort((a, b) => a.err - b.err);
  }

  pickLead() {
    // usually trust the best lead, sometimes use the runner-up so the pattern cannot be read
    const ranked = this.rankedLeads();
    return Math.random() < 0.75 ? ranked[0].k : ranked[1].k;
  }

  predictPoint(t, speed, k) {
    const me = this.center();
    let time = DuelRules.intercept(t.x - me.x, t.y - me.y, t.vx, t.vy, speed);
    time = Math.min(time, 1.5);
    return this.clampToArena({ x: t.x + t.vx * time * k, y: t.y + t.vy * time * k }, 26);
  }

  aimAngle(kind, t, record, forcedLead) {
    const me = this.center();
    const speed = BoltKinds[kind].speed;
    const k = forcedLead !== undefined ? forcedLead : this.pickLead();
    const p = this.predictPoint(t, speed, k);
    if (record && t.real && t.visible) {
      this.recordShot(t, speed);
    }
    return Math.atan2(p.y - me.y, p.x - me.x) + this.aimError();
  }

  // Radians off its aim: its difficulty's, and wild while confused.
  aimError() {
    return (Math.random() - 0.5) * 2 * (this.ai.aimNoise + (this.confusedFrames > 0 ? 0.7 : 0));
  }

  // remember every lead's prediction and check it when the shot would have arrived
  recordShot(t, speed) {
    if (Math.abs(t.vx) + Math.abs(t.vy) < 10) {
      return;
    }
    const me = this.center();
    const time = DuelRules.intercept(t.x - me.x, t.y - me.y, t.vx, t.vy, speed);
    const preds = this.leadModel.map((lead) => this.predictPoint(t, speed, lead.k));
    this.pendingShots.push({ frame: this.frame + Math.round(time * 60), preds });
    if (this.pendingShots.length > 20) {
      this.pendingShots.shift();
    }
  }

  updateLeadModel(player) {
    if (!this.pendingShots.length || !this.target.visible || !this.target.real) {
      return;
    }
    const pc = this.center(player);
    const rate = this.ai.learnRate;
    while (this.pendingShots.length && this.pendingShots[0].frame <= this.frame) {
      const shot = this.pendingShots.shift();
      for (let i = 0; i < this.leadModel.length; i++) {
        const err = Math.hypot(shot.preds[i].x - pc.x, shot.preds[i].y - pc.y);
        this.leadModel[i].err += (err - this.leadModel[i].err) * rate;
      }
    }
  }

  // `target`: what magic missiles home in on (the body, else the aim spot)
  fireBolt(kind, angle, target) {
    if (kind === 'missile') {
      const t = this.target;
      castMissiles(this.game, this, 'enemy', angle, target || { x: t.x, y: t.y }, { duel: true });
      this.rig.swing();
      return;
    }
    const me = this.center();
    this.game.spawn(Projectile, me.x, me.y, { kind, angle, team: 'enemy', duel: true, timeOwner: this });
    this.rig.swing();
  }

  syncView(time, dt) {
    const c = this.center();
    this.view.position.set(c.x * UNIT, this.lift ? liftHeight(this.lift, time) : 0, c.y * UNIT);
    const player = this.game.player;
    let facing = null;
    if (player) {
      const pc = player.center();
      facing = Math.atan2(pc.x - c.x, pc.y - c.y);
    }
    // a word of death keeps the staff raised
    this.rig.hold = this.channel ? 'raise' : null;
    this.rig.rooted = this.isStunned || !!this.sleepFrames || !!this.lift || !!this.channel;
    this.rig.animate(dt, this.isStunned ? 0 : Math.min(1.3, Math.hypot(this.vel.x, this.vel.y) / 90), facing);
    this.rig.setAlpha(this.invis ? 0.1 : 1);
    const fx = this.game.fx;
    if (this.shielded && Math.random() < 0.6) {
      const a = Math.random() * Math.PI * 2;
      fx.emit(c.x + Math.cos(a) * 34, c.y + Math.sin(a) * 34, 0.4 + Math.random() * 2.2, { color: 0xff7070, life: 0.3, size: 0.6 });
    }
    if (this.isStunned && !this.sleepFrames && !this.lift && Math.random() < 0.2) {
      fx.column(c.x, c.y, 20, { color: 0x40ff60, count: 1, rise: 0.6, life: 0.6, size: 0.5 });
    }
    arcanaFx(this, time, 2.6);
    if (this.isFeared && Math.random() < 0.3) {
      fx.emit(c.x, c.y, 3.2, { color: 0xc040ff, life: 0.5, size: 0.6, vx: (Math.random() - 0.5) * 2, vz: (Math.random() - 0.5) * 2 });
    }
    if (this.chillFrames > 0 && Math.random() < 0.3) {
      fx.emit(c.x + (Math.random() - 0.5) * 30, c.y + (Math.random() - 0.5) * 30, Math.random() * 2.5, { color: 0xbfe8ff, life: 0.5, size: 0.4, vy: -0.5 });
    }
    syncSheep(this, time);
  }
}
