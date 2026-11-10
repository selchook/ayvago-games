import Phaser from 'phaser';
import type { Theme, TableDef, Mission } from './tables';
import { bankTargets } from './tables';
import {
  archPoints, GUIDE_L, GUIDE_R, PLUNGER_Y, PIVOT_Y, SLING_L, SLING_R, LANES, LANE_Y, TH, ORBIT_L, ORBIT_R, ORBIT_TOP, ORBIT_BOT, GATE, type Pt,
} from './table';

/**
 * Painted art for Pinball. Small parts are drawn once in grey and tinted with the table's theme;
 * the playfield, its ramps and the apron are painted again for every table. Each table has its own
 * artwork (city, ocean, temple, forge, space) and its name across the middle. Walls are chrome
 * rails, ramps are clear plastic between wire rails, and the score sits on a dot-matrix display.
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

  // a whirl for vortex holes (turned at runtime) and a portal for wormholes
  make(scene, 'pb-vortex', 220, 220, (c) => {
    c.translate(110, 110);
    for (let arm = 0; arm < 4; arm++) {
      c.save(); c.rotate((arm * TAU) / 4);
      c.beginPath();
      for (let i = 0; i <= 60; i++) { const t = i / 60, a = t * 4.2, r = 8 + t * 100; const x = Math.cos(a) * r, y = Math.sin(a) * r; if (i) c.lineTo(x, y); else c.moveTo(x, y); }
      c.strokeStyle = 'rgba(255,255,255,0.75)'; c.lineWidth = 5; c.lineCap = 'round'; c.stroke();
      c.restore();
    }
    const g = c.createRadialGradient(0, 0, 0, 0, 0, 110);
    g.addColorStop(0, 'rgba(255,255,255,0.5)'); g.addColorStop(0.25, 'rgba(255,255,255,0.1)'); g.addColorStop(1, 'rgba(255,255,255,0)');
    disc(c, 0, 0, 110, g);
  });
  make(scene, 'pb-portal', 96, 96, (c) => {
    for (let r = 44, k = 0; r > 6; r -= 7, k++) { c.beginPath(); c.arc(48, 48, r, 0, TAU); c.strokeStyle = `rgba(255,255,255,${0.25 + k * 0.1})`; c.lineWidth = 3; c.stroke(); }
    disc(c, 48, 48, 9, '#ffffff');
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
    // the readout well between the buttons is a HUD chip drawn by the play scene
  });
}

// ------------------------------------------------------------------ playfield, ramps and apron

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

export interface Insert { x: number; y: number; rot: number; missions: Mission[] }

/** The arrow inserts of a table: one in front of every shot, lit while a mission wants that shot. */
export function insertsOf(def: TableDef): Insert[] {
  const out: Insert[] = [];
  for (const r of def.ramps) out.push({ x: (r.lane.x0 + r.lane.x1) / 2, y: r.lane.bot + 62, rot: 0, missions: ['ramps'] });
  const spinL = def.spinners.some((s) => s.x < 340), spinR = def.spinners.some((s) => s.x > 340);
  if (def.orbitL) out.push({ x: 61, y: 1238, rot: 0, missions: def.orbitR ? ['orbits', ...(spinL ? ['spinner' as Mission] : [])] : spinL ? ['spinner'] : [] });
  if (def.orbitR) out.push({ x: 619, y: 1238, rot: 0, missions: def.orbitL ? ['orbits', ...(spinR ? ['spinner' as Mission] : [])] : spinR ? ['spinner'] : [] });
  for (const h of def.holes) out.push({ x: h.x, y: h.y + (h.kind === 'vortex' ? (h.pull ?? 90) * 0.8 + 20 : 70), rot: 0, missions: [h.kind === 'saucer' ? 'saucer' : h.kind] });
  for (const b of def.banks) {
    const n = b.n - 1;
    if (!b.vertical) out.push({ x: b.x, y: b.y + 62, rot: 0, missions: ['banks'] });
    else if (b.face === 'L') out.push({ x: b.x - 60, y: b.y + n * 23, rot: Math.PI / 2, missions: ['banks'] });
    else out.push({ x: b.x + 60, y: b.y + n * 23, rot: -Math.PI / 2, missions: ['banks'] });
  }
  return out;
}

/** Three arrows up the middle that light as the table's target gets closer. */
export const PROGRESS: Pt[] = [[340, 1580], [340, 1532], [340, 1484]];

const TITLE_FONT = '"Ayvago Pixel TR", "Press Start 2P", monospace';

// ---------------------------------------------------------------- the artwork behind each table

function artCity(c: Ctx, th: Theme, rnd: () => number): void {
  // sunburst behind the bumpers
  c.save(); c.translate(340, 450);
  for (let i = 0; i < 24; i++) {
    c.rotate(TAU / 24);
    c.beginPath(); c.moveTo(0, 0); c.lineTo(-40, -520); c.lineTo(40, -520); c.closePath();
    c.fillStyle = rgba(th.glow, i % 2 ? 0.05 : 0.02); c.fill();
  }
  c.restore();
  // a skyline behind the logo, with lit windows
  for (let x = 40, i = 0; x < 640; i++) {
    const w = 40 + rnd() * 50, h = 120 + rnd() * 260, top = 1460 - h;
    const g = c.createLinearGradient(0, top, 0, 1460);
    g.addColorStop(0, 'rgba(10,8,30,0.85)'); g.addColorStop(1, 'rgba(10,8,30,0.4)');
    c.fillStyle = g; c.fillRect(x, top, w, h);
    c.strokeStyle = rgba(th.glow, 0.35); c.lineWidth = 1.5; c.strokeRect(x + 0.5, top + 0.5, w - 1, h);
    for (let wy = top + 10; wy < 1450; wy += 16) for (let wx = x + 6; wx < x + w - 8; wx += 12) {
      if (rnd() < 0.35) { c.fillStyle = rnd() < 0.5 ? rgba(th.accent, 0.55) : rgba(th.glow, 0.45); c.fillRect(wx, wy, 6, 8); }
    }
    if (i % 3 === 1) { c.strokeStyle = rgba(th.glow, 0.6); c.beginPath(); c.moveTo(x + w / 2, top); c.lineTo(x + w / 2, top - 30); c.stroke(); disc(c, x + w / 2, top - 32, 3, '#ff3b2a'); }
    x += w + 4 + rnd() * 10;
  }
  disc(c, 560, 1080, 46, rgba(th.accent, 0.18));
  disc(c, 560, 1080, 34, rgba(th.accent, 0.25));
}

function artOcean(c: Ctx, th: Theme, rnd: () => number): void {
  // light shafts from the surface
  for (let i = 0; i < 7; i++) {
    const x = 60 + i * 95 + rnd() * 30, w = 40 + rnd() * 50;
    const g = c.createLinearGradient(0, 90, 0, 1500);
    g.addColorStop(0, 'rgba(200,250,255,0.13)'); g.addColorStop(1, 'rgba(200,250,255,0)');
    c.beginPath(); c.moveTo(x, 90); c.lineTo(x + w, 90); c.lineTo(x + w * 2.4 - 60, 1500); c.lineTo(x - 60, 1500); c.closePath();
    c.fillStyle = g; c.fill();
  }
  // waves
  c.lineWidth = 2;
  for (let y = 300; y < 1700; y += 90) {
    c.beginPath();
    for (let x = 30; x <= 650; x += 10) { const yy = y + Math.sin(x * 0.03 + y) * 8; if (x === 30) c.moveTo(x, yy); else c.lineTo(x, yy); }
    c.strokeStyle = rgba(th.glow, 0.09); c.stroke();
  }
  // caustic net near the top
  c.strokeStyle = 'rgba(180,240,255,0.08)'; c.lineWidth = 1.5;
  for (let i = 0; i < 70; i++) {
    const x = 40 + rnd() * 600, y = 120 + rnd() * 500;
    c.beginPath(); c.moveTo(x, y); c.quadraticCurveTo(x + 20, y - 14, x + 40, y + 4); c.stroke();
  }
  // kelp along the sides
  for (const side of [0, 1]) for (let k = 0; k < 4; k++) {
    const bx = side ? 600 - k * 18 : 80 + k * 18, h = 300 + rnd() * 250;
    c.beginPath(); c.moveTo(bx, 1560);
    for (let y = 1560; y > 1560 - h; y -= 20) c.lineTo(bx + Math.sin(y * 0.03 + k) * 12, y);
    c.strokeStyle = 'rgba(40,160,120,0.35)'; c.lineWidth = 6; c.lineCap = 'round'; c.stroke();
  }
  // bubbles
  for (let i = 0; i < 70; i++) {
    const x = 40 + rnd() * 600, y = 150 + rnd() * 1450, r = 2 + rnd() * 7;
    c.beginPath(); c.arc(x, y, r, 0, TAU); c.strokeStyle = 'rgba(220,250,255,0.35)'; c.lineWidth = 1.2; c.stroke();
    disc(c, x - r * 0.35, y - r * 0.35, r * 0.25, 'rgba(255,255,255,0.5)');
  }
}

function artJungle(c: Ctx, th: Theme, rnd: () => number): void {
  // temple flagstones in the middle
  c.save();
  c.beginPath(); c.moveTo(140, 1500); c.lineTo(200, 560); c.lineTo(480, 560); c.lineTo(540, 1500); c.closePath(); c.clip();
  for (let y = 560, row = 0; y < 1500; y += 48, row++) {
    for (let x = 100 + (row % 2) * 40; x < 600; x += 80) {
      c.fillStyle = `rgba(${150 + rnd() * 40},${140 + rnd() * 30},${90 + rnd() * 30},0.14)`;
      c.fillRect(x + 2, y + 2, 76, 44);
      c.strokeStyle = 'rgba(0,0,0,0.25)'; c.lineWidth = 2; c.strokeRect(x + 2, y + 2, 76, 44);
      if (rnd() < 0.3) { c.fillStyle = 'rgba(60,140,50,0.25)'; c.beginPath(); c.ellipse(x + 20 + rnd() * 40, y + 40, 18, 6, 0, 0, TAU); c.fill(); }
    }
  }
  c.restore();
  // steps of a pyramid behind the bumpers
  for (let i = 0; i < 6; i++) {
    const w = 360 - i * 52, y = 560 - i * 34;
    c.fillStyle = `rgba(120,110,70,${0.12 + i * 0.02})`; c.fillRect(340 - w / 2 + 60, y, w, 32);
    c.strokeStyle = 'rgba(0,0,0,0.25)'; c.strokeRect(340 - w / 2 + 60, y, w, 32);
  }
  // leaves and vines on the sides
  const leaf = (x: number, y: number, a: number, s: number) => {
    c.save(); c.translate(x, y); c.rotate(a);
    c.beginPath(); c.ellipse(0, 0, 26 * s, 10 * s, 0, 0, TAU);
    c.fillStyle = rnd() < 0.5 ? 'rgba(40,120,50,0.55)' : 'rgba(70,160,60,0.45)'; c.fill();
    c.beginPath(); c.moveTo(-24 * s, 0); c.lineTo(24 * s, 0); c.strokeStyle = 'rgba(0,40,0,0.4)'; c.lineWidth = 1; c.stroke();
    c.restore();
  };
  for (let i = 0; i < 90; i++) { const side = rnd() < 0.5; leaf(side ? 40 + rnd() * 70 : 570 + rnd() * 70, 300 + rnd() * 1300, rnd() * TAU, 0.6 + rnd() * 0.8); }
  for (let v = 0; v < 5; v++) {
    const x0 = 120 + v * 110;
    c.beginPath(); c.moveTo(x0, 100);
    c.bezierCurveTo(x0 + 40, 300, x0 - 40, 500, x0 + 20, 700);
    c.strokeStyle = 'rgba(50,120,40,0.35)'; c.lineWidth = 4; c.stroke();
  }
  // a sun disc
  const sun = c.createRadialGradient(340, 260, 10, 340, 260, 200);
  sun.addColorStop(0, rgba(th.accent, 0.3)); sun.addColorStop(1, rgba(th.accent, 0));
  c.fillStyle = sun; c.fillRect(140, 60, 400, 400);
}

function artForge(c: Ctx, th: Theme, rnd: () => number): void {
  // heat glow from below
  const heat = c.createLinearGradient(0, 900, 0, 1800);
  heat.addColorStop(0, 'rgba(255,90,20,0)'); heat.addColorStop(1, 'rgba(255,90,20,0.25)');
  c.fillStyle = heat; c.fillRect(30, 900, 620, 900);
  // gears
  const gear = (x: number, y: number, r: number, teeth: number) => {
    c.save(); c.translate(x, y);
    c.beginPath();
    for (let i = 0; i < teeth * 2; i++) { const a = (i / (teeth * 2)) * TAU, rr = i % 2 ? r : r + r * 0.18; c.lineTo(Math.cos(a) * rr, Math.sin(a) * rr); }
    c.closePath(); c.fillStyle = 'rgba(30,10,6,0.55)'; c.fill();
    c.strokeStyle = rgba(th.glow, 0.35); c.lineWidth = 2; c.stroke();
    c.beginPath(); c.arc(0, 0, r * 0.35, 0, TAU); c.strokeStyle = rgba(th.glow, 0.35); c.stroke();
    for (let i = 0; i < 6; i++) { const a = (i / 6) * TAU; disc(c, Math.cos(a) * r * 0.65, Math.sin(a) * r * 0.65, r * 0.1, 'rgba(0,0,0,0.5)'); }
    c.restore();
  };
  gear(140, 1060, 90, 12); gear(540, 1000, 70, 10); gear(470, 1380, 110, 14); gear(170, 1420, 60, 9); gear(340, 640, 150, 18);
  // flames rising from the bottom
  for (let i = 0; i < 14; i++) {
    const x = 50 + i * 44 + rnd() * 20, h = 120 + rnd() * 200, w = 26 + rnd() * 20;
    const g = c.createLinearGradient(0, 1600 - h, 0, 1600);
    g.addColorStop(0, 'rgba(255,200,60,0)'); g.addColorStop(0.5, 'rgba(255,120,30,0.25)'); g.addColorStop(1, 'rgba(255,60,20,0.35)');
    c.beginPath(); c.moveTo(x - w, 1600);
    c.quadraticCurveTo(x - w, 1600 - h * 0.5, x, 1600 - h);
    c.quadraticCurveTo(x + w, 1600 - h * 0.5, x + w, 1600);
    c.closePath(); c.fillStyle = g; c.fill();
  }
  // hazard stripes above the slings
  c.save(); c.beginPath(); c.rect(30, 1520, 620, 22); c.clip();
  for (let x = 0; x < 720; x += 36) { c.beginPath(); c.moveTo(x, 1542); c.lineTo(x + 18, 1542); c.lineTo(x + 40, 1520); c.lineTo(x + 22, 1520); c.closePath(); c.fillStyle = 'rgba(255,200,40,0.35)'; c.fill(); }
  c.restore();
  // rivets
  for (let y = 140; y < 1700; y += 60) { disc(c, 40, y, 3, 'rgba(255,200,150,0.25)'); disc(c, 640, y, 3, 'rgba(255,200,150,0.25)'); }
}

function artSpace(c: Ctx, th: Theme, rnd: () => number): void {
  // nebulae
  for (const [x, y, r, col] of [[200, 400, 300, '#ff4fe0'], [520, 900, 280, '#3ee6ff'], [260, 1300, 260, '#8b5cff']] as const) {
    const g = c.createRadialGradient(x, y, 10, x, y, r);
    g.addColorStop(0, rgba(col, 0.22)); g.addColorStop(1, rgba(col, 0));
    c.fillStyle = g; c.fillRect(x - r, y - r, r * 2, r * 2);
  }
  // dense stars
  for (let i = 0; i < 380; i++) {
    const x = 34 + rnd() * 612, y = 100 + rnd() * 1600, r = rnd() < 0.9 ? 0.9 : 1.8;
    disc(c, x, y, r, `rgba(255,255,255,${(0.25 + rnd() * 0.6).toFixed(2)})`);
  }
  // a ringed planet
  c.save(); c.translate(540, 1080);
  const pg = c.createRadialGradient(-20, -24, 6, 0, 0, 70);
  pg.addColorStop(0, rgba(th.accent, 0.7)); pg.addColorStop(1, rgba(th.bg[0], 0.9));
  disc(c, 0, 0, 62, pg);
  c.rotate(-0.35);
  c.beginPath(); c.ellipse(0, 0, 112, 26, 0, 0, TAU); c.strokeStyle = rgba(th.neon, 0.5); c.lineWidth = 5; c.stroke();
  c.restore();
  // constellations
  c.strokeStyle = rgba(th.glow, 0.3); c.lineWidth = 1.2;
  for (let k = 0; k < 4; k++) {
    const x0 = 100 + rnd() * 450, y0 = 300 + rnd() * 1100;
    c.beginPath(); c.moveTo(x0, y0);
    let x = x0, y = y0;
    for (let i = 0; i < 5; i++) { x += (rnd() - 0.3) * 70; y += (rnd() - 0.5) * 70; c.lineTo(x, y); disc(c, x, y, 2.2, rgba(th.neon, 0.8)); c.moveTo(x, y); }
    c.stroke();
  }
}

/** Paints a table: artwork, lane floors, sockets, its name, rails and plastics. Returns the texture key. */
export function paintTable(scene: Phaser.Scene, def: TableDef, lang: 'tr' | 'en'): string {
  const key = 'pb-table', th = def.theme;
  make(scene, key, 720, TH, (c) => {
    const rnd = seeded(31);
    const bg = c.createLinearGradient(0, 0, 0, TH);
    bg.addColorStop(0, th.bg[0]); bg.addColorStop(0.55, th.bg[1]); bg.addColorStop(1, th.bg[0]);
    c.fillStyle = bg; c.fillRect(0, 0, 720, TH);
    for (let i = 0; i < 3500; i++) {
      c.fillStyle = rnd() < 0.5 ? 'rgba(255,255,255,0.035)' : 'rgba(0,0,0,0.12)';
      c.fillRect(rnd() * 720, rnd() * TH, 2, 2);
    }
    ({ city: artCity, ocean: artOcean, jungle: artJungle, forge: artForge, space: artSpace })[def.motif](c, th, rnd);
    // a halo and rings around the bumpers
    const bx = def.bumpers.reduce((s, b) => s + b[0], 0) / def.bumpers.length, by = def.bumpers.reduce((s, b) => s + b[1], 0) / def.bumpers.length;
    const halo = c.createRadialGradient(bx, by, 20, bx, by, 300);
    halo.addColorStop(0, rgba(th.glow, 0.28)); halo.addColorStop(1, rgba(th.glow, 0));
    c.fillStyle = halo; c.fillRect(bx - 300, by - 300, 600, 600);
    c.lineWidth = 2;
    for (let r = 70, k = 0; r < 240; r += 34, k++) { c.beginPath(); c.arc(bx, by, r, 0, TAU); c.strokeStyle = rgba(th.glow, 0.18 - k * 0.03); c.stroke(); }

    // lane floors: darker strips with a coloured edge
    const strip = (x: number, y: number, w: number, h: number) => {
      const g = c.createLinearGradient(x, 0, x + w, 0);
      g.addColorStop(0, 'rgba(0,0,0,0.5)'); g.addColorStop(0.5, 'rgba(0,0,0,0.28)'); g.addColorStop(1, 'rgba(0,0,0,0.5)');
      c.fillStyle = g; c.fillRect(x, y, w, h);
      c.strokeStyle = rgba(th.glow, 0.25); c.lineWidth = 1.5;
      c.beginPath(); c.moveTo(x + 6, y); c.lineTo(x + 6, y + h); c.moveTo(x + w - 6, y); c.lineTo(x + w - 6, y + h); c.stroke();
      for (let yy = y + 20; yy < y + h; yy += 40) { c.fillStyle = rgba(th.glow, 0.12); c.fillRect(x + w / 2 - 2, yy, 4, 16); }
    };
    if (def.orbitL) strip(30, ORBIT_TOP, ORBIT_L - 30, ORBIT_BOT - ORBIT_TOP + 60);
    if (def.orbitR) strip(ORBIT_R, ORBIT_TOP, 650 - ORBIT_R, ORBIT_BOT - ORBIT_TOP + 60);
    for (const r of def.ramps) strip(r.lane.x0, r.lane.top, r.lane.x1 - r.lane.x0, r.lane.bot - r.lane.top + 30);

    // the table's name across the middle
    const words = def.name[lang];
    const size = Math.min(76, Math.floor(380 / Math.max(...words.map((w) => w.length))));
    c.save();
    c.font = `${size}px ${TITLE_FONT}`;
    c.textAlign = 'center'; c.textBaseline = 'middle';
    c.translate(342, 1385 - ((words.length - 1) * size * 0.65)); c.rotate(-0.05);
    words.forEach((w, i) => {
      const y = i * size * 1.3;
      c.fillStyle = 'rgba(0,0,0,0.45)'; c.fillText(w, 6, y + 9);
      const lg = c.createLinearGradient(0, y - size / 2, 0, y + size / 2);
      lg.addColorStop(0, '#ffffff'); lg.addColorStop(0.45, th.accent); lg.addColorStop(1, th.glow);
      c.lineWidth = Math.max(6, size * 0.1); c.strokeStyle = '#0a0a12'; c.lineJoin = 'round'; c.strokeText(w, 0, y);
      c.fillStyle = lg; c.globalAlpha = 0.88; c.fillText(w, 0, y); c.globalAlpha = 1;
    });
    c.restore();

    // perspective grid over the lower playfield, fading in towards the flippers
    c.save();
    c.beginPath(); c.rect(30, 1480, 620, 420); c.clip();
    c.lineWidth = 1.5;
    for (let i = 1; i < 10; i++) {
      const f = i / 9, y = 1480 + Math.pow(f, 1.8) * 420;
      c.strokeStyle = rgba(th.glow, 0.03 + f * 0.1);
      c.beginPath(); c.moveTo(30, y); c.lineTo(650, y); c.stroke();
    }
    c.restore();
    // shooter lane
    c.fillStyle = 'rgba(0,0,0,0.45)'; c.fillRect(652, 330, 52, PLUNGER_Y - 300);
    for (let y = 400; y < PLUNGER_Y - 20; y += 60) { c.fillStyle = rgba(th.glow, 0.15); c.fillRect(676, y, 4, 24); }

    // sockets: lanes, inserts, holes, spinners, banks, guard track
    for (const x of LANES) {
      disc(c, x, LANE_Y + 4, 19, 'rgba(0,0,0,0.5)');
      c.beginPath(); c.arc(x, LANE_Y + 4, 19, 0, TAU); c.strokeStyle = rgba(th.glow, 0.4); c.lineWidth = 1.5; c.stroke();
    }
    for (const ins of insertsOf(def)) socket(c, ins.x, ins.y, ins.rot, th.glow);
    for (const [x, y] of PROGRESS) socket(c, x, y, 0, th.glow);
    for (const h of def.holes) {
      if (h.kind === 'vortex') {
        const r = h.pull ?? 90;
        const g = c.createRadialGradient(h.x, h.y, 4, h.x, h.y, r);
        g.addColorStop(0, 'rgba(0,0,0,0.85)'); g.addColorStop(0.6, rgba(th.glow, 0.18)); g.addColorStop(1, rgba(th.glow, 0));
        disc(c, h.x, h.y, r, g);
        c.beginPath(); c.arc(h.x, h.y, r, 0, TAU); c.strokeStyle = rgba(th.glow, 0.45); c.setLineDash([6, 8]); c.lineWidth = 2; c.stroke(); c.setLineDash([]);
      } else if (h.kind === 'wormhole') {
        const g = c.createRadialGradient(h.x, h.y, 2, h.x, h.y, 44);
        g.addColorStop(0, '#000000'); g.addColorStop(0.5, rgba(th.glow, 0.35)); g.addColorStop(1, rgba(th.glow, 0));
        disc(c, h.x, h.y, 44, g);
      } else {
        c.beginPath(); c.arc(h.x, h.y, 34, 0, TAU); c.strokeStyle = rgba(th.glow, 0.5); c.lineWidth = 3; c.stroke();
        disc(c, h.x, h.y, 30, 'rgba(0,0,0,0.35)');
        if (h.kind === 'cannon') {
          c.save(); c.beginPath(); c.arc(h.x, h.y, 30, 0, TAU); c.clip();
          for (let x = h.x - 40; x < h.x + 40; x += 14) { c.beginPath(); c.moveTo(x, h.y + 30); c.lineTo(x + 7, h.y + 30); c.lineTo(x + 27, h.y - 30); c.lineTo(x + 20, h.y - 30); c.closePath(); c.fillStyle = 'rgba(255,200,40,0.3)'; c.fill(); }
          c.restore();
          c.beginPath(); c.moveTo(h.x, h.y - 40); c.lineTo(h.x, h.y - 120); c.strokeStyle = rgba(th.glow, 0.3); c.setLineDash([4, 8]); c.lineWidth = 3; c.stroke(); c.setLineDash([]);
        }
      }
    }
    c.strokeStyle = '#9aa3ae'; c.lineWidth = 3;
    for (const sp of def.spinners) { c.beginPath(); c.moveTo(sp.x0, sp.y - 10); c.lineTo(sp.x0, sp.y + 10); c.moveTo(sp.x1, sp.y - 10); c.lineTo(sp.x1, sp.y + 10); c.stroke(); }
    for (const b of def.banks) {
      const pts = bankTargets(b);
      c.fillStyle = 'rgba(0,0,0,0.4)';
      if (b.vertical) c.fillRect(b.x - (b.face === 'L' ? 6 : 28), pts[0][1] - 28, 34, pts[pts.length - 1][1] - pts[0][1] + 56);
      else c.fillRect(pts[0][0] - 28, b.y - 10, pts[pts.length - 1][0] - pts[0][0] + 56, 30);
    }
    if (def.guard) {
      const g = def.guard;
      c.strokeStyle = rgba(th.glow, 0.25); c.lineWidth = 2; c.setLineDash([8, 8]);
      c.beginPath(); c.moveTo(g.cx - g.sweep - g.half, g.y); c.lineTo(g.cx + g.sweep + g.half, g.y); c.stroke();
      c.setLineDash([]);
    }

    // chrome rails
    const arch = archPoints();
    rail(c, [[706, PLUNGER_Y + 16], ...arch, [30, GUIDE_L[0][1]], [GUIDE_L[1][0], GUIDE_L[1][1]]], th.glow);
    rail(c, [[650, 470], [650, GUIDE_R[0][1]], [GUIDE_R[1][0], GUIDE_R[1][1]]], th.glow);
    rail(c, [[650, GUIDE_R[0][1]], [650, PLUNGER_Y + 16]], th.glow);
    rail(c, [[GATE[0][0], GATE[0][1]], [GATE[1][0], GATE[1][1]]], th.glow, 0.6);
    const posts: Pt[] = [];
    if (def.orbitL) { rail(c, [[ORBIT_L, ORBIT_TOP], [ORBIT_L, ORBIT_BOT]], th.glow); posts.push([ORBIT_L, ORBIT_TOP], [ORBIT_L, ORBIT_BOT]); }
    if (def.orbitR) { rail(c, [[ORBIT_R, ORBIT_TOP], [ORBIT_R, ORBIT_BOT]], th.glow); posts.push([ORBIT_R, ORBIT_TOP], [ORBIT_R, ORBIT_BOT]); }
    for (const r of def.ramps) {
      const l = r.lane, mid = (l.x0 + l.x1) / 2;
      rail(c, [[l.x0, l.bot], [l.x0, l.top], [mid, l.top - 26], [l.x1, l.top], [l.x1, l.bot]], th.glow);
      posts.push([l.x0, l.bot], [l.x1, l.bot]);
    }
    for (const b of def.banks) if (b.roof) rail(c, b.roof, th.glow, 0.8);
    for (const [x, y] of posts) post(c, x, y);
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
    const v = c.createLinearGradient(0, 0, 720, 0);
    v.addColorStop(0, 'rgba(0,0,0,0.35)'); v.addColorStop(0.15, 'rgba(0,0,0,0)'); v.addColorStop(0.85, 'rgba(0,0,0,0)'); v.addColorStop(1, 'rgba(0,0,0,0.35)');
    c.fillStyle = v; c.fillRect(0, 0, 720, TH);
  }, true);
  return key;
}

/** A table's ramps: clear plastic between chrome wire rails, drawn above the playfield. */
export function paintRamps(scene: Phaser.Scene, def: TableDef, paths: Pt[][]): string {
  const key = 'pb-ramps';
  make(scene, key, 720, TH, (c) => {
    paths.forEach((p, ri) => {
      const lane = def.ramps[ri].lane;
      const pathOf = (pts: Pt[]) => { c.beginPath(); pts.forEach(([x, y], i) => (i ? c.lineTo(x, y) : c.moveTo(x, y))); };
      const side = (k: number): Pt[] => p.map(([x, y], i) => {
        const [ax, ay] = p[Math.max(0, i - 1)], [bx, by] = p[Math.min(p.length - 1, i + 1)];
        const l = Math.hypot(bx - ax, by - ay) || 1;
        return [x - ((by - ay) / l) * k, y + ((bx - ax) / l) * k];
      });
      const start: Pt[] = [[(lane.x0 + lane.x1) / 2, lane.top + 75], ...p];
      c.lineJoin = 'round'; c.lineCap = 'round';
      c.save(); c.shadowColor = 'rgba(0,0,0,0.55)'; c.shadowBlur = 14; c.shadowOffsetX = 10; c.shadowOffsetY = 16;
      pathOf(start); c.strokeStyle = 'rgba(0,0,0,0.35)'; c.lineWidth = 50; c.stroke(); c.restore();
      pathOf(start); c.strokeStyle = rgba(def.theme.neon, 0.18); c.lineWidth = 46; c.stroke();
      pathOf(start); c.strokeStyle = 'rgba(255,255,255,0.12)'; c.lineWidth = 18; c.stroke();
      const L = side(-23), R = side(23);
      c.strokeStyle = 'rgba(220,235,255,0.55)'; c.lineWidth = 2;
      for (let i = 4; i < p.length - 2; i += 6) { c.beginPath(); c.moveTo(L[i][0], L[i][1]); c.lineTo(R[i][0], R[i][1]); c.stroke(); }
      for (const pts of [L, R]) {
        pathOf(pts); c.strokeStyle = '#2a2f38'; c.lineWidth = 7; c.stroke();
        pathOf(pts); c.strokeStyle = '#c9d1dc'; c.lineWidth = 4; c.stroke();
        pathOf(pts); c.strokeStyle = '#ffffff'; c.lineWidth = 1.5; c.stroke();
      }
      c.fillStyle = 'rgba(255,255,255,0.35)';
      for (const i of [6, 14, 22]) {
        if (i + 1 >= p.length) continue;
        const [x, y] = p[i], [nx, ny] = p[i + 1], a = Math.atan2(ny - y, nx - x);
        c.save(); c.translate(x, y); c.rotate(a + Math.PI / 2);
        c.beginPath(); c.moveTo(0, -9); c.lineTo(11, 5); c.lineTo(0, 0); c.lineTo(-11, 5); c.closePath(); c.fill();
        c.restore();
      }
    });
  }, true);
  return key;
}

export const APRON_Y = 1690;

/** The apron (y ≥ APRON_Y): covers the drain and the space under the inlanes. */
export function paintApron(scene: Phaser.Scene, th: Theme): string {
  const key = 'pb-apron', Y = APRON_Y;
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
    c.save(); c.shadowColor = '#ff3b2a'; c.shadowBlur = 14;
    c.beginPath(); c.moveTo(180, PIVOT_Y + 90); c.lineTo(500, PIVOT_Y + 90); c.strokeStyle = '#ff5a45'; c.lineWidth = 4; c.stroke(); c.restore();
  }, true);
  return key;
}

/** A card for the table picker: the table's colours, a few of its shapes and its name. */
export function paintCard(scene: Phaser.Scene, def: TableDef, i: number): string {
  const key = `pb-card-${i}`, th = def.theme;
  make(scene, key, 600, 150, (c) => {
    c.save(); c.shadowColor = 'rgba(0,0,0,0.6)'; c.shadowBlur = 12; c.shadowOffsetY = 5;
    c.beginPath(); round(c, 8, 6, 584, 134, 18); c.fillStyle = th.bg[1]; c.fill(); c.restore();
    c.save(); c.beginPath(); round(c, 8, 6, 584, 134, 18); c.clip();
    const g = c.createLinearGradient(0, 0, 600, 150);
    g.addColorStop(0, th.bg[0]); g.addColorStop(1, th.bg[1]);
    c.fillStyle = g; c.fillRect(0, 0, 600, 150);
    const rnd = seeded(i + 5);
    for (let k = 0; k < 60; k++) disc(c, rnd() * 600, rnd() * 150, rnd() * 1.6, 'rgba(255,255,255,0.4)');
    // a little table on the left
    c.save(); c.translate(70, 75);
    c.beginPath(); round(c, -38, -60, 76, 120, 30); c.fillStyle = 'rgba(0,0,0,0.35)'; c.fill();
    c.strokeStyle = th.neon; c.lineWidth = 2; c.stroke();
    for (const [x, y] of [[-14, -28], [14, -28], [0, -8]]) { disc(c, x, y, 9, css(th.bumper)); disc(c, x, y, 4, '#ffffff'); }
    c.strokeStyle = css(th.flipper); c.lineWidth = 5; c.lineCap = 'round';
    c.beginPath(); c.moveTo(-24, 38); c.lineTo(-6, 48); c.moveTo(24, 38); c.lineTo(6, 48); c.stroke();
    c.restore();
    const glow = c.createRadialGradient(480, 20, 10, 480, 20, 260);
    glow.addColorStop(0, rgba(th.glow, 0.35)); glow.addColorStop(1, rgba(th.glow, 0));
    c.fillStyle = glow; c.fillRect(0, 0, 600, 150);
    c.restore();
    c.beginPath(); round(c, 8, 6, 584, 134, 18); c.strokeStyle = rgba(th.glow, 0.9); c.lineWidth = 3; c.stroke();
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
