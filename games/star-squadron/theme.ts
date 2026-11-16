// Star Squadron's menu theme (src/core/menu-theme.ts): Audiowide, cold blue and cyan with orange
// thrusters. The buttons are brushed-metal plates with cut corners, screws and a glowing edge, the
// screen sits in a HUD frame with corner brackets, the how-to on a cockpit display panel and a
// winged squadron badge behind the logo. Every piece is painted once on a canvas (the core caches
// it); nothing here runs in play. Also the TALENTS button in the same skin (menuOption).
import Phaser from 'phaser';
import { t, txt, SkinButton, shadeColor, type MenuTheme, type SkinPainter, type BorderStyle } from '@core';
import { AUDIOWIDE } from '@core/fonts/audiowide';
import { DUST } from './art';
import { loadMeta } from './meta';
import { prebakeTalents, TALENT_PANEL } from './talentsui';

/** The run summary's card (PlayScene.showSummary). */
export const SUMMARY_W = 600, SUMMARY_H = 340;
/** The TALENTS button under the difficulty switch. */
const TAL_W = 340, TAL_H = 92;

const CYAN = 0x3ee6ff, ORANGE = 0xff8a2a, NAVY = '#061230';

const rgba = (c: number, a = 1): string => `rgba(${(c >> 16) & 255},${(c >> 8) & 255},${c & 255},${a})`;

function rng(seed: number): () => number {
  let s = (seed >>> 0) % 2147483647 || 1;
  return () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
}

/** A rectangle with its four corners cut at 45 degrees (k px). */
function chamfer(x: number, y: number, w: number, h: number, k: number): Path2D {
  const p = new Path2D();
  p.moveTo(x + k, y); p.lineTo(x + w - k, y); p.lineTo(x + w, y + k); p.lineTo(x + w, y + h - k);
  p.lineTo(x + w - k, y + h); p.lineTo(x + k, y + h); p.lineTo(x, y + h - k); p.lineTo(x, y + k);
  p.closePath();
  return p;
}

/** A cross-head screw: a steel disc with a dark cross. */
function screw(c: CanvasRenderingContext2D, x: number, y: number, r: number): void {
  c.save();
  c.fillStyle = 'rgba(0,0,0,0.5)';
  c.beginPath(); c.arc(x + r * 0.2, y + r * 0.3, r * 1.15, 0, Math.PI * 2); c.fill();
  const g = c.createRadialGradient(x - r * 0.4, y - r * 0.4, r * 0.1, x, y, r);
  g.addColorStop(0, '#f4f8ff'); g.addColorStop(0.55, '#9aa8bf'); g.addColorStop(1, '#3c475c');
  c.fillStyle = g;
  c.beginPath(); c.arc(x, y, r, 0, Math.PI * 2); c.fill();
  c.strokeStyle = 'rgba(20,28,44,0.85)'; c.lineWidth = Math.max(1, r * 0.32);
  c.beginPath(); c.moveTo(x - r * 0.55, y - r * 0.2); c.lineTo(x + r * 0.55, y + r * 0.2); c.moveTo(x - r * 0.2, y + r * 0.55); c.lineTo(x + r * 0.2, y - r * 0.55); c.stroke();
  c.restore();
}

/** Brushed metal: fine horizontal streaks over the face (inside a clip). */
function brushed(c: CanvasRenderingContext2D, w: number, h: number, r: () => number): void {
  for (let i = 0; i < h * 1.4; i++) {
    const y = r() * h;
    c.strokeStyle = r() < 0.5 ? `rgba(255,255,255,${0.03 + r() * 0.06})` : `rgba(0,0,0,${0.04 + r() * 0.07})`;
    c.lineWidth = 0.6 + r() * 0.9;
    const x0 = r() * w * 0.5;
    c.beginPath(); c.moveTo(x0 - 10, y); c.lineTo(x0 + w * (0.4 + r() * 0.8), y + (r() - 0.5)); c.stroke();
  }
}

/**
 * The sci-fi plate skin: a brushed-metal face in the piece's colour with cut corners, an inner
 * bevel, a glass sheen, panel seams and screws, and a glowing edge (orange on PLAY, cyan on the
 * rest) that flares on hover and on the selected switch segment.
 */
const platePainter: SkinPainter = (c, kind, w, h, o) => {
  const P = o.palette, r = rng(o.seed);
  const down = o.state === 'down', off = o.state === 'off', on = o.state === 'on', over = o.state === 'over';
  const sunk = down || off || kind === 'track';
  const col = off ? shadeColor(o.color, -0.5) : o.color;
  const glow = o.color === P.primary ? ORANGE : CYAN;
  const round = kind === 'round';
  const k = round ? 0 : Math.min(16, h * 0.24);
  const shape = (() => {
    if (!round) return chamfer(0, 0, w, h, k);
    const p = new Path2D(); p.arc(w / 2, h / 2, Math.min(w, h) / 2, 0, Math.PI * 2); return p;
  })();
  c.save();
  c.translate(0, down ? 3 : 0);
  // drop shadow
  c.save();
  c.shadowColor = 'rgba(0,0,0,0.6)'; c.shadowBlur = sunk ? 3 : 10; c.shadowOffsetY = sunk ? 1 : 6;
  c.fillStyle = '#000'; c.fill(shape);
  c.restore();
  if (kind === 'track') {
    // a dark recessed slot with a faint cyan rail line
    const g = c.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, '#02050e'); g.addColorStop(1, css(shadeColor(P.board, 0.1)));
    c.fillStyle = g; c.fill(shape);
    c.save(); c.clip(shape);
    const top = c.createLinearGradient(0, 0, 0, 16);
    top.addColorStop(0, 'rgba(0,0,0,0.7)'); top.addColorStop(1, 'rgba(0,0,0,0)');
    c.fillStyle = top; c.fillRect(0, 0, w, 16);
    c.restore();
    c.strokeStyle = rgba(CYAN, 0.45); c.lineWidth = 2; c.stroke(shape);
    c.restore();
    return;
  }
  // the metal face: light at the top, dark at the bottom, tinted by the piece's colour
  const body = c.createLinearGradient(0, 0, 0, h);
  body.addColorStop(0, css(shadeColor(col, sunk ? 0 : 0.38)));
  body.addColorStop(0.45, css(col));
  body.addColorStop(1, css(shadeColor(col, -0.5)));
  c.fillStyle = body; c.fill(shape);
  c.save();
  c.clip(shape);
  brushed(c, w, h, r);
  if (kind === 'board') {
    // a display: a faint grid behind glass
    c.strokeStyle = rgba(CYAN, 0.07); c.lineWidth = 1;
    for (let x = 12; x < w; x += 18) { c.beginPath(); c.moveTo(x, 0); c.lineTo(x, h); c.stroke(); }
    for (let y = 12; y < h; y += 18) { c.beginPath(); c.moveTo(0, y); c.lineTo(w, y); c.stroke(); }
  }
  // glass sheen over the upper half
  if (!sunk) {
    const sh = c.createLinearGradient(0, 0, 0, h * 0.5);
    sh.addColorStop(0, 'rgba(255,255,255,0.28)'); sh.addColorStop(1, 'rgba(255,255,255,0)');
    c.fillStyle = sh; c.fillRect(0, 0, w, h * 0.5);
  } else {
    const top = c.createLinearGradient(0, 0, 0, 14);
    top.addColorStop(0, 'rgba(0,0,0,0.5)'); top.addColorStop(1, 'rgba(0,0,0,0)');
    c.fillStyle = top; c.fillRect(0, 0, w, 14);
  }
  // panel seams near both ends of a wide button, a light strip along the bottom
  if (kind === 'button' && w >= 220) {
    for (const x of [30, w - 30]) {
      c.fillStyle = 'rgba(0,0,0,0.45)'; c.fillRect(x - 1.5, 0, 3, h);
      c.fillStyle = 'rgba(255,255,255,0.18)'; c.fillRect(x + 1.5, 0, 1.5, h);
    }
  }
  c.restore();
  // inner bevel: a bright cut-corner line inside the edge, dark below
  if (!round) {
    const ib = chamfer(4, 4, w - 8, h - 8, Math.max(2, k - 2));
    c.strokeStyle = sunk ? 'rgba(0,0,0,0.35)' : 'rgba(255,255,255,0.35)'; c.lineWidth = 1.5; c.stroke(ib);
  }
  // the outline
  c.lineWidth = 2.5; c.strokeStyle = css(shadeColor(col, -0.78)); c.stroke(shape);
  // hardware
  const sr = Math.max(2.6, Math.min(4.2, h * 0.06));
  if (round) {
    c.strokeStyle = rgba(glow, 0.8); c.lineWidth = 3;
    c.beginPath(); c.arc(w / 2, h / 2, Math.min(w, h) / 2 - 5, 0, Math.PI * 2); c.stroke();
  } else if (kind === 'button' && w >= 220) {
    for (const x of [15, w - 15]) { screw(c, x, h * 0.3, sr); screw(c, x, h * 0.7, sr); }
  } else if (kind === 'board' || (kind === 'plate' && w >= 60)) {
    const m = Math.max(9, k * 0.75 + 4);
    if (kind === 'board') for (const [x, y] of [[m + 4, m + 4], [w - m - 4, m + 4], [m + 4, h - m - 4], [w - m - 4, h - m - 4]]) screw(c, x, y, sr);
    // corner brackets in the glow colour
    c.strokeStyle = rgba(glow, 0.85); c.lineWidth = 2.5;
    const b = Math.min(18, w * 0.2, h * 0.25);
    for (const [x, y, sx, sy] of [[3, 3, 1, 1], [w - 3, 3, -1, 1], [3, h - 3, 1, -1], [w - 3, h - 3, -1, -1]]) {
      c.beginPath(); c.moveTo(x, y + sy * (k + b)); c.lineTo(x, y + sy * k); c.lineTo(x + sx * k, y); c.lineTo(x + sx * (k + b), y); c.stroke();
    }
  }
  // the glowing edge: a soft line along the bottom (always), the whole outline when lit
  c.save();
  c.shadowColor = rgba(glow, 1);
  if (over || on) {
    c.shadowBlur = over ? 14 : 9;
    c.lineWidth = over ? 3.5 : 3;
    c.strokeStyle = css(shadeColor(glow, 0.35));
    c.stroke(shape);
  } else if (!sunk && !round) {
    c.shadowBlur = 8;
    c.strokeStyle = rgba(glow, 0.95); c.lineWidth = 2.5;
    c.beginPath(); c.moveTo(k + 6, h - 1.5); c.lineTo(w - k - 6, h - 1.5); c.stroke();
  }
  c.restore();
  if (down) { c.fillStyle = 'rgba(0,0,0,0.18)'; c.fill(shape); }
  c.restore();
};

const css = (c: number): string => rgba(c, 1);

/** The cockpit display behind the how-to and the overlays: dark glass, a grid, corner brackets. */
function hudPanel(c: CanvasRenderingContext2D, w: number, h: number): void {
  const k = 26;
  const shape = chamfer(0, 0, w, h, k);
  c.save();
  c.shadowColor = 'rgba(0,0,0,0.6)'; c.shadowBlur = 12; c.shadowOffsetY = 6;
  c.fillStyle = 'rgba(6,12,30,0.9)'; c.fill(shape);
  c.restore();
  c.save();
  c.clip(shape);
  const g = c.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, 'rgba(30,60,120,0.55)'); g.addColorStop(0.35, 'rgba(10,22,52,0.2)'); g.addColorStop(1, 'rgba(4,8,22,0.5)');
  c.fillStyle = g; c.fillRect(0, 0, w, h);
  c.strokeStyle = rgba(CYAN, 0.055); c.lineWidth = 1;
  for (let x = 16; x < w; x += 22) { c.beginPath(); c.moveTo(x, 0); c.lineTo(x, h); c.stroke(); }
  for (let y = 16; y < h; y += 22) { c.beginPath(); c.moveTo(0, y); c.lineTo(w, y); c.stroke(); }
  // scan lines
  c.fillStyle = 'rgba(255,255,255,0.025)';
  for (let y = 0; y < h; y += 4) c.fillRect(0, y, w, 1.5);
  c.restore();
  // edge and a brighter inner line
  c.strokeStyle = rgba(CYAN, 0.35); c.lineWidth = 2; c.stroke(shape);
  c.strokeStyle = 'rgba(160,220,255,0.12)'; c.lineWidth = 1.5; c.stroke(chamfer(7, 7, w - 14, h - 14, k - 4));
  // glowing corner brackets
  c.save();
  c.shadowColor = rgba(CYAN, 1); c.shadowBlur = 8;
  c.strokeStyle = css(shadeColor(CYAN, 0.3)); c.lineWidth = 3.5; c.lineCap = 'round';
  const b = 34;
  for (const [x, y, sx, sy] of [[0, 0, 1, 1], [w, 0, -1, 1], [0, h, 1, -1], [w, h, -1, -1]]) {
    c.beginPath(); c.moveTo(x, y + sy * (k + b)); c.lineTo(x, y + sy * k); c.lineTo(x + sx * k, y); c.lineTo(x + sx * (k + b), y); c.stroke();
  }
  c.restore();
  // three indicator lights on the top edge
  for (let i = 0; i < 3; i++) {
    c.save();
    c.shadowColor = rgba(i === 0 ? ORANGE : CYAN, 1); c.shadowBlur = 6;
    c.fillStyle = i === 0 ? css(ORANGE) : rgba(CYAN, 0.8);
    c.fillRect(w - k - 70 + i * 16, 6, 10, 4);
    c.restore();
  }
}

/** The HUD frame round the screen: a thin line with ticks, and glowing corner brackets. */
const HUD_BORDER: BorderStyle = {
  thick: 10,
  inset: 10,
  edge: (c, len) => {
    c.fillStyle = rgba(CYAN, 0.28); c.fillRect(0, 1, len, 2);
    c.fillStyle = rgba(CYAN, 0.45);
    for (let x = 60; x < len - 60; x += 36) c.fillRect(x, 3, 2, x % 144 < 36 ? 7 : 4);
  },
  corner: {
    size: 84,
    draw: (c, s) => {
      c.save();
      c.shadowColor = rgba(CYAN, 1); c.shadowBlur = 9;
      c.strokeStyle = css(shadeColor(CYAN, 0.25)); c.lineWidth = 5; c.lineCap = 'square';
      c.beginPath(); c.moveTo(6, s - 12); c.lineTo(6, 6); c.lineTo(s - 12, 6); c.stroke();
      c.lineWidth = 2.5; c.strokeStyle = rgba(CYAN, 0.8);
      c.beginPath(); c.moveTo(16, 34); c.lineTo(16, 16); c.lineTo(34, 16); c.stroke();
      c.shadowColor = rgba(ORANGE, 1);
      c.fillStyle = css(ORANGE);
      c.fillRect(22, 22, 6, 6);
      c.restore();
    },
  },
};

/** A five-pointed star centred on (x, y). */
function star(c: CanvasRenderingContext2D, x: number, y: number, r: number): void {
  c.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5, rr = i % 2 ? r * 0.45 : r;
    i ? c.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr) : c.moveTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
  }
  c.closePath();
  c.fill();
}

/** The squadron badge behind the logo: swept wings, a steel ring with stars, a starfighter climbing through it. */
export function squadronEmblem(c: CanvasRenderingContext2D, size: number): void {
  const u = size / 100;
  c.save();
  c.translate(size / 2, size / 2);
  c.lineJoin = 'round';
  // a cold glow
  const halo = c.createRadialGradient(0, 0, 8 * u, 0, 0, 50 * u);
  halo.addColorStop(0, 'rgba(62,230,255,0.35)'); halo.addColorStop(1, 'rgba(62,230,255,0)');
  c.fillStyle = halo; c.fillRect(-50 * u, -50 * u, 100 * u, 100 * u);
  const steel = (y0: number, y1: number) => {
    const g = c.createLinearGradient(0, y0 * u, 0, y1 * u);
    g.addColorStop(0, '#f2f7ff'); g.addColorStop(0.45, '#9fb2cc'); g.addColorStop(1, '#3a4a66');
    return g;
  };
  // the wings: three swept feathers a side
  for (const s of [-1, 1]) {
    c.save();
    c.scale(s, 1);
    for (let i = 0; i < 3; i++) {
      const y = -10 + i * 9, len = 48 - i * 6;
      c.beginPath();
      c.moveTo(18 * u, (y - 2) * u);
      c.lineTo(len * u, (y - 9 + i * 2) * u);
      c.lineTo((len - 4) * u, (y - 2 + i * 2) * u);
      c.lineTo(20 * u, (y + 6) * u);
      c.closePath();
      c.fillStyle = steel(y - 10, y + 6); c.fill();
      c.strokeStyle = NAVY; c.lineWidth = 1.8 * u; c.stroke();
      c.strokeStyle = rgba(CYAN, 0.9); c.lineWidth = 1 * u;
      c.beginPath(); c.moveTo(22 * u, (y - 1) * u); c.lineTo((len - 3) * u, (y - 7.5 + i * 2) * u); c.stroke();
    }
    c.restore();
  }
  // the ring
  c.lineWidth = 9 * u;
  c.strokeStyle = NAVY;
  c.beginPath(); c.arc(0, 0, 27 * u, 0, Math.PI * 2); c.stroke();
  c.lineWidth = 6 * u;
  c.strokeStyle = steel(-30, 30);
  c.beginPath(); c.arc(0, 0, 27 * u, 0, Math.PI * 2); c.stroke();
  // a deep-space disc inside it
  const sky = c.createRadialGradient(0, -6 * u, 2 * u, 0, 0, 24 * u);
  sky.addColorStop(0, '#2a4f9a'); sky.addColorStop(1, '#0a1434');
  c.fillStyle = sky;
  c.beginPath(); c.arc(0, 0, 23.5 * u, 0, Math.PI * 2); c.fill();
  c.fillStyle = 'rgba(255,255,255,0.8)';
  for (const [x, y, r] of [[-14, -8, 0.9], [12, -14, 0.7], [15, 6, 0.8], [-10, 12, 0.6], [-4, -17, 0.6], [6, 15, 0.7]]) {
    c.beginPath(); c.arc(x * u, y * u, r * u, 0, Math.PI * 2); c.fill();
  }
  // three stars on top of the ring
  c.fillStyle = '#ffd23f';
  c.strokeStyle = NAVY; c.lineWidth = 1.2 * u;
  for (const [x, y, r] of [[-15, -33, 4.2], [0, -38, 5.4], [15, -33, 4.2]]) { star(c, x * u, y * u, r * u); c.stroke(); }
  // the starfighter, nose up, climbing through the ring
  c.save();
  c.translate(0, 3 * u);
  // engine flames
  for (const x of [-6, 6]) {
    const f = c.createLinearGradient(0, 18 * u, 0, 36 * u);
    f.addColorStop(0, '#fff3c0'); f.addColorStop(0.35, '#ffa040'); f.addColorStop(1, 'rgba(255,90,20,0)');
    c.fillStyle = f;
    c.beginPath(); c.moveTo((x - 3.4) * u, 18 * u); c.quadraticCurveTo(x * u, 40 * u, (x + 3.4) * u, 18 * u); c.closePath(); c.fill();
  }
  const hull = new Path2D();
  hull.moveTo(0, -30 * u);
  hull.lineTo(5 * u, -14 * u);
  hull.lineTo(6 * u, -2 * u);
  hull.lineTo(22 * u, 10 * u);
  hull.lineTo(22 * u, 16 * u);
  hull.lineTo(9 * u, 13 * u);
  hull.lineTo(9 * u, 19 * u);
  hull.lineTo(-9 * u, 19 * u);
  hull.lineTo(-9 * u, 13 * u);
  hull.lineTo(-22 * u, 16 * u);
  hull.lineTo(-22 * u, 10 * u);
  hull.lineTo(-6 * u, -2 * u);
  hull.lineTo(-5 * u, -14 * u);
  hull.closePath();
  const hg = c.createLinearGradient(-20 * u, 0, 20 * u, 0);
  hg.addColorStop(0, '#5d6f8c'); hg.addColorStop(0.45, '#f4f8ff'); hg.addColorStop(0.55, '#d6e0ee'); hg.addColorStop(1, '#4a5a76');
  c.fillStyle = hg; c.fill(hull);
  c.strokeStyle = NAVY; c.lineWidth = 2 * u; c.stroke(hull);
  // orange wing stripes and the cockpit
  c.fillStyle = '#ff8a2a';
  for (const s of [-1, 1]) {
    c.beginPath(); c.moveTo(s * 10 * u, 4 * u); c.lineTo(s * 20 * u, 11.5 * u); c.lineTo(s * 20 * u, 14 * u); c.lineTo(s * 10 * u, 8 * u); c.closePath(); c.fill();
  }
  const glass = c.createLinearGradient(0, -18 * u, 0, -4 * u);
  glass.addColorStop(0, '#d8fbff'); glass.addColorStop(1, '#1d8fd0');
  c.fillStyle = glass;
  c.beginPath(); c.ellipse(0, -11 * u, 3.4 * u, 7 * u, 0, 0, Math.PI * 2); c.fill();
  c.strokeStyle = NAVY; c.lineWidth = 1.4 * u; c.stroke();
  c.restore();
  c.restore();
}

export const STAR_THEME: MenuTheme = {
  font: AUDIOWIDE,
  // Audiowide is wide: labels a touch smaller than the core's sizes
  fontScale: 0.86,
  palette: {
    primary: 0xe8641c, secondary: 0x2d5a96, board: 0x0e1c3c, trim: CYAN,
    label: '#ffffff', labelStroke: '#061230', muted: '#8ea3c8', accent: '#ffb347',
    heading: '#7ff3ff', body: '#dbe8ff', icon: 0xe6f8ff, shade: 0x02040e,
  },
  logo: {
    fill: ['#ffffff', '#d4f8ff', '#62d0ff', '#1f6fd0'],
    outline: NAVY,
    outlineWidth: 0.12,
    rim: '#3ee6ff',
    depth: '#0a2552',
    size: 120,
    upper: true,
    lineHeight: 0.98,
    emblem: { draw: squadronEmblem, size: 230, overlap: 0.26 },
  },
  skin: platePainter,
  pieces: [{ kind: 'button', w: TAL_W, h: TAL_H }],
  // dim: the backdrop's darkening (main.ts drew it as its own layer before the theme)
  frame: { border: HUD_BORDER, notes: hudPanel, vignette: 0.55, dim: 0.36 },
  overlays: { lose: '#ff8a5c', titles: ['runOver'] },
  // the run summary's card and the talent board's cockpit display (talentsui.ts)
  cards: [{ w: SUMMARY_W, h: SUMMARY_H }, TALENT_PANEL],
  // the talent board's plates, buttons and labels, painted under the intro
  prebake: (scene) => prebakeTalents(scene),
};

/** The TALENTS button (T on the keyboard) in the theme's skin: the label, and the stardust under it. */
export function talentsButton(scene: Phaser.Scene, x: number, y: number, open: () => void): { refresh: () => void } {
  const btn = new SkinButton(scene, x, y, t('talents'), open, { width: TAL_W, height: TAL_H, size: 32 });
  const icon = scene.add.image(0, 0, DUST).setDisplaySize(26, 26);
  const count = txt(scene, 0, 0, '', { size: 22, color: '#ffe2b0', strokeThickness: 4 });
  btn.add([icon, count]);
  const refresh = () => {
    btn.setText(t('talents')).fitLabel(TAL_W - 70);
    btn.setLabelY(-14);
    count.setText(String(loadMeta().dust));
    const w = 26 + 6 + count.width;
    icon.setPosition(-w / 2 + 13, 22);
    count.setPosition(-w / 2 + 32 + count.width / 2, 22);
  };
  refresh();
  // the pulse starts once the menu's entrance has popped the button in
  scene.time.delayedCall(1700, () => scene.tweens.add({ targets: btn, scale: { from: 1, to: 1.03 }, duration: 900, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' }));
  return { refresh };
}
