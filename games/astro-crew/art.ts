// Astro Crew: the 2D pieces, painted once on canvases under the Ayvago intro (and the icon sheet's
// frames from icons.ts). Icons are named by the sheet's key ('hero-frog', 'planet-6', 'thunder')
// or a painted one ('p-crystal', 'p-heart', 'p-rapid' ...). Also the action buttons' faces, the
// edge arrow that points at an off-screen objective, the stars and a soft spark.
import Phaser from 'phaser';
import { bake } from '@core';
import { ICON_SHEET, ICON_KEYS, iconFrame, type IconKey } from './icons';

const P = 'ac-p-';
export const SPARK = 'ac-spark';
export const ARROW = 'ac-arrow';
/** The edge arrow towards a hunting wave (red) and the castaway (cyan). */
export const ARROW_RED = 'ac-arrow-red';
export const ARROW_CYAN = 'ac-arrow-cyan';
export const STAR_ON = 'ac-star-on';
export const STAR_OFF = 'ac-star-off';
export const BTN_FACE = 'ac-btn-';
export const RING = 'ac-ring';
const INK = '#170c3a';

type Paint = (c: CanvasRenderingContext2D) => void;
const outline = (c: CanvasRenderingContext2D, w = 4) => { c.lineWidth = w; c.strokeStyle = INK; c.lineJoin = 'round'; c.lineCap = 'round'; };
const grad = (c: CanvasRenderingContext2D, y0: number, y1: number, a: string, b: string) => { const g = c.createLinearGradient(0, y0, 0, y1); g.addColorStop(0, a); g.addColorStop(1, b); return g; };
const shine = (c: CanvasRenderingContext2D, x: number, y: number, rx: number, ry: number) => { c.fillStyle = 'rgba(255,255,255,0.5)'; c.beginPath(); c.ellipse(x, y, rx, ry, -0.5, 0, Math.PI * 2); c.fill(); };

function star5(c: CanvasRenderingContext2D, x: number, y: number, R: number, r: number): void {
  c.beginPath();
  for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + (i * Math.PI) / 5, k = i % 2 ? r : R; c.lineTo(x + Math.cos(a) * k, y + Math.sin(a) * k); }
  c.closePath();
}
function bolt(c: CanvasRenderingContext2D, x: number, y: number, s: number): void {
  c.beginPath();
  c.moveTo(x + 6 * s, y - 34 * s); c.lineTo(x - 16 * s, y + 4 * s); c.lineTo(x - 1 * s, y + 4 * s); c.lineTo(x - 8 * s, y + 34 * s); c.lineTo(x + 16 * s, y - 6 * s); c.lineTo(x + 1 * s, y - 6 * s); c.closePath();
}
function bullet(c: CanvasRenderingContext2D, x: number, y: number, s: number, col = '#ffd24a'): void {
  c.fillStyle = grad(c, y - 22 * s, y + 22 * s, '#fff2b0', col); outline(c, 3);
  c.beginPath(); c.moveTo(x - 7 * s, y + 20 * s); c.lineTo(x - 7 * s, y - 8 * s); c.quadraticCurveTo(x, y - 26 * s, x + 7 * s, y - 8 * s); c.lineTo(x + 7 * s, y + 20 * s); c.closePath(); c.fill(); c.stroke();
}

/** A painted icon's drawing in a 96 px box. */
const PAINT: Record<string, Paint> = {
  crystal: (c) => {
    outline(c);
    const pts: [number, number][] = [[48, 8], [76, 34], [64, 86], [32, 86], [20, 34]];
    c.fillStyle = grad(c, 8, 86, '#c8f4ff', '#3a8aff'); c.beginPath(); pts.forEach(([x, y]) => c.lineTo(x, y)); c.closePath(); c.fill(); c.stroke();
    c.strokeStyle = 'rgba(23,12,58,0.5)'; c.lineWidth = 2; c.beginPath(); c.moveTo(20, 34); c.lineTo(76, 34); c.moveTo(48, 8); c.lineTo(40, 34); c.lineTo(48, 86); c.lineTo(56, 34); c.lineTo(48, 8); c.stroke();
    shine(c, 36, 24, 7, 4);
  },
  heart: (c) => {
    c.fillStyle = grad(c, 16, 84, '#ff8a9a', '#d8183a'); outline(c);
    c.beginPath(); c.moveTo(48, 82); c.bezierCurveTo(10, 56, 10, 22, 32, 20); c.bezierCurveTo(42, 19, 48, 28, 48, 32);
    c.bezierCurveTo(48, 28, 54, 19, 64, 20); c.bezierCurveTo(86, 22, 86, 56, 48, 82); c.fill(); c.stroke();
    shine(c, 34, 34, 8, 5);
  },
  xp: (c) => {
    c.fillStyle = grad(c, 10, 86, '#f0c8ff', '#8a3ae8'); outline(c); star5(c, 48, 50, 38, 17); c.fill(); c.stroke(); shine(c, 40, 34, 6, 4);
  },
  card: (c) => {
    outline(c);
    c.fillStyle = '#5a3ab8'; c.beginPath(); c.roundRect(14, 20, 50, 66, 8); c.fill(); c.stroke();
    c.fillStyle = grad(c, 10, 76, '#ffe9a0', '#ffa83a'); c.beginPath(); c.roundRect(32, 10, 50, 66, 8); c.fill(); c.stroke();
    c.fillStyle = '#ff6a2a'; star5(c, 57, 43, 15, 7); c.fill(); c.lineWidth = 2.5; c.stroke();
  },
  wave: (c) => {
    // a blob alien face
    c.fillStyle = grad(c, 14, 84, '#9aff6a', '#3a9a2a'); outline(c);
    c.beginPath(); c.moveTo(18, 80); c.quadraticCurveTo(10, 20, 48, 14); c.quadraticCurveTo(86, 20, 78, 80); c.quadraticCurveTo(48, 72, 18, 80); c.fill(); c.stroke();
    c.fillStyle = '#fff'; for (const x of [36, 60]) { c.beginPath(); c.arc(x, 46, 10, 0, Math.PI * 2); c.fill(); c.stroke(); }
    c.fillStyle = INK; for (const x of [38, 62]) { c.beginPath(); c.arc(x, 48, 4, 0, Math.PI * 2); c.fill(); }
  },
  key: (c) => {
    outline(c);
    c.fillStyle = grad(c, 24, 74, '#e8eaf8', '#8a90b0'); c.beginPath(); c.roundRect(10, 24, 76, 50, 8); c.fill(); c.stroke();
    c.fillStyle = '#ffd24a'; c.fillRect(18, 34, 20, 14); c.strokeRect(18, 34, 20, 14);
    c.fillStyle = INK; for (let i = 0; i < 4; i++) c.fillRect(46 + i * 9, 56, 6, 8);
    c.fillStyle = '#3a8aff'; c.fillRect(46, 34, 32, 6);
  },
  rover: (c) => {
    outline(c);
    c.fillStyle = grad(c, 26, 64, '#f4f2ff', '#a8a4c8'); c.beginPath(); c.roundRect(14, 30, 68, 30, 10); c.fill(); c.stroke();
    c.fillStyle = '#5ae8ff'; c.beginPath(); c.roundRect(52, 36, 22, 12, 4); c.fill(); c.stroke();
    c.fillStyle = INK; for (const x of [26, 48, 70]) { c.beginPath(); c.arc(x, 66, 10, 0, Math.PI * 2); c.fill(); }
    c.fillStyle = '#8a84b0'; for (const x of [26, 48, 70]) { c.beginPath(); c.arc(x, 66, 4, 0, Math.PI * 2); c.fill(); }
    c.strokeStyle = INK; c.lineWidth = 3; c.beginPath(); c.moveTo(24, 30); c.lineTo(20, 12); c.stroke();
    c.fillStyle = '#ff6a2a'; c.beginPath(); c.arc(20, 12, 5, 0, Math.PI * 2); c.fill();
  },
  dome: (c) => {
    outline(c);
    c.fillStyle = grad(c, 20, 76, '#c8f4ff', '#5a8ac8'); c.beginPath(); c.arc(48, 70, 36, Math.PI, 0); c.closePath(); c.fill(); c.stroke();
    c.strokeStyle = 'rgba(23,12,58,0.55)'; c.lineWidth = 2.5;
    c.beginPath(); c.moveTo(48, 34); c.lineTo(48, 70); c.moveTo(22, 46); c.lineTo(74, 46); c.moveTo(30, 40); c.lineTo(66, 70); c.moveTo(66, 40); c.lineTo(30, 70); c.stroke();
    c.fillStyle = '#8a84b0'; outline(c, 3); c.fillRect(8, 70, 80, 10); c.strokeRect(8, 70, 80, 10);
  },
  clock: (c) => {
    outline(c);
    c.fillStyle = '#f4f2ff'; c.beginPath(); c.arc(48, 50, 34, 0, Math.PI * 2); c.fill(); c.stroke();
    c.strokeStyle = '#ff6a2a'; c.lineWidth = 6; c.beginPath(); c.arc(48, 50, 34, -Math.PI / 2, Math.PI * 0.4); c.stroke();
    outline(c); c.beginPath(); c.moveTo(48, 50); c.lineTo(48, 28); c.moveTo(48, 50); c.lineTo(62, 58); c.stroke();
  },
  skull: (c) => {
    // a boss: a horned alien head
    outline(c);
    c.fillStyle = grad(c, 10, 86, '#ff9a6a', '#c82a1a');
    c.beginPath(); c.moveTo(20, 30); c.lineTo(10, 6); c.lineTo(34, 22); c.lineTo(62, 22); c.lineTo(86, 6); c.lineTo(76, 30); c.quadraticCurveTo(86, 72, 48, 86); c.quadraticCurveTo(10, 72, 20, 30); c.fill(); c.stroke();
    c.fillStyle = '#fff2a0'; for (const s of [-1, 1]) { c.beginPath(); c.moveTo(48 + s * 6, 46); c.lineTo(48 + s * 26, 38); c.lineTo(48 + s * 22, 54); c.closePath(); c.fill(); c.stroke(); }
    c.beginPath(); c.moveTo(34, 68); c.lineTo(62, 68); c.stroke();
  },
  lock: (c) => {
    c.lineWidth = 7; c.strokeStyle = '#8a84b0';
    c.beginPath(); c.arc(48, 40, 16, Math.PI, 0); c.stroke();
    c.fillStyle = grad(c, 40, 76, '#c8c4e8', '#6a6490'); outline(c, 3);
    c.beginPath(); c.roundRect(26, 40, 44, 36, 6); c.fill(); c.stroke();
    c.fillStyle = INK; c.beginPath(); c.arc(48, 55, 5, 0, Math.PI * 2); c.fill(); c.fillRect(46, 55, 4, 12);
  },
  check: (c) => {
    c.fillStyle = '#2ec27a'; outline(c, 3); c.beginPath(); c.arc(48, 48, 36, 0, Math.PI * 2); c.fill(); c.stroke();
    c.strokeStyle = '#fff'; c.lineWidth = 9; c.beginPath(); c.moveTo(30, 50); c.lineTo(43, 63); c.lineTo(67, 36); c.stroke();
  },
  // ---- card art
  rapid: (c) => { for (const [x, s] of [[30, 0.8], [52, 0.9], [72, 1]] as [number, number][]) bullet(c, x, 50, s); c.strokeStyle = '#ffffff'; c.lineWidth = 3; for (const y of [24, 40]) { c.beginPath(); c.moveTo(6, y); c.lineTo(18, y); c.stroke(); } },
  power: (c) => { bullet(c, 48, 52, 1.6, '#ff6a2a'); c.fillStyle = '#fff'; star5(c, 48, 60, 9, 4); c.fill(); },
  range: (c) => {
    outline(c); c.fillStyle = grad(c, 36, 60, '#e8eaf8', '#7a7aa0');
    c.beginPath(); c.roundRect(8, 38, 64, 18, 6); c.fill(); c.stroke();
    c.fillStyle = '#5ae8ff'; c.beginPath(); c.roundRect(68, 42, 20, 10, 3); c.fill(); c.stroke();
    c.fillStyle = '#ff6a2a'; c.beginPath(); c.roundRect(14, 56, 16, 20, 4); c.fill(); c.stroke();
  },
  armor: (c) => {
    outline(c); c.fillStyle = grad(c, 10, 86, '#c8f4ff', '#4a7ac8');
    c.beginPath(); c.moveTo(48, 8); c.lineTo(82, 20); c.quadraticCurveTo(80, 66, 48, 88); c.quadraticCurveTo(16, 66, 14, 20); c.closePath(); c.fill(); c.stroke();
    c.fillStyle = '#fff'; c.fillRect(42, 30, 12, 36); c.fillRect(30, 42, 36, 12);
  },
  boots: (c) => {
    outline(c); c.fillStyle = grad(c, 20, 76, '#ffb07a', '#e8482a');
    c.beginPath(); c.moveTo(30, 14); c.lineTo(52, 14); c.lineTo(54, 50); c.lineTo(80, 58); c.lineTo(80, 72); c.lineTo(26, 72); c.closePath(); c.fill(); c.stroke();
    c.fillStyle = '#ffe04a'; c.beginPath(); c.moveTo(32, 74); c.lineTo(42, 92); c.lineTo(52, 74); c.closePath(); c.fill(); c.stroke();
  },
  magnet: (c) => {
    c.lineWidth = 18; c.strokeStyle = INK; c.beginPath(); c.arc(48, 44, 24, Math.PI, 0); c.lineTo(72, 74); c.moveTo(24, 44); c.lineTo(24, 74); c.stroke();
    c.lineWidth = 12; c.strokeStyle = '#e8483a'; c.beginPath(); c.arc(48, 44, 24, Math.PI, 0); c.lineTo(72, 64); c.moveTo(24, 44); c.lineTo(24, 64); c.stroke();
    c.fillStyle = '#e8eaf8'; outline(c, 3); for (const x of [24, 72]) { c.fillRect(x - 9, 64, 18, 14); c.strokeRect(x - 9, 64, 18, 14); }
  },
  roll: (c) => {
    c.lineWidth = 8; c.strokeStyle = '#5ae8ff'; c.lineCap = 'round';
    c.beginPath(); c.arc(48, 50, 28, -0.4, Math.PI * 1.4); c.stroke();
    c.fillStyle = '#5ae8ff'; outline(c, 3); c.beginPath(); c.moveTo(74, 30); c.lineTo(84, 52); c.lineTo(62, 46); c.closePath(); c.fill(); c.stroke();
    c.strokeStyle = '#fff'; c.lineWidth = 3; for (const y of [76, 86]) { c.beginPath(); c.moveTo(10, y); c.lineTo(30, y); c.stroke(); }
  },
  twin: (c) => { bullet(c, 36, 52, 1.2); bullet(c, 62, 52, 1.2); },
  pierce: (c) => {
    c.fillStyle = '#9aff6a'; outline(c, 3); for (const x of [28, 56]) { c.beginPath(); c.arc(x, 50, 12, 0, Math.PI * 2); c.fill(); c.stroke(); }
    c.fillStyle = grad(c, 40, 60, '#fff2b0', '#ffd24a'); c.beginPath(); c.moveTo(6, 44); c.lineTo(76, 44); c.lineTo(92, 50); c.lineTo(76, 56); c.lineTo(6, 56); c.closePath(); c.fill(); c.stroke();
  },
  crit: (c) => {
    c.fillStyle = grad(c, 6, 90, '#fff2a0', '#ff8a2a'); outline(c); star5(c, 48, 50, 40, 16); c.fill(); c.stroke();
    c.fillStyle = INK; c.font = 'bold 30px sans-serif'; c.textAlign = 'center'; c.fillText('!', 48, 62);
  },
  bubble: (c) => {
    const g = c.createRadialGradient(38, 36, 4, 48, 48, 40); g.addColorStop(0, 'rgba(255,255,255,0.9)'); g.addColorStop(0.5, 'rgba(120,220,255,0.55)'); g.addColorStop(1, 'rgba(60,140,255,0.8)');
    c.fillStyle = g; outline(c, 3); c.beginPath(); c.arc(48, 48, 38, 0, Math.PI * 2); c.fill(); c.stroke(); shine(c, 34, 30, 10, 6);
  },
  drone: (c) => {
    outline(c);
    c.fillStyle = grad(c, 30, 66, '#f4f2ff', '#8a84b0'); c.beginPath(); c.ellipse(48, 50, 22, 14, 0, 0, Math.PI * 2); c.fill(); c.stroke();
    c.fillStyle = '#5ae8ff'; c.beginPath(); c.arc(48, 46, 7, 0, Math.PI * 2); c.fill(); c.stroke();
    c.lineWidth = 4; for (const s of [-1, 1]) { c.beginPath(); c.moveTo(48 + s * 20, 44); c.lineTo(48 + s * 34, 28); c.stroke(); c.fillStyle = '#ffd24a'; c.beginPath(); c.ellipse(48 + s * 34, 26, 12, 4, 0, 0, Math.PI * 2); c.fill(); c.stroke(); }
  },
  frost: (c) => {
    c.strokeStyle = '#9ae8ff'; c.lineWidth = 7; c.lineCap = 'round';
    for (let i = 0; i < 3; i++) { const a = (i * Math.PI) / 3; c.beginPath(); c.moveTo(48 + Math.cos(a) * 36, 48 + Math.sin(a) * 36); c.lineTo(48 - Math.cos(a) * 36, 48 - Math.sin(a) * 36); c.stroke(); }
    c.strokeStyle = '#ffffff'; c.lineWidth = 3;
    for (let i = 0; i < 6; i++) { const a = (i * Math.PI) / 3, x = 48 + Math.cos(a) * 24, y = 48 + Math.sin(a) * 24; c.beginPath(); c.moveTo(x, y); c.lineTo(x + Math.cos(a + 0.8) * 9, y + Math.sin(a + 0.8) * 9); c.moveTo(x, y); c.lineTo(x + Math.cos(a - 0.8) * 9, y + Math.sin(a - 0.8) * 9); c.stroke(); }
  },
  bounce: (c) => {
    c.strokeStyle = '#ffd24a'; c.lineWidth = 6; c.setLineDash([8, 6]); c.beginPath(); c.moveTo(8, 76); c.lineTo(46, 20); c.lineTo(86, 70); c.stroke(); c.setLineDash([]);
    c.fillStyle = '#9aff6a'; outline(c, 3); c.beginPath(); c.arc(46, 22, 11, 0, Math.PI * 2); c.fill(); c.stroke();
  },
  flame: (c) => {
    c.fillStyle = grad(c, 8, 88, '#fff2a0', '#e8301a'); outline(c);
    c.beginPath(); c.moveTo(48, 6); c.bezierCurveTo(72, 32, 82, 50, 74, 68); c.bezierCurveTo(66, 88, 30, 88, 22, 68);
    c.bezierCurveTo(16, 52, 28, 42, 34, 34); c.bezierCurveTo(36, 48, 42, 50, 44, 46); c.bezierCurveTo(40, 30, 44, 18, 48, 6); c.fill(); c.stroke();
    c.fillStyle = '#fff6c8'; c.beginPath(); c.ellipse(48, 68, 10, 14, 0, 0, Math.PI * 2); c.fill();
  },
  chain: (c) => { c.fillStyle = grad(c, 6, 90, '#e8faff', '#3ab8ff'); outline(c); bolt(c, 48, 50, 1.2); c.fill(); c.stroke(); },
  blades: (c) => {
    c.strokeStyle = '#9af0ff'; c.lineWidth = 7; c.beginPath(); c.arc(48, 48, 30, 0, Math.PI * 2); c.stroke();
    for (const a of [0.3, 3.4]) { c.fillStyle = '#e8faff'; outline(c, 3); c.beginPath(); c.arc(48 + Math.cos(a) * 30, 48 + Math.sin(a) * 30, 11, 0, Math.PI * 2); c.fill(); c.stroke(); }
    c.fillStyle = '#ffd24a'; c.beginPath(); c.arc(48, 48, 8, 0, Math.PI * 2); c.fill(); c.stroke();
  },
  clockfast: (c) => { PAINT.clock(c); c.fillStyle = '#ffd24a'; outline(c, 3); bolt(c, 70, 66, 0.6); c.fill(); c.stroke(); },
  blast: (c) => {
    c.fillStyle = grad(c, 6, 90, '#fff2a0', '#ff6a2a'); outline(c);
    c.beginPath(); for (let i = 0; i < 16; i++) { const a = (i / 16) * Math.PI * 2, r = i % 2 ? 22 : 40; c.lineTo(48 + Math.cos(a) * r, 48 + Math.sin(a) * r); } c.closePath(); c.fill(); c.stroke();
  },
  nova: (c) => {
    for (const [r, col] of [[40, 'rgba(120,220,255,0.35)'], [30, 'rgba(160,240,255,0.6)']] as [number, string][]) { c.fillStyle = col; c.beginPath(); c.arc(48, 48, r, 0, Math.PI * 2); c.fill(); }
    c.strokeStyle = '#ffffff'; c.lineWidth = 4; c.beginPath(); c.arc(48, 48, 40, 0, Math.PI * 2); c.stroke();
    c.fillStyle = '#ffffff'; c.beginPath(); c.arc(48, 48, 12, 0, Math.PI * 2); c.fill();
  },
  storm: (c) => { for (const [x, y] of [[26, 38], [48, 28], [70, 38], [36, 66], [60, 66]]) bullet(c, x, y, 0.75); },
  angel: (c) => {
    outline(c, 3);
    c.fillStyle = '#ffffff';
    for (const s of [-1, 1]) { c.beginPath(); c.moveTo(48, 50); c.quadraticCurveTo(48 + s * 44, 20, 48 + s * 40, 62); c.quadraticCurveTo(48 + s * 24, 56, 48, 60); c.fill(); c.stroke(); }
    c.strokeStyle = '#ffd24a'; c.lineWidth = 6; c.beginPath(); c.ellipse(48, 22, 18, 6, 0, 0, Math.PI * 2); c.stroke();
    c.fillStyle = '#ffd24a'; outline(c, 3); c.beginPath(); c.arc(48, 56, 10, 0, Math.PI * 2); c.fill(); c.stroke();
  },
  nest: (c) => {
    // an alien nest: a glowing egg in a crown of spines
    outline(c);
    c.fillStyle = grad(c, 20, 90, '#ff8ab0', '#a01a4a');
    for (const [x, a] of [[22, -0.5], [38, -0.2], [58, 0.2], [74, 0.5]] as [number, number][]) {
      c.beginPath(); c.moveTo(x - 7, 86); c.lineTo(x + Math.sin(a) * 26, 26 + Math.abs(a) * 22); c.lineTo(x + 7, 86); c.closePath(); c.fill(); c.stroke();
    }
    c.fillStyle = grad(c, 36, 88, '#e8ffb0', '#6ad83a');
    c.beginPath(); c.ellipse(48, 64, 20, 24, 0, 0, Math.PI * 2); c.fill(); c.stroke();
    shine(c, 41, 52, 6, 4);
  },
  alert: (c) => {
    // a siren with its light flaring
    c.fillStyle = 'rgba(255,90,70,0.35)'; c.beginPath(); c.arc(48, 46, 40, Math.PI, 0); c.fill();
    outline(c);
    c.fillStyle = grad(c, 20, 74, '#ffb0a0', '#e8281a');
    c.beginPath(); c.moveTo(24, 74); c.lineTo(24, 46); c.quadraticCurveTo(24, 20, 48, 20); c.quadraticCurveTo(72, 20, 72, 46); c.lineTo(72, 74); c.closePath(); c.fill(); c.stroke();
    c.fillStyle = '#8a84b0'; c.fillRect(14, 74, 68, 12); c.strokeRect(14, 74, 68, 12);
    shine(c, 38, 36, 6, 9);
    c.strokeStyle = '#fff2a0'; c.lineWidth = 4;
    for (const [x1, y1, x2, y2] of [[8, 30, 16, 36], [88, 30, 80, 36], [48, 4, 48, 12]] as [number, number, number, number][]) { c.beginPath(); c.moveTo(x1, y1); c.lineTo(x2, y2); c.stroke(); }
  },
  // ---- the action buttons' glyphs
  dodge: (c) => {
    c.lineWidth = 9; c.strokeStyle = '#ffffff'; c.lineCap = 'round';
    c.beginPath(); c.arc(48, 48, 24, -0.6, Math.PI * 1.25); c.stroke();
    c.fillStyle = '#ffffff'; c.beginPath(); c.moveTo(70, 26); c.lineTo(78, 52); c.lineTo(56, 42); c.closePath(); c.fill();
  },
};
export const PAINTED = Object.keys(PAINT);

/** Paints the icons, the stars, the arrow, the spark and the ring (once). */
export function makeArt(scene: Phaser.Scene): void {
  for (const [k, draw] of Object.entries(PAINT)) bake(scene, P + k, 96, 96, draw);
  bake(scene, SPARK, 24, 24, (c) => {
    const g = c.createRadialGradient(12, 12, 0, 12, 12, 12);
    g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(1, 'rgba(255,255,255,0)');
    c.fillStyle = g; c.fillRect(0, 0, 24, 24);
  });
  bake(scene, STAR_ON, 64, 64, (c) => { c.fillStyle = grad(c, 4, 60, '#fff6c0', '#ffb82a'); outline(c, 3.5); star5(c, 32, 34, 28, 12); c.fill(); c.stroke(); shine(c, 26, 22, 5, 3); });
  bake(scene, STAR_OFF, 64, 64, (c) => { c.fillStyle = 'rgba(40,30,90,0.85)'; c.lineWidth = 3; c.strokeStyle = 'rgba(160,150,220,0.8)'; star5(c, 32, 34, 28, 12); c.fill(); c.stroke(); });
  for (const [key, col] of [[ARROW, '#ffd84a'], [ARROW_RED, '#ff5a4a'], [ARROW_CYAN, '#8af0ff']] as [string, string][]) {
    bake(scene, key, 64, 64, (c) => {
      c.fillStyle = col; outline(c, 4);
      c.beginPath(); c.moveTo(58, 32); c.lineTo(14, 8); c.lineTo(24, 32); c.lineTo(14, 56); c.closePath(); c.fill(); c.stroke();
    });
  }
  bake(scene, RING, 128, 128, (c) => { c.strokeStyle = '#ffffff'; c.lineWidth = 10; c.beginPath(); c.arc(64, 64, 56, 0, Math.PI * 2); c.stroke(); });
  // the round action buttons: a glass disc in the button's colour
  for (const [k, col] of [['dodge', '#5ae8ff'], ['skill', '#ff8a2a'], ['mech', '#ffd84a'], ['off', '#6a648a']] as [string, string][]) {
    bake(scene, BTN_FACE + k, 176, 176, (c) => {
      c.save(); c.shadowColor = 'rgba(0,0,0,0.5)'; c.shadowBlur = 10; c.shadowOffsetY = 5;
      c.fillStyle = 'rgba(10,6,32,0.55)'; c.beginPath(); c.arc(88, 88, 78, 0, Math.PI * 2); c.fill(); c.restore();
      c.lineWidth = 5; c.strokeStyle = col; c.beginPath(); c.arc(88, 88, 76, 0, Math.PI * 2); c.stroke();
      const g = c.createRadialGradient(70, 60, 6, 88, 88, 70);
      g.addColorStop(0, 'rgba(255,255,255,0.28)'); g.addColorStop(1, 'rgba(255,255,255,0.02)');
      c.fillStyle = g; c.beginPath(); c.arc(88, 88, 70, 0, Math.PI * 2); c.fill();
    });
  }
}

/** An icon (sheet frame or painted) as an image of `size` px. */
export function iconImg(scene: Phaser.Scene, x: number, y: number, key: string, size: number): Phaser.GameObjects.Image {
  const img = scene.add.image(x, y, ICON_SHEET, 0);
  return setIcon(img, key, size);
}

/** Sets an existing image to an icon. */
export function setIcon(img: Phaser.GameObjects.Image, key: string, size: number): Phaser.GameObjects.Image {
  if (key.startsWith('p-')) img.setTexture(P + key.slice(2));
  else img.setTexture(ICON_SHEET, iconFrame(key as IconKey));
  return img.setDisplaySize(size, size);
}

export const isIcon = (k: string): boolean => (ICON_KEYS as readonly string[]).includes(k) || (k.startsWith('p-') && PAINTED.includes(k.slice(2)));
