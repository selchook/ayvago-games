// Zombie Grove: the UI icons (weapons, evolutions, trinkets, camp upgrades, power-ups, coins, the
// skull, the moon, the chest, the lock and the card offer), drawn once per game into canvas
// textures: simple vector symbols over a glowing disc in the item's colour. The power-up icons are
// also the pickups' billboards in the 3D world (powerCanvas).
import Phaser from 'phaser';
import { WEAPON_IDS, PASSIVE_IDS, POWER_IDS, type WeaponId, type PassiveId, type PowerId } from './defs';
import { UPGRADE_IDS, type UpgradeId } from './meta';

export const weaponArt = (id: WeaponId, evo = false) => (evo ? 'zg-e-' : 'zg-w-') + id;
export const passiveArt = (id: PassiveId) => 'zg-p-' + id;
export const upgradeArt = (id: UpgradeId) => 'zg-u-' + id;
export const powerArt = (id: PowerId) => 'zg-pw-' + id;
export const CHEST = 'zg-chest';
export const LOCK = 'zg-lock';
export const INFINITY = 'zg-inf';
export const COIN = 'zg-coin';
export const SKULL = 'zg-skull';
export const MOON = 'zg-moon';
export const SUN = 'zg-sun';
export const OFFER = 'zg-offer';
export const HEAL = 'zg-c-heal';
export const GOLD = 'zg-c-gold';
export const HEART = 'zg-heart';

export const WEAPON_HUE: Record<WeaponId, number> = {
  blade: 0xdfe8ff, bow: 0x9fe870, spear: 0xffd27a, blaster: 0xffb04a, wards: 0x6ac8ff, torch: 0xff7a3a, robot: 0x9fb8ff, shield: 0xc8a0ff,
};
/** The power-ups' colours (glow, beacon ring, HUD timer ring). */
export const POWER_HUE: Record<PowerId, number> = {
  heal: 0xff7a5a, vacuum: 0x7ab8ff, nuke: 0xffe07a, freeze: 0x8fe8ff, rage: 0xff4a5a, boots: 0x6affb0,
};
export const PASSIVE_HUE: Record<PassiveId, number> = {
  swift: 0x6affd0, vigor: 0xff8a5a, regen: 0x8aff7a, magnet: 0xff5a6a, armor: 0xc8a070, haste: 0xc8d4e8, reach: 0xffa040, luck: 0x5aff7a,
};

type G = CanvasRenderingContext2D;
const S = 128;
const css = (c: number, a = 1) => `rgba(${(c >> 16) & 255},${(c >> 8) & 255},${c & 255},${a})`;

function icon(scene: Phaser.Scene, key: string, draw: (g: G) => void, size = 128): void {
  if (scene.textures.exists(key)) return;
  const tex = scene.textures.createCanvas(key, size, size);
  if (!tex) return;
  const g = tex.getContext();
  g.save();
  g.scale(size / S, size / S);
  draw(g);
  g.restore();
  tex.refresh();
}

function disc(g: G, hue: number, gold = false): void {
  const r = g.createRadialGradient(64, 58, 6, 64, 64, 62);
  r.addColorStop(0, css(hue, 0.55));
  r.addColorStop(0.55, css(hue, 0.18));
  r.addColorStop(1, css(hue, 0));
  g.fillStyle = r;
  g.fillRect(0, 0, S, S);
  if (gold) {
    g.strokeStyle = 'rgba(255,214,90,0.9)';
    g.lineWidth = 5;
    g.beginPath(); g.arc(64, 64, 56, 0, Math.PI * 2); g.stroke();
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      star(g, 64 + Math.cos(a) * 54, 64 + Math.sin(a) * 54, 6, '#fff3b0');
    }
  }
}

function path(g: G, pts: number[][], fill: string | null, stroke?: string, lw = 6): void {
  g.beginPath();
  pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y)));
  g.closePath();
  if (fill) { g.fillStyle = fill; g.fill(); }
  if (stroke) { g.lineWidth = lw; g.lineJoin = 'round'; g.strokeStyle = stroke; g.stroke(); }
}
function line(g: G, x1: number, y1: number, x2: number, y2: number, c: string, lw = 7): void {
  g.beginPath(); g.moveTo(x1, y1); g.lineTo(x2, y2); g.lineWidth = lw; g.lineCap = 'round'; g.strokeStyle = c; g.stroke();
}
function circle(g: G, x: number, y: number, r: number, fill: string | null, stroke?: string, lw = 6): void {
  g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2);
  if (fill) { g.fillStyle = fill; g.fill(); }
  if (stroke) { g.lineWidth = lw; g.strokeStyle = stroke; g.stroke(); }
}
function star(g: G, x: number, y: number, r: number, c: string): void {
  const pts: number[][] = [];
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i / 10) * Math.PI * 2, rr = i % 2 ? r * 0.45 : r;
    pts.push([x + Math.cos(a) * rr, y + Math.sin(a) * rr]);
  }
  path(g, pts, c);
}
const OUT = '#1a1410';

// ------------------------------------------------------------------ symbols

function sword(g: G, big = false): void {
  g.save(); g.translate(64, 64); g.rotate(-Math.PI / 4); if (big) g.scale(1.1, 1.1);
  path(g, [[-7, -48], [0, -58], [7, -48], [7, 18], [-7, 18]], '#eef4ff', OUT, 5);
  line(g, 0, -46, 0, 14, '#b8c8e8', 3);
  path(g, [[-22, 18], [22, 18], [22, 27], [-22, 27]], '#c88a3a', OUT, 5);
  path(g, [[-5, 27], [5, 27], [5, 48], [-5, 48]], '#7a4a2a', OUT, 5);
  circle(g, 0, 52, 7, '#ffd25a', OUT, 4);
  g.restore();
}
function bow(g: G): void {
  g.save(); g.translate(64, 64); g.rotate(-Math.PI / 4);
  g.beginPath(); g.arc(-26, 0, 50, -1.05, 1.05); g.lineWidth = 14; g.strokeStyle = OUT; g.stroke();
  g.beginPath(); g.arc(-26, 0, 50, -1.05, 1.05); g.lineWidth = 8; g.strokeStyle = '#a8703a'; g.stroke();
  line(g, -1, -43, -1, 43, '#f4ead0', 3);
  line(g, -40, 0, 46, 0, OUT, 9);
  line(g, -40, 0, 44, 0, '#d8c8a0', 4);
  path(g, [[44, -9], [60, 0], [44, 9]], '#dfe8ff', OUT, 4);
  path(g, [[-44, -8], [-32, 0], [-44, 8], [-52, 8], [-42, 0], [-52, -8]], '#9fe870', OUT, 3);
  g.restore();
}
function spear(g: G): void {
  g.save(); g.translate(64, 64); g.rotate(-Math.PI / 4);
  line(g, 0, -30, 0, 58, OUT, 12);
  line(g, 0, -30, 0, 56, '#b07840', 6);
  path(g, [[0, -60], [12, -34], [0, -26], [-12, -34]], '#e8f0ff', OUT, 5);
  path(g, [[-9, -22], [9, -22], [9, -16], [-9, -16]], '#ffd27a', OUT, 3);
  g.restore();
}
function blaster(g: G): void {
  g.save(); g.translate(64, 66);
  path(g, [[-44, -22], [40, -22], [46, -14], [46, 0], [-8, 0], [-14, 30], [-34, 30], [-30, 0], [-44, 0]], '#8a8fb0', OUT, 6);
  path(g, [[40, -18], [56, -18], [56, -6], [40, -6]], '#5a5f80', OUT, 5);
  circle(g, -14, -11, 6, '#ffb04a');
  line(g, -36, -14, 30, -14, 'rgba(255,255,255,0.35)', 4);
  g.restore();
}
function shield(g: G, gold = false): void {
  circle(g, 64, 64, 44, gold ? '#ffd25a' : '#6a7ad0', OUT, 7);
  circle(g, 64, 64, 30, '#e07a3a', OUT, 5);
  circle(g, 64, 64, 14, gold ? '#fff3b0' : '#9fb0ff', OUT, 5);
}
function torch(g: G, big = false): void {
  g.save(); g.translate(64, 66); g.rotate(0.35);
  path(g, [[-7, -8], [7, -8], [5, 50], [-5, 50]], '#8a5a2a', OUT, 5);
  path(g, [[-11, -16], [11, -16], [9, -6], [-9, -6]], '#5a3a1a', OUT, 4);
  const s = big ? 1.3 : 1;
  path(g, [[0, -60 * s], [18 * s, -30 * s], [12 * s, -14], [-12 * s, -14], [-18 * s, -30 * s]], '#ff6a2a', OUT, 5);
  path(g, [[0, -44 * s], [9 * s, -26 * s], [5, -16], [-5, -16], [-9 * s, -26 * s]], '#ffd25a');
  g.restore();
}
function robot(g: G, gold = false): void {
  line(g, 64, 22, 64, 34, OUT, 8);
  circle(g, 64, 20, 8, '#ffd25a', OUT, 4);
  path(g, [[30, 34], [98, 34], [98, 86], [30, 86]], gold ? '#ffd27a' : '#9fb0e8', OUT, 7);
  circle(g, 50, 58, 10, '#ffffff', OUT, 4); circle(g, 78, 58, 10, '#ffffff', OUT, 4);
  circle(g, 50, 58, 4, '#3ad8ff'); circle(g, 78, 58, 4, '#3ad8ff');
  line(g, 48, 76, 80, 76, OUT, 5);
  path(g, [[40, 90], [88, 90], [92, 110], [36, 110]], gold ? '#e0b050' : '#7a8ac8', OUT, 6);
}
function boot(g: G): void {
  path(g, [[40, 22], [70, 22], [70, 70], [104, 82], [104, 102], [34, 102]], '#a8703a', OUT, 7);
  line(g, 36, 92, 102, 92, '#6a4020', 6);
  line(g, 20, 50, 34, 50, '#6affd0', 6); line(g, 14, 66, 32, 66, '#6affd0', 6);
}
function bowl(g: G): void {
  path(g, [[22, 62], [106, 62], [94, 96], [34, 96]], '#d0844a', OUT, 7);
  g.beginPath(); g.ellipse(64, 62, 42, 10, 0, 0, Math.PI * 2); g.fillStyle = '#ffb07a'; g.fill(); g.lineWidth = 5; g.strokeStyle = OUT; g.stroke();
  for (const x of [46, 64, 82]) { g.beginPath(); g.moveTo(x, 50); g.quadraticCurveTo(x - 8, 38, x, 26); g.quadraticCurveTo(x + 8, 16, x, 8); g.lineWidth = 5; g.strokeStyle = 'rgba(255,255,255,0.8)'; g.stroke(); }
}
function cup(g: G): void {
  path(g, [[30, 50], [90, 50], [84, 100], [36, 100]], '#e8f0ff', OUT, 7);
  g.beginPath(); g.arc(94, 70, 13, -1.2, 1.2); g.lineWidth = 7; g.strokeStyle = OUT; g.stroke();
  g.beginPath(); g.ellipse(60, 52, 28, 6, 0, 0, Math.PI * 2); g.fillStyle = '#7ac04a'; g.fill();
  path(g, [[60, 20], [80, 30], [66, 44], [52, 34]], '#5ad04a', OUT, 4);
}
function magnet(g: G): void {
  g.lineCap = 'butt';
  g.beginPath(); g.arc(64, 58, 30, Math.PI, 0); g.lineWidth = 26; g.strokeStyle = OUT; g.stroke();
  g.beginPath(); g.arc(64, 58, 30, Math.PI, 0); g.lineWidth = 18; g.strokeStyle = '#ff4a5a'; g.stroke();
  path(g, [[25, 58], [43, 58], [43, 96], [25, 96]], '#e8f0ff', OUT, 5);
  path(g, [[85, 58], [103, 58], [103, 96], [85, 96]], '#e8f0ff', OUT, 5);
}
function vest(g: G): void {
  path(g, [[36, 24], [54, 24], [64, 40], [74, 24], [92, 24], [104, 46], [96, 104], [32, 104], [24, 46]], '#b0804a', OUT, 7);
  line(g, 64, 42, 64, 102, OUT, 5);
  for (const y of [56, 72, 88]) circle(g, 72, y, 4, '#ffd27a');
}
function whetstone(g: G): void {
  path(g, [[20, 70], [96, 46], [108, 66], [32, 90]], '#9aa8c0', OUT, 7);
  line(g, 30, 74, 98, 54, 'rgba(255,255,255,0.4)', 4);
  for (const [x, y] of [[40, 34], [60, 26], [78, 30]]) star(g, x, y, 9, '#fff3b0');
}
function charm(g: G): void {
  g.beginPath(); g.arc(64, 30, 22, 0.3, Math.PI - 0.3); g.lineWidth = 4; g.strokeStyle = '#ffd27a'; g.stroke();
  path(g, [[64, 46], [88, 72], [64, 106], [40, 72]], '#ff8a3a', OUT, 6);
  path(g, [[64, 56], [78, 72], [64, 92], [50, 72]], '#ffd25a');
  for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2; line(g, 64 + Math.cos(a) * 46, 76 + Math.sin(a) * 46, 64 + Math.cos(a) * 54, 76 + Math.sin(a) * 54, '#ffb05a', 4); }
}
function clover(g: G): void {
  line(g, 64, 66, 76, 110, '#3a8a2a', 7);
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
    g.save(); g.translate(64 + Math.cos(a) * 22, 62 + Math.sin(a) * 22); g.rotate(a + Math.PI / 4);
    g.beginPath(); g.moveTo(0, 0); g.bezierCurveTo(-24, -10, -14, -34, 0, -18); g.bezierCurveTo(14, -34, 24, -10, 0, 0);
    g.fillStyle = '#5ad04a'; g.fill(); g.lineWidth = 4; g.strokeStyle = OUT; g.stroke();
    g.restore();
  }
  circle(g, 64, 62, 6, '#8aff7a');
}
function meal(g: G): void {
  g.beginPath(); g.ellipse(64, 84, 46, 16, 0, 0, Math.PI * 2); g.fillStyle = '#e8f0ff'; g.fill(); g.lineWidth = 5; g.strokeStyle = OUT; g.stroke();
  g.beginPath(); g.ellipse(58, 64, 30, 22, -0.4, 0, Math.PI * 2); g.fillStyle = '#c8743a'; g.fill(); g.lineWidth = 5; g.strokeStyle = OUT; g.stroke();
  line(g, 80, 50, 102, 34, '#f4ead0', 9); circle(g, 104, 32, 7, '#f4ead0', OUT, 3);
  circle(g, 30, 40, 9, '#ff3b5c');
}
function pouch(g: G): void {
  path(g, [[40, 40], [88, 40], [102, 96], [64, 108], [26, 96]], '#a8703a', OUT, 7);
  line(g, 44, 42, 84, 42, '#6a4020', 8);
  circle(g, 64, 76, 16, '#ffd23f', OUT, 5);
  g.font = 'bold 22px sans-serif'; g.fillStyle = '#a06a10'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('$', 64, 77);
}
function coin(g: G): void {
  circle(g, 64, 64, 50, '#ffd23f', OUT, 8);
  circle(g, 64, 64, 34, '#ffe68a', '#c8901a', 5);
  star(g, 64, 64, 18, '#c8901a');
}
function skull(g: G): void {
  g.beginPath(); g.arc(64, 54, 40, Math.PI * 0.85, Math.PI * 0.15); g.lineTo(88, 96); g.lineTo(40, 96); g.closePath();
  g.fillStyle = '#e8f0e0'; g.fill(); g.lineWidth = 7; g.strokeStyle = OUT; g.stroke();
  circle(g, 48, 58, 11, '#3a8a2a'); circle(g, 80, 58, 11, '#3a8a2a');
  path(g, [[64, 70], [70, 82], [58, 82]], OUT);
  for (const x of [52, 64, 76]) line(g, x, 90, x, 98, OUT, 4);
}
function moon(g: G): void {
  g.beginPath(); g.arc(64, 64, 44, 0, Math.PI * 2); g.fillStyle = '#e8ecff'; g.fill();
  g.globalCompositeOperation = 'destination-out';
  g.beginPath(); g.arc(84, 52, 40, 0, Math.PI * 2); g.fill();
  g.globalCompositeOperation = 'source-over';
  star(g, 96, 90, 9, '#fff3b0'); star(g, 104, 30, 6, '#fff3b0');
}
function sun(g: G): void {
  for (let i = 0; i < 12; i++) { const a = (i / 12) * Math.PI * 2; line(g, 64 + Math.cos(a) * 36, 64 + Math.sin(a) * 36, 64 + Math.cos(a) * 54, 64 + Math.sin(a) * 54, '#ffd25a', 7); }
  circle(g, 64, 64, 28, '#ffe68a', '#ff9a3a', 6);
}
function offer(g: G): void {
  g.save(); g.translate(64, 70);
  for (const [a, c] of [[-0.35, '#4fc0ff'], [0.35, '#d27bff'], [0, '#ffc83f']] as [number, string][]) {
    g.save(); g.rotate(a);
    path(g, [[-24, -40], [24, -40], [24, 40], [-24, 40]], '#1f2a22', c, 7);
    g.restore();
  }
  star(g, 0, 0, 20, '#fff3b0');
  g.restore();
}
function heart(g: G, c = '#ff3b5c'): void {
  g.translate(64, 66);
  g.beginPath(); g.moveTo(0, 38); g.bezierCurveTo(-62, -2, -36, -56, 0, -24); g.bezierCurveTo(36, -56, 62, -2, 0, 38); g.closePath();
  g.fillStyle = c; g.fill(); g.lineWidth = 7; g.strokeStyle = OUT; g.stroke();
  g.translate(-64, -66);
}
function fist(g: G): void {
  sword(g, true);
  for (let i = 0; i < 3; i++) line(g, 22 + i * 14, 100, 30 + i * 14, 112, '#ff6a4a', 6);
}
function arrows(g: G): void {
  g.lineWidth = 10; g.strokeStyle = '#8fd8ff'; g.lineCap = 'round';
  g.beginPath(); g.arc(64, 64, 34, -0.3, Math.PI - 0.6); g.stroke();
  g.beginPath(); g.arc(64, 64, 34, Math.PI - 0.3, Math.PI * 2 - 0.6); g.stroke();
  path(g, [[100, 58], [110, 80], [86, 76]], '#8fd8ff');
  path(g, [[28, 70], [18, 48], [42, 52]], '#8fd8ff');
}
function wing(g: G): void {
  path(g, [[24, 92], [40, 40], [70, 18], [106, 22], [88, 40], [104, 46], [84, 60], [96, 70], [70, 80]], '#fff3d0', OUT, 6);
  line(g, 30, 88, 80, 34, '#ffb03a', 4);
}

function towerShield(g: G, gold = false): void {
  path(g, [[34, 20], [94, 20], [100, 30], [96, 92], [64, 112], [32, 92], [28, 30]], gold ? '#ffd25a' : '#8a6ad0', OUT, 7);
  path(g, [[44, 32], [84, 32], [86, 86], [64, 100], [42, 86]], gold ? '#fff0b0' : '#e07a3a', OUT, 4);
  path(g, [[56, 52], [72, 52], [72, 72], [56, 72]], gold ? '#ffd25a' : '#f4ead0', OUT, 4);
  if (gold) for (let i = 0; i < 3; i++) line(g, 18 + i * 8, 102 - i * 10, 28 + i * 8, 96 - i * 10, '#8aff7a', 5);
}
function helmet(g: G): void {
  g.beginPath(); g.arc(64, 70, 40, Math.PI, 0); g.lineTo(104, 92); g.lineTo(24, 92); g.closePath();
  g.fillStyle = '#9aa8c0'; g.fill(); g.lineWidth = 7; g.strokeStyle = OUT; g.stroke();
  path(g, [[58, 30], [70, 30], [70, 92], [58, 92]], '#c8d4e8', OUT, 4);
  path(g, [[20, 90], [108, 90], [108, 102], [20, 102]], '#6a7890', OUT, 5);
}
function book(g: G): void {
  path(g, [[20, 40], [62, 30], [62, 100], [20, 108]], '#5ad0a0', OUT, 6);
  path(g, [[106, 40], [66, 30], [66, 100], [106, 108]], '#4ab088', OUT, 6);
  for (const y of [50, 62, 74]) { line(g, 30, y, 54, y - 5, '#e8fff0', 3); line(g, 74, y - 5, 96, y, '#e8fff0', 3); }
  path(g, [[64, 4], [80, 22], [70, 22], [70, 30], [58, 30], [58, 22], [48, 22]], '#fff07a', OUT, 4);
}
function crosshair(g: G): void {
  circle(g, 64, 64, 38, null, OUT, 12); circle(g, 64, 64, 38, null, '#ff5a6a', 6);
  circle(g, 64, 64, 18, null, OUT, 10); circle(g, 64, 64, 18, null, '#ffd0d4', 4);
  for (const [a, b, c, d] of [[64, 6, 64, 30], [64, 98, 64, 122], [6, 64, 30, 64], [98, 64, 122, 64]]) { line(g, a, b, c, d, OUT, 10); line(g, a, b, c, d, '#ff5a6a', 5); }
  circle(g, 64, 64, 5, '#ffffff');
}
function rings(g: G): void {
  for (const [r, a] of [[48, 0.45], [34, 0.75], [20, 1]] as [number, number][]) { circle(g, 64, 64, r, null, OUT, 10); circle(g, 64, 64, r, null, `rgba(255,170,70,${a})`, 6); }
  circle(g, 64, 64, 8, '#fff0b0');
}
function hourglass(g: G): void {
  path(g, [[34, 18], [94, 18], [94, 28], [34, 28]], '#a8703a', OUT, 5);
  path(g, [[34, 100], [94, 100], [94, 110], [34, 110]], '#a8703a', OUT, 5);
  path(g, [[40, 28], [88, 28], [68, 64], [88, 100], [40, 100], [60, 64]], '#e8f4ff', OUT, 6);
  path(g, [[50, 36], [78, 36], [64, 58]], '#ffd27a');
  path(g, [[64, 74], [80, 98], [48, 98]], '#ffd27a');
}
function drill(g: G): void {
  g.save(); g.scale(0.85, 0.85); g.translate(4, 18); sword(g); g.restore();
  for (let i = 0; i < 2; i++) path(g, [[78, 46 - i * 18], [96, 28 - i * 18], [114, 46 - i * 18], [106, 52 - i * 18], [96, 42 - i * 18], [86, 52 - i * 18]], '#7affc0', OUT, 4);
}
function banishCard(g: G): void {
  g.save(); g.translate(64, 66); g.rotate(-0.15);
  path(g, [[-28, -42], [28, -42], [28, 42], [-28, 42]], '#1f2a22', '#c9d4c0', 7);
  star(g, 0, 0, 16, '#e2ead8');
  g.restore();
  line(g, 30, 30, 98, 102, OUT, 18); line(g, 98, 30, 30, 102, OUT, 18);
  line(g, 30, 30, 98, 102, '#ff4a5a', 10); line(g, 98, 30, 30, 102, '#ff4a5a', 10);
}
function bloodMoon(g: G): void {
  const r = g.createRadialGradient(56, 54, 6, 64, 64, 46);
  r.addColorStop(0, '#ff8a7a'); r.addColorStop(1, '#a01a2a');
  circle(g, 64, 64, 42, null, OUT, 7);
  g.beginPath(); g.arc(64, 64, 42, 0, Math.PI * 2); g.fillStyle = r; g.fill();
  circle(g, 50, 52, 7, 'rgba(90,0,10,0.45)'); circle(g, 76, 74, 10, 'rgba(90,0,10,0.45)'); circle(g, 72, 44, 4, 'rgba(90,0,10,0.45)');
  for (const x of [40, 64, 88]) path(g, [[x - 5, 104], [x + 5, 104], [x, 120]], '#c01a2a');
}
function vacuum(g: G): void {
  g.lineCap = 'round';
  for (let i = 0; i < 3; i++) {
    g.beginPath(); g.arc(64, 64, 18 + i * 14, i * 0.9, i * 0.9 + Math.PI * 1.3);
    g.lineWidth = 11; g.strokeStyle = OUT; g.stroke();
    g.lineWidth = 6; g.strokeStyle = ['#e8f4ff', '#9fd0ff', '#5a9aff'][i]; g.stroke();
  }
  for (const [x, y, c] of [[22, 30, '#5affb0'], [104, 40, '#4fb4ff'], [96, 104, '#ff5ad2']] as [number, number, string][]) path(g, [[x, y - 9], [x + 6, y], [x, y + 9], [x - 6, y]], c, OUT, 3);
}
function flare(g: G): void {
  g.save(); g.translate(64, 70); g.rotate(0.5);
  path(g, [[-9, -10], [9, -10], [9, 46], [-9, 46]], '#e83a3a', OUT, 6);
  path(g, [[-9, 22], [9, 22], [9, 30], [-9, 30]], '#f4ead0');
  g.restore();
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2;
    line(g, 44 + Math.cos(a) * 14, 40 + Math.sin(a) * 14, 44 + Math.cos(a) * (i % 2 ? 24 : 34), 40 + Math.sin(a) * (i % 2 ? 24 : 34), '#ffe07a', 6);
  }
  circle(g, 44, 40, 13, '#ffffff', '#ffb03a', 5);
}
function bell(g: G): void {
  line(g, 64, 14, 64, 26, OUT, 8);
  g.beginPath(); g.moveTo(26, 92); g.quadraticCurveTo(34, 84, 36, 60); g.quadraticCurveTo(38, 26, 64, 24); g.quadraticCurveTo(90, 26, 92, 60); g.quadraticCurveTo(94, 84, 102, 92); g.closePath();
  g.fillStyle = '#bfefff'; g.fill(); g.lineWidth = 7; g.strokeStyle = OUT; g.stroke();
  line(g, 42, 46, 50, 78, 'rgba(255,255,255,0.8)', 6);
  path(g, [[22, 90], [106, 90], [106, 100], [22, 100]], '#7ad0f0', OUT, 5);
  circle(g, 64, 108, 9, '#ffd25a', OUT, 4);
  for (const [x, y] of [[16, 40], [110, 52], [104, 18]]) star(g, x, y, 8, '#e8fbff');
}
function tonic(g: G): void {
  path(g, [[54, 14], [74, 14], [74, 24], [54, 24]], '#a8703a', OUT, 5);
  path(g, [[56, 24], [72, 24], [72, 42], [98, 70], [92, 108], [36, 108], [30, 70], [56, 42]], '#ffd0d0', OUT, 7);
  path(g, [[36, 74], [92, 74], [88, 104], [40, 104]], '#ff3a4a');
  line(g, 44, 80, 48, 98, 'rgba(255,255,255,0.6)', 5);
  for (const [x, y] of [[62, 62], [78, 56], [70, 46]]) circle(g, x, y, 4, '#ff8a8a');
}
function wingedBoot(g: G): void {
  boot(g);
  path(g, [[70, 36], [96, 20], [118, 22], [104, 32], [116, 36], [100, 44], [108, 50], [78, 54]], '#ffffff', OUT, 4);
}
function chest(g: G): void {
  path(g, [[16, 56], [112, 56], [112, 112], [16, 112]], '#a8703a', OUT, 7);
  g.beginPath(); g.moveTo(16, 56); g.quadraticCurveTo(16, 22, 64, 22); g.quadraticCurveTo(112, 22, 112, 56); g.closePath();
  g.fillStyle = '#c8843a'; g.fill(); g.lineWidth = 7; g.strokeStyle = OUT; g.stroke();
  for (const x of [34, 94]) path(g, [[x - 6, 26], [x + 6, 26], [x + 6, 110], [x - 6, 110]], '#ffd23f', OUT, 4);
  path(g, [[52, 48], [76, 48], [76, 72], [52, 72]], '#ffe68a', OUT, 5);
  circle(g, 64, 62, 4, OUT);
}
function lock(g: G): void {
  g.beginPath(); g.arc(64, 50, 22, Math.PI, 0); g.lineWidth = 16; g.strokeStyle = OUT; g.stroke();
  g.beginPath(); g.arc(64, 50, 22, Math.PI, 0); g.lineWidth = 9; g.strokeStyle = '#c8d4e8'; g.stroke();
  line(g, 42, 50, 42, 60, '#c8d4e8', 9); line(g, 86, 50, 86, 60, '#c8d4e8', 9);
  path(g, [[30, 58], [98, 58], [98, 110], [30, 110]], '#ffd23f', OUT, 7);
  circle(g, 64, 80, 8, OUT); path(g, [[60, 82], [68, 82], [70, 98], [58, 98]], OUT);
}
function infinity(g: G): void {
  g.lineWidth = 16; g.strokeStyle = OUT; g.lineCap = 'round';
  const loop = () => { g.beginPath(); g.moveTo(64, 64); g.bezierCurveTo(84, 30, 120, 40, 112, 64); g.bezierCurveTo(104, 92, 80, 88, 64, 64); g.bezierCurveTo(48, 40, 24, 36, 16, 64); g.bezierCurveTo(10, 90, 46, 96, 64, 64); g.stroke(); };
  loop(); g.lineWidth = 9; g.strokeStyle = '#ff8a6a'; loop();
}

const WEAPON_DRAW: Record<WeaponId, (g: G, evo: boolean) => void> = {
  blade: (g, e) => sword(g, e), bow: (g) => bow(g), spear: (g) => spear(g), blaster: (g) => blaster(g),
  wards: (g, e) => shield(g, e), torch: (g, e) => torch(g, e), robot: (g, e) => robot(g, e), shield: (g, e) => towerShield(g, e),
};
const POWER_DRAW: Record<PowerId, (g: G) => void> = {
  heal: bowl, vacuum, nuke: flare, freeze: bell, rage: tonic, boots: wingedBoot,
};
const PASSIVE_DRAW: Record<PassiveId, (g: G) => void> = {
  swift: boot, vigor: bowl, regen: cup, magnet, armor: vest, haste: whetstone, reach: charm, luck: clover,
};
const UPGRADE_DRAW: Record<UpgradeId, [number, (g: G) => void]> = {
  might: [0xff6a4a, fist], vitality: [0xff3b5c, (g) => heart(g)], swiftness: [0x6affd0, boot], lodestone: [0xff5a6a, magnet],
  greed: [0xffd23f, pouch], reroll: [0x8fd8ff, arrows], secondWind: [0xffb03a, wing],
  toughness: [0x9aa8c0, helmet], growth: [0x5affb0, book], precision: [0xff5a6a, crosshair], breadth: [0xffa040, rings],
  quickHands: [0xffd27a, hourglass], drill: [0x7affc0, drill], banish: [0xff4a5a, banishCard], curse: [0xc01a2a, bloodMoon],
};

/** A power-up's icon on a canvas (the 3D pickups' billboards; drawn once per page). */
const powerCanvases = new Map<PowerId, HTMLCanvasElement>();
export function powerCanvas(id: PowerId): HTMLCanvasElement {
  let cv = powerCanvases.get(id);
  if (cv) return cv;
  cv = document.createElement('canvas');
  cv.width = cv.height = 128;
  const g = cv.getContext('2d')!;
  // a white rim keeps the icon readable over the dark grass
  const r = g.createRadialGradient(64, 64, 30, 64, 64, 64);
  r.addColorStop(0, css(POWER_HUE[id], 0.9)); r.addColorStop(0.7, css(POWER_HUE[id], 0.35)); r.addColorStop(1, css(POWER_HUE[id], 0));
  g.fillStyle = r; g.fillRect(0, 0, 128, 128);
  circle(g, 64, 64, 50, 'rgba(20,24,30,0.78)', '#ffffff', 5);
  g.save(); g.translate(64, 64); g.scale(0.78, 0.78); g.translate(-64, -64); POWER_DRAW[id](g); g.restore();
  powerCanvases.set(id, cv);
  return cv;
}

export function makeArt(scene: Phaser.Scene): void {
  for (const id of WEAPON_IDS) {
    icon(scene, weaponArt(id), (g) => { disc(g, WEAPON_HUE[id]); WEAPON_DRAW[id](g, false); });
    icon(scene, weaponArt(id, true), (g) => { disc(g, 0xffc83f, true); WEAPON_DRAW[id](g, true); });
  }
  for (const id of PASSIVE_IDS) icon(scene, passiveArt(id), (g) => { disc(g, PASSIVE_HUE[id]); PASSIVE_DRAW[id](g); });
  for (const id of UPGRADE_IDS) icon(scene, upgradeArt(id), (g) => { disc(g, UPGRADE_DRAW[id][0]); UPGRADE_DRAW[id][1](g); });
  for (const id of POWER_IDS) icon(scene, powerArt(id), (g) => { disc(g, POWER_HUE[id]); POWER_DRAW[id](g); });
  icon(scene, CHEST, (g) => { disc(g, 0xffd23f); chest(g); });
  icon(scene, LOCK, lock, 64);
  icon(scene, INFINITY, infinity, 64);
  icon(scene, HEAL, (g) => { disc(g, 0xff8a5a); meal(g); });
  icon(scene, GOLD, (g) => { disc(g, 0xffd23f); pouch(g); });
  icon(scene, COIN, coin, 64);
  icon(scene, SKULL, skull, 64);
  icon(scene, MOON, moon, 64);
  icon(scene, SUN, sun, 64);
  icon(scene, OFFER, offer);
  icon(scene, HEART, (g) => heart(g), 64);
}

/** The icon of a draft card. */
export function cardArt(kind: string, id: string): string {
  if (kind === 'weapon') return weaponArt(id as WeaponId);
  if (kind === 'evo') return weaponArt(id as WeaponId, true);
  if (kind === 'passive') return passiveArt(id as PassiveId);
  return kind === 'heal' ? HEAL : GOLD;
}
