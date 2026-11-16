// Mud Rally's menu theme (src/core/menu-theme.ts): Black Ops One, a muddy monster-truck arena.
// The buttons are steel plates with chamfered corners, brushed metal, rivets and splashes of mud
// (PLAY painted hazard orange), the switches sit in a slot of tyre rubber, a tyre tread runs round
// the screen with a chequered flag in each corner, the how-to is on a sheet of aluminium tread
// plate, and a monster truck bursts out of a mud splash behind the logo. Every piece is painted
// once on a canvas (the core caches it under the Ayvago intro); nothing here runs in play.
import { shadeColor, STEERING_PIECES, type MenuTheme, type SkinPainter, type BorderStyle } from '@core';
import { BLACK_OPS_ONE } from '@core/fonts/black-ops-one';
import { prebakeGarage, GARAGE_PIECES, RESULTS_CARD, SHOP_CARD } from './panels';

export const ORANGE = 0xf0761a, STEEL = 0x6c7580, DARK = 0x3a3f47, HAZARD = 0xffc21a, GREEN = 0x3f9a3a, RED = 0xc8332a;
export const INK = '#1a1410';
const MUD = ['#5a3a1e', '#6e4826', '#4a2e16', '#7a5430'];

const rgba = (c: number, a = 1): string => `rgba(${(c >> 16) & 255},${(c >> 8) & 255},${c & 255},${a})`;

export function rng(seed: number): () => number {
  let s = (seed >>> 0) % 2147483647 || 1;
  return () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
}

/** A plate with its corners cut off (chamfered). */
function chamfer(x: number, y: number, w: number, h: number, k: number): Path2D {
  k = Math.min(k, w / 3, h / 3);
  const p = new Path2D();
  p.moveTo(x + k, y); p.lineTo(x + w - k, y); p.lineTo(x + w, y + k); p.lineTo(x + w, y + h - k);
  p.lineTo(x + w - k, y + h); p.lineTo(x + k, y + h); p.lineTo(x, y + h - k); p.lineTo(x, y + k);
  p.closePath();
  return p;
}

/** A round-headed rivet with its highlight. */
function rivet(c: CanvasRenderingContext2D, x: number, y: number, r: number): void {
  c.save();
  c.shadowColor = 'rgba(0,0,0,0.55)'; c.shadowBlur = 2; c.shadowOffsetY = 1;
  const g = c.createRadialGradient(x - r * 0.4, y - r * 0.4, 0, x, y, r);
  g.addColorStop(0, '#f2f4f6'); g.addColorStop(0.45, '#a7afb8'); g.addColorStop(1, '#4a5058');
  c.fillStyle = g;
  c.beginPath(); c.arc(x, y, r, 0, Math.PI * 2); c.fill();
  c.restore();
}

/** A splash of mud: a blob with a few droplets thrown off it. */
export function splat(c: CanvasRenderingContext2D, x: number, y: number, s: number, r: () => number, color = MUD[Math.floor(r() * MUD.length)]): void {
  c.fillStyle = color;
  c.beginPath();
  const n = 9;
  for (let i = 0; i <= n; i++) {
    const a = (i / n) * Math.PI * 2, rr = s * (0.65 + r() * 0.5);
    const px = x + Math.cos(a) * rr, py = y + Math.sin(a) * rr * 0.8;
    i ? c.lineTo(px, py) : c.moveTo(px, py);
  }
  c.closePath(); c.fill();
  for (let i = 0; i < 5; i++) {
    const a = r() * Math.PI * 2, d = s * (1.2 + r() * 1.1), rr = s * (0.12 + r() * 0.2);
    c.beginPath(); c.arc(x + Math.cos(a) * d, y + Math.sin(a) * d * 0.8, rr, 0, Math.PI * 2); c.fill();
  }
  // a wet sheen
  c.fillStyle = 'rgba(255,230,190,0.18)';
  c.beginPath(); c.ellipse(x - s * 0.2, y - s * 0.25, s * 0.35, s * 0.18, -0.3, 0, Math.PI * 2); c.fill();
}

/** Brushed metal: fine horizontal streaks (inside a clip). */
function brushed(c: CanvasRenderingContext2D, w: number, h: number, r: () => number): void {
  for (let i = 0; i < Math.max(12, h * 1.2); i++) {
    c.fillStyle = r() < 0.5 ? `rgba(255,255,255,${r() * 0.1})` : `rgba(0,0,0,${r() * 0.12})`;
    c.fillRect(r() * w * 0.3 - 20, r() * h, w * (0.4 + r() * 0.8), 1);
  }
}

/** Raised diamond tread plate (inside a clip). */
function treadPlate(c: CanvasRenderingContext2D, w: number, h: number, light: string, dark: string): void {
  c.lineCap = 'round';
  for (let y = 6, row = 0; y < h + 10; y += 16, row++) {
    for (let x = row % 2 ? 4 : 12; x < w + 10; x += 16) {
      const a = row % 2 ? 0.7 : -0.7;
      c.save(); c.translate(x, y); c.rotate(a);
      c.strokeStyle = dark; c.lineWidth = 3.4; c.beginPath(); c.moveTo(-4, 1); c.lineTo(4, 1); c.stroke();
      c.strokeStyle = light; c.lineWidth = 2.2; c.beginPath(); c.moveTo(-4, 0); c.lineTo(4, 0); c.stroke();
      c.restore();
    }
  }
}

/**
 * The steel skin: a chamfered plate of brushed steel in the piece's colour (PLAY painted hazard
 * orange), a bevel, rivets at the corners of the big pieces and mud splashed up from below. Hover
 * glows hazard yellow, a press dents it, the chosen switch segment has a yellow rim, a disabled
 * plate is dull and rusty. The switch's track is a slot of black tyre rubber with its tread.
 */
const steelPainter: SkinPainter = (c, kind, w, h, o) => {
  const P = o.palette, r = rng(o.seed);
  const down = o.state === 'down', off = o.state === 'off', over = o.state === 'over', on = o.state === 'on';
  const round = kind === 'round';
  const k = Math.min(12, h * 0.18);
  const shape = (i: number): Path2D => {
    if (!round) return chamfer(i, i, w - i * 2, h - i * 2, k - i * 0.4);
    const p = new Path2D(); p.arc(w / 2, h / 2, Math.min(w, h) / 2 - i, 0, Math.PI * 2); return p;
  };
  const outer = shape(0);
  c.save();
  c.translate(0, down ? 3 : 0);
  c.save();
  c.shadowColor = over ? rgba(P.trim, 0.95) : 'rgba(10,6,2,0.6)';
  c.shadowBlur = down ? 3 : over ? 16 : 9;
  c.shadowOffsetY = down ? 1 : over ? 3 : 6;
  c.fillStyle = '#000'; c.fill(outer);
  c.restore();
  if (kind === 'track') {
    c.fillStyle = '#17181b'; c.fill(outer);
    c.save(); c.clip(outer);
    // the tyre's tread blocks, faint in the rubber
    c.fillStyle = 'rgba(255,255,255,0.05)';
    for (let x = -10; x < w + 10; x += 22) {
      c.beginPath(); c.moveTo(x, 4); c.lineTo(x + 10, h / 2); c.lineTo(x, h - 4); c.lineTo(x + 7, h - 4); c.lineTo(x + 17, h / 2); c.lineTo(x + 7, 4); c.closePath(); c.fill();
    }
    const sh = c.createLinearGradient(0, 0, 0, h);
    sh.addColorStop(0, 'rgba(0,0,0,0.6)'); sh.addColorStop(0.3, 'rgba(0,0,0,0)'); sh.addColorStop(1, 'rgba(255,255,255,0.06)');
    c.fillStyle = sh; c.fillRect(0, 0, w, h);
    c.restore();
    c.lineWidth = 3; c.strokeStyle = rgba(STEEL); c.stroke(outer);
    c.lineWidth = 1.2; c.strokeStyle = '#0a0a0a'; c.stroke(outer);
    c.restore();
    return;
  }
  const col = off ? 0x5b5048 : o.color;
  const body = c.createLinearGradient(0, 0, w * 0.3, h);
  body.addColorStop(0, rgba(shadeColor(col, down ? 0.02 : 0.3)));
  body.addColorStop(0.5, rgba(col));
  body.addColorStop(1, rgba(shadeColor(col, -0.32)));
  c.fillStyle = body; c.fill(outer);
  c.save();
  c.clip(outer);
  if (kind === 'board') treadPlate(c, w, h, rgba(shadeColor(col, 0.25), 0.55), 'rgba(0,0,0,0.35)');
  brushed(c, w, h, r);
  if (off) {
    // rust blooms
    for (let i = 0; i < 6; i++) { c.fillStyle = `rgba(150,70,20,${0.15 + r() * 0.2})`; c.beginPath(); c.arc(r() * w, r() * h, 4 + r() * 10, 0, Math.PI * 2); c.fill(); }
  }
  // mud splashed up from the bottom edge
  if (!round) {
    const n = Math.max(2, Math.round(w / 70));
    for (let i = 0; i < n; i++) splat(c, (i + 0.2 + r() * 0.6) * (w / n), h + 2 - r() * 4, Math.min(h * 0.24, 7 + r() * 9), r);
    if (w > 140) splat(c, r() * w, r() * h * 0.3, 3 + r() * 3, r);
  }
  if (down) {
    const top = c.createLinearGradient(0, 0, 0, 14);
    top.addColorStop(0, 'rgba(0,0,0,0.45)'); top.addColorStop(1, 'rgba(0,0,0,0)');
    c.fillStyle = top; c.fillRect(0, 0, w, 14);
  }
  c.restore();
  // the bevel: light on the top and left, dark on the bottom and right
  c.save(); c.clip(outer);
  c.lineWidth = 4;
  c.strokeStyle = 'rgba(255,255,255,0.32)'; c.stroke(shape(-1.2));
  c.restore();
  c.lineWidth = 2; c.strokeStyle = rgba(shadeColor(col, -0.7)); c.stroke(outer);
  c.lineWidth = 1.5; c.strokeStyle = 'rgba(255,255,255,0.22)'; c.stroke(shape(4));
  // rivets
  if (!round && !off) {
    const rr = Math.max(2.4, Math.min(4.2, h * 0.045));
    if ((kind === 'button' && w >= 180) || kind === 'board') {
      for (const [x, y] of [[k + 4, 8], [w - k - 4, 8], [k + 4, h - 8], [w - k - 4, h - 8]]) rivet(c, x, y, rr);
    } else if (kind === 'plate' && w >= 60) for (const x of [8, w - 8]) rivet(c, x, 8, 2.2);
  }
  if (on || over) {
    c.save();
    c.shadowColor = rgba(P.trim, 0.95); c.shadowBlur = over ? 12 : 7;
    c.lineWidth = over ? 4 : 3.5; c.strokeStyle = rgba(P.trim); c.stroke(shape(1.5));
    c.restore();
  }
  if (down) { c.fillStyle = 'rgba(0,0,0,0.14)'; c.fill(outer); }
  c.restore();
};

/** A yellow and black hazard stripe band, w x h at (x, y). */
function hazard(c: CanvasRenderingContext2D, x: number, y: number, w: number, h: number): void {
  c.save();
  c.beginPath(); c.rect(x, y, w, h); c.clip();
  c.fillStyle = rgba(HAZARD); c.fillRect(x, y, w, h);
  c.fillStyle = '#1b1b1b';
  for (let i = -h; i < w + h; i += h * 1.4) { c.beginPath(); c.moveTo(x + i, y + h); c.lineTo(x + i + h * 0.7, y + h); c.lineTo(x + i + h * 1.4, y); c.lineTo(x + i + h * 0.7, y); c.closePath(); c.fill(); }
  c.restore();
}

/** The aluminium tread plate behind the how-to and on the pause, result and garage screens. */
export function plateCard(c: CanvasRenderingContext2D, w: number, h: number): void {
  const r = rng(Math.round(w * 5 + h));
  const shape = chamfer(0, 0, w, h, 22);
  c.save();
  c.shadowColor = 'rgba(0,0,0,0.6)'; c.shadowBlur = 14; c.shadowOffsetY = 7;
  c.fillStyle = '#c9ced4'; c.fill(shape);
  c.restore();
  const g = c.createLinearGradient(0, 0, w * 0.4, h);
  g.addColorStop(0, '#eef1f4'); g.addColorStop(0.5, '#cfd5db'); g.addColorStop(1, '#aab2bb');
  c.fillStyle = g; c.fill(shape);
  c.save();
  c.clip(shape);
  treadPlate(c, w, h, 'rgba(255,255,255,0.4)', 'rgba(60,70,80,0.13)');
  brushed(c, w, h, r);
  // a hazard band along the top edge
  hazard(c, 0, 0, w, 14);
  // mud thrown up at the bottom corners
  // (only in the corners, clear of the text on the card)
  for (let i = 0; i < 3; i++) splat(c, r() * 34, h - r() * 14, 5 + r() * 6, r);
  for (let i = 0; i < 3; i++) splat(c, w - r() * 34, h - r() * 14, 5 + r() * 6, r);
  splat(c, w - 10 - r() * 14, 22 + r() * 10, 3 + r() * 3, r);
  c.restore();
  c.lineWidth = 3; c.strokeStyle = '#4a525c'; c.stroke(shape);
  c.lineWidth = 1.5; c.strokeStyle = 'rgba(255,255,255,0.6)'; c.stroke(chamfer(5, 5, w - 10, h - 10, 18));
  for (const [x, y] of [[20, 28], [w - 20, 28], [20, h - 18], [w - 20, h - 18]]) rivet(c, x, y, 4.5);
}

/** A tyre tread round the screen, a chequered flag in each corner. */
const TREAD_BORDER: BorderStyle = {
  thick: 18,
  inset: 0,
  edge: (c, len, thick) => {
    c.fillStyle = '#1a1b1e'; c.fillRect(0, 0, len, thick);
    // chevron tread blocks
    c.fillStyle = '#34363b';
    for (let x = -8; x < len + 8; x += 20) {
      c.beginPath(); c.moveTo(x, 2); c.lineTo(x + 8, thick / 2); c.lineTo(x, thick - 2); c.lineTo(x + 6, thick - 2); c.lineTo(x + 14, thick / 2); c.lineTo(x + 6, 2); c.closePath(); c.fill();
    }
    c.fillStyle = 'rgba(255,255,255,0.12)'; c.fillRect(0, 0, len, 1.5);
    c.fillStyle = 'rgba(0,0,0,0.5)'; c.fillRect(0, thick - 2, len, 2);
  },
  corner: {
    size: 64,
    inset: 0,
    draw: (c, s) => {
      // a little chequered flag on a pole, waving from the corner
      c.save();
      c.shadowColor = 'rgba(0,0,0,0.55)'; c.shadowBlur = 4; c.shadowOffsetY = 2;
      c.strokeStyle = '#d8dde3'; c.lineWidth = 3.5; c.lineCap = 'round';
      c.beginPath(); c.moveTo(s * 0.14, s * 0.92); c.lineTo(s * 0.14, s * 0.1); c.stroke();
      c.restore();
      const fw = s * 0.72, fh = s * 0.46, x0 = s * 0.16, y0 = s * 0.1, n = 5, m = 3;
      const wave = (u: number) => Math.sin(u * Math.PI * 1.6) * s * 0.05;
      for (let i = 0; i < n; i++) for (let j = 0; j < m; j++) {
        const u0 = i / n, u1 = (i + 1) / n;
        c.fillStyle = (i + j) % 2 ? '#111' : '#f4f4f4';
        c.beginPath();
        c.moveTo(x0 + u0 * fw, y0 + (j / m) * fh + wave(u0)); c.lineTo(x0 + u1 * fw, y0 + (j / m) * fh + wave(u1));
        c.lineTo(x0 + u1 * fw, y0 + ((j + 1) / m) * fh + wave(u1)); c.lineTo(x0 + u0 * fw, y0 + ((j + 1) / m) * fh + wave(u0));
        c.closePath(); c.fill();
      }
      c.strokeStyle = '#111'; c.lineWidth = 1.5; c.strokeRect(x0, y0, 0.01, fh);
    },
  },
};

/** A monster-truck wheel: a fat tyre with chunky tread, a steel rim. */
function bigWheel(c: CanvasRenderingContext2D, x: number, y: number, r: number, u: number): void {
  c.fillStyle = '#16171a';
  c.beginPath(); c.arc(x, y, r, 0, Math.PI * 2); c.fill();
  c.fillStyle = '#2c2e33';
  for (let i = 0; i < 14; i++) {
    const a = (i / 14) * Math.PI * 2;
    c.save(); c.translate(x + Math.cos(a) * r, y + Math.sin(a) * r); c.rotate(a);
    c.fillRect(-2.6 * u, -3 * u, 4.2 * u, 6 * u);
    c.restore();
  }
  c.strokeStyle = INK; c.lineWidth = 2 * u; c.beginPath(); c.arc(x, y, r + 1.2 * u, 0, Math.PI * 2); c.stroke();
  const g = c.createRadialGradient(x - r * 0.2, y - r * 0.2, 0, x, y, r * 0.5);
  g.addColorStop(0, '#f1f3f5'); g.addColorStop(1, '#7d8690');
  c.fillStyle = g; c.beginPath(); c.arc(x, y, r * 0.48, 0, Math.PI * 2); c.fill();
  c.strokeStyle = INK; c.lineWidth = 1.4 * u; c.stroke();
  c.fillStyle = '#3a3f47';
  for (let i = 0; i < 5; i++) { const a = (i / 5) * Math.PI * 2; c.beginPath(); c.arc(x + Math.cos(a) * r * 0.28, y + Math.sin(a) * r * 0.28, 1.4 * u, 0, Math.PI * 2); c.fill(); }
}

/** The emblem behind the logo: a monster truck in a wheelie, bursting out of a splash of mud. */
export function truckEmblem(c: CanvasRenderingContext2D, size: number): void {
  const u = size / 100, r = rng(7);
  c.save();
  c.translate(size / 2, size / 2 + 4 * u);
  c.lineJoin = 'round';
  const halo = c.createRadialGradient(0, 0, 6 * u, 0, 0, 50 * u);
  halo.addColorStop(0, 'rgba(255,190,80,0.5)'); halo.addColorStop(1, 'rgba(255,190,80,0)');
  c.fillStyle = halo; c.fillRect(-50 * u, -50 * u, 100 * u, 100 * u);
  // the mud wave thrown up behind and under the truck
  for (let i = 0; i < 9; i++) splat(c, (-40 + r() * 80) * u, (22 + r() * 16) * u, (6 + r() * 7) * u, r);
  for (let i = 0; i < 6; i++) splat(c, (-46 + r() * 20) * u, (-6 + r() * 30) * u, (3 + r() * 5) * u, r);
  c.rotate(-0.16);
  // the chassis and suspension
  c.strokeStyle = '#2b2f36'; c.lineWidth = 3.4 * u; c.lineCap = 'round';
  c.beginPath(); c.moveTo(-22 * u, 14 * u); c.lineTo(-12 * u, 2 * u); c.moveTo(22 * u, 14 * u); c.lineTo(12 * u, 2 * u); c.stroke();
  c.fillStyle = '#2b2f36'; c.fillRect(-26 * u, 0, 52 * u, 5 * u);
  // the body: a pickup with a raised cab
  const body = new Path2D();
  body.moveTo(-34 * u, 0); body.lineTo(-34 * u, -10 * u); body.lineTo(-8 * u, -10 * u); body.lineTo(-4 * u, -24 * u);
  body.lineTo(14 * u, -24 * u); body.lineTo(20 * u, -12 * u); body.lineTo(33 * u, -10 * u); body.quadraticCurveTo(37 * u, -8 * u, 36 * u, 0);
  body.closePath();
  const bg = c.createLinearGradient(0, -24 * u, 0, 0);
  bg.addColorStop(0, '#ff9a4a'); bg.addColorStop(0.55, '#f0761a'); bg.addColorStop(1, '#9a3e08');
  c.fillStyle = bg; c.fill(body);
  c.strokeStyle = INK; c.lineWidth = 2.6 * u; c.stroke(body);
  // windows, a flame stripe, the roll bar lights
  c.fillStyle = '#9fd8ff';
  c.beginPath(); c.moveTo(-2 * u, -12 * u); c.lineTo(1 * u, -21.5 * u); c.lineTo(12 * u, -21.5 * u); c.lineTo(16.5 * u, -12 * u); c.closePath(); c.fill();
  c.lineWidth = 1.6 * u; c.stroke();
  c.fillStyle = '#ffc21a';
  c.beginPath(); c.moveTo(-32 * u, -5 * u); c.lineTo(-6 * u, -5 * u); c.lineTo(0, -8 * u); c.lineTo(6 * u, -4 * u); c.lineTo(30 * u, -5 * u); c.lineTo(30 * u, -2.5 * u); c.lineTo(-32 * u, -2.5 * u); c.closePath(); c.fill();
  for (const x of [0, 5, 10]) { c.fillStyle = '#fff3a0'; c.beginPath(); c.arc(x * u, -26 * u, 1.8 * u, 0, Math.PI * 2); c.fill(); c.strokeStyle = INK; c.lineWidth = 1 * u; c.stroke(); }
  // mud on the body
  for (let i = 0; i < 5; i++) splat(c, (-30 + r() * 60) * u, (-2 + r() * 3) * u, (1.6 + r() * 2.4) * u, r);
  // the wheels
  bigWheel(c, -22 * u, 16 * u, 15 * u, u);
  bigWheel(c, 22 * u, 16 * u, 15 * u, u);
  c.restore();
}

export const MUD_THEME: MenuTheme = {
  font: BLACK_OPS_ONE,
  fontScale: 0.92,
  palette: {
    primary: ORANGE, secondary: STEEL, board: DARK, trim: HAZARD,
    label: '#ffffff', labelStroke: INK, muted: '#a9b0b8', accent: '#ffc21a',
    heading: '#b24a10', body: '#1d1f24', icon: 0xffffff, shade: 0x120c06,
  },
  logo: {
    fill: ['#fff4c8', '#ffc21a', '#e0700e'],
    outline: INK,
    outlineWidth: 0.12,
    rim: '#f2f2f2',
    depth: '#4a2408',
    size: 120,
    lineHeight: 0.9,
    emblem: { draw: truckEmblem, size: 200, overlap: 0.42 },
  },
  skin: steelPainter,
  // the steering switch (touch screens) and the garage's upgrade boards in the same skin
  pieces: [...STEERING_PIECES, ...GARAGE_PIECES],
  frame: { border: TREAD_BORDER, notes: plateCard, vignette: 0.55, dim: 0 },
  overlays: { lose: '#b8320e', titles: ['champOver'] },
  // the race results and the garage (panels.ts)
  cards: [RESULTS_CARD, SHOP_CARD],
  prebake: (scene) => prebakeGarage(scene),
};
