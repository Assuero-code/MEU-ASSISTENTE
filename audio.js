// audio.js - Motor Sintetizador Acústico e Efeitos Sonoros
const AudioEngine = {
  ctx: null,

  init() {
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (AudioCtx) this.ctx = new AudioCtx();
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
  },

  playTone(freq = 440, type = 'sine', duration = 0.5, delay = 0) {
    this.init();
    if (!this.ctx) return;

    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = type;
    osc.frequency.setValueAtTime(freq, this.ctx.currentTime + delay);

    gain.gain.setValueAtTime(0.3, this.ctx.currentTime + delay);
    gain.gain.exponentialRampToValueAtTime(0.0001, this.ctx.currentTime + delay + duration);

    osc.connect(gain);
    gain.connect(this.ctx.destination);

    osc.start(this.ctx.currentTime + delay);
    osc.stop(this.ctx.currentTime + delay + duration);
  },

  beepSuccess() {
    this.playTone(523.25, 'triangle', 0.15, 0); // C5
    this.playTone(659.25, 'triangle', 0.25, 0.12); // E5
  },

  beepAlert() {
    this.playTone(880, 'square', 0.2, 0); // A5
    this.playTone(880, 'square', 0.2, 0.25);
  },

  // Loop de Alarme Acústico
  alarmLoopTimer: null,
  isAlarmPlaying: false,

  startAlarmSound(pattern = 'classic') {
    this.init();
    this.isAlarmPlaying = true;
    
    const runCycle = () => {
      if (!this.isAlarmPlaying) return;
      if (pattern === 'gentle') {
        this.playTone(440, 'sine', 0.4, 0);
        this.playTone(554.37, 'sine', 0.4, 0.2);
        this.playTone(659.25, 'sine', 0.6, 0.4);
      } else {
        // Classic digital alarm
        this.playTone(950, 'sawtooth', 0.1, 0);
        this.playTone(950, 'sawtooth', 0.1, 0.15);
        this.playTone(950, 'sawtooth', 0.1, 0.3);
      }
      this.alarmLoopTimer = setTimeout(runCycle, 1500);
    };
    runCycle();
  },

  stopAlarmSound() {
    this.isAlarmPlaying = false;
    if (this.alarmLoopTimer) {
      clearTimeout(this.alarmLoopTimer);
      this.alarmLoopTimer = null;
    }
  }
};

window.AudioEngine = AudioEngine;