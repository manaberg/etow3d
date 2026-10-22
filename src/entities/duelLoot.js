import { Scroll, Potion } from './items.js';
import { SpellBook } from './mage.js';
import { DuelRules } from './duelRules.js';
import { TILE } from '../core/constants.js';
import { MAX_MISSILE_TIER } from './spells.js';
import { BarSlots, WizardLevels, RankRules, ROMAN } from './spellbar.js';
import { actionKeyLabel } from '../core/bindings.js';

// Progressive duels: both wizards start with a one-dart magic missile and one
// random spell, and scrolls and potions keep appearing in the arena. Whoever
// touches a scroll learns a spell they lack or adds a dart to their magic
// missile, until their six bar slots (WizardLevels.duelSlots) are full; after
// that scrolls rank up a spell they have (spellbar.js). Potions heal or
// restore manergy. Classic duels (everything known from the start) skip all
// of this.

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
  { id: 'pwkill', flag: 'hasPwkill', tier: 'hasPwk2' },
  // the D&D spells (arcana.js)
  { id: 'scorch', flag: 'hasScorch' },
  { id: 'cone', flag: 'hasCone' },
  { id: 'thunder', flag: 'hasThunder' },
  { id: 'meteor', flag: 'hasMeteor' },
  { id: 'guardians', flag: 'hasGuardians' },
  { id: 'cloud', flag: 'hasCloud' },
  { id: 'heal', flag: 'hasHeal' },
  { id: 'polymorph', flag: 'hasPolymorph' },
  { id: 'disintegrate', flag: 'hasDisintegrate' },
  { id: 'weapon', flag: 'hasWeapon' }
];

// A scroll's other gift: one more magic missile dart (spells.js MissileTiers).
export const MissileUpgrade = { id: 'missile', name: 'MAGIC MISSILE' };

function spellName(entry) {
  const spell = SpellBook.find((s) => s.flag === entry.flag);
  return spell ? spell.name : entry.id.toUpperCase();
}

// The player's id for a duel spell (the rival calls chain root 'root').
export function playerSpellId(entry) {
  const spell = SpellBook.find((s) => s.flag === entry.flag);
  return spell ? spell.id : entry.id;
}

// Duels are fought with the tier 2 spells, so those start at rank II.
export function startRank(entry) {
  return entry.tier ? 2 : 1;
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
    player.resetSpells([], { slots: WizardLevels.duelSlots });
    player.missileTier = 1;
    rival.missileTier = 1;
    rival.known = new Set();
    rival.ranks = {};
    this.learn(player, pick(DuelSpells), true);
    this.learn(rival, pick(DuelSpells), true);
  }

  knows(duelist, entry) {
    if (entry === MissileUpgrade) {
      return duelist.missileTier >= MAX_MISSILE_TIER;
    }
    return duelist === this.game.player ? !!duelist[entry.flag] : duelist.known.has(entry.id);
  }

  rank(duelist, entry) {
    if (duelist === this.game.player) {
      return duelist.ranks[playerSpellId(entry)] || startRank(entry);
    }
    return duelist.ranks[entry.id] || startRank(entry);
  }

  // Every bar slot holds a spell (the rival's six are the spells it knows).
  full(duelist) {
    if (duelist === this.game.player) {
      return duelist.bar.slice(0, duelist.slotLimit).every(Boolean);
    }
    return duelist.known.size >= WizardLevels.duelSlots;
  }

  // What a scroll could give: a spell they lack (or a dart) while the bar has
  // room, then a rank for a spell they have (or a dart).
  options(duelist) {
    const dart = duelist.missileTier < MAX_MISSILE_TIER ? [MissileUpgrade] : [];
    if (!this.full(duelist)) {
      return [...DuelSpells.filter((entry) => !this.knows(duelist, entry)), ...dart];
    }
    return [...DuelSpells.filter((entry) => this.knows(duelist, entry) && this.rank(duelist, entry) < RankRules.max), ...dart];
  }

  // A known spell one rank up.
  rankUp(duelist, entry) {
    const mine = duelist === this.game.player;
    let rank;
    if (mine) {
      const id = playerSpellId(entry);
      duelist.ranks[id] = this.rank(duelist, entry);
      rank = duelist.rankUp(id);
    } else {
      rank = duelist.ranks[entry.id] = Math.min(RankRules.max, this.rank(duelist, entry) + 1);
    }
    const text = spellName(entry) + ' :: RANK ' + ROMAN[rank];
    this.game.hud.toast(mine ? text : 'RIVAL\'S ' + text, mine ? '#f3e6c4' : '#ff7070');
  }

  learn(duelist, entry, quiet) {
    const hud = this.game.hud;
    if (entry === MissileUpgrade) {
      duelist.missileTier++;
      const darts = MissileUpgrade.name + ' :: ' + duelist.missileTier + ' DARTS';
      hud.toast(duelist === this.game.player ? darts : 'RIVAL\'S ' + darts, duelist === this.game.player ? '#f3e6c4' : '#ff7070');
      return;
    }
    if (duelist === this.game.player) {
      const slot = duelist.learnSpell(playerSpellId(entry), startRank(entry));
      const where = slot >= 0 ? ' :: ON ' + actionKeyLabel(BarSlots[slot].action) : '';
      hud.toast((quiet ? 'YOUR STARTING SPELL :: ' : 'LEARNED :: ') + spellName(entry) + where, '#f3e6c4');
    } else {
      duelist.known.add(entry.id);
      duelist.ranks[entry.id] = startRank(entry);
      hud.toast((quiet ? 'RIVAL STARTS WITH :: ' : 'RIVAL LEARNED :: ') + spellName(entry), '#ff7070');
    }
  }

  // A duelist touched a scroll: learn a spell, add a dart or rank a spell up
  // (or recover manergy when there is nothing left).
  takeScroll(duelist) {
    const options = this.options(duelist);
    if (!options.length) {
      duelist.manergy = Math.min(duelist.maxManergy, duelist.manergy + DuelRules.progressive.blueManergy);
      return;
    }
    const entry = pick(options);
    if (entry !== MissileUpgrade && this.knows(duelist, entry)) {
      this.rankUp(duelist, entry);
    } else {
      this.learn(duelist, entry);
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
      duelist.hp = Math.min(duelist.maxHp, duelist.hp + p.redHeal);
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
      const needed = this.options(this.game.player).length + (rival ? this.options(rival).length : 0);
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
