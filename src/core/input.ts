import type { Screen } from './canvas';

export interface Intents {
  moveX: number;
  moveY: number;
  reel: boolean;
  pause: boolean;
  confirm: boolean;
}

export const NO_INTENT: Readonly<Intents> = Object.freeze({ moveX: 0, moveY: 0, reel: false, pause: false, confirm: false });

export interface TouchState {
  seen: boolean;
  joyActive: boolean;
  joyOx: number; joyOy: number; // logical coords
  joyX: number; joyY: number;
  reelActive: boolean;
}

export const JOY_RADIUS = 70;
export const REEL_BTN = { x: 1140, y: 570, r: 85 };

const DEADZONE = 0.18;

/** Unified keyboard / mouse / gamepad / touch input producing intents. pause/confirm are edge-latched until poll(). */
export class Input {
  readonly touch: TouchState = { seen: false, joyActive: false, joyOx: 0, joyOy: 0, joyX: 0, joyY: 0, reelActive: false };
  private keys = new Set<string>();
  private mouseReel = false;
  private pauseLatch = false;
  private confirmLatch = false;
  private padReelPrev = false;
  private padPausePrev = false;
  private joyId = -1;
  private reelId = -1;
  private out: Intents = { moveX: 0, moveY: 0, reel: false, pause: false, confirm: false };

  constructor(private readonly screen: Screen) {
    const w = window;
    w.addEventListener('keydown', (e) => this.onKey(e, true));
    w.addEventListener('keyup', (e) => this.onKey(e, false));
    w.addEventListener('blur', () => { this.keys.clear(); this.mouseReel = false; });
    const c = screen.canvas;
    c.addEventListener('contextmenu', (e) => e.preventDefault());
    c.addEventListener('mousedown', (e) => {
      if (e.button === 2) this.mouseReel = true;
      if (e.button === 0) this.confirmLatch = true;
      c.focus();
    });
    w.addEventListener('mouseup', (e) => { if (e.button === 2) this.mouseReel = false; });
    const opts = { passive: false } as const;
    c.addEventListener('touchstart', (e) => this.onTouch(e, 'start'), opts);
    c.addEventListener('touchmove', (e) => this.onTouch(e, 'move'), opts);
    c.addEventListener('touchend', (e) => this.onTouch(e, 'end'), opts);
    c.addEventListener('touchcancel', (e) => this.onTouch(e, 'end'), opts);
  }

  private onKey(e: KeyboardEvent, down: boolean): void {
    const code = e.code;
    if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ShiftLeft', 'ShiftRight'].includes(code)) e.preventDefault();
    if (down) {
      if (!e.repeat) {
        if (code === 'Escape' || code === 'KeyP') this.pauseLatch = true;
        if (code === 'Enter' || code === 'Space') this.confirmLatch = true;
      }
      this.keys.add(code);
    } else {
      this.keys.delete(code);
    }
  }

  private onTouch(e: TouchEvent, phase: 'start' | 'move' | 'end'): void {
    e.preventDefault();
    this.touch.seen = true;
    const t = this.touch;
    if (phase === 'start') this.confirmLatch = true;
    const list = phase === 'end' ? e.changedTouches : phase === 'start' ? e.changedTouches : e.touches;
    for (let i = 0; i < list.length; i++) {
      const tc = list[i];
      const p = this.screen.toLogical(tc.clientX, tc.clientY);
      if (phase === 'start') {
        if (p.x < 640 && this.joyId < 0) {
          this.joyId = tc.identifier; t.joyActive = true;
          t.joyOx = t.joyX = p.x; t.joyOy = t.joyY = p.y;
        } else if (p.x >= 640 && this.reelId < 0) {
          this.reelId = tc.identifier; t.reelActive = true;
        }
      } else if (phase === 'move') {
        if (tc.identifier === this.joyId) { t.joyX = p.x; t.joyY = p.y; }
      } else {
        if (tc.identifier === this.joyId) { this.joyId = -1; t.joyActive = false; }
        if (tc.identifier === this.reelId) { this.reelId = -1; t.reelActive = false; }
      }
    }
  }

  poll(): Intents {
    const k = this.keys;
    let mx = (k.has('KeyD') || k.has('ArrowRight') ? 1 : 0) - (k.has('KeyA') || k.has('ArrowLeft') ? 1 : 0);
    let my = (k.has('KeyS') || k.has('ArrowDown') ? 1 : 0) - (k.has('KeyW') || k.has('ArrowUp') ? 1 : 0);
    let reel = k.has('Space') || k.has('ShiftLeft') || k.has('ShiftRight') || this.mouseReel;

    // gamepad
    const pads = typeof navigator !== 'undefined' && navigator.getGamepads ? navigator.getGamepads() : [];
    for (const pad of pads) {
      if (!pad) continue;
      const ax = pad.axes[0] ?? 0, ay = pad.axes[1] ?? 0;
      if (Math.hypot(ax, ay) > DEADZONE) { mx = ax; my = ay; }
      const a = !!pad.buttons[0]?.pressed || !!pad.buttons[7]?.pressed || !!pad.buttons[5]?.pressed;
      const start = !!pad.buttons[9]?.pressed;
      if (a) reel = true;
      if (a && !this.padReelPrev) this.confirmLatch = true;
      if (start && !this.padPausePrev) this.pauseLatch = true;
      this.padReelPrev = a; this.padPausePrev = start;
      break;
    }

    // touch
    const t = this.touch;
    if (t.joyActive) {
      const dx = t.joyX - t.joyOx, dy = t.joyY - t.joyOy;
      const d = Math.hypot(dx, dy);
      if (d > 6) { const s = Math.min(1, d / JOY_RADIUS) / d; mx = dx * s; my = dy * s; }
    }
    if (t.reelActive) reel = true;

    const len = Math.hypot(mx, my);
    if (len > 1) { mx /= len; my /= len; }
    const o = this.out;
    o.moveX = mx; o.moveY = my; o.reel = reel;
    o.pause = this.pauseLatch; o.confirm = this.confirmLatch;
    this.pauseLatch = false; this.confirmLatch = false;
    return o;
  }
}
