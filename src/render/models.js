import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { glowTexture, runeTexture } from './textures.js';

// Low-poly characters and props built from primitives. Geometries are shared;
// each character gets its own materials so hits can flash and invisibility
// can fade one model without touching the others.

const geoCache = new Map();
function geo(key, make) {
  let g = geoCache.get(key);
  if (!g) {
    g = make();
    geoCache.set(key, g);
  }
  return g;
}

let glowTex = null;
let runeTex = null;
export function glowMap() {
  if (!glowTex) {
    glowTex = glowTexture();
  }
  return glowTex;
}
function runeMap() {
  if (!runeTex) {
    runeTex = runeTexture();
  }
  return runeTex;
}

function mat(color, extra = {}) {
  return new THREE.MeshLambertMaterial({ color, ...extra });
}

function mesh(g, m, x = 0, y = 0, z = 0) {
  const o = new THREE.Mesh(g, m);
  o.position.set(x, y, z);
  return o;
}

export function glowSprite(color, scale, opacity = 1) {
  const s = new THREE.Sprite(new THREE.SpriteMaterial({
    map: glowMap(), color, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity
  }));
  s.scale.set(scale, scale, scale);
  return s;
}

function blobShadow(radius) {
  const m = new THREE.Mesh(
    geo('shadow', () => new THREE.PlaneGeometry(1, 1)),
    new THREE.MeshBasicMaterial({ map: glowMap(), color: 0x000000, transparent: true, opacity: 0.55, depthWrite: false })
  );
  m.rotation.x = -Math.PI / 2;
  m.position.y = 0.02;
  m.scale.set(radius * 2, radius * 2, 1);
  m.renderOrder = 1;
  return m;
}

// Common rig: root sits at the feet, `body` bobs, limbs swing on pivots.
class Rig {
  constructor() {
    this.root = new THREE.Group();
    this.body = new THREE.Group();
    this.root.add(this.body);
    this.limbs = { legL: null, legR: null, armL: null, armR: null };
    this.materials = [];
    this.phase = Math.random() * 10;
    this.flash = 0;
    this.attack = 0;
    this.alpha = 1;
    this.height = 2.4;
    this.facing = 0;
  }

  track(...materials) {
    for (const m of materials) {
      m.userData.baseEmissive = m.emissive ? m.emissive.clone() : null;
      this.materials.push(m);
    }
    return materials[0];
  }

  pivot(x, y, z, child) {
    const p = new THREE.Group();
    p.position.set(x, y, z);
    if (child) {
      p.add(child);
    }
    this.body.add(p);
    return p;
  }

  // speed: 0..1 walk intensity
  animate(dt, speed, facing) {
    if (facing !== undefined && facing !== null) {
      let diff = facing - this.facing;
      while (diff > Math.PI) { diff -= Math.PI * 2; }
      while (diff < -Math.PI) { diff += Math.PI * 2; }
      this.facing += diff * Math.min(1, dt * 12);
      this.root.rotation.y = this.facing;
    }
    this.phase += dt * (4 + speed * 8);
    const swing = Math.sin(this.phase) * 0.7 * speed;
    const { legL, legR, armL, armR } = this.limbs;
    if (legL) { legL.rotation.x = swing; }
    if (legR) { legR.rotation.x = -swing; }
    if (armL) { armL.rotation.x = -swing * 0.8; }
    if (armR) {
      armR.rotation.x = swing * 0.8;
      if (this.attack > 0) {
        armR.rotation.x = -2.2 * Math.sin(this.attack * Math.PI);
      }
    }
    if (this.attack > 0) {
      this.attack = Math.max(0, this.attack - dt * 3);
    }
    this.body.position.y = Math.abs(Math.sin(this.phase)) * 0.08 * speed + Math.sin(this.phase * 0.35) * 0.02;
    if (this.flash > 0) {
      this.flash = Math.max(0, this.flash - dt * 4);
    }
    for (const m of this.materials) {
      if (m.emissive && m.userData.baseEmissive) {
        m.emissive.copy(m.userData.baseEmissive).lerp(FLASH, this.flash);
      }
    }
  }

  hit() {
    this.flash = 1;
  }

  swing() {
    this.attack = 1;
  }

  setAlpha(alpha) {
    if (alpha === this.alpha) {
      return;
    }
    this.alpha = alpha;
    this.root.traverse((o) => {
      const m = o.material;
      if (!m || o.userData.keepOpacity) {
        return;
      }
      if (!m.userData.base) {
        m.userData.base = { transparent: m.transparent, opacity: m.opacity, depthWrite: m.depthWrite };
      }
      const base = m.userData.base;
      m.transparent = base.transparent || alpha < 1;
      m.opacity = base.opacity * alpha;
      m.depthWrite = base.depthWrite && alpha >= 1;
    });
  }
}

const FLASH = new THREE.Color(0xff3020);

// ---------------------------------------------------------------- Blender models

// Characters are modelled in Blender from the 2D sprites (tools/blender writes
// public/models/*.glb). Each model is a set of rigid parts named after the rig
// (Body, Head, ArmL, ArmR, LegL, LegR) whose origins are the pivots, with
// materials named by role so a character can be recoloured. Until a model has
// loaded (or if it fails) the primitive version below is used.
const templates = new Map();
const GLOWING = new Set(['Gem', 'Glow']);

export async function loadModels() {
  const names = ['mage', ...Object.keys(ORC_LOOKS).map((look) => 'orc_' + look)];
  const loader = new GLTFLoader();
  await Promise.all(names.map(async (name) => {
    try {
      const gltf = await loader.loadAsync(import.meta.env.BASE_URL + 'models/' + name + '.glb');
      const parts = {};
      for (const node of gltf.scene.children) {
        const meshes = [];
        node.traverse((o) => {
          if (o.isMesh) {
            meshes.push({ geometry: o.geometry, material: o.material.name, color: o.material.color.getHex() });
          }
        });
        parts[node.name] = { position: node.position.clone(), meshes };
      }
      templates.set(name, parts);
    } catch (err) {
      console.warn(name + ' model failed to load, using the primitive one', err);
    }
  }));
}

// colors: role -> colour overrides. Returns the rig with its materials by role.
function rigFromModel(parts, colors = {}, glowScale = 0.8) {
  const rig = new Rig();
  const mats = {};
  const material = (m) => {
    if (!mats[m.material]) {
      const color = colors[m.material] ?? m.color;
      mats[m.material] = GLOWING.has(m.material) || m.material === 'Eye'
        ? new THREE.MeshBasicMaterial({ color })
        : rig.track(mat(color, { emissive: 0x000000, side: THREE.DoubleSide }));
    }
    return mats[m.material];
  };
  const part = (name) => {
    const g = new THREE.Group();
    for (const m of parts[name].meshes) {
      g.add(new THREE.Mesh(m.geometry, material(m)));
      if (GLOWING.has(m.material)) {
        if (!m.geometry.boundingBox) {
          m.geometry.computeBoundingBox();
        }
        // Gem is a staff focus; Glow marks small accents (eye slits, a belt gem)
        const glow = glowSprite(material(m).color, m.material === 'Gem' ? glowScale : glowScale * 0.4);
        m.geometry.boundingBox.getCenter(glow.position);
        g.add(glow);
      }
    }
    return g;
  };
  const pivotPart = (name) => {
    const p = parts[name].position;
    return rig.pivot(p.x, p.y, p.z, part(name));
  };
  rig.body.add(part('Body'));
  rig.limbs.legL = pivotPart('LegL');
  rig.limbs.legR = pivotPart('LegR');
  rig.limbs.armL = pivotPart('ArmL');
  rig.limbs.armR = pivotPart('ArmR');
  rig.head = pivotPart('Head');
  return { rig, mats };
}

// ---------------------------------------------------------------- mage

export function buildMage(o = {}) {
  const parts = templates.get('mage');
  if (!parts) {
    return buildPrimitiveMage(o);
  }
  // the duel wizard and mirror images recolour the sprite's grey wizard
  const { rig } = rigFromModel(parts, {
    Robe: o.robe,
    RobeShade: o.robe !== undefined ? new THREE.Color(o.robe).multiplyScalar(0.65).getHex() : undefined,
    Mantle: o.hat,
    Trim: o.trim,
    Hair: o.beard,
    Beard: o.beard,
    Gem: o.orb
  });
  rig.root.add(blobShadow(0.85));
  rig.height = 2.7;
  return rig;
}

function buildPrimitiveMage(o) {
  const rig = new Rig();
  const robe = rig.track(mat(o.robe || 0x2a4fa8, { emissive: 0x000000 }));
  const trim = mat(o.trim || 0xd8c070);
  const skin = rig.track(mat(0xe0b896, { emissive: 0x000000 }));
  const hatMat = rig.track(mat(o.hat || 0x223c86, { emissive: 0x000000 }));
  const beardMat = mat(o.beard || 0xe8e8e8);
  const wood = mat(0x5a3a20);

  const skirt = mesh(geo('mage.skirt', () => new THREE.CylinderGeometry(0.36, 0.78, 1.35, 12)), robe, 0, 0.68, 0);
  const hem = mesh(geo('mage.hem', () => new THREE.CylinderGeometry(0.8, 0.8, 0.08, 14)), trim, 0, 0.04, 0);
  const torso = mesh(geo('mage.torso', () => new THREE.CylinderGeometry(0.34, 0.42, 0.62, 10)), robe, 0, 1.62, 0);
  const belt = mesh(geo('mage.belt', () => new THREE.CylinderGeometry(0.4, 0.4, 0.09, 10)), trim, 0, 1.33, 0);
  rig.body.add(skirt, hem, torso, belt);

  const footGeo = geo('mage.foot', () => new THREE.BoxGeometry(0.2, 0.14, 0.34));
  const footMat = mat(0x3a2a20);
  rig.limbs.legL = rig.pivot(-0.2, 0.5, 0, mesh(footGeo, footMat, 0, -0.43, 0.1));
  rig.limbs.legR = rig.pivot(0.2, 0.5, 0, mesh(footGeo, footMat, 0, -0.43, 0.1));

  const armGeo = geo('mage.arm', () => new THREE.CylinderGeometry(0.12, 0.15, 0.68, 8));
  const handGeo = geo('mage.hand', () => new THREE.SphereGeometry(0.11, 8, 6));
  const armL = new THREE.Group();
  armL.add(mesh(armGeo, robe, 0, -0.32, 0), mesh(handGeo, skin, 0, -0.68, 0));
  const armR = new THREE.Group();
  armR.add(mesh(armGeo, robe, 0, -0.32, 0), mesh(handGeo, skin, 0, -0.68, 0));
  rig.limbs.armL = rig.pivot(-0.46, 1.86, 0, armL);
  rig.limbs.armR = rig.pivot(0.46, 1.86, 0, armR);

  // staff with a glowing focus
  const staff = new THREE.Group();
  staff.add(mesh(geo('mage.staff', () => new THREE.CylinderGeometry(0.045, 0.06, 2.3, 6)), wood, 0, 0.3, 0));
  const orbMat = new THREE.MeshBasicMaterial({ color: o.orb || 0x9fd8ff });
  const orb = mesh(geo('mage.orb', () => new THREE.IcosahedronGeometry(0.13, 1)), orbMat, 0, 1.5, 0);
  const orbGlow = glowSprite(o.orb || 0x9fd8ff, 0.9);
  orbGlow.position.y = 1.5;
  staff.add(orb, orbGlow);
  staff.position.set(0, -0.68, 0.05);
  armR.add(staff);
  rig.orb = orb;

  const head = new THREE.Group();
  head.add(mesh(geo('mage.head', () => new THREE.SphereGeometry(0.28, 12, 10)), skin, 0, 0, 0));
  const beard = mesh(geo('mage.beard', () => new THREE.ConeGeometry(0.22, 0.6, 8)), beardMat, 0, -0.3, 0.12);
  beard.rotation.x = Math.PI + 0.25;
  head.add(beard);
  const eyeGeo = geo('mage.eye', () => new THREE.SphereGeometry(0.035, 6, 4));
  const eyeMat = new THREE.MeshBasicMaterial({ color: 0x101018 });
  head.add(mesh(eyeGeo, eyeMat, -0.1, 0.04, 0.24), mesh(eyeGeo, eyeMat, 0.1, 0.04, 0.24));
  const brim = mesh(geo('mage.brim', () => new THREE.CylinderGeometry(0.62, 0.62, 0.05, 16)), hatMat, 0, 0.2, 0);
  const cone = mesh(geo('mage.hat', () => new THREE.ConeGeometry(0.38, 1.0, 12)), hatMat, 0, 0.7, -0.04);
  cone.rotation.x = -0.18;
  const band = mesh(geo('mage.band', () => new THREE.CylinderGeometry(0.39, 0.4, 0.1, 12)), trim, 0, 0.27, 0);
  head.add(brim, cone, band);
  head.position.set(0, 2.18, 0);
  rig.body.add(head);
  rig.head = head;

  rig.root.add(blobShadow(0.85));
  rig.height = 3.1;
  return rig;
}

// ---------------------------------------------------------------- orcs

const ORC_LOOKS = {
  grunt: { skin: 0x5f8a3a, cloth: 0x6a4a2c, scale: 1 },
  slinger: { skin: 0x6a9440, cloth: 0x7a6a40, scale: 0.95 },
  knight: { skin: 0x557d34, cloth: 0x3a3a44, scale: 1.05 },
  shaman: { skin: 0x5f8a3a, cloth: 0x8a2a2a, scale: 1 },
  berserker: { skin: 0x9a5a30, cloth: 0x5a2010, scale: 1.05 },
  brute: { skin: 0x3d5a26, cloth: 0x4a3a2a, scale: 1.35 },
  warlock: { skin: 0x5a6a8a, cloth: 0x3a2060, scale: 1 },
  cleric: { skin: 0x6a8a4a, cloth: 0xd8d0b8, scale: 1.25 },
  mage: { skin: 0x5f8a3a, cloth: 0x4a1a6a, scale: 1.25 },
  boss: { skin: 0x4a6a2a, cloth: 0x1c1c22, scale: 2.0 }
};

export function buildOrc(look, o = {}) {
  const spec = ORC_LOOKS[look] || ORC_LOOKS.grunt;
  const champion = !!o.champion;
  const parts = templates.get('orc_' + (ORC_LOOKS[look] ? look : 'grunt'));
  if (parts) {
    // battle armies wear their side's colours
    const team = TEAM_COLORS[o.team];
    const { rig, mats } = rigFromModel(parts, team ? { Cloth: team.cloth, Armor: team.armor } : {}, 0.9);
    return finishOrc(rig, look, spec, champion, mats.Cloth, o.team);
  }
  return buildPrimitiveOrc(look, spec, champion, o.team);
}

const TEAM_COLORS = {
  player: { cloth: 0x2a4fa8, armor: 0x3a62c8, ring: 0x4a8aff },
  enemy: { cloth: 0x9a1a1a, armor: 0xb02a2a, ring: 0xff4040 }
};

function buildPrimitiveOrc(look, spec, champion, team) {
  const rig = new Rig();
  const skin = rig.track(mat(spec.skin, { emissive: 0x000000 }));
  const cloth = rig.track(mat(spec.cloth, { emissive: 0x000000 }));
  const dark = mat(0x2a2018);
  const metal = new THREE.MeshStandardMaterial({ color: champion ? 0xd8a838 : 0x8a8e96, metalness: 0.7, roughness: 0.4 });
  const tuskMat = mat(0xf0ead0);
  const robed = look === 'shaman' || look === 'warlock' || look === 'cleric' || look === 'mage';

  // legs
  const legGeo = geo('orc.leg', () => new THREE.BoxGeometry(0.32, 0.8, 0.36));
  const bootGeo = geo('orc.boot', () => new THREE.BoxGeometry(0.36, 0.22, 0.48));
  const legL = new THREE.Group();
  legL.add(mesh(legGeo, dark, 0, -0.4, 0), mesh(bootGeo, dark, 0, -0.78, 0.06));
  const legR = new THREE.Group();
  legR.add(mesh(legGeo, dark, 0, -0.4, 0), mesh(bootGeo, dark, 0, -0.78, 0.06));
  rig.limbs.legL = rig.pivot(-0.26, 0.86, 0, legL);
  rig.limbs.legR = rig.pivot(0.26, 0.86, 0, legR);

  // torso, hunched forward
  const torso = new THREE.Group();
  torso.add(mesh(geo('orc.torso', () => new THREE.BoxGeometry(1.05, 0.95, 0.66)), skin, 0, 0, 0));
  torso.add(mesh(geo('orc.vest', () => new THREE.BoxGeometry(1.1, 0.6, 0.7)), cloth, 0, -0.2, 0));
  torso.add(mesh(geo('orc.beltb', () => new THREE.BoxGeometry(1.12, 0.14, 0.72)), dark, 0, -0.45, 0));
  if (robed) {
    torso.add(mesh(geo('orc.robe', () => new THREE.CylinderGeometry(0.62, 0.85, 1.2, 10)), cloth, 0, -0.75, 0));
  }
  torso.position.set(0, 1.38, 0);
  torso.rotation.x = 0.12;
  rig.body.add(torso);

  // head with tusks, ears and glowing eyes
  const head = new THREE.Group();
  head.add(mesh(geo('orc.head', () => new THREE.BoxGeometry(0.58, 0.52, 0.54)), skin, 0, 0, 0));
  head.add(mesh(geo('orc.jaw', () => new THREE.BoxGeometry(0.6, 0.2, 0.5)), skin, 0, -0.26, 0.06));
  const tuskGeo = geo('orc.tusk', () => new THREE.ConeGeometry(0.05, 0.2, 5));
  head.add(mesh(tuskGeo, tuskMat, -0.18, -0.12, 0.3), mesh(tuskGeo, tuskMat, 0.18, -0.12, 0.3));
  const earGeo = geo('orc.ear', () => new THREE.ConeGeometry(0.08, 0.32, 4));
  const earL = mesh(earGeo, skin, -0.36, 0.08, 0);
  earL.rotation.z = Math.PI / 2;
  const earR = mesh(earGeo, skin, 0.36, 0.08, 0);
  earR.rotation.z = -Math.PI / 2;
  head.add(earL, earR);
  const eyeMat = new THREE.MeshBasicMaterial({ color: look === 'boss' ? 0xff2010 : (look === 'warlock' || look === 'mage' ? 0xc070ff : 0xffd040) });
  const eyeGeo = geo('orc.eye', () => new THREE.BoxGeometry(0.1, 0.06, 0.04));
  head.add(mesh(eyeGeo, eyeMat, -0.13, 0.06, 0.28), mesh(eyeGeo, eyeMat, 0.13, 0.06, 0.28));
  head.position.set(0, 2.05, 0.16);
  rig.body.add(head);
  rig.head = head;

  // arms
  const armGeo = geo('orc.arm', () => new THREE.BoxGeometry(0.28, 0.85, 0.3));
  const fistGeo = geo('orc.fist', () => new THREE.BoxGeometry(0.3, 0.26, 0.3));
  const armL = new THREE.Group();
  armL.add(mesh(armGeo, skin, 0, -0.4, 0), mesh(fistGeo, skin, 0, -0.9, 0));
  const armR = new THREE.Group();
  armR.add(mesh(armGeo, skin, 0, -0.4, 0), mesh(fistGeo, skin, 0, -0.9, 0));
  rig.limbs.armL = rig.pivot(-0.68, 1.78, 0.05, armL);
  rig.limbs.armR = rig.pivot(0.68, 1.78, 0.05, armR);
  const hand = new THREE.Group();
  hand.position.set(0, -0.92, 0.05);
  armR.add(hand);
  const offHand = new THREE.Group();
  offHand.position.set(0, -0.92, 0.05);
  armL.add(offHand);

  // gear by class
  const wood = mat(0x5a3a1e);
  if (look === 'grunt' || look === 'boss') {
    const club = new THREE.Group();
    club.add(mesh(geo('club.h', () => new THREE.CylinderGeometry(0.06, 0.08, 1.0, 6)), wood, 0, 0.35, 0));
    if (look === 'boss') {
      const blade = mesh(geo('axe.blade', () => new THREE.CylinderGeometry(0.55, 0.55, 0.08, 3, 1, false, 0, Math.PI)), metal, 0, 0.75, 0);
      blade.rotation.z = Math.PI / 2;
      club.add(blade);
    } else {
      club.add(mesh(geo('club.k', () => new THREE.DodecahedronGeometry(0.2)), wood, 0, 0.9, 0));
    }
    club.rotation.x = Math.PI / 2;
    hand.add(club);
  }
  if (look === 'slinger') {
    hand.add(mesh(geo('sling.pouch', () => new THREE.SphereGeometry(0.13, 6, 5)), mat(0x8a6a40), 0, -0.1, 0.15));
    torso.add(mesh(geo('sling.bag', () => new THREE.BoxGeometry(0.3, 0.35, 0.2)), mat(0x7a5a30), 0.45, -0.45, 0.3));
  }
  if (look === 'knight' || look === 'boss') {
    const helm = mesh(geo('knight.helm', () => new THREE.CylinderGeometry(0.33, 0.36, 0.36, 8)), metal, 0, 0.25, 0);
    head.add(helm);
    head.add(mesh(geo('knight.crest', () => new THREE.BoxGeometry(0.06, 0.22, 0.5)), look === 'boss' ? mat(0xb01020) : metal, 0, 0.48, 0));
    torso.add(mesh(geo('knight.plate', () => new THREE.BoxGeometry(1.12, 0.7, 0.72)), metal, 0, 0.12, 0));
    const pauldron = geo('knight.pauldron', () => new THREE.SphereGeometry(0.28, 8, 6, 0, Math.PI * 2, 0, Math.PI / 2));
    armL.add(mesh(pauldron, metal, 0, 0.02, 0));
    armR.add(mesh(pauldron, metal, 0, 0.02, 0));
  }
  if (look === 'knight') {
    const sword = new THREE.Group();
    sword.add(mesh(geo('sword.blade', () => new THREE.BoxGeometry(0.08, 1.0, 0.2)), metal, 0, 0.55, 0));
    sword.add(mesh(geo('sword.guard', () => new THREE.BoxGeometry(0.1, 0.06, 0.45)), dark, 0, 0.05, 0));
    sword.rotation.x = Math.PI / 2;
    hand.add(sword);
    const shield = mesh(geo('knight.shield', () => new THREE.CylinderGeometry(0.45, 0.45, 0.08, 10)), mat(0x6a2a20), 0, 0.15, 0.22);
    shield.rotation.x = Math.PI / 2;
    shield.add(mesh(geo('knight.boss', () => new THREE.SphereGeometry(0.1, 6, 5)), metal, 0, 0.06, 0));
    offHand.add(shield);
  }
  if (look === 'berserker') {
    for (const h of [hand, offHand]) {
      const axe = new THREE.Group();
      axe.add(mesh(geo('baxe.h', () => new THREE.CylinderGeometry(0.05, 0.05, 0.8, 6)), wood, 0, 0.3, 0));
      const blade = mesh(geo('baxe.blade', () => new THREE.CylinderGeometry(0.3, 0.3, 0.06, 3, 1, false, 0, Math.PI)), metal, 0, 0.6, 0);
      blade.rotation.z = Math.PI / 2;
      axe.add(blade);
      axe.rotation.x = Math.PI / 2;
      h.add(axe);
    }
    head.add(mesh(geo('bers.mohawk', () => new THREE.BoxGeometry(0.1, 0.25, 0.5)), mat(0xd03010), 0, 0.36, 0));
  }
  if (look === 'brute') {
    const hammer = new THREE.Group();
    hammer.add(mesh(geo('ham.h', () => new THREE.CylinderGeometry(0.07, 0.07, 1.4, 6)), wood, 0, 0.5, 0));
    hammer.add(mesh(geo('ham.head', () => new THREE.BoxGeometry(0.7, 0.4, 0.4)), metal, 0, 1.2, 0));
    hammer.rotation.x = Math.PI / 2;
    hand.add(hammer);
  }
  if (robed) {
    const staffColor = { shaman: 0x80ff80, warlock: 0xb060ff, cleric: 0x9fff60, mage: 0xff5040 }[look];
    const staff = new THREE.Group();
    staff.add(mesh(geo('ostaff', () => new THREE.CylinderGeometry(0.05, 0.06, 2.2, 6)), wood, 0, 0.4, 0));
    if (look === 'shaman' || look === 'cleric') {
      staff.add(mesh(geo('skull', () => new THREE.SphereGeometry(0.18, 8, 6)), tuskMat, 0, 1.55, 0));
    }
    const orb = glowSprite(staffColor, 0.9);
    orb.position.y = 1.6;
    staff.add(orb);
    staff.position.z = 0.1;
    hand.add(staff);
    rig.orbColor = staffColor;
    if (look === 'warlock' || look === 'mage') {
      head.add(mesh(geo('hood', () => new THREE.ConeGeometry(0.42, 0.9, 8)), cloth, 0, 0.45, -0.06));
    }
    if (look === 'shaman') {
      for (let f = -1; f <= 1; f++) {
        const feather = mesh(geo('feather', () => new THREE.ConeGeometry(0.05, 0.4, 4)), mat(f === 0 ? 0xd04020 : 0xf0e0b0), f * 0.14, 0.4, -0.15);
        feather.rotation.z = -f * 0.3;
        head.add(feather);
      }
    }
    if (look === 'cleric') {
      head.add(mesh(geo('mitre', () => new THREE.CylinderGeometry(0.18, 0.32, 0.6, 6)), mat(0xf0e8d0), 0, 0.5, 0));
    }
  }
  if (look === 'boss') {
    const gold = new THREE.MeshStandardMaterial({ color: 0xe0b040, metalness: 0.8, roughness: 0.3 });
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2;
      head.add(mesh(geo('crown.spike', () => new THREE.ConeGeometry(0.07, 0.3, 4)), gold, Math.cos(a) * 0.3, 0.55, Math.sin(a) * 0.3));
    }
    const cape = mesh(geo('cape', () => new THREE.BoxGeometry(1.1, 1.6, 0.06)), mat(0x7a0a14, { side: THREE.DoubleSide }), 0, -0.5, -0.4);
    cape.rotation.x = 0.15;
    torso.add(cape);
  }
  if (TEAM_COLORS[team]) {
    cloth.color.setHex(TEAM_COLORS[team].cloth);
  }
  return finishOrc(rig, look, spec, champion, cloth, team);
}

// Champion aura and tint, shadow and size, shared by both kinds of orc.
function finishOrc(rig, look, spec, champion, cloth, team) {
  if (TEAM_COLORS[team]) {
    // a thin ring underfoot tells the armies apart from any angle
    const ring = new THREE.Mesh(
      geo('team.ring', () => new THREE.RingGeometry(0.62, 0.78, 24)),
      new THREE.MeshBasicMaterial({ color: TEAM_COLORS[team].ring, transparent: true, opacity: 0.7, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide })
    );
    ring.userData.keepOpacity = true;
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.04;
    rig.root.add(ring);
  }
  if (champion) {
    const aura = new THREE.Mesh(
      geo('aura', () => new THREE.RingGeometry(0.75, 1.05, 24)),
      new THREE.MeshBasicMaterial({ color: 0xffc040, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide })
    );
    aura.userData.keepOpacity = true;
    aura.rotation.x = -Math.PI / 2;
    aura.position.y = 0.05;
    rig.root.add(aura);
    rig.aura = aura;
    if (cloth) {
      cloth.color.lerp(new THREE.Color(0xd8a838), 0.6);
    }
  }

  rig.root.add(blobShadow(look === 'boss' ? 1.0 : 0.95));
  rig.body.scale.setScalar(spec.scale);
  rig.height = 2.6 * spec.scale;
  return rig;
}

// ---------------------------------------------------------------- items

export function buildScroll(tier) {
  const g = new THREE.Group();
  const paper = mat(tier ? 0xf8e8a0 : 0xe8dcc0, { emissive: tier ? 0x403000 : 0x000000 });
  const roll = mesh(geo('scroll.roll', () => new THREE.CylinderGeometry(0.18, 0.18, 0.9, 10)), paper);
  roll.rotation.z = Math.PI / 2;
  const ribbon = mesh(geo('scroll.ribbon', () => new THREE.CylinderGeometry(0.19, 0.19, 0.12, 10)), mat(tier ? 0x3060ff : 0xb02020));
  ribbon.rotation.z = Math.PI / 2;
  const caps = geo('scroll.cap', () => new THREE.CylinderGeometry(0.08, 0.08, 1.05, 6));
  const cap = mesh(caps, mat(0x6a4a2a));
  cap.rotation.z = Math.PI / 2;
  g.add(roll, ribbon, cap);
  const glow = glowSprite(tier ? 0xffd040 : 0xfff0c0, tier ? 2.2 : 1.5, tier ? 0.8 : 0.45);
  g.add(glow);
  return g;
}

export function buildPotion(blue) {
  const g = new THREE.Group();
  const color = blue ? 0x3a7aff : 0xff2a3a;
  const glass = new THREE.MeshStandardMaterial({ color: 0xffffff, transparent: true, opacity: 0.35, roughness: 0.1, metalness: 0.1 });
  glass.userData.keep = true;
  const liquid = new THREE.MeshBasicMaterial({ color });
  g.add(mesh(geo('pot.liquid', () => new THREE.SphereGeometry(0.27, 12, 10)), liquid, 0, 0, 0));
  g.add(mesh(geo('pot.glass', () => new THREE.SphereGeometry(0.31, 12, 10)), glass, 0, 0, 0));
  g.add(mesh(geo('pot.neck', () => new THREE.CylinderGeometry(0.09, 0.11, 0.3, 8)), glass, 0, 0.36, 0));
  g.add(mesh(geo('pot.cork', () => new THREE.CylinderGeometry(0.1, 0.09, 0.12, 8)), mat(0x8a6a40), 0, 0.55, 0));
  g.add(glowSprite(color, 1.6, 0.7));
  return g;
}

export function buildRing() {
  const g = new THREE.Group();
  const gold = new THREE.MeshStandardMaterial({ color: 0xffc840, metalness: 0.9, roughness: 0.25, emissive: 0x302000 });
  g.add(mesh(geo('ring.band', () => new THREE.TorusGeometry(0.26, 0.06, 8, 20)), gold));
  g.add(mesh(geo('ring.gem', () => new THREE.OctahedronGeometry(0.11)), new THREE.MeshBasicMaterial({ color: 0x40ffd0 }), 0, 0.3, 0));
  g.add(glowSprite(0xffe080, 1.6, 0.6));
  return g;
}

export function buildStairs() {
  const g = new THREE.Group();
  const stone = mat(0x6a6660);
  const dark = new THREE.MeshBasicMaterial({ color: 0x020203 });
  const pit = mesh(geo('stairs.pit', () => new THREE.PlaneGeometry(3.4, 3.4)), dark, 0, 0.01, 0);
  pit.rotation.x = -Math.PI / 2;
  g.add(pit);
  for (let i = 0; i < 5; i++) {
    const step = mesh(geo('stairs.step', () => new THREE.BoxGeometry(3.0, 0.12, 0.62)), stone, 0, -0.05 - i * 0.02, -1.2 + i * 0.62);
    step.material = mat(0x6a6660).clone();
    step.material.color.multiplyScalar(1 - i * 0.17);
    g.add(step);
  }
  const frameGeo = geo('stairs.frame', () => new THREE.BoxGeometry(4.0, 0.3, 0.3));
  const frameSide = geo('stairs.frameside', () => new THREE.BoxGeometry(0.3, 0.3, 4.0));
  g.add(mesh(frameGeo, stone, 0, 0.15, -1.85), mesh(frameGeo, stone, 0, 0.15, 1.85));
  g.add(mesh(frameSide, stone, -1.85, 0.15, 0), mesh(frameSide, stone, 1.85, 0.15, 0));
  const seal = new THREE.Mesh(
    geo('stairs.seal', () => new THREE.PlaneGeometry(3.6, 3.6)),
    new THREE.MeshBasicMaterial({ map: runeMap(), color: 0xff4020, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false })
  );
  seal.rotation.x = -Math.PI / 2;
  seal.position.y = 0.2;
  g.add(seal);
  const beam = new THREE.Mesh(
    geo('stairs.beam', () => new THREE.CylinderGeometry(1.5, 1.5, 6, 20, 1, true)),
    new THREE.MeshBasicMaterial({ color: 0x60c0ff, transparent: true, opacity: 0.12, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide })
  );
  beam.position.y = 3;
  g.add(beam);
  g.userData.seal = seal;
  g.userData.beam = beam;
  return g;
}

// ---------------------------------------------------------------- spells

export function buildOrb(color, radius, glowScale = 4) {
  const g = new THREE.Group();
  g.add(mesh(geo('orb.' + radius, () => new THREE.IcosahedronGeometry(radius, 1)), new THREE.MeshBasicMaterial({ color })));
  g.add(glowSprite(color, radius * glowScale));
  return g;
}

export function buildRock(radius) {
  const g = new THREE.Group();
  g.add(mesh(geo('rock.' + radius, () => new THREE.DodecahedronGeometry(radius)), mat(0x8a8078)));
  return g;
}

export function buildIronshot() {
  const g = new THREE.Group();
  const iron = new THREE.MeshStandardMaterial({ color: 0x9aa4b0, metalness: 0.95, roughness: 0.25, emissive: 0x202830 });
  g.add(mesh(geo('iron', () => new THREE.SphereGeometry(0.28, 14, 10)), iron));
  g.add(glowSprite(0xc0d8ff, 1.4, 0.7));
  return g;
}

// What polymorph turns an orc into.
export function buildSheep() {
  const g = new THREE.Group();
  const wool = mat(0xece8de);
  const face = mat(0x2a2422);
  g.add(mesh(geo('sheep.body', () => new THREE.IcosahedronGeometry(0.62, 1)), wool, 0, 0.82, 0));
  g.children[0].scale.set(0.95, 0.85, 1.25);
  for (const [x, z] of [[-0.3, 0.5], [0.3, 0.5], [-0.3, -0.5], [0.3, -0.5]]) {
    g.add(mesh(geo('sheep.leg', () => new THREE.BoxGeometry(0.14, 0.5, 0.14)), face, x, 0.25, z));
  }
  const head = new THREE.Group();
  head.add(mesh(geo('sheep.head', () => new THREE.BoxGeometry(0.34, 0.36, 0.46)), face, 0, 0, 0));
  head.add(mesh(geo('sheep.tuft', () => new THREE.IcosahedronGeometry(0.22, 0)), wool, 0, 0.2, -0.08));
  for (const x of [-0.24, 0.24]) {
    const ear = mesh(geo('sheep.ear', () => new THREE.BoxGeometry(0.2, 0.06, 0.12)), face, x, 0.08, -0.05);
    ear.rotation.z = x < 0 ? 0.4 : -0.4;
    head.add(ear);
  }
  head.position.set(0, 1.12, 0.78);
  g.add(head);
  return g;
}

// Spiritual weapon: a glowing spectral sword.
export function buildSpectralBlade() {
  const g = new THREE.Group();
  const spirit = new THREE.MeshBasicMaterial({ color: 0x80e0ff, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false });
  const blade = new THREE.Group();
  blade.add(mesh(geo('sword.spirit.blade', () => new THREE.BoxGeometry(0.1, 1.5, 0.28)), spirit, 0, 0.95, 0));
  blade.add(mesh(geo('sword.spirit.tip', () => new THREE.ConeGeometry(0.2, 0.35, 4)), spirit, 0, 1.87, 0));
  blade.add(mesh(geo('sword.spirit.guard', () => new THREE.BoxGeometry(0.14, 0.1, 0.8)), spirit, 0, 0.18, 0));
  blade.add(mesh(geo('sword.spirit.grip', () => new THREE.CylinderGeometry(0.05, 0.05, 0.4, 6)), spirit, 0, -0.06, 0));
  blade.add(glowSprite(0x60c0ff, 2.2, 0.6));
  blade.children[blade.children.length - 1].position.y = 0.9;
  g.add(blade);
  return g;
}

// Flat disc on the ground marking an area spell.
export function buildZone(color, radiusUnits, opacity = 0.35) {
  const g = new THREE.Group();
  const disc = new THREE.Mesh(
    geo('zone.disc', () => new THREE.CircleGeometry(1, 40)),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false })
  );
  disc.rotation.x = -Math.PI / 2;
  disc.position.y = 0.05;
  disc.scale.set(radiusUnits, radiusUnits, 1);
  const rune = new THREE.Mesh(
    geo('zone.rune', () => new THREE.PlaneGeometry(2, 2)),
    new THREE.MeshBasicMaterial({ map: runeMap(), color, transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false })
  );
  rune.rotation.x = -Math.PI / 2;
  rune.position.y = 0.07;
  rune.scale.set(radiusUnits, radiusUnits, 1);
  g.add(disc, rune);
  g.userData.rune = rune;
  return g;
}

// Targeting reticle that follows the mouse.
export function buildCursor() {
  const g = new THREE.Group();
  const ring = new THREE.Mesh(
    geo('cursor.ring', () => new THREE.RingGeometry(0.42, 0.52, 32)),
    new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.7, depthWrite: false, side: THREE.DoubleSide })
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.04;
  g.add(ring);
  const area = new THREE.Mesh(
    geo('cursor.area', () => new THREE.RingGeometry(0.96, 1.0, 64)),
    new THREE.MeshBasicMaterial({ color: 0x80c8ff, transparent: true, opacity: 0.5, depthWrite: false, side: THREE.DoubleSide })
  );
  area.rotation.x = -Math.PI / 2;
  area.position.y = 0.045;
  area.visible = false;
  g.add(area);
  g.userData.ring = ring;
  g.userData.area = area;
  return g;
}
