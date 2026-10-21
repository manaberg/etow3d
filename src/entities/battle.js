import { Mage } from './mage.js';
import { DuelWizard } from './duelWizard.js';
import { Soldier } from './soldier.js';
import { DuelSpells } from './duelLoot.js';
import { SpellBook } from './mage.js';
import { TILE } from '../core/constants.js';

// Battle mode: a best-of-five match between two wizards, each leading an orc
// army. The battles grow (8 orcs a side up to 32) and so do the spell books:
// both wizards start with magic missile and one random spell, and after every
// battle the player picks one of three new spells while the rival learns one
// at random. A battle is lost when your wizard falls or your army is wiped
// out. Spells follow the duel rules (damage between wizards, 3 s global
// cooldown); orcs take the dungeon damage, so a fireball wrecks a regiment.
export const BattleRules = {
  // orcs per side in each battle
  armies: [8, 12, 18, 24, 32],
  winsNeeded: 3,
  // battle orcs are hardier than dungeon orcs, so wizards shape a battle
  // instead of deleting an army with magic missiles
  hpScale: 2,
  draftChoices: 3,
  // frames of deployment before each battle starts
  deployFrames: 180,
  // army mix per battle (weights of OrcClasses)
  mixes: [
    { grunt: 6, slinger: 3 },
    { grunt: 5, slinger: 3, knight: 2 },
    { grunt: 4, slinger: 3, knight: 2, shaman: 1, berserker: 1 },
    { grunt: 3, slinger: 3, knight: 3, shaman: 1, berserker: 2, brute: 1, warlock: 1 },
    { grunt: 3, slinger: 3, knight: 3, shaman: 2, berserker: 2, brute: 2, warlock: 2 }
  ],
  // battlefield size in dungeon cells (2 tiles each) for an army of n a side
  field(n) {
    const w = 30 + Math.round(n * 0.4);
    const h = 18 + Math.round(n * 0.2);
    return { cols: w + 8, rows: h + 8, roomCount: 1, minRoomW: w, maxRoomW: w, minRoomH: h, maxRoomH: h, outcrops: 6 + Math.round(n / 3) };
  }
};

function pickWeighted(weights) {
  let total = 0;
  for (const k in weights) {
    total += weights[k];
  }
  let roll = Math.random() * total;
  for (const k in weights) {
    roll -= weights[k];
    if (roll < 0) {
      return k;
    }
  }
  return Object.keys(weights)[0];
}

function pick(list) {
  return list[Math.floor(Math.random() * list.length)];
}

export function spellLabel(entry) {
  const spell = SpellBook.find((s) => s.flag === entry.flag);
  return spell ? spell.name : entry.id.toUpperCase();
}

export class Battle {
  constructor(game) {
    this.game = game;
    this.round = 0;
    this.score = { player: 0, enemy: 0 };
    this.playerSpells = new Set([pick(DuelSpells).id]);
    this.rivalSpells = new Set([pick(DuelSpells).id]);
    this.orders = { player: 'charge', enemy: 'charge' };
    this.fighting = false;
    this.deploy = 0;
    this.lists = { player: [], enemy: [] };
    this.holdPoints = { player: null, enemy: null };
    this.over = false;
  }

  get armySize() {
    return BattleRules.armies[Math.min(this.round, BattleRules.armies.length - 1)];
  }

  // ------------------------------------------------------------- rounds

  startRound() {
    const game = this.game;
    const n = this.armySize;
    game.buildWorld(BattleRules.field(n));
    game.gfx.setBattlefield(true);
    const room = game.world.getMainRoom();
    const left = room.x * TILE;
    const top = room.y * TILE;
    const width = room.w * TILE;
    const height = room.h * TILE;
    const mid = top + height / 2;
    // wizards behind their lines, armies in ranks facing each other
    const pl = game.spawn(Mage, left + 90 - 24, mid - 24);
    game.player = pl;
    game.configureDuelPlayer(pl);
    for (const entry of DuelSpells) {
      pl[entry.flag] = this.playerSpells.has(entry.id);
      if (entry.tier) {
        pl[entry.tier] = pl[entry.flag];
      }
    }
    pl.hasTele = false;
    const rival = game.spawn(DuelWizard, left + width - 90 - 24, mid - 24, { difficulty: game.difficulty });
    rival.known = new Set(this.rivalSpells);
    game.rival = rival;
    this.deployArmy('player', n, left + 200, mid, 1);
    this.deployArmy('enemy', n, left + width - 200, mid, -1);
    this.holdPoints.player = { x: left + 260, y: mid };
    this.holdPoints.enemy = { x: left + width - 260, y: mid };
    this.orders.player = 'charge';
    this.orders.enemy = 'charge';
    this.fighting = false;
    this.deploy = BattleRules.deployFrames;
    this.refreshLists();
    game.state = 'playing';
    game.hud.onBattleRound(this);
  }

  // Ranks of up to eight, front rank toward the enemy; ranged orcs at the back.
  deployArmy(side, n, frontX, midY, dir) {
    const game = this.game;
    const mix = BattleRules.mixes[Math.min(this.round, BattleRules.mixes.length - 1)];
    const classes = [];
    for (let i = 0; i < n; i++) {
      classes.push(pickWeighted(mix));
    }
    const ranged = (c) => c === 'slinger' || c === 'warlock' || c === 'shaman';
    classes.sort((a, b) => Number(ranged(a)) - Number(ranged(b)));
    const perRank = 8;
    classes.forEach((orcClass, i) => {
      const rank = Math.floor(i / perRank);
      const file = i % perRank;
      const inRank = Math.min(perRank, n - rank * perRank);
      const x = frontX - dir * rank * 56;
      const y = midY + (file - (inRank - 1) / 2) * 56;
      let spot = { x: x - 24, y: y - 24 };
      if (!game.world.canStandAt(spot.x, spot.y, 48, 48)) {
        spot = game.world.getRoomSpawnPoint(game.world.getMainRoom(), 3);
      }
      const unit = game.spawn(Soldier, spot.x, spot.y, { side, orcClass });
      unit.slot = { x: (rank * 56) * -dir, y: (file - (inRank - 1) / 2) * 56 };
    });
  }

  // ------------------------------------------------------------- per step

  update() {
    const game = this.game;
    this.refreshLists();
    if (!this.fighting) {
      this.deploy--;
      if (this.deploy <= 0) {
        this.fighting = true;
        game.hud.toast('BATTLE ' + (this.round + 1) + ' :: FIGHT!', '#ffb85a');
      }
    }
    const input = game.input;
    for (const order of ['charge', 'hold', 'follow']) {
      if (input.pressed('order_' + order) && this.orders.player !== order) {
        this.orders.player = order;
        if (order === 'hold') {
          // hold a line just ahead of where the wizard stands now
          const c = game.player.center();
          this.holdPoints.player = { x: c.x + 100, y: c.y };
        }
        game.hud.toast('ARMY :: ' + order.toUpperCase(), '#7fb2ff');
      }
    }
    this.commandRival();
    if (this.fighting && !this.over) {
      const mine = this.armyCount('player');
      const theirs = this.armyCount('enemy');
      if (theirs === 0 && mine > 0) {
        this.endRound('player', 'The rival’s army is destroyed.');
      } else if (mine === 0 && theirs > 0) {
        this.endRound('enemy', 'Your army is destroyed.');
      } else if (mine === 0 && theirs === 0) {
        // both armies fell together: the healthier wizard holds the field
        const rival = game.rival;
        const playerShare = game.player.hp / game.player.maxHp;
        const rivalShare = rival && !rival.killed ? rival.hp / rival.maxHp : 0;
        this.endRound(playerShare >= rivalShare ? 'player' : 'enemy', 'Both armies are destroyed.');
      }
    }
  }

  // The rival keeps its army charging, but pulls it back to guard itself when
  // it is hurt and the player's orcs are on top of it.
  commandRival() {
    const rival = this.game.rival;
    if (!rival || rival.killed) {
      return;
    }
    let pressing = 0;
    for (const u of this.lists.player) {
      if (!u.isWizard && u.distanceTo(rival) < 220) {
        pressing++;
      }
    }
    const want = pressing >= 2 && rival.hp < rival.maxHp * 0.6 ? 'follow' : 'charge';
    this.orders.enemy = want;
  }

  refreshLists() {
    const game = this.game;
    const player = [];
    const enemy = [];
    for (const e of game.entities) {
      if (e.killed) {
        continue;
      }
      if (e instanceof Soldier) {
        (e.side === 'player' ? player : enemy).push(e);
      }
    }
    this.soldiers = { player: player.slice(), enemy: enemy.slice() };
    if (game.player && !game.player.dead) {
      player.push(game.player);
    }
    if (game.rival && !game.rival.killed) {
      enemy.push(game.rival);
    }
    this.lists = { player, enemy };
  }

  armyCount(side) {
    return this.soldiers ? this.soldiers[side].length : 0;
  }

  // Orcs of a side (not its wizard).
  units(side) {
    return this.soldiers ? this.soldiers[side] : [];
  }

  // Everything a unit can fight: the other army and the other wizard.
  nearestFoe(unit) {
    const foes = this.lists[unit.side === 'player' ? 'enemy' : 'player'];
    let best = null;
    let bestD = Infinity;
    for (const f of foes) {
      if (f.invis) {
        continue;
      }
      // wizards are a little less attractive than the orc in front of you
      const d = unit.distanceTo(f) * (f.isWizard ? 1.3 : 1);
      if (d < bestD) {
        bestD = d;
        best = f;
      }
    }
    return best;
  }

  // Where a unit should stand for its side's follow or hold order.
  anchor(side, unit) {
    const game = this.game;
    const dir = side === 'player' ? 1 : -1;
    if (this.orders[side] === 'follow') {
      const wizard = side === 'player' ? game.player : game.rival;
      if (wizard && !wizard.killed) {
        const c = wizard.center();
        return { x: c.x + unit.slot.x * 0.6 + dir * 70, y: c.y + unit.slot.y * 0.6 };
      }
    }
    const h = this.holdPoints[side];
    return { x: h.x + unit.slot.x, y: h.y + unit.slot.y };
  }

  // ------------------------------------------------------------- endings

  onWizardDown(side) {
    if (side === 'player') {
      this.endRound('enemy', 'Your wizard fell.');
    } else {
      this.endRound('player', 'The rival wizard fell.');
    }
  }

  endRound(winner, why) {
    if (this.over) {
      return;
    }
    this.over = true;
    const game = this.game;
    this.score[winner]++;
    game.state = 'intermission';
    const matchOver = this.score[winner] >= BattleRules.winsNeeded || this.round + 1 >= BattleRules.armies.length;
    if (matchOver) {
      const won = this.score.player > this.score.enemy;
      game.state = 'over';
      if (won) {
        game.stats.wincount++;
      }
      game.hud.showEnd({
        title: won ? 'BATTLE WON' : 'BATTLE LOST',
        text: why + ' Final score ' + this.score.player + ' : ' + this.score.enemy + ' against the rival (' + game.difficulty.toUpperCase() + ').',
        stats: game.stats,
        duel: true,
        battle: true,
        win: won
      });
      return;
    }
    // between battles: the player drafts one of three new spells, the rival learns one
    const missing = DuelSpells.filter((s) => !this.playerSpells.has(s.id));
    const choices = [];
    while (choices.length < BattleRules.draftChoices && missing.length) {
      choices.push(missing.splice(Math.floor(Math.random() * missing.length), 1)[0]);
    }
    const rivalMissing = DuelSpells.filter((s) => !this.rivalSpells.has(s.id));
    const rivalPick = rivalMissing.length ? pick(rivalMissing) : null;
    game.hud.showBattleDraft({
      winner,
      why,
      score: this.score,
      next: this.round + 2,
      nextSize: BattleRules.armies[this.round + 1],
      choices: choices.map((c) => ({ id: c.id, name: spellLabel(c) })),
      rivalLearns: rivalPick ? spellLabel(rivalPick) : null,
      onPick: (id) => {
        if (id) {
          this.playerSpells.add(id);
        }
        if (rivalPick) {
          this.rivalSpells.add(rivalPick.id);
        }
        this.round++;
        this.over = false;
        this.startRound();
      }
    });
  }
}
