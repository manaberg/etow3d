import { Scroll, Potion } from './items.js';
import { SpellBook } from './mage.js';
import { DuelRules } from './duelRules.js';
import { TILE } from '../core/constants.js';

// Progressive duels: both wizards start with magic missile and one random
// spell, and scrolls and potions keep appearing in the arena. Whoever touches
// a scroll learns a spell they lack; potions heal or restore manergy. Classic
// duels (everything known from the start) skip all of this.

// The duel spell book: the rival's spell id, the player's spellbook flag and
// the tier 2 flag that comes with it (duels are fought with tier 2 spells).
export const DuelSpells = [
  { id: 'fireball', flag: 'hasFireball', tier: 'hasFb2' },
  { id: 'lightning', flag: 'hasLightning', tier: 'hasLg2' },
  { id: 'ironshot', flag: 'hasIronshot', tier: 'hasIs2' },
  { id: 'blink', flag: 'hasBlink', tier: 'hasBk2' },
  { id: 'timestop', flag: 'hasTimestop' },
  { id: 'shield', flag: 'hasShield' },
  { id: 'haste', flag: 'hasHaste' },
  { id: 'root', flag: 'hasStun' },
  { id: 'image', flag: 'hasImage' },
  { id: 'blizzard', flag: 'hasBlizzard', tier: 'hasBz2' },
  { id: 'ray', flag: 'hasRay' },
  { id: 'invis', flag: 'hasInvis' },
  { id: 'fear', flag: 'hasFear' },
  { id: 'pwkill', flag: 'hasPwkill', tier: 'hasPwk2' }
];

function spellName(entry) {
  const spell = SpellBook.find((s) => s.flag === entry.flag);
  return spell ? spell.name : entry.id.toUpperCase();
}

function pick(list) {
  return list[Math.floor(Math.random() * list.length)];
}

export class DuelLoot {
  constructor(game) {
    this.game = game;
    const p = DuelRules.progressive;
    this.scrollTimer = p.firstScroll;
    this.potionTimer = p.firstPotion;
  }

  // Strip both duelists down to magic missile plus one random spell each.
  setup(player, rival) {
    for (const entry of DuelSpells) {
      player[entry.flag] = false;
      if (entry.tier) {
        player[entry.tier] = false;
      }
    }
    player.hasTele = false;
    rival.known = new Set();
    this.learn(player, pick(DuelSpells), true);
    this.learn(rival, pick(DuelSpells), true);
  }

  knows(duelist, entry) {
    return duelist === this.game.player ? !!duelist[entry.flag] : duelist.known.has(entry.id);
  }

  missing(duelist) {
    return DuelSpells.filter((entry) => !this.knows(duelist, entry));
  }

  learn(duelist, entry, quiet) {
    const hud = this.game.hud;
    if (duelist === this.game.player) {
      duelist[entry.flag] = true;
      if (entry.tier) {
        duelist[entry.tier] = true;
      }
      hud.toast((quiet ? 'YOUR STARTING SPELL :: ' : 'LEARNED :: ') + spellName(entry), '#f3e6c4');
    } else {
      duelist.known.add(entry.id);
      hud.toast((quiet ? 'RIVAL STARTS WITH :: ' : 'RIVAL LEARNED :: ') + spellName(entry), '#ff7070');
    }
  }

  // A duelist touched a scroll: learn a spell they lack (or recover manergy
  // when they already know everything).
  takeScroll(duelist) {
    const missing = this.missing(duelist);
    if (missing.length) {
      this.learn(duelist, pick(missing));
    } else {
      duelist.manergy = Math.min(duelist.maxManergy, duelist.manergy + DuelRules.progressive.blueManergy);
    }
  }

  takePotion(duelist, blue) {
    const p = DuelRules.progressive;
    const mine = duelist === this.game.player;
    if (blue) {
      duelist.manergy = Math.min(duelist.maxManergy, duelist.manergy + p.blueManergy);
      if (mine) {
        this.game.hud.toast('MANERGY POTION :: +' + p.blueManergy + ' MANERGY', '#6aa8ff');
      }
    } else {
      duelist.hp = Math.min(DuelRules.hp, duelist.hp + p.redHeal);
      if (mine) {
        this.game.hud.toast('HEALTH POTION :: +' + p.redHeal + ' HP', '#ff6a70');
      } else {
        this.game.hud.toast('RIVAL DRANK A HEALTH POTION', '#ff7070');
      }
    }
  }

  // Called once per simulation step.
  update() {
    const p = DuelRules.progressive;
    const loot = this.game.entities.filter((e) => e.isLoot && !e.killed);
    const scrolls = loot.filter((e) => e instanceof Scroll).length;
    const potions = loot.length - scrolls;
    this.scrollTimer--;
    this.potionTimer--;
    if (this.scrollTimer <= 0) {
      this.scrollTimer = p.scrollEvery;
      // stop dealing scrolls once both duelists know everything
      const rival = this.game.rival;
      const needed = this.missing(this.game.player).length + (rival ? this.missing(rival).length : 0);
      if (scrolls < p.maxScrolls && needed > 0) {
        this.drop(Scroll);
      }
    }
    if (this.potionTimer <= 0) {
      this.potionTimer = p.potionEvery;
      if (potions < p.maxPotions) {
        this.drop(Potion);
      }
    }
  }

  // In a random room, away from its walls and from both duelists.
  drop(Kind) {
    const game = this.game;
    const world = game.world;
    const duelists = [game.player, game.rival].filter((d) => d && !d.killed);
    let spot = null;
    for (let attempt = 0; attempt < 25; attempt++) {
      const s = world.getRoomSpawnPoint(pick(world.rooms), 3);
      const cx = s.x + 24;
      const cy = s.y + 24;
      const clear = duelists.every((d) => Math.hypot(d.center().x - cx, d.center().y - cy) > 4 * TILE + 60);
      spot = s;
      if (clear) {
        break;
      }
    }
    const item = game.spawn(Kind, spot.x, spot.y, { persistent: true });
    const c = item.center();
    game.fx.column(c.x, c.y, 30, { color: Kind === Scroll ? [0xfff0c0, 0xffd040] : [0xff6070, 0x6aa8ff], count: 24, rise: 2.5, life: 0.8, size: 0.7 });
    return item;
  }
}
