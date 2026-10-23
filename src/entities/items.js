import { Entity } from '../core/entity.js';
import { UNIT } from '../core/constants.js';
import { buildScroll, buildPotion, buildStairs } from '../render/models.js';
import { buildGearLoot } from '../render/gearModels.js';
import { SpellBook, SpellById } from './mage.js';
import { BarSlots, CircleFloors, RankRules, ROMAN, rankOf } from './spellbar.js';
import { actionKeyLabel } from '../core/bindings.js';
import { Rarities, ClassicRings, makeItem, outfit } from './gear.js';

// Loot on the floor. Dropped loot fades after a while; loot placed at the
// start of a floor (`persistent`) waits until it is picked up.
export class Item extends Entity {
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

// A survival scroll teaches a spell of the circles its floor has reached
// (spellbar.js CircleFloors), or ranks up one its reader already knows; now
// and then it adds a magic missile dart instead, until the third. A gold
// (tier 1) scroll ranks up a spell on the reader's bar, so it goes to a spell
// in use. What a scroll gives is decided when it is read.
const MISSILE_SCROLL_CHANCE = 0.15;

function pick(list) {
  return list[Math.floor(Math.random() * list.length)];
}

export function scrollPool(depth) {
  return SpellBook.filter((s) => s.flag && CircleFloors[s.circle] <= depth).map((s) => s.id);
}

// Learns a spell, ranks up one already known, or (`id` 'missile') adds a
// magic missile dart, and says so. Scrolls and the trials' spoils (mirror.js).
export function studySpell(player, id) {
  if (id === 'missile') {
    player.rankUp('missile');
    return 'MAGIC MISSILE :: ' + player.missileTier + ' DARTS';
  }
  if (player.knowsSpell(id)) {
    return SpellById[id].name + ' :: RANK ' + ROMAN[player.rankUp(id)];
  }
  const slot = player.learnSpell(id);
  return 'LEARNED :: ' + SpellById[id].name + ' :: ' +
    (slot >= 0 ? 'ON ' + actionKeyLabel(BarSlots[slot].action) : 'IN YOUR SPELLBOOK (' + actionKeyLabel('spellbook') + ')');
}

export class Scroll extends Item {
  defaults() {
    super.defaults();
    this.tier = 0;
    this.isLoot = true;
  }

  init() {
    this.view = buildScroll(this.tier);
    this.game.gfx.add(this.view);
  }

  // The spell id it gives `player` ('missile' for a dart), or null when
  // there is nothing left to learn from the circles open so far.
  choose(player) {
    const rankable = (id) => rankOf(player, id) < RankRules.max;
    if (this.tier) {
      const onBar = player.bar.filter((id, i) => id && i < player.slotLimit && rankable(id));
      if (rankable('missile')) {
        onBar.push('missile');
      }
      if (onBar.length) {
        return pick(onBar);
      }
    }
    const pool = scrollPool(this.game.depth);
    const useful = (id) => id === 'missile' ? rankable(id) : (!player.knowsSpell(id) || rankable(id));
    const id = rankable('missile') && Math.random() < MISSILE_SCROLL_CHANCE ? 'missile' : pick(pool);
    if (useful(id)) {
      return id;
    }
    const left = [...pool, 'missile'].filter(useful);
    return left.length ? pick(left) : null;
  }

  pickUp(player) {
    const id = this.choose(player);
    let message;
    if (!id) {
      player.manergy = player.maxManergy;
      message = 'NOTHING NEW IN IT :: MANERGY RESTORED';
    } else {
      message = studySpell(player, id);
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
    // in a duel trial the duel's potions (duelLoot.js), which either wizard can drink
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

// A piece of gear on the floor (gear.js): it goes into the inventory, and
// straight on if its slot is free. With the bag full, or when the wizard
// just dropped it, it waits until the wizard has stepped off it.
export class GearItem extends Item {
  defaults() {
    super.defaults();
    this.item = null;
    this.life = 45 * 60;
    this.waitClear = false;
  }

  init() {
    this.view = buildGearLoot(this.item.type, Rarities[this.item.type.rarity].glow);
    this.game.gfx.add(this.view);
  }

  update(k) {
    const player = this.game.player;
    if (this.waitClear && player && this.touches(player)) {
      return;
    }
    this.waitClear = false;
    super.update(k);
  }

  pickUp(player) {
    const inventory = player.inventory || outfit(player, []);
    const type = this.item.type;
    const rarity = Rarities[type.rarity];
    if (!inventory.add(this.item)) {
      this.waitClear = true;
      this.game.hud.toast('BAG FULL :: ' + type.name, '#ff8a70');
      return;
    }
    const worn = inventory.worn().includes(this.item);
    this.game.pickupFx(this, rarity.glow);
    this.game.hud.toast((worn ? 'EQUIPPED :: ' : 'FOUND :: ') + type.name, rarity.color);
    this.kill();
  }
}

// The 2D game's ring loot: one of its five rings, preferring one the player
// has not got yet.
export class Ring extends GearItem {
  defaults() {
    super.defaults();
    this.life = 25 * 60;
  }

  init() {
    const owned = new Set((this.game.player && this.game.player.inventory ? this.game.player.inventory.all() : []).map((i) => i.type.id));
    const missing = ClassicRings.filter((id) => !owned.has(id));
    const pool = missing.length > 0 ? missing : ClassicRings;
    this.item = makeItem(pool[Math.floor(Math.random() * pool.length)]);
    super.init();
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
