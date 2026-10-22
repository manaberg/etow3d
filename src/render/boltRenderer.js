import * as THREE from 'three';
import { BoltKinds } from '../entities/spells.js';

// Draws the battle armies' missiles with instancing: slingers' stones,
// archers' arrows, crossbow quarrels and the casters' bolts. Thousands fly at
// once in a great battle, so each kind is one InstancedMesh per part instead
// of a mesh per missile. Missiles write their pose every frame (write) and
// the renderer uploads them all in one go (flush); a kind's meshes grow when
// more of it fly than they hold.

const KINDS = ['stone', 'arrow', 'quarrel', 'missile2', 'runebolt', 'sunbolt', 'moonbolt'];
const START = 256;

function lambert(color) {
  return new THREE.MeshLambertMaterial({ color });
}

// The parts of a kind: geometry, material and offset along the flight (+x).
function partsOf(kind) {
  const spec = BoltKinds[kind];
  if (spec.rock) {
    return [{ geometry: new THREE.DodecahedronGeometry(0.22), material: lambert(0x8a8078) }];
  }
  if (spec.arrow) {
    return [
      { geometry: new THREE.CylinderGeometry(0.025, 0.025, 0.9, 5).rotateZ(Math.PI / 2), material: lambert(spec.arrow) },
      { geometry: new THREE.ConeGeometry(0.06, 0.18, 4).rotateZ(-Math.PI / 2).translate(0.52, 0, 0), material: lambert(0x9aa0aa) },
      { geometry: new THREE.BoxGeometry(0.2, 0.12, 0.01).translate(-0.38, 0, 0), material: lambert(0xe8e0d0) }
    ];
  }
  // a glowing orb: a bright core in a soft halo
  return [
    { geometry: new THREE.IcosahedronGeometry(spec.radius, 1), material: new THREE.MeshBasicMaterial({ color: spec.color }) },
    {
      geometry: new THREE.IcosahedronGeometry(spec.radius * 2.6, 1),
      material: new THREE.MeshBasicMaterial({ color: spec.color, transparent: true, opacity: 0.3, blending: THREE.AdditiveBlending, depthWrite: false })
    }
  ];
}

export class BoltRenderer {
  constructor(gfx) {
    this.gfx = gfx;
    this.group = new THREE.Group();
    gfx.add(this.group);
    this.kinds = new Map();
    for (const kind of KINDS) {
      const parts = partsOf(kind);
      this.kinds.set(kind, { parts, meshes: [], capacity: 0, count: 0 });
    }
    this.m = new THREE.Matrix4();
    this.q = new THREE.Quaternion();
    this.e = new THREE.Euler(0, 0, 0, 'YXZ');
    this.v = new THREE.Vector3();
    this.one = new THREE.Vector3(1, 1, 1);
  }

  // Whether a kind of missile is drawn here.
  draws(kind) {
    return this.kinds.has(kind);
  }

  grow(entry, need) {
    let capacity = Math.max(START, entry.capacity);
    while (capacity < need) {
      capacity *= 2;
    }
    const old = entry.meshes;
    entry.meshes = entry.parts.map((part, i) => {
      const mesh = new THREE.InstancedMesh(part.geometry, part.material, capacity);
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      mesh.frustumCulled = false;
      mesh.count = 0;
      if (old[i]) {
        mesh.instanceMatrix.array.set(old[i].instanceMatrix.array.subarray(0, entry.count * 16));
        this.group.remove(old[i]);
        old[i].dispose();
      }
      this.group.add(mesh);
      return mesh;
    });
    entry.capacity = capacity;
  }

  // One missile's pose this frame: position (3D units), heading and spin.
  write(kind, x, y, z, heading, spin) {
    const entry = this.kinds.get(kind);
    if (entry.count >= entry.capacity) {
      this.grow(entry, entry.count + 1);
    }
    this.e.set(spin, heading, 0);
    this.q.setFromEuler(this.e);
    this.m.compose(this.v.set(x, y, z), this.q, this.one);
    for (const mesh of entry.meshes) {
      mesh.setMatrixAt(entry.count, this.m);
    }
    entry.count++;
  }

  // Uploads this frame's missiles and starts the next frame empty.
  flush() {
    for (const entry of this.kinds.values()) {
      for (const mesh of entry.meshes) {
        mesh.count = entry.count;
        mesh.instanceMatrix.needsUpdate = true;
      }
      entry.count = 0;
    }
  }

  dispose() {
    for (const entry of this.kinds.values()) {
      for (const mesh of entry.meshes) {
        mesh.dispose();
      }
      for (const part of entry.parts) {
        part.geometry.dispose();
        part.material.dispose();
      }
    }
    this.gfx.remove(this.group);
  }
}
