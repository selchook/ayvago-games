import Phaser from 'phaser';
import { Button, backdrop, hudChip, iconButton, overlayCard } from './ui';
import { t, loc, upper, getLang, setLang } from './i18n';
import { txt, COLORS } from './theme';
import { getBest, submitBest } from './storage';
import { isMuted, isSilenced, setMuted, onMuteChange, playSfx } from './audio';
import { duckMusic, menuTrack, MUSIC_VOLUME, playMusic, restoreMusic } from './music';
import { addCrt, burst } from './fx';
import { sdk } from './sdk';
import { net } from './net';
import { currentGame } from './registry';
import { asset, kenney, loadSfx } from './assets';
import { isModern } from './style';
import { difficulty, isEasy, offersDifficulty, setDifficulty, type Difficulty } from './difficulty';
import { adBusy, adsAvailable, REPLAY_INTERSTITIAL_EVERY, showInterstitial, showRewarded } from './ads';

/** "Play again" presses from the result screen this session (every Nth may bring an interstitial). */
let replays = 0;
let introDone: Promise<void> = Promise.resolve();
const bootWork: Promise<unknown>[] = [];
/** Boot waits for this before the menu opens (used by the 3D runtime to parse its models). */
export function addBootWork(p: Promise<unknown>): void {
  bootWork.push(p);
}
export function setIntroPromise(p: Promise<void>): void {
  introDone = p;
}

/** Loads shared + game assets while the Ayvago intro plays on top. */
export class BootScene extends Phaser.Scene {
  constructor() {
    super('Boot');
  }

  preload(): void {
    const { width, height } = this.scale;
    const bar = this.add.rectangle(width / 2 - 200, height / 2, 0, 16, COLORS.red).setOrigin(0, 0.5);
    this.add.rectangle(width / 2, height / 2, 404, 20).setStrokeStyle(2, 0xffffff, 0.5);
    this.load.on('progress', (p: number) => {
      bar.width = 400 * p;
      sdk.loading(p);
    });
    this.load.on('loaderror', (f: Phaser.Loader.File) => console.error('[ayvago] asset failed to load:', f.key, f.url));

    for (const icon of ['pause', 'audioon', 'audiooff', 'home', 'return', 'star', 'trophy']) {
      this.load.image('icon-' + icon, kenney(`game-icons/png/white/1x/${icon}.png`));
    }
    this.load.image(LOGO, asset('ayvago/menu-logo.png'));
    loadSfx(this.load, 'ui-click', 'sfx-interface/audio/click_002');
    loadSfx(this.load, 'ui-select', 'sfx-interface/audio/select_002');
    loadSfx(this.load, 'jingle-over', 'jingles/audio/8-bit_jingles/jingles_nes09');
    loadSfx(this.load, 'jingle-win', 'jingles/audio/8-bit_jingles/jingles_nes03');
    loadSfx(this.load, 'jingle-best', 'jingles/audio/8-bit_jingles/jingles_nes13');
    currentGame().preload(this);
  }

  async create(): Promise<void> {
    this.sound.mute = isSilenced();
    sdk.loading(1);
    await introDone;
    // work started during preload that the game needs before the menu (3D models being parsed)
    await Promise.all(bootWork);
    sdk.emit('ready');
    this.scene.start('Menu');
  }
}

export class MenuScene extends Phaser.Scene {
  /** Where the Easy/Normal toggle's segments are (world coordinates); read by the test harnesses. */
  difficultyHit: { easy: { x: number; y: number }; normal: { x: number; y: number } } | null = null;

  constructor() {
    super('Menu');
  }

  create(): void {
    const def = currentGame();
    const meta = def.meta;
    const { width, height } = this.scale;
    const land = meta.orientation === 'landscape';
    this.cameras.main.setBackgroundColor(def.background ?? '#0e0d12');
    def.menuDecor?.(this);
    playMusic(this, menuTrack(), MUSIC_VOLUME.menu);
    this.difficultyHit = null;
    if (net.active) {
      this.onlineMenu();
      return;
    }

    const title = txt(this, width / 2, height * (land ? 0.2 : 0.22), upper(loc(meta.title)), {
      title: true, size: land ? 56 : 52, color: '#ffd23f', wrap: width - 80, strokeThickness: 10,
    });
    this.tweens.add({ targets: title, y: title.y - 12, duration: 1100, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });

    // Games that offer Easy/Normal or their own menu option (the steering switch of driving games):
    // portrait stacks the control under PLAY (best and PLAY move up a little to make room);
    // landscape puts it beside PLAY. A game with both gets the two stacked: under PLAY in
    // portrait; in landscape PLAY stands on the left and the switches on the right, difficulty
    // above the game's own option.
    const diff = offersDifficulty();
    const option = def.menuOption && (def.menuOption.show?.(this) ?? true) ? def.menuOption : null;
    const side = diff || !!option;
    const both = diff && !!option;
    const best = getBest(meta.id);
    const playX = side && land ? width / 2 - 180 : width / 2;
    const playY = height * (both ? (land ? 0.485 : 0.42) : land ? 0.52 : side ? 0.44 : 0.5);
    // with both switches stacked on the right (landscape), the best score sits over PLAY
    const bestX = both && land ? playX : width / 2;
    const bestY = both ? (land ? 0.35 : 0.335) : side && !land ? 0.31 : 0.36;
    txt(this, bestX, height * bestY, `${t('best')}: ${best}`, { title: true, size: 22, color: '#3ee6ff' });

    const play = new Button(this, playX, playY, t('play'), () => this.startGame(), { width: 380, height: 110, size: 40 });
    this.tweens.add({ targets: play, scale: 1.05, duration: 600, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    if (both) {
      const x = land ? width / 2 + 200 : width / 2;
      this.difficultyToggle(x, height * (land ? 0.37 : 0.505));
      option!.build(this, x, height * (land ? 0.6 : 0.61));
    } else if (side) {
      const x = land ? width / 2 + 200 : width / 2;
      const y = land ? playY : height * 0.535;
      if (diff) this.difficultyToggle(x, y);
      else option!.build(this, x, y);
    }

    // landscape: three lines of how-to still end above the logo on the bottom row
    const howY = height * (both ? (land ? 0.69 : 0.7) : land ? 0.67 : 0.64);
    txt(this, width / 2, howY, t('howTo'), { title: true, size: 18, color: '#ff4fa3' });
    const how = txt(this, width / 2, howY + 24, loc(meta.howTo), { size: land ? 23 : 28, wrap: width - (land ? 300 : 100), color: '#f3f2f2' }).setOrigin(0.5, 0);
    fitAbove(how, height - BOTTOM_ROW_TOP);

    // sound + language toggles
    soundButton(this, 60, height - 60);
    if (sdk.embedded) {
      // Inside Ayvago the platform owns the locale; offer its leaderboard instead.
      iconButton(this, width - 60, height - 60, 'icon-trophy', () => sdk.openLeaderboard());
    } else this.languageToggle(width, height);

    brandLogo(this, width / 2, height - 60, how.y + how.height);
    if (def.crt !== false) addCrt(this);

    const kb = this.input.keyboard;
    kb?.once('keydown-ENTER', () => this.startGame());
    kb?.once('keydown-SPACE', () => this.startGame());
  }

  /**
   * Online match: the host starts each round (and so picks the shared seed); the guest waits
   * for the host's "__start" message. The platform has already connected both players.
   */
  private onlineMenu(): void {
    const def = currentGame();
    const { width, height } = this.scale;
    const land = def.meta.orientation === 'landscape';
    const title = txt(this, width / 2, height * (land ? 0.18 : 0.2), upper(loc(def.meta.title)), {
      title: true, size: land ? 52 : 48, color: '#ffd23f', wrap: width - 80, strokeThickness: 10,
    });
    this.tweens.add({ targets: title, y: title.y - 10, duration: 1100, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    txt(this, width / 2, height * (land ? 0.33 : 0.32), t('online'), { title: true, size: 26, color: '#3ee6ff' });
    if (net.isTable) {
      txt(this, width / 2, height * (land ? 0.41 : 0.38), t('atTable', { names: net.seats.map((s) => s.name).join(' · ') }), { size: 28, color: '#f3f2f2', wrap: width - 80 });
    } else if (net.peerName) txt(this, width / 2, height * (land ? 0.41 : 0.38), t('vs', { name: net.peerName }), { size: 34, color: '#f3f2f2' });

    if (net.isHost) {
      const play = new Button(this, width / 2, height * (land ? 0.56 : 0.52), t('play'), () => this.startGame(), { width: 380, height: 110, size: 40 });
      this.tweens.add({ targets: play, scale: 1.05, duration: 600, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
      const kb = this.input.keyboard;
      kb?.once('keydown-ENTER', () => this.startGame());
      kb?.once('keydown-SPACE', () => this.startGame());
    } else {
      const wait = txt(this, width / 2, height * (land ? 0.56 : 0.52), t('waitHost'), { size: 32, color: '#f3f2f2', wrap: width - 120 });
      this.tweens.add({ targets: wait, alpha: 0.35, duration: 700, yoyo: true, repeat: -1 });
      const begin = (d: { seed?: number; starter?: number } | undefined) => {
        net.applyStart(d);
        this.scene.start('Play');
      };
      net.onScene(this, '__start', begin);
      const early = net.takePendingStart();
      if (early) this.time.delayedCall(0, () => begin(early));
    }
    const howY = height * (land ? 0.7 : 0.66);
    txt(this, width / 2, howY, t('howTo'), { title: true, size: 18, color: '#ff4fa3' });
    const how = txt(this, width / 2, howY + 24, loc(def.meta.howTo), { size: land ? 22 : 26, wrap: width - (land ? 300 : 100), color: '#f3f2f2' }).setOrigin(0.5, 0);
    fitAbove(how, height - BOTTOM_ROW_TOP);
    soundButton(this, 60, height - 60);
    brandLogo(this, width / 2, height - 60, how.y + how.height);
    if (def.crt !== false) addCrt(this);
    // Protocol 2.7: the table's host changed; the new host gets PLAY, everyone else waits.
    net.onHostChange(this, () => {
      if (this.scene.isActive()) this.scene.restart();
    });
  }

  /**
   * Two-segment Easy | Normal switch. Tap a segment, or Left/Right on the keyboard. The selected
   * segment carries a bright knob that slides across; in Easy a caption says the run is not ranked.
   */
  private difficultyToggle(x: number, y: number): void {
    const SEG = 160, H = 80, W = SEG * 2, modern = isModern();
    const KNOB: Record<Difficulty, number> = { easy: COLORS.green, normal: COLORS.yellow };
    const bg = modern
      ? this.add.graphics().fillStyle(0x000000, 0.28).fillRoundedRect(x - W / 2, y - H / 2 + 6, W, H, H / 2)
        .fillStyle(0x0b1020, 0.72).fillRoundedRect(x - W / 2, y - H / 2, W, H, H / 2)
        .lineStyle(2, 0xffffff, 0.35).strokeRoundedRect(x - W / 2, y - H / 2, W, H, H / 2)
      : this.add.graphics().fillStyle(0x000000, 0.55).fillRect(x - W / 2, y - H / 2 + 6, W, H)
        .fillStyle(0x16141c, 0.92).fillRect(x - W / 2, y - H / 2, W, H)
        .lineStyle(4, 0xffffff, 0.8).strokeRect(x - W / 2, y - H / 2, W, H);
    const knob = this.add.graphics({ x: x - SEG / 2, y });
    const drawKnob = (d: Difficulty) => {
      knob.clear();
      const w = SEG - 12, h = H - 12;
      if (modern) {
        knob.fillStyle(KNOB[d], 1).fillRoundedRect(-w / 2, -h / 2, w, h, h / 2);
        knob.fillStyle(0xffffff, 0.3).fillRoundedRect(-w / 2 + 6, -h / 2 + 4, w - 12, h * 0.4, { tl: h / 2 - 6, tr: h / 2 - 6, bl: 6, br: 6 });
      } else {
        knob.fillStyle(KNOB[d], 1).fillRect(-w / 2, -h / 2, w, h).lineStyle(4, 0x000000, 1).strokeRect(-w / 2, -h / 2, w, h);
        knob.fillStyle(0xffffff, 0.35).fillRect(-w / 2 + 6, -h / 2 + 6, w - 12, 5);
      }
    };
    const labels: Record<Difficulty, Phaser.GameObjects.Text> = {
      easy: txt(this, x - SEG / 2, y + 2, t('diffEasy'), { title: true, size: 20, strokeThickness: 0, shadow: false }),
      normal: txt(this, x + SEG / 2, y + 2, t('diffNormal'), { title: true, size: 20, strokeThickness: 0, shadow: false }),
    };
    const note = txt(this, x, y + H / 2 + 24, t('diffEasyNote'), { size: 22, color: '#5dff7a' });
    const segX = (d: Difficulty) => (d === 'easy' ? x - SEG / 2 : x + SEG / 2);
    this.difficultyHit = { easy: { x: segX('easy'), y }, normal: { x: segX('normal'), y } };

    let cur = difficulty();
    const show = (animate: boolean) => {
      drawKnob(cur);
      this.tweens.killTweensOf(knob);
      if (animate) this.tweens.add({ targets: knob, x: segX(cur), duration: 180, ease: 'Back.easeOut' });
      else knob.x = segX(cur);
      for (const d of ['easy', 'normal'] as Difficulty[]) labels[d].setColor(d === cur ? '#14121c' : '#b9b6cc');
      note.setVisible(cur === 'easy');
      if (animate) this.tweens.add({ targets: labels[cur], scale: { from: 1.25, to: 1 }, duration: 220, ease: 'Back.easeOut' });
    };
    const choose = (d: Difficulty) => {
      if (d === cur || !this.scene.isActive()) return;
      cur = d;
      setDifficulty(d);
      playSfx(this, 'ui-click');
      show(true);
    };
    for (const d of ['easy', 'normal'] as Difficulty[]) {
      this.add.zone(segX(d), y, SEG, H).setInteractive({ useHandCursor: true }).on('pointerup', () => choose(d));
    }
    bg.setDepth(1); knob.setDepth(2); labels.easy.setDepth(3); labels.normal.setDepth(3); note.setDepth(3);
    const kb = this.input.keyboard;
    kb?.on('keydown-LEFT', () => choose('easy'));
    kb?.on('keydown-RIGHT', () => choose('normal'));
    show(false);
  }

  private languageToggle(width: number, height: number): void {
    const label = getLang() === 'tr' ? 'TR' : 'EN';
    let langBtn: Phaser.GameObjects.Container;
    if (isModern()) {
      // the same frosted glass as the sound button next to it
      langBtn = hudChip(this, width - 70, height - 60, { align: 'center', text: label, size: 24, height: 72, minWidth: 100, depth: 0 });
    } else {
      langBtn = this.add.container(width - 70, height - 60);
      const lb = this.add.rectangle(0, 0, 100, 72, 0x000000, 0.45).setStrokeStyle(4, 0xffffff, 0.8);
      const lt = txt(this, 0, 2, label, { title: true, size: 24, strokeThickness: 0, shadow: false });
      langBtn.add([lb, lt]);
    }
    langBtn.setSize(100, 72).setInteractive({ useHandCursor: true });
    langBtn.on('pointerup', () => {
      playSfx(this, 'ui-click');
      setLang(getLang() === 'tr' ? 'en' : 'tr');
      this.scene.restart();
    });
  }

  private startGame(): void {
    if (!this.scene.isActive()) return;
    playSfx(this, 'ui-select');
    if (net.active) startOnlineRound(this);
    else this.scene.start('Play');
  }
}

/**
 * Host only: picks a fresh shared seed and the round's starter (the turn-order rule in net.ts),
 * tells the guest and starts the round on both sides.
 */
export function startOnlineRound(scene: Phaser.Scene): void {
  const start = { seed: Math.floor(Math.random() * 2 ** 31), starter: net.nextStarter };
  net.applyStart(start);
  net.send('__start', start);
  scene.scene.stop('GameOver');
  const play = scene.scene.get('Play');
  if (play.scene.isActive() || play.scene.isPaused()) play.scene.restart();
  else scene.scene.start('Play');
}

export class PauseScene extends Phaser.Scene {
  constructor() {
    super('Pause');
  }

  create(): void {
    const { width, height } = this.scale;
    const land = currentGame().meta.orientation === 'landscape';
    const top = height * (land ? 0.36 : 0.45), gap = land ? 118 : 140;
    backdrop(this, 0.75);
    if (land) overlayCard(this, 0.05, 0.8, 560);
    else overlayCard(this, 0.21, 0.82);
    txt(this, width / 2, height * (land ? 0.14 : 0.28), t('paused'), { title: true, size: 44, color: '#ffd23f' });
    duckMusic();
    const resume = () => {
      restoreMusic();
      this.scene.stop();
      this.scene.resume('Play');
      sdk.emit('resume');
    };
    new Button(this, width / 2, top, t('resume'), resume, { color: COLORS.red });
    new Button(this, width / 2, top + gap, t('retry'), () => {
      sdk.gameplayStop();
      this.scene.stop();
      this.scene.get('Play').scene.restart();
    }, { color: COLORS.purple });
    new Button(this, width / 2, top + gap * 2, t('menu'), () => {
      sdk.gameplayStop();
      this.scene.stop('Play');
      this.scene.start('Menu');
    }, { color: 0x333344 });
    soundButton(this, land ? width - 70 : width / 2, land ? height - 70 : top + gap * 2 + 130);
    this.input.keyboard?.once('keydown-ESC', resume);
    this.input.keyboard?.once('keydown-P', resume);
  }
}

export interface ResultData {
  score: number;
  win?: boolean;
  title?: string;
}

export class GameOverScene extends Phaser.Scene {
  /** Where the ad button (continue or 2× reward) is, in world coordinates; read by the test harnesses. */
  adHit: { placement: 'continue' | 'double'; x: number; y: number } | null = null;
  /** Where the MENU button is (world coordinates); read by the test harnesses. */
  menuHit: { x: number; y: number } | null = null;

  constructor() {
    super('GameOver');
  }

  create(data: ResultData): void {
    duckMusic();
    const def = currentGame();
    const { width, height } = this.scale;
    const score = data.score ?? 0;
    this.adHit = null;
    this.menuHit = null;
    if (net.active) {
      this.onlineResult(data);
      return;
    }
    // Rewarded continue (src/core/ads.ts): a lost run of a game that opts in, once per run, only
    // while the platform has ads on. The run is not over yet for the platform, so GHA_END (and
    // the local best) wait until the player turns the offer down; a continued run reports
    // `continues: 1` when it ends.
    const play = this.scene.get('Play') as Phaser.Scene & { continueRun?: () => void };
    const run = { score, win: !!data.win };
    const offerContinue = !data.win && !!def.ads?.continue && typeof play?.continueRun === 'function'
      && sdk.continues === 0 && (def.ads.canContinue?.(play) ?? true) && adsAvailable();
    const offerDouble = !offerContinue && !!def.ads?.double && (def.ads.double.show?.(run) ?? true) && adsAvailable();
    // Easy runs are practice: the best (like the platform's leaderboard) counts Normal runs only.
    const easy = isEasy();
    const newBest = !easy && (offerContinue ? score > getBest(def.meta.id) : submitBest(def.meta.id, score));
    const best = offerContinue && newBest ? score : getBest(def.meta.id);
    let ended = false;
    const finish = () => {
      if (ended) return;
      ended = true;
      if (offerContinue && !easy) submitBest(def.meta.id, score);
      sdk.end(score, !!data.win, difficulty());
      if (newBest && score > 0) sdk.celebrate();
    };
    if (!offerContinue) finish();
    sdk.emit('gameOver', { score, best, win: !!data.win, newBest, difficulty: difficulty(), continueOffered: offerContinue, continues: sdk.continues });

    backdrop(this, 0.78);
    if (def.meta.orientation === 'landscape') overlayCard(this, 0.07, 0.93, 900);
    else overlayCard(this, 0.14, 0.84);
    const heading = data.title ?? (data.win ? t('youWin') : t('gameOver'));
    const h = txt(this, width / 2, height * 0.22, heading, {
      title: true, size: 46, color: data.win ? '#5dff7a' : '#ec3013', wrap: width - 60, strokeThickness: 10,
    });
    h.setScale(0.2);
    this.tweens.add({ targets: h, scale: 1, duration: 450, ease: 'Back.easeOut' });
    if (easy) easyTag(this, width / 2, h.y - h.height / 2 - 26);

    txt(this, width / 2, height * 0.34, t('score'), { title: true, size: 22, color: '#f3f2f2' });
    const sc = txt(this, width / 2, height * 0.34 + 60, '0', { title: true, size: 56, color: '#ffd23f' });
    this.tweens.addCounter({ from: 0, to: score, duration: Math.min(1200, 200 + score * 4), onUpdate: (tw) => sc.setText(String(Math.round(tw.getValue() ?? 0))) });
    txt(this, width / 2, height * 0.34 + 130, `${t('best')}: ${best}`, { title: true, size: 22, color: '#3ee6ff' });

    if (newBest && score > 0) {
      const nb = txt(this, width / 2, height * 0.34 + 185, t('newBest'), { title: true, size: 28, color: '#ff4fa3' });
      this.tweens.add({ targets: nb, alpha: 0.2, duration: 300, yoyo: true, repeat: -1 });
      this.time.delayedCall(300, () => burst(this, width / 2, height * 0.34 + 60, [0xffd23f, 0xff4fa3, 0x3ee6ff], 40, 420));
      playSfx(this, 'jingle-best', { exact: true });
    } else {
      playSfx(this, data.win ? 'jingle-win' : 'jingle-over', { exact: true });
    }

    // Leaving the result screen: an interstitial may come first ('menu', or 'replay' on every Nth
    // retry). With ads off nothing waits.
    let leaving = false;
    const leave = (placement: 'menu' | 'replay' | null, go: () => void) => {
      if (leaving || adBusy() || !this.scene.isActive()) return;
      finish();
      if (!placement || !adsAvailable()) {
        go();
        return;
      }
      leaving = true;
      showInterstitial(placement, this).then(() => {
        if (this.scene.isActive()) go();
      });
    };
    const retry = () => leave(++replays % REPLAY_INTERSTITIAL_EVERY === 0 ? 'replay' : null, () => {
      this.scene.stop();
      this.scene.get('Play').scene.restart();
    });
    const toMenu = () => leave('menu', () => {
      this.scene.stop('Play');
      this.scene.start('Menu');
    });

    const land = def.meta.orientation === 'landscape';
    const offer = offerContinue ? 'continue' : offerDouble ? 'double' : null;
    if (!offer) {
      // Landscape has no room for two stacked buttons below the score: put them side by side.
      const by = height * (land ? 0.8 : 0.66);
      new Button(this, land ? width / 2 - 210 : width / 2, by, t('retry'), retry, { color: COLORS.red, width: 380, height: 104, size: 34 });
      new Button(this, land ? width / 2 + 210 : width / 2, land ? by : by + 140, t('menu'), toMenu, { color: 0x333344 });
      this.menuHit = { x: land ? width / 2 + 210 : width / 2, y: land ? by : by + 140 };
    } else {
      // With an ad offer: portrait puts it under the score with RETRY and MENU side by side below;
      // landscape has the three in one row, the offer in the middle.
      const ay = height * (land ? 0.765 : 0.6);
      const ry = land ? ay : height * 0.75;
      const side = land ? 300 : 158;
      const bw = land ? 270 : 296;
      new Button(this, width / 2 - side, ry, t('retry'), retry, { color: COLORS.red, width: bw, height: 96, size: 30 });
      new Button(this, width / 2 + side, ry, t('menu'), toMenu, { color: 0x333344, width: bw, height: 96, size: 30 });
      this.menuHit = { x: width / 2 + side, y: ry };
      this.adOffer(offer, width / 2, ay, land ? 300 : 460, run, () => {
        // the continue: the run goes on in the same score session
        sdk.markContinue();
        ended = true;
        this.scene.stop();
        play.continueRun?.();
      });
    }
    this.time.delayedCall(400, () => this.input.keyboard?.once('keydown-ENTER', retry));
  }

  /**
   * The rewarded-ad button: green, with an "AD" tag on its corner and a line under it saying what
   * the ad is for. Tap it (or press C) to watch; it is offered once and goes away afterwards.
   */
  private adOffer(placement: 'continue' | 'double', x: number, y: number, w: number, run: { score: number; win: boolean }, onContinue: () => void): void {
    const modern = isModern();
    const label = placement === 'continue' ? t('adContinue') : t('adDouble');
    const note = txt(this, x, y + 80, placement === 'continue' ? t('adContinueNote') : t('adDoubleNote'), { size: 24, color: '#d6f5dc', wrap: w + 140 });
    let used = false;
    const watch = async () => {
      if (used || adBusy() || !this.scene.isActive()) return;
      used = true;
      this.tweens.killTweensOf(btn);
      const rewarded = await showRewarded(placement, this);
      if (!this.scene.isActive()) return;
      if (rewarded && placement === 'continue') {
        onContinue();
        return;
      }
      this.adHit = null;
      btn.destroy();
      if (rewarded) {
        currentGame().ads?.double?.grant(this, run);
        note.setText(t('adDoubled')).setColor('#5dff7a').setFontSize(30);
        burst(this, x, y, [0x5dff7a, 0xffd23f, 0xffffff], 40, 420);
        playSfx(this, 'jingle-win', { exact: true });
      } else {
        note.setText(t('adFailed')).setColor('#b9b6cc');
      }
      this.tweens.add({ targets: note, y: y, duration: 260, ease: 'Back.easeOut' });
    };
    const btn = new Button(this, x, y, label, () => void watch(), { color: COLORS.green, textColor: '#10301a', width: w, height: 110, size: placement === 'continue' ? 32 : 30 });
    // the "AD" tag: a small play-button pill on the button's top-left corner
    const tagText = txt(this, 0, 1, t('adBadge'), { title: true, size: 13, color: '#14121c', strokeThickness: 0, shadow: false });
    const tw = tagText.width + 46, th = 30;
    const tag = this.add.graphics();
    if (modern) tag.fillStyle(0x000000, 0.25).fillRoundedRect(-tw / 2, -th / 2 + 3, tw, th, th / 2).fillStyle(COLORS.yellow, 1).fillRoundedRect(-tw / 2, -th / 2, tw, th, th / 2);
    else tag.fillStyle(COLORS.yellow, 1).fillRect(-tw / 2, -th / 2, tw, th).lineStyle(3, 0x000000, 1).strokeRect(-tw / 2, -th / 2, tw, th);
    tag.fillStyle(0x14121c, 1).fillTriangle(-tw / 2 + 12, -7, -tw / 2 + 12, 7, -tw / 2 + 24, 0);
    tagText.setX(9);
    const badge = this.add.container(-w / 2 + tw / 2 - 6, -55, [tag, tagText]).setAngle(-6);
    btn.add(badge);
    this.tweens.add({ targets: btn, scale: 1.05, duration: 560, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    this.adHit = { placement, x, y };
    this.time.delayedCall(400, () => this.input.keyboard?.once('keydown-C', () => void watch()));
  }

  /**
   * Online result: no personal best (the platform keeps match scores off the leaderboards).
   * The host offers a rematch (new round on both sides) or the menu; the guest follows.
   */
  private onlineResult(data: ResultData): void {
    const def = currentGame();
    const { width, height } = this.scale;
    const land = def.meta.orientation === 'landscape';
    sdk.end(data.score ?? 0, !!data.win, difficulty());
    sdk.emit('gameOver', { score: data.score ?? 0, win: !!data.win, online: true, difficulty: difficulty() });
    backdrop(this, 0.78);
    if (land) overlayCard(this, 0.1, 0.92, 760);
    else overlayCard(this, 0.17, 0.8);
    const heading = data.title ?? (data.win ? t('youWin') : t('youLose'));
    const color = data.win ? '#5dff7a' : data.title === t('draw') ? '#ffd23f' : '#ec3013';
    const h = txt(this, width / 2, height * 0.26, heading, { title: true, size: 46, color, wrap: width - 60, strokeThickness: 10 });
    h.setScale(0.2);
    this.tweens.add({ targets: h, scale: 1, duration: 450, ease: 'Back.easeOut' });
    if (data.win) this.time.delayedCall(300, () => burst(this, width / 2, height * 0.26, [0xffd23f, 0xff4fa3, 0x3ee6ff], 40, 420));
    playSfx(this, data.win ? 'jingle-win' : 'jingle-over', { exact: true });
    if (net.isTable) {
      // A table game decides who starts each hand itself.
      txt(this, width / 2, height * 0.4, t('atTable', { names: net.seats.map((s) => s.name).join(' · ') }), { size: 26, color: '#f3f2f2', wrap: width - 80 });
    } else {
      if (net.peerName) txt(this, width / 2, height * 0.38, t('vs', { name: net.peerName }), { size: 30, color: '#f3f2f2' });
      const first = net.nextStarter === net.seat ? t('you') : net.peerName || t('opponent');
      txt(this, width / 2, height * 0.44, t('nextFirst', { name: first }), { size: 26, color: '#3ee6ff', wrap: width - 80 });
    }

    const by = height * (land ? 0.6 : 0.56);
    // The host's choices (or the guest's wait), drawn again when a table's host changes.
    let controls: Phaser.GameObjects.GameObject[] = [];
    const rematch = () => {
      if (net.isHost && this.scene.isActive()) startOnlineRound(this);
    };
    this.time.delayedCall(400, () => this.input.keyboard?.on('keydown-ENTER', rematch));
    const drawControls = () => {
      for (const o of controls) o.destroy();
      controls = [];
      if (net.isHost) {
        controls.push(new Button(this, width / 2, by, t('rematch'), rematch, { color: COLORS.red, width: 380, height: 104, size: 34 }));
        controls.push(new Button(this, width / 2, by + 140, t('menu'), () => {
          net.send('__menu');
          this.scene.stop('Play');
          this.scene.start('Menu');
        }, { color: 0x333344 }));
      } else {
        const wait = txt(this, width / 2, by, t('waitHost'), { size: 30, color: '#f3f2f2', wrap: width - 120 });
        this.tweens.add({ targets: wait, alpha: 0.35, duration: 700, yoyo: true, repeat: -1 });
        controls.push(wait);
      }
    };
    drawControls();
    net.onHostChange(this, drawControls);
    // The guest follows the host: a rematch restarts Play, "menu" goes back to the menu.
    net.onScene(this, '__start', (d: { seed?: number; starter?: number } | undefined) => {
      if (net.isHost) return;
      net.applyStart(d);
      this.scene.stop();
      this.scene.get('Play').scene.restart();
    });
    net.onScene(this, '__menu', () => {
      if (net.isHost) return;
      this.scene.stop('Play');
      this.scene.start('Menu');
    });
  }
}

/** Small "EASY" pill on the result screen of an Easy run. */
function easyTag(scene: Phaser.Scene, x: number, y: number): void {
  const label = txt(scene, 0, 1, t('diffEasy'), { title: true, size: 16, color: '#14121c', strokeThickness: 0, shadow: false });
  const w = label.width + 36, h = 34;
  const g = scene.add.graphics();
  if (isModern()) g.fillStyle(COLORS.green, 1).fillRoundedRect(-w / 2, -h / 2, w, h, h / 2);
  else g.fillStyle(COLORS.green, 1).fillRect(-w / 2, -h / 2, w, h).lineStyle(3, 0x000000, 1).strokeRect(-w / 2, -h / 2, w, h);
  const tag = scene.add.container(x, y, [g, label]);
  tag.setScale(0);
  scene.tweens.add({ targets: tag, scale: 1, duration: 320, delay: 250, ease: 'Back.easeOut' });
}

/** Distance from the bottom edge to the top of the menu's bottom row (sound, logo, language), plus a small gap. */
const BOTTOM_ROW_TOP = 100;

/** Shrinks a long text (a game's how-to) a step at a time until it ends above `limit`. */
function fitAbove(t: Phaser.GameObjects.Text, limit: number, min = 18): void {
  let size = parseInt(String(t.style.fontSize), 10);
  while (t.y + t.height > limit && size > min) t.setFontSize(--size);
}

/** Texture key of the Ayvago Games lockup (public/assets/ayvago/menu-logo.png). */
const LOGO = 'ayvago-logo';
/** The logo PNG is twice its on-screen size, with this much shadow room (texture px) on every side. */
const LOGO_PAD = 8;

/**
 * The Ayvago Games logo, centred at (x, y) on the bottom row of the menu between the sound and
 * the language/leaderboard buttons: the intro's lockup (built by tools/build-menu-logo.py) on a
 * dark plate that matches those buttons (the HUD glass in the modern style, a plain box in
 * retro), so the white art reads on light menus too. Drawn at exactly half the texture size with
 * linear filtering, which keeps it sharp in pixel-art games as well. When the text above ends
 * lower than `clearOf` allows (a long how-to on a landscape menu) the logo shrinks, its bottom
 * edge staying on the row. Not a link: games run sandboxed inside the platform.
 */
function brandLogo(scene: Phaser.Scene, x: number, y: number, clearOf = 0): Phaser.GameObjects.Container | null {
  if (!scene.textures.exists(LOGO)) return null;
  const tex = scene.textures.get(LOGO);
  tex.setFilter(Phaser.Textures.FilterMode.LINEAR);
  const H0 = 72, bottom = y + H0 / 2;
  // a text's box already ends a few px under its last line
  const k = Phaser.Math.Clamp((bottom - (clearOf + 4)) / H0, 0.7, 1);
  const H = Math.round(H0 * k);
  y = bottom - H / 2;
  const img = scene.add.image(0, 0, LOGO).setScale(0.5 * k);
  // the visible ink, without the shadow room, sets the plate's width
  const inkW = Math.round(((tex.source[0].width - LOGO_PAD * 2) / 2) * k);
  if (isModern()) {
    // the brand ink under the glass deepens it, so the white art also holds on a bright sky
    const under = scene.add.graphics();
    img.setData('chipWidth', inkW);
    const chip = hudChip(scene, x, y, { align: 'center', height: H, depth: 0, items: [img] });
    under.fillStyle(COLORS.ink, 0.45).fillRoundedRect(x - chip.chipWidth / 2, y - H / 2, chip.chipWidth, H, H / 2);
    return chip;
  }
  const w = inkW + Math.round(28 * k);
  const c = scene.add.container(x, y);
  c.add([scene.add.rectangle(0, 0, w, H, 0x000000, 0.6).setStrokeStyle(4, 0xffffff, 0.8), img]);
  return c;
}

/**
 * The sound toggle on the menu, pause and result screens. Its icon follows the one sound switch,
 * also when the platform's toolbar button changes it.
 */
function soundButton(scene: Phaser.Scene, x: number, y: number): Phaser.GameObjects.Container {
  const icon = () => (isMuted() ? 'icon-audiooff' : 'icon-audioon');
  const snd = iconButton(scene, x, y, icon(), () => setMuted(scene.game, !isMuted()));
  const off = onMuteChange(() => (snd.getData('icon') as Phaser.GameObjects.Image).setTexture(icon()));
  scene.events.once(Phaser.Scenes.Events.SHUTDOWN, off);
  return snd;
}

