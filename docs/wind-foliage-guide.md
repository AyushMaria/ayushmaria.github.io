# Wind-Swept Trees & Plants — Implementation Guide for ayushmaria.github.io

> **Status: implemented** (see the file map below). This document is kept as the
> design rationale and tuning reference; the code is the source of truth.
>
> | Guide step | Where it lives now |
> |---|---|
> | 1. Shared wind field | `wind.js` — `WIND`, `WIND_GLSL`, `attachWind()`, `updateWindMaterials()` |
> | 2. Leaf-card crowns, species palette | `town-props.js` — `crownGeometry()`, `SPECIES`, `buildTrees()`; `textures.js` — `leafClusterTexture()` |
> | 3. Bushes, beds, window boxes | `town-props.js` — `buildBushes()`; `town-world.js` — `BUSHES`, `BED_SLOTS`, `attachWind(SHARED.bloom …)` |
> | 4. Grass | `grass.js` — `buildGrass()`; `town-world.js` — `isOpenGround()` |
> | 5. Wild flowers | `town-props.js` — `buildWildFlowers()` |
> | 6. Tuning / perf / motion | `PERF_PRESETS.crownCards / grass / flowers`, reduced-motion wind floor, `window._wind` |
>
> Live tweaking from the console: `_wind.uniforms.uWindStrength.value = 0.6`, `_wind.setAngle(Math.PI)`, `_wind.timeFrequency = 0.2`.

How bruno-simon.com does it (source: `AyushMaria/PortfolioInspo`), translated to the Isekai Town stack: Three.js r150 over WebGL, ES modules from CDN, no bundler, no TSL.

---

## 0. What Bruno actually does (read this first)

Five files carry the whole effect. The important part is not any one of them — it's that they all sample **one shared wind field**.

| File | Role | The idea to steal |
|---|---|---|
| `sources/Game/Wind.js` | Global wind field | `offsetNode(worldXZ) → vec2`: two octaves of a tiling Perlin texture, scrolled along a wind direction by a time uniform, times strength. Everything in the world calls this one function. |
| `sources/Game/World/Foliage.js` | Tree canopies & bushes | A canopy is **80 small planes (0.8 u) scattered inside a sphere** and merged into one geometry, then instanced per tree. Leaf shape comes from an **alpha texture** (`foliageSDF.png`, 128 px) with `alphaTest`. **The wind does not move the vertices — it rotates the leaf texture's UVs** by `wind.length() * 2.2`, so the silhouette flickers like leaves turning. Plane normals are blended 85 % toward the sphere normal so the whole crown shades like a ball. Colour = `mix(colorA, colorB, smoothstep(dot(normal, sunDir)))` — two-tone per species. |
| `sources/Game/World/Trees.js` | Species | Same `Foliage` class, different colour pairs: birch `#ff4f2b → #ff903f`, oak `#b4b536 → #d8cf3b`, cherry `#ff6d6d → #ff9990`. That's the "different colours" — palette, not geometry. |
| `sources/Game/World/Grass.js` | Grass | One `BufferGeometry` of triangles (3 verts per blade, 280×280 blades), blades rotated to face the camera in the vertex shader, and **only the tip vertex** is displaced by `wind * height * 2`. |
| `sources/Game/World/Flowers.js` | Flowers | Clusters of 3–10 instances of 8 tiny planes each; vertex offset by `wind * clamp(y, 0, 1)` so the head sways and the base stays put. |

Ours already has a wind hook (`applyWindSway()` in `town-world.js`) but it is a plain sine with no direction, no gusts and no shared state. Steps 1–2 replace it; 3–5 build on it.

---

## 1. Build the shared wind field (`wind.js`, new)

**Goal:** one module, one set of uniforms, one GLSL function every material can call.

**1.1** Generate a tiling Perlin noise texture at boot (Bruno renders his on the GPU in `Noises.js`; a 256×256 `DataTexture` from JS is fine for us):

```js
// wind.js
import * as THREE from 'three';

function makeNoiseTexture(size = 256) {
  // value noise, 4 octaves, tileable because we wrap the lattice
  const data = new Uint8Array(size * size);
  const lattice = 16, grid = new Float32Array(lattice * lattice).map(() => Math.random());
  const smooth = t => t * t * (3 - 2 * t);
  const sample = (x, y) => {
    const xi = Math.floor(x), yi = Math.floor(y), tx = smooth(x - xi), ty = smooth(y - yi);
    const g = (i, j) => grid[((j % lattice + lattice) % lattice) * lattice + ((i % lattice + lattice) % lattice)];
    const a = g(xi, yi) + (g(xi + 1, yi) - g(xi, yi)) * tx;
    const b = g(xi, yi + 1) + (g(xi + 1, yi + 1) - g(xi, yi + 1)) * tx;
    return a + (b - a) * ty;
  };
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    let v = 0, amp = 0.5, f = 1;
    for (let o = 0; o < 4; o++) { v += sample(x / size * lattice * f, y / size * lattice * f) * amp; amp *= 0.5; f *= 2; }
    data[y * size + x] = Math.min(255, v * 255);
  }
  const tex = new THREE.DataTexture(data, size, size, THREE.RedFormat);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.needsUpdate = true;
  return tex;
}
```

**1.2** Uniforms shared by reference (the same objects go into every material, so one `update()` moves everything):

```js
export const WIND = {
  angle: Math.PI * 0.6,
  uniforms: {
    uWindNoise:     { value: makeNoiseTexture() },
    uWindDir:       { value: new THREE.Vector2(Math.sin(Math.PI * 0.6), Math.cos(Math.PI * 0.6)) },
    uWindStrength:  { value: 0.5 },     // 0–1
    uWindFreq:      { value: 0.5 },     // Bruno: positionFrequency
    uWindTime:      { value: 0 },
  },
  timeFrequency: 0.1,
  update(delta) {
    // Bruno: localTime += delta * timeFrequency * strength (gusts speed up as they strengthen)
    this.uniforms.uWindTime.value += delta * this.timeFrequency * this.uniforms.uWindStrength.value;
  },
};
```

**1.3** The GLSL twin of `offsetNode` — same maths, same two octaves:

```js
export const WIND_GLSL = /* glsl */`
  uniform sampler2D uWindNoise;
  uniform vec2  uWindDir;
  uniform float uWindStrength;
  uniform float uWindFreq;
  uniform float uWindTime;

  vec2 windOffset(vec2 worldXZ) {
    vec2 p = worldXZ * uWindFreq;
    float n1 = texture2D(uWindNoise, p * 0.2 + uWindDir * uWindTime).r - 0.5;
    float n2 = texture2D(uWindNoise, p * 0.1 + uWindDir * uWindTime * 0.2).r - 0.5;
    return uWindDir * (n1 + n2) * uWindStrength;
  }
`;
```

**1.4** A helper that injects it into any `MeshStandardMaterial` (this replaces `applyWindSway`). The vertex shader gets the world XZ of the *object* (`modelMatrix[3]` or `instanceMatrix[3]`) so a whole plant bends together, and a per-vertex weight so bases stay planted:

```js
export function attachWind(material, { amplitude = 1, mode = 'vertex' } = {}) {
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, WIND.uniforms);
    shader.uniforms.uWindAmp = { value: amplitude };
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\n${WIND_GLSL}\nuniform float uWindAmp;\nvarying float vWindMag;`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        #ifdef USE_INSTANCING
          vec2 plantXZ = (modelMatrix * instanceMatrix)[3].xz;
        #else
          vec2 plantXZ = modelMatrix[3].xz;
        #endif
        vec2 w = windOffset(plantXZ);
        vWindMag = length(w);
        float weight = clamp(position.y, 0.0, 1.0);   // 0 at the base, 1 at ≥1u up
        transformed.xz += w * uWindAmp * weight;`);
    // fragment side is used by step 2 (texture rotation)
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\nvarying float vWindMag;`);
  };
  material.customProgramCacheKey = () => 'wind-' + mode;
  return material;
}
```

**1.5** Wire it: `import { WIND, attachWind } from './wind.js'` in `town-world.js`, call `WIND.update(delta)` once in `animate()` (where `windUniforms.uTime` is bumped today), and swap the two `applyWindSway(...)` calls for `attachWind(...)`. Delete `applyWindSway` and `windUniforms`. Nothing else changes yet — the beds and window boxes now sway in a consistent direction with gusts.

**Check:** drive to the Town Square; the hedge beds and window-box blooms should lean the same way and pulse together every few seconds instead of each doing its own sine.

---

## 2. Rebuild the tree canopies as leaf-card foliage (`town-props.js`)

**Goal:** replace the four icosahedron blobs per tree with Bruno's scattered-planes crown, lit two-tone, with the texture-rotation flutter. Still **one `InstancedMesh` for all trees** — same draw-call budget as now.

**2.1 Leaf alpha texture.** Bruno ships `foliageSDF.png` (128 px, a soft clover-shaped blob). Draw an equivalent on a canvas in `textures.js`:

```js
export function leafClusterTexture() {
  return memo('leaf', () => {
    const S = 128, [cv, c] = canvas(S, S);
    c.fillStyle = '#000'; c.fillRect(0, 0, S, S);
    // 5 overlapping soft discs = one leaf cluster
    [[64, 56, 30], [40, 72, 24], [88, 72, 24], [52, 40, 20], [78, 40, 20]].forEach(([x, y, r]) => {
      const g = c.createRadialGradient(x, y, r * 0.3, x, y, r);
      g.addColorStop(0, '#fff'); g.addColorStop(1, '#000');
      c.globalCompositeOperation = 'lighter';
      c.fillStyle = g; c.beginPath(); c.arc(x, y, r, 0, Math.PI * 2); c.fill();
    });
    const tex = new THREE.CanvasTexture(cv);
    tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
    return tex;
  });
}
```

**2.2 Crown geometry** — port of `Foliage.setGeometry()`. 80 planes, positions on a sphere with radius `1 - rng()^3` (dense at the rim, sparse in the middle), random roll, normals lerped 85 % toward the sphere normal:

```js
export function crownGeometry(count = 80, cardSize = 0.8, seed = 1) {
  const rng = mulberry32(seed);              // any small seeded PRNG (keep the town deterministic)
  const planes = [];
  for (let i = 0; i < count; i++) {
    const plane = new THREE.PlaneGeometry(cardSize, cardSize);
    const pos = new THREE.Vector3().setFromSpherical(
      new THREE.Spherical(1 - Math.pow(rng(), 3), Math.PI * 2 * rng(), Math.PI * rng()));
    plane.rotateZ(rng() * 9999);
    plane.translate(pos.x, pos.y, pos.z);
    const n = pos.clone().normalize(), nrm = plane.attributes.normal;
    const p = plane.attributes.position, v = new THREE.Vector3();
    for (let k = 0; k < 4; k++) {
      v.fromBufferAttribute(p, k).lerp(n, 0.85);
      nrm.setXYZ(k, v.x, v.y, v.z);
    }
    planes.push(plane);
  }
  return mergeBufferGeometries(planes);   // three@0.150 name; mergeGeometries in newer versions
}
```

Note Bruno's cards are **not** billboards. In `setFromReferences()` every canopy instance is rotated to face the camera's default viewing direction once, at build time (`object.lookAt(towardCamera)`), and the 85 % normal blend does the rest. With our follow camera orbiting the cart, use `THREE.DoubleSide` and skip the lookAt — the random roll already hides the flat sides.

**2.3 Foliage material** — one `MeshStandardMaterial` for every species, colours per instance:

```js
const leafMat = new THREE.MeshStandardMaterial({
  alphaMap: leafClusterTexture(), alphaTest: 0.3,   // Bruno: threshold = 0.3
  side: THREE.DoubleSide, roughness: 0.9,
});
attachWind(leafMat, { amplitude: 0.35, mode: 'leaf' });
```

Then extend `attachWind` for `mode === 'leaf'` with the two things Bruno does in the fragment shader:

```glsl
// (a) rotate the alpha UV by the wind magnitude → flutter without moving geometry
//     Bruno: rotateUV(uv(), wind.length() * 2.2, vec2(0.5))
#include <alphamap_fragment>  →  replace with:
  float a = vWindMag * 2.2;
  vec2 ruv = (vUv - 0.5) * mat2(cos(a), -sin(a), sin(a), cos(a)) + 0.5;
  diffuseColor.a *= texture2D(alphaMap, ruv).g;

// (b) two-tone by sun direction: mix(colorA, colorB, smoothstep(0,1, dot(N, sunDir)))
//     colorA comes from instanceColor (per tree), colorB = colorA * uLeafTint (per material)
#include <color_fragment>  →  append:
  float lit = smoothstep(0.0, 1.0, dot(normalize(vNormalW), uSunDir));
  diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * uLeafTint, lit);
```

(`vNormalW` is the world normal — add `varying vec3 vNormalW;` and `vNormalW = normalize(mat3(modelMatrix) * objectNormal);` in `beginnormal_vertex`; `uSunDir` is `EVENING.sun.position` normalised, `uLeafTint` ≈ `vec3(1.25, 1.2, 0.9)` to warm the lit side.)

**2.4 Species palette** — the whole "different colours" effect. Put it in `BUILDINGS`-style data and set `instanceColor` per tree:

```js
const SPECIES = {
  oak:    { a: 0xb4b536, tint: [1.2, 1.15, 1.0] },  // Bruno's oak   #b4b536 → #d8cf3b
  birch:  { a: 0xff4f2b, tint: [1.0, 1.8,  1.4] },  // Bruno's birch #ff4f2b → #ff903f
  cherry: { a: 0xff6d6d, tint: [1.0, 1.4,  1.35] }, // Bruno's cherry #ff6d6d → #ff9990
  green:  { a: 0x4f9b3c, tint: [1.3, 1.25, 1.0] },  // keep some of our current green
};
// TREES entries become [x, z, scale, 'oak'] etc. — mix species per area:
// Town Square green + cherry, Main Street oak, Research Quarter birch, wilderness green.
```

Since the tint is a material uniform, either keep one material per species (4 draw calls total — fine) or encode B in a second instanced attribute. Four materials is simpler.

**2.5 Replace `buildTrees()`**: trunk stays as it is; canopy = `new InstancedMesh(crownGeometry(), speciesMat, n)` per species, matrix = position, scale × 1.9 (crown radius), `setColorAt(i, species.a)`. Keep `castShadow`; Bruno also masks the shadow with the same alpha (`maskShadowNode`) — in r150 set `leafMat.alphaTest` and the depth material honours it automatically.

**Check:** with `?debug`, draw calls should stay within a few of today's ~620. Visually: crowns that look like painted clusters, leaves that "twinkle" as gusts pass, warm side facing the evening sun.

---

## 3. Bushes, flower beds and window boxes → same foliage system

**3.1** Bushes are literally `new Foliage(references, '#b4b536', '#d8cf3b')` in Bruno's code — a canopy without a trunk, scale 0.6–0.9. Add `[x, z, scale, species]` bush positions along the wall, around the fountain and beside doors; render them as more instances of the oak material. Zero new draw calls.

**3.2** Hedge beds: replace the swaying green box with a row of 3–4 bush instances (`species: 'green'`, scale 0.7) on top of the planter. Keep the instanced bloom clusters.

**3.3** Window boxes: keep the current instanced blooms but give them `attachWind(SHARED.bloom, { amplitude: 0.08 })` — they inherit the gusts for free.

---

## 4. Grass (`grass.js`, new) — optional but it's what sells the wind

Bruno's grass is one mesh of 78 400 triangles that **wraps around the camera** (blade positions are `mod`-ed into a square centred on the view). We can be far cheaper because our roads and plaza cover most of the town.

**4.1** Geometry: `N` blades × 3 vertices, attributes `position(xz)`, `heightRandomness`, and a `tipness` (1 for the top vertex, 0 for the two base vertices). Generate blades only on grass: skip any position within the road strips / roundabout / plaza (reuse `zoneKeyAt` style tests or the road rectangles from `initTownWorld`). Budget: 25 000 blades on the high tier, 6 000 on the low tier (`PERF_PRESETS`).

**4.2** `ShaderMaterial` vertex shader (direct port of `Grass.setMaterial`):

```glsl
${WIND_GLSL}
attribute float tipness; attribute float heightRandomness;
uniform float uBladeW, uBladeH;
void main() {
  vec3 base = vec3(position.x, 0.0, position.y);
  float h = uBladeH * mix(0.4, 1.0, heightRandomness);
  // blade shape: tip up, base ±width
  vec3 v = base + vec3((1.0 - tipness) * (uv.x * 2.0 - 1.0) * uBladeW, tipness * h, 0.0);
  // face the camera (billboard around Y)
  float ang = atan(base.z - cameraPosition.z, base.x - cameraPosition.x) - 1.5708;
  v.xz = base.xz + mat2(cos(ang), -sin(ang), sin(ang), cos(ang)) * (v.xz - base.xz);
  // wind: tip only, scaled by height  (Bruno: wind * tipness * height * 2)
  v.xz += windOffset(base.xz) * tipness * h * 2.0;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(v, 1.0);
}
```

Colour: darker at the base, lighter at the tip (`mix(0x3f7f33, 0x8fc25a, tipness)`), plus the evening warm shift the grade pass already applies. `frustumCulled = false`, `receiveShadow = true`.

**4.3** Fade the ground texture slightly darker under grass so blade bases don't float.

---

## 5. Flowers in the wild (optional)

Port `Flowers.js`: 8 tiny planes (0.08 u) per flower, 3–10 flowers per cluster, cluster positions hand-placed along the ring road and the approach to the south gate; instanced, `attachWind(mat, { amplitude: 1 })` with the default `clamp(y)` weight so heads sway. Colours from a small palette per cluster via `instanceColor` (`#ffffff`, `#ffd166`, `#ff6d6d`, `#c77dff`).

---

## 6. Tuning, perf and motion safety

* **Numbers to start from (Bruno's defaults):** direction angle `0.6π`, `positionFrequency 0.5`, `timeFrequency 0.1`, `strength 0.5` (his weather system remaps it 0.1–1). Ours should look calmer in an evening scene: `strength 0.35`.
* **Reduced motion:** when `REDUCED_MOTION` is true set `uWindStrength = 0.08` instead of 0 — a faint drift reads as "alive" without triggering motion sensitivity.
* **Perf tier:** on `low`, halve the crown card count (`crownGeometry(40)`), skip grass or use 6 000 blades, keep flowers off. Everything here is instanced or a single merged mesh, so the cost is fill rate and vertex count, not draw calls.
* **Debug:** add `uWindStrength`, `uWindFreq`, angle to the `?debug` console log, or expose `window._wind = WIND.uniforms` so you can tweak from the console while driving.
* **Shadows:** alpha-tested leaf cards cast alpha-tested shadows automatically; if the shadow looks too dense, raise `alphaTest` to 0.4 for the depth material only (`leafMat.customDepthMaterial`).

---

## 7. Order of work & task.md entries

1. `wind.js` + swap `applyWindSway` → `attachWind` (½ day, no visual risk).
2. Leaf textures + `crownGeometry()` + species materials; replace canopies in `buildTrees()` (1 day; biggest visual win).
3. Bushes/beds/window boxes on the same system (½ day).
4. Grass with PERF budget (1 day; test on a phone before keeping).
5. Wild flowers (½ day, optional).

Suggested `task.md` lines under a new **§2.8 Living Vegetation (Bruno Simon pattern)**:

```
- [ ] `wind.js` — shared noise-driven wind field (direction, gusts, time), `attachWind()` replaces `applyWindSway()`
- [ ] Leaf-card tree crowns (`crownGeometry`, alpha-tested leaf texture, UV-rotation flutter, two-tone sun shading)
- [ ] Species palette — oak / birch / cherry / green per zone via `instanceColor`
- [ ] Bushes + hedge beds on the foliage system
- [ ] Grass blades on open ground (tip-only wind, camera-facing, PERF-tiered)
- [ ] Wild flower clusters along the ring road
- [ ] Reduced-motion wind floor (0.08) and `?debug` wind tweakables
```

---

### Reference map (PortfolioInspo)

* `sources/Game/Wind.js` — field, uniforms, time advance
* `sources/Game/Noises.js` — GPU-rendered tiling Perlin texture (`perlinNode`)
* `sources/Game/World/Foliage.js` — crown geometry, alpha SDF, UV-rotation wind, two-tone colour, see-through fade near the vehicle (skip that for us)
* `sources/Game/World/Trees.js` — species colours, instancing bodies + leaves
* `sources/Game/World/Bushes.js` — Foliage reused with the oak palette
* `sources/Game/World/Grass.js` — blade geometry, camera-facing, tip wind
* `sources/Game/World/Flowers.js` — cluster placement, y-weighted wind
* `static/foliage/foliageSDF.png` — the leaf-cluster alpha texture to imitate
