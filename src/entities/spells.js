import { Entity } from '../core/entity.js';
import { UNIT } from '../core/constants.js';
import { buildOrb, buildRock, buildIronshot, buildZone, buildMage, buildArrow } from '../render/models.js';
import { dressRig } from '../render/gearModels.js';

// Projectile kinds, numbers from the 2D game (speed px/s, life s, box px).
// `light` is a colour for the dynamic light pool, `trail` a particle colour.
// `simple` bolts can be shot down by a magic missile of the other side
// (which makes two magic missiles cancel out in duels).
export const BoltKinds = {
  missile: { speed: 300, life: 2, size: 20, color: 0xb070ff, enemyColor: 0xff5a5a, radius: 0.15, trail: 0xc090ff, simple: true },
  fireball: { speed: 400, life: 1, size: 30, color: 0xff8a20, radius: 0.28, trail: 0xff6a10, light: 0xff7a20 },
  ironshot: { speed: 1000, life: 0.5, size: 26, pierce: true },
  lightning: { speed: 900, life: 0.5, size: 30, color: 0x9ae8ff, radius: 0.16, trail: 0x80d8ff, light: 0x80d0ff, arcs: true },
  chain: { speed: 900, life: 0.5, size: 30, color: 0x9ae8ff, radius: 0.12, trail: 0x80d8ff, arcs: true },
  root: { speed: 900, life: 0.5, size: 26, color: 0x60ff70, radius: 0.13, trail: 0x40d050 },
  rootchain: { speed: 900, life: 0.5, size: 26, color: 0x60ff70, radius: 0.1, trail: 0x40d050 },
  ray: { speed: 1000, life: 0.4, size: 8, color: 0xff3050, radius: 0.07, trail: 0xff2040 },
  stone: { speed: 225, life: 3, size: 23, rock: true, simple: true },
  missile2: { speed: 300, life: 2, size: 20, color: 0x7dff4a, radius: 0.16, trail: 0x50c030, simple: true },
  // the other races' missiles (Races in levels.js): human and elf archers'
  // arrows, dwarf crossbow quarrels, and their casters' bolts
  arrow: { speed: 320, life: 2.4, size: 18, arrow: 0xd8c8a0, simple: true },
  quarrel: { speed: 380, life: 2, size: 18, arrow: 0x8a8e96, simple: true },
  runebolt: { speed: 300, life: 2, size: 20, color: 0xff9a30, radius: 0.16, trail: 0xff7010, simple: true },
  sunbolt: { speed: 300, life: 2, size: 20, color: 0xffe070, radius: 0.16, trail: 0xffc030, simple: true },
  moonbolt: { speed: 330, life: 2, size: 20, color: 0x70e8ff, radius: 0.15, trail: 0x40b0ff, simple: true },
  // ancient dragons' spells (dragon.js); `element` is what a dragon resists
  // when a shield sends one back at it
  iceshard: { speed: 460, life: 1.4, size: 18, color: 0xd8f4ff, radius: 0.13, trail: 0x9ad8ff, element: 'cold' },
  stormbolt: { speed: 520, life: 1.2, size: 24, color: 0x9ae8ff, radius: 0.18, trail: 0x80d8ff, light: 0x80d0ff, arcs: true, element: 'lightning' },
  acidbolt: { speed: 360, life: 1.6, size: 22, color: 0x9aff30, radius: 0.17, trail: 0x60c020, element: 'poison' },
  fireball2: { speed: 400, life: 1, size: 36, color: 0xff3070, radius: 0.3, trail: 0xff2060, light: 0xff2060, element: 'fire' },
  ironshot2: { speed: 1000, life: 0.5, size: 26, pierce: true },
  scorch: { speed: 700, life: 0.6, size: 18, color: 0xff5020, radius: 0.12, trail: 0xff4010, light: 0xff5010 },
  shadowbolt: { speed: 450, life: 1, size: 41, color: 0x9a40ff, radius: 0.3, trail: 0x6020c0, light: 0x8030ff }
};

const FLY_HEIGHT = 1.45;

// Magic missile looses one dart, or more once a wizard has read more magic
// missile scrolls (`MissileTiers`). Each dart leaves on its own random arc
// (`spread` radians off the aim), curves in on the target while it homes
// (`homeFrames`, turning faster as it goes, from `turn[0]` to `turn[1]`
// radians a frame) and then flies straight on, so a late sidestep dodges.
export const MissileVolley = { spread: [0.35, 1.0], homeFrames: 40, turn: [0.03, 0.11], wobble: 0.04 };

// Magic missile by tier: darts per cast and the cooldown in frames. Each tier
// adds a dart but casts a little slower, so it gains less than it seems.
export const MissileTiers = [null, { darts: 1, cd: 24 }, { darts: 2, cd: 34 }, { darts: 3, cd: 44 }];
export const MAX_MISSILE_TIER = 3;

export function missileTier(caster) {
  return MissileTiers[Math.max(1, Math.min(MAX_MISSILE_TIER, caster.missileTier || 1))];
}

// `target` is the body to home in on, or a point {x, y}.
export function castMissiles(game, caster, team, angle, target, settings = {}) {
  const c = caster.center();
  const { spread } = MissileVolley;
  const count = missileTier(caster).darts;
  for (let i = 0; i < count; i++) {
    const side = i - (count - 1) / 2;
    const off = side === 0
      ? (Math.random() - 0.5) * spread[0] * 2
      : Math.sign(side) * (spread[0] + Math.random() * (spread[1] - spread[0]));
    game.spawn(Projectile, c.x, c.y, {
      kind: 'missile', angle: angle + off, team, timeOwner: caster,
      homing: target, homeFrames: MissileVolley.homeFrames, phase: Math.random() * Math.PI * 2, ...settings
    });
  }
}

// Anything that flies and hurts the other side. `team` is 'player' or
// 'enemy'; a shield turns a bolt around and hands it to the other team.
export class Projectile extends Entity {
  defaults() {
    this.kind = 'missile';
    this.team = 'player';
    this.angle = 0;
    this.duel = false;
    // homing missiles: the body or point they curve toward, and for how long
    this.homing = null;
    this.homeFrames = 0;
    this.phase = 0;
    // over water, lava and chasms (Entity.move)
    this.flies = true;
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
      this.view = null;
    }
    // battles: the armies' stones, arrows and bolts are drawn in batches
    // (render/boltRenderer.js), thousands at a time
    this.batched = !!(this.game.bolts && this.game.bolts.draws(this.kind));
    if (this.batched) {
      return;
    }
    if (spec.rock) {
      this.view = buildRock(0.22);
    } else if (spec.arrow) {
      this.view = buildArrow(spec.arrow);
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
    this.homing = null;
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
    if (this.homing) {
      this.steer(k);
    }
    this.move(k);
    if (this.killed) {
      return;
    }
    if (this.kind === 'missile' && this.shootDown()) {
      return;
    }
    if (this.game.battle) {
      // battles: only the bodies around the bolt, from the battle's grid
      this.game.battle.strike(this, k);
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

  // Curve toward the homing target, a little more sharply every frame, with
  // a slight weave so no two darts fly the same path.
  steer(k) {
    const h = this.homing;
    this.homeFrames -= k;
    if (this.homeFrames <= 0 || h.killed) {
      this.homing = null;
      return;
    }
    const t = h.center ? h.center() : h;
    const c = this.center();
    const dx = t.x - c.x;
    const dy = t.y - c.y;
    // a point is only a waypoint: once there, fly straight on
    if (!h.center && dx * dx + dy * dy < 30 * 30) {
      this.homing = null;
      return;
    }
    const v = MissileVolley;
    const age = 1 - this.homeFrames / v.homeFrames;
    const turn = (v.turn[0] + (v.turn[1] - v.turn[0]) * age) * k;
    let diff = Math.atan2(dy, dx) - this.angle;
    diff = Math.atan2(Math.sin(diff), Math.cos(diff));
    const weave = Math.sin(this.phase + age * 9) * v.wobble * k;
    this.aimAt(this.angle + Math.max(-turn, Math.min(turn, diff)) + weave);
  }

  // Magic missile meets a simple bolt of the other side (a stone, a green
  // bolt, the duel rival's missile): both are spent.
  shootDown() {
    for (const e of this.game.liveBolts()) {
      if (e instanceof Projectile && e !== this && !e.killed && e.team !== this.team && e.spec.simple && this.touches(e)) {
        const c = e.center();
        this.game.fx.burst(c.x, c.y, FLY_HEIGHT, { color: [0xc090ff, 0xffffff, e.spec.trail || 0xbbbbbb], count: 16, speed: 4, life: 0.35, size: 0.6 });
        e.kill();
        this.kill();
        return true;
      }
    }
    return false;
  }

  syncView(time) {
    const c = this.center();
    const fx = this.game.fx;
    if (this.batched) {
      this.game.bolts.write(this.kind, c.x * UNIT, FLY_HEIGHT, c.y * UNIT, -this.angle, this.spec.rock ? time * 12 + this.id : 0);
      // a thinner trail: there are thousands of them
      if (this.spec.trail && Math.random() < 0.3) {
        fx.emit(c.x, c.y, FLY_HEIGHT, { color: this.spec.trail, life: 0.3, size: this.spec.radius * 7 });
      }
      return;
    }
    this.view.position.set(c.x * UNIT, FLY_HEIGHT, c.y * UNIT);
    this.view.rotation.y = -this.angle;
    if (this.spec.rock || this.spec.pierce) {
      this.view.rotation.x = time * 12;
    }
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
// swarm and the fire he leaves behind, and the mage's spirit guardians (which
// follow `follow`) and cloudkill (which drifts by `drift` px/s). `radius` in px.
export class Zone extends Entity {
  defaults() {
    this.kind = 'blizzard';
    this.team = 'player';
    this.radius = 96;
    this.life = 240;
    this.tier = 0;
    this.follow = null;
    this.drift = null;
  }

  init() {
    // spawn coordinates are the centre
    this.size = { x: this.radius * 2, y: this.radius * 2 };
    this.pos.x -= this.radius;
    this.pos.y -= this.radius;
    const color = { blizzard: 0x6ac8ff, meteors: 0xff4a20, fire: 0xff7a20, guardians: 0xffe080, cloud: 0x70d040, acid: 0x90ff30, gloom: 0xd8b040 }[this.kind];
    this.color = color;
    this.view = buildZone(color, this.radius * UNIT, this.kind === 'fire' ? 0.5 : 0.28);
    if (this.kind === 'fire' || this.kind === 'cloud' || this.kind === 'acid') {
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
    if (this.follow) {
      const f = this.follow.center();
      this.pos.x = f.x - this.radius;
      this.pos.y = f.y - this.radius;
    } else if (this.drift) {
      this.pos.x += this.drift.x * k / 60;
      this.pos.y += this.drift.y * k / 60;
    }
    if (game.battle) {
      // battles: only the bodies around the zone, from the battle's grid
      const c = this.center();
      game.battle.eachNear(c.x, c.y, this.radius + 60, this.team === 'player' ? 'enemy' : 'player', (e) => {
        if (!e.killed && this.covers(e)) {
          e.inZone(this, k);
        }
      });
    } else if (this.team === 'player') {
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
    } else if (this.kind === 'guardians') {
      // spectral motes wheeling around the caster
      for (let i = 0; i < 3; i++) {
        const a = time * 2.4 + i * (Math.PI * 2 / 3);
        const r = this.radius * 0.8;
        fx.emit(c.x + Math.cos(a) * r, c.y + Math.sin(a) * r, 1.2 + Math.sin(time * 5 + i) * 0.4, {
          color: i === 0 ? 0xffffff : 0xffe080, life: 0.45, size: 0.8
        });
      }
      this.game.gfx.requestLight(c.x, c.y, 2, 0xffd070, 8);
    } else if (this.kind === 'cloud') {
      for (let i = 0; i < 3; i++) {
        const a = Math.random() * Math.PI * 2;
        const r = Math.sqrt(Math.random()) * this.radius;
        fx.emit(c.x + Math.cos(a) * r, c.y + Math.sin(a) * r, 0.3 + Math.random() * 1.5, {
          color: Math.random() < 0.5 ? 0x5a9a30 : 0x9ad050, life: 1.2, size: 2.2, vy: 0.3, grow: 1.5
        });
      }
    } else if (this.kind === 'acid') {
      // a hissing pool from a black dragon
      if (Math.random() < 0.5) {
        fx.column(c.x, c.y, this.radius * 0.8, { color: [0x90ff30, 0x406010], count: 1, rise: 0.6, life: 0.7, size: 0.6 });
      }
    } else if (this.kind === 'gloom') {
      // the golden wyrm's weakening breath, lingering
      for (let i = 0; i < 2; i++) {
        const a = Math.random() * Math.PI * 2;
        const r = Math.sqrt(Math.random()) * this.radius;
        fx.emit(c.x + Math.cos(a) * r, c.y + Math.sin(a) * r, 0.3 + Math.random() * 1.5, { color: [0xe8c860, 0x8a6a20], life: 1, size: 1.6, vy: 0.4, grow: 1.4 });
      }
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
    // no colours: the decoy looks like the player's wizard
    this.robe = undefined;
    this.hat = undefined;
    this.wander = null;
  }

  init() {
    this.rig = buildMage({ robe: this.robe, hat: this.hat });
    // dressed in its caster's gear, or it would give itself away
    dressRig(this.rig, this.source && this.source.inventory);
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

  // any real blow (cone, thunder, a spiritual weapon...) dispels the decoy
  hurt() {
    this.pop();
  }

  polymorph() {
    this.pop();
  }

  chill() {}

  shove() {}

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
