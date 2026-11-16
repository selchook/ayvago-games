// Pirate Cove's menu theme (src/core/menu-theme.ts): a naval look in brass and navy. Berkshire
// Swash on riveted ship-plates (polished brass for the main buttons, navy enamel in a brass bezel
// for the rest), the how-to and the pause / result card on a ship's log: a sea chart with its grid,
// a compass rose and a latitude scale in a navy binding with brass corners. Round the screen runs
// a chart border (a navy band with the black-and-white degree scale) with a compass rose in each
// corner, and the logo sits over a ship's wheel with two crossed cannons. Everything is painted on
// canvas once (under the Ayvago intro) and cached.
import Phaser from 'phaser';
import { t, labelTexture, STEERING_PIECES, type LabelStyle, type MenuTheme, type SkinPainter, type BorderStyle } from '@core';
import { WAVES } from './waves';
import { BERKSHIRE_SWASH } from '@core/fonts/berkshire-swash';

/** The wave card (PlayScene.showCard). */
export const WAVE_CARD_W = 600, WAVE_CARD_H = 210;
/** Its lines: the wave's number and its title, and the WAVE CLEAR banner over the sea. */
export const WAVE_NO_STYLE: LabelStyle = { size: 28, color: '#8a5a12', stroke: null, shadow: false };
export const WAVE_TITLE_STYLE: LabelStyle = { size: 48, color: '#1d3c66', stroke: null, shadow: false };
export const WAVE_CLEAR_STYLE: LabelStyle = { size: 64, fill: ['#fffbe6', '#ffe08a', '#e8b040', '#a8661a'], stroke: '#0b1a2e', strokeWidth: 12 };

export const NAVY = 0x1f4a78, BRASS = 0xc9973a, DEEP = 0x0f2740, GOLD = 0xe8c068;
/** The palette's primary: the red of the ensign (the NEW BEST ribbon); the skin paints the primary buttons in brass. */
export const ENSIGN = 0xa8322a;
/** Ink on the chart paper. */
export const INK = '#1b2a40';
export const LABEL_STROKE = '#0a1626';

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

/** A domed brass rivet with its shadow. */
function rivet(c: CanvasRenderingContext2D, x: number, y: number, r: number, metal = GOLD): void {
  c.save();
  c.fillStyle = 'rgba(0,0,0,0.45)';
  c.beginPath(); c.arc(x + r * 0.2, y + r * 0.35, r * 1.1, 0, Math.PI * 2); c.fill();
  const g = c.createRadialGradient(x - r * 0.35, y - r * 0.4, r * 0.1, x, y, r);
  g.addColorStop(0, css(shade(metal, 0.7))); g.addColorStop(0.5, css(metal)); g.addColorStop(1, css(shade(metal, -0.6)));
  c.fillStyle = g;
  c.beginPath(); c.arc(x, y, r, 0, Math.PI * 2); c.fill();
  c.restore();
}

/** Polished metal: a vertical gradient with a bright band and fine horizontal brushing. */
function metal(c: CanvasRenderingContext2D, shape: Path2D, x: number, y: number, w: number, h: number, col: number, r: () => number, dim = 0): void {
  const g = c.createLinearGradient(0, y, 0, y + h);
  g.addColorStop(0, css(shade(col, 0.55 - dim)));
  g.addColorStop(0.22, css(shade(col, 0.2 - dim)));
  g.addColorStop(0.5, css(shade(col, -dim)));
  g.addColorStop(0.78, css(shade(col, -0.28 - dim)));
  g.addColorStop(1, css(shade(col, -0.05 - dim)));
  c.fillStyle = g; c.fill(shape);
  c.save(); c.clip(shape);
  for (let i = 0, n = Math.round(h / 2.2); i < n; i++) {
    c.fillStyle = r() < 0.5 ? 'rgba(255,250,220,0.08)' : 'rgba(60,30,0,0.08)';
    c.fillRect(x, y + r() * h, w, 0.8 + r());
  }
  c.restore();
}

/**
 * The ship-plate skin. Brass faces (the primary colour, the trim) are polished brass with an
 * engraved inner line; every other face is enamel in a brass bezel. Rivets sit in the corners
 * (four on big plates), a press sinks the plate, hover rings it with a warm glow, 'on' gives the
 * bezel a bright edge. The switch's track is a sunk navy slot, a round piece a brass porthole.
 */
export const plateSkin: SkinPainter = (c, kind, w, h, o) => {
  const P = o.palette, r = rng(o.seed);
  const sunk = o.state === 'down' || o.state === 'off' || kind === 'track';
  const off = o.state === 'off';
  const col = off ? shade(o.color, -0.35) : o.color;
  const isBrass = o.color === P.primary || o.color === P.trim || o.color === BRASS;
  const round = kind === 'round';
  const R = round ? Math.min(w, h) / 2 : Math.min(18, h * 0.24);
  const shapeAt = (i: number): Path2D => {
    const p = new Path2D();
    if (round) p.arc(w / 2, h / 2, Math.min(w, h) / 2 - i, 0, Math.PI * 2);
    else p.roundRect(i, i, w - i * 2, h - i * 2, Math.max(2, R - i));
    return p;
  };
  const outer = shapeAt(0);
  c.save();
  c.translate(0, o.state === 'down' ? 3 : 0);
  if (o.state === 'over') {
    c.save();
    c.shadowColor = 'rgba(255,214,120,0.95)'; c.shadowBlur = 18;
    c.fillStyle = css(GOLD); c.fill(outer);
    c.restore();
  }
  c.save();
  c.shadowColor = 'rgba(0,0,0,0.6)'; c.shadowBlur = sunk ? 3 : 10; c.shadowOffsetY = sunk ? 1 : 6;
  c.fillStyle = '#000'; c.fill(outer);
  c.restore();
  if (kind === 'track') {
    metal(c, outer, 0, 0, w, h, BRASS, r, 0.25);
    const slot = shapeAt(6);
    c.fillStyle = css(shade(DEEP, -0.3)); c.fill(slot);
    c.save(); c.clip(slot);
    const top = c.createLinearGradient(0, 6, 0, 22);
    top.addColorStop(0, 'rgba(0,0,0,0.6)'); top.addColorStop(1, 'rgba(0,0,0,0)');
    c.fillStyle = top; c.fillRect(0, 0, w, 24);
    c.restore();
    c.lineWidth = 1.5; c.strokeStyle = 'rgba(0,0,0,0.7)'; c.stroke(slot);
    c.restore();
    return;
  }
  // the bezel (brass) and the face
  const bez = round ? Math.max(4, w * 0.09) : Math.max(5, Math.min(9, h * 0.11));
  const face0 = isBrass ? (off ? shade(BRASS, -0.35) : BRASS) : col;
  metal(c, outer, 0, 0, w, h, shade(BRASS, off ? -0.35 : 0), r, sunk && !off ? 0.08 : 0);
  const face = shapeAt(bez);
  if (isBrass) {
    // a polished face, a little darker than the bezel, with an engraved line inside
    metal(c, face, bez, bez, w - bez * 2, h - bez * 2, shade(face0, -0.08), r, sunk ? 0.1 : 0);
    c.lineWidth = 2; c.strokeStyle = 'rgba(70,40,5,0.55)'; c.stroke(face);
    if (h >= 56 && !round) {
      const e = shapeAt(bez + 6);
      c.lineWidth = 1.5; c.strokeStyle = 'rgba(90,50,5,0.45)'; c.stroke(e);
      c.save(); c.translate(0, 1.2); c.strokeStyle = 'rgba(255,240,190,0.35)'; c.stroke(e); c.restore();
    }
  } else {
    const g = c.createLinearGradient(0, bez, 0, h - bez);
    g.addColorStop(0, css(shade(col, sunk ? -0.1 : 0.22)));
    g.addColorStop(0.55, css(col));
    g.addColorStop(1, css(shade(col, -0.35)));
    c.fillStyle = g; c.fill(face);
    c.save(); c.clip(face);
    // a glassy highlight across the upper half of the enamel
    if (!sunk) {
      c.fillStyle = 'rgba(255,255,255,0.12)';
      c.beginPath(); c.ellipse(w / 2, bez - h * 0.1, w * 0.62, h * 0.38, 0, 0, Math.PI * 2); c.fill();
    } else {
      const top = c.createLinearGradient(0, bez, 0, bez + 12);
      top.addColorStop(0, 'rgba(0,0,0,0.5)'); top.addColorStop(1, 'rgba(0,0,0,0)');
      c.fillStyle = top; c.fillRect(0, 0, w, bez + 12);
    }
    c.restore();
    c.lineWidth = 2; c.strokeStyle = 'rgba(10,20,35,0.75)'; c.stroke(face);
  }
  // a board: a fine brass inlay line inside the enamel
  if (kind === 'board') {
    const e = shapeAt(bez + 8);
    c.lineWidth = 2; c.strokeStyle = css(GOLD, 0.55); c.stroke(e);
  }
  // rivets: the four corners; a long plate also gets two at the middle of its ends
  if (!round) {
    const rv = Math.max(2.6, Math.min(4.6, h * 0.055));
    const m = bez / 2;
    const pts: number[][] = [[m + 1, m + 1], [w - m - 1, m + 1], [m + 1, h - m - 1], [w - m - 1, h - m - 1]];
    if (kind === 'board' || (kind === 'button' && w >= 240)) {
      for (let x = w * 0.25; x < w - 20; x += w * 0.25) pts.push([x, m], [x, h - m]);
    }
    if (h >= 50 && R > 8) for (const p of pts.slice(0, 4)) { p[0] += (p[0] < w / 2 ? 1 : -1) * R * 0.25; p[1] += (p[1] < h / 2 ? 1 : -1) * R * 0.25; }
    for (const [x, y] of pts) rivet(c, x, y, rv, off ? shade(GOLD, -0.4) : GOLD);
  } else {
    // a porthole: rivets round the ring
    const R0 = Math.min(w, h) / 2 - bez / 2;
    for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2 + Math.PI / 8; rivet(c, w / 2 + Math.cos(a) * R0, h / 2 + Math.sin(a) * R0, Math.max(1.8, bez * 0.25)); }
  }
  c.lineWidth = 2; c.strokeStyle = 'rgba(40,22,0,0.85)'; c.stroke(outer);
  if (o.state === 'on' || o.state === 'over') {
    c.lineWidth = o.state === 'over' ? 3.5 : 3;
    c.strokeStyle = 'rgba(255,236,170,0.95)';
    c.stroke(shapeAt(1.5));
  }
  if (o.state === 'down') { c.fillStyle = 'rgba(0,0,0,0.15)'; c.fill(outer); }
  c.restore();
};

// ------------------------------------------------------------------ the ship's log (a sea chart)

/** An eight-point compass rose centred on (x, y), radius R; `faint` paints it as a watermark. */
export function compassRose(c: CanvasRenderingContext2D, x: number, y: number, R: number, faint = false): void {
  c.save();
  c.translate(x, y);
  const ink = faint ? 'rgba(40,80,120,0.16)' : '#12233a';
  const light = faint ? 'rgba(40,80,120,0.07)' : '#f6efd8';
  c.lineWidth = Math.max(1, R * 0.04);
  c.strokeStyle = ink;
  c.beginPath(); c.arc(0, 0, R * 0.92, 0, Math.PI * 2); c.stroke();
  c.beginPath(); c.arc(0, 0, R * 0.8, 0, Math.PI * 2); c.stroke();
  for (let i = 0; i < 32; i++) {
    const a = (i / 32) * Math.PI * 2, k = i % 4 ? 0.86 : 0.8;
    c.beginPath(); c.moveTo(Math.cos(a) * R * k, Math.sin(a) * R * k); c.lineTo(Math.cos(a) * R * 0.92, Math.sin(a) * R * 0.92); c.stroke();
  }
  // the points: long ones on the cardinal directions, short ones between, each half light, half dark
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 - Math.PI / 2, L = i % 2 ? R * 0.52 : R * 0.9, wd = i % 2 ? R * 0.1 : R * 0.15;
    const tx = Math.cos(a) * L, ty = Math.sin(a) * L;
    const lx = Math.cos(a - Math.PI / 2) * wd, ly = Math.sin(a - Math.PI / 2) * wd;
    c.fillStyle = light; c.beginPath(); c.moveTo(0, 0); c.lineTo(tx, ty); c.lineTo(lx, ly); c.closePath(); c.fill(); c.stroke();
    c.fillStyle = ink; c.beginPath(); c.moveTo(0, 0); c.lineTo(tx, ty); c.lineTo(-lx, -ly); c.closePath(); c.fill(); c.stroke();
  }
  c.fillStyle = faint ? 'rgba(160,110,30,0.2)' : css(BRASS);
  c.beginPath(); c.arc(0, 0, R * 0.08, 0, Math.PI * 2); c.fill();
  c.restore();
}

/** The latitude scale: alternating dark and light bars along a line from (x, y), `len` long, `t` thick. */
function degreeScale(c: CanvasRenderingContext2D, x: number, y: number, len: number, t: number, step = 22, dark = '#12233a', light = '#f4ecd2'): void {
  for (let i = 0, p = 0; p < len; i++, p += step) {
    c.fillStyle = i % 2 ? light : dark;
    c.fillRect(x + p, y, Math.min(step, len - p), t);
  }
  c.lineWidth = 1; c.strokeStyle = dark; c.strokeRect(x + 0.5, y + 0.5, len - 1, t - 1);
}

/** The how-to and the pause / result card: a sea chart in a navy binding with brass corners. */
export function shipsLog(c: CanvasRenderingContext2D, w: number, h: number): void {
  const band = 11, r = rng(w * 31 + h);
  const outer = new Path2D(); outer.roundRect(0, 0, w, h, 14);
  c.save();
  c.shadowColor = 'rgba(0,0,0,0.6)'; c.shadowBlur = 16; c.shadowOffsetY = 8;
  c.fillStyle = '#000'; c.fill(outer);
  c.restore();
  // the binding: navy leather
  const nav = c.createLinearGradient(0, 0, 0, h);
  nav.addColorStop(0, css(shade(NAVY, -0.15))); nav.addColorStop(1, css(shade(NAVY, -0.55)));
  c.fillStyle = nav; c.fill(outer);
  c.save(); c.clip(outer);
  for (let i = 0; i < w * h * 0.002; i++) { c.fillStyle = r() < 0.5 ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.12)'; c.fillRect(r() * w, r() * h, 2, 2); }
  c.restore();
  c.setLineDash([5, 4]); c.lineWidth = 1.5; c.strokeStyle = 'rgba(232,192,104,0.6)';
  c.beginPath(); c.roundRect(4, 4, w - 8, h - 8, 10); c.stroke();
  c.setLineDash([]);
  // the chart
  const px = band, py = band, pw = w - band * 2, ph = h - band * 2;
  const paper = c.createLinearGradient(0, py, 0, py + ph);
  paper.addColorStop(0, '#f6f1dc'); paper.addColorStop(1, '#e6dcbc');
  c.fillStyle = paper; c.fillRect(px, py, pw, ph);
  c.save();
  c.beginPath(); c.rect(px, py, pw, ph); c.clip();
  // a faint blue sea wash in the corners
  const wash = c.createRadialGradient(px + pw / 2, py + ph / 2, Math.min(pw, ph) * 0.3, px + pw / 2, py + ph / 2, Math.max(pw, ph) * 0.75);
  wash.addColorStop(0, 'rgba(120,170,200,0)'); wash.addColorStop(1, 'rgba(110,160,195,0.28)');
  c.fillStyle = wash; c.fillRect(px, py, pw, ph);
  // the grid of meridians and parallels
  c.lineWidth = 1; c.strokeStyle = 'rgba(60,110,150,0.22)';
  for (let x = px + 40; x < px + pw; x += 48) { c.beginPath(); c.moveTo(x, py); c.lineTo(x, py + ph); c.stroke(); }
  for (let y = py + 40; y < py + ph; y += 48) { c.beginPath(); c.moveTo(px, y); c.lineTo(px + pw, y); c.stroke(); }
  // rhumb lines from a compass rose, and the rose itself as a watermark
  const cx = px + pw * 0.78, cy = py + ph * 0.7, R = Math.min(pw, ph) * 0.28;
  c.strokeStyle = 'rgba(60,110,150,0.12)';
  for (let i = 0; i < 16; i++) { const a = (i / 16) * Math.PI * 2; c.beginPath(); c.moveTo(cx, cy); c.lineTo(cx + Math.cos(a) * 2000, cy + Math.sin(a) * 2000); c.stroke(); }
  compassRose(c, cx, cy, R, true);
  // foxing
  for (let i = 0; i < 10; i++) { c.fillStyle = 'rgba(150,110,50,0.06)'; c.beginPath(); c.arc(px + r() * pw, py + r() * ph, 6 + r() * 22, 0, Math.PI * 2); c.fill(); }
  c.restore();
  // the latitude scale round the chart
  const s = 5;
  degreeScale(c, px, py, pw, s);
  degreeScale(c, px, py + ph - s, pw, s);
  c.save(); c.translate(px + s, py); c.rotate(Math.PI / 2); degreeScale(c, 0, 0, ph, s); c.restore();
  c.save(); c.translate(px + pw, py); c.rotate(Math.PI / 2); degreeScale(c, 0, 0, ph, s); c.restore();
  c.lineWidth = 2; c.strokeStyle = '#12233a'; c.strokeRect(px, py, pw, ph);
  // brass corner plates
  for (const [x, y, sx, sy] of [[0, 0, 1, 1], [w, 0, -1, 1], [0, h, 1, -1], [w, h, -1, -1]] as number[][]) {
    c.save(); c.translate(x, y); c.scale(sx, sy);
    const p = new Path2D(); p.moveTo(2, 2); p.lineTo(34, 2); p.lineTo(2, 34); p.closePath();
    const g = c.createLinearGradient(0, 0, 40, 40);
    g.addColorStop(0, css(shade(GOLD, 0.4))); g.addColorStop(0.5, css(BRASS)); g.addColorStop(1, css(shade(BRASS, -0.45)));
    c.fillStyle = g; c.fill(p);
    c.lineWidth = 1.5; c.strokeStyle = 'rgba(50,25,0,0.8)'; c.stroke(p);
    rivet(c, 10, 10, 3);
    c.restore();
  }
}

// ------------------------------------------------------------------ the frame

/** The chart border round the screen: a navy band, a brass line and the degree scale. */
const chartEdge: BorderStyle['edge'] = (c, len, t) => {
  const g = c.createLinearGradient(0, 0, 0, t);
  g.addColorStop(0, css(shade(NAVY, -0.45))); g.addColorStop(1, css(shade(NAVY, -0.2)));
  c.fillStyle = g; c.fillRect(0, 0, len, t);
  degreeScale(c, 0, 3, len, 6, 26, '#0b1626', '#efe6c8');
  c.fillStyle = css(GOLD); c.fillRect(0, t - 5, len, 2);
  c.fillStyle = 'rgba(0,0,0,0.5)'; c.fillRect(0, t - 3, len, 3);
};

/** A brass-ringed compass rose in each corner, where the bands meet. */
function cornerRose(c: CanvasRenderingContext2D, size: number): void {
  const cx = size * 0.42, cy = size * 0.42, R = size * 0.38;
  c.save();
  c.shadowColor = 'rgba(0,0,0,0.55)'; c.shadowBlur = 6; c.shadowOffsetY = 2;
  const g = c.createLinearGradient(0, 0, size, size);
  g.addColorStop(0, css(shade(GOLD, 0.45))); g.addColorStop(0.5, css(BRASS)); g.addColorStop(1, css(shade(BRASS, -0.5)));
  c.fillStyle = g; c.beginPath(); c.arc(cx, cy, R, 0, Math.PI * 2); c.fill();
  c.restore();
  c.fillStyle = '#f2ead0'; c.beginPath(); c.arc(cx, cy, R * 0.8, 0, Math.PI * 2); c.fill();
  compassRose(c, cx, cy, R * 0.82);
  c.lineWidth = 1.5; c.strokeStyle = 'rgba(40,20,0,0.85)'; c.beginPath(); c.arc(cx, cy, R, 0, Math.PI * 2); c.stroke();
}

export const CHART_BORDER: BorderStyle = { thick: 16, inset: 4, edge: chartEdge, corner: { size: 54, draw: cornerRose, inset: 0 } };

// ------------------------------------------------------------------ the emblem

/** A ship's wheel over two crossed cannons, a sea-blue glow behind. */
export function wheelEmblem(c: CanvasRenderingContext2D, size: number): void {
  const u = size / 100;
  c.save();
  c.translate(size / 2, size / 2);
  const glow = c.createRadialGradient(0, 0, 8 * u, 0, 0, 50 * u);
  glow.addColorStop(0, 'rgba(120,200,255,0.45)'); glow.addColorStop(1, 'rgba(120,200,255,0)');
  c.fillStyle = glow; c.fillRect(-50 * u, -50 * u, 100 * u, 100 * u);
  // the cannons: tapered iron barrels crossed behind the wheel, muzzles up and out
  for (const s of [-1, 1]) {
    c.save();
    c.rotate(s * 0.72);
    const len = 84 * u, rb = 7.5 * u, rm = 5.2 * u;
    const body = new Path2D();
    body.moveTo(-rb, len / 2); body.lineTo(-rm, -len / 2 + 5 * u); body.lineTo(rm, -len / 2 + 5 * u); body.lineTo(rb, len / 2); body.closePath();
    const g = c.createLinearGradient(-rb, 0, rb, 0);
    g.addColorStop(0, '#15181d'); g.addColorStop(0.35, '#6a7079'); g.addColorStop(0.6, '#3a3f47'); g.addColorStop(1, '#0d0f12');
    c.fillStyle = g; c.fill(body);
    c.lineWidth = 1.4 * u; c.strokeStyle = '#06070a'; c.stroke(body);
    // reinforcing rings, the muzzle swell and the cascabel knob
    for (const [y, rr] of [[-len / 2 + 5 * u, rm + 2 * u], [-len * 0.12, rb * 0.92], [len * 0.24, rb + 1 * u], [len / 2, rb + 1.2 * u]] as number[][]) {
      c.fillStyle = '#2b2f36'; c.fillRect(-rr, y - 1.8 * u, rr * 2, 3.6 * u);
      c.strokeStyle = '#06070a'; c.lineWidth = 1 * u; c.strokeRect(-rr, y - 1.8 * u, rr * 2, 3.6 * u);
    }
    c.fillStyle = '#05060a'; c.beginPath(); c.ellipse(0, -len / 2 + 4 * u, rm * 0.7, 1.6 * u, 0, 0, Math.PI * 2); c.fill();
    c.fillStyle = '#2b2f36'; c.beginPath(); c.arc(0, len / 2 + 4 * u, 3.6 * u, 0, Math.PI * 2); c.fill(); c.stroke();
    c.restore();
  }
  // the wheel: spokes with turned handles, a wooden rim, a brass hub
  const RIM = 29 * u, SP = 44 * u;
  const wood = (a: number, b: number) => {
    const g = c.createLinearGradient(-a, -a, b, b);
    g.addColorStop(0, '#c98a4a'); g.addColorStop(0.5, '#8a5428'); g.addColorStop(1, '#4a2a10');
    return g;
  };
  c.lineCap = 'round';
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 + Math.PI / 8;
    const x = Math.cos(a), y = Math.sin(a);
    c.strokeStyle = '#2a1606'; c.lineWidth = 7.5 * u;
    c.beginPath(); c.moveTo(x * 6 * u, y * 6 * u); c.lineTo(x * (SP - 4 * u), y * (SP - 4 * u)); c.stroke();
    c.strokeStyle = '#9a6430'; c.lineWidth = 4.8 * u; c.stroke();
    // the handle: a knob at the end
    c.fillStyle = wood(4 * u, 4 * u); c.strokeStyle = '#2a1606'; c.lineWidth = 1.4 * u;
    c.beginPath(); c.ellipse(x * SP, y * SP, 5.2 * u, 5.2 * u, a, 0, Math.PI * 2); c.fill(); c.stroke();
  }
  c.strokeStyle = '#2a1606'; c.lineWidth = 11 * u;
  c.beginPath(); c.arc(0, 0, RIM, 0, Math.PI * 2); c.stroke();
  c.strokeStyle = wood(RIM, RIM); c.lineWidth = 8 * u; c.stroke();
  c.strokeStyle = 'rgba(255,220,160,0.35)'; c.lineWidth = 1.6 * u;
  c.beginPath(); c.arc(0, 0, RIM + 2 * u, Math.PI * 1.05, Math.PI * 1.75); c.stroke();
  // brass studs on the rim
  for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2 + Math.PI / 8; rivet(c, Math.cos(a) * RIM, Math.sin(a) * RIM, 2 * u); }
  // the hub
  const hub = c.createRadialGradient(-3 * u, -3 * u, 1 * u, 0, 0, 11 * u);
  hub.addColorStop(0, css(shade(GOLD, 0.6))); hub.addColorStop(0.5, css(BRASS)); hub.addColorStop(1, css(shade(BRASS, -0.6)));
  c.fillStyle = hub; c.beginPath(); c.arc(0, 0, 11 * u, 0, Math.PI * 2); c.fill();
  c.strokeStyle = '#2a1606'; c.lineWidth = 1.5 * u; c.stroke();
  // an anchor stamped on the hub
  c.strokeStyle = '#3a2208'; c.lineWidth = 1.8 * u; c.lineCap = 'round';
  c.beginPath(); c.moveTo(0, -6 * u); c.lineTo(0, 6 * u); c.moveTo(-3.5 * u, -3 * u); c.lineTo(3.5 * u, -3 * u); c.stroke();
  c.beginPath(); c.arc(0, 1 * u, 6 * u, Math.PI * 0.15, Math.PI * 0.85); c.stroke();
  c.beginPath(); c.arc(0, -7.5 * u, 1.6 * u, 0, Math.PI * 2); c.stroke();
  c.restore();
}

// ------------------------------------------------------------------ the theme

export const NAVAL_THEME: MenuTheme = {
  font: BERKSHIRE_SWASH,
  palette: {
    primary: ENSIGN, secondary: NAVY, board: DEEP, trim: GOLD,
    label: '#fff6dc', labelStroke: LABEL_STROKE, muted: '#a9bdd4', accent: '#ffd66a',
    heading: '#1d3c66', body: INK, icon: 0xfff2cc, shade: 0x061224,
  },
  logo: {
    fill: ['#fffbe6', '#ffe08a', '#e8b040', '#a8661a'],
    outline: '#0b1a2e',
    rim: '#f2e4c0',
    depth: '#163a63',
    size: 150,
    emblem: { draw: wheelEmblem, size: 260, overlap: 0.26 },
  },
  skin: plateSkin,
  // the STEERING switch under PLAY (touch screens)
  pieces: [...STEERING_PIECES],
  // dim: the backdrop's veil (main.ts drew it as its own layer before the theme)
  frame: { border: CHART_BORDER, notes: shipsLog, vignette: 0.5, dim: 0.3 },
  overlays: {
    lose: '#9a2a1e',
    win: '#ffcf4a',
    adColor: 0x2f7a5a,
    titles: ['victory', 'shipwrecked'],
  },
  // the wave card (PlayScene.showCard)
  cards: [{ w: WAVE_CARD_W, h: WAVE_CARD_H }],
  prebake: prebakeWaves,
};

/** Paints the wave cards' lines and the WAVE CLEAR banner (current language) under the Ayvago intro. */
function prebakeWaves(scene: Phaser.Scene): void {
  WAVES.forEach((w, i) => {
    labelTexture(scene, t('waveN', { n: i + 1 }), WAVE_NO_STYLE);
    labelTexture(scene, t(w.title), WAVE_TITLE_STYLE);
  });
  labelTexture(scene, t('waveClear'), WAVE_CLEAR_STYLE);
}
