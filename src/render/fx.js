import * as THREE from 'three';
import { UNIT } from '../core/constants.js';
import { glowTexture, ringTexture } from './textures.js';

const MAX_PARTICLES = 6000;

const vertexShader = `
  attribute float aSize;
  attribute float aAlpha;
  attribute vec3 aColor;
  varying float vAlpha;
  varying vec3 vColor;
  uniform float uScale;
  void main() {
    vAlpha = aAlpha;
    vColor = aColor;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_PointSize = aSize * uScale / -mv.z;
    gl_Position = projectionMatrix * mv;
  }
`;

const fragmentShader = `
  uniform sampler2D uMap;
  varying float vAlpha;
  varying vec3 vColor;
  void main() {
    vec4 tex = texture2D(uMap, gl_PointCoord);
    gl_FragColor = vec4(vColor * tex.rgb, tex.a * vAlpha);
  }
`;

// Additive particles plus short-lived meshes (shock rings, bolts of
// lightning). Positions given in simulation pixels and world-unit heights.
export class Fx {
  constructor(scene) {
    this.scene = scene;
    this.count = 0;
    this.p = [];
    for (let i = 0; i < MAX_PARTICLES; i++) {
      this.p.push({ x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, life: 0, max: 1, size: 1, r: 1, g: 1, b: 1, gravity: 0, drag: 0, grow: 0, fadeIn: 0 });
    }
    this.positions = new Float32Array(MAX_PARTICLES * 3);
    this.colors = new Float32Array(MAX_PARTICLES * 3);
    this.sizes = new Float32Array(MAX_PARTICLES);
    this.alphas = new Float32Array(MAX_PARTICLES);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.positions, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('aColor', new THREE.BufferAttribute(this.colors, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('aSize', new THREE.BufferAttribute(this.sizes, 1).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('aAlpha', new THREE.BufferAttribute(this.alphas, 1).setUsage(THREE.DynamicDrawUsage));
    this.geometry = geo;
    this.material = new THREE.ShaderMaterial({
      uniforms: { uMap: { value: glowTexture() }, uScale: { value: 600 } },
      vertexShader,
      fragmentShader,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending
    });
    this.points = new THREE.Points(geo, this.material);
    this.points.frustumCulled = false;
    this.points.renderOrder = 10;
    scene.add(this.points);

    this.transients = [];
    this.ringTex = ringTexture();
    this.ringGeo = new THREE.PlaneGeometry(1, 1);
    this.color = new THREE.Color();
  }

  clear() {
    this.count = 0;
    for (const t of this.transients) {
      this.scene.remove(t.mesh);
      if (t.ownGeometry) {
        t.mesh.geometry.dispose();
      }
      t.mesh.material.dispose();
    }
    this.transients = [];
  }

  // One particle. x, y in sim pixels, h in world units; velocities in units/s.
  emit(x, y, h, o) {
    if (this.count >= MAX_PARTICLES) {
      return;
    }
    const p = this.p[this.count++];
    p.x = x * UNIT;
    p.y = h;
    p.z = y * UNIT;
    p.vx = o.vx || 0;
    p.vy = o.vy || 0;
    p.vz = o.vz || 0;
    p.life = p.max = o.life || 0.6;
    p.size = o.size || 1;
    p.grow = o.grow || 0;
    p.gravity = o.gravity || 0;
    p.drag = o.drag || 0;
    // the share of its life a particle takes to fade in (ambient motes)
    p.fadeIn = o.fadeIn || 0;
    this.color.setHex(o.color === undefined ? 0xffffff : o.color);
    p.r = this.color.r;
    p.g = this.color.g;
    p.b = this.color.b;
  }

  // Spherical burst of `count` particles.
  burst(x, y, h, o) {
    const count = o.count || 16;
    const speed = o.speed || 3;
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2;
      const up = (Math.random() * 2 - 1) * (o.flat ? 0.2 : 1);
      const s = speed * (0.35 + Math.random() * 0.65);
      const horiz = Math.sqrt(1 - Math.min(1, up * up));
      this.emit(x, y, h, {
        vx: Math.cos(a) * horiz * s,
        vz: Math.sin(a) * horiz * s,
        vy: up * s + (o.lift || 0),
        life: (o.life || 0.6) * (0.6 + Math.random() * 0.4),
        size: (o.size || 1) * (0.7 + Math.random() * 0.6),
        color: Array.isArray(o.color) ? o.color[i % o.color.length] : o.color,
        gravity: o.gravity,
        drag: o.drag === undefined ? 2 : o.drag,
        grow: o.grow
      });
    }
  }

  // Particles rising from a disc on the ground (heals, auras, zones).
  column(x, y, radiusPx, o) {
    const count = o.count || 10;
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2;
      const r = Math.sqrt(Math.random()) * radiusPx;
      this.emit(x + Math.cos(a) * r, y + Math.sin(a) * r, o.h || 0.1, {
        vy: o.rise === undefined ? 1.5 : o.rise,
        vx: (Math.random() - 0.5) * (o.jitter || 0.3),
        vz: (Math.random() - 0.5) * (o.jitter || 0.3),
        life: (o.life || 1) * (0.6 + Math.random() * 0.4),
        size: (o.size || 0.8) * (0.7 + Math.random() * 0.6),
        color: Array.isArray(o.color) ? o.color[i % o.color.length] : o.color,
        gravity: o.gravity,
        drag: o.drag,
        grow: o.grow
      });
    }
  }

  // Expanding ring on the ground.
  ring(x, y, o) {
    const mat = new THREE.MeshBasicMaterial({
      map: this.ringTex, color: o.color, transparent: true, depthWrite: false,
      blending: THREE.AdditiveBlending, side: THREE.DoubleSide
    });
    const mesh = new THREE.Mesh(this.ringGeo, mat);
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(x * UNIT, o.h || 0.06, y * UNIT);
    mesh.renderOrder = 9;
    this.scene.add(mesh);
    this.transients.push({
      mesh, life: o.life || 0.5, max: o.life || 0.5,
      from: (o.from || 10) * UNIT * 2, to: (o.radius || 96) * UNIT * 2, ownGeometry: false
    });
  }

  // Jagged bolt between two sim points (lightning, chains), at height `h`,
  // or from `h` down to `h2` (lightning out of the sky).
  bolt(ax, ay, bx, by, o) {
    const pts = [];
    const segs = 9;
    const h = o.h || 1.4;
    const h2 = o.h2 === undefined ? h : o.h2;
    const jag = o.jag === undefined ? 0.35 : o.jag;
    for (let i = 0; i <= segs; i++) {
      const t = i / segs;
      const off = (i === 0 || i === segs) ? 0 : 1;
      pts.push(new THREE.Vector3(
        (ax + (bx - ax) * t) * UNIT + (Math.random() - 0.5) * jag * off,
        h + (h2 - h) * t + (Math.random() - 0.5) * jag * off,
        (ay + (by - ay) * t) * UNIT + (Math.random() - 0.5) * jag * off
      ));
    }
    const curve = new THREE.CatmullRomCurve3(pts, false, 'catmullrom', 0.1);
    const geo = new THREE.TubeGeometry(curve, segs * 3, o.width || 0.06, 5, false);
    const mat = new THREE.MeshBasicMaterial({
      color: o.color, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.renderOrder = 11;
    this.scene.add(mesh);
    this.transients.push({ mesh, life: o.life || 0.2, max: o.life || 0.2, ownGeometry: true });
  }

  update(dt, camera) {
    this.material.uniforms.uScale.value = (window.innerHeight || 800) * 0.9 / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)));
    let i = 0;
    while (i < this.count) {
      const p = this.p[i];
      p.life -= dt;
      if (p.life <= 0) {
        // swap-remove keeps the live particles packed
        this.count--;
        const last = this.p[this.count];
        this.p[this.count] = p;
        this.p[i] = last;
        continue;
      }
      const damp = Math.max(0, 1 - p.drag * dt);
      p.vx *= damp;
      p.vz *= damp;
      p.vy = p.vy * damp - p.gravity * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.z += p.vz * dt;
      if (p.y < 0.03) {
        p.y = 0.03;
        p.vy = Math.abs(p.vy) * 0.3;
      }
      const t = p.life / p.max;
      this.positions[i * 3] = p.x;
      this.positions[i * 3 + 1] = p.y;
      this.positions[i * 3 + 2] = p.z;
      this.colors[i * 3] = p.r;
      this.colors[i * 3 + 1] = p.g;
      this.colors[i * 3 + 2] = p.b;
      this.sizes[i] = p.size * (1 + p.grow * (1 - t));
      this.alphas[i] = Math.min(1, t * 2.2) * (p.fadeIn ? Math.min(1, (1 - t) / p.fadeIn) : 1);
      i++;
    }
    this.geometry.setDrawRange(0, this.count);
    for (const name of ['position', 'aColor', 'aSize', 'aAlpha']) {
      const attr = this.geometry.attributes[name];
      attr.needsUpdate = true;
      attr.clearUpdateRanges();
      attr.addUpdateRange(0, this.count * attr.itemSize);
    }

    for (let t = this.transients.length - 1; t >= 0; t--) {
      const tr = this.transients[t];
      tr.life -= dt;
      const k = Math.max(0, tr.life / tr.max);
      tr.mesh.material.opacity = k;
      if (tr.to !== undefined) {
        const s = tr.from + (tr.to - tr.from) * (1 - k * k);
        tr.mesh.scale.set(s, s, s);
      }
      if (tr.life <= 0) {
        this.scene.remove(tr.mesh);
        if (tr.ownGeometry) {
          tr.mesh.geometry.dispose();
        }
        tr.mesh.material.dispose();
        this.transients.splice(t, 1);
      }
    }
  }
}
