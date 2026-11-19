// Neon Ronin: the 2D art, painted on canvases once (Boot, under the Ayvago intro): neon line icons
// for the HUD, the cards, the cyberware and the map (each a glowing stroke in its colour on a dark
// disc or bare), the touch buttons, and the soft glow sprites the 3D view turns into textures.
import Phaser from 'phaser';
import { bake } from '@core';

export const CYAN = '#3ff0ff', MAGENTA = '#ff3fa8', YELLOW = '#ffe040', LIME = '#7cff6a', ORANGE = '#ff9a3c', VIOLET = '#a98bff', RED = '#ff4a5a', WHITE = '#f4f8ff';

type Painter = (c: CanvasRenderingContext2D) => void;
const P = (c: CanvasRenderingContext2D, pts: number[], close = false): void => {
  c.beginPath();
  c.moveTo(pts[0], pts[1]);
  for (let i = 2; i < pts.length; i += 2) c.lineTo(pts[i], pts[i + 1]);
  if (close) c.closePath();
};

/** Line icons on a 100 × 100 box (stroked by `icon` with a glow). */
const ICONS: Record<string, [Painter, string]> = {
  katana: [(c) => { P(c, [22, 82, 78, 18]); c.stroke(); P(c, [30, 64, 40, 74]); c.stroke(); P(c, [14, 90, 26, 78]); c.stroke(); }, CYAN],
  blaster: [(c) => { P(c, [14, 40, 76, 40, 86, 46, 76, 52, 44, 52, 38, 74, 24, 74, 28, 52, 14, 52], true); c.stroke(); P(c, [86, 46, 94, 46]); c.stroke(); }, MAGENTA],
  boots: [(c) => { P(c, [34, 16, 34, 62, 18, 76, 18, 86, 80, 86, 80, 74, 56, 66, 54, 16], true); c.stroke(); P(c, [62, 30, 86, 30]); c.stroke(); P(c, [64, 44, 90, 44]); c.stroke(); }, YELLOW],
  armor: [(c) => { P(c, [50, 12, 82, 24, 78, 60, 50, 88, 22, 60, 18, 24], true); c.stroke(); P(c, [50, 28, 50, 70]); c.stroke(); }, LIME],
  magnet: [(c) => { c.beginPath(); c.arc(50, 46, 26, Math.PI, 0); c.stroke(); P(c, [24, 46, 24, 80]); c.stroke(); P(c, [76, 46, 76, 80]); c.stroke(); P(c, [16, 70, 32, 70]); c.stroke(); P(c, [68, 70, 84, 70]); c.stroke(); }, ORANGE],
  heat: [(c) => { P(c, [50, 10, 66, 36, 58, 38, 72, 62, 50, 90, 28, 62, 42, 38, 34, 36], true); c.stroke(); }, ORANGE],
  slash: [(c) => { c.beginPath(); c.arc(30, 70, 52, -1.2, -0.1); c.stroke(); c.beginPath(); c.arc(30, 70, 38, -1.1, -0.2); c.stroke(); }, CYAN],
  bounce: [(c) => { P(c, [12, 72, 40, 30, 64, 70, 88, 26]); c.stroke(); c.beginPath(); c.arc(88, 26, 5, 0, 7); c.fill(); }, MAGENTA],
  bolt: [(c) => { P(c, [58, 8, 24, 54, 48, 54, 38, 92, 78, 42, 54, 42, 66, 8], true); c.stroke(); }, YELLOW],
  skull: [(c) => { c.beginPath(); c.arc(50, 44, 30, Math.PI * 0.85, Math.PI * 2.15); c.stroke(); P(c, [26, 62, 30, 82, 70, 82, 74, 62]); c.stroke(); c.beginPath(); c.arc(38, 46, 7, 0, 7); c.arc(62, 46, 7, 0, 7); c.fill(); }, RED],
  target: [(c) => { c.beginPath(); c.arc(50, 50, 32, 0, 7); c.stroke(); c.beginPath(); c.arc(50, 50, 14, 0, 7); c.stroke(); P(c, [50, 8, 50, 30]); c.stroke(); P(c, [50, 70, 50, 92]); c.stroke(); P(c, [8, 50, 30, 50]); c.stroke(); P(c, [70, 50, 92, 50]); c.stroke(); }, RED],
  fox: [(c) => { P(c, [14, 14, 36, 42, 64, 42, 86, 14, 80, 54, 50, 88, 20, 54], true); c.stroke(); c.beginPath(); c.arc(38, 56, 4, 0, 7); c.arc(62, 56, 4, 0, 7); c.fill(); }, ORANGE],
  ghost: [(c) => { c.beginPath(); c.arc(50, 42, 26, Math.PI, 0); c.lineTo(76, 84); c.lineTo(63, 74); c.lineTo(50, 84); c.lineTo(37, 74); c.lineTo(24, 84); c.closePath(); c.stroke(); c.beginPath(); c.arc(41, 44, 4, 0, 7); c.arc(59, 44, 4, 0, 7); c.fill(); }, VIOLET],
  shield: [(c) => { P(c, [50, 10, 84, 22, 80, 58, 50, 90, 20, 58, 16, 22], true); c.stroke(); P(c, [34, 50, 46, 62, 68, 36]); c.stroke(); }, CYAN],
  fang: [(c) => { P(c, [18, 20, 82, 20]); c.stroke(); P(c, [28, 20, 38, 76, 48, 20]); c.stroke(); P(c, [52, 20, 62, 76, 72, 20]); c.stroke(); }, RED],
  heart: [(c) => { c.beginPath(); c.moveTo(50, 84); c.bezierCurveTo(10, 58, 12, 18, 38, 20); c.bezierCurveTo(46, 21, 50, 30, 50, 34); c.bezierCurveTo(50, 30, 54, 21, 62, 20); c.bezierCurveTo(88, 18, 90, 58, 50, 84); c.closePath(); c.stroke(); }, RED],
  anchor: [(c) => { c.beginPath(); c.arc(50, 20, 8, 0, 7); c.stroke(); P(c, [50, 28, 50, 86]); c.stroke(); P(c, [32, 40, 68, 40]); c.stroke(); c.beginPath(); c.arc(50, 58, 30, 0.2, Math.PI - 0.2); c.stroke(); }, VIOLET],
  spring: [(c) => { P(c, [30, 86, 70, 86]); c.stroke(); P(c, [30, 14, 70, 14]); c.stroke(); P(c, [50, 86, 28, 74, 72, 62, 28, 50, 72, 38, 28, 26, 50, 14]); c.stroke(); }, LIME],
  wings: [(c) => { P(c, [50, 50, 14, 20, 20, 50, 10, 54, 26, 76, 50, 58, 74, 76, 90, 54, 80, 50, 86, 20], true); c.stroke(); }, CYAN],
  snow: [(c) => { for (let i = 0; i < 3; i++) { const a = i * Math.PI / 3; P(c, [50 + Math.cos(a) * 38, 50 + Math.sin(a) * 38, 50 - Math.cos(a) * 38, 50 - Math.sin(a) * 38]); c.stroke(); } c.beginPath(); c.arc(50, 50, 10, 0, 7); c.stroke(); }, CYAN],
  twin: [(c) => { P(c, [10, 34, 70, 34]); c.stroke(); P(c, [10, 66, 70, 66]); c.stroke(); P(c, [62, 24, 82, 34, 62, 44]); c.stroke(); P(c, [62, 56, 82, 66, 62, 76]); c.stroke(); }, MAGENTA],
  box: [(c) => { P(c, [16, 36, 50, 20, 84, 36, 84, 72, 50, 88, 16, 72], true); c.stroke(); P(c, [16, 36, 50, 52, 84, 36]); c.stroke(); P(c, [50, 52, 50, 88]); c.stroke(); }, ORANGE],
  gear: [(c) => { const n = 8; c.beginPath(); for (let i = 0; i < n * 2; i++) { const a = i / (n * 2) * Math.PI * 2, r = i % 2 ? 30 : 40; c.lineTo(50 + Math.cos(a) * r, 50 + Math.sin(a) * r); } c.closePath(); c.stroke(); c.beginPath(); c.arc(50, 50, 12, 0, 7); c.stroke(); }, ORANGE],
  streak: [(c) => { P(c, [14, 80, 38, 56, 54, 68, 86, 22]); c.stroke(); P(c, [66, 22, 86, 22, 86, 42]); c.stroke(); }, YELLOW],
  clock: [(c) => { c.beginPath(); c.arc(50, 52, 34, 0, 7); c.stroke(); P(c, [50, 30, 50, 54, 66, 64]); c.stroke(); P(c, [40, 10, 60, 10]); c.stroke(); }, WHITE],
  chip: [(c) => { P(c, [26, 26, 74, 26, 74, 74, 26, 74], true); c.stroke(); for (const k of [36, 50, 64]) { P(c, [k, 26, k, 12]); c.stroke(); P(c, [k, 74, k, 88]); c.stroke(); P(c, [26, k, 12, k]); c.stroke(); P(c, [74, k, 88, k]); c.stroke(); } c.beginPath(); c.arc(50, 50, 9, 0, 7); c.fill(); }, LIME],
  star: [(c) => { c.beginPath(); for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, r = i % 2 ? 17 : 40; c.lineTo(50 + Math.cos(a) * r, 52 + Math.sin(a) * r); } c.closePath(); c.fill(); }, YELLOW],
  starOff: [(c) => { c.beginPath(); for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, r = i % 2 ? 17 : 40; c.lineTo(50 + Math.cos(a) * r, 52 + Math.sin(a) * r); } c.closePath(); c.stroke(); }, '#5a5a7a'],
  lock: [(c) => { P(c, [24, 46, 76, 46, 76, 86, 24, 86], true); c.stroke(); c.beginPath(); c.arc(50, 46, 18, Math.PI, 0); c.stroke(); c.beginPath(); c.arc(50, 64, 5, 0, 7); c.fill(); }, '#8a8aaa'],
  hp: [(c) => { P(c, [40, 14, 60, 14, 60, 40, 86, 40, 86, 60, 60, 60, 60, 86, 40, 86, 40, 60, 14, 60, 14, 40, 40, 40], true); c.stroke(); }, LIME],
  tank: [(c) => { P(c, [32, 20, 68, 20, 72, 30, 72, 82, 28, 82, 28, 30], true); c.stroke(); P(c, [40, 12, 60, 12]); c.stroke(); P(c, [40, 44, 40, 70]); c.stroke(); }, CYAN],
  sword: [(c) => { P(c, [22, 82, 78, 18]); c.stroke(); P(c, [30, 64, 40, 74]); c.stroke(); }, CYAN],
  roll: [(c) => { c.beginPath(); c.arc(50, 50, 30, -0.4, Math.PI * 1.6); c.stroke(); P(c, [74, 20, 78, 38, 60, 40]); c.stroke(); }, YELLOW],
  jump: [(c) => { P(c, [50, 84, 50, 22]); c.stroke(); P(c, [26, 44, 50, 18, 74, 44]); c.stroke(); }, LIME],
  wall: [(c) => { P(c, [76, 10, 76, 90]); c.stroke(); P(c, [62, 70, 30, 34]); c.stroke(); P(c, [30, 50, 30, 34, 46, 34]); c.stroke(); }, VIOLET],
  cleave: [(c) => { c.beginPath(); c.arc(50, 80, 46, -2.6, -0.5); c.stroke(); P(c, [10, 86, 90, 86]); c.stroke(); P(c, [70, 86, 82, 76]); c.stroke(); }, MAGENTA],
  slam: [(c) => { P(c, [50, 10, 50, 58]); c.stroke(); P(c, [34, 44, 50, 60, 66, 44]); c.stroke(); P(c, [12, 82, 88, 82]); c.stroke(); P(c, [20, 70, 30, 76]); c.stroke(); P(c, [80, 70, 70, 76]); c.stroke(); }, ORANGE],
  // the blade moves (the Moves screen, the pause)
  spin: [(c) => { c.beginPath(); c.arc(50, 50, 32, 0.3, Math.PI * 1.7); c.stroke(); P(c, [72, 22, 80, 40, 62, 40]); c.stroke(); c.beginPath(); c.arc(50, 50, 16, Math.PI * 1.2, Math.PI * 2.6); c.stroke(); }, CYAN],
  rise: [(c) => { c.beginPath(); c.arc(70, 78, 50, Math.PI * 1.02, Math.PI * 1.48); c.stroke(); P(c, [62, 14, 70, 28, 56, 30]); c.stroke(); P(c, [18, 88, 46, 88]); c.stroke(); P(c, [70, 52, 70, 88]); c.stroke(); P(c, [60, 62, 70, 52, 80, 62]); c.stroke(); }, YELLOW],
  sky: [(c) => { for (const [x, y] of [[20, 30], [38, 48], [56, 66]]) { P(c, [x, y + 8, x + 28, y - 8]); c.stroke(); } P(c, [82, 22, 82, 86]); c.stroke(); P(c, [70, 74, 82, 88, 94, 74]); c.stroke(); }, MAGENTA],
  dive: [(c) => { P(c, [16, 16, 66, 66]); c.stroke(); P(c, [44, 70, 70, 70, 70, 44]); c.stroke(); P(c, [12, 88, 88, 88]); c.stroke(); P(c, [36, 16, 60, 40]); c.stroke(); }, CYAN],
  iaido: [(c) => { P(c, [8, 50, 92, 50]); c.stroke(); P(c, [22, 40, 22, 60]); c.stroke(); P(c, [8, 50, 30, 50]); c.stroke(); P(c, [60, 26, 80, 74]); c.stroke(); P(c, [80, 26, 60, 74]); c.stroke(); }, WHITE],
  mirror: [(c) => { P(c, [30, 12, 30, 88]); c.stroke(); P(c, [92, 30, 46, 50, 92, 70]); c.stroke(); P(c, [80, 66, 92, 70, 84, 82]); c.stroke(); c.beginPath(); c.arc(46, 50, 6, 0, 7); c.fill(); }, YELLOW],
  burst: [(c) => { P(c, [10, 70, 40, 40]); c.stroke(); P(c, [26, 50, 40, 64]); c.stroke(); for (let i = 0; i < 8; i++) { const a = i * Math.PI / 4; P(c, [68 + Math.cos(a) * 10, 34 + Math.sin(a) * 10, 68 + Math.cos(a) * 24, 34 + Math.sin(a) * 24]); c.stroke(); } }, MAGENTA],
  map: [(c) => { P(c, [12, 24, 36, 14, 64, 26, 88, 16, 88, 76, 64, 86, 36, 74, 12, 84], true); c.stroke(); P(c, [36, 14, 36, 74]); c.stroke(); P(c, [64, 26, 64, 86]); c.stroke(); }, CYAN],
  ripper: [(c) => { c.beginPath(); c.arc(50, 34, 16, 0, 7); c.stroke(); P(c, [22, 88, 26, 62, 50, 54, 74, 62, 78, 88]); c.stroke(); P(c, [44, 34, 56, 34]); c.stroke(); P(c, [58, 70, 70, 70, 70, 80]); c.stroke(); }, MAGENTA],
  play: [(c) => { P(c, [32, 18, 80, 50, 32, 82], true); c.fill(); }, WHITE],
  boss: [(c) => { P(c, [16, 30, 30, 50, 50, 20, 70, 50, 84, 30, 78, 76, 22, 76], true); c.stroke(); c.beginPath(); c.arc(50, 62, 6, 0, 7); c.fill(); }, RED],
};
export const ICON_IDS = Object.keys(ICONS);
export const icon = (id: string): string => 'nr-i-' + id;

/** Paints one icon at `size` px: the glowing stroke, a brighter core. */
function paintIcon(c: CanvasRenderingContext2D, id: string, size: number, color?: string): void {
  const [draw, col] = ICONS[id];
  const k = size / 100;
  c.save();
  c.scale(k, k);
  c.lineCap = 'round';
  c.lineJoin = 'round';
  c.strokeStyle = color ?? col;
  c.fillStyle = color ?? col;
  c.shadowColor = color ?? col;
  c.shadowBlur = 12;
  c.lineWidth = 9;
  draw(c);
  c.shadowBlur = 0;
  c.strokeStyle = 'rgba(255,255,255,0.85)';
  c.fillStyle = 'rgba(255,255,255,0.85)';
  c.lineWidth = 3;
  draw(c);
  c.restore();
}

export const ICON_PX = 96;

/** Every icon as a texture (`icon(id)`), and the glow sprites. Idempotent. */
export function makeArt(scene: Phaser.Scene): void {
  for (const id of ICON_IDS) bake(scene, icon(id), ICON_PX, ICON_PX, (c) => paintIcon(c, id, ICON_PX));
  bake(scene, 'nr-spark', 32, 32, (c) => {
    const g = c.createRadialGradient(16, 16, 0, 16, 16, 16);
    g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.35, 'rgba(255,255,255,0.7)'); g.addColorStop(1, 'rgba(255,255,255,0)');
    c.fillStyle = g; c.fillRect(0, 0, 32, 32);
  });
  bake(scene, 'nr-rain', 4, 48, (c) => {
    const g = c.createLinearGradient(0, 0, 0, 48);
    g.addColorStop(0, 'rgba(160,220,255,0)'); g.addColorStop(1, 'rgba(200,240,255,0.75)');
    c.fillStyle = g; c.fillRect(1, 0, 2, 48);
  });
  bake(scene, 'nr-vignette', 640, 360, (c) => {
    const g = c.createRadialGradient(320, 180, 120, 320, 180, 380);
    g.addColorStop(0, 'rgba(255,0,60,0)'); g.addColorStop(1, 'rgba(255,0,60,0.85)');
    c.fillStyle = g; c.fillRect(0, 0, 640, 360);
  });
}

// ---------------------------------------------------------------- canvases for the 3D view

const canvases = new Map<string, HTMLCanvasElement>();
function cv(key: string, w: number, h: number, draw: (c: CanvasRenderingContext2D) => void): HTMLCanvasElement {
  let el = canvases.get(key);
  if (el) return el;
  el = document.createElement('canvas');
  el.width = w;
  el.height = h;
  draw(el.getContext('2d')!);
  canvases.set(key, el);
  return el;
}

/** A soft round glow (white; tinted by the sprite's colour). */
export const glowCanvas = (): HTMLCanvasElement => cv('glow', 64, 64, (c) => {
  const g = c.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.2, 'rgba(255,255,255,0.75)'); g.addColorStop(0.5, 'rgba(255,255,255,0.22)'); g.addColorStop(1, 'rgba(255,255,255,0)');
  c.fillStyle = g; c.fillRect(0, 0, 64, 64);
});
/** A slash arc (white core, soft edge). */
export const slashCanvas = (): HTMLCanvasElement => cv('slash', 256, 256, (c) => {
  c.translate(128, 128);
  for (const [w, a] of [[34, 0.18], [20, 0.45], [9, 1]] as [number, number][]) {
    c.strokeStyle = `rgba(255,255,255,${a})`;
    c.lineWidth = w;
    c.lineCap = 'round';
    c.beginPath();
    c.arc(0, 0, 96, -1.9, 1.1);
    c.stroke();
  }
});
/** A ring (shockwaves, marks, checkpoints). */
export const ringCanvas = (): HTMLCanvasElement => cv('ring', 128, 128, (c) => {
  c.translate(64, 64);
  for (const [w, a] of [[16, 0.2], [8, 0.5], [3, 1]] as [number, number][]) { c.strokeStyle = `rgba(255,255,255,${a})`; c.lineWidth = w; c.beginPath(); c.arc(0, 0, 50, 0, 7); c.stroke(); }
});
/** A blob shadow. */
export const shadowCanvas = (): HTMLCanvasElement => cv('shadow', 64, 64, (c) => {
  const g = c.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, 'rgba(0,0,0,0.7)'); g.addColorStop(0.6, 'rgba(0,0,0,0.35)'); g.addColorStop(1, 'rgba(0,0,0,0)');
  c.fillStyle = g; c.fillRect(0, 0, 64, 64);
});
/** A puff of steam / smoke. */
export const puffCanvas = (): HTMLCanvasElement => cv('puff', 64, 64, (c) => {
  for (let i = 0; i < 9; i++) {
    const x = 20 + Math.random() * 24, y = 20 + Math.random() * 24, r = 10 + Math.random() * 12;
    const g = c.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, 'rgba(255,255,255,0.35)'); g.addColorStop(1, 'rgba(255,255,255,0)');
    c.fillStyle = g; c.fillRect(0, 0, 64, 64);
  }
});
/** The far towers' windows: a grid of lit and dark panes (neon colours). */
export const windowsCanvas = (): HTMLCanvasElement => cv('windows', 256, 512, (c) => {
  c.fillStyle = '#05040c'; c.fillRect(0, 0, 256, 512);
  let s = 7;
  const r = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
  const cols = ['#3ff0ff', '#ff3fa8', '#ffe040', '#a98bff', '#ffffff'];
  for (let y = 6; y < 506; y += 12) {
    const band = r() < 0.12;
    for (let x = 6; x < 250; x += 10) {
      const on = band ? r() < 0.8 : r() < 0.22;
      if (!on) continue;
      const col = cols[Math.floor(r() * cols.length)];
      c.globalAlpha = 0.35 + r() * 0.55;
      c.fillStyle = col;
      c.fillRect(x, y, 6, 7);
    }
  }
  c.globalAlpha = 1;
});
/** The night sky: a violet haze over black with a smog band. */
export const skyCanvas = (): HTMLCanvasElement => cv('sky', 16, 512, (c) => {
  const g = c.createLinearGradient(0, 0, 0, 512);
  g.addColorStop(0, '#03020a'); g.addColorStop(0.35, '#120830'); g.addColorStop(0.55, '#3a1050'); g.addColorStop(0.66, '#6a1a5a'); g.addColorStop(0.74, '#3a1448'); g.addColorStop(0.88, '#140a2a'); g.addColorStop(1, '#06040e');
  c.fillStyle = g; c.fillRect(0, 0, 16, 512);
});
