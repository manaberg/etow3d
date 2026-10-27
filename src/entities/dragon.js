import * as THREE from 'three';
import { Entity } from '../core/entity.js';
import { UNIT } from '../core/constants.js';
import { Enemy, Elements } from './enemy.js';
import { Projectile, Zone } from './spells.js';
import { buildDragon } from '../render/models.js';

// Dragons haunt the floors below the warlord (levels.js). Each has an age and
// a colour. The age sets its size and strength and what it can do:
//   wyrmlings and young dragons bite, breathe and fly over walls to reach you;
//   adults add a tail sweep behind them and a frightful roar;
//   ancients add a wing buffet and a spell of their colour;
//   the great golden wyrm, on the last floor, does everything, calls its
//   brood at three quarters, half and a quarter health, and breathes fire and
//   weakening gas by turns.
// The colour sets the breath weapon, the spell and the resistances (a
// multiplier per element of the mage's spells, see Elements in enemy.js).
// A breath is telegraphed: the dragon stops, rears and its mouth glows, then
// breathes in a cone or a line that sweeps slowly after you. Get out of it,
// or raise the shield. Numbers are in the game's units (px, frames).
export const DragonAges = {
  wyrmling: { label: 'WYRMLING', hp: 1800, size: 60, scale: 0.55, speed: 115, bite: 14, breath: 18, reach: 280, recharge: 330, knock: 0.5, pwkill: 400, loot: 1 },
  young: { label: 'YOUNG', hp: 4500, size: 76, scale: 0.8, speed: 125, bite: 20, breath: 26, reach: 330, recharge: 320, knock: 0.65, pwkill: 450, loot: 2 },
  adult: { label: 'ADULT', hp: 10000, size: 96, scale: 1.1, speed: 135, bite: 28, breath: 36, reach: 390, recharge: 300, knock: 0.8, pwkill: 500, loot: 3, tail: true, roar: true },
  ancient: { label: 'ANCIENT', hp: 20000, size: 116, scale: 1.5, speed: 145, bite: 36, breath: 46, reach: 450, recharge: 280, knock: 0.9, pwkill: 550, loot: 4, tail: true, roar: true, buffet: true, spell: true, old: true, rootproof: true },
  great: { label: 'GREAT', hp: 42000, size: 132, scale: 1.9, speed: 155, bite: 46, breath: 58, reach: 520, recharge: 260, knock: 0.95, pwkill: 600, loot: 6, tail: true, roar: true, buffet: true, spell: true, old: true, rootproof: true }
};

// breath: element and shape (cone or line); fx: particle colours
export const DragonColors = {
  red: { name: 'RED', breath: 'fire', shape: 'cone', spell: 'fireballs', fx: [0xff5010, 0xffb030, 0xffe080], resist: { fire: 0, cold: 1.5 } },
  white: { name: 'WHITE', breath: 'cold', shape: 'cone', spell: 'iceshards', fx: [0xffffff, 0x9ad8ff, 0xd8f4ff], resist: { cold: 0, fire: 1.5 } },
  blue: { name: 'BLUE', breath: 'lightning', shape: 'line', spell: 'storm', fx: [0x9ae8ff, 0xffffff, 0x4080ff], resist: { lightning: 0, thunder: 0.5, poison: 1.4 } },
  green: { name: 'GREEN', breath: 'poison', shape: 'cone', spell: 'venom', fx: [0x60c020, 0x9ad050, 0x2a6a10], resist: { poison: 0, necrotic: 0.5, fire: 1.3 } },
  black: { name: 'BLACK', breath: 'acid', shape: 'line', spell: 'acid', fx: [0x90ff30, 0x406010, 0x202010], resist: { necrotic: 0, poison: 0.5, radiant: 1.5, lightning: 1.25 } },
  gold: { name: 'GOLDEN', breath: 'fire', shape: 'cone', spell: 'meteors', fx: [0xffc030, 0xfff0a0, 0xff7010], resist: { fire: 0, poison: 0, cold: 0.6, lightning: 0.75, thunder: 0.75, necrotic: 0.6, force: 0.85, physical: 0.85, radiant: 0.5 } }
};

export const ChromaticColors = ['red', 'white', 'blue', 'green', 'black'];

// frames the dragon rears before it breathes, and breathes
const WINDUP = 42;
const BREATH = 54;

export class Dragon extends Enemy {
  defaults() {
    super.defaults();
    this.color = 'red';
    this.age = 'wyrmling';
    this.depth = 11;
    this.isDragon = true;
    this.state = 'hunt';
    this.stateFrames = 0;
    this.biteCd = 0;
    this.breathCd = 0;
    this.spellCd = 0;
    this.tailCd = 0;
    this.buffetCd = 0;
    this.flying = false;
    this.landing = false;
    this.flyFrames = 0;
    this.altitude = 0;
    this.blind = 0;
    this.stuck = 0;
    this.announced = false;
    this.phase = 0;
    this.breathAlt = false;
    this.summoned = false;
  }

  init() {
    const age = DragonAges[this.age] || DragonAges.wyrmling;
    const hue = DragonColors[this.color] || DragonColors.red;
    this.spec = age;
    this.hue = hue;
    // spawn coordinates are the top-left of the spot; grow the box around it
    this.size = { x: age.size, y: age.size };
    // deeper dragons are a little tougher than shallower ones of their age
    const deeper = Math.max(0, this.depth - 11) * 0.04;
    this.hp = this.maxHp = Math.round(age.hp * (1 + deeper));
    this.desiredVel = age.speed;
    this.maxSpeed = age.speed * 1.8;
    this.resist = hue.resist;
    this.knockResist = age.knock;
    this.pwkillDamage = age.pwkill;
    this.fireSplash = age.size * 1.2;
    this.blizzardSlow = [0.7, 0.8];
    this.stunDuration = age.rootproof ? 90 : 140;
    this.sightRange = age.reach + 200;
    this.breathCd = 90 + Math.random() * 120;
    this.spellCd = 200;
    this.miniBoss = this.age !== 'great';
    this.isBoss = this.age === 'great';
    this.label = this.age === 'great' ? 'THE GREAT GOLDEN WYRM' : age.label + ' ' + hue.name + ' DRAGON';
    this.rig = buildDragon(this.color, !!age.old);
    this.rig.setScale(age.scale);
    this.view = this.rig.root;
    this.game.gfx.add(this.view);
  }

  // Ancients shake off roots; nothing stuns a dragon for long.
  stun(cause) {
    if (cause === 'root' && this.spec.rootproof) {
      this.onResist('root', 0);
      return;
    }
    super.stun(cause);
  }

  // Where the breath comes out, on the ground plane.
  mouth() {
    const c = this.center();
    const m = this.rig.mouth;
    const f = this.rig.facing;
    return { x: c.x + Math.sin(f) * m.ahead / UNIT, y: c.y + Math.cos(f) * m.ahead / UNIT };
  }

  update(k) {
    const game = this.game;
    const player = game.player;
    if (!player) {
      return;
    }
    if (this.hp < 0) {
      this.die();
      return;
    }
    this.tickDebuffs(k);
    for (const key of ['biteCd', 'breathCd', 'spellCd', 'tailCd', 'buffetCd']) {
      this[key] = Math.max(0, this[key] - k);
    }
    if (this.flying) {
      this.fly(k, player);
      return;
    }
    const sight = game.hasRoomLineOfSight(this, player);
    const aggro = game.updateAggro(this, player, sight);
    const distance = this.distanceTo(player);
    if (aggro && !this.announced) {
      this.announce(player, distance);
    }
    if (this.isBoss) {
      this.checkPhase(player);
    }
    this.blind = sight ? 0 : this.blind + k;

    if (this.isStunned) {
      this.vel.x = 0;
      this.vel.y = 0;
      this.state = 'hunt';
      this.rig.rear = 0;
      this.rig.gape = 0;
    } else if (this.state === 'windup') {
      this.vel.x = 0;
      this.vel.y = 0;
      this.stateFrames -= k;
      this.rig.rear = Math.min(1, this.rig.rear + k / 20);
      this.rig.gape = Math.min(0.5, this.rig.gape + k / 60);
      const m = this.mouth();
      game.fx.emit(m.x, m.y, this.rig.mouth.up, { color: this.hue.fx[0], life: 0.3, size: 0.5 + this.spec.scale * 0.4 });
      if (this.stateFrames <= 0) {
        this.breathe(player);
      }
    } else if (this.state === 'breath') {
      this.vel.x = 0;
      this.vel.y = 0;
      this.stateFrames -= k;
      this.rig.rear = Math.max(0, this.rig.rear - k / 10);
      this.rig.gape = 1;
      if (this.stateFrames <= 0) {
        this.state = 'hunt';
        this.rig.gape = 0;
      }
    } else if (!aggro) {
      game.idleEntity(this);
    } else if (this.breathCd <= 0 && sight && !player.invis && distance < this.spec.reach && distance > 30) {
      this.state = 'windup';
      this.stateFrames = WINDUP;
    } else if (this.spec.spell && this.spellCd <= 0 && sight && !player.invis && distance > 160) {
      this.castSpell(player);
    } else if (this.spec.tail && this.tailCd <= 0 && distance < this.size.x * 1.2 && this.behind(player)) {
      this.tailSweep(player);
    } else if (this.spec.buffet && this.buffetCd <= 0 && distance < this.size.x * 0.9) {
      this.wingBuffet(player);
    } else if ((!sight && this.blind > 150 && distance > 260) || this.stuck > 50) {
      this.takeOff();
    } else if (!this.closeTo(player, 8)) {
      if (game.navigateEntityToward(this, player, this.desiredVel, 12)) {
        const before = this.pos.x + this.pos.y;
        this.moveBody(k);
        this.stuck = Math.abs(this.pos.x + this.pos.y - before) < 0.2 * k ? this.stuck + k : 0;
        this.biteAt(player);
        return;
      }
      this.stuck += k;
      this.vel.x = 0;
      this.vel.y = 0;
    } else {
      this.vel.x = 0;
      this.vel.y = 0;
    }
    this.biteAt(player);
    this.moveBody(k);
  }

  closeTo(other, slack) {
    return !(
      this.pos.x - slack >= other.pos.x + other.size.x ||
      this.pos.x + this.size.x + slack <= other.pos.x ||
      this.pos.y - slack >= other.pos.y + other.size.y ||
      this.pos.y + this.size.y + slack <= other.pos.y
    );
  }

  // Whether the player stands behind it (where the tail is).
  behind(player) {
    const c = this.center();
    const pc = player.center();
    let off = Math.atan2(pc.x - c.x, pc.y - c.y) - this.rig.facing;
    off = Math.atan2(Math.sin(off), Math.cos(off));
    return Math.abs(off) > 2.0;
  }

  // The first time it notices the player: its name, what hurts it and what
  // does not, and (adults and older) a roar that sends the mage fleeing.
  announce(player, distance) {
    const game = this.game;
    this.announced = true;
    const immune = [];
    const weak = [];
    const strong = [];
    for (const el in this.resist) {
      const m = this.resist[el];
      (m === 0 ? immune : m > 1 ? weak : strong).push(Elements[el]);
    }
    let text = this.label;
    if (immune.length) {
      text += ' :: IMMUNE TO ' + immune.join(', ');
    }
    if (weak.length) {
      text += ' :: WEAK TO ' + weak.join(', ');
    }
    game.hud.toast(text, '#ffb85a');
    if (this.spec.roar) {
      this.roar(player, distance);
    }
  }

  roar(player, distance) {
    const game = this.game;
    const c = this.center();
    this.rig.gape = 1;
    this.rig.rear = 0.6;
    game.fx.ring(c.x, c.y, { color: this.hue.fx[0], radius: 300, life: 0.6 });
    game.gfx.addShake(0.6);
    if (distance < 420 && player.frighten) {
      player.frighten(this.isBoss ? 100 : 70);
      game.hud.toast('FRIGHTFUL PRESENCE :: YOU FLEE IN TERROR', '#c090ff');
    }
  }

  biteAt(player) {
    if (this.biteCd > 0 || this.state !== 'hunt' || !this.closeTo(player, 10)) {
      return;
    }
    this.biteCd = 70;
    this.rig.swing();
    const dmg = this.spec.bite + Math.floor(Math.random() * this.spec.bite * 0.5);
    if (!player.takeMelee(dmg)) {
      // teeth on the shield
      this.hurt(dmg, 'force');
    }
    this.game.gfx.addShake(0.25);
  }

  breathe(player) {
    const game = this.game;
    const m = this.mouth();
    const pc = player.center();
    let element = this.hue.breath;
    // the golden wyrm alternates fire with a weakening gas
    if (this.color === 'gold') {
      this.breathAlt = !this.breathAlt;
      if (this.breathAlt) {
        element = 'weakening';
      }
    }
    game.spawn(DragonBreath, m.x, m.y, {
      dragon: this,
      element,
      shape: element === 'weakening' ? 'cone' : this.hue.shape,
      angle: Math.atan2(pc.y - m.y, pc.x - m.x),
      length: this.spec.reach * 1.1,
      damage: this.spec.breath,
      life: BREATH
    });
    this.state = 'breath';
    this.stateFrames = BREATH;
    // like D&D's recharge roll: the next breath comes sooner or later
    this.breathCd = this.spec.recharge * (0.75 + Math.random() * 0.6);
  }

  castSpell(player) {
    const game = this.game;
    const m = this.mouth();
    const pc = player.center();
    const aim = Math.atan2(pc.y - m.y, pc.x - m.x);
    const spawn = (kind, angle) => game.spawn(Projectile, m.x, m.y, { kind, angle, team: 'enemy' });
    switch (this.hue.spell) {
      case 'fireballs':
        for (const off of [-0.2, 0, 0.2]) {
          spawn('fireball2', aim + off);
        }
        break;
      case 'iceshards':
        for (let i = -2; i <= 2; i++) {
          spawn('iceshard', aim + i * 0.09);
        }
        break;
      case 'storm':
        for (const off of [-0.3, 0, 0.3]) {
          spawn('stormbolt', aim + off);
        }
        break;
      case 'venom':
        game.spawn(Zone, pc.x, pc.y, { kind: 'cloud', team: 'enemy', radius: 90, life: 360 });
        break;
      case 'acid':
        for (const off of [-0.12, 0, 0.12]) {
          spawn('acidbolt', aim + off);
        }
        break;
      case 'meteors':
        game.spawn(Zone, pc.x, pc.y, { kind: 'meteors', team: 'enemy', radius: 110, life: 240 });
        break;
    }
    this.rig.swing();
    this.spellCd = 300 + Math.random() * 120;
  }

  // Swings the tail round at the player behind it: a heavy blow that throws.
  tailSweep(player) {
    const game = this.game;
    this.tailCd = 220;
    this.rig.sweep();
    const c = this.center();
    game.fx.burst(c.x, c.y, 0.5, { color: 0x6a5a48, count: 20, speed: 5, life: 0.5, size: 1.2, flat: true, drag: 3 });
    if (player.takeMelee(Math.round(this.spec.bite * 1.3))) {
      pushPlayer(game, player, this.angleTo(player), 110);
    }
  }

  // One great beat of the wings: hurts and hurls back everything close.
  wingBuffet(player) {
    const game = this.game;
    this.buffetCd = 420;
    this.rig.beat();
    const c = this.center();
    const radius = this.size.x * 1.6;
    game.fx.ring(c.x, c.y, { color: 0xd8d0c0, radius, life: 0.45 });
    game.fx.burst(c.x, c.y, 0.4, { color: [0xc8b8a0, 0x8a7a68], count: 40, speed: 9, life: 0.5, size: 1.3, flat: true, drag: 2 });
    game.gfx.addShake(0.5);
    if (this.distanceTo(player) < radius && player.takeMelee(Math.round(this.spec.bite * 0.7))) {
      pushPlayer(game, player, this.angleTo(player), 170);
    }
  }

  // The golden wyrm, at 75%, 50% and 25% health: roars, calls two of its
  // brood (chromatic wyrmlings, young ones later) and takes to the air.
  checkPhase(player) {
    const thresholds = [0.75, 0.5, 0.25];
    if (this.phase >= thresholds.length || this.hp > this.maxHp * thresholds[this.phase]) {
      return;
    }
    this.phase++;
    const game = this.game;
    game.hud.toast('THE GREAT GOLDEN WYRM CALLS ITS BROOD', '#ffd060');
    this.roar(player, this.distanceTo(player));
    const age = this.phase >= 2 ? 'young' : 'wyrmling';
    const c = this.center();
    for (let i = 0; i < 2; i++) {
      const color = ChromaticColors[Math.floor(Math.random() * ChromaticColors.length)];
      const size = DragonAges[age].size;
      for (let attempt = 0; attempt < 16; attempt++) {
        const a = Math.random() * Math.PI * 2;
        const x = c.x + Math.cos(a) * 200 - size / 2;
        const y = c.y + Math.sin(a) * 200 - size / 2;
        if (game.world.canStandAt(x, y, size, size)) {
          const brood = game.spawn(Dragon, x, y, { color, age, depth: this.depth, homeRoom: this.homeRoom, summoned: true });
          game.alertEnemy(brood, false);
          game.levelEnemyTotal++;
          game.fx.column(x + size / 2, y + size / 2, size, { color: DragonColors[color].fx, count: 30, rise: 3, life: 0.8, size: 1 });
          break;
        }
      }
    }
    this.takeOff();
  }

  // ----------------------------------------------------------- flight

  takeOff() {
    this.flying = true;
    this.landing = false;
    this.flyFrames = 0;
    this.stuck = 0;
    this.state = 'hunt';
    this.rig.rear = 0;
    this.rig.gape = 0;
    const c = this.center();
    this.game.fx.burst(c.x, c.y, 0.3, { color: [0x8a7a68, 0xb8a890], count: 30, speed: 7, life: 0.6, size: 1.4, flat: true, drag: 2 });
  }

  // Aloft it ignores walls and flies straight for the player, then lands on
  // open floor near them with a thump.
  fly(k, player) {
    const game = this.game;
    this.flyFrames += k;
    const c = this.center();
    const pc = player.center();
    const dx = pc.x - c.x;
    const dy = pc.y - c.y;
    const d = Math.hypot(dx, dy) || 1;
    if (!this.landing) {
      this.altitude = Math.min(1, this.altitude + k / 40);
      const speed = this.desiredVel * 1.7;
      if (d > 90) {
        this.vel.x = dx / d * speed;
        this.vel.y = dy / d * speed;
        this.pos.x += this.vel.x * k / 60;
        this.pos.y += this.vel.y * k / 60;
      }
      const near = d < 170 + this.size.x / 2 || this.flyFrames > 420;
      if (near && this.altitude >= 1 && game.world.canStandAt(this.pos.x, this.pos.y, this.size.x, this.size.y)) {
        this.landing = true;
      }
    } else {
      this.vel.x = 0;
      this.vel.y = 0;
      this.altitude = Math.max(0, this.altitude - k / 30);
      if (this.altitude <= 0) {
        this.land(player);
      }
    }
    this.rig.fly = this.altitude;
  }

  land(player) {
    const game = this.game;
    this.flying = false;
    this.landing = false;
    this.blind = 0;
    this.rig.fly = 0;
    const c = this.center();
    game.fx.ring(c.x, c.y, { color: 0xb8a890, radius: this.size.x * 1.3, life: 0.5 });
    game.fx.burst(c.x, c.y, 0.3, { color: [0x8a7a68, 0xb8a890], count: 40, speed: 8, life: 0.7, size: 1.6, flat: true, drag: 2 });
    game.gfx.addShake(0.5);
    if (this.distanceTo(player) < this.size.x * 1.3) {
      player.takeMelee(Math.round(this.spec.bite * 0.5));
    }
    // breathe soon after landing
    this.breathCd = Math.min(this.breathCd, 40);
  }

  // ----------------------------------------------------------- endings

  die() {
    const game = this.game;
    game.stats.killcount++;
    game.stats.bosscount++;
    game.onEnemySlain(this);
    const loot = this.spec.loot;
    // a hoard: scrolls, potions and a ring for the older ones
    for (let i = 0; i < Math.ceil(loot / 2); i++) {
      if (Math.random() < 0.5) {
        game.dropScroll(this, i * 20);
      }
    }
    for (let i = 0; i < loot; i++) {
      const p = game.dropPotion(this);
      p.pos.x += (Math.random() - 0.5) * this.size.x;
      p.pos.y += (Math.random() - 0.5) * this.size.y;
    }
    if (loot >= 3) {
      game.dropRing(this);
    }
    const c = this.center();
    const big = this.spec.scale;
    game.fx.burst(c.x, c.y, 1.5 * big, { color: this.hue.fx, count: 80, speed: 7 * big, life: 1, size: 1.5 * big, gravity: 5, lift: 3 });
    game.fx.ring(c.x, c.y, { color: this.hue.fx[0], radius: this.size.x * 2, life: 0.7 });
    game.gfx.flash(c.x, c.y, 3, this.hue.fx[0], 90, 0.6);
    game.gfx.addShake(0.7);
    game.deathFx(this);
    if (!this.summoned) {
      game.hud.toast(this.label + ' IS SLAIN', '#ffd060');
    }
    this.kill();
    if (this.isBoss) {
      game.onVictory();
    }
  }

  // ----------------------------------------------------------- view

  syncView(time, dt) {
    const c = this.center();
    this.view.position.set(c.x * UNIT, 0, c.y * UNIT);
    const player = this.game.player;
    const speed = this.flying ? 0 : Math.hypot(this.vel.x, this.vel.y);
    let facing = null;
    if (this.flying && Math.hypot(this.vel.x, this.vel.y) > 2) {
      facing = Math.atan2(this.vel.x, this.vel.y);
    } else if (this.state === 'breath' && this.breath && !this.breath.killed) {
      facing = Math.atan2(Math.cos(this.breath.angle), Math.sin(this.breath.angle));
    } else if (player && this.aggro && (speed < 20 || this.state !== 'hunt')) {
      const pc = player.center();
      facing = Math.atan2(pc.x - c.x, pc.y - c.y);
    } else if (speed > 2) {
      facing = Math.atan2(this.vel.x, this.vel.y);
    }
    this.rig.animate(dt, this.isStunned ? 0 : Math.min(1.2, speed / 110), facing);
    const fx = this.game.fx;
    if (this.isStunned && Math.random() < 0.3) {
      fx.column(c.x, c.y, this.size.x / 2, { color: 0x40ff60, count: 1, rise: 0.8, life: 0.6, size: 0.6 });
    }
    if (this.chillFrames > 0 && Math.random() < 0.3) {
      fx.emit(c.x + (Math.random() - 0.5) * this.size.x, c.y + (Math.random() - 0.5) * this.size.y, Math.random() * this.rig.height, { color: 0xbfe8ff, life: 0.5, size: 0.5, vy: -0.5 });
    }
    // smoke curls from the nostrils, and the old ones glow
    if (Math.random() < 0.08 + this.spec.scale * 0.04) {
      const m = this.mouth();
      fx.emit(m.x, m.y, this.rig.mouth.up + 0.2, { color: this.hue.fx[2], life: 0.9, size: 0.6 * this.spec.scale, vy: 0.8, grow: 1.5 });
    }
    if (this.spec.old) {
      this.game.gfx.requestLight(c.x, c.y, 2, this.hue.fx[0], 6 + this.spec.scale * 4);
    }
  }
}

// Shoves the mage along the floor (walls stop it).
function pushPlayer(game, player, angle, distance) {
  const res = game.world.trace(player.pos.x, player.pos.y, player.size.x, player.size.y, Math.cos(angle) * distance, Math.sin(angle) * distance);
  player.pos.x = res.x;
  player.pos.y = res.y;
}

// A breath weapon in progress: a cone or a line from the dragon's mouth that
// turns slowly after the player. It hits the player once (a raised shield
// turns it), with an after-effect by element: fire leaves burning ground,
// cold a blizzard that slows, lightning a short stun, poison a cloud, acid a
// pool, and the golden wyrm's weakening gas drains manergy and slows.
export class DragonBreath extends Entity {
  defaults() {
    this.dragon = null;
    this.element = 'fire';
    this.shape = 'cone';
    this.angle = 0;
    this.length = 300;
    this.damage = 20;
    this.life = BREATH;
    this.hit = false;
    this.left = false;
  }

  init() {
    this.size = { x: 4, y: 4 };
    // drawn as particles only; the empty view gets it a syncView every frame
    this.view = new THREE.Group();
    this.game.gfx.add(this.view);
    this.maxLife = this.life;
    this.halfAngle = 0.4;
    this.width = 22 + this.dragon.size.x * 0.2;
    this.dragon.breath = this;
    this.colors = this.element === 'weakening' ? [0xe8c860, 0xfff0a0, 0x8a6a20] : this.dragon.hue.fx;
    if (this.shape === 'line') {
      this.length *= 1.25;
    }
  }

  // Whether a point (the player's centre) lies in the breath.
  covers(x, y, o) {
    const dx = x - o.x;
    const dy = y - o.y;
    const along = dx * Math.cos(this.angle) + dy * Math.sin(this.angle);
    if (along < 0 || along > this.length) {
      return false;
    }
    if (this.shape === 'line') {
      const across = Math.abs(-dx * Math.sin(this.angle) + dy * Math.cos(this.angle));
      return across < this.width;
    }
    let off = Math.atan2(dy, dx) - this.angle;
    off = Math.atan2(Math.sin(off), Math.cos(off));
    return Math.abs(off) <= this.halfAngle || Math.hypot(dx, dy) < 40;
  }

  update(k) {
    const game = this.game;
    const dragon = this.dragon;
    const player = game.player;
    this.life -= k;
    if (this.life <= 0 || !dragon || dragon.killed || dragon.isStunned || !player) {
      this.kill();
      return;
    }
    const o = dragon.mouth();
    this.pos.x = o.x - 2;
    this.pos.y = o.y - 2;
    const pc = player.center();
    // sweeps after the player, but slower than a mage can run
    let want = Math.atan2(pc.y - o.y, pc.x - o.x) - this.angle;
    want = Math.atan2(Math.sin(want), Math.cos(want));
    this.angle += Math.max(-0.012 * k, Math.min(0.012 * k, want));

    if (!this.hit && !player.dead && this.covers(pc.x, pc.y, o) && game.world.hasLineOfSight(o.x, o.y, pc.x, pc.y)) {
      this.hit = true;
      this.strike(player, pc);
    }
    if (!this.left && this.life < this.maxLife / 2) {
      this.left = true;
      this.leaveGround(o);
    }
  }

  strike(player, pc) {
    const game = this.game;
    if (player.shielded) {
      game.fx.burst(pc.x, pc.y, 1.4, { color: [0x80c0ff, ...this.colors], count: 30, speed: 6, life: 0.5, size: 0.9 });
      game.hud.toast('YOUR SHIELD TURNS THE BREATH', '#80c0ff');
      return;
    }
    player.hurt(this.damage);
    game.fx.burst(pc.x, pc.y, 1.4, { color: this.colors, count: 30, speed: 5, life: 0.5, size: 1 });
    switch (this.element) {
      case 'cold':
        game.spawn(Zone, pc.x, pc.y, { kind: 'blizzard', team: 'enemy', radius: 80, life: 200 });
        break;
      case 'lightning':
        player.stun(30);
        break;
      case 'poison':
        game.spawn(Zone, pc.x, pc.y, { kind: 'cloud', team: 'enemy', radius: 80, life: 300 });
        break;
      case 'acid':
        game.spawn(Zone, pc.x, pc.y, { kind: 'acid', team: 'enemy', radius: 50, life: 360 });
        break;
      case 'weakening':
        player.manergy = Math.max(0, player.manergy - 40);
        game.spawn(Zone, pc.x, pc.y, { kind: 'gloom', team: 'enemy', radius: 100, life: 300 });
        break;
    }
  }

  // Fire burns on the ground behind the breath; acid pools along the line.
  leaveGround(o) {
    const game = this.game;
    const kind = this.element === 'fire' ? 'fire' : this.element === 'acid' ? 'acid' : null;
    if (!kind) {
      return;
    }
    const count = Math.round(this.length / 90);
    for (let i = 1; i <= count; i++) {
      const r = this.length * (i / (count + 1));
      const a = this.angle + (this.shape === 'cone' ? (Math.random() - 0.5) * this.halfAngle * 1.6 : 0);
      const x = o.x + Math.cos(a) * r;
      const y = o.y + Math.sin(a) * r;
      if (game.world.hasLineOfSight(o.x, o.y, x, y)) {
        game.spawn(Zone, x, y, { kind, team: 'enemy', radius: kind === 'fire' ? 24 : 40, life: kind === 'fire' ? 600 : 300 });
      }
    }
  }

  syncView() {
    const game = this.game;
    const fx = game.fx;
    const o = this.center();
    const up = this.dragon.rig.mouth.up;
    const reach = this.length * Math.min(1, (this.maxLife - this.life + 1) / 10);
    // walls stop the breath, so the particles too
    const dx = Math.cos(this.angle);
    const dy = Math.sin(this.angle);
    const wall = game.world.trace(o.x - 2, o.y - 2, 4, 4, dx * reach, dy * reach, true);
    const len = Math.hypot(wall.x + 2 - o.x, wall.y + 2 - o.y);
    if (this.element === 'lightning') {
      if (Math.random() < 0.5) {
        fx.bolt(o.x, o.y, o.x + dx * len, o.y + dy * len, { color: 0xa0e8ff, life: 0.12, width: 0.08 + this.dragon.spec.scale * 0.04, jag: 0.5 });
      }
      game.gfx.requestLight(o.x + dx * len / 2, o.y + dy * len / 2, 1.5, 0x80d0ff, 20);
      return;
    }
    const n = 8 + Math.round(this.dragon.spec.scale * 4);
    for (let i = 0; i < n; i++) {
      const t = Math.random();
      const spread = this.shape === 'cone' ? (Math.random() * 2 - 1) * this.halfAngle * t : 0;
      const a = this.angle + spread;
      const r = t * len;
      const side = this.shape === 'line' ? (Math.random() - 0.5) * this.width : 0;
      fx.emit(o.x + Math.cos(a) * r - Math.sin(a) * side, o.y + Math.sin(a) * r + Math.cos(a) * side, up * (1 - t * 0.7), {
        color: this.colors[i % this.colors.length], life: 0.45, size: 0.6 + t * 1.6 * (this.shape === 'cone' ? 1 : 0.5),
        vx: Math.cos(a) * 3, vz: Math.sin(a) * 3, vy: this.element === 'fire' ? 0.8 : 0.2, grow: this.element === 'poison' || this.element === 'weakening' ? 1.6 : 1
      });
    }
    game.gfx.requestLight(o.x + dx * len / 2, o.y + dy * len / 2, 1.5, this.colors[0], 22);
  }
}
