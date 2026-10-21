import * as THREE from 'three';
import { Entity } from '../core/entity.js';
import { UNIT } from '../core/constants.js';
import { buildOrb, buildSpectralBlade } from '../render/models.js';
import { Projectile, Zone } from './spells.js';

// The ten spells from D&D that the 2D game never had. They are dungeon-only:
// the duel loadout leaves them out, so duels keep the 2D game's balance.
// Numbers are in the game's units: pixels (24 to a tile) and 60 frames a second.
export const Arcana = {
  scorch: { damage: 60, spread: 0.16 },
  cone: { damage: 90, range: 280, halfAngle: 0.62, chill: 180 },
  thunder: { damage: 60, radius: 170, push: 150 },
  meteor: { count: 6, scatter: 120, damage: 140, blast: 90 },
  guardians: { radius: 130, life: 480, dps: 60 },
  cloud: { radius: 110, life: 600, dps: 42, drift: 22 },
  heal: { amount: 40 },
  polymorph: { frames: 360 },
  disintegrate: { damage: 320, range: 640 },
  weapon: { life: 600, damage: 45, every: 45, reach: 420 }
};

// Called from the mage's spell casting each step.
export function castArcana(mage) {
  const game = mage.game;
  const input = game.input;
  const fx = game.fx;
  const c = mage.center();
  const mouse = input.ground;
  const aim = mage.aim;
  const cast = (id) => input.pressed(id) && mage.canCast(id);

  if (cast('scorch')) {
    // three rays fanned around the aim
    for (const offset of [-Arcana.scorch.spread, 0, Arcana.scorch.spread]) {
      game.spawn(Projectile, c.x, c.y, { kind: 'scorch', angle: aim + offset, team: 'player', timeOwner: mage });
    }
    mage.spend('scorch');
    mage.rig.swing();
  }
  if (cast('cone')) {
    const spec = Arcana.cone;
    for (const enemy of game.hostilesOf('player')) {
      if (mage.distanceTo(enemy) > spec.range || !game.hasRoomLineOfSight(mage, enemy)) {
        continue;
      }
      let off = mage.angleTo(enemy) - aim;
      off = Math.atan2(Math.sin(off), Math.cos(off));
      if (Math.abs(off) <= spec.halfAngle) {
        enemy.hurt(spec.damage);
        enemy.chill(spec.chill);
      }
    }
    for (let i = 0; i < 70; i++) {
      const a = aim + (Math.random() * 2 - 1) * spec.halfAngle;
      const r = 30 + Math.random() * (spec.range - 30);
      fx.emit(c.x + Math.cos(a) * r, c.y + Math.sin(a) * r, 0.4 + Math.random() * 1.6, {
        color: Math.random() < 0.5 ? 0xffffff : 0x9ad8ff, life: 0.5, size: 0.7, vy: 0.6, vx: Math.cos(a) * 2, vz: Math.sin(a) * 2
      });
    }
    game.gfx.flash(c.x + Math.cos(aim) * 80, c.y + Math.sin(aim) * 80, 1.5, 0x80d0ff, 30, 0.25);
    mage.spend('cone');
    mage.rig.swing();
  }
  if (cast('thunder')) {
    const spec = Arcana.thunder;
    for (const enemy of game.hostilesOf('player')) {
      const d = mage.distanceTo(enemy);
      if (d < spec.radius) {
        enemy.hurt(spec.damage);
        enemy.shove(mage.angleTo(enemy), spec.push * (1 - d / spec.radius * 0.5));
      }
    }
    fx.ring(c.x, c.y, { color: 0x9ab8ff, radius: spec.radius, life: 0.35 });
    fx.ring(c.x, c.y, { color: 0xffffff, radius: spec.radius * 0.6, life: 0.25 });
    fx.burst(c.x, c.y, 0.6, { color: [0xc0d8ff, 0xffffff], count: 40, speed: 9, life: 0.35, size: 0.8, flat: true });
    game.gfx.flash(c.x, c.y, 2, 0xa0c0ff, 50, 0.3);
    game.gfx.addShake(0.5);
    mage.spend('thunder');
  }
  if (cast('meteor')) {
    const spec = Arcana.meteor;
    for (let i = 0; i < spec.count; i++) {
      const a = Math.random() * Math.PI * 2;
      const r = i === 0 ? 0 : Math.sqrt(Math.random()) * spec.scatter;
      game.spawn(Meteor, mouse.x + Math.cos(a) * r, mouse.y + Math.sin(a) * r, { delay: 20 + i * 12, timeOwner: mage });
    }
    mage.spend('meteor');
    mage.rig.swing();
  }
  if (cast('guardians')) {
    game.spawn(Zone, c.x, c.y, { kind: 'guardians', team: 'player', radius: Arcana.guardians.radius, life: Arcana.guardians.life, follow: mage, timeOwner: mage });
    fx.column(c.x, c.y, Arcana.guardians.radius, { color: [0xffe8a0, 0xffffff], count: 40, rise: 3, life: 0.8, size: 0.8 });
    mage.spend('guardians');
  }
  if (cast('cloud')) {
    // the cloud rolls away from the caster
    const a = Math.atan2(mouse.y - c.y, mouse.x - c.x);
    const spec = Arcana.cloud;
    game.spawn(Zone, mouse.x, mouse.y, {
      kind: 'cloud', team: 'player', radius: spec.radius, life: spec.life, drift: { x: Math.cos(a) * spec.drift, y: Math.sin(a) * spec.drift }, timeOwner: mage
    });
    mage.spend('cloud');
  }
  if (cast('heal')) {
    const before = mage.hp;
    mage.hp = Math.max(mage.hp, Math.min(mage.maxHp, mage.hp + Arcana.heal.amount));
    game.healFx(mage);
    game.hud.toast('HEALING WORD :: +' + Math.round(mage.hp - before) + ' HP', '#9dffb0');
    mage.spend('heal');
  }
  if (cast('polymorph')) {
    const target = game.hoveredHostile() || hostileNear(game, mouse, 80);
    if (target) {
      const tc = target.center();
      if (target.canPolymorph) {
        target.polymorph(Arcana.polymorph.frames);
        fx.burst(tc.x, tc.y, 1.2, { color: [0xff80e0, 0xffffff], count: 40, speed: 5, life: 0.6, size: 1 });
      } else {
        game.hud.toast('IT RESISTS THE POLYMORPH', '#ff80e0');
        fx.burst(tc.x, tc.y, 1.6, { color: 0xff80e0, count: 12, speed: 3, life: 0.4, size: 0.7 });
      }
      mage.spend('polymorph');
      mage.rig.swing();
    }
  }
  if (cast('disintegrate')) {
    disintegrate(mage, aim);
    mage.spend('disintegrate');
    mage.rig.swing();
  }
  if (cast('weapon')) {
    game.spawn(SpiritualWeapon, c.x, c.y, { owner: mage, timeOwner: mage });
    mage.spend('weapon');
  }
}

function hostileNear(game, point, range) {
  let best = null;
  let bestD = range;
  for (const e of game.hostilesOf('player')) {
    const d = Math.hypot(e.center().x - point.x, e.center().y - point.y);
    if (d < bestD) {
      bestD = d;
      best = e;
    }
  }
  return best;
}

// A thin green ray to the first enemy in line (walls stop it).
function disintegrate(mage, aim) {
  const game = mage.game;
  const spec = Arcana.disintegrate;
  const c = mage.center();
  const dx = Math.cos(aim);
  const dy = Math.sin(aim);
  // how far the ray gets before a wall
  const wall = game.world.trace(c.x - 2, c.y - 2, 4, 4, dx * spec.range, dy * spec.range);
  const reach = Math.hypot(wall.x + 2 - c.x, wall.y + 2 - c.y);
  const hostiles = game.hostilesOf('player');
  let hit = null;
  let end = reach;
  for (let t = 20; t <= reach && !hit; t += 10) {
    for (const e of hostiles) {
      if (e.containsPoint(c.x + dx * t, c.y + dy * t, 6)) {
        hit = e;
        end = t;
        break;
      }
    }
  }
  const ex = c.x + dx * end;
  const ey = c.y + dy * end;
  const fx = game.fx;
  fx.bolt(c.x, c.y, ex, ey, { color: 0x60ff60, life: 0.35, width: 0.12, jag: 0.02 });
  fx.bolt(c.x, c.y, ex, ey, { color: 0xe0ffe0, life: 0.25, width: 0.04, jag: 0.0 });
  game.gfx.flash(ex, ey, 1.5, 0x60ff60, 40, 0.3);
  if (hit) {
    hit.hurt(spec.damage);
    fx.burst(ex, ey, 1.2, { color: [0x60ff60, 0x203020, 0xc0ffc0], count: 40, speed: 6, life: 0.7, size: 0.9, gravity: 3 });
    game.gfx.addShake(0.3);
  }
}

// Meteor swarm: each rock falls in after a short delay and bursts on impact.
export class Meteor extends Entity {
  defaults() {
    this.delay = 30;
    this.fall = 24;
  }

  init() {
    this.size = { x: 4, y: 4 };
    this.pos.x -= 2;
    this.pos.y -= 2;
    // the view sits on the impact point: a pulsing ring, and the rock above it
    this.view = new THREE.Group();
    this.rock = buildOrb(0xff7a20, 0.45, 5);
    this.rock.visible = false;
    this.mark = new THREE.Mesh(
      new THREE.RingGeometry(0.8, 1, 24),
      new THREE.MeshBasicMaterial({ color: 0xff5020, transparent: true, opacity: 0.6, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide })
    );
    this.mark.rotation.x = -Math.PI / 2;
    this.mark.position.y = 0.06;
    const r = Arcana.meteor.blast * UNIT;
    this.mark.scale.set(r, r, 1);
    this.view.add(this.rock, this.mark);
    this.game.gfx.add(this.view);
  }

  update(k) {
    this.delay -= k;
    if (this.delay > 0) {
      return;
    }
    this.fall -= k;
    if (this.fall <= 0) {
      this.impact();
    }
  }

  impact() {
    const game = this.game;
    const c = this.center();
    const spec = Arcana.meteor;
    for (const enemy of game.hostilesOf('player')) {
      if (Math.hypot(enemy.center().x - c.x, enemy.center().y - c.y) < spec.blast + enemy.size.x / 2) {
        enemy.hurt(spec.damage);
      }
    }
    const fx = game.fx;
    fx.burst(c.x, c.y, 0.5, { color: [0xff6010, 0xffb030, 0xffe080], count: 50, speed: 8, life: 0.6, size: 1.5, gravity: 4, lift: 3 });
    fx.ring(c.x, c.y, { color: 0xff8030, radius: spec.blast, life: 0.45 });
    game.gfx.flash(c.x, c.y, 2, 0xff6010, 70, 0.4);
    game.gfx.addShake(0.35);
    this.kill();
  }

  syncView(time) {
    const c = this.center();
    this.view.position.set(c.x * UNIT, 0, c.y * UNIT);
    this.mark.material.opacity = 0.35 + Math.sin(time * 20) * 0.25;
    if (this.delay > 0) {
      return;
    }
    // falls in steeply from up and behind
    const t = Math.max(0, this.fall / 24);
    this.rock.visible = true;
    this.rock.position.set(-t * 6, t * 16, -t * 6);
    this.game.fx.emit(c.x - t * 6 / UNIT, c.y - t * 6 / UNIT, t * 16, { color: [0xff8030, 0xffd060], life: 0.4, size: 1.2, vy: 0.5 });
    this.game.gfx.requestLight(c.x, c.y, 2 + t * 6, 0xff6020, 18);
  }
}

// Spiritual weapon: a spectral sword that hunts the nearest foe near its
// caster and strikes it every three quarters of a second.
export class SpiritualWeapon extends Entity {
  defaults() {
    this.owner = null;
    this.life = Arcana.weapon.life;
    this.strike = 0;
    this.target = null;
    this.swing = 0;
  }

  init() {
    this.size = { x: 20, y: 20 };
    this.view = buildSpectralBlade();
    this.game.gfx.add(this.view);
    this.height = 2;
  }

  update(k) {
    const game = this.game;
    const owner = this.owner;
    this.life -= k;
    if (this.life <= 0 || !owner || owner.killed || owner.dead) {
      const c = this.center();
      game.fx.burst(c.x, c.y, this.height, { color: 0x80e0ff, count: 20, speed: 4, life: 0.5, size: 0.7 });
      this.kill();
      return;
    }
    this.strike = Math.max(0, this.strike - k);
    this.swing = Math.max(0, this.swing - k);
    if (!this.target || !this.target.alive || owner.distanceTo(this.target) > Arcana.weapon.reach) {
      this.target = game.nearestHostile(owner, Arcana.weapon.reach);
    }
    // glide (through walls, it is a spirit) to the target or beside the caster
    const oc = owner.center();
    let gx = oc.x + 40;
    let gy = oc.y - 30;
    if (this.target) {
      const tc = this.target.center();
      gx = tc.x;
      gy = tc.y;
    }
    const c = this.center();
    const step = Math.min(1, 0.12 * k);
    this.pos.x += (gx - c.x) * step;
    this.pos.y += (gy - c.y) * step;
    if (this.target && this.strike <= 0 && Math.hypot(gx - c.x, gy - c.y) < 40) {
      this.target.hurt(Arcana.weapon.damage);
      this.strike = Arcana.weapon.every;
      this.swing = 14;
      game.fx.burst(gx, gy, 1.4, { color: [0x80e0ff, 0xffffff], count: 14, speed: 5, life: 0.35, size: 0.7 });
    }
  }

  syncView(time) {
    const c = this.center();
    this.view.position.set(c.x * UNIT, this.height + Math.sin(time * 3) * 0.2, c.y * UNIT);
    const target = this.target;
    if (target) {
      const tc = target.center();
      this.view.rotation.y = Math.atan2(tc.x - c.x, tc.y - c.y);
    } else {
      this.view.rotation.y = time * 2;
    }
    // a chopping swing when it strikes
    this.view.rotation.x = this.swing > 0 ? -1.6 * Math.sin((this.swing / 14) * Math.PI) : 0.25;
    if (Math.random() < 0.4) {
      this.game.fx.emit(c.x, c.y, this.height + Math.random() * 1.5, { color: 0x80e0ff, life: 0.4, size: 0.4 });
    }
    this.game.gfx.requestLight(c.x, c.y, this.height + 1, 0x60c0ff, 8);
  }
}
