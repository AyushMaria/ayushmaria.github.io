/**
 * terrain.js — the hill, the streets painted on it, and the water
 *
 *   buildTerrain()  one mesh for the whole landscape, from the carved height
 *                   field in town-layout.js. Streets, squares and paths are
 *                   not separate planes laid on top (which z-fight on slopes
 *                   and look like paper): they're painted into a mask texture
 *                   and blended in the ground shader — cobbles, warm square
 *                   stones, dirt shoulders and field furrows. The same shader
 *                   draws the wheel tracks in the grass and the warm pools of
 *                   lamplight on the ground (one draw call for all of it).
 *   buildWater()    river, stream ribbons, pools, the little falls and the
 *                   spring, with one stylised water shader.
 *   buildBridge()   the stone bridge where the High Street crosses the river.
 */

import * as THREE from 'three';
import { grassTexture, cobbleTexture, stoneTexture } from './textures.js';
import { propMaterials } from './town-props.js';
import { standardMat } from './materials.js';
import { obb } from './colliders.js';

const MAX_LAMPS = 16;          // nearest lamps to the view drawn as ground pools (see updateLamps)

// ════════════════════════════════════════════════════════════════
// MASK: streets, squares, paths, fields painted top-down
// ════════════════════════════════════════════════════════════════
// R = cobbled street, G = warm square stones (with R), B = dirt.
function paintMask(L, size, ext) {
  const cv = document.createElement('canvas');
  cv.width = cv.height = size;
  const ctx = cv.getContext('2d');
  const k = size / (2 * ext);
  const px = (x) => (x + ext) * k, pz = (z) => (z + ext) * k;
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, size, size);
  ctx.globalCompositeOperation = 'lighter';
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  const strokePath = (pts, width, style) => {
    ctx.strokeStyle = style; ctx.lineWidth = width * k;
    ctx.beginPath();
    pts.forEach((p, i) => (i ? ctx.lineTo(px(p.x), pz(p.z)) : ctx.moveTo(px(p.x), pz(p.z))));
    ctx.stroke();
  };
  const fillPoly = (pts, style) => {
    ctx.fillStyle = style; ctx.beginPath();
    pts.forEach(([x, z], i) => (i ? ctx.lineTo(px(x), pz(z)) : ctx.moveTo(px(x), pz(z))));
    ctx.closePath(); ctx.fill();
  };

  // Fields: furrows (dirt rows) across each field
  for (const f of L.fields) {
    ctx.save();
    ctx.translate(px(f.x), pz(f.z));
    ctx.rotate(-f.heading);
    ctx.fillStyle = 'rgba(0,0,255,0.55)';
    for (let r = -f.d / 2; r < f.d / 2; r += 1.6) ctx.fillRect(-f.w / 2 * k, r * k, f.w * k, 0.75 * k);
    ctx.fillStyle = 'rgba(0,0,255,0.18)';
    ctx.fillRect(-f.w / 2 * k, -f.d / 2 * k, f.w * k, f.d * k);
    ctx.restore();
  }
  // Muddy banks (mostly under water; show where the bank meets it)
  strokePath(L.river.path.pts, L.river.width + 3.5, 'rgba(0,0,255,0.35)');
  strokePath(L.stream.path.pts, L.stream.width + 1.6, 'rgba(0,0,255,0.32)');
  for (const p of L.pools) {
    ctx.save(); ctx.translate(px(p.x), pz(p.z)); ctx.rotate(p.rot);
    ctx.fillStyle = 'rgba(0,0,255,0.4)';
    ctx.beginPath(); ctx.ellipse(0, 0, (p.rx + 1) * k, (p.rz + 1) * k, 0, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }
  // Trodden earth along the foot of the wall
  {
    const P = L.wall.path.pts;
    strokePath([...P, P[0]], 4.2, 'rgba(0,0,255,0.22)');
  }
  // Soft dirt shoulders, then the cobbles
  for (const r of L.roads) {
    strokePath(r.path.pts, r.width + 2.6, 'rgba(0,0,255,0.16)');
    strokePath(r.path.pts, r.width + 1.3, 'rgba(0,0,255,0.28)');
  }
  for (const p of L.paths) {
    strokePath(p.path.pts, p.width + 1, 'rgba(0,0,255,0.3)');
    strokePath(p.path.pts, p.width, p.key === 'steps' ? 'rgba(170,0,200,1)' : 'rgba(0,0,230,1)');
  }
  for (const pl of L.plazas) {
    ctx.save();
    ctx.strokeStyle = 'rgba(0,0,255,0.3)'; ctx.lineWidth = 1.6 * k;
    ctx.beginPath(); pl.pts.forEach(([x, z], i) => (i ? ctx.lineTo(px(x), pz(z)) : ctx.moveTo(px(x), pz(z)))); ctx.closePath(); ctx.stroke();
    ctx.restore();
    fillPoly(pl.pts, 'rgba(255,255,0,1)');
  }
  for (const r of L.roads) strokePath(r.path.pts, r.width, 'rgba(255,0,0,1)');

  const data = ctx.getImageData(0, 0, size, size).data;
  const tex = new THREE.CanvasTexture(cv);
  tex.anisotropy = 4;
  tex.needsUpdate = true;
  return {
    canvas: cv, texture: tex, ext,
    /** {r, g, b} 0–1 at a world point (nearest texel) */
    sample(x, z) {
      const i = Math.max(0, Math.min(size - 1, Math.floor(px(x)))), j = Math.max(0, Math.min(size - 1, Math.floor(pz(z))));
      const o = (j * size + i) * 4;
      return { r: data[o] / 255, g: data[o + 1] / 255, b: data[o + 2] / 255 };
    },
  };
}

// ════════════════════════════════════════════════════════════════
// TERRAIN
// ════════════════════════════════════════════════════════════════

/**
 * @param {THREE.Scene} scene
 * @param {object} L  buildLayout() result
 * @param {{ maskRes?: number }} [opts]
 */
export function buildTerrain(scene, L, { maskRes = 2048 } = {}) {
  const { ext, n, step, data } = L.grid;
  const mask = paintMask(L, maskRes, 100);

  // ── Geometry: the height grid as one triangle mesh ────────────
  const pos = new Float32Array(n * n * 3), uv = new Float32Array(n * n * 2), col = new Float32Array(n * n * 3);
  const fieldTint = [1.22, 1.06, 0.62], bankTint = [0.9, 0.84, 0.72];
  const inField = (x, z) => L.fields.some(f => {
    const dx = x - f.x, dz = z - f.z, c = Math.cos(f.heading), s = Math.sin(f.heading);
    return Math.abs(dx * c - dz * s) < f.w / 2 && Math.abs(dx * s + dz * c) < f.d / 2;
  });
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    const k = j * n + i, x = -ext + i * step, z = -ext + j * step, y = data[k];
    pos[k * 3] = x; pos[k * 3 + 1] = y; pos[k * 3 + 2] = z;
    uv[k * 2] = (x + 160) / 320; uv[k * 2 + 1] = (z + 160) / 320;   // grass texture repeats every 8 units (as before)
    // vertex tint: golden fields, darker damp banks near water, earthier on steep ground
    let r = 1, g = 1, b = 1;
    if (inField(x, z)) { r = fieldTint[0]; g = fieldTint[1]; b = fieldTint[2]; }
    else {
      const gx = (data[k + (i < n - 1 ? 1 : 0)] - data[k - (i > 0 ? 1 : 0)]) / (2 * step);
      const gz = (data[k + (j < n - 1 ? n : 0)] - data[k - (j > 0 ? n : 0)]) / (2 * step);
      const steep = Math.min(1, Math.max(0, (Math.hypot(gx, gz) - 0.35) / 0.5));
      r = 1 - steep * 0.08; g = 1 - steep * 0.14; b = 1 - steep * 0.2;
      if (y < 0.1) { const w = Math.min(1, (0.1 - y) / 0.8); r = r + (bankTint[0] - r) * w; g = g + (bankTint[1] - g) * w; b = b + (bankTint[2] - b) * w; }
    }
    col[k * 3] = r; col[k * 3 + 1] = g; col[k * 3 + 2] = b;
  }
  const idx = new Uint32Array((n - 1) * (n - 1) * 6);
  let t = 0;
  for (let j = 0; j < n - 1; j++) for (let i = 0; i < n - 1; i++) {
    const a = j * n + i, b = a + 1, c = a + n, d = c + 1;
    idx[t++] = a; idx[t++] = c; idx[t++] = b;          // same split as L.groundAt()
    idx[t++] = b; idx[t++] = c; idx[t++] = d;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geo.setIndex(new THREE.BufferAttribute(idx, 1));
  geo.computeVertexNormals();
  geo.computeBoundingSphere();

  // ── Material: grass + painted streets + tracks + lamplight ────
  const cobble = cobbleTexture();
  const uniforms = {
    uMask:      { value: mask.texture },
    uMaskExt:   { value: mask.ext },
    uCobble:    { value: cobble },
    uTrack:     { value: null },
    uTrackExt:  { value: 160 },
    uTrackOn:   { value: 0 },
    uLamps:     { value: Array.from({ length: MAX_LAMPS }, () => new THREE.Vector3(0, -999, 0)) },
    uLampCount: { value: 0 },
    uLampLevel: { value: 0.25 },
  };
  const material = new THREE.MeshStandardMaterial({ map: grassTexture(), color: 0xb9d89a, roughness: 1, vertexColors: true });
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vTerrainW;')
      .replace('#include <project_vertex>', '#include <project_vertex>\nvTerrainW = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
        varying vec3 vTerrainW;
        uniform sampler2D uMask, uCobble, uTrack;
        uniform float uMaskExt, uTrackExt, uTrackOn, uLampLevel;
        uniform vec3 uLamps[${MAX_LAMPS}];
        uniform int uLampCount;`)
      .replace('#include <color_fragment>', `#include <color_fragment>
        {
          vec2 xz = vTerrainW.xz;
          vec4 m = texture2D(uMask, vec2(xz.x / (2.0 * uMaskExt) + 0.5, 0.5 - xz.y / (2.0 * uMaskExt)));
          float road = clamp(max(m.r, m.g), 0.0, 1.0);
          vec3 stones = texture2D(uCobble, xz / 3.0).rgb;
          vec3 cob = stones * mix(vec3(0.97, 0.96, 0.95), vec3(0.851, 0.769, 0.639), m.g);
          // the steps path: big pale flags (purple in the mask = R+B)
          float flags = m.r * m.b;
          cob = mix(cob, texture2D(uCobble, xz / 6.0).rgb * vec3(0.9, 0.86, 0.78), flags);
          vec3 dirt = vec3(0.55, 0.42, 0.27) * (0.82 + 0.36 * texture2D(uCobble, xz * 0.071).r);
          vec3 base = diffuseColor.rgb;
          if (uTrackOn > 0.5) {
            float trod = texture2D(uTrack, vec2(xz.x / uTrackExt + 0.5, 0.5 - xz.y / uTrackExt)).a;
            base = mix(base, vec3(0.42, 0.30, 0.17), trod * 0.8);
          }
          base = mix(base, dirt, clamp(m.b - flags, 0.0, 1.0));
          diffuseColor.rgb = mix(base, cob, road);
        }`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        {
          float glow = 0.0;
          for (int i = 0; i < ${MAX_LAMPS}; i++) {
            if (i >= uLampCount) break;
            vec3 lp = uLamps[i];
            float d = length(vTerrainW.xz - lp.xz) / 3.25;
            glow += pow(max(1.0 - d, 0.0), 2.0) * step(abs(vTerrainW.y - lp.y), 4.0);
          }
          totalEmissiveRadiance += vec3(1.0, 0.70, 0.36) * glow * uLampLevel;
        }`);
  };
  material.customProgramCacheKey = () => 'terrain-v1';

  const mesh = new THREE.Mesh(geo, material);
  mesh.receiveShadow = true;
  mesh.name = 'terrain';
  let lamps = [];
  scene.add(mesh);

  // Flat ground beyond the height field, under the fog
  const outer = new THREE.Mesh(new THREE.RingGeometry(ext - 2, 420, 64, 1), new THREE.MeshStandardMaterial({ map: grassTexture(), color: 0xb9d89a, roughness: 1 }));
  outer.rotation.x = -Math.PI / 2;
  outer.position.y = -0.05;
  outer.receiveShadow = true;
  scene.add(outer);

  return {
    mesh, material, mask,
    /** shared with the lawn's velvet shells (grass.js): mask, tracks, lamp pools */
    uniforms,
    setTrackMap(tex, extent) { uniforms.uTrack.value = tex; uniforms.uTrackExt.value = extent; uniforms.uTrackOn.value = 1; },
    /** lamps: [{x, y, z}] — ground y of each lamp */
    setLamps(list) { lamps = list.map(l => ({ x: l.x, y: l.y, z: l.z, d: 0 })); this.updateLamps({ x: 0, z: 0 }); },
    /** Upload the lamps nearest the view (the pools are only ever seen near the cart). */
    updateLamps(focus) {
      if (!lamps.length) return;
      for (const l of lamps) l.d = (l.x - focus.x) ** 2 + (l.z - focus.z) ** 2;
      lamps.sort((a, b) => a.d - b.d);
      const n = Math.min(lamps.length, MAX_LAMPS);
      for (let i = 0; i < n; i++) uniforms.uLamps.value[i].set(lamps[i].x, lamps[i].y, lamps[i].z);
      uniforms.uLampCount.value = n;
    },
    setLampLevel(v) { uniforms.uLampLevel.value = v; },
  };
}

// ════════════════════════════════════════════════════════════════
// WATER
// ════════════════════════════════════════════════════════════════

const WATER_VERT = /* glsl */`
  varying vec2 vUv;
  varying vec3 vWorld;
  #include <fog_pars_vertex>
  void main() {
    vUv = uv;
    vec4 wp = modelMatrix * vec4(position, 1.0);
    vWorld = wp.xyz;
    vec4 mvPosition = viewMatrix * wp;
    gl_Position = projectionMatrix * mvPosition;
    #include <fog_vertex>
  }`;
const NOISE = /* glsl */`
  float wHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float wNoise(vec2 p) {
    vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
    return mix(mix(wHash(i), wHash(i + vec2(1, 0)), f.x), mix(wHash(i + vec2(0, 1)), wHash(i + vec2(1, 1)), f.x), f.y);
  }`;
const WATER_FRAG = /* glsl */`
  uniform float uTime, uFlow;
  uniform vec3 uDeep, uShallow, uGlint;
  varying vec2 vUv;
  varying vec3 vWorld;
  #include <fog_pars_fragment>
  ${NOISE}
  void main() {
    float edge = 1.0 - abs(vUv.x * 2.0 - 1.0);              // 0 at the banks, 1 mid-stream
    vec3 col = mix(uShallow, uDeep, smoothstep(0.05, 0.75, edge));
    vec2 q = vec2(vUv.x * 4.0, vUv.y * 0.45 - uTime * uFlow);
    float n = wNoise(q * 2.0) * 0.6 + wNoise(q * 5.0) * 0.4;
    col *= 0.9 + n * 0.22;
    float streak = smoothstep(0.64, 0.82, wNoise(vec2(vUv.x * 9.0, vUv.y * 0.22 - uTime * uFlow * 1.5)));
    col += uGlint * streak * 0.16;
    float g = wNoise(vWorld.xz * 1.3 + vec2(uTime * 0.4, -uTime * 0.3)) * wNoise(vWorld.xz * 2.1 - vec2(uTime * 0.25, uTime * 0.5));
    col += uGlint * smoothstep(0.5, 0.7, g) * 0.3;             // evening sun glints
    col = mix(col, vec3(0.86, 0.9, 0.84), (1.0 - smoothstep(0.0, 0.14, edge)) * 0.4);
    gl_FragColor = vec4(col, 1.0);
    #include <fog_fragment>
  }`;
const FALL_FRAG = /* glsl */`
  uniform float uTime;
  varying vec2 vUv;
  varying vec3 vWorld;
  #include <fog_pars_fragment>
  ${NOISE}
  void main() {
    float side = smoothstep(0.0, 0.18, vUv.x) * smoothstep(1.0, 0.82, vUv.x);
    float st = wNoise(vec2(vUv.x * 7.0, vUv.y * 1.6 + uTime * 2.6));
    vec3 col = mix(vec3(0.6, 0.79, 0.86), vec3(0.97, 0.98, 0.96), smoothstep(0.35, 0.8, st));
    float a = side * (0.62 + 0.38 * st);
    gl_FragColor = vec4(col, a);
    #include <fog_fragment>
  }`;
const FOAM_FRAG = /* glsl */`
  uniform float uTime;
  varying vec2 vUv;
  varying vec3 vWorld;
  #include <fog_pars_fragment>
  ${NOISE}
  void main() {
    float r = length(vUv - 0.5) * 2.0;
    float n = wNoise(vWorld.xz * 3.0 + vec2(uTime * 1.4, -uTime));
    float a = (1.0 - smoothstep(0.35, 1.0, r)) * smoothstep(0.3, 0.7, n + 0.25 * (1.0 - r));
    gl_FragColor = vec4(vec3(0.96, 0.98, 0.97), a * 0.85);
    #include <fog_fragment>
  }`;

function waterMaterial(flow) {
  return new THREE.ShaderMaterial({
    uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, {
      uTime: { value: 0 }, uFlow: { value: flow },
      uDeep: { value: new THREE.Color(0x3a6c84) }, uShallow: { value: new THREE.Color(0x86b9c4) }, uGlint: { value: new THREE.Color(0xffd9a0) },
    }]),
    vertexShader: WATER_VERT, fragmentShader: WATER_FRAG, fog: true,
  });
}

/** Ribbon along samples: across = uv.x (0..1), along = uv.y (world units). */
function ribbon(samples, halfW, yOf) {
  const pos = [], uv = [], idx = [];
  samples.forEach((p, i) => {
    const y = yOf(p, i);
    const nx = -p.tz, nz = p.tx;
    pos.push(p.x + nx * halfW, y, p.z + nz * halfW, p.x - nx * halfW, y, p.z - nz * halfW);
    uv.push(0, p.s, 1, p.s);
    if (i) { const a = (i - 1) * 2; idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
  });
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/** Flat ellipse disc with uv.x = 0.5·(1 − r) so the shader's edge term is 1 − r. */
function poolDisc(p, scale) {
  const seg = 40, pos = [0, 0, 0], uv = [0.5, 0], idx = [];
  const c = Math.cos(p.rot), s = Math.sin(p.rot);
  for (let k = 0; k <= seg; k++) {
    const a = (k / seg) * Math.PI * 2, lx = Math.cos(a) * p.rx * scale, lz = Math.sin(a) * p.rz * scale;
    pos.push(lx * c - lz * s, 0, lx * s + lz * c);
    uv.push(0, (k / seg) * 6);
    if (k) idx.push(0, k + 1, k);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  return g;
}

/**
 * @returns {{ update(t:number):void, colliders:Array }}
 */
export function buildWater(scene, L, { heightAt } = {}) {
  const mats = [];
  const group = new THREE.Group();
  group.name = 'water';
  const colliders = [];
  const B = L.bridge;
  const onDeck = (x, z) => { const [u, v] = B.toLocal(x, z); return Math.abs(u) < B.width / 2 + 0.2 && Math.abs(v) < B.length / 2 + 1.5; };

  // River
  const river = waterMaterial(0.55); mats.push(river);
  const rv = L.river;
  const rMesh = new THREE.Mesh(ribbon(rv.path.pts, rv.hw + 1.6, () => rv.level), river);
  rMesh.receiveShadow = true;
  group.add(rMesh);
  for (let i = 0; i < rv.path.pts.length - 1; i++) {
    const a = rv.path.pts[i], b = rv.path.pts[i + 1];
    if (Math.max(Math.abs(a.x), Math.abs(a.z)) > 100) continue;
    const c = { seg: true, ax: a.x, az: a.z, bx: b.x, bz: b.z, r: rv.hw * 0.85, minX: Math.min(a.x, b.x) - rv.hw, maxX: Math.max(a.x, b.x) + rv.hw, minZ: Math.min(a.z, b.z) - rv.hw, maxZ: Math.max(a.z, b.z) + rv.hw };
    if (Math.hypot(a.x - B.x, a.z - B.z) < 16) c.skip = onDeck;
    colliders.push(c);
  }

  // Stream: ribbons between the pools (each run reaches one sample into the pool)
  const stream = waterMaterial(1.3); mats.push(stream);
  const st = L.stream, S = st.path.pts;
  let run = [];
  const flush = () => {
    if (run.length > 1) {
      const m = new THREE.Mesh(ribbon(run.map(i => S[i]), st.hw + 0.45, (p, k) => st.surface[run[k]]), stream);
      m.receiveShadow = true;
      group.add(m);
    }
    run = [];
  };
  for (let i = 0; i < S.length; i++) {
    if (st.inPool[i]) { if (run.length) { run.push(i); flush(); } continue; }
    if (!run.length && i > 0 && st.inPool[i - 1]) run.push(i - 1);
    run.push(i);
  }
  flush();
  for (let i = 0; i < S.length - 1; i += 2) {
    const a = S[i], b = S[Math.min(S.length - 1, i + 2)];
    if (st.inPool[i]) continue;
    colliders.push({ seg: true, ax: a.x, az: a.z, bx: b.x, bz: b.z, r: st.hw + 0.25,
      minX: Math.min(a.x, b.x) - 2, maxX: Math.max(a.x, b.x) + 2, minZ: Math.min(a.z, b.z) - 2, maxZ: Math.max(a.z, b.z) + 2 });
  }

  // Pools
  const pond = waterMaterial(0.06); mats.push(pond);
  for (const p of L.pools) {
    const m = new THREE.Mesh(poolDisc(p, 1.16), pond);
    m.position.set(p.x, p.level, p.z);
    m.receiveShadow = true;
    group.add(m);
    // collide as three circles along the long axis
    const major = p.rx >= p.rz, a = major ? p.rx : p.rz, b = major ? p.rz : p.rx;
    const ax = major ? Math.cos(p.rot) : -Math.sin(p.rot), az = major ? Math.sin(p.rot) : Math.cos(p.rot);
    for (const f of [-1, 0, 1]) colliders.push({ circle: true, x: p.x + ax * f * (a - b), z: p.z + az * f * (a - b), r: b + 0.35 });
  }

  // Falls: a sheet of water where the stream drops into each pool, foam below
  const fallMat = new THREE.ShaderMaterial({
    uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { uTime: { value: 0 } }]),
    vertexShader: WATER_VERT, fragmentShader: FALL_FRAG, fog: true,
    transparent: true, depthWrite: false, side: THREE.DoubleSide,
  });
  const foamMat = new THREE.ShaderMaterial({
    uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { uTime: { value: 0 } }]),
    vertexShader: WATER_VERT, fragmentShader: FOAM_FRAG, fog: true,
    transparent: true, depthWrite: false,
  });
  mats.push(fallMat, foamMat);
  for (const f of L.falls) {
    const h = f.top - f.bottom + 0.15;
    const sheet = new THREE.Mesh(new THREE.PlaneGeometry(f.width, h), fallMat);
    sheet.position.set(f.x - f.tx * 0.2, f.bottom + h / 2 - 0.05, f.z - f.tz * 0.2);
    sheet.rotation.y = Math.atan2(f.tx, f.tz);
    sheet.rotation.x = -0.18;                       // lean out over the lip a little
    sheet.renderOrder = 3;
    group.add(sheet);
    const foam = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 3.2), foamMat);
    foam.rotation.x = -Math.PI / 2;
    foam.position.set(f.x + f.tx * 0.9, f.bottom + 0.03, f.z + f.tz * 0.9);
    foam.renderOrder = 3;
    group.add(foam);
  }

  // The spring: a little stone basin the stream wells out of
  {
    const sp = L.spring, M = propMaterials();
    const basinY = heightAt ? heightAt(sp.x, sp.z) : sp.y;
    const rim = new THREE.Mesh(new THREE.TorusGeometry(1.25, 0.32, 6, 16), M.stoneDark);
    rim.rotation.x = -Math.PI / 2;
    rim.position.set(sp.x, Math.max(basinY, sp.y) + 0.12, sp.z);
    rim.castShadow = true;
    group.add(rim);
    const disc = new THREE.Mesh(poolDisc({ rx: 1.2, rz: 1.2, rot: 0 }, 1), pond);
    disc.position.set(sp.x, sp.y + 0.1, sp.z);
    group.add(disc);
    colliders.push({ circle: true, x: sp.x, z: sp.z, r: 1.8 });
  }

  scene.add(group);
  return {
    group, colliders,
    update(t) { for (const m of mats) m.uniforms.uTime.value = t; },
  };
}

// ════════════════════════════════════════════════════════════════
// BRIDGE
// ════════════════════════════════════════════════════════════════

/**
 * Stone arch bridge: solid sides with one arched opening, a cobbled deck
 * that humps over the river, parapets with lamp pillars at the ends.
 * @returns {{ group, colliders }}
 */
export function buildBridge(scene, L) {
  const B = L.bridge, M = propMaterials();
  const Lh = B.length / 2, W = B.width;
  const group = new THREE.Group();
  group.name = 'bridge';
  const top = (u) => (Math.abs(u) <= Lh ? B.arch * Math.cos(Math.PI * u / B.length) : 0);

  // local frame: x = along the street, y = up, z = across (left)
  const fwd = new THREE.Vector3(Math.sin(B.heading), 0, Math.cos(B.heading));
  const left = new THREE.Vector3(-Math.cos(B.heading), 0, Math.sin(B.heading));
  const basis = new THREE.Matrix4().makeBasis(fwd, new THREE.Vector3(0, 1, 0), left).setPosition(B.x, B.y, B.z);

  const stoneMat = standardMat({ map: stoneTexture(), color: 0xd2c6ad, roughness: 0.95 });
  // Body: side profile with an arch, extruded across the deck
  {
    const span = L.river.hw + 1.2, foot = -2.6, crown = B.arch - 0.75;
    const sh = new THREE.Shape();
    sh.moveTo(-Lh - 1.2, foot);
    sh.lineTo(-span, foot);
    for (let k = 0; k <= 18; k++) {
      const a = Math.PI - (k / 18) * Math.PI;
      sh.lineTo(span * Math.cos(a), foot + (crown - foot) * Math.sin(a));
    }
    sh.lineTo(Lh + 1.2, foot);
    sh.lineTo(Lh + 1.2, top(Lh) - 0.02);
    for (let k = 0; k <= 24; k++) { const u = Lh + 1.2 - (k / 24) * (2 * Lh + 2.4); sh.lineTo(u, top(u) - 0.02); }
    const g = new THREE.ExtrudeGeometry(sh, { depth: W, bevelEnabled: false, curveSegments: 1 });
    g.translate(0, 0, -W / 2);
    const uv = g.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * 0.33, uv.getY(i) * 0.33);
    g.applyMatrix4(basis);
    const body = new THREE.Mesh(g, stoneMat);
    body.castShadow = true; body.receiveShadow = true;
    group.add(body);
  }
  // Cobbled deck following the hump
  {
    const pos = [], uvs = [], idx = [], N = 24, hw = W / 2 - 0.45;
    for (let k = 0; k <= N; k++) {
      const u = -Lh - 1 + (k / N) * (2 * Lh + 2), y = top(u) + 0.03;
      for (const sd of [1, -1]) {
        const p = new THREE.Vector3(u, y, sd * hw).applyMatrix4(basis);
        pos.push(p.x, p.y, p.z); uvs.push(p.x / 3, p.z / 3);
      }
      if (k) { const a = (k - 1) * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    g.setIndex(idx); g.computeVertexNormals();
    // keep the normals pointing up whatever the winding came out as
    const nrm = g.attributes.normal; let up = 0; for (let i = 0; i < nrm.count; i++) up += nrm.getY(i);
    if (up < 0) { g.setIndex(idx.map((v, i) => idx[i - (i % 3) + (2 - (i % 3))])); g.computeVertexNormals(); }
    const deck = new THREE.Mesh(g, standardMat({ map: cobbleTexture(), roughness: 0.95 }));
    deck.receiveShadow = true;
    group.add(deck);
  }
  // Parapets + end pillars
  for (const sd of [1, -1]) {
    const sh = new THREE.Shape(), ext = Lh + 0.3;
    sh.moveTo(-ext, top(-ext) - 0.3);
    for (let k = 0; k <= 20; k++) { const u = -ext + (k / 20) * 2 * ext; sh.lineTo(u, top(u) - 0.3); }
    for (let k = 20; k >= 0; k--) { const u = -ext + (k / 20) * 2 * ext; sh.lineTo(u, top(u) + 0.78); }
    const g = new THREE.ExtrudeGeometry(sh, { depth: 0.45, bevelEnabled: false, curveSegments: 1 });
    g.translate(0, 0, sd > 0 ? W / 2 - 0.45 : -W / 2);
    const uv = g.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * 0.33, uv.getY(i) * 0.33);
    g.applyMatrix4(basis);
    const par = new THREE.Mesh(g, M.stoneDark);
    par.castShadow = true; par.receiveShadow = true;
    group.add(par);
    for (const e of [-1, 1]) {
      const pil = new THREE.Mesh(new THREE.BoxGeometry(0.8, 1.4, 0.8), M.stoneDark);
      const p = new THREE.Vector3(e * (Lh - 0.6), top(e * (Lh - 0.6)) + 0.45, sd * (W / 2 - 0.2)).applyMatrix4(basis);
      pil.position.copy(p);
      pil.rotation.y = B.heading;
      pil.castShadow = true;
      group.add(pil);
    }
  }
  scene.add(group);

  // Parapets keep the cart on the deck
  const colliders = [];
  const rx = Math.cos(B.heading), rz = -Math.sin(B.heading);
  for (const sd of [1, -1]) {
    const o = W / 2 - 0.15;
    colliders.push(obb(B.x + rx * sd * o, B.z + rz * sd * o, 0.3, Lh + 0.35, B.heading));   // stop where the parapet ends: room to turn off the bridge
  }
  return { group, colliders };
}
