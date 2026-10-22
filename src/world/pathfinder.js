// Binary min-heap of node indices keyed by a Float32Array of scores.
class NodeHeap {
  constructor(capacity) {
    this.items = new Int32Array(capacity);
    this.length = 0;
  }

  clear() {
    this.length = 0;
  }

  push(node, scores) {
    const items = this.items;
    let i = this.length++;
    const score = scores[node];
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (scores[items[parent]] <= score) {
        break;
      }
      items[i] = items[parent];
      i = parent;
    }
    items[i] = node;
  }

  pop(scores) {
    const items = this.items;
    const top = items[0];
    const last = items[--this.length];
    const n = this.length;
    let i = 0;
    const score = scores[last];
    for (;;) {
      let child = (i * 2) + 1;
      if (child >= n) {
        break;
      }
      if (child + 1 < n && scores[items[child + 1]] < scores[items[child]]) {
        child++;
      }
      if (scores[items[child]] >= score) {
        break;
      }
      items[i] = items[child];
      i = child;
    }
    if (n > 0) {
      items[i] = last;
    }
    return top;
  }
}

const SQRT2 = Math.SQRT2;
// 8-way neighbourhood; diagonals come last so they can reuse the orthogonal checks
const DIRS_X = [1, -1, 0, 0, 1, 1, -1, -1];
const DIRS_Y = [0, 0, 1, -1, 1, -1, 1, -1];
const DIRS_COST = [1, 1, 1, 1, SQRT2, SQRT2, SQRT2, SQRT2];

// Grid navigation over the collision map. Every tile stores its clearance:
// how many tiles of open space surround it, so an entity of a given size can
// be routed through tiles where its whole body fits. `sightData` marks what
// blocks sight (walls); without it, whatever blocks walking does.
export class Pathfinder {
  constructor(collisionData, tilesize, frameSource, sightData) {
    this.tilesize = tilesize || 24;
    this.frameSource = frameSource || (() => 0);
    this.height = collisionData.length;
    this.width = this.height > 0 ? collisionData[0].length : 0;
    const size = this.width * this.height;
    this.walkable = new Uint8Array(size);
    this.seeThrough = new Uint8Array(size);
    const sight = sightData || collisionData;
    for (let y = 0; y < this.height; y++) {
      for (let x = 0; x < this.width; x++) {
        this.walkable[(y * this.width) + x] = collisionData[y][x] === 0 ? 1 : 0;
        this.seeThrough[(y * this.width) + x] = sight[y][x] === 0 ? 1 : 0;
      }
    }
    this.computeClearance();
    this.gScore = new Float32Array(size);
    this.fScore = new Float32Array(size);
    this.parent = new Int32Array(size);
    this.seen = new Uint32Array(size);
    this.closed = new Uint32Array(size);
    this.searchId = 0;
    this.heap = new NodeHeap(size * 8);
    this.fields = {};
  }

  // Chebyshev distance transform: clearance 0 means only this tile is open,
  // 1 means the surrounding 3x3 block is open, and so on.
  computeClearance() {
    const w = this.width;
    const h = this.height;
    const d = new Int32Array(w * h);
    const big = w + h;
    let x;
    let y;
    let i;
    for (i = 0; i < d.length; i++) {
      d[i] = this.walkable[i] ? big : 0;
    }
    for (y = 0; y < h; y++) {
      for (x = 0; x < w; x++) {
        i = (y * w) + x;
        if (d[i] === 0) {
          continue;
        }
        let best = (x === 0 || y === 0) ? 1 : big;
        if (x > 0) { best = Math.min(best, d[i - 1] + 1); }
        if (y > 0) {
          best = Math.min(best, d[i - w] + 1);
          if (x > 0) { best = Math.min(best, d[i - w - 1] + 1); }
          if (x < w - 1) { best = Math.min(best, d[i - w + 1] + 1); }
        }
        d[i] = best;
      }
    }
    for (y = h - 1; y >= 0; y--) {
      for (x = w - 1; x >= 0; x--) {
        i = (y * w) + x;
        if (d[i] === 0) {
          continue;
        }
        let best2 = d[i];
        if (x === w - 1 || y === h - 1) { best2 = Math.min(best2, 1); }
        if (x < w - 1) { best2 = Math.min(best2, d[i + 1] + 1); }
        if (y < h - 1) {
          best2 = Math.min(best2, d[i + w] + 1);
          if (x < w - 1) { best2 = Math.min(best2, d[i + w + 1] + 1); }
          if (x > 0) { best2 = Math.min(best2, d[i + w - 1] + 1); }
        }
        d[i] = best2;
      }
    }
    this.clearance = new Uint8Array(w * h);
    for (i = 0; i < d.length; i++) {
      this.clearance[i] = d[i] > 0 ? Math.min(255, d[i] - 1) : 0;
    }
  }

  // Clearance an entity needs when its centre sits anywhere inside a tile.
  radiusForSize(sizeX, sizeY) {
    const half = Math.max(sizeX || 0, sizeY || 0) / 2;
    return Math.max(0, Math.ceil((half - (this.tilesize / 2)) / this.tilesize));
  }

  inBounds(x, y) {
    return x >= 0 && y >= 0 && x < this.width && y < this.height;
  }

  isPassable(x, y, radius) {
    if (!this.inBounds(x, y)) {
      return false;
    }
    const i = (y * this.width) + x;
    return this.walkable[i] === 1 && this.clearance[i] >= (radius || 0);
  }

  // A tile a segment may cross: walkable ground with room for `radius`, or
  // for `sight` anything but a wall (sight carries over water and chasms).
  passes(x, y, radius, sight) {
    if (!sight) {
      return this.isPassable(x, y, radius);
    }
    return this.inBounds(x, y) && this.seeThrough[(y * this.width) + x] === 1;
  }

  isAreaWalkable(worldX, worldY, w, h) {
    const ts = this.tilesize;
    const x0 = Math.floor(worldX / ts);
    const y0 = Math.floor(worldY / ts);
    const x1 = Math.floor((worldX + w - 1) / ts);
    const y1 = Math.floor((worldY + h - 1) / ts);
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        if (!this.isPassable(x, y, 0)) {
          return false;
        }
      }
    }
    return true;
  }

  worldToTile(worldX, worldY) {
    return { x: Math.floor(worldX / this.tilesize), y: Math.floor(worldY / this.tilesize) };
  }

  tileToWorldCenter(tileX, tileY) {
    return {
      x: (tileX * this.tilesize) + (this.tilesize / 2),
      y: (tileY * this.tilesize) + (this.tilesize / 2)
    };
  }

  // Closest tile (by ring distance) where an entity with this radius fits.
  findNearestPassable(tileX, tileY, radius, maxRadius) {
    if (this.isPassable(tileX, tileY, radius)) {
      return { x: tileX, y: tileY };
    }
    const limit = maxRadius || 8;
    for (let r = 1; r <= limit; r++) {
      let best = null;
      let bestDist = 999999;
      for (let y = tileY - r; y <= tileY + r; y++) {
        for (let x = tileX - r; x <= tileX + r; x++) {
          if (Math.max(Math.abs(x - tileX), Math.abs(y - tileY)) !== r) {
            continue;
          }
          if (!this.isPassable(x, y, radius)) {
            continue;
          }
          const dist = ((x - tileX) * (x - tileX)) + ((y - tileY) * (y - tileY));
          if (dist < bestDist) {
            bestDist = dist;
            best = { x, y };
          }
        }
      }
      if (best) {
        return best;
      }
    }
    return null;
  }

  // Moving diagonally must not clip the corner between two blocked tiles.
  canStep(x, y, dir, radius) {
    const nx = x + DIRS_X[dir];
    const ny = y + DIRS_Y[dir];
    if (!this.isPassable(nx, ny, radius)) {
      return false;
    }
    if (dir >= 4) {
      return this.isPassable(nx, y, radius) && this.isPassable(x, ny, radius);
    }
    return true;
  }

  heuristic(ax, ay, bx, by) {
    const dx = Math.abs(ax - bx);
    const dy = Math.abs(ay - by);
    return (dx + dy) + ((SQRT2 - 2) * Math.min(dx, dy));
  }

  // A* from tile to tile. When the goal is unreachable it returns the route to
  // the explored tile closest to it, so hunters still close the distance.
  findPath(start, goal, radius, maxIterations) {
    if (!start || !goal) {
      return [];
    }
    const w = this.width;
    const startIndex = (start.y * w) + start.x;
    const goalIndex = (goal.y * w) + goal.x;
    if (startIndex === goalIndex) {
      return [];
    }
    const id = ++this.searchId;
    const g = this.gScore;
    const f = this.fScore;
    const heap = this.heap;
    heap.clear();
    this.seen[startIndex] = id;
    g[startIndex] = 0;
    f[startIndex] = this.heuristic(start.x, start.y, goal.x, goal.y);
    this.parent[startIndex] = -1;
    heap.push(startIndex, f);
    let bestIndex = startIndex;
    let bestH = f[startIndex];
    const limit = maxIterations || 6000;
    let iterations = 0;
    while (heap.length > 0 && iterations < limit) {
      iterations++;
      const current = heap.pop(f);
      if (this.closed[current] === id) {
        continue;
      }
      this.closed[current] = id;
      if (current === goalIndex) {
        bestIndex = current;
        break;
      }
      const cx = current % w;
      const cy = (current - cx) / w;
      const h = f[current] - g[current];
      if (h < bestH) {
        bestH = h;
        bestIndex = current;
      }
      for (let dir = 0; dir < 8; dir++) {
        if (!this.canStep(cx, cy, dir, radius)) {
          continue;
        }
        const nx = cx + DIRS_X[dir];
        const ny = cy + DIRS_Y[dir];
        const next = (ny * w) + nx;
        if (this.closed[next] === id) {
          continue;
        }
        const tentative = g[current] + DIRS_COST[dir];
        if (this.seen[next] === id && tentative >= g[next]) {
          continue;
        }
        this.seen[next] = id;
        this.parent[next] = current;
        g[next] = tentative;
        f[next] = tentative + this.heuristic(nx, ny, goal.x, goal.y);
        heap.push(next, f);
      }
    }
    const path = [];
    let trace = bestIndex;
    while (trace !== -1 && trace !== startIndex) {
      path.push({ x: trace % w, y: Math.floor(trace / w) });
      trace = this.parent[trace];
    }
    path.reverse();
    return path;
  }

  // Exact grid traversal of a world-space segment (Amanatides & Woo). Movement
  // checks must use this: an entity's centre can sit anywhere in its tile, so
  // its real line can cross tiles the tile-centre line never touches.
  isSegmentClear(ax, ay, bx, by, radius, sight) {
    const ts = this.tilesize;
    let x = Math.floor(ax / ts);
    let y = Math.floor(ay / ts);
    const endX = Math.floor(bx / ts);
    const endY = Math.floor(by / ts);
    if (!this.passes(x, y, radius, sight)) {
      return false;
    }
    const dx = bx - ax;
    const dy = by - ay;
    const stepX = dx > 0 ? 1 : -1;
    const stepY = dy > 0 ? 1 : -1;
    const tDeltaX = dx !== 0 ? Math.abs(ts / dx) : Infinity;
    const tDeltaY = dy !== 0 ? Math.abs(ts / dy) : Infinity;
    let tMaxX = dx !== 0 ? (((stepX > 0 ? (x + 1) * ts : x * ts) - ax) / dx) : Infinity;
    let tMaxY = dy !== 0 ? (((stepY > 0 ? (y + 1) * ts : y * ts) - ay) / dy) : Infinity;
    // crossings within 1.5px of a tile corner count as touching both sides
    const cornerEps = 1.5 / Math.max(1e-6, Math.sqrt((dx * dx) + (dy * dy)));
    let guard = Math.abs(endX - x) + Math.abs(endY - y) + 2;
    while ((x !== endX || y !== endY) && guard-- > 0) {
      if (Math.abs(tMaxX - tMaxY) < cornerEps) {
        if (!this.passes(x + stepX, y, radius, sight) || !this.passes(x, y + stepY, radius, sight)) {
          return false;
        }
        x += stepX;
        y += stepY;
        tMaxX += tDeltaX;
        tMaxY += tDeltaY;
      } else if (tMaxX < tMaxY) {
        x += stepX;
        tMaxX += tDeltaX;
      } else {
        y += stepY;
        tMaxY += tDeltaY;
      }
      if (tMaxX > 1 && tMaxY > 1 && (x !== endX || y !== endY)) {
        break;
      }
      if (!this.passes(x, y, radius, sight)) {
        return false;
      }
    }
    return this.passes(endX, endY, radius, sight);
  }

  hasLineOfSight(ax, ay, bx, by) {
    return this.isSegmentClear(ax, ay, bx, by, 0, true);
  }

  // Dijkstra distance map from a target tile. Every entity chasing the same
  // target reads the same field, so a horde costs one search per refresh.
  getField(key, targetTile, radius, refreshFrames) {
    let field = this.fields[key];
    const frame = this.frameSource();
    if (
      field &&
      field.radius === radius &&
      (
        (field.targetX === targetTile.x && field.targetY === targetTile.y) ||
        (frame - field.builtAt) < (refreshFrames || 8)
      )
    ) {
      return field;
    }
    if (!field || field.radius !== radius) {
      field = { dist: new Float32Array(this.width * this.height), radius };
      this.fields[key] = field;
    }
    this.buildField(field, targetTile, radius);
    field.targetX = targetTile.x;
    field.targetY = targetTile.y;
    field.builtAt = frame;
    return field;
  }

  buildField(field, targetTile, radius) {
    const w = this.width;
    const dist = field.dist;
    dist.fill(Infinity);
    const goal = this.findNearestPassable(targetTile.x, targetTile.y, radius, 6);
    if (!goal) {
      return;
    }
    const id = ++this.searchId;
    const heap = this.heap;
    heap.clear();
    const goalIndex = (goal.y * w) + goal.x;
    dist[goalIndex] = 0;
    heap.push(goalIndex, dist);
    while (heap.length > 0) {
      const current = heap.pop(dist);
      if (this.closed[current] === id) {
        continue;
      }
      this.closed[current] = id;
      const cx = current % w;
      const cy = (current - cx) / w;
      for (let dir = 0; dir < 8; dir++) {
        if (!this.canStep(cx, cy, dir, radius)) {
          continue;
        }
        const next = ((cy + DIRS_Y[dir]) * w) + cx + DIRS_X[dir];
        const nd = dist[current] + DIRS_COST[dir];
        if (nd < dist[next]) {
          dist[next] = nd;
          heap.push(next, dist);
        }
      }
    }
  }

  // Follows the field downhill for a few tiles, then returns the furthest of
  // those tiles reachable in a straight line from the entity's real centre,
  // so movement stays smooth.
  nextStepFromField(field, worldX, worldY, radius, lookahead) {
    const w = this.width;
    const dist = field.dist;
    let current = this.worldToTile(worldX, worldY);
    const chain = [];
    const steps = lookahead || 8;
    for (let s = 0; s < steps; s++) {
      const here = dist[(current.y * w) + current.x];
      if (here === 0) {
        break;
      }
      let best = null;
      let bestDist = here;
      for (let dir = 0; dir < 8; dir++) {
        if (!this.canStep(current.x, current.y, dir, radius)) {
          continue;
        }
        const nx = current.x + DIRS_X[dir];
        const ny = current.y + DIRS_Y[dir];
        const nd = dist[(ny * w) + nx];
        if (nd < bestDist) {
          bestDist = nd;
          best = { x: nx, y: ny };
        }
      }
      if (!best) {
        break;
      }
      chain.push(best);
      current = best;
    }
    for (let c = chain.length - 1; c > 0; c--) {
      const target = this.tileToWorldCenter(chain[c].x, chain[c].y);
      if (this.isSegmentClear(worldX, worldY, target.x, target.y, radius)) {
        return chain[c];
      }
    }
    return chain.length > 0 ? chain[0] : null;
  }

  fieldDistance(field, tile) {
    if (!field || !this.inBounds(tile.x, tile.y)) {
      return Infinity;
    }
    return field.dist[(tile.y * this.width) + tile.x];
  }
}
