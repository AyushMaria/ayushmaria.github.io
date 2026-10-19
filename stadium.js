/**
 * stadium.js — the Prediction Colosseum as a small football stadium
 *
 * The building stands for Expected Goals (xG): how likely each shot was to
 * become a goal, shown as shot maps. So it's a little oval ground: three
 * tiers of stands round a striped pitch, a shot map painted near one goal
 * (dots sized by xG), a timber scoreboard over the gate, four floodlight
 * pylons and pennants round the rim. Every few seconds a ball rolls from
 * the penalty spot into the net and the home side's xG ticks up.
 *
 * Built in its own frame: centred on the origin, long axis along x, the gate
 * at +z (the building's "front", facing Arena Lane). ~14 draw calls.
 */
import * as THREE from 'three';
import { mergeBufferGeometries } from 'https://cdn.jsdelivr.net/npm/three@0.150.0/examples/jsm/utils/BufferGeometryUtils.js';
import { standardMat } from './materials.js';
import { propMaterials } from './town-props.js';

const BASE_PITCH = { w: 7.4, d: 4.4 };            // playing area (x, z) at scale 1
const BASE_TIERS = [                                   // [inner rx, inner rz, outer rx, outer rz, top]
  [4.75, 3.35, 5.35, 3.9, 0.55],
  [5.35, 3.9, 5.95, 4.45, 1.05],
  [5.95, 4.45, 6.5, 5.0, 1.55],
];
const BASE_WALL = { rx: 6.7, rz: 5.2, t: 0.35, h: 2.4 };
const BASE_SEGS = 44;
/** Footprint (x, z) of the stadium at a given scale — what town-layout.js needs. */
export const stadiumFootprint = (scale = 1) => ({ w: 2 * (BASE_WALL.rx * scale + 0.2), d: 2 * (BASE_WALL.rz * scale + 0.2) });

// Pitch texture: mowing stripes, white lines, and the xG shot map by the right-hand goal
function pitchTexture(PITCH) {
  const W = 1024, H = Math.round(W * PITCH.d / PITCH.w);
  const cv = document.createElement('canvas');
  cv.width = W; cv.height = H;
  const c = cv.getContext('2d');
  const k = W / PITCH.w;                          // px per unit
  for (let i = 0; i < 12; i++) {
    c.fillStyle = i % 2 ? '#3f8a4c' : '#4a9a57';
    c.fillRect((i * W) / 12, 0, W / 12 + 1, H);
  }
  const m = 0.25 * k;                             // margin to the touchlines
  c.strokeStyle = '#f4f6f0'; c.lineWidth = 0.06 * k;
  c.strokeRect(m, m, W - 2 * m, H - 2 * m);
  c.beginPath(); c.moveTo(W / 2, m); c.lineTo(W / 2, H - m); c.stroke();
  c.beginPath(); c.arc(W / 2, H / 2, 0.6 * k, 0, Math.PI * 2); c.stroke();
  for (const side of [-1, 1]) {
    const x0 = side < 0 ? m : W - m;
    const boxD = 1.1 * k, boxW = 2.2 * k, sixD = 0.4 * k, sixW = 1.0 * k;
    c.strokeRect(side < 0 ? x0 : x0 - boxD, H / 2 - boxW / 2, boxD, boxW);
    c.strokeRect(side < 0 ? x0 : x0 - sixD, H / 2 - sixW / 2, sixD, sixW);
    c.beginPath(); c.arc(x0 - side * 0.75 * k, H / 2, 0.04 * k, 0, Math.PI * 2); c.fillStyle = '#f4f6f0'; c.fill();
  }
  // shot map (attacking the right-hand goal): circle area ∝ xG, filled = goal
  const goalX = W - m;
  const shots = [
    [0.35, 0.05, 0.62, true], [0.55, -0.25, 0.31, false], [0.75, 0.35, 0.18, false],
    [1.0, -0.1, 0.12, true], [1.3, 0.6, 0.06, false], [1.6, -0.5, 0.04, false],
    [0.9, 0.85, 0.05, false], [0.5, 0.55, 0.22, false], [1.9, 0.15, 0.03, false],
  ];
  for (const [dx, dz, xg, goal] of shots) {
    const r = (0.07 + Math.sqrt(xg) * 0.28) * k;
    c.beginPath(); c.arc(goalX - dx * k, H / 2 + dz * k, r, 0, Math.PI * 2);
    c.fillStyle = goal ? 'rgba(255, 210, 90, 0.95)' : 'rgba(255, 255, 255, 0.28)';
    c.fill();
    c.lineWidth = 0.025 * k; c.strokeStyle = goal ? '#7a5a10' : 'rgba(255,255,255,0.9)'; c.stroke();
  }
  const tex = new THREE.CanvasTexture(cv);
  tex.anisotropy = 4;
  return tex;
}

// Scoreboard: a canvas we redraw when the numbers change
function scoreboard() {
  const cv = document.createElement('canvas');
  cv.width = 512; cv.height = 192;
  const c = cv.getContext('2d');
  const tex = new THREE.CanvasTexture(cv);
  const draw = (home, away) => {
    c.fillStyle = '#17202b'; c.fillRect(0, 0, 512, 192);
    c.strokeStyle = '#c9a24a'; c.lineWidth = 8; c.strokeRect(6, 6, 500, 180);
    c.fillStyle = '#ffd27a'; c.font = 'bold 40px Georgia, serif'; c.textAlign = 'center';
    c.fillText('xG', 256, 62);
    c.fillStyle = '#ffffff'; c.font = 'bold 74px Georgia, serif';
    c.fillText(`${home.toFixed(2)} – ${away.toFixed(2)}`, 256, 150);
    tex.needsUpdate = true;
  };
  return { tex, draw };
}

function netTexture() {
  const cv = document.createElement('canvas');
  cv.width = cv.height = 64;
  const c = cv.getContext('2d');
  c.strokeStyle = '#fff'; c.lineWidth = 3;
  for (let k = 0; k <= 64; k += 16) { c.beginPath(); c.moveTo(k, 0); c.lineTo(k, 64); c.stroke(); c.beginPath(); c.moveTo(0, k); c.lineTo(64, k); c.stroke(); }
  const tex = new THREE.CanvasTexture(cv);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

/**
 * @param {object|null} userData  copied onto every mesh (click → open the project)
 * @param {{ reducedMotion?: boolean }} [opts]
 * @returns {{ group: THREE.Group, update(t:number, dt:number):void, light: THREE.Vector3, height: number }}
 */
export function buildStadium(userData = null, { reducedMotion = false, scale = 1 } = {}) {
  // Plan sizes grow with `scale`; heights grow more gently and people,
  // goals and the gate stay life-size.
  const S = scale;
  const PITCH = { w: BASE_PITCH.w * S, d: BASE_PITCH.d * S };
  const TIERS = BASE_TIERS.map(([a, b, c, d, top]) => [a * S, b * S, c * S, d * S, top * (1 + (S - 1) * 0.6)]);
  const WALL = { ...BASE_WALL, rx: BASE_WALL.rx * S, rz: BASE_WALL.rz * S, h: BASE_WALL.h * (1 + (S - 1) * 0.5) };
  const SEGS = Math.round(BASE_SEGS * S);
  const GATE_HALF = 1.33 / WALL.rx;                // gate gap (radians, either side of +z) ≈ 2.7 units wide
  const g = new THREE.Group();
  const M = propMaterials();
  const tag = (m) => { if (userData) m.userData = { ...userData }; return m; };
  const add = (mesh, cast = true) => { mesh.castShadow = cast; mesh.receiveShadow = true; g.add(tag(mesh)); return mesh; };
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), p = new THREE.Vector3(), s = new THREE.Vector3();
  const Y = new THREE.Vector3(0, 1, 0);
  const inGate = (a) => Math.abs(Math.atan2(Math.sin(a - Math.PI / 2), Math.cos(a - Math.PI / 2))) < GATE_HALF;

  // ── Ground: grass apron + the pitch ───────────────────────────
  const apron = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 0.12, 48), standardMat({ color: 0x5f7d4a, roughness: 1 }));
  apron.scale.set(WALL.rx + 0.2, 1, WALL.rz + 0.2);
  apron.position.y = 0.06;
  add(apron, false);
  const pitch = new THREE.Mesh(new THREE.PlaneGeometry(PITCH.w, PITCH.d), new THREE.MeshStandardMaterial({ map: pitchTexture(BASE_PITCH), roughness: 0.95 }));   // texture drawn at base size, stretched
  pitch.rotation.x = -Math.PI / 2;
  pitch.position.y = 0.13;
  add(pitch, false);

  // ── Stands: three stepped tiers of short segments round an ellipse ──
  const seat = [standardMat({ color: 0xc8b48e, roughness: 0.9 }), standardMat({ color: 0xa8956f, roughness: 0.9 }), standardMat({ color: 0xc8b48e, roughness: 0.9 })];
  const tierBox = new THREE.BoxGeometry(1, 1, 1);
  const spectators = [];
  TIERS.forEach(([irx, irz, orx, orz, top], ti) => {
    const im = new THREE.InstancedMesh(tierBox, seat[ti], SEGS);
    let n = 0;
    for (let i = 0; i < SEGS; i++) {
      const a = ((i + 0.5) / SEGS) * Math.PI * 2;
      if (inGate(a)) continue;
      const mrx = (irx + orx) / 2, mrz = (irz + orz) / 2;
      const x = Math.cos(a) * mrx, z = Math.sin(a) * mrz;
      // tangent of the ellipse at a, and the segment length between neighbours
      const tx = -Math.sin(a) * mrx, tz = Math.cos(a) * mrz;
      const len = Math.hypot(tx, tz) * (Math.PI * 2 / SEGS) + 0.06;
      const depth = Math.hypot((orx - irx) * Math.cos(a), (orz - irz) * Math.sin(a)) + 0.05;
      q.setFromAxisAngle(Y, Math.atan2(-tz, tx));
      m4.compose(p.set(x, top / 2 + 0.1, z), q, s.set(len, top, depth));
      im.setMatrixAt(n++, m4);
      // a few spectators on this tier
      if ((i * 7 + ti * 3) % 3 !== 0) spectators.push([x, top + 0.1, z, a, ti, i]);
    }
    im.count = n;
    im.instanceMatrix.needsUpdate = true;
    add(im);
  });

  // outer wall with arches (an emissive-free stone band) and its crenel-like rim
  {
    const wallTex = (() => {
      const cv = document.createElement('canvas'); cv.width = 256; cv.height = 128;
      const c = cv.getContext('2d');
      c.fillStyle = '#cbbd9f'; c.fillRect(0, 0, 256, 128);
      c.fillStyle = '#5c4a38';
      // one arch per wall segment (each segment maps the whole texture)
      c.beginPath(); c.moveTo(78, 128); c.lineTo(78, 64); c.arc(128, 64, 50, Math.PI, 0); c.lineTo(178, 128); c.fill();
      c.fillStyle = '#b3a483'; c.fillRect(0, 0, 256, 14);
      const t = new THREE.CanvasTexture(cv); t.wrapS = THREE.RepeatWrapping; return t;
    })();
    const wallMat = new THREE.MeshStandardMaterial({ map: wallTex, roughness: 0.95 });
    const im = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), wallMat, SEGS);
    let n = 0;
    for (let i = 0; i < SEGS; i++) {
      const a = ((i + 0.5) / SEGS) * Math.PI * 2;
      if (inGate(a)) continue;
      const x = Math.cos(a) * WALL.rx, z = Math.sin(a) * WALL.rz;
      const tx = -Math.sin(a) * WALL.rx, tz = Math.cos(a) * WALL.rz;
      const len = Math.hypot(tx, tz) * (Math.PI * 2 / SEGS) + 0.06;
      q.setFromAxisAngle(Y, Math.atan2(-tz, tx));
      m4.compose(p.set(x, WALL.h / 2, z), q, s.set(len, WALL.h, WALL.t));
      im.setMatrixAt(n++, m4);
    }
    im.count = n;
    add(im);
  }

  // ── Spectators: little instanced figures in two team colours ──
  {
    const body = new THREE.CylinderGeometry(0.11, 0.14, 0.42, 6);
    body.translate(0, 0.21, 0);
    const head = new THREE.SphereGeometry(0.1, 6, 5);
    head.translate(0, 0.52, 0);
    const geo = mergeBufferGeometries([body.toNonIndexed(), head.toNonIndexed()], false);
    const im = new THREE.InstancedMesh(geo, standardMat({ color: 0xffffff, roughness: 0.8 }), spectators.length);
    const col = new THREE.Color();
    const kits = [0xd8462f, 0x2f6c9f, 0xf2c230, 0xe9e4da];
    spectators.forEach(([x, y, z, a, ti, i], k) => {
      m4.compose(p.set(x * 1.0, y, z * 1.0), q.setFromAxisAngle(Y, -a - Math.PI / 2), s.set(1, 1, 1));
      im.setMatrixAt(k, m4);
      im.setColorAt(k, col.setHex(kits[(i + ti * 2) % 4]));
    });
    im.instanceMatrix.needsUpdate = true;
    if (im.instanceColor) im.instanceColor.needsUpdate = true;
    add(im, false);
  }

  // ── Goals: white frames + nets at each end ─────────────────────
  {
    const parts = [], gw = 1.1, gh = 0.5, gd = 0.45, r = 0.035;
    for (const side of [-1, 1]) {
      const x = side * (PITCH.w / 2 - 0.25);
      const bar = (sx, sy, sz, px, py, pz) => { const b = new THREE.BoxGeometry(sx, sy, sz); b.translate(px, py, pz); parts.push(b); };
      bar(r * 2, gh, r * 2, x, 0.13 + gh / 2, -gw / 2); bar(r * 2, gh, r * 2, x, 0.13 + gh / 2, gw / 2);
      bar(r * 2, r * 2, gw, x, 0.13 + gh, 0);
      bar(gd, r * 1.4, r * 1.4, x + side * gd / 2, 0.13 + gh, -gw / 2); bar(gd, r * 1.4, r * 1.4, x + side * gd / 2, 0.13 + gh, gw / 2);
    }
    add(new THREE.Mesh(mergeBufferGeometries(parts, false), standardMat({ color: 0xf6f6f2, roughness: 0.5 })));
    const netTex = netTexture(); netTex.repeat.set(10, 5);
    const netMat = new THREE.MeshStandardMaterial({ map: netTex, alphaMap: netTex, alphaTest: 0.4, color: 0xffffff, side: THREE.DoubleSide, roughness: 0.9 });
    for (const side of [-1, 1]) {
      const net = new THREE.Mesh(new THREE.PlaneGeometry(gw, gh), netMat);
      net.rotation.y = Math.PI / 2;
      net.position.set(side * (PITCH.w / 2 - 0.25 + 0.45), 0.13 + gh / 2, 0);
      add(net, false);
    }
  }

  // ── Gate arch + scoreboard over it ────────────────────────────
  const gz = WALL.rz;                              // gate at the front (+z)
  {
    const stone = propMaterials().stoneDark;
    for (const sx of [-1, 1]) {
      const pier = new THREE.Mesh(new THREE.BoxGeometry(0.6, 3.0, 0.8), stone);
      pier.position.set(sx * 1.25, 1.5, gz);
      add(pier);
    }
    const lintel = new THREE.Mesh(new THREE.BoxGeometry(3.1, 0.5, 0.8), stone);
    lintel.position.set(0, 3.0, gz);
    add(lintel);
    const posts = mergeBufferGeometries([-1, 1].map(sx => { const b = new THREE.BoxGeometry(0.16, 2.0, 0.16); b.translate(sx * 1.2, 4.25, gz - 0.1); return b; }), false);
    add(new THREE.Mesh(posts, standardMat({ color: 0x5c3a1e, roughness: 0.9 })));
  }
  const board = scoreboard();
  let xgHome = 2.31, xgAway = 0.87;
  board.draw(xgHome, xgAway);
  const boardMat = new THREE.MeshStandardMaterial({ map: board.tex, emissive: 0xffffff, emissiveMap: board.tex, emissiveIntensity: 0.55, roughness: 0.6 });
  const boardMesh = new THREE.Mesh(new THREE.BoxGeometry(2.9, 1.1, 0.12), [
    standardMat({ color: 0x2b2017 }), standardMat({ color: 0x2b2017 }), standardMat({ color: 0x2b2017 }), standardMat({ color: 0x2b2017 }), boardMat, boardMat]);
  boardMesh.position.set(0, 4.75, gz - 0.1);
  add(boardMesh);

  // ── Floodlight pylons at the four corners ─────────────────────
  const PH = 7.2 * (1 + (S - 1) * 0.5);
  const corners = [[-1, -1], [1, -1], [-1, 1], [1, 1]].map(([sx, sz]) => [sx * (WALL.rx - 0.2) * 0.86, sz * (WALL.rz - 0.2) * 0.86]);
  {
    const iron = new THREE.Mesh(mergeBufferGeometries(corners.flatMap(([x, z]) => {
      const legs = [];
      for (const [dx, dz] of [[-0.18, -0.18], [0.18, -0.18], [-0.18, 0.18], [0.18, 0.18]]) {
        const b = new THREE.CylinderGeometry(0.04, 0.06, PH, 5);
        b.translate(x + dx, PH / 2, z + dz);
        legs.push(b.toNonIndexed());
      }
      return legs;
    }), false), standardMat({ color: 0x4a4f57, roughness: 0.5, metalness: 0.5 }));
    add(iron);
    const lampMat = new THREE.MeshStandardMaterial({ color: 0xf4f6ff, emissive: 0xf4f6ff, emissiveIntensity: 1.3 });
    const heads = new THREE.InstancedMesh(new THREE.BoxGeometry(1.1, 0.5, 0.18), lampMat, 4);
    corners.forEach(([x, z], i) => {
      m4.compose(p.set(x, PH + 0.1, z), q.setFromEuler(new THREE.Euler(-0.45, Math.atan2(-x, -z), 0, 'YXZ')), s.set(1, 1, 1));
      heads.setMatrixAt(i, m4);
    });
    add(heads, false);
  }

  // ── Pennants round the rim ────────────────────────────────────
  const pennants = new THREE.Group();
  {
    const flagGeo = new THREE.BufferGeometry();
    flagGeo.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, 0.55, -0.12, 0, 0, -0.26, 0], 3));
    flagGeo.computeVertexNormals();
    const poleGeo = new THREE.CylinderGeometry(0.025, 0.025, 0.8, 4);
    const flagMats = [standardMat({ color: 0xf2c230, side: THREE.DoubleSide }), standardMat({ color: 0xd8462f, side: THREE.DoubleSide })];
    const poleMat = standardMat({ color: 0x3a2a1e });
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2 + 0.13;
      if (inGate(a)) continue;
      const pv = new THREE.Group();
      pv.position.set(Math.cos(a) * WALL.rx, WALL.h, Math.sin(a) * WALL.rz);
      const pole = new THREE.Mesh(poleGeo, poleMat); pole.position.y = 0.4; pv.add(tag(pole));
      const flag = new THREE.Mesh(flagGeo, flagMats[i % 2]); flag.position.y = 0.78; flag.userData.flag = true; pv.add(tag(flag));
      pv.userData.phase = i * 1.3;
      pennants.add(pv);
    }
    g.add(pennants);
  }

  // ── The ball: rolls from the penalty spot into the net now and then ──
  const ball = new THREE.Mesh(new THREE.SphereGeometry(0.11, 12, 10), standardMat({ color: 0xffffff, roughness: 0.5 }));
  ball.castShadow = true;
  g.add(tag(ball));
  const spot = new THREE.Vector3(PITCH.w / 2 - 1.0, 0.24, 0.0), goalIn = new THREE.Vector3(PITCH.w / 2 + 0.05, 0.3, 0.18);
  ball.position.copy(spot);
  let cycle = 0, scored = false;

  return {
    group: g,
    height: PH + 0.4,
    light: new THREE.Vector3(0, PH - 1, 0),
    update(t, dt) {
      // pennants flutter
      if (!reducedMotion) for (const pv of pennants.children) {
        const f = pv.children[1];
        f.rotation.y = Math.sin(t * 2.2 + pv.userData.phase) * 0.35 + Math.PI * 0.15;
      }
      // a shot every 9 s: roll 1.2 s into the net, sit, reset
      cycle = (cycle + (dt || 0)) % 9;
      if (reducedMotion) { ball.position.copy(spot); return; }
      if (cycle < 1.2) {
        const k = cycle / 1.2, e = 1 - (1 - k) * (1 - k);
        ball.position.lerpVectors(spot, goalIn, e);
        ball.position.y = spot.y + Math.sin(k * Math.PI) * 0.35;
        ball.rotation.z -= (dt || 0) * 12;
        scored = false;
      } else if (cycle < 5) {
        ball.position.copy(goalIn);
        if (!scored) {
          scored = true;
          xgHome = Math.round((xgHome + 0.12 + Math.random() * 0.45) * 100) / 100;
          if (Math.random() < 0.3) xgAway = Math.round((xgAway + 0.05 + Math.random() * 0.2) * 100) / 100;
          if (xgHome > 9) { xgHome = 0.4; xgAway = 0.1; }
          board.draw(xgHome, xgAway);
        }
      } else ball.position.copy(spot);
    },
  };
}
