// Crystal Keep's menu theme (src/core/menu-theme.ts): a fantasy keep in magic violet. Cinzel
// (Black) on carved stone plates (chiselled bevels, mortar specks and hairline cracks) set with
// glowing crystal gems, the how-to and the pause / result card on a vellum page in a carved stone
// frame with a crystal in each corner, castle battlements round the screen with a crystal-topped
// turret in each corner, and the logo over a crystal tower. Everything is painted on canvas once
// (under the Ayvago intro) and cached.
import { type MenuTheme, type SkinPainter, type BorderStyle } from '@core';
import { CINZEL } from '@core/fonts/cinzel';

export const STONE = 0x6a6380, SLATE = 0x2a2440, AMETHYST = 0x7a3fc0, CRYSTAL = 0xc58cff, GOLD = 0xffd27a, EMERALD = 0x2f9e56;
export const INK = '#2a1a40';
export const LABEL_STROKE = '#140a24';

export const css = (c: number, a = 1): string => {
  const r = (c >> 16) & 255, g = (c >> 8) & 255, b = c & 255;
  return a >= 1 ? `rgb(${r},${g},${b})` : `rgba(${r},${g},${b},${a})`;
};
export const shade = (c: number, k: number): number => {
  const f = (v: number) => Math.round(k > 0 ? v + (255 - v) * k : v * (1 + k));
  return (f((c >> 16) & 255) << 16) | (f((c >> 8) & 255) << 8) | f(c & 255);
};
export function rng(seed: number): () => number {
  let s = (seed >>> 0) % 2147483647 || 1;
  return () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
}

/** A faceted crystal (a long hexagon) centred on (x, y), R tall, glowing in `col`. */
export function gem(c: CanvasRenderingContext2D, x: number, y: number, R: number, col = CRYSTAL, glow = true, dim = 1): void {
  const W = R * 0.62;
  c.save();
  if (glow) {
    const halo = c.createRadialGradient(x, y, R * 0.2, x, y, R * 2);
    halo.addColorStop(0, css(col, 0.55 * dim)); halo.addColorStop(1, css(col, 0));
    c.fillStyle = halo; c.beginPath(); c.arc(x, y, R * 2, 0, Math.PI * 2); c.fill();
  }
  const pts: number[][] = [[0, -R], [W, -R * 0.45], [W, R * 0.45], [0, R], [-W, R * 0.45], [-W, -R * 0.45]];
  const facet = (a: number[], b: number[], k: number) => {
    c.fillStyle = css(shade(col, k));
    c.beginPath(); c.moveTo(x, y); c.lineTo(x + a[0], y + a[1]); c.lineTo(x + b[0], y + b[1]); c.closePath(); c.fill();
  };
  const shades = [0.55, 0.15, -0.25, -0.45, -0.1, 0.35];
  for (let i = 0; i < 6; i++) facet(pts[i], pts[(i + 1) % 6], dim < 1 ? shades[i] - 0.4 : shades[i]);
  c.beginPath();
  pts.forEach((p, i) => (i ? c.lineTo(x + p[0], y + p[1]) : c.moveTo(x + p[0], y + p[1])));
  c.closePath();
  c.lineWidth = Math.max(1, R * 0.1); c.strokeStyle = css(shade(col, -0.7)); c.stroke();
  c.fillStyle = `rgba(255,255,255,${0.75 * dim})`;
  c.beginPath(); c.moveTo(x - W * 0.5, y - R * 0.4); c.lineTo(x - W * 0.15, y - R * 0.75); c.lineTo(x - W * 0.1, y - R * 0.3); c.closePath(); c.fill();
  c.restore();
}

/** Stone grain: mottled speckles, a few hairline cracks. */
function stoneGrain(c: CanvasRenderingContext2D, w: number, h: number, col: number, r: () => number): void {
  for (let i = 0; i < (w * h) / 26; i++) {
    c.fillStyle = r() < 0.5 ? css(shade(col, 0.25), 0.18) : css(shade(col, -0.45), 0.2);
    const s = 1 + r() * 2.4;
    c.fillRect(r() * w, r() * h, s, s);
  }
  for (let i = 0; i < 2 + w / 160; i++) {
    const sx = w * r(), sy = h * r();
    c.fillStyle = css(shade(col, -0.2), 0.12);
    c.beginPath(); c.ellipse(sx, sy, 12 + r() * 30, 6 + r() * 14, r() * 3, 0, Math.PI * 2); c.fill();
  }
  c.strokeStyle = css(shade(col, -0.65), 0.55); c.lineWidth = 1;
  for (let i = 0; i < (w > 200 ? 2 : 1); i++) {
    let x = w * (0.15 + r() * 0.7), y = r() < 0.5 ? 0 : h;
    c.beginPath(); c.moveTo(x, y);
    for (let k = 0; k < 4; k++) { x += (r() - 0.5) * 18; y += (y < h / 2 ? 1 : -1) * (h * 0.12 + r() * 6); c.lineTo(x, y); }
    c.stroke();
  }
}

/**
 * The carved-stone skin: a stone plate with a chiselled bevel (light top-left, dark bottom-right)
 * and, on big buttons, a crystal set in each end; the main buttons are amethyst-veined stone.
 * Hover lights the edge in violet, the selected segment gets a gold inlay, a press sinks the
 * plate. Boards are dark slate with a crystal in each corner, the switch's track a sunk channel.
 */
export const stoneSkin: SkinPainter = (c, kind, w, h, o) => {
  const P = o.palette, r = rng(o.seed);
  const sunk = o.state === 'down' || o.state === 'off' || kind === 'track';
  const off = o.state === 'off';
  const round = kind === 'round';
  const col = off ? shade(o.color, -0.35) : o.color;
  const R = round ? Math.min(w, h) / 2 : Math.min(10, h * 0.14);
  const shapeAt = (i: number): Path2D => {
    const p = new Path2D();
    if (round) { p.arc(w / 2, h / 2, Math.min(w, h) / 2 - i, 0, Math.PI * 2); return p; }
    // a slightly chamfered slab
    const k = Math.max(2, R - i * 0.5);
    p.moveTo(i + k, i); p.lineTo(w - i - k, i); p.lineTo(w - i, i + k); p.lineTo(w - i, h - i - k);
    p.lineTo(w - i - k, h - i); p.lineTo(i + k, h - i); p.lineTo(i, h - i - k); p.lineTo(i, i + k); p.closePath();
    return p;
  };
  const outer = shapeAt(0);
  c.save();
  c.translate(0, o.state === 'down' ? 3 : 0);
  if (o.state === 'over') {
    c.save();
    c.shadowColor = css(CRYSTAL, 0.95); c.shadowBlur = 20;
    c.fillStyle = css(CRYSTAL); c.fill(outer);
    c.restore();
  }
  c.save();
  c.shadowColor = 'rgba(0,0,0,0.6)'; c.shadowBlur = sunk ? 3 : 10; c.shadowOffsetY = sunk ? 1 : 6;
  c.fillStyle = '#000'; c.fill(outer);
  c.restore();
  const body = c.createLinearGradient(0, 0, w * 0.3, h);
  body.addColorStop(0, css(shade(col, sunk ? -0.1 : 0.2)));
  body.addColorStop(0.5, css(col));
  body.addColorStop(1, css(shade(col, -0.3)));
  c.fillStyle = body; c.fill(outer);
  c.save(); c.clip(outer);
  stoneGrain(c, w, h, col, r);
  // amethyst veins on the main buttons
  if (o.color === P.primary) {
    for (let i = 0; i < 3; i++) {
      c.strokeStyle = `rgba(230,180,255,${0.18 + r() * 0.12})`; c.lineWidth = 1.5 + r() * 2;
      let x = r() * w, y = 0;
      c.beginPath(); c.moveTo(x, y);
      while (y < h) { x += (r() - 0.5) * 30; y += 8 + r() * 10; c.lineTo(x, y); }
      c.stroke();
    }
  }
  if (sunk) {
    const top = c.createLinearGradient(0, 0, 0, 14);
    top.addColorStop(0, 'rgba(0,0,0,0.55)'); top.addColorStop(1, 'rgba(0,0,0,0)');
    c.fillStyle = top; c.fillRect(0, 0, w, 14);
  }
  c.restore();
  // the chiselled bevel
  if (!round) {
    const b = Math.max(3, Math.min(7, h * 0.08));
    const inner = shapeAt(b);
    c.save(); c.clip(outer);
    c.fillStyle = sunk ? 'rgba(0,0,0,0.3)' : 'rgba(255,255,255,0.22)';
    c.beginPath(); c.moveTo(0, 0); c.lineTo(w, 0); c.lineTo(w - b, b); c.lineTo(b, b); c.lineTo(b, h - b); c.lineTo(0, h); c.closePath(); c.fill();
    c.fillStyle = sunk ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.35)';
    c.beginPath(); c.moveTo(w, 0); c.lineTo(w, h); c.lineTo(0, h); c.lineTo(b, h - b); c.lineTo(w - b, h - b); c.lineTo(w - b, b); c.closePath(); c.fill();
    c.restore();
    c.lineWidth = 1; c.strokeStyle = 'rgba(0,0,0,0.35)'; c.stroke(inner);
    if (o.state === 'on') { c.lineWidth = 3; c.strokeStyle = css(GOLD); c.stroke(shapeAt(b + 2)); }
  } else {
    c.lineWidth = 3; c.strokeStyle = 'rgba(255,255,255,0.2)'; c.stroke(shapeAt(3));
    gem(c, w / 2, h / 2, Math.min(w, h) * 0.24, CRYSTAL, !off, off ? 0.5 : 1);
  }
  // the crystals
  if (kind === 'button' && w >= 240 && h >= 70) {
    for (const x of [26, w - 26]) gem(c, x, h / 2, Math.min(18, h * 0.22), o.color === P.primary ? GOLD_GEM : CRYSTAL, !off, off ? 0.5 : 1);
  } else if (kind === 'board' && w >= 120) {
    for (const [x, y] of [[16, 16], [w - 16, 16], [16, h - 16], [w - 16, h - 16]]) gem(c, x, y, 8, CRYSTAL, true);
  }
  c.lineWidth = 2; c.strokeStyle = css(shade(col, -0.7)); c.stroke(outer);
  if (o.state === 'over') { c.lineWidth = 2.5; c.strokeStyle = css(shade(CRYSTAL, 0.4)); c.stroke(outer); }
  if (o.state === 'down') { c.fillStyle = 'rgba(0,0,0,0.15)'; c.fill(outer); }
  c.restore();
};

/** The gems on the main buttons: a warm citrine. */
const GOLD_GEM = 0xffc04a;

// ------------------------------------------------------------------ the vellum page

/** The how-to and the pause / result card: vellum in a carved stone frame, a crystal in each corner. */
export function vellum(c: CanvasRenderingContext2D, w: number, h: number): void {
  const band = 14, r = rng(w * 17 + h * 3);
  const outer = new Path2D(); outer.roundRect(0, 0, w, h, 6);
  c.save();
  c.shadowColor = 'rgba(0,0,0,0.6)'; c.shadowBlur = 18; c.shadowOffsetY = 8;
  c.fillStyle = '#000'; c.fill(outer);
  c.restore();
  // the stone frame
  const fg = c.createLinearGradient(0, 0, w, h);
  fg.addColorStop(0, css(shade(STONE, 0.15))); fg.addColorStop(1, css(shade(STONE, -0.35)));
  c.fillStyle = fg; c.fill(outer);
  c.save(); c.clip(outer); stoneGrain(c, w, h, STONE, r); c.restore();
  // its carved blocks: joints across the frame
  c.strokeStyle = 'rgba(20,10,30,0.45)'; c.lineWidth = 1.2;
  for (let x = 40 + r() * 20; x < w - 20; x += 60 + r() * 30) { c.beginPath(); c.moveTo(x, 0); c.lineTo(x, band); c.moveTo(x + 20, h - band); c.lineTo(x + 20, h); c.stroke(); }
  for (let y = 40 + r() * 20; y < h - 20; y += 60 + r() * 30) { c.beginPath(); c.moveTo(0, y); c.lineTo(band, y); c.moveTo(w - band, y + 20); c.lineTo(w, y + 20); c.stroke(); }
  // the page
  const px = band, py = band, pw = w - band * 2, ph = h - band * 2;
  const page = c.createLinearGradient(0, py, 0, py + ph);
  page.addColorStop(0, '#f8f1ff'); page.addColorStop(1, '#e8dcf2');
  c.fillStyle = page; c.fillRect(px, py, pw, ph);
  c.save();
  c.beginPath(); c.rect(px, py, pw, ph); c.clip();
  const edge = c.createRadialGradient(px + pw / 2, py + ph / 2, Math.min(pw, ph) * 0.35, px + pw / 2, py + ph / 2, Math.max(pw, ph) * 0.72);
  edge.addColorStop(0, 'rgba(150,90,200,0)'); edge.addColorStop(1, 'rgba(120,70,170,0.22)');
  c.fillStyle = edge; c.fillRect(px, py, pw, ph);
  for (let i = 0; i < pw * ph * 0.0015; i++) { c.fillStyle = 'rgba(90,50,130,0.05)'; c.fillRect(px + r() * pw, py + r() * ph, 2, 2); }
  c.restore();
  // a gold rule inside the page, and the carved edge's shadow on it
  c.strokeStyle = css(GOLD, 0.7); c.lineWidth = 1.5;
  c.strokeRect(px + 7, py + 7, pw - 14, ph - 14);
  const sh = c.createLinearGradient(0, py, 0, py + 10);
  sh.addColorStop(0, 'rgba(0,0,0,0.3)'); sh.addColorStop(1, 'rgba(0,0,0,0)');
  c.fillStyle = sh; c.fillRect(px, py, pw, 10);
  c.lineWidth = 2; c.strokeStyle = 'rgba(20,10,30,0.7)'; c.strokeRect(px, py, pw, ph);
  c.lineWidth = 2; c.strokeStyle = 'rgba(20,10,30,0.85)'; c.stroke(outer);
  // a crystal in each corner of the frame
  for (const [x, y] of [[band / 2 + 2, band / 2 + 2], [w - band / 2 - 2, band / 2 + 2], [band / 2 + 2, h - band / 2 - 2], [w - band / 2 - 2, h - band / 2 - 2]]) {
    c.fillStyle = css(shade(STONE, -0.3)); c.beginPath(); c.arc(x, y, 13, 0, Math.PI * 2); c.fill();
    c.strokeStyle = 'rgba(20,10,30,0.8)'; c.lineWidth = 1.5; c.stroke();
    gem(c, x, y, 10, CRYSTAL, true);
  }
}

// ------------------------------------------------------------------ the frame

/** Battlements: a stone wall strip with merlons along its inner side and joints between blocks. */
const battlement: BorderStyle['edge'] = (c, len, t) => {
  const r = rng(len + t);
  const wall = 12, merH = t - wall, merW = 26, gap = 18;
  const draw = (p: Path2D) => {
    const g = c.createLinearGradient(0, 0, 0, t);
    g.addColorStop(0, css(shade(SLATE, 0.25))); g.addColorStop(1, css(shade(SLATE, -0.2)));
    c.fillStyle = g; c.fill(p);
  };
  const p = new Path2D();
  p.rect(0, 0, len, wall);
  for (let x = 6; x < len; x += merW + gap) p.rect(x, wall - 1, Math.min(merW, len - x), merH + 1);
  c.save();
  c.shadowColor = 'rgba(0,0,0,0.55)'; c.shadowBlur = 5; c.shadowOffsetY = 3;
  draw(p);
  c.restore();
  c.save(); c.clip(p);
  stoneGrain(c, len, t, SLATE, r);
  // the joints of the blocks
  c.strokeStyle = 'rgba(10,5,20,0.6)'; c.lineWidth = 1;
  for (let x = 0; x < len; x += 22) { c.beginPath(); c.moveTo(x + (Math.floor(x / 22) % 2) * 11, 0); c.lineTo(x + (Math.floor(x / 22) % 2) * 11, wall); c.stroke(); }
  c.fillStyle = 'rgba(255,255,255,0.14)'; c.fillRect(0, 0, len, 2);
  for (let x = 6; x < len; x += merW + gap) c.fillRect(x, wall, 2, merH);
  c.restore();
  c.strokeStyle = 'rgba(10,5,20,0.85)'; c.lineWidth = 1.5; c.stroke(p);
  // a thin violet glow along the wall's foot
  c.fillStyle = css(CRYSTAL, 0.5); c.fillRect(0, wall - 2, len, 1);
};

/** A round turret in each corner, a glowing crystal on top. */
function turret(c: CanvasRenderingContext2D, size: number): void {
  const cx = size * 0.42, cy = size * 0.42, R = size * 0.36;
  c.save();
  c.shadowColor = 'rgba(0,0,0,0.6)'; c.shadowBlur = 6; c.shadowOffsetY = 3;
  const g = c.createRadialGradient(cx - R * 0.3, cy - R * 0.3, 2, cx, cy, R);
  g.addColorStop(0, css(shade(SLATE, 0.45))); g.addColorStop(1, css(shade(SLATE, -0.15)));
  c.fillStyle = g; c.beginPath(); c.arc(cx, cy, R, 0, Math.PI * 2); c.fill();
  c.restore();
  // its crenellated rim: notches round the edge
  c.fillStyle = css(shade(SLATE, -0.5));
  for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2; c.beginPath(); c.arc(cx + Math.cos(a) * R * 0.86, cy + Math.sin(a) * R * 0.86, R * 0.13, 0, Math.PI * 2); c.fill(); }
  c.strokeStyle = 'rgba(10,5,20,0.85)'; c.lineWidth = 1.5; c.beginPath(); c.arc(cx, cy, R, 0, Math.PI * 2); c.stroke();
  gem(c, cx, cy, R * 0.5, CRYSTAL, true);
}

export const KEEP_BORDER: BorderStyle = { thick: 26, inset: 0, edge: battlement, corner: { size: 64, draw: turret, inset: 0 } };

// ------------------------------------------------------------------ the emblem

/** A crystal tower: a stone keep tower with battlements, a huge glowing crystal over it, rays. */
export function towerEmblem(c: CanvasRenderingContext2D, size: number): void {
  const u = size / 100;
  c.save();
  c.translate(size / 2, size / 2);
  const glow = c.createRadialGradient(0, -22 * u, 4 * u, 0, -22 * u, 50 * u);
  glow.addColorStop(0, 'rgba(210,150,255,0.7)'); glow.addColorStop(1, 'rgba(160,90,255,0)');
  c.fillStyle = glow; c.fillRect(-50 * u, -50 * u, 100 * u, 100 * u);
  // the rays from the crystal
  c.save();
  c.globalAlpha = 0.5;
  for (let i = 0; i < 14; i++) {
    const a = (i / 14) * Math.PI * 2;
    c.fillStyle = i % 2 ? 'rgba(255,230,255,0.5)' : 'rgba(200,140,255,0.45)';
    c.beginPath(); c.moveTo(0, -24 * u); c.lineTo(Math.cos(a - 0.08) * 48 * u, -24 * u + Math.sin(a - 0.08) * 48 * u); c.lineTo(Math.cos(a + 0.08) * 48 * u, -24 * u + Math.sin(a + 0.08) * 48 * u); c.closePath(); c.fill();
  }
  c.restore();
  // the tower: a tapering stone shaft with a battlemented top, a door and a window
  const r = rng(7);
  const shaft = new Path2D();
  shaft.moveTo(-15 * u, -4 * u); shaft.lineTo(15 * u, -4 * u); shaft.lineTo(19 * u, 46 * u); shaft.lineTo(-19 * u, 46 * u); shaft.closePath();
  const sg = c.createLinearGradient(-19 * u, 0, 19 * u, 0);
  sg.addColorStop(0, css(shade(STONE, 0.3))); sg.addColorStop(0.6, css(STONE)); sg.addColorStop(1, css(shade(STONE, -0.5)));
  c.fillStyle = sg; c.fill(shaft);
  c.save(); c.clip(shaft);
  c.strokeStyle = 'rgba(20,10,30,0.45)'; c.lineWidth = 0.9 * u;
  for (let y = 2; y < 46; y += 6) {
    c.beginPath(); c.moveTo(-20 * u, y * u); c.lineTo(20 * u, y * u); c.stroke();
    for (let x = -18 + ((y / 6) % 2) * 5; x < 20; x += 10) { c.beginPath(); c.moveTo(x * u, y * u); c.lineTo(x * u, (y + 6) * u); c.stroke(); }
  }
  for (let i = 0; i < 40; i++) { c.fillStyle = 'rgba(0,0,0,0.12)'; c.fillRect((r() - 0.5) * 38 * u, r() * 50 * u - 4 * u, 1.5 * u, 1.5 * u); }
  c.restore();
  c.lineWidth = 1.5 * u; c.strokeStyle = '#140a24'; c.stroke(shaft);
  // the door and a glowing window
  c.fillStyle = '#1a0e2a';
  c.beginPath(); c.moveTo(-6 * u, 46 * u); c.lineTo(-6 * u, 36 * u); c.arc(0, 36 * u, 6 * u, Math.PI, 0); c.lineTo(6 * u, 46 * u); c.closePath(); c.fill();
  c.fillStyle = '#ffd27a';
  c.beginPath(); c.moveTo(-3 * u, 20 * u); c.lineTo(-3 * u, 14 * u); c.arc(0, 14 * u, 3 * u, Math.PI, 0); c.lineTo(3 * u, 20 * u); c.closePath(); c.fill();
  // the top: a wider ring with merlons
  const top = new Path2D();
  top.rect(-20 * u, -10 * u, 40 * u, 8 * u);
  for (const x of [-20, -10, 0, 10]) top.rect((x + 1.5) * u, -16 * u, 7 * u, 6.5 * u);
  const tg = c.createLinearGradient(0, -16 * u, 0, -2 * u);
  tg.addColorStop(0, css(shade(STONE, 0.35))); tg.addColorStop(1, css(shade(STONE, -0.3)));
  c.fillStyle = tg; c.fill(top);
  c.lineWidth = 1.3 * u; c.strokeStyle = '#140a24'; c.stroke(top);
  // the crystal floating over it
  gem(c, 0, -32 * u, 17 * u, CRYSTAL, true);
  gem(c, -11 * u, -24 * u, 7 * u, 0x8fd8ff, false);
  gem(c, 11 * u, -25 * u, 7.5 * u, 0xff8fd8, false);
  // sparkles
  c.fillStyle = '#ffffff';
  for (const [x, y, s] of [[-30, -38, 2.4], [28, -42, 2], [-24, -14, 1.6], [33, -18, 1.4]]) {
    c.beginPath(); c.moveTo(x * u, (y - s * 2) * u); c.lineTo((x + s * 0.5) * u, y * u); c.lineTo(x * u, (y + s * 2) * u); c.lineTo((x - s * 0.5) * u, y * u); c.closePath(); c.fill();
    c.beginPath(); c.moveTo((x - s * 2) * u, y * u); c.lineTo(x * u, (y + s * 0.5) * u); c.lineTo((x + s * 2) * u, y * u); c.lineTo(x * u, (y - s * 0.5) * u); c.closePath(); c.fill();
  }
  c.restore();
}

// ------------------------------------------------------------------ the theme

export const KEEP_THEME: MenuTheme = {
  font: CINZEL,
  fontScale: 0.92,
  palette: {
    primary: AMETHYST, secondary: STONE, board: SLATE, trim: GOLD,
    label: '#fff6ff', labelStroke: LABEL_STROKE, muted: '#c8bcd8', accent: '#ffd27a',
    heading: '#4a2580', body: INK, icon: 0xfff2ff, shade: 0x0b0a1a,
  },
  logo: {
    fill: ['#ffffff', '#f2dcff', '#c58cff', '#7a3fc0'],
    outline: '#140a24',
    rim: '#ffe6a8',
    depth: '#3a1a6a',
    size: 130,
    // Cinzel's lower case is small capitals, where i and ı look alike: the title is upper-cased
    // for the language (KRİSTAL KALE keeps its dotted İ)
    upper: true,
    emblem: { draw: towerEmblem, size: 260, overlap: 0.24 },
  },
  skin: stoneSkin,
  frame: { border: KEEP_BORDER, notes: vellum, vignette: 0.5, dim: 0.32 },
  overlays: {
    lose: '#8a1c3a',
    win: '#c58cff',
    adColor: EMERALD,
    titles: ['victory', 'keepFallen'],
  },
};
