import Phaser from 'phaser';

const PX = '__ay_px';
const SCAN = '__ay_scan';

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

/** Subtle CRT scanlines over the whole camera. */
export function addCrt(scene: Phaser.Scene, alpha = 0.12): Phaser.GameObjects.TileSprite {
  if (!scene.textures.exists(SCAN)) {
    const g = scene.make.graphics({ x: 0, y: 0 }, false);
    g.fillStyle(0x000000, 1).fillRect(0, 0, 4, 2);
    g.generateTexture(SCAN, 4, 4);
    g.destroy();
  }
  const { width, height } = scene.scale;
  return scene.add.tileSprite(0, 0, width, height, SCAN).setOrigin(0).setAlpha(alpha).setScrollFactor(0).setDepth(100000);
}

/** Pixel-burst particles at (x, y). */
export function burst(scene: Phaser.Scene, x: number, y: number, tint: number | number[] = 0xffffff, count = 16, speed = 260): void {
  const key = ensurePixel(scene);
  const em = scene.add.particles(x, y, key, {
    speed: { min: speed * 0.3, max: speed },
    angle: { min: 0, max: 360 },
    scale: { start: 2.2, end: 0 },
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

export function flash(scene: Phaser.Scene, color = 0xffffff, duration = 120): void {
  const c = Phaser.Display.Color.IntegerToRGB(color);
  scene.cameras.main.flash(duration, c.r, c.g, c.b);
}

/** Floating "+10" style popup. */
export function popup(scene: Phaser.Scene, x: number, y: number, s: string, color = '#ffd23f', size = 28): void {
  const t = scene.add.text(x, y, s, {
    fontFamily: '"Press Start 2P", monospace', fontSize: `${size}px`, color, stroke: '#000', strokeThickness: 5,
  }).setOrigin(0.5).setDepth(6000);
  scene.tweens.add({ targets: t, y: y - 70, alpha: 0, duration: 700, ease: 'Cubic.easeOut', onComplete: () => t.destroy() });
}
