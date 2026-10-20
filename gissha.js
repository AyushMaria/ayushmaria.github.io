/**
 * gissha.js — the player's cart as a gissha, a Heian court carriage
 *
 * A black lacquered cabin with gold fittings and vermilion panels, bamboo
 * sudare blinds glowing at front and back and in the side windows, purple
 * agemaki tassels at the roof corners, and an arched roof that sweeps up at
 * both ends. It rides on two great wheels under the cabin; two small gilded
 * wheels under the shafts do the steering. A paper lantern hangs from a
 * hooked pole over the yoke.
 *
 * Fills the hooks Cart uses (cart.js): body (fake suspension), wheels
 * (userData.front steers, userData.spin turns, userData.radius sets the spin
 * rate), lantern + lanternLight, tailMat / reverseMat, trackOffsets (where
 * the rear wheels paint ruts in the grass).
 *
 * Footprint stays inside the cart's 2.0 × 3.4 collision box; the roof tips
 * are 2.42 up, under the street orbs' keystones.
 */
import * as THREE from 'three';
import { mergeStaticChildren } from './merge-static.js';

// Layout (cart-local: +z is the nose)
const CAB = { w: 1.36, h: 1.15, d: 2.1, z: -0.35, y0: 0.75 };     // cabin box (y0 = floor)
const BIG = { r: 0.78, x: 0.92, z: -0.45, spokes: 16 };          // great wheels
const SMALL = { r: 0.22, x: 0.55, z: 1.25 };                      // steering wheels under the shafts
const ROOF = { y: 1.9, rise: 0.36, flick: 0.16, half: 0.86, len: 1.35 };

function canvasTex(w, h, draw) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}
const mesh = (geo, mat, parent, cast = true) => { const m = new THREE.Mesh(geo, mat); m.castShadow = cast; m.receiveShadow = true; parent.add(m); return m; };
const box = (w, h, d, x, y, z) => new THREE.BoxGeometry(w, h, d).translate(x, y, z);
const cyl = (r, h, x, y, z, seg = 10, r2 = r) => new THREE.CylinderGeometry(r, r2, h, seg).translate(x, y, z);

export function buildGisshaModel(cart) {
  const sudareTex = canvasTex(64, 64, (c) => {
    c.fillStyle = '#c9a76a'; c.fillRect(0, 0, 64, 64);
    c.fillStyle = 'rgba(90,60,25,.55)'; for (let y = 0; y < 64; y += 4) c.fillRect(0, y, 64, 1);   // bamboo slats
    c.fillStyle = '#5a1f5e'; c.fillRect(0, 0, 64, 6); c.fillRect(29, 0, 6, 64);                    // purple binding + ribbon
  });
  const ribs = canvasTex(16, 64, (c) => { c.fillStyle = '#ffe2b0'; c.fillRect(0, 0, 16, 64); c.fillStyle = 'rgba(100,40,20,.45)'; for (let y = 0; y < 64; y += 8) c.fillRect(0, y, 16, 2); });
  const M = {
    lacquer: new THREE.MeshStandardMaterial({ color: 0x15100e, roughness: 0.3, metalness: 0.15 }),
    roof:    new THREE.MeshStandardMaterial({ color: 0x1c1512, roughness: 0.45, metalness: 0.1, side: THREE.DoubleSide }),
    gold:    new THREE.MeshStandardMaterial({ color: 0xd8b04f, roughness: 0.35, metalness: 0.8 }),
    verm:    new THREE.MeshStandardMaterial({ color: 0xa52f24, roughness: 0.6 }),
    purple:  new THREE.MeshStandardMaterial({ color: 0x6b2a72, roughness: 0.8 }),
    sudare:  new THREE.MeshStandardMaterial({ map: sudareTex, emissive: 0xffa24a, emissiveMap: sudareTex, emissiveIntensity: 0.3, roughness: 0.9, side: THREE.DoubleSide }),
    lantern: new THREE.MeshStandardMaterial({ map: ribs, emissive: 0xff9a4a, emissiveMap: ribs, emissiveIntensity: 1.3, roughness: 0.8 }),
  };

  // Everything but the wheels rides on `body` (pitches / rolls on springs)
  const body = new THREE.Group();
  body.name = 'cart-body';
  cart.group.add(body);
  cart.body = body;

  // ── cabin ──
  const cz = CAB.z, top = CAB.y0 + CAB.h, hw = CAB.w / 2, hd = CAB.d / 2;
  mesh(box(CAB.w, CAB.h, CAB.d, 0, CAB.y0 + CAB.h / 2, cz), M.lacquer, body);
  mesh(box(1.2, 0.12, 2.24, 0, CAB.y0 - 0.05, cz), M.lacquer, body);                 // floor beam
  mesh(cyl(0.06, 2.0, 0, 0, 0, 8).rotateZ(Math.PI / 2).translate(0, BIG.r, BIG.z), M.lacquer, body);    // axle (between the hubs)
  // gold: corner caps, top and bottom bands down each side, a band round the front and back
  for (const x of [-hw, hw]) for (const z of [cz - hd, cz + hd]) for (const y of [CAB.y0 + 0.04, top - 0.04]) mesh(box(0.07, 0.12, 0.07, x, y, z), M.gold, body, false);
  for (const x of [-hw - 0.005, hw + 0.005]) for (const y of [CAB.y0 + 0.05, top - 0.05]) mesh(box(0.03, 0.05, CAB.d + 0.02, x, y, cz), M.gold, body, false);
  for (const z of [cz - hd - 0.005, cz + hd + 0.005]) mesh(box(CAB.w + 0.02, 0.05, 0.03, 0, top - 0.05, z), M.gold, body, false);
  // sides: a vermilion panel with a small sudare window (monomi) framed in gold
  for (const sx of [-1, 1]) {
    const x = sx * (hw + 0.012);
    mesh(box(0.02, 0.42, 1.6, x, CAB.y0 + 0.34, cz), M.verm, body, false);
    mesh(new THREE.PlaneGeometry(0.9, 0.36).rotateY(sx * Math.PI / 2).translate(x + sx * 0.005, CAB.y0 + 0.82, cz + 0.2), M.sudare, body, false);
    for (const dy of [-0.2, 0.2]) mesh(box(0.03, 0.04, 0.96, x + sx * 0.01, CAB.y0 + 0.82 + dy, cz + 0.2), M.gold, body, false);
    for (const dz of [-0.47, 0.47]) mesh(box(0.03, 0.44, 0.04, x + sx * 0.01, CAB.y0 + 0.82, cz + 0.2 + dz), M.gold, body, false);
  }
  // sudare blinds front and back
  for (const sz of [1, -1]) {
    const g = new THREE.PlaneGeometry(1.14, 0.95); if (sz < 0) g.rotateY(Math.PI);
    mesh(g.translate(0, CAB.y0 + 0.6, cz + sz * (hd + 0.02)), M.sudare, body, false);
  }
  // rear step (fumi-ita)
  mesh(box(0.9, 0.06, 0.32, 0, CAB.y0 - 0.12, cz - hd - 0.14), M.lacquer, body);

  // ── arched roof, sweeping up at both ends, gold-trimmed ──
  const roofGeo = new THREE.PlaneGeometry(1, 1, 12, 16);
  const rp = roofGeo.attributes.position;
  const roofY = (u, v) => ROOF.y + ROOF.rise * (1 - u * u) + ROOF.flick * Math.pow(Math.abs(v), 3);
  for (let i = 0; i < rp.count; i++) {
    const u = rp.getX(i) * 2, v = rp.getY(i) * 2;
    rp.setXYZ(i, u * ROOF.half, roofY(u, v), cz + v * ROOF.len);
  }
  roofGeo.computeVertexNormals();
  mesh(roofGeo, M.roof, body);
  // gold edging: along both eaves, the ridge, and round each sweeping end
  for (const su of [-1, 1]) {
    const pts = []; for (let k = 0; k <= 16; k++) { const v = -1 + k / 8; pts.push(new THREE.Vector3(su * ROOF.half, roofY(su, v), cz + v * ROOF.len)); }
    mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 24, 0.025, 6), M.gold, body, false);
  }
  { const pts = []; for (let k = 0; k <= 16; k++) { const v = -1 + k / 8; pts.push(new THREE.Vector3(0, roofY(0, v) + 0.02, cz + v * ROOF.len)); }
    mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 24, 0.04, 6), M.gold, body, false); }
  for (const sv of [-1, 1]) {
    const pts = []; for (let k = 0; k <= 12; k++) { const u = -1 + k / 6; pts.push(new THREE.Vector3(u * ROOF.half, roofY(u, sv) + 0.01, cz + sv * ROOF.len)); }
    mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 20, 0.03, 6), M.gold, body, false);
  }
  // roof posts at the corners of the cabin
  for (const x of [-hw + 0.04, hw - 0.04]) for (const z of [cz - hd + 0.04, cz + hd - 0.04]) mesh(box(0.06, ROOF.y - top + 0.05, 0.06, x, (top + ROOF.y) / 2, z), M.lacquer, body);
  // agemaki tassels hanging from the four corners of the roof
  for (const sx of [-1, 1]) for (const sv of [-1, 1]) {
    const x = sx * (ROOF.half - 0.08), z = cz + sv * (ROOF.len - 0.12), y = roofY(sx * 0.9, sv * 0.9);
    mesh(cyl(0.012, 0.2, x, y - 0.1, z, 4), M.purple, body, false);
    mesh(new THREE.SphereGeometry(0.05, 8, 6).translate(x, y - 0.22, z), M.purple, body, false);
    mesh(cyl(0.02, 0.22, x, y - 0.36, z, 8, 0.065), M.purple, body, false);
  }

  // ── the shafts (nagae), curving up a little at the tips, and the yoke ──
  for (const sx of [-1, 1]) {
    const x = sx * 0.42;
    const curve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(x, CAB.y0 + 0.05, cz + 0.2), new THREE.Vector3(x, CAB.y0 + 0.12, cz + hd + 0.3),
      new THREE.Vector3(x, CAB.y0 + 0.2, 1.2), new THREE.Vector3(x, CAB.y0 + 0.36, 1.68)]);
    mesh(new THREE.TubeGeometry(curve, 20, 0.045, 6), M.lacquer, body);
    mesh(new THREE.SphereGeometry(0.06, 8, 6).translate(x, CAB.y0 + 0.37, 1.69), M.gold, body, false);
  }
  mesh(box(1.04, 0.08, 0.1, 0, CAB.y0 + 0.24, 1.5), M.lacquer, body);              // yoke (kubiki)
  mesh(box(0.98, 0.06, 0.06, 0, CAB.y0 + 0.07, SMALL.z), M.lacquer, body);       // cross-tie over the steering wheels
  for (const sx of [-1, 1]) mesh(box(0.06, 0.1, 0.06, sx * 0.42, CAB.y0 + 0.13, SMALL.z), M.gold, body, false);

  // ── lamps: red beads at the back corners, a white bead to reverse ──
  cart.tailMat = new THREE.MeshStandardMaterial({ color: 0x5a0d0d, emissive: 0xff2a1a, emissiveIntensity: 0.25 });
  cart.reverseMat = new THREE.MeshStandardMaterial({ color: 0x444444, emissive: 0xfff1d6, emissiveIntensity: 0 });
  for (const sx of [-1, 1]) {
    mesh(new THREE.SphereGeometry(0.075, 12, 8).translate(sx * (hw - 0.12), CAB.y0 + 0.25, cz - hd - 0.05), cart.tailMat, body, false);
    mesh(cyl(0.05, 0.03, sx * (hw - 0.12), CAB.y0 + 0.34, cz - hd - 0.05, 8), M.gold, body, false);
  }
  mesh(new THREE.SphereGeometry(0.06, 10, 8).translate(0, CAB.y0 + 0.04, cz - hd - 0.12), cart.reverseMat, body, false);

  // ── the lantern: a hooked pole from the yoke, a paper chōchin hanging off it ──
  const poleCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0.38, CAB.y0 + 0.28, 1.5), new THREE.Vector3(0.38, CAB.y0 + 0.95, 1.52),
    new THREE.Vector3(0.38, CAB.y0 + 1.25, 1.62), new THREE.Vector3(0.38, CAB.y0 + 1.22, 1.78)]);
  mesh(new THREE.TubeGeometry(poleCurve, 16, 0.022, 6), M.lacquer, body);
  const lantern = new THREE.Group();
  {
    const r = 0.14, h = 0.32, cord = 0.08;
    const prof = []; for (let i = 0; i <= 12; i++) { const t = i / 12, a = (t - 0.5) * Math.PI; prof.push(new THREE.Vector2(Math.max(r * 0.45, Math.cos(a) * r), Math.sin(a) * h / 2)); }
    const paper = new THREE.Mesh(new THREE.LatheGeometry(prof, 14), M.lantern); paper.position.y = -cord - h / 2; lantern.add(paper);
    for (const y of [-cord, -cord - h]) { const c = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.55, r * 0.55, 0.04, 12), M.lacquer); c.position.y = y; lantern.add(c); }
    const s = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, cord, 4), M.lacquer); s.position.y = -cord / 2; lantern.add(s);
    const tassel = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 0.035, 0.14, 6), M.purple); tassel.position.y = -cord - h - 0.09; lantern.add(tassel);
  }
  lantern.position.set(0.38, CAB.y0 + 1.2, 1.78);
  body.add(lantern);
  cart.lantern = lantern;
  cart.lanternLight = new THREE.PointLight(0xFFD166, 1.2, 8);
  cart.lanternLight.position.set(0.38, CAB.y0 + 0.85, 1.85);
  body.add(cart.lanternLight);

  // ── wheels ──
  const wheel = (x, z, r, front, build) => {
    const wg = new THREE.Group();
    const spin = new THREE.Group();             // turns with the road; the group itself steers
    wg.add(spin);
    build(spin, wg, r);
    wg.position.set(x, r, z);
    wg.rotation.order = 'YXZ';
    Object.assign(wg.userData, { front, spin, radius: r });
    cart.group.add(wg);
    cart.wheels.push(wg);
  };
  const spoked = ({ spokes, tube, rimMat, spokeMat, hubMat, hubR, hubLen }) => (spin, wg, r) => {
    mesh(new THREE.TorusGeometry(r - tube, tube, 8, 36).rotateY(Math.PI / 2), rimMat, spin);
    mesh(new THREE.TorusGeometry(r - tube * 2.6, tube * 0.55, 6, 36).rotateY(Math.PI / 2), rimMat, spin);
    for (let i = 0; i < spokes; i++) mesh(cyl(0.02, (r - tube) * 2, 0, 0, 0, 5).rotateX((i / spokes) * Math.PI), spokeMat, spin);
    mesh(cyl(hubR, hubLen, 0, 0, 0, 12).rotateZ(Math.PI / 2), hubMat, spin);
    mergeStaticChildren(spin);
  };
  for (const sx of [-1, 1]) wheel(sx * BIG.x, BIG.z, BIG.r, false,
    spoked({ spokes: BIG.spokes, tube: 0.07, rimMat: M.lacquer, spokeMat: M.lacquer, hubMat: M.gold, hubR: 0.13, hubLen: 0.26 }));
  for (const sx of [-1, 1]) wheel(sx * SMALL.x, SMALL.z, SMALL.r, true, (spin, wg, r) => {
    spoked({ spokes: 6, tube: 0.035, rimMat: M.gold, spokeMat: M.lacquer, hubMat: M.gold, hubR: 0.05, hubLen: 0.12 })(spin, wg, r);
    // the steering fork turns with the wheel but doesn't spin: up from the axle to the cross-tie
    const inner = -sx * 0.07;
    mesh(box(0.04, CAB.y0 + 0.07 - r + 0.02, 0.05, inner, (CAB.y0 + 0.07 - r) / 2, 0), M.lacquer, wg);
    mesh(cyl(0.025, 0.1, 0, 0, 0, 6).rotateZ(Math.PI / 2).translate(inner / 2, 0, 0), M.gold, wg, false);
  });

  // where the rear (great) wheels touch the ground, for the ruts in the grass
  cart.trackOffsets = [[-BIG.x, BIG.z], [BIG.x, BIG.z]];

  // Fewer draw calls: bake the rigid body into one mesh per material. The
  // lantern and the wheel groups stay separate so they can sway, steer and spin.
  mergeStaticChildren(body);
}
