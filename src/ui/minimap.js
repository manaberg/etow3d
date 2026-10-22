import { DungeonThemes, FLOOR, LOW } from '../world/dungeon.js';
import { Orc } from '../entities/orc.js';
import { Clericorc, Mageorc, Boss } from '../entities/bosses.js';
import { Dragon } from '../entities/dragon.js';

// Visited rooms show in their theme colour, the rest stay as dim outlines;
// water, lava and chasms in their own colour, rivers from the start. The
// base image is redrawn only when a room is discovered; markers are painted
// on top every frame.
const LIQUID_COLORS = {
  water: '#2c5c6c', icewater: '#4a7a9a', blood: '#6a1414', mire: '#4a6a2a',
  tar: '#24202c', lava: '#c0501a', metal: '#d08a30', void: '#120c18'
};

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
    this.fitCell();
    const cell = this.cell;
    this.base.width = dungeon.cols * cell;
    this.base.height = dungeon.rows * cell;
    this.canvas.width = this.base.width;
    this.canvas.height = this.base.height;
    const ctx = this.base.getContext('2d');
    ctx.clearRect(0, 0, this.base.width, this.base.height);
    ctx.fillStyle = 'rgba(0, 0, 0, 0.55)';
    ctx.fillRect(0, 0, this.base.width, this.base.height);
    const liquid = world.look.liquid ? LIQUID_COLORS[world.look.liquid.kind] : null;
    for (let y = 0; y < dungeon.rows; y++) {
      for (let x = 0; x < dungeon.cols; x++) {
        const cell = dungeon.cells[y][x];
        if (cell !== FLOOR && !(cell === LOW && liquid)) {
          continue;
        }
        const owner = dungeon.owner[y][x];
        if (cell === LOW) {
          ctx.fillStyle = owner < 0 || world.rooms[owner].visited ? liquid : '#1c1c22';
        } else if (owner >= 0 && world.rooms[owner].visited) {
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
    this.render();
  }

  // pixels per dungeon cell: big battlefields get smaller cells
  fitCell() {
    const cols = this.game.world.dungeon.cols;
    this.cell = Math.max(1, Math.min(this.large ? 7 : 3, Math.floor((this.large ? 640 : 200) / cols)));
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
    const colors = [[Orc, '#d33', '#722'], [Clericorc, '#e8e', '#747'], [Mageorc, '#e8e', '#747'], [Boss, '#f0f', '#808'], [Dragon, '#fa0', '#850']];
    for (const e of game.entities) {
      if (e.killed) {
        continue;
      }
      for (const [Kind, hot, cold] of colors) {
        // battle dragons are drawn with their army
        if (e instanceof Kind && !e.side) {
          const c = e.center();
          const r = e instanceof Orc ? 1 : 2;
          ctx.fillStyle = e.aggro ? hot : cold;
          ctx.fillRect(Math.floor(c.x * scale) - r, Math.floor(c.y * scale) - r, r * 2, r * 2);
        }
      }
    }
    // battle armies: blue and red, dragons bigger and brighter
    for (const side of ['player', 'enemy']) {
      ctx.fillStyle = side === 'player' ? '#5a9aff' : '#ff4a4a';
      for (const e of game.entities) {
        if (e.side === side && !e.killed && !e.isDragon) {
          ctx.fillRect(Math.floor((e.pos.x + 24) * scale) - 1, Math.floor((e.pos.y + 24) * scale) - 1, 2, 2);
        }
      }
      ctx.fillStyle = side === 'player' ? '#a8d0ff' : '#ffb0a0';
      for (const e of game.entities) {
        if (e.side === side && !e.killed && e.isDragon) {
          const c = e.center();
          ctx.fillRect(Math.floor(c.x * scale) - 3, Math.floor(c.y * scale) - 3, 6, 6);
        }
      }
    }
    // duel loot: scrolls gold, potions red or blue (the rival stays hidden)
    for (const e of game.entities) {
      if (e.isLoot && !e.killed && game.duelLoot) {
        const c = e.center();
        ctx.fillStyle = e.isBlue === undefined ? '#ffd040' : (e.isBlue ? '#6aa8ff' : '#ff5a64');
        ctx.fillRect(Math.floor(c.x * scale) - 2, Math.floor(c.y * scale) - 2, 4, 4);
      }
    }
    const pc = player.center();
    ctx.fillStyle = '#fff';
    ctx.fillRect(Math.floor(pc.x * scale) - 2, Math.floor(pc.y * scale) - 2, 4, 4);
  }
}
