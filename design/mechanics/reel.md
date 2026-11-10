# Rule card: Reel

| Field | Spec |
|---|---|
| Purpose | P1. The skill expression: shorten the tether at the right moment to spike orb speed into a crit (a skater pulling in their arms). Dynamic: timing reels into crowds and bosses. Aesthetic: mastery, sensation. |
| Inputs | `Reel` held (Space / Shift / RMB; A; touch reel button). Binary, sampled each tick. |
| State | `reelPhase` ∈ {`idle`, `reeling`, `held`, `releasing`}; `restLength` (px); `heldSec`. Stats: `tetherLength` L (140), `reelRatio` (0.5, clamp 0.3..0.8). PHYSICS: `reelTimeSec` 0.25, `reelReleaseSec` 0.35, `heldReelExtraDamping` 1.5/s, `maxOrbSpeed` 1600. |
| Resolution | **Press** (from idle or releasing): `phase = reeling`. Rest length moves linearly from its current value toward `target = reelRatio * L` at speed `(L - target) / reelTimeSec` px/s, so a full reel takes 0.25 s and a partial one proportionally less. **Each reeling tick**, for each orb that is **taut** (dist ≥ L_i before the change): decompose the orb velocity relative to the ship into radial and tangential parts, and scale the tangential part by `r_old / r_new` (the rest length before and after this tick). This conserves angular momentum; a full base reel doubles tangential speed (`1 / 0.5`). Then clamp to `maxOrbSpeed`. **Reached target** → `phase = held`. **While held**: `orb.vel *= exp(-heldReelExtraDamping * dt)`, so holding gives a spike, not a state. **Release** (from reeling or held): `phase = releasing`; rest length moves back to L at `(L - target) / reelReleaseSec` px/s. No velocity scaling on release: the tether goes slack, the orb flies outward at full speed (slingshot), and when it goes taut at L the spring catch and radial damping take off the radial part. So the net speed after a reel/release cycle returns to about where it started. **Reached L** → `idle`. |
| Outputs | Events `reelStart {orbSpeed}` (triggers shockwaveOnReel, slowField), `reelEnd`. Feedback: the tether visibly shortens and thickens; a rising whoosh pitched by orb speed; the orb glows when speed ≥ critSpeed (a "crit-ready" cue, P2). |

## Edge cases

| Case | Rule |
|---|---|
| Orb slack when reel starts | No tangential scaling until it becomes taut (pulling a slack rope does nothing). The rest length still shortens. |
| Press during `releasing` | Resumes reeling from the current rest length; time is proportional to the remaining distance. |
| Tap shorter than 0.25 s | Partial reel; scaling applies to the shortened part only. A tap from 140 to 105 gives ×1.33. |
| `reelRatio` changes mid-reel (upgrade picked while held: draft pauses the game) | On resume the target is recomputed; if the new target is below the current rest length, keep reeling. |
| `tetherLength` changes mid-reel | `restLength` is re-expressed as the same fraction of the new L, with no velocity change. |
| Scaled speed > 1600 | Clamped to 1600. |
| Multiple orbs | Each orb scales independently by its own `L_i` ratio (the ratio is the same, `r_old / r_new`). |
| Reel input during draft / pause | Ignored; the phase is frozen. On resume, if the button is no longer held, start `releasing`. |
| Death mid-reel | The phase resets to `idle`; on Second Wind the rest length is L. |

## Tests (given / when / then)

1. Given an orb taut at r = 140 moving tangentially at 450 px/s, when Reel is held for 0.25 s, then the rest length is 70 and tangential speed is 900 (±2%, before drag), so the next hit crits at base stats.
2. Given the same at 1000 px/s, then speed after reel = 1600 (clamped).
3. Given Reel held for 1.0 s after reaching target, then the orb speed has decayed by at least `exp(-1.5 * 0.75)` ≈ 0.32× from the peak.
4. Given a slack orb (dist 100 < L 140), when reeling from 140 to 100, then no scaling is applied.
5. Given a 0.1 s tap, then the rest length reaches 140 - 0.1 × 280 = 112, and tangential speed scales by 140/112 = 1.25.
6. Given reel then immediate release with the ship still, when 1.0 s passes, then the orb speed is ≤ its pre-reel speed (no free energy).
7. Given `reelRatio` 0.3 (cap), then a full reel scales tangential speed by 3.33 (still clamped by 1600).
8. Determinism: identical input logs produce identical `restLength` per tick.

## Dominant-strategy review

- **Permanent reel** (hold forever): after the 0.25 s spike, the orb loses 1.5/s on top of drag, so it falls below `minDamageSpeed` in about 1 s. Result: holding is worse than tapping. **Not dominant.** The accessibility "toggle" option keeps this property.
- **Reel spam / pumping**: each cycle gains tangential speed on the way in and gives it back on the catch, minus drag. A skilled player can still pump toward the 1600 cap; that is the intended skill ceiling. It is bounded by `maxOrbSpeed`, `orbLinearDrag` and `tetherDamping`. Telemetry: track the share of run time at ≥ 1500 px/s; if the median skilled player is above 30%, raise `tetherDamping` to 6.
- **Never reeling**: circling alone gives 450-750 px/s, so bosses take about 2× longer and crits are rare. Viable for the first runs, outscaled later. Intended: the reel is the mastery path, not a gate.
