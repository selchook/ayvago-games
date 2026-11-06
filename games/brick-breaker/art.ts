import Phaser from 'phaser';

/** Painted textures for Brick Breaker: a neon arcade backdrop, brick shadows and cracks, glows and capsules. */

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

function rr(c: Ctx, x: number, y: number, w: number, h: number, r: number): void {
  c.beginPath();
  c.moveTo(x + r, y);
  c.arcTo(x + w, y, x + w, y + h, r);
  c.arcTo(x + w, y + h, x, y + h, r);
  c.arcTo(x, y + h, x, y, r);
  c.arcTo(x, y, x + w, y, r);
  c.closePath();
}

/**
 * Night arcade backdrop: violet sky with stars and nebulae, a synthwave grid floor under the
 * paddle and, when `frame` is given, a glowing neon frame around the playfield.
 */
export function makeBackdrop(scene: Phaser.Scene, key: string, w: number, h: number, frame?: { l: number; r: number; t: number }): void {
  make(scene, key, w, h, (c) => {
    const g = c.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, '#150d33'); g.addColorStop(0.55, '#0c0822'); g.addColorStop(1, '#1d0b2c');
    c.fillStyle = g; c.fillRect(0, 0, w, h);
    const rnd = seeded(12);
    for (const col of ['#5b3cff', '#2aa7e0', '#ff4fa3', '#8b5cff']) {
      const x = rnd() * w, y = rnd() * h * 0.6, r = 200 + rnd() * 240;
      const b = c.createRadialGradient(x, y, 0, x, y, r);
      b.addColorStop(0, col + '2a'); b.addColorStop(1, col + '00');
      c.fillStyle = b; c.fillRect(0, 0, w, h);
    }
    for (let i = 0; i < 170; i++) {
      const x = rnd() * w, y = rnd() * h * 0.72, s = rnd() < 0.85 ? 2 : 3;
      c.fillStyle = `rgba(255,255,255,${0.15 + rnd() * 0.55})`;
      c.fillRect(Math.round(x), Math.round(y), s, s);
    }
    // synthwave floor
    const hy = Math.round(h * 0.7);
    const fg = c.createLinearGradient(0, hy, 0, h);
    fg.addColorStop(0, 'rgba(255,79,163,0.10)'); fg.addColorStop(1, 'rgba(139,92,255,0.18)');
    c.fillStyle = fg; c.fillRect(0, hy, w, h - hy);
    c.strokeStyle = 'rgba(255,79,163,0.28)'; c.lineWidth = 2;
    for (let i = 0; i < 14; i++) {
      const t = i / 14, y = hy + (h - hy) * t * t;
      c.globalAlpha = 0.35 + t * 0.65;
      c.beginPath(); c.moveTo(0, Math.round(y) + 0.5); c.lineTo(w, Math.round(y) + 0.5); c.stroke();
    }
    c.globalAlpha = 1;
    c.strokeStyle = 'rgba(139,92,255,0.3)';
    for (let i = -12; i <= 12; i++) {
      c.beginPath(); c.moveTo(w / 2 + i * 22, hy); c.lineTo(w / 2 + i * 150, h); c.stroke();
    }
    const hz = c.createLinearGradient(0, hy - 30, 0, hy + 30);
    hz.addColorStop(0, 'rgba(255,79,163,0)'); hz.addColorStop(0.5, 'rgba(255,79,163,0.35)'); hz.addColorStop(1, 'rgba(255,79,163,0)');
    c.fillStyle = hz; c.fillRect(0, hy - 30, w, 60);
    if (!frame) return;
    // top bar band
    c.fillStyle = 'rgba(5,3,14,0.75)'; c.fillRect(0, 0, w, frame.t - 10);
    // neon frame: a soft glow, a bright tube and a thin inner line
    const x0 = frame.l - 4, x1 = frame.r + 4, y0 = frame.t - 4;
    const tube = (width: number, style: string, blur: number) => {
      c.save(); c.shadowColor = '#8b5cff'; c.shadowBlur = blur;
      c.strokeStyle = style; c.lineWidth = width; c.lineJoin = 'round';
      c.beginPath(); c.moveTo(x0, h + 10); c.lineTo(x0, y0); c.lineTo(x1, y0); c.lineTo(x1, h + 10); c.stroke();
      c.restore();
    };
    tube(10, 'rgba(139,92,255,0.35)', 24);
    tube(5, '#a98bff', 12);
    tube(2, '#e6dcff', 0);
    c.strokeStyle = 'rgba(62,230,255,0.35)'; c.lineWidth = 1.5;
    c.beginPath(); c.moveTo(x0 + 7, h); c.lineTo(x0 + 7, y0 + 7); c.lineTo(x1 - 7, y0 + 7); c.lineTo(x1 - 7, h); c.stroke();
    for (const [x, y] of [[x0, y0], [x1, y0]]) {
      c.fillStyle = '#ff4fa3'; c.save(); c.shadowColor = '#ff4fa3'; c.shadowBlur = 14;
      c.beginPath(); c.arc(x, y, 7, 0, Math.PI * 2); c.fill(); c.restore();
      c.fillStyle = '#ffd0e8'; c.beginPath(); c.arc(x - 2, y - 2, 2.5, 0, Math.PI * 2); c.fill();
    }
  });
}

export function makeFx(scene: Phaser.Scene): void {
  make(scene, 'bk-glow', 128, 128, (c) => {
    const g = c.createRadialGradient(64, 64, 0, 64, 64, 64);
    g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.25, 'rgba(255,255,255,0.5)'); g.addColorStop(1, 'rgba(255,255,255,0)');
    c.fillStyle = g; c.fillRect(0, 0, 128, 128);
  });
  make(scene, 'bk-ring', 128, 128, (c) => {
    c.strokeStyle = '#ffffff'; c.lineWidth = 6;
    c.beginPath(); c.arc(64, 64, 56, 0, Math.PI * 2); c.stroke();
  });
  // shadow a brick casts on the backdrop
  make(scene, 'bk-shadow', 72, 38, (c) => {
    c.fillStyle = 'rgba(0,0,0,0.55)'; rr(c, 4, 4, 64, 30, 5); c.fill();
  });
  // two crack stages drawn over damaged bricks (64 x 30 display size, drawn at 2x)
  const crack = (key: string, lines: number[][]) => make(scene, key, 128, 60, (c) => {
    c.lineCap = 'round'; c.lineJoin = 'round';
    for (const [w, col] of [[6, 'rgba(0,0,0,0.55)'], [2.5, 'rgba(255,255,255,0.55)']] as const) {
      c.strokeStyle = col; c.lineWidth = w;
      for (const l of lines) {
        c.beginPath(); c.moveTo(l[0], l[1]);
        for (let i = 2; i < l.length; i += 2) c.lineTo(l[i], l[i + 1]);
        c.stroke();
      }
    }
  });
  crack('bk-crack1', [[52, 6, 60, 22, 54, 32, 66, 46, 62, 56], [60, 22, 76, 26, 84, 18]]);
  crack('bk-crack2', [[52, 6, 60, 22, 54, 32, 66, 46, 62, 56], [60, 22, 76, 26, 84, 18], [20, 10, 30, 26, 22, 40, 34, 52], [54, 32, 36, 34, 30, 26], [66, 46, 92, 40, 104, 50, 118, 44], [84, 18, 100, 12, 112, 20]]);
}

/** A glossy power capsule in the given colour (drawn at 2x for a 64 x 30 display). */
export function makeCapsule(scene: Phaser.Scene, key: string, color: string): void {
  make(scene, key, 136, 68, (c) => {
    c.fillStyle = 'rgba(0,0,0,0.45)'; rr(c, 6, 10, 128, 56, 28); c.fill();
    const g = c.createLinearGradient(0, 2, 0, 62);
    g.addColorStop(0, '#ffffff'); g.addColorStop(0.18, color); g.addColorStop(0.75, color); g.addColorStop(1, 'rgba(0,0,0,0.6)');
    rr(c, 2, 2, 128, 58, 29); c.fillStyle = g; c.fill();
    c.fillStyle = 'rgba(0,0,0,0.25)'; rr(c, 2, 40, 128, 20, 10); c.fill();
    c.fillStyle = 'rgba(255,255,255,0.45)'; rr(c, 18, 8, 96, 10, 5); c.fill();
    // end caps
    for (const x of [2, 106]) { c.fillStyle = 'rgba(255,255,255,0.22)'; c.fillRect(x + (x > 50 ? 0 : 22), 4, 2, 54); }
    c.strokeStyle = '#ffffff'; c.lineWidth = 4; rr(c, 2, 2, 128, 58, 29); c.stroke();
  });
}

/** The ribbon behind level banners. */
export function makeBanner(scene: Phaser.Scene): void {
  make(scene, 'bk-banner', 512, 150, (c) => {
    const g = c.createLinearGradient(0, 0, 0, 150);
    g.addColorStop(0, 'rgba(18,12,40,0.94)'); g.addColorStop(1, 'rgba(8,6,20,0.94)');
    c.fillStyle = g; c.fillRect(0, 10, 512, 130);
    c.fillStyle = '#ffffff'; c.fillRect(0, 4, 512, 4); c.fillRect(0, 142, 512, 4);
    c.fillStyle = 'rgba(255,255,255,0.1)'; c.fillRect(0, 12, 512, 2);
  });
}
