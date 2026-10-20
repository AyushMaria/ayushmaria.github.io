/**
 * street-orbs.js — the town's street lights: armillary orbs
 *
 * No poles: each light is a gold orb held still in the air inside two
 * crossed bronze rings, with a small stone keystone floating under it and a
 * soft camera-facing halo around it. Nothing moves; the lamplight pool on the
 * ground (terrain.js) and the shared PointLight pool still come from the
 * orb's position.
 *
 * Draw calls: orb, rings, keystones (merged town-wide) + one instanced halo.
 */
import * as THREE from 'three';
import { mergeBufferGeometries } from 'https://cdn.jsdelivr.net/npm/three@0.150.0/examples/jsm/utils/BufferGeometryUtils.js';
import { stoneTexture } from './textures.js';

/** Height of the orb's centre above the ground (the old lamp heads sat at 3.6). */
export const ORB_HEIGHT = 3.7;

const ORB_R = 0.24;
const RING_A = 0.5, RING_B = 0.41;
const KEY_DROP = 0.78;        // keystone centre below the orb (its foot stays above the cart's canopy)

/**
 * @param scene
 * @param {{x, y, z}[]} spots  ground point under each light
 * @returns {{ group, orbs: THREE.Vector3[], setLevel(v: number) }}
 */
export function buildStreetOrbs(scene, spots) {
  const orbMat = new THREE.MeshStandardMaterial({ color: 0x000000, emissive: 0xffe2a0, emissiveIntensity: 1.3, toneMapped: false });
  const bronze = new THREE.MeshStandardMaterial({ color: 0xb08a3e, metalness: 0.8, roughness: 0.35 });
  const stone = new THREE.MeshStandardMaterial({ map: stoneTexture(), color: 0x9a948a, roughness: 0.9 });
  const P = { orb: [], ring: [], key: [] };
  const orbs = [];

  spots.forEach((s, i) => {
    const y = s.y + ORB_HEIGHT, r = i * 0.9;           // each light turned a little differently
    orbs.push(new THREE.Vector3(s.x, y, s.z));
    P.orb.push(new THREE.SphereGeometry(ORB_R, 18, 12).translate(s.x, y, s.z));
    const a = new THREE.TorusGeometry(RING_A, 0.028, 6, 40); a.rotateX(Math.PI / 2 - 0.5); a.rotateY(r); a.translate(s.x, y, s.z);
    const b = new THREE.TorusGeometry(RING_B, 0.024, 6, 36); b.rotateY(r + Math.PI / 2); b.rotateZ(0.3); b.translate(s.x, y, s.z);
    P.ring.push(a, b);
    const k = new THREE.OctahedronGeometry(0.2, 0); k.scale(1, 1.6, 1); k.rotateY(r); k.translate(s.x, y - KEY_DROP, s.z);
    P.key.push(k);
  });

  const group = new THREE.Group();
  group.name = 'street-orbs';
  for (const [k, mat] of [['orb', orbMat], ['ring', bronze], ['key', stone]]) {
    if (!P[k].length) continue;
    const m = new THREE.Mesh(mergeBufferGeometries(P[k].map(g => g.index ? g.toNonIndexed() : g)), mat);
    m.name = `street-orbs-${k}`;
    m.castShadow = k !== 'orb';
    group.add(m);
  }

  // Halo: one camera-facing quad per orb, additive, sized in world units
  const haloMat = new THREE.ShaderMaterial({
    uniforms: { uColor: { value: new THREE.Color(0xffcf7a) }, uSize: { value: 2.3 }, uStrength: { value: 0.9 } },
    vertexShader: /* glsl */`
      uniform float uSize; varying vec2 vUv;
      void main() {
        vUv = uv;
        vec4 c = modelViewMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
        c.xy += position.xy * uSize;
        gl_Position = projectionMatrix * c;
      }`,
    fragmentShader: /* glsl */`
      uniform vec3 uColor; uniform float uStrength; varying vec2 vUv;
      void main() {
        float d = length(vUv - 0.5) * 2.0;
        float a = pow(max(0.0, 1.0 - d), 1.8) * uStrength;
        gl_FragColor = vec4(uColor, a);
      }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  });
  const halos = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), haloMat, Math.max(1, orbs.length));
  const mx = new THREE.Matrix4();
  orbs.forEach((p, i) => { mx.makeTranslation(p.x, p.y, p.z); halos.setMatrixAt(i, mx); });
  halos.count = orbs.length;
  halos.frustumCulled = false;          // quads grow in the shader; the town is small
  halos.renderOrder = 5;
  halos.name = 'street-orbs-halo';
  group.add(halos);

  scene.add(group);
  return {
    group, orbs,
    /** How lit the town's lights are (applyEvening's lamp level, ~0.1–1). */
    setLevel(v) {
      orbMat.emissiveIntensity = 0.45 + v * 1.15;
      haloMat.uniforms.uStrength.value = 0.25 + v * 0.85;
    },
  };
}
