/**
 * drone-forge.js — the Drone Forge as a kaji-ba (§2.14)
 *
 * The building stands for MAVPose: it reads drone flight logs (MAVLink /
 * ArduPilot) and plots the flight and the drone's attitude. So the old
 * trade and the new one stand side by side on one plot:
 *
 *   • the smithy (kaji-ba, local x < 0) — open to the lane between dark
 *     posts: a clay hearth glowing at the back, a bellows box, an anvil with
 *     a blade on it, a quench trough, and a shimenawa rope with paper shide
 *     across the front; white plaster walls and a hipped grey-tile roof with
 *     a raised smoke vent (kemuri-dashi) that the chimney smoke rises from
 *   • the drone workshop (local x > 0) — a machiya front: a glowing kōshi
 *     lattice, an indigo noren over the open door, a quadcopter on the bench
 *     inside and a brass quadcopter sign swinging at its corner; on its flat
 *     roof, a wooden drying deck (monohoshi-dai) with a vermilion rail
 *     carries the landing pad
 *   • by the lane — a roofed notice board (kōsatsu) with the flight log,
 *     and crates of parts beside the workshop
 *
 * A drone lifts off the pad, flies a loop over the smithy and lands
 * (forgeFlight). Frame: plot centre at the origin, ground at y = 0, the
 * front (+z) facing Forge Lane.
 */
import * as THREE from 'three';
import { mergeBufferGeometries } from 'https://cdn.jsdelivr.net/npm/three@0.150.0/examples/jsm/utils/BufferGeometryUtils.js';
import { curvedHipRoof, templeMaterials } from './temple.js';
import { stoneTexture, plasterTexture } from './textures.js';

// Layout (building frame)
const SMITHY = { x: -2.1, w: 4.0, d: 4.6, h: 3.2 };
const SHOP = { x: 2.15, w: 4.0, d: 4.6, h: 2.9, door: { x: 1.15, w: 1.2, h: 2.1 } };   // door.x: centre, from the shop's left edge
const DECK = { y: SHOP.h + 1.36, size: 3.2 };
const PAD = new THREE.Vector3(SHOP.x, DECK.y + 0.09, 0);
/** Where the notice board and the crates stand (outside the plot; colliders). */
export const YARD = { board: [4.9, 1.6, -0.4], crates: [4.75, -1.25] };

const box = (w, h, d, x = 0, y = 0, z = 0) => new THREE.BoxGeometry(w, h, d).translate(x, y, z);
const cyl = (r, h, x = 0, y = 0, z = 0, seg = 10, r2 = r) => new THREE.CylinderGeometry(r, r2, h, seg).translate(x, y, z);
function canvasTex(w, h, draw) {
  const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; return t;
}
function prism(len, h, d) {
  const s = new THREE.Shape(); s.moveTo(-d / 2, 0); s.lineTo(d / 2, 0); s.lineTo(0, h); s.lineTo(-d / 2, 0);
  const g = new THREE.ExtrudeGeometry(s, { depth: len, bevelEnabled: false }); g.rotateY(Math.PI / 2); g.translate(-len / 2, 0, 0); return g;
}

// ── textures ──────────────────────────────────────────────────────
const padTexture = () => canvasTex(256, 256, (c) => {
  c.fillStyle = '#3a3d44'; c.beginPath(); c.arc(128, 128, 126, 0, Math.PI * 2); c.fill();
  c.strokeStyle = '#f2f2ee'; c.lineWidth = 10; c.beginPath(); c.arc(128, 128, 104, 0, Math.PI * 2); c.stroke();
  c.strokeStyle = '#ffcf3a'; c.lineWidth = 4; c.setLineDash([14, 10]); c.beginPath(); c.arc(128, 128, 118, 0, Math.PI * 2); c.stroke();
  c.fillStyle = '#f2f2ee'; c.fillRect(80, 70, 22, 116); c.fillRect(154, 70, 22, 116); c.fillRect(80, 117, 96, 22);
});
const chartTexture = () => canvasTex(256, 180, (c) => {
  c.fillStyle = '#f4ecd8'; c.fillRect(0, 0, 256, 180);
  c.strokeStyle = '#c9bb98'; c.lineWidth = 1;
  for (let x = 20; x < 256; x += 26) { c.beginPath(); c.moveTo(x, 18); c.lineTo(x, 160); c.stroke(); }
  for (let y = 30; y < 160; y += 26) { c.beginPath(); c.moveTo(14, y); c.lineTo(248, y); c.stroke(); }
  c.fillStyle = '#3b2a1a'; c.font = 'bold 15px Georgia, serif'; c.fillText('FLIGHT LOG 07', 14, 14);
  const lines = [['#d8462f', 'roll', (x) => 70 + Math.sin(x * 0.07) * 22 + Math.sin(x * 0.23) * 6],
                 ['#2f6c9f', 'pitch', (x) => 95 + Math.sin(x * 0.045 + 1) * 18 + Math.sin(x * 0.31) * 4],
                 ['#3d9a4c', 'yaw', (x) => 130 - x * 0.12 + Math.sin(x * 0.02) * 8]];
  lines.forEach(([col, name, f], i) => {
    c.strokeStyle = col; c.lineWidth = 3; c.beginPath();
    for (let x = 16; x <= 246; x += 3) (x === 16 ? c.moveTo(x, f(x)) : c.lineTo(x, f(x)));
    c.stroke();
    c.fillStyle = col; c.font = 'bold 13px Georgia, serif'; c.fillText(name, 18 + i * 62, 175);
  });
});
const koshiTexture = () => canvasTex(64, 64, (c) => {
  c.fillStyle = '#ffca82'; c.fillRect(0, 0, 64, 64);
  c.fillStyle = '#2a1a12'; for (let x = 0; x < 64; x += 8) c.fillRect(x, 0, 5, 64);
  c.fillRect(0, 0, 64, 4); c.fillRect(0, 60, 64, 4);
});
const norenTexture = () => canvasTex(128, 64, (c) => {
  c.fillStyle = '#1f3557'; c.fillRect(0, 0, 128, 64);
  c.fillStyle = '#16263f'; for (const x of [42, 85]) c.fillRect(x - 1, 0, 2, 64);
  // a white quadcopter crest: four rotor rings on a cross
  c.strokeStyle = '#efe6d2'; c.lineWidth = 3;
  c.beginPath(); c.moveTo(52, 20); c.lineTo(76, 44); c.moveTo(76, 20); c.lineTo(52, 44); c.stroke();
  for (const [x, y] of [[52, 20], [76, 20], [52, 44], [76, 44]]) { c.beginPath(); c.arc(x, y, 6, 0, Math.PI * 2); c.stroke(); }
});

/** A small static quadcopter (the bench, the sign). */
function quadGeometry(span = 0.7, arm = 0.05, rotor = 0.17) {
  const parts = [];
  for (const a of [Math.PI / 4, -Math.PI / 4]) parts.push(new THREE.BoxGeometry(span, arm, arm).rotateY(a));
  for (const [x, z] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) parts.push(cyl(rotor, 0.02, x * span * 0.35, arm, z * span * 0.35, 12));
  parts.push(box(span * 0.32, arm * 2.6, span * 0.42, 0, arm, 0));
  return mergeBufferGeometries(parts.map(p => p.index ? p.toNonIndexed() : p));
}

/**
 * The whole Forge.
 * @returns {{ group, pad, glow, smoke, height, glowing: THREE.Material[], update(t:number): void }}
 */
export function buildForge(userData = null, { reducedMotion = false } = {}) {
  const T = templeMaterials({ paperGlow: 1.0 });
  const koshi = koshiTexture();
  const M = {
    stone:   new THREE.MeshStandardMaterial({ map: stoneTexture(), color: 0x9a948a, roughness: 0.95 }),
    plaster: new THREE.MeshStandardMaterial({ map: plasterTexture(), color: 0xf2ece0, roughness: 0.9 }),
    timber:  new THREE.MeshStandardMaterial({ color: 0x3b261a, roughness: 0.9 }),
    wood:    new THREE.MeshStandardMaterial({ color: 0x8a5a34, roughness: 0.85 }),
    earth:   new THREE.MeshStandardMaterial({ color: 0x2e241c, roughness: 1 }),
    clay:    new THREE.MeshStandardMaterial({ color: 0x9a6a48, roughness: 1 }),
    iron:    new THREE.MeshStandardMaterial({ color: 0x3a3a3c, roughness: 0.5, metalness: 0.6 }),
    steel:   new THREE.MeshStandardMaterial({ color: 0xc9ccd2, roughness: 0.25, metalness: 0.9 }),
    tile: T.tile, under: T.under, beam: T.beam, ridge: T.ridge, rail: T.pillar,
    rope:    new THREE.MeshStandardMaterial({ color: 0xd9c38a, roughness: 0.95 }),
    shide:   new THREE.MeshStandardMaterial({ color: 0xfafaf2, roughness: 0.8, side: THREE.DoubleSide }),
    koshi:   new THREE.MeshStandardMaterial({ map: koshi, emissive: 0xff9a4a, emissiveMap: koshi, emissiveIntensity: 0.9, roughness: 0.9 }),
    noren:   new THREE.MeshStandardMaterial({ map: norenTexture(), roughness: 0.9, side: THREE.DoubleSide }),
    pad:     new THREE.MeshStandardMaterial({ map: padTexture(), roughness: 0.8 }),
    padLight: new THREE.MeshStandardMaterial({ color: 0x9cf0a0, emissive: 0x5cff7a, emissiveIntensity: 1.2 }),
    chart:   new THREE.MeshStandardMaterial({ map: chartTexture(), roughness: 0.9 }),
    drone:   new THREE.MeshStandardMaterial({ color: 0x2b2b30, roughness: 0.6 }),
    glow:    new THREE.MeshStandardMaterial({ color: 0x3a1a08, emissive: 0xff7a26, emissiveIntensity: 1.3, roughness: 1 }),
  };
  const P = Object.fromEntries(Object.keys(M).map(k => [k, []]));
  const g = new THREE.Group();
  g.name = 'drone-forge';

  // ── plinth (and a stone skirt for where the slope falls away) ──
  P.stone.push(box(8.7, 0.35, 5.3, 0, 0.12, 0), box(8.6, 2.4, 5.2, 0, -1.25, 0));

  // ── the smithy ──
  {
    const { x: hx, w: hw, d: hd, h: H } = SMITHY;
    const y0 = 0.3;
    for (const x of [hx - hw / 2, hx - hw / 6, hx + hw / 6, hx + hw / 2]) for (const z of [-hd / 2, hd / 2]) P.timber.push(box(0.22, H, 0.22, x, y0 + H / 2, z));
    P.plaster.push(box(hw, 1.0, 0.16, hx, y0 + H - 0.5, hd / 2));                   // band over the open front
    P.plaster.push(box(hw, H, 0.16, hx, y0 + H / 2, -hd / 2));                      // back wall
    P.plaster.push(box(0.16, H, hd, hx - hw / 2, y0 + H / 2, 0));                   // left wall
    P.timber.push(box(hw + 0.3, 0.22, 0.24, hx, y0 + H - 1.0, hd / 2 + 0.02), box(hw + 0.3, 0.2, 0.2, hx, y0 + H + 0.02, hd / 2));
    P.earth.push(box(hw - 0.2, 0.04, hd - 0.2, hx, y0 + 0.02, 0));
    // hearth, bellows, anvil + blade, quench trough, tongs on the wall
    P.clay.push(box(1.3, 0.9, 1.0, hx - 0.7, y0 + 0.45, -1.2), box(0.9, 1.4, 0.5, hx - 0.7, y0 + 1.6, -1.95));
    P.glow.push(box(0.9, 0.12, 0.6, hx - 0.7, y0 + 0.93, -1.15));
    P.wood.push(box(0.8, 0.6, 0.6, hx - 1.75, y0 + 0.3, -1.1), box(0.06, 0.06, 0.7, hx - 1.75, y0 + 0.62, -0.7));
    P.wood.push(cyl(0.3, 0.5, hx + 0.6, y0 + 0.25, 0, 10));                          // the anvil's log
    P.iron.push(box(0.62, 0.22, 0.28, hx + 0.6, y0 + 0.62, 0), box(0.3, 0.14, 0.22, hx + 0.6, y0 + 0.47, 0));
    P.steel.push(box(0.05, 0.02, 0.95, hx + 0.6, y0 + 0.74, 0.08));
    P.wood.push(box(1.1, 0.4, 0.5, hx + 1.2, y0 + 0.2, -1.4));
    P.iron.push(box(0.04, 0.7, 0.04, hx + 0.3, y0 + 1.6, -hd / 2 + 0.12), box(0.04, 0.6, 0.04, hx + 0.45, y0 + 1.55, -hd / 2 + 0.12));
    // shimenawa with shide across the open front
    const a = new THREE.Vector3(hx - hw / 2, y0 + H - 0.75, hd / 2 + 0.16), b = new THREE.Vector3(hx + hw / 2, y0 + H - 0.75, hd / 2 + 0.16);
    const mid = a.clone().lerp(b, 0.5); mid.y -= 0.32;
    const rope = new THREE.QuadraticBezierCurve3(a, mid, b);
    P.rope.push(new THREE.TubeGeometry(rope, 24, 0.075, 8));
    for (let i = 1; i <= 5; i++) {
      const p = rope.getPoint(i / 6);
      const s = new THREE.Shape(); s.moveTo(-0.07, 0); s.lineTo(0.07, 0); s.lineTo(0.07, -0.12); s.lineTo(-0.03, -0.12); s.lineTo(-0.03, -0.24); s.lineTo(0.07, -0.24); s.lineTo(0.07, -0.36); s.lineTo(-0.07, -0.36);
      P.shide.push(new THREE.ShapeGeometry(s).translate(p.x, p.y - 0.06, p.z + 0.09));
    }
    // hipped roof, and the smoke vent lifted over the ridge
    const r1 = curvedHipRoof({ w: hw + 1.8, d: hd + 1.6, ridge: hw * 0.55, h: 1.5, lift: 0.5, sag: 1.6, segS: 6, segT: 10 });
    P.tile.push(r1.top.translate(hx, y0 + H + 0.1, 0)); P.under.push(r1.under.translate(hx, y0 + H + 0.1, 0)); P.beam.push(r1.fascia.translate(hx, y0 + H + 0.1, 0));
    P.timber.push(box(1.4, 0.45, 0.8, hx, y0 + H + 1.75, 0));
    const r2 = curvedHipRoof({ w: 1.9, d: 1.3, ridge: 0.9, h: 0.4, lift: 0.2, segS: 4, segT: 8 });
    P.tile.push(r2.top.translate(hx, y0 + H + 1.98, 0)); P.under.push(r2.under.translate(hx, y0 + H + 1.98, 0)); P.beam.push(r2.fascia.translate(hx, y0 + H + 1.98, 0));
    P.ridge.push(box(1.0, 0.12, 0.14, hx, y0 + H + 2.42, 0));
  }

  // ── the drone workshop ──
  {
    const { x: sx, w: sw, d: sd, h: H, door } = SHOP;
    const y0 = 0.3, left = sx - sw / 2, t = 0.2;
    const dx0 = left + door.x - door.w / 2, dx1 = left + door.x + door.w / 2;
    P.timber.push(box(sw, H, t, sx, y0 + H / 2, -sd / 2 + t / 2));                 // back
    P.timber.push(box(t, H, sd, left + t / 2, y0 + H / 2, 0), box(t, H, sd, sx + sw / 2 - t / 2, y0 + H / 2, 0));
    P.timber.push(box(dx0 - left, H, t, (left + dx0) / 2, y0 + H / 2, sd / 2 - t / 2));
    P.timber.push(box(sx + sw / 2 - dx1, H, t, (dx1 + sx + sw / 2) / 2, y0 + H / 2, sd / 2 - t / 2));
    P.timber.push(box(door.w, H - door.h, t, (dx0 + dx1) / 2, y0 + door.h + (H - door.h) / 2, sd / 2 - t / 2));
    P.earth.push(box(sw - 0.4, 0.04, sd - 0.4, sx, y0 + 0.02, 0));
    // the kōshi lattice across the front right of the door
    const lw = sx + sw / 2 - dx1 - 0.35;
    const lat = new THREE.PlaneGeometry(lw, 1.5); { const uv = lat.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setX(i, uv.getX(i) * lw / 1.4); }
    P.koshi.push(lat.translate(dx1 + 0.15 + lw / 2, y0 + 1.15, sd / 2 + 0.02));
    // noren over the door; a lit back wall, a bench and a drone inside
    P.noren.push(new THREE.PlaneGeometry(door.w + 0.1, 0.6).translate((dx0 + dx1) / 2, y0 + door.h - 0.25, sd / 2 + 0.06));
    P.glow.push(new THREE.PlaneGeometry(sw - 0.5, H - 0.4).translate(sx, y0 + H / 2, -sd / 2 + t + 0.01));
    const bx = (dx0 + dx1) / 2 + 0.2, bz = -0.6;
    P.wood.push(box(2.0, 0.09, 0.75, bx + 0.4, y0 + 0.92, bz));
    for (const [x, z] of [[-0.9, -0.3], [0.9, -0.3], [-0.9, 0.3], [0.9, 0.3]]) P.wood.push(box(0.08, 0.9, 0.08, bx + 0.4 + x, y0 + 0.45, bz + z));
    P.drone.push(quadGeometry(0.75).rotateY(0.5).translate(bx + 0.3, y0 + 0.98, bz));
    P.iron.push(box(0.3, 0.12, 0.2, bx + 1.0, y0 + 1.02, bz + 0.1));
    // flat tile roof, and the drying deck on posts with a vermilion rail
    P.tile.push(box(sw + 0.5, 0.18, sd + 0.5, sx, y0 + H + 0.08, 0));
    P.ridge.push(box(sw + 0.52, 0.06, 0.08, sx, y0 + H + 0.19, sd / 2 + 0.22));
    const half = DECK.size / 2;
    for (const x of [sx - half + 0.2, sx + half - 0.2]) for (const z of [-half + 0.2, half - 0.2]) P.timber.push(box(0.14, DECK.y - (y0 + H + 0.17), 0.14, x, (DECK.y + y0 + H + 0.17) / 2, z));
    P.wood.push(box(DECK.size, 0.12, DECK.size, sx, DECK.y - 0.06, 0));
    for (const s of [-1, 1]) {
      P.rail.push(box(DECK.size, 0.07, 0.07, sx, DECK.y + 0.44, s * half), box(0.07, 0.07, DECK.size, sx + s * half, DECK.y + 0.44, 0));
      for (const u of [-half, 0, half]) P.rail.push(box(0.07, 0.45, 0.07, sx + s * half, DECK.y + 0.22, u), box(0.07, 0.45, 0.07, sx + u, DECK.y + 0.22, s * half));
    }
    P.pad.push(cyl(1.25, 0.06, PAD.x, PAD.y - 0.03, PAD.z, 32));
    for (let i = 0; i < 8; i++) { const a = i / 8 * Math.PI * 2; P.padLight.push(box(0.09, 0.07, 0.09, PAD.x + Math.cos(a) * 1.35, PAD.y - 0.02, PAD.z + Math.sin(a) * 1.35)); }
    // a ladder up the side to the deck
    for (const s of [-0.22, 0.22]) P.wood.push(box(0.05, DECK.y, 0.05, sx + sw / 2 + 0.12, DECK.y / 2, -1.2 + s));
    for (let y = 0.4; y < DECK.y; y += 0.35) P.wood.push(box(0.04, 0.04, 0.44, sx + sw / 2 + 0.12, y, -1.2));
  }

  // ── the yard: a roofed notice board with the flight log, crates of parts ──
  {
    const [x, z, ry] = YARD.board;
    const put = (key, geo) => P[key].push(geo.rotateY(ry).translate(x, 0, z));
    put('timber', box(0.1, 1.9, 0.1, -0.62, 0.95, 0)); put('timber', box(0.1, 1.9, 0.1, 0.62, 0.95, 0));
    put('timber', box(1.24, 0.9, 0.06, 0, 1.35, 0));
    put('chart', new THREE.PlaneGeometry(1.1, 0.78).translate(0, 1.35, 0.04));
    put('tile', prism(1.6, 0.25, 0.5).translate(0, 1.92, 0));
    const [cx, cz] = YARD.crates;
    P.wood.push(box(0.7, 0.6, 0.7, cx, 0.3, cz), box(0.6, 0.5, 0.6, cx + 0.05, 0.85, cz + 0.05), box(0.55, 0.45, 0.55, cx + 0.05, 0.23, cz + 0.75));
  }

  // merge per material
  const glowing = [M.koshi, M.glow, M.padLight];
  for (const [k, list] of Object.entries(P)) {
    if (!list.length) continue;
    const geo = mergeBufferGeometries(list.map(x => {
      const n = x.index ? x.toNonIndexed() : x;
      for (const a of Object.keys(n.attributes)) if (!['position', 'normal', 'uv'].includes(a)) n.deleteAttribute(a);
      if (!n.attributes.uv) n.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(n.attributes.position.count * 2), 2));
      return n;
    }));
    const m = new THREE.Mesh(geo, M[k]);
    m.name = `forge-${k}`;
    m.castShadow = !['glow', 'koshi', 'padLight', 'shide', 'chart', 'noren'].includes(k);
    m.receiveShadow = true;
    if (userData) m.userData = { ...userData };
    g.add(m);
  }

  // the hearth's warm wash on the smithy's back wall, spilling out over the threshold
  {
    const { x: hx, d: hd } = SMITHY;
    const wash = new THREE.Mesh(new THREE.PlaneGeometry(3.0, 2.2), new THREE.MeshBasicMaterial({ color: 0xff8a3a, transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false }));
    wash.position.set(hx - 0.3, 1.5, -hd / 2 + 0.1);
    g.add(wash);
    const spill = new THREE.Mesh(new THREE.PlaneGeometry(3.6, 2.4), new THREE.MeshBasicMaterial({ color: 0xff9a4a, transparent: true, opacity: 0.3, blending: THREE.AdditiveBlending, depthWrite: false }));
    spill.rotation.x = -Math.PI / 2;
    spill.position.set(hx, 0.36, hd / 2 - 0.4);
    g.add(spill);
  }

  // the brass quadcopter sign swinging over the workshop door
  const signPivot = new THREE.Group();
  {
    const brass = new THREE.MeshStandardMaterial({ color: 0xb8893e, metalness: 0.6, roughness: 0.4 });
    // at the shop's right-hand corner, clear of the door
    signPivot.position.set(SHOP.x + SHOP.w / 2 - 0.15, 0.3 + SHOP.h - 0.25, SHOP.d / 2 + 0.12);
    signPivot.add(new THREE.Mesh(box(0.06, 0.06, 0.95, 0, 0, 0.45), M.iron));
    const hang = new THREE.Group();
    hang.position.set(0, 0, 0.85);
    const q = new THREE.Mesh(quadGeometry(0.8, 0.07, 0.2), brass);
    q.rotation.x = Math.PI / 2;
    q.position.y = -0.62;
    hang.add(new THREE.Mesh(box(0.02, 0.32, 0.02, 0, -0.16, 0), M.iron), q);
    signPivot.add(hang);
    signPivot.userData.hang = hang;
    signPivot.traverse(m => { if (m.isMesh) { m.castShadow = true; if (userData) m.userData = { ...userData }; } });
  }
  g.add(signPivot);

  const vent = new THREE.Vector3(SMITHY.x, 0.3 + SMITHY.h + 2.5, 0);
  return {
    group: g,
    pad: PAD.clone(),
    glow: new THREE.Vector3(SMITHY.x - 0.5, 1.3, SMITHY.d / 2 - 0.6),
    smoke: vent,
    height: vent.y,
    glowing,
    update(t) {
      M.glow.emissiveIntensity = 1.1 + Math.sin(t * 7.3) * 0.18 + Math.sin(t * 13.1) * 0.12;    // the fire flickers
      if (!reducedMotion) signPivot.userData.hang.rotation.x = Math.sin(t * 1.4) * 0.16;
    },
  };
}

/**
 * The pad drone's flight, in the building's frame: rest on the pad, lift
 * off, fly a loop over the smithy, come back down and settle.
 * @returns {(t:number) => { pos: THREE.Vector3, yaw: number, pitch: number, bank: number, flying: boolean }}
 */
export function forgeFlight(toWorld, heading) {
  const CYC = 18, REST = 4, UP = 1.8, LOOP = 8.2, DOWN = 1.8;
  const ALT = 5.2, R = 3.4;                        // loop height above the pad, radius
  const sit = PAD.clone().add(new THREE.Vector3(0, 0.22, 0));
  const centre = sit.clone().add(new THREE.Vector3(-R, 0, 0));    // pad sits on the loop
  const ease = (x) => x * x * (3 - 2 * x);
  const p = new THREE.Vector3();
  return (t) => {
    const ph = t % CYC;
    let yaw = 0, pitch = 0, bank = 0, flying = true;
    if (ph < REST) { p.copy(sit); flying = false; }
    else if (ph < REST + UP) { p.copy(sit); p.y += ALT * ease((ph - REST) / UP); }
    else if (ph < REST + UP + LOOP) {
      const u = (ph - REST - UP) / LOOP, a = u * Math.PI * 2;      // counter-clockwise from the pad
      p.set(centre.x + Math.cos(a) * R, sit.y + ALT + Math.sin(a * 2) * 0.4, centre.z - Math.sin(a) * R);
      yaw = Math.atan2(-Math.sin(a), -Math.cos(a));                // along the tangent
      pitch = 0.18; bank = -0.3;
    } else if (ph < REST + UP + LOOP + DOWN) { p.copy(sit); p.y += ALT * (1 - ease((ph - REST - UP - LOOP) / DOWN)); }
    else { p.copy(sit); flying = false; }
    return { pos: toWorld(p), yaw: yaw + heading, pitch, bank, flying };
  };
}
