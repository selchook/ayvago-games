// Strike Alley's menu theme (src/core/menu-theme.ts): a retro bowling alley at night. Lobster on
// glossy lane-wood buttons (maple boards under lacquer) ringed with a neon tube (pink on the main
// buttons, on maple; cyan on the rest, on cherry), the how-to and the pause / result card on a bowling scorecard (a
// cream card with a magenta header, ruled lines and the alley's stamp),
// a lane border round the screen (dark boards with the aiming arrows and a neon tube) with a
// glowing pin in each corner, and the logo over a ball smashing into the pins. Everything is
// painted on canvas once (under the Ayvago intro) and cached.
import Phaser from 'phaser';
import { t, labelTexture, skinTexture, ThemeNumber, type LabelStyle, type MenuTheme, type SkinPainter, type BorderStyle } from '@core';
import { LOBSTER } from '@core/fonts/lobster';

/** The summary's card (panels.ts Summary). */
export const SUMMARY_W = 700, SUMMARY_H = 640;

export const MAPLE = 0xd99a52, CHERRY = 0xa8642e, WALNUT = 0x7a4a26, NIGHT = 0x1d1240, PINK = 0xff3fa4, CYAN = 0x34e7ff, GOLD = 0xffd23f;
export const INK = '#241640';
export const LABEL_STROKE = '#2a0b3e';

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

/** A neon tube along a path: a wide soft glow, the coloured tube and its white-hot core. */
function neon(c: CanvasRenderingContext2D, p: Path2D, col: number, width = 4, glow = 14, dim = 1): void {
  c.save();
  c.lineJoin = 'round'; c.lineCap = 'round';
  c.shadowColor = css(col, 0.9 * dim); c.shadowBlur = glow;
  c.strokeStyle = css(col, 0.55 * dim); c.lineWidth = width + 4; c.stroke(p);
  c.shadowBlur = glow * 0.5;
  c.strokeStyle = css(shade(col, 0.15), dim); c.lineWidth = width; c.stroke(p);
  c.shadowColor = 'transparent';
  c.strokeStyle = `rgba(255,255,255,${0.85 * dim})`; c.lineWidth = Math.max(1, width * 0.35); c.stroke(p);
  c.restore();
}

/** Lane boards: long strips of maple with a fine grain, lighter and darker by turns. */
function boards(c: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, col: number, r: () => number, across = true): void {
  const n = Math.max(2, Math.round((across ? h : w) / 9));
  for (let i = 0; i < n; i++) {
    const k = (r() - 0.5) * 0.16;
    c.fillStyle = css(shade(col, k));
    if (across) c.fillRect(x, y + (h * i) / n, w, h / n + 0.5);
    else c.fillRect(x + (w * i) / n, y, w / n + 0.5, h);
  }
  c.strokeStyle = 'rgba(70,35,10,0.28)'; c.lineWidth = 1;
  for (let i = 1; i < n; i++) {
    c.beginPath();
    if (across) { c.moveTo(x, y + (h * i) / n); c.lineTo(x + w, y + (h * i) / n); }
    else { c.moveTo(x + (w * i) / n, y); c.lineTo(x + (w * i) / n, y + h); }
    c.stroke();
  }
  for (let i = 0; i < (w * h) / 220; i++) {
    c.strokeStyle = r() < 0.5 ? 'rgba(90,45,10,0.12)' : 'rgba(255,240,210,0.08)';
    const gx = x + r() * w, gy = y + r() * h, L = 10 + r() * 30;
    c.beginPath();
    if (across) { c.moveTo(gx, gy); c.lineTo(gx + L, gy + (r() - 0.5)); } else { c.moveTo(gx, gy); c.lineTo(gx + (r() - 0.5), gy + L); }
    c.stroke();
  }
}

/**
 * The lane-wood skin: maple boards under a glossy lacquer (a bright band across the top) in a
 * dark rounded rail, ringed by a neon tube: pink on the main buttons, cyan on the rest, dim on
 * the switch's unselected segments. Hover makes the tube blaze and glow, a press sinks the board.
 * Boards (and the switch's track) are night-blue panels with a faint neon rim.
 */
export const laneSkin: SkinPainter = (c, kind, w, h, o) => {
  const P = o.palette, r = rng(o.seed);
  const sunk = o.state === 'down' || o.state === 'off' || kind === 'track';
  const off = o.state === 'off';
  const round = kind === 'round';
  const R = round ? Math.min(w, h) / 2 : Math.min(22, h * 0.32);
  const shapeAt = (i: number): Path2D => {
    const p = new Path2D();
    if (round) p.arc(w / 2, h / 2, Math.min(w, h) / 2 - i, 0, Math.PI * 2);
    else p.roundRect(i, i, w - i * 2, h - i * 2, Math.max(3, R - i));
    return p;
  };
  const outer = shapeAt(0);
  const tube = o.color === P.primary ? PINK : CYAN;
  c.save();
  c.translate(0, o.state === 'down' ? 3 : 0);
  c.save();
  c.shadowColor = 'rgba(0,0,0,0.6)'; c.shadowBlur = sunk ? 3 : 10; c.shadowOffsetY = sunk ? 1 : 6;
  c.fillStyle = '#000'; c.fill(outer);
  c.restore();
  if (kind === 'track' || kind === 'board' || o.color === P.board) {
    const g = c.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, css(shade(NIGHT, 0.12))); g.addColorStop(1, css(shade(NIGHT, -0.4)));
    c.fillStyle = g; c.fill(outer);
    if (kind === 'track') {
      c.save(); c.clip(outer);
      const top = c.createLinearGradient(0, 0, 0, 16);
      top.addColorStop(0, 'rgba(0,0,0,0.6)'); top.addColorStop(1, 'rgba(0,0,0,0)');
      c.fillStyle = top; c.fillRect(0, 0, w, 16);
      c.restore();
    }
    c.lineWidth = 2; c.strokeStyle = 'rgba(0,0,0,0.8)'; c.stroke(outer);
    neon(c, shapeAt(kind === 'track' ? 3 : 6), kind === 'track' ? CYAN : PINK, 2.5, 8, 0.6);
    c.restore();
    return;
  }
  // the rail: dark walnut round the boards
  const rail = Math.max(4, Math.min(8, h * 0.1));
  const rg = c.createLinearGradient(0, 0, 0, h);
  rg.addColorStop(0, css(shade(WALNUT, 0.1))); rg.addColorStop(1, css(shade(WALNUT, -0.55)));
  c.fillStyle = rg; c.fill(outer);
  const face = shapeAt(rail);
  c.save(); c.clip(face);
  const base = o.color === P.primary ? MAPLE : o.color;
  const col = off ? shade(base, -0.4) : base;
  boards(c, 0, 0, w, h, col, r, !round);
  // the lacquer: darker towards the bottom, a bright band over the top third
  const lac = c.createLinearGradient(0, rail, 0, h - rail);
  lac.addColorStop(0, sunk ? 'rgba(0,0,0,0.25)' : 'rgba(255,255,255,0.18)');
  lac.addColorStop(0.5, 'rgba(0,0,0,0)');
  lac.addColorStop(1, 'rgba(40,10,0,0.35)');
  c.fillStyle = lac; c.fillRect(0, 0, w, h);
  if (!sunk) {
    c.fillStyle = 'rgba(255,255,255,0.28)';
    c.beginPath(); c.roundRect(rail + 6, rail + 3, w - rail * 2 - 12, Math.max(4, (h - rail * 2) * 0.22), 6); c.fill();
  }
  // the lane's aiming arrows on a long button
  if (kind === 'button' && w >= 240 && h >= 70) {
    c.fillStyle = 'rgba(60,25,5,0.22)';
    for (const x of [w * 0.12, w * 0.88]) {
      c.beginPath(); c.moveTo(x, h * 0.32); c.lineTo(x + 8, h * 0.68); c.lineTo(x - 8, h * 0.68); c.closePath(); c.fill();
    }
  }
  c.restore();
  c.lineWidth = 1.5; c.strokeStyle = 'rgba(30,10,0,0.85)'; c.stroke(face);
  c.lineWidth = 2; c.strokeStyle = 'rgba(0,0,0,0.85)'; c.stroke(outer);
  // the neon tube round it
  const lit = off ? 0.25 : o.state === 'over' ? 1 : o.state === 'down' ? 0.75 : o.state === 'on' ? 1 : 0.8;
  neon(c, shapeAt(1.5), o.state === 'on' ? GOLD : tube, o.state === 'over' ? 4.5 : 3.5, o.state === 'over' ? 20 : 12, lit);
  if (o.state === 'down') { c.fillStyle = 'rgba(0,0,0,0.15)'; c.fill(outer); }
  c.restore();
};

// ------------------------------------------------------------------ the scorecard

/** The how-to and the pause / result card: a bowling scorecard with its coloured header, ruled lines and the alley's stamp. */
export function scorecard(c: CanvasRenderingContext2D, w: number, h: number): void {
  const R = 18, r = rng(w * 7 + h * 13);
  const card = new Path2D(); card.roundRect(0, 0, w, h, R);
  c.save();
  c.shadowColor = 'rgba(0,0,0,0.6)'; c.shadowBlur = 18; c.shadowOffsetY = 8;
  c.fillStyle = '#000'; c.fill(card);
  c.restore();
  // a neon glow behind the card's edge
  neon(c, card, PINK, 3, 18, 0.9);
  const paper = c.createLinearGradient(0, 0, 0, h);
  paper.addColorStop(0, '#fffaf0'); paper.addColorStop(1, '#f1e6d2');
  c.fillStyle = paper; c.fill(card);
  c.save(); c.clip(card);
  for (let i = 0; i < w * h * 0.002; i++) { c.fillStyle = r() < 0.5 ? 'rgba(0,0,0,0.035)' : 'rgba(255,255,255,0.3)'; c.fillRect(r() * w, r() * h, 1.6, 1.6); }
  // the header band: a magenta stripe (the alley's colours) with a row of little frame numbers
  const band = 14;
  const hg = c.createLinearGradient(0, 0, w, 0);
  hg.addColorStop(0, '#d8247e'); hg.addColorStop(1, '#6a2ad8');
  c.fillStyle = hg; c.fillRect(0, 0, w, band);
  c.fillStyle = 'rgba(255,255,255,0.25)'; c.fillRect(0, 2, w, 2);
  const top = band;
  // ruled lines under it, and the alley's round stamp faintly in a corner
  c.strokeStyle = 'rgba(52,150,220,0.16)'; c.lineWidth = 1;
  for (let y = top + 34; y < h - 14; y += 34) { c.beginPath(); c.moveTo(16, y); c.lineTo(w - 16, y); c.stroke(); }
  c.strokeStyle = 'rgba(216,36,126,0.16)'; c.lineWidth = 3;
  const sx = w - 74, sy = h - 74;
  c.beginPath(); c.arc(sx, sy, 50, 0, Math.PI * 2); c.stroke();
  c.lineWidth = 1.5; c.beginPath(); c.arc(sx, sy, 42, 0, Math.PI * 2); c.stroke();
  c.fillStyle = 'rgba(216,36,126,0.14)';
  pinShape(c, sx, sy + 2, 30);
  c.restore();
  c.lineWidth = 2.5; c.strokeStyle = '#2a0b3e'; c.stroke(card);
}

/** A bowling pin's silhouette standing on (x, y + H / 2), H tall (filled with the current fill). */
function pinShape(c: CanvasRenderingContext2D, x: number, y: number, H: number): void {
  const u = H / 30;
  c.beginPath();
  c.moveTo(x, y - 15 * u);
  c.bezierCurveTo(x + 3.2 * u, y - 15 * u, x + 3.4 * u, y - 10 * u, x + 2.2 * u, y - 7 * u);
  c.bezierCurveTo(x + 1.6 * u, y - 5 * u, x + 5.6 * u, y - 1 * u, x + 5.4 * u, y + 5 * u);
  c.bezierCurveTo(x + 5.2 * u, y + 10 * u, x + 3.6 * u, y + 13 * u, x + 2.6 * u, y + 15 * u);
  c.lineTo(x - 2.6 * u, y + 15 * u);
  c.bezierCurveTo(x - 3.6 * u, y + 13 * u, x - 5.2 * u, y + 10 * u, x - 5.4 * u, y + 5 * u);
  c.bezierCurveTo(x - 5.6 * u, y - 1 * u, x - 1.6 * u, y - 5 * u, x - 2.2 * u, y - 7 * u);
  c.bezierCurveTo(x - 3.4 * u, y - 10 * u, x - 3.2 * u, y - 15 * u, x, y - 15 * u);
  c.closePath();
  c.fill();
}

/** A white bowling pin with its red neck stripes, H tall, centred on (x, y), turned by `a`. */
function pin(c: CanvasRenderingContext2D, x: number, y: number, H: number, a = 0): void {
  const u = H / 30;
  c.save();
  c.translate(x, y); c.rotate(a);
  const g = c.createLinearGradient(-6 * u, 0, 6 * u, 0);
  g.addColorStop(0, '#c8c4d8'); g.addColorStop(0.35, '#ffffff'); g.addColorStop(1, '#a8a2c0');
  c.fillStyle = g;
  pinShape(c, 0, 0, H);
  c.lineWidth = Math.max(1, 1.1 * u); c.strokeStyle = '#2a0b3e'; c.stroke();
  c.save(); c.clip();
  c.fillStyle = '#e0182d';
  c.fillRect(-6 * u, -8.2 * u, 12 * u, 1.5 * u);
  c.fillRect(-6 * u, -5.6 * u, 12 * u, 1.5 * u);
  c.restore();
  c.restore();
}

// ------------------------------------------------------------------ the frame

/** The lane border: dark lane boards, the aiming arrows, and a neon tube on the inner side. */
const laneEdge: BorderStyle['edge'] = (c, len, t) => {
  const r = rng(len);
  boards(c, 0, 0, len, t - 4, shade(WALNUT, -0.35), r, true);
  const g = c.createLinearGradient(0, 0, 0, t);
  g.addColorStop(0, 'rgba(0,0,0,0.35)'); g.addColorStop(1, 'rgba(0,0,0,0)');
  c.fillStyle = g; c.fillRect(0, 0, len, t);
  // the arrows (as on the lane: little darts) in pairs
  for (let x = 60; x < len - 40; x += 120) {
    c.fillStyle = css(GOLD, 0.85);
    c.beginPath(); c.moveTo(x, 3); c.lineTo(x + 7, t - 9); c.lineTo(x - 7, t - 9); c.closePath(); c.fill();
    c.strokeStyle = 'rgba(40,10,0,0.7)'; c.lineWidth = 1; c.stroke();
  }
  const tube = new Path2D(); tube.moveTo(0, t - 3); tube.lineTo(len, t - 3);
  neon(c, tube, PINK, 2.5, 8, 1);
};

/** A glowing pin in a cyan neon ring in each corner. */
function cornerPin(c: CanvasRenderingContext2D, size: number): void {
  const cx = size * 0.42, cy = size * 0.42, R = size * 0.36;
  c.save();
  c.shadowColor = 'rgba(0,0,0,0.6)'; c.shadowBlur = 6; c.shadowOffsetY = 2;
  c.fillStyle = css(NIGHT); c.beginPath(); c.arc(cx, cy, R, 0, Math.PI * 2); c.fill();
  c.restore();
  const ring = new Path2D(); ring.arc(cx, cy, R - 2, 0, Math.PI * 2);
  neon(c, ring, CYAN, 2.5, 10, 1);
  pin(c, cx, cy, R * 1.45, -0.2);
}

export const LANE_BORDER: BorderStyle = { thick: 20, inset: 2, edge: laneEdge, corner: { size: 58, draw: cornerPin, inset: 0 } };

// ------------------------------------------------------------------ the emblem

/** A ball smashing into the pins: a neon starburst behind, pins flying, the ball in front. */
export function strikeEmblem(c: CanvasRenderingContext2D, size: number): void {
  const u = size / 100;
  c.save();
  c.translate(size / 2, size / 2);
  // the burst: a neon ring and rays
  const glow = c.createRadialGradient(0, 0, 6 * u, 0, 0, 50 * u);
  glow.addColorStop(0, 'rgba(255,90,190,0.55)'); glow.addColorStop(1, 'rgba(255,90,190,0)');
  c.fillStyle = glow; c.fillRect(-50 * u, -50 * u, 100 * u, 100 * u);
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2 + 0.1;
    const p = new Path2D(); p.moveTo(Math.cos(a) * 30 * u, Math.sin(a) * 30 * u); p.lineTo(Math.cos(a) * (i % 2 ? 40 : 46) * u, Math.sin(a) * (i % 2 ? 40 : 46) * u);
    neon(c, p, i % 2 ? CYAN : GOLD, 2 * u, 6 * u, 1);
  }
  const ring = new Path2D(); ring.arc(0, 0, 27 * u, 0, Math.PI * 2);
  neon(c, ring, PINK, 3 * u, 10 * u, 1);
  // the pins: scattered and tumbling
  const pins: number[][] = [[-17, -6, -0.6], [15, -10, 0.5], [3, -16, 0.15], [-6, -20, -0.25], [23, 2, 1.1], [-25, 6, -1.2]];
  for (const [x, y, a] of pins) pin(c, x * u, y * u, 28 * u, a);
  // the ball, in front, with its finger holes and a shine
  const bx = 0, by = 14 * u, BR = 17 * u;
  c.save();
  c.shadowColor = 'rgba(0,0,0,0.6)'; c.shadowBlur = 6 * u; c.shadowOffsetY = 2 * u;
  const bg = c.createRadialGradient(bx - 6 * u, by - 7 * u, 2 * u, bx, by, BR);
  bg.addColorStop(0, '#9b6bff'); bg.addColorStop(0.45, '#5a24c8'); bg.addColorStop(1, '#1e0a50');
  c.fillStyle = bg; c.beginPath(); c.arc(bx, by, BR, 0, Math.PI * 2); c.fill();
  c.restore();
  // a marbled swirl
  c.strokeStyle = 'rgba(255,120,220,0.45)'; c.lineWidth = 2 * u;
  c.beginPath(); c.arc(bx + 3 * u, by + 2 * u, 10 * u, 2.6, 5.2); c.stroke();
  c.strokeStyle = 'rgba(80,220,255,0.35)'; c.lineWidth = 1.4 * u;
  c.beginPath(); c.arc(bx - 2 * u, by + 4 * u, 13 * u, 3.4, 5.6); c.stroke();
  c.fillStyle = '#0c0420';
  for (const [x, y, rr] of [[-4, -6, 2.6], [3, -6.5, 2.6], [-0.5, 1, 3]]) { c.beginPath(); c.arc(bx + x * u, by + y * u, rr * u, 0, Math.PI * 2); c.fill(); }
  c.fillStyle = 'rgba(255,255,255,0.7)';
  c.beginPath(); c.ellipse(bx - 7 * u, by - 8 * u, 4 * u, 2.4 * u, -0.6, 0, Math.PI * 2); c.fill();
  c.lineWidth = 1.4 * u; c.strokeStyle = '#0c0420';
  c.beginPath(); c.arc(bx, by, BR, 0, Math.PI * 2); c.stroke();
  // speed lines behind the ball
  c.strokeStyle = 'rgba(255,255,255,0.6)'; c.lineCap = 'round';
  for (const [y, L] of [[-4, 12], [3, 16], [10, 10]]) { c.lineWidth = 2 * u; c.beginPath(); c.moveTo(-BR - 4 * u, by + y * u); c.lineTo(-BR - (4 + L) * u, by + (y + 2) * u); c.stroke(); }
  c.restore();
}

// ------------------------------------------------------------------ the theme

/** The summary's lines: the counts, their names, the TOTAL and FINISH, in the card's ink. */
export const SUM_HEAD: LabelStyle = { size: 50, fill: ['#ffffff', '#ffb0e0', '#ff3fa4'], stroke: LABEL_STROKE, strokeWidth: 9 };
export const SUM_LABEL: LabelStyle = { size: 28, color: INK, stroke: null, shadow: false };
/** The three counts (coloured per row: `color` is replaced, so one atlas each) and the big total. */
export const SUM_COUNT: LabelStyle = { size: 50, color: INK, stroke: null, shadow: false };
export const SUM_COUNT_COLORS = ['#d8247e', '#1f7fd0', '#6a5a9a'];
export const SUM_TOTAL: LabelStyle = { size: 84, fill: ['#ffffff', '#ffd0ec', '#ff3fa4'], stroke: LABEL_STROKE, strokeWidth: 10 };

export const ALLEY_THEME: MenuTheme = {
  font: LOBSTER,
  palette: {
    primary: 0xe23a8e, secondary: CHERRY, board: NIGHT, trim: GOLD,
    label: '#ffffff', labelStroke: LABEL_STROKE, muted: '#c9b8e8', accent: '#ffd23f',
    heading: '#8a1c6a', body: INK, icon: 0xfff4ff, shade: 0x0b0620,
  },
  logo: {
    fill: ['#ffffff', '#ffe6f6', '#ff7ac8', '#c8187a'],
    outline: '#1a0630',
    rim: '#7af0ff',
    depth: '#3a0e6a',
    size: 160,
    emblem: { draw: strikeEmblem, size: 230, overlap: 0.26 },
  },
  skin: laneSkin,
  frame: { border: LANE_BORDER, notes: scorecard, vignette: 0.5, dim: 0.36 },
  overlays: {
    lose: '#8a1c6a',
    win: '#ff4aa8',
    adColor: 0x2f8a6a,
    titles: ['gameDone'],
  },
  cards: [{ w: SUMMARY_W, h: SUMMARY_H }],
  prebake: prebakeSummary,
};

/** Paints the summary's fixed lines (current language) under the Ayvago intro. */
function prebakeSummary(scene: Phaser.Scene): void {
  labelTexture(scene, t('scorecard'), SUM_HEAD);
  for (const k of ['strikes', 'spares', 'opens', 'total']) labelTexture(scene, t(k), SUM_LABEL);
  for (const color of SUM_COUNT_COLORS) new ThemeNumber(scene, 0, 0, 0, { ...SUM_COUNT, color }).destroy();
  new ThemeNumber(scene, 0, 0, 0, SUM_TOTAL).destroy();
  // FINISH: a primary button
  labelTexture(scene, t('finish'), { size: 40 });
  for (const st of ['up', 'over', 'down'] as const) skinTexture(scene, 'button', 380, 92, st, ALLEY_THEME.palette.primary);
}
