import Phaser from 'phaser';

/** Painted textures for the arena's light and the HUD glass (drawn once, on canvases). */

type Ctx = CanvasRenderingContext2D;

function make(scene: Phaser.Scene, key: string, w: number, h: number, draw: (c: Ctx) => void): void {
  if (scene.textures.exists(key)) return;
  const tex = scene.textures.createCanvas(key, w, h);
  if (!tex) return;
  draw(tex.getContext());
  tex.refresh();
}

function roundRect(c: Ctx, x: number, y: number, w: number, h: number, r: number): void {
  c.beginPath();
  c.moveTo(x + r, y);
  c.arcTo(x + w, y, x + w, y + h, r);
  c.arcTo(x + w, y + h, x, y + h, r);
  c.arcTo(x, y + h, x, y, r);
  c.arcTo(x, y, x + w, y, r);
  c.closePath();
}

export function makeHoopTextures(scene: Phaser.Scene): void {
  make(scene, 'hs-glow', 128, 128, (c) => {
    const g = c.createRadialGradient(64, 64, 0, 64, 64, 64);
    g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.3, 'rgba(255,255,255,0.4)'); g.addColorStop(1, 'rgba(255,255,255,0)');
    c.fillStyle = g; c.fillRect(0, 0, 128, 128);
  });
  // shading laid over a drawn ball: a highlight up and left, a darker rim
  make(scene, 'hs-shade', 128, 128, (c) => {
    c.beginPath(); c.arc(64, 64, 63, 0, Math.PI * 2); c.clip();
    const g = c.createRadialGradient(44, 40, 2, 64, 64, 66);
    g.addColorStop(0, 'rgba(255,255,255,0.55)'); g.addColorStop(0.28, 'rgba(255,255,255,0.08)');
    g.addColorStop(0.62, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(20,6,0,0.55)');
    c.fillStyle = g; c.fillRect(0, 0, 128, 128);
  });
  // a light beam: narrow at the top, wide and faint at the bottom (origin at the top centre)
  make(scene, 'hs-beam', 256, 512, (c) => {
    const g = c.createLinearGradient(0, 0, 0, 512);
    g.addColorStop(0, 'rgba(255,245,215,0.9)'); g.addColorStop(0.5, 'rgba(255,245,215,0.25)'); g.addColorStop(1, 'rgba(255,245,215,0)');
    c.beginPath(); c.moveTo(118, 0); c.lineTo(138, 0); c.lineTo(256, 512); c.lineTo(0, 512); c.closePath();
    c.fillStyle = g; c.fill();
  });
  make(scene, 'hs-star', 64, 64, (c) => {
    const g = c.createRadialGradient(32, 32, 0, 32, 32, 32);
    g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.2, 'rgba(255,255,255,0.6)'); g.addColorStop(1, 'rgba(255,255,255,0)');
    c.fillStyle = g; c.fillRect(0, 0, 64, 64);
    c.fillStyle = 'rgba(255,255,255,0.9)';
    c.fillRect(30, 2, 4, 60); c.fillRect(2, 30, 60, 4);
  });
}

/** A dark glass panel with a light rim and a sheen across the top. */
export function glass(scene: Phaser.Scene, w: number, h: number, tint = '#ffffff'): string {
  const key = `hs-glass-${w}x${h}-${tint}`, pad = 10;
  make(scene, key, w + pad * 2, h + pad * 2, (c) => {
    c.save(); c.shadowColor = 'rgba(0,0,0,0.6)'; c.shadowBlur = 10; c.shadowOffsetY = 4;
    roundRect(c, pad, pad, w, h, 14); c.fillStyle = 'rgba(8,6,16,0.72)'; c.fill(); c.restore();
    const g = c.createLinearGradient(0, pad, 0, pad + h);
    g.addColorStop(0, 'rgba(255,255,255,0.18)'); g.addColorStop(0.45, 'rgba(255,255,255,0.04)'); g.addColorStop(1, 'rgba(255,255,255,0.08)');
    roundRect(c, pad, pad, w, h, 14); c.fillStyle = g; c.fill();
    c.lineWidth = 2; c.strokeStyle = tint; c.globalAlpha = 0.55; c.stroke(); c.globalAlpha = 1;
    roundRect(c, pad + 8, pad + 4, w - 16, h * 0.3, 10); c.fillStyle = 'rgba(255,255,255,0.08)'; c.fill();
  });
  return key;
}
