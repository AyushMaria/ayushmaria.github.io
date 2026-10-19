/**
 * props-physics.js — knockable barrels, crates and tavern chairs (task.md §2.11)
 *
 * A tiny 2D (ground-plane) physics pass, no engine: every prop is a circle
 * on the ground with a velocity. The cart is an oriented rectangle; when it
 * overlaps a prop the prop is pushed out and given an impulse from the cart's
 * velocity along the contact normal (mass-weighted, a little bounce), and the
 * cart loses a matching bit of speed. Props then slide with ground friction,
 * bump into each other and bounce off the town's static colliders
 * (buildings, trees, lamps, the wall), spin a little and wobble on a spring
 * before settling upright.
 *
 * Each kind of prop is one InstancedMesh, so all of them cost 3 draw calls.
 */
import * as THREE from 'three';
import { mergeBufferGeometries } from 'https://cdn.jsdelivr.net/npm/three@0.150.0/examples/jsm/utils/BufferGeometryUtils.js';

const CART_HALF = { x: 1.0, z: 1.75 };   // matches the cart's footprint probes
const CART_MASS = 8;
const FRICTION = 2.6;                     // exponential slide damping (1/s)
const FRICTION_DECEL = 1.2;               // plus a constant decel (units/s²) so they actually stop
const BOUNCE_CART = 0.35, BOUNCE_PROP = 0.4, BOUNCE_WALL = 0.3;

function boxAt(w, h, d, x, y, z) {
  const g = new THREE.BoxGeometry(w, h, d).toNonIndexed();
  g.translate(x, y, z);
  return g;
}

function chairGeometry() {
  const parts = [boxAt(0.48, 0.06, 0.46, 0, 0.47, 0)];                    // seat
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) parts.push(boxAt(0.05, 0.47, 0.05, sx * 0.2, 0.235, sz * 0.19)); // legs
  parts.push(boxAt(0.48, 0.5, 0.05, 0, 0.77, -0.21));                       // back
  return mergeBufferGeometries(parts, false);
}

export class KnockableProps {
  /**
   * @param {THREE.Scene} scene
   * @param {{ colliders: Array, materials: { barrel, crate, chair },
   *           onHit?: (strength:number) => void, reducedMotion?: boolean }} opts
   */
  constructor(scene, { colliders, materials, onHit = null, reducedMotion = false }) {
    this.colliders = colliders;
    this.onHit = onHit;
    this.reducedMotion = reducedMotion;
    this.bodies = [];
    this.kinds = {
      barrel: { geo: new THREE.CylinderGeometry(0.4, 0.42, 1.0, 12).translate(0, 0.5, 0), mat: materials.barrel, r: 0.42, mass: 1.6 },
      crate:  { geo: new THREE.BoxGeometry(0.7, 0.7, 0.7).translate(0, 0.35, 0),          mat: materials.crate,  r: 0.45, mass: 1.0 },
      chair:  { geo: chairGeometry(),                                                       mat: materials.chair,  r: 0.34, mass: 0.6 },
    };
    this._pending = [];
    this._scene = scene;
    this._m = new THREE.Matrix4();
    this._q = new THREE.Quaternion();
    this._e = new THREE.Euler(0, 0, 0, 'YXZ');
    this._p = new THREE.Vector3();
    this._s = new THREE.Vector3(1, 1, 1);
  }

  /** Queue a prop; call build() once all are added. */
  add(kind, x, z, yaw = 0) { this._pending.push({ kind, x, z, yaw }); return this; }

  build() {
    for (const [name, k] of Object.entries(this.kinds)) {
      const list = this._pending.filter(p => p.kind === name);
      if (!list.length) continue;
      const mesh = new THREE.InstancedMesh(k.geo, k.mat, list.length);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      mesh.frustumCulled = false;            // instances move; the box would go stale
      mesh.name = `knockable-${name}`;
      this._scene.add(mesh);
      k.mesh = mesh;
      list.forEach((p, i) => {
        this.bodies.push({
          kind: k, index: i, r: k.r, mass: k.mass,
          x: p.x, z: p.z, vx: 0, vz: 0, yaw: p.yaw, yawV: 0,
          tx: 0, tz: 0, tvx: 0, tvz: 0,      // tilt (wobble) about X / Z, and its rate
          awake: true,
        });
      });
    }
    this._pending = [];
    for (const b of this.bodies) this._write(b);
    for (const k of Object.values(this.kinds)) if (k.mesh) k.mesh.instanceMatrix.needsUpdate = true;
    return this;
  }

  _write(b) {
    this._e.set(b.tx, b.yaw, b.tz);
    this._q.setFromEuler(this._e);
    this._p.set(b.x, 0, b.z);
    this._m.compose(this._p, this._q, this._s);
    b.kind.mesh.setMatrixAt(b.index, this._m);
  }

  /** Kick a body along (nx, nz) with normal speed `vn` (units/s) — adds spin + wobble. */
  _kick(b, nx, nz, dv) {
    b.vx += nx * dv; b.vz += nz * dv;
    b.yawV += (Math.random() - 0.5) * dv * 1.6;
    if (!this.reducedMotion) {
      // lean away from the hit: rotate about the axis perpendicular to the push
      b.tvx += nz * dv * 0.9;
      b.tvz -= nx * dv * 0.9;
    }
    b.awake = true;
  }

  update(delta, cart) {
    const dt = Math.min(delta, 0.05);
    if (!this.bodies.length || dt <= 0) return;
    const bodies = this.bodies;

    // ── Cart contact (oriented rectangle vs circle) ──────────────
    const cp = cart.position, rot = cart.rotation;
    const s = Math.sin(rot), c = Math.cos(rot);
    const vCart = (cart.velocity || 0) * 60;                 // cart speed is per 60 fps frame
    const cvx = s * vCart, cvz = c * vCart;
    let hitStrength = 0;
    for (const b of bodies) {
      const dx = b.x - cp.x, dz = b.z - cp.z;
      if (dx * dx + dz * dz > 9) continue;                   // far from the cart
      const fx = dx * c - dz * s, fz = dx * s + dz * c;      // cart-local (x right, z forward)
      const qx = THREE.MathUtils.clamp(fx, -CART_HALF.x, CART_HALF.x);
      const qz = THREE.MathUtils.clamp(fz, -CART_HALF.z, CART_HALF.z);
      let lx = fx - qx, lz = fz - qz, d = Math.hypot(lx, lz), pen;
      if (d < 1e-5) {                                         // centre inside the cart: leave by the nearest side
        const ex = CART_HALF.x - Math.abs(fx), ez = CART_HALF.z - Math.abs(fz);
        if (ex < ez) { lx = Math.sign(fx) || 1; lz = 0; pen = ex + b.r; } else { lx = 0; lz = Math.sign(fz) || 1; pen = ez + b.r; }
        d = 1;
      } else {
        if (d >= b.r) continue;
        pen = b.r - d;
      }
      const nlx = lx / d, nlz = lz / d;
      const nx = nlx * c + nlz * s, nz = -nlx * s + nlz * c; // back to world
      b.x += nx * pen; b.z += nz * pen;
      const vn = (cvx - b.vx) * nx + (cvz - b.vz) * nz;     // closing speed
      if (vn > 0) {
        const j = vn * (1 + BOUNCE_CART) / (1 / b.mass + 1 / CART_MASS);
        this._kick(b, nx, nz, j / b.mass);
        // the cart pays for it: lose the matching momentum along its heading
        const dCart = -(j / CART_MASS) * (nx * s + nz * c);
        cart.velocity += dCart / 60;
        hitStrength = Math.max(hitStrength, vn);
      }
      b.awake = true;
    }
    if (hitStrength > 1.5 && this.onHit) this.onHit(Math.min(1, hitStrength / 12));

    // ── Prop vs prop ──────────────────────────────────────────────
    for (let i = 0; i < bodies.length; i++) {
      const a = bodies[i];
      for (let k = i + 1; k < bodies.length; k++) {
        const b = bodies[k];
        if (!a.awake && !b.awake) continue;
        const dx = b.x - a.x, dz = b.z - a.z, rr = a.r + b.r;
        const d2 = dx * dx + dz * dz;
        if (d2 >= rr * rr || d2 < 1e-8) continue;
        const d = Math.sqrt(d2), nx = dx / d, nz = dz / d, pen = rr - d;
        const wa = b.mass / (a.mass + b.mass), wb = a.mass / (a.mass + b.mass);
        a.x -= nx * pen * wa; a.z -= nz * pen * wa;
        b.x += nx * pen * wb; b.z += nz * pen * wb;
        const vn = (a.vx - b.vx) * nx + (a.vz - b.vz) * nz;
        if (vn > 0) {
          const j = vn * (1 + BOUNCE_PROP) / (1 / a.mass + 1 / b.mass);
          this._kick(a, -nx, -nz, j / a.mass);   // a is pushed back along -n
          this._kick(b, nx, nz, j / b.mass);     // b forward along +n
        }
        a.awake = b.awake = true;
      }
    }

    // ── Integrate, friction, static colliders, wobble ────────────
    let moved = false;
    for (const b of bodies) {
      if (!b.awake) continue;
      b.x += b.vx * dt; b.z += b.vz * dt;
      const sp = Math.hypot(b.vx, b.vz);
      if (sp > 0) {
        const ns = Math.max(0, sp * Math.exp(-FRICTION * dt) - FRICTION_DECEL * dt);
        b.vx *= ns / sp; b.vz *= ns / sp;
      }
      this._collideStatic(b);
      b.yaw += b.yawV * dt;
      b.yawV *= Math.exp(-3 * dt);
      // wobble: damped spring back to upright
      b.tvx += (-55 * b.tx - 5 * b.tvx) * dt; b.tx += b.tvx * dt;
      b.tvz += (-55 * b.tz - 5 * b.tvz) * dt; b.tz += b.tvz * dt;
      b.tx = THREE.MathUtils.clamp(b.tx, -0.45, 0.45);
      b.tz = THREE.MathUtils.clamp(b.tz, -0.45, 0.45);
      this._write(b);
      moved = true;
      const still = Math.hypot(b.vx, b.vz) < 0.02 && Math.abs(b.yawV) < 0.02 &&
        Math.abs(b.tx) + Math.abs(b.tz) + Math.abs(b.tvx) + Math.abs(b.tvz) < 0.004;
      if (still) { b.vx = b.vz = b.yawV = b.tx = b.tz = b.tvx = b.tvz = 0; this._write(b); b.awake = false; }
    }
    if (moved) for (const k of Object.values(this.kinds)) if (k.mesh) k.mesh.instanceMatrix.needsUpdate = true;
  }

  // Push a prop out of buildings / circles / the wall ring and bounce it.
  _collideStatic(b) {
    for (const col of this.colliders) {
      let nx = 0, nz = 0, pen = 0;
      if (col.isBox3) {
        const qx = THREE.MathUtils.clamp(b.x, col.min.x, col.max.x);
        const qz = THREE.MathUtils.clamp(b.z, col.min.z, col.max.z);
        const dx = b.x - qx, dz = b.z - qz, d = Math.hypot(dx, dz);
        if (d >= b.r) continue;
        if (d > 1e-5) { nx = dx / d; nz = dz / d; pen = b.r - d; }
        else {                                   // centre inside the box: nearest face
          const dl = b.x - col.min.x, dr = col.max.x - b.x, dn = b.z - col.min.z, df = col.max.z - b.z;
          const m = Math.min(dl, dr, dn, df);
          if (m === dl) nx = -1; else if (m === dr) nx = 1; else if (m === dn) nz = -1; else nz = 1;
          pen = m + b.r;
        }
      } else if (col.circle) {
        const dx = b.x - col.x, dz = b.z - col.z, rr = col.r + b.r;
        const d2 = dx * dx + dz * dz;
        if (d2 >= rr * rr) continue;
        const d = Math.sqrt(d2) || 1;
        nx = dx / d; nz = dz / d; pen = rr - d;
      } else if (col.ring) {
        const d = Math.hypot(b.x, b.z), lim = col.r - b.r;
        if (d <= lim) continue;
        nx = -b.x / d; nz = -b.z / d; pen = d - lim;
      } else continue;
      b.x += nx * pen; b.z += nz * pen;
      const vn = b.vx * nx + b.vz * nz;
      if (vn < 0) { b.vx -= (1 + BOUNCE_WALL) * vn * nx; b.vz -= (1 + BOUNCE_WALL) * vn * nz; b.yawV *= 0.6; }
    }
  }
}
