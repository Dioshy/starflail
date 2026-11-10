import type { Intents } from '../core/input';
import type { World } from './sim';

/**
 * Scripted "circling bot" used by ?auto=1, ?skipTo and the headless balance test: it spirals around the nearest enemy (so the
 * orb swings through it), keeps off the wall, and pulses reel.
 * It never dodges telegraphs: a floor for survival numbers, not a skill ceiling.
 */
export function botIntents(w: World): Intents {
  const t = w.tick, s = w.ship;
  const a = t * 0.07;
  let mx = Math.cos(a), my = Math.sin(a);
  // lean toward the nearest enemy
  let best = 1e18, bx = 0, by = 0;
  for (let i = 0; i < w.enemies.count; i++) {
    const e = w.enemies.items[i];
    const d = (e.x - s.x) ** 2 + (e.y - s.y) ** 2;
    if (d < best) { best = d; bx = e.x - s.x; by = e.y - s.y; }
  }
  const nd = Math.sqrt(best);
  if (nd < 1500) {
    // orbit the nearest enemy at ~150 px at constant speed so the swinging orb keeps sweeping through it
    const ux = bx / (nd || 1), uy = by / (nd || 1);
    const radial = Math.max(-1, Math.min(1, (nd - 150) / 150));
    mx = -uy + ux * radial * 0.9; my = ux + uy * radial * 0.9;
  }
  const d = Math.hypot(s.x, s.y);
  if (d > 1100) { // drift back toward the middle
    const k = Math.min(1, (d - 1100) / 300);
    mx = mx * (1 - k) - (s.x / d) * k; my = my * (1 - k) - (s.y / d) * k;
  }
  return { moveX: mx, moveY: my, reel: t % 90 < 28, pause: false, confirm: false };
}

// ---------------------------------------------------------------------------------------------------------------------
// Competent bot: a stand-in for a decent human on a first run. Steers away from threats (weighted by distance), drifts to
// XP motes when it is safe, circles so the orb swings, pulses reel 28/90 ticks, and drafts greedily by priority.

const PRIORITY = [
  'spikedShell', 'hullPlating', 'binaryStar', 'heavyCore', 'whipcrack', 'tightCoil', 'thrusters', 'nanorepair', 'arcCoil', 'hairTrigger',
  'magnetCoil', 'starCharts', 'longLine', 'overdrive', 'barbedLine', 'wideOrb', 'glancingBlows', 'ramPlating', 'tautLine',
  'reelShock', 'gravityReel', 'novaCore', 'staticHull', 'leechOrb', 'tractorPulse',
];

/** Index of the best card by PRIORITY (Field Repair is picked only when hurt, otherwise last). */
export function pickUpgradeIndex(w: World): number {
  const d = w.draft;
  if (!d) return 0;
  let best = 0, bs = -1;
  d.cards.forEach((c, i) => {
    let s = PRIORITY.indexOf(c.id);
    s = s < 0 ? (c.fallback ? (w.ship.hp < w.ship.maxHp ? 99 : -5) : 0) : 100 - s;
    if (s > bs) { bs = s; best = i; }
  });
  return best;
}

export function competentIntents(w: World): Intents {
  const t = w.tick, s = w.ship;
  // threat repulsion: only imminent contact pushes (weighted by closeness, damage and attack state); big things push earlier
  let ax = 0, ay = 0, nearest = 1e9, nx = 0, ny = 0;
  for (let i = 0; i < w.enemies.count; i++) {
    const e = w.enemies.items[i];
    const dx = s.x - e.x, dy = s.y - e.y, c = Math.hypot(dx, dy) || 1;
    const d = c - e.radius;
    if (d < nearest) { nearest = d; nx = -dx / c; ny = -dy / c; }
    const reach = e.def.ai === 'boss' ? 260 : 130 + (e.state === 2 ? 60 : 0);
    if (d > reach) continue;
    const wgt = (e.def.contactDamage + (e.state === 1 ? 1 : 0)) * ((reach - d) / reach) * 2.2;
    ax += (dx / c) * wgt; ay += (dy / c) * wgt;
  }
  for (let i = 0; i < w.projectiles.count; i++) {
    const p = w.projectiles.items[i];
    const dx = s.x - p.x, dy = s.y - p.y, d = Math.hypot(dx, dy);
    if (d > 150) continue;
    ax += (dx / (d || 1)) * ((150 - d) / 150) * 1.6; ay += (dy / (d || 1)) * ((150 - d) / 150) * 1.6;
  }
  const sd = Math.hypot(s.x, s.y);
  if (sd > 1250) { const k = (sd - 1250) / 150; ax -= (s.x / sd) * k * 2; ay -= (s.y / sd) * k * 2; }
  // engage: orbit the nearest enemy at ~150 px so the swinging orb sweeps through it; with nothing close, collect motes
  let mx = 0, my = 0;
  if (nearest < 700) {
    const radial = Math.max(-1, Math.min(1, (nearest + 14 - 150) / 150));
    mx = -ny + nx * radial * 0.9; my = nx + ny * radial * 0.9;
  }
  if (nearest > 120) {
    let bd = 1e9, cx = 0, cy = 0;
    for (let i = 0; i < w.pickups.count; i++) {
      const p = w.pickups.items[i];
      if (p.kind === 'heart' && s.hp >= s.maxHp) continue;
      const d = Math.hypot(p.x - s.x, p.y - s.y);
      if (d < bd && d < 900) { bd = d; cx = (p.x - s.x) / (d || 1); cy = (p.y - s.y) / (d || 1); }
    }
    mx += cx * 1.1; my += cy * 1.1;
    if (bd === 1e9 && nearest > 700) { mx += Math.cos(t * 0.05); my += Math.sin(t * 0.05); }
  }
  mx += ax; my += ay;
  const m = Math.hypot(mx, my);
  if (m > 1) { mx /= m; my /= m; }
  return { moveX: mx, moveY: my, reel: t % 90 < 28, pause: false, confirm: false };
}
