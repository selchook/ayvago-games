// Rooftop Courier's menu theme (src/core/menu-theme.ts): Saira Stencil One on painted metal street
// signs (dusk orange and indigo, a cream border, steel bolts, worn paint), the how-to on a big
// perforated postage stamp with a postmark, airmail stripes round the screen with a stamp in each
// corner, and a winged parcel flying out of a dusk-skyline stamp behind the logo. Everything is
// painted on canvas once (under the Ayvago intro) and cached. Also the menu's own SHOP button.
import Phaser from 'phaser';
import { t, txt, SkinButton, type MenuTheme, type SkinPainter, type BorderStyle } from '@core';
import { SAIRA_STENCIL_ONE } from '@core/fonts/saira-stencil-one';
import { STAMP_ICON } from './art';

/** The shift's summary card (PlayScene.finish): without and with the missions done. */
export const SUMMARY_W = 620;
export const SUMMARY_H = [470, 600] as const;
/** The SHOP button on the menu. */
const SHOP_W = 360, SHOP_H = 100;

const INK = '#1d1230';
const ORANGE = 0xe8692a, INDIGO = 0x3b3d8c, CREAM = '#f6eedd', AMBER = 0xffc94a;

const css = (c: number, a = 1): string => {
  const r = (c >> 16) & 255, g = (c >> 8) & 255, b = c & 255;
  return a >= 1 ? `rgb(${r},${g},${b})` : `rgba(${r},${g},${b},${a})`;
};
const shade = (c: number, k: number): number => {
  const f = (v: number) => Math.round(k > 0 ? v + (255 - v) * k : v * (1 + k));
  return (f((c >> 16) & 255) << 16) | (f((c >> 8) & 255) << 8) | f(c & 255);
};
function rng(seed: number): () => number {
  let s = (seed >>> 0) % 2147483647 || 1;
  return () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
}

function rrect(x: number, y: number, w: number, h: number, r: number): Path2D {
  const p = new Path2D();
  p.roundRect(x, y, w, h, r);
  return p;
}

/** A steel bolt head with its slot. */
function bolt(c: CanvasRenderingContext2D, x: number, y: number, rad: number, r: () => number): void {
  c.save();
  c.fillStyle = 'rgba(0,0,0,0.45)';
  c.beginPath(); c.arc(x + rad * 0.2, y + rad * 0.35, rad * 1.1, 0, Math.PI * 2); c.fill();
  const g = c.createRadialGradient(x - rad * 0.4, y - rad * 0.4, rad * 0.1, x, y, rad);
  g.addColorStop(0, '#f4f4f8'); g.addColorStop(0.5, '#a8a8b8'); g.addColorStop(1, '#4a4a5a');
  c.fillStyle = g;
  c.beginPath(); c.arc(x, y, rad, 0, Math.PI * 2); c.fill();
  c.strokeStyle = 'rgba(30,30,40,0.8)'; c.lineWidth = Math.max(1, rad * 0.35);
  const a = r() * Math.PI;
  c.beginPath(); c.moveTo(x - Math.cos(a) * rad * 0.7, y - Math.sin(a) * rad * 0.7); c.lineTo(x + Math.cos(a) * rad * 0.7, y + Math.sin(a) * rad * 0.7); c.stroke();
  c.restore();
}

/** Worn paint: scratches, chips down to the grey metal, a rust run at the bottom. */
function wear(c: CanvasRenderingContext2D, w: number, h: number, r: () => number, amount: number): void {
  c.lineCap = 'round';
  for (let i = 0, n = Math.round((w / 40) * amount); i < n; i++) {
    const x = r() * w, y = r() * h, l = 4 + r() * 14, a = (r() - 0.5) * 0.8;
    c.strokeStyle = `rgba(255,250,235,${0.12 + r() * 0.16})`; c.lineWidth = 0.8 + r() * 0.8;
    c.beginPath(); c.moveTo(x, y); c.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l); c.stroke();
  }
  for (let i = 0, n = Math.round(6 * amount); i < n; i++) {
    const edge = r() < 0.7;
    const x = edge ? r() * w : r() < 0.5 ? r() * 10 : w - r() * 10;
    const y = edge ? (r() < 0.5 ? r() * 6 : h - r() * 6) : r() * h;
    c.fillStyle = `rgba(150,150,165,${0.55 + r() * 0.3})`;
    c.beginPath();
    for (let k = 0; k < 6; k++) {
      const a = (k / 6) * Math.PI * 2, rr = 1.2 + r() * 3;
      k ? c.lineTo(x + Math.cos(a) * rr * 1.4, y + Math.sin(a) * rr) : c.moveTo(x + Math.cos(a) * rr * 1.4, y + Math.sin(a) * rr);
    }
    c.fill();
  }
  if (amount >= 1) {
    const x = w * (0.15 + r() * 0.7);
    const g = c.createLinearGradient(0, h * 0.55, 0, h);
    g.addColorStop(0, 'rgba(150,70,25,0)'); g.addColorStop(1, 'rgba(150,70,25,0.4)');
    c.fillStyle = g; c.fillRect(x, h * 0.55, 3 + r() * 4, h * 0.45);
  }
}

/** A brick wall: staggered courses, mortar, a soot stain. */
function bricks(c: CanvasRenderingContext2D, w: number, h: number, r: () => number): void {
  c.fillStyle = '#3a2a28'; c.fillRect(0, 0, w, h);
  const bh = 18, bw = 46;
  for (let row = 0, y = 0; y < h; row++, y += bh) {
    for (let x = row % 2 ? -bw / 2 : 0; x < w; x += bw) {
      const base = [0x8a3e2c, 0x9a4a32, 0x7a3426, 0xa0563a][Math.floor(r() * 4)];
      const g = c.createLinearGradient(0, y, 0, y + bh);
      g.addColorStop(0, css(shade(base, 0.12))); g.addColorStop(1, css(shade(base, -0.2)));
      c.fillStyle = g;
      c.fillRect(x + 1.5, y + 1.5, bw - 3, bh - 3);
    }
  }
  const soot = c.createRadialGradient(w * 0.7, h * 0.2, 4, w * 0.7, h * 0.2, w * 0.4);
  soot.addColorStop(0, 'rgba(20,10,20,0.35)'); soot.addColorStop(1, 'rgba(20,10,20,0)');
  c.fillStyle = soot; c.fillRect(0, 0, w, h);
}

/**
 * The street-sign skin: painted metal plates with rounded corners, a cream border inset, steel
 * bolts and worn paint; boards are brick walls in a steel frame, the switch's track a dark
 * asphalt slot. Hover glows amber, the selected segment gets an amber border, a press sinks.
 */
export const signPainter: SkinPainter = (c, kind, w, h, o) => {
  const P = o.palette, r = rng(o.seed);
  const sunk = o.state === 'down' || o.state === 'off' || kind === 'track';
  const color = o.state === 'off' ? shade(o.color, -0.4) : o.color;
  const round = kind === 'round';
  const rad = round ? Math.min(w, h) / 2 : kind === 'board' ? 14 : Math.min(18, h * 0.24);
  const shape = round ? (() => { const p = new Path2D(); p.arc(w / 2, h / 2, rad, 0, Math.PI * 2); return p; })() : rrect(0, 0, w, h, rad);
  c.save();
  c.translate(0, o.state === 'down' ? 3 : 0);
  if (o.state === 'over') {
    c.save();
    c.shadowColor = css(AMBER, 0.9); c.shadowBlur = 16;
    c.fillStyle = css(AMBER); c.fill(shape);
    c.restore();
  }
  c.save();
  c.shadowColor = 'rgba(0,0,0,0.55)';
  c.shadowBlur = sunk ? 3 : 9;
  c.shadowOffsetY = sunk ? 1 : 6;
  c.fillStyle = '#000'; c.fill(shape);
  c.restore();
  if (kind === 'track') {
    // an asphalt slot: dark, speckled, shadow under its top edge
    c.fillStyle = '#1a1626'; c.fill(shape);
    c.save(); c.clip(shape);
    for (let i = 0; i < w * h * 0.02; i++) {
      c.fillStyle = r() < 0.5 ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.25)';
      c.fillRect(r() * w, r() * h, 1.5, 1.5);
    }
    const top = c.createLinearGradient(0, 0, 0, 16);
    top.addColorStop(0, 'rgba(0,0,0,0.6)'); top.addColorStop(1, 'rgba(0,0,0,0)');
    c.fillStyle = top; c.fillRect(0, 0, w, 16);
    c.restore();
    c.lineWidth = 2.5; c.strokeStyle = '#0a0812'; c.stroke(shape);
    c.restore();
    return;
  }
  if (kind === 'board') {
    // a brick panel in a steel frame
    c.save(); c.clip(shape);
    bricks(c, w, h, r);
    c.restore();
    c.lineWidth = 8; c.strokeStyle = '#4a4a5c'; c.stroke(shape);
    c.lineWidth = 2; c.strokeStyle = '#8a8aa0'; c.stroke(rrect(3, 3, w - 6, h - 6, rad - 3));
    c.lineWidth = 2.5; c.strokeStyle = '#141220'; c.stroke(shape);
    for (const [x, y] of [[10, 10], [w - 10, 10], [10, h - 10], [w - 10, h - 10]]) bolt(c, x, y, 4, r);
    c.restore();
    return;
  }
  // the painted metal face: lighter at the top, a faint brushed sheen
  const body = c.createLinearGradient(0, 0, 0, h);
  body.addColorStop(0, css(shade(color, sunk ? -0.05 : 0.18)));
  body.addColorStop(0.55, css(color));
  body.addColorStop(1, css(shade(color, -0.28)));
  c.fillStyle = body; c.fill(shape);
  c.save(); c.clip(shape);
  for (let i = 0, n = Math.round(h / 3); i < n; i++) {
    c.fillStyle = `rgba(255,255,255,${0.02 + r() * 0.04})`;
    c.fillRect(0, r() * h, w, 1);
  }
  const sheen = c.createLinearGradient(0, 0, w, h);
  sheen.addColorStop(0, 'rgba(255,255,255,0)'); sheen.addColorStop(0.45, 'rgba(255,255,255,0.10)'); sheen.addColorStop(0.55, 'rgba(255,255,255,0)');
  c.fillStyle = sheen; c.fillRect(0, 0, w, h);
  wear(c, w, h, r, kind === 'plate' ? 0.4 : 1);
  if (sunk) {
    const top = c.createLinearGradient(0, 0, 0, 14);
    top.addColorStop(0, 'rgba(0,0,0,0.5)'); top.addColorStop(1, 'rgba(0,0,0,0)');
    c.fillStyle = top; c.fillRect(0, 0, w, 14);
  } else {
    c.fillStyle = 'rgba(255,255,255,0.22)'; c.fillRect(0, 0, w, 2.5);
    c.fillStyle = 'rgba(0,0,0,0.28)'; c.fillRect(0, h - 4, w, 4);
  }
  c.restore();
  // the sign's border: cream on the colours, amber when selected
  const inset = round ? 5 : Math.min(7, h * 0.09);
  const borderW = kind === 'plate' ? 2.5 : 3.5;
  const border = round
    ? (() => { const p = new Path2D(); p.arc(w / 2, h / 2, rad - inset, 0, Math.PI * 2); return p; })()
    : rrect(inset, inset, w - inset * 2, h - inset * 2, Math.max(4, rad - inset));
  if (o.color !== P.board) {
    c.lineWidth = o.state === 'on' ? borderW + 1.5 : borderW;
    c.strokeStyle = o.state === 'on' ? css(AMBER) : o.state === 'off' ? 'rgba(246,238,221,0.45)' : CREAM;
    c.stroke(border);
  }
  c.lineWidth = 2.5;
  c.strokeStyle = css(shade(color, -0.75));
  c.stroke(shape);
  if (o.state === 'over') { c.lineWidth = 2.5; c.strokeStyle = css(shade(AMBER, 0.3)); c.stroke(shape); }
  // bolts in the corners of the bigger signs
  if (kind === 'button' && h >= 60) {
    const m = inset + 9;
    for (const [x, y] of [[m, m], [w - m, m], [m, h - m], [w - m, h - m]]) bolt(c, x, y, 3.6, r);
  } else if (round) bolt(c, w / 2, inset + 6, 2.6, r);
  if (o.state === 'down') { c.fillStyle = 'rgba(0,0,0,0.16)'; c.fill(shape); }
  c.restore();
};

/** The holes of a perforated edge: semicircles cut out along every side of a w x h rectangle. */
function perforate(c: CanvasRenderingContext2D, x0: number, y0: number, w: number, h: number, rad: number, step: number): void {
  c.save();
  c.globalCompositeOperation = 'destination-out';
  const along = (len: number, at: (d: number) => [number, number]) => {
    const n = Math.max(2, Math.round(len / step));
    for (let i = 0; i <= n; i++) { const [x, y] = at((len * i) / n); c.beginPath(); c.arc(x, y, rad, 0, Math.PI * 2); c.fill(); }
  };
  along(w, (d) => [x0 + d, y0]);
  along(w, (d) => [x0 + d, y0 + h]);
  along(h, (d) => [x0, y0 + d]);
  along(h, (d) => [x0 + w, y0 + d]);
  c.restore();
}

/** The how-to and the pause / result card: a big postage stamp with a postmark in the corner. */
export function paintStamp(c: CanvasRenderingContext2D, w: number, h: number): void {
  const r = rng(w * 13 + h);
  // the paper on its own canvas (the holes cut through it), then laid down with a shadow
  const cv = document.createElement('canvas');
  cv.width = Math.ceil(w); cv.height = Math.ceil(h);
  const p = cv.getContext('2d')!;
  const paper = p.createLinearGradient(0, 0, 0, h);
  paper.addColorStop(0, '#fbf4e4'); paper.addColorStop(1, '#efe2c6');
  p.fillStyle = paper; p.fillRect(0, 0, w, h);
  for (let i = 0; i < w * h * 0.004; i++) {
    p.fillStyle = r() < 0.5 ? 'rgba(120,90,50,0.08)' : 'rgba(255,255,255,0.3)';
    p.fillRect(r() * w, r() * h, 1.5, 1.5);
  }
  // the stamp's printed frame: an indigo title bar along the top (the heading sits on it), an
  // indigo rule round the rest with a thin orange line inside
  const bar = Math.min(48, h * 0.2);
  p.fillStyle = css(INDIGO);
  p.fillRect(16, 14, w - 32, bar);
  p.fillStyle = 'rgba(255,255,255,0.12)'; p.fillRect(16, 14, w - 32, 3);
  p.strokeStyle = css(INDIGO); p.lineWidth = 4;
  p.strokeRect(18, 16, w - 36, h - 34);
  // (open at the top: the how-to's first line starts right under the bar)
  p.strokeStyle = css(ORANGE, 0.85); p.lineWidth = 2;
  p.beginPath(); p.moveTo(26, 14 + bar + 20); p.lineTo(26, h - 26); p.lineTo(w - 26, h - 26); p.lineTo(w - 26, 14 + bar + 20); p.stroke();
  p.fillStyle = css(ORANGE);
  for (const x of [30, w - 30]) { p.beginPath(); p.arc(x, 14 + bar / 2, 4, 0, Math.PI * 2); p.fill(); }
  // the postmark: two rings and the wavy cancellation lines running off to the right
  const px = w - 74, py = 70;
  p.strokeStyle = 'rgba(40,28,70,0.2)'; p.lineWidth = 3;
  p.beginPath(); p.arc(px, py, 38, 0, Math.PI * 2); p.stroke();
  p.lineWidth = 1.6;
  p.beginPath(); p.arc(px, py, 30, 0, Math.PI * 2); p.stroke();
  p.lineWidth = 3;
  for (let i = 0; i < 4; i++) {
    const y = py - 18 + i * 12;
    p.beginPath();
    for (let x = px - 116; x <= px - 44; x += 4) { const yy = y + Math.sin(x * 0.12) * 3; x === px - 116 ? p.moveTo(x, yy) : p.lineTo(x, yy); }
    p.stroke();
  }
  // a faint rubber stamp tick bottom-left
  p.save();
  p.translate(76, h - 64); p.rotate(-0.18);
  p.strokeStyle = 'rgba(200,50,30,0.2)'; p.lineWidth = 4;
  p.strokeRect(-44, -20, 88, 40);
  p.lineWidth = 6; p.lineCap = 'round';
  p.beginPath(); p.moveTo(-16, 0); p.lineTo(-4, 11); p.lineTo(18, -12); p.stroke();
  p.restore();
  perforate(p, 0, 0, w, h, 8, 24);
  c.save();
  c.shadowColor = 'rgba(0,0,0,0.55)'; c.shadowBlur = 14; c.shadowOffsetY = 7;
  c.drawImage(cv, 0, 0);
  c.restore();
}

// ------------------------------------------------------------------ the frame


/** Airmail stripes along the screen's edge: orange and indigo slants on cream. */
const airmailEdge: BorderStyle['edge'] = (c, len, thick) => {
  c.fillStyle = CREAM; c.fillRect(0, 0, len, thick);
  const sw = 14, period = 44;
  for (let x = -thick - period, i = 0; x < len + period; x += period / 2, i++) {
    c.fillStyle = i % 2 ? css(INDIGO) : css(ORANGE);
    c.beginPath();
    c.moveTo(x, 0); c.lineTo(x + sw, 0); c.lineTo(x + sw + thick, thick); c.lineTo(x + thick, thick);
    c.closePath(); c.fill();
  }
  c.fillStyle = 'rgba(0,0,0,0.5)'; c.fillRect(0, thick - 2, len, 2);
  c.fillStyle = 'rgba(255,255,255,0.35)'; c.fillRect(0, 0, len, 1.5);
};

/** A little postage stamp in the corner: a dusk sun over the rooftops. */
function cornerStamp(c: CanvasRenderingContext2D, size: number): void {
  const pad = 6, s = size - pad * 2;
  const cv = document.createElement('canvas');
  cv.width = size; cv.height = size;
  const p = cv.getContext('2d')!;
  p.fillStyle = '#fbf4e4'; p.fillRect(pad, pad, s, s);
  const ix = pad + 7, iy = pad + 7, iw = s - 14, ih = s - 14;
  const sky = p.createLinearGradient(0, iy, 0, iy + ih);
  sky.addColorStop(0, '#3a2a6a'); sky.addColorStop(0.55, '#c8507a'); sky.addColorStop(1, '#ffa24a');
  p.fillStyle = sky; p.fillRect(ix, iy, iw, ih);
  p.fillStyle = '#ffd27a';
  p.beginPath(); p.arc(ix + iw * 0.5, iy + ih * 0.62, ih * 0.22, 0, Math.PI * 2); p.fill();
  p.fillStyle = '#24163a';
  p.beginPath();
  p.moveTo(ix, iy + ih);
  for (const [fx, fy] of [[0, 0.72], [0.22, 0.72], [0.22, 0.6], [0.4, 0.6], [0.4, 0.78], [0.62, 0.78], [0.62, 0.55], [0.7, 0.55], [0.7, 0.66], [1, 0.66], [1, 1]]) p.lineTo(ix + iw * fx, iy + ih * fy);
  p.closePath(); p.fill();
  perforate(p, pad, pad, s, s, 2.6, 8);
  c.save();
  c.shadowColor = 'rgba(0,0,0,0.5)'; c.shadowBlur = 5; c.shadowOffsetY = 2;
  c.drawImage(cv, 0, 0);
  c.restore();
}

// ------------------------------------------------------------------ the emblem

/** A cardboard parcel on white wings, flying out of a dusk-skyline postage stamp. */
export function parcelEmblem(c: CanvasRenderingContext2D, size: number): void {
  const u = size / 100;
  c.save();
  c.translate(size / 2, size / 2);
  // a warm dusk glow
  const halo = c.createRadialGradient(0, -6 * u, 6 * u, 0, -6 * u, 50 * u);
  halo.addColorStop(0, 'rgba(255,170,80,0.35)'); halo.addColorStop(1, 'rgba(255,170,80,0)');
  c.fillStyle = halo; c.fillRect(-50 * u, -50 * u, 100 * u, 100 * u);
  // the stamp behind, tilted
  c.save();
  c.rotate(-0.08);
  const sw = 72 * u, sh = 78 * u, sx = -sw / 2, sy = -48 * u;
  const st = document.createElement('canvas');
  st.width = Math.ceil(sw + 8 * u); st.height = Math.ceil(sh + 8 * u);
  const p = st.getContext('2d')!;
  const o = 4 * u;
  p.fillStyle = '#fbf4e4'; p.fillRect(o, o, sw, sh);
  const ix = o + 5 * u, iy = o + 5 * u, iw = sw - 10 * u, ih = sh - 10 * u;
  const sky = p.createLinearGradient(0, iy, 0, iy + ih);
  sky.addColorStop(0, '#2c2060'); sky.addColorStop(0.5, '#b8487a'); sky.addColorStop(0.85, '#ff9a4a'); sky.addColorStop(1, '#ffc46a');
  p.fillStyle = sky; p.fillRect(ix, iy, iw, ih);
  p.save();
  p.shadowColor = 'rgba(255,220,140,0.9)'; p.shadowBlur = 10 * u;
  p.fillStyle = '#ffd88a';
  p.beginPath(); p.arc(ix + iw * 0.5, iy + ih * 0.66, 12 * u, 0, Math.PI * 2); p.fill();
  p.restore();
  p.fillStyle = 'rgba(255,255,255,0.8)';
  for (const [fx, fy] of [[0.15, 0.12], [0.8, 0.2], [0.6, 0.08], [0.3, 0.3]]) { p.beginPath(); p.arc(ix + iw * fx, iy + ih * fy, 0.7 * u, 0, Math.PI * 2); p.fill(); }
  // the skyline: roofs, a chimney, a water tower, an antenna
  p.fillStyle = '#1e1234';
  p.beginPath();
  p.moveTo(ix, iy + ih);
  for (const [fx, fy] of [[0, 0.76], [0.14, 0.76], [0.14, 0.66], [0.2, 0.66], [0.2, 0.72], [0.34, 0.72], [0.34, 0.6], [0.4, 0.55], [0.46, 0.6], [0.46, 0.8], [0.6, 0.8], [0.6, 0.68], [0.68, 0.68], [0.68, 0.74], [1, 0.74], [1, 1]]) p.lineTo(ix + iw * fx, iy + ih * fy);
  p.closePath(); p.fill();
  p.fillRect(ix + iw * 0.78, iy + ih * 0.56, iw * 0.14, ih * 0.08);
  p.fillRect(ix + iw * 0.79, iy + ih * 0.64, 1.2 * u, ih * 0.1);
  p.fillRect(ix + iw * 0.9, iy + ih * 0.64, 1.2 * u, ih * 0.1);
  p.fillRect(ix + iw * 0.25, iy + ih * 0.48, 1 * u, ih * 0.2);
  p.fillStyle = '#ffd27a';
  for (const [fx, fy] of [[0.05, 0.84], [0.25, 0.8], [0.52, 0.88], [0.72, 0.84], [0.88, 0.9]]) p.fillRect(ix + iw * fx, iy + ih * fy, 2.4 * u, 2.4 * u);
  p.strokeStyle = css(INDIGO); p.lineWidth = 1.4 * u;
  p.strokeRect(ix, iy, iw, ih);
  perforate(p, o, o, sw, sh, 2.6 * u, 7 * u);
  c.shadowColor = 'rgba(0,0,0,0.5)'; c.shadowBlur = 8 * u; c.shadowOffsetY = 3 * u;
  c.drawImage(st, sx - o, sy - o);
  c.restore();
  // speed lines behind the parcel
  c.lineCap = 'round';
  for (const [y, x0, l] of [[2, -46, 20], [10, -50, 26], [18, -44, 18]]) {
    c.strokeStyle = INK; c.lineWidth = 4.4 * u;
    c.beginPath(); c.moveTo(x0 * u, y * u); c.lineTo((x0 + l) * u, y * u); c.stroke();
    c.strokeStyle = '#fff6e6'; c.lineWidth = 2.4 * u;
    c.beginPath(); c.moveTo(x0 * u, y * u); c.lineTo((x0 + l) * u, y * u); c.stroke();
  }
  // the wings, each a fan of three feathers
  const wing = (s: number) => {
    c.save();
    c.scale(s, 1);
    c.translate(17 * u, 0);
    c.rotate(0.3);
    for (let i = 2; i >= 0; i--) {
      const L = (20 + i * 6) * u, a = -0.45 - i * 0.36;
      const f = new Path2D();
      f.moveTo(0, 0);
      f.quadraticCurveTo(Math.cos(a - 0.25) * L * 0.6, Math.sin(a - 0.25) * L * 0.6 - 3 * u, Math.cos(a) * L, Math.sin(a) * L);
      f.quadraticCurveTo(Math.cos(a + 0.35) * L * 0.7, Math.sin(a + 0.35) * L * 0.7 + 2 * u, 0, 6 * u);
      f.closePath();
      c.fillStyle = i === 0 ? '#ffffff' : i === 1 ? '#f1ecf8' : '#ddd6ec';
      c.strokeStyle = INK; c.lineWidth = 2 * u; c.lineJoin = 'round';
      c.fill(f); c.stroke(f);
    }
    c.restore();
  };
  wing(-1);
  wing(1);
  // the parcel: a box in three-quarter view with twine and a label
  c.save();
  c.translate(-2 * u, 8 * u);
  c.rotate(-0.06);
  c.lineJoin = 'round';
  const W = 40 * u, H = 27 * u, D = 10 * u;
  const front = new Path2D(); front.rect(-W / 2, -H / 2, W, H);
  const top = new Path2D(); top.moveTo(-W / 2, -H / 2); top.lineTo(-W / 2 + D, -H / 2 - D); top.lineTo(W / 2 + D, -H / 2 - D); top.lineTo(W / 2, -H / 2); top.closePath();
  const side = new Path2D(); side.moveTo(W / 2, -H / 2); side.lineTo(W / 2 + D, -H / 2 - D); side.lineTo(W / 2 + D, H / 2 - D); side.lineTo(W / 2, H / 2); side.closePath();
  c.fillStyle = '#c99257'; c.fill(front);
  c.fillStyle = '#e4b67c'; c.fill(top);
  c.fillStyle = '#9e6d3a'; c.fill(side);
  // twine: one round the front, one over the top
  c.strokeStyle = '#f4e6c8'; c.lineWidth = 2.4 * u;
  c.beginPath(); c.moveTo(-W / 2, 0); c.lineTo(W / 2, 0); c.lineTo(W / 2 + D, -D); c.stroke();
  c.beginPath(); c.moveTo(2 * u, H / 2); c.lineTo(2 * u, -H / 2); c.lineTo(2 * u + D, -H / 2 - D); c.stroke();
  c.beginPath(); c.moveTo(-W / 2 + D * 0.5, -H / 2 - D * 0.5); c.lineTo(W / 2 + D * 0.5, -H / 2 - D * 0.5); c.stroke();
  // the bow
  c.fillStyle = '#f4e6c8'; c.strokeStyle = INK; c.lineWidth = 1.4 * u;
  for (const s of [-1, 1]) { c.beginPath(); c.ellipse((2 + D * 0.5 / u + s * 4) * u, (-H / 2 / u - 4.5 - 1.5) * u, 3.6 * u, 2 * u, s * 0.5, 0, Math.PI * 2); c.fill(); c.stroke(); }
  // the address label
  c.fillStyle = '#fffaf0';
  c.fillRect(-W / 2 + 4 * u, 3 * u, 12 * u, 7.5 * u);
  c.strokeStyle = 'rgba(40,30,60,0.6)'; c.lineWidth = 1 * u;
  for (const y of [5.2, 7, 8.8]) { c.beginPath(); c.moveTo(-W / 2 + 5.5 * u, y * u); c.lineTo(-W / 2 + 14 * u, y * u); c.stroke(); }
  c.strokeStyle = INK; c.lineWidth = 2.2 * u;
  c.stroke(front); c.stroke(top); c.stroke(side);
  c.restore();
  c.restore();
}

/** Airmail stripes round the screen, a postage stamp in each corner. */
export const COURIER_BORDER: BorderStyle = { thick: 14, inset: 0, edge: airmailEdge, corner: { size: 60, draw: cornerStamp } };

// ------------------------------------------------------------------ the theme

export const COURIER_THEME: MenuTheme = {
  font: SAIRA_STENCIL_ONE,
  palette: {
    primary: ORANGE, secondary: INDIGO, board: 0x2a2238, trim: AMBER,
    label: '#fff6e6', labelStroke: INK, muted: '#b8b0d8', accent: '#ffc94a',
    heading: '#fff6e6', body: '#2a1f3c', icon: 0xfff2dc, shade: 0x0c0818,
  },
  logo: {
    fill: ['#fff6dc', '#ffd27a', '#ff8a3a', '#c4401a'],
    outline: INK,
    rim: '#fff2e0',
    depth: '#4a2470',
    size: 150,
    emblem: { draw: parcelEmblem, size: 250, overlap: 0.24 },
  },
  skin: signPainter,
  // the SHOP button (menuOption)
  pieces: [{ kind: 'button', w: SHOP_W, h: SHOP_H }],
  // dim: the backdrop's darkening (main.ts drew it as its own layer before the theme)
  frame: {
    border: COURIER_BORDER,
    notes: paintStamp,
    vignette: 0.55,
    dim: 0.4,
  },
  overlays: {
    lose: '#c8321e',
    win: '#ff8a3a',
    adColor: 0x2f7a5a,
    // the heading PlayScene passes to endGame (and the summary's)
    titles: ['runOver'],
  },
  // the shift's summary (PlayScene.finish)
  cards: SUMMARY_H.map((h) => ({ w: SUMMARY_W, h })),
};

/** The SHOP button under the difficulty switch: a street sign with the label and the stamp count. */
export function shopButton(scene: Phaser.Scene, x: number, y: number, open: () => void, stamps: () => number): { btn: SkinButton; refresh: () => void } {
  const btn = new SkinButton(scene, x, y, t('shop'), open, { width: SHOP_W, height: SHOP_H, size: 38 });
  btn.setLabelY(-14);
  const icon = scene.add.image(0, 0, STAMP_ICON).setDisplaySize(26, 26);
  const count = txt(scene, 0, 0, '', { size: 21, color: '#ffe6c0', strokeThickness: 4, stroke: INK });
  btn.add([icon, count]);
  const refresh = () => {
    btn.setText(t('shop')).fitLabel(SHOP_W - 90);
    count.setText(t('shopStamps', { n: stamps() }));
    const cw = 26 + 6 + count.width;
    icon.setPosition(-cw / 2 + 13, 25);
    count.setPosition(-cw / 2 + 32 + count.width / 2, 25);
  };
  refresh();
  return { btn, refresh };
}
