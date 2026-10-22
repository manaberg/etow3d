import { Enemy } from './enemy.js';
import { Projectile } from './spells.js';
import { OrcClasses, Races, raceLook } from '../world/levels.js';
import { buildOrc, buildSheep } from '../render/models.js';
import { UNIT } from '../core/constants.js';
import { BattleRules } from './battle.js';

// A soldier in one of the battle armies (battle.js): an orc, dwarf, human or
// elf, as its army's race (Races in levels.js) scales its health, speed,
// damage and range and picks its look and missiles. It belongs to a regiment and
// follows the regiment's order: charge (fight the nearest foe), hold (march to
// its slot in the regiment's formation and fight whatever comes in reach) or
// follow (keep formation around its wizard). Brawlers close in, slingers and
// warlocks keep their range, knights charge, shamans heal. Neighbours and foes
// come from the battle's spatial grid, so armies of hundreds stay cheap, and
// it is drawn instanced by the army renderer when the Blender models loaded.
export class Soldier extends Enemy {
  defaults() {
    super.defaults();
    this.side = 'player';
    this.orcClass = 'grunt';
    this.race = 'orc';
    this.regiment = null;
    this.slot = { x: 0, y: 0 };
    this.target = null;
    this.retarget = 0;
    this.sees = false;
    this.attackCooldown = 0;
    this.attackMax = 100;
    this.shotCooldown = 0;
    this.healCooldown = 0;
    this.stuck = 0;
    this.sidestep = 0;
    this.lastX = 0;
    this.lastY = 0;
    this.canBeFeared = true;
    this.canPolymorph = true;
    this.aggro = true;
  }

  init() {
    const spec = OrcClasses[this.orcClass] || OrcClasses.grunt;
    const race = Races[this.race] || Races.orc;
    this.raceSpec = race;
    this.desiredVel = Math.floor(Math.random() * 30) + 90;
    this.meleeDmg = Math.floor(Math.random() * 10) + 10;
    this.hasCharge = this.orcClass === 'knight';
    this.isHealer = this.orcClass === 'shaman';
    this.isCaster = this.orcClass === 'warlock';
    this.isSlinger = this.orcClass === 'slinger';
    this.range = this.isCaster ? 420 : (this.isSlinger ? 380 : 0);
    if (this.orcClass === 'berserker') {
      this.desiredVel = 150;
      this.meleeDmg += 8;
      this.attackMax = 70;
    } else if (this.orcClass === 'brute') {
      this.desiredVel = 65;
      this.meleeDmg *= 2;
    } else if (this.hasCharge) {
      this.desiredVel = 120;
    }
    this.desiredVel = Math.round(this.desiredVel * race.speed);
    this.meleeDmg = Math.round(this.meleeDmg * race.damage);
    this.range = Math.round(this.range * race.range);
    this.maxSpeed = Math.round(160 * race.speed);
    this.hp = this.maxHp = spec.hp * race.hp * BattleRules.hpScale;
    this.label = '';
    const look = raceLook(this.race, this.orcClass);
    const army = this.game.army;
    this.rig = army ? army.register(this, look, this.side) : null;
    if (!this.rig) {
      // no instanced slot (models missing): a full rig of its own
      this.rig = buildOrc(look, { team: this.side });
      this.view = this.rig.root;
      this.game.gfx.add(this.view);
    }
    this.lastX = this.pos.x;
    this.lastY = this.pos.y;
  }

  update(k) {
    const game = this.game;
    const battle = game.battle;
    this.tickDebuffs(k);
    this.attackCooldown = Math.max(0, this.attackCooldown - k);
    this.shotCooldown = Math.max(0, this.shotCooldown - k);
    this.healCooldown = Math.max(0, this.healCooldown - k);
    if (this.hp < 0) {
      this.die();
      return;
    }
    if (!battle.fighting && this.regiment.order !== 'hold') {
      this.vel.x = 0;
      this.vel.y = 0;
      return;
    }
    if (this.sheepFrames > 0) {
      this.wander -= k;
      if (this.wander <= 0) {
        const a = Math.random() * Math.PI * 2;
        this.vel.x = Math.cos(a) * 30;
        this.vel.y = Math.sin(a) * 30;
        this.wander = 90;
      }
      this.moveBody(k);
      return;
    }

    const regiment = this.regiment;
    const order = regiment.order;
    this.retarget -= k;
    if (order === 'attack' && (this.retarget <= 0 || !this.target || this.target.killed)) {
      // sent against one regiment: go for its nearest orc
      this.target = battle.attackFoe(this);
      if (!this.target) {
        // that regiment is gone: hold the ground we won
        regiment.order = 'hold';
        regiment.attackTarget = null;
        regiment.point = { x: regiment.centroid.x, y: regiment.centroid.y };
      }
      this.sees = this.target ? game.hasRoomLineOfSight(this, this.target) : false;
      this.retarget = 18 + Math.random() * 12;
    } else if (this.retarget <= 0 || !this.target || this.target.killed || this.target.dead) {
      // charging orcs look far for a fight; others only around them
      this.target = battle.nearestFoe(this, order === 'charge' ? Infinity : (this.range || 260));
      this.sees = this.target ? game.hasRoomLineOfSight(this, this.target) : false;
      this.retarget = 18 + Math.random() * 12;
    }
    if (this.isHealer && this.healCooldown <= 0 && battle.fighting) {
      for (const ally of battle.near(this, 300, this.side)) {
        if (ally !== this && ally.alive && ally.hp < ally.maxHp * 0.5) {
          ally.hp = Math.min(ally.maxHp, ally.hp + 90);
          this.healCooldown = 200;
          game.healFx(ally);
          break;
        }
      }
    }

    const target = battle.fighting ? this.target : null;
    const dist = target ? this.distanceTo(target) : Infinity;
    const reach = this.range ? this.range : 140;
    const engaged = dist < reach;
    if (this.isStunned) {
      this.vel.x = 0;
      this.vel.y = 0;
    } else if (this.isFeared) {
      this.stumble(k);
    } else if (target && (order === 'charge' || order === 'attack' || engaged)) {
      if (this.range && dist < this.range && this.sees) {
        this.vel.x = 0;
        this.vel.y = 0;
        this.shoot(target);
      } else if (this.closeTo(target)) {
        this.vel.x = 0;
        this.vel.y = 0;
      } else {
        const tc = target.center();
        this.steer(tc.x, tc.y, this.hasCharge && dist < 320 ? 170 * this.raceSpec.speed : this.desiredVel);
      }
    } else {
      const spot = battle.slotPoint(this);
      this.steer(spot.x, spot.y, this.desiredVel, 10);
    }
    this.separate(battle);
    this.unstick(k);
    if (target && !this.isStunned && !this.isFeared) {
      this.melee(target);
    }
    this.moveBody(k);
  }

  // Straight at the goal across the open field; walls and rocks slide us along.
  steer(x, y, speed, slack = 2) {
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
    if (this.sidestep > 0) {
      // working round a rock: walk along it for a moment
      const sx = -dy / d * this.sidestepSign;
      const sy = dx / d * this.sidestepSign;
      this.vel.x = (this.vel.x * 0.3 + sx * v);
      this.vel.y = (this.vel.y * 0.3 + sy * v);
    }
  }

  // Wanting to move but not getting anywhere: sidestep for a while.
  unstick(k) {
    this.sidestep = Math.max(0, this.sidestep - k);
    const moved = Math.abs(this.pos.x - this.lastX) + Math.abs(this.pos.y - this.lastY);
    const trying = Math.abs(this.vel.x) + Math.abs(this.vel.y) > 30;
    this.stuck = trying && moved < 0.5 * k ? this.stuck + k : 0;
    if (this.stuck > 40) {
      this.sidestep = 45;
      this.sidestepSign = Math.random() < 0.5 ? -1 : 1;
      this.stuck = 0;
    }
    this.lastX = this.pos.x;
    this.lastY = this.pos.y;
  }

  // Elbow room from neighbours, so regiments read as ranks and not a blob.
  separate(battle) {
    const c = this.center();
    for (const other of battle.near(this, 40)) {
      if (other === this || other.isWizard) {
        continue;
      }
      const oc = other.center();
      const dx = c.x - oc.x;
      const dy = c.y - oc.y;
      const d2 = dx * dx + dy * dy;
      if (d2 > 0.01 && d2 < 40 * 40) {
        const d = Math.sqrt(d2);
        const push = (40 - d) * (other.side === this.side ? 3 : 1.5);
        this.vel.x += (dx / d) * push;
        this.vel.y += (dy / d) * push;
      }
    }
  }

  shoot(target) {
    if (this.shotCooldown > 0) {
      return;
    }
    const c = this.center();
    const kind = this.isCaster ? this.raceSpec.bolt : this.raceSpec.shot;
    // elves shoot straighter
    const spread = (this.isCaster ? 0.04 : 0.12) / this.raceSpec.range;
    this.game.spawn(Projectile, c.x, c.y, { kind, angle: this.angleTo(target) + (Math.random() - 0.5) * spread, team: this.side });
    this.shotCooldown = (this.isCaster ? 160 : 100) + Math.random() * 20;
    this.rig.swing();
  }

  melee(target) {
    if (this.attackCooldown > 0 || !this.closeTo(target)) {
      return;
    }
    this.attackCooldown = this.attackMax;
    this.rig.swing();
    const dmg = this.meleeDmg + Math.floor(Math.random() * 10) + (this.hasCharge ? 15 : 5);
    if (target.isWizard) {
      // a wizard's shield turns the blow back on the orc
      if (target.shielded) {
        this.hurt(dmg);
      } else if (target.takeMelee) {
        target.takeMelee(dmg);
      } else {
        target.hurt(dmg);
      }
    } else {
      target.hurt(dmg);
    }
  }

  closeTo(other) {
    return !(
      this.pos.x - 6 >= other.pos.x + other.size.x ||
      this.pos.x + this.size.x + 6 <= other.pos.x ||
      this.pos.y - 6 >= other.pos.y + other.size.y ||
      this.pos.y + this.size.y + 6 <= other.pos.y
    );
  }

  die() {
    const game = this.game;
    if (this.side === 'enemy') {
      game.stats.killcount++;
      game.stats.orccount++;
    }
    game.deathFx(this);
    this.kill();
  }

  dispose() {
    if (this.instance) {
      this.game.army.hide(this);
    }
    if (this.sheep) {
      this.game.gfx.remove(this.sheep);
    }
    super.dispose();
  }

  syncView(time, dt) {
    const c = this.center();
    const speed = Math.hypot(this.vel.x, this.vel.y);
    let facing = null;
    if (speed > 2) {
      facing = Math.atan2(this.vel.x, this.vel.y);
    } else if (this.target && !this.target.killed) {
      const tc = this.target.center();
      facing = Math.atan2(tc.x - c.x, tc.y - c.y);
    } else {
      // the player's army faces up the screen, the rival's down
      facing = this.side === 'player' ? Math.PI : 0;
    }
    this.rig.animate(dt, this.isStunned ? 0 : Math.min(1.3, speed / 90), facing);
    const sheep = this.sheepFrames > 0;
    if (sheep && !this.sheep) {
      this.sheep = buildSheep();
      this.game.gfx.add(this.sheep);
    }
    if (this.sheep) {
      this.sheep.visible = sheep;
      if (sheep) {
        this.sheep.position.set(c.x * UNIT, 0, c.y * UNIT);
        this.sheep.rotation.y = facing;
      }
    }
    if (this.instance) {
      if (sheep) {
        this.game.army.hide(this);
      } else {
        this.game.army.write(this, c.x, c.y);
      }
    } else {
      this.view.visible = !sheep;
      this.view.position.set(c.x * UNIT, 0, c.y * UNIT);
    }
    const fx = this.game.fx;
    if (this.isStunned && Math.random() < 0.1) {
      fx.column(c.x, c.y, 20, { color: 0x40ff60, count: 1, rise: 0.6, life: 0.6, size: 0.5 });
    }
    if (this.isFeared && Math.random() < 0.15) {
      fx.emit(c.x, c.y, this.rig.height + 0.3, { color: 0xc040ff, life: 0.5, size: 0.6, vx: (Math.random() - 0.5) * 2, vz: (Math.random() - 0.5) * 2 });
    }
    if (this.chillFrames > 0 && Math.random() < 0.15) {
      fx.emit(c.x, c.y, Math.random() * this.rig.height, { color: 0xbfe8ff, life: 0.5, size: 0.4, vy: -0.5 });
    }
  }
}
