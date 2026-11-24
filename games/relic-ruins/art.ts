// Relic Ruins: the 2D icons. Hearts, coins, the key, stars and the chest come from the Ultimate
// Platformer Pack's icon sheet already in the repository (rendered from its CC0 models, loaded from
// its own folder); the rest are small flat icons drawn once on canvases (no image files): the torch
// flame, the five powers, ACT's hand and roll, a padlock, a clock, the collapse crack, a gem, a
// candle, a soft spark and the map's dots. Made under the Ayvago intro (theme prebake) and again on
// demand if missing.
import Phaser from 'phaser';
import { asset } from '@core';
import { INK, css, star, flame } from './paint';

export const ICON_SHEET = 'rr-icons';
const SHEET_KEYS = ['coin', 'gem-green', 'gem-blue', 'gem-pink', 'star', 'star-empty', 'heart', 'heart-half', 'heart-empty', 'key', 'thunder', 'shield', 'magnet', 'spring', 'chest', 'flag'];
export const iconFrame = (k: string): number => Math.max(0, SHEET_KEYS.indexOf(k));

export function loadIcons(load: Phaser.Loader.LoaderPlugin): void {
  load.spritesheet(ICON_SHEET, asset('quaternius/ultimate-platformer-pack/icons.png'), { frameWidth: 128, frameHeight: 128 });
}

/** An icon from the sheet or the canvas set (`rr-…`) at a size. */
export function icon(scene: Phaser.Scene, x: number, y: number, key: string, size: number): Phaser.GameObjects.Image {
  const img = key.startsWith('rr-') ? scene.add.image(x, y, key) : scene.add.image(x, y, ICON_SHEET, iconFrame(key));
  return img.setDisplaySize(size, size);
}

function make(scene: Phaser.Scene, key: string, w: number, h: number, draw: (c: CanvasRenderingContext2D) => void): void {
  if (scene.textures.exists(key)) return;
  const t = scene.textures.createCanvas(key, w, h);
  if (!t) return;
  const c = t.getContext();
  c.lineJoin = 'round'; c.lineCap = 'round';
  draw(c);
  t.refresh();
}

export function makeArt(scene: Phaser.Scene): void {
  make(scene, 'rr-flame', 96, 96, (c) => {
    c.fillStyle = '#5a3a1e'; c.strokeStyle = INK; c.lineWidth = 3;
    c.beginPath(); c.roundRect(42, 50, 12, 40, 3); c.fill(); c.stroke();
    c.fillStyle = '#2e241c'; c.beginPath(); c.roundRect(36, 44, 24, 12, 3); c.fill(); c.stroke();
    flame(c, 48, 46, 22);
  });
  make(scene, 'rr-flare', 96, 96, (c) => {
    c.save(); c.translate(48, 52); c.rotate(0.6);
    c.fillStyle = '#c8302a'; c.strokeStyle = INK; c.lineWidth = 4;
    c.beginPath(); c.roundRect(-9, -8, 18, 44, 5); c.fill(); c.stroke();
    c.fillStyle = '#fff0e0'; c.fillRect(-9, 6, 18, 6);
    c.restore();
    c.fillStyle = 'rgba(255,220,150,0.6)';
    for (let i = 0; i < 10; i++) { const a = (i / 10) * Math.PI * 2; c.beginPath(); c.moveTo(36, 30); c.lineTo(36 + Math.cos(a) * 30, 30 + Math.sin(a) * 30); c.lineWidth = 3; c.strokeStyle = 'rgba(255,214,120,0.85)'; c.stroke(); }
    c.fillStyle = '#fff6c0'; c.beginPath(); c.arc(36, 30, 10, 0, Math.PI * 2); c.fill();
  });
  make(scene, 'rr-oil', 96, 96, (c) => {
    c.fillStyle = '#b8742a'; c.strokeStyle = INK; c.lineWidth = 4;
    c.beginPath(); c.moveTo(34, 24); c.lineTo(62, 24); c.lineTo(62, 34); c.bezierCurveTo(82, 40, 84, 82, 48, 86); c.bezierCurveTo(12, 82, 14, 40, 34, 34); c.closePath(); c.fill(); c.stroke();
    c.fillStyle = '#7a4a1a'; c.beginPath(); c.roundRect(38, 12, 20, 14, 3); c.fill(); c.stroke();
    c.fillStyle = '#ffc040'; c.beginPath(); c.moveTo(48, 46); c.bezierCurveTo(58, 58, 58, 70, 48, 72); c.bezierCurveTo(38, 70, 38, 58, 48, 46); c.fill();
  });
  make(scene, 'rr-boots', 96, 96, (c) => {
    c.strokeStyle = 'rgba(255,255,255,0.85)'; c.lineWidth = 5;
    for (const [y, l] of [[34, 18], [50, 26], [66, 14]] as [number, number][]) { c.beginPath(); c.moveTo(8, y); c.lineTo(8 + l, y); c.stroke(); }
    c.fillStyle = '#3a8ac8'; c.strokeStyle = INK; c.lineWidth = 4;
    c.beginPath(); c.moveTo(40, 16); c.lineTo(62, 16); c.lineTo(62, 58); c.lineTo(86, 66); c.lineTo(86, 80); c.lineTo(40, 80); c.closePath(); c.fill(); c.stroke();
    c.fillStyle = '#ffd070'; c.fillRect(40, 30, 22, 6);
  });
  make(scene, 'rr-compass', 96, 96, (c) => {
    c.fillStyle = '#e0b040'; c.strokeStyle = INK; c.lineWidth = 4;
    c.beginPath(); c.arc(48, 50, 34, 0, Math.PI * 2); c.fill(); c.stroke();
    c.fillStyle = '#f8ecd0'; c.beginPath(); c.arc(48, 50, 26, 0, Math.PI * 2); c.fill();
    c.fillStyle = '#e03a2a'; c.beginPath(); c.moveTo(48, 26); c.lineTo(56, 50); c.lineTo(40, 50); c.closePath(); c.fill();
    c.fillStyle = '#4a4a52'; c.beginPath(); c.moveTo(48, 74); c.lineTo(56, 50); c.lineTo(40, 50); c.closePath(); c.fill();
    c.fillStyle = INK; c.beginPath(); c.arc(48, 50, 4, 0, Math.PI * 2); c.fill();
  });
  make(scene, 'rr-ghost', 96, 96, (c) => {
    c.fillStyle = 'rgba(232,224,255,0.95)'; c.strokeStyle = INK; c.lineWidth = 4;
    c.beginPath(); c.moveTo(20, 84); c.lineTo(20, 44); c.arc(48, 44, 28, Math.PI, 0); c.lineTo(76, 84);
    for (let i = 0; i < 4; i++) { const x = 76 - i * 14; c.quadraticCurveTo(x - 4, 74, x - 7, 84); c.quadraticCurveTo(x - 10, 74, x - 14, 84); }
    c.closePath(); c.fill(); c.stroke();
    c.fillStyle = '#3a2a5a'; c.beginPath(); c.ellipse(38, 46, 5, 8, 0, 0, Math.PI * 2); c.ellipse(58, 46, 5, 8, 0, 0, Math.PI * 2); c.fill();
  });
  make(scene, 'rr-hand', 96, 96, (c) => {
    c.fillStyle = '#fff2d8'; c.strokeStyle = INK; c.lineWidth = 4;
    c.beginPath();
    c.moveTo(30, 86); c.lineTo(26, 52); c.quadraticCurveTo(24, 44, 31, 44); c.quadraticCurveTo(36, 44, 37, 52);
    c.lineTo(37, 22); c.quadraticCurveTo(37, 14, 44, 14); c.quadraticCurveTo(51, 14, 51, 22); c.lineTo(51, 42);
    c.lineTo(52, 30); c.quadraticCurveTo(53, 24, 59, 24); c.quadraticCurveTo(65, 24, 65, 31); c.lineTo(65, 46);
    c.lineTo(66, 38); c.quadraticCurveTo(67, 33, 72, 33); c.quadraticCurveTo(78, 34, 77, 41); c.lineTo(74, 72); c.quadraticCurveTo(70, 86, 58, 86); c.closePath();
    c.fill(); c.stroke();
  });
  make(scene, 'rr-lock', 64, 64, (c) => {
    c.strokeStyle = INK; c.lineWidth = 9; c.beginPath(); c.arc(32, 26, 13, Math.PI, 0); c.lineTo(45, 32); c.moveTo(19, 32); c.lineTo(19, 26); c.stroke();
    c.strokeStyle = '#a8a0a0'; c.lineWidth = 5; c.beginPath(); c.arc(32, 26, 13, Math.PI, 0); c.lineTo(45, 32); c.moveTo(19, 32); c.lineTo(19, 26); c.stroke();
    c.fillStyle = '#d8a440'; c.strokeStyle = INK; c.lineWidth = 3.5; c.beginPath(); c.roundRect(12, 30, 40, 28, 6); c.fill(); c.stroke();
    c.fillStyle = INK; c.beginPath(); c.arc(32, 42, 4, 0, Math.PI * 2); c.fill(); c.fillRect(30, 42, 4, 9);
  });
  make(scene, 'rr-clock', 64, 64, (c) => {
    c.fillStyle = '#fff2d8'; c.strokeStyle = INK; c.lineWidth = 4;
    c.beginPath(); c.arc(32, 34, 24, 0, Math.PI * 2); c.fill(); c.stroke();
    c.fillStyle = INK; c.fillRect(26, 4, 12, 7);
    c.lineWidth = 4; c.beginPath(); c.moveTo(32, 34); c.lineTo(32, 20); c.moveTo(32, 34); c.lineTo(42, 40); c.stroke();
  });
  make(scene, 'rr-crack', 64, 64, (c) => {
    c.fillStyle = '#8a7a66'; c.strokeStyle = INK; c.lineWidth = 3;
    c.beginPath(); c.roundRect(6, 10, 52, 44, 6); c.fill(); c.stroke();
    c.strokeStyle = '#1c130b'; c.lineWidth = 4;
    c.beginPath(); c.moveTo(30, 10); c.lineTo(26, 24); c.lineTo(36, 32); c.lineTo(28, 44); c.lineTo(34, 54); c.moveTo(36, 32); c.lineTo(52, 30); c.stroke();
    c.fillStyle = '#e8482a'; c.beginPath(); c.arc(50, 14, 9, 0, Math.PI * 2); c.fill();
    c.fillStyle = '#fff'; c.fillRect(48.5, 8, 3, 8); c.fillRect(48.5, 18, 3, 3);
  });
  make(scene, 'rr-gem', 64, 64, (c) => {
    c.strokeStyle = INK; c.lineWidth = 3;
    const g = c.createLinearGradient(0, 8, 0, 58); g.addColorStop(0, '#c8fcff'); g.addColorStop(1, '#2aa8d8');
    c.fillStyle = g;
    c.beginPath(); c.moveTo(32, 6); c.lineTo(54, 24); c.lineTo(32, 58); c.lineTo(10, 24); c.closePath(); c.fill(); c.stroke();
    c.beginPath(); c.moveTo(10, 24); c.lineTo(54, 24); c.moveTo(32, 6); c.lineTo(24, 24); c.lineTo(32, 58); c.lineTo(40, 24); c.closePath(); c.lineWidth = 1.5; c.stroke();
  });
  make(scene, 'rr-candle', 64, 64, (c) => {
    c.fillStyle = '#efe0b0'; c.strokeStyle = INK; c.lineWidth = 3;
    c.beginPath(); c.roundRect(22, 30, 20, 30, 4); c.fill(); c.stroke();
    flame(c, 32, 30, 10);
  });
  make(scene, 'rr-spark', 32, 32, (c) => {
    const g = c.createRadialGradient(16, 16, 0, 16, 16, 16);
    g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.4, 'rgba(255,255,255,0.7)'); g.addColorStop(1, 'rgba(255,255,255,0)');
    c.fillStyle = g; c.fillRect(0, 0, 32, 32);
  });
  make(scene, 'rr-star-small', 48, 48, (c) => star(c, 24, 25, 20));
  make(scene, 'rr-star-dim', 48, 48, (c) => star(c, 24, 25, 20, 0x5a5048, 'rgba(28,19,11,0.9)'));
  make(scene, 'rr-dot', 24, 24, (c) => { c.fillStyle = css(0xe8b84a, 0.95); c.strokeStyle = INK; c.lineWidth = 3; c.beginPath(); c.arc(12, 12, 7, 0, Math.PI * 2); c.fill(); c.stroke(); });
  // the dark round the light of the torch: clear in the middle, night at the edge
  make(scene, 'rr-dark', 256, 256, (c) => {
    const g = c.createRadialGradient(128, 128, 40, 128, 128, 128);
    g.addColorStop(0, 'rgba(6,4,2,0)'); g.addColorStop(0.55, 'rgba(6,4,2,0.25)'); g.addColorStop(1, 'rgba(6,4,2,0.82)');
    c.fillStyle = g; c.fillRect(0, 0, 256, 256);
  });
}
