// App controller: title -> hangar -> run -> results. Owns the loop, input, renderer, audio hooks, save and the DOM screens.
import { Screen } from '../core/canvas';
import { Input, NO_INTENT, type Intents } from '../core/input';
import { FixedStepper, STEP } from '../core/loop';
import { audio } from '../audio';
import { FEEL } from '../fx/feel';
import { drawDebug, drawJoystick } from '../ui/touch';
import { Hud } from '../ui/hud';
import { DraftView } from '../ui/draft';
import { HangarScreen, PauseScreen, ResultsScreen, TitleScreen, stardustParts } from '../ui/screens';
import { RevivePrompt } from '../ui/adPrompts';
import { StoreScreen } from '../ui/store';
import { AdService, SaveEntitlements, createProvider, hasNoAds, isSupporter, platformFromEnv, type MonetizationProvider } from '../monetization';
import { uiRoot } from '../ui/dom';
import { AD_POLICY, META_UNLOCKS } from '../data';
import type { ShipSkin, OrbSkin, TrailId } from '../render/art';
import { botIntents } from './bot';
import type { Params } from './params';
import { Renderer } from './render';
import { SaveStore, recordRun, safeStorage, type Settings } from './save';
import { World } from './sim';
import type { GameEvent } from './types';

type State = 'title' | 'hangar' | 'store' | 'run' | 'results';
const DEATH_DELAY = 0.85; // s of death cam before results (restart stays well under 2 s)
const WIN_DELAY = 1.6;
const DRAFT_DELAY = 0.25; // s of level-up burst before the cards appear
const DRAFT_LOCK_MS = 350; // ignore picks right after the draft opens (a held reel button must not pick)

export class Game {
  readonly screen: Screen;
  readonly input: Input;
  readonly renderer = new Renderer();
  readonly store: SaveStore;
  world: World;
  state: State = 'title';
  paused = false;

  private ui = uiRoot();
  private hud: Hud;
  private draft: DraftView;
  private pauseUi: PauseScreen;
  private title: TitleScreen;
  private hangar: HangarScreen;
  private results: ResultsScreen;
  private storeUi: StoreScreen;
  private revive: RevivePrompt;
  readonly provider: MonetizationProvider;
  readonly ads: AdService;
  private adActive = false;
  private revivePending = false;
  private stepper = new FixedStepper();
  private last = 0;
  private fps = 60;
  private frameMs = 0;
  private hitstop = 0;
  private sinceHitstop = 1000;
  private slowT = 0;
  private draftDelay = 0;
  private runIndex = 0;
  private runSeed = 0;
  private intens = 0.15;
  private unlocked = false;
  private hintT = 0;
  private resultsShown = false;
  private dieUsed = false;
  private abandoned = false;
  private xpCombo = 0; private xpComboT = 0;
  private hitSfxThisFrame = 0;

  constructor(canvas: HTMLCanvasElement, readonly params: Params) {
    this.screen = new Screen(canvas);
    this.input = new Input(this.screen);
    this.store = new SaveStore(safeStorage());
    if (import.meta.env.DEV && params.give > 0) { this.store.data.stardust += params.give; this.store.commit(); }
    this.world = new World({ seed: params.seed, noSpawn: true });

    const apply = (s: Settings): void => this.applySettings(s);
    this.hud = new Hud(this.ui);
    this.draft = new DraftView(this.ui);
    this.pauseUi = new PauseScreen(this.ui, this.store, apply);
    this.title = new TitleScreen(this.ui, this.store, apply);
    this.hangar = new HangarScreen(this.ui, apply);
    this.results = new ResultsScreen(this.ui);
    this.storeUi = new StoreScreen(this.ui);
    this.revive = new RevivePrompt(this.ui);
    const ents = new SaveEntitlements(this.store, safeStorage());
    this.provider = createProvider(platformFromEnv(import.meta.env.VITE_PLATFORM), ents, { auto: import.meta.env.DEV && params.mockAuto });
    this.ads = new AdService(this.provider, { noAds: () => hasNoAds(this.store.data), runsCompleted: () => this.store.data.stats.runs }, {
      onAdStart: () => { this.adActive = true; audio.setMuted(true); this.revive.freeze(); },
      onAdEnd: () => { this.adActive = false; audio.setMuted(false); this.stepper.acc = 0; this.input.clearLatches(); this.last = performance.now(); },
    });
    this.hangar.canStore = this.provider.capabilities.purchases;
    // SDKs load in the background: the game never waits on them. Capabilities update once they are ready.
    void this.provider.init().then(() => { this.hangar.canStore = this.provider.capabilities.purchases; });
    this.applySettings(this.store.data.settings);
    this.wireUi();
    this.renderer.debug = params.debug;

    // first gesture unlocks audio (autoplay policy)
    const unlock = (): void => {
      if (this.unlocked) return;
      this.unlocked = true;
      void audio.unlock();
      for (const ev of ['pointerdown', 'keydown', 'touchstart']) window.removeEventListener(ev, unlock, true);
    };
    for (const ev of ['pointerdown', 'keydown', 'touchstart']) window.addEventListener(ev, unlock, true);

    // UI hover / click sounds (delegated)
    let lastHover: Element | null = null;
    this.ui.addEventListener('mouseover', (e) => {
      const el = (e.target as Element).closest('.btn, .card, .chip');
      if (el && el !== lastHover && !(el as HTMLButtonElement).disabled) audio.play('uiHover');
      lastHover = el;
    });
    this.ui.addEventListener('click', (e) => {
      const el = (e.target as Element).closest('.btn, .chip');
      if (el && !(el as HTMLButtonElement).disabled) audio.play('uiClick');
    });

    // auto-pause when the tab is hidden or the window loses focus
    const autoPause = (): void => { if (this.state === 'run' && !this.world.outcome && !this.draft.open) this.setPaused(true); };
    document.addEventListener('visibilitychange', () => { if (document.hidden) { autoPause(); this.store.flush(); } });
    window.addEventListener('blur', autoPause);
    window.addEventListener('pagehide', () => this.store.flush());

    if (params.debug) {
      (window as unknown as { __game: unknown }).__game = {
        game: this, get world() { return (this as unknown as { game: Game }).game.world; },
        pause: (v = true) => this.setPaused(v),
        step: (n = 1) => { for (let i = 0; i < n; i++) this.world.step(NO_INTENT); },
      };
    }

    if (params.screen === 'hangar') this.goHangar();
    else if (params.screen === 'store') this.goStore();
    else if (params.screen === 'results') this.demoResults();
    else if (params.direct && params.screen !== 'title') this.startRun();
    else this.goTitle();
  }

  // ------------------------------------------------------------------ settings & wiring
  private applySettings(s: Settings): void {
    audio.setVolume('master', s.master); audio.setVolume('sfx', s.sfx); audio.setVolume('music', s.music);
    this.renderer.opts.shake = s.screenShake;
    this.renderer.opts.reducedFlashes = s.reducedFlashes;
    this.renderer.opts.damageNumbers = s.damageNumbers;
    this.input.reelMode = s.reelMode;
    if (s.reelMode === 'hold') this.input.resetReel();
  }

  private wireUi(): void {
    this.title.onPlay = () => this.fromTitle();
    this.title.onHangar = () => this.goHangar();
    this.hangar.onBack = () => this.goTitle();
    this.hangar.onLaunch = () => this.startRun();
    this.results.onAgain = () => this.startRun();
    this.results.onHangar = () => { void this.ads.maybeInterstitial().then(() => this.goHangar()); };
    this.results.onDouble = async () => {
      if (!(await this.ads.requestDoubleStardust())) return 0;
      const extra = Math.floor(this.lastEarned * (AD_POLICY.doubleStardustMul - 1));
      const d = this.store.data; d.stardust += extra; d.stats.stardustEarned += extra;
      this.store.commit(); this.store.flush();
      return extra;
    };
    this.hangar.onStore = () => this.goStore();
    this.storeUi.onBack = () => this.goHangar();
    this.revive.onYes = () => void this.acceptRevive();
    this.revive.onNo = () => this.declineRevive();
    this.pauseUi.onResume = () => this.setPaused(false);
    this.pauseUi.onAbandon = () => { this.setPaused(false); this.abandoned = true; this.showResults(); };
    this.draft.onPick = (i) => this.pickDraft(i);
    this.draft.onReroll = () => this.rerollDraft();
    this.hud.pauseBtn.addEventListener('click', () => this.setPaused(!this.paused));
    const reel = this.hud.reelBtn;
    const down = (e: Event): void => { e.preventDefault(); this.input.setTouchReel(true); };
    const up = (e: Event): void => { e.preventDefault(); this.input.setTouchReel(false); };
    reel.addEventListener('pointerdown', down); reel.addEventListener('pointerup', up);
    reel.addEventListener('pointercancel', up); reel.addEventListener('pointerleave', up);
    reel.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  // ------------------------------------------------------------------ screen flow
  private hideAll(): void {
    this.title.hide(); this.hangar.hide(); this.results.hide(); this.hud.show(false); this.draft.hide(); this.pauseUi.hide(); this.storeUi.hide(); this.revive.hide(); this.revivePending = false;
  }

  private goTitle(): void {
    this.hideAll(); this.state = 'title'; this.paused = false;
    this.title.show(this.store);
    audio.music.stop();
  }

  private fromTitle(): void {
    // first launch skips the hangar (GDD 7): loadout is all defaults
    if (this.store.data.stats.runs === 0) this.startRun(); else this.goHangar();
  }

  private goHangar(): void {
    this.hideAll(); this.state = 'hangar'; this.paused = false;
    this.hangar.show(this.store);
    audio.music.stop();
  }

  private goStore(): void {
    this.hideAll(); this.state = 'store'; this.paused = false;
    this.storeUi.show(this.store, this.provider);
    audio.music.stop();
  }

  private demoResults(): void {
    this.world = new World({ seed: this.params.seed, noSpawn: true });
    this.world.time = 187; this.world.kills = 214; this.world.bossKills = 1; this.world.runPickups = 7; this.world.level = 9;
    this.world.killedBy = 'Spitter spit'; this.world.outcome = 'dead'; this.world.endTime = 187;
    this.showResults();
  }

  startRun(): void {
    const d = this.store.data;
    this.hideAll();
    this.state = 'run'; this.paused = false; this.resultsShown = false; this.abandoned = false;
    this.ads.beginRun();
    this.runSeed = this.runIndex === 0 ? this.params.seed : (this.runSeed * 1664525 + 1013904223 + this.runIndex) >>> 0;
    this.runIndex++;
    const meta = META_UNLOCKS.filter((m) => d.unlocks.includes(m.id)).map((m) => m.id);
    this.world = new World({ seed: this.runSeed, god: this.params.god, stress: this.params.stress, ship: d.equipped.ship, orb: d.equipped.orb, unlockedMeta: meta, autoDraft: this.params.auto });
    this.renderer.skins = { ship: d.equipped.shipSkin as ShipSkin, orb: d.equipped.orbSkin as OrbSkin, trail: d.equipped.trail as TrailId };
    this.renderer.reset();
    this.input.resetReel(); this.input.clearLatches(); this.input.moved = false; this.input.reeled = false;
    this.stepper.acc = 0; this.hitstop = 0; this.slowT = 0; this.draftDelay = 0; this.hintT = 0;
    if (this.params.skipTo > 0 && this.runIndex === 1) this.skipTo(this.params.skipTo);
    if (import.meta.env.DEV && this.params.draft && this.runIndex === 1) this.world.grantXp(10);
    this.hud.show(true);
    this.hud.setHint(null);
    audio.music.start();
  }

  /** ?skipTo=N: fast-forward with the bot (god mode, auto drafts) so late-game screens can be inspected. */
  private skipTo(sec: number): void {
    const w = this.world, god = w.god, auto = w.autoDraft;
    w.god = true; w.autoDraft = true;
    while (w.time < sec && !w.outcome) w.step(botIntents(w));
    w.god = god; w.autoDraft = auto || this.params.auto;
    w.events.length = 0;
    this.renderer.reset();
  }

  private lastEarned = 0;

  private showResults(): void {
    if (this.resultsShown) return;
    this.resultsShown = true;
    this.ads.endRun(); this.ads.beginResults();
    const w = this.world, sum = w.summary();
    const earned = w.stardustEarned();
    this.lastEarned = earned;
    let rec = { newBest: false, banked: 0 };
    if (!this.params.god && this.params.stress === 0 && this.params.skipTo === 0) { // cheat/stress/skip runs never touch the save
      rec = recordRun(this.store.data, { timeSec: sum.secondsSurvived, kills: w.kills, bossKills: w.bossKills, won: sum.won, stardust: earned });
      this.store.commit(); this.store.flush(); // bank immediately: closing the tab never loses it
    }
    this.hideAll(); this.state = 'results';
    audio.music.stop();
    this.results.show({
      won: sum.won, timeSec: sum.secondsSurvived, kills: w.kills, bossKills: w.bossKills, killedBy: w.killedBy, level: w.level,
      parts: stardustParts(sum, w.bonusStardust), stardust: earned, bestSec: this.store.data.bestTimes.survivedSec, newBest: rec.newBest,
      balance: this.store.data.stardust, abandoned: this.abandoned,
    }, this.store, { supporter: isSupporter(this.store.data), offerDouble: this.ads.canOfferDouble() });
  }

  // ------------------------------------------------------------------ second wind (once per run)
  private offerRevive(): boolean {
    if (this.abandoned || this.world.outcome !== 'dead' || this.params.god) return false;
    this.ads.pauseForPrompt();
    const offer = this.ads.secondWindOffer();
    if (!offer) { this.ads.resumeRun(); return false; }
    this.revivePending = true;
    this.revive.show(offer);
    return true;
  }
  private async acceptRevive(): Promise<void> {
    if (!this.revivePending || this.adActive) return;
    const ok = await this.ads.requestSecondWind();
    if (!this.revivePending) return;
    this.revivePending = false; this.revive.hide();
    if (ok && this.world.revive(AD_POLICY.secondWindIframesSec, AD_POLICY.secondWindClearRadius)) {
      this.ads.resumeRun();
      this.resultsShown = false; this.hitstop = 0; this.slowT = 0;
      this.stepper.acc = 0; this.input.clearLatches(); this.last = performance.now();
      audio.music.start(); audio.play('levelUp');
      this.hud.showBanner('SECOND WIND', 1400);
    } else this.showResults(); // ad failed / skipped / timed out: progress is never blocked
  }
  private declineRevive(): void {
    if (!this.revivePending) return;
    this.revivePending = false; this.revive.hide();
    this.showResults();
  }

  setPaused(v: boolean): void {
    if (this.state !== 'run' || this.world.outcome) return;
    if (v === this.paused) return;
    this.paused = v;
    if (v) this.pauseUi.show();
    else { this.pauseUi.hide(); this.stepper.acc = 0; this.input.clearLatches(); this.last = performance.now(); }
  }

  // ------------------------------------------------------------------ draft
  private pickDraft(i: number): void {
    const w = this.world;
    if (!this.draft.open || performance.now() - this.draft.openedAt < DRAFT_LOCK_MS) return;
    if (!w.pickDraft(i)) return;
    this.draft.hide();
    this.input.clearLatches();
    this.processEvents(w.drainEvents());
    if (w.draft === null && w.pendingDrafts > 0) { w.openDraft(); this.draftDelay = 0.05; }
    this.stepper.acc = 0;
  }

  private rerollDraft(): void {
    const w = this.world;
    if (!this.draft.open || performance.now() - this.draft.openedAt < DRAFT_LOCK_MS) return;
    if (w.rerollDraft() && w.draft) { this.draft.show(w, w.draft); this.draft.openedAt = performance.now() - DRAFT_LOCK_MS; audio.play('uiClick'); }
  }

  // ------------------------------------------------------------------ loop
  start(): void {
    requestAnimationFrame((t) => { this.last = t; requestAnimationFrame(this.frame); });
  }

  private frame = (now: number): void => {
    requestAnimationFrame(this.frame);
    const t0 = performance.now();
    const real = Math.min(Math.max((now - this.last) / 1000, 0), 0.1);
    this.last = now;
    if (real > 0) this.fps += (1 / real - this.fps) * 0.05;
    const intents = this.input.poll();
    const any = this.input.takeAny();
    const s = this.screen, c = s.ctx;
    s.begin();

    switch (this.state) {
      case 'title':
        this.renderer.drawMenu(c, s.w, s.h, real, 'title');
        if (any || intents.confirm) this.fromTitle(); // any key / tap on the canvas starts (DOM buttons handle their own clicks)
        break;
      case 'hangar': {
        const d = this.store.data;
        this.renderer.drawMenu(c, s.w, s.h, real, 'hangar', { ship: d.equipped.ship, orb: d.equipped.orb, shipSkin: d.equipped.shipSkin as ShipSkin, orbSkin: d.equipped.orbSkin as OrbSkin });
        break;
      }
      case 'results':
        this.renderer.drawMenu(c, s.w, s.h, real, 'results');
        if ((intents.confirm || this.input.takeReroll()) && !this.adActive) this.startRun();
        break;
      case 'run':
        this.runFrame(c, intents, real, now);
        break;
    }
    this.frameMs += (performance.now() - t0 - this.frameMs) * 0.1;
    if (this.params.debug) {
      const w = this.world;
      drawDebug(c, [
        `fps ${this.fps.toFixed(0)}  ms/frame ${this.frameMs.toFixed(2)} (sim+draw)`,
        `tick ${w.tick}  seed ${w.seed}  hash ${w.stateHash().toString(16)}`,
        `enemies ${w.enemies.count}  pickups ${w.pickups.count}  shots ${w.projectiles.count}  fx ${this.renderer.ps.count}`,
        `orb speed ${w.orbSpeed().toFixed(0)}  rest ${w.tether.rest.toFixed(0)}  reel ${w.tether.phase}`,
        `god ${w.god}  stress ${this.params.stress}  t ${w.time.toFixed(1)}`,
      ]);
    }
  };

  private runFrame(c: CanvasRenderingContext2D, intents: Intents, real: number, now: number): void {
    const w = this.world, s = this.screen;
    if (intents.pause && !w.outcome && !this.draft.open) this.setPaused(!this.paused);

    // delayed draft open (let the level-up burst play), then input
    if (w.draft && !this.draft.open) {
      this.draftDelay -= real;
      if (this.draftDelay <= 0) { this.draft.show(w, w.draft); }
    }
    if (this.draft.open) {
      const pick = this.input.takePick();
      const nav = this.input.takeNav();
      if (nav !== 0) { this.draft.setFocus(this.draft.focus + nav); audio.play('uiHover'); }
      if (pick >= 0) this.pickDraft(pick);
      else if (intents.confirm) this.pickDraft(this.draft.focus);
      if (this.input.takeReroll()) this.rerollDraft();
    }

    let alpha = this.stepper.acc / STEP;
    const live = !this.paused && !this.draft.open && !this.revivePending && !this.adActive;
    this.hitSfxThisFrame = 0;
    if (live) {
      this.sinceHitstop += real * 1000;
      this.xpComboT -= real; if (this.xpComboT <= 0) this.xpCombo = 0;
      if (this.hitstop > 0) this.hitstop -= real * 1000;
      else {
        let scale = this.params.speed;
        if (this.slowT > 0) { this.slowT -= real; scale *= 0.3; }
        const auto = this.params.auto;
        const draftWasOpen = !!w.draft;
        alpha = this.stepper.advance(real * scale, (i) => {
          const base = auto ? botIntents(w) : intents;
          w.step(i === 0 ? base : { ...base, confirm: false, pause: false });
        });
        if (!draftWasOpen && w.draft) this.draftDelay = DRAFT_DELAY;
        this.processEvents(w.events);
        w.events.length = 0;
      }
      this.tickHints(real, w);
      // music intensity follows enemy density; bosses push the lead layer in
      const boss = w.activeBoss();
      const target = boss ? 0.92 : Math.min(0.7, 0.18 + w.enemies.count / 110);
      this.intens += (target - this.intens) * Math.min(1, real * 1.5);
      audio.music.setIntensity(this.intens);
      this.renderer.intensity = this.intens;
      if (import.meta.env.DEV && this.params.die > 0 && w.time >= this.params.die && !w.outcome && !this.dieUsed) { this.dieUsed = true; w.forceDeath(); }
      if (w.outcome && !this.resultsShown && w.deadTime >= (w.outcome === 'won' ? WIN_DELAY : DEATH_DELAY)) {
        if (w.outcome === 'dead' && this.offerRevive()) { /* prompt up; sim frozen */ } else this.showResults();
      }
    }
    if (!live) this.hud.setHint(null);
    this.renderer.draw(c, w, alpha, live ? real : 0, s.w, s.h);
    drawJoystick(c, this.input.touch);
    this.hud.el.classList.toggle('touch', this.input.touch.seen);
    this.hud.update(w, real, this.input.reelLatched);
    void now;
  }

  private tickHints(real: number, w: World): void {
    const d = this.store.data, hd = d.hintsDone;
    if (!d.settings.controlHints || (hd.move && hd.reel) || w.outcome) { this.hud.setHint(null); return; }
    const touch = this.input.touch.seen;
    this.hintT += real;
    if (!hd.move) {
      if (this.input.moved) { hd.move = true; this.store.commit(); this.hintT = 0; this.hud.setHint(null); }
      else this.hud.setHint(touch ? 'Drag to swing your orb' : 'Move to swing your orb');
    } else if (!hd.reel) {
      if (this.input.reeled) { hd.reel = true; this.store.commit(); this.hud.setHint(null); }
      else if (this.hintT > 2.5) this.hud.setHint(touch ? 'Hold REEL: faster spin = more damage' : 'Hold SPACE to reel: faster spin = more damage');
      else this.hud.setHint(null);
    }
  }

  // ------------------------------------------------------------------ events -> hitstop, audio, banners
  private processEvents(evs: GameEvent[]): void {
    if (evs.length === 0) return;
    const w = this.world, fx = FEEL.hitstopMs;
    let stop = 0, hurt = false, firstHit = true;
    for (const e of evs) {
      switch (e.type) {
        case 'hit': {
          if (e.secondary) { if (this.hitSfxThisFrame < 5) { audio.play('hit', { volume: 0.5, pitch: 1.4 }); this.hitSfxThisFrame++; } break; }
          if (e.bump) { if (this.hitSfxThisFrame < 5) { audio.play('hit', { volume: 0.35, pitch: 0.6 }); this.hitSfxThisFrame++; } break; }
          const pitch = 0.75 + 0.7 * Math.min(1, e.speed / 1600);
          if (this.hitSfxThisFrame < 5) {
            this.hitSfxThisFrame++;
            if (e.crit) audio.play('crit', { pitch });
            else audio.play(e.speed >= 1100 ? 'hitHeavy' : 'hit', { pitch });
            if (e.boss && firstHit) { audio.play('bossHit', { volume: 0.6 }); }
          }
          firstHit = false;
          if (e.crit) stop = Math.max(stop, fx.crit);
          else if (e.boss) stop = Math.max(stop, fx.bossHit);
          else if (fx.hit > 0) stop = Math.max(stop, fx.hit);
          break;
        }
        case 'kill': if (!e.boss) { audio.play('enemyDie', { volume: 0.7 }); stop = Math.max(stop, fx.kill); } break;
        case 'bossDie': audio.play('bossDie'); stop = Math.max(stop, 120); this.slowT = 1.0; break;
        case 'bossWarn': this.hud.showBanner(`⚠ ${w.def(e.boss).name.toUpperCase()} APPROACHES`, 2600); audio.play('bossWarn'); audio.music.stinger('boss'); break;
        case 'bossSpawn': this.hud.showBanner(w.def(e.boss).name.toUpperCase(), 1600); break;
        case 'bossLeft': this.hud.showBanner(`${w.def(e.boss).name} warps out`, 2000); break;
        case 'bossPhase': this.hud.showBanner('PHASE 2', 1200); audio.play('bossHit'); break;
        case 'playerHurt': audio.play('playerHurt'); hurt = true; break;
        case 'pickup':
          if (e.kind === 'xpSmall' || e.kind === 'xpBig') { this.xpCombo = Math.min(14, this.xpCombo + 1); this.xpComboT = 0.3; audio.play('pickupXp', { pitch: 1 + this.xpCombo * 0.05, volume: 0.6 }); }
          else if (e.kind === 'stardust') audio.play('stardust');
          else audio.play('pickupHeart');
          break;
        case 'levelUp': audio.play('levelUp'); break;
        case 'draftOpen': break;
        case 'upgradePicked': audio.play('upgradePick'); break;
        case 'reelStart': audio.play('reel', { pitch: 0.8 + 0.8 * Math.min(1, e.speed / 1000) }); break;
        case 'shockwave': case 'explosion': audio.play('hitHeavy', { volume: 0.5 }); break;
        case 'swat': audio.play('hit', { volume: 0.4, pitch: 1.6 }); break;
        case 'orbWall': audio.play('hit', { volume: 0.4, pitch: 0.5 }); break;
        case 'victory': audio.music.stinger('victory'); audio.play('victory'); break;
        case 'death': audio.music.stinger('defeat'); audio.play('defeat'); break;
        default:
      }
    }
    if (stop > 0 && (hurt || this.sinceHitstop > 120)) { this.hitstop = Math.max(this.hitstop, hurt ? fx.playerHurt : stop); this.sinceHitstop = 0; }
    this.renderer.handleEvents(evs, w);
  }
}
