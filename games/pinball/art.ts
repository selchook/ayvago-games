import Phaser from 'phaser';
import type { Theme } from './levels';
import {
  archPoints, rampPath, GUIDE_L, GUIDE_R, PLUNGER_Y, PIVOT_Y, SLING_L, SLING_R, LANES, LANE_Y, TH, ORBIT_L, ORBIT_R, ORBIT_TOP, ORBIT_BOT,
  RAMP, SAUCER, BANK_X, BANK_Y, SPINNER, GATE, GUARD,
} from './table';

/**
 * Painted art for Pinball. Small parts are drawn once in grey and tinted with the level's theme;
 * the playfield and the apron are painted per theme into two alternating slots, so a level change
 * can cross-fade from the old table to the new one. Walls are chrome rails, the ramp is clear
 * plastic between two wire rails, and the score sits on a dot-matrix display.
 */

type Ctx = CanvasRenderingContext2D;
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

function make(scene: Phaser.Scene, key: string, w: number, h: number, draw: (c: Ctx) => void, redraw = false): void {
  let tex: Phaser.Textures.CanvasTexture | null = null;
  if (scene.textures.exists(key)) {
    if (!redraw) return;
    tex = scene.textures.get(key) as Phaser.Textures.CanvasTexture;
  } else tex = scene.textures.createCanvas(key, w, h);
  if (!tex) return;
  const c = tex.getContext();
  c.setTransform(1, 0, 0, 1, 0, 0);
  c.clearRect(0, 0, w, h);
  c.save();
  draw(c);
  c.restore();
  tex.refresh();
}

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

const rgba = (hex: string, a: number): string => {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
};
export const css = (n: number): string => '#' + n.toString(16).padStart(6, '0');

// ------------------------------------------------------------------ parts (grey, tinted at runtime)

/** Flipper (pivot at x = 16), ball, bumper body and cap, lamp, target, glow, ring, arrow, saucer, pivot. */
export function makeTextures(scene: Phaser.Scene): void {
  make(scene, 'pb-flipper', 148, 36, (c) => {
    const r0 = 16, r1 = 9, len = 120, cy = 18, x0 = 16;
    const shape = (pad: number) => {
      c.beginPath();
      const a = Math.asin((r0 - r1) / len);
      c.arc(x0, cy, r0 - pad, Math.PI / 2 - a, -Math.PI / 2 + a, false);
      c.arc(x0 + len, cy, r1 - pad, -Math.PI / 2 + a, Math.PI / 2 - a, false);
      c.closePath();
    };
    shape(0); c.fillStyle = '#ffffff'; c.fill();
    const g = c.createLinearGradient(0, cy - r0, 0, cy + r0);
    g.addColorStop(0, '#ffffff'); g.addColorStop(0.45, '#d8d8d8'); g.addColorStop(1, '#6a6a6a');
    shape(3); c.fillStyle = g; c.fill();
    c.beginPath(); c.moveTo(x0 + 4, cy - 9); c.lineTo(x0 + len - 6, cy - 5);
    c.strokeStyle = 'rgba(255,255,255,0.9)'; c.lineWidth = 3; c.lineCap = 'round'; c.stroke();
  });

  make(scene, 'pb-pivot', 24, 24, (c) => {
    const g = c.createRadialGradient(9, 9, 1, 12, 12, 11);
    g.addColorStop(0, '#ffffff'); g.addColorStop(0.5, '#c9ced6'); g.addColorStop(1, '#5b626c');
    disc(c, 12, 12, 10, g);
    c.beginPath(); c.arc(12, 12, 10, 0, TAU); c.strokeStyle = 'rgba(0,0,0,0.6)'; c.lineWidth = 1.5; c.stroke();
  });

  make(scene, 'pb-ball', 34, 34, (c) => {
    const cx = 17, cy = 17, r = 14;
    const g = c.createLinearGradient(0, cy - r, 0, cy + r);
    g.addColorStop(0, '#f4f8ff'); g.addColorStop(0.42, '#9aa6b8'); g.addColorStop(0.5, '#3b4250');
    g.addColorStop(0.62, '#7d8798'); g.addColorStop(1, '#dfe6f0');
    disc(c, cx, cy, r, g);
    const s = c.createRadialGradient(cx - 5, cy - 6, 0, cx - 5, cy - 6, 7);
    s.addColorStop(0, 'rgba(255,255,255,1)'); s.addColorStop(1, 'rgba(255,255,255,0)');
    disc(c, cx - 5, cy - 6, 7, s);
    c.beginPath(); c.arc(cx, cy, r - 0.5, 0, TAU); c.strokeStyle = 'rgba(20,24,32,0.7)'; c.lineWidth = 1.2; c.stroke();
  });

  make(scene, 'pb-bumper', 100, 100, (c) => {
    const cx = 50, cy = 50;
    const skirt = c.createRadialGradient(cx - 10, cy - 12, 6, cx, cy, 46);
    skirt.addColorStop(0, '#ffffff'); skirt.addColorStop(0.55, '#bdbdbd'); skirt.addColorStop(0.9, '#5a5a5a'); skirt.addColorStop(1, '#2a2a2a');
    disc(c, cx, cy, 46, skirt);
    c.lineWidth = 3;
    for (const r of [40, 32]) { c.beginPath(); c.arc(cx, cy, r, 0, TAU); c.strokeStyle = 'rgba(255,255,255,0.55)'; c.stroke(); }
    c.beginPath(); c.arc(cx, cy, 46, 0, TAU); c.strokeStyle = 'rgba(0,0,0,0.6)'; c.lineWidth = 2; c.stroke();
  });

  make(scene, 'pb-cap', 52, 52, (c) => {
    const cx = 26, cy = 26;
    const g = c.createRadialGradient(cx - 6, cy - 7, 1, cx, cy, 22);
    g.addColorStop(0, '#ffffff'); g.addColorStop(0.5, '#e6eaf0'); g.addColorStop(1, '#8a929e');
    disc(c, cx, cy, 22, g);
    c.beginPath();
    for (let i = 0; i < 10; i++) {
      const a = -Math.PI / 2 + (i * Math.PI) / 5, r = i % 2 ? 6 : 14;
      const x = cx + Math.cos(a) * r, y = cy + Math.sin(a) * r;
      if (i) c.lineTo(x, y); else c.moveTo(x, y);
    }
    c.closePath();
    const sg = c.createLinearGradient(0, cy - 14, 0, cy + 14);
    sg.addColorStop(0, '#fff2a8'); sg.addColorStop(1, '#ffb800');
    c.fillStyle = sg; c.fill(); c.strokeStyle = 'rgba(120,70,0,0.7)'; c.lineWidth = 1.2; c.stroke();
    c.beginPath(); c.arc(cx, cy, 22, 0, TAU); c.strokeStyle = 'rgba(0,0,0,0.45)'; c.lineWidth = 1.5; c.stroke();
  });

  make(scene, 'pb-lamp', 40, 40, (c) => {
    const g = c.createRadialGradient(15, 14, 1, 20, 20, 16);
    g.addColorStop(0, '#ffffff'); g.addColorStop(0.5, '#cfcfcf'); g.addColorStop(1, '#5c5c5c');
    disc(c, 20, 20, 15, g);
    c.beginPath(); c.arc(20, 20, 15, 0, TAU); c.strokeStyle = '#ffffff'; c.lineWidth = 2.5; c.stroke();
  });

  make(scene, 'pb-target', 60, 26, (c) => {
    c.beginPath(); round(c, 3, 3, 54, 20, 5);
    const g = c.createLinearGradient(0, 3, 0, 23);
    g.addColorStop(0, '#ffffff'); g.addColorStop(0.5, '#d0d0d0'); g.addColorStop(1, '#707070');
    c.fillStyle = g; c.fill();
    c.strokeStyle = 'rgba(0,0,0,0.6)'; c.lineWidth = 1.5; c.stroke();
    c.fillStyle = 'rgba(255,255,255,0.85)'; c.fillRect(9, 6, 42, 3);
  });

  make(scene, 'pb-slot', 60, 26, (c) => {
    c.beginPath(); round(c, 3, 8, 54, 10, 4);
    c.fillStyle = 'rgba(0,0,0,0.55)'; c.fill();
    c.strokeStyle = 'rgba(255,255,255,0.6)'; c.lineWidth = 1.5; c.stroke();
  });

  make(scene, 'pb-glow', 128, 128, (c) => {
    const g = c.createRadialGradient(64, 64, 0, 64, 64, 64);
    g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.3, 'rgba(255,255,255,0.4)'); g.addColorStop(1, 'rgba(255,255,255,0)');
    disc(c, 64, 64, 64, g);
  });

  make(scene, 'pb-ring', 128, 128, (c) => {
    c.shadowColor = '#ffffff'; c.shadowBlur = 10;
    c.beginPath(); c.arc(64, 64, 50, 0, TAU); c.strokeStyle = '#ffffff'; c.lineWidth = 6; c.stroke();
  });

  make(scene, 'pb-arrow', 60, 40, (c) => {
    c.beginPath(); c.moveTo(30, 3); c.lineTo(57, 37); c.lineTo(30, 26); c.lineTo(3, 37); c.closePath();
    const g = c.createLinearGradient(0, 3, 0, 37);
    g.addColorStop(0, '#ffffff'); g.addColorStop(1, '#9a9a9a');
    c.fillStyle = g; c.fill();
    c.strokeStyle = 'rgba(0,0,0,0.5)'; c.lineWidth = 1.5; c.stroke();
  });

  make(scene, 'pb-saucer', 64, 64, (c) => {
    const rim = c.createLinearGradient(0, 8, 0, 56);
    rim.addColorStop(0, '#ffffff'); rim.addColorStop(0.5, '#a9b0ba'); rim.addColorStop(1, '#4b525c');
    disc(c, 32, 32, 26, rim);
    const hole = c.createRadialGradient(32, 36, 2, 32, 32, 19);
    hole.addColorStop(0, '#2a2a2a'); hole.addColorStop(1, '#000000');
    disc(c, 32, 32, 19, hole);
    c.beginPath(); c.arc(32, 32, 18, Math.PI * 1.1, Math.PI * 1.9); c.strokeStyle = 'rgba(0,0,0,0.8)'; c.lineWidth = 4; c.stroke();
  });

  make(scene, 'pb-spinner', 60, 16, (c) => {
    const g = c.createLinearGradient(0, 2, 0, 14);
    g.addColorStop(0, '#ffffff'); g.addColorStop(0.5, '#aab2bd'); g.addColorStop(1, '#4f5660');
    c.beginPath(); round(c, 2, 2, 56, 12, 4); c.fillStyle = g; c.fill();
    c.strokeStyle = 'rgba(0,0,0,0.7)'; c.lineWidth = 1.5; c.stroke();
    c.fillStyle = '#ff3b2a'; c.fillRect(10, 6, 40, 4);
  });

  // dot-matrix display: bezel and the dot screen laid over its text
  make(scene, 'pb-dmd', 588, 112, (c) => {
    c.save(); c.shadowColor = 'rgba(0,0,0,0.8)'; c.shadowBlur = 12; c.shadowOffsetY = 4;
    c.beginPath(); round(c, 6, 4, 576, 102, 14); c.fillStyle = '#1b1c22'; c.fill(); c.restore();
    const bz = c.createLinearGradient(0, 4, 0, 106);
    bz.addColorStop(0, '#6b7180'); bz.addColorStop(0.5, '#2a2d35'); bz.addColorStop(1, '#14151a');
    c.beginPath(); round(c, 6, 4, 576, 102, 14); c.fillStyle = bz; c.fill();
    c.beginPath(); round(c, 14, 12, 560, 86, 8); c.fillStyle = '#120802'; c.fill();
    const glow = c.createRadialGradient(294, 55, 10, 294, 55, 300);
    glow.addColorStop(0, 'rgba(255,110,20,0.12)'); glow.addColorStop(1, 'rgba(255,110,20,0)');
    c.fillStyle = glow; c.fillRect(14, 12, 560, 86);
  });
  make(scene, 'pb-dmdgrid', 560, 86, (c) => {
    c.fillStyle = 'rgba(14,6,1,0.4)'; c.fillRect(0, 0, 560, 86);
    c.globalCompositeOperation = 'destination-out';
    c.fillStyle = '#000';
    for (let y = 2; y < 86; y += 4) for (let x = 2; x < 560; x += 4) { c.beginPath(); c.arc(x, y, 1.45, 0, TAU); c.fill(); }
    c.globalCompositeOperation = 'source-over';
    // unlit dots show faintly, like a real panel
    c.fillStyle = 'rgba(255,120,30,0.06)';
    for (let y = 2; y < 86; y += 4) for (let x = 2; x < 560; x += 4) { c.beginPath(); c.arc(x, y, 1.3, 0, TAU); c.fill(); }
    const sheen = c.createLinearGradient(0, 0, 0, 86);
    sheen.addColorStop(0, 'rgba(255,255,255,0.07)'); sheen.addColorStop(0.4, 'rgba(255,255,255,0)');
    c.fillStyle = sheen; c.fillRect(0, 0, 560, 86);
  });

  // the control bar along the bottom of the screen
  make(scene, 'pb-bar', 720, 112, (c) => {
    const g = c.createLinearGradient(0, 0, 0, 112);
    g.addColorStop(0, '#3a3f4a'); g.addColorStop(0.08, '#1d2028'); g.addColorStop(1, '#0b0c10');
    c.fillStyle = g; c.fillRect(0, 0, 720, 112);
    const edge = c.createLinearGradient(0, 0, 720, 0);
    edge.addColorStop(0, '#5b616d'); edge.addColorStop(0.5, '#e8edf4'); edge.addColorStop(1, '#5b616d');
    c.fillStyle = edge; c.fillRect(0, 0, 720, 3);
    c.strokeStyle = 'rgba(255,255,255,0.03)'; c.lineWidth = 2;
    for (let x = -120; x < 720; x += 10) { c.beginPath(); c.moveTo(x, 112); c.lineTo(x + 112, 0); c.stroke(); }
    c.save(); c.shadowColor = 'rgba(0,0,0,0.8)'; c.shadowBlur = 8;
    c.beginPath(); round(c, 188, 10, 344, 94, 12); c.fillStyle = '#07080c'; c.fill(); c.restore();
    c.beginPath(); round(c, 188, 10, 344, 94, 12); c.strokeStyle = 'rgba(255,255,255,0.18)'; c.lineWidth = 1.5; c.stroke();
  });
}

// ------------------------------------------------------------------ playfield, ramp and apron

const SLOTS = ['a', 'b'];
type Pt = [number, number];

/** A chrome rail along a polyline: drop shadow, dark body, bright core, highlight, a hint of the theme's glow. */
function rail(c: Ctx, pts: Pt[], glow: string, width = 1): void {
  const path = () => { c.beginPath(); pts.forEach(([x, y], i) => (i ? c.lineTo(x, y) : c.moveTo(x, y))); };
  c.lineJoin = 'round'; c.lineCap = 'round';
  c.save(); c.shadowColor = 'rgba(0,0,0,0.75)'; c.shadowBlur = 10; c.shadowOffsetX = 4; c.shadowOffsetY = 7;
  path(); c.strokeStyle = '#1a1d23'; c.lineWidth = 13 * width; c.stroke(); c.restore();
  c.save(); c.shadowColor = glow; c.shadowBlur = 16;
  path(); c.strokeStyle = rgba(glow, 0.35); c.lineWidth = 12 * width; c.stroke(); c.restore();
  path(); c.strokeStyle = '#3b414c'; c.lineWidth = 11 * width; c.stroke();
  path(); c.strokeStyle = '#b8c0cc'; c.lineWidth = 7 * width; c.stroke();
  path(); c.strokeStyle = '#f4f8ff'; c.lineWidth = 2.5 * width; c.stroke();
}

/** A rubber-ringed metal post. */
function post(c: Ctx, x: number, y: number, r = 8): void {
  disc(c, x + 2, y + 4, r + 2, 'rgba(0,0,0,0.5)');
  disc(c, x, y, r + 2, '#f2f2f2');
  const g = c.createRadialGradient(x - 2, y - 2, 0.5, x, y, r - 1);
  g.addColorStop(0, '#ffffff'); g.addColorStop(0.6, '#9aa3ae'); g.addColorStop(1, '#3e444d');
  disc(c, x, y, r - 1.5, g);
}

/** A recessed lamp socket shaped like an arrow (the lamp image sits on top). */
function socket(c: Ctx, x: number, y: number, rot: number, glow: string): void {
  c.save(); c.translate(x, y); c.rotate(rot);
  c.beginPath(); c.moveTo(0, -24); c.lineTo(22, 16); c.lineTo(0, 7); c.lineTo(-22, 16); c.closePath();
  c.fillStyle = 'rgba(0,0,0,0.55)'; c.fill();
  c.strokeStyle = rgba(glow, 0.45); c.lineWidth = 1.5; c.stroke();
  c.restore();
}

/** Where the arrow-shaped lamp inserts sit: [x, y, rotation]. */
export const INSERTS = {
  ramp: [205, 1075, 0], orbitL: [61, 1238, 0], orbitR: [619, 1238, 0], saucer: [430, 846, 0], bank: [500, 791, Math.PI / 2],
  progress: [[340, 1580, 0], [340, 1532, 0], [340, 1484, 0]],
} as const;

/** Paints the playfield for a theme into slot 0 or 1; returns the texture key. */
export function paintTable(scene: Phaser.Scene, th: Theme, slot: number): string {
  const key = `pb-table-${SLOTS[slot]}`;
  make(scene, key, 720, TH, (c) => {
    const rnd = seeded(31);
    const bg = c.createLinearGradient(0, 0, 0, TH);
    bg.addColorStop(0, th.bg[0]); bg.addColorStop(0.55, th.bg[1]); bg.addColorStop(1, th.bg[0]);
    c.fillStyle = bg; c.fillRect(0, 0, 720, TH);
    // speckled paint
    for (let i = 0; i < 3500; i++) {
      c.fillStyle = rnd() < 0.5 ? 'rgba(255,255,255,0.035)' : 'rgba(0,0,0,0.12)';
      c.fillRect(rnd() * 720, rnd() * TH, 2, 2);
    }
    // sunburst and rings behind the bumpers
    c.save(); c.translate(340, 450);
    for (let i = 0; i < 24; i++) {
      c.rotate(TAU / 24);
      c.beginPath(); c.moveTo(0, 0); c.lineTo(-40, -520); c.lineTo(40, -520); c.closePath();
      c.fillStyle = rgba(th.glow, i % 2 ? 0.05 : 0.02); c.fill();
    }
    c.restore();
    const halo = c.createRadialGradient(340, 440, 20, 340, 440, 420);
    halo.addColorStop(0, rgba(th.glow, 0.3)); halo.addColorStop(1, rgba(th.glow, 0));
    c.fillStyle = halo; c.fillRect(0, 0, 720, 900);
    c.lineWidth = 2;
    for (let r = 70, k = 0; r < 300; r += 34, k++) { c.beginPath(); c.arc(340, 450, r, 0, TAU); c.strokeStyle = rgba(th.glow, 0.2 - k * 0.025); c.stroke(); }
    // lane floors: orbits and the ramp entrance are darker strips with a coloured edge
    const strip = (x: number, y: number, w: number, h: number) => {
      const g = c.createLinearGradient(x, 0, x + w, 0);
      g.addColorStop(0, 'rgba(0,0,0,0.5)'); g.addColorStop(0.5, 'rgba(0,0,0,0.28)'); g.addColorStop(1, 'rgba(0,0,0,0.5)');
      c.fillStyle = g; c.fillRect(x, y, w, h);
      c.strokeStyle = rgba(th.glow, 0.25); c.lineWidth = 1.5;
      c.beginPath(); c.moveTo(x + 6, y); c.lineTo(x + 6, y + h); c.moveTo(x + w - 6, y); c.lineTo(x + w - 6, y + h); c.stroke();
      for (let yy = y + 20; yy < y + h; yy += 40) { c.fillStyle = rgba(th.glow, 0.12); c.fillRect(x + w / 2 - 2, yy, 4, 16); }
    };
    strip(30, ORBIT_TOP, ORBIT_L - 30, ORBIT_BOT - ORBIT_TOP + 60);
    strip(ORBIT_R, ORBIT_TOP, 650 - ORBIT_R, ORBIT_BOT - ORBIT_TOP + 60);
    strip(RAMP.x0, RAMP.top, RAMP.x1 - RAMP.x0, RAMP.bot - RAMP.top + 30);
    // the logo, big in the middle of the table
    c.save();
    c.font = '110px "Press Start 2P", monospace';
    c.textAlign = 'center'; c.textBaseline = 'middle';
    c.translate(360, 1330); c.rotate(-0.06);
    c.fillStyle = 'rgba(0,0,0,0.45)'; c.fillText('TILT', 6, 10);
    const lg = c.createLinearGradient(0, -55, 0, 55);
    lg.addColorStop(0, '#ffffff'); lg.addColorStop(0.45, th.accent); lg.addColorStop(1, rgba(th.glow, 1));
    c.lineWidth = 10; c.strokeStyle = '#0a0a12'; c.strokeText('TILT', 0, 0);
    c.fillStyle = lg; c.globalAlpha = 0.85; c.fillText('TILT', 0, 0);
    c.globalAlpha = 1;
    c.font = '18px "Press Start 2P", monospace';
    c.fillStyle = rgba(th.glow, 0.7); c.fillText('AYVAGO  GAMES', 0, 82);
    c.restore();
    // perspective grid over the lower playfield, fading in towards the flippers
    c.save();
    c.beginPath(); c.rect(30, 1430, 620, 470); c.clip();
    c.lineWidth = 1.5;
    for (let i = 1; i < 12; i++) {
      const f = i / 11, y = 1430 + Math.pow(f, 1.8) * 470;
      c.strokeStyle = rgba(th.glow, 0.03 + f * 0.12);
      c.beginPath(); c.moveTo(30, y); c.lineTo(650, y); c.stroke();
    }
    const vg = c.createLinearGradient(0, 1430, 0, 1900);
    vg.addColorStop(0, rgba(th.glow, 0)); vg.addColorStop(1, rgba(th.glow, 0.16));
    c.strokeStyle = vg;
    for (let i = -9; i <= 9; i++) { c.beginPath(); c.moveTo(340 + i * 14, 1430); c.lineTo(340 + i * 90, 1900); c.stroke(); }
    c.restore();
    // stars
    for (let i = 0; i < 120; i++) {
      const x = 40 + rnd() * 600, y = 110 + rnd() * 1700, r = rnd() < 0.85 ? 1 : 1.8;
      disc(c, x, y, r, `rgba(255,255,255,${(0.2 + rnd() * 0.45).toFixed(2)})`);
    }
    // shooter lane
    c.fillStyle = 'rgba(0,0,0,0.45)'; c.fillRect(652, 330, 52, PLUNGER_Y - 300);
    for (let y = 400; y < PLUNGER_Y - 20; y += 60) { c.fillStyle = rgba(th.glow, 0.15); c.fillRect(676, y, 4, 24); }
    // lamp sockets: lanes, inserts, saucer ring, spinner frame
    for (const x of LANES) {
      disc(c, x, LANE_Y + 4, 19, 'rgba(0,0,0,0.5)');
      c.beginPath(); c.arc(x, LANE_Y + 4, 19, 0, TAU); c.strokeStyle = rgba(th.glow, 0.4); c.lineWidth = 1.5; c.stroke();
    }
    for (const [x, y, r] of [INSERTS.ramp, INSERTS.orbitL, INSERTS.orbitR, INSERTS.saucer, INSERTS.bank, ...INSERTS.progress]) socket(c, x, y, r, th.glow);
    c.beginPath(); c.arc(SAUCER.x, SAUCER.y, 34, 0, TAU); c.strokeStyle = rgba(th.glow, 0.5); c.lineWidth = 3; c.stroke();
    disc(c, SAUCER.x, SAUCER.y, 30, 'rgba(0,0,0,0.35)');
    c.strokeStyle = '#9aa3ae'; c.lineWidth = 3;
    c.beginPath(); c.moveTo(34, SPINNER.y - 10); c.lineTo(34, SPINNER.y + 10); c.moveTo(88, SPINNER.y - 10); c.lineTo(88, SPINNER.y + 10); c.stroke();
    // the drop bank's rail and the guard's track
    c.fillStyle = 'rgba(0,0,0,0.4)'; c.fillRect(BANK_X - 6, BANK_Y[0] - 28, 34, BANK_Y[3] - BANK_Y[0] + 56);
    c.strokeStyle = rgba(th.glow, 0.22); c.lineWidth = 2; c.setLineDash([8, 8]);
    c.beginPath(); c.moveTo(GUARD.cx - GUARD.sweep - GUARD.half, GUARD.y); c.lineTo(GUARD.cx + GUARD.sweep + GUARD.half, GUARD.y); c.stroke();
    c.setLineDash([]);

    // chrome rails
    const arch = archPoints();
    rail(c, [[706, PLUNGER_Y + 16], ...arch, [30, GUIDE_L[0][1]], [GUIDE_L[1][0], GUIDE_L[1][1]]], th.glow);
    rail(c, [[650, 470], [650, GUIDE_R[0][1]], [GUIDE_R[1][0], GUIDE_R[1][1]]], th.glow);
    rail(c, [[650, GUIDE_R[0][1]], [650, PLUNGER_Y + 16]], th.glow);
    rail(c, [[ORBIT_L, ORBIT_TOP], [ORBIT_L, ORBIT_BOT]], th.glow);
    rail(c, [[ORBIT_R, ORBIT_TOP], [ORBIT_R, ORBIT_BOT]], th.glow);
    rail(c, [[RAMP.x0, RAMP.bot], [RAMP.x0, RAMP.top], [RAMP.x1, RAMP.top], [RAMP.x1, RAMP.bot]], th.glow);
    rail(c, [[BANK_X - 4, BANK_Y[0] - 24], [ORBIT_R, BANK_Y[0] - 44]], th.glow, 0.8);
    rail(c, [[GATE[0][0], GATE[0][1]], [GATE[1][0], GATE[1][1]]], th.glow, 0.6);
    for (const [x, y] of [[ORBIT_L, ORBIT_TOP], [ORBIT_L, ORBIT_BOT], [ORBIT_R, ORBIT_TOP], [ORBIT_R, ORBIT_BOT], [RAMP.x0, RAMP.bot], [RAMP.x1, RAMP.bot]] as const) post(c, x, y);
    // rollover lane posts
    for (let i = 0; i <= LANES.length; i++) {
      const x = LANES[0] - 40 + i * 80;
      rail(c, [[x, LANE_Y - 35], [x, LANE_Y + 30]], th.glow, 0.9);
      post(c, x, LANE_Y - 35, 6); post(c, x, LANE_Y + 30, 6);
    }
    // slingshot bodies: lit plastic
    for (const s of [SLING_L, SLING_R]) {
      const tri = () => { c.beginPath(); c.moveTo(s.a[0], s.a[1]); c.lineTo(s.b[0], s.b[1]); c.lineTo(s.c[0], s.c[1]); c.closePath(); };
      const g = c.createLinearGradient(s.b[0], s.a[1], s.c[0], s.c[1]);
      g.addColorStop(0, rgba(th.glow, 0.65)); g.addColorStop(1, rgba(th.bg[0], 0.7));
      c.save(); c.shadowColor = 'rgba(0,0,0,0.6)'; c.shadowBlur = 10; c.shadowOffsetY = 6;
      tri(); c.fillStyle = g; c.fill(); c.restore();
      c.save(); c.shadowColor = th.glow; c.shadowBlur = 12;
      tri(); c.strokeStyle = th.neon; c.lineWidth = 3; c.stroke(); c.restore();
      post(c, s.a[0], s.a[1], 7); post(c, s.b[0], s.b[1], 7); post(c, s.c[0], s.c[1], 7);
    }
    // vignette
    const v = c.createLinearGradient(0, 0, 720, 0);
    v.addColorStop(0, 'rgba(0,0,0,0.35)'); v.addColorStop(0.15, 'rgba(0,0,0,0)'); v.addColorStop(0.85, 'rgba(0,0,0,0)'); v.addColorStop(1, 'rgba(0,0,0,0.35)');
    c.fillStyle = v; c.fillRect(0, 0, 720, TH);
  }, true);
  return key;
}

export const RAMP_Y0 = 540;

/** The ramp: clear plastic between two chrome wire rails, from the entrance lane over to the right inlane. */
export function paintRamp(scene: Phaser.Scene): string {
  const key = 'pb-ramp', H = 1180;
  make(scene, key, 720, H, (c) => {
    c.translate(0, -RAMP_Y0);
    const p = rampPath();
    const path = (pts: Pt[]) => { c.beginPath(); pts.forEach(([x, y], i) => (i ? c.lineTo(x, y) : c.moveTo(x, y))); };
    // offset rails
    const side = (k: number): Pt[] => p.map(([x, y], i) => {
      const [ax, ay] = p[Math.max(0, i - 1)], [bx, by] = p[Math.min(p.length - 1, i + 1)];
      const l = Math.hypot(bx - ax, by - ay) || 1;
      return [x - ((by - ay) / l) * k, y + ((bx - ax) / l) * k];
    });
    const start: Pt[] = [[205, 975], ...p];
    c.lineJoin = 'round'; c.lineCap = 'round';
    c.save(); c.shadowColor = 'rgba(0,0,0,0.55)'; c.shadowBlur = 14; c.shadowOffsetX = 10; c.shadowOffsetY = 16;
    path(start); c.strokeStyle = 'rgba(0,0,0,0.35)'; c.lineWidth = 50; c.stroke(); c.restore();
    path(start); c.strokeStyle = 'rgba(190,235,255,0.2)'; c.lineWidth = 46; c.stroke();
    path(start); c.strokeStyle = 'rgba(255,255,255,0.12)'; c.lineWidth = 18; c.stroke();
    // ribs
    c.strokeStyle = 'rgba(220,235,255,0.55)'; c.lineWidth = 2;
    const L = side(-23), R = side(23);
    for (let i = 4; i < p.length - 2; i += 6) { c.beginPath(); c.moveTo(L[i][0], L[i][1]); c.lineTo(R[i][0], R[i][1]); c.stroke(); }
    for (const pts of [L, R]) {
      path(pts); c.strokeStyle = '#2a2f38'; c.lineWidth = 7; c.stroke();
      path(pts); c.strokeStyle = '#c9d1dc'; c.lineWidth = 4; c.stroke();
      path(pts); c.strokeStyle = '#ffffff'; c.lineWidth = 1.5; c.stroke();
    }
    // chevrons on the plastic pointing up the ramp
    c.fillStyle = 'rgba(255,255,255,0.35)';
    for (const i of [6, 14, 22]) {
      const [x, y] = p[i], [nx, ny] = p[i + 1], a = Math.atan2(ny - y, nx - x);
      c.save(); c.translate(x, y); c.rotate(a + Math.PI / 2);
      c.beginPath(); c.moveTo(0, -9); c.lineTo(11, 5); c.lineTo(0, 0); c.lineTo(-11, 5); c.closePath(); c.fill();
      c.restore();
    }
  });
  return key;
}

export const APRON_Y = 1690;

/** The apron (y ≥ APRON_Y): covers the drain and the space under the inlanes. */
export function paintApron(scene: Phaser.Scene, th: Theme, slot: number): string {
  const key = `pb-apron-${SLOTS[slot]}`, Y = APRON_Y;
  make(scene, key, 720, TH - Y, (c) => {
    c.translate(0, -Y);
    const shape = () => {
      c.beginPath();
      const pts: Pt[] = [
        [0, GUIDE_L[0][1] - 10], [30, GUIDE_L[0][1]], [GUIDE_L[1][0], GUIDE_L[1][1]], [176, PIVOT_Y - 10], [176, PIVOT_Y + 90], [504, PIVOT_Y + 90], [504, PIVOT_Y - 10],
        [GUIDE_R[1][0], GUIDE_R[1][1]], [650, GUIDE_R[0][1]], [650, PLUNGER_Y + 20], [720, PLUNGER_Y + 20], [720, TH], [0, TH],
      ];
      pts.forEach(([x, y], i) => (i ? c.lineTo(x, y) : c.moveTo(x, y)));
      c.closePath();
    };
    const g = c.createLinearGradient(0, Y, 0, TH);
    g.addColorStop(0, '#2a2e38'); g.addColorStop(1, '#0d0e13');
    shape(); c.fillStyle = g; c.fill();
    const tint = c.createLinearGradient(0, Y, 0, TH);
    tint.addColorStop(0, rgba(th.glow, 0.14)); tint.addColorStop(1, rgba(th.glow, 0.03));
    shape(); c.fillStyle = tint; c.fill();
    c.save(); shape(); c.clip();
    c.strokeStyle = 'rgba(255,255,255,0.035)'; c.lineWidth = 2;
    for (let x = -420; x < 720; x += 12) { c.beginPath(); c.moveTo(x, TH); c.lineTo(x + 420, Y); c.stroke(); }
    c.restore();
    shape(); c.strokeStyle = '#c9d1dc'; c.lineWidth = 2.5; c.stroke();
    // drain lip
    c.save(); c.shadowColor = '#ff3b2a'; c.shadowBlur = 14;
    c.beginPath(); c.moveTo(180, PIVOT_Y + 90); c.lineTo(500, PIVOT_Y + 90); c.strokeStyle = '#ff5a45'; c.lineWidth = 4; c.stroke(); c.restore();
  }, true);
  return key;
}

/** Glossy round-cornered button face (grey; tinted per button). */
export function makeButton(scene: Phaser.Scene, w: number, h: number): string {
  const key = `pb-btn-${w}x${h}`;
  make(scene, key, w + 16, h + 20, (c) => {
    c.save(); c.shadowColor = 'rgba(0,0,0,0.7)'; c.shadowBlur = 10; c.shadowOffsetY = 6;
    c.beginPath(); round(c, 8, 6, w, h, 16); c.fillStyle = '#3a3a3a'; c.fill(); c.restore();
    const g = c.createLinearGradient(0, 6, 0, 6 + h);
    g.addColorStop(0, '#ffffff'); g.addColorStop(0.5, '#c8c8c8'); g.addColorStop(1, '#6a6a6a');
    c.beginPath(); round(c, 8, 6, w, h, 16); c.fillStyle = g; c.fill();
    c.strokeStyle = 'rgba(0,0,0,0.75)'; c.lineWidth = 3; c.stroke();
    c.beginPath(); round(c, 16, 10, w - 16, h * 0.38, 12); c.fillStyle = 'rgba(255,255,255,0.35)'; c.fill();
  });
  return key;
}
