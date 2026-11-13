import Phaser from 'phaser';

/** Painted art for Mini Golf: everything is drawn on canvases once, so nothing is tessellated per frame. */

export type R4 = [number, number, number, number];
export interface CourseArt {
  tee: [number, number]; cup: [number, number];
  walls?: R4[]; water?: R4[]; sand?: R4[]; bumpers?: [number, number, number][];
}

/** The ball texture is 64 px; the ball in it is 60 px across. */
export const BALL_PX = 60;
/** Movers are drawn with this much room around them for their shadow. */
export const MOVER_PAD = 12;

type Ctx = CanvasRenderingContext2D;
type PathFn = (c: Ctx) => void;
const TAU = Math.PI * 2;

function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), a | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Adds a rounded rectangle sub-path (clockwise, so several of them fill as a union). */
function round(c: Ctx, x: number, y: number, w: number, h: number, r: number): void {
  r = Math.max(0, Math.min(r, w / 2, h / 2));
  c.moveTo(x + r, y);
  c.arcTo(x + w, y, x + w, y + h, r);
  c.arcTo(x + w, y + h, x, y + h, r);
  c.arcTo(x, y + h, x, y, r);
  c.arcTo(x, y, x + w, y, r);
  c.closePath();
}

function disc(c: Ctx, x: number, y: number, r: number, fill: string | CanvasGradient): void {
  c.beginPath(); c.arc(x, y, r, 0, TAU); c.fillStyle = fill; c.fill();
}

/** Creates (or, with redraw, repaints) a canvas texture. */
function make(scene: Phaser.Scene, key: string, w: number, h: number, draw: (c: Ctx) => void, redraw = false): void {
  let tex: Phaser.Textures.CanvasTexture | null = null;
  if (scene.textures.exists(key)) {
    if (!redraw) return;
    tex = scene.textures.get(key) as Phaser.Textures.CanvasTexture;
  } else tex = scene.textures.createCanvas(key, w, h);
  if (!tex) return;
  const c = tex.getContext();
  c.clearRect(0, 0, w, h);
  draw(c);
  tex.refresh();
}

function bounds(rs: R4[]): R4 {
  const x0 = Math.min(...rs.map((r) => r[0])), y0 = Math.min(...rs.map((r) => r[1]));
  const x1 = Math.max(...rs.map((r) => r[0] + r[2])), y1 = Math.max(...rs.map((r) => r[1] + r[3]));
  return [x0, y0, x1 - x0, y1 - y0];
}

/** Soft shadow cast inwards from the edge of a shape (a sunken look). */
function innerShadow(c: Ctx, path: PathFn, bb: R4, color: string, blur: number, ox: number, oy: number): void {
  const m = blur * 2 + Math.max(Math.abs(ox), Math.abs(oy)) + 4;
  const x0 = Math.floor(bb[0] - m), y0 = Math.floor(bb[1] - m);
  const W = Math.ceil(bb[2] + 2 * m), H = Math.ceil(bb[3] + 2 * m);
  const off = document.createElement('canvas');
  off.width = W; off.height = H;
  const o = off.getContext('2d');
  if (!o) return;
  o.fillStyle = '#000'; o.fillRect(0, 0, W, H);
  o.globalCompositeOperation = 'destination-out';
  o.translate(-x0, -y0);
  o.beginPath(); path(o); o.fill();
  c.save();
  c.beginPath(); path(c); c.clip();
  c.shadowColor = color; c.shadowBlur = blur; c.shadowOffsetX = ox; c.shadowOffsetY = oy;
  c.drawImage(off, x0, y0);
  c.restore();
}

// ------------------------------------------------------------------ small textures

/** Ball, glow, ring, soft shadow, bumper, flag and the menu green. Safe to call more than once. */
export function makeArt(scene: Phaser.Scene): void {
  make(scene, 'mg-ball', 64, 64, (c) => {
    const cx = 32, cy = 32, r = 30;
    const body = c.createRadialGradient(cx - 9, cy - 10, 2, cx, cy, r);
    body.addColorStop(0, '#ffffff'); body.addColorStop(0.45, '#f2f4f7'); body.addColorStop(0.85, '#cfd4dc'); body.addColorStop(1, '#a3a9b5');
    disc(c, cx, cy, r, body);
    c.save();
    c.beginPath(); c.arc(cx, cy, r - 1, 0, TAU); c.clip();
    for (let row = -6; row <= 6; row++) {
      for (let col = -6; col <= 6; col++) {
        const x = cx + col * 7 + (row % 2 ? 3.5 : 0), y = cy + row * 6, d = Math.hypot(x - cx, y - cy);
        if (d > r - 2) continue;
        const k = 1 - d / r;
        c.fillStyle = `rgba(90,100,125,${(0.1 + 0.1 * (1 - k)).toFixed(3)})`;
        c.beginPath(); c.arc(x, y, 2.3 * (0.55 + 0.45 * k), 0, TAU); c.fill();
      }
    }
    c.restore();
    const spec = c.createRadialGradient(cx - 10, cy - 11, 0, cx - 10, cy - 11, 13);
    spec.addColorStop(0, 'rgba(255,255,255,0.95)'); spec.addColorStop(1, 'rgba(255,255,255,0)');
    disc(c, cx - 10, cy - 11, 13, spec);
    c.beginPath(); c.arc(cx, cy, r - 0.5, 0, TAU); c.strokeStyle = 'rgba(60,70,90,0.4)'; c.lineWidth = 1.5; c.stroke();
  });

  make(scene, 'mg-glow', 128, 128, (c) => {
    const g = c.createRadialGradient(64, 64, 0, 64, 64, 64);
    g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.3, 'rgba(255,255,255,0.4)'); g.addColorStop(1, 'rgba(255,255,255,0)');
    disc(c, 64, 64, 64, g);
  });

  make(scene, 'mg-ring', 128, 128, (c) => {
    c.shadowColor = '#ffffff'; c.shadowBlur = 10;
    c.beginPath(); c.arc(64, 64, 50, 0, TAU); c.strokeStyle = '#ffffff'; c.lineWidth = 6; c.stroke();
  });

  make(scene, 'mg-shadow', 64, 32, (c) => {
    c.translate(32, 16); c.scale(1, 0.5);
    const g = c.createRadialGradient(0, 0, 0, 0, 0, 32);
    g.addColorStop(0, 'rgba(0,0,0,0.6)'); g.addColorStop(0.55, 'rgba(0,0,0,0.3)'); g.addColorStop(1, 'rgba(0,0,0,0)');
    disc(c, 0, 0, 32, g);
  });

  make(scene, 'mg-bumper', 128, 128, (c) => {
    const cx = 64, cy = 64;
    const chrome = c.createLinearGradient(0, 0, 0, 128);
    chrome.addColorStop(0, '#ffffff'); chrome.addColorStop(0.5, '#c4cad3'); chrome.addColorStop(1, '#6f7884');
    disc(c, cx, cy, 62, chrome);
    disc(c, cx, cy, 54, '#5a0d06');
    const dome = c.createRadialGradient(cx - 14, cy - 16, 4, cx, cy, 52);
    dome.addColorStop(0, '#ffa08a'); dome.addColorStop(0.45, '#f2412b'); dome.addColorStop(0.85, '#b5200f'); dome.addColorStop(1, '#7a1206');
    disc(c, cx, cy, 51, dome);
    const cap = c.createRadialGradient(cx - 5, cy - 6, 1, cx, cy, 18);
    cap.addColorStop(0, '#fff6c4'); cap.addColorStop(0.5, '#ffd23f'); cap.addColorStop(1, '#c98f12');
    disc(c, cx, cy, 17, cap);
    c.beginPath(); c.arc(cx, cy, 17, 0, TAU); c.strokeStyle = 'rgba(120,70,0,0.6)'; c.lineWidth = 1.5; c.stroke();
    c.beginPath(); c.ellipse(cx - 18, cy - 24, 18, 9, -0.5, 0, TAU); c.fillStyle = 'rgba(255,255,255,0.45)'; c.fill();
  });

  make(scene, 'mg-pole', 12, 104, (c) => {
    const g = c.createLinearGradient(3, 0, 9, 0);
    g.addColorStop(0, '#8d96a1'); g.addColorStop(0.4, '#ffffff'); g.addColorStop(1, '#7c848e');
    c.fillStyle = g; c.fillRect(3, 8, 6, 96);
    const ball = c.createRadialGradient(4.5, 4.5, 0.5, 6, 6, 6);
    ball.addColorStop(0, '#fff6c4'); ball.addColorStop(0.5, '#ffd23f'); ball.addColorStop(1, '#b07a0c');
    disc(c, 6, 6, 5.5, ball);
  });

  make(scene, 'mg-pennant', 70, 46, (c) => {
    const shape = () => {
      c.beginPath(); c.moveTo(0, 2);
      c.quadraticCurveTo(34, 2, 68, 22);
      c.quadraticCurveTo(34, 38, 0, 42);
      c.closePath();
    };
    const g = c.createLinearGradient(0, 0, 68, 0);
    g.addColorStop(0, '#ff6b57'); g.addColorStop(0.5, '#ec3013'); g.addColorStop(1, '#b51a0b');
    shape(); c.fillStyle = g; c.fill();
    c.strokeStyle = 'rgba(110,10,0,0.55)'; c.lineWidth = 1.5; c.stroke();
    c.beginPath(); c.moveTo(2, 9); c.quadraticCurveTo(30, 9, 54, 20); c.strokeStyle = 'rgba(255,255,255,0.35)'; c.lineWidth = 3; c.stroke();
  });
}

/** A rounded glass label, sized to the nearest 10 px. Returns its texture key. */
export function pill(scene: Phaser.Scene, w: number, h: number): string {
  w = Math.ceil(w / 10) * 10;
  const key = `mg-pill-${w}x${h}`, pad = 12;
  make(scene, key, w + pad * 2, h + pad * 2, (c) => {
    const p = () => { c.beginPath(); round(c, pad, pad, w, h, h / 2); };
    c.save(); c.shadowColor = 'rgba(0,0,0,0.4)'; c.shadowBlur = 12; c.shadowOffsetY = 4;
    p(); c.fillStyle = 'rgba(6,26,14,0.6)'; c.fill(); c.restore();
    const g = c.createLinearGradient(0, pad, 0, pad + h);
    g.addColorStop(0, 'rgba(255,255,255,0.26)'); g.addColorStop(0.48, 'rgba(255,255,255,0.07)');
    g.addColorStop(0.52, 'rgba(255,255,255,0.02)'); g.addColorStop(1, 'rgba(255,255,255,0.1)');
    p(); c.fillStyle = g; c.fill();
    c.lineWidth = 1.5; c.strokeStyle = 'rgba(255,255,255,0.42)'; c.stroke();
    c.beginPath(); round(c, pad + h * 0.4, pad + 3, w - h * 0.8, h * 0.3, h * 0.15); c.fillStyle = 'rgba(255,255,255,0.14)'; c.fill();
  });
  return key;
}

/** A sliding block: glossy purple with hazard stripes, its shadow baked in (MOVER_PAD around it). */
export function moverTexture(scene: Phaser.Scene, w: number, h: number): string {
  const key = `mg-mover-${w}x${h}`, pad = MOVER_PAD;
  make(scene, key, w + pad * 2, h + pad * 2, (c) => {
    const p = () => { c.beginPath(); round(c, pad, pad, w, h, 9); };
    const horiz = w >= h;
    c.save(); c.shadowColor = 'rgba(0,0,0,0.45)'; c.shadowBlur = 10; c.shadowOffsetX = 5; c.shadowOffsetY = 7;
    p(); c.fillStyle = '#4d2fa8'; c.fill(); c.restore();
    c.save(); p(); c.clip();
    const g = horiz ? c.createLinearGradient(0, pad, 0, pad + h) : c.createLinearGradient(pad, 0, pad + w, 0);
    g.addColorStop(0, '#c2adff'); g.addColorStop(0.45, '#8a5cff'); g.addColorStop(1, '#5631c4');
    c.fillStyle = g; c.fillRect(pad, pad, w, h);
    c.fillStyle = 'rgba(255,255,255,0.14)';
    const span = Math.max(w, h);
    for (let x = -span; x < span * 2; x += 22) {
      c.beginPath(); c.moveTo(pad + x, pad + h); c.lineTo(pad + x + 11, pad + h); c.lineTo(pad + x + 11 + h, pad); c.lineTo(pad + x + h, pad); c.closePath(); c.fill();
    }
    c.fillStyle = 'rgba(255,255,255,0.4)';
    if (horiz) c.fillRect(pad + 6, pad + 3, w - 12, 3); else c.fillRect(pad + 3, pad + 6, 3, h - 12);
    c.restore();
    p(); c.strokeStyle = '#2b1870'; c.lineWidth = 2.5; c.stroke();
    const ends: [number, number][] = horiz ? [[pad + 9, pad + h / 2], [pad + w - 9, pad + h / 2]] : [[pad + w / 2, pad + 9], [pad + w / 2, pad + h - 9]];
    for (const [x, y] of ends) {
      disc(c, x, y, 3.6, '#ece6ff');
      c.beginPath(); c.arc(x, y, 3.6, 0, TAU); c.strokeStyle = '#2b1870'; c.lineWidth = 1.2; c.stroke();
    }
  });
  return key;
}

// ------------------------------------------------------------------ backdrop

/** The garden around the course (fixed to the screen). */
export function paintBackdrop(scene: Phaser.Scene): void {
  make(scene, 'mg-bg', 720, 1280, (c) => {
    const rnd = seeded(77);
    const g = c.createLinearGradient(0, 0, 0, 1280);
    g.addColorStop(0, '#1d5631'); g.addColorStop(0.5, '#174428'); g.addColorStop(1, '#0f2d1a');
    c.fillStyle = g; c.fillRect(0, 0, 720, 1280);
    // dappled light
    for (let i = 0; i < 26; i++) {
      const x = rnd() * 720, y = rnd() * 1280, r = 50 + rnd() * 120;
      const l = c.createRadialGradient(x, y, 0, x, y, r);
      l.addColorStop(0, 'rgba(210,255,170,0.08)'); l.addColorStop(1, 'rgba(210,255,170,0)');
      disc(c, x, y, r, l);
    }
    // leaves
    const leaf = ['rgba(8,36,18,0.4)', 'rgba(70,150,80,0.22)', 'rgba(30,95,48,0.32)', 'rgba(110,180,90,0.14)'];
    for (let i = 0; i < 1600; i++) {
      c.fillStyle = leaf[Math.floor(rnd() * leaf.length)];
      c.beginPath(); c.ellipse(rnd() * 720, rnd() * 1280, 5 + rnd() * 10, 2.5 + rnd() * 4, rnd() * Math.PI, 0, TAU); c.fill();
    }
    // flowers where the course does not cover the garden
    const petals = ['#ff8fb1', '#ffd23f', '#ffffff', '#c89bff', '#ff9a5c'];
    for (let i = 0; i < 64; i++) {
      let x = rnd() * 720, y = rnd() * 1280;
      const band = rnd();
      if (band < 0.4) y = 8 + rnd() * 112; else if (band < 0.7) y = 1222 + rnd() * 52; else x = rnd() < 0.5 ? 4 + rnd() * 22 : 694 + rnd() * 22;
      const col = petals[Math.floor(rnd() * petals.length)], r = 1.8 + rnd() * 1.4;
      c.globalAlpha = 0.75;
      for (let k = 0; k < 5; k++) { const a = (k / 5) * TAU + i; disc(c, x + Math.cos(a) * r, y + Math.sin(a) * r, r, col); }
      disc(c, x, y, r * 0.7, '#ffcf3a');
      c.globalAlpha = 1;
    }
    // darker band under the score line
    const top = c.createLinearGradient(0, 0, 0, 130);
    top.addColorStop(0, 'rgba(0,15,5,0.45)'); top.addColorStop(1, 'rgba(0,15,5,0)');
    c.fillStyle = top; c.fillRect(0, 0, 720, 130);
    // vignette
    const v = c.createRadialGradient(360, 640, 320, 360, 640, 860);
    v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(1, 'rgba(0,0,0,0.5)');
    c.fillStyle = v; c.fillRect(0, 0, 720, 1280);
  });
}

// ------------------------------------------------------------------ course

/** Paints one hole (rail, grass, hazards, walls, bumper shadows, tee and cup) into the 720×1280 canvas `key`. */
export function paintCourse(scene: Phaser.Scene, key: string, h: CourseArt, B: R4, cupR: number, seed: number): void {
  make(scene, key, 720, 1280, (c) => {
    const rnd = seeded(seed * 7919 + 13);
    const [bx, by, bw, bh] = B;
    const R = 22;
    const rail = (cc: Ctx) => round(cc, bx - R, by - R, bw + R * 2, bh + R * 2, 28);
    // rail with its drop shadow
    c.save(); c.shadowColor = 'rgba(0,0,0,0.55)'; c.shadowBlur = 34; c.shadowOffsetY = 16;
    c.beginPath(); rail(c); c.fillStyle = '#5a3820'; c.fill(); c.restore();
    const wood = c.createLinearGradient(0, by - R, 0, by + bh + R);
    wood.addColorStop(0, '#c08a58'); wood.addColorStop(0.5, '#9c6b3e'); wood.addColorStop(1, '#744c2a');
    c.beginPath(); rail(c); c.fillStyle = wood; c.fill();
    c.save(); c.beginPath(); rail(c); c.clip();
    c.lineWidth = 1.2;
    for (let i = 0; i < 70; i++) {
      c.strokeStyle = rnd() < 0.55 ? 'rgba(60,32,12,0.28)' : 'rgba(255,224,180,0.16)';
      const len = 40 + rnd() * 120, along = bx - R + rnd() * (bw + R * 2), down = by - R + rnd() * (bh + R * 2);
      const side = i % 4;
      c.beginPath();
      if (side === 0) { const y = by - R + 3 + rnd() * (R - 6); c.moveTo(along, y); c.lineTo(along + len, y + (rnd() - 0.5) * 2); }
      else if (side === 1) { const y = by + bh + 3 + rnd() * (R - 6); c.moveTo(along, y); c.lineTo(along + len, y + (rnd() - 0.5) * 2); }
      else if (side === 2) { const x = bx - R + 3 + rnd() * (R - 6); c.moveTo(x, down); c.lineTo(x + (rnd() - 0.5) * 2, down + len); }
      else { const x = bx + bw + 3 + rnd() * (R - 6); c.moveTo(x, down); c.lineTo(x + (rnd() - 0.5) * 2, down + len); }
      c.stroke();
    }
    c.restore();
    c.beginPath(); round(c, bx - R + 1.5, by - R + 1.5, bw + R * 2 - 3, bh + R * 2 - 3, 27);
    c.strokeStyle = 'rgba(255,236,200,0.4)'; c.lineWidth = 2; c.stroke();
    // groove the grass sits in
    c.beginPath(); round(c, bx - 6, by - 6, bw + 12, bh + 12, 13); c.fillStyle = '#2b180b'; c.fill();

    // grass
    const grass: PathFn = (cc) => round(cc, bx, by, bw, bh, 9);
    c.save(); c.beginPath(); grass(c); c.clip();
    const gg = c.createLinearGradient(0, by, 0, by + bh);
    gg.addColorStop(0, '#66cc6d'); gg.addColorStop(0.5, '#4cae53'); gg.addColorStop(1, '#3a9443');
    c.fillStyle = gg; c.fillRect(bx, by, bw, bh);
    for (let y = by, k = 0; y < by + bh; y += 70, k++) {
      c.fillStyle = k % 2 ? 'rgba(255,255,255,0.075)' : 'rgba(0,40,0,0.05)';
      c.fillRect(bx, y, bw, Math.min(70, by + bh - y));
    }
    for (let x = bx, k = 0; x < bx + bw; x += 155, k++) if (k % 2) { c.fillStyle = 'rgba(255,255,255,0.025)'; c.fillRect(x, by, 155, bh); }
    const sun = c.createRadialGradient(360, by + 240, 40, 360, by + 240, 780);
    sun.addColorStop(0, 'rgba(255,255,215,0.17)'); sun.addColorStop(1, 'rgba(255,255,215,0)');
    c.fillStyle = sun; c.fillRect(bx, by, bw, bh);
    const blades = (n: number, style: string) => {
      c.beginPath();
      for (let i = 0; i < n; i++) {
        const x = bx + rnd() * bw, y = by + rnd() * bh, a = -Math.PI / 2 + (rnd() - 0.5) * 0.9, l = 2 + rnd() * 4;
        c.moveTo(x, y); c.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l);
      }
      c.strokeStyle = style; c.lineWidth = 1; c.stroke();
    };
    blades(7000, 'rgba(20,85,28,0.28)');
    blades(4000, 'rgba(215,255,190,0.16)');

    // sand
    for (const s of h.sand ?? []) {
      const p: PathFn = (cc) => round(cc, s[0], s[1], s[2], s[3], 22);
      c.save(); c.beginPath(); p(c); c.clip();
      const cx = s[0] + s[2] / 2, cy = s[1] + s[3] / 2;
      const sg = c.createRadialGradient(cx, cy - s[3] * 0.2, 4, cx, cy, Math.max(s[2], s[3]) * 0.7);
      sg.addColorStop(0, '#f8e7b2'); sg.addColorStop(0.6, '#e6cb88'); sg.addColorStop(1, '#ccac66');
      c.fillStyle = sg; c.fillRect(s[0], s[1], s[2], s[3]);
      c.strokeStyle = 'rgba(160,125,60,0.22)'; c.lineWidth = 1.5;
      for (let y = s[1] + 8; y < s[1] + s[3]; y += 9) {
        c.beginPath();
        for (let x = s[0]; x <= s[0] + s[2]; x += 8) { const yy = y + Math.sin(x * 0.05 + y * 0.3) * 2; if (x === s[0]) c.moveTo(x, yy); else c.lineTo(x, yy); }
        c.stroke();
      }
      for (let i = 0; i < (s[2] * s[3]) / 40; i++) {
        c.fillStyle = i % 3 ? 'rgba(120,90,40,0.3)' : 'rgba(255,255,240,0.55)';
        c.fillRect(s[0] + rnd() * s[2], s[1] + rnd() * s[3], 1.6, 1.6);
      }
      c.restore();
      innerShadow(c, p, s, 'rgba(110,70,20,0.6)', 10, 0, 4);
      c.beginPath(); p(c); c.strokeStyle = 'rgba(255,255,255,0.14)'; c.lineWidth = 2; c.stroke();
    }

    // water: one pond from all its rectangles, with a stone edge
    const ws = h.water ?? [];
    if (ws.length) {
      const wp: PathFn = (cc) => { for (const w of ws) round(cc, w[0], w[1], w[2], w[3], 8); };
      const bb = bounds(ws);
      c.save(); c.shadowColor = 'rgba(0,0,0,0.35)'; c.shadowBlur = 8; c.shadowOffsetY = 3;
      c.beginPath(); wp(c); c.lineJoin = 'round'; c.lineWidth = 16; c.strokeStyle = '#bdb194'; c.stroke(); c.restore();
      c.beginPath(); wp(c); c.lineWidth = 11; c.strokeStyle = '#ddd3b6'; c.stroke();
      c.save(); c.beginPath(); wp(c); c.clip();
      const wg = c.createLinearGradient(bb[0], bb[1], bb[0] + bb[2] * 0.3, bb[1] + bb[3]);
      wg.addColorStop(0, '#2b93da'); wg.addColorStop(0.5, '#1663ad'); wg.addColorStop(1, '#0c427f');
      c.fillStyle = wg; c.fillRect(bb[0], bb[1], bb[2], bb[3]);
      c.strokeStyle = 'rgba(150,220,255,0.33)'; c.lineWidth = 2;
      for (let i = 0; i < (bb[2] * bb[3]) / 650; i++) {
        const x = bb[0] + rnd() * bb[2], y = bb[1] + rnd() * bb[3], s = 0.6 + rnd() * 0.8;
        c.beginPath(); c.moveTo(x, y);
        c.quadraticCurveTo(x + 8 * s, y - 5 * s, x + 16 * s, y);
        c.quadraticCurveTo(x + 24 * s, y + 5 * s, x + 32 * s, y);
        c.stroke();
      }
      const sh = c.createLinearGradient(bb[0], bb[1], bb[0] + bb[2], bb[1] + bb[3]);
      sh.addColorStop(0, 'rgba(255,255,255,0)'); sh.addColorStop(0.42, 'rgba(255,255,255,0.1)'); sh.addColorStop(0.5, 'rgba(255,255,255,0)');
      c.fillStyle = sh; c.fillRect(bb[0], bb[1], bb[2], bb[3]);
      c.restore();
      innerShadow(c, wp, bb, 'rgba(0,18,55,0.8)', 16, 0, 8);
    }

    // bumper shadows (the bumpers themselves are images that light up)
    for (const b of h.bumpers ?? []) {
      const sg = c.createRadialGradient(b[0] + 5, b[1] + 8, b[2] * 0.6, b[0] + 5, b[1] + 8, b[2] + 10);
      sg.addColorStop(0, 'rgba(0,0,0,0.42)'); sg.addColorStop(1, 'rgba(0,0,0,0)');
      disc(c, b[0] + 5, b[1] + 8, b[2] + 10, sg);
    }

    // walls: wooden decking
    for (const w of h.walls ?? []) {
      const p: PathFn = (cc) => round(cc, w[0], w[1], w[2], w[3], 6);
      const horiz = w[2] >= w[3];
      c.save(); c.shadowColor = 'rgba(0,0,0,0.45)'; c.shadowBlur = 12; c.shadowOffsetX = 5; c.shadowOffsetY = 8;
      c.beginPath(); p(c); c.fillStyle = '#7b4b26'; c.fill(); c.restore();
      c.save(); c.beginPath(); p(c); c.clip();
      const wg = horiz ? c.createLinearGradient(0, w[1], 0, w[1] + w[3]) : c.createLinearGradient(w[0], 0, w[0] + w[2], 0);
      wg.addColorStop(0, '#d69d63'); wg.addColorStop(0.5, '#a96f3c'); wg.addColorStop(1, '#7c4d27');
      c.fillStyle = wg; c.fillRect(w[0], w[1], w[2], w[3]);
      c.strokeStyle = 'rgba(255,228,185,0.14)'; c.lineWidth = 1;
      for (let i = 0; i < (w[2] * w[3]) / 220; i++) {
        const x = w[0] + rnd() * w[2], y = w[1] + rnd() * w[3], l = 20 + rnd() * 50;
        c.beginPath(); c.moveTo(x, y); if (horiz) c.lineTo(x + l, y); else c.lineTo(x, y + l); c.stroke();
      }
      c.strokeStyle = 'rgba(70,38,14,0.55)'; c.lineWidth = 1.5;
      const long = horiz ? w[2] : w[3], short = horiz ? w[3] : w[2];
      for (let row = 0, s = 0; s < short; row++, s += 15) {
        const s1 = Math.min(short, s + 15);
        if (s1 < short) { c.beginPath(); if (horiz) { c.moveTo(w[0], w[1] + s1); c.lineTo(w[0] + w[2], w[1] + s1); } else { c.moveTo(w[0] + s1, w[1]); c.lineTo(w[0] + s1, w[1] + w[3]); } c.stroke(); }
        for (let a = 70 + (row % 2) * 55; a < long - 12; a += 110) {
          c.beginPath();
          if (horiz) { c.moveTo(w[0] + a, w[1] + s); c.lineTo(w[0] + a, w[1] + s1); } else { c.moveTo(w[0] + s, w[1] + a); c.lineTo(w[0] + s1, w[1] + a); }
          c.stroke();
        }
      }
      c.fillStyle = 'rgba(255,238,205,0.5)';
      c.fillRect(w[0] + 4, w[1] + 2, w[2] - 8, 2.5);
      c.fillRect(w[0] + 2, w[1] + 4, 2.5, w[3] - 8);
      c.restore();
      c.beginPath(); p(c); c.strokeStyle = 'rgba(55,28,8,0.9)'; c.lineWidth = 2; c.stroke();
    }

    // tee mat
    const [tx, ty] = h.tee;
    const mat = (cc: Ctx) => round(cc, tx - 42, ty - 27, 84, 54, 12);
    c.save(); c.shadowColor = 'rgba(0,0,0,0.35)'; c.shadowBlur = 8; c.shadowOffsetY = 3;
    c.beginPath(); mat(c); c.fillStyle = '#24702e'; c.fill(); c.restore();
    c.save(); c.beginPath(); mat(c); c.clip();
    const mg = c.createLinearGradient(0, ty - 27, 0, ty + 27);
    mg.addColorStop(0, '#34973f'); mg.addColorStop(1, '#1e6628');
    c.fillStyle = mg; c.fillRect(tx - 42, ty - 27, 84, 54);
    c.fillStyle = 'rgba(255,255,255,0.05)';
    for (let x = tx - 42; x < tx + 42; x += 6) c.fillRect(x, ty - 27, 3, 54);
    c.restore();
    c.setLineDash([6, 5]);
    c.beginPath(); round(c, tx - 36, ty - 21, 72, 42, 8); c.strokeStyle = 'rgba(255,255,255,0.55)'; c.lineWidth = 2; c.stroke();
    c.setLineDash([]);

    // cup
    const [cx, cy] = h.cup;
    c.lineCap = 'round';
    c.beginPath(); c.moveTo(cx, cy); c.lineTo(cx + 50, cy + 24); c.strokeStyle = 'rgba(0,25,0,0.2)'; c.lineWidth = 5; c.stroke();
    const halo = c.createRadialGradient(cx, cy + 2, cupR, cx, cy + 2, cupR + 15);
    halo.addColorStop(0, 'rgba(0,0,0,0.3)'); halo.addColorStop(1, 'rgba(0,0,0,0)');
    disc(c, cx, cy + 2, cupR + 15, halo);
    disc(c, cx, cy, cupR + 8, 'rgba(190,255,175,0.16)');
    disc(c, cx, cy, cupR + 2.5, '#e9ecef');
    const hg = c.createRadialGradient(cx, cy + 6, 2, cx, cy, cupR);
    hg.addColorStop(0, '#2c2c2c'); hg.addColorStop(0.7, '#0e0e0e'); hg.addColorStop(1, '#000000');
    disc(c, cx, cy, cupR, hg);
    c.beginPath(); c.arc(cx, cy, cupR - 2, Math.PI * 1.05, Math.PI * 1.95); c.strokeStyle = 'rgba(0,0,0,0.65)'; c.lineWidth = 4; c.stroke();
    c.beginPath(); c.arc(cx, cy, cupR - 3, Math.PI * 0.2, Math.PI * 0.8); c.strokeStyle = 'rgba(255,255,255,0.22)'; c.lineWidth = 2; c.stroke();
    c.lineCap = 'butt';

    c.restore();   // grass clip
    innerShadow(c, grass, B, 'rgba(0,0,0,0.5)', 18, 0, 7);
  }, true);
}

/** The little putting green on the menu: 560×150, cup at (430, 75). */
export function paintMenuGreen(scene: Phaser.Scene): void {
  make(scene, 'mg-menu-green', 600, 190, (c) => {
    const rnd = seeded(5);
    const x = 20, y = 16, w = 560, h = 150;
    c.save(); c.shadowColor = 'rgba(0,0,0,0.5)'; c.shadowBlur = 20; c.shadowOffsetY = 10;
    c.beginPath(); round(c, x, y, w, h, 40); c.fillStyle = '#7a4d2a'; c.fill(); c.restore();
    const wood = c.createLinearGradient(0, y, 0, y + h);
    wood.addColorStop(0, '#c08a58'); wood.addColorStop(1, '#744c2a');
    c.beginPath(); round(c, x, y, w, h, 40); c.fillStyle = wood; c.fill();
    const gp: PathFn = (cc) => round(cc, x + 14, y + 14, w - 28, h - 28, 28);
    c.save(); c.beginPath(); gp(c); c.clip();
    const gg = c.createLinearGradient(0, y, 0, y + h);
    gg.addColorStop(0, '#6ad071'); gg.addColorStop(1, '#3e9a46');
    c.fillStyle = gg; c.fillRect(x, y, w, h);
    for (let k = 0; k < 8; k++) if (k % 2) { c.fillStyle = 'rgba(255,255,255,0.07)'; c.fillRect(x + 14 + k * 70, y, 70, h); }
    c.beginPath();
    for (let i = 0; i < 1400; i++) { const bx = x + rnd() * w, by = y + rnd() * h; c.moveTo(bx, by); c.lineTo(bx + (rnd() - 0.5) * 2, by - 2 - rnd() * 3); }
    c.strokeStyle = 'rgba(20,85,28,0.3)'; c.lineWidth = 1; c.stroke();
    const cx = 430, cy = 91, r = 17;
    disc(c, cx, cy, r + 2.5, '#e9ecef');
    const hg = c.createRadialGradient(cx, cy + 5, 2, cx, cy, r);
    hg.addColorStop(0, '#2c2c2c'); hg.addColorStop(1, '#000000');
    disc(c, cx, cy, r, hg);
    c.restore();
    innerShadow(c, gp, [x + 14, y + 14, w - 28, h - 28], 'rgba(0,0,0,0.5)', 12, 0, 5);
  });
}
