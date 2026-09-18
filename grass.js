/**
 * grass.js — Grass blades on open ground
 *
 * Port of Bruno Simon's `Grass.js` idea, sized for our town: one
 * BufferGeometry of triangles (3 vertices per blade), blades rotated to
 * face the camera in the vertex shader, and ONLY the tip vertex displaced
 * by the shared wind field. Bruno wraps his blades around the camera; we
 * cover the whole town once since roads and the plaza take most of it.
 *
 * Draw calls: 1. Cost is vertex count, so the blade count comes from the
 * PERF tier (see town-world.js).
 */

import * as THREE from 'three';
import { WIND, WIND_GLSL } from './wind.js';

/**
 * @param scene
 * @param {object} opts
 * @param {number}   opts.count      number of blades to attempt (some are rejected)
 * @param {number}   opts.radius     scatter radius around the origin
 * @param {Function} opts.isOpen     (x, z) => true when grass may grow there
 * @param {number}   [opts.seed]
 */
export function buildGrass(scene, { count = 20000, radius = 60, isOpen = () => true, seed = 5,
                                    bladeWidth = 0.1, bladeHeight = 0.6, baseColor = 0x3f7f33, tipColor = 0x9bcf5a } = {}) {
  let s = seed >>> 0;
  const rng = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };

  const pos = new Float32Array(count * 9);
  const tip = new Float32Array(count * 3);
  const side = new Float32Array(count * 3);
  const rnd = new Float32Array(count * 3);
  let n = 0;
  for (let i = 0; i < count; i++) {
    // uniform disc sample
    const a = rng() * Math.PI * 2, r = Math.sqrt(rng()) * radius;
    const x = Math.sin(a) * r, z = Math.cos(a) * r;
    if (!isOpen(x, z)) continue;
    const h = rng();
    // three vertices per blade share the base position; shape is built in the shader
    for (let k = 0; k < 3; k++) {
      pos[n * 9 + k * 3]     = x;
      pos[n * 9 + k * 3 + 1] = 0;
      pos[n * 9 + k * 3 + 2] = z;
      tip[n * 3 + k]  = k === 0 ? 1 : 0;          // vertex 0 = tip
      side[n * 3 + k] = k === 0 ? 0 : (k === 1 ? -1 : 1);
      rnd[n * 3 + k]  = h;
    }
    n++;
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos.subarray(0, n * 9), 3));
  geo.setAttribute('aTip',  new THREE.BufferAttribute(tip.subarray(0, n * 3), 1));
  geo.setAttribute('aSide', new THREE.BufferAttribute(side.subarray(0, n * 3), 1));
  geo.setAttribute('aRand', new THREE.BufferAttribute(rnd.subarray(0, n * 3), 1));
  geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), radius + 2);

  const mat = new THREE.ShaderMaterial({
    uniforms: Object.assign({
      uBladeW:   { value: bladeWidth },
      uBladeH:   { value: bladeHeight },
      uBase:     { value: new THREE.Color(baseColor) },
      uTip:      { value: new THREE.Color(tipColor) },
      uSunDir:   { value: new THREE.Vector3(0, 1, 0) },
    }, WIND.uniforms, THREE.UniformsUtils.clone(THREE.UniformsLib.fog)),
    vertexShader: /* glsl */`
      ${WIND_GLSL}
      attribute float aTip;
      attribute float aSide;
      attribute float aRand;
      uniform float uBladeW, uBladeH;
      varying float vTip;
      varying float vShade;
      #include <fog_pars_vertex>
      void main() {
        vec3 base = position;
        // patchy height from the same noise the wind uses (Bruno: heightVariation)
        float patchy = texture2D(uWindNoise, base.xz * 0.0321).r + 0.5;
        float h = uBladeH * mix(0.4, 1.0, aRand) * patchy;
        // blade shape: tip straight up, base spread ±width
        vec3 v = base + vec3(aSide * uBladeW, aTip * h, 0.0);
        // face the camera (rotate about the blade base around Y)
        float ang = atan(base.z - cameraPosition.z, base.x - cameraPosition.x) - 1.5707963;
        float ca = cos(ang), sa = sin(ang);
        vec2 d = v.xz - base.xz;
        v.xz = base.xz + vec2(ca * d.x - sa * d.y, sa * d.x + ca * d.y);
        // wind: tip only, scaled by height (Bruno: wind * tipness * height * 2)
        v.xz += windOffset(base.xz) * aTip * h * 2.0;
        vTip = aTip;
        vShade = 0.85 + 0.3 * (texture2D(uWindNoise, base.xz * 0.05).r - 0.5);
        vec4 mvPosition = modelViewMatrix * vec4(v, 1.0);
        gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }`,
    fragmentShader: /* glsl */`
      uniform vec3 uBase, uTip;
      varying float vTip;
      varying float vShade;
      #include <fog_pars_fragment>
      void main() {
        vec3 c = mix(uBase, uTip, vTip) * vShade;
        gl_FragColor = vec4(c, 1.0);
        #include <fog_fragment>
      }`,
    fog: true,
    side: THREE.DoubleSide,
  });

  const mesh = new THREE.Mesh(geo, mat);
  mesh.frustumCulled = false;
  mesh.receiveShadow = false;
  mesh.position.y = 0.01;
  scene.add(mesh);
  return { mesh, material: mat, count: n };
}
