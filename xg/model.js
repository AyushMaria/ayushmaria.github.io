// xG model in the browser: the thesis features, computed from positions on the pitch,
// and the trained Logistic Regression and CatBoost models exported from
// github.com/AyushMaria/Expected-xG-Goals-Football (scripts/export_web_model.py).
//
// Pitch coordinates follow StatsBomb: 120 x 80 yards, attacking towards x = 120,
// posts at y = 36 and y = 44.

export const GOAL_X = 120;
export const POST_LOW = 36;
export const POST_HIGH = 44;
export const GOAL_WIDTH = POST_HIGH - POST_LOW;

/** True if (px, py) is inside the triangle formed by the shot and the two posts (as in xg/features.py). */
export function inShootingTriangle(sx, sy, px, py) {
  if (GOAL_X - sx === 0) return false;
  const dx = px - sx;
  const s1 = (POST_LOW - sy) / (GOAL_X - sx);
  const s2 = (POST_HIGH - sy) / (GOAL_X - sx);
  return dx >= 0 && sy + s1 * dx < py && py < sy + s2 * dx;
}

/** Shot angle in degrees between the lines to the two posts (law of cosines, rounded like the training data). */
export function shotAngle(sx, sy) {
  const dx = sx - GOAL_X;
  const a = Math.hypot(dx, sy - POST_LOW);
  const b = Math.hypot(dx, sy - POST_HIGH);
  const c = (a * a + b * b - GOAL_WIDTH * GOAL_WIDTH) / (2 * a * b);
  const ang = (Math.acos(Math.max(-1, Math.min(1, c))) * 180) / Math.PI;
  return Number.isFinite(ang) ? Math.round(ang * 10) / 10 : 0;
}

/**
 * Model features from a scene.
 * scene = { shot: {x, y}, keeper: {x, y} | null, defenders: [{x, y}], body, pass, pattern, firstTime }
 */
export function features(scene) {
  const { x: sx, y: sy } = scene.shot;
  const gk = scene.keeper ?? { x: 120, y: 40 };
  let near = 0;
  let between = 0;
  for (const d of scene.defenders) {
    if ((sx - d.x) ** 2 + (sy - d.y) ** 2 <= 25) near += 1;
    if (inShootingTriangle(sx, sy, d.x, d.y)) between += 1;
  }
  if (scene.keeper && inShootingTriangle(sx, sy, gk.x, gk.y)) between += 1; // keeper counts, as in training
  return {
    "body part": scene.body,
    "Pass Type": scene.pass,
    "play pattern": scene.pattern,
    "first time": scene.firstTime ? "True" : "False",
    "shot distance": Math.hypot(sx - 120, sy - 40),
    shot_angle: shotAngle(sx, sy),
    "Number of opponents in 5 yards": near,
    "Players between goal": between,
    "x location shot": sx,
    "y location shot": sy,
    "gk distance": Math.hypot(gk.x - 120, gk.y - 40),
    "x gk location": gk.x,
    "y gk location": gk.y,
  };
}

export class XGModel {
  constructor(spec) {
    this.spec = spec;
    this.catNames = Object.keys(spec.categorical);
  }

  /** One-hot categorical features followed by standardised numeric features (sklearn ColumnTransformer order). */
  vector(f) {
    const v = [];
    for (const name of this.catNames) {
      for (const cat of this.spec.categorical[name]) v.push(String(f[name]) === cat ? 1 : 0);
    }
    this.spec.numeric.forEach((name, i) => {
      v.push((f[name] - this.spec.scaler.mean[i]) / this.spec.scaler.scale[i]);
    });
    return v;
  }

  logisticRegression(f) {
    const v = this.vector(f);
    let z = this.spec.lr.intercept;
    for (let i = 0; i < v.length; i++) z += this.spec.lr.coef[i] * v[i];
    return 1 / (1 + Math.exp(-z));
  }

  /** CatBoost oblivious trees: bit i of the leaf index is set when feature > border for split i. */
  catboost(f) {
    const v = this.vector(f);
    let s = 0;
    for (const [feat, border, leaves] of this.spec.cb.trees) {
      let idx = 0;
      for (let i = 0; i < feat.length; i++) if (v[feat[i]] > border[i]) idx |= 1 << i;
      s += leaves[idx];
    }
    const z = this.spec.cb.scale * s + this.spec.cb.bias;
    return 1 / (1 + Math.exp(-z));
  }

  predict(f, which = "cb") {
    return which === "lr" ? this.logisticRegression(f) : this.catboost(f);
  }
}
