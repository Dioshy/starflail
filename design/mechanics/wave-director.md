# Rule card: Wave Director

| Field | Spec |
|---|---|
| Purpose | Pacing (aesthetic: tension and release). A sawtooth: ramp → boss with a lighter wave → a higher ramp. Teaches one new enemy per wave before testing combinations. |
| Inputs | Run time `t` (s, paused during drafts and pause), ship position, alive-enemy count. |
| State | `spawnAcc` (float), `firedEvents` set, per-boss `aliveSince`. Data: `WAVES` (11 contiguous waves covering [0, 600)), `EVENTS` (9), `DIRECTOR` (spawnDistance 760, spawnTries 8, ringRadius 520, rushSpreadDeg 30, rushDurationSec 3, hardEnemyCap 220, bossWarningSec 2, bossLeaveAfterSec 120, overtimeHpMulPer30s 0.15, overtimeSpawnMulPer30s 0.1). RNG: the run's seeded `spawn` stream. |
| Resolution (per tick) | 1. **Wave** = the one with `fromSec ≤ t < toSec`; for `t ≥ 600` use the last wave with overtime: `k = floor((t - 600) / 30) + 1`, `hpMul += 0.15k`, `spawnPerSec *= 1 + 0.1k` (maxAlive unchanged). 2. `spawnAcc += spawnPerSec * dt`. 3. While `spawnAcc ≥ 1` **and** `alive < maxAlive` **and** `alive < hardEnemyCap`: pick an enemy by mix weight, spawn it, `spawnAcc -= 1`. If blocked by a cap, `spawnAcc` is clamped to ≤ 3 (no burst of 50 when the screen clears). 4. **Position**: random angle, point at `spawnDistance` (760 px, just off-screen) from the ship; if outside the arena (radius − enemy radius), retry up to 8 angles; then fall back to the in-arena point on that ray nearest 760 px. 5. **Events** at `atSec` (each fires once): `swarmRing` → `count` enemies evenly spaced on a 520 px circle around the ship (points outside the arena are projected inside). `rush` → `count` enemies spread evenly over 3 s, entering from one random direction ±15° at spawnDistance. `boss` → warning 2 s, then spawn (bosses.md). Events ignore `maxAlive` but respect `hardEnemyCap` (excess is dropped). 6. **Boss leave**: Warden/Hive alive 120 s after spawn → warp out. |
| Outputs | Events `enemySpawned`, `eventStarted {type}`, `bossWarning`, `bossSpawned`, `bossLeft`. HUD: the timer bar shows boss pips at 3:00 / 6:00 / 9:00. |

## Wave table (from `src/data/waves.ts`)

| Time | Spawn/s | Max alive | hpMul | Mix (weights) | Teaching role |
|---|---|---|---|---|---|
| 0:00-0:30 | 0.8 | 20 | 1.0 | mite | Swing into chasers |
| 0:30-1:00 | 1.2 | 30 | 1.0 | mite 3, dart 1 | Dodge a telegraph |
| 1:00-2:00 | 1.6 | 40 | 1.1 | mite 3, dart 1, wisp 1 | Chase orbiters |
| 2:00-3:00 | 2.0 | 50 | 1.25 | + blob 1, dart 2 | Splitters; peak 1 |
| 3:00-4:00 | 1.5 | 35 | 1.35 | mite 2, blob 1 | **Warden** (lighter adds) |
| 4:00-5:00 | 2.4 | 60 | 1.6 | + spitter 1 | Swat spit |
| 5:00-6:00 | 2.8 | 70 | 1.85 | + brute 0.5 | Armour; peak 2 |
| 6:00-7:00 | 2.0 | 45 | 2.1 | mite 2, blob 1, spitter 1 | **Hive** (lighter adds) |
| 7:00-8:00 | 3.2 | 80 | 2.4 | all six, brute 1 | Test: everything |
| 8:00-9:00 | 3.6 | 90 | 2.8 | all six, wisp 3, brute 1.5 | Peak 3 |
| 9:00-10:00+ | 2.0 | 50 | 3.2 | mite 3, wisp 1, spitter 1 | **Eclipse**; overtime after 10:00 |

Events: 1:30 swarmRing 16 mites · 2:30 rush 10 darts · 3:00 Warden · 4:30 swarmRing 8 blobs · 5:30 rush 14 wisps ·
6:00 Hive · 7:30 swarmRing 30 mites · 8:20 rush 4 brutes · 9:00 Eclipse.

**Teach before test**: each new enemy first appears alone in a low-weight mix (dart at 0:30, wisp at 1:00, blob at 2:00,
spitter at 4:00, brute at 5:00) and is only used in an event (rush/ring) at least 60 s after its first appearance
(darts rush at 2:30, wisps at 5:30, brutes at 8:20).

**Endless scaling** (overtime, and a future endless mode): after 600 s the last wave repeats with hpMul +0.15 and
spawn rate ×(1 + 0.1k) every 30 s, uncapped in time but bounded per tick by `maxAlive` 50 and `hardEnemyCap` 220. A
future endless mode should switch to the 8:00-9:00 mix after the Eclipse dies, apply the same scaling, and add one boss
cycle every 180 s (Warden, Hive, Eclipse at +50% HP per cycle).

## Edge cases

| Case | Rule |
|---|---|
| Ship near the arena wall | Spawns land on the inward arc (retry rule), so enemies never spawn "behind" the wall. |
| Draft or pause open | `t` doesn't advance; nothing spawns. |
| Two events on the same second | Fire in data order. (None overlap in v1.) |
| Warden still alive at 6:00 | Hive spawns anyway; both active. Warden leaves at 5:00 at the latest (180 + 120 = 300 s), so this can't happen with default data. Hive leaves by 8:00 (before the Eclipse at 9:00). |
| Wave boundary mid-accumulation | `spawnAcc` carries over; the new rates apply from the next tick. |
| `hardEnemyCap` reached during a swarmRing | The remaining ring enemies are dropped (not queued). |

## Tests (given / when / then)

1. Given validateData, then waves are contiguous from 0 to 600 and hpMul never decreases. *(Automated.)*
2. Given t = 30.0, then the wave is 0:30-1:00 (boundaries are `[from, to)`).
3. Given alive = maxAlive for 10 s, when an enemy dies, then at most 3 spawn instantly (spawnAcc clamp).
4. Given the ship 50 px from the wall, then 1 000 spawn positions are all inside the arena and ≥ 600 px from the ship.
5. Given t = 645, then overtime k = 2: hpMul 3.5, spawnPerSec 2.4.
6. Given seed s and an identical input log, then the spawn sequence (ids, positions) is identical.
7. Given t passes 90 s, then exactly 16 mites appear on a 520 px ring.

## Dominant-strategy review

- **Edge-circling**: covered (spawns arc inward, wall eats orb speed).
- **Killing slowly to keep the screen empty** (a low alive count): spawns are time-driven, so going slow only lets enemies pile up to maxAlive. No benefit.
- **Skipping bosses**: Warden/Hive leave after 120 s, so you can survive them without killing them, but you lose 50 stardust and 45/90 XP (2-3 drafts) each. A valid choice for weak runs, never optimal.
