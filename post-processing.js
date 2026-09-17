/**
 * post-processing.js — Bloom, Vignette & Color Grading
 * Phase 2.3 of the Isekai Town implementation.
 *
 * Uses Three.js EffectComposer (loaded via CDN as globals).
 * Exposes a PostProcessing class consumed by town-world.js.
 */
import * as THREE from 'three';
import { EffectComposer } from 'https://cdn.jsdelivr.net/npm/three@0.150.0/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'https://cdn.jsdelivr.net/npm/three@0.150.0/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'https://cdn.jsdelivr.net/npm/three@0.150.0/examples/jsm/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'https://cdn.jsdelivr.net/npm/three@0.150.0/examples/jsm/postprocessing/ShaderPass.js';

const VignetteColorShader = {
  uniforms: {
    tDiffuse:          { value: null },
    uVignetteOffset:   { value: 1.1 },
    uVignetteDarkness: { value: 1.3 },
    // RGB multiplier — lerped between day (warm) and night (cool)
    uColorShift:       { value: new THREE.Vector3(1.0, 0.97, 0.92) },
    // Saturation — day is slightly boosted for the painterly reference look
    uSaturation:       { value: 1.0 },
  },

  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,

  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float uVignetteOffset;
    uniform float uVignetteDarkness;
    uniform vec3  uColorShift;
    uniform float uSaturation;
    varying vec2  vUv;

    void main() {
      vec4 texel = texture2D(tDiffuse, vUv);

      // ── Vignette ──────────────────────────────
      vec2 uv = (vUv - 0.5) * 2.0;
      float vig = clamp(uVignetteOffset - dot(uv, uv) * uVignetteDarkness, 0.0, 1.0);
      texel.rgb *= vig;

      // ── Color grading ─────────────────────────
      texel.rgb *= uColorShift;
      float luma = dot(texel.rgb, vec3(0.299, 0.587, 0.114));
      texel.rgb = mix(vec3(luma), texel.rgb, uSaturation);

      gl_FragColor = texel;
    }
  `,
};

// ════════════════════════════════════════════════════════════════
// PostProcessing class
// ════════════════════════════════════════════════════════════════

export class PostProcessing {
  /**
   * @param {THREE.WebGLRenderer} renderer
   * @param {THREE.Scene}         scene
   * @param {THREE.Camera}        camera
   */
  constructor(renderer, scene, camera, options = {}) {
    this.renderer = renderer;
    this.scene    = scene;
    this.camera   = camera;
    // Phase 4.3: mobile tier can run bloom at reduced resolution (or off)
    this.options  = Object.assign({ bloom: true, bloomScale: 1.0 }, options);

    // Leave tone mapping off — the sky dome and materials are tuned
    // for linear color and ACES causes washed-out skies.
    // Bloom + color grading shader handle the HDR feel instead.
    renderer.toneMapping = THREE.NoToneMapping;
    renderer.toneMappingExposure = 1.0;

    // ── Composer ────────────────────────────────
    this.composer = new EffectComposer(renderer);

    // Base render pass
    const renderPass = new RenderPass(scene, camera);
    this.composer.addPass(renderPass);

    // ── UnrealBloomPass ─────────────────────────
    // args: resolution, strength, radius, threshold
    this.bloom = null;
    if (this.options.bloom) {
      const s = this.options.bloomScale;
      const res = new THREE.Vector2(innerWidth * s, innerHeight * s);
      this.bloom = new UnrealBloomPass(res, 0.34, 0.45, 0.9);
      this.composer.addPass(this.bloom);
    }

    // ── Vignette + Color Grading (single pass) ──
    this.colorPass = new ShaderPass(VignetteColorShader);
    this.composer.addPass(this.colorPass);

    // Presets for day/night interpolation
    // Day is a touch warmer/brighter than before (golden-hour reference);
    // saturation is lifted by day and slightly pulled at night.
    this._dayColor   = new THREE.Vector3(1.04, 0.985, 0.90);  // golden amber
    this._nightColor = new THREE.Vector3(0.72, 0.78, 1.05);   // cool blue
    this._daySat = 1.10;
    this._nightSat = 0.94;
    this._targetColor = this._dayColor.clone();
    this._currentColor = this._dayColor.clone();
    this._targetSat = this._daySat;
    this._currentSat = this._daySat;
    this._fitVignette(innerWidth, innerHeight);
  }

  /** Call on window resize */
  resize(w, h) {
    this.composer.setSize(w, h);
    if (this.bloom) this.bloom.resolution.set(w * this.options.bloomScale, h * this.options.bloomScale);
    this._fitVignette(w, h);
  }

  /** Portrait phones get a wider vignette so the road edges aren't swallowed */
  _fitVignette(w, h) {
    const portrait = h > w;
    this.colorPass.uniforms.uVignetteOffset.value = portrait ? 1.4 : 1.1;
  }

  /**
   * Sync color grading with day/night state.
   * @param {boolean} isNight — true when theme is night
   */
  setTimeOfDay(isNight) {
    this._targetColor.copy(isNight ? this._nightColor : this._dayColor);
    this._targetSat = isNight ? this._nightSat : this._daySat;

    // Bloom is more dramatic at night (glowing lanterns, windows)
    if (this.bloom) this.bloom.strength = isNight ? 0.5 : 0.34;

    // Vignette is heavier at night
    this.colorPass.uniforms.uVignetteDarkness.value = isNight ? 1.6 : 1.2;
  }

  /** Call every frame (smoothly lerps color grading toward target) */
  update() {
    this._currentColor.lerp(this._targetColor, 0.03);
    this._currentSat += (this._targetSat - this._currentSat) * 0.03;
    this.colorPass.uniforms.uColorShift.value.copy(this._currentColor);
    this.colorPass.uniforms.uSaturation.value = this._currentSat;
  }

  /** Replaces renderer.render() — call at end of animate loop */
  render() {
    this.composer.render();
  }
}
