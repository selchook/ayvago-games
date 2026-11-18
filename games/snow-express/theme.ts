// Snow Express's menu theme (src/core/menu-theme.ts): Baloo 2 ExtraBold, a cold winter palette with
// the train's red. The buttons are frosted ice plates with snow piled on top and icicles under the
// big ones, a railway with snowy sleepers runs round the screen (snowflake medallions in the
// corners), the how-to is a frosty postcard and a steam locomotive, lamp lit, ploughs out from
// behind the logo. Every piece is painted once on a canvas (the core caches it); nothing here runs
// in play. Also the Journey button in the same skin (menuOption).
import Phaser from 'phaser';
import { t, txt, SkinButton, shadeColor, type MenuTheme, type SkinPainter, type BorderStyle } from '@core';
import { BALOO_2 } from '@core/fonts/baloo-2';
import { loadMeta } from './meta';
import { prebakePlay } from './labels';

/** The level's stars card (PlayScene.finish). */
export const STARS_W = 600, STARS_H = 400;
/** The Journey map's postcards (mapui.ts): a chapter, the Holiday Rush. */
export const MAP_CARD = { w: 660, h: 262 }, RUSH_CARD = { w: 660, h: 160 };
/** The Journey button under the difficulty switch. */
const JOURNEY_W = 400, JOURNEY_H = 96;

export const RED = 0xd8343c, ICE = 0x3f8fd8, NAVY = '#12305e';
const GOLD = 0xffd56a;

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

/**
 * Snow piled along the top edge of a w-wide piece: a soft white drift of overlapping mounds that
 * spills a little over the edge, with a blue shade on its underside.
 */
function snowCap(c: CanvasRenderingContext2D, w: number, depth: number, r: () => number, inset: number): void {
  const p = new Path2D();
  const left = inset, right = w - inset;
  p.moveTo(left, depth * 0.55);
  let x = left;
  while (x < right) {
    const step = Math.min(right - x, depth * (1.3 + r() * 1.4));
    const top = -depth * (0.35 + r() * 0.45);
    p.quadraticCurveTo(x + step / 2, top, x + step, -depth * 0.1 + r() * depth * 0.2);
    x += step;
  }
  p.lineTo(right, depth * 0.55);
  // the drift's lower edge: wavy, hanging over the face here and there
  for (let xx = right; xx > left; xx -= depth * 1.1) {
    p.quadraticCurveTo(xx - depth * 0.55, depth * (0.75 + r() * 0.7), xx - depth * 1.1, depth * (0.5 + r() * 0.15));
  }
  p.closePath();
  c.save();
  c.shadowColor = 'rgba(20,50,100,0.45)'; c.shadowBlur = 4; c.shadowOffsetY = 2;
  const g = c.createLinearGradient(0, -depth, 0, depth * 1.4);
  g.addColorStop(0, '#ffffff'); g.addColorStop(0.7, '#f1f7ff'); g.addColorStop(1, '#c9ddf5');
  c.fillStyle = g; c.fill(p);
  c.restore();
  // a sparkle or two
  c.fillStyle = 'rgba(255,255,255,0.95)';
  for (let i = 0; i < Math.max(2, w / 70); i++) { c.beginPath(); c.arc(left + r() * (right - left), r() * depth * 0.5, 1.2, 0, Math.PI * 2); c.fill(); }
}

/** Icicles hanging from the bottom edge (y = h) between x0 and x1. */
function icicles(c: CanvasRenderingContext2D, x0: number, x1: number, h: number, r: () => number, max: number): void {
  const g = c.createLinearGradient(0, h - 2, 0, h + max);
  g.addColorStop(0, 'rgba(235,248,255,0.95)'); g.addColorStop(1, 'rgba(160,210,255,0.6)');
  c.fillStyle = g;
  let x = x0 + r() * 10;
  while (x < x1) {
    const wdt = 5 + r() * 6, len = max * (0.35 + r() * 0.65);
    c.beginPath(); c.moveTo(x, h - 3); c.lineTo(x + wdt, h - 3); c.lineTo(x + wdt * 0.5, h + len); c.closePath(); c.fill();
    x += wdt + 10 + r() * 26;
  }
}

/** Frost on a face: soft pale clouds and a few fine cracks (inside a clip). */
function frost(c: CanvasRenderingContext2D, w: number, h: number, r: () => number): void {
  for (let i = 0; i < Math.max(4, (w * h) / 2500); i++) {
    const x = r() * w, y = r() * h, rad = 6 + r() * 22;
    const g = c.createRadialGradient(x, y, 0, x, y, rad);
    g.addColorStop(0, 'rgba(255,255,255,0.13)'); g.addColorStop(1, 'rgba(255,255,255,0)');
    c.fillStyle = g; c.fillRect(x - rad, y - rad, rad * 2, rad * 2);
  }
  c.strokeStyle = 'rgba(255,255,255,0.22)'; c.lineWidth = 0.9;
  for (let i = 0; i < Math.max(1, w / 120); i++) {
    let x = r() * w, y = r() * h;
    c.beginPath(); c.moveTo(x, y);
    for (let k = 0; k < 4; k++) { x += (r() - 0.3) * 18; y += (r() - 0.5) * 14; c.lineTo(x, y); }
    c.stroke();
  }
}

/** A six-armed snowflake centred on (x, y). */
function snowflake(c: CanvasRenderingContext2D, x: number, y: number, rad: number, colour: string, width: number): void {
  c.save();
  c.translate(x, y);
  c.strokeStyle = colour; c.lineWidth = width; c.lineCap = 'round';
  for (let i = 0; i < 6; i++) {
    c.rotate(Math.PI / 3);
    c.beginPath(); c.moveTo(0, 0); c.lineTo(0, -rad);
    c.moveTo(0, -rad * 0.55); c.lineTo(-rad * 0.25, -rad * 0.78); c.moveTo(0, -rad * 0.55); c.lineTo(rad * 0.25, -rad * 0.78);
    c.stroke();
  }
  c.restore();
}

/**
 * The ice skin: frosted plates in the piece's colour, snow piled on top, icicles under the big
 * buttons. Hover lights them with a warm lantern glow, a press sinks them, the chosen switch
 * segment wears a gold rim and the other one is dark, thick ice.
 */
const icePainter: SkinPainter = (c, kind, w, h, o) => {
  const P = o.palette, r = rng(o.seed);
  const down = o.state === 'down', off = o.state === 'off', over = o.state === 'over', on = o.state === 'on';
  const sunk = down || off || kind === 'track';
  const round = kind === 'round';
  const rad = round ? Math.min(w, h) / 2 : Math.min(h * 0.3, 24);
  const shape = round ? (() => { const p = new Path2D(); p.arc(w / 2, h / 2, Math.min(w, h) / 2, 0, Math.PI * 2); return p; })() : rounded(0, 0, w, h, rad);
  const col = off ? shadeColor(o.color, -0.45) : o.color;
  c.save();
  c.translate(0, down ? 3 : 0);
  c.save();
  c.shadowColor = over ? rgba(GOLD, 0.9) : 'rgba(5,15,40,0.55)';
  c.shadowBlur = sunk ? 3 : over ? 16 : 10;
  c.shadowOffsetY = sunk ? 1 : over ? 3 : 6;
  c.fillStyle = '#000'; c.fill(shape);
  c.restore();
  if (kind === 'track') {
    const g = c.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, '#0a1a3a'); g.addColorStop(1, rgba(shadeColor(P.board, 0.1)));
    c.fillStyle = g; c.fill(shape);
    c.save(); c.clip(shape); frost(c, w, h, r);
    const top = c.createLinearGradient(0, 0, 0, 16);
    top.addColorStop(0, 'rgba(0,0,0,0.55)'); top.addColorStop(1, 'rgba(0,0,0,0)');
    c.fillStyle = top; c.fillRect(0, 0, w, 16);
    c.restore();
    c.lineWidth = 2.5; c.strokeStyle = 'rgba(200,230,255,0.55)'; c.stroke(shape);
    snowCap(c, w, 9, r, rad * 0.6);
    c.restore();
    return;
  }
  // the ice: bright at the top, deep at the bottom, frosted, with a glassy highlight
  const body = c.createLinearGradient(0, 0, 0, h);
  body.addColorStop(0, rgba(shadeColor(col, sunk ? 0.1 : 0.5)));
  body.addColorStop(0.5, rgba(col));
  body.addColorStop(1, rgba(shadeColor(col, -0.42)));
  c.fillStyle = body; c.fill(shape);
  c.save();
  c.clip(shape);
  frost(c, w, h, r);
  if (kind === 'board') {
    for (let i = 0; i < Math.max(3, (w * h) / 9000); i++) snowflake(c, r() * w, r() * h, 6 + r() * 10, 'rgba(255,255,255,0.12)', 1.6);
  }
  if (!sunk) {
    c.fillStyle = 'rgba(255,255,255,0.2)';
    c.beginPath(); c.moveTo(0, h * 0.62); c.quadraticCurveTo(w * 0.5, h * 0.28, w, h * 0.5); c.lineTo(w, 0); c.lineTo(0, 0); c.closePath(); c.fill();
  } else {
    const top = c.createLinearGradient(0, 0, 0, 14);
    top.addColorStop(0, 'rgba(0,0,0,0.45)'); top.addColorStop(1, 'rgba(0,0,0,0)');
    c.fillStyle = top; c.fillRect(0, 0, w, 14);
  }
  // the bevel: light inner rim on top, dark below
  c.lineWidth = 3;
  c.strokeStyle = 'rgba(255,255,255,0.35)'; c.stroke(rounded(2, 2, w - 4, h - 4, rad - 2));
  c.restore();
  c.lineWidth = 2.5; c.strokeStyle = rgba(shadeColor(col, -0.7)); c.stroke(shape);
  if (on || over) {
    c.save();
    c.shadowColor = rgba(GOLD, 0.95); c.shadowBlur = over ? 12 : 7;
    c.lineWidth = over ? 3.5 : 3; c.strokeStyle = rgba(shadeColor(GOLD, 0.2)); c.stroke(shape);
    c.restore();
  }
  if (round) {
    // a snowflake on the knob
    snowflake(c, w / 2, h / 2, Math.min(w, h) * 0.26, 'rgba(255,255,255,0.7)', 2);
  } else if (!off) {
    snowCap(c, w, Math.max(6, Math.min(13, h * 0.15)), r, Math.min(rad * 0.55, 10));
    if (kind === 'button' && w >= 200 && !down) icicles(c, rad, w - rad, h, r, Math.min(16, h * 0.18));
  }
  if (down) { c.fillStyle = 'rgba(0,0,0,0.15)'; c.fill(shape); }
  c.restore();
};

/** The frosty postcard behind the how-to and the overlays: white-blue card, snowflakes, a candy-stripe edge, snow on top. */
function postcard(c: CanvasRenderingContext2D, w: number, h: number): void {
  const r = rng(Math.round(w * 13 + h));
  const shape = rounded(0, 0, w, h, 22);
  c.save();
  c.shadowColor = 'rgba(5,15,40,0.5)'; c.shadowBlur = 12; c.shadowOffsetY = 6;
  c.fillStyle = '#fff'; c.fill(shape);
  c.restore();
  c.save();
  c.clip(shape);
  // the candy-stripe border
  c.fillStyle = '#ffffff'; c.fillRect(0, 0, w, h);
  c.save();
  c.fillStyle = rgba(RED);
  for (let x = -h; x < w + h; x += 26) {
    c.beginPath(); c.moveTo(x, 0); c.lineTo(x + 13, 0); c.lineTo(x + 13 + h, h); c.lineTo(x + h, h); c.closePath(); c.fill();
  }
  c.restore();
  const inner = rounded(9, 9, w - 18, h - 18, 16);
  const g = c.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, '#f7fbff'); g.addColorStop(1, '#dcebfb');
  c.fillStyle = g; c.fill(inner);
  c.save();
  c.clip(inner);
  for (let i = 0; i < Math.max(6, (w * h) / 7000); i++) snowflake(c, r() * w, r() * h, 7 + r() * 13, 'rgba(90,140,200,0.13)', 1.8);
  c.restore();
  c.lineWidth = 2; c.strokeStyle = 'rgba(30,70,130,0.35)'; c.stroke(inner);
  c.restore();
  c.lineWidth = 2; c.strokeStyle = 'rgba(80,20,30,0.6)'; c.stroke(shape);
  snowCap(c, w, 12, r, 16);
}

/** A railway round the screen: snowy sleepers under two steel rails, snowflake medallions in the corners. */
const RAIL_BORDER: BorderStyle = {
  thick: 18,
  inset: 4,
  edge: (c, len, thick) => {
    // sleepers
    for (let x = 4; x < len; x += 17) {
      const g = c.createLinearGradient(x, 0, x + 8, 0);
      g.addColorStop(0, '#6b4424'); g.addColorStop(1, '#4a2c14');
      c.fillStyle = g; c.fillRect(x, 0, 8, thick);
      c.fillStyle = 'rgba(255,255,255,0.85)'; c.fillRect(x, 0, 8, 3);
    }
    // the rails
    for (const y of [4.5, thick - 6.5]) {
      c.fillStyle = '#2a3242'; c.fillRect(0, y, len, 3);
      c.fillStyle = '#c9d4e4'; c.fillRect(0, y, len, 1.2);
    }
  },
  corner: {
    size: 60,
    inset: 0,
    draw: (c, s) => {
      const R = s / 2 - 4;
      c.save();
      c.shadowColor = 'rgba(0,0,0,0.5)'; c.shadowBlur = 5; c.shadowOffsetY = 2;
      const g = c.createRadialGradient(s / 2 - 6, s / 2 - 6, 2, s / 2, s / 2, R);
      g.addColorStop(0, '#6fb6ff'); g.addColorStop(1, '#1d4f9a');
      c.fillStyle = g;
      c.beginPath(); c.arc(s / 2, s / 2, R, 0, Math.PI * 2); c.fill();
      c.restore();
      c.lineWidth = 3; c.strokeStyle = '#ffffff';
      c.beginPath(); c.arc(s / 2, s / 2, R - 1.5, 0, Math.PI * 2); c.stroke();
      snowflake(c, s / 2, s / 2, R * 0.66, '#ffffff', 2.6);
    },
  },
};

/** A puff of steam: overlapping white balls. */
function puff(c: CanvasRenderingContext2D, x: number, y: number, k: number, alpha: number): void {
  c.fillStyle = `rgba(255,255,255,${alpha})`;
  for (const [dx, dy, rr] of [[0, 0, 7], [7, -3, 6], [-6, -2, 5.5], [3, -7, 5.5], [-2, 4, 5]]) {
    c.beginPath(); c.arc(x + dx * k, y + dy * k, rr * k, 0, Math.PI * 2); c.fill();
  }
}

/** The locomotive coming at you: a lit lamp on the dark boiler, a red cab, a snowplough and steam. */
export function locoEmblem(c: CanvasRenderingContext2D, size: number): void {
  const u = size / 100;
  c.save();
  c.translate(size / 2, size / 2 + 4 * u);
  c.lineJoin = 'round';
  const ink = NAVY;
  // the lamp's warm glow
  const halo = c.createRadialGradient(0, -2 * u, 4 * u, 0, -2 * u, 48 * u);
  halo.addColorStop(0, 'rgba(255,220,120,0.55)'); halo.addColorStop(1, 'rgba(255,220,120,0)');
  c.fillStyle = halo; c.fillRect(-50 * u, -54 * u, 100 * u, 100 * u);
  // steam
  puff(c, -18 * u, -44 * u, 1.3 * u, 0.85);
  puff(c, -34 * u, -50 * u, 1.0 * u, 0.6);
  puff(c, -46 * u, -52 * u, 0.7 * u, 0.35);
  const red = (y0: number, y1: number) => {
    const g = c.createLinearGradient(0, y0 * u, 0, y1 * u);
    g.addColorStop(0, '#ff6a6a'); g.addColorStop(0.5, rgba(RED)); g.addColorStop(1, '#8e1820');
    return g;
  };
  c.lineWidth = 2.2 * u; c.strokeStyle = ink;
  // the cab behind the boiler, its roof and two lit windows
  c.fillStyle = red(-30, 16);
  c.beginPath(); c.roundRect(-33 * u, -28 * u, 66 * u, 46 * u, 4 * u); c.fill(); c.stroke();
  c.fillStyle = '#3a1a1a';
  c.beginPath(); c.roundRect(-37 * u, -33 * u, 74 * u, 8 * u, 3 * u); c.fill(); c.stroke();
  c.fillStyle = '#ffe28a';
  for (const x of [-28, 18]) { c.beginPath(); c.roundRect(x * u, -22 * u, 10 * u, 10 * u, 2 * u); c.fill(); c.stroke(); }
  // the chimney
  c.fillStyle = '#2a2f3e';
  c.beginPath(); c.moveTo(-5 * u, -24 * u); c.lineTo(-7 * u, -40 * u); c.lineTo(7 * u, -40 * u); c.lineTo(5 * u, -24 * u); c.closePath(); c.fill(); c.stroke();
  c.beginPath(); c.roundRect(-9.5 * u, -44 * u, 19 * u, 5 * u, 2 * u); c.fill(); c.stroke();
  // the boiler's round face with a red ring
  c.fillStyle = '#1f2533';
  c.beginPath(); c.arc(0, -2 * u, 25 * u, 0, Math.PI * 2); c.fill(); c.stroke();
  c.strokeStyle = rgba(RED); c.lineWidth = 4 * u;
  c.beginPath(); c.arc(0, -2 * u, 21 * u, 0, Math.PI * 2); c.stroke();
  c.strokeStyle = 'rgba(255,255,255,0.18)'; c.lineWidth = 1.5 * u;
  c.beginPath(); c.arc(0, -2 * u, 17 * u, Math.PI * 1.1, Math.PI * 1.6); c.stroke();
  // rivets round the ring
  c.fillStyle = '#ffd56a';
  for (let i = 0; i < 10; i++) { const a = (i / 10) * Math.PI * 2; c.beginPath(); c.arc(Math.cos(a) * 21 * u, -2 * u + Math.sin(a) * 21 * u, 1.2 * u, 0, Math.PI * 2); c.fill(); }
  // the lamp
  const lamp = c.createRadialGradient(-2 * u, -5 * u, 1 * u, 0, -2 * u, 10 * u);
  lamp.addColorStop(0, '#ffffff'); lamp.addColorStop(0.4, '#fff1a8'); lamp.addColorStop(1, '#ffb52e');
  c.fillStyle = lamp; c.strokeStyle = ink; c.lineWidth = 2 * u;
  c.beginPath(); c.arc(0, -2 * u, 9 * u, 0, Math.PI * 2); c.fill(); c.stroke();
  // the buffer beam and its two buffers
  c.fillStyle = red(16, 26); c.lineWidth = 2.2 * u;
  c.beginPath(); c.roundRect(-38 * u, 17 * u, 76 * u, 10 * u, 2 * u); c.fill(); c.stroke();
  c.fillStyle = '#c9d2e0';
  for (const x of [-30, 30]) { c.beginPath(); c.arc(x * u, 22 * u, 4.6 * u, 0, Math.PI * 2); c.fill(); c.stroke(); }
  // the snowplough with its gold edge
  const plow = c.createLinearGradient(0, 27 * u, 0, 44 * u);
  plow.addColorStop(0, '#ff8a3a'); plow.addColorStop(1, '#b8461a');
  c.fillStyle = plow;
  c.beginPath(); c.moveTo(-32 * u, 27 * u); c.lineTo(32 * u, 27 * u); c.lineTo(18 * u, 43 * u); c.lineTo(-18 * u, 43 * u); c.closePath(); c.fill(); c.stroke();
  c.strokeStyle = 'rgba(40,10,0,0.55)'; c.lineWidth = 1.3 * u;
  for (const x of [-16, -6, 4, 14]) { c.beginPath(); c.moveTo((x - 6) * u, 29 * u); c.lineTo((x * 0.6) * u, 41 * u); c.stroke(); }
  // snow on the roof and the chimney, sprays at the plough
  c.fillStyle = '#ffffff';
  for (const [x, y, rr] of [[-30, -34, 4], [-22, -35, 5], [-12, -34.5, 4], [12, -34.5, 4.5], [22, -35, 5], [31, -34, 4], [-6, -45, 3.4], [2, -45.5, 3.6], [7, -44.5, 2.6]]) {
    c.beginPath(); c.arc(x * u, y * u, rr * u, 0, Math.PI * 2); c.fill();
  }
  for (const s of [-1, 1]) puff(c, s * 38 * u, 38 * u, 0.9 * u, 0.9);
  c.restore();
}

export const SNOW_THEME: MenuTheme = {
  font: BALOO_2,
  palette: {
    primary: RED, secondary: ICE, board: 0x1b3a6e, trim: GOLD,
    label: '#ffffff', labelStroke: NAVY, muted: '#b8cde8', accent: '#ffe27a',
    heading: '#c8202e', body: '#16325a', icon: 0xffffff, shade: 0x0a1230,
  },
  logo: {
    fill: ['#ffb0b0', '#ef3b47', '#a3121f'],
    outline: '#ffffff',
    outlineWidth: 0.12,
    rim: NAVY,
    depth: '#0d2550',
    size: 140,
    lineHeight: 0.86,
    emblem: { draw: locoEmblem, size: 250, overlap: 0.3 },
  },
  skin: icePainter,
  pieces: [{ kind: 'button', w: JOURNEY_W, h: JOURNEY_H }],
  // dim: the backdrop's darkening (main.ts drew it as its own layer before the theme)
  frame: { border: RAIL_BORDER, notes: postcard, vignette: 0.5, dim: 0.34 },
  overlays: { lose: '#c8202e', titles: ['rushOver', 'crashEnd', 'allDone'] },
  // the level's stars card (PlayScene.finish) and the Journey map's postcards (mapui.ts)
  cards: [{ w: STARS_W, h: STARS_H }, MAP_CARD, RUSH_CARD],
  // the run's banners and callouts (labels.ts), painted under the intro
  prebake: (scene) => prebakePlay(scene),
};

/** The Journey button (M on the keyboard): the mode and level on top, "tap for the map" under it. */
export function journeyButton(scene: Phaser.Scene, x: number, y: number, open: () => void): { refresh: () => void } {
  const btn = new SkinButton(scene, x, y, '', open, { width: JOURNEY_W, height: JOURNEY_H, size: 32 });
  const sub = txt(scene, 0, 24, '', { size: 19, color: '#e8f4ff', strokeThickness: 4, shadow: false });
  btn.add(sub);
  const refresh = () => {
    const m = loadMeta();
    btn.setText(m.mode === 'rush' ? t('menuRush') : t('menuJourney', { n: m.level })).fitLabel(JOURNEY_W - 60);
    btn.setLabelY(-12);
    sub.setText(t('menuSub'));
  };
  refresh();
  // the pulse starts once the menu's entrance has popped the button in
  scene.time.delayedCall(1700, () => scene.tweens.add({ targets: btn, scale: { from: 1, to: 1.03 }, duration: 900, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' }));
  return { refresh };
}
