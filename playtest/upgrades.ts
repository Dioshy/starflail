// Dominant-pick probe: competent movement, but at every draft take upgrade X when offered (else a random card). 8 seeds each.
// Run: npx vite-node playtest/upgrades.ts
import { World } from '../src/game/sim';
import { competentIntents } from '../src/game/bot';
import { UPGRADES } from '../src/data';
const SEEDS = [1, 2, 3, 4, 5, 6, 7, 8];
const mm = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
const med = (a: number[]) => { const s = [...a].sort((x, y) => x - y); return s[s.length >> 1] ?? 0; };
function run(seed: number, want: string | null) {
  const w = new World({ seed }); let offered = 0, taken = 0;
  while (!w.outcome && w.time < 720) {
    w.step(competentIntents(w)); w.events.length = 0;
    if (w.draft) {
      const idx = want ? w.draft.cards.findIndex((c: any) => c.id === want) : -1;
      if (idx >= 0) { offered++; taken++; w.pickDraft(idx); } else w.pickDraft(w.rngAi.int ? w.rngAi.int(w.draft.cards.length) : Math.floor(w.rngAi.next() * w.draft.cards.length));
    }
  }
  return { end: w.outcome ? w.endTime : w.time, kills: w.kills, offered, won: w.outcome === 'won' };
}
const base = SEEDS.map((s) => run(s, null));
const rows: string[] = [`| (random picks baseline) | ${mm(med(base.map((r) => r.end)))} | ${med(base.map((r) => r.kills))} | – | – |`];
const res: { id: string; end: number; kills: number; off: number }[] = [];
for (const u of UPGRADES) {
  const rs = SEEDS.map((s) => run(s, u.id));
  res.push({ id: u.id, end: med(rs.map((r) => r.end)), kills: med(rs.map((r) => r.kills)), off: med(rs.map((r) => r.offered)) });
}
const b = med(base.map((r) => r.end));
for (const r of res.sort((a, b) => b.end - a.end)) rows.push(`| ${r.id} | ${mm(r.end)} | ${r.kills} | ${(r.end - b >= 0 ? '+' : '') + (r.end - b).toFixed(0)} s | ${r.off} |`);
console.log('| Forced pick | Median survival | Median kills | Δ vs random | Times offered/run |\n|---|---|---|---|---|\n' + rows.join('\n'));
