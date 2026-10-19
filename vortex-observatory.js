/**
 * vortex-observatory.js — the Vortex Observatory (§2.14)
 *
 * The building stands for Vortex Core Detection: an object detector
 * (YOLOv5) draws boxes round vortex cores in fluid-dynamics images and an
 * ensemble classifier (AdaBoost) confirms them. So it's a round stone
 * observatory whose brass telescope points not at the stars but at a
 * vortex: a slowly turning funnel of teal mist hanging over the crest.
 * Every few seconds a dashed detection box snaps round the funnel with a
 * label and a confidence ("vortex 0.94"). Streamlines of light swirl round
 * the tower's foot, and an anemometer spins on the parapet.
 *
 *   buildObservatory()   the tower, dome, telescope, anemometer (its own
 *                        frame: ground at y = 0, door at +z)
 *   buildVortex()        the funnel + the detection box (world space;
 *                        kept out of the tower group so its occlusion box
 *                        stays the tower's size)
 *   buildStreamlines()   glowing spirals laid on the ground round the base
 */
import * as THREE from 'three';
import { mergeBufferGeometries } from 'https://cdn.jsdelivr.net/npm/three@0.150.0/examples/jsm/utils/BufferGeometryUtils.js';
import { standardMat } from './materials.js';
import { propMaterials } from './town-props.js';
import { stoneTexture } from './textures.js';

const TEAL = new THREE.Color(0x2de0c0);
const TOWER = { r0: 2.3, r1: 1.95, h: 6.6 };         // tapered round tower
const DOME_R = 1.95;
/** Where the vortex hangs, relative to the tower's base (local frame). */
export const VORTEX_OFFSET = new THREE.Vector3(3.5, 12.8, -3.5);     // off to the side, seen from the iso camera

// ── A scrolling, glowing ribbon shader (vortex + ground streamlines) ──
function ribbonMaterial({ stripes = 9, speed = 0.6, opacity = 0.75, edge = 0.5 } = {}) {
  return new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uColor: { value: TEAL.clone() }, uOpacity: { value: opacity } },
    vertexShader: /* glsl */`
      varying vec2 vUv;
      void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: /* glsl */`
      uniform float uTime; uniform vec3 uColor; uniform float uOpacity;
      varying vec2 vUv;
      void main() {
        float across = 1.0 - abs(vUv.y * 2.0 - 1.0);                 // soft edges across the ribbon
        float band = smoothstep(0.0, ${edge.toFixed(2)}, across);
        float s = fract(vUv.x * ${stripes.toFixed(1)} - uTime * ${speed.toFixed(2)});
        float streak = smoothstep(0.0, 0.25, s) * (1.0 - smoothstep(0.55, 1.0, s));
        float ends = smoothstep(0.0, 0.08, vUv.x) * (1.0 - smoothstep(0.88, 1.0, vUv.x));
        float a = band * (0.35 + 0.65 * streak) * ends * uOpacity;
        gl_FragColor = vec4(mix(uColor, vec3(1.0), streak * band * 0.18), a);
      }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
  });
}

/** A ribbon along points[] (Vector3), `width` along `up(i)`; u runs along it, v across. */
function ribbon(points, width, up) {
  const pos = [], uv = [], idx = [];
  points.forEach((p, i) => {
    const u = up(i);
    pos.push(p.x - u.x * width / 2, p.y - u.y * width / 2, p.z - u.z * width / 2,
             p.x + u.x * width / 2, p.y + u.y * width / 2, p.z + u.z * width / 2);
    const t = i / (points.length - 1);
    uv.push(t, 0, t, 1);
    if (i) { const a = (i - 1) * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
  });
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  return g;
}

// Dome panels: pale metal with seams
function domeTexture() {
  const cv = document.createElement('canvas');
  cv.width = 256; cv.height = 64;
  const c = cv.getContext('2d');
  c.fillStyle = '#c9d2db'; c.fillRect(0, 0, 256, 64);
  c.strokeStyle = '#8e9aa6'; c.lineWidth = 2;
  for (let i = 0; i <= 16; i++) { c.beginPath(); c.moveTo(i * 16, 0); c.lineTo(i * 16, 64); c.stroke(); }
  for (const y of [22, 44]) { c.beginPath(); c.moveTo(0, y); c.lineTo(256, y); c.stroke(); }
  return new THREE.CanvasTexture(cv);
}

/**
 * The observatory tower.
 * @returns {{ group, height, domeY, update(t:number): void }}
 */
export function buildObservatory(userData = null, { reducedMotion = false } = {}) {
  const g = new THREE.Group();
  const M = propMaterials();
  const add = (m, cast = true) => { m.castShadow = cast; m.receiveShadow = true; g.add(m); return m; };
  const stone = standardMat({ map: stoneTexture(), color: 0xb4bccb, roughness: 0.92 }, 'obsStone');

  // ── Tower: a lathe with a battered foot, banded, tiled texture ──
  {
    const prof = [
      new THREE.Vector2(0, 0), new THREE.Vector2(TOWER.r0 + 0.25, 0), new THREE.Vector2(TOWER.r0 + 0.2, 0.5),
      new THREE.Vector2(TOWER.r0, 0.7), new THREE.Vector2(TOWER.r1, TOWER.h), new THREE.Vector2(0, TOWER.h),
    ];
    const geo = new THREE.LatheGeometry(prof, 28);
    const uv = geo.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * (Math.PI * 2 * TOWER.r0 / 1.1), uv.getY(i) * (TOWER.h / 1.1));
    const body = add(new THREE.Mesh(geo, stone));
    if (userData) body.userData = userData;
  }
  const rAt = (y) => THREE.MathUtils.lerp(TOWER.r0, TOWER.r1, (y - 0.7) / (TOWER.h - 0.7));
  {
    const parts = [];
    { const y = 5.6, b = new THREE.CylinderGeometry(rAt(y) + 0.07, rAt(y) + 0.07, 0.16, 28); b.translate(0, y, 0); parts.push(b); }   // one string course
    // parapet ring with merlons round the dome's foot
    const ring = new THREE.CylinderGeometry(TOWER.r1 + 0.28, TOWER.r1 + 0.18, 0.45, 28); ring.translate(0, TOWER.h + 0.12, 0); parts.push(ring);
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2 + 0.13, r = TOWER.r1 + 0.2;
      const m = new THREE.BoxGeometry(0.4, 0.38, 0.22); m.rotateY(a); m.translate(Math.sin(a) * r, TOWER.h + 0.53, Math.cos(a) * r);
      parts.push(m);
    }
    add(new THREE.Mesh(mergeBufferGeometries(parts.map(p => p.index ? p.toNonIndexed() : p)), M.stoneDark));
  }
  // door + lintel, and lit windows climbing the tower
  {
    const door = new THREE.Mesh(new THREE.BoxGeometry(0.95, 1.7, 0.2), M.woodDoor);
    door.position.set(0, 0.95, rAt(1) - 0.02);
    add(door, false);
    const arch = new THREE.Mesh(new THREE.TorusGeometry(0.55, 0.1, 4, 10, Math.PI), M.stoneDark);
    arch.position.set(0, 1.8, rAt(1.8) + 0.02);
    add(arch);
    const win = standardMat({ color: 0xffd28a, emissive: 0xffb257, emissiveIntensity: 0.85, roughness: 0.6 }, 'obsWindow');
    const parts = [];
    for (const [y, a] of [[3.4, 0.55], [3.4, -2.4], [5.5, -0.5], [5.5, 2.2]]) {
      const p = new THREE.PlaneGeometry(0.42, 0.75);
      const r = rAt(y) + 0.02;
      p.rotateY(a); p.translate(Math.sin(a) * r, y, Math.cos(a) * r);
      parts.push(p);
    }
    add(new THREE.Mesh(mergeBufferGeometries(parts), win), false);
  }

  // ── Dome with an open shutter, on a turntable ──────────────────
  const domeY = TOWER.h + 0.3;
  const dome = new THREE.Group();
  dome.position.y = domeY;
  const GAP = 0.6;
  {
    const shell = new THREE.SphereGeometry(DOME_R, 32, 12, Math.PI / 2 + GAP / 2, Math.PI * 2 - GAP, 0, Math.PI / 2);
    const tex = domeTexture(); tex.wrapS = THREE.RepeatWrapping; tex.repeat.set(2, 1);
    const shellMesh = new THREE.Mesh(shell, new THREE.MeshStandardMaterial({ map: tex, metalness: 0.15, roughness: 0.65, side: THREE.DoubleSide }));
    shellMesh.castShadow = true;
    dome.add(shellMesh);
    // dark interior seen through the slit
    const inner = new THREE.Mesh(new THREE.SphereGeometry(DOME_R - 0.12, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), standardMat({ color: 0x141820, roughness: 1 }, 'obsInterior'));
    dome.add(inner);
    // shutter leaves standing open either side of the slit
    const leafGeo = new THREE.TorusGeometry(DOME_R + 0.03, 0.07, 4, 14, Math.PI / 2);
    for (const s of [-1, 1]) {
      const leaf = new THREE.Mesh(leafGeo, M.iron);
      leaf.rotation.y = s * (GAP / 2) - Math.PI / 2;          // a meridian along the slit's edge
      dome.add(leaf);
    }
  }
  // the telescope: a brass tube out through the slit
  const scope = new THREE.Group();
  {
    const brass = standardMat({ color: 0xc9a25a, metalness: 0.75, roughness: 0.35 }, 'brass');
    const tube = new THREE.CylinderGeometry(0.2, 0.27, 2.9, 14); tube.rotateX(Math.PI / 2); tube.translate(0, 0, 1.1);
    const lens = new THREE.CylinderGeometry(0.3, 0.3, 0.18, 14); lens.rotateX(Math.PI / 2); lens.translate(0, 0, 2.55);
    const eyepiece = new THREE.CylinderGeometry(0.08, 0.08, 0.4, 8); eyepiece.rotateX(Math.PI / 2); eyepiece.translate(0, 0.12, -0.4);
    const t = new THREE.Mesh(mergeBufferGeometries([tube, lens, eyepiece]), brass);
    t.castShadow = true;
    scope.add(t);
    const mount = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.22, 0.6, 8), M.iron);
    mount.position.y = -0.3;
    scope.add(mount);
    scope.position.set(0, 0.55, 0);
  }
  dome.add(scope);
  g.add(dome);
  // aim dome + scope at the vortex
  const aim = VORTEX_OFFSET.clone().sub(new THREE.Vector3(0, domeY + 0.55, 0));
  const yaw0 = Math.atan2(aim.x, aim.z), pitch = Math.atan2(aim.y, Math.hypot(aim.x, aim.z));
  scope.rotation.x = -pitch;

  // ── Anemometer on the parapet ──────────────────────────────────
  const cups = new THREE.Group();
  {
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.045, 1.2, 6), M.iron);
    const ax = 1.55, az = 1.35;
    mast.position.set(ax, TOWER.h + 0.9, az);
    add(mast, false);
    cups.position.set(ax, TOWER.h + 1.52, az);
    const parts = [];
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2;
      const arm = new THREE.BoxGeometry(0.5, 0.03, 0.03); arm.translate(0.25, 0, 0); arm.rotateY(a); parts.push(arm.toNonIndexed());
      const cup = new THREE.SphereGeometry(0.09, 8, 4, 0, Math.PI * 2, 0, Math.PI / 2); cup.rotateZ(Math.PI / 2); cup.translate(0.5, 0, 0); cup.rotateY(a); parts.push(cup.toNonIndexed());
    }
    cups.add(new THREE.Mesh(mergeBufferGeometries(parts), M.iron));
  }
  g.add(cups);

  return {
    group: g,
    height: domeY + DOME_R,
    domeY,
    update(t) {
      if (reducedMotion) { dome.rotation.y = yaw0; return; }
      dome.rotation.y = yaw0 + Math.sin(t * 0.23) * 0.12;      // tracks the vortex a little
      cups.rotation.y = -t * 5;
    },
  };
}

// Label for the detection box
function labelCanvas() {
  const cv = document.createElement('canvas');
  cv.width = 256; cv.height = 64;
  return cv;
}
function drawLabel(cv, conf) {
  const c = cv.getContext('2d');
  c.clearRect(0, 0, 256, 64);
  c.fillStyle = '#39ff88'; c.fillRect(0, 8, 210, 48);
  c.fillStyle = '#0b2a1a'; c.font = 'bold 30px "Courier New", monospace'; c.textBaseline = 'middle';
  c.fillText(`vortex ${conf.toFixed(2)}`, 10, 33);
}

/**
 * The vortex funnel and its detection box, in world space.
 * @param {THREE.Vector3} centre   middle of the funnel
 * @returns {{ group, light: THREE.Vector3, update(t:number, camera:THREE.Camera): void }}
 */
export function buildVortex(centre, { reducedMotion = false } = {}) {
  const g = new THREE.Group();
  g.position.copy(centre);
  const H = 5.2, R0 = 0.3, R1 = 3.1, TURNS = 2.2, N = 5;
  const funnel = new THREE.Group();
  const mat = ribbonMaterial({ stripes: 7, speed: 0.45, opacity: 0.6 });
  const geos = [];
  for (let k = 0; k < N; k++) {
    const pts = [];
    for (let i = 0; i <= 90; i++) {
      const t = i / 90, a = (k / N) * Math.PI * 2 + t * TURNS * Math.PI * 2;
      const r = THREE.MathUtils.lerp(R0, R1, Math.pow(t, 1.4));
      pts.push(new THREE.Vector3(Math.cos(a) * r, -H / 2 + t * H + Math.sin(k * 1.7) * 0.15, Math.sin(a) * r));
    }
    geos.push(ribbon(pts, 0.32 + 0.05 * k, () => new THREE.Vector3(0, 1, 0)));
  }
  funnel.add(new THREE.Mesh(mergeBufferGeometries(geos), mat));
  // a faint core
  const core = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 0.12, H * 0.9, 16, 1, true),
    new THREE.MeshBasicMaterial({ color: 0x2de0c0, transparent: true, opacity: 0.12, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
  funnel.add(core);
  g.add(funnel);

  // ── The detection box: a dashed frame turned to face the camera ──
  const box = new THREE.Group();
  const frameMat = new THREE.LineDashedMaterial({ color: 0x39ff88, dashSize: 0.35, gapSize: 0.18, transparent: true, depthTest: false });
  const rect = (w, h) => {
    const p = [[-w / 2, -h / 2], [w / 2, -h / 2], [w / 2, h / 2], [-w / 2, h / 2], [-w / 2, -h / 2]].map(([x, y]) => new THREE.Vector3(x, y, 0));
    const l = new THREE.Line(new THREE.BufferGeometry().setFromPoints(p), frameMat);
    l.computeLineDistances();
    return l;
  };
  let frame = rect(1, 1);
  box.add(frame);
  // solid corner ticks
  const tickMat = new THREE.LineBasicMaterial({ color: 0x39ff88, transparent: true, depthTest: false });
  const ticks = new THREE.LineSegments(new THREE.BufferGeometry(), tickMat);
  box.add(ticks);
  const cv = labelCanvas();
  const labelTex = new THREE.CanvasTexture(cv);
  const label = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 0.55),
    new THREE.MeshBasicMaterial({ map: labelTex, transparent: true, depthTest: false }));
  box.add(label);
  box.renderOrder = 10; frame.renderOrder = ticks.renderOrder = label.renderOrder = 10;
  g.add(box);

  let W = 6.8, Hb = 6.0;
  const setBox = (w, h, conf) => {
    W = w; Hb = h;
    box.remove(frame); frame.geometry.dispose();
    frame = rect(w, h); frame.renderOrder = 10; box.add(frame);
    const k = 0.7, c = [];
    for (const [sx, sy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
      const x = sx * w / 2, y = sy * h / 2;
      c.push(x, y, 0, x - sx * k, y, 0, x, y, 0, x, y - sy * k, 0);
    }
    ticks.geometry.dispose();
    ticks.geometry = new THREE.BufferGeometry();
    ticks.geometry.setAttribute('position', new THREE.Float32BufferAttribute(c, 3));
    label.position.set(-w / 2 + 1.1, h / 2 + 0.32, 0);
    drawLabel(cv, conf);
    labelTex.needsUpdate = true;
  };
  setBox(W, Hb, 0.94);

  const CYCLE = 5.5;
  let lastCycle = -1;
  const rng = (n) => { const x = Math.sin(n * 91.7) * 43758.5; return x - Math.floor(x); };
  return {
    group: g,
    light: g.position,
    update(t, camera) {
      mat.uniforms.uTime.value = t;
      if (!reducedMotion) funnel.rotation.y = -t * 0.55;
      if (camera) box.quaternion.copy(camera.quaternion);
      // every few seconds: the box blinks off, then snaps back re-sized with a new score
      const n = Math.floor(t / CYCLE), ph = t - n * CYCLE;
      if (n !== lastCycle) {
        lastCycle = n;
        setBox(6.4 + rng(n) * 1.0, 5.6 + rng(n + 7) * 0.9, 0.86 + rng(n + 3) * 0.13);
      }
      const on = ph > 0.45 || (ph > 0.15 && ph < 0.25);       // a quick flicker as it re-detects
      box.visible = on;
    },
  };
}

/**
 * Glowing streamlines swirling round the tower's foot, draped on the ground.
 * @returns {{ mesh: THREE.Mesh, update(t:number): void }}
 */
export function buildStreamlines(cx, cz, heightAt, { reducedMotion = false } = {}) {
  const mat = ribbonMaterial({ stripes: 5, speed: 0.35, opacity: 0.6, edge: 0.6 });
  const geos = [];
  const N = 6;
  for (let k = 0; k < N; k++) {
    const pts = [];
    const a0 = (k / N) * Math.PI * 2, rA = 2.75 + (k % 2) * 0.35;
    for (let i = 0; i <= 40; i++) {
      const t = i / 40, a = a0 + t * 1.9, r = rA + t * 0.9;
      const x = cx + Math.cos(a) * r, z = cz + Math.sin(a) * r;
      pts.push(new THREE.Vector3(x, heightAt(x, z) + 0.44, z));      // just over the lawn's pile
    }
    // width lies flat: across = outward from the centre
    geos.push(ribbon(pts, 0.28, (i) => new THREE.Vector3(pts[i].x - cx, 0, pts[i].z - cz).normalize()));
  }
  const mesh = new THREE.Mesh(mergeBufferGeometries(geos), mat);
  mesh.renderOrder = 2;
  return { mesh, update(t) { mat.uniforms.uTime.value = reducedMotion ? 0 : t; } };
}
