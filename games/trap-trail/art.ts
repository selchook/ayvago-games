// Trap Trail: small flat textures drawn once on canvases (no image files): the dash, clock and
// padlock icons, the JUMP and DASH arrows, a soft spark for screen effects and the map's dotted
// trail. Made under the Ayvago intro (theme prebake) and again on demand if missing.
import Phaser from 'phaser';
import { INK, css, star } from './paint';

function make(scene: Phaser.Scene, key: string, w: number, h: number, draw: (c: CanvasRenderingContext2D) => void): void {
  if (scene.textures.exists(key)) return;
  const t = scene.textures.createCanvas(key, w, h);
  if (!t) return;
  draw(t.getContext());
  t.refresh();
}

export function makeArt(scene: Phaser.Scene): void {
  // a dash: a boot-shaped arrow with speed lines
  make(scene, 'tt-dash', 96, 96, (c) => {
    c.lineCap = 'round'; c.lineJoin = 'round';
    c.strokeStyle = '#ffffff'; c.lineWidth = 7;
    for (const [y, l] of [[30, 26], [48, 34], [66, 22]] as [number, number][]) { c.beginPath(); c.moveTo(12, y); c.lineTo(12 + l, y); c.stroke(); }
    c.fillStyle = '#ffffff'; c.strokeStyle = INK; c.lineWidth = 4;
    c.beginPath(); c.moveTo(44, 26); c.lineTo(86, 48); c.lineTo(44, 70); c.lineTo(52, 48); c.closePath(); c.fill(); c.stroke();
  });
  make(scene, 'tt-up', 96, 96, (c) => {
    c.lineJoin = 'round';
    c.fillStyle = '#ffffff'; c.strokeStyle = INK; c.lineWidth = 5;
    c.beginPath(); c.moveTo(48, 10); c.lineTo(84, 50); c.lineTo(62, 50); c.lineTo(62, 84); c.lineTo(34, 84); c.lineTo(34, 50); c.lineTo(12, 50); c.closePath(); c.fill(); c.stroke();
  });
  make(scene, 'tt-clock', 64, 64, (c) => {
    c.fillStyle = '#ffffff'; c.strokeStyle = INK; c.lineWidth = 4;
    c.beginPath(); c.arc(32, 34, 24, 0, Math.PI * 2); c.fill(); c.stroke();
    c.fillStyle = INK; c.fillRect(26, 4, 12, 7);
    c.lineCap = 'round'; c.lineWidth = 4; c.beginPath(); c.moveTo(32, 34); c.lineTo(32, 20); c.moveTo(32, 34); c.lineTo(42, 40); c.stroke();
  });
  make(scene, 'tt-lock', 64, 64, (c) => {
    c.strokeStyle = INK; c.lineWidth = 9; c.beginPath(); c.arc(32, 26, 13, Math.PI, 0); c.lineTo(45, 32); c.moveTo(19, 32); c.lineTo(19, 26); c.stroke();
    c.strokeStyle = '#c8ccd4'; c.lineWidth = 5; c.beginPath(); c.arc(32, 26, 13, Math.PI, 0); c.lineTo(45, 32); c.moveTo(19, 32); c.lineTo(19, 26); c.stroke();
    c.fillStyle = '#ffc83a'; c.strokeStyle = INK; c.lineWidth = 3.5; c.beginPath(); c.roundRect(12, 30, 40, 28, 6); c.fill(); c.stroke();
    c.fillStyle = INK; c.beginPath(); c.arc(32, 42, 4, 0, Math.PI * 2); c.fill(); c.fillRect(30, 42, 4, 9);
  });
  make(scene, 'tt-spark', 32, 32, (c) => {
    const g = c.createRadialGradient(16, 16, 0, 16, 16, 16);
    g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.4, 'rgba(255,255,255,0.7)'); g.addColorStop(1, 'rgba(255,255,255,0)');
    c.fillStyle = g; c.fillRect(0, 0, 32, 32);
  });
  make(scene, 'tt-star-small', 48, 48, (c) => star(c, 24, 25, 20));
  make(scene, 'tt-star-dim', 48, 48, (c) => star(c, 24, 25, 20, 0x6a7088, 'rgba(27,42,74,0.9)'));
  make(scene, 'tt-dot', 24, 24, (c) => { c.fillStyle = css(0xffffff, 0.9); c.strokeStyle = INK; c.lineWidth = 3; c.beginPath(); c.arc(12, 12, 7, 0, Math.PI * 2); c.fill(); c.stroke(); });
}
