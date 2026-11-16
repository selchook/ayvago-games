// Hex Realm: the 2D icons, painted once on canvases (Boot, under the Ayvago intro): gold, potions,
// hearts, skulls, the five power-ups, the twelve class skills, the item kinds, the quest marker and
// the map and hero buttons. Each is a 96 px texture shown at any size.
import Phaser from 'phaser';
import { bake } from '@core';
import type { PowerId } from './defs';

export const ICON = 96;
export const icon = (name: string): string => 'hr-ic-' + name;

type Painter = (c: CanvasRenderingContext2D, s: number) => void;
const INK = '#1a1420';

function grad(c: CanvasRenderingContext2D, y0: number, y1: number, stops: string[]): CanvasGradient {
  const g = c.createLinearGradient(0, y0, 0, y1);
  stops.forEach((s, i) => g.addColorStop(i / (stops.length - 1), s));
  return g;
}

function outline(c: CanvasRenderingContext2D, p: Path2D, fill: string | CanvasGradient, lw = 4): void {
  c.lineJoin = 'round';
  c.lineWidth = lw; c.strokeStyle = INK;
  c.fillStyle = fill; c.fill(p); c.stroke(p);
}

const coin: Painter = (c, s) => {
  const p = new Path2D(); p.arc(s / 2, s / 2, s * 0.36, 0, Math.PI * 2);
  outline(c, p, grad(c, s * 0.14, s * 0.86, ['#fff6b8', '#ffd23f', '#c88a10']));
  c.strokeStyle = 'rgba(120,70,0,0.6)'; c.lineWidth = 3; c.beginPath(); c.arc(s / 2, s / 2, s * 0.25, 0, Math.PI * 2); c.stroke();
  c.fillStyle = 'rgba(255,255,255,0.8)'; c.beginPath(); c.ellipse(s * 0.4, s * 0.36, s * 0.07, s * 0.04, -0.6, 0, Math.PI * 2); c.fill();
};

const potion: Painter = (c, s) => {
  const p = new Path2D();
  p.moveTo(s * 0.42, s * 0.16); p.lineTo(s * 0.58, s * 0.16); p.lineTo(s * 0.58, s * 0.36);
  p.bezierCurveTo(s * 0.8, s * 0.44, s * 0.82, s * 0.86, s * 0.5, s * 0.86);
  p.bezierCurveTo(s * 0.18, s * 0.86, s * 0.2, s * 0.44, s * 0.42, s * 0.36); p.closePath();
  outline(c, p, 'rgba(220,240,255,0.5)');
  c.save(); c.clip(p);
  c.fillStyle = grad(c, s * 0.5, s * 0.86, ['#ff6a7a', '#c81a3a']); c.fillRect(0, s * 0.52, s, s);
  c.restore();
  c.lineWidth = 4; c.strokeStyle = INK; c.stroke(p);
  c.fillStyle = '#8a5a2a'; c.fillRect(s * 0.4, s * 0.1, s * 0.2, s * 0.09); c.strokeRect(s * 0.4, s * 0.1, s * 0.2, s * 0.09);
  c.fillStyle = 'rgba(255,255,255,0.75)'; c.beginPath(); c.ellipse(s * 0.38, s * 0.6, s * 0.05, s * 0.12, 0.3, 0, Math.PI * 2); c.fill();
};

const heart: Painter = (c, s) => {
  const p = new Path2D();
  p.moveTo(s / 2, s * 0.82);
  p.bezierCurveTo(s * 0.1, s * 0.56, s * 0.12, s * 0.2, s * 0.34, s * 0.22);
  p.bezierCurveTo(s * 0.44, s * 0.22, s * 0.5, s * 0.32, s / 2, s * 0.34);
  p.bezierCurveTo(s * 0.5, s * 0.32, s * 0.56, s * 0.22, s * 0.66, s * 0.22);
  p.bezierCurveTo(s * 0.88, s * 0.2, s * 0.9, s * 0.56, s / 2, s * 0.82);
  outline(c, p, grad(c, s * 0.2, s * 0.82, ['#ff8a8a', '#e8283a', '#8a0c1a']));
  c.fillStyle = 'rgba(255,255,255,0.7)'; c.beginPath(); c.ellipse(s * 0.33, s * 0.36, s * 0.07, s * 0.04, -0.7, 0, Math.PI * 2); c.fill();
};

const skull: Painter = (c, s) => {
  const p = new Path2D();
  p.moveTo(s * 0.24, s * 0.5); p.bezierCurveTo(s * 0.2, s * 0.18, s * 0.8, s * 0.18, s * 0.76, s * 0.5);
  p.quadraticCurveTo(s * 0.74, s * 0.62, s * 0.66, s * 0.66); p.lineTo(s * 0.64, s * 0.8); p.lineTo(s * 0.36, s * 0.8); p.lineTo(s * 0.34, s * 0.66);
  p.quadraticCurveTo(s * 0.26, s * 0.62, s * 0.24, s * 0.5); p.closePath();
  outline(c, p, grad(c, s * 0.2, s * 0.8, ['#fffdf0', '#e8dcb8', '#b8a478']));
  c.fillStyle = INK;
  for (const x of [0.38, 0.62]) { c.beginPath(); c.ellipse(s * x, s * 0.48, s * 0.08, s * 0.09, 0, 0, Math.PI * 2); c.fill(); }
  c.beginPath(); c.moveTo(s * 0.5, s * 0.56); c.lineTo(s * 0.46, s * 0.64); c.lineTo(s * 0.54, s * 0.64); c.closePath(); c.fill();
};

const marker: Painter = (c, s) => {
  // a gold diamond with an exclamation mark
  const p = new Path2D();
  p.moveTo(s / 2, s * 0.08); p.lineTo(s * 0.86, s * 0.46); p.lineTo(s / 2, s * 0.9); p.lineTo(s * 0.14, s * 0.46); p.closePath();
  outline(c, p, grad(c, s * 0.08, s * 0.9, ['#fff6c0', '#ffc83a', '#c07a10']), 5);
  c.fillStyle = INK;
  c.beginPath(); c.roundRect(s * 0.45, s * 0.24, s * 0.1, s * 0.34, 4); c.fill();
  c.beginPath(); c.arc(s / 2, s * 0.68, s * 0.06, 0, Math.PI * 2); c.fill();
};

const banner: Painter = (c, s) => {
  // a black skull banner on a pole (camps)
  c.lineWidth = 6; c.strokeStyle = INK; c.beginPath(); c.moveTo(s * 0.26, s * 0.92); c.lineTo(s * 0.26, s * 0.08); c.stroke();
  c.lineWidth = 3; c.strokeStyle = '#8a5a2a'; c.beginPath(); c.moveTo(s * 0.26, s * 0.92); c.lineTo(s * 0.26, s * 0.08); c.stroke();
  const p = new Path2D();
  p.moveTo(s * 0.28, s * 0.12); p.lineTo(s * 0.86, s * 0.14); p.lineTo(s * 0.74, s * 0.34); p.lineTo(s * 0.86, s * 0.56); p.lineTo(s * 0.28, s * 0.56); p.closePath();
  outline(c, p, grad(c, s * 0.1, s * 0.56, ['#5a1a24', '#2a0a10']));
  c.save(); c.translate(s * 0.27, s * 0.06); c.scale(0.55, 0.55); skull(c, s); c.restore();
};

// ------------------------------------------------------------------ power-ups

const ring = (c: CanvasRenderingContext2D, s: number, col: string) => {
  const p = new Path2D(); p.arc(s / 2, s / 2, s * 0.42, 0, Math.PI * 2);
  c.fillStyle = INK; c.fill(p);
  c.fillStyle = col; c.beginPath(); c.arc(s / 2, s / 2, s * 0.38, 0, Math.PI * 2); c.fill();
  c.fillStyle = 'rgba(255,255,255,0.18)'; c.beginPath(); c.arc(s / 2, s * 0.42, s * 0.3, Math.PI, 0); c.fill();
};

const POWER_ART: Record<PowerId, Painter> = {
  haste: (c, s) => {
    ring(c, s, '#1a8aa8');
    // a winged boot: three speed lines and a wing
    c.strokeStyle = '#d8faff'; c.lineWidth = 5; c.lineCap = 'round';
    for (const y of [0.4, 0.52, 0.64]) { c.beginPath(); c.moveTo(s * 0.22, s * y); c.lineTo(s * 0.44, s * y); c.stroke(); }
    const w = new Path2D(); w.moveTo(s * 0.46, s * 0.64); w.quadraticCurveTo(s * 0.62, s * 0.24, s * 0.8, s * 0.3); w.quadraticCurveTo(s * 0.72, s * 0.44, s * 0.78, s * 0.5); w.quadraticCurveTo(s * 0.66, s * 0.56, s * 0.7, s * 0.66); w.closePath();
    outline(c, w, '#ffffff', 3);
  },
  rage: (c, s) => {
    ring(c, s, '#a8241a');
    const f = new Path2D(); f.moveTo(s / 2, s * 0.18); f.bezierCurveTo(s * 0.74, s * 0.42, s * 0.76, s * 0.62, s / 2, s * 0.8); f.bezierCurveTo(s * 0.24, s * 0.62, s * 0.3, s * 0.44, s * 0.42, s * 0.34); f.quadraticCurveTo(s * 0.46, s * 0.46, s * 0.52, s * 0.44); f.quadraticCurveTo(s * 0.52, s * 0.3, s / 2, s * 0.18);
    outline(c, f, grad(c, s * 0.18, s * 0.8, ['#fff2a0', '#ffa83a', '#ff3a1a']), 3);
  },
  shield: (c, s) => {
    ring(c, s, '#2a4a9a');
    const p = new Path2D(); p.moveTo(s * 0.3, s * 0.26); p.lineTo(s * 0.7, s * 0.26); p.lineTo(s * 0.7, s * 0.48); p.bezierCurveTo(s * 0.7, s * 0.66, s * 0.56, s * 0.76, s / 2, s * 0.8); p.bezierCurveTo(s * 0.44, s * 0.76, s * 0.3, s * 0.66, s * 0.3, s * 0.48); p.closePath();
    outline(c, p, grad(c, s * 0.26, s * 0.8, ['#d8e8ff', '#8ab8ff', '#3a6ad8']), 3);
  },
  regen: (c, s) => {
    ring(c, s, '#2a8a3a');
    c.fillStyle = INK; c.fillRect(s * 0.4, s * 0.22, s * 0.2, s * 0.56); c.fillRect(s * 0.22, s * 0.4, s * 0.56, s * 0.2);
    c.fillStyle = '#c8ffd0'; c.fillRect(s * 0.43, s * 0.25, s * 0.14, s * 0.5); c.fillRect(s * 0.25, s * 0.43, s * 0.5, s * 0.14);
  },
  gold: (c, s) => {
    ring(c, s, '#8a6a14');
    c.save(); c.translate(s * 0.08, s * 0.1); c.scale(0.6, 0.6); coin(c, s); c.restore();
    c.save(); c.translate(s * 0.32, s * 0.3); c.scale(0.6, 0.6); coin(c, s); c.restore();
  },
};

// ------------------------------------------------------------------ skills

function disc(c: CanvasRenderingContext2D, s: number, col: string): void {
  c.fillStyle = INK; c.beginPath(); c.arc(s / 2, s / 2, s * 0.46, 0, Math.PI * 2); c.fill();
  c.fillStyle = grad(c, 0, s, [col, '#1a1420']); c.beginPath(); c.arc(s / 2, s / 2, s * 0.42, 0, Math.PI * 2); c.fill();
}

const blade = (c: CanvasRenderingContext2D, x: number, y: number, len: number, ang: number, w = 6) => {
  c.save(); c.translate(x, y); c.rotate(ang);
  const p = new Path2D(); p.moveTo(-w / 2, 0); p.lineTo(-w / 2, -len); p.lineTo(0, -len - w); p.lineTo(w / 2, -len); p.lineTo(w / 2, 0); p.closePath();
  outline(c, p, grad(c, -len, 0, ['#ffffff', '#b8c4d0']), 3);
  c.fillStyle = '#e0b24a'; c.fillRect(-w * 1.6, -2, w * 3.2, 5); c.strokeStyle = INK; c.lineWidth = 2; c.strokeRect(-w * 1.6, -2, w * 3.2, 5);
  c.fillStyle = '#5a3418'; c.fillRect(-w * 0.4, 3, w * 0.8, w * 2);
  c.restore();
};

const SKILL_ART: Record<string, Painter> = {
  bash: (c, s) => { disc(c, s, '#c87a2a'); POWER_ART.shield(c, s); c.strokeStyle = '#fff2cc'; c.lineWidth = 4; for (const a of [-0.6, 0, 0.6]) { c.beginPath(); c.moveTo(s / 2 + Math.sin(a) * s * 0.36, s / 2 - Math.cos(a) * s * 0.36); c.lineTo(s / 2 + Math.sin(a) * s * 0.46, s / 2 - Math.cos(a) * s * 0.46); c.stroke(); } },
  whirl: (c, s) => { disc(c, s, '#c83a2a'); c.strokeStyle = '#ffd8c8'; c.lineWidth = 6; c.lineCap = 'round'; for (let i = 0; i < 3; i++) { c.beginPath(); c.arc(s / 2, s / 2, s * (0.16 + i * 0.09), i * 2, i * 2 + 3.6); c.stroke(); } blade(c, s / 2, s / 2, s * 0.3, 0.8); },
  dash: (c, s) => { disc(c, s, '#5a3aa8'); c.strokeStyle = '#d8c8ff'; c.lineWidth = 5; c.lineCap = 'round'; for (const y of [0.36, 0.5, 0.64]) { c.beginPath(); c.moveTo(s * 0.18, s * y); c.lineTo(s * 0.4, s * y); c.stroke(); } blade(c, s * 0.58, s * 0.66, s * 0.32, 1.1, 5); },
  smoke: (c, s) => { disc(c, s, '#4a5068'); for (const [x, y, r] of [[0.4, 0.55, 0.16], [0.58, 0.5, 0.18], [0.5, 0.38, 0.14], [0.32, 0.42, 0.11]]) { c.fillStyle = '#c8ccd8'; c.beginPath(); c.arc(s * x, s * y, s * r, 0, Math.PI * 2); c.fill(); } },
  volley: (c, s) => { disc(c, s, '#3a7a2a'); for (const a of [-0.5, -0.25, 0, 0.25, 0.5]) { c.save(); c.translate(s / 2, s * 0.8); c.rotate(a); c.strokeStyle = '#fff2cc'; c.lineWidth = 3; c.beginPath(); c.moveTo(0, 0); c.lineTo(0, -s * 0.52); c.stroke(); c.fillStyle = '#fff2cc'; c.beginPath(); c.moveTo(-5, -s * 0.48); c.lineTo(0, -s * 0.6); c.lineTo(5, -s * 0.48); c.fill(); c.restore(); } },
  trap: (c, s) => { disc(c, s, '#8a6a2a'); c.strokeStyle = '#d8d0c0'; c.lineWidth = 4; c.beginPath(); c.arc(s / 2, s * 0.56, s * 0.24, Math.PI, 0); c.stroke(); for (let i = 0; i < 7; i++) { const x = s * 0.28 + i * s * 0.074; c.beginPath(); c.moveTo(x, s * 0.56); c.lineTo(x + s * 0.035, s * 0.44); c.lineTo(x + s * 0.07, s * 0.56); c.fillStyle = '#e8e0d0'; c.fill(); } c.fillStyle = '#5a5048'; c.fillRect(s * 0.24, s * 0.56, s * 0.52, s * 0.08); },
  flurry: (c, s) => { disc(c, s, '#c88a1a'); for (const [x, y] of [[0.36, 0.38], [0.6, 0.46], [0.42, 0.64]]) { c.fillStyle = '#ffe8b8'; c.strokeStyle = INK; c.lineWidth = 3; c.beginPath(); c.roundRect(s * x - 11, s * y - 9, 22, 18, 6); c.fill(); c.stroke(); } },
  palm: (c, s) => { disc(c, s, '#2a7ab8'); c.strokeStyle = '#d8f4ff'; c.lineWidth = 5; for (let i = 0; i < 3; i++) { c.beginPath(); c.arc(s * 0.3, s / 2, s * (0.18 + i * 0.12), -0.7, 0.7); c.stroke(); } },
  heal: (c, s) => { disc(c, s, '#2a8a4a'); POWER_ART.regen(c, s); },
  smite: (c, s) => { disc(c, s, '#c8a020'); c.fillStyle = 'rgba(255,250,210,0.95)'; c.beginPath(); c.moveTo(s * 0.42, s * 0.12); c.lineTo(s * 0.58, s * 0.12); c.lineTo(s * 0.62, s * 0.78); c.lineTo(s * 0.38, s * 0.78); c.closePath(); c.fill(); c.strokeStyle = '#fff'; c.lineWidth = 3; c.beginPath(); c.ellipse(s / 2, s * 0.78, s * 0.24, s * 0.07, 0, 0, Math.PI * 2); c.stroke(); },
  fireball: (c, s) => { disc(c, s, '#a83a1a'); POWER_ART.rage(c, s); },
  nova: (c, s) => { disc(c, s, '#2a8ab8'); c.strokeStyle = '#e8fbff'; c.lineWidth = 4; c.lineCap = 'round'; for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2; c.beginPath(); c.moveTo(s / 2, s / 2); c.lineTo(s / 2 + Math.cos(a) * s * 0.32, s / 2 + Math.sin(a) * s * 0.32); c.stroke(); for (const k of [0.18, 0.26]) { c.beginPath(); c.moveTo(s / 2 + Math.cos(a) * s * k, s / 2 + Math.sin(a) * s * k); c.lineTo(s / 2 + Math.cos(a + 0.4) * s * (k + 0.06), s / 2 + Math.sin(a + 0.4) * s * (k + 0.06)); c.stroke(); } } },
};

// ------------------------------------------------------------------ items

const ITEM_ART: Record<string, Painter> = {
  sword: (c, s) => blade(c, s * 0.5, s * 0.72, s * 0.52, 0.6, 8),
  daggers: (c, s) => { blade(c, s * 0.4, s * 0.74, s * 0.38, -0.35, 6); blade(c, s * 0.6, s * 0.74, s * 0.38, 0.35, 6); },
  bow: (c, s) => { c.strokeStyle = INK; c.lineWidth = 8; c.beginPath(); c.arc(s * 0.32, s / 2, s * 0.38, -1.1, 1.1); c.stroke(); c.strokeStyle = '#a86a2a'; c.lineWidth = 5; c.beginPath(); c.arc(s * 0.32, s / 2, s * 0.38, -1.1, 1.1); c.stroke(); c.strokeStyle = '#f0e8d8'; c.lineWidth = 2; c.beginPath(); c.moveTo(s * 0.32 + Math.cos(-1.1) * s * 0.38, s / 2 + Math.sin(-1.1) * s * 0.38); c.lineTo(s * 0.32 + Math.cos(1.1) * s * 0.38, s / 2 + Math.sin(1.1) * s * 0.38); c.stroke(); },
  wraps: (c, s) => { const p = new Path2D(); p.roundRect(s * 0.28, s * 0.26, s * 0.44, s * 0.5, 12); outline(c, p, grad(c, s * 0.26, s * 0.76, ['#f8ecd0', '#c8a878'])); c.strokeStyle = '#8a6a3a'; c.lineWidth = 2; for (let y = 0.34; y < 0.74; y += 0.08) { c.beginPath(); c.moveTo(s * 0.28, s * y); c.lineTo(s * 0.72, s * (y + 0.05)); c.stroke(); } },
  staff: (c, s) => { c.save(); c.translate(s / 2, s / 2); c.rotate(0.5); c.lineWidth = 9; c.strokeStyle = INK; c.beginPath(); c.moveTo(0, s * 0.42); c.lineTo(0, -s * 0.3); c.stroke(); c.lineWidth = 5; c.strokeStyle = '#8a5a2a'; c.stroke(); c.fillStyle = '#7ad8ff'; c.strokeStyle = INK; c.lineWidth = 3; c.beginPath(); c.moveTo(0, -s * 0.46); c.lineTo(9, -s * 0.34); c.lineTo(0, -s * 0.26); c.lineTo(-9, -s * 0.34); c.closePath(); c.fill(); c.stroke(); c.restore(); },
  armor: (c, s) => { const p = new Path2D(); p.moveTo(s * 0.3, s * 0.2); p.lineTo(s * 0.42, s * 0.26); p.lineTo(s * 0.58, s * 0.26); p.lineTo(s * 0.7, s * 0.2); p.lineTo(s * 0.84, s * 0.34); p.lineTo(s * 0.74, s * 0.46); p.lineTo(s * 0.72, s * 0.8); p.lineTo(s * 0.28, s * 0.8); p.lineTo(s * 0.26, s * 0.46); p.lineTo(s * 0.16, s * 0.34); p.closePath(); outline(c, p, grad(c, s * 0.2, s * 0.8, ['#e8eef4', '#9aa8b8', '#5a6878'])); c.strokeStyle = '#e0b24a'; c.lineWidth = 3; c.beginPath(); c.moveTo(s / 2, s * 0.3); c.lineTo(s / 2, s * 0.76); c.stroke(); },
  ring: (c, s) => { c.lineWidth = 12; c.strokeStyle = INK; c.beginPath(); c.arc(s / 2, s * 0.58, s * 0.24, 0, Math.PI * 2); c.stroke(); c.lineWidth = 7; c.strokeStyle = '#e8b83a'; c.stroke(); const g = new Path2D(); g.moveTo(s / 2, s * 0.14); g.lineTo(s * 0.62, s * 0.26); g.lineTo(s / 2, s * 0.38); g.lineTo(s * 0.38, s * 0.26); g.closePath(); outline(c, g, '#e83a5a', 3); },
  amulet: (c, s) => { c.strokeStyle = '#c8a040'; c.lineWidth = 3; c.beginPath(); c.arc(s / 2, s * 0.32, s * 0.24, Math.PI, 0); c.stroke(); const p = new Path2D(); p.arc(s / 2, s * 0.6, s * 0.2, 0, Math.PI * 2); outline(c, p, grad(c, s * 0.4, s * 0.8, ['#a8e8ff', '#3a8ae0'])); },
  charm: (c, s) => { const p = new Path2D(); for (let i = 0; i < 6; i++) { const a = Math.PI / 6 + (i * Math.PI) / 3; const x = s / 2 + Math.cos(a) * s * 0.32, y = s / 2 + Math.sin(a) * s * 0.32; i ? p.lineTo(x, y) : p.moveTo(x, y); } p.closePath(); outline(c, p, grad(c, s * 0.2, s * 0.8, ['#d8ffd8', '#3a9a5a'])); c.fillStyle = '#e83a5a'; c.beginPath(); c.arc(s / 2, s / 2, s * 0.1, 0, Math.PI * 2); c.fill(); },
};

/** The item icon of a slot / kind / class. */
export function itemIcon(slot: string, kind: string | undefined, cls: string): string {
  if (slot === 'armor') return icon('armor');
  if (slot === 'trinket') return icon(kind ?? 'ring');
  return icon(({ warrior: 'sword', rogue: 'daggers', ranger: 'bow', monk: 'wraps', cleric: 'staff', wizard: 'staff' } as Record<string, string>)[cls] ?? 'sword');
}

const BUTTONS: Record<string, Painter> = {
  map: (c, s) => { const p = new Path2D(); p.moveTo(s * 0.16, s * 0.24); p.lineTo(s * 0.38, s * 0.16); p.lineTo(s * 0.62, s * 0.24); p.lineTo(s * 0.84, s * 0.16); p.lineTo(s * 0.84, s * 0.76); p.lineTo(s * 0.62, s * 0.84); p.lineTo(s * 0.38, s * 0.76); p.lineTo(s * 0.16, s * 0.84); p.closePath(); outline(c, p, '#f0e0b0'); c.strokeStyle = 'rgba(90,60,20,0.6)'; c.lineWidth = 2; c.beginPath(); c.moveTo(s * 0.38, s * 0.16); c.lineTo(s * 0.38, s * 0.76); c.moveTo(s * 0.62, s * 0.24); c.lineTo(s * 0.62, s * 0.84); c.stroke(); c.strokeStyle = '#c83a2a'; c.lineWidth = 3; c.setLineDash([5, 4]); c.beginPath(); c.moveTo(s * 0.26, s * 0.66); c.quadraticCurveTo(s * 0.5, s * 0.4, s * 0.72, s * 0.36); c.stroke(); c.setLineDash([]); },
  hero: (c, s) => POWER_ART.shield(c, s),
};

/** Paints every icon (once per page). */
export function makeArt(scene: Phaser.Scene): void {
  const all: Record<string, Painter> = { coin, potion, heart, skull, marker, banner, ...BUTTONS };
  for (const [k, p] of Object.entries(POWER_ART)) all['pw-' + k] = p;
  for (const [k, p] of Object.entries(SKILL_ART)) all['sk-' + k] = p;
  for (const [k, p] of Object.entries(ITEM_ART)) all[k] = p;
  for (const [k, p] of Object.entries(all)) bake(scene, icon(k), ICON, ICON, (c) => p(c, ICON));
}
