/**
 * cloud-citadel.js — the Cloud Citadel (§2.14)
 *
 * The building stands for Distributed AWS: parallel matrix operations on an
 * EC2 cluster, benchmarked against a single machine. So it's a citadel
 * made of copies of itself: a raised stone platform carrying one taller
 * master tower and six identical worker towers (instanced), joined by
 * little walkway bridges and wrapped in a bank of soft cloud.
 *
 * Every tower has a regular grid of windows, like a matrix. In each cycle
 * the workers light their window rows bottom to top, each at its own pace
 * (the parallel work); glowing packets hop along the walkways back to the
 * master, which then fills its own rows (the gather) and flashes before the
 * cycle starts again. An orange beacon pulses on the master's roof.
 *
 * Built in its own frame: ground at y = 0, the steps at +z (the "front").
 * ~10 draw calls.
 */
import * as THREE from 'three';
import { mergeBufferGeometries } from 'https://cdn.jsdelivr.net/npm/three@0.150.0/examples/jsm/utils/BufferGeometryUtils.js';
import { standardMat } from './materials.js';
import { propMaterials } from './town-props.js';
import { stoneTexture } from './textures.js';

const PLAT = { w: 7, d: 7, h: 1.0 };
const MASTER = { s: 1.7, h: 9.0 };                 // square, above the platform
const WORKER = { s: 1.05, h: 5.0, ring: 2.5, n: 6 };
const BRIDGE_Y = 3.4;                              // walkway height above the platform
const CYCLE = 7;                                   // seconds per compute cycle

/** Box with UVs tiled at `unit` world units on every face. */
function tiledBox(w, h, d, unit = 1.2) {
  const g = new THREE.BoxGeometry(w, h, d);
  const uv = g.attributes.uv;
  // faces: +x, -x, +y, -y, +z, -z (4 verts each)
  const dims = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]];
  for (let f = 0; f < 6; f++) for (let k = 0; k < 4; k++) {
    const i = f * 4 + k;
    uv.setXY(i, uv.getX(i) * dims[f][0] / unit, uv.getY(i) * dims[f][1] / unit);
  }
  return g;
}

/** Pyramid cap for a square tower (4-sided cone turned to sit square). */
function cap(s, h) {
  const c = new THREE.ConeGeometry(s * 0.78, h, 4);
  c.rotateY(Math.PI / 4);
  return c;
}

/**
 * @returns {{ group, height, beacon: THREE.Vector3, update(t:number): void }}
 */
export function buildCitadel(userData = null, { reducedMotion = false } = {}) {
  const g = new THREE.Group();
  const M = propMaterials();
  const stone = standardMat({ map: stoneTexture(), color: 0xe2dccd, roughness: 0.92 }, 'citadelStone');
  const slate = standardMat({ color: 0x4b5a72, roughness: 0.7 }, 'citadelSlate');
  const add = (m, cast = true) => { m.castShadow = cast; m.receiveShadow = true; g.add(m); return m; };
  const P = PLAT.h;

  // ── Platform with steps up the front ──────────────────────────
  {
    const parts = [];
    const base = tiledBox(PLAT.w, P, PLAT.d - 1.0); base.translate(0, P / 2, -0.5); parts.push(base);
    for (let i = 0; i < 3; i++) {
      const h = P * (3 - i) / 3, st = tiledBox(2.4, h, 0.34); st.translate(0, h / 2, PLAT.d / 2 - 1.0 + 0.17 + i * 0.33); parts.push(st);
    }
    const body = add(new THREE.Mesh(mergeBufferGeometries(parts), M.stoneDark));
    if (userData) body.userData = userData;
    // a low parapet round the platform edge (gap at the steps)
    const par = [];
    const hw = PLAT.w / 2, back = -PLAT.d / 2, front = PLAT.d / 2 - 1.0;
    const seg = (x0, z0, x1, z1) => { const b = new THREE.BoxGeometry(Math.max(0.2, Math.abs(x1 - x0)), 0.35, Math.max(0.2, Math.abs(z1 - z0))); b.translate((x0 + x1) / 2, P + 0.17, (z0 + z1) / 2); par.push(b); };
    seg(-hw, back, hw, back); seg(-hw, back, -hw, front); seg(hw, back, hw, front);
    seg(-hw, front, -1.3, front); seg(1.3, front, hw, front);
    add(new THREE.Mesh(mergeBufferGeometries(par), M.stone));
  }

  // ── Master tower ──────────────────────────────────────────────
  {
    const t = tiledBox(MASTER.s, MASTER.h, MASTER.s); t.translate(0, P + MASTER.h / 2, 0);
    add(new THREE.Mesh(t, stone));
    const c = cap(MASTER.s, 1.5); c.translate(0, P + MASTER.h + 0.75, 0);
    const corb = new THREE.BoxGeometry(MASTER.s + 0.3, 0.25, MASTER.s + 0.3); corb.translate(0, P + MASTER.h - 0.1, 0);
    add(new THREE.Mesh(mergeBufferGeometries([c.toNonIndexed(), corb.toNonIndexed()]), slate));
    const door = new THREE.Mesh(new THREE.BoxGeometry(0.8, 1.4, 0.1), M.woodDoor);
    door.position.set(0, P + 0.7, MASTER.s / 2 + 0.03);
    add(door, false);
  }

  // ── Worker towers: one instanced stone body + one instanced cap ──
  const workers = [];
  for (let k = 0; k < WORKER.n; k++) {
    const a = (k / WORKER.n) * Math.PI * 2 + Math.PI / 6;          // none straight in front of the door
    workers.push({ a, x: Math.sin(a) * WORKER.ring, z: Math.cos(a) * WORKER.ring });
  }
  {
    const body = tiledBox(WORKER.s, WORKER.h, WORKER.s);
    body.translate(0, WORKER.h / 2, 0);
    const im = new THREE.InstancedMesh(body, stone, WORKER.n);
    const capGeo = cap(WORKER.s, 1.0); capGeo.translate(0, WORKER.h + 0.5, 0);
    const caps = new THREE.InstancedMesh(capGeo, slate, WORKER.n);
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion();
    workers.forEach((w, i) => {
      m4.compose(new THREE.Vector3(w.x, P, w.z), q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), w.a), new THREE.Vector3(1, 1, 1));
      im.setMatrixAt(i, m4); caps.setMatrixAt(i, m4);
    });
    add(im); add(caps);
  }

  // ── Walkway bridges master → each worker, with rails ──────────
  {
    const parts = [];
    for (const w of workers) {
      const r0 = MASTER.s / 2, r1 = WORKER.ring - WORKER.s / 2, len = r1 - r0;
      const deck = new THREE.BoxGeometry(0.42, 0.12, len); deck.translate(0, P + BRIDGE_Y, r0 + len / 2); deck.rotateY(w.a); parts.push(deck);
      for (const sx of [-0.2, 0.2]) {
        const rail = new THREE.BoxGeometry(0.04, 0.04, len); rail.translate(sx, P + BRIDGE_Y + 0.38, r0 + len / 2); rail.rotateY(w.a); parts.push(rail);
      }
    }
    add(new THREE.Mesh(mergeBufferGeometries(parts), M.timber));
  }

  // ── Window grid: one InstancedMesh, coloured per row each frame ──
  // Each window knows its tower (0 = master, 1.. = workers) and row.
  const wins = [];
  const face = (cx, cz, a, s, y0, rows, cols, rowH, tower) => {
    for (let f = 0; f < 4; f++) {
      const fa = a + f * Math.PI / 2;
      const nx = Math.sin(fa), nz = Math.cos(fa), tx = Math.cos(fa), tz = -Math.sin(fa);
      for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
        const u = (c - (cols - 1) / 2) * (s / (cols + 0.6));
        if (tower === 0 && f === 0 && r === 0) continue;             // the master's door
        wins.push({ x: cx + nx * (s / 2 + 0.012) + tx * u, y: P + y0 + r * rowH, z: cz + nz * (s / 2 + 0.012) + tz * u, ry: fa, tower, row: r, rows });
      }
    }
  };
  face(0, 0, 0, MASTER.s, 1.0, 7, 3, 1.1, 0);
  workers.forEach((w, i) => face(w.x, w.z, w.a, WORKER.s, 0.9, 4, 2, 1.0, i + 1));
  const winGeo = new THREE.PlaneGeometry(0.24, 0.38);
  const winMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
  const winIM = new THREE.InstancedMesh(winGeo, winMat, wins.length);
  {
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), Y = new THREE.Vector3(0, 1, 0), one = new THREE.Vector3(1, 1, 1);
    wins.forEach((w, i) => { m4.compose(new THREE.Vector3(w.x, w.y, w.z), q.setFromAxisAngle(Y, w.ry), one); winIM.setMatrixAt(i, m4); winIM.setColorAt(i, new THREE.Color(0x3a2a1a)); });
  }
  g.add(winIM);

  // ── Packets hopping along the walkways ────────────────────────
  const packetMat = new THREE.MeshBasicMaterial({ color: 0xffa040 });
  const packets = new THREE.InstancedMesh(new THREE.BoxGeometry(0.16, 0.16, 0.16), packetMat, WORKER.n);
  packets.frustumCulled = false;
  g.add(packets);

  // ── Orange beacon on the master's roof ────────────────────────
  const beaconMat = new THREE.MeshStandardMaterial({ color: 0xff9900, emissive: 0xff8a00, emissiveIntensity: 1.5, roughness: 0.4 });
  const beaconY = P + MASTER.h + 1.75;
  {
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.05, 0.6, 6), M.iron);
    pole.position.y = beaconY - 0.25;
    g.add(pole);
    const b = new THREE.Mesh(new THREE.SphereGeometry(0.17, 12, 8), beaconMat);
    b.position.y = beaconY + 0.12;
    g.add(b);
  }

  // ── A bank of cloud round the tower tops ──────────────────────
  {
    const puffs = [];
    const rnd = (n) => { const x = Math.sin(n * 127.1) * 43758.5; return x - Math.floor(x); };
    for (let k = 0; k < WORKER.n; k++) {
      const a = (k / WORKER.n) * Math.PI * 2;                       // between the workers
      for (let j = 0; j < 2; j++) {
        const r = 2.7 + rnd(k * 3 + j) * 0.6, aa = a + (j - 0.5) * 0.32;
        const p = new THREE.IcosahedronGeometry(0.36 + rnd(k * 7 + j) * 0.22, 1);
        p.scale(1.5, 0.62, 1.2);
        p.translate(Math.sin(aa) * r, P + WORKER.h - 0.55 + rnd(k + j * 5) * 0.5, Math.cos(aa) * r);
        puffs.push(p);
      }
    }
    // and a thin collar round the master
    for (let k = 0; k < 5; k++) {
      const a = (k / 5) * Math.PI * 2 + 0.4;
      const p = new THREE.IcosahedronGeometry(0.34, 1); p.scale(1.5, 0.6, 1.2);
      p.translate(Math.sin(a) * 1.15, P + MASTER.h - 1.6 + (k % 2) * 0.25, Math.cos(a) * 1.15);
      puffs.push(p);
    }
    const cloud = new THREE.Mesh(mergeBufferGeometries(puffs),
      standardMat({ color: 0xffffff, emissive: 0xf3e6dc, emissiveIntensity: 0.25, roughness: 1, flatShading: false }, 'citadelCloud'));
    cloud.castShadow = false;
    g.add(cloud);
  }

  // ── Animation ─────────────────────────────────────────────────
  const OFF = new THREE.Color(0x4a3420), ON = new THREE.Color(0xffc46b), FLASH = new THREE.Color(0xfff1c8), tmp = new THREE.Color();
  const pace = workers.map((w, i) => 0.75 + ((i * 37) % 10) / 40);   // each worker its own speed
  const m4 = new THREE.Matrix4(), pv = new THREE.Vector3(), Q = new THREE.Quaternion(), S1 = new THREE.Vector3(1, 1, 1), S0 = new THREE.Vector3(0, 0, 0);
  const lit = (rowsDone, row) => THREE.MathUtils.clamp(rowsDone - row, 0, 1);
  const frame = (t) => {
    const ph = reducedMotion ? 3.8 : (t % CYCLE);
    // workers fill 4 rows in ~0..3.2 s; master gathers 3.6..5.6 s; flash 5.6..6.2; dark to 7
    const flash = ph > 5.6 && ph < 6.2;
    wins.forEach((w, i) => {
      let k;
      if (ph >= 6.2) k = Math.max(0, 1 - (ph - 6.2) / 0.5);            // fade out, ready for the next cycle
      else if (flash) k = 1.15;
      else if (w.tower === 0) k = lit((ph - 3.6) / 2.0 * w.rows, w.row);
      else k = lit(ph / (3.2 * pace[w.tower - 1]) * w.rows, w.row);
      tmp.copy(OFF).lerp(k > 1 ? FLASH : ON, Math.min(1, k));
      winIM.setColorAt(i, tmp);
    });
    winIM.instanceColor.needsUpdate = true;
    // a packet runs from each worker to the master once that worker is done
    workers.forEach((w, i) => {
      const done = 3.2 * pace[i], u = (ph - done) / 0.6;
      if (u < 0 || u > 1 || reducedMotion) { m4.compose(pv.set(0, -50, 0), Q, S0); }
      else {
        const r = THREE.MathUtils.lerp(WORKER.ring - WORKER.s / 2, MASTER.s / 2, u);
        m4.compose(pv.set(Math.sin(w.a) * r, P + BRIDGE_Y + 0.2 + Math.sin(u * Math.PI) * 0.25, Math.cos(w.a) * r), Q, S1);
      }
      packets.setMatrixAt(i, m4);
    });
    packets.instanceMatrix.needsUpdate = true;
    beaconMat.emissiveIntensity = 1.2 + Math.max(0, Math.sin(t * 3)) * 1.6;
  };
  frame(0);

  return {
    group: g,
    height: beaconY + 0.3,
    beacon: new THREE.Vector3(0, beaconY, 0),
    update: frame,
  };
}
