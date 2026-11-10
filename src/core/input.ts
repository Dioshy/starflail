import type { Screen } from './canvas';
import type { ReelMode } from '../data';

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
  /** set by the on-screen REEL button (DOM) */
  reelActive: boolean;
}

export const JOY_RADIUS = 70;
const DEADZONE = 0.18;

/**
 * Unified keyboard / mouse / gamepad / touch input producing intents. pause/confirm/pick/reroll/nav are edge-latched
 * until consumed. Reel supports hold or toggle mode (reel.md): toggle latches on each press and resets on blur.
 */
export class Input {
  readonly touch: TouchState = { seen: false, joyActive: false, joyOx: 0, joyOy: 0, joyX: 0, joyY: 0, reelActive: false };
  reelMode: ReelMode = 'hold';
  deadZone = DEADZONE;
  private keys = new Set<string>();
  private mouseReel = false;
  private pauseLatch = false;
  private confirmLatch = false;
  private startLatch = false;
  private pickLatch = -1;
  private rerollLatch = false;
  private navLatch = 0;
  private anyLatch = false;
  private latched = false;
  private rawPrev = false;
  private padPrev = { a: false, start: false, y: false, l: false, r: false, sx: 0 };
  private joyId = -1;
  private out: Intents = { moveX: 0, moveY: 0, reel: false, pause: false, confirm: false };
  /** most recent movement magnitude (for first-run hints) */
  moved = false;
  reeled = false;

  constructor(private readonly screen: Screen) {
    const w = window;
    w.addEventListener('keydown', (e) => this.onKey(e, true));
    w.addEventListener('keyup', (e) => this.onKey(e, false));
    w.addEventListener('blur', () => this.releaseAll());
    document.addEventListener('visibilitychange', () => { if (document.hidden) this.releaseAll(); });
    const c = screen.canvas;
    c.addEventListener('contextmenu', (e) => e.preventDefault());
    c.addEventListener('mousedown', (e) => {
      if (e.button === 2) this.mouseReel = true;
      if (e.button === 0) { this.confirmLatch = true; this.startLatch = true; }
      this.anyLatch = true;
      c.focus();
    });
    w.addEventListener('mouseup', (e) => { if (e.button === 2) this.mouseReel = false; });
    const opts = { passive: false } as const;
    c.addEventListener('touchstart', (e) => this.onTouch(e, 'start'), opts);
    c.addEventListener('touchmove', (e) => this.onTouch(e, 'move'), opts);
    c.addEventListener('touchend', (e) => this.onTouch(e, 'end'), opts);
    c.addEventListener('touchcancel', (e) => this.onTouch(e, 'end'), opts);
  }

  /** Blur / tab hide: never come back to a held key or a latched reel (reel.md). */
  releaseAll(): void {
    this.keys.clear(); this.mouseReel = false; this.latched = false; this.rawPrev = false;
    this.touch.reelActive = false; this.touch.joyActive = false; this.joyId = -1;
  }

  get reelLatched(): boolean { return this.reelMode === 'toggle' && this.latched; }
  resetReel(): void { this.latched = false; }

  /** True once any key/click/touch happened since the last call (used to unlock audio). */
  takeAny(): boolean { const a = this.anyLatch; this.anyLatch = false; return a; }
  takePick(): number { const p = this.pickLatch; this.pickLatch = -1; return p; }
  takeReroll(): boolean { const r = this.rerollLatch; this.rerollLatch = false; return r; }
  takeNav(): number { const n = this.navLatch; this.navLatch = 0; return n; }
  /** Enter / click / tap / pad A since the last call (never Space or the reel key). */
  takeStart(): boolean { const c = this.startLatch; this.startLatch = false; return c; }
  takeConfirm(): boolean { const c = this.confirmLatch; this.confirmLatch = false; return c; }
  clearLatches(): void { this.pauseLatch = false; this.confirmLatch = false; this.startLatch = false; this.pickLatch = -1; this.rerollLatch = false; this.navLatch = 0; }

  private onKey(e: KeyboardEvent, down: boolean): void {
    const code = e.code;
    const t = e.target as HTMLElement | null;
    const tag = t?.tagName ?? '';
    const inField = tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA';
    const onButton = tag === 'BUTTON'; // Enter/Space there activate the button, not the game
    if (!inField && !onButton && ['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ShiftLeft', 'ShiftRight'].includes(code)) e.preventDefault();
    if (down) {
      const modifier = code === 'Tab' || code.startsWith('Shift') || code.startsWith('Control') || code.startsWith('Alt') || code.startsWith('Meta');
      if (!inField && !modifier && !(onButton && (code === 'Enter' || code === 'Space'))) this.anyLatch = true;
      if (!e.repeat && !inField) {
        if (code === 'Escape' || code === 'KeyP') this.pauseLatch = true;
        if ((code === 'Enter' || code === 'Space') && !onButton) this.confirmLatch = true;
        if (code === 'Enter' && !onButton) this.startLatch = true; // Space is the reel key: it never starts a run
        if (code === 'Digit1' || code === 'Numpad1') this.pickLatch = 0;
        if (code === 'Digit2' || code === 'Numpad2') this.pickLatch = 1;
        if (code === 'Digit3' || code === 'Numpad3') this.pickLatch = 2;
        if (code === 'KeyR') this.rerollLatch = true;
        if (code === 'ArrowLeft' || code === 'KeyA') this.navLatch = -1;
        if (code === 'ArrowRight' || code === 'KeyD') this.navLatch = 1;
      }
      if (!inField) this.keys.add(code);
    } else {
      this.keys.delete(code);
    }
  }

  private onTouch(e: TouchEvent, phase: 'start' | 'move' | 'end'): void {
    e.preventDefault();
    this.touch.seen = true;
    const t = this.touch;
    if (phase === 'start') { this.confirmLatch = true; this.startLatch = true; this.anyLatch = true; }
    const list = phase === 'move' ? e.touches : e.changedTouches;
    for (let i = 0; i < list.length; i++) {
      const tc = list[i];
      const p = this.screen.toLogical(tc.clientX, tc.clientY);
      if (phase === 'start') {
        if (this.joyId < 0) { this.joyId = tc.identifier; t.joyActive = true; t.joyOx = t.joyX = p.x; t.joyOy = t.joyY = p.y; }
      } else if (phase === 'move') {
        if (tc.identifier === this.joyId) { t.joyX = p.x; t.joyY = p.y; }
      } else if (tc.identifier === this.joyId) { this.joyId = -1; t.joyActive = false; }
    }
  }

  setTouchReel(on: boolean): void { this.touch.reelActive = on; if (on) { this.touch.seen = true; this.anyLatch = true; } }

  poll(): Intents {
    const k = this.keys;
    let mx = (k.has('KeyD') || k.has('ArrowRight') ? 1 : 0) - (k.has('KeyA') || k.has('ArrowLeft') ? 1 : 0);
    let my = (k.has('KeyS') || k.has('ArrowDown') ? 1 : 0) - (k.has('KeyW') || k.has('ArrowUp') ? 1 : 0);
    let raw = k.has('Space') || k.has('ShiftLeft') || k.has('ShiftRight') || this.mouseReel;

    const pads = typeof navigator !== 'undefined' && navigator.getGamepads ? navigator.getGamepads() : [];
    for (const pad of pads) {
      if (!pad) continue;
      const ax = pad.axes[0] ?? 0, ay = pad.axes[1] ?? 0;
      if (Math.hypot(ax, ay) > this.deadZone) { mx = ax; my = ay; }
      const a = !!pad.buttons[0]?.pressed || !!pad.buttons[7]?.pressed || !!pad.buttons[5]?.pressed;
      const start = !!pad.buttons[9]?.pressed, y = !!pad.buttons[3]?.pressed;
      const l = !!pad.buttons[14]?.pressed || ax < -0.6, r = !!pad.buttons[15]?.pressed || ax > 0.6;
      const pp = this.padPrev;
      if (a) raw = true;
      if (a && !pp.a) { this.confirmLatch = true; this.startLatch = true; this.anyLatch = true; }
      if (start && !pp.start) this.pauseLatch = true;
      if (y && !pp.y) this.rerollLatch = true;
      if (l && !pp.l) this.navLatch = -1;
      if (r && !pp.r) this.navLatch = 1;
      pp.a = a; pp.start = start; pp.y = y; pp.l = l; pp.r = r;
      break;
    }

    const t = this.touch;
    if (t.joyActive) {
      const dx = t.joyX - t.joyOx, dy = t.joyY - t.joyOy;
      const d = Math.hypot(dx, dy);
      if (d > 6) { const s = Math.min(1, d / JOY_RADIUS) / d; mx = dx * s; my = dy * s; }
    }
    if (t.reelActive) raw = true;

    let reel = raw;
    if (this.reelMode === 'toggle') {
      if (raw && !this.rawPrev) this.latched = !this.latched;
      reel = this.latched;
    }
    this.rawPrev = raw;

    const len = Math.hypot(mx, my);
    if (len > 1) { mx /= len; my /= len; }
    if (len > 0.2) this.moved = true;
    if (reel) this.reeled = true;
    const o = this.out;
    o.moveX = mx; o.moveY = my; o.reel = reel;
    o.pause = this.pauseLatch; o.confirm = this.confirmLatch;
    this.pauseLatch = false; this.confirmLatch = false;
    return o;
  }
}
