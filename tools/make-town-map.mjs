/**
 * Generate docs/town-map.svg — a top-down reference map of the town,
 * built from the same plan the 3D world uses (town-layout.js).
 * North (−z) is at the top. Contour lines every metre of height.
 *
 *   node tools/make-town-map.mjs
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = readFileSync(join(ROOT, 'town-layout.js'), 'utf8');
const T = await import('data:text/javascript;charset=utf-8,' + encodeURIComponent(src));
const t0 = Date.now();
const L = T.buildLayout({ res: 1 });
const buildMs = Date.now() - t0;

const V = 84;                                   // half-size of the view
const f = (v) => v.toFixed(1);
const out = [];
const pathD = (pts, close = false) => pts.map((p, i) => `${i ? 'L' : 'M'}${f(p.x ?? p[0])},${f(p.z ?? p[1])}`).join('') + (close ? 'Z' : '');
const rectPts = (b, grow = 0) => {
  const c = Math.cos(b.heading), s = Math.sin(b.heading), w = b.w / 2 + grow, d = b.d / 2 + grow;
  return [[-w, -d], [w, -d], [w, d], [-w, d]].map(([u, v]) => [b.x + u * c + v * s, b.z - u * s + v * c]);
};
out.push(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="${-V} ${-V} ${2 * V} ${2 * V}" width="1400" height="1400" font-family="Inter, system-ui, sans-serif">`);
out.push(`<style>
.ground{fill:#cfd8b4}.contour{fill:none;stroke:#8a7a55;stroke-opacity:.35;stroke-width:.18}.contour5{stroke-opacity:.6;stroke-width:.3}
.field{fill:#e2d39a;stroke:#9aa66c;stroke-width:.4}.water{fill:none;stroke:#8fb7c9;stroke-linecap:round;stroke-linejoin:round}.pool{fill:#8fb7c9}
.road{fill:none;stroke:#ebe0c8;stroke-linecap:round;stroke-linejoin:round}.edge{fill:none;stroke:#a99a7c;stroke-linecap:round;stroke-linejoin:round}
.path{fill:none;stroke:#c9b58f;stroke-linecap:round;stroke-dasharray:1 .6}.plaza{fill:#e2d6bd;stroke:#a99a7c;stroke-width:.3}
.wall{fill:none;stroke:#7d7466;stroke-width:1.8;stroke-linecap:butt}.gate{fill:#d9d0bf;stroke:#7d7466;stroke-width:.5}
.bridge{fill:#d9d0bf;stroke:#7d7466;stroke-width:.4}.house{fill:#d8b9a0;stroke:#a98a72;stroke-width:.25}
.key{fill:#c46a4a;stroke:#4d3428;stroke-width:.4}.hall{fill:#8a3b2c;stroke:#4d3428;stroke-width:.5}.extra{fill:#d79a62;stroke:#4d3428;stroke-width:.4}
.tree{fill:#93ab72;stroke:#748c55;stroke-width:.25}.bush{fill:#a9c08a}.rock{fill:#9b958a}.lamp{fill:#ffcf5a;stroke:#6b5a3a;stroke-width:.2}
.door{fill:#fff6e0}.lbl{font-size:2.6px;font-weight:600;fill:#2d2620;text-anchor:middle;paint-order:stroke;stroke:#faf6ec;stroke-width:.8px}
.zone{font-size:3.4px;font-weight:700;letter-spacing:.4px;fill:#5e5040;text-anchor:middle;opacity:.65}
.fall{stroke:#fff;stroke-width:.5}.ring{fill:none;stroke:#b23;stroke-dasharray:2 1.4;stroke-width:.35;opacity:.6}
</style>`);
out.push(`<rect class="ground" x="${-V}" y="${-V}" width="${2 * V}" height="${2 * V}"/>`);

// contours (marching squares on the height grid)
{
  const { n, step, ext, data } = L.grid;
  const segs = new Map();
  const xy = (i, j) => [-ext + i * step, -ext + j * step];
  for (let lvl = 1; lvl <= 12; lvl++) {
    const parts = [];
    for (let j = 0; j < n - 1; j++) for (let i = 0; i < n - 1; i++) {
      const [x0, z0] = xy(i, j);
      if (x0 < -V - 2 || x0 > V + 2 || z0 < -V - 2 || z0 > V + 2) continue;
      const a = data[j * n + i], b = data[j * n + i + 1], c = data[(j + 1) * n + i + 1], d = data[(j + 1) * n + i];
      const pts = [];
      const e = (p, q, P, Q) => { if ((p < lvl) !== (q < lvl)) { const t = (lvl - p) / (q - p); pts.push([P[0] + (Q[0] - P[0]) * t, P[1] + (Q[1] - P[1]) * t]); } };
      e(a, b, [x0, z0], [x0 + step, z0]); e(b, c, [x0 + step, z0], [x0 + step, z0 + step]);
      e(c, d, [x0 + step, z0 + step], [x0, z0 + step]); e(d, a, [x0, z0 + step], [x0, z0]);
      if (pts.length >= 2) parts.push(`M${f(pts[0][0])},${f(pts[0][1])}L${f(pts[1][0])},${f(pts[1][1])}`);
      if (pts.length === 4) parts.push(`M${f(pts[2][0])},${f(pts[2][1])}L${f(pts[3][0])},${f(pts[3][1])}`);
    }
    segs.set(lvl, parts.join(''));
  }
  for (const [lvl, d] of segs) out.push(`<path class="contour${lvl % 5 === 0 ? ' contour5' : ''}" d="${d}"/>`);
}
for (const fl of L.fields) out.push(`<polygon class="field" points="${rectPts(fl).map(p => p.map(f).join(',')).join(' ')}"/>`);
out.push(`<path class="water" style="stroke-width:${L.river.width}" d="${pathD(L.river.path.pts)}"/>`);
out.push(`<path class="water" style="stroke-width:${L.stream.width}" d="${pathD(L.stream.path.pts)}"/>`);
for (const p of L.pools) out.push(`<ellipse class="pool" cx="${p.x}" cy="${p.z}" rx="${p.rx}" ry="${p.rz}" transform="rotate(${f(-p.rot * 180 / Math.PI)} ${p.x} ${p.z})"/>`);
for (const fa of L.falls) out.push(`<line class="fall" x1="${f(fa.x - fa.tz)}" y1="${f(fa.z + fa.tx)}" x2="${f(fa.x + fa.tz)}" y2="${f(fa.z - fa.tx)}"/>`);
for (const pl of L.plazas) out.push(`<polygon class="plaza" points="${pl.pts.map(p => p.join(',')).join(' ')}"/>`);
for (const r of L.roads) out.push(`<path class="edge" style="stroke-width:${r.width + 0.8}" d="${pathD(r.path.pts)}"/>`);
for (const r of L.roads) out.push(`<path class="road" style="stroke-width:${r.width}" d="${pathD(r.path.pts)}"/>`);
for (const p of L.paths) out.push(`<path class="path" style="stroke-width:${p.width}" d="${pathD(p.path.pts)}"/>`);
{
  const B = L.bridge;
  out.push(`<polygon class="bridge" points="${rectPts({ x: B.x, z: B.z, w: B.width, d: B.length, heading: B.heading }).map(p => p.map(f).join(',')).join(' ')}"/>`);
}
// wall with gaps
{
  const P = L.wall.path.pts; let run = [];
  const flush = () => { if (run.length > 1) out.push(`<path class="wall" d="${pathD(run)}"/>`); run = []; };
  for (let i = 0; i <= P.length; i++) { const p = P[i % P.length]; if (L.wallGap(p.s)) flush(); else run.push(p); }
  flush();
  for (const g of L.wall.gaps) out.push(`<circle class="gate" cx="${f(g.x)}" cy="${f(g.z)}" r="${g.kind === 'gate' ? 2.4 : 1.6}"/>`);
}
for (const h of L.houses) out.push(`<polygon class="house" points="${rectPts(h).map(p => p.map(f).join(',')).join(' ')}"/>`);
for (const b of L.buildings) {
  const cls = b.temple ? 'hall' : b.project ? 'key' : 'extra';
  out.push(`<polygon class="${cls}" points="${rectPts(b).map(p => p.map(f).join(',')).join(' ')}"/>`);
  out.push(`<circle class="door" cx="${f(b.x + Math.sin(b.heading) * b.d / 2)}" cy="${f(b.z + Math.cos(b.heading) * b.d / 2)}" r=".6"/>`);
}
for (const t of L.trees) out.push(`<circle class="tree" cx="${f(t.x)}" cy="${f(t.z)}" r="${f(1.6 * t.s)}"/>`);
for (const b of L.bushes) out.push(`<circle class="bush" cx="${f(b.x)}" cy="${f(b.z)}" r="${f(b.s)}"/>`);
for (const r of L.rocks) out.push(`<circle class="rock" cx="${f(r.x)}" cy="${f(r.z)}" r="${f(0.35 * r.s)}"/>`);
for (const l of L.lamps) out.push(`<circle class="lamp" cx="${f(l.x)}" cy="${f(l.z)}" r=".6"/>`);
out.push(`<circle class="ring" cx="${T.WORLD.playX}" cy="${T.WORLD.playZ}" r="${T.WORLD.playR}"/>`);
for (const b of L.buildings) out.push(`<text class="lbl" x="${f(b.x)}" y="${f(b.z - Math.max(b.w, b.d) / 2 - 1.2)}">${b.label.replace(/'/g, '’')}</text>`);
for (const [k, sp] of Object.entries(L.spawns)) out.push(`<text class="zone" x="${f(sp.x)}" y="${f(sp.z + 5)}">${T.ZONE_NAMES[k].toUpperCase()}</text>`);
out.push('</svg>');
writeFileSync(join(ROOT, 'docs', 'town-map.svg'), out.join('\n'));
console.log(`town-map.svg written · layout built in ${buildMs} ms · ${L.houses.length} houses · ${L.lamps.length} lamps · ${L.trees.length} trees · ${L.bushes.length} bushes · gaps ${L.wall.gaps.map(g => g.kind + '@' + g.x.toFixed(0) + ',' + g.z.toFixed(0)).join(' ')} · falls ${L.falls.length}`);
