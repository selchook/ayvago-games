// Sushi Rush: the menu's RECIPES and CARDS screens, in a scene of their own over the paused menu
// (so the menu's keys, Enter to play and ←/→ for the difficulty, wait while they are open).
import Phaser from 'phaser';
import { playSfx } from '@core';
import { RecipeScreen, CardListScreen, type Panel } from './screens';

export class BookScene extends Phaser.Scene {
  private panel: Panel | null = null;
  private from = 'Menu';

  constructor() { super('Book'); }

  create(data: { which: 'recipes' | 'cards'; from?: string }): void {
    this.from = data.from ?? 'Menu';
    const host = { sfx: (k: string, v?: number) => playSfx(this, k, { volume: v ?? 0.5 }), touch: this.sys.game.device.input.touch };
    this.panel = data.which === 'cards' ? new CardListScreen(this, host) : new RecipeScreen(this, host);
    this.panel.onClose = () => this.time.delayedCall(140, () => this.leave());
    this.input.keyboard?.on('keydown', (e: KeyboardEvent) => { if (this.panel && !this.panel.closed) this.panel.key(e.code); });
  }

  private leave(): void {
    const from = this.scene.get(this.from);
    this.scene.stop();
    if (from && this.scene.isPaused(this.from)) from.scene.resume();
    from?.events.emit('book-closed');
  }
}
