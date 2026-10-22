import * as THREE from 'three';
import { glowSprite } from './models.js';

// Gear on the models: hats on heads, robes recolouring the body, staffs and
// rings in the hands, and the same pieces lying on the floor as loot. A rig
// that can wear gear carries a `wardrobe` (set up in models.js): its
// materials by role, the base parts a hat or staff replaces, and its skin
// material, from which the head and hands are found.

const geoCache = new Map();
function geo(key, make) {
  let g = geoCache.get(key);
  if (!g) {
    g = make();
    geoCache.set(key, g);
  }
  return g;
}

function mesh(g, m, x = 0, y = 0, z = 0) {
  const o = new THREE.Mesh(g, m);
  o.position.set(x, y, z);
  return o;
}

function lambert(color, glow) {
  return new THREE.MeshLambertMaterial({ color, emissive: glow ? new THREE.Color(glow).multiplyScalar(0.35) : 0x000000 });
}

// ---------------------------------------------------------------- pieces

// A hat with its brim at y = 0, sized for a head about 0.5 wide.
function buildHat(look, material) {
  const g = new THREE.Group();
  // the band shines on magical hats, the felt keeps its colour
  const felt = material(look.color, look.style === 'crown' ? look.glow : null);
  const band = material(look.band, look.glow);
  switch (look.style) {
    case 'wide': {
      g.add(mesh(geo('hat.wide.brim', () => new THREE.CylinderGeometry(0.66, 0.7, 0.04, 18)), felt, 0, 0, 0));
      g.add(mesh(geo('hat.wide.crown', () => new THREE.CylinderGeometry(0.26, 0.3, 0.36, 14)), felt, 0, 0.19, 0));
      g.add(mesh(geo('hat.wide.band', () => new THREE.CylinderGeometry(0.305, 0.305, 0.08, 14)), band, 0, 0.06, 0));
      break;
    }
    case 'hood': {
      // a cowl over the crown of the head, falling to a point behind
      const hood = mesh(geo('hat.hood', () => new THREE.SphereGeometry(0.34, 14, 10, 0, Math.PI * 2, 0, Math.PI * 0.62)), felt, 0, -0.08, -0.03);
      hood.scale.set(1, 1.15, 1.1);
      g.add(hood);
      const tip = mesh(geo('hat.hood.tip', () => new THREE.ConeGeometry(0.2, 0.45, 10)), felt, 0, 0.18, -0.26);
      tip.rotation.x = -1.1;
      g.add(tip);
      g.add(mesh(geo('hat.hood.rim', () => new THREE.TorusGeometry(0.31, 0.03, 6, 18)), band, 0, -0.02, 0.06));
      g.children[g.children.length - 1].rotation.x = Math.PI / 2 - 0.5;
      break;
    }
    case 'mitre': {
      g.add(mesh(geo('hat.mitre', () => new THREE.CylinderGeometry(0.16, 0.3, 0.62, 6)), felt, 0, 0.3, 0));
      g.add(mesh(geo('hat.mitre.band', () => new THREE.CylinderGeometry(0.31, 0.31, 0.08, 6)), band, 0, 0.03, 0));
      g.add(mesh(geo('hat.mitre.cross', () => new THREE.BoxGeometry(0.05, 0.26, 0.04)), band, 0, 0.34, 0.25));
      break;
    }
    case 'crown': {
      g.add(mesh(geo('hat.crown.band', () => new THREE.CylinderGeometry(0.3, 0.28, 0.12, 14, 1, true)), felt, 0, 0.05, 0));
      g.children[0].material.side = THREE.DoubleSide;
      const gem = new THREE.MeshBasicMaterial({ color: look.glow || 0xffffff });
      for (let i = 0; i < 7; i++) {
        const a = (i / 7) * Math.PI * 2;
        const x = Math.sin(a) * 0.29;
        const z = Math.cos(a) * 0.29;
        g.add(mesh(geo('hat.crown.spike', () => new THREE.ConeGeometry(0.05, 0.22, 4)), felt, x, 0.21, z));
        g.add(mesh(geo('hat.crown.gem', () => new THREE.OctahedronGeometry(0.035)), gem, x * 1.04, 0.07, z * 1.04));
      }
      const glow = glowSprite(look.glow || 0xffffff, 0.5, 0.8);
      glow.position.set(0, 0.07, 0.3);
      g.add(glow);
      break;
    }
    default: {
      // the wizard's pointed hat, its tip bent back
      g.add(mesh(geo('hat.pt.brim', () => new THREE.CylinderGeometry(0.56, 0.6, 0.04, 18)), felt, 0, 0, 0));
      const cone = mesh(geo('hat.pt.cone', () => new THREE.CylinderGeometry(0.12, 0.32, 0.62, 14)), felt, 0, 0.32, -0.02);
      cone.rotation.x = -0.1;
      g.add(cone);
      const tip = mesh(geo('hat.pt.tip', () => new THREE.ConeGeometry(0.12, 0.42, 12)), felt, 0, 0.78, -0.14);
      tip.rotation.x = -0.55;
      g.add(tip);
      g.add(mesh(geo('hat.pt.band', () => new THREE.CylinderGeometry(0.325, 0.33, 0.08, 14)), band, 0, 0.06, 0));
      if (look.glow) {
        // stars scattered over the cone
        for (const [x, y, z, s] of [[0.2, 0.25, 0.18, 0.28], [-0.16, 0.42, 0.16, 0.22], [0.05, 0.6, 0.12, 0.2], [-0.24, 0.18, -0.1, 0.24]]) {
          const star = glowSprite(look.glow, s, 0.9);
          star.position.set(x, y, z);
          g.add(star);
        }
      }
    }
  }
  return g;
}

// A staff held at its grip (y = 0): the shaft runs from the ground to above
// the shoulder, the head on top.
function buildStaff(look, material) {
  const g = new THREE.Group();
  const wood = material(look.wood);
  g.add(mesh(geo('staff.shaft', () => new THREE.CylinderGeometry(0.045, 0.06, 2.55, 7)), wood, 0, 0.2, 0));
  const gem = new THREE.MeshBasicMaterial({ color: look.gem });
  const top = 1.5;
  let glowScale = 0.9;
  switch (look.style) {
    case 'crystal': {
      for (const a of [0, 2.1, 4.2]) {
        const prong = mesh(geo('staff.prong', () => new THREE.ConeGeometry(0.035, 0.32, 4)), wood, Math.sin(a) * 0.08, top + 0.08, Math.cos(a) * 0.08);
        prong.rotation.set(Math.cos(a) * 0.35, 0, -Math.sin(a) * 0.35);
        g.add(prong);
      }
      const crystal = mesh(geo('staff.crystal', () => new THREE.OctahedronGeometry(0.11)), gem, 0, top + 0.2, 0);
      crystal.scale.set(1, 2, 1);
      g.add(crystal);
      break;
    }
    case 'fork': {
      for (const side of [-1, 1]) {
        const prong = mesh(geo('staff.fork', () => new THREE.CylinderGeometry(0.02, 0.04, 0.5, 5)), wood, side * 0.11, top + 0.15, 0);
        prong.rotation.z = -side * 0.4;
        g.add(prong);
      }
      g.add(mesh(geo('staff.spark', () => new THREE.IcosahedronGeometry(0.07, 0)), gem, 0, top + 0.22, 0));
      glowScale = 1.1;
      break;
    }
    case 'skull': {
      g.add(mesh(geo('staff.skull', () => new THREE.SphereGeometry(0.15, 9, 7)), wood, 0, top + 0.1, 0));
      g.add(mesh(geo('staff.jaw', () => new THREE.BoxGeometry(0.16, 0.08, 0.14)), wood, 0, top - 0.02, 0.04));
      const eye = geo('staff.eye', () => new THREE.SphereGeometry(0.03, 5, 4));
      g.add(mesh(eye, gem, -0.055, top + 0.12, 0.13), mesh(eye, gem, 0.055, top + 0.12, 0.13));
      glowScale = 0.6;
      break;
    }
    case 'sun': {
      const ring = mesh(geo('staff.sunring', () => new THREE.TorusGeometry(0.2, 0.03, 6, 20)), wood, 0, top + 0.22, 0);
      g.add(ring);
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        const ray = mesh(geo('staff.sunray', () => new THREE.ConeGeometry(0.025, 0.12, 4)), wood, Math.cos(a) * 0.27, top + 0.22 + Math.sin(a) * 0.27, 0);
        ray.rotation.z = a - Math.PI / 2;
        g.add(ray);
      }
      g.add(mesh(geo('staff.sun', () => new THREE.IcosahedronGeometry(0.1, 1)), gem, 0, top + 0.22, 0));
      glowScale = 1.5;
      break;
    }
    default:
      g.add(mesh(geo('staff.cup', () => new THREE.CylinderGeometry(0.09, 0.04, 0.12, 7)), wood, 0, top - 0.02, 0));
      g.add(mesh(geo('staff.orb', () => new THREE.IcosahedronGeometry(0.12, 1)), gem, 0, top + 0.1, 0));
  }
  const glow = glowSprite(look.gem, glowScale);
  glow.position.y = top + (look.style === 'skull' ? 0.12 : 0.2);
  g.add(glow);
  g.userData.gem = look.gem;
  return g;
}

// A ring around a finger; the gem's glow keeps it visible from the camera.
function buildWornRing(look, scale) {
  const g = new THREE.Group();
  const band = new THREE.MeshStandardMaterial({ color: look.band, metalness: 0.85, roughness: 0.3 });
  const torus = mesh(geo('worn.ring', () => new THREE.TorusGeometry(0.1, 0.022, 6, 14)), band);
  torus.rotation.x = Math.PI / 2;
  g.add(torus);
  g.add(mesh(geo('worn.gem', () => new THREE.OctahedronGeometry(0.035)), new THREE.MeshBasicMaterial({ color: look.gem }), 0, 0, 0.11));
  const glow = glowSprite(look.gem, 0.45, 0.9);
  glow.position.z = 0.12;
  g.add(glow);
  g.scale.setScalar(scale);
  return g;
}

// A folded robe on the floor (loot only).
function buildRobeBundle(look) {
  const g = new THREE.Group();
  const cloth = lambert(look.robe, null);
  const trim = lambert(look.trim, look.glow);
  g.add(mesh(geo('robe.skirt', () => new THREE.CylinderGeometry(0.16, 0.42, 0.7, 10)), cloth, 0, 0, 0));
  g.add(mesh(geo('robe.shoulders', () => new THREE.CylinderGeometry(0.3, 0.2, 0.14, 10)), lambert(look.mantle, null), 0, 0.36, 0));
  g.add(mesh(geo('robe.hem', () => new THREE.CylinderGeometry(0.43, 0.43, 0.05, 12)), trim, 0, -0.34, 0));
  g.add(mesh(geo('robe.belt', () => new THREE.CylinderGeometry(0.21, 0.21, 0.05, 10)), trim, 0, 0.12, 0));
  if (look.cape) {
    const cape = mesh(geo('robe.cape', () => new THREE.BoxGeometry(0.6, 0.7, 0.03)), lambert(look.cape, null), 0, 0.02, -0.3);
    cape.rotation.x = 0.25;
    g.add(cape);
  }
  return g;
}

// An item lying on the floor: its piece, upright and a little larger, in a
// glow of its rarity's colour.
export function buildGearLoot(type, rarityGlow) {
  const g = new THREE.Group();
  const look = type.look;
  if (type.slot === 'hat') {
    const hat = buildHat(look, lambert);
    hat.scale.setScalar(1.1);
    hat.position.y = -0.3;
    g.add(hat);
  } else if (type.slot === 'robe') {
    g.add(buildRobeBundle(look));
  } else if (type.slot === 'staff') {
    const staff = buildStaff(look, lambert);
    staff.scale.setScalar(0.62);
    staff.rotation.z = 0.6;
    staff.position.set(0.3, -0.45, 0);
    g.add(staff);
  } else {
    const ring = buildWornRing(look, 2.6);
    ring.rotation.x = -0.6;
    g.add(ring);
  }
  g.add(glowSprite(rarityGlow, 2.0, 0.55));
  return g;
}

// ---------------------------------------------------------------- dressing

// The bounds of the parts of `group` drawn in `material`, in the group's own
// space (skipping anything in `skip`).
function boundsOf(group, material, skip) {
  const box = new THREE.Box3();
  const inverse = new THREE.Matrix4();
  group.updateMatrixWorld(true);
  inverse.copy(group.matrixWorld).invert();
  const m = new THREE.Matrix4();
  const part = new THREE.Box3();
  group.traverse((o) => {
    if (!o.isMesh || (material && o.material !== material) || skip.has(o)) {
      return;
    }
    if (!o.geometry.boundingBox) {
      o.geometry.computeBoundingBox();
    }
    m.multiplyMatrices(inverse, o.matrixWorld);
    part.copy(o.geometry.boundingBox).applyMatrix4(m);
    box.union(part);
  });
  return box;
}

// Where the hat sits and how big the hands are, measured from the skin once.
function measure(rig, w) {
  const skip = new Set();
  for (const slot in w.hide) {
    for (const o of w.hide[slot]) {
      o.traverse((c) => skip.add(c));
    }
  }
  const head = boundsOf(rig.head, w.skin, skip);
  const width = head.isEmpty() ? 0.5 : head.max.x - head.min.x;
  w.hatScale = Math.max(0.75, Math.min(1.6, width / 0.5));
  w.hatY = head.isEmpty() ? 0.25 : head.max.y - 0.04 * w.hatScale;
  const hand = (arm) => {
    const box = boundsOf(arm, w.skin, skip);
    return box.isEmpty() ? -0.7 : box.min.y + 0.12;
  };
  w.handL = hand(rig.limbs.armL);
  w.handR = hand(rig.limbs.armR);
  // what each material looked like before any gear
  w.base = {};
  for (const role in w.mats) {
    const m = w.mats[role];
    w.base[role] = { color: m.color.getHex(), emissive: m.emissive ? m.emissive.getHex() : null };
  }
  w.worn = [];
  w.ready = true;
}

const shade = (hex) => new THREE.Color(hex).multiplyScalar(0.65).getHex();

// Puts on the gear an inventory has equipped (and takes off what it no
// longer has). Safe to call on every change.
export function dressRig(rig, inventory) {
  const w = rig && rig.wardrobe;
  if (!w || !rig.head) {
    return;
  }
  if (!w.ready) {
    measure(rig, w);
  }
  // take everything off
  for (const o of w.worn) {
    o.parent.remove(o);
  }
  const old = new Set(w.wornMats || []);
  rig.materials = rig.materials.filter((m) => !old.has(m));
  w.worn = [];
  w.wornMats = [];
  for (const role in w.base) {
    const m = w.mats[role];
    const base = w.base[role];
    m.color.setHex(base.color);
    if (m.emissive) {
      m.emissive.setHex(base.emissive);
      m.userData.baseEmissive = m.emissive.clone();
    }
  }
  const eq = (inventory && inventory.equipped) || {};
  for (const slot in w.hide) {
    for (const o of w.hide[slot]) {
      o.visible = !eq[slot];
    }
  }
  // pieces the rig flashes red with when hit
  const tracked = (color, glow) => {
    const m = lambert(color, glow);
    m.userData.baseEmissive = m.emissive.clone();
    rig.materials.push(m);
    w.wornMats.push(m);
    return m;
  };
  const wear = (parent, piece) => {
    parent.add(piece);
    w.worn.push(piece);
  };

  if (eq.robe) {
    const look = eq.robe.type.look;
    const paint = { Robe: look.robe, RobeShade: shade(look.robe), Mantle: look.mantle, Trim: look.trim, Cloth: look.robe };
    for (const role in paint) {
      if (w.mats[role] && paint[role] !== undefined) {
        w.mats[role].color.setHex(paint[role]);
      }
    }
    // the trim shines; bodies without trim get a faint glow over all the cloth
    const glowing = w.mats.Trim || w.mats.Cloth;
    if (look.glow && glowing && glowing.emissive) {
      glowing.emissive.setHex(new THREE.Color(look.glow).multiplyScalar(w.mats.Trim ? 0.45 : 0.12).getHex());
      glowing.userData.baseEmissive = glowing.emissive.clone();
    }
    if (look.cape && w.cape) {
      // a cloak round the back, from under the mantle and flaring past the hem
      const cloth = tracked(look.cape);
      cloth.side = THREE.DoubleSide;
      const cape = mesh(geo('cape.worn', () => new THREE.CylinderGeometry(0.5, 0.86, 1.8, 14, 1, true, Math.PI * 0.32, Math.PI * 1.36)), cloth, 0, w.cape.y - 0.9, w.cape.z);
      wear(rig.body, cape);
    }
  }
  if (eq.hat) {
    const hat = buildHat(eq.hat.type.look, tracked);
    hat.position.set(0, w.hatY, 0);
    hat.scale.setScalar(w.hatScale);
    hat.rotation.x = -0.08;
    wear(rig.head, hat);
  }
  if (eq.staff && !w.noStaff) {
    const staff = buildStaff(eq.staff.type.look, tracked);
    staff.position.set(0, w.handR, 0.04);
    wear(rig.limbs.armR, staff);
    rig.orbColor = eq.staff.type.look.gem;
  }
  for (const [slot, arm, y] of [['ring1', rig.limbs.armL, w.handL], ['ring2', rig.limbs.armR, w.handR]]) {
    if (eq[slot] && arm) {
      const ring = buildWornRing(eq[slot].type.look, w.ringScale || 1);
      ring.position.set(0, y + 0.02, 0);
      wear(arm, ring);
    }
  }
  // fade the new pieces along with the rest while invisible
  const alpha = rig.alpha;
  rig.alpha = null;
  rig.setAlpha(alpha);
}
