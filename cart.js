/**
 * cart.js — Drivable Cart System for Ayush's Settlement
 * Procedural Three.js cart model with bicycle-model physics,
 * WASD + arrow key controls, mobile joystick support,
 * and spring-arm follow camera.
 *
 * ES Module — load via <script type="module">.
 * For local dev, serve via `npx serve .` or VS Code Live Server.
 */

import * as THREE from 'three';

// Wrap an angle to (-π, π]
const wrapAngle = (a) => Math.atan2(Math.sin(a), Math.cos(a));

// ════════════════════════════════════════════════════════════════
// CART CLASS
// ════════════════════════════════════════════════════════════════

export class Cart {
  constructor(scene, startPos = { x: 0, z: 25 }) {
    this.scene = scene;
    this.group = new THREE.Group();
    this.group.name = 'player-cart';

    // ── Physics state ─────────────────────────────────────────
    this.velocity   = 0;
    this.steerAngle = 0;
    this.position   = new THREE.Vector3(startPos.x, 0, startPos.z);
    this.rotation   = Math.PI;            // facing into town (-Z)
    this.teleporting = false;

    // ── Tuning ────────────────────────────────────────────────
    // Gentle: ~4s to top speed (accel minus friction), top speed ~12 world units/s,
    // and a longer virtual wheelbase so full lock is ~110°/s, not ~250°/s.
    this.maxSpeed      = 0.20;
    this.reverseMax    = 0.08;
    this.accel         = 0.0030;
    this.brakeForce    = 0.014;
    this.friction      = 0.0022;
    this.steerSpeed    = 0.022;
    this.maxSteerAngle = Math.PI / 6;
    this.steerReturn   = 0.04;
    this.wheelBase     = 4.2;
    this.boostSpeed    = 1.6;     // × maxSpeed while boosting
    this.boostAccel    = 1.6;     // × accel while boosting

    // Collision feedback (read by town-world for audio + camera)
    this.impact = 0;              // normal impact speed this frame (world units / frame), 0 if none
    this.boosting = false;

    // Stuck detection: throttle held but the cart has barely moved
    this.stuck = false;
    this._stuckLog = [];          // [distance, seconds] samples while throttling

    // Footprint used for collision: 4 rotated corners + centre of the
    // cart's real 2.0 × 3.4 body (was an axis-aligned 2.4 × 3.8 box that
    // hit things ~1.5 units early when driving diagonally).
    this._footprint = [[0, 0], [-1.0, 1.7], [1.0, 1.7], [-1.0, -1.7], [1.0, -1.7]];
    this._probe = new THREE.Vector3();

    // ── Internal refs ─────────────────────────────────────────
    this.wheels     = [];
    this.wheelAngle = 0;
    this.lantern      = null;
    this.lanternLight = null;

    // ── Input ─────────────────────────────────────────────────
    this.keys = { forward: false, backward: false, left: false, right: false, brake: false, boost: false };
    // Gamepad "racing" input (triggers + left stick X), set by town-world's
    // poller. The left stick alone drives point-to-drive via setJoystickInput.
    this.pad = { active: false, throttle: 0, steer: 0, brake: false, boost: false };
    // Raw stick from the touch handler and a low-passed copy used by physics
    // (a thumb jitters; the cart shouldn't).
    this.joystick = { x: 0, y: 0, active: false, sx: 0, sy: 0 };
    this.joystickDeadzone = 0.12;   // radial
    this.joystickSmoothing = 0.25;  // per-frame lerp toward the raw stick
    // Set by town-world while a project modal is open: driving input is
    // ignored and the cart coasts to a stop (keys are still tracked so
    // nothing is "stuck" when the modal closes).
    this.inputLocked = false;

    // Touch: the stick is read in SCREEN space and turned into a world
    // heading through this camera (set by town-world), so "push up" always
    // means "drive up the screen" whatever way the cart faces — Bruno
    // Simon's point-to-drive idea, kept on our on-screen stick.
    this.viewCamera = null;
    this.stickReverse = false;     // hysteresis for the forward/reverse switch
    this.stickTarget = null;       // world heading the stick asks for (radians)

    // Feel: body pitch/roll springs (visual only), brake state for lights + audio
    this.braking = false;
    this.reversing = false;
    this._spring = { pitch: 0, pitchV: 0, roll: 0, rollV: 0 };
    this._lastVel = 0;
    this._lastRot = this.rotation;
    this._bobT = 0;

    this._buildModel();
    this._buildSteerMarker();
    this._setupKeyboard();

    this.group.position.copy(this.position);
    this.group.rotation.y = this.rotation;
    scene.add(this.group);
  }

  // ── Procedural cart model ───────────────────────────────────
  _buildModel() {
    const MAT = {
      wood:     new THREE.MeshStandardMaterial({ color: 0x8B6914, roughness: 0.85 }),
      darkWood: new THREE.MeshStandardMaterial({ color: 0x5C3D1A, roughness: 0.9 }),
      metal:    new THREE.MeshStandardMaterial({ color: 0x4A4A4A, roughness: 0.7, metalness: 0.5 }),
      canopy:   new THREE.MeshStandardMaterial({ color: 0xC0392B, roughness: 0.6, side: THREE.DoubleSide }),
      glow:     new THREE.MeshStandardMaterial({ color: 0xFFD166, emissive: 0xFFD166, emissiveIntensity: 0.8 }),
      hay:      new THREE.MeshStandardMaterial({ color: 0xD4A843, roughness: 1 }),
    };

    // Everything except the wheels lives in `body`, which pitches and rolls
    // on fake suspension springs while the wheels stay planted.
    const body = new THREE.Group();
    body.name = 'cart-body';
    this.group.add(body);
    this.body = body;
    const addBody = (m) => { body.add(m); return m; };

    // Base plank
    const base = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.15, 3.2), MAT.wood);
    base.position.y = 0.55;
    base.castShadow = true;
    base.receiveShadow = true;
    addBody(base);

    // Side rails
    [-0.85, 0.85].forEach(x => {
      const rail = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.45, 3.0), MAT.darkWood);
      rail.position.set(x, 0.85, 0);
      rail.castShadow = true;
      addBody(rail);
    });

    // Front & back panels
    [1.5, -1.5].forEach(z => {
      const panel = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.45, 0.08), MAT.darkWood);
      panel.position.set(0, 0.85, z);
      panel.castShadow = true;
      addBody(panel);
    });

    // Hay bale (cargo)
    const hay = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.4, 1.0), MAT.hay);
    hay.position.set(0, 0.82, -0.8);
    hay.rotation.y = 0.15;
    addBody(hay);

    // Wheels (4 corners)
    [
      { x: -1.0, z: 1.1 }, { x: 1.0, z: 1.1 },
      { x: -1.0, z: -1.1 }, { x: 1.0, z: -1.1 },
    ].forEach(pos => {
      const wg = new THREE.Group();

      // Rim
      const rim = new THREE.Mesh(new THREE.TorusGeometry(0.32, 0.05, 8, 16), MAT.metal);
      rim.rotation.y = Math.PI / 2;
      wg.add(rim);

      // Spokes
      for (let i = 0; i < 6; i++) {
        const spoke = new THREE.Mesh(
          new THREE.CylinderGeometry(0.015, 0.015, 0.56, 4), MAT.darkWood
        );
        spoke.rotation.z = (i / 6) * Math.PI;
        wg.add(spoke);
      }

      // Hub
      const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.1, 8), MAT.metal);
      hub.rotation.x = Math.PI / 2;
      wg.add(hub);

      wg.position.set(pos.x, 0.32, pos.z);
      wg.rotation.order = 'YXZ';          // steer (Y) first, then spin (X)
      wg.userData.front = pos.z > 0;      // +Z is the cart's nose
      this.group.add(wg);
      this.wheels.push(wg);
    });

    // Rear lamps: dim red tail lights that flare when braking; a white
    // reversing lamp between them.
    this.tailMat = new THREE.MeshStandardMaterial({ color: 0x5a0d0d, emissive: 0xff2a1a, emissiveIntensity: 0.25 });
    this.reverseMat = new THREE.MeshStandardMaterial({ color: 0x444444, emissive: 0xfff1d6, emissiveIntensity: 0 });
    [-0.62, 0.62].forEach(x => {
      const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.14, 0.05), this.tailMat);
      lamp.position.set(x, 0.92, -1.56);
      addBody(lamp);
    });
    const rev = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.1, 0.05), this.reverseMat);
    rev.position.set(0, 0.92, -1.56);
    addBody(rev);

    // Canopy posts
    [
      { x: -0.75, z: 1.2 }, { x: 0.75, z: 1.2 },
      { x: -0.75, z: -1.2 }, { x: 0.75, z: -1.2 },
    ].forEach(pos => {
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 1.4, 6), MAT.darkWood);
      post.position.set(pos.x, 1.82, pos.z);
      post.castShadow = true;
      addBody(post);
    });

    // Red canvas canopy
    const canopy = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.06, 2.8), MAT.canopy);
    canopy.position.y = 2.52;
    canopy.castShadow = true;
    addBody(canopy);

    // Front lantern post
    const lPost = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.7, 6), MAT.darkWood);
    lPost.position.set(0, 1.0, 1.65);
    addBody(lPost);

    // Lantern body
    const lanternG = new THREE.Group();
    lanternG.add(new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.22, 0.18), MAT.glow));
    const lTop = new THREE.Mesh(new THREE.ConeGeometry(0.13, 0.1, 4), MAT.darkWood);
    lTop.position.y = 0.16;
    lTop.rotation.y = Math.PI / 4;
    lanternG.add(lTop);
    lanternG.position.set(0, 1.45, 1.65);
    addBody(lanternG);
    this.lantern = lanternG;

    // Lantern point light
    this.lanternLight = new THREE.PointLight(0xFFD166, 1.2, 8);
    this.lanternLight.position.set(0, 1.5, 1.65);
    addBody(this.lanternLight);
  }

  // ── Touch steering marker ───────────────────────────────────
  // A faint ring on the ground around the cart with an arrow pointing where
  // the stick is asking to go (green = forward, amber = reversing). Only
  // shown while the stick is held.
  _buildSteerMarker() {
    const g = new THREE.Group();
    g.visible = false;
    const mat = new THREE.MeshBasicMaterial({
      color: 0x7dffcf, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide,
    });
    const ring = new THREE.Mesh(new THREE.RingGeometry(3.0, 3.18, 48), mat);
    ring.rotation.x = -Math.PI / 2;
    g.add(ring);
    const arrowShape = new THREE.Shape();
    arrowShape.moveTo(0, 0.75); arrowShape.lineTo(0.55, -0.15); arrowShape.lineTo(0.18, -0.05);
    arrowShape.lineTo(0, -0.35); arrowShape.lineTo(-0.18, -0.05); arrowShape.lineTo(-0.55, -0.15);
    arrowShape.closePath();
    const arrow = new THREE.Mesh(new THREE.ShapeGeometry(arrowShape), mat);
    arrow.rotation.x = -Math.PI / 2;           // lie flat; shape +Y → world -Z
    const pivot = new THREE.Group();
    arrow.position.z = -3.6;                    // out past the ring, pointing outward
    pivot.add(arrow);
    g.add(pivot);
    g.renderOrder = 2;
    this.scene.add(g);
    this.steerMarker = { group: g, pivot, mat, opacity: 0 };
  }

  // ── Keyboard ──────────────────────────────────────────────
  _setupKeyboard() {
    const keyMap = {
      KeyW: 'forward', ArrowUp: 'forward',
      KeyS: 'backward', ArrowDown: 'backward',
      KeyA: 'left', ArrowLeft: 'left',
      KeyD: 'right', ArrowRight: 'right',
      Space: 'brake',
      ShiftLeft: 'boost', ShiftRight: 'boost',
    };
    window.addEventListener('keydown', e => {
      const k = keyMap[e.code];
      if (k) { this.keys[k] = true; if (e.code === 'Space') e.preventDefault(); }
    });
    window.addEventListener('keyup', e => {
      const k = keyMap[e.code];
      if (k) this.keys[k] = false;
    });
  }

  // ── Joystick (called by external handler) ─────────────────
  setJoystickInput(x, y) {
    this.joystick.x = x;
    this.joystick.y = y;
    this.joystick.active = Math.hypot(x, y) > this.joystickDeadzone;
  }

  // ── Fast-travel teleport ──────────────────────────────────
  teleportTo(x, z, faceAngle, duration) {
    duration = duration || 1.5;
    const gsap = window.gsap;
    if (!gsap) { this.position.set(x, 0, z); return; }

    this.teleporting = true;
    this.velocity = 0;
    this.steerAngle = 0;
    gsap.to(this.position, { x, z, duration, ease: 'power2.inOut' });
    if (faceAngle !== undefined) {
      gsap.to(this, { rotation: faceAngle, duration, ease: 'power2.inOut' });
    }
    gsap.delayedCall(duration, () => { this.teleporting = false; });
  }

  // Called after a respawn/fast-travel so stuck state starts fresh
  resetStuck() { this._stuckLog.length = 0; this.stuck = false; }

  // ── Cinematic Focus ───────────────────────────────────────────
  setFocusTarget(targetPos) {
    this.focusTarget = targetPos;
  }

  // ── Physics update (called every frame) ───────────────────
  update(delta, colliders) {
    const realDelta = Math.min(delta || 1 / 60, 0.25);   // wall-clock (stuck timer)
    delta = Math.min(delta || 1 / 60, 0.05);
    const dt = delta * 60;          // normalise to ~60 fps

    // Teleport: just sync transform, skip physics
    if (this.teleporting) {
      this.group.position.copy(this.position);
      this.group.rotation.y = this.rotation;
      this._lastRot = this.rotation; this._lastVel = 0;
      this._updateLamps(false, false);
      this._updateSteerMarker(delta, false);
      if (this.lantern) this.lantern.rotation.z = Math.sin(Date.now() * 0.003) * 0.04;
      if (this.lanternLight) this.lanternLight.intensity = 1.0 + Math.sin(Date.now() * 0.004) * 0.3;
      return;
    }

    const speedRatio = Math.min(1, Math.abs(this.velocity) / this.maxSpeed);

    // ── Resolve input ────────────────────────────────────────
    let inFwd = 0, inSteer = 0, inBrake = this.keys.brake || this.pad.brake;
    // Smooth the stick (time-based, so it feels the same at 30 or 144 fps)
    const js = this.joystick;
    const ks = 1 - Math.pow(1 - this.joystickSmoothing, dt);
    js.sx += (js.x - js.sx) * ks;
    js.sy += (js.y - js.sy) * ks;
    const stickMag = Math.hypot(js.sx, js.sy);
    let stickActive = false;

    if (stickMag > this.joystickDeadzone && this.viewCamera) {
      // ── Point-to-drive: screen direction → world heading ──
      stickActive = true;
      const cf = this.viewCamera.getWorldDirection(this._probe);
      cf.y = 0; cf.normalize();                          // screen-up on the ground
      const rx = -cf.z, rz = cf.x;                       // screen-right on the ground
      const wx = rx * js.sx + cf.x * -js.sy;
      const wz = rz * js.sx + cf.z * -js.sy;
      const want = Math.atan2(wx, wz);                   // same convention as getForward()
      this.stickTarget = want;

      // Forward unless the stick points clearly behind the cart (beyond
      // ±135°, with 20° of hysteresis so it doesn't flicker at the edge).
      const diffF = wrapAngle(want - this.rotation);
      const lim = this.stickReverse ? (Math.PI * 0.75 - 0.35) : (Math.PI * 0.75 + 0.35);
      this.stickReverse = Math.abs(diffF) > lim;

      // Throttle from how far the stick is pushed (eased: small push = creep)
      const push = THREE.MathUtils.clamp((stickMag - this.joystickDeadzone) / (0.85 - this.joystickDeadzone), 0, 1);
      const throttle = Math.pow(push, 1.5);
      const FULL_LOCK_AT = Math.PI / 4;                  // full lock once 45° off target
      if (!this.stickReverse) {
        inSteer = THREE.MathUtils.clamp(diffF / FULL_LOCK_AT, -1, 1);
        // Ease off when asking for a hard turn so the cart swings round
        // instead of drawing a wide arc at full speed
        inFwd = throttle * THREE.MathUtils.lerp(1, 0.55, Math.min(1, Math.abs(diffF) / (Math.PI / 2)));
        inFwd = Math.max(inFwd, 0.25);                   // always enough to turn
      } else {
        const diffR = wrapAngle(want - (this.rotation + Math.PI));
        inSteer = -THREE.MathUtils.clamp(diffR / FULL_LOCK_AT, -1, 1);
        inFwd = -Math.max(throttle, 0.4);
      }
    } else {
      this.stickTarget = null;
      if (stickMag <= this.joystickDeadzone) this.stickReverse = false;
      if (stickMag > this.joystickDeadzone) {
        // No camera yet (shouldn't happen): fall back to cart-relative stick
        const fwd = -js.sy;
        inFwd = fwd > 0.08 ? Math.min(1, (fwd - 0.08) / 0.55) : (fwd < -0.25 ? -Math.min(1, (-fwd - 0.25) / 0.55) : 0);
        inSteer = THREE.MathUtils.clamp(-js.sx, -1, 1);
      }
      if (this.keys.forward)  inFwd =  1;
      if (this.keys.backward) inFwd = -1;
      if (this.keys.left)  inSteer =  1;
      if (this.keys.right) inSteer = -1;
    }
    if (this.pad.active) {           // gamepad triggers: RT − LT, left stick X steers
      inFwd = THREE.MathUtils.clamp(this.pad.throttle, -1, 1);
      inSteer = THREE.MathUtils.clamp(this.pad.steer, -1, 1);
      stickActive = false;
    }
    if (this.inputLocked) { inFwd = 0; inSteer = 0; inBrake = true; stickActive = false; }

    // ── Opposite input brakes first, then reverses (Bruno's reverseBrake) ──
    const opposing = (inFwd < 0 && this.velocity > 0.01) || (inFwd > 0 && this.velocity < -0.01);
    let braking = inBrake;
    if (opposing) { braking = true; }

    // ── Acceleration (approach a target speed) ───────────────
    // Partial throttle means partial speed rather than partial thrust, so a
    // half-pushed stick never stalls against rolling friction.
    // Boost (Shift): higher target speed + stronger pull, forward only
    this.boosting = !!((this.keys.boost || this.pad.boost) && inFwd > 0 && !this.inputLocked && !opposing);
    if (!opposing) {
      if (inFwd > 0) {
        const target = this.maxSpeed * inFwd * (this.boosting ? this.boostSpeed : 1);
        const acc = this.accel * (this.boosting ? this.boostAccel : 1);
        this.velocity = this.velocity < target
          ? Math.min(this.velocity + acc * dt, target)
          : Math.max(this.velocity - this.friction * dt, target);
      } else if (inFwd < 0) {
        const target = -this.reverseMax * -inFwd;
        this.velocity = this.velocity > target
          ? Math.max(this.velocity - this.accel * dt, target)
          : Math.min(this.velocity + this.friction * dt, target);
      }
    }

    // ── Brake ────────────────────────────────────────────────
    if (braking) {
      if (this.velocity > 0) this.velocity = Math.max(0, this.velocity - this.brakeForce * dt);
      else                   this.velocity = Math.min(0, this.velocity + this.brakeForce * dt);
    }

    // ── Rolling friction (only while coasting) ───────────────
    if (inFwd === 0) {
      if (Math.abs(this.velocity) > this.friction * dt)
        this.velocity -= Math.sign(this.velocity) * this.friction * dt;
      else
        this.velocity = 0;
    }

    // ── Steering ─────────────────────────────────────────────
    // Speed-sensitive lock: full lock when crawling, ~55 % at top speed so
    // a held key doesn't spin the cart. Eased toward the target (time-based).
    {
      const lock = this.maxSteerAngle * THREE.MathUtils.lerp(1, 0.55, speedRatio);
      const target = THREE.MathUtils.clamp(inSteer, -1, 1) * lock;
      const diff = target - this.steerAngle;
      const k = 1 - Math.pow(inSteer !== 0 ? 0.86 : 0.88, dt);   // ~9 %/frame in, ~12 %/frame back
      const floor = (inSteer !== 0 ? this.steerSpeed : this.steerReturn) * 0.2 * dt;
      const step = Math.min(Math.abs(diff), Math.max(floor, Math.abs(diff) * k));
      this.steerAngle += Math.sign(diff) * step;
      if (inSteer === 0 && Math.abs(this.steerAngle) < 0.005) this.steerAngle = 0;
    }

    // ── Bicycle-model turning ────────────────────────────────
    if (Math.abs(this.velocity) > 0.005) {
      this.rotation += (this.velocity * Math.tan(this.steerAngle) / this.wheelBase) * dt;
    }

    // ── Position ─────────────────────────────────────────────
    const dx = Math.sin(this.rotation) * this.velocity * dt;
    const dz = Math.cos(this.rotation) * this.velocity * dt;
    const newPos = this.position.clone();
    newPos.x += dx;
    newPos.z += dz;

    // World bounds (the city wall's ring collider is the real limit)
    newPos.x = THREE.MathUtils.clamp(newPos.x, -70, 70);
    newPos.z = THREE.MathUtils.clamp(newPos.z, -70, 70);

    // ── Collision: slide along the surface that was hit ──────
    // Find the contact normal (circle → radial, wall ring → inward, box →
    // nearest face), remove the part of the motion going into it and keep
    // the sideways part. Two passes handle corners (box + wall, etc.).
    this.justCollided = false;
    this.impact = 0;
    if (!colliders) {
      this.position.copy(newPos);
    } else {
      let mx = newPos.x - this.position.x, mz = newPos.z - this.position.z;
      const moveLen = Math.hypot(mx, mz);
      let hit = this._hit(newPos, colliders);
      let pass = 0;
      while (hit && pass < 2 && moveLen > 1e-6) {
        const into = mx * hit.nx + mz * hit.nz;          // < 0 when moving into the surface
        if (into < 0) {
          if (pass === 0) this.impact = -into / Math.max(dt, 1e-3);
          mx -= into * hit.nx; mz -= into * hit.nz;
        } else {
          // Already overlapping but moving along/out of it: allow the move
          hit = null;
          break;
        }
        newPos.set(this.position.x + mx, 0, this.position.z + mz);
        hit = this._hit(newPos, colliders);
        pass++;
      }
      if (!hit) {
        this.position.copy(newPos);
        if (this.impact > 0 && moveLen > 1e-6) {
          // Keep the speed that survived the slide (glancing blows keep most of it)
          const kept = Math.hypot(mx, mz) / moveLen;
          this.velocity *= Math.pow(THREE.MathUtils.lerp(0.55, 1, kept), dt);
          // Glancing hit: swing the nose round to run along the surface
          // (what a real body does), so you scrape along instead of grinding.
          if (kept > 0.35) {
            const along = Math.atan2(mx, mz) + (this.velocity < 0 ? Math.PI : 0);
            const prevRot = this.rotation;
            this.rotation += wrapAngle(along - this.rotation) * (1 - Math.pow(0.9, dt));
            if (this._hit(this.position, colliders)) this.rotation = prevRot;   // don't swing a corner into it
          }
        }
      } else {
        // Wedged (head-on or a tight corner): soft bounce
        this.impact = Math.max(this.impact, Math.abs(this.velocity));
        this.velocity *= -0.2;
      }
      if (this.impact > 0.05) this.justCollided = true;
    }

    // ── Stuck detection (3 s of throttle, < 0.5 units travelled) ──
    {
      const moved = Math.hypot(this.position.x - this.group.position.x, this.position.z - this.group.position.z);
      if (Math.abs(inFwd) > 0.5 && !this.inputLocked) {
        this._stuckLog.unshift([moved, realDelta]);
        let dist = 0, time = 0, i = 0;
        for (; i < this._stuckLog.length && time < 3; i++) { dist += this._stuckLog[i][0]; time += this._stuckLog[i][1]; }
        this._stuckLog.length = i;
        this.stuck = time >= 3 && dist < 0.5;
      } else if (Math.abs(this.velocity) > 0.02) {
        this._stuckLog.length = 0;
        this.stuck = false;
      }
    }

    // ── Sync transform ───────────────────────────────────────
    this.group.position.copy(this.position);
    this.group.rotation.y = this.rotation;

    // ── Wheels: roll at the true rate (distance / radius), front ones steer
    this.wheelAngle += (this.velocity * dt) / 0.32;
    this.wheels.forEach(w => {
      w.rotation.x = this.wheelAngle;
      w.rotation.y = w.userData.front ? this.steerAngle : 0;
    });

    // ── Body: fake suspension (pitch on accel/brake, roll in turns, cobble bob)
    this._updateBody(delta, dt);

    // ── Lamps + state for audio ──────────────────────────────
    this.braking = braking && Math.abs(this.velocity) > 0.005;
    this.reversing = this.velocity < -0.005 && inFwd < 0;
    this._updateLamps(this.braking || (this.inputLocked && Math.abs(this.velocity) > 0.005), this.reversing);
    this._updateSteerMarker(delta, stickActive);

    // ── Lantern sway & pulse ─────────────────────────────────
    if (this.lantern)
      this.lantern.rotation.z = Math.sin(Date.now() * 0.003) * 0.05 + this.steerAngle * 0.3 - this._spring.roll * 1.5;
    if (this.lanternLight)
      this.lanternLight.intensity = 1.0 + Math.sin(Date.now() * 0.004) * 0.3;
  }

  // Spring-damper body motion (visual only; physics footprint unchanged)
  _updateBody(delta, dt) {
    if (!this.body) return;
    const sp = this._spring;
    const accel = (this.velocity - this._lastVel) / Math.max(dt, 1e-3);   // units/frame²
    const yaw   = wrapAngle(this.rotation - this._lastRot) / Math.max(dt, 1e-3);
    this._lastVel = this.velocity;
    this._lastRot = this.rotation;

    // Targets: braking (accel<0 going forward) dips the nose; cornering
    // leans the body to the outside of the turn. Clamped to a few degrees.
    const pitchT = THREE.MathUtils.clamp(-accel * 9, -0.06, 0.06);
    const rollT  = THREE.MathUtils.clamp(this.velocity * yaw * 22, -0.075, 0.075);
    if (this.reducedMotion) { sp.pitch = sp.roll = sp.pitchV = sp.rollV = 0; this.body.rotation.set(0, 0, 0); this.body.position.y = 0; return; }

    // Semi-implicit Euler in small steps (stable at any frame rate)
    const K = 140, C = 11;                 // stiffness, damping (slightly under-damped)
    let t = delta;
    while (t > 0) {
      const h = Math.min(t, 1 / 120);
      sp.pitchV += (-K * (sp.pitch - pitchT) - C * sp.pitchV) * h;
      sp.pitch  += sp.pitchV * h;
      sp.rollV  += (-K * (sp.roll - rollT) - C * sp.rollV) * h;
      sp.roll   += sp.rollV * h;
      t -= h;
    }
    // Cobble bob: tiny, speed-scaled, tied to wheel rotation so it reads as road texture
    this._bobT += Math.abs(this.velocity) * dt;
    const s = Math.min(1, Math.abs(this.velocity) / this.maxSpeed);
    const bob = (Math.sin(this._bobT * 9.0) * 0.6 + Math.sin(this._bobT * 23.0) * 0.4) * 0.018 * s;

    this.body.rotation.x = sp.pitch;
    this.body.rotation.z = sp.roll;
    this.body.position.y = bob;
  }

  _updateLamps(braking, reversing) {
    if (!this.tailMat) return;
    const tailT = braking ? 2.4 : 0.25;
    const revT  = reversing ? 1.6 : 0;
    this.tailMat.emissiveIntensity += (tailT - this.tailMat.emissiveIntensity) * 0.35;
    this.reverseMat.emissiveIntensity += (revT - this.reverseMat.emissiveIntensity) * 0.35;
  }

  _updateSteerMarker(delta, active) {
    const m = this.steerMarker;
    if (!m) return;
    const target = active ? 0.42 : 0;
    m.opacity += (target - m.opacity) * (1 - Math.pow(0.001, delta));   // ~0.15 s fade
    m.mat.opacity = m.opacity;
    m.group.visible = m.opacity > 0.01;
    if (!m.group.visible) return;
    m.group.position.set(this.position.x, 0.12, this.position.z);
    if (this.stickTarget !== null) {
      // pivot's local -Z points along the arrow; heading convention: forward = (sin a, cos a)
      m.pivot.rotation.y = this.stickTarget + Math.PI;
    }
    m.mat.color.setHex(this.stickReverse ? 0xffc46b : 0x7dffcf);
  }

  /**
   * True if any footprint probe at `pos` (with current heading) is inside a
   * collider. Colliders may be THREE.Box3 (buildings), `{ circle, x, z, r }`
   * (fountain, towers, lamp posts) or `{ ring, r }` (stay INSIDE radius r —
   * the city wall).
   */
  _blocked(pos, colliders) {
    const s = Math.sin(this.rotation), c = Math.cos(this.rotation);
    for (const [fx, fz] of this._footprint) {
      // local (x right, z forward) → world, matching getForward()
      const px = pos.x + fx * c + fz * s;
      const pz = pos.z - fx * s + fz * c;
      for (const col of colliders) {
        if (col.isBox3) {
          if (px >= col.min.x && px <= col.max.x && pz >= col.min.z && pz <= col.max.z) return true;
        } else if (col.circle) {
          const dx = px - col.x, dz = pz - col.z;
          if (dx * dx + dz * dz < col.r * col.r) return true;
        } else if (col.ring) {
          if (px * px + pz * pz > col.r * col.r) return true;
        }
      }
    }
    return false;
  }

  /**
   * First footprint probe at `pos` that is inside a collider, with the
   * surface normal pointing OUT of the obstacle (into free space).
   * Returns null when the footprint is clear.
   */
  _hit(pos, colliders) {
    const s = Math.sin(this.rotation), c = Math.cos(this.rotation);
    for (const [fx, fz] of this._footprint) {
      const px = pos.x + fx * c + fz * s;
      const pz = pos.z - fx * s + fz * c;
      for (const col of colliders) {
        if (col.isBox3) {
          if (px >= col.min.x && px <= col.max.x && pz >= col.min.z && pz <= col.max.z) {
            // nearest face
            const dl = px - col.min.x, dr = col.max.x - px, dn = pz - col.min.z, df = col.max.z - pz;
            const m = Math.min(dl, dr, dn, df);
            if (m === dl) return { nx: -1, nz: 0 };
            if (m === dr) return { nx: 1, nz: 0 };
            if (m === dn) return { nx: 0, nz: -1 };
            return { nx: 0, nz: 1 };
          }
        } else if (col.circle) {
          const dx = px - col.x, dz = pz - col.z;
          const d2 = dx * dx + dz * dz;
          if (d2 < col.r * col.r) {
            const d = Math.sqrt(d2) || 1;
            return { nx: dx / d, nz: dz / d };
          }
        } else if (col.ring) {
          const d2 = px * px + pz * pz;
          if (d2 > col.r * col.r) {
            const d = Math.sqrt(d2);
            return { nx: -px / d, nz: -pz / d };
          }
        }
      }
    }
    return null;
  }

  // ── Getters ────────────────────────────────────────────────
  getPosition() { return this.position.clone(); }
  getRotation() { return this.rotation; }
  getSpeed()    { return Math.abs(this.velocity); }
  getForward()  {
    return new THREE.Vector3(Math.sin(this.rotation), 0, Math.cos(this.rotation));
  }
}


// ════════════════════════════════════════════════════════════════
// FOLLOW CAMERA
// ════════════════════════════════════════════════════════════════

export class FollowCamera {
  constructor(camera, { domElement = null } = {}) {
    this.camera = camera;
    this.domElement = domElement;   // canvas: mouse drag-to-look starts here

    // Isometric is the only view. The camera sits on a fixed diagonal
    // (south-east, looking north-west) at a fixed elevation and follows
    // the cart without rotating with it. A narrow lens (FOV ~32°) from
    // further away gives the flat "diorama" look of folio-2025 with much
    // less edge distortion than the old 60° lens at 27 units.
    this.fov        = 32;
    this.isoDir     = new THREE.Vector3(15, 20, 15).normalize();  // ~43° elevation
    this.isoDist    = 50;        // base distance along isoDir (same ground in view as 60° @ 27)
    this.zoom       = 1;         // user zoom (wheel / pinch), 0.6 – 1.5
    this.minZoom    = 0.6;
    this.maxZoom    = 1.5;
    this.speedBoost = 3.0;       // pull back a little at speed
    this.smoothness = 0.08;
    this._dist      = this.isoDist;
    // The camera now sits 20–75 units from anything it looks at, so a near
    // plane of 4 (was 0.5) buys ~8× depth precision — no z-fighting stripes
    // between the ground, roads and plaza at this distance.
    camera.fov = this.fov;
    camera.near = 4;
    camera.updateProjectionMatrix();

    // Look-ahead: frame a little ahead of the cart in its direction of travel
    this.lookAheadDist = 6;      // world units at top speed
    this._ahead = new THREE.Vector3();

    // Drag-to-look (mouse drag / two-finger pan). Springs back when you drive.
    this.pan = new THREE.Vector3();
    this.panMax = 26;
    this._lastPanTime = -1e9;
    this._dragMoved = false;

    // Framing a building while its project card is open
    this._frame = { target: null, mix: 0, point: new THREE.Vector3() };

    this.isIsometric    = true;  // kept for anything that reads it
    this.shakeIntensity = 0;
    this.roll = { value: 0, speed: 0, pull: 100, damping: 4 };
    this._boostZoom = 0;         // extra distance while boosting (eased)
    this.reducedMotion  = false; // set by town-world from prefers-reduced-motion

    this._pos    = new THREE.Vector3();
    this._lookAt = new THREE.Vector3();
    this._focus  = new THREE.Vector3();   // what the camera is centred on (cart + look-ahead + pan)
    this._ready  = false;
    this._tmp    = new THREE.Vector3();

    this.setupEvents();
  }

  // Portrait screens see much less horizontally, so back the camera off.
  _aspectFactor() {
    const a = this.camera.aspect || 1;
    return a < 1 ? Math.min(1.45, 1 / Math.sqrt(a)) : 1;
  }

  // Screen-space pixels → world pan on the ground plane
  _panBy(dxPx, dyPx) {
    const cf = this.camera.getWorldDirection(this._tmp.set(0, 0, 0));
    cf.y = 0; cf.normalize();
    const rx = -cf.z, rz = cf.x;                       // screen-right on the ground
    const h = this.camera.position.distanceTo(this._lookAt) || this.isoDist;
    const worldPerPx = 2 * h * Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2)) / (innerHeight || 1);
    const elev = Math.asin(this.isoDir.y);             // screen-up covers more ground (foreshortening)
    const sx = dxPx * worldPerPx, sy = dyPx * worldPerPx / Math.sin(elev);
    // Drag right → the world follows the finger → the view moves left
    this.pan.x -= rx * sx - cf.x * sy;
    this.pan.z -= rz * sx - cf.z * sy;
    const len = Math.hypot(this.pan.x, this.pan.z);
    if (len > this.panMax) { this.pan.x *= this.panMax / len; this.pan.z *= this.panMax / len; }
    this._lastPanTime = performance.now();
  }

  /** True once if the last mouse press turned into a drag (so the canvas click handler can ignore it). */
  consumeDrag() { const d = this._dragMoved; this._dragMoved = false; return d; }

  /** Gently frame a building (THREE.Vector3) while its project is open; null to release. */
  frame(target) { this._frame.target = target ? target.clone() : null; }

  setupEvents() {
    const blocked = (t) => t && t.closest && t.closest('.modal-overlay, .zone-hud, #town-map, .controls-overlay, #mobile-joystick, button');

    // Scroll-wheel zoom (desktop)
    window.addEventListener('wheel', (e) => {
      if (blocked(e.target)) return;
      this.zoom = THREE.MathUtils.clamp(this.zoom * (1 + e.deltaY * 0.001), this.minZoom, this.maxZoom);
    }, { passive: true });

    // Mouse drag on the canvas: look around (springs back when you drive)
    let drag = null;
    window.addEventListener('pointerdown', (e) => {
      if (e.pointerType !== 'mouse' || e.button !== 0) return;
      if (!this.domElement || e.target !== this.domElement) return;
      drag = { x: e.clientX, y: e.clientY, moved: 0 };
      this._dragMoved = false;
    });
    window.addEventListener('pointermove', (e) => {
      if (!drag || e.pointerType !== 'mouse') return;
      const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
      drag.x = e.clientX; drag.y = e.clientY;
      drag.moved += Math.abs(dx) + Math.abs(dy);
      if (drag.moved > 6) {
        this._dragMoved = true;
        if (this.domElement) this.domElement.style.cursor = 'grabbing';
        this._panBy(dx, dy);
      }
    });
    const endDrag = () => { if (drag && this.domElement) this.domElement.style.cursor = ''; drag = null; };
    window.addEventListener('pointerup', endDrag);
    window.addEventListener('pointercancel', endDrag);

    // Two fingers on the scene: pinch = zoom, move together = pan.
    // Only touches that land on the scene count — a thumb on the joystick or
    // a button never starts a pinch (that used to zoom while you drove).
    let two = null;
    const sceneTouches = (list) => [...list].filter(t => !blocked(t.target));
    const span = (a, b) => Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
    const mid  = (a, b) => ({ x: (a.clientX + b.clientX) / 2, y: (a.clientY + b.clientY) / 2 });
    const start = (e) => {
      const ts = sceneTouches(e.touches);
      if (ts.length >= 2) {
        two = { ids: [ts[0].identifier, ts[1].identifier], span: span(ts[0], ts[1]), zoom: this.zoom, mid: mid(ts[0], ts[1]) };
      }
    };
    window.addEventListener('touchstart', start, { passive: true });
    window.addEventListener('touchmove', (e) => {
      if (!two) return;
      const a = [...e.touches].find(t => t.identifier === two.ids[0]);
      const b = [...e.touches].find(t => t.identifier === two.ids[1]);
      if (!a || !b) return;
      this.zoom = THREE.MathUtils.clamp(two.zoom * two.span / Math.max(1, span(a, b)), this.minZoom, this.maxZoom);
      const m = mid(a, b);
      this._panBy(m.x - two.mid.x, m.y - two.mid.y);
      two.mid = m;
    }, { passive: true });
    window.addEventListener('touchend', (e) => {
      if (!two) return;
      const still = [...e.touches].filter(t => two.ids.includes(t.identifier));
      if (still.length < 2) two = null;
    }, { passive: true });
  }

  // Called when the cart hits something: a damped camera roll "kick"
  // (Bruno Simon's View.roll) instead of random position shake — calmer,
  // reads as an impact, and is skipped entirely for reduced motion.
  kick(strength = 1) {
    if (this.reducedMotion) return;
    this.roll.speed += THREE.MathUtils.clamp(strength, 0, 1.5) * 0.9 * (Math.random() < 0.5 ? -1 : 1);
  }
  addShake() { this.kick(0.6); }   // backwards-compatible name

  update(cart, delta = 1 / 60) {
    const cartPos   = cart.getPosition();
    const cartSpeed = cart.getSpeed();
    const dt = Math.min(delta, 0.1) * 60;       // frames at 60 fps
    const ease = (perFrame) => 1 - Math.pow(1 - perFrame, dt);

    if (cart.justCollided) this.kick(cart.impact / 0.12);   // ~1 at a full-speed head-on hit

    // Boost pulls the camera back a little (eased in, eased out)
    this._boostZoom += ((cart.boosting ? 7 : 0) - this._boostZoom) * (1 - Math.pow(cart.boosting ? 0.97 : 0.95, dt));

    // ── Look-ahead: lead the frame in the direction of travel ──
    // (matters most when driving toward the camera, i.e. south-east)
    const v = cart.velocity || 0;
    const lead = THREE.MathUtils.clamp(v / 0.2, -0.5, 1.6) * this.lookAheadDist;
    const fwd = cart.getForward();
    this._ahead.x += (fwd.x * lead - this._ahead.x) * ease(0.035);
    this._ahead.z += (fwd.z * lead - this._ahead.z) * ease(0.035);

    // ── Pan spring: snaps back while you drive, drifts back when idle ──
    const driving = Math.abs(v) > 0.02 || cart.joystick?.active ||
      (cart.keys && (cart.keys.forward || cart.keys.backward || cart.keys.left || cart.keys.right));
    const sincePan = (performance.now() - this._lastPanTime) / 1000;
    const back = driving ? ease(0.12) : (sincePan > 2.5 ? ease(0.02) : 0);
    this.pan.multiplyScalar(1 - back);
    if (this.pan.lengthSq() < 1e-4) this.pan.set(0, 0, 0);

    // ── Framing a building while its card is open ──
    const fr = this._frame;
    fr.mix += ((fr.target ? 1 : 0) - fr.mix) * ease(fr.target ? 0.06 : 0.08);
    if (fr.target) fr.point.copy(fr.target);

    // Focus = cart + look-ahead + pan, blended toward the cart↔building midpoint
    const f = this._focus.set(cartPos.x + this._ahead.x + this.pan.x, 0, cartPos.z + this._ahead.z + this.pan.z);
    if (fr.mix > 0.001) {
      const mx = (cartPos.x + fr.point.x) / 2, mz = (cartPos.z + fr.point.z) / 2;
      f.x += (mx - f.x) * fr.mix; f.z += (mz - f.z) * fr.mix;
    }

    // Distance: base × zoom × portrait factor, eased out a touch at speed; closer when framing
    const target = (this.isoDist * this.zoom * this._aspectFactor() + Math.min(cartSpeed, 0.2) * this.speedBoost * 10 + this._boostZoom)
      * THREE.MathUtils.lerp(1, 0.72, fr.mix);
    this._dist = THREE.MathUtils.lerp(this._dist, target, ease(0.05));

    const desiredLook = this._tmp.set(f.x, cartPos.y + 1.2, f.z);
    const desiredPos = desiredLook.clone().addScaledVector(this.isoDir, this._dist);

    if (!this._ready) {
      // Entry: start high and far on the same diagonal, then glide in
      this._pos.copy(desiredLook).addScaledVector(this.isoDir, this._dist * 2.4);
      this._lookAt.copy(desiredLook);
      this._ready = true;
    }

    // Pans follow the finger tightly; everything else is smoothed
    const k = ease(cart.teleporting ? 0.15 : (sincePan < 0.15 ? 0.35 : this.smoothness));
    this._pos.lerp(desiredPos, k);
    this._lookAt.lerp(desiredLook, k);

    this.camera.position.copy(this._pos);
    this.camera.lookAt(this._lookAt);

    // Roll kick: spring pulled back to 0, damped (time-based)
    const r = this.roll, h = Math.min(delta, 0.1);
    r.speed += -r.value * r.pull * h;
    r.value += r.speed * h;
    r.speed *= Math.max(0, 1 - r.damping * h);
    if (Math.abs(r.value) < 1e-4 && Math.abs(r.speed) < 1e-3) { r.value = 0; r.speed = 0; }
    this.camera.rotateZ(r.value * 0.5);              // roll about the view axis (≈2–3° on a hard hit)
  }
}
