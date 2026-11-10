// Death-screen Second Wind prompt. "No thanks" is exactly as big as "Yes". 10 s, then it quietly declines.
import { h } from './dom';

export class RevivePrompt {
  readonly el = h('div', 'overlay revive hidden', null, { role: 'dialog', 'aria-label': 'Second Wind' });
  open = false;
  onYes: () => void = () => {};
  onNo: () => void = () => {};
  private timer: ReturnType<typeof setInterval> | null = null;
  private count = h('div', 'revive-count');
  private yes = h('button', 'btn btn-primary btn-big', '', { 'data-act': 'revive-yes' });
  private no = h('button', 'btn btn-big', 'No thanks', { 'data-act': 'revive-no' });
  private msg = h('div', 'revive-msg');

  constructor(parent: HTMLElement) {
    const panel = h('div', 'panel revive-panel');
    const row = h('div', 'revive-actions'); row.append(this.yes, this.no);
    panel.append(h('h2', 'revive-title', 'SECOND WIND'), this.msg, row, this.count);
    this.el.append(panel);
    this.yes.addEventListener('click', () => this.onYes());
    this.no.addEventListener('click', () => this.onNo());
    parent.append(this.el);
  }

  show(kind: 'free' | 'ad', seconds = 10): void {
    this.open = true; this.el.classList.remove('hidden');
    this.msg.textContent = kind === 'ad' ? 'Watch an ad to revive? Full health and a shockwave. One per run.' : 'Take a second wind? Full health and a shockwave. One per run, on the house.';
    this.yes.textContent = kind === 'ad' ? 'Watch ad & revive' : 'Revive';
    (this.yes as HTMLButtonElement).disabled = false;
    let left = seconds;
    this.count.textContent = `${left}`;
    this.stop();
    this.timer = setInterval(() => { left--; this.count.textContent = `${Math.max(0, left)}`; if (left <= 0) { this.stop(); this.onNo(); } }, 1000);
    this.yes.focus({ preventScroll: true });
  }
  /** keep the prompt on screen but stop the countdown (an ad is playing) */
  freeze(): void { this.stop(); (this.yes as HTMLButtonElement).disabled = true; }
  hide(): void { this.stop(); this.open = false; this.el.classList.add('hidden'); }
  private stop(): void { if (this.timer !== null) { clearInterval(this.timer); this.timer = null; } }
}
