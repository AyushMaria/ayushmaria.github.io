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
- [x] **Centralized materials registry** — `materials.js` → `standardMat(params, tag?)` returns one shared `MeshStandardMaterial` per distinct parameter set (colours / textures normalised into the key). Buildings, roofs, markers, signs, rocks, sign posts, tables, props and the `propMaterials()` set all draw from it; runtime-mutated materials (window panes, lamp glow, clock face, temple) keep their own, and wind-patched ones use their own `tag`. Scene material objects 166 → 123; signboards also merged (6 draws → 2 each); `?debug` log shows the shared-material count

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
- [x] **Shadow map optimization** — `fitShadowToView()` in `town-world.js`: every frame the sun's orthographic shadow box is fitted (in light space) to the patch of ground the camera sees + a 6-unit margin, instead of the fixed 160×160 town. Size quantised to 4-unit steps, centre snapped to shadow-map texels (no shimmer while driving); off-screen casters whose shadows land on screen are still covered. Shadow detail: desktop 12.8 → 23–43 texels/unit, phone 6.4 → 8.5–18 (same map sizes)

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
- [x] ~~Gate doors that open~~ — superseded by the hill-town layout (§2.14): the gatehouse is open and the town spills outside the wall
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
- [x] **UI interaction sounds** — synthesized in `audio.js`, routed through the master gain (the mute button silences them): `playPrompt()` soft two-note "tok" when an Enter prompt appears or switches building (rate-limited, quiet right after a card closes), `playCardOpen()` rising papery swish + D5→A5 chord, `playCardClose()` falling swish + low note; hooked to the prompt and the `settlement:modal` event in `town-world.js`

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

## 2.11 Driving Feel (from the folio-2025 comparison, no Rapier)
- [x] **Point-to-drive touch** — the stick is read in screen space and turned into a world heading through the camera; steering = angle to that heading (full lock at 45°), throttle = push depth (eased), pointing behind the cart (>135°, 20° hysteresis) reverses. Ground ring + arrow shows the requested heading while the stick is held
- [x] Opposite input brakes first, then reverses (keyboard and stick)
- [x] Speed-sensitive steering lock (100 % → 55 % at top speed) — now a target turning circle, 3.4 → 9 units (§2.14)
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

## 2.14 Town Layout: Hilltop Burg (layout option B)
- [x] **New plan, from scratch** — the wheel layout (roundabout, four straight spokes, ring road, round wall) is gone. The town climbs a hill above a river: you cross a stone bridge at the foot (south-east, facing the camera) and one switchback **High Street** winds past the Market Terrace and through the town gate up to City Hall on the crest. All the plan lives in `town-layout.js` (pure data + geometry, also used by the docs map tool)
- [x] **Terrain** — one height-field mesh (`terrain.js`): elliptical hill (10 high), gentle meadow roll; streets cut level across and smoothed along, flat pads for every building / townhouse / square at the level of the street outside its door, channels for the river, stream and pools. Stone foundations under buildings for where the slope falls away
- [x] **Streets painted into the ground** — cobbles, warm square stones, dirt shoulders, footpaths and field furrows are a mask texture blended in the terrain shader (no planes laid on top, no z-fighting on slopes). The same shader draws the wheel tracks and the lamplight pools (16 nearest lamps)
- [x] **Buildings face their street** — rotation support everywhere: OBB colliders (`colliders.js`, shared by cart + knockables), shutters / window boxes / wall lanterns / chimney smoke in building space, interaction range measured to the rotated footprint
- [x] **Townhouses** — ~40 filler houses line the streets (both sides, front to the street, corners kept off every road): plinth, plaster, timber frame, gable or eave roofs, windows, doors, chimneys — all instanced (~9 draw calls)
- [x] **Occlusion cut** — townhouses and the wall dither away in a soft tube between the camera and the cart (`withOcclusionCut` in `materials.js`); portfolio buildings keep their fade
- [x] **Wall over the hill** — `buildPathWall()`: wall runs that step with the ground, crenellations, towers every ~17 units, an open gatehouse where the High Street enters and a barred water gate for the stream
- [x] **Water** — river ribbon, stream ribbons, four pools (the last is the mill pond), three little falls with foam where the stream drops into a pool, a stone spring basin below the crest; one stylised water shader (flow streaks, evening glints, foam edges). River, stream and pool colliders (not on the bridge)
- [x] **Bridge** — extruded stone arch, cobbled humped deck the cart drives over (`heightAt` returns the deck), parapets with lamp pillars
- [x] **Mill** — new building on the stream below the terrace with a turning water wheel
- [x] **Pickleball court** — the Volley Court building is now a small fenced pickleball court on the riverbank east of the Colosseum (`buildPickleballCourt()` in `town-props.js`): blue court on a green apron with baselines, sidelines, centre lines and kitchen lines, net on posts, chain-link fence with a gate, bench, paddles, balls and two players. Reached by the new **court path** from the end of Arena Lane along the river (lit); still opens the Vibe & Volley card
- [x] **Cart on the hill** — sits on the ground, pitches / rolls with the slope, mild gravity along the grade (slower uphill); camera, shadows, light pool, labels and occlusion follow the height
- [x] **Quarters** — Lower Town, Market Terrace, Hillside, The Crest (HUD, fast travel, respawn, audio chime, achievements, modal ribbons + accents). Old saved zone visits are dropped
- [x] **Minimap** — north up, drawn from the plan (hill, river, stream, streets, squares, wall, houses); buildings in your quarter highlighted
- [x] **Docs map** — `node tools/make-town-map.mjs` → `docs/town-map.svg` (contours, water, streets, wall, buildings, houses, lamps, trees, play-area ring). The old Python map tool, drag-and-drop editor and `apply-placements.py` were retired (they parsed the old hand-placed arrays)
- [x] **Grass rework → a velvet lawn with golden drifts** (§2.16, `grass.js`, picked from four from-scratch prototypes): the paper-thin camera-facing blades are gone. The lawn is now a plush pile — 10 shells (6 on the low tier) over the terrain's own lawn triangles (~38k; no streets, squares, fields, water or building plots) cut into tiny tapered strands, the same cone family as the cedars, with drifts of longer and shorter pile and wind ripples across the upper shells. The shells share the terrain's uniforms, so the lamp pools still glow on the grass and wheel tracks press the pile flat. Where the lawn meets the forest and along the river and stream banks, ~17k long ribbon blades grow in golden drifts, olive at the root and straw-gold at the tip, with a sheen rolling through them in each gust. The Observatory's streamlines sit just above the pile and the wildflowers stand taller to clear it. Cost in the opening view: about +15 draw calls and +0.65M triangles
- [x] **Room to turn off the bridge** — the High Street now runs straight for ~10 units after the deck before bending west; Arena Lane forks off as a gentle diagonal instead of a T at the bridge end, with an open green (no houses) inside the fork; parapet colliders stop where the parapets do; no lamps within 9 units of a junction; bridge 15.5 → 13.5 long
- [x] **Tighter low-speed steering** — lock 30° → 39° when crawling (turning circle ~5 units), unchanged ~16.5° at top speed; townhouse corners kept 1.3 from every street edge (houses set back to match); wall towers never stand in a street; the terrace street moved off the town wall (Guild Board, Adventurer Stats, a bed, a stall and the Forge nudged clear). An autopilot drive now gets from the bridge to the crest square with no stops, and turns both ways off the bridge with no bumps
- [x] **Prediction Colosseum → a small football stadium** (`stadium.js`, first of the building redesigns): 13 × 10 oval with three tiers of stands and ~80 spectators in team colours, an arcaded outer wall, a striped pitch with full markings and an xG shot map by one goal (dots sized by xG, goals filled), goals with nets, a gate with a timber scoreboard, four floodlight pylons (one cool-white source in the light pool) and pennants. A ball rolls from the penalty spot into the net every 9 s and the home xG ticks up. Moved 2 north for the bigger plot; gate faces Arena Lane
- [x] Hand-placed townhouse (`EXTRA_HOUSES` in `town-layout.js`) filling the gap on the north side of Arena Lane, set back a little so the turn off the bridge stays clear
- [x] **Bigger stadium, moved west** — `buildStadium()` takes a `scale` (pitch, stands, wall, crowd and floodlights all grow with it; `stadiumFootprint(scale)` gives the plot). The Colosseum is now 1.35× (18.5 × 14.4) at (36, 40.6), ~8.5 west of its old spot, with an elliptical collider (`ellipse()` in `colliders.js`) so the cart can drive round the curve instead of hitting a box corner. The two filler houses that stood west of it (the hand-placed one and an automatic one) are gone; `EXTRA_HOUSES` is empty
- [x] **Sports quarter by the river** — the stadium and the pickleball court now share one heading (`SPORTS_HEADING`, turned ~16° to follow the river's bend) and one paved **Arena Forecourt** at the end of Arena Lane: the court sits at the stadium's east shoulder with its gate on the forecourt in line with the stadium's (the old court path is gone). West of the stadium, **Fan Square** (`fan-square.js`, `FAN_SQUARE` in `town-layout.js`) spans Arena Lane at the bridge head: two food stalls, a ticket kiosk, a club flag and bunting in the team colours on the north side; a bronze footballer on a plinth and benches facing the water by the river; four fans. Its lamps are placed by hand (new `lamps` on a plaza) so the inside of the turn off the bridge stays clear
- [x] **Navigator's Tower → an airfield control tower** (`control-tower.js`, second of the building redesigns): a slender eight-sided stone tower with lit slit windows, a balcony with an iron railing and a glazed control cab glowing amber (one warm source in the light pool), a slate roof with a turning radar dish and a mast whose red aviation light blinks, and a windsock by the door. A small red quadcopter (`buildDrone`, outside the tower's group so it doesn't swell the occlusion box) flies the waypoint loop `NAV_LOOP` out over the stream and back past the tower, banking into the turns, rotors spinning, nav lights blinking; three orange waypoint flags mark the loop
- [x] **Vortex Observatory → an observatory tracking a vortex** (`vortex-observatory.js`, third of the building redesigns): a round masonry tower with a parapet, a pale panelled dome on a turntable with its shutter open and a brass telescope aimed out of the slit at a vortex — a slowly turning funnel of teal ribbons (one scrolling additive shader) hanging over the crest. Every 5.5 s a dashed green detection box, turned to face the camera, flickers and snaps round the funnel with a new label ("vortex 0.94"). Glowing streamlines swirl round the tower's foot, an anemometer spins on the parapet, and the vortex is a teal source in the light pool. Replaces the old orb, rune ring and floating books
- [x] **Cloud Citadel → a citadel made of copies of itself** (`cloud-citadel.js`, fourth of the building redesigns): a raised stone platform (7 × 7, steps at the front, low parapet) carrying a tall master tower and six identical worker towers (instanced) joined by timber walkways, with a bank of cloud round the tower tops. Every tower has a regular window grid (one instanced mesh, coloured per row each frame): each cycle the workers light their rows bottom to top at their own pace, a glowing packet runs along each walkway to the master as its worker finishes, the master fills its rows, everything flashes and fades, and it starts again. An orange beacon pulses on the master's roof (one orange source in the light pool)
- [x] **The Forge → the Drone Forge** (`drone-forge.js`, fifth of the building redesigns): the Tudor hall and its smoking chimney stay (built by the usual building code on the left half of a wider 8.4 × 5 plot) and gain a flat-roofed stone workshop wing: barn doors swung open on a flickering hearth, a workbench with a quadcopter and tools, warm light spilling out over the threshold (one warm source in the light pool), a landing pad marked "H" with edge lights on the roof, a flight-log chart on an easel outside (roll, pitch, yaw), crates of parts and a brass quadcopter sign swinging over the door. A drone (the tower's `buildDrone`, now with a scripted `path`) rests on the pad, lifts off, flies a loop over the forge and lands again every 18 s
- [x] **Concierge Parlour → Ace's Concierge Parlour** (`concierge-parlour.js`, sixth of the building redesigns): an emerald-and-cream octagonal pavilion (6.2 × 6.2, two storeys of arched windows with mullions, cream pilasters and cornices) under a ribbed verdigris copper dome with a cupola. In the cupola a chat-bubble lantern cycles through "typing" dots, a double tick and the ace of spades (one pale-green source in the light pool). Striped awnings over the doors and four faces, glass double doors, a red carpet to the High Street, a concierge's stand with a brass bell, and a booking board in the garden whose slots flip from free to taken. Pigeons sit on the dome; one flies an errand round it and comes back
- [x] **Ledger Sanctum → the Tally Bridge Counting House** (`counting-house.js`, seventh of the building redesigns): two buildings on an 11 × 5 plot joined by a covered timber skybridge on a stone arcade of two arches. The vault house (the legacy system) is rusticated stone with quoins, a hipped slate roof, a round steel vault door with a brass wheel and bolts, ledgers stacked behind barred windows and a gilded TALLY board; the counting room (the modern API) is a cream frame of tall gold-lit glass with steps, a dark glass door and a gilded BRIDGE board, and glows brighter (one gold source in the light pool). Scrolls (the XML) ride a cable along the skybridge from the vault to the counting room while letters come back the other way, and a brass balance scale on the steps tips now and then. The filler house that stood west of the old building is gone
- [x] **Tiny Tots Academy → a storybook schoolhouse with a playground** (`tiny-tots.js`, the last of the building redesigns): one 12.5 × 5.4 plot (moved a little to fit; the filler house east of it is gone) holding a chunky cream schoolhouse with a steep red roof, a bell cupola on the ridge, a front cross-gable with a lit clock showing the visitor's real time, red/yellow/blue shutters, a round-topped blue door with an access ramp and yellow handrail, and ABC blocks by the door — and beside it a fenced playground with a rainbow arch over the gate, a slide, a swing that rocks, two kites bobbing on strings and two children (plus one by the door). The bell swings and rings once each time the cart pulls up
- [x] All eight project-building redesigns done (see the redesign page)
- [x] **Forest of landing-page trees** (§2.15): every old tree replaced by the landing page's tiered cedars and red maples (same shapes, brightened for the evening light), and every open space filled with dense forest — ~1,700 trees on a jittered grid with clearings round roads (3.2 from the edge), squares, project buildings (3.6), houses, wall gates, the river and stream, and under the Navigator's drone loop; smaller trees inside the walls and along the streets, a thinner ring beyond the play area. Drawn by `buildLandingTrees()` (`town-props.js`): trunk baked into each tree, one InstancedMesh per species per 64-unit tile with the tile's own bounds so off-screen tiles are culled (~+55 draw calls, ~+180k triangles), crowns in the occlusion cut so a tree between the camera and the cart dithers away; the low tier keeps 60 %. Each trunk is a collider
- [x] **Steering to a turning circle** (`cart.js`): the cart's tightest circle at cruising speed was 14 units, wider than the 8–10 unit arc the High Street's four hairpins allow, so a held turn key ran the cart off the street at the bridge head. Steering now aims for a turning radius that grows from 3.4 at a crawl to 9 at top speed (13 at full boost) and takes the wheel angle from it (`atan(wheelBase / radius)`); the 4.2 wheelbase stays, so the fastest swing is ~76°/s (was 49°/s). **Corner assist** for keys and the gamepad: with the wheel past a quarter of its lock, the target speed eases toward 60 % and the cart sheds speed a little faster than coasting (touch steering already eased off). A corner audit (hold forward, no brake, tap toward the road ahead, real colliders) now makes every route with no hits and no wheel off the cobbles: bridge → crest 23.4 s, crest → bridge 22.6 s, bridge → Arena Lane, High Street → Forge Lane and → Tower Lane; before, three of the five were lost at the first hairpin. Widening the two tightest bends wasn't needed
- [x] **Street lights → armillary orbs** (`street-orbs.js`): no more poles. Each of the 24 lights is a gold orb hanging still in the air (3.7 up) inside two crossed bronze rings, with a stone keystone floating under it and a soft camera-facing halo; nothing moves. Orbs still drive the shared PointLight pool and the lamplight pools on the ground, and dim with the evening level. No lamp colliders any more (the keystone clears the cart's canopy). 3 merged meshes + 1 instanced halo
- [x] **Town wall → an ishigaki castle wall** (`castle-wall.js`, replaces `buildPathWall()`): a battered granite base wider at the foot, a white plaster parapet with a black board skirt, square loopholes and a grey-tile cap; the 16 towers are two-storey yagura (white plaster, a lit upper window, two curved hip roofs in the City Hall's tile); the High Street gate is a roofed kōraimon between two stone piers; the water gate keeps its iron bars under a plaster-and-tile lintel. Same line, gaps and tower spots; merged per material (~10 draw calls), occlusion dither kept. A road check confirms no wall, tower or pier collider reaches the cobbles
- [x] **Townhouses → machiya** (`machiya.js`, replaces `buildTownhouses()`): Kyoto townhouses in the City Hall's grey tile — a dark timber ground floor behind a glowing kōshi lattice, an indigo noren over the door bay, a cream plaster upper floor with a slit window, a pent roof between the floors and a low tile gable; four plaster and four timber tints so the streets don't repeat. The four filler buildings without a project (the Tavern, the Mill, the Guild Board and Adventurer Stats) are machiya too (the Tavern with a pair of red lanterns at its door); the Forge stays Tudor. Lattice, slit windows and lanterns glow with the evening level
- [x] **Link previews** — sharing the site now shows a card: a 1200 × 630 render of the town at dusk with the title (`assets/og-preview.jpg`). The Open Graph / Twitter tags were already in `index.html` but pointed at a relative `./assets/og-preview.png` that didn't exist, and at an old URL (`/ayush-settlement/`); they now use absolute URLs on `https://ayushmaria.github.io/`, with the image's size, type and alt text and a canonical link. The missing favicons and app icons exist now (an armillary orb, SVG + PNG), and the manifest starts at `./` instead of a `portfolio.html` that isn't there
- [x] **The cart → a gissha** (`gissha.js`, picked from four from-scratch designs): the hay cart is gone. You now drive a Heian court carriage — a black lacquered cabin with gold corner fittings, bands and edging, vermilion side panels with small sudare windows, bamboo sudare blinds glowing at front and back, purple agemaki tassels at the roof corners, and an arched roof that sweeps up at both ends with a gold ridge. It rides on two great 0.78 wheels with sixteen spokes under the cabin; two small gilded wheels on steering forks under the curved shafts turn with the steering. Tail lights are red beads at the back corners (they flare when braking), a white bead lights when reversing, and a paper chōchin swings from a hooked pole over the yoke and carries the cart's light. Each wheel spins at its own radius (`userData.radius`, spin on a child group so the forks steer without spinning) and the grass ruts follow the great wheels (`cart.trackOffsets`). Same 2 × 3.4 collision box; roof tips 2.42 up, under the street orbs
- [x] **The Forge → a kaji-ba** (`drone-forge.js`, picked from four from-scratch designs; the last Tudor building in town): a swordsmith's smithy beside a drone workshop on the one plot. The smithy is open to Forge Lane between dark posts — a clay hearth glowing at the back, a bellows box, an anvil with a blade on it, a quench trough and tongs, and a shimenawa rope with paper shide across the front — under a hipped grey-tile roof with a raised smoke vent the chimney smoke now rises from. The workshop is a machiya front: a glowing kōshi lattice, an indigo noren with a white quadcopter crest over the open door, a drone on the bench inside, and the brass quadcopter sign at its corner. Its flat roof carries a wooden drying deck (monohoshi-dai) with a vermilion rail and the landing pad, reached by a ladder; the pad drone's loop flies over the smithy. The flight log hangs on a roofed notice board (kōsatsu) by the lane, with crates of parts beside the workshop. No more Tudor shutters, window boxes or door lantern on the Forge
- [x] Dropped as out of date: lightning between the Research Quarter towers, the bard's stage, Tudor dormers, the grass see-through fade (the lawn is too short to hide the cart)
- [ ] Waterfall / river ambient sound, mill-wheel creak
- [ ] Map editor for the new plan (drag points in `town-layout.js`)

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
- [x] **Shared materials registry** — done in §1.5 (`materials.js`)
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
