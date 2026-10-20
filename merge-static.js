/**
 * merge-static.js — fewer draw calls for static props (task.md §4.1)
 *
 * mergeStaticChildren(parent) bakes the *direct* Mesh children of a group
 * that share a material (and shadow flags) into one mesh per material. A
 * Tudor building drops from ~11 meshes to ~6, the cart from 49 to ~17, and
 * the 27 street lamps from 54 meshes to 2. Every mesh is also drawn again
 * into the shadow map, so each merge saves up to two draw calls per frame.
 *
 * Left untouched, so animation and effects keep working:
 *   - child Groups (sign pivots, wheels, lanterns, markers…) and anything
 *     that has children of its own
 *   - InstancedMesh, ShaderMaterial, transparent materials, invisible meshes
 *   - meshes tagged `userData.keep = true`
 * Multi-material meshes (gable roofs: tiles + plaster ends) are split by
 * material group first, so their plaster ends can join the plaster walls.
 * A material that ends up with a single part keeps its original mesh.
 */
import * as THREE from 'three';
import { mergeBufferGeometries } from 'https://cdn.jsdelivr.net/npm/three@0.150.0/examples/jsm/utils/BufferGeometryUtils.js';

// Non-indexed copy with exactly position / normal / uv, so any two parts merge.
function plainCopy(geo) {
  const g = geo.index ? geo.toNonIndexed() : geo.clone();
  const n = g.attributes.position.count;
  if (!g.attributes.normal) g.computeVertexNormals();
  if (!g.attributes.uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(n * 2), 2));
  for (const name of Object.keys(g.attributes)) {
    if (name !== 'position' && name !== 'normal' && name !== 'uv') g.deleteAttribute(name);
  }
  g.morphAttributes = {};
  return g;
}

// Vertices [start, start + count) of a non-indexed geometry as a new geometry.
function sliceVertices(g, start, count) {
  const out = new THREE.BufferGeometry();
  for (const name of ['position', 'normal', 'uv']) {
    const a = g.attributes[name];
    out.setAttribute(name, new THREE.BufferAttribute(a.array.slice(start * a.itemSize, (start + count) * a.itemSize), a.itemSize));
  }
  return out;
}

/**
 * @param {THREE.Object3D} parent
 * @param {{ userData?: object }} [opts]  userData copied onto every merged
 *        mesh (e.g. { project, label } so any part of a building is clickable)
 * @returns {THREE.Mesh[]} the merged meshes that were added
 */
export function mergeStaticChildren(parent, { userData = null } = {}) {
  // 1. Candidates: each split into { mat, geo } pieces in the parent's space
  const candidates = [];
  for (const m of parent.children) {
    if (!m.isMesh || m.isInstancedMesh || m.isSkinnedMesh || !m.visible) continue;
    if (m.children.length || m.userData.keep) continue;
    const mats = Array.isArray(m.material) ? m.material : [m.material];
    if (mats.some(x => !x || x.isShaderMaterial || x.transparent)) continue;
    m.updateMatrix();
    const g = plainCopy(m.geometry);
    g.applyMatrix4(m.matrix);
    let pieces;
    if (Array.isArray(m.material)) {
      const groups = g.groups.length ? g.groups : [{ start: 0, count: g.attributes.position.count, materialIndex: 0 }];
      pieces = groups.map(gr => ({ mat: m.material[gr.materialIndex], geo: sliceVertices(g, gr.start, gr.count) }));
    } else {
      pieces = [{ mat: m.material, geo: g }];
    }
    candidates.push({ mesh: m, pieces, multi: Array.isArray(m.material), key: (mat) => `${mat.uuid}|${m.castShadow ? 1 : 0}${m.receiveShadow ? 1 : 0}` });
  }

  // 2. A single-material mesh only merges if its bucket has ≥ 2 parts,
  //    otherwise it stays as it was (iterate until stable). Multi-material
  //    meshes are always split: they already cost one draw per material, so
  //    a lone piece is no worse and the others can join their buckets.
  let active = candidates.slice();
  for (;;) {
    const counts = new Map();
    for (const c of active) for (const p of c.pieces) { const k = c.key(p.mat); counts.set(k, (counts.get(k) || 0) + 1); }
    const next = active.filter(c => c.multi || counts.get(c.key(c.pieces[0].mat)) >= 2);
    if (next.length === active.length) break;
    active = next;
  }
  if (!active.length) return [];

  // 3. Build one mesh per bucket, remove the originals
  const buckets = new Map();
  for (const c of active) {
    for (const p of c.pieces) {
      const k = c.key(p.mat);
      if (!buckets.has(k)) buckets.set(k, { mat: p.mat, geos: [], cast: c.mesh.castShadow, receive: c.mesh.receiveShadow, data: null });
      const b = buckets.get(k);
      b.geos.push(p.geo);
      if (c.mesh.userData.project) b.data = c.mesh.userData;
    }
    parent.remove(c.mesh);
  }
  const added = [];
  for (const b of buckets.values()) {
    const merged = new THREE.Mesh(mergeBufferGeometries(b.geos, false), b.mat);
    b.geos.forEach(g => g.dispose());
    merged.castShadow = b.cast;
    merged.receiveShadow = b.receive;
    merged.name = 'merged-static';
    const data = userData || b.data;
    if (data) merged.userData = { ...data };
    parent.add(merged);
    added.push(merged);
  }
  return added;
}

// ── Instanced culling (task.md §4.1) ─────────────────────────
// three r150 builds every InstancedMesh with frustumCulled = false, and a
// culled one would be tested against its *geometry's* bounds (one instance
// at the origin), so out of the box instanced props are drawn every frame,
// in the main pass and again in the shadow map. These helpers give an
// instanced mesh real bounds (over all its instances) and switch culling on.
// They give each mesh a light *view* of its geometry (same attribute
// objects, so the same GPU buffers) carrying those bounds, so shared
// geometries are never touched. Don't dispose a view: it would free the
// buffers the other views still use.

const _im = new THREE.Matrix4(), _ibox = new THREE.Box3(), _iall = new THREE.Box3();

function geometryView(src, sphere) {
  const g = new THREE.BufferGeometry();
  if (src.index) g.setIndex(src.index);
  for (const [name, attr] of Object.entries(src.attributes)) g.setAttribute(name, attr);
  for (const gr of src.groups) g.addGroup(gr.start, gr.count, gr.materialIndex);
  g.setDrawRange(src.drawRange.start, src.drawRange.count);
  g.boundingSphere = sphere;
  return g;
}

/**
 * Give a static (or in-place animated) InstancedMesh bounds that cover every
 * instance and turn frustum culling on. `pad` widens them for shaders that
 * move vertices (wind sway) or instances that wobble in place.
 */
export function boundInstances(im, { pad = 0 } = {}) {
  const src = im.geometry;
  if (!src.boundingBox) src.computeBoundingBox();
  _iall.makeEmpty();
  for (let i = 0; i < im.count; i++) {
    im.getMatrixAt(i, _im);
    _iall.union(_ibox.copy(src.boundingBox).applyMatrix4(_im));
  }
  if (_iall.isEmpty()) return im;
  const sphere = _iall.getBoundingSphere(new THREE.Sphere());
  sphere.radius += pad;
  im.geometry = geometryView(src, sphere);
  im.frustumCulled = true;
  // r150 raycasts each instance against the geometry's own sphere, so
  // picking uses the original geometry (whose sphere is one instance's)
  im.raycast = function (raycaster, hits) {
    const view = this.geometry;
    this.geometry = src;
    THREE.InstancedMesh.prototype.raycast.call(this, raycaster, hits);
    this.geometry = view;
  };
  return im;
}

/**
 * Split a static InstancedMesh spread over the town into square tiles of
 * `tile` units, one culled InstancedMesh per tile, so the camera and the
 * shadow map only draw the tiles they can see. The tiles replace `im` in
 * its parent (inside a Group of the same name) and keep its material,
 * colours, shadow flags, render order and userData.
 * @returns {THREE.Object3D} the Group of tiles (or `im` itself if it fits one tile)
 */
export function tileInstances(im, { tile = 48, pad = 0 } = {}) {
  const buckets = new Map();
  for (let i = 0; i < im.count; i++) {
    im.getMatrixAt(i, _im);
    const k = Math.floor(_im.elements[12] / tile) + ',' + Math.floor(_im.elements[14] / tile);
    if (!buckets.has(k)) buckets.set(k, []);
    buckets.get(k).push(i);
  }
  if (buckets.size <= 1) return boundInstances(im, { pad });
  const group = new THREE.Group();
  group.name = im.name;
  group.position.copy(im.position); group.quaternion.copy(im.quaternion); group.scale.copy(im.scale);
  const col = new THREE.Color();
  for (const list of buckets.values()) {
    const t = new THREE.InstancedMesh(im.geometry, im.material, list.length);
    list.forEach((src, j) => {
      im.getMatrixAt(src, _im); t.setMatrixAt(j, _im);
      if (im.instanceColor) { im.getColorAt(src, col); t.setColorAt(j, col); }
    });
    t.instanceMatrix.needsUpdate = true;
    if (t.instanceColor) t.instanceColor.needsUpdate = true;
    t.castShadow = im.castShadow; t.receiveShadow = im.receiveShadow;
    t.renderOrder = im.renderOrder; t.layers.mask = im.layers.mask;
    t.name = im.name; t.userData = { ...im.userData };
    boundInstances(t, { pad });
    group.add(t);
  }
  const parent = im.parent;
  if (parent) { parent.add(group); parent.remove(im); }
  return group;
}
