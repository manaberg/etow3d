import * as THREE from 'three';
import { Entity } from '../core/entity.js';
import { UNIT } from '../core/constants.js';
import { buildOrb, buildSpectralBlade } from '../render/models.js';
import { Projectile, Zone, staffHead } from './spells.js';
import { DuelRules } from './duelRules.js';
import { rankPower } from './spellbar.js';

// The twenty spells from D&D that the 2D game never had: the first ten
// (scorching ray to spiritual weapon) and ten more (sleep to reverse
// gravity) that each work in a way no other spell does. Either wizard can
// cast them: the player from the keys, the rival (duels, battles) from its
// brain, and an orc cleric or mage the one it knows (bosses.js OrcArcana).
// Against orcs they deal the dungeon numbers below; on a wizard they use
// DuelRules.arcana.
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
  weapon: { life: 600, damage: 45, every: 45, reach: 420 },
  // the weakest foes in the burst sleep, as many as `pool` health covers,
  // and the rest doze for `doze`; any lost health wakes a sleeper
  sleep: { radius: 120, pool: 320, frames: 720, doze: 300 },
  // `ward` health soaked before the wizard's own, for `frames`; a foe that
  // strikes through it takes `cold` and is chilled
  agathys: { ward: 50, frames: 600, cold: 30, chill: 120 },
  // a cursed foe takes `mult` times the damage from everything
  curse: { frames: 600, mult: 1.5, range: 560 },
  // a rolling ball that burns everything within `radius` every `every` frames
  sphere: { life: 600, speed: 110, damage: 28, every: 30, radius: 40, leash: 520 },
  // hostile bolts within `radius` are unmade and casters silenced
  counter: { radius: 280, silence: 240 },
  swap: { range: 560 },
  // the haunted foe flees (if it can) and takes `dps` psychic damage
  phantasm: { frames: 300, dps: 40, range: 560 },
  // regular foes fight each other; the rest reel
  confusion: { radius: 120, frames: 480 },
  // a whirlpool that drags foes `pull` px/s toward its eye
  maelstrom: { radius: 150, life: 360, pull: 80, dps: 30 },
  // foes hang helpless for `frames`, then fall for `damage`
  gravity: { radius: 130, frames: 110, damage: 150 }
};

// The side whose spells a caster throws ('player' or 'enemy'): the player's
// wizard, or the rival and the monsters.
export function teamOf(caster) {
  return caster.isWizard && !caster.isDuelWizard ? 'player' : 'enemy';
}

// One of these spells lands on `target`: wizards take the duel number, and
// everything else the dungeon number.
// The element each spell's hit carries (resistances, enemy.js Elements).
const ARCANA_ELEMENTS = {
  scorch: 'fire', cone: 'cold', thunder: 'thunder', meteor: 'fire', guardians: 'radiant', cloud: 'poison', disintegrate: 'force', weapon: 'radiant',
  agathys: 'cold', sphere: 'fire', phantasm: 'psychic', maelstrom: 'physical', gravity: 'force'
};

// Rank II adds to the damage (spellbar.js rankPower).
export function arcanaHit(caster, target, key, dungeonDamage) {
  const power = rankPower(caster, key);
  if (target.isWizard) {
    const dmg = DuelRules.arcana[key].damage * power;
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
  return DuelRules.arcana[zone.kind].dps / 60 * k * rankPower(caster, zone.kind);
}

// A maelstrom drags a body `speed` px/s toward its eye; walls stop it and
// heavy bodies (bosses, dragons) barely budge.
export function pullToward(body, zone, speed, k) {
  const z = zone.center();
  const c = body.center();
  const dx = z.x - c.x;
  const dy = z.y - c.y;
  const d = Math.hypot(dx, dy);
  if (d < 6) {
    return;
  }
  const step = Math.min(d - 4, speed * k / 60) * (1 - (body.knockResist || 0));
  const res = body.game.world.trace(body.pos.x, body.pos.y, body.size.x, body.size.y, dx / d * step, dy / d * step);
  body.pos.x = res.x;
  body.pos.y = res.y;
}

// How high (world units) a body lifted by reverse gravity hangs: it shoots
// up, bobs, and drops in its last frames.
export function liftHeight(lift, time) {
  const up = Math.min(1, (lift.total - lift.frames) / 20);
  const down = Math.min(1, lift.frames / 9);
  return 3.2 * Math.min(1 - (1 - up) * (1 - up), 1 - (1 - down) * (1 - down)) + Math.sin(time * 3 + lift.total) * 0.15 * up * down;
}

// Whether a spell aimed at one foe can reach it: in range and in sight.
function inReach(caster, target, range) {
  return !!target && caster.distanceTo(target) <= range && caster.game.hasRoomLineOfSight(caster, target);
}

// The hostiles of `caster` whose bodies reach into a circle (in a battle,
// from the battle's grid rather than the whole army).
function hostilesAround(caster, point, radius) {
  const game = caster.game;
  const team = teamOf(caster);
  const inside = (e) => {
    if (e.killed) {
      return false;
    }
    const c = e.center();
    return Math.hypot(c.x - point.x, c.y - point.y) < radius + e.size.x / 2;
  };
  if (game.battle) {
    const out = [];
    game.battle.eachNear(point.x, point.y, radius + 60, team === 'player' ? 'enemy' : 'player', (e) => {
      if (inside(e)) {
        out.push(e);
      }
    });
    return out;
  }
  return game.hostilesOf(team).filter(inside);
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
    // the cold pours out of the staff head
    const head = staffHead(caster, true);
    if (head) {
      for (let i = 0; i < 24; i++) {
        const a = aim + (Math.random() * 2 - 1) * spec.halfAngle;
        const s = 6 + Math.random() * 8;
        fx.emit(head.x, head.y, head.h, {
          color: Math.random() < 0.5 ? 0xffffff : 0x9ad8ff, life: 0.35, size: 0.6, vx: Math.cos(a) * s, vz: Math.sin(a) * s, vy: -head.h * 1.5, drag: 2
        });
      }
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
    // the staff's foot strikes the floor
    caster.rig.gesture('slam');
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
    caster.rig.gesture('raise');
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

  // duelists heal the duel amount
  heal(caster) {
    const game = caster.game;
    const amount = (caster.isDuelWizard || game.duelMode ? DuelRules.arcana.heal.amount : Arcana.heal.amount) * rankPower(caster, 'heal');
    const before = caster.hp;
    caster.hp = Math.max(caster.hp, Math.min(caster.maxHp, caster.hp + amount));
    game.healFx(caster);
    if (caster === game.player) {
      game.hud.toast('HEALING WORD :: +' + Math.round(caster.hp - before) + ' HP', '#9dffb0');
    }
    caster.rig.gesture('raise');
    return true;
  },

  // turns a foe into a sheep (a boss or a dragon not for long, a wizard
  // briefly); needs sight and range
  polymorph(caster, target) {
    const game = caster.game;
    if (!target || caster.distanceTo(target) > Arcana.polymorph.range || !game.hasRoomLineOfSight(caster, target)) {
      return false;
    }
    const tc = target.center();
    target.polymorph((target.isWizard ? DuelRules.arcana.polymorph.frames : Arcana.polymorph.frames) * rankPower(caster, 'polymorph'));
    game.fx.burst(tc.x, tc.y, 1.2, { color: [0xff80e0, 0xffffff], count: 40, speed: 5, life: 0.6, size: 1 });
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
    // the ray leaves the staff head
    const from = staffHead(caster, true) || { x: c.x, y: c.y, h: 1.4 };
    fx.bolt(from.x, from.y, ex, ey, { color, life: 0.35, width: 0.12, jag: 0.02, h: from.h, h2: 1.4 });
    fx.bolt(from.x, from.y, ex, ey, { color: 0xe0ffe0, life: 0.25, width: 0.04, jag: 0.0, h: from.h, h2: 1.4 });
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
    caster.rig.gesture('raise');
    return true;
  },

  // the weakest foes in the burst fall asleep first, while the pool of
  // health lasts, and the rest only doze; a wizard only dozes
  sleep(caster, point) {
    const game = caster.game;
    const fx = game.fx;
    const spec = Arcana.sleep;
    let pool = spec.pool * rankPower(caster, 'sleep');
    const caught = hostilesAround(caster, point, spec.radius).sort((a, b) => a.hp - b.hp);
    for (const e of caught) {
      if (e.isWizard) {
        if (!e.shielded) {
          e.sleep(DuelRules.arcana.sleep.frames);
        }
      } else if (e.hp <= pool) {
        pool -= Math.max(0, e.hp);
        e.sleep(spec.frames);
      } else {
        e.sleep(spec.doze);
      }
    }
    fx.column(point.x, point.y, spec.radius, { color: [0xd8d0ff, 0x9a90e0, 0xffffff], count: 50, h: 3, rise: -0.6, life: 1.4, size: 0.8 });
    fx.ring(point.x, point.y, { color: 0xb0a0ff, radius: spec.radius, life: 0.7 });
    caster.rig.swing();
    return true;
  },

  agathys(caster) {
    const game = caster.game;
    const duel = caster.isDuelWizard || game.duelMode;
    const ward = (duel ? DuelRules.arcana.agathys.ward : Arcana.agathys.ward) * rankPower(caster, 'agathys');
    caster.wardHp = Math.max(caster.wardHp || 0, ward);
    caster.wardMax = caster.wardHp;
    caster.wardFrames = Arcana.agathys.frames;
    const c = caster.center();
    game.fx.burst(c.x, c.y, 1.4, { color: [0xe8f8ff, 0x9ad8ff, 0xffffff], count: 36, speed: 4, life: 0.6, size: 0.7 });
    game.fx.ring(c.x, c.y, { color: 0xbfe8ff, radius: 60, life: 0.5 });
    if (caster === game.player) {
      game.hud.toast('ARMOR OF AGATHYS :: ' + Math.round(caster.wardHp) + ' WARD', '#bfe8ff');
    }
    caster.rig.gesture('raise');
    return true;
  },

  // a foe in sight and range takes more damage from everything for a while
  curse(caster, target) {
    if (!inReach(caster, target, Arcana.curse.range)) {
      return false;
    }
    const spec = target.isWizard ? DuelRules.arcana.curse : Arcana.curse;
    target.curse(spec.frames * rankPower(caster, 'curse'), spec.mult);
    const tc = target.center();
    const fx = caster.game.fx;
    fx.burst(tc.x, tc.y, 1.8, { color: [0x9a30d0, 0x30083a, 0xd080ff], count: 30, speed: 3, life: 0.7, size: 0.9, gravity: -1 });
    fx.ring(tc.x, tc.y, { color: 0x9a30d0, radius: 44, life: 0.5 });
    const from = staffHead(caster, true) || { x: caster.center().x, y: caster.center().y, h: 1.4 };
    fx.bolt(from.x, from.y, tc.x, tc.y, { color: 0x8020c0, life: 0.25, width: 0.03, jag: 0.5, h: from.h, h2: 1.4 });
    caster.rig.swing();
    return true;
  },

  // one sphere a caster: a new one snuffs the last
  sphere(caster) {
    const game = caster.game;
    for (const e of game.entities) {
      if (e instanceof FlamingSphere && e.owner === caster && !e.killed) {
        e.fizzle();
      }
    }
    const c = caster.center();
    game.spawn(FlamingSphere, c.x, c.y, { owner: caster, team: teamOf(caster), timeOwner: caster, drop: staffHead(caster, true) });
    caster.rig.swing();
    return true;
  },

  // unmakes the other side's bolts, falling meteors and spheres around the
  // caster, and silences the casters among its foes there
  counter(caster) {
    const game = caster.game;
    const fx = game.fx;
    const team = teamOf(caster);
    const radius = Arcana.counter.radius * rankPower(caster, 'counter');
    const c = caster.center();
    for (const e of game.entities) {
      if (e.killed || !e.team || e.team === team || !(e instanceof Projectile || e instanceof Meteor || e instanceof FlamingSphere)) {
        continue;
      }
      const ec = e.center();
      if (Math.hypot(ec.x - c.x, ec.y - c.y) < radius) {
        fx.burst(ec.x, ec.y, 1.4, { color: [0xffffff, 0x9ac8ff], count: 12, speed: 3, life: 0.35, size: 0.6 });
        e.kill();
      }
    }
    for (const foe of hostilesAround(caster, c, radius)) {
      if (foe.silence) {
        foe.silence(foe.isWizard ? DuelRules.arcana.counter.silence : Arcana.counter.silence);
      }
    }
    fx.ring(c.x, c.y, { color: 0x9ac8ff, radius, life: 0.5 });
    fx.ring(c.x, c.y, { color: 0xffffff, radius: radius * 0.5, from: radius, life: 0.4 });
    game.gfx.flash(c.x, c.y, 2, 0xa0c8ff, 40, 0.25);
    caster.rig.swing();
    return true;
  },

  // trade places with a foe in sight, however big; there must be room for
  // both bodies
  swap(caster, target) {
    const game = caster.game;
    if (!inReach(caster, target, Arcana.swap.range)) {
      return false;
    }
    const a = caster.center();
    const b = target.center();
    const fx = game.fx;
    const mine = { x: b.x - caster.size.x / 2, y: b.y - caster.size.y / 2 };
    const theirs = { x: a.x - target.size.x / 2, y: a.y - target.size.y / 2 };
    if (!game.world.canStandAt(mine.x, mine.y, caster.size.x, caster.size.y) || !game.world.canStandAt(theirs.x, theirs.y, target.size.x, target.size.y)) {
      if (caster === game.player) {
        game.hud.toast('NO ROOM TO TRADE PLACES', '#c0a0ff');
      }
      return false;
    }
    caster.pos.x = mine.x;
    caster.pos.y = mine.y;
    target.pos.x = theirs.x;
    target.pos.y = theirs.y;
    caster.knock = null;
    target.knock = null;
    for (const p of [a, b]) {
      fx.burst(p.x, p.y, 1.2, { color: [0xc0a0ff, 0xffffff], count: 26, speed: 5, life: 0.5, size: 0.9 });
      fx.ring(p.x, p.y, { color: 0xb080ff, radius: 50, life: 0.4 });
    }
    fx.bolt(a.x, a.y, b.x, b.y, { color: 0xc0a0ff, life: 0.3, width: 0.05, jag: 0.5 });
    return true;
  },

  // a nightmare hunts one foe: it flees, and the terror hurts
  phantasm(caster, target) {
    if (!inReach(caster, target, Arcana.phantasm.range)) {
      return false;
    }
    const spec = target.isWizard ? DuelRules.arcana.phantasm : Arcana.phantasm;
    target.haunt(spec.frames, spec.dps * rankPower(caster, 'phantasm'), caster);
    const tc = target.center();
    const fx = caster.game.fx;
    fx.burst(tc.x, tc.y, 2, { color: [0x3a0a5a, 0xb040ff, 0x000000], count: 36, speed: 4, life: 0.8, size: 1.2 });
    caster.game.gfx.flash(tc.x, tc.y, 2, 0x8020ff, 30, 0.3);
    caster.rig.swing();
    return true;
  },

  // regular foes in the burst turn on each other; the rest reel
  confusion(caster, point) {
    const spec = Arcana.confusion;
    const frames = spec.frames * rankPower(caster, 'confusion');
    for (const e of hostilesAround(caster, point, spec.radius)) {
      e.confuse(e.isWizard ? DuelRules.arcana.confusion.frames : frames);
    }
    const fx = caster.game.fx;
    fx.column(point.x, point.y, spec.radius, { color: [0xff80e0, 0x80ffe0, 0xffe060, 0xa080ff], count: 50, rise: 1.6, life: 1, size: 0.8, jitter: 2 });
    fx.ring(point.x, point.y, { color: 0xff80e0, radius: spec.radius, life: 0.6 });
    caster.rig.swing();
    return true;
  },

  maelstrom(caster, point) {
    const spec = Arcana.maelstrom;
    caster.game.spawn(Zone, point.x, point.y, { kind: 'maelstrom', team: teamOf(caster), radius: spec.radius, life: spec.life, timeOwner: caster });
    caster.game.fx.ring(point.x, point.y, { color: 0x40a0ff, radius: spec.radius, from: spec.radius * 1.6, life: 0.6 });
    caster.rig.swing();
    return true;
  },

  // foes in the circle fall upward, hang, and crash down; a shield holds a
  // wizard to the ground
  gravity(caster, point) {
    const game = caster.game;
    const fx = game.fx;
    const spec = Arcana.gravity;
    for (const e of hostilesAround(caster, point, spec.radius)) {
      const c = e.center();
      if (e.shielded || !e.liftUp(e.isWizard ? DuelRules.arcana.gravity.frames : spec.frames, caster)) {
        fx.burst(c.x, c.y, 1.4, { color: 0xb0b0b0, count: 8, speed: 2, life: 0.4, size: 0.6 });
      }
    }
    fx.column(point.x, point.y, spec.radius, { color: [0xc080ff, 0x6040ff, 0xffffff], count: 60, rise: 5, life: 0.9, size: 0.7 });
    fx.ring(point.x, point.y, { color: 0xa060ff, radius: spec.radius, life: 0.6 });
    game.gfx.flash(point.x, point.y, 1, 0x8040ff, 40, 0.3);
    caster.rig.swing();
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
  for (const id of ['meteor', 'cloud', 'sleep', 'confusion', 'maelstrom', 'gravity']) {
    if (cast(id) && ArcanaCast[id](mage, point)) {
      mage.spend(id);
    }
  }
  for (const id of ['thunder', 'guardians', 'heal', 'weapon', 'agathys', 'sphere', 'counter']) {
    if (cast(id) && ArcanaCast[id](mage)) {
      mage.spend(id);
    }
  }
  // the foe under (or near) the cursor
  for (const id of ['polymorph', 'curse', 'phantasm', 'swap']) {
    if (cast(id) && ArcanaCast[id](mage, game.hoveredHostile() || game.hostileNear(mouse, 80))) {
      mage.spend(id);
    }
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
    // (wizards and decoys have no `alive`: their health and `dead` tell)
    const t = this.target;
    if (!t || t.killed || t.dead || t.hp <= 0 || t.invis || owner.distanceTo(t) > Arcana.weapon.reach) {
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

// Flaming sphere: a ball of fire that rolls after its caster's aim (the
// player's cursor, the rival's mark on the player), never more than `leash`
// from the caster, and scorches everything it touches every `every` frames.
export class FlamingSphere extends Entity {
  defaults() {
    this.owner = null;
    this.team = 'player';
    this.life = Arcana.sphere.life;
    this.burn = 0;
    this.flies = true;
    // the staff head it falls from to the floor ({ x, y, h }), and how far
    // through the fall it is
    this.drop = null;
    this.dropT = 0;
  }

  init() {
    this.size = { x: 36, y: 36 };
    this.pos.x -= 18;
    this.pos.y -= 18;
    this.view = buildOrb(0xff7a20, 0.42, 5);
    this.game.gfx.add(this.view);
    this.roll = 0;
  }

  fizzle() {
    const c = this.center();
    this.game.fx.burst(c.x, c.y, 0.6, { color: [0xff6010, 0xffc040, 0x403020], count: 24, speed: 4, life: 0.5, size: 0.9, gravity: 3 });
    this.kill();
  }

  // where it rolls: the player's cursor, or the rival's target
  goal() {
    const owner = this.owner;
    const oc = owner.center();
    const aim = owner === this.game.player ? this.game.input.ground : (owner.target || this.game.player.center());
    const dx = aim.x - oc.x;
    const dy = aim.y - oc.y;
    const d = Math.hypot(dx, dy);
    const leash = Arcana.sphere.leash;
    return d > leash ? { x: oc.x + dx / d * leash, y: oc.y + dy / d * leash } : { x: aim.x, y: aim.y };
  }

  update(k) {
    const owner = this.owner;
    this.life -= k;
    if (this.life <= 0 || !owner || owner.killed || owner.dead) {
      this.fizzle();
      return;
    }
    const spec = Arcana.sphere;
    const g = this.goal();
    const c = this.center();
    const dx = g.x - c.x;
    const dy = g.y - c.y;
    const d = Math.hypot(dx, dy);
    // it slows as it nears the mark, so it settles instead of wobbling
    const speed = Math.min(spec.speed, d * 3);
    this.vel.x = d > 1 ? dx / d * speed : 0;
    this.vel.y = d > 1 ? dy / d * speed : 0;
    this.roll += Math.hypot(this.vel.x, this.vel.y) * k / 60;
    this.move(k);
    this.burn -= k;
    if (this.burn > 0) {
      return;
    }
    const at = this.center();
    let hit = false;
    for (const e of hostilesAround(owner, at, spec.radius)) {
      arcanaHit(owner, e, 'sphere', spec.damage);
      hit = true;
    }
    if (hit) {
      this.burn = spec.every;
      this.game.fx.burst(at.x, at.y, 0.8, { color: [0xff5010, 0xffb030], count: 14, speed: 4, life: 0.4, size: 0.8 });
    }
  }

  syncView(time, dt) {
    const c = this.center();
    let x = c.x;
    let y = c.y;
    let h = 0.55 + Math.abs(Math.sin(this.roll * 0.08)) * 0.05;
    if (this.drop) {
      // dropped from the staff, it falls and comes down where it rolls
      this.dropT = Math.min(1, this.dropT + (dt || 0) / 0.3);
      const t = this.dropT;
      x = this.drop.x + (c.x - this.drop.x) * t;
      y = this.drop.y + (c.y - this.drop.y) * t;
      h = this.drop.h + (h - this.drop.h) * t * t;
      if (t >= 1) {
        this.drop = null;
        this.game.fx.burst(c.x, c.y, 0.4, { color: [0xff5010, 0xffb030], count: 12, speed: 3, life: 0.35, size: 0.7, flat: true });
      }
    }
    this.view.position.set(x * UNIT, h, y * UNIT);
    this.view.rotation.x = this.roll * 0.05;
    const s = 1 + Math.sin(time * 14) * 0.06;
    this.view.scale.setScalar(Math.min(1, this.life / 20) * s);
    const fx = this.game.fx;
    fx.emit(x + (Math.random() - 0.5) * 16, y + (Math.random() - 0.5) * 16, h + 0.15, { color: Math.random() < 0.5 ? 0xffb030 : 0xff5010, life: 0.45, size: 1, vy: 1.6 });
    this.game.gfx.requestLight(x, y, h + 0.45, 0xff7020, 14);
  }
}
