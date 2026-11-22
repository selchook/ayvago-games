// Last Convoy's menu theme (src/core/menu-theme.ts): a survival look. Buttons are bolted steel sign
// plates with rust stains and scratches, the primary ones hazard yellow with a band of black-and-
// yellow stripes; boards are dark riveted steel with a strip of hazard tape along the top; round
// knobs are bolt heads. The screen sits in a frame of hazard tape with a green road sign in each
// corner; the how-to, pause and result cards are a rusty clipboard sheet. The logo's emblem is a
// green highway sign pointing out of town, the convoy's truck under it, claw marks across. HUD chips
// are small steel plates with a yellow edge. Display face: Black Ops One (SIL OFL, stencil, covers
// Turkish); body text stays Nunito. The menu itself is the core's: PLAY, Easy / Normal, the car
// steering switch on touch screens and the how-to; the survivor, the dog and the mode are picked
// after PLAY on the squad screen (one place per choice).
import { shadeColor, STEERING_PIECES, type MenuTheme, type SkinPainter, type BorderStyle, type HudSkin } from '@core';
import { BLACK_OPS_ONE } from '@core/fonts/black-ops-one';
import { prebakeScreens, SCREEN_CARDS } from './screens';
import { prebakePlay } from './hud';

import { INK, YELLOW, STEEL, DARK, GREEN, SIGN, css, rng, grime, hazard } from './paint';
export { INK, YELLOW, RUST, STEEL, DARK, GREEN, RED, SIGN, css, rng, grime, hazard } from './paint';

function rivet(c: CanvasRenderingContext2D, x: number, y: number, r: number): void {
  const g = c.createRadialGradient(x - r * 0.3, y - r * 0.3, 0, x, y, r);
  g.addColorStop(0, '#d8dce0'); g.addColorStop(1, '#4a4e54');
  c.fillStyle = g; c.beginPath(); c.arc(x, y, r, 0, Math.PI * 2); c.fill();
  c.strokeStyle = 'rgba(0,0,0,0.6)'; c.lineWidth = 1; c.stroke();
}

function plateShape(w: number, h: number, r: number): Path2D {
  const p = new Path2D();
  p.roundRect(0, 0, w, h, Math.min(r, h / 2, w / 2));
  return p;
}

// ------------------------------------------------------------------ the skin

export const rustPainter: SkinPainter = (c, kind, w, h, o) => {
  const P = o.palette;
  const down = o.state === 'down', off = o.state === 'off', on = o.state === 'on', over = o.state === 'over';
  const sunk = down || kind === 'track';
  const base = off ? shadeColor(o.color, -0.5) : o.color;
  const primary = o.color === P.primary && !off;
  c.save();
  c.translate(0, down ? 3 : 0);
  if (kind === 'round') {
    // a bolt head on a washer
    const R = Math.min(w, h) / 2, cx = w / 2, cy = h / 2;
    c.save(); c.shadowColor = 'rgba(0,0,0,0.55)'; c.shadowBlur = sunk ? 3 : 9; c.shadowOffsetY = sunk ? 1 : 4;
    c.fillStyle = '#1a1814'; c.beginPath(); c.arc(cx, cy, R, 0, Math.PI * 2); c.fill(); c.restore();
    const ring = c.createLinearGradient(0, cy - R, 0, cy + R);
    ring.addColorStop(0, '#c8ccd0'); ring.addColorStop(1, '#4a4e54');
    c.fillStyle = ring; c.beginPath(); c.arc(cx, cy, R - 1.5, 0, Math.PI * 2); c.fill();
    const g = c.createRadialGradient(cx - R * 0.3, cy - R * 0.35, R * 0.1, cx, cy, R * 0.8);
    g.addColorStop(0, css(shadeColor(base, 0.4))); g.addColorStop(0.7, css(base)); g.addColorStop(1, css(shadeColor(base, -0.5)));
    c.fillStyle = g;
    c.beginPath();
    for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2 + Math.PI / 6; c.lineTo(cx + Math.cos(a) * R * 0.78, cy + Math.sin(a) * R * 0.78); }
    c.closePath(); c.fill();
    c.strokeStyle = INK; c.lineWidth = 2; c.stroke();
    if (over || on) { c.strokeStyle = css(YELLOW); c.lineWidth = 3; c.beginPath(); c.arc(cx, cy, R - 1, 0, Math.PI * 2); c.stroke(); }
    c.restore();
    return;
  }
  const rad = kind === 'board' ? 10 : kind === 'track' ? h / 2 : 8;
  const shape = plateShape(w, h, rad);
  if (over || on) {
    c.save(); c.shadowColor = css(YELLOW, over ? 1 : 0.8); c.shadowBlur = over ? 16 : 10;
    c.fillStyle = css(YELLOW); c.fill(shape); c.restore();
  }
  c.save(); c.shadowColor = 'rgba(0,0,0,0.65)'; c.shadowBlur = sunk ? 3 : 12; c.shadowOffsetY = sunk ? 1 : 6;
  c.fillStyle = '#100e0c'; c.fill(shape); c.restore();
  c.save();
  c.clip(shape);
  const g = c.createLinearGradient(0, 0, w * 0.25, h);
  g.addColorStop(0, css(shadeColor(base, sunk ? -0.1 : 0.22)));
  g.addColorStop(0.6, css(base));
  g.addColorStop(1, css(shadeColor(base, -0.42)));
  c.fillStyle = g; c.fillRect(0, 0, w, h);
  // brushed metal
  c.globalAlpha = 0.06;
  for (let y = 0; y < h; y += 3) { c.fillStyle = y % 6 ? '#ffffff' : '#000000'; c.fillRect(0, y, w, 1); }
  c.globalAlpha = 1;
  grime(c, w, h, o.seed + w * 3 + h, kind === 'board' ? 0.8 : 0.6);
  if (kind === 'board') {
    // a strip of hazard tape across the top
    hazard(c, 0, 0, w, 14, 14, 0.95);
    c.fillStyle = 'rgba(0,0,0,0.35)'; c.fillRect(0, 14, w, 3);
  } else if (kind === 'button' && primary && w >= 150) {
    // a band of stripes along the bottom of the main buttons
    hazard(c, 0, h - 10, w, 10, 9, 0.9);
  }
  if (sunk) { c.fillStyle = 'rgba(0,0,0,0.25)'; c.fillRect(0, 0, w, h); }
  else {
    const gl = c.createLinearGradient(0, 0, 0, h * 0.5);
    gl.addColorStop(0, 'rgba(255,255,255,0.22)'); gl.addColorStop(1, 'rgba(255,255,255,0)');
    c.fillStyle = gl; c.fillRect(0, 0, w, h * 0.5);
  }
  c.restore();
  c.lineWidth = kind === 'board' ? 3 : 2.5;
  c.strokeStyle = INK;
  c.stroke(shape);
  c.save();
  c.lineWidth = 1.5;
  c.strokeStyle = kind === 'track' ? css(YELLOW, 0.35) : 'rgba(255,255,255,0.22)';
  c.beginPath(); c.roundRect(3, 3, w - 6, h - 6, Math.max(2, rad - 3)); c.stroke();
  c.restore();
  // rivets in the corners
  if (kind !== 'track' && h >= 36) {
    const m = kind === 'board' ? 22 : 9, rr = kind === 'board' ? 4 : 2.6;
    for (const [x, y] of [[m, kind === 'board' ? 28 : m], [w - m, kind === 'board' ? 28 : m], [m, h - m], [w - m, h - m]]) rivet(c, x, y, rr);
  }
  if (over || on) { c.save(); c.lineWidth = over ? 3 : 2.5; c.strokeStyle = css(YELLOW); c.stroke(shape); c.restore(); }
  c.restore();
};

// ------------------------------------------------------------------ the frame: hazard tape and road signs

const tapeEdge: BorderStyle['edge'] = (c, len, thick) => {
  const d = thick * 0.62, y0 = (thick - d) / 2;
  c.fillStyle = 'rgba(0,0,0,0.45)';
  c.fillRect(0, y0 + 3, len, d);
  hazard(c, 0, y0, len, d, 18, 0.95);
  // wear: dark streaks and torn bits
  const r = rng(Math.round(len));
  for (let i = 0; i < len / 40; i++) { c.fillStyle = `rgba(30,24,16,${0.15 + r() * 0.25})`; c.fillRect(r() * len, y0, 6 + r() * 30, d); }
  c.fillStyle = 'rgba(255,255,255,0.18)'; c.fillRect(0, y0, len, 2);
};

/** A small green road sign with an arrow (the frame's corners). */
function roadSign(c: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, arrow = true): void {
  c.save();
  c.shadowColor = 'rgba(0,0,0,0.5)'; c.shadowBlur = 6; c.shadowOffsetY = 3;
  c.fillStyle = css(SIGN); c.beginPath(); c.roundRect(x, y, w, h, 6); c.fill();
  c.restore();
  c.strokeStyle = '#f0f0e8'; c.lineWidth = 2.5; c.beginPath(); c.roundRect(x + 4, y + 4, w - 8, h - 8, 4); c.stroke();
  c.strokeStyle = INK; c.lineWidth = 2; c.beginPath(); c.roundRect(x, y, w, h, 6); c.stroke();
  if (arrow) {
    c.fillStyle = '#f0f0e8';
    const cx = x + w / 2, cy = y + h / 2, s = Math.min(w, h) * 0.3;
    c.beginPath(); c.moveTo(cx, cy - s); c.lineTo(cx + s * 0.8, cy); c.lineTo(cx + s * 0.3, cy); c.lineTo(cx + s * 0.3, cy + s); c.lineTo(cx - s * 0.3, cy + s); c.lineTo(cx - s * 0.3, cy); c.lineTo(cx - s * 0.8, cy); c.closePath(); c.fill();
  }
  grime(c, w, h, Math.round(x * 7 + y), 0.4);
}

function cornerSign(c: CanvasRenderingContext2D, s: number): void {
  const k = s * 0.32;
  c.fillStyle = '#8a8e94'; c.fillRect(k - 3, k + 8, 6, s * 0.5);
  roadSign(c, k - 26, k - 22, 52, 40);
}

export const TAPE_BORDER: BorderStyle = { thick: 26, inset: 0, edge: tapeEdge, corner: { size: 92, draw: cornerSign, inset: 0 } };

// ------------------------------------------------------------------ the clipboard card

/** The cards behind the how-to, the pause and the result: a rusty steel sheet with a clip. */
export function paintSheet(c: CanvasRenderingContext2D, w: number, h: number): void {
  c.save();
  c.shadowColor = 'rgba(0,0,0,0.6)'; c.shadowBlur = 14; c.shadowOffsetY = 6;
  c.fillStyle = '#1a1816'; c.beginPath(); c.roundRect(0, 0, w, h, 12); c.fill();
  c.restore();
  c.save();
  c.beginPath(); c.roundRect(0, 0, w, h, 12); c.clip();
  const g = c.createLinearGradient(0, 0, w * 0.2, h);
  g.addColorStop(0, '#3a3834'); g.addColorStop(1, '#1e1c1a');
  c.fillStyle = g; c.fillRect(0, 0, w, h);
  grime(c, w, h, w * 13 + h, 1.1);
  hazard(c, 0, h - 12, w, 12, 12, 0.85);
  c.restore();
  c.lineWidth = 3; c.strokeStyle = INK; c.beginPath(); c.roundRect(1.5, 1.5, w - 3, h - 3, 11); c.stroke();
  c.lineWidth = 1.5; c.strokeStyle = css(YELLOW, 0.5); c.beginPath(); c.roundRect(7, 7, w - 14, h - 22, 8); c.stroke();
  for (const [x, y] of [[16, 16], [w - 16, 16], [16, h - 26], [w - 16, h - 26]]) rivet(c, x, y, 3.5);
}

// ------------------------------------------------------------------ the emblem

/** A green highway sign pointing out of town, the convoy's truck under it, claw marks across. */
export function convoyEmblem(c: CanvasRenderingContext2D, size: number): void {
  const u = size / 100;
  c.save();
  c.translate(size / 2, size / 2);
  const halo = c.createRadialGradient(0, 0, 8 * u, 0, 0, 50 * u);
  halo.addColorStop(0, 'rgba(255,190,80,0.45)'); halo.addColorStop(1, 'rgba(255,120,40,0)');
  c.fillStyle = halo; c.fillRect(-50 * u, -50 * u, 100 * u, 100 * u);
  // the gantry posts
  c.fillStyle = '#8a8e94'; c.strokeStyle = INK; c.lineWidth = 1.5 * u;
  for (const x of [-36, 32]) { c.fillRect(x * u, -20 * u, 4 * u, 62 * u); c.strokeRect(x * u, -20 * u, 4 * u, 62 * u); }
  // the sign
  roadSign(c, -40 * u, -40 * u, 80 * u, 38 * u, false);
  c.fillStyle = '#f0f0e8';
  // an arrow up and to the right (out of town)
  c.save(); c.translate(0, -21 * u); c.rotate(0.6);
  c.beginPath(); c.moveTo(0, -12 * u); c.lineTo(10 * u, 0); c.lineTo(4 * u, 0); c.lineTo(4 * u, 12 * u); c.lineTo(-4 * u, 12 * u); c.lineTo(-4 * u, 0); c.lineTo(-10 * u, 0); c.closePath(); c.fill();
  c.restore();
  // three claw marks across the sign
  c.strokeStyle = 'rgba(150,20,16,0.85)'; c.lineWidth = 3 * u; c.lineCap = 'round';
  for (let i = 0; i < 3; i++) { c.beginPath(); c.moveTo((-30 + i * 9) * u, -36 * u); c.quadraticCurveTo((-24 + i * 9) * u, -22 * u, (-14 + i * 9) * u, -8 * u); c.stroke(); }
  // the truck under it
  c.save(); c.translate(-26 * u, 14 * u);
  c.fillStyle = '#d8c83a'; c.strokeStyle = INK; c.lineWidth = 2 * u;
  c.beginPath(); c.moveTo(0, 22 * u); c.lineTo(0, 0); c.lineTo(32 * u, 0); c.lineTo(32 * u, 8 * u); c.lineTo(44 * u, 8 * u); c.lineTo(52 * u, 16 * u); c.lineTo(52 * u, 22 * u); c.closePath(); c.fill(); c.stroke();
  hazard(c, 1 * u, 14 * u, 30 * u, 5 * u, 4 * u);
  c.fillStyle = '#8ad0ff'; c.fillRect(35 * u, 10 * u, 8 * u, 6 * u);
  c.fillStyle = '#fff4c8'; c.beginPath(); c.arc(51 * u, 19 * u, 2 * u, 0, Math.PI * 2); c.fill();
  for (const x of [11, 42]) { c.fillStyle = '#2a2a2a'; c.beginPath(); c.arc(x * u, 23 * u, 6 * u, 0, Math.PI * 2); c.fill(); c.stroke(); }
  c.restore();
  c.restore();
}

// ------------------------------------------------------------------ the HUD chips

export const HUD_SKIN: HudSkin = {
  pad: 10,
  font: BLACK_OPS_ONE,
  weight: '400',
  text: '#fff4d8',
  caption: '#f2c84a',
  chip: (c, w, h, pad) => {
    c.save();
    c.translate(pad, pad);
    c.shadowColor = 'rgba(0,0,0,0.55)'; c.shadowBlur = 8; c.shadowOffsetY = 3;
    c.fillStyle = 'rgba(28,26,24,0.86)'; c.beginPath(); c.roundRect(0, 0, w, h, 8); c.fill();
    c.shadowColor = 'transparent';
    const g = c.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, 'rgba(255,255,255,0.14)'); g.addColorStop(0.5, 'rgba(255,255,255,0.02)');
    c.fillStyle = g; c.beginPath(); c.roundRect(0, 0, w, h, 8); c.fill();
    c.lineWidth = 2; c.strokeStyle = css(YELLOW, 0.85); c.beginPath(); c.roundRect(1, 1, w - 2, h - 2, 7); c.stroke();
    c.lineWidth = 1; c.strokeStyle = 'rgba(0,0,0,0.8)'; c.beginPath(); c.roundRect(3.5, 3.5, w - 7, h - 7, 5); c.stroke();
    if (w > h * 1.4) for (const x of [7, w - 7]) rivet(c, x, h / 2, 2.2);
    c.restore();
  },
};

// ------------------------------------------------------------------ the theme

export const CONVOY_THEME: MenuTheme = {
  font: BLACK_OPS_ONE,
  fontScale: 0.92,
  palette: {
    primary: YELLOW, secondary: STEEL, board: DARK, trim: YELLOW,
    label: '#fff8e8', labelStroke: INK, muted: '#c8bca8', accent: '#f2c84a',
    heading: '#f2c84a', body: '#ece4d4', icon: 0xfff4d8, shade: 0x060504,
  },
  logo: {
    fill: ['#fff4c8', '#f2c84a', '#e8902a', '#b8501a'],
    outline: INK,
    rim: '#f2e8d0',
    depth: '#4a2010',
    size: 150,
    emblem: { draw: convoyEmblem, size: 250, overlap: 0.3 },
  },
  skin: rustPainter,
  pieces: [...STEERING_PIECES],
  frame: { border: TAPE_BORDER, notes: paintSheet, vignette: 0.6, dim: 0.22 },
  overlays: { lose: '#ff7a5a', win: '#f2c84a', adColor: GREEN, titles: ['loseHero', 'loseSurv', 'loseTruck', 'loseDrive', 'winCampaign', 'standOver'] },
  hud: HUD_SKIN,
  cards: SCREEN_CARDS,
  prebake: (scene) => { prebakeScreens(scene); prebakePlay(scene); },
};
