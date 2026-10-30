import * as THREE from 'three';
import { Entity } from '../core/entity.js';
import { UNIT } from '../core/constants.js';
import { buildMage, buildSheep, glowMap } from '../render/models.js';
import { Projectile, Zone, MirrorImage, castMissiles, missileTier, staffHead } from './spells.js';
import { DuelRules } from './duelRules.js';
import { Arcana, castArcana, arcanaHit, arcanaZoneDamage, liftHeight, pullToward } from './arcana.js';
import { arcanaFx } from './enemy.js';
import { Inventory, StatCaps, applyGearPools, gearStat } from './gear.js';
import { dressRig } from '../render/gearModels.js';
import { BarSlots, GLOBAL_COOLDOWN, WizardLevels, RankRules, placementOrder, rankOf, rankPower, rankCooldown } from './spellbar.js';

// The spell book. `cd` is the cooldown in frames, `need` the manergy that
// must be exceeded and `cost` what a cast spends; `flag` is the spellbook
// entry a scroll unlocks and `tier` the flag its rank II sets (the 2D game's
// tier 2). `circle` is the spell's circle as the spellbook names it (any
// spell can drop on any floor), `grows` what rank II adds 30% to (spellbar.js
// RankRules), `text` what the spellbook says it does and `lore` a line of
// flavour under it. Spells are cast from the bar's slots (spellbar.js
// BarSlots); magic missile has its own key.
export const SpellBook = [
  { id: 'missile', name: 'MAGIC MISSILE', cd: 24, need: 0, cost: 0, flag: null, circle: 0, rank2: 'TWO DARTS', rank3: 'THREE DARTS', text: 'Darts that curve in on the foe nearest the cursor and shoot down simple bolts. Hold to keep casting.', lore: 'The first spell every apprentice learns, and the last one many of them cast.' },
  { id: 'fireball', name: 'FIREBALL', cd: 48, need: 20, cost: 20, flag: 'hasFireball', tier: 'hasFb2', circle: 1, rank2: 'A SECOND ORB BESIDE THE FIRST', text: 'An orb that bursts on the first foe and scorches those around it.', lore: 'Orc warbands have a word for a wizard with a fireball. None of them is polite.' },
  { id: 'lightning', name: 'CHAIN LIGHTNING', cd: 200, need: 30, cost: 30, flag: 'hasLightning', tier: 'hasLg2', circle: 2, rank2: 'EVERY JUMP HITS AS HARD AS THE FIRST', text: 'Locks on to the nearest foe and jumps from it to every foe close by.', lore: 'It never strikes only once; that is the whole point of it.' },
  { id: 'ironshot', name: 'IRON SHOT', cd: 300, need: 40, cost: 40, flag: 'hasIronshot', tier: 'hasIs2', circle: 1, rank2: 'TWO CHARGES', text: 'A heavy bolt that pierces through every foe in its line.', lore: 'Conjured iron, heavier than anything poured in the Iron Forges, and just as unwilling to stop.' },
  { id: 'blink', name: 'BLINK', cd: 400, need: 40, cost: 40, flag: 'hasBlink', tier: 'hasBk2', circle: 1, rank2: 'COOLDOWN HALVED', text: 'Teleports you to the cursor, onto open floor only.', lore: 'Between here and there lies a place no one should linger. Blink does not.' },
  { id: 'timestop', name: 'TIME STOP', cd: 1000, need: 50, cost: 70, flag: 'hasTimestop', circle: 4, grows: 'DURATION', text: 'Slows the world around you to a crawl; you and your spells keep full speed.', lore: 'The world holds its breath. The wizard does not.' },
  { id: 'haste', name: 'HASTE', cd: 1000, need: 70, cost: 70, flag: 'hasHaste', circle: 2, grows: 'DURATION', text: 'You run two and a half times as fast for a while.', lore: 'Running is the oldest spell of all, and still the one that has saved the most wizards.' },
  { id: 'image', name: 'MIRROR IMAGE', cd: 1000, need: 50, cost: 50, flag: 'hasImage', circle: 2, text: 'A copy of you that draws the foes\' attention.', lore: 'Orcs swear the wizard of the halls has a twin. They are half right.' },
  { id: 'stun', name: 'CHAIN ROOT', cd: 400, need: 30, cost: 30, flag: 'hasStun', circle: 2, text: 'Roots the nearest foe to the spot, and every foe close to it.', lore: 'Roots older than the Warrens wake at the word and hold whatever stands on them.' },
  { id: 'shield', name: 'SHIELD', cd: 200, need: 40, cost: 40, flag: 'hasShield', circle: 1, grows: 'DURATION', text: 'A bubble that turns blows and sends bolts back at their caster.', lore: 'Not a wall but a mirror: whatever is thrown at it goes home.' },
  { id: 'blizzard', name: 'BLIZZARD', cd: 600, need: 40, cost: 40, flag: 'hasBlizzard', tier: 'hasBz2', circle: 3, rank2: 'TWICE THE RADIUS', text: 'A storm of ice at the cursor that hurts and slows everything in it.', lore: 'A winter folded small, carried down the stairs and let out all at once.' },
  { id: 'ray', name: 'LIFESTEAL', cd: 0, need: 10, cost: 10, flag: 'hasRay', circle: 2, grows: 'DAMAGE', text: 'Hold for a red ray that drains your foe\'s life into yours.', lore: 'Blood remembers whose it was, and flows home along the red thread.' },
  { id: 'invis', name: 'INVISIBILITY', cd: 1000, need: 70, cost: 70, flag: 'hasInvis', circle: 3, grows: 'DURATION', text: 'Foes lose sight of you until it wears off.', lore: 'The trick is not to vanish. The trick is to make them forget where to look.' },
  { id: 'fear', name: 'FEAR', cd: 400, need: 50, cost: 50, flag: 'hasFear', circle: 2, grows: 'REACH', text: 'Foes around you flee in a panic.', lore: 'Every creature is born with a terror. This only reminds it.' },
  { id: 'pwkill', name: 'POWER WORD KILL', cd: 300, need: 50, cost: 30, flag: 'hasPwkill', tier: 'hasPwk2', circle: 4, rank2: 'A WIDER, DEEPER SPLASH', text: 'Hover a foe: a word that kills it, and wounds those around it.', lore: 'Some words should never be spoken. This was the first of them.' },
  { id: 'tele', name: 'TELEKINESIS', cd: 1000, need: 20, cost: 20, flag: 'hasTele', circle: 2, text: 'Hover loot to pull it to you from afar.', lore: 'A good wizard never fetches anything. A good wizard asks it to come.' },
  // D&D spells new to the 3D game (see arcana.js)
  { id: 'scorch', name: 'SCORCHING RAY', cd: 90, need: 25, cost: 25, flag: 'hasScorch', circle: 1, grows: 'DAMAGE', text: 'Three fire bolts fanned around your aim.', lore: 'Three threads of fire spun from a single breath: an apprentice\'s first real power.' },
  { id: 'cone', name: 'CONE OF COLD', cd: 240, need: 35, cost: 35, flag: 'hasCone', circle: 2, grows: 'DAMAGE', text: 'Damages and chills every foe in front of you.', lore: 'The Frozen Cisterns breathe like this. The wizard only borrows their breath.' },
  { id: 'thunder', name: 'THUNDERWAVE', cd: 300, need: 30, cost: 30, flag: 'hasThunder', circle: 1, grows: 'DAMAGE', text: 'Blasts the foes around you away.', lore: 'First the sound arrives. Then the orcs arrive somewhere else entirely.' },
  { id: 'meteor', name: 'METEOR SWARM', cd: 900, need: 70, cost: 70, flag: 'hasMeteor', circle: 4, grows: 'DAMAGE', text: 'Rocks rain down around the cursor.', lore: 'The sky is twenty floors of rock away. The stars come down anyway.' },
  { id: 'guardians', name: 'SPIRIT GUARDIANS', cd: 1000, need: 60, cost: 60, flag: 'hasGuardians', circle: 3, grows: 'DAMAGE', text: 'A damaging, slowing aura that follows you.', lore: 'The spirits of wizards who fell on the way down, still keeping watch over those who did not.' },
  { id: 'cloud', name: 'CLOUDKILL', cd: 700, need: 50, cost: 50, flag: 'hasCloud', circle: 3, grows: 'DAMAGE', text: 'A poison cloud at the cursor that rolls away from you.', lore: 'Bottled in the Venom Mires. Uncork it upwind.' },
  { id: 'heal', name: 'HEALING WORD', cd: 600, need: 40, cost: 40, flag: 'hasHeal', circle: 1, grows: 'HEALING', text: 'Heals you at once.', lore: 'One word, softly spoken, and the wound forgets it was ever there.' },
  { id: 'polymorph', name: 'POLYMORPH', cd: 500, need: 40, cost: 40, flag: 'hasPolymorph', circle: 3, grows: 'DURATION', text: 'Hover a foe to turn it into a sheep for a while (bosses and dragons not for long, a wizard only briefly).', lore: 'Orcs have no word for sheep. They have learnt to fear the bleating.' },
  { id: 'disintegrate', name: 'DISINTEGRATE', cd: 360, need: 50, cost: 50, flag: 'hasDisintegrate', circle: 3, grows: 'DAMAGE', text: 'A ray into the first foe in line.', lore: 'It leaves nothing to bury, which the Bone Crypts consider very rude.' },
  { id: 'weapon', name: 'SPIRITUAL WEAPON', cd: 900, need: 50, cost: 50, flag: 'hasWeapon', circle: 3, grows: 'DAMAGE', text: 'A spectral sword that fights beside you.', lore: 'It needs no hand to hold it and never tires of the work.' },
  // ten more, each working in a way no other spell does (arcana.js)
  { id: 'sleep', name: 'SLEEP', cd: 600, need: 30, cost: 30, flag: 'hasSleep', circle: 1, grows: 'HEALTH IT CAN LULL', text: 'The weakest foes around the cursor fall asleep, as many as its pool of health covers, and the rest doze; a blow wakes them. Bosses and dragons wake sooner, and a wizard only dozes.', lore: 'Even orcs dream, mostly of other orcs losing.' },
  { id: 'agathys', name: 'ARMOR OF AGATHYS', cd: 900, need: 40, cost: 40, flag: 'hasAgathys', circle: 1, grows: 'WARD', text: 'A coat of frost that takes the next blows for you; whoever strikes you through it is bitten by the cold and chilled.', lore: 'Named for a wizard of the Frozen Cisterns whom nobody ever struck twice.' },
  { id: 'curse', name: 'BESTOW CURSE', cd: 500, need: 30, cost: 30, flag: 'hasCurse', circle: 2, grows: 'DURATION', text: 'Hover a foe: it takes half again as much damage from everything for ten seconds (a wizard a quarter more, for five).', lore: 'The old words cling like soot, and every blow finds the mark they leave.' },
  { id: 'sphere', name: 'FLAMING SPHERE', cd: 800, need: 40, cost: 40, flag: 'hasSphere', circle: 2, grows: 'DAMAGE', text: 'A ball of fire that rolls after your cursor and burns whatever it touches.', lore: 'It rolls where you look, and it is always hungry.' },
  { id: 'counter', name: 'COUNTERSPELL', cd: 600, need: 30, cost: 30, flag: 'hasCounter', circle: 2, grows: 'REACH', text: 'Unmakes the hostile bolts, meteors and spheres around you and silences the casters near you for a while.', lore: 'The rarest art: a spell that unmakes another. The Red Order teaches it last.' },
  { id: 'swap', name: 'TRANSPOSITION', cd: 500, need: 30, cost: 30, flag: 'hasSwap', circle: 2, text: 'Hover a foe in sight: you trade places with it.', lore: 'The safest place in a fight is sometimes exactly where your foe is standing.' },
  { id: 'phantasm', name: 'PHANTASMAL KILLER', cd: 600, need: 45, cost: 45, flag: 'hasPhantasm', circle: 3, grows: 'DAMAGE', text: 'Hover a foe: its worst nightmare hunts it for five seconds; it flees in terror, and the terror eats at it.', lore: 'The killer is not real. The fear is, and fear is enough.' },
  { id: 'confusion', name: 'CONFUSION', cd: 700, need: 45, cost: 45, flag: 'hasConfusion', circle: 3, grows: 'DURATION', text: 'Foes around the cursor lose their wits: orcs and their kind fall on each other, bigger foes reel, and a wizard\'s spells fly wild.', lore: 'For a few heartbeats every face looks like a foe\'s. Orcs never could tell each other apart.' },
  { id: 'maelstrom', name: 'MAELSTROM', cd: 800, need: 55, cost: 55, flag: 'hasMaelstrom', circle: 3, grows: 'DAMAGE', text: 'A whirlpool at the cursor that drags foes toward its eye and batters them.', lore: 'Called up from the drowned stacks of the Sunken Library, where the water still turns the pages.' },
  { id: 'gravity', name: 'REVERSE GRAVITY', cd: 900, need: 70, cost: 70, flag: 'hasGravity', circle: 4, grows: 'DAMAGE', text: 'Foes around the cursor fall upward, hang helpless, then crash back down.', lore: 'For a moment the floor is the ceiling. Then, all at once, it is the floor again.' }
];

export const SpellById = {};
for (const spell of SpellBook) {
  SpellById[spell.id] = spell;
}

// share of its speed a chilled or polymorphed wizard keeps
const CHILL_SLOW = 0.4;
const SHEEP_SLOW = 0.7;

// Damage the player takes from enemy bolts outside duels.
const ENEMY_BOLT_DAMAGE = { iceshard: 16, stormbolt: 30, acidbolt: 26, stone: 20, missile2: 50, fireball2: 75, ironshot2: 200, arrow: 20, quarrel: 24, runebolt: 50, sunbolt: 50, moonbolt: 50 };

// Polymorphed wizards: the body is hidden and a sheep trots in its place.
export function syncSheep(wizard, time) {
  const sheep = wizard.sheepFrames > 0;
  if (sheep && !wizard.sheep) {
    wizard.sheep = buildSheep();
    wizard.rig.root.add(wizard.sheep);
  }
  if (wizard.sheep) {
    wizard.sheep.visible = sheep;
    wizard.rig.body.visible = !sheep;
    if (sheep) {
      const speed = Math.hypot(wizard.vel.x, wizard.vel.y);
      wizard.sheep.position.y = Math.abs(Math.sin(time * 8)) * 0.08 * Math.min(1, speed / 20);
    }
  }
}

export class Mage extends Entity {
  defaults() {
    this.maxManergy = 100;
    this.manergy = 100;
    this.hp = 100;
    this.maxHp = 100;
    this.desiredVel = 115;
    // survival: the item a click on its name sent the wizard to (updateLootClick)
    this.walkTo = null;
    this.walkBest = Infinity;
    this.walkStall = 0;
    // a spell being spoken (power word kill): { target, left, total }
    this.channel = null;
    // cooldown frames left per spell (0 = ready), and the length of a wait
    // longer than the spell's own cooldown (one just put on the bar)
    this.cdFull = {};
    this.cd = {};
    for (const spell of SpellBook) {
      this.cd[spell.id] = 0;
    }
    // frames of the global cooldown left (spellbar.js GLOBAL_COOLDOWN), and
    // whether the lifesteal ray is being held (it pays the cooldown once)
    this.gcd = 0;
    this.rayOn = false;
    // the 2D game started a few spells on cooldown
    this.is2Charges = 1;
    // magic missile darts per cast, 1 to 3: each magic missile scroll adds one
    this.missileTier = 1;
    // buffs (frames left) and debuffs
    this.shieldFrames = 0;
    this.hasteFrames = 0;
    this.invisFrames = 0;
    this.timestopFrames = 0;
    this.shieldDuration = 125;
    this.hasteDuration = 250;
    this.invisDuration = 250;
    this.timestopDuration = 225;
    this.isStunned = false;
    this.stunFrames = 0;
    this.stunDuration = 200;
    this.isFeared = false;
    this.fearFrames = 0;
    this.fearDuration = 120;
    this.fearVel = { x: 0, y: 0 };
    // the rival's D&D spells: chill (cone of cold), knockback (thunderwave)
    // and polymorph (a sheep cannot cast)
    this.chillFrames = 0;
    this.knock = null;
    this.sheepFrames = 0;
    // and the newer ones (arcana.js, as on monsters in enemy.js): sleep (a
    // blow wakes it), a curse, a nightmare, confusion (stumbling, wild aim),
    // reverse gravity and silence (a long global cooldown, `gcdSpan` long);
    // armor of agathys is its own ward
    this.sleepFrames = 0;
    this.sleepHp = 0;
    this.curseFrames = 0;
    this.curseMult = 1;
    this.nightmare = null;
    this.confusedFrames = 0;
    this.lift = null;
    this.gcdSpan = 0;
    this.wardHp = 0;
    this.wardMax = 0;
    this.wardFrames = 0;
    // spellbook
    for (const spell of SpellBook) {
      if (spell.flag) {
        this[spell.flag] = false;
      }
      if (spell.tier) {
        this[spell.tier] = false;
      }
    }
    // the spell bar (spellbar.js): the spell prepared in each slot, how many
    // slots are open, and the order spells were learnt in (the newest one in
    // the book takes a slot that opens)
    this.bar = BarSlots.map(() => null);
    this.slotLimit = WizardLevels.slotsAt(1);
    this.learnOrder = [];
    // spell ranks (1 to 3; magic missile's are its darts), and the survival level
    this.ranks = {};
    this.level = 1;
    this.xp = 0;
    // gear (gear.js): what it carries and wears, the summed properties of the
    // worn gear, and bonuses that come with the mode rather than with items
    this.inventory = null;
    this.gearStats = {};
    this.innate = {};
    this.timePlayed = 0;
    this.aim = 0;
    this.dead = false;
    this.isWizard = true;
  }

  init() {
    this.rig = buildMage();
    this.view = this.rig.root;
    this.game.gfx.add(this.view);
    if (!this.inventory) {
      this.inventory = new Inventory(this);
    }
    this.shieldBubble = new THREE.Mesh(
      new THREE.SphereGeometry(1.45, 20, 14),
      new THREE.MeshBasicMaterial({ color: 0x60b0ff, transparent: true, opacity: 0.22, blending: THREE.AdditiveBlending, depthWrite: false })
    );
    this.shieldBubble.userData.keepOpacity = true;
    this.shieldBubble.position.y = 1.4;
    this.shieldBubble.visible = false;
    this.view.add(this.shieldBubble);
    this.rootMark = new THREE.Mesh(
      new THREE.RingGeometry(0.6, 1.1, 20),
      new THREE.MeshBasicMaterial({ map: glowMap(), color: 0x40ff60, transparent: true, opacity: 0.7, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide })
    );
    this.rootMark.userData.keepOpacity = true;
    this.rootMark.rotation.x = -Math.PI / 2;
    this.rootMark.position.y = 0.06;
    this.rootMark.visible = false;
    this.view.add(this.rootMark);
    // armor of agathys: a lattice of frost around the wizard
    this.frostShell = new THREE.Mesh(
      new THREE.IcosahedronGeometry(1.25, 1),
      new THREE.MeshBasicMaterial({ color: 0xbfe8ff, wireframe: true, transparent: true, opacity: 0.4, blending: THREE.AdditiveBlending, depthWrite: false })
    );
    this.frostShell.userData.keepOpacity = true;
    this.frostShell.position.y = 1.3;
    this.frostShell.visible = false;
    this.view.add(this.frostShell);
  }

  get shielded() {
    return this.shieldFrames > 0;
  }

  // A gear property plus the mode's innate bonus, within the caps.
  bonus(key) {
    const value = (this.innate[key] || 0) + gearStat(this, key);
    const cap = StatCaps[key];
    if (cap === undefined) {
      return value;
    }
    return cap < 0 ? Math.max(cap, value) : Math.min(cap, value);
  }

  // Cooldown frames for a spell after gear that speeds cooldowns up.
  cooldownOf(frames) {
    return frames * (1 - this.bonus('cooldown'));
  }

  // The inventory changed: resize the pools and redress the model.
  onGearChanged() {
    applyGearPools(this);
    dressRig(this.rig, this.inventory);
  }

  // Wears an inventory carried down from the floor above (its properties
  // already counted in the carried pools).
  takeInventory(inventory) {
    this.inventory = inventory;
    inventory.owner = this;
    dressRig(this.rig, inventory);
  }

  get hasted() {
    return this.hasteFrames > 0;
  }

  get invis() {
    return this.invisFrames > 0;
  }

  // Off its own cooldown and, magic missile aside, the global one.
  ready(id) {
    return this.cd[id] <= 0 && (id === 'missile' || this.gcd <= 0);
  }

  spend(id, extraCost) {
    const spell = SpellById[id];
    this.cd[id] = this.cooldownOf(spell.cd * rankCooldown(this, id));
    this.manergy -= this.costOf(spell.cost + (extraCost || 0));
    this.gcd = GLOBAL_COOLDOWN;
  }

  // Manergy a cast spends, after gear that makes spells cheaper.
  costOf(cost) {
    return cost * (1 - this.bonus('costCut'));
  }

  // Asleep or hanging in the air: it can neither move nor cast.
  get helpless() {
    return this.sleepFrames > 0 || !!this.lift;
  }

  canCast(id) {
    const spell = SpellById[id];
    if (spell.flag && !this[spell.flag]) {
      return false;
    }
    return this.ready(id) && this.manergy > spell.need;
  }

  // ------------------------------------------------------------ spellbook and bar

  knowsSpell(id) {
    const spell = SpellById[id];
    return !!spell && (!spell.flag || !!this[spell.flag]);
  }

  // The spell sits in an open slot of the bar, so it can be cast.
  prepared(id) {
    const i = this.bar.indexOf(id);
    return i >= 0 && i < this.slotLimit;
  }

  // The key of the slot holding `id` went down this step (`held`: is down).
  wants(id, held) {
    const i = this.bar.indexOf(id);
    if (i < 0 || i >= this.slotLimit) {
      return false;
    }
    const input = this.game.input;
    return held ? input.state(BarSlots[i].action) : input.pressed(BarSlots[i].action);
  }

  // Spells known but not on the bar, newest first.
  waitingInBook() {
    return this.learnOrder.filter((id) => this.knowsSpell(id) && !this.prepared(id)).reverse();
  }

  // A new spell for the book. It takes the first free slot that suits it
  // (spellbar.js placementOrder) or waits in the book. Returns the slot, or -1.
  learnSpell(id, rank = 1) {
    const spell = SpellById[id];
    this[spell.flag] = true;
    this.ranks[id] = Math.max(this.ranks[id] || 1, rank);
    if (!this.learnOrder.includes(id)) {
      this.learnOrder.push(id);
    }
    this.syncTierFlags();
    return this.autoPrepare(id);
  }

  autoPrepare(id) {
    const at = this.bar.indexOf(id);
    if (at >= 0 && at < this.slotLimit) {
      return at;
    }
    if (at >= 0) {
      this.bar[at] = null;
    }
    for (const i of placementOrder(id, SpellById[id].cd)) {
      if (i < this.slotLimit && !this.bar[i]) {
        this.bar[i] = id;
        return i;
      }
    }
    return -1;
  }

  // One rank up (to RankRules.max). Magic missile's ranks are its darts.
  rankUp(id) {
    if (id === 'missile') {
      this.missileTier = Math.min(RankRules.max, (this.missileTier || 1) + 1);
      return this.missileTier;
    }
    this.ranks[id] = Math.min(RankRules.max, (this.ranks[id] || 1) + 1);
    if (id === 'ironshot' && this.ranks[id] === 2) {
      this.is2Charges = 2;
    }
    this.syncTierFlags();
    return this.ranks[id];
  }

  // The six spells with a rank II of their own keep the 2D game's tier flags.
  syncTierFlags() {
    for (const id in RankRules.tierFlags) {
      this[RankRules.tierFlags[id]] = this.knowsSpell(id) && rankOf(this, id) >= 2;
    }
  }

  // Puts a spell on the bar at `slot`; the one there goes back to the book,
  // or, when the spell came from another slot, the two swap. A spell brought
  // in from the book starts on its cooldown (WizardLevels.prepareFrames at
  // least) so swapping mid-fight is never free.
  prepare(id, slot) {
    if (slot < 0 || slot >= this.slotLimit || !this.knowsSpell(id)) {
      return;
    }
    const from = this.bar.indexOf(id);
    if (from >= 0 && from < this.slotLimit) {
      this.swapSlots(from, slot);
      return;
    }
    if (from >= 0) {
      this.bar[from] = null;
    }
    this.bar[slot] = id;
    const spell = SpellById[id];
    this.cd[id] = Math.max(this.cd[id] || 0, this.cooldownOf(spell.cd * rankCooldown(this, id)), WizardLevels.prepareFrames);
    this.cdFull[id] = this.cd[id];
  }

  swapSlots(a, b) {
    const spell = this.bar[a];
    this.bar[a] = this.bar[b];
    this.bar[b] = spell;
  }

  unprepare(slot) {
    this.bar[slot] = null;
  }

  // Opens (or closes) slots: spells in closed slots go back to the book, and
  // the newest spells waiting in the book take the slots that opened.
  // Returns the slots that opened.
  setSlotLimit(n) {
    const before = this.slotLimit;
    this.slotLimit = Math.max(0, Math.min(BarSlots.length, n));
    for (let i = this.slotLimit; i < this.bar.length; i++) {
      this.bar[i] = null;
    }
    const opened = [];
    for (let i = before; i < this.slotLimit; i++) {
      opened.push(i);
    }
    for (const id of this.waitingInBook()) {
      if (this.autoPrepare(id) < 0) {
        break;
      }
    }
    return opened;
  }

  // Experience (none in the trials): each level adds a little health and
  // manergy and may open a slot on the bar (spellbar.js WizardLevels).
  gainXp(amount) {
    if (this.game.duelMode || this.dead || amount <= 0) {
      return;
    }
    this.xp += amount;
    const table = WizardLevels.xp;
    while (this.level < WizardLevels.max && this.xp >= table[this.level + 1]) {
      this.level++;
      this.maxHp += WizardLevels.hp;
      this.hp += WizardLevels.hp;
      this.maxManergy += WizardLevels.manergy;
      this.manergy += WizardLevels.manergy;
      const opened = this.setSlotLimit(Math.max(this.slotLimit, WizardLevels.slotsAt(this.level)));
      this.game.onPlayerLevel(this, opened);
    }
  }

  update(k) {
    const game = this.game;
    const input = game.input;
    this.timePlayed += k / 60;
    this.tickTimers(k);
    // battles: while the armies deploy, or while the wizard commands them,
    // it stands still and casts nothing (but still regenerates and can fall)
    const standing = (!!game.battle && (!game.battle.fighting || game.battle.commander)) || !!this.channel;
    this.updateLootClick();

    // movement
    // gear speeds it up (the ring of speed adds a fifth, as 100 -> 120 did in the 2D game)
    let speed = this.desiredVel * (1 + this.bonus('speed'));
    if (this.hasted) {
      speed *= 2.5;
    }
    if (this.chillFrames > 0) {
      speed *= CHILL_SLOW;
    }
    if (this.sheepFrames > 0) {
      speed *= SHEEP_SLOW;
    }
    if (this.isStunned || standing || this.helpless) {
      this.vel.x = 0;
      this.vel.y = 0;
    } else if (this.isFeared) {
      // feared: stumble in random directions until it wears off
      if (Math.floor(this.fearFrames) % 20 === 0 || (this.fearVel.x === 0 && this.fearVel.y === 0)) {
        const a = Math.random() * Math.PI * 2;
        this.fearVel = { x: Math.cos(a) * speed, y: Math.sin(a) * speed };
      }
      this.vel.x = this.fearVel.x;
      this.vel.y = this.fearVel.y;
    } else {
      // the keys, plus the on-screen joystick on a touch screen
      let mx = input.stick.x;
      let my = input.stick.y;
      if (input.state('up')) { my -= 1; }
      if (input.state('down')) { my += 1; }
      if (input.state('left')) { mx -= 1; }
      if (input.state('right')) { mx += 1; }
      if (mx || my) {
        // the keys (and the joystick) move the way the camera looks
        this.walkTo = null;
        const dir = game.gfx.alignToView(mx, my);
        mx = dir.x;
        my = dir.y;
      } else if (this.walkTo) {
        const t = this.walkTo.center();
        const c = this.center();
        mx = t.x - c.x;
        my = t.y - c.y;
      }
      const len = Math.hypot(mx, my) || 1;
      this.vel.x = (mx / len) * speed;
      this.vel.y = (my / len) * speed;
    }
    const slow = game.zoneSlow(this);
    this.vel.x *= slow;
    this.vel.y *= slow;

    // manergy
    if (this.manergy < this.maxManergy) {
      this.manergy = Math.min(this.maxManergy, this.manergy + 0.4 * (1 + this.bonus('regen')) * k);
    }
    // gear that mends wounds
    const mend = this.bonus('mend');
    if (mend > 0 && this.hp > 0 && this.hp < this.maxHp) {
      this.hp = Math.min(this.maxHp, this.hp + mend / 60 * k);
    }

    if (this.channel) {
      this.speakWord(k);
    } else if (!standing && this.sheepFrames <= 0 && !this.helpless) {
      this.castSpells();
    }
    this.move(k);
    this.reachLoot(k);
    if (this.knock && !this.lift) {
      const res = game.world.trace(this.pos.x, this.pos.y, this.size.x, this.size.y, this.knock.x * k, this.knock.y * k);
      this.pos.x = res.x;
      this.pos.y = res.y;
      this.knock.frames -= k;
      if (this.knock.frames <= 0) {
        this.knock = null;
      }
    }

    if (this.hp <= 0 && !this.dead) {
      this.dead = true;
      game.onPlayerDeath(this);
    }
  }

  // Survival: a left click on a hovered item's name sends the wizard to it
  // (WASD takes over again).
  updateLootClick() {
    const input = this.game.input;
    if (!input.pressed('click')) {
      return;
    }
    const item = this.game.pointedItem();
    if (item) {
      this.walkTo = item;
      this.walkBest = Infinity;
      this.walkStall = 0;
    }
  }

  // Picks up the item it walked to, or gives up once a wall keeps it from
  // getting any closer.
  reachLoot(k) {
    const item = this.walkTo;
    if (!item) {
      return;
    }
    if (item.killed) {
      this.walkTo = null;
      return;
    }
    if (this.touches(item)) {
      this.walkTo = null;
      item.pickUp(this);
      return;
    }
    const d = this.distanceTo(item);
    if (d < this.walkBest - 1) {
      this.walkBest = d;
      this.walkStall = 0;
    } else if ((this.walkStall += k) > 30) {
      this.walkTo = null;
    }
  }

  tickTimers(k) {
    for (const id in this.cd) {
      if (this.cd[id] > 0) {
        this.cd[id] = Math.max(0, this.cd[id] - k);
      }
    }
    if (this.cd.ironshot <= 0 && this.is2Charges <= 0) {
      this.is2Charges = this.hasIs2 ? 2 : 1;
    }
    this.gcd = Math.max(0, this.gcd - k);
    this.chillFrames = Math.max(0, this.chillFrames - k);
    // gear that steadies the mage wears roots, fear and polymorph off faster
    const steady = 1 / (1 - this.bonus('steadfast'));
    if (this.sheepFrames > 0) {
      this.sheepFrames = Math.max(0, this.sheepFrames - k * steady);
      if (this.sheepFrames === 0) {
        const c = this.center();
        this.game.fx.burst(c.x, c.y, 1.2, { color: [0xff80e0, 0xffffff], count: 30, speed: 5, life: 0.5, size: 0.9 });
      }
    }
    this.shieldFrames = Math.max(0, this.shieldFrames - k);
    this.hasteFrames = Math.max(0, this.hasteFrames - k);
    this.invisFrames = Math.max(0, this.invisFrames - k);
    this.timestopFrames = Math.max(0, this.timestopFrames - k);
    this.tickArcana(k, steady);
    if (this.isStunned) {
      this.stunFrames += k * steady;
      if (this.stunFrames >= this.stunDuration) {
        this.isStunned = false;
        this.stunFrames = 0;
      }
    }
    if (this.isFeared) {
      this.fearFrames += k * steady;
      if (this.fearFrames >= this.fearDuration) {
        this.isFeared = false;
        this.fearFrames = 0;
      }
    }
  }

  // The newer spells' effects, one step; gear that steadies the wizard
  // (`steady`) wears sleep and confusion off faster too.
  tickArcana(k, steady) {
    if (this.gcd <= 0) {
      this.gcdSpan = 0;
    }
    this.curseFrames = Math.max(0, this.curseFrames - k);
    this.confusedFrames = Math.max(0, this.confusedFrames - k * steady);
    if (this.wardHp > 0) {
      this.wardFrames -= k;
      if (this.wardFrames <= 0) {
        this.wardHp = 0;
      }
    }
    const n = this.nightmare;
    if (n) {
      n.frames -= k;
      this.hurt(n.dps / 60 * k, true);
      if (n.frames <= 0) {
        this.nightmare = null;
      }
    }
    if (this.sleepFrames > 0) {
      this.sleepFrames = Math.max(0, this.sleepFrames - k * steady);
      if (this.hp < this.sleepHp - 0.5) {
        this.sleepFrames = 0;
      }
      this.sleepHp = Math.max(this.sleepHp, this.hp);
    }
    if (this.lift) {
      this.lift.frames -= k;
      if (this.lift.frames <= 0) {
        const caster = this.lift.caster;
        this.lift = null;
        arcanaHit(caster, this, 'gravity', Arcana.gravity.damage);
        const c = this.center();
        this.game.fx.burst(c.x, c.y, 0.3, { color: [0x8a7a6a, 0xc0b0a0], count: 24, speed: 4, life: 0.6, size: 1.2, flat: true });
      }
    }
  }

  castSpells() {
    const game = this.game;
    const input = game.input;
    const stats = game.stats;
    const c = this.center();
    const mouse = input.ground;
    this.aim = Math.atan2(mouse.y - c.y, mouse.x - c.x);
    if (this.confusedFrames > 0) {
      // confused: the spells fly wild
      this.aim += (Math.random() - 0.5) * 1.4;
    }
    const aim = this.aim;
    const fire = (kind, angle, x = c.x, y = c.y) => game.spawn(Projectile, x, y, { kind, angle, team: 'player', timeOwner: this });

    if (input.state('missile') && this.ready('missile')) {
      // the darts home in on the foe under (or near) the cursor, else on the spot
      const target = game.hoveredHostile() || game.hostileNear(mouse, 120) || { x: mouse.x, y: mouse.y };
      castMissiles(game, this, 'player', aim, target);
      this.cd.missile = this.cooldownOf(missileTier(this).cd);
      stats.micount++;
      this.rig.swing();
    }
    if (this.wants('fireball') && this.canCast('fireball')) {
      fire('fireball', aim);
      stats.fbcount++;
      let extra = this.bonus('fireballCost');
      if (this.hasFb2) {
        // tier 2 throws a second orb a little apart
        const ox = Math.cos(aim + Math.PI / 2) * 14;
        const oy = Math.sin(aim + Math.PI / 2) * 14;
        fire('fireball', aim + 0.06, c.x + ox, c.y + oy);
        extra += 10;
      }
      this.spend('fireball', extra);
      this.rig.swing();
    }
    if (this.wants('ironshot') && this.hasIronshot && this.is2Charges > 0 && this.ready('ironshot') && this.manergy > SpellById.ironshot.need) {
      fire('ironshot', aim);
      stats.iscount++;
      this.manergy -= this.costOf(SpellById.ironshot.cost);
      this.gcd = GLOBAL_COOLDOWN;
      if (this.is2Charges === 1) {
        this.cd.ironshot = this.cooldownOf(SpellById.ironshot.cd * rankCooldown(this, 'ironshot'));
      }
      this.is2Charges--;
      game.gfx.addShake(0.25);
      this.rig.swing();
    }
    // the lifesteal ray is held: starting it waits for and starts the global
    // cooldown, keeping it going does not
    if (this.wants('ray', true) && this.hasRay && this.cd.ray <= 0 && this.manergy > SpellById.ray.need && (this.rayOn || this.gcd <= 0)) {
      if (!this.rayOn) {
        this.gcd = GLOBAL_COOLDOWN;
      }
      this.rayOn = true;
      fire('ray', aim + (Math.random() - 0.5) * 0.05);
      stats.lscount++;
      this.manergy -= this.costOf(SpellById.ray.cost);
    } else {
      this.rayOn = false;
    }
    if (this.wants('lightning') && this.canCast('lightning')) {
      const target = game.nearestHostile(this, 300);
      if (target) {
        fire('lightning', this.angleTo(target));
        stats.lgcount++;
        this.spend('lightning', this.bonus('lightningCost') + (this.hasLg2 ? 15 : 0));
        this.rig.swing();
      }
    }
    if (this.wants('stun') && this.canCast('stun')) {
      const target = game.nearestHostile(this, 300);
      if (target) {
        fire('root', this.angleTo(target));
        stats.crcount++;
        this.spend('stun');
        this.rig.swing();
      }
    }
    if (this.wants('timestop') && this.canCast('timestop')) {
      const power = rankPower(this, 'timestop');
      game.time.alterTimeScale(0.2, 0, 4 * power, 0.2, this);
      this.timestopFrames = this.timestopDuration * power;
      stats.tscount++;
      this.spend('timestop');
      game.fx.ring(c.x, c.y, { color: 0xffe080, radius: 600, life: 0.8 });
      game.onTimestop();
      this.rig.gesture('raise');
    }
    if (this.wants('image') && this.canCast('image')) {
      game.spawn(MirrorImage, this.pos.x, this.pos.y, { source: this, timeOwner: this });
      stats.imcount++;
      this.spend('image');
      this.rig.gesture('raise');
    }
    if (this.wants('blink') && this.canCast('blink')) {
      const fx = game.fx;
      // only blink onto open floor, never into walls or pillars; a blink
      // with nowhere to land fizzles and costs nothing
      const nx = mouse.x - this.size.x / 2;
      const ny = mouse.y - this.size.y / 2;
      if (game.world.canStandAt(nx, ny, this.size.x, this.size.y)) {
        fx.burst(c.x, c.y, 1.2, { color: 0xb070ff, count: 30, speed: 5, life: 0.5, size: 0.9 });
        this.pos.x = nx;
        this.pos.y = ny;
        fx.burst(mouse.x, mouse.y, 1.2, { color: 0xd0a0ff, count: 30, speed: 5, life: 0.5, size: 0.9 });
        fx.ring(mouse.x, mouse.y, { color: 0xb070ff, radius: 60, life: 0.4 });
        stats.bkcount++;
        this.spend('blink');
        if (this.hasBk2) {
          this.cd.blink = this.cooldownOf(200 * rankCooldown(this, 'blink'));
        }
      } else {
        fx.burst(mouse.x, mouse.y, 1.2, { color: 0x806090, count: 8, speed: 2, life: 0.3, size: 0.6 });
      }
    }
    if (this.wants('shield') && this.canCast('shield')) {
      this.shieldFrames = this.shieldDuration * (1 + this.bonus('ward')) * rankPower(this, 'shield');
      stats.shcount++;
      this.spend('shield');
      game.fx.ring(c.x, c.y, { color: 0x60b0ff, radius: 50, life: 0.4 });
      this.rig.gesture('raise');
    }
    if (this.wants('haste') && this.canCast('haste')) {
      this.hasteFrames = this.hasteDuration * rankPower(this, 'haste');
      stats.hscount++;
      this.spend('haste');
      this.rig.gesture('raise');
    }
    if (this.wants('invis') && this.canCast('invis')) {
      this.invisFrames = this.invisDuration * rankPower(this, 'invis');
      stats.incount++;
      this.spend('invis');
      game.fx.burst(c.x, c.y, 1.2, { color: 0x8090a0, count: 20, speed: 3, life: 0.6, size: 1 });
      this.rig.gesture('raise');
    }
    if (this.wants('blizzard') && this.canCast('blizzard')) {
      game.spawn(Zone, mouse.x, mouse.y, {
        kind: 'blizzard', team: 'player', radius: this.hasBz2 ? 192 : 96, tier: this.hasBz2 ? 1 : 0, life: 240, timeOwner: this
      });
      stats.bzcount++;
      this.spend('blizzard', this.hasBz2 ? 10 : 0);
      this.rig.swing();
    }
    if (this.wants('fear') && this.canCast('fear')) {
      const reach = (game.duelMode ? 450 : 400) * rankPower(this, 'fear');
      for (const enemy of game.hostilesOf('player')) {
        if (this.distanceTo(enemy) < reach) {
          enemy.fear();
        }
      }
      stats.fecount++;
      this.spend('fear');
      game.fx.ring(c.x, c.y, { color: 0xc040ff, radius: reach, life: 0.6 });
      this.rig.gesture('raise');
    }
    if (this.wants('pwkill') && this.canCast('pwkill')) {
      // the word takes a second to speak, standing still (speakWord)
      const target = game.hoveredHostile();
      if (target) {
        this.channel = { target, left: DuelRules.pwkillCast, total: DuelRules.pwkillCast };
        this.rig.gesture('raise');
      }
    }
    if (this.wants('tele') && this.canCast('tele')) {
      const item = game.hoveredItem();
      if (item) {
        game.fx.column(item.pos.x + item.size.x / 2, item.pos.y + item.size.y / 2, 20, { color: 0xc0a0ff, count: 20, rise: 3, life: 0.6 });
        item.pickUp(this);
        stats.tlcount++;
        this.spend('tele');
        this.rig.swing();
      }
    }
    castArcana(this);
  }

  // Power word kill being spoken: the mage stands still for its cast; a root,
  // fear or polymorph breaks it off. It lands on the foe it was spoken at if
  // that one is still alive and in sight, and otherwise costs nothing.
  speakWord(k) {
    const game = this.game;
    const ch = this.channel;
    if (this.isStunned || this.isFeared || this.sheepFrames > 0 || this.helpless || this.dead) {
      this.channel = null;
      game.hud.toast('POWER WORD KILL :: BROKEN OFF', '#c090ff');
      return;
    }
    ch.left -= k;
    const c = this.center();
    if (Math.random() < 0.6) {
      // the word gathers at the raised staff
      const head = staffHead(this) || { x: c.x, y: c.y, h: 2.2 };
      game.fx.emit(head.x, head.y, head.h, { color: Math.random() < 0.7 ? 0x9a40ff : 0x200830, life: 0.5, size: 0.7, vy: 2 });
    }
    if (ch.left > 0) {
      return;
    }
    this.channel = null;
    const target = ch.target;
    const t = target.center();
    if (target.killed || target.hp <= 0 || target.invis || !game.world.hasLineOfSight(c.x, c.y, t.x, t.y)) {
      game.hud.toast('POWER WORD KILL :: THE WORD FINDS NO ONE', '#c090ff');
      return;
    }
    game.powerWordKill(target);
    game.stats.pwkcount++;
    this.spend('pwkill');
  }

  // A bolt reached the mage.
  takeSpell(p) {
    if (this.shielded) {
      p.reflect('player');
      return;
    }
    const c = this.center();
    if (p.duel) {
      DuelRules.applyHit(this, p.kind, this.game.duelRival() || p.timeOwner);
    } else if (p.kind === 'shadowbolt') {
      this.stun();
    } else {
      this.hurt(ENEMY_BOLT_DAMAGE[p.kind] || 20);
    }
    this.game.fx.burst(c.x, c.y, 1.4, { color: p.spec.trail || 0xff6040, count: 14, speed: 4, life: 0.4, size: 0.8 });
    p.kill();
  }

  inZone(zone, k) {
    if (zone.kind === 'meteors') {
      if (!this.shielded) {
        this.hurt(0.3 * k, true);
      }
    } else if (zone.kind === 'fire') {
      this.hurt(10);
      zone.kill();
    } else if (zone.kind === 'blizzard') {
      this.hurt((zone.tier ? DuelRules.blizzard2Damage : DuelRules.blizzardDamage) * k, true);
    } else if ((zone.kind === 'guardians' || zone.kind === 'cloud') && zone.timeOwner) {
      // a wizard's spirit guardians or cloudkill
      this.hurt(arcanaZoneDamage(zone, k), true);
    } else if (zone.kind === 'cloud') {
      // a green dragon's poison
      this.hurt(0.25 * k, true);
    } else if (zone.kind === 'acid') {
      this.hurt(0.35 * k, true);
    } else if (zone.kind === 'gloom') {
      this.manergy = Math.max(0, this.manergy - 0.5 * k);
    } else if (zone.kind === 'maelstrom' && zone.timeOwner) {
      // the rival's whirlpool
      this.hurt(arcanaZoneDamage(zone, k), true);
      if (!this.lift) {
        pullToward(this, zone, DuelRules.arcana.maelstrom.pull, k);
      }
    }
  }

  // Melee from an enemy (`attacker`, when known). Returns false when the
  // shield turned the blow. Through armor of agathys the cold bites back.
  takeMelee(dmg, manergyDrain, attacker) {
    if (this.shielded) {
      return false;
    }
    if (this.wardHp > 0 && attacker && !attacker.killed && attacker.hurt) {
      const spec = Arcana.agathys;
      attacker.hurt(spec.cold * rankPower(this, 'agathys'), 'cold');
      if (attacker.chill) {
        attacker.chill(spec.chill);
      }
      const ac = attacker.center();
      this.game.fx.burst(ac.x, ac.y, 1.4, { color: [0xe8f8ff, 0x9ad8ff], count: 14, speed: 4, life: 0.4, size: 0.7 });
    }
    this.hurt(dmg);
    if (manergyDrain) {
      this.manergy -= manergyDrain;
    }
    return true;
  }

  hurt(dmg, quiet) {
    // armour from gear takes a share off every hit, a curse adds to it, and
    // armor of agathys takes what it can before the wizard does
    dmg *= 1 - this.bonus('armor');
    if (this.curseFrames > 0) {
      dmg *= this.curseMult;
    }
    if (this.wardHp > 0 && dmg > 0) {
      const soaked = Math.min(this.wardHp, dmg);
      this.wardHp -= soaked;
      dmg -= soaked;
      if (this.wardHp <= 0) {
        const c = this.center();
        this.game.fx.burst(c.x, c.y, 1.4, { color: [0xe8f8ff, 0x9ad8ff], count: 24, speed: 5, life: 0.5, size: 0.7, gravity: 6 });
      }
    }
    this.hp -= dmg;
    if (!quiet) {
      this.rig.hit();
      this.game.gfx.addShake(Math.min(0.6, dmg / 60));
      this.game.hud.damageFlash();
    }
  }

  // A dragon's frightful presence: the mage flees in a panic for a while.
  frighten(frames) {
    if (this.shielded || this.isFeared) {
      return;
    }
    this.isFeared = true;
    this.fearFrames = 0;
    this.fearDuration = frames;
    this.fearVel = { x: 0, y: 0 };
  }

  stun(frames) {
    this.isStunned = true;
    this.stunFrames = 0;
    if (frames) {
      this.stunDuration = frames;
    }
  }

  chill(frames) {
    this.chillFrames = Math.max(this.chillFrames, frames);
  }

  // pushed away over a few frames; walls stop it
  shove(angle, distance) {
    this.knock = { x: Math.cos(angle) * distance / 12, y: Math.sin(angle) * distance / 12, frames: 12 };
  }

  polymorph(frames) {
    this.sheepFrames = Math.max(this.sheepFrames, frames);
  }

  // The rival's newer spells (arcana.js) on the wizard.
  sleep(frames) {
    this.sleepFrames = Math.max(this.sleepFrames, frames);
    this.sleepHp = this.hp;
    this.game.hud.toast('YOU DOZE OFF :: A BLOW WILL WAKE YOU', '#c8c0ff');
  }

  curse(frames, mult) {
    this.curseFrames = Math.max(this.curseFrames, frames);
    this.curseMult = mult;
    this.game.hud.toast('CURSED :: EVERY BLOW HITS HARDER', '#c070ff');
  }

  // a nightmare: the wizard flees in a panic while it hurts
  haunt(frames, dps) {
    this.nightmare = { frames, dps };
    this.isFeared = true;
    this.fearFrames = 0;
    this.fearDuration = frames;
    this.fearVel = { x: 0, y: 0 };
  }

  // confused: it stumbles about and its spells fly wild
  confuse(frames) {
    this.confusedFrames = Math.max(this.confusedFrames, frames);
    this.isFeared = true;
    this.fearFrames = 0;
    this.fearDuration = frames;
    this.fearVel = { x: 0, y: 0 };
  }

  liftUp(frames, caster) {
    this.lift = { frames, total: frames, caster };
    this.knock = null;
    return true;
  }

  // counterspell: every spell but magic missile waits `frames`, and a word
  // being spoken is lost
  silence(frames) {
    this.gcd = Math.max(this.gcd, frames);
    this.gcdSpan = this.gcd;
    this.rayOn = false;
    if (this.channel) {
      this.channel = null;
    }
    this.game.hud.toast('SILENCED', '#9ac8ff');
  }

  syncView(time, dt) {
    const c = this.center();
    this.view.position.set(c.x * UNIT, this.lift ? liftHeight(this.lift, time) : 0, c.y * UNIT);
    const moving = Math.hypot(this.vel.x, this.vel.y) > 1;
    // the lifesteal ray keeps the staff pointed, a word of death keeps it raised
    this.rig.hold = this.rayOn && !this.helpless && this.sheepFrames <= 0 ? 'thrust' : (this.channel ? 'raise' : null);
    this.rig.rooted = this.isStunned || this.helpless || !!this.channel;
    this.rig.animate(dt, moving ? Math.min(1.4, Math.hypot(this.vel.x, this.vel.y) / 100) : 0, Math.atan2(Math.cos(this.aim), Math.sin(this.aim)));
    this.rig.setAlpha(this.invis ? 0.35 : 1);
    this.shieldBubble.visible = this.shielded;
    if (this.shielded) {
      this.shieldBubble.material.opacity = 0.16 + Math.sin(time * 10) * 0.05;
      this.shieldBubble.rotation.y = time;
    }
    this.rootMark.visible = this.isStunned;
    this.frostShell.visible = this.wardHp > 0;
    if (this.wardHp > 0) {
      this.frostShell.material.opacity = 0.15 + 0.3 * Math.min(1, this.wardHp / (this.wardMax || 1));
      this.frostShell.rotation.y = -time * 0.4;
    }
    arcanaFx(this, time, 2.6);
    const fx = this.game.fx;
    if (this.hasted && moving) {
      fx.emit(c.x, c.y, 0.3 + Math.random(), { color: 0xffe070, life: 0.4, size: 0.6 });
    }
    if (this.isFeared && Math.random() < 0.5) {
      fx.emit(c.x, c.y, 3.2, { color: 0xc040ff, life: 0.5, size: 0.6, vx: (Math.random() - 0.5) * 2, vz: (Math.random() - 0.5) * 2 });
    }
    if (this.isStunned && Math.random() < 0.3) {
      fx.column(c.x, c.y, 20, { color: 0x40ff60, count: 1, rise: 0.8, life: 0.6, size: 0.5 });
    }
    if (this.bonus('regen') > 0 && Math.random() < 0.04) {
      fx.column(c.x, c.y, 18, { color: 0x4080ff, count: 1, rise: 1.2, life: 0.8, size: 0.4 });
    }
    if (this.chillFrames > 0 && Math.random() < 0.3) {
      fx.emit(c.x + (Math.random() - 0.5) * 30, c.y + (Math.random() - 0.5) * 30, Math.random() * 2.5, { color: 0xbfe8ff, life: 0.5, size: 0.4, vy: -0.5 });
    }
    syncSheep(this, time);
  }
}
