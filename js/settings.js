// App settings, persistence helpers and time formatting.

const SETTINGS_KEY = 'timerplus.settings.v1';

export const DEFAULT_SETTINGS = {
  sound: true,
  scheme: 'gong',
  volume: 0.8,
  voice: true,
  voiceURI: '',
  ducking: true,
  ticking: false,
  countdown: true,
  vibration: false,
  flash: false,
  wakeLock: true,
  pale: false,
  timeFormat: 'mm:ss',
};

export function loadJSON(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return structuredClone(fallback);
    return { ...structuredClone(fallback), ...JSON.parse(raw) };
  } catch {
    return structuredClone(fallback);
  }
}

export function saveJSON(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* storage full or blocked: ignore */
  }
}

export const settings = loadJSON(SETTINGS_KEY, DEFAULT_SETTINGS);

const listeners = new Set();

export function setSetting(key, value) {
  settings[key] = value;
  saveJSON(SETTINGS_KEY, settings);
  listeners.forEach((fn) => fn(key, value));
}

export function onSettingsChange(fn) {
  listeners.add(fn);
}

export function resetSettings() {
  Object.assign(settings, structuredClone(DEFAULT_SETTINGS));
  saveJSON(SETTINGS_KEY, settings);
  listeners.forEach((fn) => fn('*'));
}

const pad = (n) => String(n).padStart(2, '0');

// Format whole seconds according to the chosen time format.
export function formatTime(totalSec, fmt = settings.timeFormat) {
  totalSec = Math.max(0, Math.round(totalSec));
  if (fmt === 'ss') return String(totalSec);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (h > 0) return `${h}:${pad(m)}:${pad(s)}`;
  return fmt === 'm:ss' ? `${m}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
}

// Short duration label for editors/headers, independent of the display format.
export function formatDuration(totalSec) {
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  if (m === 0) return `${s}s`;
  return `${m}:${pad(s)}`;
}

// Stopwatch format with centiseconds: returns [main, centis].
export function formatStopwatch(ms) {
  ms = Math.max(0, Math.floor(ms));
  const cs = Math.floor((ms % 1000) / 10);
  const total = Math.floor(ms / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const main = h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
  return [main, pad(cs)];
}
