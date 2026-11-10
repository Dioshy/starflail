import { BASE_STATS, UPGRADES, computeStats } from '../data';
import type { StatKey } from '../data';
import type { DraftState } from '../game/types';
import type { World } from '../game/sim';
import { h } from './dom';

const LABEL: Record<StatKey, string> = {
  shipMaxHp: 'Max HP', shipSpeed: 'Ship speed', shipAccel: 'Accel', orbMass: 'Orb mass', orbRadius: 'Orb size', tetherLength: 'Tether',
  tetherStiffness: 'Stiffness', reelRatio: 'Reel ratio', damagePerSpeed: 'Dmg/speed', minDamageSpeed: 'Min dmg speed', critSpeed: 'Crit speed',
  critMultiplier: 'Crit x', knockback: 'Knockback', pickupRadius: 'Pickup radius', xpGain: 'XP gain', iframesSec: 'I-frames', regenPerMin: 'Regen/min',
  orbCount: 'Orbs', stardustGain: 'Stardust', 
};
const fmt = (v: number): string => (Math.abs(v) >= 100 ? String(Math.round(v)) : Math.abs(v) < 1 ? String(Math.round(v * 1000) / 1000) : String(Math.round(v * 100) / 100));

/** "Tether 140 -> 160" style previews for stat upgrades (up to two lines). */
export function previewDelta(w: World, id: string): string[] {
  const u = UPGRADES.find((x) => x.id === id);
  if (!u || u.mods.length === 0) return [];
  const next = computeStats([...w.mods, ...u.mods]);
  const out: string[] = [];
  for (const m of u.mods) {
    const k = m.stat;
    if (out.some((l) => l.startsWith(LABEL[k]))) continue;
    const a = w.stats[k], b = next[k];
    out.push(a === b ? `${LABEL[k]} ${fmt(a)} (capped)` : `${LABEL[k]} ${fmt(a)} → ${fmt(b)}`);
  }
  void BASE_STATS;
  return out.slice(0, 2);
}

/** Level-up draft: 3 DOM cards (.card.common/.rare/.epic). Pick by click/tap, keys 1/2/3, or gamepad (focus + confirm). */
export class DraftView {
  readonly el = h('div', 'overlay draft hidden');
  private row = h('div', 'draft-row');
  private title = h('h2', 'draft-title', 'LEVEL UP');
  private rerollBtn = h('button', 'btn draft-reroll', 'Reroll');
  private cards: HTMLElement[] = [];
  focus = 0;
  open = false;
  openedAt = 0;
  onPick: (i: number) => void = () => {};
  onReroll: () => void = () => {};

  constructor(parent: HTMLElement) {
    const panel = h('div', 'draft-panel');
    panel.append(this.title, this.row, this.rerollBtn);
    this.el.append(panel);
    parent.append(this.el);
    this.rerollBtn.addEventListener('click', () => this.onReroll());
  }

  show(w: World, d: DraftState): void {
    this.open = true; this.openedAt = performance.now();
    this.el.classList.remove('hidden');
    this.title.textContent = `LEVEL ${w.level} — CHOOSE AN UPGRADE`;
    this.row.replaceChildren();
    this.cards = d.cards.map((c, i) => {
      const card = h('button', `card ${c.rarity} draft-card`, null, { 'data-i': String(i) });
      card.append(h('div', 'card-key', String(i + 1)));
      card.append(h('div', 'card-rarity', c.fallback ? 'FALLBACK' : c.rarity.toUpperCase()));
      card.append(h('div', 'card-name', c.name));
      card.append(h('div', 'card-desc', c.description));
      if (!c.fallback) {
        for (const line of previewDelta(w, c.id)) card.append(h('div', 'card-delta', line));
        const pips = h('div', 'card-pips');
        for (let k = 0; k < c.maxStacks; k++) pips.append(h('span', k < c.stacks ? 'pip on' : k === c.stacks ? 'pip next' : 'pip', '●'));
        card.append(pips);
      }
      card.addEventListener('click', () => this.onPick(i));
      this.row.append(card);
      return card;
    });
    this.rerollBtn.textContent = d.canReroll ? `Reroll (R) · ${d.rerollsLeft} left` : d.rerollsLeft > 0 ? 'Reroll unavailable' : 'No rerolls left';
    (this.rerollBtn as HTMLButtonElement).disabled = !d.canReroll;
    this.setFocus(0);
  }

  setFocus(i: number): void {
    if (this.cards.length === 0) return;
    this.focus = ((i % this.cards.length) + this.cards.length) % this.cards.length;
    this.cards.forEach((c, k) => c.classList.toggle('focus', k === this.focus));
  }

  hide(): void { this.open = false; this.el.classList.add('hidden'); }
}
