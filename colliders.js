/**
 * colliders.js — the static collision shapes of the town (ground plane, 2D)
 *
 * Shared by the cart (cart.js) and the knockable props (props-physics.js).
 * A collider is one of:
 *   THREE.Box3                         axis-aligned box (legacy)
 *   { circle, x, z, r }                trees, lamps, towers, fountain…
 *   { ring, r, x?, z? }                stay INSIDE radius r of (x, z) — the play area
 *   { obb, x, z, hw, hd, heading }     rotated box: hw across, hd along the heading
 *                                      (buildings and townhouses face their street)
 *   { seg, ax, az, bx, bz, r }         capsule: wall runs, river and stream banks
 *   { ellipse, x, z, a, b, heading }   oval footprint (the stadium); a across, b along
 * Any collider may carry `skip(x, z)` → true to ignore it at that point
 * (the river under the bridge deck).
 */

/** Make an OBB collider (caches the heading's sin / cos). */
export function obb(x, z, hw, hd, heading) {
  return { obb: true, x, z, hw, hd, heading, c: Math.cos(heading), s: Math.sin(heading) };
}

/** Make an elliptical collider (a = half-width across, b = half-depth along the heading). */
export function ellipse(x, z, a, b, heading = 0) {
  return { ellipse: true, x, z, a, b, heading, c: Math.cos(heading), s: Math.sin(heading) };
}

/** Make a capsule collider. */
export function seg(ax, az, bx, bz, r) {
  return { seg: true, ax, az, bx, bz, r, minX: Math.min(ax, bx) - r, maxX: Math.max(ax, bx) + r, minZ: Math.min(az, bz) - r, maxZ: Math.max(az, bz) + r };
}

/**
 * Is the point (px, pz) inside the collider? Returns the outward surface
 * normal { nx, nz } (pointing into free space) or null.
 */
export function pointHit(col, px, pz) {
  if (col.skip && col.skip(px, pz)) return null;
  if (col.isBox3) {
    if (px < col.min.x || px > col.max.x || pz < col.min.z || pz > col.max.z) return null;
    const dl = px - col.min.x, dr = col.max.x - px, dn = pz - col.min.z, df = col.max.z - pz;
    const m = Math.min(dl, dr, dn, df);
    if (m === dl) return { nx: -1, nz: 0 };
    if (m === dr) return { nx: 1, nz: 0 };
    if (m === dn) return { nx: 0, nz: -1 };
    return { nx: 0, nz: 1 };
  }
  if (col.circle) {
    const dx = px - col.x, dz = pz - col.z, d2 = dx * dx + dz * dz;
    if (d2 >= col.r * col.r) return null;
    const d = Math.sqrt(d2) || 1;
    return { nx: dx / d, nz: dz / d };
  }
  if (col.seg) {
    if (px < col.minX || px > col.maxX || pz < col.minZ || pz > col.maxZ) return null;
    const dx = col.bx - col.ax, dz = col.bz - col.az, L = dx * dx + dz * dz || 1;
    let t = ((px - col.ax) * dx + (pz - col.az) * dz) / L;
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    const ex = px - (col.ax + dx * t), ez = pz - (col.az + dz * t), d2 = ex * ex + ez * ez;
    if (d2 >= col.r * col.r) return null;
    const d = Math.sqrt(d2);
    if (d < 1e-6) { const l = Math.sqrt(L); return { nx: -dz / l, nz: dx / l }; }
    return { nx: ex / d, nz: ez / d };
  }
  if (col.obb) {
    const dx = px - col.x, dz = pz - col.z;
    const u = dx * col.c - dz * col.s, v = dx * col.s + dz * col.c;   // across, along
    const du = col.hw - Math.abs(u), dv = col.hd - Math.abs(v);
    if (du <= 0 || dv <= 0) return null;
    if (du < dv) { const sg = u < 0 ? -1 : 1; return { nx: sg * col.c, nz: -sg * col.s }; }
    const sg = v < 0 ? -1 : 1;
    return { nx: sg * col.s, nz: sg * col.c };
  }
  if (col.ellipse) {
    const dx = px - col.x, dz = pz - col.z;
    const u = dx * col.c - dz * col.s, v = dx * col.s + dz * col.c;
    if ((u * u) / (col.a * col.a) + (v * v) / (col.b * col.b) >= 1) return null;
    let gu = u / (col.a * col.a), gv = v / (col.b * col.b);
    const l = Math.hypot(gu, gv) || 1; gu /= l; gv /= l;
    return { nx: gu * col.c + gv * col.s, nz: -gu * col.s + gv * col.c };
  }
  if (col.ring) {
    const dx = px - (col.x || 0), dz = pz - (col.z || 0), d2 = dx * dx + dz * dz;
    if (d2 <= col.r * col.r) return null;
    const d = Math.sqrt(d2);
    return { nx: -dx / d, nz: -dz / d };
  }
  return null;
}

/**
 * Push a circle of radius r at (x, z) out of the collider:
 * returns { nx, nz, pen } (move by n × pen) or null when clear.
 */
export function circlePush(col, x, z, r) {
  if (col.skip && col.skip(x, z)) return null;
  if (col.isBox3) {
    const qx = Math.max(col.min.x, Math.min(x, col.max.x)), qz = Math.max(col.min.z, Math.min(z, col.max.z));
    const dx = x - qx, dz = z - qz, d = Math.hypot(dx, dz);
    if (d >= r) return null;
    if (d > 1e-5) return { nx: dx / d, nz: dz / d, pen: r - d };
    const h = pointHit(col, x, z);
    const dl = x - col.min.x, dr = col.max.x - x, dn = z - col.min.z, df = col.max.z - z;
    return { nx: h.nx, nz: h.nz, pen: Math.min(dl, dr, dn, df) + r };
  }
  if (col.circle) {
    const dx = x - col.x, dz = z - col.z, rr = col.r + r, d2 = dx * dx + dz * dz;
    if (d2 >= rr * rr) return null;
    const d = Math.sqrt(d2) || 1;
    return { nx: dx / d, nz: dz / d, pen: rr - d };
  }
  if (col.seg) {
    if (x < col.minX - r || x > col.maxX + r || z < col.minZ - r || z > col.maxZ + r) return null;
    const dx = col.bx - col.ax, dz = col.bz - col.az, L = dx * dx + dz * dz || 1;
    let t = ((x - col.ax) * dx + (z - col.az) * dz) / L;
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    const ex = x - (col.ax + dx * t), ez = z - (col.az + dz * t), d = Math.hypot(ex, ez), rr = col.r + r;
    if (d >= rr) return null;
    if (d < 1e-6) { const l = Math.sqrt(L); return { nx: -dz / l, nz: dx / l, pen: rr }; }
    return { nx: ex / d, nz: ez / d, pen: rr - d };
  }
  if (col.obb) {
    const dx = x - col.x, dz = z - col.z;
    const u = dx * col.c - dz * col.s, v = dx * col.s + dz * col.c;
    const qu = Math.max(-col.hw, Math.min(u, col.hw)), qv = Math.max(-col.hd, Math.min(v, col.hd));
    const lu = u - qu, lv = v - qv, d = Math.hypot(lu, lv);
    if (d >= r) return null;
    if (d > 1e-5) {
      const nu = lu / d, nv = lv / d;
      return { nx: nu * col.c + nv * col.s, nz: -nu * col.s + nv * col.c, pen: r - d };
    }
    const h = pointHit(col, x, z);
    return { nx: h.nx, nz: h.nz, pen: Math.min(col.hw - Math.abs(u), col.hd - Math.abs(v)) + r };
  }
  if (col.ellipse) {
    const dx = x - col.x, dz = z - col.z;
    const u = dx * col.c - dz * col.s, v = dx * col.s + dz * col.c;
    const A = col.a + r, Bb = col.b + r, m = Math.sqrt((u * u) / (A * A) + (v * v) / (Bb * Bb));
    if (m >= 1) return null;
    let gu = u / (A * A), gv = v / (Bb * Bb);
    const l = Math.hypot(gu, gv) || 1; gu /= l; gv /= l;
    const pen = (1 - m) * Math.min(A, Bb);
    return { nx: gu * col.c + gv * col.s, nz: -gu * col.s + gv * col.c, pen };
  }
  if (col.ring) {
    const dx = x - (col.x || 0), dz = z - (col.z || 0), d = Math.hypot(dx, dz), lim = col.r - r;
    if (d <= lim) return null;
    return { nx: -dx / d, nz: -dz / d, pen: d - lim };
  }
  return null;
}

/** Distance from a point to a building footprint (0 inside) — for interaction range. */
export function footprintDist(px, pz, b) {
  const dx = px - b.x, dz = pz - b.z, c = Math.cos(b.heading || 0), s = Math.sin(b.heading || 0);
  const u = dx * c - dz * s, v = dx * s + dz * c;
  return Math.hypot(Math.max(Math.abs(u) - b.w / 2, 0), Math.max(Math.abs(v) - b.d / 2, 0));
}

/**
 * Bucket colliders into a coarse grid so "what's near this point" doesn't
 * test every collider in town (the grass scatter asks ~20 000 times).
 * Rings (the play-area boundary) are returned everywhere.
 */
export function colliderIndex(list, cell = 8) {
  const cells = new Map(), always = [];
  const key = (i, j) => i * 73856093 ^ j * 19349663;
  const add = (c, x0, x1, z0, z1) => {
    for (let i = Math.floor(x0 / cell); i <= Math.floor(x1 / cell); i++)
      for (let j = Math.floor(z0 / cell); j <= Math.floor(z1 / cell); j++) {
        const k = key(i, j);
        if (!cells.has(k)) cells.set(k, []);
        cells.get(k).push(c);
      }
  };
  for (const c of list) {
    if (c.isBox3) add(c, c.min.x, c.max.x, c.min.z, c.max.z);
    else if (c.circle) add(c, c.x - c.r, c.x + c.r, c.z - c.r, c.z + c.r);
    else if (c.seg) add(c, c.minX, c.maxX, c.minZ, c.maxZ);
    else if (c.obb) { const R = Math.hypot(c.hw, c.hd); add(c, c.x - R, c.x + R, c.z - R, c.z + R); }
    else if (c.ellipse) { const R = Math.max(c.a, c.b); add(c, c.x - R, c.x + R, c.z - R, c.z + R); }
    else always.push(c);
  }
  const empty = [];
  return {
    /** Colliders whose bounds touch the cell containing (x, z) — pad with `r` by testing neighbours. */
    near(x, z, r = 0) {
      if (r <= 0) return cells.get(key(Math.floor(x / cell), Math.floor(z / cell))) || empty;
      const out = new Set();
      for (let i = Math.floor((x - r) / cell); i <= Math.floor((x + r) / cell); i++)
        for (let j = Math.floor((z - r) / cell); j <= Math.floor((z + r) / cell); j++)
          for (const c of cells.get(key(i, j)) || empty) out.add(c);
      return out;
    },
    always,
  };
}
