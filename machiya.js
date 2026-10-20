/**
 * machiya.js — the town's filler buildings as Kyoto townhouses (machiya)
 *
 * A dark timber ground floor behind a glowing kōshi lattice, an indigo noren
 * over the door bay, a cream plaster upper floor with a slit (mushiko) window,
 * a pent roof (hisashi) between the floors and a low grey-tile gable on top in
 * the City Hall's tile. One-storey houses keep a plaster band under the eaves.
 *
 *   • buildMachiyaRow(scene, houses)  — every townhouse in town, merged per
 *     material (~8 draw calls), occlusion-dithered like the old townhouses
 *   • buildMachiya(o)                 — one building (Tavern, Mill, Guild
 *     Board, Adventurer Stats) as a group in its own local frame
 *
 * House spec: { w, d, h, storeys, ridgeAlong: 'front' | 'side' } plus, for
 * the row, { x, y, z, heading }. Local +z is the street front.
 */
import * as THREE from 'three';
import { mergeBufferGeometries } from 'https://cdn.jsdelivr.net/npm/three@0.150.0/examples/jsm/utils/BufferGeometryUtils.js';
import { templeMaterials } from './temple.js';
import { stoneTexture, plasterTexture } from './textures.js';
import { withOcclusionCut } from './materials.js';
import { gableRoofGeometry } from './town-props.js';

const PLASTER_TINTS = [0xf2ead8, 0xefe4cc, 0xf5eedf, 0xe9dcc2];
const TIMBER_TINTS  = [0x3b261a, 0x45301f, 0x33221a, 0x4a3322];

// ── textures (canvas, memoised) ───────────────────────────────────
let _koshi = null, _slit = null;
function koshiTexture() {
  if (_koshi) return _koshi;
  const c = document.createElement('canvas'); c.width = 64; c.height = 64;
  const g = c.getContext('2d');
  g.fillStyle = '#ffca82'; g.fillRect(0, 0, 64, 64);           // warm paper behind the slats
  g.fillStyle = '#2a1a12';
  for (let x = 0; x < 64; x += 8) g.fillRect(x, 0, 5, 64);       // close vertical slats
  g.fillRect(0, 0, 64, 4); g.fillRect(0, 60, 64, 4);
  _koshi = new THREE.CanvasTexture(c); _koshi.wrapS = _koshi.wrapT = THREE.RepeatWrapping;
  return _koshi;
}
function slitTexture() {
  if (_slit) return _slit;
  const draw = (paper, bars) => {
    const c = document.createElement('canvas'); c.width = 64; c.height = 16;
    const g = c.getContext('2d');
    g.fillStyle = paper; g.fillRect(0, 0, 64, 16);
    g.fillStyle = bars;                                           // plaster bars (mushiko-mado)
    for (let x = 0; x < 64; x += 8) g.fillRect(x, 0, 4, 16);
    g.fillRect(0, 0, 64, 2); g.fillRect(0, 14, 64, 2);
    const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping;
    return t;
  };
  // colour: warm paper between pale bars; glow: only the paper lights up
  _slit = { map: draw('#ffe0aa', '#d9ccb2'), glow: draw('#ffffff', '#000000') };
  return _slit;
}

/** Materials; `dither` adds the see-through cut used by everything the camera looks over. */
export function machiyaMaterials({ dither = false } = {}) {
  const cut = dither ? withOcclusionCut : (m) => m;
  const T = templeMaterials();
  const tileMap = T.tile.map.clone(); tileMap.repeat.set(4, 2); tileMap.needsUpdate = true;
  const koshi = koshiTexture(), slit = slitTexture();
  return {
    plinth:  cut(new THREE.MeshStandardMaterial({ map: stoneTexture(), color: 0x8f877a, roughness: 0.95 })),
    timber:  cut(new THREE.MeshStandardMaterial({ color: 0xffffff, vertexColors: true, roughness: 0.9 })),
    plaster: cut(new THREE.MeshStandardMaterial({ map: plasterTexture(), color: 0xffffff, vertexColors: true, roughness: 0.9 })),
    tile:    cut(new THREE.MeshStandardMaterial({ map: tileMap, color: 0x59626e, roughness: 0.6, metalness: 0.15 })),
    ridge:   cut(new THREE.MeshStandardMaterial({ color: 0x2f343c, roughness: 0.6 })),
    koshi:   cut(new THREE.MeshStandardMaterial({ map: koshi, emissive: 0xff9a4a, emissiveMap: koshi, emissiveIntensity: 0.9, roughness: 0.9 })),
    slit:    cut(new THREE.MeshStandardMaterial({ map: slit.map, emissive: 0xffa24a, emissiveMap: slit.glow, emissiveIntensity: 0.8, roughness: 0.9 })),
    noren:   cut(new THREE.MeshStandardMaterial({ color: 0x1f3b5c, roughness: 0.9, side: THREE.DoubleSide })),
    red:     new THREE.MeshStandardMaterial({ color: 0xd8322a, emissive: 0xc8281e, emissiveIntensity: 0.9, roughness: 0.8 }),
  };
}
/** The materials that glow at dusk (town-world scales their emissive with the evening). */
export const GLOWING = ['koshi', 'slit', 'red'];

// ── one house's parts, in its local frame (origin on the floor, +z front) ──
const box = (w, h, d, x, y, z) => new THREE.BoxGeometry(w, h, d).translate(x, y, z);
const plane = (w, h, x, y, z) => new THREE.PlaneGeometry(w, h).translate(x, y, z);
function tint(geo, hex) {
  const c = new THREE.Color(hex), n = geo.attributes.position.count, a = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { a[i * 3] = c.r; a[i * 3 + 1] = c.g; a[i * 3 + 2] = c.b; }
  geo.setAttribute('color', new THREE.BufferAttribute(a, 3));
  return geo;
}
const slopes = (() => { const g = gableRoofGeometry(1, 1, 1); const s = g.clone(); s.setIndex(Array.from(g.index.array.slice(0, 12))); s.clearGroups(); return s; })();
const gables = (() => { const g = gableRoofGeometry(1, 1, 1); const s = g.clone(); s.setIndex(Array.from(g.index.array.slice(12, 18))); s.clearGroups(); return s; })();

/**
 * Push one machiya's geometry into P (keyed by material), transformed by `xf`.
 * @returns {{ roofTop, roofH, doorX }}
 */
function machiyaParts(P, h, k, xf, { lanterns = false } = {}) {
  const put = (key, g) => { P[key].push(xf ? g.applyMatrix4(xf) : g); };
  const hw = h.w / 2, hd = h.d / 2, top = h.h, two = h.storeys === 2;
  const g1 = two ? top * 0.5 : Math.min(2.6, top * 0.68);       // top of the timber ground floor
  const plasterHex = PLASTER_TINTS[k % PLASTER_TINTS.length], timberHex = TIMBER_TINTS[(k * 3 + 1) % TIMBER_TINTS.length];

  put('plinth', box(h.w + 0.3, 2.9, h.d + 0.3, 0, -1.1, 0));
  put('timber', tint(box(h.w, g1 - 0.3, h.d, 0, 0.3 + (g1 - 0.3) / 2, 0), timberHex));
  put('plaster', tint(box(h.w - 0.1, top - g1, h.d - 0.1, 0, g1 + (top - g1) / 2, 0), plasterHex));
  for (const [x, z] of [[-hw, hd], [hw, hd], [-hw, -hd], [hw, -hd]]) put('timber', tint(box(0.2, top, 0.2, x, top / 2 + 0.2, z), timberHex));
  put('timber', tint(box(h.w + 0.12, 0.16, 0.16, 0, g1, hd + 0.02), timberHex));

  // the front: a door bay with a noren at one end, the kōshi lattice across the rest
  const doorRight = k % 2 === 0, bay = Math.min(1.4, h.w * 0.3);
  const doorX = doorRight ? hw - bay / 2 - 0.1 : -hw + bay / 2 + 0.1;
  const lw = h.w - bay - 0.5, lx = doorRight ? -hw + 0.25 + lw / 2 : hw - 0.25 - lw / 2;
  const lh = Math.min(1.5, g1 - 0.9);
  const lattice = plane(lw, lh, lx, 0.55 + lh / 2 + 0.15, hd + 0.03);
  const uv = lattice.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setX(i, uv.getX(i) * lw / 1.4);
  put('koshi', lattice);
  put('timber', tint(box(0.9, Math.min(2.0, g1 - 0.4), 0.1, doorX, 0.3 + Math.min(2.0, g1 - 0.4) / 2, hd + 0.02), 0x24170f));
  put('noren', plane(bay - 0.2, 0.7, doorX, Math.min(2.0, g1 - 0.4) + 0.05, hd + 0.09));
  if (lanterns) for (const sx of [-1, 1]) put('red', new THREE.CylinderGeometry(0.22, 0.22, 0.5, 12).translate(doorX + sx * (bay / 2 + 0.05), 2.0, hd + 0.35));

  if (two) {
    put('slit', plane(h.w * 0.6, 0.45, 0, g1 + (top - g1) * 0.55, hd - 0.03));
    // pent roof along the front between the floors (the body hides its inner half)
    put('tile', box(h.w + 0.4, 0.08, 1.0, 0, 0, 0).rotateX(0.38).translate(0, g1 + 0.1, hd + 0.42));
  } else {
    put('slit', plane(h.w * 0.45, 0.3, 0, g1 + (top - g1) * 0.5, hd - 0.03));
  }
  // back: one slit window
  put('slit', plane(h.w * 0.4, 0.4, 0, top * 0.7, -hd + 0.03).rotateY(Math.PI));

  // main roof: a low grey-tile gable with deep eaves; gable to the street or eaves to it
  const front = h.ridgeAlong === 'front', span = front ? h.w : h.d, len = front ? h.d : h.w;
  const rh = span * 0.36;
  const sc = new THREE.Matrix4().makeScale(span + 1.2, rh, len + 0.9);
  const rot = new THREE.Matrix4().makeRotationY(front ? 0 : Math.PI / 2);
  const lift = new THREE.Matrix4().makeTranslation(0, top - 0.05, 0);
  const m = lift.clone().multiply(rot).multiply(sc);
  put('tile', slopes.clone().applyMatrix4(m));
  put('plaster', tint(gables.clone().applyMatrix4(m), plasterHex));
  const ridge = box(0.26, 0.22, len + 1.0, 0, top - 0.05 + rh + 0.06, 0);
  if (!front) ridge.rotateY(Math.PI / 2);
  put('ridge', ridge);
  return { roofTop: top + rh, roofH: rh, doorX };
}

function mergeParts(P, M, name, group) {
  for (const [k, list] of Object.entries(P)) {
    if (!list.length) continue;
    const geo = mergeBufferGeometries(list.map(g => {
      const n = g.index ? g.toNonIndexed() : g;
      if (M[k].vertexColors && !n.attributes.color) tint(n, 0xffffff);
      for (const a of Object.keys(n.attributes)) if (!['position', 'normal', 'uv', ...(M[k].vertexColors ? ['color'] : [])].includes(a)) n.deleteAttribute(a);
      return n;
    }));
    const mesh = new THREE.Mesh(geo, M[k]);
    mesh.name = name;
    mesh.castShadow = !GLOWING.includes(k) && k !== 'noren';
    mesh.receiveShadow = true;
    group.add(mesh);
  }
}

/**
 * Every townhouse lining the streets, merged per material.
 * @returns {{ group, materials }}
 */
export function buildMachiyaRow(scene, houses) {
  const M = machiyaMaterials({ dither: true });
  const P = Object.fromEntries(Object.keys(M).map(k => [k, []]));
  const xf = new THREE.Matrix4();
  houses.forEach((h, i) => {
    xf.makeRotationY(h.heading); xf.setPosition(h.x, h.y, h.z);
    machiyaParts(P, h, i, xf);
  });
  const group = new THREE.Group();
  group.name = 'townhouses';
  mergeParts(P, M, 'townhouses', group);
  scene.add(group);
  return { group, materials: M };
}

/**
 * One building as a machiya (local frame; the caller places and turns it).
 * @param o  building spec from town-layout.js (w, d, h, ridge, label…)
 * @returns {{ group, roofTop, roofH, materials }}
 */
let _single = null;
export function buildMachiya(o, seed = 0) {
  const M = _single || (_single = machiyaMaterials());
  const P = Object.fromEntries(Object.keys(M).map(k => [k, []]));
  const spec = { w: o.w, d: o.d, h: o.h, storeys: o.h >= 5.5 ? 2 : 1, ridgeAlong: o.ridge === 'x' ? 'side' : 'front' };
  const r = machiyaParts(P, spec, seed, null, { lanterns: !!o.tavern });
  const group = new THREE.Group();
  mergeParts(P, M, 'machiya', group);
  return { group, roofTop: r.roofTop, roofH: r.roofH, materials: M };
}
