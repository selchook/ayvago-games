// Delivery Dash's menu theme (src/core/menu-theme.ts): Bungee, warm orange and yellow on kraft
// cardboard. The buttons are cardboard with strips of packing tape, the switches sit in a cut
// corrugated slot, a road with its lane markings and a traffic cone in each corner frames the
// screen, the how-to is a shipping label with handling symbols, and a parcel with wings flies
// behind the logo. Every piece is painted once on a canvas (the core caches it); nothing here runs
// in play. Also the town map button at the top in the same skin.
// Bungee is all capitals (its lower-case letters are capitals too, a lower-case i without a dot),
// so every text set in it here is upper-cased the Turkish way (`upper`).
import Phaser from 'phaser';
import { t, txt, upper, SkinButton, shadeColor, STEERING_PIECES, type MenuTheme, type SkinPainter, type BorderStyle } from '@core';
import { BUNGEE } from '@core/fonts/bungee';
import { loadMeta } from './meta';
import { shift } from './shifts';

/** The shift's stars card (PlayScene.finish). */
export const STARS_W = 620, STARS_H = 470;
/** The town map button at the top of the menu. */
const MAP_W = 470, MAP_H = 80;
export const MAP_Y = 88;

const ORANGE = 0xff8a1a, KRAFT = 0xb98552, INK = '#3a2410', YELLOW = 0xffd23f;

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

/** Cardboard fibres: fine light and dark specks and a few long fibres (inside a clip). */
function fibres(c: CanvasRenderingContext2D, w: number, h: number, r: () => number): void {
  for (let i = 0; i < Math.min(1800, (w * h) / 40); i++) {
    c.fillStyle = r() < 0.5 ? `rgba(255,240,210,${r() * 0.12})` : `rgba(60,30,5,${r() * 0.14})`;
    c.fillRect(r() * w, r() * h, 1 + r() * 1.5, 1 + r());
  }
  c.strokeStyle = 'rgba(70,40,10,0.12)'; c.lineWidth = 0.8;
  for (let i = 0; i < Math.max(3, w / 30); i++) {
    const x = r() * w, y = r() * h;
    c.beginPath(); c.moveTo(x, y); c.lineTo(x + 6 + r() * 14, y + (r() - 0.5) * 4); c.stroke();
  }
}

/** A strip of shiny brown packing tape across the piece at x (full height), a little askew. */
function packingTape(c: CanvasRenderingContext2D, x: number, h: number, wide: number, r: () => number): void {
  c.save();
  c.translate(x, h / 2);
  c.rotate((r() - 0.5) * 0.08);
  const g = c.createLinearGradient(-wide / 2, 0, wide / 2, 0);
  g.addColorStop(0, 'rgba(214,170,100,0.82)'); g.addColorStop(0.35, 'rgba(240,206,140,0.85)'); g.addColorStop(1, 'rgba(196,150,80,0.82)');
  c.fillStyle = g;
  c.fillRect(-wide / 2, -h / 2 - 4, wide, h + 8);
  c.fillStyle = 'rgba(255,255,255,0.28)';
  c.fillRect(-wide / 2 + wide * 0.18, -h / 2 - 4, wide * 0.14, h + 8);
  c.strokeStyle = 'rgba(120,80,30,0.35)'; c.lineWidth = 1;
  c.strokeRect(-wide / 2, -h / 2 - 4, wide, h + 8);
  c.restore();
}

/**
 * The cardboard skin: kraft board in the piece's colour (PLAY printed orange) with fibres, a
 * crushed darker edge and packing tape over the big buttons; the track is the cut edge of a box,
 * its corrugated flutes showing. Hover glows yellow, a press dents the board, the chosen switch
 * segment wears a yellow ring and the other one is dark, damp cardboard.
 */
const cardboardPainter: SkinPainter = (c, kind, w, h, o) => {
  const P = o.palette, r = rng(o.seed);
  const down = o.state === 'down', off = o.state === 'off', over = o.state === 'over', on = o.state === 'on';
  const sunk = down || off || kind === 'track';
  const round = kind === 'round';
  const rad = round ? Math.min(w, h) / 2 : Math.min(8, h * 0.12);
  const shape = round ? (() => { const p = new Path2D(); p.arc(w / 2, h / 2, Math.min(w, h) / 2, 0, Math.PI * 2); return p; })() : rounded(0, 0, w, h, rad);
  const col = off ? shadeColor(o.color, -0.45) : o.color;
  c.save();
  c.translate(0, down ? 3 : 0);
  c.save();
  c.shadowColor = over ? rgba(P.trim, 0.9) : 'rgba(20,10,0,0.55)';
  c.shadowBlur = sunk ? 3 : over ? 15 : 9;
  c.shadowOffsetY = sunk ? 1 : over ? 3 : 6;
  c.fillStyle = '#000'; c.fill(shape);
  c.restore();
  if (kind === 'track') {
    // the cut edge of a box: two liners and the wavy flute between them
    c.fillStyle = '#5a3a1c'; c.fill(shape);
    c.save(); c.clip(shape);
    c.fillStyle = '#7a5230';
    c.fillRect(0, 5, w, h - 10);
    c.strokeStyle = 'rgba(40,22,6,0.55)'; c.lineWidth = 2;
    c.beginPath();
    for (let x = -4; x <= w + 4; x += 2) {
      const y = h / 2 + Math.sin(x / 5) * (h / 2 - 9);
      x < 0 ? c.moveTo(x, y) : c.lineTo(x, y);
    }
    c.stroke();
    const sh = c.createLinearGradient(0, 0, 0, h);
    sh.addColorStop(0, 'rgba(0,0,0,0.55)'); sh.addColorStop(0.3, 'rgba(0,0,0,0.15)'); sh.addColorStop(1, 'rgba(0,0,0,0.35)');
    c.fillStyle = sh; c.fillRect(0, 0, w, h);
    c.restore();
    c.lineWidth = 2.5; c.strokeStyle = 'rgba(40,22,6,0.9)'; c.stroke(shape);
    c.restore();
    return;
  }
  // the board: light at the top, a crushed dark edge, fibres
  const body = c.createLinearGradient(0, 0, 0, h);
  body.addColorStop(0, rgba(shadeColor(col, sunk ? 0 : 0.2)));
  body.addColorStop(0.6, rgba(col));
  body.addColorStop(1, rgba(shadeColor(col, -0.3)));
  c.fillStyle = body; c.fill(shape);
  c.save();
  c.clip(shape);
  fibres(c, w, h, r);
  if (kind === 'board') {
    // faint flutes pressed through the liner
    c.fillStyle = 'rgba(0,0,0,0.05)';
    for (let x = 0; x < w; x += 9) c.fillRect(x, 0, 3, h);
  }
  if (sunk) {
    const top = c.createLinearGradient(0, 0, 0, 14);
    top.addColorStop(0, 'rgba(0,0,0,0.45)'); top.addColorStop(1, 'rgba(0,0,0,0)');
    c.fillStyle = top; c.fillRect(0, 0, w, 14);
  } else {
    c.fillStyle = 'rgba(255,240,210,0.3)'; c.fillRect(0, 0, w, 3);
  }
  // the crushed edge
  c.lineWidth = 6; c.strokeStyle = rgba(shadeColor(col, -0.35), 0.55); c.stroke(shape);
  c.restore();
  c.lineWidth = 2; c.strokeStyle = rgba(shadeColor(col, -0.72)); c.stroke(shape);
  // tape: two strips over a big button, one across the top of a plate or the board's corners
  if (!round && !off) {
    if (kind === 'button' && w >= 200) for (const x of [34, w - 34]) packingTape(c, x, h, 24, r);
    else if (kind === 'plate') {
      c.save(); c.beginPath(); c.rect(-10, -10, w + 20, h * 0.5 + 10); c.clip();
      packingTape(c, w * 0.5, h, Math.min(20, w * 0.26), r);
      c.restore();
    } else if (kind === 'board') {
      for (const [x, y, a] of [[0, 0, -0.75], [w, 0, 0.75], [0, h, 0.75], [w, h, -0.75]]) {
        c.save(); c.translate(x, y); c.rotate(a);
        c.fillStyle = 'rgba(224,186,120,0.85)'; c.fillRect(-26, -10, 52, 20);
        c.fillStyle = 'rgba(255,255,255,0.25)'; c.fillRect(-26, -7, 52, 4);
        c.restore();
      }
    }
  }
  if (round) { c.strokeStyle = rgba(P.trim, 0.9); c.lineWidth = 3; c.beginPath(); c.arc(w / 2, h / 2, Math.min(w, h) / 2 - 5, 0, Math.PI * 2); c.stroke(); }
  if (on || over) {
    c.save();
    c.shadowColor = rgba(P.trim, 0.95); c.shadowBlur = over ? 12 : 7;
    c.lineWidth = over ? 3.5 : 3; c.strokeStyle = rgba(shadeColor(P.trim, 0.2)); c.stroke(shape);
    c.restore();
  }
  if (down) { c.fillStyle = 'rgba(0,0,0,0.15)'; c.fill(shape); }
  c.restore();
};

/** "This way up": two arrows over a bar. */
function upArrows(c: CanvasRenderingContext2D, x: number, y: number, s: number): void {
  c.fillStyle = INK;
  for (const dx of [-0.28, 0.28]) {
    c.beginPath(); c.moveTo(x + dx * s, y - s * 0.5); c.lineTo(x + dx * s - s * 0.2, y - s * 0.18); c.lineTo(x + dx * s + s * 0.2, y - s * 0.18); c.closePath(); c.fill();
    c.fillRect(x + dx * s - s * 0.06, y - s * 0.2, s * 0.12, s * 0.55);
  }
  c.fillRect(x - s * 0.5, y + s * 0.4, s, s * 0.1);
}

/** "Fragile": a wine glass. */
function glassIcon(c: CanvasRenderingContext2D, x: number, y: number, s: number): void {
  c.strokeStyle = INK; c.fillStyle = INK; c.lineWidth = s * 0.1;
  c.beginPath(); c.moveTo(x - s * 0.3, y - s * 0.5); c.lineTo(x + s * 0.3, y - s * 0.5); c.quadraticCurveTo(x + s * 0.3, y, x, y + s * 0.05); c.quadraticCurveTo(x - s * 0.3, y, x - s * 0.3, y - s * 0.5); c.closePath(); c.fill();
  c.beginPath(); c.moveTo(x, y); c.lineTo(x, y + s * 0.4); c.moveTo(x - s * 0.22, y + s * 0.42); c.lineTo(x + s * 0.22, y + s * 0.42); c.stroke();
  // the crack
  c.strokeStyle = '#f7f1e3'; c.lineWidth = s * 0.06;
  c.beginPath(); c.moveTo(x - s * 0.05, y - s * 0.48); c.lineTo(x + s * 0.06, y - s * 0.3); c.lineTo(x - s * 0.04, y - s * 0.18); c.stroke();
}

/** The shipping label behind the how-to and the overlays: paper, a thick black frame, handling symbols, a barcode edge. */
function shippingLabel(c: CanvasRenderingContext2D, w: number, h: number): void {
  const r = rng(Math.round(w * 3 + h));
  const shape = rounded(0, 0, w, h, 10);
  c.save();
  c.shadowColor = 'rgba(0,0,0,0.5)'; c.shadowBlur = 12; c.shadowOffsetY = 6;
  c.fillStyle = '#f7f1e3'; c.fill(shape);
  c.restore();
  c.save();
  c.clip(shape);
  for (let i = 0; i < (w * h) / 80; i++) { c.fillStyle = `rgba(90,70,40,${r() * 0.05})`; c.fillRect(r() * w, r() * h, 1.5, 1.5); }
  // a striped band down the left edge like a courier's label, a barcode down the right
  c.fillStyle = rgba(ORANGE);
  c.fillRect(0, 0, 14, h);
  c.fillStyle = INK;
  let y = 18;
  while (y < h - 18) { const t = 1 + Math.floor(r() * 4); c.fillRect(w - 20, y, 10, t); y += t + 1 + Math.floor(r() * 4); }
  c.restore();
  c.lineWidth = 4; c.strokeStyle = INK; c.stroke(rounded(20, 8, w - 46, h - 16, 6));
  c.lineWidth = 2; c.strokeStyle = 'rgba(58,36,16,0.6)'; c.stroke(shape);
  // handling symbols in the top corners
  upArrows(c, 50, 38, 30);
  glassIcon(c, w - 62, 38, 30);
}

/** A road round the screen: asphalt with a dashed white centre line; a traffic cone in each corner. */
const ROAD_BORDER: BorderStyle = {
  thick: 16,
  inset: 0,
  edge: (c, len, thick) => {
    c.fillStyle = 'rgba(48,52,60,0.92)'; c.fillRect(0, 0, len, thick);
    c.fillStyle = rgba(YELLOW, 0.95); c.fillRect(0, thick - 3, len, 2);
    c.fillStyle = 'rgba(255,255,255,0.9)';
    for (let x = 30; x < len - 30; x += 34) c.fillRect(x, thick / 2 - 2, 18, 3);
  },
  corner: {
    size: 58,
    inset: 0,
    draw: (c, s) => {
      // a cone standing in the corner, seen from above-front
      const x = s * 0.46, base = s * 0.8;
      c.save();
      c.shadowColor = 'rgba(0,0,0,0.5)'; c.shadowBlur = 4; c.shadowOffsetY = 2;
      c.fillStyle = '#2a2a2a';
      c.beginPath(); c.roundRect(x - s * 0.36, base - 4, s * 0.72, 9, 3); c.fill();
      c.restore();
      const g = c.createLinearGradient(x - s * 0.25, 0, x + s * 0.25, 0);
      g.addColorStop(0, '#ff6a00'); g.addColorStop(0.45, '#ffb05a'); g.addColorStop(1, '#d94a00');
      c.fillStyle = g;
      c.beginPath(); c.moveTo(x - 4, s * 0.12); c.lineTo(x + 4, s * 0.12); c.lineTo(x + s * 0.27, base); c.lineTo(x - s * 0.27, base); c.closePath(); c.fill();
      c.strokeStyle = '#7a2a00'; c.lineWidth = 1.5; c.stroke();
      c.fillStyle = '#ffffff';
      for (const [y0, y1] of [[0.36, 0.46], [0.58, 0.68]]) {
        const a = s * y0, b = s * y1, k = (yy: number) => 4 + ((yy - s * 0.12) / (base - s * 0.12)) * (s * 0.27 - 4);
        c.beginPath(); c.moveTo(x - k(a), a); c.lineTo(x + k(a), a); c.lineTo(x + k(b), b); c.lineTo(x - k(b), b); c.closePath(); c.fill();
      }
    },
  },
};

/** A wing of four feathers along +x from (0, 0). */
function wing(c: CanvasRenderingContext2D, u: number): void {
  for (let i = 3; i >= 0; i--) {
    const len = (30 - i * 5) * u, y = i * 5.5 * u;
    c.beginPath();
    c.moveTo(0, y);
    c.quadraticCurveTo(len * 0.6, y - 10 * u + i * u, len, y - 14 * u + i * 3 * u);
    c.quadraticCurveTo(len * 0.7, y + 3 * u, 0, y + 7 * u);
    c.closePath();
    const g = c.createLinearGradient(0, y - 12 * u, 0, y + 7 * u);
    g.addColorStop(0, '#ffffff'); g.addColorStop(1, '#d6e4f2');
    c.fillStyle = g; c.fill();
    c.strokeStyle = INK; c.lineWidth = 1.8 * u; c.stroke();
  }
}

/** The parcel with wings behind the logo: a taped box with a label, two wings, speed lines. */
export function parcelEmblem(c: CanvasRenderingContext2D, size: number): void {
  const u = size / 100;
  c.save();
  c.translate(size / 2, size / 2 + 2 * u);
  c.lineJoin = 'round';
  const halo = c.createRadialGradient(0, 0, 6 * u, 0, 0, 50 * u);
  halo.addColorStop(0, 'rgba(255,200,80,0.45)'); halo.addColorStop(1, 'rgba(255,200,80,0)');
  c.fillStyle = halo; c.fillRect(-50 * u, -50 * u, 100 * u, 100 * u);
  // speed lines behind, to the left
  c.strokeStyle = '#ffffff'; c.lineCap = 'round';
  for (const [y, x0, x1, wd] of [[-8, -48, -34, 3], [4, -50, -30, 3.4], [16, -46, -32, 2.6]]) {
    c.lineWidth = wd * u; c.beginPath(); c.moveTo(x0 * u, y * u); c.lineTo(x1 * u, y * u); c.stroke();
  }
  c.rotate(-0.12);
  // the wings behind the box
  for (const s of [-1, 1]) {
    c.save(); c.translate(s * 16 * u, -12 * u); c.scale(s, 1); c.rotate(-0.35); wing(c, u); c.restore();
  }
  // the box: front, top and side faces
  const front = new Path2D(); front.rect(-22 * u, -10 * u, 34 * u, 30 * u);
  const top = new Path2D(); top.moveTo(-22 * u, -10 * u); top.lineTo(-12 * u, -20 * u); top.lineTo(22 * u, -20 * u); top.lineTo(12 * u, -10 * u); top.closePath();
  const side = new Path2D(); side.moveTo(12 * u, -10 * u); side.lineTo(22 * u, -20 * u); side.lineTo(22 * u, 10 * u); side.lineTo(12 * u, 20 * u); side.closePath();
  const fill = (p: Path2D, a: string, b: string, y0: number, y1: number) => {
    const g = c.createLinearGradient(0, y0 * u, 0, y1 * u); g.addColorStop(0, a); g.addColorStop(1, b);
    c.fillStyle = g; c.fill(p); c.strokeStyle = INK; c.lineWidth = 2.2 * u; c.stroke(p);
  };
  fill(front, '#d9a46a', '#b07a42', -10, 20);
  fill(top, '#ecc490', '#d6a66c', -20, -10);
  fill(side, '#a26e3a', '#7f5228', -20, 20);
  // packing tape over the top and down the front
  c.fillStyle = 'rgba(240,206,140,0.95)';
  c.beginPath(); c.moveTo(-8 * u, -10 * u); c.lineTo(2 * u, -20 * u); c.lineTo(8 * u, -20 * u); c.lineTo(-2 * u, -10 * u); c.closePath(); c.fill();
  c.fillRect(-8 * u, -10 * u, 6 * u, 30 * u);
  // the label: white with an orange band and lines of address
  c.fillStyle = '#fbf6ea';
  c.beginPath(); c.roundRect(-19 * u, 1 * u, 14 * u, 15 * u, 1.5 * u); c.fill();
  c.strokeStyle = INK; c.lineWidth = 1.3 * u; c.stroke();
  c.fillStyle = rgba(ORANGE); c.fillRect(-19 * u, 1 * u, 14 * u, 3.5 * u);
  c.fillStyle = INK;
  for (const y of [7, 10, 13]) c.fillRect(-17 * u, y * u, (y === 13 ? 6 : 10) * u, 1.2 * u);
  // a heart stamped on the side
  c.fillStyle = 'rgba(210,66,30,0.9)';
  c.beginPath();
  c.moveTo(17 * u, 6 * u);
  c.bezierCurveTo(13 * u, 2 * u, 14 * u, -3 * u, 17 * u, -1.5 * u);
  c.bezierCurveTo(20 * u, -4 * u, 21 * u, 1 * u, 17 * u, 6 * u);
  c.fill();
  c.restore();
}

export const DELIVERY_THEME: MenuTheme = {
  font: BUNGEE,
  // Bungee's capitals are wide
  fontScale: 0.8,
  palette: {
    primary: ORANGE, secondary: KRAFT, board: 0x6e4a26, trim: YELLOW,
    label: '#ffffff', labelStroke: INK, muted: '#e0c9a6', accent: '#ffd23f',
    heading: '#d2421e', body: '#2b1d10', icon: 0xfff4e0, shade: 0x0a1430,
  },
  logo: {
    fill: ['#fff6d0', '#ffd23f', '#ff8a1a'],
    outline: INK,
    outlineWidth: 0.13,
    rim: '#ffffff',
    depth: '#7a3a10',
    size: 88,
    upper: true,
    lineHeight: 0.92,
    // mostly behind the letters: the map button sits above the logo
    emblem: { draw: parcelEmblem, size: 180, overlap: 0.48 },
  },
  skin: cardboardPainter,
  // the map button and the steering switch (touch screens) in the same skin
  pieces: [{ kind: 'button', w: MAP_W, h: MAP_H }, ...STEERING_PIECES],
  // dim: the backdrop's darkening (main.ts drew it as its own layer before the theme)
  frame: { border: ROAD_BORDER, notes: shippingLabel, vignette: 0.5, dim: 0.38 },
  overlays: { lose: '#d2421e', titles: ['rushOver', 'timeUp'] },
  cards: [{ w: STARS_W, h: STARS_H }],
};

/** The town map button at the top (M on the keyboard): the shift or Endless Rush, "tap for the map" under it. */
export function mapButton(scene: Phaser.Scene, open: () => void): { refresh: () => void; button: SkinButton } {
  const btn = new SkinButton(scene, scene.scale.width / 2, MAP_Y, '', open, { width: MAP_W, height: MAP_H, size: 30 });
  const sub = txt(scene, 0, 22, '', { size: 18, color: '#fff4e0', strokeThickness: 4, shadow: false });
  btn.add(sub);
  const refresh = () => {
    const m = loadMeta();
    btn.setText(upper(m.mode === 'rush' ? t('menuRush') : t('menuShift', { n: m.shift, d: t('d' + shift(m.shift).district) }))).fitLabel(MAP_W - 90);
    btn.setLabelY(-11);
    sub.setText(t('menuSub'));
  };
  refresh();
  scene.time.delayedCall(1700, () => scene.tweens.add({ targets: btn, scale: { from: 1, to: 1.03 }, duration: 900, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' }));
  return { refresh, button: btn };
}
