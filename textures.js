/**
 * textures.js — Procedural canvas textures for the Isekai Town
 *
 * Everything is drawn once at boot on small canvases (no asset files, no
 * network), tuned to the reference art: warm cobblestone streets, cream
 * plaster with dark timber, terracotta tile roofs, pale stone towers,
 * lattice windows with a warm interior glow, and soft cumulus clouds.
 *
 * All generators are memoised so repeated calls share one GPU texture.
 */

import * as THREE from 'three';

const cache = new Map();

function canvas(w, h) {
  const cv = document.createElement('canvas');
  cv.width = w; cv.height = h;
  return [cv, cv.getContext('2d')];
}

// Small deterministic PRNG so the town looks the same on every visit
function rng(seed) {
  let s = seed >>> 0;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
}

function finish(cv, { repeat = [1, 1], anisotropy = 4 } = {}) {
  const tex = new THREE.CanvasTexture(cv);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(repeat[0], repeat[1]);
  tex.anisotropy = anisotropy;
  return tex;
}

function memo(key, make) {
  if (!cache.has(key)) cache.set(key, make());
  return cache.get(key);
}

// ── Cobblestone (roads, plaza) ──────────────────────────────────
export function cobbleTexture() {
  return memo('cobble', () => {
    const S = 512, [cv, c] = canvas(S, S), r = rng(7);
    c.fillStyle = '#6f6254';                       // mortar
    c.fillRect(0, 0, S, S);
    const rows = 14, cols = 12, rh = S / rows, cw = S / cols;
    for (let y = 0; y < rows; y++) {
      const offset = (y % 2) * cw * 0.5;
      for (let x = -1; x <= cols; x++) {
        const px = x * cw + offset + (r() - 0.5) * 4;
        const py = y * rh + (r() - 0.5) * 3;
        const w = cw * (0.78 + r() * 0.14), h = rh * (0.72 + r() * 0.14);
        // warm grey-beige stones with a little hue drift
        const l = 62 + r() * 18, hue = 32 + r() * 14, sat = 12 + r() * 10;
        c.fillStyle = `hsl(${hue} ${sat}% ${l}%)`;
        roundRect(c, px, py, w, h, Math.min(w, h) * 0.32);
        c.fill();
        // top-left highlight, bottom-right shade → slight bevel
        c.fillStyle = 'rgba(255,240,210,0.16)';
        roundRect(c, px + 1, py + 1, w - 2, h * 0.35, 6); c.fill();
        c.fillStyle = 'rgba(40,25,10,0.18)';
        roundRect(c, px + 2, py + h * 0.62, w - 4, h * 0.36, 6); c.fill();
      }
    }
    return finish(cv);
  });
}

// ── Cream plaster (Tudor walls) ─────────────────────────────────
export function plasterTexture() {
  return memo('plaster', () => {
    const S = 256, [cv, c] = canvas(S, S), r = rng(11);
    c.fillStyle = '#f2e6cb';
    c.fillRect(0, 0, S, S);
    // fine speckle + a few soft stains
    for (let i = 0; i < 2600; i++) {
      c.fillStyle = r() > 0.5 ? 'rgba(120,90,50,0.07)' : 'rgba(255,255,255,0.10)';
      c.fillRect(r() * S, r() * S, 1 + r() * 2, 1 + r() * 2);
    }
    for (let i = 0; i < 14; i++) {
      const g = c.createRadialGradient(r() * S, r() * S, 0, r() * S, r() * S, 30 + r() * 40);
      g.addColorStop(0, 'rgba(180,140,90,0.10)');
      g.addColorStop(1, 'rgba(180,140,90,0)');
      c.fillStyle = g;
      c.fillRect(0, 0, S, S);
    }
    return finish(cv);
  });
}

// ── Terracotta roof tiles ───────────────────────────────────────
export function roofTileTexture() {
  return memo('rooftile', () => {
    const S = 256, [cv, c] = canvas(S, S), r = rng(23);
    c.fillStyle = '#8d3f2c';                       // shadow between tiles
    c.fillRect(0, 0, S, S);
    const rows = 8, cols = 8, rh = S / rows, cw = S / cols;
    for (let y = 0; y < rows; y++) {
      const off = (y % 2) * cw * 0.5;
      for (let x = -1; x <= cols; x++) {
        const px = x * cw + off, py = y * rh;
        const hue = 12 + r() * 8, sat = 55 + r() * 12, l = 46 + r() * 12;
        c.fillStyle = `hsl(${hue} ${sat}% ${l}%)`;
        // half-round tile: rectangle with a rounded lower edge
        c.beginPath();
        c.moveTo(px, py);
        c.lineTo(px + cw, py);
        c.lineTo(px + cw, py + rh * 0.7);
        c.quadraticCurveTo(px + cw * 0.5, py + rh * 1.05, px, py + rh * 0.7);
        c.closePath();
        c.fill();
        c.fillStyle = 'rgba(255,220,180,0.14)';
        c.fillRect(px + 2, py + 1, cw - 4, rh * 0.18);
      }
    }
    return finish(cv);
  });
}

// ── Pale stone blocks (towers, wall, chimneys) ──────────────────
export function stoneTexture() {
  return memo('stone', () => {
    const S = 256, [cv, c] = canvas(S, S), r = rng(31);
    c.fillStyle = '#8e8474';                       // mortar
    c.fillRect(0, 0, S, S);
    const rows = 8, rh = S / rows;
    for (let y = 0; y < rows; y++) {
      let x = (y % 2) * -30;
      while (x < S) {
        const w = 40 + r() * 40;
        const hue = 38 + r() * 10, sat = 12 + r() * 10, l = 60 + r() * 14;
        c.fillStyle = `hsl(${hue} ${sat}% ${l}%)`;
        c.fillRect(x + 1.5, y * rh + 1.5, w - 3, rh - 3);
        c.fillStyle = 'rgba(255,245,225,0.14)';
        c.fillRect(x + 2, y * rh + 2, w - 4, 4);
        c.fillStyle = 'rgba(30,20,10,0.16)';
        c.fillRect(x + 2, y * rh + rh - 6, w - 4, 4);
        x += w;
      }
    }
    return finish(cv);
  });
}

// ── Lattice window (map + emissiveMap) ──────────────────────────
export function windowTexture() {
  return memo('window', () => {
    const S = 128, [cv, c] = canvas(S, S);
    // warm glass with a soft gradient (lit interior)
    const g = c.createLinearGradient(0, 0, S, S);
    g.addColorStop(0, '#ffd889');
    g.addColorStop(0.5, '#ffc46a');
    g.addColorStop(1, '#f2a24a');
    c.fillStyle = g;
    c.fillRect(0, 0, S, S);
    // glass reflection streak
    c.fillStyle = 'rgba(255,255,255,0.22)';
    c.beginPath(); c.moveTo(0, 0); c.lineTo(S * 0.45, 0); c.lineTo(0, S * 0.45); c.closePath(); c.fill();
    // mullions (dark timber) — 2 × 3 panes
    c.fillStyle = '#3a2416';
    const bw = 8;
    c.fillRect(0, 0, S, bw); c.fillRect(0, S - bw, S, bw);
    c.fillRect(0, 0, bw, S); c.fillRect(S - bw, 0, bw, S);
    c.fillRect(S / 2 - 3, 0, 6, S);
    c.fillRect(0, S / 3 - 3, S, 6);
    c.fillRect(0, (2 * S) / 3 - 3, S, 6);
    const tex = finish(cv);
    tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
    return tex;
  });
}

// ── Cumulus cloud sprite ────────────────────────────────────────
export function cloudTexture() {
  return memo('cloud', () => {
    const W = 256, H = 128, [cv, c] = canvas(W, H), r = rng(41);
    c.clearRect(0, 0, W, H);
    const blobs = [[128, 78, 46], [88, 84, 38], [170, 82, 40], [112, 58, 34], [150, 56, 30], [60, 92, 26], [200, 92, 26]];
    for (const [x, y, rad] of blobs) {
      const g = c.createRadialGradient(x, y, 0, x, y, rad);
      g.addColorStop(0, 'rgba(255,255,255,1)');
      g.addColorStop(0.7, 'rgba(255,255,255,0.9)');
      g.addColorStop(1, 'rgba(255,255,255,0)');
      c.fillStyle = g;
      c.beginPath(); c.arc(x, y, rad, 0, Math.PI * 2); c.fill();
    }
    // slightly shaded underside so it reads as a volume
    c.globalCompositeOperation = 'source-atop';
    const sh = c.createLinearGradient(0, 40, 0, H);
    sh.addColorStop(0, 'rgba(255,255,255,0)');
    sh.addColorStop(1, 'rgba(150,170,205,0.55)');
    c.fillStyle = sh;
    c.fillRect(0, 0, W, H);
    const tex = new THREE.CanvasTexture(cv);
    tex.minFilter = THREE.LinearFilter;
    return tex;
  });
}

// ── Clock face ──────────────────────────────────────────────────
export function clockTexture() {
  return memo('clock', () => {
    const S = 256, [cv, c] = canvas(S, S), cx = S / 2, cy = S / 2;
    c.fillStyle = '#4a4034'; c.fillRect(0, 0, S, S);          // stone surround
    c.fillStyle = '#f6ecd2';
    c.beginPath(); c.arc(cx, cy, 104, 0, Math.PI * 2); c.fill();
    c.strokeStyle = '#8b6914'; c.lineWidth = 8;
    c.beginPath(); c.arc(cx, cy, 104, 0, Math.PI * 2); c.stroke();
    c.strokeStyle = '#2b2d42'; c.lineWidth = 4;
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      c.beginPath();
      c.moveTo(cx + Math.cos(a) * 84, cy + Math.sin(a) * 84);
      c.lineTo(cx + Math.cos(a) * 96, cy + Math.sin(a) * 96);
      c.stroke();
    }
    c.lineCap = 'round';
    c.lineWidth = 8; c.beginPath(); c.moveTo(cx, cy); c.lineTo(cx + 30, cy - 46); c.stroke();   // hour
    c.lineWidth = 5; c.beginPath(); c.moveTo(cx, cy); c.lineTo(cx - 14, cy - 76); c.stroke();   // minute
    c.fillStyle = '#8b6914'; c.beginPath(); c.arc(cx, cy, 7, 0, Math.PI * 2); c.fill();
    const tex = new THREE.CanvasTexture(cv);
    tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
    return tex;
  });
}

// ── Grass (ground plane) ────────────────────────────────────────
export function grassTexture() {
  return memo('grass', () => {
    const S = 256, [cv, c] = canvas(S, S), r = rng(53);
    c.fillStyle = '#5f9a44';
    c.fillRect(0, 0, S, S);
    for (let i = 0; i < 5000; i++) {
      const l = 30 + r() * 22;
      c.fillStyle = `hsla(${100 + r() * 20} 45% ${l}% / 0.35)`;
      c.fillRect(r() * S, r() * S, 2, 1 + r() * 3);
    }
    return finish(cv, { repeat: [40, 40] });
  });
}

function roundRect(c, x, y, w, h, rad) {
  c.beginPath();
  c.moveTo(x + rad, y);
  c.lineTo(x + w - rad, y);
  c.quadraticCurveTo(x + w, y, x + w, y + rad);
  c.lineTo(x + w, y + h - rad);
  c.quadraticCurveTo(x + w, y + h, x + w - rad, y + h);
  c.lineTo(x + rad, y + h);
  c.quadraticCurveTo(x, y + h, x, y + h - rad);
  c.lineTo(x, y + rad);
  c.quadraticCurveTo(x, y, x + rad, y);
  c.closePath();
}
