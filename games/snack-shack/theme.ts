// Snack Shack's menu theme (src/core/menu-theme.ts): a diner / food-truck look. Spicy Rice on
// striped awning buttons (red or teal awning stripes under a gloss, scalloped valance, a chrome
// rim), the how-to and the pause / result card on a chalkboard menu in a wooden frame with chalk
// doodles, a red-and-white gingham border with a diner badge in each corner, and the logo over a
// snack stall with a giant burger on its roof. The day's result is an order ticket. Everything is
// painted on canvas once (under the Ayvago intro) and cached.
import Phaser from 'phaser';
import { bake, type MenuTheme, type SkinPainter, type BorderStyle } from '@core';
import { SPICY_RICE } from '@core/fonts/spicy-rice';

export const RED = 0xe23b2e, TEAL = 0x23998a, CHALK = 0x24302b, MUSTARD = 0xffc23a, GREEN = 0x2fae5a;
export const INK = '#3a2418';
export const LABEL_STROKE = '#3a1408';
export const CHALK_INK = '#f4f1e6';

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

/** A chrome band along a path: a bright-dark-bright metal gradient. */
function chrome(c: CanvasRenderingContext2D, p: Path2D, h: number, width: number, dim = 0): void {
  const g = c.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, css(shade(0xf4f6fa, -dim))); g.addColorStop(0.35, css(shade(0x9aa4b4, -dim)));
  g.addColorStop(0.55, css(shade(0xffffff, -dim))); g.addColorStop(1, css(shade(0x6a7484, -dim)));
  c.strokeStyle = g; c.lineWidth = width; c.stroke(p);
}

/** A chalkboard: dark slate with chalk smudges (inside x, y, w, h). */
function chalkboard(c: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: () => number): void {
  const g = c.createLinearGradient(0, y, 0, y + h);
  g.addColorStop(0, css(shade(CHALK, 0.08))); g.addColorStop(1, css(shade(CHALK, -0.25)));
  c.fillStyle = g; c.fillRect(x, y, w, h);
  for (let i = 0; i < 6 + (w * h) / 40000; i++) {
    const sx = x + r() * w, sy = y + r() * h, rr = 20 + r() * 70;
    const sm = c.createRadialGradient(sx, sy, 0, sx, sy, rr);
    sm.addColorStop(0, 'rgba(255,255,255,0.06)'); sm.addColorStop(1, 'rgba(255,255,255,0)');
    c.fillStyle = sm; c.fillRect(sx - rr, sy - rr, rr * 2, rr * 2);
  }
  for (let i = 0; i < (w * h) / 300; i++) { c.fillStyle = 'rgba(255,255,255,0.05)'; c.fillRect(x + r() * w, y + r() * h, 1.2, 1.2); }
}

/**
 * The awning skin: stripes of the face colour and a lighter tint under a gloss, a scalloped
 * valance along the bottom, a chrome rim. Hover glows mustard, the selected segment gets a
 * mustard rim, a press sinks the button, 'off' fades it. Boards and the switch's track are
 * chalkboard slate in a wooden frame; a round piece is a gingham disc.
 */
export const awningSkin: SkinPainter = (c, kind, w, h, o) => {
  const r = rng(o.seed);
  const sunk = o.state === 'down' || o.state === 'off' || kind === 'track';
  const off = o.state === 'off';
  const round = kind === 'round';
  const R = round ? Math.min(w, h) / 2 : Math.min(20, h * 0.3);
  const shapeAt = (i: number): Path2D => {
    const p = new Path2D();
    if (round) p.arc(w / 2, h / 2, Math.min(w, h) / 2 - i, 0, Math.PI * 2);
    else p.roundRect(i, i, w - i * 2, h - i * 2, Math.max(3, R - i));
    return p;
  };
  const outer = shapeAt(0);
  c.save();
  c.translate(0, o.state === 'down' ? 3 : 0);
  if (o.state === 'over') {
    c.save();
    c.shadowColor = css(MUSTARD, 0.95); c.shadowBlur = 18;
    c.fillStyle = css(MUSTARD); c.fill(outer);
    c.restore();
  }
  c.save();
  c.shadowColor = 'rgba(0,0,0,0.55)'; c.shadowBlur = sunk ? 3 : 10; c.shadowOffsetY = sunk ? 1 : 6;
  c.fillStyle = '#000'; c.fill(outer);
  c.restore();
  if (kind === 'track' || kind === 'board' || o.color === o.palette.board) {
    // a chalkboard in a wooden frame
    const wood = c.createLinearGradient(0, 0, 0, h);
    wood.addColorStop(0, '#a8703a'); wood.addColorStop(1, '#5a3418');
    c.fillStyle = wood; c.fill(outer);
    const fw = kind === 'track' ? 5 : Math.max(6, Math.min(12, h * 0.08));
    const inner = shapeAt(fw);
    c.save(); c.clip(inner);
    chalkboard(c, 0, 0, w, h, r);
    if (kind === 'track') {
      const top = c.createLinearGradient(0, 0, 0, 16);
      top.addColorStop(0, 'rgba(0,0,0,0.55)'); top.addColorStop(1, 'rgba(0,0,0,0)');
      c.fillStyle = top; c.fillRect(0, 0, w, 16);
    }
    c.restore();
    c.lineWidth = 1.5; c.strokeStyle = 'rgba(30,15,5,0.8)'; c.stroke(inner); c.stroke(outer);
    c.restore();
    return;
  }
  const col = off ? shade(o.color, -0.35) : o.color;
  const rim = round ? 4 : Math.max(3, Math.min(5, h * 0.06));
  const face = shapeAt(rim);
  c.save(); c.clip(face);
  if (round) {
    // gingham: a check of the colour and white
    const s = Math.max(6, w / 6);
    c.fillStyle = '#fff7ee'; c.fillRect(0, 0, w, h);
    c.fillStyle = css(col, 0.5);
    for (let x = 0; x < w; x += s * 2) c.fillRect(x, 0, s, h);
    for (let y = 0; y < h; y += s * 2) c.fillRect(0, y, w, s);
  } else {
    const light = shade(col, 0.22);
    const sw = Math.max(14, Math.min(24, w / 10));
    for (let x = 0, i = 0; x < w; x += sw, i++) { c.fillStyle = css(i % 2 ? light : col); c.fillRect(x, 0, sw + 0.5, h); }
    // the valance: scallops along the bottom in the darker stripe
    const sc = Math.min(10, h * 0.13);
    c.fillStyle = css(shade(col, -0.22));
    c.fillRect(0, h - sc * 1.6, w, sc * 1.6);
    c.fillStyle = css(shade(col, -0.45));
    for (let x = sw / 2; x < w + sw; x += sw) { c.beginPath(); c.arc(x, h - sc * 1.6, sc * 0.55, 0, Math.PI); c.fill(); }
  }
  // the gloss and the shading
  const gl = c.createLinearGradient(0, 0, 0, h);
  gl.addColorStop(0, sunk ? 'rgba(0,0,0,0.25)' : 'rgba(255,255,255,0.3)');
  gl.addColorStop(0.45, 'rgba(255,255,255,0.04)');
  gl.addColorStop(1, 'rgba(40,10,0,0.3)');
  c.fillStyle = gl; c.fillRect(0, 0, w, h);
  if (!sunk && !round) { c.fillStyle = 'rgba(255,255,255,0.22)'; c.beginPath(); c.roundRect(rim + 6, rim + 3, w - rim * 2 - 12, Math.max(3, h * 0.14), 4); c.fill(); }
  for (let i = 0; i < (w * h) / 120; i++) { c.fillStyle = r() < 0.5 ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)'; c.fillRect(r() * w, r() * h, 1.4, 1.4); }
  c.restore();
  c.lineWidth = 1.5; c.strokeStyle = 'rgba(30,10,0,0.6)'; c.stroke(face);
  chrome(c, shapeAt(rim / 2), h, rim, off ? 0.35 : 0);
  c.lineWidth = 1.5; c.strokeStyle = 'rgba(20,20,30,0.8)'; c.stroke(outer);
  if (o.state === 'on') { c.lineWidth = 4; c.strokeStyle = css(MUSTARD); c.stroke(shapeAt(1)); }
  if (o.state === 'down') { c.fillStyle = 'rgba(0,0,0,0.14)'; c.fill(outer); }
  c.restore();
};

// ------------------------------------------------------------------ the chalkboard menu

/** Chalk doodles: a little burger and a cup with a straw. */
function doodles(c: CanvasRenderingContext2D, w: number, h: number): void {
  c.save();
  c.strokeStyle = 'rgba(255,250,235,0.22)'; c.lineWidth = 2.2; c.lineCap = 'round'; c.lineJoin = 'round';
  // the burger, bottom right
  const bx = w - 66, by = h - 56;
  c.beginPath(); c.arc(bx, by - 2, 22, Math.PI, 0); c.closePath(); c.stroke();
  c.beginPath(); for (let x = -24; x <= 24; x += 8) c.lineTo(bx + x, by + 6 + (x / 8) % 2 * 3); c.stroke();
  c.beginPath(); c.roundRect(bx - 23, by + 10, 46, 10, 5); c.stroke();
  for (const [x, y] of [[-8, -12], [4, -15], [12, -8]]) { c.beginPath(); c.arc(bx + x, by + y, 1, 0, Math.PI * 2); c.stroke(); }
  // the cup, bottom left
  const cx = 52, cy = h - 60;
  c.beginPath(); c.moveTo(cx - 14, cy - 18); c.lineTo(cx - 10, cy + 22); c.lineTo(cx + 10, cy + 22); c.lineTo(cx + 14, cy - 18); c.closePath(); c.stroke();
  c.beginPath(); c.moveTo(cx - 16, cy - 18); c.lineTo(cx + 16, cy - 18); c.stroke();
  c.beginPath(); c.moveTo(cx + 3, cy - 18); c.lineTo(cx + 9, cy - 34); c.lineTo(cx + 16, cy - 36); c.stroke();
  // a chalk star or two
  for (const [x, y] of [[w - 40, 44], [40, 46]]) {
    c.beginPath();
    for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + (i * Math.PI) / 5, rr = i % 2 ? 4 : 9; c.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr); }
    c.closePath(); c.stroke();
  }
  c.restore();
}

/** The how-to and the pause / result card: a chalkboard menu in a wooden frame. */
export function chalkMenu(c: CanvasRenderingContext2D, w: number, h: number): void {
  const fw = 14, r = rng(w * 5 + h);
  const outer = new Path2D(); outer.roundRect(0, 0, w, h, 12);
  c.save();
  c.shadowColor = 'rgba(0,0,0,0.6)'; c.shadowBlur = 16; c.shadowOffsetY = 8;
  c.fillStyle = '#000'; c.fill(outer);
  c.restore();
  const wood = c.createLinearGradient(0, 0, w, h);
  wood.addColorStop(0, '#b47a40'); wood.addColorStop(0.5, '#8a5428'); wood.addColorStop(1, '#5a3418');
  c.fillStyle = wood; c.fill(outer);
  c.save(); c.clip(outer);
  for (let i = 0; i < (w + h) / 3; i++) { c.strokeStyle = r() < 0.5 ? 'rgba(60,30,10,0.25)' : 'rgba(255,220,170,0.12)'; c.lineWidth = 1; const y = r() * h; c.beginPath(); c.moveTo(0, y); c.lineTo(w, y + (r() - 0.5) * 4); c.stroke(); }
  c.restore();
  c.fillStyle = 'rgba(255,230,190,0.25)'; c.fillRect(4, 3, w - 8, 2);
  chalkboard(c, fw, fw, w - fw * 2, h - fw * 2, r);
  c.save(); c.translate(fw, fw); doodles(c, w - fw * 2, h - fw * 2); c.restore();
  // the frame's inner shadow and its mitred corners
  c.lineWidth = 2; c.strokeStyle = 'rgba(20,10,0,0.75)'; c.strokeRect(fw, fw, w - fw * 2, h - fw * 2);
  c.strokeStyle = 'rgba(40,20,5,0.6)'; c.lineWidth = 1.5;
  for (const [x0, y0, x1, y1] of [[0, 0, fw, fw], [w, 0, w - fw, fw], [0, h, fw, h - fw], [w, h, w - fw, h - fw]]) { c.beginPath(); c.moveTo(x0, y0); c.lineTo(x1, y1); c.stroke(); }
  c.lineWidth = 2; c.strokeStyle = 'rgba(30,15,0,0.85)'; c.stroke(outer);
}

// ------------------------------------------------------------------ the order ticket

/** The day's result: an order ticket, cream paper with a red header band, ruled lines and a torn bottom edge. */
export function orderTicket(c: CanvasRenderingContext2D, w: number, h: number): void {
  const r = rng(w + h * 3);
  const tooth = 14;
  const p = new Path2D();
  p.moveTo(0, 8); p.quadraticCurveTo(0, 0, 8, 0); p.lineTo(w - 8, 0); p.quadraticCurveTo(w, 0, w, 8);
  p.lineTo(w, h - tooth);
  for (let x = w; x > 0; x -= tooth * 2) { p.lineTo(x - tooth, h); p.lineTo(Math.max(0, x - tooth * 2), h - tooth); }
  p.closePath();
  c.save();
  c.shadowColor = 'rgba(0,0,0,0.55)'; c.shadowBlur = 16; c.shadowOffsetY = 8;
  c.fillStyle = '#fff8ea'; c.fill(p);
  c.restore();
  c.save(); c.clip(p);
  const paper = c.createLinearGradient(0, 0, 0, h);
  paper.addColorStop(0, '#fffaf0'); paper.addColorStop(1, '#f2e6cc');
  c.fillStyle = paper; c.fillRect(0, 0, w, h);
  for (let i = 0; i < (w * h) / 500; i++) { c.fillStyle = 'rgba(120,80,30,0.05)'; c.fillRect(r() * w, r() * h, 2, 2); }
  // the header band and its punch holes
  c.fillStyle = css(RED); c.fillRect(0, 0, w, 22);
  c.fillStyle = 'rgba(255,255,255,0.25)'; c.fillRect(0, 3, w, 3);
  // ruled lines in pale blue, a red margin line
  c.strokeStyle = 'rgba(60,120,190,0.18)'; c.lineWidth = 1;
  for (let y = 120; y < h - 30; y += 52) { c.beginPath(); c.moveTo(18, y + 26); c.lineTo(w - 18, y + 26); c.stroke(); }
  c.strokeStyle = 'rgba(226,59,46,0.25)';
  c.beginPath(); c.moveTo(40, 22); c.lineTo(40, h - tooth); c.stroke();
  c.restore();
  c.lineWidth = 1.5; c.strokeStyle = 'rgba(80,50,20,0.5)'; c.stroke(p);
}

// ------------------------------------------------------------------ the frame

/** Gingham along the edges: red and white checks, a red line on the inner side. */
const gingham: BorderStyle['edge'] = (c, len, t) => {
  const s = t / 2;
  c.fillStyle = '#fff7ee'; c.fillRect(0, 0, len, t);
  c.fillStyle = css(RED, 0.55);
  for (let x = 0; x < len; x += s * 2) c.fillRect(x, 0, s, t);
  c.fillRect(0, 0, len, s);
  c.fillStyle = css(shade(RED, -0.1));
  for (let x = 0; x < len; x += s * 2) c.fillRect(x, 0, s, s);
  c.fillStyle = css(shade(RED, -0.4)); c.fillRect(0, t - 2.5, len, 2.5);
  c.fillStyle = 'rgba(0,0,0,0.25)'; c.fillRect(0, 0, len, 1.5);
};

/** A round diner badge in each corner: a red disc in a chrome ring with a white star. */
function dinerBadge(c: CanvasRenderingContext2D, size: number): void {
  const cx = size * 0.42, cy = size * 0.42, R = size * 0.36;
  c.save();
  c.shadowColor = 'rgba(0,0,0,0.55)'; c.shadowBlur = 6; c.shadowOffsetY = 2;
  c.fillStyle = css(RED); c.beginPath(); c.arc(cx, cy, R, 0, Math.PI * 2); c.fill();
  c.restore();
  const ring = new Path2D(); ring.arc(cx, cy, R - 2, 0, Math.PI * 2);
  chrome(c, ring, size, 4);
  c.beginPath();
  for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + (i * Math.PI) / 5, rr = i % 2 ? R * 0.24 : R * 0.55; c.lineTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr); }
  c.closePath(); c.fillStyle = '#fff7ee'; c.fill();
  c.lineWidth = 1.5; c.strokeStyle = 'rgba(40,10,0,0.8)'; c.beginPath(); c.arc(cx, cy, R, 0, Math.PI * 2); c.stroke();
}

export const GINGHAM_BORDER: BorderStyle = { thick: 16, inset: 2, edge: gingham, corner: { size: 56, draw: dinerBadge, inset: 0 } };

// ------------------------------------------------------------------ the emblem

/** A snack stall: a little shack with a striped awning and a giant burger on its roof. */
export function stallEmblem(c: CanvasRenderingContext2D, size: number): void {
  const u = size / 100;
  c.save();
  c.translate(size / 2, size / 2);
  const glow = c.createRadialGradient(0, -6 * u, 6 * u, 0, -6 * u, 50 * u);
  glow.addColorStop(0, 'rgba(255,214,120,0.6)'); glow.addColorStop(1, 'rgba(255,214,120,0)');
  c.fillStyle = glow; c.fillRect(-50 * u, -50 * u, 100 * u, 100 * u);
  const ink = '#2a1408';
  c.lineJoin = 'round';
  // the shack: a teal box with a counter and a serving window
  c.fillStyle = css(TEAL); c.strokeStyle = ink; c.lineWidth = 1.6 * u;
  c.beginPath(); c.roundRect(-32 * u, 4 * u, 64 * u, 38 * u, 3 * u); c.fill(); c.stroke();
  c.fillStyle = '#1a2a30'; c.beginPath(); c.rect(-24 * u, 10 * u, 48 * u, 16 * u); c.fill(); c.stroke();
  c.fillStyle = '#ffd88a'; c.fillRect(-23 * u, 11 * u, 46 * u, 6 * u);
  c.fillStyle = '#c8c8d0'; c.beginPath(); c.rect(-34 * u, 25 * u, 68 * u, 5 * u); c.fill(); c.stroke();
  // wheels
  c.fillStyle = '#2a2a30';
  for (const x of [-20, 20]) { c.beginPath(); c.arc(x * u, 43 * u, 6 * u, 0, Math.PI * 2); c.fill(); c.stroke(); c.fillStyle = '#9aa0aa'; c.beginPath(); c.arc(x * u, 43 * u, 2.4 * u, 0, Math.PI * 2); c.fill(); c.fillStyle = '#2a2a30'; }
  // the awning: red and white stripes, scalloped
  const aw = new Path2D();
  aw.moveTo(-38 * u, 4 * u); aw.lineTo(-30 * u, -8 * u); aw.lineTo(30 * u, -8 * u); aw.lineTo(38 * u, 4 * u);
  for (let x = 38; x > -38; x -= 9.5) aw.arc((x - 4.75) * u, 4 * u, 4.75 * u, 0, Math.PI);
  aw.closePath();
  c.save(); c.clip(aw);
  for (let i = 0; i < 9; i++) { c.fillStyle = i % 2 ? '#fff7ee' : css(RED); c.beginPath(); c.moveTo((-30 + i * 6.7) * u, -8 * u); c.lineTo((-30 + (i + 1) * 6.7) * u, -8 * u); c.lineTo((-38 + (i + 1) * 8.5) * u, 10 * u); c.lineTo((-38 + i * 8.5) * u, 10 * u); c.closePath(); c.fill(); }
  c.restore();
  c.strokeStyle = ink; c.lineWidth = 1.6 * u; c.stroke(aw);
  // the burger on the roof
  const by = -24 * u;
  c.fillStyle = '#e8a040';
  c.beginPath(); c.moveTo(-22 * u, by); c.bezierCurveTo(-22 * u, by - 20 * u, 22 * u, by - 20 * u, 22 * u, by); c.closePath(); c.fill(); c.stroke();
  c.fillStyle = '#fff3d0';
  for (const [x, y] of [[-10, -6], [-2, -10], [7, -7], [13, -3], [-15, -2], [2, -4]]) { c.beginPath(); c.ellipse(x * u, by + y * u, 1.4 * u, 0.8 * u, 0.4, 0, Math.PI * 2); c.fill(); }
  c.fillStyle = '#6ad04a'; c.beginPath();
  for (let x = -24; x <= 24; x += 6) c.lineTo(x * u, by + (x % 12 ? 4 : 1.5) * u);
  c.lineTo(24 * u, by); c.lineTo(-24 * u, by); c.closePath(); c.fill(); c.stroke();
  c.fillStyle = '#ffcf3a'; c.beginPath(); c.moveTo(-23 * u, by + 3 * u); c.lineTo(23 * u, by + 3 * u); c.lineTo(14 * u, by + 8 * u); c.lineTo(-14 * u, by + 7 * u); c.closePath(); c.fill(); c.stroke();
  c.fillStyle = '#7a3a1a'; c.beginPath(); c.roundRect(-23 * u, by + 5 * u, 46 * u, 7 * u, 3 * u); c.fill(); c.stroke();
  c.fillStyle = '#e8a040'; c.beginPath(); c.roundRect(-22 * u, by + 12 * u, 44 * u, 6 * u, 3 * u); c.fill(); c.stroke();
  // steam
  c.strokeStyle = 'rgba(255,255,255,0.7)'; c.lineWidth = 1.8 * u; c.lineCap = 'round';
  for (const x of [-10, 0, 10]) { c.beginPath(); c.moveTo(x * u, by - 18 * u); c.quadraticCurveTo((x + 4) * u, by - 24 * u, x * u, by - 30 * u); c.quadraticCurveTo((x - 4) * u, by - 35 * u, x * u, by - 40 * u); c.stroke(); }
  c.restore();
}

// ------------------------------------------------------------------ the theme

/** The cards behind the day's intro (with new items or without). */
export const INTRO_CARD = { w: 580, h: [400, 260] as const };
/** The day's result ticket. */
export const TICKET = { w: 600, h: 720 };
/** The upgrade shop's chalkboard (six or seven rows). */
export const SHOP_W = 652;
export const shopH = (rows: number): number => 130 + rows * 102 + 130;

export const SNACK_THEME: MenuTheme = {
  font: SPICY_RICE,
  palette: {
    primary: RED, secondary: TEAL, board: CHALK, trim: MUSTARD,
    label: '#ffffff', labelStroke: LABEL_STROKE, muted: '#cfe0d8', accent: '#ffd23f',
    heading: '#ffe27a', body: CHALK_INK, icon: 0xffffff, shade: 0x1a1020,
  },
  logo: {
    fill: ['#fffbe6', '#ffe27a', '#ffb020', '#e8501c'],
    outline: '#3a1408',
    rim: '#fff7ee',
    depth: '#a8241a',
    size: 150,
    emblem: { draw: stallEmblem, size: 250, overlap: 0.22 },
  },
  skin: awningSkin,
  frame: { border: GINGHAM_BORDER, notes: chalkMenu, vignette: 0.5, dim: 0.42 },
  overlays: {
    lose: '#ff9a8a',
    win: '#ffd23f',
    adColor: GREEN,
    titles: ['shutDown'],
  },
  cards: [{ w: INTRO_CARD.w, h: INTRO_CARD.h[0] }, { w: INTRO_CARD.w, h: INTRO_CARD.h[1] }],
};

/** The order ticket's texture (painted ahead, `prebakeSnack`). */
export function ticketTexture(scene: Phaser.Scene): string {
  return bake(scene, `ss-ticket-${TICKET.w}x${TICKET.h}`, TICKET.w + 30, TICKET.h + 40, (c) => { c.translate(15, 12); orderTicket(c, TICKET.w, TICKET.h); });
}

