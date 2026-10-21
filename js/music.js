// Background music while a timer runs: two built-in synthesized beats or the user's own file.
// Kept quiet on purpose and ducked further whenever a voice cue, countdown or bell plays.
import { settings } from './settings.js';
import { sound, setCueListener } from './audio.js';

export const MUSIC_CHOICES = {
  off: 'Off',
  energy: 'Energy beat',
  chill: 'Chill beat',
  file: 'My music file',
};

const USER_CACHE = 'timerplus-user';
const USER_KEY = 'music-file';

const STYLES = {
  // bpm, bass roots per bar (Hz), chord per bar (Hz)
  energy: {
    bpm: 128,
    roots: [55, 43.65, 65.41, 49],
    chords: [[220, 261.6, 329.6], [174.6, 220, 261.6], [261.6, 329.6, 392], [196, 246.9, 293.7]],
    kick: [0, 4, 8, 12], snare: [4, 12], hat: [2, 6, 10, 14], bass: [2, 6, 10, 14],
  },
  chill: {
    bpm: 88,
    roots: [55, 41.2, 49, 36.7],
    chords: [[220, 277.2, 329.6], [164.8, 207.7, 246.9], [196, 246.9, 293.7], [146.8, 185, 220]],
    kick: [0, 10], snare: [4, 12], hat: [0, 2, 4, 6, 8, 10, 12, 14], bass: [0, 8],
  },
};

class Music {
  constructor() {
    this.playing = false;
    this.out = null; // gain node for everything music
    this.duckUntil = 0;
    this.timer = null;
    this.step = 0;
    this.nextTime = 0;
    this.audioEl = null;
    this.fileName = null;
    this.previewTimer = null;
    setCueListener((secs) => this.duck(secs));
    this.loadFileName();
  }

  level() {
    // Background level stays low: at most ~35% of the cue volume.
    return 0.35 * settings.musicVolume * settings.musicVolume;
  }

  ensureOut() {
    const ctx = sound.ensure();
    if (!ctx) return null;
    if (!this.out) {
      this.out = ctx.createGain();
      this.out.gain.value = 0;
      this.out.connect(ctx.destination);
    }
    return ctx;
  }

  // Called every frame with whether any timer is running.
  update(running) {
    const want = running && settings.music !== 'off';
    if (want && (!this.playing || this.style !== settings.music)) this.start();
    else if (!want && this.playing && !this.previewTimer) this.stop();
    if (this.playing) this.applyLevel();
  }

  applyLevel() {
    const ctx = sound.ctx;
    if (!ctx || !this.out) return;
    const ducked = ctx.currentTime < this.duckUntil;
    const target = ducked ? this.level() * 0.15 : this.level();
    if (Math.abs(this.out.gain.value - target) > 0.002) {
      this.out.gain.setTargetAtTime(target, ctx.currentTime, ducked ? 0.04 : 0.35);
    }
  }

  duck(secs) {
    const ctx = sound.ctx;
    if (!ctx) return;
    this.duckUntil = Math.max(this.duckUntil, ctx.currentTime + secs);
    if (this.playing) this.applyLevel();
  }

  async start() {
    this.stop();
    const ctx = this.ensureOut();
    if (!ctx) return;
    this.style = settings.music;
    this.playing = true;
    if (this.style === 'file') {
      const ok = await this.startFile();
      if (!ok) this.playing = false;
      return;
    }
    this.step = 0;
    this.nextTime = ctx.currentTime + 0.1;
    this.timer = setInterval(() => this.schedule(), 25);
  }

  stop() {
    clearInterval(this.timer);
    this.timer = null;
    if (this.audioEl) {
      this.audioEl.pause();
    }
    if (this.out && sound.ctx) this.out.gain.setTargetAtTime(0, sound.ctx.currentTime, 0.05);
    this.playing = false;
  }

  // Short preview from Settings.
  preview(secs = 6) {
    clearTimeout(this.previewTimer);
    this.previewTimer = null;
    if (settings.music === 'off') { this.stop(); return; }
    sound.unlock();
    this.start();
    this.previewTimer = setTimeout(() => { this.previewTimer = null; this.stop(); }, secs * 1000);
  }

  // ---------- synthesized beats ----------
  schedule() {
    const ctx = sound.ctx;
    const st = STYLES[this.style];
    if (!ctx || !st) return;
    const stepDur = 60 / st.bpm / 4;
    while (this.nextTime < ctx.currentTime + 0.12) {
      this.playStep(st, this.step % 16, Math.floor(this.step / 16) % 4, this.nextTime, stepDur);
      this.nextTime += stepDur;
      this.step++;
    }
  }

  playStep(st, i, bar, t, stepDur) {
    if (st.kick.includes(i)) this.kick(t);
    if (st.snare.includes(i)) this.snare(t);
    if (st.hat.includes(i)) this.hat(t, this.style === 'chill' ? 0.05 : 0.08);
    if (st.bass.includes(i)) this.bass(st.roots[bar], t, stepDur * 1.8);
    if (i === 0) st.chords[bar].forEach((f) => this.pad(f, t, stepDur * 16));
  }

  osc(type, freq, t, dur, gain, { freqEnd, attack = 0.005, filter } = {}) {
    const ctx = sound.ctx;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (freqEnd) o.frequency.exponentialRampToValueAtTime(freqEnd, t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    let node = o;
    if (filter) {
      const f = ctx.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.value = filter;
      o.connect(f);
      node = f;
    }
    node.connect(g);
    g.connect(this.out);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  noise(t, dur, gain, type, freq) {
    const ctx = sound.ctx;
    if (!this.noiseBuf) {
      const len = Math.floor(ctx.sampleRate * 0.3);
      this.noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
      const d = this.noiseBuf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    }
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f);
    f.connect(g);
    g.connect(this.out);
    src.start(t);
    src.stop(t + dur + 0.02);
  }

  kick(t) { this.osc('sine', 150, t, 0.32, 0.9, { freqEnd: 42, attack: 0.002 }); }
  snare(t) {
    this.noise(t, 0.16, 0.35, 'highpass', 1500);
    this.osc('triangle', 190, t, 0.1, 0.25);
  }
  hat(t, gain) { this.noise(t, 0.04, gain, 'highpass', 7000); }
  bass(f, t, dur) { this.osc('sawtooth', f, t, dur, 0.35, { filter: 380, attack: 0.01 }); }
  pad(f, t, dur) {
    this.osc('triangle', f, t, dur, 0.06, { attack: 0.4, filter: 1200 });
    this.osc('sine', f * 1.003, t, dur, 0.05, { attack: 0.5 });
  }

  // ---------- user's own file ----------
  async loadFileName() {
    try {
      const cache = await caches.open(USER_CACHE);
      const res = await cache.match(USER_KEY);
      this.fileName = res ? decodeURIComponent(res.headers.get('X-Name') || 'music') : null;
    } catch { this.fileName = null; }
  }

  async saveFile(file) {
    const cache = await caches.open(USER_CACHE);
    await cache.put(USER_KEY, new Response(file, {
      headers: { 'Content-Type': file.type || 'audio/mpeg', 'X-Name': encodeURIComponent(file.name) },
    }));
    this.fileName = file.name;
    if (this.audioEl) { URL.revokeObjectURL(this.audioEl.src); this.audioEl = null; }
  }

  async startFile() {
    const ctx = sound.ctx;
    try {
      if (!this.audioEl) {
        const cache = await caches.open(USER_CACHE);
        const res = await cache.match(USER_KEY);
        if (!res) return false;
        const el = new Audio(URL.createObjectURL(await res.blob()));
        el.loop = true;
        el.playsInline = true;
        ctx.createMediaElementSource(el).connect(this.out);
        this.audioEl = el;
      }
      await this.audioEl.play();
      return true;
    } catch {
      return false;
    }
  }
}

export const music = new Music();
