import Phaser from 'phaser';
import { Hud, iconButton } from './ui';
import { t } from './i18n';
import { sdk } from './sdk';
import { playSfx } from './audio';
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

    const pauseBtn = iconButton(this, this.scale.width - 52, 52, 'icon-pause', () => this.pauseGame(), 72);
    pauseBtn.setScrollFactor(0).setDepth(9600);

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
    if (this.isOver || !this.scene.isActive()) return;
    this.scene.pause();
    this.scene.launch('Pause');
    sdk.emit('pause');
  }

  sfx(key: string, config?: Phaser.Types.Sound.SoundConfig): void {
    playSfx(this, key, config);
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
