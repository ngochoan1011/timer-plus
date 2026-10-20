// Visual / haptic feedback and screen wake lock.
import { settings } from './settings.js';

export function vibrate(pattern = 200) {
  if (settings.vibration && 'vibrate' in navigator) {
    try { navigator.vibrate(pattern); } catch { /* ignore */ }
  }
}

export function flashScreen() {
  if (!settings.flash) return;
  const el = document.getElementById('flash');
  el.classList.remove('on');
  void el.offsetWidth; // restart animation
  el.classList.add('on');
}

let toastTimer;
export function toast(msg) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 1800);
}

// Keeps the screen on while any timer is running (iOS 16.4+ in Home Screen apps).
export const wakeLock = {
  owners: new Set(),
  sentinel: null,

  set(owner, active) {
    if (active) this.owners.add(owner);
    else this.owners.delete(owner);
    this.sync();
  },

  async sync() {
    const want = settings.wakeLock && this.owners.size > 0 && document.visibilityState === 'visible';
    if (!('wakeLock' in navigator)) return;
    try {
      if (want && !this.sentinel) {
        this.sentinel = await navigator.wakeLock.request('screen');
        this.sentinel.addEventListener('release', () => { this.sentinel = null; });
      } else if (!want && this.sentinel) {
        const s = this.sentinel;
        this.sentinel = null;
        await s.release();
      }
    } catch {
      this.sentinel = null;
    }
  },
};

document.addEventListener('visibilitychange', () => wakeLock.sync());
