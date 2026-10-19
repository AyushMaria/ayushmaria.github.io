/**
 * town-props.js — Large set-dressing built to the reference art
 *
 *   • gableRoofGeometry()   — steep two-slope roof with closed gable ends
 *   • buildPathWall()       — town wall following a path over the hill: towers, gate, water gate
 *   • buildTownhouses()     — instanced filler townhouses lining the streets
 *   • buildMillWheel()      — the turning water wheel behind the mill
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
import { standardMat, withOcclusionCut } from './materials.js';
import { seg as segCollider } from './colliders.js';

// ── Shared materials ────────────────────────────────────────────
let _mats = null;
export function propMaterials() {
  if (_mats) return _mats;
  const stone = stoneTexture();
  const tile  = roofTileTexture();
  _mats = {
    stone:      standardMat({ map: stone, color: 0xd9cdb5, roughness: 0.95 }),
    stoneDark:  standardMat({ map: stone, color: 0xa89c86, roughness: 0.95 }),
    tile:       standardMat({ map: tile,  color: 0xffffff, roughness: 0.8 }),
    tileDark:   standardMat({ map: tile,  color: 0x9a7a70, roughness: 0.8 }),
    plaster:    standardMat({ map: plasterTexture(), color: 0xffffff, roughness: 0.9 }),
    timber:     standardMat({ color: 0x4a2c18, roughness: 0.95 }),
    woodDoor:   standardMat({ color: 0x5c3a1e, roughness: 0.9 }),
    trunk:      standardMat({ color: 0x6b4a2e, roughness: 0.95 }),
    canopy:     standardMat({ color: 0xffffff, roughness: 0.85 }),  // instanceColor
    awning:     standardMat({ color: 0xe86f2b, roughness: 0.75, side: THREE.DoubleSide }),
    awningRed:  standardMat({ color: 0xd8462f, roughness: 0.75, side: THREE.DoubleSide }),
    mountain:   standardMat({ color: 0x8aa3c4, roughness: 1, flatShading: true }),
    mountainSnow: standardMat({ color: 0xe8eef5, roughness: 1, flatShading: true }),
    iron:       standardMat({ color: 0x3a3a3a, roughness: 0.6, metalness: 0.6 }),
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

/** Box UVs in world units (so stone blocks keep their size on long boxes). */
function boxUV(geo, unit = 2) {
  const pos = geo.attributes.position, nrm = geo.attributes.normal, uv = geo.attributes.uv;
  for (let i = 0; i < pos.count; i++) {
    const ax = Math.abs(nrm.getX(i)), ay = Math.abs(nrm.getY(i));
    const [u, v] = ax > 0.5 ? [pos.getZ(i), pos.getY(i)] : ay > 0.5 ? [pos.getX(i), pos.getZ(i)] : [pos.getX(i), pos.getY(i)];
    uv.setXY(i, u / unit, v / unit);
  }
  uv.needsUpdate = true;
  return geo;
}

// ── Town wall ───────────────────────────────────────────────────
/**
 * Curtain wall that follows a closed path over the hill (town-layout.js):
 * short straight runs that step with the ground, crenellations, round
 * towers, an open gatehouse where the High Street passes through and a
 * barred water gate where the stream leaves town. Instanced: a handful of
 * draw calls for the whole wall. Its materials take part in the occlusion
 * cut so the cart shows through when the wall is between it and the camera.
 *
 * @param {object} L  buildLayout() result (wall path, gaps, groundAt)
 * @returns {{ group, colliders }}
 */
export function buildPathWall(scene, L) {
  const M = propMaterials();
  const stone = withOcclusionCut(M.stone.clone());
  const stoneDark = withOcclusionCut(M.stoneDark.clone());
  const tile = withOcclusionCut(M.tile.clone());
  const group = new THREE.Group();
  group.name = 'town-wall';
  const colliders = [];
  const W = L.wall, H = W.height, T = W.thickness, ground = L.groundAt;
  const P = W.coarse.pts, total = W.coarse.length;

  // runs: one box per coarse segment that isn't in a gap
  const runs = [];
  for (let i = 0; i < P.length; i++) {
    const a = P[i], b = P[(i + 1) % P.length];
    const sMid = (a.s + (b.s < a.s ? total : b.s)) / 2 % total;
    if (L.wallGap(sMid) || L.wallGap(a.s) || L.wallGap(b.s)) continue;
    const ga = ground(a.x, a.z), gb = ground(b.x, b.z);
    runs.push({ a, b, top: (ga + gb) / 2 + H, bottom: Math.min(ga, gb) - 1.6 });
  }
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), p = new THREE.Vector3(), sc = new THREE.Vector3();
  const Y = new THREE.Vector3(0, 1, 0);
  const box = new THREE.BoxGeometry(1, 1, 1);
  const walls = new THREE.InstancedMesh(box, stone, runs.length);
  const merlons = new THREE.InstancedMesh(new THREE.BoxGeometry(1.1, 1.0, T + 0.2), stoneDark, runs.length);
  runs.forEach((r, i) => {
    const dx = r.b.x - r.a.x, dz = r.b.z - r.a.z, len = Math.hypot(dx, dz);
    q.setFromAxisAngle(Y, Math.atan2(-dz, dx));
    m.compose(p.set((r.a.x + r.b.x) / 2, (r.top + r.bottom) / 2, (r.a.z + r.b.z) / 2), q, sc.set(len + 0.35, r.top - r.bottom, T));
    walls.setMatrixAt(i, m);
    m.compose(p.setY(r.top + 0.5), q, sc.set(1, 1, 1));
    merlons.setMatrixAt(i, m);
    colliders.push(segCollider(r.a.x, r.a.z, r.b.x, r.b.z, T / 2 + 0.25));
  });
  walls.castShadow = walls.receiveShadow = true;
  merlons.castShadow = true;
  group.add(walls, merlons);

  const pointAt = (s) => {
    const k = W.path.pts.length, i = Math.round((((s % total) + total) % total) / total * k) % k;
    return W.path.pts[i];
  };
  // towers: every ~17 units, not in or right beside a gap; a pair at each gate
  const tR = 2.4;
  const towerAt = [];
  const nearGap = (s, pad) => W.gaps.some(g => { let d = Math.abs(s - g.s); d = Math.min(d, total - d); return d < g.half + pad; });
  const clearOfRoads = (s) => { const c = pointAt(s); return !L.roadClear || L.roadClear(c.x, c.z) > tR + 0.6; };
  for (let s = 6; s < total - 4; s += 17) {
    if (nearGap(s, 4)) continue;
    // a tower must not stand in a street: try a little either side, else skip it
    const ok = [0, 3, -3, 6, -6].map(d => s + d).find(clearOfRoads);
    if (ok !== undefined) towerAt.push(ok);
  }
  for (const g of W.gaps) if (g.kind === 'gate') towerAt.push((g.s - g.half - 2.2 + total) % total, (g.s + g.half + 2.2) % total);
  const towerGeo = new THREE.CylinderGeometry(tR, tR + 0.3, 1, 14);
  const roofGeo = new THREE.ConeGeometry(tR + 0.9, 4.2, 14);
  const towers = new THREE.InstancedMesh(towerGeo, stone, towerAt.length);
  const roofs = new THREE.InstancedMesh(roofGeo, tile, towerAt.length);
  towerAt.forEach((s, i) => {
    const c = pointAt(s);
    let lo = Infinity;
    for (let a = 0; a < 6; a++) lo = Math.min(lo, ground(c.x + Math.cos(a) * tR, c.z + Math.sin(a) * tR));
    const g0 = ground(c.x, c.z), topY = g0 + H + 4, base = lo - 1.5;
    m.compose(p.set(c.x, (topY + base) / 2, c.z), q.identity(), sc.set(1, topY - base, 1));
    towers.setMatrixAt(i, m);
    m.compose(p.set(c.x, topY + 2.1, c.z), q.identity(), sc.set(1, 1, 1));
    roofs.setMatrixAt(i, m);
    colliders.push({ circle: true, x: c.x, z: c.z, r: tR + 0.5 });
  });
  towers.castShadow = roofs.castShadow = true;
  towers.receiveShadow = true;
  group.add(towers, roofs);

  // gatehouse (open) and water gate (barred) spanning each gap
  for (const g of W.gaps) {
    const c = pointAt(g.s);
    const gh = new THREE.Group();
    const y0 = g.kind === 'gate' ? ground(g.x, g.z) : Math.max(ground(pointAt(g.s - g.half).x, pointAt(g.s - g.half).z), ground(pointAt(g.s + g.half).x, pointAt(g.s + g.half).z)) - 0.4;
    gh.position.set(g.x, y0, g.z);
    gh.rotation.y = Math.atan2(-c.tz, c.tx);       // local x along the wall
    const span = g.half * 2 + 1.6;
    const lintel = new THREE.Mesh(boxUV(new THREE.BoxGeometry(span, 2.4, T + 0.6), 2.2), stone);
    lintel.position.y = H - 0.1;
    lintel.castShadow = true;
    gh.add(lintel);
    const crenel = new THREE.Mesh(boxUV(new THREE.BoxGeometry(span, 0.9, T + 0.8), 2.2), stoneDark);
    crenel.position.y = H + 1.5;
    gh.add(crenel);
    const arch = new THREE.Mesh(new THREE.TorusGeometry(g.half - 0.25, 0.35, 8, 24, Math.PI), stoneDark);
    arch.position.y = H - 1.4 - (g.half - 0.25) * 0.15;
    arch.scale.y = 0.5;
    gh.add(arch);
    if (g.kind === 'water') {
      // portcullis bars down into the water
      const bars = [];
      for (let x = -g.half + 0.4; x <= g.half - 0.4; x += 0.45) bars.push(x);
      const barMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(0.09, H - 0.4, 0.09), M.iron, bars.length);
      bars.forEach((x, i) => { m.compose(p.set(x, (H - 1.3) / 2 - 0.2, 0), q.identity(), sc.set(1, 1, 1)); barMesh.setMatrixAt(i, m); });
      gh.add(barMesh);
      const a = pointAt(g.s - g.half), b = pointAt(g.s + g.half);
      colliders.push(segCollider(a.x, a.z, b.x, b.z, 0.5));
    }
    group.add(gh);
  }
  scene.add(group);
  return { group, colliders };
}

// ── Clock tower ─────────────────────────────────────────────────
/**
 * Gothic stone clock tower (reference landmark). ~9 meshes.
 * @returns {{ group, collider, tick }}
 */
export function buildClockTower(scene, x, z, { base = 6, height = 22, y = 0 } = {}) {
  const M = propMaterials();
  const g = new THREE.Group();
  g.position.set(x, y, z);
  // foundation down into the slope
  const found = new THREE.Mesh(new THREE.BoxGeometry(base + 0.6, 3, base + 0.6), M.stoneDark);
  found.position.y = -1.3;
  g.add(found);

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
export function buildTrees(scene, places, { sunDir, cards = 80, heightAt = () => 0 } = {}) {
  const M = propMaterials();
  const trunkGeo = new THREE.CylinderGeometry(0.16, 0.28, 2.2, 7);
  const trunks = new THREE.InstancedMesh(trunkGeo, M.trunk, places.length);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), p = new THREE.Vector3(), s = new THREE.Vector3();
  const col = new THREE.Color();
  const colliders = [];

  // group by species
  const bySpecies = new Map();
  places.forEach(([x, z, sc = 1, species = 'green'], i) => {
    const gy = heightAt(x, z) - 0.15;
    p.set(x, gy + 1.1 * sc, z); s.set(sc, sc, sc); q.identity();
    m.compose(p, q, s); trunks.setMatrixAt(i, m);
    if (!bySpecies.has(species)) bySpecies.set(species, []);
    bySpecies.get(species).push([x, z, sc, i, gy]);
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
    list.forEach(([x, z, sc, i, gy], k) => {
      const r = 1.9 * sc;                 // crown radius
      p.set(x, gy + 2.2 * sc + r * 0.55, z);
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
export function buildBushes(scene, places, { sunDir, cards = 80, colliders: wantColliders = true, heightAt = () => 0 } = {}) {
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
      p.set(x, heightAt(x, z) + sc * 0.75, z);
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
export function buildWildFlowers(scene, clusters, { palette = [0xffffff, 0xffd166, 0xff6d6d, 0xc77dff, 0xff9f43], heightAt = () => 0 } = {}) {
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
      const fx = cx + (rng() - 0.5) * 3, fz = cz + (rng() - 0.5) * 3;
      o.position.set(fx, heightAt(fx, fz), fz);
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
export function buildStall(scene, x, z, rotY, { red = false, y = 0 } = {}) {
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
  g.position.set(x, y, z);
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
export function buildFountain(scene, particleSystem, { x = 0, z = 0, y = 0, particles = 120 } = {}) {
  const g = new THREE.Group();
  g.position.set(x, y, z);

  const marble = standardMat({ map: stoneTexture(), color: 0xf3eee3, roughness: 0.7 });
  const marbleDark = standardMat({ map: stoneTexture(), color: 0xd9d2c4, roughness: 0.8 });
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
      particleSystem.createFountainFall(new THREE.Vector3(x, y + t.y + 0.02, z), t.r + 0.14, Math.round(particles * 0.45), sheetH, 6.0);
    }
  });

  // Finial + jet
  const top = TIERS[TIERS.length - 1];
  add(new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.13, 0.45, 8), marble), top.y + 0.2);
  add(new THREE.Mesh(new THREE.ConeGeometry(0.2, 0.55, 10), marbleDark), top.y + 0.68);
  if (particleSystem) {
    particleSystem.createFountainSpray(new THREE.Vector3(x, y + top.y + 0.95, z), particles,
      { up: 2.4, upVar: 0.8, spread: 0.35, size: 11.0, gravity: 6.0 });
  }

  scene.add(g);
  return { group: g, water, collider: { circle: true, x, z, r: POOL_R + 0.3 } };
}

// ── Wall lanterns (task.md §2.7) ─────────────────────────────────
/**
 * A bracketed iron lantern above each building door, as in the reference
 * art. Three InstancedMeshes for the whole town (bracket, cage, glowing
 * glass), so a dozen lanterns cost 3 draw calls. No PointLights: the glass
 * is emissive and blooms (see the point-light budget in task.md §4.1).
 * The lanterns hang from the bracket tip and swing gently with the wind.
 *
 * @param {THREE.Scene} scene
 * @param {{x:number, y:number, z:number, rot?:number}[]} slots  world position of the
 *        wall plate (front wall, above the door); lanterns hang out along the
 *        building's heading `rot` (+Z when 0)
 * @param {{ reducedMotion?: boolean, windStrength?: () => number }} [opts]
 * @returns {{ update(t:number):void, glass: THREE.Material }}
 */
export function buildWallLanterns(scene, slots, { reducedMotion = false, windStrength = () => 0.35, scale = 1.4 } = {}) {
  if (!slots.length) return { update() {}, glass: null };
  const ARM = 0.55;                       // how far the hook sits from the wall
  const part = (geo, x, y, z, rx = 0, ry = 0, rz = 0) => {
    const g = geo.index ? geo.toNonIndexed() : geo;
    g.rotateX(rx); g.rotateY(ry); g.rotateZ(rz);
    g.translate(x, y, z);
    return g;
  };
  // Bracket (static): wall plate, arm, diagonal brace, little curl at the tip
  const bracketGeo = mergeBufferGeometries([
    part(new THREE.BoxGeometry(0.2, 0.34, 0.04), 0, -0.12, 0.02),
    part(new THREE.BoxGeometry(0.05, 0.05, ARM + 0.06), 0, 0, ARM / 2),
    part(new THREE.BoxGeometry(0.035, 0.035, Math.hypot(0.32, 0.4)), 0, -0.16, 0.2, -Math.atan2(0.32, 0.4)),
    part(new THREE.TorusGeometry(0.05, 0.012, 4, 10, Math.PI * 1.5), 0, 0.04, ARM + 0.02, 0, Math.PI / 2),
  ], false);
  // Lantern cage (swings), modelled hanging from the hook at the origin
  const cageGeo = mergeBufferGeometries([
    part(new THREE.CylinderGeometry(0.008, 0.008, 0.1, 4), 0, -0.05, 0),               // hanger
    part(new THREE.ConeGeometry(0.16, 0.13, 4), 0, -0.165, 0, 0, Math.PI / 4),          // cap
    part(new THREE.BoxGeometry(0.24, 0.035, 0.24), 0, -0.245, 0),                        // top rim
    part(new THREE.BoxGeometry(0.22, 0.04, 0.22), 0, -0.6, 0),                           // base
    part(new THREE.SphereGeometry(0.025, 6, 4), 0, -0.64, 0),                            // finial
    ...[[-1, -1], [1, -1], [-1, 1], [1, 1]].map(([sx, sz]) =>
      part(new THREE.BoxGeometry(0.025, 0.34, 0.025), sx * 0.1, -0.42, sz * 0.1)),       // corner posts
  ], false);
  const glassGeo = part(new THREE.BoxGeometry(0.17, 0.3, 0.17), 0, -0.42, 0);

  const iron = standardMat({ color: 0x2b2622, roughness: 0.55, metalness: 0.6 });
  const glass = new THREE.MeshStandardMaterial({ color: 0xffc878, emissive: 0xff9a30, emissiveIntensity: 1.25, roughness: 0.4 });
  const n = slots.length;
  const brackets = new THREE.InstancedMesh(bracketGeo, iron, n);
  const cages = new THREE.InstancedMesh(cageGeo, iron, n);
  const panes = new THREE.InstancedMesh(glassGeo, glass, n);
  brackets.castShadow = cages.castShadow = true;
  cages.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  panes.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  for (const m of [brackets, cages, panes]) { m.frustumCulled = false; m.name = 'wall-lanterns'; scene.add(m); }

  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), p = new THREE.Vector3(), one = new THREE.Vector3(scale, scale, scale);
  const phase = slots.map((s, i) => (s.x * 0.37 + s.z * 0.61 + i) % (Math.PI * 2));
  const yaw = slots.map(s => new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), s.rot || 0));
  slots.forEach((s, i) => { m4.compose(p.set(s.x, s.y, s.z), yaw[i], one); brackets.setMatrixAt(i, m4); });
  brackets.instanceMatrix.needsUpdate = true;

  function pose(t) {
    const amp = reducedMotion ? 0 : 0.035 + windStrength() * 0.12;
    slots.forEach((s, i) => {
      const ph = phase[i];
      // swing mostly out from / back to the wall, a little side to side
      e.set(Math.sin(t * 1.7 + ph) * amp, 0, Math.sin(t * 1.13 + ph * 1.7) * amp * 0.5);
      q.setFromEuler(e).premultiply(yaw[i]);
      const r = s.rot || 0;
      p.set(s.x + Math.sin(r) * ARM * scale, s.y, s.z + Math.cos(r) * ARM * scale);
      m4.compose(p, q, one);
      cages.setMatrixAt(i, m4);
      panes.setMatrixAt(i, m4);
    });
    cages.instanceMatrix.needsUpdate = true;
    panes.instanceMatrix.needsUpdate = true;
  }
  pose(0);
  return { update: reducedMotion ? () => {} : pose, glass };
}

// ── Filler townhouses ───────────────────────────────────────────
const HOUSE_PLASTER = [0xf3e4c4, 0xefe0bf, 0xf7dcc4, 0xe9d6ae, 0xf6ead0];
const HOUSE_ROOF    = [0xc9553d, 0xb84a36, 0xa9432f, 0xd9694a];

/**
 * Small plaster-and-timber townhouses lining the streets (town-layout.js
 * places them; each faces its street). Everything is instanced — plinth,
 * walls, timber frame, roof, gable ends, windows, doors, chimneys — so
 * forty houses cost about nine draw calls. All of it takes part in the
 * occlusion cut.
 *
 * @param {Array} houses  [{ x, y, z, w, d, h, heading, storeys, ridgeAlong, tint, roofTint, chimney, chimneySide }]
 * @param {{ windowMaterial: THREE.Material }} opts  glowing lattice windows (shared with the town)
 */
export function buildTownhouses(scene, houses, { windowMaterial }) {
  const M = propMaterials();
  const tileTex = M.tile.map.clone(); tileTex.repeat.set(4, 2.6); tileTex.needsUpdate = true;
  const plasterTex = M.plaster.map.clone(); plasterTex.repeat.set(2, 2); plasterTex.needsUpdate = true;
  const mat = {
    plinth:  withOcclusionCut(new THREE.MeshStandardMaterial({ map: M.stoneDark.map, color: 0xa89c86, roughness: 0.95 })),
    plaster: withOcclusionCut(new THREE.MeshStandardMaterial({ map: plasterTex, color: 0xffffff, roughness: 0.9 })),
    timber:  withOcclusionCut(new THREE.MeshStandardMaterial({ color: 0x4a2c18, roughness: 0.95 })),
    tile:    withOcclusionCut(new THREE.MeshStandardMaterial({ map: tileTex, color: 0xffffff, roughness: 0.8 })),
    gable:   withOcclusionCut(new THREE.MeshStandardMaterial({ map: plasterTex, color: 0xffffff, roughness: 0.9 })),
    door:    withOcclusionCut(new THREE.MeshStandardMaterial({ color: 0x5c3a1e, roughness: 0.9 })),
    chimney: withOcclusionCut(new THREE.MeshStandardMaterial({ map: M.stoneDark.map, color: 0x9a8e7a, roughness: 0.95 })),
    window:  withOcclusionCut(windowMaterial),
  };
  // unit roof split into its tiled slopes and its plaster gable ends
  const roofGeo = gableRoofGeometry(1, 1, 1);
  const ri = roofGeo.index.array;
  const slopes = roofGeo.clone(); slopes.setIndex(Array.from(ri.slice(0, 12))); slopes.clearGroups();
  const gables = roofGeo.clone(); gables.setIndex(Array.from(ri.slice(12, 18))); gables.clearGroups();

  const counts = { win: 0, timber: 0, chim: 0 };
  for (const h of houses) {
    counts.win += (h.storeys === 2 ? 4 : 2) + 1;   // front windows (+1 back)
    counts.timber += h.storeys === 2 ? 14 : 10;
    if (h.chimney) counts.chim++;
  }
  const N = houses.length;
  const mk = (geo, m, n, cast = true) => {
    const im = new THREE.InstancedMesh(geo, m, Math.max(1, n));
    im.count = n; im.castShadow = cast; im.receiveShadow = true; im.name = 'townhouses';
    scene.add(im); return im;
  };
  const unit = new THREE.BoxGeometry(1, 1, 1);
  const plinths = mk(unit, mat.plinth, N), bodies = mk(unit, mat.plaster, N);
  const roofs = mk(slopes, mat.tile, N), ends = mk(gables, mat.gable, N);
  const doors = mk(unit, mat.door, N, false), timbers = mk(unit, mat.timber, counts.timber);
  const windows = mk(new THREE.PlaneGeometry(0.85, 1.0), mat.window, counts.win, false);
  const chims = mk(unit, mat.chimney, counts.chim);

  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), p = new THREE.Vector3(), sc = new THREE.Vector3();
  const Y = new THREE.Vector3(0, 1, 0), col = new THREE.Color(), white = new THREE.Color(0xffffff);
  let wi = 0, ti = 0, ci = 0;
  houses.forEach((h, i) => {
    const c = Math.cos(h.heading), s = Math.sin(h.heading);
    const W = (lx, ly, lz) => p.set(h.x + lx * c + lz * s, h.y + ly, h.z - lx * s + lz * c);
    q.setFromAxisAngle(Y, h.heading);
    const set = (im, k, lx, ly, lz, sx, sy, sz, extraYaw = 0) => {
      const qq = extraYaw ? q.clone().multiply(new THREE.Quaternion().setFromAxisAngle(Y, extraYaw)) : q;
      m.compose(W(lx, ly, lz), qq, sc.set(sx, sy, sz));
      im.setMatrixAt(k, m);
    };
    set(plinths, i, 0, -1.1, 0, h.w + 0.3, 2.9, h.d + 0.3);
    set(bodies, i, 0, (h.h + 0.3) / 2, 0, h.w, h.h - 0.3, h.d);
    bodies.setColorAt(i, col.setHex(HOUSE_PLASTER[h.tint % HOUSE_PLASTER.length]));
    ends.setColorAt(i, col.setHex(HOUSE_PLASTER[h.tint % HOUSE_PLASTER.length]));
    roofs.setColorAt(i, col.setHex(HOUSE_ROOF[h.roofTint % HOUSE_ROOF.length]).lerp(white, 0.68));
    // roof: gable to the street ('front') or eaves to the street ('side')
    const front = h.ridgeAlong === 'front';
    const span = front ? h.w : h.d, len = front ? h.d : h.w, rh = span * 0.6;
    set(roofs, i, 0, h.h - 0.02, 0, span + 1.0, rh, len + 0.9, front ? 0 : Math.PI / 2);
    set(ends, i, 0, h.h - 0.02, 0, span + 1.0, rh, len + 0.9, front ? 0 : Math.PI / 2);
    set(doors, i, (i % 3 - 1) * h.w * 0.18, 0.3 + 1.0, h.d / 2 + 0.04, 1.0, 2.0, 0.12);
    // timber frame: corner posts + a band at each floor and under the eaves
    const t = 0.15, hw = h.w / 2, hd = h.d / 2, top = h.h;
    for (const [x, z] of [[-hw, -hd], [hw, -hd], [-hw, hd], [hw, hd]]) set(timbers, ti++, x, (top + 0.3) / 2, z, t * 1.3, top - 0.3, t * 1.3);
    const bands = h.storeys === 2 ? [0.4, top / 2 + 0.2, top - 0.08] : [0.4, top - 0.08];
    for (const y of bands) {
      set(timbers, ti++, 0, y, hd + 0.01, h.w + 0.1, t, t);
      set(timbers, ti++, 0, y, -hd - 0.01, h.w + 0.1, t, t);
      if (y > 0.5) { set(timbers, ti++, hw + 0.01, y, 0, t, t, h.d + 0.1); set(timbers, ti++, -hw - 0.01, y, 0, t, t, h.d + 0.1); }
    }
    // windows: two per floor on the front, one on the back
    const rows = h.storeys === 2 ? [1.55, top / 2 + 1.35] : [1.55];
    const doorX = (i % 3 - 1) * h.w * 0.18;
    for (const y of rows) for (const x of [-h.w * 0.28, h.w * 0.28]) {
      if (y < 2 && Math.abs(x - doorX) < 1.0) continue;
      if (wi < counts.win) set(windows, wi++, x, y, hd + 0.03, 1, 1, 1);
    }
    if (wi < counts.win) set(windows, wi++, 0, rows[rows.length - 1], -hd - 0.03, 1, 1, 1, Math.PI);
    if (h.chimney) set(chims, ci++, h.chimneySide * h.w * 0.28, top + rh * 0.55, -h.d * 0.12, 0.55, rh + 1.2, 0.55);
  });
  windows.count = wi; timbers.count = ti; chims.count = ci;
  for (const im of [plinths, bodies, roofs, ends, doors, timbers, windows, chims]) {
    im.instanceMatrix.needsUpdate = true;
    if (im.instanceColor) im.instanceColor.needsUpdate = true;
  }
  return { materials: mat };
}

// ── Mill wheel ──────────────────────────────────────────────────
/**
 * An undershot water wheel against the back wall of the mill, dipping into
 * the stream. Turns with update(dt).
 * @param {{x,y,z,heading}} at  wheel centre and the mill's heading (axle runs along it)
 */
export function buildMillWheel(scene, at, { radius = 1.9, width = 0.9 } = {}) {
  const M = propMaterials();
  const wood = standardMat({ color: 0x6b4a2e, roughness: 0.9 });
  const pivot = new THREE.Group();
  pivot.position.set(at.x, at.y, at.z);
  pivot.rotation.y = at.heading - Math.PI / 2;      // local x = the mill's facing (the axle)
  const wheel = new THREE.Group();
  pivot.add(wheel);
  for (const sx of [-width / 2, width / 2]) {
    const rim = new THREE.Mesh(new THREE.TorusGeometry(radius, 0.08, 6, 28), wood);
    rim.rotation.y = Math.PI / 2; rim.position.x = sx;
    wheel.add(rim);
  }
  for (let i = 0; i < 6; i++) {
    const spoke = new THREE.Mesh(new THREE.BoxGeometry(width * 0.9, 0.09, radius * 2), wood);
    spoke.rotation.x = (i / 6) * Math.PI;
    wheel.add(spoke);
  }
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    const paddle = new THREE.Mesh(new THREE.BoxGeometry(width + 0.1, 0.06, 0.55), wood);
    paddle.position.set(0, Math.sin(a) * radius, Math.cos(a) * radius);
    paddle.rotation.x = -a;
    paddle.castShadow = true;
    wheel.add(paddle);
  }
  const axle = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, width + 1.2, 8), M.iron);
  axle.rotation.z = Math.PI / 2;
  pivot.add(axle);
  scene.add(pivot);
  return { group: pivot, update(dt) { wheel.rotation.x -= dt * 0.9; } };
}

// ── Pickleball court ────────────────────────────────────────────
function meshTexture(size, draw) {
  const cv = document.createElement('canvas');
  cv.width = cv.height = size;
  const c = cv.getContext('2d');
  draw(c, size);
  const tex = new THREE.CanvasTexture(cv);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = 4;
  return tex;
}

/**
 * A small fenced pickleball court, built in its own frame: centred on the
 * origin, long axis along z, the gate at +z (the "front"). Court-proportioned
 * playing area (20 × 44 ft) with baselines, sidelines, centre lines and the
 * non-volley "kitchen" either side of the net, on a green apron; chain-link
 * fence with a gate gap, net on two posts, a bench, paddles and balls.
 * Every part is tagged with `userData` so clicking it opens the project.
 *
 * @param {{ w:number, d:number }} o   apron size (x, z)
 * @returns {THREE.Group}
 */
export function buildPickleballCourt(o, userData = null) {
  const g = new THREE.Group();
  const M = propMaterials();
  const W = o.w, D = o.d;
  const cw = W * 0.69, cl = cw * 2.2;                 // playing area 20 × 44 ft
  const kitchen = (cl / 2) * (7 / 22);                // non-volley zone depth
  const add = (geo, mat, x, y, z, cast = false) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    m.castShadow = cast; m.receiveShadow = true;
    if (userData) m.userData = { ...userData };
    g.add(m);
    return m;
  };
  // surfaces: green apron, blue court, lighter kitchens
  add(new THREE.BoxGeometry(W, 0.16, D), standardMat({ color: 0x4f8a5d, roughness: 0.8 }), 0, 0.08, 0);
  add(new THREE.BoxGeometry(cw, 0.02, cl), standardMat({ color: 0x2f6c9f, roughness: 0.7 }), 0, 0.17, 0);
  const kitchenMat = standardMat({ color: 0x4a8cc2, roughness: 0.7 });
  for (const s of [-1, 1]) add(new THREE.BoxGeometry(cw, 0.022, kitchen), kitchenMat, 0, 0.172, s * kitchen / 2);
  // white lines (merged)
  const lw = 0.07, ly = 0.186, lines = [];
  const line = (w, d, x, z) => { const b = new THREE.BoxGeometry(w, 0.012, d); b.translate(x, ly, z); lines.push(b); };
  line(cw + lw, lw, 0, cl / 2); line(cw + lw, lw, 0, -cl / 2);              // baselines
  line(lw, cl, cw / 2, 0); line(lw, cl, -cw / 2, 0);                         // sidelines
  line(cw, lw, 0, kitchen); line(cw, lw, 0, -kitchen);                       // kitchen lines
  for (const s of [-1, 1]) line(lw, cl / 2 - kitchen, 0, s * (kitchen + (cl / 2 - kitchen) / 2));   // centre lines
  add(mergeBufferGeometries(lines, false), standardMat({ color: 0xf4f1e8, roughness: 0.6 }), 0, 0, 0);

  // net: two posts, a mesh panel and a white top tape
  const postMat = standardMat({ color: 0x2b2d2f, roughness: 0.5, metalness: 0.4 });
  const netSpan = cw + 0.6;
  for (const s of [-1, 1]) add(new THREE.CylinderGeometry(0.05, 0.05, 0.95, 8), postMat, s * netSpan / 2, 0.16 + 0.475, 0, true);
  const netTex = meshTexture(64, (c, n) => {
    c.strokeStyle = 'rgba(255,255,255,1)'; c.lineWidth = 3;
    for (let k = 0; k <= n; k += n / 4) { c.beginPath(); c.moveTo(k, 0); c.lineTo(k, n); c.stroke(); c.beginPath(); c.moveTo(0, k); c.lineTo(n, k); c.stroke(); }
  });
  netTex.repeat.set(netSpan / 0.14, 0.8 / 0.14);
  const net = add(new THREE.PlaneGeometry(netSpan, 0.78), new THREE.MeshStandardMaterial({
    map: netTex, alphaMap: netTex, alphaTest: 0.4, color: 0x1d1f22, side: THREE.DoubleSide, roughness: 0.9 }), 0, 0.2 + 0.39, 0);
  net.receiveShadow = false;
  add(new THREE.BoxGeometry(netSpan, 0.07, 0.03), standardMat({ color: 0xf4f1e8, roughness: 0.6 }), 0, 0.98, 0);

  // chain-link fence round the apron, a gate gap in the front end
  const FH = 1.15, gate = 1.9;
  const fenceGreen = 0x2c4a3b;
  const linkTex = meshTexture(64, (c, n) => {
    c.strokeStyle = 'rgba(255,255,255,1)'; c.lineWidth = 3;
    c.beginPath(); c.moveTo(0, 0); c.lineTo(n, n); c.moveTo(n, 0); c.lineTo(0, n); c.stroke();
  });
  const linkMat = new THREE.MeshStandardMaterial({ map: linkTex, alphaMap: linkTex, alphaTest: 0.35, color: fenceGreen, side: THREE.DoubleSide, roughness: 0.6, metalness: 0.3 });
  const railMat = standardMat({ color: fenceGreen, roughness: 0.5, metalness: 0.4 });
  const hw = W / 2, hd = D / 2;
  // runs as [x0, z0, x1, z1]
  const runs = [[-hw, -hd, hw, -hd], [hw, -hd, hw, hd], [-hw, hd, -hw, -hd],
                [hw, hd, gate / 2, hd], [-gate / 2, hd, -hw, hd]];
  const posts = [], rails = [];
  for (const [x0, z0, x1, z1] of runs) {
    const len = Math.hypot(x1 - x0, z1 - z0), ang = Math.atan2(-(z1 - z0), x1 - x0);
    const panelTex = linkTex.clone(); panelTex.needsUpdate = true; panelTex.repeat.set(len / 0.22, FH / 0.22);
    const pm = linkMat.clone(); pm.map = panelTex; pm.alphaMap = panelTex;
    const panel = add(new THREE.PlaneGeometry(len, FH), pm, (x0 + x1) / 2, 0.16 + FH / 2, (z0 + z1) / 2);
    panel.rotation.y = ang;
    panel.receiveShadow = false;
    const rail = new THREE.BoxGeometry(len + 0.06, 0.06, 0.06);
    rail.rotateY(ang); rail.translate((x0 + x1) / 2, 0.16 + FH, (z0 + z1) / 2);
    rails.push(rail);
    const nPost = Math.max(1, Math.round(len / 2.1));
    for (let k = 0; k <= nPost; k++) {
      const t = k / nPost, p = new THREE.CylinderGeometry(0.045, 0.045, FH + 0.05, 6);
      p.translate(x0 + (x1 - x0) * t, 0.16 + (FH + 0.05) / 2, z0 + (z1 - z0) * t);
      posts.push(p);
    }
  }
  add(mergeBufferGeometries([...posts, ...rails], false), railMat, 0, 0, 0, true);

  // bench along the outside of the left long side, paddles, balls
  const wood = standardMat({ color: 0x8a5a33, roughness: 0.85 });
  const bench = [];
  const box = (w, h, d, x, y, z) => { const b = new THREE.BoxGeometry(w, h, d); b.translate(x, y, z); bench.push(b); };
  const bx = -hw - 0.55;
  box(0.42, 0.07, 2.0, bx, 0.48, 1.6); box(0.06, 0.4, 2.0, bx - 0.2, 0.72, 1.6);
  for (const dz of [-0.85, 0.85]) box(0.38, 0.45, 0.07, bx, 0.225, 1.6 + dz);
  add(mergeBufferGeometries(bench, false), wood, 0, 0, 0, true);
  const paddleGeo = new THREE.CylinderGeometry(0.2, 0.2, 0.03, 16);
  paddleGeo.scale(1, 1, 1.25);
  [[0xd8462f, 0.2], [0xf2c230, 0.75]].forEach(([col, dz]) => {
    const p = add(paddleGeo, standardMat({ color: col, roughness: 0.6 }), bx + 0.05, 0.56, 1.6 + dz);
    p.rotation.set(0, 0, Math.PI / 2 - 0.25);
  });
  const ballMat = standardMat({ color: 0xd9f24a, roughness: 0.5 });
  const ballGeo = new THREE.SphereGeometry(0.075, 10, 8);
  [[0.9, cl * 0.31], [-1.3, -cl * 0.18], [1.6, -cl * 0.42], [bx + 0.1, 2.3]].forEach(([x, z]) =>
    add(ballGeo, ballMat, x, x < -hw ? 0.6 : 0.26, z));
  return g;
}
