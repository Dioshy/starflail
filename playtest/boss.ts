// Boss-kill feasibility: each boss alone in an arena (noSpawn), god-mode ship, orbit bot. npx vite-node playtest/boss.ts
import { World } from '../src/game/sim';
import { botIntents } from '../src/game/bot';
for (const boss of ['warden', 'hive', 'eclipse'] as const) {
  const out: string[] = [];
  for (const seed of [1, 2, 3]) {
    const w = new World({ seed, noSpawn: true, god: true });
    w.spawnEnemy(boss, 500, 0);
    while (w.bossKills === 0 && w.time < 240) { w.step(botIntents(w)); w.events.length = 0; if (w.draft) w.pickDraft(0); }
    out.push(w.bossKills ? `${w.time.toFixed(0)}s` : 'NO KILL');
  }
  console.log(boss, out.join(' '));
}
