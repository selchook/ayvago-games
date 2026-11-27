// Monster Roundup's menu theme (src/core/menu-theme.ts): a space station's containment lab. Buttons are
// glossy enamel plates (signal orange for the main actions, containment teal for the rest) with a
// light rim and a rivet at each end; boards are white lab panels with an orange chevron band along
// the top, rivets in the corners and a smoked-glass field inside for the text; the how-to, pause
// and result cards are glass panels in a white frame. Each screen corner holds a rounded bracket with
// a teal status light. The logo's emblem is a round lab badge: a containment pod with a dizzy monster
// inside, in an orange ring. HUD chips are smoked glass with a teal rim. Display face: Righteous (SIL
// OFL, covers Turkish); body text stays Nunito. The menu itself is the core's: PLAY, Easy / Normal
// and the how-to; the mech (and its paint) is picked after PLAY on the mech select, the level on the
// map: one place per choice.
import { shadeColor, type MenuTheme, type SkinPainter, type BorderStyle, type HudSkin } from '@core';
import { RIGHTEOUS } from '@core/fonts/righteous';
import { prebakeScreens, screenCards } from './screens';
import { prebakePlay } from './hud';
import { INK, PANEL, PANEL_DARK, ORANGE, TEAL, GLOW, GREEN, NAVY, css, enamel, chevrons, rivet, glass, star, blobFace } from './paint';

// ------------------------------------------------------------------ the skin

export const labPainter: SkinPainter = (c, kind, w, h, o) => {
  const down = o.state === 'down', off = o.state === 'off', on = o.state === 'on', over = o.state === 'over';
  const base = off ? 0x5a606c : o.color;
  c.save();
  if (kind === 'board' || kind === 'plate') {
    const board = kind === 'board';
    c.save(); c.shadowColor = 'rgba(0,0,0,0.55)'; c.shadowBlur = 20; c.shadowOffsetY = 10;
    c.fillStyle = css(PANEL_DARK); c.beginPath(); c.roundRect(0, 4, w, h - 4, 18); c.fill(); c.restore();
    c.save(); c.beginPath(); c.roundRect(0, 4, w, h - 4, 18); c.clip();
    enamel(c, 0, 4, w, h - 4, PANEL);
    if (board) chevrons(c, 0, 4, w, 18, ORANGE, 14);
    c.restore();
    const fx = board ? 16 : 10, fy = board ? 34 : 10;
    const fw = w - fx * 2, fh = h - fy - (board ? 16 : 10);
    c.save(); c.beginPath(); c.roundRect(fx, fy, fw, fh, 12); c.clip();
    glass(c, fx, fy, fw, fh, NAVY, 0.92);
    c.restore();
    c.lineWidth = 2.5; c.strokeStyle = css(GLOW, 0.6); c.beginPath(); c.roundRect(fx, fy, fw, fh, 12); c.stroke();
    c.lineWidth = 3; c.strokeStyle = INK; c.beginPath(); c.roundRect(1.5, 5.5, w - 3, h - 7, 17); c.stroke();
    const r = board ? 5.5 : 4;
    for (const [x, y] of [[9, board ? 28 : 10], [w - 9, board ? 28 : 10], [9, h - 9], [w - 9, h - 9]] as [number, number][]) rivet(c, x, y, r);
    c.restore();
    return;
  }
  if (kind === 'track') {
    c.fillStyle = 'rgba(8,12,24,0.7)'; c.beginPath(); c.roundRect(0, 0, w, h, h / 2); c.fill();
    c.lineWidth = 2; c.strokeStyle = css(GLOW, 0.8); c.stroke();
    c.restore();
    return;
  }
  const lip = kind === 'round' ? 6 : Math.min(8, h * 0.14);
  const dy = down ? lip - 1 : 0;
  const rad = kind === 'round' ? Math.min(w, h) / 2 : Math.min(h / 2.4, 16);
  const shape = (yy: number) => { const p = new Path2D(); if (kind === 'round') p.ellipse(w / 2, yy + (h - lip) / 2, w / 2, (h - lip) / 2, 0, 0, Math.PI * 2); else p.roundRect(0, yy, w, h - lip, rad); return p; };
  if (over || on) { c.save(); c.shadowColor = on ? 'rgba(255,200,90,1)' : 'rgba(90,240,220,1)'; c.shadowBlur = over ? 18 : 14; c.fillStyle = css(on ? 0xffd070 : 0x9ff4e8); c.fill(shape(dy)); c.restore(); }
  c.save(); c.shadowColor = 'rgba(0,0,0,0.5)'; c.shadowBlur = down ? 3 : 9; c.shadowOffsetY = down ? 1 : 5;
  c.fillStyle = css(shadeColor(base, -0.5)); c.fill(shape(lip)); c.restore();
  c.lineWidth = 2.5; c.strokeStyle = INK; c.stroke(shape(lip));
  const face = shape(dy);
  c.save(); c.clip(face);
  const g = c.createLinearGradient(0, dy, 0, dy + h - lip);
  g.addColorStop(0, css(shadeColor(base, 0.35))); g.addColorStop(0.5, css(base)); g.addColorStop(1, css(shadeColor(base, -0.2)));
  c.fillStyle = g; c.fillRect(0, dy, w, h);
  c.fillStyle = 'rgba(255,255,255,0.22)';
  c.beginPath(); c.ellipse(w / 2, dy + (h - lip) * 0.18, w * 0.46, (h - lip) * 0.22, 0, 0, Math.PI * 2); c.fill();
  c.restore();
  c.lineWidth = 2; c.strokeStyle = 'rgba(255,255,255,0.5)';
  if (kind === 'round') { c.beginPath(); c.ellipse(w / 2, dy + (h - lip) / 2, w / 2 - 4, (h - lip) / 2 - 4, 0, 0, Math.PI * 2); c.stroke(); }
  else { c.beginPath(); c.roundRect(3, dy + 3, w - 6, h - lip - 6, Math.max(2, rad - 3)); c.stroke(); }
  if (kind !== 'round' && w >= 120 && h >= 44) { rivet(c, 13, dy + (h - lip) / 2, 4); rivet(c, w - 13, dy + (h - lip) / 2, 4); }
  c.lineWidth = 2.5; c.strokeStyle = INK; c.stroke(face);
  c.restore();
};

// ------------------------------------------------------------------ the frame: a rounded bracket with a status light

function cornerBracket(c: CanvasRenderingContext2D, s: number): void {
  const u = s / 100;
  c.save();
  c.beginPath(); c.moveTo(4 * u, 22 * u); c.quadraticCurveTo(4 * u, 4 * u, 22 * u, 4 * u); c.lineTo(72 * u, 4 * u); c.lineTo(72 * u, 18 * u); c.lineTo(26 * u, 18 * u); c.quadraticCurveTo(18 * u, 18 * u, 18 * u, 26 * u); c.lineTo(18 * u, 72 * u); c.lineTo(4 * u, 72 * u); c.closePath();
  c.save(); c.clip(); enamel(c, 0, 0, 72 * u, 72 * u, PANEL); c.restore();
  c.lineWidth = 2.5 * u; c.strokeStyle = INK; c.stroke();
  c.save(); c.beginPath(); c.rect(30 * u, 8 * u, 36 * u, 6 * u); c.clip(); chevrons(c, 30 * u, 8 * u, 36 * u, 6 * u, ORANGE, 5 * u); c.restore();
  const g = c.createRadialGradient(11 * u, 11 * u, 0, 11 * u, 11 * u, 7 * u);
  g.addColorStop(0, '#ffffff'); g.addColorStop(0.5, css(GLOW)); g.addColorStop(1, css(TEAL));
  c.fillStyle = g; c.beginPath(); c.arc(11 * u, 11 * u, 5 * u, 0, Math.PI * 2); c.fill();
  c.lineWidth = 1.5 * u; c.strokeStyle = INK; c.stroke();
  c.restore();
}

export const LAB_BORDER: BorderStyle = { thick: 0, inset: 4, corner: { size: 84, draw: cornerBracket, inset: 4 } };

// ------------------------------------------------------------------ the cards

/** The cards behind the how-to, the pause and the result: smoked glass in a white lab frame. */
export function paintCard(c: CanvasRenderingContext2D, w: number, h: number): void {
  c.save();
  c.shadowColor = 'rgba(0,0,0,0.5)'; c.shadowBlur = 18; c.shadowOffsetY = 8;
  c.fillStyle = css(PANEL_DARK); c.beginPath(); c.roundRect(0, 6, w, h - 6, 18); c.fill();
  c.restore();
  c.save(); c.beginPath(); c.roundRect(0, 6, w, h - 6, 18); c.clip();
  enamel(c, 0, 6, w, h - 6, PANEL);
  c.restore();
  c.save(); c.beginPath(); c.roundRect(12, 18, w - 24, h - 30, 12); c.clip();
  glass(c, 12, 18, w - 24, h - 30, NAVY, 0.93);
  c.restore();
  c.lineWidth = 2.5; c.strokeStyle = css(GLOW, 0.6); c.beginPath(); c.roundRect(12, 18, w - 24, h - 30, 12); c.stroke();
  c.lineWidth = 3; c.strokeStyle = INK; c.beginPath(); c.roundRect(1.5, 7.5, w - 3, h - 9, 17); c.stroke();
  c.save(); c.beginPath(); c.roundRect(w / 2 - 70, 2, 140, 12, 5); c.clip(); chevrons(c, w / 2 - 70, 2, 140, 12, ORANGE, 10); c.restore();
  for (const [x, y] of [[8, 13], [w - 8, 13], [8, h - 8], [w - 8, h - 8]] as [number, number][]) rivet(c, x, y, 5);
}

// ------------------------------------------------------------------ the emblem

/** A round lab badge: a containment pod with a dizzy monster inside, an orange ring, stars. */
export function labBadge(c: CanvasRenderingContext2D, size: number): void {
  const u = size / 100;
  c.save();
  c.translate(size / 2, size / 2);
  const halo = c.createRadialGradient(0, 0, 20 * u, 0, 0, 50 * u);
  halo.addColorStop(0, 'rgba(60,230,200,0.4)'); halo.addColorStop(1, 'rgba(60,230,200,0)');
  c.fillStyle = halo; c.fillRect(-50 * u, -50 * u, 100 * u, 100 * u);
  c.fillStyle = css(ORANGE); c.strokeStyle = INK; c.lineWidth = 2.5 * u;
  c.beginPath(); c.arc(0, 0, 42 * u, 0, Math.PI * 2); c.fill(); c.stroke();
  c.setLineDash([3 * u, 2.5 * u]); c.strokeStyle = 'rgba(255,240,210,0.85)'; c.lineWidth = 1.2 * u;
  c.beginPath(); c.arc(0, 0, 39 * u, 0, Math.PI * 2); c.stroke(); c.setLineDash([]);
  c.save(); c.beginPath(); c.arc(0, 0, 34 * u, 0, Math.PI * 2); c.clip();
  const sp = c.createLinearGradient(0, -34 * u, 0, 34 * u); sp.addColorStop(0, '#0e2a40'); sp.addColorStop(1, '#0a4a4a');
  c.fillStyle = sp; c.fillRect(-34 * u, -34 * u, 68 * u, 68 * u);
  // the pod: a glass capsule with caps
  c.fillStyle = '#e8edf3'; c.strokeStyle = INK; c.lineWidth = 2 * u;
  c.beginPath(); c.roundRect(-17 * u, -28 * u, 34 * u, 8 * u, 3 * u); c.fill(); c.stroke();
  c.beginPath(); c.roundRect(-20 * u, 20 * u, 40 * u, 10 * u, 3 * u); c.fill(); c.stroke();
  const gl = c.createLinearGradient(-14 * u, 0, 14 * u, 0);
  gl.addColorStop(0, 'rgba(58,224,200,0.55)'); gl.addColorStop(0.5, 'rgba(160,255,240,0.85)'); gl.addColorStop(1, 'rgba(58,224,200,0.5)');
  c.fillStyle = gl; c.beginPath(); c.rect(-14 * u, -20 * u, 28 * u, 40 * u); c.fill(); c.stroke();
  blobFace(c, 0, 3 * u, 10 * u, 0x6ad84a, true);
  c.fillStyle = 'rgba(255,255,255,0.6)'; c.fillRect(-11 * u, -17 * u, 3 * u, 33 * u);
  c.restore();
  c.lineWidth = 2.5 * u; c.strokeStyle = INK; c.beginPath(); c.arc(0, 0, 34 * u, 0, Math.PI * 2); c.stroke();
  for (const a of [-2.25, -Math.PI / 2, -0.89]) star(c, Math.cos(a) * 41 * u, Math.sin(a) * 41 * u, 5.5 * u, 0xfff2c0, INK);
  c.restore();
}

// ------------------------------------------------------------------ the HUD chips

export const HUD_SKIN: HudSkin = {
  pad: 10,
  font: RIGHTEOUS,
  weight: '400',
  text: '#f0fbff',
  caption: '#7af0e0',
  chip: (c, w, h, pad) => {
    c.save();
    c.translate(pad, pad);
    c.shadowColor = 'rgba(0,0,0,0.5)'; c.shadowBlur = 8; c.shadowOffsetY = 3;
    const g = c.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, 'rgba(26,44,66,0.86)'); g.addColorStop(1, 'rgba(10,18,32,0.86)');
    c.fillStyle = g; c.beginPath(); c.roundRect(0, 0, w, h, h / 2); c.fill();
    c.shadowColor = 'transparent';
    c.fillStyle = 'rgba(255,255,255,0.09)'; c.beginPath(); c.roundRect(4, 3, w - 8, h * 0.42, h / 3); c.fill();
    c.lineWidth = 2; c.strokeStyle = css(GLOW, 0.75); c.beginPath(); c.roundRect(1, 1, w - 2, h - 2, h / 2); c.stroke();
    c.restore();
  },
};

// ------------------------------------------------------------------ the theme

export const LAB_THEME: MenuTheme = {
  font: RIGHTEOUS,
  fontScale: 1,
  palette: {
    primary: ORANGE, secondary: TEAL, board: PANEL, trim: ORANGE,
    label: '#ffffff', labelStroke: INK, muted: '#b8d8de', accent: '#7af0e0',
    heading: '#7af0e0', body: '#e6f4ff', icon: 0xf0fbff, shade: 0x060a14,
  },
  logo: {
    fill: ['#ffffff', '#e8fffb', '#7af0e0', '#18a9a0'],
    outline: INK,
    rim: '#ff9a2a',
    depth: '#0e3a44',
    size: 132,
    emblem: { draw: labBadge, size: 250, overlap: 0.3 },
  },
  skin: labPainter,
  frame: { border: LAB_BORDER, notes: paintCard, vignette: 0.55, dim: 0.2 },
  overlays: { lose: '#ff8a6a', win: '#7af0e0', adColor: GREEN, ink: '#e6f4ff', titles: ['loseHull', 'winAll', 'runDone'] },
  hud: HUD_SKIN,
  // the level card in the orientation this run was given (read by the core at boot)
  get cards() { return screenCards(); },
  prebake: (scene) => { prebakeScreens(scene); prebakePlay(scene); },
};
