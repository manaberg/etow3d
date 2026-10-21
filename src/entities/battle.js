import * as THREE from 'three';
import { Mage, SpellBook } from './mage.js';
import { DuelWizard } from './duelWizard.js';
import { Soldier } from './soldier.js';
import { DuelSpells } from './duelLoot.js';
import { OrcClasses } from '../world/levels.js';
import { TILE, UNIT } from '../core/constants.js';
import { ArmyRenderer } from '../render/armyRenderer.js';
import { TEAM_COLORS } from '../render/models.js';

// Battle mode: a best-of-five match between two wizards, each leading an orc
// army across open country. The battles grow from 40 orcs a side to 200, and
// the armies are split into regiments by unit type (infantry, slingers,
// knights, shock troops, mystics) that the player commands one by one or
// together: charge, march to a point and hold it, or follow the wizard.
// Both wizards start with magic missile and one random spell; after every
// battle the player picks one of three new spells and the rival learns one.
// A battle is lost when your wizard falls or your army is wiped out. Wizards
// follow the duel rules (damage between them, 3 s global cooldown); orcs take
// the dungeon damage, so a fireball wrecks a regiment.
export const BattleRules = {
  // orcs per side in each battle
  armies: [40, 80, 120, 160, 200],
  winsNeeded: 3,
  draftChoices: 3,
  // battle orcs are hardier than dungeon orcs, so wizards shape a battle
  // instead of deleting an army with magic missiles
  hpScale: 2,
  // frames to arrange the regiments before the battle starts (Space starts early)
  deployFrames: 900,
  // regiments larger than this are split in two
  maxRegiment: 50,
  spacing: 44,
  // share of each regiment type per battle
  shares: [
    { infantry: 0.6, slingers: 0.4 },
    { infantry: 0.45, slingers: 0.3, knights: 0.25 },
    { infantry: 0.35, slingers: 0.25, knights: 0.2, shock: 0.2 },
    { infantry: 0.3, slingers: 0.2, knights: 0.15, shock: 0.2, mystics: 0.15 },
    { infantry: 0.3, slingers: 0.2, knights: 0.15, shock: 0.2, mystics: 0.15 }
  ],
  // open battlefield in dungeon cells (2 tiles each) for an army of n a side
  field(n) {
    const w = 60 + Math.round(n * 0.35);
    const h = 40 + Math.round(n * 0.15);
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

const NUMERALS = ['', ' I', ' II', ' III', ' IV'];
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
    const mid = top + height / 2;
    this.regiments = { player: [], enemy: [] };
    const wizardPlayer = this.deployArmy('player', n, left + width * 0.2, mid, 1);
    const wizardEnemy = this.deployArmy('enemy', n, left + width * 0.8, mid, -1);

    const pl = game.spawn(Mage, wizardPlayer.x - 24, wizardPlayer.y - 24);
    game.player = pl;
    game.configureDuelPlayer(pl);
    for (const entry of DuelSpells) {
      pl[entry.flag] = this.playerSpells.has(entry.id);
      if (entry.tier) {
        pl[entry.tier] = pl[entry.flag];
      }
    }
    pl.hasTele = false;
    const rival = game.spawn(DuelWizard, wizardEnemy.x - 24, wizardEnemy.y - 24, { difficulty: game.difficulty });
    rival.known = new Set(this.rivalSpells);
    game.rival = rival;

    this.selected = new Set(this.regiments.player.map((r) => r.id));
    this.fighting = false;
    this.fightFrames = 0;
    this.deploy = BattleRules.deployFrames;
    this.refreshLists();
    this.buildMarkers();
    game.state = 'playing';
    if (game.hud.minimap) {
      game.hud.onBattleRound(this);
    }
  }

  // Splits an army into regiments by type and lays them out in three lines
  // facing the enemy: infantry and shock troops in front with knights on the
  // flanks, slingers behind them, mystics at the back. Returns where the
  // wizard stands, behind it all.
  deployArmy(side, n, frontX, midY, dir) {
    const game = this.game;
    const shares = BattleRules.shares[Math.min(this.round, BattleRules.shares.length - 1)];
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
    let lineX = frontX;
    for (const line of lines) {
      if (!line.length) {
        continue;
      }
      const total = line.reduce((s, r) => s + r.width, 0) + (line.length - 1) * 60;
      let y = midY - total / 2;
      let deepest = 0;
      for (const r of line) {
        r.point = this.clampPoint({ x: lineX - dir * r.depth / 2, y: y + r.width / 2 });
        y += r.width + 60;
        deepest = Math.max(deepest, r.depth);
      }
      lineX -= dir * (deepest + 110);
    }
    // reserve instanced slots per look, then spawn every orc in its slot
    const looks = {};
    const plan = [];
    for (const r of regiments) {
      const classes = [];
      for (let i = 0; i < r.size; i++) {
        classes.push(pickWeighted(RegimentKinds[r.kind].classes));
      }
      plan.push(classes);
      for (const c of classes) {
        const look = OrcClasses[c].look;
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
          x: -dir * (rank - (r.ranks - 1) / 2) * sp,
          y: (col - (r.cols - 1) / 2) * sp
        };
        let spot = { x: r.point.x + slot.x - 24, y: r.point.y + slot.y - 24 };
        if (!game.world.canStandAt(spot.x, spot.y, 48, 48)) {
          spot = game.world.getRoomSpawnPoint(game.world.getMainRoom(), 3);
        }
        regiment.units.push(game.spawn(Soldier, spot.x, spot.y, { side, orcClass, regiment, slot }));
      });
      this.regiments[side].push(regiment);
    });
    return this.clampPoint({ x: lineX + dir * 60, y: midY });
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
    this.readOrders(input);
    this.commandRival();
    if (this.fighting && !this.over) {
      const mine = this.armyCount('player');
      const theirs = this.armyCount('enemy');
      if (theirs === 0 && mine > 0) {
        this.endRound('player', 'The rival’s army is destroyed.');
      } else if (mine === 0 && theirs > 0) {
        this.endRound('enemy', 'Your army is destroyed.');
      } else if (mine === 0 && theirs === 0) {
        const rival = game.rival;
        const playerShare = game.player.hp / game.player.maxHp;
        const rivalShare = rival && !rival.killed ? rival.hp / rival.maxHp : 0;
        this.endRound(playerShare >= rivalShare ? 'player' : 'enemy', 'Both armies are destroyed.');
      }
    }
  }

  beginFight() {
    this.fighting = true;
    this.deploy = 0;
    this.game.hud.toast('BATTLE ' + (this.round + 1) + ' :: FIGHT!', '#ffb85a');
  }

  // Tab cycles the selection (all regiments, then each in turn), backquote
  // selects all, and the order keys apply to whatever is selected.
  readOrders(input) {
    const game = this.game;
    const mine = this.regiments.player.filter((r) => r.alive > 0);
    if (input.pressed('regiment_next') && mine.length) {
      const allSelected = mine.every((r) => this.selected.has(r.id));
      const current = mine.findIndex((r) => this.selected.has(r.id));
      if (allSelected && mine.length > 1) {
        this.selectOnly(mine[0].id);
      } else if (current === mine.length - 1 || current < 0) {
        this.selectAll();
      } else {
        this.selectOnly(mine[current + 1].id);
      }
    }
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

  order(regiments, order) {
    const game = this.game;
    for (const r of regiments) {
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
    const midY = (this.bounds.top + this.bounds.bottom) / 2;
    for (const r of this.regiments.enemy) {
      if (r.kind === 'mystics' || (endangered && r.kind === 'shock')) {
        if (r.order !== 'follow') {
          r.followOffset = { x: -120 * r.dir, y: (r.kind === 'shock' ? 1 : -1) * 90 };
        }
        r.order = 'follow';
      } else if (r.kind === 'knights' && this.fightFrames < 420) {
        r.order = 'hold';
        if (!r.flanking) {
          const flank = r.point.y < midY ? this.bounds.top + 160 : this.bounds.bottom - 160;
          r.point = this.clampPoint({ x: (this.bounds.left + this.bounds.right) / 2, y: flank });
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
        const off = r.followOffset || { x: r.dir * 120, y: 0 };
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

  dispose() {
    this.clearMarkers();
  }
}
