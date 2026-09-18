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
import { cobbleTexture, plasterTexture, stoneTexture, windowTexture, grassTexture } from './textures.js';
import {
  propMaterials, gableRoofGeometry, buildCityWall, buildClockTower,
  buildTrees, buildBushes, buildWildFlowers, foliageMaterials,
  buildClouds, buildMountains, buildStall,
} from './town-props.js';
import { WIND, attachWind, updateWindMaterials } from './wind.js';
import { buildGrass } from './grass.js';

import * as THREE from 'three';
import { mergeBufferGeometries } from 'https://cdn.jsdelivr.net/npm/three@0.150.0/examples/jsm/utils/BufferGeometryUtils.js';
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
  high: { pixelRatio: 2,   shadowMap: 2048, softShadows: true,  fireflies: 150, fountain: 120, dust: 80, campfire: 40, bloom: true,  bloomScale: 1.0, npcs: true, clouds: 12, crownCards: 96, grass: 22000, flowers: true },
  low:  { pixelRatio: 1.5, shadowMap: 1024, softShadows: false, fireflies: 60,  fountain: 60,  dust: 40, campfire: 24, bloom: true,  bloomScale: 0.5, npcs: true, clouds: 6,  crownCards: 40, grass: 6000,  flowers: false },
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

// Road half-widths (see the road section in initTownWorld): spokes 6, ring 4.5,
// roundabout out to 13. Every building below sits clear of those strips —
// the Observatory and Navigator's Tower used to stand IN the east/west roads.
const ROAD_HALF = 6;

// Tudor buildings (`roof` set, ≤4 roof segs) get cream plaster + dark timber +
// terracotta gable roofs; `color` is the plaster tint. Stone/fantasy
// buildings keep their own colour on a stone-block texture.
const BUILDINGS = [
  // Town Square — entry area (south of roundabout, z > 0)
  { x: -10.5, z: 28, w: 10, h: 7.5, d: 8, color: 0xf3e4c4, roof: 0xc9553d, ridge: 'x',
    chimney: true, label: 'The Tavern', project: null, zone: 'square', tavern: true },
  { x: -10, z: 16, w: 4.5, h: 5.5, d: 4, color: 0xefe0bf, roof: 0xc9553d,
    label: 'Adventurer Stats', project: null, zone: 'square' },
  { x: 10, z: 16, w: 4.5, h: 5.5, d: 4, color: 0xf6ead0, roof: 0xb84a36,
    label: 'Guild Board', project: null, zone: 'square' },

  // North Arm (Main Street)
  { x: -10.5, z: -14, w: 5.5, h: 6, d: 5, color: 0xe9d6ae, roof: 0xa9432f,
    chimney: true, label: 'The Forge', project: 'mavpose', zone: 'north' },
  { x: 10.5, z: -20, w: 5, h: 7.5, d: 4.5, color: 0xf3e6c8, roof: 0xc9553d,
    chimney: true, label: 'Ledger Sanctum', project: 'ledger', zone: 'north' },
  { x: -10.5, z: -36, w: 6, h: 5.5, d: 5, color: 0xf7dcc4, roof: 0xd9694a,
    label: 'Tiny Tots Academy', project: 'tinytots', zone: 'north' },

  // East Arm (Research Quarter)
  { x: 18, z: -12, w: 6, h: 5, d: 6, color: 0x9a9aa8, roof: 0x5a4a5a,
    roofSegs: 8, label: 'Prediction Colosseum', project: 'xg', zone: 'east' },
  { x: 22, z: 12, w: 6, h: 4, d: 6, color: 0xe8dcc8, roof: null,
    label: 'Cloud Citadel', project: 'aws', zone: 'east' },
  { x: 40, z: -12, w: 4.5, h: 10, d: 4.5, color: 0x3f5578, roof: 0x1a2a4a,
    roofSegs: 16, label: 'Vortex Observatory', project: 'vortex', zone: 'east' },

  // West Arm (Services Quarter)
  { x: -20, z: 11, w: 4.5, h: 9, d: 4, color: 0x6a4a9a, roof: 0x6a0dad,
    roofSegs: 6, label: 'Concierge Parlour', project: 'ace', zone: 'west' },
  { x: -18, z: -12, w: 6, h: 4.5, d: 6, color: 0x3fbf9a, roof: null,
    label: 'The Volley Court', project: 'volley', zone: 'west' },
  { x: -40, z: 12, w: 3.5, h: 14, d: 3.5, color: 0x5c6f82, roof: null,
    label: "Navigator's Tower", project: 'instillgcs', zone: 'west' },
];

const isTudorBuilding = (o) => o.roof !== null && o.roof !== undefined && (!o.roofSegs || o.roofSegs === 4);

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
  // Reference-art surfaces (textures are procedural canvases, see textures.js)
  cobble:      new THREE.MeshStandardMaterial({ map: cobbleTexture(), roughness: 0.95 }),
  cobbleWarm:  new THREE.MeshStandardMaterial({ map: cobbleTexture(), color: 0xd9c4a3, roughness: 0.95 }),
  timber:      new THREE.MeshStandardMaterial({ color: 0x4a2c18, roughness: 0.95 }),
  shutter:     new THREE.MeshStandardMaterial({ color: 0x5f7a4c, roughness: 0.9 }),
  door:        new THREE.MeshStandardMaterial({ color: 0x5c3a1e, roughness: 0.9 }),
  stoneBody:   new THREE.MeshStandardMaterial({ map: stoneTexture(), roughness: 0.9 }),
  // One glowing lattice-window material for the whole town (map + emissiveMap)
  windowPane:  new THREE.MeshStandardMaterial({
    map: windowTexture(), emissive: 0xffc06a, emissiveMap: windowTexture(),
    emissiveIntensity: 0.8, roughness: 0.35, metalness: 0.05,
  }),
};
// Plaster material is cached per tint so the 8 Tudor buildings share ~5 materials
const plasterMats = new Map();
function plasterMat(color) {
  if (!plasterMats.has(color)) {
    plasterMats.set(color, new THREE.MeshStandardMaterial({ map: plasterTexture(), color, roughness: 0.9 }));
  }
  return plasterMats.get(color);
}
// Same for stone-textured bodies with a colour tint
const stoneMats = new Map();
function stoneMat(color) {
  if (!stoneMats.has(color)) {
    stoneMats.set(color, new THREE.MeshStandardMaterial({ map: stoneTexture(), color, roughness: 0.9 }));
  }
  return stoneMats.get(color);
}

/** Scale a plane's UVs so a repeating texture tiles at `unit` world units */
function tileUVs(geo, w, h, unit) {
  const uv = geo.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * (w / unit), uv.getY(i) * (h / unit));
  uv.needsUpdate = true;
  return geo;
}

/** Bake a BoxGeometry at a position/rotation for merging */
function placedBox(w, h, d, x, y, z, rotZ = 0, rotY = 0) {
  const g = new THREE.BoxGeometry(w, h, d);
  const m = new THREE.Matrix4().compose(
    new THREE.Vector3(x, y, z),
    new THREE.Quaternion().setFromEuler(new THREE.Euler(0, rotY, rotZ)),
    new THREE.Vector3(1, 1, 1));
  g.applyMatrix4(m);
  return g;
}

// Reference-image bloom palette: pink / red / white / lilac / marigold
const BLOOM_PALETTE = [0xff4d6d, 0xff7b9c, 0xffb3c6, 0xfff1f5, 0xc77dff, 0xffa94d, 0xe63946];

// Wind — every plant samples the shared field in wind.js (Bruno Simon's
// Wind.js pattern). Blooms/foliage are tiny, so yOffset 1 = full sway.
attachWind(SHARED.bloom,   { amplitude: 0.06, yOffset: 1 });
attachWind(SHARED.foliage, { amplitude: 0.05, yOffset: 1 });

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
const flowerBoxSlots = [];   // { x, y, z }
const shutterSlots   = [];   // { x, y, z, rot }

function buildShutters(scene) {
  if (!shutterSlots.length) return;
  const geo = new THREE.BoxGeometry(0.34, 1.1, 0.07);
  const mesh = new THREE.InstancedMesh(geo, SHARED.shutter, shutterSlots.length);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), p = new THREE.Vector3(), s = new THREE.Vector3(1, 1, 1);
  shutterSlots.forEach((sl, i) => {
    p.set(sl.x, sl.y, sl.z);
    q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), sl.rot || 0);
    m.compose(p, q, s);
    mesh.setMatrixAt(i, m);
  });
  mesh.instanceMatrix.needsUpdate = true;
  scene.add(mesh);
}

// Tavern cone lights & ground pools (intensity set by applyEvening)
const coneLightRefs = [];    // ShaderMaterial refs with uIntensity uniform

// NPC / cloud sprite materials (tinted by applyEvening) and sprites (waved by proximity)
const npcMats = [];
const npcs    = [];          // { sprite, idle, wave, phase }

// ════════════════════════════════════════════════════════════════
// HELPER: Build a building mesh group
// ════════════════════════════════════════════════════════════════

function makeBuilding(o) {
  const g = new THREE.Group();
  const tudor = isTudorBuilding(o);
  const M = propMaterials();

  // Storeys drive window rows and timber bands
  const storeys = o.h >= 5.5 ? 2 : 1;
  const storeyH = o.h / storeys;
  const frontZ  = o.d / 2;

  // ── Body ─────────────────────────────────────────────────────
  const bodyMat = tudor ? plasterMat(o.color) : stoneMat(o.color);
  const bodyGeo = new THREE.BoxGeometry(o.w, o.h, o.d);
  tileUVs(bodyGeo, 1, 1, 1);
  const body = new THREE.Mesh(bodyGeo, bodyMat);
  body.position.y = o.h / 2;
  body.castShadow = true;
  body.receiveShadow = true;
  body.userData = { project: o.project, label: o.label };
  g.add(body);

  // ── Roof ─────────────────────────────────────────────────────
  let roofTop = o.h;                       // used for markers / labels / chimney
  if (tudor) {
    // Steep terracotta gable with a 0.7 overhang; ridge along Z by default
    // (front gable), along X for wide buildings like the Tavern.
    const alongX = o.ridge === 'x';
    const span = alongX ? o.d : o.w;       // width across the gable
    const len  = alongX ? o.w : o.d;       // length along the ridge
    const roofH = span * 0.62;
    const roofGeo = gableRoofGeometry(span + 1.4, roofH, len + 1.2);
    // tile UVs: slope length × ridge length in ~1.2-unit tiles
    const uv = roofGeo.attributes.uv;
    const slopeLen = Math.hypot(span / 2 + 0.7, roofH);
    for (let i = 0; i < 8; i++) uv.setXY(i, uv.getX(i) * (len / 1.2), uv.getY(i) * (slopeLen / 1.2));
    uv.needsUpdate = true;
    const roofMat = new THREE.MeshStandardMaterial({ map: M.tile.map, color: o.roof, roughness: 0.8 });
    roofMat.color.lerp(new THREE.Color(0xffffff), 0.7);    // tint the tile texture, don't crush it
    const roof = new THREE.Mesh(roofGeo, [roofMat, plasterMat(o.color)]);
    roof.position.y = o.h - 0.02;
    if (alongX) roof.rotation.y = Math.PI / 2;
    roof.castShadow = true;
    roof.receiveShadow = true;
    g.add(roof);
    roofTop = o.h + roofH;
    o.roofH = roofH;
  } else if (o.roof !== null && o.roof !== undefined) {
    const rMat = new THREE.MeshStandardMaterial({ color: o.roof, roughness: 0.7 });
    const segs = o.roofSegs || 4;
    const roof = new THREE.Mesh(new THREE.ConeGeometry(o.w * 0.78, o.h * 0.5, segs), rMat);
    roof.position.y = o.h + o.h * 0.25;
    roof.rotation.y = Math.PI / 4;
    roof.castShadow = true;
    g.add(roof);
    const trim = new THREE.Mesh(new THREE.BoxGeometry(o.w + 0.4, 0.12, o.d + 0.4), rMat);
    trim.position.y = o.h + 0.05;
    g.add(trim);
    roofTop = o.h + o.h * 0.5;
    o.roofH = o.h * 0.5;
  } else {
    o.roofH = 0;
    // Flat-roofed stone buildings get a parapet
    const parapet = new THREE.Mesh(new THREE.BoxGeometry(o.w + 0.3, 0.5, o.d + 0.3), M.stoneDark);
    parapet.position.y = o.h + 0.15;
    g.add(parapet);
  }

  // ── Windows ──────────────────────────────────────────────────
  // Each window: pane (shared glowing material, merged per building) +
  // timber frame + shutters (merged into the timber geometry below).
  const timberParts = [];
  const paneParts   = [];
  const t = 0.16;                          // timber thickness
  const winW = 0.9, winH = 1.05;

  const windowCols = (row) => {
    // Ground floor keeps the middle clear for the door
    if (o.w >= 8) return row === 0 ? [-o.w * 0.34, -o.w * 0.14, o.w * 0.14, o.w * 0.34] : [-o.w * 0.34, -o.w * 0.12, o.w * 0.12, o.w * 0.34];
    return [-o.w * 0.27, o.w * 0.27];
  };

  const addWindow = (wx, wy, faceZ, sideX) => {
    // faceZ !== undefined → front/back face; else side face at x = sideX
    const onSide = faceZ === undefined;
    const z = onSide ? 0 : faceZ;
    const rotY = onSide ? Math.PI / 2 : 0;
    const pane = new THREE.PlaneGeometry(winW, winH);
    const pm = new THREE.Matrix4().compose(
      new THREE.Vector3(onSide ? sideX : wx, wy, onSide ? wx : z),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(0, onSide ? (sideX > 0 ? Math.PI / 2 : -Math.PI / 2) : (faceZ > 0 ? 0 : Math.PI), 0)),
      new THREE.Vector3(1, 1, 1));
    pane.applyMatrix4(pm);
    paneParts.push(pane);
    if (!tudor) return;
    const px = onSide ? sideX : wx, pz = onSide ? wx : z;
    const out = onSide ? 0 : (faceZ > 0 ? 1 : -1);
    const fr = (w, h, ox, oy) => onSide
      ? placedBox(t, h, w, px + (sideX > 0 ? 0.02 : -0.02), wy + oy, pz + ox)
      : placedBox(w, h, t, px + ox, wy + oy, pz + out * 0.02);
    timberParts.push(fr(winW + 0.3, t, 0, winH / 2 + 0.05));       // head
    timberParts.push(fr(winW + 0.3, t + 0.04, 0, -winH / 2 - 0.05)); // sill
    timberParts.push(fr(t, winH + 0.2, -winW / 2 - 0.05, 0));       // jambs
    timberParts.push(fr(t, winH + 0.2,  winW / 2 + 0.05, 0));
    void rotY;
  };

  for (let row = 0; row < storeys; row++) {
    const wy = row * storeyH + storeyH * (row === 0 ? 0.6 : 0.5);
    windowCols(row).forEach(wx => {
      addWindow(wx, wy, frontZ);
      if (tudor) {
        // shutters (muted green) — merged separately since they're a different colour
        shutterSlots.push({ x: o.x + wx - winW / 2 - 0.34, y: wy, z: o.z + frontZ + 0.05, rot: 0 });
        shutterSlots.push({ x: o.x + wx + winW / 2 + 0.34, y: wy, z: o.z + frontZ + 0.05, rot: 0 });
        // window box under every front window (reference: blooms on every storey)
        flowerBoxSlots.push({ x: o.x + wx, y: wy - winH / 2 - 0.22, z: o.z + frontZ + 0.18 });
      }
      // Warm light spilling from the Tavern's ground-floor windows
      if (o.tavern && row === 0) g.add(createConeLight(wx, wy, frontZ + 0.05, wy + 0.2));
    });
    // Back face windows (no shutters/boxes — rarely seen)
    if (o.w >= 5) windowCols(row).forEach(wx => addWindow(wx, wy, -frontZ));
    // One window per side on the upper storey of bigger buildings
    if (row === storeys - 1 && o.d >= 4.5) {
      addWindow(0, wy, undefined, o.w / 2 + 0.01);
      addWindow(0, wy, undefined, -o.w / 2 - 0.01);
    }
  }

  // ── Timber framing (merged into one mesh) ────────────────────
  if (tudor) {
    const hw = o.w / 2, hd = o.d / 2;
    // corner posts
    [[-hw, -hd], [hw, -hd], [-hw, hd], [hw, hd]].forEach(([x, z]) =>
      timberParts.push(placedBox(t * 1.4, o.h + 0.1, t * 1.4, x, o.h / 2, z)));
    // storey bands (all four faces)
    for (let k = 0; k <= storeys; k++) {
      const y = Math.min(Math.max(k * storeyH, 0.08), o.h - 0.08);
      timberParts.push(placedBox(o.w + 0.1, t, t, 0, y, hd));
      timberParts.push(placedBox(o.w + 0.1, t, t, 0, y, -hd));
      timberParts.push(placedBox(t, t, o.d + 0.1, hw, y, 0));
      timberParts.push(placedBox(t, t, o.d + 0.1, -hw, y, 0));
    }
    // studs + diagonal braces on the front and back faces
    [hd, -hd].forEach(z => {
      const bays = Math.max(2, Math.round(o.w / 1.6));
      const bayW = o.w / bays;
      for (let b = 1; b < bays; b++) {
        const x = -hw + b * bayW;
        timberParts.push(placedBox(t, o.h, t, x, o.h / 2, z));
      }
      // ground-floor braces alternate direction bay by bay (skip the door bay)
      const braceLen = Math.hypot(bayW, storeyH * 0.9);
      const ang = Math.atan2(storeyH * 0.9, bayW);
      for (let b = 0; b < bays; b++) {
        const cx = -hw + (b + 0.5) * bayW;
        if (z > 0 && Math.abs(cx) < bayW) continue;          // door bay
        const dir = b % 2 === 0 ? 1 : -1;
        timberParts.push(placedBox(t * 0.8, braceLen * 0.92, t * 0.8, cx, storeyH * 0.5, z + (z > 0 ? 0.01 : -0.01), dir * (Math.PI / 2 - ang)));
      }
      // gable-end braces (front gable only)
      if (o.ridge !== 'x' && z > 0 && o.roofH) {
        const gh = o.roofH * 0.55;
        timberParts.push(placedBox(t, gh, t, 0, o.h + gh / 2, hd + 0.62));
        timberParts.push(placedBox(t * 0.8, Math.hypot(hw * 0.5, gh) * 0.95, t * 0.8, -hw * 0.25, o.h + gh * 0.5, hd + 0.62, Math.atan2(hw * 0.5, gh)));
        timberParts.push(placedBox(t * 0.8, Math.hypot(hw * 0.5, gh) * 0.95, t * 0.8,  hw * 0.25, o.h + gh * 0.5, hd + 0.62, -Math.atan2(hw * 0.5, gh)));
      }
    });
    // side studs
    [hw, -hw].forEach(x => {
      const bays = Math.max(2, Math.round(o.d / 1.8));
      for (let b = 1; b < bays; b++) {
        timberParts.push(placedBox(t, o.h, t, x, o.h / 2, -hd + b * (o.d / bays)));
      }
    });
  }
  if (timberParts.length) {
    const merged = mergeBufferGeometries(timberParts, false);
    const timber = new THREE.Mesh(merged, SHARED.timber);
    timber.castShadow = true;
    g.add(timber);
  }
  if (paneParts.length) {
    const panes = new THREE.Mesh(mergeBufferGeometries(paneParts, false), SHARED.windowPane);
    g.add(panes);
  }

  // ── Door (arched) ────────────────────────────────────────────
  const doorH = Math.min(2.2, storeyH * 0.7), doorW = 1.1;
  const door = new THREE.Mesh(new THREE.BoxGeometry(doorW, doorH, 0.12), SHARED.door);
  door.position.set(0, doorH / 2, frontZ + 0.04);
  g.add(door);
  const arch = new THREE.Mesh(new THREE.CylinderGeometry(doorW / 2, doorW / 2, 0.12, 16), SHARED.door);
  arch.rotation.x = Math.PI / 2;
  arch.position.set(0, doorH, frontZ + 0.03);
  g.add(arch);
  if (tudor) {
    const frame = mergeBufferGeometries([
      placedBox(t, doorH + 0.1, t, -doorW / 2 - 0.1, (doorH + 0.1) / 2, frontZ + 0.05),
      placedBox(t, doorH + 0.1, t,  doorW / 2 + 0.1, (doorH + 0.1) / 2, frontZ + 0.05),
    ], false);
    g.add(new THREE.Mesh(frame, SHARED.timber));
  }

  // ── Hanging animated sign (Phase 2.5) ────────────────────────
  if (o.label === 'The Tavern' || o.label === 'The Forge') {
    const isTavern = o.label === 'The Tavern';
    const sPivot = new THREE.Group();
    sPivot.position.set(o.w / 2 + 0.1, storeyH * 1.05, frontZ - 0.6);
    const bracket = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.08, 0.08), M.iron);
    bracket.position.set(0.6, 0, 0);
    sPivot.add(bracket);
    const signGroup = new THREE.Group();
    signGroup.position.set(1.0, -0.05, 0);
    const signMesh = new THREE.Mesh(new THREE.BoxGeometry(0.08, 1.0, 0.9),
      new THREE.MeshStandardMaterial({ color: isTavern ? 0x8b1a1a : 0x4a4a4a, roughness: 0.8 }));
    signMesh.position.set(0, -0.55, 0);
    signGroup.add(signMesh);
    sPivot.add(signGroup);
    g.add(sPivot);
    animatedProps.push({ update: (t) => { signGroup.rotation.z = Math.sin(t * 1.5 + o.x) * 0.2; } });
  }

  // ── Chimney ──────────────────────────────────────────────────
  if (o.chimney) {
    const chimH = (o.roofH || o.h * 0.5) * 0.55 + 1.2;
    const cx = o.ridge === 'x' ? o.w * 0.3 : o.w * 0.28;
    const cz = o.ridge === 'x' ? 0 : -o.d * 0.15;
    const chim = new THREE.Mesh(new THREE.BoxGeometry(0.6, chimH, 0.6), M.stoneDark);
    chim.position.set(cx, o.h + (o.roofH || o.h * 0.5) * 0.35 + chimH / 2, cz);
    chim.castShadow = true;
    g.add(chim);
    const cap = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.18, 0.8), M.stoneDark);
    cap.position.set(cx, chim.position.y + chimH / 2 + 0.09, cz);
    g.add(cap);
    o._chimneyTop = { x: o.x + cx, y: chim.position.y + chimH / 2 + 0.3, z: o.z + cz };
  }

  g.position.set(o.x, 0, o.z);

  // ── Phase 3.1: Floating interactive marker ───────────────────
  if (o.project) {
    const marker = new THREE.Mesh(
      new THREE.OctahedronGeometry(0.5, 0),
      new THREE.MeshStandardMaterial({ color: 0xffd166, emissive: 0xffd166, emissiveIntensity: 0.5 }));
    marker.position.y = roofTop + 1.5;
    g.add(marker);
    g.userData.marker = marker;
    animatedProps.push({
      update: (t) => {
        marker.rotation.y = t * 1.5;
        marker.position.y = roofTop + 2 + Math.sin(t * 2.5 + o.x) * 0.3;
      }
    });
  }
  g.userData.body = body;
  o.roofTop = roofTop;
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
  const geo = new THREE.SphereGeometry(220, 32, 16);
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    uniforms: {
      topColor:     { value: new THREE.Color(EVENING.sky.top) },
      horizonColor: { value: new THREE.Color(EVENING.sky.horizon) },
      bottomColor:  { value: new THREE.Color(EVENING.sky.bottom) },
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
// LIGHTING — permanent golden-hour evening
// (the day/night cycle was removed; this is the one look the town has)
// ════════════════════════════════════════════════════════════════

export const EVENING = {
  // Sky dome gradient: dusk blue overhead → peach horizon → pale gold below
  sky:      { top: 0x2e4f93, horizon: 0xf4a970, bottom: 0xffd9ad },
  // Low sun from the south-west so building fronts (+z) catch the light
  sun:      { color: 0xffb46a, intensity: 1.1, position: [-26, 13, 30] },
  ambient:  { color: 0xd6b8c9, intensity: 0.5 },     // soft violet fill in the shadows
  fog:      { color: 0xe9b58f, density: 0.0042 },
  // How "lit up" the town's own lights are (0 = noon, 1 = midnight)
  glow: 0.72,
  // Unlit sprites (NPCs, clouds) get a warm tint instead of shading
  spriteTint: [1.0, 0.9, 0.82],
};

/** Apply the evening preset to every light-driven thing in the world (called once). */
function applyEvening(sun, ambient, skyMat, fog) {
  const E = EVENING;
  skyMat.uniforms.topColor.value.setHex(E.sky.top);
  skyMat.uniforms.horizonColor.value.setHex(E.sky.horizon);
  skyMat.uniforms.bottomColor.value.setHex(E.sky.bottom);

  sun.color.setHex(E.sun.color);
  sun.intensity = E.sun.intensity;
  sun.position.set(...E.sun.position);

  ambient.color.setHex(E.ambient.color);
  ambient.intensity = E.ambient.intensity;

  fog.color.setHex(E.fog.color);
  fog.density = E.fog.density;

  const g = E.glow;
  for (const lamp of lampRefs) {
    lamp.light.intensity = 0.1 + g * 0.9;
    lamp.headMat.emissiveIntensity = 0.1 + g * 0.9;
  }
  for (const mat of windowMats) mat.emissiveIntensity = 0.2 + g * 0.8;
  for (const ref of coneLightRefs) ref.setNightness(g);
  for (const mat of npcMats) mat.color.setRGB(...E.spriteTint);
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
  scene.fog = new THREE.FogExp2(EVENING.fog.color, EVENING.fog.density);
  window._townScene = scene;

  // ── Particle System ─────────────────────────────────────────
  const particleSystem = new ParticleSystem(scene);
  window._particleSystem = particleSystem;

  // ── Camera ──────────────────────────────────────────────────
  const camera = new THREE.PerspectiveCamera(
    60, innerWidth / innerHeight, 0.5, 300
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
    new THREE.PlaneGeometry(320, 320),
    new THREE.MeshStandardMaterial({ map: grassTexture(), color: 0xb9d89a, roughness: 1 })
  );
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);

  // ── Roads (circular layout: roundabout + spokes + ring) ─────
  // Widened to 12 (spokes) / 9 (ring) — the cart is 2 wide, so two carts
  // pass comfortably and the cobbles read as a street, not a footpath.
  const roadMat = SHARED.cobble;
  const SPOKE_W = ROAD_HALF * 2;
  const COBBLE_UNIT = 3;                  // world units per cobble texture tile (small stones)

  function addRoad(x, z, w, h) {
    const geo = tileUVs(new THREE.PlaneGeometry(w, h), w, h, COBBLE_UNIT);
    const r = new THREE.Mesh(geo, roadMat);
    r.rotation.x = -Math.PI / 2;
    r.position.set(x, 0.05, z);
    r.receiveShadow = true;
    scene.add(r);
  }

  // Roundabout (cobbled ring around the fountain)
  const ROUNDABOUT_R = 13;
  const rbGeo = new THREE.RingGeometry(4, ROUNDABOUT_R, 48);
  tileUVs(rbGeo, ROUNDABOUT_R * 2, ROUNDABOUT_R * 2, COBBLE_UNIT);
  const roundabout = new THREE.Mesh(rbGeo, SHARED.cobbleWarm);
  roundabout.rotation.x = -Math.PI / 2;
  roundabout.position.y = 0.07;
  roundabout.receiveShadow = true;
  scene.add(roundabout);

  // South spoke (entry road — town square → south gate)
  addRoad(0, 32, SPOKE_W, 58);
  // Town square plaza (cobbled, warmer tone)
  const plazaGeo = tileUVs(new THREE.PlaneGeometry(30, 20), 30, 20, COBBLE_UNIT);
  const sqPlaza = new THREE.Mesh(plazaGeo, SHARED.cobbleWarm);
  sqPlaza.rotation.x = -Math.PI / 2;
  sqPlaza.position.set(-2, 0.04, 27);
  sqPlaza.receiveShadow = true;
  scene.add(sqPlaza);

  // North spoke runs to the clock tower; East / West run to their gates
  addRoad(0, -27.5, SPOKE_W, 49);
  addRoad(32, 0, 58, SPOKE_W);
  addRoad(-32, 0, 58, SPOKE_W);

  // Ring road (approximated as 24-segment polygon at radius 50)
  const RING_R = 50;
  const RING_W = 9;
  const RING_SEGS = 24;
  for (let i = 0; i < RING_SEGS; i++) {
    const a1 = (i / RING_SEGS) * Math.PI * 2;
    const a2 = ((i + 1) / RING_SEGS) * Math.PI * 2;
    const mx = (Math.sin(a1) + Math.sin(a2)) / 2 * RING_R;
    const mz = (Math.cos(a1) + Math.cos(a2)) / 2 * RING_R;
    const dx = Math.sin(a2) * RING_R - Math.sin(a1) * RING_R;
    const dz = Math.cos(a2) * RING_R - Math.cos(a1) * RING_R;
    const len = Math.sqrt(dx * dx + dz * dz);
    const geo = tileUVs(new THREE.PlaneGeometry(RING_W, len + 1.2), RING_W, len + 1.2, COBBLE_UNIT);
    const seg = new THREE.Mesh(geo, roadMat);
    seg.rotation.x = -Math.PI / 2;
    seg.rotation.z = -Math.atan2(dz, dx) + Math.PI / 2;
    seg.position.set(mx, 0.05, mz);
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
  // (roadside — they used to stand in the middle of each exit)
  const SIGN_X = ROAD_HALF + 1.8;
  addSignboard(SIGN_X, -14, '← Forge · Ledger · TinyTots →', 0);              // north exit
  addSignboard(14, SIGN_X,  '← Colosseum · Vortex · Cloud →', Math.PI / 2);   // east exit
  addSignboard(-14, -SIGN_X, '← Concierge · Nav · Volley →', -Math.PI / 2);   // west exit
  addSignboard(-SIGN_X, 11, '↓ Town Square · Tavern ↓', Math.PI);             // south exit

  // Ring road signposts (beside the spoke-ring intersections)
  addSignboard(SIGN_X, -RING_R + 8, '← West  ·  Roundabout  ·  East →', 0);
  addSignboard(RING_R - 8, -SIGN_X, '← North  ·  Roundabout  ·  South →', Math.PI / 2);
  addSignboard(-RING_R + 8, SIGN_X, '← South  ·  Roundabout  ·  North →', -Math.PI / 2);

  // ── Lighting ────────────────────────────────────────────────
  const ambientLight = new THREE.AmbientLight(EVENING.ambient.color, EVENING.ambient.intensity);
  scene.add(ambientLight);

  const sun = new THREE.DirectionalLight(EVENING.sun.color, EVENING.sun.intensity);
  sun.position.set(...EVENING.sun.position);
  sun.castShadow = true;
  sun.shadow.mapSize.set(PERF.shadowMap, PERF.shadowMap);
  sun.shadow.bias = -0.0008;      // tame acne stripes on the flat roads
  sun.shadow.normalBias = 0.05;
  sun.shadow.camera.far   = 250;
  sun.shadow.camera.left  = -80;
  sun.shadow.camera.right =  80;
  sun.shadow.camera.top   =  80;
  sun.shadow.camera.bottom = -80;
  scene.add(sun);

  // The 2D page's 🌙 theme toggle has no meaning inside the town now that
  // the light is fixed, so hide it while the town is up (sound toggle stays).
  const themeToggleBtn = document.getElementById('theme-toggle');
  if (themeToggleBtn) themeToggleBtn.style.display = 'none';

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

    if (o.chimney && o._chimneyTop) {
      const c = o._chimneyTop;
      particleSystem.createSmoke(new THREE.Vector3(c.x, c.y, c.z));
    }

    // Collider — tight to the walls now that the cart tests its real
    // rotated footprint (the old 0.5 padding + axis-aligned cart box was
    // most of the "crashing into thin air").
    const hw = o.w / 2 + 0.15;
    const hd = o.d / 2 + 0.15;
    colliders.push(new THREE.Box3(
      new THREE.Vector3(o.x - hw, 0, o.z - hd),
      new THREE.Vector3(o.x + hw, o.h + 2, o.z + hd)
    ));
  });
  buildShutters(scene);
  windowMats.push(SHARED.windowPane);

  // ── Town Square fountain ────────────────────────────────────
  const fountainBase = new THREE.Mesh(
    new THREE.CylinderGeometry(2.5, 2.8, 0.6, 16),
    new THREE.MeshStandardMaterial({ color: 0xd4c9b0, roughness: 0.95 })
  );
  fountainBase.position.set(0, 0.3, 0);
  fountainBase.castShadow = true;
  scene.add(fountainBase);

  colliders.push({ circle: true, x: 0, z: 0, r: 3.1 });

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
  orb.position.set(40, 12, -12);   // above the Observatory
  scene.add(orb);
  const orbLight = new THREE.PointLight(0x06d6a0, 1.2, 12);
  orbLight.position.copy(orb.position);
  scene.add(orbLight);

  // ── Tavern terrace & campfire ───────────────────────────────
  // The tavern's front wall is at z = 32; the terrace sits on the plaza in
  // front of it (the old tables/fire/barrels were inside the building).
  const tableMat = new THREE.MeshStandardMaterial({ color: 0x6b4226, roughness: 0.8 });
  const TABLES = [[-8, 35.5], [-13, 35.5], [-16.5, 38.5]];
  const tableTopGeo = new THREE.CylinderGeometry(0.8, 0.8, 0.12, 10);
  const tableLegGeo = new THREE.CylinderGeometry(0.07, 0.07, 0.85, 8);
  const umbrellaGeo = new THREE.ConeGeometry(1.5, 0.7, 10, 1, true);
  const umbrellaPole = new THREE.CylinderGeometry(0.04, 0.04, 2.6, 6);
  TABLES.forEach(([x, z], i) => {
    const top = new THREE.Mesh(tableTopGeo, tableMat);
    top.position.set(x, 0.9, z);
    top.castShadow = true;
    scene.add(top);
    const leg = new THREE.Mesh(tableLegGeo, tableMat);
    leg.position.set(x, 0.45, z);
    scene.add(leg);
    // red café umbrellas like the reference's terrace
    if (i < 2) {
      const pole = new THREE.Mesh(umbrellaPole, propMaterials().iron);
      pole.position.set(x, 1.9, z);
      scene.add(pole);
      const um = new THREE.Mesh(umbrellaGeo, propMaterials().awningRed);
      um.position.set(x, 3.05, z);
      um.castShadow = true;
      scene.add(um);
    }
    colliders.push({ circle: true, x, z, r: 1.0 });
  });

  const CAMPFIRE = { x: -12.5, z: 40 };
  const fireGlow = new THREE.PointLight(0xff6b35, 2, 12);
  fireGlow.position.set(CAMPFIRE.x, 2, CAMPFIRE.z);
  scene.add(fireGlow);
  // stone ring + logs
  const fireRing = new THREE.Mesh(new THREE.TorusGeometry(0.75, 0.16, 6, 12), propMaterials().stoneDark);
  fireRing.rotation.x = -Math.PI / 2;
  fireRing.position.set(CAMPFIRE.x, 0.1, CAMPFIRE.z);
  scene.add(fireRing);
  colliders.push({ circle: true, x: CAMPFIRE.x, z: CAMPFIRE.z, r: 1.1 });

  particleSystem.createCampfire(new THREE.Vector3(CAMPFIRE.x, 0.2, CAMPFIRE.z), PERF.campfire);
  audioSys.attachFire(fireGlow);

  // ── Lamps (circular layout, all set back from the road edges) ──
  const LAMP_X = ROAD_HALF + 1.5;
  const LAMPS = [
    // Roundabout perimeter
    [10.5, 10.5], [-10.5, 10.5], [10.5, -10.5], [-10.5, -10.5],
    // Town Square / entry
    [-LAMP_X, 21], [LAMP_X, 21], [-18, 35], [-LAMP_X, 38], [LAMP_X, 30],
    // North spoke
    [-LAMP_X, -9], [LAMP_X, -15], [-LAMP_X, -28], [LAMP_X, -38],
    // East spoke
    [14, -LAMP_X], [14, LAMP_X], [28, -LAMP_X], [28, LAMP_X], [42, -LAMP_X],
    // West spoke
    [-14, -LAMP_X], [-14, LAMP_X], [-28, -LAMP_X], [-28, LAMP_X], [-42, LAMP_X],
  ];
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    LAMPS.push([Math.sin(a) * (RING_R + 6), Math.cos(a) * (RING_R + 6)]);
  }
  LAMPS.forEach(([x, z]) => { addLamp(scene, x, z); colliders.push({ circle: true, x, z, r: 0.35 }); });

  // ── Trees (leaf-card crowns, one InstancedMesh per species) ──
  // Species by quarter: Town Square green + cherry, Main Street oak,
  // Research Quarter birch, Services green, wilderness a mix.
  const treeScale = (i) => 0.85 + ((i * 7919) % 100) / 100 * 0.55;
  const SUN_DIR = new THREE.Vector3(...EVENING.sun.position).normalize();
  const TREES = [
    // Square
    [16, 20, 'cherry'], [-19.5, 21, 'green'], [17, 35, 'cherry'], [-20, 38, 'green'],
    // Main Street (north) & Research (east) & Services (west) inner
    [17, -25, 'oak'], [-16.5, -23, 'oak'], [16, 12.5, 'green'], [-16, 12.5, 'cherry'],
    [30, 14, 'birch'], [-30, -15, 'green'], [30, -16, 'birch'], [-30, 16, 'green'],
    // Around ring road (inside the wall)
    [58, 10, 'birch'], [58, -10, 'birch'], [-58, 10, 'green'], [-58, -10, 'oak'],
    [12, -58, 'oak'], [-12, -58, 'oak'], [10, 58, 'cherry'], [-10, 58, 'green'],
    [42, 38, 'green'], [-42, 38, 'oak'], [42, -38, 'birch'], [-42, -38, 'green'],
    [38, 42, 'cherry'], [-38, 42, 'green'], [38, -42, 'oak'], [-38, -42, 'oak'],
    // Wilderness beyond the wall
    [70, 25, 'green'], [-70, 25, 'oak'], [70, -30, 'birch'], [-70, -30, 'green'],
    [30, 70, 'green'], [-30, 70, 'cherry'], [30, -70, 'oak'], [-30, -70, 'green'],
    [60, 52, 'oak'], [-60, 52, 'green'], [55, -58, 'green'], [-55, -58, 'oak'],
    [80, 5, 'green'], [-80, -5, 'green'], [5, 82, 'oak'], [-8, -80, 'birch'],
    // Entry approach
    // (kept clear of the ring road: r 45.5–54.5)
    [17, 38.5, 'cherry'], [-24, 52, 'green'], [22, 54, 'green'], [-27, 53, 'cherry'],
  ].map(([x, z, sp], i) => [x, z, treeScale(i), sp]);
  const trees = buildTrees(scene, TREES, { sunDir: SUN_DIR, cards: PERF.crownCards });
  colliders.push(...trees.colliders);

  // ── Rocks ───────────────────────────────────────────────────
  [
    [15, 24], [-19, 24], [25, -16], [-25, -18],
    [10, -30], [-14, -32], [30, 10], [-32, 10],
    [48, -20], [-48, 18], [20, -48], [-18, 48],
    [55, 35], [-55, -40], [38, -55], [-40, 55],
  ].forEach(([x, z]) => scene.add(createRock(x, z, 0.6 + Math.random() * 0.8)));

  // ── City wall, clock tower, sky dressing ────────────────────
  const wall = buildCityWall(scene, { radius: 63, height: 6, gates: ['east', 'west', 'south'] });
  colliders.push(...wall.colliders);

  // Clock tower closes the view down Main Street (reference landmark)
  const clockTower = buildClockTower(scene, 0, -58, { base: 6, height: 22 });
  colliders.push(clockTower.collider);
  windowMats.push(clockTower.faceMat);
  particleSystem.createFireflies(30, { x: 20, y: 6, z: 20 }).position.set(0, 20, -18);

  const clouds = buildClouds(scene, PERF.clouds, { radius: 130, reducedMotion: REDUCED_MOTION });
  npcMats.push(clouds.material);          // tinted like the NPC sprites
  buildMountains(scene, { radius: 112 });

  // ── Phase 2.5: Enhanced Zone Details ──────────────────────────

  // Flower beds (Town Square): wooden planter + small hedge bushes on the
  // foliage system + instanced blooms on top.
  const bedMat = new THREE.MeshStandardMaterial({ color: 0x5c3d2e });
  const bedGeo = new THREE.BoxGeometry(2.4, 0.3, 2.4);
  const BED_SLOTS = [[-14, 11], [14, 11], [14, 27], [-3, 40]];
  BED_SLOTS.forEach(([x, z]) => colliders.push({ circle: true, x, z, r: 1.5 }));
  const BUSHES = [];
  BED_SLOTS.forEach(([x, z]) => {
    const bed = new THREE.Mesh(bedGeo, bedMat);
    bed.position.set(x, 0.15, z);
    scene.add(bed);
    [[-0.55, -0.55], [0.55, -0.55], [-0.55, 0.55], [0.55, 0.55]].forEach(([dx, dz]) =>
      BUSHES.push([x + dx, z + dz, 0.5, 'green']));
  });

  // Phase 2.5: window flower boxes (instanced) + bloom clusters on the beds
  buildFlowerBoxes(scene, flowerBoxSlots, BED_SLOTS);

  // ── Bushes (Bruno: Foliage without a trunk) ─────────────────
  // Beside doors, around the fountain, along the inside of the wall.
  BUSHES.push(
    [-13.3, 19.2, 0.75, 'oak'], [13.3, 19.2, 0.75, 'oak'],          // Stats / Guild Board
    [-16.8, 33.5, 0.8, 'green'], [-5, 33.8, 0.7, 'green'],            // Tavern front corners
    [-14.5, -10.2, 0.7, 'oak'], [14.5, -16.6, 0.7, 'oak'],            // Forge / Ledger
    [-14.8, -32.2, 0.8, 'cherry'], [-6.6, -32.4, 0.6, 'cherry'],      // Tiny Tots
    [25.8, 16.2, 0.7, 'birch'], [18.2, 16.2, 0.7, 'birch'],           // Cloud Citadel
    [-24.5, 14.5, 0.7, 'green'], [-15.5, 14.5, 0.6, 'green'],         // Concierge
    [12.5, 9, 0.55, 'green'], [-12.5, 9, 0.55, 'green'],              // roundabout corners
    [12.5, -9, 0.55, 'green'], [-12.5, -9, 0.55, 'green'],
    [8.2, -54, 0.9, 'oak'], [-8.2, -54, 0.9, 'oak'],                  // clock tower base
  );
  for (let i = 0; i < 14; i++) {                                     // along the wall
    const a = (i / 14) * Math.PI * 2 + 0.15;
    if (Math.abs(Math.sin(a)) < 0.2 || Math.abs(Math.cos(a)) < 0.2) continue;   // keep gates/roads clear
    BUSHES.push([Math.sin(a) * 59.5, Math.cos(a) * 59.5, 0.8 + (i % 3) * 0.15, ['green', 'oak', 'birch'][i % 3]]);
  }
  const bushes = buildBushes(scene, BUSHES, { sunDir: SUN_DIR, cards: PERF.crownCards });
  colliders.push(...bushes.colliders);

  // ── Wild flowers along the ring road & the approach ─────────
  if (PERF.flowers) {
    buildWildFlowers(scene, [
      [8, 46], [-9, 46], [22, 42], [-24, 41], [46, 8], [46, -9], [-46, 9], [-46, -8],
      [9, -44], [-9, -44], [33, 33], [-33, 33], [33, -33], [-33, -33], [18, 55], [-18, 55],
    ]);
  }

  // Phase 2.5: NPC silhouettes near stalls, tavern tables and shopfronts
  if (PERF.npcs) {
    buildNpcs(scene, [
      [-9.5, 19.3, 0], [8.5, 24.5, 1], [-10.5, 37, 2],     // Town Square stalls / tavern terrace
      [-8, 19.5, 1],                                         // by Adventurer Stats
      [-8, -10.5, 0], [8.5, -16.8, 2],                       // Main Street: Forge, Ledger
      [-7.5, -32.5, 2],                                      // outside Tiny Tots
      [19.5, 16.2, 1], [-16.5, 14, 0],                       // Cloud Citadel, Concierge
      [8, 33, 0],                                            // browsing the plaza stall
    ]);
  }

  // Market stalls (Town Square) — curved red-orange awnings, off the road
  [[-9.5, 21.5, Math.PI / 2, false], [9.5, 21.5, -Math.PI / 2, true], [9.5, 31, -Math.PI / 2, false]]
    .forEach(([x, z, r, red]) => colliders.push(buildStall(scene, x, z, r, { red }).collider));

  // Glowing Rune Circles & Floating Books (Research Quarter - East Arm)
  const runeMat = new THREE.MeshStandardMaterial({
    color: 0x06d6a0, emissive: 0x06d6a0, emissiveIntensity: 0.8,
    transparent: true, opacity: 0.6
  });
  const runeRing = new THREE.Mesh(new THREE.TorusGeometry(8, 0.1, 3, 32), runeMat);
  runeRing.rotation.x = -Math.PI/2;
  runeRing.position.set(40, 0.05, -12);
  scene.add(runeRing);
  animatedProps.push({ update: (t) => { runeRing.rotation.z = t * -0.2; }});

  const bookGeo = new THREE.BoxGeometry(0.8, 0.2, 0.6);
  const bookMat = new THREE.MeshStandardMaterial({ color: 0x5e35b1, roughness: 0.4 });
  const books = new THREE.Group();
  books.position.set(40, 3, -12);
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
  [[-8.2, 35.3], [-7.8, 35.7], [-13.1, 35.4], [-16.6, 38.7]].forEach(([x,z]) => {
    const mug = new THREE.Mesh(mugGeo, mugMat);
    mug.position.set(x, 1.05, z);
    scene.add(mug);
  });
  
  const barrelGeo = new THREE.CylinderGeometry(0.4, 0.4, 1.0, 12);
  const barrelMat = new THREE.MeshStandardMaterial({ color: 0x5a4033, roughness: 0.95 });
  [[-17.3, 29.5], [-17.3, 30.6], [-16.4, 30.1]].forEach(([x,z]) => {
    const barrel = new THREE.Mesh(barrelGeo, barrelMat);
    barrel.position.set(x, 0.5, z);
    scene.add(barrel);
  });
  colliders.push({ circle: true, x: -17, z: 30, r: 1.1 });

  // ── Grass on open ground (after every collider exists) ───────
  // Roads, plaza, roundabout, ring road and anything solid are excluded.
  function isOpenGround(x, z) {
    const r = Math.hypot(x, z);
    if (r < ROUNDABOUT_R + 1.5) return false;
    if (Math.abs(r - RING_R) < RING_W / 2 + 1) return false;
    if (Math.abs(x) < ROAD_HALF + 1.2 && z > -54 && z < 62) return false;   // north/south spokes
    if (Math.abs(z) < ROAD_HALF + 1.2 && Math.abs(x) < 62) return false;    // east/west spokes
    if (x > -18 && x < 14 && z > 16 && z < 38) return false;                // plaza
    for (const c of colliders) {
      if (c.isBox3) {
        if (x > c.min.x - 0.6 && x < c.max.x + 0.6 && z > c.min.z - 0.6 && z < c.max.z + 0.6) return false;
      } else if (c.circle) {
        const dx = x - c.x, dz = z - c.z;
        if (dx * dx + dz * dz < (c.r + 0.3) * (c.r + 0.3)) return false;
      }
    }
    return true;
  }
  const grass = PERF.grass > 0
    ? buildGrass(scene, { count: PERF.grass, radius: 61, isOpen: isOpenGround })
    : null;

  // ── Wind: calmer for reduced-motion users, never fully still ──
  if (REDUCED_MOTION) WIND.uniforms.uWindStrength.value = 0.08;
  window._wind = WIND;

  // ── Apply the evening look to everything built above ─────────
  applyEvening(sun, ambientLight, skyData.material, scene.fog);
  window._evening = EVENING;

  // ── Label System ────────────────────────────────────────────
  const labelsContainer = document.getElementById('labels-container');
  const labelSys = new LabelSystem(camera, labelsContainer);
  buildingMeta.forEach(bm => {
    labelSys.add(bm.data.label, new THREE.Vector3(bm.data.x, (bm.data.roofTop || bm.data.h) + 1.2, bm.data.z));
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

        // City wall
        mCtx.beginPath();
        mCtx.arc(mCenter, mCenter, wall.radius * mScale, 0, Math.PI * 2);
        mCtx.strokeStyle = 'rgba(214, 200, 170, 0.55)';
        mCtx.lineWidth = 2.5;
        mCtx.stroke();

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

    // Wind field (shared by leaves, blooms, bushes, grass, flowers)
    WIND.update(delta);
    updateWindMaterials(foliageMaterials(), camera);

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

    // Clouds drift
    clouds.tick(delta);

    // NPCs wave at the cart
    if (npcs.length) updateNpcs(cart.getPosition(), elapsed);

    // Achievements / stats + keep the fast-travel HUD's active pill in sync
    const cPosNow = cart.getPosition();
    const zoneNow = zoneKeyAt(cPosNow.x, cPosNow.z);
    achievements.update(delta, cart, zoneNow);
    if (zoneHud && zoneNow !== lastZoneKey) {
      lastZoneKey = zoneNow;
      zoneHud.querySelectorAll('[data-zone]').forEach(b => b.classList.toggle('active', b.dataset.zone === zoneNow));
    }

    // Audio system
    audioSys.update(delta, elapsed, cart, true);   // evening → crickets on

    // Draw-call monitor (reads last frame's totals, then resets)
    if (debugPerf) {
      perfTimer += delta; perfFrames++;
      if (perfTimer >= 5) {
        const r = renderer.info.render;
        const fps = (perfFrames / perfTimer).toFixed(0);
        const msg = `[town] ${fps}fps · ${r.calls} draw calls · ${r.triangles} tris · tier=${perfTier} · grass=${grass ? grass.count : 0} · wind=${WIND.uniforms.uWindStrength.value}`;
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
