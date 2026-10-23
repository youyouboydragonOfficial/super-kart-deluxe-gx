// SUPER KART DELUXE GX - Full 3D Mario Kart Engine + Original Gimmicks (Ver 2.0)
// Built with Three.js (reliable Node require) + Advanced 3D Vehicle Dynamics & Item Physics

const THREE = window.THREE || require('three');

const ipcRenderer = (() => {
  try {
    return require('electron').ipcRenderer;
  } catch (e) {
    return null;
  }
})();

class KartGameEngine {
  constructor() {
    this.canvas = document.getElementById('game-canvas');
    this.minimapCanvas = document.getElementById('minimap-canvas');
    this.minimapCtx = this.minimapCanvas.getContext('2d');

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(64, window.innerWidth / window.innerHeight, 0.5, 3500);
    this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true, powerPreference: 'high-performance' });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

    // High-End Photorealistic Tone Mapping & Soft Shadows
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.18;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    // Camera smoothing
    this.cameraHeading = 0;

    // State
    this.state = 'DEMO'; // DEMO, COUNTDOWN, RACING, PAUSED, FINISHED
    this.selectedMode = 'gp'; // gp, mayhem, tt
    this.selectedDriverIdx = 0;
    this.selectedKartIdx = 0;
    this.selectedCourseIdx = 0;
    this.ccClass = 150;
    this.franticItems = false;
    this.extraGimmicks = true;
    this.totalLaps = 3;

    // Track geometry & objects
    this.trackCurve = null;
    this.trackSamples = [];
    this.trackWidth = 32;
    this.worldGroup = new THREE.Group();
    this.scene.add(this.worldGroup);

    // Dynamic Entities
    this.racers = [];
    this.player = null;
    this.itemBoxes = [];
    this.coinPickups = [];
    this.droppedCoins = []; // Coins dropped upon impact
    this.projectiles = []; // Shells, Bananas, Bob-ombs, BlackHoles
    this.gimmicks = []; // BoostPads, Ramps, Thwomps, Firebars, SpinBoosters, WarpPortals
    this.particles = [];

    // Timing & Frames
    this.clock = new THREE.Clock();
    this.raceTime = 0;
    this.countdownTimer = 0;
    this.countdownStep = 3;
    this.demoAngle = 0;
    this.frameCount = 0;

    // Input state
    this.keys = {};
    this.spacePressedDuration = 0;
    this.setupInputs();
    this.setupResize();

    // Textures cache
    this.emblemTextures = {};

    // Build initial course for 3D Title Demo background
    this.loadCourse(0, true);
    this.spawnRacers(true);

    this.animate = this.animate.bind(this);
    requestAnimationFrame(this.animate);
  }

  setupInputs() {
    window.addEventListener('keydown', (e) => {
      const code = e.code;
      const wasDown = this.keys[code];
      this.keys[code] = true;

      if (code === 'F11') {
        e.preventDefault();
        if (ipcRenderer) ipcRenderer.send('toggle-fullscreen');
      }
      if (code === 'KeyM') {
        window.soundEngine.muted = !window.soundEngine.muted;
        this.showTicker(window.soundEngine.muted ? '🔇 サウンド OFF' : '🔊 サウンド ON');
      }
      if (code === 'Escape' && (this.state === 'RACING' || this.state === 'PAUSED')) {
        window.uiFlow.togglePause();
      }
      if (code === 'Enter') {
        if (document.getElementById('screen-boot').classList.contains('active')) {
          window.uiFlow.skipBoot();
        } else if (document.getElementById('screen-title').classList.contains('active')) {
          window.uiFlow.openMainMenu();
        }
      }

      if (this.state === 'RACING' && this.player) {
        // Fast-decide item roulette if spinning (Mario Kart 8DX Authentic feature)
        if (code === 'Space' || code === 'KeyZ') {
          e.preventDefault();
          if (this.player.rouletteTimer1 > 0.2) {
            this.player.rouletteTimer1 = 0.05;
          } else if (this.player.rouletteTimer2 > 0.2) {
            this.player.rouletteTimer2 = 0.05;
          }

          // Jump Action (Trick) if in midair over ramp/hop!
          if (this.player.velY > 6 && !this.player.trickPerformed && this.player.pos.y > 0.8) {
            this.triggerJumpAction(this.player);
          } else if (!wasDown) {
            // Check if player can hold item behind (drag item guard)
            const item = this.player.itemSlot1;
            if (item && ['BANANA', 'TRIPLE_BANANA', 'GREEN_SHELL', 'TRIPLE_GREEN', 'RED_SHELL', 'TRIPLE_RED', 'BOB_OMB'].includes(item.id)) {
              this.player.isHoldingItem = true;
              this.updateHeldItemVisual(this.player);
              this.updateItemHUD();
            } else if (item && !this.player.isHoldingItem) {
              // Instant use items (Mushroom, Star, Lightning, etc.)
              this.useRacerItem(this.player, 1);
            }
          }
        }

        // Jump action via Drift/Hop key in mid-air
        if ((code === 'ShiftLeft' || code === 'ShiftRight' || code === 'ControlLeft' || code === 'KeyK') && !wasDown) {
          if (this.player.velY > 6 && !this.player.trickPerformed && this.player.pos.y > 0.8) {
            this.triggerJumpAction(this.player);
          }
        }

        // Backward throw/place dedicated key (X)
        if (code === 'KeyX' && !wasDown) {
          this.useRacerItem(this.player, -1);
        }

        // Original Overdrive Special Activation
        if (code === 'KeyE' && !wasDown) {
          this.activateOverdrive(this.player);
        }
      }
    });

    window.addEventListener('keyup', (e) => {
      const code = e.code;
      this.keys[code] = false;

      // When releasing Space/Z, if player was holding an item behind (guard), throw it!
      if ((code === 'Space' || code === 'KeyZ') && this.state === 'RACING' && this.player) {
        if (this.player.isHoldingItem) {
          const throwBackward = this.keys['ArrowDown'] || this.keys['KeyS'];
          this.useRacerItem(this.player, throwBackward ? -1 : 1);
          this.player.isHoldingItem = false;
          this.updateHeldItemVisual(this.player);
          this.updateItemHUD();
        }
      }
    });
  }

  setupResize() {
    window.addEventListener('resize', () => {
      this.camera.aspect = window.innerWidth / window.innerHeight;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(window.innerWidth, window.innerHeight);
    });
  }

  showTicker(msg) {
    const el = document.getElementById('event-ticker');
    if (!el) return;
    el.textContent = msg;
    clearTimeout(this.tickerTimeout);
    this.tickerTimeout = setTimeout(() => {
      if (el.textContent === msg) el.textContent = '';
    }, 2800);
  }

  // ==================== PROCEDURAL TEXTURE HELPERS ====================
  getEmblemTexture(initial, colorHex) {
    const key = `${initial}_${colorHex}`;
    if (this.emblemTextures[key]) return this.emblemTextures[key];

    const c = document.createElement('canvas');
    c.width = 128;
    c.height = 128;
    const ctx = c.getContext('2d');

    // Outer circle with metallic border
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(64, 64, 58, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = '#111111';
    ctx.lineWidth = 6;
    ctx.stroke();

    // Inner letter
    ctx.fillStyle = `#${colorHex.toString(16).padStart(6, '0')}`;
    ctx.font = 'bold 80px "Arial Black", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(initial, 64, 66);

    const tex = new THREE.CanvasTexture(c);
    this.emblemTextures[key] = tex;
    return tex;
  }

  createCheckerTexture(color1 = '#ffffff', color2 = '#111111', repeatX = 2, repeatY = 2) {
    const c = document.createElement('canvas');
    c.width = 128;
    c.height = 128;
    const ctx = c.getContext('2d');
    for (let y = 0; y < 4; y++) {
      for (let x = 0; x < 4; x++) {
        ctx.fillStyle = (x + y) % 2 === 0 ? color1 : color2;
        ctx.fillRect(x * 32, y * 32, 32, 32);
      }
    }
    const tex = new THREE.CanvasTexture(c);
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(repeatX, repeatY);
    return tex;
  }

  createBoostPadTexture() {
    const c = document.createElement('canvas');
    c.width = 128;
    c.height = 128;
    const ctx = c.getContext('2d');
    const grad = ctx.createLinearGradient(0, 0, 0, 128);
    grad.addColorStop(0, '#ff0055');
    grad.addColorStop(0.5, '#ffcc00');
    grad.addColorStop(1, '#00f2ff');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 128, 128);
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.moveTo(64, 14);
    ctx.lineTo(110, 62);
    ctx.lineTo(82, 62);
    ctx.lineTo(110, 110);
    ctx.lineTo(18, 110);
    ctx.lineTo(46, 62);
    ctx.lineTo(18, 62);
    ctx.closePath();
    ctx.fill();
    return new THREE.CanvasTexture(c);
  }

  createItemBoxTexture() {
    const c = document.createElement('canvas');
    c.width = 128;
    c.height = 128;
    const ctx = c.getContext('2d');

    // Translucent rainbow border
    const grad = ctx.createLinearGradient(0, 0, 128, 128);
    grad.addColorStop(0, 'rgba(255, 0, 128, 0.85)');
    grad.addColorStop(0.5, 'rgba(255, 230, 0, 0.85)');
    grad.addColorStop(1, 'rgba(0, 240, 255, 0.85)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 128, 128);

    ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
    ctx.font = 'bold 88px "Arial Black", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('?', 64, 66);

    const tex = new THREE.CanvasTexture(c);
    return tex;
  }

  // ==================== BUILD 3D COURSE & GIMMICKS ====================
  loadCourse(courseIdx, isDemo = false) {
    this.selectedCourseIdx = courseIdx;
    const course = window.GAME_DATA.courses[courseIdx];
    this.trackWidth = course.trackWidth;

    while (this.worldGroup.children.length > 0) {
      this.worldGroup.remove(this.worldGroup.children[0]);
    }
    this.itemBoxes = [];
    this.coinPickups = [];
    this.droppedCoins = [];
    this.projectiles = [];
    this.gimmicks = [];
    this.particles = [];

    // Sky & Atmospheric Depth Fog
    this.scene.background = new THREE.Color(course.skyTop);
    this.scene.fog = new THREE.FogExp2(course.skyBottom, 0.00075);

    // Realistic Multi-Layer Lighting
    const hemiLight = new THREE.HemisphereLight(course.skyTop, course.groundColor, 0.85);
    this.worldGroup.add(hemiLight);

    const sun = new THREE.DirectionalLight(0xfff6e5, 1.45);
    sun.position.set(220, 380, 200);
    sun.castShadow = true;
    sun.shadow.mapSize.width = 2048;
    sun.shadow.mapSize.height = 2048;
    sun.shadow.camera.near = 10;
    sun.shadow.camera.far = 1200;
    const shadowD = 350;
    sun.shadow.camera.left = -shadowD;
    sun.shadow.camera.right = shadowD;
    sun.shadow.camera.top = shadowD;
    sun.shadow.camera.bottom = -shadowD;
    sun.shadow.bias = -0.0004;
    this.worldGroup.add(sun);

    // Ground Plane (Off-road terrain with realistic textures)
    const groundGeo = new THREE.PlaneGeometry(4000, 4000);
    const groundMat = new THREE.MeshStandardMaterial({
      color: course.groundColor,
      roughness: 0.92,
      metalness: 0.05
    });
    const ground = new THREE.Mesh(groundGeo, groundMat);
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.6;
    ground.receiveShadow = true;
    this.worldGroup.add(ground);

    // Closed CatmullRom spline
    const pts = course.waypoints.map(([x, z]) => new THREE.Vector3(x, 0, z));
    this.trackCurve = new THREE.CatmullRomCurve3(pts, true, 'centripetal', 0.5);

    const sampleCount = 420;
    this.trackSamples = [];
    for (let i = 0; i < sampleCount; i++) {
      const t = i / sampleCount;
      const point = this.trackCurve.getPointAt(t);
      const tangent = this.trackCurve.getTangentAt(t).normalize();
      const normal = new THREE.Vector3(-tangent.z, 0, tangent.x).normalize();
      this.trackSamples.push({ t, point, tangent, normal });
    }

    this.buildTrackRoadAndWalls(course);
    this.buildStartGate(course);
    this.buildItemBoxesAndCoins(course);
    this.buildCourseGimmicks(course);
    this.buildSceneryDecorations(course);
  }

  buildTrackRoadAndWalls(course) {
    const N = this.trackSamples.length;
    const roadPositions = [];
    const roadColors = [];
    const roadIndices = [];
    const halfW = this.trackWidth;

    const baseRoadColor = new THREE.Color(course.roadColor);
    const rainbowMode = course.id === 'rainbow_cyber';

    for (let i = 0; i <= N; i++) {
      const sample = this.trackSamples[i % N];
      const left = sample.point.clone().addScaledVector(sample.normal, -halfW);
      const right = sample.point.clone().addScaledVector(sample.normal, halfW);

      roadPositions.push(left.x, 0.08, left.z, right.x, 0.08, right.z);

      const c = rainbowMode
        ? new THREE.Color().setHSL(((i / N) * 4) % 1, 0.92, 0.52)
        : baseRoadColor.clone().offsetHSL(0, 0, i % 2 === 0 ? 0.025 : -0.025);
      roadColors.push(c.r, c.g, c.b, c.r, c.g, c.b);

      if (i < N) {
        const a = i * 2;
        const b = i * 2 + 1;
        const cIdx = (i + 1) * 2;
        const d = (i + 1) * 2 + 1;
        roadIndices.push(a, cIdx, b, b, cIdx, d);
      }
    }

    const roadGeo = new THREE.BufferGeometry();
    roadGeo.setAttribute('position', new THREE.Float32BufferAttribute(roadPositions, 3));
    roadGeo.setAttribute('color', new THREE.Float32BufferAttribute(roadColors, 3));
    roadGeo.setIndex(roadIndices);
    roadGeo.computeVertexNormals();

    const roadMat = new THREE.MeshStandardMaterial({
      vertexColors: true,
      side: THREE.DoubleSide,
      roughness: 0.62,
      metalness: 0.15
    });
    const roadMesh = new THREE.Mesh(roadGeo, roadMat);
    roadMesh.receiveShadow = true;
    this.worldGroup.add(roadMesh);

    // 1. Realistic Striped Curbs (Zebra Rumble Strips) along left and right edges
    const curbGeo = new THREE.BoxGeometry(2.4, 0.32, 7.5);
    const curbMatRed = new THREE.MeshStandardMaterial({ color: 0xee2222, roughness: 0.5 });
    const curbMatWhite = new THREE.MeshStandardMaterial({ color: 0xf5f5f5, roughness: 0.5 });

    // 2. Heavy-Duty Metallic Crash Barriers (Guardrails) with Warning Stripes
    const railPostGeo = new THREE.CylinderGeometry(0.35, 0.4, 3.8, 8);
    const railPostMat = new THREE.MeshStandardMaterial({ color: 0x888888, metalness: 0.85, roughness: 0.25 });
    const railBeamGeo = new THREE.BoxGeometry(0.4, 1.35, 8.2);
    const railBeamMat = new THREE.MeshStandardMaterial({
      color: course.wallColorA,
      metalness: 0.6,
      roughness: 0.35
    });

    for (let i = 0; i < N; i += 2) {
      const s = this.trackSamples[i];
      const angle = Math.atan2(s.tangent.x, s.tangent.z);
      const isRed = (i / 2) % 2 === 0;

      // Curbs on edge of tarmac
      const leftCurbPos = s.point.clone().addScaledVector(s.normal, -halfW + 1.1);
      const leftCurb = new THREE.Mesh(curbGeo, isRed ? curbMatRed : curbMatWhite);
      leftCurb.position.set(leftCurbPos.x, 0.2, leftCurbPos.z);
      leftCurb.rotation.y = angle;
      leftCurb.receiveShadow = true;
      this.worldGroup.add(leftCurb);

      const rightCurbPos = s.point.clone().addScaledVector(s.normal, halfW - 1.1);
      const rightCurb = new THREE.Mesh(curbGeo, isRed ? curbMatRed : curbMatWhite);
      rightCurb.position.set(rightCurbPos.x, 0.2, rightCurbPos.z);
      rightCurb.rotation.y = angle;
      rightCurb.receiveShadow = true;
      this.worldGroup.add(rightCurb);

      // Guardrails just outside the track
      [-1, 1].forEach((side) => {
        const wallOffset = side * (halfW + 1.8);
        const wallPos = s.point.clone().addScaledVector(s.normal, wallOffset);

        // Guardrail Beam
        const beam = new THREE.Mesh(railBeamGeo, railBeamMat);
        beam.position.set(wallPos.x, 1.8, wallPos.z);
        beam.rotation.y = angle;
        beam.castShadow = true;
        beam.receiveShadow = true;
        this.worldGroup.add(beam);

        // Post
        const post = new THREE.Mesh(railPostGeo, railPostMat);
        post.position.set(wallPos.x, 1.8, wallPos.z);
        post.castShadow = true;
        this.worldGroup.add(post);
      });
    }
  }

  buildStartGate(course) {
    const s0 = this.trackSamples[0];
    const angle = Math.atan2(s0.tangent.x, s0.tangent.z);
    const gateGroup = new THREE.Group();
    gateGroup.position.copy(s0.point);
    gateGroup.rotation.y = angle;

    const lineGeo = new THREE.PlaneGeometry(this.trackWidth * 2, 6.5);
    const lineMat = new THREE.MeshBasicMaterial({
      map: this.createCheckerTexture('#ffffff', '#111111', 8, 2),
      side: THREE.DoubleSide
    });
    const lineMesh = new THREE.Mesh(lineGeo, lineMat);
    lineMesh.rotation.x = -Math.PI / 2;
    lineMesh.position.y = 0.12;
    gateGroup.add(lineMesh);

    const pillarGeo = new THREE.CylinderGeometry(1.6, 1.8, 20, 12);
    const pillarMat = new THREE.MeshLambertMaterial({ color: 0xe60012 });
    const leftP = new THREE.Mesh(pillarGeo, pillarMat);
    leftP.position.set(-this.trackWidth + 1, 10, 0);
    const rightP = new THREE.Mesh(pillarGeo, pillarMat);
    rightP.position.set(this.trackWidth - 1, 10, 0);
    gateGroup.add(leftP, rightP);

    const bannerGeo = new THREE.BoxGeometry(this.trackWidth * 2 + 3, 5.0, 2.5);
    const bannerMat = new THREE.MeshLambertMaterial({
      map: this.createCheckerTexture('#ffe600', '#e60012', 6, 1)
    });
    const banner = new THREE.Mesh(bannerGeo, bannerMat);
    banner.position.set(0, 19, 0);
    gateGroup.add(banner);

    this.worldGroup.add(gateGroup);
  }

  buildItemBoxesAndCoins(course) {
    // 8 Item Box clusters around the track (5 boxes per cluster, plus Double Item Boxes in center!)
    const clusterIndices = [35, 85, 140, 195, 245, 295, 345, 385];
    const itemBoxTex = this.createItemBoxTexture();

    clusterIndices.forEach((idx) => {
      const s = this.trackSamples[idx % this.trackSamples.length];
      const offsets = [-18, -9, 0, 9, 18];
      offsets.forEach((off, j) => {
        const isDouble = j === 2; // Center box is a Double Item Box!
        const pos = s.point.clone().addScaledVector(s.normal, off);
        pos.y = 2.8;

        const boxGroup = new THREE.Group();
        boxGroup.position.copy(pos);

        // Outer crystal cube
        const boxGeo = new THREE.BoxGeometry(3.0, 3.0, 3.0);
        const boxMat = new THREE.MeshPhongMaterial({
          map: itemBoxTex,
          transparent: true,
          opacity: 0.88,
          shininess: 100,
          color: isDouble ? 0xffcc00 : 0xffffff
        });
        const cube = new THREE.Mesh(boxGeo, boxMat);
        boxGroup.add(cube);

        // If Double Box, add stacked secondary rotating cube!
        if (isDouble) {
          const topCube = new THREE.Mesh(
            new THREE.BoxGeometry(2.4, 2.4, 2.4),
            new THREE.MeshPhongMaterial({
              map: itemBoxTex,
              transparent: true,
              opacity: 0.85,
              shininess: 100,
              color: 0x00f2ff
            })
          );
          topCube.position.y = 2.5;
          boxGroup.add(topCube);
        }

        this.worldGroup.add(boxGroup);

        this.itemBoxes.push({
          mesh: boxGroup,
          basePos: pos.clone(),
          active: true,
          respawnTimer: 0,
          isDouble
        });
      });
    });

    // Coins along racing lines
    const coinGeo = new THREE.CylinderGeometry(1.3, 1.3, 0.4, 14);
    const coinMat = new THREE.MeshPhongMaterial({ color: 0xffdd00, emissive: 0x664400, shininess: 90 });
    for (let i = 15; i < this.trackSamples.length; i += 18) {
      const s = this.trackSamples[i];
      for (let c = -1; c <= 1; c++) {
        const pos = s.point.clone().addScaledVector(s.normal, c * 7.5);
        pos.y = 1.5;
        const mesh = new THREE.Mesh(coinGeo, coinMat);
        mesh.position.copy(pos);
        mesh.rotation.z = Math.PI / 2;
        this.worldGroup.add(mesh);
        this.coinPickups.push({ mesh, pos, active: true, respawnTimer: 0 });
      }
    }
  }

  buildCourseGimmicks(course) {
    const boostTex = this.createBoostPadTexture();

    // 1. Dash Boost Pads
    const boostIndices = [24, 72, 120, 170, 220, 270, 320, 365];
    boostIndices.forEach((idx, k) => {
      const s = this.trackSamples[idx % this.trackSamples.length];
      const offset = k % 2 === 0 ? -9 : 9;
      const pos = s.point.clone().addScaledVector(s.normal, offset);
      const angle = Math.atan2(s.tangent.x, s.tangent.z);

      const padGeo = new THREE.PlaneGeometry(8.5, 13);
      const padMat = new THREE.MeshBasicMaterial({ map: boostTex, side: THREE.DoubleSide });
      const padMesh = new THREE.Mesh(padGeo, padMat);
      padMesh.rotation.x = -Math.PI / 2;
      padMesh.rotation.z = -angle;
      padMesh.position.set(pos.x, 0.15, pos.z);
      this.worldGroup.add(padMesh);

      this.gimmicks.push({
        type: 'BOOST_PAD',
        pos,
        radius: 6.8,
        mesh: padMesh
      });
    });

    // 2. Super Jump Glider Ramps
    [95, 210, 345].forEach((idx) => {
      const s = this.trackSamples[idx];
      const angle = Math.atan2(s.tangent.x, s.tangent.z);
      const rampGeo = new THREE.BoxGeometry(15, 2.2, 11);
      const rampMat = new THREE.MeshLambertMaterial({ color: 0xff8800, emissive: 0x441100 });
      const rampMesh = new THREE.Mesh(rampGeo, rampMat);
      rampMesh.position.set(s.point.x, 0.8, s.point.z);
      rampMesh.rotation.y = angle;
      rampMesh.rotation.x = -0.22;
      this.worldGroup.add(rampMesh);

      this.gimmicks.push({
        type: 'JUMP_RAMP',
        pos: s.point.clone(),
        radius: 9.0,
        mesh: rampMesh
      });
    });

    if (!this.extraGimmicks) return;

    // 3. Giant Thwomps (ドッスン)
    [58, 155, 255, 355].forEach((idx, i) => {
      const s = this.trackSamples[idx];
      const thwompGroup = new THREE.Group();
      const bodyGeo = new THREE.BoxGeometry(10, 12, 6);
      const bodyMat = new THREE.MeshLambertMaterial({ color: 0x556070 });
      const body = new THREE.Mesh(bodyGeo, bodyMat);

      const eyeGeo = new THREE.BoxGeometry(2.2, 1.5, 0.5);
      const eyeMat = new THREE.MeshBasicMaterial({ color: 0xff2200 });
      const eyeL = new THREE.Mesh(eyeGeo, eyeMat);
      eyeL.position.set(-2.3, 1.6, 3.1);
      const eyeR = new THREE.Mesh(eyeGeo, eyeMat);
      eyeR.position.set(2.3, 1.6, 3.1);
      thwompGroup.add(body, eyeL, eyeR);

      const angle = Math.atan2(s.tangent.x, s.tangent.z);
      const pos = s.point.clone().addScaledVector(s.normal, i % 2 === 0 ? -8 : 8);
      thwompGroup.position.set(pos.x, 17, pos.z);
      thwompGroup.rotation.y = angle;
      this.worldGroup.add(thwompGroup);

      this.gimmicks.push({
        type: 'THWOMP',
        pos: new THREE.Vector3(pos.x, 0, pos.z),
        mesh: thwompGroup,
        phase: i * 1.6,
        radius: 6.5,
        isDown: false
      });
    });

    // 4. Rotating Fire / Laser Bars
    [112, 295].forEach((idx, i) => {
      const s = this.trackSamples[idx];
      const pivot = new THREE.Group();
      pivot.position.set(s.point.x, 1.8, s.point.z);

      const coreGeo = new THREE.CylinderGeometry(2.4, 2.4, 4.5, 12);
      const coreMat = new THREE.MeshLambertMaterial({ color: 0x333333 });
      pivot.add(new THREE.Mesh(coreGeo, coreMat));

      const orbGeo = new THREE.SphereGeometry(1.5, 10, 10);
      const orbMat = new THREE.MeshBasicMaterial({ color: course.id === 'rainbow_cyber' ? 0x00ffff : 0xff3300 });
      for (let side = -1; side <= 1; side += 2) {
        for (let r = 3.5; r <= 15.5; r += 2.8) {
          const orb = new THREE.Mesh(orbGeo, orbMat);
          orb.position.set(side * r, 0, 0);
          pivot.add(orb);
        }
      }
      this.worldGroup.add(pivot);

      this.gimmicks.push({
        type: 'FIREBAR',
        pos: s.point.clone(),
        mesh: pivot,
        angle: i * Math.PI * 0.5,
        speed: 1.75 * (i % 2 === 0 ? 1 : -1),
        armLength: 16.0
      });
    });

    // 5. Anti-Gravity Spin Boost Pillars
    [45, 145, 245, 330].forEach((idx) => {
      const s = this.trackSamples[idx];
      const pGroup = new THREE.Group();
      pGroup.position.set(s.point.x, 2.5, s.point.z);

      const cylGeo = new THREE.CylinderGeometry(2.5, 2.5, 5.5, 16);
      const cylMat = new THREE.MeshPhongMaterial({
        color: 0x00e5ff,
        emissive: 0x0066aa
      });
      const ringGeo = new THREE.TorusGeometry(4.0, 0.4, 8, 24);
      const ringMat = new THREE.MeshBasicMaterial({ color: 0x00ffff });
      const ring = new THREE.Mesh(ringGeo, ringMat);
      ring.rotation.x = Math.PI / 2;
      pGroup.add(new THREE.Mesh(cylGeo, cylMat), ring);
      this.worldGroup.add(pGroup);

      this.gimmicks.push({
        type: 'SPIN_BOOSTER',
        pos: s.point.clone(),
        mesh: pGroup,
        radius: 5.2
      });
    });

    // 6. Hyper Warp Portal Gate
    const warpStartIdx = 195;
    const warpExitIdx = 225;
    const sStart = this.trackSamples[warpStartIdx];
    const sExit = this.trackSamples[warpExitIdx];
    const warpPos = sStart.point.clone().addScaledVector(sStart.normal, -13);

    const portalGeo = new THREE.TorusGeometry(4.8, 0.75, 12, 28);
    const portalMat = new THREE.MeshBasicMaterial({ color: 0xd400ff });
    const portalMesh = new THREE.Mesh(portalGeo, portalMat);
    portalMesh.position.set(warpPos.x, 4.8, warpPos.z);
    portalMesh.rotation.y = Math.atan2(sStart.tangent.x, sStart.tangent.z);
    this.worldGroup.add(portalMesh);

    this.gimmicks.push({
      type: 'WARP_PORTAL',
      pos: warpPos,
      exitSampleIdx: warpExitIdx,
      exitPos: sExit.point.clone(),
      exitAngle: Math.atan2(sExit.tangent.x, sExit.tangent.z),
      mesh: portalMesh,
      radius: 5.8
    });
  }

  buildSceneryDecorations(course) {
    // 1. Course-Specific Large Architectural Stadium & Landmarks
    if (course.id === 'mario_circuit') {
      // Mario Stadium Deluxe Grandstands & Floodlight Towers
      for (let s = 0; s < 8; s++) {
        const sampleIdx = (s * 52) % this.trackSamples.length;
        const sample = this.trackSamples[sampleIdx];
        const side = s % 2 === 0 ? 1 : -1;
        const standDist = this.trackWidth + 34;
        const pos = sample.point.clone().addScaledVector(sample.normal, side * standDist);
        const rotY = Math.atan2(sample.tangent.x, sample.tangent.z) + (side > 0 ? -Math.PI / 2 : Math.PI / 2);

        // Tiered grandstand building
        const standGroup = new THREE.Group();
        standGroup.position.set(pos.x, 0, pos.z);
        standGroup.rotation.y = rotY;

        for (let tier = 0; tier < 4; tier++) {
          const stepGeo = new THREE.BoxGeometry(45, 2.8, 6.5);
          const stepMat = new THREE.MeshStandardMaterial({
            color: tier % 2 === 0 ? 0xdddddd : 0x2266cc,
            roughness: 0.6
          });
          const stepMesh = new THREE.Mesh(stepGeo, stepMat);
          stepMesh.position.set(0, 1.4 + tier * 2.8, tier * 5.5);
          stepMesh.castShadow = true;
          stepMesh.receiveShadow = true;
          standGroup.add(stepMesh);

          // Cheering crowd spectators (colorful voxel characters)
          for (let p = -18; p <= 18; p += 3.2) {
            const crowdMat = new THREE.MeshLambertMaterial({
              color: [0xe60012, 0x00b83d, 0xffcc00, 0x0099ff, 0xff66b2, 0xffffff][Math.abs(Math.floor(p + tier)) % 6]
            });
            const crowdMesh = new THREE.Mesh(new THREE.BoxGeometry(1.6, 2.2, 1.6), crowdMat);
            crowdMesh.position.set(p + (Math.random() - 0.5) * 0.8, 3.2 + tier * 2.8, tier * 5.5);
            standGroup.add(crowdMesh);
          }
        }

        // Grandstand Roof Canopy
        const roofGeo = new THREE.BoxGeometry(50, 1.2, 26);
        const roofMat = new THREE.MeshStandardMaterial({ color: 0xee0022, roughness: 0.4 });
        const roof = new THREE.Mesh(roofGeo, roofMat);
        roof.position.set(0, 16.5, 12);
        roof.rotation.x = 0.15;
        standGroup.add(roof);

        // Floodlight Tower on edge of stand
        const towerGeo = new THREE.CylinderGeometry(0.8, 1.2, 38, 8);
        const towerMat = new THREE.MeshStandardMaterial({ color: 0x444444, metalness: 0.8 });
        const tower = new THREE.Mesh(towerGeo, towerMat);
        tower.position.set(-22, 19, 0);
        standGroup.add(tower);

        const lightBox = new THREE.Mesh(
          new THREE.BoxGeometry(7, 3.5, 2.5),
          new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xfff0bb })
        );
        lightBox.position.set(-22, 38, 0);
        standGroup.add(lightBox);

        this.worldGroup.add(standGroup);
      }
    } else if (course.id === 'bowser_castle') {
      // Molten Lava Pools & Fortress Spires
      for (let s = 0; s < 12; s++) {
        const sampleIdx = (s * 35) % this.trackSamples.length;
        const sample = this.trackSamples[sampleIdx];
        const side = s % 2 === 0 ? 1 : -1;
        const pos = sample.point.clone().addScaledVector(sample.normal, side * (this.trackWidth + 28));

        // Magma Pool
        const lavaPool = new THREE.Mesh(
          new THREE.CircleGeometry(16, 16),
          new THREE.MeshBasicMaterial({ color: 0xff3300 })
        );
        lavaPool.rotation.x = -Math.PI / 2;
        lavaPool.position.set(pos.x, 0.1, pos.z);
        this.worldGroup.add(lavaPool);

        // Obsidian Fortress Spire with Burning Torch
        const spire = new THREE.Mesh(
          new THREE.ConeGeometry(8, 42, 6),
          new THREE.MeshStandardMaterial({ color: 0x221111, roughness: 0.85 })
        );
        spire.position.set(pos.x, 21, pos.z);
        spire.castShadow = true;
        this.worldGroup.add(spire);

        const fireTorch = new THREE.Mesh(
          new THREE.SphereGeometry(3.5, 8, 8),
          new THREE.MeshBasicMaterial({ color: 0xff7700 })
        );
        fireTorch.position.set(pos.x, 43, pos.z);
        this.worldGroup.add(fireTorch);
      }
    } else {
      // Rainbow Road: Cyber Neon Towers & Star Orbiters
      for (let s = 0; s < 16; s++) {
        const sampleIdx = (s * 26) % this.trackSamples.length;
        const sample = this.trackSamples[sampleIdx];
        const side = s % 2 === 0 ? 1 : -1;
        const pos = sample.point.clone().addScaledVector(sample.normal, side * (this.trackWidth + 30));

        const neonPillar = new THREE.Mesh(
          new THREE.BoxGeometry(3.5, 48, 3.5),
          new THREE.MeshStandardMaterial({
            color: s % 2 === 0 ? 0x00f2ff : 0xff00cc,
            emissive: s % 2 === 0 ? 0x00aacc : 0xaa0088,
            roughness: 0.2
          })
        );
        neonPillar.position.set(pos.x, 24, pos.z);
        this.worldGroup.add(neonPillar);

        const neonRing = new THREE.Mesh(
          new THREE.TorusGeometry(8.5, 0.6, 8, 24),
          new THREE.MeshBasicMaterial({ color: 0xffffff })
        );
        neonRing.position.set(pos.x, 38, pos.z);
        neonRing.rotation.x = Math.PI / 2;
        this.worldGroup.add(neonRing);
      }
    }

    // 2. Trees, Rocks & Perimeter Scenery
    for (let i = 0; i < 65; i++) {
      const sample = this.trackSamples[(i * 6 + 3) % this.trackSamples.length];
      const side = i % 2 === 0 ? 1 : -1;
      const dist = this.trackWidth + 48 + (i % 4) * 14;
      const pos = sample.point.clone().addScaledVector(sample.normal, side * dist);

      if (course.id === 'mario_circuit') {
        // Lush Mario Style Pine & Deciduous Trees
        const trunk = new THREE.Mesh(
          new THREE.CylinderGeometry(1.2, 1.6, 8, 8),
          new THREE.MeshStandardMaterial({ color: 0x6e411b, roughness: 0.9 })
        );
        trunk.position.set(pos.x, 4, pos.z);
        trunk.castShadow = true;

        const crown = new THREE.Mesh(
          new THREE.ConeGeometry(5.8, 12, 8),
          new THREE.MeshStandardMaterial({ color: i % 2 === 0 ? 0x24a038 : 0x1d8a2f, roughness: 0.8 })
        );
        crown.position.set(pos.x, 12, pos.z);
        crown.castShadow = true;
        this.worldGroup.add(trunk, crown);
      }
    }
  }

  // ==================== ULTRA-DETAILED 3D KART & RACER MODELLING ====================
  createKartMesh(driverData, kartIdx) {
    const root = new THREE.Group();

    // 1. Chassis Group (handles suspension roll and pitch)
    const chassisGroup = new THREE.Group();
    root.add(chassisGroup);

    // Aerodynamic Lower Floor Pan & Rear Diffuser
    const floorGeo = new THREE.BoxGeometry(2.7, 0.22, 4.8);
    const floorMat = new THREE.MeshStandardMaterial({ color: 0x181818, roughness: 0.8, metalness: 0.2 });
    const floor = new THREE.Mesh(floorGeo, floorMat);
    floor.position.set(0, 0.35, 0);
    chassisGroup.add(floor);

    // Rear Diffuser Fins
    for (let f = -1; f <= 1; f++) {
      const fin = new THREE.Mesh(
        new THREE.BoxGeometry(0.12, 0.45, 0.9),
        new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.5 })
      );
      fin.position.set(f * 0.8, 0.38, -2.3);
      chassisGroup.add(fin);
    }

    // Main Streamlined Aerodynamic Body Shell (Super-Gloss Racing Metallic Paint)
    const bodyMat = new THREE.MeshStandardMaterial({
      color: driverData.color,
      roughness: 0.16,
      metalness: 0.82
    });

    const bodyGeo = new THREE.BoxGeometry(2.6, 0.75, 3.6);
    const body = new THREE.Mesh(bodyGeo, bodyMat);
    body.position.set(0, 0.75, -0.1);
    body.castShadow = true;
    body.receiveShadow = true;
    chassisGroup.add(body);

    // Sculpted Front Nose Cone (Streamlined Formula Aero)
    const noseGeo = new THREE.ConeGeometry(1.35, 2.2, 16);
    const nose = new THREE.Mesh(noseGeo, bodyMat);
    nose.rotation.x = Math.PI / 2;
    nose.scale.set(1.0, 1.0, 0.45);
    nose.position.set(0, 0.65, 2.3);
    nose.castShadow = true;
    chassisGroup.add(nose);

    // Front Wing (Chin Spoiler with Side Endplates)
    const frontWing = new THREE.Mesh(
      new THREE.BoxGeometry(3.6, 0.16, 0.8),
      new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.3, metalness: 0.8 })
    );
    frontWing.position.set(0, 0.38, 2.6);
    frontWing.castShadow = true;
    chassisGroup.add(frontWing);

    [-1.8, 1.8].forEach((wx) => {
      const endplate = new THREE.Mesh(
        new THREE.BoxGeometry(0.12, 0.55, 0.9),
        bodyMat
      );
      endplate.position.set(wx, 0.55, 2.6);
      endplate.castShadow = true;
      chassisGroup.add(endplate);
    });

    // Front LED Headlights (Glowing Emissive projector lights)
    [-0.85, 0.85].forEach((hx) => {
      const light = new THREE.Mesh(
        new THREE.CylinderGeometry(0.24, 0.24, 0.12, 12),
        new THREE.MeshStandardMaterial({
          color: 0xffffff,
          emissive: 0xffeeaa,
          roughness: 0.1
        })
      );
      light.rotation.x = Math.PI / 2;
      light.position.set(hx, 0.72, 2.5);
      chassisGroup.add(light);
    });

    // Emblem Badge on Front Nose (Authentic Character Initial: M, L, P, B, Y, T, W, R)
    const initial = driverData.name[0] || 'M';
    const emblemTex = this.getEmblemTexture(initial, driverData.color);
    const emblemMesh = new THREE.Mesh(
      new THREE.CircleGeometry(0.55, 24),
      new THREE.MeshBasicMaterial({ map: emblemTex, transparent: true })
    );
    emblemMesh.rotation.x = -Math.PI / 2.8;
    emblemMesh.position.set(0, 0.88, 1.85);
    chassisGroup.add(emblemMesh);

    // Side Pods / Air Scoops (Left & Right)
    [-1.35, 1.35].forEach((sx) => {
      const pod = new THREE.Mesh(
        new THREE.BoxGeometry(0.65, 0.6, 2.4),
        new THREE.MeshStandardMaterial({ color: 0x222222, roughness: 0.4, metalness: 0.6 })
      );
      pod.position.set(sx, 0.65, -0.2);
      chassisGroup.add(pod);

      // White/Color Accent Stripe on Side Pod
      const stripe = new THREE.Mesh(
        new THREE.BoxGeometry(0.05, 0.22, 2.2),
        new THREE.MeshBasicMaterial({ color: 0xffffff })
      );
      stripe.position.set(sx + (sx > 0 ? 0.31 : -0.31), 0.68, -0.2);
      chassisGroup.add(stripe);
    });

    // 2. Cockpit Interior (Racing Bucket Seat, Steering Column, Wheel, Dashboard)
    // Bucket Seat
    const seatBack = new THREE.Mesh(
      new THREE.BoxGeometry(1.4, 1.4, 0.35),
      new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.9 })
    );
    seatBack.position.set(0, 1.35, -0.75);
    seatBack.rotation.x = -0.15;
    chassisGroup.add(seatBack);

    // Headrest
    const headrest = new THREE.Mesh(
      new THREE.BoxGeometry(0.9, 0.65, 0.3),
      new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.8 })
    );
    headrest.position.set(0, 2.1, -0.9);
    chassisGroup.add(headrest);

    // Steering Shaft and Wheel
    const steerShaft = new THREE.Mesh(
      new THREE.CylinderGeometry(0.08, 0.08, 1.1, 8),
      new THREE.MeshStandardMaterial({ color: 0x333333, metalness: 0.8 })
    );
    steerShaft.rotation.x = Math.PI / 3.2;
    steerShaft.position.set(0, 1.1, 0.55);
    chassisGroup.add(steerShaft);

    // Steering Wheel Group (Rotates with player input)
    const steeringWheelGroup = new THREE.Group();
    steeringWheelGroup.position.set(0, 1.48, 0.32);
    steeringWheelGroup.rotation.x = -Math.PI / 6;
    chassisGroup.add(steeringWheelGroup);

    const wheelRim = new THREE.Mesh(
      new THREE.TorusGeometry(0.48, 0.075, 12, 24),
      new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.7 })
    );
    steeringWheelGroup.add(wheelRim);

    // 3-Spoke GT Wheel Hub
    const hub = new THREE.Mesh(
      new THREE.CylinderGeometry(0.14, 0.14, 0.08, 12),
      new THREE.MeshStandardMaterial({ color: 0x888888, metalness: 0.9 })
    );
    hub.rotation.x = Math.PI / 2;
    steeringWheelGroup.add(hub);

    for (let spk = 0; spk < 3; spk++) {
      const spoke = new THREE.Mesh(
        new THREE.BoxGeometry(0.08, 0.42, 0.04),
        new THREE.MeshStandardMaterial({ color: 0xcccccc, metalness: 0.9 })
      );
      spoke.rotation.z = (spk * Math.PI * 2) / 3;
      spoke.position.y = 0.2;
      steeringWheelGroup.add(spoke);
    }

    // 3. Engine Bay & Dual Exhaust Pipes
    const engineBlock = new THREE.Mesh(
      new THREE.BoxGeometry(1.6, 0.85, 1.2),
      new THREE.MeshStandardMaterial({ color: 0x555555, metalness: 0.9, roughness: 0.25 })
    );
    engineBlock.position.set(0, 0.95, -1.65);
    chassisGroup.add(engineBlock);

    // Dual Exhaust Pipes
    const exhaustPipes = [];
    [-0.65, 0.65].forEach((px) => {
      const pipe = new THREE.Mesh(
        new THREE.CylinderGeometry(0.24, 0.32, 1.6, 12),
        new THREE.MeshStandardMaterial({ color: 0xaaaaaa, metalness: 0.95, roughness: 0.15 })
      );
      pipe.rotation.x = Math.PI / 2.8;
      pipe.position.set(px, 0.9, -2.4);
      chassisGroup.add(pipe);
      exhaustPipes.push(pipe);
    });

    // Large Rear Downforce Wing
    [-0.95, 0.95].forEach((sx) => {
      const wingStay = new THREE.Mesh(
        new THREE.BoxGeometry(0.12, 1.1, 0.35),
        new THREE.MeshStandardMaterial({ color: 0x222222, metalness: 0.8 })
      );
      wingStay.position.set(sx, 1.5, -2.05);
      wingStay.rotation.x = 0.2;
      chassisGroup.add(wingStay);
    });

    const rearWing = new THREE.Mesh(
      new THREE.BoxGeometry(3.6, 0.22, 1.1),
      new THREE.MeshStandardMaterial({ color: driverData.hatColor, roughness: 0.3, metalness: 0.4 })
    );
    rearWing.position.set(0, 2.05, -2.2);
    rearWing.rotation.x = -0.15;
    chassisGroup.add(rearWing);

    // 4. Wheels & Suspension (Front Steering Pivots + Rotating Wheels + Anti-Gravity Tilt)
    const wheelAssemblies = [];
    const frontSteerPivots = [];

    // [x, y, z, isFront, isLeft]
    const wheelPositions = [
      [-1.65, 0.68, 1.45, true, true],
      [1.65, 0.68, 1.45, true, false],
      [-1.75, 0.72, -1.45, false, true],
      [1.75, 0.72, -1.45, false, false]
    ];

    wheelPositions.forEach(([wx, wy, wz, isFront, isLeft]) => {
      // Base Pivot on root
      const pivot = new THREE.Group();
      pivot.position.set(wx, wy, wz);
      root.add(pivot);

      if (isFront) {
        frontSteerPivots.push(pivot);
      }

      // Hover / Anti-Gravity Tilt Group (Tilts 90 deg when anti-grav activated!)
      const tiltGroup = new THREE.Group();
      pivot.add(tiltGroup);

      // Spin Group (Rotates along wheel axis with speed)
      const spinGroup = new THREE.Group();
      tiltGroup.add(spinGroup);

      // Wide Racing Slick Tire (Rubber texture)
      const tireGeo = new THREE.CylinderGeometry(0.72, 0.72, isFront ? 0.65 : 0.78, 20);
      const tireMat = new THREE.MeshStandardMaterial({ color: 0x151515, roughness: 0.9, metalness: 0.1 });
      const tire = new THREE.Mesh(tireGeo, tireMat);
      tire.rotation.z = Math.PI / 2;
      tire.castShadow = true;
      tire.receiveShadow = true;
      spinGroup.add(tire);

      // Chrome 5-Spoke Aluminum Alloy Wheel Rim
      const rimGeo = new THREE.CylinderGeometry(0.5, 0.5, isFront ? 0.67 : 0.8, 16);
      const rimMat = new THREE.MeshStandardMaterial({ color: 0xdddddd, metalness: 0.95, roughness: 0.15 });
      const rim = new THREE.Mesh(rimGeo, rimMat);
      rim.rotation.z = Math.PI / 2;
      spinGroup.add(rim);

      // Wheel Center Hub Cap
      const cap = new THREE.Mesh(
        new THREE.CylinderGeometry(0.18, 0.18, isFront ? 0.72 : 0.85, 12),
        new THREE.MeshStandardMaterial({ color: driverData.color, metalness: 0.8 })
      );
      cap.rotation.z = Math.PI / 2;
      spinGroup.add(cap);

      // Perforated Brake Disc Rotor
      const disc = new THREE.Mesh(
        new THREE.CylinderGeometry(0.42, 0.42, 0.08, 16),
        new THREE.MeshStandardMaterial({ color: 0x888888, metalness: 0.95, roughness: 0.3 })
      );
      disc.rotation.z = Math.PI / 2;
      disc.position.x = isLeft ? 0.15 : -0.15;
      spinGroup.add(disc);

      // Sport Red Brake Caliper (Stationary relative to spin, sits on tiltGroup)
      const caliper = new THREE.Mesh(
        new THREE.BoxGeometry(0.18, 0.35, 0.25),
        new THREE.MeshStandardMaterial({ color: 0xee1111, roughness: 0.3 })
      );
      caliper.position.set(isLeft ? 0.18 : -0.18, 0.28, 0);
      tiltGroup.add(caliper);

      // Anti-Gravity Cyan Glowing LED Ring (Activated in Hover)
      const agRing = new THREE.Mesh(
        new THREE.TorusGeometry(0.74, 0.08, 8, 20),
        new THREE.MeshBasicMaterial({ color: 0x00f2ff, transparent: true, opacity: 0 })
      );
      agRing.rotation.y = Math.PI / 2;
      tiltGroup.add(agRing);

      wheelAssemblies.push({
        pivot,
        tiltGroup,
        spinGroup,
        agRing,
        isFront
      });
    });

    // 5. Highly Detailed Driver Character Model
    const driverGroup = new THREE.Group();
    driverGroup.position.set(0, 1.25, -0.2);
    chassisGroup.add(driverGroup);

    // Torso / Overalls
    const torso = new THREE.Mesh(
      new THREE.CylinderGeometry(0.7, 0.82, 1.25, 12),
      new THREE.MeshStandardMaterial({ color: driverData.shirtColor, roughness: 0.6 })
    );
    torso.position.set(0, 0.35, 0);
    torso.castShadow = true;
    driverGroup.add(torso);

    // Overalls Bib (Blue with Yellow Buttons for Mario/Luigi)
    const bib = new THREE.Mesh(
      new THREE.BoxGeometry(0.9, 0.85, 0.65),
      new THREE.MeshStandardMaterial({ color: 0x0044cc, roughness: 0.7 })
    );
    bib.position.set(0, 0.28, 0.15);
    bib.castShadow = true;
    driverGroup.add(bib);

    [-0.26, 0.26].forEach((bx) => {
      const button = new THREE.Mesh(
        new THREE.CylinderGeometry(0.08, 0.08, 0.05, 8),
        new THREE.MeshBasicMaterial({ color: 0xffdd00 })
      );
      button.rotation.x = Math.PI / 2;
      button.position.set(bx, 0.55, 0.48);
      driverGroup.add(button);
    });

    // Head
    const head = new THREE.Mesh(
      new THREE.SphereGeometry(0.75, 16, 16),
      new THREE.MeshStandardMaterial({ color: 0xffccaa, roughness: 0.5 })
    );
    head.position.set(0, 1.25, 0);
    head.castShadow = true;
    driverGroup.add(head);

    // Nose
    const noseM = new THREE.Mesh(
      new THREE.SphereGeometry(0.32, 12, 12),
      new THREE.MeshStandardMaterial({ color: 0xffbba0, roughness: 0.5 })
    );
    noseM.position.set(0, 1.22, 0.72);
    driverGroup.add(noseM);

    // Moustache (Curved 3D block for Mario/Luigi/Wario)
    const stache = new THREE.Mesh(
      new THREE.BoxGeometry(0.85, 0.25, 0.3),
      new THREE.MeshStandardMaterial({ color: 0x221100, roughness: 0.8 })
    );
    stache.position.set(0, 1.05, 0.68);
    driverGroup.add(stache);

    // Cap / Helmet
    const capDome = new THREE.Mesh(
      new THREE.SphereGeometry(0.82, 16, 12),
      new THREE.MeshStandardMaterial({ color: driverData.hatColor, roughness: 0.4 })
    );
    capDome.position.set(0, 1.45, -0.05);
    capDome.castShadow = true;
    driverGroup.add(capDome);

    // Cap Visor
    const visor = new THREE.Mesh(
      new THREE.CylinderGeometry(0.78, 0.88, 0.14, 12, 1, false, 0, Math.PI),
      new THREE.MeshLambertMaterial({ color: driverData.hatColor })
    );
    visor.rotation.x = -Math.PI / 6;
    visor.position.set(0, 1.35, 0.55);
    driverGroup.add(visor);

    // Cap Emblem
    const capEmblem = new THREE.Mesh(
      new THREE.CircleGeometry(0.24, 16),
      new THREE.MeshBasicMaterial({ map: emblemTex, transparent: true })
    );
    capEmblem.position.set(0, 1.62, 0.74);
    driverGroup.add(capEmblem);

    // Arms extending forward to grip the Steering Wheel!
    [-0.6, 0.6].forEach((ax) => {
      const arm = new THREE.Mesh(
        new THREE.CylinderGeometry(0.18, 0.22, 0.9, 8),
        new THREE.MeshLambertMaterial({ color: driverData.shirtColor })
      );
      arm.rotation.x = Math.PI / 3;
      arm.rotation.z = ax > 0 ? -0.25 : 0.25;
      arm.position.set(ax, 0.65, 0.35);
      driverGroup.add(arm);

      // White Driving Gloves
      const glove = new THREE.Mesh(
        new THREE.SphereGeometry(0.22, 10, 10),
        new THREE.MeshLambertMaterial({ color: 0xffffff })
      );
      glove.position.set(ax > 0 ? 0.35 : -0.35, 0.25, 0.72);
      driverGroup.add(glove);
    });

    // 6. Drift Spark Glow Orbs (Left & Right Rear)
    const sparkGeo = new THREE.SphereGeometry(0.7, 8, 8);
    const sparkMat = new THREE.MeshBasicMaterial({ color: 0x00d0ff, transparent: true, opacity: 0 });
    const sparkL = new THREE.Mesh(sparkGeo, sparkMat);
    sparkL.position.set(-1.6, 0.45, -1.8);
    const sparkR = new THREE.Mesh(sparkGeo, sparkMat);
    sparkR.position.set(1.6, 0.45, -1.8);
    root.add(sparkL, sparkR);

    // 7. Orbiting Triple-Items Group
    const orbitGroup = new THREE.Group();
    orbitGroup.position.set(0, 1.2, 0);
    root.add(orbitGroup);

    // 8. Held Item Behind Group (Drag Guard)
    const heldItemGroup = new THREE.Group();
    heldItemGroup.position.set(0, 0.8, -3.2);
    root.add(heldItemGroup);

    return {
      root,
      chassisGroup,
      bodyMat,
      steeringWheelGroup,
      frontSteerPivots,
      wheelAssemblies,
      driverGroup,
      sparkMat,
      orbitGroup,
      heldItemGroup,
      exhaustPipes
    };
  }

  spawnRacers(isDemo = false) {
    this.racers.forEach((r) => this.worldGroup.remove(r.mesh));
    this.racers = [];

    const drivers = window.GAME_DATA.drivers;
    const karts = window.GAME_DATA.karts;
    const totalRacers = this.selectedMode === 'tt' && !isDemo ? 1 : 8;

    const orderedDrivers = [drivers[this.selectedDriverIdx]];
    drivers.forEach((d, idx) => {
      if (idx !== this.selectedDriverIdx) orderedDrivers.push(d);
    });

    for (let i = 0; i < totalRacers; i++) {
      const d = orderedDrivers[i];
      const isPlayer = i === 0 && !isDemo;
      const kartMod = karts[isPlayer ? this.selectedKartIdx : i % karts.length].bodyMod;
      const built = this.createKartMesh(d, isPlayer ? this.selectedKartIdx : i % karts.length);

      // Starting grid placement with generous spacing to avoid pile-up on start
      const sampleIdx = Math.floor((this.trackSamples.length - 12 - i * 5 + this.trackSamples.length) % this.trackSamples.length);
      const sample = this.trackSamples[sampleIdx];
      const lateralOffset = i % 2 === 0 ? -6.5 : 6.5;
      const startPos = sample.point.clone().addScaledVector(sample.normal, lateralOffset);
      const heading = Math.atan2(sample.tangent.x, sample.tangent.z);

      built.root.position.copy(startPos);
      built.root.rotation.y = heading;
      this.worldGroup.add(built.root);

      // Tuned Speed: Extremely controllable, smooth and pleasant (Prevents uncontrollable speed!)
      const ccMultiplier = this.ccClass === 200 ? 1.2 : this.ccClass === 100 ? 0.85 : 1.0;
      const baseMaxSpeed = (54 + (d.stats.speed + kartMod.speed) * 2.4) * ccMultiplier;

      const racer = {
        id: i,
        name: d.name,
        shortName: d.name.split(' ')[0],
        driverData: d,
        isPlayer,

        // 3D Model Hierarchies
        mesh: built.root,
        chassisGroup: built.chassisGroup,
        bodyMat: built.bodyMat,
        steeringWheelGroup: built.steeringWheelGroup,
        frontSteerPivots: built.frontSteerPivots,
        wheelAssemblies: built.wheelAssemblies,
        driverGroup: built.driverGroup,
        sparkMat: built.sparkMat,
        orbitGroup: built.orbitGroup,
        heldItemGroup: built.heldItemGroup,
        exhaustPipes: built.exhaustPipes,

        // Dynamics - Smooth, authentic Mario Kart 8DX physics
        pos: startPos.clone(),
        velY: 0,
        heading,
        speed: 0,
        maxSpeed: baseMaxSpeed,
        accelStat: 30 + (d.stats.accel + kartMod.accel) * 3.2,
        handlingStat: 1.45 + (d.stats.handling + kartMod.handling) * 0.08, // Perfectly balanced steering rate (prevents oversteering)
        steerInput: 0,
        wheelSpinTimer: 0,
        weightStat: d.stats.weight,

        // Drift & Mini-Turbo
        drifting: false,
        driftDir: 0,
        driftCharge: 0,
        driftLevel: 0, // 0, 1(Blue), 2(Orange), 3(Purple Ultra)

        // Boosts, Status & Tricking
        boostTimer: 0,
        boostPower: 0,
        starTimer: 0,
        bulletTimer: 0,
        shrunkTimer: 0,
        flattenedTimer: 0,
        spinOutTimer: 0,
        overdriveGauge: isPlayer ? 50 : 0,
        overdriveTimer: 0,
        antiGravityTimer: 0,
        trickPerformed: false,
        trickTimer: 0,

        // Slipstream (Drafting)
        draftTimer: 0,
        draftTarget: null,

        // Double Item Slots System (MK8DX Authentic)
        itemSlot1: null, // { def, usesLeft }
        itemSlot2: null,
        rouletteTimer1: 0,
        rouletteTimer2: 0,
        isHoldingItem: false, // Item drag guard behind
        goldenMushroomTimer: 0,

        // Coins (Max 10, Speed bonus)
        coins: 0,

        // Race Progress
        lap: 1,
        sampleIdx,
        maxSampleReached: 0,
        totalProgress: -i * 0.01,
        rank: i + 1,
        finished: false,
        finishTime: 0,
        wrongWayTimer: 0,

        // AI
        aiLaneOffset: (Math.random() - 0.5) * 14,
        aiItemDelay: 2.0 + Math.random() * 2.5
      };

      // In Time Trial mode ONLY, give player 3 Mushrooms at start (Standard MK rule)
      if (this.selectedMode === 'tt' && isPlayer) {
        racer.itemSlot1 = { def: window.GAME_DATA.items.TRIPLE_MUSHROOM, usesLeft: 3 };
        this.rebuildOrbitingItems(racer);
      }

      this.racers.push(racer);
      if (isPlayer) this.player = racer;
    }

    if (this.player) {
      this.updateItemHUD();
    }
  }

  // ==================== AUTHENTIC ITEM DISTRIBUTION & ROULETTE ====================
  triggerItemBoxHit(racer, isDouble = false) {
    // If racer already has both slots full and neither is spinning, do nothing
    if (racer.itemSlot1 && racer.itemSlot2 && racer.rouletteTimer1 <= 0 && racer.rouletteTimer2 <= 0) {
      return;
    }

    window.soundEngine.sfxBoxBreak();

    // Slot 1
    if (!racer.itemSlot1 && racer.rouletteTimer1 <= 0) {
      racer.rouletteTimer1 = racer.isPlayer ? 1.5 : 0.4;
      if (racer.isPlayer) window.soundEngine.sfxItemRouletteTick();
    } else if (!racer.itemSlot2 && racer.rouletteTimer2 <= 0) {
      // Slot 2
      racer.rouletteTimer2 = racer.isPlayer ? 1.5 : 0.4;
      if (racer.isPlayer) window.soundEngine.sfxItemRouletteTick();
    }

    // If double box and slot 2 still empty
    if (isDouble && !racer.itemSlot2 && racer.rouletteTimer2 <= 0) {
      racer.rouletteTimer2 = racer.isPlayer ? 1.8 : 0.6;
    }

    if (racer.isPlayer) {
      this.updateItemHUD();
    }
  }

  getRandomItemForRank(rank) {
    const frantic = this.franticItems || this.selectedMode === 'mayhem';
    let pool = [];

    if (rank === 1 && !frantic) {
      // 1st place: Coins, Bananas, Green Shell, Super Horn/EMP
      pool = [
        'BANANA', 'BANANA', 'BANANA', 'GREEN_SHELL', 'GREEN_SHELL',
        'MUSHROOM', 'BOB_OMB', 'BARRIER_EMP'
      ];
    } else if (rank <= 3) {
      // 2nd-3rd place: Red Shell, Triple Bananas/Greens, Mushrooms, Bob-omb
      pool = [
        'RED_SHELL', 'RED_SHELL', 'GREEN_SHELL', 'TRIPLE_BANANA',
        'TRIPLE_GREEN', 'MUSHROOM', 'TRIPLE_MUSHROOM', 'BOB_OMB', 'BARRIER_EMP'
      ];
    } else if (rank <= 5) {
      // 4th-5th place: Triple Red, Triple Mushroom, Star, Bob-omb, Black Hole
      pool = [
        'RED_SHELL', 'TRIPLE_RED', 'TRIPLE_MUSHROOM', 'GOLDEN_MUSHROOM',
        'STAR', 'BOB_OMB', 'BLACK_HOLE', 'SPINY_SHELL'
      ];
    } else {
      // 6th-8th place: Star, Bullet Bill, Lightning, Spiny (Blue) Shell, Golden Mushroom
      pool = [
        'STAR', 'STAR', 'BULLET_BILL', 'BULLET_BILL', 'LIGHTNING',
        'SPINY_SHELL', 'GOLDEN_MUSHROOM', 'TRIPLE_RED', 'BLACK_HOLE'
      ];
    }

    const chosenId = pool[Math.floor(Math.random() * pool.length)];
    return window.GAME_DATA.items[chosenId] || window.GAME_DATA.items.BANANA;
  }

  rebuildOrbitingItems(racer) {
    while (racer.orbitGroup.children.length > 0) {
      racer.orbitGroup.remove(racer.orbitGroup.children[0]);
    }
    const active = racer.itemSlot1;
    if (!active || active.usesLeft <= 0) return;

    const id = active.def.id;
    const isOrbitType = ['TRIPLE_BANANA', 'TRIPLE_GREEN', 'TRIPLE_RED', 'TRIPLE_MUSHROOM'].includes(id);
    if (!isOrbitType) return;

    let color = 0xffe600;
    if (id.includes('GREEN')) color = 0x00e640;
    if (id.includes('RED')) color = 0xff2222;
    if (id.includes('MUSHROOM')) color = 0xff3366;

    for (let i = 0; i < active.usesLeft; i++) {
      const angle = (i / active.usesLeft) * Math.PI * 2;
      const geo = id.includes('BANANA')
        ? new THREE.ConeGeometry(0.45, 1.35, 8)
        : new THREE.SphereGeometry(0.65, 10, 10);
      const mat = new THREE.MeshPhongMaterial({ color, shininess: 90 });
      const m = new THREE.Mesh(geo, mat);
      m.position.set(Math.cos(angle) * 3.1, 0.25, Math.sin(angle) * 3.1);
      racer.orbitGroup.add(m);
    }
  }

  updateHeldItemVisual(racer) {
    while (racer.heldItemGroup.children.length > 0) {
      racer.heldItemGroup.remove(racer.heldItemGroup.children[0]);
    }

    if (!racer.isHoldingItem || !racer.itemSlot1) return;

    const id = racer.itemSlot1.def.id;
    let mesh = null;

    if (id.includes('BANANA')) {
      mesh = new THREE.Mesh(
        new THREE.ConeGeometry(0.7, 1.8, 8),
        new THREE.MeshLambertMaterial({ color: 0xffe600 })
      );
    } else if (id.includes('GREEN')) {
      mesh = new THREE.Mesh(
        new THREE.SphereGeometry(0.9, 12, 12),
        new THREE.MeshPhongMaterial({ color: 0x00e640, shininess: 90 })
      );
      mesh.scale.y = 0.8;
    } else if (id.includes('RED')) {
      mesh = new THREE.Mesh(
        new THREE.SphereGeometry(0.9, 12, 12),
        new THREE.MeshPhongMaterial({ color: 0xff2222, shininess: 90 })
      );
      mesh.scale.y = 0.8;
    } else if (id === 'BOB_OMB') {
      mesh = new THREE.Mesh(
        new THREE.SphereGeometry(1.0, 12, 12),
        new THREE.MeshPhongMaterial({ color: 0x222222, emissive: 0x330000 })
      );
    }

    if (mesh) {
      racer.heldItemGroup.add(mesh);
    }
  }

  useRacerItem(racer, dir = 1) {
    if (!racer.itemSlot1 || racer.rouletteTimer1 > 0) return;
    const item = racer.itemSlot1;
    const id = item.def.id;

    if (id.includes('BANANA')) {
      this.spawnBanana(racer, dir);
    } else if (id.includes('GREEN')) {
      this.spawnShell(racer, 'GREEN', dir);
    } else if (id.includes('RED')) {
      this.spawnShell(racer, 'RED', dir);
    } else if (id === 'SPINY_SHELL') {
      this.spawnShell(racer, 'SPINY', 1);
    } else if (id === 'BOB_OMB') {
      this.spawnBobOmb(racer, dir);
    } else if (id.includes('MUSHROOM')) {
      this.triggerBoost(racer, 1.9, 34);
      window.soundEngine.sfxBoost();
      if (id === 'GOLDEN_MUSHROOM' && racer.goldenMushroomTimer > 0) {
        return;
      }
    } else if (id === 'STAR') {
      racer.starTimer = 8.5;
      this.triggerBoost(racer, 8.5, 28);
      if (racer.isPlayer) this.showTicker('⭐ スーパースター発動！！完全無敵！');
    } else if (id === 'LIGHTNING') {
      this.triggerLightning(racer);
    } else if (id === 'BULLET_BILL') {
      racer.bulletTimer = 6.0;
      racer.starTimer = Math.max(racer.starTimer, 6.0);
      if (racer.isPlayer) this.showTicker('🚀 キラー変身！！超音速オートパイロット突撃！');
      window.soundEngine.sfxBoost();
    } else if (id === 'BLACK_HOLE') {
      this.spawnBlackHole(racer, dir);
    } else if (id === 'BARRIER_EMP') {
      this.triggerEmpShockwave(racer);
    }

    item.usesLeft--;
    if (item.usesLeft <= 0) {
      // Consume Slot 1 and promote Slot 2 to Slot 1 (MK8DX Authentic!)
      racer.itemSlot1 = racer.itemSlot2;
      racer.itemSlot2 = null;
      racer.isHoldingItem = false;
      this.updateHeldItemVisual(racer);
    }

    this.rebuildOrbitingItems(racer);
    if (racer.isPlayer) {
      this.updateItemHUD();
    }
  }

  // ==================== PROJECTILES: BANANAS, SHELLS, BOB-OMBS, BLACK HOLES ====================
  spawnBanana(racer, dir = -1) {
    const group = new THREE.Group();
    const peel = new THREE.Mesh(
      new THREE.ConeGeometry(0.95, 2.3, 8),
      new THREE.MeshLambertMaterial({ color: 0xffe600 })
    );
    peel.position.y = 1.15;
    group.add(peel);

    const forward = new THREE.Vector3(Math.sin(racer.heading), 0, Math.cos(racer.heading));
    if (dir > 0) {
      const startPos = racer.pos.clone().addScaledVector(forward, 4.4);
      startPos.y = 2.2;
      group.position.copy(startPos);
      this.worldGroup.add(group);
      this.projectiles.push({
        type: 'BANANA',
        owner: racer,
        mesh: group,
        pos: startPos,
        vel: forward.multiplyScalar(racer.speed + 70),
        velY: 22,
        grounded: false,
        radius: 1.85,
        life: 35
      });
      if (racer.isPlayer) window.soundEngine.sfxThrow();
    } else {
      const dropPos = racer.pos.clone().addScaledVector(forward, -4.6);
      dropPos.y = 0;
      group.position.copy(dropPos);
      this.worldGroup.add(group);
      this.projectiles.push({
        type: 'BANANA',
        owner: racer,
        mesh: group,
        pos: dropPos,
        vel: new THREE.Vector3(0, 0, 0),
        velY: 0,
        grounded: true,
        radius: 1.85,
        life: 40
      });
      if (racer.isPlayer) window.soundEngine.sfxPlaceTrap();
    }
  }

  spawnShell(racer, shellKind, dir = 1) {
    const color = shellKind === 'GREEN' ? 0x00e640 : shellKind === 'RED' ? 0xff2222 : 0x0088ff;
    const mesh = new THREE.Mesh(
      new THREE.SphereGeometry(shellKind === 'SPINY' ? 1.6 : 1.3, 12, 12),
      new THREE.MeshPhongMaterial({ color, shininess: 95 })
    );
    mesh.scale.y = 0.78;

    const forward = new THREE.Vector3(Math.sin(racer.heading), 0, Math.cos(racer.heading)).multiplyScalar(dir);
    const startPos = racer.pos.clone().addScaledVector(forward, 5.0);
    startPos.y = 1.0;
    mesh.position.copy(startPos);
    this.worldGroup.add(mesh);

    const speed = shellKind === 'SPINY' ? 185 : 145;
    this.projectiles.push({
      type: `${shellKind}_SHELL`,
      owner: racer,
      mesh,
      pos: startPos,
      vel: forward.multiplyScalar(speed),
      speed,
      bouncesLeft: shellKind === 'GREEN' ? 16 : 6,
      radius: shellKind === 'SPINY' ? 2.3 : 1.8,
      life: 18,
      sampleIdx: racer.sampleIdx
    });

    if (racer.isPlayer) window.soundEngine.sfxThrow();
  }

  spawnBobOmb(racer, dir = 1) {
    const mesh = new THREE.Mesh(
      new THREE.SphereGeometry(1.5, 12, 12),
      new THREE.MeshPhongMaterial({ color: 0x222222, emissive: 0x330000 })
    );
    const forward = new THREE.Vector3(Math.sin(racer.heading), 0, Math.cos(racer.heading));
    const startPos = racer.pos.clone().addScaledVector(forward, dir > 0 ? 4.6 : -4.6);
    startPos.y = dir > 0 ? 2.4 : 1.2;
    mesh.position.copy(startPos);
    this.worldGroup.add(mesh);

    this.projectiles.push({
      type: 'BOB_OMB',
      owner: racer,
      mesh,
      pos: startPos,
      vel: dir > 0 ? forward.multiplyScalar(racer.speed + 60) : new THREE.Vector3(0, 0, 0),
      velY: dir > 0 ? 20 : 0,
      fuseTimer: 2.2,
      radius: 2.3,
      life: 5
    });
    if (racer.isPlayer) window.soundEngine.sfxThrow();
  }

  spawnBlackHole(racer, dir = 1) {
    const mesh = new THREE.Mesh(
      new THREE.TorusKnotGeometry(2.3, 0.55, 48, 8),
      new THREE.MeshBasicMaterial({ color: 0xb700ff, wireframe: true })
    );
    const forward = new THREE.Vector3(Math.sin(racer.heading), 0, Math.cos(racer.heading));
    const startPos = racer.pos.clone().addScaledVector(forward, dir > 0 ? 26 : -15);
    startPos.y = 2.6;
    mesh.position.copy(startPos);
    this.worldGroup.add(mesh);

    this.projectiles.push({
      type: 'BLACK_HOLE',
      owner: racer,
      mesh,
      pos: startPos,
      vel: new THREE.Vector3(0, 0, 0),
      radius: 18.0,
      life: 6.5
    });
    window.soundEngine.sfxGimmickSwitch();
    if (racer.isPlayer) this.showTicker('🌌 オリジナル兵器「グラビティ・ブラックホール」展開！敵を壁へ吸引！');
  }

  triggerEmpShockwave(racer) {
    window.soundEngine.sfxGimmickSwitch();
    this.spawnExplosionVisual(racer.pos, 0x00ffff, 20);
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const p = this.projectiles[i];
      if (p.pos.distanceTo(racer.pos) < 30) {
        this.worldGroup.remove(p.mesh);
        this.projectiles.splice(i, 1);
      }
    }
    this.racers.forEach((other) => {
      if (other !== racer && other.pos.distanceTo(racer.pos) < 28) {
        this.hitRacer(other, 'EMP_SHOCK');
        const pushDir = other.pos.clone().sub(racer.pos).normalize();
        other.pos.addScaledVector(pushDir, 12);
      }
    });
    this.triggerBoost(racer, 1.5, 26);
    if (racer.isPlayer) this.showTicker('💠 ハイパーEMPショック発動！周囲の罠を全破壊＆ライバルを壁へ撃退！');
  }

  triggerLightning(caster) {
    window.soundEngine.sfxLightning();
    const flash = document.getElementById('lightning-flash');
    if (flash) {
      flash.style.opacity = '0.95';
      setTimeout(() => {
        flash.style.opacity = '0';
      }, 240);
    }
    this.racers.forEach((r) => {
      if (r !== caster && r.starTimer <= 0 && r.bulletTimer <= 0) {
        r.shrunkTimer = 6.5;
        r.itemSlot1 = null;
        r.itemSlot2 = null;
        r.isHoldingItem = false;
        this.updateHeldItemVisual(r);
        this.rebuildOrbitingItems(r);
        this.hitRacer(r, 'LIGHTNING');
      }
    });
    if (caster.isPlayer) this.showTicker('⚡ サンダー落雷！！ライバル全員がスピン＆ミニ化！');
  }

  activateOverdrive(racer) {
    if (racer.overdriveGauge < 100 || racer.overdriveTimer > 0) {
      if (racer.isPlayer) this.showTicker('⚡ OVERDRIVEゲージをドリフトやコインで100%まで溜めよう！');
      return;
    }
    racer.overdriveGauge = 0;
    racer.overdriveTimer = 5.5;
    racer.antiGravityTimer = 5.5;
    this.triggerBoost(racer, 5.5, 34);
    this.triggerEmpShockwave(racer);
    if (racer.isPlayer) {
      this.showTicker(`🔥 必殺オーバードライブ【${racer.driverData.specialName}】発動！！`);
    }
  }

  triggerJumpAction(racer) {
    racer.trickPerformed = true;
    racer.trickTimer = 0.9;
    window.soundEngine.sfxTrick();
    if (racer.isPlayer) {
      const banner = document.getElementById('trick-banner');
      if (banner) {
        banner.classList.remove('hidden');
        setTimeout(() => banner.classList.add('hidden'), 1200);
      }
      this.showTicker('✨ ジャンプアクション成功！！着地ミニターボ獲得！');
    }
  }

  // ==================== PHYSICS, SLIPSTREAM, WALLS & COLLISIONS ====================
  triggerBoost(racer, duration, power) {
    racer.boostTimer = Math.max(racer.boostTimer, duration);
    racer.boostPower = Math.max(racer.boostPower, power);
    racer.overdriveGauge = Math.min(100, racer.overdriveGauge + 12);
  }

  hitRacer(racer, sourceType) {
    if (racer.starTimer > 0 || racer.bulletTimer > 0 || racer.overdriveTimer > 0) return;
    racer.spinOutTimer = 1.05;
    racer.speed *= 0.25;
    racer.drifting = false;
    racer.driftCharge = 0;
    racer.driftLevel = 0;

    // Drop 3 coins upon crash (Authentic MK rule!)
    const dropCount = Math.min(3, racer.coins);
    racer.coins -= dropCount;
    for (let c = 0; c < dropCount; c++) {
      this.spawnDroppedCoin(racer.pos);
    }

    if (racer.isPlayer) {
      window.soundEngine.sfxSpinOut();
      this.showTicker(`💥 クラッシュ！ (${sourceType}) コイン減少＆スピン！`);
    }
  }

  spawnDroppedCoin(pos) {
    const coinGeo = new THREE.CylinderGeometry(1.1, 1.1, 0.35, 12);
    const coinMat = new THREE.MeshPhongMaterial({ color: 0xffdd00, emissive: 0x553300 });
    const mesh = new THREE.Mesh(coinGeo, coinMat);
    mesh.rotation.z = Math.PI / 2;
    mesh.position.copy(pos);
    mesh.position.y = 1.5;
    this.worldGroup.add(mesh);

    const angle = Math.random() * Math.PI * 2;
    const speed = 12 + Math.random() * 18;
    this.droppedCoins.push({
      mesh,
      pos: mesh.position,
      velX: Math.cos(angle) * speed,
      velZ: Math.sin(angle) * speed,
      velY: 14 + Math.random() * 8,
      life: 8.0
    });
  }

  findClosestTrackSample(pos, hintIdx = 0) {
    const N = this.trackSamples.length;
    let bestIdx = hintIdx;
    let bestDistSq = Infinity;

    for (let offset = -32; offset <= 32; offset++) {
      const idx = (hintIdx + offset + N) % N;
      const dSq = pos.distanceToSquared(this.trackSamples[idx].point);
      if (dSq < bestDistSq) {
        bestDistSq = dSq;
        bestIdx = idx;
      }
    }
    if (bestDistSq > 2000) {
      for (let i = 0; i < N; i++) {
        const dSq = pos.distanceToSquared(this.trackSamples[i].point);
        if (dSq < bestDistSq) {
          bestDistSq = dSq;
          bestIdx = i;
        }
      }
    }
    return bestIdx;
  }

  updateRacerPhysics(racer, dt) {
    // Timers
    if (racer.boostTimer > 0) racer.boostTimer -= dt;
    if (racer.starTimer > 0) {
      racer.starTimer -= dt;
      if (racer.isPlayer && Math.random() < 0.25) window.soundEngine.sfxStarTick();
    }
    if (racer.bulletTimer > 0) racer.bulletTimer -= dt;
    if (racer.shrunkTimer > 0) racer.shrunkTimer -= dt;
    if (racer.flattenedTimer > 0) racer.flattenedTimer -= dt;
    if (racer.spinOutTimer > 0) racer.spinOutTimer -= dt;
    if (racer.overdriveTimer > 0) racer.overdriveTimer -= dt;
    if (racer.antiGravityTimer > 0) racer.antiGravityTimer -= dt;
    if (racer.trickTimer > 0) {
      racer.trickTimer -= dt;
      racer.chassisGroup.rotation.y += dt * 14; // Trick spin!
    } else {
      racer.chassisGroup.rotation.y = 0;
    }

    if (racer.goldenMushroomTimer > 0) {
      racer.goldenMushroomTimer -= dt;
      if (racer.goldenMushroomTimer <= 0 && racer.itemSlot1 && racer.itemSlot1.def.id === 'GOLDEN_MUSHROOM') {
        racer.itemSlot1 = racer.itemSlot2;
        racer.itemSlot2 = null;
        if (racer.isPlayer) this.updateItemHUD();
      }
    }

    // Roulette Slots update
    if (racer.rouletteTimer1 > 0) {
      racer.rouletteTimer1 -= dt;
      if (racer.isPlayer && Math.random() < 0.35) window.soundEngine.sfxItemRouletteTick();
      if (racer.rouletteTimer1 <= 0) {
        const itemDef = this.getRandomItemForRank(racer.rank);
        racer.itemSlot1 = { def: itemDef, usesLeft: itemDef.count || 1 };
        if (itemDef.id === 'GOLDEN_MUSHROOM') {
          racer.goldenMushroomTimer = 8.5;
          racer.itemSlot1.usesLeft = 99;
        }
        this.rebuildOrbitingItems(racer);
        if (racer.isPlayer) {
          window.soundEngine.sfxItemDecide();
          this.updateItemHUD();
        }
      }
    }

    if (racer.rouletteTimer2 > 0) {
      racer.rouletteTimer2 -= dt;
      if (racer.rouletteTimer2 <= 0) {
        const itemDef = this.getRandomItemForRank(racer.rank);
        racer.itemSlot2 = { def: itemDef, usesLeft: itemDef.count || 1 };
        if (racer.isPlayer) {
          window.soundEngine.sfxItemDecide();
          this.updateItemHUD();
        }
      }
    }

    // Visual scaling for Lightning shrink or Thwomp flatten
    const scaleXZ = racer.shrunkTimer > 0 ? 0.58 : 1.0;
    const scaleY = racer.flattenedTimer > 0 ? 0.28 : racer.shrunkTimer > 0 ? 0.58 : 1.0;
    racer.mesh.scale.set(scaleXZ, scaleY, scaleXZ);

    // Anti-Gravity Hover Transformation (Wheels fold 90 deg horizontal & cyan LED ring glows!)
    const hoverMode = racer.antiGravityTimer > 0 || racer.overdriveTimer > 0;
    racer.wheelAssemblies.forEach((w) => {
      const targetTilt = hoverMode ? Math.PI / 2 : 0;
      w.tiltGroup.rotation.x = THREE.MathUtils.lerp(w.tiltGroup.rotation.x, targetTilt, dt * 10);
      w.agRing.material.opacity = hoverMode ? 0.95 : 0;
    });

    if (racer.starTimer > 0) {
      racer.bodyMat.color.setHSL((performance.now() * 0.003) % 1, 1.0, 0.55);
    } else if (racer.overdriveTimer > 0) {
      racer.bodyMat.color.setHex(0x00f2ff);
    } else {
      racer.bodyMat.color.setHex(racer.driverData.color);
    }

    racer.orbitGroup.rotation.y += dt * 3.8;

    // Controls
    let throttle = 0;
    let steer = 0;
    let wantDrift = false;

    if (racer.bulletTimer > 0 || !racer.isPlayer || this.state === 'DEMO' || racer.finished) {
      throttle = 1;
      const lookAhead = racer.bulletTimer > 0 ? 9 : 13;
      const targetSample = this.trackSamples[(racer.sampleIdx + lookAhead) % this.trackSamples.length];
      const laneOffset = racer.bulletTimer > 0 ? 0 : racer.aiLaneOffset;
      const targetPt = targetSample.point.clone().addScaledVector(targetSample.normal, laneOffset);

      const desiredHeading = Math.atan2(targetPt.x - racer.pos.x, targetPt.z - racer.pos.z);
      let angleDiff = desiredHeading - racer.heading;
      while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
      while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;

      steer = Math.max(-1, Math.min(1, angleDiff * 2.8));
      wantDrift = Math.abs(angleDiff) > 0.35 && racer.speed > 55;

      // AI Item Logic (Can hold banana/shell behind as guard or throw)
      if (!racer.isPlayer && this.state === 'RACING' && racer.itemSlot1) {
        racer.aiItemDelay -= dt;
        if (racer.aiItemDelay <= 0) {
          const id = racer.itemSlot1.def.id;
          if (id.includes('BANANA') && !racer.isHoldingItem && Math.random() < 0.6) {
            racer.isHoldingItem = true;
            this.updateHeldItemVisual(racer);
            racer.aiItemDelay = 3.5;
          } else {
            const throwDir = id.includes('BANANA') ? -1 : 1;
            this.useRacerItem(racer, throwDir);
            racer.aiItemDelay = 2.5 + Math.random() * 3.0;
          }
        }
      }
    } else if (this.state === 'RACING') {
      if (this.keys['KeyW'] || this.keys['ArrowUp']) throttle = 1;
      if (this.keys['KeyS'] || this.keys['ArrowDown']) {
        // バック機能を完全に廃止！S/下キーは純粋な減速・停止ブレーキ！
        throttle = 0;
        racer.speed = Math.max(0, racer.speed - racer.accelStat * 2.8 * dt);
      }
      if (this.keys['KeyA'] || this.keys['ArrowLeft']) steer += 1;
      if (this.keys['KeyD'] || this.keys['ArrowRight']) steer -= 1;
      wantDrift = Boolean(this.keys['ShiftLeft'] || this.keys['ShiftRight'] || this.keys['ControlLeft'] || this.keys['KeyK']);
    }

    // Wheel Spin (Rocket Start Overcharge penalty - Wheels spin with smoke, but NO SPINOUT / NO TURNING SIDEWAYS!)
    if (racer.wheelSpinTimer > 0) {
      racer.wheelSpinTimer -= dt;
      throttle = 0;
      racer.speed = Math.max(0, racer.speed - 35 * dt);
      if (Math.random() < 0.45) {
        this.spawnSparkBurst(racer.pos, 0xffffff);
      }
    }

    if (racer.spinOutTimer > 0) {
      throttle = 0;
      racer.speed *= Math.pow(0.2, dt);
      racer.heading += dt * 7.5;
    }

    // Calculate Top Speed with Coins (+1% per coin up to 10%), Boost, Star, Bullet, Shrink
    const coinBonus = 1.0 + Math.min(10, racer.coins) * 0.01;
    let topSpeed = racer.maxSpeed * coinBonus;
    if (racer.shrunkTimer > 0) topSpeed *= 0.68;
    if (racer.flattenedTimer > 0) topSpeed *= 0.55;
    if (racer.starTimer > 0) topSpeed += 20;
    if (racer.overdriveTimer > 0) topSpeed += 24;
    if (racer.bulletTimer > 0) topSpeed = 110;
    if (racer.boostTimer > 0) topSpeed += racer.boostPower;

    // Check Off-Road Dirt Penalty (Slows down unless Star / Bullet / Boost active!)
    const closestSample = this.trackSamples[racer.sampleIdx];
    const offVec = racer.pos.clone().sub(closestSample.point);
    offVec.y = 0;
    const latDist = Math.abs(offVec.dot(closestSample.normal));
    const isOffRoad = latDist > this.trackWidth * 0.95;
    if (isOffRoad && racer.boostTimer <= 0 && racer.starTimer <= 0 && racer.bulletTimer <= 0) {
      topSpeed *= 0.55;
    }

    // Acceleration & Drag (Minimum speed is strictly 0: NO REVERSING)
    if (throttle > 0 && racer.wheelSpinTimer <= 0 && racer.spinOutTimer <= 0) {
      racer.speed += racer.accelStat * throttle * dt;
      if (racer.boostTimer > 0 || racer.bulletTimer > 0) {
        racer.speed = Math.max(racer.speed, topSpeed * 0.94);
      }
    } else {
      racer.speed *= Math.pow(0.5, dt);
    }

    if (racer.speed > topSpeed) {
      racer.speed = THREE.MathUtils.lerp(racer.speed, topSpeed, dt * 4.5);
    }
    racer.speed = Math.max(0, racer.speed); // Strict forward only: zero reverse

    // Authentic 3-Stage Drift Mini-Turbo (Blue -> Orange -> Purple Ultra)
    if (wantDrift && racer.speed > 30 && Math.abs(steer) > 0.1 && racer.pos.y <= 0.25 && racer.spinOutTimer <= 0) {
      if (!racer.drifting) {
        racer.drifting = true;
        racer.driftDir = Math.sign(steer);
        racer.velY = 7.5; // Hop!
      }
      racer.driftCharge += dt * (1.0 + Math.abs(steer) * 0.65);
      const prevLevel = racer.driftLevel;
      if (racer.driftCharge > 2.5) racer.driftLevel = 3;
      else if (racer.driftCharge > 1.4) racer.driftLevel = 2;
      else if (racer.driftCharge > 0.55) racer.driftLevel = 1;

      if (racer.isPlayer && racer.driftLevel > prevLevel) {
        window.soundEngine.sfxSparkCharge(racer.driftLevel);
      }
    } else if (racer.drifting) {
      // Release Drift -> Turbo Boost!
      if (racer.driftLevel === 1) {
        this.triggerBoost(racer, 0.9, 16);
        if (racer.isPlayer) window.soundEngine.sfxBoost();
      } else if (racer.driftLevel === 2) {
        this.triggerBoost(racer, 1.5, 22);
        if (racer.isPlayer) window.soundEngine.sfxBoost();
      } else if (racer.driftLevel === 3) {
        this.triggerBoost(racer, 2.3, 28);
        if (racer.isPlayer) {
          window.soundEngine.sfxBoost();
          this.showTicker('🟣 ウルトラミニターボ解放！！');
        }
      }
      racer.drifting = false;
      racer.driftDir = 0;
      racer.driftCharge = 0;
      racer.driftLevel = 0;
    }

    // Drift Sparks
    if (racer.drifting && racer.driftLevel > 0) {
      racer.sparkMat.opacity = 0.92;
      if (racer.driftLevel === 1) racer.sparkMat.color.setHex(0x00d8ff);
      else if (racer.driftLevel === 2) racer.sparkMat.color.setHex(0xff7700);
      else racer.sparkMat.color.setHex(0xd400ff);
    } else {
      racer.sparkMat.opacity = 0;
    }

    // Steering & Heading - Perfectly tuned, human-like smooth response (prevents oversteering)
    const steerTarget = racer.spinOutTimer > 0 ? 0 : steer;
    racer.steerInput = THREE.MathUtils.lerp(racer.steerInput || 0, steerTarget, dt * 10);

    const speedRatio = Math.min(1.0, racer.speed / 48);
    const speedTurnFactor = THREE.MathUtils.lerp(1.22, 0.92, speedRatio);
    const turnRate = racer.handlingStat * speedTurnFactor * (racer.drifting ? 1.4 : 1.0);

    if (racer.speed > 0.5 && racer.spinOutTimer <= 0) {
      const effectiveSteer = racer.drifting ? racer.steerInput * 0.72 + racer.driftDir * 0.55 : racer.steerInput;
      racer.heading += effectiveSteer * turnRate * dt;
    }

    // Move forward
    racer.pos.x += Math.sin(racer.heading) * racer.speed * dt;
    racer.pos.z += Math.cos(racer.heading) * racer.speed * dt;

    // Gravity & Jump Landing
    if (racer.pos.y > 0 || racer.velY > 0) {
      racer.pos.y += racer.velY * dt;
      racer.velY -= 45 * dt;
      if (racer.pos.y <= 0) {
        racer.pos.y = 0;
        racer.velY = 0;
        // If landed after performing a Jump Action trick -> Trigger Trick Landing Boost!
        if (racer.trickPerformed) {
          racer.trickPerformed = false;
          this.triggerBoost(racer, 1.2, 22);
          if (racer.isPlayer) window.soundEngine.sfxBoost();
        }
      }
    }

    // ==================== 1000x REALISTIC CAR VISUAL ANIMATIONS ====================
    // A. Front Wheel Steering Alignment
    const targetSteerAngle = -racer.steerInput * 0.55;
    racer.frontSteerPivots.forEach((p) => {
      p.rotation.y = THREE.MathUtils.lerp(p.rotation.y, targetSteerAngle, dt * 15);
    });

    // B. Steering Wheel Rotation in Cockpit
    racer.steeringWheelGroup.rotation.z = -racer.steerInput * 1.35;

    // C. 4 Wheels Fast Rolling Animation with Speed
    const rollDelta = (racer.speed / 0.72) * dt;
    racer.wheelAssemblies.forEach((w) => {
      w.spinGroup.rotation.x += rollDelta;
    });

    // D. Chassis Roll (Centrifugal Bank in Turns) & Pitch (Acceleration Squat / Braking Dive)
    const targetChassisRoll = racer.drifting ? racer.driftDir * 0.12 : -racer.steerInput * 0.08;
    const targetChassisPitch = throttle > 0 ? -0.05 : 0;
    racer.chassisGroup.rotation.z = THREE.MathUtils.lerp(racer.chassisGroup.rotation.z, targetChassisRoll, dt * 8);
    racer.chassisGroup.rotation.x = THREE.MathUtils.lerp(racer.chassisGroup.rotation.x, targetChassisPitch, dt * 8);

    // E. Driver Body Bank & Hang-off Lean into Turns
    const targetDriverLean = racer.steerInput * 0.28 + (racer.drifting ? racer.driftDir * 0.22 : 0);
    racer.driverGroup.rotation.z = THREE.MathUtils.lerp(racer.driverGroup.rotation.z, targetDriverLean, dt * 10);

    // Track Progress & Lap Check
    const prevSample = racer.sampleIdx;
    const newSampleIdx = this.findClosestTrackSample(racer.pos, prevSample);
    racer.sampleIdx = newSampleIdx;
    const sample = this.trackSamples[newSampleIdx];

    // Smart Direction Guard (逆走機能を完全に排除・コース逆向き時にソフトに前向きへアシスト)
    const trackAngle = Math.atan2(sample.tangent.x, sample.tangent.z);
    let headingDiff = racer.heading - trackAngle;
    while (headingDiff > Math.PI) headingDiff -= Math.PI * 2;
    while (headingDiff < -Math.PI) headingDiff += Math.PI * 2;
    if (Math.abs(headingDiff) > Math.PI * 0.55 && racer.spinOutTimer <= 0) {
      racer.heading = THREE.MathUtils.lerp(racer.heading, trackAngle, dt * 3.0);
    }

    const N = this.trackSamples.length;
    if (prevSample > N * 0.8 && newSampleIdx < N * 0.2 && racer.maxSampleReached > N * 0.65) {
      racer.lap++;
      racer.maxSampleReached = 0;
      if (racer.isPlayer && this.state === 'RACING') {
        if (racer.lap === this.totalLaps) {
          window.soundEngine.sfxLap(true);
          window.soundEngine.startBGM('final_lap');
          this.showTicker('🔥 FINAL LAP!! ファイナルラップ突入！！');
        } else if (racer.lap > this.totalLaps && !racer.finished) {
          racer.finished = true;
          racer.finishTime = this.raceTime;
          window.soundEngine.sfxGoal(racer.rank);
          window.uiFlow.showResultsScreen();
        } else {
          window.soundEngine.sfxLap(false);
          this.showTicker(`🏁 LAP ${racer.lap} / ${this.totalLaps}`);
        }
      } else if (!racer.isPlayer && racer.lap > this.totalLaps && !racer.finished) {
        racer.finished = true;
        racer.finishTime = this.raceTime;
      }
    }
    if (newSampleIdx > racer.maxSampleReached) {
      racer.maxSampleReached = newSampleIdx;
    }
    racer.totalProgress = racer.lap - 1 + newSampleIdx / N;

    // Physical Wall Collision & Wall Slide (瞬間移動ゼロ！滑らかな法線反発と接線スライド)
    const offsetVec = racer.pos.clone().sub(sample.point);
    offsetVec.y = 0;
    const lateralDist = offsetVec.dot(sample.normal);
    const maxWallDist = this.trackWidth - 1.8;

    if (Math.abs(lateralDist) > maxWallDist) {
      const sign = Math.sign(lateralDist);
      const penetration = Math.abs(lateralDist) - maxWallDist;

      // Softly resolve penetration along normal
      racer.pos.addScaledVector(sample.normal, -sign * penetration);

      // Keep forward speed along track tangent (Wall Slide!)
      // The kart glides naturally along the track without stopping
      const tangentVel = Math.max(26, racer.speed * 0.97);
      racer.speed = THREE.MathUtils.lerp(racer.speed, tangentVel, dt * 5.0);

      // Smoothly guide heading parallel to track tangent
      const targetWallAngle = Math.atan2(sample.tangent.x, sample.tangent.z);
      racer.heading = THREE.MathUtils.lerp(racer.heading, targetWallAngle, dt * 3.5);

      this.spawnSparkBurst(racer.pos, 0xffaa00);
      if (racer.isPlayer) window.soundEngine.sfxWallHit();
    }

    racer.mesh.position.copy(racer.pos);
    const visualDriftYaw = racer.drifting ? racer.driftDir * 0.24 : 0;
    racer.mesh.rotation.y = racer.heading + visualDriftYaw;
  }

  // ==================== SLIPSTREAM (DRAFTING) SYSTEM ====================
  updateSlipstream(dt) {
    if (!this.player || this.state !== 'RACING') return;

    let inDraft = false;
    const pPos = this.player.pos;
    const pFwd = new THREE.Vector3(Math.sin(this.player.heading), 0, Math.cos(this.player.heading));

    for (const other of this.racers) {
      if (other === this.player || other.speed < 40) continue;

      const toOther = other.pos.clone().sub(pPos);
      toOther.y = 0;
      const forwardDist = toOther.dot(pFwd);
      const perpDist = Math.abs(toOther.cross(pFwd).y);

      // Directly behind rival between 8m and 35m, lateral distance < 3.2m
      if (forwardDist > 8 && forwardDist < 35 && perpDist < 3.2 && this.player.speed > 50) {
        inDraft = true;
        this.player.draftTarget = other;
        break;
      }
    }

    const banner = document.getElementById('slipstream-banner');
    if (inDraft) {
      this.player.draftTimer += dt;
      if (this.player.draftTimer > 1.3) {
        // Trigger Slipstream Super Boost!
        this.player.draftTimer = 0;
        this.triggerBoost(this.player, 2.5, 32);
        window.soundEngine.sfxSlipstream();
        if (banner) {
          banner.classList.remove('hidden');
          setTimeout(() => banner.classList.add('hidden'), 1500);
        }
        this.showTicker('💨 スリップストリーム急加速発動！！ライバルを一気に追い抜け！');
      }
    } else {
      this.player.draftTimer = Math.max(0, this.player.draftTimer - dt * 2.0);
    }
  }

  // ==================== RACER COLLISIONS & ITEM DRAG GUARD ====================
  updateRacerCollisions() {
    const isStartPhase = this.raceTime < 4.0; // スタート後4秒間はカート同士の挟まり・動かなくなるバグを完全防止するソフトコリジョン
    for (let i = 0; i < this.racers.length; i++) {
      for (let j = i + 1; j < this.racers.length; j++) {
        const a = this.racers[i];
        const b = this.racers[j];
        const dx = b.pos.x - a.pos.x;
        const dz = b.pos.z - a.pos.z;
        const distSq = dx * dx + dz * dz;
        const minDist = isStartPhase ? 2.6 : 3.2;

        if (distSq < minDist * minDist && distSq > 0.001) {
          const dist = Math.sqrt(distSq);
          const nx = dx / dist;
          const nz = dz / dist;
          const overlap = (minDist - dist) * (isStartPhase ? 0.15 : 0.35);

          if ((a.starTimer > 0 || a.bulletTimer > 0) && b.starTimer <= 0) {
            this.hitRacer(b, 'スター体当たり');
            b.pos.x += nx * 6;
            b.pos.z += nz * 6;
            continue;
          }
          if ((b.starTimer > 0 || b.bulletTimer > 0) && a.starTimer <= 0) {
            this.hitRacer(a, 'スター体当たり');
            a.pos.x -= nx * 6;
            a.pos.z -= nz * 6;
            continue;
          }

          if (a.antiGravityTimer > 0 || b.antiGravityTimer > 0) {
            this.triggerBoost(a, 0.9, 18);
            this.triggerBoost(b, 0.9, 18);
          }

          // 安定したソフト分離（挟まり・スタック・振動を完全に解消）
          a.pos.x -= nx * overlap * 0.5;
          a.pos.z -= nz * overlap * 0.5;
          b.pos.x += nx * overlap * 0.5;
          b.pos.z += nz * overlap * 0.5;
        }
      }
    }
  }

  // ==================== PROJECTILES & ITEM GUARD DEFENSE ====================
  updateProjectiles(dt) {
    let incomingThreat = false;

    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const p = this.projectiles[i];
      p.life -= dt;
      if (p.life <= 0) {
        this.worldGroup.remove(p.mesh);
        this.projectiles.splice(i, 1);
        continue;
      }

      if (p.type === 'BANANA') {
        if (!p.grounded) {
          p.pos.addScaledVector(p.vel, dt);
          p.pos.y += p.velY * dt;
          p.velY -= 55 * dt;
          if (p.pos.y <= 0) {
            p.pos.y = 0;
            p.vel.set(0, 0, 0);
            p.grounded = true;
          }
          p.mesh.position.copy(p.pos);
        }
        p.mesh.rotation.y += dt * 2.5;
      } else if (p.type === 'BOB_OMB') {
        if (p.pos.y > 0 || p.velY > 0) {
          p.pos.addScaledVector(p.vel, dt);
          p.pos.y += p.velY * dt;
          p.velY -= 52 * dt;
          if (p.pos.y <= 1.0) {
            p.pos.y = 1.0;
            p.vel.multiplyScalar(0.2);
            p.velY = 0;
          }
        }
        p.mesh.position.copy(p.pos);
        p.fuseTimer -= dt;
        const pulse = 1 + Math.sin(performance.now() * 0.03) * 0.25;
        p.mesh.scale.set(pulse, pulse, pulse);

        if (p.fuseTimer <= 0) {
          this.explodeBobOmb(p.pos);
          this.worldGroup.remove(p.mesh);
          this.projectiles.splice(i, 1);
          continue;
        }
      } else if (p.type === 'BLACK_HOLE') {
        p.mesh.rotation.y += dt * 5;
        p.mesh.rotation.x += dt * 3;
        this.racers.forEach((r) => {
          if (r === p.owner) return;
          const dist = r.pos.distanceTo(p.pos);
          if (dist < p.radius && dist > 1.0) {
            const pull = p.pos.clone().sub(r.pos).normalize();
            r.pos.addScaledVector(pull, dt * 38);
            if (dist < 4.5) this.hitRacer(r, 'ブラックホール重力波');
          }
        });
        continue;
      } else if (p.type.includes('SHELL')) {
        if (p.type === 'RED_SHELL' || p.type === 'SPINY_SHELL') {
          let target = null;
          if (p.type === 'SPINY_SHELL') {
            target = this.racers.find((r) => r.rank === 1) || this.racers[0];
          } else {
            const targetRank = Math.max(1, p.owner.rank - 1);
            target = this.racers.find((r) => r.rank === targetRank && r !== p.owner);
          }

          if (target) {
            if (target.isPlayer && target.pos.distanceTo(p.pos) < 95) {
              incomingThreat = true;
            }
            const toTarget = target.pos.clone().sub(p.pos);
            toTarget.y = 0;
            if (toTarget.lengthSq() < 1800) {
              toTarget.normalize();
              p.vel.lerp(toTarget.multiplyScalar(p.speed), dt * 6.5);
            } else {
              p.sampleIdx = this.findClosestTrackSample(p.pos, p.sampleIdx);
              const nextS = this.trackSamples[(p.sampleIdx + 7) % this.trackSamples.length];
              const dir = nextS.point.clone().sub(p.pos).normalize();
              p.vel.lerp(dir.multiplyScalar(p.speed), dt * 8.0);
            }
          }
        }

        p.pos.addScaledVector(p.vel, dt);
        p.mesh.position.copy(p.pos);
        p.mesh.rotation.y += dt * 12;

        // Wall Bounce Ricochet Physics for Shells!
        p.sampleIdx = this.findClosestTrackSample(p.pos, p.sampleIdx);
        const s = this.trackSamples[p.sampleIdx];
        const offset = p.pos.clone().sub(s.point);
        offset.y = 0;
        const lat = offset.dot(s.normal);
        const wallLimit = this.trackWidth - 1.5;

        if (Math.abs(lat) > wallLimit) {
          const sign = Math.sign(lat);
          const clamped = s.point.clone().addScaledVector(s.normal, sign * wallLimit);
          p.pos.x = clamped.x;
          p.pos.z = clamped.z;

          const dotN = p.vel.dot(s.normal);
          p.vel.addScaledVector(s.normal, -2 * dotN);
          p.bouncesLeft--;
          this.spawnSparkBurst(p.pos, 0x00ff66);

          if (p.bouncesLeft <= 0) {
            this.worldGroup.remove(p.mesh);
            this.projectiles.splice(i, 1);
            continue;
          }
        }
      }

      // Check collision against racers & Item Drag Guard Defenses!
      let hitSomeone = false;
      for (const r of this.racers) {
        if (r === p.owner && p.life > (p.type === 'BANANA' ? 34.4 : 17.5)) continue;

        // AUTHENTIC ITEM GUARD DEFENSE:
        // If racer is dragging an item behind (isHoldingItem === true), check collision with held item first!
        if (r.isHoldingItem && r.itemSlot1) {
          const heldPos = r.pos.clone().add(
            new THREE.Vector3(-Math.sin(r.heading) * 3.2, 0.8, -Math.cos(r.heading) * 3.2)
          );
          if (heldPos.distanceTo(p.pos) < p.radius + 1.6) {
            // Guard success! Block the incoming shell/banana!
            window.soundEngine.sfxGuardBlock();
            this.spawnExplosionVisual(heldPos, 0xffaa00, 8);
            r.isHoldingItem = false;
            r.itemSlot1 = r.itemSlot2;
            r.itemSlot2 = null;
            this.updateHeldItemVisual(r);
            if (r.isPlayer) {
              this.showTicker('🛡️ アイテムガード成功！！後方からのこうらを完全防御！');
              this.updateItemHUD();
            }
            hitSomeone = true;
            break;
          }
        }

        const dist = r.pos.distanceTo(p.pos);
        if (dist < p.radius + 1.8) {
          if (p.type === 'BOB_OMB' || p.type === 'SPINY_SHELL') {
            this.explodeBobOmb(p.pos);
          } else {
            this.hitRacer(r, window.GAME_DATA.items[p.type]?.name || p.type);
          }
          hitSomeone = true;
          break;
        }
      }

      if (hitSomeone) {
        this.worldGroup.remove(p.mesh);
        this.projectiles.splice(i, 1);
      }
    }

    const warnEl = document.getElementById('warning-banner');
    if (warnEl) {
      warnEl.classList.toggle('hidden', !incomingThreat || this.state !== 'RACING');
    }
  }

  explodeBobOmb(centerPos) {
    window.soundEngine.sfxExplosion();
    this.spawnExplosionVisual(centerPos, 0xff5500, 16);
    this.racers.forEach((r) => {
      if (r.pos.distanceTo(centerPos) < 17.5) {
        this.hitRacer(r, '大爆発');
        r.velY = 18;
      }
    });
  }

  updateGimmicksAndPickups(dt, elapsed) {
    // 1. Question Mark Item Boxes (Authentic Hit -> Shatter -> Roulette)
    this.itemBoxes.forEach((box) => {
      if (!box.active) {
        box.respawnTimer -= dt;
        if (box.respawnTimer <= 0) {
          box.active = true;
          box.mesh.visible = true;
        }
        return;
      }
      box.mesh.rotation.y += dt * 2.5;
      box.mesh.rotation.x += dt * 1.6;
      box.mesh.position.y = box.basePos.y + Math.sin(elapsed * 3.2 + box.basePos.x) * 0.45;

      for (const r of this.racers) {
        if (r.pos.distanceTo(box.basePos) < 4.0) {
          box.active = false;
          box.mesh.visible = false;
          box.respawnTimer = 2.8;
          this.triggerItemBoxHit(r, box.isDouble);
          this.spawnSparkBurst(box.basePos, box.isDouble ? 0x00f2ff : 0xffe600);
          break;
        }
      }
    });

    // 2. Track Coins
    this.coinPickups.forEach((coin) => {
      if (!coin.active) {
        coin.respawnTimer -= dt;
        if (coin.respawnTimer <= 0) {
          coin.active = true;
          coin.mesh.visible = true;
        }
        return;
      }
      coin.mesh.rotation.y += dt * 4.0;
      for (const r of this.racers) {
        if (r.pos.distanceTo(coin.pos) < 3.0) {
          coin.active = false;
          coin.mesh.visible = false;
          coin.respawnTimer = 6.0;
          r.coins = Math.min(10, r.coins + 1);
          r.overdriveGauge = Math.min(100, r.overdriveGauge + 8);
          if (r.isPlayer) window.soundEngine.sfxCoin();
          break;
        }
      }
    });

    // 3. Dropped Coins (Bounce and can be recollected)
    for (let i = this.droppedCoins.length - 1; i >= 0; i--) {
      const c = this.droppedCoins[i];
      c.life -= dt;
      if (c.life <= 0) {
        this.worldGroup.remove(c.mesh);
        this.droppedCoins.splice(i, 1);
        continue;
      }

      c.pos.x += c.velX * dt;
      c.pos.z += c.velZ * dt;
      c.velX *= 0.94;
      c.velZ *= 0.94;

      if (c.pos.y > 0.5 || c.velY > 0) {
        c.pos.y += c.velY * dt;
        c.velY -= 38 * dt;
        if (c.pos.y <= 0.5) {
          c.pos.y = 0.5;
          c.velY = -c.velY * 0.5;
        }
      }
      c.mesh.rotation.y += dt * 5.0;

      // Check pickup
      for (const r of this.racers) {
        if (r.pos.distanceTo(c.pos) < 3.0) {
          r.coins = Math.min(10, r.coins + 1);
          if (r.isPlayer) window.soundEngine.sfxCoin();
          this.worldGroup.remove(c.mesh);
          this.droppedCoins.splice(i, 1);
          break;
        }
      }
    }

    // 4. Course Gimmicks
    this.gimmicks.forEach((g) => {
      if (g.type === 'BOOST_PAD') {
        this.racers.forEach((r) => {
          if (r.pos.distanceTo(g.pos) < g.radius) {
            if (r.boostTimer < 0.3 && r.isPlayer) window.soundEngine.sfxBoost();
            this.triggerBoost(r, 1.1, 28);
          }
        });
      } else if (g.type === 'JUMP_RAMP') {
        this.racers.forEach((r) => {
          if (r.pos.distanceTo(g.pos) < g.radius && r.pos.y < 1.5) {
            r.velY = 26;
            this.triggerBoost(r, 1.4, 26);
            if (r.isPlayer) {
              window.soundEngine.sfxBoost();
            }
          }
        });
      } else if (g.type === 'THWOMP') {
        const cycle = (elapsed + g.phase) % 4.2;
        let y = 17;
        if (cycle < 2.2) {
          y = 17 + Math.sin(elapsed * 14) * 0.3;
          g.isDown = false;
        } else if (cycle < 2.45) {
          const p = (cycle - 2.2) / 0.25;
          y = 17 * (1 - p) + 5.8 * p;
          if (!g.isDown && p > 0.85) {
            g.isDown = true;
            this.spawnSparkBurst(g.pos, 0xffaa00);
          }
        } else if (cycle < 3.2) {
          y = 5.8;
          g.isDown = true;
        } else {
          const p = (cycle - 3.2) / 1.0;
          y = 5.8 + p * 11.2;
          g.isDown = false;
        }
        g.mesh.position.y = y;

        if (y < 8.8) {
          this.racers.forEach((r) => {
            if (r.pos.distanceTo(g.pos) < g.radius) {
              r.flattenedTimer = 3.2;
              this.hitRacer(r, 'ドッスン踏み潰し');
            }
          });
        }
      } else if (g.type === 'FIREBAR') {
        g.angle += g.speed * dt;
        g.mesh.rotation.y = g.angle;
        const barDir = new THREE.Vector3(Math.cos(-g.angle), 0, Math.sin(-g.angle));

        this.racers.forEach((r) => {
          const rel = r.pos.clone().sub(g.pos);
          rel.y = 0;
          const dist = rel.length();
          if (dist < g.armLength) {
            const proj = Math.abs(rel.dot(barDir));
            const perp = Math.sqrt(Math.max(0, dist * dist - proj * proj));
            if (perp < 2.2) {
              this.hitRacer(r, '回転ファイア＆レーザー');
            }
          }
        });
      } else if (g.type === 'SPIN_BOOSTER') {
        g.mesh.rotation.y += dt * 4.5;
        this.racers.forEach((r) => {
          if (r.pos.distanceTo(g.pos) < g.radius) {
            r.antiGravityTimer = 5.0;
            this.triggerBoost(r, 1.3, 30);
            if (r.isPlayer) {
              window.soundEngine.sfxGimmickSwitch();
              this.showTicker('🌀 反重力スピンターボ発動！！');
            }
          }
        });
      } else if (g.type === 'WARP_PORTAL') {
        g.mesh.rotation.z += dt * 3.5;
        this.racers.forEach((r) => {
          if (r.pos.distanceTo(g.pos) < g.radius) {
            r.pos.copy(g.exitPos);
            r.heading = g.exitAngle;
            r.sampleIdx = g.exitSampleIdx;
            r.maxSampleReached = Math.max(r.maxSampleReached, g.exitSampleIdx);
            this.triggerBoost(r, 1.8, 35);
            if (r.isPlayer) {
              window.soundEngine.sfxGimmickSwitch();
              this.showTicker('🌌 ハイパーワープゲート通過！コース前方へ瞬間移動！！');
            }
          }
        });
      }
    });
  }

  spawnSparkBurst(pos, colorHex = 0xffaa00) {
    const mesh = new THREE.Mesh(
      new THREE.RingGeometry(0.6, 3.2, 12),
      new THREE.MeshBasicMaterial({ color: colorHex, side: THREE.DoubleSide, transparent: true, opacity: 0.9 })
    );
    mesh.position.set(pos.x, 1.2, pos.z);
    mesh.rotation.x = -Math.PI / 2;
    this.worldGroup.add(mesh);
    this.particles.push({ mesh, life: 0.35, maxLife: 0.35, maxScale: 3.0 });
  }

  spawnExplosionVisual(pos, colorHex = 0xff4400, radius = 14) {
    const mesh = new THREE.Mesh(
      new THREE.SphereGeometry(1, 16, 16),
      new THREE.MeshBasicMaterial({ color: colorHex, transparent: true, opacity: 0.85 })
    );
    mesh.position.set(pos.x, 2.0, pos.z);
    this.worldGroup.add(mesh);
    this.particles.push({ mesh, life: 0.55, maxLife: 0.55, maxScale: radius });
  }

  updateParticles(dt) {
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.life -= dt;
      if (p.life <= 0) {
        this.worldGroup.remove(p.mesh);
        this.particles.splice(i, 1);
        continue;
      }
      const progress = 1 - p.life / p.maxLife;
      const s = 1 + progress * p.maxScale;
      p.mesh.scale.set(s, s, s);
      p.mesh.material.opacity = (1 - progress) * 0.85;
    }
  }

  updateStandings() {
    const sorted = [...this.racers].sort((a, b) => {
      if (a.finished && b.finished) return a.finishTime - b.finishTime;
      if (a.finished) return -1;
      if (b.finished) return 1;
      return b.totalProgress - a.totalProgress;
    });
    sorted.forEach((r, idx) => {
      r.rank = idx + 1;
    });
    return sorted;
  }

  updateCamera(dt) {
    if (this.state === 'DEMO' || !this.player) {
      this.demoAngle += dt * 0.25;
      const lead = this.racers[0];
      if (lead) {
        const camPos = lead.pos.clone().add(
          new THREE.Vector3(Math.cos(this.demoAngle) * 30, 15, Math.sin(this.demoAngle) * 30)
        );
        this.camera.position.lerp(camPos, dt * 4);
        this.camera.lookAt(lead.pos.x, lead.pos.y + 2.5, lead.pos.z);
      }
      return;
    }

    const lookBack = Boolean(this.keys['KeyR']);
    const dirSign = lookBack ? 1 : -1;
    const dist = this.player.boostTimer > 0 ? 15.5 : 13.8;
    const height = 5.6;

    // Smooth camera heading angle (Spring-damper delayed rotation - feels like authentic Mario Kart 8DX camera)
    if (this.cameraHeading === undefined) {
      this.cameraHeading = this.player.heading;
    }
    let diff = this.player.heading - this.cameraHeading;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    this.cameraHeading += diff * Math.min(1.0, dt * 7.5);

    const targetCamPos = new THREE.Vector3(
      this.player.pos.x + Math.sin(this.cameraHeading) * dist * dirSign,
      this.player.pos.y + height,
      this.player.pos.z + Math.cos(this.cameraHeading) * dist * dirSign
    );
    this.camera.position.lerp(targetCamPos, dt * 11);

    const lookAtPos = new THREE.Vector3(
      this.player.pos.x + Math.sin(this.player.heading) * (-dirSign * 11),
      this.player.pos.y + 2.2,
      this.player.pos.z + Math.cos(this.player.heading) * (-dirSign * 11)
    );
    this.camera.lookAt(lookAtPos);

    const targetFov = this.player.boostTimer > 0 || this.player.overdriveTimer > 0 ? 76 : 64;
    this.camera.fov = THREE.MathUtils.lerp(this.camera.fov, targetFov, dt * 6);
    this.camera.updateProjectionMatrix();
  }

  // ==================== HUD UPDATES: DOUBLE ITEM SLOTS & STATS ====================
  updateItemHUD() {
    if (!this.player) return;

    const frame1 = document.getElementById('hud-frame-1');
    const icon1 = document.getElementById('hud-item-icon-1');
    const count1 = document.getElementById('hud-item-count-1');
    const name1 = document.getElementById('hud-item-name-1');

    const frame2 = document.getElementById('hud-frame-2');
    const icon2 = document.getElementById('hud-item-icon-2');
    const count2 = document.getElementById('hud-item-count-2');
    const guardBadge = document.getElementById('hud-guard-badge');

    const icons = ['🍌', '🟢', '🔴', '🍄', '💣', '⭐', '⚡', '🌌'];

    // Slot 1
    if (this.player.rouletteTimer1 > 0) {
      frame1.classList.add('roulette');
      icon1.classList.remove('empty');
      icon1.textContent = icons[Math.floor(performance.now() / 60) % icons.length];
      count1.classList.add('hidden');
      name1.classList.remove('hidden');
      name1.textContent = 'ルーレット回転中...';
    } else if (this.player.itemSlot1) {
      frame1.classList.remove('roulette');
      icon1.classList.remove('empty');
      icon1.textContent = this.player.itemSlot1.def.icon;
      name1.classList.remove('hidden');
      name1.textContent = this.player.itemSlot1.def.name;
      if (this.player.itemSlot1.usesLeft > 1 && this.player.itemSlot1.usesLeft < 50) {
        count1.textContent = `×${this.player.itemSlot1.usesLeft}`;
        count1.classList.remove('hidden');
      } else {
        count1.classList.add('hidden');
      }
    } else {
      frame1.classList.remove('roulette');
      icon1.classList.add('empty');
      icon1.textContent = '';
      count1.classList.add('hidden');
      name1.classList.add('hidden');
    }

    // Slot 2 (Reserve Item)
    if (this.player.rouletteTimer2 > 0) {
      frame2.classList.add('roulette');
      icon2.classList.remove('empty');
      icon2.textContent = icons[Math.floor((performance.now() + 100) / 60) % icons.length];
      count2.classList.add('hidden');
    } else if (this.player.itemSlot2) {
      frame2.classList.remove('roulette');
      icon2.classList.remove('empty');
      icon2.textContent = this.player.itemSlot2.def.icon;
      if (this.player.itemSlot2.usesLeft > 1 && this.player.itemSlot2.usesLeft < 50) {
        count2.textContent = `×${this.player.itemSlot2.usesLeft}`;
        count2.classList.remove('hidden');
      } else {
        count2.classList.add('hidden');
      }
    } else {
      frame2.classList.remove('roulette');
      icon2.classList.add('empty');
      icon2.textContent = '';
      count2.classList.add('hidden');
    }

    // Guard Badge (Item holding behind)
    if (guardBadge) {
      guardBadge.classList.toggle('hidden', !this.player.isHoldingItem);
    }
  }

  updateHUD(sortedRacers) {
    if (!this.player) return;
    if (this.player.rouletteTimer1 > 0 || this.player.rouletteTimer2 > 0) {
      this.updateItemHUD();
    }

    document.getElementById('hud-lap').textContent = `${Math.min(this.player.lap, this.totalLaps)} / ${this.totalLaps}`;
    const mins = Math.floor(this.raceTime / 60);
    const secs = (this.raceTime % 60).toFixed(2).padStart(5, '0');
    document.getElementById('hud-time').textContent = `${String(mins).padStart(2, '0')}:${secs}`;

    const rNum = this.player.rank;
    const suffixes = ['st', 'nd', 'rd', 'th', 'th', 'th', 'th', 'th'];
    document.getElementById('hud-rank-num').textContent = rNum;
    document.getElementById('hud-rank-suffix').textContent = suffixes[rNum - 1] || 'th';
    document.getElementById('hud-speed-num').textContent = Math.round(Math.abs(this.player.speed) * 1.45);
    document.getElementById('hud-coins').textContent = String(this.player.coins).padStart(2, '0');

    const odPct = Math.round(this.player.overdriveGauge);
    document.getElementById('hud-od-pct').textContent = `${odPct}%`;
    document.getElementById('hud-od-fill').style.width = `${odPct}%`;

    const driftEl = document.getElementById('hud-drift-status');
    if (this.player.drifting) {
      const labels = ['ドリフト中...', '🔵 ミニターボ OK!', '🟠 スーパーミニターボ OK!!', '🟣 ウルトラミニターボ MAX!!!'];
      driftEl.textContent = labels[this.player.driftLevel];
    } else if (this.player.overdriveGauge >= 100) {
      driftEl.textContent = '⚡ Eキーで必殺オーバードライブ発動可能！！';
    } else {
      driftEl.textContent = 'DRIFT: Shift / Ctrl キーを押しながらコーナーへ';
    }

    const fx = document.getElementById('fx-overlay');
    fx.className = '';
    if (this.player.overdriveTimer > 0) fx.classList.add('overdrive-fx');
    else if (this.player.starTimer > 0) fx.classList.add('star-fx');
    else if (this.player.boostTimer > 0) fx.classList.add('boost-fx');

    const listEl = document.getElementById('hud-standings-list');
    listEl.innerHTML = sortedRacers
      .map(
        (r) => `
      <div class="standing-row ${r.isPlayer ? 'is-player' : ''}">
        <span>${r.rank}. ${r.shortName}</span>
        <span>${r.itemSlot1 ? r.itemSlot1.def.icon : ''}${r.itemSlot2 ? r.itemSlot2.def.icon : ''} 🪙${r.coins}</span>
      </div>
    `
      )
      .join('');

    this.drawMinimap();
  }

  drawMinimap() {
    const ctx = this.minimapCtx;
    const W = this.minimapCanvas.width;
    const H = this.minimapCanvas.height;
    ctx.clearRect(0, 0, W, H);

    const scale = 0.22;
    const cx = W / 2;
    const cy = H / 2;

    ctx.strokeStyle = 'rgba(255,255,255,0.4)';
    ctx.lineWidth = 7;
    ctx.beginPath();
    this.trackSamples.forEach((s, i) => {
      const x = cx + s.point.x * scale;
      const y = cy + s.point.z * scale;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.closePath();
    ctx.stroke();

    this.projectiles.forEach((p) => {
      ctx.fillStyle = p.type.includes('RED') ? '#ff2222' : p.type.includes('GREEN') ? '#00ff55' : '#ffe600';
      ctx.beginPath();
      ctx.arc(cx + p.pos.x * scale, cy + p.pos.z * scale, 2.5, 0, Math.PI * 2);
      ctx.fill();
    });

    this.racers.forEach((r) => {
      const x = cx + r.pos.x * scale;
      const y = cy + r.pos.z * scale;
      ctx.fillStyle = r.isPlayer ? '#ffe600' : `#${r.driverData.color.toString(16).padStart(6, '0')}`;
      ctx.beginPath();
      ctx.arc(x, y, r.isPlayer ? 5.2 : 3.6, 0, Math.PI * 2);
      ctx.fill();
      if (r.isPlayer) {
        ctx.strokeStyle = '#000';
        ctx.lineWidth = 1.5;
        ctx.stroke();
      }
    });
  }

  beginRace() {
    this.loadCourse(this.selectedCourseIdx, false);
    this.spawnRacers(false);
    this.raceTime = 0;
    this.state = 'COUNTDOWN';
    this.countdownStep = 3;
    this.countdownTimer = 0.95;
    this.rocketCharge = 0;

    if (this.player) {
      this.camera.position.set(
        this.player.pos.x - Math.sin(this.player.heading) * 15,
        this.player.pos.y + 7,
        this.player.pos.z - Math.cos(this.player.heading) * 15
      );
      this.camera.lookAt(this.player.pos.x, this.player.pos.y + 2.5, this.player.pos.z);
    }

    const banner = document.getElementById('countdown-banner');
    banner.textContent = '3';
    banner.classList.remove('hidden');
    window.soundEngine.sfxCountdown(3);
    this.updateItemHUD();
    this.updateHUD(this.updateStandings());
  }

  animate() {
    requestAnimationFrame(this.animate);
    const dt = Math.min(this.clock.getDelta(), 0.05);
    const elapsed = this.clock.getElapsedTime();
    this.frameCount++;

    if (this.state === 'COUNTDOWN') {
      if (this.countdownStep <= 2 && (this.keys['KeyW'] || this.keys['ArrowUp'])) {
        this.rocketCharge += dt;
      }
      this.countdownTimer -= dt;
      if (this.countdownTimer <= 0) {
        this.countdownStep--;
        const banner = document.getElementById('countdown-banner');
        if (this.countdownStep > 0) {
          banner.textContent = String(this.countdownStep);
          this.countdownTimer = 0.9;
          window.soundEngine.sfxCountdown(this.countdownStep);
        } else {
          banner.textContent = 'GO!!';
          window.soundEngine.sfxCountdown(0);
          window.soundEngine.startBGM('race');
          this.state = 'RACING';

          if (this.player && this.rocketCharge > 0.35 && this.rocketCharge < 1.45) {
            this.triggerBoost(this.player, 1.6, 32);
            window.soundEngine.sfxBoost();
            this.showTicker('🚀 ロケットスタート大成功！！');
          } else if (this.player && this.rocketCharge >= 1.45) {
            // Authentic wheel spin without flipping or spinning sideways!
            this.player.wheelSpinTimer = 0.85;
            this.showTicker('💨 タイヤ空回り！(長押しが早すぎました)');
            window.soundEngine.sfxSpinOut();
          }
          setTimeout(() => banner.classList.add('hidden'), 900);
        }
      }
      this.updateCamera(dt);
      this.renderer.render(this.scene, this.camera);
      return;
    }

    if (this.state === 'RACING' || this.state === 'DEMO' || this.state === 'FINISHED') {
      if (this.state === 'RACING') {
        this.raceTime += dt;
      }

      this.racers.forEach((r) => this.updateRacerPhysics(r, dt));
      this.updateSlipstream(dt);
      this.updateRacerCollisions();
      this.updateProjectiles(dt);
      this.updateGimmicksAndPickups(dt, elapsed);
      this.updateParticles(dt);

      const sorted = this.updateStandings();
      this.updateCamera(dt);

      if (this.state === 'RACING' && this.player) {
        this.updateHUD(sorted);
        const isAccel = (this.keys['KeyW'] || this.keys['ArrowUp']) && this.player.wheelSpinTimer <= 0;
        window.soundEngine.updateEngine(
          this.player.speed / this.player.maxSpeed,
          this.player.drifting,
          this.player.boostTimer > 0,
          true,
          isAccel
        );
      } else {
        window.soundEngine.updateEngine(0, false, false, false, false);
      }
    }

    this.renderer.render(this.scene, this.camera);
  }
}

// ==================== UI SCREEN FLOW CONTROLLER ====================
class UIFlowController {
  constructor(game) {
    this.game = game;
    this.initSelectScreens();

    this.bootTimer = setTimeout(() => {
      this.skipBoot();
    }, 1400);
  }

  skipBoot() {
    if (this.bootTimer) {
      clearTimeout(this.bootTimer);
      this.bootTimer = null;
    }
    if (document.getElementById('screen-boot').classList.contains('active')) {
      this.showScreen('screen-title');
    }
  }

  showScreen(screenId) {
    document.querySelectorAll('.screen').forEach((s) => s.classList.remove('active'));
    const target = document.getElementById(screenId);
    if (target) target.classList.add('active');
  }

  openMainMenu() {
    window.soundEngine.sfxSelect();
    window.soundEngine.startBGM('menu');
    document.getElementById('press-start-prompt').classList.add('hidden');
    document.getElementById('title-mode-menu').classList.remove('hidden');
  }

  selectMode(mode) {
    window.soundEngine.sfxSelect();
    this.game.selectedMode = mode;
    if (mode === 'mayhem') {
      this.game.ccClass = 200;
      document.getElementById('cc-select').value = '200';
      document.getElementById('selected-mode-pill').textContent = '💥 200cc カオスアイテム大乱闘';
    } else if (mode === 'tt') {
      this.game.ccClass = 150;
      document.getElementById('selected-mode-pill').textContent = '⏱️ 150cc タイムアタック';
    } else {
      this.game.ccClass = 150;
      document.getElementById('selected-mode-pill').textContent = '🏆 150cc グランプリ GX';
    }
    this.showScreen('screen-select');
  }

  initSelectScreens() {
    this.renderDriverGrid();
    this.renderKartList();
    this.renderCourseCards();
  }

  renderDriverGrid() {
    const grid = document.getElementById('driver-grid');
    grid.innerHTML = window.GAME_DATA.drivers
      .map((d, idx) => {
        const hex = `#${d.color.toString(16).padStart(6, '0')}`;
        return `
        <div class="driver-card ${idx === this.game.selectedDriverIdx ? 'selected' : ''}"
             onclick="window.uiFlow.pickDriver(${idx})">
          <div class="driver-avatar" style="background:${hex}">${d.name[0]}</div>
          <div class="driver-card-name">${d.name.split(' ')[0]}</div>
          <div class="driver-card-sub">${d.title}</div>
        </div>
      `;
      })
      .join('');
    this.updateDriverStatsPreview();
  }

  pickDriver(idx) {
    window.soundEngine.sfxSelect();
    this.game.selectedDriverIdx = idx;
    this.renderDriverGrid();
  }

  renderKartList() {
    const list = document.getElementById('kart-list');
    list.innerHTML = window.GAME_DATA.karts
      .map(
        (k, idx) => `
      <div class="kart-item ${idx === this.game.selectedKartIdx ? 'selected' : ''}"
           onclick="window.uiFlow.pickKart(${idx})">
        🏎️ ${k.name}
      </div>
    `
      )
      .join('');
  }

  pickKart(idx) {
    window.soundEngine.sfxSelect();
    this.game.selectedKartIdx = idx;
    this.renderKartList();
    this.updateDriverStatsPreview();
  }

  updateDriverStatsPreview() {
    const d = window.GAME_DATA.drivers[this.game.selectedDriverIdx];
    const k = window.GAME_DATA.karts[this.game.selectedKartIdx];
    document.getElementById('preview-driver-name').textContent = d.name;
    document.getElementById('preview-driver-title').textContent = d.title;
    document.getElementById('preview-driver-desc').textContent = d.desc;
    document.getElementById('preview-special-name').textContent = d.specialName;

    const pct = (val) => `${Math.min(100, Math.max(15, (val / 6) * 100))}%`;
    document.getElementById('stat-speed').style.width = pct(d.stats.speed + k.bodyMod.speed);
    document.getElementById('stat-accel').style.width = pct(d.stats.accel + k.bodyMod.accel);
    document.getElementById('stat-weight').style.width = pct(d.stats.weight);
    document.getElementById('stat-handling').style.width = pct(d.stats.handling + k.bodyMod.handling);
    document.getElementById('stat-drift').style.width = pct(d.stats.drift + k.bodyMod.drift);
  }

  renderCourseCards() {
    const container = document.getElementById('course-cards-container');
    container.innerHTML = window.GAME_DATA.courses
      .map(
        (c, idx) => `
      <div class="course-card ${idx === this.game.selectedCourseIdx ? 'selected' : ''}"
           onclick="window.uiFlow.pickCourse(${idx})">
        <div>
          <span class="cup-tag" style="background:${c.themeColor}">${c.cupName}</span>
          <div class="course-title">${c.name}</div>
          <div class="course-sub">${c.subTitle}</div>
        </div>
        <div class="course-gimmick-box">
          <strong>🌟 コースギミック:</strong><br/>
          ${c.gimmickSummary}
        </div>
      </div>
    `
      )
      .join('');
  }

  pickCourse(idx) {
    window.soundEngine.sfxSelect();
    this.game.selectedCourseIdx = idx;
    this.renderCourseCards();
    this.game.loadCourse(idx, true);
    this.game.spawnRacers(true);
  }

  changeCC(val) {
    this.game.ccClass = Number(val);
    window.soundEngine.sfxSelect();
  }

  goToCourseSelect() {
    window.soundEngine.sfxSelect();
    this.showScreen('screen-course');
  }

  backToCharSelect() {
    window.soundEngine.sfxBack();
    document.getElementById('modal-pause').classList.add('hidden');
    document.getElementById('modal-results').classList.add('hidden');
    this.game.state = 'DEMO';
    window.soundEngine.startBGM('menu');
    this.showScreen('screen-select');
  }

  backToTitle() {
    window.soundEngine.sfxBack();
    document.getElementById('modal-pause').classList.add('hidden');
    document.getElementById('modal-results').classList.add('hidden');
    this.game.state = 'DEMO';
    window.soundEngine.startBGM('menu');
    this.showScreen('screen-title');
  }

  startRaceNow() {
    window.soundEngine.sfxSelect();
    this.game.franticItems = document.getElementById('opt-frantic-items').checked;
    this.game.extraGimmicks = document.getElementById('opt-extra-gimmicks').checked;
    document.getElementById('modal-pause').classList.add('hidden');
    document.getElementById('modal-results').classList.add('hidden');
    this.showScreen('screen-hud');
    this.game.beginRace();
  }

  togglePause() {
    const modal = document.getElementById('modal-pause');
    if (this.game.state === 'RACING') {
      this.game.state = 'PAUSED';
      modal.classList.remove('hidden');
      window.soundEngine.updateEngine(0, false, false, false);
    } else if (this.game.state === 'PAUSED') {
      this.game.state = 'RACING';
      modal.classList.add('hidden');
    }
  }

  restartRace() {
    window.soundEngine.sfxSelect();
    document.getElementById('modal-pause').classList.add('hidden');
    document.getElementById('modal-results').classList.add('hidden');
    this.showScreen('screen-hud');
    this.game.beginRace();
  }

  nextCourse() {
    this.game.selectedCourseIdx = (this.game.selectedCourseIdx + 1) % window.GAME_DATA.courses.length;
    this.renderCourseCards();
    this.restartRace();
  }

  showResultsScreen() {
    this.game.state = 'FINISHED';
    const sorted = this.game.updateStandings();
    const playerRank = this.game.player ? this.game.player.rank : 1;
    const course = window.GAME_DATA.courses[this.game.selectedCourseIdx];

    document.getElementById('res-headline').textContent =
      playerRank === 1 ? '🏆 FINISH!! 第1位 優勝おめでとう！！' : `🏁 FINISH!! 第${playerRank}位でゴール！`;
    document.getElementById('res-sub').textContent = `${course.name} (${this.game.ccClass}cc)`;

    const points = [15, 12, 10, 8, 7, 6, 5, 4];
    document.getElementById('results-table').innerHTML = sorted
      .map(
        (r, i) => `
      <div class="res-row ${r.isPlayer ? 'player' : ''}">
        <span>${i + 1}位</span>
        <span style="text-align:left">${r.name} ${r.isPlayer ? '(YOU)' : ''}</span>
        <span>🪙 ${r.coins}枚</span>
        <span>+${points[i] || 1} pt</span>
      </div>
    `
      )
      .join('');

    document.getElementById('modal-results').classList.remove('hidden');
  }

  toggleHowToPlay() {
    window.soundEngine.sfxSelect();
    document.getElementById('modal-help').classList.toggle('hidden');
  }

  quitApp() {
    if (ipcRenderer) ipcRenderer.send('quit-app');
    else window.close();
  }
}

window.addEventListener('DOMContentLoaded', () => {
  try {
    window.game = new KartGameEngine();
    window.uiFlow = new UIFlowController(window.game);

    if (ipcRenderer) {
      ipcRenderer.on('run-smoke-test', () => {
        setTimeout(() => {
          try {
            const titleActive = document.getElementById('screen-title').classList.contains('active');
            window.uiFlow.openMainMenu();
            window.uiFlow.selectMode('gp');
            window.uiFlow.pickDriver(0); // Mario
            window.uiFlow.goToCourseSelect();
            window.uiFlow.startRaceNow();

            // Hit item box to test roulette and item collection
            const box = window.game.itemBoxes[0];
            if (box && window.game.player) {
              window.game.triggerItemBoxHit(window.game.player, true);
            }

            // Force countdown to finish instantly for thorough race physics test
            window.game.countdownStep = 1;
            window.game.countdownTimer = 0.05;

            // Test inputs: throttle forward and steer right
            window.game.keys['KeyW'] = true;
            window.game.keys['KeyD'] = true;

            setTimeout(() => {
              // Verify player is driving forward in RACING state
              const player = window.game.player;
              const drivingForward = player && player.speed > 5;
              const notSideways = player && Math.abs(player.chassisGroup.rotation.y) < 0.1;

              // Test brake (no reverse)
              window.game.keys['KeyW'] = false;
              window.game.keys['KeyS'] = true;

              setTimeout(() => {
                const playerSpeed = window.game.player ? window.game.player.speed : 0;
                ipcRenderer.send('smoke-test-result', {
                  ok: true,
                  titleTransitioned: titleActive,
                  framesRendered: window.game.frameCount,
                  racersCount: window.game.racers.length,
                  playerSpeedNonNegative: playerSpeed >= 0,
                  state: window.game.state,
                  drivingForward,
                  notSideways
                });
              }, 400);
            }, 800);
          } catch (err) {
            ipcRenderer.send('smoke-test-result', { ok: false, error: err.stack || String(err) });
          }
        }, 1200);
      });
    }
  } catch (err) {
    console.error('FATAL INIT ERROR:', err);
    if (ipcRenderer) {
      ipcRenderer.send('smoke-test-result', { ok: false, error: err.stack || String(err) });
    }
  }
});
