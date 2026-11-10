// Real-input QA runner. Usage (dev server on :5173):  NODE_PATH=/tmp/pw/node_modules node playtest/e2e.mjs
// Needs playwright-core (npm i playwright-core in a scratch dir) + a Chromium headless shell.
import { createRequire } from 'node:module';
const require = createRequire(process.env.PW_DIR ? process.env.PW_DIR + '/' : '/tmp/pw/');
const { chromium } = require('playwright-core');
const EXE = process.env.CHROME || `${process.env.HOME}/Library/Caches/ms-playwright/chromium_headless_shell-1254/chrome-headless-shell-mac-arm64/chrome-headless-shell`;
const BASE = 'http://localhost:5173/';
const out = {};
const browser = await chromium.launch({ executablePath: EXE, args: ['--use-gl=swiftshader', '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--autoplay-policy=no-user-gesture-required'] });
const log = (k, v) => { out[k] = v; console.log(k, JSON.stringify(v)); };
async function page(ctxOpts = {}) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 }, ...ctxOpts });
  const p = await ctx.newPage(); p.errs = [];
  p.on('pageerror', (e) => p.errs.push('pageerror: ' + e.message)); p.on('console', (m) => { if (m.type() === 'error') p.errs.push('console: ' + m.text()); });
  return p;
}
const fps = (p, ms) => p.evaluate((ms) => new Promise((res) => { let n = 0; const t0 = performance.now(); const f = () => { n++; if (performance.now() - t0 < ms) requestAnimationFrame(f); else res(+(n / ((performance.now() - t0) / 1000)).toFixed(1)); }; requestAnimationFrame(f); }), ms);
const W = (p) => p.evaluate(() => { const w = window.__game.world; return { t: +w.time.toFixed(1), lvl: w.level, kills: w.kills, hp: w.ship.hp, hits: w.hitCount, maxOrb: Math.round(w.maxOrbSpeed), en: w.enemies.count, out: w.outcome, draft: !!w.draft }; });

// A. onboarding + real inputs: WASD + held Space, seed 1
{
  const p = await page(); await p.goto(BASE + '?seed=1&debug=1'); await p.waitForTimeout(500);
  const hints = []; const snap = async (label) => hints.push({ label, hint: await p.evaluate(() => { const e = document.querySelector('.hud-hint'); return e && !e.classList.contains('hidden') ? e.textContent : null; }) });
  await snap('t0.5s'); await p.waitForTimeout(2500); await snap('t3s (idle)');
  await p.keyboard.down('d'); await p.waitForTimeout(1500); await snap('after move 1.5s'); await p.keyboard.up('d');
  await p.waitForTimeout(3000); await snap('idle 3s after move');
  await p.keyboard.down('Space'); await p.waitForTimeout(600); await p.keyboard.up('Space'); await snap('after first reel');
  log('A.hints', hints);
  // drive 30 s with a crude circle + pulsed reel
  const keys = ['d', 's', 'a', 'w'];
  const samples = [];
  for (let i = 0; i < 40; i++) { const k = keys[i % 4]; await p.keyboard.down(k); await p.keyboard.down(keys[(i + 1) % 4]); if (i % 3 === 0) await p.keyboard.down('Space'); await p.waitForTimeout(700); await p.keyboard.up(k); await p.keyboard.up(keys[(i + 1) % 4]); await p.keyboard.up('Space'); if (i % 8 === 7) samples.push(await W(p)); }
  log('A.realInputSamples', samples); log('A.fps', await fps(p, 3000)); log('A.errors', p.errs);
  await p.screenshot({ path: '/tmp/pw/A.png' }); await p.close();
}
// B. stress
for (const n of [0, 200, 400, 500]) {
  const p = await page(); await p.goto(BASE + `?debug=1&stress=${n}&seed=3`); await p.waitForTimeout(1500);
  const r = await p.evaluate(async () => { const g = window.__game; const t0 = performance.now(), k0 = g.world.tick; await new Promise((r) => setTimeout(r, 4000)); return { ticksPerSec: (g.world.tick - k0) / ((performance.now() - t0) / 1000), enemies: g.world.enemies.count }; });
  log(`B.stress${n}`, { ...r, rafFps: await fps(p, 3000), errors: p.errs }); await p.close();
}
// C. saves
{
  const p = await page(); await p.goto(BASE + '?screen=hangar&give=300'); await p.waitForTimeout(500);
  await p.goto(BASE + '?screen=hangar'); await p.waitForTimeout(400);
  log('C.persistAfterReload', await p.evaluate(() => JSON.parse(localStorage.getItem('starflail.save') || 'null')?.stardust));
  await p.evaluate(() => localStorage.setItem('starflail.save', '{"version":1,"stardust":42,'));
  await p.goto(BASE + '?screen=hangar'); await p.waitForTimeout(500);
  log('C.corruptTruncated', { errors: p.errs, body: (await p.evaluate(() => document.body.innerText)).slice(0, 80).replace(/\n/g, ' | '), keys: await p.evaluate(() => Object.keys(localStorage)), bak: await p.evaluate(() => (localStorage.getItem('starflail.save.bak') || '').slice(0, 60)) });
  await p.evaluate(() => localStorage.setItem('starflail.save', JSON.stringify({ version: 1, stardust: 'lots', unlocks: 5, settings: null, equipped: 7, stats: { runs: -3 } })));
  await p.goto(BASE + '?screen=hangar'); await p.waitForTimeout(500);
  log('C.corruptWrongTypes', { errors: p.errs, ok: (await p.evaluate(() => document.body.innerText)).includes('HANGAR') });
  await p.evaluate(() => localStorage.setItem('starflail.save', JSON.stringify({ version: 99, stardust: 7 })));
  await p.goto(BASE + '?screen=hangar'); await p.waitForTimeout(500);
  log('C.futureVersion', { errors: p.errs, ok: (await p.evaluate(() => document.body.innerText)).includes('HANGAR'), stored: await p.evaluate(() => localStorage.getItem('starflail.save')?.slice(0, 80)) });
  await p.close();
}
// D. monetization (mock provider, mockAuto): run 1 die at 5s -> second wind -> die again -> results; 4 runs for interstitial
{
  const p = await page(); await p.goto(BASE + '?seed=5&die=4&mockAuto=1&debug=1'); await p.waitForTimeout(6500);
  const txt = () => p.evaluate(() => [...document.querySelectorAll('.overlay:not(.hidden), .screen:not(.hidden)')].map((e) => e.innerText.replace(/\n+/g, ' | ')).join(' ## '));
  log('D.deathPrompt', (await txt()).slice(0, 200));
  const yes = await p.$('[data-act="revive-yes"]'); const no = await p.$('[data-act="revive-no"]');
  const sz = async (e) => e && (await e.boundingBox());
  log('D.btnSizes', { yes: await sz(yes), no: await sz(no) });
  await yes.click(); await p.waitForTimeout(800);
  log('D.afterRevive', { state: await W(p), banner: (await txt()).slice(0, 80) });
  await p.evaluate(() => window.__game.world.forceDeath()); await p.waitForTimeout(2200);
  log('D.secondDeath(no 2nd prompt expected)', (await txt()).slice(0, 260));
  await p.close();
}
{
  // interstitial cadence & supporter: run N quick deaths via forceDeath, record when an ad ran (adCalls)
  for (const own of ['', 'supporter_pack']) {
    const p = await page(); await p.goto(BASE + `?seed=7&mockAuto=1&debug=1${own ? '&own=' + own : ''}`); await p.waitForTimeout(400);
    const seq = [];
    for (let run = 1; run <= 7; run++) {
      await p.waitForTimeout(300);
      await p.evaluate(() => window.__game.world.forceDeath());
      // decline revive if prompted
      await p.waitForTimeout(1300);
      const no = await p.$('[data-act="revive-no"]'); if (no && await no.isVisible()) await no.click();
      await p.waitForTimeout(900);
      const before = await p.evaluate(() => window.__game.game.ads.adCalls);
      const hb = p.locator('button:visible', { hasText: /^Hangar$/ }).first();
      if (await hb.count()) await hb.click(); await p.waitForTimeout(700);
      const after = await p.evaluate(() => window.__game.game.ads.adCalls);
      seq.push({ run, interstitialAtResultsToHangar: after > before });
      const launch = p.locator('button:visible', { hasText: /LAUNCH/ }).first(); if (await launch.count()) await launch.click(); await p.waitForTimeout(300);
    }
    log(`D.interstitials[${own || 'free'}]`, seq.map((s) => s.run + (s.interstitialAtResultsToHangar ? ':AD' : ':-')).join(' ')); log(`D.errors[${own || 'free'}]`, p.errs); await p.close();
  }
}
// E. settings: shake off / reduced flashes reach the renderer
{
  const p = await page(); await p.goto(BASE + '?seed=2&debug=1'); await p.waitForTimeout(500);
  const r = await p.evaluate(() => { const g = window.__game.game; const s = g.store.data.settings; const before = { ...g.renderer.opts }; return { before, settings: { ...s } }; });
  log('E.defaults', r);
  await p.goto(BASE + '?seed=2'); await p.evaluate(() => { const d = JSON.parse(localStorage.getItem('starflail.save') || '{}'); d.settings = { ...(d.settings || {}), screenShake: false, reducedFlashes: true }; localStorage.setItem('starflail.save', JSON.stringify(d)); });
  await p.goto(BASE + '?seed=2&debug=1'); await p.waitForTimeout(500);
  log('E.afterToggle', await p.evaluate(() => ({ ...window.__game.game.renderer.opts })));
  await p.close();
}
// F. touch
{
  const p = await page({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true }); await p.goto(BASE + '?seed=2&debug=1'); await p.waitForTimeout(800);
  const reel = await p.$('.reel-btn'); log('F.reelBtn', { present: !!reel, visible: reel ? await reel.isVisible() : false, box: reel ? await reel.boundingBox() : null });
  const cdp = await p.context().newCDPSession(p);
  const tp = (type, id, x, y) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y, id }] });
  const x0 = (await W(p)); await tp('touchStart', 1, 90, 600); for (let i = 1; i <= 12; i++) { await tp('touchMove', 1, 90 + i * 8, 600); await p.waitForTimeout(80); } 
  const moved = await p.evaluate(() => ({ x: window.__game.world.ship.x, y: window.__game.world.ship.y }));
  await tp('touchEnd', 1, 0, 0);
  if (reel) { const b = await reel.boundingBox(); await p.touchscreen.tap(b.x + b.width / 2, b.y + b.height / 2); }
  log('F.joystickShipMoved', { moved, errors: p.errs }); await p.screenshot({ path: '/tmp/pw/F.png' }); await p.close();
}
await browser.close();
