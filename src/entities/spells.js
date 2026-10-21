import { Entity } from '../core/entity.js';
import { UNIT } from '../core/constants.js';
import { buildOrb, buildRock, buildIronshot, buildZone, buildMage } from '../render/models.js';

// Projectile kinds, numbers from the 2D game (speed px/s, life s, box px).
// `light` is a colour for the dynamic light pool, `trail` a particle colour.
export const BoltKinds = {
  missile: { speed: 300, life: 2, size: 20, color: 0xb070ff, enemyColor: 0xff5a5a, radius: 0.15, trail: 0xc090ff },
  fireball: { speed: 400, life: 1, size: 30, color: 0xff8a20, radius: 0.28, trail: 0xff6a10, light: 0xff7a20 },
  ironshot: { speed: 1000, life: 0.5, size: 26, pierce: true },
  lightning: { speed: 900, life: 0.5, size: 30, color: 0x9ae8ff, radius: 0.16, trail: 0x80d8ff, light: 0x80d0ff, arcs: true },
  chain: { speed: 900, life: 0.5, size: 30, color: 0x9ae8ff, radius: 0.12, trail: 0x80d8ff, arcs: true },
  root: { speed: 900, life: 0.5, size: 26, color: 0x60ff70, radius: 0.13, trail: 0x40d050 },
  rootchain: { speed: 900, life: 0.5, size: 26, color: 0x60ff70, radius: 0.1, trail: 0x40d050 },
  ray: { speed: 1000, life: 0.4, size: 8, color: 0xff3050, radius: 0.07, trail: 0xff2040 },
  stone: { speed: 225, life: 3, size: 23, rock: true },
  missile2: { speed: 300, life: 2, size: 20, color: 0x7dff4a, radius: 0.16, trail: 0x50c030 },
  fireball2: { speed: 400, life: 1, size: 36, color: 0xff3070, radius: 0.3, trail: 0xff2060, light: 0xff2060 },
  ironshot2: { speed: 1000, life: 0.5, size: 26, pierce: true },
  shadowbolt: { speed: 450, life: 1, size: 41, color: 0x9a40ff, radius: 0.3, trail: 0x6020c0, light: 0x8030ff }
};

const FLY_HEIGHT = 1.45;

// Anything that flies and hurts the other side. `team` is 'player' or
// 'enemy'; a shield turns a bolt around and hands it to the other team.
export class Projectile extends Entity {
  defaults() {
    this.kind = 'missile';
    this.team = 'player';
    this.angle = 0;
    this.duel = false;
  }

  init() {
    const spec = BoltKinds[this.kind];
    this.spec = spec;
    this.size = { x: spec.size, y: spec.size };
    // spawn coordinates are the centre of the bolt
    this.pos.x -= spec.size / 2;
    this.pos.y -= spec.size / 2;
    this.life = spec.life * 60;
    this.originX = this.pos.x + spec.size / 2;
    this.originY = this.pos.y + spec.size / 2;
    this.aimAt(this.angle);
    this.buildView();
  }

  buildView() {
    const spec = this.spec;
    if (this.view) {
      this.game.gfx.remove(this.view);
    }
    if (spec.rock) {
      this.view = buildRock(0.22);
    } else if (spec.pierce) {
      this.view = buildIronshot();
    } else {
      const color = this.team === 'enemy' && spec.enemyColor ? spec.enemyColor : spec.color;
      this.view = buildOrb(color, spec.radius);
    }
    this.game.gfx.add(this.view);
  }

  aimAt(angle) {
    this.angle = angle;
    this.vel.x = Math.cos(angle) * this.spec.speed;
    this.vel.y = Math.sin(angle) * this.spec.speed;
  }

  reflect(newTeam) {
    this.team = newTeam;
    this.aimAt(this.angle + Math.PI);
    this.life = this.spec.life * 60;
    this._seenFrame = undefined;
    const c = this.center();
    this.game.fx.burst(c.x, c.y, FLY_HEIGHT, { color: 0x80c0ff, count: 10, speed: 4, life: 0.3, size: 0.6 });
    this.buildView();
  }

  onWallHit() {
    const c = this.center();
    this.game.fx.burst(c.x, c.y, FLY_HEIGHT, { color: this.spec.trail || 0xbbbbbb, count: 8, speed: 3, life: 0.35, size: 0.6 });
    this.kill();
  }

  update(k) {
    this.life -= k;
    if (this.life <= 0) {
      this.kill();
      return;
    }
    this.move(k);
    if (this.killed) {
      return;
    }
    if (this.team === 'player') {
      for (const enemy of this.game.hostilesOf('player')) {
        if (enemy.killed || !this.touches(enemy)) {
          continue;
        }
        // iron shot is not used up by a hit: it pierces and keeps dealing damage
        enemy.takeSpell(this, k);
        if (this.killed) {
          return;
        }
      }
    } else {
      for (const target of this.game.hostilesOf('enemy')) {
        if (!target.killed && this.touches(target)) {
          target.takeSpell(this, k);
          if (this.killed || this.team !== 'enemy') {
            return;
          }
        }
      }
    }
  }

  syncView(time) {
    const c = this.center();
    this.view.position.set(c.x * UNIT, FLY_HEIGHT, c.y * UNIT);
    this.view.rotation.y = -this.angle;
    if (this.spec.rock || this.spec.pierce) {
      this.view.rotation.x = time * 12;
    }
    const fx = this.game.fx;
    if (this.spec.trail) {
      fx.emit(c.x, c.y, FLY_HEIGHT + (Math.random() - 0.5) * 0.15, {
        color: this.team === 'enemy' && this.spec.enemyColor ? this.spec.enemyColor : this.spec.trail,
        life: 0.35, size: this.spec.radius * 7, vx: (Math.random() - 0.5) * 0.6, vy: (Math.random() - 0.5) * 0.6, vz: (Math.random() - 0.5) * 0.6
      });
    }
    if (this.kind === 'fireball' || this.kind === 'fireball2') {
      fx.emit(c.x, c.y, FLY_HEIGHT, { color: 0xffd060, life: 0.25, size: 1.0, vy: 0.8 });
    }
    if (this.spec.arcs && Math.random() < 0.35) {
      const a = Math.random() * Math.PI * 2;
      fx.bolt(c.x, c.y, c.x + Math.cos(a) * 30, c.y + Math.sin(a) * 30, { color: 0xa0e8ff, life: 0.08, width: 0.025, jag: 0.25 });
    }
    if (this.spec.light) {
      this.game.gfx.requestLight(c.x, c.y, FLY_HEIGHT, this.spec.light, 14);
    }
  }
}

// Ground areas: blizzards (player or duel rival), the warlord's meteor
// swarm and the fire he leaves behind. `radius` in px.
export class Zone extends Entity {
  defaults() {
    this.kind = 'blizzard';
    this.team = 'player';
    this.radius = 96;
    this.life = 240;
    this.tier = 0;
  }

  init() {
    // spawn coordinates are the centre
    this.size = { x: this.radius * 2, y: this.radius * 2 };
    this.pos.x -= this.radius;
    this.pos.y -= this.radius;
    const color = { blizzard: 0x6ac8ff, meteors: 0xff4a20, fire: 0xff7a20 }[this.kind];
    this.color = color;
    this.view = buildZone(color, this.radius * UNIT, this.kind === 'fire' ? 0.5 : 0.28);
    if (this.kind === 'fire') {
      this.view.userData.rune.visible = false;
    }
    this.game.gfx.add(this.view);
    this.maxLife = this.life;
  }

  // circle against a body's box
  covers(entity) {
    const c = this.center();
    const nx = Math.max(entity.pos.x, Math.min(c.x, entity.pos.x + entity.size.x));
    const ny = Math.max(entity.pos.y, Math.min(c.y, entity.pos.y + entity.size.y));
    const dx = nx - c.x;
    const dy = ny - c.y;
    return dx * dx + dy * dy < this.radius * this.radius;
  }

  update(k) {
    this.life -= k;
    if (this.life <= 0) {
      this.kill();
      return;
    }
    const game = this.game;
    if (this.team === 'player') {
      for (const enemy of game.hostilesOf('player')) {
        if (!enemy.killed && this.covers(enemy)) {
          enemy.inZone(this, k);
        }
      }
    } else {
      for (const target of game.hostilesOf('enemy')) {
        if (!target.killed && this.covers(target)) {
          target.inZone(this, k);
        }
      }
    }
  }

  syncView(time) {
    const c = this.center();
    this.view.position.set(c.x * UNIT, 0, c.y * UNIT);
    const fade = Math.min(1, this.life / 30, (this.maxLife - this.life + 1) / 10);
    this.view.scale.setScalar(Math.max(0.05, fade));
    if (this.view.userData.rune) {
      this.view.userData.rune.rotation.z = time * (this.kind === 'blizzard' ? 0.6 : -0.9);
    }
    const fx = this.game.fx;
    if (this.kind === 'blizzard') {
      const n = this.tier ? 6 : 3;
      for (let i = 0; i < n; i++) {
        const a = Math.random() * Math.PI * 2;
        const r = Math.sqrt(Math.random()) * this.radius;
        fx.emit(c.x + Math.cos(a) * r, c.y + Math.sin(a) * r, 4 + Math.random() * 2, {
          color: Math.random() < 0.5 ? 0xffffff : 0x9ad8ff, vy: -5, vx: 1.2, life: 0.9, size: 0.45
        });
      }
      this.game.gfx.requestLight(c.x, c.y, 2, 0x60b0ff, 8);
    } else if (this.kind === 'meteors') {
      if (Math.random() < 0.3) {
        const a = Math.random() * Math.PI * 2;
        const r = Math.sqrt(Math.random()) * this.radius;
        const x = c.x + Math.cos(a) * r;
        const y = c.y + Math.sin(a) * r;
        for (let s = 0; s < 6; s++) {
          fx.emit(x - 20 + s * 4, y - 20 + s * 4, 6 - s * 0.9, { color: 0xffa040, vy: -10, vx: 3, vz: 3, life: 0.5, size: 1.4 - s * 0.15 });
        }
        fx.burst(x, y, 0.2, { color: [0xff6020, 0xffc040], count: 10, speed: 4, life: 0.5, size: 0.9, lift: 2, gravity: 6 });
      }
      this.game.gfx.requestLight(c.x, c.y, 2, 0xff4010, 12);
    } else {
      if (Math.random() < 0.5) {
        fx.column(c.x, c.y, this.radius * 0.8, { color: [0xff7020, 0xffc040], count: 1, rise: 1.8, life: 0.6, size: 0.8 });
      }
    }
  }
}

// Mirror image: a decoy copy of a wizard that mirrors its caster's steps for
// five seconds. Orcs who can see it go after it instead of the real mage.
export class MirrorImage extends Entity {
  defaults() {
    this.hp = 100;
    this.life = 300;
    this.source = null;
    this.desiredVel = 100;
    this.robe = 0x2a4fa8;
    this.hat = 0x223c86;
    this.wander = null;
  }

  init() {
    this.rig = buildMage({ robe: this.robe, hat: this.hat });
    this.rig.setAlpha(0.8);
    this.view = this.rig.root;
    this.game.gfx.add(this.view);
    this.game.fx.burst(this.pos.x + 24, this.pos.y + 24, 1.2, { color: 0xc090ff, count: 24, speed: 4, life: 0.5, size: 0.8 });
  }

  pop() {
    const c = this.center();
    this.game.fx.burst(c.x, c.y, 1.2, { color: 0xc090ff, count: 30, speed: 5, life: 0.5, size: 0.9 });
    this.kill();
  }

  update(k) {
    this.life -= k;
    if (this.life <= 0 || this.hp <= 0 || !this.source || this.source.killed) {
      this.pop();
      return;
    }
    if (this.wander) {
      // the duel rival's decoy runs off in a set direction
      this.vel.x = this.wander.x * this.desiredVel * 1.2;
      this.vel.y = this.wander.y * this.desiredVel * 1.2;
    } else {
      // mirror the caster's steps
      const s = this.source;
      this.vel.x = -s.vel.x;
      this.vel.y = -s.vel.y;
    }
    const res = this.move(k);
    if (res && this.wander) {
      if (res.hitX) { this.wander.x = -this.wander.x; }
      if (res.hitY) { this.wander.y = -this.wander.y; }
    }
  }

  takeSpell(p) {
    p.kill();
    this.pop();
  }

  inZone(zone, k) {
    this.hp -= 0.5 * k;
  }

  syncView(_time, dt) {
    const c = this.center();
    this.view.position.set(c.x * UNIT, 0, c.y * UNIT);
    const moving = Math.hypot(this.vel.x, this.vel.y) > 1;
    this.rig.animate(dt, moving ? 1 : 0, moving ? Math.atan2(this.vel.x, this.vel.y) : null);
  }
}
