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

// ════════════════════════════════════════════════════════════════
// Occlusion cut — see-through townhouses and walls near the cart
// ════════════════════════════════════════════════════════════════
// The camera looks down from the south-east, so on the hill the houses and
// the wall on the camera side of a street hide the cart behind them. The
// portfolio buildings fade (town-world.js), but the townhouses are one
// InstancedMesh and can't fade one by one. Instead their materials drop
// pixels (an ordered dither) inside a soft tube from the camera to the cart:
// you see the cart through a hole that follows it, and the shadow map,
// which uses its own depth material, is unaffected.

export const OCCLUSION_CUT = {
  uniforms: {
    uCutA:  { value: new THREE.Vector3() },   // camera
    uCutB:  { value: new THREE.Vector3() },   // cart (+ up)
    uCutR:  { value: 3.4 },                   // tube radius (world units)
    uCutOn: { value: 0 },
  },
  /** Call once per frame after the camera has moved. */
  update(cameraPos, cartPos) {
    const u = this.uniforms;
    u.uCutA.value.copy(cameraPos);
    u.uCutB.value.set(cartPos.x, cartPos.y + 1.3, cartPos.z);
    u.uCutOn.value = 1;
  },
};

const _cut = new WeakSet();
/** Patch a material (in place) so it takes part in the occlusion cut. */
export function withOcclusionCut(material) {
  if (_cut.has(material)) return material;
  _cut.add(material);
  const prev = material.onBeforeCompile;
  material.onBeforeCompile = (shader, renderer) => {
    if (prev) prev(shader, renderer);
    Object.assign(shader.uniforms, OCCLUSION_CUT.uniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vCutWorld;')
      .replace('#include <project_vertex>', `#include <project_vertex>
        vec4 cutWP = vec4(transformed, 1.0);
        #ifdef USE_INSTANCING
          cutWP = instanceMatrix * cutWP;
        #endif
        vCutWorld = (modelMatrix * cutWP).xyz;`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
        varying vec3 vCutWorld;
        uniform vec3 uCutA, uCutB; uniform float uCutR, uCutOn;
        float cutBayer2(vec2 a) { a = floor(a); return fract(dot(a, vec2(0.5, a.y * 0.75))); }
        float cutBayer4(vec2 a) { return cutBayer2(0.5 * a) * 0.25 + cutBayer2(a); }`)
      .replace('#include <clipping_planes_fragment>', `#include <clipping_planes_fragment>
        {
          vec3 ab = uCutB - uCutA;
          float t = clamp(dot(vCutWorld - uCutA, ab) / max(dot(ab, ab), 1e-4), 0.0, 1.0);
          float d = length(vCutWorld - (uCutA + ab * t));
          float f = uCutOn * (1.0 - smoothstep(uCutR * 0.55, uCutR, d)) * (1.0 - step(0.975, t));
          if (f > 0.0 && cutBayer4(gl_FragCoord.xy) < f * 0.9) discard;
        }`);
  };
  material.customProgramCacheKey = () => 'occlusion-cut|' + (prev ? prev.toString().length : 0);
  material.needsUpdate = true;
  return material;
}
