// Painted textures for Letter Rain (canvas 2D: gradients, soft shadows) and the menu decor.
import Phaser from 'phaser';
import { getLang, txt } from '@core';
import { alphabet, type Lang } from './letters';

export type Kind = 'normal' | 'gold' | 'bomb' | 'cracked' | 'stone';

/** Tile textures are painted at this size and shown smaller, so they stay crisp on dense screens. */
export const TEX = 168;

export const INK: Record<Kind | 'sel', string> = {
  normal: '#2b2d42', sel: '#ffffff', gold: '#5c3b00', bomb: '#ffffff', cracked: '#4a2a12', stone: '#ffffff',
};

export const tileKey = (kind: Kind, sel = false): string =>
  sel && (kind === 'normal' || kind === 'cracked') ? 'lr-t-sel' : `lr-t-${kind}`;

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

interface Face { top: string; bottom: string; lip: string; rim: string }

/** A rounded tile with a darker lip underneath, a vertical gradient face and a soft top sheen. */
function paintTile(ctx: CanvasRenderingContext2D, f: Face): void {
  const s = TEX, p = 6, r = 32, lip = 10;
  roundRect(ctx, p, p + lip, s - p * 2, s - p * 2 - lip, r);
  ctx.fillStyle = f.lip;
  ctx.fill();
  const g = ctx.createLinearGradient(0, p, 0, s - p - lip);
  g.addColorStop(0, f.top);
  g.addColorStop(1, f.bottom);
  roundRect(ctx, p, p, s - p * 2, s - p * 2 - lip, r);
  ctx.fillStyle = g;
  ctx.fill();
  // sheen
  const sh = ctx.createLinearGradient(0, p, 0, s * 0.5);
  sh.addColorStop(0, 'rgba(255,255,255,0.55)');
  sh.addColorStop(1, 'rgba(255,255,255,0)');
  roundRect(ctx, p + 8, p + 6, s - p * 2 - 16, s * 0.4, r - 8);
  ctx.fillStyle = sh;
  ctx.fill();
  // rim
  roundRect(ctx, p + 1.5, p + 1.5, s - p * 2 - 3, s - p * 2 - lip - 3, r - 1);
  ctx.lineWidth = 3;
  ctx.strokeStyle = f.rim;
  ctx.stroke();
}

function star(ctx: CanvasRenderingContext2D, cx: number, cy: number, R: number, r: number, color: string): void {
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const rad = i % 2 ? r : R;
    ctx.lineTo(cx + Math.cos(a) * rad, cy + Math.sin(a) * rad);
  }
  ctx.closePath();
  ctx.fillStyle = color;
  ctx.fill();
}

function cracks(ctx: CanvasRenderingContext2D, color: string, width: number, lines: number[][]): void {
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  for (const pts of lines) {
    ctx.beginPath();
    ctx.moveTo(pts[0], pts[1]);
    for (let i = 2; i < pts.length; i += 2) ctx.lineTo(pts[i], pts[i + 1]);
    ctx.stroke();
  }
}

/** Creates every texture once (they live in the game's texture manager across scenes). */
export function makeArt(scene: Phaser.Scene): void {
  const tex = scene.textures;
  const canvas = (key: string, w: number, h: number, draw: (ctx: CanvasRenderingContext2D) => void) => {
    if (tex.exists(key)) return;
    const ct = tex.createCanvas(key, w, h);
    if (!ct) return;
    draw(ct.context);
    ct.refresh();
  };

  canvas('lr-t-normal', TEX, TEX, (ctx) => paintTile(ctx, { top: '#fffaf0', bottom: '#f1ddb8', lip: '#c7a271', rim: 'rgba(255,255,255,0.85)' }));
  canvas('lr-t-sel', TEX, TEX, (ctx) => paintTile(ctx, { top: '#ffb768', bottom: '#ff7433', lip: '#c2501a', rim: 'rgba(255,240,220,0.9)' }));
  canvas('lr-t-gold', TEX, TEX, (ctx) => {
    paintTile(ctx, { top: '#fff2a8', bottom: '#f6b42a', lip: '#b37208', rim: 'rgba(255,255,230,0.95)' });
    // diagonal glint and a star in the corner
    ctx.save();
    roundRect(ctx, 6, 6, TEX - 12, TEX - 22, 32);
    ctx.clip();
    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    ctx.beginPath();
    ctx.moveTo(TEX * 0.62, 0); ctx.lineTo(TEX * 0.78, 0); ctx.lineTo(TEX * 0.32, TEX); ctx.lineTo(TEX * 0.16, TEX);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
    star(ctx, 34, 34, 18, 8, '#ffffff');
    star(ctx, 34, 34, 13, 5.5, '#ffb000');
  });
  canvas('lr-t-bomb', TEX, TEX, (ctx) => {
    paintTile(ctx, { top: '#5d6288', bottom: '#2a2c45', lip: '#14152a', rim: 'rgba(255,140,90,0.9)' });
    // little bomb in the corner
    ctx.fillStyle = '#111222';
    ctx.beginPath(); ctx.arc(34, 38, 15, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.4)';
    ctx.beginPath(); ctx.arc(29, 33, 5, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#e8c39e'; ctx.lineWidth = 4; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(42, 26); ctx.quadraticCurveTo(48, 16, 56, 18); ctx.stroke();
    star(ctx, 58, 17, 9, 4, '#ffcf3f');
    star(ctx, 58, 17, 5, 2, '#ff5a2a');
  });
  canvas('lr-t-cracked', TEX, TEX, (ctx) => {
    paintTile(ctx, { top: '#fde4c8', bottom: '#e7b183', lip: '#9c6a3e', rim: 'rgba(255,245,230,0.85)' });
    cracks(ctx, 'rgba(110,60,25,0.75)', 4, [
      [14, 40, 34, 52, 30, 70, 48, 84],
      [34, 52, 52, 46],
      [154, 110, 134, 102, 128, 120, 112, 128],
      [134, 102, 140, 86],
    ]);
  });
  canvas('lr-t-stone', TEX, TEX, (ctx) => {
    paintTile(ctx, { top: '#b4bac6', bottom: '#6d7382', lip: '#3e434f', rim: 'rgba(255,255,255,0.35)' });
    const rnd = new Phaser.Math.RandomDataGenerator(['stone']);
    for (let i = 0; i < 46; i++) {
      ctx.fillStyle = rnd.pick(['rgba(0,0,0,0.16)', 'rgba(255,255,255,0.16)', 'rgba(40,44,56,0.22)']);
      ctx.beginPath();
      ctx.arc(rnd.between(22, TEX - 22), rnd.between(22, TEX - 34), rnd.between(2, 6), 0, Math.PI * 2);
      ctx.fill();
    }
    cracks(ctx, 'rgba(35,38,48,0.8)', 5, [
      [20, 60, 50, 72, 64, 96, 92, 104, 108, 132],
      [64, 96, 52, 124],
      [150, 46, 120, 58, 112, 40],
      [92, 104, 124, 96],
    ]);
  });

  // soft drop shadow under a tile
  canvas('lr-shadow', TEX + 40, TEX + 40, (ctx) => {
    ctx.shadowColor = 'rgba(0,0,0,0.55)';
    ctx.shadowBlur = 16;
    ctx.shadowOffsetX = 1000;
    roundRect(ctx, 20 + 6 - 1000, 20 + 8, TEX - 12, TEX - 14, 32);
    ctx.fillStyle = '#000';
    ctx.fill();
  });
  // glowing ring (white: tinted where used)
  canvas('lr-ring', TEX + 40, TEX + 40, (ctx) => {
    ctx.shadowColor = '#ffffff';
    ctx.shadowBlur = 14;
    roundRect(ctx, 14, 14, TEX + 12, TEX + 6, 38);
    ctx.lineWidth = 7;
    ctx.strokeStyle = '#ffffff';
    ctx.stroke();
    ctx.stroke();
  });
  // column danger glow: white at the top fading out downwards
  canvas('lr-colglow', 64, 256, (ctx) => {
    const g = ctx.createLinearGradient(0, 0, 0, 256);
    g.addColorStop(0, 'rgba(255,255,255,0.95)');
    g.addColorStop(0.45, 'rgba(255,255,255,0.35)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    roundRect(ctx, 0, 0, 64, 256, 18);
    ctx.fill();
  });
  // soft light for the background
  canvas('lr-dot', 128, 128, (ctx) => {
    const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
    g.addColorStop(0, 'rgba(255,255,255,0.6)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 128, 128);
  });
  canvas('lr-disc', 256, 256, (ctx) => {
    ctx.fillStyle = '#fff';
    ctx.beginPath(); ctx.arc(128, 128, 127, 0, Math.PI * 2); ctx.fill();
  });
  // icons (white)
  canvas('lr-shuffle', 96, 96, (ctx) => {
    ctx.strokeStyle = '#fff'; ctx.fillStyle = '#fff'; ctx.lineWidth = 9; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.arc(48, 48, 27, Phaser.Math.DegToRad(200), Phaser.Math.DegToRad(335)); ctx.stroke();
    ctx.beginPath(); ctx.arc(48, 48, 27, Phaser.Math.DegToRad(20), Phaser.Math.DegToRad(155)); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(66, 20); ctx.lineTo(86, 36); ctx.lineTo(62, 44); ctx.closePath(); ctx.fill();
    ctx.beginPath(); ctx.moveTo(30, 76); ctx.lineTo(10, 60); ctx.lineTo(34, 52); ctx.closePath(); ctx.fill();
  });
  canvas('lr-bulb', 96, 96, (ctx) => {
    ctx.fillStyle = '#fff';
    ctx.beginPath(); ctx.arc(48, 38, 25, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.moveTo(31, 50); ctx.lineTo(65, 50); ctx.lineTo(58, 66); ctx.lineTo(38, 66); ctx.closePath(); ctx.fill();
    roundRect(ctx, 36, 66, 24, 9, 3); ctx.fill();
    roundRect(ctx, 39, 78, 18, 8, 3); ctx.fill();
  });
  canvas('lr-chevron', 48, 28, (ctx) => {
    ctx.fillStyle = '#fff';
    ctx.beginPath(); ctx.moveTo(4, 4); ctx.lineTo(44, 4); ctx.lineTo(24, 26); ctx.closePath(); ctx.fill();
  });
}

/** One painted letter tile as a container (used by the menu rain). */
export function decorTile(scene: Phaser.Scene, x: number, y: number, ch: string, size: number, kind: Kind = 'normal'): Phaser.GameObjects.Container {
  const shadow = scene.add.image(0, size * 0.07, 'lr-shadow').setDisplaySize(size * 1.24, size * 1.24).setAlpha(0.5);
  const bg = scene.add.image(0, 0, tileKey(kind)).setDisplaySize(size, size);
  const label = txt(scene, 0, -size * 0.04, ch, { title: true, size: Math.round(size * 0.56), color: INK[kind], strokeThickness: 0, shadow: false });
  return scene.add.container(x, y, [shadow, bg, label]);
}

/** Menu decor: letter tiles raining softly behind the menu, and a little pile at the bottom. */
export function menuRain(scene: Phaser.Scene): void {
  makeArt(scene);
  const { width, height } = scene.scale;
  const lang = getLang() as Lang;
  const abc = alphabet(lang).slice(0, 18);
  const kinds: Kind[] = ['normal', 'normal', 'normal', 'normal', 'normal', 'gold', 'normal', 'bomb', 'cracked'];
  const g = scene.add.graphics().setDepth(-20);
  g.fillGradientStyle(0x173a5e, 0x173a5e, 0x40235f, 0x40235f, 1).fillRect(0, 0, width, height);

  const drop = (startY?: number) => {
    const size = Phaser.Math.Between(54, 92);
    const x = Phaser.Math.Between(40, width - 40);
    const tile = decorTile(scene, x, startY ?? -60, Phaser.Utils.Array.GetRandom(abc), size, Phaser.Utils.Array.GetRandom(kinds))
      .setDepth(-10).setAlpha(0.14 + (size - 54) / 38 * 0.2).setAngle(Phaser.Math.Between(-14, 14));
    const fall = (height + 120 - tile.y) / (60 + size * 0.9); // bigger = nearer = faster
    scene.tweens.add({ targets: tile, y: height + 80, angle: tile.angle + Phaser.Math.Between(-30, 30), duration: fall * 1000, onComplete: () => tile.destroy() });
  };
  for (let i = 0; i < 9; i++) drop(Phaser.Math.Between(0, height));
  scene.time.addEvent({ delay: 650, loop: true, callback: () => drop() });

  // a word lying at the bottom of the menu
  const word = lang === 'tr' ? 'YAĞMUR' : 'RAIN';
  const size = 66, gap = 8;
  const x0 = width / 2 - ((word.length - 1) * (size + gap)) / 2;
  [...word].forEach((ch, i) => {
    const t = decorTile(scene, x0 + i * (size + gap), height * 0.885, ch, size, i === 1 ? 'gold' : 'normal').setDepth(-5);
    t.y -= 260;
    t.setAlpha(0);
    scene.tweens.add({ targets: t, y: t.y + 260, alpha: 1, duration: 520, delay: 250 + i * 110, ease: 'Bounce.easeOut' });
  });
}
