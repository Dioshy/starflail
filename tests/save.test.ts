import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BACKUP_KEY, MemoryStorage, SAVE_KEY, SaveStore, buyCosmetic, buyUnlock, defaultSave, equip, loadSave, migrate, ownsCosmetic, recordRun } from '../src/game/save';

describe('save', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('round-trips through localStorage JSON', () => {
    const st = new MemoryStorage(), s = new SaveStore(st);
    s.data.stardust = 321; s.data.unlocks.push('sparrow'); s.data.cosmetics.push('orbSkin:plasma'); s.data.equipped.ship = 'sparrow';
    s.data.settings.reelMode = 'toggle'; s.data.settings.music = 0.25; s.data.bestTimes.survivedSec = 187;
    s.flush(); s.commit(); s.flush();
    const r = loadSave(st);
    expect(r.recovered).toBe(false);
    expect(r.data).toEqual(s.data);
    expect(JSON.parse(st.getItem(SAVE_KEY)!).version).toBe(1);
  });

  it('debounces writes', () => {
    const st = new MemoryStorage(), s = new SaveStore(st, 400);
    for (let i = 0; i < 20; i++) s.commit();
    expect(s.writes).toBe(0);
    vi.advanceTimersByTime(399); expect(s.writes).toBe(0);
    vi.advanceTimersByTime(2); expect(s.writes).toBe(1);
  });

  it('migrates a legacy v0 blob and keeps what it understands', () => {
    const m = migrate({ stardust: 77.9, unlocked: ['sparrow'], bestTime: 120 })!;
    expect(m.version).toBe(1); expect(m.stardust).toBe(77); expect(m.unlocks).toEqual(['sparrow']); expect(m.bestTimes.survivedSec).toBe(120);
    expect(m.settings.master).toBe(0.8);
  });

  it('sanitises out-of-range values and keeps unknown ids', () => {
    const m = migrate({ version: 1, stardust: -5, settings: { master: 9, reelMode: 'weird' }, unlocks: ['zzz', 5, 'zzz'] })!;
    expect(m.stardust).toBe(0); expect(m.settings.master).toBe(1); expect(m.settings.reelMode).toBe('hold'); expect(m.unlocks).toEqual(['zzz']);
  });

  it('corrupt JSON falls back to defaults and backs up the bad blob', () => {
    const st = new MemoryStorage(); st.setItem(SAVE_KEY, '{not json');
    const r = loadSave(st);
    expect(r.recovered).toBe(true); expect(r.data).toEqual(defaultSave());
    expect(st.getItem(BACKUP_KEY)).toBe('{not json');
    const st2 = new MemoryStorage(); st2.setItem(SAVE_KEY, '"a string"');
    expect(loadSave(st2).recovered).toBe(true);
  });

  it('a save from a newer build is backed up before it is overwritten', () => {
    const st = new MemoryStorage(), blob = JSON.stringify({ version: 9, stardust: 5, future: true });
    st.setItem(SAVE_KEY, blob);
    const r = loadSave(st);
    expect(r.data.stardust).toBe(5); expect(st.getItem(BACKUP_KEY)).toBe(blob);
  });

  it('buy / equip rules: poor, owned (idempotent), auto-equip, supporter items locked', () => {
    const s = defaultSave();
    expect(buyUnlock(s, 'sparrow')).toBe('poor');
    s.stardust = 1000;
    expect(buyUnlock(s, 'sparrow')).toBe('ok'); expect(s.stardust).toBe(650); expect(s.equipped.ship).toBe('sparrow');
    expect(buyUnlock(s, 'sparrow')).toBe('owned'); expect(s.stardust).toBe(650);
    expect(equip(s, 'ship', 'lasso')).toBe(false);
    expect(equip(s, 'ship', 'comet')).toBe(true);
    expect(buyCosmetic(s, 'orbSkin', 'plasma')).toBe('ok'); expect(ownsCosmetic(s, 'orbSkin', 'plasma')).toBe(true); expect(s.equipped.orbSkin).toBe('plasma');
    expect(buyCosmetic(s, 'shipSkin', 'gold')).toBe('locked');
    expect(ownsCosmetic(s, 'trail', 'none')).toBe(true);
  });

  it('recordRun banks stardust and tracks best times', () => {
    const s = defaultSave();
    expect(recordRun(s, { timeSec: 100, kills: 50, bossKills: 0, won: false, stardust: 30 }).newBest).toBe(true);
    expect(recordRun(s, { timeSec: 80, kills: 10, bossKills: 0, won: false, stardust: 10 }).newBest).toBe(false);
    recordRun(s, { timeSec: 560, kills: 900, bossKills: 3, won: true, stardust: 400 });
    expect(s.stardust).toBe(440); expect(s.stats.runs).toBe(3); expect(s.bestTimes.fastestWinSec).toBe(560);
  });
});
