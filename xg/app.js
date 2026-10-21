import { XGModel, features, inShootingTriangle } from "./model.js";

// ---------- coordinates ----------
// The board shows the final 42 yards with the goal at the top.
// Board x = pitch y (0..80); board y = 120 - pitch x (0 at the goal line).
// Visible part of the board, in yards: zoomed further in on small screens so players are easy to drag.
const VIEW_WIDE = { x0: 4, x1: 76, depth: 38.6 };
const VIEW_NARROW = { x0: 13, x1: 67, depth: 30.5 };
let VIEW = VIEW_WIDE;
const toBoard = (p) => ({ bx: p.y, by: 120 - p.x });
const toPitch = (bx, by) => ({ x: 120 - by, y: bx });
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const SVGNS = "http://www.w3.org/2000/svg";

const PRESETS = {
  tapin: { name: "Tap-in", shot: { x: 117, y: 41.5 }, keeper: { x: 118.6, y: 38.6 }, defenders: [{ x: 116.4, y: 44.6 }], body: "Foot", pass: "Ground Pass", firstTime: true },
  spot: { name: "Crowded penalty spot", shot: { x: 108, y: 40 }, keeper: { x: 119.3, y: 40.2 }, defenders: [{ x: 111.5, y: 39.4 }, { x: 113, y: 41.3 }, { x: 107.6, y: 43.8 }], body: "Foot", pass: "Low Pass", firstTime: true },
  edge: { name: "Edge of the box", shot: { x: 101, y: 37 }, keeper: { x: 118.8, y: 39.4 }, defenders: [{ x: 104.5, y: 36.4 }, { x: 106.5, y: 40.6 }, { x: 110, y: 38.4 }, { x: 111, y: 44 }], body: "Foot", pass: "Ground Pass", firstTime: false },
  angle: { name: "Tight angle", shot: { x: 115.5, y: 24 }, keeper: { x: 119.2, y: 36.8 }, defenders: [{ x: 117.4, y: 31 }], body: "Foot", pass: "None", firstTime: false },
  oneonone: { name: "One-on-one", shot: { x: 109, y: 41 }, keeper: { x: 113.2, y: 40.4 }, defenders: [{ x: 104.5, y: 44 }], body: "Foot", pass: "Ground Pass", firstTime: false },
  header: { name: "Back-post header", shot: { x: 114, y: 46 }, keeper: { x: 119, y: 39.6 }, defenders: [{ x: 114.3, y: 44.7 }, { x: 115.5, y: 41.5 }], body: "Head", pass: "High Pass", firstTime: true },
  long: { name: "Long shot", shot: { x: 91, y: 43 }, keeper: { x: 118.4, y: 40 }, defenders: [{ x: 96, y: 41 }, { x: 101, y: 37.5 }, { x: 102.5, y: 44 }, { x: 106.5, y: 40.5 }, { x: 110.5, y: 38.5 }], body: "Foot", pass: "None", firstTime: false },
};

const state = {
  ...structuredClone(PRESETS.spot),
  pattern: "Regular Play",
  model: "cb",
  heat: false,
  preset: "spot",
};

// ---------- elements ----------
const svg = document.getElementById("pitch");
const tokensG = document.getElementById("tokens");
const triangle = document.getElementById("triangle");
const pressure = document.getElementById("pressure");
const heatImg = document.getElementById("heat");
const controls = document.getElementById("controls");
const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;

let model = null;

const narrowQuery = matchMedia("(max-width: 600px)");
function applyView() {
  VIEW = narrowQuery.matches ? VIEW_NARROW : VIEW_WIDE;
  const top = -3.6;
  svg.setAttribute("viewBox", `${VIEW.x0} ${top} ${VIEW.x1 - VIEW.x0} ${VIEW.depth - top}`);
  const turf = document.getElementById("turf");
  turf.setAttribute("x", VIEW.x0); turf.setAttribute("width", VIEW.x1 - VIEW.x0); turf.setAttribute("height", VIEW.depth - top);
  heatImg.setAttribute("x", VIEW.x0); heatImg.setAttribute("width", VIEW.x1 - VIEW.x0); heatImg.setAttribute("height", VIEW.depth);
  svg.classList.toggle("narrow", narrowQuery.matches);
}
narrowQuery.addEventListener("change", () => {
  applyView();
  if (!model) return;
  state.shot = { x: clamp(state.shot.x, 120 - VIEW.depth, 119.6), y: clamp(state.shot.y, VIEW.x0, VIEW.x1) };
  update({ heat: true });
});

// ---------- scene helpers ----------
const scene = (s = state) => ({
  shot: s.shot, keeper: s.keeper, defenders: s.defenders,
  body: s.body, pass: s.pass, pattern: s.pattern, firstTime: s.firstTime,
});
const xgOf = (sc) => model.predict(features(sc), state.model);

// ---------- tokens ----------
function makeToken(kind, label, aria) {
  const g = document.createElementNS(SVGNS, "g");
  g.setAttribute("class", `token ${kind}`);
  g.setAttribute("tabindex", "0");
  g.setAttribute("role", "button");
  g.setAttribute("aria-label", aria);
  const r = kind === "shooter" ? 1.45 : 1.3;
  g.innerHTML = `
    <circle class="halo" r="${r + 0.9}"/>
    <circle class="ring" r="${r + 0.45}"/>
    <circle class="disc" r="${r}"/>
    <ellipse class="shine" rx="${r * 0.55}" ry="${r * 0.3}" cy="${-r * 0.42}"/>
    <text class="tag">${label}</text>`;
  return g;
}

function renderTokens() {
  tokensG.replaceChildren();
  state.defenders.forEach((d, i) => {
    const t = makeToken("defender", "D", `Defender ${i + 1}. Arrow keys move it, Delete removes it.`);
    t.dataset.kind = "defender";
    t.dataset.index = i;
    tokensG.append(t);
  });
  if (state.keeper) {
    const k = makeToken("keeper", "GK", "Goalkeeper. Arrow keys move it.");
    k.dataset.kind = "keeper";
    tokensG.append(k);
  }
  const s = makeToken("shooter", "", "Shooter. Arrow keys move the shot.");
  s.dataset.kind = "shooter";
  s.innerHTML += `<circle r=".42" fill="#fff" stroke="#3b2a00" stroke-width=".12"/>`;
  tokensG.append(s);
  positionTokens();
}

function pointOf(kind, index) {
  if (kind === "shooter") return state.shot;
  if (kind === "keeper") return state.keeper;
  return state.defenders[index];
}

function positionTokens() {
  const { x: sx, y: sy } = state.shot;
  for (const t of tokensG.children) {
    const p = pointOf(t.dataset.kind, +t.dataset.index);
    const { bx, by } = toBoard(p);
    t.setAttribute("transform", `translate(${bx} ${by})`);
    if (t.dataset.kind !== "shooter") {
      t.classList.toggle("in-way", inShootingTriangle(sx, sy, p.x, p.y));
      t.classList.toggle("near", t.dataset.kind === "defender" && (sx - p.x) ** 2 + (sy - p.y) ** 2 <= 25);
    }
  }
  const s = toBoard(state.shot);
  triangle.setAttribute("points", `${s.bx},${s.by} 36,0 44,0`);
  pressure.setAttribute("cx", s.bx);
  pressure.setAttribute("cy", s.by);
}

// ---------- dragging ----------
function boardPoint(evt) {
  const pt = svg.createSVGPoint();
  pt.x = evt.clientX;
  pt.y = evt.clientY;
  const p = pt.matrixTransform(svg.getScreenCTM().inverse());
  return { bx: clamp(p.x, VIEW.x0, VIEW.x1), by: clamp(p.y, 0, VIEW.depth) };
}

function setPoint(kind, index, bx, by) {
  const p = toPitch(bx, by);
  if (kind === "shooter") {
    state.shot = { x: clamp(p.x, 120 - VIEW.depth, 119.6), y: clamp(p.y, VIEW.x0, VIEW.x1) };
  } else if (kind === "keeper") {
    state.keeper = { x: clamp(p.x, 78, 120), y: clamp(p.y, 0, 80) };
  } else {
    state.defenders[index] = { x: clamp(p.x, 78, 120), y: clamp(p.y, 0, 80) };
  }
}

let drag = null;
svg.addEventListener("pointerdown", (e) => {
  if (e.button !== 0) return;
  const tok = e.target.closest(".token");
  let kind, index;
  if (tok) {
    kind = tok.dataset.kind;
    index = +tok.dataset.index;
    tok.focus({ preventScroll: true });
  } else {
    kind = "shooter"; // tapping empty grass moves the shot there
    const { bx, by } = boardPoint(e);
    setPoint("shooter", 0, bx, by);
    clearPreset();
    update({ heat: false });
  }
  drag = { kind, index, id: e.pointerId };
  svg.setPointerCapture(e.pointerId);
  const el = [...tokensG.children].find((t) => t.dataset.kind === kind && (kind !== "defender" || +t.dataset.index === index));
  el?.classList.add("dragging");
  e.preventDefault();
});
svg.addEventListener("pointermove", (e) => {
  if (!drag || e.pointerId !== drag.id) return;
  const { bx, by } = boardPoint(e);
  setPoint(drag.kind, drag.index, bx, by);
  clearPreset();
  update({ heat: drag.kind !== "shooter", coarse: true });
});
const endDrag = (e) => {
  if (!drag || e.pointerId !== drag.id) return;
  const wasShooter = drag.kind === "shooter";
  drag = null;
  for (const t of tokensG.children) t.classList.remove("dragging");
  update({ heat: !wasShooter });
};
svg.addEventListener("pointerup", endDrag);
svg.addEventListener("pointercancel", endDrag);

svg.addEventListener("dblclick", (e) => {
  const tok = e.target.closest(".token.defender");
  if (tok) removeDefender(+tok.dataset.index);
});

svg.addEventListener("keydown", (e) => {
  const tok = e.target.closest?.(".token");
  if (!tok) return;
  const kind = tok.dataset.kind;
  const index = +tok.dataset.index;
  if ((e.key === "Delete" || e.key === "Backspace") && kind === "defender") {
    e.preventDefault();
    removeDefender(index, true);
    return;
  }
  const step = e.shiftKey ? 0.25 : 1;
  const moves = { ArrowUp: [0, -step], ArrowDown: [0, step], ArrowLeft: [-step, 0], ArrowRight: [step, 0] };
  if (!moves[e.key]) return;
  e.preventDefault();
  const p = toBoard(pointOf(kind, index));
  setPoint(kind, index, clamp(p.bx + moves[e.key][0], VIEW.x0, VIEW.x1), clamp(p.by + moves[e.key][1], 0, VIEW.depth));
  clearPreset();
  update({ heat: kind !== "shooter" });
});

function removeDefender(index, keepFocus = false) {
  state.defenders.splice(index, 1);
  clearPreset();
  renderTokens();
  update({ heat: true });
  if (keepFocus) tokensG.querySelector(".token")?.focus();
}

document.getElementById("add-defender").addEventListener("click", () => {
  if (state.defenders.length >= 10) return;
  // a little goal-side of the shooter, nudged so new defenders don't stack
  const { x, y } = state.shot;
  const t = 0.35 + 0.1 * (state.defenders.length % 4);
  const side = state.defenders.length % 2 ? 1 : -1;
  state.defenders.push({ x: clamp(x + (120 - x) * t, 78, 119), y: clamp(y + (40 - y) * t + side * 1.6, 1, 79) });
  clearPreset();
  renderTokens();
  update({ heat: true });
});
document.getElementById("clear-defenders").addEventListener("click", () => {
  state.defenders = [];
  clearPreset();
  renderTokens();
  update({ heat: true });
});

// ---------- form controls ----------
controls.addEventListener("change", () => {
  const f = new FormData(controls);
  state.body = f.get("body");
  state.pass = f.get("pass");
  state.pattern = f.get("pattern");
  state.firstTime = f.get("firstTime") === "on";
  update({ heat: true });
});
document.querySelectorAll('input[name="model"]').forEach((r) =>
  r.addEventListener("change", () => { state.model = r.value; update({ heat: true }); }));
document.getElementById("heat-toggle").addEventListener("change", (e) => {
  state.heat = e.target.checked;
  update({ heat: true });
});

function syncForm() {
  controls.elements.body.value = state.body;
  controls.elements.pass.value = state.pass;
  controls.elements.pattern.value = state.pattern;
  controls.elements.firstTime.checked = state.firstTime;
}

// ---------- presets ----------
const presetList = document.getElementById("presets");
for (const [key, p] of Object.entries(PRESETS)) {
  const b = document.createElement("button");
  b.type = "button";
  b.textContent = p.name;
  b.dataset.key = key;
  b.addEventListener("click", () => loadPreset(key));
  presetList.append(b);
}
document.querySelectorAll("[data-preset]").forEach((b) =>
  b.addEventListener("click", () => {
    loadPreset(b.dataset.preset);
    svg.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "center" });
  }));

function loadPreset(key) {
  const p = structuredClone(PRESETS[key]);
  Object.assign(state, p, { pattern: "Regular Play", preset: key });
  delete state.name;
  syncForm();
  renderTokens();
  update({ heat: true });
}
function clearPreset() { state.preset = null; }
function markPreset() {
  for (const b of presetList.children) b.setAttribute("aria-pressed", String(b.dataset.key === state.preset));
}

// ---------- heat map: xG for a shot from every spot, with the current defenders ----------
const heatCanvas = document.createElement("canvas");
const HEAT_STOPS = [
  [0.0, [23, 63, 47, 0]],
  [0.04, [40, 110, 130, 120]],
  [0.12, [70, 160, 150, 170]],
  [0.25, [245, 200, 76, 200]],
  [0.45, [255, 140, 60, 215]],
  [0.7, [235, 70, 55, 225]],
];
function heatColor(v) {
  for (let i = 1; i < HEAT_STOPS.length; i++) {
    const [v1, c1] = HEAT_STOPS[i];
    const [v0, c0] = HEAT_STOPS[i - 1];
    if (v <= v1) {
      const t = (v - v0) / (v1 - v0);
      return c0.map((c, k) => c + (c1[k] - c) * t);
    }
  }
  return HEAT_STOPS[HEAT_STOPS.length - 1][1];
}
const HEAT_MAX = 0.6;
(function drawHeatKey() {
  const stops = [];
  for (let k = 0; k <= 12; k++) {
    const v = (HEAT_MAX * k) / 12;
    const c = heatColor(v);
    stops.push(`rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${Math.max(0.25, c[3] / 255).toFixed(2)}) ${((100 * k) / 12).toFixed(1)}%`);
  }
  document.getElementById("heat-bar").style.background = `linear-gradient(90deg, ${stops.join(", ")})`;
  document.getElementById("heat-ticks").replaceChildren(...[[0, "0"], [0.1, "0.1"], [0.25, "0.25"], [0.5, "0.5"]].map(([v, t]) => {
    const s = document.createElement("span");
    s.textContent = t;
    s.style.left = `${(100 * v) / HEAT_MAX}%`;
    return s;
  }));
})();
let heatTimer = 0;
function drawHeat(coarse) {
  const res = coarse ? 1 : 0.5;
  const w = Math.round((VIEW.x1 - VIEW.x0) / res), h = Math.round(VIEW.depth / res);
  heatCanvas.width = w;
  heatCanvas.height = h;
  const ctx = heatCanvas.getContext("2d");
  const img = ctx.createImageData(w, h);
  const sc = scene();
  for (let j = 0; j < h; j++) {
    for (let i = 0; i < w; i++) {
      const p = toPitch(VIEW.x0 + (i + 0.5) * res, (j + 0.5) * res);
      if (p.x > 119.6) continue;
      const v = xgOf({ ...sc, shot: p });
      const c = heatColor(v);
      const o = (j * w + i) * 4;
      img.data[o] = c[0]; img.data[o + 1] = c[1]; img.data[o + 2] = c[2]; img.data[o + 3] = c[3];
    }
  }
  ctx.putImageData(img, 0, 0);
  heatImg.setAttribute("href", heatCanvas.toDataURL());
}
function scheduleHeat(coarse) {
  document.getElementById("heat-key").hidden = !state.heat;
  if (!state.heat) { heatImg.setAttribute("opacity", "0"); return; }
  heatImg.setAttribute("opacity", "1");
  clearTimeout(heatTimer);
  if (coarse) drawHeat(true);
  heatTimer = setTimeout(() => drawHeat(false), coarse ? 160 : 0);
}

// ---------- readout ----------
const dots = document.getElementById("dots");
for (let i = 0; i < 100; i++) dots.append(document.createElement("i"));
const fmtXg = (v) => (v < 0.005 ? "0.00" : v.toFixed(2));

function sentence(v) {
  const n = Math.round(v * 100);
  if (n < 1) return "Fewer than 1 in 100 shots like this are scored.";
  if (n >= 99) return "Almost every shot like this is scored.";
  const plain = n >= 45 && n <= 55 ? " Roughly a coin toss." : n <= 3 ? " A hopeful effort." : "";
  return `About ${n} in 100 shots like this are scored.${plain}`;
}

function featureRows(f) {
  return [
    ["Distance to goal", `${f["shot distance"].toFixed(1)} yd`],
    ["Angle to aim at", `${f.shot_angle.toFixed(0)}°`],
    ["Defenders within 5 yards", f["Number of opponents in 5 yards"]],
    ["Bodies between ball and goal", `${f["Players between goal"]}${f["Players between goal"] ? " (keeper included)" : ""}`],
    ["Keeper's distance from goal", `${f["gk distance"].toFixed(1)} yd`],
  ];
}

function whatIfs(base) {
  const items = [];
  const sc = scene();
  const { x: sx, y: sy } = state.shot;
  const blockers = state.defenders.filter((d) => inShootingTriangle(sx, sy, d.x, d.y));
  if (blockers.length) {
    items.push([`Move the ${blockers.length > 1 ? `${blockers.length} defenders` : "defender"} out of the way`,
      xgOf({ ...sc, defenders: state.defenders.filter((d) => !blockers.includes(d)) })]);
  }
  const gkd = Math.hypot(state.keeper.x - 120, state.keeper.y - 40);
  if (gkd > 1.5) items.push(["Keeper back on the line", xgOf({ ...sc, keeper: { x: 119.5, y: 40 } })]);
  else items.push(["Keeper rushes out 5 yards", xgOf({ ...sc, keeper: { x: 120 - 5 * (120 - sx) / Math.hypot(120 - sx, 40 - sy), y: 40 - 5 * (40 - sy) / Math.hypot(120 - sx, 40 - sy) } })]);
  items.push([state.body === "Foot" ? "Same spot, but a header" : "Same spot, but with the foot",
    xgOf({ ...sc, body: state.body === "Foot" ? "Head" : "Foot" })]);
  items.push([state.firstTime ? "Take a touch first" : "Strike it first time", xgOf({ ...sc, firstTime: !state.firstTime })]);
  const dist = Math.hypot(120 - sx, 40 - sy);
  if (dist > 7) {
    const k = 5 / dist;
    items.push(["Five yards closer", xgOf({ ...sc, shot: { x: sx + (120 - sx) * k, y: sy + (40 - sy) * k } })]);
  }
  return items
    .map(([label, v]) => [label, v - base])
    .sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]))
    .slice(0, 4);
}

let shown = 0;
let anim = 0;
function animateNumber(target) {
  const el = document.getElementById("xg-value");
  cancelAnimationFrame(anim);
  if (reduceMotion) { el.textContent = fmtXg(target); shown = target; return; }
  const from = shown, t0 = performance.now();
  const step = (t) => {
    const k = Math.min(1, (t - t0) / 220);
    shown = from + (target - from) * (1 - (1 - k) ** 3);
    el.textContent = fmtXg(shown);
    if (k < 1) anim = requestAnimationFrame(step);
  };
  anim = requestAnimationFrame(step);
}

function update({ heat = false, coarse = false } = {}) {
  positionTokens();
  markPreset();
  const f = features(scene());
  const v = model.predict(f, state.model);
  animateNumber(v);
  document.getElementById("board-xg").textContent = fmtXg(v);
  document.getElementById("xg-sentence").textContent = sentence(v);
  const n = Math.round(v * 100);
  [...dots.children].forEach((d, i) => d.classList.toggle("on", i < n));
  const avg = model.spec.stats.goal_rate;
  const ratio = v / avg;
  document.getElementById("xg-compare").textContent =
    ratio >= 1.15 ? `${ratio.toFixed(1)} times better than the average open-play shot (${avg.toFixed(2)}).`
    : ratio <= 0.87 ? `Worse than the average open-play shot (${avg.toFixed(2)}).`
    : `About as good as the average open-play shot (${avg.toFixed(2)}).`;

  const dl = document.getElementById("features");
  dl.replaceChildren(...featureRows(f).flatMap(([k, val]) => {
    const dt = document.createElement("dt"); dt.textContent = k;
    const dd = document.createElement("dd"); dd.textContent = val;
    return [dt, dd];
  }));

  const ul = document.getElementById("whatif");
  ul.replaceChildren(...whatIfs(v).map(([label, d]) => {
    const li = document.createElement("li");
    const a = document.createElement("span"); a.textContent = label;
    const b = document.createElement("span");
    const r = Math.round(d * 100) / 100;
    b.className = `delta ${r > 0 ? "up" : r < 0 ? "down" : "none"}`;
    b.textContent = r === 0 ? "no change" : `${r > 0 ? "+" : "−"}${Math.abs(r).toFixed(2)}`;
    li.append(a, b);
    return li;
  }));

  if (heat || coarse) scheduleHeat(coarse);
  saveHash();
}

// ---------- shareable link ----------
let hashTimer = 0;
function saveHash() {
  clearTimeout(hashTimer);
  hashTimer = setTimeout(() => {
    const r = (v) => Math.round(v * 10) / 10;
    const s = [r(state.shot.x), r(state.shot.y), r(state.keeper.x), r(state.keeper.y),
      state.body[0], { "Ground Pass": "g", "Low Pass": "l", "High Pass": "h", None: "n" }[state.pass],
      state.pattern === "Regular Play" ? "r" : "s", state.firstTime ? 1 : 0,
      ...state.defenders.flatMap((d) => [r(d.x), r(d.y)])].join(",");
    history.replaceState(null, "", `#${s}`);
  }, 300);
}
function loadHash() {
  const parts = location.hash.slice(1).split(",");
  if (parts.length < 8) return false;
  const num = (i) => parseFloat(parts[i]);
  if ([0, 1, 2, 3].some((i) => !Number.isFinite(num(i)))) return false;
  state.shot = { x: clamp(num(0), 78, 119.6), y: clamp(num(1), 0, 80) };
  state.keeper = { x: clamp(num(2), 78, 120), y: clamp(num(3), 0, 80) };
  state.body = parts[4] === "H" ? "Head" : "Foot";
  state.pass = { g: "Ground Pass", l: "Low Pass", h: "High Pass", n: "None" }[parts[5]] ?? "Ground Pass";
  state.pattern = parts[6] === "s" ? "Non Regular Play" : "Regular Play";
  state.firstTime = parts[7] === "1";
  state.defenders = [];
  for (let i = 8; i + 1 < parts.length && state.defenders.length < 10; i += 2) {
    const x = parseFloat(parts[i]), y = parseFloat(parts[i + 1]);
    if (Number.isFinite(x) && Number.isFinite(y)) state.defenders.push({ x: clamp(x, 78, 120), y: clamp(y, 0, 80) });
  }
  state.preset = null;
  return true;
}

// ---------- start ----------
fetch("model.json")
  .then((r) => { if (!r.ok) throw new Error(`model.json: ${r.status}`); return r.json(); })
  .then((spec) => {
    model = new XGModel(spec);
    applyView();
    document.getElementById("stat-shots").textContent = spec.stats.shots.toLocaleString("en-GB");
    document.getElementById("stat-matches").textContent = spec.stats.matches.toLocaleString("en-GB");
    loadHash();
    syncForm();
    renderTokens();
    update();
  })
  .catch((err) => {
    document.getElementById("xg-sentence").textContent = "The model didn't load. Refresh the page to try again.";
    console.error(err);
  });
