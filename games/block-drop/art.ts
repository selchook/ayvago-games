import Phaser from 'phaser';

/** Painted textures for Block Drop: themed backdrops, the glass well, panels, buttons and glows. */

type Ctx = CanvasRenderingContext2D;

function make(scene: Phaser.Scene, key: string, w: number, h: number, draw: (c: Ctx) => void): string {
  if (scene.textures.exists(key)) return key;
  const tex = scene.textures.createCanvas(key, w, h);
  if (!tex) return key;
  const c = tex.getContext();
  c.save();
  draw(c);
  c.restore();
  tex.refresh();
  return key;
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

function rr(c: Ctx, x: number, y: number, w: number, h: number, r: number): void {
  c.beginPath();
  c.moveTo(x + r, y);
  c.arcTo(x + w, y, x + w, y + h, r);
  c.arcTo(x + w, y + h, x, y + h, r);
  c.arcTo(x, y + h, x, y, r);
  c.arcTo(x, y, x + w, y, r);
  c.closePath();
}

/** Colour themes; every level moves to the next one. `rim` colours the well and the panels. */
export const THEMES = [
  { top: '#1a1146', bottom: '#07051a', blobs: ['#8b5cff', '#3ea8ff', '#ff4fa3'], rim: 0x8b5cff, css: '#a98bff' },
  { top: '#0a2a4a', bottom: '#020a18', blobs: ['#3ee6ff', '#2a6bff', '#5dff9a'], rim: 0x3ec8ff, css: '#7fe0ff' },
  { top: '#3a0f3a', bottom: '#12030f', blobs: ['#ff4fa3', '#ff8a3d', '#b36bff'], rim: 0xff4fa3, css: '#ff8ac8' },
  { top: '#0d3326', bottom: '#020f0a', blobs: ['#5dff7a', '#00c2a8', '#ffd23f'], rim: 0x5dff7a, css: '#8dffa6' },
  { top: '#3d2408', bottom: '#120802', blobs: ['#ffd23f', '#ff8a3d', '#ff4040'], rim: 0xffb02e, css: '#ffd27a' },
] as const;

/** Night backdrop for a theme: gradient, soft colour blooms, pixel stars and a faint diagonal weave. */
export function makeBackdrop(scene: Phaser.Scene, i: number): string {
  const th = THEMES[i % THEMES.length];
  return make(scene, `bd-bg${i % THEMES.length}`, 720, 1280, (c) => {
    const g = c.createLinearGradient(0, 0, 0, 1280);
    g.addColorStop(0, th.top); g.addColorStop(1, th.bottom);
    c.fillStyle = g; c.fillRect(0, 0, 720, 1280);
    const rnd = seeded(21 + i);
    for (let k = 0; k < 6; k++) {
      const x = rnd() * 720, y = rnd() * 1280, r = 220 + rnd() * 260, col = th.blobs[k % th.blobs.length];
      const b = c.createRadialGradient(x, y, 0, x, y, r);
      b.addColorStop(0, col + '30'); b.addColorStop(1, col + '00');
      c.fillStyle = b; c.fillRect(0, 0, 720, 1280);
    }
    for (let k = 0; k < 120; k++) {
      c.fillStyle = `rgba(255,255,255,${0.1 + rnd() * 0.4})`;
      const s = rnd() < 0.85 ? 2 : 3;
      c.fillRect(Math.round(rnd() * 720), Math.round(rnd() * 1280), s, s);
    }
    c.strokeStyle = 'rgba(255,255,255,0.025)'; c.lineWidth = 2;
    for (let x = -1280; x < 720; x += 24) { c.beginPath(); c.moveTo(x, 0); c.lineTo(x + 1280, 1280); c.stroke(); }
  });
}

/** The well: smoked glass with a dotted cell grid, an inner shadow and a highlight along the top. */
export function makeWell(scene: Phaser.Scene, cols: number, rows: number, cell: number): string {
  const pad = 10, w = cols * cell + pad * 2, h = rows * cell + pad * 2;
  return make(scene, 'bd-well', w, h, (c) => {
    rr(c, 0, 0, w, h, 14); c.fillStyle = 'rgba(4,3,14,0.82)'; c.fill();
    const g = c.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, 'rgba(255,255,255,0.07)'); g.addColorStop(0.3, 'rgba(255,255,255,0.01)'); g.addColorStop(1, 'rgba(255,255,255,0.04)');
    rr(c, 0, 0, w, h, 14); c.fillStyle = g; c.fill();
    for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) {
      const cx = pad + x * cell, cy = pad + y * cell;
      c.fillStyle = 'rgba(255,255,255,0.025)'; rr(c, cx + 3, cy + 3, cell - 6, cell - 6, 6); c.fill();
      c.fillStyle = 'rgba(255,255,255,0.09)'; c.fillRect(cx - 1, cy - 1, 2, 2);
    }
    // inner shadow
    c.save(); rr(c, 0, 0, w, h, 14); c.clip();
    c.shadowColor = 'rgba(0,0,0,0.9)'; c.shadowBlur = 24;
    c.strokeStyle = 'rgba(0,0,0,0.9)'; c.lineWidth = 16; rr(c, -8, -8, w + 16, h + 16, 20); c.stroke();
    c.restore();
  });
}

/** A glowing rim drawn in white so it can be tinted with the theme colour. */
export function makeRim(scene: Phaser.Scene, key: string, w: number, h: number, r = 14): string {
  const p = 22;
  return make(scene, key, w + p * 2, h + p * 2, (c) => {
    c.save(); c.shadowColor = '#ffffff'; c.shadowBlur = 18;
    c.strokeStyle = 'rgba(255,255,255,0.55)'; c.lineWidth = 6; rr(c, p, p, w, h, r); c.stroke(); c.restore();
    c.strokeStyle = '#ffffff'; c.lineWidth = 3; rr(c, p, p, w, h, r); c.stroke();
  });
}

/** A frosted glass panel (hold, next, stats). */
export function makeGlass(scene: Phaser.Scene, w: number, h: number, r = 16): string {
  const pad = 12;
  return make(scene, `bd-glass-${w}x${h}`, w + pad * 2, h + pad * 2, (c) => {
    c.save(); c.shadowColor = 'rgba(0,0,0,0.55)'; c.shadowBlur = 16; c.shadowOffsetY = 6;
    rr(c, pad, pad, w, h, r); c.fillStyle = 'rgba(8,6,24,0.72)'; c.fill(); c.restore();
    const g = c.createLinearGradient(0, pad, 0, pad + h);
    g.addColorStop(0, 'rgba(255,255,255,0.13)'); g.addColorStop(0.45, 'rgba(255,255,255,0.02)'); g.addColorStop(1, 'rgba(255,255,255,0.05)');
    rr(c, pad, pad, w, h, r); c.fillStyle = g; c.fill();
    c.lineWidth = 1.5; c.strokeStyle = 'rgba(255,255,255,0.28)'; c.stroke();
  });
}

/** A chunky touch button in the given colour. */
export function makeButton(scene: Phaser.Scene, key: string, w: number, h: number, color: string): string {
  return make(scene, key, w + 8, h + 14, (c) => {
    c.fillStyle = 'rgba(0,0,0,0.55)'; rr(c, 4, 10, w, h, 18); c.fill();
    const g = c.createLinearGradient(0, 4, 0, 4 + h);
    g.addColorStop(0, color); g.addColorStop(1, 'rgba(10,8,30,0.95)');
    rr(c, 4, 4, w, h, 18); c.fillStyle = 'rgba(14,10,36,0.92)'; c.fill();
    c.globalAlpha = 0.55; rr(c, 4, 4, w, h, 18); c.fillStyle = g; c.fill(); c.globalAlpha = 1;
    c.fillStyle = 'rgba(255,255,255,0.16)'; rr(c, 12, 10, w - 16, h * 0.32, 12); c.fill();
    c.save(); c.shadowColor = color; c.shadowBlur = 12;
    c.strokeStyle = color; c.lineWidth = 4; rr(c, 6, 6, w - 4, h - 4, 16); c.stroke(); c.restore();
  });
}

export function makeFx(scene: Phaser.Scene): void {
  make(scene, 'bd-glow', 128, 128, (c) => {
    const g = c.createRadialGradient(64, 64, 0, 64, 64, 64);
    g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.3, 'rgba(255,255,255,0.45)'); g.addColorStop(1, 'rgba(255,255,255,0)');
    c.fillStyle = g; c.fillRect(0, 0, 128, 128);
  });
  make(scene, 'bd-beam', 256, 64, (c) => {
    const g = c.createLinearGradient(0, 0, 0, 64);
    g.addColorStop(0, 'rgba(255,255,255,0)'); g.addColorStop(0.5, 'rgba(255,255,255,1)'); g.addColorStop(1, 'rgba(255,255,255,0)');
    c.fillStyle = g; c.fillRect(0, 0, 256, 64);
  });
  // a vertical lane of light (for the active piece's columns)
  make(scene, 'bd-lane', 32, 256, (c) => {
    const g = c.createLinearGradient(0, 0, 0, 256);
    g.addColorStop(0, 'rgba(255,255,255,0)'); g.addColorStop(0.25, 'rgba(255,255,255,0.6)'); g.addColorStop(1, 'rgba(255,255,255,1)');
    c.fillStyle = g; c.fillRect(0, 0, 32, 256);
  });
  // the warning glow along the top of the well
  make(scene, 'bd-danger', 64, 128, (c) => {
    const g = c.createLinearGradient(0, 0, 0, 128);
    g.addColorStop(0, 'rgba(255,40,40,0.95)'); g.addColorStop(1, 'rgba(255,40,40,0)');
    c.fillStyle = g; c.fillRect(0, 0, 64, 128);
  });
  make(scene, 'bd-ring', 128, 128, (c) => {
    c.strokeStyle = '#ffffff'; c.lineWidth = 6;
    c.beginPath(); c.arc(64, 64, 56, 0, Math.PI * 2); c.stroke();
  });
  make(scene, 'bd-shard', 20, 20, (c) => {
    c.fillStyle = '#ffffff'; rr(c, 2, 2, 16, 16, 3); c.fill();
    c.fillStyle = 'rgba(0,0,0,0.25)'; c.fillRect(2, 11, 16, 7);
  });
  // ribbon behind the big line-clear words
  make(scene, 'bd-ribbon', 512, 120, (c) => {
    const g = c.createLinearGradient(0, 0, 0, 120);
    g.addColorStop(0, 'rgba(12,8,30,0.92)'); g.addColorStop(1, 'rgba(4,3,12,0.92)');
    c.fillStyle = g; c.fillRect(0, 10, 512, 100);
    c.fillStyle = '#ffffff'; c.fillRect(0, 4, 512, 4); c.fillRect(0, 112, 512, 4);
  });
}
