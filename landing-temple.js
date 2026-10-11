/**
 * landing-temple.js — the night mountain-temple landing scene
 *
 * An original scene built from scratch for the portfolio's front gate:
 * a moonlit sky over layered mountain ridges and drifting mist, a stone
 * stairway climbing from a vermilion torii to a hilltop terrace, and on it
 * the same procedural temple hall that stands in the town as City Hall,
 * with a pagoda behind. Stone lanterns glow along the steps, a light rain
 * falls, maple leaves drift down and a few spirit wisps follow the pointer.
 *
 * "Enter Town" flies the camera through the torii, up the stairs and into
 * the glowing temple doors, then hands over to the town.
 *
 * API:
 *   const landing = createTempleLanding(canvas, { lowPower })
 *   landing.start() / landing.stop() / landing.resize()
 *   landing.enter(onDone)   // fly-in; onDone() fires as the doors fill the view
 *   landing.dispose()       // free GPU resources once the town has taken over
 */
import * as THREE from 'three';
import { EffectComposer } from 'https://cdn.jsdelivr.net/npm/three@0.150.0/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'https://cdn.jsdelivr.net/npm/three@0.150.0/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'https://cdn.jsdelivr.net/npm/three@0.150.0/examples/jsm/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'https://cdn.jsdelivr.net/npm/three@0.150.0/examples/jsm/postprocessing/ShaderPass.js';
import { mergeBufferGeometries } from 'https://cdn.jsdelivr.net/npm/three@0.150.0/examples/jsm/utils/BufferGeometryUtils.js';
import { buildTempleHall, buildPagoda, templeMaterials } from './temple.js';

// ── Layout (world units) ──────────────────────────────────────────
const STAIR_FOOT_Z = -6;     // first step
const STAIR_TOP_Z  = -24;    // terrace edge
const TERRACE_Y    = 9;      // terrace height
const STAIR_W      = 5.6;
const HALL_Z       = -40;    // temple hall centre
const CAM_HOME     = new THREE.Vector3(0, 4.2, 17);
const LOOK_HOME    = new THREE.Vector3(0, 12.5, -30);

/** Ground height of the hill at depth z (slope between stair foot and terrace). */
function hillY(z) {
  const t = (STAIR_FOOT_Z - z) / (STAIR_FOOT_Z - STAIR_TOP_Z);
  return THREE.MathUtils.clamp(t, 0, 1) * TERRACE_Y;
}

// Deterministic RNG so the scene composes the same way every visit.
function rng(seed) {
  let s = seed >>> 0;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
}

function nonIndexed(g) {
  const n = g.index ? g.toNonIndexed() : g;
  if (!n.attributes.uv) n.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(n.attributes.position.count * 2), 2));
  return n;
}
function mergeInto(list, material, parent, { cast = false, receive = false } = {}) {
  if (!list.length) return null;
  const geo = mergeBufferGeometries(list.map(nonIndexed), false);
  list.forEach(g => g.dispose());
  const m = new THREE.Mesh(geo, material);
  m.castShadow = cast; m.receiveShadow = receive;
  parent.add(m);
  return m;
}
function boxAt(w, h, d, x, y, z, ry = 0) {
  const g = new THREE.BoxGeometry(w, h, d);
  if (ry) g.rotateY(ry);
  g.translate(x, y, z);
  return g;
}
function cylAt(r, h, x, y, z, seg = 10, r2 = r) {
  const g = new THREE.CylinderGeometry(r, r2, h, seg);
  g.translate(x, y, z);
  return g;
}

// ── Canvas textures ───────────────────────────────────────────────
function moonTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 256;
  const g = c.getContext('2d');
  const halo = g.createRadialGradient(128, 128, 20, 128, 128, 128);
  halo.addColorStop(0, 'rgba(220,230,255,0.55)');
  halo.addColorStop(0.3, 'rgba(160,180,240,0.16)');
  halo.addColorStop(1, 'rgba(120,140,220,0)');
  g.fillStyle = halo; g.fillRect(0, 0, 256, 256);
  const disc = g.createRadialGradient(118, 118, 4, 128, 128, 30);
  disc.addColorStop(0, '#fffdf2'); disc.addColorStop(0.85, '#f1ecd8'); disc.addColorStop(1, 'rgba(240,235,215,0)');
  g.fillStyle = disc; g.beginPath(); g.arc(128, 128, 30, 0, Math.PI * 2); g.fill();
  // a few soft maria
  g.fillStyle = 'rgba(170,165,150,0.25)';
  [[120, 120, 7], [137, 133, 5], [126, 140, 4]].forEach(([x, y, r]) => { g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill(); });
  return new THREE.CanvasTexture(c);
}
function mistTexture(seed) {
  const c = document.createElement('canvas'); c.width = 512; c.height = 128;
  const g = c.getContext('2d');
  const r = rng(seed);
  for (let i = 0; i < 70; i++) {
    const x = r() * 512, y = 40 + r() * 50, rad = 20 + r() * 60;
    const grd = g.createRadialGradient(x, y, 0, x, y, rad);
    grd.addColorStop(0, 'rgba(255,255,255,0.22)'); grd.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grd; g.fillRect(x - rad, y - rad, rad * 2, rad * 2);
    // wrap horizontally so the texture tiles
    if (x - rad < 0 || x + rad > 512) { const x2 = x < 256 ? x + 512 : x - 512; g.fillRect(x2 - rad, y - rad, rad * 2, rad * 2); }
  }
  // fade top & bottom
  g.globalCompositeOperation = 'destination-in';
  const v = g.createLinearGradient(0, 0, 0, 128);
  v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(0.35, 'rgba(0,0,0,1)'); v.addColorStop(0.75, 'rgba(0,0,0,1)'); v.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = v; g.fillRect(0, 0, 512, 128);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = THREE.RepeatWrapping;
  return t;
}
function glowTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grd.addColorStop(0, 'rgba(255,255,255,1)'); grd.addColorStop(0.25, 'rgba(255,255,255,0.55)'); grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd; g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}

// ── Grade pass: cool night tint, vignette, warm flash for the hand-over ──
const NightGradeShader = {
  uniforms: { tDiffuse: { value: null }, uVignette: { value: 0.42 }, uFlash: { value: 0 } },
  vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: `
    uniform sampler2D tDiffuse; uniform float uVignette; uniform float uFlash; varying vec2 vUv;
    void main(){
      vec4 c = texture2D(tDiffuse, vUv);
      float l = dot(c.rgb, vec3(0.299, 0.587, 0.114));
      c.rgb = mix(c.rgb, c.rgb * vec3(0.93, 0.99, 1.08), 0.7);
      c.rgb += vec3(0.008, 0.012, 0.03) * (1.0 - l);
      vec2 d = (vUv - 0.5) * vec2(1.15, 1.0);
      c.rgb *= mix(1.0 - uVignette, 1.0, smoothstep(0.85, 0.2, length(d)));
      c.rgb = mix(c.rgb, vec3(1.0, 0.86, 0.62), uFlash);
      gl_FragColor = c;
    }`,
};

// ═════════════════════════════════════════════════════════════════
export function createTempleLanding(canvas, opts = {}) {
  const reducedMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const coarse = window.matchMedia && window.matchMedia('(pointer: coarse)').matches;
  const lowPower = opts.lowPower ?? (coarse || (navigator.hardwareConcurrency || 8) <= 4 || Math.min(innerWidth, innerHeight) < 560);

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: !lowPower, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, lowPower ? 1.25 : 1.75));
  renderer.toneMapping = THREE.NoToneMapping;
  renderer.shadowMap.enabled = !lowPower;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const scene = new THREE.Scene();
  const FOG = new THREE.Color(0x222c45);
  scene.background = FOG.clone();
  scene.fog = new THREE.Fog(FOG, 60, 700);

  const camera = new THREE.PerspectiveCamera(48, 1, 0.3, 900);
  camera.position.copy(CAM_HOME);
  const lookAt = LOOK_HOME.clone();
  camera.lookAt(lookAt);

  const disposables = [];
  const track = (o) => { disposables.push(o); return o; };

  // ── Sky dome ────────────────────────────────────────────────────
  const skyMat = track(new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: {
      uTop: { value: new THREE.Color(0x050814) },
      uMid: { value: new THREE.Color(0x111a33) },
      uHor: { value: new THREE.Color(0x2c3a5a) },
      uMoonDir: { value: new THREE.Vector3(0.32, 0.36, -0.88).normalize() },
    },
    vertexShader: `varying vec3 vDir; void main(){ vDir = normalize(position); vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0); gl_Position = p.xyww; }`,
    fragmentShader: `
      uniform vec3 uTop, uMid, uHor, uMoonDir; varying vec3 vDir;
      void main(){
        float h = vDir.y;
        vec3 c = mix(uHor, uMid, smoothstep(-0.02, 0.22, h));
        c = mix(c, uTop, smoothstep(0.22, 0.85, h));
        float m = max(dot(normalize(vDir), uMoonDir), 0.0);
        c += vec3(0.20, 0.24, 0.36) * pow(m, 18.0) + vec3(0.05, 0.06, 0.10) * pow(m, 4.0);
        gl_FragColor = vec4(c, 1.0);
      }`,
  }));
  const sky = new THREE.Mesh(track(new THREE.SphereGeometry(600, 32, 16)), skyMat);
  sky.renderOrder = -10; sky.frustumCulled = false;
  scene.add(sky);

  // Stars (twinkling points on the upper sky)
  const STAR_N = lowPower ? 700 : 1400;
  const sp = new Float32Array(STAR_N * 3), ss = new Float32Array(STAR_N), sd = new Float32Array(STAR_N);
  const rs = rng(7);
  for (let i = 0; i < STAR_N; i++) {
    const az = rs() * Math.PI * 2, el = Math.asin(0.04 + rs() * 0.96);
    sp[i * 3] = Math.cos(el) * Math.cos(az) * 560; sp[i * 3 + 1] = Math.sin(el) * 560; sp[i * 3 + 2] = Math.cos(el) * Math.sin(az) * 560;
    ss[i] = rs() < 0.06 ? 2.6 + rs() * 1.4 : 1.1 + rs() * 1.2; sd[i] = rs();
  }
  const starGeo = track(new THREE.BufferGeometry());
  starGeo.setAttribute('position', new THREE.BufferAttribute(sp, 3));
  starGeo.setAttribute('aSize', new THREE.BufferAttribute(ss, 1));
  starGeo.setAttribute('aSeed', new THREE.BufferAttribute(sd, 1));
  const starMat = track(new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, fog: false, blending: THREE.AdditiveBlending,
    uniforms: { uTime: { value: 0 }, uPR: { value: renderer.getPixelRatio() } },
    vertexShader: `attribute float aSize; attribute float aSeed; uniform float uTime; uniform float uPR; varying float vA;
      void main(){ vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_Position = projectionMatrix * mv;
        gl_PointSize = aSize * uPR; vA = 0.55 + 0.45 * sin(uTime * (0.8 + aSeed * 2.2) + aSeed * 60.0);
        vA *= smoothstep(0.02, 0.2, normalize(position).y); }`,
    fragmentShader: `varying float vA; void main(){ float r = length(gl_PointCoord - 0.5); gl_FragColor = vec4(0.86, 0.9, 1.0, smoothstep(0.5, 0.0, r) * vA); }`,
  }));
  const stars = new THREE.Points(starGeo, starMat);
  stars.renderOrder = -9; stars.frustumCulled = false;
  scene.add(stars);

  // Moon
  const moonTex = track(moonTexture());
  const moonMat = track(new THREE.MeshBasicMaterial({ map: moonTex, transparent: true, depthWrite: false, fog: false, toneMapped: false }));
  moonMat.color.setRGB(1.25, 1.25, 1.2);
  const moon = new THREE.Mesh(track(new THREE.PlaneGeometry(120, 120)), moonMat);
  moon.position.copy(skyMat.uniforms.uMoonDir.value).multiplyScalar(520);
  moon.lookAt(0, 0, 0);
  moon.renderOrder = -8;
  scene.add(moon);

  // ── Lights ──────────────────────────────────────────────────────
  scene.add(new THREE.HemisphereLight(0x7f93c8, 0x1c1626, 0.62));
  const moonLight = new THREE.DirectionalLight(0xaabbff, 0.55);
  moonLight.position.set(40, 60, -10);
  moonLight.target.position.set(0, 8, -30);
  scene.add(moonLight, moonLight.target);
  if (renderer.shadowMap.enabled) {
    moonLight.castShadow = true;
    moonLight.shadow.mapSize.set(1024, 1024);
    Object.assign(moonLight.shadow.camera, { left: -32, right: 32, top: 30, bottom: -30, near: 10, far: 160 });
    moonLight.shadow.bias = -0.0008;
  }
  const fill = new THREE.DirectionalLight(0x5b6ea8, 0.25);
  fill.position.set(-30, 25, 40);
  scene.add(fill);
  const warm = [
    [0, 3.2, -3.6, 1.7, 20],             // torii
    [0, 7.5, -15, 1.2, 16],              // mid-stairs
    [0, TERRACE_Y + 4, HALL_Z + 9, 2.6, 28], // hall front
  ].map(([x, y, z, i, d]) => { const l = new THREE.PointLight(0xffa04a, i, d, 1.6); l.position.set(x, y, z); scene.add(l); return l; });

  // ── Materials ───────────────────────────────────────────────────
  const T = templeMaterials({ paperGlow: 1.05 });
  T.lantern.emissiveIntensity = 1.3;
  Object.values(T).forEach(track);
  const M = {
    ground:  track(new THREE.MeshStandardMaterial({ color: 0x1f2627, roughness: 1 })),
    hill:    track(new THREE.MeshStandardMaterial({ color: 0x1a2322, roughness: 1, flatShading: true })),
    court:   track(new THREE.MeshStandardMaterial({ map: T.stone.map, color: 0x5d5e66, roughness: 0.95 })),
    cedar:   track(new THREE.MeshStandardMaterial({ color: 0x172720, roughness: 0.95, flatShading: true })),
    cedarLt: track(new THREE.MeshStandardMaterial({ color: 0x1f3229, roughness: 0.95, flatShading: true })),
    trunk:   track(new THREE.MeshStandardMaterial({ color: 0x2a1c16, roughness: 1 })),
    maple:   track(new THREE.MeshStandardMaterial({ color: 0x8c2a20, roughness: 0.9, flatShading: true })),
    mapleLt: track(new THREE.MeshStandardMaterial({ color: 0xa8461f, roughness: 0.9, flatShading: true })),
  };

  // ── Ground, hill and stairway ───────────────────────────────────
  const world = new THREE.Group();
  scene.add(world);

  const ground = new THREE.Mesh(track(new THREE.PlaneGeometry(260, 80)), M.ground);
  ground.rotation.x = -Math.PI / 2; ground.position.set(0, 0, 10); ground.receiveShadow = true;
  world.add(ground);

  // Hill masses either side of the stair cut: a profile extruded along x.
  // Shape coords: X = -z (depth), Y = height.
  const hillShape = new THREE.Shape();
  hillShape.moveTo(-STAIR_FOOT_Z - 0.01, 0);
  hillShape.lineTo(-STAIR_TOP_Z, TERRACE_Y);
  hillShape.lineTo(140, TERRACE_Y);
  hillShape.lineTo(140, 0);
  hillShape.closePath();
  const hillParts = [];
  for (const [x0, x1] of [[-130, -STAIR_W / 2 - 0.7], [STAIR_W / 2 + 0.7, 130]]) {
    const g = new THREE.ExtrudeGeometry(hillShape, { depth: x1 - x0, bevelEnabled: false });
    g.rotateY(Math.PI / 2);          // shape X → world -z, extrude → world +x
    g.translate(x0, 0, 0);
    hillParts.push(g);
  }
  // back-fill under the stairs
  const fillShape = hillShape.clone();
  {
    const g = new THREE.ExtrudeGeometry(fillShape, { depth: STAIR_W + 1.4, bevelEnabled: false });
    g.rotateY(Math.PI / 2); g.translate(-STAIR_W / 2 - 0.7, -0.46, 0);
    hillParts.push(g);
  }
  mergeInto(hillParts, M.hill, world, { receive: true });

  // Courtyard paving on the terrace and a path up to the torii
  const court = new THREE.Mesh(track(new THREE.PlaneGeometry(30, 26)), M.court);
  court.material.map = T.stone.map.clone(); court.material.map.repeat.set(6, 5); court.material.map.wrapS = court.material.map.wrapT = THREE.RepeatWrapping; court.material.map.needsUpdate = true;
  track(court.material.map);
  court.rotation.x = -Math.PI / 2; court.position.set(0, TERRACE_Y + 0.02, STAIR_TOP_Z - 13); court.receiveShadow = true;
  world.add(court);
  const pathMat = track(M.court.clone()); pathMat.map = court.material.map;
  const path = new THREE.Mesh(track(new THREE.PlaneGeometry(STAIR_W - 0.6, 28)), pathMat);
  path.rotation.x = -Math.PI / 2; path.position.set(0, 0.02, STAIR_FOOT_Z + 14); path.receiveShadow = true;
  world.add(path);

  // Steps + cheek walls + stone lanterns along the climb
  const STEPS = 20;
  const run = (STAIR_FOOT_Z - STAIR_TOP_Z) / STEPS, rise = TERRACE_Y / STEPS;
  const stepGeos = [], cheekGeos = [], lanternStone = [], lanternGlow = [];
  for (let i = 0; i < STEPS; i++) {
    const zF = STAIR_FOOT_Z - i * run;
    const top = (i + 1) * rise;
    stepGeos.push(boxAt(STAIR_W, top, run + 0.02, 0, top / 2, zF - run / 2));
    for (const sx of [-1, 1]) cheekGeos.push(boxAt(0.7, top + 0.55, run + 0.02, sx * (STAIR_W / 2 + 0.35), (top + 0.55) / 2, zF - run / 2));
  }
  function toro(x, y, z, s = 1) {
    lanternStone.push(boxAt(0.9 * s, 0.25 * s, 0.9 * s, x, y + 0.12 * s, z));
    lanternStone.push(cylAt(0.16 * s, 1.1 * s, x, y + 0.8 * s, z, 8));
    lanternStone.push(boxAt(0.8 * s, 0.16 * s, 0.8 * s, x, y + 1.42 * s, z));
    lanternGlow.push(boxAt(0.5 * s, 0.5 * s, 0.5 * s, x, y + 1.75 * s, z));
    const roof = new THREE.ConeGeometry(0.72 * s, 0.5 * s, 4); roof.rotateY(Math.PI / 4); roof.translate(x, y + 2.25 * s, z);
    lanternStone.push(roof);
    lanternStone.push(new THREE.SphereGeometry(0.11 * s, 8, 6).translate(x, y + 2.58 * s, z));
  }
  for (const k of [3, 8, 13, 18]) {
    const z = STAIR_FOOT_Z - (k + 0.5) * run, y = (k + 1) * rise + 0.55;
    toro(-(STAIR_W / 2 + 0.35), y, z, 0.62);
    toro(STAIR_W / 2 + 0.35, y, z, 0.62);
  }
  toro(-4.8, 0, -1.2, 1); toro(4.8, 0, -1.2, 1);                         // forecourt pair
  toro(-5.5, TERRACE_Y, STAIR_TOP_Z - 4, 1); toro(5.5, TERRACE_Y, STAIR_TOP_Z - 4, 1); // terrace pair
  mergeInto(stepGeos, T.stone, world, { receive: true, cast: true });
  mergeInto(cheekGeos, T.stoneDk, world, { receive: true, cast: true });
  mergeInto(lanternStone, T.stoneDk, world, { cast: true });
  mergeInto(lanternGlow, T.lantern, world);

  // ── Torii at the foot of the stairs ────────────────────────────
  {
    const z = -4.4, half = 3.3, H = 5.7;
    const red = [], dark = [];
    for (const sx of [-1, 1]) {
      red.push(cylAt(0.26, H, sx * half, H / 2, z, 14, 0.3));
      dark.push(cylAt(0.36, 0.5, sx * half, 0.25, z, 14));
    }
    red.push(boxAt(half * 2 + 0.9, 0.36, 0.48, 0, H - 0.95, z));            // nuki
    red.push(boxAt(half * 2 + 2.2, 0.34, 0.6, 0, H + 0.05, z));             // shimaki
    const kasagi = new THREE.BoxGeometry(half * 2 + 3.0, 0.3, 0.75, 12, 1, 1);
    const pos = kasagi.attributes.position;
    for (let i = 0; i < pos.count; i++) { const x = pos.getX(i); pos.setY(i, pos.getY(i) + Math.pow(Math.abs(x) / (half + 1.5), 3) * 0.42); }
    kasagi.computeVertexNormals(); kasagi.translate(0, H + 0.4, z);
    dark.push(kasagi);
    red.push(boxAt(0.3, 0.9, 0.3, 0, H - 0.45, z));                         // gakuzuka
    mergeInto(red, T.pillar, world, { cast: true });
    mergeInto(dark, T.darkWood, world, { cast: true });
  }

  // ── Temple hall + pagoda on the terrace ────────────────────────
  const hall = buildTempleHall({ plaque: '', lanterns: true, materials: T });
  hall.group.position.set(0, TERRACE_Y, HALL_Z);
  hall.group.scale.setScalar(1.22);
  hall.group.traverse(o => { if (o.isMesh) { o.castShadow = !lowPower; o.receiveShadow = true; } });
  world.add(hall.group);

  const pagoda = buildPagoda({ tiers: 3, materials: T, paperGlow: 1.1 });
  pagoda.group.position.set(-19, TERRACE_Y, HALL_Z - 13);
  pagoda.group.scale.setScalar(1.35);
  pagoda.group.rotation.y = 0.25;
  world.add(pagoda.group);

  // ── Trees: cedars on the slopes, maples near the stairs ─────────
  {
    const r = rng(42);
    const cedar = [], cedarLt = [], trunk = [];
    const placeCedar = (x, z, s) => {
      const y = hillY(z);
      trunk.push(cylAt(0.18 * s, 2.2 * s, x, y + 1.1 * s, z, 6, 0.26 * s));
      const tiers = 4;
      for (let k = 0; k < tiers; k++) {
        const rad = (1.9 - k * 0.38) * s, h = (2.6 - k * 0.3) * s;
        const c = new THREE.ConeGeometry(rad, h, 7);
        c.rotateY(r() * Math.PI);
        c.translate(x, y + (1.8 + k * 1.45) * s + h / 2, z);
        (k % 2 ? cedarLt : cedar).push(c);
      }
    };
    for (let i = 0; i < (lowPower ? 55 : 85); i++) {
      const side = r() < 0.5 ? -1 : 1;
      const x = side * (STAIR_W / 2 + 6 + Math.pow(r(), 0.8) * 44);
      const z = 6 - r() * 70;
      // keep the stair corridor, the hall's footprint and the view lane clear
      if (Math.abs(x) < 17 && z < STAIR_TOP_Z + 2 && z > HALL_Z - 12) continue;
      if (z > STAIR_TOP_Z && Math.abs(x) < 12) continue;
      if (Math.abs(x + 19) < 6 && Math.abs(z - (HALL_Z - 13)) < 6) continue;
      placeCedar(x, z, 0.8 + r() * 0.6);
    }
    mergeInto(cedar, M.cedar, world, { cast: true });
    mergeInto(cedarLt, M.cedarLt, world, { cast: true });
    mergeInto(trunk, M.trunk, world);

    const maple = [], mapleLt = [], mTrunk = [];
    const placeMaple = (x, z, s) => {
      const y = hillY(z);
      mTrunk.push(cylAt(0.14 * s, 2.4 * s, x, y + 1.2 * s, z, 6, 0.2 * s));
      for (let k = 0; k < 5; k++) {
        const b = new THREE.IcosahedronGeometry((0.9 + r() * 0.6) * s, 0);
        b.translate(x + (r() - 0.5) * 2 * s, y + (2.6 + r() * 1.3) * s, z + (r() - 0.5) * 2 * s);
        (k % 2 ? mapleLt : maple).push(b);
      }
    };
    [[-9.5, -10], [10, -15], [-10.5, -21], [9.5, -3], [-10, 3], [13, -27], [-13.5, -28], [15, -36]].forEach(([x, z]) => placeMaple(x, z, 1 + r() * 0.3));
    mergeInto(maple, M.maple, world, { cast: true });
    mergeInto(mapleLt, M.mapleLt, world, { cast: true });
    mergeInto(mTrunk, M.trunk, world);
  }

  // ── Mountains: layered ridgelines fading into the mist ─────────
  function ridge(seed, z, width, base, peak, color, rough = 1) {
    const r = rng(seed);
    const s = new THREE.Shape();
    const N = 48;
    s.moveTo(-width / 2, -20);
    const peaks = [0, 1, 2, 3].map(() => ({ c: r() * 2 - 1, w: 0.12 + r() * 0.25, h: 0.5 + r() * 0.5 }));
    for (let i = 0; i <= N; i++) {
      const u = i / N * 2 - 1;
      let h = 0;
      peaks.forEach(p => { h = Math.max(h, p.h * Math.exp(-Math.pow((u - p.c) / p.w, 2))); });
      h += (Math.sin(u * 23 + seed) * 0.04 + Math.sin(u * 51 + seed * 3) * 0.02) * rough;
      s.lineTo(u * width / 2, base + h * peak);
    }
    s.lineTo(width / 2, -20);
    s.closePath();
    const m = new THREE.Mesh(track(new THREE.ShapeGeometry(s)), track(new THREE.MeshBasicMaterial({ color, fog: true })));
    m.position.z = z;
    scene.add(m);
    return m;
  }
  ridge(11, -330, 1100, 10, 120, 0x1c2640, 1.2);
  ridge(23, -230, 820, 8, 80, 0x18213a, 1.0);
  ridge(37, -150, 560, 6, 46, 0x151d30, 0.8);
  ridge(51, -95, 360, 4, 22, 0x121a28, 0.6);

  // ── Mist layers ─────────────────────────────────────────────────
  const mists = [];
  [[-280, 60, 640, 110, 0.55, 3], [-190, 30, 520, 80, 0.5, 5], [-120, 16, 380, 54, 0.45, 9],
   [-70, 10, 260, 30, 0.32, 13], [STAIR_TOP_Z + 3, 2.2, 140, 9, 0.18, 17]].forEach(([z, y, w, h, op, seed]) => {
    const tex = track(mistTexture(seed));
    tex.repeat.set(w / 260, 1);
    const mat = track(new THREE.MeshBasicMaterial({ map: tex, color: 0x9aa8c8, transparent: true, opacity: op, depthWrite: false, fog: false }));
    const m = new THREE.Mesh(track(new THREE.PlaneGeometry(w, h)), mat);
    m.position.set(0, y, z);
    m.renderOrder = 1;
    scene.add(m);
    mists.push({ tex, speed: 0.004 + (seed % 5) * 0.0015 });
  });

  // ── Rain ────────────────────────────────────────────────────────
  const RAIN_N = reducedMotion ? 0 : (lowPower ? 500 : 1300);
  let rain = null;
  if (RAIN_N) {
    const rp = new Float32Array(RAIN_N * 6), re = new Float32Array(RAIN_N * 2);
    const rr = rng(99);
    for (let i = 0; i < RAIN_N; i++) {
      const x = (rr() - 0.5) * 70, y = rr() * 34, z = 22 - rr() * 70;
      rp.set([x, y, z, x, y, z], i * 6); re.set([0, 1], i * 2);
    }
    const g = track(new THREE.BufferGeometry());
    g.setAttribute('position', new THREE.BufferAttribute(rp, 3));
    g.setAttribute('aEnd', new THREE.BufferAttribute(re, 1));
    const mat = track(new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, fog: false,
      uniforms: { uTime: { value: 0 } },
      vertexShader: `attribute float aEnd; uniform float uTime; varying float vA;
        void main(){ vec3 p = position; float y = mod(p.y - uTime * 22.0, 34.0) - aEnd * 0.85;
          vec3 w = vec3(p.x + aEnd * 0.1, y, p.z);
          vA = mix(0.0, 0.28, aEnd);
          gl_Position = projectionMatrix * modelViewMatrix * vec4(w, 1.0); }`,
      fragmentShader: `varying float vA; void main(){ gl_FragColor = vec4(0.72, 0.8, 0.95, vA); }`,
    }));
    rain = new THREE.LineSegments(g, mat);
    rain.frustumCulled = false;
    scene.add(rain);
  }

  // ── Falling maple leaves ───────────────────────────────────────
  const LEAF_N = lowPower ? 26 : 56;
  const leafShape = new THREE.Shape();
  for (let i = 0; i <= 10; i++) {
    const a = i / 10 * Math.PI * 2 + Math.PI / 2, rad = i % 2 ? 0.07 : 0.17;
    const x = Math.cos(a) * rad, y = Math.sin(a) * rad;
    i ? leafShape.lineTo(x, y) : leafShape.moveTo(x, y);
  }
  const leafMat = track(new THREE.MeshStandardMaterial({ color: 0xc0472a, emissive: 0x3a0d06, roughness: 0.8, side: THREE.DoubleSide }));
  const leaves = new THREE.InstancedMesh(track(new THREE.ShapeGeometry(leafShape)), leafMat, LEAF_N);
  leaves.frustumCulled = false;
  const leafState = [];
  const rl = rng(5);
  const leafColor = new THREE.Color();
  const spawnLeaf = (st, anywhere) => {
    st.p.set((rl() - 0.5) * 34, anywhere ? rl() * 22 : 18 + rl() * 6, 10 - rl() * 46);
    st.v = 0.7 + rl() * 0.7; st.ph = rl() * 6.28; st.sw = 0.6 + rl() * 0.9;
    st.ax.set(rl() - 0.5, rl() - 0.5, rl() - 0.5).normalize(); st.spin = 1 + rl() * 2.5;
  };
  for (let i = 0; i < LEAF_N; i++) {
    const st = { p: new THREE.Vector3(), ax: new THREE.Vector3(), v: 1, ph: 0, sw: 1, spin: 1 };
    spawnLeaf(st, true); leafState.push(st);
    leaves.setColorAt(i, leafColor.setHSL(0.015 + rl() * 0.06, 0.75, 0.38 + rl() * 0.12));
  }
  scene.add(leaves);
  const _q = new THREE.Quaternion(), _m = new THREE.Matrix4(), _s = new THREE.Vector3(1, 1, 1);
  function updateLeaves(t, dt) {
    for (let i = 0; i < LEAF_N; i++) {
      const st = leafState[i];
      st.p.y -= st.v * dt;
      st.p.x += Math.sin(t * st.sw + st.ph) * 0.9 * dt + 0.25 * dt;
      st.p.z += Math.cos(t * st.sw * 0.7 + st.ph) * 0.5 * dt;
      if (st.p.y < hillY(st.p.z) + 0.05) spawnLeaf(st, false);
      _q.setFromAxisAngle(st.ax, t * st.spin + st.ph);
      _m.compose(st.p, _q, _s);
      leaves.setMatrixAt(i, _m);
    }
    leaves.instanceMatrix.needsUpdate = true;
  }

  // ── Fireflies around the lanterns + pointer wisps ──────────────
  const glowTex = track(glowTexture());
  const FF_N = lowPower ? 24 : 48;
  const ffPos = new Float32Array(FF_N * 3), ffBase = [];
  const rf = rng(77);
  for (let i = 0; i < FF_N; i++) {
    const z = 6 - rf() * 34, x = (rf() < 0.5 ? -1 : 1) * (2.5 + rf() * 9);
    ffBase.push({ x, y: hillY(z) + 0.6 + rf() * 3, z, ph: rf() * 6.28, sp: 0.3 + rf() * 0.5 });
  }
  const ffGeo = track(new THREE.BufferGeometry());
  ffGeo.setAttribute('position', new THREE.BufferAttribute(ffPos, 3));
  const ffMat = track(new THREE.PointsMaterial({ map: glowTex, color: 0xffd27a, size: 0.55, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.85 }));
  const fireflies = new THREE.Points(ffGeo, ffMat);
  fireflies.frustumCulled = false;
  scene.add(fireflies);

  const WISPS = 3, TRAIL = 14;
  const wispPos = new Float32Array(WISPS * TRAIL * 3), wispSize = new Float32Array(WISPS * TRAIL);
  const wisps = [];
  for (let w = 0; w < WISPS; w++) {
    const trail = [];
    for (let k = 0; k < TRAIL; k++) { trail.push(new THREE.Vector3(0, 3, -2)); wispSize[w * TRAIL + k] = (1 - k / TRAIL) * (w === 0 ? 0.8 : 0.6); }
    wisps.push({ p: new THREE.Vector3(0, 3, -2), v: new THREE.Vector3(), trail, lag: 2.2 + w * 1.1, off: w * 2.1 });
  }
  const wispGeo = track(new THREE.BufferGeometry());
  wispGeo.setAttribute('position', new THREE.BufferAttribute(wispPos, 3));
  wispGeo.setAttribute('aSize', new THREE.BufferAttribute(wispSize, 1));
  const wispMat = track(new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    uniforms: { uMap: { value: glowTex }, uScale: { value: 1 } },
    vertexShader: `attribute float aSize; uniform float uScale; varying float vS;
      void main(){ vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_Position = projectionMatrix * mv; vS = aSize; gl_PointSize = aSize * uScale / -mv.z; }`,
    fragmentShader: `uniform sampler2D uMap; varying float vS; void main(){ vec4 t = texture2D(uMap, gl_PointCoord); gl_FragColor = vec4(mix(vec3(0.55, 0.85, 1.0), vec3(1.0, 0.9, 0.7), vS), t.a * (0.15 + 0.45 * vS)); }`,
  }));
  const wispPoints = new THREE.Points(wispGeo, wispMat);
  wispPoints.frustumCulled = false;
  scene.add(wispPoints);

  // ── Pointer ─────────────────────────────────────────────────────
  const pointer = { x: 0, y: 0, sx: 0, sy: 0, active: false, last: 0 };
  const ray = new THREE.Raycaster(), ndc = new THREE.Vector2(), wispTarget = new THREE.Vector3(0, 3, -2);
  const wispPlane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 4);   // z = -4
  function onPointerMove(e) {
    const r = canvas.getBoundingClientRect();
    if (!r.width) return;
    pointer.x = ((e.clientX - r.left) / r.width) * 2 - 1;
    pointer.y = -((e.clientY - r.top) / r.height) * 2 + 1;
    pointer.active = e.pointerType !== 'touch' || e.type === 'pointerdown';
    pointer.last = performance.now();
  }
  window.addEventListener('pointermove', onPointerMove, { passive: true });
  window.addEventListener('pointerdown', onPointerMove, { passive: true });

  // ── Post-processing ─────────────────────────────────────────────
  const rt = new THREE.WebGLRenderTarget(2, 2, { type: THREE.HalfFloatType, samples: lowPower ? 0 : 4 });
  const composer = new EffectComposer(renderer, rt);
  composer.addPass(new RenderPass(scene, camera));
  const bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), lowPower ? 0.7 : 0.85, 0.6, 0.78);
  composer.addPass(bloom);
  const grade = new ShaderPass(NightGradeShader);
  composer.addPass(grade);

  // ── Resize ──────────────────────────────────────────────────────
  function resize() {
    const w = canvas.clientWidth || window.innerWidth, h = canvas.clientHeight || window.innerHeight;
    renderer.setSize(w, h, false);
    composer.setSize(w, h);
    const pr = renderer.getPixelRatio();
    bloom.setSize(Math.round(w * pr / (lowPower ? 2 : 1)), Math.round(h * pr / (lowPower ? 2 : 1)));
    camera.aspect = w / h;
    // Portrait screens: widen the view so the hall and torii both fit.
    camera.fov = w / h < 0.8 ? 62 : w / h < 1.2 ? 52 : 44;
    camera.updateProjectionMatrix();
    starMat.uniforms.uPR.value = pr;
    wispMat.uniforms.uScale.value = Math.min(w, h) * pr * 0.9;
    if (!running) renderFrame(0);
  }

  // ── Fly-in ──────────────────────────────────────────────────────
  let fly = null;
  function enter(onDone) {
    if (fly) return;
    if (reducedMotion) { grade.uniforms.uFlash.value = 0.6; renderFrame(0); setTimeout(() => onDone && onDone(), 120); fly = { done: true }; return; }
    const p0 = camera.position.clone(), l0 = lookAt.clone();
    fly = {
      t: 0, dur: 3.9, onDone, fired: false,
      pos: new THREE.CatmullRomCurve3([
        p0,
        new THREE.Vector3(0, 3.4, 5),
        new THREE.Vector3(0, 3.6, -2.2),
        new THREE.Vector3(0, 8.4, -14),
        new THREE.Vector3(0, TERRACE_Y + 3.8, STAIR_TOP_Z - 1),
        new THREE.Vector3(0, TERRACE_Y + 3.9, HALL_Z + 8.2),
      ], false, 'centripetal'),
      look: new THREE.CatmullRomCurve3([
        l0,
        new THREE.Vector3(0, 8, -24),
        new THREE.Vector3(0, 10, -30),
        new THREE.Vector3(0, TERRACE_Y + 4.2, HALL_Z + 2),
        new THREE.Vector3(0, TERRACE_Y + 4.0, HALL_Z),
      ], false, 'centripetal'),
    };
    if (!running) start();
  }
  const ease = (x) => x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;

  // ── Frame ───────────────────────────────────────────────────────
  const clock = new THREE.Clock();
  let elapsed = 0;
  function renderFrame(dt, realDt = dt) {
    elapsed += dt;
    const t = elapsed;
    starMat.uniforms.uTime.value = t;
    if (rain) rain.material.uniforms.uTime.value = t;
    mists.forEach(m => { m.tex.offset.x += m.speed * dt; });
    if (!reducedMotion) updateLeaves(t, dt);
    else if (dt === 0 && !leaves.userData.posed) { updateLeaves(0, 0); leaves.userData.posed = true; }

    // lantern flicker
    warm[0].intensity = 1.7 + Math.sin(t * 7.1) * 0.08 + Math.sin(t * 13.7) * 0.05;
    warm[1].intensity = 1.2 + Math.sin(t * 6.3 + 1) * 0.07;
    T.lantern.emissiveIntensity = 1.3 + Math.sin(t * 9.3) * 0.08;

    // fireflies
    for (let i = 0; i < FF_N; i++) {
      const b = ffBase[i];
      ffPos[i * 3] = b.x + Math.sin(t * b.sp + b.ph) * 1.2;
      ffPos[i * 3 + 1] = b.y + Math.sin(t * b.sp * 1.7 + b.ph * 2) * 0.6;
      ffPos[i * 3 + 2] = b.z + Math.cos(t * b.sp * 0.8 + b.ph) * 1.2;
    }
    ffGeo.attributes.position.needsUpdate = true;
    ffMat.opacity = 0.65 + Math.sin(t * 1.3) * 0.2;

    if (fly && !fly.done) {
      fly.t += Math.min(realDt, 0.25);   // wall-clock, so slow devices don't crawl
      const u = Math.min(fly.t / fly.dur, 1), e = ease(u);
      camera.position.copy(fly.pos.getPoint(e));
      lookAt.copy(fly.look.getPoint(e));
      camera.lookAt(lookAt);
      grade.uniforms.uFlash.value = THREE.MathUtils.smoothstep(u, 0.72, 1.0) * 0.85;
      if (u >= 1 && !fly.fired) { fly.fired = true; fly.done = true; fly.onDone && fly.onDone(); }
    } else if (!fly) {
      // gentle parallax + idle sway
      const idle = performance.now() - pointer.last > 4000;
      const px = idle ? Math.sin(t * 0.13) * 0.35 : pointer.x, py = idle ? Math.sin(t * 0.09) * 0.2 : pointer.y;
      pointer.sx += (px - pointer.sx) * Math.min(1, dt * 2.2);
      pointer.sy += (py - pointer.sy) * Math.min(1, dt * 2.2);
      camera.position.set(CAM_HOME.x + pointer.sx * 2.2, CAM_HOME.y + pointer.sy * 0.9 + Math.sin(t * 0.4) * 0.08, CAM_HOME.z);
      lookAt.set(LOOK_HOME.x + pointer.sx * 0.8, LOOK_HOME.y + pointer.sy * 0.5, LOOK_HOME.z);
      camera.lookAt(lookAt);
    }

    // wisps follow the pointer (or circle the torii when idle / on touch)
    const recent = pointer.active && performance.now() - pointer.last < 3500 && !fly;
    if (recent) {
      ndc.set(pointer.x, pointer.y);
      ray.setFromCamera(ndc, camera);
      ray.ray.intersectPlane(wispPlane, wispTarget);
      wispTarget.y = Math.max(wispTarget.y, 0.8);
    }
    for (let w = 0; w < WISPS; w++) {
      const ws = wisps[w];
      const goal = recent
        ? _tmp.copy(wispTarget).add(_tmp2.set(Math.sin(t * 2.1 + ws.off) * 0.7, Math.cos(t * 1.7 + ws.off) * 0.5, 0))
        : _tmp.set(Math.sin(t * 0.5 + ws.off) * 5.5, 3.0 + Math.sin(t * 0.8 + ws.off) * 1.2, -1 + Math.cos(t * 0.5 + ws.off) * 2.5);
      ws.p.lerp(goal, Math.min(1, dt * ws.lag));
      if (dt > 0) { for (let k = TRAIL - 1; k > 0; k--) ws.trail[k].lerp(ws.trail[k - 1], Math.min(1, dt * 26)); ws.trail[0].copy(ws.p); }
      for (let k = 0; k < TRAIL; k++) { const q = ws.trail[k]; wispPos.set([q.x, q.y, q.z], (w * TRAIL + k) * 3); }
    }
    wispGeo.attributes.position.needsUpdate = true;

    composer.render(dt);
  }
  const _tmp = new THREE.Vector3(), _tmp2 = new THREE.Vector3();

  // ── Loop control ────────────────────────────────────────────────
  let running = false, raf = 0, visible = true, disposed = false;
  function loop() {
    if (!running) return;
    raf = requestAnimationFrame(loop);
    const real = clock.getDelta();
    renderFrame(Math.min(real, 1 / 20), real);
  }
  function start() {
    if (running || disposed) return;
    if (reducedMotion && !fly) { renderFrame(0); return; }
    running = true; clock.getDelta(); loop();
  }
  function stop() { running = false; cancelAnimationFrame(raf); }
  const onVis = () => { if (document.hidden) stop(); else if (visible) start(); };
  document.addEventListener('visibilitychange', onVis);
  let io = null;
  if ('IntersectionObserver' in window) {
    io = new IntersectionObserver(([e]) => { visible = e.isIntersecting; if (visible && !document.hidden) start(); else if (!fly) stop(); });
    io.observe(canvas);
  }
  const onResize = () => resize();
  window.addEventListener('resize', onResize);

  function dispose() {
    if (disposed) return;
    disposed = true; stop();
    window.removeEventListener('resize', onResize);
    window.removeEventListener('pointermove', onPointerMove);
    window.removeEventListener('pointerdown', onPointerMove);
    document.removeEventListener('visibilitychange', onVis);
    if (io) io.disconnect();
    scene.traverse(o => { if (o.geometry) o.geometry.dispose(); });
    disposables.forEach(d => d.dispose && d.dispose());
    composer.renderTarget1.dispose(); composer.renderTarget2.dispose();
    bloom.dispose && bloom.dispose();
    renderer.dispose();
    renderer.forceContextLoss && renderer.forceContextLoss();
  }

  resize();
  updateLeaves(0, 0);
  return { start, stop, resize, enter, dispose, reducedMotion, lowPower, _advance: (dt) => renderFrame(dt) };
}
