// Small DOM helpers, icons and bottom sheets.

export const ICONS = {
  gear: '<svg viewBox="0 0 32 32" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"><path d="M13.6 3h4.8l.7 3.6 2.4 1.4 3.5-1.2 2.4 4.2-2.8 2.4v2.8l2.8 2.4-2.4 4.2-3.5-1.2-2.4 1.4-.7 3.6h-4.8l-.7-3.6-2.4-1.4-3.5 1.2-2.4-4.2 2.8-2.4v-2.8L4.6 11l2.4-4.2 3.5 1.2 2.4-1.4z"/><circle cx="16" cy="16" r="4.2"/></svg>',
  sliders: '<svg viewBox="0 0 32 32" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M5 9h12M23 9h4M5 16h4M15 16h12M5 23h14M25 23h2"/><circle cx="20" cy="9" r="3"/><circle cx="12" cy="16" r="3"/><circle cx="22" cy="23" r="3"/></svg>',
  play: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M6 3.5v17l15-8.5z"/></svg>',
  pause: '<svg viewBox="0 0 24 24" fill="currentColor"><rect x="5" y="3.5" width="5" height="17" rx="1"/><rect x="14" y="3.5" width="5" height="17" rx="1"/></svg>',
  restart: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M20 12a8 8 0 1 1-2.6-5.9"/><path d="M18.5 2.5v4.2h-4.2"/></svg>',
  flag: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 21V4M5 4h11l-2 4 2 4H5"/></svg>',
  stop: '<svg viewBox="0 0 24 24" fill="currentColor"><rect x="5" y="5" width="14" height="14" rx="2"/></svg>',
  chevron: '<svg viewBox="0 0 12 22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 2l8 9-8 9"/></svg>',
  speakerLow: '<svg viewBox="0 0 32 32" fill="currentColor"><path d="M4 12h5l7-6v20l-7-6H4z"/><path d="M20 12a6 6 0 0 1 0 8" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/></svg>',
  speakerHigh: '<svg viewBox="0 0 32 32" fill="currentColor"><path d="M2 12h5l7-6v20l-7-6H2z"/><path d="M18 12a6 6 0 0 1 0 8M22 8.5a11 11 0 0 1 0 15" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/></svg>',
  share: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M8 8H5v13h14V8h-3M12 15V2M8 6l4-4 4 4"/></svg>',
  phone: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="6" y="2" width="12" height="20" rx="2.5"/><path d="M10 18h4M12 6v6M9.5 9.5 12 12l2.5-2.5"/></svg>',
  info: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><circle cx="12" cy="12" r="9.5"/><path d="M12 11v6M12 7.5v.1"/></svg>',
  trash: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/></svg>',
  music: '<svg viewBox="0 0 32 32" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 23V7l14-3v16"/><circle cx="8.5" cy="23" r="3.5" fill="currentColor"/><circle cx="22.5" cy="20" r="3.5" fill="currentColor"/></svg>',
  musicOff: '<svg viewBox="0 0 32 32" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 23V7l14-3v16"/><circle cx="8.5" cy="23" r="3.5"/><circle cx="22.5" cy="20" r="3.5"/><path d="M4 4l24 24" stroke-width="2.4"/></svg>',
  star: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="m12 2.5 2.9 6.1 6.6.8-4.9 4.6 1.3 6.6L12 17.3l-5.9 3.3 1.3-6.6-4.9-4.6 6.6-.8z"/></svg>',
};

export function h(html) {
  const t = document.createElement('template');
  t.innerHTML = html.trim();
  return t.content.firstElementChild;
}

export function escapeHTML(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

const closeHandlers = new Map();

export function openSheet(id, onClose) {
  const el = document.getElementById(id);
  closeHandlers.set(id, onClose);
  el.classList.add('open');
  el.setAttribute('aria-hidden', 'false');
}

export function closeSheet(id) {
  const el = document.getElementById(id);
  el.classList.remove('open');
  el.setAttribute('aria-hidden', 'true');
  const fn = closeHandlers.get(id);
  closeHandlers.delete(id);
  if (fn) fn();
}

document.addEventListener('click', (e) => {
  const btn = e.target.closest('[data-close]');
  if (btn) closeSheet(btn.closest('.sheet').id);
});

// Calls fn repeatedly while a button is held, speeding up over time.
export function holdRepeat(btn, fn) {
  let timer = null;
  let delay = 400;
  const stop = () => { clearTimeout(timer); timer = null; };
  const step = () => {
    fn();
    delay = Math.max(50, delay * 0.8);
    timer = setTimeout(step, delay);
  };
  btn.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    delay = 400;
    fn();
    timer = setTimeout(step, delay);
  });
  ['pointerup', 'pointerleave', 'pointercancel'].forEach((ev) => btn.addEventListener(ev, stop));
  btn.addEventListener('contextmenu', (e) => e.preventDefault());
}

// Fit long time strings ("1:00:00") into the same space as "00:00".
export function fitFactor(text, base = 5) {
  return text.length <= base ? 1 : (base + 0.3) / text.length;
}
