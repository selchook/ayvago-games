import Phaser from 'phaser';

/** Painted textures for Asteroid Storm: a drifting nebula, star layers, a planet, glows and banners. */

type Ctx = CanvasRenderingContext2D;

function make(scene: Phaser.Scene, key: string, w: number, h: number, draw: (c: Ctx) => void): void {
  if (scene.textures.exists(key)) return;
  const tex = scene.textures.createCanvas(key, w, h);
  if (!tex) return;
  const c = tex.getContext();
  c.save();
  draw(c);
  c.restore();
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

/** Deep space with nebula clouds; tiles seamlessly top to bottom so it can scroll. */
export function makeNebula(scene: Phaser.Scene, w: number, h: number): void {
  make(scene, 'as-nebula', w, h, (c) => {
    c.fillStyle = '#05070f'; c.fillRect(0, 0, w, h);
    const rnd = seeded(41);
    const cols = ['#1f6bff', '#00c2a8', '#ff8a3d', '#3a2bd8', '#2ad4ff'];
    for (let i = 0; i < 16; i++) {
      const x = rnd() * w, y = rnd() * h, r = 140 + rnd() * 260, col = cols[i % cols.length];
      // draw each cloud three times (one tile up and down) so the texture wraps
      for (const dy of [-h, 0, h]) {
        const g = c.createRadialGradient(x, y + dy, 0, x, y + dy, r);
        g.addColorStop(0, col + '33'); g.addColorStop(0.5, col + '14'); g.addColorStop(1, col + '00');
        c.fillStyle = g; c.fillRect(0, 0, w, h);
      }
    }
    // dark dust lanes
    for (let i = 0; i < 6; i++) {
      const x = rnd() * w, y = rnd() * h, r = 120 + rnd() * 160;
      for (const dy of [-h, 0, h]) {
        const g = c.createRadialGradient(x, y + dy, 0, x, y + dy, r);
        g.addColorStop(0, 'rgba(0,0,0,0.35)'); g.addColorStop(1, 'rgba(0,0,0,0)');
        c.fillStyle = g; c.fillRect(0, 0, w, h);
      }
    }
  });
}

/** A transparent layer of stars (near = bigger, brighter, a few with a cross glint). */
export function makeStars(scene: Phaser.Scene, key: string, w: number, h: number, n: number, near: boolean, seed: number): void {
  make(scene, key, w, h, (c) => {
    const rnd = seeded(seed);
    for (let i = 0; i < n; i++) {
      const x = Math.round(rnd() * w), y = Math.round(rnd() * h);
      const a = (near ? 0.55 : 0.25) + rnd() * 0.45;
      const tint = rnd();
      c.fillStyle = tint < 0.15 ? `rgba(160,200,255,${a})` : tint < 0.25 ? `rgba(255,220,180,${a})` : `rgba(255,255,255,${a})`;
      const s = near ? (rnd() < 0.3 ? 3 : 2) : rnd() < 0.2 ? 2 : 1;
      c.fillRect(x, y, s, s);
      if (near && rnd() < 0.08) {
        c.fillStyle = `rgba(255,255,255,${a * 0.5})`;
        c.fillRect(x - 4, y + 1, 10, 1); c.fillRect(x + 1, y - 4, 1, 10);
      }
    }
  });
}

/** A distant ringed planet. */
export function makePlanet(scene: Phaser.Scene): void {
  make(scene, 'as-planet', 320, 220, (c) => {
    const cx = 160, cy = 110, r = 72;
    const ring = (front: boolean) => {
      c.save(); c.translate(cx, cy); c.rotate(-0.35);
      c.beginPath(); c.ellipse(0, 0, 150, 30, 0, front ? 0 : Math.PI, front ? Math.PI : Math.PI * 2);
      c.strokeStyle = 'rgba(170,220,255,0.5)'; c.lineWidth = 9; c.stroke();
      c.strokeStyle = 'rgba(255,240,220,0.35)'; c.lineWidth = 3; c.stroke();
      c.restore();
    };
    ring(false);
    const g = c.createRadialGradient(cx - 26, cy - 30, 8, cx, cy, r);
    g.addColorStop(0, '#bff4ff'); g.addColorStop(0.5, '#3b8fc2'); g.addColorStop(1, '#0a1f3a');
    c.fillStyle = g; c.beginPath(); c.arc(cx, cy, r, 0, Math.PI * 2); c.fill();
    c.save(); c.beginPath(); c.arc(cx, cy, r, 0, Math.PI * 2); c.clip();
    c.fillStyle = 'rgba(255,255,255,0.08)';
    for (let i = -3; i <= 3; i++) c.fillRect(cx - r, cy + i * 18 - 4, r * 2, 6);
    c.restore();
    ring(true);
  });
}

export function makeFx(scene: Phaser.Scene): void {
  make(scene, 'as-glow', 128, 128, (c) => {
    const g = c.createRadialGradient(64, 64, 0, 64, 64, 64);
    g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.25, 'rgba(255,255,255,0.5)'); g.addColorStop(1, 'rgba(255,255,255,0)');
    c.fillStyle = g; c.fillRect(0, 0, 128, 128);
  });
  make(scene, 'as-ring', 128, 128, (c) => {
    c.shadowColor = '#ffffff'; c.shadowBlur = 8;
    c.strokeStyle = '#ffffff'; c.lineWidth = 6;
    c.beginPath(); c.arc(64, 64, 54, 0, Math.PI * 2); c.stroke();
  });
  make(scene, 'as-vig', 180, 320, (c) => {
    const g = c.createRadialGradient(90, 160, 45, 90, 160, 185);
    g.addColorStop(0, 'rgba(236,48,19,0)'); g.addColorStop(1, 'rgba(236,48,19,0.9)');
    c.fillStyle = g; c.fillRect(0, 0, 180, 320);
  });
  make(scene, 'as-ribbon', 512, 120, (c) => {
    const g = c.createLinearGradient(0, 0, 512, 0);
    g.addColorStop(0, 'rgba(10,8,30,0)'); g.addColorStop(0.15, 'rgba(10,8,30,0.9)'); g.addColorStop(0.85, 'rgba(10,8,30,0.9)'); g.addColorStop(1, 'rgba(10,8,30,0)');
    c.fillStyle = g; c.fillRect(0, 10, 512, 100);
    const e = c.createLinearGradient(0, 0, 512, 0);
    e.addColorStop(0, 'rgba(255,255,255,0)'); e.addColorStop(0.2, '#ffffff'); e.addColorStop(0.8, '#ffffff'); e.addColorStop(1, 'rgba(255,255,255,0)');
    c.fillStyle = e; c.fillRect(0, 6, 512, 3); c.fillRect(0, 111, 512, 3);
  });
}
