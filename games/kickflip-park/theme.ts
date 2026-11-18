// Kickflip Park's menu theme (src/core/menu-theme.ts): Shrikhand, loud street colours. The buttons
// are die-cut vinyl stickers (a white cut edge, halftone dots, a gloss streak, a peeling corner and
// a slight tilt), switches and plates sit on grip tape, masking tape holds the screen's corners
// and the how-to is a flyer taped up. A skateboard deck, wheels up, flies behind the logo. Every
// piece is painted once on a canvas (the core caches it); nothing here runs in play.
import Phaser from 'phaser';
import { t, loc, shadeColor, SkinButton, type MenuTheme, type SkinPainter, type BorderStyle } from '@core';
import { SHRIKHAND } from '@core/fonts/shrikhand';
import { prebakeSetup, SETUP_FLYER } from './setup';
import { prebakePlay } from './labels';
import { loadMeta } from './meta';
import { usableBoard } from './boardmodel';

/** The session summary's card heights (PlayScene.finish: 190 + 46 per line), painted ahead. */
export const SUMMARY_W = 620;
export const summaryH = (lines: number): number => 190 + lines * 46;
/** The PARK & BOARD button on the menu. */
const PICK_W = 360, PICK_H = 100;

const PINK = 0xff3b5c, BLUE = 0x1f8fff, YELLOW = 0xffe14a, INK = '#1a1020';

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

/** Grip tape: near-black with a fine grit of light and dark specks (inside a clip). */
function grit(c: CanvasRenderingContext2D, w: number, h: number, r: () => number, base: number): void {
  c.fillStyle = rgba(base);
  c.fillRect(0, 0, w, h);
  const n = Math.min(2600, Math.round((w * h) / 28));
  for (let i = 0; i < n; i++) {
    const v = r();
    c.fillStyle = v < 0.5 ? `rgba(255,255,255,${0.05 + r() * 0.1})` : `rgba(0,0,0,${0.2 + r() * 0.3})`;
    c.fillRect(r() * w, r() * h, 1 + r() * 1.4, 1 + r() * 1.4);
  }
  // a few scuffs worn pale by shoes
  c.strokeStyle = 'rgba(255,255,255,0.07)';
  c.lineCap = 'round';
  for (let i = 0; i < 3; i++) {
    c.lineWidth = 4 + r() * 8;
    const x = r() * w, y = r() * h;
    c.beginPath(); c.moveTo(x, y); c.quadraticCurveTo(x + 20 + r() * 30, y - 6, x + 40 + r() * 50, y + (r() - 0.5) * 10); c.stroke();
  }
}

/** Halftone dots fading in from the lower-right corner. */
function halftone(c: CanvasRenderingContext2D, w: number, h: number, colour: string): void {
  c.fillStyle = colour;
  const step = 7;
  for (let y = step / 2; y < h; y += step) {
    for (let x = step / 2 + ((y / step) % 2) * (step / 2); x < w; x += step) {
      const k = Math.max(0, ((x / w) + (y / h)) - 1.05);
      if (k <= 0) continue;
      c.beginPath(); c.arc(x, y, Math.min(step * 0.42, k * 3.4), 0, Math.PI * 2); c.fill();
    }
  }
}

/**
 * The sticker skin. Buttons and plates are vinyl stickers in the piece's colour with a white cut
 * edge, tilted a little (each size its own way); the track and the boards are grip tape. Hover
 * lifts the sticker with a yellow glow, a press flattens it, the chosen switch segment is a
 * bright sticker on the tape and the other one a faded, worn one.
 */
const stickerPainter: SkinPainter = (c, kind, w, h, o) => {
  const P = o.palette, r = rng(o.seed);
  const down = o.state === 'down', off = o.state === 'off', over = o.state === 'over', on = o.state === 'on';
  if (kind === 'track' || kind === 'board') {
    const shape = rounded(0, 0, w, h, kind === 'track' ? h * 0.32 : 22);
    c.save();
    c.shadowColor = 'rgba(0,0,0,0.55)'; c.shadowBlur = 10; c.shadowOffsetY = 5;
    c.fillStyle = '#000'; c.fill(shape);
    c.restore();
    c.save(); c.clip(shape);
    grit(c, w, h, r, o.color);
    const sh = c.createLinearGradient(0, 0, 0, h);
    sh.addColorStop(0, kind === 'track' ? 'rgba(0,0,0,0.45)' : 'rgba(255,255,255,0.07)'); sh.addColorStop(0.3, 'rgba(0,0,0,0)');
    c.fillStyle = sh; c.fillRect(0, 0, w, h);
    c.restore();
    c.lineWidth = 3; c.strokeStyle = kind === 'track' ? 'rgba(255,255,255,0.18)' : 'rgba(255,255,255,0.85)';
    c.stroke(kind === 'track' ? shape : rounded(1.5, 1.5, w - 3, h - 3, 21));
    return;
  }
  const round = kind === 'round';
  const big = kind === 'button' && w >= 200;
  const tilt = round ? 0 : (r() - 0.5) * (big ? 0.03 : 0.06) + (over ? 0.012 : 0);
  const edge = Math.max(4, Math.min(7, h * 0.08));
  const rad = round ? Math.min(w, h) / 2 : Math.min(h * 0.34, 28);
  const col = off ? shadeColor(o.color, -0.55) : o.color;
  c.save();
  c.translate(w / 2, h / 2 + (down ? 3 : over ? -2 : 0));
  c.rotate(tilt);
  c.translate(-w / 2, -h / 2);
  const outer = round ? (() => { const p = new Path2D(); p.arc(w / 2, h / 2, Math.min(w, h) / 2, 0, Math.PI * 2); return p; })() : rounded(0, 0, w, h, rad);
  const inner = round ? (() => { const p = new Path2D(); p.arc(w / 2, h / 2, Math.min(w, h) / 2 - edge, 0, Math.PI * 2); return p; })() : rounded(edge, edge, w - edge * 2, h - edge * 2, rad - edge * 0.7);
  // the sticker's shadow on the wall, then its white cut edge
  c.save();
  c.shadowColor = over ? rgba(P.trim, 0.85) : 'rgba(0,0,0,0.55)';
  c.shadowBlur = down || off ? 3 : over ? 16 : 9;
  c.shadowOffsetY = down || off ? 1 : over ? 4 : 6;
  c.fillStyle = off ? '#bdb8c4' : '#ffffff'; c.fill(outer);
  c.restore();
  // the printed face
  const face = c.createLinearGradient(0, 0, 0, h);
  face.addColorStop(0, rgba(shadeColor(col, off ? 0 : 0.22)));
  face.addColorStop(0.55, rgba(col));
  face.addColorStop(1, rgba(shadeColor(col, -0.28)));
  c.fillStyle = face; c.fill(inner);
  c.save();
  c.clip(inner);
  halftone(c, w, h, rgba(shadeColor(col, -0.45), 0.55));
  if (!off) {
    // a gloss streak across the top, a thin ink line inside the cut edge
    c.fillStyle = 'rgba(255,255,255,0.26)';
    c.beginPath(); c.moveTo(w * 0.06, edge); c.lineTo(w * 0.5, edge); c.lineTo(w * 0.4, h * 0.42); c.lineTo(w * 0.02, h * 0.42); c.closePath(); c.fill();
    c.fillStyle = 'rgba(255,255,255,0.14)';
    c.beginPath(); c.moveTo(w * 0.55, edge); c.lineTo(w * 0.6, edge); c.lineTo(w * 0.5, h * 0.42); c.lineTo(w * 0.45, h * 0.42); c.closePath(); c.fill();
  } else {
    // worn: scratches through the print
    c.strokeStyle = 'rgba(255,255,255,0.12)'; c.lineWidth = 1.2;
    for (let i = 0; i < 6; i++) { const x = r() * w; c.beginPath(); c.moveTo(x, r() * h); c.lineTo(x + 18 + r() * 30, r() * h); c.stroke(); }
  }
  c.restore();
  c.lineWidth = 2; c.strokeStyle = 'rgba(26,16,32,0.55)'; c.stroke(inner);
  // the chosen switch segment: a yellow ring
  if (on) { c.lineWidth = 3.5; c.strokeStyle = rgba(P.trim); c.stroke(inner); }
  // a corner peeling off a big button: the sticker's white back curling up
  if (big && !down) {
    // the fold runs from (x - s, y) to (x, y + s) across the corner; the flap is the cut corner
    // folded back over the face
    const s = Math.min(24, h * 0.28), x = w - rad * 0.3, y = rad * 0.3;
    c.save();
    c.globalCompositeOperation = 'destination-out';
    c.beginPath(); c.moveTo(x - s, y); c.lineTo(x, y + s); c.lineTo(x + 60, y + s - 60); c.lineTo(x - s + 60, y - 60); c.closePath(); c.fill();
    c.restore();
    c.save();
    c.shadowColor = 'rgba(0,0,0,0.45)'; c.shadowBlur = 5; c.shadowOffsetX = -2; c.shadowOffsetY = 3;
    const g = c.createLinearGradient(x - s / 2, y + s / 2, x - s, y + s);
    g.addColorStop(0, '#d9d4e0'); g.addColorStop(1, '#ffffff');
    c.fillStyle = g;
    c.beginPath(); c.moveTo(x - s, y); c.quadraticCurveTo(x - s * 1.05, y + s * 0.8, x - s * 0.88, y + s * 0.88); c.quadraticCurveTo(x - s * 0.8, y + s * 1.05, x, y + s); c.closePath(); c.fill();
    c.restore();
  }
  if (down) { c.fillStyle = 'rgba(0,0,0,0.14)'; c.fill(outer); }
  c.restore();
};

/** The flyer behind the how-to and the overlays: off-white paper, two strips of tape at the top. */
function flyer(c: CanvasRenderingContext2D, w: number, h: number): void {
  const r = rng(Math.round(w * 7 + h));
  c.save();
  c.shadowColor = 'rgba(0,0,0,0.5)'; c.shadowBlur = 12; c.shadowOffsetY = 6;
  c.fillStyle = '#f6f1e4';
  c.beginPath();
  // a slightly uneven cut
  c.moveTo(2, 3); c.lineTo(w - 3, 0); c.lineTo(w, h - 2); c.lineTo(0, h); c.closePath();
  c.fill();
  c.restore();
  c.save();
  c.beginPath(); c.moveTo(2, 3); c.lineTo(w - 3, 0); c.lineTo(w, h - 2); c.lineTo(0, h); c.closePath(); c.clip();
  // paper grain and a photocopier's dark corners
  for (let i = 0; i < (w * h) / 60; i++) { c.fillStyle = `rgba(80,60,40,${r() * 0.06})`; c.fillRect(r() * w, r() * h, 1.5, 1.5); }
  const v = c.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.3, w / 2, h / 2, Math.max(w, h) * 0.75);
  v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(1, 'rgba(60,40,20,0.16)');
  c.fillStyle = v; c.fillRect(0, 0, w, h);
  // a pink marker frame
  c.strokeStyle = rgba(PINK, 0.85); c.lineWidth = 4; c.lineJoin = 'round';
  c.beginPath(); c.moveTo(12, 14); c.lineTo(w - 13, 11); c.lineTo(w - 11, h - 13); c.lineTo(11, h - 11); c.closePath(); c.stroke();
  c.restore();
  // masking tape on the two top corners
  for (const [x, a] of [[36, -0.5], [w - 36, 0.5]] as const) tape(c, x, 6, 86, 26, a, YELLOW);
}

/** A strip of semi-transparent masking tape with torn ends, centred on (x, y). */
function tape(c: CanvasRenderingContext2D, x: number, y: number, len: number, wide: number, angle: number, colour: number): void {
  c.save();
  c.translate(x, y);
  c.rotate(angle);
  c.beginPath();
  const zig = (x0: number, dir: number) => { for (let i = 0; i <= 6; i++) c.lineTo(x0 + (i % 2 ? dir * 3 : 0), -wide / 2 + (wide * i) / 6); };
  c.moveTo(-len / 2, -wide / 2);
  c.lineTo(len / 2, -wide / 2);
  zig(len / 2, 1);
  c.lineTo(-len / 2, wide / 2);
  for (let i = 6; i >= 0; i--) c.lineTo(-len / 2 + (i % 2 ? -3 : 0), -wide / 2 + (wide * i) / 6);
  c.closePath();
  c.shadowColor = 'rgba(0,0,0,0.25)'; c.shadowBlur = 3; c.shadowOffsetY = 2;
  c.fillStyle = rgba(colour, 0.82);
  c.fill();
  c.shadowColor = 'transparent';
  c.fillStyle = 'rgba(255,255,255,0.22)';
  c.fillRect(-len / 2, -wide / 2 + 3, len, wide * 0.25);
  c.restore();
}

/** Masking tape crossed over each corner of the screen, a spray-paint line along the edges. */
const TAPE_BORDER: BorderStyle = {
  thick: 8,
  inset: 6,
  edge: (c, len) => {
    const r = rng(len);
    c.fillStyle = rgba(PINK, 0.32);
    c.fillRect(0, 3, len, 2);
    for (let i = 0; i < len / 3; i++) { c.fillStyle = rgba(PINK, 0.1 + r() * 0.3); c.fillRect(r() * len, 1 + r() * 6, 1.4, 1.4); }
  },
  corner: {
    size: 120,
    inset: 0,
    draw: (c) => {
      tape(c, 44, 40, 110, 28, -0.78, YELLOW);
      tape(c, 30, 56, 70, 24, 0.12, PINK);
    },
  },
};

/** The deck flying behind the logo, wheels up: trucks, four wheels and a star print, with motion lines. */
export function deckEmblem(c: CanvasRenderingContext2D, size: number): void {
  const u = size / 100;
  c.save();
  c.translate(size / 2, size / 2);
  c.lineJoin = 'round';
  // a burst of street colours behind it
  c.save();
  for (let i = 0; i < 12; i++) {
    c.fillStyle = i % 2 ? rgba(YELLOW, 0.5) : rgba(PINK, 0.4);
    c.beginPath(); c.moveTo(0, 0);
    const a0 = (i / 12) * Math.PI * 2, a1 = ((i + 0.5) / 12) * Math.PI * 2;
    c.arc(0, 0, 46 * u, a0, a1); c.closePath(); c.fill();
  }
  c.restore();
  c.globalCompositeOperation = 'destination-out';
  const fade = c.createRadialGradient(0, 0, 26 * u, 0, 0, 48 * u);
  fade.addColorStop(0, 'rgba(0,0,0,0)'); fade.addColorStop(1, 'rgba(0,0,0,1)');
  c.fillStyle = fade; c.fillRect(-50 * u, -50 * u, 100 * u, 100 * u);
  c.globalCompositeOperation = 'source-over';
  // motion lines
  c.strokeStyle = '#ffffff'; c.lineCap = 'round';
  for (const [y, x0, x1] of [[-30, -46, -26], [-20, -48, -32], [26, 30, 46], [34, 22, 40]]) {
    c.lineWidth = 3 * u;
    c.beginPath(); c.moveTo(x0 * u, y * u); c.lineTo(x1 * u, y * u); c.stroke();
  }
  c.rotate(-0.42);
  // the deck from below: a long shape with kicked-up rounded ends
  const deck = new Path2D();
  deck.roundRect(-44 * u, -13 * u, 88 * u, 26 * u, 13 * u);
  c.fillStyle = INK; c.fill(deck);
  const body = c.createLinearGradient(0, -13 * u, 0, 13 * u);
  body.addColorStop(0, '#ff6a84'); body.addColorStop(0.6, rgba(PINK)); body.addColorStop(1, '#b81a3a');
  c.save();
  c.clip(deck);
  c.fillStyle = body; c.fillRect(-46 * u, -14 * u, 92 * u, 28 * u);
  // a blue band and a yellow star printed on the bottom
  c.fillStyle = rgba(BLUE); c.fillRect(-46 * u, -2 * u, 92 * u, 5 * u);
  c.fillStyle = '#ffffff'; c.fillRect(-46 * u, -3.2 * u, 92 * u, 1.2 * u); c.fillRect(-46 * u, 3 * u, 92 * u, 1.2 * u);
  c.fillStyle = 'rgba(255,255,255,0.2)'; c.fillRect(-46 * u, -12 * u, 92 * u, 5 * u);
  c.restore();
  c.lineWidth = 2.4 * u; c.strokeStyle = INK; c.stroke(deck);
  c.fillStyle = rgba(YELLOW); c.strokeStyle = INK; c.lineWidth = 1.6 * u;
  c.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5, rr = (i % 2 ? 3.8 : 8.5) * u;
    i ? c.lineTo(Math.cos(a) * rr, Math.sin(a) * rr) : c.moveTo(Math.cos(a) * rr, Math.sin(a) * rr);
  }
  c.closePath(); c.fill(); c.stroke();
  // trucks and wheels
  for (const x of [-27, 27]) {
    const metal = c.createLinearGradient(0, -17 * u, 0, 17 * u);
    metal.addColorStop(0, '#f4f6fa'); metal.addColorStop(0.5, '#a9b1bf'); metal.addColorStop(1, '#5d6676');
    c.fillStyle = metal; c.strokeStyle = INK; c.lineWidth = 1.8 * u;
    c.beginPath(); c.roundRect((x - 4) * u, -17 * u, 8 * u, 34 * u, 3 * u); c.fill(); c.stroke();
    c.beginPath(); c.roundRect((x - 6) * u, -5 * u, 12 * u, 10 * u, 3 * u); c.fill(); c.stroke();
    for (const y of [-19, 19]) {
      const wg = c.createLinearGradient((x - 6) * u, 0, (x + 6) * u, 0);
      wg.addColorStop(0, '#fff6c0'); wg.addColorStop(0.5, '#ffe14a'); wg.addColorStop(1, '#d89a10');
      c.fillStyle = wg;
      c.beginPath(); c.roundRect((x - 6) * u, (y - 5) * u, 12 * u, 10 * u, 4 * u); c.fill(); c.stroke();
      c.fillStyle = 'rgba(26,16,32,0.6)';
      c.beginPath(); c.arc(x * u, y * u, 1.6 * u, 0, Math.PI * 2); c.fill();
    }
  }
  c.restore();
}

export const KICKFLIP_THEME: MenuTheme = {
  font: SHRIKHAND,
  fontScale: 0.9,
  palette: {
    primary: PINK, secondary: BLUE, board: 0x1d1c22, trim: YELLOW,
    label: '#ffffff', labelStroke: INK, muted: '#b9b6c4', accent: '#ffe14a',
    heading: '#e8264a', body: '#221c2a', icon: 0xffffff, shade: 0x060a18,
  },
  logo: {
    fill: ['#fffbe0', '#ffe14a', '#ff9a1f'],
    outline: INK,
    outlineWidth: 0.12,
    rim: '#ffffff',
    depth: '#7a0f2a',
    size: 130,
    lineHeight: 0.95,
    emblem: { draw: deckEmblem, size: 300, overlap: 0.32 },
  },
  skin: stickerPainter,
  // dim: the backdrop's darkening (main.ts drew it as its own layer before the theme)
  frame: { border: TAPE_BORDER, notes: flyer, vignette: 0.5, dim: 0.3 },
  overlays: { lose: '#e8264a', titles: ['sessionOver'] },
  // the PARK & BOARD button (main.ts menuOption)
  pieces: [{ kind: 'button', w: PICK_W, h: PICK_H }],
  // the session summary's flyer with one, two or three lines (PlayScene.finish), the setup's goals
  cards: [...[1, 2, 3].map((n) => ({ w: SUMMARY_W, h: summaryH(n) })), SETUP_FLYER],
  // the setup's stickers, grip tape, buttons and labels (setup.ts), the run's words (labels.ts)
  prebake: (scene) => { prebakeSetup(scene); prebakePlay(scene); },
};

/**
 * The PARK & BOARD button under the difficulty switch: a blue sticker with the label and, under
 * it, the park and the board that PLAY skates. Returns a refresh for that line.
 */
export function pickButton(scene: Phaser.Scene, x: number, y: number, open: () => void): { btn: SkinButton; refresh: () => void } {
  const btn = new SkinButton(scene, x, y, t('parkBoard'), open, { width: PICK_W, height: PICK_H, size: 36 });
  const refresh = () => {
    const m = loadMeta();
    btn.setText(t('parkBoard')).fitLabel(PICK_W - 60);
    btn.setSub(t('park_' + m.park) + ' · ' + loc(usableBoard(m.board).name), { size: 19, color: '#fff3c4' });
  };
  refresh();
  return { btn, refresh };
}
