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

## 2.2 Dynamic Lighting & Day/Night Cycle
- [x] `DayCycle` class with spherical sun orbit (Bruno Simon's pattern)
- [x] Sky dome gradient shader with 4-phase blending (day → sunset → night → dawn)
- [x] Sun color/intensity interpolation across phases
- [x] Ambient light color/intensity transitions
- [x] Fog color/density changes per phase
- [x] Lamp glow ramps up at night, dims during day
- [x] Window emissive intensity tied to night cycle
- [x] Theme toggle sync via `MutationObserver` on `data-theme`
- [x] Smooth snap transitions (handles progress wrapping)
- [ ] **Shadow map optimization** — Shadow camera should follow player viewport, not cover entire scene

## 2.3 Post-Processing (`post-processing.js`)
- [x] `UnrealBloomPass` — Glowing lanterns, emissives, fireflies
- [x] Vignette + color grading shader (single pass)
- [x] Day/night color shift (warm amber ↔ cool blue)
- [x] Night bloom strength increase (0.3 → 0.5)
- [x] Night vignette darkening (1.2 → 1.6)
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

## 2.6 Audio System (`audio.js`)
- [x] Ambient wind (looping, fluctuating volume)
- [x] Cart rolling sound (speed-linked volume + filter frequency)
- [x] Cart brake screech (highpass filtered, brake-gated)
- [x] Fountain splash (positional audio, bandpass filtered)
- [x] Fire crackle (positional audio, lowpass filtered, random volume)
- [x] Crickets at night (pulsating, highpass filtered)
- [x] Zone transition chime (procedural C6-E6-G6 arpeggio)
- [x] Lazy audio context init on first user interaction
- [x] Zone detection via position angle (Town Square / East / West / North)
- [ ] **Engine/horse sound** — Dedicated clip-clop or engine hum tied to cart cadence
- [ ] **UI interaction sounds** — Proximity prompt appear, modal open/close

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
- [x] **Draw call monitoring** — `?debug` logs fps / calls / tris every 5s; budget 700. Measured on swiftshader: ~420 calls at the Square, ~650 on Main Street (shadow pass roughly doubles calls)
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
