import * as THREE from 'three';
import { Soldier } from './soldier.js';
import { BattleDragon } from './battleDragon.js';
import { DragonAges, ChromaticColors } from './dragon.js';
import { MirrorImage } from './spells.js';
import { Races, raceLook } from '../world/levels.js';
import { TILE, UNIT } from '../core/constants.js';
import { ArmyRenderer } from '../render/armyRenderer.js';
import { BoltRenderer } from '../render/boltRenderer.js';
import { TEAM_COLORS } from '../render/models.js';

// Battle trials (levels.js Trials): one great battle between the wizard and
// its reflection (mirror.js), each leading a vast army across open country.
// Both armies are drawn at random, race and all, but from the same budget of
// points (`classCost` and `raceCost` below), so a horde of cheap grunts meets
// a smaller host of brutes and knights, and both sides field the same number
// of dragons of the same ages. The armies are
// split into regiments by unit type (infantry, slingers, knights, shock
// troops, mystics, dragons) that the player commands one by one or together:
// charge, march to a point and hold it, or follow the wizard. The battle is
// won when the reflection falls or its army is wiped out; when the player's
// army is wiped out the wizard goes on down the stairs without the spoils,
// and when the wizard falls the run is over. Wizards follow the duel rules
// (damage between them, the global cooldown); soldiers take the dungeon
// damage, so a fireball wrecks a regiment.
export const BattleRules = {
  // Battles grow with the descent: about `armyStart` soldiers a side (in an
  // army of average cost) in a battle below the first floor, growing by the
  // same share every floor to `army` a side in a battle below floor
  // `armyFullDepth`. ?army=N on the URL sets another largest size for
  // testing, within `armyRange`.
  army: 5000,
  armyRange: [200, 12000],
  armyStart: 300,
  armyFullDepth: 19,
  // battle soldiers are hardier than dungeon orcs, so wizards shape a battle
  // instead of deleting an army with magic missiles; dragons likewise
  hpScale: 2,
  dragonHpScale: 2,
  // frames to arrange the regiments before the battle starts (Space starts early)
  deployFrames: 1500,
  // about this many regiments a side, never smaller than minRegiment
  regiments: 16,
  minRegiment: 40,
  maxCols: 24,
  spacing: 44,
  // the widest a line of regiments may stand before it is split in two, the
  // open ground between the two front lines, and around the armies (px)
  maxLine: 9000,
  noMansLand: 1300,
  margin: 600,
  // what a soldier is worth in points, by class (an orc grunt is 1) and race
  classCost: { grunt: 0.85, slinger: 1.1, knight: 1.4, shaman: 2.8, berserker: 1.3, brute: 2.4, warlock: 3.2 },
  raceCost: { orc: 1, dwarf: 1.2, human: 1.04, elf: 0.91 },
  // each regiment type's usual share of an army's points; every battle
  // rolls each share between `roll` of it and may leave out a rarer type
  shares: { infantry: 0.34, slingers: 0.22, knights: 0.14, shock: 0.16, mystics: 0.14 },
  roll: [0.4, 1.6],
  dropChance: 0.15,
  // dragons: one a side for every `dragonEvery` soldiers (at least one), of
  // ages drawn from `dragonAges` among those the depth has reached
  // (`dragonAgeFrom`, the floor below which each age first flies); both
  // sides get the same ages
  dragonEvery: 650,
  dragonAges: { wyrmling: 3, young: 4, adult: 3, ancient: 1 },
  dragonAgeFrom: { wyrmling: 1, young: 6, adult: 11, ancient: 15 },
  // dragons' bites and breath hit soldiers this many times harder than the mage
  dragonVsTroops: 5,

  // The battlefield (in dungeon cells, two tiles each) around armies standing
  // `width` px wide and `depth` px deep each, facing across no man's land.
  field(width, depth) {
    const cell = TILE * 2;
    const w = Math.ceil((width + this.margin * 2) / cell);
    const h = Math.ceil((depth * 2 + this.noMansLand + this.margin * 2) / cell);
    // rocks scatter over the middle band of the field, between the armies
    const outcrops = Math.round(w * h / 700);
    const band = this.noMansLand / (h * cell);
    return {
      cols: w + 6, rows: h + 6, roomCount: 1, minRoomW: w, maxRoomW: w, minRoomH: h, maxRoomH: h,
      outcrops, outcropBand: [0.5 - band * 0.6, 0.5 + band * 0.6]
    };
  },

  // The largest army, asked for on the URL, or the default.
  largestArmy() {
    const m = (typeof window !== 'undefined' ? window.location.search : '').match(/[?&]army=(\d+)/i);
    const n = m ? parseInt(m[1], 10) : this.army;
    return Math.max(this.armyRange[0], Math.min(this.armyRange[1], n));
  },

  // Soldiers a side in a battle below floor `depth`.
  armySize(depth) {
    const top = this.largestArmy();
    const start = Math.min(this.armyStart, top);
    const t = Math.max(0, Math.min(1, (depth - 1) / (this.armyFullDepth - 1)));
    return Math.round(start * Math.pow(top / start, t));
  },

  // The dragon ages that fly in a battle below floor `depth`, with their weights.
  dragonAgesAt(depth) {
    const out = {};
    for (const age in this.dragonAges) {
      if (depth >= this.dragonAgeFrom[age]) {
        out[age] = this.dragonAges[age];
      }
    }
    return out;
  }
};

export const RegimentKinds = {
  infantry: { name: 'INFANTRY', classes: { grunt: 1 } },
  slingers: { name: 'SLINGERS', classes: { slinger: 1 } },
  knights: { name: 'KNIGHTS', classes: { knight: 1 } },
  shock: { name: 'SHOCK TROOPS', classes: { berserker: 2, brute: 1 } },
  mystics: { name: 'MYSTICS', classes: { shaman: 1, warlock: 1 } },
  dragons: { name: 'DRAGONS', classes: {} }
};

const ROMAN = ['', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII', 'XIII', 'XIV', 'XV', 'XVI', 'XVII', 'XVIII', 'XIX', 'XX'];
// the spatial grid's cell, px
const GRID = 64;
// far-off dragons stand this far apart in their line
const DRAGON_SPACING = 260;

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

function shuffle(list) {
  for (let i = list.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [list[i], list[j]] = [list[j], list[i]];
  }
  return list;
}

// What one soldier of a regiment type costs on average, for a race.
function kindCost(kind, race) {
  const classes = RegimentKinds[kind].classes;
  let total = 0;
  let cost = 0;
  for (const c in classes) {
    total += classes[c];
    cost += classes[c] * BattleRules.classCost[c];
  }
  return cost / total * BattleRules.raceCost[race];
}

export class Battle {
  constructor(game) {
    this.game = game;
    // the deeper the battle, the bigger the armies
    this.size = BattleRules.armySize(game.depth);
    // both armies are random: any two different races
    const races = shuffle(Object.keys(Races));
    this.races = { player: races[0], enemy: races[1] };
    this.fighting = false;
    this.deploy = 0;
    this.fightFrames = 0;
    this.lists = { player: [], enemy: [] };
    this.soldiers = { player: [], enemy: [] };
    this.regiments = { player: [], enemy: [] };
    this.selected = new Set();
    // the spatial grid, rebuilt every step by counting sort: the bodies in
    // cell c are cellItems[cellStart[c]] up to cellItems[cellStart[c + 1]]
    this.bodies = [];
    this.cellStart = new Int32Array(2);
    this.cellFill = new Int32Array(2);
    this.cellItems = [];
    this.gridSize = GRID;
    this.gridCols = 1;
    this.gridRows = 1;
    this.over = false;
    this.markers = null;
    // commander mode (Tab): the wizard stands, the camera roams, the mouse
    // selects and orders regiments. The battle opens in it, for deployment.
    this.commander = true;
    this.cam = { x: 0, y: 0 };
    this.drag = null;
    this.listeners = [];
    this.attachMouse();
  }

  // ------------------------------------------------------------- the armies

  // A random army worth `budget` points: each regiment type's share of the
  // points rolled around its usual share (a rarer type may stay home), then
  // as many soldiers of it as those points buy for the race.
  rollArmy(race, budget) {
    const shares = {};
    let total = 0;
    for (const kind in BattleRules.shares) {
      const [lo, hi] = BattleRules.roll;
      let w = BattleRules.shares[kind] * (lo + Math.random() * (hi - lo));
      if (kind !== 'infantry' && Math.random() < BattleRules.dropChance) {
        w = 0;
      }
      shares[kind] = w;
      total += w;
    }
    const counts = {};
    for (const kind in shares) {
      counts[kind] = Math.round(budget * shares[kind] / total / kindCost(kind, race));
    }
    return counts;
  }

  // The same dragons for both sides: one per `dragonEvery` soldiers, of
  // random ages the depth has reached; each side's are of random colours.
  rollDragons() {
    const n = Math.max(1, Math.round(this.size / BattleRules.dragonEvery));
    const weights = BattleRules.dragonAgesAt(this.game.depth);
    const ages = [];
    for (let i = 0; i < n; i++) {
      ages.push(pickWeighted(weights));
    }
    // the oldest first, so they stand in the middle of their line
    const order = Object.keys(DragonAges);
    return ages.sort((a, b) => order.indexOf(b) - order.indexOf(a));
  }

  // Splits an army into regiments and lines them up, relative to the middle
  // of its front: infantry and shock troops in front with knights on the
  // flanks, slingers behind them, then mystics, then the dragons. `back` is
  // how far behind the front a regiment's middle stands.
  planArmy(side, counts, dragons) {
    const sp = BattleRules.spacing;
    const regimentSize = Math.max(BattleRules.minRegiment, Math.ceil(this.size / BattleRules.regiments));
    const regiments = [];
    for (const kind in counts) {
      const total = counts[kind];
      const parts = Math.ceil(total / regimentSize);
      for (let p = 0; p < parts; p++) {
        const size = Math.floor(total / parts) + (p < total % parts ? 1 : 0);
        if (size > 0) {
          regiments.push({ kind, size, name: RegimentKinds[kind].name + (parts > 1 ? ' ' + (ROMAN[p + 1] || p + 1) : '') });
        }
      }
    }
    for (const r of regiments) {
      r.cols = Math.max(4, Math.min(BattleRules.maxCols, Math.ceil(Math.sqrt(r.size * 2.5))));
      r.ranks = Math.ceil(r.size / r.cols);
      r.spacing = sp;
      r.width = r.cols * sp;
      r.depth = r.ranks * sp;
    }
    if (dragons.length) {
      regiments.push({
        kind: 'dragons', size: dragons.length, name: RegimentKinds.dragons.name, ages: dragons,
        colors: dragons.map(() => pick(ChromaticColors)),
        cols: dragons.length, ranks: 1, spacing: DRAGON_SPACING, width: dragons.length * DRAGON_SPACING, depth: DRAGON_SPACING
      });
    }
    const front = regiments.filter((r) => r.kind === 'infantry' || r.kind === 'shock');
    // knights alternate between the two flanks of the front line
    regiments.filter((r) => r.kind === 'knights').forEach((r, i) => (i % 2 === 0 ? front.unshift(r) : front.push(r)));
    const groups = [front, ...['slingers', 'mystics', 'dragons'].map((k) => regiments.filter((r) => r.kind === k))];
    // a line wider than maxLine splits into two, one behind the other
    const lines = [];
    for (const group of groups) {
      let line = [];
      let width = 0;
      for (const r of group) {
        if (line.length && width + r.width > BattleRules.maxLine) {
          lines.push(line);
          line = [];
          width = 0;
        }
        line.push(r);
        width += r.width + 60;
      }
      if (line.length) {
        lines.push(line);
      }
    }
    let back = 0;
    let widest = 0;
    for (const line of lines) {
      const total = line.reduce((s, r) => s + r.width, 0) + (line.length - 1) * 60;
      widest = Math.max(widest, total);
      let x = -total / 2;
      let deepest = 0;
      for (const r of line) {
        r.at = { x: x + r.width / 2, back: back + r.depth / 2 };
        x += r.width + 60;
        deepest = Math.max(deepest, r.depth);
      }
      back += deepest + 110;
    }
    // the wizard stands behind it all
    return { side, regiments, width: widest, depth: back + 160, wizardBack: back + 60 };
  }

  // Lays out the field, the two armies and the two wizards: the player (with
  // `carry`, everything brought down the stairs) and its reflection.
  start(carry) {
    const game = this.game;
    const races = this.races;
    // both armies are bought with the points of an average army of this size
    let reference = 0;
    let shareTotal = 0;
    for (const kind in BattleRules.shares) {
      reference += BattleRules.shares[kind] * kindCost(kind, 'orc');
      shareTotal += BattleRules.shares[kind];
    }
    this.budget = this.size * reference / shareTotal;
    const dragons = this.rollDragons();
    const plans = {
      player: this.planArmy('player', this.rollArmy(races.player, this.budget), dragons),
      enemy: this.planArmy('enemy', this.rollArmy(races.enemy, this.budget), dragons)
    };
    game.buildWorld(BattleRules.field(Math.max(plans.player.width, plans.enemy.width), Math.max(plans.player.depth, plans.enemy.depth)));
    if (!game.army) {
      game.army = new ArmyRenderer(game.gfx);
    }
    game.army.clear();
    if (!game.bolts) {
      game.bolts = new BoltRenderer(game.gfx);
    }
    this.clearMarkers();
    const room = game.world.getMainRoom();
    const left = room.x * TILE;
    const top = room.y * TILE;
    const width = room.w * TILE;
    const height = room.h * TILE;
    this.bounds = { left, top, right: left + width, bottom: top + height };
    const dungeon = game.world.dungeon;
    this.gridCols = Math.ceil(dungeon.cols * TILE * 2 / GRID) + 1;
    this.gridRows = Math.ceil(dungeon.rows * TILE * 2 / GRID) + 1;
    this.cellStart = new Int32Array(this.gridCols * this.gridRows + 1);
    this.cellFill = new Int32Array(this.gridCols * this.gridRows);
    const mid = { x: left + width / 2, y: top + height / 2 };
    this.regiments = { player: [], enemy: [] };
    // the player's army along the bottom of the field advancing up the screen,
    // the rival's along the top (dir is the way each army faces, in y)
    const half = BattleRules.noMansLand / 2;
    const wizardPlayer = this.deployArmy(plans.player, mid.y + half, mid.x, -1);
    const wizardEnemy = this.deployArmy(plans.enemy, mid.y - half, mid.x, 1);

    game.startTrialDuelists(wizardPlayer.x - 24, wizardPlayer.y - 24, wizardEnemy.x - 24, wizardEnemy.y - 24, carry);

    this.selected = new Set(this.regiments.player.map((r) => r.id));
    this.commander = true;
    this.cam = { x: wizardPlayer.x, y: wizardPlayer.y - 600 };
    this.fighting = false;
    this.fightFrames = 0;
    this.deploy = BattleRules.deployFrames;
    this.refreshLists();
    this.buildMarkers();
  }

  // Puts a planned army on the field with its front at frontY, facing `dir`
  // (in y). Returns where the wizard stands.
  deployArmy(plan, frontY, midX, dir) {
    const game = this.game;
    const side = plan.side;
    const race = this.races[side];
    // reserve instanced slots per look, then spawn every soldier in its slot
    const looks = {};
    const classes = plan.regiments.map((r) => {
      const list = [];
      if (r.kind === 'dragons') {
        return list;
      }
      for (let i = 0; i < r.size; i++) {
        const c = pickWeighted(RegimentKinds[r.kind].classes);
        list.push(c);
        const look = raceLook(race, c);
        looks[look] = (looks[look] || 0) + 1;
      }
      return list;
    });
    for (const look in looks) {
      if (ArmyRenderer.available(look)) {
        game.army.reserve(look, side, looks[look]);
      }
    }
    plan.regiments.forEach((r, ri) => {
      const point = this.clampPoint({ x: midX + r.at.x, y: frontY - dir * r.at.back });
      const regiment = {
        id: side + '-' + ri,
        side,
        kind: r.kind,
        name: r.name,
        size: r.size,
        cols: r.cols,
        ranks: r.ranks,
        spacing: r.spacing,
        dir,
        point,
        order: 'hold',
        units: [],
        centroid: { x: point.x, y: point.y },
        anchor: null,
        alive: r.size
      };
      for (let i = 0; i < r.size; i++) {
        const col = i % r.cols;
        const rank = Math.floor(i / r.cols);
        const slot = {
          x: (col - (r.cols - 1) / 2) * r.spacing,
          y: -dir * (rank - (r.ranks - 1) / 2) * r.spacing
        };
        if (r.kind === 'dragons') {
          const age = r.ages[i];
          const size = DragonAges[age].size;
          const spot = this.standNear(point.x + slot.x - size / 2, point.y + slot.y - size / 2, size);
          regiment.units.push(game.spawn(BattleDragon, spot.x, spot.y, { side, age, color: r.colors[i], regiment, slot }));
        } else {
          const spot = this.standNear(point.x + slot.x - 24, point.y + slot.y - 24, 48);
          regiment.units.push(game.spawn(Soldier, spot.x, spot.y, { side, race, orcClass: classes[ri][i], regiment, slot }));
        }
      }
      this.regiments[side].push(regiment);
    });
    return this.clampPoint({ x: midX, y: frontY - dir * plan.wizardBack });
  }

  // The nearest spot to (x, y) where a body of `size` can stand: rocks push
  // a soldier out of its place in the ranks, not across the field.
  standNear(x, y, size) {
    const world = this.game.world;
    if (world.canStandAt(x, y, size, size)) {
      return { x, y };
    }
    for (let r = 24; r <= 480; r += 24) {
      for (let i = 0; i < 12; i++) {
        const a = i / 12 * Math.PI * 2;
        const sx = x + Math.cos(a) * r;
        const sy = y + Math.sin(a) * r;
        if (world.canStandAt(sx, sy, size, size)) {
          return { x: sx, y: sy };
        }
      }
    }
    return world.getRoomSpawnPoint(world.getMainRoom(), 3, size);
  }

  clampPoint(p) {
    const b = this.bounds;
    return {
      x: Math.max(b.left + 80, Math.min(b.right - 80, p.x)),
      y: Math.max(b.top + 80, Math.min(b.bottom - 80, p.y))
    };
  }

  // ------------------------------------------------------------- per step

  update() {
    const game = this.game;
    this.refreshLists();
    const input = game.input;
    if (!this.fighting) {
      this.deploy--;
      if (this.deploy <= 0 || input.pressed('descend')) {
        this.beginFight();
      }
    } else {
      this.fightFrames++;
    }
    if (input.pressed('mode_toggle')) {
      this.setCommander(!this.commander);
    }
    if (this.commander) {
      this.panCamera(input);
    }
    this.readOrders(input);
    this.commandRival();
    if (this.fighting && !this.over) {
      const mine = this.armyCount('player');
      const theirs = this.armyCount('enemy');
      if (theirs === 0 && mine > 0) {
        this.end('player', 'The reflection’s army is destroyed.');
      } else if (mine === 0 && theirs > 0) {
        this.end('enemy', 'Your army is destroyed.');
      } else if (mine === 0 && theirs === 0) {
        const rival = game.rival;
        const playerShare = game.player.hp / game.player.maxHp;
        const rivalShare = rival && !rival.killed ? rival.hp / rival.maxHp : 0;
        this.end(playerShare >= rivalShare ? 'player' : 'enemy', 'Both armies are destroyed.');
      }
    }
  }

  beginFight() {
    this.fighting = true;
    this.deploy = 0;
    this.game.hud.toast('YOUR ' + Races[this.races.player].name + ' AGAINST THE REFLECTION’S ' + Races[this.races.enemy].name + ' :: FIGHT!', '#ffb85a');
  }

  // Backquote selects all; the order keys apply to whatever is selected (in
  // either mode; commander mode adds the mouse, see attachMouse).
  readOrders(input) {
    const game = this.game;
    const mine = this.regiments.player.filter((r) => r.alive > 0);
    if (input.pressed('regiment_all')) {
      this.selectAll();
    }
    const chosen = mine.filter((r) => this.selected.has(r.id));
    if (!chosen.length) {
      return;
    }
    if (input.pressed('order_charge')) {
      this.order(chosen, 'charge');
      game.hud.toast(this.selectionName(chosen) + ' :: CHARGE!', '#7fb2ff');
    }
    if (input.pressed('order_follow')) {
      this.order(chosen, 'follow');
      game.hud.toast(this.selectionName(chosen) + ' :: FOLLOW ME', '#7fb2ff');
    }
    if (input.pressed('order_hold')) {
      // march to the cursor and hold, keeping the regiments' layout
      this.marchTo(chosen, input.ground);
      game.hud.toast(this.selectionName(chosen) + ' :: MARCH AND HOLD', '#7fb2ff');
    }
  }

  marchTo(regiments, g) {
    const cx = regiments.reduce((s, r) => s + r.point.x, 0) / regiments.length;
    const cy = regiments.reduce((s, r) => s + r.point.y, 0) / regiments.length;
    for (const r of regiments) {
      r.point = this.clampPoint({ x: g.x + (r.point.x - cx), y: g.y + (r.point.y - cy) });
    }
    this.order(regiments, 'hold');
  }

  order(regiments, order, target) {
    const game = this.game;
    for (const r of regiments) {
      r.attackTarget = order === 'attack' ? target : null;
      if (order === 'follow') {
        // close in around the wizard, on the side the regiment came from
        const w = game.player.center();
        const dx = r.centroid.x - w.x;
        const dy = r.centroid.y - w.y;
        const d = Math.hypot(dx, dy) || 1;
        const keep = Math.min(d, 160 + Math.max(r.cols, r.ranks) * r.spacing * 0.5);
        r.followOffset = { x: dx / d * keep, y: dy / d * keep };
      }
      r.order = order;
    }
  }

  // ------------------------------------------------------------- commander mode

  setCommander(on) {
    const game = this.game;
    this.commander = on;
    this.drag = null;
    if (on) {
      const c = game.player.center();
      const ahead = game.gfx.alignToView(0, -200);
      this.cam = { x: c.x + ahead.x, y: c.y + ahead.y };
    }
    game.hud.toast(on ? 'COMMANDER MODE :: CLICK TO SELECT, RIGHT CLICK TO ORDER' : 'SPELL MODE', on ? '#ffd060' : '#c090ff');
  }

  // WASD / arrows pan the commander's camera the way it looks; faster when
  // zoomed out.
  panCamera(input) {
    const speed = this.game.gfx.zoom * 0.55;
    let mx = 0;
    let my = 0;
    if (input.state('up')) { my -= speed; }
    if (input.state('down')) { my += speed; }
    if (input.state('left')) { mx -= speed; }
    if (input.state('right')) { mx += speed; }
    const pan = this.game.gfx.alignToView(mx, my);
    this.cam.x += pan.x;
    this.cam.y += pan.y;
    const b = this.bounds;
    this.cam.x = Math.max(b.left, Math.min(b.right, this.cam.x));
    this.cam.y = Math.max(b.top, Math.min(b.bottom + 400, this.cam.y));
  }

  // Mouse in commander mode: left click or drag selects, right click orders.
  attachMouse() {
    const canvas = this.game.gfx.canvas;
    const on = (type, fn, target = canvas) => {
      target.addEventListener(type, fn);
      this.listeners.push([target, type, fn]);
    };
    const local = (e) => {
      const rect = canvas.getBoundingClientRect();
      return { x: e.clientX - rect.left, y: e.clientY - rect.top };
    };
    on('mousedown', (e) => {
      if (!this.commander || this.game.state !== 'playing') {
        return;
      }
      const m = local(e);
      if (e.button === 0) {
        this.drag = { x0: m.x, y0: m.y, x1: m.x, y1: m.y, add: e.shiftKey };
      } else if (e.button === 2) {
        this.rightClick(m);
      }
    });
    // a drag may cross and end over the HUD: follow it on the window
    on('mousemove', (e) => {
      if (this.drag) {
        const m = local(e);
        this.drag.x1 = m.x;
        this.drag.y1 = m.y;
      }
    }, window);
    on('mouseup', (e) => {
      if (e.button !== 0 || !this.drag) {
        return;
      }
      const d = this.drag;
      this.drag = null;
      if (Math.abs(d.x1 - d.x0) + Math.abs(d.y1 - d.y0) < 8) {
        this.clickSelect({ x: d.x0, y: d.y0 }, d.add);
      } else {
        this.boxSelect(d, d.add);
      }
    }, window);
  }

  // The unit nearest a screen point, within a little slack (more for dragons).
  unitAt(screen, side) {
    const g = this.game.gfx.pickGround(screen);
    if (!g) {
      return null;
    }
    let best = null;
    let bestD = Infinity;
    this.eachNear(g.x, g.y, 100, side, (e) => {
      const d = Math.hypot(e._cx - g.x, e._cy - g.y);
      if (d < Math.max(40, e.size.x * 0.7) && d < bestD) {
        bestD = d;
        best = e;
      }
    });
    return best;
  }

  clickSelect(screen, add) {
    const unit = this.unitAt(screen, 'player');
    if (unit && unit.regiment) {
      this.toggleSelect(unit.regiment.id, add);
    } else if (!add) {
      this.selected = new Set();
    }
  }

  // Every regiment with a soldier inside the dragged box.
  boxSelect(d, add) {
    const gfx = this.game.gfx;
    const x0 = Math.min(d.x0, d.x1);
    const x1 = Math.max(d.x0, d.x1);
    const y0 = Math.min(d.y0, d.y1);
    const y1 = Math.max(d.y0, d.y1);
    const picked = new Set(add ? this.selected : []);
    for (const r of this.regiments.player) {
      for (const u of r.units) {
        if (u.killed) {
          continue;
        }
        const c = u.center();
        const p = gfx.project(c.x, c.y, 1);
        if (p && p.x >= x0 && p.x <= x1 && p.y >= y0 && p.y <= y1) {
          picked.add(r.id);
          break;
        }
      }
    }
    this.selected = picked;
  }

  // Right click: on an enemy, the selection attacks its regiment (or the
  // reflection); on open ground, it marches there and holds.
  rightClick(screen) {
    const game = this.game;
    const chosen = this.regiments.player.filter((r) => r.alive > 0 && this.selected.has(r.id));
    if (!chosen.length) {
      return;
    }
    const foe = this.unitAt(screen, 'enemy');
    if (foe) {
      const target = foe.regiment || foe;
      this.order(chosen, 'attack', target);
      game.hud.toast(this.selectionName(chosen) + ' :: ATTACK ' + (foe.regiment ? foe.regiment.name : 'THE REFLECTION'), '#ff8a70');
      return;
    }
    const g = game.gfx.pickGround(screen);
    if (!g) {
      return;
    }
    this.marchTo(chosen, g);
    game.fx.ring(g.x, g.y, { color: 0x7fb2ff, radius: 60, life: 0.4 });
  }

  // For an attacking regiment: the closest live unit of the regiment it was
  // sent against (or the wizard). Null once that target is gone.
  attackFoe(unit) {
    const t = unit.regiment.attackTarget;
    if (!t) {
      return null;
    }
    if (!t.units) {
      return t.killed || t.dead ? null : t;
    }
    let best = null;
    let bestD = Infinity;
    for (const f of t.units) {
      if (f.killed) {
        continue;
      }
      const d = unit.distanceTo(f);
      if (d < bestD) {
        bestD = d;
        best = f;
      }
    }
    return best;
  }

  selectOnly(id) {
    this.selected = new Set([id]);
  }

  selectAll() {
    this.selected = new Set(this.regiments.player.filter((r) => r.alive > 0).map((r) => r.id));
  }

  // From the HUD's regiment cards: click picks one, shift-click adds or removes.
  toggleSelect(id, add) {
    if (!add) {
      this.selectOnly(id);
    } else if (this.selected.has(id)) {
      this.selected.delete(id);
    } else {
      this.selected.add(id);
    }
  }

  selectionName(regiments) {
    const alive = this.regiments.player.filter((r) => r.alive > 0);
    if (regiments.length === alive.length) {
      return 'ALL REGIMENTS';
    }
    return regiments.length > 3 ? regiments.length + ' REGIMENTS' : regiments.map((r) => r.name).join(', ');
  }

  // The rival's generalship: the line charges, slingers advance into range,
  // knights swing round a flank before riding in, mystics guard their wizard,
  // dragons go for whatever is nearest; when the wizard is hurt and pressed,
  // the shock troops fall back to it too.
  commandRival() {
    const game = this.game;
    const rival = game.rival;
    if (!this.fighting || game.navFrame % 30 !== 0 || !rival || rival.killed) {
      return;
    }
    let pressing = 0;
    this.eachNear(rival._cx, rival._cy, 260, 'player', (u) => {
      if (!u.isWizard) {
        pressing++;
      }
    });
    const endangered = pressing >= 3 && rival.hp < rival.maxHp * 0.6;
    const midX = (this.bounds.left + this.bounds.right) / 2;
    for (const r of this.regiments.enemy) {
      if (r.kind === 'mystics' || (endangered && r.kind === 'shock')) {
        if (r.order !== 'follow') {
          r.followOffset = { x: (r.kind === 'shock' ? 1 : -1) * 90, y: -120 * r.dir };
        }
        r.order = 'follow';
      } else if (r.kind === 'knights' && this.fightFrames < 600) {
        r.order = 'hold';
        if (!r.flanking) {
          const flank = r.point.x < midX ? this.bounds.left + 160 : this.bounds.right - 160;
          r.point = this.clampPoint({ x: flank, y: (this.bounds.top + this.bounds.bottom) / 2 });
          r.flanking = true;
        }
      } else {
        r.order = 'charge';
      }
    }
  }

  // ------------------------------------------------------------- bookkeeping

  // Once a step: who is alive on each side, each regiment's count, centre and
  // anchor (its soldier nearest that centre), and the spatial grid. Every body
  // in the grid keeps its centre (_cx, _cy) and side (_side) for the step.
  refreshLists() {
    const game = this.game;
    const player = [];
    const enemy = [];
    this.bodies.length = 0;
    const add = (e, side) => this.place(e, side);
    for (const side of ['player', 'enemy']) {
      const list = side === 'player' ? player : enemy;
      for (const r of this.regiments[side]) {
        r.alive = 0;
        let sx = 0;
        let sy = 0;
        for (const u of r.units) {
          if (u.killed) {
            continue;
          }
          this.place(u, side);
          sx += u._cx;
          sy += u._cy;
          r.alive++;
          list.push(u);
        }
        if (!r.alive) {
          r.anchor = null;
          continue;
        }
        const cx = sx / r.alive;
        const cy = sy / r.alive;
        r.centroid = { x: cx, y: cy };
        let best = Infinity;
        let x0 = Infinity;
        let x1 = -Infinity;
        let y0 = Infinity;
        let y1 = -Infinity;
        for (const u of r.units) {
          if (!u.killed) {
            const d = Math.abs(u._cx - cx) + Math.abs(u._cy - cy);
            if (d < best) {
              best = d;
              r.anchor = u;
            }
            x0 = Math.min(x0, u._cx);
            x1 = Math.max(x1, u._cx);
            y0 = Math.min(y0, u._cy);
            y1 = Math.max(y1, u._cy);
          }
        }
        r.box = { x0, x1, y0, y1 };
      }
    }
    this.soldiers = { player: player.slice(), enemy: enemy.slice() };
    if (game.player && !game.player.dead) {
      player.push(game.player);
      add(game.player, 'player');
    }
    if (game.rival && !game.rival.killed) {
      enemy.push(game.rival);
      add(game.rival, 'enemy');
    }
    // the wizards' decoys draw fire like the wizards
    for (const e of game.entities) {
      if (e instanceof MirrorImage && !e.killed) {
        add(e, e.source === game.player ? 'player' : 'enemy');
      }
    }
    this.lists = { player, enemy };
    this.sortGrid();
  }

  // Counts the bodies per cell, then lays them out cell by cell.
  sortGrid() {
    const start = this.cellStart;
    const fill = this.cellFill;
    const bodies = this.bodies;
    const items = this.cellItems;
    start.fill(0);
    for (let i = 0; i < bodies.length; i++) {
      start[bodies[i]._cell + 1]++;
    }
    for (let c = 1; c < start.length; c++) {
      start[c] += start[c - 1];
    }
    fill.set(start.subarray(0, fill.length));
    items.length = bodies.length;
    for (let i = 0; i < bodies.length; i++) {
      const e = bodies[i];
      items[fill[e._cell]++] = e;
    }
  }

  // Files a body in the grid with its centre and side for this step.
  place(e, side) {
    const cx = e.pos.x + e.size.x / 2;
    const cy = e.pos.y + e.size.y / 2;
    e._cx = cx;
    e._cy = cy;
    e._side = side;
    let gx = Math.floor(cx / GRID);
    let gy = Math.floor(cy / GRID);
    gx = gx < 0 ? 0 : (gx >= this.gridCols ? this.gridCols - 1 : gx);
    gy = gy < 0 ? 0 : (gy >= this.gridRows ? this.gridRows - 1 : gy);
    e._cell = gy * this.gridCols + gx;
    this.bodies.push(e);
  }

  armyCount(side) {
    return this.soldiers[side].length;
  }

  dragonCount(side) {
    const r = this.regiments[side].find((reg) => reg.kind === 'dragons');
    return r ? r.alive : 0;
  }

  units(side) {
    return this.soldiers[side];
  }

  sideOf(e) {
    return e._side || e.side || (e === this.game.player ? 'player' : 'enemy');
  }

  // Calls fn for every body (of `side`, or both) whose centre lies within r
  // (a square) of (x, y), as of this step's grid.
  eachNear(x, y, r, side, fn) {
    const cols = this.gridCols;
    const x0 = Math.max(0, Math.floor((x - r) / GRID));
    const x1 = Math.min(cols - 1, Math.floor((x + r) / GRID));
    const y0 = Math.max(0, Math.floor((y - r) / GRID));
    const y1 = Math.min(this.gridRows - 1, Math.floor((y + r) / GRID));
    const start = this.cellStart;
    const items = this.cellItems;
    for (let gy = y0; gy <= y1; gy++) {
      for (let gx = x0; gx <= x1; gx++) {
        const c = gy * cols + gx;
        for (let i = start[c], end = start[c + 1]; i < end; i++) {
          const e = items[i];
          if (e.killed || (side && e._side !== side)) {
            continue;
          }
          if (Math.abs(e._cx - x) <= r && Math.abs(e._cy - y) <= r) {
            fn(e);
          }
        }
      }
    }
  }

  // Everything within r (a square) of an entity, optionally one side only.
  near(entity, r, side) {
    const c = entity.center();
    const out = [];
    this.eachNear(c.x, c.y, r, side, (e) => out.push(e));
    return out;
  }

  // The closest foe within maxR; wizards count as a little further away than
  // the soldier in front of you, and fighters on foot cannot reach a dragon
  // in the air. Foes close by come from the grid; further off, from the
  // ranks of the nearest enemy regiments.
  nearestFoe(unit, maxR) {
    const foeSide = unit.side === 'player' ? 'enemy' : 'player';
    const cx = unit.pos.x + unit.size.x / 2;
    const cy = unit.pos.y + unit.size.y / 2;
    const grounded = !unit.range && !unit.isDragon;
    let best = null;
    let bestD = Infinity;
    const consider = (f) => {
      if (f.killed || f.invis || (grounded && f.flying)) {
        return;
      }
      const dx = f._cx - cx;
      const dy = f._cy - cy;
      const d = Math.sqrt(dx * dx + dy * dy) * (f.isWizard ? 1.3 : 1);
      if (d < bestD && d <= maxR) {
        bestD = d;
        best = f;
      }
    };
    // how far each enemy regiment's ranks are (the gap to its bounding box)
    const regiments = this.regiments[foeSide];
    let gap = Infinity;
    for (const reg of regiments) {
      if (reg.alive && reg.box) {
        const b = reg.box;
        reg.gap = Math.max(b.x0 - cx, 0, cx - b.x1, b.y0 - cy, 0, cy - b.y1);
        gap = Math.min(gap, reg.gap);
      } else {
        reg.gap = Infinity;
      }
    }
    const wizard = foeSide === 'player' ? this.game.player : this.game.rival;
    const wizardUp = wizard && !wizard.killed && !wizard.dead && wizard._side === foeSide;
    if (wizardUp) {
      gap = Math.min(gap, Math.max(Math.abs(wizard._cx - cx), Math.abs(wizard._cy - cy)));
    }
    if (gap > maxR) {
      return null;
    }
    if (gap <= GRID * 4) {
      // close: search outward through the grid
      for (let r = GRID * 2; r <= Math.min(maxR, GRID * 8); r *= 2) {
        this.eachNear(cx, cy, r, foeSide, consider);
        if (best && bestD <= r) {
          return best;
        }
      }
    }
    // further off: head for the heart (the anchor) of the nearest regiment,
    // or the wizard; the grid takes over once the ranks are close
    for (const reg of regiments) {
      const f = reg.anchor;
      if (!f || reg.gap > maxR || (grounded && f.flying)) {
        continue;
      }
      const b = reg.box;
      const dx = Math.max(b.x0 - cx, 0, cx - b.x1);
      const dy = Math.max(b.y0 - cy, 0, cy - b.y1);
      const d = Math.sqrt(dx * dx + dy * dy);
      if (d < bestD) {
        bestD = d;
        best = f;
      }
    }
    if (wizardUp && !wizard.invis) {
      const d = Math.hypot(wizard._cx - cx, wizard._cy - cy) * 1.3;
      if (d < bestD && d <= maxR) {
        best = wizard;
      }
    }
    return best;
  }

  // A bolt in flight against the bodies of the other side around it.
  strike(p, k) {
    const team = p.team;
    const foeSide = team === 'player' ? 'enemy' : 'player';
    const px = p.pos.x;
    const py = p.pos.y;
    const r = p.size.x / 2 + 70;
    const cols = this.gridCols;
    const cx = px + p.size.x / 2;
    const cy = py + p.size.y / 2;
    const x0 = Math.max(0, Math.floor((cx - r) / GRID));
    const x1 = Math.min(cols - 1, Math.floor((cx + r) / GRID));
    const y0 = Math.max(0, Math.floor((cy - r) / GRID));
    const y1 = Math.min(this.gridRows - 1, Math.floor((cy + r) / GRID));
    const start = this.cellStart;
    const items = this.cellItems;
    for (let gy = y0; gy <= y1; gy++) {
      for (let gx = x0; gx <= x1; gx++) {
        const c = gy * cols + gx;
        for (let i = start[c], end = start[c + 1]; i < end; i++) {
          const e = items[i];
          if (e._side !== foeSide || e.killed || !p.touches(e)) {
            continue;
          }
          // iron shot is not used up by a hit: it pierces and keeps dealing damage
          e.takeSpell(p, k);
          if (p.killed || p.team !== team) {
            return;
          }
        }
      }
    }
  }

  // Where a unit stands for its regiment's hold or follow order.
  slotPoint(unit) {
    const r = unit.regiment;
    if (r.order === 'follow') {
      const wizard = r.side === 'player' ? this.game.player : this.game.rival;
      if (wizard && !wizard.killed) {
        const w = wizard.center();
        const off = r.followOffset || { x: 0, y: r.dir * 120 };
        return { x: w.x + off.x + unit.slot.x, y: w.y + off.y + unit.slot.y };
      }
    }
    return { x: r.point.x + unit.slot.x, y: r.point.y + unit.slot.y };
  }

  // ------------------------------------------------------------- banners

  // A banner over each regiment in its side's colour, a gold ring under the
  // player's selected regiments, and a marker where a holding regiment marches.
  buildMarkers() {
    const group = new THREE.Group();
    this.markers = { group, items: [] };
    const pole = new THREE.CylinderGeometry(0.06, 0.06, 4.2, 6);
    const flag = new THREE.PlaneGeometry(1.4, 0.9);
    const strip = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
    const dest = new THREE.RingGeometry(0.7, 1, 24).rotateX(-Math.PI / 2);
    const poleMat = new THREE.MeshLambertMaterial({ color: 0x4a3420 });
    for (const side of ['player', 'enemy']) {
      const flagMat = new THREE.MeshLambertMaterial({ color: TEAM_COLORS[side].cloth, side: THREE.DoubleSide, emissive: TEAM_COLORS[side].cloth, emissiveIntensity: 0.35 });
      for (const r of this.regiments[side]) {
        const banner = new THREE.Group();
        const p = new THREE.Mesh(pole, poleMat);
        p.position.y = 2.1;
        const f = new THREE.Mesh(flag, flagMat);
        f.position.set(0.72, 3.7, 0);
        banner.add(p, f);
        // big armies are seen from far off: the banners grow with them
        banner.scale.setScalar(Math.max(1, Math.sqrt(r.size / 50)) * (r.kind === 'dragons' ? 1.4 : 1));
        // the selection: a gold frame round the regiment's ranks
        const ringMat = new THREE.MeshBasicMaterial({ color: 0xffd060, transparent: true, opacity: 0.8, depthWrite: false });
        const ring = new THREE.Group();
        for (let i = 0; i < 4; i++) {
          ring.add(new THREE.Mesh(strip, ringMat));
        }
        ring.material = ringMat;
        const marker = new THREE.Mesh(dest, new THREE.MeshBasicMaterial({ color: TEAM_COLORS[side].ring, transparent: true, opacity: 0.5, depthWrite: false }));
        group.add(banner, ring, marker);
        this.markers.items.push({ r, banner, flag: f, ring, marker });
      }
    }
    this.game.gfx.add(group);
  }

  clearMarkers() {
    if (this.markers) {
      this.game.gfx.remove(this.markers.group);
      this.markers = null;
    }
  }

  syncMarkers(time) {
    if (!this.markers) {
      return;
    }
    for (const m of this.markers.items) {
      const r = m.r;
      const alive = r.alive > 0;
      m.banner.visible = alive;
      m.ring.visible = alive && r.side === 'player' && this.selected.has(r.id);
      m.marker.visible = alive && r.side === 'player' && r.order === 'hold' &&
        Math.hypot(r.point.x - r.centroid.x, r.point.y - r.centroid.y) > 60;
      if (!alive) {
        continue;
      }
      m.banner.position.set(r.centroid.x * UNIT, 0, r.centroid.y * UNIT);
      m.flag.rotation.y = Math.sin(time * 2 + r.size) * 0.3;
      if (m.ring.visible && r.box) {
        // the frame hugs the ranks as they stand
        const b = r.box;
        const pad = r.kind === 'dragons' ? 80 : 30;
        const x0 = (b.x0 - pad) * UNIT;
        const x1 = (b.x1 + pad) * UNIT;
        const z0 = (b.y0 - pad) * UNIT;
        const z1 = (b.y1 + pad) * UNIT;
        const t = 0.22;
        const [top, bottom, left, right] = m.ring.children;
        top.position.set((x0 + x1) / 2, 0.07, z0);
        top.scale.set(x1 - x0 + t, 1, t);
        bottom.position.set((x0 + x1) / 2, 0.07, z1);
        bottom.scale.set(x1 - x0 + t, 1, t);
        left.position.set(x0, 0.07, (z0 + z1) / 2);
        left.scale.set(t, 1, z1 - z0);
        right.position.set(x1, 0.07, (z0 + z1) / 2);
        right.scale.set(t, 1, z1 - z0);
        m.ring.material.opacity = 0.6 + Math.sin(time * 4) * 0.2;
      }
      m.marker.position.set(r.point.x * UNIT, 0.05, r.point.y * UNIT);
      m.marker.scale.set(1.6, 1, 1.6);
    }
  }

  // ------------------------------------------------------------- endings

  // The reflection fell (its army may fight on, but the battle is won).
  onWizardDown() {
    this.end('player', 'The reflection fell.');
  }

  end(winner, why) {
    if (this.over) {
      return;
    }
    this.over = true;
    if (winner === 'player') {
      this.game.winTrial(why);
    } else {
      this.game.loseTrial(why);
    }
  }

  dispose() {
    this.clearMarkers();
    for (const [target, type, fn] of this.listeners) {
      target.removeEventListener(type, fn);
    }
    this.listeners = [];
  }
}

