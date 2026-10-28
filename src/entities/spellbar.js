// The spell bar, wizard levels, spell circles and spell ranks.
//
// Every spell a wizard learns goes into its spellbook; only the spells it has
// prepared on the bar can be cast. Magic missile has a key of its own and is
// never on the bar. The bar's slots open with the wizard's level. This module
// holds the numbers and rules; the player's side lives in mage.js, the
// rival's in duelWizard.js.

// The bar's slots, nearest to WASD first. `action` is the binding
// (core/bindings.js: Q, E, F, R, 2, 4, 1, 3, C, 5 by default) and `level`
// the wizard level that opens it.
export const BarSlots = [
  { action: 'slot1', level: 1 },
  { action: 'slot2', level: 1 },
  { action: 'slot3', level: 1 },
  { action: 'slot4', level: 2 },
  { action: 'slot5', level: 4 },
  { action: 'slot6', level: 6 },
  { action: 'slot7', level: 8 },
  { action: 'slot8', level: 10 },
  { action: 'slot9', level: 12 },
  { action: 'slot10', level: 15 }
];

// Where a newly learned spell goes, by slot index: spells cast often (a
// cooldown of `quickCooldown` frames or less) to the bar in order, Q first;
// the rest to the number row once it opens, and before that from Q too. The
// first free open slot in the order wins.
const PLACEMENT = {
  quick: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
  slow: [5, 6, 7, 8, 9, 0, 1, 2, 3, 4]
};

export function placementOrder(id, cooldown) {
  return cooldown <= WizardLevels.quickCooldown ? PLACEMENT.quick : PLACEMENT.slow;
}

// Wizard levels. Every kill gives experience (`xpFor`), and each level
// adds a little health and manergy and may open a slot (BarSlots). The
// totals are tuned so that slaying about 60% of every floor reaches level
// 10 on the warlord's floor and 15 on the last one.
export const WizardLevels = {
  max: 15,
  // total experience needed for each level (index = level)
  xp: [0, 0, 150, 380, 720, 1200, 1800, 2600, 3500, 4500, 5800, 7800, 11000, 15000, 20500, 27000],
  hp: 6,
  manergy: 4,
  quickCooldown: 400,
  // a spell put on the bar from the spellbook waits its own cooldown, and at
  // least this many frames, before it can be cast
  prepareFrames: 180,

  // the square root of the foe's health, so a cleric is worth about nine grunts
  xpFor(enemy) {
    return Math.round(Math.sqrt(Math.max(0, enemy.maxHp || 0)));
  },

  slotsAt(level) {
    return BarSlots.filter((s) => s.level <= level).length;
  }
};

// Spell ranks I to III. A scroll for a spell its reader already knows ranks
// the spell up. Magic missile's ranks are its darts (spells.js MissileTiers)
// and six spells have their own rank II (the tier 2 upgrades, `tierFlags`).
// Every other spell's rank II adds `power` to its main number (damage,
// duration, radius, healing or ward), except those in `quickAtTwo`, which have no
// number to grow and cast faster instead. Rank III cuts every spell's
// cooldown by `cooldownCut`.
export const RankRules = {
  max: 3,
  power: 0.3,
  cooldownCut: 0.25,
  tierFlags: { fireball: 'hasFb2', lightning: 'hasLg2', ironshot: 'hasIs2', blink: 'hasBk2', blizzard: 'hasBz2', pwkill: 'hasPwk2' },
  // the rival names chain root 'root'
  quickAtTwo: ['stun', 'root', 'image', 'tele', 'swap']
};

export const ROMAN = ['', 'I', 'II', 'III'];

// The global cooldown: every spell but magic missile holds back all the
// others (magic missile aside) for this many frames, in every mode, for the
// mage and the wizards alike; each spell's own cooldown runs as well.
export const GLOBAL_COOLDOWN = 60;

export function rankOf(caster, id) {
  if (id === 'missile') {
    return (caster && caster.missileTier) || 1;
  }
  return (caster && caster.ranks && caster.ranks[id]) || 1;
}

// Multiplier on a spell's main number.
export function rankPower(caster, id) {
  if (!caster || id === 'missile' || RankRules.tierFlags[id] || RankRules.quickAtTwo.includes(id)) {
    return 1;
  }
  return rankOf(caster, id) >= 2 ? 1 + RankRules.power : 1;
}

// Multiplier on a spell's cooldown.
export function rankCooldown(caster, id) {
  if (!caster || id === 'missile') {
    return 1;
  }
  const rank = rankOf(caster, id);
  let m = rank >= 3 ? 1 - RankRules.cooldownCut : 1;
  if (rank >= 2 && RankRules.quickAtTwo.includes(id)) {
    m *= 1 - RankRules.cooldownCut;
  }
  return m;
}
