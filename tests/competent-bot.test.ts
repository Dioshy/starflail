import { describe, expect, it } from 'vitest';
import { World } from '../src/game/sim';
import { competentIntents, pickUpgradeIndex } from '../src/game/bot';

const SEEDS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
const mmss = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

describe('competent bot (headless, 10 seeds, first run = no unlocks)', () => {
  it('prints survival, level, bosses, cause of death and level-up gaps', () => {
    const rows: string[] = []; const ends: number[] = []; const gaps: number[] = [];
    for (const seed of SEEDS) {
      const w = new World({ seed });
      const bosses: string[] = []; const lvAt: number[] = [];
      while (!w.outcome && w.time < 720) {
        w.step(competentIntents(w));
        for (const e of w.events as any[]) { if (e.type === 'bossSpawn') bosses.push(e.boss); if (e.type === 'levelUp') lvAt.push(w.time); }
        w.events.length = 0;
        if (w.draft) { w.pickDraft(pickUpgradeIndex(w)); }
      }
      const end = w.outcome ? w.endTime : w.time; ends.push(end);
      for (let i = 1; i < lvAt.length; i++) gaps.push(lvAt[i] - lvAt[i - 1]);
      const g = lvAt.length > 1 ? (lvAt[lvAt.length - 1] - lvAt[0]) / (lvAt.length - 1) : 0;
      rows.push(`seed ${String(seed).padStart(2)}  ${(w.outcome ?? 'alive').padEnd(5)} ${mmss(end)}  lv ${String(w.level).padStart(2)}  bosses [${bosses.join(',') || '-'}]  killedBy ${(w.killedBy || '-').padEnd(14)} level-up gap ${g.toFixed(0)} s  kills ${w.kills}`);
      expect(Number.isFinite(w.ship.x)).toBe(true);
    }
    const med = (a: number[]) => { const s = [...a].sort((x, y) => x - y); return s[s.length >> 1] ?? 0; };
    console.log(`COMPETENT BOT\n${rows.join('\n')}\nmedian survival ${mmss(med(ends))}, median level-up gap ${med(gaps).toFixed(0)} s, deaths before 3:00: ${ends.filter((e) => e < 180).length}/10`);
  }, 600000);
});
