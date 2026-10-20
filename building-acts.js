/**
 * building-acts.js — each building acts out its project before its card opens
 *
 * When you press Enter at a door, the camera already eases toward the
 * building. In that moment (~2.5 s) the building performs what its project
 * does — chat bubbles out of the Parlour's lantern, slot boards flipping
 * over the court, a flight chart drawn in the air over the Forge — and then
 * the card slides in. Any key, click or tap skips straight to the card;
 * reduced motion skips the act entirely.
 *
 * The acts are built from three primitives, all in the building's own frame
 * (x right, z front, y up from its floor):
 *   bubble(text, at, from, dur, style)   a speech-bubble sprite that pops up and floats
 *   trail(points, from, dur, color)      a glowing line drawn along a path
 *   token(a, b, from, dur, color, arc)   a glowing bead flying from a to b on an arc
 *   tiles(at, n, from, dur)              a row of slot boards flipping green → red
 */
import * as THREE from 'three';

const V = (x, y, z) => new THREE.Vector3(x, y, z);

// ── bubble textures (canvas), cached by text + style ──────────────
const STYLES = {
  user: { bg: '#dcf8c6', ink: '#1d2a1d', edge: '#7fbf6a' },     // the visitor's message (WhatsApp green)
  bot:  { bg: '#fffaf0', ink: '#2b2d42', edge: '#c9a24a' },     // the project's reply
  sys:  { bg: '#2b2d42', ink: '#f4e4c1', edge: '#8b6914' },     // a command / log line
  good: { bg: '#e2f6e6', ink: '#1f4d2b', edge: '#3d9a4c' },     // a result
};
const texCache = new Map();
function bubbleTexture(text, style) {
  const key = style + '|' + text;
  if (texCache.has(key)) return texCache.get(key);
  const S = STYLES[style] || STYLES.bot;
  const font = '600 44px Nunito, "Segoe UI", system-ui, sans-serif';
  const c = document.createElement('canvas');
  const g = c.getContext('2d');
  g.font = font;
  const w = Math.ceil(g.measureText(text).width) + 64, h = 96;
  c.width = w; c.height = h + 18;
  g.font = font;
  const r = 30;
  g.fillStyle = S.bg; g.strokeStyle = S.edge; g.lineWidth = 5;
  g.beginPath();
  g.moveTo(r, 3); g.lineTo(w - r, 3); g.quadraticCurveTo(w - 3, 3, w - 3, r); g.lineTo(w - 3, h - r);
  g.quadraticCurveTo(w - 3, h - 3, w - r, h - 3); g.lineTo(w / 2 + 16, h - 3); g.lineTo(w / 2, h + 14); g.lineTo(w / 2 - 16, h - 3);
  g.lineTo(r, h - 3); g.quadraticCurveTo(3, h - 3, 3, h - r); g.lineTo(3, r); g.quadraticCurveTo(3, 3, r, 3); g.closePath();
  g.fill(); g.stroke();
  g.fillStyle = S.ink; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(text, w / 2, h / 2 + 2);
  const t = new THREE.CanvasTexture(c);
  const out = { tex: t, aspect: c.width / c.height };
  texCache.set(key, out);
  return out;
}

const ease = (x) => x * x * (3 - 2 * x);
const clamp01 = (x) => Math.max(0, Math.min(1, x));

// ── the acts (building frame; heights from the building's floor) ──
// `o` is the building's layout entry (roofTop is known once it's built).
const ACTS = {
  about: (A, o) => {
    A.bubble('Welcome, traveller', V(0, 7.5, o.d / 2 + 2), 0.1, 2.2, 'bot');
  },
  mavpose: (A) => {
    // the question, then the answer drawn in the air as a chart over the lane
    A.bubble('plot altitude vs battery?', V(-1.6, 7.6, 2.6), 0.0, 1.8, 'user');   // gone before the answer lands
    const alt = [], volt = [];
    for (let i = 0; i <= 40; i++) {
      const u = i / 40, x = -3.4 + u * 6.8;
      const a = u < 0.18 ? u / 0.18 : u < 0.78 ? 1 + Math.sin(u * 28) * 0.04 : Math.max(0, 1 - (u - 0.78) / 0.22);
      alt.push(V(x, 4.2 + a * 2.6, 3.4));
      volt.push(V(x, 4.2 + (1 - u * 0.55) * 2.0, 3.45));
    }
    A.trail([V(-3.4, 4.2, 3.4), V(3.4, 4.2, 3.4)], 0.5, 0.4, 0xf4e4c1, 0.035);    // the time axis
    A.trail(alt, 0.7, 1.2, 0xff6a3a, 0.1);
    A.trail(volt, 0.9, 1.2, 0x4aa8ff, 0.1);
    A.bubble('plot.png ✓', V(1.6, 7.6, 3.4), 1.9, 1.2, 'good');
  },
  ace: (A, o) => {
    // a WhatsApp exchange rising out of the lantern, in front of the dome
    const z = o.d / 2 + 1.5;
    A.token(V(0, o.roofTop - 1.6, 0), V(-3.0, 3.6, z), 0.0, 0.4, 0xc8ffd8, 0.6);
    A.bubble('court at 6 on saturday?', V(-3.0, 3.6, z), 0.2, 2.5, 'user');
    A.bubble('6:00 & 6:30 free · ₹250', V(3.0, 5.2, z), 0.8, 1.9, 'bot');
    A.bubble('book both', V(-3.0, 6.8, z), 1.35, 1.35, 'user');
    A.bubble('Booked ✅ reminder set', V(3.0, 8.4, z), 1.85, 0.85, 'good');
  },
  volley: (A) => {
    A.tiles(V(0, 3.8, 0), 8, 0.1, 2.0);
    A.bubble('booked live ✓', V(0, 5.6, 0), 1.6, 1.0, 'good');
  },
  xg: (A) => {
    // a shot from the edge of the box into the right-hand goal, then its xG
    A.token(V(2.2, 0.3, 1.0), V(5.6, 0.6, 0.1), 0.2, 0.9, 0xffffff, 1.6);
    A.bubble('xG 0.32', V(4.6, 4.4, 0.1), 0.9, 1.7, 'bot');
    A.bubble('GOAL ⚽ 1 in 3 go in', V(4.6, 6.3, 0.1), 1.5, 1.1, 'good');
  },
  instillgcs: (A, o) => {
    // radio calls from the tower, and a take-off line climbing beside it
    const z = o.d / 2 + 1.5;
    A.bubble('ARM ✓', V(-1.6, 4.6, z), 0.0, 2.6, 'sys');
    A.trail([V(2.8, 0.2, z), V(2.8, 3.5, z), V(2.8, 7.5, z)], 0.5, 0.8, 0x7dffcf);   // take-off to the dial height
    A.bubble('TAKE OFF · 20 m', V(-1.6, 6.5, z), 0.6, 2.0, 'sys');
    A.bubble('LAND ✓', V(-1.6, 8.4, z), 1.6, 1.0, 'good');
  },
  vortex: (A) => {
    // a detection ring sweeps round the tower's eye, kept low enough to stay in the framed view
    const ring = [];
    for (let i = 0; i <= 48; i++) { const a = i / 48 * Math.PI * 2; ring.push(V(Math.cos(a) * 2.6, 5.0, Math.sin(a) * 2.6)); }
    A.trail(ring, 0.1, 0.9, 0x7dffcf);
    A.bubble('YOLOv5: vortex 0.94', V(0, 5.2, 2.6), 0.4, 2.2, 'sys');
    A.bubble('3 models vote: core ✓', V(0, 7.8, 2.6), 1.3, 1.3, 'good');
  },
  aws: (A) => {
    // packages fly from the master to six workers and back
    const master = V(0, 9.4, 0);
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2, w = V(Math.sin(a) * 2.5, 6.2, Math.cos(a) * 2.5);
      A.token(master, w, 0.1 + i * 0.08, 0.6, 0xffc65a, 1.2);
      A.token(w, master, 1.2 + i * 0.08, 0.6, 0x7dffcf, 1.2);
    }
    A.bubble('matrix split · 6 workers', V(0, 7.0, 4.6), 0.2, 1.6, 'sys');
    A.bubble('gathered ✓', V(0, 8.9, 4.6), 1.8, 0.9, 'good');
  },
  ledger: (A) => {
    // bills ride from the vault (TallyPrime) to the counting room (Supabase)
    for (let i = 0; i < 5; i++) A.token(V(-2.4, 4.5, 0.95), V(2.4, 4.5, 0.95), 0.1 + i * 0.22, 0.8, 0xfff1c9, 0.6);
    A.bubble('overdue ≥ 30 days', V(-2.6, 6.6, 1.5), 0.0, 2.0, 'sys');
    A.bubble('who owes most?', V(2.6, 6.8, 1.5), 1.0, 1.6, 'user');
    A.bubble('synced ✓', V(2.6, 8.7, 1.5), 1.7, 0.9, 'good');
  },
  tinytots: (A, o) => {
    A.bubble('curriculum · gallery', V(-2.2, 5.2, 3.0), 0.0, 2.4, 'bot');
    A.token(V(3.6, 1.2, 3.4), V(1.6, 6.6, 3.0), 0.6, 0.9, 0xffffff, 1.4);
    A.bubble('enquiry sent ✉', V(2.6, 7.2, 3.0), 1.4, 1.2, 'good');
  },
};

/**
 * @param scene
 * @param {{ reducedMotion?: boolean }} opts
 */
export function createBuildingActs(scene, { reducedMotion = false } = {}) {
  const root = new THREE.Group();
  root.name = 'building-acts';
  scene.add(root);
  let act = null;           // { group, items[], t, dur, done }

  function frameOf(o) {
    const g = new THREE.Group();
    g.position.set(o.x, o.y || 0, o.z);
    g.rotation.y = o.heading || 0;
    root.add(g);
    return g;
  }

  function api(g, items) {
    return {
      bubble(text, at, from, dur, style = 'bot') {
        const { tex, aspect } = bubbleTexture(text, style);
        const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false, opacity: 0 });
        const s = new THREE.Sprite(mat);
        s.center.set(0.5, 0);
        s.position.copy(at);
        s.renderOrder = 20;
        g.add(s);
        const H = 1.55;
        items.push({ from, dur, update(u) {
          const pop = clamp01(u / 0.12), out = clamp01((u - 0.85) / 0.15);
          const k = ease(pop) * (1 + 0.12 * Math.sin(Math.min(1, pop) * Math.PI));
          s.scale.set(H * aspect * k, H * k, 1);
          s.position.y = at.y + u * 0.35;
          mat.opacity = pop * (1 - out);
        } });
      },
      trail(points, from, dur, color, radius = 0.07) {
        const curve = new THREE.CatmullRomCurve3(points, false, 'centripetal');
        const segs = Math.max(8, points.length * 3);
        const geo = new THREE.TubeGeometry(curve, segs, radius, 6, false);
        const mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending, depthWrite: false });
        const m = new THREE.Mesh(geo, mat);
        m.renderOrder = 18;
        m.frustumCulled = false;
        const total = geo.index.count, perSeg = total / segs;
        geo.setDrawRange(0, 0);
        g.add(m);
        items.push({ from, dur: dur + 1.2, update(u) {
          const draw = clamp01(u * (dur + 1.2) / dur);
          geo.setDrawRange(0, Math.floor(ease(draw) * segs) * perSeg);
          mat.opacity = 0.95 * (1 - clamp01((u - 0.85) / 0.15));
        } });
      },
      token(a, b, from, dur, color, arc = 1) {
        const m = new THREE.Mesh(new THREE.SphereGeometry(0.26, 12, 8), new THREE.MeshBasicMaterial({ color, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
        m.renderOrder = 19;
        m.visible = false;
        g.add(m);
        const p = new THREE.Vector3();
        items.push({ from, dur, update(u) {
          m.visible = u > 0 && u < 1;
          const e = ease(u);
          p.lerpVectors(a, b, e); p.y += Math.sin(e * Math.PI) * arc;
          m.position.copy(p);
          m.scale.setScalar(0.7 + Math.sin(u * Math.PI) * 0.5);
        } });
      },
      tiles(at, n, from, dur) {
        const geo = new THREE.BoxGeometry(0.95, 0.62, 0.08);
        const boards = [];
        for (let i = 0; i < n; i++) {
          const mat = new THREE.MeshBasicMaterial({ color: 0x5fd17a, transparent: true, opacity: 0 });
          const b = new THREE.Mesh(geo, mat);
          b.position.set(at.x + (i - (n - 1) / 2) * 1.1, at.y, at.z);
          b.renderOrder = 19;
          g.add(b); boards.push(b);
        }
        const free = new THREE.Color(0x5fd17a), taken = new THREE.Color(0xe0574a);
        items.push({ from, dur: dur + 0.6, update(u) {
          const t = u * (dur + 0.6);
          boards.forEach((b, i) => {
            const flipAt = 0.35 + (i * 0.6) % (dur - 0.4);        // a scattered order, like bookings coming in
            const f = clamp01((t - flipAt) / 0.25);
            b.rotation.x = Math.sin(f * Math.PI) * 1.4;
            b.material.color.copy(f > 0.5 ? taken : free);
            b.material.opacity = clamp01(t / 0.3) * (1 - clamp01((u - 0.88) / 0.12));
          });
        } });
      },
    };
  }

  function clear() {
    if (!act) return;
    act.group.traverse(m => { if (m.isMesh || m.isSprite) { if (m.geometry) m.geometry.dispose(); m.material.dispose(); } });
    root.remove(act.group);
    act = null;
  }

  function finish() {
    if (!act) return;
    const done = act.done;
    clear();
    removeSkip();
    done();
  }
  function abort() {
    if (!act) return;
    const cancelled = act.cancelled;
    clear();
    removeSkip();
    if (cancelled) cancelled();
  }

  // any key, click or tap skips to the card; Escape backs out without opening it.
  // A click is swallowed whole so it doesn't land on the card's backdrop
  // (which would close it straight away).
  const skipKey = (e) => {
    if (!act || e.repeat) return;
    if (e.key === 'Escape') { e.stopPropagation(); e.preventDefault(); abort(); return; }
    if (act.t > 0.15) finish();
  };
  const skipClick = (e) => { if (act && act.t > 0.15) { e.stopPropagation(); e.preventDefault(); finish(); } };
  function addSkip() { window.addEventListener('keydown', skipKey, true); window.addEventListener('click', skipClick, true); }
  function removeSkip() { window.removeEventListener('keydown', skipKey, true); window.removeEventListener('click', skipClick, true); }

  return {
    get playing() { return !!act; },
    /** Play `projectId`'s act on building `o`, then call `done` (immediately with reduced motion or no act).
     *  `cancelled` runs instead of `done` when the player backs out (Escape / gamepad B). */
    play(projectId, o, done, cancelled) {
      if (act) finish();
      const script = ACTS[projectId];
      if (reducedMotion || !script) { done(); return; }
      const group = frameOf(o);
      const items = [];
      script(api(group, items), o);
      const dur = Math.max(...items.map(i => i.from + i.dur)) + 0.1;
      act = { group, items, t: 0, dur: Math.min(dur, 3.2), done, cancelled };
      items.forEach(i => i.update(0));
      addSkip();
    },
    /** Drop the act silently (no callbacks). */
    cancel() { clear(); removeSkip(); },
    /** Back out of the act without opening the card (gamepad B). */
    abort() { abort(); },
    /** Skip straight to the card (gamepad A). */
    skip() { if (act) finish(); },
    update(dt) {
      if (!act) return;
      act.t += dt;
      for (const i of act.items) i.update(clamp01((act.t - i.from) / i.dur));
      if (act.t >= act.dur) finish();
    },
  };
}
