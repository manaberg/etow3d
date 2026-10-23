import { Enemy } from './enemy.js';
import { Projectile } from './spells.js';
import { DungeonLevels, OrcClasses, Races, raceLook } from '../world/levels.js';
import { buildOrc } from '../render/models.js';
import { Inventory, rollGear } from './gear.js';

// Regular dungeon foes: orcs, or a warband of dwarves, humans or elves. The
// level plan picks a race for the pack and a class for each; the race, depth
// and champion rolls scale their health, speed and damage.
export class Orc extends Enemy {
  defaults() {
    super.defaults();
    this.orcClass = 'grunt';
    this.race = 'orc';
    this.depth = 1;
    this.isChampion = false;
    this.attackCooldown = 0;
    this.attackMax = 100;
    this.stoneCooldown = 0;
    this.healCooldown = 0;
    this.castCooldown = 0;
    this.castMax = 160;
    this.enraged = false;
    this.quiver = 0;
    this.canBeFeared = true;
    this.canPolymorph = true;
    this.spawnFrames = 120;
  }

  init() {
    // speed 25 - 150, melee 10 - 19
    this.desiredVel = Math.floor(Math.random() * 125) + 25;
    this.meleeDmg = Math.floor(Math.random() * 10) + 10;
    const spec = OrcClasses[this.orcClass] || OrcClasses.grunt;
    const race = Races[this.race] || Races.orc;
    this.raceSpec = race;
    let hp = spec.hp * race.hp * DungeonLevels.hpScale(this.depth);
    let damage = race.damage * DungeonLevels.damageScale(this.depth);
    this.hasCharge = this.orcClass === 'knight';
    this.isHealer = this.orcClass === 'shaman';
    this.isCaster = this.orcClass === 'warlock';
    this.quiver = this.orcClass === 'slinger' ? 4 + Math.floor(this.depth / 2) : 0;
    this.sightRange = spec.sight ? spec.sight * race.range : 0;
    if (this.orcClass === 'berserker') {
      this.desiredVel = Math.floor(Math.random() * 30) + 140;
      this.meleeDmg += 8;
      this.attackMax = 70;
    } else if (this.orcClass === 'brute') {
      this.desiredVel = Math.floor(Math.random() * 15) + 45;
      this.meleeDmg *= 2;
    } else if (this.orcClass === 'warlock') {
      this.desiredVel = Math.floor(Math.random() * 30) + 60;
    }
    this.desiredVel = Math.round(this.desiredVel * race.speed);
    if (this.isChampion) {
      hp *= 1.8;
      damage *= 1.3;
    }
    this.maxSpeed = Math.max(Math.round(100 * race.speed), this.desiredVel);
    this.desiredVel = Math.min(this.desiredVel, this.maxSpeed);
    this.hp = this.maxHp = Math.round(hp);
    this.meleeDmg = Math.round(this.meleeDmg * damage);
    // every soldier goes by its class; orcs say they are orcs, as their
    // clerics and mages do
    const name = (this.race === 'orc' ? 'ORC ' : '') + race.names[this.orcClass];
    this.label = ((this.isChampion ? 'CHAMPION ' : '') + name).trim();
    this.rig = buildOrc(raceLook(this.race, this.orcClass), { champion: this.isChampion });
    this.view = this.rig.root;
    this.game.gfx.add(this.view);
    this.rollGear();
  }

  // Some of them wear gear (gear.js), on show and dropped when they fall:
  // casters now and then a hat or robe, champions often a ring or a robe,
  // and deeper down anyone may have found a ring.
  rollGear() {
    const wear = [];
    const caster = this.orcClass === 'shaman' || this.orcClass === 'warlock';
    if (caster && Math.random() < 0.15 + this.depth * 0.03) {
      wear.push(rollGear(this.depth, { slots: [Math.random() < 0.5 ? 'hat' : 'robe'] }));
    }
    if (this.isChampion) {
      if (Math.random() < 0.6) {
        wear.push(rollGear(this.depth, { slots: [Math.random() < 0.6 ? 'ring' : 'robe'], minRarity: 'magic' }));
      }
    } else if (Math.random() < this.depth * 0.006) {
      wear.push(rollGear(this.depth, { slots: ['ring'] }));
    }
    if (wear.length) {
      this.inventory = new Inventory(this);
      for (const item of wear) {
        this.inventory.add(item);
      }
    }
  }

  update(k) {
    const game = this.game;
    const player = game.player;
    if (!player) {
      return;
    }
    this.tickDebuffs(k);
    this.attackCooldown = Math.max(0, this.attackCooldown - k);
    this.stoneCooldown = Math.max(0, this.stoneCooldown - k);
    this.healCooldown = Math.max(0, this.healCooldown - k);
    this.castCooldown = Math.max(0, this.castCooldown - k);

    if (this.sheepFrames > 0) {
      // polymorphed into a sheep: it ambles about and can neither fight nor cast
      this.wander -= k;
      if (this.wander <= 0) {
        const a = Math.random() * Math.PI * 2;
        this.vel.x = Math.cos(a) * 30;
        this.vel.y = Math.sin(a) * 30;
        this.wander = 90;
      }
      this.moveBody(k);
      if (this.hp < 0) {
        this.die();
      }
      return;
    }

    const image = game.firstImage();
    const hasRoomSight = game.hasRoomLineOfSight(this, player);
    const hasImageSight = image ? game.hasRoomLineOfSight(this, image) : false;
    const aggro = game.updateAggro(this, player, hasRoomSight);
    const distance = this.distanceTo(player);

    // berserkers speed up once badly hurt
    if (this.orcClass === 'berserker' && !this.enraged && this.hp < this.maxHp / 2) {
      this.enraged = true;
      this.desiredVel = Math.round(this.desiredVel * 1.3);
      this.maxSpeed = this.desiredVel;
    }
    // knights charge once they see the player close by
    if (aggro && hasRoomSight && distance < 400 && this.hasCharge) {
      this.desiredVel = 150;
      this.maxSpeed = 150;
    }
    // shamans patch up badly hurt allies
    if (this.isHealer && this.healCooldown <= 0) {
      for (const other of game.orcs()) {
        if (other.alive && other.distanceTo(this) < 400 && other.hp < 50) {
          other.hp += 100;
          this.healCooldown = 200;
          game.healFx(other);
          break;
        }
      }
    }

    if (this.spawnFrames > 0) {
      this.spawnFrames -= k;
      this.vel.x = 0;
      this.vel.y = 0;
    } else if (this.isStunned) {
      this.vel.x = 0;
      this.vel.y = 0;
    } else if (this.isFeared) {
      this.stumble(k);
    } else if (image && hasImageSight) {
      game.navigateEntityToward(this, image, this.desiredVel, 14);
    } else if (!aggro) {
      // hasn't noticed the player: guard the home room
      game.idleEntity(this);
    } else if (this.isCaster && hasRoomSight && distance < 440 * this.raceSpec.range && distance > 140) {
      // warlocks hold their ground and cast bolts
      this.vel.x = 0;
      this.vel.y = 0;
      if (this.castCooldown <= 0) {
        const c = this.center();
        game.spawn(Projectile, c.x, c.y, { kind: this.raceSpec.bolt, angle: this.angleTo(player), team: 'enemy' });
        this.castCooldown = this.castMax;
        this.rig.swing();
      }
    } else if (this.quiver > 0 && hasRoomSight && distance < 400 * this.raceSpec.range) {
      // slingers keep their distance while they have stones
      this.vel.x = 0;
      this.vel.y = 0;
      if (this.stoneCooldown <= 0) {
        const c = this.center();
        game.spawn(Projectile, c.x, c.y, { kind: this.raceSpec.shot, angle: this.angleTo(player) + (Math.random() - 0.5) * 0.1, team: 'enemy' });
        this.stoneCooldown = 100;
        this.quiver--;
        this.rig.swing();
      }
    } else if (distance > 50 || !hasRoomSight) {
      if (!game.navigateEntityToward(this, player, this.desiredVel, 14)) {
        this.stumble(k);
      }
    } else {
      this.vel.x = 0;
      this.vel.y = 0;
    }

    this.melee(player);
    if (image && this.touches(image)) {
      image.hp -= k;
    }
    this.moveBody(k);

    if (this.hp < 0) {
      this.die();
    }
  }

  melee(player) {
    if (!this.touches(player) || this.attackCooldown > 0 || this.spawnFrames > 0) {
      return;
    }
    this.attackCooldown = this.attackMax;
    this.rig.swing();
    let landed;
    if (this.hasCharge) {
      landed = player.takeMelee(this.meleeDmg * 2 + Math.floor(Math.random() * 10) + 15);
    } else if (this.isHealer) {
      landed = player.takeMelee(this.meleeDmg, this.meleeDmg * 2 + Math.floor(Math.random() * 10) + 25);
    } else {
      landed = player.takeMelee(this.meleeDmg + Math.floor(Math.random() * 10) + 10);
    }
    if (!landed) {
      // the shield bites back
      this.hurt(this.meleeDmg + Math.floor(Math.random() * 10) + 1);
    }
  }

  die() {
    const game = this.game;
    const stats = game.stats;
    stats.killcount++;
    if (this.isHealer) {
      stats.shamancount++;
      const roll = Math.floor(Math.random() * 100) + 1;
      if (roll === 95) {
        game.dropPotion(this, { isSpecial: true });
      } else if (roll > 95) {
        game.dropScroll(this, 0);
      }
    } else if (this.hasCharge) {
      stats.knightcount++;
      if (Math.floor(Math.random() * 100) + 1 >= 95) {
        game.dropPotion(this, { knightPot: true });
      }
    } else {
      stats.orccount++;
    }
    game.rollOrcLoot(this);
    game.onEnemySlain(this);
    this.dropGear();
    game.deathFx(this);
    this.kill();
  }
}
