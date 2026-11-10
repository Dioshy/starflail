# Rule card: Meta Unlocks (ships, orbs, upgrade packs, cosmetics)

| Field | Spec |
|---|---|
| Purpose | P3 *One more run: unlocks give OPTIONS, not power*. Each unlock changes how you play, never how strong you are. |
| Inputs | A purchase in the Hangar Shop (spend stardust), or an SKU entitlement (cosmetics only). |
| State | `owned: Set<id>` for ships, orbs, META_UNLOCKS, cosmetics (`slot:id`); `loadout {ship, orb, shipSkin, orbSkin, trail}`. |
| Resolution | **Buy**: if `balance ≥ cost` and not owned → `balance -= cost`, add to `owned`, auto-equip ships/orbs/cosmetics (unequip from the hangar). Packs add their upgrades to the draft pool from the next run. **Equip**: only owned items. **Run start**: `currentMods = ship.mods + orb.mods` (then upgrades), and the orb behavior (if any) joins `activeBehaviors`. |
| Outputs | Event `unlocked {id}`; the Hangar shows "NEW" badges; codex entries for new upgrades. |

## Catalogue (from `src/data/loadout.ts`, `progression.ts`, `shop.ts`)

| Kind | Item | Cost ✦ | Gains | Pays |
|---|---|---|---|---|
| Ship | Comet | free | — | — |
| Ship | Sparrow | 350 | +20% speed, +40% accel, +0.2 s i-frames | −2 HP (3 HP) |
| Ship | Lasso | 550 | +40% tether, reel 0.4 (×2.5 spin) | −20% stiffness, −5% speed |
| Ship | Bulwark | 800 | +3 HP (8 HP) | −15% speed and accel, −20% pickup radius |
| Orb | Iron | free | — | — |
| Orb | Feather | 250 | crit at 750, crit ×2.5 | mass 0.6 (×0.77 dmg), −4 px radius |
| Orb | Twin | 450 | 2 orbs (nested tethers) | mass 0.6 each, −3 px radius, −10% tether |
| Orb | Anvil | 700 | mass 1.8 (×1.34 dmg), +8 px, +40% knockback | crit at 1 000, −8% ship speed, slow spin-up |
| Pack | Reel Arsenal | 200 | Reel Shock, Gravity Reel in the draft | dilutes the pool |
| Pack | Storm Kit | 300 | Nova Core, Static Hull | dilutes the pool |
| Pack | Survivor Kit | 450 | Leech Orb, Tractor Pulse | dilutes the pool |
| Cosmetic | 9 stardust items | 120-320 | looks only | — |
| Cosmetic | 3 supporter items | €4.99 pack | looks only | — |

Order of expected purchases (median player, balance.md §5): run 2 → cosmetic or Reel Arsenal; run 3-4 → Feather or
Sparrow; runs 5-17 → the rest. **Everything is affordable by run ~17.**

## Edge cases

| Case | Rule |
|---|---|
| Buying with exactly enough | Allowed (`≥`). |
| Double-click buy | Idempotent: the second click sees `owned` and does nothing. |
| Pack bought mid-run (impossible: the shop is hangar-only) | — |
| Cosmetic owned via an SKU and also on sale for stardust | The stardust button shows "Owned". |
| Save from an older version missing new ids | Missing = not owned; unknown ids in the save are kept (forward-compatible) but ignored. |
| Locked pack upgrades | Never offered in drafts (upgrade-draft.md). |

## Tests (given / when / then)

1. Given balance 349, when buying Sparrow (350), then it is refused and the balance is unchanged.
2. Given balance 350, then Sparrow is owned and the balance is 0.
3. Given every non-free ship and orb, then each has ≥ 1 mod that is worse for the player. *(Automated.)*
4. Given Reel Arsenal owned, then Reel Shock can appear in the next run's drafts. *(Automated via eligibleUpgrades.)*
5. Given cumulative modelled stardust, then the cheapest item is unaffordable after run 1 and affordable after run 2; the whole catalogue is affordable between runs 15 and 20. *(Automated.)*

## Dominant-strategy review: does any unlock add power?

| Unlock | Power check |
|---|---|
| Sparrow | More mobility, but 3 HP: dies to 3 mistakes. A skill sidegrade. |
| Lasso | Bigger spikes, but a looser line and slower ship; worse for beginners. |
| Bulwark | More HP, but slow and with a small pickup radius, so fewer levels. A comfort pick, not stronger. |
| Feather / Anvil | Mirror trade-offs (crit frequency vs hit weight). |
| Twin | Coverage vs armour weakness. |
| Packs | Add options; they dilute the draft pool (fewer chances to see a specific default upgrade). Net power ≈ 0. |

Telemetry check: win rate per ship/orb. Any loadout more than 10 points above Comet+Iron for players with 10+ runs gets a
tuning pass.
