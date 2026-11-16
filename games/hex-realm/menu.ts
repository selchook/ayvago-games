// Hex Realm's menu theme (src/core/menu-theme.ts): carved stone and gilded heraldry. Buttons are
// stone tablets with a gold inlay (PLAY a royal-blue enamel banner in a gold frame), plates small
// stone tiles, the boards dark slate with a double gilt frame and knotwork corners, the round knobs
// gold medallions. A castle's crenellated wall runs round the screen with a round tower in each
// corner; the how-to and the pause / result cards are an illuminated manuscript page; behind the
// logo a crowned heraldic shield with a crossed sword and staff stands over a hexagon. Display face:
// MedievalSharp (SIL OFL, latin + latin-ext: Turkish). Also the menu's own row: the hero board (the
// class and level, arrows to change class) and the NEW CAMPAIGN button.
import Phaser from 'phaser';
import { t, txt, playSfx, SkinButton, skinImage, themeText, isEasy, type MenuTheme, type SkinPainter, type BorderStyle } from '@core';
import { MEDIEVALSHARP } from '@core/fonts/medievalsharp';
import { CLASS_IDS, CLASS, type ClassId } from './defs';
import { Campaign } from './campaign';
import { prebakeScreens, SCREEN_CARDS } from './screens';
import { SUMMARY_W, SUMMARY_H } from './sizes';

export const INK = '#1a1420';
export const GOLD = 0xe0b24a;
export const BLUE = 0x2c4a9a;
export const STONE = 0x6c6a74;
export const SLATE = 0x2a2830;
export const CRIMSON = 0x8a1c2a;
export const MOSS = 0x2e6a3a;

const css = (c: number, a = 1): string => `rgba(${(c >> 16) & 255},${(c >> 8) & 255},${c & 255},${a})`;
const shade = (c: number, k: number): number => {
  const f = (v: number) => Math.round(k > 0 ? v + (255 - v) * k : v * (1 + k));
  return (f((c >> 16) & 255) << 16) | (f((c >> 8) & 255) << 8) | f(c & 255);
};
function rng(seed: number): () => number {
  let s = (seed >>> 0) % 2147483647 || 1;
  return () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
}

// ------------------------------------------------------------------ the stone skin

/** A tablet: a rectangle with chamfered corners (a heater-shield point on wide primary buttons). */
function tablet(w: number, h: number, kind: string, banner: boolean): Path2D {
  const p = new Path2D();
  if (kind === 'round') { p.arc(w / 2, h / 2, Math.min(w, h) / 2, 0, Math.PI * 2); return p; }
  const k = Math.min(12, h * 0.2);
  p.moveTo(k, 0); p.lineTo(w - k, 0); p.lineTo(w, k);
  if (banner) {
    // a banner: the bottom edge dips to a shallow point in the middle
    p.lineTo(w, h - k); p.lineTo(w - k, h - 2); p.quadraticCurveTo(w * 0.75, h - 2, w / 2, h + 6); p.quadraticCurveTo(w * 0.25, h - 2, k, h - 2); p.lineTo(0, h - k);
  } else { p.lineTo(w, h - k); p.lineTo(w - k, h); p.lineTo(k, h); p.lineTo(0, h - k); }
  p.lineTo(0, k);
  p.closePath();
  return p;
}

/** Stone grain: speckles, faint veins and a few chips. */
function grainStone(c: CanvasRenderingContext2D, w: number, h: number, r: () => number, dark: boolean): void {
  for (let i = 0; i < (w * h) / 26; i++) {
    c.fillStyle = r() < 0.5 ? `rgba(255,255,255,${0.03 + r() * 0.05})` : `rgba(0,0,0,${0.05 + r() * 0.08})`;
    c.fillRect(r() * w, r() * h, 1 + r() * 2, 1 + r() * 2);
  }
  c.strokeStyle = dark ? 'rgba(0,0,0,0.25)' : 'rgba(0,0,0,0.16)';
  c.lineWidth = 1;
  for (let i = 0; i < 2 + w / 120; i++) {
    let x = r() * w, y = r() * h;
    c.beginPath(); c.moveTo(x, y);
    for (let k = 0; k < 4; k++) { x += (r() - 0.4) * 30; y += (r() - 0.5) * 14; c.lineTo(x, y); }
    c.stroke();
  }
}

/** A gold stud. */
function stud(c: CanvasRenderingContext2D, x: number, y: number, rad: number): void {
  c.fillStyle = 'rgba(0,0,0,0.5)';
  c.beginPath(); c.arc(x + rad * 0.25, y + rad * 0.35, rad * 1.1, 0, Math.PI * 2); c.fill();
  const g = c.createRadialGradient(x - rad * 0.35, y - rad * 0.4, rad * 0.1, x, y, rad);
  g.addColorStop(0, '#fff6c8'); g.addColorStop(0.5, css(GOLD)); g.addColorStop(1, '#6a4a10');
  c.fillStyle = g;
  c.beginPath(); c.arc(x, y, rad, 0, Math.PI * 2); c.fill();
}

/** A small knotwork square (a board's corner): two interlaced loops. */
function knot(c: CanvasRenderingContext2D, x: number, y: number, s: number): void {
  c.save();
  c.translate(x, y);
  c.lineCap = 'round';
  for (const [lw, col] of [[s * 0.22, '#3a2a10'], [s * 0.13, css(GOLD)]] as [number, string][]) {
    c.lineWidth = lw; c.strokeStyle = col;
    c.beginPath(); c.ellipse(0, 0, s * 0.5, s * 0.22, Math.PI / 4, 0, Math.PI * 2); c.stroke();
    c.beginPath(); c.ellipse(0, 0, s * 0.5, s * 0.22, -Math.PI / 4, 0, Math.PI * 2); c.stroke();
    c.beginPath(); c.arc(0, 0, s * 0.18, 0, Math.PI * 2); c.stroke();
  }
  c.restore();
}

export const stonePainter: SkinPainter = (c, kind, w, h, o) => {
  const P = o.palette, r = rng(o.seed);
  const sunk = o.state === 'down' || o.state === 'off' || kind === 'track';
  const enamel = kind === 'button' && (o.color === P.primary || o.color === CRIMSON || o.color === MOSS || o.color === BLUE);
  const color = o.state === 'off' ? shade(o.color, -0.45) : o.color;
  const banner = enamel && kind === 'button' && w >= 300 && h >= 90 && o.color === P.primary;
  const shape = tablet(w, h, kind, banner);
  c.save();
  c.translate(0, o.state === 'down' ? 3 : 0);
  // a glow under a hovered or selected piece
  if (o.state === 'over' || o.state === 'on') {
    c.save();
    c.shadowColor = css(GOLD, o.state === 'over' ? 0.95 : 0.75);
    c.shadowBlur = o.state === 'over' ? 18 : 11;
    c.fillStyle = css(GOLD, 0.9);
    c.fill(shape);
    c.restore();
  }
  c.save();
  c.shadowColor = 'rgba(0,0,0,0.6)';
  c.shadowBlur = sunk ? 3 : 11;
  c.shadowOffsetY = sunk ? 1 : 6;
  c.fillStyle = '#000';
  c.fill(shape);
  c.restore();
  if (kind === 'round') {
    // a gold medallion with a stone heart
    const g = c.createRadialGradient(w * 0.38, h * 0.32, 2, w / 2, h / 2, w / 2);
    g.addColorStop(0, '#fff2b0'); g.addColorStop(0.55, css(GOLD)); g.addColorStop(1, '#6a4a10');
    c.fillStyle = g; c.fill(shape);
    c.fillStyle = css(shade(STONE, -0.2));
    c.beginPath(); c.arc(w / 2, h / 2, w * 0.32, 0, Math.PI * 2); c.fill();
    c.strokeStyle = '#3a2a10'; c.lineWidth = 2; c.stroke(shape);
    c.beginPath(); c.arc(w / 2, h / 2, w * 0.32, 0, Math.PI * 2); c.stroke();
    if (o.state === 'down') { c.fillStyle = 'rgba(0,0,0,0.2)'; c.fill(shape); }
    c.restore();
    return;
  }
  // the face
  const body = c.createLinearGradient(0, 0, 0, h);
  body.addColorStop(0, css(shade(color, sunk ? -0.12 : 0.18)));
  body.addColorStop(0.5, css(color));
  body.addColorStop(1, css(shade(color, -0.32)));
  c.fillStyle = body;
  c.fill(shape);
  c.save();
  c.clip(shape);
  if (enamel) {
    // enamel: a soft sheen and a fine diaper pattern of small diamonds
    c.strokeStyle = 'rgba(255,255,255,0.07)'; c.lineWidth = 1;
    for (let x = -h; x < w + h; x += 14) { c.beginPath(); c.moveTo(x, 0); c.lineTo(x + h, h); c.stroke(); c.beginPath(); c.moveTo(x + h, 0); c.lineTo(x, h); c.stroke(); }
    const sheen = c.createLinearGradient(0, 0, 0, h * 0.5);
    sheen.addColorStop(0, 'rgba(255,255,255,0.28)'); sheen.addColorStop(1, 'rgba(255,255,255,0)');
    c.fillStyle = sheen; c.fillRect(0, 0, w, h * 0.5);
  } else grainStone(c, w, h, r, kind === 'board' || kind === 'track');
  // bevel: light top and left, dark bottom and right (sunk: the other way)
  const lt = sunk ? 'rgba(0,0,0,0.45)' : 'rgba(255,248,230,0.32)', dk = sunk ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.42)';
  c.fillStyle = lt; c.fillRect(0, 0, w, 3); c.fillRect(0, 0, 3, h);
  c.fillStyle = dk; c.fillRect(0, h - 5, w, 5); c.fillRect(w - 4, 0, 4, h);
  c.restore();
  // the outline
  c.lineWidth = 2.5;
  c.strokeStyle = css(shade(color, -0.78));
  c.stroke(shape);
  // gilding: an inlaid gold line inside the edge
  const ins = kind === 'plate' ? 4 : kind === 'board' ? 8 : 6;
  if (kind !== 'track') {
    c.save();
    c.translate(ins, ins);
    c.scale((w - ins * 2) / w, (h - ins * 2) / h);
    c.lineWidth = (kind === 'board' ? 2.4 : enamel ? 3 : 1.6) * (w / (w - ins * 2));
    c.strokeStyle = css(enamel ? GOLD : shade(GOLD, -0.1), enamel ? 1 : o.state === 'off' ? 0.35 : 0.75);
    c.stroke(tablet(w, h, kind, banner));
    c.restore();
  }
  if (kind === 'board') {
    // a second gilt line and knots in the corners
    c.strokeStyle = css(GOLD, 0.35); c.lineWidth = 1;
    c.strokeRect(14, 14, w - 28, h - 28);
    const ks = Math.min(26, h * 0.3);
    for (const [x, y] of [[ks * 0.7, ks * 0.7], [w - ks * 0.7, ks * 0.7], [ks * 0.7, h - ks * 0.7], [w - ks * 0.7, h - ks * 0.7]]) knot(c, x, y, ks);
  } else if (kind === 'button' && enamel) {
    // gold studs on the frame
    const m = Math.min(13, h * 0.2);
    for (const [x, y] of [[m, m], [w - m, m], [m, h - m - (banner ? 2 : 0)], [w - m, h - m - (banner ? 2 : 0)]]) stud(c, x, y, Math.max(2.5, Math.min(4.5, h * 0.05)));
  } else if (kind === 'button' && w >= 160) {
    // stone tablets: two small gold studs at the ends
    for (const x of [12, w - 12]) stud(c, x, h / 2, 3);
  }
  if (o.state === 'over' || o.state === 'on') {
    c.save();
    c.shadowColor = css(GOLD, 0.9); c.shadowBlur = 8;
    c.lineWidth = o.state === 'over' ? 3.5 : 3;
    c.strokeStyle = '#ffe9a0';
    c.stroke(shape);
    c.restore();
  }
  if (o.state === 'down') { c.fillStyle = 'rgba(0,0,0,0.16)'; c.fill(shape); }
  c.restore();
};

// ------------------------------------------------------------------ the manuscript page

/** The how-to and the pause / result card: vellum with a gold-leaf frame, blue and red rules, vines in the corners. */
export function paintVellum(c: CanvasRenderingContext2D, w: number, h: number): void {
  const r = rng(w * 7 + h * 3);
  c.save();
  c.shadowColor = 'rgba(0,0,0,0.6)'; c.shadowBlur = 16; c.shadowOffsetY = 8;
  c.fillStyle = '#e8d8b0';
  c.beginPath(); c.roundRect(0, 0, w, h, 10); c.fill();
  c.restore();
  c.save();
  c.beginPath(); c.roundRect(0, 0, w, h, 10); c.clip();
  const base = c.createLinearGradient(0, 0, w * 0.4, h);
  base.addColorStop(0, '#f7ecd0'); base.addColorStop(1, '#ead6a8');
  c.fillStyle = base; c.fillRect(0, 0, w, h);
  for (let i = 0; i < (w * h) / 1100; i++) {
    const x = r() * w, y = r() * h, rad = 8 + r() * 26;
    const g = c.createRadialGradient(x, y, 0, x, y, rad);
    g.addColorStop(0, `rgba(160,110,50,${0.03 + r() * 0.05})`); g.addColorStop(1, 'rgba(160,110,50,0)');
    c.fillStyle = g; c.fillRect(x - rad, y - rad, rad * 2, rad * 2);
  }
  const rim = c.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.38, w / 2, h / 2, Math.max(w, h) * 0.66);
  rim.addColorStop(0, 'rgba(120,80,30,0)'); rim.addColorStop(1, 'rgba(110,70,20,0.28)');
  c.fillStyle = rim; c.fillRect(0, 0, w, h);
  c.restore();
  // the gold-leaf frame: a thick gold band, a blue rule and a red rule inside
  const gold = c.createLinearGradient(0, 0, w, h);
  gold.addColorStop(0, '#fff0a8'); gold.addColorStop(0.35, '#d8a83a'); gold.addColorStop(0.65, '#f4d478'); gold.addColorStop(1, '#a87a1a');
  c.lineWidth = 6; c.strokeStyle = gold;
  c.beginPath(); c.roundRect(7, 7, w - 14, h - 14, 6); c.stroke();
  c.lineWidth = 1.2; c.strokeStyle = '#5a3a10';
  c.beginPath(); c.roundRect(4, 4, w - 8, h - 8, 8); c.stroke();
  c.beginPath(); c.roundRect(10, 10, w - 20, h - 20, 4); c.stroke();
  c.lineWidth = 2; c.strokeStyle = '#2c4a9a';
  c.strokeRect(15, 15, w - 30, h - 30);
  c.lineWidth = 1; c.strokeStyle = '#8a1c24';
  c.strokeRect(19, 19, w - 38, h - 38);
  // vines with gold berries curling out of each corner (not on the small cards)
  if (w < 300 || h < 230) return;
  for (const [x, y, sx, sy] of [[0, 0, 1, 1], [w, 0, -1, 1], [0, h, 1, -1], [w, h, -1, -1]] as number[][]) {
    c.save(); c.translate(x, y); c.scale(sx, sy);
    c.strokeStyle = '#2e6a3a'; c.lineWidth = 2; c.lineCap = 'round';
    c.beginPath(); c.moveTo(16, 16); c.bezierCurveTo(40, 18, 52, 30, 46, 44); c.bezierCurveTo(42, 54, 30, 50, 34, 42); c.stroke();
    c.beginPath(); c.moveTo(16, 16); c.bezierCurveTo(18, 40, 30, 52, 44, 46); c.stroke();
    c.fillStyle = '#2e6a3a';
    for (const [lx, ly, a] of [[30, 20, 0.4], [20, 31, 1.2], [44, 30, 1.9]]) { c.save(); c.translate(lx, ly); c.rotate(a); c.beginPath(); c.ellipse(0, 0, 5, 2.4, 0, 0, Math.PI * 2); c.fill(); c.restore(); }
    c.fillStyle = gold;
    for (const [bx, by] of [[16, 16], [48, 40], [36, 50]]) { c.beginPath(); c.arc(bx, by, 3.4, 0, Math.PI * 2); c.fill(); }
    c.fillStyle = '#8a1c24';
    c.beginPath(); c.arc(16, 16, 1.6, 0, Math.PI * 2); c.fill();
    c.restore();
  }
}

// ------------------------------------------------------------------ the castle wall round the screen

/** The top strip: a stone parapet along the edge with merlons standing inward and a gilt line. */
const crenelEdge: BorderStyle['edge'] = (c, len, thick) => {
  const r = rng(len * 5 + 1);
  const wall = thick * 0.48;
  const mw = 26, gap = 18;
  // the parapet along the edge
  const g = c.createLinearGradient(0, 0, 0, wall);
  g.addColorStop(0, '#4a4852'); g.addColorStop(1, '#6e6c78');
  c.fillStyle = g; c.fillRect(0, 0, len, wall);
  // the merlons
  for (let x = -((len % (mw + gap)) / 2); x < len; x += mw + gap) {
    const mg = c.createLinearGradient(0, wall, 0, thick);
    mg.addColorStop(0, '#76747f'); mg.addColorStop(1, '#55535e');
    c.fillStyle = mg; c.fillRect(x, wall - 1, mw, thick - wall);
    c.fillStyle = 'rgba(255,248,230,0.25)'; c.fillRect(x, wall - 1, 2, thick - wall);
    c.fillStyle = 'rgba(0,0,0,0.45)'; c.fillRect(x + mw - 2, wall - 1, 2, thick - wall); c.fillRect(x, thick - 3, mw, 3);
  }
  // mortar lines and speckle
  c.strokeStyle = 'rgba(0,0,0,0.35)'; c.lineWidth = 1;
  for (let x = 0; x < len; x += 34) { const o = r() * 8; c.beginPath(); c.moveTo(x + o, 0); c.lineTo(x + o, wall); c.stroke(); }
  c.beginPath(); c.moveTo(0, wall * 0.5); c.lineTo(len, wall * 0.5); c.stroke();
  for (let i = 0; i < len / 3; i++) { c.fillStyle = r() < 0.5 ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.1)'; c.fillRect(r() * len, r() * wall, 2, 2); }
  // the gilt line on the inner face of the parapet
  c.fillStyle = css(GOLD, 0.85); c.fillRect(0, wall - 3, len, 2);
  c.fillStyle = 'rgba(0,0,0,0.5)'; c.fillRect(0, wall - 1, len, 1);
};

/** A round tower top in the corner: crenellated rim, a blue roof cone with a gold finial. */
function towerCorner(c: CanvasRenderingContext2D, s: number): void {
  const cx = s * 0.42, cy = s * 0.42, R = s * 0.36;
  c.save();
  c.shadowColor = 'rgba(0,0,0,0.55)'; c.shadowBlur = 8; c.shadowOffsetY = 3;
  c.fillStyle = '#5c5a66'; c.beginPath(); c.arc(cx, cy, R, 0, Math.PI * 2); c.fill();
  c.restore();
  // merlons round the rim
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2;
    c.save(); c.translate(cx + Math.cos(a) * R * 0.92, cy + Math.sin(a) * R * 0.92); c.rotate(a);
    c.fillStyle = '#7a7884'; c.fillRect(-4, -5, 8, 10);
    c.fillStyle = 'rgba(0,0,0,0.4)'; c.fillRect(2, -5, 2, 10);
    c.restore();
  }
  // the conical roof seen from above: a blue star of slates with a gold finial
  const roof = c.createRadialGradient(cx - R * 0.2, cy - R * 0.2, 2, cx, cy, R * 0.75);
  roof.addColorStop(0, '#5a7ad8'); roof.addColorStop(1, '#1e3470');
  c.fillStyle = roof; c.beginPath(); c.arc(cx, cy, R * 0.72, 0, Math.PI * 2); c.fill();
  c.strokeStyle = 'rgba(0,0,0,0.35)'; c.lineWidth = 1;
  for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2; c.beginPath(); c.moveTo(cx, cy); c.lineTo(cx + Math.cos(a) * R * 0.72, cy + Math.sin(a) * R * 0.72); c.stroke(); }
  c.strokeStyle = css(GOLD); c.lineWidth = 2; c.beginPath(); c.arc(cx, cy, R * 0.72, 0, Math.PI * 2); c.stroke();
  stud(c, cx, cy, 5);
}

export const CASTLE_BORDER: BorderStyle = { thick: 30, inset: 0, edge: crenelEdge, corner: { size: 96, draw: towerCorner, inset: 0 } };

// ------------------------------------------------------------------ the emblem

/** A crowned heater shield (blue and gold with a hex charge), a sword and a staff crossed behind it, all over a gilt hexagon. */
export function realmEmblem(c: CanvasRenderingContext2D, size: number): void {
  const u = size / 100;
  c.save();
  c.translate(size / 2, size / 2);
  c.lineJoin = 'round';
  // a soft gold halo
  const halo = c.createRadialGradient(0, 0, 8 * u, 0, 0, 50 * u);
  halo.addColorStop(0, 'rgba(255,215,120,0.4)'); halo.addColorStop(1, 'rgba(255,215,120,0)');
  c.fillStyle = halo; c.fillRect(-50 * u, -50 * u, 100 * u, 100 * u);
  // the hexagon
  const hex = new Path2D();
  for (let i = 0; i < 6; i++) { const a = Math.PI / 6 + (i * Math.PI) / 3; const x = Math.cos(a) * 40 * u, y = Math.sin(a) * 40 * u; i ? hex.lineTo(x, y) : hex.moveTo(x, y); }
  hex.closePath();
  const st = c.createLinearGradient(0, -40 * u, 0, 40 * u);
  st.addColorStop(0, '#76747f'); st.addColorStop(1, '#3a3842');
  c.fillStyle = st; c.fill(hex);
  c.lineWidth = 4 * u; c.strokeStyle = '#3a2a10'; c.stroke(hex);
  c.lineWidth = 2.2 * u; c.strokeStyle = css(GOLD); c.stroke(hex);
  // the sword (left to right, point up-right) and the staff (point up-left)
  const sword = () => {
    c.save(); c.rotate(-0.72);
    const bl = c.createLinearGradient(-3 * u, 0, 3 * u, 0);
    bl.addColorStop(0, '#9aa4b0'); bl.addColorStop(0.5, '#ffffff'); bl.addColorStop(1, '#6a7480');
    c.fillStyle = bl; c.strokeStyle = INK; c.lineWidth = 1.6 * u;
    c.beginPath(); c.moveTo(-3.2 * u, 22 * u); c.lineTo(-3.2 * u, -38 * u); c.lineTo(0, -46 * u); c.lineTo(3.2 * u, -38 * u); c.lineTo(3.2 * u, 22 * u); c.closePath(); c.fill(); c.stroke();
    c.fillStyle = css(GOLD);
    c.beginPath(); c.roundRect(-12 * u, 21 * u, 24 * u, 5 * u, 2 * u); c.fill(); c.stroke();
    c.fillStyle = '#5a3418'; c.beginPath(); c.roundRect(-2.6 * u, 26 * u, 5.2 * u, 13 * u, 1.5 * u); c.fill(); c.stroke();
    c.fillStyle = css(GOLD); c.beginPath(); c.arc(0, 41.5 * u, 3.6 * u, 0, Math.PI * 2); c.fill(); c.stroke();
    c.restore();
  };
  const staff = () => {
    c.save(); c.rotate(0.72);
    c.strokeStyle = INK; c.lineWidth = 7 * u; c.lineCap = 'round';
    c.beginPath(); c.moveTo(0, 44 * u); c.lineTo(0, -36 * u); c.stroke();
    c.strokeStyle = '#8a5a2a'; c.lineWidth = 4.4 * u;
    c.beginPath(); c.moveTo(0, 44 * u); c.lineTo(0, -36 * u); c.stroke();
    // the crystal in its claw
    c.lineWidth = 1.8 * u; c.strokeStyle = INK;
    c.fillStyle = css(GOLD); c.beginPath(); c.moveTo(-6 * u, -34 * u); c.lineTo(0, -40 * u); c.lineTo(6 * u, -34 * u); c.closePath(); c.fill(); c.stroke();
    c.save(); c.shadowColor = 'rgba(120,200,255,0.95)'; c.shadowBlur = 8 * u;
    const cr = c.createLinearGradient(0, -52 * u, 0, -38 * u);
    cr.addColorStop(0, '#d8f4ff'); cr.addColorStop(1, '#3a8ae0');
    c.fillStyle = cr; c.beginPath(); c.moveTo(0, -54 * u); c.lineTo(5 * u, -45 * u); c.lineTo(0, -38 * u); c.lineTo(-5 * u, -45 * u); c.closePath(); c.fill();
    c.restore();
    c.stroke();
    c.restore();
  };
  staff();
  sword();
  // the shield
  const sh = new Path2D();
  sh.moveTo(-22 * u, -20 * u); sh.lineTo(22 * u, -20 * u); sh.lineTo(22 * u, 2 * u);
  sh.bezierCurveTo(22 * u, 18 * u, 10 * u, 28 * u, 0, 34 * u);
  sh.bezierCurveTo(-10 * u, 28 * u, -22 * u, 18 * u, -22 * u, 2 * u);
  sh.closePath();
  c.save(); c.shadowColor = 'rgba(0,0,0,0.5)'; c.shadowBlur = 6 * u; c.shadowOffsetY = 3 * u;
  c.fillStyle = '#2c4a9a'; c.fill(sh); c.restore();
  c.save(); c.clip(sh);
  // per pale: blue and crimson halves, a gold chevron line
  c.fillStyle = '#8a1c2a'; c.fillRect(0, -22 * u, 24 * u, 60 * u);
  const sheen = c.createLinearGradient(0, -20 * u, 0, 34 * u);
  sheen.addColorStop(0, 'rgba(255,255,255,0.25)'); sheen.addColorStop(0.5, 'rgba(255,255,255,0)'); sheen.addColorStop(1, 'rgba(0,0,0,0.25)');
  c.fillStyle = sheen; c.fillRect(-24 * u, -22 * u, 48 * u, 60 * u);
  c.restore();
  // a gold hexagon charge
  const ch = new Path2D();
  for (let i = 0; i < 6; i++) { const a = Math.PI / 6 + (i * Math.PI) / 3; const x = Math.cos(a) * 9 * u, y = 4 * u + Math.sin(a) * 9 * u; i ? ch.lineTo(x, y) : ch.moveTo(x, y); }
  ch.closePath();
  const cg = c.createLinearGradient(0, -6 * u, 0, 14 * u);
  cg.addColorStop(0, '#fff2b0'); cg.addColorStop(1, '#c08a20');
  c.fillStyle = cg; c.fill(ch); c.lineWidth = 1.6 * u; c.strokeStyle = INK; c.stroke(ch);
  c.lineWidth = 3.4 * u; c.strokeStyle = '#3a2a10'; c.stroke(sh);
  c.lineWidth = 2 * u; c.strokeStyle = css(GOLD); c.stroke(sh);
  // the crown over it
  const cr = new Path2D();
  cr.moveTo(-17 * u, -22 * u); cr.lineTo(-19 * u, -36 * u); cr.lineTo(-9 * u, -29 * u); cr.lineTo(0, -40 * u);
  cr.lineTo(9 * u, -29 * u); cr.lineTo(19 * u, -36 * u); cr.lineTo(17 * u, -22 * u); cr.closePath();
  const cg2 = c.createLinearGradient(0, -40 * u, 0, -22 * u);
  cg2.addColorStop(0, '#fff6c8'); cg2.addColorStop(0.5, '#f0c050'); cg2.addColorStop(1, '#9a6a14');
  c.fillStyle = cg2; c.fill(cr); c.lineWidth = 1.8 * u; c.strokeStyle = INK; c.stroke(cr);
  for (const [x, y, col] of [[0, -40, '#d83a4a'], [-19, -36, '#3a8ae0'], [19, -36, '#3a8ae0'], [0, -26, '#d83a4a']] as [number, number, string][]) {
    c.fillStyle = col; c.beginPath(); c.arc(x * u, y * u, 2.4 * u, 0, Math.PI * 2); c.fill(); c.lineWidth = 1 * u; c.stroke();
  }
  c.restore();
}

// ------------------------------------------------------------------ the theme

export const REALM_THEME: MenuTheme = {
  font: MEDIEVALSHARP,
  palette: {
    primary: BLUE, secondary: STONE, board: SLATE, trim: GOLD,
    label: '#fff2cc', labelStroke: INK, muted: '#b0a8c0', accent: '#ffd25a',
    heading: '#8a1c24', body: '#2a1e14', icon: 0xfff2cc, shade: 0x0a0814,
  },
  logo: {
    fill: ['#fffbe0', '#ffe07a', '#e8a838', '#8a5a14'],
    outline: INK,
    rim: '#2c4a9a',
    depth: '#3a2a14',
    size: 150,
    emblem: { draw: realmEmblem, size: 250, overlap: 0.3 },
  },
  skin: stonePainter,
  // the hero board, its arrow medallions and the NEW CAMPAIGN tablet (menuRow)
  pieces: [{ kind: 'board', w: 420, h: 104 }, { kind: 'round', w: 56, h: 56 }, { kind: 'button', w: 196, h: 104 }, { kind: 'button', w: 196, h: 104, color: CRIMSON }],
  frame: { border: CASTLE_BORDER, notes: paintVellum, vignette: 0.5, dim: 0.16 },
  overlays: { lose: '#8a1c24', win: '#2c4a9a', adColor: MOSS, titles: ['fallenTitle', 'chapterTitle', 'restTitle', 'victoryTitle', 'riftTitle'] },
  cards: [{ w: SUMMARY_W, h: SUMMARY_H }, ...SCREEN_CARDS],
  prebake: (scene) => prebakeScreens(scene),
};

// ------------------------------------------------------------------ the menu's row

/**
 * The hero board (class, level; arrows or H change the class, which carries the campaign on) and
 * the NEW button (a fresh campaign: tap twice). `onHero` swaps the backdrop's hero.
 */
export function menuRow(scene: Phaser.Scene, x: number, y: number, onHero: (cls: ClassId) => void): { refresh: () => void } {
  const touch = scene.sys.game.device.input.touch;
  const mode = () => (isEasy() ? 'easy' : 'normal') as 'easy' | 'normal';
  let camp = Campaign.load(mode());
  const sel = scene.add.container(x - 112, y + 4);
  sel.add(skinImage(scene, 0, 0, 'board', 420, 104));
  const name = themeText(scene, 0, -20, '', { size: 38 });
  const desc = txt(scene, 0, 22, '', { size: 18, color: '#e8e0f0', strokeThickness: 0, shadow: false, wrap: 270 });
  sel.add([name, desc]);
  const arrow = (dx: number, dir: 1 | -1) => {
    const knob = skinImage(scene, dx, 0, 'round', 56, 56);
    const g = scene.add.graphics();
    g.fillStyle(0x1a1420, 1).fillTriangle(dx + dir * 13, 1, dx - dir * 8, -13, dx - dir * 8, 15);
    g.fillStyle(0xfff2cc, 1).fillTriangle(dx + dir * 11, 0, dx - dir * 6, -10, dx - dir * 6, 10);
    const hit = scene.add.zone(dx, 0, 90, 104).setInteractive({ useHandCursor: true });
    hit.on('pointerdown', () => knob.setScale(0.92));
    hit.on('pointerout', () => knob.setScale(1));
    hit.on('pointerup', () => { knob.setScale(1); cycle(dir); });
    sel.add([knob, g, hit]);
  };
  arrow(-170, -1);
  arrow(170, 1);
  const show = () => {
    const s = camp.s;
    name.setText(t('c_' + s.cls)).setScale(1);
    if (name.width > 260) name.setScale(260 / name.width);
    name.setColor('#' + Phaser.Display.Color.IntegerToColor(CLASS[s.cls].color).lighten(18).color.toString(16).padStart(6, '0'));
    desc.setText(s.chosen ? t('heroLevel', { n: s.level }) + (s.victory ? '  ·  ' + t('ngShort', { n: s.cycle + 1 }) : '') : t('cd_' + s.cls));
    desc.setScale(desc.height > 40 ? 40 / desc.height : 1);
  };
  const cycle = (dir: 1 | -1) => {
    const i = CLASS_IDS.indexOf(camp.s.cls);
    const next = CLASS_IDS[(i + dir + CLASS_IDS.length) % CLASS_IDS.length];
    camp.setClass(next);
    camp.save();
    playSfx(scene, 'move', { volume: 0.4 });
    show();
    scene.tweens.add({ targets: sel, scale: 1.04, duration: 80, yoyo: true });
    onHero(next);
  };
  show();
  // NEW CAMPAIGN: the first tap arms it (crimson, "SURE?"), the second starts over
  let armed = 0;
  const btn = new SkinButton(scene, x + 220, y + 4, t('newGame'), () => {
    if (!camp.s.chosen) return;
    if (!armed) {
      armed = 1;
      btn.setColor(CRIMSON).setText(t('sure')).fitLabel(170);
      scene.time.delayedCall(2600, () => { if (armed) { armed = 0; label(); } });
      return;
    }
    armed = 0;
    camp.reset(camp.s.cls);
    camp.save();
    playSfx(scene, 'error', { volume: 0.35 });
    label();
    show();
  }, { width: 196, height: 104, size: 30 });
  const label = () => { btn.setColor(STONE).setText(t('newGame')).fitLabel(170); btn.setAlpha(camp.s.chosen ? 1 : 0.55); };
  label();
  scene.input.keyboard?.on('keydown-H', () => cycle(1));
  if (!touch) txt(scene, x, y + 76, t('heroKeys'), { size: 17, color: '#d8d0e8', strokeThickness: 3, shadow: false });
  // the difficulty switch picks the other save: follow it
  let shown = mode();
  const poll = scene.time.addEvent({ delay: 250, loop: true, callback: () => { if (mode() !== shown) { shown = mode(); camp = Campaign.load(shown); show(); label(); onHero(camp.s.cls); } } });
  scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => poll.remove());
  return { refresh: () => { camp = Campaign.load(mode()); show(); label(); } };
}
