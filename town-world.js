/**
 * town-world.js — 3D Isekai Town for Ayush's Settlement
 * ES Module — requires Three.js (global) and GSAP loaded before this.
 *
 * Local dev: serve via `npx serve .` or Live Server
 * (ES modules require HTTP, not file://)
 */

import { Cart, FollowCamera } from './cart.js';
import { ParticleSystem } from './particles.js';
import { PostProcessing } from './post-processing.js';
import { AudioSystem } from './audio.js';
import { Achievements } from './achievements.js';

import * as THREE from 'three';
const gsap  = window.gsap;

// Accessibility: honour the OS "reduce motion" preference for camera shake,
// idle bobbing and UI slide-ins (the world itself still animates).
const REDUCED_MOTION = window.matchMedia &&
  window.matchMedia('(prefers-reduced-motion: reduce)').matches;

// ════════════════════════════════════════════════════════════════
// PERFORMANCE TIER (Phase 4.3 — mobile scaling)
// Picked once at boot. `?lowperf` / `?highperf` force a tier for testing.
// ════════════════════════════════════════════════════════════════

function detectPerfTier() {
  const q = new URLSearchParams(location.search);
  if (q.has('lowperf'))  return 'low';
  if (q.has('highperf')) return 'high';
  const touch  = 'ontouchstart' in window;
  const cores  = navigator.hardwareConcurrency || 8;
  const memory = navigator.deviceMemory || 8;
  const small  = Math.min(innerWidth, innerHeight) < 700;
  if (touch && (small || cores <= 4 || memory <= 4)) return 'low';
  return 'high';
}

const PERF_PRESETS = {
  high: { pixelRatio: 2,   shadowMap: 2048, softShadows: true,  fireflies: 150, fountain: 120, dust: 80, campfire: 40, bloom: true,  bloomScale: 1.0, npcs: true },
  low:  { pixelRatio: 1.5, shadowMap: 1024, softShadows: false, fireflies: 60,  fountain: 60,  dust: 40, campfire: 24, bloom: true,  bloomScale: 0.5, npcs: true },
};

// ════════════════════════════════════════════════════════════════
// ════════════════════════════════════════════════════════════════
// BUILDING DATA  (circular layout — hub + 3 spoke arms)
// ════════════════════════════════════════════════════════════════

export const animatedProps = [];

// Zone names are shared with audio.js zone detection, the fast-travel HUD,
// achievements and the project modal's contextual header.
export const ZONES = {
  square:   { name: 'Town Square',      spawn: { x: 0,   z: 30, rot:  Math.PI     } },
  north:    { name: 'Main Street',      spawn: { x: 0,   z: -12, rot: Math.PI     } },
  east:     { name: 'Research Quarter', spawn: { x: 14,  z: 0,  rot:  Math.PI / 2 } },
  west:     { name: 'Services Quarter', spawn: { x: -14, z: 0,  rot: -Math.PI / 2 } },
};

const BUILDINGS = [
  // Town Square — entry area (south of roundabout, z > 0)
  { x: -10, z: 28, w: 10, h: 7, d: 8, color: 0x6b4226, roof: 0x3d2b1f,
    chimney: true, label: 'The Tavern', project: null, zone: 'square', tavern: true },
  { x: -7, z: 16, w: 4, h: 5, d: 3, color: 0xd4c9b0, roof: 0x8b7355,
    label: 'Adventurer Stats', project: null, zone: 'square' },
  { x: 7, z: 16, w: 4, h: 5, d: 3, color: 0x6b4226, roof: 0x3e2518,
    label: 'Guild Board', project: null, zone: 'square' },

  // North Arm
  { x: -7, z: -14, w: 5.5, h: 6, d: 5, color: 0x6b4226, roof: 0x3d2b1f,
    chimney: true, label: 'The Forge', project: 'mavpose', zone: 'north' },
  { x: 7, z: -20, w: 5, h: 7, d: 4, color: 0xd4c9b0, roof: 0x2c2c3e,
    chimney: true, label: 'Ledger Sanctum', project: 'ledger', zone: 'north' },
  { x: -5, z: -36, w: 6, h: 5, d: 5, color: 0xc0392b, roof: 0xe74c3c,
    label: 'Tiny Tots Academy', project: 'tinytots', zone: 'north' },

  // East Arm
  { x: 18, z: -7, w: 6, h: 5, d: 6, color: 0x3a3a4a, roof: 0x1a1a2a,
    roofSegs: 8, label: 'Prediction Colosseum', project: 'xg', zone: 'east' },
  { x: 22, z: 7, w: 6, h: 4, d: 6, color: 0xe8dcc8, roof: null,
    label: 'Cloud Citadel', project: 'aws', zone: 'east' },
  { x: 40, z: 0, w: 4.5, h: 10, d: 4.5, color: 0x1a2a4a, roof: 0x0a1428,
    roofSegs: 16, label: 'Vortex Observatory', project: 'vortex', zone: 'east' },

  // West Arm
  { x: -20, z: 7, w: 4.5, h: 9, d: 4, color: 0x3b1f5e, roof: 0x6a0dad,
    roofSegs: 6, label: 'Concierge Parlour', project: 'ace', zone: 'west' },
  { x: -18, z: -7, w: 6, h: 4.5, d: 6, color: 0x06d6a0, roof: null,
    label: 'The Volley Court', project: 'volley', zone: 'west' },
  { x: -40, z: 0, w: 3.5, h: 14, d: 3.5, color: 0x1c2b3a, roof: null,
    label: "Navigator's Tower", project: 'instillgcs', zone: 'west' },
];

// ════════════════════════════════════════════════════════════════
// SHARED MATERIALS for Phase 2.5 additions
// (small step toward the planned materials.js registry — every new
//  prop below reuses these instead of allocating per-object materials)
// ════════════════════════════════════════════════════════════════

const SHARED = {
  planterWood: new THREE.MeshStandardMaterial({ color: 0x5a3a1e, roughness: 0.9 }),
  foliage:     new THREE.MeshStandardMaterial({ color: 0x3f8f3a, roughness: 0.85 }),
  // vertexColors would be simpler but instanceColor keeps one geometry + one material
  bloom:       new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.7 }),
};

// Reference-image bloom palette: pink / red / white / lilac / marigold
const BLOOM_PALETTE = [0xff4d6d, 0xff7b9c, 0xffb3c6, 0xfff1f5, 0xc77dff, 0xffa94d, 0xe63946];

// Wind sway — vertex displacement injected into MeshStandardMaterial.
// Works for both instanced (phase from instanceMatrix) and plain meshes.
const windUniforms = { uTime: { value: 0 } };
function applyWindSway(material, amplitude, yOffset) {
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uTime  = windUniforms.uTime;
    shader.uniforms.uAmp   = { value: amplitude };
    shader.uniforms.uYOff  = { value: yOffset };
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>
        uniform float uTime; uniform float uAmp; uniform float uYOff;`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        {
          #ifdef USE_INSTANCING
            vec2 wp = instanceMatrix[3].xz;
          #else
            vec2 wp = modelMatrix[3].xz;
          #endif
          float phase = (wp.x + wp.y) * 0.6;
          float w = clamp(position.y + uYOff, 0.0, 1.0);
          transformed.x += sin(uTime * 1.6 + phase) * uAmp * w;
          transformed.z += cos(uTime * 1.1 + phase * 1.3) * uAmp * 0.5 * w;
        }`);
  };
  // Same program for every material using this helper (only uniforms differ)
  material.customProgramCacheKey = () => 'windsway';
  return material;
}
applyWindSway(SHARED.bloom,   0.05, 0.5);
applyWindSway(SHARED.foliage, 0.04, 0.5);

// Which zone a world position falls in (same partition as audio.js).
export function zoneKeyAt(x, z) {
  if (Math.hypot(x, z) < 18) return 'square';
  const a = Math.atan2(x, z);                    // 0 = south (+z), ±PI = north
  if (Math.abs(a) < Math.PI / 4) return 'square';
  if (a > Math.PI / 4 && a < 3 * Math.PI / 4) return 'east';
  if (a < -Math.PI / 4 && a > -3 * Math.PI / 4) return 'west';
  return 'north';
}

// Collected during building construction, instanced once the scene is built
const flowerBoxSlots = [];   // { x, y, z, rotY }

// Tavern cone lights & ground pools (driven by DayCycle nightness)
const coneLightRefs = [];    // ShaderMaterial refs with uIntensity uniform

// NPC sprite materials (tinted by DayCycle) and sprites (waved by proximity)
const npcMats = [];
const npcs    = [];          // { sprite, idle, wave, phase }

// ════════════════════════════════════════════════════════════════
// HELPER: Build a building mesh group
// ════════════════════════════════════════════════════════════════

function makeBuilding(o) {
  const g = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({
    color: o.color, roughness: 0.75, metalness: 0.05,
  });

  // Body
  const body = new THREE.Mesh(new THREE.BoxGeometry(o.w, o.h, o.d), mat);
  body.position.y = o.h / 2;
  body.castShadow = true;
  body.receiveShadow = true;
  body.userData = { project: o.project, label: o.label };
  g.add(body);

  // Roof
  if (o.roof !== null && o.roof !== undefined) {
    const rMat = new THREE.MeshStandardMaterial({ color: o.roof, roughness: 0.7 });
    const segs = o.roofSegs || 4;
    const roof = new THREE.Mesh(
      new THREE.ConeGeometry(o.w * 0.78, o.h * 0.5, segs), rMat
    );
    roof.position.y = o.h + o.h * 0.25;
    roof.rotation.y = Math.PI / 4;
    roof.castShadow = true;
    g.add(roof);
    const trim = new THREE.Mesh(
      new THREE.BoxGeometry(o.w + 0.4, 0.12, o.d + 0.4), rMat
    );
    trim.position.y = o.h + 0.05;
    g.add(trim);
  }

  // Timber framing (Phase 2.5)
  if (o.roof !== null && (!o.roofSegs || o.roofSegs === 4)) {
    const timberMat = new THREE.MeshStandardMaterial({ color: 0x4a2a18, roughness: 0.95 });
    const tThick = 0.15;
    // Corners
    [ [-o.w/2, -o.d/2], [o.w/2, -o.d/2], [-o.w/2, o.d/2], [o.w/2, o.d/2] ].forEach(([x,z]) => {
      const col = new THREE.Mesh(new THREE.BoxGeometry(tThick, o.h + 0.1, tThick), timberMat);
      col.position.set(x, o.h/2, z);
      g.add(col);
    });
    // Horizontal bands
    [ 0.1, o.h - 0.1 ].forEach(y => {
      const hBand = new THREE.Mesh(new THREE.BoxGeometry(o.w + 0.1, tThick, o.d + 0.1), timberMat);
      hBand.position.y = y;
      g.add(hBand);
    });
  }

  // Hanging animated sign (Phase 2.5)
  if (o.label === 'The Tavern' || o.label === 'The Forge') {
    const isTavern = o.label === 'The Tavern';
    const sPivot = new THREE.Group();
    // Hang off the right side
    sPivot.position.set(o.w/2 + 0.1, o.h * 0.7, o.d/2 - 1.0); 
    
    const bracket = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.1, 0.1), new THREE.MeshStandardMaterial({color:0x333333}));
    bracket.position.set(0.6, 0, 0); // stick out right
    sPivot.add(bracket);
    
    const signGroup = new THREE.Group();
    signGroup.position.set(1.0, -0.05, 0); // hook loop pos
    const signMesh = new THREE.Mesh(
      new THREE.BoxGeometry(0.1, 1.2, 1.0), 
      new THREE.MeshStandardMaterial({color: isTavern ? 0x8B0000 : 0x555555})
    );
    signMesh.position.set(0, -0.6, 0); // hang down
    signGroup.add(signMesh);
    sPivot.add(signGroup);
    
    g.add(sPivot);
    animatedProps.push({
      update: (t) => { signGroup.rotation.z = Math.sin(t * 1.5 + o.x) * 0.2; }
    });
  }

  // Windows (front face)
  const winMat = new THREE.MeshStandardMaterial({
    color: 0xffd166, emissive: 0xffd166, emissiveIntensity: 0.8,
  });
  windowMats.push(winMat);
  const winGeo = new THREE.BoxGeometry(0.5, 0.6, 0.06);
  const isTudor = o.roof !== null && (!o.roofSegs || o.roofSegs === 4);
  [-o.w * 0.22, o.w * 0.22].forEach(wx => {
    const win = new THREE.Mesh(winGeo, winMat);
    win.position.set(wx, o.h * 0.58, o.d / 2 + 0.01);
    g.add(win);

    // Phase 2.5: flower box under every front window of a Tudor-style facade
    if (isTudor) {
      flowerBoxSlots.push({ x: o.x + wx, y: o.h * 0.58 - 0.42, z: o.z + o.d / 2 + 0.16 });
    }

    // Phase 2.5: warm light spilling from the Tavern windows
    if (o.tavern) {
      g.add(createConeLight(wx, o.h * 0.58, o.d / 2 + 0.05, o.h * 0.58 + 0.2));
    }
  });

  // Door
  const doorMat = new THREE.MeshStandardMaterial({ color: 0x3e2518, roughness: 0.85 });
  const door = new THREE.Mesh(
    new THREE.BoxGeometry(0.65, o.h * 0.3, 0.06), doorMat
  );
  door.position.set(0, o.h * 0.15, o.d / 2 + 0.01);
  g.add(door);

  // Chimney
  if (o.chimney) {
    const chim = new THREE.Mesh(
      new THREE.BoxGeometry(0.35, o.h * 0.35, 0.35),
      new THREE.MeshStandardMaterial({ color: 0x5a4033, roughness: 0.95 })
    );
    chim.position.set(o.w * 0.25, o.h + o.h * 0.45, 0);
    chim.castShadow = true;
    g.add(chim);
  }

  g.position.set(o.x, 0, o.z);
  
  // Phase 3.1: Floating interactive marker
  if (o.project) {
    const marker = new THREE.Mesh(
      new THREE.OctahedronGeometry(0.5, 0),
      new THREE.MeshStandardMaterial({color: 0xffd166, emissive: 0xffd166, emissiveIntensity: 0.5})
    );
    marker.position.y = o.h + 2;
    g.add(marker);
    g.userData.marker = marker;
    animatedProps.push({
      update: (t) => {
        marker.rotation.y = t * 1.5;
        marker.position.y = o.h + 2.5 + Math.sin(t * 2.5 + o.x) * 0.3;
      }
    });
  }
  g.userData.body = body; // For emissive highlighting

  return g;
}

// ════════════════════════════════════════════════════════════════
// PHASE 2.5 HELPERS: Cone lights, flower boxes, NPC sprites
// ════════════════════════════════════════════════════════════════

// Shared "light shaft" shader — additive, fades along length and at the
// silhouette so it reads as a soft volume rather than a hard cone.
const coneLightShader = {
  vertexShader: `
    varying vec2 vUv; varying vec3 vNormal; varying vec3 vViewDir;
    void main() {
      vUv = uv;
      vNormal = normalize(normalMatrix * normal);
      vec4 mv = modelViewMatrix * vec4(position, 1.0);
      vViewDir = normalize(-mv.xyz);
      gl_Position = projectionMatrix * mv;
    }`,
  fragmentShader: `
    uniform vec3 uColor; uniform float uIntensity;
    varying vec2 vUv; varying vec3 vNormal; varying vec3 vViewDir;
    void main() {
      float along  = vUv.y;                       // 1.0 at apex (window)
      float facing = abs(dot(normalize(vNormal), normalize(vViewDir)));
      float a = (along * along * 0.8 + along * 0.2) * smoothstep(0.0, 0.75, facing) * uIntensity;
      gl_FragColor = vec4(uColor * a, a);
    }`,
};

const lightPoolShader = {
  vertexShader: `
    varying vec2 vUv;
    void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: `
    uniform vec3 uColor; uniform float uIntensity;
    varying vec2 vUv;
    void main() {
      float d = length(vUv - 0.5) * 2.0;
      float a = pow(clamp(1.0 - d, 0.0, 1.0), 2.0) * uIntensity * 0.9;
      gl_FragColor = vec4(uColor * a, a);
    }`,
};

const coneGeo = new THREE.ConeGeometry(1, 1, 18, 1, true);
coneGeo.translate(0, -0.5, 0);           // apex at origin, base at y = -1
const poolGeo = new THREE.CircleGeometry(1, 24);

/**
 * Volumetric-looking warm light cone spilling from a window, plus a soft
 * pool on the ground where it lands. Local coords are the building's.
 * @param wx  window x (building-local)
 * @param wy  window y
 * @param wz  front face z
 * @param drop vertical distance from window to ground
 */
function createConeLight(wx, wy, wz, drop) {
  const g = new THREE.Group();
  const tilt = 0.85;                      // radians outward from the wall
  const len  = drop / Math.cos(tilt);
  const rad  = len * 0.46;

  const makeMat = (shader) => new THREE.ShaderMaterial({
    uniforms: {
      uColor:     { value: new THREE.Color(0xffb35c) },
      uIntensity: { value: 0.2 },
    },
    vertexShader: shader.vertexShader,
    fragmentShader: shader.fragmentShader,
    transparent: true, depthWrite: false, side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
  });

  const coneMat = makeMat(coneLightShader);
  const cone = new THREE.Mesh(coneGeo, coneMat);
  cone.scale.set(rad, len, rad);
  cone.position.set(wx, wy, wz);
  cone.rotation.x = -tilt;
  cone.renderOrder = 5;
  g.add(cone);

  const poolMat = makeMat(lightPoolShader);
  const pool = new THREE.Mesh(poolGeo, poolMat);
  pool.rotation.x = -Math.PI / 2;
  pool.scale.setScalar(rad * 1.15);
  pool.position.set(wx, 0.035, wz + len * Math.sin(tilt) * 0.9);
  pool.renderOrder = 4;
  g.add(pool);

  coneLightRefs.push({
    setNightness(n) {
      const v = 0.12 + n * 0.72;
      coneMat.uniforms.uIntensity.value = v;
      poolMat.uniforms.uIntensity.value = v;
    }
  });
  return g;
}

/**
 * Instanced window boxes: one planter box, foliage clumps and bloom
 * clusters per slot — 3 draw calls for the whole town regardless of count.
 * Also called for the Town Square flower beds (topOnly = true).
 */
function buildFlowerBoxes(scene, slots, bedSlots) {
  const planterGeo = new THREE.BoxGeometry(0.78, 0.22, 0.28);
  const foliageGeo = new THREE.IcosahedronGeometry(0.16, 1);
  const bloomGeo   = new THREE.IcosahedronGeometry(0.075, 0);

  const FOLIAGE_PER_BOX = 3, BLOOM_PER_BOX = 6, BLOOM_PER_BED = 10;
  const foliageCount = slots.length * FOLIAGE_PER_BOX + bedSlots.length * 4;
  const bloomCount   = slots.length * BLOOM_PER_BOX + bedSlots.length * BLOOM_PER_BED;

  const planters = new THREE.InstancedMesh(planterGeo, SHARED.planterWood, slots.length);
  const foliage  = new THREE.InstancedMesh(foliageGeo, SHARED.foliage, foliageCount);
  const blooms   = new THREE.InstancedMesh(bloomGeo,   SHARED.bloom,   bloomCount);
  planters.castShadow = true;

  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3();
  const col = new THREE.Color();
  let fi = 0, bi = 0;

  const place = (mesh, i, x, y, z, sc, rot) => {
    q.setFromEuler(new THREE.Euler(rot ? Math.random() : 0, rot ? Math.random() * Math.PI : 0, 0));
    s.set(sc.x, sc.y, sc.z);
    p.set(x, y, z);
    m.compose(p, q, s);
    mesh.setMatrixAt(i, m);
  };

  slots.forEach((sl, i) => {
    place(planters, i, sl.x, sl.y, sl.z, { x: 1, y: 1, z: 1 }, false);
    for (let k = 0; k < FOLIAGE_PER_BOX; k++) {
      const fx = sl.x + (k - 1) * 0.24, fz = sl.z + (Math.random() - 0.5) * 0.08;
      place(foliage, fi++, fx, sl.y + 0.16, fz, { x: 1, y: 0.75, z: 0.9 }, true);
    }
    for (let k = 0; k < BLOOM_PER_BOX; k++) {
      const bx = sl.x - 0.32 + (k / (BLOOM_PER_BOX - 1)) * 0.64 + (Math.random() - 0.5) * 0.06;
      const by = sl.y + 0.22 + Math.random() * 0.12;
      const bz = sl.z + (Math.random() - 0.5) * 0.14 + 0.04;
      place(blooms, bi, bx, by, bz, { x: 1, y: 1, z: 1 }, true);
      col.setHex(BLOOM_PALETTE[(i * 3 + k) % BLOOM_PALETTE.length]);
      blooms.setColorAt(bi++, col);
    }
  });

  bedSlots.forEach(([x, z], i) => {
    for (let k = 0; k < 4; k++) {
      place(foliage, fi++, x + (Math.random() - 0.5) * 1.5, 0.55, z + (Math.random() - 0.5) * 1.5,
        { x: 1.4, y: 0.9, z: 1.4 }, true);
    }
    for (let k = 0; k < BLOOM_PER_BED; k++) {
      place(blooms, bi, x + (Math.random() - 0.5) * 1.7, 0.62 + Math.random() * 0.15,
        z + (Math.random() - 0.5) * 1.7, { x: 1.3, y: 1.3, z: 1.3 }, true);
      col.setHex(BLOOM_PALETTE[(i * 5 + k) % BLOOM_PALETTE.length]);
      blooms.setColorAt(bi++, col);
    }
  });

  planters.instanceMatrix.needsUpdate = true;
  foliage.instanceMatrix.needsUpdate  = true;
  blooms.instanceMatrix.needsUpdate   = true;
  if (blooms.instanceColor) blooms.instanceColor.needsUpdate = true;
  scene.add(planters, foliage, blooms);
}

/**
 * NPC silhouette texture — a warmly rim-lit villager drawn on a canvas.
 * variant: 0 = hat / merchant, 1 = hooded traveller, 2 = child with cap
 * waving: right arm raised
 */
function makeNpcTexture(variant, waving) {
  const W = 64, H = 128;
  const cv = document.createElement('canvas');
  cv.width = W; cv.height = H;
  const c = cv.getContext('2d');

  // Body gradient: dark warm silhouette lit from the upper right (reference light)
  const grad = c.createLinearGradient(0, 0, W, H);
  grad.addColorStop(0, '#2a1a10');
  grad.addColorStop(0.55, '#4a2e1c');
  grad.addColorStop(1, '#6a4526');
  c.fillStyle = grad;

  const cx = W / 2;
  const scale = variant === 2 ? 0.78 : 1;
  const baseY = H - 4;

  c.save();
  c.translate(cx, baseY);
  c.scale(scale, scale);

  // Legs
  c.fillRect(-11, -34, 8, 34);
  c.fillRect(3, -34, 8, 34);
  // Torso (rounded trapezoid)
  c.beginPath();
  c.moveTo(-15, -34); c.lineTo(15, -34); c.lineTo(12, -76); c.lineTo(-12, -76); c.closePath();
  c.fill();
  // Arms
  c.beginPath();
  c.moveTo(-12, -74); c.lineTo(-19, -42); c.lineTo(-14, -40); c.lineTo(-8, -68); c.closePath();
  c.fill();
  if (waving) {
    c.beginPath();
    c.moveTo(12, -74); c.lineTo(26, -100); c.lineTo(30, -97); c.lineTo(16, -70); c.closePath();
    c.fill();
    c.beginPath(); c.arc(28, -101, 4, 0, Math.PI * 2); c.fill();
  } else {
    c.beginPath();
    c.moveTo(12, -74); c.lineTo(19, -42); c.lineTo(14, -40); c.lineTo(8, -68); c.closePath();
    c.fill();
  }
  // Head
  c.beginPath(); c.arc(0, -88, 11, 0, Math.PI * 2); c.fill();
  // Headwear
  if (variant === 0) {          // wide-brim hat
    c.fillRect(-17, -98, 34, 4);
    c.beginPath(); c.moveTo(-10, -98); c.lineTo(10, -98); c.lineTo(7, -112); c.lineTo(-7, -112); c.closePath(); c.fill();
  } else if (variant === 1) {   // hood
    c.beginPath(); c.arc(0, -90, 15, Math.PI, Math.PI * 2); c.fill();
    c.fillRect(-15, -90, 30, 10);
  } else {                      // cap
    c.beginPath(); c.arc(0, -92, 12, Math.PI, Math.PI * 2); c.fill();
    c.fillRect(-2, -94, 16, 3);
  }
  c.restore();

  // Warm rim light on the lit side
  c.globalCompositeOperation = 'source-atop';
  const rim = c.createLinearGradient(0, 0, W, 0);
  rim.addColorStop(0.55, 'rgba(255,190,110,0)');
  rim.addColorStop(1.0,  'rgba(255,190,110,0.55)');
  c.fillStyle = rim;
  c.fillRect(0, 0, W, H);

  const tex = new THREE.CanvasTexture(cv);
  tex.minFilter = THREE.LinearFilter;
  return tex;
}

function buildNpcs(scene, placements) {
  // 3 variants × 2 frames = 6 shared materials for any number of NPCs
  const frames = [0, 1, 2].map(v => {
    const idle = new THREE.SpriteMaterial({ map: makeNpcTexture(v, false), transparent: true, depthWrite: false });
    const wave = new THREE.SpriteMaterial({ map: makeNpcTexture(v, true),  transparent: true, depthWrite: false });
    npcMats.push(idle, wave);
    return { idle, wave };
  });

  placements.forEach(([x, z, variant], i) => {
    const f = frames[variant % 3];
    const h = variant === 2 ? 1.5 : 1.9;
    const sprite = new THREE.Sprite(f.idle);
    sprite.scale.set(h * 0.5, h, 1);
    sprite.position.set(x, h / 2, z);
    scene.add(sprite);
    npcs.push({ sprite, idle: f.idle, wave: f.wave, baseY: h / 2, phase: i * 1.7, waving: false });
  });
}

function updateNpcs(cartPos, elapsed) {
  for (const n of npcs) {
    const dx = n.sprite.position.x - cartPos.x, dz = n.sprite.position.z - cartPos.z;
    const near = dx * dx + dz * dz < 12 * 12;
    if (near !== n.waving) { n.waving = near; n.sprite.material = near ? n.wave : n.idle; }
    if (near) {
      // 4 Hz frame flip while waving
      n.sprite.material = (Math.floor(elapsed * 4 + n.phase) % 2 === 0) ? n.wave : n.idle;
    }
    if (!REDUCED_MOTION) {
      n.sprite.position.y = n.baseY + Math.sin(elapsed * 2 + n.phase) * 0.03;
    }
  }
}

// ════════════════════════════════════════════════════════════════
// HELPERS: Trees, Rocks, Lamps
// ════════════════════════════════════════════════════════════════

function createTree(x, z, s) {
  s = s || 1;
  const g = new THREE.Group();
  const trunk = new THREE.Mesh(
    new THREE.CylinderGeometry(0.12 * s, 0.18 * s, 2 * s, 8),
    new THREE.MeshStandardMaterial({ color: 0x6B4226, roughness: 0.9 })
  );
  trunk.position.y = s;
  trunk.castShadow = true;
  g.add(trunk);

  const canopy = new THREE.Mesh(
    new THREE.ConeGeometry(1.1 * s, 2.8 * s, 8),
    new THREE.MeshStandardMaterial({ color: 0x2d6a4f, roughness: 0.8 })
  );
  canopy.position.y = 3 * s;
  canopy.castShadow = true;
  g.add(canopy);

  g.position.set(x, 0, z);
  return g;
}

function createRock(x, z, s) {
  s = s || 1;
  const rock = new THREE.Mesh(
    new THREE.DodecahedronGeometry(0.4 * s, 0),
    new THREE.MeshStandardMaterial({ color: 0x7a7a7a, roughness: 0.95 })
  );
  rock.position.set(x, 0.2 * s, z);
  rock.rotation.set(Math.random() * 2, Math.random() * 2, Math.random() * 2);
  rock.castShadow = true;
  return rock;
}

// Tracked collections for day/night toggling
const lampRefs = [];      // { light, headMat }
const windowMats = [];    // MeshStandardMaterial refs

function addLamp(scene, x, z) {
  const g = new THREE.Group();
  const poleMat = new THREE.MeshStandardMaterial({ color: 0x3e2518, roughness: 0.9 });
  const glowMat = new THREE.MeshStandardMaterial({
    color: 0xffd166, emissive: 0xffd166, emissiveIntensity: 0.6,
  });
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.07, 3.5, 8), poleMat);
  pole.position.y = 1.75;
  g.add(pole);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.16, 8, 8), glowMat);
  head.position.y = 3.6;
  g.add(head);
  const pl = new THREE.PointLight(0xffd166, 0.7, 8);
  pl.position.y = 3.6;
  g.add(pl);
  g.position.set(x, 0, z);
  g.traverse(m => { if (m.isMesh) m.castShadow = true; });
  scene.add(g);
  lampRefs.push({ light: pl, headMat: glowMat });
}

// ════════════════════════════════════════════════════════════════
// LABEL SYSTEM (replaces CSS2DRenderer)
// ════════════════════════════════════════════════════════════════

class LabelSystem {
  constructor(camera, container) {
    this.camera = camera;
    this.labels = [];
    this.container = container;
  }
  add(text, position) {
    const div = document.createElement('div');
    div.className = 'building-label-3d';
    div.textContent = text;
    this.container.appendChild(div);
    this.labels.push({ div, position: position.clone() });
  }
  update(w, h) {
    this.labels.forEach(l => {
      const p = l.position.clone().project(this.camera);
      if (p.z > 1) { l.div.style.display = 'none'; return; }
      const x = (p.x * 0.5 + 0.5) * w;
      const y = (-(p.y * 0.5) + 0.5) * h;
      const dist = l.position.distanceTo(this.camera.position);
      const scale = Math.max(0.5, Math.min(1.3, 18 / dist));
      const opacity = dist > 55 ? 0 : dist > 35 ? (55 - dist) / 20 : 1;
      l.div.style.display = opacity > 0.01 ? 'block' : 'none';
      l.div.style.transform =
        `translate(-50%,-50%) translate(${x}px,${y}px) scale(${scale})`;
      l.div.style.opacity = opacity;
    });
  }
}

// ════════════════════════════════════════════════════════════════
// MOBILE JOYSTICK SETUP
// ════════════════════════════════════════════════════════════════

function setupMobileJoystick(cart) {
  const base   = document.getElementById('joystick-base');
  const handle = document.getElementById('joystick-handle');
  if (!base || !handle) return;

  function onTouch(e) {
    e.preventDefault();
    const rect = base.getBoundingClientRect();
    const cx = rect.width / 2, cy = rect.height / 2;
    const md = cx - 20;
    const touch = e.touches[0];
    let dx = touch.clientX - rect.left - cx;
    let dy = touch.clientY - rect.top  - cy;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist > md) { dx = dx / dist * md; dy = dy / dist * md; }
    handle.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
    cart.setJoystickInput(dx / md, dy / md);
  }

  base.addEventListener('touchstart', onTouch, { passive: false });
  base.addEventListener('touchmove',  onTouch, { passive: false });
  base.addEventListener('touchend', e => {
    e.preventDefault();
    handle.style.transform = 'translate(-50%, -50%)';
    cart.setJoystickInput(0, 0);
  }, { passive: false });
}

// ════════════════════════════════════════════════════════════════
// SKY DOME (gradient shader)
// ════════════════════════════════════════════════════════════════

function createSkyDome(scene) {
  const geo = new THREE.SphereGeometry(140, 32, 16);
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    uniforms: {
      topColor:     { value: new THREE.Color(0x3388ff) },
      horizonColor: { value: new THREE.Color(0x87ceeb) },
      bottomColor:  { value: new THREE.Color(0xd4f1f9) },
      exponent:     { value: 0.6 },
    },
    vertexShader: `
      varying vec3 vWP;
      void main() {
        vWP = (modelMatrix * vec4(position,1.0)).xyz;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0);
      }`,
    fragmentShader: `
      uniform vec3 topColor, horizonColor, bottomColor;
      uniform float exponent;
      varying vec3 vWP;
      void main() {
        float h = normalize(vWP).y;
        vec3 c = h > 0.0
          ? mix(horizonColor, topColor, pow(max(h,0.0), exponent))
          : mix(horizonColor, bottomColor, pow(max(-h,0.0), 0.5));
        gl_FragColor = vec4(c, 1.0);
      }`,
  });
  const sky = new THREE.Mesh(geo, mat);
  scene.add(sky);
  return { mesh: sky, material: mat };
}

// ════════════════════════════════════════════════════════════════
// DAY/NIGHT CYCLE SYSTEM
// ════════════════════════════════════════════════════════════════

class DayCycle {
  constructor(sun, ambientLight, skyMat, fogRef) {
    this.sun = sun;
    this.ambient = ambientLight;
    this.skyMat = skyMat;
    this.fog = fogRef;

    // Progress 0 → 1 over a full cycle
    // 0.0 = noon, 0.25 = sunset, 0.5 = midnight, 0.75 = dawn
    this.progress = 0.0;
    this.cycleDuration = 120; // seconds for one full cycle
    this.paused = false;
    this.targetProgress = null; // for manual snap

    // Sun orbit parameters (spherical)
    this.sunRadius = 30;
    this.sunBasePhi = 0.6;       // base elevation
    this.sunPhiAmplitude = 0.55; // elevation swing
    this.sunBaseTheta = 0.7;     // base azimuth
    this.sunThetaAmplitude = 1.2; // azimuth swing

    // Sky color presets [progress: {top, horizon, bottom}]
    // Day preset tuned to the reference art: saturated cobalt zenith fading
    // to a pale, slightly warm horizon (was a flatter 0x3388ff / 0x87ceeb).
    this.skyPresets = {
      day:     { top: new THREE.Color(0x2f7fe6), horizon: new THREE.Color(0xa9dcf5), bottom: new THREE.Color(0xeaf3f6) },
      sunset:  { top: new THREE.Color(0x1a1a6a), horizon: new THREE.Color(0xff6b35), bottom: new THREE.Color(0xffaa55) },
      night:   { top: new THREE.Color(0x030020), horizon: new THREE.Color(0x0d0825), bottom: new THREE.Color(0x1a0a2e) },
      dawn:    { top: new THREE.Color(0x2244aa), horizon: new THREE.Color(0xffaa77), bottom: new THREE.Color(0xffd4a8) },
    };

    // Light color presets
    this.lightPresets = {
      // Golden-hour day: warmer, punchier key light + slightly lifted ambient
      day:    { color: new THREE.Color(0xffdca0), intensity: 1.5, ambient: 0.55, ambientColor: new THREE.Color(0xffe6c4) },
      sunset: { color: new THREE.Color(0xff8844), intensity: 0.9, ambient: 0.35, ambientColor: new THREE.Color(0xffaa66) },
      night:  { color: new THREE.Color(0x4466aa), intensity: 0.3, ambient: 0.15, ambientColor: new THREE.Color(0x223355) },
      dawn:   { color: new THREE.Color(0xffbb88), intensity: 0.8, ambient: 0.4,  ambientColor: new THREE.Color(0xffcc99) },
    };

    // Fog presets
    this.fogPresets = {
      day:    { color: new THREE.Color(0xa9dcf5), density: 0.0045 },  // matches day horizon
      sunset: { color: new THREE.Color(0xcc8866), density: 0.007 },
      night:  { color: new THREE.Color(0x0a0a1a), density: 0.010 },
      dawn:   { color: new THREE.Color(0xaabb99), density: 0.006 },
    };
  }

  // Get blended values based on progress
  _getPhase() {
    // Map progress to phase: 0=noon, .25=sunset, .5=midnight, .75=dawn
    const p = this.progress;
    if (p < 0.15)      return { from: 'day',    to: 'day',    t: 0 };
    if (p < 0.3)       return { from: 'day',    to: 'sunset', t: (p - 0.15) / 0.15 };
    if (p < 0.35)      return { from: 'sunset', to: 'sunset', t: 0 };
    if (p < 0.5)       return { from: 'sunset', to: 'night',  t: (p - 0.35) / 0.15 };
    if (p < 0.65)      return { from: 'night',  to: 'night',  t: 0 };
    if (p < 0.8)       return { from: 'night',  to: 'dawn',   t: (p - 0.65) / 0.15 };
    if (p < 0.85)      return { from: 'dawn',   to: 'dawn',   t: 0 };
    return                     { from: 'dawn',   to: 'day',    t: (p - 0.85) / 0.15 };
  }

  _lerpColor(out, a, b, t) {
    out.r = a.r + (b.r - a.r) * t;
    out.g = a.g + (b.g - a.g) * t;
    out.b = a.b + (b.b - a.b) * t;
  }

  isNight() {
    return this.progress > 0.35 && this.progress < 0.8;
  }

  // Snap to day or night (called by theme toggle)
  snapTo(dayOrNight) {
    this.targetProgress = dayOrNight === 'night' ? 0.5 : 0.0;
  }

  update(delta) {
    // Advance cycle
    if (!this.paused) {
      this.progress += delta / this.cycleDuration;
      if (this.progress >= 1.0) this.progress -= 1.0;
    }

    // Smooth snap toward target
    if (this.targetProgress !== null) {
      const diff = this.targetProgress - this.progress;
      // Handle wrapping
      let step = diff;
      if (Math.abs(diff) > 0.5) step = diff > 0 ? diff - 1 : diff + 1;
      this.progress += step * Math.min(delta * 2, 0.05);
      if (this.progress < 0) this.progress += 1;
      if (this.progress >= 1) this.progress -= 1;
      if (Math.abs(step) < 0.005) this.targetProgress = null;
    }

    const phase = this._getPhase();
    const { from, to, t } = phase;

    // ── Sky colors ─────────────────────────────────────────────
    const skyFrom = this.skyPresets[from];
    const skyTo   = this.skyPresets[to];
    this._lerpColor(this.skyMat.uniforms.topColor.value,     skyFrom.top,     skyTo.top,     t);
    this._lerpColor(this.skyMat.uniforms.horizonColor.value, skyFrom.horizon, skyTo.horizon, t);
    this._lerpColor(this.skyMat.uniforms.bottomColor.value,  skyFrom.bottom,  skyTo.bottom,  t);

    // ── Sun position (spherical orbit) ─────────────────────────
    const progressOffset = 9 / 16;
    const angle = -(this.progress + progressOffset) * Math.PI * 2;
    const theta = this.sunBaseTheta + Math.sin(angle) * this.sunThetaAmplitude;
    const phi   = this.sunBasePhi + Math.cos(angle) * 0.5 * this.sunPhiAmplitude;

    this.sun.position.setFromSpherical(
      new THREE.Spherical(this.sunRadius, phi, theta)
    );

    // ── Sun light color & intensity ────────────────────────────
    const lightFrom = this.lightPresets[from];
    const lightTo   = this.lightPresets[to];
    this._lerpColor(this.sun.color, lightFrom.color, lightTo.color, t);
    this.sun.intensity = lightFrom.intensity + (lightTo.intensity - lightFrom.intensity) * t;

    // ── Ambient ────────────────────────────────────────────────
    this._lerpColor(this.ambient.color, lightFrom.ambientColor, lightTo.ambientColor, t);
    this.ambient.intensity = lightFrom.ambient + (lightTo.ambient - lightFrom.ambient) * t;

    // ── Fog ────────────────────────────────────────────────────
    const fogFrom = this.fogPresets[from];
    const fogTo   = this.fogPresets[to];
    this._lerpColor(this.fog.color, fogFrom.color, fogTo.color, t);
    this.fog.density = fogFrom.density + (fogTo.density - fogFrom.density) * t;

    // ── Lamps: brighter at night, dimmer in day ───────────────
    const nightness = this.isNight() ? 1.0 :
      (this.progress > 0.25 && this.progress <= 0.35) ? (this.progress - 0.25) / 0.1 :
      (this.progress >= 0.8 && this.progress < 0.9) ? 1.0 - (this.progress - 0.8) / 0.1 : 0.0;

    for (const lamp of lampRefs) {
      lamp.light.intensity = 0.1 + nightness * 0.9;
      lamp.headMat.emissiveIntensity = 0.1 + nightness * 0.9;
    }

    // ── Window glow: brighter at night ─────────────────────────
    for (const mat of windowMats) {
      mat.emissiveIntensity = 0.2 + nightness * 0.8;
    }

    // ── Tavern cone lights / ground pools (Phase 2.5) ──────────
    for (const ref of coneLightRefs) ref.setNightness(nightness);

    // ── NPC sprites: warm by day, cool & dim by night ──────────
    if (npcMats.length) {
      const r = 1 - nightness * 0.55, g = 1 - nightness * 0.5, b = 1 - nightness * 0.25;
      for (const mat of npcMats) mat.color.setRGB(r, g, b);
    }

    this.nightness = nightness;
    windUniforms.uTime.value += delta;
  }
}

// ════════════════════════════════════════════════════════════════
// MAIN: initTownWorld
// ════════════════════════════════════════════════════════════════

function initTownWorld() {
  if (window._townWorldBooted) return;
  window._townWorldBooted = true;

  const canvas   = document.getElementById('town-canvas');
  const townRoot = document.getElementById('town-world');
  const isTouch  = 'ontouchstart' in window;

  // ── Performance tier (Phase 4.3) ────────────────────────────
  const perfTier = detectPerfTier();
  const PERF = PERF_PRESETS[perfTier];
  window._perfTier = perfTier;
  townRoot.dataset.perf = perfTier;

  // ── Renderer ────────────────────────────────────────────────
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: perfTier === 'high', powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(devicePixelRatio, PERF.pixelRatio));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = PERF.softShadows ? THREE.PCFSoftShadowMap : THREE.PCFShadowMap;
  renderer.setSize(innerWidth, innerHeight);

  // ── Scene ───────────────────────────────────────────────────
  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0x87ceeb, 0.005);
  window._townScene = scene;

  // ── Particle System ─────────────────────────────────────────
  const particleSystem = new ParticleSystem(scene);
  window._particleSystem = particleSystem;

  // ── Camera ──────────────────────────────────────────────────
  const camera = new THREE.PerspectiveCamera(
    60, innerWidth / innerHeight, 0.1, 300
  );
  camera.position.set(0, 8, 40);
  camera.lookAt(0, 2, 0);

  // ── Post-Processing ──────────────────────────────────────────
  const postFx = new PostProcessing(renderer, scene, camera, {
    bloom: PERF.bloom, bloomScale: PERF.bloomScale,
  });

  window.addEventListener('resize', () => {
    renderer.setSize(innerWidth, innerHeight);
    camera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();
    postFx.resize(innerWidth, innerHeight);
  });

  // ── Sky ─────────────────────────────────────────────────────
  const skyData = createSkyDome(scene);

  // ── Ground ──────────────────────────────────────────────────
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(250, 250),
    new THREE.MeshStandardMaterial({ color: 0x4a7c3f, roughness: 1 })
  );
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);

  // ── Roads (circular layout: roundabout + spokes + ring) ─────
  const roadMat = new THREE.MeshStandardMaterial({ color: 0x9e8c6c, roughness: 0.95 });

  function addRoad(x, z, w, h) {
    const r = new THREE.Mesh(new THREE.PlaneGeometry(w, h), roadMat);
    r.rotation.x = -Math.PI / 2;
    r.position.set(x, 0.02, z);
    r.receiveShadow = true;
    scene.add(r);
  }

  // Roundabout circle (center)
  const roundabout = new THREE.Mesh(
    new THREE.RingGeometry(3.5, 9, 32),
    new THREE.MeshStandardMaterial({ color: 0xb8a88a, roughness: 0.95 })
  );
  roundabout.rotation.x = -Math.PI / 2;
  roundabout.position.y = 0.018;
  scene.add(roundabout);

  // South spoke (entry road — town square)
  addRoad(0, 20, 7, 34);
  // Town square wider area
  const sqPlaza = new THREE.Mesh(
    new THREE.PlaneGeometry(28, 18),
    new THREE.MeshStandardMaterial({ color: 0x5c3d2e, roughness: 1 })
  );
  sqPlaza.rotation.x = -Math.PI / 2;
  sqPlaza.position.set(-3, 0.012, 26);
  scene.add(sqPlaza);

  // North spoke road
  addRoad(0, -25, 7, 44);
  // East spoke road
  addRoad(25, 0, 44, 7);
  // West spoke road
  addRoad(-25, 0, 44, 7);

  // Ring road (approximated as 24-segment polygon at radius 50)
  const RING_R = 50;
  const RING_SEGS = 24;
  for (let i = 0; i < RING_SEGS; i++) {
    const a1 = (i / RING_SEGS) * Math.PI * 2;
    const a2 = ((i + 1) / RING_SEGS) * Math.PI * 2;
    const mx = (Math.sin(a1) + Math.sin(a2)) / 2 * RING_R;
    const mz = (Math.cos(a1) + Math.cos(a2)) / 2 * RING_R;
    const dx = Math.sin(a2) * RING_R - Math.sin(a1) * RING_R;
    const dz = Math.cos(a2) * RING_R - Math.cos(a1) * RING_R;
    const len = Math.sqrt(dx * dx + dz * dz);
    const seg = new THREE.Mesh(new THREE.PlaneGeometry(5, len + 1), roadMat);
    seg.rotation.x = -Math.PI / 2;
    seg.rotation.z = -Math.atan2(dz, dx) + Math.PI / 2;
    seg.position.set(mx, 0.02, mz);
    seg.receiveShadow = true;
    scene.add(seg);
  }

  // ── Signboards ──────────────────────────────────────────────
  function addSignboard(x, z, text, rotY = 0) {
    const g = new THREE.Group();
    // Pole
    const pole = new THREE.Mesh(
      new THREE.CylinderGeometry(0.08, 0.08, 2.8, 8),
      new THREE.MeshStandardMaterial({ color: 0x5a3a1a, roughness: 0.9 })
    );
    pole.position.y = 1.4;
    pole.castShadow = true;
    g.add(pole);
    // Board
    const cv = document.createElement('canvas');
    cv.width = 256; cv.height = 64;
    const cx = cv.getContext('2d');
    cx.fillStyle = '#3a2210';
    cx.fillRect(0, 0, 256, 64);
    cx.strokeStyle = '#7a5a30';
    cx.lineWidth = 3;
    cx.strokeRect(2, 2, 252, 60);
    cx.fillStyle = '#f4e4c1';
    cx.font = 'bold 26px serif';
    cx.textAlign = 'center';
    cx.textBaseline = 'middle';
    cx.fillText(text, 128, 32);
    const tex = new THREE.CanvasTexture(cv);
    const sign = new THREE.Mesh(
      new THREE.BoxGeometry(2.2, 0.55, 0.1),
      [roadMat, roadMat, roadMat, roadMat,
       new THREE.MeshStandardMaterial({ map: tex }),
       new THREE.MeshStandardMaterial({ map: tex })]
    );
    sign.position.y = 3.0;
    sign.castShadow = true;
    g.add(sign);
    g.position.set(x, 0, z);
    g.rotation.y = rotY;
    scene.add(g);
  }

  // Roundabout exit signs
  addSignboard(0, -10, '← Forge · Ledger · TinyTots →', 0);              // north exit
  addSignboard(10, 0,  '← Colosseum · Vortex · Cloud →', Math.PI / 2);   // east exit
  addSignboard(-10, 0, '← Concierge · Nav · Volley →', -Math.PI / 2);    // west exit
  addSignboard(0, 10,  '↓ Town Square · Tavern ↓', Math.PI);             // south exit

  // Ring road signposts (at spoke-ring intersections)
  addSignboard(0, -RING_R + 2, '← West  ·  Roundabout  ·  East →', 0);
  addSignboard(RING_R - 2, 0, '← North  ·  Roundabout  ·  South →', Math.PI / 2);
  addSignboard(-RING_R + 2, 0, '← South  ·  Roundabout  ·  North →', -Math.PI / 2);

  // ── Lighting ────────────────────────────────────────────────
  const ambientLight = new THREE.AmbientLight(0xffe4b5, 0.5);
  scene.add(ambientLight);

  const sun = new THREE.DirectionalLight(0xffdca0, 1.5);
  sun.position.set(10, 20, 10);
  sun.castShadow = true;
  sun.shadow.mapSize.set(PERF.shadowMap, PERF.shadowMap);
  sun.shadow.bias = -0.0004;      // tame acne stripes on the flat roads
  sun.shadow.normalBias = 0.03;
  sun.shadow.camera.far   = 250;
  sun.shadow.camera.left  = -80;
  sun.shadow.camera.right =  80;
  sun.shadow.camera.top   =  80;
  sun.shadow.camera.bottom = -80;
  scene.add(sun);

  // ── Day/Night Cycle ─────────────────────────────────────────
  const dayCycle = new DayCycle(sun, ambientLight, skyData.material, scene.fog);
  window._dayCycle = dayCycle;

  // Sync with initial theme
  const initTheme = document.documentElement.getAttribute('data-theme');
  if (initTheme === 'night') dayCycle.snapTo('night');

  // Listen for theme toggle changes
  const themeObserver = new MutationObserver((mutations) => {
    for (const m of mutations) {
      if (m.attributeName === 'data-theme') {
        const theme = document.documentElement.getAttribute('data-theme');
        dayCycle.snapTo(theme === 'night' ? 'night' : 'day');
      }
    }
  });
  themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });

  // ── Buildings ───────────────────────────────────────────────
  const colliders     = [];
  const buildingMeta  = [];          // { data, position }

  BUILDINGS.forEach(o => {
    const b = makeBuilding(o);
    scene.add(b);

    buildingMeta.push({
      data: o,
      position: new THREE.Vector3(o.x, 0, o.z),
      mesh: b
    });

    if (o.chimney) {
      particleSystem.createSmoke(new THREE.Vector3(o.x + o.w * 0.25, o.h * 1.45 + 0.5, o.z));
    }

    // Collider (slightly padded)
    const hw = o.w / 2 + 0.5;
    const hd = o.d / 2 + 0.5;
    colliders.push(new THREE.Box3(
      new THREE.Vector3(o.x - hw, 0, o.z - hd),
      new THREE.Vector3(o.x + hw, o.h + 2, o.z + hd)
    ));
  });

  // ── Town Square fountain ────────────────────────────────────
  const fountainBase = new THREE.Mesh(
    new THREE.CylinderGeometry(2.5, 2.8, 0.6, 16),
    new THREE.MeshStandardMaterial({ color: 0xd4c9b0, roughness: 0.95 })
  );
  fountainBase.position.set(0, 0.3, 0);
  fountainBase.castShadow = true;
  scene.add(fountainBase);

  colliders.push(new THREE.Box3(
    new THREE.Vector3(-3, 0, -3),
    new THREE.Vector3(3, 2, 3)
  ));

  const water = new THREE.Mesh(
    new THREE.CylinderGeometry(2.2, 2.2, 0.1, 16),
    new THREE.MeshStandardMaterial({
      color: 0x4fc3f7, transparent: true, opacity: 0.7,
      roughness: 0.1, metalness: 0.3,
    })
  );
  water.position.set(0, 0.65, 0);
  scene.add(water);

  // Audio system integration
  const audioSys = new AudioSystem(camera);
  audioSys.attachFountain(water);

  // Fountain spout
  const spout = new THREE.Mesh(
    new THREE.CylinderGeometry(0.15, 0.15, 2.2, 8),
    new THREE.MeshStandardMaterial({ color: 0xd4c9b0, roughness: 0.9 })
  );
  spout.position.set(0, 1.5, 0);
  scene.add(spout);

  particleSystem.createFountainSpray(new THREE.Vector3(0, 2.6, 0), PERF.fountain);

  // ── Vortex orb (East arm — above Observatory) ───────────────
  const orb = new THREE.Mesh(
    new THREE.SphereGeometry(0.5, 16, 16),
    new THREE.MeshStandardMaterial({
      color: 0x06d6a0, emissive: 0x06d6a0, emissiveIntensity: 1,
    })
  );
  orb.position.set(40, 12, 0);
  scene.add(orb);
  const orbLight = new THREE.PointLight(0x06d6a0, 1.2, 12);
  orbLight.position.copy(orb.position);
  scene.add(orbLight);

  // ── Tavern tables & fire (town square entry area) ───────────
  const tableMat = new THREE.MeshStandardMaterial({ color: 0x6b4226, roughness: 0.8 });
  [[-14, 26], [-6, 32], [-13, 33]].forEach(([x, z]) => {
    const top = new THREE.Mesh(
      new THREE.CylinderGeometry(0.8, 0.8, 0.12, 8), tableMat
    );
    top.position.set(x, 0.9, z);
    top.castShadow = true;
    scene.add(top);
    const leg = new THREE.Mesh(
      new THREE.CylinderGeometry(0.06, 0.06, 0.85, 8), tableMat
    );
    leg.position.set(x, 0.45, z);
    scene.add(leg);
  });

  const fireGlow = new THREE.PointLight(0xff6b35, 2, 12);
  fireGlow.position.set(-10, 2, 30);
  scene.add(fireGlow);

  particleSystem.createCampfire(new THREE.Vector3(-10, 0.2, 30), PERF.campfire);
  audioSys.attachFire(fireGlow);

  // ── Lamps (circular layout) ─────────────────────────────────
  // Roundabout perimeter
  [[7, 7], [-7, 7], [7, -7], [-7, -7]].forEach(([x, z]) => addLamp(scene, x, z));
  // Town Square / entry
  [[-4, 18], [4, 18], [-14, 24], [-6, 34], [2, 28]].forEach(([x, z]) => addLamp(scene, x, z));
  // North spoke
  [[-4, -12], [4, -18], [-4, -28], [4, -38]].forEach(([x, z]) => addLamp(scene, x, z));
  // East spoke
  [[14, -4], [14, 4], [28, -4], [28, 4], [42, -5]].forEach(([x, z]) => addLamp(scene, x, z));
  // West spoke
  [[-14, -4], [-14, 4], [-28, -4], [-28, 4], [-42, 5]].forEach(([x, z]) => addLamp(scene, x, z));
  // Ring road (every ~60 degrees)
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    addLamp(scene, Math.sin(a) * (RING_R + 3), Math.cos(a) * (RING_R + 3));
  }

  // ── Trees (surrounding the circular village) ────────────────
  [
    // Between spokes (inner)
    [12, -18], [-12, -18], [12, 14], [-16, 14],
    [14, 12],  [-14, 12],  [14, -10], [-14, -10],
    // Around ring road (outer)
    [58, 10], [58, -10], [-58, 10], [-58, -10],
    [10, -58], [-10, -58], [10, 58], [-10, 58],
    [42, 38], [-42, 38], [42, -38], [-42, -38],
    [38, 42], [-38, 42], [38, -42], [-38, -42],
    // Wilderness beyond ring
    [65, 25], [-65, 25], [65, -30], [-65, -30],
    [30, 65], [-30, 65], [30, -65], [-30, -65],
    [55, 50], [-55, 50], [50, -55], [-50, -55],
    // Entry approach
    [15, 38], [-20, 40], [20, 48], [-25, 50],
  ].forEach(([x, z]) => scene.add(createTree(x, z, 0.8 + Math.random() * 0.6)));

  // ── Rocks ───────────────────────────────────────────────────
  [
    [15, 22], [-18, 20], [25, -12], [-25, -14],
    [10, -30], [-12, -32], [30, 10], [-32, 8],
    [48, -20], [-48, 18], [20, -48], [-18, 48],
    [55, 35], [-55, -40], [38, -55], [-40, 55],
  ].forEach(([x, z]) => scene.add(createRock(x, z, 0.6 + Math.random() * 0.8)));

  // ── Phase 2.5: Enhanced Zone Details ──────────────────────────

  // Flower Beds (Town Square) — wind sway is now vertex displacement in the
  // shader (see applyWindSway) instead of whole-mesh rotation.
  const flowerGeo = new THREE.BoxGeometry(2, 0.4, 2);
  const flowerMat = applyWindSway(
    new THREE.MeshStandardMaterial({ color: 0x8e44ad, roughness: 1 }), 0.08, 0.2);
  const bedMat = new THREE.MeshStandardMaterial({ color: 0x5c3d2e });
  const bedGeo = new THREE.BoxGeometry(2.4, 0.3, 2.4);
  const BED_SLOTS = [[-10, 8], [10, 8], [-10, 24], [10, 24]];
  BED_SLOTS.forEach(([x,z]) => {
    const bed = new THREE.Mesh(bedGeo, bedMat);
    bed.position.set(x, 0.15, z);
    scene.add(bed);
    const flowers = new THREE.Mesh(flowerGeo, flowerMat);
    flowers.position.set(x, 0.35, z);
    scene.add(flowers);
  });

  // Phase 2.5: window flower boxes (instanced) + bloom clusters on the beds
  buildFlowerBoxes(scene, flowerBoxSlots, BED_SLOTS);

  // Phase 2.5: NPC silhouettes near stalls, tavern tables and shopfronts
  if (PERF.npcs) {
    buildNpcs(scene, [
      [-5.8, 21.5, 0], [5.8, 26.8, 1], [-13, 34.6, 2],      // Town Square stalls / tavern tables
      [-5.5, 19.8, 1],                                       // by Adventurer Stats
      [-5, -10, 0], [6, -16.3, 2],                           // Main Street: Forge, Ledger
      [-4.5, -31.8, 2],                                      // outside Tiny Tots
      [20, 11.5, 1], [-16.5, 9.5, 0],                        // Cloud Citadel, Concierge
    ]);
  }

  // Market Stalls (Town Square)
  const stallGroup = new THREE.Group();
  const table = new THREE.Mesh(new THREE.BoxGeometry(3, 0.1, 1.5), new THREE.MeshStandardMaterial({color:0x8B4513}));
  table.position.y = 0.8;
  stallGroup.add(table);
  const legGeo = new THREE.CylinderGeometry(0.05, 0.05, 0.8);
  [-1.4, 1.4].forEach(x => [-0.6, 0.6].forEach(z => {
    const leg = new THREE.Mesh(legGeo, new THREE.MeshStandardMaterial({color:0x3e2518}));
    leg.position.set(x, 0.4, z);
    stallGroup.add(leg);
  }));
  const canopy = new THREE.Mesh(new THREE.PlaneGeometry(3.5, 2.5), new THREE.MeshStandardMaterial({color: 0xc0392b, side: THREE.DoubleSide}));
  canopy.position.set(0, 2.0, 0);
  canopy.rotation.x = -Math.PI/3;
  stallGroup.add(canopy);
  
  [[-4, 24, Math.PI/2], [4, 24, -Math.PI/2]].forEach(([x,z,r]) => {
    const s = stallGroup.clone();
    s.position.set(x, 0, z);
    s.rotation.y = r;
    scene.add(s);
  });

  // Glowing Rune Circles & Floating Books (Research Quarter - East Arm)
  const runeMat = new THREE.MeshStandardMaterial({
    color: 0x06d6a0, emissive: 0x06d6a0, emissiveIntensity: 0.8,
    transparent: true, opacity: 0.6
  });
  const runeRing = new THREE.Mesh(new THREE.TorusGeometry(8, 0.1, 3, 32), runeMat);
  runeRing.rotation.x = -Math.PI/2;
  runeRing.position.set(40, 0.05, 0);
  scene.add(runeRing);
  animatedProps.push({ update: (t) => { runeRing.rotation.z = t * -0.2; }});

  const bookGeo = new THREE.BoxGeometry(0.8, 0.2, 0.6);
  const bookMat = new THREE.MeshStandardMaterial({ color: 0x5e35b1, roughness: 0.4 });
  const books = new THREE.Group();
  books.position.set(40, 3, 0);
  scene.add(books);
  for(let i=0; i<3; i++) {
    const b = new THREE.Mesh(bookGeo, bookMat);
    b.position.set(Math.sin(i * Math.PI*2/3) * 6, Math.sin(i) * 2, Math.cos(i * Math.PI*2/3) * 6);
    b.rotation.set(Math.random(), Math.random(), Math.random());
    books.add(b);
  }
  animatedProps.push({ update: (t) => { 
    books.rotation.y = t * 0.5;
    books.children.forEach((b, i) => {
      b.position.y += Math.sin(t * 2 + i) * 0.02;
      b.rotation.x += 0.01;
      b.rotation.z += 0.015;
    });
  }});

  // Tavern Mugs and Barrels (South Arm - Tavern)
  const mugGeo = new THREE.CylinderGeometry(0.1, 0.1, 0.2, 8);
  const mugMat = new THREE.MeshStandardMaterial({ color: 0xcccccc, roughness:0.2 });
  [[-14.2, 25.8], [-13.8, 26.1], [-6.1, 31.9], [-12.8, 33.2]].forEach(([x,z]) => {
    const mug = new THREE.Mesh(mugGeo, mugMat);
    mug.position.set(x, 1.05, z);
    scene.add(mug);
  });
  
  const barrelGeo = new THREE.CylinderGeometry(0.4, 0.4, 1.0, 12);
  const barrelMat = new THREE.MeshStandardMaterial({ color: 0x5a4033, roughness: 0.95 });
  [[-12, 28], [-12, 29], [-11, 28.5]].forEach(([x,z]) => {
    const barrel = new THREE.Mesh(barrelGeo, barrelMat);
    barrel.position.set(x, 0.5, z);
    scene.add(barrel);
  });

  // ── Label System ────────────────────────────────────────────
  const labelsContainer = document.getElementById('labels-container');
  const labelSys = new LabelSystem(camera, labelsContainer);
  buildingMeta.forEach(bm => {
    labelSys.add(bm.data.label, new THREE.Vector3(bm.data.x, bm.data.h + 1.5, bm.data.z));
  });

  // ── Cart ────────────────────────────────────────────────────
  const cart = new Cart(scene, { x: 0, z: 30 });
  const cartDust = particleSystem.createCartDust(PERF.dust);
  window._cart = cart;

  // ── Follow Camera ───────────────────────────────────────────
  const followCam = new FollowCamera(camera);
  followCam.reducedMotion = REDUCED_MOTION;

  // ── Mobile Joystick ─────────────────────────────────────────
  if (isTouch) {
    const jsEl = document.getElementById('mobile-joystick');
    if (jsEl) jsEl.style.display = 'block';
    setupMobileJoystick(cart);
    townRoot.classList.add('is-touch');
  }

  // ── Ambient Fireflies ───────────────────────────────────────
  particleSystem.createFireflies(PERF.fireflies, {x: 80, y: 12, z: 150});

  // ── Achievements & exploration tracking (Phase 3.4) ─────────
  const achievements = new Achievements({
    container: townRoot,
    buildings: BUILDINGS.map(b => ({ label: b.label, zone: b.zone, project: b.project })),
    zones: Object.keys(ZONES),
    reducedMotion: REDUCED_MOTION,
    onUnlock: () => audioSys.playChime(),
  });
  window._achievements = achievements;

  // ── Modal ↔ town bridge ─────────────────────────────────────
  // index.html dispatches `settlement:modal` on open/close. While a project
  // modal is open the cart ignores driving input (it coasts to a stop) and
  // the 3D interact keys are muted so E/Space don't leak into the modal.
  let modalOpen = false;
  document.addEventListener('settlement:modal', e => {
    modalOpen = !!(e.detail && e.detail.open);
    cart.inputLocked = modalOpen;
    if (modalOpen && e.detail.projectId) achievements.onProjectOpened(e.detail.projectId);
  });

  function openProject(data) {
    if (!data || !data.project || modalOpen || typeof window.openModal !== 'function') return;
    const zone = ZONES[data.zone];
    window.openModal(data.project, { zone: zone ? zone.name : '', zoneKey: data.zone, building: data.label });
  }

  // ── Fast-travel / fallback zone HUD (Phase 4.3, partial 1.4) ─
  // Real <button>s so keyboard + screen-reader users can move around the
  // town without driving; on touch devices this is the "don't want to
  // drive" path. Uses Cart.teleportTo (GSAP glide) — the road-spline
  // auto-drive from §1.4 is still open.
  const zoneHud = document.getElementById('zone-hud');
  let lastZoneKey = null;
  if (zoneHud) {
    zoneHud.querySelectorAll('[data-zone]').forEach(btn => {
      btn.addEventListener('click', () => {
        const z = ZONES[btn.dataset.zone];
        if (!z || cart.teleporting || modalOpen) return;
        cart.teleportTo(z.spawn.x, z.spawn.z, z.spawn.rot, REDUCED_MOTION ? 0.4 : 1.6);
        achievements.onFastTravel();
      });
    });
  }

  // ── Interaction System ──────────────────────────────────────
  const interactPrompt = document.getElementById('interact-prompt');
  const interactName   = document.getElementById('interact-name');
  const mobileBtn      = document.getElementById('mobile-interact-btn');
  let currentInteractable = null;

  function updateInteraction() {
    const cPos = cart.getPosition();
    let nearest = null, nearDist = Infinity;

    buildingMeta.forEach(bm => {
      const d = cPos.distanceTo(bm.position);
      // Every building counts as "approached" for exploration tracking,
      // even the decorative ones without a project modal.
      if (d < 10) achievements.visit(bm.data.label);
      if (!bm.data.project) return;
      if (d < 10 && d < nearDist) { nearDist = d; nearest = bm.data; }
    });

    if (nearest && !modalOpen) {
      interactPrompt.style.display = 'flex';
      interactName.textContent = nearest.label;
      currentInteractable = nearest;
      if (isTouch && mobileBtn) mobileBtn.style.display = 'block';
    } else {
      interactPrompt.style.display = 'none';
      currentInteractable = null;
      if (mobileBtn) mobileBtn.style.display = 'none';
    }
  }

  // Keyboard interact
  window.addEventListener('keydown', e => {
    if (e.code === 'KeyE' && currentInteractable) openProject(currentInteractable);
  });

  // Mobile interact
  if (mobileBtn) {
    mobileBtn.addEventListener('click', () => openProject(currentInteractable));
  }

  // Click-on-building (raycaster)
  const raycaster = new THREE.Raycaster();
  const mouse     = new THREE.Vector2();
  const clickables = [];
  scene.traverse(o => { if (o.isMesh && o.userData.project) clickables.push(o); });
  const metaByProject = {};
  buildingMeta.forEach(bm => { if (bm.data.project) metaByProject[bm.data.project] = bm.data; });

  canvas.addEventListener('click', e => {
    mouse.x =  (e.clientX / innerWidth)  * 2 - 1;
    mouse.y = -(e.clientY / innerHeight) * 2 + 1;
    raycaster.setFromCamera(mouse, camera);
    const hits = raycaster.intersectObjects(clickables);
    if (hits.length && hits[0].object.userData.project) {
      openProject(metaByProject[hits[0].object.userData.project]);
    }
  });

  // ── Minimap ─────────────────────────────────────────────────
  const minimapCanvas = document.getElementById('minimap-canvas');
  let minimap = null;
  if (minimapCanvas) {
    const mCtx = minimapCanvas.getContext('2d');
    const mSize = minimapCanvas.width; // 160
    const mCenter = mSize / 2;
    const mScale = mSize / 150; // world units to px

    minimap = {
      update(cPos, cRot) {
        mCtx.clearRect(0, 0, mSize, mSize);

        // Clip to circle
        mCtx.save();
        mCtx.beginPath();
        mCtx.arc(mCenter, mCenter, mCenter - 1, 0, Math.PI * 2);
        mCtx.clip();

        // Background
        mCtx.fillStyle = 'rgba(15, 25, 15, 0.85)';
        mCtx.fillRect(0, 0, mSize, mSize);

        // Ring road
        mCtx.beginPath();
        mCtx.arc(mCenter, mCenter, RING_R * mScale, 0, Math.PI * 2);
        mCtx.strokeStyle = 'rgba(158, 140, 108, 0.6)';
        mCtx.lineWidth = 3;
        mCtx.stroke();

        // Spoke roads
        mCtx.strokeStyle = 'rgba(158, 140, 108, 0.45)';
        mCtx.lineWidth = 2;
        // N spoke
        mCtx.beginPath(); mCtx.moveTo(mCenter, mCenter); mCtx.lineTo(mCenter, mCenter - 47 * mScale); mCtx.stroke();
        // E spoke
        mCtx.beginPath(); mCtx.moveTo(mCenter, mCenter); mCtx.lineTo(mCenter + 47 * mScale, mCenter); mCtx.stroke();
        // W spoke
        mCtx.beginPath(); mCtx.moveTo(mCenter, mCenter); mCtx.lineTo(mCenter - 47 * mScale, mCenter); mCtx.stroke();
        // S spoke (entry)
        mCtx.beginPath(); mCtx.moveTo(mCenter, mCenter); mCtx.lineTo(mCenter, mCenter + 38 * mScale); mCtx.stroke();

        // Current zone highlight (Phase 3.3)
        const zk = zoneKeyAt(cPos.x, cPos.z);
        mCtx.fillStyle = 'rgba(255, 209, 102, 0.13)';
        // canvas angle: 0 = +x (east), -PI/2 = up (north, -z), +PI/2 = south
        const centre = { north: -Math.PI / 2, east: 0, west: Math.PI, square: Math.PI / 2 }[zk];
        mCtx.beginPath();
        mCtx.moveTo(mCenter, mCenter);
        mCtx.arc(mCenter, mCenter, RING_R * mScale, centre - Math.PI / 4, centre + Math.PI / 4);
        mCtx.closePath();
        mCtx.fill();
        if (zk === 'square') {
          mCtx.beginPath();
          mCtx.arc(mCenter, mCenter, 18 * mScale, 0, Math.PI * 2);
          mCtx.fill();
        }

        // Fountain dot
        mCtx.beginPath();
        mCtx.arc(mCenter, mCenter, 3, 0, Math.PI * 2);
        mCtx.fillStyle = 'rgba(79, 195, 247, 0.7)';
        mCtx.fill();

        // Building dots
        BUILDINGS.forEach(b => {
          const bx = mCenter + b.x * mScale;
          const bz = mCenter - b.z * mScale; // flip z for top-down
          mCtx.fillStyle = b.project ? 'rgba(255, 209, 102, 0.6)' : 'rgba(200, 180, 150, 0.4)';
          mCtx.fillRect(bx - 2, bz - 2, 4, 4);
        });

        // Cart arrow
        const cx = mCenter + cPos.x * mScale;
        const cz = mCenter - cPos.z * mScale;
        mCtx.save();
        mCtx.translate(cx, cz);
        mCtx.rotate(cRot);
        mCtx.beginPath();
        mCtx.moveTo(0, -6);
        mCtx.lineTo(-4, 5);
        mCtx.lineTo(0, 3);
        mCtx.lineTo(4, 5);
        mCtx.closePath();
        mCtx.fillStyle = '#06d6a0';
        mCtx.fill();
        mCtx.restore();

        mCtx.restore(); // unclip
      }
    };
  }

  // ── Controls Overlay ────────────────────────────────────────
  const controlsEl = document.getElementById('controls-overlay');
  if (controlsEl) {
    controlsEl.style.display = 'flex';
    // Touch devices get the joystick/tap card instead of the keyboard one
    controlsEl.querySelectorAll('[data-input]').forEach(el => {
      el.hidden = el.dataset.input !== (isTouch ? 'touch' : 'keyboard');
    });
    let dismissed = false;
    const dismiss = () => {
      if (dismissed) return;
      dismissed = true;
      controlsEl.classList.add('fade-out');
      setTimeout(() => { controlsEl.style.display = 'none'; }, 800);
    };
    setTimeout(dismiss, isTouch ? 6500 : 5000);
    controlsEl.addEventListener('click', dismiss);
    controlsEl.addEventListener('touchstart', dismiss, { passive: true });
    window.addEventListener('keydown', dismiss, { once: true });
  }

  // ── Draw-call monitor (Phase 4.1) — only with ?debug ─────────
  // Logs renderer.info every 5s and warns when over budget.
  const DRAW_CALL_BUDGET = 700;   // measured: ~420 (Square) – ~650 (Main St) incl. shadow pass
  const debugPerf = new URLSearchParams(location.search).has('debug');
  let perfTimer = 0, perfFrames = 0;
  // EffectComposer runs several passes; auto-reset would only report the
  // final full-screen quad, so reset manually at the top of each frame.
  if (debugPerf) renderer.info.autoReset = false;

  // ── Animate Loop ────────────────────────────────────────────
  const clock = new THREE.Clock();

  function animate() {
    requestAnimationFrame(animate);
    const delta   = clock.getDelta();
    const elapsed = clock.getElapsedTime();

    // Cart
    cart.update(delta, colliders);

    // Day/Night cycle
    dayCycle.update(delta);

    // Post-processing sync with day/night
    postFx.setTimeOfDay(dayCycle.isNight());
    postFx.update();

    // Particles
    particleSystem.update(delta, elapsed);
    if (cartDust && cartDust.sys) {
      cartDust.sys.spawnDust(cart.getPosition(), cart.getSpeed(), elapsed);
    }

    // Camera
    followCam.update(cart);

    // Labels
    labelSys.update(canvas.clientWidth, canvas.clientHeight);

    // Interaction
    updateInteraction();

    // Minimap
    if (minimap) minimap.update(cart.getPosition(), cart.getRotation());

    // Animated props
    for (let p of animatedProps) {
      if (p.update) p.update(elapsed);
    }

    // NPCs wave at the cart
    if (npcs.length) updateNpcs(cart.getPosition(), elapsed);

    // Achievements / stats + keep the fast-travel HUD's active pill in sync
    const cPosNow = cart.getPosition();
    const zoneNow = zoneKeyAt(cPosNow.x, cPosNow.z);
    achievements.update(delta, cart, zoneNow, dayCycle.isNight());
    if (zoneHud && zoneNow !== lastZoneKey) {
      lastZoneKey = zoneNow;
      zoneHud.querySelectorAll('[data-zone]').forEach(b => b.classList.toggle('active', b.dataset.zone === zoneNow));
    }

    // Audio system
    audioSys.update(delta, elapsed, cart, dayCycle.isNight());

    // Draw-call monitor (reads last frame's totals, then resets)
    if (debugPerf) {
      perfTimer += delta; perfFrames++;
      if (perfTimer >= 5) {
        const r = renderer.info.render;
        const fps = (perfFrames / perfTimer).toFixed(0);
        const msg = `[town] ${fps}fps · ${r.calls} draw calls · ${r.triangles} tris · tier=${perfTier}`;
        (r.calls > DRAW_CALL_BUDGET ? console.warn : console.log)(msg);
        window._townPerf = { fps: +fps, calls: r.calls, triangles: r.triangles, tier: perfTier };
        perfTimer = 0; perfFrames = 0;
      }
      renderer.info.reset();
    }

    // Existing animated props
    orb.rotation.y   = elapsed * 1.5;
    orb.position.y   = 12 + Math.sin(elapsed * 2) * 0.3;
    orbLight.position.copy(orb.position);
    fireGlow.intensity = 1.6 + Math.sin(elapsed * 3) * 0.4;

    // Water shimmer
    water.rotation.y = elapsed * 0.3;

    // Render through post-processing pipeline
    postFx.render();
  }

  // ── Entry fly-in ────────────────────────────────────────────
  if (gsap) {
    camera.position.set(0, 15, 70);
    gsap.to(camera.position, {
      x: 0, y: 8, z: 42,
      duration: 2.5,
      ease: 'power2.out',
      onUpdate: () => camera.lookAt(0, 2, 0),
    });
  }

  animate();
}

// ════════════════════════════════════════════════════════════════
// EXPOSE TO GLOBAL (used by hero script's "Enter Town" button)
// ════════════════════════════════════════════════════════════════

window.initTownWorld = initTownWorld;
