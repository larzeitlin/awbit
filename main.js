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
        // --- Show gallery view after glide ---
        createGalleryView();
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

// --- Add gallery view overlay at bottom ---
function createGalleryView() {
  // Only add once
  if (document.getElementById('gallery-view')) return;

  const gallery = document.createElement('div');
  gallery.id = 'gallery-view';
  // Style the gallery overlay
  Object.assign(gallery.style, {
    position: 'fixed',
    left: '0',
    right: '0',
    bottom: '0',
    zIndex: '100',
    display: 'flex',
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: '24px',
    height: '30vh', // 30% of viewport height
    minHeight: '180px',
    padding: '0',
    background: 'rgba(30,30,40,0.18)',
    backdropFilter: 'blur(16px)',
    borderTop: '1.5px solid rgba(255,255,255,0.7)',
    boxShadow: '0 -2px 16px 0 rgba(0,0,0,0.08)',
    pointerEvents: 'auto',
    opacity: '0',
    transform: 'translateY(100%)',
    transition: 'opacity 0.6s cubic-bezier(0.45,0,0.55,1), transform 0.6s cubic-bezier(0.45,0,0.55,1)'
  });

  // Inject gallery cell hover styles if not already present
  if (!document.getElementById('gallery-cell-hover-style')) {
    const style = document.createElement('style');
    style.id = 'gallery-cell-hover-style';
    style.textContent = `
      .gallery-cell {
        transition: transform 0.18s cubic-bezier(0.45,0,0.55,1), box-shadow 0.18s cubic-bezier(0.45,0,0.55,1), border-color 0.2s;
      }
      .gallery-cell:hover {
        transform: scale(1.11);
        box-shadow: 0 0 24px 0 rgba(0,191,255,0.18), 0 0 48px 0 rgba(255,255,255,0.12);
        z-index: 2;
        border-color: #fff;
      }
    `;
    document.head.appendChild(style);
  }
  // Add gallery cells (e.g. 6 cells)
  const cellCount = 6;
  const placeholderImages = [
    'https://placehold.co/96x96/00bfff/ffffff?text=1',
    'https://placehold.co/96x96/ff6a00/ffffff?text=2',
    'https://placehold.co/96x96/ff00cc/ffffff?text=3',
    'https://placehold.co/96x96/00ff99/ffffff?text=4',
    'https://placehold.co/96x96/ffe600/000000?text=5',
    'https://placehold.co/96x96/0055ff/ffffff?text=6'
  ];
  for (let i = 0; i < cellCount; i++) {
    const cell = document.createElement('div');
    cell.className = 'gallery-cell';
    Object.assign(cell.style, {
      width: '96px',
      height: '96px',
      border: '2px solid rgba(255,255,255,0.75)', // 75% opacity
      borderRadius: '12px',
      background: 'rgba(255,255,255,0.08)',
      boxSizing: 'border-box',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      backdropFilter: 'blur(8px)'
      // transition is now handled by CSS class
    });
    // Add placeholder image
    const img = document.createElement('img');
    img.src = placeholderImages[i % placeholderImages.length];
    img.alt = `Placeholder ${i+1}`;
    img.style.width = '80px';
    img.style.height = '80px';
    img.style.borderRadius = '8px';
    img.style.objectFit = 'cover';
    cell.appendChild(img);
    gallery.appendChild(cell);

    // --- Expanded view on click ---
    cell.addEventListener('click', function(e) {
      e.stopPropagation();
      // Remove any existing expanded image
      const oldExpanded = document.getElementById('gallery-expanded-image');
      if (oldExpanded) oldExpanded.remove();
      // Function to create or update expanded view responsively
      function createOrUpdateExpanded() {
        // Remove if already present (for update)
        const prev = document.getElementById('gallery-expanded-image');
        if (prev) prev.remove();
        // Calculate available height: from below logo to above gallery
        const logo = document.getElementById('logoContainer');
        const gallery = document.getElementById('gallery-view');
        let top = 0;
        let bottom = 0;
        if (logo) {
          const logoRect = logo.getBoundingClientRect();
          top = logoRect.bottom;
        }
        if (gallery) {
          const galleryRect = gallery.getBoundingClientRect();
          bottom = window.innerHeight - galleryRect.top;
        }
        const availableHeight = Math.max(0, window.innerHeight - top - bottom);
        // Create expanded image container (full width, transparent, blur, gap)
        const expandedContainer = document.createElement('div');
        expandedContainer.id = 'gallery-expanded-image';
        Object.assign(expandedContainer.style, {
          position: 'fixed',
          left: 0,
          right: 0,
          top: `${top}px`,
          height: `${availableHeight}px`,
          zIndex: 1001,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          pointerEvents: 'auto',
          background: 'rgba(30,30,40,0.18)',
          backdropFilter: 'blur(16px)',
          border: 'none',
          boxShadow: 'none',
          animation: 'fadeInOverlay 0.18s cubic-bezier(0.45,0,0.55,1)'
        });
        // Expanded image
        const expandedImg = document.createElement('img');
        expandedImg.src = img.src;
        expandedImg.alt = img.alt;
        expandedImg.style.maxWidth = 'min(80vw, 480px)';
        expandedImg.style.maxHeight = '90%';
        expandedImg.style.borderRadius = '18px';
        expandedImg.style.boxShadow = '0 8px 48px 0 rgba(0,191,255,0.18), 0 0 0 8px rgba(255,255,255,0.10)';
        expandedImg.style.background = '#fff';
        expandedImg.style.objectFit = 'contain';
        expandedImg.style.transition = 'transform 0.18s cubic-bezier(0.45,0,0.55,1)';
        expandedImg.style.transform = 'scale(1.04)';
        expandedContainer.appendChild(expandedImg);
        // --- Add fullscreen and close buttons ---
        const buttonBar = document.createElement('div');
        buttonBar.style.position = 'absolute';
        buttonBar.style.top = '18px';
        buttonBar.style.right = '32px';
        buttonBar.style.display = 'flex';
        buttonBar.style.gap = '12px';
        buttonBar.style.zIndex = '2';
        // Fullscreen button
        const fullscreenBtn = document.createElement('button');
        fullscreenBtn.innerHTML = '⛶';
        fullscreenBtn.title = 'Fullscreen';
        fullscreenBtn.style.fontSize = '22px';
        fullscreenBtn.style.background = 'rgba(255,255,255,0.7)';
        fullscreenBtn.style.border = 'none';
        fullscreenBtn.style.borderRadius = '6px';
        fullscreenBtn.style.padding = '6px 12px';
        fullscreenBtn.style.cursor = 'pointer';
        fullscreenBtn.style.boxShadow = '0 2px 8px 0 rgba(0,0,0,0.10)';
        fullscreenBtn.style.transition = 'background 0.15s';
        fullscreenBtn.addEventListener('mouseenter',()=>fullscreenBtn.style.background='rgba(255,255,255,1)');
        fullscreenBtn.addEventListener('mouseleave',()=>fullscreenBtn.style.background='rgba(255,255,255,0.7)');
        // Close button
        const closeBtn = document.createElement('button');
        closeBtn.innerHTML = '✕';
        closeBtn.title = 'Close';
        closeBtn.style.fontSize = '22px';
        closeBtn.style.background = 'rgba(255,255,255,0.7)';
        closeBtn.style.border = 'none';
        closeBtn.style.borderRadius = '6px';
        closeBtn.style.padding = '6px 12px';
        closeBtn.style.cursor = 'pointer';
        closeBtn.style.boxShadow = '0 2px 8px 0 rgba(0,0,0,0.10)';
        closeBtn.style.transition = 'background 0.15s';
        closeBtn.addEventListener('mouseenter',()=>closeBtn.style.background='rgba(255,255,255,1)');
        closeBtn.addEventListener('mouseleave',()=>closeBtn.style.background='rgba(255,255,255,0.7)');
        // Button actions
        let isFullscreen = false;
        fullscreenBtn.addEventListener('click', (ev) => {
          ev.stopPropagation();
          isFullscreen = !isFullscreen;
          if (isFullscreen) {
            // Hide logo and gallery, expand container
            if (logo) logo.style.display = 'none';
            if (gallery) {
              gallery.style.display = 'none';
              // Remove transforms and opacity to restore layout after fullscreen
              gallery.style.transform = '';
              gallery.style.opacity = '';
            }
            expandedContainer.style.top = '0';
            expandedContainer.style.height = '100vh';
            expandedContainer.style.background = 'rgba(30,30,40,0.28)';
            expandedImg.style.maxWidth = 'min(96vw, 900px)';
            expandedImg.style.maxHeight = '96vh';
            fullscreenBtn.title = 'Exit Fullscreen';
            fullscreenBtn.innerHTML = '⎚'; // Use a universally available icon for exit fullscreen
          } else {
            // Restore logo and gallery, restore container
            if (logo) logo.style.display = '';
            if (gallery) {
              gallery.style.display = 'flex'; // Explicitly restore flex layout
              // Force reflow to trigger transition
              void gallery.offsetWidth;
              gallery.style.transform = 'translateY(0)';
              gallery.style.opacity = '1';
            }
            // Recalculate top/height in case of resize
            const logoRect = logo ? logo.getBoundingClientRect() : {bottom:0};
            const galleryRect = gallery ? gallery.getBoundingClientRect() : {top:window.innerHeight};
            const newTop = logoRect.bottom;
            const newBottom = window.innerHeight - galleryRect.top;
            const newAvailableHeight = Math.max(0, window.innerHeight - newTop - newBottom);
            expandedContainer.style.top = `${newTop}px`;
            expandedContainer.style.height = `${newAvailableHeight}px`;
            expandedContainer.style.background = 'rgba(30,30,40,0.18)';
            expandedImg.style.maxWidth = 'min(80vw, 480px)';
            expandedImg.style.maxHeight = '90%';
            fullscreenBtn.title = 'Fullscreen';
            fullscreenBtn.innerHTML = '⛶';
          }
        });
        closeBtn.addEventListener('click', (ev) => {
          ev.stopPropagation();
          // Always restore logo and gallery on close
          if (logo) logo.style.display = '';
          if (gallery) {
            gallery.style.display = 'flex'; // Explicitly restore flex layout
            void gallery.offsetWidth;
            gallery.style.transform = 'translateY(0)';
            gallery.style.opacity = '1';
          }
          expandedContainer.remove();
          window.removeEventListener('keydown', escHandler);
          window.removeEventListener('resize', createOrUpdateExpanded);
        });
        buttonBar.appendChild(fullscreenBtn);
        buttonBar.appendChild(closeBtn);
        expandedContainer.appendChild(buttonBar);
        // Close on click outside image
        function closeExpanded(ev) {
          if (ev.target === expandedContainer) {
            if (logo) logo.style.display = '';
            if (gallery) {
              gallery.style.display = 'flex'; // Explicitly restore flex layout
              void gallery.offsetWidth;
              gallery.style.transform = 'translateY(0)';
              gallery.style.opacity = '1';
            }
            expandedContainer.remove();
            window.removeEventListener('keydown', escHandler);
            window.removeEventListener('resize', createOrUpdateExpanded);
          }
        }
        expandedContainer.addEventListener('click', closeExpanded);
        // Close on Escape
        function escHandler(ev) {
          if (ev.key === 'Escape') {
            if (logo) logo.style.display = '';
            if (gallery) {
              gallery.style.display = 'flex'; // Explicitly restore flex layout
              void gallery.offsetWidth;
              gallery.style.transform = 'translateY(0)';
              gallery.style.opacity = '1';
            }
            expandedContainer.remove();
            window.removeEventListener('keydown', escHandler);
            window.removeEventListener('resize', createOrUpdateExpanded);
          }
        }
        window.addEventListener('keydown', escHandler);
        // Remove and recreate on resize for responsiveness
        window.addEventListener('resize', createOrUpdateExpanded);
        document.body.appendChild(expandedContainer);
      }
      createOrUpdateExpanded();
    });
  }

  document.body.appendChild(gallery);

  // Trigger glide-in after a short delay to ensure transition
  setTimeout(() => {
    gallery.style.opacity = '1';
    gallery.style.transform = 'translateY(0)';
  }, 10);
}
