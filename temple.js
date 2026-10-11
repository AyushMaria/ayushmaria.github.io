/**
 * temple.js — procedural Japanese temple hall (and pagoda)
 *
 * Shared by the night landing scene (landing-temple.js) and the town's
 * City Hall. Everything is generated in code: a stone plinth with steps,
 * a vermilion post-and-beam hall with glowing lattice screens, bracket
 * clusters, a veranda rail, and two tiers of sweeping hip roofs whose
 * slopes sag (flat at the eave, steep at the ridge) and whose corners lift.
 *
 * Meshes are merged per material, so a whole hall is ~8 draw calls.
 */
import * as THREE from 'three';
import { mergeBufferGeometries } from 'https://cdn.jsdelivr.net/npm/three@0.150.0/examples/jsm/utils/BufferGeometryUtils.js';
import { stoneTexture } from './textures.js';

// ── Textures (canvas, memoised) ───────────────────────────────────
let _tileTex = null, _paperTex = null;
function tileTexture() {
  if (_tileTex) return _tileTex;
  const c = document.createElement('canvas'); c.width = 64; c.height = 64;
  const g = c.getContext('2d');
  g.fillStyle = '#7d8590'; g.fillRect(0, 0, 64, 64);
  // round-tile ribs running down the slope (along v)
  for (let x = 0; x < 64; x += 16) {
    const grd = g.createLinearGradient(x, 0, x + 16, 0);
    grd.addColorStop(0, '#4e555f'); grd.addColorStop(0.45, '#a9b0ba'); grd.addColorStop(1, '#4e555f');
    g.fillStyle = grd; g.fillRect(x, 0, 16, 64);
  }
  // course lines
  g.fillStyle = 'rgba(20,24,30,0.55)';
  for (let y = 0; y < 64; y += 16) g.fillRect(0, y, 64, 2);
  _tileTex = new THREE.CanvasTexture(c);
  _tileTex.wrapS = _tileTex.wrapT = THREE.RepeatWrapping;
  _tileTex.anisotropy = 4;
  return _tileTex;
}
function paperTexture() {
  if (_paperTex) return _paperTex;
  const c = document.createElement('canvas'); c.width = 64; c.height = 64;
  const g = c.getContext('2d');
  g.fillStyle = '#ffe2b0'; g.fillRect(0, 0, 64, 64);
  g.fillStyle = '#5a2c18';
  for (let i = 0; i <= 64; i += 16) { g.fillRect(i - 1, 0, 2, 64); g.fillRect(0, i - 1, 64, 2); }
  _paperTex = new THREE.CanvasTexture(c);
  _paperTex.wrapS = _paperTex.wrapT = THREE.RepeatWrapping;
  return _paperTex;
}
function plaqueTexture(text) {
  const c = document.createElement('canvas'); c.width = 512; c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = '#20140e'; g.fillRect(0, 0, 512, 128);
  g.strokeStyle = '#c9a24a'; g.lineWidth = 8; g.strokeRect(8, 8, 496, 112);
  g.fillStyle = '#e8c766';
  g.font = '700 58px Cinzel, Georgia, serif';
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(text, 256, 68);
  const t = new THREE.CanvasTexture(c);
  return t;
}

// ── Materials ─────────────────────────────────────────────────────
export function templeMaterials({ paperGlow = 1.2 } = {}) {
  const stone = stoneTexture();
  return {
    stone:    new THREE.MeshStandardMaterial({ map: stone, color: 0xb9b4aa, roughness: 0.95 }),
    stoneDk:  new THREE.MeshStandardMaterial({ map: stone, color: 0x7d7a73, roughness: 0.95 }),
    pillar:   new THREE.MeshStandardMaterial({ color: 0xa52f24, roughness: 0.7 }),
    beam:     new THREE.MeshStandardMaterial({ color: 0x8e271f, roughness: 0.7 }),
    darkWood: new THREE.MeshStandardMaterial({ color: 0x2c1a12, roughness: 0.85 }),
    under:    new THREE.MeshStandardMaterial({ color: 0x5a2a1c, roughness: 0.9, side: THREE.DoubleSide }),
    tile:     new THREE.MeshStandardMaterial({ map: tileTexture(), color: 0x4f5864, roughness: 0.6, metalness: 0.15 }),
    ridge:    new THREE.MeshStandardMaterial({ color: 0x2f343c, roughness: 0.6 }),
    gold:     new THREE.MeshStandardMaterial({ color: 0xd8b04f, roughness: 0.35, metalness: 0.8 }),
    paper:    new THREE.MeshStandardMaterial({ map: paperTexture(), color: 0xffe4bc, emissive: 0xffa24a,
                emissiveMap: paperTexture(), emissiveIntensity: paperGlow, roughness: 0.9 }),
    lantern:  new THREE.MeshStandardMaterial({ color: 0xffd9a0, emissive: 0xff8a3a, emissiveIntensity: 2.2, roughness: 0.8 }),
  };
}

// ── Curved hip roof ───────────────────────────────────────────────
/**
 * Four-slope roof over a w × d footprint (already including the overhang).
 * The ridge runs along X with length `ridge`. Slopes sag (flat at the eave,
 * steep near the ridge) and the corners lift by `lift`.
 * Returns { top, under, fascia } geometries centred on the origin, eave at y=0.
 */
export function curvedHipRoof({ w, d, ridge, h, lift = 0.7, sag = 1.8, segS = 7, segT = 14, tile = 1.1 }) {
  const top = [], under = [], fascia = [];
  const W2 = w / 2, D2 = d / 2, R2 = ridge / 2;
  const prof = (s) => Math.pow(s, sag);
  // face mappers: (s from eave 0 → ridge 1, t along the eave −1 → 1) → [x, y, z]
  const faces = [
    { out: [0, 0, 1],  len: w, f: (s, t) => [t * THREE.MathUtils.lerp(W2, R2, s), 0, THREE.MathUtils.lerp(D2, 0, s)] },
    { out: [0, 0, -1], len: w, f: (s, t) => [-t * THREE.MathUtils.lerp(W2, R2, s), 0, -THREE.MathUtils.lerp(D2, 0, s)] },
    { out: [1, 0, 0],  len: d, f: (s, t) => [THREE.MathUtils.lerp(W2, R2, s), 0, -t * D2 * (1 - s)] },
    { out: [-1, 0, 0], len: d, f: (s, t) => [-THREE.MathUtils.lerp(W2, R2, s), 0, t * D2 * (1 - s)] },
  ];
  const slopeLen = Math.hypot(D2, h);
  for (const face of faces) {
    const pos = [], uv = [], idx = [];
    for (let i = 0; i <= segS; i++) {
      const s = i / segS;
      for (let j = 0; j <= segT; j++) {
        const t = -1 + 2 * j / segT;
        const p = face.f(s, t);
        p[1] = h * prof(s) + lift * Math.pow(Math.abs(t), 4) * (1 - s) * (1 - s);
        pos.push(p[0], p[1], p[2]);
        uv.push(((t + 1) / 2) * face.len / tile, s * slopeLen / tile);
      }
    }
    const row = segT + 1;
    for (let i = 0; i < segS; i++) for (let j = 0; j < segT; j++) {
      const a = i * row + j, b = a + 1, c = a + row, e = c + 1;
      idx.push(a, b, c, b, e, c);
    }
    let g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx);
    g.computeVertexNormals();
    // make sure the face points outward / up
    const n = g.attributes.normal;
    const mid = Math.floor(n.count / 2);
    if (n.getY(mid) < 0 || (n.getX(mid) * face.out[0] + n.getZ(mid) * face.out[2]) < 0) {
      idx.length = 0;
      for (let i = 0; i < segS; i++) for (let j = 0; j < segT; j++) {
        const a = i * row + j, b = a + 1, c = a + row, e = c + 1;
        idx.push(a, c, b, b, c, e);
      }
      g.setIndex(idx); g.computeVertexNormals();
    }
    top.push(g);
    // underside: same surface, 0.28 lower (DoubleSide material)
    const ug = g.clone(); ug.translate(0, -0.28, 0); under.push(ug);
    // fascia: ribbon down from the eave edge (s = 0)
    const fp = [], fi = [];
    for (let j = 0; j <= segT; j++) {
      const k = j * 3;
      const x = pos[k], y = pos[k + 1], z = pos[k + 2];
      fp.push(x, y + 0.02, z, x, y - 0.32, z);
    }
    for (let j = 0; j < segT; j++) { const a = j * 2; fi.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
    const fg = new THREE.BufferGeometry();
    fg.setAttribute('position', new THREE.Float32BufferAttribute(fp, 3));
    fg.setAttribute('uv', new THREE.Float32BufferAttribute(new Array(fp.length / 3 * 2).fill(0), 2));
    fg.setIndex(fi); fg.computeVertexNormals();
    fascia.push(fg);
  }
  return { top: mergeBufferGeometries(top), under: mergeBufferGeometries(under), fascia: mergeBufferGeometries(fascia) };
}

// ── Helpers ───────────────────────────────────────────────────────
function box(w, h, d, x, y, z, ry = 0) {
  const g = new THREE.BoxGeometry(w, h, d);
  if (ry) g.rotateY(ry);
  g.translate(x, y, z);
  return g;
}
function cyl(r, h, x, y, z, seg = 10, r2 = r) {
  const g = new THREE.CylinderGeometry(r, r2, h, seg);
  g.translate(x, y, z);
  return g;
}

/** Ridge beam with upswept end tiles (onigawara) */
function ridgeParts(ridgeLen, y, parts) {
  parts.ridge.push(box(ridgeLen + 0.2, 0.36, 0.36, 0, y + 0.16, 0));
  for (const sx of [-1, 1]) {
    // end tile: a short block swept up and outward (shibi-like silhouette)
    const g = new THREE.BoxGeometry(0.34, 0.62, 0.42);
    g.translate(0, 0.31, 0);
    g.rotateZ(-sx * 0.42);
    g.translate(sx * (ridgeLen / 2 + 0.08), y + 0.12, 0);
    parts.ridge.push(g);
    parts.gold.push(cyl(0.07, 0.1, sx * (ridgeLen / 2 + 0.3), y + 0.66, 0, 8));
  }
}

function addRoof(parts, spec, y, ornaments = true) {
  const r = curvedHipRoof(spec);
  r.top.translate(0, y, 0); r.under.translate(0, y, 0); r.fascia.translate(0, y, 0);
  parts.tile.push(r.top); parts.under.push(r.under); parts.beam.push(r.fascia);
  if (ornaments) ridgeParts(spec.ridge, y + spec.h, parts);
}

function merge(parts, mats, group, castShadow = true) {
  for (const k of Object.keys(parts)) {
    if (!parts[k].length) continue;
    const m = new THREE.Mesh(mergeBufferGeometries(parts[k].map(g => g.index ? g.toNonIndexed() : g)), mats[k]);
    m.castShadow = castShadow && k !== 'paper' && k !== 'lantern';
    m.receiveShadow = true;
    m.name = `temple-${k}`;
    group.add(m);
  }
}

// ── Temple hall ──────────────────────────────────────────────────
/**
 * Two-tier temple hall facing +Z. Unscaled size: plinth 16 × 12, ~13.5 tall.
 * @param {object} o
 *   plaque     text on the gold-rimmed plaque under the upper roof ('' = none)
 *   lanterns   hang paper lanterns under the lower eaves
 *   paperGlow  emissive strength of the lattice screens (night ≈ 1.6, dusk ≈ 0.8)
 * @returns {{ group, height, lanternPoints: THREE.Vector3[], materials }}
 */
export function buildTempleHall({ plaque = '', lanterns = true, paperGlow = 1.2, materials = null } = {}) {
  const mats = materials || templeMaterials({ paperGlow });
  const P = { stone: [], stoneDk: [], pillar: [], beam: [], darkWood: [], under: [], tile: [], ridge: [], gold: [], paper: [], lantern: [] };
  const group = new THREE.Group();
  group.name = 'temple-hall';

  // Plinth (two-step stone base) and front stairs
  const PW = 16, PD = 12, PH = 1.2;
  P.stoneDk.push(box(PW + 0.8, 0.4, PD + 0.8, 0, 0.2, 0));
  P.stone.push(box(PW, PH - 0.4, PD, 0, 0.4 + (PH - 0.4) / 2, 0));
  for (let i = 0; i < 4; i++) {
    const sh = PH * (i + 1) / 4;
    P.stone.push(box(5, sh, 0.55, 0, sh / 2, PD / 2 + 0.25 + (3 - i) * 0.55));
  }

  // Columns: 6 × 4 grid (outer ring), front bays wider in the middle
  const HW = 12, HD = 8, colH = 4.2, base = PH;
  const xs = [-6, -3.6, -1.2, 1.2, 3.6, 6], zs = [-4, -1.33, 1.33, 4];
  const isEdge = (x, z) => Math.abs(x) === 6 || Math.abs(z) === 4;
  for (const x of xs) for (const z of zs) if (isEdge(x, z)) {
    P.pillar.push(cyl(0.24, colH, x, base + colH / 2, z, 10));
    P.stoneDk.push(cyl(0.36, 0.22, x, base + 0.11, z, 10));   // base stone
  }
  // Tie beams + head beams around the top of the columns
  const ringBeam = (y, hgt, inset = 0) => {
    P.beam.push(box(HW + 0.6 - inset, hgt, 0.32, 0, y, HD / 2 - inset / 2));
    P.beam.push(box(HW + 0.6 - inset, hgt, 0.32, 0, y, -HD / 2 + inset / 2));
    P.beam.push(box(0.32, hgt, HD + 0.6 - inset, HW / 2 - inset / 2, y, 0));
    P.beam.push(box(0.32, hgt, HD + 0.6 - inset, -HW / 2 + inset / 2, y, 0));
  };
  ringBeam(base + colH - 0.2, 0.4);
  ringBeam(base + colH * 0.62, 0.22);
  ringBeam(base + 0.45, 0.18);
  // Bracket clusters (tokyō) on top of each edge column
  for (const x of xs) for (const z of zs) if (isEdge(x, z)) {
    const y = base + colH + 0.12;
    P.darkWood.push(box(0.7, 0.24, 0.7, x, y, z));
    P.darkWood.push(box(1.2, 0.18, 0.4, x, y + 0.22, z));
    P.darkWood.push(box(0.4, 0.18, 1.2, x, y + 0.22, z));
  }

  // Walls: glowing lattice screens between columns; open centre doors
  const wallH = colH * 0.62 - 0.55;
  const wallY = base + 0.55 + wallH / 2;
  for (let i = 0; i < xs.length - 1; i++) {
    const cx = (xs[i] + xs[i + 1]) / 2, span = xs[i + 1] - xs[i] - 0.5;
    const centre = Math.abs(cx) < 1;
    // front: doors in the centre bay are slid open (brighter, recessed)
    const g = new THREE.PlaneGeometry(span, wallH);
    const uv = g.attributes.uv; for (let k = 0; k < uv.count; k++) uv.setXY(k, uv.getX(k) * span / 1.2, uv.getY(k) * wallH / 1.2);
    g.translate(cx, wallY, HD / 2 - (centre ? 0.6 : 0.05));
    P.paper.push(g);
    const gb = g.clone(); gb.rotateY(Math.PI); gb.translate(0, 0, 0); P.paper.push(gb);
  }
  for (let i = 0; i < zs.length - 1; i++) {
    const cz = (zs[i] + zs[i + 1]) / 2, span = zs[i + 1] - zs[i] - 0.5;
    for (const sx of [-1, 1]) {
      const g = new THREE.PlaneGeometry(span, wallH);
      const uv = g.attributes.uv; for (let k = 0; k < uv.count; k++) uv.setXY(k, uv.getX(k) * span / 1.2, uv.getY(k) * wallH / 1.2);
      g.rotateY(sx * Math.PI / 2);
      g.translate(sx * (HW / 2 - 0.05), wallY, cz);
      P.paper.push(g);
    }
  }
  // Transom band above the screens (dark wood) and floor deck
  P.darkWood.push(box(HW - 0.2, colH * 0.38 - 0.5, HD - 0.2, 0, base + colH * 0.62 + (colH * 0.38 - 0.5) / 2 + 0.05, 0));
  P.darkWood.push(box(HW + 1.6, 0.18, HD + 1.6, 0, base + 0.09, 0));                 // veranda deck
  // Veranda rail (low) on three sides, open at the stairs
  const railY = base + 0.55;
  for (const sx of [-1, 1]) {
    P.beam.push(box(0.1, 0.1, HD + 1.6, sx * (HW / 2 + 0.8), railY, 0));
    P.beam.push(box((HW + 1.6) / 2 - 2.6, 0.1, 0.1, sx * ((HW + 1.6) / 4 + 1.3), railY, HD / 2 + 0.8));
  }
  P.beam.push(box(HW + 1.6, 0.1, 0.1, 0, railY, -HD / 2 - 0.8));

  // Lower roof (wide skirt with deep eaves)
  const roof1Y = base + colH + 0.45;
  addRoof(P, { w: 17.5, d: 13.5, ridge: 7.5, h: 2.4, lift: 0.75, sag: 1.6 }, roof1Y, false);   // skirt: ridge hidden by the upper storey

  // Upper storey: smaller hall with its own posts, rail and screens
  const u = { w: 8.5, d: 5.5, h: 2.3 };
  const uBase = roof1Y + 1.55;
  P.darkWood.push(box(u.w, 0.3, u.d, 0, uBase, 0));
  for (const [x, z] of [[-u.w / 2, -u.d / 2], [u.w / 2, -u.d / 2], [-u.w / 2, u.d / 2], [u.w / 2, u.d / 2], [-1.4, u.d / 2], [1.4, u.d / 2], [-1.4, -u.d / 2], [1.4, -u.d / 2]]) {
    P.pillar.push(cyl(0.18, u.h, x, uBase + u.h / 2, z, 8));
  }
  {
    const g = new THREE.BoxGeometry(u.w - 0.3, u.h * 0.7, u.d - 0.3);
    const uv = g.attributes.uv; for (let k = 0; k < uv.count; k++) uv.setXY(k, uv.getX(k) * 6, uv.getY(k) * 1.6);
    g.translate(0, uBase + 0.2 + u.h * 0.35, 0);
    P.paper.push(g);
  }
  P.beam.push(box(u.w + 0.4, 0.28, u.d + 0.4, 0, uBase + u.h - 0.1, 0));
  // upper balcony rail
  P.beam.push(box(u.w + 1.4, 0.08, 0.08, 0, uBase + 0.55, u.d / 2 + 0.7));
  P.beam.push(box(u.w + 1.4, 0.08, 0.08, 0, uBase + 0.55, -u.d / 2 - 0.7));
  for (const sx of [-1, 1]) P.beam.push(box(0.08, 0.08, u.d + 1.4, sx * (u.w / 2 + 0.7), uBase + 0.55, 0));

  // Upper roof (taller, steeper, strong corner lift)
  const roof2Y = uBase + u.h + 0.2;
  const roof2 = { w: 12.5, d: 9.5, ridge: 4.6, h: 3.1, lift: 0.95, sag: 1.75 };
  addRoof(P, roof2, roof2Y);

  // Plaque under the upper roof, facing front
  if (plaque) {
    const pm = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 0.65), new THREE.MeshBasicMaterial({ map: plaqueTexture(plaque), toneMapped: false }));
    pm.position.set(0, uBase + u.h * 0.78, u.d / 2 + 0.02);
    group.add(pm);
  }

  // Hanging lanterns under the lower eaves (front + sides)
  const lanternPoints = [];
  if (lanterns) {
    const ly = roof1Y - 0.9;
    for (const [x, z] of [[-4.8, HD / 2 + 1.5], [4.8, HD / 2 + 1.5], [-2.2, HD / 2 + 1.5], [2.2, HD / 2 + 1.5], [-HW / 2 - 1.5, 0], [HW / 2 + 1.5, 0]]) {
      P.lantern.push(cyl(0.32, 0.75, x, ly, z, 12, 0.32));
      P.darkWood.push(cyl(0.34, 0.08, x, ly + 0.41, z, 12));
      P.darkWood.push(cyl(0.34, 0.08, x, ly - 0.41, z, 12));
      P.darkWood.push(cyl(0.02, 0.6, x, ly + 0.75, z, 4));
      lanternPoints.push(new THREE.Vector3(x, ly, z));
    }
  }

  merge(P, mats, group);
  const height = roof2Y + roof2.h + 1.0;
  return { group, height, lanternPoints, materials: mats };
}

// ── Pagoda ───────────────────────────────────────────────────────
/** Square pagoda of `tiers` storeys with a bronze spire (sōrin). */
export function buildPagoda({ tiers = 3, materials = null, paperGlow = 1.0 } = {}) {
  const mats = materials || templeMaterials({ paperGlow });
  const P = { stone: [], stoneDk: [], pillar: [], beam: [], darkWood: [], under: [], tile: [], ridge: [], gold: [], paper: [], lantern: [] };
  const group = new THREE.Group();
  P.stone.push(box(6.4, 0.9, 6.4, 0, 0.45, 0));
  let y = 0.9, size = 4.4;
  for (let i = 0; i < tiers; i++) {
    const hgt = i === 0 ? 2.6 : 2.0;
    P.paper.push(box(size * 0.86, hgt * 0.6, size * 0.86, 0, y + hgt * 0.4, 0));
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) P.pillar.push(cyl(0.16, hgt, sx * size / 2, y + hgt / 2, sz * size / 2, 8));
    P.beam.push(box(size + 0.3, 0.26, size + 0.3, 0, y + hgt - 0.1, 0));
    const rw = size + 3.2;
    const r = curvedHipRoof({ w: rw, d: rw, ridge: 0.01, h: 1.1, lift: 0.7, sag: 1.5, segS: 5, segT: 10 });
    for (const g of [r.top, r.under, r.fascia]) g.translate(0, y + hgt + 0.15, 0);
    P.tile.push(r.top); P.under.push(r.under); P.beam.push(r.fascia);
    y += hgt + 0.9;
    size *= 0.82;
  }
  // spire
  P.gold.push(cyl(0.12, 3.2, 0, y + 1.4, 0, 8));
  for (let k = 0; k < 6; k++) P.gold.push(new THREE.TorusGeometry(0.32 - k * 0.02, 0.05, 6, 12).rotateX(Math.PI / 2).translate(0, y + 0.6 + k * 0.38, 0));
  P.gold.push(new THREE.SphereGeometry(0.22, 10, 8).translate(0, y + 3.1, 0));
  merge(P, mats, group);
  return { group, height: y + 3.4, materials: mats };
}
