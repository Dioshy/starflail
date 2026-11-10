import * as A from '../src/render/art/index';
import { ParticleSystem, type FxKind } from '../src/fx/particles';
import { audio, SFX_NAMES } from '../src/audio/index';

const g = document.getElementById('gallery') as HTMLCanvasElement;
const gx = g.getContext('2d')!;
const fc = document.getElementById('fxc') as HTMLCanvasElement;
const fx = fc.getContext('2d')!;
const ps = new ParticleSystem(2000);
const msEl = document.getElementById('ms')!;
const stress = document.getElementById('stress') as HTMLInputElement;
if (location.search.includes('stress')) stress.checked = true;

const ENEMIES = ['mite', 'dart', 'wisp', 'blob', 'blobling', 'spitter', 'brute'];
const BOSSES = ['warden', 'hive', 'eclipse'];
const STATES = ['idle', 'telegraph', 'attack'] as const;
const SHIPS: A.ShipSkin[] = ['default', 'neon', 'ember', 'void', 'gold'];
const ORBS: A.OrbSkin[] = ['default', 'plasma', 'ice', 'molten', 'prism'];
const TRAILS: A.TrailId[] = ['none', 'spark', 'ribbon', 'pixel', 'rainbow'];
const PICKS: A.PickupKind[] = ['xpSmall', 'xpBig', 'heart', 'magnet', 'stardust'];

function label(c: CanvasRenderingContext2D, s: string, x: number, y: number) {
  c.fillStyle = A.PALETTE.textDim; c.font = '11px system-ui'; c.textAlign = 'center'; c.textBaseline = 'alphabetic'; c.fillText(s, x, y);
}
function head(c: CanvasRenderingContext2D, s: string, y: number) {
  c.fillStyle = A.PALETTE.player; c.font = '700 12px system-ui'; c.textAlign = 'left'; c.fillText(s.toUpperCase(), 10, y);
}

// stress entities
const N = 400;
const sx = new Float32Array(N), sy = new Float32Array(N), sk = new Uint8Array(N);
for (let i = 0; i < N; i++) { sx[i] = 20 + Math.random() * 1100; sy[i] = 20 + Math.random() * 970; sk[i] = i % 7; }

const trailPts = new Float32Array(2 * 20);
const tetherPts = new Float32Array(2 * 12);
let avg = 0, last = performance.now(), mode = 'normal';

function gallery(t: number) {
  const c = gx;
  A.drawBackground(c, g.width, g.height, t * 20, t * 8, t, 0.4);
  let y = 20;
  head(c, 'enemies: idle / telegraph / attack', y); y += 12;
  STATES.forEach((st, r) => {
    ENEMIES.forEach((id, i) => {
      const x = 80 + i * 150, yy = y + 40 + r * 70, rad = id === 'brute' ? 24 : id === 'blob' ? 22 : id === 'blobling' ? 12 : id === 'mite' ? 12 : 16;
      A.drawEnemy(c, id, x, yy, rad, 0 + Math.sin(t) * 0.2, t, (t * 1.3 + i * 0.3) % 2 < 0.15 ? 1 : 0, st);
      if (r === 0) label(c, id, x, y + 6);
    });
    label(c, st, 30, y + 44 + r * 70);
  });
  y += 230;
  head(c, 'bosses: idle / telegraph / attack', y);
  BOSSES.forEach((id, b) => STATES.forEach((st, r) => {
    const x = 70 + b * 370 + r * 118, yy = y + 90;
    A.drawEnemy(c, id, x, yy, 40, 0, t, 0, st);
    label(c, `${id} ${st}`, x, y + 165);
  }));
  y += 190;
  head(c, 'ship skins / orb skins (tether) / trails', y);
  SHIPS.forEach((s, i) => { A.drawShip(c, 60 + i * 110, y + 50, -0.5 + t * 0.5, 18, s, t, i === 0 && (t % 2 < 0.2) ? 1 : 0); label(c, s, 60 + i * 110, y + 90); });
  ORBS.forEach((o, i) => {
    const x = 640 + i * 100; const sp = (Math.sin(t) + 1) / 2;
    for (let k = 0; k < 12; k++) { tetherPts[k * 2] = x - 52 + k * 4; tetherPts[k * 2 + 1] = y + 50 + Math.sin(k * 0.8 + t * 3) * 3; }
    A.drawTether(c, tetherPts, sp, i % 2 === 0, o);
    A.drawOrb(c, x, y + 50, 16, sp, o, t); label(c, o, x, y + 100);
  });
  y += 120;
  TRAILS.forEach((tr, i) => {
    const x = 60 + i * 215;
    for (let k = 0; k < 20; k++) { trailPts[k * 2] = x + k * 6; trailPts[k * 2 + 1] = y + 20 + Math.sin(k * 0.5 + t * 4) * 8; }
    A.drawTrail(c, trailPts, tr, t); A.drawShip(c, x + 130, y + 20 + Math.sin(20 * 0.5 + t * 4) * 8, 0, 10, 'default', t, 0); label(c, tr, x + 60, y + 52);
  });
  y += 70;
  head(c, 'pickups / projectiles / text / logo', y);
  PICKS.forEach((p, i) => { A.drawPickup(c, p, 40 + i * 70, y + 36, t); label(c, p, 40 + i * 70, y + 66); });
  A.drawProjectile(c, 'spit', 410, y + 36, 7, t); label(c, 'spit', 410, y + 66);
  A.drawProjectile(c, 'bossBolt', 480, y + 36, 9, t); label(c, 'bossBolt', 480, y + 66);
  A.drawFloatingText(c, '42', 560, y + 36, 1, 'dmg'); A.drawFloatingText(c, '128!', 620, y + 36, 1, 'crit');
  A.drawFloatingText(c, '+5', 690, y + 36, 1, 'heal'); A.drawFloatingText(c, 'LEVEL UP', 770, y + 36, 1, 'info');
  A.drawLogo(c, 930, y + 36, 0.6, t);
}

function stressScene(t: number) {
  const c = gx;
  A.drawBackground(c, g.width, g.height, t * 40, 0, t, 0.8);
  A.drawArenaBounds(c, 570, 505, 480, t);
  const ids = [...ENEMIES];
  for (let i = 0; i < N; i++) {
    sx[i] += Math.sin(t + i) * 0.4; sy[i] += Math.cos(t * 1.1 + i) * 0.4;
    A.drawEnemy(c, ids[sk[i]], sx[i], sy[i], 10 + (sk[i] === 6 ? 6 : 0), t + i, t, 0, STATES[i % 3]);
  }
  while (ps.count < 1000) ps.emit('death', 100 + Math.random() * 900, 100 + Math.random() * 800, { count: 6 });
  A.drawShip(c, 570, 505, t, 16, 'default', t, 0); A.drawOrb(c, 640, 505, 14, 1, 'default', t);
  ps.draw(c);
}

function frame(now: number) {
  const dt = Math.min(0.05, (now - last) / 1000); last = now;
  const t = now / 1000;
  const a = performance.now();
  gx.clearRect(0, 0, g.width, g.height);
  if (stress.checked) { mode = 'stress'; ps.update(dt); stressScene(t); } else { mode = 'normal'; gallery(t); }
  const ms = performance.now() - a;
  avg = avg * 0.95 + ms * 0.05;
  msEl.textContent = `${mode}: ${avg.toFixed(2)} ms/frame draw (particles ${ps.count})`;
  // fx canvas
  fx.fillStyle = '#0a1030'; fx.fillRect(0, 0, fc.width, fc.height);
  ps.update(stress.checked ? 0 : dt); if (!stress.checked) ps.draw(fx);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

const FX: FxKind[] = ['hit', 'crit', 'death', 'bossDeath', 'pickup', 'levelUp', 'spark', 'playerHurt'];
const fxb = document.getElementById('fxb')!;
for (const k of FX) {
  const b = document.createElement('button'); b.className = 'btn'; b.textContent = k;
  b.onclick = () => ps.emit(k, 570, 100); fxb.appendChild(b);
}
const sfxb = document.getElementById('sfxb')!;
for (const n of SFX_NAMES) {
  const b = document.createElement('button'); b.className = 'btn'; b.textContent = n;
  b.onclick = async () => { await audio.unlock(); audio.play(n); }; sfxb.appendChild(b);
}
const $ = (id: string) => document.getElementById(id) as HTMLElement;
$('mstart').onclick = async () => { await audio.unlock(); audio.music.start(); };
$('mstop').onclick = () => audio.music.stop();
($('int') as HTMLInputElement).oninput = (e) => audio.music.setIntensity(+(e.target as HTMLInputElement).value);
$('sb').onclick = async () => { await audio.unlock(); audio.music.stinger('boss'); };
$('sv').onclick = async () => { await audio.unlock(); audio.music.stinger('victory'); };
$('sd').onclick = async () => { await audio.unlock(); audio.music.stinger('defeat'); };
