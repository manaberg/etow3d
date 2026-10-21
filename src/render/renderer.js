import * as THREE from 'three';
import { UNIT, clamp } from '../core/constants.js';
import { buildDungeonMesh } from './dungeonMesh.js';
import { buildFieldMesh } from './fieldMesh.js';
import { Fx } from './fx.js';

const ROOM_LIGHTS = 6;
const FX_LIGHTS = 4;

// Owns the Three.js scene: camera rig, lights, the floor's meshes and the
// effect layer. Everything outside talks to it in simulation pixels.
export class Gfx {
  constructor(container) {
    this.container = container;
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.15;
    container.appendChild(this.renderer.domElement);
    this.canvas = this.renderer.domElement;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x07070a);
    this.scene.fog = new THREE.Fog(0x07070a, 26, 58);

    this.camera = new THREE.PerspectiveCamera(42, 1, 0.5, 400);
    this.zoom = 26;
    this.zoomTarget = 26;
    this.zoomMin = 15;
    this.zoomMax = 40;
    this.elevation = THREE.MathUtils.degToRad(52);
    this.focus = new THREE.Vector3();
    this.shake = 0;

    this.hemisphere = new THREE.HemisphereLight(0x9aa0c0, 0x30241a, 1.9);
    this.scene.add(this.hemisphere);
    this.ambient = new THREE.AmbientLight(0x505060, 0.9);
    this.scene.add(this.ambient);

    // the mage's staff lights the way
    this.playerLight = new THREE.PointLight(0xffd9a8, 40, 16, 1.6);
    this.scene.add(this.playerLight);

    // a fixed pool of lights handed to the torches closest to the camera, so
    // the light count (and the compiled shaders) never change
    this.roomLights = [];
    for (let i = 0; i < ROOM_LIGHTS; i++) {
      const light = new THREE.PointLight(0xffaa66, 0, 14, 1.5);
      this.scene.add(light);
      this.roomLights.push(light);
    }
    this.fxLights = [];
    for (let i = 0; i < FX_LIGHTS; i++) {
      const light = new THREE.PointLight(0xffffff, 0, 10, 1.6);
      this.scene.add(light);
      this.fxLights.push(light);
    }
    this.lightRequests = [];
    this.flashes = [];

    this.levelGroup = null;
    this.torches = [];
    this.cutaway = { center: { value: new THREE.Vector3() }, strength: { value: 1 } };
    this.fx = new Fx(this.scene);

    this.raycaster = new THREE.Raycaster();
    this.groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    this.tmpV = new THREE.Vector3();
    this.tmpV2 = new THREE.Vector2();

    this.resize();
    this.onResize = () => this.resize();
    window.addEventListener('resize', this.onResize);
  }

  resize() {
    const w = this.container.clientWidth || window.innerWidth;
    const h = this.container.clientHeight || window.innerHeight;
    this.width = w;
    this.height = h;
    this.renderer.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  toWorld(x, y, h = 0, target = new THREE.Vector3()) {
    return target.set(x * UNIT, h, y * UNIT);
  }

  add(object) {
    this.scene.add(object);
    return object;
  }

  remove(object) {
    if (object && object.parent) {
      object.parent.remove(object);
    }
  }

  // `field` draws an open battlefield instead of dungeon halls.
  buildLevel(world, field) {
    if (this.levelGroup) {
      this.scene.remove(this.levelGroup);
      this.levelGroup.traverse((o) => {
        if (o.geometry && o.userData.ownGeometry) {
          o.geometry.dispose();
        }
      });
    }
    this.fx.clear();
    const built = field ? buildFieldMesh(world) : buildDungeonMesh(world, this.cutaway);
    this.levelGroup = built.group;
    this.torches = built.torches;
    this.scene.add(this.levelGroup);
  }

  // Battlefields are open ground under a grey sky rather than torchlit halls:
  // brighter, hazy in the distance, and the camera pulls much further back.
  setBattlefield(on) {
    this.hemisphere.intensity = on ? 2.6 : 1.9;
    this.hemisphere.color.setHex(on ? 0xd8e0f0 : 0x9aa0c0);
    this.hemisphere.groundColor.setHex(on ? 0x4a5030 : 0x30241a);
    this.ambient.intensity = on ? 1.2 : 0.9;
    const sky = on ? 0x9aa6b0 : 0x07070a;
    this.scene.background.setHex(sky);
    this.scene.fog.color.setHex(sky);
    this.scene.fog.near = on ? 70 : 26;
    this.scene.fog.far = on ? 190 : 58;
    this.zoomMax = on ? 90 : 40;
    this.zoomTarget = on ? 46 : 26;
  }

  zoomBy(steps) {
    const step = this.zoomMax > 40 ? 5 : 2.5;
    this.zoomTarget = clamp(this.zoomTarget + steps * step, this.zoomMin, this.zoomMax);
  }

  addShake(amount) {
    this.shake = Math.min(1.2, this.shake + amount);
  }

  // Asks for a light at a spot this frame (projectiles, burning zones).
  requestLight(x, y, h, color, intensity) {
    this.lightRequests.push({ x: x * UNIT, y: h, z: y * UNIT, color, intensity });
  }

  flash(x, y, h, color, intensity, seconds) {
    this.flashes.push({ x: x * UNIT, y: h, z: y * UNIT, color, intensity, life: seconds, max: seconds });
  }

  // Ground point under the mouse, in sim pixels.
  pickGround(mouse) {
    this.tmpV2.set((mouse.x / this.width) * 2 - 1, -(mouse.y / this.height) * 2 + 1);
    this.raycaster.setFromCamera(this.tmpV2, this.camera);
    const hit = this.raycaster.ray.intersectPlane(this.groundPlane, this.tmpV);
    if (!hit) {
      return null;
    }
    return { x: hit.x / UNIT, y: hit.z / UNIT };
  }

  // Screen position (CSS px) of a sim point at height h, or null if behind.
  project(x, y, h) {
    const v = this.tmpV.set(x * UNIT, h, y * UNIT).project(this.camera);
    if (v.z > 1) {
      return null;
    }
    return { x: (v.x + 1) / 2 * this.width, y: (1 - v.y) / 2 * this.height };
  }

  render(dt, time, focusX, focusY, playerHidden) {
    // camera rig
    this.zoom += (this.zoomTarget - this.zoom) * Math.min(1, dt * 8);
    const fx = focusX * UNIT;
    const fz = focusY * UNIT;
    this.focus.x += (fx - this.focus.x) * Math.min(1, dt * 10);
    this.focus.z += (fz - this.focus.z) * Math.min(1, dt * 10);
    if (Math.abs(fx - this.focus.x) > 12 || Math.abs(fz - this.focus.z) > 12) {
      this.focus.set(fx, 0, fz);
    }
    const shakeX = (Math.random() - 0.5) * this.shake;
    const shakeZ = (Math.random() - 0.5) * this.shake;
    this.shake = Math.max(0, this.shake - dt * 2.5);
    this.camera.position.set(
      this.focus.x + shakeX,
      this.zoom * Math.sin(this.elevation),
      this.focus.z + this.zoom * Math.cos(this.elevation) + shakeZ
    );
    this.camera.lookAt(this.focus.x + shakeX, 0.8, this.focus.z + shakeZ);
    this.cutaway.center.value.set(fx, 0, fz);
    this.cutaway.strength.value = playerHidden ? 0 : 1;

    this.playerLight.position.set(fx, 3.2, fz + 0.4);
    this.playerLight.intensity = 34 + Math.sin(time * 7) * 2 + Math.sin(time * 13.3) * 1.5;

    this.assignTorchLights(time);
    this.assignFxLights(dt);
    this.fx.update(dt, this.camera);
    this.renderer.render(this.scene, this.camera);
  }

  assignTorchLights(time) {
    const cx = this.focus.x;
    const cz = this.focus.z;
    const ranked = this.torches
      .map((t) => ({ t, d: (t.x - cx) * (t.x - cx) + (t.z - cz) * (t.z - cz) }))
      .sort((a, b) => a.d - b.d);
    for (let i = 0; i < this.roomLights.length; i++) {
      const light = this.roomLights[i];
      const entry = ranked[i];
      if (!entry) {
        light.intensity = 0;
        continue;
      }
      const t = entry.t;
      light.position.set(t.x, t.y, t.z);
      light.color.setHex(t.color);
      const flicker = 1 + Math.sin(time * 9 + t.phase) * 0.08 + Math.sin(time * 23.7 + t.phase * 2) * 0.05;
      light.intensity = 22 * flicker;
      if (t.flame) {
        t.flame.scale.setScalar(0.9 + Math.sin(time * 15 + t.phase) * 0.12);
      }
    }
  }

  assignFxLights(dt) {
    const requests = this.lightRequests;
    for (let i = this.flashes.length - 1; i >= 0; i--) {
      const f = this.flashes[i];
      f.life -= dt;
      if (f.life <= 0) {
        this.flashes.splice(i, 1);
        continue;
      }
      requests.push({ x: f.x, y: f.y, z: f.z, color: f.color, intensity: f.intensity * (f.life / f.max) });
    }
    const cx = this.focus.x;
    const cz = this.focus.z;
    requests.sort((a, b) => {
      const da = (a.x - cx) * (a.x - cx) + (a.z - cz) * (a.z - cz) - a.intensity * 4;
      const db = (b.x - cx) * (b.x - cx) + (b.z - cz) * (b.z - cz) - b.intensity * 4;
      return da - db;
    });
    for (let i = 0; i < this.fxLights.length; i++) {
      const light = this.fxLights[i];
      const r = requests[i];
      if (!r) {
        light.intensity = 0;
        continue;
      }
      light.position.set(r.x, r.y, r.z);
      light.color.setHex(r.color);
      light.intensity = r.intensity;
    }
    this.lightRequests = [];
  }

  dispose() {
    window.removeEventListener('resize', this.onResize);
    this.renderer.dispose();
    if (this.canvas.parentNode) {
      this.canvas.parentNode.removeChild(this.canvas);
    }
  }
}
