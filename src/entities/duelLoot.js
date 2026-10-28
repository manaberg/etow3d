import { Potion } from './items.js';
import { SpellBook } from './mage.js';
import { DuelRules } from './duelRules.js';
import { TILE } from '../core/constants.js';

// Duel trials: potions keep appearing around the map, and whichever wizard
// reaches one first drinks it (a red one heals, a blue one restores manergy).
// No scrolls: the trials are fought with the spells the wizard brought down.

// The duel spell book: the rival's spell id, the player's spellbook flag and
// the tier 2 flag that comes with it.
export const DuelSpells = [
  { id: 'fireball', flag: 'hasFireball', tier: 'hasFb2' },
  { id: 'lightning', flag: 'hasLightning', tier: 'hasLg2' },
  { id: 'ironshot', flag: 'hasIronshot', tier: 'hasIs2' },
  { id: 'blink', flag: 'hasBlink', tier: 'hasBk2' },
  { id: 'timestop', flag: 'hasTimestop' },
  { id: 'shield', flag: 'hasShield' },
  { id: 'haste', flag: 'hasHaste' },
  { id: 'root', flag: 'hasStun' },
  { id: 'image', flag: 'hasImage' },
  { id: 'blizzard', flag: 'hasBlizzard', tier: 'hasBz2' },
  { id: 'ray', flag: 'hasRay' },
  { id: 'invis', flag: 'hasInvis' },
  { id: 'fear', flag: 'hasFear' },
  { id: 'pwkill', flag: 'hasPwkill', tier: 'hasPwk2' },
  // the D&D spells (arcana.js)
  { id: 'scorch', flag: 'hasScorch' },
  { id: 'cone', flag: 'hasCone' },
  { id: 'thunder', flag: 'hasThunder' },
  { id: 'meteor', flag: 'hasMeteor' },
  { id: 'guardians', flag: 'hasGuardians' },
  { id: 'cloud', flag: 'hasCloud' },
  { id: 'heal', flag: 'hasHeal' },
  { id: 'polymorph', flag: 'hasPolymorph' },
  { id: 'disintegrate', flag: 'hasDisintegrate' },
  { id: 'weapon', flag: 'hasWeapon' },
  { id: 'sleep', flag: 'hasSleep' },
  { id: 'agathys', flag: 'hasAgathys' },
  { id: 'curse', flag: 'hasCurse' },
  { id: 'sphere', flag: 'hasSphere' },
  { id: 'counter', flag: 'hasCounter' },
  { id: 'swap', flag: 'hasSwap' },
  { id: 'phantasm', flag: 'hasPhantasm' },
  { id: 'confusion', flag: 'hasConfusion' },
  { id: 'maelstrom', flag: 'hasMaelstrom' },
  { id: 'gravity', flag: 'hasGravity' }
];

// The player's id for a duel spell (the rival calls chain root 'root').
export function playerSpellId(entry) {
  const spell = SpellBook.find((s) => s.flag === entry.flag);
  return spell ? spell.id : entry.id;
}

function pick(list) {
  return list[Math.floor(Math.random() * list.length)];
}

export class DuelLoot {
  constructor(game) {
    this.game = game;
    this.potionTimer = DuelRules.loot.firstPotion;
  }

  takePotion(duelist, blue) {
    const p = DuelRules.loot;
    const mine = duelist === this.game.player;
    if (blue) {
      duelist.manergy = Math.min(duelist.maxManergy, duelist.manergy + p.blueManergy);
      if (mine) {
        this.game.hud.toast('MANERGY POTION :: +' + p.blueManergy + ' MANERGY', '#6aa8ff');
      }
    } else {
      duelist.hp = Math.min(duelist.maxHp, duelist.hp + p.redHeal);
      if (mine) {
        this.game.hud.toast('HEALTH POTION :: +' + p.redHeal + ' HP', '#ff6a70');
      } else {
        this.game.hud.toast('YOUR REFLECTION DRANK A HEALTH POTION', '#ff7070');
      }
    }
  }

  // Called once per simulation step.
  update() {
    const p = DuelRules.loot;
    this.potionTimer--;
    if (this.potionTimer <= 0) {
      this.potionTimer = p.potionEvery;
      const potions = this.game.entities.filter((e) => e instanceof Potion && !e.killed).length;
      if (potions < p.maxPotions) {
        this.drop();
      }
    }
  }

  // In a random room, away from its walls and from both duelists.
  drop() {
    const game = this.game;
    const world = game.world;
    const duelists = [game.player, game.rival].filter((d) => d && !d.killed);
    let spot = null;
    for (let attempt = 0; attempt < 25; attempt++) {
      const s = world.getRoomSpawnPoint(pick(world.rooms), 3);
      const cx = s.x + 24;
      const cy = s.y + 24;
      const clear = duelists.every((d) => Math.hypot(d.center().x - cx, d.center().y - cy) > 4 * TILE + 60);
      spot = s;
      if (clear) {
        break;
      }
    }
    const item = game.spawn(Potion, spot.x, spot.y, { persistent: true });
    const c = item.center();
    game.fx.column(c.x, c.y, 30, { color: [0xff6070, 0x6aa8ff], count: 24, rise: 2.5, life: 0.8, size: 0.7 });
    return item;
  }
}
