import * as THREE from 'three';

export class AudioSystem {
  constructor(camera) {
    this.camera = camera;
    this.initialized = false;
    this.listener = new THREE.AudioListener();
    this.camera.add(this.listener);
    
    // Bind interaction to initialize audio context
    const initAudio = () => {
      if (!this.initialized && this.listener.context.state === 'suspended') {
        this.listener.context.resume();
      }
      if (!this.initialized) {
        this.initialized = true;
        this.setupSounds();
      }
      document.removeEventListener('click', initAudio);
      document.removeEventListener('keydown', initAudio);
      document.removeEventListener('touchstart', initAudio);
    };
    
    document.addEventListener('click', initAudio);
    document.addEventListener('keydown', initAudio);
    document.addEventListener('touchstart', initAudio);

    this.currentZone = "Town Square";
  }

  // Generate white noise buffer
  createNoiseBuffer(ctx, duration = 2.0) {
    const bufferSize = ctx.sampleRate * duration;
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    // basic white noise
    for (let i = 0; i < bufferSize; i++) {
        data[i] = Math.random() * 2 - 1;
    }
    return buffer;
  }

  setupSounds() {
    const ctx = this.listener.context;
    
    // 1. Ambient Wind
    this.wind = new THREE.Audio(this.listener);
    const windBuffer = this.createNoiseBuffer(ctx, 4.0);
    this.wind.setBuffer(windBuffer);
    this.wind.setLoop(true);
    this.wind.setVolume(0);
    this.wind.play();

    // 2. Cart Rolling
    this.roll = new THREE.Audio(this.listener);
    const rollBuffer = this.createNoiseBuffer(ctx, 1.0);
    this.roll.setBuffer(rollBuffer);
    this.roll.setLoop(true);
    this.roll.setVolume(0);
    this.roll.play();
    
    // Custom filter for roll
    this.rollFilter = ctx.createBiquadFilter();
    this.rollFilter.type = 'lowpass';
    this.rollFilter.frequency.value = 400;
    this.roll.setFilter(this.rollFilter);

    // 3. Cart Brake
    this.brake = new THREE.Audio(this.listener);
    this.brake.setBuffer(this.createNoiseBuffer(ctx, 0.5));
    this.brake.setLoop(true);
    this.brake.setVolume(0);
    this.brake.play();
    this.brakeFilter = ctx.createBiquadFilter();
    this.brakeFilter.type = 'highpass';
    this.brakeFilter.frequency.value = 2000;
    this.brake.setFilter(this.brakeFilter);

    // 4. Fountain Splash (Positional)
    this.fountain = new THREE.PositionalAudio(this.listener);
    this.fountain.setBuffer(this.createNoiseBuffer(ctx, 2.0));
    this.fountain.setRefDistance(5);
    this.fountain.setLoop(true);
    this.fountain.setVolume(0.8);
    
    const fFilter = ctx.createBiquadFilter();
    fFilter.type = 'bandpass';
    fFilter.frequency.value = 1200;
    this.fountain.setFilter(fFilter);
    this.fountain.play();
    
    // 5. Fire Crackle (Positional)
    this.fire = new THREE.PositionalAudio(this.listener);
    this.fire.setBuffer(this.createNoiseBuffer(ctx, 1.5));
    this.fire.setRefDistance(6);
    this.fire.setLoop(true);
    this.fire.setVolume(0.6);
    
    const fireFilter = ctx.createBiquadFilter();
    fireFilter.type = 'lowpass';
    fireFilter.frequency.value = 500;
    this.fire.setFilter(fireFilter);
    this.fire.play();

    // Crickets (Night)
    this.crickets = new THREE.Audio(this.listener);
    this.crickets.setBuffer(this.createNoiseBuffer(ctx, 3.0));
    this.crickets.setLoop(true);
    this.crickets.setVolume(0);
    const cricketsFilter = ctx.createBiquadFilter();
    cricketsFilter.type = 'highpass';
    cricketsFilter.frequency.value = 4000;
    this.crickets.setFilter(cricketsFilter);
    this.crickets.play();
  }

  attachFountain(mesh) {
    if (this.fountain) {
      mesh.add(this.fountain);
    } else {
      setTimeout(() => this.attachFountain(mesh), 500); 
    }
  }

  attachFire(mesh) {
    if (this.fire) {
      mesh.add(this.fire);
    } else {
      setTimeout(() => this.attachFire(mesh), 500);
    }
  }

  playChime() {
    if (!this.initialized) return;
    const ctx = this.listener.context;
    
    // Quick, airy arpeggio
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    
    const now = ctx.currentTime;
    osc.type = 'sine';
    
    // C6, E6, G6
    osc.frequency.setValueAtTime(1046.50, now);
    osc.frequency.setValueAtTime(1318.51, now + 0.1);
    osc.frequency.setValueAtTime(1567.98, now + 0.2);
    
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(0.08, now + 0.05);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 1.2);
    
    osc.start(now);
    osc.stop(now + 1.2);
  }

  _determineZone(pos) {
    const dist = Math.sqrt(pos.x * pos.x + pos.z * pos.z);
    
    if (dist < 18) {
      return "Town Square";
    }
    
    // If further out, test direction
    const angle = Math.atan2(pos.x, pos.z); // range -PI to PI
    // South side of the origin
    if (Math.abs(angle) < Math.PI/4) return "Town Square"; // Actually Tavern area is south
    
    // East side (-PI/4 to -3PI/4 or something? Wait: atan2(x,z)
    // x +, z 0 -> PI/2 (East)
    // x -, z 0 -> -PI/2 (West)
    // x 0, z - -> PI or -PI (North)
    
    if (angle > Math.PI/4 && angle < 3*Math.PI/4) return "Research Quarter"; // East
    if (angle < -Math.PI/4 && angle > -3*Math.PI/4) return "West Arm"; // West
    if (Math.abs(angle) >= 3*Math.PI/4) return "North Arm"; // North
    
    return "Town Square";
  }

  update(delta, elapsed, cart, isNight) {
    if (!this.initialized) return;

    // Wind volume fluctuates
    const windVol = 0.05 + Math.sin(elapsed * 0.5) * 0.03;
    if (this.wind) this.wind.setVolume(windVol);

    // Cart rolling volume based on speed
    const speed = Math.abs(cart.getSpeed() || 0);
    const maxSpeed = 15;
    const speedRatio = Math.min(speed / maxSpeed, 1.0);
    
    if (this.roll && this.rollFilter) {
      this.roll.setVolume(speedRatio * 0.15);
      this.rollFilter.frequency.value = 300 + speedRatio * 800;
    }

    // Brake screech
    if (this.brake && cart.keys) { // we need to ensure cart.keys exists though cart.getSpeed() works
      // The brake is usually "spacebar" or when going opp. We can just use speed and a flag if exposed.
      // But we can also guess brake by checking if cart is decelerating rapidly.
      // Easiest is checking if input matches brake. Let's see if cart exposes brake.
      // If not exposed, maybe we can assume:
      if (cart.keys.brake && speed > 2) {
         this.brake.setVolume(0.05 + speedRatio * 0.1);
      } else {
         this.brake.setVolume(0);
      }
    }

    // Fire crackle fluctuation
    if (this.fire) {
      if (Math.random() > 0.8) {
         this.fire.setVolume(0.4 + Math.random() * 0.4);
      }
    }

    // Crickets (pulsates only at night)
    if (this.crickets) {
      if (isNight) {
        const cricketVol = 0.03 + Math.sin(elapsed * 4) * 0.01 + Math.sin(elapsed * 1.5) * 0.02;
        this.crickets.setVolume(Math.max(0, cricketVol));
      } else {
        this.crickets.setVolume(0);
      }
    }

    // Zone Transition Logic
    const pos = cart.getPosition();
    const newZone = this._determineZone(pos);
    if (newZone !== this.currentZone) {
      this.currentZone = newZone;
      this.playChime();
      
      // Update the UI if the zone overlay exists
      const zoneOverlay = document.getElementById('zone-name');
      if (zoneOverlay && newZone !== "Town Square") {
        zoneOverlay.textContent = newZone;
        zoneOverlay.style.opacity = 1;
        setTimeout(() => { zoneOverlay.style.opacity = 0; }, 3000);
      }
    }
  }
}
