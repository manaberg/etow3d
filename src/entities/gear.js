// Wearable gear: hats, robes, staffs and rings with properties, carried in an
// inventory by the player and by the NPCs (the duel rival, orc champions and
// casters, the orc mini-bosses). Whatever a body wears shows on its model
// (render/gearModels.js) and adds its properties to the wearer's stats.
//
// An item is { uid, type }. Loot is rolled the way Diablo rolls it: a base
// (a kind of hat, robe, staff or ring, finer the deeper it is found) with
// random affixes by rarity: none for common gear, a prefix and/or a suffix
// for magic gear (BLAZING CONJURER'S HAT OF THE FOX), three to five for rare
// gear under a random name (GLOOM VISAGE). Set pieces and uniques (Gear
// below) are fixed, named items; a set's pieces worn together add the set's
// bonuses. A rolled item's `type` is made for it alone; fixed items share
// theirs.
//
// Besides the wizard's general properties, gear can be made for one spell
// (SpellStats below): more of its damage or duration, a shorter cooldown,
// a smaller cost. Rolled gear finds those for the spells its finder knows
// more often than for the others.

import { SpellBook, SpellById } from './spellList.js';

export const Slots = [
  { id: 'hat', kind: 'hat', label: 'HAT' },
  { id: 'robe', kind: 'robe', label: 'ROBE' },
  { id: 'staff', kind: 'staff', label: 'STAFF' },
  { id: 'ring1', kind: 'ring', label: 'LEFT RING' },
  { id: 'ring2', kind: 'ring', label: 'RIGHT RING' }
];

const KINDS = ['hat', 'robe', 'staff', 'ring'];

export const BAG_SIZE = 20;

// `tier` orders the rarities (minimum rarities, how brightly a find rings);
// `weight` is how common the rarity is on the first floor and `grow` how
// much deeper floors favour it (rollRarity; plain gear grows rarer).
export const Rarities = {
  common: { label: 'COMMON', color: '#d8d0c0', glow: 0xe8e0d0, weight: 50, tier: 0, grow: 0 },
  magic: { label: 'MAGIC', color: '#6a9cff', glow: 0x4a80ff, weight: 30, tier: 1, grow: 0.5 },
  rare: { label: 'RARE', color: '#ffe060', glow: 0xffd030, weight: 8, tier: 2, grow: 2 },
  set: { label: 'SET', color: '#4ee060', glow: 0x30ff50, weight: 2, tier: 3, grow: 2.7 },
  legendary: { label: 'UNIQUE', color: '#ff9a3a', glow: 0xff7020, weight: 3.2, tier: 3, grow: 2.7 }
};
const RARITY_ORDER = Object.keys(Rarities);

// What a property does, and how the inventory shows it. Fractions are shown
// as percentages; `invert` shows them negated (armour as less damage taken).
// `good` is the sign of a value that helps the wearer.
export const Stats = {
  maxHp: { label: 'MAX HP', good: 1 },
  maxManergy: { label: 'MAX MANERGY', good: 1 },
  regen: { label: 'MANERGY REGEN', pct: true, good: 1 },
  speed: { label: 'MOVE SPEED', pct: true, good: 1 },
  armor: { label: 'DAMAGE TAKEN', pct: true, good: 1, invert: true },
  cooldown: { label: 'SPELL COOLDOWNS', pct: true, good: 1, invert: true },
  costCut: { label: 'SPELL COSTS', pct: true, good: 1, invert: true },
  spellDamage: { label: 'SPELL DAMAGE', pct: true, good: 1 },
  fireDamage: { label: 'FIRE DAMAGE', pct: true, good: 1 },
  coldDamage: { label: 'COLD DAMAGE', pct: true, good: 1 },
  lightningDamage: { label: 'LIGHTNING DAMAGE', pct: true, good: 1 },
  poisonDamage: { label: 'POISON DAMAGE', pct: true, good: 1 },
  necroticDamage: { label: 'NECROTIC DAMAGE', pct: true, good: 1 },
  radiantDamage: { label: 'RADIANT DAMAGE', pct: true, good: 1 },
  forceDamage: { label: 'FORCE DAMAGE', pct: true, good: 1 },
  psychicDamage: { label: 'PSYCHIC DAMAGE', pct: true, good: 1 },
  ironDamage: { label: 'IRON DAMAGE', pct: true, good: 1 },
  missileDamage: { label: 'MISSILE DAMAGE', good: 1 },
  fireballCost: { label: 'FIREBALL COST', good: -1 },
  lightningCost: { label: 'LIGHTNING COST', good: -1 },
  leech: { label: 'LIFESTEAL HEAL', good: 1 },
  mend: { label: 'HP REGEN / S', good: 1 },
  ward: { label: 'SHIELD DURATION', pct: true, good: 1 },
  killHeal: { label: 'HP PER KILL', good: 1 },
  killManergy: { label: 'MANERGY PER KILL', good: 1 },
  xpGain: { label: 'EXPERIENCE', pct: true, good: 1 },
  potionPower: { label: 'POTION POTENCY', pct: true, good: 1 },
  magicFind: { label: 'BETTER ITEMS FOUND', pct: true, good: 1 },
  steadfast: { label: 'TIME ROOTED, FEARED OR A SHEEP', pct: true, good: 1, invert: true }
};

// Gear made for one spell: 'power.<spell>' adds to its main number (what
// its rank II grows: damage, duration, reach, healing; spellbar.js
// rankPower), 'cd.<spell>' shortens its cooldown and 'cost.<spell>' cuts
// what it spends. Only spells with a number to grow take power (magic
// missile has its own MISSILE DAMAGE), and only spells with a cooldown
// take a shorter one.
const TIER_DAMAGE = ['fireball', 'lightning', 'ironshot', 'blizzard', 'pwkill'];
const POWER_WORDS = { sleep: 'POTENCY' };
export const SpellStats = {
  power: SpellBook.filter((s) => s.grows || TIER_DAMAGE.includes(s.id)).map((s) => s.id),
  cd: SpellBook.filter((s) => s.id !== 'missile' && s.cd > 0).map((s) => s.id),
  cost: SpellBook.filter((s) => s.id !== 'missile').map((s) => s.id)
};
for (const id of SpellStats.power) {
  const spell = SpellById[id];
  Stats['power.' + id] = { label: spell.name + ' ' + (POWER_WORDS[id] || spell.grows || 'DAMAGE'), pct: true, good: 1, spell: id };
}
for (const id of SpellStats.cd) {
  Stats['cd.' + id] = { label: SpellById[id].name + ' COOLDOWN', pct: true, good: 1, invert: true, spell: id };
}
for (const id of SpellStats.cost) {
  Stats['cost.' + id] = { label: SpellById[id].name + ' COST', pct: true, good: 1, invert: true, spell: id };
}

// Ceilings so stacked gear cannot make a wizard untouchable or spells free;
// gear for one spell is capped by its kind (SpellCaps).
export const StatCaps = { armor: 0.6, cooldown: 0.4, costCut: 0.5, steadfast: 0.6, speed: 0.6, fireballCost: -15, lightningCost: -20 };
const SpellCaps = { power: 1, cd: 0.5, cost: 0.6 };

// A property's value within its ceiling.
export function capStat(key, value) {
  let cap = StatCaps[key];
  if (cap === undefined) {
    const dot = key.indexOf('.');
    cap = dot > 0 ? SpellCaps[key.slice(0, dot)] : undefined;
  }
  if (cap === undefined) {
    return value;
  }
  return cap < 0 ? Math.max(cap, value) : Math.min(cap, value);
}

// The spell a property is made for, or null.
export function statSpell(key) {
  return (Stats[key] && Stats[key].spell) || null;
}

// The property that strengthens hits of each element (enemy.js Elements);
// spellDamage strengthens them all.
export const ElementStats = {
  fire: 'fireDamage', cold: 'coldDamage', lightning: 'lightningDamage', thunder: 'lightningDamage',
  poison: 'poisonDamage', necrotic: 'necroticDamage', radiant: 'radiantDamage', force: 'forceDamage', physical: 'ironDamage',
  psychic: 'psychicDamage'
};

// Colours an affix lends a rolled item's look (gem, band, trim), by property.
const TINTS = {
  fireDamage: 0xff5020, coldDamage: 0x9ad8ff, lightningDamage: 0xa0e8ff, poisonDamage: 0x80ff40,
  necroticDamage: 0xa040ff, radiantDamage: 0xffe080, forceDamage: 0xc070ff, ironDamage: 0xb0b4bc,
  spellDamage: 0xff60d0, maxManergy: 0x4080ff, regen: 0x40c0ff, maxHp: 0xff3050, mend: 0xff6080,
  leech: 0xc01030, killHeal: 0xd02040, killManergy: 0x6040ff, speed: 0xffe070, armor: 0xe8f0ff,
  ward: 0x60b0ff, steadfast: 0xd0c0a0, cooldown: 0x80fff0, costCut: 0x60e0c0, missileDamage: 0xc070ff,
  fireballCost: 0xff7030, lightningCost: 0xa0e8ff, xpGain: 0xffd040, potionPower: 0xff70a0, magicFind: 0xffc020,
  psychicDamage: 0xff80e0
};

// And the colour of each spell, for gear made for it.
const SPELL_TINTS = {
  fireball: 0xff5020, lightning: 0xa0e8ff, ironshot: 0xb0b4bc, blink: 0xc070ff, timestop: 0xffe8a0, haste: 0xffe070,
  image: 0xd0d0ff, stun: 0x40ff60, shield: 0x60b0ff, blizzard: 0x9ad8ff, ray: 0xff2040, invis: 0x9aa8c0, fear: 0x8a40ff,
  pwkill: 0xa040ff, tele: 0xc070ff, scorch: 0xff7030, cone: 0xbfe8ff, thunder: 0x80c8ff, meteor: 0xff6010,
  guardians: 0xffe080, cloud: 0x80ff40, heal: 0xff70a0, polymorph: 0xf8f0e0, disintegrate: 0x60ff60, weapon: 0xffe8a0,
  sleep: 0xb0a0ff, agathys: 0xe8f8ff, curse: 0xc040c0, sphere: 0xff8020, counter: 0x60e0ff, swap: 0xd080ff,
  phantasm: 0x60ffb0, confusion: 0xff80ff, maelstrom: 0x40a0ff, gravity: 0xc070ff
};

function tintOf(stat) {
  const spell = statSpell(stat);
  return spell ? SPELL_TINTS[spell] : TINTS[stat];
}

// ---------------------------------------------------------------- fixed gear

// Starting kits, the 2D game's rings, set pieces and uniques. `minLevel` is
// the shallowest floor a set piece or unique drops on.
export const Gear = {
  // the apprentice's kit, and the duel rival's red copy of it (same
  // properties, so duels stay even)
  pointed_hat: {
    slot: 'hat', name: 'POINTED HAT', rarity: 'common', stats: { maxManergy: 10 },
    text: 'Every apprentice gets one.', look: { style: 'pointed', color: 0x223c86, band: 0xd8c070 }
  },
  apprentice_robe: {
    slot: 'robe', name: 'APPRENTICE ROBE', rarity: 'common', stats: { maxHp: 10 },
    text: 'Blue wool, gold trim, many patches.', look: { robe: 0x2a4fa8, mantle: 0x223c86, trim: 0xd8c070 }
  },
  oak_staff: {
    slot: 'staff', name: 'OAK STAFF', rarity: 'common', stats: { missileDamage: 5 },
    text: 'A straight branch and a glass bead.', look: { style: 'orb', wood: 0x5a3a20, gem: 0x9fd8ff }
  },
  crimson_hat: {
    slot: 'hat', name: 'CRIMSON HAT', rarity: 'common', stats: { maxManergy: 10 },
    text: 'Worn by the Red Order\'s duellists.', look: { style: 'pointed', color: 0x3a0c0c, band: 0xb0b0b0 }
  },
  crimson_robe: {
    slot: 'robe', name: 'CRIMSON ROBE', rarity: 'common', stats: { maxHp: 10 },
    text: 'Dyed in the colours of the Red Order.', look: { robe: 0x8a1a1a, mantle: 0x2a0a0a, trim: 0xb0b0b0 }
  },
  blood_staff: {
    slot: 'staff', name: 'BLOODWOOD STAFF', rarity: 'common', stats: { missileDamage: 5 },
    text: 'The Red Order cuts them from one grove.', look: { style: 'orb', wood: 0x3a1410, gem: 0xff5040 }
  },

  // the 2D game's five rings (Ring loot hands these out)
  ring_speed: { slot: 'ring', name: 'RING OF SPEED', rarity: 'magic', stats: { speed: 0.2 }, text: 'Faster movement.', look: { band: 0xffc840, gem: 0xffe070 } },
  ring_manergy: { slot: 'ring', name: 'RING OF MANERGY', rarity: 'magic', stats: { regen: 0.25 }, text: 'Faster manergy regen.', look: { band: 0xffc840, gem: 0x4080ff } },
  ring_fire: { slot: 'ring', name: 'RING OF FIRE', rarity: 'magic', stats: { fireballCost: -10 }, text: 'Cheaper fireballs.', look: { band: 0xffc840, gem: 0xff5020 } },
  ring_storms: { slot: 'ring', name: 'RING OF STORMS', rarity: 'magic', stats: { lightningCost: -10 }, text: 'Cheaper lightning.', look: { band: 0xc8d0e0, gem: 0xa0e8ff } },
  ring_force: { slot: 'ring', name: 'RING OF FORCE', rarity: 'magic', stats: { missileDamage: 25 }, text: 'Stronger missiles.', look: { band: 0xffc840, gem: 0xc070ff } },

  // ------------------------------------------------------------ sets
  wanderer_hat: {
    slot: 'hat', name: 'WANDERER\'S HAT', rarity: 'set', set: 'wanderer', minLevel: 1, stats: { speed: 0.06, magicFind: 0.1 },
    text: 'Broad brimmed and road worn.', look: { style: 'wide', color: 0x5a4a32, band: 0x8a2a1a }
  },
  wanderer_cloak: {
    slot: 'robe', name: 'WANDERER\'S CLOAK', rarity: 'set', set: 'wanderer', minLevel: 1, stats: { speed: 0.05, maxHp: 12 },
    text: 'Grey, light, and patched at every elbow.', look: { robe: 0x6a6a70, mantle: 0x4a4a50, trim: 0x9a8a6a, cape: 0x5a4a32 }
  },
  wanderer_ring: {
    slot: 'ring', name: 'WANDERER\'S LUCKY PENNY', rarity: 'set', set: 'wanderer', minLevel: 1, stats: { potionPower: 0.2, xpGain: 0.05 },
    text: 'A coin bent into a ring, for luck on the road.', look: { band: 0xc07040, gem: 0xffd040 }
  },

  embercaller_hood: {
    slot: 'hat', name: 'EMBERCALLER\'S HOOD', rarity: 'set', set: 'embercaller', minLevel: 3, stats: { fireDamage: 0.12, maxManergy: 10 },
    text: 'The ash on it never cools.', look: { style: 'hood', color: 0x3a1208, band: 0xff8a20, glow: 0xff6010 }
  },
  embercaller_robe: {
    slot: 'robe', name: 'EMBERCALLER\'S ROBE', rarity: 'set', set: 'embercaller', minLevel: 3, stats: { fireballCost: -5, maxHp: 20 },
    text: 'Its hem smoulders but never burns.', look: { robe: 0x8a2a0a, mantle: 0x3a1208, trim: 0xff8a20, glow: 0xff6010 }
  },
  embercaller_brand: {
    slot: 'staff', name: 'EMBERCALLER\'S BRAND', rarity: 'set', set: 'embercaller', minLevel: 3, stats: { fireDamage: 0.15, missileDamage: 6 },
    text: 'Warm in the hand, hot at the tip.', look: { style: 'crystal', wood: 0x2a1a14, gem: 0xff6020 }
  },

  priest_mitre: {
    slot: 'hat', name: 'HIGH PRIEST\'S MITRE', rarity: 'set', set: 'priest', minLevel: 4, stats: { mend: 1, maxHp: 15 },
    text: 'Taken from an orc cleric. Wounds close beneath it.', look: { style: 'mitre', color: 0xf0e8d0, band: 0xd8a838, glow: 0xfff0a0 }
  },
  priest_vestments: {
    slot: 'robe', name: 'HIGH PRIEST\'S VESTMENTS', rarity: 'set', set: 'priest', minLevel: 4, stats: { radiantDamage: 0.1, mend: 0.5 },
    text: 'White linen, gold thread, not one bloodstain.', look: { robe: 0xf0e8d0, mantle: 0xd8c890, trim: 0xd8a838, glow: 0xfff0a0 }
  },
  priest_crosier: {
    slot: 'staff', name: 'HIGH PRIEST\'S CROSIER', rarity: 'set', set: 'priest', minLevel: 4, stats: { radiantDamage: 0.15, potionPower: 0.15 },
    text: 'It hums a hymn nobody taught it.', look: { style: 'sun', wood: 0xe0d0a0, gem: 0xfff0a0 }
  },

  stormweaver_brim: {
    slot: 'hat', name: 'STORMWEAVER\'S BRIM', rarity: 'set', set: 'stormweaver', minLevel: 5, stats: { lightningDamage: 0.12, speed: 0.04 },
    text: 'Rain never reaches the face beneath it.', look: { style: 'wide', color: 0x2a3448, band: 0xa0e8ff, glow: 0xa0e8ff }
  },
  stormweaver_mantle: {
    slot: 'robe', name: 'STORMWEAVER\'S MANTLE', rarity: 'set', set: 'stormweaver', minLevel: 5, stats: { lightningCost: -5, armor: 0.05 },
    text: 'It crackles when you take it off.', look: { robe: 0x3a4a68, mantle: 0x2a3448, trim: 0xa0e8ff, cape: 0x4a6a9a, glow: 0x80d8ff }
  },
  stormweaver_fork: {
    slot: 'staff', name: 'STORMWEAVER\'S FORK', rarity: 'set', set: 'stormweaver', minLevel: 5, stats: { lightningDamage: 0.15, cooldown: 0.04 },
    text: 'Sparks leap between its prongs.', look: { style: 'fork', wood: 0x4a4e5a, gem: 0xa0e8ff }
  },
  stormweaver_coil: {
    slot: 'ring', name: 'STORMWEAVER\'S COIL', rarity: 'set', set: 'stormweaver', minLevel: 5, stats: { lightningDamage: 0.1, regen: 0.08 },
    text: 'A copper spiral that is always faintly warm.', look: { band: 0xc07040, gem: 0xa0e8ff }
  },

  rimewarden_cowl: {
    slot: 'hat', name: 'RIMEWARDEN\'S COWL', rarity: 'set', set: 'rimewarden', minLevel: 6, stats: { coldDamage: 0.12, armor: 0.05 },
    text: 'Frost grows on it from the inside.', look: { style: 'hood', color: 0xa8d0f0, band: 0xe8f8ff, glow: 0x80d8ff }
  },
  rimewarden_furs: {
    slot: 'robe', name: 'RIMEWARDEN\'S FURS', rarity: 'set', set: 'rimewarden', minLevel: 6, stats: { armor: 0.08, maxHp: 25 },
    text: 'Cold to the touch, even by the forges.', look: { robe: 0xa8d0f0, mantle: 0xe8f0f8, trim: 0xe8f8ff, cape: 0xd8e8f0, glow: 0x80d8ff }
  },
  rimewarden_band: {
    slot: 'ring', name: 'RIMEWARDEN\'S BAND', rarity: 'set', set: 'rimewarden', minLevel: 6, stats: { coldDamage: 0.1, steadfast: 0.15 },
    text: 'Ice that does not melt, worn as a ring.', look: { band: 0xe8f8ff, gem: 0x9ad8ff }
  },

  gravelord_hood: {
    slot: 'hat', name: 'GRAVELORD\'S HOOD', rarity: 'set', set: 'gravelord', minLevel: 8, stats: { necroticDamage: 0.12, killHeal: 2 },
    text: 'It smells of turned earth.', look: { style: 'hood', color: 0x16121a, band: 0x8a40ff, glow: 0xa040ff }
  },
  gravelord_shroud: {
    slot: 'robe', name: 'GRAVELORD\'S SHROUD', rarity: 'set', set: 'gravelord', minLevel: 8, stats: { leech: 2, armor: 0.06 },
    text: 'A burial cloth, borrowed.', look: { robe: 0x16121a, mantle: 0x08060a, trim: 0x8a40ff, cape: 0x2a1048, glow: 0xa040ff }
  },
  gravelord_sceptre: {
    slot: 'staff', name: 'GRAVELORD\'S SCEPTRE', rarity: 'set', set: 'gravelord', minLevel: 8, stats: { necroticDamage: 0.15, leech: 2 },
    text: 'The skull on top still grins at its own jokes.', look: { style: 'skull', wood: 0x2a2028, gem: 0xa040ff }
  },

  archmage_crown: {
    slot: 'hat', name: 'CROWN OF THE ARCHMAGE', rarity: 'set', set: 'archmage', minLevel: 10, stats: { maxManergy: 40, regen: 0.2 },
    text: 'Seven gems, one for each school of magic.', look: { style: 'crown', color: 0xe0b040, band: 0xe0b040, glow: 0x80f0ff }
  },
  archmage_robe: {
    slot: 'robe', name: 'ROBE OF THE ARCHMAGE', rarity: 'set', set: 'archmage', minLevel: 10, stats: { maxHp: 40, maxManergy: 40, cooldown: 0.08 },
    text: 'Purple, gold and a cape that billows without wind.', look: { robe: 0x4a1a7a, mantle: 0x2a0a4a, trim: 0xe0b040, cape: 0x9a2ac8, glow: 0xffd060 }
  },
  archmage_spire: {
    slot: 'staff', name: 'SPIRE OF THE ARCHMAGE', rarity: 'set', set: 'archmage', minLevel: 10, stats: { spellDamage: 0.12, missileDamage: 12 },
    text: 'A tower in miniature; someone small still lives in it.', look: { style: 'crystal', wood: 0xe0b040, gem: 0xd080ff }
  },
  archmage_seal: {
    slot: 'ring', name: 'SEAL OF THE ARCHMAGE', rarity: 'set', set: 'archmage', minLevel: 10, stats: { costCut: 0.08, maxManergy: 20 },
    text: 'Pressed into wax, it signs for the whole college.', look: { band: 0xffc840, gem: 0xd080ff }
  },

  // ------------------------------------------------------------ uniques
  jesters_folly: {
    slot: 'hat', name: 'JESTER\'S FOLLY', rarity: 'legendary', minLevel: 2, stats: { xpGain: 0.3, magicFind: 0.3, maxHp: -15 },
    text: 'Laugh, and the dungeon laughs with you. Then it bites.', look: { style: 'wide', color: 0xc02a8a, band: 0xffd040, glow: 0xffd040 }
  },
  hat_of_stars: {
    slot: 'hat', name: 'HAT OF STARS', rarity: 'legendary', minLevel: 4, stats: { cooldown: 0.12, maxManergy: 20, radiantDamage: 0.1 },
    text: 'The stars on it turn with the night sky.', look: { style: 'pointed', color: 0x141a4a, band: 0xc0d0ff, glow: 0xa0c0ff }
  },
  thorned_circlet: {
    slot: 'hat', name: 'THE THORNED CIRCLET', rarity: 'legendary', minLevel: 5, stats: { maxHp: 25, armor: 0.1, killHeal: 3, speed: -0.05 },
    text: 'It draws a little blood, and gives back more.', look: { style: 'crown', color: 0x5a3a2a, band: 0x8a1a1a, glow: 0xff3040 }
  },
  mindflayer_hood: {
    slot: 'hat', name: 'THE MINDFLAYER\'S HOOD', rarity: 'legendary', minLevel: 7, stats: { maxManergy: 30, necroticDamage: 0.15, killManergy: 3 },
    text: 'Whispers fill it, and not all of them are yours.', look: { style: 'hood', color: 0x2a1a3a, band: 0x60ffb0, glow: 0x60ffb0 }
  },
  crown_of_ash: {
    slot: 'hat', name: 'CROWN OF ASH', rarity: 'legendary', minLevel: 12, stats: { fireDamage: 0.3, spellDamage: 0.1, maxHp: -10 },
    text: 'A king burned in it. It did not mind.', look: { style: 'crown', color: 0x2a2420, band: 0xff6010, glow: 0xff4010 }
  },
  pilgrims_road: {
    slot: 'robe', name: 'THE PILGRIM\'S ROAD', rarity: 'legendary', minLevel: 3, stats: { speed: 0.15, mend: 0.8, potionPower: 0.2 },
    text: 'Every mile it walked is stitched into it.', look: { robe: 0x6a5032, mantle: 0x4a3a22, trim: 0xd8c070, cape: 0x8a6a42 }
  },
  frostweave_robe: {
    slot: 'robe', name: 'FROSTWEAVE', rarity: 'legendary', minLevel: 5, stats: { armor: 0.1, maxManergy: 25, coldDamage: 0.2 },
    text: 'Woven on a loom of icicles, by someone very patient.', look: { robe: 0xa8d0f0, mantle: 0x5a8ab8, trim: 0xe8f8ff, glow: 0x80d8ff }
  },
  void_robe: {
    slot: 'robe', name: 'VESTMENTS OF THE VOID', rarity: 'legendary', minLevel: 9, stats: { leech: 3, armor: 0.12, maxHp: 20, necroticDamage: 0.15 },
    text: 'Light dies in its folds.', look: { robe: 0x121016, mantle: 0x060508, trim: 0x8a40ff, cape: 0x2a1048, glow: 0xa040ff }
  },
  dragonhide_mantle: {
    slot: 'robe', name: 'DRAGONHIDE MANTLE', rarity: 'legendary', minLevel: 11, stats: { maxHp: 60, armor: 0.15, fireDamage: 0.15, speed: -0.05 },
    text: 'Heavy as a door, and the dragon wanted it back.', look: { robe: 0x6a1a10, mantle: 0x3a0a08, trim: 0xd8a838, cape: 0x8a2a14, glow: 0xff6010 }
  },
  emberheart: {
    slot: 'staff', name: 'EMBERHEART', rarity: 'legendary', minLevel: 3, stats: { fireballCost: -10, missileDamage: 10, fireDamage: 0.25 },
    text: 'A coal from the first forge, still burning.', look: { style: 'crystal', wood: 0x1a0a08, gem: 0xff4010 }
  },
  gravedigger: {
    slot: 'staff', name: 'THE GRAVEDIGGER', rarity: 'legendary', minLevel: 4, stats: { leech: 4, necroticDamage: 0.25, maxHp: 15 },
    text: 'An orc shaman\'s, skull and all. The skull disapproves.', look: { style: 'skull', wood: 0xd8d0b0, gem: 0x80ff60 }
  },
  stormcaller: {
    slot: 'staff', name: 'STORMCALLER', rarity: 'legendary', minLevel: 4, stats: { lightningCost: -10, cooldown: 0.08, lightningDamage: 0.25 },
    text: 'Point it at the sky and the sky points back.', look: { style: 'fork', wood: 0x2a2e3a, gem: 0x80c8ff }
  },
  iron_tongue: {
    slot: 'staff', name: 'THE IRON TONGUE', rarity: 'legendary', minLevel: 5, stats: { ironDamage: 0.4, missileDamage: 10, maxHp: 20 },
    text: 'A dwarf runesmith\'s last word, forged into a rod.', look: { style: 'orb', wood: 0x4a4e56, gem: 0xd0d8e0 }
  },
  winters_kiss: {
    slot: 'staff', name: 'WINTER\'S KISS', rarity: 'legendary', minLevel: 6, stats: { coldDamage: 0.3, maxManergy: 20, regen: 0.1 },
    text: 'Breathe on the crystal and it frosts over. Always.', look: { style: 'crystal', wood: 0xc8d8e8, gem: 0xd8f4ff }
  },
  plague_spire: {
    slot: 'staff', name: 'THE PLAGUE SPIRE', rarity: 'legendary', minLevel: 8, stats: { poisonDamage: 0.35, costCut: 0.08, killHeal: 2 },
    text: 'Grown, not carved, in the venom mires.', look: { style: 'fork', wood: 0x2a3a10, gem: 0x80ff40 }
  },
  magi_staff: {
    slot: 'staff', name: 'STAFF OF THE MAGI', rarity: 'legendary', minLevel: 10, stats: { missileDamage: 25, cooldown: 0.15, maxManergy: 30 },
    text: 'A small sun turns in its crook.', look: { style: 'sun', wood: 0xe0c070, gem: 0xffe080 }
  },
  alchemist_band: {
    slot: 'ring', name: 'THE ALCHEMIST\'S BAND', rarity: 'legendary', minLevel: 2, stats: { potionPower: 0.5, mend: 0.5 },
    text: 'Stained every colour a potion can be.', look: { band: 0xc8d0e0, gem: 0xff70a0 }
  },
  gamblers_loop: {
    slot: 'ring', name: 'GAMBLER\'S LOOP', rarity: 'legendary', minLevel: 3, stats: { magicFind: 0.4, xpGain: 0.15, armor: -0.1 },
    text: 'Fortune favours the bold, and charges them for it.', look: { band: 0xffc840, gem: 0x40ff80 }
  },
  ouroboros: {
    slot: 'ring', name: 'THE OUROBOROS', rarity: 'legendary', minLevel: 6, stats: { killHeal: 4, killManergy: 4, regen: -0.1 },
    text: 'A serpent eating its tail, and every foe you fell.', look: { band: 0x5a8a3a, gem: 0xffd040 }
  },
  eye_of_storm: {
    slot: 'ring', name: 'EYE OF THE STORM', rarity: 'legendary', minLevel: 7, stats: { lightningDamage: 0.2, speed: 0.1 },
    text: 'Calm at the centre, and nowhere else.', look: { band: 0xc8d0e0, gem: 0x80c8ff }
  },
  heart_of_deep: {
    slot: 'ring', name: 'HEART OF THE DEEP', rarity: 'legendary', minLevel: 12, stats: { maxManergy: 40, spellDamage: 0.15, steadfast: 0.2 },
    text: 'It beats, slowly, in time with something far below.', look: { band: 0x2a2a3a, gem: 0x40ffd0 }
  },

  // ------------------------------------------------------------ more sets
  shepherd_hat: {
    slot: 'hat', name: 'THE SHEPHERD\'S STRAW HAT', rarity: 'set', set: 'shepherd', minLevel: 2, stats: { 'power.polymorph': 0.2, maxHp: 10 },
    text: 'It smells of hay, and faintly of sheep.', look: { style: 'wide', color: 0xc8a860, band: 0x6a8a3a }
  },
  shepherd_crook: {
    slot: 'staff', name: 'THE SHEPHERD\'S CROOK', rarity: 'set', set: 'shepherd', minLevel: 2, stats: { 'power.sleep': 0.25, missileDamage: 5 },
    text: 'Bent to catch a stray by the neck, sheep or orc.', look: { style: 'moon', wood: 0x8a6a42, gem: 0xf8f0e0 }
  },
  shepherd_bell: {
    slot: 'ring', name: 'THE BELL-WETHER\'S RING', rarity: 'set', set: 'shepherd', minLevel: 2, stats: { 'cd.polymorph': 0.15, mend: 0.3 },
    text: 'A little bell hangs from it. The flock follows the sound.', look: { band: 0xc8a860, gem: 0xfff0c0 }
  },

  morning_star: {
    slot: 'ring', name: 'THE MORNING STAR', rarity: 'set', set: 'twinstars', minLevel: 6, stats: { radiantDamage: 0.12, regen: 0.08 },
    text: 'It rises before you wake, and wakes you.', look: { band: 0xffd060, gem: 0xfff0a0, style: 'twin' }
  },
  evening_star: {
    slot: 'ring', name: 'THE EVENING STAR', rarity: 'set', set: 'twinstars', minLevel: 6, stats: { spellDamage: 0.08, maxManergy: 15 },
    text: 'The last light of the day, kept on a finger.', look: { band: 0xc8d0e0, gem: 0xc0a0ff, style: 'twin' }
  },

  pyromancer_peak: {
    slot: 'hat', name: 'THE PYROMANCER\'S PEAK', rarity: 'set', set: 'pyromancer', minLevel: 7, stats: { fireDamage: 0.12, 'power.scorch': 0.2 },
    text: 'The tip is always smouldering. Nobody minds.', look: { style: 'pointed', color: 0x5a1408, band: 0xffa030, glow: 0xff6010 }
  },
  pyromancer_vestments: {
    slot: 'robe', name: 'THE PYROMANCER\'S VESTMENTS', rarity: 'set', set: 'pyromancer', minLevel: 7, stats: { maxHp: 25, 'power.sphere': 0.25 },
    text: 'Asbestos and silk, cut for a wizard who stands too close.', look: { robe: 0xa02a0a, mantle: 0x5a1408, trim: 0xffa030, cape: 0xff6010, glow: 0xff6010 }
  },
  pyromancer_torch: {
    slot: 'staff', name: 'THE PYROMANCER\'S TORCH', rarity: 'set', set: 'pyromancer', minLevel: 7, stats: { 'power.fireball': 0.25, fireDamage: 0.12 },
    text: 'A serpent of brass with a coal in its jaws.', look: { style: 'serpent', wood: 0xb08030, gem: 0xff5010 }
  },
  pyromancer_signet: {
    slot: 'ring', name: 'THE PYROMANCER\'S SIGNET', rarity: 'set', set: 'pyromancer', minLevel: 7, stats: { 'cost.fireball': 0.15, 'cd.meteor': 0.15 },
    text: 'Pressed into wax, it sets the letter alight.', look: { band: 0xffc840, gem: 0xff4010, style: 'signet' }
  },

  viper_hood: {
    slot: 'hat', name: 'THE VIPER\'S HOOD', rarity: 'set', set: 'viper', minLevel: 8, stats: { poisonDamage: 0.12, speed: 0.04 },
    text: 'It flares when you are angry.', look: { style: 'hood', color: 0x1a3a14, band: 0x80ff40, glow: 0x60ff30 }
  },
  viper_skin: {
    slot: 'robe', name: 'THE VIPERSKIN ROBE', rarity: 'set', set: 'viper', minLevel: 8, stats: { armor: 0.06, steadfast: 0.12 },
    text: 'Shed by something that is still out there, somewhere, larger.', look: { robe: 0x2a4a1a, mantle: 0x1a3010, trim: 0x80ff40, cape: 0x3a5a20 }
  },
  viper_fang: {
    slot: 'staff', name: 'THE VIPER\'S FANG', rarity: 'set', set: 'viper', minLevel: 8, stats: { poisonDamage: 0.15, 'power.cloud': 0.2 },
    text: 'Venom still beads on the tip.', look: { style: 'serpent', wood: 0x2a3a1a, gem: 0x80ff40 }
  },
  viper_coil: {
    slot: 'ring', name: 'THE VIPER\'S COIL', rarity: 'set', set: 'viper', minLevel: 8, stats: { 'cd.cloud': 0.15, killHeal: 2 },
    text: 'A green snake swallowing its own tail, slowly.', look: { band: 0x5a8a3a, gem: 0x80ff40 }
  },

  chrono_crown: {
    slot: 'hat', name: 'THE CHRONOMANCER\'S CROWN', rarity: 'set', set: 'chronomancer', minLevel: 9, stats: { cooldown: 0.05, 'power.timestop': 0.2 },
    text: 'Seven hands on seven faces, none of them agreeing.', look: { style: 'crown', color: 0xc8a050, band: 0xc8a050, glow: 0xffe8a0 }
  },
  chrono_robe: {
    slot: 'robe', name: 'THE CHRONOMANCER\'S ROBE', rarity: 'set', set: 'chronomancer', minLevel: 9, stats: { maxManergy: 25, 'power.haste': 0.25 },
    text: 'The hem is a little older than the collar.', look: { robe: 0x2a2a5a, mantle: 0x1a1a3a, trim: 0xffe8a0, cape: 0x4a4a8a, glow: 0xffe8a0 }
  },
  chrono_hourglass: {
    slot: 'ring', name: 'THE CHRONOMANCER\'S HOURGLASS', rarity: 'set', set: 'chronomancer', minLevel: 9, stats: { 'cd.blink': 0.2, regen: 0.08 },
    text: 'The sand inside falls up when nobody is looking.', look: { band: 0xc8a050, gem: 0xffe8a0, style: 'twin' }
  },
  chrono_pendulum: {
    slot: 'ring', name: 'THE CHRONOMANCER\'S PENDULUM', rarity: 'set', set: 'chronomancer', minLevel: 9, stats: { 'cd.timestop': 0.2, 'cd.haste': 0.2 },
    text: 'Tick, and the orc swings. Tock, and it has missed.', look: { band: 0xc8d0e0, gem: 0xffe8a0, style: 'signet' }
  },

  mindbreaker_circlet: {
    slot: 'hat', name: 'THE MINDBREAKER\'S CIRCLET', rarity: 'set', set: 'mindbreaker', minLevel: 11, stats: { psychicDamage: 0.15, maxManergy: 20 },
    text: 'It hums at a pitch only the weak-minded hear.', look: { style: 'crown', color: 0x6a3a8a, band: 0x6a3a8a, glow: 0xff80e0 }
  },
  mindbreaker_wraps: {
    slot: 'robe', name: 'THE MINDBREAKER\'S WRAPS', rarity: 'set', set: 'mindbreaker', minLevel: 11, stats: { steadfast: 0.2, 'power.confusion': 0.25 },
    text: 'The pattern moves if you stare at it. Orcs stare at it.', look: { robe: 0x4a1a5a, mantle: 0x2a0a3a, trim: 0xff80e0, glow: 0xff80e0 }
  },
  mindbreaker_rod: {
    slot: 'staff', name: 'THE MINDBREAKER\'S ROD', rarity: 'set', set: 'mindbreaker', minLevel: 11, stats: { 'power.phantasm': 0.3, psychicDamage: 0.15 },
    text: 'A thought, caged in silver, trying to get out.', look: { style: 'cage', wood: 0xc8d0e0, gem: 0xff80e0 }
  },

  slayer_crown: {
    slot: 'hat', name: 'THE DRAGONSLAYER\'S CROWN', rarity: 'set', set: 'dragonslayer', minLevel: 14, stats: { maxHp: 30, armor: 0.06 },
    text: 'Forged from a wyrm\'s gold, by the wizard who took it.', look: { style: 'crown', color: 0xe0b040, band: 0xe0b040, glow: 0xff6010 }
  },
  slayer_scales: {
    slot: 'robe', name: 'THE DRAGONSLAYER\'S SCALES', rarity: 'set', set: 'dragonslayer', minLevel: 14, stats: { armor: 0.1, maxHp: 40, steadfast: 0.1 },
    text: 'Every scale from a different dragon. The colours clash.', look: { robe: 0x6a1a10, mantle: 0x2a4a6a, trim: 0xe0b040, cape: 0x1a5a2a, glow: 0xffd060 }
  },
  slayer_lance: {
    slot: 'staff', name: 'THE DRAGONSLAYER\'S LANCE', rarity: 'set', set: 'dragonslayer', minLevel: 14, stats: { spellDamage: 0.15, ironDamage: 0.2, missileDamage: 15 },
    text: 'A staff with a spearhead, for when spells are not enough.', look: { style: 'fork', wood: 0x3a2a20, gem: 0xffd060 }
  },
  slayer_oath: {
    slot: 'ring', name: 'THE DRAGONSLAYER\'S OATH', rarity: 'set', set: 'dragonslayer', minLevel: 14, stats: { spellDamage: 0.1, killHeal: 4 },
    text: 'Sworn on a dragon\'s tooth: never to run. It is a short oath.', look: { band: 0xe0b040, gem: 0xff3020, style: 'signet' }
  },

  // ------------------------------------------------------------ more uniques: staffs
  paper_staff: {
    slot: 'staff', name: 'THE PAPER STAFF', rarity: 'legendary', minLevel: 1, stats: { maxManergy: 20, costCut: 0.05, maxHp: -5 },
    text: 'Rolled from a thousand failed scrolls. Keep it away from fireballs.', look: { style: 'orb', wood: 0xf0e6c8, gem: 0xfff8e0 }
  },
  archivist_pointer: {
    slot: 'staff', name: 'THE ARCHIVIST\'S POINTER', rarity: 'legendary', minLevel: 2, stats: { missileDamage: 12, xpGain: 0.12, cooldown: 0.03 },
    text: 'Made for tapping the right line in the right book, and orcs.', look: { style: 'orb', wood: 0x3a2a1a, gem: 0xffd040 }
  },
  pale_crook: {
    slot: 'staff', name: 'THE PALE SHEPHERD', rarity: 'legendary', minLevel: 4, stats: { 'power.polymorph': 0.6, 'cd.polymorph': 0.25, maxManergy: 15 },
    text: 'No orc has ever been turned back from a sheep with it. None has asked.', look: { style: 'moon', wood: 0xe8e0d0, gem: 0xffffff }
  },
  spindle_dreams: {
    slot: 'staff', name: 'SPINDLE OF DREAMS', rarity: 'legendary', minLevel: 3, stats: { 'power.sleep': 0.6, 'cost.sleep': 0.3, regen: 0.1 },
    text: 'Prick a finger on it and sleep a hundred years. Prick an orc, and less.', look: { style: 'cage', wood: 0x9a8ab8, gem: 0xb0a0ff }
  },
  tempest_horn: {
    slot: 'staff', name: 'THE TEMPEST HORN', rarity: 'legendary', minLevel: 5, stats: { 'power.thunder': 0.45, 'cd.thunder': 0.25, lightningDamage: 0.1 },
    text: 'Blow through it and the walls answer.', look: { style: 'antler', wood: 0x8a8070, gem: 0x80c8ff }
  },
  chainweaver: {
    slot: 'staff', name: 'CHAINWEAVER', rarity: 'legendary', minLevel: 5, stats: { 'power.lightning': 0.35, 'cost.lightning': 0.25, lightningDamage: 0.1 },
    text: 'It spins lightning like wool, and never drops a stitch.', look: { style: 'fork', wood: 0x6a6e7a, gem: 0xa0e8ff }
  },
  phoenix_quill: {
    slot: 'staff', name: 'THE PHOENIX QUILL', rarity: 'legendary', minLevel: 6, stats: { 'power.fireball': 0.4, 'cd.fireball': 0.15, fireDamage: 0.15 },
    text: 'A feather that writes in flame, and signs its work.', look: { style: 'serpent', wood: 0xc04010, gem: 0xffb030 }
  },
  bloodletter: {
    slot: 'staff', name: 'THE BLOODLETTER', rarity: 'legendary', minLevel: 6, stats: { 'power.ray': 0.45, 'cost.ray': 0.25, leech: 2 },
    text: 'A barber-surgeon\'s staff, from before barbers knew better.', look: { style: 'skull', wood: 0x6a1010, gem: 0xff2040 }
  },
  rolling_sun: {
    slot: 'staff', name: 'THE ROLLING SUN', rarity: 'legendary', minLevel: 6, stats: { 'power.sphere': 0.5, 'cd.sphere': 0.2, fireDamage: 0.1 },
    text: 'It rolls downhill, and every hill in the dungeon is downhill.', look: { style: 'sun', wood: 0xa05a20, gem: 0xff8020 }
  },
  anvils_echo: {
    slot: 'staff', name: 'THE ANVIL\'S ECHO', rarity: 'legendary', minLevel: 7, stats: { 'power.ironshot': 0.5, 'cd.ironshot': 0.25, ironDamage: 0.15 },
    text: 'Every bolt it throws rings like the hammer that made it.', look: { style: 'orb', wood: 0x4a4e56, gem: 0xff6020 }
  },
  winterheart: {
    slot: 'staff', name: 'WINTERHEART', rarity: 'legendary', minLevel: 8, stats: { 'power.blizzard': 0.4, 'power.cone': 0.3, coldDamage: 0.15 },
    text: 'A heart of ice that beats once a winter.', look: { style: 'crystal', wood: 0xa8c8e0, gem: 0xe8f8ff }
  },
  mire_censer: {
    slot: 'staff', name: 'THE CENSER OF THE MIRES', rarity: 'legendary', minLevel: 8, stats: { 'power.cloud': 0.5, 'cost.cloud': 0.25, poisonDamage: 0.15 },
    text: 'Swing it gently. The smoke knows what to do.', look: { style: 'cage', wood: 0x3a4a20, gem: 0x80ff40 }
  },
  solemn_vigil: {
    slot: 'staff', name: 'SOLEMN VIGIL', rarity: 'legendary', minLevel: 9, stats: { 'power.guardians': 0.5, 'cd.guardians': 0.2, radiantDamage: 0.15 },
    text: 'The dead who guard you lean on it when you are not looking.', look: { style: 'sun', wood: 0xd8d0b0, gem: 0xffe080 }
  },
  knights_will: {
    slot: 'staff', name: 'THE KNIGHT\'S WILL', rarity: 'legendary', minLevel: 9, stats: { 'power.weapon': 0.5, 'cd.weapon': 0.2, radiantDamage: 0.1 },
    text: 'Left to a wizard by a knight with no heirs and a grudge.', look: { style: 'fork', wood: 0xc8c0a0, gem: 0xffe8a0 }
  },
  maelstrom_eye: {
    slot: 'staff', name: 'THE MAELSTROM\'S EYE', rarity: 'legendary', minLevel: 10, stats: { 'power.maelstrom': 0.45, 'cd.maelstrom': 0.2, ironDamage: 0.15 },
    text: 'Drowned with the Sunken Library, and none the worse for it.', look: { style: 'moon', wood: 0x2a4a6a, gem: 0x40a0ff }
  },
  nightmare_stem: {
    slot: 'staff', name: 'NIGHTMARE\'S STEM', rarity: 'legendary', minLevel: 10, stats: { 'power.phantasm': 0.5, 'cd.phantasm': 0.25, psychicDamage: 0.2 },
    text: 'A black flower grows from its tip. Do not smell it.', look: { style: 'antler', wood: 0x1a1a24, gem: 0x60ffb0 }
  },
  unmaker: {
    slot: 'staff', name: 'THE UNMAKER', rarity: 'legendary', minLevel: 11, stats: { 'power.disintegrate': 0.5, 'cd.disintegrate': 0.25, forceDamage: 0.15 },
    text: 'Its maker is no longer around to say what it is for.', look: { style: 'crystal', wood: 0x2a3a2a, gem: 0x60ff60 }
  },
  sands_of_never: {
    slot: 'staff', name: 'THE SANDS OF NEVER', rarity: 'legendary', minLevel: 11, stats: { 'power.timestop': 0.4, 'cd.timestop': 0.25, cooldown: 0.06 },
    text: 'An hourglass on a stick, the sand stuck halfway.', look: { style: 'cage', wood: 0xc8a050, gem: 0xffe8a0 }
  },
  atlas_lever: {
    slot: 'staff', name: 'ATLAS\'S LEVER', rarity: 'legendary', minLevel: 12, stats: { 'power.gravity': 0.45, 'cd.gravity': 0.2, forceDamage: 0.15 },
    text: 'Give it a place to stand and it will turn the floor over.', look: { style: 'orb', wood: 0x5a5a6a, gem: 0xc070ff }
  },
  meteorfall: {
    slot: 'staff', name: 'METEORFALL', rarity: 'legendary', minLevel: 13, stats: { 'power.meteor': 0.5, 'cd.meteor': 0.25, fireDamage: 0.12 },
    text: 'A shard of a falling star, still falling, very slowly.', look: { style: 'crystal', wood: 0x2a1a14, gem: 0xff6010 }
  },
  last_word: {
    slot: 'staff', name: 'SCEPTRE OF THE LAST WORD', rarity: 'legendary', minLevel: 13, stats: { 'power.pwkill': 0.4, 'cost.pwkill': 0.3, necroticDamage: 0.15 },
    text: 'Whoever holds it is never interrupted.', look: { style: 'skull', wood: 0x16121a, gem: 0xa040ff }
  },
  wyrmfang: {
    slot: 'staff', name: 'WYRMFANG', rarity: 'legendary', minLevel: 15, stats: { fireDamage: 0.2, coldDamage: 0.2, lightningDamage: 0.2, poisonDamage: 0.2, necroticDamage: 0.2 },
    text: 'Five dragons lost a tooth each to make it. They want them back.', look: { style: 'serpent', wood: 0xe8e0c8, gem: 0xffd060 }
  },
  grand_magister: {
    slot: 'staff', name: 'THE GRAND MAGISTER\'S STAFF', rarity: 'legendary', minLevel: 16, stats: { spellDamage: 0.2, cooldown: 0.1, maxManergy: 40, costCut: 0.08 },
    text: 'The college keeps a copy. This is not the copy.', look: { style: 'sun', wood: 0x4a1a7a, gem: 0xd080ff }
  },

  // ------------------------------------------------------------ more uniques: rings
  apprentice_mistake: {
    slot: 'ring', name: 'THE APPRENTICE\'S MISTAKE', rarity: 'legendary', minLevel: 1, stats: { spellDamage: 0.1, regen: 0.05, maxHp: -8 },
    text: 'It was meant to be a ring of warmth.', look: { band: 0xc07040, gem: 0xff60d0 }
  },
  thousand_steps: {
    slot: 'ring', name: 'RING OF A THOUSAND STEPS', rarity: 'legendary', minLevel: 2, stats: { speed: 0.1, mend: 0.3 },
    text: 'Worn smooth by a pilgrim who never sat down.', look: { band: 0x9a8a6a, gem: 0xffe070, style: 'band' }
  },
  steady_hand: {
    slot: 'ring', name: 'BAND OF THE STEADY HAND', rarity: 'legendary', minLevel: 2, stats: { 'cd.tele': 0.5, 'cost.tele': 0.5, magicFind: 0.15 },
    text: 'A thief\'s ring. The thief, alas, could not reach it in time.', look: { band: 0xc8d0e0, gem: 0xc070ff }
  },
  scorched_hand: {
    slot: 'ring', name: 'SIGNET OF THE SCORCHED HAND', rarity: 'legendary', minLevel: 3, stats: { 'power.scorch': 0.4, 'cost.scorch': 0.3, fireDamage: 0.08 },
    text: 'The hand in the seal is missing two fingers.', look: { band: 0x8a6a42, gem: 0xff7030, style: 'signet' }
  },
  last_orc_tooth: {
    slot: 'ring', name: 'THE LAST ORC\'S TOOTH', rarity: 'legendary', minLevel: 3, stats: { killHeal: 2, killManergy: 2, ironDamage: 0.1 },
    text: 'He said there were no more of them. There were.', look: { band: 0xe8e0c8, gem: 0xd8d0b0, style: 'band' }
  },
  couriers_loop: {
    slot: 'ring', name: 'THE COURIER\'S LOOP', rarity: 'legendary', minLevel: 3, stats: { 'power.haste': 0.5, 'cd.haste': 0.25, speed: 0.05 },
    text: 'Whatever was in the letter, it arrived yesterday.', look: { band: 0xffc840, gem: 0xffe070 }
  },
  misers_knuckle: {
    slot: 'ring', name: 'THE MISER\'S KNUCKLE', rarity: 'legendary', minLevel: 4, stats: { costCut: 0.12, magicFind: 0.15, speed: -0.04 },
    text: 'It never lets go of anything, including the finger.', look: { band: 0x8a7a40, gem: 0xffc020, style: 'signet' }
  },
  blinking_eye: {
    slot: 'ring', name: 'BAND OF THE BLINKING EYE', rarity: 'legendary', minLevel: 4, stats: { 'cd.blink': 0.35, 'cost.blink': 0.3, speed: 0.06 },
    text: 'The eye on it is never quite where you left it.', look: { band: 0xc8d0e0, gem: 0xc070ff }
  },
  pyro_promise: {
    slot: 'ring', name: 'THE PYROMANCER\'S PROMISE', rarity: 'legendary', minLevel: 5, stats: { 'power.fireball': 0.25, fireballCost: -5, fireDamage: 0.08 },
    text: 'Just one more fireball, it says. It always says that.', look: { band: 0xffc840, gem: 0xff5020 }
  },
  rootbinder: {
    slot: 'ring', name: 'ROOTBINDER', rarity: 'legendary', minLevel: 5, stats: { 'cd.stun': 0.35, 'cost.stun': 0.3, poisonDamage: 0.1 },
    text: 'A twist of living root, still growing round the finger.', look: { band: 0x5a4020, gem: 0x40ff60, style: 'band' }
  },
  mercy_ring: {
    slot: 'ring', name: 'THE MERCY RING', rarity: 'legendary', minLevel: 5, stats: { 'power.heal': 0.5, 'cd.heal': 0.25, mend: 0.5 },
    text: 'Given to the healer who lost the fewest. She lost none.', look: { band: 0xf0e8d0, gem: 0xff70a0 }
  },
  iron_promise: {
    slot: 'ring', name: 'THE IRON PROMISE', rarity: 'legendary', minLevel: 5, stats: { ironDamage: 0.25, armor: 0.06, steadfast: 0.1 },
    text: 'A dwarf\'s word, hammered round. It has not bent.', look: { band: 0x6a6e76, gem: 0xd0d8e0, style: 'band' }
  },
  mirror_band: {
    slot: 'ring', name: 'CIRCLE OF REFLECTIONS', rarity: 'legendary', minLevel: 5, stats: { 'cd.image': 0.35, 'power.shield': 0.3, ward: 0.2 },
    text: 'Look into the stone and something looks back, a little late.', look: { band: 0xe8f0ff, gem: 0xd0d0ff, style: 'twin' }
  },
  coldknot: {
    slot: 'ring', name: 'COLDKNOT', rarity: 'legendary', minLevel: 6, stats: { 'power.agathys': 0.5, 'cd.agathys': 0.2, coldDamage: 0.1 },
    text: 'A knot of frost no fire has ever untied.', look: { band: 0xe8f8ff, gem: 0x9ad8ff, style: 'band' }
  },
  malison: {
    slot: 'ring', name: 'MALISON', rarity: 'legendary', minLevel: 6, stats: { 'power.curse': 0.5, 'cd.curse': 0.3, necroticDamage: 0.1 },
    text: 'Every curse it ever helped speak is written inside the band.', look: { band: 0x2a1a2a, gem: 0xc040c0 }
  },
  widows_band: {
    slot: 'ring', name: 'THE WIDOW\'S BAND', rarity: 'legendary', minLevel: 6, stats: { necroticDamage: 0.15, killManergy: 3, mend: 0.4 },
    text: 'Black jet, and a name on the inside that nobody says aloud.', look: { band: 0x16121a, gem: 0x8a40ff }
  },
  ghostlight: {
    slot: 'ring', name: 'GHOSTLIGHT', rarity: 'legendary', minLevel: 7, stats: { 'power.invis': 0.5, 'cd.invis': 0.25, magicFind: 0.1 },
    text: 'A pale flame in the stone that only the dead can see.', look: { band: 0xa8b0c0, gem: 0xc8d8ff }
  },
  frostbitten_finger: {
    slot: 'ring', name: 'THE FROSTBITTEN FINGER', rarity: 'legendary', minLevel: 7, stats: { 'power.cone': 0.45, 'cd.cone': 0.25, coldDamage: 0.1 },
    text: 'The finger is not included. It fell off.', look: { band: 0xc8d0e0, gem: 0xbfe8ff }
  },
  turncoat: {
    slot: 'ring', name: 'TURNCOAT', rarity: 'legendary', minLevel: 7, stats: { 'cd.swap': 0.4, 'cost.swap': 0.4, armor: 0.05 },
    text: 'Its stone is red on one side and blue on the other.', look: { band: 0xc8d0e0, gem: 0xd080ff, style: 'twin' }
  },
  wellspring: {
    slot: 'ring', name: 'THE WELLSPRING', rarity: 'legendary', minLevel: 7, stats: { regen: 0.25, maxManergy: 15 },
    text: 'Hold it to your ear and you can hear water far below.', look: { band: 0xc8d0e0, gem: 0x40c0ff }
  },
  bloodpact: {
    slot: 'ring', name: 'BLOODPACT', rarity: 'legendary', minLevel: 8, stats: { spellDamage: 0.2, leech: 3, maxHp: -20 },
    text: 'Signed in blood. The small print is also in blood.', look: { band: 0x6a1010, gem: 0xff2040 }
  },
  the_silence: {
    slot: 'ring', name: 'THE SILENCE', rarity: 'legendary', minLevel: 8, stats: { 'power.counter': 0.5, 'cd.counter': 0.3, steadfast: 0.15 },
    text: 'Taken from the Red Order\'s vault, where it said nothing for a century.', look: { band: 0x2a2a3a, gem: 0x60e0ff, style: 'band' }
  },
  howling_band: {
    slot: 'ring', name: 'THE HOWLING BAND', rarity: 'legendary', minLevel: 8, stats: { 'power.fear': 0.5, 'cd.fear': 0.3, killHeal: 2 },
    text: 'At night it howls, and somewhere an orc wakes up crying.', look: { band: 0x4a4a50, gem: 0x8a40ff }
  },
  jesters_bell: {
    slot: 'ring', name: 'THE JESTER\'S BELL', rarity: 'legendary', minLevel: 9, stats: { 'power.confusion': 0.5, 'cd.confusion': 0.25, psychicDamage: 0.15 },
    text: 'It jingles, and suddenly everyone has a different idea of who the enemy is.', look: { band: 0xffc840, gem: 0xff80ff }
  },
  starlight_loop: {
    slot: 'ring', name: 'STARLIGHT LOOP', rarity: 'legendary', minLevel: 9, stats: { radiantDamage: 0.2, regen: 0.12, xpGain: 0.1 },
    text: 'Starlight, caught in a loop, going round and round forever.', look: { band: 0xc8d0e0, gem: 0xfff0c0 }
  },
  stormknot: {
    slot: 'ring', name: 'THE STORMKNOT', rarity: 'legendary', minLevel: 9, stats: { 'cost.lightning': 0.3, 'cd.lightning': 0.2, lightningDamage: 0.12 },
    text: 'Sailors tie these to call the wind. This one calls worse.', look: { band: 0x4a6a9a, gem: 0xa0e8ff, style: 'band' }
  },
  thorn_and_rose: {
    slot: 'ring', name: 'THORN AND ROSE', rarity: 'legendary', minLevel: 10, stats: { mend: 1, killHeal: 3, armor: -0.05 },
    text: 'Pretty, sweet-smelling, and it draws blood every morning.', look: { band: 0x3a5a2a, gem: 0xff3050 }
  },
  everfrost: {
    slot: 'ring', name: 'EVERFROST BAND', rarity: 'legendary', minLevel: 10, stats: { 'cd.blizzard': 0.25, 'cost.blizzard': 0.25, coldDamage: 0.12 },
    text: 'Snow falls from it, gently, onto whatever you point at.', look: { band: 0xe8f8ff, gem: 0x9ad8ff, style: 'twin' }
  },
  lodestone: {
    slot: 'ring', name: 'THE LODESTONE', rarity: 'legendary', minLevel: 11, stats: { forceDamage: 0.25, 'power.maelstrom': 0.2, 'power.gravity': 0.2 },
    text: 'North is wherever it says it is.', look: { band: 0x3a3a44, gem: 0xc070ff, style: 'signet' }
  },
  dragons_eye: {
    slot: 'ring', name: 'THE DRAGON\'S EYE', rarity: 'legendary', minLevel: 12, stats: { fireDamage: 0.2, armor: 0.08, maxHp: 30 },
    text: 'It still blinks, now and then, and it is not happy.', look: { band: 0xe0b040, gem: 0xff3020 }
  },
  endless_pages: {
    slot: 'ring', name: 'BAND OF ENDLESS PAGES', rarity: 'legendary', minLevel: 13, stats: { xpGain: 0.25, regen: 0.15, cooldown: 0.05 },
    text: 'Inscribed with a book that has not finished being written.', look: { band: 0xd8c890, gem: 0xffd040, style: 'band' }
  },
  nexus: {
    slot: 'ring', name: 'NEXUS', rarity: 'legendary', minLevel: 14, stats: { spellDamage: 0.15, cooldown: 0.06, costCut: 0.06, maxManergy: 20 },
    text: 'Where every school of magic meets, and argues.', look: { band: 0xc8d0e0, gem: 0xff60d0, style: 'twin' }
  },
  voidheart: {
    slot: 'ring', name: 'VOIDHEART', rarity: 'legendary', minLevel: 16, stats: { spellDamage: 0.25, maxManergy: 30, maxHp: -25 },
    text: 'Where its stone should be there is a hole, and the hole is hungry.', look: { band: 0x121016, gem: 0x2a0a4a }
  },

  // ------------------------------------------------------------ more uniques: hats
  sages_nightcap: {
    slot: 'hat', name: 'THE SAGE\'S NIGHTCAP', rarity: 'legendary', minLevel: 2, stats: { regen: 0.15, xpGain: 0.1, speed: -0.03 },
    text: 'He did his best thinking asleep. So do you, now.', look: { style: 'pointed', color: 0x3a4a8a, band: 0xf0f0f0 }
  },
  shepherds_cap: {
    slot: 'hat', name: 'THE COUNTING HAT', rarity: 'legendary', minLevel: 3, stats: { 'power.sleep': 0.35, 'power.polymorph': 0.3, potionPower: 0.15 },
    text: 'One sheep, two sheep, three orcs, four sheep...', look: { style: 'wide', color: 0xe8e0d0, band: 0xb0a0ff }
  },
  many_pockets: {
    slot: 'hat', name: 'THE HAT OF MANY POCKETS', rarity: 'legendary', minLevel: 4, stats: { magicFind: 0.2, potionPower: 0.2, maxManergy: 10 },
    text: 'Somewhere in it is a sandwich from the third floor.', look: { style: 'wide', color: 0x6a4a2a, band: 0xffc020 }
  },
  unseen_cowl: {
    slot: 'hat', name: 'THE COWL OF THE UNSEEN', rarity: 'legendary', minLevel: 6, stats: { 'power.invis': 0.4, 'cd.invis': 0.2, speed: 0.06 },
    text: 'Pull it down far enough and even you are not sure you are there.', look: { style: 'hood', color: 0x3a4048, band: 0x9aa8c0 }
  },
  plague_doctor: {
    slot: 'hat', name: 'THE PLAGUE DOCTOR\'S HAT', rarity: 'legendary', minLevel: 7, stats: { 'power.cloud': 0.35, poisonDamage: 0.15, mend: 0.4 },
    text: 'Broad brimmed, so the miasma rolls off it and onto the patient.', look: { style: 'wide', color: 0x1a1a14, band: 0x80ff40 }
  },
  cindercrown: {
    slot: 'hat', name: 'CINDERCROWN', rarity: 'legendary', minLevel: 8, stats: { 'power.fireball': 0.2, 'power.scorch': 0.2, 'power.sphere': 0.2, fireDamage: 0.1 },
    text: 'Three schools of fire, three spikes of ember, one very warm head.', look: { style: 'crown', color: 0x3a1a10, band: 0xff6010, glow: 0xff8020 }
  },
  glacier_brow: {
    slot: 'hat', name: 'THE GLACIER\'S BROW', rarity: 'legendary', minLevel: 9, stats: { 'power.cone': 0.2, 'power.blizzard': 0.2, 'power.agathys': 0.2, coldDamage: 0.1 },
    text: 'Cut from the face of a glacier that was moving the wrong way.', look: { style: 'hood', color: 0xd8f0ff, band: 0x9ad8ff, glow: 0xbfe8ff }
  },
  mindcage: {
    slot: 'hat', name: 'MINDCAGE', rarity: 'legendary', minLevel: 10, stats: { 'power.phantasm': 0.3, 'power.confusion': 0.3, psychicDamage: 0.15, maxManergy: 15 },
    text: 'Bars of silver around the head: to keep thoughts in, or out?', look: { style: 'crown', color: 0xc8d0e0, band: 0xc8d0e0, glow: 0xff80e0 }
  },
  warlords_horns: {
    slot: 'hat', name: 'THE WARLORD\'S HORNS', rarity: 'legendary', minLevel: 10, from: 'warlord', stats: { armor: 0.1, maxHp: 40, ironDamage: 0.15 },
    text: 'Pried from his helm. They fit a wizard surprisingly well.', look: { style: 'mitre', color: 0x3a2a20, band: 0xd8c0a0, glow: 0xff3020 }
  },
  stormcrown: {
    slot: 'hat', name: 'STORMCROWN', rarity: 'legendary', minLevel: 11, stats: { 'power.lightning': 0.25, 'power.thunder': 0.25, lightningDamage: 0.15 },
    text: 'Seven iron spikes, and the sky\'s full attention.', look: { style: 'crown', color: 0x4a4e5a, band: 0x4a4e5a, glow: 0xa0e8ff }
  },
  clockwork_crown: {
    slot: 'hat', name: 'THE CLOCKWORK CROWN', rarity: 'legendary', minLevel: 12, stats: { 'power.timestop': 0.3, 'power.haste': 0.3, cooldown: 0.08 },
    text: 'It ticks. Sometimes, between ticks, it waits for you.', look: { style: 'crown', color: 0xb08040, band: 0xb08040, glow: 0xffe8a0 }
  },
  martyrs_halo: {
    slot: 'hat', name: 'HALO OF THE MARTYR', rarity: 'legendary', minLevel: 13, stats: { 'power.guardians': 0.3, 'power.heal': 0.3, radiantDamage: 0.15, maxHp: 20 },
    text: 'It floats a finger\'s width above the head, out of modesty.', look: { style: 'crown', color: 0xfff0c0, band: 0xffe080, glow: 0xfff0a0 }
  },
  gravewhisper: {
    slot: 'hat', name: 'GRAVEWHISPER', rarity: 'legendary', minLevel: 14, stats: { necroticDamage: 0.25, 'power.pwkill': 0.25, killManergy: 4 },
    text: 'It tells you the names of the dead. All of them. Constantly.', look: { style: 'hood', color: 0x0e0c14, band: 0xa040ff, glow: 0xa040ff }
  },
  astrolabe: {
    slot: 'hat', name: 'THE ASTROLABE', rarity: 'legendary', minLevel: 16, stats: { spellDamage: 0.15, cooldown: 0.1, maxManergy: 30 },
    text: 'A hat with the heavens worked into it, every star in its place.', look: { style: 'pointed', color: 0x0a1030, band: 0xe0b040, glow: 0xfff0c0 }
  },

  // ------------------------------------------------------------ more uniques: robes
  moths_mantle: {
    slot: 'robe', name: 'THE MOTH\'S MANTLE', rarity: 'legendary', minLevel: 2, stats: { speed: 0.08, ward: 0.2, maxHp: 5 },
    text: 'Grey wings for sleeves. It flutters toward lanterns.', look: { robe: 0x8a8070, mantle: 0x6a6050, trim: 0xd8d0b0, cape: 0x9a9080 }
  },
  hermits_rags: {
    slot: 'robe', name: 'THE HERMIT\'S RAGS', rarity: 'legendary', minLevel: 3, stats: { mend: 0.8, steadfast: 0.15, speed: 0.04 },
    text: 'Forty years in a cave, and not one moth would touch them.', look: { robe: 0x6a5a40, mantle: 0x4a3e2a, trim: 0x8a7a5a }
  },
  butchers_apron: {
    slot: 'robe', name: 'THE BUTCHER\'S APRON', rarity: 'legendary', minLevel: 4, stats: { killHeal: 3, leech: 1, maxHp: 15 },
    text: 'Fresh meat, it says on the front, in someone else\'s handwriting.', look: { robe: 0xd8d0c0, mantle: 0x8a1a1a, trim: 0x8a1a1a }
  },
  librarians_gown: {
    slot: 'robe', name: 'THE LIBRARIAN\'S DRESSING GOWN', rarity: 'legendary', minLevel: 5, stats: { xpGain: 0.15, regen: 0.12, maxManergy: 20, speed: -0.04 },
    text: 'Quilted, comfortable, and smelling of old paper and tea.', look: { robe: 0x6a2a3a, mantle: 0x4a1a2a, trim: 0xd8c070 }
  },
  mirrorsilk: {
    slot: 'robe', name: 'MIRRORSILK', rarity: 'legendary', minLevel: 6, stats: { 'cd.image': 0.3, 'cd.shield': 0.2, ward: 0.4 },
    text: 'You can see your face in it, and the orc behind you.', look: { robe: 0xc8d0e0, mantle: 0x8a90a0, trim: 0xffffff, glow: 0xd0d0ff }
  },
  silent_shroud: {
    slot: 'robe', name: 'THE SHROUD OF THE SILENT', rarity: 'legendary', minLevel: 7, stats: { 'power.invis': 0.3, armor: 0.08, steadfast: 0.15 },
    text: 'Worn by an order that took a vow of silence, and of not being found.', look: { robe: 0x24222c, mantle: 0x16141c, trim: 0x6a6a7a, cape: 0x2a2a34 }
  },
  rolling_thunder: {
    slot: 'robe', name: 'ROBE OF ROLLING THUNDER', rarity: 'legendary', minLevel: 8, stats: { 'power.thunder': 0.3, lightningDamage: 0.15, armor: 0.06 },
    text: 'Every step booms. Sneaking is out of the question.', look: { robe: 0x2a3448, mantle: 0x1a2030, trim: 0x80c8ff, cape: 0x3a4a68, glow: 0x80c8ff }
  },
  abbots_cassock: {
    slot: 'robe', name: 'THE ABBOT\'S CASSOCK', rarity: 'legendary', minLevel: 9, stats: { 'power.heal': 0.4, mend: 0.8, potionPower: 0.2 },
    text: 'Black wool, a hundred buttons, and a pocket full of bandages.', look: { robe: 0x16141a, mantle: 0x0a0a0e, trim: 0xd8a838 }
  },
  spider_queen: {
    slot: 'robe', name: 'WEAVE OF THE SPIDER QUEEN', rarity: 'legendary', minLevel: 10, stats: { poisonDamage: 0.2, 'cd.stun': 0.3, armor: 0.08 },
    text: 'Spun by eight hands. Light as air and twice as hard to cut.', look: { robe: 0x1a1a1a, mantle: 0x0a0a0a, trim: 0x80ff40, cape: 0x2a2a2a, glow: 0x60ff30 }
  },
  glacial_bulwark: {
    slot: 'robe', name: 'GLACIAL BULWARK', rarity: 'legendary', minLevel: 11, stats: { 'power.agathys': 0.5, armor: 0.12, maxHp: 30 },
    text: 'More armour than robe, more ice than armour.', look: { robe: 0xa8d0f0, mantle: 0xe8f8ff, trim: 0x5a8ab8, cape: 0xd8e8f0, glow: 0x9ad8ff }
  },
  starcloth: {
    slot: 'robe', name: 'STARCLOTH', rarity: 'legendary', minLevel: 12, stats: { maxManergy: 35, regen: 0.15, radiantDamage: 0.1 },
    text: 'Night sky, by the yard.', look: { robe: 0x0a1030, mantle: 0x060818, trim: 0xfff0c0, cape: 0x1a2050, glow: 0xc0d0ff }
  },
  phoenix_mantle: {
    slot: 'robe', name: 'THE PHOENIX MANTLE', rarity: 'legendary', minLevel: 14, stats: { fireDamage: 0.25, mend: 1, maxHp: 30 },
    text: 'It has burned up twice already, and come back better both times.', look: { robe: 0xc04010, mantle: 0x6a1a08, trim: 0xffd040, cape: 0xff6010, glow: 0xff8020 }
  },
  gravecloth_kings: {
    slot: 'robe', name: 'GRAVECLOTH OF KINGS', rarity: 'legendary', minLevel: 17, stats: { necroticDamage: 0.2, leech: 3, maxHp: 50, armor: 0.1 },
    text: 'Seven kings were buried in it, one after another. It kept getting nicer.', look: { robe: 0x2a0a3a, mantle: 0x16061e, trim: 0xe0b040, cape: 0x4a1a5a, glow: 0xa040ff }
  }

};

for (const id in Gear) {
  Gear[id].id = id;
}

// Sets: the pieces, and the bonuses that pieces worn together add (2 pieces,
// 3 pieces...). Only different pieces count.
export const Sets = {
  wanderer: { name: 'THE WANDERER\'S GARB', bonuses: [[2, { speed: 0.08 }], [3, { xpGain: 0.1, potionPower: 0.25 }]] },
  embercaller: { name: 'THE EMBERCALLER\'S BLAZE', bonuses: [[2, { fireDamage: 0.15 }], [3, { fireballCost: -10, killManergy: 3 }]] },
  priest: { name: 'THE HIGH PRIEST\'S RAIMENT', bonuses: [[2, { mend: 0.8, radiantDamage: 0.1 }], [3, { potionPower: 0.3, maxHp: 30 }]] },
  stormweaver: { name: 'THE STORMWEAVER\'S VESTMENTS', bonuses: [[2, { lightningDamage: 0.15 }], [3, { speed: 0.08, lightningCost: -10 }], [4, { cooldown: 0.08, lightningDamage: 0.2 }]] },
  rimewarden: { name: 'THE RIMEWARDEN\'S BULWARK', bonuses: [[2, { armor: 0.08 }], [3, { coldDamage: 0.25, maxHp: 30, steadfast: 0.15 }]] },
  gravelord: { name: 'THE GRAVELORD\'S SHROUD', bonuses: [[2, { necroticDamage: 0.15 }], [3, { killHeal: 4, leech: 3, maxHp: 25 }]] },
  archmage: { name: 'THE ARCHMAGE\'S REGALIA', bonuses: [[2, { spellDamage: 0.1 }], [3, { costCut: 0.12 }], [4, { cooldown: 0.1, maxManergy: 40 }]] },
  shepherd: { name: 'THE SHEPHERD\'S FLOCK', bonuses: [[2, { 'power.polymorph': 0.3, 'power.sleep': 0.3 }], [3, { maxHp: 25, mend: 0.6, 'cd.sleep': 0.25 }]] },
  twinstars: { name: 'THE TWIN STARS', bonuses: [[2, { spellDamage: 0.12, regen: 0.15, radiantDamage: 0.15 }]] },
  pyromancer: { name: 'THE PYROMANCER\'S CONCLAVE', bonuses: [[2, { fireDamage: 0.15 }], [3, { 'cd.fireball': 0.2, 'power.meteor': 0.25 }], [4, { 'power.fireball': 0.25, 'power.scorch': 0.25, 'power.sphere': 0.25 }]] },
  viper: { name: 'THE VIPER\'S NEST', bonuses: [[2, { poisonDamage: 0.15 }], [3, { 'power.cloud': 0.3, 'cost.cloud': 0.2 }], [4, { killHeal: 3, poisonDamage: 0.2, speed: 0.06 }]] },
  chronomancer: { name: 'THE CHRONOMANCER\'S HOURS', bonuses: [[2, { cooldown: 0.06 }], [3, { 'power.timestop': 0.3, 'power.haste': 0.3 }], [4, { cooldown: 0.06, 'cd.blink': 0.25, speed: 0.06 }]] },
  mindbreaker: { name: 'THE MINDBREAKER\'S TRIAD', bonuses: [[2, { psychicDamage: 0.2 }], [3, { 'power.phantasm': 0.3, 'power.confusion': 0.3, 'cd.fear': 0.3 }]] },
  dragonslayer: { name: 'THE DRAGONSLAYER\'S PANOPLY', bonuses: [[2, { armor: 0.08, maxHp: 30 }], [3, { spellDamage: 0.15, steadfast: 0.2 }], [4, { fireDamage: 0.2, coldDamage: 0.2, lightningDamage: 0.2, poisonDamage: 0.2, necroticDamage: 0.2 }]] }
};
for (const id in Sets) {
  Sets[id].pieces = Object.values(Gear).filter((t) => t.set === id).map((t) => t.id);
}

export const ClassicRings = ['ring_speed', 'ring_manergy', 'ring_fire', 'ring_storms', 'ring_force'];

// Starting kits: the player's apprentice gear and the duel rival's red
// version of it (same properties, so duels stay even).
export const Kits = {
  apprentice: ['pointed_hat', 'apprentice_robe', 'oak_staff'],
  rival: ['crimson_hat', 'crimson_robe', 'blood_staff']
};

// ---------------------------------------------------------------- rolled gear

// Bases: three grades each (found from depth 1, 6 and 12), with a name, a
// built-in property that grows with the grade, and colours per grade.
// `weight` makes a base more (or less) common than the others of its kind.
// A base with `spell` is made for one spell, drawn when the item is found
// (most often one its finder knows): '{S}' in its names stands for the
// spell's name, and its property is that spell's `spell` kind ('power' or
// 'cd'; SpellStats). A ring without a property is never plain.
const GRADE_DEPTHS = [1, 6, 12];

const Bases = {
  hat: [
    { names: ['POINTED HAT', 'CONJURER\'S HAT', 'ARCHON\'S HAT'], stat: 'maxManergy', values: [8, 16, 26], text: 'Tall, pointed, unmistakably a wizard\'s.',
      looks: [{ style: 'pointed', color: 0x2a3a6a, band: 0xa89060 }, { style: 'pointed', color: 0x1a4a3a, band: 0xc0c0c0 }, { style: 'pointed', color: 0x3a1a5a, band: 0xe0b040 }] },
    { names: ['WIDE-BRIMMED HAT', 'RANGER\'S HAT', 'STORMRIDER\'S HAT'], stat: 'speed', values: [0.03, 0.05, 0.07], text: 'It keeps the drips off on the long roads down.',
      looks: [{ style: 'wide', color: 0x5a4a32, band: 0x6a3a1a }, { style: 'wide', color: 0x2a4a2a, band: 0x9a8a5a }, { style: 'wide', color: 0x2a2e40, band: 0xa0b0c8 }] },
    { names: ['COWL', 'SHADOW HOOD', 'NIGHTSHROUD COWL'], stat: 'armor', values: [0.03, 0.05, 0.07], text: 'Deep enough to hide a face and turn a blow.',
      looks: [{ style: 'hood', color: 0x4a4440, band: 0x6a6460 }, { style: 'hood', color: 0x24222c, band: 0x6a40a0 }, { style: 'hood', color: 0x0e0c14, band: 0x4a6aff }] },
    { names: ['MITRE', 'BISHOP\'S MITRE', 'HIEROPHANT\'S MITRE'], stat: 'mend', values: [0.3, 0.6, 1], text: 'Tall and stiff, and oddly soothing.',
      looks: [{ style: 'mitre', color: 0xd8d0c0, band: 0x8a7a5a }, { style: 'mitre', color: 0xf0e8d0, band: 0xd8a838 }, { style: 'mitre', color: 0x8a1a2a, band: 0xffd060 }] },
    { names: ['CIRCLET', 'CORONET', 'DIADEM'], stat: 'regen', values: [0.05, 0.08, 0.12], text: 'A thin band of metal that helps the mind stay clear.',
      looks: [{ style: 'crown', color: 0x8a7a6a, band: 0x8a7a6a }, { style: 'crown', color: 0xc8d0e0, band: 0xc8d0e0 }, { style: 'crown', color: 0xe0b040, band: 0xe0b040 }] },
    { names: ['FEATHERED HAT', 'PLUMED HAT', 'PHOENIX-PLUME HAT'], stat: 'fireDamage', values: [0.05, 0.08, 0.12], text: 'A feather from something that burned, and did not mind.',
      looks: [{ style: 'wide', color: 0x6a3a1a, band: 0xc05020 }, { style: 'wide', color: 0x5a1a10, band: 0xff6020 }, { style: 'wide', color: 0x3a0a08, band: 0xffa030, glow: 0xff6010 }] },
    { names: ['FUR HOOD', 'RIME HOOD', 'GLACIER COWL'], stat: 'coldDamage', values: [0.05, 0.08, 0.12], text: 'Lined with the fur of something that lived in the cold, and liked it.',
      looks: [{ style: 'hood', color: 0x8a7a6a, band: 0xe8e0d0 }, { style: 'hood', color: 0xa8c8e0, band: 0xe8f8ff }, { style: 'hood', color: 0xd8f0ff, band: 0x9ad8ff, glow: 0xbfe8ff }] },
    { names: ['WITCH HAT', 'HEXER\'S HAT', 'COVEN HAT'], stat: 'necroticDamage', values: [0.05, 0.08, 0.12], text: 'Crooked on purpose. Everything a witch owns is.',
      looks: [{ style: 'pointed', color: 0x1a1a1a, band: 0x6a4a8a }, { style: 'pointed', color: 0x16121a, band: 0x8a40ff }, { style: 'pointed', color: 0x0a060e, band: 0xa040ff, glow: 0xa040ff }] },
    { names: ['STARGAZER\'S HAT', 'ASTROLOGER\'S HAT', 'ASTRAL HAT'], stat: 'cooldown', values: [0.02, 0.04, 0.06], text: 'Stars stitched on in the right places, give or take.',
      looks: [{ style: 'pointed', color: 0x1a2a5a, band: 0xc0c0d0, glow: 0xc0d0ff }, { style: 'pointed', color: 0x141a4a, band: 0xe0d080, glow: 0xfff0a0 }, { style: 'pointed', color: 0x0a0a2a, band: 0xe0b040, glow: 0xffffff }] },
    { names: ['IRON CIRCLET', 'RUNED CIRCLET', 'STORM CROWN'], stat: 'lightningDamage', values: [0.05, 0.08, 0.12], text: 'Iron draws the lightning, and the lightning knows who wears it.',
      looks: [{ style: 'crown', color: 0x5a5e66, band: 0x5a5e66 }, { style: 'crown', color: 0x6a7080, band: 0x6a7080, glow: 0xa0e8ff }, { style: 'crown', color: 0x2a2e3a, band: 0x2a2e3a, glow: 0x80c8ff }] },
    { names: ['DREAMER\'S HOOD', 'SEER\'S HOOD', 'ORACLE\'S HOOD'], stat: 'psychicDamage', values: [0.05, 0.08, 0.12], text: 'Deep enough to dream in, even walking.',
      looks: [{ style: 'hood', color: 0x4a3a5a, band: 0xd0a0d0 }, { style: 'hood', color: 0x3a1a4a, band: 0xff80e0 }, { style: 'hood', color: 0x1a0a2a, band: 0xff80e0, glow: 0xff80e0 }] }
  ],
  robe: [
    { names: ['WOOL ROBE', 'SILK ROBE', 'STARWOVEN ROBE'], stat: 'maxHp', values: [8, 16, 28], text: 'Long, loose, and full of pockets.',
      looks: [{ robe: 0x5a4a3a, mantle: 0x3a2e24, trim: 0x8a7a5a }, { robe: 0x2a4a8a, mantle: 0x1a2a5a, trim: 0xc0c0d0 }, { robe: 0x1a1a4a, mantle: 0x0a0a2a, trim: 0xc0d0ff }] },
    { names: ['QUILTED ROBE', 'MAIL-LINED ROBE', 'RUNEPLATE ROBE'], stat: 'armor', values: [0.04, 0.07, 0.1], text: 'Something hard is sewn into the lining.',
      looks: [{ robe: 0x6a5a4a, mantle: 0x4a3a2a, trim: 0x8a8a8a }, { robe: 0x3a3e48, mantle: 0x8a8e96, trim: 0xb0b4bc }, { robe: 0x2a2e38, mantle: 0x5a6070, trim: 0x60b0ff }] },
    { names: ['TRAVELLER\'S CLOAK', 'WAYFARER\'S MANTLE', 'SKYSTRIDER\'S MANTLE'], stat: 'speed', values: [0.03, 0.05, 0.07], text: 'Light enough to run in, warm enough to sleep in.',
      looks: [{ robe: 0x6a6a70, mantle: 0x4a4a50, trim: 0x9a8a6a, cape: 0x5a5a60 }, { robe: 0x3a5a4a, mantle: 0x2a3a30, trim: 0xa0a080, cape: 0x4a6a5a }, { robe: 0x4a6a9a, mantle: 0x2a3a5a, trim: 0xe0f0ff, cape: 0x6a8ac0 }] },
    { names: ['ACOLYTE\'S VESTMENTS', 'CANTOR\'S VESTMENTS', 'ARCHON\'S VESTMENTS'], stat: 'regen', values: [0.05, 0.08, 0.12], text: 'Cut for long hours of quiet study.',
      looks: [{ robe: 0xb8b0a0, mantle: 0x8a8070, trim: 0x6a4a2a }, { robe: 0xe8e0d0, mantle: 0xb0a080, trim: 0xd8a838 }, { robe: 0x5a1a7a, mantle: 0x2a0a4a, trim: 0xe0b040 }] },
    { names: ['PILGRIM\'S HABIT', 'MONK\'S HABIT', 'ASCETIC\'S HABIT'], stat: 'mend', values: [0.2, 0.4, 0.7], text: 'Plain, coarse, and somehow always clean.',
      looks: [{ robe: 0x7a6a50, mantle: 0x5a4a34, trim: 0x8a7a5a }, { robe: 0x5a3a20, mantle: 0x3a2410, trim: 0xa08050 }, { robe: 0xe8e0d0, mantle: 0xb0a080, trim: 0x8a7a5a }] },
    { names: ['BATTLE ROBE', 'WARMAGE\'S COAT', 'SPELLGUARD COAT'], stat: 'ward', values: [0.12, 0.2, 0.3], text: 'Cut short for running, with a high collar against the sparks.',
      looks: [{ robe: 0x5a2a2a, mantle: 0x3a1a1a, trim: 0xa08060 }, { robe: 0x2a3a5a, mantle: 0x8a8e96, trim: 0x60b0ff }, { robe: 0x1a2a4a, mantle: 0xc8d0e0, trim: 0x60b0ff, cape: 0x2a4a8a, glow: 0x60b0ff }] },
    { names: ['ALCHEMIST\'S SMOCK', 'APOTHECARY\'S COAT', 'TRANSMUTER\'S COAT'], stat: 'potionPower', values: [0.1, 0.18, 0.28], text: 'Stained, singed, and full of little bottles.',
      looks: [{ robe: 0x8a8a6a, mantle: 0x5a5a40, trim: 0xff70a0 }, { robe: 0x3a5a3a, mantle: 0x2a3a2a, trim: 0xff70a0 }, { robe: 0x5a2a5a, mantle: 0x3a1a3a, trim: 0xffd040, cape: 0x6a3a6a }] },
    { names: ['HIDE ROBE', 'BEARSKIN MANTLE', 'WYRMSCALE MANTLE'], stat: 'steadfast', values: [0.08, 0.12, 0.18], text: 'Heavy enough that nothing knocks you off your feet.',
      looks: [{ robe: 0x6a4a2a, mantle: 0x4a3018, trim: 0x8a6a42, cape: 0x5a3a20 }, { robe: 0x4a3020, mantle: 0x2a1a10, trim: 0x8a6a42, cape: 0x3a2414 }, { robe: 0x2a4a3a, mantle: 0x1a3028, trim: 0xd8a838, cape: 0x3a6a4a }] },
    { names: ['VELVET ROBE', 'ROYAL ROBE', 'EMPEROR\'S ROBE'], stat: 'magicFind', values: [0.06, 0.1, 0.15], text: 'Too fine for a dungeon, which is exactly why treasure likes it.',
      looks: [{ robe: 0x6a1a3a, mantle: 0x4a0a2a, trim: 0xc0a060 }, { robe: 0x3a1a6a, mantle: 0xc8c0b0, trim: 0xe0b040 }, { robe: 0x8a1a1a, mantle: 0xf0f0f0, trim: 0xffd040, cape: 0x8a1a1a }] }
  ],
  staff: [
    { names: ['ASH STAFF', 'YEW STAFF', 'ELDERWOOD STAFF'], stat: 'missileDamage', values: [4, 8, 14], text: 'A straight branch and a glass bead.',
      looks: [{ style: 'orb', wood: 0x6a4a2a, gem: 0x9fd8ff }, { style: 'orb', wood: 0x4a2a14, gem: 0x80c0ff }, { style: 'orb', wood: 0x2a1a10, gem: 0xc0a0ff }] },
    { names: ['CRYSTAL ROD', 'PRISM STAFF', 'STARSHARD STAFF'], stat: 'regen', values: [0.06, 0.1, 0.15], text: 'The crystal hums as manergy returns.',
      looks: [{ style: 'crystal', wood: 0x6a6a7a, gem: 0x60f0ff }, { style: 'crystal', wood: 0x8a8aa0, gem: 0xd0a0ff }, { style: 'crystal', wood: 0xc0c8e0, gem: 0xffffff }] },
    { names: ['FORKED STAFF', 'STORM FORK', 'TEMPEST FORK'], stat: 'cooldown', values: [0.03, 0.05, 0.08], text: 'Two prongs, and something always flickering between.',
      looks: [{ style: 'fork', wood: 0x5a4a3a, gem: 0xd0e0ff }, { style: 'fork', wood: 0x4a4e5a, gem: 0xa0e8ff }, { style: 'fork', wood: 0x2a2e3a, gem: 0x80a0ff }] },
    { names: ['BONE WAND', 'GRAVE STAFF', 'LICH STAFF'], stat: 'leech', values: [1, 2, 3], text: 'Somebody\'s, once.',
      looks: [{ style: 'skull', wood: 0xd8d0b0, gem: 0xb0ff90 }, { style: 'skull', wood: 0xa8a090, gem: 0x80ff60 }, { style: 'skull', wood: 0x5a5048, gem: 0x60ffb0 }] },
    { names: ['SUN ROD', 'SOLAR STAFF', 'DAWNSTAR'], stat: 'spellDamage', values: [0.04, 0.07, 0.1], text: 'Warm on the coldest floor.',
      looks: [{ style: 'sun', wood: 0xa08050, gem: 0xffd080 }, { style: 'sun', wood: 0xc0a060, gem: 0xffe080 }, { style: 'sun', wood: 0xe0c070, gem: 0xfff0c0 }] },
    { names: ['CRESCENT STAFF', 'MOON STAFF', 'ECLIPSE STAFF'], stat: 'coldDamage', values: [0.06, 0.1, 0.15], text: 'A sickle moon on a pole, as cold as the night it came from.',
      looks: [{ style: 'moon', wood: 0x8a8a9a, gem: 0xd8f0ff }, { style: 'moon', wood: 0xa8b0c0, gem: 0x9ad8ff }, { style: 'moon', wood: 0x2a2a3a, gem: 0xe8f8ff }] },
    { names: ['CAGED ORB', 'WARDEN\'S CAGE', 'PRISON OF STARS'], stat: 'costCut', values: [0.03, 0.05, 0.08], text: 'Something bright is kept in it, and made to work.',
      looks: [{ style: 'cage', wood: 0x5a4a3a, gem: 0xffe080 }, { style: 'cage', wood: 0x8a8e96, gem: 0x60f0ff }, { style: 'cage', wood: 0xe0b040, gem: 0xffffff }] },
    { names: ['ANTLER STAFF', 'STAG STAFF', 'WILDHEART STAFF'], stat: 'poisonDamage', values: [0.06, 0.1, 0.15], text: 'Shed in the deep woods by something with a great many points.',
      looks: [{ style: 'antler', wood: 0x8a7050, gem: 0xb0ff90 }, { style: 'antler', wood: 0x6a5030, gem: 0x80ff40 }, { style: 'antler', wood: 0x3a2a14, gem: 0x40ff80 }] },
    { names: ['SERPENT STAFF', 'VIPER STAFF', 'WYRM STAFF'], stat: 'fireDamage', values: [0.06, 0.1, 0.15], text: 'Carved as a snake about to strike, its eye a burning bead.',
      looks: [{ style: 'serpent', wood: 0x6a4a2a, gem: 0xffa040 }, { style: 'serpent', wood: 0x5a2a14, gem: 0xff6020 }, { style: 'serpent', wood: 0x2a0a08, gem: 0xff3010 }] },
    { names: ['IRON ROD', 'STEEL ROD', 'RUNESTEEL ROD'], stat: 'ironDamage', values: [0.08, 0.13, 0.2], text: 'Cold iron, heavy in the hand and heavier on the head.',
      looks: [{ style: 'orb', wood: 0x5a5e66, gem: 0xb0b4bc }, { style: 'orb', wood: 0x8a8e96, gem: 0xd0d8e0 }, { style: 'orb', wood: 0x3a3e48, gem: 0x60b0ff }] },
    { names: ['COPPER STAFF', 'STORMGLASS STAFF', 'SKYFIRE STAFF'], stat: 'lightningDamage', values: [0.06, 0.1, 0.15], text: 'It makes your hair stand up, which is how you know it works.',
      looks: [{ style: 'fork', wood: 0xa06030, gem: 0xd0f0ff }, { style: 'crystal', wood: 0x6a7080, gem: 0xa0e8ff }, { style: 'fork', wood: 0x2a2e3a, gem: 0x80c8ff }] },
    { names: ['HEXWOOD STAFF', 'WITCHWOOD STAFF', 'NIGHTWOOD STAFF'], stat: 'necroticDamage', values: [0.06, 0.1, 0.15], text: 'Cut at midnight from a tree nobody planted.',
      looks: [{ style: 'moon', wood: 0x3a2a3a, gem: 0xb080ff }, { style: 'moon', wood: 0x2a1a2a, gem: 0x8a40ff }, { style: 'moon', wood: 0x100a14, gem: 0xa040ff }] },
    { names: ['PILGRIM\'S STAFF', 'TEMPLAR\'S STAFF', 'SERAPH\'S STAFF'], stat: 'radiantDamage', values: [0.06, 0.1, 0.15], text: 'It walked many miles toward the light, and brought some back.',
      looks: [{ style: 'sun', wood: 0x8a7050, gem: 0xfff0c0 }, { style: 'sun', wood: 0xd8d0b0, gem: 0xffe080 }, { style: 'sun', wood: 0xf0e8d0, gem: 0xffffff }] },
    { names: ['DREAMWOOD STAFF', 'MINDGLASS STAFF', 'PSYCHE STAFF'], stat: 'psychicDamage', values: [0.06, 0.1, 0.15], text: 'Lean on it and you hear what the orcs are thinking. Mostly about lunch.',
      looks: [{ style: 'cage', wood: 0x6a5a7a, gem: 0xd0a0d0 }, { style: 'cage', wood: 0xc8d0e0, gem: 0xff80e0 }, { style: 'antler', wood: 0x2a1a3a, gem: 0xff80e0 }] },
    { names: ['{S} WAND', '{S} ROD', '{S} SCEPTRE'], spell: 'power', values: [0.15, 0.25, 0.35], weight: 3, text: 'Made for one spell, and impatient with all the others.',
      looks: [{ style: 'orb', wood: 0x6a4a2a, gem: 0xffffff }, { style: 'crystal', wood: 0x8a8aa0, gem: 0xffffff }, { style: 'sun', wood: 0xe0c070, gem: 0xffffff }] }
  ],
  ring: [
    { names: ['COPPER RING', 'SILVER RING', 'GOLD RING'], stat: null, values: [0, 0, 0], weight: 2, text: 'A plain band, waiting for a spell to hold.',
      looks: [{ band: 0xc07040, gem: 0xd0d0d0 }, { band: 0xc8d0e0, gem: 0xd0d0d0 }, { band: 0xffc840, gem: 0xd0d0d0 }] },
    { names: ['GARNET RING', 'RUBY RING', 'STAR RUBY RING'], stat: 'fireDamage', values: [0.04, 0.07, 0.1], text: 'A red stone, warm as a coal.',
      looks: [{ band: 0xc07040, gem: 0xa02020 }, { band: 0xc8d0e0, gem: 0xff2020 }, { band: 0xffc840, gem: 0xff4010, style: 'twin' }] },
    { names: ['AQUAMARINE RING', 'SAPPHIRE RING', 'STAR SAPPHIRE RING'], stat: 'coldDamage', values: [0.04, 0.07, 0.1], text: 'A blue stone with frost in its heart.',
      looks: [{ band: 0xc8d0e0, gem: 0x80d0e0 }, { band: 0xc8d0e0, gem: 0x3060ff }, { band: 0xe8f8ff, gem: 0x9ad8ff, style: 'twin' }] },
    { names: ['CITRINE RING', 'TOPAZ RING', 'STORM TOPAZ RING'], stat: 'lightningDamage', values: [0.04, 0.07, 0.1], text: 'Hold it up to the light and the light flickers.',
      looks: [{ band: 0xc07040, gem: 0xffe070 }, { band: 0xffc840, gem: 0xffb020 }, { band: 0xc8d0e0, gem: 0xa0e8ff, style: 'twin' }] },
    { names: ['JADE RING', 'EMERALD RING', 'VIPER EMERALD RING'], stat: 'poisonDamage', values: [0.04, 0.07, 0.1], text: 'Green as a viper, and about as friendly.',
      looks: [{ band: 0xc07040, gem: 0x40a060 }, { band: 0xffc840, gem: 0x20e060 }, { band: 0x3a5a2a, gem: 0x80ff40, style: 'twin' }] },
    { names: ['JET RING', 'ONYX RING', 'BLACK DIAMOND RING'], stat: 'necroticDamage', values: [0.04, 0.07, 0.1], text: 'A dark stone that drinks the lamplight.',
      looks: [{ band: 0x6a6e76, gem: 0x3a2a4a }, { band: 0xc8d0e0, gem: 0x6a3a9a }, { band: 0x16121a, gem: 0xa040ff, style: 'twin' }] },
    { names: ['PEARL RING', 'SUNSTONE RING', 'DAWN DIAMOND RING'], stat: 'radiantDamage', values: [0.04, 0.07, 0.1], text: 'It glows softly in the dark, as if it remembered the sun.',
      looks: [{ band: 0xc8d0e0, gem: 0xf0f0e8 }, { band: 0xffc840, gem: 0xffd080 }, { band: 0xffc840, gem: 0xfff0c0, style: 'twin' }] },
    { names: ['AMETHYST RING', 'SPINEL RING', 'VOID SPINEL RING'], stat: 'forceDamage', values: [0.04, 0.07, 0.1], text: 'A violet stone that pushes back when pressed.',
      looks: [{ band: 0xc8d0e0, gem: 0x9a60d0 }, { band: 0xffc840, gem: 0xc070ff }, { band: 0x2a2a3a, gem: 0xd080ff, style: 'twin' }] },
    { names: ['QUARTZ RING', 'MINDSTONE RING', 'DREAMSTONE RING'], stat: 'psychicDamage', values: [0.04, 0.07, 0.1], text: 'Stare into it long enough and it stares back.',
      looks: [{ band: 0xc8d0e0, gem: 0xf0d0f0 }, { band: 0xc8d0e0, gem: 0xff80e0 }, { band: 0x3a1a4a, gem: 0xff80e0, style: 'twin' }] },
    { names: ['IRON BAND', 'STEEL BAND', 'MITHRIL BAND'], stat: 'armor', values: [0.02, 0.03, 0.05], text: 'No stone, no spell, just a stubborn bit of metal.',
      looks: [{ band: 0x6a6e76, gem: 0x8a8e96, style: 'band' }, { band: 0xa0a4ac, gem: 0xc0c4cc, style: 'band' }, { band: 0xe0e8f0, gem: 0xe8f8ff, style: 'band' }] },
    { names: ['MOONSTONE RING', 'OPAL RING', 'BLACK OPAL RING'], stat: 'regen', values: [0.04, 0.06, 0.09], text: 'Its stone shifts colour as your manergy returns.',
      looks: [{ band: 0xc8d0e0, gem: 0xd8e8ff }, { band: 0xc8d0e0, gem: 0x80f0e0 }, { band: 0x2a2a3a, gem: 0x40c0ff, style: 'twin' }] },
    { names: ['BONE RING', 'IVORY RING', 'DRAGONBONE RING'], stat: 'killHeal', values: [1, 2, 3], text: 'Carved from what was left of the last one who wore it.',
      looks: [{ band: 0xd8d0b0, gem: 0xd8d0b0, style: 'band' }, { band: 0xf0e8d0, gem: 0xfff0e0, style: 'band' }, { band: 0xe8e0c8, gem: 0xff3020, style: 'signet' }] },
    { names: ['CORAL RING', 'BLOODSTONE RING', 'HEARTSTONE RING'], stat: 'maxHp', values: [5, 10, 16], text: 'A red stone that beats, faintly, with your pulse.',
      looks: [{ band: 0xc8d0e0, gem: 0xff8070 }, { band: 0x6a6e76, gem: 0xc01030 }, { band: 0xffc840, gem: 0xff3050, style: 'twin' }] },
    { names: ['TWIN-STONE RING', 'DOUBLE BAND', 'GEMINI RING'], stat: 'maxManergy', values: [5, 10, 16], text: 'Two stones, and twice the room for manergy between them.',
      looks: [{ band: 0xc07040, gem: 0x6080ff, style: 'twin' }, { band: 0xc8d0e0, gem: 0x4080ff, style: 'twin' }, { band: 0xffc840, gem: 0x80a0ff, style: 'twin' }] },
    { names: ['TIN SIGNET', 'GILT SIGNET', 'MERCHANT PRINCE\'S SIGNET'], stat: 'magicFind', values: [0.05, 0.08, 0.12], text: 'Its seal opens doors, and chests.',
      looks: [{ band: 0x9a9aa0, gem: 0xc0c0c0, style: 'signet' }, { band: 0xffc840, gem: 0xffd040, style: 'signet' }, { band: 0xffc840, gem: 0x40ff80, style: 'signet' }] },
    { names: ['{S} BAND', '{S} SIGNET', '{S} SEAL'], spell: 'cd', values: [0.1, 0.15, 0.2], weight: 2, text: 'Its stone is cut for one spell, and hurries it along.',
      looks: [{ band: 0xc07040, gem: 0xffffff }, { band: 0xc8d0e0, gem: 0xffffff, style: 'signet' }, { band: 0xffc840, gem: 0xffffff, style: 'signet' }] }
  ]
};

// Affixes, Diablo style. Each family is one property in grades: [name,
// shallowest floor, lowest value, highest value]. A rolled item takes at
// most one family per property. The `spell` family is made for one spell
// (rollSpellAffix): it is found more often on staffs and rings
// (SPELL_AFFIX_WEIGHT), and an item takes at most two of them.
const ALL = KINDS;
const Prefixes = [
  { stat: 'maxManergy', kinds: ALL, grades: [['LAPIS', 1, 5, 10], ['COBALT', 4, 11, 18], ['SAPPHIRE', 8, 19, 28], ['AZURE', 13, 29, 40]] },
  { stat: 'armor', kinds: ['hat', 'robe', 'ring'], grades: [['STURDY', 1, 0.03, 0.05], ['WARDED', 5, 0.06, 0.08], ['ADAMANT', 11, 0.09, 0.12]] },
  { stat: 'spellDamage', kinds: ['staff', 'hat', 'ring'], grades: [['POTENT', 2, 0.04, 0.07], ['MYSTIC', 7, 0.08, 0.12], ['ELDRITCH', 13, 0.13, 0.18]] },
  { stat: 'fireDamage', kinds: ['staff', 'hat', 'ring'], grades: [['SMOULDERING', 1, 0.06, 0.1], ['BLAZING', 5, 0.11, 0.18], ['INFERNAL', 11, 0.19, 0.28]] },
  { stat: 'coldDamage', kinds: ['staff', 'hat', 'ring'], grades: [['CHILLING', 1, 0.06, 0.1], ['GLACIAL', 5, 0.11, 0.18], ['WINTERBORN', 11, 0.19, 0.28]] },
  { stat: 'lightningDamage', kinds: ['staff', 'hat', 'ring'], grades: [['SPARKING', 1, 0.06, 0.1], ['ARCING', 5, 0.11, 0.18], ['THUNDERING', 11, 0.19, 0.28]] },
  { stat: 'poisonDamage', kinds: ['staff', 'hat', 'ring'], grades: [['VENOMOUS', 3, 0.06, 0.1], ['TOXIC', 6, 0.11, 0.18], ['PESTILENT', 12, 0.19, 0.28]] },
  { stat: 'necroticDamage', kinds: ['staff', 'hat', 'ring'], grades: [['GRIM', 3, 0.06, 0.1], ['DEATHLY', 6, 0.11, 0.18], ['SOULREAVING', 12, 0.19, 0.28]] },
  { stat: 'radiantDamage', kinds: ['staff', 'hat', 'ring'], grades: [['GLEAMING', 3, 0.06, 0.1], ['HALLOWED', 6, 0.11, 0.18], ['SERAPHIC', 12, 0.19, 0.28]] },
  { stat: 'psychicDamage', kinds: ['staff', 'hat', 'ring'], grades: [['DREAMING', 3, 0.06, 0.1], ['MADDENING', 6, 0.11, 0.18], ['MINDSHATTERING', 12, 0.19, 0.28]] },
  { stat: 'forceDamage', kinds: ['staff', 'ring'], grades: [['FORCEFUL', 1, 0.06, 0.1], ['CRUSHING', 5, 0.11, 0.18], ['ANNIHILATING', 11, 0.19, 0.28]] },
  { stat: 'ironDamage', kinds: ['staff', 'ring'], grades: [['HEAVY', 2, 0.08, 0.14], ['LEADEN', 6, 0.15, 0.24], ['IRONCLAD', 12, 0.25, 0.35]] },
  { stat: 'missileDamage', kinds: ['staff', 'ring'], grades: [['KEEN', 1, 3, 6], ['DEADLY', 5, 7, 12], ['VICIOUS', 11, 13, 20]] },
  { stat: 'costCut', kinds: ALL, grades: [['FRUGAL', 3, 0.04, 0.07], ['THRIFTY', 8, 0.08, 0.12], ['MISERLY', 14, 0.13, 0.18]] },
  { stat: 'cooldown', kinds: ['hat', 'staff', 'ring'], grades: [['QUICKENED', 4, 0.03, 0.05], ['HASTENED', 9, 0.06, 0.08], ['TIMELESS', 15, 0.09, 0.12]] },
  { stat: 'ward', kinds: ['hat', 'robe', 'ring'], grades: [['GUARDING', 2, 0.15, 0.25], ['SENTINEL', 7, 0.26, 0.4], ['AEGIS', 13, 0.41, 0.6]] },
  { stat: 'steadfast', kinds: ['hat', 'robe', 'ring'], grades: [['STEADFAST', 3, 0.1, 0.15], ['UNYIELDING', 8, 0.16, 0.25], ['IMMOVABLE', 14, 0.26, 0.35]] },
  { stat: 'magicFind', kinds: ['hat', 'ring'], grades: [['LUCKY', 2, 0.08, 0.15], ['FORTUNATE', 8, 0.16, 0.25]] }
];
const Suffixes = [
  { stat: 'maxHp', kinds: ALL, grades: [['OF THE JACKAL', 1, 5, 10], ['OF THE FOX', 3, 11, 18], ['OF THE WOLF', 6, 19, 28], ['OF THE TIGER', 10, 29, 40], ['OF THE MAMMOTH', 15, 41, 55]] },
  { stat: 'regen', kinds: ALL, grades: [['OF CLARITY', 1, 0.05, 0.08], ['OF MEDITATION', 5, 0.09, 0.14], ['OF THE SAGE', 11, 0.15, 0.22]] },
  { stat: 'speed', kinds: ['hat', 'robe', 'ring'], grades: [['OF PACING', 1, 0.03, 0.05], ['OF HASTE', 6, 0.06, 0.09], ['OF THE WIND', 12, 0.1, 0.14]] },
  { stat: 'mend', kinds: ['hat', 'robe', 'ring'], grades: [['OF REGENERATION', 2, 0.2, 0.4], ['OF REGROWTH', 7, 0.5, 0.8], ['OF THE TROLL', 13, 0.9, 1.3]] },
  { stat: 'leech', kinds: ['staff', 'robe', 'ring'], grades: [['OF THE LEECH', 2, 1, 1], ['OF THE BAT', 7, 2, 2], ['OF THE VAMPIRE', 13, 3, 4]] },
  { stat: 'armor', kinds: ['hat', 'robe'], grades: [['OF DEFLECTION', 2, 0.03, 0.05], ['OF THE BASTION', 9, 0.06, 0.09]] },
  { stat: 'xpGain', kinds: ['hat', 'ring'], grades: [['OF LEARNING', 1, 0.05, 0.08], ['OF WISDOM', 6, 0.09, 0.14], ['OF THE ARCHIVIST', 12, 0.15, 0.2]] },
  { stat: 'potionPower', kinds: ['robe', 'ring'], grades: [['OF TONICS', 1, 0.1, 0.2], ['OF THE ALCHEMIST', 7, 0.21, 0.35]] },
  { stat: 'magicFind', kinds: ['hat', 'robe', 'ring'], grades: [['OF LUCK', 1, 0.08, 0.15], ['OF FORTUNE', 6, 0.16, 0.25], ['OF GREED', 12, 0.26, 0.4]] },
  { stat: 'killHeal', kinds: ['staff', 'robe', 'ring'], grades: [['OF THE RAVEN', 2, 1, 2], ['OF THE VULTURE', 7, 3, 4], ['OF THE CARRION KING', 13, 5, 7]] },
  { stat: 'killManergy', kinds: ['staff', 'hat', 'ring'], grades: [['OF SIPHONING', 2, 1, 2], ['OF DEVOURING', 7, 3, 4], ['OF THE SOULEATER', 13, 5, 7]] },
  { stat: 'fireballCost', kinds: ['staff', 'ring'], grades: [['OF KINDLING', 3, -5, -5], ['OF THE PYRE', 9, -10, -8]] },
  { stat: 'lightningCost', kinds: ['staff', 'ring'], grades: [['OF STATIC', 3, -5, -5], ['OF THE STORM', 9, -10, -8]] },
  { spell: true, kinds: ALL, grades: [['OF {S}', 1]] }
];

// The spell family: how often it comes up against any one other family on
// each kind of item, its name for each spell ('OF FIREBALLS'), and its
// grades by depth for each of its properties (SpellStats), weighted.
const SPELL_AFFIX_WEIGHT = { staff: 4, ring: 4, hat: 2, robe: 1.5 };
const SPELL_WORDS = {
  fireball: 'FIREBALLS', lightning: 'CHAIN LIGHTNING', ironshot: 'IRON SHOT', blink: 'BLINKING', timestop: 'STOPPED CLOCKS',
  haste: 'HURRYING', image: 'MIRRORS', stun: 'ROOTS', shield: 'THE BUBBLE', blizzard: 'BLIZZARDS', ray: 'THE RED THREAD',
  invis: 'VANISHING', fear: 'DREAD', pwkill: 'THE FINAL WORD', tele: 'THE LONG REACH', scorch: 'SCORCHING', cone: 'THE NORTH WIND',
  thunder: 'THUNDERCLAPS', meteor: 'FALLING STARS', guardians: 'THE WATCHFUL DEAD', cloud: 'MIASMA', heal: 'KIND WORDS',
  polymorph: 'THE SHEPHERD', disintegrate: 'UNMAKING', weapon: 'THE SPECTRAL BLADE', sleep: 'SLUMBER', agathys: 'AGATHYS',
  curse: 'MALEDICTION', sphere: 'ROLLING FIRE', counter: 'NEGATION', swap: 'TRANSPOSITION', phantasm: 'NIGHTMARES',
  confusion: 'BEWILDERMENT', maelstrom: 'THE WHIRLPOOL', gravity: 'UPHEAVAL'
};
const SpellAffix = {
  power: { weight: 3, grades: [[1, 0.12, 0.2], [6, 0.21, 0.32], [12, 0.33, 0.45]] },
  cd: { weight: 2, grades: [[1, 0.08, 0.12], [6, 0.13, 0.19], [12, 0.2, 0.26]] },
  cost: { weight: 1.5, grades: [[1, 0.1, 0.15], [6, 0.16, 0.24], [12, 0.25, 0.32]] }
};

// Rare names: a word of dread and a word for the kind of item.
const RARE_FIRST = ['DOOM', 'GLOOM', 'STORM', 'DREAD', 'GHOUL', 'BLOOD', 'SOUL', 'VIPER', 'RAVEN', 'WRAITH', 'BONE', 'STAR',
  'GRIM', 'HAVOC', 'PLAGUE', 'SHADOW', 'RUNE', 'ENTROPY', 'SPIRIT', 'CORPSE', 'EAGLE', 'DRAGON', 'HAIL', 'VORTEX', 'BEAST',
  'PAIN', 'LOATH', 'CHAOS', 'FIEND', 'HOLLOW', 'ASH', 'VOID', 'WYRM', 'GRAVE', 'EMBER', 'FROST', 'THUNDER', 'MIND', 'OMEN', 'WITCH',
  'MOON', 'SUN', 'DUSK', 'DAWN', 'HEX', 'BANE', 'SCORN', 'WAR', 'GHOST', 'NIGHT', 'IRON', 'GLOAM', 'SPELL', 'CINDER'];
const RARE_SECOND = {
  hat: ['VISAGE', 'HOOD', 'CROWN', 'COWL', 'SHROUD', 'HORN', 'CIRCLET', 'GAZE', 'MASK', 'BROW', 'PEAK', 'VEIL', 'DOME', 'SPIRE'],
  robe: ['SHROUD', 'MANTLE', 'WRAP', 'SHELL', 'CLOAK', 'HIDE', 'WEAVE', 'GARB', 'COAT', 'PALL', 'SKIN', 'HARNESS', 'HABIT', 'WINGS'],
  staff: ['SPIRE', 'BRANCH', 'WAND', 'CALL', 'SONG', 'SPIKE', 'BRAND', 'CHANT', 'ROD', 'SCEPTRE', 'BOUGH', 'FANG', 'STAVE', 'GOAD', 'WHISPER', 'THORN'],
  ring: ['COIL', 'LOOP', 'BAND', 'GYRE', 'KNOT', 'SPIRAL', 'EYE', 'CIRCLE', 'NOOSE', 'HOOP', 'WHORL', 'TWIST', 'SEAL', 'CLASP', 'HALO', 'TALON']
};

function pick(list) {
  return list[Math.floor(Math.random() * list.length)];
}

// One of `list`, each as likely as `weight(item)` says.
function pickWeighted(list, weight) {
  const weights = list.map(weight);
  let roll = Math.random() * weights.reduce((a, b) => a + b, 0);
  for (let i = 0; i < list.length; i++) {
    roll -= weights[i];
    if (roll < 0) {
      return list[i];
    }
  }
  return list[list.length - 1];
}

function gradeOf(depth) {
  let grade = 0;
  for (let i = 0; i < GRADE_DEPTHS.length; i++) {
    if (depth >= GRADE_DEPTHS[i]) {
      grade = i;
    }
  }
  return grade;
}

// A value between a grade's bounds, rounded as its property is shown
// (whole numbers stay whole).
function rollValue(stat, lo, hi) {
  const v = lo + Math.random() * (hi - lo);
  if (Stats[stat].pct) {
    return Math.round(v * 100) / 100;
  }
  return Number.isInteger(lo) && Number.isInteger(hi) ? Math.round(v) : Math.round(v * 10) / 10;
}

// A spell for gear made for one (`kind` of property: 'power', 'cd' or
// 'cost'): seven times in ten one its finder knows (`spells`), else any.
function pickSpell(kind, spells) {
  const able = SpellStats[kind];
  const known = spells ? spells.filter((id) => able.includes(id)) : [];
  return known.length && Math.random() < 0.7 ? pick(known) : pick(able);
}

function spellCount(taken) {
  let n = 0;
  for (const key of taken) {
    if (statSpell(key)) {
      n++;
    }
  }
  return n;
}

// One affix of the spell family: a spell, one of its properties and a grade
// the depth allows.
function rollSpellAffix(depth, taken, spells) {
  for (let tries = 0; tries < 8; tries++) {
    const kind = pickWeighted(Object.keys(SpellAffix), (k) => SpellAffix[k].weight);
    const id = pickSpell(kind, spells);
    const stat = kind + '.' + id;
    if (taken.has(stat)) {
      continue;
    }
    taken.add(stat);
    const grades = SpellAffix[kind].grades.filter((g) => g[0] <= depth);
    const grade = Math.random() < 0.5 ? grades[grades.length - 1] : pick(grades);
    return { name: 'OF ' + SPELL_WORDS[id], stat, value: rollValue(stat, grade[1], grade[2]) };
  }
  return null;
}

// One affix of `families` for a kind of item found at `depth`, avoiding the
// properties in `taken`: the best grade the depth allows half the time,
// otherwise any lower one.
function rollAffix(families, kind, depth, taken, spells) {
  const open = families.filter((f) => f.kinds.includes(kind) && f.grades[0][1] <= depth &&
    (f.spell ? spellCount(taken) < 2 : !taken.has(f.stat)));
  if (!open.length) {
    return null;
  }
  const family = pickWeighted(open, (f) => (f.spell ? SPELL_AFFIX_WEIGHT[kind] : 1));
  if (family.spell) {
    return rollSpellAffix(depth, taken, spells);
  }
  const grades = family.grades.filter((g) => g[1] <= depth);
  const grade = Math.random() < 0.5 ? grades[grades.length - 1] : pick(grades);
  taken.add(family.stat);
  return { name: grade[0], stat: family.stat, value: rollValue(family.stat, grade[2], grade[3]) };
}

// How the drops go (game.js rollOrcLoot, orc.js rollGear, the Ring loot,
// mini-bosses, dragons and the warlord). Chances are per slain foe, or per
// spawned one for what it wears; `perFloor` is added for each floor down.
//   drop      an orc drops a piece of gear (a champion `champion`, never
//             plainer than magic): a little less likely deeper down, where
//             orcs crowd the floors; the finder's magic find makes it a
//             little more likely (half its value)
//   wear      orc casters wear a hat or robe, champions a ring or robe, and
//             any orc deep enough may have found a ring (all dropped)
//   kinds     how often each kind of item is rolled
//   ringLuck  a ring laid on the floor or left by a boss: how much more
//             often it is a set piece or unique (rollRarity `luck`)
//   treasure  a mini-boss's or dragon's treasure: `luck` likewise
//   miniBoss  chance an orc cleric or mage leaves a treasure (a mage also
//             drops the rare hat it wears)
//   hoard     a dragon's treasures by its age: a chance of one for the
//             young, one or more and never plainer than rare for the old
//             (a fraction is the chance of one more)
export const LootRules = {
  drop: { base: 0.07, perFloor: -0.002, champion: 0.03 },
  wear: { caster: 0.03, casterPerFloor: 0.001, champion: 0.04, ringPerFloor: 0.0012 },
  kinds: { hat: 1, robe: 1, staff: 1.6, ring: 1 },
  ringLuck: 1.5,
  treasureLuck: 1.2,
  miniBoss: 0.5,
  hoard: { wyrmling: 0.25, young: 0.5, adult: 0.75, ancient: 1, great: 3 }
};

// The rarity of a roll. Deeper floors favour the finer ones (by their
// `grow`), plain gear grows rarer, and magic find and `luck` favour them
// too (luck only the set pieces and uniques).
function rollRarity(depth, minRarity, magicFind, luck = 1) {
  const floor = minRarity ? Rarities[minRarity].tier : 0;
  return pickWeighted(RARITY_ORDER, (id) => {
    const r = Rarities[id];
    if (r.tier < floor) {
      return 0;
    }
    if (r.tier === 0) {
      return r.weight * Math.max(0.4, 1 - depth * 0.03);
    }
    return r.weight * Math.pow(1 + depth * 0.07, r.grow) * (1 + magicFind) * (r.tier >= 3 ? luck : 1);
  });
}

// The spell names in a base's names: the spell's own, shortened where the
// whole would not fit on a tag.
const SPELL_SHORT = { pwkill: 'DEATHWORD', agathys: 'AGATHYS', guardians: 'GUARDIAN', weapon: 'SPIRIT BLADE', gravity: 'GRAVITY', disintegrate: 'DISINTEGRATION', phantasm: 'PHANTASM', lightning: 'LIGHTNING' };

// A rolled item of `kind` found at `depth`: its base, affixes, name and look.
function rollItem(kind, depth, rarity, spells) {
  const base = pickWeighted(Bases[kind], (b) => b.weight || 1);
  const grade = gradeOf(depth);
  let baseName = base.names[grade];
  const stats = {};
  const taken = new Set();
  let spellTint = null;
  if (base.spell) {
    const id = pickSpell(base.spell, spells);
    const stat = base.spell + '.' + id;
    stats[stat] = base.values[grade];
    taken.add(stat);
    baseName = baseName.replace('{S}', SPELL_SHORT[id] || SpellById[id].name);
    spellTint = SPELL_TINTS[id];
  } else if (base.stat) {
    stats[base.stat] = base.values[grade];
  }
  // a ring with nothing of its own is never plain
  if (kind === 'ring' && rarity === 'common' && !base.stat && !base.spell) {
    rarity = 'magic';
  }
  const affixes = [];
  let prefix = null;
  let suffix = null;
  if (rarity === 'magic') {
    const roll = Math.random();
    if (roll < 0.7) {
      prefix = rollAffix(Prefixes, kind, depth, taken, spells);
    }
    if (roll >= 0.4 || !prefix) {
      suffix = rollAffix(Suffixes, kind, depth, taken, spells);
    }
    affixes.push(...[prefix, suffix].filter(Boolean));
  } else if (rarity === 'rare') {
    const count = 3 + Math.floor(Math.random() * (depth >= 8 ? 3 : 2));
    let prefixes = 0;
    let suffixes = 0;
    for (let i = 0; i < count; i++) {
      const asPrefix = suffixes >= 3 || (prefixes < 3 && Math.random() < 0.5);
      const affix = rollAffix(asPrefix ? Prefixes : Suffixes, kind, depth, taken, spells);
      if (affix) {
        affixes.push(affix);
        if (asPrefix) {
          prefixes++;
        } else {
          suffixes++;
        }
      }
    }
  }
  for (const a of affixes) {
    stats[a.stat] = Math.round(((stats[a.stat] || 0) + a.value) * 100) / 100;
  }
  let name = baseName;
  if (rarity === 'magic') {
    name = [prefix && prefix.name, baseName, suffix && suffix.name].filter(Boolean).join(' ');
  } else if (rarity === 'rare') {
    name = pick(RARE_FIRST) + ' ' + pick(RARE_SECOND[kind]);
  }
  // a gem cut for a spell takes its colour; otherwise the first affix
  // tints the item (but not a ring's own stone), and rare gear glows in it
  const look = { ...base.looks[grade] };
  if (spellTint) {
    look.gem = spellTint;
  }
  const tint = affixes.length ? tintOf(affixes[0].stat) : null;
  if (tint) {
    if (kind === 'hat') {
      look.band = tint;
    } else if (kind === 'robe') {
      look.trim = tint;
    } else if (kind === 'staff' ? !spellTint : !base.stat && !base.spell) {
      look.gem = tint;
    }
    if (rarity === 'rare') {
      look.glow = tint;
    }
  }
  return {
    id: kind + '_' + baseName.toLowerCase().replace(/[^a-z]+/g, '_'),
    slot: kind, name, baseName, rarity, stats, affixes, look, text: base.text, level: depth
  };
}

let nextUid = 1;

export function makeItem(typeId) {
  const type = Gear[typeId];
  return type ? { uid: nextUid++, type } : null;
}

// How likely a set piece or unique is to be the one found: those that only
// come deeper down a little more as they do, those its finder already owns
// (`owned`, ids) far less, and those made for spells its finder knows
// (`spells`) more than those made for spells it does not.
function fixedWeight(type, depth, spells, owned) {
  let w = 1 + (type.minLevel || 1) / Math.max(1, depth);
  if (owned && owned.has(type.id)) {
    w *= 0.15;
  }
  if (spells) {
    const tied = Object.keys(type.stats).map(statSpell).filter(Boolean);
    if (tied.length) {
      w *= tied.some((id) => spells.includes(id)) ? 1.6 : 0.4;
    }
  }
  return w;
}

// A random item for loot, rarer and finer deeper down. `slots` limits the
// kinds (LootRules.kinds weighs them), `minRarity` lifts the floor
// (champions and bosses never drop junk), `magicFind` (the finder's)
// favours the rarer grades and `luck` the set pieces and uniques. `spells`
// (the finder's known spells) and `owned` (the ids of its fixed gear) steer
// what is made for a spell and which set piece or unique turns up
// (fixedWeight). Set pieces and uniques come from the fixed list, deep
// enough ones only (and not those only one foe carries, `from`); without
// one to give, it rolls a rare instead.
export function rollGear(depth = 1, { slots, minRarity, magicFind = 0, luck = 1, spells = null, owned = null } = {}) {
  const kinds = slots || KINDS;
  const kind = pickWeighted(kinds, (k) => LootRules.kinds[k] || 1);
  let rarity = rollRarity(depth, minRarity, magicFind, luck);
  if (rarity === 'set' || rarity === 'legendary') {
    const fits = (t, ks) => t.rarity === rarity && ks.includes(t.slot) && (t.minLevel || 1) <= depth && !t.from;
    let pool = Object.values(Gear).filter((t) => fits(t, [kind]));
    if (!pool.length) {
      pool = Object.values(Gear).filter((t) => fits(t, kinds));
    }
    if (pool.length) {
      return makeItem(pickWeighted(pool, (t) => fixedWeight(t, depth, spells, owned)).id);
    }
    rarity = 'rare';
  }
  return { uid: nextUid++, type: rollItem(kind, depth, rarity, spells) };
}

// One property as the inventory shows it: '+20% MOVE SPEED', '-10 FIREBALL COST'.
export function formatStat(key, value) {
  const spec = Stats[key];
  if (!spec) {
    return key;
  }
  const shown = spec.invert ? -value : value;
  const sign = shown > 0 ? '+' : '';
  const num = spec.pct ? Math.round(shown * 100) + '%' : (Math.round(shown * 10) / 10);
  return sign + num + ' ' + spec.label;
}

export function slotFits(slotId, type) {
  const slot = Slots.find((s) => s.id === slotId);
  return !!slot && slot.kind === type.slot;
}

// How many different pieces of a set an inventory wears.
export function setPiecesWorn(inventory, setId) {
  if (!inventory) {
    return 0;
  }
  return new Set(inventory.worn().filter((i) => i.type.set === setId).map((i) => i.type.id)).size;
}

// Bag and worn gear of one body. `owner.onGearChanged()` runs after every
// change so the owner can update its stats and model.
export class Inventory {
  constructor(owner, size = BAG_SIZE) {
    this.owner = owner;
    this.size = size;
    this.bag = [];
    this.equipped = {};
    for (const slot of Slots) {
      this.equipped[slot.id] = null;
    }
  }

  get full() {
    return this.bag.length >= this.size;
  }

  // The same bag and worn items in an inventory of their own (items never
  // change, so they are shared).
  copy() {
    const out = new Inventory(this.owner, this.size);
    out.bag = this.bag.slice();
    out.equipped = { ...this.equipped };
    return out;
  }

  // The bag and worn items as a save keeps them (core/saves.js): fixed gear
  // by its id, rolled gear by what it rolled.
  toSave() {
    const save = (item) => item && (Gear[item.type.id] === item.type ? { gear: item.type.id } : { type: item.type });
    const equipped = {};
    for (const slot of Slots) {
      equipped[slot.id] = save(this.equipped[slot.id]);
    }
    return { size: this.size, bag: this.bag.map(save), equipped };
  }

  // An inventory from a save, its items new ones; fixed gear that is no
  // longer in the game is left out.
  static fromSave(data, owner = null) {
    const load = (saved) => {
      if (saved && saved.gear) {
        return makeItem(saved.gear);
      }
      return saved && saved.type && Slots.some((s) => s.kind === saved.type.slot) ? { uid: nextUid++, type: saved.type } : null;
    };
    const out = new Inventory(owner, (data && data.size) || BAG_SIZE);
    if (!data) {
      return out;
    }
    out.bag = (data.bag || []).map(load).filter(Boolean).slice(0, out.size);
    for (const slot of Slots) {
      const item = load(data.equipped && data.equipped[slot.id]);
      out.equipped[slot.id] = item && slotFits(slot.id, item.type) ? item : null;
    }
    return out;
  }

  worn() {
    return Slots.map((s) => this.equipped[s.id]).filter(Boolean);
  }

  // Every item, worn first.
  all() {
    return [...this.worn(), ...this.bag];
  }

  // Free slot for a type, or null.
  freeSlot(type) {
    const slot = Slots.find((s) => s.kind === type.slot && !this.equipped[s.id]);
    return slot ? slot.id : null;
  }

  // Puts an item in the bag, or straight on when its slot is free and
  // `autoEquip` is set. Returns false when there is no room.
  add(item, autoEquip = true) {
    const free = autoEquip ? this.freeSlot(item.type) : null;
    if (free) {
      this.equipped[free] = item;
      this.changed();
      return true;
    }
    if (this.full) {
      return false;
    }
    this.bag.push(item);
    this.changed();
    return true;
  }

  // Wears an item from the bag. Without a slot it takes the first free one
  // of its kind (or the first of its kind); whatever was there goes back
  // into the bag in its place.
  equip(item, slotId) {
    const index = this.bag.indexOf(item);
    if (index < 0) {
      return false;
    }
    const slot = slotId || this.freeSlot(item.type) || Slots.find((s) => s.kind === item.type.slot).id;
    if (!slotFits(slot, item.type)) {
      return false;
    }
    const previous = this.equipped[slot];
    this.equipped[slot] = item;
    if (previous) {
      this.bag[index] = previous;
    } else {
      this.bag.splice(index, 1);
    }
    this.changed();
    return true;
  }

  unequip(slotId) {
    const item = this.equipped[slotId];
    if (!item || this.full) {
      return false;
    }
    this.equipped[slotId] = null;
    this.bag.push(item);
    this.changed();
    return true;
  }

  // Takes an item out altogether (dropped on the floor, or looted).
  remove(item) {
    for (const slot of Slots) {
      if (this.equipped[slot.id] === item) {
        this.equipped[slot.id] = null;
        this.changed();
        return true;
      }
    }
    const index = this.bag.indexOf(item);
    if (index >= 0) {
      this.bag.splice(index, 1);
      this.changed();
      return true;
    }
    return false;
  }

  // The summed properties of everything worn and of the set bonuses its
  // pieces earn, with the caps applied.
  stats() {
    const out = {};
    const add = (stats) => {
      for (const key in stats) {
        out[key] = (out[key] || 0) + stats[key];
      }
    };
    const sets = new Set();
    for (const item of this.worn()) {
      add(item.type.stats);
      if (item.type.set) {
        sets.add(item.type.set);
      }
    }
    for (const id of sets) {
      const worn = setPiecesWorn(this, id);
      for (const [pieces, bonus] of Sets[id].bonuses) {
        if (worn >= pieces) {
          add(bonus);
        }
      }
    }
    for (const key in out) {
      out[key] = capStat(key, out[key]);
    }
    return out;
  }

  changed() {
    if (this.owner && this.owner.onGearChanged) {
      this.owner.onGearChanged();
    }
  }
}

// Gives a body an inventory and puts a list of gear on it.
export function outfit(entity, typeIds) {
  if (!entity.inventory) {
    entity.inventory = new Inventory(entity);
  }
  for (const id of typeIds) {
    const item = makeItem(id);
    if (item) {
      entity.inventory.add(item);
    }
  }
  return entity.inventory;
}

// Applies a change of worn gear to a body's pools: max HP and max manergy grow
// and shrink with it, and so do the current values (never below 1 HP), so
// swapping gear back and forth gains nothing. Returns the new stats.
export function applyGearPools(entity) {
  const before = entity.gearStats || {};
  const after = entity.inventory ? entity.inventory.stats() : {};
  entity.gearStats = after;
  const dHp = (after.maxHp || 0) - (before.maxHp || 0);
  if (dHp) {
    entity.maxHp += dHp;
    entity.hp = Math.max(1, entity.hp + dHp);
  }
  const dMy = (after.maxManergy || 0) - (before.maxManergy || 0);
  if (dMy && entity.maxManergy !== undefined) {
    entity.maxManergy += dMy;
    entity.manergy = Math.max(0, Math.min(entity.maxManergy, entity.manergy + dMy));
  }
  return { before, after };
}

// A body's gear property (0 when it wears nothing that gives it).
export function gearStat(entity, key) {
  return (entity.gearStats && entity.gearStats[key]) || 0;
}

// A property of any body: the player's own `bonus` adds its innate bonuses.
export function statOf(entity, key) {
  if (!entity) {
    return 0;
  }
  return entity.bonus ? entity.bonus(key) : gearStat(entity, key);
}

// How much stronger a body's hits of an element are (+0.2 for 20%).
export function elementBonus(entity, element) {
  const key = ElementStats[element];
  return statOf(entity, 'spellDamage') + (key ? statOf(entity, key) : 0);
}
