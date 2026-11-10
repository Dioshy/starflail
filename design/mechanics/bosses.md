# Rule cards: Bosses

Data: `BOSSES` in `src/data/enemies.ts`; spawn times in `EVENTS` (180 / 360 / 540 s).

**Shared boss rules**
- **Spawn**: a 2 s warning (banner, alarm, an edge arrow pointing at the spawn point), then spawn 600 px from the ship, inside the arena.
- HP is **not** multiplied by hpMul. A big HP bar sits at the top of the screen with a notch at the 50% phase line.
- **One pattern at a time.** Each pattern has its own interval timer; a pattern that comes due while another is active waits. Between patterns the boss moves toward the ship at `speed`.
- Every pattern has a telegraph ≥ 0.6 s (validated in data). Projectile patterns use the same projectile rules as the spitter (destroyable by the orb at ≥ minDamageSpeed, `projectileDamage` 1).
- **Phase 2** at ≤ `phase2HpPct` (50%): a 0.5 s roar during which the boss is still hittable, then faster or bigger patterns.
- Immune to slowField. `knockbackResist` ≥ 0.95.
- **Leave rule**: Warden and Hive warp out 120 s after spawning if still alive (no XP, no stardust). Eclipse never leaves.
- **Kill**: XP motes, 1 guaranteed stardust pickup, +`perBossKill` (50) stardust on the results screen, a heart drop, and a 1.0 s slow-motion kill cam.

Fight-length targets (balance.md §2): 30-60 s for a median player on runs 3+; 60-110 s for a run-1-2 player (often leaves).

---

## Warden (`warden`, 3:00)

| Field | Spec |
|---|---|
| Purpose | First skill check: **bait, dodge, punish**. Teaches that the arena wall is a weapon against the boss. |
| Stats | hp 4 000, speed 80, radius 56, contact 2, mass 40, xp 80, knockbackResist 0.95. |
| Pattern A: Ring Burst | Every 5 s. Telegraph 0.8 s (body ring glows, 16 tick marks show the projectile lanes), then fire 16 projectiles radially at 220 px/s. Gaps between projectiles at 300 px from the boss = 2π×300/16 ≈ 118 px, wider than the ship (28 px). |
| Pattern B: Charge | Every 7 s. Telegraph 1.0 s (a red lane 56 px wide from the boss toward the ship, locked), then charge 650 px/s for 0.7 s (455 px). **If it hits the arena wall** during the charge: stunned 2 s and takes ×1.5 damage (a "STUNNED" label above it). |
| Phase 2 (≤ 50%) | Rings get 24 projectiles (gap ≈ 79 px at 300 px), each ring rotated 7.5° from the last; intervals × 0.75 (ring 3.75 s, charge 5.25 s). |
| Edge cases | Charge lane crosses the ship's position but the ship moves: the charge continues in the locked line. Stunned while a ring is due: the ring waits until the stun ends. Warden spawns near the wall: the 600 px spawn rule picks an in-arena point. If the charge would stop before the wall (455 px short), there is no stun. |
| Tests | Given the warden 300 px from the wall facing it, when it charges, then it reaches the wall (455 > 300) and is stunned 2 s; a 144-damage crit deals 216. Given HP drops to 2 000, then the next ring has 24 projectiles. Given 120 s pass alive, then it warps out with no reward. |
| Dominant-strategy review | **Wall-baiting** is the intended clever play, but it pulls the player toward the wall, where the orb loses 50% speed on wall contact (tether-and-orb.md). Risk balances reward. **Out-ranging** isn't possible (no ranged attack on the player's side). |

## Hive (`hive`, 6:00)

| Field | Spec |
|---|---|
| Purpose | Crowd plus boss: **prioritise**. Clear the brood with sweeping swings, then dive the core. |
| Stats | hp 7 500, speed 40, radius 72, contact 2, mass 60, xp 150, summon blobling. |
| Pattern A: Brood | Every 6 s. Telegraph 0.8 s (6 sacs on its rim pulse), then spawn 6 bloblings at the rim (hp × current wave hpMul), skipped if 18 summons are alive. |
| Pattern B: Volley | Every 4 s. Telegraph 0.7 s (a 50° cone flashes toward the ship, locked), then 5 projectiles spread evenly over 50° at 300 px/s. |
| Phase 2 (≤ 50%) | Brood 9; intervals × 0.7 (brood 4.2 s, volley 2.8 s). |
| Edge cases | Summons alive when the Hive dies: they stay (normal enemies). Summons alive when the Hive leaves at 120 s: they stay. Volley and Brood due together: Brood first (one at a time). Bloblings give 1 XP and 0 stardust. |
| Tests | Given 18 summons alive, when Brood is due, then nothing spawns (the telegraph still plays so the rhythm stays readable). Given a volley, then 5 projectiles at angles −25°, −12.5°, 0°, 12.5°, 25° from the locked aim. |
| Dominant-strategy review | **Stalling to farm the brood**: at most about 2 XP/s for ≤ 120 s, with 0 stardust, versus killing it (150 XP + 50 stardust + a heart). Killing is better, so stalling isn't dominant. |

## Eclipse (`eclipse`, 9:00, final)

| Field | Spec |
|---|---|
| Purpose | The finale: everything you've learned (dodge lanes, read zones, use momentum). Killing it **wins the run**. |
| Stats | hp 13 000, speed 70, radius 80, contact 2, mass 80, xp 0, never leaves. |
| Pattern A: Spiral | Every 8 s. Telegraph 0.8 s (3 faint arm lines), then for 3 s fire from 3 arms rotating at 60°/s, 6 shots/s per arm, at 240 px/s (54 projectiles). Arm spacing 120° (lanes ≈ 628 px apart at 300 px). |
| Pattern B: Blink | Every 6 s. Telegraph 0.9 s: a dark circle (radius 140) appears on the ship's position at telegraph start (at least 250 px from the Eclipse; otherwise pushed out to 250). After 0.9 s the Eclipse teleports there; the ship takes 2 damage if inside the circle. |
| Pattern C: Gravity Well (phase 2 only) | Every 10 s. Telegraph 1.0 s (inward particle stream), then for 4 s everything within 700 px is pulled: orbs at 400 px/s² toward the Eclipse, the ship at 120 px/s (less than ship speed 320, so escapable). The pull whips the orb around the Eclipse: **risk for reward** (more speed, more crits). |
| Phase 2 (≤ 50%) | Gravity Well unlocks; Spiral and Blink intervals × 0.75 (6 s, 4.5 s). |
| Edge cases | Blink target outside the arena: clamped inside. Blink lands on the orb: no effect on the orb. Overtime (after 600 s): the Eclipse is unchanged, the adds ramp (wave-director.md). Ship dies on the same tick as the Eclipse dies: win (health.md). |
| Tests | Given a blink with the ship staying put, then the ship takes 2. Given the ship moves 141+ px during the telegraph, then 0. Given phase 1, then Gravity Well never fires. Given the Eclipse dies, then the run ends as a win with +150 winBonus. |
| Dominant-strategy review | **Kiting forever** isn't viable because overtime raises add HP by 15% and spawns by 10% every 30 s. **Face-tanking** isn't viable either: contact 2 + blink 2 against 5 HP. |
