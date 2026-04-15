/**
 * particles.js — Reusable Particle Engine
 * Custom THREE.Points based particle systems with simple shaders and pooling
 */

const THREE = window.THREE;

export class ParticleSystem {
  constructor(scene) {
    this.scene = scene;
    this.systems = []; // Track all active particle systems to update them
  }

  update(delta, time) {
    for (const sys of this.systems) {
      if (sys.update) sys.update(delta, time);
    }
  }

  // 1. Fireflies (Ambient glowing dots)
  createFireflies(count = 100, areaBounds = {x: 80, y: 10, z: 120}) {
    const geo = new THREE.BufferGeometry();
    const pos = new Float32Array(count * 3);
    const phases = new Float32Array(count); // Phase for blinking
    const scales = new Float32Array(count); 

    for (let i = 0; i < count; i++) {
       // Random positions within town area
       pos[i*3]   = (Math.random() - 0.5) * areaBounds.x;
       pos[i*3+1] = Math.random() * areaBounds.y + 0.2; // Keep slightly above ground
       pos[i*3+2] = (Math.random() - 0.5) * areaBounds.z - 40; // Offset mostly in town
       phases[i]  = Math.random() * Math.PI * 2;
       scales[i]  = Math.random() * 0.5 + 0.5;
    }

    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('aPhase', new THREE.BufferAttribute(phases, 1));
    geo.setAttribute('aScale', new THREE.BufferAttribute(scales, 1));

    const mat = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uColor: { value: new THREE.Color(0xaaff00) }
      },
      vertexShader: `
        uniform float uTime;
        attribute float aPhase;
        attribute float aScale;
        varying float vAlpha;
        void main() {
          // Bobbing motion
          vec3 p = position;
          p.y += sin(uTime * 0.5 + aPhase) * 0.5;
          p.x += cos(uTime * 0.3 + aPhase) * 0.3;
          
          vec4 mvPosition = modelViewMatrix * vec4(p, 1.0);
          gl_Position = projectionMatrix * mvPosition;
          
          // Blink alpha
          vAlpha = (sin(uTime * 2.0 + aPhase) * 0.5 + 0.5) * aScale;
          gl_PointSize = (15.0 * aScale) / -mvPosition.z;
        }
      `,
      fragmentShader: `
        uniform vec3 uColor;
        varying float vAlpha;
        void main() {
          // Circular particle
          float dist = distance(gl_PointCoord, vec2(0.5));
          if (dist > 0.5) discard;
          
          float glow = 1.0 - (dist * 2.0);
          gl_FragColor = vec4(uColor, glow * vAlpha * 0.8);
        }
      `,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    });

    const points = new THREE.Points(geo, mat);
    this.scene.add(points);
    this.systems.push({
      update: (delta, time) => { mat.uniforms.uTime.value = time; }
    });
    return points;
  }

  // 2. Smoke for chimneys
  createSmoke(origin, count = 20) {
    const geo = new THREE.BufferGeometry();
    const pos = new Float32Array(count * 3);
    const life = new Float32Array(count);
    const maxLife = new Float32Array(count);
    
    // Spread and velocity
    const vels = new Float32Array(count * 3);

    for (let i = 0; i < count; i++) {
        pos[i*3] = origin.x;
        pos[i*3+1] = origin.y;
        pos[i*3+2] = origin.z;
        
        life[i] = Math.random() * 3.0; // random start time
        maxLife[i] = 2.0 + Math.random() * 2.0;

        vels[i*3] = (Math.random() - 0.5) * 0.5;
        vels[i*3+1] = 1.0 + Math.random() * 1.5; // Upward
        vels[i*3+2] = (Math.random() - 0.5) * 0.5;
    }

    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('aLife', new THREE.BufferAttribute(life, 1));
    geo.setAttribute('aMaxLife', new THREE.BufferAttribute(maxLife, 1));
    geo.setAttribute('aVelocity', new THREE.BufferAttribute(vels, 3));

    const mat = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uOrigin: { value: origin },
        uWind: { value: new THREE.Vector3(1, 0, 0) }
      },
      vertexShader: `
        uniform float uTime;
        uniform vec3 uOrigin;
        uniform vec3 uWind;
        attribute float aLife;
        attribute float aMaxLife;
        attribute vec3 aVelocity;
        
        varying float vAlpha;
        
        void main() {
          // Loop life
          float t = mod(uTime + aLife, aMaxLife);
          float tNorm = t / aMaxLife;
          
          vec3 p = uOrigin;
          p += aVelocity * t;
          
          // Wind drift
          p += uWind * t * t * 0.2;
          
          vec4 mvPosition = modelViewMatrix * vec4(p, 1.0);
          gl_Position = projectionMatrix * mvPosition;
          
          // Grow size and fade alpha over life
          gl_PointSize = (40.0 + tNorm * 60.0) / -mvPosition.z;
          vAlpha = (1.0 - tNorm) * (tNorm > 0.05 ? 1.0 : tNorm * 20.0); // sharp fade in, slow fade out
        }
      `,
      fragmentShader: `
        varying float vAlpha;
        void main() {
          float dist = distance(gl_PointCoord, vec2(0.5));
          if (dist > 0.5) discard;
          
          // Soft edge
          float alpha = (0.5 - dist) * 2.0 * vAlpha * 0.3;
          gl_FragColor = vec4(vec3(0.6), alpha);
        }
      `,
      transparent: true,
      depthWrite: false
    });

    const points = new THREE.Points(geo, mat);
    this.scene.add(points);
    this.systems.push({
      update: (delta, time) => { mat.uniforms.uTime.value = time; }
    });
    return points;
  }

  // 3. Fountain spray
  createFountainSpray(origin, count = 100) {
    const geo = new THREE.BufferGeometry();
    const pos = new Float32Array(count * 3);
    const life = new Float32Array(count);
    const baseVel = new Float32Array(count * 3);

    for (let i = 0; i < count; i++) {
        life[i] = Math.random() * 1.5;
        
        // Arc velocities
        const angle = Math.random() * Math.PI * 2;
        const radius = Math.random() * 0.8 + 0.2;
        baseVel[i*3] = Math.cos(angle) * radius;
        baseVel[i*3+1] = 2.5 + Math.random(); // Upwards shoot
        baseVel[i*3+2] = Math.sin(angle) * radius;
    }

    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('aLife', new THREE.BufferAttribute(life, 1));
    geo.setAttribute('aVel', new THREE.BufferAttribute(baseVel, 3));

    const mat = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uOrigin: { value: origin },
        uGravity: { value: 5.0 }
      },
      vertexShader: `
        uniform float uTime;
        uniform vec3 uOrigin;
        uniform float uGravity;
        attribute float aLife;
        attribute vec3 aVel;
        
        varying float vAlpha;
        
        void main() {
          float t = mod(uTime + aLife, 1.5); // 1.5s loop
          float tNorm = t / 1.5;
          
          vec3 p = uOrigin;
          p.x += aVel.x * t;
          p.z += aVel.z * t;
          // Parabola: v*t - 0.5*g*t^2
          p.y += aVel.y * t - 0.5 * uGravity * t * t;
          
          vec4 mvPosition = modelViewMatrix * vec4(p, 1.0);
          gl_Position = projectionMatrix * mvPosition;
          
          gl_PointSize = 15.0 / -mvPosition.z;
          vAlpha = 1.0 - tNorm;
        }
      `,
      fragmentShader: `
        varying float vAlpha;
        void main() {
          float dist = distance(gl_PointCoord, vec2(0.5));
          if (dist > 0.5) discard;
          
          vec3 h2o = vec3(0.5, 0.8, 1.0);
          float alpha = (1.0 - (dist * 2.0)) * vAlpha * 0.6;
          gl_FragColor = vec4(h2o, alpha);
        }
      `,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    });

    const points = new THREE.Points(geo, mat);
    this.scene.add(points);
    this.systems.push({
      update: (delta, time) => { mat.uniforms.uTime.value = time; }
    });
    return points;
  }

  // 4. Cart Dust
  // Differs because the origin moves dynamically. We use a circular buffer pattern in JS.
  createCartDust(count = 60) {
    const geo = new THREE.BufferGeometry();
    const pos = new Float32Array(count * 3);
    const life = new Float32Array(count); // When particle was spawned
    
    // Initialize hidden
    for (let i = 0; i < count; i++) {
        pos[i*3+1] = -100; 
        life[i] = -999;
    }

    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('aSpawnTime', new THREE.BufferAttribute(life, 1));

    const mat = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 }
      },
      vertexShader: `
        uniform float uTime;
        attribute float aSpawnTime;
        
        varying float vAlpha;
        
        void main() {
          float age = uTime - aSpawnTime;
          
          vec3 p = position;
          // Drift up and expand
          if (age > 0.0 && age < 1.0) {
             p.y += age * 0.5;
             p.x += sin(age * 3.0 + p.z) * 0.2; // slight wind
          }
          
          vec4 mvPosition = modelViewMatrix * vec4(p, 1.0);
          gl_Position = projectionMatrix * mvPosition;
          
          float ageNorm = clamp(age, 0.0, 1.0);
          gl_PointSize = (10.0 + ageNorm * 40.0) / -mvPosition.z;
          vAlpha = age < 1.0 ? (1.0 - ageNorm) * 0.3 : 0.0;
        }
      `,
      fragmentShader: `
        varying float vAlpha;
        void main() {
          if (vAlpha <= 0.0) discard;
          
          float dist = distance(gl_PointCoord, vec2(0.5));
          if (dist > 0.5) discard;
          
          float alpha = (1.0 - (dist * 2.0)) * vAlpha;
          gl_FragColor = vec4(vec3(0.7, 0.6, 0.5), alpha); // Dirt color
        }
      `,
      transparent: true,
      depthWrite: false
    });

    const points = new THREE.Points(geo, mat);
    this.scene.add(points);
    
    let pointer = 0; // index of next particle to spawn
    const spawnRate = 0.05; // spawn every X seconds when moving
    let lastSpawn = 0;

    this.systems.push({
      update: (delta, time) => { 
          mat.uniforms.uTime.value = time;
      },
      // Triggered by cart update
      spawnDust: (origin, speed, time) => {
        if (speed < 0.02) return;
        
        if (time - lastSpawn > spawnRate) {
           // Spawn 2 particles
           for(let k=0; k<2; k++) {
             // Offset randomly
             const rx = (Math.random() - 0.5) * 1.5;
             const rz = (Math.random() - 0.5) * 1.5;
             
             pos[pointer * 3] = origin.x + rx;
             pos[pointer * 3 + 1] = origin.y + 0.1;
             pos[pointer * 3 + 2] = origin.z + rz;
             life[pointer] = time;
             
             pointer = (pointer + 1) % count;
           }
           
           geo.attributes.position.needsUpdate = true;
           geo.attributes.aSpawnTime.needsUpdate = true;
           lastSpawn = time;
        }
      }
    });
    
    return {
        mesh: points,
        sys: this.systems[this.systems.length - 1]
    };
  }

  // 5. Fire Pit Flames
  createCampfire(origin, count = 30) {
    const geo = new THREE.BufferGeometry();
    const pos = new Float32Array(count * 3);
    const life = new Float32Array(count);

    for (let i = 0; i < count; i++) {
        life[i] = Math.random();
        pos[i*3] = origin.x + (Math.random() - 0.5) * 0.4;
        pos[i*3+1] = origin.y;
        pos[i*3+2] = origin.z + (Math.random() - 0.5) * 0.4;
    }

    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('aLife', new THREE.BufferAttribute(life, 1));

    const mat = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 }
      },
      vertexShader: `
        uniform float uTime;
        attribute float aLife;
        varying float vLife;
        void main() {
          float t = mod(uTime * 1.5 + aLife, 1.0);
          vLife = t;
          
          vec3 p = position;
          p.y += t * 1.5;
          // Pinch inward at top
          p.x += sin(t * 3.14) * (0.0 - (p.x - position.x)) * 0.5;
          p.z += cos(t * 3.14) * (0.0 - (p.z - position.z)) * 0.5;
          
          vec4 mvPosition = modelViewMatrix * vec4(p, 1.0);
          gl_Position = projectionMatrix * mvPosition;
          
          // Shrink at top
          gl_PointSize = (30.0 * (1.0 - t)) / -mvPosition.z;
        }
      `,
      fragmentShader: `
        varying float vLife;
        void main() {
          float dist = distance(gl_PointCoord, vec2(0.5));
          if (dist > 0.5) discard;
          
          vec3 flameBright = vec3(1.0, 0.8, 0.2);
          vec3 flameDark = vec3(0.8, 0.2, 0.0);
          vec3 color = mix(flameBright, flameDark, vLife);
          
          float alpha = (1.0 - (dist * 2.0)) * (1.0 - vLife);
          gl_FragColor = vec4(color, alpha);
        }
      `,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    });

    const points = new THREE.Points(geo, mat);
    this.scene.add(points);
    this.systems.push({
      update: (delta, time) => { mat.uniforms.uTime.value = time; }
    });
    return points;
  }
}
