// Monster Roundup: the palette and the small canvas painters the theme, the screens, the HUD and the
// icons share (no imports from them, so any module can use them first). The look: a space station's
// containment lab: white enamel panels with the kit's signal orange, smoked glass, a teal containment
// glow, and round, friendly shapes for the monsters.
import { shadeColor } from '@core';

export const INK = '#101626';
export const PANEL = 0xe8edf3;
export const PANEL_DARK = 0x8a96a8;
export const ORANGE = 0xff9a2a;
export const TEAL = 0x18a9a0;
export const GLOW = 0x3ae0c8;
export const PURPLE = 0x8a5ad8;
export const GREEN = 0x37b864;
export const RED = 0xe0483a;
export const GREY = 0x6a7282;
export const NAVY = 0x16213a;

export const css = (c: number, a = 1): string => {
  const r = (c >> 16) & 255, g = (c >> 8) & 255, b = c & 255;
  return a >= 1 ? `rgb(${r},${g},${b})` : `rgba(${r},${g},${b},${a})`;
};

export function rng(seed: number): () => number {
  let s = (Math.abs(Math.floor(seed)) % 2147483646) + 1;
  return () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
}

/** Enamel: a soft vertical gradient with a gloss band, clipped to the current path by the caller. */
export function enamel(c: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, base: number): void {
  const g = c.createLinearGradient(0, y, 0, y + h);
  g.addColorStop(0, css(shadeColor(base, 0.22))); g.addColorStop(0.5, css(base)); g.addColorStop(1, css(shadeColor(base, -0.18)));
  c.fillStyle = g;
  c.fillRect(x, y, w, h);
  c.fillStyle = 'rgba(255,255,255,0.16)';
  c.fillRect(x, y, w, h * 0.35);
}

/** A row of orange and white chevrons (the kit's floor trim). */
export function chevrons(c: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, col = ORANGE, step = 16): void {
  c.save();
  c.beginPath(); c.rect(x, y, w, h); c.clip();
  c.fillStyle = css(shadeColor(col, -0.35)); c.fillRect(x, y, w, h);
  c.fillStyle = css(col);
  for (let px = x - h; px < x + w + h; px += step * 2) {
    c.beginPath(); c.moveTo(px, y); c.lineTo(px + step, y); c.lineTo(px + step + h / 2, y + h / 2); c.lineTo(px + step, y + h); c.lineTo(px, y + h); c.lineTo(px + h / 2, y + h / 2); c.closePath(); c.fill();
  }
  c.restore();
}

/** A round rivet. */
export function rivet(c: CanvasRenderingContext2D, x: number, y: number, r: number): void {
  const g = c.createRadialGradient(x - r * 0.3, y - r * 0.3, 0, x, y, r);
  g.addColorStop(0, '#ffffff'); g.addColorStop(0.6, '#b8c2d0'); g.addColorStop(1, '#5a6474');
  c.fillStyle = g; c.beginPath(); c.arc(x, y, r, 0, Math.PI * 2); c.fill();
  c.strokeStyle = 'rgba(10,14,24,0.7)'; c.lineWidth = Math.max(1, r * 0.25); c.stroke();
}

/** Smoked glass with a diagonal reflection, clipped by the caller. */
export function glass(c: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, tint = 0x0e1a30, alpha = 0.86): void {
  const g = c.createLinearGradient(0, y, 0, y + h);
  g.addColorStop(0, css(shadeColor(tint, 0.25), alpha)); g.addColorStop(1, css(shadeColor(tint, -0.25), alpha));
  c.fillStyle = g; c.fillRect(x, y, w, h);
  c.save();
  c.globalAlpha = 0.1; c.fillStyle = '#ffffff';
  c.beginPath(); c.moveTo(x + w * 0.08, y); c.lineTo(x + w * 0.3, y); c.lineTo(x + w * 0.14, y + h); c.lineTo(x - w * 0.08, y + h); c.closePath(); c.fill();
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

/** A round, friendly monster face (the emblem's and the icons' monster). */
export function blobFace(c: CanvasRenderingContext2D, x: number, y: number, r: number, col = 0x5ad66a, dizzy = false): void {
  c.save();
  c.lineWidth = Math.max(2, r * 0.1); c.strokeStyle = INK; c.lineJoin = 'round';
  const g = c.createRadialGradient(x - r * 0.35, y - r * 0.45, r * 0.1, x, y, r * 1.1);
  g.addColorStop(0, css(shadeColor(col, 0.45))); g.addColorStop(0.7, css(col)); g.addColorStop(1, css(shadeColor(col, -0.3)));
  c.fillStyle = g;
  c.beginPath();
  c.moveTo(x - r, y + r * 0.55);
  c.bezierCurveTo(x - r * 1.05, y - r * 0.6, x - r * 0.55, y - r * 1.05, x, y - r * 1.02);
  c.bezierCurveTo(x + r * 0.55, y - r * 1.05, x + r * 1.05, y - r * 0.6, x + r, y + r * 0.55);
  c.quadraticCurveTo(x + r * 0.95, y + r * 0.85, x + r * 0.6, y + r * 0.82);
  c.lineTo(x - r * 0.6, y + r * 0.82);
  c.quadraticCurveTo(x - r * 0.95, y + r * 0.85, x - r, y + r * 0.55);
  c.closePath(); c.fill(); c.stroke();
  // eyes: big whites, sleepy lids (dizzy: spirals)
  for (const s of [-1, 1]) {
    const ex = x + s * r * 0.36, ey = y - r * 0.18;
    c.fillStyle = '#ffffff'; c.beginPath(); c.ellipse(ex, ey, r * 0.26, r * 0.3, 0, 0, Math.PI * 2); c.fill(); c.stroke();
    if (dizzy) {
      c.strokeStyle = INK; c.lineWidth = Math.max(1.5, r * 0.06);
      c.beginPath(); for (let a = 0; a < Math.PI * 4; a += 0.3) { const rr = (a / (Math.PI * 4)) * r * 0.2; c.lineTo(ex + Math.cos(a) * rr, ey + Math.sin(a) * rr); } c.stroke();
      c.lineWidth = Math.max(2, r * 0.1);
    } else {
      c.fillStyle = INK; c.beginPath(); c.ellipse(ex + r * 0.02, ey + r * 0.02, r * 0.11, r * 0.13, 0, 0, Math.PI * 2); c.fill();
      c.fillStyle = css(shadeColor(col, -0.15)); c.beginPath(); c.ellipse(ex, ey - r * 0.16, r * 0.27, r * 0.14, 0, Math.PI, Math.PI * 2); c.fill();
    }
  }
  // a grin
  c.fillStyle = '#5a1a3a';
  c.beginPath(); c.moveTo(x - r * 0.3, y + r * 0.28); c.quadraticCurveTo(x, y + r * 0.62, x + r * 0.3, y + r * 0.28); c.closePath(); c.fill(); c.stroke();
  c.fillStyle = '#ffffff'; c.fillRect(x - r * 0.12, y + r * 0.28, r * 0.1, r * 0.1); c.fillRect(x + r * 0.04, y + r * 0.28, r * 0.1, r * 0.1);
  c.restore();
}

/** A mech's head seen from the front (the icons' mech): a box with two round eyes and an antenna. */
export function mechHead(c: CanvasRenderingContext2D, x: number, y: number, r: number, col = 0x4ab0e8): void {
  c.save();
  c.lineWidth = Math.max(2, r * 0.1); c.strokeStyle = INK; c.lineJoin = 'round';
  c.beginPath(); c.moveTo(x + r * 0.35, y - r * 0.75); c.lineTo(x + r * 0.55, y - r * 1.05); c.stroke();
  c.fillStyle = '#ffb040'; c.beginPath(); c.arc(x + r * 0.55, y - r * 1.05, r * 0.12, 0, Math.PI * 2); c.fill(); c.stroke();
  const g = c.createLinearGradient(0, y - r * 0.8, 0, y + r * 0.8);
  g.addColorStop(0, css(shadeColor(col, 0.35))); g.addColorStop(1, css(shadeColor(col, -0.25)));
  c.fillStyle = g; c.beginPath(); c.roundRect(x - r * 0.85, y - r * 0.75, r * 1.7, r * 1.4, r * 0.3); c.fill(); c.stroke();
  c.fillStyle = '#20283a'; c.beginPath(); c.roundRect(x - r * 0.62, y - r * 0.45, r * 1.24, r * 0.6, r * 0.25); c.fill();
  for (const s of [-1, 1]) {
    c.fillStyle = '#7af0ff'; c.beginPath(); c.arc(x + s * r * 0.3, y - r * 0.15, r * 0.17, 0, Math.PI * 2); c.fill();
    c.fillStyle = '#ffffff'; c.beginPath(); c.arc(x + s * r * 0.3 - r * 0.05, y - r * 0.2, r * 0.06, 0, Math.PI * 2); c.fill();
  }
  c.fillStyle = css(ORANGE); c.fillRect(x - r * 0.85, y + r * 0.32, r * 1.7, r * 0.14);
  c.restore();
}

/** A containment pod: a glass capsule with a glowing monster silhouette. */
export function pod(c: CanvasRenderingContext2D, x: number, y: number, r: number, glow = GLOW): void {
  c.save();
  c.lineWidth = Math.max(2, r * 0.1); c.strokeStyle = INK; c.lineJoin = 'round';
  c.fillStyle = '#d8dee8'; c.beginPath(); c.roundRect(x - r * 0.62, y - r, r * 1.24, r * 0.32, r * 0.12); c.fill(); c.stroke();
  c.beginPath(); c.roundRect(x - r * 0.72, y + r * 0.62, r * 1.44, r * 0.38, r * 0.12); c.fill(); c.stroke();
  const g = c.createLinearGradient(x - r * 0.5, 0, x + r * 0.5, 0);
  g.addColorStop(0, css(glow, 0.55)); g.addColorStop(0.5, css(glow, 0.9)); g.addColorStop(1, css(glow, 0.5));
  c.fillStyle = g; c.beginPath(); c.rect(x - r * 0.5, y - r * 0.68, r, r * 1.3); c.fill(); c.stroke();
  c.fillStyle = 'rgba(255,255,255,0.55)'; c.fillRect(x - r * 0.38, y - r * 0.6, r * 0.12, r * 1.1);
  blobFace(c, x + r * 0.05, y + r * 0.05, r * 0.3, 0x2a8a7a, true);
  c.fillStyle = css(ORANGE); c.fillRect(x - r * 0.62, y - r * 0.76, r * 1.24, r * 0.08);
  c.restore();
}
