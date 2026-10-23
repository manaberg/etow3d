import * as THREE from 'three';
import { Entity } from '../core/entity.js';
import { UNIT } from '../core/constants.js';
import { buildOrb, buildSpectralBlade } from '../render/models.js';
import { Projectile, Zone } from './spells.js';
import { DuelRules } from './duelRules.js';
import { rankPower } from './spellbar.js';

// The ten spells from D&D that the 2D game never had. Either wizard can
// cast them: the player from the keys, the rival (duels, battles) and the
// dark wizards (survival) from their brain. Against orcs they deal the
// dungeon numbers below; between wizards they use DuelRules.arcana.
// Numbers are in the game's units: pixels (24 to a tile) and 60 frames a second.
export const Arcana = {
  scorch: { damage: 60, spread: 0.16 },
  cone: { damage: 90, range: 280, halfAngle: 0.62, chill: 180 },
  thunder: { damage: 60, radius: 170, push: 150 },
  meteor: { count: 6, scatter: 120, damage: 140, blast: 90 },
  guardians: { radius: 130, life: 480, dps: 60 },
  cloud: { radius: 110, life: 600, dps: 42, drift: 22 },
  heal: { amount: 40 },
  polymorph: { frames: 360, range: 560 },
  disintegrate: { damage: 320, range: 640 },
  weapon: { life: 600, damage: 45, every: 45, reach: 420 }
};

// The side whose spells a caster throws ('player' or 'enemy').
export function teamOf(caster) {
  return caster.isDuelWizard ? 'enemy' : 'player';
}

// One of these spells lands on `target`: wizards take the duel number,
// scaled by the caster's hitScale (dark wizards on survival floors), and
// everything else the dungeon number.
// The element each spell's hit carries (resistances, enemy.js Elements).
const ARCANA_ELEMENTS = { scorch: 'fire', cone: 'cold', thunder: 'thunder', meteor: 'fire', guardians: 'radiant', cloud: 'poison', disintegrate: 'force', weapon: 'radiant' };

// Rank II adds to the damage (spellbar.js rankPower).
export function arcanaHit(caster, target, key, dungeonDamage) {
  const power = rankPower(caster, key);
  if (target.isWizard) {
    const dmg = DuelRules.arcana[key].damage * (caster.hitScale || 1) * power;
    target.hurt(dmg);
    if (target.onDuelDamage) {
      target.onDuelDamage(dmg, key);
    }
    return;
  }
  target.hurt(dungeonDamage * power, ARCANA_ELEMENTS[key]);
}

// Damage per frame of a guardians or cloudkill zone on a wizard.
export function arcanaZoneDamage(zone, k) {
  const caster = zone.timeOwner;
  return DuelRules.arcana[zone.kind].dps / 60 * k * ((caster && caster.hitScale) || 1) * rankPower(caster, zone.kind);
}

// The casts themselves, for any caster. Each returns whether it went off
// (the caller spends the spell).
export const ArcanaCast = {
  // three rays fanned around the aim
  scorch(caster, aim) {
    const c = caster.center();
    for (const offset of [-Arcana.scorch.spread, 0, Arcana.scorch.spread]) {
      caster.game.spawn(Projectile, c.x, c.y, { kind: 'scorch', angle: aim + offset, team: teamOf(caster), duel: !!caster.isDuelWizard, timeOwner: caster });
    }
    caster.rig.swing();
    return true;
  },

  cone(caster, aim) {
    const game = caster.game;
    const fx = game.fx;
    const spec = Arcana.cone;
    const c = caster.center();
    for (const enemy of game.hostilesOf(teamOf(caster))) {
      if (caster.distanceTo(enemy) > spec.range || !game.hasRoomLineOfSight(caster, enemy)) {
        continue;
      }
      let off = caster.angleTo(enemy) - aim;
      off = Math.atan2(Math.sin(off), Math.cos(off));
      if (Math.abs(off) <= spec.halfAngle) {
        arcanaHit(caster, enemy, 'cone', spec.damage);
        enemy.chill(enemy.isWizard ? DuelRules.arcana.cone.chill : spec.chill);
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
    caster.rig.swing();
    return true;
  },

  thunder(caster) {
    const game = caster.game;
    const fx = game.fx;
    const spec = Arcana.thunder;
    const c = caster.center();
    for (const enemy of game.hostilesOf(teamOf(caster))) {
      const d = caster.distanceTo(enemy);
      if (d < spec.radius) {
        arcanaHit(caster, enemy, 'thunder', spec.damage);
        enemy.shove(caster.angleTo(enemy), spec.push * (1 - d / spec.radius * 0.5));
      }
    }
    fx.ring(c.x, c.y, { color: 0x9ab8ff, radius: spec.radius, life: 0.35 });
    fx.ring(c.x, c.y, { color: 0xffffff, radius: spec.radius * 0.6, life: 0.25 });
    fx.burst(c.x, c.y, 0.6, { color: [0xc0d8ff, 0xffffff], count: 40, speed: 9, life: 0.35, size: 0.8, flat: true });
    game.gfx.flash(c.x, c.y, 2, 0xa0c0ff, 50, 0.3);
    game.gfx.addShake(0.5);
    return true;
  },

  meteor(caster, point) {
    const spec = Arcana.meteor;
    for (let i = 0; i < spec.count; i++) {
      const a = Math.random() * Math.PI * 2;
      const r = i === 0 ? 0 : Math.sqrt(Math.random()) * spec.scatter;
      caster.game.spawn(Meteor, point.x + Math.cos(a) * r, point.y + Math.sin(a) * r, {
        delay: 20 + i * 12, caster, team: teamOf(caster), timeOwner: caster
      });
    }
    caster.rig.swing();
    return true;
  },

  guardians(caster) {
    const game = caster.game;
    const c = caster.center();
    game.spawn(Zone, c.x, c.y, {
      kind: 'guardians', team: teamOf(caster), radius: Arcana.guardians.radius, life: Arcana.guardians.life, follow: caster, timeOwner: caster
    });
    game.fx.column(c.x, c.y, Arcana.guardians.radius, { color: [0xffe8a0, 0xffffff], count: 40, rise: 3, life: 0.8, size: 0.8 });
    return true;
  },

  // the cloud rolls away from the caster
  cloud(caster, point) {
    const c = caster.center();
    const a = Math.atan2(point.y - c.y, point.x - c.x);
    const spec = Arcana.cloud;
    caster.game.spawn(Zone, point.x, point.y, {
      kind: 'cloud', team: teamOf(caster), radius: spec.radius, life: spec.life,
      drift: { x: Math.cos(a) * spec.drift, y: Math.sin(a) * spec.drift }, timeOwner: caster
    });
    return true;
  },

  // duelists (and dark wizards, who have duel hit points) heal the duel amount
  heal(caster) {
    const game = caster.game;
    const amount = (caster.isDuelWizard || game.duelMode ? DuelRules.arcana.heal.amount : Arcana.heal.amount) * rankPower(caster, 'heal');
    const before = caster.hp;
    caster.hp = Math.max(caster.hp, Math.min(caster.maxHp, caster.hp + amount));
    game.healFx(caster);
    if (caster === game.player) {
      game.hud.toast('HEALING WORD :: +' + Math.round(caster.hp - before) + ' HP', '#9dffb0');
    }
    return true;
  },

  // turns an orc (or a wizard, briefly) into a sheep; needs sight and range
  polymorph(caster, target) {
    const game = caster.game;
    const fx = game.fx;
    if (!target || caster.distanceTo(target) > Arcana.polymorph.range || !game.hasRoomLineOfSight(caster, target)) {
      return false;
    }
    const tc = target.center();
    if (target.canPolymorph || target.isWizard) {
      target.polymorph((target.isWizard ? DuelRules.arcana.polymorph.frames : Arcana.polymorph.frames) * rankPower(caster, 'polymorph') * (caster.controlScale || 1));
      fx.burst(tc.x, tc.y, 1.2, { color: [0xff80e0, 0xffffff], count: 40, speed: 5, life: 0.6, size: 1 });
    } else {
      if (caster === game.player) {
        game.hud.toast('IT RESISTS THE POLYMORPH', '#ff80e0');
      }
      fx.burst(tc.x, tc.y, 1.6, { color: 0xff80e0, count: 12, speed: 3, life: 0.4, size: 0.7 });
    }
    caster.rig.swing();
    return true;
  },

  // a thin green ray to the first foe in line (walls stop it, a shield soaks it)
  disintegrate(caster, aim) {
    const game = caster.game;
    const spec = Arcana.disintegrate;
    const c = caster.center();
    const dx = Math.cos(aim);
    const dy = Math.sin(aim);
    const wall = game.world.trace(c.x - 2, c.y - 2, 4, 4, dx * spec.range, dy * spec.range, true);
    const reach = Math.hypot(wall.x + 2 - c.x, wall.y + 2 - c.y);
    const hostiles = game.hostilesOf(teamOf(caster));
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
    const color = caster.isDuelWizard ? 0xff6060 : 0x60ff60;
    fx.bolt(c.x, c.y, ex, ey, { color, life: 0.35, width: 0.12, jag: 0.02 });
    fx.bolt(c.x, c.y, ex, ey, { color: 0xe0ffe0, life: 0.25, width: 0.04, jag: 0.0 });
    game.gfx.flash(ex, ey, 1.5, color, 40, 0.3);
    if (hit && hit.shielded) {
      fx.ring(ex, ey, { color: 0x60b0ff, radius: 50, life: 0.3 });
    } else if (hit) {
      arcanaHit(caster, hit, 'disintegrate', spec.damage);
      fx.burst(ex, ey, 1.2, { color: [color, 0x203020, 0xc0ffc0], count: 40, speed: 6, life: 0.7, size: 0.9, gravity: 3 });
      game.gfx.addShake(0.3);
    }
    caster.rig.swing();
    return true;
  },

  weapon(caster) {
    const c = caster.center();
    caster.game.spawn(SpiritualWeapon, c.x, c.y, { owner: caster, timeOwner: caster });
    return true;
  }
};

// The player's casts, from the bar's keys, each step.
export function castArcana(mage) {
  const game = mage.game;
  const input = game.input;
  const mouse = input.ground;
  const aim = mage.aim;
  const cast = (id) => mage.wants(id) && mage.canCast(id);
  const point = { x: mouse.x, y: mouse.y };

  for (const id of ['scorch', 'cone', 'disintegrate']) {
    if (cast(id) && ArcanaCast[id](mage, aim)) {
      mage.spend(id);
    }
  }
  for (const id of ['meteor', 'cloud']) {
    if (cast(id) && ArcanaCast[id](mage, point)) {
      mage.spend(id);
    }
  }
  for (const id of ['thunder', 'guardians', 'heal', 'weapon']) {
    if (cast(id) && ArcanaCast[id](mage)) {
      mage.spend(id);
    }
  }
  if (cast('polymorph') && ArcanaCast.polymorph(mage, game.hoveredHostile() || game.hostileNear(mouse, 80))) {
    mage.spend('polymorph');
  }
}

// Meteor swarm: each rock falls in after a short delay and bursts on impact.
export class Meteor extends Entity {
  defaults() {
    this.delay = 30;
    this.fall = 24;
    this.caster = null;
    this.team = 'player';
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
    for (const enemy of game.hostilesOf(this.team)) {
      // a shield turns a falling rock, as it does the warlord's
      if (!enemy.shielded && Math.hypot(enemy.center().x - c.x, enemy.center().y - c.y) < spec.blast + enemy.size.x / 2) {
        arcanaHit(this.caster || game.player, enemy, 'meteor', spec.damage);
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
      this.target = game.nearestHostile(owner, Arcana.weapon.reach, teamOf(owner));
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
      arcanaHit(owner, this.target, 'weapon', Arcana.weapon.damage);
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
