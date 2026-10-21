import { Entity } from '../core/entity.js';
import { UNIT } from '../core/constants.js';
import { Projectile } from './spells.js';

// Damage reflected enemy bolts deal when a shield sends them back.
const REFLECTED_DAMAGE = { stone: 20, missile2: 50, fireball2: 75, ironshot2: 200 };
const CHAIN_MEMORY = 45;

// Shared parts of every dungeon monster: hit points, the player's spells
// landing on it, stun and fear, and the 3D rig.
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
  }

  get alive() {
    return !this.killed && this.hp > 0;
  }

  // --------------------------------------------------------------- damage

  takeSpell(p, k) {
    const game = this.game;
    const player = game.player;
    const c = this.center();
    const fx = game.fx;
    switch (p.kind) {
      case 'missile':
        this.hurt(player && player.hasMsring ? 76 : 51);
        fx.burst(c.x, c.y, 1.4, { color: [0xb070ff, 0xffffff], count: 12, speed: 4, life: 0.35, size: 0.7 });
        p.kill();
        break;
      case 'fireball': {
        this.hurt(110);
        p.kill();
        this.explode(c);
        for (const other of game.orcs()) {
          if (other !== this && other.alive && other.distanceTo(this) < this.fireSplash) {
            other.hurt(101);
          }
        }
        break;
      }
      case 'ironshot':
        this.hurt(100 * k);
        if (Math.random() < 0.5) {
          fx.burst(c.x, c.y, 1.4, { color: [0xd0d8e0, 0xff3020], count: 6, speed: 5, life: 0.3, size: 0.5 });
        }
        break;
      case 'lightning':
        this.hurt(101);
        p.kill();
        this.chainedAt = game.navFrame;
        fx.bolt(p.originX, p.originY, c.x, c.y, { color: 0xa0e8ff, life: 0.25, width: 0.07 });
        game.gfx.flash(c.x, c.y, 2, 0x80d0ff, 30, 0.2);
        this.spreadChain('chain', 'chainedAt');
        break;
      case 'chain':
        if (game.navFrame - this.chainedAt < CHAIN_MEMORY) {
          return;
        }
        this.chainedAt = game.navFrame;
        this.hurt(player && player.hasLg2 ? 101 : 75);
        fx.bolt(p.originX, p.originY, c.x, c.y, { color: 0xa0e8ff, life: 0.2, width: 0.05 });
        p.kill();
        break;
      case 'root':
        this.stun();
        p.kill();
        this.rootedAt = game.navFrame;
        this.spreadChain('rootchain', 'rootedAt');
        break;
      case 'rootchain':
        if (game.navFrame - this.rootedAt < CHAIN_MEMORY) {
          return;
        }
        this.rootedAt = game.navFrame;
        this.stun();
        p.kill();
        break;
      case 'ray':
        this.hurt(15);
        this.vel.x /= 3;
        this.vel.y /= 3;
        if (player) {
          player.hp += 3;
        }
        fx.emit(c.x, c.y, 1.4, { color: 0xff2040, life: 0.4, size: 0.8, vy: 1 });
        p.kill();
        break;
      case 'shadowbolt':
        this.stun();
        p.kill();
        break;
      default:
        this.hurt(REFLECTED_DAMAGE[p.kind] || 20);
        fx.burst(c.x, c.y, 1.4, { color: 0xffffff, count: 8, speed: 3, life: 0.3, size: 0.6 });
        p.kill();
    }
  }

  // Lightning and chain root jump to every orc within 400px.
  spreadChain(kind, stampKey) {
    const game = this.game;
    const c = this.center();
    for (const other of game.hostilesOf('player')) {
      if (other === this || !other.alive || !(stampKey in other)) {
        continue;
      }
      if (other.distanceTo(this) < 400 && game.navFrame - other[stampKey] >= CHAIN_MEMORY) {
        game.spawn(Projectile, c.x, c.y, { kind, angle: this.angleTo(other), team: 'player' });
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
      this.hp -= (zone.tier ? 1 : 0.5) * k;
    }
  }

  slowIn(zone) {
    return zone.tier ? this.blizzardSlow[1] : this.blizzardSlow[0];
  }

  hurt(dmg) {
    this.hp -= dmg;
    if (this.rig) {
      this.rig.hit();
    }
  }

  stun() {
    this.isStunned = true;
    this.stunFrames = 0;
    const c = this.center();
    this.game.fx.column(c.x, c.y, 30, { color: [0x40ff60, 0x20a040], count: 16, rise: 1.2, life: 0.8, size: 0.7 });
  }

  fear() {
    this.isFeared = true;
    this.fearFrames = 0;
    this.vel.x = Math.floor(Math.random() * 201) - 100;
    this.vel.y = Math.floor(Math.random() * 201) - 100;
  }

  tickDebuffs(k) {
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

  // Moves with the floor's slow zones applied.
  moveBody(k) {
    const slow = this.game.zoneSlow(this);
    this.vel.x *= slow;
    this.vel.y *= slow;
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
  }
}
