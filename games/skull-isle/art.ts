// Skull Isle: the UI icons (power-ups, dock-shop goods, boons, treasure-map nodes, gold, doubloons,
// hearts, the boss skull), drawn once per game into canvas textures: simple vector symbols over a
// glowing disc in the item's colour.
import Phaser from 'phaser';
import { POWER_IDS, POWER_COLOR, SEA_POWERS, SEA_POWER_COLOR, ROUTES, type PowerId, type SeaPower, type Route } from './defs';
import { SHOP_IDS, SHIP_IDS, BOON_IDS, NODES, type ShopId, type ShipId, type BoonId, type NodeId } from './upgrades';

export const powerArt = (id: PowerId) => 'si-pw-' + id;
export const shopArt = (id: ShopId | 'patch') => 'si-shop-' + id;
export const boonArt = (id: BoonId) => 'si-boon-' + id;
export const nodeArt = (id: NodeId) => 'si-node-' + id;
export const GOLD = 'si-gold';
export const DOUBLOON = 'si-doubloon';
export const HEART = 'si-heart';
export const SKULL = 'si-skull';
export const LOCK = 'si-lock';
export const MAP = 'si-map';
export const WAVE = 'si-wave';
export const seaPowerArt = (id: SeaPower) => 'si-sea-' + id;
export const shipArt = (id: ShipId | 'repair') => 'si-ship-' + id;
export const routeArt = (id: Route) => 'si-route-' + id;
export const SHIP = 'si-shipicon';

type G = CanvasRenderingContext2D;
const S = 128;
const css = (c: number, a = 1) => `rgba(${(c >> 16) & 255},${(c >> 8) & 255},${c & 255},${a})`;

function icon(scene: Phaser.Scene, key: string, draw: (g: G) => void): void {
  if (scene.textures.exists(key)) return;
  const tex = scene.textures.createCanvas(key, S, S);
  if (!tex) return;
  const g = tex.getContext();
  g.lineJoin = 'round';
  g.lineCap = 'round';
  draw(g);
  tex.refresh();
}

function disc(g: G, hue: number): void {
  const r = g.createRadialGradient(64, 58, 6, 64, 64, 62);
  r.addColorStop(0, css(hue, 0.55));
  r.addColorStop(0.55, css(hue, 0.2));
  r.addColorStop(1, css(hue, 0));
  g.fillStyle = r;
  g.fillRect(0, 0, S, S);
}

/** Fills the current path with a colour and a dark outline. */
function ink(g: G, fill: string, line = 6): void {
  g.lineWidth = line;
  g.strokeStyle = 'rgba(20,12,8,0.9)';
  g.stroke();
  g.fillStyle = fill;
  g.fill();
}

// ------------------------------------------------------------------ symbols

const SYM: Record<string, (g: G) => void> = {
  heart: (g) => {
    g.beginPath(); g.moveTo(64, 104); g.bezierCurveTo(10, 66, 22, 18, 64, 42); g.bezierCurveTo(106, 18, 118, 66, 64, 104); g.closePath();
    ink(g, '#ff4a5e');
    g.beginPath(); g.arc(46, 50, 7, 0, Math.PI * 2); g.fillStyle = 'rgba(255,255,255,0.7)'; g.fill();
  },
  sword: (g) => {
    g.save(); g.translate(64, 64); g.rotate(-Math.PI / 4);
    g.beginPath(); g.moveTo(-7, 20); g.lineTo(-7, -44); g.lineTo(0, -56); g.lineTo(7, -44); g.lineTo(7, 20); g.closePath(); ink(g, '#e8eef8');
    g.beginPath(); g.rect(-22, 18, 44, 9); ink(g, '#f2b134', 5);
    g.beginPath(); g.rect(-5, 27, 10, 22); ink(g, '#7a4a24', 5);
    g.restore();
  },
  cutlass: (g) => {
    g.save(); g.translate(64, 64); g.rotate(-Math.PI / 5);
    g.beginPath(); g.moveTo(-6, 18); g.quadraticCurveTo(-14, -20, 10, -54); g.quadraticCurveTo(14, -18, 8, 18); g.closePath(); ink(g, '#e8eef8');
    g.beginPath(); g.ellipse(0, 24, 20, 9, 0, 0, Math.PI * 2); ink(g, '#f2b134', 5);
    g.beginPath(); g.rect(-5, 30, 10, 20); ink(g, '#7a4a24', 5);
    g.restore();
  },
  slashes: (g) => {
    for (let i = 0; i < 3; i++) {
      g.beginPath(); g.arc(64, 64, 22 + i * 14, -Math.PI * 0.9, -Math.PI * 0.2);
      g.lineWidth = 12; g.strokeStyle = 'rgba(20,12,8,0.9)'; g.stroke();
      g.lineWidth = 7; g.strokeStyle = i === 2 ? '#ffd25a' : '#e8f4ff'; g.stroke();
    }
  },
  boot: (g) => {
    g.beginPath(); g.moveTo(40, 22); g.lineTo(70, 22); g.lineTo(70, 74); g.lineTo(104, 84); g.quadraticCurveTo(110, 104, 96, 104); g.lineTo(36, 104); g.closePath(); ink(g, '#8a5a34');
    for (let i = 0; i < 3; i++) { g.beginPath(); g.moveTo(10, 50 + i * 16); g.lineTo(30, 50 + i * 16); g.lineWidth = 6; g.strokeStyle = '#bfe8ff'; g.stroke(); }
  },
  bolt: (g) => { g.beginPath(); g.moveTo(74, 10); g.lineTo(34, 70); g.lineTo(60, 70); g.lineTo(50, 118); g.lineTo(94, 52); g.lineTo(66, 52); g.closePath(); ink(g, '#ffd23f'); },
  magnet: (g) => {
    g.lineWidth = 30; g.strokeStyle = 'rgba(20,12,8,0.9)'; g.beginPath(); g.arc(64, 58, 30, Math.PI, 0, true); g.stroke();
    g.lineWidth = 22; g.strokeStyle = '#ff3b4f'; g.beginPath(); g.arc(64, 58, 30, Math.PI, 0, true); g.stroke();
    g.beginPath(); g.rect(23, 56, 22, 30); ink(g, '#e8eef8', 5); g.beginPath(); g.rect(83, 56, 22, 30); ink(g, '#e8eef8', 5);
  },
  star: (g) => {
    g.beginPath();
    for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + (i / 10) * Math.PI * 2, r = i % 2 ? 22 : 50; g.lineTo(64 + Math.cos(a) * r, 64 + Math.sin(a) * r); }
    g.closePath(); ink(g, '#ffe24a');
  },
  cross: (g) => { g.beginPath(); g.roundRect(48, 18, 32, 92, 8); g.roundRect(18, 48, 92, 32, 8); ink(g, '#7affa0'); },
  coin: (g) => {
    g.beginPath(); g.arc(64, 64, 42, 0, Math.PI * 2); ink(g, '#ffc83a', 7);
    g.beginPath(); g.arc(64, 64, 30, 0, Math.PI * 2); g.lineWidth = 5; g.strokeStyle = '#e09a14'; g.stroke();
    g.beginPath(); g.arc(52, 50, 8, 0, Math.PI * 2); g.fillStyle = 'rgba(255,255,255,0.7)'; g.fill();
  },
  doubloon: (g) => {
    g.beginPath(); g.arc(64, 64, 44, 0, Math.PI * 2); ink(g, '#ffb21a', 7);
    g.beginPath(); g.arc(64, 64, 33, 0, Math.PI * 2); g.lineWidth = 4; g.strokeStyle = '#a86a08'; g.stroke();
    // a cross of Spanish gold
    g.beginPath(); g.rect(58, 40, 12, 48); g.rect(40, 58, 48, 12); g.fillStyle = '#a86a08'; g.fill();
  },
  skull: (g) => {
    g.beginPath(); g.arc(64, 54, 38, Math.PI * 0.85, Math.PI * 0.15); g.lineTo(88, 98); g.lineTo(40, 98); g.closePath(); ink(g, '#f4ecd8');
    g.fillStyle = '#1a0c08';
    g.beginPath(); g.ellipse(48, 58, 10, 12, 0, 0, Math.PI * 2); g.fill();
    g.beginPath(); g.ellipse(80, 58, 10, 12, 0, 0, Math.PI * 2); g.fill();
    g.beginPath(); g.moveTo(64, 70); g.lineTo(58, 82); g.lineTo(70, 82); g.closePath(); g.fill();
    for (let i = 0; i < 3; i++) g.fillRect(50 + i * 11, 90, 4, 10);
  },
  bottle: (g) => {
    g.beginPath(); g.moveTo(54, 14); g.lineTo(74, 14); g.lineTo(74, 40); g.quadraticCurveTo(96, 50, 96, 76); g.lineTo(96, 108); g.lineTo(32, 108); g.lineTo(32, 76); g.quadraticCurveTo(32, 50, 54, 40); g.closePath(); ink(g, '#a0582a');
    g.beginPath(); g.rect(36, 68, 56, 26); g.fillStyle = '#f4e2b0'; g.fill();
    g.beginPath(); g.rect(52, 6, 24, 12); ink(g, '#c8a070', 4);
  },
  barrel: (g) => {
    g.beginPath(); g.moveTo(36, 20); g.quadraticCurveTo(24, 64, 36, 108); g.lineTo(92, 108); g.quadraticCurveTo(104, 64, 92, 20); g.closePath(); ink(g, '#9a6234');
    g.fillStyle = '#4a4a52';
    for (const y of [32, 92]) g.fillRect(30, y, 68, 8);
    g.beginPath(); g.moveTo(64, 20); g.quadraticCurveTo(74, 6, 86, 10); g.lineWidth = 4; g.strokeStyle = '#3a2a1a'; g.stroke();
    g.beginPath(); g.arc(88, 10, 7, 0, Math.PI * 2); g.fillStyle = '#ffb040'; g.fill();
  },
  parrot: (g) => {
    g.beginPath(); g.ellipse(60, 70, 26, 34, -0.3, 0, Math.PI * 2); ink(g, '#3ac850');
    g.beginPath(); g.moveTo(44, 88); g.lineTo(28, 118); g.lineTo(56, 98); g.closePath(); ink(g, '#2a7ad0', 5);
    g.beginPath(); g.arc(74, 40, 18, 0, Math.PI * 2); ink(g, '#3ac850');
    g.beginPath(); g.moveTo(88, 38); g.quadraticCurveTo(108, 40, 96, 58); g.lineTo(86, 48); g.closePath(); ink(g, '#ffb21a', 5);
    g.beginPath(); g.arc(76, 36, 6, 0, Math.PI * 2); g.fillStyle = '#fff'; g.fill();
    g.beginPath(); g.arc(77, 36, 3, 0, Math.PI * 2); g.fillStyle = '#111'; g.fill();
    g.beginPath(); g.moveTo(66, 24); g.lineTo(62, 8); g.lineTo(74, 20); g.lineTo(78, 6); g.lineTo(82, 24); g.closePath(); ink(g, '#ff4a3a', 4);
  },
  ghost: (g) => {
    g.beginPath(); g.moveTo(30, 108); g.lineTo(30, 56); g.arc(64, 56, 34, Math.PI, 0); g.lineTo(98, 108); g.lineTo(87, 98); g.lineTo(76, 108); g.lineTo(64, 98); g.lineTo(52, 108); g.lineTo(41, 98); g.closePath();
    ink(g, 'rgba(180,245,255,0.95)');
    g.fillStyle = '#1a3a4a';
    g.beginPath(); g.ellipse(52, 58, 7, 10, 0, 0, Math.PI * 2); g.fill();
    g.beginPath(); g.ellipse(76, 58, 7, 10, 0, 0, Math.PI * 2); g.fill();
  },
  coins: (g) => {
    for (const [x, y] of [[44, 78], [84, 78], [64, 50]]) { g.beginPath(); g.arc(x, y, 26, 0, Math.PI * 2); ink(g, '#ffc83a', 6); g.beginPath(); g.arc(x, y, 16, 0, Math.PI * 2); g.lineWidth = 4; g.strokeStyle = '#e09a14'; g.stroke(); }
    g.font = '900 34px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.lineWidth = 6; g.strokeStyle = '#1a0c08'; g.strokeText('×2', 64, 108); g.fillStyle = '#fff'; g.fillText('×2', 64, 108);
  },
  fish: (g) => {
    g.beginPath(); g.ellipse(58, 64, 40, 22, 0, 0, Math.PI * 2); ink(g, '#6ab4e8');
    g.beginPath(); g.moveTo(94, 64); g.lineTo(118, 42); g.lineTo(118, 86); g.closePath(); ink(g, '#4a90c8', 5);
    g.beginPath(); g.arc(34, 58, 5, 0, Math.PI * 2); g.fillStyle = '#111'; g.fill();
    g.beginPath(); g.moveTo(40, 72); g.quadraticCurveTo(64, 80, 86, 70); g.lineWidth = 4; g.strokeStyle = '#d8f0ff'; g.stroke();
  },
  fang: (g) => {
    g.beginPath(); g.moveTo(30, 30); g.lineTo(98, 30); g.lineTo(80, 108); g.lineTo(64, 60); g.lineTo(48, 108); g.closePath(); ink(g, '#f4ecd8');
    g.beginPath(); g.arc(64, 40, 8, 0, Math.PI * 2); g.fillStyle = '#c81a3a'; g.fill();
  },
  shield: (g) => {
    g.beginPath(); g.moveTo(64, 14); g.lineTo(104, 30); g.quadraticCurveTo(104, 88, 64, 114); g.quadraticCurveTo(24, 88, 24, 30); g.closePath(); ink(g, '#9aa8b8');
    g.beginPath(); g.moveTo(64, 28); g.lineTo(64, 100); g.moveTo(36, 54); g.lineTo(92, 54); g.lineWidth = 8; g.strokeStyle = '#4a5868'; g.stroke();
  },
  swirl: (g) => {
    for (let i = 0; i < 3; i++) {
      g.beginPath(); g.arc(64, 64, 16 + i * 15, i * 2, i * 2 + Math.PI * 1.3);
      g.lineWidth = 11; g.strokeStyle = 'rgba(20,12,8,0.9)'; g.stroke();
      g.lineWidth = 6; g.strokeStyle = '#bff4ff'; g.stroke();
    }
  },
  wind: (g) => {
    g.beginPath(); g.arc(64, 64, 36, 0, Math.PI * 2); ink(g, '#ffe8c0');
    g.beginPath(); g.moveTo(64, 34); g.lineTo(64, 64); g.lineTo(84, 76); g.lineWidth = 8; g.strokeStyle = '#7a3a1a'; g.stroke();
    g.beginPath(); g.arc(64, 64, 52, -0.5, 1.2); g.lineWidth = 7; g.strokeStyle = '#7affa0'; g.stroke();
  },
  anchor: (g) => {
    g.beginPath(); g.arc(64, 26, 12, 0, Math.PI * 2); g.lineWidth = 10; g.strokeStyle = 'rgba(20,12,8,0.9)'; g.stroke(); g.lineWidth = 6; g.strokeStyle = '#c8d0d8'; g.stroke();
    g.beginPath(); g.moveTo(64, 38); g.lineTo(64, 106); g.moveTo(40, 52); g.lineTo(88, 52); g.moveTo(26, 78); g.quadraticCurveTo(30, 106, 64, 106); g.quadraticCurveTo(98, 106, 102, 78);
    g.lineWidth = 14; g.strokeStyle = 'rgba(20,12,8,0.9)'; g.stroke(); g.lineWidth = 8; g.strokeStyle = '#c8d0d8'; g.stroke();
  },
  cannon: (g) => {
    g.save(); g.translate(64, 64); g.rotate(-0.4);
    g.beginPath(); g.roundRect(-46, -16, 84, 32, 14); ink(g, '#3a3a44');
    g.beginPath(); g.arc(-40, 0, 14, 0, Math.PI * 2); ink(g, '#3a3a44', 5);
    g.restore();
    g.beginPath(); g.arc(46, 92, 16, 0, Math.PI * 2); ink(g, '#8a5a34', 5);
    g.beginPath(); g.arc(98, 34, 9, 0, Math.PI * 2); g.fillStyle = '#ffb040'; g.fill();
  },
  hook: (g) => {
    g.beginPath(); g.moveTo(64, 10); g.lineTo(64, 70); g.arc(46, 70, 18, 0, Math.PI, false); g.lineTo(28, 58);
    g.lineWidth = 16; g.strokeStyle = 'rgba(20,12,8,0.9)'; g.stroke(); g.lineWidth = 10; g.strokeStyle = '#c8d0d8'; g.stroke();
    for (let i = 0; i < 4; i++) { g.beginPath(); g.arc(82 + (i % 2) * 14, 86 + Math.floor(i / 2) * 18, 9, 0, Math.PI * 2); ink(g, '#ffc83a', 4); }
  },
  powderKid: (g) => {
    SYM.barrel(g);
    g.beginPath(); g.arc(100, 96, 16, 0, Math.PI * 2); ink(g, '#ffd23f', 5);
    g.font = '900 24px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = '#1a0c08'; g.fillText('2', 100, 97);
  },
  lock: (g) => {
    g.beginPath(); g.arc(64, 52, 22, Math.PI, 0); g.lineWidth = 14; g.strokeStyle = 'rgba(20,12,8,0.9)'; g.stroke(); g.lineWidth = 9; g.strokeStyle = '#c8d0d8'; g.stroke();
    g.beginPath(); g.roundRect(32, 52, 64, 52, 10); ink(g, '#ffc83a');
    g.beginPath(); g.arc(64, 74, 7, 0, Math.PI * 2); g.fillStyle = '#5a3a08'; g.fill(); g.fillRect(61, 76, 6, 14);
  },
  map: (g) => {
    g.beginPath(); g.moveTo(16, 30); g.lineTo(46, 20); g.lineTo(82, 32); g.lineTo(112, 22); g.lineTo(112, 98); g.lineTo(82, 108); g.lineTo(46, 96); g.lineTo(16, 106); g.closePath(); ink(g, '#f2dca0');
    g.setLineDash([6, 6]); g.beginPath(); g.moveTo(28, 90); g.quadraticCurveTo(50, 50, 82, 70); g.lineWidth = 4; g.strokeStyle = '#a0502a'; g.stroke(); g.setLineDash([]);
    g.beginPath(); g.moveTo(84, 54); g.lineTo(100, 70); g.moveTo(100, 54); g.lineTo(84, 70); g.lineWidth = 7; g.strokeStyle = '#d02a1a'; g.stroke();
  },
  sail: (g) => {
    g.beginPath(); g.moveTo(58, 10); g.lineTo(58, 112); g.lineWidth = 10; g.strokeStyle = 'rgba(20,12,8,0.9)'; g.stroke(); g.lineWidth = 6; g.strokeStyle = '#8a5a34'; g.stroke();
    g.beginPath(); g.moveTo(62, 18); g.quadraticCurveTo(112, 50, 62, 92); g.closePath(); ink(g, '#f4ecd8');
    g.beginPath(); g.moveTo(54, 26); g.quadraticCurveTo(20, 56, 54, 84); g.closePath(); ink(g, '#e8dcc0', 5);
  },
  windSail: (g) => {
    SYM.sail(g);
    for (let i = 0; i < 3; i++) { g.beginPath(); g.moveTo(6, 36 + i * 22); g.quadraticCurveTo(22, 30 + i * 22, 36, 38 + i * 22); g.lineWidth = 6; g.strokeStyle = '#7ad8ff'; g.stroke(); }
  },
  chain: (g) => {
    g.beginPath(); g.moveTo(36, 78); g.lineTo(92, 50); g.lineWidth = 14; g.strokeStyle = 'rgba(20,12,8,0.9)'; g.stroke(); g.lineWidth = 8; g.strokeStyle = '#9aa0b0'; g.stroke();
    for (let i = 0; i < 4; i++) { g.beginPath(); g.ellipse(44 + i * 14, 74 - i * 7, 7, 4, -0.45, 0, Math.PI * 2); g.lineWidth = 3; g.strokeStyle = '#d8dce8'; g.stroke(); }
    g.beginPath(); g.arc(32, 82, 20, 0, Math.PI * 2); ink(g, '#3a3a44');
    g.beginPath(); g.arc(96, 46, 20, 0, Math.PI * 2); ink(g, '#3a3a44');
    g.beginPath(); g.arc(26, 76, 6, 0, Math.PI * 2); g.arc(90, 40, 6, 0, Math.PI * 2); g.fillStyle = 'rgba(255,255,255,0.5)'; g.fill();
  },
  shell: (g) => {
    g.beginPath(); g.moveTo(64, 104); g.lineTo(22, 52); g.quadraticCurveTo(64, -6, 106, 52); g.closePath(); ink(g, '#ffb8c8');
    for (const a of [-0.55, -0.27, 0, 0.27, 0.55]) { g.beginPath(); g.moveTo(64, 100); g.lineTo(64 + Math.sin(a) * 52, 100 - Math.cos(a) * 70); g.lineWidth = 4; g.strokeStyle = '#d0708a'; g.stroke(); }
    g.beginPath(); g.roundRect(48, 98, 32, 16, 6); ink(g, '#ffb8c8', 5);
    g.beginPath(); g.arc(64, 60, 9, 0, Math.PI * 2); g.fillStyle = '#ffffff'; g.fill();
  },
  fireball: (g) => {
    g.beginPath(); g.moveTo(16, 30); g.quadraticCurveTo(50, 40, 60, 46); g.quadraticCurveTo(30, 60, 20, 70); g.quadraticCurveTo(50, 70, 58, 74); g.quadraticCurveTo(36, 96, 34, 104); g.lineTo(84, 84); g.closePath(); ink(g, '#ff8a2a');
    g.beginPath(); g.arc(78, 70, 30, 0, Math.PI * 2); ink(g, '#3a3a44');
    g.beginPath(); g.arc(70, 62, 9, 0, Math.PI * 2); g.fillStyle = 'rgba(255,200,120,0.7)'; g.fill();
  },
  spyglass: (g) => {
    g.save(); g.translate(64, 64); g.rotate(-0.6);
    g.beginPath(); g.roundRect(-52, -12, 40, 24, 6); ink(g, '#a0602a');
    g.beginPath(); g.roundRect(-14, -16, 36, 32, 6); ink(g, '#ffc83a');
    g.beginPath(); g.roundRect(20, -20, 32, 40, 6); ink(g, '#a0602a');
    g.beginPath(); g.ellipse(52, 0, 6, 18, 0, 0, Math.PI * 2); g.fillStyle = '#bff4ff'; g.fill();
    g.restore();
  },
  hull: (g) => {
    g.beginPath(); g.moveTo(10, 62); g.lineTo(118, 62); g.lineTo(98, 104); g.lineTo(28, 104); g.closePath(); ink(g, '#9a6234');
    g.fillStyle = '#6a4024'; g.fillRect(24, 76, 82, 6);
    for (const x of [38, 58, 78]) { g.beginPath(); g.arc(x, 90, 5, 0, Math.PI * 2); g.fillStyle = '#2a1a10'; g.fill(); }
    g.beginPath(); g.moveTo(40, 58); g.lineTo(40, 14); g.lineTo(84, 50); g.closePath(); ink(g, '#f4ecd8', 5);
  },
  ship: (g) => {
    g.beginPath(); g.moveTo(14, 70); g.lineTo(114, 70); g.lineTo(96, 104); g.lineTo(30, 104); g.closePath(); ink(g, '#9a6234');
    g.beginPath(); g.moveTo(62, 66); g.lineTo(62, 12); g.lineWidth = 7; g.strokeStyle = '#5a3a1a'; g.stroke();
    g.beginPath(); g.moveTo(66, 16); g.quadraticCurveTo(100, 40, 66, 62); g.closePath(); ink(g, '#f4ecd8', 5);
    g.beginPath(); g.moveTo(58, 22); g.quadraticCurveTo(30, 42, 58, 60); g.closePath(); ink(g, '#f4ecd8', 5);
    g.beginPath(); g.moveTo(62, 12); g.lineTo(80, 8); g.lineTo(62, 4); g.closePath(); g.fillStyle = '#1a0c08'; g.fill();
  },
  net: (g) => {
    g.beginPath(); g.arc(64, 64, 46, 0, Math.PI * 2); g.lineWidth = 10; g.strokeStyle = 'rgba(20,12,8,0.9)'; g.stroke(); g.lineWidth = 6; g.strokeStyle = '#c8a070'; g.stroke();
    g.save(); g.beginPath(); g.arc(64, 64, 44, 0, Math.PI * 2); g.clip();
    g.lineWidth = 4; g.strokeStyle = '#e8d0a0';
    for (let i = -3; i <= 3; i++) { g.beginPath(); g.moveTo(20, 64 + i * 14 - 40); g.lineTo(108, 64 + i * 14 + 40); g.stroke(); g.beginPath(); g.moveTo(20, 64 + i * 14 + 40); g.lineTo(108, 64 + i * 14 - 40); g.stroke(); }
    g.restore();
    g.beginPath(); g.arc(70, 72, 12, 0, Math.PI * 2); ink(g, '#ffc83a', 4);
  },
  figurehead: (g) => {
    g.beginPath(); g.moveTo(98, 110); g.quadraticCurveTo(100, 60, 70, 40); g.quadraticCurveTo(54, 30, 44, 40); g.quadraticCurveTo(34, 52, 46, 60); g.quadraticCurveTo(30, 72, 40, 84); g.quadraticCurveTo(60, 92, 66, 110); g.closePath(); ink(g, '#ffc83a');
    g.beginPath(); g.arc(56, 46, 5, 0, Math.PI * 2); g.fillStyle = '#5a3a08'; g.fill();
    g.beginPath(); g.moveTo(70, 30); g.lineTo(76, 14); g.lineTo(84, 28); g.lineTo(94, 16); g.lineTo(94, 36); g.closePath(); ink(g, '#fff0a0', 4);
  },
  swimmer: (g) => {
    for (let i = 0; i < 2; i++) {
      g.beginPath();
      for (let x = 14; x <= 114; x += 4) g.lineTo(x, 74 + i * 24 + Math.sin(x / 10 + i) * 6);
      g.lineWidth = 10; g.strokeStyle = 'rgba(20,12,8,0.9)'; g.stroke(); g.lineWidth = 6; g.strokeStyle = '#7ad8ff'; g.stroke();
    }
    for (const [x, y, r] of [[40, 40, 12], [66, 26, 9], [86, 46, 14]] as [number, number, number][]) { g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.lineWidth = 5; g.strokeStyle = '#d8f6ff'; g.stroke(); g.beginPath(); g.arc(x - r * 0.35, y - r * 0.35, r * 0.25, 0, Math.PI * 2); g.fillStyle = '#ffffff'; g.fill(); }
  },
  hammer: (g) => {
    g.save(); g.translate(64, 64); g.rotate(-0.7);
    g.beginPath(); g.roundRect(-7, -14, 14, 70, 5); ink(g, '#8a5a34');
    g.beginPath(); g.roundRect(-32, -40, 64, 28, 6); ink(g, '#9aa8b8');
    g.restore();
    g.beginPath(); g.arc(98, 98, 12, 0, Math.PI * 2); ink(g, '#7affa0', 4);
  },
  calm: (g) => {
    g.beginPath(); g.arc(80, 44, 24, 0, Math.PI * 2); ink(g, '#ffd23f');
    for (let i = 0; i < 8; i++) { const a = i * Math.PI / 4; g.beginPath(); g.moveTo(80 + Math.cos(a) * 30, 44 + Math.sin(a) * 30); g.lineTo(80 + Math.cos(a) * 40, 44 + Math.sin(a) * 40); g.lineWidth = 5; g.strokeStyle = '#ffd23f'; g.stroke(); }
    for (let i = 0; i < 2; i++) { g.beginPath(); for (let x = 10; x <= 118; x += 4) g.lineTo(x, 88 + i * 18 + Math.sin(x / 14) * 3); g.lineWidth = 9; g.strokeStyle = 'rgba(20,12,8,0.9)'; g.stroke(); g.lineWidth = 5; g.strokeStyle = '#7ad8ff'; g.stroke(); }
  },
  storm: (g) => {
    g.beginPath(); g.arc(44, 46, 20, Math.PI * 0.5, Math.PI * 1.5); g.arc(66, 32, 24, Math.PI, 0); g.arc(92, 48, 18, Math.PI * 1.5, Math.PI * 0.5); g.closePath(); ink(g, '#8a96a8');
    g.beginPath(); g.moveTo(70, 62); g.lineTo(56, 84); g.lineTo(68, 84); g.lineTo(58, 106); g.lineTo(84, 76); g.lineTo(72, 76); g.lineTo(80, 62); g.closePath(); ink(g, '#ffe24a', 4);
    for (let i = 0; i < 4; i++) { g.beginPath(); g.moveTo(26 + i * 10, 74 + (i % 2) * 6); g.lineTo(20 + i * 10, 92 + (i % 2) * 6); g.lineWidth = 4; g.strokeStyle = '#9fd8ff'; g.stroke(); }
    g.beginPath(); for (let x = 10; x <= 118; x += 4) g.lineTo(x, 112 + Math.sin(x / 8) * 6); g.lineWidth = 9; g.strokeStyle = 'rgba(20,12,8,0.9)'; g.stroke(); g.lineWidth = 5; g.strokeStyle = '#5aa8d8'; g.stroke();
  },
  wave: (g) => {
    for (let i = 0; i < 3; i++) {
      g.beginPath();
      for (let x = 14; x <= 114; x += 4) g.lineTo(x, 44 + i * 22 + Math.sin(x / 10) * 7);
      g.lineWidth = 10; g.strokeStyle = 'rgba(20,12,8,0.9)'; g.stroke(); g.lineWidth = 6; g.strokeStyle = '#7ad8ff'; g.stroke();
    }
  },
};

const POWER_SYM: Record<PowerId, string> = { rum: 'bottle', keg: 'barrel', parrot: 'parrot', shield: 'ghost', gold2: 'coins', fury: 'cutlass', fish: 'fish' };
const SHOP_SYM: Record<ShopId | 'patch', [string, number]> = {
  hp: ['heart', 0xff5a6a], dmg: ['sword', 0xdfe8ff], combo: ['slashes', 0xffd25a], dodge: ['boot', 0x9fe8ff],
  charge: ['bolt', 0xffd23f], magnet: ['magnet', 0xff5a6a], crit: ['star', 0xffe24a], patch: ['cross', 0x7affa0],
};
export const BOON_SYM: Record<BoonId, [string, number]> = {
  vampire: ['fang', 0xff3a5a], thunder: ['bolt', 0x9fd8ff], ironclad: ['shield', 0xb8c8d8], cursedGold: ['coins', 0x9aff6a],
  powder: ['barrel', 0xff7a3a], ernest: ['parrot', 0x6fe36a], rumRunner: ['bottle', 0xffa94d], quickdraw: ['cutlass', 0xff4f7b],
  whirlwind: ['swirl', 0x7fe8ff], secondWind: ['wind', 0xfff0a0],
};
const NODE_SYM: Record<NodeId, [string, number]> = {
  hardy: ['heart', 0xff5a6a], whetstone: ['sword', 0xdfe8ff], nimble: ['boot', 0x9fe8ff], gunpowder: ['bolt', 0xffd23f], secondWind: ['wind', 0xfff0a0],
  seaLegs: ['anchor', 0x7ad8ff], luckyCoin: ['coin', 0xffd23f], lootHook: ['hook', 0xffc83a], powderMonkey: ['powderKid', 0xff7a3a], cannonDrill: ['cannon', 0xff9a5a],
};

const SEA_SYM: Record<SeaPower, string> = { wind: 'windSail', chain: 'chain', mermaid: 'shell', fire: 'fireball', spyglass: 'spyglass' };
const SHIP_SYM: Record<ShipId | 'repair', [string, number]> = {
  hull: ['hull', 0xc89a5a], cannon: ['cannon', 0xff9a5a], sails: ['sail', 0xbff6ff], net: ['net', 0xffd23f], figurehead: ['figurehead', 0xffc83a], swim: ['swimmer', 0x7ad8ff], repair: ['hammer', 0x7affa0],
};

/** Draws every icon once (cheap; each scene that shows icons calls it). */
export function makeArt(scene: Phaser.Scene): void {
  for (const id of POWER_IDS) icon(scene, powerArt(id), (g) => { disc(g, POWER_COLOR[id]); SYM[POWER_SYM[id]](g); });
  for (const id of [...SHOP_IDS, 'patch'] as const) icon(scene, shopArt(id), (g) => { disc(g, SHOP_SYM[id][1]); SYM[SHOP_SYM[id][0]](g); });
  for (const id of BOON_IDS) icon(scene, boonArt(id), (g) => { disc(g, BOON_SYM[id][1]); SYM[BOON_SYM[id][0]](g); });
  for (const n of NODES) icon(scene, nodeArt(n.id), (g) => { disc(g, NODE_SYM[n.id][1]); SYM[NODE_SYM[n.id][0]](g); });
  for (const id of SEA_POWERS) icon(scene, seaPowerArt(id), (g) => { disc(g, SEA_POWER_COLOR[id]); SYM[SEA_SYM[id]](g); });
  for (const id of [...SHIP_IDS, 'repair'] as const) icon(scene, shipArt(id), (g) => { disc(g, SHIP_SYM[id][1]); SYM[SHIP_SYM[id][0]](g); });
  for (const id of ROUTES) icon(scene, routeArt(id), (g) => { disc(g, id === 'calm' ? 0x7ad8ff : 0x8a96a8); SYM[id](g); });
  icon(scene, SHIP, SYM.ship);
  icon(scene, GOLD, SYM.coin);
  icon(scene, DOUBLOON, SYM.doubloon);
  icon(scene, HEART, SYM.heart);
  icon(scene, SKULL, SYM.skull);
  icon(scene, LOCK, SYM.lock);
  icon(scene, MAP, SYM.map);
  icon(scene, WAVE, SYM.wave);
}
