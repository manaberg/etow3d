import * as THREE from 'three';

// Open battlefields: a grass plain instead of a dungeon floor. Walkable cells
// are grass, the cliffs around the field and the outcrops on it are drawn as
// heaps of rock (one instanced mesh), and the ground beyond the field fades
// into rough dark heath. No walls, no torches.

let grassTex = null;
function grassTexture() {
  if (grassTex) {
    return grassTex;
  }
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#4c6a2c';
  ctx.fillRect(0, 0, size, size);
  // mottled patches, then blades of grass
  for (let i = 0; i < 90; i++) {
    const g = 80 + Math.random() * 40;
    ctx.fillStyle = `rgba(${Math.floor(g * 0.6)}, ${Math.floor(g)}, ${Math.floor(g * 0.35)}, 0.25)`;
    ctx.beginPath();
    ctx.arc(Math.random() * size, Math.random() * size, 8 + Math.random() * 26, 0, Math.PI * 2);
    ctx.fill();
  }
  for (let i = 0; i < 2400; i++) {
    const x = Math.random() * size;
    const y = Math.random() * size;
    const light = Math.random();
    ctx.strokeStyle = light < 0.5 ? 'rgba(40, 62, 20, 0.55)' : 'rgba(120, 150, 60, 0.45)';
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + (Math.random() - 0.5) * 3, y - 2 - Math.random() * 4);
    ctx.stroke();
  }
  // a few bare earth spots
  for (let i = 0; i < 10; i++) {
    ctx.fillStyle = 'rgba(96, 74, 46, 0.35)';
    ctx.beginPath();
    ctx.ellipse(Math.random() * size, Math.random() * size, 4 + Math.random() * 10, 3 + Math.random() * 6, Math.random() * 3, 0, Math.PI * 2);
    ctx.fill();
  }
  grassTex = new THREE.CanvasTexture(canvas);
  grassTex.wrapS = THREE.RepeatWrapping;
  grassTex.wrapT = THREE.RepeatWrapping;
  grassTex.colorSpace = THREE.SRGBColorSpace;
  grassTex.anisotropy = 4;
  return grassTex;
}

function hash(x, y) {
  let h = (x * 374761393 + y * 668265263) | 0;
  h = (h ^ (h >>> 13)) * 1274126177;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}

export function buildFieldMesh(world) {
  const group = new THREE.Group();
  const { cells, cols, rows } = world.dungeon;
  // a dungeon cell is two tiles; one tile is one 3D unit
  const cellSize = 2;
  const w = cols * cellSize;
  const h = rows * cellSize;

  // the whole map is ground: grass where you can walk, heath beyond
  const heath = new THREE.Mesh(
    new THREE.PlaneGeometry(w + 200, h + 200),
    new THREE.MeshLambertMaterial({ color: 0x2c3420 })
  );
  heath.rotation.x = -Math.PI / 2;
  heath.position.set(w / 2, -0.02, h / 2);
  heath.userData.ownGeometry = true;
  group.add(heath);

  const tex = grassTexture().clone();
  tex.needsUpdate = true;
  tex.repeat.set(w / 12, h / 12);
  const grass = new THREE.Mesh(
    new THREE.PlaneGeometry(w, h),
    new THREE.MeshLambertMaterial({ map: tex, color: 0xffffff })
  );
  grass.rotation.x = -Math.PI / 2;
  grass.position.set(w / 2, 0, h / 2);
  grass.userData.ownGeometry = true;
  group.add(grass);

  // rocks on every solid cell that touches the field
  const open = (x, y) => y >= 0 && y < rows && x >= 0 && x < cols && cells[y][x] === 0;
  const spots = [];
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      if (cells[y][x] === 0) {
        continue;
      }
      const edge = open(x + 1, y) || open(x - 1, y) || open(x, y + 1) || open(x, y - 1) ||
        open(x + 1, y + 1) || open(x - 1, y - 1) || open(x + 1, y - 1) || open(x - 1, y + 1);
      if (edge) {
        spots.push([x, y]);
      }
    }
  }
  const rockGeo = new THREE.DodecahedronGeometry(1, 0);
  const rockMat = new THREE.MeshLambertMaterial({ color: 0x8a8478, flatShading: true });
  const perCell = 3;
  const rocks = new THREE.InstancedMesh(rockGeo, rockMat, spots.length * perCell);
  rocks.userData.ownGeometry = true;
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  const p = new THREE.Vector3();
  const s = new THREE.Vector3();
  const tint = new THREE.Color();
  let i = 0;
  for (const [x, y] of spots) {
    for (let k = 0; k < perCell; k++) {
      const r1 = hash(x * 3 + k, y * 7 - k);
      const r2 = hash(y * 5 + k, x * 11 + k);
      const r3 = hash(x + k * 13, y + k * 17);
      p.set((x + 0.15 + r1 * 0.7) * cellSize, 0.2 + r3 * 0.4, (y + 0.15 + r2 * 0.7) * cellSize);
      const size = 0.9 + r3 * 1.1 - k * 0.2;
      s.set(size * (0.9 + r1 * 0.4), size * (0.7 + r2 * 0.6), size * (0.9 + r2 * 0.4));
      e.set(r1 * 3, r2 * 6, r3 * 3);
      q.setFromEuler(e);
      m.compose(p, q, s);
      rocks.setMatrixAt(i, m);
      const shade = 0.75 + r2 * 0.35;
      tint.setRGB(shade, shade * 0.97, shade * 0.9);
      rocks.setColorAt(i, tint);
      i++;
    }
  }
  rocks.instanceMatrix.needsUpdate = true;
  if (rocks.instanceColor) {
    rocks.instanceColor.needsUpdate = true;
  }
  group.add(rocks);

  // scattered tufts and stones on the grass, purely for texture at a distance
  const tuftGeo = new THREE.ConeGeometry(0.18, 0.5, 4);
  const tuftMat = new THREE.MeshLambertMaterial({ color: 0x5f7f34 });
  const tuftCount = Math.floor(w * h / 18);
  const tufts = new THREE.InstancedMesh(tuftGeo, tuftMat, tuftCount);
  tufts.userData.ownGeometry = true;
  let t = 0;
  for (let n = 0; n < tuftCount * 3 && t < tuftCount; n++) {
    const tx = hash(n, 91) * w;
    const tz = hash(37, n) * h;
    if (!open(Math.floor(tx / cellSize), Math.floor(tz / cellSize))) {
      continue;
    }
    p.set(tx, 0.2, tz);
    q.identity();
    const sc = 0.6 + hash(n, n) * 0.8;
    s.set(sc, sc, sc);
    m.compose(p, q, s);
    tufts.setMatrixAt(t++, m);
  }
  tufts.count = t;
  tufts.instanceMatrix.needsUpdate = true;
  group.add(tufts);

  return { group, torches: [] };
}
