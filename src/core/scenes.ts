import Phaser from 'phaser';
import { Button, backdrop, iconButton } from './ui';
import { t, loc, upper, getLang, setLang } from './i18n';
import { txt, COLORS } from './theme';
import { getBest, submitBest } from './storage';
import { isMuted, isSilenced, setMuted, playSfx } from './audio';
import { addCrt, burst } from './fx';
import { sdk } from './sdk';
import { net } from './net';
import { currentGame } from './registry';
import { kenney, loadSfx } from './assets';

let introDone: Promise<void> = Promise.resolve();
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
    sdk.emit('ready');
    this.scene.start('Menu');
  }
}

export class MenuScene extends Phaser.Scene {
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
    if (net.active) {
      this.onlineMenu();
      return;
    }

    const title = txt(this, width / 2, height * (land ? 0.2 : 0.22), upper(loc(meta.title)), {
      title: true, size: land ? 56 : 52, color: '#ffd23f', wrap: width - 80, strokeThickness: 10,
    });
    this.tweens.add({ targets: title, y: title.y - 12, duration: 1100, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });

    const best = getBest(meta.id);
    txt(this, width / 2, height * (land ? 0.36 : 0.36), `${t('best')}: ${best}`, { title: true, size: 22, color: '#3ee6ff' });

    const play = new Button(this, width / 2, height * (land ? 0.52 : 0.5), t('play'), () => this.startGame(), { width: 380, height: 110, size: 40 });
    this.tweens.add({ targets: play, scale: 1.05, duration: 600, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });

    const howY = height * (land ? 0.68 : 0.64);
    txt(this, width / 2, howY, t('howTo'), { title: true, size: 18, color: '#ff4fa3' });
    txt(this, width / 2, howY + 24, loc(meta.howTo), { size: 28, wrap: width - (land ? 360 : 100), color: '#f3f2f2' }).setOrigin(0.5, 0);

    // sound + language toggles
    const snd = iconButton(this, 60, height - 60, isMuted() ? 'icon-audiooff' : 'icon-audioon', () => {
      setMuted(this.game, !isMuted());
      (snd.getData('icon') as Phaser.GameObjects.Image).setTexture(isMuted() ? 'icon-audiooff' : 'icon-audioon');
    });
    if (sdk.embedded) {
      // Inside Ayvago the platform owns the locale; offer its leaderboard instead.
      iconButton(this, width - 60, height - 60, 'icon-trophy', () => sdk.openLeaderboard());
    } else this.languageToggle(width, height);

    txt(this, width / 2, height - 60, 'AYVAGO GAMES', { title: true, size: 14, color: '#ec3013', strokeThickness: 4 });
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
    if (net.peerName) txt(this, width / 2, height * (land ? 0.41 : 0.38), t('vs', { name: net.peerName }), { size: 34, color: '#f3f2f2' });

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
    txt(this, width / 2, howY + 24, loc(def.meta.howTo), { size: 26, wrap: width - (land ? 360 : 100), color: '#f3f2f2' }).setOrigin(0.5, 0);
    const snd = iconButton(this, 60, height - 60, isMuted() ? 'icon-audiooff' : 'icon-audioon', () => {
      setMuted(this.game, !isMuted());
      (snd.getData('icon') as Phaser.GameObjects.Image).setTexture(isMuted() ? 'icon-audiooff' : 'icon-audioon');
    });
    if (def.crt !== false) addCrt(this);
  }

  private languageToggle(width: number, height: number): void {
    const langBtn = this.add.container(width - 70, height - 60);
    const lb = this.add.rectangle(0, 0, 100, 72, 0x000000, 0.45).setStrokeStyle(4, 0xffffff, 0.8);
    const lt = txt(this, 0, 2, getLang() === 'tr' ? 'TR' : 'EN', { title: true, size: 24, strokeThickness: 0, shadow: false });
    langBtn.add([lb, lt]).setSize(100, 72).setInteractive({ useHandCursor: true });
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
    txt(this, width / 2, height * (land ? 0.14 : 0.28), t('paused'), { title: true, size: 44, color: '#ffd23f' });
    const resume = () => {
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
    const snd = iconButton(this, land ? width - 70 : width / 2, land ? height - 70 : top + gap * 2 + 130, isMuted() ? 'icon-audiooff' : 'icon-audioon', () => {
      setMuted(this.game, !isMuted());
      (snd.getData('icon') as Phaser.GameObjects.Image).setTexture(isMuted() ? 'icon-audiooff' : 'icon-audioon');
    });
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
  constructor() {
    super('GameOver');
  }

  create(data: ResultData): void {
    const def = currentGame();
    const { width, height } = this.scale;
    const score = data.score ?? 0;
    if (net.active) {
      this.onlineResult(data);
      return;
    }
    const newBest = submitBest(def.meta.id, score);
    const best = getBest(def.meta.id);
    sdk.end(score, !!data.win);
    if (newBest && score > 0) sdk.celebrate();
    sdk.emit('gameOver', { score, best, win: !!data.win, newBest });

    backdrop(this, 0.78);
    const heading = data.title ?? (data.win ? t('youWin') : t('gameOver'));
    const h = txt(this, width / 2, height * 0.22, heading, {
      title: true, size: 46, color: data.win ? '#5dff7a' : '#ec3013', wrap: width - 60, strokeThickness: 10,
    });
    h.setScale(0.2);
    this.tweens.add({ targets: h, scale: 1, duration: 450, ease: 'Back.easeOut' });

    txt(this, width / 2, height * 0.34, t('score'), { title: true, size: 22, color: '#f3f2f2' });
    const sc = txt(this, width / 2, height * 0.34 + 60, '0', { title: true, size: 56, color: '#ffd23f' });
    this.tweens.addCounter({ from: 0, to: score, duration: Math.min(1200, 200 + score * 4), onUpdate: (tw) => sc.setText(String(Math.round(tw.getValue() ?? 0))) });
    txt(this, width / 2, height * 0.34 + 130, `${t('best')}: ${best}`, { title: true, size: 22, color: '#3ee6ff' });

    if (newBest && score > 0) {
      const nb = txt(this, width / 2, height * 0.34 + 185, t('newBest'), { title: true, size: 28, color: '#ff4fa3' });
      this.tweens.add({ targets: nb, alpha: 0.2, duration: 300, yoyo: true, repeat: -1 });
      this.time.delayedCall(300, () => burst(this, width / 2, height * 0.34 + 60, [0xffd23f, 0xff4fa3, 0x3ee6ff], 40, 420));
      playSfx(this, 'jingle-best');
    } else {
      playSfx(this, data.win ? 'jingle-win' : 'jingle-over');
    }

    const retry = () => {
      this.scene.stop();
      this.scene.get('Play').scene.restart();
    };
    const by = height * (def.meta.orientation === 'landscape' ? 0.74 : 0.66);
    new Button(this, width / 2, by, t('retry'), retry, { color: COLORS.red, width: 380, height: 104, size: 34 });
    new Button(this, width / 2, by + 140, t('menu'), () => {
      this.scene.stop('Play');
      this.scene.start('Menu');
    }, { color: 0x333344 });
    this.time.delayedCall(400, () => this.input.keyboard?.once('keydown-ENTER', retry));
  }

  /**
   * Online result: no personal best (the platform keeps match scores off the leaderboards).
   * The host offers a rematch (new round on both sides) or the menu; the guest follows.
   */
  private onlineResult(data: ResultData): void {
    const def = currentGame();
    const { width, height } = this.scale;
    const land = def.meta.orientation === 'landscape';
    sdk.end(data.score ?? 0, !!data.win);
    sdk.emit('gameOver', { score: data.score ?? 0, win: !!data.win, online: true });
    backdrop(this, 0.78);
    const heading = data.title ?? (data.win ? t('youWin') : t('youLose'));
    const color = data.win ? '#5dff7a' : data.title === t('draw') ? '#ffd23f' : '#ec3013';
    const h = txt(this, width / 2, height * 0.26, heading, { title: true, size: 46, color, wrap: width - 60, strokeThickness: 10 });
    h.setScale(0.2);
    this.tweens.add({ targets: h, scale: 1, duration: 450, ease: 'Back.easeOut' });
    if (data.win) this.time.delayedCall(300, () => burst(this, width / 2, height * 0.26, [0xffd23f, 0xff4fa3, 0x3ee6ff], 40, 420));
    playSfx(this, data.win ? 'jingle-win' : 'jingle-over');
    if (net.peerName) txt(this, width / 2, height * 0.38, t('vs', { name: net.peerName }), { size: 30, color: '#f3f2f2' });
    const first = net.nextStarter === net.seat ? t('you') : net.peerName || t('opponent');
    txt(this, width / 2, height * 0.44, t('nextFirst', { name: first }), { size: 26, color: '#3ee6ff', wrap: width - 80 });

    const by = height * (land ? 0.6 : 0.56);
    if (net.isHost) {
      const rematch = () => startOnlineRound(this);
      new Button(this, width / 2, by, t('rematch'), rematch, { color: COLORS.red, width: 380, height: 104, size: 34 });
      new Button(this, width / 2, by + 140, t('menu'), () => {
        net.send('__menu');
        this.scene.stop('Play');
        this.scene.start('Menu');
      }, { color: 0x333344 });
      this.time.delayedCall(400, () => this.input.keyboard?.once('keydown-ENTER', rematch));
    } else {
      const wait = txt(this, width / 2, by, t('waitHost'), { size: 30, color: '#f3f2f2', wrap: width - 120 });
      this.tweens.add({ targets: wait, alpha: 0.35, duration: 700, yoyo: true, repeat: -1 });
    }
    // The guest follows the host: a rematch restarts Play, "menu" goes back to the menu.
    net.onScene(this, '__start', (d: { seed?: number; starter?: number } | undefined) => {
      net.applyStart(d);
      this.scene.stop();
      this.scene.get('Play').scene.restart();
    });
    net.onScene(this, '__menu', () => {
      this.scene.stop('Play');
      this.scene.start('Menu');
    });
  }
}
