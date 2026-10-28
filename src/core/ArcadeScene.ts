import Phaser from 'phaser';
import { Hud, iconButton } from './ui';
import { t } from './i18n';
import { sdk } from './sdk';
import { net } from './net';
import { playSfx, type SfxConfig } from './audio';
import { addCrt, popup } from './fx';
import { currentGame } from './registry';

export interface EndOptions {
  win?: boolean;
  /** Override the title shown on the result screen (already translated). */
  title?: string;
  delay?: number;
}

/**
 * Base class for every game's play scene (scene key must be 'Play').
 * Implement `createGame()` and `updateGame(time, delta)`; the base handles HUD, score,
 * pause (button / Esc / P / tab hidden / host command), CRT overlay and the result screen.
 */
export abstract class ArcadeScene extends Phaser.Scene {
  score = 0;
  hud!: Hud;
  isOver = false;
  /** Seconds since this round started (excluding pauses). */
  elapsed = 0;

  constructor(key = 'Play') {
    super(key);
  }

  abstract createGame(): void;
  abstract updateGame(time: number, delta: number): void;

  /** Set false in subclasses that draw their own HUD. */
  protected useHud = true;
  /** Set false to disable scanlines for this game. */
  protected useCrt = true;

  create(): void {
    this.score = 0;
    this.isOver = false;
    this.elapsed = 0;
    this.hud = new Hud(this, t('score'));
    this.createGame();
    this.hud.setVisible(this.useHud);
    if (this.useCrt && currentGame().crt !== false) addCrt(this);

    // An online match keeps running on both sides, so it has no pause.
    if (!net.active) {
      const pauseBtn = iconButton(this, this.scale.width - 52, 52, 'icon-pause', () => this.pauseGame(), 72);
      pauseBtn.setScrollFactor(0).setDepth(9600);
    } else {
      net.onPeerLeave(this, () => {
        this.notice(t('peerLeft'));
        if (!this.isOver) this.endGame({ win: true, title: t('peerLeft'), delay: 300 });
      });
      net.onPeerJoin(this, () => this.notice(t('peerBack')));
      // The host restarting or leaving while this side is still playing (guest only; once the
      // round is over the result screen handles it).
      if (!net.isHost) {
        net.onScene(this, '__start', (d: { seed?: number } | undefined) => {
          if (this.isOver) return;
          net.setSeed(d?.seed ?? 0);
          this.scene.restart();
        });
        net.onScene(this, '__menu', () => {
          if (!this.isOver) this.scene.start('Menu');
        });
      }
    }

    const kb = this.input.keyboard;
    kb?.on('keydown-ESC', () => this.pauseGame());
    kb?.on('keydown-P', () => this.pauseGame());
    const onHidden = () => {
      if (document.hidden) this.pauseGame();
    };
    document.addEventListener('visibilitychange', onHidden);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => document.removeEventListener('visibilitychange', onHidden));

    sdk.gameplayStart();
    sdk.emit('start');
  }

  update(time: number, delta: number): void {
    if (this.isOver) return;
    const d = Math.min(delta, 50);   // clamp long frames (tab switch, GC)
    this.elapsed += d / 1000;
    this.updateGame(time, d);
  }

  addScore(n: number, x?: number, y?: number): void {
    if (this.isOver) return;
    this.score = Math.max(0, this.score + n);
    this.hud.setScore(this.score);
    if (x !== undefined && y !== undefined && n !== 0) popup(this, x, y, (n > 0 ? '+' : '') + n);
  }

  setScore(n: number): void {
    this.score = n;
    this.hud.setScore(n);
  }

  pauseGame(): void {
    if (this.isOver || !this.scene.isActive() || net.active) return;
    this.scene.pause();
    this.scene.launch('Pause');
    sdk.emit('pause');
  }

  /** Short message across the top of the screen (online events such as the opponent leaving). */
  notice(message: string): void {
    const text = this.add.text(this.scale.width / 2, 140, message, {
      fontFamily: '"Pixelify Sans", sans-serif', fontSize: '34px', color: '#ffd23f', stroke: '#000', strokeThickness: 6,
    }).setOrigin(0.5).setScrollFactor(0).setDepth(9700);
    this.tweens.add({ targets: text, alpha: 0, delay: 2200, duration: 500, onComplete: () => text.destroy() });
  }

  sfx(key: string, config?: SfxConfig): void {
    playSfx(this, key, config);
  }

  /** Like sfx(), panned to where it happens on screen (world x). */
  sfxAt(key: string, x: number, config?: SfxConfig): void {
    playSfx(this, key, { ...config, x });
  }

  /** Ends the round and shows the result overlay (score saving is handled there). */
  endGame(o: EndOptions = {}): void {
    if (this.isOver) return;
    this.isOver = true;
    this.physics?.world?.pause();
    this.time.delayedCall(o.delay ?? 600, () => {
      this.scene.pause();
      this.scene.launch('GameOver', { score: this.score, win: !!o.win, title: o.title });
    });
  }
}
