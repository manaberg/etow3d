import * as THREE from 'three';
import { DungeonThemes, CellTags, FLOOR, WALL, LOW } from '../world/dungeon.js';
import { glowTexture, surfaceTexture } from './textures.js';
import { Fixtures, Pillars, Props, Decals, bakeKind, bakeRibcage } from './props.js';

// One dungeon cell (48px) is two world units.
const CELL_UNITS = 2;
// walls beside low ground (and the banks of chasms) reach this far below
// the floor; the rest stop at it, which keeps the walls cheap to draw
const BELOW = 3.6;
// the floor, walls and props are cut into square chunks of this many cells,
// so whatever the camera cannot see is skipped whole
const CHUNK = 16;

function chunkOf(x, y) {
  return Math.floor(x / CHUNK) + ':' + Math.floor(y / CHUNK);
}

// Low ground by kind: the height of its surface, its colour and gloss, how
// its texture drifts, and whether it glows (and lights the room). A void has
// no surface: its banks drop away to a faint glow far below.
const Liquids = {
  water: { y: -0.28, color: 0x1e4c5c, opacity: 0.86, shine: 1, tex: 'ripple', flow: [0.012, 0.007] },
  icewater: { y: -0.28, color: 0x12344c, opacity: 0.9, shine: 1, tex: 'ripple', flow: [0.004, 0.003] },
  blood: { y: -0.42, color: 0x8c0e14, opacity: 0.96, shine: 1, tex: 'ripple', flow: [0.004, 0.002], emissive: 0x2c0406 },
  mire: { y: -0.3, color: 0x3e5c1e, opacity: 0.93, shine: 0.5, tex: 'ripple', flow: [0.006, 0.004], emissive: 0x0e1c04 },
  tar: { y: -0.3, color: 0x1c1628, opacity: 1, shine: 1.6, tex: 'ripple', flow: [0.003, 0.002], specular: 0x9070d0, emissive: 0x0c0818 },
  lava: { y: -0.36, glowing: true, tex: 'lava', flow: [0.01, 0.006], light: 0xff6020 },
  metal: { y: -0.32, glowing: true, tex: 'metal', flow: [0.035, 0.004], light: 0xff9030 },
  void: { y: -BELOW + 0.25, void: true }
};

// Bridges over low ground: deck texture and colours.
const Bridges = {
  wood: { tex: 'planks', deck: 0x8a6a46, rail: 0x4a3220 },
  stone: { tex: 'slate', deck: 0x8a867e, rail: 0x5c5850 },
  iron: { tex: 'plates', deck: 0x6a6a72, rail: 0x2e2e34 },
  ice: { tex: 'ice', deck: 0xc4dcec, rail: 0xe0f0fa }
};

const DIRS = [[0, -1], [1, 0], [0, 1], [-1, 0]];

// Walls between the camera and the player dissolve so the mage is never
// lost behind them (screen-door fade, keeps the bottom edge for orientation).
function addCutaway(material, cutaway) {
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uCutCenter = cutaway.center;
    shader.uniforms.uCutStrength = cutaway.strength;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vCutWorld;')
      .replace('#include <begin_vertex>', [
        '#include <begin_vertex>',
        'vec4 cutPos = vec4(transformed, 1.0);',
        '#ifdef USE_INSTANCING',
        'cutPos = instanceMatrix * cutPos;',
        '#endif',
        'vCutWorld = (modelMatrix * cutPos).xyz;'
      ].join('\n'));
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform vec3 uCutCenter;\nuniform float uCutStrength;\nvarying vec3 vCutWorld;')
      .replace('#include <clipping_planes_fragment>', [
        '#include <clipping_planes_fragment>',
        'vec2 cutD = vCutWorld.xz - uCutCenter.xz;',
        'if (uCutStrength > 0.5 && cutD.y > 0.6 && vCutWorld.y > 0.3) {',
        '  float cutR = length(vec2(cutD.x, (cutD.y - 0.6) * 0.55));',
        '  float cutFade = 1.0 - smoothstep(3.2, 5.6, cutR);',
        '  float cutN = fract(52.9829189 * fract(dot(floor(gl_FragCoord.xy), vec2(0.06711056, 0.00583715))));',
        '  if (cutFade * 0.92 > cutN) discard;',
        '}'
      ].join('\n'));
  };
  material.customProgramCacheKey = () => 'cutaway';
}

function hash(x, y) {
  let h = (x * 374761393) + (y * 668265263);
  h = (h ^ (h >>> 13)) * 1274126177;
  return Math.abs(h ^ (h >>> 16));
}

function hash01(x, y) {
  return (hash(x, y) % 1000) / 1000;
}

// Smooth noise over the cell grid, `scale` cells across.
function smooth(x, y, scale) {
  const fx = x / scale;
  const fy = y / scale;
  const ix = Math.floor(fx);
  const iy = Math.floor(fy);
  const tx = fx - ix;
  const ty = fy - iy;
  const a = hash01(ix, iy);
  const b = hash01(ix + 1, iy);
  const c = hash01(ix, iy + 1);
  const d = hash01(ix + 1, iy + 1);
  const top = a + (b - a) * tx;
  return top + (c + (d - c) * tx - top) * ty;
}

const haloVertex = `
  attribute float aSize;
  attribute float aPhase;
  attribute vec3 aColor;
  uniform float uScale;
  uniform float uTime;
  varying vec3 vColor;
  varying float vAlpha;
  void main() {
    vColor = aColor;
    vAlpha = 0.6 + 0.12 * sin(uTime * 9.0 + aPhase) + 0.08 * sin(uTime * 23.7 + aPhase * 2.0);
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_PointSize = aSize * uScale / -mv.z;
    gl_Position = projectionMatrix * mv;
  }
`;

const haloFragment = `
  uniform sampler2D uMap;
  varying vec3 vColor;
  varying float vAlpha;
  void main() {
    vec4 tex = texture2D(uMap, gl_PointCoord);
    gl_FragColor = vec4(vColor * tex.rgb, tex.a * vAlpha);
  }
`;

let haloMap = null;

// Builds a floor's meshes from its dungeon and look (world/looks.js).
// Returns the group, the light points the renderer hands its pool of lights
// to (`torches`), what the ambience needs (liquid cells, lightning rods),
// a per-frame update and a dispose.
export function buildDungeonMesh(world, cutaway) {
  const b = new LevelBuilder(world, cutaway);
  b.buildFloor();
  b.buildWalls();
  b.buildPillars();
  b.buildLiquids();
  b.buildRibs();
  b.buildDressing();
  b.buildFixtures();
  b.buildProps();
  b.finish();
  return {
    group: b.group,
    torches: b.lights,
    ambience: { liquids: b.liquidSpots, rods: b.rods, fixtures: b.lights },
    update: (time, dt, camera) => b.update(time, dt, camera),
    dispose: () => b.dispose()
  };
}

class LevelBuilder {
  constructor(world, cutaway) {
    this.world = world;
    this.look = world.look;
    this.cutaway = cutaway;
    const d = world.dungeon;
    this.cells = d.cells;
    this.owner = d.owner;
    this.tags = d.tags || d.cells.map((row) => row.map(() => 0));
    this.cols = d.cols;
    this.rows = d.rows;
    this.rooms = d.rooms;
    this.H = this.look.wallHeight;
    this.group = new THREE.Group();
    this.lights = [];
    this.halos = [];
    this.liquidSpots = [];
    this.rods = [];
    this.used = new Set();
    this.colors = new Map();
    this.batches = new Map();
    this.owned = [];
    this.animated = [];
    this.solidMat = this.material(new THREE.MeshLambertMaterial({ vertexColors: true }), true);
    this.glowMat = this.material(new THREE.MeshBasicMaterial({ vertexColors: true }), true);
  }

  // A material of this floor, cut away near the player if `cut`.
  material(mat, cut) {
    if (cut) {
      addCutaway(mat, this.cutaway);
    }
    this.owned.push(mat);
    return mat;
  }

  texture(name, repeatY) {
    const base = surfaceTexture(name);
    if (!repeatY || repeatY === 1) {
      return base;
    }
    const tex = base.clone();
    tex.repeat.set(1, repeatY);
    tex.needsUpdate = true;
    this.owned.push(tex);
    return tex;
  }

  isFloor(x, y) {
    return y >= 0 && y < this.rows && x >= 0 && x < this.cols && this.cells[y][x] === FLOOR;
  }

  isLow(x, y) {
    return y >= 0 && y < this.rows && x >= 0 && x < this.cols && this.cells[y][x] === LOW;
  }

  isBridge(x, y) {
    return this.isFloor(x, y) && this.tags[y][x] === CellTags.bridge;
  }

  // a plain wall (not a pillar, shelf or rib)
  isWall(x, y) {
    return y >= 0 && y < this.rows && x >= 0 && x < this.cols && this.cells[y][x] === WALL && !this.tags[y][x];
  }

  // a room's colour for `key` (floor, wall or light): the look's, tinted by
  // the room's theme; corridors take the look's corridor colours
  colorOf(room, key) {
    const look = this.look;
    const base = key === 'light' ? look.light.color : look[key].color;
    if (room < 0) {
      return key === 'light' ? base : look[key].corridor;
    }
    const theme = DungeonThemes[this.rooms[room].themeIndex];
    if (look.themeMix >= 1) {
      return theme[key];
    }
    const cacheKey = key + room;
    if (!this.colors.has(cacheKey)) {
      this.colors.set(cacheKey, new THREE.Color(base).lerp(new THREE.Color(theme[key]), look.themeMix).getHex());
    }
    return this.colors.get(cacheKey);
  }

  // ------------------------------------------------------------ floor

  // A merged mesh per chunk, tinted per room through vertex colours.
  // Bridges have their own decks.
  buildFloor() {
    const { look, cols, rows, owner } = this;
    const chunks = new Map();
    const color = new THREE.Color();
    const uvSets = [[0, 0, 1, 0, 1, 1, 0, 1], [1, 0, 1, 1, 0, 1, 0, 0], [1, 1, 0, 1, 0, 0, 1, 0], [0, 1, 0, 0, 1, 0, 1, 1]];
    const mottle = look.floor.mottle || 0;
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        if (!this.isFloor(x, y) || this.isBridge(x, y)) {
          continue;
        }
        const key = chunkOf(x, y);
        let chunk = chunks.get(key);
        if (!chunk) {
          chunk = { positions: [], uvs: [], colors: [], indices: [], v: 0 };
          chunks.set(key, chunk);
        }
        const { positions, uvs, colors, indices, v } = chunk;
        color.setHex(this.colorOf(owner[y][x], 'floor'));
        const shade = 0.82 + (hash(x, y) % 100) / 400;
        // soft darkening next to walls (and banks) fakes ambient occlusion
        const nearWall = !this.isFloor(x - 1, y) || !this.isFloor(x + 1, y) || !this.isFloor(x, y - 1) || !this.isFloor(x, y + 1);
        color.multiplyScalar(shade * (nearWall ? 0.8 : 1) * (1 - mottle * smooth(x, y, 3)));
        const x0 = x * CELL_UNITS;
        const z0 = y * CELL_UNITS;
        positions.push(x0, 0, z0, x0 + CELL_UNITS, 0, z0, x0 + CELL_UNITS, 0, z0 + CELL_UNITS, x0, 0, z0 + CELL_UNITS);
        uvs.push(...uvSets[hash(y, x) % 4]);
        for (let k = 0; k < 4; k++) {
          colors.push(color.r, color.g, color.b);
        }
        indices.push(v, v + 2, v + 1, v, v + 3, v + 2);
        chunk.v += 4;
      }
    }
    const opts = { map: this.texture(look.floor.tex), vertexColors: true };
    if (look.floor.glow) {
      opts.emissive = new THREE.Color(look.floor.glow.color);
      opts.emissiveMap = surfaceTexture('glow:' + look.floor.glow.map);
      opts.emissiveIntensity = look.floor.glow.strength || 1;
    }
    let mat;
    if (look.floor.shine) {
      // a wet or polished sheen, kept faint: the staff's light is close
      const s = look.floor.shine;
      mat = new THREE.MeshPhongMaterial({ ...opts, specular: new THREE.Color(0.045 * s, 0.045 * s, 0.05 * s), shininess: 60 + s * 30 });
    } else {
      mat = new THREE.MeshLambertMaterial(opts);
    }
    this.material(mat, false);
    for (const chunk of chunks.values()) {
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(chunk.positions, 3));
      geo.setAttribute('uv', new THREE.Float32BufferAttribute(chunk.uvs, 2));
      geo.setAttribute('color', new THREE.Float32BufferAttribute(chunk.colors, 3));
      geo.setIndex(chunk.indices);
      geo.computeVertexNormals();
      const floor = new THREE.Mesh(geo, mat);
      floor.userData.ownGeometry = true;
      this.group.add(floor);
    }
  }

  // ------------------------------------------------------------ walls

  // Only wall cells next to open ground are built. Rough (cave) walls vary
  // in height and lean a little. Walls beside water, lava or chasms go on
  // down past the floor, so their sides are not left open.
  buildWalls() {
    const { look, cols, rows, owner, H } = this;
    const rough = look.wall.rough || 0;
    const mottle = look.wall.mottle || 0;
    const roomCells = [];
    const corridorCells = [];
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        if (!this.isWall(x, y)) {
          continue;
        }
        let touching = false;
        let neighbourRoom = -1;
        for (let oy = -1; oy <= 1; oy++) {
          for (let ox = -1; ox <= 1; ox++) {
            if (this.isFloor(x + ox, y + oy) || this.isLow(x + ox, y + oy)) {
              touching = true;
              const r = owner[y + oy][x + ox];
              if (r >= 0) {
                neighbourRoom = r;
              }
            }
          }
        }
        if (touching) {
          let deep = false;
          for (let oy = -1; oy <= 1 && !deep; oy++) {
            for (let ox = -1; ox <= 1 && !deep; ox++) {
              deep = this.isLow(x + ox, y + oy) || this.isBridge(x + ox, y + oy);
            }
          }
          (neighbourRoom < 0 && look.wall.corridorTex ? corridorCells : roomCells).push({ x, y, room: neighbourRoom, deep });
        }
      }
    }
    const geo = new THREE.BoxGeometry(CELL_UNITS, 1, CELL_UNITS);
    geo.translate(0, 0.5, 0);
    this.owned.push(geo);
    const capMat = this.material(new THREE.MeshLambertMaterial({ color: look.wall.cap }), true);
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const p = new THREE.Vector3();
    const s = new THREE.Vector3();
    const color = new THREE.Color();
    const up = new THREE.Vector3(0, 1, 0);
    const build = (list, texName, below) => {
      if (list.length === 0) {
        return;
      }
      const opts = { map: this.texture(texName, (H + below) / 2) };
      if (look.wall.glow && look.wall.glow.map !== 'base') {
        opts.emissive = new THREE.Color(look.wall.glow.color);
        opts.emissiveMap = this.texture('glow:' + look.wall.glow.map, (H + below) / 2);
        opts.emissiveIntensity = look.wall.glow.strength || 1;
      }
      const wallMat = this.material(new THREE.MeshLambertMaterial(opts), true);
      const chunks = new Map();
      for (const cell of list) {
        const key = chunkOf(cell.x, cell.y);
        if (!chunks.has(key)) {
          chunks.set(key, []);
        }
        chunks.get(key).push(cell);
      }
      for (const cells of chunks.values()) {
        const walls = new THREE.InstancedMesh(geo, [wallMat, wallMat, capMat, capMat, wallMat, wallMat], cells.length);
        cells.forEach((cell, i) => {
          const h1 = hash01(cell.x, cell.y);
          const h2 = hash01(cell.y + 7, cell.x + 3);
          const height = H * (1 + rough * (h1 - 0.35) * 0.7);
          const grow = 1 + rough * 0.12 * h2;
          q.setFromAxisAngle(up, rough ? (h2 - 0.5) * 0.5 * rough : 0);
          m.compose(p.set(cell.x * CELL_UNITS + 1, -below, cell.y * CELL_UNITS + 1), q, s.set(grow, height + below, grow));
          walls.setMatrixAt(i, m);
          color.setHex(cell.room < 0 ? look.wall.corridor : this.colorOf(cell.room, 'wall'));
          color.multiplyScalar((0.85 + (hash(cell.x, cell.y) % 100) / 500) * (1 - mottle * smooth(cell.x, cell.y, 2.5)));
          walls.setColorAt(i, color);
        });
        walls.computeBoundingSphere();
        this.group.add(walls);
        this.owned.push(walls);
      }
    };
    for (const [list, tex] of [[roomCells, look.wall.tex], [corridorCells, look.wall.corridorTex]]) {
      build(list.filter((cell) => !cell.deep), tex, 0);
      build(list.filter((cell) => cell.deep), tex, BELOW);
    }
    if (look.wall.glow && look.wall.glow.map === 'base') {
      this.buildWallGlow(roomCells.concat(corridorCells), look.wall.glow.color);
    }
  }

  // A glow along the foot of the walls, as if the rock were hot.
  buildWallGlow(list, glowColor) {
    const positions = [];
    const uvs = [];
    const h = 1.1;
    for (const cell of list) {
      const x0 = cell.x * CELL_UNITS;
      const z0 = cell.y * CELL_UNITS;
      for (const [dx, dy] of DIRS) {
        if (!this.isFloor(cell.x + dx, cell.y + dy)) {
          continue;
        }
        // the face of the wall cell toward the open cell, pushed out a hair
        let ax;
        let az;
        let bx;
        let bz;
        if (dy === -1) {
          [ax, az, bx, bz] = [x0 + 2, z0 - 0.02, x0, z0 - 0.02];
        } else if (dy === 1) {
          [ax, az, bx, bz] = [x0, z0 + 2.02, x0 + 2, z0 + 2.02];
        } else if (dx === -1) {
          [ax, az, bx, bz] = [x0 - 0.02, z0, x0 - 0.02, z0 + 2];
        } else {
          [ax, az, bx, bz] = [x0 + 2.02, z0 + 2, x0 + 2.02, z0];
        }
        positions.push(ax, 0, az, bx, 0, bz, bx, h, bz, ax, 0, az, bx, h, bz, ax, h, az);
        uvs.push(0, 0, 1, 0, 1, 1, 0, 0, 1, 1, 0, 1);
      }
    }
    if (positions.length === 0) {
      return;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    const mat = this.material(new THREE.MeshBasicMaterial({
      map: surfaceTexture('wallglow'), color: glowColor, transparent: true, depthWrite: false,
      blending: THREE.AdditiveBlending, side: THREE.DoubleSide, opacity: 0.55
    }), false);
    const mesh = new THREE.Mesh(geo, mat);
    mesh.userData.ownGeometry = true;
    mesh.renderOrder = 2;
    this.group.add(mesh);
    this.animated.push((time) => {
      mat.opacity = 0.45 + Math.sin(time * 1.3) * 0.08 + Math.sin(time * 3.7) * 0.05;
    });
  }

  // ------------------------------------------------------------ instances

  // One copy of a prop, pillar or fixture: where it stands, its turn and
  // size, and whose room it lights.
  add(table, kind, opts, x, z, rot, room, scale = 1) {
    const def = table[kind];
    const variant = def.vary ? Math.floor(Math.random() * 2) : 0;
    const baked = bakeKind(table, kind, opts, variant);
    // one batch per kind and chunk
    let byChunk = this.batches.get(baked);
    if (!byChunk) {
      byChunk = new Map();
      this.batches.set(baked, byChunk);
    }
    const chunk = chunkOf(Math.floor(x / CELL_UNITS), Math.floor(z / CELL_UNITS));
    let batch = byChunk.get(chunk);
    if (!batch) {
      batch = { baked, matrices: [], tints: [] };
      byChunk.set(chunk, batch);
    }
    const m = new THREE.Matrix4().compose(
      new THREE.Vector3(x, 0, z),
      new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), rot),
      new THREE.Vector3(scale, scale, scale)
    );
    batch.matrices.push(m);
    batch.tints.push(0.85 + Math.random() * 0.25);
    const sin = Math.sin(rot);
    const cos = Math.cos(rot);
    for (const h of baked.halos) {
      this.halos.push({
        x: x + (h.x * cos + h.z * sin) * scale, y: h.y * scale, z: z + (-h.x * sin + h.z * cos) * scale,
        size: h.size * scale, color: h.color
      });
    }
    if (baked.light) {
      const f = (baked.light.f || 0) * scale;
      this.lights.push({
        x: x + sin * f, y: baked.light.y * scale, z: z + cos * f,
        color: baked.light.color || opts.color || this.look.light.color,
        phase: Math.random() * 10, room, power: baked.light.power || 1
      });
    }
  }

  // ------------------------------------------------------------ pillars

  buildPillars() {
    const { look, cols, rows, H } = this;
    const styles = typeof look.pillar === 'string' ? { [look.pillar]: 1 } : look.pillar;
    const pickStyle = () => {
      let roll = Math.random() * Object.values(styles).reduce((a, b) => a + b, 0);
      for (const name in styles) {
        roll -= styles[name];
        if (roll < 0) {
          return name;
        }
      }
      return Object.keys(styles)[0];
    };
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        const tag = this.tags[y][x];
        if (this.cells[y][x] !== WALL || !tag) {
          continue;
        }
        const cx = x * CELL_UNITS + 1;
        const cz = y * CELL_UNITS + 1;
        // the room the pillar stands in, from a neighbouring floor cell
        let room = -1;
        for (const [dx, dy] of DIRS) {
          if (this.isFloor(x + dx, y + dy) && this.owner[y + dy][x + dx] >= 0) {
            room = this.owner[y + dy][x + dx];
          }
        }
        if (tag === CellTags.shelf) {
          this.add(Pillars, 'shelf', {}, cx, cz, 0, room);
        } else if (tag === CellTags.rib) {
          continue;
        } else {
          const style = pickStyle();
          // furnaces face the camera; columns and rocks turn any way
          const rot = style === 'furnace' ? 0 : Math.floor(Math.random() * 4) * Math.PI / 2 + (Pillars[style].vary ? Math.random() : 0);
          this.add(Pillars, style, { h: H, color: look.wall.color }, cx, cz, rot, room);
          if (style === 'rod') {
            this.rods.push({ x: cx, y: H + 0.7, z: cz });
          }
        }
      }
    }
  }

  // The bones of giant skeletons over the aisles of their rooms.
  buildRibs() {
    for (const room of this.rooms) {
      const cage = room.ribcage;
      if (!cage) {
        continue;
      }
      const ribs = [];
      for (let x = cage.x0; x <= cage.x1; x++) {
        if (this.tags[cage.y0][x] === CellTags.rib && this.tags[cage.y1][x] === CellTags.rib) {
          ribs.push(x);
        }
      }
      if (ribs.length === 0) {
        continue;
      }
      const geo = bakeRibcage({ ...cage, ribs }, CELL_UNITS);
      this.owned.push(geo);
      const mesh = new THREE.Mesh(geo, this.solidMat);
      this.group.add(mesh);
      // and the skull, at the end of the spine
      const sx = (ribs[0] - 1.6) * CELL_UNITS;
      const sz = ((cage.y0 + cage.y1) / 2) * CELL_UNITS + 1;
      this.add(Props, 'giantskull', {}, sx, sz, -Math.PI / 2, -1, 1.25);
    }
  }

  // ------------------------------------------------------------ liquids

  buildLiquids() {
    const { look, cols, rows } = this;
    const lows = [];
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        if (this.isLow(x, y) || this.isBridge(x, y)) {
          lows.push([x, y]);
        }
      }
    }
    if (lows.length === 0) {
      return;
    }
    const spec = (look.liquid && Liquids[look.liquid.kind]) || Liquids.water;
    const surfaceY = spec.y;
    // the surface, or the glow at the bottom of a chasm
    const positions = [];
    const uvs = [];
    for (const [x, y] of lows) {
      const x0 = x * CELL_UNITS;
      const z0 = y * CELL_UNITS;
      positions.push(x0, surfaceY, z0, x0 + 2, surfaceY, z0 + 2, x0 + 2, surfaceY, z0,
        x0, surfaceY, z0, x0, surfaceY, z0 + 2, x0 + 2, surfaceY, z0 + 2);
      const u = x * 0.5;
      const w = y * 0.5;
      uvs.push(u, w, u + 1, w + 1, u + 1, w, u, w, u, w + 1, u + 1, w + 1);
      if (this.isLow(x, y)) {
        this.liquidSpots.push([x0 + 1, z0 + 1]);
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    geo.computeVertexNormals();
    let mat;
    const tex = spec.tex ? surfaceTexture(spec.tex).clone() : null;
    if (tex) {
      tex.needsUpdate = true;
      this.owned.push(tex);
    }
    if (spec.void) {
      mat = new THREE.MeshBasicMaterial({ color: (look.liquid && look.liquid.glow) || 0x201030, map: surfaceTexture('ripple') });
    } else if (spec.glowing) {
      mat = new THREE.MeshBasicMaterial({ map: tex, color: 0xffffff });
    } else {
      mat = new THREE.MeshPhongMaterial({
        color: spec.color, map: tex, transparent: spec.opacity < 1, opacity: spec.opacity,
        specular: new THREE.Color(spec.specular || 0x9ab0c0).multiplyScalar(spec.shine), shininess: 70,
        emissive: spec.emissive || 0x000000, depthWrite: spec.opacity >= 1
      });
    }
    const surface = new THREE.Mesh(geo, this.material(mat, false));
    surface.userData.ownGeometry = true;
    surface.renderOrder = spec.opacity < 1 ? 1 : 0;
    this.group.add(surface);
    if (tex && spec.flow) {
      this.animated.push((time) => {
        tex.offset.set(time * spec.flow[0], time * spec.flow[1]);
        if (spec.glowing) {
          const pulse = 0.9 + Math.sin(time * 1.7) * 0.07 + Math.sin(time * 4.3) * 0.04;
          mat.color.setRGB(pulse, pulse, pulse);
        }
      });
    }
    // glowing liquids light their surroundings now and then
    if (spec.light) {
      for (const [x, y] of lows) {
        if (x % 4 === 0 && y % 4 === 0) {
          this.lights.push({ x: x * CELL_UNITS + 1, y: 0.8, z: y * CELL_UNITS + 1, color: spec.light, phase: Math.random() * 10, room: -1, power: 0.75 });
        }
      }
    }
    this.buildBanks(lows, spec);
    this.buildBridges();
  }

  // The sides of pools and chasms, from the floor down to the surface (or
  // into the dark), in the colour of the ground around them.
  buildBanks(lows, spec) {
    const bottom = spec.void ? -BELOW : spec.y - 0.12;
    const positions = [];
    const uvs = [];
    const colors = [];
    const color = new THREE.Color();
    const dark = new THREE.Color();
    for (const [x, y] of lows) {
      const x0 = x * CELL_UNITS;
      const z0 = y * CELL_UNITS;
      for (const [dx, dy] of DIRS) {
        const nx = x + dx;
        const ny = y + dy;
        if (!this.isFloor(nx, ny) || this.isBridge(nx, ny)) {
          continue;
        }
        // the edge shared with the floor cell, faced into the pool
        let ax;
        let az;
        let bx;
        let bz;
        if (dy === -1) {
          [ax, az, bx, bz] = [x0, z0, x0 + 2, z0];
        } else if (dy === 1) {
          [ax, az, bx, bz] = [x0 + 2, z0 + 2, x0, z0 + 2];
        } else if (dx === -1) {
          [ax, az, bx, bz] = [x0, z0 + 2, x0, z0];
        } else {
          [ax, az, bx, bz] = [x0 + 2, z0, x0 + 2, z0 + 2];
        }
        positions.push(ax, 0, az, bx, bottom, bz, bx, 0, bz, ax, 0, az, ax, bottom, az, bx, bottom, bz);
        const depth = -bottom / 2;
        uvs.push(0, 1, 1, 1 - depth, 1, 1, 0, 1, 0, 1 - depth, 1, 1 - depth);
        color.setHex(this.colorOf(this.owner[ny][nx], 'floor')).multiplyScalar(0.62);
        dark.copy(color).multiplyScalar(spec.void ? 0.15 : 0.5);
        colors.push(color.r, color.g, color.b, dark.r, dark.g, dark.b, color.r, color.g, color.b,
          color.r, color.g, color.b, dark.r, dark.g, dark.b, dark.r, dark.g, dark.b);
      }
    }
    if (positions.length === 0) {
      return;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    geo.computeVertexNormals();
    const mat = this.material(new THREE.MeshLambertMaterial({ map: surfaceTexture('rock'), vertexColors: true }), false);
    const banks = new THREE.Mesh(geo, mat);
    banks.userData.ownGeometry = true;
    this.group.add(banks);
  }

  // Decks over low ground where the floor crosses it, with posts and rails
  // along the sides that look down on it.
  buildBridges() {
    const style = Bridges[(this.look.liquid && this.look.liquid.bridge) || 'wood'];
    const positions = [];
    const parts = [];
    for (let y = 0; y < this.rows; y++) {
      for (let x = 0; x < this.cols; x++) {
        if (!this.isBridge(x, y)) {
          continue;
        }
        positions.push([x, y]);
        for (const [dx, dy] of DIRS) {
          if (!this.isLow(x + dx, y + dy)) {
            continue;
          }
          const cx = x * CELL_UNITS + 1 + dx * 0.9;
          const cz = y * CELL_UNITS + 1 + dy * 0.9;
          parts.push({ x: cx, z: cz, along: dx === 0 });
        }
      }
    }
    if (positions.length === 0) {
      return;
    }
    const deck = new THREE.BoxGeometry(CELL_UNITS, 0.22, CELL_UNITS);
    const decks = new THREE.InstancedMesh(deck, this.material(new THREE.MeshLambertMaterial({ map: surfaceTexture(style.tex), color: style.deck }), false), positions.length);
    const m = new THREE.Matrix4();
    positions.forEach(([x, y], i) => {
      decks.setMatrixAt(i, m.makeTranslation(x * CELL_UNITS + 1, -0.1, y * CELL_UNITS + 1));
    });
    this.owned.push(deck, decks);
    this.group.add(decks);
    if (parts.length > 0) {
      const railGeo = new THREE.BoxGeometry(2, 0.09, 0.09);
      const postGeo = new THREE.BoxGeometry(0.14, 0.75, 0.14);
      const railMat = this.material(new THREE.MeshLambertMaterial({ color: style.rail }), true);
      const rails = new THREE.InstancedMesh(railGeo, railMat, parts.length);
      const posts = new THREE.InstancedMesh(postGeo, railMat, parts.length);
      parts.forEach((p, i) => {
        m.makeRotationY(p.along ? 0 : Math.PI / 2);
        m.setPosition(p.x, 0.62, p.z);
        rails.setMatrixAt(i, m);
        m.makeTranslation(p.x, 0.3, p.z);
        posts.setMatrixAt(i, m);
      });
      this.owned.push(railGeo, postGeo, rails, posts);
      this.group.add(rails, posts);
    }
  }

  // ------------------------------------------------------------ placing things

  // Cells for props or fixtures, by `place`:
  //   north     against the north walls of rooms (facing the camera)
  //   wall      against any wall of a room
  //   corner    in the inner corners of rooms
  //   floor     out in the open floor of rooms
  //   corridor  along corridor walls (or, for flat things, down the middle)
  //   shore     on the floor beside water, lava or chasms
  //   center    the middle of each room
  // and by `every` (cells apart), `chance` (per cell) or `per` (one per so
  // many cells of a room). Cells already taken are skipped.
  spots(spec, flat) {
    const { cols, rows, owner } = this;
    const themes = spec.themes;
    const cand = [];
    if (spec.place === 'center') {
      this.rooms.forEach((room, r) => {
        if (themes && !themes.includes(room.theme)) {
          return;
        }
        const x = room.x + Math.floor(room.w / 2);
        const y = room.y + Math.floor(room.h / 2);
        if (this.isFloor(x, y) && !this.isBridge(x, y)) {
          cand.push({ x, y, dir: null, room: r, center: true });
        }
      });
      return cand.map((c) => this.toWorld(c, flat));
    }
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        if (!this.isFloor(x, y) || this.isBridge(x, y)) {
          continue;
        }
        const r = owner[y][x];
        const inCorridor = r < 0;
        if (spec.place === 'corridor' ? !inCorridor : (inCorridor && spec.place !== 'shore' && !spec.corridors)) {
          continue;
        }
        if (themes && (inCorridor || !themes.includes(this.rooms[r].theme))) {
          continue;
        }
        const walls = DIRS.filter(([dx, dy]) => this.isWall(x + dx, y + dy));
        let dir;
        if (spec.place === 'north') {
          if (!this.isWall(x, y - 1)) {
            continue;
          }
          dir = [0, -1];
        } else if (spec.place === 'wall' || (spec.place === 'corridor' && !flat)) {
          if (walls.length === 0) {
            continue;
          }
          dir = walls[Math.floor(Math.random() * walls.length)];
        } else if (spec.place === 'corridor') {
          if (walls.length > 0) {
            continue;
          }
          dir = null;
        } else if (spec.place === 'corner') {
          const v = walls.find(([dx]) => dx === 0);
          const h = walls.find(([, dy]) => dy === 0);
          if (!v || !h) {
            continue;
          }
          dir = [h[0], v[1]];
        } else if (spec.place === 'floor') {
          let open = true;
          for (let oy = -1; oy <= 1 && open; oy++) {
            for (let ox = -1; ox <= 1 && open; ox++) {
              open = this.isFloor(x + ox, y + oy);
            }
          }
          if (!open) {
            continue;
          }
          dir = null;
        } else if (spec.place === 'shore') {
          const wet = DIRS.filter(([dx, dy]) => this.isLow(x + dx, y + dy));
          if (wet.length === 0) {
            continue;
          }
          dir = wet[Math.floor(Math.random() * wet.length)];
        } else {
          continue;
        }
        cand.push({ x, y, dir, room: r });
      }
    }
    // cells chosen for this spec, kept `gap` apart from each other
    const picked = new Set();
    const taken = (c, gap) => {
      for (let oy = -gap + 1; oy < gap; oy++) {
        for (let ox = -gap + 1; ox < gap; ox++) {
          if (picked.has((c.y + oy) * cols + c.x + ox)) {
            return true;
          }
        }
      }
      return false;
    };
    const chosen = [];
    const take = (c) => {
      chosen.push(c);
      picked.add(c.y * cols + c.x);
      if (!flat) {
        this.used.add(c.y * cols + c.x);
      }
    };
    const free = (c) => flat || !this.used.has(c.y * cols + c.x);
    if (spec.every) {
      for (const c of cand) {
        if (free(c) && !taken(c, spec.every)) {
          take(c);
        }
      }
    } else if (spec.per) {
      const byRoom = new Map();
      for (const c of cand) {
        if (!byRoom.has(c.room)) {
          byRoom.set(c.room, []);
        }
        byRoom.get(c.room).push(c);
      }
      for (const [r, list] of byRoom) {
        const area = r >= 0 ? this.roomArea(r) : list.length;
        let count = Math.round(area / spec.per + Math.random() - 0.5);
        for (let tries = 0; count > 0 && tries < list.length * 2; tries++) {
          const c = list[Math.floor(Math.random() * list.length)];
          if (free(c) && !taken(c, 2)) {
            take(c);
            count--;
          }
        }
      }
    } else {
      const chance = spec.chance === undefined ? 1 : spec.chance;
      for (const c of cand) {
        if (Math.random() < chance && free(c) && !taken(c, flat ? 1 : 2)) {
          take(c);
        }
      }
    }
    return chosen.map((c) => this.toWorld(c, flat));
  }

  roomArea(r) {
    if (!this.areas) {
      this.areas = new Map();
      for (let y = 0; y < this.rows; y++) {
        for (let x = 0; x < this.cols; x++) {
          const o = this.owner[y][x];
          if (o >= 0 && this.isFloor(x, y)) {
            this.areas.set(o, (this.areas.get(o) || 0) + 1);
          }
        }
      }
    }
    return this.areas.get(r) || 0;
  }

  // The middle of a cell (somewhere near it, for things standing free),
  // turned to face away from the wall it backs onto, or any way.
  toWorld(c, flat) {
    const cx = c.x * CELL_UNITS + 1;
    const cz = c.y * CELL_UNITS + 1;
    if (!c.dir) {
      const j = c.center || flat ? 0 : 0.35;
      return { x: cx + (Math.random() - 0.5) * j, z: cz + (Math.random() - 0.5) * j, rot: Math.random() * Math.PI * 2, room: c.room, dir: null };
    }
    const [dx, dy] = c.dir;
    return { x: cx, z: cz, rot: Math.atan2(-dx, -dy), room: c.room, dir: c.dir };
  }

  // Puts a thing at a spot: wall-mounted things go on the wall face, floor
  // things stand against the wall (or beside the water) they back onto.
  at(spot, mount, shore) {
    if (!spot.dir) {
      return spot;
    }
    const [dx, dy] = spot.dir;
    const reach = mount === 'wall' ? 1.0 : (shore ? 0.3 : 0.4);
    return { ...spot, x: spot.x + dx * reach, z: spot.z + dy * reach, rot: shore ? Math.random() * Math.PI * 2 : spot.rot };
  }

  // ------------------------------------------------------------ fixtures

  // The floor's lights: fixtures in their places, and a hidden light in the
  // middle of any room left without one.
  buildFixtures() {
    const L = this.look.light;
    const def = Fixtures[L.prop];
    if (def) {
      for (const spot of this.spots(L, false)) {
        const color = this.colorOf(spot.room, 'light');
        const s = this.at(spot, def.mount);
        this.add(Fixtures, L.prop, { color }, s.x, s.z, s.rot, spot.room);
      }
    }
    this.rooms.forEach((room, r) => {
      if (!this.lights.some((t) => t.room === r)) {
        this.lights.push({
          x: (room.x + room.w / 2) * CELL_UNITS, y: 3.4, z: (room.y + room.h / 2) * CELL_UNITS,
          color: this.colorOf(r, 'light'), phase: Math.random() * 10, room: r, power: 1
        });
      }
    });
  }

  // ------------------------------------------------------------ props

  buildProps() {
    const specs = this.look.props || [];
    // rough rock walls shed boulders along their feet
    if ((this.look.wall.rough || 0) >= 0.2) {
      specs.unshift({ kind: 'wallrocks', place: 'wall', chance: 0.3, corridors: true });
    }
    for (const spec of specs) {
      if (Decals[spec.kind]) {
        this.buildDecals(spec);
        continue;
      }
      const def = Props[spec.kind];
      if (!def) {
        continue;
      }
      const opts = { h: this.H, color: spec.kind === 'wallrocks' ? this.look.wall.color : spec.color, sigil: spec.sigil, crown: spec.crown };
      for (const spot of this.spots(spec, false)) {
        const s = this.at(spot, def.mount, spec.place === 'shore');
        const scale = def.mount === 'wall' ? 1 : 0.9 + Math.random() * 0.25;
        this.add(Props, spec.kind, opts, s.x, s.z, s.rot, spot.room, scale);
      }
    }
  }

  buildDecals(spec) {
    const d = Decals[spec.kind];
    const spots = this.spots(spec, true);
    if (spots.length === 0) {
      return;
    }
    const tex = surfaceTexture(d.tex);
    let mat;
    if (d.glow) {
      mat = new THREE.MeshBasicMaterial({ map: tex, color: this.look.light.color, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.7 });
    } else if (d.shiny) {
      mat = new THREE.MeshPhongMaterial({ map: tex, color: 0x101820, specular: 0x8aa4c0, shininess: 90, transparent: true, depthWrite: false, opacity: 0.85 });
    } else {
      mat = new THREE.MeshLambertMaterial({ map: tex, transparent: true, depthWrite: false });
    }
    mat.polygonOffset = true;
    mat.polygonOffsetFactor = -2;
    mat.polygonOffsetUnits = -2;
    this.material(mat, false);
    const geo = new THREE.PlaneGeometry(d.size[0], d.size[1]);
    geo.rotateX(-Math.PI / 2);
    this.owned.push(geo);
    const mesh = new THREE.InstancedMesh(geo, mat, spots.length);
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const up = new THREE.Vector3(0, 1, 0);
    spots.forEach((s, i) => {
      const scale = d.exact ? 1 : 0.8 + Math.random() * 0.4;
      q.setFromAxisAngle(up, d.exact || s.dir ? 0 : s.rot);
      m.compose(new THREE.Vector3(s.x, 0.02 + (i % 7) * 0.002, s.z), q, new THREE.Vector3(scale, 1, scale));
      mesh.setMatrixAt(i, m);
    });
    mesh.renderOrder = 1;
    this.owned.push(mesh);
    this.group.add(mesh);
  }

  // ------------------------------------------------------------ classic dressing

  // The classic theme props (throne and carpet, shelves, cauldron, coffins,
  // crates) for the looks that keep them.
  buildDressing() {
    const dressing = this.look.dressing;
    if (!dressing) {
      return;
    }
    this.rooms.forEach((room, r) => {
      if (dressing === true || dressing.includes(room.theme)) {
        this.dressRoom(room, r);
      }
    });
  }

  dressRoom(room, roomIndex) {
    const group = this.group;
    const { cells } = this;
    const x0 = room.x * CELL_UNITS;
    const z0 = room.y * CELL_UNITS;
    const w = room.w * CELL_UNITS;
    const h = room.h * CELL_UNITS;
    const own = (mesh) => {
      mesh.userData.ownGeometry = true;
      return mesh;
    };
    if (room.theme === 'throne') {
      const carpet = own(new THREE.Mesh(new THREE.PlaneGeometry(2.6, h - 1.2), new THREE.MeshLambertMaterial({ color: 0x7a1420 })));
      carpet.rotation.x = -Math.PI / 2;
      carpet.position.set(x0 + w / 2, 0.02, z0 + h / 2);
      const trim = own(new THREE.Mesh(new THREE.PlaneGeometry(3.0, h - 0.8), new THREE.MeshLambertMaterial({ color: 0xc9a23a })));
      trim.rotation.x = -Math.PI / 2;
      trim.position.set(x0 + w / 2, 0.015, z0 + h / 2);
      group.add(trim, carpet);
      group.add(makeThrone(x0 + w / 2, z0 + 0.6));
      this.used.add(room.y * this.cols + room.x + Math.floor(room.w / 2));
    } else if (room.theme === 'library') {
      for (let x = room.x + 2; x < room.x + room.w - 2; x += 4) {
        if (this.isFloor(x, room.y) && this.isWall(x, room.y - 1)) {
          this.add(Pillars, 'shelf', {}, x * CELL_UNITS + 1, z0 + 0.45, 0, roomIndex);
          this.used.add(room.y * this.cols + x);
        }
      }
    } else if (room.theme === 'alchemy') {
      if (!this.isFloor(room.x, room.y)) {
        return;
      }
      const cauldron = new THREE.Group();
      const pot = own(new THREE.Mesh(
        new THREE.SphereGeometry(0.7, 14, 10, 0, Math.PI * 2, 0, Math.PI * 0.62),
        new THREE.MeshLambertMaterial({ color: 0x2a2a2e, side: THREE.DoubleSide })
      ));
      pot.rotation.x = Math.PI;
      pot.position.y = 0.7;
      const brew = own(new THREE.Mesh(new THREE.CircleGeometry(0.55, 16), new THREE.MeshBasicMaterial({ color: 0x5dff7a })));
      brew.rotation.x = -Math.PI / 2;
      brew.position.y = 0.95;
      cauldron.add(pot, brew);
      cauldron.position.set(x0 + 1.3, 0, z0 + 1.3);
      group.add(cauldron);
      this.used.add(room.y * this.cols + room.x);
      this.lights.push({ x: x0 + 1.3, y: 1.6, z: z0 + 1.3, color: 0x5dff7a, phase: 3, room: roomIndex, power: 1 });
    } else if (room.theme === 'crypt') {
      const stone = new THREE.MeshLambertMaterial({ color: 0x5c6070 });
      for (let x = room.x + 2; x < room.x + room.w - 2; x += 5) {
        if (!this.isFloor(x, room.y)) {
          continue;
        }
        const coffin = own(new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.7, 1.9), stone));
        coffin.position.set(x * CELL_UNITS + 1, 0.35, z0 + 1.0);
        group.add(coffin);
        this.used.add(room.y * this.cols + x);
      }
    } else if (room.theme === 'barracks') {
      for (const [cx, cy] of [[room.x, room.y], [room.x + room.w - 1, room.y]]) {
        if (this.isFloor(cx, cy) && cells[cy][cx] === FLOOR) {
          this.add(Props, 'crate', {}, cx * CELL_UNITS + 1, cy * CELL_UNITS + 1, Math.random(), roomIndex, 1.1);
          this.used.add(cy * this.cols + cx);
        }
      }
    }
  }

  // ------------------------------------------------------------ finishing

  // Turns the collected copies into instanced meshes, and the halos into
  // one layer of soft points.
  finish() {
    const m = new THREE.Matrix4();
    const tint = new THREE.Color();
    for (const batch of [...this.batches.values()].flatMap((byChunk) => [...byChunk.values()])) {
      const { baked, matrices, tints } = batch;
      for (const [geo, mat] of [[baked.solid, this.solidMat], [baked.glow, this.glowMat]]) {
        if (!geo) {
          continue;
        }
        const mesh = new THREE.InstancedMesh(geo, mat, matrices.length);
        matrices.forEach((mm, i) => {
          mesh.setMatrixAt(i, m.copy(mm));
          tint.setScalar(mat === this.glowMat ? 1 : tints[i]);
          mesh.setColorAt(i, tint);
        });
        mesh.computeBoundingSphere();
        this.owned.push(mesh);
        this.group.add(mesh);
      }
    }
    if (this.halos.length > 0) {
      const n = this.halos.length;
      const pos = new Float32Array(n * 3);
      const col = new Float32Array(n * 3);
      const size = new Float32Array(n);
      const phase = new Float32Array(n);
      const c = new THREE.Color();
      this.halos.forEach((h, i) => {
        pos.set([h.x, h.y, h.z], i * 3);
        c.setHex(h.color);
        col.set([c.r, c.g, c.b], i * 3);
        size[i] = h.size;
        phase[i] = Math.random() * 10;
      });
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      geo.setAttribute('aColor', new THREE.BufferAttribute(col, 3));
      geo.setAttribute('aSize', new THREE.BufferAttribute(size, 1));
      geo.setAttribute('aPhase', new THREE.BufferAttribute(phase, 1));
      if (!haloMap) {
        haloMap = glowTexture();
      }
      this.haloMat = this.material(new THREE.ShaderMaterial({
        uniforms: { uMap: { value: haloMap }, uScale: { value: 600 }, uTime: { value: 0 } },
        vertexShader: haloVertex,
        fragmentShader: haloFragment,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending
      }), false);
      const points = new THREE.Points(geo, this.haloMat);
      points.frustumCulled = false;
      points.renderOrder = 8;
      points.userData.ownGeometry = true;
      this.group.add(points);
    }
  }

  update(time, dt, camera) {
    for (const fn of this.animated) {
      fn(time, dt);
    }
    if (this.haloMat && camera) {
      this.haloMat.uniforms.uTime.value = time;
      this.haloMat.uniforms.uScale.value = (window.innerHeight || 800) * 0.9 / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)));
    }
  }

  dispose() {
    for (const thing of this.owned) {
      thing.dispose();
    }
    this.owned = [];
  }
}

function makeThrone(x, z) {
  const gold = new THREE.MeshLambertMaterial({ color: 0xb8902e });
  const velvet = new THREE.MeshLambertMaterial({ color: 0x6a0f1c });
  const throne = new THREE.Group();
  const seat = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.9, 1.2), gold);
  seat.position.y = 0.45;
  const cushion = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.2, 1.0), velvet);
  cushion.position.y = 1.0;
  const back = new THREE.Mesh(new THREE.BoxGeometry(1.6, 2.6, 0.3), gold);
  back.position.set(0, 1.8, -0.5);
  const backPad = new THREE.Mesh(new THREE.BoxGeometry(1.2, 1.9, 0.1), velvet);
  backPad.position.set(0, 1.8, -0.33);
  throne.add(seat, cushion, back, backPad);
  for (const side of [-1, 1]) {
    const spike = new THREE.Mesh(new THREE.ConeGeometry(0.15, 0.6, 6), gold);
    spike.position.set(side * 0.65, 3.4, -0.5);
    throne.add(spike);
  }
  throne.traverse((o) => {
    if (o.geometry) {
      o.userData.ownGeometry = true;
    }
  });
  throne.position.set(x, 0, z);
  return throne;
}
