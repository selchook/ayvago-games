// Golden Podium's menu theme (src/core/menu-theme.ts): Russo One, gold and royal blue in the
// stadium. The buttons are podium steps (a lit top face over the front, PLAY in gold, the rest in
// blue, stars at the ends), the switches sit in a strip of red running track with its lane lines,
// a golden laurel garland runs round the screen with a medal in each corner, the how-to is a
// winner's certificate, and a gold medal in a laurel wreath hangs behind the logo. Every piece is
// painted once on a canvas (the core caches it under the Ayvago intro); nothing here runs in play.
import { shadeColor, labelTexture, overlayHeadingStyle, t, type MenuTheme, type SkinPainter, type BorderStyle } from '@core';
import { RUSSO_ONE } from '@core/fonts/russo-one';
import { prebakePodium, BOARD_CARD, EVENT_CARD } from './panels';
import { prebakeCallouts } from './callouts';
import { ordinal } from './strings';

export const GOLD = 0xe2a514, BLUE = 0x2453b4, NAVY = 0x172552, TRACK = 0xc4482c, RED = 0xd8382a, GREEN = 0x2f9a4c;
export const INK = '#151a38';

function rng(seed: number): () => number {
  let s = (seed >>> 0) % 2147483647 || 1;
  return () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
}

const rgba = (c: number, a = 1): string => `rgba(${(c >> 16) & 255},${(c >> 8) & 255},${c & 255},${a})`;

function rounded(x: number, y: number, w: number, h: number, r: number): Path2D {
  const p = new Path2D();
  p.roundRect(x, y, w, h, Math.max(0, Math.min(r, w / 2, h / 2)));
  return p;
}

/** A five-pointed star centred on (x, y). */
function star(c: CanvasRenderingContext2D, x: number, y: number, r: number, fill: string, stroke?: string): void {
  c.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5, rr = i % 2 ? r * 0.45 : r;
    i ? c.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr) : c.moveTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
  }
  c.closePath();
  c.fillStyle = fill; c.fill();
  if (stroke) { c.strokeStyle = stroke; c.lineWidth = 1.5; c.stroke(); }
}

/**
 * The podium skin: each piece is a podium step, a lit top face over the front face in the
 * piece's colour (PLAY gold, the rest royal blue), a gold edge between them and a star at each end
 * of the big ones. Hover glows gold, a press sinks the step, the chosen switch segment wears a gold
 * rim, a disabled step is grey. The switch's track is a strip of red running track with lane lines.
 */
const podiumPainter: SkinPainter = (c, kind, w, h, o) => {
  const P = o.palette, r = rng(o.seed);
  const down = o.state === 'down', off = o.state === 'off', over = o.state === 'over', on = o.state === 'on';
  const round = kind === 'round';
  const rad = round ? Math.min(w, h) / 2 : Math.min(7, h * 0.1);
  const outer = round ? (() => { const p = new Path2D(); p.arc(w / 2, h / 2, Math.min(w, h) / 2, 0, Math.PI * 2); return p; })() : rounded(0, 0, w, h, rad);
  c.save();
  c.translate(0, down ? 3 : 0);
  c.save();
  c.shadowColor = over ? rgba(P.trim, 0.95) : 'rgba(5,10,30,0.55)';
  c.shadowBlur = down ? 3 : over ? 16 : 10;
  c.shadowOffsetY = down ? 1 : over ? 3 : 7;
  c.fillStyle = '#000'; c.fill(outer);
  c.restore();
  if (kind === 'track') {
    c.fillStyle = rgba(TRACK); c.fill(outer);
    c.save(); c.clip(outer);
    // the tartan's grain and the white lane lines
    for (let i = 0; i < (w * h) / 26; i++) { c.fillStyle = `rgba(${r() < 0.5 ? '255,200,170' : '60,10,0'},0.12)`; c.fillRect(r() * w, r() * h, 1.4, 1.4); }
    c.fillStyle = 'rgba(255,255,255,0.9)';
    c.fillRect(0, 6, w, 3); c.fillRect(0, h - 9, w, 3);
    const sh = c.createLinearGradient(0, 0, 0, h);
    sh.addColorStop(0, 'rgba(0,0,0,0.45)'); sh.addColorStop(0.3, 'rgba(0,0,0,0)'); sh.addColorStop(1, 'rgba(0,0,0,0.2)');
    c.fillStyle = sh; c.fillRect(0, 0, w, h);
    c.restore();
    c.lineWidth = 2.5; c.strokeStyle = '#4a1408'; c.stroke(outer);
    c.restore();
    return;
  }
  const col = off ? 0x858a96 : o.color;
  if (round) {
    const g = c.createRadialGradient(w * 0.4, h * 0.35, 2, w / 2, h / 2, w / 2);
    g.addColorStop(0, rgba(shadeColor(col, 0.4))); g.addColorStop(1, rgba(shadeColor(col, -0.2)));
    c.fillStyle = g; c.fill(outer);
    c.lineWidth = 3; c.strokeStyle = rgba(P.trim); c.stroke(outer);
  } else {
    const top = Math.round(Math.min(14, Math.max(6, h * 0.15)));
    // the front face
    c.save(); c.clip(outer);
    const body = c.createLinearGradient(0, top, 0, h);
    body.addColorStop(0, rgba(shadeColor(col, down ? -0.05 : 0.12)));
    body.addColorStop(1, rgba(shadeColor(col, -0.3)));
    c.fillStyle = body; c.fillRect(0, 0, w, h);
    // a soft sheen across the front
    const sheen = c.createLinearGradient(0, 0, w, 0);
    sheen.addColorStop(0, 'rgba(255,255,255,0)'); sheen.addColorStop(0.3, 'rgba(255,255,255,0.12)'); sheen.addColorStop(0.36, 'rgba(255,255,255,0)'); sheen.addColorStop(1, 'rgba(255,255,255,0)');
    c.fillStyle = sheen; c.fillRect(0, top, w, h - top);
    // the top face, lit from above
    const tg = c.createLinearGradient(0, 0, 0, top);
    tg.addColorStop(0, rgba(shadeColor(col, 0.62))); tg.addColorStop(1, rgba(shadeColor(col, 0.35)));
    c.fillStyle = tg; c.fillRect(0, 0, w, top);
    // the gold edge between top and front
    c.fillStyle = off ? '#b7bac2' : rgba(col === P.primary ? shadeColor(P.trim, 0.5) : P.trim);
    c.fillRect(0, top, w, 2.5);
    c.fillStyle = 'rgba(0,0,0,0.25)'; c.fillRect(0, top + 2.5, w, 1.5);
    if (kind === 'board') {
      // faint pinstripes like a stadium banner
      c.fillStyle = 'rgba(255,255,255,0.035)';
      for (let x = 0; x < w; x += 14) c.fillRect(x, top + 4, 6, h);
    }
    c.restore();
    c.lineWidth = 2; c.strokeStyle = rgba(shadeColor(col, -0.65)); c.stroke(outer);
    if (!off && kind === 'button' && w >= 200) {
      const sc = col === P.primary ? '#fffbe6' : rgba(P.trim);
      for (const x of [20, w - 20]) star(c, x, top + (h - top) / 2, Math.min(10, h * 0.12), sc, INK);
    }
  }
  if (on || over) {
    c.save();
    c.shadowColor = rgba(P.trim, 0.95); c.shadowBlur = over ? 12 : 7;
    c.lineWidth = over ? 4 : 3.5; c.strokeStyle = rgba(shadeColor(P.trim, 0.2));
    c.stroke(round ? outer : rounded(1.5, 1.5, w - 3, h - 3, rad));
    c.restore();
  }
  if (down) { c.fillStyle = 'rgba(0,0,0,0.14)'; c.fill(outer); }
  c.restore();
};

/** One laurel leaf along +x from (0, 0), `len` long. */
function leaf(c: CanvasRenderingContext2D, len: number, wd: number, fill: string | CanvasGradient, stroke: string): void {
  c.beginPath();
  c.moveTo(0, 0);
  c.quadraticCurveTo(len * 0.5, -wd, len, 0);
  c.quadraticCurveTo(len * 0.5, wd, 0, 0);
  c.closePath();
  c.fillStyle = fill; c.fill();
  c.strokeStyle = stroke; c.lineWidth = 1.2; c.stroke();
}

/** A laurel branch along an arc: leaves in pairs either side of the stem. */
function laurelArc(c: CanvasRenderingContext2D, cx: number, cy: number, rad: number, a0: number, a1: number, n: number, leafLen: number, fill: string, stroke: string, dir: 1 | -1): void {
  c.strokeStyle = stroke; c.lineWidth = Math.max(1.5, leafLen * 0.12);
  c.beginPath(); c.arc(cx, cy, rad, a0, a1, dir < 0); c.stroke();
  for (let i = 0; i < n; i++) {
    const a = a0 + ((a1 - a0) * (i + 0.5)) / n;
    const x = cx + Math.cos(a) * rad, y = cy + Math.sin(a) * rad;
    const tang = a + (dir > 0 ? Math.PI / 2 : -Math.PI / 2);
    for (const s of [-1, 1]) {
      c.save(); c.translate(x, y); c.rotate(tang + s * 0.55);
      leaf(c, leafLen * (1 - i / (n * 2.4)), leafLen * 0.34, fill, stroke);
      c.restore();
    }
  }
}

/** The winner's certificate behind the how-to and on the pause, result and stadium screens. */
export function certificate(c: CanvasRenderingContext2D, w: number, h: number): void {
  const shape = rounded(0, 0, w, h, 14);
  c.save();
  c.shadowColor = 'rgba(0,0,0,0.5)'; c.shadowBlur = 14; c.shadowOffsetY = 7;
  c.fillStyle = '#fbf5e4'; c.fill(shape);
  c.restore();
  const g = c.createRadialGradient(w / 2, h * 0.4, 10, w / 2, h / 2, Math.max(w, h) * 0.7);
  g.addColorStop(0, '#fffdf4'); g.addColorStop(1, '#f1e3bd');
  c.fillStyle = g; c.fill(shape);
  // the double gold border with corner stars
  c.lineWidth = 5; c.strokeStyle = rgba(GOLD); c.stroke(rounded(9, 9, w - 18, h - 18, 8));
  c.lineWidth = 1.6; c.strokeStyle = '#a8740c'; c.stroke(rounded(17, 17, w - 34, h - 34, 5));
  for (const [x, y] of [[17, 17], [w - 17, 17], [17, h - 17], [w - 17, h - 17]]) star(c, x, y, 9, rgba(GOLD), '#7a5206');
  // a blue band with a gold stripe along the top edge
  c.save(); c.clip(shape);
  c.fillStyle = rgba(BLUE, 0.9); c.fillRect(0, 0, w, 5);
  c.restore();
  c.lineWidth = 2; c.strokeStyle = '#8a6a2a'; c.stroke(shape);
}

/** A golden laurel garland round the screen, a medal in each corner. */
const LAUREL_BORDER: BorderStyle = {
  thick: 26,
  inset: 2,
  edge: (c, len, thick) => {
    const y = thick * 0.42;
    const g = c.createLinearGradient(0, 0, 0, thick);
    g.addColorStop(0, '#fff2b0'); g.addColorStop(0.5, '#f2bf2a'); g.addColorStop(1, '#a8740c');
    c.strokeStyle = '#7a5206'; c.lineWidth = 2.4;
    c.beginPath(); c.moveTo(0, y); c.lineTo(len, y); c.stroke();
    // leaves in pairs along the stem, all pointing one way like a garland
    for (let x = 2; x < len; x += 19) {
      for (const s of [-1, 1]) {
        c.save(); c.translate(x, y); c.rotate(s * 0.62);
        c.shadowColor = 'rgba(0,0,0,0.35)'; c.shadowBlur = 2; c.shadowOffsetY = 1;
        leaf(c, 21, 7.5, g, '#6e4a06');
        c.restore();
      }
    }
  },
  corner: {
    size: 56,
    inset: 0,
    draw: (c, s) => medal(c, s * 0.42, s * 0.46, s * 0.26, true),
  },
};

/** A gold medal on (x, y) with radius r; `ribbon` adds the V of ribbon above it. */
function medal(c: CanvasRenderingContext2D, x: number, y: number, r: number, ribbon: boolean): void {
  if (ribbon) {
    for (const [s, col] of [[-1, '#d8382a'], [1, '#2453b4']] as const) {
      c.fillStyle = col;
      c.beginPath(); c.moveTo(x + s * r * 0.15, y - r * 0.6); c.lineTo(x + s * r * 0.95, y - r * 2); c.lineTo(x + s * r * 0.35, y - r * 2); c.lineTo(x - s * r * 0.35, y - r * 0.7); c.closePath(); c.fill();
      c.strokeStyle = INK; c.lineWidth = 1.2; c.stroke();
    }
  }
  c.save();
  c.shadowColor = 'rgba(0,0,0,0.45)'; c.shadowBlur = 4; c.shadowOffsetY = 2;
  const g = c.createRadialGradient(x - r * 0.35, y - r * 0.4, r * 0.1, x, y, r);
  g.addColorStop(0, '#fff7c2'); g.addColorStop(0.5, '#f2bf2a'); g.addColorStop(1, '#a8740c');
  c.fillStyle = g; c.beginPath(); c.arc(x, y, r, 0, Math.PI * 2); c.fill();
  c.restore();
  c.strokeStyle = '#7a5206'; c.lineWidth = Math.max(1.2, r * 0.08); c.beginPath(); c.arc(x, y, r, 0, Math.PI * 2); c.stroke();
  c.strokeStyle = 'rgba(122,82,6,0.6)'; c.lineWidth = Math.max(1, r * 0.05); c.beginPath(); c.arc(x, y, r * 0.74, 0, Math.PI * 2); c.stroke();
  star(c, x, y, r * 0.42, '#fff3b0', '#8a5c06');
}

/** The emblem behind the logo: a big gold medal in a laurel wreath, its ribbon above. */
export function medalEmblem(c: CanvasRenderingContext2D, size: number): void {
  const u = size / 100;
  c.save();
  c.translate(size / 2, size / 2);
  c.lineJoin = 'round';
  const halo = c.createRadialGradient(0, 4 * u, 6 * u, 0, 4 * u, 50 * u);
  halo.addColorStop(0, 'rgba(255,214,90,0.6)'); halo.addColorStop(1, 'rgba(255,214,90,0)');
  c.fillStyle = halo; c.fillRect(-50 * u, -50 * u, 100 * u, 100 * u);
  // rays
  c.fillStyle = 'rgba(255,240,170,0.35)';
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    c.beginPath(); c.moveTo(0, 6 * u); c.lineTo(Math.cos(a - 0.08) * 48 * u, 6 * u + Math.sin(a - 0.08) * 48 * u); c.lineTo(Math.cos(a + 0.08) * 48 * u, 6 * u + Math.sin(a + 0.08) * 48 * u); c.closePath(); c.fill();
  }
  // the wreath: two branches meeting at the bottom
  const lg = '#3f9a3a';
  laurelArc(c, 0, 8 * u, 34 * u, Math.PI * 0.62, Math.PI * 1.42, 7, 13 * u, lg, '#1d4a1a', 1);
  laurelArc(c, 0, 8 * u, 34 * u, Math.PI * 0.38, -Math.PI * 0.42, 7, 13 * u, lg, '#1d4a1a', -1);
  medal(c, 0, 8 * u, 22 * u, true);
  c.restore();
}

export const PODIUM_THEME: MenuTheme = {
  font: RUSSO_ONE,
  fontScale: 0.88,
  palette: {
    primary: GOLD, secondary: BLUE, board: NAVY, trim: 0xffd23f,
    label: '#ffffff', labelStroke: INK, muted: '#9fb0d8', accent: '#ffd23f',
    heading: '#2453b4', body: '#1d2440', icon: 0xffffff, shade: 0x0a1230,
  },
  logo: {
    fill: ['#fffbe0', '#ffd23f', '#c27a10'],
    outline: INK,
    outlineWidth: 0.12,
    rim: '#ffffff',
    depth: '#5a3406',
    size: 120,
    lineHeight: 0.92,
    emblem: { draw: medalEmblem, size: 200, overlap: 0.4 },
  },
  skin: podiumPainter,
  // dim: the stadium's darkening (main.ts drew it as its own layer before the theme)
  frame: { border: LAUREL_BORDER, notes: certificate, vignette: 0.45, dim: 0.28 },
  overlays: { lose: '#2453b4', titles: ['champion'] },
  // the event card, the results board and the medal table (panels.ts)
  cards: [EVENT_CARD, BOARD_CARD],
  prebake: (scene) => {
    prebakePodium(scene);
    prebakeCallouts(scene);
    // the result heading of a 2nd, 3rd or 4th place ("YOU FINISHED 2nd"), as the result screen paints it
    for (let n = 2; n <= 4; n++) labelTexture(scene, t('placeTitle', { n: ordinal(n) }), overlayHeadingStyle(false));
  },
};
