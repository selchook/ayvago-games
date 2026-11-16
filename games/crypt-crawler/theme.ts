// Crypt Crawler's menu theme (src/core/menu-theme.ts): a dark dungeon by torchlight. New Rocker on
// iron-banded slabs (rough crypt stone, or old oak for the main buttons, crossed by riveted iron
// bands with corner brackets), a torch-orange glow on hover; the how-to and the pause / result card
// on a carved stone plaque with iron corners and a rune border; an iron chain round the screen with
// a skull in each corner, and the logo over a skull on an iron-bound crypt door between two
// torches. Everything is painted on canvas once (under the Ayvago intro) and cached.
import { type MenuTheme, type SkinPainter, type BorderStyle } from '@core';
import { NEW_ROCKER } from '@core/fonts/new-rocker';

export const OAK = 0x7a3a22, CRYPT = 0x4a4552, NIGHT = 0x1c1820, TORCH = 0xf0a040, MOSSY = 0x3a7a4a;
export const BONE = '#ece0c4';
export const LABEL_STROKE = '#120c10';

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

/** A domed iron rivet. */
function rivet(c: CanvasRenderingContext2D, x: number, y: number, r: number): void {
  c.save();
  c.fillStyle = 'rgba(0,0,0,0.5)';
  c.beginPath(); c.arc(x + r * 0.2, y + r * 0.35, r * 1.1, 0, Math.PI * 2); c.fill();
  const g = c.createRadialGradient(x - r * 0.35, y - r * 0.4, r * 0.1, x, y, r);
  g.addColorStop(0, '#b8b4c0'); g.addColorStop(0.5, '#5a5864'); g.addColorStop(1, '#1a1820');
  c.fillStyle = g; c.beginPath(); c.arc(x, y, r, 0, Math.PI * 2); c.fill();
  c.restore();
}

/** An iron band across (x, y) to (x, y + h), `bw` wide, riveted top and bottom. */
function band(c: CanvasRenderingContext2D, x: number, y: number, bw: number, h: number, rv: number): void {
  const g = c.createLinearGradient(x, 0, x + bw, 0);
  g.addColorStop(0, '#1e1c22'); g.addColorStop(0.4, '#5c5a66'); g.addColorStop(0.6, '#45434e'); g.addColorStop(1, '#16141a');
  c.fillStyle = g; c.fillRect(x, y, bw, h);
  c.strokeStyle = 'rgba(0,0,0,0.75)'; c.lineWidth = 1.2; c.strokeRect(x, y, bw, h);
  // rust specks
  c.fillStyle = 'rgba(150,70,30,0.35)';
  for (let i = 0; i < h / 6; i++) c.fillRect(x + ((i * 7) % bw), y + ((i * 13) % h), 1.5, 1.5);
  rivet(c, x + bw / 2, y + rv * 2.2, rv);
  rivet(c, x + bw / 2, y + h - rv * 2.2, rv);
}

/** Rough stone: speckles, darker blotches, a few cracks. */
function stone(c: CanvasRenderingContext2D, w: number, h: number, col: number, r: () => number): void {
  for (let i = 0; i < (w * h) / 22; i++) {
    c.fillStyle = r() < 0.5 ? css(shade(col, 0.3), 0.16) : css(shade(col, -0.5), 0.22);
    const s = 1 + r() * 2.2; c.fillRect(r() * w, r() * h, s, s);
  }
  for (let i = 0; i < 3 + w / 120; i++) {
    c.fillStyle = css(shade(col, -0.35), 0.18);
    c.beginPath(); c.ellipse(r() * w, r() * h, 10 + r() * 26, 5 + r() * 12, r() * 3, 0, Math.PI * 2); c.fill();
  }
  c.strokeStyle = css(shade(col, -0.7), 0.6); c.lineWidth = 1;
  for (let i = 0; i < (w > 200 ? 2 : 1); i++) {
    let x = w * (0.2 + r() * 0.6), y = 0;
    c.beginPath(); c.moveTo(x, y);
    for (let k = 0; k < 4; k++) { x += (r() - 0.5) * 16; y += h * 0.12 + r() * 6; c.lineTo(x, y); }
    c.stroke();
  }
}

/** Old oak: dark grain lines and a few knots. */
function oak(c: CanvasRenderingContext2D, w: number, h: number, col: number, r: () => number): void {
  for (let i = 0, n = Math.round(h / 3.2); i < n; i++) {
    const y0 = r() * h, amp = 0.8 + r() * 2, ph = r() * 6, fr = 0.012 + r() * 0.02;
    c.strokeStyle = css(shade(col, -0.6)); c.globalAlpha = 0.15 + r() * 0.2; c.lineWidth = 0.8 + r() * 1.4;
    c.beginPath();
    for (let x = -4; x <= w + 4; x += 7) { const y = y0 + Math.sin(x * fr + ph) * amp; x < 0 ? c.moveTo(x, y) : c.lineTo(x, y); }
    c.stroke();
  }
  c.globalAlpha = 1;
}

/**
 * The iron-banded skin: rough crypt stone (old oak on the main buttons) with a chiselled bevel,
 * riveted iron bands near both ends of the big buttons and iron corner brackets on plates; hover
 * lights it with a torch-orange glow, the selected segment gets an amber rim, a press sinks it.
 * Boards and the switch's track are dark crypt stone.
 */
export const ironSkin: SkinPainter = (c, kind, w, h, o) => {
  const P = o.palette, r = rng(o.seed);
  const sunk = o.state === 'down' || o.state === 'off' || kind === 'track';
  const off = o.state === 'off';
  const round = kind === 'round';
  const col = off ? shade(o.color, -0.4) : o.color;
  const R = round ? Math.min(w, h) / 2 : Math.min(8, h * 0.12);
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
    c.shadowColor = css(TORCH, 0.95); c.shadowBlur = 22;
    c.fillStyle = css(TORCH); c.fill(outer);
    c.restore();
  }
  c.save();
  c.shadowColor = 'rgba(0,0,0,0.7)'; c.shadowBlur = sunk ? 3 : 10; c.shadowOffsetY = sunk ? 1 : 6;
  c.fillStyle = '#000'; c.fill(outer);
  c.restore();
  const body = c.createLinearGradient(0, 0, 0, h);
  body.addColorStop(0, css(shade(col, sunk ? -0.15 : 0.16)));
  body.addColorStop(0.5, css(col));
  body.addColorStop(1, css(shade(col, -0.4)));
  c.fillStyle = body; c.fill(outer);
  c.save(); c.clip(outer);
  if (o.color === P.primary) oak(c, w, h, col, r); else stone(c, w, h, col, r);
  // torchlight from above on hover
  if (o.state === 'over') {
    const tl = c.createRadialGradient(w / 2, -h * 0.3, 4, w / 2, -h * 0.3, Math.max(w, h) * 0.9);
    tl.addColorStop(0, 'rgba(255,170,80,0.35)'); tl.addColorStop(1, 'rgba(255,170,80,0)');
    c.fillStyle = tl; c.fillRect(0, 0, w, h);
  }
  // bevel
  if (sunk) {
    const top = c.createLinearGradient(0, 0, 0, 14);
    top.addColorStop(0, 'rgba(0,0,0,0.6)'); top.addColorStop(1, 'rgba(0,0,0,0)');
    c.fillStyle = top; c.fillRect(0, 0, w, 14);
  } else {
    c.fillStyle = 'rgba(255,240,220,0.14)'; c.fillRect(0, 0, w, 3);
    c.fillStyle = 'rgba(0,0,0,0.4)'; c.fillRect(0, h - 5, w, 5);
  }
  const side = c.createLinearGradient(0, 0, w, 0);
  side.addColorStop(0, 'rgba(0,0,0,0.35)'); side.addColorStop(0.07, 'rgba(0,0,0,0)'); side.addColorStop(0.93, 'rgba(0,0,0,0)'); side.addColorStop(1, 'rgba(0,0,0,0.4)');
  c.fillStyle = side; c.fillRect(0, 0, w, h);
  c.restore();
  // ironwork
  const rv = Math.max(2.4, Math.min(4.2, h * 0.05));
  if (round) {
    c.lineWidth = 4; c.strokeStyle = '#3a3842'; c.stroke(shapeAt(3));
    for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2; rivet(c, w / 2 + Math.cos(a) * (w / 2 - 5), h / 2 + Math.sin(a) * (h / 2 - 5), Math.max(1.8, rv * 0.7)); }
  } else if (kind === 'button' && w >= 200 && h >= 60) {
    const bw = Math.min(16, w * 0.06);
    band(c, 22, -1, bw, h + 2, rv);
    band(c, w - 22 - bw, -1, bw, h + 2, rv);
  } else if (kind !== 'track') {
    const L = Math.min(26, h * 0.42, w * 0.3);
    for (const [x, y, sx, sy] of [[0, 0, 1, 1], [w, 0, -1, 1], [0, h, 1, -1], [w, h, -1, -1]] as number[][]) {
      c.save(); c.translate(x, y); c.scale(sx, sy);
      c.fillStyle = '#3a3842';
      c.beginPath(); c.moveTo(1, 1); c.lineTo(L, 1); c.lineTo(L, 6); c.lineTo(6, 6); c.lineTo(6, L); c.lineTo(1, L); c.closePath(); c.fill();
      c.strokeStyle = 'rgba(0,0,0,0.8)'; c.lineWidth = 1; c.stroke();
      rivet(c, 4.5, 4.5, Math.max(2, rv * 0.75));
      c.restore();
    }
  }
  c.lineWidth = 2; c.strokeStyle = css(shade(col, -0.8)); c.stroke(outer);
  if (o.state === 'on') { c.lineWidth = 3; c.strokeStyle = css(shade(TORCH, 0.1)); c.stroke(shapeAt(1.5)); }
  if (o.state === 'over') { c.lineWidth = 2.5; c.strokeStyle = 'rgba(255,200,120,0.95)'; c.stroke(outer); }
  if (o.state === 'down') { c.fillStyle = 'rgba(0,0,0,0.18)'; c.fill(outer); }
  c.restore();
};

// ------------------------------------------------------------------ the plaque

/** Little angular runes along a line (the plaque's carved border). */
function runes(c: CanvasRenderingContext2D, x: number, y: number, len: number, r: () => number): void {
  c.save();
  c.translate(x, y);
  c.strokeStyle = 'rgba(240,160,64,0.28)'; c.lineWidth = 1.4; c.lineCap = 'round';
  for (let p = 6; p < len - 8; p += 16) {
    const k = Math.floor(r() * 5);
    c.beginPath();
    if (k === 0) { c.moveTo(p, -5); c.lineTo(p, 5); c.moveTo(p, -5); c.lineTo(p + 5, 0); }
    else if (k === 1) { c.moveTo(p, 5); c.lineTo(p + 3, -5); c.lineTo(p + 6, 5); }
    else if (k === 2) { c.moveTo(p, -5); c.lineTo(p + 5, 5); c.moveTo(p + 5, -5); c.lineTo(p, 5); }
    else if (k === 3) { c.moveTo(p + 3, -5); c.lineTo(p + 3, 5); c.moveTo(p, -2); c.lineTo(p + 6, -2); }
    else { c.moveTo(p, 5); c.lineTo(p, -5); c.lineTo(p + 5, -2); c.lineTo(p, 1); }
    c.stroke();
  }
  c.restore();
}

/** The how-to and the pause / result card: a carved crypt plaque with iron corners and a rune border. */
export function cryptPlaque(c: CanvasRenderingContext2D, w: number, h: number): void {
  const r = rng(w * 3 + h * 11), e = 12;
  const outer = new Path2D(); outer.roundRect(0, 0, w, h, 8);
  c.save();
  c.shadowColor = 'rgba(0,0,0,0.7)'; c.shadowBlur = 18; c.shadowOffsetY = 8;
  c.fillStyle = '#000'; c.fill(outer);
  c.restore();
  const g = c.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, '#3a3440'); g.addColorStop(1, '#1e1a24');
  c.fillStyle = g; c.fill(outer);
  c.save(); c.clip(outer); stone(c, w, h, 0x2e2834, r); c.restore();
  // the raised rim and the sunk field
  c.fillStyle = 'rgba(255,240,220,0.08)'; c.fillRect(2, 2, w - 4, 3);
  const field = new Path2D(); field.rect(e + 10, e + 10, w - (e + 10) * 2, h - (e + 10) * 2);
  c.fillStyle = 'rgba(0,0,0,0.22)'; c.fill(field);
  c.lineWidth = 2; c.strokeStyle = 'rgba(0,0,0,0.6)'; c.stroke(field);
  c.save(); c.translate(0, 1.5); c.strokeStyle = 'rgba(255,230,200,0.08)'; c.stroke(field); c.restore();
  runes(c, e + 18, e + 3, w - (e + 18) * 2, r);
  runes(c, e + 18, h - e - 3, w - (e + 18) * 2, r);
  // a torch glow on the upper part
  const glow = c.createRadialGradient(w / 2, 0, 10, w / 2, 0, Math.max(w, h) * 0.6);
  glow.addColorStop(0, 'rgba(240,160,64,0.12)'); glow.addColorStop(1, 'rgba(240,160,64,0)');
  c.fillStyle = glow; c.fillRect(0, 0, w, h);
  // iron corners
  for (const [x, y, sx, sy] of [[0, 0, 1, 1], [w, 0, -1, 1], [0, h, 1, -1], [w, h, -1, -1]] as number[][]) {
    c.save(); c.translate(x, y); c.scale(sx, sy);
    const p = new Path2D(); p.moveTo(2, 2); p.lineTo(40, 2); p.lineTo(40, 10); p.lineTo(10, 10); p.lineTo(10, 40); p.lineTo(2, 40); p.closePath();
    const ig = c.createLinearGradient(0, 0, 40, 40);
    ig.addColorStop(0, '#6a6874'); ig.addColorStop(1, '#24222a');
    c.fillStyle = ig; c.fill(p);
    c.strokeStyle = 'rgba(0,0,0,0.85)'; c.lineWidth = 1.2; c.stroke(p);
    rivet(c, 6, 6, 3); rivet(c, 30, 6, 2.2); rivet(c, 6, 30, 2.2);
    c.restore();
  }
  c.lineWidth = 2; c.strokeStyle = 'rgba(0,0,0,0.9)'; c.stroke(outer);
}

// ------------------------------------------------------------------ the frame

/** An iron chain along the edge: links seen flat and edge-on by turns. */
const chainEdge: BorderStyle['edge'] = (c, len, t) => {
  const cy = t / 2, L = 26, hw = t * 0.32;
  const link = (x: number, flat: boolean) => {
    c.save();
    if (flat) {
      c.lineWidth = 4.2; c.strokeStyle = '#121016';
      c.beginPath(); c.ellipse(x, cy, L / 2, hw, 0, 0, Math.PI * 2); c.stroke();
      c.lineWidth = 2.6;
      const g = c.createLinearGradient(0, cy - hw, 0, cy + hw);
      g.addColorStop(0, '#a8a4b0'); g.addColorStop(0.5, '#5c5864'); g.addColorStop(1, '#2a2830');
      c.strokeStyle = g; c.stroke();
    } else {
      c.fillStyle = '#121016'; c.beginPath(); c.roundRect(x - L / 2, cy - 2.6, L, 5.2, 2.6); c.fill();
      const g = c.createLinearGradient(0, cy - 2, 0, cy + 2);
      g.addColorStop(0, '#a8a4b0'); g.addColorStop(1, '#3a3842');
      c.fillStyle = g; c.beginPath(); c.roundRect(x - L / 2 + 1, cy - 1.6, L - 2, 3.2, 1.6); c.fill();
    }
    c.restore();
  };
  c.save();
  c.shadowColor = 'rgba(0,0,0,0.7)'; c.shadowBlur = 4; c.shadowOffsetY = 2;
  for (let x = L / 2, i = 0; x < len + L; x += L * 0.78, i++) link(x, i % 2 === 0);
  c.restore();
};

/** A skull in each corner, on a little iron ring where the chains meet. */
function cornerSkull(c: CanvasRenderingContext2D, size: number): void {
  const cx = size * 0.42, cy = size * 0.42;
  c.save();
  c.shadowColor = 'rgba(0,0,0,0.7)'; c.shadowBlur = 6; c.shadowOffsetY = 2;
  skull(c, cx, cy, size * 0.3);
  c.restore();
}

/** A skull centred on (x, y), R about its cranium's radius. */
function skull(c: CanvasRenderingContext2D, x: number, y: number, R: number): void {
  c.save();
  c.translate(x, y);
  const g = c.createRadialGradient(-R * 0.3, -R * 0.4, R * 0.1, 0, 0, R * 1.2);
  g.addColorStop(0, '#fff8e6'); g.addColorStop(0.6, '#e2d4b4'); g.addColorStop(1, '#9a8a6a');
  c.fillStyle = g;
  c.beginPath();
  c.arc(0, -R * 0.1, R, Math.PI * 0.85, Math.PI * 0.15);
  c.lineTo(R * 0.6, R * 0.6); c.lineTo(R * 0.5, R * 1.05); c.lineTo(-R * 0.5, R * 1.05); c.lineTo(-R * 0.6, R * 0.6);
  c.closePath(); c.fill();
  c.lineWidth = Math.max(1, R * 0.08); c.strokeStyle = '#2a1e14'; c.stroke();
  c.fillStyle = '#1a1210';
  for (const s of [-1, 1]) { c.beginPath(); c.ellipse(s * R * 0.4, R * 0.08, R * 0.27, R * 0.3, s * 0.2, 0, Math.PI * 2); c.fill(); }
  c.beginPath(); c.moveTo(0, R * 0.38); c.lineTo(-R * 0.13, R * 0.62); c.lineTo(R * 0.13, R * 0.62); c.closePath(); c.fill();
  c.lineWidth = Math.max(1, R * 0.06);
  for (let i = -2; i <= 2; i++) { c.beginPath(); c.moveTo(i * R * 0.17, R * 0.72); c.lineTo(i * R * 0.17, R * 1.02); c.stroke(); }
  // a glint of torchlight in the sockets
  c.fillStyle = 'rgba(255,170,60,0.85)';
  for (const s of [-1, 1]) { c.beginPath(); c.arc(s * R * 0.38, R * 0.1, R * 0.07, 0, Math.PI * 2); c.fill(); }
  c.restore();
}

export const CHAIN_BORDER: BorderStyle = { thick: 18, inset: 2, edge: chainEdge, corner: { size: 52, draw: cornerSkull, inset: 0 } };

// ------------------------------------------------------------------ the emblem

/** A torch: a bracket, a wooden haft and a flame. */
function torch(c: CanvasRenderingContext2D, x: number, y: number, u: number): void {
  const flame = c.createRadialGradient(x, y - 14 * u, 1 * u, x, y - 12 * u, 22 * u);
  flame.addColorStop(0, 'rgba(255,200,90,0.6)'); flame.addColorStop(1, 'rgba(255,140,40,0)');
  c.fillStyle = flame; c.fillRect(x - 24 * u, y - 36 * u, 48 * u, 48 * u);
  c.fillStyle = '#5a3418'; c.strokeStyle = '#1a0e06'; c.lineWidth = 1.2 * u;
  c.beginPath(); c.moveTo(x - 2.5 * u, y - 6 * u); c.lineTo(x + 2.5 * u, y - 6 * u); c.lineTo(x + 1.5 * u, y + 14 * u); c.lineTo(x - 1.5 * u, y + 14 * u); c.closePath(); c.fill(); c.stroke();
  c.fillStyle = '#3a3842'; c.fillRect(x - 5 * u, y + 2 * u, 10 * u, 3 * u);
  const f = new Path2D();
  f.moveTo(x, y - 24 * u); f.quadraticCurveTo(x + 8 * u, y - 12 * u, x + 4 * u, y - 5 * u); f.lineTo(x - 4 * u, y - 5 * u); f.quadraticCurveTo(x - 8 * u, y - 14 * u, x, y - 24 * u);
  const fg = c.createLinearGradient(0, y - 24 * u, 0, y - 5 * u);
  fg.addColorStop(0, '#ffe680'); fg.addColorStop(0.5, '#ff9a30'); fg.addColorStop(1, '#d84a10');
  c.fillStyle = fg; c.fill(f);
  c.fillStyle = '#fff6c0'; c.beginPath(); c.ellipse(x, y - 10 * u, 2 * u, 4 * u, 0, 0, Math.PI * 2); c.fill();
}

/** A skull on an iron-bound crypt door in a stone arch, a torch on each side. */
export function cryptEmblem(c: CanvasRenderingContext2D, size: number): void {
  const u = size / 100;
  c.save();
  c.translate(size / 2, size / 2);
  const glow = c.createRadialGradient(0, 0, 6 * u, 0, 0, 50 * u);
  glow.addColorStop(0, 'rgba(240,140,60,0.4)'); glow.addColorStop(1, 'rgba(240,140,60,0)');
  c.fillStyle = glow; c.fillRect(-50 * u, -50 * u, 100 * u, 100 * u);
  const ink = '#0e0a10';
  // the arch: stone voussoirs round the door
  const arch = (r0: number) => { const p = new Path2D(); p.moveTo(-r0, 44 * u); p.lineTo(-r0, -6 * u); p.arc(0, -6 * u, r0, Math.PI, 0); p.lineTo(r0, 44 * u); p.closePath(); return p; };
  const outer = arch(32 * u), inner = arch(24 * u);
  const sg = c.createLinearGradient(-32 * u, 0, 32 * u, 0);
  sg.addColorStop(0, '#7a7484'); sg.addColorStop(1, '#3a3442');
  c.fillStyle = sg; c.fill(outer);
  c.strokeStyle = ink; c.lineWidth = 1.6 * u; c.stroke(outer);
  c.strokeStyle = 'rgba(14,10,16,0.7)'; c.lineWidth = 1 * u;
  for (let i = 0; i <= 8; i++) { const a = Math.PI + (i / 8) * Math.PI; c.beginPath(); c.moveTo(Math.cos(a) * 24 * u, -6 * u + Math.sin(a) * 24 * u); c.lineTo(Math.cos(a) * 32 * u, -6 * u + Math.sin(a) * 32 * u); c.stroke(); }
  for (const y of [6, 18, 30]) for (const s of [-1, 1]) { c.beginPath(); c.moveTo(s * 24 * u, y * u); c.lineTo(s * 32 * u, y * u); c.stroke(); }
  // the door: dark planks with two iron bands
  const dg = c.createLinearGradient(0, -30 * u, 0, 44 * u);
  dg.addColorStop(0, '#5a2e1c'); dg.addColorStop(1, '#2a140c');
  c.fillStyle = dg; c.fill(inner);
  c.save(); c.clip(inner);
  c.strokeStyle = 'rgba(0,0,0,0.5)'; c.lineWidth = 1 * u;
  for (const x of [-12, 0, 12]) { c.beginPath(); c.moveTo(x * u, -32 * u); c.lineTo(x * u, 44 * u); c.stroke(); }
  for (const y of [-14, 26]) {
    const bg = c.createLinearGradient(0, (y - 3) * u, 0, (y + 3) * u);
    bg.addColorStop(0, '#6a6874'); bg.addColorStop(1, '#24222a');
    c.fillStyle = bg; c.fillRect(-24 * u, (y - 3) * u, 48 * u, 6 * u);
    for (const x of [-18, -6, 6, 18]) rivet(c, x * u, y * u, 1.4 * u);
  }
  c.restore();
  c.strokeStyle = ink; c.lineWidth = 1.4 * u; c.stroke(inner);
  // the skull on the door, and a ring knocker under it
  skull(c, 0, 0, 13 * u);
  c.strokeStyle = '#8a8894'; c.lineWidth = 2 * u;
  c.beginPath(); c.arc(0, 30 * u, 5 * u, 0, Math.PI * 2); c.stroke();
  // the torches
  torch(c, -40 * u, 6 * u, u);
  torch(c, 40 * u, 6 * u, u);
  c.restore();
}

// ------------------------------------------------------------------ the theme

export const CRYPT_THEME: MenuTheme = {
  font: NEW_ROCKER,
  palette: {
    primary: OAK, secondary: CRYPT, board: NIGHT, trim: TORCH,
    label: '#f4ead4', labelStroke: LABEL_STROKE, muted: '#a8a0b0', accent: '#ffc04a',
    heading: '#ffb050', body: BONE, icon: 0xf2e6d0, shade: 0x07050c,
  },
  logo: {
    fill: ['#fff6dc', '#f2d8a0', '#d8902a', '#8a3a10'],
    outline: '#0e0a10',
    rim: '#c8b088',
    depth: '#3a1a10',
    size: 150,
    emblem: { draw: cryptEmblem, size: 250, overlap: 0.24 },
  },
  skin: ironSkin,
  frame: { border: CHAIN_BORDER, notes: cryptPlaque, vignette: 0.55, dim: 0.35 },
  overlays: {
    lose: '#ff7a5a',
    win: '#ffc04a',
    adColor: MOSSY,
    titles: ['deathTitle'],
  },
};
