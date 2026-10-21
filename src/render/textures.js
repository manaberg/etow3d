import * as THREE from 'three';

// Procedural greyscale textures; materials tint them per room theme, so no
// image assets are needed.

function makeCanvas(size) {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  return canvas;
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
  const ctx = canvas.getContext('2d');
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
  const ctx = canvas.getContext('2d');
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
