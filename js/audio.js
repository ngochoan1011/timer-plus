// Sound effects (synthesised with Web Audio, no audio files needed) and voice prompts.
import { settings } from './settings.js';

export const SCHEMES = {
  gong: 'Boxing gong',
  beep: 'Beep',
  whistle: 'Whistle',
  digital: 'Digital',
};

class SoundEngine {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.noiseBuf = null;
  }

  ensure() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.connect(this.ctx.destination);
      this.applyVolume();
    }
    if (this.ctx.state !== 'running') this.ctx.resume().catch(() => {});
    return this.ctx;
  }

  // Must be called from a user gesture (iOS only allows audio after a tap).
  unlock() {
    applyAudioSession();
    const ctx = this.ensure();
    if (!ctx) return;
    const buf = ctx.createBuffer(1, 1, 22050);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.connect(ctx.destination);
    src.start(0);
  }

  applyVolume() {
    if (this.master) this.master.gain.value = Math.pow(settings.volume, 1.5);
  }

  tone(freq, t, dur, { type = 'sine', gain = 0.4, attack = 0.004, sustain = false, freqEnd } = {}) {
    const ctx = this.ctx;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (freqEnd) o.frequency.exponentialRampToValueAtTime(freqEnd, t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + attack);
    if (sustain) g.gain.setValueAtTime(gain, Math.max(t + attack, t + dur - 0.06));
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g);
    g.connect(this.master);
    o.start(t);
    o.stop(t + dur + 0.05);
    return o;
  }

  bell(t, base = 520, len = 2.4, gain = 0.45) {
    const partials = [
      [1, 1], [2, 0.55], [2.76, 0.5], [4.07, 0.3], [5.4, 0.22], [6.8, 0.12], [8.9, 0.06],
    ];
    partials.forEach(([ratio, amp], i) => {
      this.tone(base * ratio, t, len / (1 + i * 0.45), { gain: gain * amp, attack: 0.002 });
    });
    this.noise(t, 0.03, 0.25, 3000);
  }

  whistle(t, dur) {
    const ctx = this.ctx;
    const o = this.tone(2850, t, dur, { gain: 0.3, attack: 0.02, sustain: true });
    const lfo = ctx.createOscillator();
    const lg = ctx.createGain();
    lfo.frequency.value = 32;
    lg.gain.value = 160;
    lfo.connect(lg);
    lg.connect(o.frequency);
    lfo.start(t);
    lfo.stop(t + dur + 0.05);
  }

  noise(t, dur, gain = 0.3, freq = 1500) {
    const ctx = this.ctx;
    if (!this.noiseBuf) {
      const len = Math.floor(ctx.sampleRate * 0.5);
      this.noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
      const data = this.noiseBuf.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    }
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = freq;
    filter.Q.value = 1.2;
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(filter);
    filter.connect(g);
    g.connect(this.master);
    src.start(t);
    src.stop(t + dur + 0.02);
  }

  // cue: start | rest | count | finish | warn
  play(cue, { force = false, scheme = settings.scheme } = {}) {
    if (!settings.sound && !force) return;
    const ctx = this.ensure();
    if (!ctx) return;
    const t = ctx.currentTime + 0.02;
    const fn = PATTERNS[scheme]?.[cue];
    if (fn) fn(this, t);
  }

  tick() {
    if (!settings.ticking) return;
    const ctx = this.ensure();
    if (!ctx) return;
    const t = ctx.currentTime + 0.01;
    this.noise(t, 0.025, 0.35, 2500);
  }
}

const PATTERNS = {
  gong: {
    start: (s, t) => s.bell(t, 520, 2.6),
    rest: (s, t) => { s.bell(t, 520, 1.2, 0.35); s.bell(t + 0.32, 520, 1.6, 0.35); },
    count: (s, t) => s.tone(880, t, 0.18, { gain: 0.45 }),
    finish: (s, t) => { [0, 0.3, 0.6].forEach((d) => s.bell(t + d, 520, d === 0.6 ? 2.6 : 1.2, 0.38)); },
    warn: (s, t) => { s.noise(t, 0.06, 0.6, 1800); s.noise(t + 0.16, 0.06, 0.6, 1800); },
  },
  beep: {
    start: (s, t) => s.tone(1320, t, 0.6, { gain: 0.45, sustain: true }),
    rest: (s, t) => s.tone(660, t, 0.6, { gain: 0.45, sustain: true }),
    count: (s, t) => s.tone(880, t, 0.15, { gain: 0.45, sustain: true }),
    finish: (s, t) => { [0, 0.25, 0.5].forEach((d) => s.tone(1320, t + d, 0.18, { gain: 0.45, sustain: true })); },
    warn: (s, t) => { s.tone(990, t, 0.1, { sustain: true }); s.tone(990, t + 0.16, 0.1, { sustain: true }); },
  },
  whistle: {
    start: (s, t) => s.whistle(t, 0.75),
    rest: (s, t) => { s.whistle(t, 0.22); s.whistle(t + 0.32, 0.22); },
    count: (s, t) => s.tone(1000, t, 0.12, { gain: 0.4, sustain: true }),
    finish: (s, t) => { s.whistle(t, 0.3); s.whistle(t + 0.4, 0.3); s.whistle(t + 0.8, 1.0); },
    warn: (s, t) => s.whistle(t, 0.15),
  },
  digital: {
    start: (s, t) => { s.tone(1046, t, 0.12, { type: 'square', gain: 0.12, sustain: true }); s.tone(1568, t + 0.13, 0.32, { type: 'square', gain: 0.12, sustain: true }); },
    rest: (s, t) => { s.tone(1568, t, 0.12, { type: 'square', gain: 0.12, sustain: true }); s.tone(1046, t + 0.13, 0.32, { type: 'square', gain: 0.12, sustain: true }); },
    count: (s, t) => s.tone(1046, t, 0.1, { type: 'square', gain: 0.12, sustain: true }),
    finish: (s, t) => { [1046, 1318, 1568, 2093].forEach((f, i) => s.tone(f, t + i * 0.12, i === 3 ? 0.5 : 0.11, { type: 'square', gain: 0.12, sustain: true })); },
    warn: (s, t) => { s.tone(784, t, 0.08, { type: 'square', gain: 0.12, sustain: true }); s.tone(784, t + 0.14, 0.08, { type: 'square', gain: 0.12, sustain: true }); },
  },
};

export const sound = new SoundEngine();

// iOS 16.4+ lets web apps choose how audio mixes with other apps.
export function applyAudioSession() {
  try {
    if (navigator.audioSession) {
      navigator.audioSession.type = settings.ducking ? 'transient' : 'auto';
    }
  } catch {
    /* unsupported */
  }
}

// ---------- Voice ----------
const synth = 'speechSynthesis' in window ? window.speechSynthesis : null;

export const voice = {
  supported: !!synth,
  list: [],

  load() {
    if (!synth) return [];
    const all = synth.getVoices();
    const en = all.filter((v) => /^en/i.test(v.lang));
    this.list = (en.length ? en : all).slice().sort((a, b) => a.name.localeCompare(b.name));
    return this.list;
  },

  current() {
    if (!this.list.length) this.load();
    return this.list.find((v) => v.voiceURI === settings.voiceURI) || null;
  },

  unlock() {
    if (!synth || this.unlocked) return;
    this.unlocked = true;
    const u = new SpeechSynthesisUtterance(' ');
    u.volume = 0;
    synth.speak(u);
  },

  speak(text, { force = false } = {}) {
    if (!synth || (!settings.voice && !force)) return;
    synth.cancel();
    const u = new SpeechSynthesisUtterance(text);
    const v = this.current();
    if (v) {
      u.voice = v;
      u.lang = v.lang;
    } else {
      u.lang = 'en-US';
    }
    u.volume = Math.min(1, settings.volume + 0.2);
    u.rate = 1.05;
    synth.speak(u);
  },
};

if (synth) {
  voice.load();
  synth.addEventListener?.('voiceschanged', () => voice.load());
}
