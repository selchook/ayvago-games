// Trap Trail: the palette and the small canvas painters the theme, the screens and the HUD share
// (no imports from them, so any module can use it first).
import { shadeColor } from '@core';

export const INK = '#1b2a4a';
export const ORANGE = 0xffa31a;
export const BLUE = 0x3aa8ff;
export const GREEN = 0x3ec46a;
export const GREY = 0x8a94a8;
export const RED = 0xe8483a;
export const CREAM = 0xfff3dc;
export const GRASS = 0x8fcf3e;
export const GOLD = 0xffd23a;
export const STRIPES = [0xf0bd84, 0xe3a067, 0xf4c995, 0xd99059];

export const css = (c: number, a = 1): string => {
  const r = (c >> 16) & 255, g = (c >> 8) & 255, b = c & 255;
  return a >= 1 ? `rgb(${r},${g},${b})` : `rgba(${r},${g},${b},${a})`;
};

export function rng(seed: number): () => number {
  let s = (Math.abs(Math.floor(seed)) % 2147483646) + 1;
  return () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
}

// ------------------------------------------------------------------ pieces of the look

/** A grass cap with round drips along its lower edge, over x..x+w, its top at y, `h` deep. */
export function grassCap(c: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, seed: number, color = GRASS, drip = 9): void {
  const r = rng(seed);
  c.save();
  c.fillStyle = css(shadeColor(color, -0.28));
  c.beginPath(); c.roundRect(x, y + 3, w, h, Math.min(10, h / 2)); c.fill();
  const g = c.createLinearGradient(0, y, 0, y + h);
  g.addColorStop(0, css(shadeColor(color, 0.25))); g.addColorStop(1, css(color));
  c.fillStyle = g;
  c.beginPath(); c.roundRect(x, y, w, h, Math.min(10, h / 2)); c.fill();
  // drips
  for (let dx = x + 8 + r() * 10; dx < x + w - 12; dx += 16 + r() * 22) {
    const dw = 7 + r() * 9, dh = drip * 0.55 + r() * drip;
    c.fillStyle = css(color);
    c.beginPath(); c.ellipse(dx, y + h - 1, dw / 2, dh, 0, 0, Math.PI); c.fill();
  }
  c.fillStyle = 'rgba(255,255,255,0.35)';
  c.beginPath(); c.roundRect(x + 6, y + 3, w - 12, Math.max(2, h * 0.22), 3); c.fill();
  c.restore();
}

/** Layered earth stripes, as on the pack's floating islands. */
export function stripes(c: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, seed: number): void {
  const r = rng(seed);
  let yy = y, i = 0;
  while (yy < y + h) {
    const bh = Math.min(y + h - yy, 12 + r() * 14);
    c.fillStyle = css(STRIPES[i % STRIPES.length]);
    c.fillRect(x, yy, w, bh);
    c.fillStyle = 'rgba(255,255,255,0.16)';
    c.fillRect(x, yy, w, 2);
    yy += bh; i++;
  }
}

/** A little five-point star. */
export function star(c: CanvasRenderingContext2D, x: number, y: number, R: number, fill = GOLD, outline: string | null = INK): void {
  c.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5, rr = i % 2 ? R * 0.48 : R;
    c.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
  }
  c.closePath();
  const g = c.createLinearGradient(0, y - R, 0, y + R);
  g.addColorStop(0, css(shadeColor(fill, 0.35))); g.addColorStop(1, css(shadeColor(fill, -0.15)));
  c.fillStyle = g; c.fill();
  if (outline) { c.lineJoin = 'round'; c.lineWidth = Math.max(1.5, R * 0.14); c.strokeStyle = outline; c.stroke(); }
}

