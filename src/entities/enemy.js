import { Entity } from '../core/entity.js';
import { UNIT } from '../core/constants.js';
import { Projectile } from './spells.js';
import { Arcana, arcanaHit, liftHeight, pullToward } from './arcana.js';
import { buildSheep } from '../render/models.js';
import { dressRig } from '../render/gearModels.js';
import { applyGearPools, elementBonus, gearStat, statOf } from './gear.js';
import { rankPower } from './spellbar.js';

// Damage reflected enemy bolts deal when a shield sends them back.
const REFLECTED_DAMAGE = { iceshard: 30, stormbolt: 60, acidbolt: 50, stone: 20, missile2: 50, fireball2: 75, ironshot2: 200, arrow: 20, quarrel: 24, runebolt: 50, sunbolt: 50, moonbolt: 50 };
const CHAIN_MEMORY = 45;
// most foes a chain jumps to at once in a battle
const CHAIN_JUMPS = 24;
// share of its speed a chilled monster keeps
const CHILL_SLOW = 0.4;

// Shared parts of every dungeon monster: hit points, the player's spells
// landing on it, stun and fear, and the 3D rig. Every hold (root, fear,
// polymorph, sleep, confusion, reverse gravity...) works on every monster;
// bosses and dragons only shake the long ones off sooner (`holdScale`).
// Every hit carries an element
// (Elements below) and a monster may resist some: `resist` maps an element
// to a damage multiplier (0 immune, 0.5 resistant, 1.5 vulnerable). Dragons
// (dragon.js) resist by colour; now and then an orc or one of its kind
// resists an element too (DungeonLevels.rollResist).
export const Elements = {
  force: 'FORCE', fire: 'FIRE', cold: 'COLD', lightning: 'LIGHTNING', thunder: 'THUNDER', poison: 'POISON',
  necrotic: 'NECROTIC', radiant: 'RADIANT', physical: 'IRON', psychic: 'PSYCHIC'
};
export class Enemy extends Entity {
  defaults() {
    this.hp = 100;
    this.maxHp = 100;
    this.desiredVel = 80;
    this.maxSpeed = 100;
    this.isStunned = false;
    this.stunFrames = 0;
    this.stunDuration = 200;
    this.isFeared = false;
    this.fearFrames = 0;
    this.fearDuration = 200;
    this.chainedAt = -999;
    this.rootedAt = -999;
    this.aggro = false;
    this.homeRoom = null;
    this.label = '';
    this.fireSplash = 96;
    this.pwkillDamage = 175;
    this.blizzardSlow = [0.25, 0.5];
    // share of a long hold (fear, polymorph, sleep, confusion, a
    // nightmare's terror) it suffers: bosses and dragons shake them off sooner
    this.holdScale = 1;
    this.spawnFrames = 0;
    this.wander = 0;
    // the mage's D&D spells: chill (cone of cold), knockback (thunderwave),
    // polymorph
    this.chillFrames = 0;
    this.knock = null;
    this.knockResist = 0;
    this.sheepFrames = 0;
    this.resist = null;
    // the newer spells (arcana.js): sleep (any lost health wakes it), a
    // curse (more damage taken), a nightmare (phantasmal killer: { frames,
    // dps, terror }), confusion (regular foes, `canBrawl`, fight their own
    // side), reverse gravity (`lift`: { frames, total, caster }), a ward of
    // frost (armor of agathys) and silence
    // (counterspell holds back the cooldowns named in `spellTimers`)
    this.sleepFrames = 0;
    this.sleepHp = 0;
    this.curseFrames = 0;
    this.curseMult = 1;
    this.nightmare = null;
    this.confusedFrames = 0;
    this.canBrawl = false;
    this.lift = null;
    this.wardHp = 0;
    this.wardFrames = 0;
    this.spellTimers = [];
  }

  get alive() {
    return !this.killed && this.hp > 0;
  }

  // --------------------------------------------------------------- gear

  // Its inventory (gear.js) changed: pools, speed and manergy regen follow
  // the worn gear, and the model shows it.
  onGearChanged() {
    const { before, after } = applyGearPools(this);
    const ratio = (1 + (after.speed || 0)) / (1 + (before.speed || 0));
    this.desiredVel *= ratio;
    this.maxSpeed *= ratio;
    if (this.manergyRegen !== undefined) {
      this.manergyRegen *= (1 + (after.regen || 0)) / (1 + (before.regen || 0));
    }
    dressRig(this.rig, this.inventory);
  }

  // Drops everything it carries around where it fell.
  dropGear() {
    if (!this.inventory) {
      return;
    }
    for (const item of this.inventory.all()) {
      this.game.dropGear(this, item);
    }
  }

  // --------------------------------------------------------------- damage

  takeSpell(p, k) {
    const game = this.game;
    // whoever cast it: the player, or in battles the rival hitting the player's orcs
    const player = p.team === 'player' ? game.player : game.rival;
    const c = this.center();
    const fx = game.fx;
    switch (p.kind) {
      case 'missile':
        // each dart hits like the 2D game's single missile, plus gear
        this.hurt(51 + statOf(player, 'missileDamage'), 'force');
        fx.burst(c.x, c.y, 1.4, { color: [0xb070ff, 0xffffff], count: 12, speed: 4, life: 0.35, size: 0.7 });
        p.kill();
        break;
      case 'fireball': {
        this.hurt(110, 'fire');
        p.kill();
        this.explode(c);
        // in battles the blast catches the whole regiment around the hit
        const caught = game.battle ? game.battle.near(this, this.fireSplash + 60, p.team === 'player' ? 'enemy' : 'player') : game.orcs();
        for (const other of caught) {
          if (other !== this && other.alive && other.distanceTo(this) < this.fireSplash) {
            other.hurt(101, 'fire');
          }
        }
        break;
      }
      case 'ironshot':
        this.hurt(100 * k, 'physical');
        if (Math.random() < 0.5) {
          fx.burst(c.x, c.y, 1.4, { color: [0xd0d8e0, 0xff3020], count: 6, speed: 5, life: 0.3, size: 0.5 });
        }
        break;
      case 'lightning':
        this.hurt(101, 'lightning');
        p.kill();
        this.chainedAt = game.navFrame;
        fx.bolt(p.originX, p.originY, c.x, c.y, { color: 0xa0e8ff, life: 0.25, width: 0.07 });
        game.gfx.flash(c.x, c.y, 2, 0x80d0ff, 30, 0.2);
        this.spreadChain('chain', 'chainedAt', p.team);
        break;
      case 'chain':
        if (game.navFrame - this.chainedAt < CHAIN_MEMORY) {
          return;
        }
        this.chainedAt = game.navFrame;
        this.hurt(player && player.hasLg2 ? 101 : 75, 'lightning');
        fx.bolt(p.originX, p.originY, c.x, c.y, { color: 0xa0e8ff, life: 0.2, width: 0.05 });
        p.kill();
        break;
      case 'root':
        this.stun('root');
        p.kill();
        this.rootedAt = game.navFrame;
        this.spreadChain('rootchain', 'rootedAt', p.team);
        break;
      case 'rootchain':
        if (game.navFrame - this.rootedAt < CHAIN_MEMORY) {
          return;
        }
        this.rootedAt = game.navFrame;
        this.stun('root');
        p.kill();
        break;
      case 'ray':
        this.hurt(15 * rankPower(player, 'ray'), 'necrotic');
        this.vel.x /= 3;
        this.vel.y /= 3;
        if (player && !player.killed) {
          player.hp += 3 + statOf(player, 'leech');
        }
        fx.emit(c.x, c.y, 1.4, { color: 0xff2040, life: 0.4, size: 0.8, vy: 1 });
        p.kill();
        break;
      case 'shadowbolt':
        this.stun('shadow');
        p.kill();
        break;
      case 'scorch':
        this.hurt(Arcana.scorch.damage * rankPower(player, 'scorch'), 'fire');
        fx.burst(c.x, c.y, 1.4, { color: [0xff5020, 0xffc040], count: 12, speed: 4, life: 0.35, size: 0.7 });
        p.kill();
        break;
      default:
        this.hurt(REFLECTED_DAMAGE[p.kind] || 20, p.spec.element || 'physical');
        fx.burst(c.x, c.y, 1.4, { color: 0xffffff, count: 8, speed: 3, life: 0.3, size: 0.6 });
        p.kill();
    }
  }

  // Lightning and chain root jump to every foe of the caster within 400px
  // (in a battle's packed ranks, to the nearest CHAIN_JUMPS of them).
  spreadChain(kind, stampKey, team = 'player') {
    const game = this.game;
    const c = this.center();
    const pool = game.battle ? game.battle.near(this, 400, team === 'player' ? 'enemy' : 'player') : game.hostilesOf(team);
    const jumps = [];
    for (const other of pool) {
      if (other === this || !other.alive || !(stampKey in other)) {
        continue;
      }
      const d = other.distanceTo(this);
      if (d < 400 && game.navFrame - other[stampKey] >= CHAIN_MEMORY) {
        jumps.push({ other, d });
      }
    }
    if (game.battle && jumps.length > CHAIN_JUMPS) {
      jumps.sort((a, b) => a.d - b.d);
      jumps.length = CHAIN_JUMPS;
    }
    for (const { other } of jumps) {
      game.spawn(Projectile, c.x, c.y, { kind, angle: this.angleTo(other), team });
    }
  }

  explode(c) {
    const fx = this.game.fx;
    fx.burst(c.x, c.y, 1.2, { color: [0xff6010, 0xffb030, 0xffe080], count: 50, speed: 7, life: 0.6, size: 1.4, gravity: 2 });
    fx.ring(c.x, c.y, { color: 0xff8030, radius: this.fireSplash, life: 0.4 });
    this.game.gfx.flash(c.x, c.y, 2, 0xff7020, 60, 0.35);
    this.game.gfx.addShake(0.2);
  }

  inZone(zone, k) {
    if (zone.kind === 'blizzard') {
      this.hp -= this.resisted((zone.tier ? 1 : 0.5) * k * this.gearBoost('cold'), 'cold');
    } else if (zone.kind === 'guardians') {
      this.hp -= this.resisted(Arcana.guardians.dps / 60 * k * rankPower(zone.timeOwner, 'guardians') * this.gearBoost('radiant'), 'radiant');
    } else if (zone.kind === 'cloud' && zone.timeOwner) {
      this.hp -= this.resisted(Arcana.cloud.dps / 60 * k * rankPower(zone.timeOwner, 'cloud') * this.gearBoost('poison'), 'poison');
    } else if (zone.kind === 'cloud') {
      // battles: a green dragon's poison
      this.hp -= this.resisted(1.2 * k, 'poison');
    } else if (zone.kind === 'fire') {
      // battles: ground a red dragon set burning
      this.hp -= this.resisted(1.5 * k, 'fire');
    } else if (zone.kind === 'acid') {
      this.hp -= this.resisted(1.2 * k, 'poison');
    } else if (zone.kind === 'meteors') {
      this.hp -= this.resisted(0.8 * k, 'fire');
    } else if (zone.kind === 'maelstrom') {
      this.hp -= this.resisted(Arcana.maelstrom.dps / 60 * k * rankPower(zone.timeOwner, 'maelstrom') * this.gearBoost('physical'), 'physical');
      if (!this.lift) {
        pullToward(this, zone, Arcana.maelstrom.pull, k);
      }
    }
  }

  // Survival: every hit on a monster is the mage's doing (its spells, its
  // allies, its reflected bolts), so the mage's gear strengthens it by
  // element (gear.js elementBonus). The trials leave it out.
  gearBoost(element) {
    const game = this.game;
    if (game.duelMode || !game.player || !element) {
      return 1;
    }
    return 1 + elementBonus(game.player, element);
  }

  // Damage after this monster's resistance to the element, and its curse.
  resisted(dmg, element) {
    const mult = this.resist && element ? this.resist[element] : undefined;
    const cursed = this.curseFrames > 0 ? this.curseMult : 1;
    return (mult === undefined ? dmg : dmg * mult) * cursed;
  }

  // What is left of a blow once a ward of frost (armor of agathys) took its share.
  soak(dmg) {
    if (this.wardHp <= 0 || dmg <= 0) {
      return dmg;
    }
    const taken = Math.min(this.wardHp, dmg);
    this.wardHp -= taken;
    if (this.wardHp <= 0) {
      const c = this.center();
      this.game.fx.burst(c.x, c.y, 1.4, { color: [0xe8f8ff, 0x9ad8ff], count: 24, speed: 5, life: 0.5, size: 0.7, gravity: 6 });
    }
    return dmg - taken;
  }

  slowIn(zone) {
    return zone.tier ? this.blizzardSlow[1] : this.blizzardSlow[0];
  }

  hurt(dmg, element) {
    // the mage's gear for the element, gear armour, then the element's
    // resistance (and a curse), then a ward of frost
    dmg *= this.gearBoost(element) * (1 - gearStat(this, 'armor'));
    const taken = this.resisted(dmg, element);
    this.hp -= this.soak(taken);
    if (taken < dmg * 0.75 || taken > dmg * 1.25) {
      this.onResist(element, taken / dmg);
    }
    if (this.rig && taken > 0) {
      this.rig.hit();
    }
  }

  // A hit it shrugs off or takes badly: a puff of the element's colour.
  onResist(element, mult) {
    const c = this.center();
    const color = mult < 1 ? 0xb0b0b0 : 0xffe040;
    this.game.fx.burst(c.x, c.y, (this.rig ? this.rig.height : 2) * 0.7, { color, count: mult < 1 ? 6 : 12, speed: 3, life: 0.4, size: 0.7 });
  }

  // `cause` is what stunned it (root, shadow).
  stun(_cause) {
    this.isStunned = true;
    this.stunFrames = 0;
    const c = this.center();
    this.game.fx.column(c.x, c.y, 30, { color: [0x40ff60, 0x20a040], count: 16, rise: 1.2, life: 0.8, size: 0.7 });
  }

  chill(frames) {
    this.chillFrames = Math.max(this.chillFrames, frames);
  }

  // Pushed away over a few frames; walls stop it. Bosses barely budge.
  shove(angle, distance) {
    const d = distance * (1 - this.knockResist);
    if (d > 1) {
      this.knock = { x: Math.cos(angle) * d / 12, y: Math.sin(angle) * d / 12, frames: 12 };
    }
  }

  // Risen, and not held (rooted, asleep, lifted) nor in a panic.
  freeToCast() {
    return this.spawnFrames <= 0 && !this.isStunned && !this.isFeared;
  }

  // How long a long hold of `frames` holds it (holdScale).
  heldFor(frames) {
    return frames * this.holdScale;
  }

  polymorph(frames) {
    this.sheepFrames = Math.max(this.sheepFrames, this.heldFor(frames));
    this.isFeared = false;
    this.aggro = false;
  }

  fear() {
    this.isFeared = true;
    this.fearFrames = this.fearDuration - this.heldFor(this.fearDuration);
    this.vel.x = Math.floor(Math.random() * 201) - 100;
    this.vel.y = Math.floor(Math.random() * 201) - 100;
  }

  // Feared for at least `frames` more, without cutting a longer fear short.
  fearFor(frames) {
    if (!this.isFeared) {
      this.fear();
    }
    this.fearFrames = Math.min(this.fearFrames, Math.max(0, this.fearDuration - frames));
  }

  // Asleep: it stands as if rooted until the sleep wears off or it loses
  // any health.
  sleep(frames) {
    this.sleepFrames = Math.max(this.sleepFrames, this.heldFor(frames));
    this.sleepHp = this.hp;
    this.isStunned = true;
    this.stunFrames = 0;
    this.isFeared = false;
  }

  wake() {
    this.sleepFrames = 0;
    if (!this.lift) {
      this.isStunned = false;
      this.stunFrames = 0;
    }
  }

  curse(frames, mult) {
    this.curseFrames = Math.max(this.curseFrames, frames);
    this.curseMult = mult;
  }

  // Phantasmal killer: it flees in terror while the fear hurts (`terror`:
  // frames it stays frightened, for as long as the nightmare lasts).
  haunt(frames, dps) {
    this.nightmare = { frames, dps, terror: this.heldFor(frames) };
    this.fearFor(this.nightmare.terror);
  }

  // Regular foes turn on their own side (Orc.brawl); the rest reel.
  confuse(frames) {
    if (this.canBrawl) {
      this.confusedFrames = Math.max(this.confusedFrames, this.heldFor(frames));
      this.isFeared = false;
      this.aggro = true;
    } else {
      this.fearFor(this.heldFor(frames));
    }
  }

  // Reverse gravity: it falls upward and hangs helpless, then crashes down
  // (tickArcana). Returns whether it went up.
  liftUp(frames, caster) {
    this.lift = { frames, total: frames, caster };
    this.isStunned = true;
    this.stunFrames = 0;
    this.knock = null;
    return true;
  }

  crashDown() {
    const caster = this.lift.caster;
    this.lift = null;
    if (this.sleepFrames <= 0) {
      this.isStunned = false;
      this.stunFrames = 0;
    }
    arcanaHit(caster, this, 'gravity', Arcana.gravity.damage);
    const c = this.center();
    this.game.fx.burst(c.x, c.y, 0.3, { color: [0x8a7a6a, 0xc0b0a0], count: 24, speed: 4, life: 0.6, size: 1.2, flat: true });
    this.game.fx.ring(c.x, c.y, { color: 0xa060ff, radius: 50, life: 0.3 });
    this.game.gfx.addShake(0.15);
  }

  // Counterspell: its spells wait at least `frames` more.
  silence(frames) {
    for (const key of this.spellTimers) {
      this[key] = Math.max(this[key] || 0, frames);
    }
    if (this.spellTimers.length) {
      const c = this.center();
      this.game.fx.burst(c.x, c.y, (this.rig ? this.rig.height : 2) + 0.4, { color: [0x9ac8ff, 0xffffff], count: 12, speed: 2, life: 0.6, size: 0.6 });
    }
  }

  // A confused monster's brawl: the nearest body of its own side, if any.
  brawlTarget(range = 420) {
    let best = null;
    let bestD = range;
    for (const e of this.game.hostilesOf('player')) {
      if (e === this || e.killed || e.isWizard || !(e instanceof Enemy) || e.hp <= 0) {
        continue;
      }
      const d = this.distanceTo(e);
      if (d < bestD) {
        bestD = d;
        best = e;
      }
    }
    return best;
  }

  tickDebuffs(k) {
    this.chillFrames = Math.max(0, this.chillFrames - k);
    if (this.sheepFrames > 0) {
      this.sheepFrames = Math.max(0, this.sheepFrames - k);
      if (this.sheepFrames === 0) {
        const c = this.center();
        this.game.fx.burst(c.x, c.y, 1.2, { color: [0xff80e0, 0xffffff], count: 30, speed: 5, life: 0.5, size: 0.9 });
      }
    }
    if (this.isStunned) {
      this.stunFrames += k;
      if (this.stunFrames >= this.stunDuration) {
        this.isStunned = false;
        this.stunFrames = 0;
      }
    }
    if (this.isFeared) {
      this.fearFrames += k;
      if (this.fearFrames >= this.fearDuration) {
        this.isFeared = false;
        this.fearFrames = 0;
      }
    }
    this.tickArcana(k);
  }

  // The newer spells' effects, one step (see defaults).
  tickArcana(k) {
    this.curseFrames = Math.max(0, this.curseFrames - k);
    this.confusedFrames = Math.max(0, this.confusedFrames - k);
    if (this.wardHp > 0) {
      this.wardFrames -= k;
      if (this.wardFrames <= 0) {
        this.wardHp = 0;
      }
    }
    const n = this.nightmare;
    if (n) {
      n.frames -= k;
      n.terror -= k;
      const dmg = this.resisted(n.dps / 60 * k * this.gearBoost('psychic'), 'psychic');
      this.hp -= dmg;
      if (this.onDuelDamage) {
        this.onDuelDamage(dmg, 'phantasm');
      }
      // the terror holds as long as it lasts
      if (!this.isFeared && n.terror > 0 && this.sheepFrames <= 0) {
        this.fearFor(n.terror);
      }
      if (n.frames <= 0) {
        this.nightmare = null;
      }
    }
    if (this.sleepFrames > 0) {
      this.sleepFrames = Math.max(0, this.sleepFrames - k);
      if (this.sleepFrames === 0 || this.hp < this.sleepHp - 0.5) {
        this.wake();
      } else {
        this.sleepHp = Math.max(this.sleepHp, this.hp);
        this.isStunned = true;
        this.stunFrames = 0;
      }
    }
    if (this.lift) {
      this.lift.frames -= k;
      this.isStunned = true;
      this.stunFrames = 0;
      if (this.lift.frames <= 0) {
        this.crashDown();
      }
    }
  }

  // Polymorphed, one step: the sheep ambles about and can neither fight nor
  // cast. Returns false when it is no sheep.
  amble(k) {
    if (this.sheepFrames <= 0) {
      return false;
    }
    this.wander -= k;
    if (this.wander <= 0) {
      const a = Math.random() * Math.PI * 2;
      this.vel.x = Math.cos(a) * 30;
      this.vel.y = Math.sin(a) * 30;
      this.wander = 90;
    }
    this.moveBody(k);
    return true;
  }

  // Feared monsters stumble about, changing direction now and then.
  stumble(k) {
    this.wander -= k;
    if (this.wander <= 0) {
      this.vel.x = Math.floor(Math.random() * 201) - 100;
      this.vel.y = Math.floor(Math.random() * 201) - 100;
      this.wander = 60;
    }
  }

  // Carries a shove (thunderwave) on by one step.
  stepKnock(k) {
    if (!this.knock) {
      return;
    }
    const res = this.game.world.trace(this.pos.x, this.pos.y, this.size.x, this.size.y, this.knock.x * k, this.knock.y * k);
    this.pos.x = res.x;
    this.pos.y = res.y;
    this.knock.frames -= k;
    if (this.knock.frames <= 0) {
      this.knock = null;
    }
  }

  // Moves with the floor's slow zones applied.
  moveBody(k) {
    const slow = this.game.zoneSlow(this);
    this.vel.x *= slow;
    this.vel.y *= slow;
    this.stepKnock(k);
    if (this.chillFrames > 0) {
      // chilled: crawl this step without losing the heading
      const vx = this.vel.x;
      const vy = this.vel.y;
      this.vel.x *= CHILL_SLOW;
      this.vel.y *= CHILL_SLOW;
      this.move(k);
      this.vel.x = vx;
      this.vel.y = vy;
      return;
    }
    this.move(k);
  }

  // --------------------------------------------------------------- view

  syncView(time, dt) {
    const c = this.center();
    this.view.position.set(c.x * UNIT, this.lift ? liftHeight(this.lift, time) : 0, c.y * UNIT);
    const speed = Math.hypot(this.vel.x, this.vel.y);
    const player = this.game.player;
    let facing = null;
    if (speed > 2) {
      facing = Math.atan2(this.vel.x, this.vel.y);
    } else if (player && this.aggro) {
      const pc = player.center();
      facing = Math.atan2(pc.x - c.x, pc.y - c.y);
    }
    this.rig.animate(dt, this.isStunned ? 0 : Math.min(1.3, speed / 90), facing);
    if (this.spawnFrames > 0) {
      // rising out of the ground while waking up
      this.view.position.y = -Math.min(1, this.spawnFrames / 120) * this.rig.height * 0.6;
    }
    if (this.isStunned && !this.sleepFrames && !this.lift && Math.random() < 0.2) {
      this.game.fx.column(c.x, c.y, 20, { color: 0x40ff60, count: 1, rise: 0.6, life: 0.6, size: 0.5 });
    }
    if (this.isFeared && Math.random() < 0.3) {
      this.game.fx.emit(c.x, c.y, this.rig.height + 0.3, { color: 0xc040ff, life: 0.5, size: 0.6, vx: (Math.random() - 0.5) * 2, vz: (Math.random() - 0.5) * 2 });
    }
    arcanaFx(this, time, this.rig.height);
    if (this.rig.aura) {
      this.rig.aura.rotation.z = time;
    }
    if (this.chillFrames > 0 && Math.random() < 0.3) {
      this.game.fx.emit(c.x + (Math.random() - 0.5) * 30, c.y + (Math.random() - 0.5) * 30, Math.random() * this.rig.height, {
        color: 0xbfe8ff, life: 0.5, size: 0.4, vy: -0.5
      });
    }
    this.syncSheep(time);
  }

  // Polymorphed: the body is hidden and a sheep wanders in its place.
  syncSheep(time) {
    const sheep = this.sheepFrames > 0;
    if (sheep && !this.sheep) {
      this.sheep = buildSheep();
      this.rig.root.add(this.sheep);
    }
    if (this.sheep) {
      this.sheep.visible = sheep;
      this.rig.body.visible = !sheep;
      if (sheep) {
        const speed = Math.hypot(this.vel.x, this.vel.y);
        this.sheep.position.y = Math.abs(Math.sin(time * 8)) * 0.08 * Math.min(1, speed / 20);
      }
    }
  }
}

// The newer spells' marks on any body (monsters, wizards): motes of sleep
// drifting up, a curse's dark halo, a nightmare's shadows, confusion's
// colours, a ward's frost and the dust under a lifted body. `height` is the
// body's, in world units.
export function arcanaFx(body, time, height) {
  const fx = body.game.fx;
  const c = body.center();
  const lifted = body.lift ? liftHeight(body.lift, time) : 0;
  const top = height + lifted;
  if (body.sleepFrames > 0 && Math.random() < 0.08) {
    fx.emit(c.x + 6, c.y, top + 0.2, { color: 0xd8d0ff, life: 1.4, size: 0.5, vy: 0.7, vx: 0.3 });
  }
  if (body.curseFrames > 0 && Math.random() < 0.35) {
    const a = time * 4 + Math.random() * 0.5;
    fx.emit(c.x + Math.cos(a) * 16, c.y + Math.sin(a) * 16, top + 0.3, { color: Math.random() < 0.5 ? 0x9a30d0 : 0xd080ff, life: 0.5, size: 0.45, vy: -0.3 });
  }
  if (body.nightmare && Math.random() < 0.5) {
    const a = Math.random() * Math.PI * 2;
    fx.emit(c.x + Math.cos(a) * 26, c.y + Math.sin(a) * 26, lifted + Math.random() * height, { color: Math.random() < 0.6 ? 0x6a20a0 : 0xff4080, life: 0.5, size: 0.8, vx: -Math.cos(a) * 1.5, vz: -Math.sin(a) * 1.5 });
  }
  if (body.confusedFrames > 0 && Math.random() < 0.4) {
    const a = time * 6;
    const colors = [0xff80e0, 0x80ffe0, 0xffe060];
    fx.emit(c.x + Math.cos(a) * 14, c.y + Math.sin(a) * 14, top + 0.4, { color: colors[Math.floor(time * 6) % 3], life: 0.4, size: 0.5 });
  }
  if (body.wardHp > 0 && Math.random() < 0.4) {
    const a = Math.random() * Math.PI * 2;
    fx.emit(c.x + Math.cos(a) * 30, c.y + Math.sin(a) * 30, lifted + Math.random() * height, { color: Math.random() < 0.5 ? 0xe8f8ff : 0x9ad8ff, life: 0.45, size: 0.45, vy: -0.4 });
  }
  if (body.lift && Math.random() < 0.4) {
    fx.emit(c.x + (Math.random() - 0.5) * 30, c.y + (Math.random() - 0.5) * 30, 0.1, { color: 0xa070ff, life: 0.8, size: 0.6, vy: 3 });
  }
}
