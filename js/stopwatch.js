// Stopwatch with laps. State is timestamp-based so it survives the app being closed.
import { loadJSON, saveJSON, formatStopwatch } from './settings.js';
import { sound } from './audio.js';
import { wakeLock } from './effects.js';
import { ICONS, fitFactor } from './ui.js';

const KEY = 'timerplus.stopwatch.state';

export class Stopwatch {
  constructor(root) {
    this.root = root;
    this.state = loadJSON(KEY, { status: 'idle', accMs: 0, startedAt: 0, laps: [] });
    this.mount();
    if (this.state.status === 'running') wakeLock.set(this, true);
    this.renderLaps();
    this.render();
  }

  elapsedMs() {
    const s = this.state;
    return s.status === 'running' ? s.accMs + (Date.now() - s.startedAt) : s.accMs;
  }

  save() { saveJSON(KEY, this.state); }

  toggle() {
    sound.unlock();
    const s = this.state;
    if (s.status === 'running') {
      s.accMs = this.elapsedMs();
      s.status = 'paused';
      wakeLock.set(this, false);
    } else {
      s.status = 'running';
      s.startedAt = Date.now();
      wakeLock.set(this, true);
    }
    this.save();
    this.render();
  }

  lapOrReset() {
    const s = this.state;
    if (s.status === 'running') {
      s.laps.push(this.elapsedMs());
      this.renderLaps();
    } else {
      this.state = { status: 'idle', accMs: 0, startedAt: 0, laps: [] };
      this.renderLaps();
    }
    this.save();
    this.render();
  }

  mount() {
    this.root.innerHTML = `
      <header class="topbar simple">
        <button class="icon-btn" data-act="settings" aria-label="Settings">${ICONS.gear}</button>
        <h1>Stopwatch</h1>
      </header>
      <div class="sw-display">
        <div class="sw-time" data-el="time"></div>
        <div class="sw-lap-time" data-el="lap"></div>
      </div>
      <ul class="sw-laps" data-el="laps"></ul>
      <div class="sw-controls">
        <div class="start-wrap">
          <button class="start-btn secondary" data-act="lap" data-el="lapBtn" aria-label="Lap"></button>
          <div class="start-label" data-el="lapLabel" style="color:#fff"></div>
        </div>
        <div class="start-wrap">
          <button class="start-btn" data-act="toggle" data-el="startBtn" aria-label="Start"></button>
          <div class="start-label" data-el="startLabel"></div>
        </div>
        <div></div>
      </div>`;
    this.els = {};
    this.root.querySelectorAll('[data-el]').forEach((el) => { this.els[el.dataset.el] = el; });
    this.root.addEventListener('click', (e) => {
      const act = e.target.closest('[data-act]')?.dataset.act;
      if (act === 'toggle') this.toggle();
      else if (act === 'lap') this.lapOrReset();
      else if (act === 'settings') this.onOpenSettings?.();
    });
    this.prev = {};
  }

  render() {
    const ms = this.elapsedMs();
    const [main, cs] = formatStopwatch(ms);
    const html = `${main}<span class="cs">.${cs}</span>`;
    if (html !== this.prev.time) {
      this.prev.time = html;
      this.els.time.innerHTML = html;
      this.els.time.style.setProperty('--fit', fitFactor(main + cs, 7));
    }
    const laps = this.state.laps;
    const lapText = laps.length ? `Lap ${laps.length + 1}  ${formatStopwatch(ms - laps[laps.length - 1]).join('.')}` : '';
    if (lapText !== this.prev.lap) {
      this.prev.lap = lapText;
      this.els.lap.textContent = lapText;
    }
    const st = this.state.status;
    const key = `${st}:${ms > 0}`;
    if (key !== this.prev.controls) {
      this.prev.controls = key;
      const running = st === 'running';
      this.els.startBtn.innerHTML = running ? ICONS.stop : ICONS.play;
      this.els.startLabel.textContent = running ? 'Stop' : st === 'paused' ? 'Resume' : 'Start';
      this.els.lapBtn.innerHTML = running ? ICONS.flag : ICONS.restart;
      this.els.lapLabel.textContent = running ? 'Lap' : 'Reset';
      this.els.lapBtn.disabled = st === 'idle';
      this.els.lapBtn.style.opacity = st === 'idle' ? 0.4 : 1;
    }
  }

  renderLaps() {
    const laps = this.state.laps;
    const ul = this.els.laps;
    if (!laps.length) {
      ul.innerHTML = '<li class="sw-empty">Tap the flag to record laps</li>';
      return;
    }
    const splits = laps.map((t, i) => t - (i ? laps[i - 1] : 0));
    const best = splits.length > 1 ? Math.min(...splits) : -1;
    const worst = splits.length > 1 ? Math.max(...splits) : -1;
    ul.innerHTML = splits
      .map((split, i) => {
        const cls = split === best ? 'best' : split === worst ? 'worst' : '';
        return `<li class="${cls}"><span>Lap ${i + 1}</span><span>${formatStopwatch(split).join('.')}</span><span>${formatStopwatch(laps[i]).join('.')}</span></li>`;
      })
      .reverse()
      .join('');
  }
}
