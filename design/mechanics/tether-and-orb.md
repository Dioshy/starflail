# Rule card: Tether and Orb

| Field | Spec |
|---|---|
| Purpose | P1 *Momentum is the weapon*. The ship never attacks; it drags a heavy orb whose speed becomes damage. Dynamic: circle-strafing, whip turns. Aesthetic: mastery, sensation. |
| Inputs | `Move` intent (vector, magnitude 0..1). `Reel` state from reel.md (sets the current rest length). |
| State | Ship: `pos`, `vel`. Per orb `i` (0..orbCount-1): `pos`, `vel`. `restLength` (px, from reel.md). Stats: `shipSpeed` 320, `shipAccel` 1800, `orbMass` 1, `orbRadius` 18, `tetherLength` 140, `tetherStiffness` 40, `orbCount` 1. PHYSICS: `orbDrag` 1.25/s (relative to the ship), `tetherDamping` 4/s, `maxStretchRatio` 1.6, `shipMass` 2, `maxOrbSpeed` 1600, `wallSpeedLoss` 0.5, `fixedStepHz` 60. `ARENA_RADIUS` 1600. |
| Resolution (per fixed tick, dt = 1/60 s, in this order) | 1. **Ship steering**: `desired = move * shipSpeed`; change `vel` toward `desired` by at most `shipAccel * dt`. 2. **Orb rest length**: orb `i` uses `L_i = restLength * (1 - 0.2 * i)` (nested tethers: 100%, 80%, 60%). 3. **Spring** (per orb): `d = orb.pos - ship.pos`, `dist = |d|`, `n = d / dist`, `stretch = dist - L_i`. If `stretch > 0` (taut): `orb.vel += (-tetherStiffness * stretch / orbMass) * n * dt`; radial damping `orb.vel -= tetherDamping * dot(orb.vel - ship.vel, n) * n * dt`; reaction `ship.vel += (tetherStiffness * stretch / shipMass) * n * dt`. If `stretch <= 0` (slack): no force; it is a rope, not a rod. 4. **Drag (relative to the ship)**: `v_rel = orb.vel - ship.vel`; `v_rel *= exp(-orbDrag * dt)`; `orb.vel = ship.vel + v_rel`. When the reel is held, the exponent is `orbDrag + heldReelExtraDamping` (reel.md). Drag is relative so that an orb simply carried along by a moving ship isn't slowed: only the swing decays. While reeling or held, the reel card's kinematic/rigid rules replace step 3 for that orb. 5. **Clamp**: `|orb.vel| <= maxOrbSpeed`; `|ship.vel| <= shipSpeed * 1.25` (tether yank cannot fling the ship). 6. **Integrate** (semi-implicit Euler): `pos += vel * dt` for ship and orbs. 7. **Hard rope**: if `dist > maxStretchRatio * L_i`, move the orb to that distance and remove its outward radial velocity relative to the ship. 8. **Arena**: the ship is clamped inside `ARENA_RADIUS - shipRadius` (it slides, no bounce). If an orb's edge crosses the wall, push it inside, reflect the normal velocity component, then `orb.vel *= (1 - wallSpeedLoss)`. The loss applies at most once per 0.15 s per orb. |
| Outputs | Orb position and velocity, read by damage-and-crit.md. Event `orbWallHit {orb, speedBefore}` (spark VFX, thud SFX). The tether is drawn as a line ship→orb; its brightness scales with `stretch` (readability: a taut line means speed is building). |
| Not in scope | The orb does not collide with the ship or with other orbs. The orb passes through enemies (damage card), it does not bounce off them. |

## Edge cases

| Case | Rule |
|---|---|
| `dist == 0` (orb exactly on ship, e.g. spawn) | Treat `n = (1, 0)`. Orbs spawn at `ship.pos + (L_i, 0)` rotated by `i * 180°` so this only happens through a bug. |
| Ship standing still | Swing decays by `orbDrag` (71% lost per second: `exp(-1.25)` = 0.29) and the orb settles in the slack state. No damage below `minDamageSpeed`. Standing still is never a strategy. |
| Ship moving in a straight line | The orb trails at ship speed with no relative drag loss (it is carried). Damage from simply dragging the orb into enemies = ship-speed hits; see the passive floor in balance.md §8. |
| Very heavy orb (mass 3 cap) | Spin-up acceleration is `k*stretch/3`; tether reaction slows the ship. Covered by STAT_LIMITS. |
| Stiffness cap 80 with small mass 0.4 | Spring accel is up to 200 × stretch. At 60 Hz semi-implicit Euler with `k/m = 200`, `dt*sqrt(k/m) = 0.24` < 2, so it stays stable. Gear: assert this at load (`dt * sqrt(maxK / minMass) < 1`). |
| Pause or tab blur | The sim does not tick (fixed-step accumulator is reset on resume, so no catch-up burst). |
| `orbCount` changes mid-run (Binary Star) | The new orb spawns at the ship's position + `L_i` on the side opposite orb 0, with the ship's velocity. |
| Orb at wall and ship pulling it outward | The wall pushes the orb back in each tick; the speed loss applies at most once per 0.15 s, so the orb cannot be drained to 0 in one frame. |

## Tests (given / when / then)

1. Given a ship at rest and an orb at distance 140 with velocity 0, when 60 ticks pass with no input, then the orb speed stays 0 and the orb position is unchanged (slack, no force).
2. Given an orb at distance 160 (stretch 20, mass 1, k 40), when one tick runs, then orb accel toward the ship is 800 px/s² (±1%) before damping.
3. Given an orb at mass 2 with the same stretch, when one tick runs, then the accel is 400 px/s² (heavier spins up slower).
4. Given an orb moving at 3000 px/s, when one tick runs, then `|orb.vel| <= 1600`.
5. Given an orb hitting the wall at 800 px/s, when contact resolves, then its speed is 400 px/s (±1 px/s), and a second contact within 0.15 s does not reduce it again.
6. Given orbCount 3 and tetherLength 140, then the rest lengths are 140, 112, 84.
7. Given the ship circling at full speed on a ~100 px radius for 3 s with no reel, then the median orb speed at contact is ≥ the passive-floor speed in balance.md §8 (golden-value test; refit from Gear's greybox harness whenever `orbDrag` or `minDamageSpeed` changes).
10. Given the ship moving in a straight line at 320 px/s for 2 s, then the orb's speed relative to the ship is < 5 px/s (relative drag doesn't slow a carried orb).
8. Given dist > 1.6 × L, when a tick runs, then dist == 1.6 × L and the outward radial velocity is 0.
9. Determinism: same seed and same input log for 600 ticks, then identical orb positions.

## Dominant-strategy review

- **Edge-circling** (hug the arena wall so enemies come from one side): the orb clips the wall every lap and loses 50% speed per contact, and the director spawns enemies on the inward arc. Result: lower damage and enemies still converge. **Not dominant.** If telemetry shows more than 20% of run time within 200 px of the wall, raise `wallSpeedLoss` to 0.6.
- **Tiny circles in the middle**: these give high angular speed but a short effective radius. Enemies reach the ship through the orb's arc gaps. Fine, intended as a skill.
- **Standing still**: the orb dies down to 0 speed. Not viable.
- **Long tether stacking (Long Line ×4 + Lasso)**: up to 280 px (cap). Faster tip speed, but more wall clipping and slower response. A trade-off.
