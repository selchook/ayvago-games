import Phaser from 'phaser';
import type { Theme } from './levels';
import { archPoints, GUIDE_L, GUIDE_R, PLUNGER_Y, SLING_L, SLING_R, LANES, LANE_Y } from './table';

/**
 * Painted art for Pinball. Small parts are drawn once in grey and tinted with the level's theme;
 * the playfield and the apron are painted per theme into two alternating slots, so a level change
 * can cross-fade from the old table to the new one.
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
}

// ------------------------------------------------------------------ playfield and apron

const SLOTS = ['a', 'b'];

/** Paints the playfield for a theme into slot 0 or 1; returns the texture key. */
export function paintTable(scene: Phaser.Scene, th: Theme, slot: number): string {
  const key = `pb-table-${SLOTS[slot]}`;
  make(scene, key, 720, 1280, (c) => {
    const rnd = seeded(31);
    const bg = c.createLinearGradient(0, 0, 0, 1280);
    bg.addColorStop(0, th.bg[0]); bg.addColorStop(1, th.bg[1]);
    c.fillStyle = bg; c.fillRect(0, 0, 720, 1280);
    // a soft light over the bumpers
    const halo = c.createRadialGradient(340, 440, 20, 340, 440, 460);
    halo.addColorStop(0, rgba(th.glow, 0.28)); halo.addColorStop(1, rgba(th.glow, 0));
    c.fillStyle = halo; c.fillRect(0, 0, 720, 1280);
    // rings
    c.lineWidth = 2;
    for (let r = 60, k = 0; r < 430; r += 36, k++) {
      c.beginPath(); c.arc(340, 450, r, 0, TAU); c.strokeStyle = rgba(th.glow, 0.16 - k * 0.01); c.stroke();
    }
    // perspective grid over the lower playfield, fading in towards the flippers
    c.save();
    c.beginPath(); c.rect(30, 560, 620, 520); c.clip();
    c.lineWidth = 1.5;
    for (let i = 1; i < 12; i++) {
      const f = i / 11, y = 560 + Math.pow(f, 1.8) * 520;
      c.strokeStyle = rgba(th.glow, 0.03 + f * 0.12);
      c.beginPath(); c.moveTo(30, y); c.lineTo(650, y); c.stroke();
    }
    const vg = c.createLinearGradient(0, 560, 0, 1080);
    vg.addColorStop(0, rgba(th.glow, 0)); vg.addColorStop(1, rgba(th.glow, 0.16));
    c.strokeStyle = vg;
    for (let i = -9; i <= 9; i++) {
      c.beginPath(); c.moveTo(340 + i * 14, 560); c.lineTo(340 + i * 90, 1080); c.stroke();
    }
    c.restore();
    // stars
    for (let i = 0; i < 90; i++) {
      const x = 40 + rnd() * 600, y = 110 + rnd() * 820, r = rnd() < 0.85 ? 1 : 1.8;
      disc(c, x, y, r, `rgba(255,255,255,${(0.25 + rnd() * 0.5).toFixed(2)})`);
    }
    // shooter lane
    c.fillStyle = 'rgba(0,0,0,0.4)'; c.fillRect(652, 330, 52, PLUNGER_Y - 300);
    // lane lamps' wells
    for (const x of LANES) {
      disc(c, x, LANE_Y + 4, 19, 'rgba(0,0,0,0.45)');
      c.beginPath(); c.arc(x, LANE_Y + 4, 19, 0, TAU); c.strokeStyle = rgba(th.glow, 0.35); c.lineWidth = 1.5; c.stroke();
    }

    // neon walls: a wide glow, then the bright core
    const arch = archPoints();
    const lines: [number, number][][] = [
      [[706, PLUNGER_Y + 16], ...arch, [30, GUIDE_L[0][1]], [GUIDE_L[1][0], GUIDE_L[1][1]]],
      [[650, 470], [650, GUIDE_R[0][1]], [GUIDE_R[1][0], GUIDE_R[1][1]]],
      [[650, GUIDE_R[0][1]], [650, PLUNGER_Y + 16]],
    ];
    const path = (pts: [number, number][]) => { c.beginPath(); pts.forEach(([x, y], i) => (i ? c.lineTo(x, y) : c.moveTo(x, y))); };
    c.lineJoin = 'round'; c.lineCap = 'round';
    for (const pts of lines) {
      c.save(); c.shadowColor = th.glow; c.shadowBlur = 24;
      path(pts); c.strokeStyle = rgba(th.glow, 0.55); c.lineWidth = 14; c.stroke();
      c.restore();
      c.save(); c.shadowColor = th.glow; c.shadowBlur = 10;
      path(pts); c.strokeStyle = th.neon; c.lineWidth = 7; c.stroke();
      c.restore();
      path(pts); c.strokeStyle = '#ffffff'; c.lineWidth = 2.5; c.stroke();
    }
    // rollover lane posts
    for (let i = 0; i <= LANES.length; i++) {
      const x = LANES[0] - 40 + i * 80;
      c.save(); c.shadowColor = th.glow; c.shadowBlur = 12;
      c.beginPath(); c.moveTo(x, LANE_Y - 35); c.lineTo(x, LANE_Y + 30);
      c.strokeStyle = th.neon; c.lineWidth = 13; c.stroke(); c.restore();
      c.beginPath(); c.moveTo(x - 2, LANE_Y - 33); c.lineTo(x - 2, LANE_Y + 28); c.strokeStyle = 'rgba(255,255,255,0.8)'; c.lineWidth = 3; c.stroke();
    }
    // slingshot bodies: glass triangles
    for (const s of [SLING_L, SLING_R]) {
      const tri = () => { c.beginPath(); c.moveTo(s.a[0], s.a[1]); c.lineTo(s.b[0], s.b[1]); c.lineTo(s.c[0], s.c[1]); c.closePath(); };
      const g = c.createLinearGradient(s.b[0], s.a[1], s.c[0], s.c[1]);
      g.addColorStop(0, rgba(th.glow, 0.55)); g.addColorStop(1, rgba(th.bg[0], 0.6));
      tri(); c.fillStyle = g; c.fill();
      c.save(); c.shadowColor = th.glow; c.shadowBlur = 12;
      tri(); c.strokeStyle = th.neon; c.lineWidth = 5; c.stroke(); c.restore();
    }
    // vignette
    const v = c.createRadialGradient(360, 560, 300, 360, 640, 900);
    v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(1, 'rgba(0,0,0,0.55)');
    c.fillStyle = v; c.fillRect(0, 0, 720, 1280);
  }, true);
  return key;
}

/** The apron (y ≥ 880): covers the drain, holds the goal panel between the two buttons. */
export function paintApron(scene: Phaser.Scene, th: Theme, slot: number): string {
  const key = `pb-apron-${SLOTS[slot]}`, Y = 880;
  make(scene, key, 720, 400, (c) => {
    c.translate(0, -Y);
    const shape = () => {
      c.beginPath();
      const pts: [number, number][] = [
        [0, GUIDE_L[0][1] - 10], [30, GUIDE_L[0][1]], [GUIDE_L[1][0], GUIDE_L[1][1]], [176, 1040], [176, 1140], [504, 1140], [504, 1040],
        [GUIDE_R[1][0], GUIDE_R[1][1]], [650, GUIDE_R[0][1]], [650, PLUNGER_Y + 20], [720, PLUNGER_Y + 20], [720, 1280], [0, 1280],
      ];
      pts.forEach(([x, y], i) => (i ? c.lineTo(x, y) : c.moveTo(x, y)));
      c.closePath();
    };
    const g = c.createLinearGradient(0, 900, 0, 1280);
    g.addColorStop(0, '#1b1636'); g.addColorStop(1, '#09071a');
    shape(); c.fillStyle = g; c.fill();
    const tint = c.createLinearGradient(0, 900, 0, 1280);
    tint.addColorStop(0, rgba(th.glow, 0.16)); tint.addColorStop(1, rgba(th.glow, 0.04));
    shape(); c.fillStyle = tint; c.fill();
    // fine diagonal texture
    c.save(); shape(); c.clip();
    c.strokeStyle = 'rgba(255,255,255,0.03)'; c.lineWidth = 2;
    for (let x = -400; x < 720; x += 14) { c.beginPath(); c.moveTo(x, 1280); c.lineTo(x + 400, 880); c.stroke(); }
    c.restore();
    // drain lip
    c.save(); c.shadowColor = '#ff3b2a'; c.shadowBlur = 14;
    c.beginPath(); c.moveTo(180, 1140); c.lineTo(500, 1140); c.strokeStyle = '#ff5a45'; c.lineWidth = 4; c.stroke(); c.restore();
    c.strokeStyle = rgba(th.glow, 0.55); c.lineWidth = 3;
    c.beginPath(); c.moveTo(176, 1040); c.lineTo(176, 1140); c.moveTo(504, 1040); c.lineTo(504, 1140); c.stroke();
    // goal panel: glass
    c.save(); c.shadowColor = 'rgba(0,0,0,0.6)'; c.shadowBlur = 12; c.shadowOffsetY = 4;
    c.beginPath(); round(c, 188, 1150, 344, 124, 16); c.fillStyle = 'rgba(5,4,16,0.75)'; c.fill(); c.restore();
    const gl = c.createLinearGradient(0, 1150, 0, 1274);
    gl.addColorStop(0, 'rgba(255,255,255,0.16)'); gl.addColorStop(0.3, 'rgba(255,255,255,0.03)'); gl.addColorStop(1, rgba(th.glow, 0.08));
    c.beginPath(); round(c, 188, 1150, 344, 124, 16); c.fillStyle = gl; c.fill();
    c.save(); c.shadowColor = th.glow; c.shadowBlur = 8;
    c.strokeStyle = rgba(th.glow, 0.8); c.lineWidth = 2; c.stroke(); c.restore();
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
