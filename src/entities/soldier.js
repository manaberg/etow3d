import { Enemy } from './enemy.js';
import { Projectile } from './spells.js';
import { OrcClasses } from '../world/levels.js';
import { buildOrc } from '../render/models.js';
import { BattleRules } from './battle.js';

// An orc in one of the two battle armies (battle.js). Same classes and numbers
// as the dungeon orcs, but it fights the other army instead of hunting the
// player: it picks the nearest foe (orc or wizard), closes in or keeps its
// range, and follows its side's order (charge, hold, follow the wizard).
export class Soldier extends Enemy {
  defaults() {
    super.defaults();
    this.side = 'player';
    this.orcClass = 'grunt';
    this.slot = { x: 0, y: 0 };
    this.target = null;
    this.retarget = 0;
    this.attackCooldown = 0;
    this.attackMax = 100;
    this.shotCooldown = 0;
    this.healCooldown = 0;
    this.canBeFeared = true;
    this.canPolymorph = true;
    this.aggro = true;
  }

  init() {
    const spec = OrcClasses[this.orcClass] || OrcClasses.grunt;
    this.desiredVel = Math.floor(Math.random() * 40) + 85;
    this.meleeDmg = Math.floor(Math.random() * 10) + 10;
    this.hasCharge = this.orcClass === 'knight';
    this.isHealer = this.orcClass === 'shaman';
    this.isCaster = this.orcClass === 'warlock';
    this.isSlinger = this.orcClass === 'slinger';
    this.range = this.isCaster ? 420 : (this.isSlinger ? 360 : 0);
    if (this.orcClass === 'berserker') {
      this.desiredVel = 150;
      this.meleeDmg += 8;
      this.attackMax = 70;
    } else if (this.orcClass === 'brute') {
      this.desiredVel = 60;
      this.meleeDmg *= 2;
    }
    this.maxSpeed = Math.max(100, this.desiredVel);
    this.hp = this.maxHp = spec.hp * BattleRules.hpScale;
    this.label = '';
    this.rig = buildOrc(spec.look, { team: this.side });
    this.view = this.rig.root;
    this.game.gfx.add(this.view);
  }

  get foeSide() {
    return this.side === 'player' ? 'enemy' : 'player';
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
    if (!battle.fighting) {
      // deploying: stand in formation until the horns sound
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

    this.retarget -= k;
    if (this.retarget <= 0 || !this.target || this.target.killed || this.target.dead) {
      this.target = battle.nearestFoe(this);
      this.retarget = 20 + Math.random() * 10;
    }
    if (this.isHealer && this.healCooldown <= 0) {
      for (const ally of battle.units(this.side)) {
        if (ally !== this && ally.alive && ally.hp < ally.maxHp * 0.5 && ally.distanceTo(this) < 300) {
          ally.hp = Math.min(ally.maxHp, ally.hp + 80);
          this.healCooldown = 220;
          game.healFx(ally);
          break;
        }
      }
    }

    const order = battle.orders[this.side];
    const target = this.target;
    const dist = target ? this.distanceTo(target) : Infinity;
    // a foe this close is fought whatever the orders say
    const engaged = dist < (this.range ? this.range : 150);
    if (this.isStunned) {
      this.vel.x = 0;
      this.vel.y = 0;
    } else if (this.isFeared) {
      this.stumble(k);
    } else if (order === 'follow' && !engaged) {
      const anchor = battle.anchor(this.side, this);
      this.goTo(anchor, 40);
    } else if (order === 'hold' && !engaged) {
      this.goTo(battle.anchor(this.side, this), 16);
    } else if (target) {
      const sees = game.hasRoomLineOfSight(this, target);
      if (this.range && dist < this.range && sees) {
        this.vel.x = 0;
        this.vel.y = 0;
        this.shoot(target);
      } else if (this.touches(target)) {
        this.vel.x = 0;
        this.vel.y = 0;
      } else {
        const speed = this.hasCharge && dist < 320 ? 150 : this.desiredVel;
        if (!game.navigateEntityToward(this, target, speed, 20)) {
          this.stumble(k);
        }
      }
    } else {
      this.vel.x = 0;
      this.vel.y = 0;
    }
    this.separate(battle);
    if (target && !this.isStunned && !this.isFeared) {
      this.melee(target);
    }
    this.moveBody(k);
  }

  goTo(point, slack) {
    const c = this.center();
    if (Math.hypot(point.x - c.x, point.y - c.y) < slack) {
      this.vel.x = 0;
      this.vel.y = 0;
      return;
    }
    const mark = this._mark || (this._mark = {
      id: 'slot-' + this.id,
      pos: { x: 0, y: 0 },
      size: { x: 2, y: 2 },
      center() {
        return { x: this.pos.x + 1, y: this.pos.y + 1 };
      }
    });
    mark.pos.x = point.x - 1;
    mark.pos.y = point.y - 1;
    this.game.navigateEntityToward(this, mark, this.desiredVel, 30);
  }

  // Keep a little elbow room from allies so a mob reads as ranks, not a blob.
  separate(battle) {
    const c = this.center();
    for (const ally of battle.units(this.side)) {
      if (ally === this) {
        continue;
      }
      const ac = ally.center();
      const dx = c.x - ac.x;
      const dy = c.y - ac.y;
      const d2 = dx * dx + dy * dy;
      if (d2 > 0 && d2 < 40 * 40) {
        const d = Math.sqrt(d2);
        this.vel.x += (dx / d) * (40 - d) * 3;
        this.vel.y += (dy / d) * (40 - d) * 3;
      }
    }
  }

  shoot(target) {
    if (this.shotCooldown > 0) {
      return;
    }
    const c = this.center();
    const kind = this.isCaster ? 'missile2' : 'stone';
    const spread = this.isCaster ? 0.04 : 0.12;
    this.game.spawn(Projectile, c.x, c.y, { kind, angle: this.angleTo(target) + (Math.random() - 0.5) * spread, team: this.side });
    this.shotCooldown = this.isCaster ? 160 : 100;
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
}
