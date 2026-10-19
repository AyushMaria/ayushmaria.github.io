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
- [x] **Boost mechanic** — Shift key for speed boost with visual/audio feedback (§2.11)
- [x] **Auto-unstuck** — Detect if cart is jammed for 3+ seconds → Unstuck button / R respawn (§2.11)
- [x] **Stats tracking** — Persist `distanceDriven` and `timePlayed` to localStorage (lives in `achievements.js`, see §3.4)
- [ ] **Input abstraction** — Named actions (`forward`, `backward`, `boost`) mapped to keyboard + gamepad + touch. Keyboard, gamepad and touch all work already (§2.11); what's left is routing them through one named-action layer instead of per-device checks

## 1.3 Follow Camera
- [x] Scroll-wheel zoom (lerp between min/max distance)
- [x] Speed-based dynamic zoom (camera pulls back when fast)
- [x] Collision shake effect
- [x] Isometric camera — the only view on desktop and mobile (fixed SE diagonal, follows the cart; scroll / pinch zoom 0.6–1.5×; backs off on portrait screens). `Q` toggle and chase cam removed. Buildings between the camera and the cart fade to 25% so the cart is never hidden
- [ ] **Spherical coordinates** *(reserved for later)* — `phi`/`theta`/`radius` system (Bruno Simon's `View.js` pattern) is written but **commented out** in `FollowCamera` (`cart.js`): `this.spherical` (θ 45°, φ ≈ 46.7°, r = `isoDist` — reproduces today's iso view exactly), `_applySpherical()` and a hook at the top of `update()`. Isometric stays the only view until this is switched on
- [x] **Mouse orbit** → replaced by drag / two-finger look-around pan that springs back when you drive (§2.11). An `_orbitBy()` helper is reserved (commented out) alongside the spherical system
- [x] **Cinematic transitions** → camera eases in to frame the building while its project card is open (`FollowCamera.frame()`, §2.11)
- [ ] **Extract to `camera.js`** — Currently lives inside `cart.js`, should be its own module

## 1.4 Module Architecture (`index.html`)
- [x] ES module imports for `cart.js`, `particles.js`, `post-processing.js`, `audio.js`
- [x] Removed inline `initTownWorld()` script block from `index.html`
- [x] Controls hint overlay (fades out after 5s)
- [ ] **Three.js r160+ upgrade** — tracked in §4.2
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
- [x] Isometric view (permanent; see Phase 1)
- [ ] Spherical coordinates — reserved, commented out (see §1.3)
- [x] Mouse orbit → drag-to-look pan (§2.11)
- [x] Cinematic transitions → building framing on project open (§2.11)
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
- [x] **Hanging lanterns** — `buildWallLanterns()` in `town-props.js`: a bracketed iron lantern (wall plate, arm, brace, cage with glowing glass) above every building door (12; City Hall keeps its own temple lanterns). Three `InstancedMesh`es for the whole town = 3 draw calls; no PointLights (emissive glass + bloom). Lanterns hang from the bracket tip and swing gently with the shared wind (still under reduced motion)

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
- [x] Grass flattens in the cart's wheel tracks (§2.11) — a full see-through fade is still open
- [ ] Grass "see-through" fade around the cart when it drives through tall patches

## 2.11 Driving Feel (from the folio-2025 comparison, no Rapier)
- [x] **Point-to-drive touch** — the stick is read in screen space and turned into a world heading through the camera; steering = angle to that heading (full lock at 45°), throttle = push depth (eased), pointing behind the cart (>135°, 20° hysteresis) reverses. Ground ring + arrow shows the requested heading while the stick is held
- [x] Opposite input brakes first, then reverses (keyboard and stick)
- [x] Speed-sensitive steering lock (100 % → 55 % at top speed)
- [x] Time-based smoothing for the stick, steering, wall slide and camera (same feel at 30/60/144 fps)
- [x] Fake suspension: cart body pitches on accel/brake and leans out in turns (spring-damper), subtle cobble bob; off under reduced motion
- [x] Front wheels steer visibly; wheel spin matches ground speed (distance / radius)
- [x] Tail lights flare when braking, white reversing lamp; brake audio follows the real brake state
- [x] **Surface-normal sliding** — contact normal per collider (circle → radial, wall ring → inward, box → nearest face), the motion into the surface is removed and the sideways part kept (two passes for corners); glancing hits swing the nose along the surface; speed kept in proportion to the slide
- [x] Impact strength (`cart.impact`) → wooden thud scaled by speed (rate-limited) and a damped camera **roll kick** instead of random shake (off under reduced motion)
- [x] **R** respawns at the nearest quarter spawn; **stuck detection** (3 s of throttle, < 0.5 units moved) shows an "⟲ Unstuck" button that does the same
- [x] **Shift boost** — 1.6× top speed and pull, rising whoosh, louder rumble, double dust, camera eases back; touch has a hold-to-boost 💨 button
- [x] **H** rings the cart bell
- [x] **Knockable props** — `props-physics.js` (`KnockableProps`): 3 barrels by the tavern, 5 crates beside the market stalls and 6 terrace chairs. Ground-plane physics without an engine: the cart (oriented rectangle) shoves props with a mass-weighted impulse and loses matching speed; props slide with friction, spin, wobble upright on a spring, knock into each other and bounce off buildings, trees, lamps and the wall. Wooden thud on hard hits; no wobble under reduced motion. One `InstancedMesh` per kind (3 draw calls); sleeping props cost nothing
- [x] **Interaction range** measured to the building's footprint (5 units from the wall, 7 for "visited"), rechecked only after moving 0.2 units
- [x] **Prompt** fades in/out and shows the right control: E (keyboard), A / ✕ (Xbox / PlayStation pad), "Tap Enter" on touch (the ⚡ button is the action)
- [x] **Gamepad** (standard mapping): left stick = point-to-drive; RT / LT = throttle / brake-reverse with left-stick steering; A/✕ enter, B/○ handbrake (closes a project card), X/□ bell, Y/△ respawn, LB/RB boost
- [x] **Wheel audio**: soft cobble clicks every ~0.8 units (duller, sparser on grass); skid hiss when braking hard or scraping a wall
- [x] **Wheel tracks in the grass**: 512² canvas mark map over the town; rear wheels paint dirt ruts on grass (fade over ~20 s), drawn as a decal under the roads, and the grass shader lays blades flat in the ruts (one texture fetch per blade vertex)
- [x] **Camera lens** — FOV 60° → 32° from 50 units (same ground in view, flat "diorama" look, far less edge distortion); near plane 0.5 → 4 for depth precision (removes ground z-fighting stripes at the new distance)
- [x] **Look-ahead** — frame leads the cart in its direction of travel (up to 6 units at top speed, eased), most useful when driving toward the camera
- [x] **Drag to look around** — mouse drag on the scene / two-finger pan on touch (two fingers also pinch-zoom); springs back while driving, drifts back after 2.5 s idle; a drag no longer counts as a building click; touches on the joystick/buttons never start a pinch
- [x] **Frame the building** — opening a project eases the camera to the cart↔building midpoint and 28 % closer; eases back on close
- [x] Building labels fade by distance from what you're looking at (not from the camera) and scale with zoom

## 2.13 Night Temple Landing & City Hall
- [x] `temple.js` — procedural two-tier temple hall (stone plinth + steps, vermilion posts, bracket clusters, glowing lattice screens, veranda rail, hanging lanterns) with curved hip roofs (sagging slopes, lifted corners, ridge end tiles) and a three-tier pagoda; meshes merged per material (~10 draw calls)
- [x] `landing-temple.js` replaces the torii / CSS-cloud / firefly hero: moonlit sky dome + twinkling stars, layered mountain ridgelines and drifting mist, a 20-step stone stairway with stone lanterns from a vermilion torii up to the temple terrace, pagoda, cedars and maples, light rain, falling maple leaves, fireflies and pointer-following spirit wisps; bloom + cool night grade
- [x] **Enter Town** flies through the torii, up the stairs and into the glowing temple doors (warm flash), then boots the town and disposes the landing's GPU resources; hero copy and button kept over the scene
- [x] Pointer parallax with idle sway; pauses when the tab is hidden or the hero is scrolled away; `prefers-reduced-motion` renders a still frame and skips the fly-in; low-power tier (touch / ≤4 cores / small screens) halves rain, trees, bloom resolution and drops shadows/MSAA; wider FOV on portrait screens
- [x] Day/night toggle and the old CSS sky layers hidden on the landing (the scene has its own night sky)
- [x] **City Hall** at the head of Main Street (0, −39.5), facing the fountain in front of the clock tower — the same temple hall at 0.78 scale with a CITY HALL plaque, lighter daytime tiles, screens/lanterns on the town's glow cycle
- [x] City Hall opens an **About** card: draft bio, Skills & Trades, Notable Quests list (replaces the stat bars), and a links row (GitHub now; LinkedIn / Email / Résumé render once filled in `PROJECTS.about.links`)
- [x] About card filled in: business-owner / freelance-contractor bio, Agentic AI tags + agentic-app skills (LLM APIs, tool calling, LangChain, LangGraph, RAG, vector DBs, MCP, prompt engineering, WhatsApp Business API), Notable Quests = Ace, Expected Goals (xG), MAVPose; links = GitHub, LinkedIn, Email (no résumé)

## 2.12 Mobile Project Card Fit
- [x] Phone project card fills the overlay (height 100 %) instead of 100vh, which on phones is the height *without* the URL bar and pushed the card's top ("Return to Town") and bottom (GitHub / Demo buttons) off-screen — rules live at the end of `town-styles.css`
- [x] Safe-area padding (`viewport-fit=cover` + `env(safe-area-inset-*)`) so notches and the home indicator don't cover content; no horizontal overflow; decorative corners/outline dropped on the full-screen sheet
- [x] Landscape phones / tablets: card capped at `min(88vh, 100%)` of the overlay

## 2.10 Map Button Fix
- [x] Removed a duplicate `#town-map` block (no click handler) that sat on top of the real map button and swallowed every click
- [x] Map button is context-aware: section links on the landing page, **Fast Travel** list (mirrors the zone HUD, highlights the current quarter, Esc / outside click closes) inside the town
- [x] Quarter spawns moved out onto the spokes (±24) so fast travel actually lands in Main Street / Research / Services instead of inside the Square radius
- [x] `tools/make-town-map.py` reads double-quoted signboard text again (signs were missing from the editor after `apply-placements.py`)

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
- [x] **Input-aware icons** — E / A (✕ on PlayStation) / Tap, switches with the last-used device (§2.11)
- [x] **Smooth distance fade-in/out** — Interaction prompt opacity-fades (§2.11)
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
- [ ] **Shared materials registry** — same task as §1.5 (`materials.js`); do it once, tick both
- [ ] **Instanced meshes** — Use `InstancedMesh` for trees, rocks, flowers, barrels (same geometry + material)
- [ ] **LOD** — Reduce geometry detail for distant buildings
- [ ] **Frustum culling audit** — Ensure all meshes have proper bounding spheres
- [x] **Draw call monitoring** — `?debug` logs fps / calls / tris every 5s; budget 700. Measured on swiftshader: ~420 calls at the Square, ~650 on Main Street (shadow pass roughly doubles calls); unchanged after the reference-art pass thanks to instancing/merging (~85k tris)
- [x] **Point-light budget** — 32 → 6 `PointLight`s. Lamps and the Observatory orb are now *light sources* (emissive head + one additive ground-glow `InstancedMesh`); a fixed pool of 4 PointLights (2 on the low tier) follows the sources nearest the camera focus (`createLightPool` in `town-world.js`), the farthest pooled light fading out as the next one catches up so hand-overs don't pop; campfire + cart lantern keep their own. Constant light count = no shader recompiles. Swiftshader frame time roughly halved (~1.6 s → ~0.85 s); `?debug` log now prints the point-light count
- [x] **Merge static building parts** — `merge-static.js` → `mergeStaticChildren(group)` bakes a group's static mesh children into one mesh per material (+ shadow flags); child groups, InstancedMesh, shader/transparent materials and `userData.keep` meshes are left alone, and multi-material gable roofs are split so their plaster ends join the walls. Applied to every building, the 27 lamps (54 meshes → 2), the cart body + wheels (49 → 17 meshes; spin/steer/sway unchanged), fountain, city wall, clock tower and market stalls. Scene meshes 442 → 307, draw calls per frame ~430–510 → ~290–350 (≈30 % fewer, incl. shadow pass); any part of a project building (roof too) now opens its card on click
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
- [x] **Touch nipple controls** — superseded by the point-to-drive stick (§2.11)
