// Secret Word art: painted tiles and keys drawn on canvas, the calm backdrop with floating
// letters, and the menu decor. No image files are needed.
import Phaser from 'phaser';
import { txt, getLang } from '@core';
import { ALPHABET } from './logic';

export const INK = '#26213f';
export const CREAM = 0xfff7ea;
export const GREEN = 0x2fb36d;
export const AMBER = 0xf2a43a;
export const GREY = 0x5b6278;
export const ROSE = 0xe2566c;
export const GOLD = 0xffd04a;
export const TEAL = 0x34c3c9;

/** Fill colour of a tile or key for a mark (-1 = unknown). */
export const markColor = (m: number): number => (m === 2 ? GREEN : m === 1 ? AMBER : m === 0 ? GREY : CREAM);

function canvasTex(scene: Phaser.Scene, key: string, w: number, h: number, draw: (c: CanvasRenderingContext2D) => void): void {
  if (scene.textures.exists(key)) return;
  const tex = scene.textures.createCanvas(key, w, h);
  if (!tex) return;
  draw(tex.getContext());
  tex.refresh();
}

function roundRect(c: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  c.beginPath();
  c.moveTo(x + r, y);
  c.arcTo(x + w, y, x + w, y + h, r);
  c.arcTo(x + w, y + h, x, y + h, r);
  c.arcTo(x, y + h, x, y, r);
  c.arcTo(x, y, x + w, y, r);
  c.closePath();
}

/**
 * A painted rounded block: a darker lip underneath, a soft top-to-bottom shade and a glossy band.
 * It is drawn in greys so a tint gives it any colour.
 */
function paintBlock(c: CanvasRenderingContext2D, w: number, h: number, lip: number, r: number): void {
  const body = h - lip;
  roundRect(c, 2, lip + 2, w - 4, body - 4, r);
  c.fillStyle = '#9a9a9a';
  c.fill();
  roundRect(c, 2, 2, w - 4, body - 4, r);
  const g = c.createLinearGradient(0, 0, 0, body);
  g.addColorStop(0, '#ffffff');
  g.addColorStop(1, '#dcdcdc');
  c.fillStyle = g;
  c.fill();
  // gloss
  roundRect(c, 10, 8, w - 20, body * 0.32, r * 0.7);
  c.fillStyle = 'rgba(255,255,255,0.55)';
  c.fill();
}

export function makeTextures(scene: Phaser.Scene): void {
  canvasTex(scene, 'sw-tile', 128, 136, (c) => paintBlock(c, 128, 136, 8, 24));
  canvasTex(scene, 'sw-key', 96, 112, (c) => paintBlock(c, 96, 112, 8, 18));
  canvasTex(scene, 'sw-wide', 160, 112, (c) => paintBlock(c, 160, 112, 8, 18));
  canvasTex(scene, 'sw-btn', 256, 88, (c) => paintBlock(c, 256, 88, 8, 34));
  // an empty slot: a soft glass square with a light rim
  canvasTex(scene, 'sw-slot', 128, 136, (c) => {
    roundRect(c, 3, 3, 122, 122, 24);
    c.fillStyle = 'rgba(255,255,255,0.08)';
    c.fill();
    c.lineWidth = 4;
    c.strokeStyle = 'rgba(255,255,255,0.32)';
    c.stroke();
  });
  canvasTex(scene, 'sw-glow', 64, 64, (c) => {
    const g = c.createRadialGradient(32, 32, 0, 32, 32, 32);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    c.fillStyle = g;
    c.fillRect(0, 0, 64, 64);
  });
  // joker icons
  canvasTex(scene, 'sw-eye', 64, 64, (c) => {
    c.fillStyle = '#ffffff';
    c.beginPath();
    c.moveTo(4, 32);
    c.quadraticCurveTo(32, 2, 60, 32);
    c.quadraticCurveTo(32, 62, 4, 32);
    c.fill();
    c.fillStyle = '#26213f';
    c.beginPath();
    c.arc(32, 32, 12, 0, Math.PI * 2);
    c.fill();
    c.fillStyle = '#ffffff';
    c.beginPath();
    c.arc(36, 28, 4, 0, Math.PI * 2);
    c.fill();
  });
  canvasTex(scene, 'sw-eraser', 64, 64, (c) => {
    c.save();
    c.translate(32, 32);
    c.rotate(-Math.PI / 4);
    roundRect(c, -26, -13, 52, 26, 7);
    c.fillStyle = '#ffffff';
    c.fill();
    roundRect(c, -26, -13, 20, 26, 7);
    c.fillStyle = '#ff9fb0';
    c.fill();
    c.restore();
    c.fillStyle = 'rgba(255,255,255,0.8)';
    c.fillRect(6, 54, 30, 4);
  });
  // keyboard icons: enter (a bent arrow) and backspace (a key-shaped arrow with a cross)
  canvasTex(scene, 'sw-enter', 64, 64, (c) => {
    c.strokeStyle = '#ffffff';
    c.fillStyle = '#ffffff';
    c.lineWidth = 7;
    c.lineCap = 'round';
    c.lineJoin = 'round';
    c.beginPath();
    c.moveTo(50, 12);
    c.lineTo(50, 38);
    c.lineTo(20, 38);
    c.stroke();
    c.beginPath();
    c.moveTo(8, 38);
    c.lineTo(24, 24);
    c.lineTo(24, 52);
    c.closePath();
    c.fill();
  });
  canvasTex(scene, 'sw-back', 64, 64, (c) => {
    c.fillStyle = '#ffffff';
    c.beginPath();
    c.moveTo(4, 32);
    c.lineTo(20, 12);
    c.lineTo(58, 12);
    c.quadraticCurveTo(62, 12, 62, 16);
    c.lineTo(62, 48);
    c.quadraticCurveTo(62, 52, 58, 52);
    c.lineTo(20, 52);
    c.closePath();
    c.fill();
    c.strokeStyle = '#26213f';
    c.lineWidth = 6;
    c.lineCap = 'round';
    c.beginPath();
    c.moveTo(30, 22); c.lineTo(48, 42);
    c.moveTo(48, 22); c.lineTo(30, 42);
    c.stroke();
  });
  canvasTex(scene, 'sw-star', 48, 48, (c) => {
    c.fillStyle = '#ffffff';
    c.beginPath();
    for (let i = 0; i < 10; i++) {
      const a = -Math.PI / 2 + (i * Math.PI) / 5;
      const r = i % 2 ? 9 : 22;
      c.lineTo(24 + Math.cos(a) * r, 25 + Math.sin(a) * r);
    }
    c.closePath();
    c.fill();
  });
  canvasTex(scene, 'sw-bg', 360, 640, (c) => {
    const g = c.createLinearGradient(0, 0, 0, 640);
    g.addColorStop(0, '#163f56');
    g.addColorStop(0.55, '#243a66');
    g.addColorStop(1, '#3a2f63');
    c.fillStyle = g;
    c.fillRect(0, 0, 360, 640);
    const glow = (x: number, y: number, r: number, col: string) => {
      const rg = c.createRadialGradient(x, y, 0, x, y, r);
      rg.addColorStop(0, col);
      rg.addColorStop(1, 'rgba(0,0,0,0)');
      c.fillStyle = rg;
      c.fillRect(0, 0, 360, 640);
    };
    glow(60, 90, 220, 'rgba(52,195,201,0.22)');
    glow(320, 560, 260, 'rgba(242,164,58,0.12)');
    glow(300, 260, 180, 'rgba(160,130,255,0.10)');
  });
}

/** The calm gradient with slow floating letters (depth -10 and below). */
export function backdrop(scene: Phaser.Scene, count = 16): void {
  makeTextures(scene);
  const { width: W, height: H } = scene.scale;
  scene.add.image(0, 0, 'sw-bg').setOrigin(0).setDisplaySize(W, H).setDepth(-20);
  const abc = [...ALPHABET[getLang()]];
  for (let i = 0; i < count; i++) {
    const size = 50 + Math.random() * 90;
    const ch = abc[Math.floor(Math.random() * abc.length)];
    const l = txt(scene, Math.random() * W, Math.random() * H, ch, {
      title: true, size: Math.round(size), color: '#ffffff', strokeThickness: 0, shadow: false,
    }).setDepth(-15).setAlpha(0.035 + Math.random() * 0.05).setAngle(-20 + Math.random() * 40);
    const drift = () => {
      const dur = 16000 + Math.random() * 14000;
      scene.tweens.add({
        targets: l, y: -size, x: l.x + (Math.random() - 0.5) * 120, angle: l.angle + (Math.random() - 0.5) * 50,
        duration: dur * ((l.y + size) / (H + size)),
        onComplete: () => {
          l.setPosition(Math.random() * W, H + size).setText(abc[Math.floor(Math.random() * abc.length)]);
          drift();
        },
      });
    };
    drift();
  }
}

/** Menu decor: the backdrop and a row of tiles that flip to spell a word, then flip back. */
export function menuDecor(scene: Phaser.Scene): void {
  backdrop(scene, 12);
  const { width: W, height: H } = scene.scale;
  const word = [...(getLang() === 'tr' ? 'GİZLİ' : 'SECRET')];
  const size = 78, gap = 12;
  const x0 = W / 2 - ((word.length - 1) * (size + gap)) / 2;
  const y = H * 0.872;
  // marks the tiles show on the first pass, before they all turn green
  const pattern = getLang() === 'tr' ? [1, 0, 2, 1, 0] : [0, 1, 2, 0, 1, 2];
  const tiles = word.map((ch, i) => {
    const img = scene.add.image(0, 0, 'sw-tile').setDisplaySize(size, size * 136 / 128).setTint(CREAM);
    const label = txt(scene, 0, -4, ch, { title: true, size: 46, color: INK, strokeThickness: 0, shadow: false });
    const c = scene.add.container(x0 + i * (size + gap), y, [img, label]);
    return { c, img, label };
  });
  let pass = 0;
  const flipAll = () => {
    // pass 0: mixed marks, 1: all green, 2: back to blank
    const cycle = pass % 3;
    const final = cycle === 1;
    tiles.forEach((tl, i) => {
      scene.tweens.add({
        targets: tl.c, scaleY: 0, duration: 140, delay: i * 160, ease: 'Quad.easeIn',
        onComplete: () => {
          const m = cycle === 2 ? -1 : final ? 2 : pattern[i];
          tl.img.setTint(markColor(m));
          tl.label.setColor(m < 0 ? INK : '#ffffff');
          scene.tweens.add({ targets: tl.c, scaleY: 1, duration: 160, ease: 'Quad.easeOut' });
          if (final && m === 2) scene.tweens.add({ targets: tl.c, y: y - 22, duration: 150, delay: 120 + i * 30, yoyo: true, ease: 'Sine.easeOut' });
        },
      });
    });
    pass++;
    scene.time.delayedCall(word.length * 160 + 1500, flipAll);
  };
  scene.time.delayedCall(500, flipAll);
}
