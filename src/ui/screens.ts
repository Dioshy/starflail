// Title, hangar, results, settings and pause screens (DOM, theme.css classes). Pure view code: state lives in SaveStore.
import { audio } from '../audio';
import { COSMETICS, META_UNLOCKS, ORBS, PROGRESSION, SHIPS, UPGRADES } from '../data';
import type { CosmeticSlot } from '../data';
import { buyCosmetic, buyUnlock, equip, ownsCosmetic, ownsUnlock, type SaveData, type SaveStore, type Settings } from '../game/save';
import { clear, fmtTime, h } from './dom';

// ------------------------------------------------------------------ settings (shared by pause + hangar + title)
export function settingsPanel(store: SaveStore, onChange: (s: Settings) => void): HTMLElement {
  const st = store.data.settings;
  const panel = h('div', 'settings');
  const apply = (): void => { store.commit(); onChange(st); };
  const slider = (label: string, key: 'master' | 'sfx' | 'music'): void => {
    const row = h('label', 'set-row');
    const input = h('input', 'slider', null, { type: 'range', min: '0', max: '100', step: '1', 'aria-label': `${label} volume` });
    input.value = String(Math.round(st[key] * 100));
    const val = h('span', 'set-val', `${input.value}%`);
    input.addEventListener('input', () => { st[key] = Number(input.value) / 100; val.textContent = `${input.value}%`; audio.setVolume(key, st[key]); apply(); });
    input.addEventListener('change', () => audio.play('uiClick'));
    row.append(h('span', 'set-label', label), input, val);
    panel.append(row);
  };
  const toggle = (label: string, get: () => boolean, set: (v: boolean) => void, hint?: string): void => {
    const row = h('label', 'set-row');
    const wrap = h('span', 'toggle');
    const input = h('input', '', null, { type: 'checkbox' });
    input.checked = get();
    input.addEventListener('change', () => { set(input.checked); apply(); });
    wrap.append(input, h('span'));
    const text = h('span', 'set-label', label);
    if (hint) text.append(h('small', 'set-hint', hint));
    row.append(text, wrap);
    panel.append(row);
  };
  panel.append(h('h3', 'set-head', 'Audio'));
  slider('Master', 'master'); slider('Sound effects', 'sfx'); slider('Music', 'music');
  panel.append(h('h3', 'set-head', 'Comfort'));
  toggle('Screen shake', () => st.screenShake, (v) => { st.screenShake = v; });
  toggle('Reduced flashes', () => st.reducedFlashes, (v) => { st.reducedFlashes = v; }, 'No full-screen flashes');
  toggle('Damage numbers', () => st.damageNumbers, (v) => { st.damageNumbers = v; });
  panel.append(h('h3', 'set-head', 'Controls'));
  toggle('Control hints', () => st.controlHints, (v) => { st.controlHints = v; }, 'Show first-run tips');
  toggle('Reel: toggle instead of hold', () => st.reelMode === 'toggle', (v) => { st.reelMode = v ? 'toggle' : 'hold'; }, 'Press once to reel, again to release');
  panel.append(h('p', 'set-keys', 'Move: WASD / arrows / stick / drag. Reel: Space, Shift, right mouse, A / RT, REEL button. Pause: Esc / P / Start. Draft: 1 2 3, R to reroll.'));
  return panel;
}

// ------------------------------------------------------------------ title
export class TitleScreen {
  readonly el = h('div', 'screen title hidden');
  private stats = h('div', 'title-stats');
  onPlay: () => void = () => {};
  onHangar: () => void = () => {};
  private hangarBtn = h('button', 'btn', 'Hangar');

  constructor(parent: HTMLElement, store: SaveStore, onSettings: (s: Settings) => void) {
    const play = h('button', 'btn btn-primary btn-big', 'PLAY');
    play.addEventListener('click', () => this.onPlay());
    this.hangarBtn.addEventListener('click', () => this.onHangar());
    const setBtn = h('button', 'btn', 'Settings');
    const setPanel = h('div', 'panel title-settings hidden');
    setPanel.append(settingsPanel(store, onSettings));
    setBtn.addEventListener('click', () => setPanel.classList.toggle('hidden'));
    const row = h('div', 'title-actions');
    row.append(play, this.hangarBtn, setBtn);
    this.el.append(h('div', 'title-spacer'), row, h('div', 'title-prompt', 'press any key or tap to play'), this.stats, setPanel);
    parent.append(this.el);
  }

  show(store: SaveStore): void {
    const d = store.data;
    this.el.classList.remove('hidden');
    this.hangarBtn.classList.toggle('hidden', d.stats.runs === 0);
    this.stats.textContent = d.stats.runs > 0 ? `Best ${fmtTime(d.bestTimes.survivedSec)}  ·  ${d.stardust} ✦  ·  ${d.stats.runs} runs` : 'You never shoot. You swing.';
  }
  hide(): void { this.el.classList.add('hidden'); }
}

// ------------------------------------------------------------------ hangar
function nextUnlock(d: SaveData): { name: string; cost: number } | null {
  const c: { name: string; cost: number }[] = [];
  for (const s of SHIPS) if (!ownsUnlock(d, s.id)) c.push({ name: `${s.name} ship`, cost: s.unlockCost });
  for (const o of ORBS) if (!ownsUnlock(d, o.id)) c.push({ name: `${o.name} orb`, cost: o.unlockCost });
  for (const m of META_UNLOCKS) if (!ownsUnlock(d, m.id)) c.push({ name: m.name, cost: m.cost });
  for (const k of COSMETICS) if ('stardust' in k.price && !ownsCosmetic(d, k.slot, k.id)) c.push({ name: k.name, cost: k.price.stardust });
  c.sort((a, b) => a.cost - b.cost);
  return c[0] ?? null;
}
export { nextUnlock };

export class HangarScreen {
  readonly el = h('div', 'screen hangar hidden');
  private body = h('div', 'hangar-body');
  private balance = h('div', 'hangar-balance');
  private launch = h('button', 'btn btn-primary btn-big', 'LAUNCH');
  private store!: SaveStore;
  onLaunch: () => void = () => {};
  onBack: () => void = () => {};
  /** called after any equip/buy so the game can refresh previews */
  onChange: () => void = () => {};
  private onSettings: (s: Settings) => void;

  constructor(parent: HTMLElement, onSettings: (s: Settings) => void) {
    this.onSettings = onSettings;
    const head = h('div', 'hangar-head');
    const back = h('button', 'btn', '← Title');
    back.addEventListener('click', () => this.onBack());
    head.append(back, h('h2', 'hangar-title', 'HANGAR'), this.balance);
    this.launch.addEventListener('click', () => this.onLaunch());
    const foot = h('div', 'hangar-foot');
    foot.append(this.launch);
    this.el.append(head, this.body, foot);
    parent.append(this.el);
  }

  show(store: SaveStore): void {
    this.store = store;
    this.el.classList.remove('hidden');
    this.render();
    this.launch.focus({ preventScroll: true });
  }
  hide(): void { this.el.classList.add('hidden'); }

  private render(): void {
    const d = this.store.data;
    const scroll = this.body.scrollTop;
    clear(this.body);
    this.balance.textContent = `✦ ${d.stardust}`;
    const nu = nextUnlock(d);
    if (nu) {
      const p = h('div', 'next-unlock');
      p.append(h('span', '', `Next unlock: ${nu.name} · ${nu.cost} ✦`));
      const bar = h('div', 'bar'); const fill = h('div', 'fill'); fill.style.width = `${Math.min(100, (d.stardust / nu.cost) * 100)}%`; bar.append(fill);
      p.append(bar);
      this.body.append(p);
    }
    const act = (res: string): void => {
      if (res === 'ok') audio.play('purchase');
      this.store.commit(); this.render(); this.onChange();
    };

    // ships + orbs
    const gear = (title: string, kind: 'ship' | 'orb', items: { id: string; name: string; description: string; unlockCost: number }[]): void => {
      this.body.append(h('h3', 'sec-head', title));
      const grid = h('div', 'grid');
      for (const it of items) {
        const owned = ownsUnlock(d, it.id), on = d.equipped[kind] === it.id;
        const card = h('div', `card common item${on ? ' equipped' : ''}`);
        card.append(h('div', 'card-name', it.name), h('div', 'card-desc', it.description));
        const btn = h('button', on ? 'btn' : owned ? 'btn' : 'btn btn-primary', on ? 'Equipped' : owned ? 'Equip' : `Unlock · ${it.unlockCost} ✦`);
        (btn as HTMLButtonElement).disabled = on || (!owned && d.stardust < it.unlockCost);
        btn.addEventListener('click', () => { if (owned) { equip(d, kind, it.id); act('equip'); } else act(buyUnlock(d, it.id)); });
        card.append(btn);
        grid.append(card);
      }
      this.body.append(grid);
    };
    gear('Ships', 'ship', SHIPS);
    gear('Orbs', 'orb', ORBS);

    // upgrade packs
    this.body.append(h('h3', 'sec-head', 'Upgrade packs'), h('p', 'sec-note', 'More options in the draft, never more power.'));
    const pg = h('div', 'grid');
    for (const m of META_UNLOCKS) {
      const owned = ownsUnlock(d, m.id);
      const card = h('div', `card rare item${owned ? ' equipped' : ''}`);
      const names = m.unlocks.map((id) => UPGRADES.find((u) => u.id === id)?.name ?? id).join(', ');
      card.append(h('div', 'card-name', m.name), h('div', 'card-desc', `Adds: ${names}`));
      const btn = h('button', owned ? 'btn' : 'btn btn-primary', owned ? 'Owned' : `Unlock · ${m.cost} ✦`);
      (btn as HTMLButtonElement).disabled = owned || d.stardust < m.cost;
      btn.addEventListener('click', () => act(buyUnlock(d, m.id)));
      card.append(btn); pg.append(card);
    }
    this.body.append(pg);

    // cosmetics
    this.body.append(h('h3', 'sec-head', 'Cosmetics'), h('p', 'sec-note', 'Looks only. No stats.'));
    const slots: { slot: CosmeticSlot; label: string }[] = [{ slot: 'shipSkin', label: 'Ship skin' }, { slot: 'orbSkin', label: 'Orb skin' }, { slot: 'trail', label: 'Trail' }];
    for (const { slot, label } of slots) {
      this.body.append(h('h4', 'sub-head', label));
      const row = h('div', 'chips');
      for (const c of COSMETICS.filter((x) => x.slot === slot)) {
        const owned = ownsCosmetic(d, slot, c.id), on = d.equipped[slot] === c.id;
        const chip = h('button', `chip${on ? ' on' : ''}`);
        const dot = h('span', 'dot'); if (c.color) dot.style.background = c.color; else dot.classList.add('none');
        chip.append(dot, h('span', 'chip-name', c.name));
        const sup = 'sku' in c.price;
        if (on) chip.append(h('span', 'chip-state', 'Equipped'));
        else if (owned) chip.append(h('span', 'chip-state', 'Equip'));
        else if (sup) chip.append(h('span', 'badge-supporter', 'Supporter'));
        else if ('stardust' in c.price) chip.append(h('span', 'price-tag', `${c.price.stardust} ✦`));
        (chip as HTMLButtonElement).disabled = on || (!owned && (sup || ('stardust' in c.price && d.stardust < c.price.stardust)));
        chip.addEventListener('click', () => { if (owned) { equip(d, slot, c.id); act('equip'); } else act(buyCosmetic(d, slot, c.id)); });
        row.append(chip);
      }
      this.body.append(row);
    }

    // STORE-PLACEHOLDER: the Store button (real-money SKUs) is added here by the monetization task. Keep data-slot.
    const storeSlot = h('div', 'store-slot', null, { 'data-slot': 'store-button' });
    const sb = h('button', 'btn', 'Store · coming soon'); (sb as HTMLButtonElement).disabled = true;
    storeSlot.append(sb);
    this.body.append(storeSlot);

    const setBtn = h('button', 'btn', 'Settings');
    const setWrap = h('div', 'panel hidden'); setWrap.append(settingsPanel(this.store, this.onSettings));
    setBtn.addEventListener('click', () => setWrap.classList.toggle('hidden'));
    this.body.append(setBtn, setWrap);
    this.body.scrollTop = scroll;
  }
}

// ------------------------------------------------------------------ results
export interface ResultsInfo {
  won: boolean; timeSec: number; kills: number; bossKills: number; killedBy: string;
  parts: { label: string; value: number }[]; stardust: number; bestSec: number; newBest: boolean; balance: number; level: number; abandoned?: boolean;
}

export class ResultsScreen {
  readonly el = h('div', 'screen results hidden');
  private panel = h('div', 'panel results-panel');
  onAgain: () => void = () => {};
  onHangar: () => void = () => {};
  private raf = 0;

  constructor(parent: HTMLElement) { this.el.append(this.panel); parent.append(this.el); }

  show(r: ResultsInfo, store: SaveStore): void {
    this.el.classList.remove('hidden');
    clear(this.panel);
    this.panel.append(h('h2', r.won ? 'res-title win' : 'res-title', r.won ? 'ECLIPSE DOWN — VICTORY' : 'TETHER SEVERED'));
    if (!r.won && r.killedBy) this.panel.append(h('div', 'res-killed', `Killed by: ${r.killedBy}`));
    const grid = h('div', 'res-grid');
    const stat = (k: string, v: string, cls = ''): void => { const c = h('div', `res-stat ${cls}`); c.append(h('div', 'res-k', k), h('div', 'res-v', v)); grid.append(c); };
    stat('Time', fmtTime(r.timeSec), r.newBest ? 'best' : '');
    stat('Smashed', String(r.kills)); stat('Bosses', String(r.bossKills)); stat('Level', String(r.level));
    this.panel.append(grid);
    this.panel.append(h('div', 'res-best', r.newBest ? `NEW BEST TIME ${fmtTime(r.bestSec)}` : `Best time ${fmtTime(r.bestSec)}`));
    const dust = h('div', 'res-dust');
    const total = h('div', 'res-dust-total', '✦ 0');
    dust.append(total);
    for (const p of r.parts) if (p.value > 0) dust.append(h('div', 'res-part', `${p.label}  +${p.value}`));
    this.panel.append(dust);
    const nu = nextUnlock(store.data);
    if (nu) {
      const n = h('div', 'next-unlock');
      n.append(h('span', '', `Next unlock: ${nu.name} · ${Math.min(r.balance, nu.cost)} / ${nu.cost} ✦`));
      const bar = h('div', 'bar'); const fill = h('div', 'fill'); fill.style.width = `${Math.min(100, (r.balance / nu.cost) * 100)}%`; bar.append(fill); n.append(bar);
      this.panel.append(n);
    }
    const row = h('div', 'res-actions');
    const again = h('button', 'btn btn-primary btn-big', 'GO AGAIN');
    again.addEventListener('click', () => this.onAgain());
    const hangar = h('button', 'btn', 'Hangar');
    hangar.addEventListener('click', () => this.onHangar());
    row.append(again, hangar);
    this.panel.append(row, h('div', 'res-hint', 'Enter / R / tap to go again'));
    again.focus({ preventScroll: true });
    // count-up
    cancelAnimationFrame(this.raf);
    const t0 = performance.now();
    const tick = (now: number): void => {
      const f = Math.min(1, (now - t0) / 900);
      total.textContent = `✦ +${Math.round(r.stardust * (1 - (1 - f) * (1 - f)))}`;
      if (f < 1) this.raf = requestAnimationFrame(tick);
    };
    this.raf = requestAnimationFrame(tick);
  }
  hide(): void { cancelAnimationFrame(this.raf); this.el.classList.add('hidden'); }
}

// ------------------------------------------------------------------ pause
export class PauseScreen {
  readonly el = h('div', 'overlay pause hidden');
  onResume: () => void = () => {};
  onAbandon: () => void = () => {};
  open = false;

  constructor(parent: HTMLElement, store: SaveStore, onSettings: (s: Settings) => void) {
    const panel = h('div', 'panel pause-panel');
    const resume = h('button', 'btn btn-primary btn-big', 'RESUME');
    resume.addEventListener('click', () => this.onResume());
    const abandon = h('button', 'btn', 'Abandon run');
    abandon.addEventListener('click', () => this.onAbandon());
    panel.append(h('h2', 'pause-title', 'PAUSED'), settingsPanel(store, onSettings), h('div', 'pause-actions'));
    (panel.lastChild as HTMLElement).append(resume, abandon);
    this.el.append(panel);
    parent.append(this.el);
    this.resumeBtn = resume;
  }
  private resumeBtn: HTMLElement;
  show(): void { this.open = true; this.el.classList.remove('hidden'); this.resumeBtn.focus({ preventScroll: true }); }
  hide(): void { this.open = false; this.el.classList.add('hidden'); }
}

export function stardustParts(w: { secondsSurvived: number; bossKills: number; won: boolean; stardustPickups: number }, bonus: number): { label: string; value: number }[] {
  const p = PROGRESSION.stardust;
  return [
    { label: 'Survived', value: Math.floor((w.secondsSurvived / 60) * p.perMinuteSurvived) },
    { label: 'Bosses', value: w.bossKills * p.perBossKill },
    { label: 'Victory', value: w.won ? p.winBonus : 0 },
    { label: 'Stardust picked up', value: w.stardustPickups * p.perPickup },
    { label: 'Field Repair', value: bonus },
  ];
}
