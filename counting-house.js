/**
 * counting-house.js — the Tally Bridge Counting House (§2.14)
 *
 * The building stands for Tally Bridge: it parses Tally ERP's XML exports,
 * syncs the ledgers and serves them through a clean API — old accounting
 * software bridged to new systems. So it's two buildings joined by a
 * covered skybridge on an arcade of two arches:
 *
 *   - the vault house (the legacy system, local x < 0): heavy rusticated
 *     stone, a round vault door with a brass wheel, ledgers stacked in its
 *     barred windows and a gilded "TALLY" board over the door;
 *   - the counting room (the modern API, local x > 0): a bright cream frame
 *     with tall gold-lit glass, steps up to the door and a brass balance
 *     scale on them.
 *
 * Scrolls (the XML) ride a line along the skybridge from the vault to the
 * counting room, and small letters come back the other way. The counting
 * room glows brighter than the vault.
 *
 * Frame: the whole building's centre at the origin, ground at y = 0, the
 * front (+z) facing the High Street. ~12 draw calls.
 */
import * as THREE from 'three';
import { mergeBufferGeometries } from 'https://cdn.jsdelivr.net/npm/three@0.150.0/examples/jsm/utils/BufferGeometryUtils.js';
import { standardMat } from './materials.js';
import { propMaterials } from './town-props.js';
import { stoneTexture } from './textures.js';

const VAULT = { cx: -3.55, w: 3.7, d: 4.4, h: 4.3 };
const ROOM = { cx: 3.5, w: 3.8, d: 4.2, h: 5.0 };
const BRIDGE = { x0: VAULT.cx + VAULT.w / 2, x1: ROOM.cx - ROOM.w / 2, y0: 2.55, h: 1.35, d: 1.4 };
const LINE = { y: BRIDGE.y0 + BRIDGE.h + 0.55, z: BRIDGE.d / 2 + 0.25 };   // the cable along the bridge, in front

const box = (w, h, d, x, y, z) => { const b = new THREE.BoxGeometry(w, h, d); b.translate(x, y, z); return b; };
const ni = (g) => (g.index ? g.toNonIndexed() : g);
const tile = (g, sx, sy) => { const uv = g.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * sx, uv.getY(i) * sy); return g; };

function goldBoard(text) {
  const cv = document.createElement('canvas');
  cv.width = 256; cv.height = 64;
  const c = cv.getContext('2d');
  c.fillStyle = '#20160e'; c.fillRect(0, 0, 256, 64);
  c.strokeStyle = '#c9a25a'; c.lineWidth = 4; c.strokeRect(4, 4, 248, 56);
  const g = c.createLinearGradient(0, 12, 0, 54); g.addColorStop(0, '#fff0b0'); g.addColorStop(1, '#c08a2a');
  c.fillStyle = g; c.font = 'bold 40px Georgia, serif'; c.textAlign = 'center'; c.textBaseline = 'middle';
  c.fillText(text, 128, 35);
  return new THREE.CanvasTexture(cv);
}

// Book spines stacked behind the vault's barred windows
function ledgerTexture() {
  const cv = document.createElement('canvas');
  cv.width = 64; cv.height = 96;
  const c = cv.getContext('2d');
  c.fillStyle = '#2a1c10'; c.fillRect(0, 0, 64, 96);
  const cols = ['#7a2a1e', '#3b4f2a', '#2c3e5c', '#6b4a1e', '#5a1e3a'];
  for (const y0 of [8, 52]) {
    let x = 4;
    while (x < 60) { const w = 6 + ((x * 7) % 5); c.fillStyle = cols[(x + y0) % cols.length]; c.fillRect(x, y0 + ((x * 3) % 6), w - 1, 36 - ((x * 3) % 6)); c.fillStyle = '#d9b45a'; c.fillRect(x + 1, y0 + 14, w - 3, 2); x += w; }
  }
  return new THREE.CanvasTexture(cv);
}

/** An arcade wall with two round-headed openings (extruded shape). */
function arcade(x0, x1, top, depth) {
  const w = x1 - x0, s = new THREE.Shape();
  s.moveTo(x0, 0); s.lineTo(x1, 0); s.lineTo(x1, top); s.lineTo(x0, top); s.lineTo(x0, 0);
  const open = (cx, hw, spring) => {
    const h = new THREE.Path();
    h.moveTo(cx - hw, 0); h.lineTo(cx - hw, spring); h.absarc(cx, spring, hw, Math.PI, 0, true); h.lineTo(cx + hw, 0); h.lineTo(cx - hw, 0);
    return h;
  };
  const hw = w * 0.19, spring = top - hw - 0.35;
  s.holes.push(open(x0 + w * 0.27, hw, spring), open(x0 + w * 0.73, hw, spring));
  const g = new THREE.ExtrudeGeometry(s, { depth, bevelEnabled: false });
  g.translate(0, 0, -depth / 2);
  return tile(g, 0.8, 0.8);
}

/**
 * @returns {{ group, height, glow: THREE.Vector3, update(t:number): void }}
 */
export function buildCountingHouse(userData = null, { reducedMotion = false } = {}) {
  const g = new THREE.Group();
  const M = propMaterials();
  const add = (m, cast = true) => { m.castShadow = cast; m.receiveShadow = true; g.add(m); return m; };
  const oldStone = standardMat({ map: stoneTexture(), color: 0x9c958a, roughness: 0.95 }, 'vaultStone');
  const cream = standardMat({ color: 0xf2ead6, roughness: 0.75 }, 'roomCream');
  const brass = standardMat({ color: 0xc9a25a, metalness: 0.7, roughness: 0.35 }, 'brass');
  const slate = standardMat({ color: 0x4b5568, roughness: 0.7 }, 'citadelSlate');

  // ── The vault house: rusticated block, hipped slate roof ──────
  {
    const body = tile(box(VAULT.w, VAULT.h, VAULT.d, VAULT.cx, VAULT.h / 2, 0), 2.6, 2.2);
    const m = add(new THREE.Mesh(body, oldStone));
    if (userData) m.userData = userData;
    const trim = [box(VAULT.w + 0.3, 0.45, VAULT.d + 0.3, VAULT.cx, 0.22, 0), box(VAULT.w + 0.3, 0.25, VAULT.d + 0.3, VAULT.cx, VAULT.h - 0.05, 0)];
    for (const sx of [-1, 1]) for (let k = 0; k < 6; k++) trim.push(box(0.28, 0.45, 0.28, VAULT.cx + sx * (VAULT.w / 2), 0.7 + k * 0.62, VAULT.d / 2));   // quoins
    add(new THREE.Mesh(mergeBufferGeometries(trim.map(ni)), M.stoneDark));
    const roof = new THREE.ConeGeometry(Math.hypot(VAULT.w, VAULT.d) / 2 + 0.2, 1.5, 4); roof.rotateY(Math.PI / 4); roof.scale(VAULT.w / VAULT.d, 1, 1);
    roof.translate(VAULT.cx, VAULT.h + 0.75, 0);
    add(new THREE.Mesh(roof, slate));
    // round vault door with a brass wheel, set in a deep stone ring
    const fz = VAULT.d / 2;
    const ring = new THREE.TorusGeometry(0.95, 0.16, 8, 28); ring.translate(VAULT.cx, 1.35, fz + 0.05);
    add(new THREE.Mesh(ring, M.stoneDark));
    const door = new THREE.CylinderGeometry(0.85, 0.85, 0.16, 28); door.rotateX(Math.PI / 2); door.translate(VAULT.cx, 1.35, fz + 0.06);
    add(new THREE.Mesh(door, standardMat({ color: 0x6d737c, metalness: 0.6, roughness: 0.45 }, 'vaultSteel')));
    const wheel = [];
    const rim = new THREE.TorusGeometry(0.42, 0.04, 6, 20); rim.translate(VAULT.cx, 1.35, fz + 0.2); wheel.push(ni(rim));
    for (let i = 0; i < 3; i++) { const sp = box(0.84, 0.05, 0.05, 0, 0, 0); sp.rotateZ(i * Math.PI / 3); sp.translate(VAULT.cx, 1.35, fz + 0.2); wheel.push(ni(sp)); }
    const hub = new THREE.CylinderGeometry(0.1, 0.1, 0.12, 12); hub.rotateX(Math.PI / 2); hub.translate(VAULT.cx, 1.35, fz + 0.2); wheel.push(ni(hub));
    for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2; const bolt = new THREE.SphereGeometry(0.05, 6, 4); bolt.translate(VAULT.cx + Math.cos(a) * 0.7, 1.35 + Math.sin(a) * 0.7, fz + 0.15); wheel.push(ni(bolt)); }
    add(new THREE.Mesh(mergeBufferGeometries(wheel), brass), false);
    // gilded TALLY board over the door
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(1.9, 0.46), new THREE.MeshStandardMaterial({ map: goldBoard('TALLY'), roughness: 0.5, emissive: 0x3a2a10, emissiveIntensity: 0.5 }));
    sign.position.set(VAULT.cx, 2.75, fz + 0.03);
    g.add(sign);
    // barred windows with ledgers stacked inside (front + sides)
    const ledger = new THREE.MeshStandardMaterial({ map: ledgerTexture(), emissive: 0x5a3a18, emissiveIntensity: 0.35, roughness: 0.9 });
    const panes = [], bars = [];
    const win = (x, y, z, ry) => {
      const p = new THREE.PlaneGeometry(0.62, 0.9); p.rotateY(ry); p.translate(x, y, z); panes.push(p);
      for (let k = -1; k <= 1; k++) { const b = box(0.04, 0.95, 0.04, k * 0.18, 0, 0); b.rotateY(ry); b.translate(x, y, z); bars.push(ni(b)); }
    };
    win(VAULT.cx - 1.15, 3.3, fz + 0.01, 0); win(VAULT.cx + 1.15, 3.3, fz + 0.01, 0);
    win(VAULT.cx - VAULT.w / 2 - 0.01, 2.6, 0, -Math.PI / 2);
    add(new THREE.Mesh(mergeBufferGeometries(panes), ledger), false);
    add(new THREE.Mesh(mergeBufferGeometries(bars), M.iron), false);
  }

  // ── The counting room: cream frame, tall gold-lit glass ───────
  const goldGlass = new THREE.MeshStandardMaterial({ color: 0xc99a52, emissive: 0xffb84a, emissiveIntensity: 0.42, roughness: 0.25, metalness: 0.1 });
  {
    const fz = ROOM.d / 2, hw = ROOM.w / 2;
    // glass box, slightly inset; the frame (posts, floor bands, cornice) over it
    const glass = box(ROOM.w - 0.3, ROOM.h - 0.5, ROOM.d - 0.3, ROOM.cx, 0.35 + (ROOM.h - 0.5) / 2, 0);
    add(new THREE.Mesh(glass, goldGlass), false);
    const frame = [box(ROOM.w + 0.1, 0.35, ROOM.d + 0.1, ROOM.cx, 0.17, 0), box(ROOM.w + 0.5, 0.3, ROOM.d + 0.5, ROOM.cx, ROOM.h + 0.05, 0),
                   box(ROOM.w + 0.1, 0.18, ROOM.d + 0.1, ROOM.cx, 2.55, 0)];
    for (const x of [-hw, -hw / 3, hw / 3, hw]) for (const z of [-fz, fz]) frame.push(box(0.2, ROOM.h - 0.3, 0.2, ROOM.cx + x, (ROOM.h - 0.3) / 2 + 0.2, z));
    for (const z of [-fz / 3, fz / 3]) for (const x of [-hw, hw]) frame.push(box(0.2, ROOM.h - 0.3, 0.2, ROOM.cx + x, (ROOM.h - 0.3) / 2 + 0.2, z));
    for (const y of [1.45, 3.7]) { frame.push(box(ROOM.w, 0.07, 0.07, ROOM.cx, y, fz)); frame.push(box(0.07, 0.07, ROOM.d, ROOM.cx + hw, y, 0)); frame.push(box(0.07, 0.07, ROOM.d, ROOM.cx - hw, y, 0)); }
    const m = add(new THREE.Mesh(mergeBufferGeometries(frame.map(ni)), cream));
    if (userData) m.userData = userData;
    // steps up to the door and the door itself (darker glass with a brass bar)
    const steps = [];
    for (let i = 0; i < 3; i++) steps.push(box(1.8 - i * 0.2, 0.12 * (3 - i), 0.32, ROOM.cx, 0.06 * (3 - i), fz + 0.6 - i * 0.3));
    add(new THREE.Mesh(mergeBufferGeometries(steps.map(ni)), M.stone));
    const door = new THREE.Mesh(box(1.0, 2.0, 0.06, ROOM.cx, 1.35, fz + 0.04), standardMat({ color: 0x2b2a28, roughness: 0.3, metalness: 0.2 }, 'roomDoor'));
    add(door, false);
    add(new THREE.Mesh(box(0.5, 0.05, 0.05, ROOM.cx, 1.35, fz + 0.1), brass), false);
    // a slim parapet with a gilded nameboard
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(2.3, 0.42), new THREE.MeshStandardMaterial({ map: goldBoard('BRIDGE'), roughness: 0.5, emissive: 0x3a2a10, emissiveIntensity: 0.5 }));
    sign.position.set(ROOM.cx, ROOM.h + 0.45, fz + 0.26);
    g.add(sign);
    add(new THREE.Mesh(box(2.5, 0.6, 0.12, ROOM.cx, ROOM.h + 0.45, fz + 0.18), cream));
  }

  // ── Skybridge on an arcade of two arches ──────────────────────
  {
    const arc = arcade(BRIDGE.x0, BRIDGE.x1, BRIDGE.y0, BRIDGE.d * 0.8);
    add(new THREE.Mesh(arc, oldStone));
    const bx = (BRIDGE.x0 + BRIDGE.x1) / 2, bw = BRIDGE.x1 - BRIDGE.x0;
    const body = [box(bw, 0.2, BRIDGE.d, bx, BRIDGE.y0 + 0.1, 0), box(bw + 0.2, 0.18, BRIDGE.d + 0.25, bx, BRIDGE.y0 + BRIDGE.h + 0.05, 0)];
    for (let k = 0; k <= 4; k++) for (const z of [-BRIDGE.d / 2, BRIDGE.d / 2]) body.push(box(0.12, BRIDGE.h, 0.12, BRIDGE.x0 + (k / 4) * bw, BRIDGE.y0 + BRIDGE.h / 2, z));
    add(new THREE.Mesh(mergeBufferGeometries(body.map(ni)), M.timber));
    // glazing between the posts: warm, dimmer than the counting room
    const gl = box(bw, BRIDGE.h - 0.3, BRIDGE.d - 0.08, bx, BRIDGE.y0 + 0.2 + (BRIDGE.h - 0.3) / 2, 0);
    add(new THREE.Mesh(gl, standardMat({ color: 0xe8b56a, emissive: 0xffa94a, emissiveIntensity: 0.45, roughness: 0.4 }, 'bridgeGlass')), false);
    // the cable along the front, post to post
    const cable = [box(bw + 0.8, 0.03, 0.03, bx, LINE.y, LINE.z)];
    for (const x of [BRIDGE.x0 - 0.3, BRIDGE.x1 + 0.3]) cable.push(box(0.06, 0.75, 0.06, x, LINE.y - 0.35, LINE.z));
    add(new THREE.Mesh(mergeBufferGeometries(cable.map(ni)), M.iron), false);
  }

  // ── Scrolls ride the line to the counting room; letters come back ──
  const N = 3;
  const scrollGeo = new THREE.CylinderGeometry(0.09, 0.09, 0.42, 8); scrollGeo.rotateZ(Math.PI / 2); scrollGeo.translate(0, -0.22, 0);
  const tie = new THREE.CylinderGeometry(0.1, 0.1, 0.05, 8); tie.rotateZ(Math.PI / 2); tie.translate(0, -0.22, 0);
  const hook = box(0.02, 0.14, 0.02, 0, -0.07, 0);
  const scrolls = new THREE.InstancedMesh(mergeBufferGeometries([ni(scrollGeo), ni(tie), ni(hook)]), standardMat({ color: 0xf0e2bf, roughness: 0.8 }, 'scroll'), N);
  const envGeo = mergeBufferGeometries([ni(box(0.36, 0.24, 0.03, 0, -0.24, 0)), ni(hook)]);
  const letters = new THREE.InstancedMesh(envGeo, standardMat({ color: 0xffffff, emissive: 0xfff3d8, emissiveIntensity: 0.2, roughness: 0.7 }, 'letter'), N);
  scrolls.frustumCulled = letters.frustumCulled = false;
  g.add(scrolls, letters);
  const xA = BRIDGE.x0 - 0.2, xB = BRIDGE.x1 + 0.2;
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), v = new THREE.Vector3(), one = new THREE.Vector3(1, 1, 1), zero = new THREE.Vector3();

  // ── A brass balance scale on the counting-room steps ──────────
  const beam = new THREE.Group();
  {
    const sx = ROOM.cx + 1.35, sz = ROOM.d / 2 + 0.55;
    const post = [box(0.4, 0.06, 0.3, sx, 0.03, sz), box(0.05, 1.0, 0.05, sx, 0.53, sz)];
    add(new THREE.Mesh(mergeBufferGeometries(post.map(ni)), brass), false);
    beam.position.set(sx, 1.05, sz);
    beam.add(new THREE.Mesh(box(0.8, 0.04, 0.04, 0, 0, 0), brass));
    for (const s of [-1, 1]) {
      const pan = new THREE.Group();
      pan.position.x = s * 0.38;
      pan.add(new THREE.Mesh(box(0.01, 0.3, 0.01, 0, -0.15, 0), M.iron));
      const dish = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.09, 0.04, 12), brass); dish.position.y = -0.32; pan.add(dish);
      if (s < 0) { const coins = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.06, 8), standardMat({ color: 0xe0b84a, metalness: 0.8, roughness: 0.3 }, 'gold')); coins.position.y = -0.27; pan.add(coins); }
      beam.add(pan);
      pan.userData.counter = true;
    }
  }
  g.add(beam);

  const update = (t) => {
    // traffic on the line: 3 scrolls → (vault → room), 3 letters ← (room → vault)
    for (let i = 0; i < N; i++) {
      const u = reducedMotion ? 0.5 : ((t * 0.16 + i / N) % 1);
      const sway = Math.sin(t * 3 + i) * 0.08;
      m4.compose(v.set(THREE.MathUtils.lerp(xA, xB, u), LINE.y, LINE.z), q.setFromEuler(new THREE.Euler(0, 0, sway)), u < 0.04 || u > 0.96 ? zero : one);
      scrolls.setMatrixAt(i, m4);
      const w = reducedMotion ? 0.5 : ((t * 0.13 + i / N + 0.17) % 1);
      m4.compose(v.set(THREE.MathUtils.lerp(xB, xA, w), LINE.y, LINE.z + 0.02), q.setFromEuler(new THREE.Euler(0, 0, -sway)), w < 0.04 || w > 0.96 ? zero : one);
      letters.setMatrixAt(i, m4);
    }
    scrolls.instanceMatrix.needsUpdate = letters.instanceMatrix.needsUpdate = true;
    // the scale settles, now and then tips as a payment lands
    const tip = reducedMotion ? 0 : Math.sin(t * 0.9) * 0.12 * (0.6 + 0.4 * Math.sin(t * 0.23));
    beam.rotation.z = tip;
    for (const c of beam.children) if (c.userData.counter) c.rotation.z = -tip;     // pans hang level
    goldGlass.emissiveIntensity = 0.42 + Math.sin(t * 0.8) * 0.03;
  };
  update(0);

  return { group: g, height: ROOM.h + 0.8, glow: new THREE.Vector3(ROOM.cx, 2.4, ROOM.d / 2 + 0.8), update };
}
