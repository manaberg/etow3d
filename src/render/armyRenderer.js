import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { UNIT } from '../core/constants.js';
import { orcTemplate, glowMap, TEAM_COLORS } from './models.js';

// Draws battle armies with instancing: for every look (orcs, dwarves, humans,
// elves) and side, one InstancedMesh per body part of the Blender model (its
// materials baked into vertex colours, the team's colours on cloth and
// armour), plus one for all shadows and one for the team rings. Thousands of
// soldiers cost a few hundred draw calls.
//
// Every frame the soldiers in view write their pose (begin, write, flush):
// near the camera the full model with swinging arms and legs, further off a
// coarse copy of it in one piece (`lod` below), and nothing for soldiers off
// screen. Units keep a light UnitAnim (the same walk, swing and hit flash as
// the dungeon Rig) that the renderer turns into matrices.

const FLASH = new THREE.Color(1, 0.28, 0.2);
const WHITE = new THREE.Color(1, 1, 1);
const GLOWING = new Set(['Gem', 'Glow', 'Eye']);
const PARTS = ['Body', 'Head', 'ArmL', 'ArmR', 'LegL', 'LegR'];

// within `near` 3D units of the camera a soldier is drawn in full, further
// off in its coarse copy, whose vertices snap to a grid of `cell` units
// (model space) to shed most of the triangles
const LOD = { near: 72, cell: 0.24, margin: 4 };

// Animation state of one instanced unit (mirrors Rig.animate).
export class UnitAnim {
  constructor(scale, height) {
    this.scale = scale;
    this.height = height || 2.6 * scale;
    this.phase = Math.random() * 10;
    this.speed = 0;
    this.facing = 0;
    this.flash = 0;
    this.attack = 0;
    this.swingAngle = 0;
    this.bob = 0;
  }

  animate(dt, speed, facing) {
    if (facing !== undefined && facing !== null) {
      let diff = facing - this.facing;
      while (diff > Math.PI) { diff -= Math.PI * 2; }
      while (diff < -Math.PI) { diff += Math.PI * 2; }
      this.facing += diff * Math.min(1, dt * 12);
    }
    this.speed = speed;
    this.phase += dt * (4 + speed * 8);
    this.swingAngle = Math.sin(this.phase) * 0.7 * speed;
    this.bob = Math.abs(Math.sin(this.phase)) * 0.08 * speed + Math.sin(this.phase * 0.35) * 0.02;
    if (this.attack > 0) {
      this.attack = Math.max(0, this.attack - dt * 3);
    }
    if (this.flash > 0) {
      this.flash = Math.max(0, this.flash - dt * 4);
    }
  }

  hit() {
    this.flash = 1;
  }

  swing() {
    this.attack = 1;
  }
}

// A part's meshes as one non-indexed geometry with position, normal and
// colour, moved by `offset`; null if there are none.
function bake(meshes, colorOf, offset) {
  const geos = [];
  for (const m of meshes) {
    const src = m.geometry.index ? m.geometry.toNonIndexed() : m.geometry.clone();
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', src.getAttribute('position').clone());
    g.setAttribute('normal', src.getAttribute('normal').clone());
    if (offset) {
      g.translate(offset.x, offset.y, offset.z);
    }
    const color = new THREE.Color(colorOf(m));
    const n = g.getAttribute('position').count;
    const colors = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      colors[i * 3] = color.r;
      colors[i * 3 + 1] = color.g;
      colors[i * 3 + 2] = color.b;
    }
    g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geos.push(g);
  }
  return geos.length ? mergeGeometries(geos) : null;
}

// A coarse copy of a geometry: every vertex snaps to the middle of its grid
// cell, triangles that collapse are dropped, and the rest get flat normals.
function coarsen(geo, cell) {
  const pos = geo.getAttribute('position');
  const col = geo.getAttribute('color');
  const snap = (v) => (Math.floor(v / cell) + 0.5) * cell;
  const out = [];
  const outColor = [];
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();
  for (let i = 0; i < pos.count; i += 3) {
    a.set(snap(pos.getX(i)), snap(pos.getY(i)), snap(pos.getZ(i)));
    b.set(snap(pos.getX(i + 1)), snap(pos.getY(i + 1)), snap(pos.getZ(i + 1)));
    c.set(snap(pos.getX(i + 2)), snap(pos.getY(i + 2)), snap(pos.getZ(i + 2)));
    if (a.equals(b) || b.equals(c) || a.equals(c)) {
      continue;
    }
    out.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z);
    for (let k = 0; k < 3; k++) {
      outColor.push(col.getX(i + k), col.getY(i + k), col.getZ(i + k));
    }
  }
  // many triangles land on the same cells: keep each once
  const seen = new Set();
  const pos2 = [];
  const col2 = [];
  for (let i = 0; i < out.length; i += 9) {
    const key = out.slice(i, i + 9).map((v) => Math.round(v / cell * 2)).join(',');
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    pos2.push(...out.slice(i, i + 9));
    col2.push(...outColor.slice(i, i + 9));
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos2, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col2, 3));
  g.computeVertexNormals();
  return g;
}

export class ArmyRenderer {
  constructor(gfx) {
    this.gfx = gfx;
    this.group = new THREE.Group();
    gfx.add(this.group);
    this.batches = new Map();
    this.used = new Map();
    this.lit = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide });
    this.unlit = new THREE.MeshBasicMaterial({ vertexColors: true });
    this.shadowMat = new THREE.MeshBasicMaterial({ map: glowMap(), color: 0x000000, transparent: true, opacity: 0.45, depthWrite: false });
    this.shadowGeo = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
    this.ringGeo = new THREE.RingGeometry(0.62, 0.78, 20).rotateX(-Math.PI / 2);
    this.ringMats = {};
    for (const side in TEAM_COLORS) {
      this.ringMats[side] = new THREE.MeshBasicMaterial({ color: TEAM_COLORS[side].ring, transparent: true, opacity: 0.75, blending: THREE.AdditiveBlending, depthWrite: false });
    }
    this.color = new THREE.Color();
    this.camPos = new THREE.Vector3();
    this.view = { x0: -Infinity, x1: Infinity, z0: -Infinity, z1: Infinity };
  }

  // Whether instanced soldiers can be drawn (the Blender models loaded).
  static available(look) {
    return !!orcTemplate(look);
  }

  // Makes room for `count` more soldiers of a look on a side. Call before spawning.
  reserve(look, side, count) {
    const key = look + '|' + side;
    const existing = this.batches.get(key);
    const need = (existing ? existing.capacity : 0) + count;
    if (existing) {
      this.dropBatch(key);
    }
    this.batches.set(key, this.makeBatch(look, side, need));
    this.used.set(key, 0);
  }

  instanced(geometry, material, capacity, colored) {
    const inst = new THREE.InstancedMesh(geometry, material, capacity);
    inst.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    if (colored) {
      inst.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(capacity * 3).fill(1), 3);
      inst.instanceColor.setUsage(THREE.DynamicDrawUsage);
    }
    inst.frustumCulled = false;
    inst.count = 0;
    this.group.add(inst);
    return inst;
  }

  makeBatch(look, side, capacity) {
    const template = orcTemplate(look);
    const team = TEAM_COLORS[side];
    const overrides = { Cloth: team.cloth, Armor: team.armor };
    const colorOf = (m) => overrides[m.material] ?? m.color;
    const parts = [];
    const whole = [];
    for (const name of PARTS) {
      const part = template.parts[name];
      if (!part) {
        continue;
      }
      const meshes = [];
      const lit = bake(part.meshes.filter((m) => !GLOWING.has(m.material)), colorOf);
      const glow = bake(part.meshes.filter((m) => GLOWING.has(m.material)), colorOf);
      if (lit) {
        meshes.push(this.instanced(lit, this.lit, capacity, true));
      }
      if (glow) {
        meshes.push(this.instanced(glow, this.unlit, capacity, true));
      }
      const pivot = name === 'Body' ? null : part.position.clone();
      parts.push({ name, pivot: pivot || new THREE.Vector3(), meshes });
      whole.push(bake(part.meshes, colorOf, pivot));
    }
    // the coarse copy for soldiers far off: the whole model at rest, in one piece
    const lodGeo = coarsen(mergeGeometries(whole), LOD.cell / template.scale);
    for (const g of whole) {
      g.dispose();
    }
    const lod = this.instanced(lodGeo, this.lit, capacity, true);
    const shadow = this.instanced(this.shadowGeo, this.shadowMat, capacity, false);
    const ring = this.instanced(this.ringGeo, this.ringMats[side], capacity, false);
    shadow.renderOrder = 1;
    ring.renderOrder = 1;
    return { look, side, capacity, parts, lod, shadow, ring, near: 0, far: 0, rings: 0, shadows: 0, scale: template.scale, height: template.height };
  }

  dropBatch(key) {
    const batch = this.batches.get(key);
    if (!batch) {
      return;
    }
    const meshes = [batch.lod, batch.shadow, batch.ring];
    for (const part of batch.parts) {
      meshes.push(...part.meshes);
    }
    for (const inst of meshes) {
      this.group.remove(inst);
      if (inst.geometry !== this.shadowGeo && inst.geometry !== this.ringGeo) {
        inst.geometry.dispose();
      }
      inst.dispose();
    }
    this.batches.delete(key);
  }

  // Hands a unit its place in a batch; returns its UnitAnim, or null if there
  // is no room.
  register(unit, look, side) {
    const key = look + '|' + side;
    const batch = this.batches.get(key);
    const used = this.used.get(key) || 0;
    if (!batch || used >= batch.capacity) {
      return null;
    }
    this.used.set(key, used + 1);
    unit.instance = { batch };
    return new UnitAnim(batch.scale, batch.height);
  }

  // A unit that is not written in a frame is not drawn: nothing to do.
  hide() {}

  // Starts a frame: the ground the camera sees (with a margin) and where it is.
  begin() {
    const gfx = this.gfx;
    let x0 = Infinity;
    let x1 = -Infinity;
    let z0 = Infinity;
    let z1 = -Infinity;
    let open = false;
    for (const [sx, sy] of [[0, 0], [gfx.width, 0], [0, gfx.height], [gfx.width, gfx.height]]) {
      const g = gfx.pickGround({ x: sx, y: sy });
      if (!g) {
        open = true;
        continue;
      }
      x0 = Math.min(x0, g.x * UNIT);
      x1 = Math.max(x1, g.x * UNIT);
      z0 = Math.min(z0, g.y * UNIT);
      z1 = Math.max(z1, g.y * UNIT);
    }
    const m = LOD.margin;
    this.view = open ? { x0: -Infinity, x1: Infinity, z0: -Infinity, z1: Infinity } : { x0: x0 - m, x1: x1 + m, z0: z0 - m, z1: z1 + m };
    this.camPos.copy(gfx.camera.position);
    for (const batch of this.batches.values()) {
      batch.near = 0;
      batch.far = 0;
      batch.rings = 0;
      batch.shadows = 0;
    }
  }

  // Writes one unit's pose for this frame (called from its syncView). The
  // matrices are written out by hand: thousands of units pose every frame.
  // Each part is the body (at the feet, turned to face, bobbing, scaled)
  // times the part's pivot and its swing about x.
  // `h`: how high it hangs (world units; reverse gravity, arcana.js).
  write(unit, x, y, h = 0) {
    const X = x * UNIT;
    const Z = y * UNIT;
    const v = this.view;
    if (X < v.x0 || X > v.x1 || Z < v.z0 || Z > v.z1) {
      return;
    }
    const batch = unit.instance.batch;
    const a = unit.rig;
    const s = batch.scale;
    const c = Math.cos(a.facing);
    const sn = Math.sin(a.facing);
    const flash = a.flash > 0 ? this.color.copy(WHITE).lerp(FLASH, a.flash) : WHITE;
    const dx = X - this.camPos.x;
    const dy = this.camPos.y;
    const dz = Z - this.camPos.z;
    const near = dx * dx + dy * dy + dz * dz < LOD.near * LOD.near;
    if (near) {
      const index = batch.near++;
      const o = index * 16;
      for (const part of batch.parts) {
        let angle = 0;
        if (part.name === 'LegL') {
          angle = a.swingAngle;
        } else if (part.name === 'LegR') {
          angle = -a.swingAngle;
        } else if (part.name === 'ArmL') {
          angle = -a.swingAngle * 0.8;
        } else if (part.name === 'ArmR') {
          angle = a.attack > 0 ? -2.2 * Math.sin(a.attack * Math.PI) : a.swingAngle * 0.8;
        }
        const ca = Math.cos(angle);
        const sa = Math.sin(angle);
        const p = part.pivot;
        for (const mesh of part.meshes) {
          const e = mesh.instanceMatrix.array;
          // scale * rotY(facing) * rotX(angle), column by column
          e[o] = s * c; e[o + 1] = 0; e[o + 2] = -s * sn; e[o + 3] = 0;
          e[o + 4] = s * sn * sa; e[o + 5] = s * ca; e[o + 6] = s * c * sa; e[o + 7] = 0;
          e[o + 8] = s * sn * ca; e[o + 9] = -s * sa; e[o + 10] = s * c * ca; e[o + 11] = 0;
          e[o + 12] = X + s * (c * p.x + sn * p.z);
          e[o + 13] = a.bob + h + s * p.y;
          e[o + 14] = Z + s * (-sn * p.x + c * p.z);
          e[o + 15] = 1;
          const ic = mesh.instanceColor.array;
          ic[index * 3] = flash.r;
          ic[index * 3 + 1] = flash.g;
          ic[index * 3 + 2] = flash.b;
        }
      }
      // the shadow lies flat under it
      const si = batch.shadows++ * 16;
      const e = batch.shadow.instanceMatrix.array;
      e[si] = 1.9; e[si + 1] = 0; e[si + 2] = 0; e[si + 3] = 0;
      e[si + 4] = 0; e[si + 5] = 1; e[si + 6] = 0; e[si + 7] = 0;
      e[si + 8] = 0; e[si + 9] = 0; e[si + 10] = 1.9; e[si + 11] = 0;
      e[si + 12] = X; e[si + 13] = 0.03; e[si + 14] = Z; e[si + 15] = 1;
    } else {
      const index = batch.far++;
      const o = index * 16;
      const e = batch.lod.instanceMatrix.array;
      e[o] = s * c; e[o + 1] = 0; e[o + 2] = -s * sn; e[o + 3] = 0;
      e[o + 4] = 0; e[o + 5] = s; e[o + 6] = 0; e[o + 7] = 0;
      e[o + 8] = s * sn; e[o + 9] = 0; e[o + 10] = s * c; e[o + 11] = 0;
      e[o + 12] = X; e[o + 13] = a.bob + h; e[o + 14] = Z; e[o + 15] = 1;
      const ic = batch.lod.instanceColor.array;
      ic[index * 3] = flash.r;
      ic[index * 3 + 1] = flash.g;
      ic[index * 3 + 2] = flash.b;
    }
    // the ring, in the side's colour, turns with it
    const ri = batch.rings++ * 16;
    const e = batch.ring.instanceMatrix.array;
    e[ri] = c; e[ri + 1] = 0; e[ri + 2] = -sn; e[ri + 3] = 0;
    e[ri + 4] = 0; e[ri + 5] = 1; e[ri + 6] = 0; e[ri + 7] = 0;
    e[ri + 8] = sn; e[ri + 9] = 0; e[ri + 10] = c; e[ri + 11] = 0;
    e[ri + 12] = X; e[ri + 13] = 0.05; e[ri + 14] = Z; e[ri + 15] = 1;
  }

  // Uploads what was written this frame.
  flush() {
    const upload = (mesh, count) => {
      mesh.count = count;
      mesh.instanceMatrix.clearUpdateRanges();
      mesh.instanceMatrix.addUpdateRange(0, count * 16);
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) {
        mesh.instanceColor.clearUpdateRanges();
        mesh.instanceColor.addUpdateRange(0, count * 3);
        mesh.instanceColor.needsUpdate = true;
      }
    };
    for (const batch of this.batches.values()) {
      for (const part of batch.parts) {
        for (const mesh of part.meshes) {
          upload(mesh, batch.near);
        }
      }
      upload(batch.lod, batch.far);
      upload(batch.shadow, batch.shadows);
      upload(batch.ring, batch.rings);
    }
  }

  clear() {
    for (const key of [...this.batches.keys()]) {
      this.dropBatch(key);
    }
    this.used.clear();
  }

  dispose() {
    this.clear();
    for (const m of [this.lit, this.unlit, this.shadowMat, ...Object.values(this.ringMats)]) {
      m.dispose();
    }
    this.shadowGeo.dispose();
    this.ringGeo.dispose();
    this.gfx.remove(this.group);
  }
}
