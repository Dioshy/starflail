# STARFLAIL release guide

Nothing here has been done for you: no account was created, nothing was deployed, no keys are in git.

## Platform flag
`VITE_PLATFORM` selects the monetization provider at build time. Unset = `mock` in `npm run dev`, **`web` in any production build** (a prod build can never ship the fake checkout unless you explicitly set `VITE_PLATFORM=mock`).

| Platform | Ads | Purchases | Notes |
|---|---|---|---|
| `web` | none (Second Wind is free, no ×2) | Stripe Payment Links | honor-system, see below |
| `itch` | none | button opens `VITE_ITCH_URL` (itch page) | no verifiable callback: see "itch" |
| `crazygames` | CrazyGames SDK v3 rewarded + midgame | hidden (IAP API unverified, TODO in `src/monetization/portal.ts`) | |
| `poki` | Poki SDK rewarded + commercial break | hidden | no external payment links allowed |
| `mock` | fake modals | fake checkout | dev only |

SDK scripts load only on their own platform and every call has a time-out, so a blocked SDK just means no ads.
Verify SDK calls against each portal's current developer docs before submitting (they change).

## Build and zip
```bash
npm ci && npm test && npm run typecheck
VITE_PLATFORM=web  VITE_STRIPE_LINK_SUPPORTER_PACK=... VITE_STRIPE_LINK_BUNDLE_INFERNO=... VITE_STRIPE_LINK_BUNDLE_FROST=... npm run build   # own site
(cd dist && zip -r ../starflail-web.zip .)
VITE_PLATFORM=itch VITE_ITCH_URL=https://<you>.itch.io/starflail npm run build && (cd dist && zip -r ../starflail-itch.zip .)
VITE_PLATFORM=crazygames npm run build && (cd dist && zip -r ../starflail-crazygames.zip .)
VITE_PLATFORM=poki npm run build && (cd dist && zip -r ../starflail-poki.zip .)
```
`vite.config.ts` uses `base: './'`, so the zip works from any sub-path. `index.html` must be at the zip root.
Env vars may also live in `.env.production.local` (git-ignored; copy `.env.example`).

## Hosting (own site)
Upload `dist/` to any static host (Cloudflare Pages, Netlify, GitHub Pages, S3). Serve over HTTPS. `privacy.html`, `terms.html` and `manifest.webmanifest` are in `dist/` root.
itch: upload the zip as "HTML5", tick "playable in browser", set viewport ~1280x720, enable fullscreen button.
CrazyGames / Poki: upload through their developer portals; both require their own review.

## Stripe Payment Links (own site)
1. Create a Stripe account, complete business verification, add your bank account.
2. Products: create three one-time products at EUR 4.99 / 1.99 / 1.99 named exactly like `src/data/shop.ts` (Supporter Pack, Inferno Bundle, Frostvoid Bundle). Set tax behaviour (inclusive) and enable Stripe Tax if applicable.
3. For each, create a Payment Link (quantity fixed to 1, no promo codes needed). Under **After payment** choose "Don't show confirmation page" and redirect to:
   - `https://YOURSITE/?purchase=success&sku=supporter_pack`
   - `https://YOURSITE/?purchase=success&sku=bundle_inferno`
   - `https://YOURSITE/?purchase=success&sku=bundle_frost`
4. Put the three `https://buy.stripe.com/...` URLs in `VITE_STRIPE_LINK_SUPPORTER_PACK`, `VITE_STRIPE_LINK_BUNDLE_INFERNO`, `VITE_STRIPE_LINK_BUNDLE_FROST` (public URLs, not secrets, but keep them out of git).
5. Test in Stripe test mode first (test links + card 4242 4242 4242 4242), then swap to live links.

### Honor system, and the plan to verify server-side
On return the game grants the entitlement locally from the URL. Anyone can type that URL, so this is **honor-system**; acceptable for cosmetics at launch (worst case someone unlocks looks for free; no gameplay or other player is affected). Upgrade path:
1. Append `&session_id={CHECKOUT_SESSION_ID}` to the success URL (confirm Payment Links support the placeholder in the current Stripe docs; otherwise use Checkout Sessions created by the function).
2. A serverless function (Cloudflare Worker / Vercel) holds a restricted Stripe key in its own env (never in the client), calls `GET /v1/checkout/sessions/{id}`, checks `payment_status == "paid"` and that the line item is the expected price, then returns an HMAC-signed token `{sku, session, iat}`.
3. The client stores the token with the entitlement and re-validates it on load/restore; "Restore by email" looks up paid sessions by customer email and re-issues tokens.
4. Handle refunds through the `charge.refunded` webhook: revoke cosmetics only, never progress.

### itch
HTML5 embeds get no purchase callback. Options: (a) leave the Store as a link to your itch page and sell a separate supporter edition / donation there, (b) use Stripe from the itch build too (itch allows external payment links, check their TOS). Decide per build; v1 ships (a): the button opens `VITE_ITCH_URL` and grants nothing automatically.

## Legal
`public/privacy.html` and `public/terms.html` are **templates with a "needs human legal review" banner**. Fill every `[BRACKET]`, get them reviewed, then delete the banner. They state: no tracking by default; ad platforms handle their own consent. If you add analytics, update them and add consent first.

## Go-live checklist
- [ ] `npm test`, `npm run typecheck`, all `npm run build` variants green
- [ ] Legal pages filled and reviewed; company / VAT details in Stripe; refund policy decided
- [ ] Stripe live Payment Links created, redirect URLs set, env vars set on the build host
- [ ] Buy each SKU once in Stripe test mode: items unlock, "Restore purchases" works on the same browser
- [ ] Verify no ad ever appears during a run (play 5 runs on each portal build); interstitial only after results -> hangar
- [ ] Portal SDK calls re-checked against current CrazyGames / Poki docs; portal QA passed
- [ ] Gameplay audio muted and sim paused while an ad plays (portal reviewers check this)
- [ ] HTTPS, correct `Content-Type` for `.webmanifest`, cache headers on `assets/`
- [ ] Decide server-side verification before revenue becomes meaningful
