// Sushi Rush: the 2D pieces, painted once on canvases under the Ayvago intro (and the icon sheet's
// frames from icons.ts). Icons are named by the sheet's model key ('ramen', 'chef-panda') or a
// painted one ('p-coin', 'p-cat', 'p-teapot', 'p-geta', 'p-clock', 'p-heart', 'p-flame',
// 'p-lock', 'p-check'). Also the order bubble, the VIP bubble, the cooker timer's disc and a soft spark.
import Phaser from 'phaser';
import { bake } from '@core';
import { ICON_SHEET, ICON_KEYS, iconFrame, type IconKey } from './icons';

const P = 'sr-p-';
export const BUBBLE = 'sr-bubble';
export const BUBBLE_VIP = 'sr-bubble-vip';
export const BUBBLE_R = 46;
export const TIMER = 'sr-timer';
export const SPARK = 'sr-spark';
export const COIN = P + 'coin';
export const SEAT_MARK = 'sr-seat';

/** A painted icon's drawing in a 96 px box. */
const PAINT: Record<string, (c: CanvasRenderingContext2D) => void> = {
  coin: (c) => {
    const g = c.createRadialGradient(40, 38, 6, 48, 48, 40);
    g.addColorStop(0, '#fff6c0'); g.addColorStop(0.55, '#f4c430'); g.addColorStop(1, '#a8701a');
    c.fillStyle = '#6a4210'; c.beginPath(); c.arc(48, 51, 38, 0, Math.PI * 2); c.fill();
    c.fillStyle = g; c.beginPath(); c.arc(48, 48, 38, 0, Math.PI * 2); c.fill();
    c.strokeStyle = '#a8701a'; c.lineWidth = 3; c.beginPath(); c.arc(48, 48, 29, 0, Math.PI * 2); c.stroke();
    // a square hole, like an old mon coin
    c.fillStyle = '#7a4c12'; c.fillRect(40, 40, 16, 16);
    c.fillStyle = 'rgba(255,255,255,0.5)'; c.beginPath(); c.ellipse(34, 30, 10, 5, -0.6, 0, Math.PI * 2); c.fill();
  },
  cat: (c) => {
    // a maneki-neko: white body, red collar, a raised paw
    c.lineWidth = 3; c.strokeStyle = '#3a1a0e';
    c.fillStyle = '#fffaf0';
    c.beginPath(); c.ellipse(48, 66, 26, 24, 0, 0, Math.PI * 2); c.fill(); c.stroke();
    c.beginPath(); c.arc(48, 38, 22, 0, Math.PI * 2); c.fill(); c.stroke();
    for (const s of [-1, 1]) { c.beginPath(); c.moveTo(48 + s * 20, 28); c.lineTo(48 + s * 14, 10); c.lineTo(48 + s * 6, 20); c.closePath(); c.fill(); c.stroke(); }
    c.fillStyle = '#ff9ab0'; for (const s of [-1, 1]) { c.beginPath(); c.moveTo(48 + s * 16, 24); c.lineTo(48 + s * 14, 15); c.lineTo(48 + s * 10, 21); c.closePath(); c.fill(); }
    // raised paw
    c.fillStyle = '#fffaf0'; c.beginPath(); c.ellipse(76, 36, 9, 13, 0.3, 0, Math.PI * 2); c.fill(); c.stroke();
    c.fillStyle = '#3a1a0e';
    c.beginPath(); c.arc(40, 38, 2.6, 0, Math.PI * 2); c.arc(56, 38, 2.6, 0, Math.PI * 2); c.fill();
    c.beginPath(); c.arc(48, 45, 2, 0, Math.PI); c.stroke();
    c.fillStyle = '#c2282e'; c.fillRect(30, 57, 36, 6);
    c.fillStyle = '#f4c430'; c.beginPath(); c.arc(48, 66, 6, 0, Math.PI * 2); c.fill(); c.stroke();
  },
  teapot: (c) => {
    c.lineWidth = 3; c.strokeStyle = '#1a2a1a';
    const g = c.createLinearGradient(0, 30, 0, 84);
    g.addColorStop(0, '#6aa86a'); g.addColorStop(1, '#2a5a32');
    c.fillStyle = g;
    c.beginPath(); c.ellipse(48, 60, 30, 24, 0, 0, Math.PI * 2); c.fill(); c.stroke();
    // spout and handle
    c.beginPath(); c.moveTo(20, 58); c.quadraticCurveTo(6, 52, 8, 38); c.lineTo(14, 40); c.quadraticCurveTo(16, 50, 24, 52); c.fill(); c.stroke();
    c.lineWidth = 5; c.strokeStyle = '#8a5a2a';
    c.beginPath(); c.arc(48, 34, 24, Math.PI * 1.1, Math.PI * 1.9); c.stroke();
    c.lineWidth = 3; c.strokeStyle = '#1a2a1a';
    c.fillStyle = '#4a8a52'; c.beginPath(); c.ellipse(48, 38, 14, 5, 0, 0, Math.PI * 2); c.fill(); c.stroke();
    c.fillStyle = '#f4c430'; c.beginPath(); c.arc(48, 33, 4, 0, Math.PI * 2); c.fill();
    c.fillStyle = 'rgba(255,255,255,0.35)'; c.beginPath(); c.ellipse(38, 52, 8, 5, -0.5, 0, Math.PI * 2); c.fill();
  },
  geta: (c) => {
    // a wooden sandal seen from above-side with a red strap and a speed streak
    c.lineWidth = 3; c.strokeStyle = '#3a1a0e';
    c.fillStyle = '#d9a066';
    c.beginPath(); c.roundRect(16, 40, 64, 22, 8); c.fill(); c.stroke();
    c.fillStyle = '#8a5a2a'; c.fillRect(24, 62, 10, 12); c.fillRect(62, 62, 10, 12);
    c.strokeRect(24, 62, 10, 12); c.strokeRect(62, 62, 10, 12);
    c.strokeStyle = '#c2282e'; c.lineWidth = 6;
    c.beginPath(); c.moveTo(30, 44); c.quadraticCurveTo(48, 18, 66, 44); c.stroke();
    c.strokeStyle = 'rgba(255,255,255,0.85)'; c.lineWidth = 4; c.lineCap = 'round';
    for (const y of [24, 34]) { c.beginPath(); c.moveTo(4, y); c.lineTo(20, y); c.stroke(); }
  },
  clock: (c) => {
    c.lineWidth = 4; c.strokeStyle = '#3a1a0e';
    c.fillStyle = '#fff8ec'; c.beginPath(); c.arc(48, 50, 34, 0, Math.PI * 2); c.fill(); c.stroke();
    c.strokeStyle = '#c2282e'; c.lineWidth = 6; c.beginPath(); c.arc(48, 50, 34, -Math.PI / 2, Math.PI * 0.4); c.stroke();
    c.strokeStyle = '#3a1a0e'; c.lineWidth = 4; c.lineCap = 'round';
    c.beginPath(); c.moveTo(48, 50); c.lineTo(48, 28); c.moveTo(48, 50); c.lineTo(62, 58); c.stroke();
    c.fillStyle = '#3a1a0e'; c.beginPath(); c.arc(48, 50, 4, 0, Math.PI * 2); c.fill();
    c.fillStyle = '#f4c430'; c.beginPath(); c.roundRect(40, 8, 16, 8, 3); c.fill();
  },
  heart: (c) => {
    const g = c.createLinearGradient(0, 16, 0, 84);
    g.addColorStop(0, '#ff7a8a'); g.addColorStop(1, '#c2182e');
    c.fillStyle = g; c.strokeStyle = '#4a0a10'; c.lineWidth = 3;
    c.beginPath(); c.moveTo(48, 82); c.bezierCurveTo(10, 56, 10, 22, 32, 20); c.bezierCurveTo(42, 19, 48, 28, 48, 32);
    c.bezierCurveTo(48, 28, 54, 19, 64, 20); c.bezierCurveTo(86, 22, 86, 56, 48, 82); c.fill(); c.stroke();
    c.fillStyle = 'rgba(255,255,255,0.5)'; c.beginPath(); c.ellipse(34, 34, 8, 5, -0.6, 0, Math.PI * 2); c.fill();
  },
  flame: (c) => {
    const g = c.createLinearGradient(0, 10, 0, 86);
    g.addColorStop(0, '#fff2a0'); g.addColorStop(0.5, '#ffa030'); g.addColorStop(1, '#d8301a');
    c.fillStyle = g; c.strokeStyle = '#5a1a08'; c.lineWidth = 3;
    c.beginPath(); c.moveTo(48, 8); c.bezierCurveTo(70, 34, 80, 50, 72, 68); c.bezierCurveTo(64, 86, 32, 86, 24, 68);
    c.bezierCurveTo(18, 54, 28, 44, 34, 36); c.bezierCurveTo(36, 48, 42, 50, 44, 46); c.bezierCurveTo(40, 32, 44, 20, 48, 8); c.fill(); c.stroke();
    c.fillStyle = '#fff6c8'; c.beginPath(); c.ellipse(48, 66, 10, 14, 0, 0, Math.PI * 2); c.fill();
  },
  lock: (c) => {
    c.lineWidth = 7; c.strokeStyle = '#6a5a4a';
    c.beginPath(); c.arc(48, 40, 16, Math.PI, 0); c.stroke();
    c.fillStyle = '#8a7a64'; c.strokeStyle = '#3a2a1a'; c.lineWidth = 3;
    c.beginPath(); c.roundRect(26, 40, 44, 36, 6); c.fill(); c.stroke();
    c.fillStyle = '#3a2a1a'; c.beginPath(); c.arc(48, 55, 5, 0, Math.PI * 2); c.fill(); c.fillRect(46, 55, 4, 12);
  },
  check: (c) => {
    c.fillStyle = '#3f8a46'; c.strokeStyle = '#183a1a'; c.lineWidth = 3;
    c.beginPath(); c.arc(48, 48, 36, 0, Math.PI * 2); c.fill(); c.stroke();
    c.strokeStyle = '#fff'; c.lineWidth = 9; c.lineCap = 'round'; c.lineJoin = 'round';
    c.beginPath(); c.moveTo(30, 50); c.lineTo(43, 63); c.lineTo(67, 36); c.stroke();
  },
  bin: (c) => {
    c.fillStyle = '#7a5a3a'; c.strokeStyle = '#2a1a0e'; c.lineWidth = 3;
    c.beginPath(); c.moveTo(24, 30); c.lineTo(72, 30); c.lineTo(66, 84); c.lineTo(30, 84); c.closePath(); c.fill(); c.stroke();
    c.strokeStyle = 'rgba(0,0,0,0.35)'; for (const x of [38, 48, 58]) { c.beginPath(); c.moveTo(x, 38); c.lineTo(x, 78); c.stroke(); }
    c.fillStyle = '#9a7a52'; c.strokeStyle = '#2a1a0e'; c.beginPath(); c.roundRect(18, 20, 60, 10, 4); c.fill(); c.stroke();
    c.fillRect(40, 13, 16, 7); c.strokeRect(40, 13, 16, 7);
  },
};
export const PAINTED = Object.keys(PAINT);

/** Paints the painted icons, the bubbles and the sparks (once). */
export function makeArt(scene: Phaser.Scene): void {
  for (const [k, draw] of Object.entries(PAINT)) bake(scene, P + k, 96, 96, draw);
  bake(scene, SPARK, 24, 24, (c) => {
    const g = c.createRadialGradient(12, 12, 0, 12, 12, 12);
    g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(1, 'rgba(255,255,255,0)');
    c.fillStyle = g; c.fillRect(0, 0, 24, 24);
  });
  const bubble = (vip: boolean) => (c: CanvasRenderingContext2D) => {
    const R = BUBBLE_R, cx = 60, cy = 56;
    c.save();
    c.shadowColor = 'rgba(30,10,0,0.45)'; c.shadowBlur = 8; c.shadowOffsetY = 4;
    c.fillStyle = vip ? '#fff4c8' : '#fffaf0';
    c.beginPath(); c.arc(cx, cy, R, 0, Math.PI * 2); c.fill();
    // the tail towards the customer below
    c.beginPath(); c.moveTo(cx - 12, cy + R - 6); c.lineTo(cx, cy + R + 16); c.lineTo(cx + 12, cy + R - 6); c.closePath(); c.fill();
    c.restore();
    c.strokeStyle = vip ? '#d8a020' : '#d8c4a0'; c.lineWidth = 3;
    c.beginPath(); c.arc(cx, cy, R - 9, 0, Math.PI * 2); c.stroke();
    if (vip) {
      // a little gold star on top
      c.fillStyle = '#f4c430'; c.strokeStyle = '#6a4210'; c.lineWidth = 2;
      c.beginPath();
      for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + (i * Math.PI) / 5, r = i % 2 ? 6 : 13; c.lineTo(cx + Math.cos(a) * r, cy - R + 2 + Math.sin(a) * r); }
      c.closePath(); c.fill(); c.stroke();
    }
  };
  bake(scene, BUBBLE, 120, 124, bubble(false));
  bake(scene, BUBBLE_VIP, 120, 124, bubble(true));
  bake(scene, TIMER, 84, 84, (c) => {
    c.shadowColor = 'rgba(0,0,0,0.4)'; c.shadowBlur = 6; c.shadowOffsetY = 3;
    c.fillStyle = 'rgba(255,250,240,0.95)'; c.beginPath(); c.arc(42, 42, 32, 0, Math.PI * 2); c.fill();
  });
  bake(scene, SEAT_MARK, 60, 36, (c) => {
    c.fillStyle = '#ffe08a'; c.strokeStyle = '#3a1a0e'; c.lineWidth = 3;
    c.beginPath(); c.moveTo(30, 32); c.lineTo(8, 6); c.lineTo(52, 6); c.closePath(); c.fill(); c.stroke();
  });
}

/** An icon (sheet frame or painted) as an image of `size` px. */
export function iconImg(scene: Phaser.Scene, x: number, y: number, key: string, size: number): Phaser.GameObjects.Image {
  const img = PAINTED.includes(key.replace(/^p-/, '')) && key.startsWith('p-')
    ? scene.add.image(x, y, P + key.slice(2))
    : scene.add.image(x, y, ICON_SHEET, iconFrame(key as IconKey));
  img.setDisplaySize(size, size);
  return img;
}

/** Sets an existing image to an icon. */
export function setIcon(img: Phaser.GameObjects.Image, key: string, size: number): Phaser.GameObjects.Image {
  if (key.startsWith('p-')) img.setTexture(P + key.slice(2));
  else img.setTexture(ICON_SHEET, iconFrame(key as IconKey));
  return img.setDisplaySize(size, size);
}

export const isIcon = (k: string): boolean => (ICON_KEYS as readonly string[]).includes(k) || (k.startsWith('p-') && PAINTED.includes(k.slice(2)));
