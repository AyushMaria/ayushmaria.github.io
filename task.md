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
- [ ] **Stats tracking** — Persist `distanceDriven` and `timePlayed` to localStorage
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
- [ ] **Zone fast-travel** — HUD buttons should auto-drive cart along road spline (currently not wired)

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
- [ ] **NPC silhouettes** — Billboard sprites that wave when cart approaches
- [ ] **Flower boxes under windows** — Small planter geometry on building facades
- [ ] **Lightning particle effects** — Between Research Quarter towers
- [ ] **Musical note particle emitter** — Bard's stage near Tavern
- [ ] **Volumetric cone lights** — Warm interior light spilling from Tavern windows
- [ ] **Wind sway on flower beds** — Currently only subtle rotation, needs vertex displacement

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
- [ ] Redesign modals to match isekai/fantasy town aesthetic
- [ ] Add transition animation when entering from 3D town
- [ ] Contextual modal content based on building zone

## 3.3 Minimap
- [x] Canvas-based minimap with circular clip
- [x] Ring road, spoke roads, fountain dot
- [x] Building dots (gold for interactive, beige for decorative)
- [x] Cart position arrow (rotates with cart heading)
- [ ] **Current zone highlight** — Highlight the zone the cart is currently in
- [ ] **Extract to `minimap.js`** — Currently inline in `town-world.js`, should be its own module

## 3.4 Achievements & Exploration Tracking
- [ ] `distanceDriven` counter persisted to localStorage
- [ ] `timePlayed` counter persisted to localStorage
- [ ] Building visit tracking (which buildings the player has approached)
- [ ] Exploration progress percentage (buildings visited / total)
- [ ] Achievement notifications (toast-style) for milestones

---

# Phase 4: Performance & Polish

## 4.1 Performance Optimization
- [ ] **Shared materials registry** — Replace per-building `new MeshStandardMaterial()` with centralized `Map` (see §1.5)
- [ ] **Instanced meshes** — Use `InstancedMesh` for trees, rocks, flowers, barrels (same geometry + material)
- [ ] **LOD** — Reduce geometry detail for distant buildings
- [ ] **Frustum culling audit** — Ensure all meshes have proper bounding spheres
- [ ] **Draw call monitoring** — Track `renderer.info.render.calls` and set budget
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
- [ ] **Fallback HUD navigation** — On low-end mobile, offer button-based zone travel instead of driving
- [ ] **Responsive controls overlay** — Smaller text, touch-friendly sizing
- [ ] **Performance scaling** — Reduce particle counts, shadow map size, and post-processing on mobile GPUs
- [ ] **Touch nipple controls** — Full virtual joystick with analog sensitivity (Bruno Simon's touch input pattern)
