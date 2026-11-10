// Fake ad + checkout modals for the mock provider (dev default). Pure DOM, no network.
import { h, uiRoot } from '../ui/dom';

function modal(build: (box: HTMLElement, done: () => void) => void, timeoutMs: number, onTimeout: () => void): void {
  const root = h('div', 'overlay mock-modal', null, { role: 'dialog', 'aria-modal': 'true' });
  const box = h('div', 'panel mock-box');
  root.append(box);
  const done = (): void => { root.remove(); clearTimeout(t); };
  const t = setTimeout(() => { done(); onTimeout(); }, timeoutMs);
  build(box, done);
  uiRoot().append(root);
}

/** A fake rewarded/interstitial ad: 3 s countdown, then a close button. `skippable` rewarded ads can be abandoned (no reward). */
export function fakeAd(kind: string, rewarded: boolean, secs = 3): Promise<boolean> {
  return new Promise((resolve) => {
    modal((box, done) => {
      box.append(h('div', 'mock-tag', 'MOCK AD'), h('h2', 'mock-title', rewarded ? `Ad: ${kind}` : 'Ad break'));
      const left = h('div', 'mock-count', '');
      const btns = h('div', 'mock-actions');
      const close = h('button', 'btn btn-primary btn-big', rewarded ? 'Claim reward' : 'Close', { 'data-mock': 'ad-close' });
      (close as HTMLButtonElement).disabled = true;
      close.addEventListener('click', () => { done(); resolve(true); });
      btns.append(close);
      if (rewarded) {
        const skip = h('button', 'btn', 'Skip (no reward)', { 'data-mock': 'ad-skip' });
        skip.addEventListener('click', () => { done(); resolve(false); });
        btns.append(skip);
      }
      box.append(left, btns);
      let n = secs;
      const tick = (): void => {
        left.textContent = n > 0 ? `Reward in ${n}…` : 'Done';
        if (n <= 0) { (close as HTMLButtonElement).disabled = false; close.focus({ preventScroll: true }); return; }
        n--; setTimeout(tick, 1000);
      };
      tick();
    }, 120_000, () => resolve(false));
  });
}

export function fakeCheckout(name: string, priceText: string): Promise<boolean> {
  return new Promise((resolve) => {
    modal((box, done) => {
      box.append(h('div', 'mock-tag', 'MOCK CHECKOUT · no real payment'), h('h2', 'mock-title', name), h('div', 'mock-price', priceText));
      const pay = h('button', 'btn btn-primary btn-big', `Pay ${priceText}`, { 'data-mock': 'pay' });
      const cancel = h('button', 'btn btn-big', 'Cancel', { 'data-mock': 'cancel' });
      pay.addEventListener('click', () => { done(); resolve(true); });
      cancel.addEventListener('click', () => { done(); resolve(false); });
      const row = h('div', 'mock-actions'); row.append(pay, cancel);
      box.append(row);
      pay.focus({ preventScroll: true });
    }, 300_000, () => resolve(false));
  });
}
