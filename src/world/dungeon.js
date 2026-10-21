import { randInt } from '../core/constants.js';

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

// Builds a dungeon on a grid of 48px cells: 1 = wall, 0 = floor. Rooms are
// placed by rejection sampling, linked by a minimum spanning tree plus a few
// extra loops, and corridors are routed with A* so they keep clear of rooms.
export class DungeonGenerator {
  constructor(options = {}) {
    this.cols = 64;
    this.rows = 44;
    this.roomCount = 9;
    this.minRoomW = 9;
    this.maxRoomW = 15;
    this.minRoomH = 7;
    this.maxRoomH = 11;
    this.roomGap = 3;
    this.corridorWidth = 3;
    this.extraLoopChance = 0.35;
    Object.assign(this, options);
  }

  generate() {
    const cells = [];
    const owner = [];
    for (let y = 0; y < this.rows; y++) {
      cells.push(new Array(this.cols).fill(1));
      owner.push(new Array(this.cols).fill(-1));
    }
    const rooms = this.placeRooms();
    rooms.forEach((room, r) => this.carveRect(cells, owner, room, r));
    const links = this.pickLinks(rooms);
    for (const [a, b] of links) {
      this.carveCorridor(cells, owner, rooms, a, b);
    }
    this.assignThemes(rooms, links);
    for (const room of rooms) {
      this.addPillars(cells, room);
    }
    return { cols: this.cols, rows: this.rows, cells, owner, rooms, links };
  }

  placeRooms() {
    const rooms = [];
    // the starting hall sits near the middle so every wing is reachable
    const startW = this.maxRoomW;
    const startH = this.maxRoomH;
    rooms.push({
      x: Math.floor((this.cols - startW) / 2) + randInt(-4, 4),
      y: Math.floor((this.rows - startH) / 2) + randInt(-3, 3),
      w: startW,
      h: startH
    });
    let attempts = 0;
    while (rooms.length < this.roomCount && attempts < 600) {
      attempts++;
      const w = randInt(this.minRoomW, this.maxRoomW);
      const h = randInt(this.minRoomH, this.maxRoomH);
      const room = {
        x: randInt(2, this.cols - w - 2),
        y: randInt(2, this.rows - h - 2),
        w,
        h
      };
      if (rooms.every((other) => !this.rectsTouch(room, other, this.roomGap))) {
        rooms.push(room);
      }
    }
    return rooms;
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

  carveRect(cells, owner, room, roomIndex) {
    for (let y = room.y; y < room.y + room.h; y++) {
      for (let x = room.x; x < room.x + room.w; x++) {
        cells[y][x] = 0;
        owner[y][x] = roomIndex;
      }
    }
  }

  // Corridor centre line via A* on the cell grid. Other rooms and their
  // surroundings are expensive so corridors don't graze them, existing
  // corridors are cheap so routes merge, and turns cost extra.
  carveCorridor(cells, owner, rooms, fromIndex, toIndex) {
    const cols = this.cols;
    const rows = this.rows;
    const half = Math.floor(this.corridorWidth / 2);
    const start = this.roomCenter(rooms[fromIndex]);
    const goal = this.roomCenter(rooms[toIndex]);
    const cost = (x, y) => {
      if (x < half + 1 || y < half + 1 || x >= cols - half - 1 || y >= rows - half - 1) {
        return Infinity;
      }
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
          x >= room.x - half - 1 && x < room.x + room.w + half + 1 &&
          y >= room.y - half - 1 && y < room.y + room.h + half + 1
        ) {
          return 25;
        }
      }
      return cells[y][x] === 0 ? 0.6 : 1.4;
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
        const ng = g[node.k] + step + (d !== node.dir ? 3 : 0);
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
      for (let oy = -half; oy <= half; oy++) {
        for (let ox = -half; ox <= half; ox++) {
          const px = cx + ox;
          const py = cy + oy;
          if (cells[py] && cells[py][px] !== undefined) {
            cells[py][px] = 0;
          }
        }
      }
      trace = parent[trace];
    }
  }

  // The start room is the hall, the room furthest away (by corridor hops)
  // becomes the throne room, and the rest are spread over the other themes.
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
    let throneIndex = 0;
    for (let h = 1; h < rooms.length; h++) {
      if (hops[h] > hops[throneIndex] ||
        (hops[h] === hops[throneIndex] && rooms[h].w * rooms[h].h > rooms[throneIndex].w * rooms[throneIndex].h)) {
        throneIndex = h;
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

  // Single-cell pillars give big themed rooms some cover to fight around.
  addPillars(cells, room) {
    if (room.theme === 'hall' || room.w < 11 || room.h < 9) {
      return;
    }
    const insetX = 3;
    const insetY = 2;
    if (room.theme === 'throne') {
      // two rows of columns lining the approach to the throne
      for (let x = room.x + insetX; x < room.x + room.w - insetX; x += 3) {
        cells[room.y + insetY][x] = 1;
        cells[room.y + room.h - 1 - insetY][x] = 1;
      }
      return;
    }
    const spots = [
      [room.x + insetX, room.y + insetY],
      [room.x + room.w - 1 - insetX, room.y + insetY],
      [room.x + insetX, room.y + room.h - 1 - insetY],
      [room.x + room.w - 1 - insetX, room.y + room.h - 1 - insetY]
    ];
    for (const [x, y] of spots) {
      cells[y][x] = 1;
    }
  }
}
