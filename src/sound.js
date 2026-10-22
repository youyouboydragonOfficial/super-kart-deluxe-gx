// Web Audio API Procedural Sound Engine & Music Sequencer for Super Kart Deluxe GX
class SoundEngine {
  constructor() {
    this.ctx = null;
    this.muted = false;
    this.bgmMode = null;
    this.bgmTimer = null;
    this.engineOsc = null;
    this.engineGain = null;
    this.driftOsc = null;
    this.driftGain = null;
    this.lastWallHitTime = 0;
    this.lastCrashSoundTime = 0;
  }

  init() {
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      this.ctx = new AudioCtx();
      this.setupEngineSound();
    }
    if (this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
  }

  setupEngineSound() {
    if (!this.ctx) return;
    this.engineOsc = this.ctx.createOscillator();
    this.engineOsc.type = 'sawtooth';
    this.engineOsc.frequency.value = 55;

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 260;

    this.engineGain = this.ctx.createGain();
    this.engineGain.gain.value = 0.0;

    this.engineOsc.connect(filter);
    filter.connect(this.engineGain);
    this.engineGain.connect(this.ctx.destination);
    this.engineOsc.start();
  }

  updateEngine(speedRatio, drifting, boostActive, inRace) {
    if (!this.ctx || !this.engineGain) return;
    if (!inRace || this.muted) {
      this.engineGain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.05);
      return;
    }
    const baseFreq = 50 + Math.abs(speedRatio) * 145 + (boostActive ? 55 : 0) + (drifting ? 18 : 0);
    this.engineOsc.frequency.setTargetAtTime(baseFreq, this.ctx.currentTime, 0.04);
    this.engineGain.gain.setTargetAtTime(0.055, this.ctx.currentTime, 0.05);
  }

  playTone(freq, duration, type = 'square', vol = 0.12, slideTo = null, delay = 0) {
    if (this.muted) return;
    this.init();
    const t = this.ctx.currentTime + delay;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    if (slideTo) {
      osc.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), t + duration);
    }
    gain.gain.setValueAtTime(vol, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + duration);
    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start(t);
    osc.stop(t + duration + 0.02);
  }

  playNoise(duration, vol = 0.15, filterFreq = 900) {
    if (this.muted) return;
    this.init();
    const bufferSize = Math.floor(this.ctx.sampleRate * duration);
    const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = Math.random() * 2 - 1;
    }
    const noise = this.ctx.createBufferSource();
    noise.buffer = buffer;

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = filterFreq;

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(vol, this.ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + duration);

    noise.connect(filter);
    filter.connect(gain);
    gain.connect(this.ctx.destination);
    noise.start();
  }

  sfxSelect() {
    this.playTone(660, 0.07, 'square', 0.12);
    this.playTone(990, 0.11, 'square', 0.12, null, 0.06);
  }

  sfxBack() {
    this.playTone(520, 0.07, 'square', 0.1);
    this.playTone(340, 0.12, 'square', 0.1, null, 0.06);
  }

  sfxCountdown(step) {
    if (step > 0) {
      this.playTone(440, 0.28, 'square', 0.18);
    } else {
      this.playTone(880, 0.55, 'square', 0.24);
      this.playTone(1320, 0.55, 'triangle', 0.18);
    }
  }

  sfxCoin() {
    this.playTone(987.77, 0.07, 'square', 0.13);
    this.playTone(1318.51, 0.25, 'square', 0.13, null, 0.07);
  }

  sfxItemRouletteTick() {
    this.playTone(580 + Math.random() * 260, 0.045, 'square', 0.08);
  }

  sfxItemDecide() {
    const notes = [523.25, 659.25, 783.99, 1046.5];
    notes.forEach((n, i) => this.playTone(n, 0.11, 'square', 0.14, null, i * 0.06));
  }

  sfxBoost() {
    this.playNoise(0.35, 0.2, 1400);
    this.playTone(220, 0.35, 'sawtooth', 0.16, 880);
  }

  sfxSparkCharge(level) {
    const base = level === 1 ? 520 : level === 2 ? 740 : 1040;
    this.playTone(base, 0.12, 'triangle', 0.12, base * 1.35);
  }

  sfxThrow() {
    this.playTone(300, 0.16, 'sawtooth', 0.14, 760);
  }

  sfxPlaceTrap() {
    this.playTone(420, 0.12, 'triangle', 0.13, 200);
  }

  sfxBoxBreak() {
    this.playTone(1200, 0.08, 'triangle', 0.18, 1600);
    this.playNoise(0.12, 0.14, 2800);
    this.playTone(1500, 0.12, 'square', 0.12, null, 0.04);
  }

  sfxTrick() {
    this.playTone(880, 0.09, 'square', 0.16, 1320);
    this.playTone(1320, 0.14, 'triangle', 0.18, 1760, 0.06);
  }

  sfxSlipstream() {
    this.playNoise(0.4, 0.22, 1100);
    this.playTone(440, 0.35, 'sawtooth', 0.15, 880);
  }

  sfxGuardBlock() {
    this.playNoise(0.15, 0.25, 600);
    this.playTone(550, 0.15, 'sawtooth', 0.2, 180);
  }

  sfxWallHit() {
    const now = performance.now();
    if (now - this.lastWallHitTime < 320) return; // Prevent sound spamming explosion
    this.lastWallHitTime = now;
    this.playNoise(0.12, 0.12, 420);
    this.playTone(130, 0.12, 'triangle', 0.12, 55);
  }

  sfxExplosion() {
    this.playNoise(0.55, 0.32, 320);
    this.playTone(160, 0.5, 'sawtooth', 0.25, 35);
  }

  sfxSpinOut() {
    for (let i = 0; i < 5; i++) {
      this.playTone(700 - i * 90, 0.08, 'square', 0.14, 380 - i * 40, i * 0.07);
    }
  }

  sfxLightning() {
    this.playNoise(0.65, 0.35, 2200);
    this.playTone(1200, 0.45, 'sawtooth', 0.22, 90);
  }

  sfxStarTick() {
    const starNotes = [784, 987, 1174, 1046, 1318, 1567];
    const n = starNotes[Math.floor(Math.random() * starNotes.length)];
    this.playTone(n, 0.09, 'square', 0.09);
  }

  sfxGimmickSwitch() {
    this.playTone(440, 0.1, 'sine', 0.15, 880);
    this.playTone(880, 0.18, 'triangle', 0.15, 1320, 0.08);
  }

  sfxLap(finalLap = false) {
    const seq = finalLap ? [587, 698, 880, 1174, 1396] : [523, 659, 784, 1046];
    seq.forEach((n, i) => this.playTone(n, 0.14, 'square', 0.16, null, i * 0.09));
  }

  sfxGoal(rank) {
    const winNotes = rank === 1
      ? [523, 659, 784, 1046, 784, 1046, 1318]
      : [440, 523, 659, 784, 659, 784];
    winNotes.forEach((n, i) => this.playTone(n, 0.18, 'square', 0.17, null, i * 0.12));
  }

  startBGM(mode = 'menu') {
    this.init();
    if (this.bgmMode === mode && this.bgmTimer) return;
    this.stopBGM();
    this.bgmMode = mode;

    const menuMelody = [
      523.25, 659.25, 783.99, 1046.50, 987.77, 783.99, 659.25, 783.99,
      587.33, 698.46, 880.00, 1174.66, 1046.50, 880.00, 698.46, 587.33
    ];
    const raceMelody = [
      659.25, 659.25, 0, 659.25, 0, 523.25, 659.25, 783.99,
      880.00, 783.99, 659.25, 587.33, 698.46, 783.99, 880.00, 1046.50,
      987.77, 783.99, 587.33, 783.99, 880.00, 1046.50, 987.77, 783.99
    ];

    let step = 0;
    const tempoMs = mode === 'race' ? 145 : 190;
    const seq = mode === 'race' ? raceMelody : menuMelody;

    this.bgmTimer = setInterval(() => {
      if (this.muted) return;
      const note = seq[step % seq.length];
      if (note > 0) {
        this.playTone(note, tempoMs / 1000 * 0.85, mode === 'race' ? 'square' : 'triangle', 0.045);
        // Bass note
        if (step % 2 === 0) {
          this.playTone(note / 2, tempoMs / 1000 * 0.9, 'triangle', 0.05);
        }
      }
      step++;
    }, tempoMs);
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
