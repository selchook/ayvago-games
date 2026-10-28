import Phaser from 'phaser';
import { FONT_TITLE, FONT_BODY } from '@core';

// Same look as @core txt()/popup(), but font metrics are measured once per font+size and reused.
// Phaser otherwise re-measures every new Text with a canvas read-back, which stalls badly on
// software-rendered / busy devices when a scene creates many labels at once.
type Metrics = Phaser.Types.GameObjects.Text.TextMetrics;
const cache: Record<string, Metrics> = {};

export interface FStyle {
  size?: number; color?: string; title?: boolean; align?: 'left' | 'center' | 'right';
  stroke?: string; strokeThickness?: number; wrap?: number; shadow?: boolean;
}

export function ftxt(scene: Phaser.Scene, x: number, y: number, s: string, st: FStyle = {}): Phaser.GameObjects.Text {
  const fontFamily = st.title ? FONT_TITLE : FONT_BODY;
  const size = st.size ?? 32;
  const key = fontFamily + size;
  const t = scene.add.text(x, y, s, {
    fontFamily, fontSize: `${size}px`, color: st.color ?? '#f3f2f2', align: st.align ?? 'center',
    stroke: st.stroke ?? '#000000', strokeThickness: st.strokeThickness ?? (st.title ? 6 : 4),
    wordWrap: st.wrap ? { width: st.wrap, useAdvancedWrap: true } : undefined,
    lineSpacing: st.title ? 12 : 4, metrics: cache[key],
  } as Phaser.Types.GameObjects.Text.TextStyle);
  if (!cache[key]) cache[key] = t.style.getTextMetrics();
  t.setOrigin(0.5);
  if (st.shadow !== false) t.setShadow(0, st.title ? 6 : 3, '#000000', 0, true, true);
  return t;
}

/** Floating "+10" popup (cached metrics). */
export function fpopup(scene: Phaser.Scene, x: number, y: number, s: string, color = '#ffd23f', size = 28): void {
  const t = ftxt(scene, x, y, s, { title: true, size, color, strokeThickness: 5, shadow: false }).setDepth(6000);
  scene.tweens.add({ targets: t, y: y - 70, alpha: 0, duration: 700, ease: 'Cubic.easeOut', onComplete: () => t.destroy() });
}

/** Measure the given [size, title] combos ahead of time (call from menuDecor). */
export function warmText(scene: Phaser.Scene, combos: Array<[number, boolean]>): void {
  for (const [size, title] of combos) ftxt(scene, -500, -500, 'Ag', { size, title }).destroy();
}

/**
 * Phaser re-uses Text canvases from a global pool, and a canvas that previously held a big label
 * may have been promoted to a GPU-backed canvas; creating a Text on it does a pixel read-back that
 * can block for seconds on software-GL devices. Park the free pooled canvases while this scene runs
 * so its labels get fresh, small canvases; they are released again on shutdown.
 */
export function freshTextCanvases(scene: Phaser.Scene): void {
  const pool = Phaser.Display.Canvas.CanvasPool;
  const owner = {};
  for (let i = pool.free(); i > 0; i--) pool.create2D(owner, 1, 1);
  scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => pool.remove(owner));
}

/** Semi-transparent full-screen flash (the camera flash starts fully opaque). */
export function softFlash(scene: Phaser.Scene, color = 0xffffff, duration = 160, alpha = 0.3): void {
  const { width, height } = scene.scale;
  const r = scene.add.rectangle(0, 0, width, height, color, alpha).setOrigin(0).setScrollFactor(0).setDepth(8000);
  scene.tweens.add({ targets: r, alpha: 0, duration, onComplete: () => r.destroy() });
}
