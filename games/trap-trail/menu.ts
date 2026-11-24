// Trap Trail's menu theme (src/core/menu-theme.ts): a sunny toy look taken from the pack itself.
// Buttons are glossy candy plastic with a darker lip under them and a navy outline (orange for the
// main actions, sky blue for the rest); boards are a slice of a floating island: a grass cap with
// drips over a cake of tan and orange stripes round a cream inner panel; the how-to, pause and
// result cards are a cream page under a grass edge. Each screen corner holds a small grass isle
// with a gold star. The logo's emblem is the pack's goal flag on a floating isle, a saw blade and a
// coin beside it. HUD chips are navy pills with a white rim. Display face: Baloo 2 (SIL OFL, covers
// Turkish); body text stays Nunito. The menu itself is the core's: PLAY, Easy / Normal and the
// how-to; the stage is picked after PLAY on the trail map (one place per choice).
import { shadeColor, type MenuTheme, type SkinPainter, type BorderStyle, type HudSkin } from '@core';
import { BALOO_2 } from '@core/fonts/baloo-2';
import { prebakeScreens, SCREEN_CARDS } from './screens';
import { prebakePlay } from './hud';

import { INK, ORANGE, BLUE, GREEN, CREAM, GOLD, STRIPES, css, grassCap, stripes, star } from './paint';
export { INK, ORANGE, BLUE, GREEN, GREY, RED, CREAM, GRASS, GOLD, STRIPES, css, rng, grassCap, stripes, star } from './paint';

// ------------------------------------------------------------------ the skin

export const toyPainter: SkinPainter = (c, kind, w, h, o) => {
  const down = o.state === 'down', off = o.state === 'off', on = o.state === 'on', over = o.state === 'over';
  const base = off ? 0x9aa2b2 : o.color;
  c.save();
  if (kind === 'board') {
    // a slice of a floating island: grass cap, striped earth, a cream panel inside
    c.save(); c.shadowColor = 'rgba(10,20,50,0.45)'; c.shadowBlur = 16; c.shadowOffsetY = 8;
    c.fillStyle = css(STRIPES[1]); c.beginPath(); c.roundRect(0, 6, w, h - 6, 22); c.fill(); c.restore();
    c.save(); c.beginPath(); c.roundRect(0, 6, w, h - 6, 22); c.clip(); stripes(c, 0, 6, w, h - 6, o.seed + w); c.restore();
    c.lineWidth = 3.5; c.strokeStyle = INK; c.beginPath(); c.roundRect(1.5, 7.5, w - 3, h - 9, 21); c.stroke();
    c.fillStyle = css(CREAM, 0.96);
    c.beginPath(); c.roundRect(16, 40, w - 32, h - 58, 16); c.fill();
    c.lineWidth = 2.5; c.strokeStyle = css(shadeColor(STRIPES[3], -0.3)); c.stroke();
    grassCap(c, -4, 0, w + 8, 34, o.seed);
    c.lineWidth = 3; c.strokeStyle = INK; c.beginPath(); c.roundRect(-3, 0, w + 6, 30, 12); c.stroke();
    c.restore();
    return;
  }
  if (kind === 'track') {
    c.fillStyle = 'rgba(20,32,60,0.55)'; c.beginPath(); c.roundRect(0, 0, w, h, h / 2); c.fill();
    c.lineWidth = 2.5; c.strokeStyle = INK; c.stroke();
    c.restore();
    return;
  }
  const lip = kind === 'round' ? 6 : Math.min(8, h * 0.14);
  const dy = down ? lip - 1 : 0;
  const rad = kind === 'round' ? Math.min(w, h) / 2 : kind === 'plate' ? 16 : Math.min(h / 2, 22);
  const shape = (yy: number) => { const p = new Path2D(); if (kind === 'round') p.ellipse(w / 2, yy + (h - lip) / 2, w / 2, (h - lip) / 2, 0, 0, Math.PI * 2); else p.roundRect(0, yy, w, h - lip, rad); return p; };
  // glow when hovered or selected
  if (over || on) { c.save(); c.shadowColor = css(GOLD, 1); c.shadowBlur = over ? 18 : 12; c.fillStyle = css(GOLD); c.fill(shape(dy)); c.restore(); }
  // the lip under the face
  c.save(); c.shadowColor = 'rgba(10,20,50,0.45)'; c.shadowBlur = down ? 3 : 9; c.shadowOffsetY = down ? 1 : 5;
  c.fillStyle = css(shadeColor(base, -0.42)); c.fill(shape(lip)); c.restore();
  c.lineWidth = 3; c.strokeStyle = INK; c.stroke(shape(lip));
  // the face
  const face = shape(dy);
  const g = c.createLinearGradient(0, dy, 0, dy + h - lip);
  g.addColorStop(0, css(shadeColor(base, 0.28))); g.addColorStop(0.55, css(base)); g.addColorStop(1, css(shadeColor(base, -0.12)));
  c.fillStyle = g; c.fill(face);
  // the gloss
  c.save(); c.clip(face);
  c.fillStyle = 'rgba(255,255,255,0.38)';
  if (kind === 'round') { c.beginPath(); c.ellipse(w / 2, dy + h * 0.24, w * 0.32, h * 0.13, 0, 0, Math.PI * 2); c.fill(); }
  else { c.beginPath(); c.roundRect(8, dy + 4, w - 16, (h - lip) * 0.34, Math.min(rad, 12)); c.fill(); }
  if (kind === 'plate') { c.fillStyle = 'rgba(255,255,255,0.08)'; for (let x = -h; x < w; x += 22) { c.beginPath(); c.moveTo(x, dy + h); c.lineTo(x + 10, dy + h); c.lineTo(x + 10 + h, dy); c.lineTo(x + h, dy); c.fill(); } }
  c.restore();
  c.lineWidth = 3; c.strokeStyle = INK; c.stroke(face);
  if (over || on) { c.lineWidth = 3; c.strokeStyle = css(GOLD); c.save(); c.translate(0, 0); c.stroke(shape(dy)); c.restore(); c.lineWidth = 1.5; c.strokeStyle = INK; }
  c.restore();
};

// ------------------------------------------------------------------ the frame: a grass isle with a star in each corner

function cornerIsle(c: CanvasRenderingContext2D, s: number): void {
  const x = s * 0.12, y = s * 0.12, w = s * 0.52, h = s * 0.3;
  c.save();
  c.shadowColor = 'rgba(10,20,50,0.4)'; c.shadowBlur = 6; c.shadowOffsetY = 3;
  c.fillStyle = css(STRIPES[0]);
  c.beginPath(); c.moveTo(x, y + h * 0.4); c.lineTo(x + w, y + h * 0.4); c.lineTo(x + w * 0.75, y + h * 1.3); c.lineTo(x + w * 0.3, y + h * 1.4); c.closePath(); c.fill();
  c.restore();
  c.fillStyle = css(STRIPES[1]);
  c.beginPath(); c.moveTo(x + w * 0.1, y + h * 0.8); c.lineTo(x + w * 0.88, y + h * 0.8); c.lineTo(x + w * 0.78, y + h * 1.05); c.lineTo(x + w * 0.2, y + h * 1.1); c.closePath(); c.fill();
  c.lineWidth = 2; c.strokeStyle = INK;
  c.beginPath(); c.moveTo(x, y + h * 0.4); c.lineTo(x + w, y + h * 0.4); c.lineTo(x + w * 0.75, y + h * 1.3); c.lineTo(x + w * 0.3, y + h * 1.4); c.closePath(); c.stroke();
  grassCap(c, x - 3, y + h * 0.22, w + 6, h * 0.36, 7);
  star(c, x + w * 0.5, y + h * 0.02, s * 0.13);
}

export const ISLE_BORDER: BorderStyle = { thick: 0, inset: 6, corner: { size: 78, draw: cornerIsle, inset: 6 } };

// ------------------------------------------------------------------ the cards

/** The cards behind the how-to, the pause and the result: a cream page under a grass edge. */
export function paintCard(c: CanvasRenderingContext2D, w: number, h: number): void {
  c.save();
  c.shadowColor = 'rgba(10,20,50,0.45)'; c.shadowBlur = 16; c.shadowOffsetY = 7;
  c.fillStyle = css(CREAM); c.beginPath(); c.roundRect(0, 8, w, h - 8, 20); c.fill();
  c.restore();
  c.save(); c.beginPath(); c.roundRect(0, 8, w, h - 8, 20); c.clip();
  stripes(c, 0, h - 18, w, 18, w);
  const g = c.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, 'rgba(255,255,255,0.5)'); g.addColorStop(1, 'rgba(255,255,255,0)');
  c.fillStyle = g; c.fillRect(0, 0, w, h * 0.4);
  c.restore();
  c.lineWidth = 3.5; c.strokeStyle = INK; c.beginPath(); c.roundRect(1.5, 9.5, w - 3, h - 11, 19); c.stroke();
  grassCap(c, -3, 0, w + 6, 15, w * 3 + h, undefined, 4);
  c.lineWidth = 2.5; c.strokeStyle = INK; c.beginPath(); c.roundRect(-2, 0, w + 4, 13, 6); c.stroke();
}

// ------------------------------------------------------------------ the emblem

/** The pack's goal flag on a floating isle, a saw blade behind and a coin in front. */
export function trailEmblem(c: CanvasRenderingContext2D, size: number): void {
  const u = size / 100;
  c.save();
  c.translate(size / 2, size / 2);
  const halo = c.createRadialGradient(0, 0, 6 * u, 0, 0, 50 * u);
  halo.addColorStop(0, 'rgba(255,240,170,0.55)'); halo.addColorStop(1, 'rgba(255,200,80,0)');
  c.fillStyle = halo; c.fillRect(-50 * u, -50 * u, 100 * u, 100 * u);
  // the saw blade behind
  c.save(); c.translate(24 * u, -8 * u);
  c.fillStyle = '#9aa2ae'; c.strokeStyle = INK; c.lineWidth = 2 * u;
  c.beginPath();
  for (let i = 0; i < 24; i++) { const a = (i / 24) * Math.PI * 2, r = i % 2 ? 15 * u : 21 * u; c.lineTo(Math.cos(a) * r, Math.sin(a) * r); }
  c.closePath(); c.fill(); c.stroke();
  c.fillStyle = '#5a6270'; c.beginPath(); c.arc(0, 0, 4 * u, 0, Math.PI * 2); c.fill();
  c.restore();
  // the isle
  c.save(); c.translate(-6 * u, 18 * u);
  c.fillStyle = css(STRIPES[0]);
  c.beginPath(); c.moveTo(-34 * u, 0); c.lineTo(34 * u, 0); c.lineTo(20 * u, 26 * u); c.lineTo(-18 * u, 30 * u); c.closePath(); c.fill();
  c.fillStyle = css(STRIPES[1]);
  c.beginPath(); c.moveTo(-30 * u, 9 * u); c.lineTo(30 * u, 9 * u); c.lineTo(25 * u, 17 * u); c.lineTo(-26 * u, 18 * u); c.closePath(); c.fill();
  c.lineWidth = 2.2 * u; c.strokeStyle = INK;
  c.beginPath(); c.moveTo(-34 * u, 0); c.lineTo(34 * u, 0); c.lineTo(20 * u, 26 * u); c.lineTo(-18 * u, 30 * u); c.closePath(); c.stroke();
  grassCap(c, -38 * u, -8 * u, 76 * u, 12 * u, 3);
  c.lineWidth = 2 * u; c.strokeStyle = INK; c.beginPath(); c.roundRect(-38 * u, -8 * u, 76 * u, 10 * u, 5 * u); c.stroke();
  // the flag
  c.fillStyle = '#c8ccd4'; c.fillRect(-4 * u, -50 * u, 3.4 * u, 44 * u);
  c.strokeRect(-4 * u, -50 * u, 3.4 * u, 44 * u);
  c.fillStyle = '#e8483a';
  c.beginPath(); c.moveTo(-0.6 * u, -49 * u); c.quadraticCurveTo(14 * u, -50 * u, 24 * u, -40 * u); c.quadraticCurveTo(12 * u, -38 * u, -0.6 * u, -30 * u); c.closePath(); c.fill(); c.stroke();
  c.fillStyle = '#e8e8f0'; c.beginPath(); c.arc(-2.3 * u, -51 * u, 3.4 * u, 0, Math.PI * 2); c.fill(); c.stroke();
  c.restore();
  // the coin in front
  c.save(); c.translate(-30 * u, 14 * u);
  c.fillStyle = '#c87a1a'; c.beginPath(); c.ellipse(1.5 * u, 1.5 * u, 11 * u, 12 * u, 0, 0, Math.PI * 2); c.fill();
  const cg = c.createLinearGradient(0, -12 * u, 0, 12 * u); cg.addColorStop(0, '#ffe27a'); cg.addColorStop(1, '#f0a020');
  c.fillStyle = cg; c.beginPath(); c.ellipse(0, 0, 11 * u, 12 * u, 0, 0, Math.PI * 2); c.fill();
  c.lineWidth = 2 * u; c.strokeStyle = INK; c.stroke();
  star(c, 0, 0.5 * u, 6.5 * u, 0xffc83a, '#a8600a');
  c.restore();
  c.restore();
}

// ------------------------------------------------------------------ the HUD chips

export const HUD_SKIN: HudSkin = {
  pad: 10,
  font: BALOO_2,
  weight: '800',
  text: '#ffffff',
  caption: '#ffd23a',
  chip: (c, w, h, pad) => {
    c.save();
    c.translate(pad, pad);
    c.shadowColor = 'rgba(10,20,50,0.45)'; c.shadowBlur = 8; c.shadowOffsetY = 3;
    c.fillStyle = 'rgba(27,42,74,0.82)'; c.beginPath(); c.roundRect(0, 0, w, h, h / 2); c.fill();
    c.shadowColor = 'transparent';
    const g = c.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, 'rgba(255,255,255,0.22)'); g.addColorStop(0.5, 'rgba(255,255,255,0.03)');
    c.fillStyle = g; c.beginPath(); c.roundRect(2, 2, w - 4, h * 0.5, h / 3); c.fill();
    c.lineWidth = 2.5; c.strokeStyle = 'rgba(255,255,255,0.85)'; c.beginPath(); c.roundRect(1.25, 1.25, w - 2.5, h - 2.5, h / 2); c.stroke();
    c.restore();
  },
};

// ------------------------------------------------------------------ the theme

export const TRAIL_THEME: MenuTheme = {
  font: BALOO_2,
  fontScale: 1,
  palette: {
    primary: ORANGE, secondary: BLUE, board: CREAM, trim: GOLD,
    label: '#ffffff', labelStroke: INK, muted: '#c9d6ea', accent: '#ffd23a',
    heading: '#c45a12', body: '#3a2a1a', icon: 0xffffff, shade: 0x0a1a3a,
  },
  logo: {
    fill: ['#fff8c8', '#ffd23a', '#ffa31a', '#f07a12'],
    outline: INK,
    rim: '#ffffff',
    depth: '#8a3a0a',
    size: 150,
    emblem: { draw: trailEmblem, size: 250, overlap: 0.3 },
  },
  skin: toyPainter,
  frame: { border: ISLE_BORDER, notes: paintCard, vignette: 0.45, dim: 0.12 },
  overlays: { lose: '#e8483a', win: '#f07a12', adColor: GREEN, titles: ['loseHearts', 'winTrail', 'runDone'] },
  hud: HUD_SKIN,
  cards: SCREEN_CARDS,
  prebake: (scene) => { prebakeScreens(scene); prebakePlay(scene); },
};
