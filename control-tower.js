/**
 * control-tower.js — Navigator's Tower as an airfield control tower (§2.14)
 *
 * The building stands for InstillGCS, a web ground control station for
 * drones: live telemetry, flight modes and waypoint maps. So it's a slender
 * eight-sided stone tower with a glazed, glowing control cab and a balcony,
 * a turning radar dish and a mast with a blinking red aviation light, and a
 * windsock by the door. A small drone (buildDrone) flies a waypoint loop
 * past the tower between orange waypoint flags (buildWaypointFlag).
 *
 * Built in its own frame: ground at y = 0, the door at +z (the building's
 * "front"). The drone and flags live outside the tower's group so they
 * don't swell its occlusion box. ~10 draw calls for the tower.
 */
import * as THREE from 'three';
import { mergeBufferGeometries } from 'https://cdn.jsdelivr.net/npm/three@0.150.0/examples/jsm/utils/BufferGeometryUtils.js';
import { standardMat } from './materials.js';
import { propMaterials } from './town-props.js';
import { stoneTexture } from './textures.js';

const SHAFT = { r0: 1.62, r1: 1.28, y0: 0.45, y1: 11.5 };   // octagonal shaft
const CAB = { y0: 12.45, h: 1.75, r0: 1.62, r1: 1.86 };      // glazed cab, leaning out
const BALCONY = { y: 12.3, r: 2.45 };
const OCT = Math.PI / 8;                                     // turn so a flat face looks along +z

let towerStone = null;
const stone = () => towerStone || (towerStone = standardMat({ map: stoneTexture(), color: 0xb9c0c8, roughness: 0.92 }, 'towerStone'));

/** Octagonal prism, flat face to the front, UVs tiled at ~1.6 world units. */
function octagon(rTop, rBot, h, { open = false, tile = 1.6 } = {}) {
  const g = new THREE.CylinderGeometry(rTop, rBot, h, 8, 1, open);
  g.rotateY(OCT);
  const uv = g.attributes.uv, circ = (rTop + rBot) * Math.PI;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * (circ / tile), uv.getY(i) * (h / tile));
  return g;
}

// Cab glazing: one tall amber pane per face with a sill and a transom
function cabTexture() {
  const cv = document.createElement('canvas');
  cv.width = 512; cv.height = 128;
  const c = cv.getContext('2d');
  c.fillStyle = '#2b2018'; c.fillRect(0, 0, 512, 128);
  for (let i = 0; i < 8; i++) {
    const x = i * 64;
    const g = c.createLinearGradient(0, 10, 0, 118);
    g.addColorStop(0, '#ffe2a0'); g.addColorStop(0.55, '#ffc867'); g.addColorStop(1, '#e89a3c');
    c.fillStyle = g;
    c.fillRect(x + 5, 10, 54, 108);
    c.fillStyle = '#2b2018';
    c.fillRect(x + 5, 40, 54, 4);                 // transom
    // a couple of silhouettes at the consoles
    if (i % 3 === 1) { c.fillStyle = 'rgba(60,35,20,0.55)'; c.beginPath(); c.arc(x + 32, 74, 9, 0, Math.PI * 2); c.fill(); c.fillRect(x + 21, 82, 22, 36); }
  }
  const t = new THREE.CanvasTexture(cv);
  return t;
}

// Windsock stripes: orange / white bands
function sockTexture() {
  const cv = document.createElement('canvas');
  cv.width = 64; cv.height = 16;
  const c = cv.getContext('2d');
  for (let i = 0; i < 5; i++) { c.fillStyle = i % 2 ? '#f4efe6' : '#ff7a2f'; c.fillRect(0, (i * 16) / 5, 64, 16 / 5 + 1); }
  return new THREE.CanvasTexture(cv);
}

/**
 * Build the tower.
 * @returns {{ group: THREE.Group, height: number, cabLight: THREE.Vector3, update(t:number): void }}
 */
export function buildControlTower(userData = null, { reducedMotion = false } = {}) {
  const g = new THREE.Group();
  const M = propMaterials();
  const add = (mesh, cast = true) => { mesh.castShadow = cast; mesh.receiveShadow = true; g.add(mesh); return mesh; };

  // ── Plinth, shaft, bands, collar ──────────────────────────────
  const plinth = octagon(2.05, 2.2, SHAFT.y0);
  plinth.translate(0, SHAFT.y0 / 2, 0);
  const collar = octagon(BALCONY.r - 0.15, SHAFT.r1 + 0.05, 0.75);
  collar.translate(0, SHAFT.y1 + 0.37, 0);
  const bands = [4.2, 8.0].map(y => {
    const k = (y - SHAFT.y0) / (SHAFT.y1 - SHAFT.y0), r = THREE.MathUtils.lerp(SHAFT.r0, SHAFT.r1, k) + 0.08;
    const b = octagon(r, r, 0.22); b.translate(0, y, 0); return b;
  });
  add(new THREE.Mesh(mergeBufferGeometries([plinth, collar, ...bands]), M.stoneDark));
  const shaft = octagon(SHAFT.r1, SHAFT.r0, SHAFT.y1 - SHAFT.y0);
  shaft.translate(0, (SHAFT.y0 + SHAFT.y1) / 2, 0);
  const body = add(new THREE.Mesh(shaft, stone()));
  if (userData) body.userData = userData;

  // ── Door and slit windows ─────────────────────────────────────
  const apothem = (y) => THREE.MathUtils.lerp(SHAFT.r0, SHAFT.r1, (y - SHAFT.y0) / (SHAFT.y1 - SHAFT.y0)) * Math.cos(OCT);
  {
    const door = new THREE.Mesh(new THREE.BoxGeometry(0.95, 1.75, 0.16), M.woodDoor);
    door.position.set(0, SHAFT.y0 + 0.87, apothem(1.3) + 0.02);
    add(door, false);
    const lintel = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.22, 0.3), M.stoneDark);
    lintel.position.set(0, SHAFT.y0 + 1.85, apothem(2.3) + 0.06);
    add(lintel);
  }
  const slitMat = standardMat({ color: 0xffc46b, emissive: 0xffb050, emissiveIntensity: 0.9, roughness: 0.6 }, 'towerSlit');
  {
    const parts = [];
    for (const y of [3.0, 6.2, 9.4]) for (let f = 0; f < 8; f += 2) {
      const a = f * (Math.PI / 4), r = apothem(y) + 0.015;
      const p = new THREE.PlaneGeometry(0.34, 0.95);
      p.rotateY(a);
      p.translate(Math.sin(a) * r, y, Math.cos(a) * r);
      parts.push(p);
    }
    add(new THREE.Mesh(mergeBufferGeometries(parts), slitMat), false);
  }

  // ── Balcony deck, railing ─────────────────────────────────────
  {
    const deck = octagon(BALCONY.r, BALCONY.r, 0.2);
    deck.translate(0, BALCONY.y, 0);
    add(new THREE.Mesh(deck, M.stone));
    const rail = [];
    const top = new THREE.TorusGeometry(BALCONY.r - 0.08, 0.045, 4, 8);
    top.rotateX(Math.PI / 2); top.rotateY(OCT); top.translate(0, BALCONY.y + 0.75, 0);
    rail.push(top);
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2 + OCT;
      const post = new THREE.CylinderGeometry(0.03, 0.03, 0.75, 4);
      post.translate(Math.sin(a) * (BALCONY.r - 0.1), BALCONY.y + 0.42, Math.cos(a) * (BALCONY.r - 0.1));
      rail.push(post);
    }
    add(new THREE.Mesh(mergeBufferGeometries(rail.map(r => r.index ? r.toNonIndexed() : r)), M.iron), false);
  }

  // ── Glazed cab with mullions and a slate roof ─────────────────
  const cabTex = cabTexture();
  const glass = new THREE.MeshStandardMaterial({
    map: cabTex, emissiveMap: cabTex, emissive: 0xffc070, emissiveIntensity: 0.85,
    roughness: 0.35, metalness: 0.1, side: THREE.DoubleSide,
  });
  {
    const cab = new THREE.CylinderGeometry(CAB.r1, CAB.r0, CAB.h, 8, 1, true);
    cab.rotateY(OCT);
    cab.translate(0, CAB.y0 + CAB.h / 2, 0);
    add(new THREE.Mesh(cab, glass), false);
    const frame = [];
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;              // corners (the faces sit between them)
      const m = new THREE.BoxGeometry(0.12, CAB.h + 0.05, 0.12);
      m.rotateX(-0.12);                              // lean out with the glazing
      m.rotateY(a);
      const r = (CAB.r0 + CAB.r1) / 2;
      m.translate(Math.sin(a) * r, CAB.y0 + CAB.h / 2, Math.cos(a) * r);
      frame.push(m);
    }
    const sill = octagon(CAB.r0 + 0.08, CAB.r0 + 0.08, 0.14); sill.translate(0, CAB.y0 + 0.07, 0); frame.push(sill);
    add(new THREE.Mesh(mergeBufferGeometries(frame.map(f => f.index ? f.toNonIndexed() : f)), standardMat({ color: 0x3b4656, roughness: 0.7 }, 'towerSlate')));
    const eave = octagon(CAB.r1 + 0.32, CAB.r1 + 0.32, 0.2); eave.translate(0, CAB.y0 + CAB.h + 0.1, 0);
    const cap = new THREE.ConeGeometry(CAB.r1 + 0.2, 0.55, 8); cap.rotateY(OCT); cap.translate(0, CAB.y0 + CAB.h + 0.47, 0);
    add(new THREE.Mesh(mergeBufferGeometries([eave.toNonIndexed(), cap.toNonIndexed()]), standardMat({ color: 0x3b4656, roughness: 0.7 }, 'towerSlate')));
  }
  const roofY = CAB.y0 + CAB.h + 0.2;

  // ── Mast with a red aviation light ────────────────────────────
  const mastTop = roofY + 3.0;
  {
    const parts = [];
    const pole = new THREE.CylinderGeometry(0.045, 0.07, mastTop - roofY, 6);
    pole.translate(0.55, (roofY + mastTop) / 2, -0.35);
    parts.push(pole);
    for (const [y, w] of [[roofY + 1.6, 0.7], [roofY + 2.3, 0.45]]) {
      const bar = new THREE.BoxGeometry(w, 0.04, 0.04); bar.translate(0.55, y, -0.35); parts.push(bar);
    }
    add(new THREE.Mesh(mergeBufferGeometries(parts.map(p => p.index ? p.toNonIndexed() : p)), M.iron), false);
  }
  const beaconMat = new THREE.MeshStandardMaterial({ color: 0xff3b30, emissive: 0xff2a1a, emissiveIntensity: 1.6, roughness: 0.4 });
  const beacon = new THREE.Mesh(new THREE.SphereGeometry(0.12, 10, 8), beaconMat);
  beacon.position.set(0.55, mastTop + 0.08, -0.35);
  g.add(beacon);

  // ── Radar: a dish on a pedestal, turning ──────────────────────
  const radar = new THREE.Group();
  {
    const ped = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.18, 0.55, 8), M.iron);
    ped.position.set(-0.5, roofY + 0.5, 0.25);
    add(ped);
    radar.position.set(-0.5, roofY + 0.85, 0.25);
    const dishGeo = new THREE.SphereGeometry(1.0, 18, 5, 0, Math.PI * 2, 0, 0.62);
    dishGeo.translate(0, -1.0, 0);                // rim at the origin, bowl behind it
    dishGeo.rotateX(-Math.PI / 2);                // bowl opens towards +z
    const dish = new THREE.Mesh(dishGeo, standardMat({ color: 0xe9eef2, roughness: 0.5, side: THREE.DoubleSide }, 'radarDish'));
    dish.position.z = 0.15;
    dish.rotation.x = -0.3;                       // tilted up a little
    dish.castShadow = true;
    const feed = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.55, 4), M.iron);
    feed.rotation.x = Math.PI / 2; feed.position.set(0, 0.1, 0.3);
    radar.add(dish, feed);
  }
  g.add(radar);

  // ── Windsock on a pole by the door ────────────────────────────
  const sock = new THREE.Group();
  {
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.06, 3.4, 6), M.iron);
    pole.position.set(2.75, 1.7, 1.2);
    add(pole);
    sock.position.set(2.75, 3.25, 1.2);
    const geo = new THREE.CylinderGeometry(0.1, 0.24, 1.15, 10, 1, true);
    geo.rotateZ(Math.PI / 2); geo.translate(0.62, 0, 0);
    const mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ map: sockTexture(), side: THREE.DoubleSide, roughness: 0.85 }));
    mesh.rotation.z = -0.18;                      // droops a little
    mesh.castShadow = true;
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.24, 0.025, 4, 12), M.iron);
    ring.rotation.y = Math.PI / 2;
    sock.add(mesh, ring);
  }
  g.add(sock);

  const height = mastTop + 0.2;
  return {
    group: g,
    height,
    cabLight: new THREE.Vector3(0, CAB.y0 + CAB.h * 0.5, 0),
    beaconPos: beacon.position.clone(),
    windsock: new THREE.Vector3(2.75, 0, 1.2),
    update(t) {
      if (!reducedMotion) {
        radar.rotation.y = t * 0.9;
        sock.rotation.y = 0.7 + Math.sin(t * 0.5) * 0.35 + Math.sin(t * 1.7) * 0.08;
        sock.children[0].rotation.z = -0.18 + Math.sin(t * 2.3) * 0.05;
      }
      // the aviation light: a short bright blink every 1.6 s
      const ph = (t % 1.6) / 1.6;
      beaconMat.emissiveIntensity = ph < 0.18 ? 2.6 : 0.25;
    },
  };
}

// ── Waypoint flag: a thin pole with an orange pennant ──────────────
export function buildWaypointFlag() {
  const g = new THREE.Group();
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.045, 1.7, 5), propMaterials().iron);
  pole.position.y = 0.85;
  const flagGeo = new THREE.BufferGeometry();
  flagGeo.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, 0.62, -0.17, 0, 0, -0.36, 0], 3));
  flagGeo.computeVertexNormals();
  const flag = new THREE.Mesh(flagGeo, standardMat({ color: 0xff8a3d, emissive: 0x6a2a00, emissiveIntensity: 0.4, side: THREE.DoubleSide }, 'waypointFlag'));
  flag.position.y = 1.68;
  const base = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.2, 0.1, 8), propMaterials().stoneDark);
  base.position.y = 0.05;
  for (const m of [pole, flag, base]) { m.castShadow = true; g.add(m); }
  g.scale.setScalar(1.4);
  return g;
}

/**
 * A small quadcopter that flies a closed loop through `pts` ([x, y, z]),
 * banking into the turns, rotors spinning, nav lights blinking.
 * @returns {{ group: THREE.Group, update(t:number): void }}
 */
export function buildDrone(pts, { period = 28, reducedMotion = false, path = null, scale = 1.5 } = {}) {
  const g = new THREE.Group();
  const S = scale;                                // scaled up so it reads from the iso camera
  const bodyMat = standardMat({ color: 0xd8462f, roughness: 0.5 }, 'droneBody');
  const dark = standardMat({ color: 0x2b2b30, roughness: 0.6 }, 'droneDark');
  const frame = [];
  const box = (w, h, d, x, y, z, ry = 0) => { const b = new THREE.BoxGeometry(w, h, d); b.rotateY(ry); b.translate(x, y, z); frame.push(b); };
  box(0.95, 0.05, 0.07, 0, 0, 0, Math.PI / 4);
  box(0.95, 0.05, 0.07, 0, 0, 0, -Math.PI / 4);
  for (const [x, z] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) box(0.05, 0.12, 0.05, x * 0.33, -0.08, z * 0.33);   // legs
  const craft = new THREE.Group();
  craft.scale.setScalar(S);
  craft.add(new THREE.Mesh(mergeBufferGeometries(frame), dark));
  const hull = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.14, 0.4), bodyMat);
  hull.position.y = 0.04;
  craft.add(hull);
  const cam = new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 6), dark);
  cam.position.set(0, -0.05, 0.2);
  craft.add(cam);
  const rotorGeo = new THREE.CylinderGeometry(0.17, 0.17, 0.01, 12);
  const rotorMat = new THREE.MeshStandardMaterial({ color: 0x333338, transparent: true, opacity: 0.45, depthWrite: false });
  const rotors = [];
  for (const [x, z] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
    const r = new THREE.Mesh(rotorGeo, rotorMat);
    r.position.set(x * 0.33, 0.06, z * 0.33);
    rotors.push(r);
    craft.add(r);
  }
  // nav lights: red port (left), green starboard (right), white strobe at the tail
  const navMat = (c) => new THREE.MeshStandardMaterial({ color: c, emissive: c, emissiveIntensity: 2 });
  const port = navMat(0xff3030), star = navMat(0x30ff60), strobe = navMat(0xffffff);
  for (const [m, x, z] of [[port, -0.33, 0.33], [star, 0.33, 0.33], [strobe, 0, -0.22]]) {
    const l = new THREE.Mesh(new THREE.SphereGeometry(0.035, 6, 4), m);
    l.position.set(x, 0.02, z);
    craft.add(l);
  }
  g.add(craft);

  const curve = pts ? new THREE.CatmullRomCurve3(pts.map(([x, y, z]) => new THREE.Vector3(x, y, z)), true, 'centripetal') : null;
  const p = new THREE.Vector3(), ahead = new THREE.Vector3(), behind = new THREE.Vector3();
  const place = (u) => {
    curve.getPointAt(u, p);
    curve.getPointAt((u + 0.01) % 1, ahead);
    curve.getPointAt((u + 0.99) % 1, behind);
    g.position.copy(p);
    const yaw = Math.atan2(ahead.x - p.x, ahead.z - p.z);
    // bank by how fast the heading is turning
    const yawB = Math.atan2(p.x - behind.x, p.z - behind.z);
    let turn = yaw - yawB; turn = Math.atan2(Math.sin(turn), Math.cos(turn));
    craft.rotation.set(0.12, yaw, THREE.MathUtils.clamp(-turn * 4, -0.45, 0.45), 'YXZ');
  };
  // `path(t)` (optional) flies a scripted route instead of the loop:
  // returns { pos: Vector3, yaw, pitch, bank, flying }
  let flying = true;
  const follow = (t) => {
    const s = path(t);
    g.position.copy(s.pos);
    craft.rotation.set(s.pitch || 0, s.yaw || 0, s.bank || 0, 'YXZ');
    flying = s.flying !== false;
  };
  if (path) follow(0); else place(0);
  return {
    group: g,
    position: g.position,
    update(t) {
      if (!reducedMotion) {
        if (path) follow(t); else place((t / period) % 1);
        craft.position.y = flying ? Math.sin(t * 2.1) * 0.06 : 0;
        if (flying) for (const r of rotors) r.rotation.y = t * 40;
      }
      const s = t % 1.2;
      strobe.emissiveIntensity = s < 0.08 ? 4 : 0.2;
      port.emissiveIntensity = star.emissiveIntensity = 1.4 + Math.sin(t * 3) * 0.6;
    },
  };
}
