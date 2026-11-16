// Coaster Rush's menu theme (src/core/menu-theme.ts): Sancreek on circus tickets (notched corners,
// perforated stubs with a gold star, a double gold rule), the how-to on a fairground marquee (a
// cream panel in a red frame ringed with lit bulbs), bunting along the top and bottom and striped
// tent poles down the sides with a star badge in each corner, and a coaster car riding a loop in
// front of a red and cream sunburst behind the logo. Everything is painted on canvas once (under
// the Ayvago intro) and cached. Also the menu's own SHOP button in the same skin.
import Phaser from 'phaser';
import { t, txt, SkinButton, type MenuTheme, type SkinPainter, type BorderStyle } from '@core';
import { SANCREEK } from '@core/fonts/sancreek';
import { TOKEN_ICON } from './art';

/** The ride's summary card (PlayScene.finish). */
export const SUMMARY_W = 620, SUMMARY_H = 520;
/** The SHOP button on the menu. */
const SHOP_W = 360, SHOP_H = 100;

export const INK = '#4a0a12';
export const RED = 0xd42a36, BLUE = 0x2a5fa8, GOLD = 0xffcf4a;
const CREAM = '#fbf1dc', MAROON = 0x5a1420;

export const css = (c: number, a = 1): string => {
  const r = (c >> 16) & 255, g = (c >> 8) & 255, b = c & 255;
  return a >= 1 ? `rgb(${r},${g},${b})` : `rgba(${r},${g},${b},${a})`;
};
export const shade = (c: number, k: number): number => {
  const f = (v: number) => Math.round(k > 0 ? v + (255 - v) * k : v * (1 + k));
  return (f((c >> 16) & 255) << 16) | (f((c >> 8) & 255) << 8) | f(c & 255);
};
function rng(seed: number): () => number {
  let s = (seed >>> 0) % 2147483647 || 1;
  return () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
}

/** A ticket's outline: a rectangle with concave (punched) corners. */
function ticketShape(x: number, y: number, w: number, h: number, n: number): Path2D {
  const p = new Path2D();
  p.moveTo(x + n, y);
  p.lineTo(x + w - n, y);
  p.arc(x + w, y, n, Math.PI, Math.PI / 2, true);
  p.lineTo(x + w, y + h - n);
  p.arc(x + w, y + h, n, -Math.PI / 2, Math.PI, true);
  p.lineTo(x + n, y + h);
  p.arc(x, y + h, n, 0, -Math.PI / 2, true);
  p.lineTo(x, y + n);
  p.arc(x, y, n, Math.PI / 2, 0, true);
  p.closePath();
  return p;
}

export function star(c: CanvasRenderingContext2D, x: number, y: number, R: number, fill: string, stroke?: string): void {
  c.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5, rr = i % 2 ? R * 0.45 : R;
    i ? c.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr) : c.moveTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
  }
  c.closePath();
  c.fillStyle = fill; c.fill();
  if (stroke) { c.strokeStyle = stroke; c.lineWidth = Math.max(1, R * 0.16); c.lineJoin = 'round'; c.stroke(); }
}

/** A light bulb: lit (a warm glow) or dark (a dull glass). */
export function bulb(c: CanvasRenderingContext2D, x: number, y: number, R: number, lit = true): void {
  c.save();
  if (lit) {
    const halo = c.createRadialGradient(x, y, R * 0.4, x, y, R * 2.6);
    halo.addColorStop(0, 'rgba(255,230,140,0.55)'); halo.addColorStop(1, 'rgba(255,200,80,0)');
    c.fillStyle = halo; c.beginPath(); c.arc(x, y, R * 2.6, 0, Math.PI * 2); c.fill();
  }
  const g = c.createRadialGradient(x - R * 0.3, y - R * 0.35, R * 0.1, x, y, R);
  if (lit) { g.addColorStop(0, '#ffffff'); g.addColorStop(0.45, '#fff2b0'); g.addColorStop(1, '#e8a020'); }
  else { g.addColorStop(0, '#d8c8a8'); g.addColorStop(1, '#6a5030'); }
  c.fillStyle = g;
  c.beginPath(); c.arc(x, y, R, 0, Math.PI * 2); c.fill();
  c.strokeStyle = 'rgba(80,30,10,0.7)'; c.lineWidth = Math.max(0.8, R * 0.22);
  c.stroke();
  c.restore();
}

/** Bulbs spaced evenly round a rounded rectangle's path (inset from the edge). */
export function bulbRing(c: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, spacing: number, R: number): void {
  const nx = Math.max(2, Math.round(w / spacing)), ny = Math.max(2, Math.round(h / spacing));
  for (let i = 0; i <= nx; i++) { bulb(c, x + (w * i) / nx, y, R); bulb(c, x + (w * i) / nx, y + h, R); }
  for (let i = 1; i < ny; i++) { bulb(c, x, y + (h * i) / ny, R); bulb(c, x + w, y + (h * i) / ny, R); }
}

/**
 * The circus-ticket skin: tickets with punched corners, a double gold rule, faint printed stripes
 * and, on the big ones, perforated stubs with a gold star; boards are marquee panels ringed with
 * bulbs, the switch's track a dark slot with unlit bulbs. Hover glows gold, the selected segment
 * gets a gold rule, a press sinks.
 */
export const ticketPainter: SkinPainter = (c, kind, w, h, o) => {
  const P = o.palette, r = rng(o.seed);
  const sunk = o.state === 'down' || o.state === 'off' || kind === 'track';
  const color = o.state === 'off' ? shade(o.color, -0.42) : o.color;
  const round = kind === 'round';
  const n = round ? 0 : Math.min(14, h * 0.17);
  const shape = round ? (() => { const p = new Path2D(); p.arc(w / 2, h / 2, Math.min(w, h) / 2, 0, Math.PI * 2); return p; })() : ticketShape(0, 0, w, h, n);
  c.save();
  c.translate(0, o.state === 'down' ? 3 : 0);
  if (o.state === 'over') {
    c.save();
    c.shadowColor = css(GOLD, 0.95); c.shadowBlur = 16;
    c.fillStyle = css(GOLD); c.fill(shape);
    c.restore();
  }
  c.save();
  c.shadowColor = 'rgba(0,0,0,0.55)';
  c.shadowBlur = sunk ? 3 : 9;
  c.shadowOffsetY = sunk ? 1 : 6;
  c.fillStyle = '#000'; c.fill(shape);
  c.restore();
  if (kind === 'track') {
    c.fillStyle = css(shade(MAROON, -0.35)); c.fill(shape);
    c.save(); c.clip(shape);
    const top = c.createLinearGradient(0, 0, 0, 16);
    top.addColorStop(0, 'rgba(0,0,0,0.55)'); top.addColorStop(1, 'rgba(0,0,0,0)');
    c.fillStyle = top; c.fillRect(0, 0, w, 16);
    c.restore();
    c.lineWidth = 2.5; c.strokeStyle = css(shade(GOLD, -0.45)); c.stroke(shape);
    c.restore();
    return;
  }
  if (kind === 'board') {
    // a marquee panel: red and cream stripes in a gold frame ringed with bulbs
    c.save(); c.clip(shape);
    for (let x = 0, i = 0; x < w; x += 22, i++) { c.fillStyle = i % 2 ? CREAM : css(RED); c.fillRect(x, 0, 22, h); }
    c.restore();
    c.lineWidth = 10; c.strokeStyle = css(shade(GOLD, -0.15)); c.stroke(shape);
    c.lineWidth = 2.5; c.strokeStyle = css(shade(GOLD, -0.6)); c.stroke(shape);
    bulbRing(c, 6, 6, w - 12, h - 12, 30, 3.6);
    c.restore();
    return;
  }
  // the ticket's card: lighter at the top, faint printed stripes, a little paper grain
  const body = c.createLinearGradient(0, 0, 0, h);
  body.addColorStop(0, css(shade(color, sunk ? -0.05 : 0.16)));
  body.addColorStop(0.55, css(color));
  body.addColorStop(1, css(shade(color, -0.26)));
  c.fillStyle = body; c.fill(shape);
  c.save(); c.clip(shape);
  if (!round) for (let x = 8, i = 0; x < w; x += 18, i++) if (i % 2) { c.fillStyle = 'rgba(255,245,220,0.09)'; c.fillRect(x, 0, 18, h); }
  for (let i = 0; i < w * h * 0.004; i++) {
    c.fillStyle = r() < 0.5 ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.1)';
    c.fillRect(r() * w, r() * h, 1.4, 1.4);
  }
  if (sunk) {
    const top = c.createLinearGradient(0, 0, 0, 14);
    top.addColorStop(0, 'rgba(0,0,0,0.5)'); top.addColorStop(1, 'rgba(0,0,0,0)');
    c.fillStyle = top; c.fillRect(0, 0, w, 14);
  } else {
    c.fillStyle = 'rgba(255,255,255,0.25)'; c.fillRect(0, 0, w, 2.5);
    c.fillStyle = 'rgba(0,0,0,0.26)'; c.fillRect(0, h - 4, w, 4);
  }
  c.restore();
  const gold = o.state === 'off' ? css(GOLD, 0.45) : css(GOLD);
  if (round) {
    c.lineWidth = 3; c.strokeStyle = gold;
    c.beginPath(); c.arc(w / 2, h / 2, Math.min(w, h) / 2 - 5, 0, Math.PI * 2); c.stroke();
    star(c, w / 2, h / 2, Math.min(w, h) * 0.22, gold);
  } else if (o.color !== P.board) {
    // the double rule
    const i1 = Math.min(7, h * 0.09);
    c.lineWidth = o.state === 'on' ? 3.5 : 2.2; c.strokeStyle = gold;
    c.stroke(ticketShape(i1, i1, w - i1 * 2, h - i1 * 2, Math.max(3, n - i1)));
    if (h >= 60) {
      c.lineWidth = 1; c.strokeStyle = o.state === 'off' ? 'rgba(251,241,220,0.3)' : 'rgba(251,241,220,0.6)';
      c.stroke(ticketShape(i1 + 4, i1 + 4, w - (i1 + 4) * 2, h - (i1 + 4) * 2, Math.max(2, n - i1 - 4)));
    }
    // the stubs: a perforation line and a star at each end of a big ticket
    if (kind === 'button' && w >= 260 && h >= 70) {
      const stub = Math.min(58, h * 0.6);
      for (const sx of [stub, w - stub]) {
        c.fillStyle = 'rgba(251,241,220,0.7)';
        for (let y = i1 + 6; y < h - i1 - 4; y += 7) { c.beginPath(); c.arc(sx, y, 1.5, 0, Math.PI * 2); c.fill(); }
        star(c, sx < w / 2 ? stub / 2 + 2 : w - stub / 2 - 2, h / 2, Math.min(13, h * 0.15), gold, css(shade(GOLD, -0.6)));
      }
      // the punched notches where the perforation meets the edges
      c.save(); c.globalCompositeOperation = 'destination-out';
      for (const sx of [stub, w - stub]) for (const sy of [0, h]) { c.beginPath(); c.arc(sx, sy, 4.5, 0, Math.PI * 2); c.fill(); }
      c.restore();
    }
  }
  c.lineWidth = 2.5;
  c.strokeStyle = css(shade(color, -0.72));
  c.stroke(shape);
  if (o.state === 'over') { c.lineWidth = 2.5; c.strokeStyle = css(shade(GOLD, 0.3)); c.stroke(shape); }
  if (o.state === 'down') { c.fillStyle = 'rgba(0,0,0,0.16)'; c.fill(shape); }
  c.restore();
};

/** The how-to and the pause / result card: a fairground marquee, a cream panel in a red frame ringed with lit bulbs. */
export function paintMarquee(c: CanvasRenderingContext2D, w: number, h: number): void {
  const R = 16, band = 18;
  const outer = new Path2D(); outer.roundRect(0, 0, w, h, R);
  c.save();
  c.shadowColor = 'rgba(0,0,0,0.6)'; c.shadowBlur = 16; c.shadowOffsetY = 8;
  c.fillStyle = '#000'; c.fill(outer);
  c.restore();
  // the red frame
  const red = c.createLinearGradient(0, 0, 0, h);
  red.addColorStop(0, css(shade(RED, 0.12))); red.addColorStop(1, css(shade(RED, -0.3)));
  c.fillStyle = red; c.fill(outer);
  // the cream panel with faint stripes
  const inner = new Path2D(); inner.roundRect(band, band, w - band * 2, h - band * 2, 8);
  const cream = c.createLinearGradient(0, band, 0, h - band);
  cream.addColorStop(0, '#fff8e8'); cream.addColorStop(1, '#f4e2c0');
  c.fillStyle = cream; c.fill(inner);
  c.save(); c.clip(inner);
  for (let x = band, i = 0; x < w - band; x += 26, i++) if (i % 2) { c.fillStyle = 'rgba(212,42,54,0.05)'; c.fillRect(x, band, 26, h - band * 2); }
  c.restore();
  c.lineWidth = 3; c.strokeStyle = css(shade(GOLD, -0.1)); c.stroke(inner);
  c.lineWidth = 3; c.strokeStyle = css(shade(RED, -0.65)); c.stroke(outer);
  c.lineWidth = 2; c.strokeStyle = css(GOLD, 0.8);
  c.beginPath(); c.roundRect(4, 4, w - 8, h - 8, R - 3); c.stroke();
  // the bulbs along the frame
  bulbRing(c, band / 2, band / 2, w - band, h - band, 32, 4.4);
  // gold corner rosettes
  for (const [x, y] of [[band / 2, band / 2], [w - band / 2, band / 2], [band / 2, h - band / 2], [w - band / 2, h - band / 2]]) {
    c.fillStyle = css(shade(GOLD, -0.1));
    c.beginPath(); c.arc(x, y, 10, 0, Math.PI * 2); c.fill();
    c.strokeStyle = css(shade(GOLD, -0.6)); c.lineWidth = 2; c.stroke();
    star(c, x, y, 7, '#fff6d0');
  }
}

// ------------------------------------------------------------------ the frame


const FLAGS = [RED, GOLD, BLUE, 0xfbf1dc];

/**
 * Bunting across the top and bottom; a striped tent pole down the sides. One painter serves all
 * four strips, so the sides are told apart by their length (the game is portrait: 1280 high).
 */
const buntingEdge: BorderStyle['edge'] = (c, len, thick) => {
  if (len > 1000) {
    // the pole: red and cream barber stripes, a highlight, its outline
    const x0 = 3, pw = 11;
    c.save();
    c.beginPath(); c.rect(0, x0, len, pw); c.clip();
    c.fillStyle = CREAM; c.fillRect(0, x0, len, pw);
    c.fillStyle = css(RED);
    for (let x = -pw; x < len + pw; x += 18) { c.beginPath(); c.moveTo(x, x0); c.lineTo(x + 9, x0); c.lineTo(x + 9 + pw, x0 + pw); c.lineTo(x + pw, x0 + pw); c.closePath(); c.fill(); }
    const g = c.createLinearGradient(0, x0, 0, x0 + pw);
    g.addColorStop(0, 'rgba(0,0,0,0.3)'); g.addColorStop(0.4, 'rgba(255,255,255,0.25)'); g.addColorStop(1, 'rgba(0,0,0,0.35)');
    c.fillStyle = g; c.fillRect(0, x0, len, pw);
    c.restore();
    c.strokeStyle = INK; c.lineWidth = 1.5;
    c.strokeRect(-2, x0, len + 4, pw);
    return;
  }
  // a string sagging between hooks, triangular pennants hanging from it
  const period = 104, sag = 7, top = 5, fw = 24, fl = Math.min(thick - 10, 26);
  const yAt = (x: number) => { const f = ((x % period) + period) % period / period; return top + sag * 4 * f * (1 - f); };
  c.strokeStyle = '#3a2a1a'; c.lineWidth = 2;
  c.beginPath();
  for (let x = 0; x <= len; x += 4) x ? c.lineTo(x, yAt(x)) : c.moveTo(x, yAt(x));
  c.stroke();
  let k = 0;
  for (let x = 14; x < len - 10; x += 32, k++) {
    const y1 = yAt(x), y2 = yAt(x + fw), mx = x + fw / 2;
    const col = FLAGS[k % FLAGS.length];
    c.save();
    c.shadowColor = 'rgba(0,0,0,0.45)'; c.shadowBlur = 3; c.shadowOffsetY = 2;
    c.beginPath(); c.moveTo(x, y1); c.lineTo(x + fw, y2); c.lineTo(mx, (y1 + y2) / 2 + fl); c.closePath();
    const g = c.createLinearGradient(x, 0, x + fw, 0);
    g.addColorStop(0, css(shade(col, 0.12))); g.addColorStop(1, css(shade(col, -0.2)));
    c.fillStyle = g; c.fill();
    c.restore();
    c.strokeStyle = 'rgba(40,10,10,0.8)'; c.lineWidth = 1.3; c.stroke();
    c.fillStyle = 'rgba(255,255,255,0.3)';
    c.beginPath(); c.moveTo(x + 3, y1 + 1.5); c.lineTo(mx, (y1 + y2) / 2 + fl * 0.5); c.lineTo(x + 7, y1 + 1); c.closePath(); c.fill();
  }
};

/** A red badge with a gold star and a ring of bulbs, where the bunting meets the pole. */
function cornerBadge(c: CanvasRenderingContext2D, size: number): void {
  const R = size * 0.32, cx = size * 0.4, cy = size * 0.4;
  c.save();
  c.shadowColor = 'rgba(0,0,0,0.5)'; c.shadowBlur = 5; c.shadowOffsetY = 2;
  c.fillStyle = css(RED);
  c.beginPath(); c.arc(cx, cy, R, 0, Math.PI * 2); c.fill();
  c.restore();
  c.lineWidth = 3; c.strokeStyle = css(GOLD);
  c.beginPath(); c.arc(cx, cy, R - 2, 0, Math.PI * 2); c.stroke();
  c.lineWidth = 1.5; c.strokeStyle = INK;
  c.beginPath(); c.arc(cx, cy, R, 0, Math.PI * 2); c.stroke();
  for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2; bulb(c, cx + Math.cos(a) * (R - 7), cy + Math.sin(a) * (R - 7), 2.2); }
  star(c, cx, cy, R * 0.5, css(GOLD), INK);
}

// ------------------------------------------------------------------ the emblem

/** A coaster car riding a loop in front of a red and cream sunburst ringed with bulbs. */
export function loopEmblem(c: CanvasRenderingContext2D, size: number): void {
  const u = size / 100;
  c.save();
  c.translate(size / 2, size / 2);
  const glow = c.createRadialGradient(0, -4 * u, 10 * u, 0, -4 * u, 50 * u);
  glow.addColorStop(0, 'rgba(255,210,110,0.5)'); glow.addColorStop(1, 'rgba(255,210,110,0)');
  c.fillStyle = glow; c.fillRect(-50 * u, -50 * u, 100 * u, 100 * u);
  // the sunburst
  const cy = -6 * u, R = 44 * u;
  c.save();
  c.beginPath(); c.arc(0, cy, R, 0, Math.PI * 2); c.clip();
  for (let i = 0; i < 20; i++) {
    const a0 = (i / 20) * Math.PI * 2, a1 = ((i + 1) / 20) * Math.PI * 2;
    c.fillStyle = i % 2 ? '#fbe6c0' : css(RED);
    c.beginPath(); c.moveTo(0, cy); c.arc(0, cy, R, a0, a1); c.closePath(); c.fill();
  }
  const fade = c.createRadialGradient(0, cy, 4 * u, 0, cy, R);
  fade.addColorStop(0, 'rgba(255,240,200,0.75)'); fade.addColorStop(0.5, 'rgba(255,240,200,0.1)'); fade.addColorStop(1, 'rgba(0,0,0,0.15)');
  c.fillStyle = fade; c.fillRect(-R, cy - R, R * 2, R * 2);
  c.restore();
  c.lineWidth = 5 * u; c.strokeStyle = css(shade(GOLD, -0.1));
  c.beginPath(); c.arc(0, cy, R, 0, Math.PI * 2); c.stroke();
  c.lineWidth = 1.6 * u; c.strokeStyle = INK;
  c.beginPath(); c.arc(0, cy, R + 2.5 * u, 0, Math.PI * 2); c.stroke();
  for (let i = 0; i < 16; i++) { const a = (i / 16) * Math.PI * 2; bulb(c, Math.cos(a) * R, cy + Math.sin(a) * R, 2.2 * u); }
  // the loop's supports: a red lattice down to the ground
  const ly = -8 * u, LR = 27 * u;
  c.lineCap = 'round';
  for (const s of [-1, 1]) {
    c.strokeStyle = INK; c.lineWidth = 5 * u;
    c.beginPath(); c.moveTo(s * 8 * u, ly + LR - 2 * u); c.lineTo(s * 22 * u, 46 * u); c.stroke();
    c.strokeStyle = css(RED); c.lineWidth = 3 * u;
    c.beginPath(); c.moveTo(s * 8 * u, ly + LR - 2 * u); c.lineTo(s * 22 * u, 46 * u); c.stroke();
  }
  c.strokeStyle = css(RED); c.lineWidth = 1.6 * u;
  for (let y = 22; y < 44; y += 7) { const k = (y - 12) / 32; c.beginPath(); c.moveTo(-(8 + 12 * k) * u, y * u); c.lineTo((8 + 12 * (k + 0.2)) * u, (y + 6) * u); c.stroke(); }
  // the run-in track along the bottom
  c.strokeStyle = INK; c.lineWidth = 5.5 * u;
  c.beginPath(); c.moveTo(-46 * u, 30 * u); c.quadraticCurveTo(-20 * u, 18 * u, 0, ly + LR); c.quadraticCurveTo(20 * u, 18 * u, 46 * u, 30 * u); c.stroke();
  c.strokeStyle = '#f0f0f8'; c.lineWidth = 3 * u;
  c.stroke();
  // the loop: two rails with ties between them
  c.strokeStyle = INK; c.lineWidth = 9 * u;
  c.beginPath(); c.arc(0, ly, LR, 0, Math.PI * 2); c.stroke();
  c.strokeStyle = '#8a1a22'; c.lineWidth = 6 * u; c.stroke();
  c.strokeStyle = '#f2ecf6'; c.lineWidth = 1.8 * u;
  c.beginPath(); c.arc(0, ly, LR + 2.2 * u, 0, Math.PI * 2); c.stroke();
  c.beginPath(); c.arc(0, ly, LR - 2.2 * u, 0, Math.PI * 2); c.stroke();
  // the car, upside down near the top of the loop on the left, riders' arms up
  const a = -2.5;
  c.save();
  c.translate(Math.cos(a) * (LR - 6.5 * u), ly + Math.sin(a) * (LR - 6.5 * u));
  c.scale(1.3, 1.3);
  c.rotate(a + Math.PI / 2);
  // (local frame: +y points to the loop's centre, the car's wheels on the rail at y = -5)
  c.scale(1, -1);
  c.translate(0, -1 * u);
  c.lineJoin = 'round';
  const body = new Path2D();
  body.moveTo(-11 * u, 4 * u); body.lineTo(11 * u, 4 * u); body.lineTo(12 * u, -3 * u); body.quadraticCurveTo(13 * u, -7 * u, 9 * u, -7 * u);
  body.lineTo(-9 * u, -7 * u); body.quadraticCurveTo(-14 * u, -7 * u, -12 * u, -2 * u); body.closePath();
  // riders: two heads and raised arms
  for (const x of [-5, 4]) {
    c.strokeStyle = INK; c.lineWidth = 3.2 * u;
    c.beginPath(); c.moveTo((x - 2) * u, -9 * u); c.lineTo((x - 4) * u, -17 * u); c.moveTo((x + 2) * u, -9 * u); c.lineTo((x + 4) * u, -17 * u); c.stroke();
    c.strokeStyle = '#f2c8a0'; c.lineWidth = 1.8 * u; c.stroke();
    c.fillStyle = '#f2c8a0'; c.strokeStyle = INK; c.lineWidth = 1.4 * u;
    c.beginPath(); c.arc(x * u, -10 * u, 3.4 * u, 0, Math.PI * 2); c.fill(); c.stroke();
  }
  const paint = c.createLinearGradient(0, -7 * u, 0, 4 * u);
  paint.addColorStop(0, '#ff5a5a'); paint.addColorStop(1, '#a8141e');
  c.fillStyle = paint; c.fill(body);
  c.strokeStyle = INK; c.lineWidth = 1.8 * u; c.stroke(body);
  c.fillStyle = css(GOLD); c.fillRect(-10 * u, -2 * u, 20 * u, 2 * u);
  c.fillStyle = '#2a2030';
  for (const x of [-7, 7]) { c.beginPath(); c.arc(x * u, 5 * u, 2.4 * u, 0, Math.PI * 2); c.fill(); }
  c.restore();
  // a few gold stars round the burst
  star(c, -40 * u, -38 * u, 5 * u, css(GOLD), INK);
  star(c, 41 * u, -30 * u, 4 * u, css(GOLD), INK);
  star(c, 36 * u, -44 * u, 2.6 * u, '#fff6d0');
  c.restore();
}

/** Bunting along the top and bottom, striped tent poles down the sides, a star badge in each corner. */
export const FAIR_BORDER: BorderStyle = { thick: 38, inset: 0, edge: buntingEdge, corner: { size: 52, draw: cornerBadge } };

// ------------------------------------------------------------------ the theme

export const FAIR_THEME: MenuTheme = {
  font: SANCREEK,
  palette: {
    primary: RED, secondary: BLUE, board: MAROON, trim: GOLD,
    label: '#fff8e6', labelStroke: INK, muted: '#d8c0a8', accent: '#ffd04a',
    heading: '#c41e2e', body: '#3a1a10', icon: 0xfff4dc, shade: 0x0c1020,
  },
  logo: {
    fill: ['#fffbe8', '#ffe27a', '#f6b21c', '#c06a0a'],
    outline: INK,
    rim: '#fff2d0',
    depth: '#a01828',
    size: 150,
    emblem: { draw: loopEmblem, size: 250, overlap: 0.24 },
  },
  skin: ticketPainter,
  // the SHOP button (menuOption)
  pieces: [{ kind: 'button', w: SHOP_W, h: SHOP_H }],
  // dim: the backdrop's darkening (main.ts drew it as its own layer before the theme)
  frame: {
    border: FAIR_BORDER,
    notes: paintMarquee,
    vignette: 0.5,
    dim: 0.35,
  },
  overlays: {
    lose: '#c41e2e',
    win: '#ffb020',
    adColor: 0x2f7a4a,
    // the heading PlayScene passes to endGame (and the summary's)
    titles: ['rideOver'],
  },
  // the ride's summary (PlayScene.finish)
  cards: [{ w: SUMMARY_W, h: SUMMARY_H }],
};

/** The SHOP button under the difficulty switch: a ticket with the label and the token count. */
export function shopButton(scene: Phaser.Scene, x: number, y: number, open: () => void, tokens: () => number): { btn: SkinButton; refresh: () => void } {
  const btn = new SkinButton(scene, x, y, t('shop'), open, { width: SHOP_W, height: SHOP_H, size: 36 });
  btn.setLabelY(-14);
  const icon = scene.add.image(0, 0, TOKEN_ICON).setDisplaySize(26, 26);
  const count = txt(scene, 0, 0, '', { size: 21, color: '#fff0c8', strokeThickness: 4, stroke: INK });
  btn.add([icon, count]);
  const refresh = () => {
    btn.setText(t('shop')).fitLabel(SHOP_W - 130);
    count.setText(t('shopTokens', { n: tokens() }));
    const cw = 26 + 6 + count.width;
    icon.setPosition(-cw / 2 + 13, 25);
    count.setPosition(-cw / 2 + 32 + count.width / 2, 25);
  };
  refresh();
  return { btn, refresh };
}
