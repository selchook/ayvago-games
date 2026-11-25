// Dungeon Rescue's menu theme (src/core/menu-theme.ts): a castle dungeon's guardroom. Buttons are
// heraldic cloth plates (crimson for the main actions, royal blue for the rest) with gold stitching
// and an iron rivet at each end; boards are dark oak planks strapped with iron, brass-riveted corner
// brackets and a rope along the top between two iron rings, a parchment field inside for the text;
// the how-to, pause and result cards are parchment orders tied with rope and sealed in red wax. Each
// screen corner holds an iron key ring. The logo's emblem is a heraldic shield (crimson and blue,
// split per bend) with a gold portcullis, the knight's helm on top and a great key hanging below.
// HUD chips are dark iron with a brass rim. Display face: Grenze Gotisch (SIL OFL, covers Turkish);
// body text stays Nunito. The menu itself is the core's: PLAY, Easy / Normal and the how-to; the
// level is picked after PLAY on the map (one place per choice).
import { shadeColor, type MenuTheme, type SkinPainter, type BorderStyle, type HudSkin } from '@core';
import { GRENZE_GOTISCH } from '@core/fonts/grenze-gotisch';
import { prebakeScreens, screenCards } from './screens';
import { prebakePlay } from './hud';
import { INK, OAK, CRIMSON, ROYAL, GOLD, IRON, PARCH, MOSS, css, oak, strap, bracket, rivet, cloth, stitch, rope, parchment, seal, keyShape, shield, portcullis } from './paint';

// ------------------------------------------------------------------ the skin

export const keepPainter: SkinPainter = (c, kind, w, h, o) => {
  const down = o.state === 'down', off = o.state === 'off', on = o.state === 'on', over = o.state === 'over';
  const base = off ? 0x6a6266 : o.color;
  c.save();
  if (kind === 'board') {
    // the oak board with its iron and rope, a parchment field inside
    c.save(); c.shadowColor = 'rgba(0,0,0,0.6)'; c.shadowBlur = 20; c.shadowOffsetY = 10;
    c.fillStyle = css(shadeColor(OAK, -0.5)); c.beginPath(); c.roundRect(0, 8, w, h - 8, 10); c.fill(); c.restore();
    c.save(); c.beginPath(); c.roundRect(0, 8, w, h - 8, 10); c.clip();
    oak(c, 0, 8, w, h - 8, OAK, o.seed + w * 7 + h, 36);
    c.restore();
    c.lineWidth = 3; c.strokeStyle = INK; c.beginPath(); c.roundRect(1.5, 9.5, w - 3, h - 11, 9); c.stroke();
    // the parchment field
    c.save(); c.beginPath(); c.roundRect(20, 50, w - 40, h - 72, 8); c.clip();
    parchment(c, 20, 50, w - 40, h - 72, o.seed + 3);
    c.restore();
    c.lineWidth = 2.5; c.strokeStyle = 'rgba(40,20,8,0.85)'; c.beginPath(); c.roundRect(20, 50, w - 40, h - 72, 8); c.stroke();
    // iron straps at the top and the bottom, brackets in the corners
    strap(c, 0, 14, w, 12);
    strap(c, 0, h - 18, w, 10);
    const s = 44;
    bracket(c, 2, 10, s, 1, 1); bracket(c, w - 2, 10, s, -1, 1); bracket(c, 2, h - 2, s, 1, -1); bracket(c, w - 2, h - 2, s, -1, -1);
    // the rope between two rings over the top
    for (const x of [w * 0.28, w * 0.72]) { c.lineWidth = 4; c.strokeStyle = css(IRON); c.beginPath(); c.arc(x, 8, 8, 0, Math.PI * 2); c.stroke(); }
    rope(c, w * 0.28, 12, w * 0.72, 12, 6, 10);
    c.restore();
    return;
  }
  if (kind === 'track') {
    c.fillStyle = 'rgba(28,16,10,0.6)'; c.beginPath(); c.roundRect(0, 0, w, h, h / 2); c.fill();
    c.lineWidth = 2; c.strokeStyle = css(GOLD, 0.8); c.stroke();
    c.restore();
    return;
  }
  const lip = kind === 'round' ? 6 : Math.min(8, h * 0.14);
  const dy = down ? lip - 1 : 0;
  const rad = kind === 'round' ? Math.min(w, h) / 2 : kind === 'plate' ? 8 : Math.min(h / 3, 12);
  const shape = (yy: number) => { const p = new Path2D(); if (kind === 'round') p.ellipse(w / 2, yy + (h - lip) / 2, w / 2, (h - lip) / 2, 0, 0, Math.PI * 2); else p.roundRect(0, yy, w, h - lip, rad); return p; };
  if (over || on) { c.save(); c.shadowColor = 'rgba(255,200,90,1)'; c.shadowBlur = over ? 18 : 12; c.fillStyle = css(GOLD); c.fill(shape(dy)); c.restore(); }
  // the dark underside
  c.save(); c.shadowColor = 'rgba(0,0,0,0.55)'; c.shadowBlur = down ? 3 : 9; c.shadowOffsetY = down ? 1 : 5;
  c.fillStyle = css(shadeColor(base, -0.6)); c.fill(shape(lip)); c.restore();
  c.lineWidth = 2.5; c.strokeStyle = INK; c.stroke(shape(lip));
  const face = shape(dy);
  c.save(); c.clip(face);
  if (kind === 'round') {
    // a round shield: cloth face, an iron rim, a gold boss
    cloth(c, 0, dy, w, h - lip, base, o.seed + w);
    c.restore(); c.save();
    c.lineWidth = Math.max(4, w * 0.07); c.strokeStyle = css(IRON); c.stroke(face);
    c.fillStyle = 'rgba(255,240,210,0.16)'; c.beginPath(); c.ellipse(w / 2, dy + h * 0.25, w * 0.3, h * 0.12, 0, 0, Math.PI * 2); c.fill();
  } else {
    cloth(c, 0, dy, w, h - lip, base, o.seed + w * 3 + h);
    c.fillStyle = 'rgba(255,240,210,0.12)'; c.fillRect(0, dy, w, (h - lip) * 0.35);
  }
  c.restore();
  if (kind !== 'round') {
    stitch(c, 5, dy + 5, w - 10, h - lip - 10, Math.max(2, rad - 4), 2);
    if (w >= 120 && h >= 44) { rivet(c, 12, dy + (h - lip) / 2, 4.2); rivet(c, w - 12, dy + (h - lip) / 2, 4.2); }
  }
  c.lineWidth = 2.5; c.strokeStyle = INK; c.stroke(face);
  if (over || on) { c.lineWidth = 2.5; c.strokeStyle = css(0xffd070); c.stroke(shape(dy)); }
  c.restore();
};

// ------------------------------------------------------------------ the frame: an iron key ring in each corner

function cornerKeys(c: CanvasRenderingContext2D, s: number): void {
  const u = s / 100;
  c.save();
  // a hook on a small oak block, the ring, three keys
  c.save(); c.beginPath(); c.roundRect(6 * u, 6 * u, 30 * u, 22 * u, 4 * u); c.clip(); oak(c, 6 * u, 6 * u, 30 * u, 22 * u, OAK, 7, 11 * u); c.restore();
  c.strokeStyle = INK; c.lineWidth = 2 * u; c.beginPath(); c.roundRect(6 * u, 6 * u, 30 * u, 22 * u, 4 * u); c.stroke();
  rivet(c, 21 * u, 17 * u, 3 * u);
  c.lineWidth = 5 * u; c.strokeStyle = '#2a2a30'; c.beginPath(); c.arc(30 * u, 42 * u, 13 * u, 0, Math.PI * 2); c.stroke();
  c.lineWidth = 3 * u; c.strokeStyle = '#8a8e98'; c.beginPath(); c.arc(30 * u, 42 * u, 13 * u, 0, Math.PI * 2); c.stroke();
  for (const [a, col] of [[0.9, '#d8a838'], [1.5, '#9a9ea8'], [2.1, '#c08a40']] as [number, string][]) {
    c.strokeStyle = INK; c.lineWidth = 7 * u; keyShape(c, 30 * u + Math.cos(a) * 26 * u, 42 * u + Math.sin(a) * 26 * u, 16 * u, a);
    c.strokeStyle = col; c.lineWidth = 4 * u; keyShape(c, 30 * u + Math.cos(a) * 26 * u, 42 * u + Math.sin(a) * 26 * u, 16 * u, a);
  }
  c.restore();
}

export const KEY_BORDER: BorderStyle = { thick: 0, inset: 4, corner: { size: 88, draw: cornerKeys, inset: 4 } };

// ------------------------------------------------------------------ the cards

/** The cards behind the how-to, the pause and the result: a parchment order, rope ties, a wax seal. */
export function paintCard(c: CanvasRenderingContext2D, w: number, h: number): void {
  c.save();
  c.shadowColor = 'rgba(0,0,0,0.55)'; c.shadowBlur = 18; c.shadowOffsetY = 8;
  c.fillStyle = css(PARCH); c.beginPath(); c.roundRect(0, 8, w, h - 8, 8); c.fill();
  c.restore();
  c.save(); c.beginPath(); c.roundRect(0, 8, w, h - 8, 8); c.clip();
  parchment(c, 0, 8, w, h - 8, w * 3 + h);
  c.restore();
  c.lineWidth = 3; c.strokeStyle = 'rgba(70,40,14,0.9)'; c.beginPath(); c.roundRect(1.5, 9.5, w - 3, h - 11, 7); c.stroke();
  // a thin red and gold rule inside
  c.lineWidth = 2; c.strokeStyle = css(CRIMSON, 0.8); c.beginPath(); c.roundRect(12, 20, w - 24, h - 34, 5); c.stroke();
  c.lineWidth = 1; c.strokeStyle = css(GOLD, 0.9); c.beginPath(); c.roundRect(16, 24, w - 32, h - 42, 4); c.stroke();
  // rope ties at the top corners, the seal at the bottom right
  rope(c, 10, 18, 46, 4, 5, 0);
  rope(c, w - 10, 18, w - 46, 4, 5, 0);
  seal(c, w - 40, h - 34, 22);
}

// ------------------------------------------------------------------ the emblem

/** A heraldic shield with a gold portcullis, the knight's helm above it and a great key below. */
export function keepEmblem(c: CanvasRenderingContext2D, size: number): void {
  const u = size / 100;
  c.save();
  c.translate(size / 2, size / 2);
  const halo = c.createRadialGradient(0, 4 * u, 6 * u, 0, 4 * u, 50 * u);
  halo.addColorStop(0, 'rgba(255,200,110,0.5)'); halo.addColorStop(1, 'rgba(255,150,40,0)');
  c.fillStyle = halo; c.fillRect(-50 * u, -50 * u, 100 * u, 100 * u);
  // the great key behind, hanging from the shield
  c.strokeStyle = INK; c.lineWidth = 9 * u; keyShape(c, 0, 34 * u, 24 * u, Math.PI / 2);
  c.strokeStyle = '#e0b040'; c.lineWidth = 5 * u; keyShape(c, 0, 34 * u, 24 * u, Math.PI / 2);
  shield(c, 0, 2 * u, 52 * u, 60 * u);
  portcullis(c, 0, 0, 26 * u, 28 * u);
  // the helm on top
  c.save(); c.translate(0, -36 * u);
  const g = c.createLinearGradient(-14 * u, 0, 14 * u, 0); g.addColorStop(0, '#4a4e58'); g.addColorStop(0.45, '#d8dce8'); g.addColorStop(1, '#3a3e48');
  c.fillStyle = g; c.strokeStyle = INK; c.lineWidth = 2.2 * u;
  c.beginPath(); c.moveTo(-14 * u, 10 * u); c.lineTo(-14 * u, -2 * u); c.quadraticCurveTo(-14 * u, -16 * u, 0, -16 * u); c.quadraticCurveTo(14 * u, -16 * u, 14 * u, -2 * u); c.lineTo(14 * u, 10 * u); c.closePath(); c.fill(); c.stroke();
  c.fillStyle = INK; c.fillRect(-9 * u, -3 * u, 18 * u, 3 * u); c.fillRect(-1.2 * u, -3 * u, 2.4 * u, 10 * u);
  c.fillStyle = css(CRIMSON); c.beginPath(); c.moveTo(0, -16 * u); c.quadraticCurveTo(16 * u, -26 * u, 24 * u, -12 * u); c.quadraticCurveTo(12 * u, -18 * u, 0, -12 * u); c.fill(); c.lineWidth = 1.5 * u; c.stroke();
  c.restore();
  c.restore();
}

// ------------------------------------------------------------------ the HUD chips

export const HUD_SKIN: HudSkin = {
  pad: 10,
  font: GRENZE_GOTISCH,
  weight: '800',
  text: '#fff2d8',
  caption: '#ffc860',
  chip: (c, w, h, pad) => {
    c.save();
    c.translate(pad, pad);
    c.shadowColor = 'rgba(0,0,0,0.55)'; c.shadowBlur = 8; c.shadowOffsetY = 3;
    const g = c.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, 'rgba(56,58,66,0.92)'); g.addColorStop(1, 'rgba(22,22,28,0.92)');
    c.fillStyle = g; c.beginPath(); c.roundRect(0, 0, w, h, Math.min(12, h / 2.6)); c.fill();
    c.shadowColor = 'transparent';
    c.fillStyle = 'rgba(255,255,255,0.08)'; c.beginPath(); c.roundRect(3, 3, w - 6, h * 0.42, Math.min(9, h / 3)); c.fill();
    c.lineWidth = 2; c.strokeStyle = css(GOLD, 0.85); c.beginPath(); c.roundRect(1, 1, w - 2, h - 2, Math.min(12, h / 2.6)); c.stroke();
    c.restore();
  },
};

// ------------------------------------------------------------------ the theme

export const KEEP_THEME: MenuTheme = {
  font: GRENZE_GOTISCH,
  fontScale: 1.05,
  palette: {
    primary: CRIMSON, secondary: ROYAL, board: OAK, trim: GOLD,
    label: '#fff6e0', labelStroke: INK, muted: '#d8c8b0', accent: '#ffd070',
    heading: '#7a1a20', body: '#2a1a10', icon: 0xfff2d8, shade: 0x0c0a0e,
  },
  logo: {
    fill: ['#fff6cc', '#f2cf6a', '#d8902a', '#9a5a14'],
    outline: INK,
    rim: '#ffe9a8',
    depth: '#5a1418',
    size: 138,
    emblem: { draw: keepEmblem, size: 250, overlap: 0.3 },
  },
  skin: keepPainter,
  frame: { border: KEY_BORDER, notes: paintCard, vignette: 0.62, dim: 0.24 },
  overlays: { lose: '#b8242a', win: '#a8661a', adColor: MOSS, titles: ['loseHearts', 'winAll', 'runDone'] },
  hud: HUD_SKIN,
  // the level-clear card in the orientation this run was given (read by the core at boot)
  get cards() { return screenCards(); },
  prebake: (scene) => { prebakeScreens(scene); prebakePlay(scene); },
};
