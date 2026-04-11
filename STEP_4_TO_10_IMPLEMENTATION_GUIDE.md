# 3D Conversion Implementation Guide (Steps 4-10)

This guide provides the full code and logic required to complete Phase 5 of Ayush's Settlement: 3D Hero Scene.

## Step 4: Building the Village (Procedural Buildings)
Add this function after `createToriiGate()` to generate stylized 3D boxes representing the town buildings.

```javascript
function createBuildings() {
  const buildingGroup = new THREE.Group();
  const buildings = [
    { x: -15, z: -20, h: 8, w: 4, color: 0x8b4513 }, // The Forge
    { x: 15, z: -25, h: 10, w: 5, color: 0x2f4f4f }, // The Archives
    { x: -10, z: -40, h: 6, w: 6, color: 0x556b2f }, // The Farm
    { x: 12, z: -45, h: 12, w: 4, color: 0x483d8b }, // The Spire
    { x: 0, z: -60, h: 15, w: 8, color: 0xb22222 }   // The Central Hall
  ];

  buildings.forEach(data => {
    const geo = new THREE.BoxGeometry(data.w, data.h, data.w);
    const mat = new THREE.MeshStandardMaterial({ 
      color: data.color,
      roughness: 0.7,
      metalness: 0.2
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(data.x, data.h / 2, data.z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    buildingGroup.add(mesh);
    
    // Simple roof
    const roofGeo = new THREE.ConeGeometry(data.w * 0.8, 4, 4);
    const roofMat = new THREE.MeshStandardMaterial({ color: 0x333333 });
    const roof = new THREE.Mesh(roofGeo, roofMat);
    roof.position.set(data.x, data.h + 2, data.z);
    roof.rotation.y = Math.PI / 4;
    buildingGroup.add(roof);
  });

  scene.add(buildingGroup);
}
createBuildings();
```

## Step 5: Advanced Lighting & Shadows
Update your lighting section to enable shadow mapping.

```javascript
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const dirLight = new THREE.DirectionalLight(0xffffff, 1.2);
dirLight.position.set(10, 20, 10);
dirLight.castShadow = true;
dirLight.shadow.mapSize.width = 2048;
dirLight.shadow.mapSize.height = 2048;
scene.add(dirLight);

const ambient = new THREE.AmbientLight(0xffffff, 0.4);
scene.add(ambient);
```

## Step 6: GSAP Fly-Through Animation
Add GSAP to your project and use this to animate the camera on page load.

```javascript
// Add to <head>: <script src="https://cdnjs.cloudflare.com/ajax/libs/gsap/3.12.2/gsap.min.js"></script>

function introAnimation() {
  gsap.from(camera.position, {
    z: 50,
    y: 20,
    duration: 3,
    ease: "power2.inOut",
    onUpdate: () => camera.lookAt(0, 5, -20)
  });
}
introAnimation();
```

## Step 7: Raycaster Interaction (Clickable 3D Projects)
Map 3D buildings to your existing project data.

```javascript
const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();

window.addEventListener('click', (event) => {
  mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
  mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;

  raycaster.setFromCamera(mouse, camera);
  const intersects = raycaster.intersectObjects(scene.children, true);

  if (intersects.length > 0) {
    const object = intersects[0].object;
    console.log("Clicked building:", object);
    // Logic to trigger modal/scroll to project
  }
});
```

## Step 8: Scroll-Linked Camera
Bind the scroll position to camera depth.

```javascript
window.addEventListener('scroll', () => {
  const scrollPercent = window.scrollY / (document.body.scrollHeight - window.innerHeight);
  camera.position.z = 15 - (scrollPercent * 50);
  camera.position.y = 5 + (scrollPercent * 10);
  camera.lookAt(0, 5, -20);
});
```

## Step 9: Day/Night Cycle Sync
Sync the 3D scene colors with your CSS theme toggle.

```javascript
function syncTheme() {
  const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
  const targetColor = isDark ? 0x0a0a2a : 0x87ceeb;
  
  gsap.to(scene.background, {
    r: ((targetColor >> 16) & 255) / 255,
    g: ((targetColor >> 8) & 255) / 255,
    b: (targetColor & 255) / 255,
    duration: 1
  });
}
```

## Step 10: Mobile Performance Pass
Disable 3D on low-end devices or use a simplified scene.

```javascript
if (window.innerWidth < 768) {
  renderer.setPixelRatio(1); // Lower resolution
  scene.remove(stars); // Remove heavy particles
}
```
