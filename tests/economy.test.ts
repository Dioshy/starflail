import { describe, expect, it } from 'vitest';
import { BASE_STATS, STAT_LIMITS, UPGRADES, computeStats, eligibleUpgrades, hitDamage, rollDraft, runStardust } from '../src/data';
import type { StatKey } from '../src/data';
import { World } from '../src/game/sim';
import { Rng } from '../src/core/rng';
import { idle } from './helpers';

describe('stat stacking and caps', () => {
  it('stacks additively inside the formula: Spiked Shell x5 = base x (1 + 5 x 0.12)', () => {
    const u = UPGRADES.find((x) => x.id === 'spikedShell')!;
    const s = computeStats(Array(5).fill(u.mods[0]));
    expect(s.damagePerSpeed).toBeCloseTo(0.08 * 1.6, 6);
  });
  it('clamps every stat to STAT_LIMITS, even with absurd mods', () => {
    for (const k of Object.keys(BASE_STATS) as StatKey[]) {
      const hi = computeStats([{ stat: k, op: 'mul', value: 1000 }]), lo = computeStats([{ stat: k, op: 'add', value: -1e6 }]);
      expect(hi[k]).toBeLessThanOrEqual(STAT_LIMITS[k].max); expect(lo[k]).toBeGreaterThanOrEqual(STAT_LIMITS[k].min);
    }
  });
  it('a fully stacked world stays inside limits and one hit stays below Warden HP', () => {
    const w = new World({ seed: 1, noSpawn: true });
    for (const u of UPGRADES) for (let i = 0; i < u.maxStacks; i++) w.grantUpgrade(u.id);
    for (const k of Object.keys(BASE_STATS) as StatKey[]) { expect(w.stats[k]).toBeLessThanOrEqual(STAT_LIMITS[k].max); expect(w.stats[k]).toBeGreaterThanOrEqual(STAT_LIMITS[k].min); }
    expect(hitDamage(5000, w.stats).damage).toBeLessThan(4000);
    expect(w.orbs.length).toBe(w.stats.orbCount);
  });
  it('loadouts apply: Sparrow has 3 HP, Twin has 2 orbs', () => {
    expect(new World({ seed: 1, noSpawn: true, ship: 'sparrow' }).ship.maxHp).toBe(3);
    expect(new World({ seed: 1, noSpawn: true, orb: 'twin' }).orbs.length).toBe(2);
  });
});

describe('stardust formula', () => {
  it('90 s, nothing else = 15', () => expect(runStardust({ secondsSurvived: 90, bossKills: 0, won: false, stardustPickups: 0, stardustGain: 1 })).toBe(15));
  it('10:00 win, 3 bosses, 10 pickups = 450', () => expect(runStardust({ secondsSurvived: 600, bossKills: 3, won: true, stardustPickups: 10, stardustGain: 1 })).toBe(450));
  it('stardustGain is clamped to 1.5', () => expect(runStardust({ secondsSurvived: 600, bossKills: 0, won: false, stardustPickups: 0, stardustGain: 9 })).toBe(150));
  it('Field Repair adds its stardust to the run total', () => {
    const w = new World({ seed: 1, noSpawn: true });
    w.pendingDrafts = 1; w.openDraft();
    const before = w.stardustEarned();
    (w as any).draftDefs = [null]; w.draft!.cards = [{ id: 'fieldRepair', name: 'x', description: '', rarity: 'common', stacks: 0, maxStacks: 1, fallback: true }];
    w.pickDraft(0);
    expect(w.stardustEarned() - before).toBe(10);
  });
});

describe('upgrade draft', () => {
  it('never offers locked upgrades (300 drafts)', () => {
    const locked = new Set(UPGRADES.filter((u) => u.unlock !== 'default').map((u) => u.id));
    for (let s = 0; s < 300; s++) {
      const w = new World({ seed: s, noSpawn: true });
      w.pendingDrafts = 1; w.openDraft();
      for (const c of w.draft!.cards) expect(locked.has(c.id)).toBe(false);
    }
  });
  it('offers pack upgrades once the pack is owned', () => {
    const seen = new Set<string>();
    for (let s = 0; s < 300; s++) { const w = new World({ seed: s, noSpawn: true, unlockedMeta: ['reelArsenal', 'stormKit', 'survivorKit'] }); w.pendingDrafts = 1; w.openDraft(); w.draft!.cards.forEach((c) => seen.add(c.id)); }
    expect(seen.has('reelShock') && seen.has('novaCore') && seen.has('leechOrb')).toBe(true);
  });
  it('never offers maxed upgrades or an already-active behavior', () => {
    for (let s = 0; s < 150; s++) {
      const w = new World({ seed: s, noSpawn: true });
      for (let i = 0; i < 5; i++) w.grantUpgrade('spikedShell');
      w.grantUpgrade('arcCoil');
      w.pendingDrafts = 1; w.openDraft();
      for (const c of w.draft!.cards) { expect(c.id).not.toBe('spikedShell'); expect(c.id).not.toBe('arcCoil'); }
    }
  });
  it('3 distinct cards, identical for the same seed', () => {
    const a = new World({ seed: 5, noSpawn: true }), b = new World({ seed: 5, noSpawn: true });
    for (const w of [a, b]) { w.pendingDrafts = 1; w.openDraft(); }
    expect(a.draft!.cards.map((c) => c.id)).toEqual(b.draft!.cards.map((c) => c.id));
    expect(new Set(a.draft!.cards.map((c) => c.id)).size).toBe(3);
  });
  it('reroll uses the per-run reroll and disables the button after', () => {
    const w = new World({ seed: 3, noSpawn: true });
    w.pendingDrafts = 1; w.openDraft();
    expect(w.draft!.canReroll).toBe(true);
    expect(w.rerollDraft()).toBe(true);
    expect(w.rerollsLeft).toBe(0);
    expect(w.draft!.canReroll).toBe(false);
    expect(w.rerollDraft()).toBe(false);
  });
  it('fills with Field Repair when fewer than 3 are eligible', () => {
    const w = new World({ seed: 2, noSpawn: true });
    for (const u of UPGRADES) if (u.unlock === 'default' && !['spikedShell', 'heavyCore'].includes(u.id)) for (let i = 0; i < u.maxStacks; i++) w.grantUpgrade(u.id);
    w.pendingDrafts = 1; w.openDraft();
    const ids = w.draft!.cards.map((c) => c.id);
    expect(ids).toContain('fieldRepair'); expect(w.draft!.cards.length).toBe(3);
  });
  it('level-up pauses the sim until a card is picked; keys/clicks map to pickDraft(i)', () => {
    const w = new World({ seed: 4, noSpawn: true });
    (w as any).addXp(10);
    w.step(idle());
    expect(w.draft).not.toBeNull();
    const t = w.tick; w.step(idle()); w.step(idle());
    expect(w.tick).toBe(t); // paused
    expect(w.pickDraft(1)).toBe(true);
    w.step(idle());
    expect(w.tick).toBe(t + 1);
  });
  it('rarity weights roughly 65/28/7 over 10k slots', () => {
    const r = new Rng(77), el = eligibleUpgrades({ unlockedMeta: new Set(['reelArsenal', 'stormKit', 'survivorKit']), stacks: {}, currentMods: [], activeBehaviors: new Set<never>() });
    const c = { common: 0, rare: 0, epic: 0 };
    for (let i = 0; i < 3400; i++) for (const u of rollDraft(() => r.next(), el)) c[u.rarity]++;
    const tot = c.common + c.rare + c.epic;
    expect(c.common / tot).toBeGreaterThan(0.55); expect(c.common / tot).toBeLessThan(0.75);
  });
});
