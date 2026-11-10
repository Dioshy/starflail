// The Store: real-money SKUs (Supporter Pack hero, bundles) + stardust cosmetics. Cosmetics, noAds and supporter status ONLY.
// Real prices (EUR via Intl), no timers, no fake discounts, "No thanks" as big as "Yes" (design/MONETIZATION.md section 3).
import { audio } from '../audio';
import { COSMETICS, SKUS } from '../data';
import type { SkuDef } from '../data';
import { buyCosmetic, equip, ownsCosmetic, type SaveStore } from '../game/save';
import { equipSkuCosmetics, fmtEur, isSupporter, ownsSku, type MonetizationProvider } from '../monetization';
import { clear, h } from './dom';

const cosmeticName = (id: string): string => COSMETICS.find((c) => c.id === id && c.id !== 'default')?.name ?? id;
const skuCosmetics = (s: SkuDef): { slot: (typeof COSMETICS)[number]['slot']; id: string }[] =>
  s.grants.flatMap((g) => COSMETICS.filter((c) => c.id === g).map((c) => ({ slot: c.slot, id: c.id })));

export class StoreScreen {
  readonly el = h('div', 'screen store hidden');
  private body = h('div', 'hangar-body store-body');
  private status = h('div', 'store-status', '', { role: 'status', 'aria-live': 'polite' });
  private balance = h('div', 'hangar-balance');
  private store!: SaveStore;
  private provider!: MonetizationProvider;
  private busy = false;
  onBack: () => void = () => {};
  onChange: () => void = () => {};

  constructor(parent: HTMLElement) {
    const head = h('div', 'hangar-head');
    const back = h('button', 'btn', '← Hangar', { 'data-act': 'store-back' });
    back.addEventListener('click', () => this.onBack());
    head.append(back, h('h2', 'hangar-title', 'STORE'), this.balance);
    this.el.append(head, this.status, this.body);
    parent.append(this.el);
  }

  show(store: SaveStore, provider: MonetizationProvider): void {
    this.store = store; this.provider = provider;
    this.el.classList.remove('hidden');
    this.render();
  }
  hide(): void { this.el.classList.add('hidden'); }

  private say(msg: string): void { this.status.textContent = msg; }

  private async buy(sku: SkuDef): Promise<void> {
    if (this.busy) return;
    this.busy = true; this.say('Opening checkout…');
    try {
      const res = await this.provider.purchase(sku.sku);
      if (res.ok) {
        equipSkuCosmetics(this.store.data, sku.sku); this.store.commit(); this.store.flush();
        audio.play('purchase'); this.say(`${sku.name} unlocked. Thank you!`); this.onChange();
      } else this.say(this.provider.platform === 'web' || this.provider.platform === 'itch' ? 'Continue in the payment page. Your items unlock when you return.' : 'Purchase cancelled. Nothing was charged.');
    } finally { this.busy = false; this.render(); }
  }

  private async restore(): Promise<void> {
    if (this.busy) return;
    this.busy = true; this.say('Restoring…');
    try {
      const before = this.store.data.entitlements.length;
      await this.provider.restore();
      const n = this.store.data.entitlements.length - before;
      this.say(n > 0 ? `Restored ${n} purchase${n === 1 ? '' : 's'}.` : 'Nothing new to restore on this device.');
      if (n > 0) { audio.play('purchase'); this.onChange(); }
    } finally { this.busy = false; this.render(); }
  }

  private skuCard(s: SkuDef, hero: boolean): HTMLElement {
    const d = this.store.data;
    const owned = ownsSku(d, s.sku);
    const card = h('div', `card ${hero ? 'epic hero-card' : 'rare'} sku${owned ? ' equipped' : ''}`, null, { 'data-sku': s.sku });
    if (hero) card.append(h('span', 'badge-supporter', owned ? '♥ You are a supporter' : 'Best way to support'));
    card.append(h('div', 'card-name', s.name), h('div', 'card-desc', s.description));
    const items = skuCosmetics(s);
    const chips = h('div', 'sku-items');
    for (const it of items) {
      const c = COSMETICS.find((x) => x.slot === it.slot && x.id === it.id)!;
      const dot = h('span', 'dot'); if (c.color) dot.style.background = c.color; else dot.classList.add('none');
      const chip = h('span', 'sku-item'); chip.append(dot, cosmeticName(it.id));
      chips.append(chip);
    }
    if (hero) chips.append(h('span', 'sku-item', 'No interstitial ads, ever'), h('span', 'sku-item', 'Supporter badge'));
    card.append(chips);
    const have = items.filter((it) => ownsCosmetic(d, it.slot, it.id)).length;
    if (!owned && have > 0) card.append(h('div', 'sku-overlap', `You already own ${have} of ${items.length} items in this ${hero ? 'pack' : 'bundle'}.`));
    if (owned) {
      const eqd = items.every((it) => d.equipped[it.slot] === it.id);
      const btn = h('button', 'btn', eqd ? 'Equipped' : 'Equip all', { 'data-act': 'equip-sku' });
      (btn as HTMLButtonElement).disabled = eqd;
      btn.addEventListener('click', () => { equipSkuCosmetics(d, s.sku); audio.play('uiClick'); this.store.commit(); this.render(); this.onChange(); });
      card.append(h('div', 'price-owned', 'Owned'), btn);
    } else {
      const btn = h('button', hero ? 'btn btn-primary btn-big' : 'btn btn-primary', `Buy · ${fmtEur(s.priceEurCents)}`, { 'data-act': 'buy', 'data-sku': s.sku });
      btn.addEventListener('click', () => void this.buy(s));
      card.append(btn);
    }
    return card;
  }

  private render(): void {
    const d = this.store.data;
    const scroll = this.body.scrollTop;
    clear(this.body);
    this.balance.textContent = `✦ ${d.stardust}`;
    if (isSupporter(d)) this.body.append(h('div', 'supporter-banner', '♥ Supporter. Thank you for keeping STARFLAIL going.'));

    if (this.provider.capabilities.purchases) {
      const hero = SKUS.find((s) => s.sku === 'supporter_pack');
      if (hero) this.body.append(this.skuCard(hero, true));
      const bundles = SKUS.filter((s) => s.sku !== 'supporter_pack');
      if (bundles.length) {
        this.body.append(h('h3', 'sec-head', 'Bundles'));
        const g = h('div', 'grid');
        for (const b of bundles) g.append(this.skuCard(b, false));
        this.body.append(g);
      }
      const restore = h('button', 'btn', 'Restore purchases', { 'data-act': 'restore' });
      restore.addEventListener('click', () => void this.restore());
      this.body.append(h('p', 'sec-note', 'Purchases are cosmetic only. They never change stats, drafts or stardust. No loot boxes, no premium currency.'), restore);
    } else {
      this.body.append(h('p', 'sec-note', 'No purchases are offered in this version. Everything here can be earned with stardust.'));
    }

    // stardust cosmetics (earned, never bought with money)
    this.body.append(h('h3', 'sec-head', 'Cosmetics · earn with stardust'));
    const row = h('div', 'chips');
    for (const c of COSMETICS) {
      if (!('stardust' in c.price)) continue;
      const owned = ownsCosmetic(d, c.slot, c.id), on = d.equipped[c.slot] === c.id;
      const chip = h('button', `chip${on ? ' on' : ''}`);
      const dot = h('span', 'dot'); if (c.color) dot.style.background = c.color; else dot.classList.add('none');
      chip.append(dot, h('span', 'chip-name', c.name), on ? h('span', 'chip-state', 'Equipped') : owned ? h('span', 'chip-state', 'Equip') : h('span', 'price-tag', `${c.price.stardust} ✦`));
      (chip as HTMLButtonElement).disabled = on || (!owned && d.stardust < c.price.stardust);
      chip.addEventListener('click', () => {
        const res = owned ? (equip(d, c.slot, c.id), 'equip') : buyCosmetic(d, c.slot, c.id);
        if (res === 'ok') audio.play('purchase');
        this.store.commit(); this.render(); this.onChange();
      });
      row.append(chip);
    }
    this.body.append(row);
    const legal = h('p', 'sec-note');
    for (const [t, href] of [['Privacy', 'privacy.html'], ['Terms', 'terms.html']]) { const a = h('a', '', t, { href, target: '_blank', rel: 'noopener' }); legal.append(a, document.createTextNode('  ·  ')); }
    legal.lastChild?.remove();
    this.body.append(legal);
    this.body.scrollTop = scroll;
  }
}
