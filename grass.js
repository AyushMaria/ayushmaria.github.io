/**
 * grass.js — the town's grass (§2.16): a velvet lawn with golden drifts
 *
 *   buildGrass() makes two things:
 *
 *   1. The velvet carpet. The lawn is a plush pile, like the felt on a
 *      model railway: `layers` thin shells stacked over the terrain's own
 *      triangles (only those under open grass: no streets, squares, fields,
 *      water or building plots), each cutting out thousands of tiny tapered
 *      strands, so up close it is a carpet of miniature cones — the same
 *      family as the cedars. Drifts of longer and shorter pile give the
 *      ground tone; the upper shells lean with the wind so gusts roll across
 *      as ripples. The shells share the terrain's uniforms, so the lamp
 *      pools still glow on the lawn and wheel tracks press the pile flat.
 *
 *   2. Golden drifts. Long ribbon blades, olive at the root and straw-gold
 *      at the tip, gathered where the lawn meets the forest and along the
 *      river and stream banks. They bend furthest in the wind and a golden
 *      sheen rolls through them with each gust.
 *
 * Cost (high tier): ~10 shell draw calls over the lawn's triangles and one
 * instanced draw for the drifts. The low tier uses 6 shells and fewer blades.
 */
import * as THREE from 'three';
import { WIND, WIND_GLSL } from './wind.js';
import { tileInstances } from './merge-static.js';

// ── Noise used for placement (JS) ─────────────────────────────────
const hash = (x, z) => { const s = Math.sin(x * 127.1 + z * 311.7) * 43758.5453; return s - Math.floor(s); };
function vnoise(x, z) {
  const xi = Math.floor(x), zi = Math.floor(z), tx = x - xi, tz = z - zi;
  const u = tx * tx * (3 - 2 * tx), v = tz * tz * (3 - 2 * tz);
  const a = hash(xi, zi), b = hash(xi + 1, zi), c = hash(xi, zi + 1), d = hash(xi + 1, zi + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
/** 0–1 clumping field: big drifts with smaller patches inside. */
const drift = (x, z) => 0.65 * vnoise(x * 0.06, z * 0.06) + 0.35 * vnoise(x * 0.21 + 7.3, z * 0.21 - 2.1);
function rngOf(seed) { let s = seed >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }

const PILE = 0.38;          // full pile height (world units)
const STRANDS = 6.5;        // strands per world unit, each way

// ════════════════════════════════════════════════════════════════
// 1. VELVET CARPET
// ════════════════════════════════════════════════════════════════

/** The terrain's triangles that lie under open lawn, as a geometry sharing its buffers. */
function lawnGeometry(terrain, keep) {
  const src = terrain.mesh.geometry, P = src.attributes.position, I = src.index.array;
  const out = [];
  for (let t = 0; t < I.length; t += 3) {
    const a = I[t], b = I[t + 1], c = I[t + 2];
    const x = (P.getX(a) + P.getX(b) + P.getX(c)) / 3, z = (P.getZ(a) + P.getZ(b) + P.getZ(c)) / 3;
    const y = (P.getY(a) + P.getY(b) + P.getY(c)) / 3;
    if (keep(x, y, z)) out.push(a, b, c);
  }
  const g = new THREE.BufferGeometry();
  for (const name of ['position', 'normal', 'color']) if (src.attributes[name]) g.setAttribute(name, src.attributes[name]);
  g.setIndex(new THREE.BufferAttribute(new Uint32Array(out), 1));
  g.computeBoundingSphere();
  return g;
}

function shellMaterial(layer, terrainUniforms) {
  const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1, vertexColors: true });
  const own = { uLayer: { value: layer }, uPile: { value: PILE } };
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, WIND.uniforms, terrainUniforms, own);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>
        ${WIND_GLSL}
        uniform float uLayer, uPile;
        varying vec3 vShellW;`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        {
          vec3 wpos = (modelMatrix * vec4(transformed, 1.0)).xyz;
          transformed.y += uLayer * uPile + 0.015;
          transformed.xz += windOffset(wpos.xz) * uLayer * uLayer * 0.45;
        }`)
      .replace('#include <project_vertex>', '#include <project_vertex>\nvShellW = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
        uniform float uLayer, uPile, uMaskExt, uTrackExt, uTrackOn, uLampLevel;
        uniform sampler2D uMask, uTrack;
        uniform vec3 uLamps[${terrainUniforms.uLamps.value.length}];
        uniform int uLampCount;
        varying vec3 vShellW;
        float gh(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
        float gn(vec2 p) { vec2 i = floor(p), f = fract(p); vec2 u = f * f * (3.0 - 2.0 * f);
          return mix(mix(gh(i), gh(i + vec2(1, 0)), u.x), mix(gh(i + vec2(0, 1)), gh(i + vec2(1, 1)), u.x), u.y); }`)
      .replace('#include <clipping_planes_fragment>', `#include <clipping_planes_fragment>
        float trod = 0.0;
        {
          vec2 xz = vShellW.xz;
          vec4 m = texture2D(uMask, vec2(xz.x / (2.0 * uMaskExt) + 0.5, 0.5 - xz.y / (2.0 * uMaskExt)));
          float bare = max(max(m.r, m.g), m.b * 1.6);
          if (uTrackOn > 0.5) trod = texture2D(uTrack, vec2(xz.x / uTrackExt + 0.5, 0.5 - xz.y / uTrackExt)).a;
          float pile = 0.55 + 0.45 * gn(xz * 0.09) * 1.2;          // drifts of longer and shorter pile
          vec2 cell = floor(xz * ${STRANDS.toFixed(1)});
          float strand = (0.35 + 0.65 * gh(cell)) * pile * (1.0 - bare * 1.4) * mix(1.0, 0.15, trod);
          vec2 inCell = fract(xz * ${STRANDS.toFixed(1)}) - 0.5;      // each strand tapers to a point
          float rad = length(inCell) / max(0.001, 0.72 * (1.0 - 0.85 * uLayer / max(strand, 0.001)));
          if (uLayer > strand || rad > 1.0) discard;
        }`)
      .replace('#include <color_fragment>', `#include <color_fragment>
        {
          float tone = gn(vShellW.xz * 0.05);
          vec3 low = mix(vec3(0.20, 0.36, 0.16), vec3(0.26, 0.40, 0.14), tone);
          vec3 hi  = mix(vec3(0.55, 0.78, 0.34), vec3(0.76, 0.80, 0.38), tone);
          diffuseColor.rgb *= mix(low, hi, uLayer) * mix(1.0, 0.7, trod);
        }`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        {
          // the street lamps' warm pools, as on the bare terrain
          float glow = 0.0;
          for (int i = 0; i < ${terrainUniforms.uLamps.value.length}; i++) {
            if (i >= uLampCount) break;
            vec3 lp = uLamps[i];
            float d = length(vShellW.xz - lp.xz) / 3.25;
            glow += pow(max(1.0 - d, 0.0), 2.0) * step(abs(vShellW.y - lp.y), 4.0);
          }
          totalEmissiveRadiance += vec3(1.0, 0.70, 0.36) * glow * uLampLevel * (0.4 + 0.6 * uLayer);
        }`);
  };
  mat.customProgramCacheKey = () => 'velvet-v1';
  return mat;
}

// ════════════════════════════════════════════════════════════════
// 2. GOLDEN DRIFTS
// ════════════════════════════════════════════════════════════════

/** A tapered ribbon of `segs` segments bending along +z; aH = 0 at the root, 1 at the tip. */
function ribbon(width, height, segs, bend, rotY) {
  const pos = [], aH = [], idx = [], m = new THREE.Matrix4().makeRotationY(rotY), v = new THREE.Vector3();
  for (let i = 0; i <= segs; i++) {
    const t = i / segs, w = width * (1 - t) * (1 - t * 0.15);
    for (const s of [-1, 1]) { v.set(s * w / 2, height * t, bend * t * t).applyMatrix4(m); pos.push(v.x, v.y, v.z); aH.push(t); }
  }
  for (let i = 0; i < segs; i++) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
  return { pos, aH, idx };
}
function driftGeometry() {
  const parts = [ribbon(0.13, 1.0, 4, 0.38, 0), ribbon(0.13, 0.8, 4, 0.38, 2.4)];
  const pos = [], aH = [], idx = [];
  let off = 0;
  for (const p of parts) { pos.push(...p.pos); aH.push(...p.aH); idx.push(...p.idx.map(k => k + off)); off += p.pos.length / 3; }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('aH', new THREE.Float32BufferAttribute(aH, 1));
  g.setIndex(idx);
  return g;
}
function driftMaterial() {
  return new THREE.ShaderMaterial({
    uniforms: Object.assign({
      uBase: { value: new THREE.Color(0x4a6a2c) }, uTip: { value: new THREE.Color(0xf2d27a) },
      uSheenCol: { value: new THREE.Color(0xfff4c4) }, uSheen: { value: 0.75 }, uWindAmp: { value: 1.25 },
    }, WIND.uniforms, THREE.UniformsUtils.clone(THREE.UniformsLib.fog)),
    vertexShader: /* glsl */`
      ${WIND_GLSL}
      attribute float aH;
      uniform float uWindAmp;
      varying float vH; varying vec3 vTint; varying float vWave;
      #include <fog_pars_vertex>
      void main() {
        vec4 wp = modelMatrix * instanceMatrix * vec4(position, 1.0);
        vec2 root = (modelMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xz;
        vec2 w = windOffset(root);
        float bendW = aH * aH;
        wp.xz += w * uWindAmp * bendW * 1.6;
        wp.y -= length(w) * uWindAmp * bendW * 0.35;          // bowing blades get shorter
        vH = aH;
        vWave = clamp(length(w) * 2.2, 0.0, 1.0);
        #ifdef USE_INSTANCING_COLOR
          vTint = instanceColor;
        #else
          vTint = vec3(1.0);
        #endif
        vec4 mvPosition = viewMatrix * wp;
        gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }`,
    fragmentShader: /* glsl */`
      uniform vec3 uBase, uTip, uSheenCol; uniform float uSheen;
      varying float vH; varying vec3 vTint; varying float vWave;
      #include <fog_pars_fragment>
      void main() {
        vec3 c = mix(uBase, uTip, smoothstep(0.0, 1.0, vH)) * vTint;
        c *= 0.62 + 0.38 * vH;                                 // darker down in the thatch
        c = mix(c, uSheenCol, uSheen * vWave * vH * vH);       // the wind's golden sheen
        gl_FragColor = vec4(c, 1.0);
        #include <fog_fragment>
      }`,
    side: THREE.DoubleSide,
    fog: true,
  });
}

/**
 * @param scene
 * @param {object} o
 * @param {object}   o.terrain     buildTerrain() result (mesh, mask, uniforms)
 * @param {object}   o.layout      buildLayout() result
 * @param {Function} o.heightAt    (x, z) => ground height
 * @param {Function} o.isOpen      (x, z) => true where grass may grow (no road, collider…)
 * @param {number}   o.layers      velvet shells (high 10, low 6)
 * @param {number}   o.drifts      golden blades to attempt
 * @param {number[]} o.center      [x, z] of the lawn area
 * @param {number}   o.radius      lawn radius round the centre
 */
export function buildGrass(scene, { terrain, layout: L, heightAt, isOpen, layers = 10, drifts = 20000, center = [0, 0], radius = 80 }) {
  const meshes = [];
  const fields = L.fields, plots = [...L.buildings];
  const inRect = (x, z, r, pad) => {
    const c = Math.cos(r.heading || 0), s = Math.sin(r.heading || 0), dx = x - r.x, dz = z - r.z;
    return Math.abs(dx * c - dz * s) < r.w / 2 + pad && Math.abs(dx * s + dz * c) < r.d / 2 + pad;
  };

  // ── 1. velvet shells over the lawn's triangles ─────────────────
  const lawn = lawnGeometry(terrain, (x, y, z) => {
    if (Math.hypot(x - center[0], z - center[1]) > radius) return false;
    if (y < L.river.level + 0.15 || L.poolAt(x, z, 1.15)) return false;
    const m = terrain.mask.sample(x, z);
    if (m.r > 0.5 || m.g > 0.5 || m.b > 0.6) return false;
    for (const f of fields) if (inRect(x, z, f, 0.5)) return false;
    for (const b of plots) {
      if (b.stadium) {                                    // the stadium is oval: lawn grows into its plot's corners
        const c = Math.cos(b.heading || 0), sn = Math.sin(b.heading || 0), dx = x - b.x, dz = z - b.z;
        const u = (dx * c - dz * sn) / (b.w / 2 + 0.1), v = (dx * sn + dz * c) / (b.d / 2 + 0.1);
        if (u * u + v * v < 1) return false;
      } else if (inRect(x, z, b, 0.1)) return false;
    }
    return true;
  });
  for (let l = 1; l <= layers; l++) {
    const mesh = new THREE.Mesh(lawn, shellMaterial(l / layers, terrain.uniforms));
    mesh.receiveShadow = true;
    mesh.renderOrder = 1 + l;
    mesh.name = 'lawn-shell-' + l;
    scene.add(mesh);
    meshes.push(mesh);
  }

  // ── 2. golden drifts where the lawn meets the forest or the water ──
  const rng = rngOf(11), pts = [];
  const nearWater = (x, z, d) => {
    for (const p of L.river.path.pts) if (Math.abs(p.x - x) < d + L.river.hw && Math.hypot(p.x - x, p.z - z) < d + L.river.hw) return true;
    for (const p of L.stream.path.pts) if (Math.abs(p.x - x) < d + L.stream.hw && Math.hypot(p.x - x, p.z - z) < d + L.stream.hw) return true;
    return false;
  };
  for (let i = 0; i < drifts * 4 && pts.length < drifts; i++) {
    const a = rng() * Math.PI * 2, r = Math.sqrt(rng()) * radius;
    const x = center[0] + Math.sin(a) * r, z = center[1] + Math.cos(a) * r;
    const d = drift(x, z), roll = rng();
    if (roll > (d - 0.3) * 2.4) continue;                                // gathered in drifts
    const edge = (L.treeNear(x, z, 4.2) && !L.treeNear(x, z, 0.9)) || nearWater(x, z, 4.5);
    if (!edge || !isOpen(x, z)) continue;
    pts.push({ x, z, y: heightAt(x, z), d, r: rng(), yaw: rng() * Math.PI * 2 });
  }
  if (pts.length) {
    const im = new THREE.InstancedMesh(driftGeometry(), driftMaterial(), pts.length);
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), p = new THREE.Vector3(), s = new THREE.Vector3(), c = new THREE.Color(), Y = new THREE.Vector3(0, 1, 0);
    const gold = new THREE.Color(0xd9e6a8);
    pts.forEach((pt, i) => {
      const sc = 0.75 + pt.r * 0.5 + (pt.d - 0.5) * 0.8;
      m4.compose(p.set(pt.x, pt.y - 0.02, pt.z), q.setFromAxisAngle(Y, pt.yaw), s.set(sc, sc * (0.85 + pt.r * 0.3), sc));
      im.setMatrixAt(i, m4);
      im.setColorAt(i, c.setRGB(1, 1, 1).lerp(gold, drift(pt.x * 3, pt.z * 3)));
    });
    im.instanceMatrix.needsUpdate = true;
    im.instanceColor.needsUpdate = true;
    im.name = 'golden-drifts';
    scene.add(im);
    meshes.push(tileInstances(im, { pad: 0.6 }));    // culled per tile; the pad covers the wind sway
  }

  return {
    meshes,
    count: pts.length,
    lawnTriangles: lawn.index.count / 3,
    // the shells read the terrain's own track map; nothing extra to wire
    setTrackMap() {},
  };
}
