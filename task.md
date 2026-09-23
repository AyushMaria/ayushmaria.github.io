# Phase 1: Foundation & Cart System

## 1.1 Singleton Orchestrator (`town-game.js`)
- [ ] Create `TownGame` singleton class with `getInstance()` pattern
- [ ] Async init waterfall: scene → terrain → buildings → cart → camera → particles → lighting
- [ ] Migrate `initTownWorld()` into `TownGame` class
- [ ] Refactor all modules to reference `TownGame.getInstance()` instead of `window._*` globals

## 1.2 Drivable Cart (`cart.js`)
- [x] Procedural cart model (wooden body, 4 wheels, canopy, lantern, hay bale)
- [x] Bicycle-model physics (velocity, steering, acceleration/deceleration)
- [x] AABB collision with building bounding boxes (push-back response)
- [x] WASD / Arrow key controls
- [x] Mobile joystick support (`setJoystickInput`)
- [x] Lantern sway animation & point light pulse
- [x] Wheel spin animation tied to velocity
- [x] Fast-travel teleport via GSAP
- [ ] **Boost mechanic** — Shift key for speed boost with visual/audio feedback
- [ ] **Auto-unstuck** — Detect if cart is jammed for 3+ seconds, auto-nudge free
- [x] **Stats tracking** — Persist `distanceDriven` and `timePlayed` to localStorage (lives in `achievements.js`, see §3.4)
- [ ] **Input abstraction** — Named actions (`forward`, `backward`, `boost`) mapped to keyboard + gamepad + touch (currently raw key checks)

## 1.3 Follow Camera
- [x] Scroll-wheel zoom (lerp between min/max distance)
- [x] Speed-based dynamic zoom (camera pulls back when fast)
- [x] Collision shake effect
- [x] Isometric toggle (`Q` key)
- [ ] **Spherical coordinates** — Replace hardcoded `behind` offset with `phi`/`theta`/`radius` system (Bruno Simon's `View.js` pattern)
- [ ] **Mouse orbit** — Temporary orbit around cart on mouse-drag, snap back on release
- [ ] **Cinematic transitions** — Smooth lerp to preset camera positions when entering buildings
- [ ] **Extract to `camera.js`** — Currently lives inside `cart.js`, should be its own module

## 1.4 Module Architecture (`index.html`)
- [x] ES module imports for `cart.js`, `particles.js`, `post-processing.js`, `audio.js`
- [x] Removed inline `initTownWorld()` script block from `index.html`
- [x] Controls hint overlay (fades out after 5s)
- [ ] **Three.js r160+ upgrade** — Post-processing still imports from `three@0.150.0`
- [ ] **Zone fast-travel** — HUD buttons should auto-drive cart along road spline (`#zone-hud` is now wired to `Cart.teleportTo()` — GSAP glide, not a road-spline drive yet)
- [x] **Bugfix: `initMiniMap()` threw at boot** — `#town-map` / `#town-map-toggle` were missing from the markup, which killed the rest of the inline script (ambient sound toggle never enabled). Markup restored.

## 1.5 Core Patterns (Bruno Simon Reference)
- [ ] **Priority-based event system** — Custom event emitter with ordered tick callbacks (physics → camera → particles)
- [ ] **Centralized materials registry** — `materials.js` with `Map`-based shared materials (currently `new MeshStandardMaterial()` per building)

---

# Phase 2: Visual Polish & Atmosphere

## 2.1 Particle Systems (`particles.js`)
- [x] Fireflies (shader-based, bobbing + blinking)
- [x] Chimney smoke (velocity + wind drift, per-building)
- [x] Fountain spray (parabolic arc with gravity)
- [x] Cart dust trail (circular buffer, speed-gated spawning)
- [x] Campfire flames (additive blending, pinch-inward shape)

## 2.2 Lighting — Permanent Golden-Hour Evening
> The day/night cycle (`DayCycle`, theme-toggle sync, phase presets) was **removed** in favour of one fixed evening look; the 🌙 page toggle is hidden while the town is up.
- [x] `EVENING` preset in `town-world.js` (sky gradient, low south-west sun, violet ambient fill, peach fog, lamp/window/cone glow level, sprite tint) applied once by `applyEvening()`
- [x] Sky dome gradient shader (dusk blue → peach horizon → pale gold)
- [x] Lamps, window panes, tavern cone lights and clock faces lit at ~70 %
- [x] Fireflies and crickets always on (evening ambience)
- [ ] **Shadow map optimization** — Shadow camera should follow player viewport, not cover entire scene

## 2.3 Post-Processing (`post-processing.js`)
- [x] `UnrealBloomPass` — Glowing lanterns, emissives, fireflies (0.42 / 0.5 / 0.88 for the evening)
- [x] Colour grading shader (single pass: warm shift + saturation)
- [x] ~~Vignette~~ — **removed** (it read as a circular "focus mode")
- [x] ~~Day/night colour shift, night bloom/vignette ramps~~ — removed with the cycle
- [ ] **Depth of field** — Optional DOF pass for cinematic feel

## 2.4 Camera Upgrades
- [x] Scroll-wheel zoom
- [x] Speed-based dynamic zoom
- [x] Collision shake
- [x] Isometric view toggle
- [ ] Spherical coordinates (see §1.3)
- [ ] Mouse orbit (see §1.3)
- [ ] Cinematic transitions (see §1.3)
- [ ] **Speed lines / FOV kick** — Visual effect when cart is moving fast

## 2.5 Building Details
- [x] Timber framing (corner columns + horizontal bands on rectangular buildings)
- [x] Hanging animated signs (The Tavern, The Forge — swinging on spring)
- [x] Chimney smoke (The Forge, Ledger Sanctum)
- [x] Flower beds (Town Square — with subtle rotation animation)
- [x] Market stalls with canopy (Town Square)
- [x] Glowing rune circle (Research Quarter — rotating torus)
- [x] Floating books orbiting Vortex Observatory
- [x] Tavern tables with legs
- [x] Tavern mugs on tables
- [x] Barrels near tavern
- [x] Campfire with animated flames + fire glow light
- [x] Fountain (base + water + spout + particle spray)
- [x] Signboards at roundabout exits and ring road intersections
- [x] **NPC silhouettes** — Billboard sprites that wave when cart approaches (canvas-drawn, 3 variants × 2 frames = 6 shared `SpriteMaterial`s; tinted by `DayCycle`)
- [x] **Flower boxes under windows** — Small planter geometry on building facades (3 `InstancedMesh`es for every box + bed bloom in town; per-instance bloom colours)
- [ ] **Lightning particle effects** — Between Research Quarter towers
- [ ] **Musical note particle emitter** — Bard's stage near Tavern
- [x] **Volumetric cone lights** — Warm interior light spilling from Tavern windows (additive cone shader + ground pool, intensity follows nightness)
- [x] **Wind sway on flower beds** — Vertex displacement via `applyWindSway()` (`onBeforeCompile`, shared program, also applied to window-box blooms)

## 2.7 Reference-Art Pass & Layout Fixes
- [x] **Roads widened** — spokes 7 → 12, ring 5 → 9, roundabout out to r=13; spokes now run to the gates / clock tower
- [x] **Cobblestone streets** — procedural cobble texture (`textures.js`), plaza in a warmer tone; roads lifted + camera near 0.5 to kill z-fighting stripes
- [x] **Buildings moved off the roads** — Vortex Observatory and Navigator's Tower stood *in* the east/west spokes; Tiny Tots, Colosseum, Citadel, Concierge, Volley nudged clear of the strips; signboards moved roadside; tavern tables/fire/barrels were inside the tavern
- [x] **Collision rewrite** — rotated 5-point footprint test instead of an axis-aligned padded box; slides along walls per axis; colliders for fountain, lamps, trees, stalls, tables, campfire, wall towers (`Cart._blocked`)
- [x] **Cart tuning** — accel 0.010 → 0.0045, top speed 0.32 → 0.26, steer rate 0.035 → 0.022, lock π/5 → π/6, wheelbase 2.2 → 4.2, softer bounce
- [x] **Tudor facades** — cream plaster texture, merged timber frame (posts, storey bands, studs, diagonal braces, gable bracing), framed lattice windows with shutters (instanced) and window boxes on every storey, arched doors, stone chimneys
- [x] **Gable tile roofs** — `gableRoofGeometry()` with terracotta tile texture and closed plaster gables (ridge along X for the Tavern)
- [x] **Circular city wall** — `buildCityWall()`: instanced curtain wall + crenellations, 8 towers, gatehouses with closed doors E/W/S, ring collider keeps the cart inside
- [x] **Clock tower** — gothic landmark at the end of Main Street with clock faces (emissive at night)
- [x] **Round leafy trees** — instanced trunks + 4-blob canopies with per-instance greens (was cone pines)
- [x] **Market stalls** — curved red-orange awnings, crates; café umbrellas on the tavern terrace; hedge beds
- [x] **Sky dressing** — drifting cumulus sprites (tinted by DayCycle), fogged mountain range past the wall, grass texture on the ground
- [x] **Bugfix: gable roof slopes were wound inside-out** (front-face culled → roofs looked half missing); trees/lamps/signs pulled clear of the Ledger, Forge, Stats and Guild footprints
- [x] **Chibi cursor follower removed** (Step 25 JS + CSS) — it read as an annoying stickman on the pointer
- [ ] **Gate doors that open** — animate the doors + extend the drivable area outside the wall (currently drawn shut)
- [ ] **Dormer windows / balconies** on the taller Tudor buildings (reference has them)
- [ ] **Hanging lanterns** on facades (reference: bracketed lamps beside doors)

## 2.6 Audio System (`audio.js`)
- [x] Shaped noise sources — pink (wind, fountain, brake, crickets) and brown (wheels, fire bed) instead of raw white noise; seamless loop points; smoothed (`setTargetAtTime`) volume changes, no zipper clicks
- [x] Ambient wind (low-passed pink, slow breathing)
- [x] Cart rolling rumble (speed-linked volume + filter opening; speed scale matches `cart.js` units)
- [x] Cart brake hush (band-passed, brake-gated — the old highpass screech is gone)
- [x] Fountain (positional, band-passed pink with a slow burble AM, rolloff + max distance)
- [x] Campfire (positional brown bed + short square-wave crackle pops)
- [x] Evening crickets (narrow band, 22 Hz chirp pulse, very quiet)
- [x] Zone transition chime (triangle C6-E6-G6, routed through the master gain)
- [x] Lazy audio context init on first user interaction
- [x] Zone detection via position angle (Town Square / East / West / North)
- [x] **Mute that works** — `#sound-toggle` is one site-wide switch (icon shows the current state: 🔊 on / 🔇 muted), dispatches `sound:change`; the town's `AudioSystem` drives the listener master gain from it; landing-page loops are torn down on `town:enter`; preference saved in `localStorage['isekai-sound']`
- [ ] **Engine/horse sound** — Dedicated clip-clop or engine hum tied to cart cadence
- [ ] **UI interaction sounds** — Proximity prompt appear, modal open/close

## 2.8 Living Vegetation (Bruno Simon's Wind / Foliage pattern)
> Design notes and tuning reference: `docs/wind-foliage-guide.md`
- [x] `wind.js` — shared noise-driven wind field (direction, gusts, time); `attachWind()` replaces the old sine `applyWindSway()`
- [x] Leaf-card tree crowns (`crownGeometry`, alpha-tested leaf texture, UV-rotation flutter, two-tone sun shading) — one `InstancedMesh` per species
- [x] Species palette — oak / birch / cherry / green per quarter via `instanceColor`
- [x] Bushes + hedge beds on the foliage system (beside doors, fountain corners, inside the wall)
- [x] Grass blades on open ground (tip-only wind, camera-facing, fog; 22k blades high tier / 6k low; excluded from roads, plaza, ring road and every collider)
- [x] Wild flower clusters along the ring road and the approach (high tier only)
- [x] Reduced-motion wind floor (0.08) and `window._wind` tweakables; `?debug` log shows grass count and wind strength
- [x] **Placement tooling** — `tools/make-town-map.py` generates `docs/town-map.svg` + `docs/town-map-editor.html` (drag objects, road/overlap warnings, export snippets); the audit found and fixed flowers/rocks on the ring road, a bed on the south road and the Tavern touching the road
- [ ] Wind lines (Bruno's `WindLines.js`) — faint streaks that show the gust direction
- [ ] Grass "see-through" fade around the cart when it drives through tall patches

## 2.9 Town Square Fountain
- [x] Three-tier stone fountain (`buildFountain` in `town-props.js`) — round rimmed pool, fluted pedestal, three lathe-turned bowls (large → small) with a finial jet on top; replaces the old pipe-and-disc placeholder
- [x] Water: pool + per-bowl water discs, translucent spill sheets from each rim, `createFountainFall` droplets per tier and a parameterised `createFountainSpray` jet at the top
- [x] Roundabout cobbles extended under the pool rim; collider r 3.9; audio + shimmer still attached to the pool water

---

# Phase 3: Interaction & Content

## 3.1 Enhanced Interaction System
- [x] Proximity detection (within ~10 units of building with `project`)
- [x] `[E]` key to interact (opens `openModal(projectId)`)
- [x] Mobile interact button
- [x] Click-on-building via raycaster
- [x] Floating octahedron markers above interactive buildings (rotating + bobbing)
- [ ] **Input-aware icons** — Show "E" for keyboard, "A" for gamepad, tap icon for touch (Bruno Simon's `InteractivePoints.js` pattern)
- [ ] **Smooth distance fade-in/out** — Interaction prompt should opacity-fade, not hard show/hide
- [ ] **Cart "park" animation** — Cart turns slightly toward building, lantern brightens on approach

## 3.2 Project Modals Overhaul
- [x] Redesign modals to match isekai/fantasy town aesthetic ("quest scroll" parchment, ornamental corners, zone-coloured ribbon, gauge bars; night variant; `role=dialog` + focus trap)
- [x] Add transition animation when entering from 3D town (`.from-town` door-in animation; cart input locked via `settlement:modal` event; respects reduced motion)
- [x] Contextual modal content based on building zone (zone ribbon + building name + zone flavour line; per-project `flavor` override supported)

## 3.3 Minimap
- [x] Canvas-based minimap with circular clip
- [x] Ring road, spoke roads, fountain dot
- [x] Building dots (gold for interactive, beige for decorative)
- [x] Cart position arrow (rotates with cart heading)
- [x] **Current zone highlight** — Highlight the zone the cart is currently in
- [ ] **Extract to `minimap.js`** — Currently inline in `town-world.js`, should be its own module

## 3.4 Achievements & Exploration Tracking
- [x] `distanceDriven` counter persisted to localStorage
- [x] `timePlayed` counter persisted to localStorage
- [x] Building visit tracking (which buildings the player has approached)
- [x] Exploration progress percentage (buildings visited / total) — `#explore-hud` pill, tap for a summary
- [x] Achievement notifications (toast-style) for milestones — 12 achievements in `achievements.js`, `aria-live` toasts, chime on unlock
- [ ] Achievements panel / reset control (currently only the summary toast; `window._achievements.reset()` for dev)

---

# Phase 4: Performance & Polish

## 4.1 Performance Optimization
- [ ] **Shared materials registry** — Replace per-building `new MeshStandardMaterial()` with centralized `Map` (see §1.5)
- [ ] **Instanced meshes** — Use `InstancedMesh` for trees, rocks, flowers, barrels (same geometry + material)
- [ ] **LOD** — Reduce geometry detail for distant buildings
- [ ] **Frustum culling audit** — Ensure all meshes have proper bounding spheres
- [x] **Draw call monitoring** — `?debug` logs fps / calls / tris every 5s; budget 700. Measured on swiftshader: ~420 calls at the Square, ~650 on Main Street (shadow pass roughly doubles calls); unchanged after the reference-art pass thanks to instancing/merging (~85k tris)
- [ ] **Point-light budget** — 30 `PointLight`s (27 lamps + fire + orb + cart) are the main fragment cost; make far lamps emissive-only or cull by distance
- [ ] **Merge static building parts** — each building is ~10 meshes (timber, windows, door, trim); merge per building with `BufferGeometryUtils`
- [ ] **Texture atlas** — Combine small textures (signs, flowers) into a single atlas

## 4.2 Three.js r160+ Upgrade
- [ ] Update all CDN imports from `three@0.150.0` to `three@0.160+`
- [ ] Update `post-processing.js` EffectComposer imports
- [ ] Test API changes (shadow map, material, geometry renames)
- [ ] Verify all shaders compile with new GLSL requirements
- [ ] Update `importmap` or module paths in `index.html`

## 4.3 Mobile Polish
- [x] Mobile joystick UI and touch handling
- [x] Mobile interact button
- [x] **Fallback HUD navigation** — `#zone-hud` (4 buttons, icon-only on touch/≤640px) teleports the cart; also keyboard/screen-reader reachable
- [x] **Responsive controls overlay** — touch card (joystick/tap/quarters) swapped in at boot, smaller type ≤640px, minimap moved out from under the joystick, portrait vignette widened
- [x] **Performance scaling** — `detectPerfTier()` → `PERF_PRESETS` (pixel ratio, shadow map 1024, PCF instead of PCFSoft, particle counts, half-res bloom). Force with `?lowperf` / `?highperf`
- [ ] **Touch nipple controls** — Full virtual joystick with analog sensitivity (Bruno Simon's touch input pattern)
