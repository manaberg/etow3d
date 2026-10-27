import { DuelWizard } from './duelWizard.js';
import { SpellById } from './mage.js';
import { DuelSpells } from './duelLoot.js';
import { scrollPool } from './items.js';
import { MAX_MISSILE_TIER } from './spells.js';
import { RankRules, ROMAN, rankOf } from './spellbar.js';
import { Trials } from '../world/levels.js';
import { randInt } from '../core/constants.js';

// The reflection the trials are fought against (levels.js Trials): a wizard
// of the player's level with the player's health, manergy, regeneration,
// speed, armour and magic missile darts, and as many spells as the player has
// on the bar, but its own: drawn at random from the spell pool, at the ranks
// of the player's spells. It keeps the Red Order's crimson kit so the two
// wizards can be told apart.
export function spawnReflection(game, x, y, player) {
  const rival = game.spawn(DuelWizard, x, y, { difficulty: Trials.difficulty(game.depth), label: 'REFLECTION' });
  const ranks = player.bar.slice(0, player.slotLimit).filter(Boolean).map((id) => rankOf(player, id));
  const pool = DuelSpells.slice();
  rival.known = new Set();
  rival.ranks = {};
  while (rival.known.size < ranks.length && pool.length) {
    const entry = pool.splice(randInt(0, pool.length - 1), 1)[0];
    rival.ranks[entry.id] = ranks[rival.known.size];
    rival.known.add(entry.id);
  }
  rival.missileTier = player.missileTier;
  rival.level = player.level;
  rival.hp = rival.maxHp = player.maxHp;
  rival.manergy = rival.maxManergy = player.maxManergy;
  rival.manergyRegen = 0.4 * (1 + player.bonus('regen'));
  rival.desiredVel = player.desiredVel * (1 + player.bonus('speed'));
  rival.gearStats = { ...rival.gearStats, armor: player.bonus('armor') };
  return rival;
}

// After a won trial the wizard takes one of `count` spoils: a spell it lacks,
// another magic missile dart or a rank for a spell it knows, one of them a
// rank whenever there is one to take. Spoils are spell ids ('missile' for the
// dart), read like a scroll (items.js studySpell).
export function rollSpoils(player, _depth, count = 3) {
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

export function spoilName(player, id) {
  if (id === 'missile') {
    return 'MAGIC MISSILE :: ' + (player.missileTier + 1) + ' DARTS';
  }
  const name = SpellById[id].name;
  return player.knowsSpell(id) ? name + ' :: RANK ' + ROMAN[rankOf(player, id) + 1] : name;
}
