/**
 * concierge-parlour.js — Ace's Concierge Parlour (§2.14)
 *
 * The building stands for Ace, an AI booking concierge that lives inside
 * WhatsApp: it understands a request, checks availability and confirms the
 * booking, all in a chat. So it's an elegant emerald-and-cream octagonal
 * pavilion under a verdigris copper dome, with striped awnings, glass
 * double doors, a red carpet to the street and a concierge's stand with a
 * brass bell. A booking board outside shows free (green) and taken (red)
 * slots; every few seconds one flips to taken. On the cupola a lantern
 * shaped like a chat bubble shows "typing" dots, then a tick, then the ace
 * of spades. Pigeons sit on the dome; one flies off on an errand and back.
 *
 * Built in its own frame: ground at y = 0, the doors at +z (the "front",
 * towards the High Street). ~12 draw calls.
 */
import * as THREE from 'three';
import { mergeBufferGeometries } from 'https://cdn.jsdelivr.net/npm/three@0.150.0/examples/jsm/utils/BufferGeometryUtils.js';
import { standardMat } from './materials.js';
import { propMaterials } from './town-props.js';
import { plasterTexture } from './textures.js';
import { boundInstances } from './merge-static.js';

const R = 2.95;                     // body circumradius (octagon)
const AP = R * Math.cos(Math.PI / 8);   // apothem: distance to a face
const H = 5.0;                      // body height (two storeys)
const DOME = { r: 2.75, h: 2.3 };
const OCT = Math.PI / 8;
/** The booking board stands in the garden on the river side, turned towards the town (and the camera). */
export const BOARD = { x: -1.6, z: -4.0, ry: -2.0 };

const box = (w, h, d, x, y, z) => { const b = new THREE.BoxGeometry(w, h, d); b.translate(x, y, z); return b; };
const ni = (g) => (g.index ? g.toNonIndexed() : g);
/** Put a piece built facing +z onto face `f` (0 = front) of the octagon, `out` from the centre. */
const onFace = (geo, f, out) => { geo.translate(0, 0, out); geo.rotateY(f * Math.PI / 4); return geo; };

function stripeTexture() {
  const cv = document.createElement('canvas');
  cv.width = 128; cv.height = 16;
  const c = cv.getContext('2d');
  for (let i = 0; i < 8; i++) { c.fillStyle = i % 2 ? '#f3ead2' : '#1f7a55'; c.fillRect(i * 16, 0, 16, 16); }
  return new THREE.CanvasTexture(cv);
}

// The chat-bubble lantern: a canvas we redraw as the "conversation" moves on
function bubbleCanvas() { const cv = document.createElement('canvas'); cv.width = 256; cv.height = 192; return cv; }
function drawBubble(cv, state, t) {
  const c = cv.getContext('2d');
  c.clearRect(0, 0, 256, 192);
  // bubble with a tail, WhatsApp-ish green
  c.fillStyle = '#dcf8c6'; c.strokeStyle = '#1f7a55'; c.lineWidth = 8;
  c.beginPath();
  c.moveTo(40, 20); c.lineTo(216, 20); c.quadraticCurveTo(240, 20, 240, 44); c.lineTo(240, 124);
  c.quadraticCurveTo(240, 148, 216, 148); c.lineTo(96, 148); c.lineTo(52, 182); c.lineTo(62, 148); c.lineTo(40, 148);
  c.quadraticCurveTo(16, 148, 16, 124); c.lineTo(16, 44); c.quadraticCurveTo(16, 20, 40, 20);
  c.closePath(); c.fill(); c.stroke();
  if (state === 'typing') {
    for (let i = 0; i < 3; i++) {
      const k = 0.5 + 0.5 * Math.sin(t * 7 - i * 0.9);
      c.fillStyle = `rgba(31,90,70,${0.35 + 0.65 * k})`;
      c.beginPath(); c.arc(84 + i * 44, 84 - k * 8, 15, 0, Math.PI * 2); c.fill();
    }
  } else if (state === 'tick') {
    c.strokeStyle = '#34b7f1'; c.lineWidth = 14; c.lineCap = 'round'; c.lineJoin = 'round';
    c.beginPath(); c.moveTo(70, 86); c.lineTo(104, 118); c.lineTo(150, 58); c.stroke();
    c.beginPath(); c.moveTo(118, 112); c.lineTo(124, 118); c.lineTo(186, 58); c.stroke();
  } else {
    c.fillStyle = '#1b1b1b'; c.font = 'bold 86px Georgia, serif'; c.textAlign = 'center'; c.textBaseline = 'middle';
    c.fillText('A♠', 128, 88);
  }
}

// A pigeon: body, head, tail and two flapping wings
function buildPigeon() {
  const g = new THREE.Group();
  const grey = standardMat({ color: 0x8c93a0, roughness: 0.9 }, 'pigeon');
  const dark = standardMat({ color: 0x4f5562, roughness: 0.9 }, 'pigeonDark');
  const body = new THREE.SphereGeometry(0.16, 8, 6); body.scale(0.8, 0.75, 1.3);
  const head = new THREE.SphereGeometry(0.08, 8, 6); head.translate(0, 0.12, 0.18);
  const tail = new THREE.BoxGeometry(0.12, 0.03, 0.18); tail.translate(0, 0.02, -0.25);
  g.add(new THREE.Mesh(mergeBufferGeometries([ni(body), ni(head), ni(tail)]), grey));
  const wingGeo = new THREE.BufferGeometry();
  wingGeo.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0.12, 0.34, 0, -0.02, 0, 0, -0.14], 3));
  wingGeo.computeVertexNormals();
  const wl = new THREE.Mesh(wingGeo, standardMat({ color: 0x4f5562, roughness: 0.9, side: THREE.DoubleSide }, 'pigeonWing'));
  const wr = wl.clone(); wr.scale.x = -1;
  wl.position.set(0.08, 0.06, 0); wr.position.set(-0.08, 0.06, 0);
  g.add(wl, wr);
  g.userData.wings = [wl, wr];
  void dark;
  return g;
}

/**
 * @returns {{ group, height, lantern: THREE.Vector3, update(t:number): void }}
 */
export function buildParlour(userData = null, { reducedMotion = false } = {}) {
  const g = new THREE.Group();
  const M = propMaterials();
  const add = (m, cast = true) => { m.castShadow = cast; m.receiveShadow = true; g.add(m); return m; };
  const emerald = standardMat({ map: plasterTexture(), color: 0x3f9a74, roughness: 0.85 }, 'parlourEmerald');
  const cream = standardMat({ color: 0xf1e6cc, roughness: 0.8 }, 'parlourCream');
  const glowWin = standardMat({ color: 0xe8b56a, emissive: 0xffa94a, emissiveIntensity: 0.5, roughness: 0.5 }, 'parlourWindow');

  // ── Body: octagonal drum, cream plinth / cornices / corner pilasters ──
  {
    const body = new THREE.CylinderGeometry(R, R, H, 8); body.rotateY(OCT); body.translate(0, H / 2, 0);
    const uv = body.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * 8, uv.getY(i) * 2.5);
    const m = add(new THREE.Mesh(body, emerald));
    if (userData) m.userData = userData;
    const trim = [];
    for (const [y, h, r] of [[0.2, 0.4, R + 0.18], [2.55, 0.18, R + 0.1], [H - 0.1, 0.3, R + 0.22]]) {
      const c = new THREE.CylinderGeometry(r, r, h, 8); c.rotateY(OCT); c.translate(0, y, 0); trim.push(ni(c));
    }
    for (let i = 0; i < 8; i++) {                     // pilasters on the corners
      const a = i * Math.PI / 4 + OCT;                // the corners, between the faces
      const p = box(0.32, H - 0.4, 0.32, 0, H / 2, 0); p.rotateY(a); p.translate(Math.sin(a) * (R - 0.02), 0, Math.cos(a) * (R - 0.02));
      trim.push(ni(p));
    }
    add(new THREE.Mesh(mergeBufferGeometries(trim), cream));
  }

  // ── Windows (arched, two storeys) and the glass double doors ──
  {
    const wins = [], frames = [];
    for (let f = 0; f < 8; f++) {
      for (const [y, h] of [[1.35, 1.5], [3.6, 1.3]]) {
        if (f === 0 && y < 2) continue;                   // the doors go here
        const w = 0.82;
        const pane = new THREE.PlaneGeometry(w, h); pane.translate(0, y, 0);
        const arch = new THREE.CircleGeometry(w / 2, 10, 0, Math.PI); arch.translate(0, y + h / 2, 0);
        wins.push(onFace(ni(pane), f, AP + 0.02), onFace(ni(arch), f, AP + 0.02));
        frames.push(onFace(ni(box(w + 0.2, 0.1, 0.12, 0, y - h / 2 - 0.05, 0)), f, AP + 0.03));   // sill
        frames.push(onFace(ni(box(0.06, h + w / 2, 0.06, 0, y + w / 4, 0)), f, AP + 0.05));       // mullion
        frames.push(onFace(ni(box(w, 0.06, 0.06, 0, y + h * 0.15, 0)), f, AP + 0.05));            // transom
      }
    }
    // doors: a tall glass pair with a fanlight
    const door = new THREE.PlaneGeometry(1.5, 2.3); door.translate(0, 1.15, 0);
    const fan = new THREE.CircleGeometry(0.75, 12, 0, Math.PI); fan.translate(0, 2.3, 0);
    wins.push(onFace(ni(door), 0, AP + 0.03), onFace(ni(fan), 0, AP + 0.03));
    frames.push(onFace(ni(box(0.08, 2.3, 0.1, 0, 1.15, 0)), 0, AP + 0.05));   // the meeting stiles
    frames.push(onFace(ni(box(1.7, 0.1, 0.12, 0, 2.32, 0)), 0, AP + 0.05));
    add(new THREE.Mesh(mergeBufferGeometries(wins), glowWin), false);
    add(new THREE.Mesh(mergeBufferGeometries(frames), cream));
  }

  // ── Striped awnings over the ground floor (doors and four faces) ──
  {
    const tex = stripeTexture(); tex.wrapS = THREE.RepeatWrapping;
    const parts = [];
    for (const f of [0, 1, 7, 3, 5]) {
      const w = f === 0 ? 2.2 : 1.5;
      const a = new THREE.PlaneGeometry(w, 0.9); a.rotateX(-Math.PI / 2 + 0.6); a.translate(0, f === 0 ? 2.85 : 2.4, 0.34);
      parts.push(onFace(ni(a), f, AP));
    }
    const awn = new THREE.Mesh(mergeBufferGeometries(parts), new THREE.MeshStandardMaterial({ map: tex, side: THREE.DoubleSide, roughness: 0.85 }));
    awn.castShadow = true;
    g.add(awn);
  }

  // ── Dome (verdigris copper, ribbed), cupola and the bubble lantern ──
  const verdigris = standardMat({ color: 0x6fb59a, metalness: 0.12, roughness: 0.72 }, 'verdigris');
  const domeY = H + 0.15;
  {
    const prof = [];
    for (let i = 0; i <= 12; i++) { const a = (i / 12) * Math.PI / 2; prof.push(new THREE.Vector2(Math.cos(a) * DOME.r + 0.02, Math.sin(a) * DOME.h)); }
    prof.push(new THREE.Vector2(0, DOME.h));
    const dome = new THREE.LatheGeometry(prof, 32); dome.translate(0, domeY, 0);
    add(new THREE.Mesh(dome, verdigris));
    const ribs = [];
    for (let i = 0; i < 8; i++) {
      const pts = [];
      for (let k = 0; k <= 10; k++) { const a = (k / 10) * Math.PI / 2; pts.push(new THREE.Vector3(Math.cos(a) * (DOME.r + 0.05), domeY + Math.sin(a) * (DOME.h + 0.04), 0)); }
      const tube = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 10, 0.045, 4); tube.rotateY(i * Math.PI / 4 + OCT);
      ribs.push(ni(tube));
    }
    // cupola: eight slim posts, a ring and a little cap
    const cupY = domeY + DOME.h - 0.05;
    const ring = new THREE.CylinderGeometry(0.75, 0.8, 0.14, 16); ring.translate(0, cupY + 0.05, 0); ribs.push(ni(ring));
    for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2; const p = box(0.07, 1.55, 0.07, Math.sin(a) * 0.68, cupY + 0.85, Math.cos(a) * 0.68); ribs.push(ni(p)); }
    const capRing = new THREE.CylinderGeometry(0.85, 0.85, 0.12, 16); capRing.translate(0, cupY + 1.66, 0); ribs.push(ni(capRing));
    add(new THREE.Mesh(mergeBufferGeometries(ribs), cream));
    const cap = new THREE.Mesh(new THREE.ConeGeometry(0.85, 0.7, 16), verdigris);
    cap.position.y = cupY + 2.07;
    add(cap);
    const fin = new THREE.Mesh(new THREE.SphereGeometry(0.1, 8, 6), standardMat({ color: 0xc9a25a, metalness: 0.7, roughness: 0.35 }, 'brass'));
    fin.position.y = cupY + 2.5;
    g.add(fin);
  }
  const lanternY = domeY + DOME.h + 0.8;
  const bubbleCv = bubbleCanvas();
  const bubbleTex = new THREE.CanvasTexture(bubbleCv);
  const bubble = new THREE.Mesh(new THREE.PlaneGeometry(1.25, 0.94),
    new THREE.MeshStandardMaterial({ map: bubbleTex, emissiveMap: bubbleTex, emissive: 0xffffff, emissiveIntensity: 0.9, transparent: true, alphaTest: 0.1, side: THREE.DoubleSide, roughness: 0.6 }));
  bubble.position.y = lanternY;
  g.add(bubble);

  // ── Red carpet to the street, concierge's stand with a brass bell ──
  {
    const carpet = new THREE.Mesh(box(1.4, 0.03, 2.6, 0, 0.03, AP + 1.3), standardMat({ color: 0xa3202a, roughness: 0.95 }, 'carpet'));
    carpet.receiveShadow = true;
    g.add(carpet);
    const stand = [box(0.5, 1.0, 0.4, 1.35, 0.5, AP + 0.55), box(0.6, 0.05, 0.5, 1.35, 1.02, AP + 0.55)];
    add(new THREE.Mesh(mergeBufferGeometries(stand), M.woodDoor));
    const bell = new THREE.Mesh(new THREE.SphereGeometry(0.11, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2), standardMat({ color: 0xc9a25a, metalness: 0.7, roughness: 0.35 }, 'brass'));
    bell.position.set(1.35, 1.05, AP + 0.55);
    g.add(bell);
  }

  // ── Booking board: 4 × 3 slots, free or taken, one flips now and then ──
  const COLS = 4, ROWS = 3, FREE = new THREE.Color(0x3ca66b), TAKEN = new THREE.Color(0xc4473a);
  const board = new THREE.Group();
  board.position.set(BOARD.x, 0, BOARD.z);
  board.rotation.y = BOARD.ry;
  {
    const frame = [box(1.5, 1.2, 0.08, 0, 1.45, 0), box(0.07, 1.0, 0.07, -0.6, 0.5, 0), box(0.07, 1.0, 0.07, 0.6, 0.5, 0), box(1.6, 0.12, 0.12, 0, 2.08, 0)];
    const f = new THREE.Mesh(mergeBufferGeometries(frame), M.timber); f.castShadow = true;
    board.add(f);
    const head = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 0.22), new THREE.MeshBasicMaterial({ color: 0xf1e6cc }));
    head.position.set(0, 1.9, 0.05);
    board.add(head);
  }
  const tiles = new THREE.InstancedMesh(new THREE.BoxGeometry(0.28, 0.24, 0.03), new THREE.MeshStandardMaterial({ roughness: 0.6 }), COLS * ROWS);
  const taken = [];
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), X = new THREE.Vector3(1, 0, 0), one = new THREE.Vector3(1, 1, 1);
  const tilePos = (i) => new THREE.Vector3(-0.51 + (i % COLS) * 0.34, 1.68 - Math.floor(i / COLS) * 0.32, 0.06);
  const setTile = (i, angle, isTaken) => {
    m4.compose(tilePos(i), q.setFromAxisAngle(X, angle), one);
    tiles.setMatrixAt(i, m4);
    tiles.setColorAt(i, isTaken ? TAKEN : FREE);
  };
  const seedTaken = [1, 4, 6, 11];
  for (let i = 0; i < COLS * ROWS; i++) { taken[i] = seedTaken.includes(i); setTile(i, 0, taken[i]); }
  tiles.instanceMatrix.needsUpdate = true; tiles.instanceColor.needsUpdate = true;
  board.add(boundInstances(tiles, { pad: 0.2 }));     // tiles flip in place
  g.add(board);

  // ── Pigeons: two perched on the dome, one that flies an errand ──
  const pigeons = [0, 1, 2].map(() => buildPigeon());
  const perch = (i) => {
    const a = [0.6, 2.4, -1.1][i], k = [0.45, 0.6, 0.35][i];
    const r = Math.cos(k * Math.PI / 2) * DOME.r, y = domeY + Math.sin(k * Math.PI / 2) * DOME.h;
    return { p: new THREE.Vector3(Math.sin(a) * r, y + 0.1, Math.cos(a) * r), yaw: a };
  };
  pigeons.forEach((pg, i) => { const s = perch(i); pg.position.copy(s.p); pg.rotation.y = s.yaw; g.add(pg); });

  // ── Animation ─────────────────────────────────────────────────
  let lastState = '', lastDraw = -1, flipIdx = -1, flipStart = 0, lastFlipN = -1;
  const update = (t) => {
    // the chat: typing … → tick → ace, every 6 s
    const ph = t % 6;
    const state = ph < 2.8 ? 'typing' : ph < 4.4 ? 'tick' : 'ace';
    if (state !== lastState || (state === 'typing' && t - lastDraw > 0.08)) {
      drawBubble(bubbleCv, state, t); bubbleTex.needsUpdate = true; lastState = state; lastDraw = t;
    }
    if (!reducedMotion) bubble.rotation.y = Math.sin(t * 0.35) * 1.2;   // turns slowly to face the town
    // a booking tile flips to taken every 3.5 s (all taken → board resets)
    const n = Math.floor(t / 3.5);
    if (n !== lastFlipN) {
      lastFlipN = n;
      if (flipIdx >= 0) { setTile(flipIdx, 0, true); taken[flipIdx] = true; flipIdx = -1; }
      const free = taken.map((v, i) => (v ? -1 : i)).filter(i => i >= 0);
      if (!free.length) { for (let i = 0; i < taken.length; i++) { taken[i] = seedTaken.includes(i); setTile(i, 0, taken[i]); } }
      else { flipIdx = free[(n * 7) % free.length]; flipStart = t; }
      tiles.instanceColor.needsUpdate = true; tiles.instanceMatrix.needsUpdate = true;
    }
    if (flipIdx >= 0) {
      const u = Math.min(1, (t - flipStart) / 0.5);
      setTile(flipIdx, u * Math.PI, u > 0.5);
      tiles.instanceMatrix.needsUpdate = true; tiles.instanceColor.needsUpdate = true;
    }
    // the errand pigeon: perched 7 s, flies a loop for 5 s
    const pg = pigeons[2], home = perch(2), fp = t % 12;
    if (reducedMotion || fp < 7) {
      pg.position.copy(home.p); pg.rotation.set(0, home.yaw, 0);
      for (const w of pg.userData.wings) w.rotation.z = 0;
    } else {
      const u = (fp - 7) / 5, a = home.yaw + u * Math.PI * 2;
      const lift = Math.sin(u * Math.PI);
      const rr = THREE.MathUtils.lerp(home.p.length(), 6.5, lift);
      pg.position.set(Math.sin(a) * rr, home.p.y + lift * 2.5, Math.cos(a) * rr);
      pg.rotation.set(0, a + Math.PI / 2, -0.35);
      const flap = Math.sin(t * 22) * 0.7;
      pg.userData.wings[0].rotation.z = flap; pg.userData.wings[1].rotation.z = -flap;
    }
    // the perched pair bob now and then
    for (let i = 0; i < 2; i++) pigeons[i].rotation.x = Math.max(0, Math.sin(t * 1.3 + i * 2)) * 0.35;
  };
  update(0);

  return { group: g, height: domeY + DOME.h + 2.6, lantern: new THREE.Vector3(0, lanternY, 0), update };
}
