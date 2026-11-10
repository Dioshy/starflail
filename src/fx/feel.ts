// Game-feel constants. Tuned so impacts read as heavy without hiding the playfield.
export const FEEL = {
  /** freeze-frame duration in ms (keep tiny for frequent events: 300 enemies = constant hits) */
  hitstopMs: { hit: 0, crit: 45, kill: 22, bossHit: 30, playerHurt: 85 },
  /** screen shake: amp in px at start, decay = exponential rate per second */
  shake: {
    hit: { amp: 0, decay: 20 },
    crit: { amp: 3, decay: 18 },
    kill: { amp: 2, decay: 18 },
    bossHit: { amp: 4, decay: 14 },
    playerHurt: { amp: 9, decay: 9 },
    bossDeath: { amp: 18, decay: 3.5 },
    levelUp: { amp: 3, decay: 8 },
  },
  /** flash durations in ms */
  flashMs: { enemyHit: 90, playerHurt: 200, playerInvuln: 120, screenCrit: 60, levelUp: 260 },
  /** floating numbers */
  damageNumber: { lifeMs: 650, critLifeMs: 900, risePx: 38, critRisePx: 56, jitterPx: 10 },
} as const;

/** Current shake amplitude given initial amp, decay rate and elapsed seconds. */
export function shakeAmp(amp: number, decay: number, elapsedSec: number): number {
  return amp * Math.exp(-decay * elapsedSec);
}
