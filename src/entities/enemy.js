import { Entity } from '../core/entity.js';
import { UNIT } from '../core/constants.js';
import { Projectile } from './spells.js';
import { Arcana } from './arcana.js';
import { buildSheep } from '../render/models.js';
import { dressRig } from '../render/gearModels.js';
import { applyGearPools, gearStat, statOf } from './gear.js';
import { rankPower } from './spellbar.js';

// Damage reflected enemy bolts deal when a shield sends them back.
const REFLECTED_DAMAGE = { iceshard: 30, stormbolt: 60, acidbolt: 50, stone: 20, missile2: 50, fireball2: 75, ironshot2: 200, arrow: 20, quarrel: 24, runebolt: 50, sunbolt: 50, moonbolt: 50 };
const CHAIN_MEMORY = 45;
// share of its speed a chilled monster keeps
const CHILL_SLOW = 0.4;

// Shared parts of every dungeon monster: hit points, the player's spells
// landing on it, stun and fear, and the 3D rig. Every hit carries an element
// (Elements below) and a monster may resist some: `resist` maps an element
// to a damage multiplier (0 immune, 0.5 resistant, 1.5 vulnerable). Orcs and
// their kind resist nothing; dragons (dragon.js) do.
export const Elements = {
  force: 'FORCE', fire: 'FIRE', cold: 'COLD', lightning: 'LIGHTNING', thunder: 'THUNDER', poison: 'POISON',
  necrotic: 'NECROTIC', radiant: 'RADIANT', physical: 'IRON'
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
    this.canBeFeared = false;
    this.spawnFrames = 0;
    this.wander = 0;
    // the mage's D&D spells: chill (cone of cold), knockback (thunderwave),
    // polymorph (regular orcs only)
    this.chillFrames = 0;
    this.knock = null;
    this.knockResist = 0;
    this.canPolymorph = false;
    this.sheepFrames = 0;
    this.resist = null;
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
        for (const other of (game.battle ? game.hostilesOf(p.team) : game.orcs())) {
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

  // Lightning and chain root jump to every foe of the caster within 400px.
  spreadChain(kind, stampKey, team = 'player') {
    const game = this.game;
    const c = this.center();
    for (const other of game.hostilesOf(team)) {
      if (other === this || !other.alive || !(stampKey in other)) {
        continue;
      }
      if (other.distanceTo(this) < 400 && game.navFrame - other[stampKey] >= CHAIN_MEMORY) {
        game.spawn(Projectile, c.x, c.y, { kind, angle: this.angleTo(other), team });
      }
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
      this.hp -= this.resisted((zone.tier ? 1 : 0.5) * k, 'cold');
    } else if (zone.kind === 'guardians') {
      this.hp -= this.resisted(Arcana.guardians.dps / 60 * k * rankPower(zone.timeOwner, 'guardians'), 'radiant');
    } else if (zone.kind === 'cloud') {
      this.hp -= this.resisted(Arcana.cloud.dps / 60 * k * rankPower(zone.timeOwner, 'cloud'), 'poison');
    }
  }

  // Damage after this monster's resistance to the element.
  resisted(dmg, element) {
    const mult = this.resist && element ? this.resist[element] : undefined;
    return mult === undefined ? dmg : dmg * mult;
  }

  slowIn(zone) {
    return zone.tier ? this.blizzardSlow[1] : this.blizzardSlow[0];
  }

  hurt(dmg, element) {
    // gear armour first, then the element's resistance
    dmg *= 1 - gearStat(this, 'armor');
    const taken = this.resisted(dmg, element);
    this.hp -= taken;
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

  // `cause` is what stunned it (root, shadow), for monsters that shrug some off.
  stun(cause) {
    this.isStunned = true;
    this.stunFrames = 0;
    const c = this.center();
    this.game.fx.column(c.x, c.y, 30, { color: [0x40ff60, 0x20a040], count: 16, rise: 1.2, life: 0.8, size: 0.7 });
  }

  chill(frames) {
    if (this.resisted(1, 'cold') === 0) {
      return;
    }
    this.chillFrames = Math.max(this.chillFrames, frames);
  }

  // Pushed away over a few frames; walls stop it. Bosses barely budge.
  shove(angle, distance) {
    const d = distance * (1 - this.knockResist);
    if (d > 1) {
      this.knock = { x: Math.cos(angle) * d / 12, y: Math.sin(angle) * d / 12, frames: 12 };
    }
  }

  polymorph(frames) {
    this.sheepFrames = frames;
    this.isFeared = false;
    this.aggro = false;
  }

  fear() {
    this.isFeared = true;
    this.fearFrames = 0;
    this.vel.x = Math.floor(Math.random() * 201) - 100;
    this.vel.y = Math.floor(Math.random() * 201) - 100;
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
    this.view.position.set(c.x * UNIT, 0, c.y * UNIT);
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
    if (this.isStunned && Math.random() < 0.2) {
      this.game.fx.column(c.x, c.y, 20, { color: 0x40ff60, count: 1, rise: 0.6, life: 0.6, size: 0.5 });
    }
    if (this.isFeared && Math.random() < 0.3) {
      this.game.fx.emit(c.x, c.y, this.rig.height + 0.3, { color: 0xc040ff, life: 0.5, size: 0.6, vx: (Math.random() - 0.5) * 2, vz: (Math.random() - 0.5) * 2 });
    }
    if (this.rig.aura) {
      this.rig.aura.rotation.z = time;
    }
    if (this.chillFrames > 0 && Math.random() < 0.3) {
      this.game.fx.emit(c.x + (Math.random() - 0.5) * 30, c.y + (Math.random() - 0.5) * 30, Math.random() * this.rig.height, {
        color: 0xbfe8ff, life: 0.5, size: 0.4, vy: -0.5
      });
    }
    // polymorphed: the orc is hidden and a sheep wanders in its place
    const sheep = this.sheepFrames > 0;
    if (sheep && !this.sheep) {
      this.sheep = buildSheep();
      this.rig.root.add(this.sheep);
    }
    if (this.sheep) {
      this.sheep.visible = sheep;
      this.rig.body.visible = !sheep;
      if (sheep) {
        this.sheep.position.y = Math.abs(Math.sin(time * 8)) * 0.08 * Math.min(1, speed / 20);
      }
    }
  }
}
