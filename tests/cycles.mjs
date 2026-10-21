// End-to-end check of multi-cycle workouts, cues, pause/reopen and saved settings.
// Serve the app (python3 -m http.server 8123), then: node tests/cycles.mjs   (needs the playwright package)
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PW || 'playwright');
const BASE = process.env.BASE_URL || 'http://localhost:8123/';
const b = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
let fails = 0; const ok = (c, msg) => { if (!c) { fails++; console.log('FAIL', msg); } };

// Independent model of what the screen should show at second t.
function expected(c, t) {
  const segs = [];
  if (c.prepare) segs.push(['Prepare', c.prepare, c.rounds, c.cycles]);
  for (let cy = 1; cy <= c.cycles; cy++) for (let r = 1; r <= c.rounds; r++) {
    segs.push(['Work', c.work, c.rounds - r + 1, c.cycles - cy + 1]);
    const lastR = r === c.rounds, lastC = cy === c.cycles;
    if (lastR && lastC) break;
    if (lastR && c.cycleRest) segs.push(['Cool down', c.cycleRest, c.rounds, c.cycles - cy]);
    else if (c.rest) segs.push(['Rest', c.rest, c.rounds - r, c.cycles - cy + 1]);
  }
  if (c.cooldown) segs.push(['Cool down', c.cooldown, 0, 0]);
  let s = 0;
  for (const [label, dur, rl, cl] of segs) { if (t < s + dur) return { label, rem: s + dur - t, rl, cl }; s += dur; }
  return { label: 'Well done', rem: 0, rl: 0, cl: 0, total: s };
}

async function scan(cfg, name) {
  const p = await (await b.newContext({ serviceWorkers: 'block' })).newPage();
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.addInitScript((c) => localStorage.setItem('timerplus.tabata.config', JSON.stringify(c)), cfg);
  await p.goto(BASE);
  const total = expected(cfg, 1e9).total;
  let checked = 0;
  for (let t = 0; t <= total; t++) {
    await p.evaluate((ms) => { localStorage.setItem('timerplus.tabata.state', JSON.stringify({ status: 'paused', accMs: ms, startedAt: 0 })); }, t * 1000);
    await p.reload();
    const got = await p.evaluate(() => { const q = (s) => document.querySelector(`#view-tabata [data-el=${s}]`).textContent; return { label: q('curLabel'), time: q('curTime'), rl: +q('leftVal'), cl: +q('rightVal') }; });
    const e = expected(cfg, t);
    const mmss = `${String(Math.floor(e.rem / 60)).padStart(2, '0')}:${String(e.rem % 60).padStart(2, '0')}`;
    const good = got.label === e.label && got.time === mmss && got.rl === e.rl && got.cl === e.cl;
    ok(good, `${name} t=${t}s got ${JSON.stringify(got)} expected ${e.label} ${mmss} rounds ${e.rl} cycles ${e.cl}`);
    checked++;
  }
  ok(!errs.length, name + ' errors ' + errs);
  console.log(`${name}: checked ${checked} seconds`);
  await p.close();
}

async function live(cfg, name, { pauseAt, reloadAt } = {}) {
  const ctx = await b.newContext({ serviceWorkers: 'block' });
  const p = await ctx.newPage();
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.addInitScript((c) => { if (!localStorage.getItem('timerplus.tabata.config')) localStorage.setItem('timerplus.tabata.config', JSON.stringify(c)); localStorage.setItem('timerplus.settings.v1', JSON.stringify({ voiceURI: 'eleven', music: 'energy' })); }, cfg);
  const hook = () => p.evaluate(async () => {
    const a = await import('./js/audio.js');
    window.__log = window.__log || [];
    const L = (x) => window.__log.push(x);
    const pk = a.clips.get('eleven'); const pp = pk.play.bind(pk); pk.play = (t) => { L(t); return pp(t); };
    for (const k of ['ring']) { const f = a.sound[k].bind(a.sound); a.sound[k] = (...x) => { L('bell' + x[0]); return f(...x); }; }
    await a.clips.preload();
  });
  await p.goto(BASE); await hook();
  await p.click('#view-tabata [data-act=toggle]');
  const total = expected(cfg, 1e9).total;
  let log = [];
  if (pauseAt) {
    await p.waitForTimeout(pauseAt * 1000); await p.click('#view-tabata [data-act=toggle]');
    const t1 = await p.evaluate(() => document.querySelector('#view-tabata [data-el=curTime]').textContent);
    await p.waitForTimeout(2500);
    const t2 = await p.evaluate(() => document.querySelector('#view-tabata [data-el=curTime]').textContent);
    ok(t1 === t2, `${name} paused clock moved ${t1} -> ${t2}`);
    await p.click('#view-tabata [data-act=toggle]');
  }
  if (reloadAt) {
    await p.waitForTimeout(reloadAt * 1000);
    log = log.concat(await p.evaluate(() => window.__log));
    await p.reload(); await hook();
  }
  await p.waitForTimeout((total - (pauseAt || 0) - (reloadAt || 0)) * 1000 + 1500);
  log = log.concat(await p.evaluate(() => window.__log));
  const st = await p.evaluate(() => JSON.parse(localStorage.getItem('timerplus.tabata.state')).status);
  const musicOff = await p.evaluate(async () => !(await import('./js/music.js')).music.playing);
  ok(st === 'done', `${name} ended in state ${st}`);
  ok(musicOff, `${name} music still playing after finish`);
  ok(!errs.length, name + ' errors ' + errs);
  const phases = log.filter((x) => !/^[123]$/.test(x));
  const counts = log.filter((x) => /^[123]$/.test(x)).length;
  console.log(`${name}: ${phases.join(' > ')}  [countdown words: ${counts}]`);
  await ctx.close();
  return { phases, counts };
}

await scan({ prepare: 3, work: 4, rest: 2, rounds: 3, cycles: 3, cycleRest: 5, cooldown: 4 }, 'scan 3 cycles x 3 rounds');
await scan({ prepare: 0, work: 3, rest: 0, rounds: 2, cycles: 4, cycleRest: 0, cooldown: 0 }, 'scan 4 cycles, no rests');
await scan({ prepare: 2, work: 3, rest: 2, rounds: 1, cycles: 3, cycleRest: 0, cooldown: 3 }, 'scan 1 round per cycle, rest instead of cool down');

const r1 = await live({ prepare: 4, work: 4, rest: 4, rounds: 2, cycles: 3, cycleRest: 4, cooldown: 4 }, 'live 3 cycles');
ok(r1.phases.filter((x) => x === 'Work' || x === 'Last round. Work').length === 6, 'live 3 cycles: 6 work phases');
ok(r1.phases.filter((x) => x === 'Cycle complete. Cool down').length === 2, 'live 3 cycles: 2 cycle cool downs');
ok(r1.phases.at(-1) === 'Workout complete. Great job!', 'live 3 cycles: finished message');
await live({ prepare: 4, work: 5, rest: 4, rounds: 2, cycles: 2, cycleRest: 4, cooldown: 0 }, 'live with pause', { pauseAt: 6 });
await live({ prepare: 4, work: 5, rest: 4, rounds: 2, cycles: 2, cycleRest: 4, cooldown: 0 }, 'live with app reopened mid-workout', { reloadAt: 10 });

// Settings + workout survive closing the app
{
  const ctx = await b.newContext({ serviceWorkers: 'block' });
  const p = await ctx.newPage();
  await p.goto(BASE);
  await p.evaluate(async () => {
    const s = await import('./js/settings.js');
    s.setSetting('voiceURI', 'eleven-hoando'); s.setSetting('music', 'chill'); s.setSetting('musicVolume', 0.2); s.setSetting('bell', 'every'); s.setSetting('pale', true); s.setSetting('silentMode', false);
  });
  await p.click('#view-tabata [data-act=edit] >> nth=0'); await p.waitForTimeout(300);
  await p.locator('#editor-body .row').filter({ has: p.locator('.row-label', { hasText: /^Work$/ }) }).locator('.stepper button').last().click(); // work +1
  // simulate closing the app without pressing Done
  const p2 = await ctx.newPage(); await p.close();
  await p2.goto(BASE);
  const s = await p2.evaluate(async () => { const m = await import('./js/settings.js'); const c = JSON.parse(localStorage.getItem('timerplus.tabata.config')); return { ...m.settings, work: c.work, pale: document.documentElement.classList.contains('pale') }; });
  ok(s.voiceURI === 'eleven-hoando' && s.music === 'chill' && s.musicVolume === 0.2 && s.bell === 'every' && s.silentMode === false && s.pale, 'settings persisted ' + JSON.stringify(s));
  ok(s.work === 31, 'workout edit persisted without pressing Done, work=' + s.work);
  console.log('persistence: settings', s.voiceURI, s.music, s.musicVolume, s.bell, 'silentMode', s.silentMode, 'pale', s.pale, '| work', s.work);
  await ctx.close();
}
console.log(fails ? `${fails} FAILURES` : 'ALL PASSED');
await b.close();
process.exitCode = fails ? 1 : 0;
