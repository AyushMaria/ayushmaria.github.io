/**
 * town-world.js — 3D Isekai Town for Ayush's Settlement
 * ES Module — requires Three.js (global) and GSAP loaded before this.
 *
 * Local dev: serve via `npx serve .` or Live Server
 * (ES modules require HTTP, not file://)
 */

import { Cart, FollowCamera } from './cart.js';

const THREE = window.THREE;
const gsap  = window.gsap;

// ════════════════════════════════════════════════════════════════
// ZONE DEFINITIONS
// ════════════════════════════════════════════════════════════════

const ZONES = {
  square:     { x: 0,  z: 0,    label: 'Town Square' },
  settlement: { x: 0,  z: -40,  label: 'The Settlement' },
  research:   { x: 0,  z: -80,  label: 'Research Quarter' },
  tavern:     { x: 0,  z: -120, label: 'The Tavern' },
};

// ════════════════════════════════════════════════════════════════
// BUILDING DATA
// ════════════════════════════════════════════════════════════════

const BUILDINGS = [
  // Zone 1 — Town Square
  { x: -6, z: -2, w: 4, h: 5, d: 3, color: 0xd4c9b0, roof: 0x8b7355,
    label: 'Adventurer Stats', project: null },
  { x: 6,  z: -2, w: 4, h: 5, d: 3, color: 0x6b4226, roof: 0x3e2518,
    label: 'Guild Board', project: null },

  // Zone 2 — Settlement (Main Street)
  { x: -7, z: -48, w: 5.5, h: 6,  d: 5,   color: 0x6b4226, roof: 0x3d2b1f,
    chimney: true, label: 'The Forge', project: 'mavpose' },
  { x:  7, z: -48, w: 4.5, h: 9,  d: 4,   color: 0x3b1f5e, roof: 0x6a0dad,
    roofSegs: 6, label: 'Concierge Parlour', project: 'ace' },
  { x: -7, z: -40, w: 6,   h: 5,  d: 5,   color: 0xc0392b, roof: 0xe74c3c,
    label: 'Tiny Tots Academy', project: 'tinytots' },
  { x:  7, z: -40, w: 6,   h: 4.5, d: 6,  color: 0x06d6a0, roof: null,
    label: 'The Volley Court', project: 'volley' },
  { x: -7, z: -32, w: 5,   h: 7,  d: 4,   color: 0xd4c9b0, roof: 0x2c2c3e,
    chimney: true, label: 'Ledger Sanctum', project: 'ledger' },
  { x:  7, z: -32, w: 3.5, h: 14, d: 3.5, color: 0x1c2b3a, roof: null,
    label: "Navigator's Tower", project: 'instillgcs' },

  // Zone 3 — Research Quarter
  { x: -7, z: -84, w: 6,   h: 5,  d: 6,   color: 0x3a3a4a, roof: 0x1a1a2a,
    roofSegs: 8, label: 'Prediction Colosseum', project: 'xg' },
  { x:  0, z: -86, w: 4.5, h: 10, d: 4.5, color: 0x1a2a4a, roof: 0x0a1428,
    roofSegs: 16, label: 'Vortex Observatory', project: 'vortex' },
  { x:  7, z: -84, w: 6,   h: 4,  d: 6,   color: 0xe8dcc8, roof: null,
    label: 'Cloud Citadel', project: 'aws' },

  // Zone 4 — Tavern
  { x: 0, z: -120, w: 10, h: 7, d: 8, color: 0x6b4226, roof: 0x3d2b1f,
    chimney: true, label: 'The Tavern', project: null },
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

function createSkyDome(scene, isDay) {
  const geo = new THREE.SphereGeometry(140, 32, 16);
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    uniforms: {
      topColor:     { value: new THREE.Color(isDay ? 0x3388ff : 0x030020) },
      horizonColor: { value: new THREE.Color(isDay ? 0x87ceeb : 0x0d0825) },
      bottomColor:  { value: new THREE.Color(isDay ? 0xd4f1f9 : 0x1a0a2e) },
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
  return sky;
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
  const isDay = document.documentElement.getAttribute('data-theme') !== 'night';
  createSkyDome(scene, isDay);

  // ── Ground ──────────────────────────────────────────────────
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(200, 200),
    new THREE.MeshStandardMaterial({ color: 0x4a7c3f, roughness: 1 })
  );
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);

  // ── Roads ───────────────────────────────────────────────────
  const roadMat = new THREE.MeshStandardMaterial({ color: 0x9e8c6c, roughness: 0.95 });

  // Main north–south road
  const mainRoad = new THREE.Mesh(new THREE.PlaneGeometry(8, 180), roadMat);
  mainRoad.rotation.x = -Math.PI / 2;
  mainRoad.position.set(0, 0.02, -55);
  mainRoad.receiveShadow = true;
  scene.add(mainRoad);

  // Cross-roads at each zone (wider east–west strips)
  [0, -32, -40, -48, -84, -120].forEach(z => {
    const cross = new THREE.Mesh(new THREE.PlaneGeometry(26, 5), roadMat);
    cross.rotation.x = -Math.PI / 2;
    cross.position.set(0, 0.02, z);
    cross.receiveShadow = true;
    scene.add(cross);
  });

  // Town Square plaza
  const plaza = new THREE.Mesh(
    new THREE.PlaneGeometry(18, 18),
    new THREE.MeshStandardMaterial({ color: 0xb8a88a, roughness: 0.95 })
  );
  plaza.rotation.x = -Math.PI / 2;
  plaza.position.set(0, 0.015, 0);
  scene.add(plaza);

  // Research quarter stone plaza
  const rPlaza = new THREE.Mesh(
    new THREE.PlaneGeometry(22, 18),
    new THREE.MeshStandardMaterial({ color: 0x7a7a8a, roughness: 0.95 })
  );
  rPlaza.rotation.x = -Math.PI / 2;
  rPlaza.position.set(0, 0.015, -82);
  scene.add(rPlaza);

  // Tavern warm ground
  const tGround = new THREE.Mesh(
    new THREE.PlaneGeometry(22, 22),
    new THREE.MeshStandardMaterial({ color: 0x5c3d2e, roughness: 1 })
  );
  tGround.rotation.x = -Math.PI / 2;
  tGround.position.set(0, 0.015, -120);
  scene.add(tGround);

  // ── Lighting ────────────────────────────────────────────────
  scene.add(new THREE.AmbientLight(0xffe4b5, 0.5));

  const sun = new THREE.DirectionalLight(0xffd580, 1.3);
  sun.position.set(10, 20, 10);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.far   = 200;
  sun.shadow.camera.left  = -60;
  sun.shadow.camera.right =  60;
  sun.shadow.camera.top   =  60;
  sun.shadow.camera.bottom = -60;
  scene.add(sun);

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

  // ── Vortex orb (Research) ───────────────────────────────────
  const orb = new THREE.Mesh(
    new THREE.SphereGeometry(0.5, 16, 16),
    new THREE.MeshStandardMaterial({
      color: 0x06d6a0, emissive: 0x06d6a0, emissiveIntensity: 1,
    })
  );
  orb.position.set(0, 12, -86);
  scene.add(orb);
  const orbLight = new THREE.PointLight(0x06d6a0, 1.2, 12);
  orbLight.position.copy(orb.position);
  scene.add(orbLight);

  // ── Tavern tables & fire ────────────────────────────────────
  const tableMat = new THREE.MeshStandardMaterial({ color: 0x6b4226, roughness: 0.8 });
  [[-3, -118], [3, -118], [0, -122]].forEach(([x, z]) => {
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
  fireGlow.position.set(0, 2, -120);
  scene.add(fireGlow);

  // ── Lamps ───────────────────────────────────────────────────
  // Town Square
  [[-4, 4], [4, 4], [-4, -4], [4, -4]].forEach(([x, z]) => addLamp(scene, x, z));
  // Settlement
  for (let dz = -5; dz <= 5; dz++) {
    addLamp(scene, -3.5, -40 + dz * 3.5);
    addLamp(scene,  3.5, -40 + dz * 3.5);
  }
  // Research
  addLamp(scene, -4, -80);
  addLamp(scene,  4, -80);
  // Tavern
  addLamp(scene, -5, -116);
  addLamp(scene,  5, -116);

  // ── Trees ───────────────────────────────────────────────────
  [
    [-15,5],  [15,5],   [-20,-10], [20,-10],
    [-18,-30],[18,-25], [-15,-55], [15,-60],
    [-20,-70],[20,-75], [-18,-95], [18,-100],
    [-15,-110],[15,-115],[-20,-130],[20,-135],
    [-12,15], [12,15],  [-25,-45], [25,-40],
    [-30,0],  [30,-5],  [-28,-90], [28,-85],
    [-22,-120],[22,-125],
    [-35,-20],[35,-15], [-35,-60], [35,-55],
    [-35,-100],[35,-95],
  ].forEach(([x, z]) => scene.add(createTree(x, z, 0.8 + Math.random() * 0.6)));

  // ── Rocks ───────────────────────────────────────────────────
  [
    [-10,10],[10,12],[-12,-65],[12,-70],
    [-10,-105],[10,-108],[-8,-15],[8,-18],
    [-14,-88],[14,-92],[-8,-130],[8,-135],
  ].forEach(([x, z]) => scene.add(createRock(x, z, 0.6 + Math.random() * 0.8)));

  // ── Label System ────────────────────────────────────────────
  const labelsContainer = document.getElementById('labels-container');
  const labelSys = new LabelSystem(camera, labelsContainer);
  buildingMeta.forEach(bm => {
    labelSys.add(bm.data.label, new THREE.Vector3(bm.data.x, bm.data.h + 1.5, bm.data.z));
  });

  // ── Cart ────────────────────────────────────────────────────
  const cart = new Cart(scene, { x: 0, z: 30 });

  // ── Follow Camera ───────────────────────────────────────────
  const followCam = new FollowCamera(camera);

  // ── Mobile Joystick ─────────────────────────────────────────
  if ('ontouchstart' in window) {
    const jsEl = document.getElementById('mobile-joystick');
    if (jsEl) jsEl.style.display = 'block';
    setupMobileJoystick(cart);
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

  // ── Zone Indicator ──────────────────────────────────────────
  const zoneIndicator = document.getElementById('zone-indicator');
  function updateZone() {
    const z = cart.getPosition().z;
    let name = 'Town Square';
    if (z < -100) name = 'The Tavern';
    else if (z < -60) name = 'Research Quarter';
    else if (z < -20) name = 'The Settlement';
    if (zoneIndicator) zoneIndicator.textContent = name;
  }

  // ── HUD Fast-Travel ─────────────────────────────────────────
  document.querySelectorAll('.hud-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const zone = ZONES[btn.dataset.zone];
      if (!zone) return;
      cart.teleportTo(zone.x, zone.z + 15, Math.PI, 1.8);
      document.querySelectorAll('.hud-btn').forEach(b =>
        b.classList.toggle('active', b === btn)
      );
    });
  });
  document.querySelector('.hud-btn[data-zone="square"]')?.classList.add('active');

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

    // Camera
    followCam.update(cart.getPosition(), cart.getRotation(), cart.getSpeed());

    // Labels
    labelSys.update(canvas.clientWidth, canvas.clientHeight);

    // Interaction
    updateInteraction();

    // Zone name
    updateZone();

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
