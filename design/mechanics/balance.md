# Balance: targets and the calculations behind them

All numbers here are **modelled**, not measured. The executable model is `src/data/balanceModel.ts`, and the targets
are asserted in `src/data/data.test.ts`, so changing a data value that breaks a target fails CI. Replace assumptions
with telemetry after the first playtest (median time-of-death, boss kill times, level-up gaps, stardust per run).

## 0. Assumptions (each one labelled; every result below cites them)

| Id | Assumption | Value | Why / how to confirm |
|---|---|---|---|
| A1 | A median player kills about as fast as enemies spawn (steady state, below maxAlive) | kill rate = spawn rate | Typical for the genre at these densities; telemetry: alive-count p50 per wave < 60% of maxAlive |
| A2 | Share of dropped XP collected | 85% | pickupRadius 90 + homing; telemetry: XP collected / dropped |
| A3 | Median boss kill time on runs 3+ | Warden 41 s, Hive 55 s, Eclipse 54 s | §2 below |
| A4 | Share of stardust pickups collected | 80% | 30 s lifetime |
| A5 | Median player skill curve (death time and bosses per run) | see §5 table | Genre norms for 10-min runs; telemetry: run-index vs survival |
| A6 | Orb hits per second on a boss | run 1: 0.7, run 2: 0.85, run 3+: 1.0 (Warden), 1.2 (Hive), 1.3 (Eclipse) | Large hitboxes; each lap passes through once or twice |
| A7 | Share of boss hits that crit | run 1: 5%, run 2: 15%, run 3+: 30-50% | Rises as reel timing improves |
| A8 | Novice contact hits taken per minute (no upgrades in defence) | 0.3, 0.6, 1.2, 2.0, 2.0, 2.5 for minutes 1-6 | Estimate; telemetry: hits/min by minute |

## 1. First-run death at 4-7 minutes

Novice HP budget = 5 HP + hearts collected. Hearts drop at 0.5% per kill. Kills by 5:00 ≈ Σ spawnPerSec × duration =
24 + 36 + 96 + 120 + 90 + 144 = 510 (+ ~60 from events), so ≈ 2.8 hearts dropped, of which ~70% are collected → **≈ 2 HP**.
Effective budget ≈ **7 hits**.

Cumulative hits (A8): 0.3 → 0.9 → 2.1 → 4.1 → 6.1 → 8.6 at the end of minutes 1-6. The budget of 7 runs out during
minute 6, at about **5:20**. The model uses **4:50** for run 1 (`MEDIAN_PLAYER_RUNS[0].diesAtSec = 290`), allowing for
the Warden adding pressure at 3:00. **Target 4-7 min: met** (sensitivity: ±1 HP of budget moves death by ±25 s).

## 2. Boss fights sized for 30-60 s (median, run 3+)

`dmg = v × damagePerSpeed × mass^0.5 (× critMultiplier on crit)`; DPS = avg hit × hits/s (A6, A7).

| Boss | Picks by then | Build assumed | Non-crit hit | Crit hit | Avg hit | Hits/s | DPS | HP | Time |
|---|---|---|---|---|---|---|---|---|---|
| Warden 3:00 | 8 | Spiked Shell ×2 (0.0992/px/s) | 600 px/s → 60 | 950 → 188 | 0.7×60 + 0.3×188 = 98 | 1.0 | 98 | 4 000 | **41 s** |
| Hive 6:00 | 14 | Shell ×3, Heavy Core ×1, Hair Trigger ×1 (0.119 effective) | 620 → 74 | 950 → 226 | 0.6×74 + 0.4×226 = 135 | 1.2 × 0.85 (brood distraction) | 137 | 7 500 | **55 s** |
| Eclipse 9:00 | 20 | Shell ×4, Core ×2, Trigger ×2 (0.140 effective) | 650 → 91 | 1 000 → 280 | 0.5×91 + 0.5×280 = 186 | 1.3 | 241 | 13 000 | **54 s** |

Weaker players: run 1 at the Warden is 0.95×40 + 0.05×144 = 45 avg × 0.7 hits/s = **32 DPS → 126 s > 120 s leave timer**,
so the Warden usually escapes on run 1. Run 2 is 0.85×49 + 0.15×161 = 66 × 0.85 = **56 DPS → 71 s**: beatable.
**Target "first boss beaten by run 2-3": met** (and it is the reel, via the crit share, that makes the difference).

## 3. No uncapped multiplication

Every stat is clamped by `STAT_LIMITS`, and the stat formula adds multipliers before multiplying
(`(base + Σadd) × (1 + Σ(mul − 1))`), so stacking 5 × "+12%" gives +60%, not +76%.

Worst-case single hit (every damage stat at its cap): `1600 × 0.2 × √3 × 4` = **2 217**, which is below the Warden's 4 000 HP,
so no boss can be one-shot. *(Automated test.)*
Worst-case secondary damage per crit: chain 3 × 50% + explosion 60% = +210% of the crit, finite with no recursion
(behaviors.md). Worst-case orb count is 3 (Twin + Binary Star) at mass ≥ 0.4.
Positive loops and their caps: XP → power (STAT_LIMITS, hpMul ramp to 3.2); kills → more kills (maxAlive, hardEnemyCap 220).

## 4. A level-up every 20-40 seconds

XP/s at time t = `spawnPerSec × avg XP per kill (including split children) × 0.85` (A1, A2), plus event and boss XP lumps
and Hive brood XP. The XP table (`xpForLevel`) was fitted against this curve.

| t (s) | 0 | 45 | 90 | 150 | 200 | 270 | 330 | 390 | 450 | 510 | 570 |
|---|---|---|---|---|---|---|---|---|---|---|---|
| XP/s | 0.68 | 1.27 | 1.90 | 3.40 | 2.98 | 4.31 | 6.76 | 5.10 | 7.93 | 9.29 | 2.72 |

Modelled level-up times: 15, 36, 58, 80, 101, 130, 155, 180, 218, 239, 273, 302, 328, 352, 390, 416, 443, 471, 501, 528 s.
Gaps: 21 22 22 21 29 25 25 **39** 21 34 29 26 25 **38** 26 27 28 30 27. The two longest gaps are the Warden and Hive
fights, deliberately calmer and covered by the boss XP lump. **All gaps 21-39 s: met.** The first level-up comes at 15 s,
so the draft is taught early. During the Eclipse fight (after 528 s) there is ≤ 1 more level-up, which is intentional:
focus on the finale. *(Automated test: every pre-540 s gap is in [20, 40].)*

Sensitivity: A2 ±10 points shifts every gap by about ±12%, so the 39 s gaps would become 44 s at 75% collection. The first
tuning knobs if telemetry shows long gaps: Warden xp 80 → 100, and the 3:00-4:00 spawnPerSec 1.5 → 1.7.

## 5. Stardust: first unlock after about 2 runs, everything after 15-20 runs, first win by run 5-10

Per run: `secondsSurvived/60 × 10 + bosses × 50 + win × 150 + pickups × 5` (pickups modelled from stardustChance, A4).

| Run | Dies at | Bosses | Won | Stardust | Cumulative |
|---|---|---|---|---|---|
| 1 | 4:50 | 0 | – | 88 | 88 |
| 2 | 5:30 | 1 | – | 155 | 243 |
| 3 | 6:00 | 1 | – | 170 | 413 |
| 4 | 7:00 | 1 | – | 195 | 608 |
| 5 | 7:30 | 2 | – | 265 | 873 |
| 6 | 8:20 | 2 | – | 298 | 1 171 |
| 7 | 9:20 | 2 | – | 338 | 1 509 |
| 8 | 9:50 (win) | 3 | ✓ | 548 | 2 057 |
| 9-20 | alternating win (548) / 8:40 loss with 2 bosses (311) | | | | run 17: **6 041** |

- Cheapest item 120 ✦ (Spark trail): 88 after run 1 (not yet), 243 after run 2 → **first unlock after run 2: met**. Reel Arsenal (200) is also affordable then.
- Full catalogue = ships 1 700 + orbs 1 400 + packs 950 + cosmetics 1 930 = **5 980 ✦**, reached at **run 17: met** (target 15-20).
- First Warden kill run 2, first win run 8: **met** (targets 2-3 and 5-10). These follow from A5, which is anchored by the DPS calculation in §2.
- The doubleStardust ad, if taken every run, roughly halves the run count (about run 9). Acceptable, because unlocks are options, not power (P3).

## 6. Dominant-strategy summary (details on each card)

| Strategy | Result | Card |
|---|---|---|
| Edge-circling | Orb loses 50% speed per wall hit; spawns arc inward. Not dominant. | tether-and-orb, wave-director |
| Permanent reel | Held damping 1.5/s kills orb speed in about 1 s. Worse than tapping. | reel |
| Reel pumping | Bounded by maxOrbSpeed 1600 and damping; it is the skill ceiling. | reel |
| One strictly best upgrade | None: each pair trades on a different axis (table in the draft card). Telemetry gate: pick rate > 60% or win-rate delta > 15 pts. | upgrade-draft |
| Tank build | Survives, but bosses escape → less stardust. | health |
| Boss stalling | Leave timer + 0-stardust summons. | bosses |
| Stardust farming | Time-limited by difficulty; overtime collapses. | stardust |

## 7. Tuning knobs (most sensitive first)

1. `critSpeed` (900): moves the crit share (A7), which drives every boss time. ±100 ≈ ±25% boss time.
2. `reelRatio` (0.5): the reel multiplier `1/r`. 0.45 would make crits trivial from 410 px/s.
3. `WAVES[].hpMul`: the late-game tension curve.
4. `xpForLevel`: draft cadence (§4).
5. `PROGRESSION.stardust.perMinuteSurvived`: meta pace (§5).
