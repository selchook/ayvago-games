// Coaster Rush: small icons drawn once into textures (the HUD's token, smiley, seat and flag, the
// six power-ups, the shop's upgrades) and the full-screen vignette of a derail.
import Phaser from 'phaser';
import type { Power } from './defs';
import type { UpgradeId } from './upgrades';
import { drawPowerIcon } from './view';

export const TOKEN_ICON = 'cr-token';
export const HAPPY_ICON = 'cr-happy';
export const SEAT_ICON = 'cr-seat';
export const VIGNETTE = 'cr-vignette';
export const POWER_ICON = (k: Power): string => 'cr-pw-' + k;
export const UPGRADE_ICON = (id: UpgradeId): string => 'cr-up-' + id;

function canvasIcon(scene: Phaser.Scene, key: string, draw: (g: CanvasRenderingContext2D, s: number) => void, size = 96): void {
  if (scene.textures.exists(key)) return;
  const cv = document.createElement('canvas');
  cv.width = cv.height = size;
  draw(cv.getContext('2d')!, size);
  scene.textures.addCanvas(key, cv);
}

/** The smiley: green and grinning when happy, red and frowning when not (frame = 0 … 4). */
export function happyKey(level: number): string { return HAPPY_ICON + Math.max(0, Math.min(4, level)); }

export function makeIcons(scene: Phaser.Scene): void {
  canvasIcon(scene, VIGNETTE, (g) => {
    const r = g.createRadialGradient(48, 48, 18, 48, 48, 68);
    r.addColorStop(0, 'rgba(255,255,255,0)');
    r.addColorStop(0.6, 'rgba(255,255,255,0.35)');
    r.addColorStop(1, 'rgba(255,255,255,1)');
    g.fillStyle = r; g.fillRect(0, 0, 96, 96);
  });
  canvasIcon(scene, TOKEN_ICON, (g, s) => {
    const c = s / 2;
    g.fillStyle = '#c07a10'; g.beginPath(); g.arc(c, c + 3, s * 0.44, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#ffc23a'; g.beginPath(); g.arc(c, c, s * 0.44, 0, Math.PI * 2); g.fill();
    g.strokeStyle = '#fff1a8'; g.lineWidth = s * 0.05; g.beginPath(); g.arc(c, c, s * 0.33, 0, Math.PI * 2); g.stroke();
    // a little coaster car on the token
    g.fillStyle = '#c0392b'; g.fillRect(c - s * 0.2, c - s * 0.04, s * 0.4, s * 0.14);
    g.beginPath(); g.moveTo(c - s * 0.2, c - s * 0.04); g.lineTo(c - s * 0.12, c - s * 0.16); g.lineTo(c + s * 0.18, c - s * 0.16); g.lineTo(c + s * 0.2, c - s * 0.04); g.fill();
    g.fillStyle = '#5a3a10'; g.beginPath(); g.arc(c - s * 0.11, c + s * 0.13, s * 0.05, 0, Math.PI * 2); g.arc(c + s * 0.11, c + s * 0.13, s * 0.05, 0, Math.PI * 2); g.fill();
  });
  for (let lv = 0; lv <= 4; lv++) {
    canvasIcon(scene, happyKey(lv), (g, s) => {
      const c = s / 2;
      const cols = ['#ff4a4a', '#ff8a3a', '#ffd23f', '#9be55a', '#3ad26a'];
      g.fillStyle = cols[lv]; g.beginPath(); g.arc(c, c, s * 0.44, 0, Math.PI * 2); g.fill();
      g.strokeStyle = 'rgba(0,0,0,0.25)'; g.lineWidth = s * 0.04; g.stroke();
      g.fillStyle = '#3a2a2a';
      g.beginPath(); g.ellipse(c - s * 0.15, c - s * 0.1, s * 0.05, s * 0.08, 0, 0, Math.PI * 2); g.ellipse(c + s * 0.15, c - s * 0.1, s * 0.05, s * 0.08, 0, 0, Math.PI * 2); g.fill();
      g.strokeStyle = '#3a2a2a'; g.lineWidth = s * 0.06; g.lineCap = 'round';
      g.beginPath();
      const curve = (lv - 2) * 0.09 * s;
      g.moveTo(c - s * 0.2, c + s * 0.15); g.quadraticCurveTo(c, c + s * 0.15 + curve, c + s * 0.2, c + s * 0.15); g.stroke();
    });
  }
  canvasIcon(scene, SEAT_ICON, (g, s) => {
    const u = s / 100;
    g.fillStyle = '#ffffff';
    g.beginPath(); g.arc(50 * u, 26 * u, 14 * u, 0, Math.PI * 2); g.fill();
    g.beginPath(); g.moveTo(28 * u, 78 * u); g.quadraticCurveTo(28 * u, 44 * u, 50 * u, 44 * u); g.quadraticCurveTo(72 * u, 44 * u, 72 * u, 78 * u); g.closePath(); g.fill();
    g.fillStyle = '#ff6a5a'; g.fillRect(16 * u, 70 * u, 68 * u, 16 * u);
  });
  for (const k of ['turbo', 'magnet', 'safety', 'slowmo', 'golden', 'balloon'] as Power[]) canvasIcon(scene, POWER_ICON(k), (g, s) => drawPowerIcon(g, s, k));
  const up = (id: UpgradeId, draw: (g: CanvasRenderingContext2D, u: number) => void) => canvasIcon(scene, UPGRADE_ICON(id), (g, s) => {
    const u = s / 100;
    g.fillStyle = '#2c2460'; g.beginPath(); g.arc(50 * u, 50 * u, 46 * u, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#ffffff'; g.strokeStyle = '#ffffff'; g.lineCap = 'round'; g.lineJoin = 'round';
    draw(g, u);
  });
  up('brakes', (g, u) => { g.lineWidth = 9 * u; g.beginPath(); g.arc(50 * u, 50 * u, 24 * u, 0, Math.PI * 2); g.stroke(); g.fillStyle = '#ff6a5a'; g.fillRect(24 * u, 44 * u, 52 * u, 12 * u); });
  up('grip', (g, u) => { g.lineWidth = 8 * u; g.beginPath(); g.arc(50 * u, 62 * u, 26 * u, Math.PI * 1.1, Math.PI * 1.9); g.stroke(); g.fillStyle = '#7dffa0'; g.beginPath(); g.arc(50 * u, 62 * u, 9 * u, 0, Math.PI * 2); g.fill(); });
  up('booster', (g, u) => { g.lineWidth = 9 * u; for (const y of [32, 54]) { g.beginPath(); g.moveTo(28 * u, (y + 16) * u); g.lineTo(50 * u, y * u); g.lineTo(72 * u, (y + 16) * u); g.stroke(); } });
  up('lift', (g, u) => { g.lineWidth = 7 * u; g.beginPath(); g.moveTo(22 * u, 78 * u); g.lineTo(78 * u, 26 * u); g.stroke(); g.fillStyle = '#ffd23f'; for (let k = 0; k < 4; k++) g.fillRect((28 + k * 13) * u, (66 - k * 12) * u, 8 * u, 8 * u); });
  up('cars', (g, u) => { g.fillStyle = '#ff6a5a'; for (let k = 0; k < 3; k++) g.fillRect((16 + k * 24) * u, 44 * u, 20 * u, 16 * u); g.fillStyle = '#ffffff'; for (let k = 0; k < 3; k++) { g.beginPath(); g.arc((21 + k * 24) * u, 64 * u, 4 * u, 0, Math.PI * 2); g.arc((31 + k * 24) * u, 64 * u, 4 * u, 0, Math.PI * 2); g.fill(); } });
  up('magnet', (g, u) => { g.lineWidth = 12 * u; g.beginPath(); g.arc(50 * u, 46 * u, 18 * u, Math.PI, 0); g.lineTo(68 * u, 72 * u); g.moveTo(32 * u, 46 * u); g.lineTo(32 * u, 72 * u); g.stroke(); });
  up('safety', (g, u) => { g.beginPath(); g.moveTo(50 * u, 20 * u); g.lineTo(74 * u, 30 * u); g.lineTo(70 * u, 60 * u); g.lineTo(50 * u, 80 * u); g.lineTo(30 * u, 60 * u); g.lineTo(26 * u, 30 * u); g.closePath(); g.fill(); });
  up('comfort', (g, u) => { g.fillStyle = '#9ad4ff'; g.fillRect(26 * u, 30 * u, 16 * u, 44 * u); g.fillRect(26 * u, 58 * u, 50 * u, 16 * u); g.fillStyle = '#ffffff'; g.fillRect(30 * u, 80 * u, 6 * u, 8 * u); g.fillRect(66 * u, 80 * u, 6 * u, 8 * u); });
}
