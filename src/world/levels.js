// Ten floors from the upper halls down to the warlord. Every floor rolls a new
// dungeon; deeper floors have more rooms, more and tougher orcs, and more loot.
//   orcs     regular orcs on the floor (packs are scattered over the rooms)
//   classes  relative weights for the orc classes in OrcClasses
//   clerics, mages  mini-bosses (Clericorc, Mageorc)
//   scrolls, potions, rings  loot placed on the floor at the start
//   tier2    chance that a placed scroll is a tier 2 upgrade scroll
//   champion chance that an orc rolls as a champion (tougher, always drops loot)
export const DungeonLevels = {
  count: 10,
  // share of the floor's enemies to slay before the stairs unseal
  unlockShare: 0.4,
  plans: [
    { name: 'THE UPPER HALLS', rooms: 7, orcs: 22, classes: { grunt: 7, slinger: 3 }, scrolls: 5, potions: 3, rings: 0, tier2: 0, champion: 0 },
    { name: 'THE WARRENS', rooms: 8, orcs: 30, classes: { grunt: 6, slinger: 3, knight: 2 }, scrolls: 5, potions: 4, rings: 0, tier2: 0, champion: 0 },
    { name: 'THE MUSTER HALLS', rooms: 8, orcs: 38, classes: { grunt: 5, slinger: 3, knight: 2, shaman: 1, berserker: 1 }, scrolls: 6, potions: 4, rings: 1, tier2: 0.1, champion: 0 },
    { name: 'THE BONE CRYPTS', rooms: 9, orcs: 46, classes: { grunt: 4, slinger: 3, knight: 2, shaman: 2, berserker: 2 }, clerics: 1, scrolls: 6, potions: 5, rings: 1, tier2: 0.2, champion: 0 },
    { name: 'THE SUNKEN LIBRARY', rooms: 9, orcs: 54, classes: { grunt: 4, slinger: 3, knight: 3, shaman: 2, berserker: 2, brute: 1 }, mages: 1, scrolls: 7, potions: 5, rings: 1, tier2: 0.3, champion: 0.04 },
    { name: 'THE IRON FORGES', rooms: 10, orcs: 62, classes: { grunt: 3, slinger: 3, knight: 3, shaman: 2, berserker: 2, brute: 2, warlock: 2 }, clerics: 1, mages: 1, scrolls: 7, potions: 6, rings: 1, tier2: 0.4, champion: 0.06 },
    { name: 'THE BLOOD PITS', rooms: 10, orcs: 70, classes: { grunt: 3, slinger: 3, knight: 3, shaman: 2, berserker: 3, brute: 2, warlock: 2 }, clerics: 1, mages: 1, scrolls: 8, potions: 6, rings: 2, tier2: 0.5, champion: 0.08 },
    { name: 'THE SHADOW VAULTS', rooms: 10, orcs: 78, classes: { grunt: 2, slinger: 3, knight: 3, shaman: 2, berserker: 3, brute: 3, warlock: 3 }, clerics: 2, mages: 1, scrolls: 8, potions: 7, rings: 2, tier2: 0.6, champion: 0.1 },
    { name: 'THE BURNING DEEP', rooms: 11, orcs: 86, classes: { grunt: 2, slinger: 2, knight: 3, shaman: 3, berserker: 3, brute: 3, warlock: 4 }, clerics: 2, mages: 2, scrolls: 9, potions: 8, rings: 2, tier2: 0.7, champion: 0.12 },
    { name: 'THRONE OF THE WARLORD', rooms: 9, orcs: 34, classes: { knight: 3, shaman: 2, berserker: 3, brute: 3, warlock: 3 }, boss: true, scrolls: 6, potions: 10, rings: 1, tier2: 0.8, champion: 0.15 }
  ],

  getPlan(depth) {
    const index = Math.max(1, Math.min(this.count, depth)) - 1;
    return this.plans[index];
  },

  // regular orcs get tougher the deeper they live
  hpScale(depth) {
    return 1 + (depth - 1) * 0.1;
  },

  damageScale(depth) {
    return 1 + (depth - 1) * 0.07;
  },

  pickClass(plan) {
    let total = 0;
    for (const name in plan.classes) {
      total += plan.classes[name];
    }
    let roll = Math.random() * total;
    for (const name in plan.classes) {
      roll -= plan.classes[name];
      if (roll < 0) {
        return name;
      }
    }
    return 'grunt';
  }
};

// Orc classes. `look` picks the 3D model variant, `label` is shown above them.
export const OrcClasses = {
  grunt: { look: 'grunt', hp: 100 },
  slinger: { look: 'slinger', hp: 90, sight: 540 },
  knight: { look: 'knight', hp: 125 },
  shaman: { look: 'shaman', hp: 125 },
  berserker: { look: 'berserker', hp: 140, label: 'BERSERKER' },
  brute: { look: 'brute', hp: 380, label: 'BRUTE' },
  warlock: { look: 'warlock', hp: 150, sight: 560, label: 'WARLOCK' }
};
