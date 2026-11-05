import Phaser from 'phaser';

// Glass and light for Gem Match, painted once into canvas textures: a backdrop per colour theme
// (gradient and soft bokeh), a frosted-glass board made from a blurred copy of that backdrop, glass
// panels, a glossy progress bar, glow rings, a beam and a soft glow.

export const W = 720, H = 1280;

/** Colour themes; levels cycle through them. */
export const THEMES = [
  { name: 'amethyst', top: '#2a0f5c', bottom: '#0b0522', blobs: ['#ff4fd8', '#6a5cff', '#00d4ff'], accent: 0xb07cff },
  { name: 'ocean', top: '#06406f', bottom: '#020f22', blobs: ['#00e5ff', '#3d7bff', '#7cffcb'], accent: 0x3ee6ff },
  { name: 'emerald', top: '#0b4d3c', bottom: '#03150f', blobs: ['#3dff9a', '#00c2a8', '#c6ff4f'], accent: 0x5dff9a },
  { name: 'sunset', top: '#6e1c4c', bottom: '#170516', blobs: ['#ff8a3d', '#ff3d7f', '#ffd23f'], accent: 0xff8a5c },
  { name: 'ruby', top: '#5e0f24', bottom: '#12030a', blobs: ['#ff3d5a', '#ff9a3d', '#b45cff'], accent: 0xff5a7a },
] as const;

function canvas(scene: Phaser.Scene, key: string, w: number, h: number, draw: (c: CanvasRenderingContext2D) => void): void {
  if (scene.textures.exists(key)) return;
  const tex = scene.textures.createCanvas(key, w, h);
  if (!tex) return;
  draw(tex.getContext());
  tex.refresh();
}

function rr(c: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  c.beginPath();
  c.roundRect(x, y, w, h, r);
}

/** Deterministic little random for the bokeh, so a theme always looks the same. */
function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), a | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function paintBackdrop(c: CanvasRenderingContext2D, i: number): void {
  const th = THEMES[i];
  const g = c.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, th.top);
  g.addColorStop(1, th.bottom);
  c.fillStyle = g;
  c.fillRect(0, 0, W, H);
  const r = seeded(31 + i * 7);
  // big soft light blobs
  for (let k = 0; k < 6; k++) {
    const x = r() * W, y = r() * H, rad = 220 + r() * 260;
    const col = th.blobs[k % th.blobs.length];
    const rg = c.createRadialGradient(x, y, 0, x, y, rad);
    rg.addColorStop(0, col + '55');
    rg.addColorStop(1, col + '00');
    c.fillStyle = rg;
    c.fillRect(0, 0, W, H);
  }
  // small bokeh discs
  for (let k = 0; k < 26; k++) {
    const x = r() * W, y = r() * H, rad = 6 + r() * 26;
    const col = th.blobs[k % th.blobs.length];
    const rg = c.createRadialGradient(x, y, rad * 0.2, x, y, rad);
    rg.addColorStop(0, col + '40');
    rg.addColorStop(0.8, col + '22');
    rg.addColorStop(1, col + '00');
    c.fillStyle = rg;
    c.beginPath(); c.arc(x, y, rad, 0, Math.PI * 2); c.fill();
  }
  // a faint diagonal light from the top left
  const lg = c.createLinearGradient(0, 0, W, H * 0.6);
  lg.addColorStop(0, 'rgba(255,255,255,0.10)');
  lg.addColorStop(0.5, 'rgba(255,255,255,0)');
  c.fillStyle = lg;
  c.fillRect(0, 0, W, H);
  // vignette
  const vg = c.createRadialGradient(W / 2, H * 0.45, H * 0.25, W / 2, H * 0.5, H * 0.75);
  vg.addColorStop(0, 'rgba(0,0,0,0)');
  vg.addColorStop(1, 'rgba(0,0,0,0.45)');
  c.fillStyle = vg;
  c.fillRect(0, 0, W, H);
}

/** Backdrop texture of theme i: `gm-bg<i>`. */
export function makeBackdrop(scene: Phaser.Scene, i: number): string {
  const key = `gm-bg${i}`;
  canvas(scene, key, W, H, (c) => paintBackdrop(c, i));
  return key;
}

/**
 * Frosted-glass board of theme i (`gm-board<i>`): the part of the backdrop behind the board,
 * blurred, under a white sheen, with rounded glass cells. x, y is the board's top-left on screen.
 */
export function makeBoard(scene: Phaser.Scene, i: number, x: number, y: number, cols: number, rows: number, s: number, pad: number): string {
  const key = `gm-board${i}`;
  const bw = cols * s + pad * 2, bh = rows * s + pad * 2;
  canvas(scene, key, bw + 40, bh + 40, (c) => {
    const o = 20;                                  // room for the outer glow
    const src = scene.textures.get(makeBackdrop(scene, i)).getSourceImage() as HTMLCanvasElement;
    const th = THEMES[i];
    // glow and shadow around the panel
    c.save();
    c.shadowColor = '#' + th.accent.toString(16).padStart(6, '0');
    c.shadowBlur = 26;
    c.fillStyle = 'rgba(0,0,0,0.35)';
    rr(c, o, o, bw, bh, 28); c.fill();
    c.restore();
    // frosted glass: the backdrop behind, blurred
    c.save();
    rr(c, o, o, bw, bh, 28); c.clip();
    c.filter = 'blur(14px) saturate(1.3)';
    c.drawImage(src, x - pad - 30, y - pad - 30, bw + 60, bh + 60, o - 30, o - 30, bw + 60, bh + 60);
    c.filter = 'none';
    const sheen = c.createLinearGradient(0, o, 0, o + bh);
    sheen.addColorStop(0, 'rgba(255,255,255,0.20)');
    sheen.addColorStop(0.45, 'rgba(255,255,255,0.07)');
    sheen.addColorStop(1, 'rgba(255,255,255,0.12)');
    c.fillStyle = sheen;
    c.fillRect(o, o, bw, bh);
    c.fillStyle = 'rgba(10,6,30,0.28)';
    c.fillRect(o, o, bw, bh);
    // cells
    for (let r = 0; r < rows; r++) for (let k = 0; k < cols; k++) {
      const cx = o + pad + k * s + 3, cy = o + pad + r * s + 3, cs = s - 6;
      const cg = c.createLinearGradient(0, cy, 0, cy + cs);
      const a = (r + k) % 2 ? 0.10 : 0.16;
      cg.addColorStop(0, `rgba(255,255,255,${a + 0.06})`);
      cg.addColorStop(1, `rgba(255,255,255,${a - 0.04})`);
      c.fillStyle = cg;
      rr(c, cx, cy, cs, cs, 14); c.fill();
      c.strokeStyle = 'rgba(255,255,255,0.10)';
      c.lineWidth = 1;
      rr(c, cx + 0.5, cy + 0.5, cs - 1, cs - 1, 14); c.stroke();
    }
    // a light streak across the top
    const streak = c.createLinearGradient(o, o, o + bw * 0.7, o + bh * 0.35);
    streak.addColorStop(0, 'rgba(255,255,255,0.16)');
    streak.addColorStop(1, 'rgba(255,255,255,0)');
    c.fillStyle = streak;
    c.beginPath(); c.moveTo(o, o); c.lineTo(o + bw * 0.62, o); c.lineTo(o, o + bh * 0.42); c.closePath(); c.fill();
    c.restore();
    // rim
    c.strokeStyle = 'rgba(255,255,255,0.45)';
    c.lineWidth = 2;
    rr(c, o + 1, o + 1, bw - 2, bh - 2, 27); c.stroke();
    c.strokeStyle = 'rgba(255,255,255,0.12)';
    c.lineWidth = 6;
    rr(c, o + 5, o + 5, bw - 10, bh - 10, 24); c.stroke();
  });
  return key;
}

/** A glass card w x h with rounded corners: `gm-glass-<w>x<h>`. */
export function makeGlass(scene: Phaser.Scene, w: number, h: number, r = 22): string {
  const key = `gm-glass-${w}x${h}`;
  canvas(scene, key, w + 24, h + 24, (c) => {
    const o = 12;
    c.save();
    c.shadowColor = 'rgba(0,0,0,0.45)'; c.shadowBlur = 16; c.shadowOffsetY = 6;
    c.fillStyle = 'rgba(20,10,40,0.35)';
    rr(c, o, o, w, h, r); c.fill();
    c.restore();
    const g = c.createLinearGradient(0, o, 0, o + h);
    g.addColorStop(0, 'rgba(255,255,255,0.22)');
    g.addColorStop(0.5, 'rgba(255,255,255,0.08)');
    g.addColorStop(1, 'rgba(255,255,255,0.12)');
    c.fillStyle = g;
    rr(c, o, o, w, h, r); c.fill();
    const top = c.createLinearGradient(0, o, 0, o + h * 0.5);
    top.addColorStop(0, 'rgba(255,255,255,0.25)');
    top.addColorStop(1, 'rgba(255,255,255,0)');
    c.fillStyle = top;
    rr(c, o + 3, o + 3, w - 6, h * 0.45, r - 3); c.fill();
    c.strokeStyle = 'rgba(255,255,255,0.45)';
    c.lineWidth = 1.5;
    rr(c, o + 0.75, o + 0.75, w - 1.5, h - 1.5, r); c.stroke();
  });
  return key;
}

export function makeFx(scene: Phaser.Scene): void {
  canvas(scene, 'gm-glow', 128, 128, (c) => {
    const g = c.createRadialGradient(64, 64, 0, 64, 64, 64);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.3, 'rgba(255,255,255,0.5)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    c.fillStyle = g; c.fillRect(0, 0, 128, 128);
  });
  // selection ring: a rounded square of light
  const ring = (key: string, col: string) => canvas(scene, key, 112, 112, (c) => {
    c.shadowColor = col; c.shadowBlur = 14;
    c.strokeStyle = col; c.lineWidth = 5;
    rr(c, 14, 14, 84, 84, 20); c.stroke();
    c.shadowBlur = 0;
    c.strokeStyle = 'rgba(255,255,255,0.9)'; c.lineWidth = 2;
    rr(c, 14, 14, 84, 84, 20); c.stroke();
  });
  ring('gm-ring', '#ffd23f');
  ring('gm-cursor', '#7fe9ff');
  // a beam of light for line clears (horizontal; rotate for vertical)
  canvas(scene, 'gm-beam', 256, 64, (c) => {
    const v = c.createLinearGradient(0, 0, 0, 64);
    v.addColorStop(0, 'rgba(255,255,255,0)');
    v.addColorStop(0.5, 'rgba(255,255,255,1)');
    v.addColorStop(1, 'rgba(255,255,255,0)');
    c.fillStyle = v; c.fillRect(0, 0, 256, 64);
  });
  // progress bar: track and a glossy fill
  canvas(scene, 'gm-track', 660, 34, (c) => {
    c.fillStyle = 'rgba(0,0,0,0.35)'; rr(c, 2, 2, 656, 30, 15); c.fill();
    c.strokeStyle = 'rgba(255,255,255,0.35)'; c.lineWidth = 1.5; rr(c, 2.75, 2.75, 654.5, 28.5, 14); c.stroke();
  });
  canvas(scene, 'gm-fill', 648, 22, (c) => {
    const g = c.createLinearGradient(0, 0, 648, 0);
    g.addColorStop(0, '#3dffb0'); g.addColorStop(0.6, '#8bff5a'); g.addColorStop(1, '#ffd23f');
    c.fillStyle = g; rr(c, 0, 0, 648, 22, 11); c.fill();
    const s = c.createLinearGradient(0, 0, 0, 22);
    s.addColorStop(0, 'rgba(255,255,255,0.55)'); s.addColorStop(0.5, 'rgba(255,255,255,0.05)'); s.addColorStop(1, 'rgba(0,0,0,0.12)');
    c.fillStyle = s; rr(c, 0, 0, 648, 22, 11); c.fill();
  });
  // rainbow gem, line and bomb marks, drawn smoothly
  canvas(scene, 'gm-rainbow', 96, 96, (c) => {
    const cols = ['#ff4a3a', '#ffa53a', '#ffd23f', '#8be03a', '#3eb4ff', '#b07cff'];
    for (let k = 0; k < 6; k++) {
      c.fillStyle = cols[k];
      c.beginPath(); c.moveTo(48, 48); c.arc(48, 48, 42, (k / 6) * Math.PI * 2, ((k + 1) / 6) * Math.PI * 2); c.closePath(); c.fill();
    }
    const g = c.createRadialGradient(36, 30, 2, 48, 48, 44);
    g.addColorStop(0, 'rgba(255,255,255,0.85)'); g.addColorStop(0.35, 'rgba(255,255,255,0.15)'); g.addColorStop(1, 'rgba(0,0,0,0.15)');
    c.fillStyle = g; c.beginPath(); c.arc(48, 48, 42, 0, Math.PI * 2); c.fill();
    c.strokeStyle = 'rgba(255,255,255,0.9)'; c.lineWidth = 3; c.beginPath(); c.arc(48, 48, 42, 0, Math.PI * 2); c.stroke();
  });
  canvas(scene, 'gm-line', 72, 72, (c) => {
    c.shadowColor = '#ffffff'; c.shadowBlur = 8;
    c.fillStyle = 'rgba(255,255,255,0.95)';
    rr(c, 10, 31, 52, 10, 5); c.fill();
    c.beginPath(); c.moveTo(2, 36); c.lineTo(16, 24); c.lineTo(16, 48); c.closePath(); c.fill();
    c.beginPath(); c.moveTo(70, 36); c.lineTo(56, 24); c.lineTo(56, 48); c.closePath(); c.fill();
  });
  canvas(scene, 'gm-bomb', 72, 72, (c) => {
    c.shadowColor = '#ffffff'; c.shadowBlur = 8;
    c.strokeStyle = 'rgba(255,255,255,0.95)'; c.lineWidth = 5;
    c.beginPath(); c.arc(36, 36, 26, 0, Math.PI * 2); c.stroke();
    c.fillStyle = '#ffffff'; c.beginPath(); c.arc(36, 36, 8, 0, Math.PI * 2); c.fill();
  });
}
