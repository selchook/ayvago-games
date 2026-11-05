import Phaser from 'phaser';
import { isModern } from './style';

const PX = '__ay_px';
const SCAN = '__ay_scan';
const DOT = '__ay_dot';

/** Soft round particle (modern style): a white disc that fades to transparent at the edge. */
function ensureDot(scene: Phaser.Scene): string {
  if (!scene.textures.exists(DOT)) {
    const c = scene.textures.createCanvas(DOT, 32, 32)!;
    const ctx = c.getContext();
    const g = ctx.createRadialGradient(16, 16, 0, 16, 16, 16);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.55, 'rgba(255,255,255,0.85)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 32, 32);
    c.refresh();
  }
  return DOT;
}

/** 1x1 white pixel texture for particles/rects; created once per game. */
export function ensurePixel(scene: Phaser.Scene): string {
  if (!scene.textures.exists(PX)) {
    const g = scene.make.graphics({ x: 0, y: 0 }, false);
    g.fillStyle(0xffffff).fillRect(0, 0, 4, 4);
    g.generateTexture(PX, 4, 4);
    g.destroy();
  }
  return PX;
}

/** Subtle CRT scanlines over the whole camera (retro style only; hidden in the modern style). */
export function addCrt(scene: Phaser.Scene, alpha = 0.12): Phaser.GameObjects.TileSprite {
  if (!scene.textures.exists(SCAN)) {
    const g = scene.make.graphics({ x: 0, y: 0 }, false);
    g.fillStyle(0x000000, 1).fillRect(0, 0, 4, 2);
    g.generateTexture(SCAN, 4, 4);
    g.destroy();
  }
  const { width, height } = scene.scale;
  return scene.add.tileSprite(0, 0, width, height, SCAN).setOrigin(0).setAlpha(alpha).setScrollFactor(0).setDepth(100000)
    .setVisible(!isModern());
}

/** Burst of particles at (x, y): square pixels in the retro style, soft dots in the modern one. */
export function burst(scene: Phaser.Scene, x: number, y: number, tint: number | number[] = 0xffffff, count = 16, speed = 260): void {
  const modern = isModern();
  const key = modern ? ensureDot(scene) : ensurePixel(scene);
  const em = scene.add.particles(x, y, key, {
    speed: { min: speed * 0.3, max: speed },
    angle: { min: 0, max: 360 },
    scale: modern ? { start: 0.55, end: 0 } : { start: 2.2, end: 0 },
    ...(modern ? { alpha: { start: 1, end: 0 }, blendMode: Phaser.BlendModes.ADD } : {}),
    lifespan: { min: 250, max: 650 },
    tint,
    emitting: false,
  });
  em.setDepth(5000);
  em.explode(count);
  scene.time.delayedCall(900, () => em.destroy());
}

export function shake(scene: Phaser.Scene, intensity = 0.01, duration = 150): void {
  scene.cameras.main.shake(duration, intensity);
}

/**
 * Screen flash as a semi-transparent overlay that fades out. Phaser's camera flash starts fully
 * opaque, which is harsh on the eyes and blanks the whole frame for a moment.
 */
export function flash(scene: Phaser.Scene, color = 0xffffff, duration = 120, alpha = 0.45): void {
  const cam = scene.cameras.main;
  const overlay = scene.add.rectangle(0, 0, cam.width, cam.height, color, alpha)
    .setOrigin(0).setScrollFactor(0).setDepth(9000);
  scene.tweens.add({ targets: overlay, alpha: 0, duration: Math.max(duration, 80), onComplete: () => overlay.destroy() });
}

/** Floating "+10" style popup. */
export function popup(scene: Phaser.Scene, x: number, y: number, s: string, color = '#ffd23f', size = 28): void {
  const t = scene.add.text(x, y, s, {
    fontFamily: '"Press Start 2P", monospace', fontSize: `${size}px`, color, stroke: '#000', strokeThickness: 5,
  }).setOrigin(0.5).setDepth(6000);
  scene.tweens.add({ targets: t, y: y - 70, alpha: 0, duration: 700, ease: 'Cubic.easeOut', onComplete: () => t.destroy() });
}
