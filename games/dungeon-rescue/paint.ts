// Dungeon Rescue: the palette and the small canvas painters the theme, the screens and the HUD share
// (no imports from them, so any module can use them first). The look: a castle dungeon's guardroom
// gear: dark oak boards strapped with iron and studded with rivets, heraldic cloth in crimson and
// royal blue with gold stitching, rope, iron key rings, parchment orders sealed with red wax.
import { shadeColor } from '@core';

export const INK = '#1a1214';
export const OAK = 0x6a4426;
export const OAK_DARK = 0x3e2614;
export const CRIMSON = 0xa8222e;
export const ROYAL = 0x2c4c8e;
export const IRON = 0x5c606c;
export const GOLD = 0xd8a838;
export const PARCH = 0xeedcb4;
export const MOSS = 0x3f7a3a;
export const EMBER = 0xe0582a;
export const SLATE = 0x6e6a74;

export const css = (c: number, a = 1): string => {
  const r = (c >> 16) & 255, g = (c >> 8) & 255, b = c & 255;
  return a >= 1 ? `rgb(${r},${g},${b})` : `rgba(${r},${g},${b},${a})`;
};

export function rng(seed: number): () => number {
  let s = (Math.abs(Math.floor(seed)) % 2147483646) + 1;
  return () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
}

/** Oak planks (horizontal), grain and a few knots, clipped to the current path. */
export function oak(c: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, base: number, seed: number, plank = 34): void {
  const r = rng(seed);
  for (let py = y, i = 0; py < y + h; py += plank, i++) {
    const ph = Math.min(plank, y + h - py);
    const tone = shadeColor(base, (r() - 0.5) * 0.18);
    const g = c.createLinearGradient(0, py, 0, py + ph);
    g.addColorStop(0, css(shadeColor(tone, 0.12))); g.addColorStop(0.6, css(tone)); g.addColorStop(1, css(shadeColor(tone, -0.22)));
    c.fillStyle = g;
    c.fillRect(x, py, w, ph);
    // grain
    c.strokeStyle = 'rgba(30,16,6,0.22)'; c.lineWidth = 1;
    for (let k = 0; k < 3; k++) {
      const gy = py + ph * (0.25 + k * 0.25) + (r() - 0.5) * 3;
      c.beginPath(); c.moveTo(x, gy);
      for (let gx = x; gx < x + w; gx += 18) c.lineTo(gx + 18, gy + Math.sin(gx * 0.03 + k + i) * 1.6);
      c.stroke();
    }
    // a knot now and then
    if (r() < 0.6) { const kx = x + r() * w, ky = py + ph / 2; c.fillStyle = 'rgba(40,20,8,0.45)'; c.beginPath(); c.ellipse(kx, ky, 5 + r() * 5, 2.5, 0, 0, Math.PI * 2); c.fill(); }
    // the seam between planks
    c.fillStyle = 'rgba(20,10,4,0.55)'; c.fillRect(x, py + ph - 2, w, 2);
  }
}

/** An iron strap with rivets along it. */
export function strap(c: CanvasRenderingContext2D, x: number, y: number, w: number, h: number): void {
  const g = c.createLinearGradient(0, y, 0, y + h);
  g.addColorStop(0, '#8a8e98'); g.addColorStop(0.5, css(IRON)); g.addColorStop(1, '#34363e');
  c.fillStyle = g; c.fillRect(x, y, w, h);
  c.strokeStyle = 'rgba(10,10,14,0.8)'; c.lineWidth = 1.5; c.strokeRect(x + 0.75, y + 0.75, w - 1.5, h - 1.5);
  const n = Math.max(2, Math.floor(Math.max(w, h) / 34));
  for (let i = 0; i < n; i++) {
    const t = (i + 0.5) / n;
    rivet(c, w > h ? x + w * t : x + w / 2, w > h ? y + h / 2 : y + h * t, Math.min(w, h) * 0.24);
  }
}

export function rivet(c: CanvasRenderingContext2D, x: number, y: number, r: number): void {
  const g = c.createRadialGradient(x - r * 0.35, y - r * 0.35, r * 0.1, x, y, r);
  g.addColorStop(0, '#e8d8a0'); g.addColorStop(0.5, css(GOLD)); g.addColorStop(1, '#5a4010');
  c.fillStyle = g; c.beginPath(); c.arc(x, y, r, 0, Math.PI * 2); c.fill();
  c.strokeStyle = 'rgba(20,12,4,0.7)'; c.lineWidth = 1; c.stroke();
}

/** An iron corner bracket (an L of iron with three rivets). */
export function bracket(c: CanvasRenderingContext2D, x: number, y: number, s: number, sx: number, sy: number): void {
  c.save(); c.translate(x, y); c.scale(sx, sy);
  c.fillStyle = css(IRON); c.strokeStyle = 'rgba(10,10,14,0.85)'; c.lineWidth = 1.6;
  c.beginPath(); c.moveTo(0, 0); c.lineTo(s, 0); c.lineTo(s, s * 0.32); c.lineTo(s * 0.32, s * 0.32); c.lineTo(s * 0.32, s); c.lineTo(0, s); c.closePath();
  const g = c.createLinearGradient(0, 0, s, s); g.addColorStop(0, '#9a9ea8'); g.addColorStop(1, '#3a3c44');
  c.fillStyle = g; c.fill(); c.stroke();
  rivet(c, s * 0.16, s * 0.16, s * 0.09); rivet(c, s * 0.7, s * 0.16, s * 0.08); rivet(c, s * 0.16, s * 0.7, s * 0.08);
  c.restore();
}

/** Heraldic cloth: a woven face in the colour with soft folds, clipped to the current path. */
export function cloth(c: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, base: number, seed: number): void {
  const r = rng(seed);
  const g = c.createLinearGradient(0, y, 0, y + h);
  g.addColorStop(0, css(shadeColor(base, 0.22))); g.addColorStop(0.55, css(base)); g.addColorStop(1, css(shadeColor(base, -0.3)));
  c.fillStyle = g; c.fillRect(x, y, w, h);
  // folds
  for (let i = 0; i < Math.max(2, Math.floor(w / 60)); i++) {
    const fx = x + r() * w, fw = 10 + r() * 24;
    const fg = c.createLinearGradient(fx - fw, 0, fx + fw, 0);
    fg.addColorStop(0, 'rgba(0,0,0,0)'); fg.addColorStop(0.5, 'rgba(255,255,255,0.08)'); fg.addColorStop(1, 'rgba(0,0,0,0.1)');
    c.fillStyle = fg; c.fillRect(fx - fw, y, fw * 2, h);
  }
  // weave
  c.fillStyle = 'rgba(0,0,0,0.05)';
  for (let yy = y; yy < y + h; yy += 3) c.fillRect(x, yy, w, 1);
}

/** Gold stitching along a rounded rect. */
export function stitch(c: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, rad: number, width = 2): void {
  c.save();
  c.setLineDash([5, 4]);
  c.lineWidth = width; c.strokeStyle = 'rgba(255,226,140,0.9)';
  c.beginPath(); c.roundRect(x, y, w, h, rad); c.stroke();
  c.restore();
}

/** A rope from one point to another (twisted strands). */
export function rope(c: CanvasRenderingContext2D, x0: number, y0: number, x1: number, y1: number, th = 7, sag = 0): void {
  const len = Math.hypot(x1 - x0, y1 - y0);
  const n = Math.max(4, Math.floor(len / (th * 0.9)));
  const pt = (t: number) => [x0 + (x1 - x0) * t, y0 + (y1 - y0) * t + Math.sin(t * Math.PI) * sag] as [number, number];
  c.save();
  c.lineCap = 'round';
  c.strokeStyle = '#3a2610'; c.lineWidth = th + 2.5;
  c.beginPath(); for (let i = 0; i <= n; i++) { const [px, py] = pt(i / n); if (i) c.lineTo(px, py); else c.moveTo(px, py); } c.stroke();
  c.strokeStyle = '#c89a58'; c.lineWidth = th;
  c.beginPath(); for (let i = 0; i <= n; i++) { const [px, py] = pt(i / n); if (i) c.lineTo(px, py); else c.moveTo(px, py); } c.stroke();
  c.strokeStyle = 'rgba(80,48,16,0.75)'; c.lineWidth = 1.6;
  for (let i = 0; i < n; i++) {
    const [ax, ay] = pt(i / n), [bx, by] = pt((i + 0.6) / n);
    c.beginPath(); c.moveTo(ax - th * 0.35, ay + th * 0.35); c.lineTo(bx + th * 0.35, by - th * 0.35); c.stroke();
  }
  c.restore();
}

/** Parchment: a warm sheet with mottling and a darker edge, clipped to the current path. */
export function parchment(c: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, seed: number): void {
  const r = rng(seed);
  c.fillStyle = css(PARCH); c.fillRect(x, y, w, h);
  for (let i = 0; i < (w * h) / 900; i++) {
    c.fillStyle = r() < 0.5 ? 'rgba(160,120,60,0.07)' : 'rgba(255,250,235,0.12)';
    c.beginPath(); c.arc(x + r() * w, y + r() * h, 4 + r() * 16, 0, Math.PI * 2); c.fill();
  }
  const g = c.createRadialGradient(x + w / 2, y + h / 2, Math.min(w, h) * 0.3, x + w / 2, y + h / 2, Math.max(w, h) * 0.75);
  g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(110,70,20,0.32)');
  c.fillStyle = g; c.fillRect(x, y, w, h);
}

/** A red wax seal with a stamped key. */
export function seal(c: CanvasRenderingContext2D, x: number, y: number, r: number): void {
  c.save();
  c.fillStyle = '#8a1a20';
  c.beginPath();
  for (let i = 0; i < 14; i++) { const a = (i / 14) * Math.PI * 2, rr = r * (i % 2 ? 0.92 : 1.04); c.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr); }
  c.closePath(); c.fill();
  const g = c.createRadialGradient(x - r * 0.3, y - r * 0.3, r * 0.1, x, y, r);
  g.addColorStop(0, '#e0505a'); g.addColorStop(1, '#8a1a20');
  c.fillStyle = g; c.beginPath(); c.arc(x, y, r * 0.74, 0, Math.PI * 2); c.fill();
  c.strokeStyle = 'rgba(70,6,10,0.85)'; c.lineWidth = r * 0.1;
  keyShape(c, x, y, r * 0.55, -0.8);
  c.restore();
}

/** A key outline (for seals, icons and the frame). */
export function keyShape(c: CanvasRenderingContext2D, x: number, y: number, s: number, rot: number, fill: string | null = null): void {
  c.save(); c.translate(x, y); c.rotate(rot);
  c.beginPath();
  c.arc(-s * 0.55, 0, s * 0.32, 0, Math.PI * 2);
  c.moveTo(-s * 0.23, 0); c.lineTo(s * 0.8, 0);
  c.moveTo(s * 0.55, 0); c.lineTo(s * 0.55, s * 0.28);
  c.moveTo(s * 0.75, 0); c.lineTo(s * 0.75, s * 0.22);
  if (fill) { c.fillStyle = fill; c.fill(); }
  c.stroke();
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

/** A heater shield split per bend (crimson and blue), its rim gilt. */
export function shield(c: CanvasRenderingContext2D, x: number, y: number, w: number, h: number): Path2D {
  const p = new Path2D();
  p.moveTo(x - w / 2, y - h / 2);
  p.lineTo(x + w / 2, y - h / 2);
  p.lineTo(x + w / 2, y + h * 0.05);
  p.quadraticCurveTo(x + w / 2, y + h * 0.38, x, y + h / 2);
  p.quadraticCurveTo(x - w / 2, y + h * 0.38, x - w / 2, y + h * 0.05);
  p.closePath();
  c.save();
  c.clip(p);
  c.fillStyle = css(CRIMSON); c.fillRect(x - w / 2, y - h / 2, w, h);
  c.fillStyle = css(ROYAL);
  c.beginPath(); c.moveTo(x - w / 2, y - h / 2); c.lineTo(x + w / 2, y + h / 2); c.lineTo(x - w / 2, y + h / 2); c.closePath(); c.fill();
  const g = c.createLinearGradient(x - w / 2, y - h / 2, x + w / 2, y + h / 2);
  g.addColorStop(0, 'rgba(255,255,255,0.22)'); g.addColorStop(0.5, 'rgba(255,255,255,0)'); g.addColorStop(1, 'rgba(0,0,0,0.25)');
  c.fillStyle = g; c.fillRect(x - w / 2, y - h / 2, w, h);
  c.restore();
  c.lineWidth = Math.max(3, w * 0.06); c.strokeStyle = css(GOLD); c.stroke(p);
  c.lineWidth = Math.max(1.5, w * 0.018); c.strokeStyle = INK; c.stroke(p);
  return p;
}

/** A portcullis (barred gate) in gold, its middle at (x, y). */
export function portcullis(c: CanvasRenderingContext2D, x: number, y: number, w: number, h: number): void {
  c.save();
  c.strokeStyle = css(GOLD); c.lineWidth = Math.max(2, w * 0.08); c.lineCap = 'round';
  for (let i = 0; i < 4; i++) { const px = x - w / 2 + (w * (i + 0.5)) / 4; c.beginPath(); c.moveTo(px, y - h / 2); c.lineTo(px, y + h / 2); c.stroke(); }
  for (let j = 0; j < 3; j++) { const py = y - h / 2 + (h * (j + 0.6)) / 3.4; c.beginPath(); c.moveTo(x - w / 2, py); c.lineTo(x + w / 2, py); c.stroke(); }
  c.fillStyle = css(GOLD);
  for (let i = 0; i < 4; i++) { const px = x - w / 2 + (w * (i + 0.5)) / 4; c.beginPath(); c.moveTo(px - w * 0.06, y + h / 2); c.lineTo(px + w * 0.06, y + h / 2); c.lineTo(px, y + h / 2 + h * 0.14); c.closePath(); c.fill(); }
  c.restore();
}
