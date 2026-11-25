// Dungeon Rescue: the 2D icons, small flat pictures drawn once on canvases (no image files): coins,
// the key, a person (rescued), the eye of the detection readout (shut, open, alarmed), stars, a
// padlock, a clock, the bell, the five tricks, ACT's hand, a vase to throw, the crew, the "?" and "!"
// bubbles over the guards' heads, an arrow for guards out of view, the Jailer Chief's horned helmet,
// the knight's helm, a gold chest, a spark, the map's dots, and a badge per crew kind. Made under the
// Ayvago intro (theme prebake) and again on demand if missing.
import Phaser from 'phaser';
import { INK, GOLD, CRIMSON, ROYAL, IRON, css, star, flame, keyShape } from './paint';

function make(scene: Phaser.Scene, key: string, w: number, h: number, draw: (c: CanvasRenderingContext2D) => void): void {
  if (scene.textures.exists(key)) return;
  const t = scene.textures.createCanvas(key, w, h);
  if (!t) return;
  const c = t.getContext();
  c.lineJoin = 'round'; c.lineCap = 'round';
  draw(c);
  t.refresh();
}

/** An icon at a size. */
export function icon(scene: Phaser.Scene, x: number, y: number, key: string, size: number): Phaser.GameObjects.Image {
  makeArt(scene);
  return scene.add.image(x, y, key).setDisplaySize(size, size);
}

const person = (c: CanvasRenderingContext2D, x: number, y: number, s: number, fill: string) => {
  c.fillStyle = fill; c.strokeStyle = INK; c.lineWidth = s * 0.09;
  c.beginPath(); c.arc(x, y - s * 0.32, s * 0.24, 0, Math.PI * 2); c.fill(); c.stroke();
  c.beginPath(); c.moveTo(x - s * 0.36, y + s * 0.48); c.quadraticCurveTo(x - s * 0.36, y - s * 0.04, x, y - s * 0.04); c.quadraticCurveTo(x + s * 0.36, y - s * 0.04, x + s * 0.36, y + s * 0.48); c.closePath(); c.fill(); c.stroke();
};

const eye = (c: CanvasRenderingContext2D, open: number, iris: string) => {
  c.fillStyle = '#fff6e0'; c.strokeStyle = INK; c.lineWidth = 5;
  c.beginPath(); c.moveTo(8, 48); c.quadraticCurveTo(48, 48 - 40 * open, 88, 48); c.quadraticCurveTo(48, 48 + 40 * open, 8, 48); c.closePath(); c.fill(); c.stroke();
  if (open > 0.2) { c.fillStyle = iris; c.beginPath(); c.arc(48, 48, 14 * open, 0, Math.PI * 2); c.fill(); c.fillStyle = INK; c.beginPath(); c.arc(48, 48, 6 * open, 0, Math.PI * 2); c.fill(); }
};

const bubble = (c: CanvasRenderingContext2D, fill: string, mark: string, color: string) => {
  c.fillStyle = fill; c.strokeStyle = INK; c.lineWidth = 5;
  c.beginPath(); c.roundRect(10, 6, 76, 66, 22); c.moveTo(38, 70); c.lineTo(48, 88); c.lineTo(58, 70); c.fill(); c.stroke();
  c.fillStyle = fill; c.fillRect(38, 64, 20, 8);
  c.fillStyle = color; c.font = '900 56px Nunito, Arial'; c.textAlign = 'center'; c.textBaseline = 'middle';
  c.strokeStyle = INK; c.lineWidth = 6; c.strokeText(mark, 48, 41); c.fillText(mark, 48, 41);
};

/** Small badges per crew kind (a hat or the thing they carry). */
const KIND_ART: Record<string, (c: CanvasRenderingContext2D) => void> = {
  casual: (c) => { c.fillStyle = '#4a7ac8'; c.beginPath(); c.ellipse(48, 40, 26, 14, 0, Math.PI, 0); c.fill(); c.stroke(); c.fillRect(48, 36, 34, 6); },
  chef: (c) => { c.fillStyle = '#ffffff'; c.beginPath(); c.arc(36, 34, 13, 0, Math.PI * 2); c.arc(60, 34, 13, 0, Math.PI * 2); c.arc(48, 26, 15, 0, Math.PI * 2); c.fill(); c.stroke(); c.fillRect(32, 40, 32, 14); c.strokeRect(32, 40, 32, 14); },
  doctor: (c) => { c.strokeStyle = '#3a3a48'; c.lineWidth = 6; c.beginPath(); c.arc(48, 34, 18, 0.2, Math.PI - 0.2); c.stroke(); c.fillStyle = '#c8ccd8'; c.beginPath(); c.arc(48, 62, 8, 0, Math.PI * 2); c.fill(); c.strokeStyle = INK; c.lineWidth = 3; c.stroke(); c.lineWidth = 5; c.strokeStyle = '#3a3a48'; c.beginPath(); c.moveTo(48, 52); c.lineTo(48, 42); c.stroke(); },
  worker: (c) => { c.fillStyle = '#f0c030'; c.beginPath(); c.ellipse(48, 44, 28, 22, 0, Math.PI, 0); c.fill(); c.stroke(); c.fillRect(16, 42, 64, 6); c.strokeRect(16, 42, 64, 6); },
  classy: (c) => { c.fillStyle = '#2a2a30'; c.fillRect(32, 14, 32, 30); c.strokeRect(32, 14, 32, 30); c.fillRect(20, 42, 56, 7); c.strokeRect(20, 42, 56, 7); c.fillStyle = css(CRIMSON); c.fillRect(32, 36, 32, 5); },
  suit: (c) => { c.fillStyle = '#ffffff'; c.beginPath(); c.moveTo(30, 18); c.lineTo(66, 18); c.lineTo(48, 34); c.closePath(); c.fill(); c.stroke(); c.fillStyle = css(CRIMSON); c.beginPath(); c.moveTo(48, 30); c.lineTo(54, 40); c.lineTo(48, 74); c.lineTo(42, 40); c.closePath(); c.fill(); c.stroke(); },
  kimono: (c) => { c.fillStyle = '#e07a9a'; c.beginPath(); c.moveTo(48, 70); c.arc(48, 70, 46, -Math.PI * 0.85, -Math.PI * 0.15); c.closePath(); c.fill(); c.stroke(); c.strokeStyle = 'rgba(40,10,20,0.6)'; c.lineWidth = 2; for (let i = 1; i < 6; i++) { const a = -Math.PI * 0.85 + (Math.PI * 0.7 * i) / 6; c.beginPath(); c.moveTo(48, 70); c.lineTo(48 + Math.cos(a) * 44, 70 + Math.sin(a) * 44); c.stroke(); } },
  pirate: (c) => { c.fillStyle = '#2a2420'; c.beginPath(); c.moveTo(12, 50); c.quadraticCurveTo(48, 6, 84, 50); c.quadraticCurveTo(48, 36, 12, 50); c.fill(); c.stroke(); c.strokeStyle = css(GOLD); c.lineWidth = 3; c.beginPath(); c.moveTo(20, 46); c.quadraticCurveTo(48, 36, 76, 46); c.stroke(); },
  cowboy: (c) => { c.fillStyle = '#a8703a'; c.beginPath(); c.ellipse(48, 50, 38, 10, 0, 0, Math.PI * 2); c.fill(); c.stroke(); c.beginPath(); c.moveTo(30, 50); c.quadraticCurveTo(30, 18, 48, 22); c.quadraticCurveTo(66, 18, 66, 50); c.closePath(); c.fill(); c.stroke(); },
  ninja: (c) => { c.fillStyle = '#2a2a34'; c.beginPath(); c.arc(48, 48, 28, 0, Math.PI * 2); c.fill(); c.stroke(); c.fillStyle = '#f0d0b0'; c.fillRect(26, 40, 44, 12); c.fillStyle = INK; c.fillRect(36, 43, 6, 6); c.fillRect(54, 43, 6, 6); c.fillStyle = css(CRIMSON); c.fillRect(66, 34, 18, 6); },
  elf: (c) => { c.fillStyle = '#3a8a4a'; c.beginPath(); c.moveTo(48, 10); c.quadraticCurveTo(80, 44, 48, 82); c.quadraticCurveTo(16, 44, 48, 10); c.fill(); c.stroke(); c.strokeStyle = '#1a4a24'; c.lineWidth = 3; c.beginPath(); c.moveTo(48, 16); c.lineTo(48, 78); c.stroke(); },
  wizard: (c) => { c.fillStyle = '#2c4c8e'; c.beginPath(); c.moveTo(48, 8); c.lineTo(72, 64); c.lineTo(24, 64); c.closePath(); c.fill(); c.stroke(); c.fillRect(14, 62, 68, 8); c.strokeRect(14, 62, 68, 8); star(c, 50, 40, 8, GOLD, null); },
  witch: (c) => { c.fillStyle = '#3a2a4a'; c.beginPath(); c.moveTo(56, 8); c.lineTo(70, 62); c.lineTo(26, 62); c.closePath(); c.fill(); c.stroke(); c.fillRect(12, 60, 72, 8); c.strokeRect(12, 60, 72, 8); c.fillStyle = css(GOLD); c.fillRect(42, 52, 14, 10); },
  cow: (c) => { c.fillStyle = '#ffffff'; c.beginPath(); c.ellipse(48, 46, 26, 30, 0, 0, Math.PI * 2); c.fill(); c.stroke(); c.fillStyle = '#2a2a2a'; c.beginPath(); c.ellipse(38, 34, 9, 7, 0.4, 0, Math.PI * 2); c.fill(); c.fillStyle = '#f0a0a8'; c.beginPath(); c.ellipse(48, 64, 18, 10, 0, 0, Math.PI * 2); c.fill(); c.stroke(); c.fillStyle = INK; c.fillRect(41, 62, 4, 4); c.fillRect(51, 62, 4, 4); },
  pug: (c) => { c.fillStyle = '#d8b080'; c.beginPath(); c.arc(48, 50, 28, 0, Math.PI * 2); c.fill(); c.stroke(); c.fillStyle = '#3a2a20'; c.beginPath(); c.ellipse(48, 60, 16, 12, 0, 0, Math.PI * 2); c.fill(); c.beginPath(); c.ellipse(22, 34, 8, 12, -0.5, 0, Math.PI * 2); c.ellipse(74, 34, 8, 12, 0.5, 0, Math.PI * 2); c.fill(); c.fillStyle = INK; c.beginPath(); c.arc(38, 44, 4, 0, Math.PI * 2); c.arc(58, 44, 4, 0, Math.PI * 2); c.fill(); },
};

export function makeArt(scene: Phaser.Scene): void {
  if (scene.textures.exists('dr-spark')) return;
  make(scene, 'dr-coin', 96, 96, (c) => {
    const g = c.createRadialGradient(40, 38, 6, 48, 48, 38); g.addColorStop(0, '#fff2a0'); g.addColorStop(0.6, css(GOLD)); g.addColorStop(1, '#8a5a10');
    c.fillStyle = g; c.strokeStyle = INK; c.lineWidth = 5; c.beginPath(); c.arc(48, 48, 36, 0, Math.PI * 2); c.fill(); c.stroke();
    c.strokeStyle = 'rgba(120,70,10,0.8)'; c.lineWidth = 3; c.beginPath(); c.arc(48, 48, 26, 0, Math.PI * 2); c.stroke();
    star(c, 48, 49, 13, 0xffe070, 'rgba(120,70,10,0.9)');
  });
  make(scene, 'dr-key', 96, 96, (c) => { c.strokeStyle = INK; c.lineWidth = 16; keyShape(c, 48, 50, 36, -0.7); c.strokeStyle = '#f0c040'; c.lineWidth = 9; keyShape(c, 48, 50, 36, -0.7); });
  make(scene, 'dr-person', 96, 96, (c) => person(c, 48, 48, 80, '#f0d4b0'));
  make(scene, 'dr-crew', 96, 96, (c) => { person(c, 34, 52, 62, '#c8a080'); person(c, 60, 46, 70, '#f0d4b0'); });
  make(scene, 'dr-eye', 96, 96, (c) => eye(c, 1, '#4a8ac8'));
  make(scene, 'dr-eye-shut', 96, 96, (c) => { eye(c, 0.12, '#4a8ac8'); c.strokeStyle = INK; c.lineWidth = 4; for (const x of [26, 48, 70]) { c.beginPath(); c.moveTo(x, 52); c.lineTo(x + (x - 48) * 0.2, 62); c.stroke(); } });
  make(scene, 'dr-eye-q', 96, 96, (c) => { eye(c, 0.9, '#f0a020'); c.fillStyle = '#f0a020'; c.font = '900 34px Nunito, Arial'; c.textAlign = 'center'; c.strokeStyle = INK; c.lineWidth = 5; c.strokeText('?', 80, 30); c.fillText('?', 80, 30); });
  make(scene, 'dr-eye-x', 96, 96, (c) => { eye(c, 1, '#e8302a'); c.fillStyle = '#ff4030'; c.font = '900 36px Nunito, Arial'; c.textAlign = 'center'; c.strokeStyle = INK; c.lineWidth = 5; c.strokeText('!', 82, 30); c.fillText('!', 82, 30); });
  make(scene, 'dr-q', 96, 96, (c) => bubble(c, '#fff4c8', '?', '#f0a020'));
  make(scene, 'dr-x', 96, 96, (c) => bubble(c, '#ffe0d8', '!', '#ff3020'));
  make(scene, 'dr-z', 96, 96, (c) => bubble(c, '#dce8ff', 'z', '#6a8ad8'));
  make(scene, 'dr-arrow', 64, 64, (c) => { c.fillStyle = '#ffd060'; c.strokeStyle = INK; c.lineWidth = 4; c.beginPath(); c.moveTo(58, 32); c.lineTo(14, 10); c.lineTo(24, 32); c.lineTo(14, 54); c.closePath(); c.fill(); c.stroke(); });
  make(scene, 'dr-star', 96, 96, (c) => star(c, 48, 50, 40));
  make(scene, 'dr-star-empty', 96, 96, (c) => star(c, 48, 50, 40, 0x5a5048, 'rgba(26,18,20,0.9)'));
  make(scene, 'dr-star-small', 48, 48, (c) => star(c, 24, 25, 20));
  make(scene, 'dr-star-dim', 48, 48, (c) => star(c, 24, 25, 20, 0x5a5048, 'rgba(26,18,20,0.9)'));
  make(scene, 'dr-lock', 64, 64, (c) => {
    c.strokeStyle = INK; c.lineWidth = 9; c.beginPath(); c.arc(32, 26, 13, Math.PI, 0); c.lineTo(45, 32); c.moveTo(19, 32); c.lineTo(19, 26); c.stroke();
    c.strokeStyle = '#a8a0a0'; c.lineWidth = 5; c.beginPath(); c.arc(32, 26, 13, Math.PI, 0); c.lineTo(45, 32); c.moveTo(19, 32); c.lineTo(19, 26); c.stroke();
    c.fillStyle = '#d8a440'; c.strokeStyle = INK; c.lineWidth = 3.5; c.beginPath(); c.roundRect(12, 30, 40, 28, 6); c.fill(); c.stroke();
    c.fillStyle = INK; c.beginPath(); c.arc(32, 42, 4, 0, Math.PI * 2); c.fill(); c.fillRect(30, 42, 4, 9);
  });
  make(scene, 'dr-clock', 64, 64, (c) => { c.fillStyle = '#fff2d8'; c.strokeStyle = INK; c.lineWidth = 4; c.beginPath(); c.arc(32, 34, 24, 0, Math.PI * 2); c.fill(); c.stroke(); c.fillStyle = INK; c.fillRect(26, 4, 12, 7); c.lineWidth = 4; c.beginPath(); c.moveTo(32, 34); c.lineTo(32, 20); c.moveTo(32, 34); c.lineTo(42, 40); c.stroke(); });
  make(scene, 'dr-bell', 96, 96, (c) => {
    const g = c.createLinearGradient(20, 0, 76, 0); g.addColorStop(0, '#8a6a20'); g.addColorStop(0.4, '#f0c850'); g.addColorStop(1, '#7a5a18');
    c.fillStyle = g; c.strokeStyle = INK; c.lineWidth = 5;
    c.beginPath(); c.moveTo(48, 14); c.bezierCurveTo(70, 14, 70, 40, 74, 64); c.lineTo(82, 72); c.lineTo(14, 72); c.lineTo(22, 64); c.bezierCurveTo(26, 40, 26, 14, 48, 14); c.closePath(); c.fill(); c.stroke();
    c.fillStyle = INK; c.beginPath(); c.arc(48, 80, 7, 0, Math.PI * 2); c.fill();
    c.strokeStyle = '#ff6040'; c.lineWidth = 4; for (const s of [-1, 1]) { c.beginPath(); c.arc(48, 46, 44, s > 0 ? -0.5 : Math.PI + 0.5 - 1, s > 0 ? -0.5 + 1 : Math.PI + 0.5); c.stroke(); }
  });
  make(scene, 'dr-smoke', 96, 96, (c) => {
    c.fillStyle = '#3a3a44'; c.strokeStyle = INK; c.lineWidth = 5; c.beginPath(); c.arc(42, 58, 24, 0, Math.PI * 2); c.fill(); c.stroke();
    c.fillStyle = '#8a8e98'; c.fillRect(36, 28, 12, 10); c.strokeRect(36, 28, 12, 10);
    c.fillStyle = 'rgba(210,214,226,0.95)'; for (const [x, y, r] of [[62, 26, 12], [74, 18, 9], [56, 14, 8]] as [number, number, number][]) { c.beginPath(); c.arc(x, y, r, 0, Math.PI * 2); c.fill(); c.lineWidth = 3; c.stroke(); }
  });
  make(scene, 'dr-disguise', 96, 96, (c) => {
    c.fillStyle = '#6a8a4a'; c.strokeStyle = INK; c.lineWidth = 5;
    c.beginPath(); c.moveTo(14, 58); c.quadraticCurveTo(16, 16, 48, 14); c.quadraticCurveTo(80, 16, 82, 58); c.closePath(); c.fill(); c.stroke();
    c.fillStyle = '#4a6a34'; c.fillRect(10, 54, 76, 10); c.strokeRect(10, 54, 76, 10);
    c.fillStyle = '#f0d4b0'; c.beginPath(); c.arc(48, 74, 14, 0, Math.PI); c.fill();
  });
  make(scene, 'dr-powder', 96, 96, (c) => {
    c.fillStyle = '#b088e0'; c.strokeStyle = INK; c.lineWidth = 5;
    c.beginPath(); c.moveTo(30, 34); c.quadraticCurveTo(12, 84, 48, 84); c.quadraticCurveTo(84, 84, 66, 34); c.closePath(); c.fill(); c.stroke();
    c.fillStyle = '#7a58a8'; c.fillRect(30, 28, 36, 8); c.strokeRect(30, 28, 36, 8);
    c.fillStyle = '#fff6e0'; c.font = '900 26px Nunito, Arial'; c.textAlign = 'center'; c.fillText('z', 48, 66); c.font = '900 18px Nunito, Arial'; c.fillText('z', 62, 22); c.fillText('z', 74, 12);
  });
  make(scene, 'dr-swift', 96, 96, (c) => {
    c.strokeStyle = 'rgba(255,255,255,0.85)'; c.lineWidth = 5;
    for (const [y, l] of [[34, 18], [50, 26], [66, 14]] as [number, number][]) { c.beginPath(); c.moveTo(8, y); c.lineTo(8 + l, y); c.stroke(); }
    c.fillStyle = '#3a9ac8'; c.strokeStyle = INK; c.lineWidth = 4;
    c.beginPath(); c.moveTo(40, 16); c.lineTo(62, 16); c.lineTo(62, 58); c.lineTo(86, 66); c.lineTo(86, 80); c.lineTo(40, 80); c.closePath(); c.fill(); c.stroke();
    c.fillStyle = '#ffd070'; c.fillRect(40, 30, 22, 6);
  });
  make(scene, 'dr-decoy', 96, 96, (c) => {
    c.fillStyle = '#c88a3a'; c.strokeStyle = INK; c.lineWidth = 5;
    c.beginPath(); c.ellipse(48, 40, 22, 26, 0, 0, Math.PI * 2); c.fill(); c.stroke();
    c.fillStyle = '#6a4426'; c.fillRect(43, 64, 10, 24); c.strokeRect(43, 64, 10, 24);
    c.strokeStyle = '#fff2d8'; c.lineWidth = 4; for (const r of [34, 44]) { c.beginPath(); c.arc(48, 40, r, -0.6, 0.6); c.stroke(); c.beginPath(); c.arc(48, 40, r, Math.PI - 0.6, Math.PI + 0.6); c.stroke(); }
  });
  make(scene, 'dr-hand', 96, 96, (c) => {
    c.fillStyle = '#fff2d8'; c.strokeStyle = INK; c.lineWidth = 4;
    c.beginPath();
    c.moveTo(30, 86); c.lineTo(26, 52); c.quadraticCurveTo(24, 44, 31, 44); c.quadraticCurveTo(36, 44, 37, 52);
    c.lineTo(37, 22); c.quadraticCurveTo(37, 14, 44, 14); c.quadraticCurveTo(51, 14, 51, 22); c.lineTo(51, 42);
    c.lineTo(52, 30); c.quadraticCurveTo(53, 24, 59, 24); c.quadraticCurveTo(65, 24, 65, 31); c.lineTo(65, 46);
    c.lineTo(66, 38); c.quadraticCurveTo(67, 33, 72, 33); c.quadraticCurveTo(78, 34, 77, 41); c.lineTo(74, 72); c.quadraticCurveTo(70, 86, 58, 86); c.closePath();
    c.fill(); c.stroke();
  });
  make(scene, 'dr-vase', 96, 96, (c) => {
    c.fillStyle = '#c07a4a'; c.strokeStyle = INK; c.lineWidth = 5;
    c.beginPath(); c.moveTo(38, 16); c.lineTo(58, 16); c.lineTo(56, 28); c.bezierCurveTo(82, 40, 80, 82, 48, 86); c.bezierCurveTo(16, 82, 14, 40, 40, 28); c.closePath(); c.fill(); c.stroke();
    c.strokeStyle = 'rgba(70,30,10,0.6)'; c.lineWidth = 3; c.beginPath(); c.moveTo(24, 52); c.quadraticCurveTo(48, 60, 72, 52); c.stroke();
  });
  make(scene, 'dr-chief', 96, 96, (c) => {
    c.fillStyle = '#d8c8a0'; c.strokeStyle = INK; c.lineWidth = 4;
    for (const s of [-1, 1]) { c.beginPath(); c.moveTo(48 + s * 22, 40); c.quadraticCurveTo(48 + s * 44, 34, 48 + s * 40, 8); c.quadraticCurveTo(48 + s * 34, 30, 48 + s * 16, 30); c.closePath(); c.fill(); c.stroke(); }
    c.fillStyle = '#5a5e68'; c.beginPath(); c.moveTo(20, 62); c.quadraticCurveTo(20, 24, 48, 22); c.quadraticCurveTo(76, 24, 76, 62); c.closePath(); c.fill(); c.stroke();
    c.fillStyle = '#3a3c44'; c.fillRect(18, 58, 60, 10); c.strokeRect(18, 58, 60, 10);
    c.fillStyle = '#a85a30'; c.beginPath(); c.moveTo(30, 68); c.quadraticCurveTo(48, 96, 66, 68); c.closePath(); c.fill(); c.stroke();
  });
  make(scene, 'dr-helm', 96, 96, (c) => {
    const g = c.createLinearGradient(20, 0, 76, 0); g.addColorStop(0, '#5a5e68'); g.addColorStop(0.45, '#c8ccd8'); g.addColorStop(1, '#4a4e58');
    c.fillStyle = g; c.strokeStyle = INK; c.lineWidth = 5;
    c.beginPath(); c.moveTo(20, 80); c.lineTo(20, 40); c.quadraticCurveTo(20, 12, 48, 12); c.quadraticCurveTo(76, 12, 76, 40); c.lineTo(76, 80); c.closePath(); c.fill(); c.stroke();
    c.fillStyle = INK; c.fillRect(30, 40, 36, 7); c.fillRect(45, 40, 6, 26);
    c.fillStyle = css(CRIMSON); c.beginPath(); c.moveTo(48, 12); c.quadraticCurveTo(70, 0, 80, 14); c.quadraticCurveTo(64, 8, 48, 18); c.fill();
  });
  make(scene, 'dr-chest', 96, 96, (c) => {
    c.lineWidth = 5; c.strokeStyle = INK;
    const g = c.createLinearGradient(0, 20, 0, 84); g.addColorStop(0, '#fff0a0'); g.addColorStop(0.5, css(GOLD)); g.addColorStop(1, '#8a5a10');
    c.fillStyle = g;
    c.beginPath(); c.roundRect(14, 44, 68, 38, 6); c.fill(); c.stroke();
    c.beginPath(); c.moveTo(14, 44); c.quadraticCurveTo(14, 18, 48, 18); c.quadraticCurveTo(82, 18, 82, 44); c.closePath(); c.fill(); c.stroke();
    c.fillStyle = '#5a3a10'; c.fillRect(42, 38, 12, 16);
  });
  make(scene, 'dr-flame', 96, 96, (c) => flame(c, 48, 82, 30));
  make(scene, 'dr-spark', 32, 32, (c) => {
    const g = c.createRadialGradient(16, 16, 0, 16, 16, 16);
    g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.4, 'rgba(255,255,255,0.7)'); g.addColorStop(1, 'rgba(255,255,255,0)');
    c.fillStyle = g; c.fillRect(0, 0, 32, 32);
  });
  make(scene, 'dr-dot', 24, 24, (c) => { c.fillStyle = css(GOLD, 0.95); c.strokeStyle = INK; c.lineWidth = 3; c.beginPath(); c.arc(12, 12, 7, 0, Math.PI * 2); c.fill(); c.stroke(); });
  for (const [k, draw] of Object.entries(KIND_ART)) make(scene, 'dr-k-' + k, 96, 96, (c) => { c.strokeStyle = INK; c.lineWidth = 4; draw(c); });
  void ROYAL; void IRON;
}

/** The icon of each power. */
export const POWER_ICON: Record<string, string> = { smoke: 'dr-smoke', disguise: 'dr-disguise', powder: 'dr-powder', swift: 'dr-swift', decoy: 'dr-decoy' };
