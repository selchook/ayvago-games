// Relic Ruins' menu theme (src/core/menu-theme.ts): torch-lit ancient ruins, apart from Crypt
// Crawler's iron-bound crypt and Trap Trail's sunny sky toy look. Buttons are slabs of weathered
// stone in the button's colour (amber-gilt for the main actions, verdigris bronze for the rest) with
// a carved groove and a gold-leaf frieze; boards are big sandstone slabs with a carved border, a
// meander frieze along the top, corner rosettes and ivy creeping in; the how-to, pause and result
// cards are pale tablets between two friezes. Each screen corner holds a wall torch on an iron
// bracket wrapped in ivy. The logo's emblem is the golden relic chest under a ruined arch between
// two torches. HUD chips are dark basalt with a thin gold rim. Display face: Cinzel (SIL OFL,
// covers Turkish); body text stays Nunito. The menu itself is the core's: PLAY, Easy / Normal and
// the how-to; the ruin is picked after PLAY on the map (one place per choice).
import { shadeColor, type MenuTheme, type SkinPainter, type BorderStyle, type HudSkin } from '@core';
import { CINZEL } from '@core/fonts/cinzel';
import { prebakeScreens, SCREEN_CARDS } from './screens';
import { prebakePlay } from './hud';
import { INK, SAND, AMBER, GOLD, VERDIGRIS, PARCH, MOSS, css, rng, stone, groove, frieze, ivy, flame } from './paint';

// ------------------------------------------------------------------ the skin

export const ruinPainter: SkinPainter = (c, kind, w, h, o) => {
  const down = o.state === 'down', off = o.state === 'off', on = o.state === 'on', over = o.state === 'over';
  const base = off ? 0x7a7268 : o.color;
  c.save();
  if (kind === 'board') {
    c.save(); c.shadowColor = 'rgba(0,0,0,0.6)'; c.shadowBlur = 20; c.shadowOffsetY = 10;
    c.fillStyle = css(shadeColor(SAND, -0.45)); c.beginPath(); c.roundRect(0, 4, w, h - 4, 14); c.fill(); c.restore();
    c.save(); c.beginPath(); c.roundRect(0, 4, w, h - 4, 14); c.clip();
    stone(c, 0, 4, w, h - 4, SAND, o.seed + w * 7 + h);
    // the darker inner field, carved in
    c.fillStyle = 'rgba(60,36,14,0.16)'; c.beginPath(); c.roundRect(22, 52, w - 44, h - 76, 10); c.fill();
    c.restore();
    groove(c, 22, 52, w - 44, h - 76, 10, 2.5);
    c.lineWidth = 3; c.strokeStyle = INK; c.beginPath(); c.roundRect(1.5, 5.5, w - 3, h - 7, 13); c.stroke();
    frieze(c, 16, 14, w - 32, 22);
    // corner rosettes
    for (const [x, y] of [[16, h - 18], [w - 16, h - 18]] as [number, number][]) rosette(c, x, y, 9);
    // ivy creeping over the top left corner and down the right edge
    ivy(c, 4, 10, Math.min(260, w * 0.45), 0.25, o.seed + 3, 1.1);
    ivy(c, w - 6, 40, Math.min(220, h * 0.4), 1.75, o.seed + 9, 1);
    c.restore();
    return;
  }
  if (kind === 'track') {
    c.fillStyle = 'rgba(28,19,11,0.6)'; c.beginPath(); c.roundRect(0, 0, w, h, h / 2); c.fill();
    c.lineWidth = 2; c.strokeStyle = css(GOLD, 0.8); c.stroke();
    c.restore();
    return;
  }
  const lip = kind === 'round' ? 6 : Math.min(8, h * 0.14);
  const dy = down ? lip - 1 : 0;
  const rad = kind === 'round' ? Math.min(w, h) / 2 : kind === 'plate' ? 10 : Math.min(h / 2.6, 14);
  const shape = (yy: number) => { const p = new Path2D(); if (kind === 'round') p.ellipse(w / 2, yy + (h - lip) / 2, w / 2, (h - lip) / 2, 0, 0, Math.PI * 2); else p.roundRect(0, yy, w, h - lip, rad); return p; };
  // the torch's glow when hovered or chosen
  if (over || on) { c.save(); c.shadowColor = 'rgba(255,170,60,1)'; c.shadowBlur = over ? 20 : 13; c.fillStyle = css(AMBER); c.fill(shape(dy)); c.restore(); }
  // the slab's dark underside
  c.save(); c.shadowColor = 'rgba(0,0,0,0.55)'; c.shadowBlur = down ? 3 : 9; c.shadowOffsetY = down ? 1 : 5;
  c.fillStyle = css(shadeColor(base, -0.55)); c.fill(shape(lip)); c.restore();
  c.lineWidth = 2.5; c.strokeStyle = INK; c.stroke(shape(lip));
  // the stone face in the button's colour
  const face = shape(dy);
  c.save(); c.clip(face);
  stone(c, 0, dy, w, h - lip, base, o.seed + w * 3 + h);
  if (kind !== 'round' && kind !== 'plate' && h >= 40) frieze(c, 6, dy + 4, w - 12, Math.max(5, Math.min(8, h * 0.13)));
  c.fillStyle = 'rgba(255,245,220,0.16)';
  if (kind === 'round') { c.beginPath(); c.ellipse(w / 2, dy + h * 0.25, w * 0.3, h * 0.12, 0, 0, Math.PI * 2); c.fill(); }
  c.restore();
  if (kind !== 'round') groove(c, 5, dy + 5, w - 10, h - lip - 10, Math.max(2, rad - 4), 1.6);
  c.lineWidth = 2.5; c.strokeStyle = INK; c.stroke(face);
  if (over || on) { c.lineWidth = 2.5; c.strokeStyle = css(0xffd070); c.stroke(shape(dy)); }
  c.restore();
};

function rosette(c: CanvasRenderingContext2D, x: number, y: number, r: number): void {
  c.save();
  c.fillStyle = css(GOLD);
  for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2; c.beginPath(); c.ellipse(x + Math.cos(a) * r * 0.55, y + Math.sin(a) * r * 0.55, r * 0.42, r * 0.2, a, 0, Math.PI * 2); c.fill(); }
  c.fillStyle = '#8a5a14'; c.beginPath(); c.arc(x, y, r * 0.3, 0, Math.PI * 2); c.fill();
  c.restore();
}

// ------------------------------------------------------------------ the frame: a wall torch in each corner

function cornerTorch(c: CanvasRenderingContext2D, s: number): void {
  const u = s / 100;
  c.save();
  // the iron bracket on a stone block
  c.fillStyle = css(shadeColor(SAND, -0.25)); c.strokeStyle = INK; c.lineWidth = 2 * u;
  c.beginPath(); c.roundRect(10 * u, 10 * u, 30 * u, 26 * u, 4 * u); c.fill(); c.stroke();
  c.strokeStyle = '#2a2622'; c.lineWidth = 4 * u; c.lineCap = 'round';
  c.beginPath(); c.moveTo(26 * u, 24 * u); c.lineTo(46 * u, 40 * u); c.stroke();
  // the stick and its head
  c.save(); c.translate(48 * u, 44 * u); c.rotate(-0.65);
  c.fillStyle = '#6a4424'; c.fillRect(-3 * u, -4 * u, 6 * u, 28 * u);
  c.fillStyle = '#3a2a1a'; c.fillRect(-5 * u, -8 * u, 10 * u, 8 * u);
  flame(c, 0, -8 * u, 12 * u);
  c.restore();
  ivy(c, 8 * u, 40 * u, 60 * u, 0.6, 5, 0.8 * u);
  c.restore();
}

export const TORCH_BORDER: BorderStyle = { thick: 0, inset: 4, corner: { size: 86, draw: cornerTorch, inset: 4 } };

// ------------------------------------------------------------------ the cards

/** The cards behind the how-to, the pause and the result: a pale tablet between two friezes. */
export function paintCard(c: CanvasRenderingContext2D, w: number, h: number): void {
  c.save();
  c.shadowColor = 'rgba(0,0,0,0.55)'; c.shadowBlur = 18; c.shadowOffsetY = 8;
  c.fillStyle = css(PARCH); c.beginPath(); c.roundRect(0, 6, w, h - 6, 12); c.fill();
  c.restore();
  c.save(); c.beginPath(); c.roundRect(0, 6, w, h - 6, 12); c.clip();
  stone(c, 0, 6, w, h - 6, 0xe8d4a8, w * 3 + h);
  const g = c.createRadialGradient(w / 2, h * 0.35, 10, w / 2, h * 0.4, Math.max(w, h) * 0.75);
  g.addColorStop(0, 'rgba(255,250,235,0.35)'); g.addColorStop(1, 'rgba(90,50,10,0.18)');
  c.fillStyle = g; c.fillRect(0, 0, w, h);
  c.restore();
  frieze(c, 12, 11, w - 24, 7);
  frieze(c, 12, h - 22, w - 24, 10);
  c.lineWidth = 3; c.strokeStyle = INK; c.beginPath(); c.roundRect(1.5, 7.5, w - 3, h - 9, 11); c.stroke();
  ivy(c, w - 8, 14, Math.min(150, h * 0.4), 1.9, w + h, 0.9);
}

// ------------------------------------------------------------------ the emblem

/** The golden relic chest in a ruined arch, a torch on each side. */
export function relicEmblem(c: CanvasRenderingContext2D, size: number): void {
  const u = size / 100;
  c.save();
  c.translate(size / 2, size / 2);
  const halo = c.createRadialGradient(0, 4 * u, 6 * u, 0, 4 * u, 50 * u);
  halo.addColorStop(0, 'rgba(255,214,120,0.6)'); halo.addColorStop(1, 'rgba(255,150,40,0)');
  c.fillStyle = halo; c.fillRect(-50 * u, -50 * u, 100 * u, 100 * u);
  // the arch: two pillars and a round top, one stone missing
  c.fillStyle = css(SAND); c.strokeStyle = INK; c.lineWidth = 2.2 * u;
  const arch = new Path2D();
  arch.moveTo(-36 * u, 36 * u); arch.lineTo(-36 * u, -10 * u); arch.arc(0, -10 * u, 36 * u, Math.PI, 0); arch.lineTo(36 * u, 36 * u);
  arch.lineTo(22 * u, 36 * u); arch.lineTo(22 * u, -10 * u); arch.arc(0, -10 * u, 22 * u, 0, Math.PI, true); arch.lineTo(-22 * u, 36 * u); arch.closePath();
  c.save(); c.clip(arch); stone(c, -40 * u, -50 * u, 80 * u, 90 * u, SAND, 41); c.restore();
  c.stroke(arch);
  // voussoir joints
  c.strokeStyle = 'rgba(40,24,10,0.6)'; c.lineWidth = 1.2 * u;
  for (let i = 1; i < 7; i++) { const a = Math.PI + (i / 7) * Math.PI; c.beginPath(); c.moveTo(Math.cos(a) * 22 * u, -10 * u + Math.sin(a) * 22 * u); c.lineTo(Math.cos(a) * 36 * u, -10 * u + Math.sin(a) * 36 * u); c.stroke(); }
  // the dark doorway and the chest in it
  c.fillStyle = '#1a120a'; c.beginPath(); c.moveTo(-22 * u, 36 * u); c.lineTo(-22 * u, -10 * u); c.arc(0, -10 * u, 22 * u, Math.PI, 0); c.lineTo(22 * u, 36 * u); c.closePath(); c.fill();
  const glow = c.createRadialGradient(0, 18 * u, 2 * u, 0, 18 * u, 26 * u);
  glow.addColorStop(0, 'rgba(255,220,120,0.9)'); glow.addColorStop(1, 'rgba(255,160,40,0)');
  c.fillStyle = glow; c.fillRect(-24 * u, -8 * u, 48 * u, 44 * u);
  chest(c, 0, 24 * u, 15 * u);
  // ivy on the left pillar
  ivy(c, -38 * u, -30 * u, 70 * u, 1.4, 13, 0.75 * u);
  // the two torches
  for (const sx of [-1, 1]) {
    c.save(); c.translate(sx * 44 * u, 4 * u);
    c.fillStyle = '#5a3a1e'; c.fillRect(-2.5 * u, 0, 5 * u, 22 * u);
    c.fillStyle = '#2a2018'; c.fillRect(-4 * u, -4 * u, 8 * u, 6 * u);
    flame(c, 0, -4 * u, 9 * u);
    c.restore();
  }
  c.restore();
}

/** A golden chest (front view), its middle at (x, y). */
function chest(c: CanvasRenderingContext2D, x: number, y: number, s: number): void {
  c.save();
  c.translate(x, y);
  c.lineWidth = s * 0.12; c.strokeStyle = INK;
  const g = c.createLinearGradient(0, -s, 0, s * 0.8);
  g.addColorStop(0, '#fff0a0'); g.addColorStop(0.5, css(GOLD)); g.addColorStop(1, '#8a5a10');
  c.fillStyle = g;
  c.beginPath(); c.roundRect(-s, -s * 0.15, s * 2, s * 0.95, s * 0.12); c.fill(); c.stroke();
  c.beginPath(); c.moveTo(-s, -s * 0.15); c.quadraticCurveTo(-s, -s * 0.95, 0, -s * 0.95); c.quadraticCurveTo(s, -s * 0.95, s, -s * 0.15); c.closePath(); c.fill(); c.stroke();
  c.fillStyle = '#5a3a10'; c.fillRect(-s * 0.16, -s * 0.3, s * 0.32, s * 0.4);
  c.strokeStyle = 'rgba(90,50,10,0.8)'; c.lineWidth = s * 0.08;
  for (const sx of [-0.55, 0.55]) { c.beginPath(); c.moveTo(sx * s, -s * 0.9); c.lineTo(sx * s, s * 0.78); c.stroke(); }
  c.restore();
}

// ------------------------------------------------------------------ the HUD chips

export const HUD_SKIN: HudSkin = {
  pad: 10,
  font: CINZEL,
  weight: '900',
  text: '#fff2d8',
  caption: '#ffc860',
  chip: (c, w, h, pad) => {
    c.save();
    c.translate(pad, pad);
    c.shadowColor = 'rgba(0,0,0,0.55)'; c.shadowBlur = 8; c.shadowOffsetY = 3;
    const g = c.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, 'rgba(58,46,38,0.9)'); g.addColorStop(1, 'rgba(26,19,14,0.9)');
    c.fillStyle = g; c.beginPath(); c.roundRect(0, 0, w, h, Math.min(14, h / 2.4)); c.fill();
    c.shadowColor = 'transparent';
    c.fillStyle = 'rgba(255,200,110,0.10)'; c.beginPath(); c.roundRect(3, 3, w - 6, h * 0.42, Math.min(10, h / 3)); c.fill();
    c.lineWidth = 2; c.strokeStyle = css(GOLD, 0.85); c.beginPath(); c.roundRect(1, 1, w - 2, h - 2, Math.min(14, h / 2.4)); c.stroke();
    c.restore();
  },
};

// ------------------------------------------------------------------ the theme

export const RUIN_THEME: MenuTheme = {
  font: CINZEL,
  fontScale: 0.92,
  palette: {
    primary: AMBER, secondary: VERDIGRIS, board: SAND, trim: GOLD,
    label: '#fff6e0', labelStroke: INK, muted: '#d8c8a8', accent: '#ffd070',
    heading: '#7a3a10', body: '#2a1a0c', icon: 0xfff2d8, shade: 0x0e0904,
  },
  logo: {
    fill: ['#fff6cc', '#f6cf6a', '#d8902a', '#9a5a14'],
    outline: INK,
    rim: '#ffe9a8',
    depth: '#4a2a0c',
    size: 132,
    emblem: { draw: relicEmblem, size: 250, overlap: 0.3 },
  },
  skin: ruinPainter,
  frame: { border: TORCH_BORDER, notes: paintCard, vignette: 0.62, dim: 0.22 },
  overlays: { lose: '#c8401e', win: '#a8661a', adColor: MOSS, titles: ['loseHearts', 'winAll', 'runDone'] },
  hud: HUD_SKIN,
  cards: SCREEN_CARDS,
  prebake: (scene) => { prebakeScreens(scene); prebakePlay(scene); },
};

void rng;
