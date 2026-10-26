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

export const Slots = [
  { id: 'hat', kind: 'hat', label: 'HAT' },
  { id: 'robe', kind: 'robe', label: 'ROBE' },
  { id: 'staff', kind: 'staff', label: 'STAFF' },
  { id: 'ring1', kind: 'ring', label: 'LEFT RING' },
  { id: 'ring2', kind: 'ring', label: 'RIGHT RING' }
];

const KINDS = ['hat', 'robe', 'staff', 'ring'];

export const BAG_SIZE = 20;

// `tier` is how much deeper floors favour the rarity (rollRarity).
export const Rarities = {
  common: { label: 'COMMON', color: '#d8d0c0', glow: 0xe8e0d0, weight: 60, tier: 0 },
  magic: { label: 'MAGIC', color: '#6a9cff', glow: 0x4a80ff, weight: 28, tier: 1 },
  rare: { label: 'RARE', color: '#ffe060', glow: 0xffd030, weight: 9, tier: 2 },
  set: { label: 'SET', color: '#4ee060', glow: 0x30ff50, weight: 0.8, tier: 3 },
  legendary: { label: 'UNIQUE', color: '#ff9a3a', glow: 0xff7020, weight: 0.6, tier: 3 }
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

// Ceilings so stacked gear cannot make a wizard untouchable or spells free.
export const StatCaps = { armor: 0.6, cooldown: 0.4, costCut: 0.5, steadfast: 0.6, speed: 0.6, fireballCost: -15, lightningCost: -20 };

// The property that strengthens hits of each element (enemy.js Elements);
// spellDamage strengthens them all.
export const ElementStats = {
  fire: 'fireDamage', cold: 'coldDamage', lightning: 'lightningDamage', thunder: 'lightningDamage',
  poison: 'poisonDamage', necrotic: 'necroticDamage', radiant: 'radiantDamage', force: 'forceDamage', physical: 'ironDamage'
};

// Colours an affix lends a rolled item's look (gem, band, trim), by property.
const TINTS = {
  fireDamage: 0xff5020, coldDamage: 0x9ad8ff, lightningDamage: 0xa0e8ff, poisonDamage: 0x80ff40,
  necroticDamage: 0xa040ff, radiantDamage: 0xffe080, forceDamage: 0xc070ff, ironDamage: 0xb0b4bc,
  spellDamage: 0xff60d0, maxManergy: 0x4080ff, regen: 0x40c0ff, maxHp: 0xff3050, mend: 0xff6080,
  leech: 0xc01030, killHeal: 0xd02040, killManergy: 0x6040ff, speed: 0xffe070, armor: 0xe8f0ff,
  ward: 0x60b0ff, steadfast: 0xd0c0a0, cooldown: 0x80fff0, costCut: 0x60e0c0, missileDamage: 0xc070ff,
  fireballCost: 0xff7030, lightningCost: 0xa0e8ff, xpGain: 0xffd040, potionPower: 0xff70a0, magicFind: 0xffc020
};

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
  archmage: { name: 'THE ARCHMAGE\'S REGALIA', bonuses: [[2, { spellDamage: 0.1 }], [3, { costCut: 0.12 }], [4, { cooldown: 0.1, maxManergy: 40 }]] }
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
      looks: [{ style: 'crown', color: 0x8a7a6a, band: 0x8a7a6a }, { style: 'crown', color: 0xc8d0e0, band: 0xc8d0e0 }, { style: 'crown', color: 0xe0b040, band: 0xe0b040 }] }
  ],
  robe: [
    { names: ['WOOL ROBE', 'SILK ROBE', 'STARWOVEN ROBE'], stat: 'maxHp', values: [8, 16, 28], text: 'Long, loose, and full of pockets.',
      looks: [{ robe: 0x5a4a3a, mantle: 0x3a2e24, trim: 0x8a7a5a }, { robe: 0x2a4a8a, mantle: 0x1a2a5a, trim: 0xc0c0d0 }, { robe: 0x1a1a4a, mantle: 0x0a0a2a, trim: 0xc0d0ff }] },
    { names: ['QUILTED ROBE', 'MAIL-LINED ROBE', 'RUNEPLATE ROBE'], stat: 'armor', values: [0.04, 0.07, 0.1], text: 'Something hard is sewn into the lining.',
      looks: [{ robe: 0x6a5a4a, mantle: 0x4a3a2a, trim: 0x8a8a8a }, { robe: 0x3a3e48, mantle: 0x8a8e96, trim: 0xb0b4bc }, { robe: 0x2a2e38, mantle: 0x5a6070, trim: 0x60b0ff }] },
    { names: ['TRAVELLER\'S CLOAK', 'WAYFARER\'S MANTLE', 'SKYSTRIDER\'S MANTLE'], stat: 'speed', values: [0.03, 0.05, 0.07], text: 'Light enough to run in, warm enough to sleep in.',
      looks: [{ robe: 0x6a6a70, mantle: 0x4a4a50, trim: 0x9a8a6a, cape: 0x5a5a60 }, { robe: 0x3a5a4a, mantle: 0x2a3a30, trim: 0xa0a080, cape: 0x4a6a5a }, { robe: 0x4a6a9a, mantle: 0x2a3a5a, trim: 0xe0f0ff, cape: 0x6a8ac0 }] },
    { names: ['ACOLYTE\'S VESTMENTS', 'CANTOR\'S VESTMENTS', 'ARCHON\'S VESTMENTS'], stat: 'regen', values: [0.05, 0.08, 0.12], text: 'Cut for long hours of quiet study.',
      looks: [{ robe: 0xb8b0a0, mantle: 0x8a8070, trim: 0x6a4a2a }, { robe: 0xe8e0d0, mantle: 0xb0a080, trim: 0xd8a838 }, { robe: 0x5a1a7a, mantle: 0x2a0a4a, trim: 0xe0b040 }] }
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
      looks: [{ style: 'sun', wood: 0xa08050, gem: 0xffd080 }, { style: 'sun', wood: 0xc0a060, gem: 0xffe080 }, { style: 'sun', wood: 0xe0c070, gem: 0xfff0c0 }] }
  ],
  // rings have no built-in property: they are always magic or better
  ring: [
    { names: ['COPPER RING', 'SILVER RING', 'GOLD RING'], stat: null, values: [0, 0, 0], text: 'A plain band, waiting for a spell to hold.',
      looks: [{ band: 0xc07040, gem: 0xd0d0d0 }, { band: 0xc8d0e0, gem: 0xd0d0d0 }, { band: 0xffc840, gem: 0xd0d0d0 }] }
  ]
};

// Affixes, Diablo style. Each family is one property in grades: [name,
// shallowest floor, lowest value, highest value]. A rolled item takes at
// most one family per property.
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
  { stat: 'lightningCost', kinds: ['staff', 'ring'], grades: [['OF STATIC', 3, -5, -5], ['OF THE STORM', 9, -10, -8]] }
];

// Rare names: a word of dread and a word for the kind of item.
const RARE_FIRST = ['DOOM', 'GLOOM', 'STORM', 'DREAD', 'GHOUL', 'BLOOD', 'SOUL', 'VIPER', 'RAVEN', 'WRAITH', 'BONE', 'STAR',
  'GRIM', 'HAVOC', 'PLAGUE', 'SHADOW', 'RUNE', 'ENTROPY', 'SPIRIT', 'CORPSE', 'EAGLE', 'DRAGON', 'HAIL', 'VORTEX', 'BEAST',
  'PAIN', 'LOATH', 'CHAOS', 'FIEND', 'HOLLOW', 'ASH', 'VOID', 'WYRM', 'GRAVE', 'EMBER', 'FROST', 'THUNDER', 'MIND', 'OMEN', 'WITCH'];
const RARE_SECOND = {
  hat: ['VISAGE', 'HOOD', 'CROWN', 'COWL', 'SHROUD', 'HORN', 'CIRCLET', 'GAZE', 'MASK', 'BROW', 'PEAK', 'VEIL'],
  robe: ['SHROUD', 'MANTLE', 'WRAP', 'SHELL', 'CLOAK', 'HIDE', 'WEAVE', 'GARB', 'COAT', 'PALL', 'SKIN', 'HARNESS'],
  staff: ['SPIRE', 'BRANCH', 'WAND', 'CALL', 'SONG', 'SPIKE', 'BRAND', 'CHANT', 'ROD', 'SCEPTRE', 'BOUGH', 'FANG'],
  ring: ['COIL', 'LOOP', 'BAND', 'GYRE', 'KNOT', 'SPIRAL', 'EYE', 'CIRCLE', 'NOOSE', 'HOOP', 'WHORL', 'TWIST']
};

function pick(list) {
  return list[Math.floor(Math.random() * list.length)];
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

// One affix of `families` for a kind of item found at `depth`, avoiding the
// properties in `taken`: the best grade the depth allows half the time,
// otherwise any lower one.
function rollAffix(families, kind, depth, taken) {
  const open = families.filter((f) => f.kinds.includes(kind) && !taken.has(f.stat) && f.grades[0][1] <= depth);
  if (!open.length) {
    return null;
  }
  const family = pick(open);
  const grades = family.grades.filter((g) => g[1] <= depth);
  const grade = Math.random() < 0.5 ? grades[grades.length - 1] : pick(grades);
  taken.add(family.stat);
  return { name: grade[0], stat: family.stat, value: rollValue(family.stat, grade[2], grade[3]) };
}

function rollRarity(depth, minRarity, magicFind) {
  const floor = minRarity ? Rarities[minRarity].tier : 0;
  const weights = RARITY_ORDER.map((id) => {
    const r = Rarities[id];
    if (r.tier < floor) {
      return 0;
    }
    return r.weight * Math.pow(1 + depth * 0.1, r.tier) * (r.tier > 0 ? 1 + magicFind : 1);
  });
  let roll = Math.random() * weights.reduce((a, b) => a + b, 0);
  for (let i = 0; i < weights.length; i++) {
    roll -= weights[i];
    if (roll < 0) {
      return RARITY_ORDER[i];
    }
  }
  return RARITY_ORDER[0];
}

// A rolled item of `kind` found at `depth`: its base, affixes, name and look.
function rollItem(kind, depth, rarity) {
  const base = pick(Bases[kind]);
  const grade = gradeOf(depth);
  const baseName = base.names[grade];
  const stats = {};
  if (base.stat) {
    stats[base.stat] = base.values[grade];
  }
  const taken = new Set();
  const affixes = [];
  let prefix = null;
  let suffix = null;
  if (rarity === 'magic') {
    const roll = Math.random();
    if (roll < 0.75) {
      prefix = rollAffix(Prefixes, kind, depth, taken);
    }
    if (roll >= 0.4 || !prefix) {
      suffix = rollAffix(Suffixes, kind, depth, taken);
    }
    affixes.push(...[prefix, suffix].filter(Boolean));
  } else if (rarity === 'rare') {
    const count = 3 + Math.floor(Math.random() * (depth >= 8 ? 3 : 2));
    let prefixes = 0;
    let suffixes = 0;
    for (let i = 0; i < count; i++) {
      const asPrefix = suffixes >= 3 || (prefixes < 3 && Math.random() < 0.5);
      const affix = rollAffix(asPrefix ? Prefixes : Suffixes, kind, depth, taken);
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
  // the first affix tints the item; rare gear glows in that colour
  const look = { ...base.looks[grade] };
  const tint = affixes.length ? TINTS[affixes[0].stat] : null;
  if (tint) {
    if (kind === 'hat') {
      look.band = tint;
    } else if (kind === 'robe') {
      look.trim = tint;
    } else {
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

// A random item for loot, rarer and finer deeper down. `slots` limits the
// kinds, `minRarity` lifts the floor (champions and bosses never drop junk),
// `magicFind` (the finder's) favours the rarer grades. Set pieces and
// uniques come from the fixed list, deep enough ones only; without one to
// give, it rolls a rare instead.
export function rollGear(depth = 1, { slots, minRarity, magicFind = 0 } = {}) {
  const kinds = slots || KINDS;
  let rarity = rollRarity(depth, minRarity, magicFind);
  if (rarity === 'set' || rarity === 'legendary') {
    const pool = Object.values(Gear).filter((t) => t.rarity === rarity && kinds.includes(t.slot) && (t.minLevel || 1) <= depth);
    if (pool.length) {
      return makeItem(pick(pool).id);
    }
    rarity = 'rare';
  }
  const kind = pick(kinds);
  // rings are never plain
  if (kind === 'ring' && rarity === 'common') {
    rarity = 'magic';
  }
  return { uid: nextUid++, type: rollItem(kind, depth, rarity) };
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
    for (const key in StatCaps) {
      if (out[key] !== undefined) {
        const cap = StatCaps[key];
        out[key] = cap < 0 ? Math.max(cap, out[key]) : Math.min(cap, out[key]);
      }
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
