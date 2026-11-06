import Phaser from 'phaser';

/** Painted textures for Color Gate: night-sky backdrop, parallax star layers, a glossy ball, glows and glass. */

type Ctx = CanvasRenderingContext2D;
const TAU = Math.PI * 2;

function make(scene: Phaser.Scene, key: string, w: number, h: number, draw: (c: Ctx) => void): void {
  if (scene.textures.exists(key)) return;
  const tex = scene.textures.createCanvas(key, w, h);
  if (!tex) return;
  draw(tex.getContext());
  tex.refresh();
}

function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), a | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const css = (n: number, a = 1): string => `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;

function roundRect(c: Ctx, x: number, y: number, w: number, h: number, r: number): void {
  c.beginPath();
  c.moveTo(x + r, y);
  c.arcTo(x + w, y, x + w, y + h, r);
  c.arcTo(x + w, y + h, x, y + h, r);
  c.arcTo(x, y + h, x, y, r);
  c.arcTo(x, y, x + w, y, r);
  c.closePath();
}

export function makeArt(scene: Phaser.Scene, palette: number[]): void {
  // backdrop: a deep violet night with soft colour clouds (fixed to the screen)
  make(scene, 'cg-sky', 720, 1280, (c) => {
    const g = c.createLinearGradient(0, 0, 0, 1280);
    g.addColorStop(0, '#0b0820'); g.addColorStop(0.55, '#1a1036'); g.addColorStop(1, '#2a1240');
    c.fillStyle = g; c.fillRect(0, 0, 720, 1280);
    const rnd = seeded(3);
    for (let i = 0; i < 9; i++) {
      const x = rnd() * 720, y = rnd() * 1280, r = 160 + rnd() * 260;
      const n = c.createRadialGradient(x, y, 0, x, y, r);
      n.addColorStop(0, css(palette[i % palette.length], 0.12)); n.addColorStop(1, css(palette[i % palette.length], 0));
      c.fillStyle = n; c.fillRect(0, 0, 720, 1280);
    }
    const v = c.createRadialGradient(360, 640, 300, 360, 640, 860);
    v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(1, 'rgba(0,0,0,0.55)');
    c.fillStyle = v; c.fillRect(0, 0, 720, 1280);
  });
  // two tiling star layers for parallax
  for (const [key, n, big, seed] of [['cg-stars-far', 90, 0.08, 11], ['cg-stars-near', 40, 0.3, 12]] as const) {
    make(scene, key, 256, 256, (c) => {
      const rnd = seeded(seed);
      for (let i = 0; i < n; i++) {
        const x = rnd() * 256, y = rnd() * 256, large = rnd() < big;
        const col = rnd() < 0.6 ? 0xffffff : palette[Math.floor(rnd() * palette.length)];
        if (large) {
          const g = c.createRadialGradient(x, y, 0, x, y, 7);
          g.addColorStop(0, css(col, 0.9)); g.addColorStop(1, css(col, 0));
          c.fillStyle = g; c.fillRect(x - 7, y - 7, 14, 14);
        } else { c.fillStyle = css(col, 0.35 + rnd() * 0.4); c.fillRect(x, y, 1.6, 1.6); }
      }
    });
  }
  // glossy ball (grey, tinted to the player's colour)
  make(scene, 'cg-ball', 64, 64, (c) => {
    const g = c.createRadialGradient(24, 22, 2, 32, 32, 30);
    g.addColorStop(0, '#ffffff'); g.addColorStop(0.35, '#e8e8e8'); g.addColorStop(0.85, '#9a9a9a'); g.addColorStop(1, '#6a6a6a');
    c.beginPath(); c.arc(32, 32, 29, 0, TAU); c.fillStyle = g; c.fill();
    c.lineWidth = 3; c.strokeStyle = 'rgba(255,255,255,0.9)'; c.stroke();
    const s = c.createRadialGradient(22, 20, 0, 22, 20, 10);
    s.addColorStop(0, 'rgba(255,255,255,0.95)'); s.addColorStop(1, 'rgba(255,255,255,0)');
    c.fillStyle = s; c.fillRect(10, 8, 26, 26);
  });
  make(scene, 'cg-glow', 128, 128, (c) => {
    const g = c.createRadialGradient(64, 64, 0, 64, 64, 64);
    g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.3, 'rgba(255,255,255,0.4)'); g.addColorStop(1, 'rgba(255,255,255,0)');
    c.fillStyle = g; c.fillRect(0, 0, 128, 128);
  });
  make(scene, 'cg-ring', 256, 256, (c) => {
    c.shadowColor = '#ffffff'; c.shadowBlur = 14;
    c.beginPath(); c.arc(128, 128, 110, 0, TAU); c.strokeStyle = '#ffffff'; c.lineWidth = 8; c.stroke();
  });
  // the colour switcher: a glossy orb split in four
  make(scene, 'cg-orb', 72, 72, (c) => {
    palette.forEach((col, i) => {
      c.beginPath(); c.moveTo(36, 36); c.arc(36, 36, 30, (i * TAU) / 4, ((i + 1) * TAU) / 4); c.closePath();
      c.fillStyle = css(col); c.fill();
    });
    const g = c.createRadialGradient(26, 24, 2, 36, 36, 32);
    g.addColorStop(0, 'rgba(255,255,255,0.75)'); g.addColorStop(0.4, 'rgba(255,255,255,0.1)'); g.addColorStop(1, 'rgba(0,0,0,0.35)');
    c.beginPath(); c.arc(36, 36, 30, 0, TAU); c.fillStyle = g; c.fill();
    c.lineWidth = 3; c.strokeStyle = '#ffffff'; c.stroke();
  });
}

/** A dark glass pill with a light rim. */
export function glass(scene: Phaser.Scene, w: number, h: number): string {
  const key = `cg-glass-${w}x${h}`, pad = 10;
  make(scene, key, w + pad * 2, h + pad * 2, (c) => {
    c.save(); c.shadowColor = 'rgba(0,0,0,0.5)'; c.shadowBlur = 10; c.shadowOffsetY = 3;
    roundRect(c, pad, pad, w, h, h / 2); c.fillStyle = 'rgba(14,10,30,0.6)'; c.fill(); c.restore();
    const g = c.createLinearGradient(0, pad, 0, pad + h);
    g.addColorStop(0, 'rgba(255,255,255,0.2)'); g.addColorStop(0.5, 'rgba(255,255,255,0.04)'); g.addColorStop(1, 'rgba(255,255,255,0.08)');
    roundRect(c, pad, pad, w, h, h / 2); c.fillStyle = g; c.fill();
    c.lineWidth = 1.5; c.strokeStyle = 'rgba(255,255,255,0.4)'; c.stroke();
  });
  return key;
}

/** A neon arc: a wide soft glow, the solid tube and a thin bright highlight. */
export function neonArc(g: Phaser.GameObjects.Graphics, r: number, a0: number, a1: number, t: number, col: number): void {
  const A0 = Phaser.Math.DegToRad(a0), A1 = Phaser.Math.DegToRad(a1);
  g.lineStyle(t + 22, col, 0.12).beginPath().arc(0, 0, r, A0, A1).strokePath();
  g.lineStyle(t + 10, col, 0.22).beginPath().arc(0, 0, r, A0, A1).strokePath();
  g.lineStyle(t, col, 1).beginPath().arc(0, 0, r, A0, A1).strokePath();
  g.lineStyle(4, 0xffffff, 0.55).beginPath().arc(0, 0, r - t * 0.22, A0 + 0.03, A1 - 0.03).strokePath();
}

/** A neon bar segment (top-left x, centre line y). */
export function neonBar(g: Phaser.GameObjects.Graphics, x: number, w: number, t: number, col: number): void {
  g.fillStyle(col, 0.12).fillRoundedRect(x - 8, -t / 2 - 10, w + 16, t + 20, 14);
  g.fillStyle(col, 0.22).fillRoundedRect(x - 3, -t / 2 - 5, w + 6, t + 10, 11);
  g.fillStyle(col, 1).fillRoundedRect(x, -t / 2, w, t, 8);
  g.fillStyle(0xffffff, 0.5).fillRoundedRect(x + 8, -t / 2 + 4, w - 16, 4, 2);
}
