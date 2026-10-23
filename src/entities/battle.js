import * as THREE from 'three';
import { Soldier } from './soldier.js';
import { Races, raceLook } from '../world/levels.js';
import { TILE, UNIT } from '../core/constants.js';
import { ArmyRenderer } from '../render/armyRenderer.js';
import { TEAM_COLORS } from '../render/models.js';

// Battle trials (levels.js Trials): the wizard and its reflection (mirror.js)
// each lead an army across open country. The player picks their army's race
// on the menu (orcs, dwarves, humans, elves or random); the reflection fields
// a different race. Every battle is 500 a side, and the armies are split into
// regiments by unit type (infantry, slingers, knights, shock troops, mystics)
// that the player commands one by one or together: charge, march to a point
// and hold it, or follow the wizard; deeper battles field more kinds of
// regiment. The battle is won when the reflection falls or its army is
// destroyed, and lost when the player's army is destroyed: the wizard falls
// back down the stairs without the spoils (and the run ends if the wizard
// falls). Wizards follow the duel rules (damage between them, school
// lockouts); orcs take the dungeon damage, so a fireball wrecks a regiment.
export const BattleRules = {
  // orcs per side
  army: 500,
  // battle orcs are hardier than dungeon orcs, so wizards shape a battle
  // instead of deleting an army with magic missiles
  hpScale: 2,
  // frames to arrange the regiments before the battle starts (Space starts early)
  deployFrames: 900,
  // regiments larger than this are split in two
  maxRegiment: 50,
  spacing: 44,
  // share of each regiment type, one row per four floors of depth
  shares: [
    { infantry: 0.6, slingers: 0.4 },
    { infantry: 0.45, slingers: 0.3, knights: 0.25 },
    { infantry: 0.35, slingers: 0.25, knights: 0.2, shock: 0.2 },
    { infantry: 0.3, slingers: 0.2, knights: 0.15, shock: 0.2, mystics: 0.15 },
    { infantry: 0.3, slingers: 0.2, knights: 0.15, shock: 0.2, mystics: 0.15 }
  ],
  sharesAt(depth) {
    return this.shares[Math.min(this.shares.length - 1, Math.floor((depth - 1) / 4))];
  },
  // open battlefield in dungeon cells (2 tiles each) for an army of n a side:
  // wide for the battle lines, deep enough for three lines on either side
  field(n) {
    const w = 64 + Math.round(n * 0.3);
    const h = 52 + Math.round(n * 0.24);
    return { cols: w + 6, rows: h + 6, roomCount: 1, minRoomW: w, maxRoomW: w, minRoomH: h, maxRoomH: h, outcrops: 10 + Math.round(n / 8) };
  }
};

export const RegimentKinds = {
  infantry: { name: 'INFANTRY', classes: { grunt: 1 } },
  slingers: { name: 'SLINGERS', classes: { slinger: 1 } },
  knights: { name: 'KNIGHTS', classes: { knight: 1 } },
  shock: { name: 'SHOCK TROOPS', classes: { berserker: 2, brute: 1 } },
  mystics: { name: 'MYSTICS', classes: { shaman: 1, warlock: 1 } }
};

const NUMERALS = ['', ' I', ' II', ' III', ' IV', ' V', ' VI', ' VII', ' VIII', ' IX', ' X'];
const GRID = 128;

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

export class Battle {
  constructor(game) {
    this.game = game;
    // the player's race, or a random one; the reflection's is any other
    const playerRace = Races[game.race] ? game.race : pick(Object.keys(Races));
    this.races = { player: playerRace, enemy: pick(Object.keys(Races).filter((r) => r !== playerRace)) };
    this.fighting = false;
    this.deploy = 0;
    this.fightFrames = 0;
    this.lists = { player: [], enemy: [] };
    this.soldiers = { player: [], enemy: [] };
    this.regiments = { player: [], enemy: [] };
    this.selected = new Set();
    this.grid = new Map();
    this.over = false;
    this.markers = null;
    // commander mode (Tab): the wizard stands, the camera roams, the mouse
    // selects and orders regiments. Battles open in it, for deployment.
    this.commander = true;
    this.cam = { x: 0, y: 0 };
    this.drag = null;
    this.listeners = [];
    this.attachMouse();
  }

  get armySize() {
    return BattleRules.army;
  }

  // Lays out the field, the two armies and the two wizards: the player (with
  // `carry`, everything brought down the stairs) and its reflection.
  start(carry) {
    const game = this.game;
    const n = this.armySize;
    game.buildWorld(BattleRules.field(n));
    if (!game.army) {
      game.army = new ArmyRenderer(game.gfx);
    }
    game.army.clear();
    this.clearMarkers();
    const room = game.world.getMainRoom();
    const left = room.x * TILE;
    const top = room.y * TILE;
    const width = room.w * TILE;
    const height = room.h * TILE;
    this.bounds = { left, top, right: left + width, bottom: top + height };
    const mid = left + width / 2;
    this.regiments = { player: [], enemy: [] };
    // the player's army along the bottom of the field advancing up the screen,
    // the rival's along the top (dir is the way each army faces, in y)
    const wizardPlayer = this.deployArmy('player', n, top + height * 0.75, mid, -1);
    const wizardEnemy = this.deployArmy('enemy', n, top + height * 0.25, mid, 1);
    game.startTrialDuelists(wizardPlayer.x - 24, wizardPlayer.y - 24, wizardEnemy.x - 24, wizardEnemy.y - 24, carry);

    this.selected = new Set(this.regiments.player.map((r) => r.id));
    this.commander = true;
    this.cam = { x: wizardPlayer.x, y: wizardPlayer.y - 320 };
    this.fighting = false;
    this.fightFrames = 0;
    this.deploy = BattleRules.deployFrames;
    this.refreshLists();
    this.buildMarkers();
  }

  // Splits an army into regiments by type and lays them out in three lines
  // facing the enemy: infantry and shock troops in front with knights on the
  // flanks, slingers behind them, mystics at the back. Lines run across the
  // field (x) and the army faces along y. Returns where the wizard stands,
  // behind it all.
  deployArmy(side, n, frontY, midX, dir) {
    const game = this.game;
    const shares = BattleRules.sharesAt(game.depth);
    const sp = BattleRules.spacing;
    const kinds = Object.keys(shares);
    const counts = {};
    let assigned = 0;
    for (const k of kinds) {
      counts[k] = Math.floor(n * shares[k]);
      assigned += counts[k];
    }
    counts[kinds[0]] += n - assigned;
    const regiments = [];
    for (const kind of kinds) {
      const total = counts[kind];
      const parts = Math.max(1, Math.ceil(total / BattleRules.maxRegiment));
      for (let p = 0; p < parts; p++) {
        const size = Math.floor(total / parts) + (p < total % parts ? 1 : 0);
        if (size > 0) {
          regiments.push({ kind, size, name: RegimentKinds[kind].name + (parts > 1 ? NUMERALS[p + 1] : '') });
        }
      }
    }
    // formation: wide lines a few ranks deep
    for (const r of regiments) {
      r.cols = Math.max(4, Math.min(16, Math.ceil(Math.sqrt(r.size * 2.5))));
      r.ranks = Math.ceil(r.size / r.cols);
      r.width = r.cols * sp;
      r.depth = r.ranks * sp;
    }
    const front = regiments.filter((r) => r.kind === 'infantry' || r.kind === 'shock');
    // knights alternate between the two flanks of the front line
    regiments.filter((r) => r.kind === 'knights').forEach((r, i) => (i % 2 === 0 ? front.unshift(r) : front.push(r)));
    const lines = [front, regiments.filter((r) => r.kind === 'slingers'), regiments.filter((r) => r.kind === 'mystics')];
    let lineY = frontY;
    for (const line of lines) {
      if (!line.length) {
        continue;
      }
      const total = line.reduce((s, r) => s + r.width, 0) + (line.length - 1) * 60;
      let x = midX - total / 2;
      let deepest = 0;
      for (const r of line) {
        r.point = this.clampPoint({ x: x + r.width / 2, y: lineY - dir * r.depth / 2 });
        x += r.width + 60;
        deepest = Math.max(deepest, r.depth);
      }
      lineY -= dir * (deepest + 110);
    }
    // reserve instanced slots per look, then spawn every soldier in its slot
    const race = this.races[side];
    const looks = {};
    const plan = [];
    for (const r of regiments) {
      const classes = [];
      for (let i = 0; i < r.size; i++) {
        classes.push(pickWeighted(RegimentKinds[r.kind].classes));
      }
      plan.push(classes);
      for (const c of classes) {
        const look = raceLook(race, c);
        looks[look] = (looks[look] || 0) + 1;
      }
    }
    for (const look in looks) {
      if (ArmyRenderer.available(look)) {
        game.army.reserve(look, side, looks[look]);
      }
    }
    regiments.forEach((r, ri) => {
      const regiment = {
        id: side + '-' + ri,
        side,
        kind: r.kind,
        name: r.name,
        size: r.size,
        cols: r.cols,
        ranks: r.ranks,
        dir,
        point: r.point,
        order: 'hold',
        units: [],
        centroid: { x: r.point.x, y: r.point.y },
        alive: r.size
      };
      plan[ri].forEach((orcClass, i) => {
        const col = i % r.cols;
        const rank = Math.floor(i / r.cols);
        const slot = {
          x: (col - (r.cols - 1) / 2) * sp,
          y: -dir * (rank - (r.ranks - 1) / 2) * sp
        };
        let spot = { x: r.point.x + slot.x - 24, y: r.point.y + slot.y - 24 };
        if (!game.world.canStandAt(spot.x, spot.y, 48, 48)) {
          spot = game.world.getRoomSpawnPoint(game.world.getMainRoom(), 3);
        }
        regiment.units.push(game.spawn(Soldier, spot.x, spot.y, { side, race, orcClass, regiment, slot }));
      });
      this.regiments[side].push(regiment);
    });
    return this.clampPoint({ x: midX, y: lineY + dir * 60 });
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
    this.game.hud.toast('YOUR ' + Races[this.races.player].name + ' AGAINST THE REFLECTION\'S ' + Races[this.races.enemy].name + ' :: FIGHT!', '#ffb85a');
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
      const cx = chosen.reduce((s, r) => s + r.point.x, 0) / chosen.length;
      const cy = chosen.reduce((s, r) => s + r.point.y, 0) / chosen.length;
      const g = input.ground;
      for (const r of chosen) {
        r.point = this.clampPoint({ x: g.x + (r.point.x - cx), y: g.y + (r.point.y - cy) });
      }
      this.order(chosen, 'hold');
      game.hud.toast(this.selectionName(chosen) + ' :: MARCH AND HOLD', '#7fb2ff');
    }
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
        const keep = Math.min(d, 160 + Math.max(r.cols, r.ranks) * BattleRules.spacing * 0.5);
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
      this.cam = { x: c.x, y: c.y - 200 };
    }
    game.hud.toast(on ? 'COMMANDER MODE :: CLICK TO SELECT, RIGHT CLICK TO ORDER' : 'SPELL MODE', on ? '#ffd060' : '#c090ff');
  }

  // WASD / arrows pan the commander's camera; faster when zoomed out.
  panCamera(input) {
    const speed = this.game.gfx.zoom * 0.55;
    if (input.state('up')) { this.cam.y -= speed; }
    if (input.state('down')) { this.cam.y += speed; }
    if (input.state('left')) { this.cam.x -= speed; }
    if (input.state('right')) { this.cam.x += speed; }
    const b = this.bounds;
    this.cam.x = Math.max(b.left, Math.min(b.right, this.cam.x));
    this.cam.y = Math.max(b.top, Math.min(b.bottom + 400, this.cam.y));
  }

  // Mouse in commander mode: left click or drag selects, right click orders.
  attachMouse() {
    const canvas = this.game.gfx.canvas;
    const on = (type, fn) => {
      canvas.addEventListener(type, fn);
      this.listeners.push([type, fn]);
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
    on('mousemove', (e) => {
      if (this.drag) {
        const m = local(e);
        this.drag.x1 = m.x;
        this.drag.y1 = m.y;
      }
    });
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
    });
  }

  // The unit nearest a screen point, within a little slack.
  unitAt(screen, side) {
    const g = this.game.gfx.pickGround(screen);
    if (!g) {
      return null;
    }
    const probe = { center: () => g };
    let best = null;
    let bestD = 40;
    for (const e of this.near(probe, 48, side)) {
      const c = e.center();
      const d = Math.hypot(c.x - g.x, c.y - g.y);
      if (d < bestD) {
        bestD = d;
        best = e;
      }
    }
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

  // Every regiment with an orc inside the dragged box.
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
  // rival wizard); on open ground, it marches there and holds.
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
    const cx = chosen.reduce((s, r) => s + r.point.x, 0) / chosen.length;
    const cy = chosen.reduce((s, r) => s + r.point.y, 0) / chosen.length;
    for (const r of chosen) {
      r.point = this.clampPoint({ x: g.x + (r.point.x - cx), y: g.y + (r.point.y - cy) });
    }
    this.order(chosen, 'hold');
    game.fx.ring(g.x, g.y, { color: 0x7fb2ff, radius: 60, life: 0.4 });
  }

  // For an attacking regiment: the closest live orc of the regiment it was
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
    return regiments.length === alive.length ? 'ALL REGIMENTS' : regiments.map((r) => r.name).join(', ');
  }

  // The rival's generalship: the line charges, slingers advance into range,
  // knights swing round a flank before riding in, mystics guard their wizard;
  // when the wizard is hurt and pressed, the shock troops fall back to it too.
  commandRival() {
    const game = this.game;
    const rival = game.rival;
    if (!this.fighting || game.navFrame % 30 !== 0 || !rival || rival.killed) {
      return;
    }
    let pressing = 0;
    for (const u of this.near(rival, 260, 'player')) {
      if (!u.isWizard) {
        pressing++;
      }
    }
    const endangered = pressing >= 3 && rival.hp < rival.maxHp * 0.6;
    const midX = (this.bounds.left + this.bounds.right) / 2;
    for (const r of this.regiments.enemy) {
      if (r.kind === 'mystics' || (endangered && r.kind === 'shock')) {
        if (r.order !== 'follow') {
          r.followOffset = { x: (r.kind === 'shock' ? 1 : -1) * 90, y: -120 * r.dir };
        }
        r.order = 'follow';
      } else if (r.kind === 'knights' && this.fightFrames < 420) {
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

  refreshLists() {
    const game = this.game;
    const player = [];
    const enemy = [];
    const grid = new Map();
    const add = (e) => {
      const c = e.center();
      const key = Math.floor(c.x / GRID) + ',' + Math.floor(c.y / GRID);
      let cell = grid.get(key);
      if (!cell) {
        cell = [];
        grid.set(key, cell);
      }
      cell.push(e);
    };
    for (const side of ['player', 'enemy']) {
      for (const r of this.regiments[side]) {
        r.alive = 0;
        let sx = 0;
        let sy = 0;
        for (const u of r.units) {
          if (u.killed) {
            continue;
          }
          const c = u.center();
          sx += c.x;
          sy += c.y;
          r.alive++;
          (side === 'player' ? player : enemy).push(u);
          add(u);
        }
        if (r.alive) {
          r.centroid = { x: sx / r.alive, y: sy / r.alive };
        }
      }
    }
    this.soldiers = { player: player.slice(), enemy: enemy.slice() };
    if (game.player && !game.player.dead) {
      player.push(game.player);
      add(game.player);
    }
    if (game.rival && !game.rival.killed) {
      enemy.push(game.rival);
      add(game.rival);
    }
    this.lists = { player, enemy };
    this.grid = grid;
  }

  armyCount(side) {
    return this.soldiers[side].length;
  }

  units(side) {
    return this.soldiers[side];
  }

  sideOf(e) {
    return e.side || (e === this.game.player ? 'player' : 'enemy');
  }

  // Everything within r (a square) of an entity, optionally one side only.
  near(entity, r, side) {
    const c = entity.center();
    const out = [];
    const x0 = Math.floor((c.x - r) / GRID);
    const x1 = Math.floor((c.x + r) / GRID);
    const y0 = Math.floor((c.y - r) / GRID);
    const y1 = Math.floor((c.y + r) / GRID);
    for (let gy = y0; gy <= y1; gy++) {
      for (let gx = x0; gx <= x1; gx++) {
        const cell = this.grid.get(gx + ',' + gy);
        if (!cell) {
          continue;
        }
        for (const e of cell) {
          if (e.killed || (side && this.sideOf(e) !== side)) {
            continue;
          }
          const ec = e.center();
          if (Math.abs(ec.x - c.x) <= r && Math.abs(ec.y - c.y) <= r) {
            out.push(e);
          }
        }
      }
    }
    return out;
  }

  // The closest foe within maxR, searching outward through the grid; wizards
  // count as a little further away than the orc in front of you.
  nearestFoe(unit, maxR) {
    const foeSide = unit.side === 'player' ? 'enemy' : 'player';
    const c = unit.center();
    let best = null;
    let bestD = Infinity;
    const consider = (f) => {
      if (f.invis || f.killed) {
        return;
      }
      const fc = f.center();
      const d = Math.hypot(fc.x - c.x, fc.y - c.y) * (f.isWizard ? 1.3 : 1);
      if (d < bestD && d <= maxR) {
        bestD = d;
        best = f;
      }
    };
    for (let r = GRID; r <= Math.min(maxR, 1024); r *= 2) {
      for (const f of this.near(unit, r, foeSide)) {
        consider(f);
      }
      if (best && bestD <= r) {
        return best;
      }
    }
    if (best || maxR <= 1024) {
      return best;
    }
    for (const f of this.lists[foeSide]) {
      consider(f);
    }
    return best;
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
    const ringGeo = new THREE.RingGeometry(0.94, 1, 48).rotateX(-Math.PI / 2);
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
        const ring = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color: 0xffd060, transparent: true, opacity: 0.8, depthWrite: false }));
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
      const spread = Math.max(r.cols, r.ranks) * BattleRules.spacing * 0.6 * UNIT;
      m.ring.position.set(r.centroid.x * UNIT, 0.06, r.centroid.y * UNIT);
      m.ring.scale.set(spread, 1, spread);
      m.ring.material.opacity = 0.55 + Math.sin(time * 4) * 0.2;
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
    const canvas = this.game.gfx.canvas;
    for (const [type, fn] of this.listeners) {
      canvas.removeEventListener(type, fn);
    }
    this.listeners = [];
  }
}
