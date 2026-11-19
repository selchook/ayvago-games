// Neon Ronin's menu theme (src/core/menu-theme.ts): a neon-on-black glitch skin. Buttons and plates
// are black glass with chamfered corners, a neon outline in their colour with a chromatic glitch
// echo (magenta and cyan offsets), faint scanlines, corner ticks, and on the big buttons a strip of
// the kit's yellow-and-black hazard stripes; boards are dark panels with a neon frame, a faint grid
// and hazard tabs. Round knobs are neon hexagons. A frame of HUD brackets with hazard corners runs
// round the screen; the how-to, pause and result cards are dark glass with scanlines. Behind the
// logo: a synthwave sun cut by bars with a neon katana across it. Display face: Saira Stencil One
// (SIL OFL, latin + latin-ext: Turkish). The menu itself is the core's: PLAY, Easy / Normal and the
// how-to; the level is picked on the map after PLAY (one place per choice).
import { type MenuTheme, type SkinPainter, type BorderStyle } from '@core';
import { SAIRA_STENCIL_ONE } from '@core/fonts/saira-stencil-one';
import { prebakeScreens, SCREEN_CARDS } from './screens';
import { INK, MAGENTA, CYAN, YELLOW, LIME, STEEL, hazard } from './palette';
export { INK, MAGENTA, CYAN, YELLOW, LIME, VIOLET, RED, STEEL, hazard } from './palette';

const css = (c: number, a = 1): string => `rgba(${(c >> 16) & 255},${(c >> 8) & 255},${c & 255},${a})`;
const mix = (c: number, k: number): number => {
  const f = (v: number) => Math.round(k > 0 ? v + (255 - v) * k : v * (1 + k));
  return (f((c >> 16) & 255) << 16) | (f((c >> 8) & 255) << 8) | f(c & 255);
};

/** A chamfered rectangle (cut corners) as a path. */
function chamfer(c: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, k: number): void {
  k = Math.min(k, w / 3, h / 3);
  c.beginPath();
  c.moveTo(x + k, y);
  c.lineTo(x + w, y);
  c.lineTo(x + w, y + h - k);
  c.lineTo(x + w - k, y + h);
  c.lineTo(x, y + h);
  c.lineTo(x, y + k);
  c.closePath();
}

function scanlines(c: CanvasRenderingContext2D, w: number, h: number, a = 0.07): void {
  c.fillStyle = `rgba(255,255,255,${a})`;
  for (let y = 1; y < h; y += 3) c.fillRect(0, y, w, 1);
}

// ------------------------------------------------------------------ the skin

export const neonPainter: SkinPainter = (c, kind, w, h, o) => {
  const off = o.state === 'off';
  const hot = o.state === 'over' || o.state === 'on';
  const down = o.state === 'down';
  const neon = off ? STEEL : o.color;
  c.save();
  c.translate(0, down ? 2 : 0);
  if (kind === 'round') {
    // a neon hexagon knob
    const R = Math.min(w, h) / 2 - 2, cx = w / 2, cy = h / 2;
    const hex = (r: number) => { c.beginPath(); for (let i = 0; i < 6; i++) { const a = Math.PI / 6 + i * Math.PI / 3; c.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r); } c.closePath(); };
    c.save(); c.shadowColor = css(neon, hot ? 1 : 0.7); c.shadowBlur = hot ? 16 : 9;
    hex(R); c.fillStyle = '#0b0818'; c.fill(); c.restore();
    hex(R); c.lineWidth = 3; c.strokeStyle = css(neon); c.stroke();
    hex(R - 6); c.lineWidth = 1.2; c.strokeStyle = css(neon, 0.45); c.stroke();
    if (hot) { hex(R - 1); c.fillStyle = css(neon, 0.18); c.fill(); }
    c.restore();
    return;
  }
  const k = kind === 'board' ? 26 : kind === 'track' ? h / 3 : Math.min(18, h * 0.32);
  // the glow under it
  c.save();
  c.shadowColor = css(neon, off ? 0.2 : hot ? 1 : 0.6);
  c.shadowBlur = kind === 'board' ? 22 : hot ? 20 : down ? 4 : 10;
  chamfer(c, 0, 0, w, h, k);
  c.fillStyle = kind === 'track' ? '#06040e' : '#0b0818';
  c.fill();
  c.restore();
  // the glass: a dark gradient tinted with the neon, scanlines, a grid on boards
  c.save();
  chamfer(c, 0, 0, w, h, k);
  c.clip();
  const g = c.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, css(mix(neon, -0.72), kind === 'track' ? 0.5 : o.state === 'on' ? 0.95 : 0.85));
  g.addColorStop(1, css(mix(neon, -0.9), 0.95));
  c.fillStyle = g;
  c.fillRect(0, 0, w, h);
  if (o.state === 'on' || (hot && kind !== 'board')) { c.fillStyle = css(neon, o.state === 'on' ? 0.22 : 0.12); c.fillRect(0, 0, w, h); }
  if (kind === 'board') {
    c.strokeStyle = css(neon, 0.06);
    c.lineWidth = 1;
    for (let x = 0; x < w; x += 32) { c.beginPath(); c.moveTo(x, 0); c.lineTo(x, h); c.stroke(); }
    for (let y = 0; y < h; y += 32) { c.beginPath(); c.moveTo(0, y); c.lineTo(w, y); c.stroke(); }
  }
  scanlines(c, w, h, kind === 'board' ? 0.035 : 0.05);
  // a gloss band
  const gl = c.createLinearGradient(0, 0, 0, h * 0.5);
  gl.addColorStop(0, 'rgba(255,255,255,0.12)'); gl.addColorStop(1, 'rgba(255,255,255,0)');
  c.fillStyle = gl; c.fillRect(0, 0, w, h * 0.5);
  // hazard stripes: a strip on the left of big buttons, tabs on boards
  if (kind === 'button' && w >= 220 && !off) hazard(c, 0, 0, 14, h, 7);
  if (kind === 'board') { hazard(c, w - 120, 0, 90, 8, 8); hazard(c, 30, h - 8, 90, 8, 8); }
  c.restore();
  // the neon outline with a glitch echo
  if (!off && kind !== 'track') {
    c.save();
    c.globalCompositeOperation = 'lighter';
    c.lineWidth = 1.5;
    chamfer(c, -2, 1, w, h, k); c.strokeStyle = css(MAGENTA, 0.5); c.stroke();
    chamfer(c, 2, -1, w, h, k); c.strokeStyle = css(CYAN, 0.45); c.stroke();
    c.restore();
  }
  c.lineWidth = kind === 'board' ? 3 : 2.5;
  chamfer(c, 1, 1, w - 2, h - 2, k);
  c.strokeStyle = css(neon, off ? 0.5 : 1);
  c.stroke();
  if (hot) { c.save(); c.shadowColor = css(neon); c.shadowBlur = 10; c.strokeStyle = css(mix(neon, 0.5)); c.lineWidth = 2; chamfer(c, 1, 1, w - 2, h - 2, k); c.stroke(); c.restore(); }
  // corner ticks
  if (kind !== 'track') {
    c.strokeStyle = css(mix(neon, 0.4), off ? 0.3 : 0.9);
    c.lineWidth = 2;
    const t = Math.min(16, h * 0.3);
    c.beginPath(); c.moveTo(w - 6 - t, 5); c.lineTo(w - 6, 5); c.lineTo(w - 6, 5 + t); c.stroke();
    c.beginPath(); c.moveTo(6, h - 5 - t); c.lineTo(6, h - 5); c.lineTo(6 + t, h - 5); c.stroke();
  }
  if (down) { chamfer(c, 0, 0, w, h, k); c.fillStyle = 'rgba(0,0,0,0.25)'; c.fill(); }
  c.restore();
};

// ------------------------------------------------------------------ the frame: HUD brackets

const bracketEdge: BorderStyle['edge'] = (c, len, thick) => {
  // a thin neon rule with gaps and ticks
  const y = thick * 0.45;
  c.save();
  c.shadowColor = css(CYAN); c.shadowBlur = 6;
  c.strokeStyle = css(CYAN, 0.55);
  c.lineWidth = 1.5;
  c.setLineDash([60, 14, 8, 14]);
  c.beginPath(); c.moveTo(0, y); c.lineTo(len, y); c.stroke();
  c.setLineDash([]);
  c.strokeStyle = css(MAGENTA, 0.6);
  for (let x = len / 2 - 120; x <= len / 2 + 120; x += 24) { c.beginPath(); c.moveTo(x, y - 4); c.lineTo(x, y + 4); c.stroke(); }
  c.restore();
};

function bracketCorner(c: CanvasRenderingContext2D, s: number): void {
  c.save();
  hazard(c, 6, 6, s * 0.55, 9, 8);
  hazard(c, 6, 6, 9, s * 0.55, 8);
  c.shadowColor = css(MAGENTA); c.shadowBlur = 10;
  c.strokeStyle = css(MAGENTA); c.lineWidth = 3;
  c.beginPath(); c.moveTo(s * 0.85, 22); c.lineTo(22, 22); c.lineTo(22, s * 0.85); c.stroke();
  c.strokeStyle = css(CYAN); c.lineWidth = 1.5;
  c.beginPath(); c.moveTo(s * 0.6, 30); c.lineTo(30, 30); c.lineTo(30, s * 0.6); c.stroke();
  c.fillStyle = css(YELLOW);
  c.fillRect(34, 34, 6, 6);
  c.restore();
}

export const NEON_BORDER: BorderStyle = { thick: 18, inset: 6, edge: bracketEdge, corner: { size: 84, draw: bracketCorner, inset: 0 } };

// ------------------------------------------------------------------ dark glass cards

/** Dark glass with a cyan frame, scanlines and a magenta tab (how-to, pause, results). */
export function paintGlass(c: CanvasRenderingContext2D, w: number, h: number): void {
  c.save();
  c.shadowColor = css(CYAN, 0.6); c.shadowBlur = 16;
  chamfer(c, 0, 0, w, h, 22);
  c.fillStyle = 'rgba(10,6,22,0.94)'; c.fill();
  c.restore();
  c.save();
  chamfer(c, 0, 0, w, h, 22); c.clip();
  const g = c.createLinearGradient(0, 0, w, h);
  g.addColorStop(0, 'rgba(255,63,168,0.10)'); g.addColorStop(0.5, 'rgba(20,10,40,0)'); g.addColorStop(1, 'rgba(63,240,255,0.10)');
  c.fillStyle = g; c.fillRect(0, 0, w, h);
  scanlines(c, w, h, 0.04);
  c.restore();
  c.lineWidth = 2.5; c.strokeStyle = css(CYAN, 0.9);
  chamfer(c, 1, 1, w - 2, h - 2, 22); c.stroke();
  c.lineWidth = 1; c.strokeStyle = css(MAGENTA, 0.5);
  chamfer(c, 7, 7, w - 14, h - 14, 18); c.stroke();
  if (w >= 300) { hazard(c, w - 110, h - 7, 80, 7, 7); c.fillStyle = css(MAGENTA); c.fillRect(30, 0, 70, 4); }
}

// ------------------------------------------------------------------ the emblem

/** A synthwave sun cut by bars, a neon katana across it, rain streaks. */
export function neonEmblem(c: CanvasRenderingContext2D, size: number): void {
  const u = size / 100;
  c.save();
  c.translate(size / 2, size / 2);
  const halo = c.createRadialGradient(0, 0, 8 * u, 0, 0, 50 * u);
  halo.addColorStop(0, 'rgba(255,63,168,0.45)'); halo.addColorStop(1, 'rgba(255,63,168,0)');
  c.fillStyle = halo; c.fillRect(-50 * u, -50 * u, 100 * u, 100 * u);
  // the sun with bars
  c.save();
  c.beginPath(); c.arc(0, 0, 34 * u, 0, Math.PI * 2); c.clip();
  const sg = c.createLinearGradient(0, -34 * u, 0, 34 * u);
  sg.addColorStop(0, '#ffe86a'); sg.addColorStop(0.45, '#ff8a3c'); sg.addColorStop(1, '#ff2a8a');
  c.fillStyle = sg; c.fillRect(-40 * u, -40 * u, 80 * u, 80 * u);
  c.fillStyle = '#12041e';
  for (let i = 0; i < 6; i++) { const y = (4 + i * 6) * u; c.fillRect(-40 * u, y, 80 * u, (1 + i * 0.6) * u); }
  c.restore();
  c.lineWidth = 1.6 * u; c.strokeStyle = 'rgba(255,220,240,0.7)';
  c.beginPath(); c.arc(0, 0, 34 * u, 0, Math.PI * 2); c.stroke();
  // the katana across, a cyan neon blade
  c.save();
  c.rotate(-0.72);
  c.shadowColor = '#3ff0ff'; c.shadowBlur = 10 * u;
  c.fillStyle = '#bffcff';
  c.beginPath(); c.moveTo(-6 * u, -2.2 * u); c.lineTo(44 * u, -2.6 * u); c.quadraticCurveTo(50 * u, -1 * u, 46 * u, 1.8 * u); c.lineTo(-6 * u, 2.2 * u); c.closePath(); c.fill();
  c.shadowBlur = 0;
  c.fillStyle = '#ffd23a'; c.fillRect(-9 * u, -5 * u, 3 * u, 10 * u);
  c.fillStyle = '#2a1030'; c.fillRect(-30 * u, -2.6 * u, 21 * u, 5.2 * u);
  c.strokeStyle = '#ff3fa8'; c.lineWidth = 1.2 * u;
  for (let x = -28; x < -10; x += 4) { c.beginPath(); c.moveTo(x * u, -2.6 * u); c.lineTo((x + 2) * u, 2.6 * u); c.stroke(); }
  c.restore();
  // rain
  c.strokeStyle = 'rgba(160,230,255,0.5)'; c.lineWidth = 0.8 * u;
  for (let i = 0; i < 14; i++) { const x = -46 + ((i * 37) % 92), y = -44 + ((i * 53) % 80); c.beginPath(); c.moveTo(x * u, y * u); c.lineTo((x - 2) * u, (y + 9) * u); c.stroke(); }
  c.restore();
}

// ------------------------------------------------------------------ the theme

/** The menu row's MOVES button. */
export const MOVES_BTN = { w: 300, h: 76 };

export const NEON_THEME: MenuTheme = {
  font: SAIRA_STENCIL_ONE,
  palette: {
    primary: MAGENTA, secondary: CYAN, board: 0x2a1a50, trim: YELLOW,
    label: '#ffffff', labelStroke: INK, muted: '#8a84b0', accent: '#ffe040',
    heading: '#3ff0ff', body: '#dcd6ff', icon: 0xffffff, shade: 0x05030f,
  },
  logo: {
    fill: ['#ffffff', '#ffc0e8', '#ff3fa8', '#9a1468'],
    outline: '#12041e',
    rim: '#3ff0ff',
    depth: '#3a0a48',
    size: 150,
    upper: true,
    emblem: { draw: neonEmblem, size: 240, overlap: 0.3 },
  },
  skin: neonPainter,
  frame: { border: NEON_BORDER, notes: paintGlass, vignette: 0.6, dim: 0.3 },
  overlays: { lose: '#ff3fa8', win: '#3ff0ff', adColor: LIME, titles: ['flatlined', 'runBanked', 'districtDone', 'cityFree'] },
  cards: SCREEN_CARDS,
  pieces: [{ kind: 'button', w: MOVES_BTN.w, h: MOVES_BTN.h }],
  prebake: (scene) => prebakeScreens(scene),
};
