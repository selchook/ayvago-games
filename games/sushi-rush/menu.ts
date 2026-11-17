// Sushi Rush's menu theme (src/core/menu-theme.ts): a warm Japanese restaurant. PLAY and the main
// buttons are red lacquer with a black rim and a gold inlay; the other buttons light hinoki wood;
// boards dark walnut with a gold line and sakura in the corners; the round knobs red lacquer
// medallions. A bamboo frame runs round the screen, lashed with red cord at the corners where a
// sakura sprig grows; the how-to, pause and result cards are washi paper with a red seal; behind
// the logo a lacquered plate with a salmon nigiri and crossed chopsticks under sakura. Display
// face: Grandstander (SIL OFL, latin + latin-ext: Turkish). The menu itself is the core's: PLAY,
// the Easy / Normal switch, a row with RECIPES and CARDS, the how-to. The chef is picked after PLAY.
import { type MenuTheme, type SkinPainter, type BorderStyle } from '@core';
import { GRANDSTANDER } from '@core/fonts/grandstander';
import { prebakeScreens, SCREEN_CARDS, MENU_ROW_PIECES } from './screens';

export const INK = '#3a1a0e';
export const RED = 0xc2282e;
export const WOOD = 0xd9a066;
export const WALNUT = 0x5a3420;
export const GOLD = 0xf2c14e;
export const GREEN = 0x3f8a46;
export const INDIGO = 0x2f4a8a;

const css = (c: number, a = 1): string => `rgba(${(c >> 16) & 255},${(c >> 8) & 255},${c & 255},${a})`;
const shade = (c: number, k: number): number => {
  const f = (v: number) => Math.round(k > 0 ? v + (255 - v) * k : v * (1 + k));
  return (f((c >> 16) & 255) << 16) | (f((c >> 8) & 255) << 8) | f(c & 255);
};
function rng(seed: number): () => number {
  let s = (seed >>> 0) % 2147483647 || 1;
  return () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
}
/** Saturated faces are lacquer; pale browns are wood. */
const isLacquer = (c: number): boolean => {
  const r = (c >> 16) & 255, g = (c >> 8) & 255, b = c & 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
  return c !== WOOD && c !== WALNUT && (mx - mn) / Math.max(1, mx) > 0.45;
};

function rounded(w: number, h: number, r: number): Path2D {
  const p = new Path2D();
  p.roundRect(0, 0, w, h, Math.min(r, h / 2, w / 2));
  return p;
}

/** A five-petal sakura blossom. */
export function blossom(c: CanvasRenderingContext2D, x: number, y: number, r: number, rot = 0, a = 1): void {
  c.save();
  c.translate(x, y);
  c.rotate(rot);
  c.globalAlpha *= a;
  for (let i = 0; i < 5; i++) {
    c.save();
    c.rotate((i / 5) * Math.PI * 2);
    const g = c.createLinearGradient(0, 0, 0, -r);
    g.addColorStop(0, '#ff8fb4'); g.addColorStop(1, '#ffe4ee');
    c.fillStyle = g;
    c.beginPath();
    c.moveTo(0, 0);
    c.bezierCurveTo(-r * 0.62, -r * 0.35, -r * 0.5, -r * 1.02, -r * 0.12, -r);
    c.lineTo(0, -r * 0.86);
    c.lineTo(r * 0.12, -r);
    c.bezierCurveTo(r * 0.5, -r * 1.02, r * 0.62, -r * 0.35, 0, 0);
    c.fill();
    c.strokeStyle = 'rgba(200,70,110,0.45)'; c.lineWidth = Math.max(0.6, r * 0.05); c.stroke();
    c.restore();
  }
  c.fillStyle = '#ffd24a';
  c.beginPath(); c.arc(0, 0, r * 0.18, 0, Math.PI * 2); c.fill();
  c.restore();
}

/** Wood grain: long wavy lines and a few knots. */
function grain(c: CanvasRenderingContext2D, w: number, h: number, r: () => number, dark: number): void {
  c.strokeStyle = css(dark, 0.22);
  c.lineWidth = 1;
  for (let y = 3; y < h; y += 4 + r() * 5) {
    c.beginPath();
    c.moveTo(0, y);
    for (let x = 0; x <= w; x += 20) c.lineTo(x, y + Math.sin(x * 0.03 + y) * 1.4);
    c.stroke();
  }
  for (let i = 0; i < Math.max(1, w / 220); i++) {
    const x = r() * w, y = r() * h;
    c.strokeStyle = css(dark, 0.3);
    c.beginPath(); c.ellipse(x, y, 7, 3, 0, 0, Math.PI * 2); c.stroke();
  }
}

// ------------------------------------------------------------------ the skin

export const sushiPainter: SkinPainter = (c, kind, w, h, o) => {
  const r = rng(o.seed);
  const sunk = o.state === 'down' || kind === 'track';
  const off = o.state === 'off';
  const base = off ? shade(o.color, -0.35) : o.color;
  const lacquer = isLacquer(o.color) && kind !== 'board' && kind !== 'track';
  c.save();
  c.translate(0, o.state === 'down' ? 3 : 0);
  if (kind === 'round') {
    const R = Math.min(w, h) / 2;
    const cx = w / 2, cy = h / 2;
    c.save(); c.shadowColor = 'rgba(0,0,0,0.5)'; c.shadowBlur = sunk ? 3 : 9; c.shadowOffsetY = sunk ? 1 : 5;
    c.fillStyle = '#1a0a06'; c.beginPath(); c.arc(cx, cy, R, 0, Math.PI * 2); c.fill(); c.restore();
    const g = c.createRadialGradient(cx - R * 0.35, cy - R * 0.4, R * 0.1, cx, cy, R);
    g.addColorStop(0, css(shade(base, 0.35))); g.addColorStop(0.6, css(base)); g.addColorStop(1, css(shade(base, -0.45)));
    c.fillStyle = g; c.beginPath(); c.arc(cx, cy, R - 2.5, 0, Math.PI * 2); c.fill();
    c.strokeStyle = css(GOLD, 0.9); c.lineWidth = 2; c.beginPath(); c.arc(cx, cy, R - 6, 0, Math.PI * 2); c.stroke();
    if (o.state === 'over' || o.state === 'on') { c.strokeStyle = '#fff1b8'; c.lineWidth = 3; c.shadowColor = css(GOLD); c.shadowBlur = 10; c.beginPath(); c.arc(cx, cy, R - 1, 0, Math.PI * 2); c.stroke(); }
    c.restore();
    return;
  }
  const rad = kind === 'board' ? 18 : kind === 'track' ? h / 2 : Math.min(18, h * 0.3);
  const shape = rounded(w, h, rad);
  // glow under a hovered / selected piece
  if (o.state === 'over' || o.state === 'on') {
    c.save(); c.shadowColor = css(GOLD, o.state === 'over' ? 1 : 0.8); c.shadowBlur = o.state === 'over' ? 18 : 12;
    c.fillStyle = css(GOLD); c.fill(shape); c.restore();
  }
  // drop shadow
  c.save(); c.shadowColor = 'rgba(20,6,0,0.55)'; c.shadowBlur = sunk ? 3 : 10; c.shadowOffsetY = sunk ? 1 : 6;
  c.fillStyle = '#1a0a06'; c.fill(shape); c.restore();
  c.save();
  c.clip(shape);
  if (kind === 'track') {
    c.fillStyle = css(shade(base, -0.35)); c.fillRect(0, 0, w, h);
    const ins = c.createLinearGradient(0, 0, 0, h);
    ins.addColorStop(0, 'rgba(0,0,0,0.45)'); ins.addColorStop(0.4, 'rgba(0,0,0,0)');
    c.fillStyle = ins; c.fillRect(0, 0, w, h);
  } else if (lacquer) {
    // red (or other) lacquer: deep gradient, a gloss band, a soft reflection
    const g = c.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, css(shade(base, sunk ? -0.05 : 0.22)));
    g.addColorStop(0.55, css(base));
    g.addColorStop(1, css(shade(base, -0.42)));
    c.fillStyle = g; c.fillRect(0, 0, w, h);
    const gl = c.createLinearGradient(0, 0, 0, h * 0.5);
    gl.addColorStop(0, 'rgba(255,255,255,0.38)'); gl.addColorStop(1, 'rgba(255,255,255,0)');
    c.fillStyle = gl;
    c.beginPath(); c.roundRect(6, 4, w - 12, h * 0.42, Math.max(2, rad - 5)); c.fill();
  } else {
    // wood: hinoki planks (light) or walnut (boards)
    const g = c.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, css(shade(base, 0.16)));
    g.addColorStop(1, css(shade(base, -0.22)));
    c.fillStyle = g; c.fillRect(0, 0, w, h);
    grain(c, w, h, r, shade(base, -0.55));
    if (kind === 'board') {
      // plank seams
      c.strokeStyle = 'rgba(0,0,0,0.28)'; c.lineWidth = 2;
      for (let y = 46; y < h - 20; y += 46 + Math.floor(r() * 10)) { c.beginPath(); c.moveTo(0, y); c.lineTo(w, y); c.stroke(); }
    }
  }
  // bevel
  c.fillStyle = sunk ? 'rgba(0,0,0,0.3)' : 'rgba(255,248,230,0.28)'; c.fillRect(0, 0, w, 3);
  c.fillStyle = sunk ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.32)'; c.fillRect(0, h - 4, w, 4);
  c.restore();
  // rim and inlay
  c.lineWidth = kind === 'board' ? 4 : 3;
  c.strokeStyle = lacquer ? '#1a0806' : css(shade(base, -0.62));
  c.stroke(shape);
  if (kind !== 'track') {
    const ins = kind === 'board' ? 9 : kind === 'plate' ? 4 : 5;
    c.save();
    c.lineWidth = kind === 'board' ? 2.5 : lacquer ? 2 : 1.4;
    c.strokeStyle = lacquer || kind === 'board' ? css(GOLD, off ? 0.4 : 0.95) : css(shade(base, -0.45), 0.6);
    c.beginPath(); c.roundRect(ins, ins, w - ins * 2, h - ins * 2, Math.max(2, rad - ins)); c.stroke();
    c.restore();
  }
  if (kind === 'board') {
    // sakura in two corners
    blossom(c, 20, 20, 13, 0.3);
    blossom(c, 38, 14, 8, 1.2, 0.9);
    blossom(c, w - 20, h - 20, 13, 0.8);
    blossom(c, w - 38, h - 14, 8, 2.1, 0.9);
  } else if (kind === 'button' && lacquer && w >= 200) {
    // gold studs at the ends
    for (const x of [14, w - 14]) {
      const g = c.createRadialGradient(x - 1, h / 2 - 1, 0.5, x, h / 2, 4.5);
      g.addColorStop(0, '#fff6c8'); g.addColorStop(1, '#a8721a');
      c.fillStyle = g; c.beginPath(); c.arc(x, h / 2, 4, 0, Math.PI * 2); c.fill();
    }
  } else if (kind === 'button' && !lacquer && w >= 160) {
    // dark wooden end caps
    c.fillStyle = 'rgba(60,30,14,0.35)';
    c.fillRect(8, 6, 6, h - 12); c.fillRect(w - 14, 6, 6, h - 12);
  }
  if (o.state === 'over' || o.state === 'on') {
    c.save(); c.shadowColor = css(GOLD); c.shadowBlur = 8;
    c.lineWidth = o.state === 'over' ? 3.5 : 3; c.strokeStyle = '#ffe9a0'; c.stroke(shape); c.restore();
  }
  if (o.state === 'down') { c.fillStyle = 'rgba(0,0,0,0.14)'; c.fill(shape); }
  c.restore();
};

// ------------------------------------------------------------------ the bamboo frame

/** One bamboo pole along the edge: green-gold segments with nodes. */
const bambooEdge: BorderStyle['edge'] = (c, len, thick) => {
  const d = thick * 0.62, y0 = (thick - d) / 2 - 2;
  const g = c.createLinearGradient(0, y0, 0, y0 + d);
  g.addColorStop(0, '#d8d070'); g.addColorStop(0.35, '#a8b048'); g.addColorStop(0.7, '#7a8a2c'); g.addColorStop(1, '#4a5a1a');
  c.fillStyle = 'rgba(0,0,0,0.35)';
  c.fillRect(0, y0 + 4, len, d);
  c.fillStyle = g;
  c.fillRect(0, y0, len, d);
  c.fillStyle = 'rgba(255,255,220,0.35)'; c.fillRect(0, y0 + d * 0.18, len, 2);
  // nodes
  const seg = 96;
  for (let x = (len % seg) / 2; x < len; x += seg) {
    c.fillStyle = '#5a6a1e'; c.fillRect(x - 3, y0 - 1, 6, d + 2);
    c.fillStyle = 'rgba(255,255,210,0.45)'; c.fillRect(x - 3, y0 - 1, 2, d + 2);
    c.fillStyle = 'rgba(0,0,0,0.25)'; c.fillRect(x + 3, y0, 3, d);
  }
};

/** The corner: two poles lashed with red cord, a sprig of sakura. */
function bambooCorner(c: CanvasRenderingContext2D, s: number): void {
  const cx = s * 0.3, cy = s * 0.3;
  c.save();
  c.shadowColor = 'rgba(0,0,0,0.45)'; c.shadowBlur = 6; c.shadowOffsetY = 3;
  // the lashing: a red cord wound diagonally
  c.strokeStyle = '#8a1418'; c.lineWidth = 6; c.lineCap = 'round';
  for (let i = -2; i <= 2; i++) { c.beginPath(); c.moveTo(cx - 14 + i * 5, cy - 14 - i * 5 + 10); c.lineTo(cx + 14 + i * 5 - 10, cy + 14 - i * 5); c.stroke(); }
  c.strokeStyle = '#e04048'; c.lineWidth = 3;
  for (let i = -2; i <= 2; i++) { c.beginPath(); c.moveTo(cx - 14 + i * 5, cy - 14 - i * 5 + 10); c.lineTo(cx + 14 + i * 5 - 10, cy + 14 - i * 5); c.stroke(); }
  // a tassel
  c.strokeStyle = '#c0262c'; c.lineWidth = 2;
  for (let k = -2; k <= 2; k++) { c.beginPath(); c.moveTo(cx + 10, cy + 10); c.quadraticCurveTo(cx + 18 + k, cy + 24, cx + 16 + k * 2, cy + 36); c.stroke(); }
  c.fillStyle = '#f2c14e'; c.beginPath(); c.arc(cx + 10, cy + 10, 4, 0, Math.PI * 2); c.fill();
  c.restore();
  // the sprig: a twig with blossoms
  c.strokeStyle = '#5a3420'; c.lineWidth = 3; c.lineCap = 'round';
  c.beginPath(); c.moveTo(cx + 6, cy + 2); c.quadraticCurveTo(cx + 40, cy + 2, s * 0.92, cy + 18); c.stroke();
  c.beginPath(); c.moveTo(cx + 2, cy + 6); c.quadraticCurveTo(cx + 2, cy + 40, cy + 18, s * 0.92); c.stroke();
  blossom(c, s * 0.62, cy + 8, 9, 0.4);
  blossom(c, s * 0.86, cy + 16, 7, 1.3);
  blossom(c, cx + 9, s * 0.62, 9, 2.0);
  blossom(c, cx + 16, s * 0.86, 7, 0.8);
  blossom(c, cx + 2, cy + 2, 11, 0.1);
}

export const BAMBOO_BORDER: BorderStyle = { thick: 26, inset: 2, edge: bambooEdge, corner: { size: 92, draw: bambooCorner, inset: 0 } };

// ------------------------------------------------------------------ washi paper

/** Washi: warm off-white paper with long fibres, a soft deckle edge and a red seal in the corner. */
export function paintWashi(c: CanvasRenderingContext2D, w: number, h: number): void {
  const r = rng(w * 31 + h * 7);
  c.save();
  c.shadowColor = 'rgba(30,10,0,0.45)'; c.shadowBlur = 12; c.shadowOffsetY = 6;
  c.fillStyle = '#f6ecd8';
  c.beginPath(); c.roundRect(0, 0, w, h, 10); c.fill();
  c.restore();
  c.save();
  c.beginPath(); c.roundRect(0, 0, w, h, 10); c.clip();
  const g = c.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.2, w / 2, h / 2, Math.max(w, h) * 0.7);
  g.addColorStop(0, '#fbf4e4'); g.addColorStop(1, '#ead8b6');
  c.fillStyle = g; c.fillRect(0, 0, w, h);
  // fibres
  for (let i = 0; i < (w * h) / 900; i++) {
    const x = r() * w, y = r() * h, a = r() * Math.PI, l = 6 + r() * 18;
    c.strokeStyle = `rgba(150,110,60,${0.06 + r() * 0.08})`; c.lineWidth = 0.8;
    c.beginPath(); c.moveTo(x, y); c.quadraticCurveTo(x + Math.cos(a) * l * 0.5 + r() * 4, y + Math.sin(a) * l * 0.5, x + Math.cos(a) * l, y + Math.sin(a) * l); c.stroke();
  }
  c.restore();
  // a red border line and (on the big cards) the seal
  c.strokeStyle = 'rgba(176,34,42,0.55)'; c.lineWidth = 2;
  c.beginPath(); c.roundRect(8, 8, w - 16, h - 16, 6); c.stroke();
  if (w < 420 || h < 260) return;
  const sx = w - 30, sy = h - 30;
  c.save(); c.translate(sx, sy); c.rotate(-0.08);
  c.fillStyle = 'rgba(190,30,36,0.78)';
  c.beginPath(); c.roundRect(-14, -14, 28, 28, 4); c.fill();
  c.strokeStyle = 'rgba(255,230,220,0.85)'; c.lineWidth = 2;
  // a little fish in the seal
  c.beginPath(); c.ellipse(-1, 0, 7, 4, 0, 0, Math.PI * 2); c.stroke();
  c.beginPath(); c.moveTo(6, 0); c.lineTo(11, -4); c.lineTo(11, 4); c.closePath(); c.stroke();
  c.restore();
}

// ------------------------------------------------------------------ the emblem

/** A lacquered round plate with a salmon nigiri, crossed chopsticks, sakura round it. */
export function sushiEmblem(c: CanvasRenderingContext2D, size: number): void {
  const u = size / 100;
  c.save();
  c.translate(size / 2, size / 2);
  const halo = c.createRadialGradient(0, 0, 10 * u, 0, 0, 50 * u);
  halo.addColorStop(0, 'rgba(255,200,140,0.45)'); halo.addColorStop(1, 'rgba(255,200,140,0)');
  c.fillStyle = halo; c.fillRect(-50 * u, -50 * u, 100 * u, 100 * u);
  // the plate
  c.save(); c.shadowColor = 'rgba(0,0,0,0.5)'; c.shadowBlur = 6 * u; c.shadowOffsetY = 3 * u;
  c.fillStyle = '#1a0806'; c.beginPath(); c.ellipse(0, 6 * u, 40 * u, 30 * u, 0, 0, Math.PI * 2); c.fill(); c.restore();
  const pg = c.createRadialGradient(-10 * u, -4 * u, 4 * u, 0, 6 * u, 40 * u);
  pg.addColorStop(0, '#f05a50'); pg.addColorStop(0.6, '#c2282e'); pg.addColorStop(1, '#6a0e10');
  c.fillStyle = pg; c.beginPath(); c.ellipse(0, 5 * u, 37 * u, 27 * u, 0, 0, Math.PI * 2); c.fill();
  c.strokeStyle = '#f2c14e'; c.lineWidth = 1.6 * u; c.beginPath(); c.ellipse(0, 5 * u, 31 * u, 22 * u, 0, 0, Math.PI * 2); c.stroke();
  // the rice
  c.fillStyle = '#fffaf0'; c.strokeStyle = INK; c.lineWidth = 1.6 * u;
  c.beginPath(); c.ellipse(0, 6 * u, 20 * u, 9 * u, 0, 0, Math.PI * 2); c.fill(); c.stroke();
  c.fillStyle = 'rgba(200,190,170,0.6)';
  for (let i = 0; i < 9; i++) { c.beginPath(); c.ellipse((-14 + i * 3.5) * u, (8 + (i % 2) * 2) * u, 1.4 * u, 0.8 * u, 0.4, 0, Math.PI * 2); c.fill(); }
  // the salmon on top, striped
  const s = new Path2D();
  s.moveTo(-23 * u, 2 * u); s.quadraticCurveTo(-20 * u, -10 * u, 0, -9 * u); s.quadraticCurveTo(20 * u, -10 * u, 24 * u, 1 * u);
  s.quadraticCurveTo(10 * u, 6 * u, 0, 4 * u); s.quadraticCurveTo(-12 * u, 6 * u, -23 * u, 2 * u); s.closePath();
  const sg = c.createLinearGradient(0, -10 * u, 0, 5 * u);
  sg.addColorStop(0, '#ffb070'); sg.addColorStop(1, '#f06a2a');
  c.fillStyle = sg; c.fill(s); c.lineWidth = 1.6 * u; c.strokeStyle = INK; c.stroke(s);
  c.save(); c.clip(s);
  c.strokeStyle = 'rgba(255,240,225,0.9)'; c.lineWidth = 1.6 * u;
  for (let i = -3; i <= 3; i++) { c.beginPath(); c.moveTo(i * 6 * u - 4 * u, -10 * u); c.quadraticCurveTo(i * 6 * u + 1 * u, -2 * u, i * 6 * u - 2 * u, 6 * u); c.stroke(); }
  c.restore();
  // chopsticks crossing behind, top right
  for (const [a, col] of [[-0.55, '#8a4a20'], [-0.35, '#a85a28']] as [number, string][]) {
    c.save(); c.rotate(a);
    c.fillStyle = col; c.strokeStyle = INK; c.lineWidth = 1.2 * u;
    c.beginPath(); c.moveTo(-6 * u, -48 * u); c.lineTo(-2 * u, -48 * u); c.lineTo(1 * u, -14 * u); c.lineTo(-3 * u, -14 * u); c.closePath(); c.fill(); c.stroke();
    c.fillStyle = '#c2282e'; c.fillRect(-6 * u, -48 * u, 4 * u, 6 * u);
    c.restore();
  }
  // sakura round it
  blossom(c, -34 * u, -20 * u, 9 * u, 0.3);
  blossom(c, 36 * u, 24 * u, 8 * u, 1.1);
  blossom(c, -26 * u, 30 * u, 6 * u, 2.2);
  blossom(c, 30 * u, -30 * u, 6 * u, 0.7, 0.9);
  c.restore();
}

// ------------------------------------------------------------------ the theme

export const SUSHI_THEME: MenuTheme = {
  font: GRANDSTANDER,
  palette: {
    primary: RED, secondary: WOOD, board: WALNUT, trim: GOLD,
    label: '#fff8ec', labelStroke: INK, muted: '#e8cfa8', accent: '#ffd86a',
    heading: '#b0222a', body: '#3a2414', icon: 0x3a1a0e, shade: 0x1a0c06,
  },
  logo: {
    fill: ['#fffdf6', '#ffe9b8', '#ffb84a', '#e8742a'],
    outline: '#4a1208',
    rim: '#c2282e',
    depth: '#2a0806',
    size: 150,
    emblem: { draw: sushiEmblem, size: 230, overlap: 0.3 },
  },
  skin: sushiPainter,
  pieces: MENU_ROW_PIECES,
  frame: { border: BAMBOO_BORDER, notes: paintWashi, vignette: 0.55, dim: 0.22 },
  overlays: { lose: '#b0222a', win: '#2f6a2a', adColor: GREEN, titles: ['outHearts', 'missedGoal'] },
  cards: SCREEN_CARDS,
  prebake: (scene) => prebakeScreens(scene),
};
