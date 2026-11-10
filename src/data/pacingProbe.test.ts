// Measurement tool behind MEASURED_PACING (balanceModel.ts, balance.md §4). Skipped in the normal suite.
// Run: PACING_PROBE=1 npx vitest run src/data/pacingProbe.test.ts
import { describe, it } from 'vitest';
import { World } from '../game/sim';
import { competentIntents, pickUpgradeIndex } from '../game/bot';
import { xpToNext } from './formulas';

const RUN = Boolean((globalThis as { process?: { env: Record<string, string | undefined> } }).process?.env.PACING_PROBE);
const BIN = 60, NB = 12;

describe.skipIf(!RUN)('pacing probe (competent bot, seeds 1-10)', () => {
  it('prints kills/s, collected XP per kill and level-up gaps per minute', () => {
    const kills = Array(NB).fill(0), xp = Array(NB).fill(0), alive = Array(NB).fill(0);
    const gaps: number[][] = Array.from({ length: NB }, () => []);
    let totK = 0, totXp = 0, totT = 0;
    for (let seed = 1; seed <= 10; seed++) {
      const w = new World({ seed });
      const cum = () => { let s = w.xp; for (let l = 1; l < w.level; l++) s += xpToNext(l); return s; };
      const lv: number[] = []; let lastK = 0, lastXp = 0;
      while (!w.outcome && w.time < 720) {
        const b = Math.min(NB - 1, Math.floor(w.time / BIN));
        w.step(competentIntents(w));
        for (const e of w.events as { type: string }[]) if (e.type === 'levelUp') { if (lv.length) gaps[b].push(w.time - lv[lv.length - 1]); lv.push(w.time); }
        w.events.length = 0;
        if (w.draft) w.pickDraft(pickUpgradeIndex(w));
        const x = cum();
        kills[b] += w.kills - lastK; xp[b] += x - lastXp; alive[b] += 1 / 60; lastK = w.kills; lastXp = x;
      }
      totK += w.kills; totXp += cum(); totT += w.outcome ? w.endTime : w.time;
    }
    const rows: string[] = [];
    for (let b = 0; b < NB; b++) {
      if (alive[b] <= 0) continue;
      const g = gaps[b], mean = g.reduce((a, c) => a + c, 0) / Math.max(1, g.length);
      rows.push(`  { fromSec: ${b * BIN}, killsPerSec: ${(kills[b] / alive[b]).toFixed(2)}, xpPerKill: ${(xp[b] / Math.max(1, kills[b])).toFixed(2)} }, // runSec ${alive[b].toFixed(0)}, xp/s ${(xp[b] / alive[b]).toFixed(2)}, gaps n=${g.length} mean ${mean.toFixed(0)} s`);
    }
    console.log(`PACING PROBE\n${rows.join('\n')}\nrun: killsPerSec ${(totK / totT).toFixed(2)}, xpPerKill ${(totXp / totK).toFixed(2)}, xpPerSec ${(totXp / totT).toFixed(2)}`);
  }, 600000);
});
