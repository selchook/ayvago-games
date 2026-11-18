// Zombie Grove's menu theme (src/core/menu-theme.ts): Rubik Wet Paint over rough, mossy boards with
// rusty nails and claw marks, a toxic-green glow on hover, a frame of thorny brambles with a skull
// caught in each corner, the how-to on a dark nailed-up board and a zombie hand rising from a
// grave under a full moon behind the logo. Everything is painted on canvas once (under the Ayvago
// intro) and cached. Also the menu's own CAMP button in the same skin.
import Phaser from 'phaser';
import { t, txt, SkinButton, type MenuTheme, type SkinPainter, type BorderStyle } from '@core';
import { RUBIK_WET_PAINT } from '@core/fonts/rubik-wet-paint';
import { COIN } from './art';
import { prebakeCamp, CAMP_PANEL } from './camp';
import { prebakePanels, CHEST_CARDS, CHOICE_CARD } from './chestui';
import { prebakePlay } from './labels';

/** The run summary's card (PlayScene.showSummary): short and tall (endless or a new hero). */
export const SUMMARY_W = 620;
export const SUMMARY_H = [372, 452] as const;
/** The CAMP button on the menu. */
const CAMP_W = 340, CAMP_H = 100;

const INK = '#0b1208';
const TOXIC = 0x9cff3a;

const css = (c: number, a = 1): string => {
  const r = (c >> 16) & 255, g = (c >> 8) & 255, b = c & 255;
  return a >= 1 ? `rgb(${r},${g},${b})` : `rgba(${r},${g},${b},${a})`;
};
/** Lightens (k > 0) or darkens (k < 0) a colour. */
const shade = (c: number, k: number): number => {
  const f = (v: number) => Math.round(k > 0 ? v + (255 - v) * k : v * (1 + k));
  return (f((c >> 16) & 255) << 16) | (f((c >> 8) & 255) << 8) | f(c & 255);
};
function rng(seed: number): () => number {
  let s = (seed >>> 0) % 2147483647 || 1;
  return () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
}

// ------------------------------------------------------------------ the boards

/** A rough board: splintered ends, slightly uneven long edges; a round piece is a stump slice. */
function boardShape(w: number, h: number, r: () => number, round: boolean): Path2D {
  const p = new Path2D();
  if (round) { p.arc(w / 2, h / 2, Math.min(w, h) / 2, 0, Math.PI * 2); return p; }
  const k = Math.min(9, h * 0.14);
  const n = Math.max(3, Math.round(w / 46));
  p.moveTo(k * 0.6, r() * 2);
  for (let i = 1; i < n; i++) p.lineTo((w * i) / n, (r() - 0.3) * 2.4);
  p.lineTo(w - k * 0.5, r() * 2);
  // the right end: splinters
  const m = Math.max(3, Math.round(h / 14));
  for (let i = 1; i < m; i++) p.lineTo(w - r() * k, (h * i) / m);
  p.lineTo(w - k * 0.6, h - r() * 2);
  for (let i = n - 1; i > 0; i--) p.lineTo((w * i) / n, h + (r() - 0.7) * 2.4);
  p.lineTo(k * 0.5, h - r() * 2);
  for (let i = m - 1; i > 0; i--) p.lineTo(r() * k, (h * i) / m);
  p.closePath();
  return p;
}

/** Wood grain, knots and the seams between planks. */
function grain(c: CanvasRenderingContext2D, w: number, h: number, color: number, r: () => number, planks: number): void {
  const dark = css(shade(color, -0.55));
  for (let i = 0, n = Math.round(h / 3.5); i < n; i++) {
    const y0 = r() * h, amp = 0.8 + r() * 2.2, ph = r() * 6, fr = 0.012 + r() * 0.02;
    c.strokeStyle = r() < 0.2 ? 'rgba(230,240,210,0.10)' : dark;
    c.globalAlpha = 0.12 + r() * 0.2;
    c.lineWidth = 0.7 + r() * 1.5;
    c.beginPath();
    for (let x = -4; x <= w + 4; x += 7) {
      const y = y0 + Math.sin(x * fr + ph) * amp;
      x < 0 ? c.moveTo(x, y) : c.lineTo(x, y);
    }
    c.stroke();
  }
  c.globalAlpha = 1;
  const knots = w > 150 ? 1 + Math.floor(r() * 2) : r() < 0.4 ? 1 : 0;
  for (let i = 0; i < knots; i++) {
    const x = w * (0.18 + r() * 0.64), y = h * (0.25 + r() * 0.5), rx = 4 + r() * 6, ry = rx * 0.45;
    for (let k = 3; k >= 0; k--) {
      c.strokeStyle = css(shade(color, -0.6), 0.2 + k * 0.05);
      c.lineWidth = 1.1;
      c.beginPath(); c.ellipse(x, y, rx + k * 3, ry + k * 1.6, 0, 0, Math.PI * 2); c.stroke();
    }
    c.fillStyle = css(shade(color, -0.65), 0.6);
    c.beginPath(); c.ellipse(x, y, rx * 0.5, ry * 0.5, 0, 0, Math.PI * 2); c.fill();
  }
  for (let b = 1; b < planks; b++) {
    const y = (h * b) / planks + (r() - 0.5) * 2;
    c.fillStyle = 'rgba(0,0,0,0.55)'; c.fillRect(0, y - 1.5, w, 3);
    c.fillStyle = 'rgba(220,235,200,0.12)'; c.fillRect(0, y + 1.5, w, 1.2);
  }
}

/** Moss: clumps of small green blobs, thickest on the top edge and the corners. */
function moss(c: CanvasRenderingContext2D, w: number, h: number, r: () => number, amount: number): void {
  const greens = ['#2f5a1c', '#3f7424', '#5a8f2e', '#78a83a', '#24461a'];
  const spots: [number, number][] = [[0, 0], [w, h], [w * (0.3 + r() * 0.4), 0]];
  if (w > 200) spots.push([w, 0], [0, h]);
  for (const [sx, sy] of spots) {
    const n = Math.round((10 + r() * 14) * amount);
    for (let i = 0; i < n; i++) {
      const a = r() * Math.PI * 2, d = r() * r() * Math.min(26, h * 0.42);
      const x = sx + Math.cos(a) * d * 1.6, y = sy + Math.sin(a) * d;
      c.fillStyle = greens[Math.floor(r() * greens.length)];
      c.globalAlpha = 0.55 + r() * 0.4;
      c.beginPath(); c.arc(x, y, 1.2 + r() * 3.4, 0, Math.PI * 2); c.fill();
    }
  }
  c.globalAlpha = 1;
}

/** Three claw marks gouged into the wood (a dark groove with a light lower lip). */
function claws(c: CanvasRenderingContext2D, x: number, y: number, len: number, ang: number): void {
  c.save();
  c.translate(x, y); c.rotate(ang);
  c.lineCap = 'round';
  for (let i = 0; i < 3; i++) {
    const oy = (i - 1) * len * 0.16, l = len * (i === 1 ? 1 : 0.86);
    const path = () => { c.beginPath(); c.moveTo(-l / 2, oy); c.quadraticCurveTo(0, oy - len * 0.06, l / 2, oy + len * 0.02); };
    c.strokeStyle = 'rgba(225,235,200,0.22)'; c.lineWidth = 2.6; c.save(); c.translate(0, 1.6); path(); c.stroke(); c.restore();
    c.strokeStyle = 'rgba(8,10,4,0.7)'; c.lineWidth = 2.2; path(); c.stroke();
  }
  c.restore();
}

/** A rusty nail head with a rust streak running down from it. */
function nail(c: CanvasRenderingContext2D, x: number, y: number, rad: number): void {
  c.save();
  const streak = c.createLinearGradient(0, y, 0, y + rad * 6);
  streak.addColorStop(0, 'rgba(140,70,20,0.45)'); streak.addColorStop(1, 'rgba(140,70,20,0)');
  c.fillStyle = streak;
  c.fillRect(x - rad * 0.5, y, rad, rad * 6);
  c.fillStyle = 'rgba(0,0,0,0.5)';
  c.beginPath(); c.arc(x + rad * 0.25, y + rad * 0.35, rad * 1.1, 0, Math.PI * 2); c.fill();
  const g = c.createRadialGradient(x - rad * 0.35, y - rad * 0.4, rad * 0.1, x, y, rad);
  g.addColorStop(0, '#b8a890'); g.addColorStop(0.45, '#6a5a48'); g.addColorStop(1, '#2a1e14');
  c.fillStyle = g;
  c.beginPath(); c.arc(x, y, rad, 0, Math.PI * 2); c.fill();
  c.fillStyle = 'rgba(170,80,20,0.55)';
  c.beginPath(); c.arc(x + rad * 0.3, y + rad * 0.2, rad * 0.45, 0, Math.PI * 2); c.fill();
  c.restore();
}

/**
 * The grove skin: rough weathered boards (grey-brown wood, the PLAY board painted moss green and
 * chipped), moss in the corners, claw marks, rusty nails; hover and the selected segment glow
 * toxic green, a pressed board sinks.
 */
export const grovePainter: SkinPainter = (c, kind, w, h, o) => {
  const P = o.palette, r = rng(o.seed);
  const sunk = o.state === 'down' || o.state === 'off' || kind === 'track';
  const color = o.state === 'off' ? shade(o.color, -0.4) : kind === 'track' ? shade(o.color, -0.25) : o.color;
  const round = kind === 'round';
  const shape = boardShape(w, h, r, round);
  c.save();
  c.translate(0, o.state === 'down' ? 3 : 0);
  // the glow under a hovered or selected piece
  if (o.state === 'over' || o.state === 'on') {
    c.save();
    c.shadowColor = css(TOXIC, o.state === 'over' ? 0.95 : 0.7);
    c.shadowBlur = o.state === 'over' ? 18 : 10;
    c.fillStyle = css(TOXIC, 0.9);
    c.fill(shape);
    c.restore();
  }
  c.save();
  c.shadowColor = 'rgba(0,0,0,0.6)';
  c.shadowBlur = sunk ? 3 : 10;
  c.shadowOffsetY = sunk ? 1 : 6;
  c.fillStyle = '#000';
  c.fill(shape);
  c.restore();
  const body = c.createLinearGradient(0, 0, 0, h);
  body.addColorStop(0, css(shade(color, sunk ? -0.12 : 0.14)));
  body.addColorStop(0.55, css(color));
  body.addColorStop(1, css(shade(color, -0.35)));
  c.fillStyle = body;
  c.fill(shape);
  c.save();
  c.clip(shape);
  if (round) {
    // a stump slice: the year rings and a crack
    const cx = w / 2, cy = h / 2, R = Math.min(w, h) / 2;
    for (let i = 1; i < 6; i++) {
      c.strokeStyle = css(shade(color, -0.5), 0.35);
      c.lineWidth = 1.2;
      c.beginPath(); c.arc(cx + (r() - 0.5) * 2, cy + (r() - 0.5) * 2, (R * i) / 6, 0, Math.PI * 2); c.stroke();
    }
    c.strokeStyle = 'rgba(0,0,0,0.5)'; c.lineWidth = 1.6;
    c.beginPath(); c.moveTo(cx, cy); c.lineTo(cx + R * 0.7, cy - R * 0.5); c.stroke();
  } else {
    const planks = (kind === 'button' || kind === 'board') && h >= 70 ? 2 : 1;
    grain(c, w, h, color, r, planks);
  }
  // painted boards: the paint chipped off near the edges, showing the grey wood
  if (kind === 'button' && o.color === P.primary) {
    for (let i = 0; i < 12; i++) {
      const edge = r() < 0.6;
      const x = edge ? r() * w : r() < 0.5 ? r() * 16 : w - r() * 16;
      const y = edge ? (r() < 0.5 ? r() * 8 : h - r() * 8) : r() * h;
      c.fillStyle = css(shade(P.secondary, 0.05), 0.75);
      c.beginPath();
      for (let k = 0; k < 7; k++) {
        const a = (k / 7) * Math.PI * 2, rr = 2 + r() * 5;
        const px = x + Math.cos(a) * rr * 1.7, py = y + Math.sin(a) * rr;
        k ? c.lineTo(px, py) : c.moveTo(px, py);
      }
      c.fill();
    }
  }
  if (!sunk) moss(c, w, h, r, kind === 'plate' ? 0.45 : kind === 'round' ? 0.3 : 1);
  if ((kind === 'button' && w >= 200) || kind === 'board') claws(c, w * (0.62 + r() * 0.16), h * 0.5, Math.min(h * 0.9, 74), -0.5 - r() * 0.3);
  // bevel: dark sides, a light top edge, a dark bottom edge (a sunk piece: shadow under its top)
  const side = c.createLinearGradient(0, 0, w, 0);
  side.addColorStop(0, 'rgba(0,0,0,0.32)'); side.addColorStop(0.08, 'rgba(0,0,0,0)');
  side.addColorStop(0.92, 'rgba(0,0,0,0)'); side.addColorStop(1, 'rgba(0,0,0,0.36)');
  c.fillStyle = side; c.fillRect(0, 0, w, h);
  if (sunk) {
    const top = c.createLinearGradient(0, 0, 0, 16);
    top.addColorStop(0, 'rgba(0,0,0,0.6)'); top.addColorStop(1, 'rgba(0,0,0,0)');
    c.fillStyle = top; c.fillRect(0, 0, w, 16);
  } else {
    c.fillStyle = 'rgba(230,240,210,0.22)'; c.fillRect(0, 0, w, 3);
    c.fillStyle = 'rgba(0,0,0,0.4)'; c.fillRect(0, h - 5, w, 5);
  }
  c.restore();
  c.lineWidth = 3;
  c.strokeStyle = css(shade(color, -0.8));
  c.stroke(shape);
  // the rim of the glow, crisp over the outline
  if (o.state === 'over' || o.state === 'on') {
    c.lineWidth = o.state === 'over' ? 3 : 2.5;
    c.strokeStyle = css(shade(TOXIC, 0.2));
    c.stroke(shape);
  }
  // nails
  const nr = Math.max(3, Math.min(5, h * 0.055));
  if (kind === 'button' || kind === 'board') {
    const ins = Math.max(12, Math.min(18, h * 0.2));
    for (const x of [ins + 2, w - ins - 2]) for (const y of h >= 70 ? [ins, h - ins] : [h / 2]) nail(c, x, y, nr);
  } else if (kind === 'plate' && w >= 60) {
    const m = 10;
    for (const [x, y] of [[m, m], [w - m, m], [m, h - m], [w - m, h - m]]) nail(c, x, y, 2.6);
  } else if (round) nail(c, w / 2, h / 2, nr * 0.8);
  if (o.state === 'down') { c.fillStyle = 'rgba(0,0,0,0.18)'; c.fill(shape); }
  c.restore();
};

/** The how-to and the pause / result card: dark planks nailed together, moss and claw marks. */
export function paintNotice(c: CanvasRenderingContext2D, w: number, h: number): void {
  const r = rng(w * 7 + h);
  const color = 0x2c241b;
  const shape = boardShape(w, h, r, false);
  c.save();
  c.shadowColor = 'rgba(0,0,0,0.65)'; c.shadowBlur = 16; c.shadowOffsetY = 8;
  c.fillStyle = '#000'; c.fill(shape);
  c.restore();
  const body = c.createLinearGradient(0, 0, 0, h);
  body.addColorStop(0, css(shade(color, 0.12))); body.addColorStop(1, css(shade(color, -0.25)));
  c.fillStyle = body; c.fill(shape);
  c.save();
  c.clip(shape);
  const planks = Math.max(2, Math.round(h / 70));
  grain(c, w, h, color, r, planks);
  // a faint toxic glow seeping in at the edges, darker in the middle for the text
  const glow = c.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.3, w / 2, h / 2, Math.max(w, h) * 0.7);
  glow.addColorStop(0, 'rgba(0,0,0,0.18)'); glow.addColorStop(0.7, 'rgba(0,0,0,0)'); glow.addColorStop(1, css(TOXIC, 0.1));
  c.fillStyle = glow; c.fillRect(0, 0, w, h);
  moss(c, w, h, r, 1.4);
  claws(c, w - 70, h - 54, 70, -0.6);
  claws(c, 64, 52, 54, 0.4);
  c.restore();
  c.lineWidth = 3.5;
  c.strokeStyle = '#0a0805';
  c.stroke(shape);
  c.lineWidth = 1.5;
  c.strokeStyle = css(TOXIC, 0.35);
  c.stroke(shape);
  for (let b = 0; b < planks; b++) {
    const y = (h * (b + 0.5)) / planks;
    nail(c, 16, y, 4.5);
    nail(c, w - 16, y, 4.5);
  }
}

// ------------------------------------------------------------------ the frame


/** One thorny bramble: a vine wound along the strip, thorns, a few dead leaves and glowing spores. */
const brambleEdge: BorderStyle['edge'] = (c, len, thick) => {
  const r = rng(len * 3);
  // a soft shade at the very edge, so the vines read over a bright backdrop
  const sh = c.createLinearGradient(0, 0, 0, thick);
  sh.addColorStop(0, 'rgba(4,8,3,0.65)'); sh.addColorStop(1, 'rgba(4,8,3,0)');
  c.fillStyle = sh; c.fillRect(0, 0, len, thick);
  const vine = (y0: number, amp: number, fr: number, ph: number, lw: number) => {
    const pts: [number, number][] = [];
    for (let x = -6; x <= len + 6; x += 6) pts.push([x, y0 + Math.sin(x * fr + ph) * amp + Math.sin(x * fr * 2.7 + ph * 2) * amp * 0.3]);
    const line = () => { c.beginPath(); pts.forEach(([x, y], i) => (i ? c.lineTo(x, y) : c.moveTo(x, y))); };
    c.lineCap = 'round'; c.lineJoin = 'round';
    c.strokeStyle = '#0d0905'; c.lineWidth = lw + 3; line(); c.stroke();
    c.strokeStyle = '#4e3620'; c.lineWidth = lw; line(); c.stroke();
    c.strokeStyle = 'rgba(190,160,110,0.55)'; c.lineWidth = Math.max(1, lw * 0.3);
    c.save(); c.translate(0, -lw * 0.25); line(); c.stroke(); c.restore();
    return pts;
  };
  const a = vine(thick * 0.34, thick * 0.12, 0.035, r() * 6, 6);
  const b = vine(thick * 0.42, thick * 0.18, 0.052, r() * 6, 3.6);
  // thorns, alternating sides
  for (const [pts, every] of [[a, 3], [b, 4]] as const) {
    for (let i = 2; i < pts.length - 1; i += every) {
      const [x, y] = pts[i], [x2, y2] = pts[i + 1];
      const ang = Math.atan2(y2 - y, x2 - x) + (i % 2 ? -1 : 1) * (Math.PI / 2 - 0.5);
      const L = 5 + r() * 5;
      c.fillStyle = '#120c06';
      c.beginPath();
      c.moveTo(x - Math.cos(ang - Math.PI / 2) * 2.2, y - Math.sin(ang - Math.PI / 2) * 2.2);
      c.lineTo(x + Math.cos(ang) * L, y + Math.sin(ang) * L);
      c.lineTo(x + Math.cos(ang - Math.PI / 2) * 2.2, y + Math.sin(ang - Math.PI / 2) * 2.2);
      c.closePath(); c.fill();
      c.fillStyle = 'rgba(200,190,150,0.6)';
      c.beginPath(); c.arc(x + Math.cos(ang) * L * 0.85, y + Math.sin(ang) * L * 0.85, 0.8, 0, Math.PI * 2); c.fill();
    }
  }
  // dead leaves
  for (let x = 30 + r() * 40; x < len - 20; x += 70 + r() * 60) {
    const [, y] = a[Math.min(a.length - 1, Math.round((x + 6) / 6))];
    c.save();
    c.translate(x, y); c.rotate((r() - 0.5) * 2.4);
    c.fillStyle = r() < 0.5 ? '#4a5a22' : '#6a4a1a';
    c.strokeStyle = '#140e06'; c.lineWidth = 1.2;
    c.beginPath(); c.ellipse(7, 0, 7, 3.4, 0, 0, Math.PI * 2); c.fill(); c.stroke();
    c.beginPath(); c.moveTo(0, 0); c.lineTo(13, 0); c.stroke();
    c.restore();
  }
  // glowing spores drifting by the vines
  for (let x = 40 + r() * 50; x < len - 20; x += 90 + r() * 70) {
    const y = thick * (0.55 + r() * 0.3);
    const g = c.createRadialGradient(x, y, 0, x, y, 7);
    g.addColorStop(0, 'rgba(220,255,160,0.95)'); g.addColorStop(0.35, css(TOXIC, 0.6)); g.addColorStop(1, css(TOXIC, 0));
    c.fillStyle = g;
    c.beginPath(); c.arc(x, y, 7, 0, Math.PI * 2); c.fill();
  }
};

/** A small skull caught in a knot of brambles, its eyes glowing (the top-left corner). */
function cornerSkull(c: CanvasRenderingContext2D, size: number): void {
  const u = size / 100;
  c.save();
  // the knot: a few loops of vine round the corner
  c.lineCap = 'round';
  for (const [rad, lw, a0, a1] of [[62, 7, -0.2, 1.8], [48, 5, 0.1, 1.5], [70, 4, 0.3, 1.2]] as const) {
    c.strokeStyle = '#0d0905'; c.lineWidth = (lw + 2.5) * u;
    c.beginPath(); c.arc(0, 0, rad * u, a0, a1); c.stroke();
    c.strokeStyle = '#3d2a18'; c.lineWidth = lw * u;
    c.beginPath(); c.arc(0, 0, rad * u, a0, a1); c.stroke();
  }
  // the skull, tilted, at the knot
  c.translate(40 * u, 40 * u);
  c.rotate(-0.25);
  const glow = c.createRadialGradient(0, 0, 4 * u, 0, 0, 34 * u);
  glow.addColorStop(0, css(TOXIC, 0.35)); glow.addColorStop(1, css(TOXIC, 0));
  c.fillStyle = glow; c.beginPath(); c.arc(0, 0, 34 * u, 0, Math.PI * 2); c.fill();
  c.lineWidth = 2.4 * u; c.strokeStyle = INK;
  const head = new Path2D();
  head.moveTo(-16 * u, 2 * u);
  head.bezierCurveTo(-18 * u, -16 * u, -9 * u, -22 * u, 0, -22 * u);
  head.bezierCurveTo(9 * u, -22 * u, 18 * u, -16 * u, 16 * u, 2 * u);
  head.quadraticCurveTo(14 * u, 8 * u, 10 * u, 9 * u);
  head.lineTo(9 * u, 16 * u);
  head.quadraticCurveTo(0, 20 * u, -9 * u, 16 * u);
  head.lineTo(-10 * u, 9 * u);
  head.quadraticCurveTo(-14 * u, 8 * u, -16 * u, 2 * u);
  head.closePath();
  const bone = c.createRadialGradient(-5 * u, -10 * u, 1 * u, 0, -2 * u, 24 * u);
  bone.addColorStop(0, '#f6f2dc'); bone.addColorStop(0.7, '#cfc6a0'); bone.addColorStop(1, '#8f8460');
  c.fillStyle = bone; c.fill(head); c.stroke(head);
  c.fillStyle = INK;
  for (const s of [-1, 1]) { c.beginPath(); c.ellipse(s * 6.6 * u, -3 * u, 4.8 * u, 5.6 * u, s * 0.25, 0, Math.PI * 2); c.fill(); }
  c.save();
  c.shadowColor = css(TOXIC, 1); c.shadowBlur = 6 * u;
  c.fillStyle = '#c8ff6a';
  for (const s of [-1, 1]) { c.beginPath(); c.arc(s * 6.4 * u, -2.4 * u, 1.9 * u, 0, Math.PI * 2); c.fill(); }
  c.restore();
  c.fillStyle = INK;
  c.beginPath(); c.moveTo(0, 3 * u); c.lineTo(-2.5 * u, 8 * u); c.lineTo(2.5 * u, 8 * u); c.closePath(); c.fill();
  c.lineWidth = 1.2 * u;
  for (const x of [-5, -1.7, 1.7, 5]) { c.beginPath(); c.moveTo(x * u, 10.5 * u); c.lineTo(x * u, 15.5 * u); c.stroke(); }
  c.restore();
  // a vine over the skull, so it sits caught in it
  c.save();
  c.strokeStyle = '#0d0905'; c.lineWidth = 7 * u; c.lineCap = 'round';
  c.beginPath(); c.moveTo(6 * u, 66 * u); c.quadraticCurveTo(30 * u, 52 * u, 72 * u, 10 * u); c.stroke();
  c.strokeStyle = '#3d2a18'; c.lineWidth = 4.5 * u;
  c.beginPath(); c.moveTo(6 * u, 66 * u); c.quadraticCurveTo(30 * u, 52 * u, 72 * u, 10 * u); c.stroke();
  c.restore();
}

// ------------------------------------------------------------------ the emblem

/** A zombie hand bursting out of a grave mound under a full moon, bare twigs at the sides. */
export function handEmblem(c: CanvasRenderingContext2D, size: number): void {
  const u = size / 100;
  c.save();
  c.translate(size / 2, size / 2);
  // a sickly green haze
  const halo = c.createRadialGradient(0, 0, 8 * u, 0, 0, 50 * u);
  halo.addColorStop(0, css(TOXIC, 0.28)); halo.addColorStop(1, css(TOXIC, 0));
  c.fillStyle = halo; c.fillRect(-50 * u, -50 * u, 100 * u, 100 * u);
  // the full moon
  c.save();
  c.shadowColor = 'rgba(220,255,170,0.8)'; c.shadowBlur = 16 * u;
  const moon = c.createRadialGradient(-2 * u, -24 * u, 3 * u, 4 * u, -16 * u, 32 * u);
  moon.addColorStop(0, '#fbffe8'); moon.addColorStop(0.65, '#dfe9b0'); moon.addColorStop(1, '#a9bd78');
  c.fillStyle = moon;
  c.beginPath(); c.arc(4 * u, -16 * u, 31 * u, 0, Math.PI * 2); c.fill();
  c.restore();
  c.fillStyle = 'rgba(110,130,70,0.22)';
  for (const [x, y, rr] of [[-8, -26, 6], [14, -6, 8], [18, -30, 4.5], [-6, -4, 3.5], [24, -18, 3]]) {
    c.beginPath(); c.arc(x * u, y * u, rr * u, 0, Math.PI * 2); c.fill();
  }
  // bare twigs reaching in from the sides
  c.strokeStyle = '#0b0805'; c.lineCap = 'round';
  const twig = (pts: number[][], lw: number) => {
    c.lineWidth = lw * u;
    c.beginPath(); pts.forEach(([x, y], i) => (i ? c.lineTo(x * u, y * u) : c.moveTo(x * u, y * u))); c.stroke();
  };
  twig([[-50, -30], [-36, -34], [-26, -44], [-20, -46]], 3.4);
  twig([[-36, -34], [-30, -26], [-22, -24]], 2);
  twig([[50, -40], [38, -36], [30, -44]], 3);
  twig([[38, -36], [32, -28], [24, -30]], 1.8);
  // the grave mound
  const soil = c.createLinearGradient(0, 26 * u, 0, 48 * u);
  soil.addColorStop(0, '#4a3420'); soil.addColorStop(1, '#1a120a');
  c.fillStyle = soil;
  c.beginPath(); c.ellipse(0, 40 * u, 46 * u, 15 * u, 0, Math.PI, 0); c.lineTo(46 * u, 48 * u); c.lineTo(-46 * u, 48 * u); c.closePath(); c.fill();
  c.strokeStyle = '#0b0805'; c.lineWidth = 2 * u;
  c.beginPath(); c.ellipse(0, 40 * u, 46 * u, 15 * u, 0, Math.PI, 0); c.stroke();
  // the arm: outlines first (one dark silhouette), then the rotten skin
  const arm = new Path2D();
  arm.moveTo(-8 * u, 34 * u);
  arm.quadraticCurveTo(-9 * u, 14 * u, -7.5 * u, -2 * u);
  arm.lineTo(6.5 * u, -2 * u);
  arm.quadraticCurveTo(8 * u, 14 * u, 9 * u, 34 * u);
  arm.closePath();
  const palm = new Path2D();
  palm.moveTo(-10 * u, -2 * u);
  palm.quadraticCurveTo(-12 * u, -14 * u, -8 * u, -18 * u);
  palm.lineTo(9 * u, -18 * u);
  palm.quadraticCurveTo(12 * u, -10 * u, 9 * u, -2 * u);
  palm.closePath();
  const fingers: number[][][] = [
    [[-7, -16], [-12, -27], [-17, -36]],
    [[-2.5, -18], [-4, -32], [-5, -44]],
    [[2.5, -18], [4, -32], [6, -42]],
    [[7, -15], [12, -25], [17, -32]],
    [[-9, -6], [-17, -12], [-23, -19]],
  ];
  const fingerLine = (f: number[][]) => {
    c.beginPath(); f.forEach(([x, y], i) => (i ? c.lineTo(x * u, y * u) : c.moveTo(x * u, y * u)));
  };
  c.lineJoin = 'round'; c.lineCap = 'round';
  c.strokeStyle = '#101a0a';
  c.lineWidth = 4 * u; c.stroke(arm); c.stroke(palm);
  c.lineWidth = 8 * u;
  for (const f of fingers) { fingerLine(f); c.stroke(); }
  const skin = c.createLinearGradient(-12 * u, 0, 12 * u, 0);
  skin.addColorStop(0, '#a6c97a'); skin.addColorStop(0.6, '#86ad58'); skin.addColorStop(1, '#5d8338');
  c.fillStyle = skin; c.strokeStyle = skin;
  c.fill(arm); c.fill(palm);
  c.lineWidth = 5 * u;
  for (const f of fingers) { fingerLine(f); c.stroke(); }
  // knuckles, rot spots, the dark nails
  c.fillStyle = 'rgba(40,60,20,0.45)';
  for (const [x, y, rr] of [[-3, -8, 2.4], [4, 6, 3], [-4, 18, 2.2], [3, -13, 1.6]]) { c.beginPath(); c.arc(x * u, y * u, rr * u, 0, Math.PI * 2); c.fill(); }
  c.fillStyle = '#1c2210';
  for (const f of fingers) {
    const [x, y] = f[f.length - 1], [px, py] = f[f.length - 2];
    const a = Math.atan2(y - py, x - px);
    c.beginPath();
    c.moveTo((x + Math.cos(a) * 3.6) * u, (y + Math.sin(a) * 3.6) * u);
    c.lineTo((x + Math.cos(a + 1.9) * 2.4) * u, (y + Math.sin(a + 1.9) * 2.4) * u);
    c.lineTo((x + Math.cos(a - 1.9) * 2.4) * u, (y + Math.sin(a - 1.9) * 2.4) * u);
    c.closePath(); c.fill();
  }
  // the torn sleeve round the forearm
  const cloth = new Path2D();
  cloth.moveTo(-10 * u, 30 * u);
  cloth.lineTo(-10.5 * u, 14 * u);
  for (const [x, y] of [[-7, 9], [-4, 13], [-1, 8], [2, 12], [5, 7], [8, 12]]) cloth.lineTo(x * u, y * u);
  cloth.lineTo(10.5 * u, 14 * u);
  cloth.lineTo(11 * u, 30 * u);
  cloth.closePath();
  c.fillStyle = '#4a3058'; c.fill(cloth);
  c.strokeStyle = '#140a1a'; c.lineWidth = 2 * u; c.stroke(cloth);
  c.strokeStyle = 'rgba(255,255,255,0.15)'; c.lineWidth = 1.2 * u;
  c.beginPath(); c.moveTo(-7 * u, 18 * u); c.lineTo(-7 * u, 28 * u); c.moveTo(3 * u, 16 * u); c.lineTo(4 * u, 28 * u); c.stroke();
  // soil heaped over the wrist, clods flying
  c.fillStyle = '#3a2816';
  c.beginPath(); c.ellipse(0, 31 * u, 20 * u, 6 * u, 0, 0, Math.PI * 2); c.fill();
  c.strokeStyle = '#0b0805'; c.lineWidth = 1.6 * u; c.stroke();
  for (const [x, y, rr] of [[-22, 22, 2.6], [20, 18, 2.2], [-15, 12, 1.6], [26, 26, 1.8], [-28, 30, 1.4]]) {
    c.fillStyle = '#4a3420'; c.beginPath(); c.arc(x * u, y * u, rr * u, 0, Math.PI * 2); c.fill(); c.stroke();
  }
  // grass tufts on the mound
  c.strokeStyle = '#3f6a22'; c.lineWidth = 1.6 * u;
  for (const x of [-38, -30, -20, 22, 30, 38]) {
    const y = 40 - 15 * Math.sqrt(Math.max(0, 1 - (x / 46) ** 2));
    for (const d of [-2, 0, 2]) { c.beginPath(); c.moveTo(x * u, (y + 1) * u); c.lineTo((x + d * 1.4) * u, (y - 5) * u); c.stroke(); }
  }
  c.restore();
}

/** Thorny brambles round the screen, a skull caught in each corner. */
export const GROVE_BORDER: BorderStyle = { thick: 32, inset: 0, edge: brambleEdge, corner: { size: 92, draw: cornerSkull } };

// ------------------------------------------------------------------ the theme

export const GROVE_THEME: MenuTheme = {
  font: RUBIK_WET_PAINT,
  palette: {
    primary: 0x557f2a, secondary: 0x5d5040, board: 0x241d16, trim: TOXIC,
    label: '#eef3d6', labelStroke: '#0b1208', muted: '#9da38a', accent: '#c8ff66',
    heading: '#b6ff5a', body: '#e8e4cf', icon: 0xeef3d6, shade: 0x040a05,
  },
  logo: {
    fill: ['#f6ffdc', '#c8ff6a', '#6cc23a', '#2c6612'],
    outline: '#081006',
    rim: '#3a0c08',
    depth: '#1a330c',
    size: 150,
    upper: true,
    emblem: { draw: handEmblem, size: 250, overlap: 0.26 },
  },
  skin: grovePainter,
  // the CAMP button (menuOption)
  pieces: [{ kind: 'button', w: CAMP_W, h: CAMP_H }],
  // dim: the backdrop's darkening (main.ts drew it as its own layer before the theme)
  frame: {
    border: GROVE_BORDER,
    notes: paintNotice,
    vignette: 0.62,
    dim: 0.38,
  },
  overlays: {
    lose: '#ff6a52',
    win: '#c8ff66',
    adColor: 0x2f6b3a,
    // the headings PlayScene.finish passes to endGame, and the summary's
    titles: ['runOver', 'survived', 'endlessOver', 'youFell'],
  },
  // the night's summary (PlayScene.showSummary), the camp's notice board, the gold chest and the
  // dawn's choice
  cards: [...SUMMARY_H.map((h) => ({ w: SUMMARY_W, h })), CAMP_PANEL, ...CHEST_CARDS, CHOICE_CARD],
  // the camp's tabs, tiles, buttons and labels, the chest's and the dawn's (camp.ts, chestui.ts)
  prebake: (scene) => { prebakeCamp(scene); prebakePanels(scene); prebakePlay(scene); },
};

/**
 * The CAMP button under the difficulty switch: a board of the skin with the label and the coin
 * purse under it. Returns a refresh for the purse.
 */
export function campButton(scene: Phaser.Scene, x: number, y: number, open: () => void, coins: () => number): { btn: SkinButton; refresh: () => void } {
  const btn = new SkinButton(scene, x, y, t('camp'), open, { width: CAMP_W, height: CAMP_H, size: 40 });
  btn.setLabelY(-14);
  const coin = scene.add.image(0, 0, COIN).setDisplaySize(26, 26);
  const count = txt(scene, 0, 0, '', { size: 22, color: '#f0e6b0', strokeThickness: 4, stroke: INK });
  btn.add([coin, count]);
  const refresh = () => {
    btn.setText(t('camp')).fitLabel(CAMP_W - 80);
    count.setText(String(coins()));
    const cw = 26 + 6 + count.width;
    coin.setPosition(-cw / 2 + 13, 26);
    count.setPosition(-cw / 2 + 32 + count.width / 2, 26);
  };
  refresh();
  return { btn, refresh };
}
