// Pure wave-director helpers (wave-director.md). No state: the sim owns timers.
import { DIRECTOR, WAVES, RUN_LENGTH_SEC } from '../data';
import type { EnemyId, WaveDef } from '../data';

export interface ActiveWave { wave: WaveDef; hpMul: number; spawnPerSec: number; maxAlive: number; overtimeK: number }

/** Wave for run time t with overtime scaling after RUN_LENGTH_SEC: k = floor((t-600)/30)+1. */
export function waveAt(t: number): ActiveWave {
  if (t >= RUN_LENGTH_SEC) {
    const w = WAVES[WAVES.length - 1];
    const k = Math.floor((t - RUN_LENGTH_SEC) / 30) + 1;
    return { wave: w, hpMul: w.hpMul + DIRECTOR.overtimeHpMulPer30s * k, spawnPerSec: w.spawnPerSec * (1 + DIRECTOR.overtimeSpawnMulPer30s * k), maxAlive: w.maxAlive, overtimeK: k };
  }
  let w = WAVES[0];
  for (const c of WAVES) if (t >= c.fromSec && t < c.toSec) { w = c; break; }
  return { wave: w, hpMul: w.hpMul, spawnPerSec: w.spawnPerSec, maxAlive: w.maxAlive, overtimeK: 0 };
}

/** Weighted pick by a single [0,1) roll. */
export function pickMix(w: WaveDef, roll: number): EnemyId {
  let total = 0;
  for (const m of w.mix) total += m.weight;
  let r = roll * total;
  for (const m of w.mix) { if (r < m.weight) return m.enemy; r -= m.weight; }
  return w.mix[w.mix.length - 1].enemy;
}
