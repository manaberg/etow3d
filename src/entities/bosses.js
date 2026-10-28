import { Enemy } from './enemy.js';
import { Projectile, Zone } from './spells.js';
import { buildOrc } from '../render/models.js';
import { DungeonLevels } from '../world/levels.js';
import { outfit, rollGear } from './gear.js';

// Orc cleric: a tanky healer that pelts the player with stones and keeps the
// orcs around it on their feet.
export class Clericorc extends Enemy {
  defaults() {
    super.defaults();
    this.knockResist = 0.5;
    this.hp = this.maxHp = 8000;
    this.desiredVel = 100;
    this.attackCooldown = 0;
    this.attackMax = 50;
    this.stoneCooldown = 0;
    this.healCooldown = 0;
    // counterspell holds back its stones and its healing
    this.spellTimers = ['stoneCooldown', 'healCooldown'];
    this.spellpool = 50;
    this.spawnFrames = 300;
    this.pwkillDamage = 250;
    this.label = 'ORC CLERIC';
    this.miniBoss = true;
  }

  init() {
    this.meleeDmg = Math.floor(Math.random() * 10) + 40;
    this.rig = buildOrc('cleric');
    this.view = this.rig.root;
    this.game.gfx.add(this.view);
    // the mitre it wears (a piece of the High Priest's set) is yours once
    // it falls
    outfit(this, ['priest_mitre']);
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
    const hasRoomSight = game.hasRoomLineOfSight(this, player);
    const aggro = game.updateAggro(this, player, hasRoomSight);
    const distance = this.distanceTo(player);

    if (this.healCooldown <= 0) {
      for (const orc of game.orcs()) {
        if (orc.alive && orc.distanceTo(this) < 400 && orc.hp < 100) {
          orc.hp += 150;
          this.healCooldown = 100;
          game.healFx(orc);
          this.rig.swing();
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
    } else if (aggro && this.spellpool > 0 && hasRoomSight && distance < 500 && this.stoneCooldown <= 0 && !player.invis) {
      this.vel.x = 0;
      this.vel.y = 0;
      const c = this.center();
      game.spawn(Projectile, c.x, c.y, { kind: 'stone', angle: this.angleTo(player) + (Math.random() - 0.5) * 0.1, team: 'enemy' });
      this.stoneCooldown = 100;
      this.spellpool--;
      this.rig.swing();
    } else if (!aggro) {
      game.idleEntity(this);
    } else if (this.touches(player)) {
      this.vel.x = 0;
      this.vel.y = 0;
    } else if (!game.navigateEntityToward(this, player, this.desiredVel, 16)) {
      this.vel.x = 0;
      this.vel.y = 0;
    }

    if (this.touches(player) && this.attackCooldown <= 0 && this.spawnFrames <= 0 && !this.lift) {
      this.attackCooldown = this.attackMax;
      this.rig.swing();
      if (!player.takeMelee(this.meleeDmg * 4 + Math.floor(Math.random() * 20) + 50, 0, this)) {
        this.hurt(this.meleeDmg + Math.floor(Math.random() * 10) + 1);
      }
    }
    this.moveBody(k);
    if (this.hp < 0) {
      this.die();
    }
  }

  die() {
    const game = this.game;
    game.stats.killcount++;
    game.stats.bosscount++;
    if (Math.random() < 0.5) {
      game.dropScroll(this);
    }
    game.dropRing(this);
    game.onEnemySlain(this);
    this.dropGear();
    game.deathFx(this);
    this.kill();
  }
}

// Orc mage: casts poison bolts from range and hurls fireballs up close.
export class Mageorc extends Enemy {
  defaults() {
    super.defaults();
    this.knockResist = 0.5;
    this.hp = this.maxHp = 3000;
    this.desiredVel = 90;
    this.attackCooldown = 0;
    this.attackMax = 100;
    this.missileCooldown = 0;
    this.fireballCooldown = 0;
    this.spellTimers = ['missileCooldown', 'fireballCooldown'];
    this.spawnFrames = 300;
    this.pwkillDamage = 250;
    this.label = 'ORC MAGE';
    this.miniBoss = true;
  }

  init() {
    this.meleeDmg = Math.floor(Math.random() * 10) + 20;
    this.rig = buildOrc('mage');
    this.view = this.rig.root;
    this.game.gfx.add(this.view);
    // a rare hat or better, worn until it is taken
    outfit(this, []).add(rollGear(this.game.depth, { slots: ['hat'], minRarity: 'rare' }));
  }

  update(k) {
    const game = this.game;
    const player = game.player;
    if (!player) {
      return;
    }
    this.tickDebuffs(k);
    this.attackCooldown = Math.max(0, this.attackCooldown - k);
    this.missileCooldown = Math.max(0, this.missileCooldown - k);
    this.fireballCooldown = Math.max(0, this.fireballCooldown - k);
    const hasRoomSight = game.hasRoomLineOfSight(this, player);
    const aggro = game.updateAggro(this, player, hasRoomSight);
    const distance = this.distanceTo(player);
    const c = this.center();
    const angle = this.angleTo(player) + (Math.random() - 0.5) * 0.1;

    if (this.spawnFrames > 0) {
      this.spawnFrames -= k;
      this.vel.x = 0;
      this.vel.y = 0;
    } else if (this.isStunned) {
      this.vel.x = 0;
      this.vel.y = 0;
    } else if (!aggro) {
      game.idleEntity(this);
    } else if (hasRoomSight && !player.invis && distance < 400 && distance > 300 && this.missileCooldown <= 0) {
      game.spawn(Projectile, c.x, c.y, { kind: 'missile2', angle, team: 'enemy' });
      this.missileCooldown = 120;
      this.rig.swing();
    } else if (hasRoomSight && !player.invis && distance < 300 && this.fireballCooldown <= 0) {
      game.spawn(Projectile, c.x, c.y, { kind: 'fireball2', angle, team: 'enemy' });
      this.fireballCooldown = 100;
      this.rig.swing();
    } else if (this.touches(player)) {
      this.vel.x = 0;
      this.vel.y = 0;
    } else if (!game.navigateEntityToward(this, player, this.desiredVel, 14)) {
      this.vel.x = 0;
      this.vel.y = 0;
    }

    if (this.touches(player) && this.attackCooldown <= 0 && this.spawnFrames <= 0 && !this.lift) {
      this.attackCooldown = this.attackMax;
      this.rig.swing();
      if (!player.takeMelee(this.meleeDmg * 2 + Math.floor(Math.random() * 20) + 25, 0, this)) {
        this.hurt(this.meleeDmg + Math.floor(Math.random() * 10) + 1);
      }
    }
    this.moveBody(k);
    if (this.hp < 0) {
      this.die();
    }
  }

  die() {
    const game = this.game;
    game.stats.killcount++;
    game.stats.bosscount++;
    if (Math.random() < 0.5) {
      game.dropScroll(this);
    }
    game.dropRing(this);
    game.onEnemySlain(this);
    this.dropGear();
    game.deathFx(this);
    this.kill();
  }
}

// The warlord on the tenth floor. Charges, stuns with shadow bolts, calls
// meteors, hooks the player in and leaves fire behind him.
export class Boss extends Enemy {
  defaults() {
    super.defaults();
    this.knockResist = 0.9;
    this.hp = this.maxHp = 20000;
    this.manergy = 200;
    this.maxManergy = 200;
    this.desiredVel = 155;
    this.maxSpeed = 155;
    this.size = { x: 96, y: 96 };
    this.attackCooldown = 0;
    this.attackMax = 100;
    this.sbCooldown = 0;
    this.msCooldown = 0;
    this.hkCooldown = 0;
    this.frCooldown = 0;
    // counterspell holds back his shadow bolt, meteors and hook (not the
    // fire he trails)
    this.spellTimers = ['sbCooldown', 'msCooldown', 'hkCooldown'];
    this.sightRange = 650;
    this.spawnFrames = 120;
    this.pwkillDamage = 500;
    this.fireSplash = 120;
    this.blizzardSlow = [1 / 1.5, 0.5];
    this.label = 'THE WARLORD';
    this.isBoss = true;
  }

  init() {
    this.meleeDmg = Math.floor(Math.random() * 10) + 10;
    this.rig = buildOrc('boss');
    this.view = this.rig.root;
    this.game.gfx.add(this.view);
  }

  update(k) {
    const game = this.game;
    const player = game.player;
    if (!player) {
      return;
    }
    this.tickDebuffs(k);
    if (this.manergy < this.maxManergy) {
      this.manergy = Math.min(this.maxManergy, this.manergy + 0.1 * k);
    }
    this.attackCooldown = Math.max(0, this.attackCooldown - k);
    this.sbCooldown = Math.max(0, this.sbCooldown - k);
    this.msCooldown = Math.max(0, this.msCooldown - k);
    this.hkCooldown = Math.max(0, this.hkCooldown - k);
    this.frCooldown = Math.max(0, this.frCooldown - k);
    const hasSight = game.hasRoomLineOfSight(this, player);
    const aggro = game.updateAggro(this, player, hasSight);
    const distance = this.distanceTo(player);

    if (this.touches(player) && this.attackCooldown <= 0 && !this.lift) {
      this.attackCooldown = this.attackMax;
      this.rig.swing();
      player.takeMelee(this.meleeDmg * 5, 0, this);
      game.gfx.addShake(0.4);
    }

    if (this.spawnFrames > 0) {
      this.spawnFrames -= k;
      this.vel.x = 0;
      this.vel.y = 0;
    } else if (this.isStunned) {
      this.vel.x = 0;
      this.vel.y = 0;
    } else if (!aggro) {
      // waits on the throne until the player shows up
      game.idleEntity(this);
    } else if (distance < 750 && distance > 50) {
      this.charge(player, hasSight);
      if (distance < 350 && distance > 200) {
        this.castShadowbolt(player);
      } else if (distance > 500) {
        this.castMeteorswarm(player);
      } else if (distance > 350 && this.hp < 10000) {
        this.hookIn(player);
      }
    } else {
      this.fireTrail();
      if (distance > 50 && !game.navigateEntityToward(this, player, this.desiredVel, 12)) {
        this.stumble(k);
      }
    }
    this.moveBody(k);
    if (this.hp < 0) {
      this.die();
    }
  }

  charge(player, hasSight) {
    // path around walls (and pools) when the way to the player is not clear
    if (!hasSight || !this.game.hasWalkingLine(this, player)) {
      this.game.navigateEntityToward(this, player, this.desiredVel, 12);
      return;
    }
    const a = this.angleTo(player);
    this.vel.x = Math.cos(a) * this.desiredVel;
    this.vel.y = Math.sin(a) * this.desiredVel;
  }

  castShadowbolt(player) {
    if (this.sbCooldown <= 0 && this.manergy > 30) {
      const c = this.center();
      this.game.spawn(Projectile, c.x, c.y, { kind: 'shadowbolt', angle: this.angleTo(player) + (Math.random() - 0.5) * 0.1, team: 'enemy' });
      this.sbCooldown = 600;
      this.manergy -= 30;
      this.rig.swing();
    }
  }

  castMeteorswarm(player) {
    if (this.msCooldown <= 0 && this.manergy > 30) {
      const pc = player.center();
      this.game.spawn(Zone, pc.x, pc.y, { kind: 'meteors', team: 'enemy', radius: 96, life: 240 });
      this.msCooldown = 400;
      this.manergy -= 30;
    }
  }

  hookIn(player) {
    if (this.hkCooldown <= 0 && this.manergy > 100) {
      const game = this.game;
      const pc = player.center();
      game.fx.bolt(pc.x, pc.y, this.center().x, this.center().y, { color: 0x8030ff, life: 0.4, width: 0.12, jag: 0.6 });
      // drag the player next to the warlord, onto open floor only
      for (let attempt = 0; attempt < 12; attempt++) {
        const nx = this.pos.x + Math.floor(Math.random() * 192) - 96;
        const ny = this.pos.y + Math.floor(Math.random() * 192) - 96;
        if (game.world.canStandAt(nx, ny, player.size.x, player.size.y)) {
          player.pos.x = nx;
          player.pos.y = ny;
          break;
        }
      }
      this.manergy -= 100;
      this.hkCooldown = 1000;
    }
  }

  fireTrail() {
    if (this.frCooldown <= 0) {
      const c = this.center();
      this.game.spawn(Zone, c.x, this.pos.y + this.size.y + 24, { kind: 'fire', team: 'enemy', radius: 24, life: 1500 });
      this.frCooldown = 24;
    }
  }

  die() {
    const game = this.game;
    game.stats.killcount++;
    game.stats.bosscount++;
    game.onEnemySlain(this);
    game.deathFx(this);
    this.kill();
    // below his throne the dragons wait; the run ends only if he is the last floor
    if (game.depth < DungeonLevels.count) {
      game.onWarlordSlain(this);
    } else {
      game.onVictory();
    }
  }
}
