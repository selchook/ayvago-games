// Star Squadron: the UI icons (card art, talents, powers, credits, stardust), drawn once per game
// into canvas textures with simple vector symbols over a glowing disc in the card's colour.
import Phaser from 'phaser';
import { CARDS, type CardId } from './cards';
import { TALENTS, type TalentId } from './talents';
import type { PowerId } from './defs';

export const cardArt = (id: CardId) => 'ss-card-' + id;
export const talentArt = (id: TalentId) => 'ss-tal-' + id;
export const powerArt = (id: PowerId) => 'ss-pow-' + id;
export const COIN = 'ss-coin';
export const DUST = 'ss-dust';

type G = CanvasRenderingContext2D;
const S = 128;
const css = (c: number, a = 1) => `rgba(${(c >> 16) & 255},${(c >> 8) & 255},${c & 255},${a})`;

function canvasIcon(scene: Phaser.Scene, key: string, size: number, draw: (g: G) => void): void {
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

/** A glowing disc in `hue` behind every symbol. */
function disc(g: G, hue: number): void {
  const r = g.createRadialGradient(64, 58, 6, 64, 64, 62);
  r.addColorStop(0, css(hue, 0.55));
  r.addColorStop(0.55, css(hue, 0.2));
  r.addColorStop(1, css(hue, 0));
  g.fillStyle = r;
  g.fillRect(0, 0, S, S);
}

const W = '#ffffff';

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

/** A laser bolt pointing up. */
function bolt(g: G, x: number, y: number, h: number, c: string, w = 9): void {
  g.beginPath(); g.moveTo(x, y - h / 2); g.lineTo(x + w / 2, y - h / 2 + w); g.lineTo(x + w / 2, y + h / 2); g.lineTo(x - w / 2, y + h / 2); g.lineTo(x - w / 2, y - h / 2 + w); g.closePath();
  g.fillStyle = c; g.fill();
}

function shieldShape(g: G, x: number, y: number, s: number, fill: string, stroke?: string): void {
  path(g, [[x, y - 34 * s], [x + 30 * s, y - 22 * s], [x + 26 * s, y + 10 * s], [x, y + 34 * s], [x - 26 * s, y + 10 * s], [x - 30 * s, y - 22 * s]], fill, stroke, 5);
}

function ship(g: G, x: number, y: number, s: number, c: string): void {
  path(g, [[x, y - 26 * s], [x + 10 * s, y - 4 * s], [x + 26 * s, y + 10 * s], [x + 10 * s, y + 14 * s], [x, y + 22 * s], [x - 10 * s, y + 14 * s], [x - 26 * s, y + 10 * s], [x - 10 * s, y - 4 * s]], c);
}

function lightning(g: G, pts: number[][], c: string, lw = 7): void {
  g.beginPath();
  pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y)));
  g.lineWidth = lw; g.lineJoin = 'miter'; g.lineCap = 'round'; g.strokeStyle = c; g.stroke();
}

function missile(g: G, x: number, y: number, ang: number, c: string, s = 1): void {
  g.save(); g.translate(x, y); g.rotate(ang); g.scale(s, s);
  path(g, [[0, -22], [7, -12], [7, 12], [13, 20], [-13, 20], [-7, 12], [-7, -12]], W);
  path(g, [[0, -22], [7, -12], [-7, -12]], c);
  g.fillStyle = '#ffb347'; g.beginPath(); g.moveTo(-5, 21); g.lineTo(0, 34); g.lineTo(5, 21); g.fill();
  g.restore();
}

function crosshair(g: G, x: number, y: number, s: number, c: string): void {
  circle(g, x, y, 26 * s, null, c, 6);
  for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) line(g, x + dx * 14 * s, y + dy * 14 * s, x + dx * 38 * s, y + dy * 38 * s, c, 6);
  circle(g, x, y, 5 * s, c);
}

function coin(g: G, x: number, y: number, r: number): void {
  circle(g, x, y, r, '#ffc83a', '#a8700a', r * 0.18);
  circle(g, x, y, r * 0.62, null, '#fff0b0', r * 0.12);
}

function star(g: G, x: number, y: number, r: number, c: string): void {
  const pts: number[][] = [];
  for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + (i * Math.PI) / 5, rr = i % 2 ? r * 0.45 : r; pts.push([x + Math.cos(a) * rr, y + Math.sin(a) * rr]); }
  path(g, pts, c);
}

function bomb(g: G, x: number, y: number, s: number, c: string): void {
  circle(g, x, y + 6 * s, 26 * s, '#2a2f40', W, 5);
  line(g, x + 14 * s, y - 14 * s, x + 24 * s, y - 26 * s, W, 6);
  star(g, x + 28 * s, y - 32 * s, 12 * s, c);
  circle(g, x - 9 * s, y - 3 * s, 6 * s, 'rgba(255,255,255,0.6)');
}

const CARD_DRAW: Record<CardId, (g: G, c: string) => void> = {
  rapidFire: (g, c) => { for (const [x, y] of [[44, 74], [64, 54], [84, 74]]) bolt(g, x, y, 46, W, 11); line(g, 30, 104, 98, 104, c, 6); },
  heavyRounds: (g, c) => { path(g, [[64, 18], [84, 42], [84, 104], [44, 104], [44, 42]], W); path(g, [[64, 18], [84, 42], [44, 42]], c); line(g, 44, 92, 84, 92, '#2a2f40', 5); },
  plating: (g, c) => { path(g, [[64, 16], [104, 38], [104, 84], [64, 110], [24, 84], [24, 38]], '#c9d4ea', W, 5); for (const [x, y] of [[44, 46], [84, 46], [44, 80], [84, 80]]) circle(g, x, y, 5, c); line(g, 64, 40, 64, 88, c, 8); line(g, 40, 64, 88, 64, c, 8); },
  magnet: (g, c) => { g.beginPath(); g.arc(64, 60, 30, Math.PI, 0); g.lineWidth = 20; g.strokeStyle = c; g.stroke(); g.fillStyle = c; g.fillRect(24, 58, 20, 26); g.fillRect(84, 58, 20, 26); g.fillStyle = W; g.fillRect(24, 84, 20, 14); g.fillRect(84, 84, 20, 14); coin(g, 64, 104, 10); },
  bounty: (g) => { coin(g, 56, 66, 34); star(g, 92, 36, 18, W); },
  capacitors: (g, c) => { g.fillStyle = W; g.fillRect(36, 30, 56, 80); g.fillRect(52, 20, 24, 12); g.fillStyle = '#2a2f40'; g.fillRect(44, 38, 40, 64); path(g, [[70, 44], [52, 74], [64, 74], [58, 96], [78, 64], [66, 64]], c); },
  thrusters: (g, c) => { ship(g, 64, 50, 1.2, W); path(g, [[52, 72], [76, 72], [64, 116]], c); path(g, [[57, 72], [71, 72], [64, 98]], '#fff3b0'); },
  repair: (g, c) => { g.save(); g.translate(64, 64); g.rotate(-Math.PI / 4); g.fillStyle = W; g.fillRect(-9, -34, 18, 62); circle(g, 0, -40, 18, W); g.fillStyle = '#123'; g.fillRect(-6, -60, 12, 22); g.restore(); circle(g, 92, 92, 16, c); line(g, 92, 82, 92, 102, W, 6); line(g, 82, 92, 102, 92, W, 6); },
  spread: (g, c) => { for (const a of [-0.5, -0.25, 0, 0.25, 0.5]) { g.save(); g.translate(64, 104); g.rotate(a); bolt(g, 0, -52, 34, a === 0 ? W : c, 9); g.restore(); } ship(g, 64, 104, 0.6, W); },
  pierce: (g, c) => { circle(g, 64, 76, 14, null, c, 6); circle(g, 64, 44, 12, null, c, 6); bolt(g, 64, 64, 96, W, 10); },
  homing: (g, c) => { g.beginPath(); g.moveTo(30, 110); g.quadraticCurveTo(24, 44, 82, 40); g.setLineDash([8, 8]); g.lineWidth = 5; g.strokeStyle = c; g.stroke(); g.setLineDash([]); missile(g, 86, 40, 1.3, c, 0.9); crosshair(g, 98, 34, 0.45, W); },
  drone: (g, c) => { circle(g, 64, 64, 38, null, c, 4); ship(g, 64, 66, 0.9, W); ship(g, 100, 46, 0.45, c); circle(g, 100, 46, 4, W); },
  shieldGen: (g, c) => { shieldShape(g, 64, 64, 1.2, css(0x5ad1ff, 0.35), W); line(g, 64, 44, 64, 84, c, 9); line(g, 44, 64, 84, 64, c, 9); },
  crit: (g, c) => { crosshair(g, 64, 64, 1, W); star(g, 64, 64, 14, c); },
  megaBomb: (g, c) => { for (let i = 0; i < 12; i++) { const a = (i / 12) * Math.PI * 2; line(g, 64 + Math.cos(a) * 34, 70 + Math.sin(a) * 34, 64 + Math.cos(a) * 52, 70 + Math.sin(a) * 52, c, 5); } bomb(g, 64, 66, 0.95, '#ffd23f'); },
  ricochet: (g, c) => { lightning(g, [[24, 108], [52, 40], [76, 86], [104, 24]], W, 7); circle(g, 52, 40, 8, c); circle(g, 76, 86, 8, c); bolt(g, 104, 24, 18, c, 8); },
  nanoRepair: (g, c) => { path(g, [[64, 18], [104, 40], [104, 88], [64, 110], [24, 88], [24, 40]], null, W, 5); lightning(g, [[28, 66], [48, 66], [56, 46], [68, 86], [78, 60], [100, 60]], c, 6); },
  chain: (g, c) => { lightning(g, [[22, 30], [46, 58], [38, 64], [66, 92], [60, 70], [86, 80], [106, 104]], W, 6); for (const [x, y] of [[22, 30], [66, 92], [106, 104]]) circle(g, x, y, 9, c); },
  reflex: (g, c) => { path(g, [[38, 20], [90, 20], [64, 64]], W); path(g, [[64, 64], [90, 108], [38, 108]], W); path(g, [[52, 40], [76, 40], [64, 58]], c); path(g, [[64, 74], [80, 100], [48, 100]], c); line(g, 30, 18, 98, 18, W, 6); line(g, 30, 110, 98, 110, W, 6); },
  overload: (g, c) => { for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2; path(g, [[64 + Math.cos(a) * 18, 64 + Math.sin(a) * 18], [64 + Math.cos(a + 0.2) * 50, 64 + Math.sin(a + 0.2) * 50], [64 + Math.cos(a + 0.35) * 18, 64 + Math.sin(a + 0.35) * 18]], c); } circle(g, 64, 64, 22, W); circle(g, 64, 64, 10, c); },
  phoenix: (g, c) => { path(g, [[64, 30], [74, 52], [110, 34], [92, 70], [72, 76], [64, 104], [56, 76], [36, 70], [18, 34], [54, 52]], c, W, 4); circle(g, 64, 44, 7, W); },
  stormMissiles: (g, c) => { missile(g, 42, 70, 0.2, c, 1); lightning(g, [[64, 30], [84, 52], [74, 56], [100, 90]], W, 6); circle(g, 100, 90, 8, c); },
  laserFan: (g, c) => { for (const a of [-0.6, -0.3, 0, 0.3, 0.6]) { g.save(); g.translate(64, 110); g.rotate(a); bolt(g, 0, -56, 64, a === 0 ? W : c, 11); g.restore(); } },
  sniperDrones: (g, c) => { crosshair(g, 64, 64, 1.05, c); ship(g, 64, 66, 0.7, W); },
  trickShot: (g, c) => { lightning(g, [[22, 100], [50, 36], [80, 90], [108, 30]], c, 7); star(g, 50, 36, 13, W); star(g, 80, 90, 13, W); star(g, 108, 30, 13, W); },
  siphon: (g, c) => { shieldShape(g, 64, 64, 1.15, css(0x5ad1ff, 0.3), W); coin(g, 64, 64, 18); for (const [x, y] of [[24, 30], [104, 30], [104, 100], [24, 100]]) { line(g, x, y, (x + 64) / 2, (y + 64) / 2, c, 5); } },
};

const TALENT_DRAW: Record<TalentId, (g: G, c: string) => void> = {
  plating: CARD_DRAW.plating,
  shields: (g, c) => { shieldShape(g, 64, 64, 1.2, css(0x5ad1ff, 0.35), W); star(g, 64, 62, 18, c); },
  salvage: (g, c) => { coin(g, 48, 72, 24); coin(g, 82, 58, 20); line(g, 30, 30, 98, 30, c, 6); },
  phoenix: CARD_DRAW.phoenix,
  calibration: CARD_DRAW.heavyRounds,
  loader: CARD_DRAW.rapidFire,
  wingman: CARD_DRAW.drone,
  optics: CARD_DRAW.crit,
  capacitor: CARD_DRAW.capacitors,
  reroll: (g, c) => { g.beginPath(); g.arc(64, 64, 34, 0.3, Math.PI * 1.75); g.lineWidth = 10; g.strokeStyle = W; g.stroke(); path(g, [[92, 28], [104, 58], [74, 54]], W); g.fillStyle = c; g.fillRect(52, 50, 24, 30); },
  luck: (g, c) => { star(g, 64, 62, 36, W); star(g, 98, 30, 14, c); star(g, 30, 98, 12, c); },
  wide: (g, c) => { for (const [x, r] of [[34, -0.25], [56, -0.08], [76, 0.08], [96, 0.25]]) { g.save(); g.translate(x, 70); g.rotate(r); g.fillStyle = W; g.fillRect(-13, -30, 26, 52); g.fillStyle = c; g.fillRect(-9, -26, 18, 18); g.restore(); } },
};

const POWER_DRAW: Record<PowerId, (g: G) => void> = {
  bomb: (g) => bomb(g, 60, 70, 1.15, '#ffd23f'),
  shield: (g) => { shieldShape(g, 64, 64, 1.35, css(0x5ad1ff, 0.55), W); circle(g, 64, 58, 10, W); },
  overdrive: (g) => { path(g, [[72, 12], [32, 70], [58, 70], [48, 116], [96, 52], [70, 52]], '#ffd23f', W, 5); },
};

/** Draws every icon once (cheap: a few dozen small canvases). */
export function makeArt(scene: Phaser.Scene): void {
  for (const c of CARDS) canvasIcon(scene, cardArt(c.id), 128, (g) => { disc(g, c.hue); CARD_DRAW[c.id](g, css(c.hue)); });
  for (const tl of TALENTS) canvasIcon(scene, talentArt(tl.id), 128, (g) => { disc(g, tl.hue); TALENT_DRAW[tl.id](g, css(tl.hue)); });
  for (const p of ['bomb', 'shield', 'overdrive'] as PowerId[]) canvasIcon(scene, powerArt(p), 128, (g) => POWER_DRAW[p](g));
  canvasIcon(scene, COIN, 64, (g) => coin(g, 64, 64, 50));
  canvasIcon(scene, DUST, 64, (g) => {
    const r = g.createRadialGradient(64, 64, 4, 64, 64, 60);
    r.addColorStop(0, 'rgba(255,240,255,1)'); r.addColorStop(0.4, 'rgba(210,123,255,0.8)'); r.addColorStop(1, 'rgba(120,60,255,0)');
    g.fillStyle = r; g.fillRect(0, 0, 128, 128);
    star(g, 64, 64, 42, '#ffffff');
    star(g, 64, 64, 24, '#f0d0ff');
  });
}
