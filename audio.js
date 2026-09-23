/**
 * audio.js — Isekai Town ambient sound (procedural, no external files)
 *
 * Everything is generated from shaped noise (pink / brown) rather than raw
 * white noise, so it sits in the background instead of hissing. All volume
 * changes are smoothed (setTargetAtTime) to avoid zipper clicks.
 *
 * Mute is a single master gain on the THREE.AudioListener, driven by
 * `setEnabled(bool)`. The site's 🔊 toggle dispatches `sound:change`
 * ({ detail: { on } }) which this class listens for, and the preference is
 * remembered in localStorage under 'isekai-sound'.
 */
import * as THREE from 'three';

const PREF_KEY = 'isekai-sound';

export function readSoundPref(defaultOn = true) {
  try {
    const v = localStorage.getItem(PREF_KEY);
    if (v === 'on') return true;
    if (v === 'off') return false;
  } catch (e) { /* private mode etc. */ }
  return defaultOn;
}
export function writeSoundPref(on) {
  try { localStorage.setItem(PREF_KEY, on ? 'on' : 'off'); } catch (e) { /* ignore */ }
}

export class AudioSystem {
  constructor(camera) {
    this.camera = camera;
    this.initialized = false;
    this.enabled = readSoundPref(true);
    this.listener = new THREE.AudioListener();
    this.camera.add(this.listener);
    this.listener.setMasterVolume(this.enabled ? 1 : 0);

    // Web Audio needs a user gesture before it will make sound.
    const initAudio = () => {
      if (this.listener.context.state === 'suspended') this.listener.context.resume();
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

    // Site-wide sound toggle (index.html #sound-toggle)
    this._onChange = (e) => this.setEnabled(!!(e.detail && e.detail.on));
    window.addEventListener('sound:change', this._onChange);

    this.currentZone = 'Town Square';
  }

  // ── Mute / unmute ─────────────────────────────────────────────
  setEnabled(on) {
    this.enabled = !!on;
    writeSoundPref(this.enabled);
    const ctx = this.listener.context;
    const g = this.listener.gain.gain;
    if (this.enabled && ctx.state === 'suspended') ctx.resume();
    g.cancelScheduledValues(ctx.currentTime);
    g.setTargetAtTime(this.enabled ? 1 : 0, ctx.currentTime, 0.08);
  }
  toggle() { this.setEnabled(!this.enabled); return this.enabled; }

  // ── Noise buffers ─────────────────────────────────────────────
  // Pink noise (Paul Kellet's filter) — much softer than white.
  _pinkBuffer(ctx, seconds = 4) {
    const n = Math.floor(ctx.sampleRate * seconds);
    const buf = ctx.createBuffer(1, n, ctx.sampleRate);
    const d = buf.getChannelData(0);
    let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
    for (let i = 0; i < n; i++) {
      const w = Math.random() * 2 - 1;
      b0 = 0.99886 * b0 + w * 0.0555179;
      b1 = 0.99332 * b1 + w * 0.0750759;
      b2 = 0.96900 * b2 + w * 0.1538520;
      b3 = 0.86650 * b3 + w * 0.3104856;
      b4 = 0.55000 * b4 + w * 0.5329522;
      b5 = -0.7616 * b5 - w * 0.0168980;
      d[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11;
      b6 = w * 0.115926;
    }
    this._seamless(d);
    return buf;
  }
  // Brown noise — deep rumble for wheels / fire bed.
  _brownBuffer(ctx, seconds = 3) {
    const n = Math.floor(ctx.sampleRate * seconds);
    const buf = ctx.createBuffer(1, n, ctx.sampleRate);
    const d = buf.getChannelData(0);
    let last = 0;
    for (let i = 0; i < n; i++) {
      const w = Math.random() * 2 - 1;
      last = (last + 0.02 * w) / 1.02;
      d[i] = last * 3.5;
    }
    this._seamless(d);
    return buf;
  }
  // Short crossfade at the loop point so loops don't click.
  _seamless(d, fade = 2048) {
    const n = d.length;
    for (let i = 0; i < fade; i++) {
      const t = i / fade;
      d[i] = d[i] * t + d[n - fade + i] * (1 - t);
    }
  }

  _filter(ctx, type, freq, q = 1) {
    const f = ctx.createBiquadFilter();
    f.type = type; f.frequency.value = freq; f.Q.value = q;
    return f;
  }
  _loop(buffer, volume, filter, positional = false) {
    const a = positional ? new THREE.PositionalAudio(this.listener) : new THREE.Audio(this.listener);
    a.setBuffer(buffer);
    a.setLoop(true);
    a.setVolume(volume);
    if (filter) a.setFilter(filter);
    return a;
  }
  _setVol(audio, v, tc = 0.12) {
    if (!audio) return;
    audio.gain.gain.setTargetAtTime(v, this.listener.context.currentTime, tc);
  }

  // ── Sound sources ─────────────────────────────────────────────
  setupSounds() {
    const ctx = this.listener.context;
    const pink = this._pinkBuffer(ctx, 4);
    const brown = this._brownBuffer(ctx, 3);

    // 1. Wind — pink noise, low-passed, breathing slowly.
    this.wind = this._loop(pink, 0.0, this._filter(ctx, 'lowpass', 420, 0.4));
    this.wind.play();

    // 2. Cart rolling — brown rumble, filter opens with speed.
    this.rollFilter = this._filter(ctx, 'lowpass', 220, 0.7);
    this.roll = this._loop(brown, 0.0, this.rollFilter);
    this.roll.play();

    // 3. Brake — soft hush instead of a screech.
    this.brake = this._loop(pink, 0.0, this._filter(ctx, 'bandpass', 1400, 1.2));
    this.brake.play();

    // 4. Fountain — pink noise through a band around 900 Hz with a gentle
    //    burble (slow AM), positional so it fades with distance.
    const fBand = this._filter(ctx, 'bandpass', 900, 0.9);
    this.fountain = this._loop(pink, 0.55, fBand, true);
    this.fountain.setRefDistance(6);
    this.fountain.setRolloffFactor(1.4);
    this.fountain.setMaxDistance(60);
    this._burble = ctx.createOscillator();
    this._burble.frequency.value = 0.7;
    const burbleGain = ctx.createGain(); burbleGain.gain.value = 0.12;
    this._burble.connect(burbleGain); burbleGain.connect(this.fountain.gain.gain);
    this._burble.start();
    this.fountain.play();

    // 5. Campfire — brown bed, low-passed; crackles are added in update().
    this.fire = this._loop(brown, 0.35, this._filter(ctx, 'lowpass', 320, 0.6), true);
    this.fire.setRefDistance(5);
    this.fire.setRolloffFactor(1.6);
    this.fire.setMaxDistance(45);
    this.fire.play();
    this._nextCrackle = 0;

    // 6. Evening crickets — narrow band, very quiet, slow chirp pulse.
    this.crickets = this._loop(pink, 0.0, this._filter(ctx, 'bandpass', 4300, 14));
    this._chirp = ctx.createOscillator();
    this._chirp.frequency.value = 22;
    const chirpGain = ctx.createGain(); chirpGain.gain.value = 0.012;
    this._chirp.connect(chirpGain); chirpGain.connect(this.crickets.gain.gain);
    this._chirp.start();
    this.crickets.play();
  }

  attachFountain(mesh) {
    if (this.fountain) mesh.add(this.fountain);
    else setTimeout(() => this.attachFountain(mesh), 500);
  }
  attachFire(mesh) {
    if (this.fire) mesh.add(this.fire);
    else setTimeout(() => this.attachFire(mesh), 500);
  }

  // Short, airy three-note chime (zone change / achievement)
  playChime() {
    if (!this.initialized) return;
    const ctx = this.listener.context;
    const out = this.listener.getInput();   // through master gain → respects mute
    const now = ctx.currentTime;
    [[1046.5, 0], [1318.5, 0.11], [1568.0, 0.22]].forEach(([f, dt]) => {
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.value = f;
      g.gain.setValueAtTime(0, now + dt);
      g.gain.linearRampToValueAtTime(0.05, now + dt + 0.03);
      g.gain.exponentialRampToValueAtTime(0.0005, now + dt + 0.9);
      osc.connect(g); g.connect(out);
      osc.start(now + dt); osc.stop(now + dt + 0.95);
    });
  }

  // Soft crackle pop for the campfire
  _crackle() {
    const ctx = this.listener.context;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = 'square';
    osc.frequency.value = 180 + Math.random() * 260;
    const now = ctx.currentTime;
    g.gain.setValueAtTime(0.0, now);
    g.gain.linearRampToValueAtTime(0.03 + Math.random() * 0.03, now + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0005, now + 0.05 + Math.random() * 0.05);
    osc.connect(g); g.connect(this.fire.getOutput ? this.fire.getOutput() : this.fire.gain);
    osc.start(now); osc.stop(now + 0.12);
  }

  _determineZone(pos) {
    const dist = Math.hypot(pos.x, pos.z);
    if (dist < 18) return 'Town Square';
    const angle = Math.atan2(pos.x, pos.z);
    if (Math.abs(angle) < Math.PI / 4) return 'Town Square';
    // Names match ZONES in town-world.js (HUD, modal header, achievements)
    if (angle > Math.PI / 4 && angle < 3 * Math.PI / 4) return 'Research Quarter';   // East
    if (angle < -Math.PI / 4 && angle > -3 * Math.PI / 4) return 'Services Quarter'; // West
    if (Math.abs(angle) >= 3 * Math.PI / 4) return 'Main Street';                      // North
    return 'Town Square';
  }

  update(delta, elapsed, cart, isNight) {
    if (!this.initialized) return;

    // Wind breathes slowly
    const windVol = 0.16 + Math.sin(elapsed * 0.37) * 0.05 + Math.sin(elapsed * 0.11) * 0.04;
    this._setVol(this.wind, Math.max(0, windVol), 0.5);

    // Cart rolling — speed is in world units per frame (max ≈ 0.20)
    const speed = Math.abs(cart.getSpeed() || 0);
    const ratio = Math.min(speed / 0.2, 1);
    this._setVol(this.roll, ratio * 0.28, 0.15);
    this.rollFilter.frequency.setTargetAtTime(220 + ratio * 500, this.listener.context.currentTime, 0.2);

    // Brake hush
    const braking = cart.keys && cart.keys.brake && ratio > 0.15;
    this._setVol(this.brake, braking ? 0.06 + ratio * 0.06 : 0, 0.08);

    // Campfire crackles
    if (this.fire && elapsed > this._nextCrackle) {
      this._crackle();
      this._nextCrackle = elapsed + 0.12 + Math.random() * 0.6;
    }

    // Crickets only in the evening, and only quietly
    this._setVol(this.crickets, isNight ? 0.05 : 0, 0.8);

    // Zone change chime
    const pos = cart.getPosition();
    const newZone = this._determineZone(pos);
    if (newZone !== this.currentZone) {
      this.currentZone = newZone;
      this.playChime();
    }
  }

  dispose() {
    window.removeEventListener('sound:change', this._onChange);
  }
}
