import Phaser from 'phaser';
import type { BallKind } from './sim';

// Painted canvas textures for Plinko Drop: background, pegs, balls, bumpers, bars, stars.
// Made once per game (textures are global), used by the play scene and the menu decor.

type Ctx = CanvasRenderingContext2D;

function paint(scene: Phaser.Scene, key: string, w: number, h: number, draw: (c: Ctx) => void): void {
  if (scene.textures.exists(key)) return;
  const tex = scene.textures.createCanvas(key, w, h);
  if (!tex) return;
  draw(tex.getContext());
  tex.refresh();
}

function radial(c: Ctx, x: number, y: number, r: number, stops: Array<[number, string]>, fx = x, fy = y): CanvasGradient {
  const g = c.createRadialGradient(fx, fy, 0, x, y, r);
  for (const [o, col] of stops) g.addColorStop(o, col);
  return g;
}

function circle(c: Ctx, x: number, y: number, r: number, fill: string | CanvasGradient): void {
  c.fillStyle = fill;
  c.beginPath();
  c.arc(x, y, r, 0, Math.PI * 2);
  c.fill();
}

function capsule(c: Ctx, x: number, y: number, w: number, h: number): void {
  const r = h / 2;
  c.beginPath();
  c.moveTo(x + r, y);
  c.lineTo(x + w - r, y);
  c.arc(x + w - r, y + r, r, -Math.PI / 2, Math.PI / 2);
  c.lineTo(x + r, y + h);
  c.arc(x + r, y + r, r, Math.PI / 2, (Math.PI * 3) / 2);
  c.closePath();
}

function starPath(c: Ctx, cx: number, cy: number, outer: number, inner: number): void {
  c.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const r = i % 2 === 0 ? outer : inner;
    const x = cx + Math.cos(a) * r, y = cy + Math.sin(a) * r;
    if (i === 0) c.moveTo(x, y); else c.lineTo(x, y);
  }
  c.closePath();
}

/** Ball colours: [highlight, body, shadow, trail tint]. */
export const BALL_LOOK: Record<BallKind, { hi: string; body: string; lo: string; trail: number }> = {
  normal: { hi: '#f2fdff', body: '#3ee6ff', lo: '#0b5f8f', trail: 0x3ee6ff },
  gold: { hi: '#fffbe0', body: '#ffcf33', lo: '#a66300', trail: 0xffd23f },
  heavy: { hi: '#ffffff', body: '#8d96ab', lo: '#262b38', trail: 0xb8c2d8 },
  split: { hi: '#ffe8f6', body: '#ff4fa3', lo: '#80104c', trail: 0xff4fa3 },
  shard: { hi: '#ffe8f6', body: '#ff6fb8', lo: '#80104c', trail: 0xff6fb8 },
  ghost: { hi: '#ffffff', body: '#cfc9ff', lo: '#6c5fd6', trail: 0xcfc9ff },
};

export function paintTextures(scene: Phaser.Scene): void {
  // background: deep night gradient with soft colour clouds and tiny stars
  paint(scene, 'pk-bg', 720, 1280, (c) => {
    const g = c.createLinearGradient(0, 0, 0, 1280);
    g.addColorStop(0, '#1d1350');
    g.addColorStop(0.45, '#140d38');
    g.addColorStop(1, '#090616');
    c.fillStyle = g;
    c.fillRect(0, 0, 720, 1280);
    const clouds: Array<[number, number, number, string]> = [
      [120, 260, 360, 'rgba(139,92,255,0.22)'], [640, 520, 380, 'rgba(62,230,255,0.13)'],
      [180, 980, 420, 'rgba(255,79,163,0.14)'], [600, 1160, 300, 'rgba(255,210,63,0.08)'],
      [400, 60, 300, 'rgba(255,79,163,0.10)'],
    ];
    for (const [x, y, r, col] of clouds) { c.fillStyle = radial(c, x, y, r, [[0, col], [1, 'rgba(0,0,0,0)']]); c.fillRect(0, 0, 720, 1280); }
    let seed = 7;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (let i = 0; i < 140; i++) {
      const x = rnd() * 720, y = rnd() * 1280, r = rnd() * 1.6 + 0.4;
      circle(c, x, y, r, `rgba(255,255,255,${0.15 + rnd() * 0.5})`);
    }
  });
  // the glass board panel
  paint(scene, 'pk-panel', 668, 1036, (c) => {
    const g = c.createLinearGradient(0, 0, 0, 1036);
    g.addColorStop(0, 'rgba(46,32,110,0.92)');
    g.addColorStop(0.6, 'rgba(26,18,66,0.92)');
    g.addColorStop(1, 'rgba(14,9,36,0.95)');
    c.fillStyle = g;
    roundRect(c, 0, 0, 668, 1036, 28);
    c.fill();
    // soft inner light from the top and faint diagonal sheen
    c.save();
    roundRect(c, 0, 0, 668, 1036, 28);
    c.clip();
    c.fillStyle = radial(c, 334, -80, 520, [[0, 'rgba(180,160,255,0.28)'], [1, 'rgba(0,0,0,0)']]);
    c.fillRect(0, 0, 668, 1036);
    c.fillStyle = 'rgba(255,255,255,0.035)';
    for (let i = -2; i < 8; i++) {
      c.beginPath();
      c.moveTo(i * 130, 0); c.lineTo(i * 130 + 60, 0); c.lineTo(i * 130 - 340, 1036); c.lineTo(i * 130 - 400, 1036);
      c.closePath(); c.fill();
    }
    c.restore();
  });
  paint(scene, 'pk-peg', 40, 40, (c) => {
    circle(c, 20, 22, 11, 'rgba(0,0,0,0.35)');
    circle(c, 20, 20, 10, radial(c, 20, 20, 10, [[0, '#ffffff'], [0.45, '#e4e0ff'], [1, '#7d70d8']], 16, 16));
    circle(c, 16.5, 16.5, 3, 'rgba(255,255,255,0.95)');
  });
  paint(scene, 'pk-gold', 40, 40, (c) => {
    circle(c, 20, 22, 13, 'rgba(0,0,0,0.35)');
    circle(c, 20, 20, 13, radial(c, 20, 20, 13, [[0, '#fff7c9'], [0.5, '#ffd23f'], [1, '#b56d00']], 15, 15));
    c.fillStyle = 'rgba(255,255,255,0.9)';
    starPath(c, 20, 20.5, 7, 3);
    c.fill();
  });
  paint(scene, 'pk-glow', 64, 64, (c) => {
    c.fillStyle = radial(c, 32, 32, 32, [[0, 'rgba(255,255,255,1)'], [0.3, 'rgba(255,255,255,0.55)'], [1, 'rgba(255,255,255,0)']]);
    c.fillRect(0, 0, 64, 64);
  });
  paint(scene, 'pk-bump', 80, 80, (c) => {
    circle(c, 40, 40, 38, radial(c, 40, 40, 38, [[0.6, 'rgba(255,79,163,0.55)'], [1, 'rgba(255,79,163,0)']]));
    circle(c, 40, 40, 30, radial(c, 40, 40, 30, [[0, '#ffd0ea'], [0.55, '#ff4fa3'], [1, '#8a1155']], 32, 30));
    c.lineWidth = 4; c.strokeStyle = '#ffffff';
    c.beginPath(); c.arc(40, 40, 21, 0, Math.PI * 2); c.stroke();
    circle(c, 40, 40, 11, radial(c, 40, 40, 11, [[0, '#ffffff'], [1, '#ffc2e2']], 37, 36));
    circle(c, 31, 30, 4, 'rgba(255,255,255,0.85)');
  });
  paint(scene, 'pk-bar', 136, 24, (c) => {
    const g = c.createLinearGradient(0, 2, 0, 22);
    g.addColorStop(0, '#d9fbff'); g.addColorStop(0.45, '#3ee6ff'); g.addColorStop(1, '#0a6c9c');
    c.fillStyle = 'rgba(62,230,255,0.25)'; capsule(c, 0, 0, 136, 24); c.fill();
    c.fillStyle = g; capsule(c, 2, 3, 132, 18); c.fill();
    c.fillStyle = 'rgba(255,255,255,0.7)'; capsule(c, 10, 6, 112, 4); c.fill();
  });
  paint(scene, 'pk-spin', 236, 20, (c) => {
    const g = c.createLinearGradient(0, 0, 0, 20);
    g.addColorStop(0, '#fff1c2'); g.addColorStop(0.5, '#ff9f1c'); g.addColorStop(1, '#a14b00');
    c.fillStyle = g; capsule(c, 0, 1, 236, 18); c.fill();
    c.fillStyle = 'rgba(255,255,255,0.6)'; capsule(c, 10, 4, 216, 4); c.fill();
  });
  paint(scene, 'pk-hub', 44, 44, (c) => {
    circle(c, 22, 22, 20, radial(c, 22, 22, 20, [[0, '#ffffff'], [0.5, '#ffd23f'], [1, '#b56d00']], 17, 16));
    circle(c, 22, 22, 6, '#5a2d00');
  });
  for (const kind of Object.keys(BALL_LOOK) as BallKind[]) {
    const look = BALL_LOOK[kind];
    paint(scene, `pk-ball-${kind}`, 64, 64, (c) => {
      const ghost = kind === 'ghost';
      if (ghost) c.globalAlpha = 0.72;
      circle(c, 32, 32, 30, radial(c, 32, 32, 30, [[0, look.hi], [0.45, look.body], [1, look.lo]], 23, 21));
      if (kind === 'heavy') {
        c.lineWidth = 4; c.strokeStyle = 'rgba(20,24,34,0.8)';
        c.beginPath(); c.arc(32, 32, 27, 0, Math.PI * 2); c.stroke();
        c.fillStyle = 'rgba(30,34,46,0.75)';
        for (const [x, y] of [[32, 12], [52, 32], [32, 52], [12, 32]]) circle(c, x, y, 3.2, c.fillStyle);
      } else if (kind === 'split' || kind === 'shard') {
        c.lineWidth = 3; c.strokeStyle = 'rgba(255,255,255,0.8)';
        c.beginPath(); c.moveTo(32, 4); c.lineTo(26, 22); c.lineTo(38, 36); c.lineTo(30, 60); c.stroke();
      } else if (kind === 'gold') {
        c.fillStyle = 'rgba(255,255,255,0.85)';
        starPath(c, 32, 33, 13, 5.5); c.fill();
      } else if (ghost) {
        c.globalAlpha = 1;
        c.fillStyle = '#2d2466';
        circle(c, 24, 30, 4, c.fillStyle); circle(c, 40, 30, 4, c.fillStyle);
        c.beginPath(); c.ellipse(32, 42, 5, 3.5, 0, 0, Math.PI * 2); c.fill();
      }
      c.globalAlpha = 1;
      // glossy highlight
      c.fillStyle = radial(c, 23, 19, 11, [[0, 'rgba(255,255,255,0.95)'], [1, 'rgba(255,255,255,0)']]);
      c.beginPath(); c.ellipse(23, 19, 11, 8, -0.6, 0, Math.PI * 2); c.fill();
    });
  }
  paint(scene, 'pk-star', 64, 64, (c) => {
    c.fillStyle = 'rgba(0,0,0,0.35)'; starPath(c, 32, 35, 29, 13); c.fill();
    const g = c.createLinearGradient(0, 4, 0, 60);
    g.addColorStop(0, '#fff6b0'); g.addColorStop(0.5, '#ffd23f'); g.addColorStop(1, '#e08600');
    c.fillStyle = g; starPath(c, 32, 32, 29, 13); c.fill();
    c.lineWidth = 3; c.strokeStyle = '#8a4b00'; c.stroke();
    c.fillStyle = 'rgba(255,255,255,0.7)'; starPath(c, 27, 24, 8, 3.5); c.fill();
  });
  paint(scene, 'pk-star-off', 64, 64, (c) => {
    c.fillStyle = 'rgba(60,48,120,0.95)'; starPath(c, 32, 32, 29, 13); c.fill();
    c.lineWidth = 3; c.strokeStyle = 'rgba(205,200,240,0.85)'; c.stroke();
  });
  paint(scene, 'pk-dropper', 72, 48, (c) => {
    const g = c.createLinearGradient(0, 0, 0, 48);
    g.addColorStop(0, '#f3f0ff'); g.addColorStop(0.5, '#a99cff'); g.addColorStop(1, '#4b3bb0');
    c.fillStyle = g;
    c.beginPath();
    c.moveTo(6, 4); c.lineTo(66, 4); c.lineTo(52, 40); c.quadraticCurveTo(36, 48, 20, 40); c.closePath();
    c.fill();
    c.fillStyle = 'rgba(255,255,255,0.6)'; c.fillRect(12, 8, 48, 4);
  });
}

function roundRect(c: Ctx, x: number, y: number, w: number, h: number, r: number): void {
  c.beginPath();
  c.moveTo(x + r, y);
  c.arcTo(x + w, y, x + w, y + h, r);
  c.arcTo(x + w, y + h, x, y + h, r);
  c.arcTo(x, y + h, x, y, r);
  c.arcTo(x, y, x + w, y, r);
  c.closePath();
}
