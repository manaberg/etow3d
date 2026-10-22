import { TILE } from '../core/constants.js';

// The air of a floor (world/looks.js `particles`): dust, embers, ash, snow,
// rain, spores and the like drifting around the camera, bubbles on its
// pools, sparks off its furnaces, and on stormy floors lightning that
// strikes the rods and lights up the halls.

const R = (a, b) => a + Math.random() * (b - a);
const px = (units) => units * TILE;

// One particle of each kind at (x, z) in world units, near the camera.
const Kinds = {
  dust(fx, x, z, color) {
    fx.emit(px(x), px(z), R(0.4, 3.2), { vx: R(-0.15, 0.15), vy: R(-0.06, 0.08), vz: R(-0.15, 0.15), life: R(3, 6), size: R(0.22, 0.4), color, fadeIn: 0.3 });
  },
  motes(fx, x, z, color) {
    fx.emit(px(x), px(z), R(0.5, 3), { vx: R(-0.2, 0.2), vy: R(0, 0.15), vz: R(-0.2, 0.2), life: R(3, 5), size: R(0.4, 0.7), color, fadeIn: 0.3 });
  },
  embers(fx, x, z, color) {
    fx.emit(px(x), px(z), R(0.1, 0.5), { vx: R(-0.3, 0.3), vy: R(0.6, 1.7), vz: R(-0.3, 0.3), life: R(1.8, 3.4), size: R(0.25, 0.45), color, fadeIn: 0.15 });
  },
  ash(fx, x, z, color) {
    fx.emit(px(x), px(z), R(3.5, 6.5), { vx: R(0.1, 0.45), vy: R(-0.9, -0.5), vz: R(-0.15, 0.15), life: R(6, 9), size: R(0.28, 0.42), color, fadeIn: 0.2 });
  },
  snow(fx, x, z, color) {
    fx.emit(px(x), px(z), R(4.5, 7), { vx: R(-0.3, 0.3), vy: R(-1.4, -0.9), vz: R(-0.3, 0.3), life: R(4.5, 6), size: R(0.35, 0.6), color, fadeIn: 0.15 });
  },
  rain(fx, x, z, color) {
    // a drop is a short streak of three
    const vy = R(-17, -14);
    const h = R(7, 10);
    for (let i = 0; i < 3; i++) {
      fx.emit(px(x), px(z), h + i * 0.22, { vx: -0.6, vy, vz: 0.4, life: 0.62, size: 0.26 - i * 0.05, color });
    }
  },
  spores(fx, x, z, color) {
    fx.emit(px(x), px(z), R(0.2, 1.2), { vx: R(-0.2, 0.2), vy: R(0.15, 0.45), vz: R(-0.2, 0.2), life: R(3.5, 6), size: R(0.25, 0.45), color, fadeIn: 0.3 });
  },
  wisps(fx, x, z, color) {
    fx.emit(px(x), px(z), R(0.3, 1.8), { vx: R(-0.35, 0.35), vy: R(-0.05, 0.12), vz: R(-0.35, 0.35), life: R(2.5, 4.5), size: R(1.0, 1.9), color, fadeIn: 0.45 });
  },
  glitter(fx, x, z, color) {
    fx.emit(px(x), px(z), R(0.05, 0.9), { life: R(0.25, 0.6), size: R(0.25, 0.55), color });
  },
  drips(fx, x, z, color) {
    fx.emit(px(x), px(z), R(4, 5.5), { vy: -9, life: 0.6, size: 0.22, color });
  },
  mist(fx, x, z, color) {
    fx.emit(px(x), px(z), R(0.2, 0.7), { vx: R(-0.25, 0.25), vz: R(-0.25, 0.25), life: R(4, 7), size: R(3, 5), color, fadeIn: 0.45 });
  }
};

export class Ambience {
  constructor(fx) {
    this.fx = fx;
    this.clear();
  }

  clear() {
    this.specs = [];
    this.liquids = [];
    this.rods = [];
    this.fixtures = [];
    this.storm = false;
    this.flash = 0;
  }

  setLevel(look, info) {
    this.clear();
    this.specs = (look.particles || []).map((p) => ({ ...p, acc: 0 }));
    if (info) {
      this.liquids = info.liquids || [];
      this.rods = info.rods || [];
      this.fixtures = info.fixtures || [];
    }
    this.storm = !!look.storm;
    this.nextStrike = R(2, 5);
    this.second = 0;
  }

  // Emits this frame's particles around `focus` (world units). Returns how
  // brightly lightning lights the floor (0 when it doesn't).
  update(dt, focus, gfx) {
    if (dt <= 0) {
      return this.flash;
    }
    for (const spec of this.specs) {
      spec.acc += spec.rate * dt;
      while (spec.acc >= 1) {
        spec.acc--;
        this.emit(spec, focus);
      }
    }
    if (this.storm) {
      this.nextStrike -= dt;
      if (this.nextStrike <= 0) {
        this.strike(focus, gfx);
        this.nextStrike = R(4, 10);
        this.second = R(0.12, 0.22);
      }
      if (this.second > 0) {
        this.second -= dt;
        if (this.second <= 0) {
          this.flash = Math.max(this.flash, 1.5);
        }
      }
    }
    this.flash = Math.max(0, this.flash - dt * 5);
    return this.flash;
  }

  emit(spec, focus) {
    const fx = this.fx;
    if (spec.kind === 'bubbles') {
      const spot = this.near(this.liquids, focus);
      if (spot) {
        const x = spot[0] + R(-0.9, 0.9);
        const z = spot[1] + R(-0.9, 0.9);
        fx.emit(px(x), px(z), 0.05, { vy: R(0.25, 0.6), vx: R(-0.05, 0.05), life: R(0.5, 1), size: R(0.25, 0.45), color: spec.color });
      }
      return;
    }
    if (spec.kind === 'sparks') {
      const light = this.near(this.fixtures, focus, (t) => [t.x, t.z]);
      if (light) {
        for (let i = 0; i < 3; i++) {
          fx.emit(px(light.x), px(light.z), light.y * 0.6, { vx: R(-1.5, 1.5), vy: R(2.5, 4.5), vz: R(-1.5, 1.5), gravity: 9, life: R(0.5, 0.9), size: R(0.2, 0.3), color: spec.color });
        }
      }
      return;
    }
    const make = Kinds[spec.kind];
    if (make) {
      make(fx, focus.x + R(-18, 18), focus.z + R(-18, 10), spec.color);
    }
  }

  // A random one of `list` within sight of the camera, or null.
  near(list, focus, at = (p) => p) {
    for (let tries = 0; tries < 12 && list.length > 0; tries++) {
      const item = list[Math.floor(Math.random() * list.length)];
      const [x, z] = at(item);
      if (Math.abs(x - focus.x) < 18 && z - focus.z > -18 && z - focus.z < 10) {
        return item;
      }
    }
    return null;
  }

  // Lightning out of the sky, onto a rod near the camera if there is one.
  strike(focus, gfx) {
    const rods = this.rods.filter((r) => Math.abs(r.x - focus.x) < 18 && r.z - focus.z > -16 && r.z - focus.z < 8);
    const target = rods.length > 0 ? rods[Math.floor(Math.random() * rods.length)] : { x: focus.x + R(-14, 14), y: 0.1, z: focus.z + R(-14, 6) };
    this.fx.bolt(px(target.x + R(-3, 3)), px(target.z - R(4, 8)), px(target.x), px(target.z), {
      color: 0xd8e8ff, life: 0.28, width: 0.1, jag: 1.8, h: 16, h2: target.y
    });
    this.fx.burst(px(target.x), px(target.z), target.y, { color: [0xd8e8ff, 0x8ab8ff], count: 24, speed: 5, life: 0.4, size: 0.6 });
    gfx.flash(px(target.x), px(target.z), target.y + 0.5, 0xb8d0ff, 150, 0.4);
    gfx.addShake(0.12);
    this.flash = 2.2;
  }
}
