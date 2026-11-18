// Astro Crew's menu theme (src/core/menu-theme.ts): a cartoon space console. Buttons are glossy
// rounded capsules (orange for PLAY and the main actions, violet for the rest) with a bright rim,
// a candy gloss and two little indicator lights; boards are deep-space glass panels (a violet
// gradient with a faint star dust and a neon cyan rim); the round knobs are porthole buttons. The
// screen sits in a hull frame: a metal strip with a cyan light line and running lights, a ringed
// planet in each corner. The how-to, pause and result cards are starry glass; behind the logo a
// ringed orange planet with a little rocket orbiting it. Display face: Righteous (SIL OFL,
// latin + latin-ext: Turkish). The menu itself is the core's: PLAY, Easy / Normal and the how-to;
// the crew is picked after PLAY, on its own screen (one place per choice).
import { shadeColor, type MenuTheme, type SkinPainter, type BorderStyle } from '@core';
import { RIGHTEOUS } from '@core/fonts/righteous';
import { prebakeScreens, SCREEN_CARDS } from './screens';

export const INK = '#170c3a';
export const ORANGE = 0xff8a2a;
export const VIOLET = 0x6a4ad8;
export const NAVY = 0x1a1442;
export const CYAN = 0x5ae8ff;
export const GOLD = 0xffd84a;
export const GREEN = 0x2ec27a;
export const RED = 0xe8483a;

export const css = (c: number, a = 1): string => `rgba(${(c >> 16) & 255},${(c >> 8) & 255},${c & 255},${a})`;
function rng(seed: number): () => number {
  let s = (seed >>> 0) % 2147483647 || 1;
  return () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
}

function capsule(x: number, y: number, w: number, h: number, r: number): Path2D {
  const p = new Path2D();
  p.roundRect(x, y, w, h, Math.min(r, h / 2, w / 2));
  return p;
}

/** Star dust: tiny dots and a few four-point sparkles. */
export function starDust(c: CanvasRenderingContext2D, w: number, h: number, seed: number, density = 1): void {
  const r = rng(seed);
  for (let i = 0; i < (w * h) / 900 * density; i++) {
    const x = r() * w, y = r() * h, a = 0.15 + r() * 0.5;
    c.fillStyle = `rgba(255,255,255,${a})`;
    c.fillRect(x, y, r() < 0.85 ? 1.2 : 2, r() < 0.85 ? 1.2 : 2);
  }
  for (let i = 0; i < (w * h) / 26000 * density; i++) sparkle(c, r() * w, r() * h, 3 + r() * 4, 0.5 + r() * 0.4);
}

export function sparkle(c: CanvasRenderingContext2D, x: number, y: number, s: number, a = 1): void {
  c.save();
  c.fillStyle = `rgba(255,255,255,${a})`;
  c.beginPath();
  c.moveTo(x, y - s); c.quadraticCurveTo(x, y, x + s, y); c.quadraticCurveTo(x, y, x, y + s); c.quadraticCurveTo(x, y, x - s, y); c.quadraticCurveTo(x, y, x, y - s);
  c.fill();
  c.restore();
}

// ------------------------------------------------------------------ the skin

export const spacePainter: SkinPainter = (c, kind, w, h, o) => {
  const P = o.palette;
  const down = o.state === 'down', off = o.state === 'off', on = o.state === 'on', over = o.state === 'over';
  const sunk = down || kind === 'track';
  const base = off ? shadeColor(o.color, -0.45) : o.color;
  c.save();
  c.translate(0, down ? 3 : 0);
  if (kind === 'round') {
    // a porthole: metal ring, coloured glass, a highlight
    const R = Math.min(w, h) / 2, cx = w / 2, cy = h / 2;
    c.save(); c.shadowColor = 'rgba(0,0,0,0.55)'; c.shadowBlur = sunk ? 3 : 10; c.shadowOffsetY = sunk ? 1 : 5;
    c.fillStyle = '#0a0620'; c.beginPath(); c.arc(cx, cy, R, 0, Math.PI * 2); c.fill(); c.restore();
    const ring = c.createLinearGradient(0, cy - R, 0, cy + R);
    ring.addColorStop(0, '#f4f2ff'); ring.addColorStop(1, '#7a76a0');
    c.fillStyle = ring; c.beginPath(); c.arc(cx, cy, R - 1.5, 0, Math.PI * 2); c.fill();
    const g = c.createRadialGradient(cx - R * 0.3, cy - R * 0.35, R * 0.1, cx, cy, R * 0.82);
    g.addColorStop(0, css(shadeColor(base, 0.45))); g.addColorStop(0.7, css(base)); g.addColorStop(1, css(shadeColor(base, -0.5)));
    c.fillStyle = g; c.beginPath(); c.arc(cx, cy, R * 0.8, 0, Math.PI * 2); c.fill();
    c.fillStyle = 'rgba(255,255,255,0.35)'; c.beginPath(); c.ellipse(cx - R * 0.22, cy - R * 0.36, R * 0.38, R * 0.18, -0.5, 0, Math.PI * 2); c.fill();
    if (over || on) { c.strokeStyle = css(CYAN); c.lineWidth = 3; c.shadowColor = css(CYAN); c.shadowBlur = 12; c.beginPath(); c.arc(cx, cy, R - 1, 0, Math.PI * 2); c.stroke(); }
    c.restore();
    return;
  }
  const rad = kind === 'board' ? 22 : kind === 'track' ? h / 2 : Math.min(h / 2, 26);
  const shape = capsule(0, 0, w, h, rad);
  // the glow of a hovered or selected piece
  if (over || on) {
    c.save(); c.shadowColor = css(CYAN, over ? 1 : 0.85); c.shadowBlur = over ? 18 : 12;
    c.fillStyle = css(CYAN); c.fill(shape); c.restore();
  }
  c.save(); c.shadowColor = 'rgba(4,2,16,0.7)'; c.shadowBlur = sunk ? 3 : 12; c.shadowOffsetY = sunk ? 1 : 6;
  c.fillStyle = '#0a0620'; c.fill(shape); c.restore();
  c.save();
  c.clip(shape);
  if (kind === 'board' || kind === 'track') {
    // deep-space glass
    const g = c.createLinearGradient(0, 0, w * 0.3, h);
    g.addColorStop(0, css(shadeColor(base, kind === 'track' ? -0.3 : 0.12)));
    g.addColorStop(1, css(shadeColor(base, -0.45)));
    c.fillStyle = g; c.fillRect(0, 0, w, h);
    if (kind === 'board') {
      const neb = c.createRadialGradient(w * 0.78, h * 0.2, 4, w * 0.78, h * 0.2, Math.max(w, h) * 0.6);
      neb.addColorStop(0, 'rgba(200,90,255,0.22)'); neb.addColorStop(1, 'rgba(200,90,255,0)');
      c.fillStyle = neb; c.fillRect(0, 0, w, h);
      starDust(c, w, h, o.seed, 0.8);
    } else {
      const ins = c.createLinearGradient(0, 0, 0, h);
      ins.addColorStop(0, 'rgba(0,0,0,0.5)'); ins.addColorStop(0.45, 'rgba(0,0,0,0)');
      c.fillStyle = ins; c.fillRect(0, 0, w, h);
    }
  } else {
    // a candy capsule: bright top, deep bottom, a gloss band
    const g = c.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, css(shadeColor(base, sunk ? 0.05 : 0.32)));
    g.addColorStop(0.55, css(base));
    g.addColorStop(1, css(shadeColor(base, -0.45)));
    c.fillStyle = g; c.fillRect(0, 0, w, h);
    if (!sunk) {
      const gl = c.createLinearGradient(0, 0, 0, h * 0.48);
      gl.addColorStop(0, 'rgba(255,255,255,0.5)'); gl.addColorStop(1, 'rgba(255,255,255,0.04)');
      c.fillStyle = gl;
      c.beginPath(); c.roundRect(Math.min(14, w * 0.08), 4, w - Math.min(28, w * 0.16), h * 0.42, Math.max(2, rad - 6)); c.fill();
    } else {
      c.fillStyle = 'rgba(0,0,0,0.18)'; c.fillRect(0, 0, w, h);
    }
  }
  c.restore();
  // the rim: dark outline, a light inner line (cyan on boards)
  c.lineWidth = kind === 'board' ? 3 : 2.5;
  c.strokeStyle = INK;
  c.stroke(shape);
  c.save();
  const ins = kind === 'board' ? 7 : 3.5;
  c.lineWidth = kind === 'board' ? 2.5 : 1.5;
  c.strokeStyle = kind === 'board' ? css(CYAN, off ? 0.3 : 0.75) : kind === 'track' ? css(CYAN, 0.35) : 'rgba(255,255,255,0.45)';
  c.beginPath(); c.roundRect(ins, ins, w - ins * 2, h - ins * 2, Math.max(2, rad - ins)); c.stroke();
  c.restore();
  if (kind === 'board') {
    // corner lights
    for (const [x, y] of [[20, 20], [w - 20, 20], [20, h - 20], [w - 20, h - 20]]) {
      c.save(); c.shadowColor = css(CYAN); c.shadowBlur = 8; c.fillStyle = css(CYAN, 0.9); c.beginPath(); c.arc(x, y, 3, 0, Math.PI * 2); c.fill(); c.restore();
    }
  } else if (kind === 'button' && w >= 180) {
    // two little indicator lights at the ends
    for (const x of [16, w - 16]) {
      c.save(); c.shadowColor = off ? 'transparent' : css(GOLD); c.shadowBlur = 6;
      c.fillStyle = off ? 'rgba(80,70,90,0.8)' : css(o.color === P.primary ? 0xfff2a0 : GOLD);
      c.beginPath(); c.arc(x, h / 2, 3.5, 0, Math.PI * 2); c.fill(); c.restore();
    }
  }
  if (over || on) { c.save(); c.shadowColor = css(CYAN); c.shadowBlur = 8; c.lineWidth = over ? 3 : 2.5; c.strokeStyle = '#bff6ff'; c.stroke(shape); c.restore(); }
  c.restore();
};

// ------------------------------------------------------------------ the hull frame

/** A metal strip with a cyan light line and running lights. */
const hullEdge: BorderStyle['edge'] = (c, len, thick) => {
  const d = thick * 0.6, y0 = (thick - d) / 2 - 2;
  c.fillStyle = 'rgba(0,0,0,0.45)';
  c.fillRect(0, y0 + 3, len, d);
  const g = c.createLinearGradient(0, y0, 0, y0 + d);
  g.addColorStop(0, '#d8d4f0'); g.addColorStop(0.45, '#8a84b0'); g.addColorStop(1, '#3a345a');
  c.fillStyle = g;
  c.fillRect(0, y0, len, d);
  c.fillStyle = css(CYAN, 0.9);
  c.fillRect(0, y0 + d * 0.45, len, 2);
  c.fillStyle = css(CYAN, 0.25);
  c.fillRect(0, y0 + d * 0.45 - 2, len, 6);
  for (let x = 40; x < len - 20; x += 80) {
    c.save(); c.shadowColor = css(GOLD); c.shadowBlur = 6; c.fillStyle = css(GOLD);
    c.beginPath(); c.arc(x, y0 + d * 0.2, 2, 0, Math.PI * 2); c.fill(); c.restore();
  }
};

/** A small ringed planet with a moon, for the frame's corners. */
function ringedPlanet(c: CanvasRenderingContext2D, x: number, y: number, r: number, body: number, ringCol: number): void {
  c.save();
  c.translate(x, y);
  c.rotate(-0.35);
  c.strokeStyle = css(ringCol); c.lineWidth = Math.max(2, r * 0.18);
  c.beginPath(); c.ellipse(0, 0, r * 1.75, r * 0.5, 0, Math.PI, Math.PI * 2); c.stroke();
  const g = c.createRadialGradient(-r * 0.35, -r * 0.4, r * 0.1, 0, 0, r);
  g.addColorStop(0, css(shadeColor(body, 0.45))); g.addColorStop(0.7, css(body)); g.addColorStop(1, css(shadeColor(body, -0.45)));
  c.fillStyle = g; c.beginPath(); c.arc(0, 0, r, 0, Math.PI * 2); c.fill();
  c.save(); c.beginPath(); c.arc(0, 0, r, 0, Math.PI * 2); c.clip();
  c.strokeStyle = css(shadeColor(body, -0.25), 0.7); c.lineWidth = r * 0.16;
  for (const k of [-0.35, 0.15]) { c.beginPath(); c.moveTo(-r, r * k); c.quadraticCurveTo(0, r * (k + 0.15), r, r * k); c.stroke(); }
  c.restore();
  c.strokeStyle = INK; c.lineWidth = Math.max(1.5, r * 0.08); c.beginPath(); c.arc(0, 0, r, 0, Math.PI * 2); c.stroke();
  c.strokeStyle = css(ringCol); c.lineWidth = Math.max(2, r * 0.18);
  c.beginPath(); c.ellipse(0, 0, r * 1.75, r * 0.5, 0, 0, Math.PI); c.stroke();
  c.restore();
}

function hullCorner(c: CanvasRenderingContext2D, s: number): void {
  const k = s * 0.3;
  c.save();
  c.shadowColor = 'rgba(0,0,0,0.5)'; c.shadowBlur = 6; c.shadowOffsetY = 3;
  const g = c.createLinearGradient(0, 0, k * 1.6, k * 1.6);
  g.addColorStop(0, '#e8e4ff'); g.addColorStop(1, '#5a547a');
  c.fillStyle = g;
  c.beginPath(); c.roundRect(k - 22, k - 22, 44, 44, 12); c.fill();
  c.restore();
  c.strokeStyle = INK; c.lineWidth = 2; c.beginPath(); c.roundRect(k - 22, k - 22, 44, 44, 12); c.stroke();
  ringedPlanet(c, k, k, 12, ORANGE, CYAN);
  sparkle(c, k + 34, k - 12, 6);
  sparkle(c, k - 10, k + 36, 5, 0.8);
}

export const HULL_BORDER: BorderStyle = { thick: 24, inset: 2, edge: hullEdge, corner: { size: 92, draw: hullCorner, inset: 0 } };

// ------------------------------------------------------------------ the starry glass card

/** The cards behind the how-to, the pause and the result: starry violet glass with a cyan rim. */
export function paintGlass(c: CanvasRenderingContext2D, w: number, h: number): void {
  c.save();
  c.shadowColor = 'rgba(4,2,16,0.6)'; c.shadowBlur = 14; c.shadowOffsetY = 6;
  c.fillStyle = '#120c34';
  c.beginPath(); c.roundRect(0, 0, w, h, 20); c.fill();
  c.restore();
  c.save();
  c.beginPath(); c.roundRect(0, 0, w, h, 20); c.clip();
  const g = c.createLinearGradient(0, 0, w * 0.2, h);
  g.addColorStop(0, '#2c2270'); g.addColorStop(1, '#120c34');
  c.fillStyle = g; c.fillRect(0, 0, w, h);
  const neb = c.createRadialGradient(w * 0.85, h * 0.15, 4, w * 0.85, h * 0.15, Math.max(w, h) * 0.7);
  neb.addColorStop(0, 'rgba(255,120,220,0.18)'); neb.addColorStop(1, 'rgba(255,120,220,0)');
  c.fillStyle = neb; c.fillRect(0, 0, w, h);
  starDust(c, w, h, w * 13 + h, 0.7);
  const gl = c.createLinearGradient(0, 0, 0, Math.min(60, h * 0.3));
  gl.addColorStop(0, 'rgba(255,255,255,0.12)'); gl.addColorStop(1, 'rgba(255,255,255,0)');
  c.fillStyle = gl; c.fillRect(0, 0, w, Math.min(60, h * 0.3));
  c.restore();
  c.lineWidth = 3; c.strokeStyle = INK; c.beginPath(); c.roundRect(1.5, 1.5, w - 3, h - 3, 19); c.stroke();
  c.lineWidth = 2; c.strokeStyle = css(CYAN, 0.7); c.beginPath(); c.roundRect(7, 7, w - 14, h - 14, 14); c.stroke();
}

// ------------------------------------------------------------------ the emblem

/** A ringed orange planet with a little rocket orbiting it, sparkles round it. */
export function astroEmblem(c: CanvasRenderingContext2D, size: number): void {
  const u = size / 100;
  c.save();
  c.translate(size / 2, size / 2);
  const halo = c.createRadialGradient(0, 0, 8 * u, 0, 0, 50 * u);
  halo.addColorStop(0, 'rgba(255,170,90,0.5)'); halo.addColorStop(1, 'rgba(160,90,255,0)');
  c.fillStyle = halo; c.fillRect(-50 * u, -50 * u, 100 * u, 100 * u);
  // the orbit and the rocket behind
  c.strokeStyle = 'rgba(255,255,255,0.35)'; c.lineWidth = 1.2 * u; c.setLineDash([3 * u, 3 * u]);
  c.beginPath(); c.ellipse(0, 0, 44 * u, 18 * u, -0.35, 0, Math.PI * 2); c.stroke();
  c.setLineDash([]);
  ringedPlanet(c, 0, 2 * u, 26 * u, ORANGE, 0xc58aff);
  // the rocket at the front of the orbit
  c.save();
  c.translate(30 * u, 14 * u);
  c.rotate(-0.9);
  c.fillStyle = '#f4f2ff'; c.strokeStyle = INK; c.lineWidth = 1.4 * u;
  c.beginPath(); c.moveTo(0, -12 * u); c.quadraticCurveTo(6 * u, -4 * u, 5 * u, 7 * u); c.lineTo(-5 * u, 7 * u); c.quadraticCurveTo(-6 * u, -4 * u, 0, -12 * u); c.fill(); c.stroke();
  c.fillStyle = css(CYAN); c.beginPath(); c.arc(0, -2 * u, 2.4 * u, 0, Math.PI * 2); c.fill(); c.stroke();
  c.fillStyle = css(RED);
  c.beginPath(); c.moveTo(-5 * u, 3 * u); c.lineTo(-9 * u, 9 * u); c.lineTo(-4 * u, 7 * u); c.closePath(); c.fill(); c.stroke();
  c.beginPath(); c.moveTo(5 * u, 3 * u); c.lineTo(9 * u, 9 * u); c.lineTo(4 * u, 7 * u); c.closePath(); c.fill(); c.stroke();
  const fl = c.createLinearGradient(0, 7 * u, 0, 18 * u);
  fl.addColorStop(0, '#fff2a0'); fl.addColorStop(1, 'rgba(255,120,40,0)');
  c.fillStyle = fl; c.beginPath(); c.moveTo(-3 * u, 7 * u); c.lineTo(0, 18 * u); c.lineTo(3 * u, 7 * u); c.closePath(); c.fill();
  c.restore();
  sparkle(c, -36 * u, -26 * u, 6 * u);
  sparkle(c, 38 * u, -30 * u, 4.5 * u, 0.9);
  sparkle(c, -30 * u, 30 * u, 4 * u, 0.8);
  c.restore();
}

// ------------------------------------------------------------------ the theme

export const ASTRO_THEME: MenuTheme = {
  font: RIGHTEOUS,
  palette: {
    primary: ORANGE, secondary: VIOLET, board: NAVY, trim: CYAN,
    label: '#ffffff', labelStroke: INK, muted: '#b8b0e8', accent: '#ffd84a',
    heading: '#7aeaff', body: '#ece8ff', icon: 0xffffff, shade: 0x05040e,
  },
  logo: {
    fill: ['#fffbe8', '#ffe27a', '#ffa83a', '#ff6a2a'],
    outline: INK,
    rim: '#7aeaff',
    depth: '#3a1a7a',
    size: 150,
    emblem: { draw: astroEmblem, size: 240, overlap: 0.3 },
  },
  skin: spacePainter,
  frame: { border: HULL_BORDER, notes: paintGlass, vignette: 0.55, dim: 0.2 },
  overlays: { lose: '#ff8a7a', win: '#ffd84a', adColor: GREEN, titles: ['loseHero', 'loseDome', 'galaxySaved'] },
  cards: SCREEN_CARDS,
  prebake: (scene) => prebakeScreens(scene),
};
