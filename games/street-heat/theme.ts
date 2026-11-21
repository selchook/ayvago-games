// Street Heat's look: a night city under sodium lamps, seen through a 70s/80s crime-show lens.
// Racing Sans One (a slanted display face) in a sunset chrome gradient with a cyan neon rim; the
// buttons and the HUD chips are smoked glass with a glowing neon tube round them (sodium orange,
// hot pink, cyan); the screen's frame is a chrome strip with a pink neon line and a police light
// in each corner; the how-to, the briefings, the pause and the result screens are case files on
// manila card with a paper clip and a red stamp. Every piece is painted once (the core caches it).
import Phaser from 'phaser';
import { STEERING_PIECES, shadeColor, type MenuTheme, type SkinPainter, type BorderStyle, type LabelStyle, labelAt, fitWidth, upper, type HudSkin } from '@core';
import { RACING_SANS_ONE } from '@core/fonts/racing-sans-one';

export const ORANGE = 0xff8a1e, PINK = 0xff3fa4, CYAN = 0x3ef2ff, NIGHT = 0x140a26, MANILA = 0xe8d4a0;
export const INK = '#1a0b2e';
export const PAPER_INK = '#2a1d14';

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

/** A neon tube along a path: a wide soft glow, the coloured tube and its white-hot core. */
function neon(c: CanvasRenderingContext2D, path: Path2D, color: number, k = 1, width = 3): void {
  c.save();
  c.shadowColor = rgba(color, 0.95 * k);
  c.shadowBlur = 14 * k;
  c.lineWidth = width + 1.5;
  c.strokeStyle = rgba(color, 0.9 * k);
  c.stroke(path);
  c.shadowBlur = 5 * k;
  c.stroke(path);
  c.restore();
  c.lineWidth = Math.max(1, width * 0.4);
  c.strokeStyle = rgba(shadeColor(color, 0.65), 0.9 * k);
  c.stroke(path);
}

/** Smoked glass: a dark violet body, a sheen on top, faint scan lines like an old TV. */
function glassBody(c: CanvasRenderingContext2D, shape: Path2D, w: number, h: number, tint: number, sunk: boolean): void {
  const g = c.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, rgba(shadeColor(NIGHT, sunk ? -0.2 : 0.18), 0.94));
  g.addColorStop(1, rgba(shadeColor(NIGHT, -0.35), 0.96));
  c.fillStyle = g; c.fill(shape);
  c.save();
  c.clip(shape);
  // the tube's colour bleeding into the glass
  const bleed = c.createLinearGradient(0, h, 0, 0);
  bleed.addColorStop(0, rgba(tint, sunk ? 0.08 : 0.22));
  bleed.addColorStop(0.6, rgba(tint, 0));
  c.fillStyle = bleed; c.fillRect(0, 0, w, h);
  c.fillStyle = 'rgba(255,255,255,0.035)';
  for (let y = 2; y < h; y += 4) c.fillRect(0, y, w, 1);
  if (!sunk) {
    const sh = c.createLinearGradient(0, 0, 0, h * 0.5);
    sh.addColorStop(0, 'rgba(255,255,255,0.16)'); sh.addColorStop(1, 'rgba(255,255,255,0)');
    c.fillStyle = sh; c.fillRect(0, 0, w, h * 0.5);
  }
  c.restore();
  // a chrome bezel
  c.lineWidth = 2;
  const chrome = c.createLinearGradient(0, 0, 0, h);
  chrome.addColorStop(0, 'rgba(230,230,255,0.75)'); chrome.addColorStop(0.5, 'rgba(90,80,120,0.6)'); chrome.addColorStop(1, 'rgba(200,190,230,0.55)');
  c.strokeStyle = chrome; c.stroke(shape);
}

/** The skin: smoked glass with a neon tube in the piece's colour; hover glows cyan, pressed sinks. */
const neonPainter: SkinPainter = (c, kind, w, h, o) => {
  const P = o.palette;
  const down = o.state === 'down', off = o.state === 'off', over = o.state === 'over', on = o.state === 'on';
  const sunk = down || off || kind === 'track';
  const round = kind === 'round';
  const r = round ? Math.min(w, h) / 2 : Math.min(14, h * 0.22);
  const shape = round ? (() => { const p = new Path2D(); p.arc(w / 2, h / 2, Math.min(w, h) / 2, 0, Math.PI * 2); return p; })() : rounded(0, 0, w, h, r);
  c.save();
  c.translate(0, down ? 3 : 0);
  c.save();
  c.shadowColor = 'rgba(0,0,0,0.6)'; c.shadowBlur = sunk ? 4 : 12; c.shadowOffsetY = sunk ? 1 : 6;
  c.fillStyle = '#000'; c.fill(shape);
  c.restore();
  const tube = off ? 0x5a5470 : on ? P.trim : over ? shadeColor(o.color, 0.25) : o.color;
  glassBody(c, shape, w, h, tube, sunk);
  if (kind === 'track') { c.restore(); return; }
  if (kind === 'board') {
    // a board: pinstripe neon inside the bezel
    const inner = rounded(8, 8, w - 16, h - 16, Math.max(4, r - 6));
    neon(c, inner, P.secondary, 0.55, 2);
    c.restore();
    return;
  }
  const inset = round ? 5 : 6;
  const inner = round ? (() => { const p = new Path2D(); p.arc(w / 2, h / 2, Math.min(w, h) / 2 - inset, 0, Math.PI * 2); return p; })() : rounded(inset, inset, w - inset * 2, h - inset * 2, Math.max(4, r - inset));
  neon(c, inner, tube, off ? 0.35 : down ? 0.6 : over || on ? 1.25 : 1, kind === 'button' && w >= 300 ? 3.4 : 2.6);
  if (on) neon(c, shape, P.trim, 0.8, 2);
  c.restore();
};

/** The frame: a thin chrome strip with a pink neon line; a red-and-blue police light in each corner. */
const BORDER: BorderStyle = {
  thick: 10,
  inset: 0,
  edge: (c, len, thick) => {
    const g = c.createLinearGradient(0, 0, 0, thick);
    g.addColorStop(0, 'rgba(40,30,70,0.95)'); g.addColorStop(0.5, 'rgba(150,140,190,0.9)'); g.addColorStop(1, 'rgba(30,20,50,0.95)');
    c.fillStyle = g; c.fillRect(0, 0, len, thick - 3);
    c.save();
    c.shadowColor = rgba(PINK, 1); c.shadowBlur = 8;
    c.fillStyle = rgba(PINK, 0.95); c.fillRect(0, thick - 3, len, 2);
    c.restore();
  },
  corner: {
    size: 54,
    inset: 0,
    draw: (c, s) => {
      const x = s * 0.42, y = s * 0.42, r = s * 0.24;
      c.save();
      // the glow
      for (const [col, a0, a1] of [[0xff2030, Math.PI * 0.5, Math.PI * 1.5], [0x2050ff, -Math.PI * 0.5, Math.PI * 0.5]] as const) {
        const g = c.createRadialGradient(x, y, r * 0.3, x, y, s * 0.5);
        g.addColorStop(0, rgba(col, 0.55)); g.addColorStop(1, rgba(col, 0));
        c.fillStyle = g; c.beginPath(); c.moveTo(x, y); c.arc(x, y, s * 0.5, a0, a1); c.closePath(); c.fill();
      }
      // the dome: red half, blue half, a chrome base
      c.fillStyle = '#2a2438'; c.beginPath(); c.roundRect(x - r * 1.2, y + r * 0.55, r * 2.4, r * 0.55, 3); c.fill();
      for (const [col, a0, a1] of [[0xff3040, Math.PI, Math.PI * 1.5], [0x3a6aff, Math.PI * 1.5, Math.PI * 2]] as const) {
        const g = c.createLinearGradient(x - r, y - r, x + r, y + r);
        g.addColorStop(0, rgba(shadeColor(col, 0.5))); g.addColorStop(1, rgba(col));
        c.fillStyle = g; c.beginPath(); c.moveTo(x, y + r * 0.6); c.arc(x, y + r * 0.6, r, a0, a1); c.closePath(); c.fill();
      }
      c.fillStyle = 'rgba(255,255,255,0.7)'; c.beginPath(); c.ellipse(x - r * 0.35, y - r * 0.05, r * 0.18, r * 0.3, -0.5, 0, Math.PI * 2); c.fill();
      c.restore();
    },
  },
};

/** The case file: manila card, a folder tab, a paper clip, typed lines faintly ruled, a red stamp. */
export function caseFile(c: CanvasRenderingContext2D, w: number, h: number): void {
  const r = rng(Math.round(w * 7 + h));
  const tabW = Math.min(180, w * 0.34);
  const body = new Path2D();
  body.moveTo(0, 22); body.lineTo(18, 22); body.lineTo(30, 4); body.lineTo(30 + tabW, 4); body.lineTo(42 + tabW, 22); body.lineTo(w - 10, 22);
  body.quadraticCurveTo(w, 22, w, 32); body.lineTo(w, h - 10); body.quadraticCurveTo(w, h, w - 10, h); body.lineTo(10, h); body.quadraticCurveTo(0, h, 0, h - 10); body.closePath();
  c.save();
  c.shadowColor = 'rgba(0,0,0,0.55)'; c.shadowBlur = 16; c.shadowOffsetY = 8;
  c.fillStyle = rgba(MANILA); c.fill(body);
  c.restore();
  c.save();
  c.clip(body);
  const g = c.createLinearGradient(0, 0, w, h);
  g.addColorStop(0, 'rgba(255,248,220,0.35)'); g.addColorStop(1, 'rgba(120,80,30,0.18)');
  c.fillStyle = g; c.fillRect(0, 0, w, h);
  for (let i = 0; i < (w * h) / 60; i++) { c.fillStyle = `rgba(90,60,20,${r() * 0.06})`; c.fillRect(r() * w, r() * h, 1.5, 1.5); }
  // a coffee ring
  c.strokeStyle = 'rgba(120,70,20,0.12)'; c.lineWidth = 5;
  c.beginPath(); c.arc(w * 0.82, h * 0.78, Math.min(w, h) * 0.09, 0.3, Math.PI * 1.7); c.stroke();
  // faint rules
  c.strokeStyle = 'rgba(90,70,40,0.1)'; c.lineWidth = 1;
  for (let y = 70; y < h - 20; y += 30) { c.beginPath(); c.moveTo(24, y); c.lineTo(w - 24, y); c.stroke(); }
  c.restore();
  c.lineWidth = 2; c.strokeStyle = 'rgba(90,60,25,0.55)'; c.stroke(body);
  // the paper clip on the top right
  c.save();
  c.translate(w - 70, 10);
  c.rotate(0.12);
  c.strokeStyle = '#b8bcc8'; c.lineWidth = 3.2; c.lineCap = 'round';
  c.beginPath(); c.moveTo(8, 50); c.lineTo(8, 10); c.arc(16, 10, 8, Math.PI, 0); c.lineTo(24, 56); c.arc(14, 56, 10, 0, Math.PI); c.lineTo(4, 16); c.stroke();
  c.restore();
  // a red stamp: a badge star in a double ring
  c.save();
  c.translate(w - 64, h - 60);
  c.rotate(-0.25);
  c.strokeStyle = 'rgba(196,42,42,0.55)'; c.fillStyle = 'rgba(196,42,42,0.45)'; c.lineWidth = 3;
  c.beginPath(); c.arc(0, 0, 34, 0, Math.PI * 2); c.stroke();
  c.beginPath(); c.arc(0, 0, 27, 0, Math.PI * 2); c.stroke();
  c.beginPath();
  for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, rr = i % 2 ? 9 : 20; c.lineTo(Math.cos(a) * rr, Math.sin(a) * rr); }
  c.closePath(); c.fill();
  c.restore();
}

/** Behind the logo: a police light bar's red and blue glow, a muscle car's grille and headlights, speed lines. */
export function heatEmblem(c: CanvasRenderingContext2D, size: number): void {
  const u = size / 100;
  c.save();
  c.translate(size / 2, size / 2);
  for (const [col, x] of [[0xff2030, -26], [0x2a5aff, 26]] as const) {
    const g = c.createRadialGradient(x * u, -8 * u, 2 * u, x * u, -8 * u, 46 * u);
    g.addColorStop(0, rgba(col, 0.85)); g.addColorStop(0.4, rgba(col, 0.35)); g.addColorStop(1, rgba(col, 0));
    c.fillStyle = g; c.fillRect(-50 * u, -50 * u, 100 * u, 100 * u);
  }
  // the car's front: a wide low body, the grille, two headlight beams
  c.lineJoin = 'round';
  const body = new Path2D();
  body.moveTo(-40 * u, 14 * u); body.lineTo(-36 * u, 0); body.lineTo(-24 * u, -4 * u); body.lineTo(-16 * u, -16 * u); body.lineTo(16 * u, -16 * u); body.lineTo(24 * u, -4 * u);
  body.lineTo(36 * u, 0); body.lineTo(40 * u, 14 * u); body.lineTo(34 * u, 22 * u); body.lineTo(-34 * u, 22 * u); body.closePath();
  const bg = c.createLinearGradient(0, -16 * u, 0, 22 * u);
  bg.addColorStop(0, '#3a2a5a'); bg.addColorStop(1, '#120a22');
  c.fillStyle = bg; c.fill(body);
  c.strokeStyle = INK; c.lineWidth = 2.4 * u; c.stroke(body);
  c.fillStyle = 'rgba(120,200,255,0.35)';
  c.beginPath(); c.moveTo(-13 * u, -13 * u); c.lineTo(13 * u, -13 * u); c.lineTo(19 * u, -5 * u); c.lineTo(-19 * u, -5 * u); c.closePath(); c.fill();
  c.fillStyle = '#0a0612'; c.fillRect(-14 * u, 4 * u, 28 * u, 9 * u);
  c.strokeStyle = 'rgba(200,200,230,0.8)'; c.lineWidth = 1.2 * u;
  for (let x = -12; x <= 12; x += 4) { c.beginPath(); c.moveTo(x * u, 5 * u); c.lineTo(x * u, 12 * u); c.stroke(); }
  for (const s of [-1, 1]) {
    const hx = s * 25 * u, hy = 8 * u;
    const beam = c.createRadialGradient(hx, hy, 1, hx, hy, 22 * u);
    beam.addColorStop(0, 'rgba(255,250,220,1)'); beam.addColorStop(0.3, 'rgba(255,220,140,0.6)'); beam.addColorStop(1, 'rgba(255,200,120,0)');
    c.fillStyle = beam; c.beginPath(); c.arc(hx, hy, 22 * u, 0, Math.PI * 2); c.fill();
    c.fillStyle = '#fffbe8'; c.beginPath(); c.ellipse(hx, hy, 5 * u, 3.6 * u, 0, 0, Math.PI * 2); c.fill();
  }
  // speed lines left and right
  c.strokeStyle = 'rgba(255,200,120,0.85)'; c.lineCap = 'round';
  for (const [y, len, wdt] of [[-2, 10, 2.2], [6, 14, 2.6], [14, 9, 2]] as const) {
    c.lineWidth = wdt * u;
    for (const s of [-1, 1]) { c.beginPath(); c.moveTo(s * 44 * u, y * u); c.lineTo(s * (44 + len) * u, y * u); c.stroke(); }
  }
  c.restore();
}

/** The HUD chips: smoked glass, a thin sodium neon tube, Racing Sans readouts, cyan captions. */
export const HUD_SKIN: HudSkin = {
  pad: 12,
  font: RACING_SANS_ONE,
  text: '#fff4e2',
  caption: '#7ff6ff',
  chip: (c, w, h, pad) => {
    c.save();
    c.translate(pad, pad);
    const r = Math.min(h / 2, 12);
    const shape = rounded(0, 0, w, h, w === h ? w / 2 : r);
    c.save();
    c.shadowColor = 'rgba(0,0,0,0.55)'; c.shadowBlur = 8; c.shadowOffsetY = 3;
    c.fillStyle = 'rgba(10,6,20,0.82)'; c.fill(shape);
    c.restore();
    c.save(); c.clip(shape);
    const g = c.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, 'rgba(70,40,110,0.55)'); g.addColorStop(1, 'rgba(20,10,40,0.55)');
    c.fillStyle = g; c.fillRect(0, 0, w, h);
    c.fillStyle = 'rgba(255,255,255,0.04)';
    for (let y = 2; y < h; y += 4) c.fillRect(0, y, w, 1);
    c.fillStyle = 'rgba(255,255,255,0.12)'; c.fillRect(0, 0, w, h * 0.42);
    c.restore();
    const inner = rounded(2.5, 2.5, w - 5, h - 5, w === h ? (w - 5) / 2 : r - 2);
    neon(c, inner, ORANGE, 0.75, 2);
    c.restore();
  },
};

/** Sizes of the game's own panels (painted ahead). */
export const PANEL = { listW: 440, listH: 560, fileW: 470, fileH: 600, garageW: 560, garageH: 600, cardW: 620, cardH: 470, mapW: 760, mapH: 640 };

export const HEAT_THEME: MenuTheme = {
  font: RACING_SANS_ONE,
  fontScale: 1,
  palette: {
    primary: ORANGE, secondary: PINK, board: NIGHT, trim: CYAN,
    label: '#fff4e2', labelStroke: INK, muted: '#9d8bc2', accent: '#ffd23f',
    heading: '#c42a2a', body: PAPER_INK, icon: 0xfff4e2, shade: 0x07040f,
  },
  logo: {
    fill: ['#fff6c8', '#ffb03a', '#ff3f6a'],
    outline: INK,
    outlineWidth: 0.12,
    rim: '#3ef2ff',
    depth: '#5a0a3a',
    size: 130,
    upper: true,
    lineHeight: 0.9,
    emblem: { draw: heatEmblem, size: 230, overlap: 0.42 },
  },
  skin: neonPainter,
  pieces: [...STEERING_PIECES],
  frame: { border: BORDER, notes: caseFile, vignette: 0.55, dim: 0.3 },
  overlays: { card: 'notes', ink: PAPER_INK, lose: '#c42a2a', win: '#d8601a', titles: ['busted', 'wrecked', 'jobDone', 'jobFailed', 'shiftOver', 'f_time', 'f_cargo', 'f_lost', 'f_spotted', 'f_escaped', 'f_escort'] },
  cards: [{ w: PANEL.cardW, h: PANEL.cardH }],
  hud: HUD_SKIN,
};

// ------------------------------------------------------------------ callouts

/** `c` mixed toward `to` by k (both #rrggbb). */
function mix(c: string, to: string, k: number): string {
  const a = parseInt(c.slice(1), 16), b = parseInt(to.slice(1), 16);
  const ch = (sh: number) => Math.round(((a >> sh) & 255) * (1 - k) + ((b >> sh) & 255) * k);
  return '#' + ((ch(16) << 16) | (ch(8) << 8) | ch(0)).toString(16).padStart(6, '0');
}

export const BANNER_PX = 64;
export const WORD_PX = 38;

/** The callouts' look: chrome-bright top, the colour, a darker foot; a deep ink outline. */
export function calloutStyle(color: string, size = BANNER_PX): LabelStyle {
  return { size, fill: [mix(color, '#ffffff', 0.65), color, mix(color, '#000000', 0.25)], stroke: INK, strokeWidth: Math.round(size * 0.16) };
}
export const subStyle = (color: string, size = 28): LabelStyle => ({ size, color, stroke: INK, strokeWidth: 6 });
/** Racing Sans has upper and lower case; callouts are upper-cased the Turkish way. */
export const caps = (s: string): string => upper(s);

export function calloutAt(scene: Phaser.Scene, x: number, y: number, s: string, o: LabelStyle, ax: 0 | 0.5 | 1 = 0.5): Phaser.GameObjects.Image {
  return labelAt(scene, x, y, caps(s), o, ax);
}

export { fitWidth };
