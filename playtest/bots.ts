// Headless balance bots. Run: npx vite-node playtest/bots.ts   (uses the DOM-free World; no game code changed)
import { World } from '../src/game/sim';
import { competentIntents, pickUpgradeIndex } from '../src/game/bot';
import type { Intents } from '../src/core/input';

const SEEDS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
const mmss = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
const base = (mx: number, my: number, reel: boolean): Intents => ({ moveX: mx, moveY: my, reel, pause: false, confirm: false });

// 1) Idle-circler: constant circle around the arena centre, never reels, random draft picks. Floor for "does nothing smart".
function idleCircler(w: World): Intents {
  const a = w.tick * 0.05; return base(Math.cos(a), Math.sin(a), false);
}
// 2) Edge-hugger: tries the exploit "stay on the wall ring and spin"; tangential movement at r~1450, pulses reel.
function edgeHugger(w: World): Intents {
  const s = w.ship, d = Math.hypot(s.x, s.y) || 1;
  const radial = (1450 - d) / 150;            // hold the ring
  const tx = -s.y / d, ty = s.x / d;
  return base(tx + (s.x / d) * radial, ty + (s.y / d) * radial, w.tick % 90 < 28);
}
// 3) Aggressive reel-spinner: dives at the nearest enemy, no threat avoidance, reel pulsed fast (20 on / 20 off).
function aggressive(w: World): Intents {
  const s = w.ship; let best = 1e18, bx = 0, by = 0;
  for (let i = 0; i < w.enemies.count; i++) { const e = w.enemies.items[i]; const d = (e.x - s.x) ** 2 + (e.y - s.y) ** 2; if (d < best) { best = d; bx = e.x - s.x; by = e.y - s.y; } }
  const nd = Math.sqrt(best) || 1, ux = bx / nd, uy = by / nd;
  const r = Math.max(-1, Math.min(1, (nd - 110) / 120));
  let mx = -uy + ux * r, my = ux + uy * r;
  const d = Math.hypot(s.x, s.y); if (d > 1200) { mx -= s.x / d * 2; my -= s.y / d * 2; }
  return base(mx, my, w.tick % 40 < 20);
}
const STYLES: Record<string, (w: World) => Intents> = { 'idle-circler': idleCircler, 'edge-hugger': edgeHugger, 'aggressive-reel': aggressive, 'competent (ref)': competentIntents };

const med = (a: number[]) => { const s = [...a].sort((x, y) => x - y); return s[s.length >> 1] ?? 0; };
const out: string[] = [];
for (const [name, fn] of Object.entries(STYLES)) {
  const ends: number[] = [], lvls: number[] = [], bossN: number[] = [], gaps: number[] = [], causes: Record<string, number> = {}; let wins = 0, first = 0;
  for (const seed of SEEDS) {
    const w = new World({ seed }); const lv: number[] = []; const bosses = new Set<string>();
    while (!w.outcome && w.time < 900) {
      w.step(fn(w));
      for (const e of w.events as any[]) { if (e.type === 'levelUp') lv.push(w.time); if (e.type === 'bossSpawn') bosses.add(e.boss); }
      w.events.length = 0;
      if (w.draft) w.pickDraft(name.startsWith('competent') ? pickUpgradeIndex(w) : Math.floor(w.rngAi.next() * w.draft.cards.length));
    }
    const end = w.outcome ? w.endTime : w.time; ends.push(end); lvls.push(w.level); bossN.push(w.bossKills);
    if (w.outcome === 'won') wins++; if (!w.outcome) first++;
    const c = w.outcome === 'won' ? 'WON' : w.outcome ? w.killedBy || '?' : 'ALIVE@15:00'; causes[c] = (causes[c] ?? 0) + 1;
    for (let i = 1; i < lv.length; i++) gaps.push(lv[i] - lv[i - 1]);
  }
  out.push(`| ${name} | ${mmss(Math.min(...ends))} / ${mmss(med(ends))} / ${mmss(Math.max(...ends))} | ${med(lvls)} | ${med(bossN)} (${bossN.filter((b) => b > 0).length}/10 killed ≥1) | ${wins}/10 | ${med(gaps).toFixed(0)} s | ${Object.entries(causes).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k}×${v}`).join(', ')} |`);
}
console.log('| Style | Survival min / median / max | Level (median) | Bosses killed (median) | Wins | Median level-up gap | Cause of death |\n|---|---|---|---|---|---|---|\n' + out.join('\n'));
