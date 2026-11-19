// Neon Ronin: a scene for the inner screens opened over another scene: the Moves list (from the
// menu row and the pause) and the implant draft (a banked pick, from the pause). The scene under it
// is paused while it is open (its keys and timers stop) and resumed when it closes, so Enter on the
// menu or Esc on the pause never reaches them underneath.
import Phaser from 'phaser';
import { playSfx } from '@core';
import { MovesScreen, DraftScreen, type Panel, type ScreenHost } from './screens';
import { makeArt } from './art';
import { loadMeta } from './meta';
import type { CardId, AbilityId, Ranks } from './powers';

export type OverlayOpen =
  | { kind: 'moves'; abilities?: AbilityId[]; ranks?: Ranks }
  | { kind: 'draft'; offer: CardId[]; deal: () => CardId[]; onPick: (id: CardId) => void; onLater: () => void };
export type OverlayData = OverlayOpen & { from: string };

export const OVERLAY = 'NrOverlay';

/** Opens an inner screen over `scene` (paused until it closes). */
export function openOverlay(scene: Phaser.Scene, data: OverlayOpen): void {
  if (!scene.scene.isActive() || scene.scene.isActive(OVERLAY)) return;
  scene.scene.pause();
  scene.scene.launch(OVERLAY, { ...data, from: scene.scene.key });
  // drawn over the scene that opened it (the core's Pause comes later in the scene list)
  scene.scene.bringToTop(OVERLAY);
}

export class OverlayScene extends Phaser.Scene {
  private panel: Panel | null = null;

  constructor() { super(OVERLAY); }

  create(data: OverlayData): void {
    makeArt(this);
    const host: ScreenHost = { sfx: (k, v) => playSfx(this, k, { volume: v ?? 0.5, exact: true }), touch: this.sys.game.device.input.touch };
    let gone = false;
    const done = (): void => {
      if (gone) return;
      gone = true;
      // two frames later: the key that closed it (Esc) must not reach the scene under it too
      // (the pause would resume the game); counted in frames, not time, so slow devices wait no longer
      let frames = 0;
      const tick = (): void => {
        if (++frames < 2) return;
        this.events.off(Phaser.Scenes.Events.POST_UPDATE, tick);
        this.scene.resume(data.from);
        this.scene.get(data.from)?.events.emit('nr-overlay-closed');
        this.scene.stop();
      };
      this.events.on(Phaser.Scenes.Events.POST_UPDATE, tick);
    };
    if (data.kind === 'moves') {
      const m = loadMeta();
      this.panel = new MovesScreen(this, host, data.abilities ?? m.abilities, data.ranks ?? m.ranks, done);
    } else {
      this.panel = new DraftScreen(this, host, data.offer, data.deal, (id) => { data.onPick(id); done(); }, false, () => { data.onLater(); done(); });
    }
    this.input.keyboard?.on('keydown', (e: KeyboardEvent) => { if (this.panel?.key(e.code)) e.preventDefault(); });
  }
}
