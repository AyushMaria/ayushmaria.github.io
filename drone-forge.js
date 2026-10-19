/**
 * drone-forge.js — the Drone Forge (§2.14)
 *
 * The building stands for MAVPose: it reads drone flight logs (MAVLink /
 * ArduPilot) and plots the flight and the drone's attitude. So the old
 * Forge keeps its Tudor gabled hall and chimney (built by the town's
 * usual building code) and gains a flat-roofed stone workshop wing:
 * barn doors stand open on a glowing hearth and a workbench with a
 * quadcopter on it, a landing pad marked "H" sits on the roof, an easel
 * outside shows a flight-log chart (roll, pitch, yaw), crates of parts
 * are stacked by the wall, and a quadcopter-shaped sign swings over the
 * door. A drone lifts off the pad, flies a loop over the forge and lands.
 *
 * Frame: the whole building's centre at the origin, ground at y = 0, the
 * front (+z) facing Forge Lane. The gabled hall takes local x < 0, the
 * wing x > 0 (see WING).
 */
import * as THREE from 'three';
import { mergeBufferGeometries } from 'https://cdn.jsdelivr.net/npm/three@0.150.0/examples/jsm/utils/BufferGeometryUtils.js';
import { standardMat } from './materials.js';
import { propMaterials } from './town-props.js';
import { stoneTexture } from './textures.js';

/** The workshop wing, in the building's frame. */
export const WING = { x0: 0.15, x1: 4.2, d: 5, h: 3.0 };
/** Where the gabled hall goes (centre x, width) so the two halves meet. */
export const HALL = { cx: -2.0, w: 4.3 };
const WX = (WING.x0 + WING.x1) / 2, WW = WING.x1 - WING.x0;
const PAD = new THREE.Vector3(WX, WING.h + 0.3, -0.1);
const OPEN = { w: 2.5, h: 2.25 };

const box = (w, h, d, x, y, z) => { const b = new THREE.BoxGeometry(w, h, d); b.translate(x, y, z); return b; };

function padTexture() {
  const cv = document.createElement('canvas');
  cv.width = cv.height = 256;
  const c = cv.getContext('2d');
  c.fillStyle = '#3a3d44'; c.beginPath(); c.arc(128, 128, 126, 0, Math.PI * 2); c.fill();
  c.strokeStyle = '#f2f2ee'; c.lineWidth = 10; c.beginPath(); c.arc(128, 128, 104, 0, Math.PI * 2); c.stroke();
  c.strokeStyle = '#ffcf3a'; c.lineWidth = 4; c.setLineDash([14, 10]); c.beginPath(); c.arc(128, 128, 118, 0, Math.PI * 2); c.stroke();
  c.fillStyle = '#f2f2ee'; c.fillRect(80, 70, 22, 116); c.fillRect(154, 70, 22, 116); c.fillRect(80, 117, 96, 22);
  return new THREE.CanvasTexture(cv);
}

function chartTexture() {
  const cv = document.createElement('canvas');
  cv.width = 256; cv.height = 180;
  const c = cv.getContext('2d');
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
  return new THREE.CanvasTexture(cv);
}

/** A small static quadcopter (for the bench and the sign). */
function quadGeometry(span = 0.7, arm = 0.05, rotor = 0.17) {
  const parts = [];
  for (const a of [Math.PI / 4, -Math.PI / 4]) { const b = new THREE.BoxGeometry(span, arm, arm); b.rotateY(a); parts.push(b); }
  for (const [x, z] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
    const r = new THREE.CylinderGeometry(rotor, rotor, 0.02, 12); r.translate(x * span * 0.35, arm, z * span * 0.35); parts.push(r);
  }
  parts.push(box(span * 0.32, arm * 2.6, span * 0.42, 0, arm, 0));
  return mergeBufferGeometries(parts.map(p => p.index ? p.toNonIndexed() : p));
}

/**
 * The workshop wing and its props.
 * @returns {{ group, pad: THREE.Vector3, glow: THREE.Vector3, update(t:number): void }}
 */
export function buildForgeWing(userData = null, { reducedMotion = false } = {}) {
  const g = new THREE.Group();
  const M = propMaterials();
  const stone = standardMat({ map: stoneTexture(), color: 0xd8cdb6, roughness: 0.92 }, 'forgeStone');
  const add = (m, cast = true) => { m.castShadow = cast; m.receiveShadow = true; g.add(m); return m; };
  const hd = WING.d / 2, H = WING.h, fz = hd;

  // ── Walls with a wide door opening at the front ───────────────
  {
    const t = 0.3, sideW = (WW - OPEN.w) / 2;
    const parts = [
      box(WW, H, t, WX, H / 2, -hd + t / 2),                                  // back
      box(t, H, WING.d, WING.x1 - t / 2, H / 2, 0),                           // right side
      box(sideW, H, t, WING.x0 + sideW / 2, H / 2, fz - t / 2),               // front piers
      box(sideW, H, t, WING.x1 - sideW / 2, H / 2, fz - t / 2),
      box(OPEN.w, H - OPEN.h, t, WX, OPEN.h + (H - OPEN.h) / 2, fz - t / 2),  // over the door
    ];
    for (const p of parts) {                                   // stone tiled at ~1.2 units
      const uv = p.attributes.uv;
      for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * 2.2, uv.getY(i) * 1.8);
    }
    const walls = add(new THREE.Mesh(mergeBufferGeometries(parts), stone));
    if (userData) walls.userData = userData;
    // roof slab + parapet, timber lintel over the doors
    const roof = [box(WW + 0.3, 0.25, WING.d + 0.3, WX, H + 0.12, 0)];
    roof.push(box(WW + 0.3, 0.3, 0.16, WX, H + 0.4, -hd - 0.07), box(WW + 0.3, 0.3, 0.16, WX, H + 0.4, hd + 0.07), box(0.16, 0.3, WING.d + 0.3, WING.x1 + 0.07, H + 0.4, 0));
    add(new THREE.Mesh(mergeBufferGeometries(roof), M.stoneDark));
    add(new THREE.Mesh(box(OPEN.w + 0.5, 0.22, 0.22, WX, OPEN.h + 0.1, fz + 0.02), M.timber));
    // dark floor inside
    add(new THREE.Mesh(box(WW - 0.5, 0.04, WING.d - 0.5, WX, 0.03, 0), standardMat({ color: 0x2e241c, roughness: 1 }, 'forgeFloor')), false);
  }

  // ── Inside: hearth glow on the back wall, workbench + quadcopter ──
  const glowMat = new THREE.MeshStandardMaterial({ color: 0x3a1a08, emissive: 0xff7a26, emissiveIntensity: 1.2, roughness: 1 });
  {
    const hearth = new THREE.Mesh(box(1.1, 0.7, 0.6, WING.x0 + 0.95, 0.35, -hd + 0.6), M.stoneDark);
    add(hearth);
    const coals = new THREE.Mesh(box(0.8, 0.12, 0.4, WING.x0 + 0.95, 0.74, -hd + 0.6), glowMat);
    g.add(coals);
    const wash = new THREE.Mesh(new THREE.PlaneGeometry(WW - 0.7, H - 0.4), new THREE.MeshBasicMaterial({ color: 0xff8a3a, transparent: true, opacity: 0.6, blending: THREE.AdditiveBlending, depthWrite: false }));
    wash.position.set(WX, H / 2, -hd + 0.31);
    g.add(wash);
    // warm light spilling out over the floor and the threshold
    const spill = new THREE.Mesh(new THREE.PlaneGeometry(OPEN.w + 0.6, 2.6), new THREE.MeshBasicMaterial({ color: 0xff9a4a, transparent: true, opacity: 0.32, blending: THREE.AdditiveBlending, depthWrite: false }));
    spill.rotation.x = -Math.PI / 2;
    spill.position.set(WX, 0.07, fz - 0.3);
    g.add(spill);
    // bench
    const bench = [box(2.0, 0.09, 0.75, WX + 0.4, 0.92, -0.9)];
    for (const [x, z] of [[-0.9, -0.3], [0.9, -0.3], [-0.9, 0.3], [0.9, 0.3]]) bench.push(box(0.08, 0.9, 0.08, WX + 0.4 + x, 0.45, -0.9 + z));
    add(new THREE.Mesh(mergeBufferGeometries(bench), M.woodDoor));
    const quad = new THREE.Mesh(quadGeometry(0.75), standardMat({ color: 0x2b2b30, roughness: 0.6 }, 'droneDark'));
    quad.position.set(WX + 0.5, 0.98, -0.9);
    quad.rotation.y = 0.5;
    add(quad, false);
    const tools = new THREE.Mesh(mergeBufferGeometries([box(0.3, 0.12, 0.2, WX - 0.25, 1.02, -0.8), box(0.06, 0.06, 0.4, WX + 1.1, 0.99, -1.0)]), M.iron);
    add(tools, false);
  }

  // ── Barn doors swung wide open ────────────────────────────────
  {
    const leafW = OPEN.w / 2, leafGeo = box(leafW, OPEN.h - 0.05, 0.09, leafW / 2, (OPEN.h - 0.05) / 2, 0);
    const brace = box(leafW * 1.05, 0.08, 0.04, leafW / 2, OPEN.h / 2, 0.06); brace.rotateZ(0);
    const leaf = mergeBufferGeometries([leafGeo, brace, box(leafW, 0.1, 0.04, leafW / 2, 0.3, 0.06), box(leafW, 0.1, 0.04, leafW / 2, OPEN.h - 0.35, 0.06)]);
    for (const s of [-1, 1]) {
      const m = new THREE.Mesh(leaf, M.timber);
      m.position.set(WX + s * OPEN.w / 2, 0, fz + 0.05);
      m.rotation.y = s < 0 ? -(Math.PI - 1.15) : -1.15;     // swung open outwards, ~65° off the wall
      add(m);
    }
  }

  // ── Landing pad on the roof ───────────────────────────────────
  {
    const pad = new THREE.Mesh(new THREE.CylinderGeometry(1.35, 1.35, 0.06, 32), new THREE.MeshStandardMaterial({ map: padTexture(), roughness: 0.8 }));
    pad.position.copy(PAD).add(new THREE.Vector3(0, -0.03, 0));
    pad.receiveShadow = true;
    g.add(pad);
    // little edge lights round the pad
    const lights = [];
    for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2; lights.push(box(0.09, 0.07, 0.09, PAD.x + Math.cos(a) * 1.45, PAD.y - 0.02, PAD.z + Math.sin(a) * 1.45)); }
    g.add(new THREE.Mesh(mergeBufferGeometries(lights), standardMat({ color: 0x9cf0a0, emissive: 0x5cff7a, emissiveIntensity: 1.2 }, 'padLight')));
  }

  // ── Outside: flight-log easel, crates of parts ────────────────
  {
    const ex = WING.x1 + 0.9, ez = 1.4;
    const legs = [];
    for (const [x, rz] of [[-0.35, 0.12], [0.35, -0.12]]) { const l = box(0.06, 1.7, 0.06, 0, 0.85, 0); l.rotateZ(rz); l.translate(x, 0, 0.05); legs.push(l); }
    const back = box(0.06, 1.6, 0.06, 0, 0.8, 0); back.rotateX(-0.35); back.translate(0, 0, -0.3); legs.push(back);
    legs.push(box(0.95, 0.05, 0.12, 0, 0.62, 0.1));
    const easel = new THREE.Group();
    easel.add(new THREE.Mesh(mergeBufferGeometries(legs), M.woodDoor));
    const board = new THREE.Mesh(new THREE.PlaneGeometry(1.05, 0.74), new THREE.MeshStandardMaterial({ map: chartTexture(), roughness: 0.9 }));
    board.position.set(0, 1.03, 0.14);
    board.rotation.x = -0.12;
    easel.add(board);
    easel.position.set(ex, 0, ez);
    easel.rotation.y = 0.45;                                  // turned towards the lane
    easel.traverse(m => { if (m.isMesh) m.castShadow = true; });
    g.add(easel);
    const crates = [box(0.7, 0.6, 0.7, WING.x1 + 0.55, 0.3, -1.3), box(0.6, 0.5, 0.6, WING.x1 + 0.6, 0.85, -1.25), box(0.55, 0.45, 0.55, WING.x1 + 0.6, 0.23, -0.5)];
    add(new THREE.Mesh(mergeBufferGeometries(crates), M.woodDoor));
  }

  // ── Quadcopter sign swinging over the door ────────────────────
  const signPivot = new THREE.Group();
  {
    signPivot.position.set(WING.x0 + 0.45, H - 0.25, fz + 0.15);
    const bracket = new THREE.Mesh(box(0.06, 0.06, 0.95, 0, 0, 0.45), M.iron);
    signPivot.add(bracket);
    const hang = new THREE.Group();
    hang.position.set(0, 0, 0.85);
    const chains = new THREE.Mesh(box(0.02, 0.32, 0.02, 0, -0.16, 0), M.iron);
    const q = new THREE.Mesh(quadGeometry(0.8, 0.07, 0.2), standardMat({ color: 0xb8893e, metalness: 0.6, roughness: 0.4 }, 'brass'));
    q.rotation.x = Math.PI / 2;                              // hung flat-face to the street
    q.position.y = -0.62;
    hang.add(chains, q);
    signPivot.add(hang);
    signPivot.userData.hang = hang;
  }
  g.add(signPivot);

  return {
    group: g,
    pad: PAD.clone(),
    glow: new THREE.Vector3(WX, 1.3, fz - 0.6),
    update(t) {
      // forge glow flickers
      glowMat.emissiveIntensity = 1.0 + Math.sin(t * 7.3) * 0.18 + Math.sin(t * 13.1) * 0.12;
      if (!reducedMotion) signPivot.userData.hang.rotation.x = Math.sin(t * 1.4) * 0.16;
    },
  };
}

/**
 * The pad drone's flight, in the building's frame: rest on the pad, lift
 * off, fly a loop over the forge, come back down and settle.
 * @returns {(t:number) => { pos: THREE.Vector3, yaw: number, pitch: number, bank: number, flying: boolean }}
 */
export function forgeFlight(toWorld, heading) {
  const CYC = 18, REST = 4, UP = 1.8, LOOP = 8.2, DOWN = 1.8;
  const ALT = 6.2, R = 3.4;                        // loop height above the pad, radius
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
