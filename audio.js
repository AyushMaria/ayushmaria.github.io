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
      if (this.enabled && this.listener.context.state === 'suspended') this.listener.context.resume();
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
  // Fades the listener's master gain, then suspends the AudioContext so
  // nothing at all reaches the speakers while muted (belt and braces).
  setEnabled(on) {
    this.enabled = !!on;
    writeSoundPref(this.enabled);
    const ctx = this.listener.context;
    const g = this.listener.gain.gain;
    clearTimeout(this._suspendTimer);
    if (this.enabled) {
      if (ctx.state !== 'running') ctx.resume().catch(() => {});
      g.cancelScheduledValues(ctx.currentTime);
      g.setValueAtTime(g.value, ctx.currentTime);
      g.linearRampToValueAtTime(1, ctx.currentTime + 0.25);
    } else {
      g.cancelScheduledValues(ctx.currentTime);
      g.setValueAtTime(g.value, ctx.currentTime);
      g.linearRampToValueAtTime(0, ctx.currentTime + 0.12);
      this._suspendTimer = setTimeout(() => {
        if (!this.enabled && ctx.state === 'running') ctx.suspend().catch(() => {});
      }, 180);
    }
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
    this.wind = this._loop(pink, 0.0, this._filter(ctx, 'lowpass', 300, 0.3));
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
    const fBand = this._filter(ctx, 'bandpass', 1100, 0.7);
    this.fountain = this._loop(pink, 0.3, fBand, true);
    this.fountain.setRefDistance(4);
    this.fountain.setRolloffFactor(2.2);
    this.fountain.setMaxDistance(30);
    this._burble = ctx.createOscillator();
    this._burble.frequency.value = 0.7;
    const burbleGain = ctx.createGain(); burbleGain.gain.value = 0.08;
    this._burble.connect(burbleGain); burbleGain.connect(this.fountain.gain.gain);
    this._burble.start();
    this.fountain.play();

    // 5. Campfire — brown bed, low-passed; crackles are added in update().
    this.fire = this._loop(brown, 0.22, this._filter(ctx, 'lowpass', 280, 0.6), true);
    this.fire.setRefDistance(4);
    this.fire.setRolloffFactor(2.2);
    this.fire.setMaxDistance(28);
    this.fire.play();
    this._nextCrackle = 0;

    // 6. Evening crickets — narrow band, very quiet, slow chirp pulse.
    this.crickets = this._loop(pink, 0.0, this._filter(ctx, 'bandpass', 4300, 14));
    this._chirp = ctx.createOscillator();
    this._chirp.frequency.value = 22;
    const chirpGain = ctx.createGain(); chirpGain.gain.value = 0.006;
    this._chirp.connect(chirpGain); chirpGain.connect(this.crickets.gain.gain);
    this._chirp.start();
    this.crickets.play();

    // 7. Music — a soft evolving pad and sparse pentatonic bells. This is
    //    what you actually notice; the noise beds sit underneath it.
    this._startMusic();
  }

  // ── Music layer ───────────────────────────────────────────────
  _startMusic() {
    const ctx = this.listener.context;
    const out = this.listener.getInput();

    // Pad bus: lowpass + gentle tremolo
    const padOut = ctx.createGain(); padOut.gain.value = 0;
    const padLP = this._filter(ctx, 'lowpass', 750, 0.4);
    padLP.connect(padOut); padOut.connect(out);
    const trem = ctx.createOscillator(); trem.frequency.value = 0.18;
    const tremG = ctx.createGain(); tremG.gain.value = 0.05;
    trem.connect(tremG); tremG.connect(padOut.gain); trem.start();
    this._padOut = padOut;
    padOut.gain.setTargetAtTime(0.16, ctx.currentTime + 0.5, 4);   // slow fade-in

    // Chord progression (Hz): Cmaj7 → Am9 → Fmaj7 → G6, 12 s each, crossfaded
    const CHORDS = [
      [130.81, 196.00, 246.94, 329.63],   // C3 G3 B3 E4
      [110.00, 164.81, 261.63, 329.63],   // A2 E3 C4 E4
      [87.31, 130.81, 220.00, 329.63],    // F2 C3 A3 E4
      [98.00, 146.83, 246.94, 293.66],    // G2 D3 B3 D4
    ];
    const CHORD_LEN = 12, XFADE = 3;
    let idx = 0;
    const playChord = (freqs, at) => {
      const g = ctx.createGain();
      g.gain.setValueAtTime(0, at);
      g.gain.linearRampToValueAtTime(1, at + XFADE);
      g.gain.setValueAtTime(1, at + CHORD_LEN);
      g.gain.linearRampToValueAtTime(0, at + CHORD_LEN + XFADE);
      g.connect(padLP);
      freqs.forEach((f, i) => {
        [-5, 5].forEach(cents => {
          const o = ctx.createOscillator();
          o.type = i === 0 ? 'sine' : 'triangle';
          o.frequency.value = f;
          o.detune.value = cents;
          const vg = ctx.createGain(); vg.gain.value = i === 0 ? 0.32 : 0.18;
          o.connect(vg); vg.connect(g);
          o.start(at); o.stop(at + CHORD_LEN + XFADE + 0.1);
        });
      });
    };
    const scheduleNext = () => {
      if (this._disposed) return;
      if (ctx.state !== 'running') { this._chordTimer = setTimeout(scheduleNext, 500); return; }   // muted: wait
      playChord(CHORDS[idx % CHORDS.length], ctx.currentTime + 0.05);
      idx++;
      this._chordTimer = setTimeout(scheduleNext, CHORD_LEN * 1000);
    };
    scheduleNext();

    // Bells: C major pentatonic, C5–E6, one every few seconds, stereo-spread
    const NOTES = [523.25, 587.33, 659.25, 783.99, 880.00, 1046.5, 1174.7, 1318.5];
    const bellOut = ctx.createGain(); bellOut.gain.value = 0.9; bellOut.connect(out);
    const bell = () => {
      if (this._disposed) return;
      if (ctx.state !== 'running') { this._bellTimer = setTimeout(bell, 500); return; }
      const f = NOTES[Math.floor(Math.random() * NOTES.length)];
      const now = ctx.currentTime;
      const pan = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
      const dest = pan ? (pan.pan.value = (Math.random() - 0.5) * 1.2, pan.connect(bellOut), pan) : bellOut;
      [[1, 0.05], [3.01, 0.012]].forEach(([mult, amp]) => {
        const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = f * mult;
        const g = ctx.createGain();
        g.gain.setValueAtTime(0, now);
        g.gain.linearRampToValueAtTime(amp, now + 0.012);
        g.gain.exponentialRampToValueAtTime(0.0004, now + 1.8 + Math.random() * 1.2);
        o.connect(g); g.connect(dest);
        o.start(now); o.stop(now + 3.2);
      });
      this._bellTimer = setTimeout(bell, 2600 + Math.random() * 5000);
    };
    this._bellTimer = setTimeout(bell, 1500);
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
    const windVol = 0.07 + Math.sin(elapsed * 0.37) * 0.03 + Math.sin(elapsed * 0.11) * 0.025;
    this._setVol(this.wind, Math.max(0, windVol), 0.5);

    // Cart rolling — speed is in world units per frame (max ≈ 0.20)
    const speed = Math.abs(cart.getSpeed() || 0);
    const ratio = Math.min(speed / 0.2, 1);
    this._setVol(this.roll, ratio * 0.18, 0.15);
    this.rollFilter.frequency.setTargetAtTime(220 + ratio * 500, this.listener.context.currentTime, 0.2);

    // Brake hush
    const braking = cart.keys && cart.keys.brake && ratio > 0.15;
    this._setVol(this.brake, braking ? 0.04 + ratio * 0.04 : 0, 0.08);

    // Campfire crackles
    if (this.fire && elapsed > this._nextCrackle) {
      this._crackle();
      this._nextCrackle = elapsed + 0.12 + Math.random() * 0.6;
    }

    // Crickets only in the evening, and only quietly
    this._setVol(this.crickets, isNight ? 0.025 : 0, 0.8);

    // Zone change chime
    const pos = cart.getPosition();
    const newZone = this._determineZone(pos);
    if (newZone !== this.currentZone) {
      this.currentZone = newZone;
      this.playChime();
    }
  }

  dispose() {
    this._disposed = true;
    clearTimeout(this._chordTimer); clearTimeout(this._bellTimer); clearTimeout(this._suspendTimer);
    window.removeEventListener('sound:change', this._onChange);
  }
}
