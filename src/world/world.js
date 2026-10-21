import { TILE, CELL, randInt } from '../core/constants.js';
import { DungeonGenerator, DungeonThemes } from './dungeon.js';
import { Pathfinder } from './pathfinder.js';

// One floor: the generated dungeon, its collision map (every 48px cell is
// 2x2 collision tiles), room records in collision-tile units and the
// pathfinder over it.
export class World {
  constructor(options, frameSource) {
    const dungeon = new DungeonGenerator(options).generate();
    this.dungeon = dungeon;
    this.width = dungeon.cols * 2;
    this.height = dungeon.rows * 2;
    const grid = [];
    for (let y = 0; y < this.height; y++) {
      grid.push(new Array(this.width).fill(1));
    }
    for (let y = 0; y < dungeon.rows; y++) {
      for (let x = 0; x < dungeon.cols; x++) {
        if (dungeon.cells[y][x] === 0) {
          grid[y * 2][x * 2] = 0;
          grid[y * 2][x * 2 + 1] = 0;
          grid[y * 2 + 1][x * 2] = 0;
          grid[y * 2 + 1][x * 2 + 1] = 0;
        }
      }
    }
    this.solid = new Uint8Array(this.width * this.height);
    for (let y = 0; y < this.height; y++) {
      for (let x = 0; x < this.width; x++) {
        this.solid[y * this.width + x] = grid[y][x];
      }
    }
    this.rooms = dungeon.rooms.map((room, r) => ({
      x: room.x * 2,
      y: room.y * 2,
      w: room.w * 2,
      h: room.h * 2,
      theme: room.theme,
      themeIndex: room.themeIndex,
      label: DungeonThemes[room.themeIndex].label,
      visited: r === 0
    }));
    this.mainRoomIndex = 0;
    this.pathfinder = new Pathfinder(grid, TILE, frameSource);
  }

  get pixelWidth() {
    return this.width * TILE;
  }

  get pixelHeight() {
    return this.height * TILE;
  }

  isSolidTile(tx, ty) {
    if (tx < 0 || ty < 0 || tx >= this.width || ty >= this.height) {
      return true;
    }
    return this.solid[ty * this.width + tx] === 1;
  }

  boxFree(x, y, w, h) {
    const x0 = Math.floor(x / TILE);
    const y0 = Math.floor(y / TILE);
    const x1 = Math.floor((x + w - 0.001) / TILE);
    const y1 = Math.floor((y + h - 0.001) / TILE);
    for (let ty = y0; ty <= y1; ty++) {
      for (let tx = x0; tx <= x1; tx++) {
        if (this.isSolidTile(tx, ty)) {
          return false;
        }
      }
    }
    return true;
  }

  // Moves a box by (dx, dy) in small sub-steps, x before y, stopping flush
  // against walls. The free axis keeps moving, so bodies slide along walls.
  trace(x, y, w, h, dx, dy) {
    const steps = Math.max(1, Math.ceil(Math.max(Math.abs(dx), Math.abs(dy)) / 8));
    const sx = dx / steps;
    const sy = dy / steps;
    let hitX = false;
    let hitY = false;
    for (let i = 0; i < steps; i++) {
      if (sx !== 0 && !hitX) {
        const nx = x + sx;
        if (this.boxFree(nx, y, w, h)) {
          x = nx;
        } else {
          hitX = true;
          if (sx > 0) {
            x = Math.max(x, Math.floor((nx + w) / TILE) * TILE - w - 0.01);
          } else {
            x = Math.min(x, (Math.floor(nx / TILE) + 1) * TILE + 0.01);
          }
        }
      }
      if (sy !== 0 && !hitY) {
        const ny = y + sy;
        if (this.boxFree(x, ny, w, h)) {
          y = ny;
        } else {
          hitY = true;
          if (sy > 0) {
            y = Math.max(y, Math.floor((ny + h) / TILE) * TILE - h - 0.01);
          } else {
            y = Math.min(y, (Math.floor(ny / TILE) + 1) * TILE + 0.01);
          }
        }
      }
    }
    return { x, y, hitX, hitY };
  }

  getMainRoom() {
    return this.rooms[this.mainRoomIndex];
  }

  getRoomCenterPixel(room) {
    return {
      x: Math.floor(room.x + room.w / 2) * TILE,
      y: Math.floor(room.y + room.h / 2) * TILE
    };
  }

  // Random spot inside a room (top-left of an entity of `entitySize`), clear
  // of pillars with a tile of breathing room.
  getRoomSpawnPoint(room, padding, entitySize) {
    const size = entitySize || 48;
    const pad = padding || 2;
    let minX = room.x + pad;
    let maxX = room.x + room.w - pad - 1;
    let minY = room.y + pad;
    let maxY = room.y + room.h - pad - 1;
    if (maxX < minX) {
      minX = room.x + 1;
      maxX = room.x + room.w - 2;
    }
    if (maxY < minY) {
      minY = room.y + 1;
      maxY = room.y + room.h - 2;
    }
    let spot = null;
    for (let attempt = 0; attempt < 30; attempt++) {
      const tx = randInt(minX, maxX);
      const ty = randInt(minY, maxY);
      spot = { x: (tx * TILE) - (size / 2), y: (ty * TILE) - (size / 2) };
      if (this.pathfinder.isAreaWalkable(spot.x - TILE, spot.y - TILE, size + CELL, size + CELL)) {
        return spot;
      }
    }
    return spot;
  }

  getRoomIndexForWorldPoint(worldX, worldY) {
    const tx = Math.floor(worldX / TILE);
    const ty = Math.floor(worldY / TILE);
    for (let i = 0; i < this.rooms.length; i++) {
      const room = this.rooms[i];
      if (tx >= room.x && tx < room.x + room.w && ty >= room.y && ty < room.y + room.h) {
        return i;
      }
    }
    return -1;
  }

  // pixel distance from a point to the nearest edge of a room
  roomDistance(room, worldX, worldY) {
    const dx = Math.max(room.x * TILE - worldX, 0, worldX - (room.x + room.w) * TILE);
    const dy = Math.max(room.y * TILE - worldY, 0, worldY - (room.y + room.h) * TILE);
    return Math.sqrt(dx * dx + dy * dy);
  }

  findRoomIndexByTheme(theme) {
    return this.rooms.findIndex((room) => room.theme === theme);
  }

  hasLineOfSight(ax, ay, bx, by) {
    return this.pathfinder.hasLineOfSight(ax, ay, bx, by);
  }

  canStandAt(x, y, w, h) {
    return this.pathfinder.isAreaWalkable(x, y, w, h);
  }
}
