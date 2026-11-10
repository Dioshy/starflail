# Rule card: Upgrade Draft

| Field | Spec |
|---|---|
| Purpose | Build expression (aesthetic: discovery). Every level-up offers 1 of 3 upgrades that bend the swing, not just add numbers. |
| Inputs | `levelUp` (xp.md). Player choice: pick card 1/2/3, or reroll (once per run). |
| State | `stacks: Record<upgradeId, n>`, `rerollsLeft` (PROGRESSION.rerollsPerRun = 1), `unlockedMeta` (owned META_UNLOCKS ids), `currentMods` (ship + orb + picked upgrades), `activeBehaviors`. PROGRESSION: `upgradeChoices` 3, `rarityWeights` {common 65, rare 28, epic 7}, `fallbackReward` {heal 1, stardust 10}. RNG: the run's seeded `draft` stream (separate from spawn and VFX streams). |
| Resolution | Implemented by `eligibleUpgrades()` and `rollDraft()` in `src/data/formulas.ts`. 1. **Eligible** = upgrades where (a) `unlock == 'default'` or the meta unlock is owned, (b) `stacks < maxStacks`, (c) for behavior upgrades, the behavior isn't already active from any source, (d) for stat upgrades, at least one stat would actually change after clamping (no dead picks such as Tight Coil at reelRatio 0.3). 2. **Roll** up to 3 distinct cards: per slot, roll a rarity by weight among the rarities that still have candidates, then pick uniformly within it. 3. If fewer than 3 are eligible, fill **one** slot with the fallback card "Field Repair: +1 HP and +10 stardust" (only if at least one slot is empty). 4. **Pick**: append the mods, set `stacks[id] += 1`, add the behavior, recompute stats (`computeStats`), and apply Max-HP-up healing (health.md). 5. **Reroll**: if `rerollsLeft > 0`, re-run step 2 with the same eligibility (the old cards may reappear) and `rerollsLeft -= 1`. |
| Outputs | Event `upgradePicked {id, stacks}`. UI: 3 cards with rarity frame (common grey, rare cyan, epic magenta), name, one-line description, stack pips (e.g. ●●○○), and a stat delta preview ("Tether 140 → 160"). The game is paused while the draft is open. |

## Upgrade list (from `src/data/upgrades.ts`)

25 upgrades: 14 common, 7 rare, 4 epic; 8 use behaviors; 7 touch the reel or tether; 19 are in the default pool.

| id | name | rarity | max | mods | behavior | unlock |
|---|---|---|---|---|---|---|
| `spikedShell` | Spiked Shell | common | 5 | damagePerSpeed ×1.12 | — | default |
| `heavyCore` | Heavy Core | common | 4 | orbMass ×1.2 | — | default |
| `thrusters` | Thrusters | common | 4 | shipSpeed ×1.08; shipAccel ×1.1 | — | default |
| `longLine` | Long Line | common | 4 | tetherLength +20 | — | default |
| `tautLine` | Taut Line | common | 3 | tetherStiffness ×1.15 | — | default |
| `hullPlating` | Hull Plating | common | 4 | shipMaxHp +1 | — | default |
| `magnetCoil` | Magnet Coil | common | 3 | pickupRadius ×1.25 | — | default |
| `starCharts` | Star Charts | common | 3 | xpGain ×1.1 | — | default |
| `wideOrb` | Wide Orb | common | 3 | orbRadius +4 | — | default |
| `hairTrigger` | Hair Trigger | common | 3 | critSpeed -60 | — | default |
| `ramPlating` | Ram Plating | common | 3 | knockback ×1.25 | — | default |
| `glancingBlows` | Glancing Blows | common | 3 | minDamageSpeed -30 | — | default |
| `staticHull` | Static Hull | common | 1 | — | thorns {damage 30, knockback 420, cooldownSec 0.5} | stormKit |
| `tractorPulse` | Tractor Pulse | common | 1 | — | magnetPulse {intervalSec 15, radius 700} | survivorKit |
| `tightCoil` | Tight Coil | rare | 3 | reelRatio -0.05 | — | default |
| `whipcrack` | Whipcrack | rare | 2 | tetherLength ×0.9; reelRatio -0.05; critSpeed -50 | — | default |
| `barbedLine` | Barbed Line | rare | 1 | tetherLength +10 | tetherDamage {damagePct 0.25, hitCooldownSec 0.4} | default |
| `nanorepair` | Nanorepair | rare | 2 | regenPerMin +0.5 | — | default |
| `reelShock` | Reel Shock | rare | 1 | — | shockwaveOnReel {radius 130, damage 25, knockback 380, cooldownSec 1} | reelArsenal |
| `gravityReel` | Gravity Reel | rare | 1 | — | slowField {radius 150, slowPct 0.4, onlyWhileReeling 1} | reelArsenal |
| `arcCoil` | Arc Coil | rare | 1 | — | chainOnCrit {jumps 3, range 160, damagePct 0.5} | default |
| `binaryStar` | Binary Star | epic | 1 | orbCount +1; orbMass ×0.85 | — | default |
| `overdrive` | Overdrive | epic | 1 | critMultiplier +0.75; critSpeed +50 | — | default |
| `novaCore` | Nova Core | epic | 1 | — | orbExplodeOnCrit {radius 110, damagePct 0.6, cooldownSec 0.5} | stormKit |
| `leechOrb` | Leech Orb | epic | 1 | — | vampiric {killsPerHeal 40, maxHealsPerMin 2} | survivorKit |

Behavior rules: behaviors.md.

## Edge cases

| Case | Rule |
|---|---|
| 0 eligible upgrades | Draft shows only the fallback card (heal 1 + 10 stardust). Can't happen before about level 50 with the default pool (53 total stacks). |
| 1-2 eligible | Those cards plus one fallback card. |
| Reroll with ≤ 3 eligible | The reroll button is disabled (it would show the same set). |
| Multiple pending drafts | Shown back to back; each one recomputes eligibility after the previous pick. |
| Orb already grants a behavior | (No v1 orb does.) The matching upgrade is ineligible by rule (c). |
| A stat would go past its cap | The pick is allowed if any of its mods still changes something (Whipcrack at reelRatio 0.3 still changes tether and crit). The UI shows "(capped)" next to the dead part. |
| Locked upgrades | Never offered, never visible in drafts. The hangar Shop shows them as "Unlock in Reel Arsenal". |

## Tests (given / when / then)

1. Given no meta unlocks, then the 6 locked upgrades never appear in 300 seeded drafts. *(Automated.)*
2. Given Spiked Shell at 5/5, then it is not eligible. *(Automated.)*
3. Given reelRatio at 0.3, then Tight Coil is ineligible and Whipcrack is still eligible. *(Automated.)*
4. Given chainOnCrit active, then Arc Coil is ineligible. *(Automated.)*
5. Given seed s, then `rollDraft` returns 3 distinct cards, identical on re-run with seed s. *(Automated.)*
6. Given 2 eligible upgrades, then the draft shows those 2 + Field Repair.
7. Given rerollsLeft 1, when rerolled, then rerollsLeft 0 and the reroll button is disabled.
8. Given rarity weights 65/28/7 over 10 000 draft slots with the full pool, then the common share is 65% ± 2% (a statistical test with a fixed seed).

## Dominant-strategy review: is there one strictly best upgrade?

| Pair compared | Why neither dominates |
|---|---|
| Spiked Shell (+12% dmg) vs Heavy Core (+20% mass) | Shell is pure damage. Core is +9.5% damage (√1.2) **and** +20% knockback, but spins up slower. Shell wins on damage, Core on crowd control. |
| Hair Trigger vs Overdrive | Trigger makes crits frequent; Overdrive makes crits bigger but rarer. They combine, but each is worse alone for the other's build. |
| Long Line vs Whipcrack | Opposite directions (long and fast vs short and crit-heavy). Lasso ship prefers Line, Feather orb prefers Whipcrack. |
| Binary Star (epic) | Two orbs at 0.85 mass each (×0.92 damage), but the second orb is on an 80% tether (slower tip speed, about 0.8× damage), so coverage is about 1.7× in crowds and only modestly more on a single boss. Best epic for crowds, not for armour. It is an epic (7% weight) and maxStacks 1. |
| Barbed Line | Damage scales with the orb hit (25%), so it is not dead late, but it needs the tether to sweep through crowds. |
| Leech Orb | Capped at 2 HP/min and 40 kills per heal, so it can't make you immortal. |
| Magnet/XP picks | No combat power: they trade a pick for tempo. |

Monitor in telemetry: per-upgrade pick rate and win rate when owned. Any upgrade picked > 60% of the time when offered,
or with a win-rate delta > 15 points, gets a nerf ticket.
