import Phaser from 'phaser';

/** Painted textures for Block Burst: a deep backdrop, a frosted-glass board and tray, glows and beams. */

type Ctx = CanvasRenderingContext2D;

function make(scene: Phaser.Scene, key: string, w: number, h: number, draw: (c: Ctx) => void): void {
  if (scene.textures.exists(key)) return;
  const tex = scene.textures.createCanvas(key, w, h);
  if (!tex) return;
  draw(tex.getContext());
  tex.refresh();
}

function rr(c: Ctx, x: number, y: number, w: number, h: number, r: number): void {
  c.beginPath();
  c.moveTo(x + r, y);
  c.arcTo(x + w, y, x + w, y + h, r);
  c.arcTo(x + w, y + h, x, y + h, r);
  c.arcTo(x, y + h, x, y, r);
  c.arcTo(x, y, x + w, y, r);
  c.closePath();
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

/** Night-violet backdrop with soft colour blooms and a faint grid. */
export function makeBackdrop(scene: Phaser.Scene): void {
  make(scene, 'bb-bg', 720, 1280, (c) => {
    const g = c.createLinearGradient(0, 0, 0, 1280);
    g.addColorStop(0, '#1b1446'); g.addColorStop(0.5, '#120e30'); g.addColorStop(1, '#0a0820');
    c.fillStyle = g; c.fillRect(0, 0, 720, 1280);
    const rnd = seeded(8);
    for (const col of ['#8b5cff', '#3ea8ff', '#ff79c6', '#5dd65d', '#ffd23f']) {
      const x = rnd() * 720, y = rnd() * 1280, r = 220 + rnd() * 260;
      const b = c.createRadialGradient(x, y, 0, x, y, r);
      b.addColorStop(0, col + '33'); b.addColorStop(1, col + '00');
      c.fillStyle = b; c.fillRect(0, 0, 720, 1280);
    }
    c.strokeStyle = 'rgba(255,255,255,0.025)'; c.lineWidth = 1;
    for (let x = 0; x < 720; x += 40) { c.beginPath(); c.moveTo(x, 0); c.lineTo(x, 1280); c.stroke(); }
    for (let y = 0; y < 1280; y += 40) { c.beginPath(); c.moveTo(0, y); c.lineTo(720, y); c.stroke(); }
    const v = c.createRadialGradient(360, 640, 320, 360, 640, 860);
    v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(1, 'rgba(0,0,0,0.5)');
    c.fillStyle = v; c.fillRect(0, 0, 720, 1280);
  });
}

/** The board: a frosted-glass slab with recessed cells and a glowing rim. */
export function makeBoard(scene: Phaser.Scene, n: number, cell: number): string {
  const pad = 18, size = n * cell + pad * 2, key = 'bb-board';
  make(scene, key, size + 40, size + 40, (c) => {
    c.translate(20, 20);
    c.save(); c.shadowColor = 'rgba(0,0,0,0.6)'; c.shadowBlur = 26; c.shadowOffsetY = 10;
    rr(c, 0, 0, size, size, 26); c.fillStyle = 'rgba(16,12,40,0.88)'; c.fill(); c.restore();
    const g = c.createLinearGradient(0, 0, 0, size);
    g.addColorStop(0, 'rgba(255,255,255,0.14)'); g.addColorStop(0.4, 'rgba(255,255,255,0.03)'); g.addColorStop(1, 'rgba(139,92,255,0.12)');
    rr(c, 0, 0, size, size, 26); c.fillStyle = g; c.fill();
    c.save(); c.shadowColor = '#8b5cff'; c.shadowBlur = 18;
    rr(c, 1, 1, size - 2, size - 2, 25); c.strokeStyle = 'rgba(170,140,255,0.9)'; c.lineWidth = 3; c.stroke(); c.restore();
    for (let r = 0; r < n; r++) for (let k = 0; k < n; k++) {
      const x = pad + k * cell + 4, y = pad + r * cell + 4, s = cell - 8;
      rr(c, x, y, s, s, 10);
      const cg = c.createLinearGradient(0, y, 0, y + s);
      cg.addColorStop(0, 'rgba(0,0,0,0.45)'); cg.addColorStop(1, 'rgba(255,255,255,0.06)');
      c.fillStyle = cg; c.fill();
      c.strokeStyle = 'rgba(255,255,255,0.07)'; c.lineWidth = 1.5; c.stroke();
    }
  });
  return key;
}

/** A frosted glass panel (tray, labels). */
export function glass(scene: Phaser.Scene, w: number, h: number, r = 22): string {
  const key = `bb-glass-${w}x${h}`, pad = 12;
  make(scene, key, w + pad * 2, h + pad * 2, (c) => {
    c.save(); c.shadowColor = 'rgba(0,0,0,0.5)'; c.shadowBlur = 14; c.shadowOffsetY = 5;
    rr(c, pad, pad, w, h, r); c.fillStyle = 'rgba(16,12,40,0.7)'; c.fill(); c.restore();
    const g = c.createLinearGradient(0, pad, 0, pad + h);
    g.addColorStop(0, 'rgba(255,255,255,0.16)'); g.addColorStop(0.5, 'rgba(255,255,255,0.03)'); g.addColorStop(1, 'rgba(255,255,255,0.07)');
    rr(c, pad, pad, w, h, r); c.fillStyle = g; c.fill();
    c.lineWidth = 1.5; c.strokeStyle = 'rgba(255,255,255,0.32)'; c.stroke();
  });
  return key;
}

export function makeFx(scene: Phaser.Scene): void {
  make(scene, 'bb-glow', 128, 128, (c) => {
    const g = c.createRadialGradient(64, 64, 0, 64, 64, 64);
    g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.3, 'rgba(255,255,255,0.4)'); g.addColorStop(1, 'rgba(255,255,255,0)');
    c.fillStyle = g; c.fillRect(0, 0, 128, 128);
  });
  // a soft horizontal beam (rotated for columns)
  make(scene, 'bb-beam', 256, 64, (c) => {
    const g = c.createLinearGradient(0, 0, 0, 64);
    g.addColorStop(0, 'rgba(255,255,255,0)'); g.addColorStop(0.5, 'rgba(255,255,255,1)'); g.addColorStop(1, 'rgba(255,255,255,0)');
    c.fillStyle = g; c.fillRect(0, 0, 256, 64);
  });
  make(scene, 'bb-ring', 128, 128, (c) => {
    c.shadowColor = '#ffffff'; c.shadowBlur = 10;
    c.beginPath(); c.arc(64, 64, 50, 0, Math.PI * 2); c.strokeStyle = '#ffffff'; c.lineWidth = 6; c.stroke();
  });
  // the shadow a lifted piece casts on the board
  make(scene, 'bb-shade', 64, 64, (c) => {
    rr(c, 4, 4, 56, 56, 12); c.fillStyle = 'rgba(0,0,0,0.5)'; c.fill();
  });
}
