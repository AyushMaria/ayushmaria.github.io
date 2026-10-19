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
import { cobbleTexture, plasterTexture, stoneTexture, windowTexture } from './textures.js';
import {
  propMaterials, gableRoofGeometry, buildPathWall, buildClockTower,
  buildTrees, buildLandingTrees, buildBushes, buildWildFlowers, foliageMaterials,
  buildClouds, buildMountains, buildStall, buildFountain, buildWallLanterns,
  buildTownhouses, buildMillWheel, buildPickleballCourt,
} from './town-props.js';
import { WIND, attachWind, updateWindMaterials } from './wind.js';
import { buildGrass } from './grass.js';
import { buildTempleHall } from './temple.js';
import { mergeStaticChildren } from './merge-static.js';
import { KnockableProps } from './props-physics.js';
import { standardMat, sharedMaterialCount, OCCLUSION_CUT } from './materials.js';
import { buildLayout, ZONE_NAMES, CLOCK_TOWER, WORLD, FAN_SQUARE, NAV_LOOP, zoneKeyAt as layoutZoneKeyAt } from './town-layout.js';
import { buildTerrain, buildWater, buildBridge } from './terrain.js';
import { buildStadium } from './stadium.js';
import { buildFanSquare } from './fan-square.js';
import { buildControlTower, buildDrone, buildWaypointFlag } from './control-tower.js';
import { buildObservatory, buildVortex, buildStreamlines, VORTEX_OFFSET } from './vortex-observatory.js';
import { buildCitadel } from './cloud-citadel.js';
import { buildForgeWing, forgeFlight, HALL } from './drone-forge.js';
import { buildParlour, BOARD as PARLOUR_BOARD } from './concierge-parlour.js';
import { buildCountingHouse } from './counting-house.js';
import { buildTinyTots } from './tiny-tots.js';
import { obb, ellipse, circlePush, footprintDist, colliderIndex } from './colliders.js';

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
  high: { pixelRatio: 2,   shadowMap: 2048, softShadows: true,  terrainRes: 1,   maskRes: 2048, lightPool: 4, fireflies: 150, fountain: 120, dust: 80, campfire: 40, bloom: true,  bloomScale: 1.0, npcs: true, clouds: 12, crownCards: 96, grass: 22000, flowers: true, forest: 1 },
  low:  { pixelRatio: 1.5, shadowMap: 1024, softShadows: false, terrainRes: 1.4, maskRes: 1024, lightPool: 2, fireflies: 60,  fountain: 60,  dust: 40, campfire: 24, bloom: true,  bloomScale: 0.5, npcs: true, clouds: 6,  crownCards: 40, grass: 6000,  flowers: false, forest: 0.6 },
};

// ════════════════════════════════════════════════════════════════
// THE TOWN PLAN — Hilltop Burg (see town-layout.js)
// ════════════════════════════════════════════════════════════════
// Everything about where things are lives in town-layout.js: the hill, the
// switchback High Street, the squares, the river and the stream, the wall,
// the portfolio buildings and the townhouses. buildLayout() is run once at
// boot (initTownWorld) and the result is kept in LAYOUT.

export const animatedProps = [];
let LAYOUT = null;
export let BUILDINGS = [];        // LAYOUT.buildings: plan + heading + floor level + zone

// Zone names are shared with audio.js, the fast-travel HUD, achievements
// and the project modal's contextual header. Spawns come from the layout.
export const ZONES = Object.fromEntries(Object.entries(ZONE_NAMES).map(([k, name]) => [k, { name, spawn: null }]));

/** Which quarter of town a world position is in. */
export const zoneKeyAt = layoutZoneKeyAt;

const isTudorBuilding = (o) => o.roof !== null && o.roof !== undefined && (!o.roofSegs || o.roofSegs === 4);

// ════════════════════════════════════════════════════════════════
// SHARED MATERIALS for Phase 2.5 additions
// (small step toward the planned materials.js registry — every new
//  prop below reuses these instead of allocating per-object materials)
// ════════════════════════════════════════════════════════════════

const SHARED = {
  planterWood: standardMat({ color: 0x5a3a1e, roughness: 0.9 }),
  foliage:     standardMat({ color: 0x3f8f3a, roughness: 0.85 }, 'wind-foliage'),   // wind-patched: own slot
  // vertexColors would be simpler but instanceColor keeps one geometry + one material
  bloom:       standardMat({ color: 0xffffff, roughness: 0.7 }, 'wind-bloom'),      // wind-patched: own slot
  // Reference-art surfaces (textures are procedural canvases, see textures.js)
  cobble:      standardMat({ map: cobbleTexture(), roughness: 0.95 }),
  cobbleWarm:  standardMat({ map: cobbleTexture(), color: 0xd9c4a3, roughness: 0.95 }),
  timber:      standardMat({ color: 0x4a2c18, roughness: 0.95 }),
  shutter:     standardMat({ color: 0x5f7a4c, roughness: 0.9 }),
  door:        standardMat({ color: 0x5c3a1e, roughness: 0.9 }),
  stoneBody:   standardMat({ map: stoneTexture(), roughness: 0.9 }),
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
    plasterMats.set(color, standardMat({ map: plasterTexture(), color, roughness: 0.9 }));
  }
  return plasterMats.get(color);
}
// Same for stone-textured bodies with a colour tint
const stoneMats = new Map();
function stoneMat(color) {
  if (!stoneMats.has(color)) {
    stoneMats.set(color, standardMat({ map: stoneTexture(), color, roughness: 0.9 }));
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

function makeTempleBuilding(o) {
  const g = new THREE.Group();
  const S = o.templeScale || 0.62;
  const hall = buildTempleHall({ plaque: 'CITY HALL', lanterns: true, paperGlow: 0.6 });
  hall.group.scale.setScalar(S);
  // the hall's footprint runs from z −6.4 (back plinth) to +8.2 (front step);
  // shift it so the building's centre is the middle of that footprint
  hall.group.position.z = -0.9 * S;
  hall.group.traverse(m => { if (m.isMesh) m.userData = { project: o.project, label: o.label }; });
  g.add(hall.group);
  // daylight town: lighter, non-metallic tiles read better than the night palette
  hall.materials.tile.color.setHex(0x8b95a4); hall.materials.tile.metalness = 0;
  hall.materials.ridge.color.setHex(0x4d5560);
  // screens + lanterns follow the town's day/night glow like other windows
  windowMats.push(hall.materials.paper, hall.materials.lantern);

  const roofTop = hall.height * S;
  // stone foundation under the platform, for where the crest falls away
  const skirt = new THREE.Mesh(new THREE.BoxGeometry(o.w - 1.6, 3, o.d - 2.6), propMaterials().stoneDark);
  skirt.position.set(0, -1.45, -0.6);
  skirt.receiveShadow = true;
  g.add(skirt);
  g.position.set(o.x, o.y || 0, o.z);
  g.rotation.y = o.heading || 0;
  if (o.project) {
    const marker = new THREE.Mesh(
      new THREE.OctahedronGeometry(0.5, 0),
      standardMat({ color: 0xffd166, emissive: 0xffd166, emissiveIntensity: 0.5 }));
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
  g.userData.body = hall.group.children[0];
  o.roofTop = roofTop;
  o.roofH = roofTop - o.h;
  return g;
}

// The pickleball court: a flat fenced court instead of a building (§2.14)
function makeCourtBuilding(o) {
  const g = new THREE.Group();
  const court = buildPickleballCourt(o, o.project ? { project: o.project, label: o.label } : null);
  g.add(court);
  // stone curb under the apron, for where the riverbank falls away
  const skirt = new THREE.Mesh(new THREE.BoxGeometry(o.w + 0.3, 2.6, o.d + 0.3), propMaterials().stoneDark);
  skirt.position.y = -1.22;
  skirt.receiveShadow = true;
  g.add(skirt);
  const roofTop = 1.4;
  if (o.project) {
    const marker = new THREE.Mesh(
      new THREE.OctahedronGeometry(0.5, 0),
      standardMat({ color: 0xffd166, emissive: 0xffd166, emissiveIntensity: 0.5 }));
    marker.position.y = roofTop + 1.5;
    g.add(marker);
    g.userData.marker = marker;
    animatedProps.push({ update: (t) => {
      marker.rotation.y = t * 1.5;
      marker.position.y = roofTop + 2 + Math.sin(t * 2.5 + o.x) * 0.3;
    } });
  }
  g.position.set(o.x, o.y || 0, o.z);
  g.rotation.y = o.heading || 0;
  g.userData.body = court.children[0];
  o.roofTop = roofTop;
  o.roofH = 0;
  return g;
}

// The Prediction Colosseum: a small football stadium (stadium.js)
function makeStadiumBuilding(o) {
  const g = new THREE.Group();
  const st = buildStadium(o.project ? { project: o.project, label: o.label } : null, { reducedMotion: REDUCED_MOTION, scale: o.stadiumScale || 1 });
  g.add(st.group);
  const skirt = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 2.6, 40), propMaterials().stoneDark);
  skirt.scale.set(o.w / 2 + 0.1, 1, o.d / 2 + 0.1);
  skirt.position.y = -1.25;
  skirt.receiveShadow = true;
  g.add(skirt);
  const roofTop = st.height;
  if (o.project) {
    const marker = new THREE.Mesh(
      new THREE.OctahedronGeometry(0.5, 0),
      standardMat({ color: 0xffd166, emissive: 0xffd166, emissiveIntensity: 0.5 }));
    marker.position.y = roofTop + 1.5;
    g.add(marker);
    g.userData.marker = marker;
  }
  let last;
  animatedProps.push({ update: (t) => {
    const dt = last === undefined ? 0 : Math.min(0.1, t - last);
    last = t;
    st.update(t, dt);
    if (g.userData.marker) {
      g.userData.marker.rotation.y = t * 1.5;
      g.userData.marker.position.y = roofTop + 2 + Math.sin(t * 2.5 + o.x) * 0.3;
    }
  } });
  g.position.set(o.x, o.y || 0, o.z);
  g.rotation.y = o.heading || 0;
  g.userData.body = st.group.children[0];
  // floodlights: one cool-white source for the shared light pool
  const lp = st.light.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), o.heading || 0);
  lightSources.push({ pos: new THREE.Vector3(o.x + lp.x, (o.y || 0) + lp.y, o.z + lp.z), color: new THREE.Color(0xe8eeff), intensity: 1.5, distance: 16 });
  o.roofTop = roofTop;
  o.roofH = 0;
  return g;
}

// Navigator's Tower: an airfield control tower (control-tower.js)
function makeControlTowerBuilding(o) {
  const g = new THREE.Group();
  const tw = buildControlTower(o.project ? { project: o.project, label: o.label } : null, { reducedMotion: REDUCED_MOTION });
  g.add(tw.group);
  // stone footing for where the slope falls away
  const skirt = new THREE.Mesh(new THREE.CylinderGeometry(2.2, 2.3, 2.6, 8), propMaterials().stoneDark);
  skirt.rotation.y = Math.PI / 8;
  skirt.position.y = -1.29;
  skirt.receiveShadow = true;
  g.add(skirt);
  const roofTop = tw.height;
  if (o.project) {
    const marker = new THREE.Mesh(
      new THREE.OctahedronGeometry(0.5, 0),
      standardMat({ color: 0xffd166, emissive: 0xffd166, emissiveIntensity: 0.5 }));
    marker.position.y = roofTop + 1.5;
    g.add(marker);
    g.userData.marker = marker;
  }
  animatedProps.push({ update: (t) => {
    tw.update(t);
    if (g.userData.marker) {
      g.userData.marker.rotation.y = t * 1.5;
      g.userData.marker.position.y = roofTop + 2 + Math.sin(t * 2.5 + o.x) * 0.3;
    }
  } });
  g.position.set(o.x, o.y || 0, o.z);
  g.rotation.y = o.heading || 0;
  g.userData.body = tw.group.children[1];
  o._windsock = tw.windsock.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), o.heading || 0).add(new THREE.Vector3(o.x, 0, o.z));
  // the cab's warm glow for the shared light pool
  const lp = tw.cabLight.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), o.heading || 0);
  lightSources.push({ pos: new THREE.Vector3(o.x + lp.x, (o.y || 0) + lp.y, o.z + lp.z), color: new THREE.Color(0xffb35c), intensity: 1.2, distance: 12 });
  o.roofTop = roofTop;
  o.roofH = roofTop - o.h;
  return g;
}

// The Vortex Observatory: dome + telescope (vortex-observatory.js); the
// vortex itself and the ground streamlines are added in initTownWorld
function makeObservatoryBuilding(o) {
  const g = new THREE.Group();
  const ob = buildObservatory(o.project ? { project: o.project, label: o.label } : null, { reducedMotion: REDUCED_MOTION });
  g.add(ob.group);
  const skirt = new THREE.Mesh(new THREE.CylinderGeometry(2.5, 2.6, 2.6, 28), propMaterials().stoneDark);
  skirt.position.y = -1.29;
  skirt.receiveShadow = true;
  g.add(skirt);
  const roofTop = ob.height;
  if (o.project) {
    const marker = new THREE.Mesh(
      new THREE.OctahedronGeometry(0.5, 0),
      standardMat({ color: 0xffd166, emissive: 0xffd166, emissiveIntensity: 0.5 }));
    marker.position.y = roofTop + 1.5;
    g.add(marker);
    g.userData.marker = marker;
  }
  animatedProps.push({ update: (t) => {
    ob.update(t);
    if (g.userData.marker) {
      g.userData.marker.rotation.y = t * 1.5;
      g.userData.marker.position.y = roofTop + 2 + Math.sin(t * 2.5 + o.x) * 0.3;
    }
  } });
  g.position.set(o.x, o.y || 0, o.z);
  g.rotation.y = o.heading || 0;
  g.userData.body = ob.group.children[0];
  o.roofTop = roofTop;
  o.roofH = roofTop - o.h;
  return g;
}

// The Cloud Citadel: master + worker towers computing a matrix (cloud-citadel.js)
function makeCitadelBuilding(o) {
  const g = new THREE.Group();
  const cz = buildCitadel(o.project ? { project: o.project, label: o.label } : null, { reducedMotion: REDUCED_MOTION });
  g.add(cz.group);
  const skirt = new THREE.Mesh(new THREE.BoxGeometry(o.w - 0.1, 2.6, o.d - 1.1), propMaterials().stoneDark);
  skirt.position.set(0, -1.29, -0.5);
  skirt.receiveShadow = true;
  g.add(skirt);
  const roofTop = cz.height;
  if (o.project) {
    const marker = new THREE.Mesh(
      new THREE.OctahedronGeometry(0.5, 0),
      standardMat({ color: 0xffd166, emissive: 0xffd166, emissiveIntensity: 0.5 }));
    marker.position.y = roofTop + 1.5;
    g.add(marker);
    g.userData.marker = marker;
  }
  animatedProps.push({ update: (t) => {
    cz.update(t);
    if (g.userData.marker) {
      g.userData.marker.rotation.y = t * 1.5;
      g.userData.marker.position.y = roofTop + 2 + Math.sin(t * 2.5 + o.x) * 0.3;
    }
  } });
  g.position.set(o.x, o.y || 0, o.z);
  g.rotation.y = o.heading || 0;
  g.userData.body = cz.group.children[0];
  // the orange beacon for the shared light pool
  const lp = cz.beacon.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), o.heading || 0);
  lightSources.push({ pos: new THREE.Vector3(o.x + lp.x, (o.y || 0) + lp.y, o.z + lp.z), color: new THREE.Color(0xff9a3c), intensity: 1.0, distance: 12 });
  o.roofTop = roofTop;
  o.roofH = roofTop - o.h;
  return g;
}

// The Drone Forge: the usual Tudor hall (chimney and all) plus a workshop
// wing with a landing pad, and a drone that takes off from it (drone-forge.js)
function makeForgeBuilding(o) {
  const parent = new THREE.Group();
  const h = o.heading || 0, hc = Math.cos(h), hs = Math.sin(h), baseY = o.y || 0;
  const toWorld = (v) => new THREE.Vector3(o.x + v.x * hc + v.z * hs, baseY + v.y, o.z - v.x * hs + v.z * hc);
  // the gabled hall: a normal Tudor building on the left half of the plot
  const hall = { ...o, forge: false, noSign: true, w: HALL.w, x: o.x + HALL.cx * hc, z: o.z - HALL.cx * hs };
  const hallGroup = makeBuilding(hall);
  parent.add(hallGroup);
  // the workshop wing, in the whole building's frame
  const wing = buildForgeWing(o.project ? { project: o.project, label: o.label } : null, { reducedMotion: REDUCED_MOTION });
  wing.group.position.set(o.x, baseY, o.z);
  wing.group.rotation.y = h;
  parent.add(wing.group);
  // the pad drone
  const drone = buildDrone(null, { path: forgeFlight(toWorld, h), scale: 1.3, reducedMotion: REDUCED_MOTION });
  parent.add(drone.group);
  animatedProps.push({ update: (t) => { wing.update(t); drone.update(t); } });
  // warm glow from the open doors
  lightSources.push({ pos: toWorld(wing.glow), color: new THREE.Color(0xff8a3a), intensity: 1.0, distance: 10 });
  // easel and crates stand just outside the plot
  o._extraColliders = [[5.1, 1.4, 0.55], [4.8, -0.95, 0.75]].map(([x, z, r]) => { const w = toWorld(new THREE.Vector3(x, 0, z)); return { circle: true, x: w.x, z: w.z, r }; });
  parent.userData.marker = hallGroup.userData.marker;
  parent.userData.body = hallGroup.userData.body;
  o.roofTop = hall.roofTop;
  o.roofH = hall.roofH;
  o._chimneyTop = hall._chimneyTop;
  window._forgeDrone = drone;
  return parent;
}

// Ace's Concierge Parlour: octagonal pavilion, chat-bubble lantern (concierge-parlour.js)
function makeParlourBuilding(o) {
  const g = new THREE.Group();
  const pl = buildParlour(o.project ? { project: o.project, label: o.label } : null, { reducedMotion: REDUCED_MOTION });
  g.add(pl.group);
  const skirt = new THREE.Mesh(new THREE.CylinderGeometry(3.05, 3.15, 2.6, 8), propMaterials().stoneDark);
  skirt.rotation.y = Math.PI / 8;
  skirt.position.y = -1.29;
  skirt.receiveShadow = true;
  g.add(skirt);
  const roofTop = pl.height;
  if (o.project) {
    const marker = new THREE.Mesh(
      new THREE.OctahedronGeometry(0.5, 0),
      standardMat({ color: 0xffd166, emissive: 0xffd166, emissiveIntensity: 0.5 }));
    marker.position.y = roofTop + 1.5;
    g.add(marker);
    g.userData.marker = marker;
  }
  animatedProps.push({ update: (t) => {
    pl.update(t);
    if (g.userData.marker) {
      g.userData.marker.rotation.y = t * 1.5;
      g.userData.marker.position.y = roofTop + 2 + Math.sin(t * 2.5 + o.x) * 0.3;
    }
  } });
  const h = o.heading || 0, hc = Math.cos(h), hs = Math.sin(h);
  g.position.set(o.x, o.y || 0, o.z);
  g.rotation.y = h;
  g.userData.body = pl.group.children[0];
  // the bubble lantern glows down the street
  lightSources.push({ pos: new THREE.Vector3(o.x, (o.y || 0) + pl.lantern.y, o.z), color: new THREE.Color(0xc8ffd8), intensity: 0.9, distance: 12 });
  // the booking board stands just outside the plot
  o._extraColliders = [{ circle: true, x: o.x + PARLOUR_BOARD.x * hc + PARLOUR_BOARD.z * hs, z: o.z - PARLOUR_BOARD.x * hs + PARLOUR_BOARD.z * hc, r: 0.85 }];
  o.roofTop = roofTop;
  o.roofH = roofTop - o.h;
  return g;
}

// The Tally Bridge Counting House: vault + counting room + skybridge (counting-house.js)
function makeCountingHouseBuilding(o) {
  const g = new THREE.Group();
  const ch = buildCountingHouse(o.project ? { project: o.project, label: o.label } : null, { reducedMotion: REDUCED_MOTION });
  g.add(ch.group);
  const skirt = new THREE.Mesh(new THREE.BoxGeometry(o.w - 0.2, 2.6, o.d - 0.6), propMaterials().stoneDark);
  skirt.position.y = -1.29;
  skirt.receiveShadow = true;
  g.add(skirt);
  const roofTop = ch.height;
  if (o.project) {
    const marker = new THREE.Mesh(
      new THREE.OctahedronGeometry(0.5, 0),
      standardMat({ color: 0xffd166, emissive: 0xffd166, emissiveIntensity: 0.5 }));
    marker.position.y = roofTop + 1.5;
    g.add(marker);
    g.userData.marker = marker;
  }
  animatedProps.push({ update: (t) => {
    ch.update(t);
    if (g.userData.marker) {
      g.userData.marker.rotation.y = t * 1.5;
      g.userData.marker.position.y = roofTop + 2 + Math.sin(t * 2.5 + o.x) * 0.3;
    }
  } });
  const h = o.heading || 0;
  g.position.set(o.x, o.y || 0, o.z);
  g.rotation.y = h;
  g.userData.body = ch.group.children[0];
  // the counting room's gold glow
  const lp = ch.glow.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), h);
  lightSources.push({ pos: new THREE.Vector3(o.x + lp.x, (o.y || 0) + lp.y, o.z + lp.z), color: new THREE.Color(0xffc25a), intensity: 1.0, distance: 11 });
  o.roofTop = roofTop;
  o.roofH = roofTop - o.h;
  return g;
}

// Tiny Tots Academy: storybook schoolhouse + playground (tiny-tots.js)
function makeSchoolBuilding(o) {
  const g = new THREE.Group();
  const tt = buildTinyTots(o.project ? { project: o.project, label: o.label } : null, { reducedMotion: REDUCED_MOTION });
  g.add(tt.group);
  const skirt = new THREE.Mesh(new THREE.BoxGeometry(o.w - 0.1, 2.8, o.d - 0.3), propMaterials().stoneDark);
  skirt.position.y = -1.42;
  skirt.receiveShadow = true;
  g.add(skirt);
  const roofTop = tt.height;
  if (o.project) {
    const marker = new THREE.Mesh(
      new THREE.OctahedronGeometry(0.5, 0),
      standardMat({ color: 0xffd166, emissive: 0xffd166, emissiveIntensity: 0.5 }));
    marker.position.set(2.75, roofTop + 1.5, 0);
    g.add(marker);
    g.userData.marker = marker;
  }
  const local = new THREE.Vector3();
  animatedProps.push({ update: (t) => {
    const cart = window._cart;
    tt.update(t, cart ? g.worldToLocal(local.copy(cart.position)) : null);
    if (g.userData.marker) {
      g.userData.marker.rotation.y = t * 1.5;
      g.userData.marker.position.y = roofTop + 2 + Math.sin(t * 2.5 + o.x) * 0.3;
    }
  } });
  const h = o.heading || 0;
  g.position.set(o.x, o.y || 0, o.z);
  g.rotation.y = h;
  g.updateMatrixWorld(true);
  g.userData.body = tt.group.children[0];
  const lp = tt.glow.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), h);
  lightSources.push({ pos: new THREE.Vector3(o.x + lp.x, (o.y || 0) + lp.y, o.z + lp.z), color: new THREE.Color(0xffc27a), intensity: 0.8, distance: 10 });
  o.roofTop = roofTop;
  o.roofH = roofTop - o.h;
  return g;
}

function makeBuilding(o) {
  if (o.temple) return makeTempleBuilding(o);
  if (o.schoolhouse) return makeSchoolBuilding(o);
  if (o.countingHouse) return makeCountingHouseBuilding(o);
  if (o.parlour) return makeParlourBuilding(o);
  if (o.forge) return makeForgeBuilding(o);
  if (o.citadel) return makeCitadelBuilding(o);
  if (o.observatory) return makeObservatoryBuilding(o);
  if (o.controlTower) return makeControlTowerBuilding(o);
  if (o.court) return makeCourtBuilding(o);
  if (o.stadium) return makeStadiumBuilding(o);
  const g = new THREE.Group();
  const tudor = isTudorBuilding(o);
  const M = propMaterials();
  // building-local → world (local x = right, local z = front; see town-layout.js)
  const hc = Math.cos(o.heading || 0), hs = Math.sin(o.heading || 0), baseY = o.y || 0;
  const toWorld = (lx, ly, lz) => ({ x: o.x + lx * hc + lz * hs, y: baseY + ly, z: o.z - lx * hs + lz * hc });

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
    // tint the tile texture toward white so it isn't crushed (shared per tint)
    const roofMat = standardMat({ map: M.tile.map, color: new THREE.Color(o.roof).lerp(new THREE.Color(0xffffff), 0.7), roughness: 0.8 });
    const roof = new THREE.Mesh(roofGeo, [roofMat, plasterMat(o.color)]);
    roof.position.y = o.h - 0.02;
    if (alongX) roof.rotation.y = Math.PI / 2;
    roof.castShadow = true;
    roof.receiveShadow = true;
    g.add(roof);
    roofTop = o.h + roofH;
    o.roofH = roofH;
  } else if (o.roof !== null && o.roof !== undefined) {
    const rMat = standardMat({ color: o.roof, roughness: 0.7 });
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
        shutterSlots.push({ ...toWorld(wx - winW / 2 - 0.34, wy, frontZ + 0.05), rot: o.heading || 0 });
        shutterSlots.push({ ...toWorld(wx + winW / 2 + 0.34, wy, frontZ + 0.05), rot: o.heading || 0 });
        // window box under every front window (reference: blooms on every storey)
        flowerBoxSlots.push({ ...toWorld(wx, wy - winH / 2 - 0.22, frontZ + 0.18), rot: o.heading || 0 });
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
  // Bracketed lantern above the door (instanced town-wide, see buildWallLanterns)
  wallLanternSlots.push({ ...toWorld(0, doorH + 1.05, frontZ), rot: o.heading || 0 });
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
  if ((o.label === 'The Tavern' || o.label === 'The Forge') && !o.noSign) {
    const isTavern = o.label === 'The Tavern';
    const sPivot = new THREE.Group();
    sPivot.position.set(o.w / 2 + 0.1, storeyH * 1.05, frontZ - 0.6);
    const bracket = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.08, 0.08), M.iron);
    bracket.position.set(0.6, 0, 0);
    sPivot.add(bracket);
    const signGroup = new THREE.Group();
    signGroup.position.set(1.0, -0.05, 0);
    const signMesh = new THREE.Mesh(new THREE.BoxGeometry(0.08, 1.0, 0.9),
      standardMat({ color: isTavern ? 0x8b1a1a : 0x4a4a4a, roughness: 0.8 }));
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
    o._chimneyTop = toWorld(cx, chim.position.y + chimH / 2 + 0.3, cz);
  }

  // Stone foundation: the pad is cut level into the slope, so on the downhill
  // side the ground falls away below the floor
  const skirt = new THREE.Mesh(new THREE.BoxGeometry(o.w + 0.3, 2.8, o.d + 0.3), M.stoneDark);
  skirt.position.y = -1.15;
  skirt.receiveShadow = true;
  g.add(skirt);

  // Bake static parts that share a material into one mesh each (§4.1):
  // walls + gable ends, roof + trim, timber + door frame, door + arch,
  // chimney + cap… Every merged part opens the project when clicked.
  const merged = mergeStaticChildren(g, { userData: o.project ? { project: o.project, label: o.label } : null });
  const bodyMesh = body.parent ? body : (merged.find(m => m.material === bodyMat) || body);

  g.position.set(o.x, baseY, o.z);
  g.rotation.y = o.heading || 0;

  // ── Phase 3.1: Floating interactive marker ───────────────────
  if (o.project) {
    const marker = new THREE.Mesh(
      new THREE.OctahedronGeometry(0.5, 0),
      standardMat({ color: 0xffd166, emissive: 0xffd166, emissiveIntensity: 0.5 }));
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
  g.userData.body = bodyMesh;
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
 * Also draws the bloom clusters on the flower beds (crest square, terrace).
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

  const place = (mesh, i, x, y, z, sc, rot, yaw = 0) => {
    q.setFromEuler(new THREE.Euler(rot ? Math.random() : 0, rot ? Math.random() * Math.PI : yaw, 0));
    s.set(sc.x, sc.y, sc.z);
    p.set(x, y, z);
    m.compose(p, q, s);
    mesh.setMatrixAt(i, m);
  };

  slots.forEach((sl, i) => {
    // local x along the wall, local z out from it (rotated by the building's heading)
    const rc = Math.cos(sl.rot || 0), rs = Math.sin(sl.rot || 0);
    const at = (lx, lz) => [sl.x + lx * rc + lz * rs, sl.z - lx * rs + lz * rc];
    place(planters, i, sl.x, sl.y, sl.z, { x: 1, y: 1, z: 1 }, false, sl.rot || 0);
    for (let k = 0; k < FOLIAGE_PER_BOX; k++) {
      const [fx, fz] = at((k - 1) * 0.24, (Math.random() - 0.5) * 0.08);
      place(foliage, fi++, fx, sl.y + 0.16, fz, { x: 1, y: 0.75, z: 0.9 }, true);
    }
    for (let k = 0; k < BLOOM_PER_BOX; k++) {
      const [bx, bz] = at(-0.32 + (k / (BLOOM_PER_BOX - 1)) * 0.64 + (Math.random() - 0.5) * 0.06, (Math.random() - 0.5) * 0.14 + 0.04);
      const by = sl.y + 0.22 + Math.random() * 0.12;
      place(blooms, bi, bx, by, bz, { x: 1, y: 1, z: 1 }, true);
      col.setHex(BLOOM_PALETTE[(i * 3 + k) % BLOOM_PALETTE.length]);
      blooms.setColorAt(bi++, col);
    }
  });

  bedSlots.forEach(([x, z, y = 0], i) => {
    for (let k = 0; k < 4; k++) {
      place(foliage, fi++, x + (Math.random() - 0.5) * 1.5, y + 0.55, z + (Math.random() - 0.5) * 1.5,
        { x: 1.4, y: 0.9, z: 1.4 }, true);
    }
    for (let k = 0; k < BLOOM_PER_BED; k++) {
      place(blooms, bi, x + (Math.random() - 0.5) * 1.7, y + 0.62 + Math.random() * 0.15,
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

  placements.forEach(([x, z, variant, gy = 0], i) => {
    const f = frames[variant % 3];
    const h = variant === 2 ? 1.5 : 1.9;
    const sprite = new THREE.Sprite(f.idle);
    sprite.scale.set(h * 0.5, h, 1);
    sprite.position.set(x, gy + h / 2, z);
    scene.add(sprite);
    npcs.push({ sprite, idle: f.idle, wave: f.wave, baseY: gy + h / 2, phase: i * 1.7, waving: false });
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

// Tracked collections for the evening glow level (applyEvening)
const lampRefs = [];      // { headMat, source, x, z }
const windowMats = [];    // MeshStandardMaterial refs
let terrainRef = null;    // terrain (draws the lamplight pools on the ground)
const wallLanternSlots = [];   // filled by makeBuilding, built once all buildings exist

// ── Light pool (task.md §4.1 — point-light budget) ──────────────────
// three.js compiles every lit material for the number of lights in the
// scene and shades every pixel against all of them, so the old 27 lamp
// PointLights + orb cost ~30 light loops per pixel whether or not they
// were on screen. Now lamps (and the Observatory's vortex) are just *light
// sources*: each keeps its emissive head and a cheap additive ground pool,
// and a small fixed pool of PointLights (4 high tier / 2 low) follows the
// sources nearest the camera focus. The light count never changes, so no
// shader recompiles; the farthest pooled light fades to zero just as the
// next-nearest source catches up with it, so hand-overs are invisible.
const lightSources = [];  // { pos: Vector3, color: Color, intensity, distance }

function createLightPool(scene, size) {
  const lights = [];
  for (let i = 0; i < size; i++) {
    const l = new THREE.PointLight(0xffd166, 0, 8);
    scene.add(l);
    lights.push(l);
  }
  const order = [];
  const FADE = 4;          // world units: how early the last pooled light starts fading
  return {
    lights,
    update(focus) {
      order.length = 0;
      for (const s of lightSources) {
        s._d = Math.hypot(s.pos.x - focus.x, s.pos.z - focus.z);
        order.push(s);
      }
      order.sort((a, b) => a._d - b._d);
      const cutoff = order.length > size ? order[size]._d : Infinity;
      for (let i = 0; i < size; i++) {
        const l = lights[i], s = order[i];
        if (!s) { l.intensity = 0; continue; }
        const f = Math.min(1, Math.max(0, (cutoff - s._d) / FADE));
        l.position.copy(s.pos);
        l.color.copy(s.color);
        l.distance = s.distance;
        l.intensity = s.intensity * f * f * (3 - 2 * f);   // smoothstep fade
      }
    },
  };
}

// Shared lamp materials (one program, no per-lamp material copies)
let _lampMats = null;
function lampMaterials() {
  if (_lampMats) return _lampMats;
  _lampMats = {
    pole: standardMat({ color: 0x3e2518, roughness: 0.9 }),
    glow: new THREE.MeshStandardMaterial({ color: 0xffd166, emissive: 0xffd166, emissiveIntensity: 0.6 }),
  };
  return _lampMats;
}
const LAMP_COLOR = new THREE.Color(0xffd166);

// All lamps live in one group so their poles and heads merge into two
// meshes town-wide (mergeStaticChildren after the last lamp is placed).
let lampField = null;
function addLamp(scene, x, z, y = 0) {
  const { pole: poleMat, glow: glowMat } = lampMaterials();
  if (!lampField) { lampField = new THREE.Group(); lampField.name = 'lamps'; scene.add(lampField); }
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.07, 3.5, 8), poleMat);
  pole.position.set(x, y + 1.75, z);
  pole.castShadow = true;
  lampField.add(pole);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.16, 8, 8), glowMat);
  head.position.set(x, y + 3.6, z);
  head.castShadow = true;
  lampField.add(head);
  // No PointLight of its own: the light pool lends one when the lamp is near.
  const source = { pos: new THREE.Vector3(x, y + 3.6, z), color: LAMP_COLOR, intensity: 0.7, distance: 8 };
  lightSources.push(source);
  lampRefs.push({ headMat: glowMat, source, x, y, z });
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
  // focus: the ground point the camera is centred on; camDist: camera distance.
  // Labels fade by how far they are from what you're looking at (not from the
  // camera, which now sits ~50 units away with a narrow lens) and scale with zoom.
  update(w, h, focus = null, camDist = 50) {
    const s = Math.max(0.5, Math.min(1.2, 0.7 * 50 / camDist));
    this.labels.forEach(l => {
      const p = l.position.clone().project(this.camera);
      if (p.z > 1) { l.div.style.display = 'none'; return; }
      const x = (p.x * 0.5 + 0.5) * w;
      const y = (-(p.y * 0.5) + 0.5) * h;
      const dist = focus ? Math.hypot(l.position.x - focus.x, l.position.z - focus.z)
                         : l.position.distanceTo(this.camera.position) - 25;
      const scale = s;
      const opacity = dist > 48 ? 0 : dist > 32 ? (48 - dist) / 16 : 1;
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

  // Track ONE finger by identifier so a second finger on the interact
  // button (or a stray palm) never yanks the stick.
  let touchId = null;
  let origin = null;   // where this finger first landed → the stick centre

  const findTouch = (list) => {
    for (let i = 0; i < list.length; i++) if (list[i].identifier === touchId) return list[i];
    return null;
  };

  function applyTouch(touch) {
    const rect = base.getBoundingClientRect();
    const md = rect.width / 2 - 12;                 // full deflection at the rim
    let dx = touch.clientX - origin.x;
    let dy = touch.clientY - origin.y;
    const dist = Math.hypot(dx, dy);
    if (dist > md) { dx = dx / dist * md; dy = dy / dist * md; }
    handle.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
    cart.setJoystickInput(dx / md, dy / md);
  }

  base.addEventListener('touchstart', e => {
    e.preventDefault();
    if (touchId !== null) return;
    const t = e.changedTouches[0];
    touchId = t.identifier;
    // Relative stick: the centre is where the thumb lands, so the first
    // movement is a small nudge instead of a jump to the rim.
    const rect = base.getBoundingClientRect();
    const cx = rect.left + rect.width / 2, cy = rect.top + rect.height / 2;
    const md = rect.width / 2 - 12;
    const off = Math.hypot(t.clientX - cx, t.clientY - cy);
    origin = off < md * 0.5 ? { x: cx, y: cy } : { x: t.clientX, y: t.clientY };
    applyTouch(t);
  }, { passive: false });

  base.addEventListener('touchmove', e => {
    e.preventDefault();
    const t = findTouch(e.touches);
    if (t) applyTouch(t);
  }, { passive: false });

  const release = e => {
    if (touchId === null || !findTouch(e.changedTouches)) return;
    e.preventDefault();
    touchId = null; origin = null;
    handle.style.transform = 'translate(-50%, -50%)';
    cart.setJoystickInput(0, 0);
  };
  base.addEventListener('touchend', release, { passive: false });
  base.addEventListener('touchcancel', release, { passive: false });
  // Finger slid off the base: keep steering until it lifts anywhere
  window.addEventListener('touchmove', e => { const t = findTouch(e.touches); if (t && touchId !== null) applyTouch(t); }, { passive: true });
  window.addEventListener('touchend', release, { passive: false });
  window.addEventListener('touchcancel', release, { passive: false });
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
  const lampLevel = 0.1 + g * 0.9;
  for (const lamp of lampRefs) {
    lamp.source.intensity = lampLevel;          // strength of the pooled PointLight when this lamp is near
    lamp.headMat.emissiveIntensity = lampLevel;
  }
  if (terrainRef) terrainRef.setLampLevel(0.32 * lampLevel);
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

  // ── The town plan (town-layout.js) ──────────────────────────
  // Hilltop Burg: the hill, the switchback High Street, squares, river,
  // stream, wall, buildings and townhouses — worked out once here.
  LAYOUT = buildLayout({ res: PERF.terrainRes });
  BUILDINGS = LAYOUT.buildings;
  window._layout = LAYOUT;
  const heightAt = LAYOUT.heightAt;      // ground, or the bridge deck: wheels, feet, props
  const groundAt = LAYOUT.groundAt;      // the terrain itself
  for (const [k, sp] of Object.entries(LAYOUT.spawns)) if (ZONES[k]) ZONES[k].spawn = sp;

  // ── Terrain: the hill with the streets painted on, water, bridge ──
  const terrain = buildTerrain(scene, LAYOUT, { maskRes: PERF.maskRes });
  terrainRef = terrain;
  window._terrain = terrain;
  const waterSys = buildWater(scene, LAYOUT, { heightAt: groundAt });
  const bridge = buildBridge(scene, LAYOUT);
  const BRIDGE = LAYOUT.bridge;
  const roadMat = SHARED.cobble;

  // ── Signboards ──────────────────────────────────────────────
  function addSignboard(x, z, text, rotY = 0) {
    const g = new THREE.Group();
    // Pole
    const pole = new THREE.Mesh(
      new THREE.CylinderGeometry(0.08, 0.08, 2.8, 8),
      standardMat({ color: 0x5a3a1a, roughness: 0.9 })
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
    cx.fillText(text, 128, 32, 244);
    const tex = new THREE.CanvasTexture(cv);
    const sign = new THREE.Mesh(
      new THREE.BoxGeometry(2.2, 0.55, 0.1),
      [roadMat, roadMat, roadMat, roadMat, standardMat({ map: tex }), standardMat({ map: tex })]
    );
    sign.position.y = 3.0;
    sign.castShadow = true;
    g.add(sign);
    mergeStaticChildren(g);           // 6-material board → board edges + two faces (§4.1)
    g.position.set(x, groundAt(x, z), z);
    g.rotation.y = rotY;
    scene.add(g);
  }
  // Beside a road at arc length s (tries both sides and a little either way
  // for a spot clear of houses and lamps); the board faces along the road.
  function signAt(key, s, text, side = 1) {
    const r = LAYOUT.road(key);
    for (const ds of [0, 2, -2, 4, -4]) for (const sd of [side, -side]) {
      const p = r.path.pts[Math.max(0, Math.min(r.path.pts.length - 1, Math.round(s + ds)))];
      const o = r.hw + 1.3, x = p.x - p.tz * sd * o, z = p.z + p.tx * sd * o;
      if (!LAYOUT.freeGround(x, z, 0.2)) continue;
      addSignboard(x, z, text, Math.atan2(p.tx, p.tz));
      return;
    }
  }
  const streetS = LAYOUT.streetS;
  signAt('street', streetS(14.2, 54.4) - 1.5, '→ Colosseum · Pickleball', -1);
  signAt('street', streetS(13.1, 50.5) + 3, '← Market Terrace · Crest');
  signAt('street', streetS(32, 15) - 3, '→ The Forge', -1);
  signAt('street', streetS(-26, -14) + 3, '← Navigator · Tiny Tots');
  signAt('street', streetS(-8, -26) - 5, '↑ City Hall · Observatory');

  // ── Lighting ────────────────────────────────────────────────
  const ambientLight = new THREE.AmbientLight(EVENING.ambient.color, EVENING.ambient.intensity);
  scene.add(ambientLight);

  const sun = new THREE.DirectionalLight(EVENING.sun.color, EVENING.sun.intensity);
  sun.position.set(...EVENING.sun.position);
  sun.castShadow = true;
  sun.shadow.mapSize.set(PERF.shadowMap, PERF.shadowMap);
  sun.shadow.bias = -0.0008;      // tame acne stripes on the flat roads
  sun.shadow.normalBias = 0.05;
  sun.shadow.camera.near  = 1;
  sun.shadow.camera.far   = 320;
  sun.shadow.camera.left  = -80;    // replaced every frame by fitShadowToView()
  sun.shadow.camera.right =  80;
  sun.shadow.camera.top   =  80;
  sun.shadow.camera.bottom = -80;
  scene.add(sun, sun.target);

  // ── Shadow camera follows the view (task.md §2.2) ──────────
  // The shadow map used to cover the whole 160×160 town, so most of its
  // texels were spent on ground nobody was looking at. Now the light's
  // orthographic box is fitted every frame to the patch of ground the
  // camera actually sees (its four corner rays hit y = 0), in light space,
  // plus a margin. A caster outside that patch whose shadow lands inside it
  // shares the patch's light-space x/y, so it's still inside the box.
  // The box size is quantised (no resizing every frame) and its centre is
  // snapped to whole shadow-map texels so shadows don't shimmer as you drive.
  const SUN_FROM = new THREE.Vector3(...EVENING.sun.position).normalize();   // toward the sun
  const SUN_DIST = 160;
  const lsZ = SUN_FROM.clone();                                               // light camera basis (as lookAt builds it)
  const lsX = new THREE.Vector3(0, 1, 0).cross(lsZ).normalize();
  const lsY = lsZ.clone().cross(lsX).normalize();
  const _ray = new THREE.Vector3(), _hit = new THREE.Vector3(), _ctr = new THREE.Vector3();
  const _ndc = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
  let shadowHalf = { x: 0, y: 0 };
  function fitShadowToView(focus) {
    const cam = camera.position;
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    const take = (p) => {
      const x = p.dot(lsX), y = p.dot(lsY);
      if (x < minX) minX = x; if (x > maxX) maxX = x;
      if (y < minY) minY = y; if (y > maxY) maxY = y;
    };
    // ground hits at the cart's height and a few units below it (the hill
    // drops away in front of the camera), so the box covers both
    for (const gy of [focus.y || 0, Math.max(-1, (focus.y || 0) - 7)]) {
      for (const [nx, ny] of _ndc) {
        _ray.set(nx, ny, 0.5).unproject(camera).sub(cam).normalize();
        const t = _ray.y < -0.02 ? Math.min((gy - cam.y) / _ray.y, 220) : 220;   // ground hit (or far, above the horizon)
        take(_hit.copy(cam).addScaledVector(_ray, t));
        take(_hit.y > gy ? _hit.setY(gy) : _hit);
      }
    }
    take(_ctr.set(focus.x, focus.y || 0, focus.z));
    const MARGIN = 6, STEP = 4;
    const hx = Math.ceil(((maxX - minX) / 2 + MARGIN) / STEP) * STEP;
    const hy = Math.ceil(((maxY - minY) / 2 + MARGIN) / STEP) * STEP;
    const sc = sun.shadow.camera;
    if (hx !== shadowHalf.x || hy !== shadowHalf.y) {
      shadowHalf = { x: hx, y: hy };
      sc.left = -hx; sc.right = hx; sc.bottom = -hy; sc.top = hy;
      sc.updateProjectionMatrix();
    }
    // centre of the patch in light space, snapped to shadow-map texels
    const texX = (2 * hx) / sun.shadow.mapSize.x, texY = (2 * hy) / sun.shadow.mapSize.y;
    const cx = Math.round(((minX + maxX) / 2) / texX) * texX;
    const cy = Math.round(((minY + maxY) / 2) / texY) * texY;
    // a world point with that light-space x/y, on the ground plane's depth line through the focus
    const fz = _ctr.set(focus.x, focus.y || 0, focus.z).dot(lsZ);
    sun.target.position.set(0, 0, 0).addScaledVector(lsX, cx).addScaledVector(lsY, cy).addScaledVector(lsZ, fz);
    sun.position.copy(sun.target.position).addScaledVector(SUN_FROM, SUN_DIST);
    sun.target.updateMatrixWorld();
  }
  window._fitShadow = () => ({ half: { ...shadowHalf }, texelsPerUnit: sun.shadow.mapSize.x / (2 * shadowHalf.x) });

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
      position: new THREE.Vector3(o.x, o.y, o.z),
      mesh: b
    });

    if (o.chimney && o._chimneyTop) {
      const c = o._chimneyTop;
      particleSystem.createSmoke(new THREE.Vector3(c.x, c.y, c.z));
    }

    // Collider: the building's own rotated footprint (it faces its street);
    // the stadium is oval, so it gets an elliptical one
    colliders.push(o.stadium ? ellipse(o.x, o.z, o.w / 2, o.d / 2, o.heading)
                             : obb(o.x, o.z, o.w / 2 + 0.15, o.d / 2 + 0.15, o.heading));
    if (o._windsock) colliders.push({ circle: true, x: o._windsock.x, z: o._windsock.z, r: 0.25 });
    if (o._extraColliders) colliders.push(...o._extraColliders);
  });
  buildShutters(scene);
  const wallLanterns = buildWallLanterns(scene, wallLanternSlots, {
    reducedMotion: REDUCED_MOTION,
    windStrength: () => WIND.uniforms.uWindStrength.value,
  });
  windowMats.push(SHARED.windowPane);

  // ── Townhouses lining the streets (instanced, see town-props.js) ──
  const houseWindow = SHARED.windowPane.clone();
  windowMats.push(houseWindow);
  buildTownhouses(scene, LAYOUT.houses, { windowMaterial: houseWindow });
  LAYOUT.houses.forEach(h => colliders.push(obb(h.x, h.z, h.w / 2 + 0.35, h.d / 2 + 0.35, h.heading)));

  // Water, bridge parapets and the edge of the play area
  colliders.push(...waterSys.colliders, ...bridge.colliders);
  colliders.push({ ring: true, x: WORLD.playX, z: WORLD.playZ, r: WORLD.playR });

  // ── Isometric occlusion fade ────────────────────────────────
  // The camera looks down from the south-east, so a building between it
  // and the cart would hide the cart. Each frame we cast two rays (cart
  // body + roof height) from the camera to the cart against every
  // building's bounds; a building that blocks them fades to ~25% using
  // per-building transparent material clones, and swaps back to its
  // original (opaque, depth-writing) materials once it's clear again.
  // (Townhouses and the town wall use the cheaper dither cut instead —
  // OCCLUSION_CUT in materials.js.)
  const occluders = buildingMeta.map(bm => {
    bm.mesh.updateMatrixWorld(true);
    const box = new THREE.Box3();
    bm.mesh.traverse(m => {
      if (!m.isMesh || m === bm.mesh.userData.marker || m.material.isShaderMaterial) return;
      box.expandByObject(m);
    });
    return { group: bm.mesh, box, fade: 1, swapped: false, parts: null };
  });
  const _occRay = new THREE.Ray(), _occPt = new THREE.Vector3(), _occHit = new THREE.Vector3();
  const OCC_MIN = 0.25;

  function occParts(o) {
    if (o.parts) return o.parts;
    o.parts = [];
    o.group.traverse(m => {
      if (!m.isMesh || m === o.group.userData.marker) return;
      const orig = m.material;
      const list = Array.isArray(orig) ? orig : [orig];
      if (list.some(x => x.isShaderMaterial)) return;          // cone lights stay as they are
      const clones = list.map(x => {
        const c = x.clone();
        c.transparent = true;
        c.depthWrite = false;
        c.userData.baseOpacity = x.opacity;
        return c;
      });
      o.parts.push({ mesh: m, orig, faded: Array.isArray(orig) ? clones : clones[0], clones });
    });
    return o.parts;
  }
  function occSwap(o, faded) {
    occParts(o).forEach(p => { p.mesh.material = faded ? p.faded : p.orig; });
    o.swapped = faded;
  }

  function updateOcclusion(dt) {
    const cam = camera.position;
    const cp  = cart.getPosition();
    const k   = Math.min(1, dt * 8);
    for (const o of occluders) {
      let hit = false;
      for (const yOff of [0.7, 2.0]) {
        _occPt.set(cp.x, cp.y + yOff, cp.z);
        _occRay.origin.copy(cam);
        _occRay.direction.subVectors(_occPt, cam);
        const d = _occRay.direction.length();
        _occRay.direction.divideScalar(d);
        if (_occRay.intersectBox(o.box, _occHit) && _occHit.distanceTo(cam) < d - 0.4) { hit = true; break; }
      }
      const target = hit ? OCC_MIN : 1;
      if (!o.swapped && !hit) continue;
      o.fade += (target - o.fade) * k;
      if (!o.swapped) occSwap(o, true);
      if (!hit && o.fade > 0.99) { o.fade = 1; occSwap(o, false); continue; }
      for (const p of o.parts) for (const c of p.clones) c.opacity = c.userData.baseOpacity * o.fade;
    }
  }

  // ── Fountain in the middle of the Market Terrace ────────────
  const FOUNTAIN = { x: -14.5, z: 38.2 };
  const fountain = buildFountain(scene, particleSystem, { x: FOUNTAIN.x, z: FOUNTAIN.z, y: groundAt(FOUNTAIN.x, FOUNTAIN.z), particles: PERF.fountain });
  colliders.push(fountain.collider);
  const fountainWater = fountain.water;
  fountainWater.userData.keep = true;      // spins every frame — stays its own mesh
  mergeStaticChildren(fountain.group);

  // Audio system integration
  const audioSys = new AudioSystem(camera);
  window._audio = audioSys;
  audioSys.attachFountain(fountainWater);
  audioSys.zoneOf = (p) => ZONE_NAMES[zoneKeyAt(p.x, p.z)];

  // ── The vortex over the Observatory + streamlines round its foot ──
  const OBSERVATORY = BUILDINGS.find(b => b.observatory);
  {
    const off = VORTEX_OFFSET.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), OBSERVATORY.heading || 0);
    const vortex = buildVortex(new THREE.Vector3(OBSERVATORY.x + off.x, OBSERVATORY.y + off.y, OBSERVATORY.z + off.z), { reducedMotion: REDUCED_MOTION });
    scene.add(vortex.group);
    const lines = buildStreamlines(OBSERVATORY.x, OBSERVATORY.z, groundAt, { reducedMotion: REDUCED_MOTION });
    scene.add(lines.mesh);
    animatedProps.push({ update: (t) => { vortex.update(t, camera); lines.update(t); } });
    // teal light from the vortex, through the light pool like the lamps
    lightSources.push({ pos: vortex.light, color: new THREE.Color(0x2de0c0), intensity: 1.2, distance: 14 });
    window._vortex = vortex;
  }

  // ── Tavern terrace & campfire ───────────────────────────────
  // Placed in the Tavern's own frame (it faces the street at the hairpin).
  const TAVERN = BUILDINGS.find(b => b.tavern);
  const tavernAt = (lateral, fwd) => {
    const c = Math.cos(TAVERN.heading), s = Math.sin(TAVERN.heading);
    return [TAVERN.x + lateral * c + fwd * s, TAVERN.z - lateral * s + fwd * c];
  };
  const tableMat = standardMat({ color: 0x6b4226, roughness: 0.8 });
  const TABLES = [tavernAt(-2.6, 6.1), tavernAt(2.6, 6.1)];
  const tableTopGeo = new THREE.CylinderGeometry(0.8, 0.8, 0.12, 10);
  const tableLegGeo = new THREE.CylinderGeometry(0.07, 0.07, 0.85, 8);
  const umbrellaGeo = new THREE.ConeGeometry(1.5, 0.7, 10, 1, true);
  const umbrellaPole = new THREE.CylinderGeometry(0.04, 0.04, 2.6, 6);
  TABLES.forEach(([x, z]) => {
    const gy = groundAt(x, z);
    const top = new THREE.Mesh(tableTopGeo, tableMat);
    top.position.set(x, gy + 0.9, z);
    top.castShadow = true;
    scene.add(top);
    const leg = new THREE.Mesh(tableLegGeo, tableMat);
    leg.position.set(x, gy + 0.45, z);
    scene.add(leg);
    // red café umbrellas like the reference's terrace
    const pole = new THREE.Mesh(umbrellaPole, propMaterials().iron);
    pole.position.set(x, gy + 1.9, z);
    scene.add(pole);
    const um = new THREE.Mesh(umbrellaGeo, propMaterials().awningRed);
    um.position.set(x, gy + 3.05, z);
    um.castShadow = true;
    scene.add(um);
    colliders.push({ circle: true, x, z, r: 1.0 });
  });

  const [cfx, cfz] = tavernAt(-7.2, 2.6);
  const CAMPFIRE = { x: cfx, z: cfz, y: groundAt(cfx, cfz) };
  const fireGlow = new THREE.PointLight(0xff6b35, 2, 12);
  fireGlow.position.set(CAMPFIRE.x, CAMPFIRE.y + 2, CAMPFIRE.z);
  scene.add(fireGlow);
  // stone ring + logs
  const fireRing = new THREE.Mesh(new THREE.TorusGeometry(0.75, 0.16, 6, 12), propMaterials().stoneDark);
  fireRing.rotation.x = -Math.PI / 2;
  fireRing.position.set(CAMPFIRE.x, CAMPFIRE.y + 0.1, CAMPFIRE.z);
  scene.add(fireRing);
  colliders.push({ circle: true, x: CAMPFIRE.x, z: CAMPFIRE.z, r: 1.1 });

  particleSystem.createCampfire(new THREE.Vector3(CAMPFIRE.x, CAMPFIRE.y + 0.2, CAMPFIRE.z), PERF.campfire);
  audioSys.attachFire(fireGlow);

  // ── Lamps along the streets (placed by town-layout.js) ──────
  for (const l of LAYOUT.lamps) {
    addLamp(scene, l.x, l.z, l.onBridge ? l.y : groundAt(l.x, l.z));
    colliders.push({ circle: true, x: l.x, z: l.z, r: 0.35 });
  }
  if (lampField) mergeStaticChildren(lampField);      // every pole + head → 2 meshes
  terrain.setLamps(lampRefs);                          // warm pools of light on the ground
  // Fixed pool of PointLights shared by every lamp + the vortex (see createLightPool)
  const lightPool = createLightPool(scene, PERF.lightPool);
  window._lightPool = lightPool;

  // ── The forest (§2.15) ──────────────────────────────────────
  // The landing page's tiered cedars and red maples, scattered densely by
  // town-layout.js over every open space (clearings round roads, squares,
  // buildings and houses), drawn tile by tile so off-screen tiles are culled.
  const SUN_DIR = new THREE.Vector3(...EVENING.sun.position).normalize();
  const trees = buildLandingTrees(scene, LAYOUT.trees, { heightAt: groundAt, keep: PERF.forest });
  colliders.push(...trees.colliders);

  // ── Rocks (round the pools, the spring, the falls and the river) ──
  {
    const rockGeo = new THREE.DodecahedronGeometry(0.4, 0);
    const rocks = new THREE.InstancedMesh(rockGeo, standardMat({ color: 0x8a857c, roughness: 0.95 }), LAYOUT.rocks.length);
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler();
    LAYOUT.rocks.forEach((r, i) => {
      q.setFromEuler(e.set(i * 1.7, i * 2.3, i * 0.9));
      m.compose(new THREE.Vector3(r.x, groundAt(r.x, r.z) + 0.1 * r.s, r.z), q, new THREE.Vector3(r.s, r.s * 0.7, r.s));
      rocks.setMatrixAt(i, m);
    });
    rocks.castShadow = rocks.receiveShadow = true;
    scene.add(rocks);
  }

  // ── Town wall, clock tower, sky dressing ────────────────────
  const wall = buildPathWall(scene, LAYOUT);
  colliders.push(...wall.colliders);

  // Clock tower on the crest behind City Hall — the town's skyline mark
  const clockTower = buildClockTower(scene, CLOCK_TOWER.x, CLOCK_TOWER.z, {
    base: CLOCK_TOWER.base, height: CLOCK_TOWER.height, y: groundAt(CLOCK_TOWER.x, CLOCK_TOWER.z) });
  colliders.push(clockTower.collider);
  mergeStaticChildren(clockTower.group);
  windowMats.push(clockTower.faceMat);
  particleSystem.createFireflies(30, { x: 20, y: 6, z: 20 }).position.set(-6, 18, -30);

  const clouds = buildClouds(scene, PERF.clouds, { radius: 130, reducedMotion: REDUCED_MOTION });
  npcMats.push(clouds.material);          // tinted like the NPC sprites
  buildMountains(scene, { radius: 150 });

  // ── Water wheel behind the mill ─────────────────────────────
  const MILL = BUILDINGS.find(b => b.mill);
  let millWheel = null;
  if (MILL) {
    const c = Math.cos(MILL.heading), s = Math.sin(MILL.heading), back = -(MILL.d / 2 + 0.75);
    const wx = MILL.x + back * s, wz = MILL.z + back * c;
    const near = LAYOUT.stream.path.pts.reduce((best, p, i) => {
      const d = Math.hypot(p.x - wx, p.z - wz);
      return d < best.d ? { d, i } : best;
    }, { d: Infinity, i: 0 });
    const surf = LAYOUT.stream.surface[near.i];
    millWheel = buildMillWheel(scene, { x: wx, y: surf + 1.25, z: wz, heading: MILL.heading });
  }

  // ── Phase 2.5: Enhanced Zone Details ──────────────────────────

  // Flower beds (crest square either side of the City Hall steps, and the
  // Market Terrace): wooden planter + small hedge bushes + instanced blooms.
  const bedMat = standardMat({ color: 0x5c3d2e });
  const bedGeo = new THREE.BoxGeometry(2.4, 0.3, 2.4);
  const BED_SLOTS = [[-16, -31.5], [4.5, -31.5], [-9.2, 31.2], [-25.4, 34]].map(([x, z]) => [x, z, groundAt(x, z)]);
  BED_SLOTS.forEach(([x, z]) => colliders.push({ circle: true, x, z, r: 1.5 }));
  const BUSHES = [];
  BED_SLOTS.forEach(([x, z, y]) => {
    const bed = new THREE.Mesh(bedGeo, bedMat);
    bed.position.set(x, y + 0.15, z);
    scene.add(bed);
    [[-0.55, -0.55], [0.55, -0.55], [-0.55, 0.55], [0.55, 0.55]].forEach(([dx, dz]) =>
      BUSHES.push([x + dx, z + dz, 0.5, 'green']));
  });

  // Phase 2.5: window flower boxes (instanced) + bloom clusters on the beds
  buildFlowerBoxes(scene, flowerBoxSlots, BED_SLOTS);

  // ── Bushes: beside doors, round the pools, along the inside of the wall ──
  BUSHES.push(...LAYOUT.bushes.map(b => [b.x, b.z, b.s, b.species]));
  const bushes = buildBushes(scene, BUSHES, { sunDir: SUN_DIR, cards: PERF.crownCards, heightAt: groundAt });
  colliders.push(...bushes.colliders);

  // ── Wild flowers in the meadows ─────────────────────────────
  if (PERF.flowers) buildWildFlowers(scene, LAYOUT.flowers.map(f => [f.x, f.z]), { heightAt: groundAt });

  // Phase 2.5: NPC silhouettes by doorways, the terrace tables and the squares
  // [building, lateral, distance in front of its door, variant]
  const npcAt = (label, lateral, fwd, v) => {
    const b = BUILDINGS.find(x => x.label === label);
    if (!b) return null;
    const c = Math.cos(b.heading), s = Math.sin(b.heading), f = b.d / 2 + fwd;
    const x = b.x + lateral * c + f * s, z = b.z - lateral * s + f * c;
    return [x, z, v, heightAt(x, z)];
  };
  if (PERF.npcs) {
    buildNpcs(scene, [
      npcAt('The Tavern', 0, 2.2, 0),
      npcAt('Guild Board', -1.6, 1.9, 1),
      npcAt('Guild Board', 1.5, 2.3, 0),
      npcAt('Concierge Parlour', 1.6, 1.6, 1),
      npcAt('Adventurer Stats', -1.4, 1.6, 0),
      npcAt('Ledger Sanctum', 1.8, 1.4, 2),
      npcAt('Tiny Tots Academy', 1.4, 1.9, 2),                // by the school door
      npcAt('Tiny Tots Academy', -3.0, -2.2, 2),              // kids in the playground
      npcAt('Tiny Tots Academy', -4.6, -3.9, 2),
      npcAt('City Hall', -4.6, 1.4, 1),
      npcAt('City Hall', 4.8, 2.4, 0),
      npcAt('The Forge', 2.1, 1.6, 1),
      npcAt('Prediction Colosseum', -2.4, 1.8, 0),
      npcAt('The Pickleball Court', -1.1, -3.4, 0),         // a rally on court
      npcAt('The Pickleball Court', 0.9, -9.6, 1),
      npcAt('Vortex Observatory', 1.6, 1.4, 2),
      npcAt('The Mill', 1.8, 1.4, 1),
      // fans in Fan Square: a queue at the ticket kiosk, one by a stall, one at the statue
      ...FAN_SQUARE.fans.map(([x, z, v]) => [x, z, v, heightAt(x, z)]),
    ].filter(Boolean));
  }

  // Market stalls round the terrace fountain — curved red-orange awnings
  const STALLS = [[-7.5, 34.5, -Math.PI / 2, false], [-24.4, 37.7, Math.PI / 2, true], [-20.2, 40.6, Math.PI, false]];
  STALLS.forEach(([x, z, r, red]) => {
    const stall = buildStall(scene, x, z, r, { red, y: groundAt(x, z) });
    mergeStaticChildren(stall.group);
    colliders.push(stall.collider);
  });

  // Fan Square at the bridge head: food stalls, the statue, the ticket kiosk, bunting
  {
    const [cx, cz] = FAN_SQUARE.centre;
    FAN_SQUARE.stalls.forEach(([x, z, red]) => {
      const stall = buildStall(scene, x, z, Math.atan2(cx - x, cz - z), { red, y: groundAt(x, z) });
      mergeStaticChildren(stall.group);
      colliders.push(stall.collider);
    });
    const fan = buildFanSquare(scene, FAN_SQUARE, groundAt);
    colliders.push(...fan.colliders);
  }

  // Navigator's Tower: waypoint flags on the slope and the drone flying the loop
  {
    for (const [x, z] of NAV_LOOP.flags) {
      const f = buildWaypointFlag();
      f.position.set(x, groundAt(x, z), z);
      f.rotation.y = Math.atan2(x + 34, z + 31.4);           // pennants point away from the tower
      mergeStaticChildren(f);
      scene.add(f);
      colliders.push({ circle: true, x, z, r: 0.25 });
    }
    // fly at a steady height above the ground under the loop (smoothed)
    const raw = NAV_LOOP.pts.map(([x, z]) => groundAt(x, z) + NAV_LOOP.fly);
    const pts = NAV_LOOP.pts.map(([x, z], i) => {
      const n = raw.length, y = (raw[(i + n - 1) % n] + 2 * raw[i] + raw[(i + 1) % n]) / 4;
      return [x, y, z];
    });
    const drone = buildDrone(pts, { reducedMotion: REDUCED_MOTION });
    scene.add(drone.group);
    animatedProps.push({ update: (t) => drone.update(t) });
    window._drone = drone;
  }

  // Tavern mugs on the terrace tables
  const mugGeo = new THREE.CylinderGeometry(0.1, 0.1, 0.2, 8);
  const mugMat = standardMat({ color: 0xcccccc, roughness: 0.2 });
  TABLES.forEach(([tx, tz], i) => [[-0.3, 0.2], [0.25, -0.15]].slice(0, i ? 1 : 2).forEach(([dx, dz]) => {
    const mug = new THREE.Mesh(mugGeo, mugMat);
    mug.position.set(tx + dx, groundAt(tx, tz) + 1.05, tz + dz);
    scene.add(mug);
  }));
  
  // ── Knockable props (§2.11): barrels, crates, terrace chairs ──
  // Not colliders: the cart shoves them (and loses a little speed), they
  // slide, spin, wobble and bounce off buildings / trees / each other.
  // One InstancedMesh per kind (see props-physics.js).
  const knockables = new KnockableProps(scene, {
    colliders,
    heightAt,
    reducedMotion: REDUCED_MOTION,
    materials: {
      barrel: standardMat({ color: 0x5a4033, roughness: 0.95 }),
      crate:  propMaterials().woodDoor,
      chair:  standardMat({ color: 0x7a4e2d, roughness: 0.85 }),
    },
    onHit: (strength) => audioSys.playThud(strength * 0.6),
  });
  // Barrels against the Tavern's side wall
  [tavernAt(5.6, -1.4), tavernAt(5.6, -0.2), tavernAt(6.3, -0.8)].forEach(([x, z]) => knockables.add('barrel', x, z, Math.random() * 6));
  // Crates beside two of the market stalls
  [[-6.2, 31.9], [-5.6, 31.2], [-6.6, 30.9], [-26.3, 39.4], [-25.6, 40.1]].forEach(([x, z]) =>
    knockables.add('crate', x, z, (Math.random() - 0.5) * 0.6));
  // Two chairs at each terrace table, facing it
  TABLES.forEach(([tx, tz]) => {
    const c = Math.cos(TAVERN.heading), s = Math.sin(TAVERN.heading);
    [-1.45, 1.45].forEach(lat => {
      const x = tx + lat * c, z = tz - lat * s;
      knockables.add('chair', x, z, Math.atan2(tx - x, tz - z));
    });
  });
  knockables.build();
  window._knockables = knockables;

  // ── Grass on open ground (after every collider exists) ───────
  // Streets, squares, paths, fields, water and anything solid are excluded.
  const colliderGrid = colliderIndex(colliders);
  function isOpenGround(x, z) {
    const m = terrain.mask.sample(x, z);
    if (m.r > 0.05 || m.g > 0.05 || m.b > 0.3) return false;
    if (groundAt(x, z) < LAYOUT.river.level + 0.2) return false;     // river and its wet banks
    if (LAYOUT.poolAt(x, z, 1.25)) return false;
    for (const c of colliderGrid.near(x, z)) if (circlePush(c, x, z, 0.3)) return false;
    return true;
  }
  const grass = PERF.grass > 0
    ? buildGrass(scene, { count: PERF.grass, radius: WORLD.playR, center: [WORLD.playX, WORLD.playZ], heightAt: groundAt, isOpen: isOpenGround })
    : null;

  // Cobbled surfaces (streets, squares) — for wheel audio and so wheel
  // tracks are only painted on grass.
  function isCobble(x, z) {
    const m = terrain.mask.sample(x, z);
    if (m.r > 0.5) return true;
    const [u, v] = BRIDGE.toLocal(x, z);
    return Math.abs(u) < BRIDGE.width / 2 && Math.abs(v) < BRIDGE.length / 2;
  }

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
    labelSys.add(bm.data.label, new THREE.Vector3(bm.data.x, bm.data.y + (bm.data.roofTop || bm.data.h) + 1.2, bm.data.z));
  });

  // ── Cart ────────────────────────────────────────────────────
  // Starts just south of the bridge, looking up at the town
  const cart = new Cart(scene, LAYOUT.start);
  cart.heightAt = heightAt;
  const cartDust = particleSystem.createCartDust(PERF.dust);
  window._cart = cart;
  cart.viewCamera = camera;          // touch stick reads in screen space (point-to-drive)
  cart.reducedMotion = REDUCED_MOTION;

  // ── Follow Camera ───────────────────────────────────────────
  const followCam = new FollowCamera(camera, { domElement: canvas });
  window._followCam = followCam;
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
    const wasOpen = modalOpen;
    modalOpen = !!(e.detail && e.detail.open);
    if (modalOpen && !wasOpen) audioSys.playCardOpen();      // UI sounds (§2.6), muted with everything else
    else if (!modalOpen && wasOpen) audioSys.playCardClose();
    cart.inputLocked = modalOpen;
    if (!modalOpen) followCam.frame(null);
    if (modalOpen && e.detail.projectId) achievements.onProjectOpened(e.detail.projectId);
  });

  function openProject(data) {
    if (!data || !data.project || modalOpen || typeof window.openModal !== 'function') return;
    followCam.frame(new THREE.Vector3(data.x, data.y || 0, data.z));   // ease toward the building while its card is open
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

  // ── Recovery & extras (R respawn, H bell, Unstuck, boost) ─────
  // R or the Unstuck button glides the cart to the nearest quarter spawn.
  function respawnNearest() {
    if (cart.teleporting || modalOpen) return;
    const p = cart.getPosition();
    let best = null, bestD = Infinity;
    for (const z of Object.values(ZONES)) {
      const d = Math.hypot(z.spawn.x - p.x, z.spawn.z - p.z);
      if (d < bestD) { bestD = d; best = z; }
    }
    if (!best) return;
    cart.teleportTo(best.spawn.x, best.spawn.z, best.spawn.rot, REDUCED_MOTION ? 0.3 : 0.9);
    cart.resetStuck();
    if (unstuckBtn) unstuckBtn.hidden = true;
  }
  window.addEventListener('keydown', e => {
    if (modalOpen || e.repeat) return;
    const t = e.target;
    if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
    if (e.code === 'KeyR') respawnNearest();
    if (e.code === 'KeyH') audioSys.playBell();
  });
  const unstuckBtn = document.getElementById('unstuck-btn');
  if (unstuckBtn) unstuckBtn.addEventListener('click', respawnNearest);

  // Touch boost: hold the 💨 button (mirrors Shift on keyboards)
  const boostBtn = document.getElementById('mobile-boost-btn');
  if (boostBtn && isTouch) {
    boostBtn.style.display = 'flex';
    const on  = e => { e.preventDefault(); cart.keys.boost = true;  boostBtn.classList.add('is-active'); };
    const off = e => { e.preventDefault(); cart.keys.boost = false; boostBtn.classList.remove('is-active'); };
    boostBtn.addEventListener('touchstart', on, { passive: false });
    boostBtn.addEventListener('touchend', off, { passive: false });
    boostBtn.addEventListener('touchcancel', off, { passive: false });
  }
  let wasBoosting = false;

  // ── Interaction System ──────────────────────────────────────
  const interactPrompt = document.getElementById('interact-prompt');
  const interactName   = document.getElementById('interact-name');
  const mobileBtn      = document.getElementById('mobile-interact-btn');
  let currentInteractable = null;

  // Range is measured to the building's FOOTPRINT (not its centre), so the
  // prompt appears when you're parked beside a wall whatever the building's
  // size. Rechecked only after the cart moves 0.2 units (or state changes).
  const INTERACT_RANGE = 5;      // units from the wall
  const VISIT_RANGE    = 7;      // "approached" for exploration achievements
  const edgeDist = (p, d) => footprintDist(p.x, p.z, d);    // buildings are rotated to face their street
  let lastCheckPos = null, lastModalState = null;
  interactPrompt.style.display = 'flex';          // visibility via .is-visible (fades)
  function updateInteraction(force = false) {
    const cPos = cart.getPosition();
    if (!force && lastCheckPos && lastModalState === modalOpen &&
        Math.hypot(cPos.x - lastCheckPos.x, cPos.z - lastCheckPos.z) < 0.2) return;
    lastCheckPos = cPos; lastModalState = modalOpen;

    let nearest = null, nearDist = Infinity;
    buildingMeta.forEach(bm => {
      const d = edgeDist(cPos, bm.data);
      // Every building counts as "approached" for exploration tracking,
      // even the decorative ones without a project modal.
      if (d < VISIT_RANGE) achievements.visit(bm.data.label);
      if (!bm.data.project) return;
      if (d < INTERACT_RANGE && d < nearDist) { nearDist = d; nearest = bm.data; }
    });

    if (nearest && !modalOpen) {
      // soft "tok" when the prompt appears or switches to another building
      if (currentInteractable !== nearest) audioSys.playPrompt();
      interactName.textContent = nearest.label;
      interactPrompt.classList.add('is-visible');
      currentInteractable = nearest;
      if (mobileBtn) mobileBtn.style.display = inputMode === 'touch' ? 'block' : 'none';
    } else {
      interactPrompt.classList.remove('is-visible');
      currentInteractable = null;
      if (mobileBtn) mobileBtn.style.display = 'none';
    }
  }

  // ── Input mode (keyboard / touch / gamepad) → prompt icon ───
  let inputMode = isTouch ? 'touch' : 'keyboard';
  let padStyle = 'xbox';
  const interactKey = interactPrompt.querySelector('.interact-key');
  function renderInputMode() {
    townRoot.dataset.input = inputMode;
    if (interactKey) {
      interactKey.textContent = inputMode === 'gamepad' ? (padStyle === 'ps' ? '✕' : 'A')
                              : inputMode === 'touch'   ? '👆' : 'E';
      interactKey.dataset.mode = inputMode;
    }
    const tt = interactPrompt.querySelector('.interact-text');
    if (tt && tt.firstChild && tt.firstChild.nodeType === 3) tt.firstChild.textContent = inputMode === 'touch' ? 'Tap Enter · ' : 'Enter ';
    updateInteraction(true);
  }
  function setInputMode(m) { if (m !== inputMode) { inputMode = m; renderInputMode(); } }
  window.addEventListener('keydown', () => setInputMode('keyboard'), true);
  window.addEventListener('pointerdown', e => { if (e.pointerType === 'mouse') setInputMode('keyboard'); }, true);
  window.addEventListener('touchstart', () => setInputMode('touch'), { capture: true, passive: true });
  renderInputMode();

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
    if (followCam.consumeDrag()) return;          // that was a drag-to-look, not a click
    mouse.x =  (e.clientX / innerWidth)  * 2 - 1;
    mouse.y = -(e.clientY / innerHeight) * 2 + 1;
    raycaster.setFromCamera(mouse, camera);
    const hits = raycaster.intersectObjects(clickables);
    if (hits.length && hits[0].object.userData.project) {
      openProject(metaByProject[hits[0].object.userData.project]);
    }
  });

  // ── Minimap ─────────────────────────────────────────────────
  // North up. The plan (hill, river, stream, streets, squares, wall) is
  // drawn once to an offscreen canvas; each frame adds the buildings (the
  // ones in your current quarter highlighted) and the cart arrow.
  const minimapCanvas = document.getElementById('minimap-canvas');
  let minimap = null;
  if (minimapCanvas) {
    const mCtx = minimapCanvas.getContext('2d');
    const mSize = minimapCanvas.width; // 160
    const mCenter = mSize / 2;
    const MC = { x: WORLD.playX - 2, z: WORLD.playZ };          // world point at the map's centre
    const mScale = mSize / (WORLD.playR * 2 + 6);              // world units → px
    const mx = (x) => mCenter + (x - MC.x) * mScale, mz = (z) => mCenter + (z - MC.z) * mScale;

    const bg = document.createElement('canvas');
    bg.width = bg.height = mSize;
    {
      const c = bg.getContext('2d');
      c.fillStyle = 'rgba(15, 25, 15, 0.85)';
      c.fillRect(0, 0, mSize, mSize);
      // hill: a few soft rings rising to the crest
      const H = LAYOUT.grid;
      for (let y = 2; y <= 10; y += 2) {
        c.fillStyle = `rgba(120, 140, 90, ${0.07 + y * 0.012})`;
        for (let px = 0; px < mSize; px += 2) for (let pz = 0; pz < mSize; pz += 2) {
          const wx = MC.x + (px - mCenter) / mScale, wz = MC.z + (pz - mCenter) / mScale;
          if (groundAt(wx, wz) > y) c.fillRect(px, pz, 2, 2);
        }
        void H;
      }
      const line = (pts, w, style) => {
        c.strokeStyle = style; c.lineWidth = w; c.lineCap = 'round'; c.lineJoin = 'round';
        c.beginPath(); pts.forEach((p, i) => (i ? c.lineTo(mx(p.x), mz(p.z)) : c.moveTo(mx(p.x), mz(p.z)))); c.stroke();
      };
      line(LAYOUT.river.path.pts, LAYOUT.river.width * mScale, 'rgba(79, 160, 210, 0.75)');
      line(LAYOUT.stream.path.pts, Math.max(1.2, LAYOUT.stream.width * mScale), 'rgba(79, 160, 210, 0.75)');
      for (const pl of LAYOUT.pools) {
        c.fillStyle = 'rgba(79, 160, 210, 0.75)';
        c.beginPath(); c.ellipse(mx(pl.x), mz(pl.z), pl.rx * mScale, pl.rz * mScale, pl.rot, 0, Math.PI * 2); c.fill();
      }
      for (const pl of LAYOUT.plazas) {
        c.fillStyle = 'rgba(190, 168, 128, 0.6)';
        c.beginPath(); pl.pts.forEach(([x, z], i) => (i ? c.lineTo(mx(x), mz(z)) : c.moveTo(mx(x), mz(z)))); c.closePath(); c.fill();
      }
      for (const r of LAYOUT.roads) line(r.path.pts, Math.max(1.5, r.width * mScale), 'rgba(178, 158, 120, 0.75)');
      // wall (with its gates left open)
      const W = LAYOUT.wall.path.pts;
      c.strokeStyle = 'rgba(214, 200, 170, 0.7)'; c.lineWidth = 2;
      let open = true;
      c.beginPath();
      for (let i = 0; i <= W.length; i++) {
        const p = W[i % W.length];
        if (LAYOUT.wallGap(p.s)) { open = true; continue; }
        if (open) { c.moveTo(mx(p.x), mz(p.z)); open = false; } else c.lineTo(mx(p.x), mz(p.z));
      }
      c.stroke();
      // townhouses
      c.fillStyle = 'rgba(200, 170, 140, 0.35)';
      for (const h of LAYOUT.houses) c.fillRect(mx(h.x) - 1.5, mz(h.z) - 1.5, 3, 3);
    }

    minimap = {
      update(cPos, cRot) {
        mCtx.clearRect(0, 0, mSize, mSize);
        mCtx.save();
        mCtx.beginPath();
        mCtx.arc(mCenter, mCenter, mCenter - 1, 0, Math.PI * 2);
        mCtx.clip();
        mCtx.drawImage(bg, 0, 0);

        // Building dots: portfolio buildings gold, the ones in this quarter brighter
        const zk = zoneKeyAt(cPos.x, cPos.z);
        BUILDINGS.forEach(b => {
          const here = b.zone === zk;
          mCtx.fillStyle = b.project ? (here ? 'rgba(255, 209, 102, 0.95)' : 'rgba(255, 209, 102, 0.5)') : 'rgba(220, 200, 170, 0.55)';
          const sz = here ? 5 : 4;
          mCtx.fillRect(mx(b.x) - sz / 2, mz(b.z) - sz / 2, sz, sz);
        });

        // Cart arrow (heading: forward = (sin r, cos r) in x / z; canvas y = z)
        mCtx.save();
        mCtx.translate(mx(cPos.x), mz(cPos.z));
        mCtx.rotate(Math.PI - cRot);
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
  let pointLightCount = 0;
  if (debugPerf) scene.traverse(o => { if (o.isPointLight) pointLightCount++; });

  // ── Gamepad (standard mapping) ──────────────────────────────
  // Left stick: point-to-drive (same as the touch stick). Triggers: RT
  // throttle / LT brake-reverse with left-stick X steering (racing style).
  // A/✕ enter · B/○ handbrake (closes a project card) · X/□ bell ·
  // Y/△ back to nearest quarter · LB/RB boost.
  const pad = { prev: [], stickOn: false };
  function pollGamepad() {
    const list = navigator.getGamepads ? navigator.getGamepads() : [];
    let gp = null;
    for (const p of list) if (p && p.connected) { gp = p; break; }
    if (!gp) { if (pad.stickOn) { cart.setJoystickInput(0, 0); pad.stickOn = false; } cart.pad.active = false; return; }
    padStyle = /054c|playstation|dualshock|dualsense/i.test(gp.id) ? 'ps' : 'xbox';
    const btn = (i) => gp.buttons[i] ? gp.buttons[i].value : 0;
    const pressed = (i) => btn(i) > 0.5;
    const edge = (i) => pressed(i) && !pad.prev[i];
    const ax = gp.axes[0] || 0, ay = gp.axes[1] || 0;
    const stickMag = Math.hypot(ax, ay);
    const rt = btn(7), lt = btn(6);
    const anyInput = stickMag > 0.25 || rt > 0.1 || lt > 0.1 || gp.buttons.some(b => b.pressed);
    if (anyInput) setInputMode('gamepad');

    if (modalOpen) {
      if (edge(1) && typeof window.closeModal === 'function') window.closeModal();
      cart.pad.active = false;
    } else {
      // Racing input when a trigger is held
      const dz = (v) => Math.abs(v) < 0.15 ? 0 : (v - Math.sign(v) * 0.15) / 0.85;
      if (rt > 0.05 || lt > 0.05) {
        cart.pad.active = true;
        cart.pad.throttle = rt - lt;
        cart.pad.steer = -dz(ax);
        if (pad.stickOn) { cart.setJoystickInput(0, 0); pad.stickOn = false; }
      } else {
        cart.pad.active = false;
        if (stickMag > 0.2) { cart.setJoystickInput(ax, ay); pad.stickOn = true; }
        else if (pad.stickOn) { cart.setJoystickInput(0, 0); pad.stickOn = false; }
      }
      cart.pad.brake = pressed(1);
      cart.pad.boost = pressed(4) || pressed(5);
      if (edge(0) && currentInteractable) openProject(currentInteractable);
      if (edge(2)) audioSys.playBell();
      if (edge(3)) respawnNearest();
    }
    pad.prev = gp.buttons.map(b => b.value > 0.5);
  }
  window.addEventListener('gamepadconnected', () => setInputMode('gamepad'));

  // ── Wheel tracks in the grass + surface for wheel audio ─────
  // Bruno-style tracks without a render target: a 512² canvas covering the
  // town (160 × 160 units, ~0.31 u/px). Rear wheels paint soft earthy dots
  // on it while on grass; it slowly fades. The terrain shader darkens the
  // ground under the marks (grass only — cobbles stay clean) and the grass
  // shader samples the same texture to lay blades flat in the tracks.
  const TRACK_EXT = 160, TRACK_RES = 512;
  const trackCanvas = document.createElement('canvas');
  trackCanvas.width = trackCanvas.height = TRACK_RES;
  const tctx = trackCanvas.getContext('2d');
  const trackTex = new THREE.CanvasTexture(trackCanvas);
  trackTex.minFilter = THREE.LinearFilter;
  trackTex.generateMipmaps = false;
  terrain.setTrackMap(trackTex, TRACK_EXT);
  if (grass && grass.setTrackMap) grass.setTrackMap(trackTex, TRACK_EXT);
  window._tracks = { canvas: trackCanvas, texture: trackTex, extent: TRACK_EXT };

  const trackLast = [null, null];
  let trackDirty = false, lastFade = 0, lastUpload = 0;
  const toPx = (v) => (v / TRACK_EXT + 0.5) * TRACK_RES;
  function updateTracks(elapsed) {
    const p = cart.position;
    cart.onCobble = isCobble(p.x, p.z);
    if (cart.getSpeed() > 0.01) {
      const s = Math.sin(cart.rotation), c = Math.cos(cart.rotation);
      for (let i = 0; i < 2; i++) {
        const fx = i ? 1.0 : -1.0, fz = -1.1;              // rear wheels
        const x = p.x + fx * c + fz * s, z = p.z - fx * s + fz * c;
        const last = trackLast[i];
        if (last && Math.hypot(x - last.x, z - last.z) < 0.3) continue;
        if (!isCobble(x, z)) {
          // stroke from the last point so fast driving leaves a continuous line
          tctx.strokeStyle = 'rgba(255,255,255,0.5)';
          tctx.lineWidth = 0.55 / TRACK_EXT * TRACK_RES * 2;   // ≈ 0.55 units wide
          tctx.lineCap = 'round';
          tctx.beginPath();
          if (last && Math.hypot(x - last.x, z - last.z) < 2) tctx.moveTo(toPx(last.x), toPx(last.z));
          else tctx.moveTo(toPx(x), toPx(z));
          tctx.lineTo(toPx(x) + 0.01, toPx(z));
          tctx.stroke();
          trackDirty = true;
        }
        trackLast[i] = { x, z };
      }
    }
    // Slow fade (~20 s to vanish)
    if (elapsed - lastFade > 0.4) {
      lastFade = elapsed;
      tctx.globalCompositeOperation = 'destination-out';
      tctx.fillStyle = 'rgba(0,0,0,0.05)';
      tctx.fillRect(0, 0, TRACK_RES, TRACK_RES);
      tctx.globalCompositeOperation = 'source-over';
      trackDirty = true;
    }
    if (trackDirty && elapsed - lastUpload > 0.1) {
      trackTex.needsUpdate = true;
      trackDirty = false; lastUpload = elapsed;
    }
  }

  // ── Animate Loop ────────────────────────────────────────────
  const clock = new THREE.Clock();

  function animate() {
    requestAnimationFrame(animate);
    const delta   = clock.getDelta();
    const elapsed = clock.getElapsedTime();

    // Cart
    pollGamepad();
    cart.update(delta, colliders);
    knockables.update(delta, cart);
    updateTracks(elapsed);
    if (cart.justCollided) audioSys.playThud(cart.impact / 0.12);
    if (cart.boosting && !wasBoosting) audioSys.playWhoosh();
    wasBoosting = cart.boosting;
    if (unstuckBtn && unstuckBtn.hidden === cart.stuck) unstuckBtn.hidden = !cart.stuck;

    // Wind field (shared by leaves, blooms, bushes, grass, flowers)
    WIND.update(delta);
    updateWindMaterials(foliageMaterials(), camera);

    // Particles
    particleSystem.update(delta, elapsed);
    if (cartDust && cartDust.sys) {
      cartDust.sys.spawnDust(cart.getPosition(), cart.getSpeed(), elapsed, cart.boosting);
    }

    // Camera
    followCam.update(cart, delta);
    updateOcclusion(delta);
    OCCLUSION_CUT.update(camera.position, cart.position);   // see-through townhouses / wall round the cart
    lightPool.update(followCam._focus);   // move the pooled lights to the sources nearest the view
    terrain.updateLamps(followCam._focus); // and the lamplight pools painted on the ground
    fitShadowToView(followCam._focus);    // spend the shadow map on what's on screen

    // Labels
    labelSys.update(canvas.clientWidth, canvas.clientHeight, followCam._focus, followCam._dist);

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
    wallLanterns.update(elapsed);
    waterSys.update(elapsed);
    if (millWheel && !REDUCED_MOTION) millWheel.update(delta);

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
        const msg = `[town] ${fps}fps · ${r.calls} draw calls · ${r.triangles} tris · ${pointLightCount} point lights · ${sharedMaterialCount()} shared mats · tier=${perfTier} · grass=${grass ? grass.count : 0} · wind=${WIND.uniforms.uWindStrength.value}`;
        (r.calls > DRAW_CALL_BUDGET ? console.warn : console.log)(msg);
        window._townPerf = { fps: +fps, calls: r.calls, triangles: r.triangles, tier: perfTier };
        perfTimer = 0; perfFrames = 0;
      }
      renderer.info.reset();
    }

    // Existing animated props
    fireGlow.intensity = 1.6 + Math.sin(elapsed * 3) * 0.4;

    // Fountain water shimmer
    fountainWater.rotation.z = elapsed * 0.3;

    // Render through post-processing pipeline
    postFx.render();
  }

  // Entry fly-in: FollowCamera starts high on the isometric diagonal and
  // glides down to the cart on its first frames (see cart.js).

  animate();
}

// ════════════════════════════════════════════════════════════════
// EXPOSE TO GLOBAL (used by hero script's "Enter Town" button)
// ════════════════════════════════════════════════════════════════

window.initTownWorld = initTownWorld;
