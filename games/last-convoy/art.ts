// Last Convoy: the 2D art painted in code once (under the Ayvago intro): flat survival icons for the
// HUD, the buttons, the cards and the screens (`lc-i-<name>`), the round action-button faces (a bolted
// steel disc with a coloured rim and hazard ticks), the edge arrows and the stars. The weapons,
// survivors, zombies, dogs and vehicles use the icon sheet rendered from the kit's models (icons.ts).
import Phaser from 'phaser';
import { bake } from '@core';

export const ICON_PX = 64;
const INK = '#14100c';

type Painter = (c: CanvasRenderingContext2D, s: number) => void;

const line = (c: CanvasRenderingContext2D, w: number, col = INK) => { c.lineWidth = w; c.strokeStyle = col; c.lineJoin = 'round'; c.lineCap = 'round'; };
const fillStroke = (c: CanvasRenderingContext2D, fill: string, w: number) => { c.fillStyle = fill; c.fill(); line(c, w); c.stroke(); };

function star(c: CanvasRenderingContext2D, x: number, y: number, r: number, n = 5, inner = 0.45): void {
  c.beginPath();
  for (let i = 0; i < n * 2; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / n, rr = i % 2 ? r * inner : r;
    c.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
  }
  c.closePath();
}

function gear(c: CanvasRenderingContext2D, x: number, y: number, r: number, teeth = 8): void {
  c.beginPath();
  for (let i = 0; i < teeth * 2; i++) {
    const a0 = (i * Math.PI) / teeth, a1 = ((i + 1) * Math.PI) / teeth;
    const rr = i % 2 ? r * 0.78 : r;
    c.arc(x, y, rr, a0, a1);
  }
  c.closePath();
}

function bolt(c: CanvasRenderingContext2D, s: number): void {
  const u = s / 64;
  c.beginPath();
  c.moveTo(36 * u, 6 * u); c.lineTo(14 * u, 36 * u); c.lineTo(30 * u, 36 * u); c.lineTo(24 * u, 58 * u); c.lineTo(50 * u, 26 * u); c.lineTo(33 * u, 26 * u); c.closePath();
}

function paw(c: CanvasRenderingContext2D, s: number, col: string): void {
  const u = s / 64;
  c.beginPath(); c.ellipse(32 * u, 40 * u, 13 * u, 11 * u, 0, 0, Math.PI * 2); fillStroke(c, col, 3 * u);
  for (const [x, y] of [[16, 26], [26, 17], [38, 17], [48, 26]]) { c.beginPath(); c.ellipse(x * u, y * u, 5.5 * u, 7 * u, 0, 0, Math.PI * 2); fillStroke(c, col, 3 * u); }
}

const P: Record<string, Painter> = {
  heart: (c, s) => { const u = s / 64; c.beginPath(); c.moveTo(32 * u, 54 * u); c.bezierCurveTo(4 * u, 34 * u, 6 * u, 10 * u, 22 * u, 10 * u); c.bezierCurveTo(28 * u, 10 * u, 32 * u, 16 * u, 32 * u, 20 * u); c.bezierCurveTo(32 * u, 16 * u, 36 * u, 10 * u, 42 * u, 10 * u); c.bezierCurveTo(58 * u, 10 * u, 60 * u, 34 * u, 32 * u, 54 * u); fillStroke(c, '#e8453a', 4 * u); c.fillStyle = 'rgba(255,255,255,0.4)'; c.beginPath(); c.ellipse(21 * u, 20 * u, 6 * u, 4 * u, -0.6, 0, Math.PI * 2); c.fill(); },
  ammo: (c, s) => { const u = s / 64; for (const x of [14, 28, 42]) { c.beginPath(); c.roundRect(x * u, 26 * u, 10 * u, 28 * u, 2 * u); fillStroke(c, '#d8a83a', 3 * u); c.beginPath(); c.moveTo(x * u, 26 * u); c.quadraticCurveTo((x + 5) * u, 6 * u, (x + 10) * u, 26 * u); fillStroke(c, '#c87a3a', 3 * u); } },
  scrap: (c, s) => { const u = s / 64; gear(c, 32 * u, 32 * u, 24 * u, 8); fillStroke(c, '#a8acb4', 3.5 * u); c.beginPath(); c.arc(32 * u, 32 * u, 8 * u, 0, Math.PI * 2); fillStroke(c, '#5a5e66', 3 * u); },
  supplies: (c, s) => { const u = s / 64; c.beginPath(); c.roundRect(8 * u, 14 * u, 48 * u, 38 * u, 4 * u); fillStroke(c, '#5a7a3a', 4 * u); c.fillStyle = '#f0f0e8'; c.fillRect(27 * u, 20 * u, 10 * u, 26 * u); c.fillRect(19 * u, 28 * u, 26 * u, 10 * u); line(c, 2 * u); c.strokeRect(27 * u, 20 * u, 10 * u, 26 * u); },
  horde: (c, s) => { const u = s / 64; c.beginPath(); c.moveTo(18 * u, 60 * u); c.lineTo(20 * u, 34 * u); c.lineTo(12 * u, 14 * u); c.lineTo(18 * u, 12 * u); c.lineTo(24 * u, 26 * u); c.lineTo(24 * u, 6 * u); c.lineTo(31 * u, 6 * u); c.lineTo(32 * u, 24 * u); c.lineTo(36 * u, 4 * u); c.lineTo(43 * u, 6 * u); c.lineTo(40 * u, 26 * u); c.lineTo(48 * u, 12 * u); c.lineTo(54 * u, 16 * u); c.lineTo(44 * u, 38 * u); c.lineTo(44 * u, 60 * u); c.closePath(); fillStroke(c, '#7ab84a', 3.5 * u); },
  moon: (c, s) => { const u = s / 64; c.beginPath(); c.arc(32 * u, 32 * u, 24 * u, 0, Math.PI * 2); c.arc(42 * u, 24 * u, 20 * u, 0, Math.PI * 2, true); fillStroke(c, '#d8e0ff', 3 * u); },
  sun: (c, s) => { const u = s / 64; star(c, 32 * u, 32 * u, 28 * u, 10, 0.72); fillStroke(c, '#ffb03a', 3 * u); c.beginPath(); c.arc(32 * u, 32 * u, 13 * u, 0, Math.PI * 2); fillStroke(c, '#ffe07a', 3 * u); },
  star: (c, s) => { const u = s / 64; star(c, 32 * u, 34 * u, 28 * u); fillStroke(c, '#ffd23f', 4 * u); },
  'star-off': (c, s) => { const u = s / 64; star(c, 32 * u, 34 * u, 28 * u); fillStroke(c, '#3a342c', 4 * u); },
  clock: (c, s) => { const u = s / 64; c.beginPath(); c.arc(32 * u, 32 * u, 25 * u, 0, Math.PI * 2); fillStroke(c, '#f0e8d8', 4 * u); line(c, 4 * u); c.beginPath(); c.moveTo(32 * u, 32 * u); c.lineTo(32 * u, 16 * u); c.moveTo(32 * u, 32 * u); c.lineTo(44 * u, 38 * u); c.stroke(); },
  fuel: (c, s) => { const u = s / 64; c.beginPath(); c.moveTo(14 * u, 18 * u); c.lineTo(42 * u, 18 * u); c.lineTo(50 * u, 26 * u); c.lineTo(50 * u, 58 * u); c.lineTo(14 * u, 58 * u); c.closePath(); fillStroke(c, '#d83a2a', 4 * u); c.beginPath(); c.roundRect(18 * u, 8 * u, 16 * u, 10 * u, 3 * u); fillStroke(c, '#3a3a3a', 3 * u); line(c, 3 * u, 'rgba(255,255,255,0.6)'); c.beginPath(); c.moveTo(20 * u, 30 * u); c.lineTo(42 * u, 50 * u); c.moveTo(42 * u, 30 * u); c.lineTo(20 * u, 50 * u); c.stroke(); },
  part: (c, s) => { const u = s / 64; gear(c, 26 * u, 34 * u, 18 * u, 7); fillStroke(c, '#9aa0a8', 3 * u); c.beginPath(); c.arc(26 * u, 34 * u, 6 * u, 0, Math.PI * 2); fillStroke(c, '#4a4e56', 2.5 * u); c.beginPath(); c.roundRect(36 * u, 10 * u, 9 * u, 34 * u, 3 * u); c.save(); c.translate(0, 0); fillStroke(c, '#d8a83a', 3 * u); c.restore(); },
  key: (c, s) => { const u = s / 64; c.beginPath(); c.arc(22 * u, 24 * u, 13 * u, 0, Math.PI * 2); c.arc(22 * u, 24 * u, 5 * u, 0, Math.PI * 2, true); fillStroke(c, '#ffd23f', 3.5 * u); c.beginPath(); c.moveTo(30 * u, 32 * u); c.lineTo(52 * u, 54 * u); c.lineTo(46 * u, 58 * u); c.lineTo(42 * u, 54 * u); c.lineTo(38 * u, 56 * u); c.lineTo(26 * u, 36 * u); c.closePath(); fillStroke(c, '#ffd23f', 3.5 * u); },
  battery: (c, s) => { const u = s / 64; c.beginPath(); c.roundRect(10 * u, 18 * u, 44 * u, 36 * u, 4 * u); fillStroke(c, '#2a2a30', 4 * u); c.fillStyle = '#5ad86a'; c.fillRect(14 * u, 34 * u, 36 * u, 16 * u); c.fillStyle = '#d83a2a'; c.fillRect(16 * u, 10 * u, 10 * u, 8 * u); c.fillStyle = '#e8e8e8'; c.fillRect(38 * u, 10 * u, 10 * u, 8 * u); },
  survivor: (c, s) => { const u = s / 64; c.beginPath(); c.arc(32 * u, 20 * u, 11 * u, 0, Math.PI * 2); fillStroke(c, '#f0c89a', 3.5 * u); c.beginPath(); c.moveTo(12 * u, 58 * u); c.quadraticCurveTo(14 * u, 34 * u, 32 * u, 34 * u); c.quadraticCurveTo(50 * u, 34 * u, 52 * u, 58 * u); c.closePath(); fillStroke(c, '#5ab4ff', 3.5 * u); },
  skull: (c, s) => { const u = s / 64; c.beginPath(); c.moveTo(14 * u, 30 * u); c.quadraticCurveTo(14 * u, 6 * u, 32 * u, 6 * u); c.quadraticCurveTo(50 * u, 6 * u, 50 * u, 30 * u); c.lineTo(46 * u, 42 * u); c.lineTo(44 * u, 54 * u); c.lineTo(20 * u, 54 * u); c.lineTo(18 * u, 42 * u); c.closePath(); fillStroke(c, '#9ad86a', 3.5 * u); c.fillStyle = INK; c.beginPath(); c.ellipse(24 * u, 30 * u, 6 * u, 7 * u, 0, 0, Math.PI * 2); c.ellipse(40 * u, 30 * u, 6 * u, 7 * u, 0, 0, Math.PI * 2); c.fill(); },
  paw: (c, s) => paw(c, s, '#e8d8b8'),
  truck: (c, s) => { const u = s / 64; c.beginPath(); c.moveTo(6 * u, 46 * u); c.lineTo(6 * u, 18 * u); c.lineTo(36 * u, 18 * u); c.lineTo(36 * u, 26 * u); c.lineTo(48 * u, 26 * u); c.lineTo(58 * u, 36 * u); c.lineTo(58 * u, 46 * u); c.closePath(); fillStroke(c, '#d8c83a', 3.5 * u); c.fillStyle = '#8ad0ff'; c.fillRect(40 * u, 29 * u, 8 * u, 7 * u); for (const x of [18, 48]) { c.beginPath(); c.arc(x * u, 48 * u, 7 * u, 0, Math.PI * 2); fillStroke(c, '#3a3a3a', 3 * u); } },
  chest: (c, s) => { const u = s / 64; c.beginPath(); c.roundRect(8 * u, 22 * u, 48 * u, 32 * u, 4 * u); fillStroke(c, '#6a9a3a', 4 * u); c.beginPath(); c.roundRect(8 * u, 12 * u, 48 * u, 14 * u, 4 * u); fillStroke(c, '#7aaa4a', 4 * u); c.fillStyle = '#e8d8a8'; c.fillRect(28 * u, 22 * u, 8 * u, 10 * u); },
  nitro: (c, s) => { bolt(c, s); fillStroke(c, '#5ac8ff', 3.5 * s / 64); },
  lock: (c, s) => { const u = s / 64; c.beginPath(); c.roundRect(14 * u, 28 * u, 36 * u, 28 * u, 5 * u); fillStroke(c, '#c8b8a0', 4 * u); line(c, 6 * u, INK); c.beginPath(); c.arc(32 * u, 28 * u, 11 * u, Math.PI, 0); c.stroke(); line(c, 3 * u, '#c8b8a0'); c.stroke(); },
  card: (c, s) => { const u = s / 64; c.save(); c.translate(32 * u, 32 * u); c.rotate(-0.2); c.beginPath(); c.roundRect(-16 * u, -22 * u, 32 * u, 44 * u, 5 * u); fillStroke(c, '#f2b21a', 3.5 * u); star(c, 0, 0, 9 * u); fillStroke(c, '#fff4c8', 2 * u); c.restore(); },
  // the action buttons
  crosshair: (c, s) => { const u = s / 64; line(c, 7 * u); c.beginPath(); c.arc(32 * u, 32 * u, 18 * u, 0, Math.PI * 2); c.moveTo(32 * u, 4 * u); c.lineTo(32 * u, 20 * u); c.moveTo(32 * u, 44 * u); c.lineTo(32 * u, 60 * u); c.moveTo(4 * u, 32 * u); c.lineTo(20 * u, 32 * u); c.moveTo(44 * u, 32 * u); c.lineTo(60 * u, 32 * u); c.stroke(); line(c, 4 * u, '#ffffff'); c.stroke(); c.fillStyle = '#ff5a3a'; c.beginPath(); c.arc(32 * u, 32 * u, 4 * u, 0, Math.PI * 2); c.fill(); },
  blade: (c, s) => { const u = s / 64; c.beginPath(); c.moveTo(52 * u, 6 * u); c.lineTo(58 * u, 12 * u); c.lineTo(24 * u, 46 * u); c.lineTo(18 * u, 40 * u); c.closePath(); fillStroke(c, '#e8ecf0', 3.5 * u); c.beginPath(); c.moveTo(12 * u, 38 * u); c.lineTo(26 * u, 52 * u); line(c, 7 * u); c.stroke(); line(c, 4 * u, '#c8a03a'); c.stroke(); c.beginPath(); c.moveTo(20 * u, 48 * u); c.lineTo(8 * u, 60 * u); line(c, 8 * u); c.stroke(); line(c, 5 * u, '#6a4a2a'); c.stroke(); },
  dodge: (c, s) => { const u = s / 64; line(c, 9 * u); c.beginPath(); c.arc(30 * u, 34 * u, 20 * u, Math.PI * 0.9, Math.PI * 2.15); c.stroke(); line(c, 5 * u, '#7ae8ff'); c.stroke(); c.beginPath(); c.moveTo(56 * u, 26 * u); c.lineTo(46 * u, 44 * u); c.lineTo(38 * u, 28 * u); c.closePath(); fillStroke(c, '#7ae8ff', 3 * u); },
  swap: (c, s) => { const u = s / 64; for (const [y, d] of [[22, 1], [42, -1]]) { line(c, 8 * u); c.beginPath(); c.moveTo((32 - 20 * d) * u, y * u); c.lineTo((32 + 16 * d) * u, y * u); c.stroke(); line(c, 4.5 * u, '#ffffff'); c.stroke(); c.beginPath(); c.moveTo((32 + 22 * d) * u, y * u); c.lineTo((32 + 10 * d) * u, (y - 8) * u); c.lineTo((32 + 10 * d) * u, (y + 8) * u); c.closePath(); fillStroke(c, '#ffffff', 3 * u); } },
  reload: (c, s) => { const u = s / 64; line(c, 9 * u); c.beginPath(); c.arc(32 * u, 32 * u, 18 * u, -0.3, Math.PI * 1.55); c.stroke(); line(c, 5 * u, '#ffe07a'); c.stroke(); c.beginPath(); c.moveTo(52 * u, 18 * u); c.lineTo(52 * u, 34 * u); c.lineTo(38 * u, 24 * u); c.closePath(); fillStroke(c, '#ffe07a', 3 * u); },
  hand: (c, s) => { const u = s / 64; c.beginPath(); c.moveTo(18 * u, 58 * u); c.lineTo(14 * u, 34 * u); c.lineTo(20 * u, 32 * u); c.lineTo(24 * u, 40 * u); c.lineTo(24 * u, 12 * u); c.quadraticCurveTo(28 * u, 8 * u, 31 * u, 12 * u); c.lineTo(31 * u, 30 * u); c.lineTo(32 * u, 8 * u); c.quadraticCurveTo(36 * u, 4 * u, 39 * u, 8 * u); c.lineTo(39 * u, 30 * u); c.lineTo(40 * u, 12 * u); c.quadraticCurveTo(44 * u, 8 * u, 47 * u, 12 * u); c.lineTo(47 * u, 34 * u); c.lineTo(49 * u, 22 * u); c.quadraticCurveTo(53 * u, 20 * u, 55 * u, 24 * u); c.lineTo(52 * u, 46 * u); c.lineTo(44 * u, 58 * u); c.closePath(); fillStroke(c, '#f0d0a8', 3.5 * u); },
  // abilities
  'a-barricade': (c, s) => { const u = s / 64; for (const y of [14, 32]) { c.beginPath(); c.rect(6 * u, y * u, 52 * u, 13 * u); fillStroke(c, '#f2f2f2', 3 * u); c.save(); c.beginPath(); c.rect(6 * u, y * u, 52 * u, 13 * u); c.clip(); c.fillStyle = '#e8453a'; for (let x = -10; x < 64; x += 14) { c.beginPath(); c.moveTo(x * u, (y + 13) * u); c.lineTo((x + 7) * u, (y + 13) * u); c.lineTo((x + 20) * u, y * u); c.lineTo((x + 13) * u, y * u); c.fill(); } c.restore(); line(c, 3 * u); c.strokeRect(6 * u, y * u, 52 * u, 13 * u); } line(c, 6 * u); c.beginPath(); c.moveTo(14 * u, 45 * u); c.lineTo(10 * u, 60 * u); c.moveTo(50 * u, 45 * u); c.lineTo(54 * u, 60 * u); c.stroke(); },
  'a-flare': (c, s) => { const u = s / 64; const g = c.createRadialGradient(40 * u, 20 * u, 2, 40 * u, 20 * u, 22 * u); g.addColorStop(0, 'rgba(255,240,180,1)'); g.addColorStop(0.4, 'rgba(255,90,58,0.9)'); g.addColorStop(1, 'rgba(255,90,58,0)'); c.fillStyle = g; c.fillRect(0, 0, s, s); c.save(); c.translate(28 * u, 40 * u); c.rotate(0.7); c.beginPath(); c.roundRect(-6 * u, -20 * u, 12 * u, 36 * u, 3 * u); fillStroke(c, '#d83a2a', 3.5 * u); c.restore(); },
  'a-heal': (c, s) => { const u = s / 64; c.beginPath(); c.moveTo(24 * u, 8 * u); c.lineTo(40 * u, 8 * u); c.lineTo(40 * u, 24 * u); c.lineTo(56 * u, 24 * u); c.lineTo(56 * u, 40 * u); c.lineTo(40 * u, 40 * u); c.lineTo(40 * u, 56 * u); c.lineTo(24 * u, 56 * u); c.lineTo(24 * u, 40 * u); c.lineTo(8 * u, 40 * u); c.lineTo(8 * u, 24 * u); c.lineTo(24 * u, 24 * u); c.closePath(); fillStroke(c, '#5ad88a', 4 * u); },
  'a-warcry': (c, s) => { const u = s / 64; for (const r of [12, 20, 28]) { line(c, 7 * u); c.beginPath(); c.arc(20 * u, 32 * u, r * u, -0.8, 0.8); c.stroke(); line(c, 4 * u, '#ff6a8a'); c.stroke(); } c.beginPath(); c.moveTo(10 * u, 22 * u); c.lineTo(18 * u, 22 * u); c.lineTo(26 * u, 14 * u); c.lineTo(26 * u, 50 * u); c.lineTo(18 * u, 42 * u); c.lineTo(10 * u, 42 * u); c.closePath(); fillStroke(c, '#f0e8d8', 3 * u); },
  // the cards' pictures
  'i-melee': (c, s) => P.blade(c, s),
  'i-reload': (c, s) => P.reload(c, s),
  'i-pouch': (c, s) => { const u = s / 64; c.beginPath(); c.roundRect(10 * u, 20 * u, 44 * u, 36 * u, 8 * u); fillStroke(c, '#8a6a3a', 4 * u); c.beginPath(); c.roundRect(10 * u, 14 * u, 44 * u, 16 * u, 6 * u); fillStroke(c, '#a87a4a', 4 * u); P.ammo(c, s * 0.5); },
  'i-vest': (c, s) => { const u = s / 64; c.beginPath(); c.moveTo(18 * u, 8 * u); c.lineTo(26 * u, 8 * u); c.lineTo(32 * u, 18 * u); c.lineTo(38 * u, 8 * u); c.lineTo(46 * u, 8 * u); c.lineTo(54 * u, 22 * u); c.lineTo(52 * u, 58 * u); c.lineTo(12 * u, 58 * u); c.lineTo(10 * u, 22 * u); c.closePath(); fillStroke(c, '#4a5a6a', 4 * u); c.fillStyle = '#6a7a8a'; c.fillRect(18 * u, 30 * u, 28 * u, 8 * u); },
  'i-boot': (c, s) => { const u = s / 64; c.beginPath(); c.moveTo(20 * u, 6 * u); c.lineTo(36 * u, 6 * u); c.lineTo(36 * u, 36 * u); c.lineTo(56 * u, 44 * u); c.lineTo(56 * u, 56 * u); c.lineTo(12 * u, 56 * u); c.lineTo(14 * u, 30 * u); c.closePath(); fillStroke(c, '#d86a3a', 4 * u); line(c, 3 * u, '#ffffff'); c.beginPath(); c.moveTo(14 * u, 50 * u); c.lineTo(56 * u, 50 * u); c.stroke(); },
  'i-quiet': (c, s) => { const u = s / 64; c.beginPath(); c.moveTo(8 * u, 24 * u); c.lineTo(18 * u, 24 * u); c.lineTo(30 * u, 12 * u); c.lineTo(30 * u, 52 * u); c.lineTo(18 * u, 40 * u); c.lineTo(8 * u, 40 * u); c.closePath(); fillStroke(c, '#d8d8e0', 3.5 * u); line(c, 6 * u, '#e8453a'); c.beginPath(); c.moveTo(38 * u, 22 * u); c.lineTo(56 * u, 42 * u); c.moveTo(56 * u, 22 * u); c.lineTo(38 * u, 42 * u); c.stroke(); },
  'i-dog': (c, s) => P.paw(c, s),
  'i-fury': (c, s) => { const u = s / 64; c.beginPath(); c.moveTo(32 * u, 4 * u); c.quadraticCurveTo(50 * u, 24 * u, 46 * u, 42 * u); c.quadraticCurveTo(42 * u, 60 * u, 32 * u, 60 * u); c.quadraticCurveTo(18 * u, 60 * u, 16 * u, 44 * u); c.quadraticCurveTo(14 * u, 30 * u, 24 * u, 20 * u); c.quadraticCurveTo(24 * u, 32 * u, 30 * u, 34 * u); c.quadraticCurveTo(26 * u, 18 * u, 32 * u, 4 * u); fillStroke(c, '#ff5a2a', 3.5 * u); },
  'i-charge': (c, s) => { const u = s / 64; c.beginPath(); c.arc(32 * u, 32 * u, 26 * u, 0, Math.PI * 2); fillStroke(c, '#3a2a10', 3 * u); bolt(c, s); fillStroke(c, '#ffb03a', 3 * u); },
  'i-roll': (c, s) => P.dodge(c, s),
  'i-heart': (c, s) => P.heart(c, s),
  'i-clock': (c, s) => P.clock(c, s),
  'i-truck': (c, s) => P.truck(c, s),
  'i-chest': (c, s) => P.chest(c, s),
  'i-scrap': (c, s) => P.scrap(c, s),
  'i-nitro': (c, s) => P.nitro(c, s),
  'i-ammo': (c, s) => P.ammo(c, s),
  'i-fire': (c, s) => P['i-fury'](c, s),
  'i-boom': (c, s) => { const u = s / 64; star(c, 32 * u, 32 * u, 28 * u, 9, 0.5); fillStroke(c, '#ffb03a', 3.5 * u); star(c, 32 * u, 32 * u, 14 * u, 7, 0.5); fillStroke(c, '#fff0a0', 2 * u); },
  'i-revive': (c, s) => { P.heart(c, s); const u = s / 64; c.fillStyle = '#ffffff'; c.fillRect(28 * u, 18 * u, 8 * u, 24 * u); c.fillRect(20 * u, 26 * u, 24 * u, 8 * u); },
  'i-star': (c, s) => P.star(c, s),
};

export const ICON_NAMES = Object.keys(P);
export const iconKey = (name: string): string => 'lc-i-' + name;

/** The action buttons' faces: a bolted steel disc with a coloured rim and hazard ticks; 'off' greyed. */
export const BTN_COLORS: Record<string, number> = { attack: 0xe8453a, dodge: 0x3ac8e8, ability: 0xf2b21a, swap: 0x9aa0a8, dog: 0xc89a5a, use: 0x5ad86a, off: 0x5a5a5a };
export const btnKey = (kind: string): string => 'lc-btn-' + kind;

const hex = (n: number) => '#' + n.toString(16).padStart(6, '0');

function buttonFace(c: CanvasRenderingContext2D, s: number, col: number): void {
  const r = s / 2 - 6, cx = s / 2, cy = s / 2;
  c.save();
  c.shadowColor = 'rgba(0,0,0,0.55)'; c.shadowBlur = 10; c.shadowOffsetY = 4;
  c.fillStyle = '#101010'; c.beginPath(); c.arc(cx, cy, r, 0, Math.PI * 2); c.fill();
  c.restore();
  // the rim in the button's colour with hazard ticks
  const rim = c.createLinearGradient(0, cy - r, 0, cy + r);
  rim.addColorStop(0, hex(col)); rim.addColorStop(1, '#2a2420');
  c.fillStyle = rim; c.beginPath(); c.arc(cx, cy, r, 0, Math.PI * 2); c.fill();
  c.save(); c.beginPath(); c.arc(cx, cy, r, 0, Math.PI * 2); c.arc(cx, cy, r * 0.84, 0, Math.PI * 2, true); c.clip();
  c.fillStyle = 'rgba(20,16,12,0.55)';
  for (let a = 0; a < Math.PI * 2; a += Math.PI / 8) { c.beginPath(); c.moveTo(cx, cy); c.arc(cx, cy, r, a, a + Math.PI / 16); c.closePath(); c.fill(); }
  c.restore();
  // the steel plate
  const g = c.createRadialGradient(cx - r * 0.3, cy - r * 0.4, r * 0.1, cx, cy, r * 0.84);
  g.addColorStop(0, 'rgba(120,124,130,0.92)'); g.addColorStop(0.7, 'rgba(56,58,62,0.9)'); g.addColorStop(1, 'rgba(26,26,30,0.92)');
  c.fillStyle = g; c.beginPath(); c.arc(cx, cy, r * 0.82, 0, Math.PI * 2); c.fill();
  // scratches
  c.strokeStyle = 'rgba(255,255,255,0.08)'; c.lineWidth = 1;
  for (let i = 0; i < 6; i++) { const a = i * 1.7, l = r * 0.5; c.beginPath(); c.moveTo(cx + Math.cos(a) * l * 0.2, cy + Math.sin(a) * l * 0.3); c.lineTo(cx + Math.cos(a + 0.4) * l, cy + Math.sin(a + 0.4) * l * 0.8); c.stroke(); }
  // four bolts
  for (let i = 0; i < 4; i++) {
    const a = Math.PI / 4 + (i * Math.PI) / 2, x = cx + Math.cos(a) * r * 0.66, y = cy + Math.sin(a) * r * 0.66;
    c.fillStyle = '#9aa0a8'; c.beginPath(); c.arc(x, y, r * 0.06, 0, Math.PI * 2); c.fill();
    c.fillStyle = 'rgba(0,0,0,0.5)'; c.beginPath(); c.arc(x + 1, y + 1, r * 0.03, 0, Math.PI * 2); c.fill();
  }
  c.lineWidth = 3; c.strokeStyle = INK; c.beginPath(); c.arc(cx, cy, r, 0, Math.PI * 2); c.stroke();
  c.lineWidth = 2; c.strokeStyle = 'rgba(255,255,255,0.25)'; c.beginPath(); c.arc(cx, cy, r * 0.82, Math.PI * 1.1, Math.PI * 1.9); c.stroke();
}

/** The edge arrows (objective yellow, survivors cyan, horde red, convoy green). */
export const ARROWS: Record<string, string> = { obj: '#ffd23f', surv: '#7ae8ff', horde: '#ff4a3a', convoy: '#7aff9a' };
export const arrowKey = (k: string): string => 'lc-arrow-' + k;

/** Paints everything (once per page). */
export function makeArt(scene: Phaser.Scene): void {
  for (const n of ICON_NAMES) bake(scene, iconKey(n), ICON_PX, ICON_PX, (c) => P[n](c, ICON_PX));
  for (const [k, col] of Object.entries(BTN_COLORS)) bake(scene, btnKey(k), 192, 192, (c) => buttonFace(c, 192, col));
  for (const [k, col] of Object.entries(ARROWS)) bake(scene, arrowKey(k), 64, 64, (c) => {
    c.beginPath(); c.moveTo(58, 32); c.lineTo(12, 8); c.lineTo(22, 32); c.lineTo(12, 56); c.closePath();
    c.shadowColor = 'rgba(0,0,0,0.5)'; c.shadowBlur = 6; c.fillStyle = col; c.fill(); c.shadowColor = 'transparent';
    c.lineWidth = 4; c.strokeStyle = INK; c.lineJoin = 'round'; c.stroke();
  });
  bake(scene, 'lc-spark', 32, 32, (c) => { const g = c.createRadialGradient(16, 16, 0, 16, 16, 16); g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(1, 'rgba(255,255,255,0)'); c.fillStyle = g; c.fillRect(0, 0, 32, 32); });
  bake(scene, 'lc-vignette', 256, 144, (c) => { const g = c.createRadialGradient(128, 72, 40, 128, 72, 150); g.addColorStop(0, 'rgba(160,0,0,0)'); g.addColorStop(1, 'rgba(160,0,0,0.85)'); c.fillStyle = g; c.fillRect(0, 0, 256, 144); });
}

/** An icon image (painted) at a size. */
export function iconImg(scene: Phaser.Scene, x: number, y: number, name: string, size: number): Phaser.GameObjects.Image {
  return scene.add.image(x, y, iconKey(name)).setDisplaySize(size, size);
}
