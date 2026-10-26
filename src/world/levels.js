import { randInt } from '../core/constants.js';

// Twenty floors: ten from the upper halls down to the warlord, then ten more
// down through the dragons' lairs to the great golden wyrm. Every floor rolls
// a new dungeon; deeper floors have more rooms, more and tougher foes, and
// more loot, and below the warlord the difficulty climbs faster.
// The orcs hold the dungeon, but warbands of dwarves, humans and elves who
// came for its treasure fight for it too, and they all hunt the wizard.
//   orcs     regular orcs on the floor (packs are scattered over the rooms)
//   classes  relative weights for the orc classes in OrcClasses
//   races    relative weights for the race of each pack (Races; a pack is one race)
//   clerics, mages  mini-bosses (Clericorc, Mageorc)
//   dragons  dragons by age (DragonAges in dragon.js), each of a colour drawn
//            from `colors`; they lair in the largest rooms
//   boss     'warlord' (floor 10; slaying him opens the stairs) or 'wyrm'
//            (floor 20; slaying it wins the run)
//   scrolls, potions, rings  loot placed on the floor at the start
//   tier2    chance that a placed scroll is a tier 2 upgrade scroll
//   champion chance that an orc rolls as a champion (tougher, drops more loot)
export const DungeonLevels = {
  count: 20,
  // share of the floor's enemies to slay before the stairs unseal
  unlockShare: 0.4,
  plans: [
    { name: 'THE UPPER HALLS', rooms: 7, orcs: 22, classes: { grunt: 7, slinger: 3 }, races: { orc: 8, human: 2 }, scrolls: 5, potions: 1, rings: 0, tier2: 0, champion: 0 },
    { name: 'THE WARRENS', rooms: 8, orcs: 30, classes: { grunt: 6, slinger: 3, knight: 2 }, races: { orc: 6, human: 2, dwarf: 2 }, scrolls: 5, potions: 2, rings: 0, tier2: 0, champion: 0.02 },
    { name: 'THE MUSTER HALLS', rooms: 8, orcs: 38, classes: { grunt: 5, slinger: 3, knight: 2, shaman: 1, berserker: 1 }, races: { orc: 5, human: 2, dwarf: 2, elf: 1 }, clerics: 1, scrolls: 6, potions: 2, rings: 1, tier2: 0.1, champion: 0.04 },
    { name: 'THE BONE CRYPTS', rooms: 9, orcs: 46, classes: { grunt: 4, slinger: 3, knight: 2, shaman: 2, berserker: 2 }, races: { orc: 4, human: 2, dwarf: 2, elf: 2 }, clerics: 1, mages: 1, scrolls: 6, potions: 2, rings: 1, tier2: 0.2, champion: 0.06 },
    { name: 'THE SUNKEN LIBRARY', rooms: 9, orcs: 54, classes: { grunt: 4, slinger: 3, knight: 3, shaman: 2, berserker: 2, brute: 1 }, races: { orc: 4, human: 2, dwarf: 2, elf: 2 }, clerics: 1, mages: 2, scrolls: 7, potions: 2, rings: 1, tier2: 0.3, champion: 0.09 },
    { name: 'THE IRON FORGES', rooms: 10, orcs: 62, classes: { grunt: 3, slinger: 3, knight: 3, shaman: 2, berserker: 2, brute: 2, warlock: 2 }, races: { orc: 4, human: 1, dwarf: 3, elf: 2 }, clerics: 2, mages: 2, scrolls: 7, potions: 3, rings: 1, tier2: 0.4, champion: 0.12 },
    { name: 'THE BLOOD PITS', rooms: 10, orcs: 70, classes: { grunt: 3, slinger: 3, knight: 3, shaman: 2, berserker: 3, brute: 2, warlock: 2 }, races: { orc: 4, human: 2, dwarf: 2, elf: 2 }, clerics: 2, mages: 2, scrolls: 8, potions: 3, rings: 2, tier2: 0.5, champion: 0.15 },
    { name: 'THE SHADOW VAULTS', rooms: 10, orcs: 78, classes: { grunt: 2, slinger: 3, knight: 3, shaman: 2, berserker: 3, brute: 3, warlock: 3 }, races: { orc: 4, human: 2, dwarf: 1, elf: 3 }, clerics: 3, mages: 2, scrolls: 8, potions: 3, rings: 2, tier2: 0.6, champion: 0.18 },
    { name: 'THE BURNING DEEP', rooms: 11, orcs: 86, classes: { grunt: 2, slinger: 2, knight: 3, shaman: 3, berserker: 3, brute: 3, warlock: 4 }, races: { orc: 4, human: 2, dwarf: 2, elf: 2 }, clerics: 3, mages: 3, scrolls: 9, potions: 3, rings: 2, tier2: 0.7, champion: 0.22 },
    { name: 'THRONE OF THE WARLORD', rooms: 9, orcs: 34, classes: { knight: 3, shaman: 2, berserker: 3, brute: 3, warlock: 3 }, races: { orc: 6, human: 1, dwarf: 1, elf: 1 }, boss: 'warlord', clerics: 1, mages: 1, scrolls: 6, potions: 4, rings: 1, tier2: 0.8, champion: 0.28 },
    { name: 'THE SCORCHED GALLERIES', rooms: 11, orcs: 92, classes: { grunt: 2, slinger: 2, knight: 3, shaman: 3, berserker: 3, brute: 4, warlock: 4 }, races: { orc: 4, human: 2, dwarf: 2, elf: 2 }, clerics: 2, mages: 1, dragons: { ages: { wyrmling: 2 }, colors: ['red'] }, scrolls: 9, potions: 3, rings: 2, tier2: 0.8, champion: 0.30 },
    { name: 'THE FROZEN CISTERNS', rooms: 11, orcs: 98, classes: { grunt: 2, slinger: 2, knight: 3, shaman: 3, berserker: 3, brute: 4, warlock: 4 }, races: { orc: 4, human: 2, dwarf: 2, elf: 2 }, clerics: 2, mages: 2, dragons: { ages: { wyrmling: 3 }, colors: ['white'] }, scrolls: 9, potions: 3, rings: 2, tier2: 0.8, champion: 0.32 },
    { name: 'THE STORM HALLS', rooms: 12, orcs: 104, classes: { grunt: 2, slinger: 2, knight: 3, shaman: 3, berserker: 3, brute: 4, warlock: 4 }, races: { orc: 4, human: 2, dwarf: 2, elf: 2 }, clerics: 2, mages: 2, dragons: { ages: { wyrmling: 2, young: 1 }, colors: ['blue'] }, scrolls: 10, potions: 3, rings: 2, tier2: 0.85, champion: 0.34 },
    { name: 'THE VENOM MIRES', rooms: 12, orcs: 110, classes: { grunt: 2, slinger: 2, knight: 3, shaman: 3, berserker: 3, brute: 4, warlock: 4 }, races: { orc: 4, human: 2, dwarf: 2, elf: 2 }, clerics: 2, mages: 2, dragons: { ages: { wyrmling: 2, young: 2 }, colors: ['green'] }, scrolls: 10, potions: 3, rings: 2, tier2: 0.85, champion: 0.36 },
    { name: 'THE BLACK POOLS', rooms: 12, orcs: 116, classes: { grunt: 2, slinger: 2, knight: 3, shaman: 3, berserker: 3, brute: 4, warlock: 4 }, races: { orc: 4, human: 2, dwarf: 2, elf: 2 }, clerics: 3, mages: 2, dragons: { ages: { young: 2, adult: 1 }, colors: ['black'] }, scrolls: 10, potions: 3, rings: 2, tier2: 0.9, champion: 0.38 },
    { name: 'THE WYRM WARRENS', rooms: 13, orcs: 122, classes: { grunt: 2, slinger: 2, knight: 3, shaman: 3, berserker: 3, brute: 4, warlock: 4 }, races: { orc: 4, human: 2, dwarf: 2, elf: 2 }, clerics: 3, mages: 2, dragons: { ages: { wyrmling: 3, young: 2, adult: 1 }, colors: ['red', 'white', 'blue', 'green', 'black'] }, scrolls: 11, potions: 3, rings: 3, tier2: 0.9, champion: 0.40 },
    { name: 'THE HOARD VAULTS', rooms: 13, orcs: 128, classes: { grunt: 2, slinger: 2, knight: 3, shaman: 3, berserker: 3, brute: 4, warlock: 4 }, races: { orc: 4, human: 2, dwarf: 2, elf: 2 }, clerics: 3, mages: 3, dragons: { ages: { young: 2, adult: 2 }, colors: ['red', 'white', 'blue', 'green', 'black'] }, scrolls: 11, potions: 4, rings: 3, tier2: 0.95, champion: 0.42 },
    { name: 'THE ASHEN DEEP', rooms: 13, orcs: 134, classes: { grunt: 2, slinger: 2, knight: 3, shaman: 3, berserker: 3, brute: 4, warlock: 4 }, races: { orc: 4, human: 2, dwarf: 2, elf: 2 }, clerics: 3, mages: 3, dragons: { ages: { young: 1, adult: 2, ancient: 1 }, colors: ['red', 'black'] }, scrolls: 12, potions: 4, rings: 3, tier2: 0.95, champion: 0.44 },
    { name: 'THE BONEYARD OF KINGS', rooms: 14, orcs: 140, classes: { grunt: 2, slinger: 2, knight: 3, shaman: 3, berserker: 3, brute: 4, warlock: 4 }, races: { orc: 4, human: 2, dwarf: 2, elf: 2 }, clerics: 4, mages: 3, dragons: { ages: { adult: 2, ancient: 2 }, colors: ['red', 'white', 'blue', 'green', 'black'] }, scrolls: 12, potions: 4, rings: 3, tier2: 1, champion: 0.46 },
    { name: 'THE GOLDEN HOARD', rooms: 11, orcs: 60, classes: { knight: 3, shaman: 2, berserker: 3, brute: 4, warlock: 4 }, races: { orc: 4, human: 2, dwarf: 2, elf: 2 }, dragons: { ages: { adult: 2 }, colors: ['red', 'white', 'blue', 'green', 'black'] }, boss: 'wyrm', scrolls: 10, potions: 5, rings: 2, tier2: 1, champion: 0.48 }
  ],

  getPlan(depth) {
    const index = Math.max(1, Math.min(this.count, depth)) - 1;
    return this.plans[index];
  },

  // regular orcs get tougher the deeper they live, and below the warlord's
  // throne (depth 10) the climb steepens: 1.9x health and 1.6x damage on
  // the tenth floor, 3x and 2.1x on the fifteenth, 5.4x and 2.6x on the last
  hpScale(depth) {
    const deep = Math.max(0, depth - 10);
    return 1 + (depth - 1) * 0.1 + deep * deep * 0.025;
  },

  damageScale(depth) {
    const deep = Math.max(0, depth - 10);
    return 1 + (depth - 1) * 0.07 + deep * deep * 0.003;
  },

  pickClass(plan) {
    return this.pickWeighted(plan.classes, 'grunt');
  },

  pickRace(plan) {
    return plan.races ? this.pickWeighted(plan.races, 'orc') : 'orc';
  },

  pickWeighted(weights, fallback) {
    let total = 0;
    for (const name in weights) {
      total += weights[name];
    }
    let roll = Math.random() * total;
    for (const name in weights) {
      roll -= weights[name];
      if (roll < 0) {
        return name;
      }
    }
    return fallback;
  }
};

// Trials. Now and then the stairs lead not to the next floor but to a trial
// against the wizard's reflection (mirror.js): a wizard of the player's level
// with as many spells on its bar, drawn at random from the circles reached.
// A duel is fought in a small dungeon of six rooms or, now and then, an open
// arena; a battle on an open field, each wizard leading an army
// (battle.js). The first trial follows floor 2 or 3, the next ones come every
// two or three floors, and they are half duels and half battles (the mobile
// descent has no battles, only duels). A trial is
// fought on the duel scale: the wizard's health is multiplied by `hpScale`
// for the fight (a level 1 wizard has a duellist's 700) and the share left
// carries on down the stairs.
export const Trials = {
  first: [2, 3],
  every: [2, 3],
  arenaChance: 1 / 3,
  hpScale: 7,
  names: { duel: 'THE HALL OF MIRRORS', arena: 'THE MIRROR ARENA', battle: 'THE MIRRORED FIELD' },

  // The run: the dungeon floors in order, with the trials between them. A
  // trial keeps the depth of the floor above it (its circles, its foes).
  // Without `battles` every trial is a duel.
  schedule({ battles = true } = {}) {
    const after = [];
    for (let depth = randInt(...this.first); depth < DungeonLevels.count; depth += randInt(...this.every)) {
      after.push(depth);
    }
    const kinds = after.map((_, i) => (i % 2 === 0 || !battles ? 'duel' : 'battle'));
    for (let i = kinds.length - 1; i > 0; i--) {
      const j = randInt(0, i);
      [kinds[i], kinds[j]] = [kinds[j], kinds[i]];
    }
    const run = [];
    for (let depth = 1; depth <= DungeonLevels.count; depth++) {
      run.push({ kind: 'dungeon', depth });
      const i = after.indexOf(depth);
      if (i >= 0) {
        run.push({ kind: kinds[i], depth, arena: kinds[i] === 'duel' && Math.random() < this.arenaChance });
      }
    }
    return run;
  },

  name(stage) {
    return stage.arena ? this.names.arena : this.names[stage.kind];
  },

  // the reflection fights at full duel strength, so it starts gentle on the
  // upper floors and sharpens below the warlord
  difficulty(depth) {
    return depth <= 5 ? 'easy' : (depth <= 12 ? 'normal' : 'hard');
  }
};

// Orc classes. `look` picks the 3D model variant; the name shown above each
// comes from its race (Races names).
export const OrcClasses = {
  grunt: { look: 'grunt', hp: 100 },
  slinger: { look: 'slinger', hp: 90, sight: 540 },
  knight: { look: 'knight', hp: 125 },
  shaman: { look: 'shaman', hp: 125 },
  berserker: { look: 'berserker', hp: 140 },
  brute: { look: 'brute', hp: 380 },
  warlock: { look: 'warlock', hp: 150, sight: 560 }
};

// Races. Every race fields the same seven classes as the orcs (the keys of
// OrcClasses), so they share the AI and fill the same regiments; a race
// scales the class's health, speed, melee damage and shooting range, and
// picks its own looks (`<race>_<class>` models; the orcs keep the plain class
// names), names and missiles: `shot` is what its slingers loose, `bolt` what
// its warlocks cast (see BoltKinds in spells.js).
export const Races = {
  orc: {
    name: 'ORCS', hp: 1, speed: 1, damage: 1, range: 1, shot: 'stone', bolt: 'missile2',
    names: { grunt: 'GRUNT', slinger: 'SLINGER', knight: 'KNIGHT', shaman: 'SHAMAN', berserker: 'BERSERKER', brute: 'BRUTE', warlock: 'WARLOCK' }
  },
  // short, slow and very hard to kill
  dwarf: {
    name: 'DWARVES', hp: 1.3, speed: 0.8, damage: 1.05, range: 0.95, shot: 'quarrel', bolt: 'runebolt',
    names: { grunt: 'WARRIOR', slinger: 'CROSSBOWMAN', knight: 'IRONCLAD', shaman: 'RUNEPRIEST', berserker: 'SLAYER', brute: 'IRONBREAKER', warlock: 'RUNESMITH' }
  },
  // the even match, a little better armed
  human: {
    name: 'HUMANS', hp: 1.05, speed: 1, damage: 1.05, range: 1.05, shot: 'arrow', bolt: 'sunbolt',
    names: { grunt: 'MAN-AT-ARMS', slinger: 'ARCHER', knight: 'KNIGHT', shaman: 'PRIEST', berserker: 'ZEALOT', brute: 'CHAMPION', warlock: 'BATTLEMAGE' }
  },
  // quick, frail and deadly at range
  elf: {
    name: 'ELVES', hp: 0.8, speed: 1.15, damage: 1, range: 1.25, shot: 'arrow', bolt: 'moonbolt',
    names: { grunt: 'SPEARMAN', slinger: 'ARCHER', knight: 'BLADE KNIGHT', shaman: 'DRUID', berserker: 'WARDANCER', brute: 'SENTINEL', warlock: 'SORCERER' }
  }
};

// The model look of a class fielded by a race.
export function raceLook(race, orcClass) {
  const spec = OrcClasses[orcClass] || OrcClasses.grunt;
  return !race || race === 'orc' ? spec.look : race + '_' + orcClass;
}
