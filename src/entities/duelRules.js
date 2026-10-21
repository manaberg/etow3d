// Shared duel balance: both duelists use the same numbers.
export const DuelRules = {
  hp: 700,
  stunFrames: 120,
  fearFrames: 120,
  rayHeal: 3,
  damage: {
    missile: 55,
    fireball: 75,
    ironshot: 180,
    lightning: 70,
    chain: 70,
    ray: 15,
    pwkill: 120,
    root: 0,
    rootchain: 0,
    // battle orcs' stones and warlock bolts
    stone: 20,
    missile2: 50
  },
  blizzardDamage: 0.25,
  blizzard2Damage: 0.5,
  // global cooldown: after any spell, every other spell waits this many frames,
  // except the ones listed as free (magic missile and the lifesteal channel)
  gcd: 180,
  gcdFree: ['missile', 'ray'],

  onGcd(spell) {
    return !this.gcdFree.includes(spell);
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

  // Apply one spell hit to either duelist.
  applyHit(target, kind, attacker) {
    if (kind === 'root' || kind === 'rootchain') {
      target.stun(this.stunFrames);
      return;
    }
    const dmg = this.damage[kind] || 0;
    target.hurt(dmg);
    if (kind === 'ray' && attacker) {
      attacker.hp = Math.min(this.hp, attacker.hp + this.rayHeal);
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
