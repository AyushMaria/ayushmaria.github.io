/**
 * town-props.js — Large set-dressing built to the reference art
 *
 *   • gableRoofGeometry()   — steep two-slope roof with closed gable ends
 *   • buildCityWall()       — circular stone curtain wall, towers, gates (instanced)
 *   • buildClockTower()     — gothic landmark at the end of Main Street
 *   • buildTrees()          — leaf-card crowns per species (Bruno Simon's Foliage pattern)
 *   • buildBushes()         — same crowns, no trunk
 *   • buildWildFlowers()    — instanced flower clusters that sway with the wind
 *   • buildClouds()         — drifting cumulus sprites
 *   • buildMountains()      — pale peaks past the wall, fogged into the horizon
 *   • buildStall()          — market stall with a curved red-orange awning
 *
 * Each builder returns whatever the world needs to keep (colliders, tick
 * callbacks, tintable materials). Every mesh here reuses a handful of
 * shared materials — no per-object `new Mesh*Material()`.
 */

import * as THREE from 'three';
import { stoneTexture, roofTileTexture, cloudTexture, clockTexture, plasterTexture, leafClusterTexture } from './textures.js';
import { mergeBufferGeometries } from 'https://cdn.jsdelivr.net/npm/three@0.150.0/examples/jsm/utils/BufferGeometryUtils.js';
import { attachWind } from './wind.js';

// ── Shared materials ────────────────────────────────────────────
let _mats = null;
export function propMaterials() {
  if (_mats) return _mats;
  const stone = stoneTexture();
  const tile  = roofTileTexture();
  _mats = {
    stone:      new THREE.MeshStandardMaterial({ map: stone, color: 0xd9cdb5, roughness: 0.95 }),
    stoneDark:  new THREE.MeshStandardMaterial({ map: stone, color: 0xa89c86, roughness: 0.95 }),
    tile:       new THREE.MeshStandardMaterial({ map: tile,  color: 0xffffff, roughness: 0.8 }),
    tileDark:   new THREE.MeshStandardMaterial({ map: tile,  color: 0x9a7a70, roughness: 0.8 }),
    plaster:    new THREE.MeshStandardMaterial({ map: plasterTexture(), color: 0xffffff, roughness: 0.9 }),
    timber:     new THREE.MeshStandardMaterial({ color: 0x4a2c18, roughness: 0.95 }),
    woodDoor:   new THREE.MeshStandardMaterial({ color: 0x5c3a1e, roughness: 0.9 }),
    trunk:      new THREE.MeshStandardMaterial({ color: 0x6b4a2e, roughness: 0.95 }),
    canopy:     new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.85 }),  // instanceColor
    awning:     new THREE.MeshStandardMaterial({ color: 0xe86f2b, roughness: 0.75, side: THREE.DoubleSide }),
    awningRed:  new THREE.MeshStandardMaterial({ color: 0xd8462f, roughness: 0.75, side: THREE.DoubleSide }),
    mountain:   new THREE.MeshStandardMaterial({ color: 0x8aa3c4, roughness: 1, flatShading: true }),
    mountainSnow: new THREE.MeshStandardMaterial({ color: 0xe8eef5, roughness: 1, flatShading: true }),
    iron:       new THREE.MeshStandardMaterial({ color: 0x3a3a3a, roughness: 0.6, metalness: 0.6 }),
  };
  return _mats;
}

// ── Gable roof geometry ─────────────────────────────────────────
/**
 * Two-slope roof. Ridge runs along Z (gable triangles face ±Z) so a
 * building's front shows the classic Tudor gable. Groups: 0 = slopes
 * (tile material), 1 = gable ends (plaster).
 * @param w  width across the gable (X)
 * @param h  ridge height above eave
 * @param d  length along the ridge (Z)
 */
export function gableRoofGeometry(w, h, d) {
  const hw = w / 2, hd = d / 2;
  const pos = [], nrm = [], uv = [], idx = [];
  let n = 0;
  const quad = (a, b, c, dd, normal, uvs) => {
    pos.push(...a, ...b, ...c, ...dd);
    for (let i = 0; i < 4; i++) nrm.push(...normal);
    uv.push(...uvs);
    idx.push(n, n + 1, n + 2, n, n + 2, n + 3);
    n += 4;
  };
  const tri = (a, b, c, normal, uvs) => {
    pos.push(...a, ...b, ...c);
    for (let i = 0; i < 3; i++) nrm.push(...normal);
    uv.push(...uvs);
    idx.push(n, n + 1, n + 2);
    n += 3;
  };
  const slopeLen = Math.hypot(hw, h);
  const nx = h / slopeLen, ny = hw / slopeLen;
  // Right slope (+X) — counter-clockwise seen from outside (+X, +Y)
  quad([0, h, -hd], [0, h, hd], [hw, 0, hd], [hw, 0, -hd], [nx, ny, 0], [0, 1, 1, 1, 1, 0, 0, 0]);
  // Left slope (-X) — counter-clockwise seen from outside (-X, +Y)
  quad([0, h, hd], [0, h, -hd], [-hw, 0, -hd], [-hw, 0, hd], [-nx, ny, 0], [0, 1, 1, 1, 1, 0, 0, 0]);
  const slopeEnd = pos.length / 3;
  // Gable ends
  tri([-hw, 0, hd], [hw, 0, hd], [0, h, hd], [0, 0, 1], [0, 0, 1, 0, 0.5, 1]);
  tri([hw, 0, -hd], [-hw, 0, -hd], [0, h, -hd], [0, 0, -1], [0, 0, 1, 0, 0.5, 1]);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.addGroup(0, 12, 0);
  g.addGroup(12, 6, 1);
  void slopeEnd;
  return g;
}

// ── City wall ───────────────────────────────────────────────────
/**
 * Circular curtain wall with crenellations, round towers and gatehouses.
 * @returns {{ group, colliders, radius }}
 */
export function buildCityWall(scene, { radius = 63, height = 6, gates = ['east', 'west', 'south'], towers = 8 } = {}) {
  const M = propMaterials();
  const group = new THREE.Group();
  const colliders = [];

  const SEGS = 60;
  const segLen = (2 * Math.PI * radius) / SEGS + 0.35;   // slight overlap hides seams
  const thickness = 1.8;

  // Gate azimuths: south = +Z (0), east = +X (PI/2), north = -Z (PI), west = -X (-PI/2)
  const gateAngle = { south: 0, east: Math.PI / 2, north: Math.PI, west: -Math.PI / 2 };
  const gateHalfWidth = 5.2;                                // world units, at the wall line
  const isGateSpan = (a) => gates.some(g => {
    let d = a - gateAngle[g];
    d = Math.atan2(Math.sin(d), Math.cos(d));
    return Math.abs(d) * radius < gateHalfWidth;
  });

  // Wall segments
  const wallGeo = new THREE.BoxGeometry(segLen, height, thickness);
  const wall = new THREE.InstancedMesh(wallGeo, M.stone, SEGS);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), p = new THREE.Vector3(), s = new THREE.Vector3(1, 1, 1);
  let wi = 0;
  const merlonSlots = [];
  for (let i = 0; i < SEGS; i++) {
    const a = ((i + 0.5) / SEGS) * Math.PI * 2;
    if (isGateSpan(a)) continue;
    p.set(Math.sin(a) * radius, height / 2, Math.cos(a) * radius);
    q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), a);
    m.compose(p, q, s);
    wall.setMatrixAt(wi++, m);
    // 4 merlons per segment
    for (let k = 0; k < 4; k++) {
      const aa = ((i + (k + 0.5) / 4) / SEGS) * Math.PI * 2;
      merlonSlots.push(aa);
    }
  }
  wall.count = wi;
  wall.castShadow = true; wall.receiveShadow = true;
  group.add(wall);

  // Crenellations
  const merlonGeo = new THREE.BoxGeometry(1.1, 1.0, thickness + 0.2);
  const merlons = new THREE.InstancedMesh(merlonGeo, M.stoneDark, merlonSlots.length);
  merlonSlots.forEach((a, i) => {
    p.set(Math.sin(a) * radius, height + 0.5, Math.cos(a) * radius);
    q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), a);
    m.compose(p, q, s);
    merlons.setMatrixAt(i, m);
  });
  merlons.castShadow = true;
  group.add(merlons);

  // Towers: evenly spaced, plus a pair flanking every gate
  const towerAngles = [];
  for (let i = 0; i < towers; i++) {
    const a = (i / towers) * Math.PI * 2 + Math.PI / towers;   // offset so none lands on a gate
    if (!isGateSpan(a)) towerAngles.push(a);
  }
  gates.forEach(g => {
    const off = (gateHalfWidth + 1.6) / radius;
    towerAngles.push(gateAngle[g] - off, gateAngle[g] + off);
  });
  const tR = 2.4, tH = height + 4;
  const towerGeo = new THREE.CylinderGeometry(tR, tR + 0.3, tH, 14);
  const roofGeo  = new THREE.ConeGeometry(tR + 0.9, 4.2, 14);
  const towerMesh = new THREE.InstancedMesh(towerGeo, M.stone, towerAngles.length);
  const roofMesh  = new THREE.InstancedMesh(roofGeo,  M.tile,  towerAngles.length);
  towerAngles.forEach((a, i) => {
    p.set(Math.sin(a) * radius, tH / 2, Math.cos(a) * radius);
    q.identity();
    m.compose(p, q, s);
    towerMesh.setMatrixAt(i, m);
    p.y = tH + 2.1;
    m.compose(p, q, s);
    roofMesh.setMatrixAt(i, m);
    colliders.push({ circle: true, x: p.x, z: p.z, r: tR + 0.5 });
  });
  towerMesh.castShadow = true; roofMesh.castShadow = true;
  group.add(towerMesh, roofMesh);

  // Gatehouses: arch lintel + closed double doors (the wall's ring collider
  // keeps the cart inside, so the doors are drawn shut — no fake openings)
  const lintelGeo = new THREE.BoxGeometry(gateHalfWidth * 2 + 3.2, 2.6, thickness + 0.6);
  const doorGeo   = new THREE.BoxGeometry(gateHalfWidth * 2 - 0.4, height - 1.6, 0.5);
  const archGeo   = new THREE.TorusGeometry(gateHalfWidth - 0.2, 0.35, 8, 24, Math.PI);
  gates.forEach(g => {
    const a = gateAngle[g];
    const gh = new THREE.Group();
    gh.position.set(Math.sin(a) * radius, 0, Math.cos(a) * radius);
    gh.rotation.y = a;
    const lintel = new THREE.Mesh(lintelGeo, M.stone);
    lintel.position.y = height - 0.2;
    lintel.castShadow = true;
    gh.add(lintel);
    const door = new THREE.Mesh(doorGeo, M.woodDoor);
    door.position.y = (height - 1.6) / 2;
    gh.add(door);
    // iron bands on the door
    [0.3, 0.6].forEach(f => {
      const band = new THREE.Mesh(new THREE.BoxGeometry(gateHalfWidth * 2 - 0.6, 0.18, 0.6), M.iron);
      band.position.y = (height - 1.6) * f;
      gh.add(band);
    });
    const arch = new THREE.Mesh(archGeo, M.stoneDark);
    arch.position.y = height - 1.4;
    gh.add(arch);
    group.add(gh);
  });

  scene.add(group);
  // Stay inside the wall (inner face minus cart half-width)
  colliders.push({ ring: true, r: radius - thickness / 2 - 0.4 });
  return { group, colliders, radius };
}

// ── Clock tower ─────────────────────────────────────────────────
/**
 * Gothic stone clock tower (reference landmark). ~9 meshes.
 * @returns {{ group, collider, tick }}
 */
export function buildClockTower(scene, x, z, { base = 6, height = 22 } = {}) {
  const M = propMaterials();
  const g = new THREE.Group();
  g.position.set(x, 0, z);

  const shaft = new THREE.Mesh(new THREE.BoxGeometry(base, height, base), M.stone);
  shaft.position.y = height / 2;
  shaft.castShadow = true; shaft.receiveShadow = true;
  g.add(shaft);

  // Corner buttresses
  const bGeo = new THREE.BoxGeometry(0.9, height * 0.7, 0.9);
  [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(([sx, sz]) => {
    const b = new THREE.Mesh(bGeo, M.stoneDark);
    b.position.set(sx * (base / 2 + 0.2), height * 0.35, sz * (base / 2 + 0.2));
    g.add(b);
  });

  // Tall arched window slits (dark) on each face
  const slitGeo = new THREE.BoxGeometry(0.7, 4.5, 0.2);
  const slitMat = M.timber;
  for (let f = 0; f < 4; f++) {
    const s = new THREE.Mesh(slitGeo, slitMat);
    const a = (f / 4) * Math.PI * 2;
    s.position.set(Math.sin(a) * (base / 2 + 0.05), height * 0.45, Math.cos(a) * (base / 2 + 0.05));
    s.rotation.y = a;
    g.add(s);
  }

  // Clock stage
  const stageH = 5;
  const stage = new THREE.Mesh(new THREE.BoxGeometry(base + 0.8, stageH, base + 0.8), M.stoneDark);
  stage.position.y = height + stageH / 2;
  stage.castShadow = true;
  g.add(stage);
  const faceMat = new THREE.MeshStandardMaterial({ map: clockTexture(), roughness: 0.6, emissive: 0xffd58a, emissiveMap: clockTexture(), emissiveIntensity: 0.15 });
  const faceGeo = new THREE.PlaneGeometry(3.6, 3.6);
  for (let f = 0; f < 4; f++) {
    const face = new THREE.Mesh(faceGeo, faceMat);
    const a = (f / 4) * Math.PI * 2;
    face.position.set(Math.sin(a) * (base / 2 + 0.42), height + stageH / 2, Math.cos(a) * (base / 2 + 0.42));
    face.rotation.y = a;
    g.add(face);
  }

  // Spire + four pinnacles
  const spire = new THREE.Mesh(new THREE.ConeGeometry(base * 0.62, 11, 8), M.tileDark);
  spire.position.y = height + stageH + 5.5;
  spire.rotation.y = Math.PI / 8;
  spire.castShadow = true;
  g.add(spire);
  const pinGeo = new THREE.ConeGeometry(0.55, 3, 6);
  [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(([sx, sz]) => {
    const pin = new THREE.Mesh(pinGeo, M.tileDark);
    pin.position.set(sx * (base / 2 + 0.2), height + stageH + 1.5, sz * (base / 2 + 0.2));
    g.add(pin);
  });
  // Finial glint
  const finial = new THREE.Mesh(new THREE.SphereGeometry(0.35, 8, 8),
    new THREE.MeshStandardMaterial({ color: 0xffd166, emissive: 0xffd166, emissiveIntensity: 0.6 }));
  finial.position.y = height + stageH + 11.3;
  g.add(finial);

  scene.add(g);
  return {
    group: g,
    collider: new THREE.Box3(
      new THREE.Vector3(x - base / 2 - 0.6, 0, z - base / 2 - 0.6),
      new THREE.Vector3(x + base / 2 + 0.6, height, z + base / 2 + 0.6)),
    faceMat,
  };
}

// ── Living vegetation (Bruno Simon's Foliage / Trees / Bushes / Flowers) ─
//
// A crown is ~80 leaf cards scattered inside a unit sphere and merged into
// ONE geometry; every tree of a species is an instance of it. The leaf
// shape comes from an alpha texture, the wind rotates that texture's UV
// (flutter) and nudges the top of the crown, and colour is two-tone against
// the sun. Species differ only by palette — one InstancedMesh per species.

function seededRng(seed) {
  let s = seed >>> 0;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
}

/** Bruno's colour pairs (colorA → colorB). tint = B / A, applied on the lit side. */
export const SPECIES = {
  oak:    { a: 0xb4b536, tint: [1.20, 1.14, 1.09] },   // #b4b536 → #d8cf3b
  birch:  { a: 0xff4f2b, tint: [1.00, 1.82, 1.47] },   // #ff4f2b → #ff903f
  cherry: { a: 0xff6d6d, tint: [1.00, 1.40, 1.32] },   // #ff6d6d → #ff9990
  green:  { a: 0x4f9b3c, tint: [1.65, 1.30, 1.40] },   // our own evergreen-ish green
};

/**
 * Port of Foliage.setGeometry(): `count` cards of `cardSize` on a sphere,
 * radius 1 - rng³ (dense at the rim), random roll, normals lerped 85 %
 * toward the sphere normal so the crown shades like a ball.
 */
export function crownGeometry(count = 80, cardSize = 0.8, seed = 1) {
  const rng = seededRng(seed);
  const planes = [];
  const n = new THREE.Vector3(), v = new THREE.Vector3();
  for (let i = 0; i < count; i++) {
    const plane = new THREE.PlaneGeometry(cardSize, cardSize);
    const pos = new THREE.Vector3().setFromSpherical(
      new THREE.Spherical(1 - Math.pow(rng(), 3), Math.PI * 2 * rng(), Math.PI * rng()));
    plane.rotateZ(rng() * 9999);
    // tilt the card a little toward its sphere normal so the crown has depth
    plane.lookAt(pos.clone().normalize().multiplyScalar(2).add(new THREE.Vector3((rng() - 0.5) * 0.6, (rng() - 0.5) * 0.6, (rng() - 0.5) * 0.6)));
    plane.translate(pos.x, pos.y, pos.z);
    n.copy(pos).normalize();
    const p = plane.attributes.position, nrm = plane.attributes.normal;
    for (let k = 0; k < 4; k++) {
      v.fromBufferAttribute(p, k).lerp(n, 0.85).normalize();
      nrm.setXYZ(k, v.x, v.y, v.z);
    }
    planes.push(plane);
  }
  return mergeBufferGeometries(planes, false);
}

let _crownGeo = null, _crownGeoLow = null;
function crownGeoFor(cards) {
  if (cards <= 48) return _crownGeoLow || (_crownGeoLow = crownGeometry(cards, 0.8, 3));
  return _crownGeo || (_crownGeo = crownGeometry(cards, 0.62, 1));
}

const speciesMats = new Map();
function speciesMaterial(key, sunDir) {
  if (!speciesMats.has(key)) {
    const sp = SPECIES[key] || SPECIES.green;
    const mat = new THREE.MeshStandardMaterial({
      color: 0xffffff,                     // × instanceColor = colorA
      alphaMap: leafClusterTexture(), alphaTest: 0.3, side: THREE.DoubleSide,
      roughness: 0.9, metalness: 0,
    });
    attachWind(mat, { mode: 'leaf', amplitude: 0.35, yOffset: 0.2, sunDir, tint: sp.tint, flutter: 2.2 });
    speciesMats.set(key, mat);
  }
  return speciesMats.get(key);
}

/** All materials the world must refresh each frame (sun dir in view space). */
export function foliageMaterials() { return [...speciesMats.values()]; }

/**
 * Trees: instanced trunks + one leaf-card InstancedMesh per species.
 * @param places [[x, z, scale, species], ...]
 */
export function buildTrees(scene, places, { sunDir, cards = 80 } = {}) {
  const M = propMaterials();
  const trunkGeo = new THREE.CylinderGeometry(0.16, 0.28, 2.2, 7);
  const trunks = new THREE.InstancedMesh(trunkGeo, M.trunk, places.length);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), p = new THREE.Vector3(), s = new THREE.Vector3();
  const col = new THREE.Color();
  const colliders = [];

  // group by species
  const bySpecies = new Map();
  places.forEach(([x, z, sc = 1, species = 'green'], i) => {
    p.set(x, 1.1 * sc, z); s.set(sc, sc, sc); q.identity();
    m.compose(p, q, s); trunks.setMatrixAt(i, m);
    if (!bySpecies.has(species)) bySpecies.set(species, []);
    bySpecies.get(species).push([x, z, sc, i]);
    colliders.push({ circle: true, x, z, r: 0.55 * sc });
  });
  trunks.castShadow = true;
  trunks.instanceMatrix.needsUpdate = true;
  scene.add(trunks);

  const geo = crownGeoFor(cards);
  const crowns = [];
  for (const [species, list] of bySpecies) {
    const sp = SPECIES[species] || SPECIES.green;
    const mesh = new THREE.InstancedMesh(geo, speciesMaterial(species, sunDir), list.length);
    list.forEach(([x, z, sc, i], k) => {
      const r = 1.9 * sc;                 // crown radius
      p.set(x, 2.2 * sc + r * 0.55, z);
      s.set(r, r * 0.92, r);
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), (i * 2.399) % (Math.PI * 2));
      m.compose(p, q, s);
      mesh.setMatrixAt(k, m);
      // subtle per-tree variation around colorA
      col.setHex(sp.a).offsetHSL(((i * 37) % 10 - 5) * 0.004, 0, ((i * 53) % 10 - 5) * 0.012);
      mesh.setColorAt(k, col);
    });
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.castShadow = true; mesh.receiveShadow = true;
    mesh.frustumCulled = false;           // merged cards have no tidy bounds
    scene.add(mesh);
    crowns.push(mesh);
  }
  return { trunks, crowns, colliders };
}

/**
 * Bushes: the same crown geometry/material with no trunk, sitting on the
 * ground. `places` = [[x, z, scale, species], ...]
 */
export function buildBushes(scene, places, { sunDir, cards = 80, colliders: wantColliders = true } = {}) {
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), p = new THREE.Vector3(), s = new THREE.Vector3();
  const col = new THREE.Color();
  const colliders = [];
  const bySpecies = new Map();
  places.forEach(([x, z, sc = 0.7, species = 'green'], i) => {
    if (!bySpecies.has(species)) bySpecies.set(species, []);
    bySpecies.get(species).push([x, z, sc, i]);
    if (wantColliders && sc >= 0.6) colliders.push({ circle: true, x, z, r: sc * 0.9 });
  });
  const geo = crownGeoFor(cards);
  const meshes = [];
  for (const [species, list] of bySpecies) {
    const sp = SPECIES[species] || SPECIES.green;
    const mesh = new THREE.InstancedMesh(geo, speciesMaterial(species, sunDir), list.length);
    list.forEach(([x, z, sc, i], k) => {
      p.set(x, sc * 0.75, z);
      s.set(sc, sc * 0.8, sc);
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), (i * 1.7) % (Math.PI * 2));
      m.compose(p, q, s);
      mesh.setMatrixAt(k, m);
      col.setHex(sp.a).offsetHSL(((i * 29) % 10 - 5) * 0.004, 0, ((i * 41) % 10 - 5) * 0.015);
      mesh.setColorAt(k, col);
    });
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.castShadow = true; mesh.receiveShadow = true;
    mesh.frustumCulled = false;
    scene.add(mesh);
    meshes.push(mesh);
  }
  return { meshes, colliders };
}

/**
 * Wild flowers (port of Flowers.js): 8 petal cards per flower, 3–10
 * flowers per cluster, one InstancedMesh, heads sway with the wind.
 * @param clusters [[x, z], ...]
 */
export function buildWildFlowers(scene, clusters, { palette = [0xffffff, 0xffd166, 0xff6d6d, 0xc77dff, 0xff9f43] } = {}) {
  const rng = seededRng(99);
  // flower geometry: 8 tiny cards facing outward around a stem top
  const planes = [];
  for (let i = 0; i < 8; i++) {
    const plane = new THREE.PlaneGeometry(0.14, 0.14);
    const dir = new THREE.Vector3().setFromSpherical(new THREE.Spherical(1, Math.PI * 0.25 * rng(), Math.PI * 2 * rng()));
    const pos = dir.clone().setLength(0.22 + (rng() - 0.5) * 0.1);
    pos.y += 0.32;
    const mat = new THREE.Matrix4().lookAt(dir, new THREE.Vector3(), new THREE.Vector3(0, 1, 0));
    mat.setPosition(pos);
    plane.applyMatrix4(mat);
    planes.push(plane);
  }
  // stem
  const stem = new THREE.PlaneGeometry(0.03, 0.34);
  stem.translate(0, 0.17, 0);
  planes.push(stem);
  const geo = mergeBufferGeometries(planes, false);
  geo.deleteAttribute('uv');

  const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, side: THREE.DoubleSide, roughness: 0.9 });
  attachWind(mat, { mode: 'vertex', amplitude: 0.5, yOffset: 0.7 });

  const transforms = [], colors = [];
  clusters.forEach(([cx, cz]) => {
    const n = 3 + Math.floor(rng() * 8);
    const c = palette[Math.floor(rng() * palette.length)];
    for (let j = 0; j < n; j++) {
      const o = new THREE.Object3D();
      o.position.set(cx + (rng() - 0.5) * 3, 0, cz + (rng() - 0.5) * 3);
      o.rotation.y = Math.PI * 2 * rng();
      o.scale.setScalar(0.7 + rng() * 0.5);
      o.updateMatrix();
      transforms.push(o.matrix);
      colors.push(rng() < 0.7 ? c : palette[Math.floor(rng() * palette.length)]);
    }
  });
  const mesh = new THREE.InstancedMesh(geo, mat, transforms.length);
  const col = new THREE.Color();
  transforms.forEach((t, i) => { mesh.setMatrixAt(i, t); mesh.setColorAt(i, col.setHex(colors[i])); });
  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  mesh.castShadow = true;
  mesh.frustumCulled = false;
  scene.add(mesh);
  return mesh;
}

// ── Clouds ──────────────────────────────────────────────────────
/** @returns {{ material, tick }} — material is tinted by DayCycle */
export function buildClouds(scene, count = 10, { radius = 130, reducedMotion = false } = {}) {
  const material = new THREE.SpriteMaterial({ map: cloudTexture(), transparent: true, depthWrite: false, opacity: 0.92 });
  const sprites = [];
  for (let i = 0; i < count; i++) {
    const sp = new THREE.Sprite(material);
    const a = (i / count) * Math.PI * 2 + (i % 3) * 0.4;
    const r = radius * (0.55 + ((i * 37) % 10) / 22);
    const w = 34 + ((i * 53) % 10) * 3;
    sp.scale.set(w, w * 0.5, 1);
    sp.position.set(Math.sin(a) * r, 42 + ((i * 29) % 10) * 2.2, Math.cos(a) * r);
    sprites.push({ sp, a, r, speed: 0.004 + ((i * 11) % 5) * 0.0015 });
    scene.add(sp);
  }
  const tick = (delta) => {
    if (reducedMotion) return;
    for (const c of sprites) {
      c.a += c.speed * delta;
      c.sp.position.x = Math.sin(c.a) * c.r;
      c.sp.position.z = Math.cos(c.a) * c.r;
    }
  };
  return { material, tick };
}

// ── Mountains ───────────────────────────────────────────────────
export function buildMountains(scene, { radius = 118 } = {}) {
  const M = propMaterials();
  const group = new THREE.Group();
  const peaks = [
    [0.15, 40, 44], [0.55, 32, 34], [0.95, 46, 52], [1.5, 30, 30], [2.05, 38, 40],
    [2.6, 44, 50], [3.1, 34, 36], [3.65, 42, 46], [4.2, 30, 32], [4.7, 40, 42], [5.25, 36, 38], [5.8, 46, 54],
  ];
  const geo = new THREE.ConeGeometry(1, 1, 7, 1);
  peaks.forEach(([a, r, h], i) => {
    const rr = radius + (i % 3) * 14;
    const peak = new THREE.Mesh(geo, M.mountain);
    peak.position.set(Math.sin(a) * rr, h / 2 - 1, Math.cos(a) * rr);
    peak.scale.set(r, h, r);
    peak.rotation.y = a;
    group.add(peak);
    // snow cap
    const cap = new THREE.Mesh(geo, M.mountainSnow);
    cap.position.set(peak.position.x, h * 0.78 + h * 0.11 - 1, peak.position.z);
    cap.scale.set(r * 0.22, h * 0.22, r * 0.22);
    cap.rotation.y = a;
    group.add(cap);
  });
  scene.add(group);
  return group;
}

// ── Market stall with curved awning ─────────────────────────────
export function buildStall(scene, x, z, rotY, { red = false } = {}) {
  const M = propMaterials();
  const g = new THREE.Group();
  const table = new THREE.Mesh(new THREE.BoxGeometry(3.2, 0.12, 1.6), M.woodDoor);
  table.position.y = 0.85;
  table.castShadow = true;
  g.add(table);
  const skirt = new THREE.Mesh(new THREE.BoxGeometry(3.0, 0.7, 1.4), M.timber);
  skirt.position.y = 0.42;
  g.add(skirt);
  const legGeo = new THREE.CylinderGeometry(0.05, 0.05, 2.4, 6);
  [-1.5, 1.5].forEach(lx => [-0.7, 0.7].forEach(lz => {
    const leg = new THREE.Mesh(legGeo, M.timber);
    leg.position.set(lx, 1.2, lz);
    g.add(leg);
  }));
  // Curved awning: a quarter-cylinder shell, scalloped edge implied by the curve
  const awningGeo = new THREE.CylinderGeometry(1.4, 1.4, 3.8, 12, 1, true, 0, Math.PI * 0.62);
  const awning = new THREE.Mesh(awningGeo, red ? M.awningRed : M.awning);
  awning.rotation.z = Math.PI / 2;
  awning.rotation.y = Math.PI * 0.05;
  awning.position.set(0, 2.15, 0.35);
  awning.castShadow = true;
  g.add(awning);
  // Goods: a few crates and a fruit basket
  const crateGeo = new THREE.BoxGeometry(0.5, 0.4, 0.5);
  [[-1.0, 0.0], [-0.4, -0.2], [0.6, 0.1]].forEach(([cx, cz], i) => {
    const crate = new THREE.Mesh(crateGeo, i === 1 ? M.trunk : M.woodDoor);
    crate.position.set(cx, 1.11, cz);
    g.add(crate);
  });
  g.position.set(x, 0, z);
  g.rotation.y = rotY;
  scene.add(g);
  return { group: g, collider: { circle: true, x, z, r: 1.9 } };
}

// ── Three-tier stone fountain ───────────────────────────────────
/**
 * Classic tiered fountain: a round stone-rimmed pool, a fluted pedestal and
 * three stacked bowls (large → small) with a finial jet on top. Water spills
 * from each bowl rim as a translucent "sheet" plus falling droplets.
 *
 * Returns { group, water (pool disc — use for audio / shimmer), collider }.
 */
export function buildFountain(scene, particleSystem, { x = 0, z = 0, particles = 120 } = {}) {
  const g = new THREE.Group();
  g.position.set(x, 0, z);

  const marble = new THREE.MeshStandardMaterial({ map: stoneTexture(), color: 0xf3eee3, roughness: 0.7 });
  const marbleDark = new THREE.MeshStandardMaterial({ map: stoneTexture(), color: 0xd9d2c4, roughness: 0.8 });
  const waterMat = new THREE.MeshStandardMaterial({
    color: 0x5fcbf5, transparent: true, opacity: 0.72, roughness: 0.08, metalness: 0.25,
  });
  const sheetMat = new THREE.MeshStandardMaterial({
    color: 0xbfe9ff, transparent: true, opacity: 0.22, roughness: 0.1, metalness: 0.1,
    side: THREE.DoubleSide, depthWrite: false,
  });

  const add = (mesh, y = 0, cast = true) => {
    mesh.position.y = y; mesh.castShadow = cast; mesh.receiveShadow = true; g.add(mesh); return mesh;
  };

  // Pool: outer rim ring + floor + water disc
  const POOL_R = 3.6, RIM_W = 0.5, RIM_H = 0.7;
  const rimProfile = [
    new THREE.Vector2(POOL_R - RIM_W, 0),
    new THREE.Vector2(POOL_R,         0),
    new THREE.Vector2(POOL_R + 0.05,  RIM_H * 0.6),
    new THREE.Vector2(POOL_R,         RIM_H),
    new THREE.Vector2(POOL_R - RIM_W, RIM_H),
    new THREE.Vector2(POOL_R - RIM_W, 0),
  ];
  add(new THREE.Mesh(new THREE.LatheGeometry(rimProfile, 40), marbleDark), 0.05);
  add(new THREE.Mesh(new THREE.CylinderGeometry(POOL_R - RIM_W + 0.02, POOL_R - RIM_W + 0.02, 0.12, 40), marbleDark), 0.11, false);
  const water = add(new THREE.Mesh(new THREE.CircleGeometry(POOL_R - RIM_W, 40), waterMat), 0.4, false);
  water.rotation.x = -Math.PI / 2;

  // Pedestal: plinth + fluted column
  add(new THREE.Mesh(new THREE.CylinderGeometry(0.85, 1.0, 0.35, 12), marble), 0.3);
  add(new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.52, 1.2, 10), marble), 1.05);

  // Bowls (bottom → top): [inner radius, y of rim, depth, stem radius, stem height]
  const TIERS = [
    { r: 1.95, y: 1.75, depth: 0.55, stemR: 0.30, stemH: 1.15 },
    { r: 1.20, y: 3.20, depth: 0.42, stemR: 0.22, stemH: 0.95 },
    { r: 0.62, y: 4.35, depth: 0.30, stemR: 0.16, stemH: 0.55 },
  ];
  const bowlMat = marble.clone(); bowlMat.side = THREE.DoubleSide;
  const bowlGeo = (r, depth) => {
    // inner surface: centre-bottom (0,0) curving up to the rim (r, depth),
    // then a rolled lip and the outer skin back down to the stem.
    const pts = [];
    const n = 9;
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      pts.push(new THREE.Vector2(r * t, depth * t * t));
    }
    pts.push(new THREE.Vector2(r + 0.12, depth + 0.02));
    pts.push(new THREE.Vector2(r + 0.14, depth - 0.12));
    pts.push(new THREE.Vector2(r * 0.55, -0.05));
    pts.push(new THREE.Vector2(0, -0.05));
    return new THREE.LatheGeometry(pts, 36);
  };

  TIERS.forEach((t, i) => {
    const bowlBottom = t.y - t.depth;
    // stem beneath this bowl
    add(new THREE.Mesh(new THREE.CylinderGeometry(t.stemR, t.stemR * 1.25, t.stemH, 10), marble), bowlBottom - t.stemH / 2 + 0.05);
    // bowl
    add(new THREE.Mesh(bowlGeo(t.r, t.depth), bowlMat), bowlBottom);
    // water in the bowl
    const w = add(new THREE.Mesh(new THREE.CircleGeometry(t.r - 0.03, 36), waterMat), t.y - 0.05, false);
    w.rotation.x = -Math.PI / 2;
    // translucent water sheet spilling from the rim
    const below = i === 0 ? 0.4 : TIERS[i - 1].y - 0.05;
    const sheetH = t.y - below;
    const sheet = new THREE.Mesh(new THREE.CylinderGeometry(t.r + 0.13, t.r + 0.22, sheetH, 36, 1, true), sheetMat);
    add(sheet, below + sheetH / 2, false);
    // falling droplets
    if (particleSystem) {
      particleSystem.createFountainFall(new THREE.Vector3(x, t.y + 0.02, z), t.r + 0.14, Math.round(particles * 0.45), sheetH, 6.0);
    }
  });

  // Finial + jet
  const top = TIERS[TIERS.length - 1];
  add(new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.13, 0.45, 8), marble), top.y + 0.2);
  add(new THREE.Mesh(new THREE.ConeGeometry(0.2, 0.55, 10), marbleDark), top.y + 0.68);
  if (particleSystem) {
    particleSystem.createFountainSpray(new THREE.Vector3(x, top.y + 0.95, z), particles,
      { up: 2.4, upVar: 0.8, spread: 0.35, size: 11.0, gravity: 6.0 });
  }

  scene.add(g);
  return { group: g, water, collider: { circle: true, x, z, r: POOL_R + 0.3 } };
}
