// Skull Isle: old pirate charts, painted procedurally on canvases (there is no such art in the
// CC0 packs). An aged parchment with burnt, torn edges, stains, creases and a dark vignette; ink
// drawings on it: a compass rose with rhumb lines, little islands with hatched shores, dashed
// routes, a red X, a sea serpent and a ship. The treasure map (board.ts) and the sea chart (the
// route choice, shop.ts) both use it; each texture is painted once per page and cached by Phaser.
import Phaser from 'phaser';

export const INK = '#3a2210';
export const INK_N = 0x3a2210;
export const RED_INK = 0xa3202a;
export const BLUE_INK = 0x1f5a8a;

type Ctx = CanvasRenderingContext2D;

/** A small seeded generator, so a chart always comes out the same. */
export function rng(seed: number): () => number {
  let s = seed >>> 0 || 1;
  return () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
}

/** Paints a chart texture once (`draw` adds the ink on the parchment); returns its key. */
export function chartTexture(scene: Phaser.Scene, key: string, w: number, h: number, seed: number, draw: (g: Ctx, r: () => number) => void): string {
  if (scene.textures.exists(key)) return key;
  const tex = scene.textures.createCanvas(key, w, h)!;
  const g = tex.getContext();
  const r = rng(seed);
  parchment(g, w, h, r);
  draw(g, r);
  burn(g, w, h, r);
  tex.refresh();
  return key;
}

/** A bare aged sheet (no ink) of w x h into `g`: the menu's how-to card (menu.ts). */
export function paintSheet(g: Ctx, w: number, h: number, seed: number): void {
  const r = rng(seed);
  parchment(g, w, h, r);
  burn(g, w, h, r);
}

/** The torn outline of the sheet: a jagged rectangle a little inside the canvas. */
function edgePath(g: Ctx, w: number, h: number, r: () => number, inset: number): void {
  const pts: [number, number][] = [];
  const side = (x0: number, y0: number, x1: number, y1: number, n: number) => {
    for (let i = 0; i < n; i++) {
      const u = i / n;
      const nx = -(y1 - y0), ny = x1 - x0, l = Math.hypot(nx, ny);
      const j = (r() - 0.5) * 9 + (r() < 0.12 ? (r() - 0.2) * 22 : 0);
      pts.push([x0 + (x1 - x0) * u + nx / l * j, y0 + (y1 - y0) * u + ny / l * j]);
    }
  };
  const a = inset;
  side(a, a, w - a, a, 44); side(w - a, a, w - a, h - a, 70); side(w - a, h - a, a, h - a, 44); side(a, h - a, a, a, 70);
  g.beginPath();
  pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y)));
  g.closePath();
}

/** Aged parchment: a warm base, mottling, fibres, coffee rings, creases. */
function parchment(g: Ctx, w: number, h: number, r: () => number): void {
  g.save();
  edgePath(g, w, h, r, 14);
  g.clip();
  const base = g.createRadialGradient(w * 0.5, h * 0.45, 40, w * 0.5, h * 0.5, Math.max(w, h) * 0.75);
  base.addColorStop(0, '#f3e3b8'); base.addColorStop(0.55, '#e8d2a0'); base.addColorStop(1, '#c9a468');
  g.fillStyle = base;
  g.fillRect(0, 0, w, h);
  // mottling: big soft blotches lighter and darker
  for (let i = 0; i < 46; i++) {
    const x = r() * w, y = r() * h, rad = 40 + r() * 140, dark = r() < 0.6;
    const gr = g.createRadialGradient(x, y, 0, x, y, rad);
    gr.addColorStop(0, dark ? `rgba(150,105,50,${0.05 + r() * 0.07})` : `rgba(255,248,220,${0.08 + r() * 0.08})`);
    gr.addColorStop(1, 'rgba(150,105,50,0)');
    g.fillStyle = gr;
    g.fillRect(x - rad, y - rad, rad * 2, rad * 2);
  }
  // fibres
  g.lineWidth = 1;
  for (let i = 0; i < 260; i++) {
    const x = r() * w, y = r() * h, a = r() * Math.PI, l = 6 + r() * 22;
    g.strokeStyle = `rgba(120,80,40,${0.04 + r() * 0.06})`;
    g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l); g.stroke();
  }
  // a couple of faint coffee rings (broken arcs) and water stains with ragged edges
  for (let i = 0; i < 3; i++) {
    const x = 60 + r() * (w - 120), y = 80 + r() * (h - 160), rad = 22 + r() * 30;
    g.strokeStyle = `rgba(120,70,25,${0.07 + r() * 0.06})`;
    g.lineWidth = 1.5 + r() * 2;
    const a0 = r() * 6;
    g.beginPath(); g.arc(x, y, rad, a0, a0 + Math.PI * (0.8 + r() * 0.7)); g.stroke();
    g.beginPath(); g.arc(x + 2, y - 1, rad * 0.97, a0 + Math.PI * 1.7, a0 + Math.PI * 2.1); g.stroke();
  }
  for (let i = 0; i < 6; i++) {
    const x = r() * w, y = r() * h, rad = 30 + r() * 60;
    g.fillStyle = `rgba(150,100,45,${0.04 + r() * 0.04})`;
    g.beginPath();
    for (let k = 0; k <= 16; k++) { const a = (k / 16) * Math.PI * 2, rr = rad * (0.75 + r() * 0.4); k ? g.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr) : g.moveTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr); }
    g.fill();
  }
  // creases where it was folded in four
  for (const [x0, y0, x1, y1] of [[w / 2 + (r() - 0.5) * 20, 0, w / 2 + (r() - 0.5) * 20, h], [0, h / 2 + (r() - 0.5) * 30, w, h / 2 + (r() - 0.5) * 30]]) {
    g.strokeStyle = 'rgba(110,70,30,0.16)'; g.lineWidth = 3;
    g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); g.stroke();
    g.strokeStyle = 'rgba(255,250,230,0.22)'; g.lineWidth = 2;
    g.beginPath(); g.moveTo(x0 + 3, y0 + 3); g.lineTo(x1 + 3, y1 + 3); g.stroke();
  }
  g.restore();
}

/** Burnt edges and the vignette, over the ink (the sheet browns towards its edges). */
function burn(g: Ctx, w: number, h: number, r: () => number): void {
  g.save();
  edgePath(g, w, h, rng(7), 14);
  g.clip();
  const v = g.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.32, w / 2, h / 2, Math.max(w, h) * 0.66);
  v.addColorStop(0, 'rgba(60,30,10,0)'); v.addColorStop(0.8, 'rgba(70,35,10,0.2)'); v.addColorStop(1, 'rgba(50,20,5,0.55)');
  g.fillStyle = v;
  g.fillRect(0, 0, w, h);
  // scorch along the torn edge: wide soft dark strokes, then a thin charred line
  edgePath(g, w, h, rng(7), 14);
  for (const [lw, a] of [[38, 0.1], [24, 0.16], [12, 0.28], [5, 0.55]] as [number, number][]) {
    g.lineWidth = lw; g.strokeStyle = `rgba(55,25,8,${a})`; g.stroke();
  }
  g.lineWidth = 2; g.strokeStyle = 'rgba(25,10,2,0.85)'; g.stroke();
  // a few burnt bites out of the corners and edges
  for (let i = 0; i < 7; i++) {
    const edge = Math.floor(r() * 4), u = r();
    const x = edge === 0 ? u * w : edge === 1 ? w - 14 : edge === 2 ? u * w : 14;
    const y = edge === 0 ? 14 : edge === 1 ? u * h : edge === 2 ? h - 14 : u * h;
    const rad = 14 + r() * 26;
    const gr = g.createRadialGradient(x, y, rad * 0.4, x, y, rad * 1.6);
    gr.addColorStop(0, 'rgba(40,15,4,0.7)'); gr.addColorStop(1, 'rgba(40,15,4,0)');
    g.fillStyle = gr;
    g.fillRect(x - rad * 2, y - rad * 2, rad * 4, rad * 4);
  }
  g.restore();
  // the bites themselves: transparent holes ringed with char
  g.save();
  g.globalCompositeOperation = 'destination-out';
  for (let i = 0; i < 5; i++) {
    const c = [[14, 14], [w - 14, 14], [14, h - 14], [w - 14, h - 14]][i % 4];
    const rad = 10 + r() * 16;
    g.beginPath();
    for (let k = 0; k <= 12; k++) { const a = (k / 12) * Math.PI * 2, rr = rad * (0.7 + r() * 0.5); k ? g.lineTo(c[0] + Math.cos(a) * rr, c[1] + Math.sin(a) * rr) : g.moveTo(c[0] + Math.cos(a) * rr, c[1] + Math.sin(a) * rr); }
    g.fill();
  }
  g.restore();
}

// ------------------------------------------------------------------ ink drawings

/** Thin rhumb lines radiating from a point across the chart (the old portolan way). */
export function rhumbLines(g: Ctx, cx: number, cy: number, len: number, alpha = 0.16): void {
  g.save();
  for (let i = 0; i < 32; i++) {
    const a = (i / 32) * Math.PI * 2;
    g.strokeStyle = i % 4 === 0 ? `rgba(58,34,16,${alpha * 1.4})` : i % 2 ? `rgba(163,32,42,${alpha * 0.8})` : `rgba(31,90,138,${alpha})`;
    g.lineWidth = i % 4 === 0 ? 1.4 : 1;
    g.beginPath(); g.moveTo(cx, cy); g.lineTo(cx + Math.cos(a) * len, cy + Math.sin(a) * len); g.stroke();
  }
  g.restore();
}

/** A compass rose: rings, sixteen points in ink and red, a fleur pointing north. */
export function compassRose(g: Ctx, cx: number, cy: number, R: number): void {
  g.save();
  g.translate(cx, cy);
  g.strokeStyle = INK; g.lineWidth = 2;
  g.beginPath(); g.arc(0, 0, R, 0, Math.PI * 2); g.stroke();
  g.lineWidth = 1;
  g.beginPath(); g.arc(0, 0, R * 0.88, 0, Math.PI * 2); g.stroke();
  for (let i = 0; i < 64; i++) {
    const a = (i / 64) * Math.PI * 2, l = i % 4 ? 0.06 : 0.12;
    g.beginPath(); g.moveTo(Math.cos(a) * R * 0.88, Math.sin(a) * R * 0.88); g.lineTo(Math.cos(a) * R * (0.88 - l), Math.sin(a) * R * (0.88 - l)); g.stroke();
  }
  const star = (n: number, r0: number, r1: number, rot: number, dark: string, light: string) => {
    for (let i = 0; i < n; i++) {
      const a = rot + (i / n) * Math.PI * 2, b = Math.PI / n;
      for (const [s, col] of [[1, dark], [-1, light]] as [number, string][]) {
        g.fillStyle = col;
        g.beginPath(); g.moveTo(0, 0); g.lineTo(Math.cos(a) * r1, Math.sin(a) * r1); g.lineTo(Math.cos(a + s * b) * r0, Math.sin(a + s * b) * r0); g.closePath(); g.fill();
      }
      g.strokeStyle = INK; g.lineWidth = 1;
      g.beginPath(); g.moveTo(Math.cos(a - b) * r0, Math.sin(a - b) * r0); g.lineTo(Math.cos(a) * r1, Math.sin(a) * r1); g.lineTo(Math.cos(a + b) * r0, Math.sin(a + b) * r0); g.stroke();
    }
  };
  star(8, R * 0.2, R * 0.62, Math.PI / 8 - Math.PI / 2, '#8a1a22', '#e8cfa0');
  star(4, R * 0.24, R * 0.86, -Math.PI / 2, '#3a2210', '#f2e2b8');
  g.fillStyle = '#a3202a';
  g.beginPath(); g.arc(0, 0, R * 0.07, 0, Math.PI * 2); g.fill();
  // the fleur over north
  g.translate(0, -R * 1.02);
  g.fillStyle = '#a3202a'; g.strokeStyle = INK; g.lineWidth = 1.5;
  g.beginPath();
  g.moveTo(0, -R * 0.26); g.quadraticCurveTo(R * 0.1, -R * 0.1, 0, R * 0.02); g.quadraticCurveTo(-R * 0.1, -R * 0.1, 0, -R * 0.26);
  g.fill(); g.stroke();
  for (const s of [-1, 1]) { g.beginPath(); g.moveTo(0, -R * 0.02); g.quadraticCurveTo(s * R * 0.22, -R * 0.2, s * R * 0.16, R * 0.02); g.quadraticCurveTo(s * R * 0.06, -R * 0.04, 0, R * 0.02); g.fill(); g.stroke(); }
  g.restore();
}

/** An ink island: a lumpy coast, sand inside, hatched water lines round its shore, a palm or two. */
export function inkIsland(g: Ctx, cx: number, cy: number, R: number, r: () => number, o: { palms?: number; fill?: string } = {}): void {
  const n = 22, pts: [number, number][] = [];
  const ph = r() * 6;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const k = 1 + Math.sin(a * 3 + ph) * 0.14 + Math.sin(a * 5 + ph * 2) * 0.07 + (r() - 0.5) * 0.08;
    pts.push([cx + Math.cos(a) * R * k, cy + Math.sin(a) * R * k * 0.78]);
  }
  const path = (s: number) => {
    g.beginPath();
    pts.forEach(([x, y], i) => { const px = cx + (x - cx) * s, py = cy + (y - cy) * s; i ? g.lineTo(px, py) : g.moveTo(px, py); });
    g.closePath();
  };
  g.save();
  // hatched water round the shore
  g.strokeStyle = 'rgba(31,90,138,0.28)'; g.lineWidth = 1.1;
  for (const s of [1.14, 1.28]) { path(s); g.stroke(); }
  path(1);
  g.fillStyle = o.fill ?? '#ead09a';
  g.fill();
  g.strokeStyle = INK; g.lineWidth = 2.2;
  g.stroke();
  // shading inside the coast
  g.strokeStyle = 'rgba(120,80,30,0.35)'; g.lineWidth = 1;
  path(0.82); g.stroke();
  for (let i = 0; i < (o.palms ?? 1); i++) {
    const x = cx + (r() - 0.5) * R * 0.8, y = cy + (r() - 0.6) * R * 0.5;
    g.strokeStyle = INK; g.lineWidth = 1.6;
    g.beginPath(); g.moveTo(x, y + R * 0.18); g.quadraticCurveTo(x + R * 0.06, y, x + R * 0.02, y - R * 0.2); g.stroke();
    for (let k = 0; k < 5; k++) {
      const a = -Math.PI * 0.95 + k * Math.PI * 0.22;
      g.beginPath(); g.moveTo(x + R * 0.02, y - R * 0.2); g.quadraticCurveTo(x + Math.cos(a) * R * 0.14, y - R * 0.26 + Math.sin(a) * R * 0.08, x + Math.cos(a) * R * 0.24, y - R * 0.12 + Math.sin(a) * R * 0.06); g.stroke();
    }
  }
  g.restore();
}

/** Little wave marks (the open sea on old charts). */
export function waves(g: Ctx, x: number, y: number, n: number, r: () => number, color = 'rgba(31,90,138,0.4)'): void {
  g.save();
  g.strokeStyle = color; g.lineWidth = 1.4;
  for (let i = 0; i < n; i++) {
    const wx = x + (r() - 0.5) * 70, wy = y + (r() - 0.5) * 40, s = 6 + r() * 4;
    g.beginPath(); g.moveTo(wx - s * 2, wy); g.quadraticCurveTo(wx - s, wy - s * 0.8, wx, wy); g.quadraticCurveTo(wx + s, wy - s * 0.8, wx + s * 2, wy); g.stroke();
  }
  g.restore();
}

/** A sea serpent: humps out of the waves, a curled tail, a toothy head. */
export function serpent(g: Ctx, x: number, y: number, s: number, flip = 1): void {
  g.save();
  g.translate(x, y); g.scale(flip * s, s);
  g.strokeStyle = INK; g.lineWidth = 2.2 / s; g.fillStyle = '#4f7a5a';
  for (const [hx, hr] of [[-40, 14], [-8, 17], [24, 13]] as [number, number][]) {
    g.beginPath(); g.arc(hx, 0, hr, Math.PI, 0); g.fill(); g.stroke();
    g.strokeStyle = 'rgba(31,90,138,0.6)'; g.beginPath(); g.moveTo(hx - hr - 6, 2); g.quadraticCurveTo(hx, 6, hx + hr + 6, 2); g.stroke(); g.strokeStyle = INK;
  }
  // the head, rising on the right
  g.beginPath(); g.moveTo(40, 0); g.quadraticCurveTo(46, -26, 60, -30); g.quadraticCurveTo(76, -30, 78, -22); g.lineTo(62, -18); g.lineTo(70, -14); g.quadraticCurveTo(58, -10, 52, 0); g.closePath(); g.fill(); g.stroke();
  g.fillStyle = '#f3e3b8'; g.beginPath(); g.arc(64, -25, 2.6, 0, Math.PI * 2); g.fill();
  g.fillStyle = INK; g.beginPath(); g.arc(64.5, -25, 1.2, 0, Math.PI * 2); g.fill();
  // the curled tail on the left
  g.fillStyle = '#4f7a5a';
  g.beginPath(); g.moveTo(-54, 0); g.quadraticCurveTo(-66, -20, -78, -14); g.quadraticCurveTo(-86, -8, -78, -4); g.quadraticCurveTo(-70, -10, -62, 0); g.closePath(); g.fill(); g.stroke();
  g.restore();
}

/** A little ship under sail, side on. */
export function shipDoodle(g: Ctx, x: number, y: number, s: number, flip = 1, dark = false): void {
  g.save();
  g.translate(x, y); g.scale(flip * s, s);
  g.strokeStyle = INK; g.lineWidth = 1.8 / s;
  g.fillStyle = dark ? '#4a4a52' : '#8a5a30';
  g.beginPath(); g.moveTo(-30, -4); g.lineTo(30, -4); g.lineTo(22, 8); g.lineTo(-24, 8); g.closePath(); g.fill(); g.stroke();
  g.beginPath(); g.moveTo(0, -4); g.lineTo(0, -46); g.moveTo(-14, -4); g.lineTo(-14, -34); g.stroke();
  g.fillStyle = dark ? '#cfe8dc' : '#f6ecd4';
  for (const [mx, top, h, w] of [[0, -44, 30, 18], [-14, -32, 20, 13]] as number[][]) {
    g.beginPath(); g.moveTo(mx - w / 2, top); g.quadraticCurveTo(mx + 4, top + h / 2, mx - w / 2, top + h); g.lineTo(mx + w / 2, top + h); g.quadraticCurveTo(mx + w / 2 + 6, top + h / 2, mx + w / 2, top); g.closePath(); g.fill(); g.stroke();
  }
  g.fillStyle = dark ? '#5affb0' : '#a3202a';
  g.beginPath(); g.moveTo(0, -46); g.lineTo(10, -43); g.lineTo(0, -40); g.closePath(); g.fill();
  g.strokeStyle = 'rgba(31,90,138,0.6)';
  g.beginPath(); g.moveTo(-36, 10); g.quadraticCurveTo(-18, 14, 0, 10); g.quadraticCurveTo(18, 6, 36, 10); g.stroke();
  g.restore();
}

/** Storm clouds and a bolt (the stormy passage). */
export function stormDoodle(g: Ctx, x: number, y: number, s: number): void {
  g.save();
  g.translate(x, y); g.scale(s, s);
  g.fillStyle = 'rgba(80,88,100,0.55)'; g.strokeStyle = INK; g.lineWidth = 1.6 / s;
  g.beginPath();
  g.arc(-18, 0, 14, Math.PI * 0.5, Math.PI * 1.5); g.arc(0, -10, 18, Math.PI, 0); g.arc(20, -2, 13, Math.PI * 1.3, Math.PI * 0.5); g.closePath();
  g.fill(); g.stroke();
  g.fillStyle = '#e8b830';
  g.beginPath(); g.moveTo(2, 8); g.lineTo(-6, 26); g.lineTo(2, 24); g.lineTo(-4, 42); g.lineTo(12, 18); g.lineTo(4, 20); g.lineTo(10, 8); g.closePath(); g.fill(); g.stroke();
  g.restore();
}

/** A red X (where the treasure lies). */
export function xMark(g: Ctx, x: number, y: number, s: number): void {
  g.save();
  g.strokeStyle = '#a3202a'; g.lineCap = 'round';
  for (const [lw, a] of [[s * 0.42, 0.25], [s * 0.26, 1]] as [number, number][]) {
    g.globalAlpha = a; g.lineWidth = lw;
    g.beginPath(); g.moveTo(x - s, y - s); g.lineTo(x + s, y + s); g.moveTo(x + s, y - s); g.lineTo(x - s, y + s); g.stroke();
  }
  g.restore();
}

/** A banner scroll behind a title (its ends curled back). */
export function scrollBanner(g: Ctx, cx: number, cy: number, w: number, h: number): void {
  g.save();
  g.strokeStyle = INK; g.lineWidth = 2;
  for (const s of [-1, 1]) {
    g.fillStyle = '#c9a468';
    g.beginPath();
    g.moveTo(cx + s * (w / 2 - 20), cy - h / 2 + 12); g.lineTo(cx + s * (w / 2 + 30), cy - h / 2 + 12); g.lineTo(cx + s * (w / 2 + 14), cy + 6); g.lineTo(cx + s * (w / 2 + 30), cy + h / 2 + 12); g.lineTo(cx + s * (w / 2 - 20), cy + h / 2 + 12); g.closePath();
    g.fill(); g.stroke();
  }
  g.fillStyle = '#efdcae';
  g.beginPath();
  g.moveTo(cx - w / 2, cy - h / 2); g.quadraticCurveTo(cx, cy - h / 2 - 10, cx + w / 2, cy - h / 2); g.lineTo(cx + w / 2, cy + h / 2); g.quadraticCurveTo(cx, cy + h / 2 - 10, cx - w / 2, cy + h / 2); g.closePath();
  g.fill(); g.stroke();
  g.restore();
}

/**
 * A dashed ink path through points (a smooth curve) into a Phaser graphics: `dash`/`gap` in pixels.
 * Returns the curve's points (for placing marks along it).
 */
export function dashedPath(gr: Phaser.GameObjects.Graphics, pts: Phaser.Math.Vector2[], color: number, alpha: number, width: number, dash = 14, gap = 10): Phaser.Math.Vector2[] {
  const curve = new Phaser.Curves.Spline(pts);
  const len = curve.getLength();
  const sp = curve.getSpacedPoints(Math.max(8, Math.round(len / 3)));
  let acc = 0, on = true, from = sp[0];
  gr.lineStyle(width, color, alpha);
  for (let i = 1; i < sp.length; i++) {
    const a = sp[i - 1], b = sp[i];
    acc += Phaser.Math.Distance.BetweenPoints(a, b);
    if (on && acc >= dash) { gr.lineBetween(from.x, from.y, b.x, b.y); on = false; acc = 0; }
    else if (!on && acc >= gap) { on = true; acc = 0; from = b; }
  }
  if (on) gr.lineBetween(from.x, from.y, sp[sp.length - 1].x, sp[sp.length - 1].y);
  return sp;
}
