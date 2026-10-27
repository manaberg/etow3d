import { randInt, clamp } from '../core/constants.js';

// Room themes. Colours drive the 3D materials and the minimap.
export const DungeonThemes = [
  { name: 'hall', label: 'GREAT HALL', minimap: '#6b6b70', floor: 0x5d5a57, wall: 0x6a645c, light: 0xffb36b },
  { name: 'barracks', label: 'ORC BARRACKS', minimap: '#8a6a45', floor: 0x6b5238, wall: 0x6e5a44, light: 0xff9a4a },
  { name: 'library', label: 'FORBIDDEN LIBRARY', minimap: '#8a4a55', floor: 0x5a3640, wall: 0x5c4248, light: 0xd77bff },
  { name: 'alchemy', label: 'ALCHEMY LAB', minimap: '#4e8a5c', floor: 0x3b5a44, wall: 0x485a4c, light: 0x7dff9a },
  { name: 'crypt', label: 'CRYPT', minimap: '#4c5a8a', floor: 0x3a4260, wall: 0x464c64, light: 0x7aa6ff },
  { name: 'throne', label: 'THRONE ROOM', minimap: '#a8893a', floor: 0x6e5a2c, wall: 0x6e6040, light: 0xffd36b }
];

export const DungeonThemeIndex = {};
DungeonThemes.forEach((t, i) => {
  DungeonThemeIndex[t.name] = i;
});

// Dungeon cells: floor, wall, and low ground (water, lava, chasms: it stops
// walkers but not bolts or sight, see World).
export const FLOOR = 0;
export const WALL = 1;
export const LOW = 2;

// What the renderer should make of a cell beyond plain wall and floor:
// free-standing pillars (drawn in the floor's pillar style), bookshelves,
// the ribs of a giant skeleton, and floor bridging low ground.
export const CellTags = { pillar: 1, shelf: 2, rib: 3, bridge: 4 };

function pickWeighted(weights) {
  let total = 0;
  for (const key in weights) {
    total += weights[key];
  }
  let roll = Math.random() * total;
  for (const key in weights) {
    roll -= weights[key];
    if (roll < 0) {
      return key;
    }
  }
  return Object.keys(weights)[0];
}

function grid(cols, rows, value) {
  const out = [];
  for (let y = 0; y < rows; y++) {
    out.push(new Array(cols).fill(value));
  }
  return out;
}

const DX4 = [1, -1, 0, 0];
const DY4 = [0, 0, 1, -1];

// Builds a dungeon on a grid of 48px cells. Rooms are placed by rejection
// sampling (or in mirrored pairs), linked by a minimum spanning tree plus a
// few extra loops, carved in their shape, and joined by corridors routed with
// A* so they keep clear of other rooms. A floor's look (looks.js) picks the
// shapes, how corridors wander, pillars, pools and rivers; a last pass makes
// sure every floor cell can be walked to from the start. A tunnel (the
// mobile descent) chains the rooms one after another instead (planTunnel).
export class DungeonGenerator {
  constructor(options = {}) {
    this.cols = 64;
    this.rows = 44;
    this.roomCount = 9;
    this.minRoomW = 9;
    this.maxRoomW = 15;
    this.minRoomH = 7;
    this.maxRoomH = 11;
    // chance that a room is drawn taller than wide (long galleries both ways)
    this.turnChance = 0;
    this.roomGap = 3;
    this.corridorWidth = 3;
    this.extraLoopChance = 0.35;
    // battle maps: rock outcrops scattered over the middle of the one big
    // field, between these fractions of its height
    this.outcrops = 0;
    this.outcropBand = [0, 1];
    // room shapes by weight (rect, round, octagon, cross, cave, gallery), and
    // the start's and throne room's own; `throneSize` [w, h] places a great
    // throne room far from the start
    this.shapes = { rect: 1 };
    this.startShape = 'rect';
    this.throneShape = null;
    this.throneSize = null;
    // rooms in mirrored pairs about the middle, the start at the bottom
    this.mirror = false;
    // 0..1: how much corridors wander, and how ragged walls crumble
    this.winding = 0;
    this.erode = 0;
    // pillar pattern: corners, colonnade, grid, thick, scatter, ring, shelves,
    // ribcage or none; the start hall stays clear of them unless
    // `hallPillars`, the throne room if `openThrone`
    this.pillars = 'corners';
    this.hallPillars = false;
    this.openThrone = false;
    // low ground: pools in rooms { kind: blob|center|island, chance, count,
    // radius, margin, throne } and a river { width, meander } across the map
    this.pools = null;
    this.river = null;
    // a tunnel: the rooms one after another from the start at the bottom of
    // the map to the throne room at the top, each linked only to the next,
    // none wider than `tunnelWidth` (the throne room a little wider), swaying
    // up to `tunnelSway` cells off the middle with `tunnelGap` cells of
    // corridor between them, and rubble in the plainer rooms
    this.tunnel = false;
    this.tunnelWidth = 14;
    this.tunnelSway = 4;
    this.tunnelGap = [3, 6];
    Object.assign(this, options);
  }

  generate() {
    // a tunnel is cut to fit its rooms, and is never mirrored
    const planned = this.tunnel ? this.planTunnel() : null;
    if (this.tunnel) {
      this.mirror = false;
    }
    if (this.mirror) {
      // the start and the throne room sit exactly on the middle line
      if ((this.cols - this.maxRoomW) % 2 !== 0) {
        this.cols++;
      }
      if (this.throneSize && (this.cols - this.throneSize[0]) % 2 !== 0) {
        this.throneSize = [this.throneSize[0] + 1, this.throneSize[1]];
      }
    }
    const { cols, rows } = this;
    this.cells = grid(cols, rows, WALL);
    this.owner = grid(cols, rows, -1);
    this.tags = grid(cols, rows, 0);
    this.wind = this.winding > 0 ? this.noiseField(5) : null;
    const rooms = planned || this.placeRooms();
    const links = planned ? rooms.slice(1).map((_, i) => [i, i + 1]) : this.pickLinks(rooms);
    this.assignThemes(rooms, links);
    rooms.forEach((room, r) => {
      room.shape = room.twin !== undefined && room.twin < r ? rooms[room.twin].shape : this.shapeFor(room, r);
      this.carveRoom(room, r);
    });
    if (this.river) {
      this.carveRiver(rooms);
    }
    for (const [a, b] of links) {
      this.carveCorridor(rooms, a, b);
    }
    if (this.mirror) {
      this.mirrorCells(rooms);
    }
    if (this.erode > 0) {
      this.erodeWalls();
    }
    // pools first: pillars and shelves then stand clear of them
    if (this.pools) {
      rooms.forEach((room, r) => this.addPools(room, r));
    }
    rooms.forEach((room, r) => this.addPillars(room, r));
    if (this.tunnel) {
      rooms.forEach((room, r) => this.addRubble(room, r));
    }
    if (this.outcrops > 0) {
      this.addOutcrops(rooms[0]);
    }
    this.connect(rooms[0]);
    return { cols, rows, cells: this.cells, owner: this.owner, tags: this.tags, rooms, links };
  }

  // ------------------------------------------------------------ rooms

  roomSize() {
    let w = randInt(this.minRoomW, this.maxRoomW);
    let h = randInt(this.minRoomH, this.maxRoomH);
    if (this.turnChance > 0 && Math.random() < this.turnChance) {
      [w, h] = [h, w];
    }
    return { w, h };
  }

  placeRooms() {
    const rooms = [];
    const { cols, rows } = this;
    // the starting hall sits near the middle so every wing is reachable (or,
    // mirrored, at the bottom of the map facing the throne at the top)
    const startW = this.maxRoomW;
    const startH = this.maxRoomH;
    if (this.mirror) {
      rooms.push({ x: Math.floor((cols - startW) / 2), y: rows - startH - 3, w: startW, h: startH });
    } else {
      rooms.push({
        x: cols >= startW + this.minRoomW + this.maxRoomW + 2 * (this.roomGap + 2)
          ? Math.floor((cols - startW) / 2) + randInt(-4, 4)
          : (Math.random() < 0.5 ? randInt(2, 5) : randInt(cols - startW - 5, cols - startW - 2)),
        y: rows >= startH + this.minRoomH + this.maxRoomH + 2 * (this.roomGap + 2)
          ? Math.floor((rows - startH) / 2) + randInt(-3, 3)
          : (Math.random() < 0.5 ? randInt(2, 4) : randInt(rows - startH - 4, rows - startH - 2)),
        w: startW,
        h: startH
      });
    }
    if (this.throneSize) {
      this.placeGreatRoom(rooms);
    }
    const free = (room) => room.x >= 2 && room.y >= 2 && room.x + room.w <= cols - 2 && room.y + room.h <= rows - 2 &&
      rooms.every((other) => !this.rectsTouch(room, other, this.roomGap));
    let attempts = 0;
    while (rooms.length < this.roomCount && attempts < 800) {
      attempts++;
      const { w, h } = this.roomSize();
      if (!this.mirror) {
        const room = { x: randInt(2, cols - w - 2), y: randInt(2, rows - h - 2), w, h };
        if (free(room)) {
          rooms.push(room);
        }
        continue;
      }
      // mirrored: a pair either side of the middle, or one on the middle
      // line when a single room is left to place
      const left = this.roomCount - rooms.length;
      if (left % 2 === 1 && attempts % 3 === 0) {
        const room = { x: Math.floor((cols - w) / 2), y: randInt(2, rows - h - 2), w, h };
        if ((cols - w) % 2 === 0 && free(room)) {
          rooms.push(room);
        }
        continue;
      }
      if (left < 2) {
        continue;
      }
      const room = { x: randInt(2, Math.floor(cols / 2) - w - 2), y: randInt(2, rows - h - 2), w, h };
      const twin = { x: cols - room.x - w, y: room.y, w, h };
      if (room.x >= 2 && free(room) && free(twin) && !this.rectsTouch(room, twin, this.roomGap)) {
        room.twin = rooms.length + 1;
        twin.twin = rooms.length;
        rooms.push(room, twin);
      }
    }
    return rooms;
  }

  // A tunnel's rooms, from the start up to the throne room, and the map's
  // size to hold them: long rooms turn to run along the tunnel, and each
  // room sways a little left or right of the one before.
  planTunnel() {
    const maxW = this.tunnelWidth;
    const sway = this.tunnelSway;
    const sizes = [];
    for (let i = 0; i < this.roomCount; i++) {
      let { w, h } = i === 0 ? { w: this.maxRoomW, h: this.maxRoomH } : this.roomSize();
      if (w > maxW) {
        [w, h] = [h, w];
      }
      sizes.push({ w: Math.min(w, maxW), h });
    }
    const last = sizes.length - 1;
    if (this.throneSize && last > 0) {
      const [w, h] = this.throneSize;
      sizes[last] = { w: Math.min(w, maxW + sway * 2), h, great: true };
    }
    const gaps = sizes.map(() => randInt(...this.tunnelGap));
    // room for the sway, winding corridors and a margin of rock
    this.cols = maxW + sway * 2 + 8;
    this.rows = 6 + sizes.reduce((sum, s) => sum + s.h, 0) + gaps.slice(1).reduce((sum, g) => sum + g, 0);
    const mid = this.cols / 2;
    let offset = 0;
    let y = this.rows - 3;
    return sizes.map((size, i) => {
      if (i > 0) {
        offset = clamp(offset + randInt(-3, 3), -sway, sway);
        y -= gaps[i];
      }
      y -= size.h;
      const x = clamp(Math.round(mid + offset - size.w / 2), 3, this.cols - size.w - 3);
      return size.great ? { x, y, w: size.w, h: size.h, great: true } : { x, y, w: size.w, h: size.h };
    });
  }

  // The throne room of `throneSize`, as far from the start as it fits (or,
  // mirrored, at the top of the map).
  placeGreatRoom(rooms) {
    const [w, h] = this.throneSize;
    const start = rooms[0];
    let best = null;
    let bestD = -1;
    const tries = this.mirror ? [{ x: Math.floor((this.cols - w) / 2), y: 3 }] : [];
    for (let i = 0; i < 300 && !this.mirror; i++) {
      tries.push({ x: randInt(2, this.cols - w - 2), y: randInt(2, this.rows - h - 2) });
    }
    for (const t of tries) {
      const room = { x: t.x, y: t.y, w, h, great: true };
      if (room.x < 2 || room.y < 2 || room.x + w > this.cols - 2 || room.y + h > this.rows - 2 ||
        this.rectsTouch(room, start, this.roomGap)) {
        continue;
      }
      const d = this.roomDistance(room, start);
      if (d > bestD) {
        bestD = d;
        best = room;
      }
    }
    if (best) {
      rooms.push(best);
    }
  }

  rectsTouch(a, b, gap) {
    return !(
      a.x + a.w + gap <= b.x ||
      b.x + b.w + gap <= a.x ||
      a.y + a.h + gap <= b.y ||
      b.y + b.h + gap <= a.y
    );
  }

  roomCenter(room) {
    return { x: room.x + Math.floor(room.w / 2), y: room.y + Math.floor(room.h / 2) };
  }

  roomDistance(a, b) {
    const ca = this.roomCenter(a);
    const cb = this.roomCenter(b);
    return Math.hypot(ca.x - cb.x, ca.y - cb.y);
  }

  // Prim's MST over room centres, then a few short extra edges for loops so
  // the player can circle around pursuers instead of hitting dead ends.
  pickLinks(rooms) {
    const links = [];
    if (rooms.length < 2) {
      return links;
    }
    const inTree = rooms.map((_, i) => i === 0);
    const linked = {};
    for (let added = 1; added < rooms.length; added++) {
      let bestA = -1;
      let bestB = -1;
      let bestD = Infinity;
      for (let a = 0; a < rooms.length; a++) {
        if (!inTree[a]) {
          continue;
        }
        for (let b = 0; b < rooms.length; b++) {
          if (inTree[b]) {
            continue;
          }
          const d = this.roomDistance(rooms[a], rooms[b]);
          if (d < bestD) {
            bestD = d;
            bestA = a;
            bestB = b;
          }
        }
      }
      inTree[bestB] = true;
      links.push([bestA, bestB]);
      linked[bestA + ',' + bestB] = linked[bestB + ',' + bestA] = true;
    }
    const candidates = [];
    for (let x = 0; x < rooms.length; x++) {
      for (let y = x + 1; y < rooms.length; y++) {
        if (!linked[x + ',' + y]) {
          candidates.push({ a: x, b: y, d: this.roomDistance(rooms[x], rooms[y]) });
        }
      }
    }
    candidates.sort((p, q) => p.d - q.d);
    let extras = Math.max(1, Math.floor(rooms.length / 3));
    for (let c = 0; c < candidates.length && extras > 0; c++) {
      if (Math.random() < this.extraLoopChance || c < 1) {
        links.push([candidates[c].a, candidates[c].b]);
        extras--;
      }
    }
    return links;
  }

  shapeFor(room, r) {
    if (r === 0) {
      return this.startShape;
    }
    if (room.theme === 'throne' && this.throneShape) {
      return this.throneShape;
    }
    return pickWeighted(this.shapes);
  }

  // Which cells of its rectangle a room of `shape` covers.
  shapeMask(room) {
    const { w, h } = room;
    const mask = grid(w, h, false);
    if (room.shape === 'cave') {
      return this.caveMask(w, h);
    }
    const cx = (w - 1) / 2;
    const cy = (h - 1) / 2;
    const cut = Math.max(2, Math.round(Math.min(w, h) * 0.3));
    const armW = Math.max(3, Math.round(w * 0.4));
    const armH = Math.max(3, Math.round(h * 0.4));
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        let inside = true;
        if (room.shape === 'round') {
          const dx = (x - cx) / (w / 2);
          const dy = (y - cy) / (h / 2);
          inside = dx * dx + dy * dy <= 1.04;
        } else if (room.shape === 'octagon') {
          inside = Math.min(x, w - 1 - x) + Math.min(y, h - 1 - y) >= cut - 1;
        } else if (room.shape === 'cross') {
          inside = Math.abs(x - cx) <= armW / 2 || Math.abs(y - cy) <= armH / 2;
        }
        mask[y][x] = inside;
      }
    }
    return mask;
  }

  // A cave: noise thickest in the middle, smoothed by a cellular automaton,
  // keeping the open part joined to the centre.
  caveMask(w, h) {
    const cx = (w - 1) / 2;
    const cy = (h - 1) / 2;
    let mask = grid(w, h, false);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const dx = (x - cx) / (w / 2);
        const dy = (y - cy) / (h / 2);
        const d = Math.sqrt(dx * dx + dy * dy);
        mask[y][x] = Math.random() < 1.25 - d * 0.85;
      }
    }
    for (let step = 0; step < 4; step++) {
      const next = grid(w, h, false);
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          let open = 0;
          for (let oy = -1; oy <= 1; oy++) {
            for (let ox = -1; ox <= 1; ox++) {
              if (mask[y + oy] && mask[y + oy][x + ox]) {
                open++;
              }
            }
          }
          next[y][x] = open >= 5;
        }
      }
      mask = next;
    }
    // an open core so the corridors meet in the middle
    for (let y = Math.floor(cy) - 1; y <= Math.ceil(cy) + 1; y++) {
      for (let x = Math.floor(cx) - 1; x <= Math.ceil(cx) + 1; x++) {
        mask[y][x] = true;
      }
    }
    const kept = grid(w, h, false);
    const queue = [[Math.floor(cx), Math.floor(cy)]];
    kept[Math.floor(cy)][Math.floor(cx)] = true;
    let count = 1;
    while (queue.length > 0) {
      const [x, y] = queue.pop();
      for (let d = 0; d < 4; d++) {
        const nx = x + DX4[d];
        const ny = y + DY4[d];
        if (nx >= 0 && ny >= 0 && nx < w && ny < h && mask[ny][nx] && !kept[ny][nx]) {
          kept[ny][nx] = true;
          count++;
          queue.push([nx, ny]);
        }
      }
    }
    // too small a cave: widen it to an ellipse
    if (count < w * h * 0.45) {
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          const dx = (x - cx) / (w / 2);
          const dy = (y - cy) / (h / 2);
          if (dx * dx + dy * dy <= 0.75) {
            kept[y][x] = true;
          }
        }
      }
    }
    return kept;
  }

  carveRoom(room, r) {
    const mask = this.shapeMask(room);
    for (let y = 0; y < room.h; y++) {
      for (let x = 0; x < room.w; x++) {
        if (mask[y][x]) {
          this.cells[room.y + y][room.x + x] = FLOOR;
          this.owner[room.y + y][room.x + x] = r;
        }
      }
    }
    if (room.shape === 'gallery') {
      this.addPilasters(room);
    }
  }

  // Galleries: piers stand out from both long walls every third cell.
  addPilasters(room) {
    const long = room.w >= room.h;
    const length = long ? room.w : room.h;
    for (let i = 2; i < length - 2; i += 3) {
      for (const side of [0, (long ? room.h : room.w) - 1]) {
        const x = room.x + (long ? i : side);
        const y = room.y + (long ? side : i);
        this.cells[y][x] = WALL;
        this.owner[y][x] = -1;
      }
    }
  }

  // ------------------------------------------------------------ corridors

  // Smooth random values (0..1) over the map, `scale` cells apart.
  noiseField(scale) {
    const gw = Math.ceil(this.cols / scale) + 2;
    const gh = Math.ceil(this.rows / scale) + 2;
    const g = grid(gw, gh, 0).map((row) => row.map(() => Math.random()));
    const out = grid(this.cols, this.rows, 0);
    for (let y = 0; y < this.rows; y++) {
      for (let x = 0; x < this.cols; x++) {
        const fx = x / scale;
        const fy = y / scale;
        const ix = Math.floor(fx);
        const iy = Math.floor(fy);
        const tx = fx - ix;
        const ty = fy - iy;
        const sx = tx * tx * (3 - 2 * tx);
        const sy = ty * ty * (3 - 2 * ty);
        const top = g[iy][ix] + (g[iy][ix + 1] - g[iy][ix]) * sx;
        const bottom = g[iy + 1][ix] + (g[iy + 1][ix + 1] - g[iy + 1][ix]) * sx;
        out[y][x] = top + (bottom - top) * sy;
      }
    }
    return out;
  }

  // Corridor centre line via A* on the cell grid. Other rooms and their
  // surroundings are expensive so corridors don't graze them, existing
  // corridors are cheap so routes merge, and turns cost extra. Winding
  // floors add a noise field so corridors meander; low ground is crossed
  // rather than followed, and the floor laid over it becomes a bridge.
  carveCorridor(rooms, fromIndex, toIndex) {
    const { cols, rows, cells, owner } = this;
    const width = this.corridorWidth;
    const lo = -Math.floor((width - 1) / 2);
    const hi = Math.ceil((width - 1) / 2);
    const margin = Math.max(-lo, hi) + 1;
    const start = this.roomCenter(rooms[fromIndex]);
    const goal = this.roomCenter(rooms[toIndex]);
    const wind = this.wind;
    const turnCost = 3 * (1 - this.winding * 0.8);
    const cost = (x, y) => {
      if (x < margin || y < margin || x >= cols - margin || y >= rows - margin) {
        return Infinity;
      }
      const wander = wind ? wind[y][x] * this.winding * 8 : 0;
      const inside = owner[y][x];
      if (inside === fromIndex || inside === toIndex) {
        return 1;
      }
      if (inside >= 0) {
        return 40;
      }
      for (let r = 0; r < rooms.length; r++) {
        if (r === fromIndex || r === toIndex) {
          continue;
        }
        const room = rooms[r];
        if (
          x >= room.x - margin && x < room.x + room.w + margin &&
          y >= room.y - margin && y < room.y + room.h + margin
        ) {
          return 25;
        }
      }
      if (cells[y][x] === LOW) {
        return 3 + wander;
      }
      return (cells[y][x] === FLOOR ? 0.6 : 1.4) + wander;
    };
    const key = (x, y, dir) => (((y * cols) + x) * 4) + dir;
    const dx = [1, -1, 0, 0];
    const dy = [0, 0, 1, -1];
    const open = [];
    const g = {};
    const parent = {};
    const closed = {};
    for (let sd = 0; sd < 4; sd++) {
      const sk = key(start.x, start.y, sd);
      g[sk] = 0;
      parent[sk] = -1;
      open.push({ k: sk, x: start.x, y: start.y, dir: sd, f: 0 });
    }
    let endKey = -1;
    let iterations = 0;
    while (open.length > 0 && iterations < 40000) {
      iterations++;
      let bestI = 0;
      for (let i = 1; i < open.length; i++) {
        if (open[i].f < open[bestI].f) {
          bestI = i;
        }
      }
      const node = open[bestI];
      open[bestI] = open[open.length - 1];
      open.pop();
      if (closed[node.k]) {
        continue;
      }
      closed[node.k] = true;
      if (node.x === goal.x && node.y === goal.y) {
        endKey = node.k;
        break;
      }
      for (let d = 0; d < 4; d++) {
        const nx = node.x + dx[d];
        const ny = node.y + dy[d];
        const step = cost(nx, ny);
        if (step === Infinity) {
          continue;
        }
        const nk = key(nx, ny, d);
        if (closed[nk]) {
          continue;
        }
        const ng = g[node.k] + step + (d !== node.dir ? turnCost : 0);
        if (g[nk] !== undefined && ng >= g[nk]) {
          continue;
        }
        g[nk] = ng;
        parent[nk] = node.k;
        open.push({ k: nk, x: nx, y: ny, dir: d, f: ng + Math.abs(goal.x - nx) + Math.abs(goal.y - ny) });
      }
    }
    let trace = endKey;
    while (trace !== -1 && trace !== undefined) {
      const cell = Math.floor(trace / 4);
      const cx = cell % cols;
      const cy = Math.floor(cell / cols);
      for (let oy = lo; oy <= hi; oy++) {
        for (let ox = lo; ox <= hi; ox++) {
          this.openCell(cx + ox, cy + oy);
        }
      }
      trace = parent[trace];
    }
  }

  // Lays floor on a cell; over low ground the floor is a bridge.
  openCell(x, y) {
    if (x < 1 || y < 1 || x >= this.cols - 1 || y >= this.rows - 1) {
      return;
    }
    if (this.cells[y][x] === LOW) {
      this.tags[y][x] = CellTags.bridge;
    } else if (this.cells[y][x] === WALL) {
      this.tags[y][x] = 0;
    }
    this.cells[y][x] = FLOOR;
  }

  // Mirrored floors: whatever is open on one side opens on the other, so the
  // wings and the corridors between them are symmetric.
  mirrorCells(rooms) {
    const { cols, rows, cells, owner } = this;
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < Math.floor(cols / 2); x++) {
        const mx = cols - 1 - x;
        const a = cells[y][x];
        const b = cells[y][mx];
        const v = a === FLOOR || b === FLOOR ? FLOOR : (a === LOW || b === LOW ? LOW : WALL);
        cells[y][x] = cells[y][mx] = v;
      }
    }
    // floor mirrored into a room belongs to it
    rooms.forEach((room, r) => {
      const twin = room.twin === undefined ? r : room.twin;
      for (let y = room.y; y < room.y + room.h; y++) {
        for (let x = room.x; x < room.x + room.w; x++) {
          if (cells[y][x] === FLOOR && owner[y][x] < 0 && owner[y][cols - 1 - x] === twin) {
            owner[y][x] = r;
          }
        }
      }
    });
  }

  // Ragged cave walls: wall cells next to the floor crumble away at random.
  // It only ever opens space, so no way through is ever closed.
  erodeWalls() {
    const { cols, rows, cells, owner } = this;
    for (let pass = 0; pass < 2; pass++) {
      const chance = this.erode * (pass === 0 ? 1 : 0.5);
      const crumble = [];
      for (let y = 2; y < rows - 2; y++) {
        for (let x = 2; x < cols - 2; x++) {
          if (cells[y][x] !== WALL || this.tags[y][x]) {
            continue;
          }
          for (let d = 0; d < 4; d++) {
            if (cells[y + DY4[d]][x + DX4[d]] === FLOOR) {
              if (Math.random() < chance) {
                crumble.push([x, y, owner[y + DY4[d]][x + DX4[d]]]);
              }
              break;
            }
          }
        }
      }
      for (const [x, y, room] of crumble) {
        cells[y][x] = FLOOR;
        owner[y][x] = room;
      }
    }
  }

  // ------------------------------------------------------------ themes

  // The start room is the hall, the room furthest away (by corridor hops)
  // becomes the throne room (unless a great room was placed for it), and the
  // rest are spread over the other themes.
  assignThemes(rooms, links) {
    if (rooms.length === 0) {
      return;
    }
    const hops = rooms.map((_, i) => (i === 0 ? 0 : -1));
    const queue = [0];
    while (queue.length > 0) {
      const current = queue.shift();
      for (const [a, b] of links) {
        const other = a === current ? b : (b === current ? a : -1);
        if (other >= 0 && hops[other] < 0) {
          hops[other] = hops[current] + 1;
          queue.push(other);
        }
      }
    }
    let throneIndex = rooms.findIndex((room) => room.great);
    if (throneIndex < 0) {
      throneIndex = 0;
      for (let h = 1; h < rooms.length; h++) {
        if (hops[h] > hops[throneIndex] ||
          (hops[h] === hops[throneIndex] && rooms[h].w * rooms[h].h > rooms[throneIndex].w * rooms[throneIndex].h)) {
          throneIndex = h;
        }
      }
    }
    const pool = ['barracks', 'library', 'alchemy', 'crypt'];
    let bag = [];
    rooms.forEach((room, r) => {
      room.hops = hops[r];
      if (r === 0) {
        room.theme = 'hall';
      } else if (r === throneIndex) {
        room.theme = 'throne';
      } else {
        if (bag.length === 0) {
          bag = pool.slice();
        }
        room.theme = bag.splice(randInt(0, bag.length - 1), 1)[0];
      }
      room.themeIndex = DungeonThemeIndex[room.theme];
    });
  }

  // ------------------------------------------------------------ features

  // Small blocks of rock over the band of a battlefield between the armies
  // (outcropBand), clear of where they deploy, to break lines of sight and
  // funnel them.
  addOutcrops(room) {
    const cells = this.cells;
    const x0 = room.x + Math.floor(room.w * 0.1);
    const x1 = room.x + Math.floor(room.w * 0.9) - 2;
    const y0 = Math.max(room.y + 2, room.y + Math.floor(room.h * this.outcropBand[0]));
    const y1 = Math.min(room.y + room.h - 4, room.y + Math.floor(room.h * this.outcropBand[1]));
    for (let n = 0; n < this.outcrops; n++) {
      const x = randInt(x0, x1);
      const y = randInt(y0, y1);
      const w = randInt(1, 2);
      const h = randInt(1, 2);
      for (let yy = y; yy < y + h; yy++) {
        for (let xx = x; xx < x + w; xx++) {
          cells[yy][xx] = WALL;
        }
      }
    }
  }

  // Whether a pillar may stand on a cell of room `r`: open floor of the room
  // with two cells of it all round, so nothing gets squeezed shut.
  canPillar(x, y, r) {
    for (let oy = -2; oy <= 2; oy++) {
      for (let ox = -2; ox <= 2; ox++) {
        const row = this.cells[y + oy];
        if (!row || row[x + ox] === undefined) {
          return false;
        }
        if (this.tags[y + oy][x + ox]) {
          continue;
        }
        if (row[x + ox] !== FLOOR || this.owner[y + oy][x + ox] !== r) {
          return false;
        }
      }
    }
    return true;
  }

  setPillar(x, y, r, tag = CellTags.pillar) {
    if (!this.canPillar(x, y, r)) {
      return false;
    }
    this.cells[y][x] = WALL;
    this.tags[y][x] = tag;
    return true;
  }

  // Pillars give big rooms some cover to fight around, in the floor's
  // pattern.
  addPillars(room, r) {
    const pattern = this.pillars;
    if (pattern === 'none' || (room.theme === 'hall' && !this.hallPillars) || (room.theme === 'throne' && this.openThrone)) {
      return;
    }
    if (pattern === 'corners') {
      this.cornerPillars(room, r);
      return;
    }
    if (room.w < 9 || room.h < 7) {
      return;
    }
    const cx = room.x + Math.floor(room.w / 2);
    const cy = room.y + Math.floor(room.h / 2);
    if (pattern === 'colonnade') {
      // two rows of columns down the long axis
      const long = room.w >= room.h;
      const length = long ? room.w : room.h;
      const first = (long ? room.x : room.y) + 2 + Math.floor(((length - 5) % 3) / 2);
      for (let i = first; i < (long ? room.x + room.w : room.y + room.h) - 2; i += 3) {
        for (const side of long ? [room.y + 2, room.y + room.h - 3] : [room.x + 2, room.x + room.w - 3]) {
          this.setPillar(long ? i : side, long ? side : i, r);
        }
      }
    } else if (pattern === 'grid' || pattern === 'thick') {
      // a forest of columns (or of 2x2 piers), centred in the room
      const step = pattern === 'thick' ? 5 : 3;
      const size = pattern === 'thick' ? 2 : 1;
      const offX = Math.floor(((room.w - 6 - size) % step) / 2);
      const offY = Math.floor(((room.h - 6 - size) % step) / 2);
      for (let y = room.y + 3 + offY; y + size <= room.y + room.h - 3; y += step) {
        for (let x = room.x + 3 + offX; x + size <= room.x + room.w - 3; x += step) {
          const block = [];
          for (let oy = 0; oy < size; oy++) {
            for (let ox = 0; ox < size; ox++) {
              block.push([x + ox, y + oy]);
            }
          }
          if (block.every(([bx, by]) => this.canPillar(bx, by, r))) {
            for (const [bx, by] of block) {
              this.cells[by][bx] = WALL;
              this.tags[by][bx] = CellTags.pillar;
            }
          }
        }
      }
    } else if (pattern === 'scatter') {
      // boulders, stalagmites or ruins dotted about
      const count = Math.floor(room.w * room.h / 28);
      for (let n = 0, tries = 0; n < count && tries < count * 12; tries++) {
        const x = randInt(room.x + 2, room.x + room.w - 3);
        const y = randInt(room.y + 2, room.y + room.h - 3);
        if (Math.abs(x - cx) + Math.abs(y - cy) > 2 && this.setPillar(x, y, r)) {
          n++;
        }
      }
    } else if (pattern === 'ring') {
      // a ring of columns around the middle of a round room
      const rx = (room.w - 1) / 2 * 0.62;
      const ry = (room.h - 1) / 2 * 0.62;
      // three cells apart, so the ring never closes into a wall
      const count = Math.max(4, Math.floor(Math.PI * (rx + ry) / 3));
      for (let i = 0; i < count; i++) {
        const a = (i / count) * Math.PI * 2;
        this.setPillar(Math.round(cx + Math.cos(a) * rx), Math.round(cy + Math.sin(a) * ry), r);
      }
    } else if (pattern === 'shelves') {
      // rows of bookshelves with aisles between and a gap down the middle
      for (let y = room.y + 3; y <= room.y + room.h - 4; y += 3) {
        for (let x = room.x + 3; x <= room.x + room.w - 4; x++) {
          if (Math.abs(x - cx) <= 1) {
            continue;
          }
          this.setPillar(x, y, r, CellTags.shelf);
        }
      }
    } else if (pattern === 'ribcage') {
      // the bones of something enormous: ribs in two rows over an aisle
      if (room.w >= 13 && room.h >= 11) {
        const reach = Math.min(Math.floor(room.w / 2) - 4, 6);
        let ribs = 0;
        for (let x = cx - reach; x <= cx + reach; x += 2) {
          if (this.canPillar(x, cy - 2, r) && this.canPillar(x, cy + 2, r)) {
            this.setPillar(x, cy - 2, r, CellTags.rib);
            this.setPillar(x, cy + 2, r, CellTags.rib);
            ribs++;
          }
        }
        if (ribs > 0) {
          room.ribcage = { x0: cx - reach, x1: cx + reach, y0: cy - 2, y1: cy + 2 };
          return;
        }
      }
      this.cornerPillars(room, r);
    }
  }

  // Tunnels: fallen rock dotted about the rooms whose pillars leave them
  // open, so the way through winds a little. Each block keeps two cells of
  // floor from the walls (canPillar), so the way is never shut.
  addRubble(room, r) {
    if (r === 0 || room.theme === 'throne' || !['corners', 'colonnade', 'ring'].includes(this.pillars)) {
      return;
    }
    const count = Math.floor(room.w * room.h / 40);
    for (let n = 0, tries = 0; n < count && tries < count * 12; tries++) {
      const x = randInt(room.x + 2, room.x + room.w - 3);
      const y = randInt(room.y + 2, room.y + room.h - 3);
      if (this.setPillar(x, y, r)) {
        n++;
      }
    }
  }

  // Four pillars near the corners of big rooms, and two rows of columns lining
  // the approach to the throne.
  cornerPillars(room, r) {
    if (room.w < 11 || room.h < 9) {
      return;
    }
    const insetX = 3;
    const insetY = 2;
    const put = (x, y) => {
      if (this.cells[y][x] === FLOOR && this.owner[y][x] === r) {
        this.cells[y][x] = WALL;
        this.tags[y][x] = CellTags.pillar;
      }
    };
    if (room.theme === 'throne') {
      for (let x = room.x + insetX; x < room.x + room.w - insetX; x += 3) {
        put(x, room.y + insetY);
        put(x, room.y + room.h - 1 - insetY);
      }
      return;
    }
    put(room.x + insetX, room.y + insetY);
    put(room.x + room.w - 1 - insetX, room.y + insetY);
    put(room.x + insetX, room.y + room.h - 1 - insetY);
    put(room.x + room.w - 1 - insetX, room.y + room.h - 1 - insetY);
  }

  // How deep each cell of a room lies inside it: steps to the nearest cell
  // that is not its open floor (walls, pillars, corridor mouths).
  roomDepth(room, r) {
    const depth = grid(room.w, room.h, -1);
    const queue = [];
    for (let y = 0; y < room.h; y++) {
      for (let x = 0; x < room.w; x++) {
        const cx = room.x + x;
        const cy = room.y + y;
        let edge = this.cells[cy][cx] !== FLOOR || this.owner[cy][cx] !== r;
        for (let oy = -1; oy <= 1 && !edge; oy++) {
          for (let ox = -1; ox <= 1 && !edge; ox++) {
            edge = this.cells[cy + oy][cx + ox] !== FLOOR || this.owner[cy + oy][cx + ox] !== r;
          }
        }
        if (edge) {
          depth[y][x] = this.cells[cy][cx] === FLOOR && this.owner[cy][cx] === r ? 1 : 0;
          queue.push([x, y]);
        }
      }
    }
    for (let head = 0; head < queue.length; head++) {
      const [x, y] = queue[head];
      for (let oy = -1; oy <= 1; oy++) {
        for (let ox = -1; ox <= 1; ox++) {
          const nx = x + ox;
          const ny = y + oy;
          if (nx >= 0 && ny >= 0 && nx < room.w && ny < room.h && depth[ny][nx] < 0) {
            depth[ny][nx] = depth[y][x] + 1;
            queue.push([nx, ny]);
          }
        }
      }
    }
    return depth;
  }

  // Low ground in a room: pools (blobs), one pool in the middle, or a lake
  // over all but a shore and an island. `margin` cells of floor are kept
  // between it and the walls, so the room's ways in stay joined.
  addPools(room, r) {
    const spec = this.pools;
    if (r === 0 || (room.theme === 'throne' && !spec.throne) || Math.random() > (spec.chance === undefined ? 1 : spec.chance)) {
      return;
    }
    const margin = spec.margin || 2;
    const depth = this.roomDepth(room, r);
    const deepest = Math.max(...depth.map((row) => Math.max(...row)));
    if (deepest <= margin + 1) {
      return;
    }
    const sink = (x, y) => {
      if (depth[y - room.y][x - room.x] > margin && !this.tags[y][x]) {
        this.cells[y][x] = LOW;
      }
    };
    const cx = room.x + (room.w - 1) / 2;
    const cy = room.y + (room.h - 1) / 2;
    if (spec.kind === 'island' || spec.kind === 'center') {
      // a lake with an island, or a single pit in the middle
      const island = spec.kind === 'island' ? Math.max(1.5, Math.min(room.w, room.h) * 0.18) : 0;
      const size = spec.kind === 'center' ? (spec.size || 0.32) : 1;
      for (let y = room.y; y < room.y + room.h; y++) {
        for (let x = room.x; x < room.x + room.w; x++) {
          const dx = (x - cx) / (room.w / 2);
          const dy = (y - cy) / (room.h / 2);
          const d = Math.sqrt(dx * dx + dy * dy);
          const ix = (x - cx) / island;
          const iy = (y - cy) / island;
          if (d <= size && (island === 0 || ix * ix + iy * iy > 1)) {
            sink(x, y);
          }
        }
      }
      return;
    }
    const [c0, c1] = spec.count || [1, 2];
    const [r0, r1] = spec.radius || [1.5, 3];
    for (let n = randInt(c0, c1), tries = 0; n > 0 && tries < 30; tries++) {
      const px = randInt(room.x + 1, room.x + room.w - 2);
      const py = randInt(room.y + 1, room.y + room.h - 2);
      const radius = r0 + Math.random() * (r1 - r0);
      if (depth[py - room.y][px - room.x] < margin + Math.min(radius, 2)) {
        continue;
      }
      n--;
      const wobble = Math.random() * Math.PI * 2;
      const stretch = 0.75 + Math.random() * 0.5;
      for (let y = Math.floor(py - radius - 1); y <= Math.ceil(py + radius + 1); y++) {
        for (let x = Math.floor(px - radius * stretch - 1); x <= Math.ceil(px + radius * stretch + 1); x++) {
          if (x < room.x || y < room.y || x >= room.x + room.w || y >= room.y + room.h) {
            continue;
          }
          const a = Math.atan2(y - py, x - px);
          const edge = radius * (0.8 + 0.25 * Math.sin(a * 3 + wobble));
          const dx = (x - px) / stretch;
          const dy = y - py;
          if (dx * dx + dy * dy <= edge * edge) {
            sink(x, y);
          }
        }
      }
    }
  }

  // A river of low ground (lava, molten iron) winding right across the map
  // along its long side (across a tunnel), clear of the start and the throne
  // room. Corridors carved after it cross it on bridges.
  carveRiver(rooms) {
    const spec = this.river;
    const along = this.tunnel || this.cols >= this.rows;
    const length = along ? this.cols : this.rows;
    const across = along ? this.rows : this.cols;
    const [w0, w1] = spec.width || [2, 3];
    const width = randInt(w0, w1);
    const amp = (spec.meander === undefined ? 0.6 : spec.meander) * Math.min(across, length) * 0.14;
    const guard = rooms.filter((room) => room.theme === 'hall' || room.theme === 'throne');
    const blocked = (x, y) => guard.some((room) => x >= room.x - 1 && x <= room.x + room.w && y >= room.y - 1 && y <= room.y + room.h);
    // the course: try a few and keep the one that runs clear of the start
    // and the throne room the longest
    let best = null;
    for (let attempt = 0; attempt < 12; attempt++) {
      const base = across * (0.25 + Math.random() * 0.5);
      const f1 = (Math.PI * 2) / (length * (0.5 + Math.random() * 0.5));
      const f2 = f1 * 2.3;
      const p1 = Math.random() * Math.PI * 2;
      const p2 = Math.random() * Math.PI * 2;
      const course = [];
      let hits = 0;
      for (let t = 0; t < length; t++) {
        const c = Math.round(base + Math.sin(t * f1 + p1) * amp + Math.sin(t * f2 + p2) * amp * 0.35);
        course.push(c);
        for (let k = 0; k < width; k++) {
          const x = along ? t : c + k;
          const y = along ? c + k : t;
          if (blocked(x, y)) {
            hits++;
          }
        }
      }
      if (!best || hits < best.hits) {
        best = { course, hits };
      }
    }
    for (let t = 1; t < length - 1; t++) {
      // fill between this step and the next so the band never breaks
      const a = best.course[t];
      const b = best.course[Math.min(length - 1, t + 1)];
      for (let c = Math.min(a, b); c <= Math.max(a, b) + width - 1; c++) {
        const x = along ? t : c;
        const y = along ? c : t;
        if (x < 1 || y < 1 || x >= this.cols - 1 || y >= this.rows - 1 || blocked(x, y)) {
          continue;
        }
        this.cells[y][x] = LOW;
      }
    }
  }

  // Every floor cell must be reachable from the start: pockets cut off by
  // pools, rivers or pillars get a bridge over the low ground (or a way
  // through the rock), and scraps too small to matter sink.
  connect(start) {
    const { cols, rows, cells } = this;
    const begin = this.roomCenter(start);
    for (let round = 0; round < 40; round++) {
      const reached = grid(cols, rows, false);
      const queue = [[begin.x, begin.y]];
      reached[begin.y][begin.x] = true;
      for (let head = 0; head < queue.length; head++) {
        const [x, y] = queue[head];
        for (let d = 0; d < 4; d++) {
          const nx = x + DX4[d];
          const ny = y + DY4[d];
          if (cells[ny] && cells[ny][nx] === FLOOR && !reached[ny][nx]) {
            reached[ny][nx] = true;
            queue.push([nx, ny]);
          }
        }
      }
      // the cut-off pockets, largest first
      const seen = grid(cols, rows, false);
      const pockets = [];
      for (let y = 0; y < rows; y++) {
        for (let x = 0; x < cols; x++) {
          if (cells[y][x] !== FLOOR || reached[y][x] || seen[y][x]) {
            continue;
          }
          const pocket = [[x, y]];
          seen[y][x] = true;
          for (let head = 0; head < pocket.length; head++) {
            const [px, py] = pocket[head];
            for (let d = 0; d < 4; d++) {
              const nx = px + DX4[d];
              const ny = py + DY4[d];
              if (cells[ny] && cells[ny][nx] === FLOOR && !seen[ny][nx]) {
                seen[ny][nx] = true;
                pocket.push([nx, ny]);
              }
            }
          }
          pockets.push(pocket);
        }
      }
      if (pockets.length === 0) {
        return;
      }
      pockets.sort((a, b) => b.length - a.length);
      for (const pocket of pockets) {
        if (pocket.length >= 6) {
          continue;
        }
        for (const [x, y] of pocket) {
          const wet = DX4.some((_, d) => cells[y + DY4[d]] && cells[y + DY4[d]][x + DX4[d]] === LOW);
          cells[y][x] = wet ? LOW : WALL;
          this.tags[y][x] = 0;
        }
      }
      if (pockets[0].length < 6) {
        continue;
      }
      this.bridge(pockets[0], reached);
    }
  }

  // Cheapest way from a pocket to the reached floor: low ground is cheap to
  // bridge, rock dearer, pillars dearer still. Carved three cells wide.
  bridge(pocket, reached) {
    const { cols, rows, cells } = this;
    const dist = new Float32Array(cols * rows).fill(Infinity);
    const from = new Int32Array(cols * rows).fill(-1);
    const open = [];
    for (const [x, y] of pocket) {
      dist[y * cols + x] = 0;
      open.push(y * cols + x);
    }
    let end = -1;
    while (open.length > 0) {
      let bi = 0;
      for (let i = 1; i < open.length; i++) {
        if (dist[open[i]] < dist[open[bi]]) {
          bi = i;
        }
      }
      const cur = open[bi];
      open[bi] = open[open.length - 1];
      open.pop();
      const x = cur % cols;
      const y = (cur - x) / cols;
      if (reached[y][x]) {
        end = cur;
        break;
      }
      for (let d = 0; d < 4; d++) {
        const nx = x + DX4[d];
        const ny = y + DY4[d];
        if (nx < 2 || ny < 2 || nx >= cols - 2 || ny >= rows - 2) {
          continue;
        }
        const cell = cells[ny][nx];
        const step = cell === FLOOR ? 0.2 : (cell === LOW ? 1 : (this.tags[ny][nx] ? 9 : 4));
        const next = ny * cols + nx;
        if (dist[cur] + step < dist[next]) {
          if (dist[next] === Infinity) {
            open.push(next);
          }
          dist[next] = dist[cur] + step;
          from[next] = cur;
        }
      }
    }
    for (let cur = end; cur >= 0; cur = from[cur]) {
      const x = cur % cols;
      const y = (cur - x) / cols;
      for (let oy = -1; oy <= 1; oy++) {
        for (let ox = -1; ox <= 1; ox++) {
          if (cells[y + oy][x + ox] !== FLOOR) {
            this.openCell(x + ox, y + oy);
          }
        }
      }
    }
  }
}
