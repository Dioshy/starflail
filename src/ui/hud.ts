import { BOSS_TIMES_SEC, PHYSICS, PROGRESSION } from '../data';
import type { World } from '../game/sim';
import { h, fmtTime } from './dom';

/** DOM HUD: hearts, XP bar, timer + boss pips, level, stardust, boss bar, orb-speed meter, banner, hints, touch buttons. */
export class Hud {
  readonly el: HTMLElement;
  readonly reelBtn: HTMLButtonElement;
  readonly pauseBtn: HTMLButtonElement;
  private hearts = h('div', 'hud-hearts');
  private time = h('div', 'hud-time', '0:00');
  private pips = h('div', 'hud-pips');
  private dust = h('div', 'hud-dust', '✦ 0');
  private lv = h('span', 'hud-lv', 'LV 1');
  private xpFill = h('div', 'fill');
  private speedFill = h('div', 'fill');
  private boss = h('div', 'hud-boss hidden');
  private bossName = h('div', 'boss-name');
  private bossFill = h('div', 'fill');
  private banner = h('div', 'hud-banner hidden');
  private hint = h('div', 'hud-hint hidden');
  private heartKey = '';
  private bannerT = 0;
  private lastText = { time: '', dust: '', lv: '' };
  private pipEls: HTMLElement[] = [];

  constructor(parent: HTMLElement) {
    const el = this.el = h('div', 'hud hidden');
    const top = h('div', 'hud-top');
    const mid = h('div', 'hud-mid');
    mid.append(this.time, this.pips);
    const right = h('div', 'hud-right');
    this.pauseBtn = h('button', 'btn hud-pause', 'II', { 'aria-label': 'Pause' });
    right.append(this.dust, this.pauseBtn);
    top.append(this.hearts, mid, right);
    for (const [name, at] of Object.entries(BOSS_TIMES_SEC)) {
      const p = h('span', 'pip', name === 'warden' ? '3:00' : name === 'hive' ? '6:00' : '9:00'); p.dataset.at = String(at); this.pips.append(p); this.pipEls.push(p);
    }
    const bar = h('div', 'bar boss-bar'); bar.append(this.bossFill, h('div', 'notch'));
    this.boss.append(this.bossName, bar);
    const bottom = h('div', 'hud-bottom');
    const speed = h('div', 'hud-speed');
    const sbar = h('div', 'bar speed-bar'); sbar.append(this.speedFill);
    const tick = (v: number): HTMLElement => { const t = h('div', 'tick'); t.style.left = `${(v / PHYSICS.maxOrbSpeed) * 100}%`; return t; };
    sbar.append(tick(0), tick(0));
    this.speedTicks = [sbar.children[1] as HTMLElement, sbar.children[2] as HTMLElement];
    speed.append(h('div', 'hud-speed-label', 'ORB SPEED'), sbar);
    const xp = h('div', 'hud-xp');
    const xbar = h('div', 'bar xp-bar'); xbar.append(this.xpFill);
    xp.append(this.lv, xbar);
    bottom.append(speed, xp);
    this.reelBtn = h('button', 'btn reel-btn', 'REEL', { 'aria-label': 'Reel' });
    el.append(top, this.boss, this.banner, this.hint, bottom, this.reelBtn);
    parent.append(el);
  }
  private speedTicks: HTMLElement[] = [];

  show(v: boolean): void { this.el.classList.toggle('hidden', !v); if (v) this.heartKey = ''; }

  setHint(text: string | null): void {
    if (text === null) { this.hint.classList.add('hidden'); return; }
    if (this.hint.textContent !== text) this.hint.textContent = text;
    this.hint.classList.remove('hidden');
  }

  showBanner(text: string, ms = 2200): void { this.banner.textContent = text; this.banner.classList.remove('hidden'); this.bannerT = ms / 1000; }

  update(w: World, dt: number, reelLatched: boolean): void {
    const s = w.ship;
    const key = `${s.hp}/${s.maxHp}`;
    if (key !== this.heartKey) {
      this.heartKey = key;
      this.hearts.replaceChildren();
      for (let i = 0; i < s.maxHp; i++) this.hearts.append(h('span', i < s.hp ? 'heart full' : 'heart', '♥'));
    }
    const t = fmtTime(w.time);
    if (t !== this.lastText.time) { this.time.textContent = t; this.lastText.time = t; }
    for (const p of this.pipEls) p.classList.toggle('done', w.time >= Number(p.dataset.at));
    const dust = `✦ ${w.stardustEarned()}`;
    if (dust !== this.lastText.dust) { this.dust.textContent = dust; this.lastText.dust = dust; }
    const lv = `LV ${w.level}`;
    if (lv !== this.lastText.lv) { this.lv.textContent = lv; this.lastText.lv = lv; }
    this.xpFill.style.width = `${Math.min(100, (w.xp / w.xpNext) * 100)}%`;
    const sp = w.orbSpeed();
    this.speedFill.style.width = `${Math.min(100, (sp / PHYSICS.maxOrbSpeed) * 100)}%`;
    this.speedFill.className = sp >= w.stats.critSpeed ? 'fill crit' : sp >= w.stats.minDamageSpeed ? 'fill ok' : 'fill';
    this.speedTicks[0].style.left = `${(w.stats.minDamageSpeed / PHYSICS.maxOrbSpeed) * 100}%`;
    this.speedTicks[1].style.left = `${(w.stats.critSpeed / PHYSICS.maxOrbSpeed) * 100}%`;
    const b = w.activeBoss();
    if (b) {
      this.boss.classList.remove('hidden');
      this.bossName.textContent = b.def.name;
      this.bossFill.style.width = `${Math.max(0, (b.hp / b.maxHp) * 100)}%`;
    } else this.boss.classList.add('hidden');
    if (this.bannerT > 0) { this.bannerT -= dt; if (this.bannerT <= 0) this.banner.classList.add('hidden'); }
    this.reelBtn.classList.toggle('latched', reelLatched);
    void PROGRESSION;
  }
}
