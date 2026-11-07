import Phaser from 'phaser';

/**
 * Painted textures for Tavla: a walnut box with brass hinges, green felt, inlaid points, glossy
 * ivory and ebony checkers, bear-off slabs and dice. Drawn once on canvases and cached by key,
 * so the menu decor and every round share them.
 */

type Ctx = CanvasRenderingContext2D;

export interface BoardGeometry {
  FX0: number; FX1: number; FY0: number; FY1: number;
  IX0: number; IX1: number; IY0: number; IY1: number;
  BAR0: number; BAR1: number; BARX: number;
  TRAY0: number; TRAY1: number; TRAYX: number;
  PW: number; TRI: number; CK: number; MIDY: number;
}

/** Checker texture size and the share of it the checker itself covers (the rest is shadow). */
export const CK_TEX = 128;
export const CK_FILL = 0.86;
/** Die texture size and the die's share of it. */
export const DIE_TEX = 128;
export const DIE_FILL = 0.8;

const BODY_FONT = 'Nunito, sans-serif';

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

/** Wood grain over a rectangle: a base gradient plus wavy darker lines. */
function wood(c: Ctx, x: number, y: number, w: number, h: number, seed: number, light: string, dark: string, vertical = false): void {
  const g = vertical ? c.createLinearGradient(x, 0, x + w, 0) : c.createLinearGradient(0, y, 0, y + h);
  g.addColorStop(0, light);
  g.addColorStop(0.5, dark);
  g.addColorStop(1, light);
  c.fillStyle = g;
  c.fillRect(x, y, w, h);
  const rnd = seeded(seed);
  c.save();
  c.beginPath();
  c.rect(x, y, w, h);
  c.clip();
  c.lineWidth = 1.6;
  const len = vertical ? h : w;
  const across = vertical ? w : h;
  for (let k = 0; k < across; k += 5 + rnd() * 4) {
    c.strokeStyle = `rgba(40,18,6,${0.12 + rnd() * 0.18})`;
    c.beginPath();
    const a = k + rnd() * 3;
    if (vertical) {
      c.moveTo(x + a, y);
      c.bezierCurveTo(x + a + rnd() * 8 - 4, y + len * 0.33, x + a - rnd() * 8 + 4, y + len * 0.66, x + a + rnd() * 4 - 2, y + len);
    } else {
      c.moveTo(x, y + a);
      c.bezierCurveTo(x + len * 0.33, y + a + rnd() * 8 - 4, x + len * 0.66, y + a - rnd() * 8 + 4, x + len, y + a + rnd() * 4 - 2);
    }
    c.stroke();
  }
  // a few knots
  for (let k = 0; k < 3; k++) {
    const kx = x + rnd() * w, ky = y + rnd() * h;
    c.strokeStyle = 'rgba(40,18,6,0.22)';
    c.beginPath();
    c.ellipse(kx, ky, 6 + rnd() * 8, 2 + rnd() * 3, vertical ? Math.PI / 2 : 0, 0, Math.PI * 2);
    c.stroke();
  }
  c.restore();
}

function hinge(c: Ctx, x: number, y: number): void {
  const g = c.createLinearGradient(x - 14, 0, x + 14, 0);
  g.addColorStop(0, '#8a6a2a');
  g.addColorStop(0.5, '#f1d48a');
  g.addColorStop(1, '#7a5a20');
  c.fillStyle = 'rgba(0,0,0,0.35)';
  rr(c, x - 14, y - 24 + 3, 28, 48, 6);
  c.fill();
  c.fillStyle = g;
  rr(c, x - 14, y - 24, 28, 48, 6);
  c.fill();
  c.strokeStyle = 'rgba(70,45,10,0.7)';
  c.lineWidth = 1.5;
  c.stroke();
  c.fillStyle = '#5a3d10';
  for (const dy of [-14, 0, 14]) {
    c.beginPath();
    c.arc(x, y + dy, 2.4, 0, Math.PI * 2);
    c.fill();
  }
}

/** The whole board (frame, felt, points, bar, trays and point numbers) as one 1280x720 texture. */
export function makeBoard(scene: Phaser.Scene, G: BoardGeometry, pointX: (v: number) => number, numbers: boolean): string {
  const key = numbers ? 'tv-board' : 'tv-board-plain';
  return make(scene, key, 1280, 720, (c) => {
    const x0 = G.FX0, y0 = G.FY0, w = G.TRAY1 + 18 - G.FX0, h = G.FY1 - G.FY0;
    // drop shadow
    c.save();
    c.shadowColor = 'rgba(0,0,0,0.65)';
    c.shadowBlur = 26;
    c.shadowOffsetY = 10;
    c.fillStyle = '#3a1d0a';
    rr(c, x0, y0, w, h, 20);
    c.fill();
    c.restore();
    // walnut frame
    c.save();
    rr(c, x0, y0, w, h, 20);
    c.clip();
    wood(c, x0, y0, w, h, 7, '#7a4422', '#4e2a12');
    c.restore();
    c.strokeStyle = 'rgba(255,214,150,0.35)';
    c.lineWidth = 2;
    rr(c, x0 + 1.5, y0 + 1.5, w - 3, h - 3, 19);
    c.stroke();
    c.strokeStyle = '#1e0d03';
    c.lineWidth = 3;
    rr(c, x0, y0, w, h, 20);
    c.stroke();

    // felt fields
    for (const [fx0, fx1] of [[G.IX0, G.BAR0], [G.BAR1, G.IX1]]) {
      const fw = fx1 - fx0, fh = G.IY1 - G.IY0;
      const felt = c.createRadialGradient(fx0 + fw / 2, G.IY0 + fh / 2, 40, fx0 + fw / 2, G.IY0 + fh / 2, fw * 0.75);
      felt.addColorStop(0, '#2a7a4e');
      felt.addColorStop(1, '#14462c');
      c.fillStyle = felt;
      c.fillRect(fx0, G.IY0, fw, fh);
      const rnd = seeded(fx0);
      for (let i = 0; i < 2200; i++) {
        c.fillStyle = rnd() < 0.5 ? 'rgba(255,255,255,0.025)' : 'rgba(0,0,0,0.05)';
        c.fillRect(fx0 + rnd() * fw, G.IY0 + rnd() * fh, 2, 2);
      }
      // inner shadow where the felt meets the frame
      c.save();
      c.beginPath();
      c.rect(fx0, G.IY0, fw, fh);
      c.clip();
      c.shadowColor = 'rgba(0,0,0,0.75)';
      c.shadowBlur = 18;
      c.strokeStyle = 'rgba(0,0,0,0.9)';
      c.lineWidth = 12;
      c.strokeRect(fx0 - 6, G.IY0 - 6, fw + 12, fh + 12);
      c.restore();
    }

    // points: inlaid triangles with a soft gradient, an outline and a centre stripe
    for (let v = 1; v <= 24; v++) {
      const x = pointX(v), top = v >= 13, half = G.PW / 2 - 4;
      const base = top ? G.IY0 : G.IY1, tip = top ? G.IY0 + G.TRI : G.IY1 - G.TRI;
      const dark = v % 2 === 0;
      const grad = c.createLinearGradient(0, base, 0, tip);
      grad.addColorStop(0, dark ? '#b23a28' : '#f4e2bb');
      grad.addColorStop(1, dark ? '#7e2318' : '#d9be88');
      c.save();
      c.shadowColor = 'rgba(0,0,0,0.35)';
      c.shadowBlur = 6;
      c.beginPath();
      c.moveTo(x - half, base);
      c.lineTo(x + half, base);
      c.lineTo(x, tip);
      c.closePath();
      c.fillStyle = grad;
      c.fill();
      c.restore();
      c.strokeStyle = dark ? 'rgba(60,10,4,0.55)' : 'rgba(120,85,40,0.45)';
      c.lineWidth = 1.5;
      c.stroke();
      c.beginPath();
      c.moveTo(x, base + (top ? 6 : -6));
      c.lineTo(x, base + (tip - base) * 0.78);
      c.strokeStyle = dark ? 'rgba(255,190,150,0.18)' : 'rgba(255,255,255,0.35)';
      c.lineWidth = 2;
      c.stroke();
    }

    // bar: a raised wooden spine with brass hinges
    c.save();
    c.shadowColor = 'rgba(0,0,0,0.6)';
    c.shadowBlur = 14;
    c.fillStyle = '#4a2810';
    c.fillRect(G.BAR0, G.FY0, G.BAR1 - G.BAR0, G.FY1 - G.FY0);
    c.restore();
    wood(c, G.BAR0, G.FY0, G.BAR1 - G.BAR0, G.FY1 - G.FY0, 11, '#6e3d1d', '#43230c', true);
    c.fillStyle = 'rgba(0,0,0,0.28)';
    c.fillRect(G.BARX - 2, G.FY0, 4, G.FY1 - G.FY0);
    hinge(c, G.BARX, G.FY0 + 110);
    hinge(c, G.BARX, G.FY1 - 110);

    // bear-off trays: recessed pockets
    for (const [ty0, ty1] of [[G.IY0, G.MIDY - 8], [G.MIDY + 8, G.IY1]]) {
      const tw = G.TRAY1 - G.TRAY0, th = ty1 - ty0;
      const g = c.createLinearGradient(G.TRAY0, 0, G.TRAY1, 0);
      g.addColorStop(0, '#1c0c03');
      g.addColorStop(0.5, '#2e1507');
      g.addColorStop(1, '#1c0c03');
      c.fillStyle = g;
      rr(c, G.TRAY0, ty0, tw, th, 8);
      c.fill();
      c.save();
      rr(c, G.TRAY0, ty0, tw, th, 8);
      c.clip();
      c.shadowColor = 'rgba(0,0,0,0.9)';
      c.shadowBlur = 12;
      c.strokeStyle = '#000';
      c.lineWidth = 8;
      rr(c, G.TRAY0 - 4, ty0 - 4, tw + 8, th + 8, 10);
      c.stroke();
      c.restore();
      c.strokeStyle = 'rgba(255,214,150,0.25)';
      c.lineWidth = 1.5;
      rr(c, G.TRAY0 + 0.5, ty0 + 0.5, tw - 1, th - 1, 8);
      c.stroke();
    }

    if (!numbers) return;
    c.font = `700 14px ${BODY_FONT}`;
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    for (let v = 1; v <= 24; v++) {
      const y = v >= 13 ? G.FY0 + 9 : G.FY1 - 9;
      c.fillStyle = 'rgba(0,0,0,0.5)';
      c.fillText(String(v), pointX(v), y + 1);
      c.fillStyle = '#f0c98f';
      c.fillText(String(v), pointX(v), y);
    }
  });
}

/** Glossy checkers: 'bg-w' (ivory) and 'bg-b' (ebony), with a soft shadow inside the texture. */
export function makeCheckers(scene: Phaser.Scene): void {
  const S = CK_TEX, R = (S * CK_FILL) / 2, cx = S / 2 - 2, cy = S / 2 - 3;
  const sets = [
    ['bg-w', '#fffaf0', '#e3d6bd', '#b9a888', 'rgba(150,120,80,0.55)'],
    ['bg-b', '#5a5560', '#2a272e', '#111014', 'rgba(255,255,255,0.12)'],
  ] as const;
  for (const [key, hi, mid, edge, groove] of sets) {
    make(scene, key, S, S, (c) => {
      c.save();
      c.shadowColor = 'rgba(0,0,0,0.55)';
      c.shadowBlur = 8;
      c.shadowOffsetX = 2;
      c.shadowOffsetY = 4;
      c.beginPath();
      c.arc(cx, cy, R, 0, Math.PI * 2);
      c.fillStyle = edge;
      c.fill();
      c.restore();
      const g = c.createRadialGradient(cx - R * 0.35, cy - R * 0.4, R * 0.1, cx, cy, R);
      g.addColorStop(0, hi);
      g.addColorStop(0.7, mid);
      g.addColorStop(1, edge);
      c.beginPath();
      c.arc(cx, cy, R - 2, 0, Math.PI * 2);
      c.fillStyle = g;
      c.fill();
      // turned grooves
      c.strokeStyle = groove;
      c.lineWidth = 2;
      for (const k of [0.72, 0.5]) {
        c.beginPath();
        c.arc(cx, cy, R * k, 0, Math.PI * 2);
        c.stroke();
      }
      // specular highlight
      const s = c.createRadialGradient(cx - R * 0.4, cy - R * 0.45, 1, cx - R * 0.4, cy - R * 0.45, R * 0.55);
      s.addColorStop(0, 'rgba(255,255,255,0.65)');
      s.addColorStop(1, 'rgba(255,255,255,0)');
      c.fillStyle = s;
      c.beginPath();
      c.arc(cx, cy, R - 2, 0, Math.PI * 2);
      c.fill();
      c.strokeStyle = 'rgba(0,0,0,0.45)';
      c.lineWidth = 1.5;
      c.beginPath();
      c.arc(cx, cy, R - 1, 0, Math.PI * 2);
      c.stroke();
    });
  }
  // bear-off slabs: checkers seen from the side
  for (const [k, top, bottom] of [['w', '#fbf4e4', '#b9a888'], ['b', '#4a4650', '#141217']] as const) {
    make(scene, `bg-slab-${k}`, 116, 28, (c) => {
      c.fillStyle = 'rgba(0,0,0,0.5)';
      rr(c, 3, 6, 110, 20, 9);
      c.fill();
      const g = c.createLinearGradient(0, 2, 0, 22);
      g.addColorStop(0, top);
      g.addColorStop(1, bottom);
      c.fillStyle = g;
      rr(c, 2, 2, 110, 20, 9);
      c.fill();
      c.strokeStyle = 'rgba(0,0,0,0.4)';
      c.lineWidth = 1.5;
      c.stroke();
      c.fillStyle = 'rgba(255,255,255,0.3)';
      rr(c, 8, 4, 98, 5, 3);
      c.fill();
    });
  }
}

const PIPS: Record<number, Array<[number, number]>> = {
  1: [[0, 0]],
  2: [[-1, -1], [1, 1]],
  3: [[-1, -1], [0, 0], [1, 1]],
  4: [[-1, -1], [1, -1], [-1, 1], [1, 1]],
  5: [[-1, -1], [1, -1], [0, 0], [-1, 1], [1, 1]],
  6: [[-1, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [1, 1]],
};

/** Dice 'die-white-1..6' (ivory with dark pips) and 'die-red-1..6' (red with white pips). */
export function makeDice(scene: Phaser.Scene): void {
  const S = DIE_TEX, D = S * DIE_FILL, x = (S - D) / 2 - 2, y = (S - D) / 2 - 3;
  for (const [col, hi, lo, pip] of [['white', '#ffffff', '#ddd5c4', '#1d1b22'], ['red', '#ff6a5a', '#b81f1a', '#ffffff']] as const) {
    for (let n = 1; n <= 6; n++) {
      make(scene, `die-${col}-${n}`, S, S, (c) => {
        c.save();
        c.shadowColor = 'rgba(0,0,0,0.55)';
        c.shadowBlur = 10;
        c.shadowOffsetX = 3;
        c.shadowOffsetY = 6;
        c.fillStyle = lo;
        rr(c, x, y, D, D, D * 0.2);
        c.fill();
        c.restore();
        const g = c.createLinearGradient(x, y, x + D, y + D);
        g.addColorStop(0, hi);
        g.addColorStop(1, lo);
        c.fillStyle = g;
        rr(c, x + 2, y + 2, D - 4, D - 4, D * 0.18);
        c.fill();
        c.fillStyle = 'rgba(255,255,255,0.35)';
        rr(c, x + 8, y + 6, D - 16, D * 0.22, D * 0.1);
        c.fill();
        c.strokeStyle = 'rgba(0,0,0,0.3)';
        c.lineWidth = 2;
        rr(c, x + 1, y + 1, D - 2, D - 2, D * 0.2);
        c.stroke();
        const r = D * 0.085, step = D * 0.27;
        for (const [px, py] of PIPS[n]) {
          const pxx = x + D / 2 + px * step, pyy = y + D / 2 + py * step;
          c.fillStyle = pip;
          c.beginPath();
          c.arc(pxx, pyy, r, 0, Math.PI * 2);
          c.fill();
          c.fillStyle = col === 'white' ? 'rgba(255,255,255,0.25)' : 'rgba(0,0,0,0.25)';
          c.beginPath();
          c.arc(pxx + r * 0.25, pyy + r * 0.3, r * 0.5, 0, Math.PI * 2);
          c.fill();
        }
      });
    }
  }
}

/** A soft round glow for highlights. */
export function makeGlow(scene: Phaser.Scene): void {
  make(scene, 'tv-glow', 128, 128, (c) => {
    const g = c.createRadialGradient(64, 64, 0, 64, 64, 64);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.35, 'rgba(255,255,255,0.5)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    c.fillStyle = g;
    c.fillRect(0, 0, 128, 128);
  });
}

export function makeArt(scene: Phaser.Scene): void {
  makeCheckers(scene);
  makeDice(scene);
  makeGlow(scene);
}
