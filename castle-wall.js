/**
 * castle-wall.js — the town wall as a Japanese castle wall (ishigaki)
 *
 * Follows the same line, gaps and tower spots as before (town-layout.js):
 *   • runs     — a battered granite base (wider at the foot), a white plaster
 *                parapet on it with a black board skirt, square loopholes
 *                and a grey-tile cap
 *   • towers   — two-storey yagura on battered stone bases: white plaster,
 *                curved hip roofs in the City Hall's grey tile, a lit upper window
 *   • gate     — a roofed kōraimon over the High Street between two stone piers
 *   • water gate over the stream — stone lintel, plaster and cap, iron bars
 *
 * Everything is merged per material (~10 draw calls); materials take the
 * occlusion dither so the cart shows through when the wall is in the way.
 */
import * as THREE from 'three';
import { mergeBufferGeometries } from 'https://cdn.jsdelivr.net/npm/three@0.150.0/examples/jsm/utils/BufferGeometryUtils.js';
import { curvedHipRoof, templeMaterials } from './temple.js';
import { stoneTexture, plasterTexture } from './textures.js';
import { withOcclusionCut } from './materials.js';
import { seg as segCollider, obb } from './colliders.js';

// Sizes (world units)
const BASE_H = 3.0;          // stone base above the ground on the wall line
const BASE_FOOT = 2.6;       // depth of the stone base at its (buried) foot
const BASE_TOP = 0.55;       // top depth as a share of the foot (the batter)
const PARAPET_H = 2.1, PARAPET_D = 0.9, SKIRT_H = 0.75;
const CAP_H = 0.55, CAP_D = 2.0;
const SINK = 1.6;            // how far bases go below the lowest ground
const YAGURA = { foot: 6.0, top: 0.72, baseH: 3.4, body: 4.4, bodyH: 2.6, upper: 2.8, upperH: 1.8 };
const TOWER_CLEAR = 3.4;     // a tower spot needs this much room from any street

// ── geometry helpers ──────────────────────────────────────────────
const box = (w, h, d, x = 0, y = 0, z = 0) => new THREE.BoxGeometry(w, h, d).translate(x, y, z);
/** unit box whose top face is narrowed in Z (a battered wall), centred, 1 tall */
function batter(topScale) {
  const g = new THREE.BoxGeometry(1, 1, 1);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) if (p.getY(i) > 0) p.setZ(i, p.getZ(i) * topScale);
  g.computeVertexNormals();
  return g;
}
/** square base narrowed on both axes */
function batterSquare(topScale) {
  const g = new THREE.BoxGeometry(1, 1, 1);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) if (p.getY(i) > 0) { p.setX(i, p.getX(i) * topScale); p.setZ(i, p.getZ(i) * topScale); }
  g.computeVertexNormals();
  return g;
}
/** triangular prism along X: eave at y = 0, ridge at y = h, d deep */
function prism(len, h, d) {
  const s = new THREE.Shape(); s.moveTo(-d / 2, 0); s.lineTo(d / 2, 0); s.lineTo(0, h); s.lineTo(-d / 2, 0);
  const g = new THREE.ExtrudeGeometry(s, { depth: len, bevelEnabled: false });
  g.rotateY(Math.PI / 2); g.translate(-len / 2, 0, 0);
  return g;
}
/** local (x along the wall, z across) → world */
const place = (geo, x, y, z, yaw) => geo.rotateY(yaw).translate(x, y, z);

/**
 * @param scene
 * @param L  the town layout (wall line, gaps, ground, street clearance)
 * @returns {{ group, colliders, materials }}
 */
export function buildCastleWall(scene, L) {
  const T = templeMaterials({ paperGlow: 1.0 });
  const granite = new THREE.MeshStandardMaterial({ map: stoneTexture().clone(), color: 0xa7a299, roughness: 0.95 });
  granite.map.repeat.set(3, 2); granite.map.needsUpdate = true;
  const M = {
    granite: withOcclusionCut(granite),
    plaster: withOcclusionCut(new THREE.MeshStandardMaterial({ map: plasterTexture(), color: 0xf4f0e6, roughness: 0.9 })),
    black:   withOcclusionCut(new THREE.MeshStandardMaterial({ color: 0x23201e, roughness: 0.85 })),
    tile:    withOcclusionCut(T.tile),
    ridge:   withOcclusionCut(T.ridge),
    under:   withOcclusionCut(T.under),
    beam:    withOcclusionCut(T.beam),
    paper:   T.paper,
    iron:    new THREE.MeshStandardMaterial({ color: 0x3a3a3a, roughness: 0.5, metalness: 0.6 }),
  };
  const P = Object.fromEntries(Object.keys(M).map(k => [k, []]));
  const colliders = [];
  const W = L.wall, ground = L.groundAt;
  const pts = W.coarse.pts, total = W.coarse.length;
  const pointAt = (s) => { const k = W.path.pts.length, i = Math.round((((s % total) + total) % total) / total * k) % k; return W.path.pts[i]; };

  // ── runs: one per coarse segment that isn't in a gap ──
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i], b = pts[(i + 1) % pts.length];
    const sMid = (a.s + (b.s < a.s ? total : b.s)) / 2 % total;
    if (L.wallGap(sMid) || L.wallGap(a.s) || L.wallGap(b.s)) continue;
    const ga = ground(a.x, a.z), gb = ground(b.x, b.z), g = (ga + gb) / 2, lo = Math.min(ga, gb);
    const len = Math.hypot(b.x - a.x, b.z - a.z), yaw = Math.atan2(-(b.z - a.z), b.x - a.x);
    const mx = (a.x + b.x) / 2, mz = (a.z + b.z) / 2;
    const bh = BASE_H + (g - lo) + SINK;
    P.granite.push(place(batter(BASE_TOP).scale(len + 0.4, bh, BASE_FOOT), mx, lo - SINK + bh / 2, mz, yaw));
    const y0 = g + BASE_H;
    P.plaster.push(place(box(len + 0.3, PARAPET_H, PARAPET_D, 0, PARAPET_H / 2, 0), mx, y0, mz, yaw));
    P.black.push(place(box(len + 0.32, SKIRT_H, PARAPET_D + 0.04, 0, SKIRT_H / 2, 0), mx, y0, mz, yaw));
    P.tile.push(place(prism(len + 0.5, CAP_H, CAP_D).translate(0, PARAPET_H, 0), mx, y0, mz, yaw));
    P.ridge.push(place(box(len + 0.5, 0.14, 0.18, 0, PARAPET_H + CAP_H + 0.01, 0), mx, y0, mz, yaw));
    // loopholes, both faces: squares every ~2.3
    const n = Math.max(1, Math.round(len / 2.3));
    for (let k = 0; k < n; k++) {
      const u = ((k + 0.5) / n - 0.5) * len;
      P.black.push(place(box(0.3, 0.3, PARAPET_D + 0.06, u, 1.3, 0), mx, y0, mz, yaw));
    }
    // the foot is ~2.2 deep where it meets the ground
    colliders.push(segCollider(a.x, a.z, b.x, b.z, 1.1 + 0.25));
  }

  // ── yagura at the tower spots (every ~17 along the wall, clear of gaps and streets) ──
  const nearGap = (s, pad) => W.gaps.some(g => { let d = Math.abs(s - g.s); d = Math.min(d, total - d); return d < g.half + pad; });
  const clear = (s) => { const c = pointAt(s); return !L.roadClear || L.roadClear(c.x, c.z) > TOWER_CLEAR; };
  const towerAt = [];
  for (let s = 6; s < total - 4; s += 17) {
    if (nearGap(s, 4)) continue;
    const ok = [0, 3, -3, 6, -6].map(d => s + d).find(clear);
    if (ok !== undefined) towerAt.push(ok);
  }
  const Y = YAGURA;
  for (const s of towerAt) {
    const c = pointAt(s), yaw = Math.atan2(-c.tz, c.tx);
    let lo = Infinity;
    for (let k = 0; k < 8; k++) { const a = k / 8 * Math.PI * 2; lo = Math.min(lo, ground(c.x + Math.cos(a) * Y.foot / 2, c.z + Math.sin(a) * Y.foot / 2)); }
    const g = ground(c.x, c.z), bh = Y.baseH + (g - lo) + SINK;
    P.granite.push(place(batterSquare(Y.top).scale(Y.foot, bh, Y.foot), c.x, lo - SINK + bh / 2, c.z, yaw));
    const y0 = g + Y.baseH;
    P.plaster.push(place(box(Y.body, Y.bodyH, Y.body, 0, Y.bodyH / 2, 0), c.x, y0, c.z, yaw));
    P.black.push(place(box(Y.body + 0.04, 0.9, Y.body + 0.04, 0, 0.45, 0), c.x, y0, c.z, yaw));
    for (const sz of [-1, 1]) for (const u of [-1.1, 1.1]) P.black.push(place(box(0.34, 0.34, 0.06, u, 1.55, sz * (Y.body / 2 + 0.01)), c.x, y0, c.z, yaw));
    roof(P, { w: Y.body + 1.8, d: Y.body + 1.8, ridge: 1.6, h: 1.4, lift: 0.5, sag: 1.6 }, c.x, y0 + Y.bodyH + 0.15, c.z, yaw);
    const y1 = y0 + Y.bodyH + 0.8;
    P.plaster.push(place(box(Y.upper, Y.upperH, Y.upper, 0, Y.upperH / 2, 0), c.x, y1, c.z, yaw));
    P.paper.push(place(box(1.6, 0.5, Y.upper + 0.04, 0, 1.0, 0), c.x, y1, c.z, yaw));
    roof(P, { w: Y.upper + 1.6, d: Y.upper + 1.6, ridge: 1.0, h: 1.5, lift: 0.6, sag: 1.7 }, c.x, y1 + Y.upperH + 0.1, c.z, yaw);
    P.ridge.push(place(box(1.2, 0.3, 0.3, 0, 0.15, 0), c.x, y1 + Y.upperH + 1.6, c.z, yaw));
    // the base's foot where it meets the ground
    const half = Y.foot / 2 * (1 - (1 - Y.top) * (SINK + (g - lo)) / bh);
    colliders.push(obb(c.x, c.z, half + 0.2, half + 0.2, yaw));
  }

  // ── the gate (roofed kōraimon) and the water gate ──
  for (const gp of W.gaps) {
    const c = pointAt(gp.s), yaw = Math.atan2(-c.tz, c.tx);
    const span = gp.half * 2 + 1.6;
    const across = (u) => [Math.cos(yaw) * u, -Math.sin(yaw) * u];     // local x → world offset
    if (gp.kind === 'gate') {
      const yb = ground(gp.x, gp.z);
      for (const sx of [-1, 1]) {
        // stone pier closing the wall's end (on the wall line), and a black post inside it
        const q = pointAt(gp.s + sx * (gp.half + 1.9)), qy = Math.atan2(-q.tz, q.tx);
        const lo = Math.min(yb, ground(q.x, q.z)), ph = BASE_H + 1.6 + (yb - lo) + SINK;
        P.granite.push(place(batterSquare(0.7).scale(2.4, ph, 3.0), q.x, lo - SINK + ph / 2, q.z, qy));
        P.plaster.push(place(box(2.0, 1.2, 2.0, 0, BASE_H + 1.6 + 0.6, 0), q.x, yb, q.z, qy));
        colliders.push(obb(q.x, q.z, 1.25, 1.5, qy));
        const [px, pz] = across(sx * (gp.half + 0.3));
        P.black.push(place(box(0.5, 4.6, 0.5, 0, 2.3, 0), gp.x + px, yb, gp.z + pz, yaw));
        colliders.push({ circle: true, x: gp.x + px, z: gp.z + pz, r: 0.4 });
      }
      P.black.push(place(box(span + 0.6, 0.55, 0.6, 0, 4.4, 0), gp.x, yb, gp.z, yaw));
      P.black.push(place(box(span - 0.6, 0.3, 0.4, 0, 3.7, 0), gp.x, yb, gp.z, yaw));
      roof(P, { w: span + 2.2, d: 3.4, ridge: span - 1, h: 1.3, lift: 0.55 }, gp.x, yb + 5.0, gp.z, yaw);
      P.ridge.push(place(box(span - 0.8, 0.3, 0.3, 0, 0.15, 0), gp.x, yb + 6.3, gp.z, yaw));
    } else {
      const a = pointAt(gp.s - gp.half), b = pointAt(gp.s + gp.half);
      const yb = Math.max(ground(a.x, a.z), ground(b.x, b.z)) - 0.4;
      P.granite.push(place(box(span, 1.6, 2.4, 0, 4.2, 0), gp.x, yb, gp.z, yaw));
      P.plaster.push(place(box(span, 1.6, PARAPET_D, 0, 5.8, 0), gp.x, yb, gp.z, yaw));
      P.black.push(place(box(span + 0.02, SKIRT_H, PARAPET_D + 0.04, 0, 5.0 + SKIRT_H / 2, 0), gp.x, yb, gp.z, yaw));
      P.tile.push(place(prism(span + 0.4, CAP_H, CAP_D).translate(0, 6.6, 0), gp.x, yb, gp.z, yaw));
      for (let x = -gp.half + 0.4; x <= gp.half - 0.4; x += 0.45) P.iron.push(place(box(0.09, 4.0, 0.09, x, 1.6, 0), gp.x, yb, gp.z, yaw));
      colliders.push(segCollider(a.x, a.z, b.x, b.z, 0.5));
    }
  }

  const group = new THREE.Group();
  group.name = 'town-wall';
  for (const [k, list] of Object.entries(P)) {
    if (!list.length) continue;
    const geo = mergeBufferGeometries(list.map(g => {
      const n = g.index ? g.toNonIndexed() : g;
      for (const a of Object.keys(n.attributes)) if (!['position', 'normal', 'uv'].includes(a)) n.deleteAttribute(a);
      if (!n.attributes.uv) n.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(n.attributes.position.count * 2), 2));
      return n;
    }));
    const m = new THREE.Mesh(geo, M[k]);
    m.name = `town-wall-${k}`;
    m.castShadow = k !== 'paper';
    m.receiveShadow = true;
    group.add(m);
  }
  scene.add(group);
  return { group, colliders, materials: M };
}

function roof(P, spec, x, y, z, yaw) {
  const r = curvedHipRoof({ segS: 6, segT: 10, ...spec });
  P.tile.push(place(r.top, x, y, z, yaw));
  P.under.push(place(r.under, x, y, z, yaw));
  P.beam.push(place(r.fascia, x, y, z, yaw));
}
