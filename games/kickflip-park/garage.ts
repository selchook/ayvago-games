// Kickflip Park: the PARK & BOARD page, a scene of its own opened from the menu's button (B on the
// keyboard) over the menu, which waits under it so its keys do not start a session. It shows the
// session setup (setup.ts) in its 'garage' mode with a turntable in its own World3D: every open
// park and board picked there is saved at once (a locked one is only shown and can't be started),
// START skates the choice straight away and DONE (Esc, Backspace or B) goes back to the menu,
// which then skates the new park on the new board behind it.
import Phaser from 'phaser';
import { World3D } from '@core/three';
import { Setup } from './setup';
import { loadMeta, saveMeta, type Meta } from './meta';
import { makeIcons } from './art';

export class GarageScene extends Phaser.Scene {
  setup: Setup | null = null;
  private meta!: Meta;
  private from = 'Menu';
  private at = { park: '', board: '' };
  private closed = false;
  /** How long create() took (ms; a test hook for the open time). */
  openMs = 0;

  constructor() { super('Garage'); }

  create(data: { from?: string }): void {
    const t0 = performance.now();
    makeIcons(this);
    this.from = data?.from ?? 'Menu';
    this.closed = false;
    this.meta = loadMeta();
    this.at = { park: this.meta.park, board: this.meta.board };
    const world = new World3D(this, { fov: 30, near: 0.5, far: 60, background: null });
    // the page blocks the menu under it
    this.add.zone(0, 0, this.scale.width, this.scale.height).setOrigin(0).setInteractive().setDepth(-400);
    this.setup = new Setup(this, world, this.meta, () => this.startSession(), () => this.close(), { mode: 'garage' });
    this.input.keyboard?.on('keydown-B', () => this.setup?.dismiss());
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => { this.setup?.close(); this.setup = null; });
    this.openMs = performance.now() - t0;
  }

  /** The player has been here: PLAY no longer asks first. */
  private mark(): void {
    if (!this.meta.picked) { this.meta.picked = true; saveMeta(this.meta); }
  }

  /** START: the session begins at once with the choice (as PLAY on the menu would). */
  private startSession(): void {
    if (this.closed) return;
    this.closed = true;
    this.setup = null;
    this.mark();
    const menu = this.scene.get(this.from);
    this.scene.stop();
    menu.scene.start('Play');
  }

  /** DONE: back to the menu; a new park or board shows behind it (the menu restarts). */
  private close(): void {
    if (this.closed) return;
    this.closed = true;
    this.setup = null;
    this.mark();
    const menu = this.scene.get(this.from);
    this.scene.stop();
    this.scene.resume(this.from);
    if (this.meta.park !== this.at.park || this.meta.board !== this.at.board) menu.scene.restart();
    else menu.events.emit('garage-closed');
  }
}
