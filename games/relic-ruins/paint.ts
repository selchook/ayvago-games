// Relic Ruins: the palette and the small canvas painters the theme, the screens and the HUD share
// (no imports from them, so any module can use them first). The look: weathered sandstone carved
// with a gold-leaf border, ivy creeping over it, lit by torches in the dark.
import { shadeColor } from '@core';

export const INK = '#1c130b';
export const SAND = 0xc9a46c;
export const SAND_DARK = 0x8a6a40;
export const BASALT = 0x2b2420;
export const AMBER = 0xf0962a;
export const GOLD = 0xe8b84a;
export const VERDIGRIS = 0x3f8a7a;
export const MOSS = 0x5e8a3a;
export const EMBER = 0xd8482a;
export const GREY = 0x857a6e;
export const PARCH = 0xf2e2bc;

export const css = (c: number, a = 1): string => {
  const r = (c >> 16) & 255, g = (c >> 8) & 255, b = c & 255;
  return a >= 1 ? `rgb(${r},${g},${b})` : `rgba(${r},${g},${b},${a})`;
};

export function rng(seed: number): () => number {
  let s = (Math.abs(Math.floor(seed)) % 2147483646) + 1;
  return () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
}

/** Sandstone: a warm face with grain, pits and a few hairline cracks, clipped to the current path. */
export function stone(c: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, base: number, seed: number): void {
  const r = rng(seed);
  const g = c.createLinearGradient(0, y, 0, y + h);
  g.addColorStop(0, css(shadeColor(base, 0.16))); g.addColorStop(0.5, css(base)); g.addColorStop(1, css(shadeColor(base, -0.2)));
  c.fillStyle = g;
  c.fillRect(x, y, w, h);
  // grain and pits
  for (let i = 0; i < (w * h) / 260; i++) {
    const px = x + r() * w, py = y + r() * h, s = 0.6 + r() * 2.2;
    c.fillStyle = r() < 0.5 ? 'rgba(255,240,210,0.10)' : 'rgba(40,24,10,0.14)';
    c.fillRect(px, py, s, s * (0.5 + r()));
  }
  // hairline cracks
  c.strokeStyle = 'rgba(40,24,10,0.35)';
  c.lineWidth = 1;
  for (let i = 0; i < Math.max(1, Math.floor(w / 140)); i++) {
    let px = x + r() * w, py = y + r() * h;
    c.beginPath(); c.moveTo(px, py);
    for (let k = 0; k < 4; k++) { px += (r() - 0.5) * 26; py += 4 + r() * 10; c.lineTo(px, py); }
    c.stroke();
  }
}

/** A carved groove along a rounded rect (dark under, light over: cut into the stone). */
export function groove(c: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, rad: number, width = 2): void {
  c.lineWidth = width;
  c.strokeStyle = 'rgba(30,18,8,0.55)';
  c.beginPath(); c.roundRect(x, y, w, h, rad); c.stroke();
  c.strokeStyle = 'rgba(255,236,200,0.35)';
  c.beginPath(); c.roundRect(x + 1, y + 1.5, w, h, rad); c.stroke();
}

/** A gold-leaf band with a running meander, as a lintel's frieze. */
export function frieze(c: CanvasRenderingContext2D, x: number, y: number, w: number, h: number): void {
  const g = c.createLinearGradient(0, y, 0, y + h);
  g.addColorStop(0, '#fff0b0'); g.addColorStop(0.45, css(GOLD)); g.addColorStop(1, '#9a6a1a');
  c.fillStyle = g;
  c.fillRect(x, y, w, h);
  c.strokeStyle = 'rgba(70,40,8,0.75)';
  c.lineWidth = Math.max(1, h * 0.14);
  const s = h * 0.9;
  c.beginPath();
  for (let px = x + s * 0.2; px < x + w - s; px += s * 1.1) {
    const top = y + h * 0.22, bot = y + h * 0.78;
    c.moveTo(px, bot); c.lineTo(px, top); c.lineTo(px + s * 0.8, top); c.lineTo(px + s * 0.8, bot - h * 0.28); c.lineTo(px + s * 0.4, bot - h * 0.28);
  }
  c.stroke();
  c.strokeStyle = 'rgba(70,40,8,0.8)'; c.lineWidth = 1.5;
  c.strokeRect(x + 0.75, y + 0.75, w - 1.5, h - 1.5);
}

/** Ivy: a curling stem with pointed leaves from (x0, y0) along a direction. */
export function ivy(c: CanvasRenderingContext2D, x0: number, y0: number, len: number, ang: number, seed: number, scale = 1): void {
  const r = rng(seed);
  c.save();
  c.lineCap = 'round';
  let x = x0, y = y0, a = ang;
  c.strokeStyle = '#3a4a1e'; c.lineWidth = 2.2 * scale;
  const pts: [number, number][] = [];
  c.beginPath(); c.moveTo(x, y);
  for (let s = 0; s < len; s += 6 * scale) {
    a += (r() - 0.5) * 0.5;
    x += Math.cos(a) * 6 * scale; y += Math.sin(a) * 6 * scale;
    c.lineTo(x, y);
    if (r() < 0.55) pts.push([x, y]);
  }
  c.stroke();
  for (const [px, py] of pts) leaf(c, px, py, (5 + r() * 6) * scale, r() * Math.PI * 2, r() < 0.5 ? MOSS : 0x4a7a2e);
  c.restore();
}

export function leaf(c: CanvasRenderingContext2D, x: number, y: number, s: number, a: number, color: number): void {
  c.save();
  c.translate(x, y); c.rotate(a);
  c.fillStyle = css(color);
  c.beginPath(); c.moveTo(0, 0); c.quadraticCurveTo(s * 0.6, -s * 0.55, s * 1.4, 0); c.quadraticCurveTo(s * 0.6, s * 0.55, 0, 0); c.fill();
  c.strokeStyle = css(shadeColor(color, -0.35)); c.lineWidth = 0.8;
  c.beginPath(); c.moveTo(0, 0); c.lineTo(s * 1.3, 0); c.stroke();
  c.restore();
}

/** A torch flame with its glow, the base at (x, y). */
export function flame(c: CanvasRenderingContext2D, x: number, y: number, s: number): void {
  c.save();
  const halo = c.createRadialGradient(x, y - s * 0.6, 0, x, y - s * 0.6, s * 2.2);
  halo.addColorStop(0, 'rgba(255,190,90,0.55)'); halo.addColorStop(1, 'rgba(255,120,30,0)');
  c.fillStyle = halo; c.fillRect(x - s * 2.2, y - s * 2.8, s * 4.4, s * 4.4);
  const body = (k: number, col: string) => {
    c.fillStyle = col;
    c.beginPath();
    c.moveTo(x, y - s * 1.55 * k);
    c.bezierCurveTo(x + s * 0.55 * k, y - s * 0.8 * k, x + s * 0.6 * k, y - s * 0.1 * k, x, y);
    c.bezierCurveTo(x - s * 0.6 * k, y - s * 0.1 * k, x - s * 0.55 * k, y - s * 0.8 * k, x, y - s * 1.55 * k);
    c.fill();
  };
  body(1, '#f0601a'); body(0.72, '#ffa830'); body(0.42, '#fff0a0');
  c.restore();
}

/** A five-point star (rated levels). */
export function star(c: CanvasRenderingContext2D, x: number, y: number, R: number, fill = GOLD, outline: string | null = INK): void {
  c.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5, rr = i % 2 ? R * 0.48 : R;
    c.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
  }
  c.closePath();
  const g = c.createLinearGradient(0, y - R, 0, y + R);
  g.addColorStop(0, css(shadeColor(fill, 0.35))); g.addColorStop(1, css(shadeColor(fill, -0.2)));
  c.fillStyle = g; c.fill();
  if (outline) { c.lineJoin = 'round'; c.lineWidth = Math.max(1.5, R * 0.14); c.strokeStyle = outline; c.stroke(); }
}
