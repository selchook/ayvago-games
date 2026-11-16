// Sky Road's menu theme (src/core/menu-theme.ts): Racing Sans One, a sunny sky over a road in the
// clouds. The buttons are glossy road signs (a green motorway sign for PLAY, blue signs for the
// rest) with a white reflective rim and bolts, the switches sit in a strip of asphalt with its
// edge lines, puffs of cloud frame the screen, the how-to is written on a cloud, and a winged car
// on a floating piece of road flies behind the logo. Every piece is painted once on a canvas (the
// core caches it under the Ayvago intro); nothing here runs in play.
import { shadeColor, STEERING_PIECES, type MenuTheme, type SkinPainter, type BorderStyle } from '@core';
import { RACING_SANS_ONE } from '@core/fonts/racing-sans-one';

const GREEN = 0x168a4a, BLUE = 0x1d63c4, ASPHALT = 0x2e3440, YELLOW = 0xffd23f;
const NAVY = '#0d2a55';

const rgba = (c: number, a = 1): string => `rgba(${(c >> 16) & 255},${(c >> 8) & 255},${c & 255},${a})`;

function rng(seed: number): () => number {
  let s = (seed >>> 0) % 2147483647 || 1;
  return () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
}

function rounded(x: number, y: number, w: number, h: number, r: number): Path2D {
  const p = new Path2D();
  p.roundRect(x, y, w, h, Math.max(0, Math.min(r, w / 2, h / 2)));
  return p;
}

/** A hex bolt head: a silver disc with a shadow and a highlight. */
function bolt(c: CanvasRenderingContext2D, x: number, y: number, r: number): void {
  c.save();
  c.shadowColor = 'rgba(0,0,0,0.45)'; c.shadowBlur = 2; c.shadowOffsetY = 1;
  const g = c.createRadialGradient(x - r * 0.35, y - r * 0.35, 0, x, y, r);
  g.addColorStop(0, '#ffffff'); g.addColorStop(0.5, '#c9d2dc'); g.addColorStop(1, '#6d7682');
  c.fillStyle = g;
  c.beginPath(); c.arc(x, y, r, 0, Math.PI * 2); c.fill();
  c.restore();
  c.strokeStyle = 'rgba(40,48,60,0.7)'; c.lineWidth = 1;
  c.beginPath(); c.arc(x, y, r, 0, Math.PI * 2); c.stroke();
}

/** Asphalt: a dark face with fine light and dark grit (inside a clip). */
function grit(c: CanvasRenderingContext2D, w: number, h: number, r: () => number): void {
  for (let i = 0; i < Math.min(1600, (w * h) / 30); i++) {
    c.fillStyle = r() < 0.5 ? `rgba(255,255,255,${r() * 0.12})` : `rgba(0,0,0,${r() * 0.25})`;
    c.fillRect(r() * w, r() * h, 1 + r() * 1.4, 1 + r() * 1.2);
  }
}

/**
 * The road-sign skin: a sign face in the piece's colour with a white reflective rim round it and
 * a dark edge, a gloss band over the top half, bolts on the big signs. Hover glows yellow like a
 * lane marking, a press sinks it, the chosen switch segment wears a yellow rim, a disabled sign is
 * faded grey. The switch's track is a strip of asphalt with white edge lines.
 */
const signPainter: SkinPainter = (c, kind, w, h, o) => {
  const P = o.palette, r = rng(o.seed);
  const down = o.state === 'down', off = o.state === 'off', over = o.state === 'over', on = o.state === 'on';
  const round = kind === 'round';
  const rad = round ? Math.min(w, h) / 2 : Math.min(16, h * 0.24);
  const shape = (inset: number): Path2D => {
    if (!round) return rounded(inset, inset, w - inset * 2, h - inset * 2, rad - inset * 0.6);
    const p = new Path2D(); p.arc(w / 2, h / 2, Math.min(w, h) / 2 - inset, 0, Math.PI * 2); return p;
  };
  const outer = shape(0);
  c.save();
  c.translate(0, down ? 3 : 0);
  // the drop shadow (a yellow glow on hover)
  c.save();
  c.shadowColor = over ? rgba(P.trim, 0.95) : 'rgba(5,20,45,0.55)';
  c.shadowBlur = down ? 3 : over ? 16 : 10;
  c.shadowOffsetY = down ? 1 : over ? 3 : 6;
  c.fillStyle = '#000'; c.fill(outer);
  c.restore();
  if (kind === 'track') {
    c.fillStyle = rgba(ASPHALT); c.fill(outer);
    c.save(); c.clip(outer);
    grit(c, w, h, r);
    c.fillStyle = 'rgba(255,255,255,0.85)';
    c.fillRect(0, 5, w, 3); c.fillRect(0, h - 8, w, 3);
    const sh = c.createLinearGradient(0, 0, 0, h);
    sh.addColorStop(0, 'rgba(0,0,0,0.45)'); sh.addColorStop(0.25, 'rgba(0,0,0,0)'); sh.addColorStop(1, 'rgba(0,0,0,0.25)');
    c.fillStyle = sh; c.fillRect(0, 0, w, h);
    c.restore();
    c.lineWidth = 2.5; c.strokeStyle = 'rgba(10,14,22,0.95)'; c.stroke(outer);
    c.restore();
    return;
  }
  const col = off ? 0x7d8794 : o.color;
  const asphalt = col === ASPHALT;
  // the sign's dark edge, then the white reflective rim, then the face
  c.fillStyle = rgba(shadeColor(col, -0.6)); c.fill(outer);
  const rimW = Math.max(3, Math.min(6, Math.min(w, h) * 0.065));
  const rim = shape(2);
  c.fillStyle = asphalt ? '#cfd6df' : off ? '#c9ced6' : '#f6f9ff'; c.fill(rim);
  const face = shape(2 + rimW);
  const body = c.createLinearGradient(0, 0, 0, h);
  body.addColorStop(0, rgba(shadeColor(col, down ? 0.05 : 0.28)));
  body.addColorStop(0.55, rgba(col));
  body.addColorStop(1, rgba(shadeColor(col, -0.25)));
  c.fillStyle = body; c.fill(face);
  c.save();
  c.clip(face);
  if (asphalt || kind === 'board') grit(c, w, h, r);
  else {
    // the reflective sheeting's fine bead pattern
    c.fillStyle = 'rgba(255,255,255,0.05)';
    for (let y = 2; y < h; y += 4) for (let x = (y / 4) % 2 ? 2 : 0; x < w; x += 4) c.fillRect(x, y, 1, 1);
  }
  if (!down && !off) {
    // the gloss: a soft white band over the top half
    const gl = c.createLinearGradient(0, 0, 0, h * 0.55);
    gl.addColorStop(0, 'rgba(255,255,255,0.42)'); gl.addColorStop(1, 'rgba(255,255,255,0)');
    c.fillStyle = gl;
    c.beginPath(); c.ellipse(w / 2, -h * 0.05, w * 0.62, h * 0.5, 0, 0, Math.PI * 2); c.fill();
  } else {
    const top = c.createLinearGradient(0, 0, 0, 14);
    top.addColorStop(0, 'rgba(0,0,0,0.4)'); top.addColorStop(1, 'rgba(0,0,0,0)');
    c.fillStyle = top; c.fillRect(0, 0, w, 14);
  }
  c.restore();
  // bolts: two on a big sign, four in the corners of a board
  if (!round) {
    const br = Math.max(3, Math.min(5, h * 0.05));
    if (kind === 'button' && w >= 200) for (const x of [rimW + 13, w - rimW - 13]) bolt(c, x, h / 2, br);
    else if (kind === 'board' && w >= 120 && h >= 80) {
      for (const [x, y] of [[rimW + 14, rimW + 14], [w - rimW - 14, rimW + 14], [rimW + 14, h - rimW - 14], [w - rimW - 14, h - rimW - 14]]) bolt(c, x, y, br);
    }
  }
  if (on || over) {
    c.save();
    c.shadowColor = rgba(P.trim, 0.95); c.shadowBlur = over ? 12 : 7;
    c.lineWidth = over ? 4 : 3.5; c.strokeStyle = rgba(P.trim); c.stroke(shape(1.5));
    c.restore();
  }
  if (down) { c.fillStyle = 'rgba(0,0,0,0.14)'; c.fill(outer); }
  c.restore();
};

/** A puff of cloud: overlapping discs, white on top, a little blue in the shade below. */
function cloud(c: CanvasRenderingContext2D, puffs: Array<[number, number, number]>, alpha = 1): void {
  c.save();
  c.globalAlpha = alpha;
  c.shadowColor = 'rgba(30,80,150,0.35)'; c.shadowBlur = 8; c.shadowOffsetY = 3;
  c.fillStyle = '#dcecff';
  c.beginPath();
  for (const [x, y, rr] of puffs) { c.moveTo(x + rr, y); c.arc(x, y, rr, 0, Math.PI * 2); }
  c.fill();
  c.shadowColor = 'transparent';
  // the sunlit tops: the same discs a little higher, in white
  c.fillStyle = '#ffffff';
  c.beginPath();
  for (const [x, y, rr] of puffs) { c.moveTo(x + rr * 0.9, y - rr * 0.12); c.arc(x, y - rr * 0.12, rr * 0.9, 0, Math.PI * 2); }
  c.fill();
  c.restore();
}

/** The cloud behind the how-to and on the pause and result screens: a white card with a puffy top. */
function cloudCard(c: CanvasRenderingContext2D, w: number, h: number): void {
  const r = rng(Math.round(w * 7 + h));
  const shape = rounded(0, 0, w, h, 34);
  c.save();
  c.shadowColor = 'rgba(10,40,90,0.45)'; c.shadowBlur = 16; c.shadowOffsetY = 8;
  c.fillStyle = '#f4f9ff'; c.fill(shape);
  // puffs along the top edge, smaller ones down the sides
  c.beginPath();
  for (let x = 30; x < w - 20; x += 34 + r() * 22) { const rr = 18 + r() * 14; c.moveTo(x + rr, 6); c.arc(x, 6, rr, 0, Math.PI * 2); }
  c.fill();
  c.restore();
  const g = c.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, '#ffffff'); g.addColorStop(0.7, '#eef6ff'); g.addColorStop(1, '#d9eafc');
  c.fillStyle = g; c.fill(shape);
  // a thin sky-blue line inside, like the edge of a sign
  c.lineWidth = 3; c.strokeStyle = 'rgba(29,99,196,0.35)';
  c.stroke(rounded(10, 10, w - 20, h - 20, 26));
}

/** Puffs of cloud round the screen edge, a bigger cloud in each corner. */
const CLOUD_BORDER: BorderStyle = {
  thick: 36,
  inset: 0,
  edge: (c, len, thick) => {
    const r = rng(len);
    const puffs: Array<[number, number, number]> = [];
    // a solid bank along the outer side, irregular billows bulging inwards from it
    for (let x = -10; x < len + 14; x += 7 + r() * 9) puffs.push([x, -3 + r() * 3, 7 + r() * 6]);
    for (let x = -10; x < len + 20; x += 34 + r() * 46) {
      const big = 12 + r() * 9;
      puffs.push([x, thick * 0.12 + big * 0.55, big]);
      puffs.push([x + big * (0.8 + r() * 0.4), thick * 0.1 + big * 0.35, big * (0.55 + r() * 0.2)]);
    }
    cloud(c, puffs, 0.95);
  },
  corner: {
    size: 120,
    inset: 0,
    draw: (c, s) => cloud(c, [[s * 0.2, s * 0.16, s * 0.22], [s * 0.46, s * 0.12, s * 0.17], [s * 0.14, s * 0.44, s * 0.16], [s * 0.38, s * 0.32, s * 0.14], [s * 0.68, s * 0.1, s * 0.11], [s * 0.1, s * 0.68, s * 0.1]], 0.97),
  },
};

/** A wing: a fan of five long feathers from (0, 0), pointing up and back (towards -x). */
function wing(c: CanvasRenderingContext2D, u: number, spread = 1): void {
  for (let i = 4; i >= 0; i--) {
    const a = -Math.PI * (0.62 + i * 0.075 * spread), len = (40 - i * 4.5) * u, wd = (7 - i * 0.5) * u;
    c.save();
    c.rotate(a);
    const p = new Path2D();
    p.moveTo(0, -wd * 0.4);
    p.quadraticCurveTo(len * 0.55, -wd, len, 0);
    p.quadraticCurveTo(len * 0.55, wd, 0, wd * 0.4);
    p.closePath();
    const g = c.createLinearGradient(0, -wd, 0, wd);
    g.addColorStop(0, '#ffffff'); g.addColorStop(1, '#c4dcf5');
    c.fillStyle = g; c.fill(p);
    c.strokeStyle = NAVY; c.lineWidth = 1.8 * u; c.stroke(p);
    c.restore();
  }
}

/** The emblem behind the logo: a winged red racing car on a floating piece of road above a cloud. */
export function skyEmblem(c: CanvasRenderingContext2D, size: number): void {
  const u = size / 100;
  c.save();
  c.translate(size / 2, size / 2);
  c.lineJoin = 'round'; c.lineCap = 'round';
  // the sun's glow
  const halo = c.createRadialGradient(0, -4 * u, 4 * u, 0, -4 * u, 50 * u);
  halo.addColorStop(0, 'rgba(255,236,150,0.6)'); halo.addColorStop(1, 'rgba(255,236,150,0)');
  c.fillStyle = halo; c.fillRect(-50 * u, -50 * u, 100 * u, 100 * u);
  // the cloud the road floats over
  cloud(c, [[-26 * u, 36 * u, 10 * u], [-12 * u, 33 * u, 13 * u], [6 * u, 35 * u, 12 * u], [22 * u, 37 * u, 9 * u]]);
  // the floating road: rock underneath, the asphalt's edge, its top with the lane marks
  c.fillStyle = '#8a5a35';
  c.beginPath(); c.moveTo(-42 * u, 18 * u); c.lineTo(42 * u, 18 * u); c.lineTo(22 * u, 28 * u); c.lineTo(4 * u, 40 * u); c.lineTo(-14 * u, 30 * u); c.lineTo(-30 * u, 26 * u); c.closePath(); c.fill();
  c.strokeStyle = NAVY; c.lineWidth = 2 * u; c.stroke();
  c.fillStyle = '#5ab84a';
  c.fillRect(-42 * u, 16 * u, 84 * u, 3 * u);
  c.fillStyle = '#2b313b';
  c.beginPath(); c.moveTo(-46 * u, 9 * u); c.lineTo(46 * u, 9 * u); c.lineTo(42 * u, 17 * u); c.lineTo(-42 * u, 17 * u); c.closePath(); c.fill();
  c.stroke();
  c.fillStyle = '#ffffff';
  for (let x = -38; x < 40; x += 16) c.fillRect(x * u, 12.2 * u, 8 * u, 1.8 * u);
  // speed lines behind the car
  c.strokeStyle = '#ffffff';
  for (const [y, x0, x1, wd] of [[-12, -48, -34, 3], [-2, -50, -36, 3.4], [6, -46, -38, 2.4]]) {
    c.lineWidth = wd * u; c.beginPath(); c.moveTo(x0 * u, y * u); c.lineTo(x1 * u, y * u); c.stroke();
  }
  c.save();
  c.translate(2 * u, 0);
  // the wings, behind the car body
  c.save(); c.translate(-4 * u, -12 * u); wing(c, u * 0.82, 0.8); c.restore();
  // the car body, facing right (the near wing goes on top of it)
  const body = new Path2D();
  body.moveTo(-30 * u, 4 * u);
  body.lineTo(-30 * u, -4 * u);
  body.quadraticCurveTo(-29 * u, -9 * u, -20 * u, -9 * u);
  body.lineTo(-11 * u, -10 * u);
  body.quadraticCurveTo(-5 * u, -19 * u, 6 * u, -18 * u);
  body.quadraticCurveTo(12 * u, -17 * u, 16 * u, -9 * u);
  body.lineTo(27 * u, -6 * u);
  body.quadraticCurveTo(33 * u, -4 * u, 31 * u, 4 * u);
  body.closePath();
  const bg = c.createLinearGradient(0, -18 * u, 0, 4 * u);
  bg.addColorStop(0, '#ff7a5a'); bg.addColorStop(0.5, '#e8302a'); bg.addColorStop(1, '#9a1414');
  c.fillStyle = bg; c.fill(body);
  c.strokeStyle = NAVY; c.lineWidth = 2.4 * u; c.stroke(body);
  // the windows
  const win = new Path2D();
  win.moveTo(-8 * u, -10 * u); win.quadraticCurveTo(-3 * u, -16.5 * u, 5 * u, -16 * u); win.quadraticCurveTo(10 * u, -15 * u, 12.5 * u, -10 * u); win.closePath();
  c.fillStyle = '#bfe6ff'; c.fill(win); c.lineWidth = 1.6 * u; c.stroke(win);
  c.fillStyle = 'rgba(255,255,255,0.7)'; c.fillRect(-4 * u, -14 * u, 3 * u, 3 * u);
  // a white racing stripe and the headlight
  c.fillStyle = '#ffffff'; c.fillRect(-28 * u, -3.5 * u, 56 * u, 2.4 * u);
  c.fillStyle = '#fff3a0'; c.beginPath(); c.arc(28.5 * u, -2.5 * u, 2 * u, 0, Math.PI * 2); c.fill();
  c.save(); c.translate(-10 * u, -7 * u); c.rotate(0.12); wing(c, u, 1); c.restore();
  // the wheels
  for (const x of [-18, 18]) {
    c.fillStyle = '#1b1f27'; c.beginPath(); c.arc(x * u, 5 * u, 6.5 * u, 0, Math.PI * 2); c.fill();
    c.strokeStyle = NAVY; c.lineWidth = 1.6 * u; c.stroke();
    c.fillStyle = '#c9d2dc'; c.beginPath(); c.arc(x * u, 5 * u, 2.8 * u, 0, Math.PI * 2); c.fill();
  }
  c.restore();
  c.restore();
}

export const SKY_THEME: MenuTheme = {
  font: RACING_SANS_ONE,
  palette: {
    primary: GREEN, secondary: BLUE, board: ASPHALT, trim: YELLOW,
    label: '#ffffff', labelStroke: NAVY, muted: '#9fb6d6', accent: '#ffd23f',
    heading: '#1d63c4', body: '#14284a', icon: 0xffffff, shade: 0x0b2a5a,
  },
  logo: {
    fill: ['#ffffff', '#fff2a6', '#ffb21a'],
    outline: NAVY,
    outlineWidth: 0.13,
    rim: '#ffffff',
    depth: '#0a2a66',
    size: 120,
    upper: true,
    lineHeight: 0.92,
    emblem: { draw: skyEmblem, size: 220, overlap: 0.4 },
  },
  skin: signPainter,
  // the steering switch (touch screens) in the same skin
  pieces: [...STEERING_PIECES],
  frame: { border: CLOUD_BORDER, notes: cloudCard, vignette: 0.42, dim: 0 },
  overlays: { lose: '#c4321e', win: '#ffd23f' },
};
