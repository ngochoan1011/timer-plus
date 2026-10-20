import { settings, setSetting, onSettingsChange, resetSettings, loadJSON, saveJSON } from './settings.js';
import { sound, voice, clips, SCHEMES, applyAudioSession } from './audio.js';
import { toast, wakeLock } from './effects.js';
import { ICONS, h, escapeHTML, openSheet } from './ui.js';
import { IntervalTimer } from './interval.js';
import { Stopwatch } from './stopwatch.js';

export const APP_VERSION = '1.0.0';
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

// Unlock audio on the first touch anywhere (iOS requirement).
const unlockOnce = () => {
  sound.unlock();
  voice.unlock();
  clips.preload();
  window.removeEventListener('pointerdown', unlockOnce);
};
window.addEventListener('pointerdown', unlockOnce);

// ---------- Settings ----------
function applyTheme() {
  document.documentElement.classList.toggle('pale', settings.pale);
}
applyTheme();
applyAudioSession();

onSettingsChange((key) => {
  if (key === 'pale' || key === '*') applyTheme();
  if (key === 'volume' || key === '*') sound.applyVolume();
  if (key === 'ducking' || key === '*') applyAudioSession();
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
  body.appendChild(toggleRow('ducking', 'Ducking', 'Reduce music volume during cues'));
  body.appendChild(toggleRow('countdown', 'Countdown', 'Beep and count down the last 3 seconds'));
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
  body.appendChild(h(`<div class="version">Version: ${APP_VERSION}</div>`));

  openSheet('sheet-settings');
}

// ---------- More ----------
function moreItem(icon, color, label, onClick) {
  const li = h(`<li><button class="list-item"><span class="ico" style="color:${color}">${icon}</span><span class="label">${escapeHTML(label)}</span><span class="chev">${ICONS.chevron}</span></button></li>`);
  li.querySelector('button').addEventListener('click', onClick);
  return li;
}

function openInfo(title, html) {
  document.getElementById('info-title').textContent = title;
  document.getElementById('info-body').innerHTML = html;
  openSheet('sheet-info');
}

function mountMore() {
  const root = document.getElementById('view-more');
  root.innerHTML = '<header class="topbar simple"><h1>More</h1></header>';
  const list = h('<ul class="list"></ul>');
  list.appendChild(moreItem(ICONS.phone, 'var(--green)', 'Install on iPhone', () => openInfo('Install', INSTALL_HTML)));
  list.appendChild(moreItem(ICONS.gear, 'var(--yellow)', 'Settings', openSettings));
  list.appendChild(moreItem(ICONS.share, 'var(--blue)', 'Share app', async () => {
    const data = { title: 'Timer Plus', text: 'Tabata, rounds & stopwatch timer', url: location.href.split('#')[0] };
    try {
      if (navigator.share) await navigator.share(data);
      else {
        await navigator.clipboard.writeText(data.url);
        toast('Link copied');
      }
    } catch { /* cancelled */ }
  }));
  list.appendChild(moreItem(ICONS.info, '#fff', 'About & tips', () => openInfo('About', ABOUT_HTML)));
  list.appendChild(moreItem(ICONS.trash, 'var(--red)', 'Reset all data', () => {
    if (!window.confirm('Reset all settings, workouts and the stopwatch?')) return;
    Object.keys(localStorage).filter((k) => k.startsWith('timerplus.')).forEach((k) => localStorage.removeItem(k));
    resetSettings();
    location.reload();
  }));
  root.appendChild(list);
  root.appendChild(h(`<div class="more-footer">Version ${APP_VERSION}</div>`));
}

const INSTALL_HTML = `
  <h3>Add to Home Screen</h3>
  <ol>
    <li>Open this page in <b>Safari</b> on your iPhone.</li>
    <li>Tap the <b>Share</b> button (square with an arrow).</li>
    <li>Scroll down and tap <b>Add to Home Screen</b>, then <b>Add</b>.</li>
    <li>Launch <b>Timer Plus</b> from your Home Screen. It runs full screen and works offline.</li>
  </ol>
  <h3>Sound on iPhone</h3>
  <ul>
    <li>Tap anywhere once after opening the app so iOS allows sound.</li>
    <li>If you hear nothing, check the volume and the silent switch.</li>
  </ul>`;

const ABOUT_HTML = `
  <h3>Timer Plus</h3>
  <p>An interval timer for Tabata, HIIT, boxing and general workouts. Everything is stored on your device.</p>
  <h3>Tips</h3>
  <ul>
    <li>Tap the title or the colored panels to edit the workout.</li>
    <li>The circular arrow button resets the timer.</li>
    <li>Keep the app open during a workout: iPhone pauses web apps in the background or when the screen is locked. The timer catches up when you come back, but cues are skipped while it's paused.</li>
    <li>Turn on <b>Keep screen on</b> in Settings to stop the screen from sleeping.</li>
  </ul>`;

mountMore();
showView(timers[activeView] || activeView === 'stopwatch' || activeView === 'more' ? activeView : 'tabata');

// ---------- Service worker ----------
if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  });
}
