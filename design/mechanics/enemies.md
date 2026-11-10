# Rule cards: Enemies

Data: `MOBS` in `src/data/enemies.ts`. All enemies share these rules unless their card says otherwise:

- **Movement**: steer toward a target point at `speed` px/s, turning at most `turnRate` rad/s (default 6). Knockback velocity is added on top and decays (`knockbackDecayPerSec` 6).
- **Separation**: enemies push each other apart (soft, 60 px/s max correction), and never push the ship. The ship is never body-blocked (fairness: you can always escape through a gap).
- **Contact**: overlapping the ship deals `contactDamage` (health.md; i-frames apply).
- **HP**: `hp × wave.hpMul` at spawn (event spawns use the current wave's hpMul). Bosses ignore hpMul.
- **Death**: drops `xpMotes(xp)`, rolls `stardustChance` for one stardust pickup, rolls heart (0.5%) and magnet (0.2%).
- **Telegraphs** are ≥ 0.6 s (validated) and always use **the same visual language**: the body flashes white at 4 Hz and a thin line or arc shows where the attack will go. The direction is **locked when the telegraph starts**, so a sidestep always works (P2).
- **Off-screen**: an enemy can't start a telegraph while more than 40 px outside the view.

---

## Mite (`mite`, chaser)

| Field | Spec |
|---|---|
| Purpose | Fodder: teaches "swing into things" in the first 10 seconds. The XP baseline. |
| Stats | hp 20, speed 110, radius 12, contact 1, mass 1, xp 1, stardust 1%. turnRate 4. |
| Behavior | Moves straight at the ship. Nothing else. |
| Edge cases | A swarmRing of 30 at once: separation keeps them in a readable ring; the ring has gaps ≥ 1 ship width because the count is spaced around 520 px (circumference 3 267 px / 30 = 109 px per mite). |
| Tests | Given a mite at 200 px from a still ship, then contact happens after (200 − 26) / 110 ≈ 1.58 s. Given a 250 px/s orb hit at hpMul 1, then the mite dies (20 damage). |
| Dominant-strategy review | Mites can't be farmed: the spawn rate is fixed by the director, not by the kill rate. |

## Dart (`dart`, dasher)

| Field | Spec |
|---|---|
| Purpose | Teaches **reading a telegraph and sidestepping** (30 s in). |
| Stats | hp 30, speed 90, radius 12, contact 1, mass 1, xp 2, stardust 2%. triggerRange 190, telegraphSec 0.7, dashSpeed 600, dashSec 0.35 (210 px), cooldownSec 3. |
| Behavior | Chase at 90. When within 190 px and the cooldown is ready: stop, telegraph 0.7 s (aim line locked toward the ship's position at telegraph start), then dash 600 px/s for 0.35 s in a straight line (210 px, enough to reach a stationary ship), then cooldown 3 s while chasing again. |
| Edge cases | Knocked back during the telegraph: the telegraph continues and the dash starts from the new position in the locked direction. Hit by the orb during the dash: knockback applies, and the dash ends early. Dash crossing the arena wall: it stops at the wall. |
| Tests | Given a dart at 190 px from a still ship, then after 0.7 + 0.35 s the dart has travelled 210 px and hits. Given the ship moves 100 px perpendicular during the telegraph, then the dash misses. |
| Dominant-strategy review | Darts telegraph inside the orb's reach (190 < 140 + stretch + radii), so the telegraph is also a punish window: rewards aggression. |

## Wisp (`wisp`, orbiter)

| Field | Spec |
|---|---|
| Purpose | Teaches **chasing** with the ship and catching a lunge with the swing (1:00 in). |
| Stats | hp 25, speed 140, radius 10, contact 1, mass 0.8, xp 2, stardust 2%. orbitRadius 260, orbitAngularSpeed 0.55 rad/s, telegraphSec 0.6, lungeSpeed 520, lungeSec 0.55 (286 px), cooldownSec 3.5, firstLungeDelaySec 2. |
| Behavior | Approach to 260 px from the ship, then circle it (direction random per wisp) at 0.55 rad/s while holding 260 ± 20 px. First lunge allowed 2 s after reaching the orbit; then every 3.5 s: telegraph 0.6 s (direction locked toward the ship), lunge 520 px/s for 0.55 s, then return to orbit. |
| Edge cases | The ship moves faster than the wisp (320 vs 140), so the player can close the gap. Orbit point outside the arena: the wisp clamps to the arena and keeps its angle. |
| Tests | Given a still ship, then the wisp settles at 240-280 px. Given a lunge, then it travels 286 px (reaches a still ship at 260 px). |
| Dominant-strategy review | Ignoring wisps makes them a steady chip-damage source; chasing them pulls you off position. A real decision, as intended. |

## Blob (`blob`, splitter)

| Field | Spec |
|---|---|
| Purpose | Rewards a **follow-through swing**: one hit pops it, the next sweeps the children. |
| Stats | hp 60, speed 70, radius 22, contact 1, mass 3, xp 3, stardust 3%. splitInto blobling × 2, splitSpreadPx 26, splitImpulse 220, splitInvulnSec 0.2. |
| Behavior | Chaser at 70. On death: spawns 2 bloblings at ±26 px perpendicular to the killing hit's direction, each pushed outward at 220 px/s and invulnerable for 0.2 s (visible as a white flash). |
| Edge cases | Killed by secondary damage (explosion): it still splits; the children are immune to that same explosion (invulnerable). Killed at the hardEnemyCap: the children still spawn (the cap only gates the director, not splits). |
| Tests | Given a blob dies, then exactly 2 bloblings exist with hp 15 × hpMul and are immune for 0.2 s. Total XP for the family = 3 + 2 × 1 = 5. |
| Dominant-strategy review | Splitting is not farmable: bloblings don't split. |

## Blobling (`blobling`, chaser)

| Field | Spec |
|---|---|
| Purpose | Fast fragile swarm from blobs and the Hive's broods. |
| Stats | hp 15, speed 130, radius 10, contact 1, mass 0.6, xp 1, stardust 0%. turnRate 5. |
| Behavior | Chaser. Never spawned by waves directly (blob splits and Hive summons only). |
| Edge cases | stardustChance 0, so Hive summons can't be farmed for stardust. |
| Tests | Given a blobling at 130 px/s and a still ship, then contact time = distance / 130. |
| Dominant-strategy review | Zero stardust and low XP, so stalling a boss to farm summons isn't worth it (bosses.md, Hive). |

## Spitter (`spitter`, shooter)

| Field | Spec |
|---|---|
| Purpose | Teaches that **the orb is also a shield** (it swats spit), and forces the player to move (4:00 in). |
| Stats | hp 35, speed 100, radius 14, contact 1, mass 1.2, xp 3, stardust 4%. keepDistance 380 ± 60, telegraphSec 0.6, fireIntervalSec 2.5, projectileSpeed 260, projectileDamage 1, projectileRadius 8, projectileLifeSec 4. |
| Behavior | Moves to stay 320-440 px from the ship (backs off if closer, approaches if farther, strafes otherwise). Every 2.5 s, if on screen: telegraph 0.6 s (swells, a short aim tick shows the direction), then fire one projectile at the ship's position **at fire time** (no leading). |
| Edge cases | The projectile is slower than the ship (260 vs 320), so it is always outrunnable. Projectiles beyond `projectileHardCap` (300): the oldest is removed. A projectile touched by an orb at ≥ minDamageSpeed is destroyed. The spitter is pinned against the arena wall: it strafes along the wall. |
| Tests | Given a spitter at 380 px, then a shot reaches a still ship in about 1.46 s. Given an orb at 300 px/s crossing the projectile, then it is destroyed. Given the orb at 200 px/s, then it is not destroyed. |
| Dominant-strategy review | Kiting away from spitters is blocked by their backing-off movement; you have to cut in. Intended. |

## Brute (`brute`, tank)

| Field | Spec |
|---|---|
| Purpose | Teaches **"slow hits don't work, reel for speed"** (5:00 in). The armour check for the momentum pillar. |
| Stats | hp 220, speed 55, radius 30, contact 2, mass 6, xp 8, stardust 15%. knockbackResist 0.7, armorSpeed 450, armorDamageMul 0.25, chargeRange 360, chargeTelegraphSec 0.9, chargeSpeed 300, chargeSec 0.8 (240 px), chargeCooldownSec 5. |
| Behavior | Chaser at 55. Hits below 450 px/s deal 25% (grey "clang" spark). Knockback is ×0.3 on top of mass 6. When within 360 px and the cooldown is ready: telegraph 0.9 s (stomps, red aim line locked), then charge 300 px/s for 0.8 s, then cooldown 5 s. |
| Edge cases | The charge is slower than the ship, so it is always dodgeable. Charge into the arena wall: it stops (no stun; that is the Warden's trick). Several brutes during the 8:20 rush event: their charges are independent, and the rush spreads 4 brutes over 3 s so telegraphs don't sync. |
| Tests | Given orb hits at 400 and 450 px/s (base), then the damage is 8 and 36. *(Automated.)* Given a 900 px/s crit at hpMul 1.85, then the brute (407 HP) needs 3 crits. Given knockback from a 900 px/s hit, then dv = 900 × 0.35 / 6 × 0.3 ≈ 16 px/s. |
| Dominant-strategy review | It can't be ignored (2 contact damage) and can't be poked down slowly (armour). The reel is the answer, which is the point. |
