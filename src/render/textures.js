import * as THREE from 'three';

// Procedural greyscale textures; materials tint them per room theme, so no
// image assets are needed.

function makeCanvas(size) {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  return canvas;
}

// A context for painting textures that read their pixels back (noise,
// cells): kept on the CPU, as reading a GPU canvas back stalls.
function paintContext(canvas) {
  return canvas.getContext('2d', { willReadFrequently: true });
}

function noise(ctx, size, amount, alpha) {
  const img = ctx.getImageData(0, 0, size, size);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const n = (Math.random() - 0.5) * amount;
    d[i] = Math.max(0, Math.min(255, d[i] + n));
    d[i + 1] = Math.max(0, Math.min(255, d[i + 1] + n));
    d[i + 2] = Math.max(0, Math.min(255, d[i + 2] + n));
    d[i + 3] = alpha === undefined ? d[i + 3] : alpha;
  }
  ctx.putImageData(img, 0, 0);
}

function finish(canvas, repeat) {
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = 8;
  if (repeat) {
    tex.repeat.set(repeat, repeat);
  }
  return tex;
}

// Four irregular flagstones per 48px cell.
export function floorTexture() {
  const size = 256;
  const canvas = makeCanvas(size);
  const ctx = paintContext(canvas);
  ctx.fillStyle = '#3a3a3a';
  ctx.fillRect(0, 0, size, size);
  const half = size / 2;
  for (let sy = 0; sy < 2; sy++) {
    for (let sx = 0; sx < 2; sx++) {
      const shade = 170 + Math.floor(Math.random() * 50);
      ctx.fillStyle = `rgb(${shade},${shade},${shade})`;
      const inset = 5;
      ctx.beginPath();
      ctx.roundRect(sx * half + inset, sy * half + inset, half - inset * 2, half - inset * 2, 10);
      ctx.fill();
      // cracks and wear
      ctx.strokeStyle = 'rgba(40,40,40,0.35)';
      ctx.lineWidth = 2;
      for (let c = 0; c < 2; c++) {
        ctx.beginPath();
        let px = sx * half + 15 + Math.random() * (half - 30);
        let py = sy * half + 15 + Math.random() * (half - 30);
        ctx.moveTo(px, py);
        for (let s = 0; s < 4; s++) {
          px += (Math.random() - 0.5) * 30;
          py += (Math.random() - 0.5) * 30;
          ctx.lineTo(px, py);
        }
        ctx.stroke();
      }
    }
  }
  noise(ctx, size, 38);
  return finish(canvas);
}

// Staggered brick courses for the wall faces.
export function brickTexture() {
  const size = 256;
  const canvas = makeCanvas(size);
  const ctx = paintContext(canvas);
  ctx.fillStyle = '#2e2e2e';
  ctx.fillRect(0, 0, size, size);
  const rows = 8;
  const rowH = size / rows;
  const brickW = size / 3;
  for (let r = 0; r < rows; r++) {
    const offset = (r % 2) * (brickW / 2);
    for (let b = -1; b < 4; b++) {
      const shade = 150 + Math.floor(Math.random() * 70);
      ctx.fillStyle = `rgb(${shade},${shade - 4},${shade - 8})`;
      ctx.fillRect(b * brickW + offset + 3, r * rowH + 3, brickW - 6, rowH - 6);
    }
  }
  noise(ctx, size, 46);
  return finish(canvas);
}

// Soft round dot used for particles, glows and blob shadows.
export function glowTexture() {
  const size = 64;
  const canvas = makeCanvas(size);
  const ctx = canvas.getContext('2d');
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.35, 'rgba(255,255,255,0.55)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// Ring with a soft edge, for targeting circles and area spells.
export function ringTexture() {
  const size = 128;
  const canvas = makeCanvas(size);
  const ctx = canvas.getContext('2d');
  const g = ctx.createRadialGradient(size / 2, size / 2, size * 0.3, size / 2, size / 2, size / 2);
  g.addColorStop(0, 'rgba(255,255,255,0)');
  g.addColorStop(0.75, 'rgba(255,255,255,0.15)');
  g.addColorStop(0.92, 'rgba(255,255,255,1)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// Rune circle drawn on the stairs seal and spell zones.
export function runeTexture() {
  const size = 256;
  const canvas = makeCanvas(size);
  const ctx = canvas.getContext('2d');
  ctx.translate(size / 2, size / 2);
  ctx.strokeStyle = 'rgba(255,255,255,0.95)';
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.arc(0, 0, size * 0.44, 0, Math.PI * 2);
  ctx.stroke();
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(0, 0, size * 0.34, 0, Math.PI * 2);
  ctx.stroke();
  ctx.lineWidth = 3;
  ctx.beginPath();
  for (let i = 0; i <= 6; i++) {
    const a = (i * 2 * Math.PI * 2) / 6 - Math.PI / 2;
    const r = size * 0.34;
    if (i === 0) {
      ctx.moveTo(Math.cos(a) * r, Math.sin(a) * r);
    } else {
      ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
    }
  }
  ctx.stroke();
  ctx.font = 'bold 22px serif';
  ctx.fillStyle = 'rgba(255,255,255,0.9)';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const glyphs = 'ᚠᚢᚦᚨᚱᚲᚷᚹᚺᚾᛁᛃ';
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    ctx.save();
    ctx.rotate(a);
    ctx.fillText(glyphs[i], 0, -size * 0.39);
    ctx.restore();
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// ------------------------------------------------------------ floor looks

// Floor, wall, liquid and decal textures for the floor looks (world/looks.js),
// by name, drawn once and shared. Most are greyscale and take their colour
// from the floor's or wall's tint; `glow:` maps light up cracks and runes.
const surfaces = new Map();

export function surfaceTexture(name) {
  let tex = surfaces.get(name);
  if (!tex) {
    const make = Surfaces[name];
    if (!make) {
      return null;
    }
    tex = make();
    surfaces.set(name, tex);
  }
  return tex;
}

function draw(size, paint, { srgb = true } = {}) {
  const canvas = makeCanvas(size);
  const ctx = paintContext(canvas);
  paint(ctx, size);
  const tex = finish(canvas);
  if (!srgb) {
    tex.colorSpace = THREE.NoColorSpace;
  }
  return tex;
}

function grey(v, a = 1) {
  const c = Math.max(0, Math.min(255, Math.round(v)));
  return a === 1 ? `rgb(${c},${c},${c})` : `rgba(${c},${c},${c},${a})`;
}

function rand(a, b) {
  return a + Math.random() * (b - a);
}

// Draws `paint(x, y)` at a point and at its copies across the edges, so
// blobs near an edge wrap around and the texture tiles without seams.
function wrapped(size, x, y, reach, paint) {
  for (const ox of [-size, 0, size]) {
    for (const oy of [-size, 0, size]) {
      if (x + ox > -reach && x + ox < size + reach && y + oy > -reach && y + oy < size + reach) {
        paint(x + ox, y + oy);
      }
    }
  }
}

function blotches(ctx, size, count, r0, r1, color) {
  for (let i = 0; i < count; i++) {
    const r = rand(r0, r1);
    const fill = color();
    wrapped(size, Math.random() * size, Math.random() * size, r, (x, y) => {
      const g = ctx.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, fill);
      g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g;
      ctx.fillRect(x - r, y - r, r * 2, r * 2);
    });
  }
}

// A wandering crack from (x, y).
function crack(ctx, x, y, steps, stride, width, color) {
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.beginPath();
  ctx.moveTo(x, y);
  let a = Math.random() * Math.PI * 2;
  for (let s = 0; s < steps; s++) {
    a += rand(-0.7, 0.7);
    x += Math.cos(a) * stride;
    y += Math.sin(a) * stride;
    ctx.lineTo(x, y);
  }
  ctx.stroke();
}

// Voronoi cells over a tiling square: for every pixel the nearest and second
// nearest of `points` (wrapped), so cells and their borders can be shaded.
function voronoi(size, points, shade) {
  const img = new ImageData(size, size);
  const d = img.data;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let d1 = Infinity;
      let d2 = Infinity;
      let nearest = 0;
      for (let i = 0; i < points.length; i++) {
        let dx = Math.abs(x - points[i][0]);
        let dy = Math.abs(y - points[i][1]);
        dx = Math.min(dx, size - dx);
        dy = Math.min(dy, size - dy);
        const dist = dx * dx + dy * dy;
        if (dist < d1) {
          d2 = d1;
          d1 = dist;
          nearest = i;
        } else if (dist < d2) {
          d2 = dist;
        }
      }
      const [r, g, b] = shade(nearest, Math.sqrt(d2) - Math.sqrt(d1), x, y);
      const k = (y * size + x) * 4;
      d[k] = r;
      d[k + 1] = g;
      d[k + 2] = b;
      d[k + 3] = 255;
    }
  }
  return img;
}

function scatterPoints(n, size) {
  const pts = [];
  for (let i = 0; i < n; i++) {
    pts.push([Math.random() * size, Math.random() * size]);
  }
  return pts;
}

// Square tiles with grout and a bevel: light top-left edges, dark bottom-right.
function tileGrid(ctx, size, per, grout, shade) {
  const step = size / per;
  ctx.fillStyle = grey(grout);
  ctx.fillRect(0, 0, size, size);
  for (let ty = 0; ty < per; ty++) {
    for (let tx = 0; tx < per; tx++) {
      const x = tx * step + 2;
      const y = ty * step + 2;
      const w = step - 4;
      const v = shade();
      ctx.fillStyle = grey(v);
      ctx.fillRect(x, y, w, w);
      ctx.fillStyle = grey(v + 28, 0.8);
      ctx.fillRect(x, y, w, 3);
      ctx.fillRect(x, y, 3, w);
      ctx.fillStyle = grey(v - 40, 0.8);
      ctx.fillRect(x, y + w - 3, w, 3);
      ctx.fillRect(x + w - 3, y, 3, w);
    }
  }
}

// Courses of dressed stone blocks, staggered.
function blockCourses(ctx, size, courses, perCourse, mortar, shade) {
  ctx.fillStyle = grey(mortar);
  ctx.fillRect(0, 0, size, size);
  const h = size / courses;
  const w = size / perCourse;
  for (let r = 0; r < courses; r++) {
    const offset = (r % 2) * (w / 2);
    for (let b = -1; b <= perCourse; b++) {
      const x = b * w + offset + 3;
      const y = r * h + 3;
      const v = shade();
      ctx.fillStyle = grey(v);
      ctx.fillRect(x, y, w - 6, h - 6);
      ctx.fillStyle = grey(v + 30, 0.7);
      ctx.fillRect(x, y, w - 6, 3);
      ctx.fillStyle = grey(v - 45, 0.7);
      ctx.fillRect(x, y + h - 9, w - 6, 3);
    }
  }
}

const RUNES = 'ᚠᚢᚦᚨᚱᚲᚷᚹᚺᚾᛁᛃᛇᛈᛉᛊᛏᛒᛖᛗᛚᛜᛞᛟ';

function runeRow(ctx, x, y, count, px) {
  ctx.font = `bold ${px}px serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (let i = 0; i < count; i++) {
    ctx.fillText(RUNES[Math.floor(Math.random() * RUNES.length)], x + i * px * 1.1, y);
  }
}

const Surfaces = {
  flagstone: floorTexture,
  brick: brickTexture,

  tiles: () => draw(256, (ctx, s) => {
    tileGrid(ctx, s, 2, 40, () => rand(165, 205));
    noise(ctx, s, 26);
  }),

  marble: () => draw(256, (ctx, s) => {
    tileGrid(ctx, s, 2, 70, () => rand(205, 230));
    // veins wandering across the slabs
    for (let i = 0; i < 7; i++) {
      crack(ctx, Math.random() * s, Math.random() * s, 9, rand(14, 26), rand(1, 2.4), grey(rand(90, 140), rand(0.35, 0.6)));
    }
    noise(ctx, s, 12);
  }),

  slate: () => draw(256, (ctx, s) => {
    ctx.fillStyle = grey(45);
    ctx.fillRect(0, 0, s, s);
    // slabs by splitting the square at random
    const split = (x, y, w, h, depth) => {
      if (depth > 3 || (w < 70 && h < 70)) {
        const v = rand(125, 175);
        ctx.fillStyle = grey(v);
        ctx.fillRect(x + 3, y + 3, w - 6, h - 6);
        ctx.fillStyle = grey(v - 35, 0.6);
        ctx.fillRect(x + 3, y + h - 6, w - 6, 3);
        if (Math.random() < 0.5) {
          crack(ctx, x + w / 2, y + h / 2, 4, 10, 1.2, 'rgba(30,30,30,0.5)');
        }
        return;
      }
      if (w > h) {
        const cut = Math.round(w * rand(0.35, 0.65));
        split(x, y, cut, h, depth + 1);
        split(x + cut, y, w - cut, h, depth + 1);
      } else {
        const cut = Math.round(h * rand(0.35, 0.65));
        split(x, y, w, cut, depth + 1);
        split(x, y + cut, w, h - cut, depth + 1);
      }
    };
    split(0, 0, s, s, 0);
    noise(ctx, s, 30);
  }),

  planks: () => draw(256, (ctx, s) => {
    ctx.fillStyle = grey(30);
    ctx.fillRect(0, 0, s, s);
    const rows = 7;
    const h = s / rows;
    for (let r = 0; r < rows; r++) {
      let x = -rand(0, 120);
      while (x < s) {
        const len = rand(90, 190);
        const v = rand(130, 175);
        ctx.fillStyle = grey(v);
        ctx.fillRect(x + 1, r * h + 2, len - 2, h - 4);
        // grain
        ctx.strokeStyle = grey(v - 40, 0.45);
        ctx.lineWidth = 1;
        for (let g = 0; g < 4; g++) {
          const gy = r * h + 5 + Math.random() * (h - 10);
          ctx.beginPath();
          ctx.moveTo(x + 2, gy);
          ctx.bezierCurveTo(x + len * 0.3, gy + rand(-3, 3), x + len * 0.7, gy + rand(-3, 3), x + len - 2, gy);
          ctx.stroke();
        }
        ctx.fillStyle = grey(40, 0.8);
        ctx.fillRect(x + 4, r * h + h / 2 - 1.5, 3, 3);
        ctx.fillRect(x + len - 7, r * h + h / 2 - 1.5, 3, 3);
        x += len;
      }
    }
    noise(ctx, s, 22);
  }),

  plates: () => draw(256, (ctx, s) => {
    ctx.fillStyle = grey(40);
    ctx.fillRect(0, 0, s, s);
    const step = s / 2;
    for (let py = 0; py < 2; py++) {
      for (let px = 0; px < 2; px++) {
        const x = px * step + 3;
        const y = py * step + 3;
        const w = step - 6;
        const v = rand(130, 160);
        ctx.fillStyle = grey(v);
        ctx.fillRect(x, y, w, w);
        // tread: raised lozenges
        ctx.fillStyle = grey(v + 30, 0.6);
        for (let ty = 10; ty < w - 6; ty += 14) {
          for (let tx = 10 + ((ty / 14) % 2) * 7; tx < w - 6; tx += 14) {
            ctx.save();
            ctx.translate(x + tx, y + ty);
            ctx.rotate(((tx + ty) / 14) % 2 ? 0.8 : -0.8);
            ctx.fillRect(-5, -1.5, 10, 3);
            ctx.restore();
          }
        }
        for (const [rx, ry] of [[7, 7], [w - 7, 7], [7, w - 7], [w - 7, w - 7]]) {
          ctx.fillStyle = grey(50, 0.8);
          ctx.beginPath();
          ctx.arc(x + rx + 1, y + ry + 1, 4, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = grey(210);
          ctx.beginPath();
          ctx.arc(x + rx, y + ry, 3.5, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }
    noise(ctx, s, 20);
  }),

  sand: () => draw(256, (ctx, s) => {
    ctx.fillStyle = grey(175);
    ctx.fillRect(0, 0, s, s);
    blotches(ctx, s, 26, 20, 60, () => grey(rand(130, 210), 0.25));
    // wind ripples
    ctx.lineWidth = 2;
    for (let y = 0; y < s; y += 9) {
      ctx.strokeStyle = grey(Math.random() < 0.5 ? 120 : 220, 0.2);
      ctx.beginPath();
      for (let x = 0; x <= s; x += 8) {
        const yy = y + Math.sin((x / s) * Math.PI * 4 + y) * 3;
        if (x === 0) {
          ctx.moveTo(x, yy);
        } else {
          ctx.lineTo(x, yy);
        }
      }
      ctx.stroke();
    }
    noise(ctx, s, 46);
  }),

  dirt: () => draw(256, (ctx, s) => {
    ctx.fillStyle = grey(160);
    ctx.fillRect(0, 0, s, s);
    blotches(ctx, s, 30, 14, 50, () => grey(rand(90, 200), 0.35));
    for (let i = 0; i < 90; i++) {
      const v = rand(80, 230);
      wrapped(s, Math.random() * s, Math.random() * s, 5, (x, y) => {
        ctx.fillStyle = grey(v, 0.8);
        ctx.beginPath();
        ctx.ellipse(x, y, rand(1.5, 4), rand(1, 3), Math.random() * 3, 0, Math.PI * 2);
        ctx.fill();
      });
    }
    noise(ctx, s, 40);
  }),

  mud: () => draw(256, (ctx, s) => {
    ctx.fillStyle = grey(150);
    ctx.fillRect(0, 0, s, s);
    blotches(ctx, s, 22, 20, 64, () => grey(rand(70, 120), 0.45));
    blotches(ctx, s, 14, 10, 30, () => grey(rand(190, 230), 0.25));
    noise(ctx, s, 30);
  }),

  ash: () => draw(256, (ctx, s) => {
    ctx.fillStyle = grey(190);
    ctx.fillRect(0, 0, s, s);
    blotches(ctx, s, 30, 20, 70, () => grey(rand(150, 230), 0.3));
    for (let i = 0; i < 160; i++) {
      ctx.fillStyle = grey(rand(30, 90), 0.7);
      ctx.fillRect(Math.random() * s, Math.random() * s, rand(1, 3), rand(1, 3));
    }
    noise(ctx, s, 22);
  }),

  bonedust: () => draw(256, (ctx, s) => {
    ctx.fillStyle = grey(170);
    ctx.fillRect(0, 0, s, s);
    blotches(ctx, s, 24, 14, 48, () => grey(rand(120, 210), 0.3));
    // bone splinters
    for (let i = 0; i < 40; i++) {
      wrapped(s, Math.random() * s, Math.random() * s, 14, (x, y) => {
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(Math.random() * Math.PI);
        const len = rand(6, 14);
        ctx.fillStyle = grey(235);
        ctx.fillRect(-len / 2, -1.2, len, 2.4);
        ctx.beginPath();
        ctx.arc(-len / 2, 0, 2.2, 0, Math.PI * 2);
        ctx.arc(len / 2, 0, 2.2, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      });
    }
    noise(ctx, s, 30);
  }),

  ice: () => draw(256, (ctx, s) => {
    ctx.fillStyle = grey(205);
    ctx.fillRect(0, 0, s, s);
    blotches(ctx, s, 18, 30, 80, () => grey(rand(170, 240), 0.3));
    for (let i = 0; i < 6; i++) {
      crack(ctx, Math.random() * s, Math.random() * s, 8, rand(10, 22), 1.4, 'rgba(255,255,255,0.75)');
      crack(ctx, Math.random() * s, Math.random() * s, 6, rand(8, 16), 1, 'rgba(90,110,120,0.4)');
    }
    noise(ctx, s, 12);
  }),

  coins: () => draw(256, (ctx, s) => {
    ctx.fillStyle = grey(95);
    ctx.fillRect(0, 0, s, s);
    for (let i = 0; i < 420; i++) {
      const r = rand(6, 10);
      const v = rand(150, 225);
      const squash = rand(0.55, 1);
      const tilt = Math.random() * Math.PI;
      wrapped(s, Math.random() * s, Math.random() * s, r + 2, (x, y) => {
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(tilt);
        ctx.fillStyle = grey(v - 70);
        ctx.beginPath();
        ctx.ellipse(0, 1.5, r, r * squash, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = grey(v);
        ctx.beginPath();
        ctx.ellipse(0, 0, r, r * squash, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = grey(v + 40, 0.9);
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.ellipse(0, 0, r * 0.7, r * 0.7 * squash, 0, Math.PI * 1.1, Math.PI * 1.8);
        ctx.stroke();
        ctx.restore();
      });
    }
    noise(ctx, s, 16);
  }),

  obsidian: () => draw(256, (ctx, s) => {
    const pts = scatterPoints(14, s);
    const shades = pts.map(() => rand(150, 200));
    ctx.putImageData(voronoi(s, pts, (i, edge) => {
      const v = edge < 2 ? shades[i] * 0.45 : shades[i] + Math.min(20, edge * 0.4);
      return [v, v, v];
    }), 0, 0);
    // glossy streaks
    for (let i = 0; i < 6; i++) {
      ctx.strokeStyle = 'rgba(255,255,255,0.12)';
      ctx.lineWidth = rand(2, 5);
      ctx.beginPath();
      const x = Math.random() * s;
      const y = Math.random() * s;
      ctx.moveTo(x, y);
      ctx.lineTo(x + rand(20, 50), y - rand(10, 30));
      ctx.stroke();
    }
    noise(ctx, s, 10);
  }),

  basalt: () => draw(256, (ctx, s) => {
    const pts = [];
    for (let y = 0; y < 5; y++) {
      for (let x = 0; x < 5; x++) {
        pts.push([(x + (y % 2) * 0.5) * (s / 5) + rand(-8, 8), y * (s / 5) + rand(-8, 8)]);
      }
    }
    const shades = pts.map(() => rand(150, 200));
    ctx.putImageData(voronoi(s, pts, (i, edge) => {
      const v = edge < 3 ? 60 : shades[i] - Math.max(0, 14 - edge) * 2;
      return [v, v, v];
    }), 0, 0);
    noise(ctx, s, 30);
  }),

  'glow:cracks': () => draw(256, (ctx, s) => {
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, s, s);
    // glowing seams wandering across the stone
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 9; i++) {
      crack(ctx, Math.random() * s, Math.random() * s, 10, rand(10, 20), rand(1.5, 3.5), 'rgba(255,255,255,0.85)');
    }
    blotches(ctx, s, 6, 6, 16, () => 'rgba(255,255,255,0.5)');
  }, { srgb: false }),

  'glow:embers': () => draw(256, (ctx, s) => {
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, s, s);
    blotches(ctx, s, 10, 4, 12, () => 'rgba(255,255,255,0.8)');
    for (let i = 0; i < 40; i++) {
      ctx.fillStyle = `rgba(255,255,255,${rand(0.3, 0.9)})`;
      ctx.fillRect(Math.random() * s, Math.random() * s, 2, 2);
    }
  }, { srgb: false }),

  'glow:streaks': () => draw(256, (ctx, s) => {
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, s, s);
    for (let i = 0; i < 5; i++) {
      const x = Math.random() * s;
      ctx.strokeStyle = `rgba(255,255,255,${rand(0.4, 0.8)})`;
      ctx.lineWidth = rand(1, 2.5);
      ctx.beginPath();
      let y = Math.random() * s;
      ctx.moveTo(x, y);
      let xx = x;
      for (let k = 0; k < 6; k++) {
        xx += rand(-5, 5);
        y += rand(8, 20);
        ctx.lineTo(xx, y);
      }
      ctx.stroke();
    }
  }, { srgb: false }),

  blocks: () => draw(256, (ctx, s) => {
    blockCourses(ctx, s, 3, 2, 40, () => rand(150, 200));
    for (let i = 0; i < 5; i++) {
      crack(ctx, Math.random() * s, Math.random() * s, 4, 9, 1, 'rgba(30,30,30,0.45)');
    }
    noise(ctx, s, 30);
  }),

  vault: () => draw(256, (ctx, s) => {
    blockCourses(ctx, s, 3, 2, 50, () => rand(160, 200));
    // a band of gold with rivets across the middle course joint
    const y = s / 3 * 2 - 10;
    const g = ctx.createLinearGradient(0, y, 0, y + 20);
    g.addColorStop(0, '#f8d870');
    g.addColorStop(0.5, '#c89a30');
    g.addColorStop(1, '#7a5a18');
    ctx.fillStyle = g;
    ctx.fillRect(0, y, s, 20);
    ctx.fillStyle = '#fff0b0';
    for (let x = 8; x < s; x += 32) {
      ctx.beginPath();
      ctx.arc(x, y + 10, 3, 0, Math.PI * 2);
      ctx.fill();
    }
    noise(ctx, s, 18);
  }),

  rock: () => draw(256, (ctx, s) => {
    ctx.fillStyle = grey(150);
    ctx.fillRect(0, 0, s, s);
    blotches(ctx, s, 40, 18, 60, () => grey(rand(80, 220), 0.35));
    for (let i = 0; i < 12; i++) {
      crack(ctx, Math.random() * s, Math.random() * s, 6, rand(8, 16), rand(1, 2.5), 'rgba(25,25,25,0.55)');
    }
    noise(ctx, s, 40);
  }),

  claws: () => draw(256, (ctx, s) => {
    ctx.drawImage(surfaceTexture('rock').image, 0, 0);
    // three gouges at a time, raked across the stone
    for (let i = 0; i < 6; i++) {
      const x = Math.random() * s;
      const y = Math.random() * s;
      const a = rand(-1.1, -0.4);
      for (let k = 0; k < 3; k++) {
        const ox = x + k * 9;
        const oy = y + k * 3;
        const len = rand(50, 80);
        ctx.lineCap = 'round';
        ctx.strokeStyle = 'rgba(20,20,20,0.7)';
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.moveTo(ox, oy);
        ctx.lineTo(ox + Math.cos(a) * len, oy - Math.sin(a) * len);
        ctx.stroke();
        ctx.strokeStyle = 'rgba(235,235,235,0.5)';
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.moveTo(ox + 2, oy + 1);
        ctx.lineTo(ox + 2 + Math.cos(a) * len, oy + 1 - Math.sin(a) * len);
        ctx.stroke();
      }
    }
  }),

  skulls: () => draw(256, (ctx, s) => {
    ctx.fillStyle = grey(55);
    ctx.fillRect(0, 0, s, s);
    const rows = 4;
    const h = s / rows;
    for (let r = 0; r < rows; r++) {
      // a course of long bones under every row of skulls
      ctx.fillStyle = grey(175);
      ctx.fillRect(0, r * h + h - 11, s, 7);
      for (let x = 0; x < s; x += 22) {
        ctx.beginPath();
        ctx.arc(x, r * h + h - 7.5, 5, 0, Math.PI * 2);
        ctx.fill();
      }
      for (let k = 0; k < 5; k++) {
        const cx = k * (s / 5) + (r % 2) * (s / 10) + s / 10;
        const cy = r * h + h * 0.42;
        const v = rand(180, 225);
        ctx.fillStyle = grey(v);
        ctx.beginPath();
        ctx.ellipse(cx, cy, 17, 16, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillRect(cx - 9, cy + 8, 18, 10);
        ctx.fillStyle = grey(25);
        ctx.beginPath();
        ctx.ellipse(cx - 7, cy + 1, 5, 6, 0, 0, Math.PI * 2);
        ctx.ellipse(cx + 7, cy + 1, 5, 6, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.moveTo(cx, cy + 6);
        ctx.lineTo(cx - 2.5, cy + 11);
        ctx.lineTo(cx + 2.5, cy + 11);
        ctx.fill();
        ctx.fillStyle = grey(70);
        for (let t = -6; t <= 6; t += 4) {
          ctx.fillRect(cx + t - 0.5, cy + 13, 1.5, 5);
        }
      }
    }
    noise(ctx, s, 26);
  }),

  books: () => draw(256, (ctx, s) => {
    const shelves = 4;
    const h = s / shelves;
    const palette = ['#7a1e24', '#1e3a6a', '#2a5a2e', '#6a4a1e', '#4a2a5a', '#8a6a2a', '#5a1a3a', '#2a4a5a'];
    ctx.fillStyle = '#2a1a10';
    ctx.fillRect(0, 0, s, s);
    for (let r = 0; r < shelves; r++) {
      let x = 2;
      while (x < s - 4) {
        const w = rand(7, 17);
        const bh = h * rand(0.62, 0.9);
        const color = palette[Math.floor(Math.random() * palette.length)];
        const lean = Math.random() < 0.08;
        ctx.save();
        ctx.translate(x, r * h + h - 8);
        if (lean) {
          ctx.rotate(-0.15);
        }
        ctx.fillStyle = color;
        ctx.fillRect(0, -bh, w - 1, bh);
        ctx.fillStyle = 'rgba(255,220,140,0.55)';
        ctx.fillRect(0, -bh + 6, w - 1, 2);
        ctx.fillRect(0, -10, w - 1, 2);
        ctx.fillStyle = 'rgba(0,0,0,0.3)';
        ctx.fillRect(w - 3, -bh, 2, bh);
        ctx.restore();
        x += w + (Math.random() < 0.1 ? rand(4, 12) : 0);
      }
      // the shelf board
      ctx.fillStyle = '#5a3a22';
      ctx.fillRect(0, r * h + h - 8, s, 8);
      ctx.fillStyle = '#7a5434';
      ctx.fillRect(0, r * h + h - 8, s, 2);
    }
    noise(ctx, s, 18);
  }),

  iron: () => draw(256, (ctx, s) => {
    ctx.fillStyle = grey(55);
    ctx.fillRect(0, 0, s, s);
    const step = s / 2;
    for (let py = 0; py < 2; py++) {
      for (let px = 0; px < 2; px++) {
        const v = rand(120, 150);
        const x = px * step + 2;
        const y = py * step + 2;
        const w = step - 4;
        const g = ctx.createLinearGradient(x, y, x + w, y + w);
        g.addColorStop(0, grey(v + 25));
        g.addColorStop(1, grey(v - 20));
        ctx.fillStyle = g;
        ctx.fillRect(x, y, w, w);
        for (let k = 8; k < w; k += 20) {
          for (const [rx, ry] of [[k, 6], [k, w - 6], [6, k], [w - 6, k]]) {
            ctx.fillStyle = grey(40, 0.7);
            ctx.beginPath();
            ctx.arc(x + rx + 1, y + ry + 1, 3, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = grey(200);
            ctx.beginPath();
            ctx.arc(x + rx, y + ry, 2.5, 0, Math.PI * 2);
            ctx.fill();
          }
        }
      }
    }
    // rust running down from the seams
    for (let i = 0; i < 14; i++) {
      const x = Math.random() * s;
      const y = Math.random() * s;
      const g = ctx.createLinearGradient(x, y, x, y + 50);
      g.addColorStop(0, 'rgba(30,20,10,0.5)');
      g.addColorStop(1, 'rgba(30,20,10,0)');
      ctx.fillStyle = g;
      ctx.fillRect(x, y, rand(2, 5), 50);
    }
    noise(ctx, s, 22);
  }),

  runes: () => draw(256, (ctx, s) => {
    blockCourses(ctx, s, 3, 2, 30, () => rand(120, 150));
    ctx.fillStyle = 'rgba(20,20,20,0.75)';
    runeRow(ctx, 22, s / 3 / 2, 10, 22);
    runeRow(ctx, 22, s / 3 * 2.5, 10, 22);
    noise(ctx, s, 20);
  }),

  'glow:wallrunes': () => draw(256, (ctx, s) => {
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, s, s);
    ctx.fillStyle = 'rgba(255,255,255,0.95)';
    runeRow(ctx, 22, s / 3 / 2, 10, 22);
    runeRow(ctx, 22, s / 3 * 2.5, 10, 22);
  }, { srgb: false }),

  frost: () => draw(256, (ctx, s) => {
    blockCourses(ctx, s, 3, 2, 70, () => rand(170, 210));
    // rime gathers on the upper edge of each course, with drips below
    for (let r = 0; r < 3; r++) {
      const y = r * (s / 3) + 3;
      const g = ctx.createLinearGradient(0, y, 0, y + 26);
      g.addColorStop(0, 'rgba(255,255,255,0.85)');
      g.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, y, s, 26);
      for (let x = 4; x < s; x += rand(8, 20)) {
        ctx.fillStyle = 'rgba(255,255,255,0.7)';
        ctx.beginPath();
        ctx.moveTo(x - 3, y);
        ctx.lineTo(x + 3, y);
        ctx.lineTo(x, y + rand(8, 22));
        ctx.fill();
      }
    }
    noise(ctx, s, 14);
  }),

  // ---- liquids

  ripple: () => draw(256, (ctx, s) => {
    ctx.fillStyle = grey(150);
    ctx.fillRect(0, 0, s, s);
    blotches(ctx, s, 30, 20, 60, () => grey(rand(100, 210), 0.4));
    ctx.lineWidth = 1.5;
    for (let i = 0; i < 20; i++) {
      wrapped(s, Math.random() * s, Math.random() * s, 40, (x, y) => {
        ctx.strokeStyle = 'rgba(255,255,255,0.25)';
        ctx.beginPath();
        ctx.ellipse(x, y, rand(10, 34), rand(4, 12), Math.random() * 3, 0, Math.PI * rand(0.6, 1.4));
        ctx.stroke();
      });
    }
  }),

  lava: () => draw(256, (ctx, s) => {
    const pts = scatterPoints(16, s);
    const crust = pts.map(() => Math.random());
    ctx.putImageData(voronoi(s, pts, (i, edge) => {
      // dark crust plates floating on bright melt
      if (crust[i] < 0.55 && edge > 6) {
        const v = 40 + crust[i] * 50;
        return [v + 30, v * 0.4, 10];
      }
      const t = Math.min(1, edge / 10);
      return [255, 200 - t * 110, 60 - t * 50];
    }), 0, 0);
    blotches(ctx, s, 10, 10, 30, () => 'rgba(255,230,120,0.35)');
  }),

  metal: () => draw(256, (ctx, s) => {
    ctx.fillStyle = '#ffb040';
    ctx.fillRect(0, 0, s, s);
    blotches(ctx, s, 26, 14, 50, () => (Math.random() < 0.5 ? 'rgba(255,240,180,0.7)' : 'rgba(200,70,10,0.45)'));
    for (let i = 0; i < 30; i++) {
      ctx.fillStyle = 'rgba(60,20,5,0.7)';
      ctx.fillRect(Math.random() * s, Math.random() * s, rand(2, 6), rand(1, 3));
    }
  }),

  // ---- decals (on the floor, with alpha)

  rug: () => draw(128, (ctx, s) => {
    ctx.fillStyle = '#6a1a1e';
    ctx.fillRect(0, 0, s, s);
    ctx.strokeStyle = '#c8a040';
    ctx.lineWidth = 6;
    ctx.strokeRect(8, 8, s - 16, s - 16);
    ctx.strokeStyle = '#1e2a5a';
    ctx.lineWidth = 3;
    ctx.strokeRect(18, 18, s - 36, s - 36);
    ctx.fillStyle = '#c8a040';
    ctx.save();
    ctx.translate(s / 2, s / 2);
    ctx.rotate(Math.PI / 4);
    ctx.fillRect(-18, -18, 36, 36);
    ctx.fillStyle = '#6a1a1e';
    ctx.fillRect(-10, -10, 20, 20);
    ctx.restore();
    noise(ctx, s, 30);
  }),

  carpet: () => draw(128, (ctx, s) => {
    ctx.fillStyle = '#7a141c';
    ctx.fillRect(0, 0, s, s);
    ctx.fillStyle = 'rgba(0,0,0,0.18)';
    for (let i = 0; i < s; i += 16) {
      ctx.fillRect(i, 0, 8, s);
    }
    noise(ctx, s, 24);
  }),

  pages: () => draw(128, (ctx, s) => {
    ctx.clearRect(0, 0, s, s);
    for (let i = 0; i < 7; i++) {
      ctx.save();
      ctx.translate(rand(20, 108), rand(20, 108));
      ctx.rotate(Math.random() * Math.PI);
      ctx.fillStyle = `rgba(${rand(200, 235)},${rand(190, 220)},${rand(160, 190)},0.95)`;
      ctx.fillRect(-12, -16, 24, 32);
      ctx.fillStyle = 'rgba(60,40,30,0.5)';
      for (let l = -11; l < 13; l += 4) {
        ctx.fillRect(-9, l, rand(10, 18), 1.2);
      }
      ctx.restore();
    }
  }),

  blood: () => draw(128, (ctx, s) => {
    ctx.clearRect(0, 0, s, s);
    ctx.fillStyle = 'rgba(110,10,12,0.85)';
    ctx.beginPath();
    ctx.ellipse(s / 2, s / 2, rand(22, 30), rand(16, 24), Math.random() * 3, 0, Math.PI * 2);
    ctx.fill();
    for (let i = 0; i < 18; i++) {
      const a = Math.random() * Math.PI * 2;
      const r = rand(26, 58);
      ctx.beginPath();
      ctx.arc(s / 2 + Math.cos(a) * r, s / 2 + Math.sin(a) * r, rand(1.5, 5), 0, Math.PI * 2);
      ctx.fill();
    }
  }),

  scorch: () => draw(128, (ctx, s) => {
    const g = ctx.createRadialGradient(s / 2, s / 2, 4, s / 2, s / 2, s / 2);
    g.addColorStop(0, 'rgba(0,0,0,0.85)');
    g.addColorStop(0.6, 'rgba(10,6,4,0.55)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, s, s);
    for (let i = 0; i < 10; i++) {
      crack(ctx, s / 2, s / 2, 5, 9, 2, 'rgba(0,0,0,0.5)');
    }
  }),

  puddle: () => draw(128, (ctx, s) => {
    ctx.clearRect(0, 0, s, s);
    ctx.fillStyle = 'rgba(255,255,255,1)';
    ctx.beginPath();
    for (let i = 0; i <= 24; i++) {
      const a = (i / 24) * Math.PI * 2;
      const r = s * 0.36 * (0.75 + Math.sin(a * 3 + 1) * 0.12 + Math.random() * 0.1);
      const x = s / 2 + Math.cos(a) * r;
      const y = s / 2 + Math.sin(a) * r * 0.8;
      if (i === 0) {
        ctx.moveTo(x, y);
      } else {
        ctx.lineTo(x, y);
      }
    }
    ctx.fill();
  }),

  scales: () => draw(128, (ctx, s) => {
    ctx.clearRect(0, 0, s, s);
    for (let i = 0; i < 16; i++) {
      ctx.save();
      ctx.translate(rand(10, 118), rand(10, 118));
      ctx.rotate(Math.random() * Math.PI);
      ctx.fillStyle = Math.random() < 0.5 ? 'rgba(200,60,30,0.9)' : 'rgba(220,170,60,0.9)';
      ctx.beginPath();
      ctx.ellipse(0, 0, 5, 3.5, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = 'rgba(255,255,230,0.8)';
      ctx.fillRect(-2, -1.5, 3, 1);
      ctx.restore();
    }
  }),

  circle: runeTexture,

  // soft glow at the foot of a wall (burning floors)
  wallglow: () => draw(64, (ctx, s) => {
    const g = ctx.createLinearGradient(0, s, 0, 0);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, s, s);
  })
};
