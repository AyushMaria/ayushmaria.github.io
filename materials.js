/**
 * materials.js — shared material registry (task.md §1.5 / §4.1)
 *
 * `standardMat(params)` returns ONE MeshStandardMaterial per distinct set of
 * parameters, so every building, rock, sign post or table that asks for
 * "dark wood, roughness 0.9" gets the same material object instead of its
 * own copy. Fewer material objects means less uniform uploading and state
 * switching per frame, and less memory.
 *
 * Rule: materials from the registry are SHARED — never change their colour,
 * emissive, opacity… on one object. Anything that is animated or tweaked at
 * runtime either keeps its own `new THREE.MeshStandardMaterial()` or asks
 * for its own slot with a `tag` (materials only dedupe within a tag).
 * The occlusion fade is safe: it swaps in per-building clones.
 */
import * as THREE from 'three';

const cache = new Map();

function keyPart(v) {
  if (v === null || v === undefined) return String(v);
  if (v.isColor) return 'c' + v.getHex();
  if (v.isTexture) return 't' + v.uuid;
  if (typeof v === 'object') return JSON.stringify(v);
  return String(v);
}

function makeKey(params, tag) {
  return tag + '|' + Object.keys(params).sort().map(k => {
    let v = params[k];
    // colour-ish params given as numbers or strings normalise to hex
    if ((k === 'color' || k === 'emissive') && !(v && v.isColor)) v = new THREE.Color(v);
    return `${k}=${keyPart(v)}`;
  }).join(';');
}

/**
 * @param {object} params  MeshStandardMaterial parameters
 * @param {string} [tag]   separate cache namespace (for materials that will
 *                         be mutated together, e.g. 'lamp-glow')
 */
export function standardMat(params, tag = '') {
  const key = makeKey(params, tag);
  let m = cache.get(key);
  if (!m) {
    m = new THREE.MeshStandardMaterial(params);
    m.name = tag ? `shared:${tag}` : 'shared';
    cache.set(key, m);
  }
  return m;
}

/** Number of distinct shared materials created so far (shown in ?debug). */
export function sharedMaterialCount() { return cache.size; }
