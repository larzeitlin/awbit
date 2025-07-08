const svg = document.getElementById('logo-svg');
// --- Color change state ---
let setSpheresAndTrailsColors = null; // Will be set by initThree

// --- Color cycling state ---
let colorCycleIndex = 0;
const colorSets = [
  // Set 1 (default)
  {
    left: 0x00bfff, right: 0xff6a00,
    leftTrail: 0x00bfff, rightTrail: 0xff6a00
  },
  // Set 2
  {
    left: 0xff00cc, right: 0x00ff99,
    leftTrail: 0xff00cc, rightTrail: 0x00ff99
  },
  // Set 3
  {
    left: 0xffe600, right: 0x0055ff,
    leftTrail: 0xffe600, rightTrail: 0x0055ff
  }
];

svg.addEventListener('mouseenter', () => {
  svg.classList.add('spin');
  colorCycleIndex = (colorCycleIndex + 1) % colorSets.length;
  if (setSpheresAndTrailsColors) {
    setSpheresAndTrailsColors(colorCycleIndex);
  }
});
svg.addEventListener('animationend', () => {
  svg.classList.remove('spin');
});
// No mouseleave handler

// Glide to top on click
const logoContainer = document.getElementById('logoContainer');
const bgHalfTop = document.getElementById('bgHalfTop');
const pageBody = document.getElementById('pageBody');
let atTop = false;
svg.addEventListener('click', () => {
  if (!atTop) {
    logoContainer.classList.add('logo-top');
    bgHalfTop.classList.add('shrink');
    pageBody.style.transform = 'translateY(0)';
    // Only start Three.js after transition ends
    pageBody.addEventListener('transitionend', function handler(e) {
      if (e.propertyName === 'transform') {
        initThree();
        // --- Fade logo opacity to 40% after glide ---
        logoContainer.style.transition = 'opacity 0.7s cubic-bezier(0.45,0,0.55,1)';
        logoContainer.style.opacity = '0.4';
        pageBody.removeEventListener('transitionend', handler);
      }
    });
    atTop = true;
  }
});

// --- Three.js setup ---
let renderer, scene, camera, line, animationId;

function resizeThreeCanvas() {
  const canvas = document.getElementById('three-canvas');
  if (!canvas) return;
  const width = window.innerWidth;
  const height = Math.max(0, window.innerHeight - 140);
  renderer && renderer.setSize(width, height, false);
  camera && (camera.aspect = width / height, camera.updateProjectionMatrix());
}

function initThree() {
  // Clean up previous renderer if any
  if (renderer) {
    renderer.dispose();
    renderer.forceContextLoss && renderer.forceContextLoss();
    renderer.domElement.parentNode && renderer.domElement.parentNode.removeChild(renderer.domElement);
    cancelAnimationFrame(animationId);
  }

  const canvas = document.getElementById('three-canvas');
  const width = window.innerWidth;
  const height = Math.max(0, window.innerHeight - 140);

  renderer = new THREE.WebGLRenderer({ 
    canvas, 
    antialias: true, 
    alpha: false, 
    powerPreference: 'high-performance', 
    preserveDrawingBuffer: false 
  });
  renderer.setPixelRatio(window.devicePixelRatio); // improve sharpness on HiDPI
  renderer.setSize(width, height, false);
  renderer.outputEncoding = THREE.sRGBEncoding;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;

  scene = new THREE.Scene();
  camera = new THREE.OrthographicCamera(-width/2, width/2, height/2, -height/2, 1, 10);
  camera.position.z = 5;

  // --- Add white outlined equilateral triangle star in the center ---
  // Store star triangle meshes for animation
  let starTriangles = [];
  let starBaseVertices, h, starSize;
  let starGroup = null;
  let starTriangleSpeeds = [];
  {
    // --- Star: 4 equilateral triangles, rotated 0, 90, 180, 270 degrees ---
    starSize = Math.min(width, height) * 0.60;
    h = starSize * Math.sqrt(3) / 2;
    starBaseVertices = [
      [0, 2*h/3, 0],
      [-starSize/2, -h/3, 0],
      [starSize/2, -h/3, 0],
      [0, 2*h/3, 0]
    ];
    function rotateVerts(verts, angleDeg) {
      const angle = angleDeg * Math.PI / 180;
      const cos = Math.cos(angle), sin = Math.sin(angle);
      return verts.map(([x, y, z]) => [
        x * cos - y * sin,
        x * sin + y * cos,
        z
      ]);
    }
    // Use a group for the star so we can rotate it
    starGroup = new THREE.Group();
    const starAngles = [0, 180, 90, 270];
    starTriangles = [];
    // Assign different rotation speeds (radians per frame) for each triangle
    starTriangleSpeeds = [0.5, -0.7, 1.1, -1.3];
    for (const a of starAngles) {
      const verts = rotateVerts(starBaseVertices, a).flat();
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(verts), 3));
      const material = new THREE.LineBasicMaterial({ color: 0xffffff, linewidth: 2, transparent: true, opacity: 0.2 });
      const triangle = new THREE.Line(geometry, material);
      // Each triangle gets its own Object3D wrapper for independent rotation
      const wrapper = new THREE.Object3D();
      wrapper.add(triangle);
      starGroup.add(wrapper);
      starTriangles.push(wrapper);
    }
    scene.add(starGroup);
  }

  // Spheres at ends of the "line"
  let baseLineLength = width * 0.2;
  let currentLineLength = baseLineLength;
  const sphereRadius = 14;
  const sphereGeometry = new THREE.SphereGeometry(sphereRadius, 32, 32);
  // Store sphere materials for color change
  const sphereMaterialLeft = new THREE.MeshBasicMaterial({ color: 0xffffff });
  const sphereMaterialRight = new THREE.MeshBasicMaterial({ color: 0xffffff });
  const sphereLeft = new THREE.Mesh(sphereGeometry, sphereMaterialLeft);
  const sphereRight = new THREE.Mesh(sphereGeometry, sphereMaterialRight);
  scene.add(sphereLeft);
  scene.add(sphereRight);

  // --- Add mirrored spheres ---
  const sphereLeftMirror = new THREE.Mesh(sphereGeometry, sphereMaterialLeft);
  const sphereRightMirror = new THREE.Mesh(sphereGeometry, sphereMaterialRight);
  scene.add(sphereLeftMirror);
  scene.add(sphereRightMirror);

  // --- Sphere mesh trails ---
  const TRAIL_LENGTH = 120;
  let leftTrailMaterials = [];
  let rightTrailMaterials = [];
  let leftTrailMaterialsMirror = [];
  let rightTrailMaterialsMirror = [];
  function createTrailMesh(color, matArray) {
    const spheres = [];
    for (let i = 0; i < TRAIL_LENGTH; i++) {
      const material = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.5 });
      matArray.push(material);
      const mesh = new THREE.Mesh(sphereGeometry, material);
      mesh.visible = false;
      mesh.userData.scale = 1;
      scene.add(mesh);
      spheres.push(mesh);
    }
    return spheres;
  }
  leftTrailMaterials = [];
  rightTrailMaterials = [];
  leftTrailMaterialsMirror = [];
  rightTrailMaterialsMirror = [];
  const leftTrailSpheres = createTrailMesh(0x00bfff, leftTrailMaterials);
  const rightTrailSpheres = createTrailMesh(0xff6a00, rightTrailMaterials);
  // Trails for mirrored spheres
  const leftTrailSpheresMirror = createTrailMesh(0x00bfff, leftTrailMaterialsMirror);
  const rightTrailSpheresMirror = createTrailMesh(0xff6a00, rightTrailMaterialsMirror);

  // --- Smooth color transition state ---
  let colorTransition = {
    index: 0,
    progress: 1,
    duration: 0.35, // seconds
    startTime: 0,
    from: {
      left: new THREE.Color(colorSets[0].left),
      right: new THREE.Color(colorSets[0].right),
      leftTrail: new THREE.Color(colorSets[0].leftTrail),
      rightTrail: new THREE.Color(colorSets[0].rightTrail)
    },
    to: {
      left: new THREE.Color(colorSets[0].left),
      right: new THREE.Color(colorSets[0].right),
      leftTrail: new THREE.Color(colorSets[0].leftTrail),
      rightTrail: new THREE.Color(colorSets[0].rightTrail)
    }
  };

  // Helper: get color set by index
  function getColorsForIndex(idx) {
    const set = colorSets[idx % colorSets.length];
    return {
      left: new THREE.Color(set.left),
      right: new THREE.Color(set.right),
      leftTrail: new THREE.Color(set.leftTrail),
      rightTrail: new THREE.Color(set.rightTrail)
    };
  }

  // --- Color changing function with smooth transition ---
  setSpheresAndTrailsColors = function(idx) {
    if (idx === colorTransition.index) return;
    colorTransition.index = idx;
    colorTransition.progress = 0;
    colorTransition.startTime = performance.now();
    // Capture current colors as start
    colorTransition.from.left.copy(sphereMaterialLeft.color);
    colorTransition.from.right.copy(sphereMaterialRight.color);
    colorTransition.from.leftTrail.copy(leftTrailMaterials[0].color);
    colorTransition.from.rightTrail.copy(rightTrailMaterials[0].color);
    // Set target colors
    const target = getColorsForIndex(idx);
    colorTransition.to.left.copy(target.left);
    colorTransition.to.right.copy(target.right);
    colorTransition.to.leftTrail.copy(target.leftTrail);
    colorTransition.to.rightTrail.copy(target.rightTrail);
  };

  // Mouse tracking for vertical position
  let mouseY = 0.5;
  let targetMouseY = 0.5;
  canvas.onmousemove = function(e) {
    const rect = canvas.getBoundingClientRect();
    targetMouseY = (e.clientY - rect.top) / rect.height;
  };

  // Animation loop
  let angle = 0;
  // Store trail positions for each sphere
  const leftTrailPositions = Array.from({length: TRAIL_LENGTH}, () => ({x:0, y:0, z:0}));
  const rightTrailPositions = Array.from({length: TRAIL_LENGTH}, () => ({x:0, y:0, z:0}));
  function animate() {
    // --- Star oscillation and rotation ---
    if (starTriangles && starTriangles.length && starGroup) {
      // Oscillate scale between 0.85 and 1.15
      const scale = 1 + 0.15 * Math.sin(angle * 1.2);
      starGroup.scale.set(scale, scale, 1);
      // Each triangle rotates at its own speed
      for (let i = 0; i < starTriangles.length; ++i) {
        starTriangles[i].rotation.z = angle * starTriangleSpeeds[i];
      }
    }
    // --- Smooth color transition update ---
    if (colorTransition.progress < 1) {
      const now = performance.now();
      const t = Math.min(1, (now - colorTransition.startTime) / (colorTransition.duration * 1000));
      colorTransition.progress = t;
      // Interpolate colors
      sphereMaterialLeft.color.lerpColors(colorTransition.from.left, colorTransition.to.left, t);
      sphereMaterialRight.color.lerpColors(colorTransition.from.right, colorTransition.to.right, t);
      for (let i = 0; i < leftTrailMaterials.length; i++) {
        leftTrailMaterials[i].color.lerpColors(colorTransition.from.leftTrail, colorTransition.to.leftTrail, t);
      }
      for (let i = 0; i < rightTrailMaterials.length; i++) {
        rightTrailMaterials[i].color.lerpColors(colorTransition.from.rightTrail, colorTransition.to.rightTrail, t);
      }
    }
    // Oscillate dot distance from 200% to 50% of base length
    const osc = 0.75 + 0.75 * Math.sin(angle * 0.7);
    currentLineLength = baseLineLength * (0.5 + osc);

    // Update sphere positions (no z-plane orbit)
    const leftPos = -currentLineLength / 2;
    const rightPos = currentLineLength / 2;
    mouseY += (targetMouseY - mouseY) * 0.12;
    const y = (0.5 - mouseY) * height;

    // Main rotation in XY plane only
    const cosA = Math.cos(angle), sinA = Math.sin(angle);

    // Compute new positions
    const leftX = leftPos * cosA;
    const leftY = leftPos * sinA + y * cosA;
    const rightX = rightPos * cosA;
    const rightY = rightPos * sinA + y * cosA;

    sphereLeft.position.x = leftX;
    sphereLeft.position.y = leftY;
    sphereLeft.position.z = 0;

    sphereRight.position.x = rightX;
    sphereRight.position.y = rightY;
    sphereRight.position.z = 0;

    // --- Set mirrored sphere positions (flip x) ---
    sphereLeftMirror.position.x = -leftX;
    sphereLeftMirror.position.y = leftY;
    sphereLeftMirror.position.z = 0;

    sphereRightMirror.position.x = -rightX;
    sphereRightMirror.position.y = rightY;
    sphereRightMirror.position.z = 0;

    // --- Update mesh trails ---
    function updateTrailMesh(trailPositions, trailSpheres, x, y) {
      // Increase trail spacing by 2x: skip every other update for trail positions
      for (let i = TRAIL_LENGTH - 1; i > 0; i--) {
        if (i > 1) {
          trailPositions[i].x = trailPositions[i-2].x;
          trailPositions[i].y = trailPositions[i-2].y;
          trailPositions[i].z = trailPositions[i-2].z;
          trailSpheres[i].userData.scale = trailSpheres[i-2].userData.scale * 1.05;
        } else {
          trailPositions[i].x = trailPositions[0].x;
          trailPositions[i].y = trailPositions[0].y;
          trailPositions[i].z = trailPositions[0].z;
          trailSpheres[i].userData.scale = trailSpheres[0].userData.scale * 1.05;
        }
      }
      // Set new head position and reset scale
      trailPositions[0].x = x;
      trailPositions[0].y = y;
      trailPositions[0].z = 0;
      trailSpheres[0].userData.scale = 1;

      // Update mesh positions, scale, and fade
      for (let i = 0; i < TRAIL_LENGTH; i++) {
        const mesh = trailSpheres[i];
        const pos = trailPositions[i];
        if (i === 0 || pos.x !== 0 || pos.y !== 0) {
          mesh.visible = true;
          mesh.position.set(pos.x, pos.y, pos.z);
          mesh.scale.setScalar(mesh.userData.scale);
          mesh.material.opacity = 0.5 * (1 - i / TRAIL_LENGTH);
        } else {
          mesh.visible = false;
        }
      }
    }
    // Update mesh trails for original spheres
    updateTrailMesh(leftTrailPositions, leftTrailSpheres, leftX, leftY);
    updateTrailMesh(rightTrailPositions, rightTrailSpheres, rightX, rightY);
    // Update mesh trails for mirrored spheres (flip x)
    updateTrailMesh(leftTrailPositions, leftTrailSpheresMirror, -leftX, leftY);
    updateTrailMesh(rightTrailPositions, rightTrailSpheresMirror, -rightX, rightY);

    angle += 0.015;
    renderer.render(scene, camera);
    animationId = requestAnimationFrame(animate);
  }

  animate();
  window.addEventListener('resize', () => {
    resizeThreeCanvas();
    // Update camera and base line length on resize
    const width = window.innerWidth;
    const height = Math.max(0, window.innerHeight - 140);
    camera.left = -width/2;
    camera.right = width/2;
    camera.top = height/2;
    camera.bottom = -height/2;
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    baseLineLength = width * 0.2;
  });
}
