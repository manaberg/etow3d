import * as THREE from 'three';
import { UNIT } from '../core/constants.js';
import { orcTemplate, glowMap, TEAM_COLORS } from './models.js';

// Draws battle armies with instancing: for every orc look and side, one
// InstancedMesh per part and material of the Blender model, plus one for all
// shadows and one per side for the team rings. Hundreds of orcs cost a few
// hundred draw calls instead of tens of thousands. Units keep a light
// UnitAnim (the same walk, swing and hit flash as the dungeon Rig) and the
// renderer turns it into matrices every frame.

const FLASH = new THREE.Color(1, 0.28, 0.2);
const WHITE = new THREE.Color(1, 1, 1);
const HIDDEN = new THREE.Matrix4().makeScale(0, 0, 0);
const GLOWING = new Set(['Gem', 'Glow']);

// Animation state of one instanced unit (mirrors Rig.animate).
export class UnitAnim {
  constructor(scale) {
    this.scale = scale;
    this.height = 2.6 * scale;
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

export class ArmyRenderer {
  constructor(gfx) {
    this.gfx = gfx;
    this.group = new THREE.Group();
    gfx.add(this.group);
    this.batches = new Map();
    this.used = new Map();
    this.materials = [];
    this.m = new THREE.Matrix4();
    this.root = new THREE.Matrix4();
    this.body = new THREE.Matrix4();
    this.part = new THREE.Matrix4();
    this.tmp = new THREE.Matrix4();
    this.color = new THREE.Color();
    this.v = new THREE.Vector3();
    this.q = new THREE.Quaternion();
    this.s = new THREE.Vector3();
    this.axisY = new THREE.Vector3(0, 1, 0);
    this.dirty = new Set();
  }

  // Whether instanced orcs can be drawn (the Blender models loaded).
  static available(look) {
    return !!orcTemplate(look);
  }

  // Makes room for `count` more orcs of a look on a side. Call before spawning.
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

  makeBatch(look, side, capacity) {
    const template = orcTemplate(look);
    const team = TEAM_COLORS[side];
    const overrides = { Cloth: team.cloth, Armor: team.armor };
    const mats = {};
    const parts = [];
    for (const name of ['Body', 'Head', 'ArmL', 'ArmR', 'LegL', 'LegR']) {
      const part = template.parts[name];
      if (!part) {
        continue;
      }
      const meshes = [];
      for (const m of part.meshes) {
        if (!mats[m.material]) {
          const color = overrides[m.material] ?? m.color;
          mats[m.material] = GLOWING.has(m.material) || m.material === 'Eye'
            ? new THREE.MeshBasicMaterial({ color })
            : new THREE.MeshLambertMaterial({ color, side: THREE.DoubleSide });
          this.materials.push(mats[m.material]);
        }
        const inst = new THREE.InstancedMesh(m.geometry, mats[m.material], capacity);
        inst.frustumCulled = false;
        for (let i = 0; i < capacity; i++) {
          inst.setMatrixAt(i, HIDDEN);
          inst.setColorAt(i, WHITE);
        }
        this.group.add(inst);
        meshes.push(inst);
      }
      parts.push({ name, pivot: part.position.clone(), meshes });
    }
    // shadows and team rings ride along in their own batches
    const shadow = new THREE.InstancedMesh(
      new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ map: glowMap(), color: 0x000000, transparent: true, opacity: 0.45, depthWrite: false }),
      capacity
    );
    const ring = new THREE.InstancedMesh(
      new THREE.RingGeometry(0.62, 0.78, 20).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ color: team.ring, transparent: true, opacity: 0.75, blending: THREE.AdditiveBlending, depthWrite: false }),
      capacity
    );
    for (const extra of [shadow, ring]) {
      extra.frustumCulled = false;
      extra.renderOrder = 1;
      for (let i = 0; i < capacity; i++) {
        extra.setMatrixAt(i, HIDDEN);
      }
      this.group.add(extra);
      this.materials.push(extra.material);
    }
    return { look, side, capacity, parts, shadow, ring, scale: template.scale };
  }

  dropBatch(key) {
    const batch = this.batches.get(key);
    if (!batch) {
      return;
    }
    for (const part of batch.parts) {
      for (const inst of part.meshes) {
        this.group.remove(inst);
        inst.dispose();
      }
    }
    for (const extra of [batch.shadow, batch.ring]) {
      this.group.remove(extra);
      extra.geometry.dispose();
      extra.dispose();
    }
    this.batches.delete(key);
  }

  // Hands a unit its slot; returns its UnitAnim, or null if there is no room.
  register(unit, look, side) {
    const key = look + '|' + side;
    const batch = this.batches.get(key);
    const used = this.used.get(key) || 0;
    if (!batch || used >= batch.capacity) {
      return null;
    }
    this.used.set(key, used + 1);
    unit.instance = { batch, index: used };
    return new UnitAnim(batch.scale);
  }

  hide(unit) {
    const inst = unit.instance;
    if (!inst) {
      return;
    }
    for (const part of inst.batch.parts) {
      for (const mesh of part.meshes) {
        mesh.setMatrixAt(inst.index, HIDDEN);
      }
    }
    inst.batch.shadow.setMatrixAt(inst.index, HIDDEN);
    inst.batch.ring.setMatrixAt(inst.index, HIDDEN);
    this.dirty.add(inst.batch);
  }

  // Writes one unit's pose (called from its syncView).
  write(unit, x, y) {
    const inst = unit.instance;
    const a = unit.rig;
    const { batch, index } = inst;
    const s = batch.scale;
    // root at the feet, turned to face; body bobs and carries the scale
    this.q.setFromAxisAngle(this.axisY, a.facing);
    this.root.compose(this.v.set(x * UNIT, 0, y * UNIT), this.q, this.s.set(1, 1, 1));
    this.tmp.makeTranslation(0, a.bob, 0);
    this.body.multiplyMatrices(this.root, this.tmp);
    this.tmp.makeScale(s, s, s);
    this.body.multiply(this.tmp);
    const flash = a.flash > 0 ? this.color.copy(WHITE).lerp(FLASH, a.flash) : WHITE;
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
      if (part.name === 'Body') {
        this.part.copy(this.body);
      } else {
        this.tmp.makeTranslation(part.pivot.x, part.pivot.y, part.pivot.z);
        this.part.multiplyMatrices(this.body, this.tmp);
        if (angle) {
          this.tmp.makeRotationX(angle);
          this.part.multiply(this.tmp);
        }
      }
      for (const mesh of part.meshes) {
        mesh.setMatrixAt(index, this.part);
        if (a.flash > 0 || a._flashed) {
          mesh.setColorAt(index, flash);
        }
      }
    }
    a._flashed = a.flash > 0;
    this.m.compose(this.v.set(x * UNIT, 0.03, y * UNIT), this.q.identity(), this.s.set(1.9, 1, 1.9));
    batch.shadow.setMatrixAt(index, this.m);
    this.m.compose(this.v.set(x * UNIT, 0.05, y * UNIT), this.q, this.s.set(1, 1, 1));
    batch.ring.setMatrixAt(index, this.m);
    this.dirty.add(batch);
  }

  // Uploads everything written this frame.
  flush() {
    for (const batch of this.dirty) {
      for (const part of batch.parts) {
        for (const mesh of part.meshes) {
          mesh.instanceMatrix.needsUpdate = true;
          if (mesh.instanceColor) {
            mesh.instanceColor.needsUpdate = true;
          }
        }
      }
      batch.shadow.instanceMatrix.needsUpdate = true;
      batch.ring.instanceMatrix.needsUpdate = true;
    }
    this.dirty.clear();
  }

  clear() {
    for (const key of [...this.batches.keys()]) {
      this.dropBatch(key);
    }
    this.used.clear();
  }

  dispose() {
    this.clear();
    for (const m of this.materials) {
      m.dispose();
    }
    this.gfx.remove(this.group);
  }
}
