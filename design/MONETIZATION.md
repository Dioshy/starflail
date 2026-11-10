# STARFLAIL — Monetization Design

Pillar P4: **fair monetization**. Money buys looks, gratitude and fewer interruptions, never power and never progression speed.
Data: `SKUS`, `COSMETICS`, `ENTITLEMENTS`, `AD_POLICY` in `src/data/shop.ts`.

## 1. Products

| Product | Price | Grants | Gameplay effect |
|---|---|---|---|
| **Supporter Pack** (`supporter_pack`) | €4.99 (499 cents) | Gold hull, Prism orb, Rainbow trail, `noAds` (no interstitials ever), `supporter` badge on results + a name in the credits | None |
| **Inferno Bundle** (`bundle_inferno`) | €1.99 | Ember hull, Molten orb, Ribbon trail | None (all three are also earnable: 220 + 320 + 180 = 720 ✦) |
| **Frostvoid Bundle** (`bundle_frost`) | €1.99 | Void hull, Ice orb, Pixel trail | None (also earnable: 320 + 220 + 250 = 790 ✦) |
| Rewarded ad: **Second Wind** | free (watch ~15-30 s) | Revive once per run at 3 HP, 2 s i-frames, clears 320 px | Same for every player (see §2) |
| Rewarded ad: **Double Stardust** | free (watch) | ×2 that run's stardust, once per results screen | Faster *options*, available to everyone equally |
| Interstitial | — | — | Between runs only; capped (§2) |

There are no other products: no currency packs, no boosters, no energy, no subscriptions.

## 2. Placements and rules

| Placement | Where | Rule (enforced via `AD_POLICY`) |
|---|---|---|
| **Second Wind** | Death screen, once per run | A 10 s prompt "Watch an ad to revive?" with an equally sized "No thanks". On platforms **without** an ad SDK (own site, itch.io), and for supporters, the revive is offered **free, without a video**, so every player everywhere has exactly one revive per run. Power is identical; only the "price" (watching) differs. |
| **Double Stardust** | Results screen, once | Optional button. Base stardust is banked *before* the button shows. Not offered where no ad SDK exists. Supporters see it too (no skip), so money never buys unlock speed. |
| **Interstitial** | Only on the Results → Hangar transition | At most 1 per 3 completed runs (`interstitialEveryRuns` 3), at least 180 s since the last ad of any kind (`interstitialMinGapSec`), never during the player's first 2 runs ever (`interstitialGraceRuns`), **never for supporters**, never if a rewarded ad was watched on this results screen. |
| **Never** | During a run, in the draft, on pause, on the title, on the death prompt (except the opt-in rewarded) | No exceptions. A run is sacred (P4). |

Ad-request failure or no fill: hide the button or show "Ad unavailable"; never block progress. Audio is muted and the sim
paused during any ad.

## 3. Ethics rules (non-negotiable)

1. **No gameplay power for money.** Nothing sold changes a stat, the draft or the economy. Validation guarantees cosmetics carry no mods (`CosmeticDef` has no stat field).
2. **No loot boxes, gacha or randomized paid rewards.** Every purchase lists exactly what you get.
3. **No premium currency.** Prices are shown in real money (€, localized by the payment provider). Stardust can't be bought.
4. **Real prices, no dark patterns**: no fake discounts, no countdown timers on offers, no "only 2 left", no pre-checked boxes, and "No thanks" is as big as "Yes".
5. **Restore purchases**: own site, via a "Restore" button (email lookup of the Stripe receipt → entitlement re-granted); itch.io via the itch download key / account library; portals via their account systems. Entitlements are stored server-side or in signed receipts, never only in localStorage.
6. **Children**: portals have young audiences, so ads use the portal's family-safe/non-personalized settings by default. No purchase prompts are shown unless the player opens the Shop.
7. **Bundle overlap**: if you already own items in a bundle, the store shows which ones *before* purchase. There is no partial pricing in v1; the bundle shows "You own 2 of 3" so the choice is informed.
8. **Refunds**: honoured per platform policy; on our site, within 14 days on request (EU consumer norm). Revoking a refund removes cosmetics only, never progress.

## 4. Target platforms

| Platform | Ads | Purchases | Notes (verify against each portal's current developer docs before launch) |
|---|---|---|---|
| **CrazyGames** | Portal SDK: rewarded + midgame (interstitial) | Assumed available via the portal's in-game purchase integration (*to verify*) | The portal's own ad-frequency caps take precedence if stricter |
| **Poki** | Portal SDK: rewarded + commercial break | Assumed **not** available (*to verify*); show cosmetics as stardust-only there and hide SKUs | Portal policy may forbid external links: no Stripe link in the Poki build |
| **itch.io** | None | itch.io purchase of the Supporter Pack as "pay what you want, min €4.99" plus bundles as rewards, *or* a Stripe link (*decide one per build*) | No ads, so Second Wind is free and there is no ×2 |
| **Own site** (static hosting) | None at launch | **Stripe Payment Links** (one per SKU) → success URL with session id → tiny serverless function verifies and issues a signed entitlement token | Restore by email; prices incl. VAT (Stripe Tax *to verify*) |

Build flags (Gear): `PLATFORM = crazygames | poki | itch | web`. They gate which SDK loads, whether SKUs show, and
whether Second Wind needs an ad.

## 5. Revenue model (every assumption labelled; all values are guesses to replace with real data)

| Id | Assumption | Low | Base | High |
|---|---|---|---|---|
| R1 | Portal sessions per month (CrazyGames + Poki) | 20 000 | 60 000 | 200 000 |
| R2 | Runs per session | 2 | 3 | 4 |
| R3 | Interstitials per session (after caps and grace) | 0.2 | 0.5 | 0.8 |
| R4 | Second Wind ad uptake (per run) | 20% | 30% | 40% |
| R5 | Double Stardust uptake (per run) | 25% | 40% | 55% |
| R6 | Interstitial eCPM, net to us after portal share | €1.0 | €2.0 | €4.0 |
| R7 | Rewarded eCPM, net to us after portal share | €2.0 | €4.0 | €8.0 |
| R8 | Own site + itch unique players per month | 1 000 | 5 000 | 20 000 |
| R9 | Supporter Pack conversion (own site + itch) | 0.5% | 1.5% | 3.0% |
| R10 | Bundle conversion (any bundle, own site + itch) | 0.3% | 1.0% | 2.0% |
| R11 | Payment fees + VAT share of gross (Stripe/itch fees, EU VAT ≈ 20%) | 35% | 30% | 25% |
| R12 | Portal IAP (CrazyGames only, if available): sessions → buyers | 0 | 0.05% | 0.15% |

**Formulas**
- Ad revenue/month = R1 × [R3 × R6 + R2 × (R4 + R5) × R7] / 1000
- Direct IAP/month = R8 × [R9 × €4.99 + R10 × €1.99 × 1.2 (avg bundles per buyer)] × (1 − R11)
- Portal IAP/month = R1 × R12 × €4.99 × 0.5 (assumed portal share 50%, *to verify*) × (1 − R11)

| Line | Low | Base | High |
|---|---|---|---|
| Ads | 20 000 × [0.2×1 + 2×0.45×2]/1000 = **€40** | 60 000 × [0.5×2 + 3×0.70×4]/1000 = **€564** | 200 000 × [0.8×4 + 4×0.95×8]/1000 = **€6 720** |
| Direct IAP | 1 000 × [0.005×4.99 + 0.003×2.39] × 0.65 = **€21** | 5 000 × [0.015×4.99 + 0.01×2.39] × 0.70 = **€346** | 20 000 × [0.03×4.99 + 0.02×2.39] × 0.75 = **€2 963** |
| Portal IAP | **€0** | 60 000 × 0.0005 × 2.495 × 0.7 = **€52** | 200 000 × 0.0015 × 2.495 × 0.75 = **€561** |
| **Total / month** | **≈ €61** | **≈ €962** | **≈ €10 244** |

Reading it: rewarded ads dominate, because they are opt-in and players value both rewards. The biggest lever is **R1
(portal traffic)**, which depends on retention and portal featuring, i.e. on the game being fun. Monetization tuning is
secondary to D1/D7 retention. First telemetry to collect: sessions, runs/session, rewarded uptake per placement, and
supporter conversion by platform.

## 6. Guardrails to test (QA checklist)

- [ ] No ad request can fire while `scene == run` (unit test on the ad service).
- [ ] An interstitial never shows on runs 1-2, nor twice within 3 runs or 180 s, nor for a `noAds` entitlement.
- [ ] Second Wind is offered at most once per run on every platform; on ad-less platforms and for supporters it is free.
- [ ] Base stardust is saved before the ×2 button renders.
- [ ] Every SKU grant resolves to a cosmetic or an entitlement (`validateData`).
- [ ] Restore purchases works from a fresh browser profile on the own-site build.
