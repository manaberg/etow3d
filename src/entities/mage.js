import * as THREE from 'three';
import { Entity } from '../core/entity.js';
import { UNIT } from '../core/constants.js';
import { buildMage, buildSheep, glowMap } from '../render/models.js';
import { Projectile, Zone, MirrorImage, castMissiles } from './spells.js';
import { DuelRules } from './duelRules.js';
import { DungeonLevels } from '../world/levels.js';
import { castArcana, arcanaZoneDamage } from './arcana.js';
import { Inventory, StatCaps, applyGearPools, gearStat } from './gear.js';
import { dressRig } from '../render/gearModels.js';

// The spell book, in HUD order. `cd` is the cooldown in frames, `need` the
// manergy that must be exceeded and `cost` what a cast spends; `flag` is the
// spellbook entry a scroll unlocks and `tier` its tier 2 upgrade. Keys live in
// core/bindings.js under the spell's id (or `action` where they differ).
export const SpellBook = [
  { id: 'missile', name: 'MAGIC MISSILE', cd: 24, need: 0, cost: 0, flag: null },
  { id: 'fireball', name: 'FIREBALL', cd: 48, need: 20, cost: 20, flag: 'hasFireball', tier: 'hasFb2' },
  { id: 'lightning', name: 'CHAIN LIGHTNING', cd: 200, need: 30, cost: 30, flag: 'hasLightning', tier: 'hasLg2' },
  { id: 'ironshot', name: 'IRON SHOT', cd: 300, need: 40, cost: 40, flag: 'hasIronshot', tier: 'hasIs2' },
  { id: 'blink', name: 'BLINK', cd: 400, need: 40, cost: 40, flag: 'hasBlink', tier: 'hasBk2' },
  { id: 'timestop', name: 'TIME STOP', cd: 1000, need: 50, cost: 70, flag: 'hasTimestop' },
  { id: 'haste', name: 'HASTE', cd: 1000, need: 70, cost: 70, flag: 'hasHaste' },
  { id: 'image', name: 'MIRROR IMAGE', cd: 1000, need: 50, cost: 50, flag: 'hasImage' },
  { id: 'stun', name: 'CHAIN ROOT', cd: 400, need: 30, cost: 30, flag: 'hasStun' },
  { id: 'shield', name: 'SHIELD', cd: 200, need: 40, cost: 40, flag: 'hasShield' },
  { id: 'blizzard', name: 'BLIZZARD', cd: 600, need: 40, cost: 40, flag: 'hasBlizzard', tier: 'hasBz2' },
  { id: 'ray', name: 'LIFESTEAL', cd: 0, need: 10, cost: 10, flag: 'hasRay' },
  { id: 'invis', name: 'INVISIBILITY', cd: 1000, need: 70, cost: 70, flag: 'hasInvis' },
  { id: 'fear', name: 'FEAR', cd: 400, need: 50, cost: 50, flag: 'hasFear' },
  { id: 'pwkill', name: 'POWER WORD KILL', cd: 300, need: 50, cost: 30, flag: 'hasPwkill', tier: 'hasPwk2' },
  { id: 'tele', action: 'telekinesis', name: 'TELEKINESIS', cd: 1000, need: 20, cost: 20, flag: 'hasTele' },
  // D&D spells new to the 3D game (see arcana.js)
  { id: 'scorch', name: 'SCORCHING RAY', cd: 90, need: 25, cost: 25, flag: 'hasScorch' },
  { id: 'cone', name: 'CONE OF COLD', cd: 240, need: 35, cost: 35, flag: 'hasCone' },
  { id: 'thunder', name: 'THUNDERWAVE', cd: 300, need: 30, cost: 30, flag: 'hasThunder' },
  { id: 'meteor', name: 'METEOR SWARM', cd: 900, need: 70, cost: 70, flag: 'hasMeteor' },
  { id: 'guardians', name: 'SPIRIT GUARDIANS', cd: 1000, need: 60, cost: 60, flag: 'hasGuardians' },
  { id: 'cloud', name: 'CLOUDKILL', cd: 700, need: 50, cost: 50, flag: 'hasCloud' },
  { id: 'heal', name: 'HEALING WORD', cd: 600, need: 40, cost: 40, flag: 'hasHeal' },
  { id: 'polymorph', name: 'POLYMORPH', cd: 500, need: 40, cost: 40, flag: 'hasPolymorph' },
  { id: 'disintegrate', name: 'DISINTEGRATE', cd: 360, need: 50, cost: 50, flag: 'hasDisintegrate' },
  { id: 'weapon', name: 'SPIRITUAL WEAPON', cd: 900, need: 50, cost: 50, flag: 'hasWeapon' }
];

export const SpellById = {};
for (const spell of SpellBook) {
  SpellById[spell.id] = spell;
}

// The duel loadout's built-in bonuses: the 2D game gave duellists all five
// rings (gear.js ClassicRings), which here are properties of the wizard
// rather than items, so both duellists keep them whatever they wear.
export const DuelInnate = { speed: 0.2, regen: 0.25, fireballCost: -10, lightningCost: -10, missileDamage: 25 };

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
    // cooldown frames left per spell (0 = ready)
    this.cd = {};
    for (const spell of SpellBook) {
      this.cd[spell.id] = 0;
    }
    // duels: frames each school stays locked after a cast (DuelRules.schools)
    this.schoolLock = {};
    // the 2D game started a few spells on cooldown
    this.is2Charges = 1;
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
    // spellbook
    for (const spell of SpellBook) {
      if (spell.flag) {
        this[spell.flag] = false;
      }
      if (spell.tier) {
        this[spell.tier] = false;
      }
    }
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

  // Lets the duel loadout start every spell on cooldown like the 2D game.
  ready(id) {
    return this.cd[id] <= 0 && this.lockLeft(id) <= 0;
  }

  // Frames the duel's school lockout still holds back this spell.
  lockLeft(id) {
    const school = this.game.duelMode ? DuelRules.lockedSchool(id) : null;
    return school ? this.schoolLock[school] || 0 : 0;
  }

  spend(id, extraCost) {
    const spell = SpellById[id];
    this.cd[id] = this.cooldownOf(spell.cd);
    this.manergy -= spell.cost + (extraCost || 0);
    this.lockSchool(id);
  }

  lockSchool(id) {
    const school = this.game.duelMode ? DuelRules.lockedSchool(id) : null;
    if (school) {
      this.schoolLock[school] = DuelRules.schools[school].lockout;
    }
  }

  canCast(id) {
    const spell = SpellById[id];
    if (spell.flag && !this[spell.flag]) {
      return false;
    }
    return this.ready(id) && this.manergy > spell.need;
  }

  update(k) {
    const game = this.game;
    const input = game.input;
    this.timePlayed += k / 60;
    this.tickTimers(k);
    // battles: while the armies deploy, or while the wizard commands them,
    // it stands still and casts nothing (but still regenerates and can fall)
    const standing = !!game.battle && (!game.battle.fighting || game.battle.commander);

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
    if (this.isStunned || standing) {
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
      let mx = 0;
      let my = 0;
      if (input.state('up')) { my -= 1; }
      if (input.state('down')) { my += 1; }
      if (input.state('left')) { mx -= 1; }
      if (input.state('right')) { mx += 1; }
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

    if (!standing && this.sheepFrames <= 0) {
      this.castSpells();
    }
    this.move(k);
    if (this.knock) {
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

  tickTimers(k) {
    for (const id in this.cd) {
      if (this.cd[id] > 0) {
        this.cd[id] = Math.max(0, this.cd[id] - k);
      }
    }
    if (this.cd.ironshot <= 0 && this.is2Charges <= 0) {
      this.is2Charges = this.hasIs2 ? 2 : 1;
    }
    for (const school in this.schoolLock) {
      this.schoolLock[school] = Math.max(0, this.schoolLock[school] - k);
    }
    this.chillFrames = Math.max(0, this.chillFrames - k);
    if (this.sheepFrames > 0) {
      this.sheepFrames = Math.max(0, this.sheepFrames - k);
      if (this.sheepFrames === 0) {
        const c = this.center();
        this.game.fx.burst(c.x, c.y, 1.2, { color: [0xff80e0, 0xffffff], count: 30, speed: 5, life: 0.5, size: 0.9 });
      }
    }
    this.shieldFrames = Math.max(0, this.shieldFrames - k);
    this.hasteFrames = Math.max(0, this.hasteFrames - k);
    this.invisFrames = Math.max(0, this.invisFrames - k);
    this.timestopFrames = Math.max(0, this.timestopFrames - k);
    if (this.isStunned) {
      this.stunFrames += k;
      if (this.stunFrames >= this.stunDuration) {
        this.isStunned = false;
        this.stunFrames = 0;
      }
    }
    if (this.isFeared) {
      this.fearFrames += k;
      if (this.fearFrames >= this.fearDuration) {
        this.isFeared = false;
        this.fearFrames = 0;
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
    const aim = this.aim;
    const fire = (kind, angle, x = c.x, y = c.y) => game.spawn(Projectile, x, y, { kind, angle, team: 'player', timeOwner: this });

    if (input.state('missile') && this.ready('missile')) {
      // the darts home in on the foe under (or near) the cursor, else on the spot
      const target = game.hoveredHostile() || game.hostileNear(mouse, 120) || { x: mouse.x, y: mouse.y };
      castMissiles(game, this, 'player', aim, target);
      this.cd.missile = this.cooldownOf(SpellById.missile.cd);
      stats.micount++;
      this.rig.swing();
    }
    if (input.pressed('fireball') && this.canCast('fireball')) {
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
    if (input.pressed('ironshot') && this.hasIronshot && this.is2Charges > 0 && this.cd.ironshot <= 0 && this.lockLeft('ironshot') <= 0 && this.manergy > 40) {
      fire('ironshot', aim);
      stats.iscount++;
      this.manergy -= 40;
      this.lockSchool('ironshot');
      if (this.is2Charges === 1) {
        this.cd.ironshot = this.cooldownOf(SpellById.ironshot.cd);
      }
      this.is2Charges--;
      game.gfx.addShake(0.25);
      this.rig.swing();
    }
    if (input.state('ray') && this.hasRay && this.manergy > 10) {
      fire('ray', aim + (Math.random() - 0.5) * 0.05);
      stats.lscount++;
      this.manergy -= 10;
    }
    if (input.pressed('lightning') && this.canCast('lightning')) {
      const target = game.nearestHostile(this, 300);
      if (target) {
        fire('lightning', this.angleTo(target));
        stats.lgcount++;
        this.spend('lightning', this.bonus('lightningCost') + (this.hasLg2 ? 15 : 0));
        this.rig.swing();
      }
    }
    if (input.pressed('stun') && this.canCast('stun')) {
      const target = game.nearestHostile(this, 300);
      if (target) {
        fire('root', this.angleTo(target));
        stats.crcount++;
        this.spend('stun');
        this.rig.swing();
      }
    }
    if (input.pressed('timestop') && this.canCast('timestop')) {
      game.time.alterTimeScale(0.2, 0, 4, 0.2, this);
      this.timestopFrames = this.timestopDuration;
      stats.tscount++;
      this.spend('timestop');
      game.fx.ring(c.x, c.y, { color: 0xffe080, radius: 600, life: 0.8 });
      game.onTimestop();
    }
    if (input.pressed('image') && this.canCast('image')) {
      game.spawn(MirrorImage, this.pos.x, this.pos.y, { source: this, timeOwner: this });
      stats.imcount++;
      this.spend('image');
    }
    if (input.pressed('blink') && this.canCast('blink')) {
      const fx = game.fx;
      fx.burst(c.x, c.y, 1.2, { color: 0xb070ff, count: 30, speed: 5, life: 0.5, size: 0.9 });
      // only blink onto open floor, never into walls or pillars
      const nx = mouse.x - this.size.x / 2;
      const ny = mouse.y - this.size.y / 2;
      if (game.world.canStandAt(nx, ny, this.size.x, this.size.y)) {
        this.pos.x = nx;
        this.pos.y = ny;
        fx.burst(mouse.x, mouse.y, 1.2, { color: 0xd0a0ff, count: 30, speed: 5, life: 0.5, size: 0.9 });
        fx.ring(mouse.x, mouse.y, { color: 0xb070ff, radius: 60, life: 0.4 });
      }
      stats.bkcount++;
      this.spend('blink');
      if (this.hasBk2) {
        this.cd.blink = this.cooldownOf(200);
      }
    }
    if (input.pressed('shield') && this.canCast('shield')) {
      this.shieldFrames = this.shieldDuration * (1 + this.bonus('ward'));
      stats.shcount++;
      this.spend('shield');
      game.fx.ring(c.x, c.y, { color: 0x60b0ff, radius: 50, life: 0.4 });
    }
    if (input.pressed('haste') && this.canCast('haste')) {
      this.hasteFrames = this.hasteDuration;
      stats.hscount++;
      this.spend('haste');
    }
    if (input.pressed('invis') && this.canCast('invis')) {
      this.invisFrames = this.invisDuration;
      stats.incount++;
      this.spend('invis');
      game.fx.burst(c.x, c.y, 1.2, { color: 0x8090a0, count: 20, speed: 3, life: 0.6, size: 1 });
    }
    if (input.pressed('blizzard') && this.canCast('blizzard')) {
      game.spawn(Zone, mouse.x, mouse.y, {
        kind: 'blizzard', team: 'player', radius: this.hasBz2 ? 192 : 96, tier: this.hasBz2 ? 1 : 0, life: 240, timeOwner: this
      });
      stats.bzcount++;
      this.spend('blizzard', this.hasBz2 ? 10 : 0);
    }
    if (input.pressed('fear') && this.canCast('fear')) {
      for (const enemy of game.hostilesOf('player')) {
        if (enemy.canBeFeared && this.distanceTo(enemy) < (game.duelMode ? 450 : 400)) {
          enemy.fear();
        }
      }
      stats.fecount++;
      this.spend('fear');
      game.fx.ring(c.x, c.y, { color: 0xc040ff, radius: 400, life: 0.6 });
    }
    if (input.pressed('pwkill') && this.canCast('pwkill')) {
      const target = game.hoveredHostile();
      if (target) {
        game.powerWordKill(target);
        stats.pwkcount++;
        this.spend('pwkill');
      }
    }
    if (input.pressed('telekinesis') && this.canCast('tele')) {
      const item = game.hoveredItem();
      if (item) {
        game.fx.column(item.pos.x + item.size.x / 2, item.pos.y + item.size.y / 2, 20, { color: 0xc0a0ff, count: 20, rise: 3, life: 0.6 });
        item.pickUp(this);
        stats.tlcount++;
        this.spend('tele');
      }
    }
    castArcana(this);
  }

  // A bolt reached the mage.
  takeSpell(p) {
    if (this.shielded) {
      p.reflect('player');
      return;
    }
    const c = this.center();
    if (p.duel) {
      // on survival floors every duel bolt comes from (or off) a dark wizard
      const game = this.game;
      const caster = game.duelRival() || (p.timeOwner && p.timeOwner.isDuelWizard ? p.timeOwner : null);
      DuelRules.applyHit(this, p.kind, caster, game.duelMode ? 1 : DungeonLevels.wizard.hitScale);
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
      const scale = this.game.duelMode ? 1 : DungeonLevels.wizard.hitScale;
      this.hurt((zone.tier ? DuelRules.blizzard2Damage : DuelRules.blizzardDamage) * k * scale, true);
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
    }
  }

  // Melee from an enemy. Returns false when the shield turned the blow.
  takeMelee(dmg, manergyDrain) {
    if (this.shielded) {
      return false;
    }
    this.hurt(dmg);
    if (manergyDrain) {
      this.manergy -= manergyDrain;
    }
    return true;
  }

  hurt(dmg, quiet) {
    // armour from gear takes a share off every hit
    dmg *= 1 - this.bonus('armor');
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

  syncView(time, dt) {
    const c = this.center();
    this.view.position.set(c.x * UNIT, 0, c.y * UNIT);
    const moving = Math.hypot(this.vel.x, this.vel.y) > 1;
    this.rig.animate(dt, moving ? Math.min(1.4, Math.hypot(this.vel.x, this.vel.y) / 100) : 0, Math.atan2(Math.cos(this.aim), Math.sin(this.aim)));
    this.rig.setAlpha(this.invis ? 0.35 : 1);
    this.shieldBubble.visible = this.shielded;
    if (this.shielded) {
      this.shieldBubble.material.opacity = 0.16 + Math.sin(time * 10) * 0.05;
      this.shieldBubble.rotation.y = time;
    }
    this.rootMark.visible = this.isStunned;
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
