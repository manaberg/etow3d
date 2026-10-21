import { Entity } from '../core/entity.js';
import { UNIT } from '../core/constants.js';
import { buildScroll, buildPotion, buildRing, buildStairs } from '../render/models.js';
import { SpellBook } from './mage.js';

// Loot on the floor. Dropped loot fades after a while; loot placed at the
// start of a floor (`persistent`) waits until it is picked up.
class Item extends Entity {
  defaults() {
    this.persistent = false;
    this.life = 35 * 60;
    this.bob = Math.random() * 10;
  }

  update(k) {
    if (!this.persistent) {
      this.life -= k;
      if (this.life <= 0) {
        this.kill();
        return;
      }
    }
    const game = this.game;
    const player = game.player;
    if (player && !player.dead && this.touches(player)) {
      this.pickUp(player);
    } else if (game.duelLoot && this.isLoot && game.rival && !game.rival.killed && this.touches(game.rival)) {
      this.pickUp(game.rival);
    }
  }

  pickUp() {}

  syncView(time) {
    const c = this.center();
    const fading = !this.persistent && this.life < 180 && Math.floor(time * 8) % 2 === 0;
    this.view.visible = !fading;
    this.view.position.set(c.x * UNIT, 0.8 + Math.sin(time * 2.4 + this.bob) * 0.15, c.y * UNIT);
    this.view.rotation.y = time * 1.4 + this.bob;
  }
}

// Spellbook flags in the scroll numbering of the 2D game (1-15), then the
// spells new to the 3D game.
const SCROLL_SPELLS = [null, 'hasFireball', 'hasLightning', 'hasIronshot', 'hasBlink', 'hasTimestop', 'hasShield', 'hasHaste', 'hasStun', 'hasImage', 'hasBlizzard', 'hasRay', 'hasInvis', 'hasFear', 'hasPwkill', 'hasTele',
  'hasScorch', 'hasCone', 'hasThunder', 'hasMeteor', 'hasGuardians', 'hasCloud', 'hasHeal', 'hasPolymorph', 'hasDisintegrate', 'hasWeapon'];
const SCROLL_UPGRADES = { 1: 'hasFb2', 2: 'hasLg2', 3: 'hasIs2', 4: 'hasBk2', 10: 'hasBz2' };

function spellName(flag) {
  const spell = SpellBook.find((s) => s.flag === flag || s.tier === flag);
  return spell ? spell.name : flag;
}

export class Scroll extends Item {
  defaults() {
    super.defaults();
    this.tier = 0;
    this.isLoot = true;
  }

  init() {
    this.spellnumber = Math.floor(Math.random() * (SCROLL_SPELLS.length - 1)) + 1;
    this.view = buildScroll(this.tier);
    this.game.gfx.add(this.view);
  }

  isUsefulSpell(player, number) {
    if (!player[SCROLL_SPELLS[number]]) {
      return true;
    }
    const upgrade = SCROLL_UPGRADES[number];
    return this.tier === 1 && !!upgrade && !player[upgrade];
  }

  // a scroll for a spell already known turns into one the player lacks
  pickUsefulSpell(player) {
    if (this.isUsefulSpell(player, this.spellnumber)) {
      return this.spellnumber;
    }
    const useful = [];
    for (let n = 1; n < SCROLL_SPELLS.length; n++) {
      if (this.isUsefulSpell(player, n)) {
        useful.push(n);
      }
    }
    return useful.length ? useful[Math.floor(Math.random() * useful.length)] : this.spellnumber;
  }

  pickUp(player) {
    if (this.game.duelLoot) {
      this.game.duelLoot.takeScroll(player);
      this.game.pickupFx(this, 0xfff0c0);
      this.kill();
      return;
    }
    const n = this.pickUsefulSpell(player);
    const flag = SCROLL_SPELLS[n];
    const upgrade = SCROLL_UPGRADES[n];
    let message;
    if (player[flag] && this.tier === 1 && upgrade) {
      player[upgrade] = true;
      if (n === 3) {
        player.is2Charges = 2;
      }
      message = spellName(flag) + ' :: TIER 2';
    } else {
      message = (player[flag] ? 'ALREADY KNOWN :: ' : 'LEARNED :: ') + spellName(flag);
      player[flag] = true;
    }
    this.game.stats.scrollcount++;
    this.game.pickupFx(this, this.tier ? 0xffd040 : 0xfff0c0);
    this.game.hud.toast(message, this.tier ? '#ffd040' : '#f3e6c4');
    this.kill();
  }
}

export class Potion extends Item {
  defaults() {
    super.defaults();
    this.isSpecial = false;
    this.knightPot = false;
    this.isLoot = true;
  }

  init() {
    this.isBlue = Math.floor(Math.random() * 10) + 1 > 7;
    if (this.isSpecial) {
      this.isBlue = true;
    }
    if (this.knightPot) {
      this.isBlue = false;
    }
    this.view = buildPotion(this.isBlue);
    this.game.gfx.add(this.view);
  }

  pickUp(player) {
    if (this.game.duelLoot) {
      this.game.duelLoot.takePotion(player, this.isBlue);
      this.game.pickupFx(this, this.isBlue ? 0x3a7aff : 0xff2a3a);
      this.kill();
      return;
    }
    const stats = this.game.stats;
    if (this.isBlue) {
      player.maxManergy += 25;
      player.manergy += 75;
      stats.bluepotcount++;
      this.game.hud.toast('MANERGY POTION :: +25 MAX MANERGY', '#6aa8ff');
    } else {
      player.hp += 35;
      stats.redpotcount++;
      this.game.hud.toast('HEALTH POTION :: +35 HP', '#ff6a70');
    }
    this.game.pickupFx(this, this.isBlue ? 0x3a7aff : 0xff2a3a);
    this.kill();
  }
}

const RINGS = [
  ['hasMrring', 'RING OF MANERGY :: FASTER MANERGY REGEN'],
  ['hasSpring', 'RING OF SPEED :: FASTER MOVEMENT'],
  ['hasFrring', 'RING OF FIRE :: CHEAPER FIREBALLS'],
  ['hasElring', 'RING OF STORMS :: CHEAPER LIGHTNING'],
  ['hasMsring', 'RING OF FORCE :: STRONGER MISSILES']
];

export class Ring extends Item {
  defaults() {
    super.defaults();
    this.life = 25 * 60;
  }

  init() {
    this.view = buildRing();
    this.game.gfx.add(this.view);
  }

  pickUp(player) {
    const missing = RINGS.filter(([flag]) => !player[flag]);
    const pool = missing.length > 0 ? missing : RINGS;
    const [flag, message] = pool[Math.floor(Math.random() * pool.length)];
    player[flag] = true;
    this.game.pickupFx(this, 0xffd060);
    this.game.hud.toast(message, '#ffd060');
    this.kill();
  }
}

// The way down. Sealed until enough of the floor has been slain.
export class Stairs extends Entity {
  init() {
    this.size = { x: 96, y: 96 };
    this.playerOn = false;
    this.view = buildStairs();
    this.game.gfx.add(this.view);
  }

  update() {
    const game = this.game;
    const player = game.player;
    this.playerOn = !!player && this.touches(player);
    if (this.playerOn && game.isStairsOpen() && game.input.pressed('descend')) {
      game.requestDescend();
    }
  }

  syncView(time) {
    const c = this.center();
    this.view.position.set(c.x * UNIT, 0, c.y * UNIT);
    const open = this.game.isStairsOpen();
    const { seal, beam } = this.view.userData;
    seal.visible = !open;
    seal.rotation.z = time * 0.5;
    beam.visible = open;
    beam.material.opacity = 0.1 + Math.sin(time * 3) * 0.04;
    if (open && Math.random() < 0.4) {
      this.game.fx.column(c.x, c.y, 40, { color: 0x60c0ff, count: 1, rise: 2.2, life: 1.2, size: 0.6 });
    }
    this.game.gfx.requestLight(c.x, c.y, 1.5, open ? 0x60c0ff : 0xff4020, open ? 16 : 8);
  }
}
