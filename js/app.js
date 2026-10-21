import { settings, setSetting, onSettingsChange, resetSettings, loadJSON, saveJSON } from './settings.js';
import { sound, voice, clips, SCHEMES, applyAudioSession } from './audio.js';
import { toast, wakeLock } from './effects.js';
import { ICONS, h, openSheet } from './ui.js';
import { IntervalTimer } from './interval.js';
import { Stopwatch } from './stopwatch.js';
import { music, MUSIC_CHOICES } from './music.js';

export const APP_VERSION = '1.2.1';
const UI_KEY = 'timerplus.ui';

// ---------- Views ----------
const timers = {
  tabata: new IntervalTimer(document.getElementById('view-tabata'), 'tabata'),
  rounds: new IntervalTimer(document.getElementById('view-rounds'), 'rounds'),
};
const stopwatch = new Stopwatch(document.getElementById('view-stopwatch'));
[timers.tabata, timers.rounds, stopwatch].forEach((v) => { v.onOpenSettings = openSettings; });

const ui = loadJSON(UI_KEY, { view: 'tabata' });
let activeView = ui.view;

function showView(name) {
  activeView = name;
  document.querySelectorAll('.view').forEach((v) => v.classList.toggle('active', v.id === `view-${name}`));
  document.querySelectorAll('.tab').forEach((t) => t.classList.toggle('active', t.dataset.view === name));
  saveJSON(UI_KEY, { view: name });
  renderActive();
}

document.getElementById('tabbar').addEventListener('click', (e) => {
  const tab = e.target.closest('.tab');
  if (tab) showView(tab.dataset.view);
});

function renderActive() {
  if (timers[activeView]) timers[activeView].render();
  else if (activeView === 'stopwatch') stopwatch.render();
}

// One loop drives cues for every running timer and redraws the visible one.
function frame() {
  timers.tabata.tick();
  timers.rounds.tick();
  music.update(timers.tabata.state.status === 'running' || timers.rounds.state.status === 'running');
  renderActive();
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
// Backup when animation frames are throttled.
setInterval(() => { timers.tabata.tick(); timers.rounds.tick(); }, 250);

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') {
    timers.tabata.tick();
    timers.rounds.tick();
    renderActive();
  }
});

// Unlock audio on touch. iPhone only counts the end of a tap (touchend/click) as a user gesture,
// so keep trying on each tap until the audio context is actually running.
const UNLOCK_EVENTS = ['touchend', 'click', 'keydown'];
const unlockAudio = () => {
  sound.unlock();
  voice.unlock();
  clips.preload();
  if (sound.ctx?.state === 'running') UNLOCK_EVENTS.forEach((ev) => window.removeEventListener(ev, unlockAudio, true));
};
UNLOCK_EVENTS.forEach((ev) => window.addEventListener(ev, unlockAudio, true));

// ---------- Settings ----------
function applyTheme() {
  document.documentElement.classList.toggle('pale', settings.pale);
}
applyTheme();
applyAudioSession();
// Start downloading the chosen voice right away so the first cue ("Get ready") is ready in time.
clips.preload();

onSettingsChange((key) => {
  if (key === 'pale' || key === '*') applyTheme();
  if (key === 'volume' || key === '*') sound.applyVolume();
  if (key === 'silentMode' || key === '*') { applyAudioSession(); sound.unlock(); }
  if (key === 'wakeLock' || key === '*') wakeLock.sync();
  if (key === 'timeFormat' || key === '*') {
    timers.tabata.prev = {};
    timers.rounds.prev = {};
    timers.tabata.render();
    timers.rounds.render();
  }
});

function toggleRow(key, label, note = '') {
  const row = h(`
    <div class="row">
      <div class="row-text">
        <div class="row-label">${label}</div>
        ${note ? `<div class="row-note">${note}</div>` : ''}
      </div>
      <label class="switch"><input type="checkbox" aria-label="${label}"><span class="track"></span></label>
    </div>`);
  const input = row.querySelector('input');
  input.checked = !!settings[key];
  input.addEventListener('change', () => setSetting(key, input.checked));
  return row;
}

function selectRow(key, label, options, onChange) {
  const row = h(`
    <div class="row">
      <div class="row-text"><div class="row-label">${label}</div></div>
      <div class="select-wrap">
        <span class="value"></span>${ICONS.chevron}
        <select aria-label="${label}"></select>
      </div>
    </div>`);
  const select = row.querySelector('select');
  const value = row.querySelector('.value');
  options.forEach(([v, text]) => {
    const o = document.createElement('option');
    o.value = v;
    o.textContent = text;
    select.appendChild(o);
  });
  select.value = settings[key];
  if (select.selectedIndex < 0) select.selectedIndex = 0;
  value.textContent = select.options[select.selectedIndex]?.textContent || '';
  select.addEventListener('change', () => {
    setSetting(key, select.value);
    value.textContent = select.options[select.selectedIndex].textContent;
    onChange?.(select.value);
  });
  return row;
}

function openSettings() {
  const body = document.getElementById('settings-body');
  body.innerHTML = '';

  body.appendChild(toggleRow('sound', 'Sound effect'));
  body.appendChild(selectRow('scheme', 'Sound scheme', Object.entries(SCHEMES), () => {
    sound.unlock();
    sound.play('start', { force: true });
  }));

  const vol = h(`
    <div class="row volume-row">
      ${ICONS.speakerLow}
      <input type="range" min="0" max="1" step="0.01" aria-label="Volume">
      ${ICONS.speakerHigh}
    </div>`);
  const range = vol.querySelector('input');
  range.value = settings.volume;
  range.addEventListener('input', () => setSetting('volume', parseFloat(range.value)));
  range.addEventListener('change', () => { sound.unlock(); sound.play('count', { force: true }); });
  body.appendChild(vol);

  body.appendChild(toggleRow('voice', 'Voice assist', voice.supported ? '' : 'Not supported on this device'));
  const voices = voice.load();
  const packs = clips.available();
  if (voices.length || packs.length) {
    const opts = [
      ...packs.map((p) => [p.id, p.name]),
      ['', 'Default'],
      ...voices.map((v) => [v.voiceURI, v.name]),
    ];
    body.appendChild(selectRow('voiceURI', 'Voice', opts, async () => {
      sound.unlock();
      await clips.preload();
      voice.speak('Work', { force: true });
    }));
  }
  body.appendChild(toggleRow('silentMode', 'Play in silent mode',
    'On: you hear the timer even with the iPhone on silent (Spotify pauses). Off: mixes with Spotify / Apple Music, but silent mode mutes the timer.'));
  body.appendChild(toggleRow('countdown', 'Countdown 3-2-1', 'Beep and count down the last 3 seconds of every phase'));
  body.appendChild(selectRow('bell', 'Bell', [['ends', 'Start & finish'], ['every', 'Every interval'], ['off', 'Off']], () => {
    sound.unlock();
    sound.ring(1);
  }));

  // Background music
  const fileInput = h('<input type="file" accept="audio/*" hidden>');
  const fileRow = h(`
    <div class="row">
      <div class="row-text">
        <div class="row-label">Music file</div>
        <div class="row-note" data-name></div>
      </div>
      <button class="chip">Choose…</button>
    </div>`);
  const showName = () => {
    fileRow.querySelector('[data-name]').textContent = music.fileName || 'No file chosen';
    fileRow.style.display = settings.music === 'file' ? '' : 'none';
  };
  fileRow.querySelector('button').addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', async () => {
    const f = fileInput.files[0];
    if (!f) return;
    try {
      await music.saveFile(f);
      toast('Music saved');
      music.preview();
    } catch {
      toast('Could not save that file');
    }
    showName();
  });
  body.appendChild(selectRow('music', 'Background music', Object.entries(MUSIC_CHOICES), (v) => {
    showName();
    if (v === 'file' && !music.fileName) fileInput.click();
    else music.preview();
  }));
  body.appendChild(fileRow);
  body.appendChild(fileInput);
  showName();
  const mvol = h(`
    <div class="row volume-row">
      <div class="row-text" style="flex:0 0 auto"><div class="row-note">Music</div></div>
      <input type="range" min="0" max="1" step="0.01" aria-label="Music volume">
    </div>`);
  const mrange = mvol.querySelector('input');
  mrange.value = settings.musicVolume;
  mrange.addEventListener('input', () => setSetting('musicVolume', parseFloat(mrange.value)));
  mrange.addEventListener('change', () => music.preview(4));
  body.appendChild(mvol);
  body.appendChild(h('<div class="row-note" style="padding:10px 0 4px">Music plays quietly while a timer runs and dips under the voice. You can also play Spotify or Apple Music alongside the timer.</div>'));
  body.appendChild(toggleRow('ticking', 'Ticking sound'));
  if ('vibrate' in navigator) body.appendChild(toggleRow('vibration', 'Vibration'));
  body.appendChild(toggleRow('flash', 'Screen flash', 'Flash the screen when the phase changes'));
  body.appendChild(toggleRow('wakeLock', 'Keep screen on',
    'wakeLock' in navigator ? 'Prevent the screen from sleeping during a workout' : 'Not supported on this device'));
  body.appendChild(toggleRow('pale', 'Pale colors'));
  body.appendChild(selectRow('timeFormat', 'Time format', [['mm:ss', '00:00'], ['m:ss', '0:00'], ['ss', 'Seconds']]));

  const test = h('<button class="wide-btn">Test sound & voice</button>');
  test.addEventListener('click', () => {
    sound.unlock();
    voice.unlock();
    sound.play('start', { force: true });
    voice.speak('Work', { force: true });
  });
  body.appendChild(test);
  const resetAll = h('<button class="wide-btn danger">Reset all data</button>');
  resetAll.addEventListener('click', () => {
    if (!window.confirm('Reset all settings, workouts and the stopwatch?')) return;
    Object.keys(localStorage).filter((k) => k.startsWith('timerplus.')).forEach((k) => localStorage.removeItem(k));
    resetSettings();
    location.reload();
  });
  body.appendChild(resetAll);
  body.appendChild(h(`<div class="version">Version: ${APP_VERSION}</div>`));

  openSheet('sheet-settings');
}

const VIEWS = ['tabata', 'rounds', 'stopwatch'];
showView(VIEWS.includes(activeView) ? activeView : 'tabata');

// Ask the browser to keep this app's saved data (settings, workouts) instead of clearing it under storage pressure.
navigator.storage?.persist?.().catch(() => {});

// ---------- Service worker ----------
if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  });
}
