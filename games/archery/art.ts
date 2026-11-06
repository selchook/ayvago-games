import Phaser from 'phaser';
import { CHARACTER_FRAME } from '@core';

export const W = 1280;
export const H = 720;
export const GROUND = 620;

// The archer is the player's character, 114 px tall standing (as the old 0.62-scale alien), feet on the turf.
export const ARCHER_SCALE = 114 / CHARACTER_FRAME.standHeight;
export const ARCHER_ORIGIN_Y = CHARACTER_FRAME.originY;

/** WA-style ten ring face: white, black, blue, red, gold (two rings each). */
export const RING_COLORS = [0xf4f4f4, 0xf4f4f4, 0x262626, 0x262626, 0x2f8fd8, 0x2f8fd8, 0xe8332a, 0xe8332a, 0xffd23f, 0xffd23f];

function canvas(scene: Phaser.Scene, key: string, w: number, h: number, draw: (c: CanvasRenderingContext2D) => void): void {
  if (scene.textures.exists(key)) return;
  const tex = scene.textures.createCanvas(key, w, h);
  if (!tex) return;
  draw(tex.getContext());
  tex.refresh();
}

/** Painted scenery and effects: a sky with a low sun, two ranges of hills, glow and ring sprites. */
function makeScenery(scene: Phaser.Scene): void {
  canvas(scene, 'ar-sky', W, H, (c) => {
    const g = c.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, '#3b86d8'); g.addColorStop(0.55, '#8cc8f2'); g.addColorStop(0.85, '#f6e7c1'); g.addColorStop(1, '#f7d9a0');
    c.fillStyle = g; c.fillRect(0, 0, W, H);
    const sun = c.createRadialGradient(980, 330, 10, 980, 330, 420);
    sun.addColorStop(0, 'rgba(255,248,214,0.95)'); sun.addColorStop(0.12, 'rgba(255,236,170,0.55)'); sun.addColorStop(1, 'rgba(255,236,170,0)');
    c.fillStyle = sun; c.fillRect(0, 0, W, H);
  });
  const hills = (key: string, base: number, amp: number, col: string, haze: string, seed: number) => canvas(scene, key, W, H, (c) => {
    c.beginPath(); c.moveTo(0, H);
    for (let x = 0; x <= W; x += 16) c.lineTo(x, base - amp * (0.55 + 0.45 * Math.sin(x * 0.006 + seed) * Math.sin(x * 0.013 + seed * 2)));
    c.lineTo(W, H); c.closePath();
    const g = c.createLinearGradient(0, base - amp, 0, GROUND);
    g.addColorStop(0, col); g.addColorStop(1, haze);
    c.fillStyle = g; c.fill();
  });
  hills('ar-hills-far', GROUND - 120, 150, '#8fb4d6', '#c9dde6', 1.7);
  hills('ar-hills-near', GROUND - 40, 110, '#6fa86a', '#9cc58a', 4.2);
  canvas(scene, 'ar-glow', 128, 128, (c) => {
    const g = c.createRadialGradient(64, 64, 0, 64, 64, 64);
    g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.3, 'rgba(255,255,255,0.4)'); g.addColorStop(1, 'rgba(255,255,255,0)');
    c.fillStyle = g; c.fillRect(0, 0, 128, 128);
  });
  canvas(scene, 'ar-ring', 128, 128, (c) => {
    c.shadowColor = '#ffffff'; c.shadowBlur = 8;
    c.beginPath(); c.arc(64, 64, 52, 0, Math.PI * 2); c.strokeStyle = '#ffffff'; c.lineWidth = 6; c.stroke();
  });
}

/** A dark glass panel with a light rim. */
export function glass(scene: Phaser.Scene, w: number, h: number): string {
  const key = `ar-glass-${w}x${h}`, pad = 10;
  canvas(scene, key, w + pad * 2, h + pad * 2, (c) => {
    const rr = (x: number, y: number, ww: number, hh: number, r: number) => {
      c.beginPath(); c.moveTo(x + r, y); c.arcTo(x + ww, y, x + ww, y + hh, r); c.arcTo(x + ww, y + hh, x, y + hh, r); c.arcTo(x, y + hh, x, y, r); c.arcTo(x, y, x + ww, y, r); c.closePath();
    };
    c.save(); c.shadowColor = 'rgba(0,0,0,0.35)'; c.shadowBlur = 10; c.shadowOffsetY = 3;
    rr(pad, pad, w, h, h / 2); c.fillStyle = 'rgba(10,24,40,0.5)'; c.fill(); c.restore();
    const g = c.createLinearGradient(0, pad, 0, pad + h);
    g.addColorStop(0, 'rgba(255,255,255,0.28)'); g.addColorStop(0.5, 'rgba(255,255,255,0.06)'); g.addColorStop(1, 'rgba(255,255,255,0.1)');
    rr(pad, pad, w, h, h / 2); c.fillStyle = g; c.fill();
    c.lineWidth = 1.5; c.strokeStyle = 'rgba(255,255,255,0.55)'; c.stroke();
  });
  return key;
}

/**
 * The archer while drawing: the `hold1` pose (bow arm out in front) without the arm that hangs
 * at the back; the game poses the character's own `arm` from that shoulder to the string.
 */
export const BACK_SHOULDER: [number, number] = [32, 108];
export function makeDrawBody(scene: Phaser.Scene, key = 'pc-hold1'): { body: string; grip: [number, number] } {
  const out = `${key}-draw`;
  const src = scene.textures.get(key).getSourceImage() as HTMLImageElement | HTMLCanvasElement;
  let grip: [number, number] = [124, 106];
  if (!scene.textures.exists(out)) {
    canvas(scene, out, src.width, src.height, (c) => {
      c.drawImage(src, 0, 0);
      c.clearRect(0, 110, 40, src.height - 110);
    });
  }
  // the bow hand: the right-most column of the pose, a few px in from the knuckles
  const probe = document.createElement('canvas');
  probe.width = src.width; probe.height = src.height;
  const pc = probe.getContext('2d');
  if (pc) {
    pc.drawImage(src, 0, 0);
    const d = pc.getImageData(0, 0, src.width, src.height).data;
    let mx = -1;
    for (let x = src.width - 1; x >= 0 && mx < 0; x--) for (let y = 0; y < src.height; y++) if (d[(y * src.width + x) * 4 + 3] > 128) { mx = x; break; }
    let sy = 0, n = 0;
    for (let y = 0; y < src.height; y++) for (let x = mx - 6; x <= mx; x++) if (d[(y * src.width + x) * 4 + 3] > 128) { sy += y; n++; }
    if (mx > 0 && n) grip = [mx - 8, sy / n];
  }
  return { body: out, grip };
}

export function makeArcheryTextures(scene: Phaser.Scene): void {
  makeScenery(scene);
  if (scene.textures.exists('face')) return;
  const g = scene.make.graphics({ x: 0, y: 0 }, false);
  const R = 128;
  g.fillStyle(0x000000, 0.25).fillCircle(R + 4, R + 6, R - 2);
  for (let k = 0; k < 10; k++) {
    const r = R - 4 - k * ((R - 4) / 10);
    g.fillStyle(RING_COLORS[k]).fillCircle(R, R, r);
    g.lineStyle(k === 2 || k === 3 ? 1.5 : 2, k === 2 || k === 3 ? 0x888888 : 0x000000, 0.45).strokeCircle(R, R, r);
  }
  g.lineStyle(2, 0x000000, 0.5).strokeCircle(R, R, (R - 4) / 20);
  g.lineStyle(5, 0x7a4a1f, 1).strokeCircle(R, R, R - 3);
  g.generateTexture('face', R * 2 + 8, R * 2 + 8);

  // arrow pointing right, tip at the right edge
  g.clear();
  g.fillStyle(0x8a5a2b).fillRect(14, 5, 66, 4);
  g.fillStyle(0xc9cdd8).fillTriangle(78, 1, 92, 7, 78, 13);
  g.fillStyle(0xec3013).fillTriangle(0, 0, 20, 5, 6, 7).fillTriangle(0, 14, 20, 9, 6, 7);
  g.fillStyle(0xffffff).fillRect(18, 5, 4, 4);
  g.generateTexture('arrow', 92, 14);

  // aim dot
  g.clear();
  g.fillStyle(0xffffff).fillCircle(5, 5, 5);
  g.generateTexture('dot', 10, 10);

  // sky: horizontal bands (texture generation has no gradient fills)
  g.clear();
  const top = [0x4f9ff0], bands = 24;
  for (let k = 0; k < bands; k++) {
    const c = Phaser.Display.Color.Interpolate.ColorWithColor(
      Phaser.Display.Color.ValueToColor(top[0]), Phaser.Display.Color.ValueToColor(0xd4f0ff), bands - 1, k);
    g.fillStyle(Phaser.Display.Color.GetColor(c.r, c.g, c.b)).fillRect(0, (k * H) / bands, 16, H / bands + 1);
  }
  g.generateTexture('sky', 16, H);

  // ground strip
  g.clear();
  // ground strip: grass blades on top (12 px), turf below; drawn with its top at GROUND - 12
  g.fillStyle(0x6fd35a).fillTriangle(10, 12, 14, 2, 18, 12).fillTriangle(70, 12, 75, 0, 80, 12).fillTriangle(104, 12, 107, 4, 110, 12);
  g.fillStyle(0x58b947).fillRect(0, 12, 128, 14);
  g.fillStyle(0x3f9a37).fillRect(0, 26, 128, 120);
  g.fillStyle(0x2f7f2b);
  for (let k = 0; k < 10; k++) g.fillRect((k * 37) % 120, 38 + ((k * 23) % 80), 6, 4);
  g.generateTexture('turf', 128, 112);
  g.destroy();
}
