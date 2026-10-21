// Interval timer engine + view, used for both the Tabata and Rounds tabs.
import { settings, loadJSON, saveJSON, formatTime, formatDuration } from './settings.js';
import { sound, voice } from './audio.js';
import { vibrate, flashScreen, wakeLock } from './effects.js';
import { ICONS, h, escapeHTML, openSheet, holdRepeat, fitFactor } from './ui.js';

const MODES = {
  tabata: {
    title: 'Tabata',
    defaults: { prepare: 20, work: 30, rest: 20, rounds: 15, cycles: 2, cycleRest: 60, cooldown: 0 },
    fields: [
      { key: 'prepare', label: 'Prepare', type: 'time', min: 0, max: 600, phase: 'prepare' },
      { key: 'work', label: 'Work', type: 'time', min: 1, max: 3600, phase: 'work' },
      { key: 'rest', label: 'Rest', type: 'time', min: 0, max: 3600, phase: 'rest' },
      { key: 'rounds', label: 'Rounds', type: 'count', min: 1, max: 99 },
      { key: 'cycles', label: 'Cycles', type: 'count', min: 1, max: 30 },
      { key: 'cycleRest', label: 'Cool down between cycles', type: 'time', min: 0, max: 3600, phase: 'cyclerest' },
      { key: 'cooldown', label: 'Cool down at the end', type: 'time', min: 0, max: 1800, phase: 'cooldown' },
    ],
    presets: [
      { name: '20:10 × 8', work: 20, rest: 10, rounds: 8, cycles: 1 },
      { name: '30:20', work: 30, rest: 20 },
      { name: '40:20', work: 40, rest: 20 },
      { name: '45:15', work: 45, rest: 15 },
      { name: '50:10', work: 50, rest: 10 },
      { name: 'EMOM 10', work: 60, rest: 0, rounds: 10, cycles: 1 },
    ],
    subtitle: (c) => `${c.work}:${c.rest}`,
  },
  rounds: {
    title: 'Rounds',
    defaults: { prepare: 10, round: 180, rest: 60, rounds: 12, warn: 10, cooldown: 0 },
    fields: [
      { key: 'prepare', label: 'Prepare', type: 'time', min: 0, max: 600, phase: 'prepare' },
      { key: 'round', label: 'Round time', type: 'time', min: 5, max: 3600, phase: 'work' },
      { key: 'rest', label: 'Rest', type: 'time', min: 0, max: 3600, phase: 'rest' },
      { key: 'rounds', label: 'Rounds', type: 'count', min: 1, max: 99 },
      { key: 'warn', label: 'Round end warning', type: 'time', min: 0, max: 60, note: 'Clap & voice before the round ends' },
      { key: 'cooldown', label: 'Cool down at the end', type: 'time', min: 0, max: 1800, phase: 'cooldown' },
    ],
    presets: [
      { name: 'Boxing pro', round: 180, rest: 60, rounds: 12 },
      { name: 'Boxing amateur', round: 180, rest: 60, rounds: 3 },
      { name: 'MMA', round: 300, rest: 60, rounds: 3 },
      { name: 'MMA title', round: 300, rest: 60, rounds: 5 },
      { name: 'Muay Thai', round: 180, rest: 120, rounds: 5 },
      { name: 'Sparring 2:00', round: 120, rest: 30, rounds: 6 },
    ],
    subtitle: (c) => `${c.rounds} × ${formatDuration(c.round)}`,
  },
};

const PHASE_VOICE = { prepare: 'Get ready', work: 'Work', rest: 'Rest', cyclerest: 'Cycle complete. Cool down', cooldown: 'Cool down' };

function buildSegments(mode, c) {
  const segs = [];
  if (c.prepare > 0) segs.push({ type: 'prepare', label: 'Prepare', dur: c.prepare, round: 0, cycle: 1 });
  if (mode === 'tabata') {
    for (let cy = 1; cy <= c.cycles; cy++) {
      for (let r = 1; r <= c.rounds; r++) {
        segs.push({ type: 'work', label: 'Work', dur: c.work, round: r, cycle: cy });
        const lastRound = r === c.rounds;
        if (lastRound && cy === c.cycles) break;
        if (lastRound && c.cycleRest > 0) {
          segs.push({ type: 'cyclerest', label: 'Cool down', dur: c.cycleRest, round: r, cycle: cy, after: true });
        } else if (c.rest > 0) {
          segs.push({ type: 'rest', label: 'Rest', dur: c.rest, round: r, cycle: cy, after: true });
        }
      }
    }
  } else {
    for (let r = 1; r <= c.rounds; r++) {
      segs.push({ type: 'work', label: `Round ${r}`, dur: c.round, round: r, cycle: 1 });
      if (r < c.rounds && c.rest > 0) segs.push({ type: 'rest', label: 'Rest', dur: c.rest, round: r, cycle: 1, after: true });
    }
  }
  if (c.cooldown > 0) {
    const last = segs[segs.length - 1] || { round: 0, cycle: 1 };
    segs.push({ type: 'cooldown', label: 'Cool down', dur: c.cooldown, round: last.round, cycle: last.cycle, after: true, final: true });
  }
  let t = 0;
  for (const s of segs) {
    s.start = t;
    t += s.dur;
  }
  return segs;
}

export class IntervalTimer {
  constructor(root, mode) {
    this.root = root;
    this.mode = mode;
    this.def = MODES[mode];
    this.cfgKey = `timerplus.${mode}.config`;
    this.stateKey = `timerplus.${mode}.state`;
    this.cfg = loadJSON(this.cfgKey, this.def.defaults);
    this.state = loadJSON(this.stateKey, { status: 'idle', accMs: 0, startedAt: 0 });
    this.rebuild();
    this.lastIndex = null;
    this.lastRem = null;
    this.mount();
    // Restore a timer that was running when the app was closed.
    if (this.state.status === 'running') {
      const pos = this.locate(this.elapsedMs());
      this.lastIndex = pos.index;
      this.lastRem = pos.rem;
      wakeLock.set(this, true);
    }
    this.render();
  }

  rebuild() {
    this.segs = buildSegments(this.mode, this.cfg);
    this.totalSec = this.segs.reduce((a, s) => a + s.dur, 0);
  }

  saveState() {
    saveJSON(this.stateKey, this.state);
  }

  elapsedMs() {
    const s = this.state;
    return s.status === 'running' ? s.accMs + (Date.now() - s.startedAt) : s.accMs;
  }

  locate(ms) {
    const sec = ms / 1000;
    if (!this.segs.length || sec >= this.totalSec) {
      return { done: true, index: this.segs.length, seg: null, segElapsed: 0, rem: 0 };
    }
    let i = 0;
    while (i < this.segs.length - 1 && sec >= this.segs[i + 1].start) i++;
    const seg = this.segs[i];
    const segElapsed = sec - seg.start;
    return { done: false, index: i, seg, segElapsed, rem: Math.ceil(seg.dur - segElapsed - 1e-6) };
  }

  // ---------- controls ----------
  toggle() {
    sound.unlock();
    voice.unlock();
    const s = this.state;
    if (s.status === 'running') {
      s.accMs = this.elapsedMs();
      s.status = 'paused';
      wakeLock.set(this, false);
    } else {
      if (s.status === 'done') this.reset(false);
      const fresh = s.status === 'idle';
      s.status = 'running';
      s.startedAt = Date.now();
      wakeLock.set(this, true);
      if (fresh) {
        const pos = this.locate(0);
        this.lastIndex = pos.index;
        this.lastRem = pos.rem;
        const rang = settings.bell !== 'off';
        if (rang) sound.ring(1);
        if (pos.seg) this.onSegmentStart(pos.seg, { quiet: rang });
      }
    }
    this.saveState();
    this.render();
  }

  reset(render = true) {
    this.state = { status: 'idle', accMs: 0, startedAt: 0 };
    this.lastIndex = null;
    this.lastRem = null;
    wakeLock.set(this, false);
    this.saveState();
    if (render) this.render();
  }

  // Called frequently; fires sound/voice cues when seconds or phases change.
  tick() {
    if (this.state.status !== 'running') return;
    const pos = this.locate(this.elapsedMs());
    if (pos.done) {
      this.state.status = 'done';
      this.state.accMs = this.totalSec * 1000;
      this.saveState();
      wakeLock.set(this, false);
      if (settings.bell !== 'off') sound.ring(3);
      else sound.play('finish');
      voice.speak('Workout complete. Great job!');
      vibrate([300, 150, 300, 150, 600]);
      flashScreen();
      return;
    }
    if (pos.index !== this.lastIndex) {
      this.lastIndex = pos.index;
      this.lastRem = pos.rem;
      this.onSegmentStart(pos.seg);
      return;
    }
    if (pos.rem !== this.lastRem) {
      const live = this.lastRem - pos.rem === 1; // false when catching up after the app was suspended
      this.lastRem = pos.rem;
      if (!live) return;
      this.onSecond(pos.seg, pos.rem);
    }
  }

  onSegmentStart(seg, { quiet = false } = {}) {
    const isRest = seg.type === 'rest' || seg.type === 'cyclerest' || seg.type === 'cooldown';
    if (quiet || seg.type === 'prepare') {
      // the start bell already rang
    } else if (settings.bell === 'every') {
      sound.ring(seg.type === 'work' ? 1 : 2);
    } else if (seg.type === 'work') {
      sound.play('start');
    } else if (isRest) {
      sound.play('rest');
    }
    let text = PHASE_VOICE[seg.type];
    if (this.mode === 'rounds' && seg.type === 'work') {
      text = seg.round === this.cfg.rounds && this.cfg.rounds > 1 ? 'Last round' : `Round ${seg.round}`;
    } else if (this.mode === 'tabata' && seg.type === 'work') {
      const isLast = seg.round === this.cfg.rounds && seg.cycle === this.cfg.cycles && this.cfg.rounds * this.cfg.cycles > 1;
      if (isLast) text = 'Last round. Work';
    }
    voice.speak(text);
    if (seg.type !== 'prepare') {
      vibrate(seg.type === 'work' ? [400] : [200, 100, 200]);
      flashScreen();
    }
  }

  onSecond(seg, rem) {
    if (rem >= 1 && rem <= 3 && seg.dur > 3) {
      if (settings.countdown) {
        sound.countdown(rem);
        voice.speak(String(rem));
      }
      vibrate(80);
      return;
    }
    if (this.mode === 'rounds' && seg.type === 'work' && this.cfg.warn > 0 && rem === this.cfg.warn && seg.dur > this.cfg.warn + 3) {
      sound.play('warn');
      voice.speak(`${rem} seconds`);
      return;
    }
    if (seg.type === 'work' && seg.dur >= 30 && rem === Math.floor(seg.dur / 2)) {
      voice.speak('Halfway');
    }
    sound.tick();
  }

  // ---------- view ----------
  mount() {
    const root = this.root;
    const isTabata = this.mode === 'tabata';
    root.innerHTML = `
      <header class="topbar">
        <button class="icon-btn" data-act="settings" aria-label="Settings">${ICONS.gear}</button>
        <button class="title-block" data-act="edit" aria-label="Edit workout">
          <div class="title">${this.def.title}</div>
          <div class="subtitle" data-el="subtitle"></div>
        </button>
        <button class="icon-btn" data-act="edit" aria-label="Edit workout">${ICONS.sliders}</button>
      </header>
      <div class="stage">
        <button class="reset-btn" data-act="reset" aria-label="Reset">${ICONS.restart}</button>
        <div class="panel current" data-el="cur" data-act="edit">
          <div class="phase-label" data-el="curLabel"></div>
          <div class="phase-time" data-el="curTime"></div>
          <div class="sub-info" data-el="curInfo"></div>
          <div class="progress"><div data-el="progress"></div></div>
        </div>
        <div class="panel next" data-el="next" data-act="edit">
          <div class="phase-label" data-el="nextLabel"></div>
          <div class="phase-time" data-el="nextTime"></div>
        </div>
      </div>
      <div class="controls">
        <div class="stat">
          <div class="stat-value blue" data-el="leftVal"></div>
          <div class="stat-label">Rounds left</div>
        </div>
        <div class="start-wrap">
          <button class="start-btn" data-act="toggle" aria-label="Start" data-el="startBtn"></button>
          <div class="start-label" data-el="startLabel"></div>
        </div>
        <div class="stat">
          <div class="stat-value ${isTabata ? 'yellow' : 'white time'}" data-el="rightVal"></div>
          <div class="stat-label">${isTabata ? 'Cycles left' : 'Time left'}</div>
        </div>
      </div>`;
    this.els = {};
    root.querySelectorAll('[data-el]').forEach((el) => { this.els[el.dataset.el] = el; });
    root.addEventListener('click', (e) => {
      const act = e.target.closest('[data-act]')?.dataset.act;
      if (act === 'toggle') this.toggle();
      else if (act === 'reset') this.reset();
      else if (act === 'edit') this.openEditor();
      else if (act === 'settings') this.onOpenSettings?.();
    });
    this.prev = {};
  }

  set(key, prop, value) {
    const cacheKey = key + '.' + prop;
    if (this.prev[cacheKey] === value) return;
    this.prev[cacheKey] = value;
    const el = this.els[key];
    if (prop === 'text') el.textContent = value;
    else if (prop === 'html') el.innerHTML = value;
    else if (prop === 'phase') el.dataset.phase = value;
    else if (prop === 'fit') el.style.setProperty('--fit', value);
    else if (prop === 'lfit') el.style.setProperty('--lfit', value);
  }

  // Phase names like "Cool down" or "Round 30" shrink to fit like the times do.
  setLabel(key, text) {
    this.set(key, 'text', text);
    this.set(key, 'lfit', fitFactor(text, 7));
  }

  setTime(key, text) {
    this.set(key, 'text', text);
    this.set(key, 'fit', fitFactor(text));
  }

  render() {
    const st = this.state.status;
    const ms = st === 'idle' ? 0 : this.elapsedMs();
    const pos = this.locate(ms);
    const c = this.cfg;
    const isTabata = this.mode === 'tabata';

    this.set('subtitle', 'text', this.def.subtitle(c));

    let roundsLeft;
    let cyclesLeft;
    if (pos.done) {
      this.set('cur', 'phase', 'done');
      this.setLabel('curLabel', 'Well done');
      this.setTime('curTime', formatTime(0));
      this.set('curInfo', 'text', '');
      this.els.progress.style.width = '100%';
      this.set('next', 'phase', 'none');
      this.setLabel('nextLabel', 'Total time');
      this.setTime('nextTime', formatTime(this.totalSec));
      roundsLeft = 0;
      cyclesLeft = 0;
    } else {
      const seg = pos.seg;
      const rem = st === 'idle' ? seg.dur : pos.rem;
      this.set('cur', 'phase', seg.type);
      this.setLabel('curLabel', seg.label);
      this.setTime('curTime', formatTime(rem));
      let info = '';
      if (isTabata && seg.type === 'work' && c.cycles > 1) info = `Cycle ${seg.cycle} of ${c.cycles}`;
      if (!isTabata && seg.type === 'work') info = `of ${c.rounds}`;
      if (st === 'paused') info = 'Paused';
      this.set('curInfo', 'text', info);
      this.els.progress.style.width = `${Math.min(100, (pos.segElapsed / seg.dur) * 100)}%`;

      const nextSeg = this.segs[pos.index + 1];
      if (nextSeg) {
        this.set('next', 'phase', nextSeg.type);
        this.setLabel('nextLabel', nextSeg.label);
        this.setTime('nextTime', formatTime(nextSeg.dur));
      } else {
        this.set('next', 'phase', 'none');
        this.setLabel('nextLabel', 'Finish');
        this.setTime('nextTime', formatTime(0));
      }

      const rounds = c.rounds;
      if (seg.type === 'prepare') roundsLeft = rounds;
      else roundsLeft = seg.after ? rounds - seg.round : rounds - seg.round + 1;
      if (seg.type === 'cyclerest') roundsLeft = rounds;
      cyclesLeft = seg.type === 'cyclerest' ? c.cycles - seg.cycle : c.cycles - seg.cycle + 1;
      if (seg.type === 'cooldown') { roundsLeft = 0; cyclesLeft = 0; }
    }

    this.set('leftVal', 'text', String(roundsLeft));
    if (isTabata) {
      this.set('rightVal', 'text', String(cyclesLeft));
    } else {
      const left = Math.ceil(this.totalSec - ms / 1000);
      this.set('rightVal', 'text', formatTime(Math.max(0, left)));
    }

    const running = st === 'running';
    this.set('startBtn', 'html', running ? ICONS.pause : ICONS.play);
    this.set('startLabel', 'text', running ? 'Pause' : st === 'paused' ? 'Resume' : st === 'done' ? 'Again' : 'Start');
  }

  // ---------- editor ----------
  openEditor() {
    if (this.state.status === 'running') this.toggle();
    const before = JSON.stringify(this.cfg);
    const body = document.getElementById('editor-body');
    document.getElementById('editor-title').textContent = this.def.title;
    body.innerHTML = '';

    const presetWrap = h('<div class="presets"></div>');
    const drawPresets = () => {
      presetWrap.innerHTML = '';
      this.def.presets.forEach((p) => {
        const { name, ...vals } = p;
        const active = Object.entries(vals).every(([k, v]) => this.cfg[k] === v);
        const chip = h(`<button class="chip ${active ? 'active' : ''}">${escapeHTML(name)}</button>`);
        chip.addEventListener('click', () => {
          Object.assign(this.cfg, vals);
          refresh();
        });
        presetWrap.appendChild(chip);
      });
    };
    body.appendChild(h('<div class="section-title">Presets</div>'));
    body.appendChild(presetWrap);
    body.appendChild(h('<div class="section-title">Custom</div>'));

    const valueEls = {};
    this.def.fields.forEach((f) => {
      const dot = f.phase ? `<span class="editor-dot" style="background: var(--${phaseColor(f.phase)})"></span>` : '';
      const row = h(`
        <div class="row">
          <div class="row-text">
            <div class="row-label">${dot}${escapeHTML(f.label)}</div>
            ${f.note ? `<div class="row-note">${escapeHTML(f.note)}</div>` : ''}
          </div>
          <div class="stepper">
            <button aria-label="Decrease">−</button>
            <button class="val" aria-label="Type a value"></button>
            <button aria-label="Increase">+</button>
          </div>
        </div>`);
      const [minus, val, plus] = row.querySelectorAll('button');
      valueEls[f.key] = val;
      const change = (dir) => {
        const v = this.cfg[f.key];
        let step = 1;
        if (f.type === 'time') {
          if (dir > 0) step = v < 60 ? 1 : v < 300 ? 5 : 15;
          else step = v <= 60 ? 1 : v <= 300 ? 5 : 15;
        }
        this.cfg[f.key] = clamp(v + dir * step, f.min, f.max);
        refresh();
      };
      holdRepeat(minus, () => change(-1));
      holdRepeat(plus, () => change(1));
      val.addEventListener('click', () => {
        const hint = f.type === 'time' ? 'seconds, or m:ss' : 'a number';
        const input = window.prompt(`${f.label} (${hint})`, f.type === 'time' ? formatDuration(this.cfg[f.key]).replace(/s$/, '') : this.cfg[f.key]);
        if (input == null) return;
        const parsed = parseInput(input);
        if (parsed == null) return;
        this.cfg[f.key] = clamp(parsed, f.min, f.max);
        refresh();
      });
      body.appendChild(row);
    });

    const total = h('<div class="row total-row"></div>');
    body.appendChild(total);
    const resetBtn = h('<button class="wide-btn">Restore defaults</button>');
    resetBtn.addEventListener('click', () => {
      this.cfg = structuredClone(this.def.defaults);
      refresh();
    });
    body.appendChild(resetBtn);

    const refresh = () => {
      this.def.fields.forEach((f) => {
        const v = this.cfg[f.key];
        valueEls[f.key].textContent = f.type === 'time' ? formatDuration(v) : String(v);
      });
      this.rebuild();
      total.textContent = `Total ${formatTime(this.totalSec, 'm:ss')}`;
      drawPresets();
    };
    refresh();

    openSheet('sheet-editor', () => {
      saveJSON(this.cfgKey, this.cfg);
      this.rebuild();
      if (JSON.stringify(this.cfg) !== before) this.reset(false);
      this.render();
    });
  }
}

function phaseColor(p) {
  return { prepare: 'yellow', work: 'green', rest: 'red', cyclerest: 'blue' }[p] || 'muted';
}

function clamp(v, min, max) {
  return Math.min(max, Math.max(min, Math.round(v)));
}

function parseInput(str) {
  str = String(str).trim();
  if (!str) return null;
  if (str.includes(':')) {
    const parts = str.split(':').map((x) => parseInt(x, 10));
    if (parts.some((n) => Number.isNaN(n))) return null;
    return parts.reduce((acc, n) => acc * 60 + n, 0);
  }
  const n = parseInt(str, 10);
  return Number.isNaN(n) ? null : n;
}
