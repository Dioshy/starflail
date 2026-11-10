# Rule card: Health

| Field | Spec |
|---|---|
| Purpose | A small, readable HP pool (5 pips) so every hit matters and every death has a traceable cause (P2). |
| Inputs | Contact with an enemy body (circle overlap with the ship, ship radius 14 px); contact with an enemy projectile or boss area attack; heart pickup; regen; vampiric; Second Wind. |
| State | `hp` (integer, 0..maxHp), `maxHp` = stat `shipMaxHp` (5; clamp 1..12), `iframesLeft` (s), `regenAcc` (fraction of HP). Stats: `iframesSec` 1.0, `regenPerMin` 0. AD_POLICY: `secondWindHp` 3, `secondWindIframesSec` 2, `secondWindClearRadius` 320. |
| Resolution | **Damage**: on any damaging contact with `iframesLeft <= 0`: collect all damage sources this tick and apply only the **largest** one, then `hp -= dmg`, `iframesLeft = iframesSec`, and give the ship 220 px/s of velocity away from the source. While `iframesLeft > 0`, all damage is ignored (the ship blinks at 10 Hz). **Regen**: `regenAcc += regenPerMin / 60 * dt`; when ≥ 1 and `hp < maxHp`: `hp += 1`, `regenAcc -= 1`. At full HP, `regenAcc` is capped at 1 (no banking). **Max HP up** (Hull Plating): `maxHp += n` and `hp += n`. **Max HP down** (ship choice, only before a run): `hp = min(hp, maxHp)`. **Heart**: `hp = min(maxHp, hp + 1)`. **Death**: `hp <= 0` → if Second Wind is unused this run, pause and offer it (10 s countdown, "No thanks" button); if taken: `hp = min(3, maxHp)`, `iframesLeft = 2`, remove all enemies and projectiles within 320 px (no XP), resume. Otherwise go to Results. |
| Outputs | Events `shipHit {source, dmg}`, `shipHealed {amount, source}`, `shipDied {cause}`. Feedback: a pip breaks with a crunch, 120 ms red vignette, 6 px screen shake; the results screen names the killing enemy ("Killed by: Spitter spit"). |

## Edge cases

| Case | Rule |
|---|---|
| Two enemies touch the same tick (1 and 2 damage) | Take 2 only. |
| Touch exactly as i-frames end | Damage applies on the first tick where `iframesLeft <= 0`. |
| Contact while in the draft UI | The sim is paused, so impossible. |
| Heart at full HP | Not attracted by `pickupRadius` and not collected; it stays until its 20 s lifetime ends. Hearts are never wasted. |
| Second Wind with maxHp 3 (Sparrow) | Revive at `min(3, 3) = 3`. |
| Death on the same tick as the Eclipse kill | The kill resolves first (damage step runs before contact step): **win**. |
| Regen at maxHp 12 cap | Works normally. Max 3 HP per minute (STAT_LIMITS). |
| Contact damage from a boss blink (2) with 1 HP left | Death; offer Second Wind. |

## Tests (given / when / then)

1. Given hp 5 and two simultaneous contacts (1 and 2), then hp = 3 and iframes = 1.0.
2. Given iframes 0.5 left, when touched, then hp is unchanged.
3. Given regenPerMin 1 and hp 4/5, when 60 s pass with no hits, then hp = 5; after another 120 s it is still 5 and `regenAcc` ≤ 1.
4. Given Hull Plating at hp 3/5, then hp = 4/6.
5. Given hp 1, when hit, then the Second Wind prompt shows; given accept, then hp = 3, iframes 2, and no enemies within 320 px.
6. Given Second Wind already used, when hp hits 0, then go straight to Results.
7. Given hp 5/5, when a heart is in pickup range, then it is not collected.

## Dominant-strategy review

- **Tanking** (Bulwark + Hull Plating ×4 + Nanorepair ×2): 12 HP cap, 1 HP/min regen. Survives longer but has no damage picks, so bosses warp out and the run earns less stardust. Not dominant; a valid casual comfort build.
- **I-frame abuse**: i-frames are capped at 2 s and only trigger on a hit, so you cannot buy invulnerability.
