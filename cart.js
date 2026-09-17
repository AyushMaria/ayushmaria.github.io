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
    // Gentler than the first pass: ~2.5s to top speed instead of ~0.5s,
    // and a longer virtual wheelbase so full lock is ~110°/s, not ~250°/s.
    this.maxSpeed      = 0.26;
    this.reverseMax    = 0.10;
    this.accel         = 0.0045;
    this.brakeForce    = 0.014;
    this.friction      = 0.0022;
    this.steerSpeed    = 0.022;
    this.maxSteerAngle = Math.PI / 6;
    this.steerReturn   = 0.04;
    this.wheelBase     = 4.2;

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
    this.keys = { forward: false, backward: false, left: false, right: false, brake: false };
    this.joystick = { x: 0, y: 0, active: false };
    // Set by town-world while a project modal is open: driving input is
    // ignored and the cart coasts to a stop (keys are still tracked so
    // nothing is "stuck" when the modal closes).
    this.inputLocked = false;

    this._buildModel();
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

    // Base plank
    const base = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.15, 3.2), MAT.wood);
    base.position.y = 0.55;
    base.castShadow = true;
    base.receiveShadow = true;
    this.group.add(base);

    // Side rails
    [-0.85, 0.85].forEach(x => {
      const rail = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.45, 3.0), MAT.darkWood);
      rail.position.set(x, 0.85, 0);
      rail.castShadow = true;
      this.group.add(rail);
    });

    // Front & back panels
    [1.5, -1.5].forEach(z => {
      const panel = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.45, 0.08), MAT.darkWood);
      panel.position.set(0, 0.85, z);
      panel.castShadow = true;
      this.group.add(panel);
    });

    // Hay bale (cargo)
    const hay = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.4, 1.0), MAT.hay);
    hay.position.set(0, 0.82, -0.8);
    hay.rotation.y = 0.15;
    this.group.add(hay);

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
      this.group.add(wg);
      this.wheels.push(wg);
    });

    // Canopy posts
    [
      { x: -0.75, z: 1.2 }, { x: 0.75, z: 1.2 },
      { x: -0.75, z: -1.2 }, { x: 0.75, z: -1.2 },
    ].forEach(pos => {
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 1.4, 6), MAT.darkWood);
      post.position.set(pos.x, 1.82, pos.z);
      post.castShadow = true;
      this.group.add(post);
    });

    // Red canvas canopy
    const canopy = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.06, 2.8), MAT.canopy);
    canopy.position.y = 2.52;
    canopy.castShadow = true;
    this.group.add(canopy);

    // Front lantern post
    const lPost = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.7, 6), MAT.darkWood);
    lPost.position.set(0, 1.0, 1.65);
    this.group.add(lPost);

    // Lantern body
    const lanternG = new THREE.Group();
    lanternG.add(new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.22, 0.18), MAT.glow));
    const lTop = new THREE.Mesh(new THREE.ConeGeometry(0.13, 0.1, 4), MAT.darkWood);
    lTop.position.y = 0.16;
    lTop.rotation.y = Math.PI / 4;
    lanternG.add(lTop);
    lanternG.position.set(0, 1.45, 1.65);
    this.group.add(lanternG);
    this.lantern = lanternG;

    // Lantern point light
    this.lanternLight = new THREE.PointLight(0xFFD166, 1.2, 8);
    this.lanternLight.position.set(0, 1.5, 1.65);
    this.group.add(this.lanternLight);
  }

  // ── Keyboard ──────────────────────────────────────────────
  _setupKeyboard() {
    const keyMap = {
      KeyW: 'forward', ArrowUp: 'forward',
      KeyS: 'backward', ArrowDown: 'backward',
      KeyA: 'left', ArrowLeft: 'left',
      KeyD: 'right', ArrowRight: 'right',
      Space: 'brake',
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
    this.joystick.active = (Math.abs(x) > 0.1 || Math.abs(y) > 0.1);
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

  // ── Cinematic Focus ───────────────────────────────────────────
  setFocusTarget(targetPos) {
    this.focusTarget = targetPos;
  }

  // ── Physics update (called every frame) ───────────────────
  update(delta, colliders) {
    // Teleport: just sync transform, skip physics
    if (this.teleporting) {
      this.group.position.copy(this.position);
      this.group.rotation.y = this.rotation;
      if (this.lantern) this.lantern.rotation.z = Math.sin(Date.now() * 0.003) * 0.04;
      if (this.lanternLight) this.lanternLight.intensity = 1.0 + Math.sin(Date.now() * 0.004) * 0.3;
      return;
    }

    delta = Math.min(delta, 0.05);
    const dt = delta * 60;          // normalise to ~60 fps

    // ── Resolve input ────────────────────────────────────────
    let inFwd = 0, inSteer = 0, inBrake = this.keys.brake;
    if (this.joystick.active) {
      inFwd   = -this.joystick.y;
      inSteer = -this.joystick.x;
    } else {
      if (this.keys.forward)  inFwd =  1;
      if (this.keys.backward) inFwd = -1;
      if (this.keys.left)  inSteer =  1;
      if (this.keys.right) inSteer = -1;
    }
    if (this.inputLocked) { inFwd = 0; inSteer = 0; inBrake = true; }

    // ── Acceleration ─────────────────────────────────────────
    if (inFwd > 0)
      this.velocity = Math.min(this.velocity + this.accel * inFwd * dt, this.maxSpeed);
    else if (inFwd < 0)
      this.velocity = Math.max(this.velocity + this.accel * inFwd * dt, -this.reverseMax);

    // ── Brake ────────────────────────────────────────────────
    if (inBrake) {
      if (this.velocity > 0) this.velocity = Math.max(0, this.velocity - this.brakeForce * dt);
      else                   this.velocity = Math.min(0, this.velocity + this.brakeForce * dt);
    }

    // ── Friction ─────────────────────────────────────────────
    if (Math.abs(this.velocity) > 0.001)
      this.velocity -= Math.sign(this.velocity) * this.friction * dt;
    else if (inFwd === 0)
      this.velocity = 0;

    // ── Steering ─────────────────────────────────────────────
    if (inSteer !== 0) {
      this.steerAngle += this.steerSpeed * inSteer * dt;
      this.steerAngle = THREE.MathUtils.clamp(
        this.steerAngle, -this.maxSteerAngle, this.maxSteerAngle
      );
    } else {
      if (Math.abs(this.steerAngle) > 0.01)
        this.steerAngle -= Math.sign(this.steerAngle) * this.steerReturn * dt;
      else
        this.steerAngle = 0;
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

    // ── Collision (rotated footprint, slide along walls) ─────
    this.justCollided = false;
    if (!colliders || !this._blocked(newPos, colliders)) {
      this.position.copy(newPos);
    } else {
      // Try each axis on its own so the cart slides along a wall
      // instead of stopping dead.
      const slideX = this.position.clone(); slideX.x = newPos.x;
      const slideZ = this.position.clone(); slideZ.z = newPos.z;
      if (!this._blocked(slideX, colliders)) {
        this.position.copy(slideX);
        this.velocity *= 0.9;
      } else if (!this._blocked(slideZ, colliders)) {
        this.position.copy(slideZ);
        this.velocity *= 0.9;
      } else {
        // Head-on: soft bounce and flag for camera shake
        if (Math.abs(this.velocity) > 0.06) this.justCollided = true;
        this.velocity *= -0.2;
      }
    }

    // ── Sync transform ───────────────────────────────────────
    this.group.position.copy(this.position);
    this.group.rotation.y = this.rotation;

    // ── Wheel spin ───────────────────────────────────────────
    this.wheelAngle += this.velocity * dt * 2.5;
    this.wheels.forEach(w => { w.rotation.x = this.wheelAngle; });

    // ── Lantern sway & pulse ─────────────────────────────────
    if (this.lantern)
      this.lantern.rotation.z = Math.sin(Date.now() * 0.003) * 0.05 + this.steerAngle * 0.3;
    if (this.lanternLight)
      this.lanternLight.intensity = 1.0 + Math.sin(Date.now() * 0.004) * 0.3;
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
  constructor(camera) {
    this.camera     = camera;
    
    // Zoom limits and base settings
    this.minDistance = 8;
    this.maxDistance = 25;
    this.baseDistance = 14;     // Target distance controlled by scroll wheel
    this.currentDistance = 14;  // Lerped dynamic distance
    
    this.height     = 7;
    this.lookHeight = 1.8;
    this.smoothness = 0.05;
    this.speedBoost = 12;       // How much the camera zooms out at speed
    
    // Phase 2.4 Features
    this.isIsometric = false;
    this.shakeIntensity = 0;
    this.reducedMotion = false;   // set by town-world from prefers-reduced-motion
    
    this._pos    = new THREE.Vector3();
    this._lookAt = new THREE.Vector3();
    this._ready  = false;

    this.setupEvents();
  }

  setupEvents() {
    // Scroll-wheel zoom
    window.addEventListener('wheel', (e) => {
      if (this.isIsometric) return; // Disallow manual zoom in iso mode
      // Don't zoom the camera while scrolling inside a modal / HUD panel
      if (e.target && e.target.closest && e.target.closest('.modal-overlay, .zone-hud')) return;
      this.baseDistance += e.deltaY * 0.01;
      this.baseDistance = THREE.MathUtils.clamp(this.baseDistance, this.minDistance, this.maxDistance);
    });

    // Keyboard toggle for Isometric 'Q'
    window.addEventListener('keydown', (e) => {
      // Prevent triggering if typing in an input
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
      
      if (e.key.toLowerCase() === 'q') {
        this.isIsometric = !this.isIsometric;
        // Snap out of ready state to force a smooth pan to new perspective
        if (this.isIsometric) this.smoothness = 0.03; // Even smoother transition
      }
    });
  }

  // Called when cart hits a wall
  addShake() {
    if (this.reducedMotion) return;
    this.shakeIntensity = 0.4;
  }

  update(cart) {
    const cartPos = cart.getPosition();
    const cartRot = cart.getRotation();
    const cartSpeed = cart.getSpeed();

    // Trigger shake on collision
    if (cart.justCollided) {
      this.addShake();
    }

    // Dynamic zoom based on speed (camera pulls back when fast)
    this.currentDistance = THREE.MathUtils.lerp(
      this.currentDistance, 
      this.baseDistance + cartSpeed * this.speedBoost, 
      0.03
    );
    
    let desiredPos, desiredLook;

    if (this.isIsometric) {
      // Fixed angle, fixed distance (Classic ARPG view)
      const isoOffset = new THREE.Vector3(15, 20, 15);
      desiredPos = cartPos.clone().add(isoOffset);
      desiredLook = cartPos.clone();
    } else {
      // Standard Follow Camera
      const behind = new THREE.Vector3(
        -Math.sin(cartRot) * this.currentDistance,
        this.height + cartSpeed * 2, // Slight height boost based on speed
        -Math.cos(cartRot) * this.currentDistance
      );
      desiredPos  = cartPos.clone().add(behind);
      desiredLook = cartPos.clone().add(new THREE.Vector3(0, this.lookHeight, 0));
    }

    // Cinematic teleport or snap smoothing
    if (cart.teleporting) {
      this.smoothness = 0.15; // Faster snap while teleporting so camera keeps up
    } else {
      // Normal smoothness but slowly recover if we changed modes
      this.smoothness = THREE.MathUtils.lerp(this.smoothness, 0.05, 0.01);
    }

    if (!this._ready) {
      this._pos.copy(desiredPos);
      this._lookAt.copy(desiredLook);
      this._ready = true;
    }

    this._pos.lerp(desiredPos, this.smoothness);
    this._lookAt.lerp(desiredLook, this.smoothness);
    this._pos.y = Math.max(this._pos.y, 2.5);

    this.camera.position.copy(this._pos);
    this.camera.lookAt(this._lookAt);

    // Apply Shake Effect
    if (this.shakeIntensity > 0) {
      this.camera.position.x += (Math.random() - 0.5) * this.shakeIntensity;
      this.camera.position.y += (Math.random() - 0.5) * this.shakeIntensity;
      this.camera.position.z += (Math.random() - 0.5) * this.shakeIntensity;
      
      // Roll shake
      this.camera.rotation.z += (Math.random() - 0.5) * this.shakeIntensity * 0.1;
      
      this.shakeIntensity -= 0.02; // Decay over frames
      if (this.shakeIntensity < 0) this.shakeIntensity = 0;
    }
  }
}
