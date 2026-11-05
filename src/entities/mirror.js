import { DuelWizard } from './duelWizard.js';
import { SpellById } from './mage.js';
import { DuelSpells, playerSpellId } from './duelLoot.js';
import { scrollPool } from './items.js';
import { MAX_MISSILE_TIER } from './spells.js';
import { MANERGY_REGEN, RankRules, ROMAN, rankOf } from './spellbar.js';
import { randInt } from '../core/constants.js';

// The rival wizard of the duels and the battle: the player's level, health,
// manergy, regeneration, speed, armour and magic missile darts, and `count`
// spells of its own, drawn at random from the duel spell book (duelLoot.js),
// at rank I. It keeps the Red Order's crimson kit so the two wizards can be
// told apart. `difficulty` sets its brain (DuelRules.difficulties).
export function spawnRival(game, x, y, player, { count, difficulty, label }) {
  const rival = game.spawn(DuelWizard, x, y, { difficulty, label });
  const pool = DuelSpells.slice();
  rival.known = new Set();
  rival.ranks = {};
  while (rival.known.size < count && pool.length) {
    const entry = pool.splice(randInt(0, pool.length - 1), 1)[0];
    rival.ranks[entry.id] = 1;
    rival.known.add(entry.id);
  }
  rival.missileTier = player.missileTier;
  rival.level = player.level;
  rival.hp = rival.maxHp = player.maxHp;
  rival.manergy = rival.maxManergy = player.maxManergy;
  rival.manergyRegen = MANERGY_REGEN * (1 + player.bonus('regen'));
  rival.desiredVel = player.desiredVel * (1 + player.bonus('speed'));
  rival.gearStats = { ...rival.gearStats, armor: player.bonus('armor') };
  return rival;
}

// `count` different spells from the duel spell book, as the player's ids.
export function randomDuelSpells(count) {
  const pool = DuelSpells.slice();
  const out = [];
  while (out.length < count && pool.length) {
    out.push(playerSpellId(pool.splice(randInt(0, pool.length - 1), 1)[0]));
  }
  return out;
}

// The names of a rival's spells, as the player knows them.
export function rivalSpellNames(rival) {
  return [...(rival.known || [])].map((id) => {
    const entry = DuelSpells.find((e) => e.id === id);
    const spell = SpellById[entry ? playerSpellId(entry) : id];
    return spell ? spell.name : id.toUpperCase();
  });
}

// `count` things for the wizard to learn: a spell it lacks, another magic
// missile dart or a rank for a spell it knows, one of them a rank whenever
// there is one to take (rollLevelPicks builds on it). Spell ids ('missile'
// for the dart), read like a scroll (items.js studySpell).
export function rollSpoils(player, count = 3) {
  const learn = scrollPool().filter((id) => !player.knowsSpell(id));
  if (player.missileTier < MAX_MISSILE_TIER) {
    learn.push('missile');
  }
  const rank = player.learnOrder.filter((id) => player.knowsSpell(id) && rankOf(player, id) < RankRules.max);
  const take = (list) => list.splice(randInt(0, list.length - 1), 1)[0];
  const spoils = [];
  if (rank.length) {
    spoils.push(take(rank));
  }
  while (spoils.length < count && (learn.length || rank.length)) {
    spoils.push(take(learn.length ? learn : rank));
  }
  // the rank goes last
  const ranked = (id) => id !== 'missile' && player.knowsSpell(id);
  return spoils.sort((a, b) => ranked(a) - ranked(b));
}

// The spells that are there to deal damage (README: Damage spells).
export const DamageSpells = ['fireball', 'lightning', 'ironshot', 'scorch', 'cone', 'thunder', 'ray', 'disintegrate', 'meteor', 'pwkill'];

// What a new level offers (Game.offerLevelPick): `count` choices as
// rollSpoils gives (a rank among them, last, whenever there is one to take), the first
// of them, while there is one, a damage spell the wizard does not know yet.
export function rollLevelPicks(player, count = 3) {
  const fresh = DamageSpells.filter((id) => !player.knowsSpell(id));
  const picks = fresh.length ? [fresh[randInt(0, fresh.length - 1)]] : [];
  for (const id of rollSpoils(player, count)) {
    if (!picks.includes(id)) {
      picks.push(id);
    }
  }
  while (picks.length > count) {
    picks.splice(picks.length - 2, 1);
  }
  return picks;
}

export function spoilName(player, id) {
  if (id === 'missile') {
    return 'MAGIC MISSILE :: ' + (player.missileTier + 1) + ' DARTS';
  }
  const name = SpellById[id].name;
  return player.knowsSpell(id) ? name + ' :: RANK ' + ROMAN[rankOf(player, id) + 1] : name;
}
