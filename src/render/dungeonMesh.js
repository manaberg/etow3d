import * as THREE from 'three';
import { WALL_HEIGHT } from '../core/constants.js';
import { DungeonThemes } from '../world/dungeon.js';
import { floorTexture, brickTexture, glowTexture } from './textures.js';

// One dungeon cell (48px) is two world units.
const CELL_UNITS = 2;
const CORRIDOR_FLOOR = 0x4f4a45;
const CORRIDOR_WALL = 0x5a554e;

let shared = null;
function sharedAssets() {
  if (shared) {
    return shared;
  }
  const floorTex = floorTexture();
  const brickTex = brickTexture();
  brickTex.repeat.set(1, WALL_HEIGHT / 2);
  shared = {
    floorTex,
    brickTex,
    glowTex: glowTexture(),
    wallBox: new THREE.BoxGeometry(CELL_UNITS, WALL_HEIGHT, CELL_UNITS),
    column: new THREE.CylinderGeometry(0.72, 0.82, WALL_HEIGHT, 12),
    columnBase: new THREE.CylinderGeometry(0.95, 1.0, 0.35, 12),
    capMat: new THREE.MeshLambertMaterial({ color: 0x2e2b28 }),
    torchStick: new THREE.CylinderGeometry(0.05, 0.07, 0.6, 6),
    torchMat: new THREE.MeshLambertMaterial({ color: 0x3a2a1a }),
    flameGeo: new THREE.ConeGeometry(0.13, 0.42, 7)
  };
  return shared;
}

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

function themeColor(world, roomIndex, key, fallback) {
  if (roomIndex < 0) {
    return fallback;
  }
  return DungeonThemes[world.rooms[roomIndex].themeIndex][key];
}

function hash(x, y) {
  let h = (x * 374761393) + (y * 668265263);
  h = (h ^ (h >>> 13)) * 1274126177;
  return Math.abs(h ^ (h >>> 16));
}

export function buildDungeonMesh(world, cutaway) {
  const assets = sharedAssets();
  const group = new THREE.Group();
  const { cells, owner, cols, rows } = world.dungeon;
  const open = (x, y) => y >= 0 && y < rows && x >= 0 && x < cols && cells[y][x] === 0;

  // floor: one merged mesh, tinted per room through vertex colours
  const positions = [];
  const uvs = [];
  const colors = [];
  const indices = [];
  const color = new THREE.Color();
  let v = 0;
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      if (cells[y][x] !== 0) {
        continue;
      }
      const room = owner[y][x];
      color.setHex(themeColor(world, room, 'floor', CORRIDOR_FLOOR));
      const shade = 0.82 + (hash(x, y) % 100) / 400;
      // soft darkening next to walls fakes ambient occlusion
      const nearWall = !open(x - 1, y) || !open(x + 1, y) || !open(x, y - 1) || !open(x, y + 1);
      color.multiplyScalar(shade * (nearWall ? 0.8 : 1));
      const x0 = x * CELL_UNITS;
      const z0 = y * CELL_UNITS;
      positions.push(x0, 0, z0, x0 + CELL_UNITS, 0, z0, x0 + CELL_UNITS, 0, z0 + CELL_UNITS, x0, 0, z0 + CELL_UNITS);
      const flip = hash(y, x) % 4;
      const uvSets = [[0, 0, 1, 0, 1, 1, 0, 1], [1, 0, 1, 1, 0, 1, 0, 0], [1, 1, 0, 1, 0, 0, 1, 0], [0, 1, 0, 0, 1, 0, 1, 1]];
      uvs.push(...uvSets[flip]);
      for (let k = 0; k < 4; k++) {
        colors.push(color.r, color.g, color.b);
      }
      indices.push(v, v + 2, v + 1, v, v + 3, v + 2);
      v += 4;
    }
  }
  const floorGeo = new THREE.BufferGeometry();
  floorGeo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  floorGeo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  floorGeo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  floorGeo.setIndex(indices);
  floorGeo.computeVertexNormals();
  const floor = new THREE.Mesh(floorGeo, new THREE.MeshLambertMaterial({ map: assets.floorTex, vertexColors: true }));
  floor.userData.ownGeometry = true;
  group.add(floor);

  // walls: only cells touching the floor are built; pillars become columns
  const wallCells = [];
  const pillarCells = [];
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      if (cells[y][x] === 0) {
        continue;
      }
      let touching = false;
      let neighbourRoom = -1;
      for (let oy = -1; oy <= 1; oy++) {
        for (let ox = -1; ox <= 1; ox++) {
          if (open(x + ox, y + oy)) {
            touching = true;
            const r = owner[y + oy][x + ox];
            if (r >= 0) {
              neighbourRoom = r;
            }
          }
        }
      }
      if (!touching) {
        continue;
      }
      const freeStanding = open(x - 1, y) && open(x + 1, y) && open(x, y - 1) && open(x, y + 1);
      if (freeStanding) {
        pillarCells.push({ x, y, room: world.dungeon.owner[y][x - 1] });
      } else {
        wallCells.push({ x, y, room: neighbourRoom });
      }
    }
  }
  const wallMat = new THREE.MeshLambertMaterial({ map: assets.brickTex });
  addCutaway(wallMat, cutaway);
  const capMat = assets.capMat.clone();
  addCutaway(capMat, cutaway);
  const walls = new THREE.InstancedMesh(assets.wallBox, [wallMat, wallMat, capMat, capMat, wallMat, wallMat], wallCells.length);
  const m = new THREE.Matrix4();
  wallCells.forEach((cell, i) => {
    m.makeTranslation(cell.x * CELL_UNITS + 1, WALL_HEIGHT / 2, cell.y * CELL_UNITS + 1);
    walls.setMatrixAt(i, m);
    color.setHex(themeColor(world, cell.room, 'wall', CORRIDOR_WALL));
    color.multiplyScalar(0.85 + (hash(cell.x, cell.y) % 100) / 500);
    walls.setColorAt(i, color);
  });
  group.add(walls);

  if (pillarCells.length > 0) {
    const columnMat = new THREE.MeshLambertMaterial({ map: assets.brickTex });
    addCutaway(columnMat, cutaway);
    const columns = new THREE.InstancedMesh(assets.column, columnMat, pillarCells.length);
    const bases = new THREE.InstancedMesh(assets.columnBase, new THREE.MeshLambertMaterial({ color: 0x55504a }), pillarCells.length * 2);
    pillarCells.forEach((cell, i) => {
      const cx = cell.x * CELL_UNITS + 1;
      const cz = cell.y * CELL_UNITS + 1;
      m.makeTranslation(cx, WALL_HEIGHT / 2, cz);
      columns.setMatrixAt(i, m);
      color.setHex(themeColor(world, cell.room, 'wall', CORRIDOR_WALL));
      columns.setColorAt(i, color);
      m.makeTranslation(cx, 0.17, cz);
      bases.setMatrixAt(i * 2, m);
      m.makeTranslation(cx, WALL_HEIGHT - 0.17, cz);
      bases.setMatrixAt(i * 2 + 1, m);
    });
    group.add(columns, bases);
  }

  const torches = [];
  world.dungeon.rooms.forEach((room, r) => {
    const theme = DungeonThemes[room.themeIndex];
    addRoomDressing(group, world, room, r, theme, torches, assets);
  });

  return { group, torches };
}

// Torches on the north walls (the ones facing the camera) and a few themed
// props, all decorative and kept out of the walking space where possible.
function addRoomDressing(group, world, room, roomIndex, theme, torches, assets) {
  const { cells } = world.dungeon;
  const flameMat = new THREE.MeshBasicMaterial({ color: theme.light });
  const glowMat = new THREE.SpriteMaterial({
    map: assets.glowTex, color: theme.light, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true
  });
  const northY = room.y - 1;
  for (let x = room.x + 1; x < room.x + room.w - 1; x += 4) {
    if (!cells[northY] || cells[northY][x] !== 1) {
      continue;
    }
    const tx = x * CELL_UNITS + 1;
    const tz = room.y * CELL_UNITS + 0.12;
    const torch = new THREE.Group();
    const stick = new THREE.Mesh(assets.torchStick, assets.torchMat);
    stick.rotation.x = 0.5;
    stick.position.set(0, 0, 0.1);
    const flame = new THREE.Mesh(assets.flameGeo, flameMat);
    flame.position.set(0, 0.42, 0.25);
    const glow = new THREE.Sprite(glowMat);
    glow.scale.set(1.3, 1.3, 1.3);
    glow.position.copy(flame.position);
    torch.add(stick, flame, glow);
    torch.position.set(tx, 2.2, tz);
    group.add(torch);
    torches.push({ x: tx, y: 2.6, z: tz + 0.7, color: theme.light, phase: Math.random() * 10, flame, room: roomIndex });
  }
  // rooms without a free north wall still get one light in the middle
  if (!torches.some((t) => t.room === roomIndex)) {
    const cx = (room.x + room.w / 2) * CELL_UNITS;
    const cz = (room.y + room.h / 2) * CELL_UNITS;
    torches.push({ x: cx, y: 3.4, z: cz, color: theme.light, phase: Math.random() * 10, room: roomIndex });
  }

  const x0 = room.x * CELL_UNITS;
  const z0 = room.y * CELL_UNITS;
  const w = room.w * CELL_UNITS;
  const h = room.h * CELL_UNITS;
  if (theme.name === 'throne') {
    const carpet = new THREE.Mesh(
      new THREE.PlaneGeometry(2.6, h - 1.2),
      new THREE.MeshLambertMaterial({ color: 0x7a1420 })
    );
    carpet.rotation.x = -Math.PI / 2;
    carpet.position.set(x0 + w / 2, 0.02, z0 + h / 2);
    carpet.userData.ownGeometry = true;
    const trim = new THREE.Mesh(
      new THREE.PlaneGeometry(3.0, h - 0.8),
      new THREE.MeshLambertMaterial({ color: 0xc9a23a })
    );
    trim.rotation.x = -Math.PI / 2;
    trim.position.set(x0 + w / 2, 0.015, z0 + h / 2);
    trim.userData.ownGeometry = true;
    group.add(trim, carpet);
    group.add(makeThrone(x0 + w / 2, z0 + 0.6));
  } else if (theme.name === 'library') {
    const shelfMat = new THREE.MeshLambertMaterial({ color: 0x4a2e1c });
    const bookMats = [0x7a2030, 0x204a7a, 0x2f6a35, 0x8a6a20].map((c) => new THREE.MeshLambertMaterial({ color: c }));
    for (let x = room.x + 2; x < room.x + room.w - 2; x += 4) {
      const shelf = new THREE.Group();
      const frame = new THREE.Mesh(new THREE.BoxGeometry(1.6, 2.6, 0.5), shelfMat);
      frame.position.y = 1.3;
      frame.userData.ownGeometry = true;
      shelf.add(frame);
      for (let row = 0; row < 3; row++) {
        const books = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.55, 0.42), bookMats[(x + row) % bookMats.length]);
        books.position.set(0, 0.45 + row * 0.8, 0.06);
        books.userData.ownGeometry = true;
        shelf.add(books);
      }
      shelf.position.set(x * CELL_UNITS + 1, 0, z0 + 0.25);
      group.add(shelf);
    }
  } else if (theme.name === 'alchemy') {
    const cauldron = new THREE.Group();
    const pot = new THREE.Mesh(
      new THREE.SphereGeometry(0.7, 14, 10, 0, Math.PI * 2, 0, Math.PI * 0.62),
      new THREE.MeshLambertMaterial({ color: 0x2a2a2e, side: THREE.DoubleSide })
    );
    pot.rotation.x = Math.PI;
    pot.position.y = 0.7;
    pot.userData.ownGeometry = true;
    const brew = new THREE.Mesh(new THREE.CircleGeometry(0.55, 16), new THREE.MeshBasicMaterial({ color: 0x5dff7a }));
    brew.rotation.x = -Math.PI / 2;
    brew.position.y = 0.95;
    brew.userData.ownGeometry = true;
    cauldron.add(pot, brew);
    cauldron.position.set(x0 + 1.3, 0, z0 + 1.3);
    group.add(cauldron);
    torches.push({ x: x0 + 1.3, y: 1.6, z: z0 + 1.3, color: 0x5dff7a, phase: 3, room: roomIndex });
  } else if (theme.name === 'crypt') {
    const stone = new THREE.MeshLambertMaterial({ color: 0x5c6070 });
    for (let x = room.x + 2; x < room.x + room.w - 2; x += 5) {
      const coffin = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.7, 1.9), stone);
      coffin.position.set(x * CELL_UNITS + 1, 0.35, z0 + 1.0);
      coffin.userData.ownGeometry = true;
      group.add(coffin);
    }
  } else if (theme.name === 'barracks') {
    const wood = new THREE.MeshLambertMaterial({ color: 0x6a4a2a });
    const spots = [[x0 + 1, z0 + 1], [x0 + w - 1, z0 + 1]];
    for (const [px, pz] of spots) {
      const crate = new THREE.Mesh(new THREE.BoxGeometry(1.1, 1.1, 1.1), wood);
      crate.position.set(px, 0.55, pz);
      crate.rotation.y = Math.random();
      crate.userData.ownGeometry = true;
      group.add(crate);
    }
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
