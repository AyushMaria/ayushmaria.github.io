/**
 * town-world.js — 3D Isekai Town for Ayush's Settlement
 * ES Module — requires Three.js (global) and GSAP loaded before this.
 *
 * Local dev: serve via `npx serve .` or Live Server
 * (ES modules require HTTP, not file://)
 */

import { Cart, FollowCamera } from './cart.js';
import { ParticleSystem } from './particles.js';

const THREE = window.THREE;
const gsap  = window.gsap;

// ════════════════════════════════════════════════════════════════
// ════════════════════════════════════════════════════════════════
// BUILDING DATA  (circular layout — hub + 3 spoke arms)
// ════════════════════════════════════════════════════════════════

const BUILDINGS = [
  // Town Square — entry area (south of roundabout, z > 0)
  { x: -10, z: 28, w: 10, h: 7, d: 8, color: 0x6b4226, roof: 0x3d2b1f,
    chimney: true, label: 'The Tavern', project: null },
  { x: -7, z: 16, w: 4, h: 5, d: 3, color: 0xd4c9b0, roof: 0x8b7355,
    label: 'Adventurer Stats', project: null },
  { x: 7, z: 16, w: 4, h: 5, d: 3, color: 0x6b4226, roof: 0x3e2518,
    label: 'Guild Board', project: null },

  // North Arm
  { x: -7, z: -14, w: 5.5, h: 6, d: 5, color: 0x6b4226, roof: 0x3d2b1f,
    chimney: true, label: 'The Forge', project: 'mavpose' },
  { x: 7, z: -20, w: 5, h: 7, d: 4, color: 0xd4c9b0, roof: 0x2c2c3e,
    chimney: true, label: 'Ledger Sanctum', project: 'ledger' },
  { x: -5, z: -36, w: 6, h: 5, d: 5, color: 0xc0392b, roof: 0xe74c3c,
    label: 'Tiny Tots Academy', project: 'tinytots' },

  // East Arm
  { x: 18, z: -7, w: 6, h: 5, d: 6, color: 0x3a3a4a, roof: 0x1a1a2a,
    roofSegs: 8, label: 'Prediction Colosseum', project: 'xg' },
  { x: 22, z: 7, w: 6, h: 4, d: 6, color: 0xe8dcc8, roof: null,
    label: 'Cloud Citadel', project: 'aws' },
  { x: 40, z: 0, w: 4.5, h: 10, d: 4.5, color: 0x1a2a4a, roof: 0x0a1428,
    roofSegs: 16, label: 'Vortex Observatory', project: 'vortex' },

  // West Arm
  { x: -20, z: 7, w: 4.5, h: 9, d: 4, color: 0x3b1f5e, roof: 0x6a0dad,
    roofSegs: 6, label: 'Concierge Parlour', project: 'ace' },
  { x: -18, z: -7, w: 6, h: 4.5, d: 6, color: 0x06d6a0, roof: null,
    label: 'The Volley Court', project: 'volley' },
  { x: -40, z: 0, w: 3.5, h: 14, d: 3.5, color: 0x1c2b3a, roof: null,
    label: "Navigator's Tower", project: 'instillgcs' },
];

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

  // Windows (front face)
  const winMat = new THREE.MeshStandardMaterial({
    color: 0xffd166, emissive: 0xffd166, emissiveIntensity: 0.8,
  });
  windowMats.push(winMat);
  const winGeo = new THREE.BoxGeometry(0.5, 0.6, 0.06);
  [-o.w * 0.22, o.w * 0.22].forEach(wx => {
    const win = new THREE.Mesh(winGeo, winMat);
    win.position.set(wx, o.h * 0.58, o.d / 2 + 0.01);
    g.add(win);
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
  return g;
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
    this.skyPresets = {
      day:     { top: new THREE.Color(0x3388ff), horizon: new THREE.Color(0x87ceeb), bottom: new THREE.Color(0xd4f1f9) },
      sunset:  { top: new THREE.Color(0x1a1a6a), horizon: new THREE.Color(0xff6b35), bottom: new THREE.Color(0xffaa55) },
      night:   { top: new THREE.Color(0x030020), horizon: new THREE.Color(0x0d0825), bottom: new THREE.Color(0x1a0a2e) },
      dawn:    { top: new THREE.Color(0x2244aa), horizon: new THREE.Color(0xffaa77), bottom: new THREE.Color(0xffd4a8) },
    };

    // Light color presets
    this.lightPresets = {
      day:    { color: new THREE.Color(0xffd580), intensity: 1.3, ambient: 0.5, ambientColor: new THREE.Color(0xffe4b5) },
      sunset: { color: new THREE.Color(0xff8844), intensity: 0.9, ambient: 0.35, ambientColor: new THREE.Color(0xffaa66) },
      night:  { color: new THREE.Color(0x4466aa), intensity: 0.3, ambient: 0.15, ambientColor: new THREE.Color(0x223355) },
      dawn:   { color: new THREE.Color(0xffbb88), intensity: 0.8, ambient: 0.4,  ambientColor: new THREE.Color(0xffcc99) },
    };

    // Fog presets
    this.fogPresets = {
      day:    { color: new THREE.Color(0x87ceeb), density: 0.005 },
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

  // ── Renderer ────────────────────────────────────────────────
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
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

  window.addEventListener('resize', () => {
    renderer.setSize(innerWidth, innerHeight);
    camera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();
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

  const sun = new THREE.DirectionalLight(0xffd580, 1.3);
  sun.position.set(10, 20, 10);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
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

  // Fountain spout
  const spout = new THREE.Mesh(
    new THREE.CylinderGeometry(0.15, 0.15, 2.2, 8),
    new THREE.MeshStandardMaterial({ color: 0xd4c9b0, roughness: 0.9 })
  );
  spout.position.set(0, 1.5, 0);
  scene.add(spout);

  particleSystem.createFountainSpray(new THREE.Vector3(0, 2.6, 0), 120);

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

  particleSystem.createCampfire(new THREE.Vector3(-10, 0.2, 30), 40);

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

  // ── Label System ────────────────────────────────────────────
  const labelsContainer = document.getElementById('labels-container');
  const labelSys = new LabelSystem(camera, labelsContainer);
  buildingMeta.forEach(bm => {
    labelSys.add(bm.data.label, new THREE.Vector3(bm.data.x, bm.data.h + 1.5, bm.data.z));
  });

  // ── Cart ────────────────────────────────────────────────────
  const cart = new Cart(scene, { x: 0, z: 30 });
  const cartDust = particleSystem.createCartDust(80);

  // ── Follow Camera ───────────────────────────────────────────
  const followCam = new FollowCamera(camera);

  // ── Mobile Joystick ─────────────────────────────────────────
  if ('ontouchstart' in window) {
    const jsEl = document.getElementById('mobile-joystick');
    if (jsEl) jsEl.style.display = 'block';
    setupMobileJoystick(cart);
  }

  // ── Ambient Fireflies ───────────────────────────────────────
  particleSystem.createFireflies(150, {x: 80, y: 12, z: 150});

  // ── Interaction System ──────────────────────────────────────
  const interactPrompt = document.getElementById('interact-prompt');
  const interactName   = document.getElementById('interact-name');
  const mobileBtn      = document.getElementById('mobile-interact-btn');
  let currentInteractable = null;

  function updateInteraction() {
    const cPos = cart.getPosition();
    let nearest = null, nearDist = Infinity;

    buildingMeta.forEach(bm => {
      if (!bm.data.project) return;
      const d = cPos.distanceTo(bm.position);
      if (d < 10 && d < nearDist) { nearDist = d; nearest = bm.data; }
    });

    if (nearest) {
      interactPrompt.style.display = 'flex';
      interactName.textContent = nearest.label;
      currentInteractable = nearest;
      if ('ontouchstart' in window && mobileBtn) mobileBtn.style.display = 'block';
    } else {
      interactPrompt.style.display = 'none';
      currentInteractable = null;
      if (mobileBtn) mobileBtn.style.display = 'none';
    }
  }

  // Keyboard interact
  window.addEventListener('keydown', e => {
    if (e.code === 'KeyE' && currentInteractable && currentInteractable.project) {
      window.openModal(currentInteractable.project);
    }
  });

  // Mobile interact
  if (mobileBtn) {
    mobileBtn.addEventListener('click', () => {
      if (currentInteractable && currentInteractable.project)
        window.openModal(currentInteractable.project);
    });
  }

  // Click-on-building (raycaster)
  const raycaster = new THREE.Raycaster();
  const mouse     = new THREE.Vector2();
  const clickables = [];
  scene.traverse(o => { if (o.isMesh && o.userData.project) clickables.push(o); });

  canvas.addEventListener('click', e => {
    mouse.x =  (e.clientX / innerWidth)  * 2 - 1;
    mouse.y = -(e.clientY / innerHeight) * 2 + 1;
    raycaster.setFromCamera(mouse, camera);
    const hits = raycaster.intersectObjects(clickables);
    if (hits.length && hits[0].object.userData.project) {
      window.openModal(hits[0].object.userData.project);
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
    const dismiss = () => {
      controlsEl.classList.add('fade-out');
      setTimeout(() => { controlsEl.style.display = 'none'; }, 800);
    };
    setTimeout(dismiss, 5000);
    controlsEl.addEventListener('click', dismiss);
  }

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

    // Particles
    particleSystem.update(delta, elapsed);
    if (cartDust && cartDust.sys) {
      cartDust.sys.spawnDust(cart.getPosition(), cart.getSpeed(), elapsed);
    }

    // Camera
    followCam.update(cart.getPosition(), cart.getRotation(), cart.getSpeed());

    // Labels
    labelSys.update(canvas.clientWidth, canvas.clientHeight);

    // Interaction
    updateInteraction();

    // Minimap
    if (minimap) minimap.update(cart.getPosition(), cart.getRotation());

    // Animated props
    orb.rotation.y   = elapsed * 1.5;
    orb.position.y   = 12 + Math.sin(elapsed * 2) * 0.3;
    orbLight.position.copy(orb.position);
    fireGlow.intensity = 1.6 + Math.sin(elapsed * 3) * 0.4;

    // Water shimmer
    water.rotation.y = elapsed * 0.3;

    renderer.render(scene, camera);
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
