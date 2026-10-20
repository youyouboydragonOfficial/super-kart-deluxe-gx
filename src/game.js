// SUPER KART DELUXE GX - Full 3D Mario Kart Engine + Original Gimmicks
// Built with Three.js (loaded reliably via Electron/Node require) + Custom Physics Engine

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
    this.camera = new THREE.PerspectiveCamera(65, window.innerWidth / window.innerHeight, 0.5, 2500);
    this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

    // State
    this.state = 'DEMO'; // DEMO, COUNTDOWN, RACING, PAUSED, FINISHED
    this.selectedMode = 'gp'; // gp, mayhem, tt
    this.selectedDriverIdx = 0;
    this.selectedKartIdx = 0;
    this.selectedCourseIdx = 0;
    this.ccClass = 150;
    this.franticItems = true;
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
    this.projectiles = []; // Shells, Bananas, Bob-ombs, BlackHoles
    this.gimmicks = []; // BoostPads, Ramps, Thwomps, Firebars, SpinBoosters, WarpPortals
    this.particles = [];

    // Timing
    this.clock = new THREE.Clock();
    this.raceTime = 0;
    this.countdownTimer = 0;
    this.countdownStep = 3;
    this.demoAngle = 0;
    this.frameCount = 0;

    // Input state
    this.keys = {};
    this.setupInputs();
    this.setupResize();

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

      if (this.state === 'RACING' && !wasDown && this.player) {
        // Forward item throw / use
        if (code === 'Space' || code === 'KeyZ') {
          e.preventDefault();
          const throwBackward = this.keys['ArrowDown'] || this.keys['KeyS'];
          this.useRacerItem(this.player, throwBackward ? -1 : 1);
        }
        // Dedicated backward place / throw (Banana behind or Shell backward)
        if (code === 'KeyX') {
          this.useRacerItem(this.player, -1);
        }
        // Original Overdrive Special Activation
        if (code === 'KeyE') {
          this.activateOverdrive(this.player);
        }
        // Instant Chaos Barrage (Original requested feature: throw massive bananas & shells everywhere!)
        if (code === 'KeyC') {
          this.spawnChaosWave();
        }
        // Instant Super Item Refill
        if (code === 'KeyV') {
          this.givePlayerSuperItem();
        }
      }
    });

    window.addEventListener('keyup', (e) => {
      this.keys[e.code] = false;
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

  // ==================== BUILD 3D COURSE & GIMMICKS ====================
  loadCourse(courseIdx, isDemo = false) {
    this.selectedCourseIdx = courseIdx;
    const course = window.GAME_DATA.courses[courseIdx];
    this.trackWidth = course.trackWidth;

    // Clear old world
    while (this.worldGroup.children.length > 0) {
      this.worldGroup.remove(this.worldGroup.children[0]);
    }
    this.itemBoxes = [];
    this.coinPickups = [];
    this.projectiles = [];
    this.gimmicks = [];
    this.particles = [];

    // Sky & Fog
    this.scene.background = new THREE.Color(course.skyTop);
    this.scene.fog = new THREE.FogExp2(course.skyBottom, 0.00085);

    // Lights
    const amb = new THREE.AmbientLight(0xffffff, 0.85);
    this.worldGroup.add(amb);

    const sun = new THREE.DirectionalLight(0xfff6e0, 1.3);
    sun.position.set(180, 320, 150);
    this.worldGroup.add(sun);

    // Ground Plane
    const groundGeo = new THREE.PlaneGeometry(3200, 3200);
    const groundMat = new THREE.MeshLambertMaterial({ color: course.groundColor });
    const ground = new THREE.Mesh(groundGeo, groundMat);
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.5;
    this.worldGroup.add(ground);

    // Build closed CatmullRom spline from course waypoints
    const pts = course.waypoints.map(([x, z]) => new THREE.Vector3(x, 0, z));
    this.trackCurve = new THREE.CatmullRomCurve3(pts, true, 'centripetal', 0.5);

    const sampleCount = 400;
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

      roadPositions.push(left.x, 0.05, left.z, right.x, 0.05, right.z);

      const c = rainbowMode
        ? new THREE.Color().setHSL(((i / N) * 4) % 1, 0.85, 0.48)
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

    const roadMat = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide });
    const roadMesh = new THREE.Mesh(roadGeo, roadMat);
    this.worldGroup.add(roadMesh);

    // Physical Curb Walls (Left & Right) so karts and shells bounce off walls!
    const wallBoxGeo = new THREE.BoxGeometry(2.6, 3.2, 8.5);
    const matA = new THREE.MeshLambertMaterial({ color: course.wallColorA });
    const matB = new THREE.MeshLambertMaterial({ color: course.wallColorB });

    for (let i = 0; i < N; i += 2) {
      const s = this.trackSamples[i];
      const angle = Math.atan2(s.tangent.x, s.tangent.z);
      const mat = (i / 2) % 2 === 0 ? matA : matB;

      const leftPos = s.point.clone().addScaledVector(s.normal, -(halfW + 1.3));
      const leftWall = new THREE.Mesh(wallBoxGeo, mat);
      leftWall.position.set(leftPos.x, 1.6, leftPos.z);
      leftWall.rotation.y = angle;
      this.worldGroup.add(leftWall);

      const rightPos = s.point.clone().addScaledVector(s.normal, halfW + 1.3);
      const rightWall = new THREE.Mesh(wallBoxGeo, mat);
      rightWall.position.set(rightPos.x, 1.6, rightPos.z);
      rightWall.rotation.y = angle;
      this.worldGroup.add(rightWall);
    }
  }

  buildStartGate(course) {
    const s0 = this.trackSamples[0];
    const angle = Math.atan2(s0.tangent.x, s0.tangent.z);
    const gateGroup = new THREE.Group();
    gateGroup.position.copy(s0.point);
    gateGroup.rotation.y = angle;

    // Checkerboard finish line strip
    const lineGeo = new THREE.PlaneGeometry(this.trackWidth * 2, 6.5);
    const lineMat = new THREE.MeshBasicMaterial({
      map: this.createCheckerTexture('#ffffff', '#111111', 8, 2),
      side: THREE.DoubleSide
    });
    const lineMesh = new THREE.Mesh(lineGeo, lineMat);
    lineMesh.rotation.x = -Math.PI / 2;
    lineMesh.position.y = 0.12;
    gateGroup.add(lineMesh);

    // Pillars
    const pillarGeo = new THREE.CylinderGeometry(1.6, 1.8, 20, 12);
    const pillarMat = new THREE.MeshLambertMaterial({ color: 0xe60012 });
    const leftP = new THREE.Mesh(pillarGeo, pillarMat);
    leftP.position.set(-this.trackWidth + 1, 10, 0);
    const rightP = new THREE.Mesh(pillarGeo, pillarMat);
    rightP.position.set(this.trackWidth - 1, 10, 0);
    gateGroup.add(leftP, rightP);

    // Top Banner
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
    // 8 Item Box clusters around the track (5 boxes per row = 40 Item Boxes!)
    const clusterIndices = [35, 85, 135, 185, 235, 285, 335, 375];
    const boxGeo = new THREE.OctahedronGeometry(2.3, 0);

    clusterIndices.forEach((idx) => {
      const s = this.trackSamples[idx % this.trackSamples.length];
      const offsets = [-18, -9, 0, 9, 18];
      offsets.forEach((off, j) => {
        const pos = s.point.clone().addScaledVector(s.normal, off);
        pos.y = 2.8;
        const hue = (j * 0.2) % 1;
        const mat = new THREE.MeshPhongMaterial({
          color: new THREE.Color().setHSL(hue, 0.95, 0.6),
          emissive: new THREE.Color().setHSL(hue, 0.8, 0.25),
          transparent: true,
          opacity: 0.92
        });
        const mesh = new THREE.Mesh(boxGeo, mat);
        mesh.position.copy(pos);
        this.worldGroup.add(mesh);

        this.itemBoxes.push({
          mesh,
          basePos: pos.clone(),
          active: true,
          respawnTimer: 0,
          isChaosDouble: j === 2
        });
      });
    });

    // Coins along racing lines
    const coinGeo = new THREE.CylinderGeometry(1.3, 1.3, 0.4, 14);
    const coinMat = new THREE.MeshPhongMaterial({ color: 0xffdd00, emissive: 0x553300 });
    for (let i = 15; i < this.trackSamples.length; i += 20) {
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

    // 1. Dash Boost Pads (8 around the track)
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

    // 2. Super Jump Glider Ramps (3 major jump ramps)
    [95, 210, 345].forEach((idx) => {
      const s = this.trackSamples[idx];
      const angle = Math.atan2(s.tangent.x, s.tangent.z);
      const rampGeo = new THREE.BoxGeometry(15, 2.0, 11);
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

    // 3. Giant Thwomps (ドッスン) - Slam down periodically and flatten karts!
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

    // 4. Rotating Fire / Laser Bars (回転ファイア＆レーザーバー)
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

    // 5. Anti-Gravity Spin Boost Pillars (反重力スピンターボバー: ぶつかると加速！)
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

    // 6. Original Hyper Warp Portal Gate (入るとコース前方へワープ＋超加速！)
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
    for (let i = 0; i < 70; i++) {
      const sample = this.trackSamples[(i * 5) % this.trackSamples.length];
      const side = i % 2 === 0 ? 1 : -1;
      const dist = this.trackWidth + 26 + (i % 5) * 16;
      const pos = sample.point.clone().addScaledVector(sample.normal, side * dist);

      if (course.id === 'mario_circuit') {
        const trunk = new THREE.Mesh(
          new THREE.CylinderGeometry(1.4, 1.8, 9, 8),
          new THREE.MeshLambertMaterial({ color: 0x7a4a21 })
        );
        trunk.position.set(pos.x, 4.5, pos.z);
        const crown = new THREE.Mesh(
          new THREE.SphereGeometry(6.2, 10, 10),
          new THREE.MeshLambertMaterial({ color: 0x22aa33 })
        );
        crown.position.set(pos.x, 11.5, pos.z);
        this.worldGroup.add(trunk, crown);
      } else if (course.id === 'bowser_castle') {
        const spire = new THREE.Mesh(
          new THREE.ConeGeometry(6, 25, 6),
          new THREE.MeshLambertMaterial({ color: 0x3b170e, emissive: 0x330800 })
        );
        spire.position.set(pos.x, 12.5, pos.z);
        this.worldGroup.add(spire);
      } else {
        const crystal = new THREE.Mesh(
          new THREE.OctahedronGeometry(5.5, 0),
          new THREE.MeshPhongMaterial({
            color: i % 2 === 0 ? 0x00f2ff : 0xff00d0,
            emissive: 0x110033
          })
        );
        crystal.position.set(pos.x, 10 + (i % 4) * 3, pos.z);
        this.worldGroup.add(crystal);
      }
    }
  }

  // ==================== BUILD 3D KART & RACER ENTITIES ====================
  createKartMesh(driverData, kartIdx) {
    const root = new THREE.Group();

    const bodyGeo = new THREE.BoxGeometry(2.9, 1.0, 4.6);
    const bodyMat = new THREE.MeshPhongMaterial({ color: driverData.color, shininess: 85 });
    const body = new THREE.Mesh(bodyGeo, bodyMat);
    body.position.y = 0.85;
    root.add(body);

    const noseGeo = new THREE.BoxGeometry(2.2, 0.75, 1.7);
    const noseMat = new THREE.MeshPhongMaterial({ color: 0xffffff });
    const nose = new THREE.Mesh(noseGeo, noseMat);
    nose.position.set(0, 0.72, 2.55);
    root.add(nose);

    const wingGeo = new THREE.BoxGeometry(3.3, 0.32, 0.95);
    const wingMat = new THREE.MeshPhongMaterial({ color: driverData.hatColor });
    const wing = new THREE.Mesh(wingGeo, wingMat);
    wing.position.set(0, 1.9, -2.05);
    root.add(wing);

    const pipeGeo = new THREE.CylinderGeometry(0.28, 0.35, 1.4, 8);
    const pipeMat = new THREE.MeshLambertMaterial({ color: 0x333333 });
    [-0.85, 0.85].forEach((px) => {
      const pipe = new THREE.Mesh(pipeGeo, pipeMat);
      pipe.rotation.x = Math.PI / 3;
      pipe.position.set(px, 1.1, -2.35);
      root.add(pipe);
    });

    const wheelGeo = new THREE.CylinderGeometry(0.7, 0.7, 0.68, 12);
    const wheelMat = new THREE.MeshLambertMaterial({ color: 0x1a1a1a });
    const wheels = [];
    [
      [-1.6, 0.7, 1.5],
      [1.6, 0.7, 1.5],
      [-1.7, 0.7, -1.5],
      [1.7, 0.7, -1.5]
    ].forEach(([wx, wy, wz]) => {
      const w = new THREE.Mesh(wheelGeo, wheelMat);
      w.rotation.z = Math.PI / 2;
      w.position.set(wx, wy, wz);
      root.add(w);
      wheels.push(w);
    });

    const torso = new THREE.Mesh(
      new THREE.CylinderGeometry(0.65, 0.75, 1.2, 10),
      new THREE.MeshLambertMaterial({ color: driverData.shirtColor })
    );
    torso.position.set(0, 1.65, -0.2);
    root.add(torso);

    const head = new THREE.Mesh(
      new THREE.SphereGeometry(0.72, 12, 12),
      new THREE.MeshLambertMaterial({ color: 0xffccaa })
    );
    head.position.set(0, 2.55, -0.2);
    root.add(head);

    const cap = new THREE.Mesh(
      new THREE.CylinderGeometry(0.75, 0.78, 0.45, 12),
      new THREE.MeshLambertMaterial({ color: driverData.hatColor })
    );
    cap.position.set(0, 2.95, -0.15);
    root.add(cap);

    const sparkGeo = new THREE.SphereGeometry(0.65, 8, 8);
    const sparkMat = new THREE.MeshBasicMaterial({ color: 0x00d0ff, transparent: true, opacity: 0 });
    const sparkL = new THREE.Mesh(sparkGeo, sparkMat);
    sparkL.position.set(-1.55, 0.5, -1.95);
    const sparkR = new THREE.Mesh(sparkGeo, sparkMat);
    sparkR.position.set(1.55, 0.5, -1.95);
    root.add(sparkL, sparkR);

    const orbitGroup = new THREE.Group();
    orbitGroup.position.set(0, 1.2, 0);
    root.add(orbitGroup);

    return { root, bodyMat, wheels, sparkMat, orbitGroup };
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

      // Place starting grid neatly along the opening straight
      const sampleIdx = (this.trackSamples.length - 8 - i * 3) % this.trackSamples.length;
      const sample = this.trackSamples[sampleIdx];
      const lateralOffset = i % 2 === 0 ? -5.5 : 5.5;
      const startPos = sample.point.clone().addScaledVector(sample.normal, lateralOffset);
      const heading = Math.atan2(sample.tangent.x, sample.tangent.z);

      built.root.position.copy(startPos);
      built.root.rotation.y = heading;
      this.worldGroup.add(built.root);

      const ccMultiplier = this.ccClass === 200 ? 1.24 : this.ccClass === 100 ? 0.88 : 1.05;
      const baseMaxSpeed = (86 + (d.stats.speed + kartMod.speed) * 4.2) * ccMultiplier;

      const racer = {
        id: i,
        name: d.name,
        shortName: d.name.split(' ')[0],
        driverData: d,
        isPlayer,
        mesh: built.root,
        bodyMat: built.bodyMat,
        wheels: built.wheels,
        sparkMat: built.sparkMat,
        orbitGroup: built.orbitGroup,

        pos: startPos.clone(),
        velY: 0,
        heading,
        speed: 0,
        maxSpeed: baseMaxSpeed,
        accelStat: 40 + (d.stats.accel + kartMod.accel) * 4.8,
        handlingStat: 2.15 + (d.stats.handling + kartMod.handling) * 0.18,
        weightStat: d.stats.weight,

        drifting: false,
        driftDir: 0,
        driftCharge: 0,
        driftLevel: 0,

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

        coins: isPlayer ? 3 : 2,
        currentItem: null,
        itemUsesLeft: 0,
        rouletteTimer: 0,
        goldenMushroomTimer: 0,

        lap: 1,
        sampleIdx,
        maxSampleReached: 0,
        totalProgress: -i * 0.01,
        rank: i + 1,
        finished: false,
        finishTime: 0,
        wrongWayTimer: 0,

        aiLaneOffset: (Math.random() - 0.5) * 14,
        aiItemDelay: 1.5 + Math.random() * 2.5
      };

      if (this.selectedMode === 'tt' && isPlayer) {
        this.assignItemToRacer(racer, 'TRIPLE_MUSHROOM');
      } else if (this.selectedMode === 'mayhem' || isPlayer) {
        // Give player an immediate starting item in standard/mayhem races so they can test throwing right away!
        this.assignRandomItem(racer);
      }

      this.racers.push(racer);
      if (isPlayer) this.player = racer;
    }
  }

  // ==================== ITEM ROULETTE, ORBITING & THROWING ====================
  assignRandomItem(racer) {
    const frantic = this.franticItems || this.selectedMode === 'mayhem';
    let pool = [];

    if (racer.rank === 1 && !frantic) {
      pool = ['BANANA', 'TRIPLE_BANANA', 'GREEN_SHELL', 'TRIPLE_GREEN', 'BOB_OMB', 'MUSHROOM', 'BARRIER_EMP'];
    } else if (racer.rank <= 3) {
      pool = [
        'TRIPLE_BANANA', 'GREEN_SHELL', 'TRIPLE_GREEN', 'RED_SHELL', 'TRIPLE_RED',
        'BOB_OMB', 'MUSHROOM', 'TRIPLE_MUSHROOM', 'BLACK_HOLE', 'BARRIER_EMP'
      ];
    } else {
      pool = [
        'TRIPLE_RED', 'TRIPLE_MUSHROOM', 'GOLDEN_MUSHROOM', 'STAR',
        'SPINY_SHELL', 'LIGHTNING', 'BULLET_BILL', 'BLACK_HOLE', 'BOB_OMB', 'TRIPLE_GREEN'
      ];
    }

    const chosenId = pool[Math.floor(Math.random() * pool.length)];
    this.assignItemToRacer(racer, chosenId);
  }

  assignItemToRacer(racer, itemId) {
    const def = window.GAME_DATA.items[itemId];
    if (!def) return;
    racer.currentItem = def;
    racer.itemUsesLeft = def.count || 1;
    if (itemId === 'GOLDEN_MUSHROOM') {
      racer.goldenMushroomTimer = 8.5;
      racer.itemUsesLeft = 99;
    }
    this.rebuildOrbitingItems(racer);
    if (racer.isPlayer) {
      window.soundEngine.sfxItemDecide();
      this.updateItemHUD();
    }
  }

  rebuildOrbitingItems(racer) {
    while (racer.orbitGroup.children.length > 0) {
      racer.orbitGroup.remove(racer.orbitGroup.children[0]);
    }
    if (!racer.currentItem || racer.itemUsesLeft <= 0) return;

    const id = racer.currentItem.id;
    const isOrbitType = ['TRIPLE_BANANA', 'TRIPLE_GREEN', 'TRIPLE_RED', 'TRIPLE_MUSHROOM'].includes(id);
    if (!isOrbitType) return;

    let color = 0xffe600;
    if (id.includes('GREEN')) color = 0x00e640;
    if (id.includes('RED')) color = 0xff2222;
    if (id.includes('MUSHROOM')) color = 0xff3366;

    for (let i = 0; i < racer.itemUsesLeft; i++) {
      const angle = (i / racer.itemUsesLeft) * Math.PI * 2;
      const geo = id.includes('BANANA')
        ? new THREE.ConeGeometry(0.45, 1.35, 8)
        : new THREE.SphereGeometry(0.62, 10, 10);
      const mat = new THREE.MeshPhongMaterial({ color });
      const m = new THREE.Mesh(geo, mat);
      m.position.set(Math.cos(angle) * 2.9, 0.2, Math.sin(angle) * 2.9);
      racer.orbitGroup.add(m);
    }
  }

  useRacerItem(racer, dir = 1) {
    if (!racer.currentItem || racer.rouletteTimer > 0) return;
    const id = racer.currentItem.id;

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
      if (racer.isPlayer) this.showTicker('⭐ スーパースター無敵発動！！ライバルを壁へ弾き飛ばせ！');
    } else if (id === 'LIGHTNING') {
      this.triggerLightning(racer);
    } else if (id === 'BULLET_BILL') {
      racer.bulletTimer = 6.0;
      racer.starTimer = Math.max(racer.starTimer, 6.0);
      if (racer.isPlayer) this.showTicker('🚀 キラー変身！！超音速オート突撃！');
      window.soundEngine.sfxBoost();
    } else if (id === 'BLACK_HOLE') {
      this.spawnBlackHole(racer, dir);
    } else if (id === 'BARRIER_EMP') {
      this.triggerEmpShockwave(racer);
    }

    racer.itemUsesLeft--;
    if (racer.itemUsesLeft <= 0) {
      racer.currentItem = null;
    }
    this.rebuildOrbitingItems(racer);
    if (racer.isPlayer) this.updateItemHUD();
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
        r.currentItem = null;
        r.itemUsesLeft = 0;
        this.rebuildOrbitingItems(r);
        this.hitRacer(r, 'LIGHTNING');
      }
    });
    if (caster.isPlayer) this.showTicker('⚡ サンダー落雷！！ライバル全員がスピン＆ミニ化！');
  }

  spawnChaosWave() {
    if (!this.player) return;
    window.soundEngine.sfxItemDecide();
    this.showTicker('🍌🟢💣 カオス大放出！！バナナ＆反射ミドリこうら＆ボムへい一斉投下！！');

    for (let i = -2; i <= 2; i++) {
      const savedHeading = this.player.heading;
      this.player.heading += i * 0.22;
      this.spawnBanana(this.player, i % 2 === 0 ? -1 : 1);
      this.spawnShell(this.player, i === 0 ? 'RED' : 'GREEN', 1);
      this.player.heading = savedHeading;
    }
    this.spawnBobOmb(this.player, 1);
  }

  givePlayerSuperItem() {
    if (!this.player) return;
    const superPool = [
      'TRIPLE_RED', 'TRIPLE_BANANA', 'TRIPLE_GREEN', 'STAR',
      'SPINY_SHELL', 'BOB_OMB', 'BLACK_HOLE', 'GOLDEN_MUSHROOM'
    ];
    const pick = superPool[Math.floor(Math.random() * superPool.length)];
    this.assignItemToRacer(this.player, pick);
    this.showTicker(`🎁 ${window.GAME_DATA.items[pick].name} を即座に装備しました！`);
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

  // ==================== PHYSICS, DRIFT, WALL COLLISION & AI ====================
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
    racer.coins = Math.max(0, racer.coins - 2);
    if (racer.isPlayer) {
      window.soundEngine.sfxSpinOut();
      this.showTicker(`💥 クラッシュ！ (${sourceType}) コイン減少＆スピン！`);
    }
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
    if (racer.goldenMushroomTimer > 0) {
      racer.goldenMushroomTimer -= dt;
      if (racer.goldenMushroomTimer <= 0 && racer.currentItem && racer.currentItem.id === 'GOLDEN_MUSHROOM') {
        racer.currentItem = null;
        if (racer.isPlayer) this.updateItemHUD();
      }
    }
    if (racer.rouletteTimer > 0) {
      racer.rouletteTimer -= dt;
      if (racer.isPlayer && Math.random() < 0.35) window.soundEngine.sfxItemRouletteTick();
      if (racer.rouletteTimer <= 0) {
        this.assignRandomItem(racer);
      }
    }

    const scaleXZ = racer.shrunkTimer > 0 ? 0.58 : 1.0;
    const scaleY = racer.flattenedTimer > 0 ? 0.28 : racer.shrunkTimer > 0 ? 0.58 : 1.0;
    racer.mesh.scale.set(scaleXZ, scaleY, scaleXZ);

    const hoverMode = racer.antiGravityTimer > 0 || racer.overdriveTimer > 0;
    racer.wheels.forEach((w) => {
      w.rotation.z = hoverMode ? 0.15 : Math.PI / 2;
    });

    if (racer.starTimer > 0) {
      racer.bodyMat.color.setHSL((performance.now() * 0.003) % 1, 1.0, 0.55);
    } else if (racer.overdriveTimer > 0) {
      racer.bodyMat.color.setHex(0x00f2ff);
    } else {
      racer.bodyMat.color.setHex(racer.driverData.color);
    }

    racer.orbitGroup.rotation.y += dt * 3.8;

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

      if (!racer.isPlayer && this.state === 'RACING' && racer.currentItem) {
        racer.aiItemDelay -= dt;
        if (racer.aiItemDelay <= 0) {
          const throwDir = racer.currentItem.id.includes('BANANA') && Math.random() < 0.65 ? -1 : 1;
          this.useRacerItem(racer, throwDir);
          racer.aiItemDelay = 1.6 + Math.random() * 2.5;
        }
      }
    } else if (this.state === 'RACING') {
      if (this.keys['KeyW'] || this.keys['ArrowUp']) throttle = 1;
      if (this.keys['KeyS'] || this.keys['ArrowDown']) throttle = -0.65;
      if (this.keys['KeyA'] || this.keys['ArrowLeft']) steer += 1;
      if (this.keys['KeyD'] || this.keys['ArrowRight']) steer -= 1;
      wantDrift = Boolean(this.keys['ShiftLeft'] || this.keys['ShiftRight'] || this.keys['ControlLeft'] || this.keys['KeyK']);
    }

    if (racer.spinOutTimer > 0) {
      throttle = 0;
      racer.heading += dt * 14;
    }

    let topSpeed = racer.maxSpeed + racer.coins * 1.2;
    if (racer.shrunkTimer > 0) topSpeed *= 0.68;
    if (racer.flattenedTimer > 0) topSpeed *= 0.55;
    if (racer.starTimer > 0) topSpeed += 24;
    if (racer.overdriveTimer > 0) topSpeed += 32;
    if (racer.bulletTimer > 0) topSpeed = 175;
    if (racer.boostTimer > 0) topSpeed += racer.boostPower;

    if (throttle > 0) {
      racer.speed += racer.accelStat * throttle * dt;
      if (racer.boostTimer > 0 || racer.bulletTimer > 0) {
        racer.speed = Math.max(racer.speed, topSpeed * 0.94);
      }
    } else if (throttle < 0) {
      racer.speed += racer.accelStat * 1.3 * throttle * dt;
    } else {
      racer.speed *= Math.pow(0.45, dt);
    }

    if (racer.speed > topSpeed) {
      racer.speed = THREE.MathUtils.lerp(racer.speed, topSpeed, dt * 4.5);
    }
    if (racer.speed < -35) racer.speed = -35;

    // 3-Stage Drift Mini-Turbo
    if (wantDrift && racer.speed > 42 && Math.abs(steer) > 0.1 && racer.pos.y <= 0.2) {
      if (!racer.drifting) {
        racer.drifting = true;
        racer.driftDir = Math.sign(steer);
        racer.velY = 7.5;
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
      if (racer.driftLevel === 1) {
        this.triggerBoost(racer, 0.9, 22);
        if (racer.isPlayer) window.soundEngine.sfxBoost();
      } else if (racer.driftLevel === 2) {
        this.triggerBoost(racer, 1.5, 29);
        if (racer.isPlayer) window.soundEngine.sfxBoost();
      } else if (racer.driftLevel === 3) {
        this.triggerBoost(racer, 2.3, 36);
        if (racer.isPlayer) {
          window.soundEngine.sfxBoost();
          this.showTicker('🟣 ウルトラミニターボ炸裂！！');
        }
      }
      racer.drifting = false;
      racer.driftDir = 0;
      racer.driftCharge = 0;
      racer.driftLevel = 0;
    }

    if (racer.drifting && racer.driftLevel > 0) {
      racer.sparkMat.opacity = 0.92;
      if (racer.driftLevel === 1) racer.sparkMat.color.setHex(0x00d8ff);
      else if (racer.driftLevel === 2) racer.sparkMat.color.setHex(0xff7700);
      else racer.sparkMat.color.setHex(0xd400ff);
    } else {
      racer.sparkMat.opacity = 0;
    }

    const turnRate = racer.handlingStat * (racer.drifting ? 1.28 : 1.0);
    if (Math.abs(racer.speed) > 1.5) {
      const effectiveSteer = racer.drifting ? steer * 0.7 + racer.driftDir * 0.55 : steer;
      racer.heading += effectiveSteer * turnRate * dt * Math.sign(racer.speed);
    }

    racer.pos.x += Math.sin(racer.heading) * racer.speed * dt;
    racer.pos.z += Math.cos(racer.heading) * racer.speed * dt;

    if (racer.pos.y > 0 || racer.velY > 0) {
      racer.pos.y += racer.velY * dt;
      racer.velY -= 42 * dt;
      if (racer.pos.y <= 0) {
        racer.pos.y = 0;
        racer.velY = 0;
      }
    }

    const prevSample = racer.sampleIdx;
    const newSampleIdx = this.findClosestTrackSample(racer.pos, prevSample);
    racer.sampleIdx = newSampleIdx;
    const sample = this.trackSamples[newSampleIdx];

    // Lap Crossing
    const N = this.trackSamples.length;
    if (prevSample > N * 0.8 && newSampleIdx < N * 0.2 && racer.maxSampleReached > N * 0.65) {
      racer.lap++;
      racer.maxSampleReached = 0;
      if (racer.isPlayer && this.state === 'RACING') {
        if (racer.lap === this.totalLaps) {
          window.soundEngine.sfxLap(true);
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

    if (racer.isPlayer && this.state === 'RACING') {
      const forwardVec = new THREE.Vector3(Math.sin(racer.heading), 0, Math.cos(racer.heading));
      const dot = forwardVec.dot(sample.tangent);
      if (dot < -0.35 && racer.speed > 15) {
        racer.wrongWayTimer += dt;
      } else {
        racer.wrongWayTimer = 0;
      }
      const lakituEl = document.getElementById('lakitu-banner');
      if (lakituEl) {
        lakituEl.classList.toggle('hidden', racer.wrongWayTimer < 0.7);
      }
    }

    // Wall Crash & Bounce Physics
    const offsetVec = racer.pos.clone().sub(sample.point);
    offsetVec.y = 0;
    const lateralDist = offsetVec.dot(sample.normal);
    const maxWallDist = this.trackWidth - 1.8;

    if (Math.abs(lateralDist) > maxWallDist) {
      const sign = Math.sign(lateralDist);
      const clampedPt = sample.point.clone().addScaledVector(sample.normal, sign * maxWallDist);
      racer.pos.x = clampedPt.x;
      racer.pos.z = clampedPt.z;

      if (Math.abs(racer.speed) > 25) {
        racer.speed *= 0.8;
        const trackAngle = Math.atan2(sample.tangent.x, sample.tangent.z);
        let angleDiff = trackAngle - racer.heading;
        while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
        while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;
        racer.heading += angleDiff * 0.35;
        this.spawnSparkBurst(racer.pos, 0xffaa00);
        if (racer.isPlayer) window.soundEngine.sfxWallHit();
      }
    }

    racer.mesh.position.copy(racer.pos);
    const visualDriftYaw = racer.drifting ? racer.driftDir * 0.24 : 0;
    racer.mesh.rotation.y = racer.heading + visualDriftYaw;
  }

  updateRacerCollisions() {
    for (let i = 0; i < this.racers.length; i++) {
      for (let j = i + 1; j < this.racers.length; j++) {
        const a = this.racers[i];
        const b = this.racers[j];
        const dx = b.pos.x - a.pos.x;
        const dz = b.pos.z - a.pos.z;
        const distSq = dx * dx + dz * dz;
        const minDist = 3.5;

        if (distSq < minDist * minDist && distSq > 0.001) {
          const dist = Math.sqrt(distSq);
          const nx = dx / dist;
          const nz = dz / dist;
          const overlap = (minDist - dist) * 0.55;

          if ((a.starTimer > 0 || a.bulletTimer > 0) && b.starTimer <= 0) {
            this.hitRacer(b, 'スター体当たり');
            b.pos.x += nx * 7;
            b.pos.z += nz * 7;
            continue;
          }
          if ((b.starTimer > 0 || b.bulletTimer > 0) && a.starTimer <= 0) {
            this.hitRacer(a, 'スター体当たり');
            a.pos.x -= nx * 7;
            a.pos.z -= nz * 7;
            continue;
          }

          if (a.antiGravityTimer > 0 || b.antiGravityTimer > 0) {
            this.triggerBoost(a, 0.9, 22);
            this.triggerBoost(b, 0.9, 22);
          }

          const weightRatioA = b.weightStat / (a.weightStat + b.weightStat);
          const weightRatioB = a.weightStat / (a.weightStat + b.weightStat);
          a.pos.x -= nx * overlap * weightRatioA * 2.2;
          a.pos.z -= nz * overlap * weightRatioA * 2.2;
          b.pos.x += nx * overlap * weightRatioB * 2.2;
          b.pos.z += nz * overlap * weightRatioB * 2.2;
        }
      }
    }
  }

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
            if (target.isPlayer && target.pos.distanceTo(p.pos) < 90) {
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

      let hitSomeone = false;
      for (const r of this.racers) {
        if (r === p.owner && p.life > (p.type === 'BANANA' ? 34.4 : 17.5)) continue;

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
    this.spawnExplosionVisual(centerPos, 0xff5500, 15);
    this.racers.forEach((r) => {
      if (r.pos.distanceTo(centerPos) < 16.5) {
        this.hitRacer(r, '大爆発');
        r.velY = 18;
      }
    });
  }

  updateGimmicksAndPickups(dt, elapsed) {
    this.itemBoxes.forEach((box) => {
      if (!box.active) {
        box.respawnTimer -= dt;
        if (box.respawnTimer <= 0) {
          box.active = true;
          box.mesh.visible = true;
        }
        return;
      }
      box.mesh.rotation.y += dt * 2.4;
      box.mesh.rotation.x += dt * 1.5;
      box.mesh.position.y = box.basePos.y + Math.sin(elapsed * 3 + box.basePos.x) * 0.45;

      for (const r of this.racers) {
        if (r.pos.distanceTo(box.basePos) < 3.8) {
          box.active = false;
          box.mesh.visible = false;
          box.respawnTimer = 2.5;
          if (!r.currentItem && r.rouletteTimer <= 0) {
            r.rouletteTimer = r.isPlayer ? 0.75 : 0.2;
          }
          break;
        }
      }
    });

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
            r.velY = 25;
            this.triggerBoost(r, 1.4, 26);
            if (r.isPlayer) {
              window.soundEngine.sfxBoost();
              this.showTicker('✈️ ジャンピングアクション成功！！');
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
    const dist = this.player.boostTimer > 0 ? 16.5 : 14.5;
    const targetCamPos = new THREE.Vector3(
      this.player.pos.x + Math.sin(this.player.heading) * dist * dirSign,
      this.player.pos.y + 6.8,
      this.player.pos.z + Math.cos(this.player.heading) * dist * dirSign
    );
    this.camera.position.lerp(targetCamPos, dt * 12);

    const lookAtPos = new THREE.Vector3(
      this.player.pos.x + Math.sin(this.player.heading) * (-dirSign * 14),
      this.player.pos.y + 2.5,
      this.player.pos.z + Math.cos(this.player.heading) * (-dirSign * 14)
    );
    this.camera.lookAt(lookAtPos);

    const targetFov = this.player.boostTimer > 0 || this.player.overdriveTimer > 0 ? 78 : 65;
    this.camera.fov = THREE.MathUtils.lerp(this.camera.fov, targetFov, dt * 7);
    this.camera.updateProjectionMatrix();
  }

  updateItemHUD() {
    if (!this.player) return;
    const iconEl = document.getElementById('hud-item-icon');
    const nameEl = document.getElementById('hud-item-name');
    const countEl = document.getElementById('hud-item-count');

    if (this.player.rouletteTimer > 0) {
      const icons = ['🍌', '🟢', '🔴', '🍄', '💣', '⭐', '⚡', '🌌'];
      iconEl.textContent = icons[Math.floor(performance.now() / 60) % icons.length];
      nameEl.textContent = 'ルーレット回転中...';
      countEl.classList.add('hidden');
    } else if (this.player.currentItem) {
      iconEl.textContent = this.player.currentItem.icon;
      nameEl.textContent = this.player.currentItem.name;
      if (this.player.itemUsesLeft > 1 && this.player.itemUsesLeft < 50) {
        countEl.textContent = `×${this.player.itemUsesLeft}`;
        countEl.classList.remove('hidden');
      } else {
        countEl.classList.add('hidden');
      }
    } else {
      iconEl.textContent = '❓';
      nameEl.textContent = 'アイテムなし (Vキーで即補充)';
      countEl.classList.add('hidden');
    }
  }

  updateHUD(sortedRacers) {
    if (!this.player) return;
    if (this.player.rouletteTimer > 0) this.updateItemHUD();

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
        <span>${r.currentItem ? r.currentItem.icon : ''}🪙${r.coins}</span>
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

    // Position camera immediately behind player so there's no jarring jump
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

          if (this.player && this.rocketCharge > 0.3 && this.rocketCharge < 1.65) {
            this.triggerBoost(this.player, 1.6, 34);
            window.soundEngine.sfxBoost();
            this.showTicker('🚀 ロケットスタート大成功！！');
          } else if (this.player && this.rocketCharge >= 1.65) {
            this.hitRacer(this.player, 'スタート空回りバースト');
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
      this.updateRacerCollisions();
      this.updateProjectiles(dt);
      this.updateGimmicksAndPickups(dt, elapsed);
      this.updateParticles(dt);

      const sorted = this.updateStandings();
      this.updateCamera(dt);

      if (this.state === 'RACING' && this.player) {
        this.updateHUD(sorted);
        window.soundEngine.updateEngine(
          this.player.speed / this.player.maxSpeed,
          this.player.drifting,
          this.player.boostTimer > 0,
          true
        );
      } else {
        window.soundEngine.updateEngine(0, false, false, false);
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

    // Automatically transition from Red Boot Splash to Authentic 3D Title Screen after 1.4s
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
            window.uiFlow.selectMode('mayhem');
            window.uiFlow.pickDriver(4); // Bowser
            window.uiFlow.goToCourseSelect();
            window.uiFlow.startRaceNow();
            window.game.spawnChaosWave();
            ipcRenderer.send('smoke-test-result', {
              ok: true,
              titleTransitioned: titleActive,
              framesRendered: window.game.frameCount,
              racersCount: window.game.racers.length,
              projectilesCount: window.game.projectiles.length,
              state: window.game.state
            });
          } catch (err) {
            ipcRenderer.send('smoke-test-result', { ok: false, error: err.stack || String(err) });
          }
        }, 1600);
      });
    }
  } catch (err) {
    console.error('FATAL INIT ERROR:', err);
    if (ipcRenderer) {
      ipcRenderer.send('smoke-test-result', { ok: false, error: err.stack || String(err) });
    }
  }
});
