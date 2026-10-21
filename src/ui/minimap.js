import { DungeonThemes } from '../world/dungeon.js';
import { Orc } from '../entities/orc.js';
import { Clericorc, Mageorc, Boss } from '../entities/bosses.js';

// Visited rooms show in their theme colour, the rest stay as dim outlines.
// The base image is redrawn only when a room is discovered; markers are
// painted on top every frame.
export class Minimap {
  constructor(canvas, game) {
    this.canvas = canvas;
    this.game = game;
    this.base = document.createElement('canvas');
    this.cell = 3;
    this.large = false;
  }

  render() {
    const world = this.game.world;
    if (!world) {
      return;
    }
    const dungeon = world.dungeon;
    const cell = this.cell;
    this.base.width = dungeon.cols * cell;
    this.base.height = dungeon.rows * cell;
    this.canvas.width = this.base.width;
    this.canvas.height = this.base.height;
    const ctx = this.base.getContext('2d');
    ctx.clearRect(0, 0, this.base.width, this.base.height);
    ctx.fillStyle = 'rgba(0, 0, 0, 0.55)';
    ctx.fillRect(0, 0, this.base.width, this.base.height);
    for (let y = 0; y < dungeon.rows; y++) {
      for (let x = 0; x < dungeon.cols; x++) {
        if (dungeon.cells[y][x] !== 0) {
          continue;
        }
        const owner = dungeon.owner[y][x];
        if (owner >= 0 && world.rooms[owner].visited) {
          ctx.fillStyle = DungeonThemes[dungeon.rooms[owner].themeIndex].minimap;
        } else if (owner >= 0) {
          ctx.fillStyle = '#2c2c30';
        } else {
          ctx.fillStyle = '#45454a';
        }
        ctx.fillRect(x * cell, y * cell, cell, cell);
      }
    }
  }

  setLarge(large) {
    this.large = large;
    this.cell = large ? 7 : 3;
    this.render();
  }

  draw() {
    const game = this.game;
    const player = game.player;
    if (!player || !game.world) {
      return;
    }
    const ctx = this.canvas.getContext('2d');
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    ctx.drawImage(this.base, 0, 0);
    const scale = this.cell / 48;
    // stairs show once their room is explored or they unseal
    if (game.stairs && (game.isStairsOpen() || game.world.rooms[game.stairsRoomIndex].visited)) {
      const sc = game.stairs.center();
      ctx.fillStyle = game.isStairsOpen() ? '#6cf' : '#c84';
      ctx.fillRect(Math.floor(sc.x * scale) - 3, Math.floor(sc.y * scale) - 3, 6, 6);
    }
    // hunting enemies are bright, unaware ones dim
    const colors = [[Orc, '#d33', '#722'], [Clericorc, '#e8e', '#747'], [Mageorc, '#e8e', '#747'], [Boss, '#f0f', '#808']];
    for (const e of game.entities) {
      if (e.killed) {
        continue;
      }
      for (const [Kind, hot, cold] of colors) {
        if (e instanceof Kind) {
          const c = e.center();
          const r = e instanceof Orc ? 1 : 2;
          ctx.fillStyle = e.aggro ? hot : cold;
          ctx.fillRect(Math.floor(c.x * scale) - r, Math.floor(c.y * scale) - r, r * 2, r * 2);
        }
      }
    }
    const pc = player.center();
    ctx.fillStyle = '#fff';
    ctx.fillRect(Math.floor(pc.x * scale) - 2, Math.floor(pc.y * scale) - 2, 4, 4);
  }
}
