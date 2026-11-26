// Moon Rover's menu theme (src/core/menu-theme.ts): a moon base's mission control. Buttons are
// enamelled steel plates (signal orange for the main actions, teal for the rest) with a glossy top,
// a bright rim and a bolt at each end; boards are brushed-steel consoles with a yellow and black
// hazard stripe along the top, bolted corners and a smoked-glass field inside for the text; the
// how-to, pause and result cards are glass panels in a steel frame. Each screen corner holds a
// bolted hazard-striped bracket. The logo's emblem is a round mission patch: the rover on the
// moon's rim under the Earth and the stars, in an orange ring. HUD chips are smoked glass with a
// cool rim. Display face: Saira Stencil One (SIL OFL, covers Turkish); body text stays Nunito. The
// menu itself is the core's: PLAY, Easy / Normal, the steering switch on touch screens and the
// how-to; the mission is picked after PLAY on the map (one place per choice).
import { shadeColor, STEERING_PIECES, type MenuTheme, type SkinPainter, type BorderStyle, type HudSkin } from '@core';
import { SAIRA_STENCIL_ONE } from '@core/fonts/saira-stencil-one';
import { prebakeScreens, screenCards } from './screens';
import { prebakePlay } from './hud';
import { INK, STEEL, STEEL_DARK, ORANGE, TEAL, GREEN, HAZARD, css, brushed, hazard, bolt, glass, moonDisc, roverSide, star } from './paint';

// ------------------------------------------------------------------ the skin

export const basePainter: SkinPainter = (c, kind, w, h, o) => {
  const down = o.state === 'down', off = o.state === 'off', on = o.state === 'on', over = o.state === 'over';
  const base = off ? 0x5a606c : o.color;
  c.save();
  if (kind === 'board' || kind === 'plate') {
    const board = kind === 'board';
    // the console: brushed steel, a hazard stripe on top, bolts, a smoked-glass field inside
    c.save(); c.shadowColor = 'rgba(0,0,0,0.6)'; c.shadowBlur = 20; c.shadowOffsetY = 10;
    c.fillStyle = css(STEEL_DARK); c.beginPath(); c.roundRect(0, 4, w, h - 4, 14); c.fill(); c.restore();
    c.save(); c.beginPath(); c.roundRect(0, 4, w, h - 4, 14); c.clip();
    brushed(c, 0, 4, w, h - 4, STEEL, o.seed + w * 7 + h);
    if (board) hazard(c, 0, 4, w, 18, 13);
    c.restore();
    const fx = board ? 18 : 12, fy = board ? 36 : 12;
    c.save(); c.beginPath(); c.roundRect(fx, fy, w - fx * 2, h - fy - (board ? 18 : 12), 10); c.clip();
    glass(c, fx, fy, w - fx * 2, h - fy - (board ? 18 : 12), 0x101c34, 0.86);
    c.restore();
    c.lineWidth = 2.5; c.strokeStyle = 'rgba(159,216,255,0.55)'; c.beginPath(); c.roundRect(fx, fy, w - fx * 2, h - fy - (board ? 18 : 12), 10); c.stroke();
    c.lineWidth = 3; c.strokeStyle = INK; c.beginPath(); c.roundRect(1.5, 5.5, w - 3, h - 7, 13); c.stroke();
    const r = board ? 6 : 4.5;
    for (const [x, y] of [[10, board ? 30 : 12], [w - 10, board ? 30 : 12], [10, h - 10], [w - 10, h - 10]] as [number, number][]) bolt(c, x, y, r);
    c.restore();
    return;
  }
  if (kind === 'track') {
    c.fillStyle = 'rgba(8,12,24,0.7)'; c.beginPath(); c.roundRect(0, 0, w, h, h / 2); c.fill();
    c.lineWidth = 2; c.strokeStyle = 'rgba(159,216,255,0.8)'; c.stroke();
    c.restore();
    return;
  }
  const lip = kind === 'round' ? 6 : Math.min(8, h * 0.14);
  const dy = down ? lip - 1 : 0;
  const rad = kind === 'round' ? Math.min(w, h) / 2 : Math.min(h / 3, 12);
  const shape = (yy: number) => { const p = new Path2D(); if (kind === 'round') p.ellipse(w / 2, yy + (h - lip) / 2, w / 2, (h - lip) / 2, 0, 0, Math.PI * 2); else p.roundRect(0, yy, w, h - lip, rad); return p; };
  // a cool glow when hovered or chosen
  if (over || on) { c.save(); c.shadowColor = on ? 'rgba(255,190,80,1)' : 'rgba(120,220,255,1)'; c.shadowBlur = over ? 18 : 14; c.fillStyle = css(on ? HAZARD : 0x9fe4ff); c.fill(shape(dy)); c.restore(); }
  // the dark underside
  c.save(); c.shadowColor = 'rgba(0,0,0,0.55)'; c.shadowBlur = down ? 3 : 9; c.shadowOffsetY = down ? 1 : 5;
  c.fillStyle = css(shadeColor(base, -0.55)); c.fill(shape(lip)); c.restore();
  c.lineWidth = 2.5; c.strokeStyle = INK; c.stroke(shape(lip));
  // the enamelled face
  const face = shape(dy);
  c.save(); c.clip(face);
  const g = c.createLinearGradient(0, dy, 0, dy + h - lip);
  g.addColorStop(0, css(shadeColor(base, 0.32))); g.addColorStop(0.5, css(base)); g.addColorStop(1, css(shadeColor(base, -0.22)));
  c.fillStyle = g; c.fillRect(0, dy, w, h);
  c.fillStyle = 'rgba(255,255,255,0.18)'; c.fillRect(0, dy, w, (h - lip) * 0.42);
  // a thin dark band near the bottom, as on a control-panel key
  if (kind !== 'round') { c.fillStyle = 'rgba(0,0,0,0.12)'; c.fillRect(0, dy + (h - lip) * 0.78, w, 3); }
  c.restore();
  c.lineWidth = 2; c.strokeStyle = 'rgba(255,255,255,0.45)';
  if (kind === 'round') { c.beginPath(); c.ellipse(w / 2, dy + (h - lip) / 2, w / 2 - 4, (h - lip) / 2 - 4, 0, 0, Math.PI * 2); c.stroke(); }
  else { c.beginPath(); c.roundRect(3, dy + 3, w - 6, h - lip - 6, Math.max(2, rad - 3)); c.stroke(); }
  if (kind !== 'round' && w >= 120 && h >= 44) { bolt(c, 12, dy + (h - lip) / 2, 4); bolt(c, w - 12, dy + (h - lip) / 2, 4); }
  c.lineWidth = 2.5; c.strokeStyle = INK; c.stroke(face);
  c.restore();
};

// ------------------------------------------------------------------ the frame: a bolted bracket in each corner

function cornerBracket(c: CanvasRenderingContext2D, s: number): void {
  const u = s / 100;
  c.save();
  c.beginPath(); c.moveTo(4 * u, 4 * u); c.lineTo(70 * u, 4 * u); c.lineTo(70 * u, 20 * u); c.lineTo(20 * u, 20 * u); c.lineTo(20 * u, 70 * u); c.lineTo(4 * u, 70 * u); c.closePath();
  c.save(); c.clip(); brushed(c, 0, 0, 72 * u, 72 * u, STEEL, 5); c.restore();
  c.lineWidth = 2.5 * u; c.strokeStyle = INK; c.stroke();
  c.save(); c.beginPath(); c.rect(24 * u, 8 * u, 42 * u, 8 * u); c.clip(); hazard(c, 24 * u, 8 * u, 42 * u, 8 * u, 6 * u); c.restore();
  c.save(); c.beginPath(); c.rect(8 * u, 24 * u, 8 * u, 42 * u); c.clip(); hazard(c, 8 * u, 24 * u, 8 * u, 42 * u, 6 * u); c.restore();
  bolt(c, 12 * u, 12 * u, 4.5 * u);
  c.restore();
}

export const BASE_BORDER: BorderStyle = { thick: 0, inset: 4, corner: { size: 84, draw: cornerBracket, inset: 4 } };

// ------------------------------------------------------------------ the cards

/** The cards behind the how-to, the pause and the result: smoked glass in a bolted steel frame. */
export function paintCard(c: CanvasRenderingContext2D, w: number, h: number): void {
  c.save();
  c.shadowColor = 'rgba(0,0,0,0.55)'; c.shadowBlur = 18; c.shadowOffsetY = 8;
  c.fillStyle = css(STEEL_DARK); c.beginPath(); c.roundRect(0, 6, w, h - 6, 14); c.fill();
  c.restore();
  c.save(); c.beginPath(); c.roundRect(0, 6, w, h - 6, 14); c.clip();
  brushed(c, 0, 6, w, h - 6, STEEL, w * 3 + h);
  c.restore();
  c.save(); c.beginPath(); c.roundRect(12, 18, w - 24, h - 30, 10); c.clip();
  glass(c, 12, 18, w - 24, h - 30, 0x0e1a32, 0.9);
  c.restore();
  c.lineWidth = 2.5; c.strokeStyle = 'rgba(159,216,255,0.6)'; c.beginPath(); c.roundRect(12, 18, w - 24, h - 30, 10); c.stroke();
  c.lineWidth = 3; c.strokeStyle = INK; c.beginPath(); c.roundRect(1.5, 7.5, w - 3, h - 9, 13); c.stroke();
  // a short hazard tab top centre and bolts in the corners
  c.save(); c.beginPath(); c.roundRect(w / 2 - 60, 2, 120, 12, 4); c.clip(); hazard(c, w / 2 - 60, 2, 120, 12, 9); c.restore();
  for (const [x, y] of [[8, 13], [w - 8, 13], [8, h - 8], [w - 8, h - 8]] as [number, number][]) bolt(c, x, y, 5);
}

// ------------------------------------------------------------------ the emblem

/** A round mission patch: the rover on the moon's rim, the Earth and stars, an orange stitched ring. */
export function missionPatch(c: CanvasRenderingContext2D, size: number): void {
  const u = size / 100;
  c.save();
  c.translate(size / 2, size / 2);
  const halo = c.createRadialGradient(0, 0, 20 * u, 0, 0, 50 * u);
  halo.addColorStop(0, 'rgba(120,200,255,0.35)'); halo.addColorStop(1, 'rgba(120,200,255,0)');
  c.fillStyle = halo; c.fillRect(-50 * u, -50 * u, 100 * u, 100 * u);
  // the ring
  c.fillStyle = css(ORANGE); c.strokeStyle = INK; c.lineWidth = 2.5 * u;
  c.beginPath(); c.arc(0, 0, 42 * u, 0, Math.PI * 2); c.fill(); c.stroke();
  c.setLineDash([3 * u, 2.5 * u]); c.strokeStyle = 'rgba(255,240,210,0.8)'; c.lineWidth = 1.2 * u;
  c.beginPath(); c.arc(0, 0, 39 * u, 0, Math.PI * 2); c.stroke(); c.setLineDash([]);
  // space inside
  c.save(); c.beginPath(); c.arc(0, 0, 34 * u, 0, Math.PI * 2); c.clip();
  const sp = c.createLinearGradient(0, -34 * u, 0, 34 * u); sp.addColorStop(0, '#0a1430'); sp.addColorStop(1, '#1a2a5a');
  c.fillStyle = sp; c.fillRect(-34 * u, -34 * u, 68 * u, 68 * u);
  c.fillStyle = '#ffffff';
  for (const [x, y, r] of [[-20, -18, 1.2], [14, -24, 1], [22, -8, 1.4], [-8, -26, 0.8], [-26, -4, 0.9], [4, -14, 0.7]] as [number, number, number][]) { c.beginPath(); c.arc(x * u, y * u, r * u, 0, Math.PI * 2); c.fill(); }
  // the Earth
  const eg = c.createRadialGradient(-14 * u, -12 * u, 1 * u, -12 * u, -10 * u, 9 * u); eg.addColorStop(0, '#9adcff'); eg.addColorStop(0.7, '#2a6ac8'); eg.addColorStop(1, '#10306a');
  c.fillStyle = eg; c.beginPath(); c.arc(-12 * u, -10 * u, 8 * u, 0, Math.PI * 2); c.fill();
  c.fillStyle = '#3a9a4a'; c.beginPath(); c.ellipse(-14 * u, -12 * u, 3 * u, 2 * u, 0.5, 0, Math.PI * 2); c.fill();
  // the moon's rim and the rover on it
  moonDisc(c, 0, 52 * u, 46 * u);
  roverSide(c, 6 * u, 9 * u, 22 * u, ORANGE);
  c.restore();
  c.lineWidth = 2.5 * u; c.strokeStyle = INK; c.beginPath(); c.arc(0, 0, 34 * u, 0, Math.PI * 2); c.stroke();
  // three stars on the ring
  for (const a of [-2.2, -Math.PI / 2, -0.94]) star(c, Math.cos(a) * 41 * u, Math.sin(a) * 41 * u, 5.5 * u, 0xfff2c0, INK);
  c.restore();
}

// ------------------------------------------------------------------ the HUD chips

export const HUD_SKIN: HudSkin = {
  pad: 10,
  font: SAIRA_STENCIL_ONE,
  weight: '400',
  text: '#eef6ff',
  caption: '#ffc860',
  chip: (c, w, h, pad) => {
    c.save();
    c.translate(pad, pad);
    c.shadowColor = 'rgba(0,0,0,0.55)'; c.shadowBlur = 8; c.shadowOffsetY = 3;
    const g = c.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, 'rgba(30,44,70,0.86)'); g.addColorStop(1, 'rgba(10,16,30,0.86)');
    c.fillStyle = g; c.beginPath(); c.roundRect(0, 0, w, h, Math.min(12, h / 2.6)); c.fill();
    c.shadowColor = 'transparent';
    c.fillStyle = 'rgba(255,255,255,0.08)'; c.beginPath(); c.roundRect(3, 3, w - 6, h * 0.42, Math.min(9, h / 3)); c.fill();
    c.lineWidth = 2; c.strokeStyle = 'rgba(159,216,255,0.7)'; c.beginPath(); c.roundRect(1, 1, w - 2, h - 2, Math.min(12, h / 2.6)); c.stroke();
    c.restore();
  },
};

// ------------------------------------------------------------------ the theme

export const BASE_THEME: MenuTheme = {
  font: SAIRA_STENCIL_ONE,
  fontScale: 1,
  palette: {
    primary: ORANGE, secondary: TEAL, board: STEEL, trim: HAZARD,
    label: '#ffffff', labelStroke: INK, muted: '#b8c8de', accent: '#ffd070',
    heading: '#ffd070', body: '#e6f0ff', icon: 0xeef6ff, shade: 0x05070e,
  },
  logo: {
    fill: ['#ffffff', '#e6eef8', '#9fb4cc', '#6a7a92'],
    outline: INK,
    rim: '#ffb040',
    depth: '#26314a',
    size: 132,
    emblem: { draw: missionPatch, size: 250, overlap: 0.3 },
  },
  skin: basePainter,
  pieces: [...STEERING_PIECES],
  frame: { border: BASE_BORDER, notes: paintCard, vignette: 0.55, dim: 0.22 },
  overlays: { lose: '#ff7a5a', win: '#ffd070', adColor: GREEN, ink: '#e6f0ff', titles: ['loseHearts', 'winAll', 'runDone'] },
  hud: HUD_SKIN,
  // the mission card in the orientation this run was given (read by the core at boot)
  get cards() { return screenCards(); },
  prebake: (scene) => { prebakeScreens(scene); prebakePlay(scene); },
};
