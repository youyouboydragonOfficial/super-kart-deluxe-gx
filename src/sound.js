// ============================================================================
// SUPER KART DELUXE GX - High-End Procedural Audio & Music Synth Engine
// Multi-Track Interactive BGM (Drums, Slap Bass, Chords, Lead Brass)
// Authentic Racing Sound FX (RPM-Responsive Engine, Tire Squeal, Boost, Explosions)
// ============================================================================

class SoundEngine {
  constructor() {
    this.ctx = null;
    this.muted = false;
    this.bgmMode = null; // 'menu', 'race', 'final_lap'
    this.bgmTimer = null;
    this.currentTempo = 136; // BPM
    this.step = 0;

    // Continuous sound nodes
    this.engineMasterGain = null;
    this.engineOsc1 = null;
    this.engineOsc2 = null;
    this.engineSubOsc = null;
    this.engineFilter = null;
    this.engineNoise = null;
    this.engineNoiseGain = null;

    this.tireSquealGain = null;
    this.tireSquealFilter = null;

    // Cooldowns
    this.lastWallHitTime = 0;
    this.lastCrashSoundTime = 0;
  }

  init() {
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      this.ctx = new AudioCtx();
      this.setupContinuousEngines();
    }
    if (this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
  }

  // ==================== REALISTIC RACING ENGINE & TIRE SOUNDS ====================
  setupContinuousEngines() {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;

    // 1. ENGINE SYNTH (Sawtooth + Sub-Square + Rumble Filter)
    this.engineMasterGain = this.ctx.createGain();
    this.engineMasterGain.gain.setValueAtTime(0, now);

    this.engineFilter = this.ctx.createBiquadFilter();
    this.engineFilter.type = 'lowpass';
    this.engineFilter.frequency.setValueAtTime(320, now);
    this.engineFilter.Q.setValueAtTime(3.5, now);

    // Primary saw oscillator
    this.engineOsc1 = this.ctx.createOscillator();
    this.engineOsc1.type = 'sawtooth';
    this.engineOsc1.frequency.setValueAtTime(65, now);

    // Detuned second saw oscillator for realistic combustion chorus
    this.engineOsc2 = this.ctx.createOscillator();
    this.engineOsc2.type = 'sawtooth';
    this.engineOsc2.detune.setValueAtTime(8, now);
    this.engineOsc2.frequency.setValueAtTime(65, now);

    // Sub square oscillator for heavy exhaust rumble
    this.engineSubOsc = this.ctx.createOscillator();
    this.engineSubOsc.type = 'square';
    this.engineSubOsc.frequency.setValueAtTime(32.5, now);

    const subGain = this.ctx.createGain();
    subGain.gain.setValueAtTime(0.35, now);
    this.engineSubOsc.connect(subGain);
    subGain.connect(this.engineFilter);

    this.engineOsc1.connect(this.engineFilter);
    this.engineOsc2.connect(this.engineFilter);
    this.engineFilter.connect(this.engineMasterGain);

    // Engine exhaust throat noise (hiss/growl)
    const noiseBufferSize = Math.floor(this.ctx.sampleRate * 1.5);
    const noiseBuf = this.ctx.createBuffer(1, noiseBufferSize, this.ctx.sampleRate);
    const nData = noiseBuf.getChannelData(0);
    for (let i = 0; i < noiseBufferSize; i++) nData[i] = Math.random() * 2 - 1;

    this.engineNoise = this.ctx.createBufferSource();
    this.engineNoise.buffer = noiseBuf;
    this.engineNoise.loop = true;

    const noiseFilter = this.ctx.createBiquadFilter();
    noiseFilter.type = 'bandpass';
    noiseFilter.frequency.setValueAtTime(450, now);
    noiseFilter.Q.setValueAtTime(2.0, now);

    this.engineNoiseGain = this.ctx.createGain();
    this.engineNoiseGain.gain.setValueAtTime(0, now);

    this.engineNoise.connect(noiseFilter);
    noiseFilter.connect(this.engineNoiseGain);
    this.engineNoiseGain.connect(this.engineMasterGain);

    this.engineMasterGain.connect(this.ctx.destination);

    this.engineOsc1.start();
    this.engineOsc2.start();
    this.engineSubOsc.start();
    this.engineNoise.start();

    // 2. DRIFT TIRE SQUEAL (Realistic Asphalt Scrubbing)
    const squealBuf = this.ctx.createBuffer(1, noiseBufferSize, this.ctx.sampleRate);
    const sData = squealBuf.getChannelData(0);
    for (let i = 0; i < noiseBufferSize; i++) sData[i] = Math.random() * 2 - 1;

    const squealSrc = this.ctx.createBufferSource();
    squealSrc.buffer = squealBuf;
    squealSrc.loop = true;

    this.tireSquealFilter = this.ctx.createBiquadFilter();
    this.tireSquealFilter.type = 'bandpass';
    this.tireSquealFilter.frequency.setValueAtTime(1400, now);
    this.tireSquealFilter.Q.setValueAtTime(5.5, now);

    this.tireSquealGain = this.ctx.createGain();
    this.tireSquealGain.gain.setValueAtTime(0, now);

    squealSrc.connect(this.tireSquealFilter);
    this.tireSquealFilter.connect(this.tireSquealGain);
    this.tireSquealGain.connect(this.ctx.destination);
    squealSrc.start();
  }

  // Update dynamic engine RPM pitch and tire squeal every frame
  updateEngine(speedRatio, isDrifting, boostActive, inRace, isAccelerating) {
    if (!this.ctx || !this.engineMasterGain) return;
    const now = this.ctx.currentTime;

    if (!inRace || this.muted) {
      this.engineMasterGain.gain.setTargetAtTime(0, now, 0.08);
      if (this.tireSquealGain) this.tireSquealGain.gain.setTargetAtTime(0, now, 0.05);
      return;
    }

    // Engine RPM Calculation: Idle at 55Hz, revving up to 280Hz, +45Hz on boost
    const normSpeed = THREE.MathUtils.clamp(Math.abs(speedRatio), 0, 1.5);
    const accelRev = isAccelerating ? 24 : 0;
    const boostRev = boostActive ? 48 : 0;
    const targetFreq = 58 + normSpeed * 175 + accelRev + boostRev;

    this.engineOsc1.frequency.setTargetAtTime(targetFreq, now, 0.05);
    this.engineOsc2.frequency.setTargetAtTime(targetFreq * 1.008, now, 0.05);
    this.engineSubOsc.frequency.setTargetAtTime(targetFreq * 0.5, now, 0.05);

    // Open filter on high RPM for crisp throttle roar
    const targetFilterFreq = 300 + normSpeed * 750 + (boostActive ? 350 : 0);
    this.engineFilter.frequency.setTargetAtTime(targetFilterFreq, now, 0.06);

    const targetMasterVol = 0.075 + (boostActive ? 0.03 : 0);
    this.engineMasterGain.gain.setTargetAtTime(targetMasterVol, now, 0.05);
    this.engineNoiseGain.gain.setTargetAtTime(isAccelerating ? 0.035 : 0.01, now, 0.06);

    // Tire Squeal on Drift
    if (this.tireSquealGain) {
      const squealVol = isDrifting && normSpeed > 0.35 ? 0.09 : 0;
      this.tireSquealGain.gain.setTargetAtTime(squealVol, now, 0.04);
      if (isDrifting) {
        this.tireSquealFilter.frequency.setTargetAtTime(1300 + Math.random() * 300, now, 0.05);
      }
    }
  }

  // ==================== HIGH-QUALITY SOUND EFFECTS (SFX) ====================
  playTone(freq, duration, type = 'sine', vol = 0.15, slideTo = null, delay = 0) {
    if (this.muted) return;
    this.init();
    const t = this.ctx.currentTime + delay;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = type;
    osc.frequency.setValueAtTime(Math.max(20, freq), t);
    if (slideTo) {
      osc.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), t + duration);
    }

    gain.gain.setValueAtTime(vol, t);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + duration);

    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start(t);
    osc.stop(t + duration + 0.02);
  }

  playNoise(duration, vol = 0.18, filterFreq = 1200, filterType = 'bandpass', Q = 2.0) {
    if (this.muted) return;
    this.init();
    const t = this.ctx.currentTime;
    const bufSize = Math.floor(this.ctx.sampleRate * duration);
    const buf = this.ctx.createBuffer(1, bufSize, this.ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < bufSize; i++) data[i] = Math.random() * 2 - 1;

    const noise = this.ctx.createBufferSource();
    noise.buffer = buf;

    const filter = this.ctx.createBiquadFilter();
    filter.type = filterType;
    filter.frequency.setValueAtTime(filterFreq, t);
    filter.Q.setValueAtTime(Q, t);

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(vol, t);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + duration);

    noise.connect(filter);
    filter.connect(gain);
    gain.connect(this.ctx.destination);
    noise.start(t);
  }

  sfxSelect() {
    this.playTone(523.25, 0.08, 'triangle', 0.14);
    this.playTone(783.99, 0.12, 'triangle', 0.14, null, 0.06);
  }

  sfxBack() {
    this.playTone(659.25, 0.08, 'triangle', 0.12);
    this.playTone(440.00, 0.12, 'triangle', 0.12, null, 0.06);
  }

  sfxCountdown(step) {
    if (step > 0) {
      // Warm electronic beep for 3, 2, 1
      this.playTone(440, 0.24, 'sine', 0.22);
      this.playTone(880, 0.24, 'triangle', 0.14);
    } else {
      // Celebratory chord for GO!!
      this.playTone(587.33, 0.65, 'triangle', 0.22); // D5
      this.playTone(880.00, 0.65, 'triangle', 0.24); // A5
      this.playTone(1174.66, 0.65, 'sine', 0.28);   // D6
      this.playNoise(0.25, 0.12, 2200);
    }
  }

  sfxCoin() {
    // Dual crisp chime
    this.playTone(987.77, 0.08, 'sine', 0.16); // B5
    this.playTone(1318.51, 0.28, 'sine', 0.20, null, 0.07); // E6
  }

  sfxItemRouletteTick() {
    this.playTone(600 + Math.random() * 350, 0.04, 'triangle', 0.07);
  }

  sfxItemDecide() {
    // Classic crystal fanfare arpeggio
    const notes = [523.25, 659.25, 783.99, 1046.5, 1318.51];
    notes.forEach((n, i) => this.playTone(n, 0.14, 'triangle', 0.16, null, i * 0.055));
  }

  sfxBoost() {
    // High-energy rocket ignition!
    this.playNoise(0.45, 0.26, 1600, 'bandpass', 1.5);
    this.playTone(180, 0.45, 'sawtooth', 0.22, 920);
    this.playTone(90, 0.5, 'sine', 0.28, 40); // Sub bass thump
  }

  sfxSparkCharge(level) {
    const base = level === 1 ? 587 : level === 2 ? 880 : 1174;
    this.playTone(base, 0.13, 'triangle', 0.16, base * 1.25);
    this.playNoise(0.08, 0.1, base * 2);
  }

  sfxThrow() {
    this.playNoise(0.18, 0.15, 1800);
    this.playTone(320, 0.18, 'sine', 0.18, 780);
  }

  sfxPlaceTrap() {
    this.playTone(480, 0.12, 'triangle', 0.15, 220);
  }

  sfxBoxBreak() {
    // Glass/crystal shatter
    this.playNoise(0.2, 0.25, 3200, 'highpass');
    this.playTone(1318, 0.12, 'sine', 0.2, 1800);
    this.playTone(1760, 0.16, 'triangle', 0.18, null, 0.04);
  }

  sfxTrick() {
    // Joyful Mario Kart style jump trick chime
    this.playTone(784, 0.1, 'triangle', 0.18, 1174);
    this.playTone(1174, 0.16, 'sine', 0.22, 1568, 0.06);
  }

  sfxSlipstream() {
    this.playNoise(0.5, 0.26, 1300, 'bandpass', 1.2);
    this.playTone(340, 0.45, 'sawtooth', 0.18, 960);
  }

  sfxGuardBlock() {
    // Shield deflect metallic clang
    this.playNoise(0.18, 0.28, 800);
    this.playTone(780, 0.18, 'triangle', 0.24, 240);
  }

  sfxWallHit() {
    const now = performance.now();
    if (now - this.lastWallHitTime < 320) return;
    this.lastWallHitTime = now;
    // Pleasant curb rub & metallic guardrail slide
    this.playNoise(0.12, 0.14, 1800, 'bandpass', 3.0);
    this.playTone(280, 0.1, 'triangle', 0.12, 140);
  }

  sfxExplosion() {
    this.playNoise(0.65, 0.38, 420, 'lowpass');
    this.playTone(130, 0.6, 'sawtooth', 0.32, 28);
  }

  sfxSpinOut() {
    const now = performance.now();
    if (now - this.lastCrashSoundTime < 600) return;
    this.lastCrashSoundTime = now;
    // Classic tire screech and slide
    this.playNoise(0.45, 0.22, 1600, 'bandpass', 4.0);
    for (let i = 0; i < 4; i++) {
      this.playTone(660 - i * 80, 0.09, 'triangle', 0.15, 380 - i * 50, i * 0.08);
    }
  }

  sfxLightning() {
    this.playNoise(0.75, 0.4, 2400);
    this.playTone(980, 0.5, 'sawtooth', 0.25, 80);
  }

  sfxStarTick() {
    const starNotes = [784, 987, 1174, 1318, 1567, 1760];
    const n = starNotes[Math.floor(Math.random() * starNotes.length)];
    this.playTone(n, 0.08, 'sine', 0.14);
  }

  sfxGimmickSwitch() {
    this.playTone(523.25, 0.12, 'sine', 0.18, 1046.5);
    this.playTone(1046.5, 0.2, 'triangle', 0.18, 1568, 0.07);
  }

  sfxLap(finalLap = false) {
    if (finalLap) {
      // Dramatic Final Lap fanfare!
      const seq = [587, 698, 880, 1046, 1174, 1396];
      seq.forEach((n, i) => this.playTone(n, 0.16, 'triangle', 0.22, null, i * 0.08));
    } else {
      const seq = [523, 659, 784, 1046];
      seq.forEach((n, i) => this.playTone(n, 0.14, 'triangle', 0.18, null, i * 0.08));
    }
  }

  sfxGoal(rank) {
    if (rank === 1) {
      // 1st Place Victory Fanfare
      const notes = [523, 659, 784, 1046, 784, 1046, 1318, 1568];
      notes.forEach((n, i) => this.playTone(n, 0.24, 'triangle', 0.25, null, i * 0.11));
    } else {
      const notes = [440, 523, 659, 784, 659, 523];
      notes.forEach((n, i) => this.playTone(n, 0.2, 'triangle', 0.2, null, i * 0.11));
    }
  }

  // ==================== INTERACTIVE MULTI-TRACK BGM ENGINE ====================
  // Generates real driving Mario Kart-style brass melody, slap bass, rhythmic drums & chords!
  startBGM(mode = 'menu') {
    this.init();
    if (this.bgmMode === mode && this.bgmTimer) return;
    this.stopBGM();
    this.bgmMode = mode;
    this.step = 0;

    // Fast, energetic tempos: Menu=124 BPM, Race=138 BPM, Final Lap=165 BPM!
    this.currentTempo = mode === 'final_lap' ? 165 : mode === 'race' ? 138 : 124;
    const sixteenthIntervalMs = (60000 / this.currentTempo) / 4; // 16th note timing

    // Bass notes (Hz)
    const C2 = 65.41, D2 = 73.42, Eb2 = 77.78, E2 = 82.41, F2 = 87.31, G2 = 98.00, A2 = 110.00, Bb2 = 116.54, B2 = 123.47;
    const C3 = 130.81, D3 = 146.83, Eb3 = 155.56, E3 = 164.81, F3 = 174.61, G3 = 196.00, A3 = 220.00, Bb3 = 233.08;

    // Melody notes (Hz)
    const C4 = 261.63, D4 = 293.66, E4 = 329.63, F4 = 349.23, G4 = 392.00, A4 = 440.00, Bb4 = 466.16, B4 = 493.88;
    const C5 = 523.25, D5 = 587.33, E5 = 659.25, F5 = 698.46, G5 = 783.99, A5 = 880.00, Bb5 = 932.33, B5 = 987.77, C6 = 1046.50;

    // 32-step loop patterns (2 bars of 4/4 time in 16th notes)
    // 1. Kick Drum (steps 0, 4, 8, 12, 16, 20, 24, 28 + syncopations)
    const kickPattern = [
      1, 0, 0, 0, 0, 0, 1, 0,  1, 0, 0, 0, 0, 1, 0, 0,
      1, 0, 0, 0, 0, 0, 1, 0,  1, 0, 1, 0, 0, 1, 0, 0
    ];

    // 2. Snare Drum / Clap (steps 4, 12, 20, 28)
    const snarePattern = [
      0, 0, 0, 0, 1, 0, 0, 0,  0, 0, 0, 0, 1, 0, 0, 0,
      0, 0, 0, 0, 1, 0, 0, 0,  0, 0, 0, 0, 1, 0, 1, 0
    ];

    // 3. Hi-Hat (Every other 16th note with accents)
    const hatPattern = [
      1, 0, 1, 0, 1, 0, 1, 1,  1, 0, 1, 0, 1, 0, 1, 1,
      1, 0, 1, 0, 1, 0, 1, 1,  1, 0, 1, 1, 1, 1, 1, 1
    ];

    // 4. Slap Bass Line (Funky Mario Kart style!)
    const raceBass = [
      C2, 0, C3, 0, 0, Bb2, 0, C3,  0, 0, F2, 0, G2, 0, Bb2, B2,
      C2, 0, C3, 0, 0, Bb2, 0, C3,  0, 0, G2, 0, F2, 0, Eb2, D2
    ];
    const menuBass = [
      F2, 0, F3, 0, 0, F2, 0, A2,   Bb2, 0, Bb3, 0, 0, C3, 0, 0,
      D2, 0, D3, 0, 0, D2, 0, F2,   G2, 0, C3, 0, 0, C2, 0, 0
    ];

    // 5. Catchy Brass Melody
    const raceMelody = [
      C5, 0, E5, 0, G5, 0, A5, 0,  Bb5, 0, A5, 0, G5, 0, E5, 0,
      F5, 0, A5, 0, C6, 0, A5, 0,  G5, 0, F5, 0, D5, 0, G5, 0
    ];
    const menuMelody = [
      A4, 0, C5, 0, F5, 0, E5, 0,  D5, 0, F5, 0, Bb5, 0, A5, 0,
      F5, 0, D5, 0, F5, 0, A5, 0,  G5, 0, E5, 0, C5, 0, 0, 0
    ];

    const currentBass = mode === 'menu' ? menuBass : raceBass;
    const currentMelody = mode === 'menu' ? menuMelody : raceMelody;

    this.bgmTimer = setInterval(() => {
      if (this.muted || !this.ctx) return;
      const t = this.ctx.currentTime;
      const stepIdx = this.step % 32;

      // A. DRUMS (Only in race and final lap, subtle in menu)
      if (mode !== 'menu') {
        // Kick
        if (kickPattern[stepIdx]) {
          this.playKick(t);
        }
        // Snare
        if (snarePattern[stepIdx]) {
          this.playSnare(t);
        }
        // Hi-Hat
        if (hatPattern[stepIdx]) {
          this.playHiHat(t, stepIdx % 4 === 2 ? 0.06 : 0.035);
        }
      } else {
        if (stepIdx % 8 === 0) this.playKick(t, 0.12);
        if (stepIdx % 8 === 4) this.playHiHat(t, 0.04);
      }

      // B. FUNKY SLAP BASS
      const bassNote = currentBass[stepIdx];
      if (bassNote) {
        this.playSlapBass(bassNote, t, (sixteenthIntervalMs * 1.6) / 1000);
      }

      // C. BRASS LEAD MELODY (Steps with notes)
      const melNote = currentMelody[stepIdx];
      if (melNote) {
        const pitchShift = mode === 'final_lap' ? 1.05946 : 1.0; // Half-step up for Final Lap!
        this.playLeadBrass(melNote * pitchShift, t, (sixteenthIntervalMs * 1.8) / 1000);
      }

      this.step++;
    }, sixteenthIntervalMs);
  }

  // --- Drum Synthesizers ---
  playKick(t, vol = 0.25) {
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(140, t);
    osc.frequency.exponentialRampToValueAtTime(35, t + 0.12);

    gain.gain.setValueAtTime(vol, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.13);

    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start(t);
    osc.stop(t + 0.14);
  }

  playSnare(t, vol = 0.16) {
    // Noise snap + Body tone
    const dur = 0.14;
    const bufSize = Math.floor(this.ctx.sampleRate * dur);
    const buf = this.ctx.createBuffer(1, bufSize, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < bufSize; i++) d[i] = Math.random() * 2 - 1;

    const noise = this.ctx.createBufferSource();
    noise.buffer = buf;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'highpass';
    filter.frequency.setValueAtTime(950, t);

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(vol, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + dur);

    noise.connect(filter);
    filter.connect(gain);
    gain.connect(this.ctx.destination);
    noise.start(t);

    const osc = this.ctx.createOscillator();
    const oscGain = this.ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(220, t);
    osc.frequency.exponentialRampToValueAtTime(90, t + 0.08);
    oscGain.gain.setValueAtTime(vol * 0.8, t);
    oscGain.gain.exponentialRampToValueAtTime(0.001, t + 0.09);

    osc.connect(oscGain);
    oscGain.connect(this.ctx.destination);
    osc.start(t);
    osc.stop(t + 0.1);
  }

  playHiHat(t, vol = 0.05) {
    const dur = 0.045;
    const bufSize = Math.floor(this.ctx.sampleRate * dur);
    const buf = this.ctx.createBuffer(1, bufSize, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < bufSize; i++) d[i] = Math.random() * 2 - 1;

    const noise = this.ctx.createBufferSource();
    noise.buffer = buf;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'highpass';
    filter.frequency.setValueAtTime(6500, t);

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(vol, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + dur);

    noise.connect(filter);
    filter.connect(gain);
    gain.connect(this.ctx.destination);
    noise.start(t);
  }

  // --- Melodic Synthesizers ---
  playSlapBass(freq, t, dur) {
    const osc = this.ctx.createOscillator();
    const filter = this.ctx.createBiquadFilter();
    const gain = this.ctx.createGain();

    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(freq, t);

    // Resonant pluck envelope for funky slap effect
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(1400, t);
    filter.frequency.exponentialRampToValueAtTime(220, t + dur * 0.8);
    filter.Q.setValueAtTime(4.0, t);

    gain.gain.setValueAtTime(0.14, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + dur);

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }

  playLeadBrass(freq, t, dur) {
    // Twin sawtooth oscillators slightly detuned for thick brass sound
    const osc1 = this.ctx.createOscillator();
    const osc2 = this.ctx.createOscillator();
    const filter = this.ctx.createBiquadFilter();
    const gain = this.ctx.createGain();

    osc1.type = 'sawtooth';
    osc2.type = 'sawtooth';
    osc1.frequency.setValueAtTime(freq, t);
    osc2.frequency.setValueAtTime(freq * 1.006, t);

    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(2800, t);
    filter.frequency.exponentialRampToValueAtTime(1200, t + dur);

    gain.gain.setValueAtTime(0.075, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + dur);

    osc1.connect(filter);
    osc2.connect(filter);
    filter.connect(gain);
    gain.connect(this.ctx.destination);

    osc1.start(t);
    osc2.start(t);
    osc1.stop(t + dur + 0.02);
    osc2.stop(t + dur + 0.02);
  }

  stopBGM() {
    if (this.bgmTimer) {
      clearInterval(this.bgmTimer);
      this.bgmTimer = null;
    }
    this.bgmMode = null;
  }
}

window.soundEngine = new SoundEngine();
