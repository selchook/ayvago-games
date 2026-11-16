// Putt Park's menu theme (src/core/menu-theme.ts): Righteous, a sunny mini-golf park. The buttons
// are putting-green felt (PLAY a red flag cloth) with white stitching round the edge and a golf
// ball tee'd up at each end of the big ones, the switches sit in a sunk cup liner, strings of
// pennant bunting run round the screen with a pin flag in each corner, the how-to is a wooden
// scorecard with its pencil, and a flag with a ball on the lip of the cup stands behind the logo.
// Every piece is painted once on a canvas (the core caches it under the Ayvago intro); nothing here
// runs in play.
import { shadeColor, type MenuTheme, type SkinPainter, type BorderStyle } from '@core';
import { RIGHTEOUS } from '@core/fonts/righteous';
import { prebakeCourse, COURSE_CARDS } from './panels';

export const RED = 0xe0392b, FELT = 0x2e8b45, DARK_FELT = 0x1f5a2e, YELLOW = 0xffd23f, ORANGE = 0xec7a1a, PURPLE = 0x7a5cd6;
export const INK = '#173016';

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

/** Felt: fine fibres in light and dark (inside a clip). */
function fibres(c: CanvasRenderingContext2D, w: number, h: number, r: () => number): void {
  for (let i = 0; i < Math.min(2400, (w * h) / 18); i++) {
    c.fillStyle = r() < 0.5 ? `rgba(255,255,255,${r() * 0.09})` : `rgba(0,0,0,${r() * 0.14})`;
    c.fillRect(r() * w, r() * h, 1, 1 + r() * 1.5);
  }
}

/** A dimpled golf ball. */
export function golfBall(c: CanvasRenderingContext2D, x: number, y: number, r: number): void {
  c.save();
  c.shadowColor = 'rgba(0,0,0,0.4)'; c.shadowBlur = r * 0.5; c.shadowOffsetY = r * 0.25;
  const g = c.createRadialGradient(x - r * 0.35, y - r * 0.4, r * 0.1, x, y, r);
  g.addColorStop(0, '#ffffff'); g.addColorStop(0.7, '#eef2f4'); g.addColorStop(1, '#b8c2c8');
  c.fillStyle = g; c.beginPath(); c.arc(x, y, r, 0, Math.PI * 2); c.fill();
  c.restore();
  c.fillStyle = 'rgba(120,135,145,0.35)';
  for (const [dx, dy] of [[-0.3, 0.1], [0.1, 0.35], [0.35, -0.05], [0, -0.2], [-0.1, 0.55], [0.5, 0.35], [-0.5, -0.15]]) {
    c.beginPath(); c.arc(x + dx * r, y + dy * r, r * 0.11, 0, Math.PI * 2); c.fill();
  }
  c.strokeStyle = 'rgba(60,70,80,0.5)'; c.lineWidth = Math.max(0.8, r * 0.07);
  c.beginPath(); c.arc(x, y, r, 0, Math.PI * 2); c.stroke();
}

/**
 * The felt skin: a cushion of felt in the piece's colour (PLAY red, the rest putting green) with
 * a white stitched seam inside the edge, a soft top light and a golf ball at each end of a big
 * button. Hover glows yellow, a press sinks it, the chosen switch segment has a yellow rim, a
 * disabled piece is faded. The switch's track is the dark liner of a cup.
 */
const feltPainter: SkinPainter = (c, kind, w, h, o) => {
  const P = o.palette, r = rng(o.seed);
  const down = o.state === 'down', off = o.state === 'off', over = o.state === 'over', on = o.state === 'on';
  const round = kind === 'round';
  const rad = round ? Math.min(w, h) / 2 : Math.min(26, h * 0.36);
  const shape = (i: number): Path2D => {
    if (!round) return rounded(i, i, w - i * 2, h - i * 2, rad - i * 0.7);
    const p = new Path2D(); p.arc(w / 2, h / 2, Math.min(w, h) / 2 - i, 0, Math.PI * 2); return p;
  };
  const outer = shape(0);
  c.save();
  c.translate(0, down ? 3 : 0);
  c.save();
  c.shadowColor = over ? rgba(P.trim, 0.95) : 'rgba(5,25,10,0.55)';
  c.shadowBlur = down ? 3 : over ? 16 : 10;
  c.shadowOffsetY = down ? 1 : over ? 3 : 7;
  c.fillStyle = '#000'; c.fill(outer);
  c.restore();
  if (kind === 'track') {
    c.fillStyle = '#16301c'; c.fill(outer);
    c.save(); c.clip(outer);
    fibres(c, w, h, r);
    const sh = c.createLinearGradient(0, 0, 0, h);
    sh.addColorStop(0, 'rgba(0,0,0,0.6)'); sh.addColorStop(0.35, 'rgba(0,0,0,0.08)'); sh.addColorStop(1, 'rgba(255,255,255,0.06)');
    c.fillStyle = sh; c.fillRect(0, 0, w, h);
    c.restore();
    c.lineWidth = 3.5; c.strokeStyle = '#f4f6f2'; c.stroke(outer);
    c.lineWidth = 1.2; c.strokeStyle = INK; c.stroke(shape(-1.5));
    c.restore();
    return;
  }
  const col = off ? 0x6f7d72 : o.color;
  const body = c.createLinearGradient(0, 0, 0, h);
  body.addColorStop(0, rgba(shadeColor(col, down ? 0.02 : 0.2)));
  body.addColorStop(0.55, rgba(col));
  body.addColorStop(1, rgba(shadeColor(col, -0.3)));
  c.fillStyle = body; c.fill(outer);
  c.save();
  c.clip(outer);
  fibres(c, w, h, r);
  if (kind === 'board') {
    // mown stripes, like a green
    c.fillStyle = 'rgba(255,255,255,0.05)';
    for (let x = 0; x < w; x += 36) c.fillRect(x, 0, 18, h);
  }
  if (!down && !off) {
    const gl = c.createLinearGradient(0, 0, 0, h * 0.5);
    gl.addColorStop(0, 'rgba(255,255,255,0.28)'); gl.addColorStop(1, 'rgba(255,255,255,0)');
    c.fillStyle = gl; c.fillRect(0, 0, w, h * 0.5);
  } else {
    const top = c.createLinearGradient(0, 0, 0, 14);
    top.addColorStop(0, 'rgba(0,0,0,0.42)'); top.addColorStop(1, 'rgba(0,0,0,0)');
    c.fillStyle = top; c.fillRect(0, 0, w, 14);
  }
  c.restore();
  c.lineWidth = 2; c.strokeStyle = rgba(shadeColor(col, -0.65)); c.stroke(outer);
  // the stitched seam
  if (Math.min(w, h) >= 40) {
    c.save();
    c.setLineDash([7, 5]); c.lineCap = 'round';
    c.lineWidth = 2; c.strokeStyle = off ? 'rgba(230,235,230,0.5)' : 'rgba(255,255,255,0.85)';
    c.stroke(shape(6));
    c.restore();
  }
  if (!off && kind === 'button' && w >= 200) for (const x of [h * 0.38, w - h * 0.38]) golfBall(c, x, h / 2, Math.min(10, h * 0.13));
  if (on || over) {
    c.save();
    c.shadowColor = rgba(P.trim, 0.95); c.shadowBlur = over ? 12 : 7;
    c.lineWidth = over ? 4 : 3.5; c.strokeStyle = rgba(P.trim); c.stroke(shape(1.5));
    c.restore();
  }
  if (down) { c.fillStyle = 'rgba(0,0,0,0.14)'; c.fill(outer); }
  c.restore();
};

/** The wooden scorecard behind the how-to and on the pause, result and course screens. */
export function scorecard(c: CanvasRenderingContext2D, w: number, h: number): void {
  const r = rng(Math.round(w * 11 + h));
  const shape = rounded(0, 0, w, h, 20);
  c.save();
  c.shadowColor = 'rgba(0,0,0,0.5)'; c.shadowBlur = 14; c.shadowOffsetY = 7;
  c.fillStyle = '#d9b47a'; c.fill(shape);
  c.restore();
  const g = c.createLinearGradient(0, 0, w, h);
  g.addColorStop(0, '#f0d29a'); g.addColorStop(1, '#d6ad6c');
  c.fillStyle = g; c.fill(shape);
  // the board's grain
  c.save(); c.clip(shape);
  for (let i = 0; i < h / 6; i++) {
    const y0 = r() * h, amp = 1 + r() * 2;
    c.strokeStyle = `rgba(120,70,20,${0.08 + r() * 0.12})`; c.lineWidth = 0.8 + r();
    c.beginPath();
    for (let x = -4; x <= w + 4; x += 8) { const y = y0 + Math.sin(x * 0.02 + i) * amp; x < 0 ? c.moveTo(x, y) : c.lineTo(x, y); }
    c.stroke();
  }
  c.restore();
  // the paper card on the board, with a green header band and ruled lines
  const pad = 16;
  const card = rounded(pad, pad, w - pad * 2, h - pad * 2, 10);
  c.fillStyle = '#fbf8ee'; c.fill(card);
  c.save(); c.clip(card);
  c.fillStyle = rgba(FELT); c.fillRect(pad, pad, w - pad * 2, 7);
  c.fillStyle = rgba(YELLOW); c.fillRect(pad, pad + 7, w - pad * 2, 2.5);
  c.strokeStyle = 'rgba(46,139,69,0.13)'; c.lineWidth = 1.2;
  for (let y = pad + 50; y < h - pad; y += 34) { c.beginPath(); c.moveTo(pad, y); c.lineTo(w - pad, y); c.stroke(); }
  c.restore();
  c.lineWidth = 1.5; c.strokeStyle = 'rgba(80,60,30,0.45)'; c.stroke(card);
  c.lineWidth = 2.5; c.strokeStyle = '#8a5a26'; c.stroke(shape);
  // the clip at the top left, and a little pencil at the bottom right
  c.save();
  c.shadowColor = 'rgba(0,0,0,0.4)'; c.shadowBlur = 4; c.shadowOffsetY = 2;
  const mg = c.createLinearGradient(0, 0, 0, 22);
  mg.addColorStop(0, '#f2f4f6'); mg.addColorStop(1, '#8b949c');
  c.fillStyle = mg; c.fill(rounded(24, 2, 52, 18, 6));
  c.restore();
  c.strokeStyle = '#5a636b'; c.lineWidth = 1.2; c.stroke(rounded(24, 2, 52, 18, 6));
  c.save();
  c.translate(w - 64, h - 22); c.rotate(-0.25);
  c.fillStyle = '#ffcf3a'; c.fillRect(0, -4, 46, 8);
  c.fillStyle = '#f2b8a0'; c.fillRect(-6, -4, 6, 8);
  c.fillStyle = '#e8c9a0'; c.beginPath(); c.moveTo(46, -4); c.lineTo(56, 0); c.lineTo(46, 4); c.closePath(); c.fill();
  c.fillStyle = '#333'; c.beginPath(); c.moveTo(53, -1.2); c.lineTo(56, 0); c.lineTo(53, 1.2); c.closePath(); c.fill();
  c.strokeStyle = 'rgba(80,60,20,0.6)'; c.lineWidth = 1; c.strokeRect(-6, -4, 52, 8);
  c.restore();
}

const PENNANTS = ['#e0392b', '#ffd23f', '#ffffff', '#2f7dff', '#2e8b45', '#ec7a1a'];

/** A string of pennant bunting round the screen, a pin flag in each corner. */
const BUNTING_BORDER: BorderStyle = {
  thick: 24,
  inset: 0,
  edge: (c, len, thick) => {
    // the string sags a little between its ties
    const sag = (x: number) => 3 + Math.sin((x / 96) * Math.PI) ** 2 * 3;
    c.strokeStyle = 'rgba(250,250,245,0.9)'; c.lineWidth = 1.6;
    c.beginPath();
    for (let x = 0; x <= len; x += 4) x ? c.lineTo(x, sag(x)) : c.moveTo(x, sag(x));
    c.stroke();
    let i = 0;
    for (let x = 6; x < len - 10; x += 26, i++) {
      const y0 = sag(x), y1 = sag(x + 18);
      c.save();
      c.shadowColor = 'rgba(0,0,0,0.35)'; c.shadowBlur = 2; c.shadowOffsetY = 1.5;
      c.fillStyle = PENNANTS[i % PENNANTS.length];
      c.beginPath(); c.moveTo(x, y0); c.lineTo(x + 18, y1); c.lineTo(x + 9, thick - 2); c.closePath(); c.fill();
      c.restore();
      c.strokeStyle = 'rgba(0,0,0,0.25)'; c.lineWidth = 1; c.stroke();
    }
  },
  corner: {
    size: 62,
    inset: 0,
    draw: (c, s) => {
      // a pin flag stuck in the corner
      c.save();
      c.shadowColor = 'rgba(0,0,0,0.5)'; c.shadowBlur = 4; c.shadowOffsetY = 2;
      c.strokeStyle = '#f4f4f0'; c.lineWidth = 3; c.lineCap = 'round';
      c.beginPath(); c.moveTo(s * 0.22, s * 0.9); c.lineTo(s * 0.22, s * 0.12); c.stroke();
      c.fillStyle = '#e0392b';
      c.beginPath(); c.moveTo(s * 0.24, s * 0.12); c.quadraticCurveTo(s * 0.55, s * 0.18, s * 0.82, s * 0.24); c.quadraticCurveTo(s * 0.55, s * 0.32, s * 0.24, s * 0.42); c.closePath(); c.fill();
      c.restore();
      c.fillStyle = '#ffd23f'; c.beginPath(); c.arc(s * 0.22, s * 0.11, 3, 0, Math.PI * 2); c.fill();
    },
  },
};

/** The emblem behind the logo: a red pin flag in the cup, a golf ball teetering on the lip. */
export function flagEmblem(c: CanvasRenderingContext2D, size: number): void {
  const u = size / 100;
  c.save();
  c.translate(size / 2, size / 2);
  c.lineJoin = 'round';
  const halo = c.createRadialGradient(0, 10 * u, 6 * u, 0, 10 * u, 50 * u);
  halo.addColorStop(0, 'rgba(255,240,150,0.55)'); halo.addColorStop(1, 'rgba(255,240,150,0)');
  c.fillStyle = halo; c.fillRect(-50 * u, -50 * u, 100 * u, 100 * u);
  // the green: an oval of felt with mown stripes and a fringe
  c.save();
  c.shadowColor = 'rgba(0,0,0,0.45)'; c.shadowBlur = 8 * u; c.shadowOffsetY = 4 * u;
  c.fillStyle = '#1f6a34';
  c.beginPath(); c.ellipse(0, 28 * u, 46 * u, 15 * u, 0, 0, Math.PI * 2); c.fill();
  c.restore();
  const gg = c.createLinearGradient(0, 14 * u, 0, 42 * u);
  gg.addColorStop(0, '#5cc46a'); gg.addColorStop(1, '#2e8b45');
  c.fillStyle = gg;
  c.beginPath(); c.ellipse(0, 27 * u, 43 * u, 13 * u, 0, 0, Math.PI * 2); c.fill();
  c.save();
  c.beginPath(); c.ellipse(0, 27 * u, 43 * u, 13 * u, 0, 0, Math.PI * 2); c.clip();
  c.fillStyle = 'rgba(255,255,255,0.1)';
  for (let x = -44; x < 44; x += 12) c.fillRect(x * u, 10 * u, 6 * u, 40 * u);
  c.restore();
  c.strokeStyle = INK; c.lineWidth = 2 * u;
  c.beginPath(); c.ellipse(0, 27 * u, 43 * u, 13 * u, 0, 0, Math.PI * 2); c.stroke();
  // the cup
  c.fillStyle = '#0c1a0e';
  c.beginPath(); c.ellipse(4 * u, 27 * u, 11 * u, 4.4 * u, 0, 0, Math.PI * 2); c.fill();
  c.strokeStyle = '#f4f4f0'; c.lineWidth = 1.4 * u;
  c.beginPath(); c.ellipse(4 * u, 27 * u, 11 * u, 4.4 * u, 0, Math.PI, Math.PI * 2); c.stroke();
  // the pin and its flag
  c.strokeStyle = INK; c.lineWidth = 4.4 * u; c.lineCap = 'round';
  c.beginPath(); c.moveTo(4 * u, 27 * u); c.lineTo(4 * u, -42 * u); c.stroke();
  c.strokeStyle = '#f4f4f0'; c.lineWidth = 2.4 * u;
  c.beginPath(); c.moveTo(4 * u, 27 * u); c.lineTo(4 * u, -42 * u); c.stroke();
  const fl = new Path2D();
  fl.moveTo(5 * u, -42 * u);
  fl.quadraticCurveTo(20 * u, -46 * u, 36 * u, -36 * u);
  fl.quadraticCurveTo(22 * u, -30 * u, 34 * u, -20 * u);
  fl.quadraticCurveTo(18 * u, -24 * u, 5 * u, -20 * u);
  fl.closePath();
  const fg = c.createLinearGradient(0, -46 * u, 0, -20 * u);
  fg.addColorStop(0, '#ff6a5a'); fg.addColorStop(1, '#b8221a');
  c.fillStyle = fg; c.fill(fl);
  c.strokeStyle = INK; c.lineWidth = 2 * u; c.stroke(fl);
  c.fillStyle = '#ffd23f'; c.beginPath(); c.arc(4 * u, -43 * u, 3 * u, 0, Math.PI * 2); c.fill(); c.lineWidth = 1.2 * u; c.stroke();
  // the ball on the lip, about to drop
  golfBall(c, -9 * u, 22 * u, 6.5 * u);
  c.restore();
}

export const PUTT_THEME: MenuTheme = {
  font: RIGHTEOUS,
  palette: {
    primary: RED, secondary: FELT, board: DARK_FELT, trim: YELLOW,
    label: '#ffffff', labelStroke: INK, muted: '#a9d4b0', accent: '#ffd23f',
    heading: '#b5281e', body: '#2a2014', icon: 0xffffff, shade: 0x0b1f14,
  },
  logo: {
    fill: ['#ffffff', '#fff2a8', '#ffc21a'],
    outline: INK,
    outlineWidth: 0.13,
    rim: '#ffffff',
    depth: '#0f3a1a',
    size: 120,
    upper: true,
    lineHeight: 0.92,
    emblem: { draw: flagEmblem, size: 210, overlap: 0.4 },
  },
  skin: feltPainter,
  // dim: the fly-over's darkening (main.ts drew it as its own layer before the theme)
  frame: { border: BUNTING_BORDER, notes: scorecard, vignette: 0.45, dim: 0.24 },
  overlays: { lose: '#b5281e', titles: ['roundOver'] },
  // the course picker, the hole cards and the scorecard (panels.ts)
  cards: COURSE_CARDS,
  prebake: (scene) => prebakeCourse(scene),
};
