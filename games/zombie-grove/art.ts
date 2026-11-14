// Zombie Grove: the UI icons (weapons, evolutions, trinkets, camp upgrades, heroes, coins, the
// skull, the moon and the card offer), drawn once per game into canvas textures: simple vector
// symbols over a glowing disc in the item's colour.
import Phaser from 'phaser';
import { WEAPON_IDS, PASSIVE_IDS, HERO_IDS, type WeaponId, type PassiveId, type HeroId } from './defs';
import { UPGRADE_IDS, type UpgradeId } from './meta';

export const weaponArt = (id: WeaponId, evo = false) => (evo ? 'zg-e-' : 'zg-w-') + id;
export const passiveArt = (id: PassiveId) => 'zg-p-' + id;
export const upgradeArt = (id: UpgradeId) => 'zg-u-' + id;
export const heroArt = (id: HeroId) => 'zg-h-' + id;
export const COIN = 'zg-coin';
export const SKULL = 'zg-skull';
export const MOON = 'zg-moon';
export const SUN = 'zg-sun';
export const OFFER = 'zg-offer';
export const HEAL = 'zg-c-heal';
export const GOLD = 'zg-c-gold';
export const HEART = 'zg-heart';

export const WEAPON_HUE: Record<WeaponId, number> = {
  blade: 0xdfe8ff, bow: 0x9fe870, spear: 0xffd27a, blaster: 0xffb04a, wards: 0x6ac8ff, torch: 0xff7a3a, robot: 0x9fb8ff,
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
function person(g: G, hat: 'none' | 'hood' | 'helm'): void {
  circle(g, 64, 44, 24, '#f2c39a', OUT, 6);
  path(g, [[30, 112], [36, 74], [92, 74], [98, 112]], hat === 'helm' ? '#9aa8c0' : hat === 'hood' ? '#4a8a3a' : '#4a7ad0', OUT, 6);
  if (hat === 'hood') path(g, [[38, 40], [64, 8], [92, 40], [86, 30], [64, 22], [44, 30]], '#3a7a2a', OUT, 5);
  if (hat === 'helm') { g.beginPath(); g.arc(64, 42, 27, Math.PI, 0); g.fillStyle = '#c8d4e8'; g.fill(); g.lineWidth = 5; g.strokeStyle = OUT; g.stroke(); line(g, 64, 14, 64, 4, '#ff5a4a', 7); }
  if (hat === 'none') { g.beginPath(); g.arc(64, 38, 25, Math.PI, 0); g.fillStyle = '#6a4020'; g.fill(); }
  circle(g, 56, 46, 3, OUT); circle(g, 72, 46, 3, OUT);
}

const WEAPON_DRAW: Record<WeaponId, (g: G, evo: boolean) => void> = {
  blade: (g, e) => sword(g, e), bow: (g) => bow(g), spear: (g) => spear(g), blaster: (g) => blaster(g),
  wards: (g, e) => shield(g, e), torch: (g, e) => torch(g, e), robot: (g, e) => robot(g, e),
};
const PASSIVE_DRAW: Record<PassiveId, (g: G) => void> = {
  swift: boot, vigor: bowl, regen: cup, magnet, armor: vest, haste: whetstone, reach: charm, luck: clover,
};
const UPGRADE_DRAW: Record<UpgradeId, [number, (g: G) => void]> = {
  might: [0xff6a4a, fist], vitality: [0xff3b5c, (g) => heart(g)], swiftness: [0x6affd0, boot], lodestone: [0xff5a6a, magnet],
  greed: [0xffd23f, pouch], reroll: [0x8fd8ff, arrows], secondWind: [0xffb03a, wing],
};
const HERO_DRAW: Record<HeroId, [number, (g: G) => void]> = {
  survivor: [0x7ab8ff, (g) => person(g, 'none')], ranger: [0x8aff7a, (g) => person(g, 'hood')], knight: [0xc8d4e8, (g) => person(g, 'helm')],
};

export function makeArt(scene: Phaser.Scene): void {
  for (const id of WEAPON_IDS) {
    icon(scene, weaponArt(id), (g) => { disc(g, WEAPON_HUE[id]); WEAPON_DRAW[id](g, false); });
    icon(scene, weaponArt(id, true), (g) => { disc(g, 0xffc83f, true); WEAPON_DRAW[id](g, true); });
  }
  for (const id of PASSIVE_IDS) icon(scene, passiveArt(id), (g) => { disc(g, PASSIVE_HUE[id]); PASSIVE_DRAW[id](g); });
  for (const id of UPGRADE_IDS) icon(scene, upgradeArt(id), (g) => { disc(g, UPGRADE_DRAW[id][0]); UPGRADE_DRAW[id][1](g); });
  for (const id of HERO_IDS) icon(scene, heroArt(id), (g) => { disc(g, HERO_DRAW[id][0]); HERO_DRAW[id][1](g); });
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
