# Rule card: Damage and Crit

| Field | Spec |
|---|---|
| Purpose | P1 + P2. Turn orb speed into damage with one readable formula; crits reward the reel. |
| Inputs | Orb–enemy overlap (circle vs circle: `orbRadius` + `enemy.radius`). Orb speed `v = |orb.vel|` (absolute, not relative to the enemy). |
| State | Per (orb, enemy) pair: `cooldownLeft` (s). Stats: `damagePerSpeed` 0.08, `minDamageSpeed` 250, `critSpeed` 900, `critMultiplier` 2, `orbMass` 1, `knockback` 1. PHYSICS: `hitCooldownSec` 0.15, `maxOrbSpeed` 1600, `massDamageExponent` 0.5, `enemyHitSpeedLoss` 0.08, `knockbackBase` 0.35, `knockbackDecayPerSec` 6. Enemy: `hp`, `mass`, params `knockbackResist`, `armorSpeed`, `armorDamageMul`. |
| Resolution | Implemented by `hitDamage()` in `src/data/formulas.ts`. On overlap with `cooldownLeft <= 0`: 1. `v = min(v, 1600)`. 2. If `v < minDamageSpeed`: **bump** (0 damage, knockback still applies). 3. Else `dmg = v * damagePerSpeed * orbMass^0.5`. 4. If `v >= critSpeed`: **crit**, `dmg *= critMultiplier`. 5. Armour (brute): if `v < armorSpeed`, `dmg *= armorDamageMul`. 6. Warden stunned: `dmg *= stunnedDamageMul` (1.5). 7. Round to an integer; `enemy.hp -= dmg`. 8. Knockback: `enemy.knockVel += dir(orb.vel) * v * knockbackBase * knockback * orbMass / enemy.mass * (1 - knockbackResist)`; `knockVel` decays by `exp(-6 * dt)`. 9. On a damaging hit: `orb.vel *= (1 - 0.08)`. 10. `cooldownLeft = 0.15` for this pair. 11. If `hp <= 0`: death (drops XP / stardust / pickups, splits). |
| Outputs | Event `hit {enemy, dmg, crit, bump, v}`; `kill {enemy}`. Feedback: white number for a normal hit, larger yellow number + 40 ms hit-stop + screen shake 4 px for a crit, dull "clang" + grey spark for an armour or bump hit (P2: you can always tell why a hit was weak). |
| Projectiles | The orb destroys any enemy projectile it overlaps if `v >= minDamageSpeed`. No damage cost, no speed loss. Teaches "swat the spit". |

## Reference values (base stats)

| Orb speed (px/s) | Damage | Note |
|---|---|---|
| 249 | 0 (bump) | |
| 250 | 20 | kills a mite at hpMul 1 |
| 450 | 36 | brute armour threshold; 8 below it |
| 600 | 48 | typical circling speed |
| 900 | 144 | crit (base reel from 450) |
| 1600 | 256 | cap |

## Edge cases

| Case | Rule |
|---|---|
| Two orbs hit the same enemy in one tick | Cooldowns are per (orb, enemy) pair, so both hits land. This is Twin/Binary Star's payoff. |
| Orb stays inside a large enemy (boss) | It re-hits every 0.15 s while overlapping; each hit costs 8% speed, so it is self-limiting. |
| Enemy dies from a hit that also triggers chainOnCrit/orbExplodeOnCrit | Secondary damage resolves after the kill, centred on the dead enemy's position. |
| Secondary damage (chain, explosion, tether, thorns, shockwave) | Never crits and never triggers behaviors (no recursion). Knockback only where the behavior lists it. |
| `v` exactly `critSpeed` | Crits (≥). `v` exactly `minDamageSpeed` deals damage (≥). |
| Splitter dies | Children spawn with 0.2 s invulnerability, so the same swing doesn't delete them invisibly (they are new entities with no pair cooldown). |
| Enemy at hp ≤ 0 from two sources in one tick | Dies once; drops once (idempotent kill handler). |

## Tests (given / when / then)

1. Given base stats, when hits at 249 / 250 / 900 / 5000 px/s resolve, then the damage is 0 (bump) / 20 / 144 crit / 256 crit. *(Automated: data.test.ts.)*
2. Given a brute (armorSpeed 450, mul 0.25), when hit at 400 / 450, then the damage is 8 / 36. *(Automated.)*
3. Given an orb overlapping a mite for 0.4 s, then exactly 3 hits land (t = 0, 0.15, 0.30).
4. Given orbMass 4 requested, then the stat is clamped to 3 and damage uses `3^0.5`.
5. Given a damaging hit at 1000 px/s, then the orb leaves at 920 px/s.
6. Given a bump at 200 px/s on a mite (mass 1), then the mite gains 70 px/s knockback and 0 damage.
7. Given the worst case (every damage stat at its cap), then a single hit is ≤ 2 218 and < Warden HP. *(Automated.)*

## Dominant-strategy review

- **Damage stacking**: damagePerSpeed (cap 0.2) × mass^0.5 (cap √3) × critMultiplier (cap 4) × speed (cap 1600) has a finite worst case of 2 217, so there is no uncapped multiplication.
- **Heavy vs light**: mass only enters damage as a square root, but it divides spring acceleration linearly and drags the ship, so heavy is not strictly better.
- **Crit-only builds** (Feather + Hair Trigger + Overdrive): the crit floor is 550 (cap), so most hits crit, but Feather's mass 0.6 means ×0.77 base damage and weak knockback. Strong vs crowds, weaker vs brutes. A trade-off.
