// Marble Maze's menu theme (src/core/menu-theme.ts): Grandstander Black, a polished wooden labyrinth board.
// The buttons are lacquered wood (PLAY cherry red, the rest honey maple) with a high gloss, a
// routed groove and a glass marble set into each end of the big ones; the switches sit in a
// carved walnut channel, a wooden maze frame with brass corner caps runs round the screen, the
// how-to is a maple panel, and a glass marble rolls through a little maze behind the logo. Every
// piece is painted once on a canvas (the core caches it under the Ayvago intro); nothing here runs
// in play.
import { shadeColor, type MenuTheme, type SkinPainter, type BorderStyle } from '@core';
import { GRANDSTANDER } from '@core/fonts/grandstander';
import { CTRL_PIECES } from './tilt-board';
import { prebakeMaze, CLEAR_CARD, TILE_PIECES } from './screens';

export const CHERRY = 0xc4452a, MAPLE = 0xa8743e, WALNUT = 0x4a2d18, BRASS = 0xffd36b, GREEN = 0x3c9a4a, PLUM = 0x7a4fb0;
export const INK = '#2a160a';

const rgba = (c: number, a = 1): string => `rgba(${(c >> 16) & 255},${(c >> 8) & 255},${c & 255},${a})`;

function rng(seed: number): () => number {
  let s = (seed >>> 0) % 2147483647 || 1;
  return () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
}

function rounded(x: number, y: number, w: number, h: number, r: number): Path2D {
  const p = new Path2D();
  p.roundRect(x, y, w, h, Math.max(0, Math.min(r, w / 2, h / 2)));
  return p;
}

/** Long wavy grain lines in a darker tone (inside a clip). */
function grain(c: CanvasRenderingContext2D, w: number, h: number, color: number, r: () => number, strength = 1): void {
  const n = Math.max(5, Math.round(h / 5));
  for (let i = 0; i < n; i++) {
    const y0 = (i + r()) * (h / n), amp = 1 + r() * 3, f = 0.01 + r() * 0.02, ph = r() * 6;
    c.strokeStyle = rgba(shadeColor(color, -0.35 - r() * 0.2), (0.18 + r() * 0.2) * strength);
    c.lineWidth = 0.8 + r() * 1.4;
    c.beginPath();
    for (let x = -4; x <= w + 4; x += 6) { const y = y0 + Math.sin(x * f + ph) * amp; x < 0 ? c.moveTo(x, y) : c.lineTo(x, y); }
    c.stroke();
  }
}

/** A glass marble with a coloured swirl and a highlight. */
export function marble(c: CanvasRenderingContext2D, x: number, y: number, r: number, swirl = '#2f8de0'): void {
  c.save();
  c.shadowColor = 'rgba(0,0,0,0.45)'; c.shadowBlur = r * 0.5; c.shadowOffsetY = r * 0.25;
  const g = c.createRadialGradient(x - r * 0.35, y - r * 0.4, r * 0.1, x, y, r);
  g.addColorStop(0, '#ffffff'); g.addColorStop(0.35, '#d9f1ff'); g.addColorStop(1, '#5aa8e6');
  c.fillStyle = g; c.beginPath(); c.arc(x, y, r, 0, Math.PI * 2); c.fill();
  c.restore();
  c.save();
  c.beginPath(); c.arc(x, y, r, 0, Math.PI * 2); c.clip();
  c.strokeStyle = swirl; c.lineWidth = r * 0.32; c.lineCap = 'round';
  c.beginPath(); c.moveTo(x - r * 0.8, y + r * 0.2); c.bezierCurveTo(x - r * 0.2, y - r * 0.6, x + r * 0.1, y + r * 0.7, x + r * 0.85, y - r * 0.15); c.stroke();
  c.strokeStyle = 'rgba(255,90,60,0.85)'; c.lineWidth = r * 0.16;
  c.beginPath(); c.moveTo(x - r * 0.6, y + r * 0.6); c.bezierCurveTo(x - r * 0.1, y + r * 0.1, x + r * 0.3, y + r * 0.8, x + r * 0.7, y + r * 0.35); c.stroke();
  c.restore();
  c.fillStyle = 'rgba(255,255,255,0.95)';
  c.beginPath(); c.ellipse(x - r * 0.38, y - r * 0.42, r * 0.26, r * 0.16, -0.6, 0, Math.PI * 2); c.fill();
  c.strokeStyle = 'rgba(20,40,70,0.55)'; c.lineWidth = Math.max(1, r * 0.08);
  c.beginPath(); c.arc(x, y, r, 0, Math.PI * 2); c.stroke();
}

/**
 * The lacquered wood skin: a rounded board of wood in the piece's colour with its grain under a
 * high gloss, a routed groove inside the edge and a glass marble set into each end of a big
 * button. Hover glows brass, a press sinks it, the chosen switch segment has a brass rim, a
 * disabled piece is dull and dark. The switch's track is a carved walnut channel.
 */
const lacquerPainter: SkinPainter = (c, kind, w, h, o) => {
  const P = o.palette, r = rng(o.seed);
  const down = o.state === 'down', off = o.state === 'off', over = o.state === 'over', on = o.state === 'on';
  const round = kind === 'round';
  const rad = round ? Math.min(w, h) / 2 : Math.min(22, h * 0.32);
  const shape = (i: number): Path2D => {
    if (!round) return rounded(i, i, w - i * 2, h - i * 2, rad - i * 0.7);
    const p = new Path2D(); p.arc(w / 2, h / 2, Math.min(w, h) / 2 - i, 0, Math.PI * 2); return p;
  };
  const outer = shape(0);
  c.save();
  c.translate(0, down ? 3 : 0);
  c.save();
  c.shadowColor = over ? rgba(P.trim, 0.95) : 'rgba(20,8,0,0.6)';
  c.shadowBlur = down ? 3 : over ? 16 : 10;
  c.shadowOffsetY = down ? 1 : over ? 3 : 7;
  c.fillStyle = '#000'; c.fill(outer);
  c.restore();
  if (kind === 'track') {
    c.fillStyle = rgba(shadeColor(WALNUT, -0.35)); c.fill(outer);
    c.save(); c.clip(outer);
    grain(c, w, h, WALNUT, r, 0.8);
    const sh = c.createLinearGradient(0, 0, 0, h);
    sh.addColorStop(0, 'rgba(0,0,0,0.65)'); sh.addColorStop(0.35, 'rgba(0,0,0,0.1)'); sh.addColorStop(1, 'rgba(255,220,180,0.12)');
    c.fillStyle = sh; c.fillRect(0, 0, w, h);
    c.restore();
    c.lineWidth = 3; c.strokeStyle = rgba(shadeColor(MAPLE, 0.1)); c.stroke(outer);
    c.lineWidth = 1.2; c.strokeStyle = INK; c.stroke(outer);
    c.restore();
    return;
  }
  const col = off ? 0x5e4c3e : o.color;
  const body = c.createLinearGradient(0, 0, 0, h);
  body.addColorStop(0, rgba(shadeColor(col, down ? 0.04 : 0.22)));
  body.addColorStop(0.6, rgba(col));
  body.addColorStop(1, rgba(shadeColor(col, -0.35)));
  c.fillStyle = body; c.fill(outer);
  c.save();
  c.clip(outer);
  grain(c, w, h, col, r, kind === 'board' ? 1.2 : 0.9);
  if (!down && !off) {
    // the lacquer's gloss: a bright band across the top
    const gl = c.createLinearGradient(0, 0, 0, h * 0.5);
    gl.addColorStop(0, 'rgba(255,255,255,0.5)'); gl.addColorStop(1, 'rgba(255,255,255,0.02)');
    c.fillStyle = gl;
    c.fill(rounded(rad * 0.4, 3, w - rad * 0.8, h * 0.42, rad * 0.6));
  } else {
    const top = c.createLinearGradient(0, 0, 0, 14);
    top.addColorStop(0, 'rgba(0,0,0,0.45)'); top.addColorStop(1, 'rgba(0,0,0,0)');
    c.fillStyle = top; c.fillRect(0, 0, w, 14);
  }
  c.restore();
  // the routed groove inside the edge
  if (!round && Math.min(w, h) >= 50) {
    const g = shape(7);
    c.lineWidth = 2.4; c.strokeStyle = rgba(shadeColor(col, -0.5), 0.7); c.stroke(g);
    c.save(); c.translate(0, 1.4); c.lineWidth = 1.2; c.strokeStyle = 'rgba(255,240,210,0.3)'; c.stroke(g); c.restore();
  }
  c.lineWidth = 2; c.strokeStyle = rgba(shadeColor(col, -0.7)); c.stroke(outer);
  if (!off && kind === 'button' && w >= 200) for (const x of [h * 0.36, w - h * 0.36]) marble(c, x, h / 2, Math.min(11, h * 0.15));
  if (on || over) {
    c.save();
    c.shadowColor = rgba(P.trim, 0.95); c.shadowBlur = over ? 12 : 7;
    c.lineWidth = over ? 4 : 3.5; c.strokeStyle = rgba(P.trim); c.stroke(shape(1.5));
    c.restore();
  }
  if (down) { c.fillStyle = 'rgba(0,0,0,0.14)'; c.fill(outer); }
  c.restore();
};

/** A brass screw head with its slot. */
function screw(c: CanvasRenderingContext2D, x: number, y: number, r: number, a: number): void {
  const g = c.createRadialGradient(x - r * 0.3, y - r * 0.3, 0, x, y, r);
  g.addColorStop(0, '#fff3c0'); g.addColorStop(0.6, '#d9a640'); g.addColorStop(1, '#7a5212');
  c.fillStyle = g; c.beginPath(); c.arc(x, y, r, 0, Math.PI * 2); c.fill();
  c.strokeStyle = '#5a3a0a'; c.lineWidth = r * 0.3;
  c.beginPath(); c.moveTo(x - Math.cos(a) * r * 0.7, y - Math.sin(a) * r * 0.7); c.lineTo(x + Math.cos(a) * r * 0.7, y + Math.sin(a) * r * 0.7); c.stroke();
}

/** The maple panel behind the how-to and on the pause, result and level screens. */
export function maplePanel(c: CanvasRenderingContext2D, w: number, h: number): void {
  const r = rng(Math.round(w * 3 + h * 7));
  const shape = rounded(0, 0, w, h, 26);
  c.save();
  c.shadowColor = 'rgba(0,0,0,0.55)'; c.shadowBlur = 16; c.shadowOffsetY = 8;
  c.fillStyle = '#e9cf9e'; c.fill(shape);
  c.restore();
  const g = c.createLinearGradient(0, 0, w, h);
  g.addColorStop(0, '#f6e2b8'); g.addColorStop(0.5, '#ecd2a0'); g.addColorStop(1, '#ddbd85');
  c.fillStyle = g; c.fill(shape);
  c.save(); c.clip(shape);
  grain(c, w, h, 0xe0c08a, r, 0.6);
  c.restore();
  // a walnut inlay frame
  c.lineWidth = 7; c.strokeStyle = rgba(WALNUT, 0.85); c.stroke(rounded(12, 12, w - 24, h - 24, 16));
  c.lineWidth = 1.4; c.strokeStyle = 'rgba(255,245,220,0.6)'; c.stroke(rounded(16.5, 16.5, w - 33, h - 33, 13));
  c.lineWidth = 2.5; c.strokeStyle = '#6e4626'; c.stroke(shape);
  for (const [x, y] of [[26, 26], [w - 26, 26], [26, h - 26], [w - 26, h - 26]]) screw(c, x, y, 5, r() * 3);
}

/** A wooden maze rail round the screen with a brass cap in each corner. */
const FRAME_BORDER: BorderStyle = {
  thick: 18,
  inset: 0,
  edge: (c, len, thick) => {
    const r = rng(len);
    const g = c.createLinearGradient(0, 0, 0, thick);
    g.addColorStop(0, '#7a4e2a'); g.addColorStop(0.4, '#a8743e'); g.addColorStop(1, '#4a2d18');
    c.fillStyle = g; c.fillRect(0, 0, len, thick);
    c.save(); c.beginPath(); c.rect(0, 0, len, thick); c.clip();
    grain(c, len, thick, 0x8a5a30, r, 1);
    c.restore();
    c.fillStyle = 'rgba(255,235,200,0.35)'; c.fillRect(0, 2, len, 1.5);
    c.fillStyle = 'rgba(0,0,0,0.5)'; c.fillRect(0, thick - 2, len, 2);
  },
  corner: {
    size: 40,
    inset: 0,
    draw: (c, s) => {
      c.save();
      c.shadowColor = 'rgba(0,0,0,0.55)'; c.shadowBlur = 5; c.shadowOffsetY = 2;
      const g = c.createLinearGradient(0, 0, s, s);
      g.addColorStop(0, '#fff0b0'); g.addColorStop(0.5, '#d9a640'); g.addColorStop(1, '#7a5212');
      c.fillStyle = g;
      c.fill(rounded(0, 0, s, s, 6));
      c.restore();
      c.strokeStyle = '#5a3a0a'; c.lineWidth = 1.5; c.stroke(rounded(0.75, 0.75, s - 1.5, s - 1.5, 6));
      screw(c, s * 0.5, s * 0.5, s * 0.18, 0.7);
    },
  },
};

/** The emblem behind the logo: a glass marble rolling through a small wooden maze. */
export function mazeEmblem(c: CanvasRenderingContext2D, size: number): void {
  const u = size / 100;
  c.save();
  c.translate(size / 2, size / 2);
  const halo = c.createRadialGradient(0, 0, 6 * u, 0, 0, 50 * u);
  halo.addColorStop(0, 'rgba(255,214,140,0.5)'); halo.addColorStop(1, 'rgba(255,214,140,0)');
  c.fillStyle = halo; c.fillRect(-50 * u, -50 * u, 100 * u, 100 * u);
  // the board, seen a little from above: a tilted square
  c.save();
  c.scale(1, 0.62);
  c.rotate(Math.PI / 4);
  const B = 30 * u;
  c.save();
  c.shadowColor = 'rgba(0,0,0,0.5)'; c.shadowBlur = 10 * u; c.shadowOffsetY = 6 * u;
  c.fillStyle = '#6e4626'; c.fillRect(-B - 4 * u, -B - 4 * u, B * 2 + 8 * u, B * 2 + 8 * u);
  c.restore();
  const fg = c.createLinearGradient(-B, -B, B, B);
  fg.addColorStop(0, '#f3dcae'); fg.addColorStop(1, '#d6b37a');
  c.fillStyle = fg; c.fillRect(-B, -B, B * 2, B * 2);
  // the walls of the maze
  const cell = (B * 2) / 5;
  const walls: Array<[number, number, number, number]> = [
    [0, 0, 5, 0], [0, 5, 5, 5], [0, 0, 0, 5], [5, 0, 5, 5],
    [1, 1, 3, 1], [1, 1, 1, 3], [2, 2, 4, 2], [4, 1, 4, 4], [2, 3, 2, 5], [3, 3, 3, 4], [1, 4, 2, 4],
  ];
  c.lineCap = 'round';
  for (const [x0, y0, x1, y1] of walls) {
    c.strokeStyle = '#4a2d18'; c.lineWidth = 5 * u;
    c.beginPath(); c.moveTo(-B + x0 * cell, -B + y0 * cell + 1.5 * u); c.lineTo(-B + x1 * cell, -B + y1 * cell + 1.5 * u); c.stroke();
    c.strokeStyle = '#a8743e'; c.lineWidth = 3.6 * u;
    c.beginPath(); c.moveTo(-B + x0 * cell, -B + y0 * cell); c.lineTo(-B + x1 * cell, -B + y1 * cell); c.stroke();
  }
  // the goal hole
  c.fillStyle = '#1a0d04';
  c.beginPath(); c.arc(-B + 4.5 * cell, -B + 4.5 * cell, cell * 0.32, 0, Math.PI * 2); c.fill();
  c.restore();
  // the marble (drawn round, over the squashed board) with its trail
  c.strokeStyle = 'rgba(255,255,255,0.5)'; c.lineWidth = 2 * u; c.lineCap = 'round';
  c.beginPath(); c.moveTo(-26 * u, 2 * u); c.quadraticCurveTo(-16 * u, -8 * u, -6 * u, -4 * u); c.stroke();
  marble(c, 0, -6 * u, 11 * u);
  c.restore();
}

export const MAZE_THEME: MenuTheme = {
  font: GRANDSTANDER,
  fontScale: 0.9,
  palette: {
    primary: CHERRY, secondary: MAPLE, board: WALNUT, trim: BRASS,
    label: '#fff8ec', labelStroke: INK, muted: '#c9a982', accent: '#ffd36b',
    heading: '#8a3412', body: '#2b1a0e', icon: 0xfff4e0, shade: 0x120b06,
  },
  logo: {
    fill: ['#ffffff', '#bfe9ff', '#3d97e0'],
    outline: INK,
    outlineWidth: 0.12,
    rim: '#fff4dc',
    depth: '#5a3315',
    size: 112,
    lineHeight: 0.92,
    emblem: { draw: mazeEmblem, size: 210, overlap: 0.42 },
  },
  skin: lacquerPainter,
  // the CONTROL switch (touch screens) and the level tiles in the same skin
  pieces: [...CTRL_PIECES, ...TILE_PIECES],
  // dim: the board's darkening (main.ts drew it as its own layer before the theme)
  frame: { border: FRAME_BORDER, notes: maplePanel, vignette: 0.5, dim: 0.42 },
  overlays: { lose: '#8a3412', titles: ['noMarbles', 'allClear', 'runDone'] },
  // the level select and the level-clear card (screens.ts)
  cards: [CLEAR_CARD],
  prebake: (scene) => prebakeMaze(scene),
};
