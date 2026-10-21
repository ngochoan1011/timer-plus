// The first cue ("Get ready") must use the chosen recorded voice even on a slow connection.
// Serve the app (python3 -m http.server 8123), then: node tests/first-cue.mjs
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PW || 'playwright');
const BASE = process.env.BASE_URL || 'http://localhost:8123/';
let fails = 0;
const b = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
for (const pack of ['eleven', 'eleven-hoando']) {
  const p = await (await b.newContext({ serviceWorkers: 'block' })).newPage();
  // slow down clip downloads like a phone on mobile data
  await p.route('**/audio/voice*/*.mp3', async (r) => { await new Promise((ok) => setTimeout(ok, 700)); r.continue(); });
  await p.addInitScript((v) => {
    localStorage.setItem('timerplus.settings.v1', JSON.stringify({ voiceURI: v }));
    window.__said = [];
    const orig = window.speechSynthesis.speak.bind(window.speechSynthesis);
    window.speechSynthesis.speak = (u) => { if (u.text.trim()) window.__said.push('DEVICE VOICE: ' + u.text); return orig(u); };
  }, pack);
  await p.goto(BASE);
  await p.evaluate(async () => {
    const a = await import('./js/audio.js');
    for (const pk of a.clips.packs) { const pp = pk.play.bind(pk); pk.play = (t) => { const r = pp(t); if (r) window.__said.push('CLIP: ' + t); return r; }; }
  });
  await p.click('#view-tabata [data-act=toggle]'); // first tap = Start
  await p.waitForTimeout(4000);
  const said = await p.evaluate(() => window.__said.slice(0, 3));
  const good = said[0] === 'CLIP: Get ready';
  if (!good) fails++;
  console.log(good ? 'ok' : 'FAIL', pack, said);
}
await b.close();
process.exitCode = fails ? 1 : 0;
