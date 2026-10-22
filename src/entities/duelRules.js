import { rankPower } from './spellbar.js';

// Shared duel balance: both duelists use the same numbers.
export const DuelRules = {
  hp: 700,
  stunFrames: 120,
  fearFrames: 120,
  rayHeal: 3,
  damage: {
    // per dart: a cast looses one to three by tier (spells.js MissileTiers),
    // so three darts every 44 frames about match the old 3 x 20 every 24
    missile: 36,
    fireball: 75,
    ironshot: 180,
    lightning: 70,
    chain: 70,
    ray: 15,
    pwkill: 120,
    root: 0,
    rootchain: 0,
    // per ray: a cast fans three
    scorch: 30,
    // battle soldiers' stones, arrows and quarrels, and their casters' bolts
    stone: 20,
    arrow: 20,
    quarrel: 24,
    missile2: 50,
    runebolt: 50,
    sunbolt: 50,
    moonbolt: 50
  },
  blizzardDamage: 0.25,
  blizzard2Damage: 0.5,
  // The D&D spells between wizards: damage, chill and polymorph in frames,
  // zone damage per second. Against orcs they use the dungeon numbers
  // (Arcana in arcana.js).
  arcana: {
    cone: { damage: 80, chill: 90 },
    thunder: { damage: 50 },
    meteor: { damage: 60 },
    guardians: { dps: 22 },
    cloud: { dps: 16 },
    heal: { amount: 110 },
    polymorph: { frames: 120 },
    disintegrate: { damage: 170 },
    weapon: { damage: 22 }
  },
  // Schools of magic. Casting a spell locks the rest of its school for the
  // school's `lockout` frames (spells of other schools stay free), except
  // the free spells: magic missile and the lifesteal channel.
  schools: {
    evocation: { name: 'EVOCATION', tag: 'EVO', color: '#ff8a40', lockout: 180 },
    conjuration: { name: 'CONJURATION', tag: 'CON', color: '#e0c050', lockout: 150 },
    abjuration: { name: 'ABJURATION', tag: 'ABJ', color: '#60b0ff', lockout: 240 },
    transmutation: { name: 'TRANSMUTATION', tag: 'TRA', color: '#c0e070', lockout: 240 },
    enchantment: { name: 'ENCHANTMENT', tag: 'ENC', color: '#ff80e0', lockout: 200 },
    illusion: { name: 'ILLUSION', tag: 'ILL', color: '#b090ff', lockout: 200 },
    necromancy: { name: 'NECROMANCY', tag: 'NEC', color: '#ff4060', lockout: 240 }
  },
  // every spell's school, by the player's spell id and the rival's (root)
  spellSchools: {
    missile: 'evocation', fireball: 'evocation', lightning: 'evocation', scorch: 'evocation',
    cone: 'evocation', thunder: 'evocation', meteor: 'evocation',
    ironshot: 'conjuration', blink: 'conjuration', blizzard: 'conjuration', cloud: 'conjuration', weapon: 'conjuration',
    shield: 'abjuration', guardians: 'abjuration', heal: 'abjuration',
    haste: 'transmutation', timestop: 'transmutation', polymorph: 'transmutation', disintegrate: 'transmutation', tele: 'transmutation',
    stun: 'enchantment', root: 'enchantment', fear: 'enchantment',
    image: 'illusion', invis: 'illusion',
    ray: 'necromancy', pwkill: 'necromancy'
  },
  lockFree: ['missile', 'ray'],

  schoolOf(spell) {
    return this.spellSchools[spell] || null;
  },

  // the school a cast locks, or null for the free spells
  lockedSchool(spell) {
    return this.lockFree.includes(spell) ? null : this.schoolOf(spell);
  },

  // progressive duels (see duelLoot.js): frames until the first scroll and
  // potion, frames between drops, how many may lie around at once, and what
  // potions give
  progressive: {
    firstScroll: 180,
    firstPotion: 600,
    scrollEvery: 420,
    potionEvery: 660,
    maxScrolls: 3,
    maxPotions: 2,
    redHeal: 120,
    blueManergy: 60
  },
  // reaction: frames before a new projectile is noticed
  // castLock: minimum frames between two offensive casts
  // decisionInterval: frames between movement re-plans when nothing new happens
  // aimNoise: radians of aim error
  // learnRate: how fast the lead model adapts to the player's dodging
  // decoyFoolChance: chance to chase the player's mirror image
  // pwkillRate: per-frame chance to use power word kill once it is ready
  // advanced: time stop and blink-in engages
  difficulties: {
    normal: { reaction: 16, castLock: 18, decisionInterval: 6, aimNoise: 0.12, learnRate: 0.08, decoyFoolChance: 0.8, pwkillRate: 0.01, advanced: false },
    hard: { reaction: 8, castLock: 7, decisionInterval: 3, aimNoise: 0.035, learnRate: 0.15, decoyFoolChance: 0.5, pwkillRate: 0.04, advanced: true },
    insane: { reaction: 3, castLock: 3, decisionInterval: 1, aimNoise: 0, learnRate: 0.22, decoyFoolChance: 0.25, pwkillRate: 1, advanced: true }
  },

  // Apply one spell hit to either duelist. `scale` shrinks the damage for
  // survival floors, where the player has far fewer hit points.
  applyHit(target, kind, attacker, scale = 1) {
    if (kind === 'root' || kind === 'rootchain') {
      target.stun(this.stunFrames);
      return;
    }
    // rank II of lifesteal and scorching ray (spellbar.js) hits harder
    const dmg = (this.damage[kind] || 0) * scale * rankPower(attacker, kind);
    target.hurt(dmg);
    if (kind === 'ray' && attacker) {
      attacker.hp = Math.min(attacker.maxHp, attacker.hp + this.rayHeal);
    }
    if (target.onDuelDamage) {
      target.onDuelDamage(dmg, kind);
    }
  },

  // Time for a projectile at `speed` to meet a target at (dx,dy) moving with (vx,vy).
  intercept(dx, dy, vx, vy, speed) {
    const a = (vx * vx) + (vy * vy) - (speed * speed);
    const b = 2 * ((dx * vx) + (dy * vy));
    const c = (dx * dx) + (dy * dy);
    const direct = Math.sqrt(c) / speed;
    if (Math.abs(a) < 0.0001) {
      return (b < 0) ? (-c / b) : direct;
    }
    const disc = (b * b) - (4 * a * c);
    if (disc < 0) {
      return direct;
    }
    const root = Math.sqrt(disc);
    const t1 = (-b - root) / (2 * a);
    const t2 = (-b + root) / (2 * a);
    let t = Math.min(t1, t2);
    if (t < 0) {
      t = Math.max(t1, t2);
    }
    return (t > 0) ? t : direct;
  }
};
