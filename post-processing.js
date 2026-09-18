/**
 * post-processing.js — Bloom & Colour Grading
 * Phase 2.3 of the Isekai Town implementation.
 *
 * Uses Three.js EffectComposer (loaded via CDN as modules).
 * Exposes a PostProcessing class consumed by town-world.js.
 *
 * The scene is lit as a permanent golden-hour evening, so the grade is a
 * single fixed warm preset (no day/night lerp) and there is no vignette.
 */
import * as THREE from 'three';
import { EffectComposer } from 'https://cdn.jsdelivr.net/npm/three@0.150.0/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'https://cdn.jsdelivr.net/npm/three@0.150.0/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'https://cdn.jsdelivr.net/npm/three@0.150.0/examples/jsm/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'https://cdn.jsdelivr.net/npm/three@0.150.0/examples/jsm/postprocessing/ShaderPass.js';

const ColorGradeShader = {
  uniforms: {
    tDiffuse:    { value: null },
    // RGB multiplier — warm evening amber
    uColorShift: { value: new THREE.Vector3(1.02, 0.95, 0.88) },
    // Slight saturation lift for the painterly reference look
    uSaturation: { value: 1.08 },
    // Gentle lift of the shadows so the low sun doesn't crush the streets
    uLift:       { value: 0.0 },
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
    uniform vec3  uColorShift;
    uniform float uSaturation;
    uniform float uLift;
    varying vec2  vUv;

    void main() {
      vec4 texel = texture2D(tDiffuse, vUv);
      texel.rgb = texel.rgb * uColorShift + uLift;
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
   * @param {{bloom?:boolean, bloomScale?:number}} [options]  mobile tier can
   *        run bloom at reduced resolution (or off)
   */
  constructor(renderer, scene, camera, options = {}) {
    this.renderer = renderer;
    this.scene    = scene;
    this.camera   = camera;
    this.options  = Object.assign({ bloom: true, bloomScale: 1.0 }, options);

    // Leave tone mapping off — the sky dome and materials are tuned
    // for linear color and ACES causes washed-out skies.
    renderer.toneMapping = THREE.NoToneMapping;
    renderer.toneMappingExposure = 1.0;

    // ── Composer ────────────────────────────────
    this.composer = new EffectComposer(renderer);
    this.composer.addPass(new RenderPass(scene, camera));

    // ── UnrealBloomPass ─────────────────────────
    // args: resolution, strength, radius, threshold — tuned so lit windows,
    // lamps and the cart lantern bloom against the dusk without haloing
    // the plaster walls.
    this.bloom = null;
    if (this.options.bloom) {
      const s = this.options.bloomScale;
      this.bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth * s, innerHeight * s), 0.42, 0.5, 0.88);
      this.composer.addPass(this.bloom);
    }

    // ── Colour grade (single pass) ──────────────
    this.colorPass = new ShaderPass(ColorGradeShader);
    this.composer.addPass(this.colorPass);
  }

  /** Call on window resize */
  resize(w, h) {
    this.composer.setSize(w, h);
    if (this.bloom) this.bloom.resolution.set(w * this.options.bloomScale, h * this.options.bloomScale);
  }

  /** Replaces renderer.render() — call at end of animate loop */
  render() {
    this.composer.render();
  }
}
