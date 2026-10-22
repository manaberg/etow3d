// Wearable gear: hats, robes, staffs and rings with properties, carried in an
// inventory by the player and by the NPCs (the duel rival, orc champions and
// casters, the orc mini-bosses). Whatever a body wears shows on its model
// (render/gearModels.js) and adds its properties to the wearer's stats.
//
// An item is { uid, type } where `type` is an entry of Gear below. Several
// items can share a type.

export const Slots = [
  { id: 'hat', kind: 'hat', label: 'HAT' },
  { id: 'robe', kind: 'robe', label: 'ROBE' },
  { id: 'staff', kind: 'staff', label: 'STAFF' },
  { id: 'ring1', kind: 'ring', label: 'LEFT RING' },
  { id: 'ring2', kind: 'ring', label: 'RIGHT RING' }
];

export const BAG_SIZE = 20;

export const Rarities = {
  common: { label: 'COMMON', color: '#d8d0c0', glow: 0xe8e0d0, weight: 60 },
  magic: { label: 'MAGIC', color: '#6ab0ff', glow: 0x4a90ff, weight: 28 },
  rare: { label: 'RARE', color: '#ffd060', glow: 0xffc030, weight: 10 },
  legendary: { label: 'LEGENDARY', color: '#ff8a3a', glow: 0xff7020, weight: 2 }
};

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
  missileDamage: { label: 'MISSILE DAMAGE', good: 1 },
  fireballCost: { label: 'FIREBALL COST', good: -1 },
  lightningCost: { label: 'LIGHTNING COST', good: -1 },
  leech: { label: 'LIFESTEAL HEAL', good: 1 },
  mend: { label: 'HP REGEN / S', good: 1 },
  ward: { label: 'SHIELD DURATION', pct: true, good: 1 }
};

// Ceilings so stacked gear cannot make a wizard untouchable or spells free.
export const StatCaps = { armor: 0.6, cooldown: 0.4, speed: 0.6, fireballCost: -15, lightningCost: -20 };

// The catalogue. `look` drives the model: colours, a `style` for hats and
// staffs, and `glow` for gear that shines.
export const Gear = {
  // ------------------------------------------------------------ hats
  pointed_hat: {
    slot: 'hat', name: 'POINTED HAT', rarity: 'common', stats: { maxManergy: 10 },
    text: 'Every apprentice gets one.', look: { style: 'pointed', color: 0x223c86, band: 0xd8c070 }
  },
  crimson_hat: {
    slot: 'hat', name: 'CRIMSON HAT', rarity: 'common', stats: { maxManergy: 10 },
    text: 'Worn by the Red Order\'s duellists.', look: { style: 'pointed', color: 0x3a0c0c, band: 0xb0b0b0 }
  },
  wanderer_hat: {
    slot: 'hat', name: 'WANDERER\'S HAT', rarity: 'common', stats: { speed: 0.08 },
    text: 'Broad brimmed and road worn.', look: { style: 'wide', color: 0x5a4a32, band: 0x8a2a1a }
  },
  shadow_cowl: {
    slot: 'hat', name: 'SHADOW COWL', rarity: 'magic', stats: { armor: 0.08, speed: 0.05 },
    text: 'Blows seem to slide off it.', look: { style: 'hood', color: 0x24222c, band: 0x6a40a0 }
  },
  hat_of_stars: {
    slot: 'hat', name: 'HAT OF STARS', rarity: 'rare', stats: { cooldown: 0.12, maxManergy: 20 },
    text: 'The stars on it turn with the night sky.', look: { style: 'pointed', color: 0x141a4a, band: 0xc0d0ff, glow: 0xa0c0ff }
  },
  mitre: {
    slot: 'hat', name: 'HIGH PRIEST\'S MITRE', rarity: 'rare', stats: { mend: 1.5, maxHp: 20 },
    text: 'Taken from an orc cleric. Wounds close beneath it.', look: { style: 'mitre', color: 0xf0e8d0, band: 0xd8a838, glow: 0xfff0a0 }
  },
  archmage_crown: {
    slot: 'hat', name: 'CROWN OF THE ARCHMAGE', rarity: 'legendary', stats: { maxManergy: 40, regen: 0.2 },
    text: 'Seven gems, one for each school of magic.', look: { style: 'crown', color: 0xe0b040, band: 0xe0b040, glow: 0x80f0ff }
  },

  // ------------------------------------------------------------ robes
  apprentice_robe: {
    slot: 'robe', name: 'APPRENTICE ROBE', rarity: 'common', stats: { maxHp: 10 },
    text: 'Blue wool, gold trim, many patches.', look: { robe: 0x2a4fa8, mantle: 0x223c86, trim: 0xd8c070 }
  },
  crimson_robe: {
    slot: 'robe', name: 'CRIMSON ROBE', rarity: 'common', stats: { maxHp: 10 },
    text: 'Dyed in the colours of the Red Order.', look: { robe: 0x8a1a1a, mantle: 0x2a0a0a, trim: 0xb0b0b0 }
  },
  traveller_robe: {
    slot: 'robe', name: 'GREY TRAVELLER\'S ROBE', rarity: 'common', stats: { speed: 0.06 },
    text: 'Light enough to run in.', look: { robe: 0x6a6a70, mantle: 0x4a4a50, trim: 0x9a8a6a }
  },
  battlemage_robe: {
    slot: 'robe', name: 'BATTLEMAGE ROBE', rarity: 'magic', stats: { armor: 0.15, speed: -0.05 },
    text: 'Chain mail sewn into the lining.', look: { robe: 0x3a3e48, mantle: 0x8a8e96, trim: 0xb0b4bc }
  },
  ember_robe: {
    slot: 'robe', name: 'ROBE OF EMBERS', rarity: 'rare', stats: { fireballCost: -10, maxHp: 20 },
    text: 'Its hem smoulders but never burns.', look: { robe: 0x8a2a0a, mantle: 0x3a1208, trim: 0xff8a20, glow: 0xff6010 }
  },
  frostweave_robe: {
    slot: 'robe', name: 'FROSTWEAVE ROBE', rarity: 'rare', stats: { armor: 0.1, maxManergy: 25 },
    text: 'Cold to the touch, even by the forges.', look: { robe: 0xa8d0f0, mantle: 0x5a8ab8, trim: 0xe8f8ff, glow: 0x80d8ff }
  },
  archmage_robe: {
    slot: 'robe', name: 'ROBE OF THE ARCHMAGE', rarity: 'legendary', stats: { maxHp: 40, maxManergy: 40, cooldown: 0.08 },
    text: 'Purple, gold and a cape that billows without wind.', look: { robe: 0x4a1a7a, mantle: 0x2a0a4a, trim: 0xe0b040, cape: 0x9a2ac8, glow: 0xffd060 }
  },
  void_robe: {
    slot: 'robe', name: 'VESTMENTS OF THE VOID', rarity: 'legendary', stats: { leech: 3, armor: 0.12, maxHp: 20 },
    text: 'Light dies in its folds.', look: { robe: 0x121016, mantle: 0x060508, trim: 0x8a40ff, cape: 0x2a1048, glow: 0xa040ff }
  },

  // ------------------------------------------------------------ staffs
  oak_staff: {
    slot: 'staff', name: 'OAK STAFF', rarity: 'common', stats: { missileDamage: 5 },
    text: 'A straight branch and a glass bead.', look: { style: 'orb', wood: 0x5a3a20, gem: 0x9fd8ff }
  },
  blood_staff: {
    slot: 'staff', name: 'BLOODWOOD STAFF', rarity: 'common', stats: { missileDamage: 5 },
    text: 'The Red Order cuts them from one grove.', look: { style: 'orb', wood: 0x3a1410, gem: 0xff5040 }
  },
  crystal_staff: {
    slot: 'staff', name: 'CRYSTAL STAFF', rarity: 'magic', stats: { regen: 0.15 },
    text: 'The crystal hums as manergy returns.', look: { style: 'crystal', wood: 0x6a6a7a, gem: 0x60f0ff }
  },
  ember_staff: {
    slot: 'staff', name: 'STAFF OF EMBERS', rarity: 'rare', stats: { fireballCost: -10, missileDamage: 10 },
    text: 'Warm in the hand, hot at the tip.', look: { style: 'crystal', wood: 0x2a1a14, gem: 0xff6020 }
  },
  stormcaller: {
    slot: 'staff', name: 'STORMCALLER', rarity: 'rare', stats: { lightningCost: -10, cooldown: 0.08 },
    text: 'Sparks leap between its prongs.', look: { style: 'fork', wood: 0x4a4e5a, gem: 0xa0e8ff }
  },
  bone_staff: {
    slot: 'staff', name: 'BONE STAFF', rarity: 'rare', stats: { leech: 3, maxHp: 15 },
    text: 'An orc shaman\'s, skull and all.', look: { style: 'skull', wood: 0xd8d0b0, gem: 0x80ff60 }
  },
  magi_staff: {
    slot: 'staff', name: 'STAFF OF THE MAGI', rarity: 'legendary', stats: { missileDamage: 25, cooldown: 0.15, maxManergy: 30 },
    text: 'A small sun turns in its crook.', look: { style: 'sun', wood: 0xe0c070, gem: 0xffe080 }
  },

  // ------------------------------------------------------------ rings
  // the 2D game's five rings first (Ring loot hands these out)
  ring_speed: { slot: 'ring', name: 'RING OF SPEED', rarity: 'magic', stats: { speed: 0.2 }, text: 'Faster movement.', look: { band: 0xffc840, gem: 0xffe070 } },
  ring_manergy: { slot: 'ring', name: 'RING OF MANERGY', rarity: 'magic', stats: { regen: 0.25 }, text: 'Faster manergy regen.', look: { band: 0xffc840, gem: 0x4080ff } },
  ring_fire: { slot: 'ring', name: 'RING OF FIRE', rarity: 'magic', stats: { fireballCost: -10 }, text: 'Cheaper fireballs.', look: { band: 0xffc840, gem: 0xff5020 } },
  ring_storms: { slot: 'ring', name: 'RING OF STORMS', rarity: 'magic', stats: { lightningCost: -10 }, text: 'Cheaper lightning.', look: { band: 0xc8d0e0, gem: 0xa0e8ff } },
  ring_force: { slot: 'ring', name: 'RING OF FORCE', rarity: 'magic', stats: { missileDamage: 25 }, text: 'Stronger missiles.', look: { band: 0xffc840, gem: 0xc070ff } },
  ring_protection: { slot: 'ring', name: 'RING OF PROTECTION', rarity: 'magic', stats: { armor: 0.1 }, text: 'A ward against blows.', look: { band: 0xc8d0e0, gem: 0xe8f0ff } },
  ring_vitality: { slot: 'ring', name: 'RING OF VITALITY', rarity: 'rare', stats: { maxHp: 30, mend: 0.5 }, text: 'A steady second heartbeat.', look: { band: 0xffc840, gem: 0xff3050 } },
  ring_warding: { slot: 'ring', name: 'RING OF WARDING', rarity: 'rare', stats: { ward: 0.5, armor: 0.05 }, text: 'Shields hold longer.', look: { band: 0xc8d0e0, gem: 0x60b0ff } }
};

for (const id in Gear) {
  Gear[id].id = id;
}

export const ClassicRings = ['ring_speed', 'ring_manergy', 'ring_fire', 'ring_storms', 'ring_force'];

// Starting kits: the player's apprentice gear and the duel rival's red
// version of it (same properties, so duels stay even).
export const Kits = {
  apprentice: ['pointed_hat', 'apprentice_robe', 'oak_staff'],
  rival: ['crimson_hat', 'crimson_robe', 'blood_staff']
};

let nextUid = 1;

export function makeItem(typeId) {
  const type = Gear[typeId];
  return type ? { uid: nextUid++, type } : null;
}

// A random item for loot, rarer deeper down. `slots` limits the kinds,
// `minRarity` lifts the floor (champions and bosses never drop junk).
export function rollGear(depth = 1, { slots, minRarity } = {}) {
  const order = Object.keys(Rarities);
  const floor = minRarity ? order.indexOf(minRarity) : 0;
  const pool = Object.values(Gear).filter((t) =>
    (!slots || slots.includes(t.slot)) && order.indexOf(t.rarity) >= floor && !Kits.rival.includes(t.id));
  // depth shifts the odds toward the rarer tiers
  const weight = (t) => {
    const r = Rarities[t.rarity];
    const tier = order.indexOf(t.rarity);
    return r.weight * Math.pow(1 + depth * 0.18, tier);
  };
  let total = 0;
  for (const t of pool) {
    total += weight(t);
  }
  let roll = Math.random() * total;
  for (const t of pool) {
    roll -= weight(t);
    if (roll < 0) {
      return makeItem(t.id);
    }
  }
  return makeItem(pool[pool.length - 1].id);
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

  // The summed properties of everything worn, with the caps applied.
  stats() {
    const out = {};
    for (const item of this.worn()) {
      for (const key in item.type.stats) {
        out[key] = (out[key] || 0) + item.type.stats[key];
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
