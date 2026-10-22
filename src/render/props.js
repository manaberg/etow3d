import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

// Dungeon props, pillars and light fixtures for the floor looks
// (world/looks.js), built from primitives. Each kind is baked once into one
// geometry with vertex colours (plus one for its glowing parts), so every
// copy on a floor draws in a single instanced call. A prop stands on the
// floor at its origin facing +z; `mount: 'wall'` props hang on a wall face
// at their origin. Fixtures say where their light and their halos sit.

const tmpM = new THREE.Matrix4();
const tmpQ = new THREE.Quaternion();
const tmpE = new THREE.Euler();
const tmpP = new THREE.Vector3();
const tmpS = new THREE.Vector3();
const tmpC = new THREE.Color();

class Kit {
  constructor() {
    this.solid = [];
    this.glow = [];
    this.halos = [];
    this.light = null;
  }

  put(geometry, color, at = [0, 0, 0], o = {}) {
    const g = geometry.index ? geometry.toNonIndexed() : geometry;
    if (g !== geometry) {
      geometry.dispose();
    }
    tmpE.set(...(o.r || [0, 0, 0]));
    tmpQ.setFromEuler(tmpE);
    tmpS.set(...(o.s || [1, 1, 1]));
    tmpM.compose(tmpP.set(...at), tmpQ, tmpS);
    g.applyMatrix4(tmpM);
    const n = g.attributes.position.count;
    const col = new Float32Array(n * 3);
    tmpC.setHex(color);
    for (let i = 0; i < n; i++) {
      col[i * 3] = tmpC.r;
      col[i * 3 + 1] = tmpC.g;
      col[i * 3 + 2] = tmpC.b;
    }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    (o.glow ? this.glow : this.solid).push(g);
    return this;
  }

  box(w, h, d, color, at, o) {
    return this.put(new THREE.BoxGeometry(w, h, d), color, at, o);
  }

  cyl(rt, rb, h, color, at, o, seg = 10) {
    return this.put(new THREE.CylinderGeometry(rt, rb, h, seg), color, at, o);
  }

  cone(r, h, color, at, o, seg = 8) {
    return this.put(new THREE.ConeGeometry(r, h, seg), color, at, o);
  }

  ball(r, color, at, o, seg = 8) {
    return this.put(new THREE.SphereGeometry(r, seg, Math.max(4, Math.round(seg * 0.7))), color, at, o);
  }

  ring(r, tube, color, at, o, arc = Math.PI * 2, seg = 12) {
    return this.put(new THREE.TorusGeometry(r, tube, 5, seg, arc), color, at, o);
  }

  rock(r, color, at, o) {
    return this.put(new THREE.DodecahedronGeometry(r, 0), color, at, o);
  }

  gem(r, color, at, o) {
    return this.put(new THREE.OctahedronGeometry(r, 0), color, at, o);
  }

  // A soft additive glow around a flame or crystal (drawn as a point).
  halo(x, y, z, size, color) {
    this.halos.push({ x, y, z, size, color });
    return this;
  }

  bake() {
    const merge = (list) => {
      if (list.length === 0) {
        return null;
      }
      const g = mergeGeometries(list);
      for (const part of list) {
        part.dispose();
      }
      g.computeBoundingSphere();
      return g;
    };
    return { solid: merge(this.solid), glow: merge(this.glow), halos: this.halos, light: this.light };
  }
}

const R = (a, b) => a + Math.random() * (b - a);

// ------------------------------------------------------------ colours

const WOOD = 0x6a4a2a;
const DARK_WOOD = 0x3e2a18;
const IRON = 0x3a3a3e;
const STONE = 0x7a7670;
const BONE = 0xd8cfb4;
const GOLD = 0xd0a038;
const FLAME_CORE = 0xffe090;

function flames(k, x, y, z, color, scale = 1) {
  k.cone(0.13 * scale, 0.42 * scale, color, [x, y + 0.21 * scale, z], { glow: true }, 7);
  k.cone(0.07 * scale, 0.26 * scale, FLAME_CORE, [x, y + 0.15 * scale, z + 0.02], { glow: true }, 6);
}

function skull(k, x, y, z, s = 1, color = BONE, rot = 0) {
  k.ball(0.17 * s, color, [x, y + 0.17 * s, z], { s: [1, 0.95, 1.1] }, 7);
  k.box(0.2 * s, 0.1 * s, 0.14 * s, color, [x, y + 0.05 * s, z + 0.08 * s], { r: [0, rot, 0] });
  k.box(0.07 * s, 0.07 * s, 0.04 * s, 0x1a1612, [x - 0.06 * s, y + 0.18 * s, z + 0.17 * s]);
  k.box(0.07 * s, 0.07 * s, 0.04 * s, 0x1a1612, [x + 0.06 * s, y + 0.18 * s, z + 0.17 * s]);
}

function bone(k, x, z, len, a, color = BONE, y = 0.06) {
  const dx = Math.cos(a) * len / 2;
  const dz = Math.sin(a) * len / 2;
  k.cyl(0.05, 0.05, len, color, [x, y, z], { r: [0, -a, Math.PI / 2] }, 5);
  for (const s of [-1, 1]) {
    k.ball(0.075, color, [x + dx * s, y, z + dz * s], {}, 5);
  }
}

// ------------------------------------------------------------ light fixtures

// `light` is where its light sits (height, and how far out from the wall).
export const Fixtures = {
  torch: {
    mount: 'wall',
    build(k, o) {
      k.cyl(0.05, 0.07, 0.6, DARK_WOOD, [0, 2.2, 0.12], { r: [0.5, 0, 0] }, 6);
      k.box(0.18, 0.1, 0.14, IRON, [0, 1.98, 0.05]);
      flames(k, 0, 2.42, 0.25, o.color);
      k.halo(0, 2.62, 0.25, 1.3, o.color);
      k.light = { y: 2.6, f: 0.7 };
    }
  },
  brazier: {
    mount: 'floor',
    build(k, o) {
      for (let i = 0; i < 3; i++) {
        const a = (i / 3) * Math.PI * 2;
        k.cyl(0.04, 0.05, 1.05, IRON, [Math.cos(a) * 0.22, 0.5, Math.sin(a) * 0.22], { r: [Math.sin(a) * 0.25, 0, -Math.cos(a) * 0.25] }, 5);
      }
      k.cyl(0.48, 0.28, 0.3, 0x2c2a28, [0, 1.05, 0], {}, 10);
      k.ring(0.46, 0.04, 0x55504a, [0, 1.2, 0], { r: [Math.PI / 2, 0, 0] });
      k.ball(0.38, 0x8a2a08, [0, 1.15, 0], { s: [1, 0.3, 1], glow: true }, 8);
      flames(k, 0, 1.2, 0, o.color, 1.6);
      flames(k, 0.16, 1.18, 0.1, o.color, 1.1);
      flames(k, -0.15, 1.18, -0.08, o.color, 1.2);
      k.halo(0, 1.6, 0, 2.2, o.color);
      k.light = { y: 1.9, f: 0 };
    }
  },
  candles: {
    mount: 'floor',
    build(k, o) {
      const spots = [[0, 0, 0.55], [0.22, 0.1, 0.38], [-0.2, 0.05, 0.42], [0.08, -0.18, 0.28], [-0.1, 0.2, 0.22]];
      for (const [x, z, h] of spots) {
        k.cyl(0.055, 0.065, h, 0xe8e0c8, [x, h / 2, z], {}, 7);
        k.cone(0.045, 0.13, o.color, [x, h + 0.08, z], { glow: true }, 5);
      }
      k.cyl(0.32, 0.36, 0.03, 0xd8d0b8, [0, 0.015, 0], {}, 10);
      k.halo(0, 0.7, 0, 1.4, o.color);
      k.light = { y: 1.0, f: 0 };
    }
  },
  lantern: {
    mount: 'wall',
    build(k, o) {
      k.box(0.08, 0.08, 0.5, IRON, [0, 2.3, 0.25]);
      k.cyl(0.015, 0.015, 0.25, IRON, [0, 2.17, 0.48], {}, 4);
      k.box(0.3, 0.38, 0.3, 0x2a2420, [0, 1.85, 0.48]);
      k.box(0.24, 0.3, 0.32, o.color, [0, 1.85, 0.48], { glow: true });
      k.box(0.32, 0.3, 0.24, o.color, [0, 1.85, 0.48], { glow: true });
      k.cone(0.22, 0.14, 0x2a2420, [0, 2.11, 0.48], {}, 4);
      k.halo(0, 1.85, 0.48, 1.4, o.color);
      k.light = { y: 1.9, f: 0.8 };
    }
  },
  crystal: {
    mount: 'wall',
    build(k, o) {
      k.rock(0.32, 0x2a2630, [0, 1.6, 0.12], { s: [1, 0.7, 0.6] });
      k.gem(0.3, o.color, [0, 2.0, 0.25], { s: [0.5, 1.5, 0.5], glow: true });
      k.gem(0.2, o.color, [-0.2, 1.85, 0.22], { s: [0.5, 1.4, 0.5], r: [0, 0, 0.5], glow: true });
      k.gem(0.18, o.color, [0.2, 1.82, 0.24], { s: [0.5, 1.3, 0.5], r: [0, 0, -0.5], glow: true });
      k.halo(0, 1.95, 0.3, 1.8, o.color);
      k.light = { y: 2.0, f: 0.8 };
    }
  },
  vent: {
    mount: 'floor',
    build(k, o) {
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2 + R(-0.2, 0.2);
        k.rock(R(0.2, 0.3), 0x2a2220, [Math.cos(a) * 0.45, 0.1, Math.sin(a) * 0.45], { s: [1, 0.6, 1] });
      }
      k.cyl(0.36, 0.36, 0.04, o.color, [0, 0.03, 0], { glow: true }, 10);
      flames(k, 0, 0.05, 0, o.color, 1.8);
      flames(k, 0.15, 0.05, 0.08, o.color, 1.1);
      flames(k, -0.12, 0.05, -0.1, o.color, 1.3);
      k.halo(0, 0.5, 0, 2.0, o.color);
      k.light = { y: 1.0, f: 0 };
    }
  },
  glowshroom: {
    mount: 'floor',
    build(k, o) {
      for (const [x, z, h, r] of [[0, 0, 0.8, 0.32], [0.3, 0.15, 0.5, 0.22], [-0.25, 0.2, 0.42, 0.2], [0.1, -0.28, 0.3, 0.15]]) {
        k.cyl(0.06, 0.08, h, 0xd8d0b0, [x, h / 2, z], {}, 6);
        k.ball(r, o.color, [x, h, z], { s: [1, 0.55, 1], glow: true }, 9);
      }
      k.halo(0, 0.7, 0, 1.6, o.color);
      k.light = { y: 1.0, f: 0 };
    }
  },
  stormlamp: {
    mount: 'wall',
    build(k, o) {
      k.box(0.1, 0.5, 0.1, IRON, [0, 2.0, 0.08]);
      k.box(0.08, 0.08, 0.4, IRON, [0, 2.2, 0.25]);
      k.ring(0.2, 0.025, 0x6a6a74, [0, 2.2, 0.48], { r: [Math.PI / 2, 0, 0] });
      k.ring(0.2, 0.025, 0x6a6a74, [0, 2.2, 0.48], {});
      k.ball(0.15, o.color, [0, 2.2, 0.48], { glow: true }, 10);
      k.halo(0, 2.2, 0.48, 1.6, o.color);
      k.light = { y: 2.2, f: 0.8 };
    }
  },
  cagelamp: {
    mount: 'wall',
    build(k, o) {
      k.box(0.08, 0.08, 0.45, IRON, [0, 2.4, 0.22]);
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        k.cyl(0.015, 0.015, 0.4, IRON, [Math.cos(a) * 0.17, 2.1, 0.45 + Math.sin(a) * 0.17], {}, 4);
      }
      k.cyl(0.2, 0.2, 0.04, IRON, [0, 2.3, 0.45], {}, 8);
      k.cyl(0.2, 0.2, 0.04, IRON, [0, 1.9, 0.45], {}, 8);
      flames(k, 0, 1.92, 0.45, o.color, 0.9);
      k.halo(0, 2.1, 0.45, 1.5, o.color);
      k.light = { y: 2.1, f: 0.8 };
    }
  }
};

// ------------------------------------------------------------ pillars

// Free-standing pillars, one per tagged cell (2 units across); `h` is the
// floor's wall height. Some carry a light of their own.
export const Pillars = {
  column: {
    build(k, o) {
      k.cyl(0.72, 0.82, o.h, o.color, [0, o.h / 2, 0], {}, 12);
      k.cyl(0.95, 1.0, 0.35, 0x55504a, [0, 0.17, 0], {}, 12);
      k.cyl(0.95, 0.9, 0.35, 0x55504a, [0, o.h - 0.17, 0], {}, 12);
    }
  },
  pier: {
    build(k, o) {
      k.box(1.3, o.h, 1.3, o.color, [0, o.h / 2, 0]);
      k.box(1.65, 0.4, 1.65, 0x4a4642, [0, 0.2, 0]);
      k.box(1.65, 0.32, 1.65, 0x4a4642, [0, o.h - 0.16, 0]);
    }
  },
  goldpier: {
    build(k, o) {
      k.box(1.35, o.h, 1.35, o.color, [0, o.h / 2, 0]);
      for (const y of [0.2, o.h * 0.5, o.h - 0.2]) {
        k.box(1.5, 0.26, 1.5, GOLD, [0, y, 0]);
      }
    }
  },
  stalagmite: {
    vary: true,
    build(k, o) {
      k.cone(0.85, o.h * 0.85, o.color, [0, o.h * 0.42, 0], { r: [R(-0.08, 0.08), 0, R(-0.08, 0.08)] }, 7);
      k.cone(0.45, o.h * 0.45, o.color, [0.55, o.h * 0.22, 0.3], { r: [0, 0, -0.2] }, 6);
      k.cone(0.38, o.h * 0.35, o.color, [-0.5, o.h * 0.17, -0.35], { r: [0.2, 0, 0.2] }, 6);
      k.rock(0.5, o.color, [0.1, 0.2, -0.5], { s: [1, 0.6, 1] });
    }
  },
  boulder: {
    vary: true,
    build(k, o) {
      k.rock(0.95, o.color, [0, 0.7, 0], { s: [1, 0.85, 1], r: [0.3, 0.7, 0.1] });
      k.rock(0.5, o.color, [0.6, 0.3, 0.45], { r: [0.5, 0.2, 0.9] });
      k.rock(0.35, o.color, [-0.6, 0.22, 0.4], {});
    }
  },
  furnace: {
    build(k, o) {
      k.box(1.8, 1.9, 1.8, 0x5a3a2c, [0, 0.95, 0]);
      k.box(1.95, 0.25, 1.95, 0x2a2420, [0, 1.95, 0]);
      k.box(0.9, Math.max(0.6, o.h - 1.9), 0.9, 0x4a3026, [0, 1.9 + Math.max(0.6, o.h - 1.9) / 2, -0.2]);
      k.box(1.0, 0.75, 0.1, 0x1a1210, [0, 0.62, 0.9]);
      k.box(0.8, 0.55, 0.12, 0xffa030, [0, 0.58, 0.92], { glow: true });
      k.box(0.5, 0.3, 0.13, 0xffe080, [0, 0.5, 0.93], { glow: true });
      k.halo(0, 0.7, 1.1, 2.2, 0xff8a30);
      k.light = { y: 1.0, f: 1.4, color: 0xff7a20 };
    }
  },
  obelisk: {
    build(k, o) {
      k.box(1.5, 0.3, 1.5, 0x18161e, [0, 0.15, 0]);
      k.cyl(0.42, 0.72, o.h - 0.6, 0x7a7090, [0, 0.3 + (o.h - 0.6) / 2, 0], { r: [0, Math.PI / 4, 0] }, 4);
      k.cone(0.42, 0.6, 0x7a7090, [0, o.h, 0], { r: [0, Math.PI / 4, 0] }, 4);
      k.cyl(0.66, 0.68, 0.14, 0xa070ff, [0, 1.3, 0], { r: [0, Math.PI / 4, 0], glow: true }, 4);
      k.cyl(0.55, 0.57, 0.1, 0xa070ff, [0, 2.2, 0], { r: [0, Math.PI / 4, 0], glow: true }, 4);
    }
  },
  icecolumn: {
    build(k, o) {
      k.cyl(0.7, 0.8, o.h, o.color, [0, o.h / 2, 0], {}, 7);
      k.cyl(0.9, 1.0, 0.3, 0xe8f4ff, [0, 0.15, 0], {}, 7);
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * Math.PI * 2;
        k.cone(0.1, R(0.4, 0.9), 0xe8f8ff, [Math.cos(a) * 0.75, o.h - 0.4, Math.sin(a) * 0.75], { r: [Math.PI, 0, 0] }, 5);
      }
      k.cyl(0.85, 0.8, 0.25, 0xf4faff, [0, o.h - 0.1, 0], {}, 7);
    }
  },
  rod: {
    build(k, o) {
      k.cyl(0.5, 0.6, 0.3, IRON, [0, 0.15, 0], {}, 8);
      k.cyl(0.1, 0.14, o.h + 0.6, 0x6a6a74, [0, (o.h + 0.6) / 2, 0], {}, 8);
      for (const y of [1.2, 2.0, 2.8]) {
        k.ring(0.25, 0.04, 0xb08a40, [0, y, 0], { r: [Math.PI / 2, 0, 0] });
      }
      k.ball(0.3, 0xc0e0ff, [0, o.h + 0.7, 0], { glow: true }, 10);
      k.halo(0, o.h + 0.7, 0, 2.0, 0x9ac8ff);
      k.light = { y: o.h + 0.6, f: 0, color: 0x9ac8ff, power: 0.6 };
    }
  },
  mushroom: {
    vary: true,
    build(k) {
      const h = R(1.9, 2.6);
      k.cyl(0.32, 0.48, h, 0xcfc4a0, [0, h / 2, 0], { r: [R(-0.08, 0.08), 0, R(-0.08, 0.08)] }, 9);
      k.ball(1.25, 0x6a3a7a, [0, h, 0], { s: [1, 0.42, 1] }, 12);
      k.cyl(1.15, 0.6, 0.12, 0x9aff6a, [0, h - 0.18, 0], { glow: true }, 12);
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        k.ball(0.13, 0xe8e0ff, [Math.cos(a) * 0.7, h + 0.3, Math.sin(a) * 0.7], { s: [1, 0.5, 1] }, 6);
      }
      k.halo(0, h - 0.4, 0, 2.4, 0x9aff6a);
      k.light = { y: h - 0.5, f: 0, color: 0x9aff6a, power: 0.7 };
    }
  },
  monolith: {
    build(k, o) {
      k.box(1.3, 0.3, 0.9, 0x141218, [0, 0.15, 0]);
      k.box(1.0, o.h * 0.85, 0.55, o.color, [0, 0.3 + o.h * 0.42, 0], { r: [0, 0, R(-0.06, 0.06)] });
      k.box(0.12, 1.2, 0.58, 0xc070ff, [0, 1.6, 0], { glow: true });
    }
  },
  broken: {
    vary: true,
    build(k, o) {
      const h = R(1.0, 1.9);
      k.cyl(0.72, 0.82, h, o.color, [0, h / 2, 0], {}, 10);
      k.cone(0.72, 0.5, o.color, [0.1, h + 0.1, 0], { r: [0.35, 0, -0.3] }, 10);
      k.cyl(0.95, 1.0, 0.35, 0x55504a, [0, 0.17, 0], {}, 10);
      k.cyl(0.6, 0.6, 0.7, o.color, [0.75, 0.4, 0.7], { r: [Math.PI / 2, 0.6, 0] }, 10);
    }
  },
  goldpile: {
    build(k) {
      k.cone(1.0, 1.2, GOLD, [0, 0.6, 0], {}, 10);
      k.cone(0.6, 0.7, 0xe0b448, [0.55, 0.35, 0.45], {}, 8);
      k.cone(0.5, 0.5, 0xc89a30, [-0.6, 0.25, -0.3], {}, 8);
      for (let i = 0; i < 8; i++) {
        const a = Math.random() * Math.PI * 2;
        k.cyl(0.1, 0.1, 0.03, 0xf0c860, [Math.cos(a) * R(0.9, 1.1), 0.02, Math.sin(a) * R(0.9, 1.1)], { r: [R(-0.3, 0.3), 0, R(-0.3, 0.3)] }, 8);
      }
      k.gem(0.12, 0xff3050, [0.2, 1.05, 0.2], { glow: true });
    }
  },
  shelf: {
    build(k) {
      k.box(2.0, 2.7, 0.9, DARK_WOOD, [0, 1.35, 0]);
      const colors = [0x7a1e24, 0x1e3a6a, 0x2a5a2e, 0x6a4a1e, 0x4a2a5a, 0x8a6a2a];
      for (let row = 0; row < 3; row++) {
        for (const side of [-1, 1]) {
          let x = -0.88;
          while (x < 0.82) {
            const w = R(0.1, 0.2);
            const h = R(0.45, 0.62);
            k.box(w - 0.02, h, 0.36, colors[Math.floor(Math.random() * colors.length)], [x + w / 2, 0.4 + row * 0.8 + h / 2, side * 0.27]);
            x += w;
          }
        }
        k.box(2.0, 0.06, 0.92, 0x5a3a22, [0, 0.35 + row * 0.8, 0]);
      }
    }
  }
};

// ------------------------------------------------------------ props

export const Props = {
  banner: {
    mount: 'wall',
    build(k, o) {
      const cloth = o.color || 0x2a4a8a;
      k.cyl(0.04, 0.04, 1.2, GOLD, [0, 3.0, 0.12], { r: [0, 0, Math.PI / 2] }, 6);
      k.box(0.95, 1.7, 0.04, cloth, [0, 2.15, 0.1]);
      k.box(0.95, 0.12, 0.05, GOLD, [0, 1.32, 0.11]);
      k.cone(0.12, 0.25, cloth, [-0.3, 1.2, 0.1], { r: [Math.PI, 0, 0] }, 4);
      k.cone(0.12, 0.25, cloth, [0.3, 1.2, 0.1], { r: [Math.PI, 0, 0] }, 4);
      if (o.sigil) {
        skull(k, 0, 2.15, 0.12, 1.4, 0xe8dcc0);
      } else {
        k.box(0.36, 0.36, 0.05, GOLD, [0, 2.3, 0.12], { r: [0, 0, Math.PI / 4] });
      }
    }
  },
  barrel: {
    mount: 'floor',
    build(k) {
      k.cyl(0.4, 0.36, 0.95, WOOD, [0, 0.475, 0], {}, 12);
      k.cyl(0.42, 0.42, 0.06, IRON, [0, 0.2, 0], {}, 12);
      k.cyl(0.42, 0.42, 0.06, IRON, [0, 0.75, 0], {}, 12);
      k.cyl(0.36, 0.36, 0.02, DARK_WOOD, [0, 0.96, 0], {}, 12);
    }
  },
  crate: {
    mount: 'floor',
    build(k) {
      k.box(1.0, 1.0, 1.0, WOOD, [0, 0.5, 0]);
      for (const y of [0.05, 0.95]) {
        k.box(1.04, 0.1, 1.04, DARK_WOOD, [0, y, 0]);
      }
      k.box(0.1, 1.3, 1.04, DARK_WOOD, [0, 0.5, 0], { r: [0, 0, 0.78] });
    }
  },
  beam: {
    mount: 'wall',
    build(k, o) {
      const h = o.h * 0.95;
      k.box(0.3, h, 0.3, DARK_WOOD, [0, h / 2, 0.17]);
      k.box(0.24, 0.24, 1.0, DARK_WOOD, [0, h - 0.2, 0.55]);
      k.box(0.18, 0.9, 0.18, DARK_WOOD, [0, h - 0.6, 0.4], { r: [0.75, 0, 0] });
    }
  },
  roots: {
    mount: 'wall',
    vary: true,
    build(k, o) {
      for (let i = 0; i < 4; i++) {
        const x = R(-0.7, 0.7);
        const len = R(0.8, 1.8);
        k.cyl(0.025, 0.06, len, 0x4a3420, [x, o.h - len / 2, 0.06], { r: [R(-0.15, 0.15), 0, R(-0.25, 0.25)] }, 5);
      }
    }
  },
  mound: {
    mount: 'floor',
    build(k, o) {
      k.ball(0.75, o.tint || 0x5a4430, [0, 0, 0], { s: [1, 0.45, 0.85] }, 10);
      k.rock(0.18, 0x6a5a48, [0.5, 0.1, 0.35], {});
      k.rock(0.12, 0x4a3a2a, [-0.45, 0.07, 0.4], {});
    }
  },
  wallrocks: {
    mount: 'floor',
    vary: true,
    build(k, o) {
      const c = o.color || STONE;
      k.rock(R(0.45, 0.65), c, [R(-0.2, 0.2), 0.25, -0.35], { s: [1.2, 0.8, 0.9], r: [R(0, 3), R(0, 3), 0] });
      k.rock(R(0.25, 0.4), c, [R(0.3, 0.6), 0.15, R(-0.1, 0.2)], { r: [R(0, 3), R(0, 3), 0] });
      if (Math.random() < 0.6) {
        k.rock(R(0.15, 0.25), c, [R(-0.6, -0.3), 0.1, R(0, 0.3)], {});
      }
    }
  },
  ashmound: {
    mount: 'floor',
    build(k) {
      k.ball(0.85, 0x8a8682, [0, 0, 0], { s: [1, 0.4, 0.8] }, 10);
      k.ball(0.45, 0x9a9692, [0.5, 0, -0.3], { s: [1, 0.5, 1] }, 8);
      k.cyl(0.04, 0.05, 0.5, 0x2a2420, [-0.2, 0.3, 0.2], { r: [0.4, 0, 0.6] }, 5);
    }
  },
  snowdrift: {
    mount: 'floor',
    build(k) {
      k.ball(0.85, 0xf0f8ff, [0, 0, 0], { s: [1, 0.45, 0.75] }, 10);
      k.ball(0.5, 0xe8f4ff, [0.55, 0, 0.2], { s: [1, 0.5, 1] }, 8);
    }
  },
  mushrooms: {
    mount: 'floor',
    vary: true,
    build(k) {
      const caps = [0xb03020, 0xd8c8a0, 0x8a6a4a];
      for (let i = 0; i < 5; i++) {
        const x = R(-0.4, 0.4);
        const z = R(-0.3, 0.3);
        const h = R(0.15, 0.45);
        k.cyl(0.03, 0.04, h, 0xe0d8c0, [x, h / 2, z], {}, 5);
        k.ball(R(0.08, 0.16), caps[i % 3], [x, h, z], { s: [1, 0.5, 1] }, 7);
      }
    }
  },
  bones: {
    mount: 'floor',
    vary: true,
    build(k) {
      for (let i = 0; i < 3; i++) {
        bone(k, R(-0.5, 0.5), R(-0.4, 0.4), R(0.4, 0.75), Math.random() * Math.PI);
      }
      if (Math.random() < 0.7) {
        skull(k, R(-0.3, 0.3), 0, R(-0.3, 0.3), 1, BONE);
      }
    }
  },
  bigbone: {
    mount: 'floor',
    build(k) {
      const a = R(0, Math.PI);
      k.cyl(0.18, 0.18, 2.6, BONE, [0, 0.2, 0], { r: [0, -a, Math.PI / 2] }, 8);
      for (const s of [-1, 1]) {
        for (const off of [-0.18, 0.18]) {
          k.ball(0.28, BONE, [Math.cos(a) * 1.3 * s + Math.sin(a) * off, 0.22, Math.sin(a) * 1.3 * s - Math.cos(a) * off], {}, 8);
        }
      }
    }
  },
  skulls: {
    mount: 'floor',
    build(k) {
      const spots = [[0, 0, 0], [0.32, 0, 0.1], [-0.3, 0, 0.12], [0.1, 0, -0.28], [-0.15, 0, -0.22], [0.05, 0.3, 0], [0.2, 0.28, -0.1], [-0.12, 0.3, -0.05], [0.04, 0.56, -0.04]];
      for (const [x, y, z] of spots) {
        skull(k, x, y, z, 1, BONE);
      }
      bone(k, 0.3, 0.4, 0.6, 0.4);
    }
  },
  sarcophagus: {
    mount: 'floor',
    build(k, o) {
      k.box(1.0, 0.75, 2.0, STONE, [0, 0.375, 0]);
      k.box(1.12, 0.14, 2.12, 0x8a8680, [0, 0.82, 0]);
      k.box(0.55, 0.2, 1.4, 0x9a968e, [0, 0.98, 0.05]);
      k.ball(0.22, 0x9a968e, [0, 1.02, -0.7], {}, 8);
      if (o.crown) {
        k.ring(0.17, 0.04, GOLD, [0, 1.16, -0.7], { r: [Math.PI / 2, 0, 0] });
        for (let i = 0; i < 5; i++) {
          const a = (i / 5) * Math.PI * 2;
          k.cone(0.04, 0.12, GOLD, [Math.cos(a) * 0.17, 1.24, -0.7 + Math.sin(a) * 0.17], {}, 4);
        }
      }
    }
  },
  urn: {
    mount: 'floor',
    build(k) {
      k.ball(0.3, 0x7a6a5a, [0, 0.35, 0], { s: [1, 1.15, 1] }, 10);
      k.cyl(0.13, 0.18, 0.2, 0x6a5a4a, [0, 0.72, 0], {}, 10);
      k.ring(0.15, 0.035, 0x8a7a6a, [0, 0.82, 0], { r: [Math.PI / 2, 0, 0] });
      k.cyl(0.18, 0.2, 0.06, 0x5a4a3a, [0, 0.03, 0], {}, 10);
    }
  },
  books: {
    mount: 'floor',
    vary: true,
    build(k) {
      const colors = [0x7a1e24, 0x1e3a6a, 0x2a5a2e, 0x6a4a1e, 0x4a2a5a];
      let y = 0;
      for (let i = 0; i < 4; i++) {
        const h = R(0.07, 0.12);
        k.box(R(0.35, 0.5), h, R(0.45, 0.6), colors[i % colors.length], [R(-0.05, 0.05), y + h / 2, 0], { r: [0, R(-0.4, 0.4), 0] });
        y += h;
      }
      k.box(0.32, 0.03, 0.44, 0xe8dcc0, [0.45, 0.02, 0.3], { r: [0, 0.3, 0.12] });
      k.box(0.32, 0.03, 0.44, 0xe8dcc0, [0.75, 0.02, 0.38], { r: [0, 0.3, -0.12] });
    }
  },
  lectern: {
    mount: 'floor',
    build(k) {
      k.box(0.5, 0.08, 0.5, DARK_WOOD, [0, 0.04, 0]);
      k.box(0.14, 1.0, 0.14, DARK_WOOD, [0, 0.5, 0]);
      k.box(0.6, 0.06, 0.45, DARK_WOOD, [0, 1.05, 0.05], { r: [0.4, 0, 0] });
      k.box(0.5, 0.03, 0.36, 0xe8dcc0, [0, 1.1, 0.06], { r: [0.4, 0, 0] });
    }
  },
  rack: {
    mount: 'floor',
    build(k) {
      for (const x of [-0.6, 0.6]) {
        k.box(0.1, 1.6, 0.1, DARK_WOOD, [x, 0.8, 0]);
      }
      k.box(1.3, 0.08, 0.1, DARK_WOOD, [0, 1.4, 0]);
      k.box(1.3, 0.08, 0.1, DARK_WOOD, [0, 0.35, 0]);
      for (let i = 0; i < 4; i++) {
        const x = -0.45 + i * 0.3;
        k.cyl(0.025, 0.025, 1.9, 0x7a5a3a, [x, 0.95, 0.06], { r: [0.08, 0, 0] }, 5);
        k.cone(0.05, 0.22, 0xb0b0b8, [x, 1.98, 0.14], {}, 5);
      }
    }
  },
  dummy: {
    mount: 'floor',
    build(k) {
      k.cyl(0.4, 0.45, 0.12, DARK_WOOD, [0, 0.06, 0], {}, 8);
      k.cyl(0.06, 0.06, 1.6, DARK_WOOD, [0, 0.8, 0], {}, 6);
      k.cyl(0.28, 0.24, 0.8, 0xb8a070, [0, 1.25, 0], {}, 8);
      k.box(1.1, 0.08, 0.08, DARK_WOOD, [0, 1.5, 0]);
      k.ball(0.18, 0xc8b080, [0, 1.85, 0], {}, 8);
      k.box(0.24, 0.24, 0.05, 0x8a2020, [0, 1.25, 0.25]);
    }
  },
  shields: {
    mount: 'floor',
    build(k) {
      const colors = [0x8a1a1a, 0x2a3a6a, 0x6a5a2a];
      for (let i = 0; i < 3; i++) {
        const x = -0.4 + i * 0.4;
        k.cyl(0.32, 0.32, 0.06, colors[i], [x, 0.36, -0.15 + i * 0.05], { r: [Math.PI / 2 - 0.2, 0, 0] }, 12);
        k.ball(0.08, 0xb0a070, [x, 0.36, -0.1 + i * 0.05], {}, 6);
      }
    }
  },
  anvil: {
    mount: 'floor',
    build(k) {
      k.box(0.6, 0.55, 0.5, 0x3a2a20, [0, 0.275, 0]);
      k.box(0.5, 0.25, 0.3, IRON, [0, 0.67, 0]);
      k.box(0.9, 0.2, 0.36, IRON, [0, 0.88, 0]);
      k.cone(0.15, 0.4, IRON, [0.62, 0.88, 0], { r: [0, 0, -Math.PI / 2] }, 6);
      k.cyl(0.03, 0.03, 0.5, DARK_WOOD, [-0.1, 1.02, 0.1], { r: [0, 0.5, Math.PI / 2] }, 5);
      k.box(0.16, 0.1, 0.1, 0x55555a, [-0.32, 1.02, -0.02], { r: [0, 0.5, 0] });
    }
  },
  chains: {
    mount: 'wall',
    vary: true,
    build(k, o) {
      for (const x of [-0.35, 0.3]) {
        const links = Math.floor(R(5, 9));
        for (let i = 0; i < links; i++) {
          k.ring(0.07, 0.022, 0x4a4a50, [x, o.h - 0.15 - i * 0.16, 0.12], { r: [0, (i % 2) * Math.PI / 2, 0] });
        }
      }
    }
  },
  ore: {
    mount: 'floor',
    vary: true,
    build(k) {
      for (let i = 0; i < 7; i++) {
        k.rock(R(0.15, 0.3), 0x3a3634, [R(-0.4, 0.4), R(0.1, 0.35), R(-0.35, 0.35)], { r: [R(0, 3), R(0, 3), 0] });
      }
      for (let i = 0; i < 4; i++) {
        k.rock(0.08, 0xff7a20, [R(-0.35, 0.35), R(0.15, 0.4), R(-0.3, 0.3)], { glow: true });
      }
    }
  },
  spikes: {
    mount: 'floor',
    vary: true,
    build(k) {
      for (let i = 0; i < 5; i++) {
        const x = R(-0.5, 0.5);
        const z = R(-0.4, 0.4);
        const h = R(0.6, 1.1);
        k.cone(0.07, h, 0x3a3436, [x, h / 2, z], { r: [R(-0.2, 0.2), 0, R(-0.2, 0.2)] }, 5);
        k.cone(0.03, 0.15, 0x8a1010, [x, h - 0.05, z], {}, 4);
      }
    }
  },
  cage: {
    mount: 'floor',
    build(k) {
      for (let i = 0; i < 10; i++) {
        const a = (i / 10) * Math.PI * 2;
        k.cyl(0.02, 0.02, 1.6, IRON, [Math.cos(a) * 0.5, 0.8, Math.sin(a) * 0.5], {}, 4);
      }
      k.ring(0.5, 0.04, IRON, [0, 0.05, 0], { r: [Math.PI / 2, 0, 0] });
      k.ring(0.5, 0.04, IRON, [0, 1.6, 0], { r: [Math.PI / 2, 0, 0] });
      k.ball(0.5, IRON, [0, 1.6, 0], { s: [1, 0.4, 1] }, 10);
      skull(k, 0.1, 0, 0.1, 1, BONE);
      bone(k, -0.1, -0.1, 0.5, 0.8);
    }
  },
  pike: {
    mount: 'floor',
    build(k) {
      k.cyl(0.035, 0.04, 2.3, DARK_WOOD, [0, 1.15, 0], {}, 5);
      skull(k, 0, 2.2, 0, 1.2, BONE);
      k.box(0.3, 0.3, 0.3, 0x3a2a20, [0, 0.15, 0]);
    }
  },
  hooded: {
    mount: 'floor',
    build(k) {
      k.box(1.0, 0.4, 1.0, 0x2a2630, [0, 0.2, 0]);
      k.cone(0.55, 2.0, 0x4a4652, [0, 1.4, 0], {}, 9);
      k.ball(0.32, 0x4a4652, [0, 2.4, 0.02], { s: [1, 1.15, 1] }, 9);
      k.cone(0.3, 0.45, 0x4a4652, [0, 2.75, -0.08], { r: [-0.4, 0, 0] }, 8);
      k.ball(0.05, 0xb080ff, [-0.1, 2.38, 0.27], { glow: true }, 5);
      k.ball(0.05, 0xb080ff, [0.1, 2.38, 0.27], { glow: true }, 5);
    }
  },
  statue: {
    mount: 'floor',
    build(k, o) {
      const c = o.tint || 0x8a8680;
      k.box(1.2, 0.45, 1.0, 0x5a5650, [0, 0.225, 0]);
      for (const x of [-0.22, 0.22]) {
        k.box(0.28, 0.9, 0.32, c, [x, 0.9, 0]);
      }
      k.box(0.9, 0.95, 0.5, c, [0, 1.8, 0]);
      k.ball(0.28, c, [0, 2.5, 0.02], {}, 9);
      k.box(0.3, 0.12, 0.2, c, [0, 2.4, 0.22]);
      for (const x of [-0.55, 0.55]) {
        k.box(0.24, 0.85, 0.26, c, [x, 1.75, 0.08], { r: [-0.25, 0, 0] });
      }
      k.cyl(0.04, 0.04, 1.6, c, [0.62, 1.6, 0.35], {}, 5);
      k.box(0.08, 0.5, 0.45, c, [0.62, 2.25, 0.5]);
    }
  },
  bust: {
    mount: 'floor',
    build(k) {
      k.box(0.55, 0.9, 0.55, 0x3a3430, [0, 0.45, 0]);
      k.box(0.65, 0.08, 0.65, 0x2a2420, [0, 0.92, 0]);
      k.box(0.55, 0.3, 0.3, 0x5a524a, [0, 1.1, 0]);
      k.ball(0.2, 0x5a524a, [0, 1.42, 0], {}, 8);
    }
  },
  frame: {
    mount: 'wall',
    build(k) {
      k.box(1.2, 0.9, 0.04, 0x1a1210, [0, 2.0, 0.06]);
      for (const [w, h, x, y] of [[1.36, 0.1, 0, 2.5], [1.36, 0.1, 0, 1.5], [0.1, 1.1, -0.63, 2.0], [0.1, 1.1, 0.63, 2.0]]) {
        k.box(w, h, 0.08, 0x5a4420, [x, y, 0.08]);
      }
      k.box(0.6, 0.3, 0.05, 0x3a2418, [-0.15, 2.05, 0.09], { r: [0, 0, 0.3] });
    }
  },
  cinders: {
    mount: 'floor',
    vary: true,
    build(k) {
      for (let i = 0; i < 6; i++) {
        k.rock(R(0.1, 0.22), 0x1a1412, [R(-0.4, 0.4), 0.06, R(-0.35, 0.35)], { s: [1, 0.5, 1], r: [0, R(0, 3), 0] });
      }
      for (let i = 0; i < 5; i++) {
        k.rock(R(0.05, 0.1), 0xff5a10, [R(-0.35, 0.35), 0.08, R(-0.3, 0.3)], { glow: true });
      }
      k.halo(0, 0.2, 0, 0.9, 0xff5010);
    }
  },
  icicles: {
    mount: 'wall',
    vary: true,
    build(k, o) {
      for (let i = 0; i < 5; i++) {
        const len = R(0.3, 1.3);
        k.cone(R(0.06, 0.12), len, 0xe0f4ff, [R(-0.85, 0.85), o.h - len / 2, 0.08], { r: [Math.PI, 0, 0] }, 5);
      }
      k.box(2.0, 0.12, 0.2, 0xf4faff, [0, o.h - 0.04, 0.08]);
    }
  },
  icecrystals: {
    mount: 'floor',
    vary: true,
    build(k) {
      for (let i = 0; i < 5; i++) {
        k.gem(R(0.18, 0.32), i % 2 ? 0xd8f0ff : 0xa8d8ff, [R(-0.35, 0.35), R(0.3, 0.6), R(-0.3, 0.3)], { s: [0.5, R(1.6, 2.6), 0.5], r: [R(-0.4, 0.4), 0, R(-0.4, 0.4)] });
      }
      k.gem(0.16, 0xc8ecff, [0, 0.5, 0], { s: [0.5, 2.2, 0.5], glow: true });
      k.halo(0, 0.5, 0, 1.0, 0x9adcff);
    }
  },
  rubble: {
    mount: 'floor',
    vary: true,
    build(k) {
      for (let i = 0; i < 7; i++) {
        const s = R(0.15, 0.4);
        k.box(s, s * 0.7, s, 0x6a6e74, [R(-0.5, 0.5), s * 0.3, R(-0.4, 0.4)], { r: [R(-0.5, 0.5), R(0, 3), R(-0.5, 0.5)] });
      }
    }
  },
  reeds: {
    mount: 'floor',
    vary: true,
    build(k) {
      for (let i = 0; i < 9; i++) {
        const x = R(-0.45, 0.45);
        const z = R(-0.35, 0.35);
        const h = R(0.8, 1.6);
        k.cone(0.03, h, i % 3 ? 0x5a6a2a : 0x7a7a3a, [x, h / 2, z], { r: [R(-0.15, 0.15), 0, R(-0.15, 0.15)] }, 4);
        if (i % 3 === 0) {
          k.cyl(0.05, 0.05, 0.22, 0x4a3020, [x, h * 0.8, z], {}, 6);
        }
      }
    }
  },
  log: {
    mount: 'floor',
    vary: true,
    build(k) {
      const a = R(0, Math.PI);
      k.cyl(0.28, 0.32, 1.9, 0x3a2a1c, [0, 0.28, 0], { r: [0, -a, Math.PI / 2] }, 9);
      k.cyl(0.29, 0.29, 0.6, 0x4a6a2a, [0, 0.32, 0], { r: [0, -a, Math.PI / 2] }, 9);
      k.ball(0.1, 0xb8a070, [0.1, 0.62, 0.05], { s: [1, 0.5, 1] }, 6);
    }
  },
  shards: {
    mount: 'floor',
    vary: true,
    build(k) {
      for (let i = 0; i < 4; i++) {
        const h = R(0.5, 1.3);
        k.cone(R(0.1, 0.22), h, 0x1a1620, [R(-0.4, 0.4), h / 2, R(-0.35, 0.35)], { r: [R(-0.3, 0.3), R(0, 3), R(-0.3, 0.3)] }, 4);
      }
    }
  },
  monolith: {
    mount: 'floor',
    build(k) {
      k.box(0.95, 2.4, 0.45, 0x1c1a22, [0, 1.2, 0], { r: [0, 0, R(-0.05, 0.05)] });
      k.box(0.1, 1.0, 0.48, 0xc070ff, [0, 1.4, 0], { glow: true });
    }
  },
  eggs: {
    mount: 'floor',
    build(k) {
      k.ring(0.55, 0.2, 0x5a4028, [0, 0.12, 0], { r: [Math.PI / 2, 0, 0], s: [1, 1, 0.7] });
      const colors = [0x8a3a2a, 0x3a6a4a, 0x4a4a7a, 0x8a7a3a];
      for (let i = 0; i < 4; i++) {
        const a = (i / 4) * Math.PI * 2 + 0.3;
        k.ball(0.22, colors[i], [Math.cos(a) * 0.22, 0.3, Math.sin(a) * 0.22], { s: [1, 1.4, 1], r: [R(-0.3, 0.3), 0, R(-0.3, 0.3)] }, 9);
      }
    }
  },
  coins: {
    mount: 'floor',
    vary: true,
    build(k) {
      k.cone(0.7, 0.6, GOLD, [0, 0.3, 0], {}, 10);
      k.cone(0.4, 0.35, 0xe0b448, [0.5, 0.17, 0.3], {}, 8);
      for (let i = 0; i < 6; i++) {
        k.cyl(0.09, 0.09, 0.025, 0xf0c860, [R(-0.8, 0.8), 0.015, R(-0.6, 0.6)], { r: [R(-0.2, 0.2), 0, R(-0.2, 0.2)] }, 8);
      }
    }
  },
  chest: {
    mount: 'floor',
    build(k) {
      k.box(1.1, 0.55, 0.7, 0x5a3418, [0, 0.275, 0]);
      k.cyl(0.35, 0.35, 1.1, 0x5a3418, [0, 0.55, 0], { r: [0, 0, Math.PI / 2], s: [1, 1, 0.6] }, 10);
      for (const x of [-0.42, 0.42]) {
        k.box(0.08, 0.6, 0.74, GOLD, [x, 0.3, 0]);
        k.ring(0.36, 0.04, GOLD, [x, 0.55, 0], { r: [0, Math.PI / 2, 0], s: [1, 0.6, 1] }, Math.PI);
      }
      k.box(0.14, 0.18, 0.06, GOLD, [0, 0.52, 0.37]);
    }
  },
  goldbars: {
    mount: 'floor',
    build(k) {
      for (let layer = 0; layer < 3; layer++) {
        for (let i = 0; i < 3 - layer; i++) {
          k.box(0.25, 0.12, 0.55, 0xe8b840, [(i - (2 - layer) / 2) * 0.28, 0.06 + layer * 0.12, 0]);
        }
      }
    }
  },
  crown: {
    mount: 'floor',
    build(k) {
      k.ring(0.18, 0.05, GOLD, [0, 0.06, 0], { r: [Math.PI / 2, 0, 0] });
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        k.cone(0.05, 0.16, GOLD, [Math.cos(a) * 0.18, 0.17, Math.sin(a) * 0.18], {}, 4);
      }
      k.gem(0.06, 0xff2040, [0, 0.08, 0.2], { glow: true });
    }
  },
  goblet: {
    mount: 'floor',
    build(k) {
      k.cyl(0.12, 0.14, 0.03, GOLD, [0, 0.015, 0], {}, 10);
      k.cyl(0.03, 0.03, 0.22, GOLD, [0, 0.13, 0], {}, 6);
      k.cyl(0.13, 0.06, 0.2, GOLD, [0, 0.33, 0], {}, 10);
      k.cyl(0.09, 0.09, 0.025, 0xf0c860, [0.35, 0.015, 0.2], {}, 8);
    }
  },
  gems: {
    mount: 'floor',
    vary: true,
    build(k) {
      const colors = [0xff3060, 0x40a0ff, 0x60ff90, 0xc060ff];
      for (let i = 0; i < 6; i++) {
        k.gem(R(0.1, 0.22), colors[i % 4], [R(-0.4, 0.4), R(0.1, 0.3), R(-0.3, 0.3)], { s: [0.7, 1.4, 0.7], r: [R(-0.5, 0.5), 0, R(-0.5, 0.5)], glow: true });
      }
      k.halo(0, 0.3, 0, 1.1, 0xc080ff);
    }
  },
  deadtree: {
    mount: 'floor',
    vary: true,
    build(k) {
      k.cyl(0.12, 0.25, 2.4, 0x2e2622, [0, 1.2, 0], { r: [R(-0.08, 0.08), 0, R(-0.08, 0.08)] }, 7);
      for (let i = 0; i < 4; i++) {
        const a = (i / 4) * Math.PI * 2 + R(-0.4, 0.4);
        const len = R(0.6, 1.1);
        const y = R(1.3, 2.2);
        k.cyl(0.03, 0.07, len, 0x2e2622, [Math.cos(a) * len * 0.35, y + len * 0.3, Math.sin(a) * len * 0.35], { r: [Math.sin(a) * 0.9, 0, -Math.cos(a) * 0.9] }, 5);
      }
      k.rock(0.35, 0x2e2622, [0, 0.1, 0], { s: [1.3, 0.4, 1.3] });
    }
  },
  giantskull: {
    mount: 'floor',
    build(k) {
      k.ball(0.85, BONE, [0, 0.85, -0.2], { s: [1.1, 0.85, 1.2] }, 12);
      k.box(1.0, 0.55, 1.1, BONE, [0, 0.45, 0.75]);
      k.box(0.9, 0.2, 1.0, 0xc8bea4, [0, 0.1, 0.8]);
      for (const x of [-0.35, 0.35]) {
        k.ball(0.22, 0x14120e, [x, 0.95, 0.5], {}, 8);
        k.cone(0.16, 1.2, 0xe8e0c8, [x * 1.6, 1.5, -0.6], { r: [-0.9, 0, x * 1.2] }, 7);
      }
      for (let i = -3; i <= 3; i++) {
        k.cone(0.05, 0.22, 0xf0e8d0, [i * 0.12, 0.25, 1.28], { r: [Math.PI, 0, 0] }, 4);
      }
    }
  }
};

// ------------------------------------------------------------ decals

// Flat things on the floor, one textured quad each (textures.js).
export const Decals = {
  rug: { tex: 'rug', size: [3.4, 2.4] },
  carpet: { tex: 'carpet', size: [2, 2], exact: true },
  pages: { tex: 'pages', size: [1.4, 1.4] },
  blood: { tex: 'blood', size: [1.6, 1.6] },
  scorch: { tex: 'scorch', size: [2.4, 2.4] },
  puddle: { tex: 'puddle', size: [2.2, 1.8], shiny: true },
  scales: { tex: 'scales', size: [1.4, 1.4] },
  circle: { tex: 'circle', size: [3.6, 3.6], glow: true }
};

// The ribs of a giant skeleton arching over the aisle between two rows of
// rib cells (DungeonGenerator 'ribcage'), with its spine along the top.
export function bakeRibcage(cage, cell) {
  const k = new Kit();
  const z0 = cage.y0 * cell + cell / 2;
  const z1 = cage.y1 * cell + cell / 2;
  const span = (z1 - z0) / 2;
  const zc = (z0 + z1) / 2;
  for (const x of cage.ribs) {
    const cx = x * cell + cell / 2;
    k.ring(span, 0.24, BONE, [cx, 0, zc], { r: [0, Math.PI / 2, 0] }, Math.PI, 16);
    k.ball(0.62, 0xc8bea4, [cx, 0.25, z0], { s: [1, 0.7, 1] }, 8);
    k.ball(0.62, 0xc8bea4, [cx, 0.25, z1], { s: [1, 0.7, 1] }, 8);
  }
  const xa = cage.ribs[0] * cell + cell / 2;
  const xb = cage.ribs[cage.ribs.length - 1] * cell + cell / 2;
  k.cyl(0.34, 0.34, xb - xa + 2.4, BONE, [(xa + xb) / 2 - 0.6, span, zc], { r: [0, 0, Math.PI / 2] }, 8);
  for (let x = xa - 1.6; x <= xb + 0.4; x += 0.9) {
    k.ball(0.4, 0xc8bea4, [x, span + 0.2, zc], { s: [0.7, 1, 1.1] }, 6);
  }
  return k.bake().solid;
}

// Bakes a prop, pillar or fixture kind (with its options) once; kinds built
// with some randomness come in a few `variant`s.
const baked = new Map();
export function bakeKind(table, kind, o, variant = 0) {
  const key = kind + '|' + variant + '|' + JSON.stringify(o);
  let out = baked.get(key);
  if (!out) {
    const def = table[kind];
    const k = new Kit();
    def.build(k, o);
    out = { ...k.bake(), mount: def.mount || 'floor' };
    baked.set(key, out);
  }
  return out;
}
