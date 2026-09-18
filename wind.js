/**
 * wind.js — Shared wind field for every plant in the town
 *
 * Port of Bruno Simon's `Wind.js` (folio-2025) to plain GLSL / WebGL:
 * one set of uniforms, one `windOffset(worldXZ)` function, and every
 * material that sways samples the same field — so leaves, blooms, bushes,
 * grass and flowers all lean and gust together.
 *
 *   windOffset(p) = dir * (noise(p*0.2 + dir*t) + noise(p*0.1 + dir*t*0.2)) * strength
 *
 * `attachWind(material, opts)` injects it into a MeshStandardMaterial via
 * onBeforeCompile:
 *   - mode 'vertex' : displaces vertices (weighted by height) — blooms, flowers
 *   - mode 'leaf'   : vertex sway + rotates the alphaMap UV by the wind
 *                     magnitude (Bruno's leaf flutter) + two-tone shading
 *                     against the sun direction — tree crowns and bushes
 *
 * Uniform objects are shared by reference, so `WIND.update(delta)` once per
 * frame moves everything.
 */

import * as THREE from 'three';

// ── Tiling value-noise texture (Bruno renders Perlin on the GPU; a 256²
//    DataTexture built once at boot is plenty for a wind field) ──────────
function makeNoiseTexture(size = 256, seed = 7) {
  let s = seed >>> 0;
  const rnd = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
  const lattice = 16;
  const grid = new Float32Array(lattice * lattice);
  for (let i = 0; i < grid.length; i++) grid[i] = rnd();

  const smooth = t => t * t * (3 - 2 * t);
  const g = (i, j) => grid[((j % lattice + lattice) % lattice) * lattice + ((i % lattice + lattice) % lattice)];
  const sample = (x, y) => {
    const xi = Math.floor(x), yi = Math.floor(y), tx = smooth(x - xi), ty = smooth(y - yi);
    const a = g(xi, yi) + (g(xi + 1, yi) - g(xi, yi)) * tx;
    const b = g(xi, yi + 1) + (g(xi + 1, yi + 1) - g(xi, yi + 1)) * tx;
    return a + (b - a) * ty;
  };

  const data = new Uint8Array(size * size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let v = 0, amp = 0.5, f = 1;
      for (let o = 0; o < 4; o++) {
        v += sample((x / size) * lattice * f, (y / size) * lattice * f) * amp;
        amp *= 0.5; f *= 2;
      }
      data[y * size + x] = Math.min(255, Math.round(v * 255 / 0.9375));
    }
  }
  const tex = new THREE.DataTexture(data, size, size, THREE.RedFormat);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.magFilter = tex.minFilter = THREE.LinearFilter;
  tex.needsUpdate = true;
  return tex;
}

// ── The field ───────────────────────────────────────────────────
const ANGLE = Math.PI * 0.6;   // Bruno's default; blows from the south-west

export const WIND = {
  uniforms: {
    uWindNoise:    { value: makeNoiseTexture() },
    uWindDir:      { value: new THREE.Vector2(Math.sin(ANGLE), Math.cos(ANGLE)) },
    uWindStrength: { value: 0.35 },    // 0–1 (Bruno: 0.5, remapped 0.1–1 by weather)
    uWindFreq:     { value: 0.5 },     // Bruno: positionFrequency
    uWindTime:     { value: 0 },
  },
  timeFrequency: 0.1,
  /** Change the wind direction (radians, 0 = blowing toward +Z). */
  setAngle(a) {
    this.uniforms.uWindDir.value.set(Math.sin(a), Math.cos(a));
  },
  /** Per-frame. Time advances faster in stronger wind (gusts feel gustier). */
  update(delta) {
    this.uniforms.uWindTime.value += delta * this.timeFrequency * this.uniforms.uWindStrength.value;
  },
};

export const WIND_GLSL = /* glsl */`
  uniform sampler2D uWindNoise;
  uniform vec2  uWindDir;
  uniform float uWindStrength;
  uniform float uWindFreq;
  uniform float uWindTime;

  vec2 windOffset(vec2 worldXZ) {
    vec2 p = worldXZ * uWindFreq;
    float n1 = texture2D(uWindNoise, p * 0.2 + uWindDir * uWindTime).r - 0.5;
    float n2 = texture2D(uWindNoise, p * 0.1 + uWindDir * uWindTime * 0.2).r - 0.5;
    return uWindDir * (n1 + n2) * uWindStrength;
  }
`;

/**
 * Inject the wind into a MeshStandardMaterial.
 * @param {THREE.Material} material
 * @param {object} [opts]
 * @param {number} [opts.amplitude=1]  vertex displacement scale (world units at full weight)
 * @param {number} [opts.yOffset=0]    added to local y before the 0–1 height weight
 *                                     (small props like blooms use 1 so they sway fully)
 * @param {'vertex'|'leaf'} [opts.mode='vertex']
 * @param {THREE.Vector3} [opts.sunDir]  world sun direction (leaf mode; converted to view space per frame)
 * @param {number[]} [opts.tint]         leaf mode: colour multiplier on the sun-facing side (Bruno's colorB / colorA)
 * @param {number} [opts.flutter=2.2]    leaf mode: UV rotation per unit of wind magnitude
 */
export function attachWind(material, opts = {}) {
  const {
    amplitude = 1, yOffset = 0, mode = 'vertex',
    sunDir = new THREE.Vector3(0, 1, 0), tint = [1.2, 1.15, 1.0], flutter = 2.2,
  } = opts;

  const own = {
    uWindAmp:     { value: amplitude },
    uWindYOff:    { value: yOffset },
    uLeafTint:    { value: new THREE.Vector3(...tint) },
    uLeafFlutter: { value: flutter },
    uSunDirView:  { value: new THREE.Vector3(0, 1, 0) },
  };
  material.userData.wind = { own, sunDir: sunDir.clone().normalize(), mode };

  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, WIND.uniforms, own);

    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>
        ${WIND_GLSL}
        uniform float uWindAmp;
        uniform float uWindYOff;
        varying float vWindMag;`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        {
          #ifdef USE_INSTANCING
            vec2 plantXZ = (modelMatrix * instanceMatrix)[3].xz;
          #else
            vec2 plantXZ = modelMatrix[3].xz;
          #endif
          vec2 w = windOffset(plantXZ);
          vWindMag = length(w);
          float weight = clamp(position.y + uWindYOff, 0.0, 1.0);
          transformed.xz += w * uWindAmp * weight;
        }`);

    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
        varying float vWindMag;
        uniform vec3  uLeafTint;
        uniform float uLeafFlutter;
        uniform vec3  uSunDirView;`);

    if (mode === 'leaf') {
      // (a) Bruno: rotateUV(uv, wind.length() * 2.2, vec2(0.5)) on the alpha texture
      shader.fragmentShader = shader.fragmentShader.replace('#include <alphamap_fragment>', `
        #ifdef USE_ALPHAMAP
        {
          float a = vWindMag * uLeafFlutter;
          float ca = cos(a), sa = sin(a);
          vec2 ruv = mat2(ca, -sa, sa, ca) * (vUv - 0.5) + 0.5;
          diffuseColor.a *= texture2D(alphaMap, ruv).g;
        }
        #endif`);
      // (b) two-tone: mix(colorA, colorB, smoothstep(dot(N, sun)))
      shader.fragmentShader = shader.fragmentShader.replace('#include <color_fragment>', `#include <color_fragment>
        {
          float lit = smoothstep(0.0, 1.0, dot(normalize(vNormal), uSunDirView));
          diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * uLeafTint, lit);
        }`);
    }
  };
  material.customProgramCacheKey = () => 'wind-' + mode;
  return material;
}

/**
 * Leaf-mode materials shade against the sun in VIEW space (vNormal is a
 * view-space varying), so refresh the direction whenever the camera moves.
 */
export function updateWindMaterials(materials, camera) {
  for (const m of materials) {
    const w = m.userData.wind;
    if (!w || w.mode !== 'leaf') continue;
    w.own.uSunDirView.value.copy(w.sunDir).transformDirection(camera.matrixWorldInverse);
  }
}
