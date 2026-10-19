/**
 * fan-square.js — Fan Square, the little paved square at the bridge head
 * on the way to the Prediction Colosseum (§2.14). Arena Lane runs through it.
 *
 * North of the lane: food stalls, a timber ticket kiosk with a striped
 * awning, a club flag on a tall pole, and bunting in the stadium's team
 * colours strung from the stalls to the square's lamp and the kiosk.
 * South of the lane, by the river: a bronze footballer on a stone plinth
 * and benches facing the water. Positions come from
 * FAN_SQUARE in town-layout.js; the market stalls themselves are the shared
 * buildStall() from town-props.js. Everything here is static; the statue
 * and kiosk are merged per material (~8 draw calls in all).
 */
import * as THREE from 'three';
import { mergeBufferGeometries } from 'https://cdn.jsdelivr.net/npm/three@0.150.0/examples/jsm/utils/BufferGeometryUtils.js';
import { standardMat } from './materials.js';
import { propMaterials } from './town-props.js';
import { obb } from './colliders.js';
import { mergeStaticChildren } from './merge-static.js';

const KITS = [0xd8462f, 0x2f6c9f, 0xf2c230, 0xe9e4da];      // same as the stadium crowd

/** The heading that turns local +z towards (tx, tz). */
const facing = (x, z, tx, tz) => Math.atan2(tx - x, tz - z);

// ── Statue: a footballer striking a ball, on a stepped plinth ──────
function buildStatue() {
  const g = new THREE.Group();
  const M = propMaterials();
  const step = new THREE.Mesh(new THREE.BoxGeometry(2.1, 0.25, 2.1), M.stoneDark);
  step.position.y = 0.125;
  const plinth = new THREE.Mesh(new THREE.BoxGeometry(1.3, 1.25, 1.3), M.stone);
  plinth.position.y = 0.25 + 0.625;
  const cap = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.14, 1.5), M.stoneDark);
  cap.position.y = 1.57;
  for (const m of [step, plinth, cap]) { m.castShadow = true; m.receiveShadow = true; g.add(m); }

  // the figure: simple limbs posed mid-kick, all one bronze mesh
  const parts = [];
  const limb = (len, r0, r1, x, y, z, rx, rz) => {
    const c = new THREE.CylinderGeometry(r1, r0, len, 7);
    c.translate(0, -len / 2, 0);                   // pivot at the top (hip / shoulder)
    c.rotateX(rx); c.rotateZ(rz);
    c.translate(x, y, z);
    parts.push(c);
  };
  const base = 1.64;
  const hip = base + 1.02;
  limb(1.0, 0.09, 0.12, 0.13, hip, 0.05, -0.12, 0.05);           // standing leg
  limb(0.98, 0.08, 0.12, -0.12, hip, 0, -1.15, -0.1);            // kicking leg, swung forward
  const torso = new THREE.CylinderGeometry(0.2, 0.16, 0.72, 8);
  torso.rotateX(0.18);
  torso.translate(0, hip + 0.38, -0.05);
  parts.push(torso);
  limb(0.68, 0.05, 0.07, 0.27, hip + 0.68, -0.05, 0.9, 0.9);     // arms out for balance
  limb(0.68, 0.05, 0.07, -0.27, hip + 0.68, -0.05, -0.7, -0.95);
  const head = new THREE.SphereGeometry(0.15, 10, 8);
  head.translate(0, hip + 0.9, -0.1);
  parts.push(head);
  // the boot meets the ball out in front
  const ball = new THREE.SphereGeometry(0.15, 12, 10);
  ball.translate(-0.17, base + 0.42, 0.98);
  parts.push(ball);
  const geo = mergeBufferGeometries(parts.map(p => p.index ? p.toNonIndexed() : p), false);
  geo.computeVertexNormals();
  const bronze = new THREE.Mesh(geo, standardMat({ color: 0x8a6a3e, metalness: 0.55, roughness: 0.42 }, 'bronze'));
  bronze.castShadow = true;
  g.add(bronze);
  return g;
}

// ── Ticket kiosk: timber booth, striped awning, a sign on the roof ──
function stripeTexture() {
  const cv = document.createElement('canvas');
  cv.width = 128; cv.height = 16;
  const c = cv.getContext('2d');
  for (let i = 0; i < 8; i++) { c.fillStyle = i % 2 ? '#efe6d2' : '#c8402c'; c.fillRect(i * 16, 0, 16, 16); }
  const t = new THREE.CanvasTexture(cv);
  return t;
}
function signTexture(text) {
  const cv = document.createElement('canvas');
  cv.width = 256; cv.height = 64;
  const c = cv.getContext('2d');
  c.fillStyle = '#2b1d14'; c.fillRect(0, 0, 256, 64);
  c.strokeStyle = '#c9a25a'; c.lineWidth = 4; c.strokeRect(4, 4, 248, 56);
  c.fillStyle = '#f2d48a'; c.font = 'bold 34px Georgia, serif'; c.textAlign = 'center'; c.textBaseline = 'middle';
  c.fillText(text, 128, 34);
  const t = new THREE.CanvasTexture(cv);
  return t;
}
function buildKiosk() {
  const g = new THREE.Group();
  const M = propMaterials();
  const W = 1.9, D = 1.6, H = 2.2;
  const body = new THREE.Mesh(new THREE.BoxGeometry(W, H, D), M.timber);
  body.position.y = H / 2;
  body.castShadow = true; body.receiveShadow = true;
  g.add(body);
  // counter window at the front (+z), dark inside
  const hole = new THREE.Mesh(new THREE.BoxGeometry(W * 0.62, 0.62, 0.05), standardMat({ color: 0x1d140e, roughness: 1 }, 'kioskDark'));
  hole.position.set(0, 1.42, D / 2 + 0.01);
  g.add(hole);
  const counter = new THREE.Mesh(new THREE.BoxGeometry(W * 0.75, 0.07, 0.32), M.woodDoor);
  counter.position.set(0, 1.08, D / 2 + 0.14);
  g.add(counter);
  // sloping awning over the window
  const awn = new THREE.Mesh(new THREE.PlaneGeometry(W + 0.3, 0.8),
    new THREE.MeshStandardMaterial({ map: stripeTexture(), side: THREE.DoubleSide, roughness: 0.8 }));
  awn.rotation.x = -Math.PI / 2 + 0.55;
  awn.position.set(0, 1.95, D / 2 + 0.32);
  awn.castShadow = true;
  g.add(awn);
  // pyramid roof and a sign
  const roof = new THREE.Mesh(new THREE.ConeGeometry(1.45, 0.75, 4), M.tileDark);
  roof.rotation.y = Math.PI / 4;
  roof.position.y = H + 0.37;
  roof.castShadow = true;
  g.add(roof);
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 0.38),
    new THREE.MeshStandardMaterial({ map: signTexture('TICKETS'), roughness: 0.7, emissive: 0x332211, emissiveIntensity: 0.4 }));
  sign.position.set(0, H + 0.12, D / 2 + 0.05);
  g.add(sign);
  return g;
}

// ── Bunting: triangles hanging from a sagging cord ──────────────
function buildBunting(points) {
  const pos = [], col = [], c = new THREE.Color();
  const cord = [];
  let k = 0;
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i], b = points[i + 1];
    const len = a.distanceTo(b), n = Math.max(3, Math.round(len / 0.42));
    const sag = Math.min(0.55, len * 0.09);
    const at = (t) => new THREE.Vector3().lerpVectors(a, b, t).setY(THREE.MathUtils.lerp(a.y, b.y, t) - sag * 4 * t * (1 - t));
    for (let j = 0; j <= n; j++) cord.push(at(j / n));
    for (let j = 0; j < n; j++) {
      const p0 = at((j + 0.12) / n), p1 = at((j + 0.88) / n);
      const mid = p0.clone().lerp(p1, 0.5); mid.y -= 0.3;
      pos.push(p0.x, p0.y, p0.z, p1.x, p1.y, p1.z, mid.x, mid.y, mid.z);
      c.setHex(KITS[k++ % KITS.length]);
      for (let v = 0; v < 3; v++) col.push(c.r, c.g, c.b);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  geo.computeVertexNormals();
  const flags = new THREE.Mesh(geo, standardMat({ vertexColors: true, side: THREE.DoubleSide, roughness: 0.9 }, 'bunting'));
  const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints(cord), new THREE.LineBasicMaterial({ color: 0x3a2a1e }));
  flags.userData.keep = true;                      // vertex colours: don't merge
  const g = new THREE.Group();
  g.add(flags, line);
  return g;
}

// ── Club flag on a tall pole ─────────────────────────────────────
function flagTexture() {
  const cv = document.createElement('canvas');
  cv.width = 128; cv.height = 80;
  const c = cv.getContext('2d');
  c.fillStyle = '#2f6c9f'; c.fillRect(0, 0, 128, 80);
  c.fillStyle = '#d8462f'; c.fillRect(0, 0, 128, 26); c.fillRect(0, 54, 128, 26);
  c.fillStyle = '#f2c230'; c.beginPath(); c.arc(64, 40, 15, 0, Math.PI * 2); c.fill();
  c.fillStyle = '#2f6c9f'; c.font = 'bold 18px Georgia, serif'; c.textAlign = 'center'; c.textBaseline = 'middle';
  c.fillText('xG', 64, 41);
  return new THREE.CanvasTexture(cv);
}
function buildFlagPole() {
  const g = new THREE.Group();
  const M = propMaterials();
  const base = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.5, 0.35, 10), M.stoneDark);
  base.position.y = 0.17;
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.07, 5.4, 8), M.iron);
  pole.position.y = 2.9;
  const knob = new THREE.Mesh(new THREE.SphereGeometry(0.1, 8, 6), standardMat({ color: 0xc9a25a, metalness: 0.6, roughness: 0.4 }, 'brass'));
  knob.position.y = 5.65;
  for (const m of [base, pole, knob]) { m.castShadow = true; g.add(m); }
  // the flag, a little wavy, flying from the top
  const geo = new THREE.PlaneGeometry(1.6, 1.0, 8, 1);
  const p = geo.attributes.position;
  for (let i = 0; i < p.count; i++) { const x = p.getX(i) + 0.8; p.setX(i, x); p.setZ(i, Math.sin(x * 3.2) * 0.1 * x); }
  geo.computeVertexNormals();
  const flag = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ map: flagTexture(), side: THREE.DoubleSide, roughness: 0.85 }));
  flag.position.set(0.05, 5.0, 0);
  flag.castShadow = true;
  flag.userData.keep = true;
  g.add(flag);
  return g;
}

// ── Bench: timber slats on two stone feet ──────────────────────
function buildBench() {
  const g = new THREE.Group();
  const M = propMaterials();
  for (const x of [-0.65, 0.65]) {
    const foot = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.42, 0.5), M.stoneDark);
    foot.position.set(x, 0.21, 0);
    g.add(foot);
  }
  const seat = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.08, 0.5), M.woodDoor);
  seat.position.y = 0.46;
  const back = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.36, 0.07), M.woodDoor);
  back.position.set(0, 0.72, -0.24);
  back.rotation.x = -0.15;
  for (const m of [seat, back]) { m.castShadow = true; g.add(m); }
  return g;
}

/**
 * Build the square's furniture.
 * @param {THREE.Scene} scene
 * @param {object} F            FAN_SQUARE from town-layout.js
 * @param {(x:number,z:number)=>number} groundAt
 * @returns {{ group: THREE.Group, colliders: object[] }}
 */
export function buildFanSquare(scene, F, groundAt) {
  const group = new THREE.Group();
  const colliders = [];
  const [cx, cz] = F.centre;

  const statue = buildStatue();
  const [sx, sz] = F.statue;
  statue.position.set(sx, groundAt(sx, sz), sz);
  statue.rotation.y = facing(sx, sz, sx + 1, sz + 1.4);     // striking towards the river
  mergeStaticChildren(statue);
  group.add(statue);
  colliders.push({ circle: true, x: sx, z: sz, r: 1.25 });

  const flag = buildFlagPole();
  flag.position.set(cx, groundAt(cx, cz), cz);
  flag.rotation.y = -0.6;
  mergeStaticChildren(flag);
  group.add(flag);
  colliders.push({ circle: true, x: cx, z: cz, r: 0.5 });

  for (const [bx, bz] of F.benches) {
    const bench = buildBench();
    const bh = facing(bx, bz, bx + 0.3, bz + 1);               // looking out over the water
    bench.position.set(bx, groundAt(bx, bz), bz);
    bench.rotation.y = bh;
    mergeStaticChildren(bench);
    group.add(bench);
    colliders.push(obb(bx, bz, 0.9, 0.35, bh));
  }

  const kiosk = buildKiosk();
  const [kx, kz] = F.kiosk;
  const kh = facing(kx, kz, cx, cz);
  kiosk.position.set(kx, groundAt(kx, kz), kz);
  kiosk.rotation.y = kh;
  mergeStaticChildren(kiosk);
  group.add(kiosk);
  colliders.push(obb(kx, kz, 1.05, 0.9, kh));

  const pts = F.bunting.map(([x, z, h]) => new THREE.Vector3(x, groundAt(x, z) + h, z));
  group.add(buildBunting(pts));

  scene.add(group);
  return { group, colliders };
}

