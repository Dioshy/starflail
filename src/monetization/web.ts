// Own-site build: Stripe Payment Links, no ads.
//
// HONOR SYSTEM: the success redirect carries ?purchase=success&sku=X, which anyone can type. A payment link alone cannot
// prove payment to a static site. It is acceptable for a €1.99-€4.99 cosmetic pack at launch (worst case: someone gives
// themselves cosmetics), and the doc docs/RELEASE.md section "Server-side verification" describes the upgrade:
//   1. Payment Link success URL = https://site/?purchase=success&sku=X&session_id={CHECKOUT_SESSION_ID}
//   2. a tiny serverless function (Cloudflare Worker / Vercel) calls Stripe `GET /v1/checkout/sessions/:id` with a
//      restricted secret key (server-side env var), checks payment_status == 'paid' and the price/SKU, then returns an HMAC-signed token
//   3. the client stores the token and re-verifies the signature on restore; "Restore by email" looks up paid sessions by email.
import { SKUS } from '../data';
import type { EntitlementStore, MonetizationProvider } from './types';

export function stripeLinkFor(env: Record<string, unknown>, sku: string): string | null {
  const v = env[`VITE_STRIPE_LINK_${sku.toUpperCase()}`];
  return typeof v === 'string' && /^https:\/\//.test(v) ? v : null;
}

/** Consume ?purchase=success&sku=X from a location search string. Returns the SKU to grant, or null. */
export function parsePurchaseReturn(search: string): string | null {
  const q = new URLSearchParams(search);
  const sku = q.get('sku');
  if (q.get('purchase') !== 'success' || !sku) return null;
  return SKUS.some((k) => k.sku === sku) ? sku : null;
}

export class WebProvider implements MonetizationProvider {
  readonly platform = 'web' as const;
  readonly capabilities = { rewarded: false, interstitial: false, purchases: true };
  constructor(private readonly ents: EntitlementStore, private readonly env: Record<string, unknown> = import.meta.env, private readonly nav: { assign(u: string): void } = { assign: (u) => window.location.assign(u) }) {}

  async init(): Promise<void> {
    try {
      const sku = parsePurchaseReturn(window.location.search);
      if (sku) {
        this.ents.grant(sku);
        const u = new URL(window.location.href);
        for (const k of ['purchase', 'sku', 'session_id']) u.searchParams.delete(k);
        window.history.replaceState(null, '', u.pathname + (u.search || '') + u.hash);
      }
    } catch { /* never block startup */ }
  }
  async showRewarded(): Promise<boolean> { return false; }
  async showInterstitial(): Promise<void> { /* no ads on the own site */ }
  async purchase(sku: string): Promise<{ ok: boolean }> {
    const link = stripeLinkFor(this.env, sku);
    if (!link) return { ok: false }; // payment link not configured: the store shows "unavailable"
    try { this.nav.assign(link); } catch { return { ok: false }; }
    return { ok: false }; // the entitlement is granted on return (init), never here
  }
  async restore(): Promise<string[]> { return this.ents.restore(); }
  getEntitlements(): string[] { return this.ents.list(); }
}
