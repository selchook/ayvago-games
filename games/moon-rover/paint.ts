// Moon Rover: the palette and the small canvas painters the theme, the screens, the HUD and the
// icons share (no imports from them, so any module can use them first). The look: a moon base's
// mission control: brushed steel panels with bolts, smoked glass, yellow and black hazard stripes,
// the kit's signal orange for the main actions and a cool teal for the rest.
import { shadeColor } from '@core';

export const INK = '#0b1020';
export const STEEL = 0x5a6578;
export const STEEL_DARK = 0x2a3140;
export const ORANGE = 0xff8a1a;
export const TEAL = 0x1d9bb0;
export const HAZARD = 0xffc21a;
export const GREEN = 0x37b864;
export const RED = 0xe0483a;
export const GREY = 0x6a7282;
export const GLASS = 0x9fd8ff;
export const PANEL = 0xdce6f2;

export const css = (c: number, a = 1): string => {
  const r = (c >> 16) & 255, g = (c >> 8) & 255, b = c & 255;
  return a >= 1 ? `rgb(${r},${g},${b})` : `rgba(${r},${g},${b},${a})`;
};

export function rng(seed: number): () => number {
  let s = (Math.abs(Math.floor(seed)) % 2147483646) + 1;
  return () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
}

/** Brushed metal: a vertical sheen and fine horizontal streaks, clipped to the current path. */
export function brushed(c: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, base: number, seed: number): void {
  const r = rng(seed);
  const g = c.createLinearGradient(0, y, 0, y + h);
  g.addColorStop(0, css(shadeColor(base, 0.28))); g.addColorStop(0.45, css(base)); g.addColorStop(1, css(shadeColor(base, -0.3)));
  c.fillStyle = g;
  c.fillRect(x, y, w, h);
  for (let i = 0; i < h / 2.2; i++) {
    const yy = y + r() * h, a = 0.03 + r() * 0.06;
    c.fillStyle = r() < 0.5 ? `rgba(255,255,255,${a})` : `rgba(0,0,0,${a})`;
    c.fillRect(x + r() * w * 0.3, yy, w * (0.4 + r() * 0.6), 1);
  }
}

/** A row of yellow and black hazard stripes. */
export function hazard(c: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, step = 14): void {
  c.save();
  c.beginPath(); c.rect(x, y, w, h); c.clip();
  c.fillStyle = css(HAZARD); c.fillRect(x, y, w, h);
  c.fillStyle = '#16181e';
  for (let px = x - h; px < x + w + h; px += step * 2) {
    c.beginPath(); c.moveTo(px, y + h); c.lineTo(px + step, y + h); c.lineTo(px + step + h, y); c.lineTo(px + h, y); c.closePath(); c.fill();
  }
  c.restore();
  c.strokeStyle = 'rgba(0,0,0,0.6)'; c.lineWidth = 1.5; c.strokeRect(x + 0.75, y + 0.75, w - 1.5, h - 1.5);
}

/** A hex bolt head. */
export function bolt(c: CanvasRenderingContext2D, x: number, y: number, r: number): void {
  c.save();
  const g = c.createRadialGradient(x - r * 0.3, y - r * 0.3, 0, x, y, r);
  g.addColorStop(0, '#f2f6fc'); g.addColorStop(0.6, '#9aa4b4'); g.addColorStop(1, '#4a5262');
  c.fillStyle = g;
  c.beginPath();
  for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2 + 0.5; c.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r); }
  c.closePath(); c.fill();
  c.strokeStyle = 'rgba(10,14,24,0.8)'; c.lineWidth = Math.max(1, r * 0.25); c.stroke();
  c.restore();
}

/** Smoked glass with a diagonal reflection, clipped to the current path. */
export function glass(c: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, tint = 0x10203a, alpha = 0.78): void {
  const g = c.createLinearGradient(0, y, 0, y + h);
  g.addColorStop(0, css(shadeColor(tint, 0.25), alpha)); g.addColorStop(1, css(shadeColor(tint, -0.25), alpha));
  c.fillStyle = g; c.fillRect(x, y, w, h);
  c.save();
  c.globalAlpha = 0.12;
  c.fillStyle = '#ffffff';
  c.beginPath(); c.moveTo(x + w * 0.08, y); c.lineTo(x + w * 0.32, y); c.lineTo(x + w * 0.16, y + h); c.lineTo(x - w * 0.08, y + h); c.closePath(); c.fill();
  c.globalAlpha = 0.06;
  c.beginPath(); c.moveTo(x + w * 0.38, y); c.lineTo(x + w * 0.46, y); c.lineTo(x + w * 0.3, y + h); c.lineTo(x + w * 0.22, y + h); c.closePath(); c.fill();
  c.restore();
}

/** A five-point star. */
export function star(c: CanvasRenderingContext2D, x: number, y: number, r: number, fill = 0xffcf3a, stroke = INK): void {
  c.beginPath();
  for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + (i * Math.PI) / 5, rr = i % 2 ? r * 0.46 : r; c.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr); }
  c.closePath();
  const g = c.createLinearGradient(0, y - r, 0, y + r);
  g.addColorStop(0, css(shadeColor(fill, 0.35))); g.addColorStop(1, css(shadeColor(fill, -0.2)));
  c.fillStyle = g; c.fill();
  c.lineWidth = Math.max(2, r * 0.14); c.strokeStyle = stroke; c.stroke();
}

/** The crescent moon over a planet's rim, the mission patch's heart. */
export function moonDisc(c: CanvasRenderingContext2D, x: number, y: number, r: number): void {
  const g = c.createRadialGradient(x - r * 0.35, y - r * 0.35, r * 0.1, x, y, r);
  g.addColorStop(0, '#f4f4f0'); g.addColorStop(0.7, '#b8b8c0'); g.addColorStop(1, '#6a6a78');
  c.fillStyle = g; c.beginPath(); c.arc(x, y, r, 0, Math.PI * 2); c.fill();
  c.fillStyle = 'rgba(60,60,72,0.35)';
  for (const [dx, dy, rr] of [[-0.3, -0.2, 0.18], [0.25, 0.15, 0.24], [-0.1, 0.4, 0.12], [0.35, -0.35, 0.1]] as [number, number, number][]) { c.beginPath(); c.arc(x + dx * r, y + dy * r, rr * r, 0, Math.PI * 2); c.fill(); }
}

/** A small rover seen from the side: the emblem's and the icons' rover. */
export function roverSide(c: CanvasRenderingContext2D, x: number, y: number, s: number, accent = ORANGE): void {
  c.save();
  c.translate(x, y);
  c.lineJoin = 'round';
  c.lineWidth = s * 0.07; c.strokeStyle = INK;
  // the mast and its camera
  c.fillStyle = '#dfe6f0';
  c.beginPath(); c.rect(s * 0.18, -s * 0.78, s * 0.07, s * 0.36); c.fill(); c.stroke();
  c.fillStyle = '#39404e'; c.beginPath(); c.roundRect(s * 0.1, -s * 0.92, s * 0.28, s * 0.16, s * 0.04); c.fill(); c.stroke();
  // the body
  c.fillStyle = '#dfe6f0';
  c.beginPath(); c.roundRect(-s * 0.55, -s * 0.45, s * 1.1, s * 0.34, s * 0.07); c.fill(); c.stroke();
  c.fillStyle = css(accent); c.beginPath(); c.roundRect(-s * 0.55, -s * 0.31, s * 1.1, s * 0.1, s * 0.03); c.fill(); c.stroke();
  // six wheels (three seen)
  for (const wx of [-0.38, 0, 0.38]) {
    c.fillStyle = '#2a2f3a'; c.beginPath(); c.arc(wx * s, -s * 0.06, s * 0.15, 0, Math.PI * 2); c.fill(); c.stroke();
    c.fillStyle = '#a8b0bc'; c.beginPath(); c.arc(wx * s, -s * 0.06, s * 0.06, 0, Math.PI * 2); c.fill();
  }
  c.restore();
}

/** An astronaut's helmet (front), for the crew icons. */
export function helmet(c: CanvasRenderingContext2D, x: number, y: number, r: number): void {
  c.save();
  c.lineWidth = Math.max(2, r * 0.14); c.strokeStyle = INK;
  c.fillStyle = '#f2f4f8'; c.beginPath(); c.arc(x, y, r, 0, Math.PI * 2); c.fill(); c.stroke();
  const g = c.createLinearGradient(x - r, y - r * 0.4, x + r, y + r * 0.5);
  g.addColorStop(0, '#ffcf7a'); g.addColorStop(0.5, '#ff8a2a'); g.addColorStop(1, '#a8501a');
  c.fillStyle = g; c.beginPath(); c.roundRect(x - r * 0.68, y - r * 0.42, r * 1.36, r * 0.84, r * 0.38); c.fill(); c.stroke();
  c.fillStyle = 'rgba(255,255,255,0.7)'; c.beginPath(); c.ellipse(x - r * 0.32, y - r * 0.18, r * 0.16, r * 0.1, -0.5, 0, Math.PI * 2); c.fill();
  c.restore();
}

/** A faceted crystal. */
export function crystal(c: CanvasRenderingContext2D, x: number, y: number, r: number, col = 0x45e0ff): void {
  c.save();
  c.lineWidth = Math.max(2, r * 0.12); c.strokeStyle = INK; c.lineJoin = 'round';
  const g = c.createLinearGradient(x - r, y - r, x + r, y + r);
  g.addColorStop(0, css(shadeColor(col, 0.6))); g.addColorStop(0.5, css(col)); g.addColorStop(1, css(shadeColor(col, -0.4)));
  c.fillStyle = g;
  c.beginPath(); c.moveTo(x, y - r); c.lineTo(x + r * 0.62, y - r * 0.2); c.lineTo(x + r * 0.4, y + r); c.lineTo(x - r * 0.4, y + r); c.lineTo(x - r * 0.62, y - r * 0.2); c.closePath(); c.fill(); c.stroke();
  c.lineWidth = Math.max(1, r * 0.06); c.strokeStyle = 'rgba(11,16,32,0.6)';
  c.beginPath(); c.moveTo(x - r * 0.62, y - r * 0.2); c.lineTo(x, y + r * 0.1); c.lineTo(x + r * 0.62, y - r * 0.2); c.moveTo(x, y + r * 0.1); c.lineTo(x, y + r); c.moveTo(x, y - r); c.lineTo(x, y + r * 0.1); c.stroke();
  c.restore();
}
