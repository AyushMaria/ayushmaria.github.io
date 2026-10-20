/**
 * town-layout.js — the plan of the town ("Hilltop Burg", layout option B)
 *
 * Pure data + geometry, no three.js, so the docs map tool can import it
 * under Node too (tools/make-town-map.mjs).
 *
 * The town climbs a hill above a river. You cross a stone bridge at the
 * foot of the hill (south-east, the corner the isometric camera looks
 * from), and one switchback High Street winds up past the Market Terrace
 * and through the town gate to City Hall on the crest. A spring below the
 * crest feeds a stream that steps down the west slope in pools and small
 * falls, leaves through a water gate, turns the mill wheel and joins the
 * river.
 *
 * World axes: +x east, +z south (north is −z, the top of every map).
 * A heading h means "front faces (sin h, cos h)": 0 = south, π/2 = east.
 *
 * buildLayout() turns the hand-placed plan below into everything the
 * world needs: sampled road splines with heights, building headings and
 * floor levels, filler townhouses, the carved height field (roads cut level
 * across, flat pads under buildings and squares, river / stream / pond
 * channels), the wall path with its gates, the bridge, lamps, trees…
 */

// ════════════════════════════════════════════════════════════════
// THE PLAN
// ════════════════════════════════════════════════════════════════

/** The hill: an elliptical dome with a flat-ish crest. */
export const HILL = { cx: -6, cz: -30, rx: 62, rz: 56, rot: 0.15, height: 10, crest: 0.1 };

/** Terrain extent (± units) and where the cart may drive (a circle). */
export const WORLD = { ext: 140, playX: 0, playZ: 6, playR: 77 };

/** Where the cart appears: just south of the bridge, facing the town. */
export const START = { x: 18.6, z: 77.5 };

/**
 * Roads, in the order they're carved. `width` is the cobbled width.
 * The High Street starts beyond the river (the road in), crosses the
 * bridge and climbs to the crest square.
 */
export const ROADS = [
  { key: 'street', name: 'High Street', width: 6, kind: 'main', pts: [
    [21, 100], [19.5, 86], [18.5, 76], [16.4, 64], [14.8, 57], [13.1, 50.5], [8.5, 47.6], [-10, 49.4], [-30, 40], [-26, 27], [-10, 25.7], [4, 24.7], [20, 22.3],
    [32, 15], [27, 1], [10, -6], [-14, -6], [-26, -14], [-18, -24], [-8, -26] ] },
  { key: 'lowerLane', name: 'Forge Lane', width: 4.6, kind: 'lane', pts: [
    [32, 15], [42, 12], [52, 8.5], [64, 3] ] },
  { key: 'arenaLane', name: 'Arena Lane', width: 4.4, kind: 'lane', pts: [
    [14.2, 54.4], [17.4, 51.4], [22.5, 50.2], [30, 51], [38.5, 51], [45, 50] ] },
  { key: 'towerLane', name: 'Tower Lane', width: 4, kind: 'alley', pts: [
    [-26, -14], [-33, -19], [-34, -27.5] ] },
  { key: 'starLane', name: 'Star Lane', width: 3.6, kind: 'alley', pts: [
    [6, -27], [12, -24.5], [16, -25.5] ] },
];

/** Footpaths (dirt and stone, drivable): steps up the hill, path to the mill. */
export const PATHS = [
  { key: 'steps', width: 2.4, pts: [[-14, -6], [-12, -15], [-10, -23]] },
  { key: 'millPath', width: 2.2, pts: [[-30.5, 43.5], [-38, 48], [-44, 51]] },
];

/** Squares: cobbled, flat. */
export const PLAZAS = [
  { key: 'terrace', name: 'Market Terrace', warm: true,
    pts: [[-27.5, 28.5], [-12, 26], [-4.5, 33], [-7, 43], [-21.5, 44], [-28.5, 38.5]] },
  { key: 'crest', name: 'Crest Square', warm: true,
    pts: [[-18.5, -22.5], [6, -22.5], [8.5, -33.4], [-19.5, -33.4]] },
  // the sports quarter: a forecourt shared by the stadium and court gates,
  // and a fan square at the bridge head that Arena Lane runs through: food
  // stalls and the ticket kiosk on the north side, a statue by the river
  { key: 'arenaYard', name: 'Arena Forecourt',
    pts: [[36, 47.5], [44.3, 43.8], [47.2, 40.5], [48.5, 40.1], [49.5, 43.3], [57, 41.2], [58, 44.6], [52.5, 48.9], [45.6, 51.9], [40.4, 51.8], [36.8, 50.1]] },
  { key: 'fanSquare', name: 'Fan Square',
    pts: [[15.8, 47.8], [16.8, 42], [20.5, 37.8], [25.8, 36.3], [27.6, 37.4], [27.2, 44.6], [29.4, 48.4], [31.2, 52.8],
          [30.6, 56.8], [25, 58], [19.6, 57.4], [17.4, 55]],
    // by hand, so the inside of the turn off the bridge stays clear and the bunting has its lamp
    lamps: [[21, 39.3], [19.6, 45.6], [26.1, 45.7], [24.8, 56.4]] },
];

/**
 * Fan Square furniture (fan-square.js), kept back from Arena Lane so the
 * turn off the bridge stays open. Rotations face the square's middle.
 */
export const FAN_SQUARE = {
  centre: [21.5, 43.2],                       // the north side's middle: a club flag on a tall pole
  kiosk: [25.6, 42.6],                        // ticket booth by the stadium
  stalls: [[18.3, 41.6, false], [23.7, 38, true]],   // food stalls [x, z, red awning]
  // bunting: stall → the square's north lamp → stall → kiosk ([x, z, height])
  bunting: [[18.3, 41.6, 2.5], [21, 39.3, 3.2], [23.7, 38, 2.5], [25.6, 42.6, 2.7]],
  // by the river, south of the lane: a footballer on a plinth and benches facing the water
  statue: [27.6, 55.6],
  benches: [[20.6, 56.6], [30, 57.6]],
  fans: [[24.1, 42.6, 0], [23.3, 42.1, 1], [19.7, 42.6, 2], [26.4, 54.1, 1]],   // [x, z, variant]
};

/** The river along the foot of the hill (flows west). */
export const RIVER = {
  width: 8, level: -0.45, bed: -1.6,
  pts: [[118, -14], [92, 6], [76, 24], [66, 48], [44, 61], [16, 66], [-20, 70], [-52, 73.5], [-80, 68], [-120, 72], [-150, 70]],
};

/** The stream: spring below the crest → pools down the west slope → mill → river. */
export const STREAM = {
  width: 2.4,
  pts: [[-20, -46], [-29, -48], [-38, -45], [-45, -36], [-47, -22], [-46, -10], [-43, 2], [-42.5, 10],
        [-46, 20], [-51, 32], [-51, 46], [-49.5, 58], [-46, 74]],
  pools: [
    { x: -31, z: -47.8, rx: 3.4, rz: 2.5, rot: 0.1 },
    { x: -46.6, z: -27, rx: 3.3, rz: 2.4, rot: 1.45 },
    { x: -45.6, z: -6, rx: 3.2, rz: 2.4, rot: 1.62 },
    { x: -51, z: 40, rx: 4.5, rz: 3.1, rot: 1.55, mill: true },   // mill pond
  ],
};

/** The town wall: a wobbly ellipse round the hill, 6 high. */
export const WALL = { cx: -6, cz: -24, rx: 52, rz: 44, rot: 0.15, wobble: 0.05, seed: 9, points: 18, height: 6, thickness: 1.8 };

/** Fields outside the town (drawn as furrows). [x, z, w, d, rotDeg] */
export const FIELDS = [
  [57, -47, 18, 12, -20], [-63, -54, 14, 22, 25], [-67, 30, 12, 20, 10],
  [50, 82, 24, 11, -8], [-38, 86, 26, 12, 4], [80, -34, 16, 22, 15],
];

/** The stadium and the court face the river at this angle (its bend there). */
export const SPORTS_HEADING = 0.28;

/**
 * Portfolio buildings. Tudor buildings (`roof` set, ≤ 4 roof segs) get
 * cream plaster, dark timber and terracotta gables; `color` is the plaster
 * tint. `heading` (radians) is optional — without it the building turns to
 * face the nearest street or square. `zone` is filled in by buildLayout().
 */
export const BUILDINGS = [
  // Market Terrace
  { x: -42, z: 36, w: 10, h: 7.5, d: 8, color: 0xf3e4c4, roof: 0xc9553d, ridge: 'x',
    chimney: true, label: 'The Tavern', project: null, tavern: true, heading: Math.PI / 2 },
  { x: -20.5, z: 31.4, w: 4.5, h: 5.5, d: 4, color: 0xf6ead0, roof: 0xb84a36,
    label: 'Guild Board', project: null, heading: 0 },
  { x: -47, z: 51, w: 5.5, h: 5.5, d: 4.5, color: 0xeadbbd, roof: 0xb5503a,
    chimney: true, label: 'The Mill', project: null, mill: true, heading: Math.PI / 2 },

  // Lower Town (between the bridge and the walls)
  { x: 10, z: 29.6, w: 4.5, h: 5.5, d: 4, color: 0xefe0bf, roof: 0xc9553d,
    label: 'Adventurer Stats', project: null },
  // Ace's Concierge Parlour (concierge-parlour.js): an emerald octagonal
  // pavilion under a verdigris dome, a chat-bubble lantern on the cupola
  { x: -16, z: 56.5, w: 6.2, h: 5, d: 6.2, parlour: true,
    label: 'Concierge Parlour', project: 'ace' },
  // The Drone Forge (drone-forge.js): a kaji-ba — a swordsmith's smithy open
  // to the lane beside a drone workshop with the landing pad on its roof deck
  { x: 46.8, z: 4.4, w: 8.4, h: 5.6, d: 5, color: 0xe9d6ae, roof: 0xa9432f,
    chimney: true, forge: true, label: 'The Forge', project: 'mavpose', heading: 0.34 },
  // The sports quarter by the river (§2.14): the stadium and the pickleball
  // court share one heading, turned to follow the river's bend, and one
  // paved forecourt (ARENA_YARD) at the end of Arena Lane.
  // An oval football stadium (stadium.js) at 1.35× its base size: stands,
  // floodlights, a scoreboard and an xG shot map. w / d = stadiumFootprint(1.35).
  { x: 36.5, z: 40.2, w: 18.5, h: 3, d: 14.4, stadium: true, stadiumScale: 1.35,
    label: 'Prediction Colosseum', project: 'xg', heading: SPORTS_HEADING },
  // A small fenced pickleball court at the stadium's east shoulder, its gate
  // on the forecourt in line with the stadium's
  { x: 51.3, z: 36.4, w: 6.8, h: 1.2, d: 12.8, court: true,
    label: 'The Pickleball Court', project: 'volley', heading: SPORTS_HEADING },

  // Hillside (inside the walls)
  // The Tally Bridge Counting House (counting-house.js): a stone vault house
  // and a glassy counting room joined by a skybridge on arches
  { x: 0, z: -13.8, w: 11, h: 5.2, d: 5, countingHouse: true,
    label: 'Ledger Sanctum', project: 'ledger' },
  // A citadel made of copies of itself (cloud-citadel.js): a master tower
  // and six identical worker towers on a platform, wrapped in cloud
  { x: 20, z: -12, w: 7, h: 1, d: 7, citadel: true,
    label: 'Cloud Citadel', project: 'aws' },
  // Tiny Tots Academy (tiny-tots.js): a storybook schoolhouse (local
  // x > 0) with a fenced playground beside it (local x < 0), one plot
  { x: -38.61, z: -13.13, w: 12.5, h: 3.4, d: 5.4, schoolhouse: true,
    label: 'Tiny Tots Academy', project: 'tinytots', heading: 2.10 },

  // The Crest
  { x: -6, z: -39.6, w: 13.1, h: 5, d: 11.4, temple: true, templeScale: 0.78,
    label: 'City Hall', project: 'about', heading: 0 },
  // A round observatory (vortex-observatory.js) whose telescope tracks a
  // vortex of teal mist over the crest, boxed by a detector every few seconds
  { x: 16.5, z: -30, w: 4.6, h: 6.6, d: 4.6, observatory: true,
    label: 'Vortex Observatory', project: 'vortex', heading: 0 },
  // An airfield-style control tower (control-tower.js) for a drone ground
  // control station: glazed cab, radar, mast; a drone flies NAV_LOOP
  { x: -34, z: -31.4, w: 4.2, h: 11.5, d: 4.2, controlTower: true,
    label: "Navigator's Tower", project: 'instillgcs', heading: 0 },
];

/**
 * Navigator's Tower: the waypoint loop its drone flies (closed, through
 * these points, `fly` above the ground) and the orange waypoint flags on
 * the slope below it. The loop swings out over the stream and back past
 * the tower's south face.
 */
export const NAV_LOOP = {
  pts: [[-38.6, -35.6], [-39.8, -39.6], [-33, -43.2], [-26, -40], [-26.8, -35.6], [-30.5, -33.4], [-34.5, -34.8]],
  fly: 5.8,
  flags: [[-39.2, -36.8], [-33, -43.2], [-26, -40]],
};

/** Townhouses placed by hand (the rest are generated along the streets). */
export const EXTRA_HOUSES = [];

/** Clock tower: on the crest behind City Hall, the town's skyline mark. */
export const CLOCK_TOWER = { x: -6, z: -55, base: 6, height: 22 };

/** Zones (keys are shared with the HUD, achievements, audio and modal). */
export const ZONE_NAMES = {
  lower:    'Lower Town',
  terrace:  'Market Terrace',
  hillside: 'Hillside',
  crest:    'The Crest',
};

// ════════════════════════════════════════════════════════════════
// SMALL MATHS
// ════════════════════════════════════════════════════════════════

export function seededRng(seed) {
  let s = seed >>> 0;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
}
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const smoothstep = (a, b, v) => { const t = clamp((v - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const lerp = (a, b, t) => a + (b - a) * t;

/** Rotate a world offset into an ellipse / building frame. */
function toLocal(dx, dz, rot) {
  const c = Math.cos(rot), s = Math.sin(rot);
  return [dx * c + dz * s, -dx * s + dz * c];
}

export function pointInPoly(x, z, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, zi] = poly[i], [xj, zj] = poly[j];
    if ((zi > z) !== (zj > z) && x < (xj - xi) * (z - zi) / (zj - zi + 1e-12) + xi) inside = !inside;
  }
  return inside;
}
function segDist(px, pz, ax, az, bx, bz) {
  const dx = bx - ax, dz = bz - az, L = dx * dx + dz * dz;
  const t = L ? clamp(((px - ax) * dx + (pz - az) * dz) / L, 0, 1) : 0;
  const qx = ax + dx * t, qz = az + dz * t;
  return { d: Math.hypot(px - qx, pz - qz), t, x: qx, z: qz };
}
export function polyEdgeDist(x, z, poly) {
  let best = Infinity;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    best = Math.min(best, segDist(x, z, poly[j][0], poly[j][1], poly[i][0], poly[i][1]).d);
  }
  return best;
}
function polyCentroid(poly) {
  let x = 0, z = 0;
  for (const p of poly) { x += p[0]; z += p[1]; }
  return [x / poly.length, z / poly.length];
}

/** Distance from (x,z) to a building-style rectangle (0 inside). */
export function rectDist(x, z, r) {
  const [u, v] = toLocal(x - r.x, z - r.z, -r.heading);
  // toLocal(…, −h) gives (u = along "right", v = along "front") for heading h
  return Math.hypot(Math.max(Math.abs(u) - r.w / 2, 0), Math.max(Math.abs(v) - r.d / 2, 0));
}

// ── Catmull-Rom splines resampled by arc length ─────────────────
function cr(p0, p1, p2, p3, t) {
  const t2 = t * t, t3 = t2 * t;
  const f = (a, b, c, d) => 0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
  return [f(p0[0], p1[0], p2[0], p3[0]), f(p0[1], p1[1], p2[1], p3[1])];
}

/**
 * @returns {{ pts: {x,z,tx,tz,s}[], length, closed }}
 */
export function sampleSpline(ctrl, step = 1, closed = false) {
  const P = closed ? [ctrl[ctrl.length - 1], ...ctrl, ctrl[0], ctrl[1]] : [ctrl[0], ...ctrl, ctrl[ctrl.length - 1]];
  const dense = [];
  for (let i = 1; i < P.length - 2; i++) for (let k = 0; k < 24; k++) dense.push(cr(P[i - 1], P[i], P[i + 1], P[i + 2], k / 24));
  dense.push(closed ? dense[0] : P[P.length - 2]);
  const cum = [0];
  for (let i = 1; i < dense.length; i++) cum.push(cum[i - 1] + Math.hypot(dense[i][0] - dense[i - 1][0], dense[i][1] - dense[i - 1][1]));
  const length = cum[cum.length - 1];
  const n = Math.max(2, Math.round(length / step) + 1);
  const pts = [];
  let j = 0;
  for (let k = 0; k < n; k++) {
    const s = closed ? (k / n) * length : (k / (n - 1)) * length;
    while (j < cum.length - 2 && cum[j + 1] < s) j++;
    const seg = cum[j + 1] - cum[j] || 1;
    const f = clamp((s - cum[j]) / seg, 0, 1);
    pts.push({ x: lerp(dense[j][0], dense[j + 1][0], f), z: lerp(dense[j][1], dense[j + 1][1], f), s, tx: 0, tz: 0 });
  }
  for (let k = 0; k < pts.length; k++) {
    const a = pts[closed ? (k - 1 + pts.length) % pts.length : Math.max(0, k - 1)];
    const b = pts[closed ? (k + 1) % pts.length : Math.min(pts.length - 1, k + 1)];
    const L = Math.hypot(b.x - a.x, b.z - a.z) || 1;
    pts[k].tx = (b.x - a.x) / L; pts[k].tz = (b.z - a.z) / L;
  }
  let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
  for (const p of pts) { x0 = Math.min(x0, p.x); x1 = Math.max(x1, p.x); z0 = Math.min(z0, p.z); z1 = Math.max(z1, p.z); }
  return { pts, length, closed, box: [x0, x1, z0, z1] };
}

/** Distance to a path, or Infinity when it's certainly further than `max` (cheap reject). */
export function pathDist(path, x, z, max = Infinity) {
  const [x0, x1, z0, z1] = path.box;
  if (x < x0 - max || x > x1 + max || z < z0 - max || z > z1 + max) return Infinity;
  const P = path.pts, last = path.closed ? P.length : P.length - 1;
  let best = Infinity;
  for (let i = 0; i < last; i++) {
    const a = P[i], b = P[(i + 1) % P.length];
    const dx = b.x - a.x, dz = b.z - a.z, LL = dx * dx + dz * dz;
    let t = LL ? ((x - a.x) * dx + (z - a.z) * dz) / LL : 0;
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    const ex = a.x + dx * t - x, ez = a.z + dz * t - z, d2 = ex * ex + ez * ez;
    if (d2 < best) best = d2;
  }
  return Math.sqrt(best);
}

/** Nearest point on a sampled path: { d, x, z, s, i, t, tx, tz } (i = segment start). */
export function nearestOnPath(path, x, z) {
  const P = path.pts, last = path.closed ? P.length : P.length - 1;
  let best = { d: Infinity };
  for (let i = 0; i < last; i++) {
    const a = P[i], b = P[(i + 1) % P.length];
    const r = segDist(x, z, a.x, a.z, b.x, b.z);
    if (r.d < best.d) best = { d: r.d, x: r.x, z: r.z, i, t: r.t, s: a.s + (b.s - a.s + (b.s < a.s ? path.length : 0)) * r.t };
  }
  const a = P[best.i], b = P[(best.i + 1) % P.length];
  const L = Math.hypot(b.x - a.x, b.z - a.z) || 1;
  best.tx = (b.x - a.x) / L; best.tz = (b.z - a.z) / L;
  return best;
}
/** Value of a per-sample array at a nearestOnPath() result. */
function along(path, arr, near) {
  const j = (near.i + 1) % path.pts.length;
  return lerp(arr[near.i], arr[j], near.t);
}
/** Bounding box of a path, grown by `pad`. */
function pathBox(path, pad) {
  let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
  for (const p of path.pts) { x0 = Math.min(x0, p.x); x1 = Math.max(x1, p.x); z0 = Math.min(z0, p.z); z1 = Math.max(z1, p.z); }
  return [x0 - pad, x1 + pad, z0 - pad, z1 + pad];
}
function segIntersect(a, b, c, d) {
  const r = [b[0] - a[0], b[1] - a[1]], s = [d[0] - c[0], d[1] - c[1]];
  const den = r[0] * s[1] - r[1] * s[0];
  if (Math.abs(den) < 1e-9) return null;
  const t = ((c[0] - a[0]) * s[1] - (c[1] - a[1]) * s[0]) / den;
  const u = ((c[0] - a[0]) * r[1] - (c[1] - a[1]) * r[0]) / den;
  return (t >= 0 && t <= 1 && u >= 0 && u <= 1) ? { t, u } : null;
}

// ════════════════════════════════════════════════════════════════
// TERRAIN BEFORE THE TOWN: THE HILL
// ════════════════════════════════════════════════════════════════

/** 0 at the crest, 1 at the hill's foot (elliptical distance). */
export function hillE(x, z) {
  const [lx, lz] = toLocal(x - HILL.cx, z - HILL.cz, HILL.rot);
  return Math.hypot(lx / HILL.rx, lz / HILL.rz);
}

/** The untouched landscape: the hill plus a gentle roll in the meadows. */
export function naturalHeight(x, z) {
  const e = hillE(x, z);
  let h = HILL.height * (1 - smoothstep(HILL.crest, 1.0, e));
  const meadow = smoothstep(0.85, 1.3, e) * (1 - smoothstep(100, 132, Math.max(Math.abs(x), Math.abs(z))));
  const roll = 1 + Math.sin(x * 0.071 + 1.3) * Math.sin(z * 0.083 + 0.4) + 0.5 * Math.sin(x * 0.13 - z * 0.11 + 2.1);
  h += meadow * 0.38 * Math.max(0, roll);
  return h;
}

/** Inside the town wall? (the plain ellipse, `margin` > 0 shrinks it) */
export function insideWall(x, z, margin = 0) {
  const [lx, lz] = toLocal(x - WALL.cx, z - WALL.cz, WALL.rot);
  return Math.hypot(lx / (WALL.rx - margin), lz / (WALL.rz - margin)) < 1;
}

/** Which quarter of town a point is in. */
export function zoneKeyAt(x, z) {
  if (insideWall(x, z, 1)) return z < -21 ? 'crest' : 'hillside';
  if (Math.hypot(x + 18, z - 36) < 19 || (x < -30 && z > 10)) return 'terrace';
  return 'lower';
}

// ════════════════════════════════════════════════════════════════
// BUILD
// ════════════════════════════════════════════════════════════════

/**
 * Work out the whole town from the plan.
 * @param {{ res?: number }} [opts]  height-field grid spacing in world units
 */
export function buildLayout({ res = 1 } = {}) {
  const L = {};
  const rng = seededRng(20261019);

  // ── Roads, paths, squares ─────────────────────────────────────
  L.roads = ROADS.map(r => ({ ...r, hw: r.width / 2, path: sampleSpline(r.pts, 1) }));
  L.paths = PATHS.map(p => ({ ...p, hw: p.width / 2, path: sampleSpline(p.pts, 1) }));
  L.plazas = PLAZAS.map(p => ({ ...p, centroid: polyCentroid(p.pts) }));
  L.road = (key) => L.roads.find(r => r.key === key);

  // Road heights: the landscape under the centreline, smoothed along the
  // road. Side roads take the height of the road they branch from.
  const smoothArr = (arr, win) => {
    const out = arr.slice();
    for (let pass = 0; pass < 3; pass++) {
      const src = out.slice();
      for (let i = 0; i < src.length; i++) {
        let sum = 0, n = 0;
        for (let k = -win; k <= win; k++) { const j = clamp(i + k, 0, src.length - 1); sum += src[j]; n++; }
        out[i] = sum / n;
      }
    }
    return out;
  };
  const roadHeightAt = (x, z, except) => {
    let best = null;
    for (const r of L.roads) {
      if (r === except || !r.h) continue;
      const n = nearestOnPath(r.path, x, z);
      if (n.d < r.hw + 0.5 && (!best || n.d < best.d)) best = { d: n.d, h: along(r.path, r.h, n) };
    }
    return best;
  };
  for (const r of [...L.roads, ...L.paths]) {
    let h = smoothArr(r.path.pts.map(p => naturalHeight(p.x, p.z)), 4);
    const P = r.path.pts;
    for (const end of [0, P.length - 1]) {
      const a = roadHeightAt(P[end].x, P[end].z, r);
      if (!a) continue;
      const delta = a.h - h[end];
      h = h.map((v, i) => v + delta * Math.max(0, 1 - Math.abs(P[i].s - P[end].s) / 9));
    }
    r.h = h;
  }
  for (const pl of L.plazas) pl.h = naturalHeight(pl.centroid[0], pl.centroid[1]);
  // The street ends in the crest square: blend its last stretch to the square's level
  for (const r of [...L.roads, ...L.paths]) {
    const P = r.path.pts;
    for (const pl of L.plazas) {
      for (const end of [0, P.length - 1]) {
        if (!pointInPoly(P[end].x, P[end].z, pl.pts)) continue;
        const delta = pl.h - r.h[end];
        r.h = r.h.map((v, i) => v + delta * Math.max(0, 1 - Math.abs(P[i].s - P[end].s) / 12));
      }
    }
  }

  // ── Water paths ───────────────────────────────────────────────
  L.river = { ...RIVER, hw: RIVER.width / 2, path: sampleSpline(RIVER.pts, 1.5) };
  L.stream = { ...STREAM, hw: STREAM.width / 2, path: sampleSpline(STREAM.pts, 1) };
  L.pools = STREAM.pools.map(p => ({ ...p }));
  const poolM = (p, x, z) => { const [lx, lz] = toLocal(x - p.x, z - p.z, p.rot); return Math.hypot(lx / p.rx, lz / p.rz); };
  L.poolAt = (x, z, grow = 1) => L.pools.find(p => poolM(p, x, z) < grow) || null;

  // ── Bridge: where the High Street crosses the river ───────────
  {
    const st = L.road('street').path.pts, rv = L.river.path.pts;
    let hit = null;
    for (let i = 0; i < st.length - 1 && !hit; i++) {
      for (let k = 0; k < rv.length - 1; k++) {
        const r = segIntersect([st[i].x, st[i].z], [st[i + 1].x, st[i + 1].z], [rv[k].x, rv[k].z], [rv[k + 1].x, rv[k + 1].z]);
        if (r) { hit = { x: lerp(st[i].x, st[i + 1].x, r.t), z: lerp(st[i].z, st[i + 1].z, r.t), tx: st[i].tx, tz: st[i].tz, s: lerp(st[i].s, st[i + 1].s, r.t) }; break; }
      }
    }
    L.bridge = { x: hit.x, z: hit.z, heading: Math.atan2(hit.tx, hit.tz), length: 13.5, width: 7.2, arch: 0.9, s: hit.s };
  }

  // ── Wall path + gates ─────────────────────────────────────────
  {
    const wr = seededRng(WALL.seed), ctrl = [];
    for (let i = 0; i < WALL.points; i++) {
      const a = (i / WALL.points) * Math.PI * 2, k = 1 + WALL.wobble * (wr() * 2 - 1);
      const lx = Math.cos(a) * WALL.rx * k, lz = Math.sin(a) * WALL.rz * k;
      const c = Math.cos(WALL.rot), s = Math.sin(WALL.rot);
      ctrl.push([WALL.cx + lx * c - lz * s, WALL.cz + lx * s + lz * c]);
    }
    const path = sampleSpline(ctrl, 0.5, true);
    const coarse = sampleSpline(ctrl, 2, true);
    const gaps = [];
    const P = path.pts;
    const crossings = (other, kind, halfW) => {
      const O = other.path.pts;
      for (let i = 0; i < P.length; i++) {
        const a = P[i], b = P[(i + 1) % P.length];
        for (let k = 0; k < O.length - 1; k++) {
          const r = segIntersect([a.x, a.z], [b.x, b.z], [O[k].x, O[k].z], [O[k + 1].x, O[k + 1].z]);
          if (!r) continue;
          const sinA = Math.abs(a.tx * O[k].tz - a.tz * O[k].tx) || 1;
          gaps.push({ kind, s: a.s + 0.5 * r.t, half: Math.min(9, halfW / Math.max(0.5, sinA)), x: lerp(a.x, b.x, r.t), z: lerp(a.z, b.z, r.t), key: other.key || 'stream' });
        }
      }
    };
    for (const r of L.roads) crossings(r, 'gate', r.hw + 1.0);
    crossings(L.stream, 'water', 2.6);
    L.wall = { ...WALL, path, coarse, gaps };
    L.wallGap = (s) => gaps.find(g => {
      let d = Math.abs(s - g.s); d = Math.min(d, path.length - d);
      return d < g.half;
    }) || null;
  }

  // ── Building headings ─────────────────────────────────────────
  const nearestFront = (x, z) => {
    let best = { d: Infinity };
    for (const r of L.roads) {
      const n = nearestOnPath(r.path, x, z);
      const d = n.d - r.hw;
      if (d < best.d) best = { d, x: n.x, z: n.z };
    }
    for (const pl of L.plazas) {
      const P = pl.pts;
      for (let i = 0, j = P.length - 1; i < P.length; j = i++) {
        const r = segDist(x, z, P[j][0], P[j][1], P[i][0], P[i][1]);
        if (r.d < best.d) best = { d: r.d, x: r.x, z: r.z };
      }
    }
    return best;
  };
  L.buildings = BUILDINGS.map(b => {
    const o = { ...b };
    if (o.heading === undefined) {
      const f = nearestFront(o.x, o.z);
      o.heading = Math.atan2(f.x - o.x, f.z - o.z);
    }
    o.zone = zoneKeyAt(o.x, o.z);
    return o;
  });

  // ── Filler townhouses along the streets ───────────────────────
  const footprints = L.buildings.map(b => ({ x: b.x, z: b.z, w: b.w, d: b.d, heading: b.heading }));
  const blockedForHouse = (x, z, w, d, heading) => {
    const rad = Math.max(w, d) * 0.5;
    const me = { x, z, w: w + 1.2, d: d + 1.2, heading };
    for (const f of footprints) {
      if (Math.hypot(f.x - x, f.z - z) > rad + Math.max(f.w, f.d) + 3) continue;
      // corners of each inside the other (cheap OBB overlap test, good enough here)
      if (rectDist(x, z, { ...f, w: f.w + 1.6, d: f.d + 1.6 }) < rad * 0.9) return true;
      if (rectDist(f.x, f.z, me) < Math.max(f.w, f.d) * 0.5) return true;
    }
    for (const r of [...L.roads, ...L.paths]) if (pathDist(r.path, x, z, r.hw + d * 0.5 + 0.4) < r.hw + d * 0.5 + 0.4) return true;
    // every corner stays clear of every street (houses on the inside of a bend)
    {
      const c = Math.cos(heading), s = Math.sin(heading);
      for (const [u, v] of [[-w / 2, -d / 2], [w / 2, -d / 2], [-w / 2, d / 2], [w / 2, d / 2], [0, d / 2]]) {
        const cx = x + u * c + v * s, cz = z - u * s + v * c;
        for (const r of [...L.roads, ...L.paths]) if (pathDist(r.path, cx, cz, r.hw + 1.3) < r.hw + 1.3) return true;
      }
    }
    for (const pl of L.plazas) if (pointInPoly(x, z, pl.pts) || polyEdgeDist(x, z, pl.pts) < rad + 0.8) return true;
    if (pathDist(L.river.path, x, z, L.river.hw + rad + 3) < L.river.hw + rad + 3) return true;
    if (pathDist(L.stream.path, x, z, L.stream.hw + rad + 2) < L.stream.hw + rad + 2) return true;
    if (L.poolAt(x, z, 1.9)) return true;
    if (pathDist(L.wall.coarse, x, z, rad + 2.6) < rad + 2.6) return true;
    if (Math.hypot(x - L.bridge.x, z - L.bridge.z) < 14) return true;
    if (Math.hypot(x - CLOCK_TOWER.x, z - CLOCK_TOWER.z) < 9) return true;
    for (const g of L.wall.gaps) if (Math.hypot(x - g.x, z - g.z) < 9) return true;
    // open ground round the junction just north of the bridge, room to turn either way
    if (Math.hypot(x - 18, z - 49) < 11.5 + rad * 0.5) return true;
    if (Math.hypot(x - WORLD.playX, z - WORLD.playZ) > WORLD.playR - 6) return true;
    if (z > 63) return true;                        // nothing south of the river
    return false;
  };
  L.houses = [];
  // hand-placed houses first (they also skip the open-ground rules below)
  for (const e of EXTRA_HOUSES) { const h = { ...e }; L.houses.push(h); footprints.push(h); }
  const HOUSE_ROADS = { street: 6.4, lowerLane: 6.8, arenaLane: 7, towerLane: 6.6 };
  for (const r of L.roads) {
    const spacing = HOUSE_ROADS[r.key];
    if (!spacing) continue;
    for (let s0 = spacing * 0.5; s0 < r.path.length; s0 += spacing) {
      for (const side of [1, -1]) {
        let w = 4.1 + rng() * 1.5, d = 3.8 + rng() * 1.0, place = null;
        const offJ = rng() * 0.6;
        for (const [ds, shrink] of [[0, 0], [1.6, 0], [-1.6, 0], [0, 0.9], [2.4, 0.9]]) {
          const p = r.path.pts[clamp(Math.round(s0 + ds), 0, r.path.pts.length - 1)];
          const ww = w - shrink, dd = d - shrink * 0.4;
          const nx = -p.tz * side, nz = p.tx * side;     // left/right of the road
          const off = r.hw + dd / 2 + 1.45 + offJ;
          const x = p.x + nx * off, z = p.z + nz * off;
          const heading = Math.atan2(-nx, -nz);         // front faces the road
          if (!blockedForHouse(x, z, ww, dd, heading)) { place = { x, z, heading }; w = ww; d = dd; break; }
        }
        if (!place) continue;
        const { x, z, heading } = place;
        const storeys = rng() < 0.55 ? 2 : 1;
        const house = {
          x, z, w, d, heading, storeys, h: storeys === 2 ? 5.4 + rng() * 0.8 : 3.6 + rng() * 0.5,
          ridgeAlong: rng() < 0.6 ? 'front' : 'side', tint: Math.floor(rng() * 5), roofTint: Math.floor(rng() * 4),
          chimney: rng() < 0.55, chimneySide: rng() < 0.5 ? -1 : 1,
        };
        L.houses.push(house);
        footprints.push(house);
      }
    }
  }

  // ── Height field ──────────────────────────────────────────────
  const ext = WORLD.ext, n = Math.round((2 * ext) / res) + 1, step = (2 * ext) / (n - 1);
  const H = new Float32Array(n * n);
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) H[j * n + i] = naturalHeight(-ext + i * step, -ext + j * step);
  const forBox = (x0, x1, z0, z1, fn) => {
    const i0 = clamp(Math.floor((x0 + ext) / step), 0, n - 1), i1 = clamp(Math.ceil((x1 + ext) / step), 0, n - 1);
    const j0 = clamp(Math.floor((z0 + ext) / step), 0, n - 1), j1 = clamp(Math.ceil((z1 + ext) / step), 0, n - 1);
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      const k = j * n + i;
      H[k] = fn(-ext + i * step, -ext + j * step, H[k]);
    }
  };
  const sampleGrid = (x, z) => {
    const fx = clamp((x + ext) / step, 0, n - 1.0001), fz = clamp((z + ext) / step, 0, n - 1.0001);
    const i = Math.floor(fx), j = Math.floor(fz), u = fx - i, v = fz - j;
    const a = H[j * n + i], b = H[j * n + i + 1], c = H[(j + 1) * n + i], d = H[(j + 1) * n + i + 1];
    // same triangle split as the terrain mesh (PlaneGeometry: a-c-b / c-d-b)
    return u + v <= 1 ? a + (b - a) * u + (c - a) * v : d + (c - d) * (1 - u) + (b - d) * (1 - v);
  };
  const FLAT = 0.7, FALL = 3.6;
  // Carve along a path: every grid vertex within R of it gets the distance
  // to the path and the path's value there (interpolated per sample), then
  // apply(x, z, h, d, v) gives its new height. Works segment by segment,
  // so only vertices near the path are visited.
  const nearD = new Float32Array(n * n), nearV = new Float32Array(n * n), stamp = new Int32Array(n * n);
  let stampId = 0;
  const carvePath = (path, vals, R, apply) => {
    stampId++;
    const touched = [], P = path.pts, last = path.closed ? P.length : P.length - 1;
    for (let k = 0; k < last; k++) {
      const a = P[k], b = P[(k + 1) % P.length], va = vals ? vals[k] : 0, vb = vals ? vals[(k + 1) % P.length] : 0;
      const dx = b.x - a.x, dz = b.z - a.z, LL = dx * dx + dz * dz || 1;
      const i0 = clamp(Math.floor((Math.min(a.x, b.x) - R + ext) / step), 0, n - 1), i1 = clamp(Math.ceil((Math.max(a.x, b.x) + R + ext) / step), 0, n - 1);
      const j0 = clamp(Math.floor((Math.min(a.z, b.z) - R + ext) / step), 0, n - 1), j1 = clamp(Math.ceil((Math.max(a.z, b.z) + R + ext) / step), 0, n - 1);
      for (let j = j0; j <= j1; j++) {
        const z = -ext + j * step;
        for (let i = i0; i <= i1; i++) {
          const x = -ext + i * step;
          let t = ((x - a.x) * dx + (z - a.z) * dz) / LL;
          t = t < 0 ? 0 : t > 1 ? 1 : t;
          const ex = a.x + dx * t - x, ez = a.z + dz * t - z, d = Math.sqrt(ex * ex + ez * ez);
          if (d > R) continue;
          const idx = j * n + i;
          if (stamp[idx] !== stampId) { stamp[idx] = stampId; nearD[idx] = d; nearV[idx] = va + (vb - va) * t; touched.push(idx); }
          else if (d < nearD[idx]) { nearD[idx] = d; nearV[idx] = va + (vb - va) * t; }
        }
      }
    }
    for (const idx of touched) {
      const i = idx % n, j = (idx - i) / n;
      H[idx] = apply(-ext + i * step, -ext + j * step, H[idx], nearD[idx], nearV[idx]);
    }
  };
  // roads & paths: level across, following the smoothed centreline height
  for (const r of [...L.roads, ...L.paths]) {
    carvePath(r.path, r.h, r.hw + FLAT + FALL, (x, z, h, d, v) => {
      const w = 1 - smoothstep(r.hw + FLAT, r.hw + FLAT + FALL, d);
      return w > 0 ? lerp(h, v, w) : h;
    });
  }
  // squares: flat
  for (const pl of L.plazas) {
    const xs = pl.pts.map(p => p[0]), zs = pl.pts.map(p => p[1]), pad = FLAT + FALL;
    forBox(Math.min(...xs) - pad, Math.max(...xs) + pad, Math.min(...zs) - pad, Math.max(...zs) + pad, (x, z, h) => {
      const d = pointInPoly(x, z, pl.pts) ? 0 : polyEdgeDist(x, z, pl.pts);
      const w = 1 - smoothstep(FLAT, FLAT + FALL, d);
      return w > 0 ? lerp(h, pl.h, w) : h;
    });
  }
  // building + house pads at the level of the street outside their door
  const padAll = [...L.buildings, ...L.houses];
  for (const b of padAll) {
    const fx = Math.sin(b.heading), fz = Math.cos(b.heading);
    const doorX = b.x + fx * (b.d / 2 + 1.4), doorZ = b.z + fz * (b.d / 2 + 1.4);
    b.y = Math.max(sampleGrid(doorX, doorZ), sampleGrid(b.x, b.z) - 1.2);
  }
  for (const b of padAll) {
    const R = Math.hypot(b.w, b.d) / 2 + FLAT + FALL;
    forBox(b.x - R, b.x + R, b.z - R, b.z + R, (x, z, h) => {
      const w = 1 - smoothstep(FLAT, FLAT + FALL * 0.8, rectDist(x, z, b));
      return w > 0 ? lerp(h, b.y, w) : h;
    });
  }

  // ── Stream bed, pools and their levels (from the ground carved so far) ──
  {
    const S = L.stream.path.pts;
    for (const p of L.pools) {
      let lo = Infinity;
      for (let a = 0; a < 24; a++) for (const f of [0, 0.5, 1]) {
        const ang = (a / 24) * Math.PI * 2, c = Math.cos(p.rot), s = Math.sin(p.rot);
        const lx = Math.cos(ang) * p.rx * f, lz = Math.sin(ang) * p.rz * f;
        lo = Math.min(lo, sampleGrid(p.x + lx * c - lz * s, p.z + lx * s + lz * c));
      }
      p.level = lo - 0.18;
    }
    const bed = S.map(q => sampleGrid(q.x, q.z) - 0.6);
    const inPool = S.map(q => L.pools.find(p => poolM(p, q.x, q.z) < 1.05) || null);
    S.forEach((q, i) => { if (inPool[i]) bed[i] = inPool[i].level - 0.6; });
    for (let i = 1; i < bed.length; i++) bed[i] = Math.min(bed[i], bed[i - 1]);
    // the last stretch flows out into the river
    const rl = RIVER.level - 0.35;
    for (let i = 0; i < bed.length; i++) {
      const t = smoothstep(L.stream.path.length - 14, L.stream.path.length, S[i].s);
      bed[i] = lerp(bed[i], Math.min(bed[i], rl), t);
    }
    L.stream.bed = bed;
    L.stream.surface = bed.map(b => b + 0.34);
    L.stream.inPool = inPool;
    // falls: where the stream enters a pool from higher up
    L.falls = [];
    for (let i = 1; i < S.length; i++) {
      if (inPool[i] && !inPool[i - 1]) {
        const top = L.stream.surface[i - 1], drop = top - inPool[i].level;
        if (drop > 0.35) L.falls.push({ x: S[i].x, z: S[i].z, tx: S[i].tx, tz: S[i].tz, top, bottom: inPool[i].level, width: STREAM.width * 0.95 });
      }
    }
    L.spring = { x: S[0].x, z: S[0].z, y: L.stream.surface[0] };
  }

  // ── Water carves the ground last (only ever lowers it) ────────
  {
    const r = L.river;
    carvePath(r.path, null, r.hw + 8, (x, z, h, d) => Math.min(h, RIVER.bed + Math.max(0, d - r.hw * 0.75) * 0.72));
    const st = L.stream;
    carvePath(st.path, st.bed, st.hw + 4, (x, z, h, d, v) => Math.min(h, v + Math.max(0, d - st.hw * 0.7) * 0.9));
    for (const p of L.pools) {
      const R = Math.max(p.rx, p.rz) + 4;
      forBox(p.x - R, p.x + R, p.z - R, p.z + R, (x, z, h) => {
        const m = poolM(p, x, z);
        const t = m < 1 ? p.level - 0.25 - 0.55 * (1 - m) : p.level - 0.25 + (m - 1) * Math.min(p.rx, p.rz) * 0.9;
        return Math.min(h, t);
      });
    }
  }

  // ── Height queries ────────────────────────────────────────────
  const B = L.bridge, bc = Math.cos(B.heading), bs = Math.sin(B.heading);
  B.toLocal = (x, z) => { const dx = x - B.x, dz = z - B.z; return [dx * bc - dz * bs, dx * bs + dz * bc]; };   // [across, along]
  B.y = Math.max(sampleGrid(B.x + bs * B.length / 2, B.z + bc * B.length / 2), sampleGrid(B.x - bs * B.length / 2, B.z - bc * B.length / 2)) + 0.06;
  B.deckY = (along) => B.y + B.arch * Math.cos(Math.PI * clamp(along / B.length, -0.5, 0.5));
  L.grid = { ext, n, step, data: H };
  L.groundAt = sampleGrid;
  /** Where wheels and feet go: the ground, or the bridge deck over the river. */
  L.heightAt = (x, z) => {
    const [u, v] = B.toLocal(x, z);
    if (Math.abs(u) <= B.width / 2 && Math.abs(v) <= B.length / 2) return B.deckY(v);
    return sampleGrid(x, z);
  };
  L.zoneKeyAt = zoneKeyAt;
  /** Distance from (x, z) to the edge of the nearest street, lane or path (negative = on it). */
  L.roadClear = (x, z) => Math.min(...[...L.roads, ...L.paths].map(r => pathDist(r.path, x, z, 12) - r.hw));

  // ── Lamps along the streets ───────────────────────────────────
  L.lamps = [];
  // where side roads meet a street: keep the corners clear for turning
  const junctions = [];
  for (const r of [...L.roads, ...L.paths]) for (const end of [r.path.pts[0], r.path.pts[r.path.pts.length - 1]]) {
    if (L.roads.some(o => o !== r && pathDist(o.path, end.x, end.z, o.hw + 0.5) < o.hw + 0.5)) junctions.push({ x: end.x, z: end.z });
  }
  L.junctions = junctions;
  const lampOk = (x, z) => {
    for (const j of junctions) if (Math.hypot(j.x - x, j.z - z) < 9) return false;
    for (const f of footprints) if (rectDist(x, z, f) < 1.4) return false;
    for (const r of L.roads) if (pathDist(r.path, x, z, r.hw + 0.5) < r.hw + 0.5) return false;
    for (const l of L.lamps) if (Math.hypot(l.x - x, l.z - z) < 6) return false;
    if (pathDist(L.river.path, x, z, L.river.hw + 2) < L.river.hw + 2) return false;
    if (pathDist(L.stream.path, x, z, 2.2) < 2.2 || L.poolAt(x, z, 1.4)) return false;
    if (pathDist(L.wall.coarse, x, z, 2.4) < 2.4) return false;
    if (Math.hypot(x - B.x, z - B.z) < 10) return false;
    return true;
  };
  for (const r of [...L.roads, ...L.paths.filter(p => p.lamps)]) {
    const every = r.kind === 'main' ? 11 : 12.5;
    let side = 1;
    for (let s = 5; s < r.path.length - 2; s += every) {
      const p = r.path.pts[Math.min(r.path.pts.length - 1, Math.round(s))];
      if (Math.hypot(p.x - WORLD.playX, p.z - WORLD.playZ) > WORLD.playR - 4) continue;
      for (const sd of [side, -side]) {
        const x = p.x - p.tz * sd * (r.hw + 1.1), z = p.z + p.tx * sd * (r.hw + 1.1);
        if (lampOk(x, z)) { L.lamps.push({ x, z }); side = -side; break; }
      }
    }
  }
  // bridge-end lamps on the parapets
  for (const e of [-1, 1]) for (const sd of [-1, 1]) {
    const a = e * (B.length / 2 - 0.6), c = sd * (B.width / 2 + 0.05);
    L.lamps.push({ x: B.x + bc * c + bs * a, z: B.z - bs * c + bc * a, onBridge: true, y: B.deckY(a) + 0.6 });
  }
  for (const pl of L.plazas) {
    if (pl.lamps) { for (const [x, z] of pl.lamps) L.lamps.push({ x, z }); continue; }     // placed by hand
    for (const [px, pz] of pl.pts) {
      const [cx, cz] = pl.centroid, k = 1 - 1.6 / Math.hypot(px - cx, pz - cz);
      const x = cx + (px - cx) * k, z = cz + (pz - cz) * k;
      const clear = footprints.every(f => rectDist(x, z, f) > 1.2) && L.lamps.every(l => Math.hypot(l.x - x, l.z - z) > 5) &&
        L.roads.every(r => nearestOnPath(r.path, x, z).d > r.hw + 0.3);
      if (clear) L.lamps.push({ x, z });
    }
  }

  // ── Trees, bushes, rocks, flowers ─────────────────────────────
  const fieldRects = FIELDS.map(([x, z, w, d, r]) => ({ x, z, w, d, heading: (r * Math.PI) / 180 }));
  L.fields = fieldRects;
  const freeGround = (x, z, r) => {
    for (const rd of [...L.roads, ...L.paths]) if (pathDist(rd.path, x, z, rd.hw + r + 0.6) < rd.hw + r + 0.6) return false;
    for (const pl of L.plazas) if (pointInPoly(x, z, pl.pts) || polyEdgeDist(x, z, pl.pts) < r + 0.5) return false;
    for (const f of footprints) if (rectDist(x, z, f) < r + 1.2) return false;
    if (pathDist(L.river.path, x, z, L.river.hw + r + 1.6) < L.river.hw + r + 1.6) return false;
    if (pathDist(L.stream.path, x, z, L.stream.hw + r + 1) < L.stream.hw + r + 1) return false;
    if (L.poolAt(x, z, 1.35 + r * 0.25)) return false;
    if (pathDist(L.wall.coarse, x, z, r + 2.6) < r + 2.6) return false;
    for (const f of fieldRects) if (rectDist(x, z, f) < r + 0.8) return false;
    for (const l of L.lamps) if (Math.hypot(l.x - x, l.z - z) < r + 1) return false;
    if (Math.hypot(x - B.x, z - B.z) < 12) return false;
    if (Math.hypot(x - CLOCK_TOWER.x, z - CLOCK_TOWER.z) < CLOCK_TOWER.base + r) return false;
    return true;
  };
  L.freeGround = freeGround;
  // ── The forest (§2.15): landing-page cedars and maples filling every
  // open space, with clearings round roads, squares, buildings, houses and
  // the drone's flight path. A jittered grid keeps it dense but even; a
  // spatial hash answers "any tree near here?" for the later scatters.
  L.trees = [];
  const TCELL = 4, treeHash = new Map();
  const tkey = (x, z) => Math.floor(x / TCELL) + ',' + Math.floor(z / TCELL);
  const treeNear = (x, z, d) => {
    const cx = Math.floor(x / TCELL), cz = Math.floor(z / TCELL), k = Math.ceil(d / TCELL);
    for (let i = -k; i <= k; i++) for (let j = -k; j <= k; j++) {
      const list = treeHash.get((cx + i) + ',' + (cz + j));
      if (list) for (const t of list) if (Math.hypot(t.x - x, t.z - z) < d) return true;
    }
    return false;
  };
  L.treeNear = treeNear;
  {
    const navLoop = { pts: NAV_LOOP.pts.map(([x, z]) => ({ x, z })) };
    const nearLoop = (x, z, d) => {
      const P = navLoop.pts;
      for (let i = 0; i < P.length; i++) {
        const a = P[i], b2 = P[(i + 1) % P.length];
        const dx = b2.x - a.x, dz = b2.z - a.z, t = Math.max(0, Math.min(1, ((x - a.x) * dx + (z - a.z) * dz) / (dx * dx + dz * dz)));
        if (Math.hypot(a.x + dx * t - x, a.z + dz * t - z) < d) return true;
      }
      return false;
    };
    const forestOk = (x, z) => {
      if (!freeGround(x, z, 0.9)) return false;
      for (const r of [...L.roads, ...L.paths]) if (pathDist(r.path, x, z, r.hw + 3.2) < r.hw + 3.2) return false;
      for (const b of L.buildings) if (rectDist(x, z, b) < 3.6) return false;
      for (const h of L.houses) if (Math.abs(h.x - x) < 9 && Math.abs(h.z - z) < 9 && rectDist(x, z, h) < 1.9) return false;
      for (const pl of L.plazas) if (pointInPoly(x, z, pl.pts) || polyEdgeDist(x, z, pl.pts) < 2.2) return false;
      for (const g of L.wall.gaps) if (Math.hypot(x - g.x, z - g.z) < 7) return false;
      if (nearLoop(x, z, 3.4)) return false;
      for (const [fx, fz] of NAV_LOOP.flags) if (Math.hypot(fx - x, fz - z) < 1.6) return false;
      return true;
    };
    const STEP = 2.75;
    for (let gz = -112; gz <= 112; gz += STEP) {
      for (let gx = -112; gx <= 112; gx += STEP) {
        const x = gx + (rng() - 0.5) * STEP * 0.85, z = gz + (rng() - 0.5) * STEP * 0.85;
        const roll = rng(), size = rng();
        const farOut = Math.hypot(x - WORLD.playX, z - WORLD.playZ);
        if (farOut > 118) continue;
        if (farOut > WORLD.playR + 12 && roll > 0.62) continue;     // thinner beyond the play area: seen only from afar
        if (!forestOk(x, z) || treeNear(x, z, 2.35)) continue;
        const inWall = insideWall(x, z, -2);
        const nearRoad = L.roadClear(x, z) < 7;
        // smaller trees inside the walls and along the streets, big ones in the woods
        const s = inWall || nearRoad ? 0.68 + size * 0.36 : 0.82 + size * 0.55;
        const species = roll < (inWall ? 0.3 : 0.16) ? 'maple' : 'cedar';
        const t = { x, z, s, species };
        L.trees.push(t);
        const k = tkey(x, z);
        if (!treeHash.has(k)) treeHash.set(k, []);
        treeHash.get(k).push(t);
      }
    }
  }
  L.bushes = [];
  const bushOk = (x, z) => freeGround(x, z, 0.4) && !treeNear(x, z, 2) && L.bushes.every(b => Math.hypot(b.x - x, b.z - z) > 1.4);
  // beside the door of every portfolio building
  for (const b of L.buildings) {
    if (b.temple) continue;
    const fx = Math.sin(b.heading), fz = Math.cos(b.heading), rx = Math.cos(b.heading), rz = -Math.sin(b.heading);
    for (const sd of [-1, 1]) {
      const x = b.x + rx * sd * (b.w / 2 + 0.7) + fx * (b.d / 2 - 0.2), z = b.z + rz * sd * (b.w / 2 + 0.7) + fz * (b.d / 2 - 0.2);
      if (bushOk(x, z)) L.bushes.push({ x, z, s: 0.7, species: ['green', 'oak'][(L.bushes.length) % 2] });
    }
  }
  // along the inside of the wall
  for (let s = 3; s < L.wall.path.length; s += 9) {
    const p = L.wall.path.pts[Math.round(s / 0.5) % L.wall.path.pts.length];
    const x = p.x + p.tz * 3.4, z = p.z - p.tx * 3.4;              // inward normal (path runs anticlockwise on screen)
    const [ix, iz] = insideWall(x, z) ? [x, z] : [p.x - p.tz * 3.4, p.z + p.tx * 3.4];
    if (bushOk(ix, iz)) L.bushes.push({ x: ix, z: iz, s: 0.8 + rng() * 0.3, species: ['green', 'oak', 'birch'][Math.floor(rng() * 3)] });
  }
  // round the pools and the spring
  for (const p of L.pools) for (let k = 0; k < 4; k++) {
    const a = rng() * Math.PI * 2, c = Math.cos(p.rot), s = Math.sin(p.rot);
    const lx = Math.cos(a) * (p.rx + 1.6), lz = Math.sin(a) * (p.rz + 1.6);
    const x = p.x + lx * c - lz * s, z = p.z + lx * s + lz * c;
    if (bushOk(x, z)) L.bushes.push({ x, z, s: 0.55 + rng() * 0.3, species: 'green' });
  }
  L.rocks = [];
  const rockAround = (x, z, rx, rz, rot, count, scale) => {
    for (let k = 0; k < count; k++) {
      const a = (k / count) * Math.PI * 2 + rng(), c = Math.cos(rot), s = Math.sin(rot);
      const lx = Math.cos(a) * rx, lz = Math.sin(a) * rz;
      L.rocks.push({ x: x + lx * c - lz * s, z: z + lx * s + lz * c, s: scale * (0.7 + rng() * 0.7) });
    }
  };
  for (const p of L.pools) rockAround(p.x, p.z, p.rx + 0.5, p.rz + 0.5, p.rot, 5, 0.9);
  rockAround(L.spring.x, L.spring.z, 1.6, 1.6, 0, 6, 1.1);
  for (const f of L.falls) rockAround(f.x - f.tx * 0.8, f.z - f.tz * 0.8, 1.7, 1.7, 0, 3, 1.0);
  for (let s = 20; s < L.river.path.length - 20; s += 11) {
    const p = L.river.path.pts[Math.round(s / 1.5)];
    if (!p || Math.hypot(p.x - B.x, p.z - B.z) < 12 || Math.abs(p.x) > 95) continue;
    const sd = rng() < 0.5 ? 1 : -1, o = L.river.hw + 0.4 + rng() * 1.2;
    L.rocks.push({ x: p.x - p.tz * sd * o, z: p.z + p.tx * sd * o, s: 0.9 + rng() * 0.9 });
  }
  L.flowers = [];
  for (let tries = 0; tries < 2000 && L.flowers.length < 34; tries++) {
    const x = WORLD.playX + (rng() * 2 - 1) * 70, z = WORLD.playZ + (rng() * 2 - 1) * 70;
    if (Math.hypot(x - WORLD.playX, z - WORLD.playZ) > WORLD.playR - 3) continue;
    if (freeGround(x, z, 1.6) && !treeNear(x, z, 2.6)) L.flowers.push({ x, z });
  }

  // ── Spawns for respawn (R / Unstuck) ──────────────────────────
  const onRoad = (key, s, back = false) => {
    const r = L.road(key), p = r.path.pts[clamp(Math.round(s), 0, r.path.pts.length - 1)];
    return { x: p.x, z: p.z, rot: Math.atan2(back ? -p.tx : p.tx, back ? -p.tz : p.tz) };
  };
  const st = L.road('street');
  const sAt = (x, z) => nearestOnPath(st.path, x, z).s;
  L.spawns = {
    lower:    onRoad('street', B.s + 13),
    terrace:  { x: -16, z: 31, rot: Math.PI / 2 + 0.6 },
    hillside: onRoad('street', sAt(4, -6)),
    crest:    { x: -6, z: -25.5, rot: Math.PI },
  };
  L.start = { x: START.x, z: START.z, rot: Math.atan2(B.x - START.x, B.z - START.z) };
  L.streetS = sAt;
  return L;
}
