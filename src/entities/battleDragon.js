import * as THREE from 'three';
import { UNIT } from '../core/constants.js';
import { Dragon, DragonBreath } from './dragon.js';
import { Projectile, Zone } from './spells.js';
import { BattleRules } from './battle.js';
import { TEAM_COLORS } from '../render/models.js';

// frames the dragon rears before it breathes, and breathes (as in dragon.js)
const WINDUP = 42;
const BREATH = 54;

// A dragon fighting in a battle army (battle.js): the dungeon dragon's body,
// breath and spells, turned on the other side's army instead of the mage. It
// belongs to its side's DRAGONS regiment and follows the regiment's orders
// like a soldier: charge (the nearest foe), hold (its place in the line, and
// whatever comes in reach) or follow (its wizard). It flies over the armies
// to reach a foe far away; soldiers on foot cannot touch it in the air, but
// archers and spells can. Bites, tail and breath hit soldiers
// `BattleRules.dragonVsTroops` times as hard as they would hit the mage.
export class BattleDragon extends Dragon {
  defaults() {
    super.defaults();
    this.side = 'player';
    this.regiment = null;
    this.slot = { x: 0, y: 0 };
    this.target = null;
    this.retarget = 0;
    this.roarCd = 0;
    this.goal = null;
    this.canBeFeared = false;
  }

  init() {
    super.init();
    this.hp = this.maxHp = this.maxHp * BattleRules.dragonHpScale;
    this.miniBoss = true;
    this.isBoss = false;
    this.label = (this.side === 'player' ? 'YOUR ' : 'ITS ') + this.spec.label + ' ' + this.hue.name + ' DRAGON';
    this.roarCd = 120 + Math.random() * 240;
    // a ring in its side's colour on the ground under it
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(0.82, 1, 40).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ color: TEAM_COLORS[this.side].ring, transparent: true, opacity: 0.7, blending: THREE.AdditiveBlending, depthWrite: false })
    );
    const r = this.size.x * 0.8 * UNIT;
    ring.scale.set(r, 1, r);
    ring.position.y = 0.06;
    this.view.add(ring);
    this.teamRing = ring;
  }

  get foeSide() {
    return this.side === 'player' ? 'enemy' : 'player';
  }

  update(k) {
    const game = this.game;
    const battle = game.battle;
    if (this.hp < 0) {
      this.die();
      return;
    }
    this.tickDebuffs(k);
    for (const key of ['biteCd', 'breathCd', 'spellCd', 'tailCd', 'buffetCd', 'roarCd']) {
      this[key] = Math.max(0, this[key] - k);
    }
    const regiment = this.regiment;
    if (!battle.fighting) {
      // deploying: march to the place in the line, nothing more
      if (regiment.order === 'hold') {
        const spot = battle.slotPoint(this);
        this.steer(spot.x, spot.y, this.desiredVel, 20);
        this.moveBody(k);
      }
      return;
    }
    this.retarget -= k;
    if (this.retarget <= 0 || !this.target || this.target.killed || this.target.dead) {
      this.target = regiment.order === 'attack' ? battle.attackFoe(this) : null;
      if (regiment.order === 'attack' && !this.target) {
        regiment.order = 'hold';
        regiment.attackTarget = null;
        regiment.point = { x: regiment.centroid.x, y: regiment.centroid.y };
      }
      if (!this.target) {
        this.target = battle.nearestFoe(this, regiment.order === 'charge' ? Infinity : this.spec.reach + 260);
      }
      this.retarget = 20 + Math.random() * 15;
    }
    const target = this.target;
    if (this.flying) {
      this.flyTo(k, target);
      return;
    }
    const dist = target ? this.distanceTo(target) : Infinity;
    const engaged = dist < this.spec.reach + 120;
    const order = regiment.order;
    if (this.isStunned) {
      this.vel.x = 0;
      this.vel.y = 0;
      this.state = 'hunt';
      this.rig.rear = 0;
      this.rig.gape = 0;
    } else if (this.isFeared) {
      this.stumble(k);
    } else if (this.state === 'windup') {
      this.vel.x = 0;
      this.vel.y = 0;
      this.stateFrames -= k;
      this.rig.rear = Math.min(1, this.rig.rear + k / 20);
      this.rig.gape = Math.min(0.5, this.rig.gape + k / 60);
      const m = this.mouth();
      game.fx.emit(m.x, m.y, this.rig.mouth.up, { color: this.hue.fx[0], life: 0.3, size: 0.5 + this.spec.scale * 0.4 });
      if (this.stateFrames <= 0) {
        this.breatheAt(target);
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
    } else if (target && (order === 'charge' || order === 'attack' || engaged)) {
      if (this.spec.roar && this.roarCd <= 0 && dist < 380) {
        this.roarAt();
      } else if (this.breathCd <= 0 && dist < this.spec.reach && dist > 30 && !target.flying) {
        this.state = 'windup';
        this.stateFrames = WINDUP;
        this.vel.x = 0;
        this.vel.y = 0;
      } else if (this.spec.spell && this.spellCd <= 0 && dist > 160 && dist < 700) {
        this.castSpell(target);
      } else if (this.spec.tail && this.tailCd <= 0 && this.foesBehind() >= 2) {
        this.tailSweep();
      } else if (this.spec.buffet && this.buffetCd <= 0 && this.foesAround(this.size.x * 1.6) >= 5) {
        this.wingBuffet();
      } else if (dist > 900 || this.stuck > 50) {
        this.takeOff();
      } else if (!this.closeTo(target, 8)) {
        const tc = target.center();
        this.steer(tc.x, tc.y, this.desiredVel, 2);
      } else {
        this.vel.x = 0;
        this.vel.y = 0;
      }
    } else {
      const spot = battle.slotPoint(this);
      const c = this.center();
      if (Math.hypot(spot.x - c.x, spot.y - c.y) > 1200) {
        this.takeOff();
      } else {
        this.steer(spot.x, spot.y, this.desiredVel, 20);
      }
    }
    if (target && this.state === 'hunt' && !this.isStunned && !this.isFeared) {
      this.biteAt(target);
    }
    const before = this.pos.x + this.pos.y;
    this.moveBody(k);
    const moving = Math.abs(this.vel.x) + Math.abs(this.vel.y) > 30;
    this.stuck = moving && Math.abs(this.pos.x + this.pos.y - before) < 0.2 * k ? this.stuck + k : 0;
  }

  // Straight at a point across the open field; rocks slide it along.
  steer(x, y, speed, slack) {
    const c = this.center();
    const dx = x - c.x;
    const dy = y - c.y;
    const d = Math.hypot(dx, dy);
    if (d < slack) {
      this.vel.x = 0;
      this.vel.y = 0;
      return;
    }
    const v = Math.min(speed, d * 4);
    this.vel.x = dx / d * v;
    this.vel.y = dy / d * v;
  }

  // Strikes a foe of the other army: a wizard takes the blow as from any
  // monster (a shield turns it back), a soldier or a dragon far harder.
  strikeFoe(foe, dmg, element) {
    if (foe.isWizard) {
      if (foe.shielded) {
        this.hurt(dmg, 'force');
        return false;
      }
      if (foe.takeMelee) {
        foe.takeMelee(dmg, 0, this);
      } else {
        foe.hurt(dmg);
        if (foe.onDuelDamage) {
          foe.onDuelDamage(dmg);
        }
      }
      return true;
    }
    foe.hurt(dmg * BattleRules.dragonVsTroops, element);
    return true;
  }

  biteAt(target) {
    if (this.biteCd > 0 || target.flying || !this.closeTo(target, 10)) {
      return;
    }
    this.biteCd = 70;
    this.rig.swing();
    this.strikeFoe(target, this.spec.bite + Math.floor(Math.random() * this.spec.bite * 0.5), 'physical');
  }

  // How many foes stand behind it, where the tail sweeps.
  foesBehind() {
    let n = 0;
    const c = this.center();
    const reach = this.size.x * 1.3;
    this.game.battle.eachNear(c.x, c.y, reach, this.foeSide, (f) => {
      let off = Math.atan2(f._cx - c.x, f._cy - c.y) - this.rig.facing;
      off = Math.atan2(Math.sin(off), Math.cos(off));
      if (Math.abs(off) > 2.0 && !f.flying) {
        n++;
      }
    });
    return n;
  }

  foesAround(radius) {
    let n = 0;
    const c = this.center();
    this.game.battle.eachNear(c.x, c.y, radius, this.foeSide, (f) => {
      if (!f.flying && Math.hypot(f._cx - c.x, f._cy - c.y) < radius) {
        n++;
      }
    });
    return n;
  }

  // The frightful presence: foes close by flee in terror for a while.
  roarAt() {
    const game = this.game;
    const c = this.center();
    this.roarCd = 1200 + Math.random() * 600;
    this.rig.gape = 1;
    this.rig.rear = 0.6;
    game.fx.ring(c.x, c.y, { color: this.hue.fx[0], radius: 300, life: 0.6 });
    game.gfx.addShake(0.3);
    game.battle.eachNear(c.x, c.y, 300, this.foeSide, (f) => {
      if (f.isWizard) {
        if (f.frighten && f === game.player) {
          f.frighten(70);
          game.hud.toast('FRIGHTFUL PRESENCE :: YOU FLEE IN TERROR', '#c090ff');
        }
      } else if (f.canBeFeared && !f.isFeared && Math.random() < 0.7) {
        f.fear();
      }
    });
  }

  breatheAt(target) {
    const m = this.mouth();
    const aim = target && !target.killed ? target.center() : { x: m.x + Math.sin(this.rig.facing) * 100, y: m.y + Math.cos(this.rig.facing) * 100 };
    this.game.spawn(BattleBreath, m.x, m.y, {
      dragon: this,
      element: this.hue.breath,
      shape: this.hue.shape,
      angle: Math.atan2(aim.y - m.y, aim.x - m.x),
      length: this.spec.reach * 1.1,
      damage: this.spec.breath,
      life: BREATH
    });
    this.state = 'breath';
    this.stateFrames = BREATH;
    this.breathCd = this.spec.recharge * (0.75 + Math.random() * 0.6);
  }

  // The ancients' spells, at a foe of the other army.
  castSpell(target) {
    const game = this.game;
    const m = this.mouth();
    const pc = target.center();
    const aim = Math.atan2(pc.y - m.y, pc.x - m.x);
    const team = this.side;
    const spawn = (kind, angle) => game.spawn(Projectile, m.x, m.y, { kind, angle, team });
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
        game.spawn(Zone, pc.x, pc.y, { kind: 'cloud', team, radius: 110, life: 360 });
        break;
      case 'acid':
        for (const off of [-0.12, 0, 0.12]) {
          spawn('acidbolt', aim + off);
        }
        break;
    }
    this.rig.swing();
    this.spellCd = 300 + Math.random() * 120;
  }

  // The tail sweeps round at the foes behind it and throws them.
  tailSweep() {
    const game = this.game;
    this.tailCd = 220;
    this.rig.sweep();
    const c = this.center();
    game.fx.burst(c.x, c.y, 0.5, { color: 0x6a5a48, count: 20, speed: 5, life: 0.5, size: 1.2, flat: true, drag: 3 });
    const reach = this.size.x * 1.3;
    for (const f of this.game.battle.near(this, reach, this.foeSide)) {
      let off = Math.atan2(f._cx - c.x, f._cy - c.y) - this.rig.facing;
      off = Math.atan2(Math.sin(off), Math.cos(off));
      if (Math.abs(off) > 2.0 && !f.flying && this.strikeFoe(f, Math.round(this.spec.bite * 1.3), 'physical') && f.shove) {
        f.shove(this.angleTo(f), 110);
      }
    }
  }

  // One great beat of the wings: hurts and hurls back everything close.
  wingBuffet() {
    const game = this.game;
    this.buffetCd = 420;
    this.rig.beat();
    const c = this.center();
    const radius = this.size.x * 1.6;
    game.fx.ring(c.x, c.y, { color: 0xd8d0c0, radius, life: 0.45 });
    game.fx.burst(c.x, c.y, 0.4, { color: [0xc8b8a0, 0x8a7a68], count: 40, speed: 9, life: 0.5, size: 1.3, flat: true, drag: 2 });
    game.gfx.addShake(0.3);
    for (const f of game.battle.near(this, radius, this.foeSide)) {
      if (!f.flying && Math.hypot(f._cx - c.x, f._cy - c.y) < radius && this.strikeFoe(f, Math.round(this.spec.bite * 0.7), 'physical') && f.shove) {
        f.shove(this.angleTo(f), 170);
      }
    }
  }

  // ----------------------------------------------------------- flight

  takeOff() {
    super.takeOff();
    this.goal = null;
  }

  // Aloft it flies straight over everything to its foe (or its place in the
  // line), then lands on open ground near it.
  flyTo(k, target) {
    const game = this.game;
    this.flyFrames += k;
    const c = this.center();
    const goal = target && (this.regiment.order !== 'hold' || this.distanceTo(target) < this.spec.reach + 400)
      ? target.center()
      : game.battle.slotPoint(this);
    const dx = goal.x - c.x;
    const dy = goal.y - c.y;
    const d = Math.hypot(dx, dy) || 1;
    if (!this.landing) {
      this.altitude = Math.min(1, this.altitude + k / 40);
      const speed = this.desiredVel * 1.9;
      if (d > 90) {
        this.vel.x = dx / d * speed;
        this.vel.y = dy / d * speed;
        this.pos.x += this.vel.x * k / 60;
        this.pos.y += this.vel.y * k / 60;
      }
      const near = d < 200 + this.size.x / 2 || this.flyFrames > 900;
      if (near && this.altitude >= 1 && game.world.canStandAt(this.pos.x, this.pos.y, this.size.x, this.size.y)) {
        this.landing = true;
      }
    } else {
      this.vel.x = 0;
      this.vel.y = 0;
      this.altitude = Math.max(0, this.altitude - k / 30);
      if (this.altitude <= 0) {
        this.touchDown();
      }
    }
    this.rig.fly = this.altitude;
  }

  // Lands with a thump that knocks down the foes beneath it.
  touchDown() {
    const game = this.game;
    this.flying = false;
    this.landing = false;
    this.stuck = 0;
    this.rig.fly = 0;
    const c = this.center();
    game.fx.ring(c.x, c.y, { color: 0xb8a890, radius: this.size.x * 1.3, life: 0.5 });
    game.fx.burst(c.x, c.y, 0.3, { color: [0x8a7a68, 0xb8a890], count: 40, speed: 8, life: 0.7, size: 1.6, flat: true, drag: 2 });
    game.gfx.addShake(0.25);
    const radius = this.size.x * 1.3;
    for (const f of game.battle.near(this, radius, this.foeSide)) {
      if (!f.flying && Math.hypot(f._cx - c.x, f._cy - c.y) < radius) {
        this.strikeFoe(f, Math.round(this.spec.bite * 0.5), 'physical');
      }
    }
    this.breathCd = Math.min(this.breathCd, 40);
  }

  // ----------------------------------------------------------- endings

  die() {
    const game = this.game;
    if (this.side === 'enemy') {
      game.stats.killcount++;
      game.stats.bosscount++;
    }
    const c = this.center();
    const big = this.spec.scale;
    game.fx.burst(c.x, c.y, 1.5 * big, { color: this.hue.fx, count: 80, speed: 7 * big, life: 1, size: 1.5 * big, gravity: 5, lift: 3 });
    game.fx.ring(c.x, c.y, { color: this.hue.fx[0], radius: this.size.x * 2, life: 0.7 });
    game.gfx.flash(c.x, c.y, 3, this.hue.fx[0], 90, 0.6);
    game.gfx.addShake(0.4);
    game.deathFx(this);
    game.hud.toast(this.label + ' IS SLAIN', this.side === 'player' ? '#ff8a70' : '#ffd060');
    this.kill();
  }

  // ----------------------------------------------------------- view

  syncView(time, dt) {
    const c = this.center();
    this.view.position.set(c.x * UNIT, 0, c.y * UNIT);
    const speed = this.flying ? 0 : Math.hypot(this.vel.x, this.vel.y);
    let facing = null;
    if (this.flying && Math.hypot(this.vel.x, this.vel.y) > 2) {
      facing = Math.atan2(this.vel.x, this.vel.y);
    } else if (this.state === 'breath' && this.breath && !this.breath.killed) {
      facing = Math.atan2(Math.cos(this.breath.angle), Math.sin(this.breath.angle));
    } else if (this.target && !this.target.killed && (speed < 20 || this.state !== 'hunt')) {
      const tc = this.target.center();
      facing = Math.atan2(tc.x - c.x, tc.y - c.y);
    } else if (speed > 2) {
      facing = Math.atan2(this.vel.x, this.vel.y);
    }
    this.rig.animate(dt, this.isStunned ? 0 : Math.min(1.2, speed / 110), facing);
    this.teamRing.visible = this.altitude < 0.5;
    const fx = this.game.fx;
    if (this.isStunned && Math.random() < 0.3) {
      fx.column(c.x, c.y, this.size.x / 2, { color: 0x40ff60, count: 1, rise: 0.8, life: 0.6, size: 0.6 });
    }
    if (this.chillFrames > 0 && Math.random() < 0.3) {
      fx.emit(c.x + (Math.random() - 0.5) * this.size.x, c.y + (Math.random() - 0.5) * this.size.y, Math.random() * this.rig.height, { color: 0xbfe8ff, life: 0.5, size: 0.5, vy: -0.5 });
    }
    if (Math.random() < 0.08 + this.spec.scale * 0.04) {
      const m = this.mouth();
      fx.emit(m.x, m.y, this.rig.mouth.up + 0.2, { color: this.hue.fx[2], life: 0.9, size: 0.6 * this.spec.scale, vy: 0.8, grow: 1.5 });
    }
    if (this.spec.old) {
      this.game.gfx.requestLight(c.x, c.y, 2, this.hue.fx[0], 6 + this.spec.scale * 4);
    }
  }
}

// A battle dragon's breath: the dungeon breath's cone or line, sweeping after
// the dragon's target and burning through every foe it covers (each once).
// What it leaves on the ground (fire, acid, a poison cloud, a blizzard)
// belongs to the dragon's side.
export class BattleBreath extends DragonBreath {
  init() {
    super.init();
    this.struck = new Set();
  }

  update(k) {
    const game = this.game;
    const dragon = this.dragon;
    this.life -= k;
    if (this.life <= 0 || !dragon || dragon.killed || dragon.isStunned) {
      this.kill();
      return;
    }
    const o = dragon.mouth();
    this.pos.x = o.x - 2;
    this.pos.y = o.y - 2;
    const target = dragon.target;
    if (target && !target.killed) {
      const tc = target.center();
      let want = Math.atan2(tc.y - o.y, tc.x - o.x) - this.angle;
      want = Math.atan2(Math.sin(want), Math.cos(want));
      this.angle += Math.max(-0.012 * k, Math.min(0.012 * k, want));
    }
    const reach = this.length * Math.min(1, (this.maxLife - this.life + 1) / 10);
    const full = this.length;
    this.length = reach;
    game.battle.eachNear(o.x, o.y, reach, dragon.foeSide, (f) => {
      if (this.struck.has(f) || f.flying || !this.covers(f._cx, f._cy, o)) {
        return;
      }
      this.struck.add(f);
      this.burn(f);
    });
    this.length = full;
    if (!this.left && this.life < this.maxLife / 2) {
      this.left = true;
      this.leaveGround(o);
    }
  }

  burn(f) {
    const game = this.game;
    const dragon = this.dragon;
    const element = this.element === 'fire' ? 'fire' : this.element === 'cold' ? 'cold' : this.element === 'lightning' ? 'lightning' : 'poison';
    if (f.isWizard) {
      if (f.shielded) {
        if (f === game.player) {
          game.hud.toast('YOUR SHIELD TURNS THE BREATH', '#80c0ff');
        }
        return;
      }
      dragon.strikeFoe(f, this.damage * 2, element);
    } else {
      dragon.strikeFoe(f, this.damage, element);
    }
    if (Math.random() < 0.25) {
      game.fx.burst(f._cx, f._cy, 1.2, { color: this.colors, count: 8, speed: 3, life: 0.4, size: 0.8 });
    }
    if (this.element === 'cold' && f.chill) {
      f.chill(120);
    } else if (this.element === 'lightning' && f.stun) {
      if (f.isWizard) {
        f.stun(30);
      } else if (Math.random() < 0.3) {
        f.stun('shadow');
      }
    }
  }

  // Fire burns and acid pools along the breath; poison and frost linger as a
  // cloud and a blizzard at its far end.
  leaveGround(o) {
    const game = this.game;
    const team = this.dragon.side;
    if (this.element === 'fire' || this.element === 'acid') {
      const kind = this.element;
      const count = Math.round(this.length / 90);
      for (let i = 1; i <= count; i++) {
        const r = this.length * (i / (count + 1));
        const a = this.angle + (this.shape === 'cone' ? (Math.random() - 0.5) * this.halfAngle * 1.6 : 0);
        game.spawn(Zone, o.x + Math.cos(a) * r, o.y + Math.sin(a) * r, { kind, team, radius: kind === 'fire' ? 34 : 44, life: kind === 'fire' ? 420 : 300 });
      }
      return;
    }
    const r = this.length * 0.7;
    const x = o.x + Math.cos(this.angle) * r;
    const y = o.y + Math.sin(this.angle) * r;
    if (this.element === 'poison') {
      game.spawn(Zone, x, y, { kind: 'cloud', team, radius: 100, life: 300 });
    } else if (this.element === 'cold') {
      game.spawn(Zone, x, y, { kind: 'blizzard', team, radius: 100, life: 240 });
    }
  }
}

