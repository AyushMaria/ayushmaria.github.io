/**
 * tiny-tots.js — Tiny Tots Academy (§2.14)
 *
 * The building stands for TinyTots, a real kindergarten's website:
 * semantic, accessible, mobile-first, built so parents can find the
 * school. So it's a chunky storybook schoolhouse — steep red roof, a bell
 * cupola, a lit clock in the front gable, primary-coloured shutters, a
 * round-topped blue door with an access ramp and handrail, ABC blocks by
 * the door — with a fenced playground beside it: a rainbow arch over the
 * gate, a slide, a swing that rocks, and two kites bobbing overhead. The
 * bell swings and rings once when the cart pulls up.
 *
 * Frame: the plot's centre at the origin, ground at y = 0, front (+z)
 * towards Tower Lane. The school takes local x > 0 (SCHOOL), the
 * playground x < 0 (PLAY). ~14 draw calls.
 */
import * as THREE from 'three';
import { mergeBufferGeometries } from 'https://cdn.jsdelivr.net/npm/three@0.150.0/examples/jsm/utils/BufferGeometryUtils.js';
import { standardMat } from './materials.js';
import { propMaterials, gableRoofGeometry } from './town-props.js';
import { plasterTexture } from './textures.js';

const SCHOOL = { cx: 2.75, w: 7, d: 5, h: 3.4, plinth: 0.35 };
const PLAY = { x0: -6.2, x1: -0.95, d: 5.2 };
const ROOF_H = 3.0;

const box = (w, h, d, x, y, z) => { const b = new THREE.BoxGeometry(w, h, d); b.translate(x, y, z); return b; };
const ni = (g) => (g.index ? g.toNonIndexed() : g);
const RED = 0xd8462f, YELLOW = 0xf2c230, BLUE = 0x2f6c9f, GREEN = 0x3d9a4c;

function clockTexture() {
  const cv = document.createElement('canvas');
  cv.width = cv.height = 128;
  const c = cv.getContext('2d');
  c.fillStyle = '#fff6dc'; c.beginPath(); c.arc(64, 64, 62, 0, Math.PI * 2); c.fill();
  c.strokeStyle = '#2f6c9f'; c.lineWidth = 6; c.stroke();
  c.fillStyle = '#2b1d14';
  for (let i = 0; i < 12; i++) { const a = (i / 12) * Math.PI * 2; c.fillRect(64 + Math.sin(a) * 50 - 3, 64 - Math.cos(a) * 50 - 3, 6, 6); }
  return new THREE.CanvasTexture(cv);
}
function letterTexture(ch, bg) {
  const cv = document.createElement('canvas');
  cv.width = cv.height = 64;
  const c = cv.getContext('2d');
  c.fillStyle = bg; c.fillRect(0, 0, 64, 64);
  c.strokeStyle = 'rgba(0,0,0,0.25)'; c.lineWidth = 4; c.strokeRect(2, 2, 60, 60);
  c.fillStyle = '#ffffff'; c.font = 'bold 44px Georgia, serif'; c.textAlign = 'center'; c.textBaseline = 'middle';
  c.fillText(ch, 32, 35);
  return new THREE.CanvasTexture(cv);
}

/**
 * @returns {{ group, height, glow: THREE.Vector3, update(t:number, cart?: THREE.Vector3): void }}
 */
export function buildTinyTots(userData = null, { reducedMotion = false } = {}) {
  const g = new THREE.Group();
  const M = propMaterials();
  const add = (m, cast = true) => { m.castShadow = cast; m.receiveShadow = true; g.add(m); return m; };
  const S = SCHOOL, fz = S.d / 2, P = S.plinth;
  const plaster = standardMat({ map: plasterTexture(), color: 0xfbe9b8, roughness: 0.9 }, 'ttPlaster');
  const roofMat = standardMat({ map: M.tile.map, color: 0xf08a6c, roughness: 0.8 }, 'ttRoof');
  const white = standardMat({ color: 0xf6f1e6, roughness: 0.8 }, 'ttWhite');
  const glowWin = standardMat({ color: 0xffd28a, emissive: 0xffb257, emissiveIntensity: 0.6, roughness: 0.5 }, 'ttWindow');

  // ── The schoolhouse ───────────────────────────────────────────
  {
    const body = box(S.w, S.h, S.d, S.cx, P + S.h / 2, 0);
    const uv = body.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * 3, uv.getY(i) * 1.6);
    const m = add(new THREE.Mesh(body, plaster));
    if (userData) m.userData = userData;
    add(new THREE.Mesh(box(S.w + 0.2, P, S.d + 0.2, S.cx, P / 2, 0), M.stoneDark));
    // steep roof, ridge along x
    const roof = gableRoofGeometry(S.d + 1.0, ROOF_H, S.w + 0.8);
    roof.rotateY(Math.PI / 2);
    roof.translate(S.cx, P + S.h - 0.02, 0);
    add(new THREE.Mesh(roof, [roofMat, plaster]));
    // front cross-gable over the door (holds the clock)
    const fg = { w: 2.6, d: 1.2, h: S.h + 0.6 };
    add(new THREE.Mesh(box(fg.w, fg.h, fg.d, S.cx, P + fg.h / 2, fz + fg.d / 2 - 0.3), plaster));
    const fr = gableRoofGeometry(fg.w + 0.5, 1.7, fg.d + 0.5);
    fr.translate(S.cx, P + fg.h - 0.02, fz + fg.d / 2 - 0.3);
    add(new THREE.Mesh(fr, [roofMat, plaster]));
  }
  const gableZ = fz + 1.2 - 0.3 + 0.25 + 0.02;        // front face of the cross-gable's roof end

  // clock in the front gable, lit, with real-time hands
  const clockY = P + S.h + 0.6 + 0.62;
  const hands = [];
  {
    const face = new THREE.Mesh(new THREE.CircleGeometry(0.5, 24), new THREE.MeshStandardMaterial({ map: clockTexture(), emissive: 0xfff2c8, emissiveIntensity: 0.55, roughness: 0.6 }));
    face.position.set(S.cx, clockY, gableZ);
    g.add(face);
    const rim = new THREE.Mesh(new THREE.TorusGeometry(0.52, 0.05, 6, 24), standardMat({ color: BLUE, roughness: 0.6 }, 'ttBlue'));
    rim.position.copy(face.position);
    g.add(rim);
    for (const [len, w] of [[0.27, 0.05], [0.4, 0.035]]) {
      const hand = new THREE.Mesh(box(w, len, 0.02, 0, len / 2, 0), standardMat({ color: 0x2b1d14 }, 'ttHand'));
      hand.position.set(S.cx, clockY, gableZ + 0.02);
      g.add(hand); hands.push(hand);
    }
  }

  // windows with primary-coloured shutters, and the round-topped blue door
  {
    const panes = [], frames = [];
    const shutters = { [RED]: [], [YELLOW]: [], [BLUE]: [] };
    const cols = [RED, YELLOW, BLUE, RED];
    [-2.85, -1.8, 1.8, 2.85].forEach((dx, i) => {
      const x = S.cx + dx, y = P + 1.75;
      const p = new THREE.PlaneGeometry(0.6, 0.9); p.translate(x, y, fz + 0.01); panes.push(p);
      frames.push(ni(box(0.06, 0.95, 0.05, x, y, fz + 0.04)), ni(box(0.64, 0.06, 0.05, x, y, fz + 0.04)), ni(box(0.74, 0.08, 0.12, x, y - 0.5, fz + 0.06)));
      for (const s of [-1, 1]) shutters[cols[i]].push(ni(box(0.2, 0.92, 0.05, x + s * 0.41, y, fz + 0.04)));
    });
    // side windows
    for (const sx of [-1, 1]) for (const dz of [-1, 1]) {
      const p = new THREE.PlaneGeometry(0.62, 0.9); p.rotateY(sx * Math.PI / 2); p.translate(S.cx + sx * (S.w / 2 + 0.01), P + 1.75, dz * 1.1); panes.push(p);
    }
    add(new THREE.Mesh(mergeBufferGeometries(panes), glowWin), false);
    add(new THREE.Mesh(mergeBufferGeometries(frames), white), false);
    for (const [col, parts] of Object.entries(shutters)) add(new THREE.Mesh(mergeBufferGeometries(parts), standardMat({ color: +col, roughness: 0.7 }, 'ttShutter' + col)), false);
    const dz = fz + 0.9 + 0.02;
    const door = new THREE.Mesh(mergeBufferGeometries([ni(box(1.0, 1.55, 0.08, S.cx, P + 0.78, dz)), ni((() => { const c = new THREE.CylinderGeometry(0.5, 0.5, 0.08, 16, 1, false, -Math.PI / 2, Math.PI); c.rotateX(-Math.PI / 2); c.translate(S.cx, P + 1.55, dz); return c; })())]),
      standardMat({ color: BLUE, roughness: 0.6 }, 'ttBlue'));
    add(door, false);
    const knob = new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 6), standardMat({ color: YELLOW, metalness: 0.5, roughness: 0.4 }, 'ttKnob'));
    knob.position.set(S.cx + 0.3, P + 0.85, dz + 0.06);
    g.add(knob);
    // access ramp along the front (from the door landing down towards +x), with a handrail
    const landing = box(1.6, P, 1.0, S.cx, P / 2, dz + 0.5);
    const rampLen = 2.6, ramp = new THREE.BoxGeometry(rampLen, 0.08, 1.0);
    ramp.rotateZ(-Math.atan2(P, rampLen)); ramp.translate(S.cx + 0.8 + rampLen / 2, P / 2, dz + 0.5);
    add(new THREE.Mesh(mergeBufferGeometries([ni(landing), ni(ramp)]), M.stone));
    const rail = [];
    for (let k = 0; k <= 3; k++) { const x = S.cx + 0.8 + (k / 3) * rampLen, y = P * (1 - k / 3); rail.push(ni(box(0.05, 0.85, 0.05, x, y + 0.42, dz + 1.0))); }
    const top = new THREE.BoxGeometry(rampLen + 0.1, 0.05, 0.05); top.rotateZ(-Math.atan2(P, rampLen)); top.translate(S.cx + 0.8 + rampLen / 2, P / 2 + 0.85, dz + 1.0); rail.push(ni(top));
    add(new THREE.Mesh(mergeBufferGeometries(rail), standardMat({ color: YELLOW, roughness: 0.5 }, 'ttYellow')), false);
    // ABC blocks by the door
    [['A', '#d8462f', -1.0, 0.0, 0.2], ['B', '#2f6c9f', -1.45, 0.0, -0.3], ['C', '#3d9a4c', -1.2, 0.36, 0.5]].forEach(([ch, bg, ox, oy, ry]) => {
      const b = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.36, 0.36), new THREE.MeshStandardMaterial({ map: letterTexture(ch, bg), roughness: 0.7 }));
      b.position.set(S.cx + ox, 0.18 + oy, dz + 0.55); b.rotation.y = ry; b.castShadow = true;
      g.add(b);
    });
  }

  // ── Bell cupola on the ridge ──────────────────────────────────
  const bell = new THREE.Group();
  {
    const cy = P + S.h + ROOF_H - 0.35, cx = S.cx - 1.6;
    const parts = [box(1.1, 0.25, 1.1, cx, cy, 0)];
    for (const [x, z] of [[-0.42, -0.42], [0.42, -0.42], [-0.42, 0.42], [0.42, 0.42]]) parts.push(box(0.1, 0.95, 0.1, cx + x, cy + 0.6, z));
    add(new THREE.Mesh(mergeBufferGeometries(parts.map(ni)), white));
    const cap = new THREE.ConeGeometry(0.85, 0.75, 4); cap.rotateY(Math.PI / 4); cap.translate(cx, cy + 1.45, 0);
    add(new THREE.Mesh(cap, roofMat));
    const prof = [new THREE.Vector2(0.02, 0), new THREE.Vector2(0.3, 0), new THREE.Vector2(0.24, 0.08), new THREE.Vector2(0.18, 0.32), new THREE.Vector2(0.12, 0.44), new THREE.Vector2(0.0, 0.46)];
    const bm = new THREE.Mesh(new THREE.LatheGeometry(prof, 14), standardMat({ color: 0xc9a25a, metalness: 0.7, roughness: 0.35, side: THREE.DoubleSide }, 'brassDS'));
    bm.position.y = -0.46;
    bell.add(bm);
    bell.position.set(cx, cy + 1.05, 0);
    g.add(bell);
  }

  // ── The playground ────────────────────────────────────────────
  const swingSeat = new THREE.Group();
  const kites = [];
  {
    const px = (PLAY.x0 + PLAY.x1) / 2, pw = PLAY.x1 - PLAY.x0, hd = PLAY.d / 2;
    // soft surface
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(pw, PLAY.d), standardMat({ color: 0xd9c08a, roughness: 1 }, 'ttSand'));
    ground.rotation.x = -Math.PI / 2; ground.position.set(px, 0.03, 0); ground.receiveShadow = true;
    g.add(ground);
    // picket fence with a gate gap at the front
    const pickets = [];
    const run = (x0, z0, x1, z1) => {
      const len = Math.hypot(x1 - x0, z1 - z0), n = Math.max(2, Math.round(len / 0.32)), a = Math.atan2(x1 - x0, z1 - z0);
      for (let i = 0; i <= n; i++) { const x = x0 + (x1 - x0) * i / n, z = z0 + (z1 - z0) * i / n; pickets.push(ni(box(0.08, 0.7, 0.05, x, 0.35, z))); }
      const r = new THREE.BoxGeometry(0.05, 0.06, len); r.rotateY(a); r.translate((x0 + x1) / 2, 0.55, (z0 + z1) / 2); pickets.push(ni(r));
    };
    const gate = 1.2;
    run(PLAY.x0, -hd, PLAY.x1, -hd); run(PLAY.x0, -hd, PLAY.x0, hd);
    run(PLAY.x0, hd, px - gate / 2, hd); run(px + gate / 2, hd, PLAY.x1, hd);
    add(new THREE.Mesh(mergeBufferGeometries(pickets), white), false);
    // rainbow arch over the gate
    const bands = [RED, 0xf28c28, YELLOW, GREEN, BLUE, 0x7a4fb0];
    bands.forEach((col, i) => {
      const r = 1.05 - i * 0.07;
      const arc = new THREE.TorusGeometry(r, 0.035, 5, 20, Math.PI);
      const m = new THREE.Mesh(arc, standardMat({ color: col, roughness: 0.6 }, 'rainbow' + i));
      m.position.set(px, 0.75, hd);
      g.add(m);
    });
    for (const s of [-1, 1]) add(new THREE.Mesh(box(0.08, 0.8, 0.08, px + s * 1.05, 0.4, hd), white), false);
    // slide: ladder + platform + chute
    {
      const sx = PLAY.x0 + 1.0, sz = -0.9;
      const parts = [box(0.7, 0.08, 0.7, sx, 1.5, sz)];
      for (const [x, z] of [[-0.3, -0.3], [0.3, -0.3], [-0.3, 0.3], [0.3, 0.3]]) parts.push(box(0.07, 1.5, 0.07, sx + x, 0.75, sz + z));
      for (let k = 1; k <= 4; k++) parts.push(box(0.6, 0.05, 0.05, sx, k * 0.3, sz - 0.33));
      add(new THREE.Mesh(mergeBufferGeometries(parts.map(ni)), standardMat({ color: BLUE, roughness: 0.6 }, 'ttBlue')));
      const chute = new THREE.BoxGeometry(0.55, 0.06, 2.2); chute.rotateX(Math.atan2(1.45, 2.0)); chute.translate(sx, 0.78, sz + 1.25);
      const sides = [new THREE.BoxGeometry(0.05, 0.16, 2.2), new THREE.BoxGeometry(0.05, 0.16, 2.2)];
      sides.forEach((sg, i) => { sg.rotateX(Math.atan2(1.45, 2.0)); sg.translate(sx + (i ? 0.28 : -0.28), 0.84, sz + 1.25); });
      add(new THREE.Mesh(mergeBufferGeometries([ni(chute), ...sides.map(ni)]), standardMat({ color: YELLOW, roughness: 0.4 }, 'ttYellow')));
    }
    // swing: A-frame + a seat that rocks
    {
      const wx = PLAY.x1 - 1.5, wz = -0.6, top = 1.9;
      const frame = [box(1.9, 0.08, 0.08, wx, top, wz)];
      for (const s of [-1, 1]) for (const dz of [-0.45, 0.45]) { const leg = new THREE.BoxGeometry(0.07, 2.0, 0.07); leg.rotateX(dz > 0 ? -0.23 : 0.23); leg.translate(wx + s * 0.9, top / 2, wz + dz / 2); frame.push(leg); }
      add(new THREE.Mesh(mergeBufferGeometries(frame.map(ni)), standardMat({ color: RED, roughness: 0.6 }, 'ttRed')));
      swingSeat.position.set(wx, top, wz);
      for (const s of [-0.25, 0.25]) swingSeat.add(new THREE.Mesh(box(0.02, 1.4, 0.02, s, -0.7, 0), M.iron));
      const seat = new THREE.Mesh(box(0.6, 0.06, 0.25, 0, -1.42, 0), M.woodDoor); seat.castShadow = true;
      swingSeat.add(seat);
      g.add(swingSeat);
    }
    // two kites on strings above the playground
    [[RED, YELLOW, -2.2, 6.2, 0.6], [BLUE, GREEN, 0.4, 7.4, -0.7]].forEach(([c1, c2, ox, h, oz], i) => {
      const kite = new THREE.Group();
      const d = new THREE.BufferGeometry();
      d.setAttribute('position', new THREE.Float32BufferAttribute([0, 0.45, 0, -0.3, 0, 0, 0, -0.5, 0, 0.3, 0, 0, 0, 0.45, 0, 0, -0.5, 0], 3));
      d.setAttribute('color', new THREE.Float32BufferAttribute([...new THREE.Color(c1).toArray(), ...new THREE.Color(c1).toArray(), ...new THREE.Color(c1).toArray(), ...new THREE.Color(c2).toArray(), ...new THREE.Color(c2).toArray(), ...new THREE.Color(c2).toArray()], 3));
      d.computeVertexNormals();
      kite.add(new THREE.Mesh(d, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide })));
      const tail = new THREE.Mesh(box(0.03, 0.9, 0.01, 0, -0.95, 0), new THREE.MeshBasicMaterial({ color: c2 }));
      kite.add(tail);
      const anchor = new THREE.Vector3(px + ox * 0.5, 0.6, oz);
      const base = new THREE.Vector3(px + ox, h, oz - 1.5);
      kite.position.copy(base);
      const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints([anchor, base]), new THREE.LineBasicMaterial({ color: 0xf6f1e6, transparent: true, opacity: 0.8 }));
      g.add(kite, line);
      kites.push({ kite, line, base, anchor, ph: i * 1.7 });
    });
  }

  // ── Animation ─────────────────────────────────────────────────
  let ring = -10, wasNear = false;
  const update = (t, cartLocal) => {
    // clock shows the visitor's real time
    const now = new Date(), hr = (now.getHours() % 12) + now.getMinutes() / 60, mn = now.getMinutes() + now.getSeconds() / 60;
    hands[0].rotation.z = -(hr / 12) * Math.PI * 2;
    hands[1].rotation.z = -(mn / 60) * Math.PI * 2;
    if (reducedMotion) return;
    swingSeat.rotation.x = Math.sin(t * 1.9) * 0.45;
    for (const k of kites) {
      k.kite.position.set(k.base.x + Math.sin(t * 0.7 + k.ph) * 0.5, k.base.y + Math.sin(t * 1.3 + k.ph) * 0.35, k.base.z + Math.cos(t * 0.5 + k.ph) * 0.3);
      k.kite.rotation.z = Math.sin(t * 1.1 + k.ph) * 0.3;
      k.line.geometry.setFromPoints([k.anchor, k.kite.position]);
    }
    // the bell rings once when the cart pulls up (comes within 9 of the door)
    const near = !!cartLocal && Math.hypot(cartLocal.x - SCHOOL.cx, cartLocal.z - (fz + 2)) < 9;
    if (near && !wasNear) ring = t;
    wasNear = near;
    const u = t - ring;
    bell.rotation.z = u >= 0 && u < 2.4 ? Math.sin(u * 9) * 0.5 * (1 - u / 2.4) : 0;
  };
  update(0, null);

  return { group: g, height: P + S.h + ROOF_H + 1.5, glow: new THREE.Vector3(SCHOOL.cx, 1.8, fz + 1.4), update };
}
