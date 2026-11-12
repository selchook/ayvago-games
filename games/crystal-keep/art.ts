// Crystal Keep: the art of the power cards and the powers, composed on a 2D canvas from the icons
// rendered from the 3D models (thumbs.ts) and a few simple vector glyphs (arrows, a snowflake,
// a bolt ...). One texture per card (`cardArt`) and per power (`powerArt`).
import Phaser from 'phaser';
import type { CardId, PowerId } from './sim';

export const cardArt = (id: CardId) => `ck-art-${id}`;
export const powerArt = (id: PowerId) => `ck-pw-${id}`;
export const talentArt = (id: string) => `ck-tal-${id}`;

const S = 160;
type G = CanvasRenderingContext2D;

// keys of the rendered icons (thumbs.ts; kept as strings so there is no import cycle)
const T = {
  tower: (k: string, t: number) => `ck-tw-${k}-${t}`, enemy: (k: string) => `ck-en-${k}`, meteor: 'ck-meteor',
  crystal: (c: string) => `ck-crystal-${c}`, guards: 'ck-guards', arrow: 'ck-arrow', coin: 'ck-coin',
};

// ------------------------------------------------------------------ glyphs

function outline(g: G, w = 7, color = 'rgba(10,14,30,0.85)'): void {
  g.lineJoin = 'round';
  g.lineCap = 'round';
  g.lineWidth = w;
  g.strokeStyle = color;
  g.stroke();
}

/** Upward chevrons: a boost. */
function boost(g: G, x: number, y: number, s = 1, color = '#7dff9a'): void {
  for (let i = 0; i < 2; i++) {
    g.beginPath();
    const yy = y + i * 18 * s;
    g.moveTo(x - 18 * s, yy + 12 * s); g.lineTo(x, yy - 6 * s); g.lineTo(x + 18 * s, yy + 12 * s);
    outline(g, 13 * s);
    g.lineWidth = 7 * s; g.strokeStyle = color; g.stroke();
  }
}

/** A spiky burst: blasts and criticals. */
function burst(g: G, x: number, y: number, r: number, fill = '#ffb347', inner = '#fff3a0'): void {
  const pts = 10;
  g.beginPath();
  for (let i = 0; i < pts * 2; i++) {
    const a = (i / (pts * 2)) * Math.PI * 2 - Math.PI / 2;
    const rr = i % 2 ? r * 0.55 : r;
    g.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
  }
  g.closePath();
  outline(g, 6);
  g.fillStyle = fill; g.fill();
  g.beginPath(); g.arc(x, y, r * 0.38, 0, Math.PI * 2); g.fillStyle = inner; g.fill();
}

/** A lightning bolt. */
function bolt(g: G, x: number, y: number, s = 1, fill = '#ffe14a'): void {
  const p = [[-6, -34], [14, -34], [4, -8], [18, -8], [-10, 34], [-2, 4], [-16, 4]];
  g.beginPath();
  p.forEach(([px, py], i) => (i ? g.lineTo : g.moveTo).call(g, x + px * s, y + py * s));
  g.closePath();
  outline(g, 7 * s);
  g.fillStyle = fill; g.fill();
}

/** A six-armed snowflake. */
function snowflake(g: G, x: number, y: number, r: number, color = '#e6f7ff'): void {
  g.beginPath();
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    const ex = x + Math.cos(a) * r, ey = y + Math.sin(a) * r;
    g.moveTo(x, y); g.lineTo(ex, ey);
    for (const k of [0.55, 0.8]) {
      const bx = x + Math.cos(a) * r * k, by = y + Math.sin(a) * r * k;
      const l = r * 0.24 * (k === 0.8 ? 0.8 : 1);
      g.moveTo(bx, by); g.lineTo(bx + Math.cos(a + 0.8) * l, by + Math.sin(a + 0.8) * l);
      g.moveTo(bx, by); g.lineTo(bx + Math.cos(a - 0.8) * l, by + Math.sin(a - 0.8) * l);
    }
  }
  outline(g, r * 0.32, 'rgba(20,60,110,0.9)');
  g.lineWidth = r * 0.14; g.strokeStyle = color; g.stroke();
}

/** A heart. */
function heart(g: G, x: number, y: number, r: number, color = '#ff5a6e'): void {
  g.beginPath();
  g.moveTo(x, y + r * 0.9);
  g.bezierCurveTo(x - r * 1.4, y, x - r * 0.9, y - r * 1.1, x, y - r * 0.4);
  g.bezierCurveTo(x + r * 0.9, y - r * 1.1, x + r * 1.4, y, x, y + r * 0.9);
  outline(g, 7);
  g.fillStyle = color; g.fill();
}

/** A shield (cracked: armour broken). */
function shield(g: G, x: number, y: number, r: number, color = '#5ab0ff', cracked = false): void {
  g.beginPath();
  g.moveTo(x, y - r);
  g.quadraticCurveTo(x + r * 0.9, y - r * 0.9, x + r * 0.85, y - r * 0.25);
  g.quadraticCurveTo(x + r * 0.7, y + r * 0.6, x, y + r);
  g.quadraticCurveTo(x - r * 0.7, y + r * 0.6, x - r * 0.85, y - r * 0.25);
  g.quadraticCurveTo(x - r * 0.9, y - r * 0.9, x, y - r);
  g.closePath();
  outline(g, 7);
  g.fillStyle = color; g.fill();
  g.beginPath(); g.moveTo(x, y - r * 0.7); g.lineTo(x, y + r * 0.7); g.lineWidth = 4; g.strokeStyle = 'rgba(255,255,255,0.5)'; g.stroke();
  if (cracked) {
    g.beginPath();
    g.moveTo(x - r * 0.2, y - r); g.lineTo(x + r * 0.15, y - r * 0.3); g.lineTo(x - r * 0.15, y + r * 0.1); g.lineTo(x + r * 0.2, y + r);
    g.lineWidth = 7; g.strokeStyle = '#1a0f26'; g.stroke();
  }
}

/** A plus sign. */
function plus(g: G, x: number, y: number, r: number, color = '#7dff9a'): void {
  g.beginPath();
  g.moveTo(x - r, y); g.lineTo(x + r, y); g.moveTo(x, y - r); g.lineTo(x, y + r);
  outline(g, r * 0.95);
  g.lineWidth = r * 0.5; g.strokeStyle = color; g.stroke();
}

/** Bold text with an outline ("×3", "%", "-15%"). */
function label(g: G, x: number, y: number, s: string, size: number, color: string): void {
  g.font = `700 ${size}px Fredoka, Nunito, sans-serif`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.lineJoin = 'round';
  g.lineWidth = size * 0.22;
  g.strokeStyle = 'rgba(10,14,30,0.9)';
  g.strokeText(s, x, y);
  g.fillStyle = color;
  g.fillText(s, x, y);
}

/** A ring with a dot: range. */
function eye(g: G, x: number, y: number, r: number): void {
  g.beginPath();
  g.moveTo(x - r, y);
  g.quadraticCurveTo(x, y - r * 0.9, x + r, y);
  g.quadraticCurveTo(x, y + r * 0.9, x - r, y);
  g.closePath();
  outline(g, 7);
  g.fillStyle = '#ffffff'; g.fill();
  g.beginPath(); g.arc(x, y, r * 0.38, 0, Math.PI * 2); g.fillStyle = '#2f8cff'; g.fill();
  g.beginPath(); g.arc(x, y, r * 0.16, 0, Math.PI * 2); g.fillStyle = '#0b1020'; g.fill();
}

/** An hourglass: cooldowns. */
function hourglass(g: G, x: number, y: number, r: number): void {
  g.beginPath();
  g.moveTo(x - r * 0.7, y - r); g.lineTo(x + r * 0.7, y - r); g.lineTo(x, y); g.lineTo(x + r * 0.7, y + r); g.lineTo(x - r * 0.7, y + r); g.lineTo(x, y);
  g.closePath();
  outline(g, 7);
  g.fillStyle = '#e8f4ff'; g.fill();
  g.beginPath(); g.moveTo(x - r * 0.45, y + r * 0.85); g.lineTo(x + r * 0.45, y + r * 0.85); g.lineTo(x, y + r * 0.3); g.closePath(); g.fillStyle = '#ffd23f'; g.fill();
  g.beginPath(); g.moveTo(x - r * 0.85, y - r); g.lineTo(x + r * 0.85, y - r); g.moveTo(x - r * 0.85, y + r); g.lineTo(x + r * 0.85, y + r);
  g.lineWidth = 8; g.strokeStyle = '#b07a3a'; g.stroke();
}

/** Spikes around a centre (thorns). */
function spikes(g: G, x: number, y: number, r: number): void {
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 + 0.2;
    g.beginPath();
    g.moveTo(x + Math.cos(a - 0.16) * r * 0.62, y + Math.sin(a - 0.16) * r * 0.62);
    g.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r);
    g.lineTo(x + Math.cos(a + 0.16) * r * 0.62, y + Math.sin(a + 0.16) * r * 0.62);
    g.closePath();
    outline(g, 5);
    g.fillStyle = '#9fe36a'; g.fill();
  }
}

/** A curved arrow going back (refund). */
function backArrow(g: G, x: number, y: number, r: number): void {
  g.beginPath();
  g.arc(x, y, r, Math.PI * 0.15, Math.PI * 1.35);
  outline(g, 14);
  g.lineWidth = 8; g.strokeStyle = '#7dff9a'; g.stroke();
  const a = Math.PI * 1.35, ex = x + Math.cos(a) * r, ey = y + Math.sin(a) * r;
  g.beginPath(); g.moveTo(ex - 14, ey - 4); g.lineTo(ex + 8, ey - 14); g.lineTo(ex + 6, ey + 10); g.closePath();
  outline(g, 6);
  g.fillStyle = '#7dff9a'; g.fill();
}

/** A storm cloud. */
function cloud(g: G, x: number, y: number, s: number): void {
  g.beginPath();
  g.arc(x - 26 * s, y + 6 * s, 20 * s, 0, Math.PI * 2);
  g.arc(x, y - 8 * s, 28 * s, 0, Math.PI * 2);
  g.arc(x + 28 * s, y + 6 * s, 20 * s, 0, Math.PI * 2);
  outline(g, 8);
  g.fillStyle = '#5b6a8c'; g.fill();
  g.beginPath(); g.arc(x - 6 * s, y - 14 * s, 14 * s, 0, Math.PI * 2); g.fillStyle = '#7d8cad'; g.fill();
}

// ------------------------------------------------------------------ composition

function img(scene: Phaser.Scene, g: G, key: string, x: number, y: number, size: number, alpha = 1, rot = 0): void {
  if (!scene.textures.exists(key)) return;
  const src = scene.textures.get(key).getSourceImage() as CanvasImageSource & { width: number; height: number };
  g.save();
  g.globalAlpha = alpha;
  g.translate(x, y);
  g.rotate(rot);
  const k = size / Math.max(src.width, src.height);
  g.drawImage(src, (-src.width * k) / 2, (-src.height * k) / 2, src.width * k, src.height * k);
  g.restore();
}

function coins(scene: Phaser.Scene, g: G, x: number, y: number, n: number, size = 40): void {
  for (let i = 0; i < n; i++) img(scene, g, T.coin, x + (i - (n - 1) / 2) * size * 0.55, y - (i % 2) * size * 0.22, size);
}

type Draw = (scene: Phaser.Scene, g: G) => void;

const CARD_DRAW: Record<CardId, Draw> = {
  ballistaMastery: (s, g) => { img(s, g, T.tower('ballista', 2), 70, 84, 132); boost(g, 128, 50); },
  siegeEngineer: (s, g) => { burst(g, 112, 112, 34); img(s, g, T.tower('catapult', 1), 66, 80, 124); img(s, g, T.tower('cannon', 0), 120, 104, 76); },
  overclock: (s, g) => { img(s, g, T.tower('turret', 2), 72, 84, 132); bolt(g, 126, 52, 0.9); },
  eagleEye: (s, g) => { img(s, g, T.tower('ballista', 0), 64, 92, 116); eye(g, 116, 50, 32); },
  goldRush: (s, g) => { img(s, g, T.enemy('zombie'), 62, 76, 112); coins(s, g, 110, 118, 3, 44); },
  goldRain: (s, g) => {
    g.strokeStyle = 'rgba(255,230,140,0.7)'; g.lineWidth = 4;
    for (let i = 0; i < 6; i++) { g.beginPath(); g.moveTo(20 + i * 24, 18 + (i % 2) * 14); g.lineTo(10 + i * 24, 48 + (i % 2) * 14); g.stroke(); }
    img(s, g, T.coin, 46, 66, 46); img(s, g, T.coin, 112, 54, 40); img(s, g, T.coin, 82, 98, 50); coins(s, g, 80, 136, 4, 40);
  },
  salvage: (s, g) => { img(s, g, T.tower('cannon', 1), 62, 84, 120); backArrow(g, 112, 108, 26); img(s, g, T.coin, 112, 108, 30); },
  interest: (s, g) => { coins(s, g, 66, 112, 3, 50); img(s, g, T.coin, 66, 76, 50); label(g, 118, 56, '%', 62, '#7dff9a'); },
  cheapMasonry: (s, g) => { img(s, g, T.tower('cannon', 2), 68, 82, 130); label(g, 110, 128, '-15%', 40, '#ffd23f'); },
  crystalShield: (s, g) => { img(s, g, T.crystal('keep'), 62, 76, 120); shield(g, 112, 100, 38); },
  regeneration: (s, g) => { img(s, g, T.crystal('keep'), 62, 76, 120); heart(g, 114, 104, 30); plus(g, 134, 50, 16); },
  frostAura: (s, g) => { img(s, g, T.crystal('keep'), 70, 80, 120, 0.95); snowflake(g, 112, 104, 38); },
  thorns: (s, g) => { spikes(g, 80, 84, 72); img(s, g, T.crystal('keep'), 80, 80, 100); },
  weakeningCurse: (s, g) => { img(s, g, T.enemy('brute'), 66, 80, 124); shield(g, 116, 104, 34, '#b05aff', true); },
  quickRecharge: (s, g) => { img(s, g, T.meteor, 62, 70, 100); hourglass(g, 116, 102, 36); },
  deepFreeze: (s, g) => { img(s, g, T.crystal('ice'), 66, 80, 124); snowflake(g, 112, 104, 34); plus(g, 130, 40, 16); },
  overcharge: (s, g) => { cloud(g, 74, 52, 1); bolt(g, 70, 104, 1.1); bolt(g, 116, 98, 0.8, '#fff7b0'); plus(g, 132, 38, 16); },
  veterans: (s, g) => { img(s, g, T.guards, 72, 86, 134); plus(g, 132, 40, 18); },
  goldenTouch: (s, g) => { img(s, g, T.enemy('giant'), 66, 76, 122); coins(s, g, 108, 126, 3, 44); burst(g, 128, 46, 18, '#ffe14a'); },
  meteorStorm: (s, g) => { img(s, g, T.meteor, 50, 54, 76, 1, -0.3); img(s, g, T.meteor, 114, 66, 84, 1, 0.2); img(s, g, T.meteor, 78, 110, 96); },
  chainReaction: (s, g) => { burst(g, 52, 106, 30); burst(g, 118, 66, 26); img(s, g, T.enemy('zombie'), 82, 92, 104); burst(g, 120, 124, 22); },
  criticalStrikes: (s, g) => { img(s, g, T.tower('ballista', 1), 62, 86, 118); burst(g, 116, 58, 30, '#ff5a4a'); label(g, 116, 58, '×3', 34, '#ffffff'); },
  armourPiercer: (s, g) => { shield(g, 98, 86, 46, '#8b98b8', true); img(s, g, T.arrow, 70, 84, 130, 1, -0.5); },
};

const POWER_DRAW: Record<PowerId, Draw> = {
  meteor: (s, g) => img(s, g, T.meteor, 80, 80, 150),
  frost: (s, g) => { img(s, g, T.crystal('ice'), 74, 82, 130); snowflake(g, 110, 106, 40); },
  lightning: (s, g) => { cloud(g, 80, 54, 1.2); bolt(g, 78, 108, 1.25); bolt(g, 124, 104, 0.75, '#fff7b0'); },
  knights: (s, g) => img(s, g, T.guards, 80, 84, 150),
};

/** Talent icons: a mix of the above. */
const TALENT_DRAW: Record<string, Draw> = {
  gold1: (s, g) => { coins(s, g, 80, 96, 3, 54); plus(g, 128, 44, 18); },
  gold2: (s, g) => { coins(s, g, 80, 110, 4, 50); coins(s, g, 80, 74, 3, 50); plus(g, 130, 40, 18); },
  lives: (s, g) => { img(s, g, T.crystal('keep'), 64, 80, 116); heart(g, 114, 104, 32); },
  hunter: (s, g) => { img(s, g, 'ck-shard', 52, 92, 80); img(s, g, 'ck-shard', 100, 70, 96); img(s, g, 'ck-shard', 116, 118, 64); },
  frost: POWER_DRAW.frost,
  lightning: POWER_DRAW.lightning,
  knights: POWER_DRAW.knights,
  slot3: (s, g) => {
    img(s, g, T.meteor, 34, 72, 84); img(s, g, T.crystal('ice'), 80, 66, 88); img(s, g, T.crystal('gold'), 126, 72, 84);
    label(g, 80, 128, '3', 48, '#ffd23f');
  },
  focus: (s, g) => { hourglass(g, 80, 82, 48); },
  reroll: (s, g) => { backArrow(g, 80, 86, 38); plus(g, 126, 40, 16); },
  luck: (s, g) => {
    burst(g, 80, 82, 60, '#d27bff', '#d27bff');
    g.beginPath();
    for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + (i * Math.PI) / 5, r = i % 2 ? 13 : 30; g.lineTo(80 + Math.cos(a) * r, 82 + Math.sin(a) * r); }
    g.closePath(); outline(g, 6); g.fillStyle = '#ffd23f'; g.fill();
  },
  wide: (s, g) => {
    for (let i = 0; i < 4; i++) {
      g.save(); g.translate(30 + i * 33, 88); g.rotate((i - 1.5) * 0.14);
      g.beginPath(); g.roundRect(-20, -34, 40, 68, 7); outline(g, 6); g.fillStyle = ['#c9d4ea', '#4fb2ff', '#d27bff', '#ffd23f'][i]; g.fill();
      g.restore();
    }
  },
};

function compose(scene: Phaser.Scene, key: string, draw: Draw): () => void {
  return () => {
    if (scene.textures.exists(key)) return;
    const cv = document.createElement('canvas');
    cv.width = cv.height = S;
    const g = cv.getContext('2d')!;
    draw(scene, g);
    scene.textures.addCanvas(key, cv);
  };
}

/** One render job per card, power and talent picture (after the 3D icons they are drawn from). */
export function artJobs(scene: Phaser.Scene): (() => void)[] {
  return [
    ...(Object.keys(POWER_DRAW) as PowerId[]).map((id) => compose(scene, powerArt(id), POWER_DRAW[id])),
    ...(Object.keys(CARD_DRAW) as CardId[]).map((id) => compose(scene, cardArt(id), CARD_DRAW[id])),
    ...Object.keys(TALENT_DRAW).map((id) => compose(scene, talentArt(id), TALENT_DRAW[id])),
  ];
}
