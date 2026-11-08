import Phaser from 'phaser';

// Table geometry (720 x 1280 world). Both halves are the same shape, so the online guest can see
// the host's table rotated by 180° with its own mallet at the bottom.
export const W = 720, H = 1280;
export const L = 40, R = 680, T = 140, B = 1236, MID = (T + B) / 2;
export const CR = 70;                          // rounded corner radius
export const GOAL_L = 240, GOAL_R = 480;       // goal mouth
export const POST_R = 9;
export const POCKET = 40;                      // depth of the goal pocket behind the line
export const PUCK_R = 28, MAL_R = 46, BIG_R = 64;

export const RED = 0xff4f5e, BLUE = 0x3ee6ff, GOLD = 0xffd23f, PINK = 0xff4fa3, VIOLET = 0x8b5cff;
export const POWER_COL = { big: 0x5dff7a, fast: 0xffa040, multi: 0xc77dff } as const;
export type PowerKind = keyof typeof POWER_COL;

export const css = (c: number): string => '#' + c.toString(16).padStart(6, '0');
const rgba = (c: number, a: number): string => `rgba(${(c >> 16) & 255},${(c >> 8) & 255},${c & 255},${a})`;
const mix = (c: number, k: number): number => {
  // k > 0 lightens towards white, k < 0 darkens towards black
  const ch = (v: number) => Math.round(k >= 0 ? v + (255 - v) * k : v * (1 + k));
  return (ch((c >> 16) & 255) << 16) | (ch((c >> 8) & 255) << 8) | ch(c & 255);
};

function paint(scene: Phaser.Scene, key: string, w: number, h: number, draw: (c: CanvasRenderingContext2D) => void): void {
  if (scene.textures.exists(key)) return;
  const tex = scene.textures.createCanvas(key, w, h);
  if (!tex) return;
  draw(tex.getContext());
  tex.refresh();
}

function rrect(c: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  c.beginPath();
  c.moveTo(x + r, y);
  c.arcTo(x + w, y, x + w, y + h, r);
  c.arcTo(x + w, y + h, x, y + h, r);
  c.arcTo(x, y + h, x, y, r);
  c.arcTo(x, y, x + w, y, r);
  c.closePath();
}

/** The table, painted once per colour layout: `bottom` is the colour of the player at the bottom. */
export function tableKey(scene: Phaser.Scene, bottom: number, top: number): string {
  const key = `ah-table-${bottom.toString(16)}-${top.toString(16)}`;
  paint(scene, key, W, H, (c) => {
    // backdrop
    const bg = c.createLinearGradient(0, 0, 0, H);
    bg.addColorStop(0, '#0b1132'); bg.addColorStop(0.5, '#070b22'); bg.addColorStop(1, '#0b1132');
    c.fillStyle = bg; c.fillRect(0, 0, W, H);
    const halo = c.createRadialGradient(W / 2, MID, 200, W / 2, MID, 760);
    halo.addColorStop(0, 'rgba(139,92,255,0.18)'); halo.addColorStop(1, 'rgba(139,92,255,0)');
    c.fillStyle = halo; c.fillRect(0, 0, W, H);

    // rail with a drop shadow and a metallic sweep
    c.save();
    c.shadowColor = 'rgba(0,0,0,0.7)'; c.shadowBlur = 34; c.shadowOffsetY = 10;
    rrect(c, L - 18, T - 18, R - L + 36, B - T + 36, CR + 18);
    const rail = c.createLinearGradient(L - 18, 0, R + 18, 0);
    rail.addColorStop(0, '#3b2a9c'); rail.addColorStop(0.12, '#8a6bff'); rail.addColorStop(0.5, '#2d1f7a');
    rail.addColorStop(0.88, '#8a6bff'); rail.addColorStop(1, '#3b2a9c');
    c.fillStyle = rail; c.fill();
    c.restore();
    rrect(c, L - 16, T - 16, R - L + 32, B - T + 32, CR + 16);
    c.strokeStyle = 'rgba(255,255,255,0.28)'; c.lineWidth = 2; c.stroke();
    // rail screws
    c.fillStyle = 'rgba(255,255,255,0.35)';
    for (const [x, y] of [[L - 8, MID - 300], [L - 8, MID + 300], [R + 8, MID - 300], [R + 8, MID + 300], [L - 8, MID], [R + 8, MID]]) {
      c.beginPath(); c.arc(x, y, 3, 0, Math.PI * 2); c.fill();
    }

    // playing surface
    c.save();
    rrect(c, L, T, R - L, B - T, CR);
    c.clip();
    const surf = c.createLinearGradient(0, T, 0, B);
    surf.addColorStop(0, '#13205a'); surf.addColorStop(0.5, '#0c1640'); surf.addColorStop(1, '#13205a');
    c.fillStyle = surf; c.fillRect(L, T, R - L, B - T);
    // each half faintly tinted in its owner's colour
    const tint = (col: number, y0: number, y1: number) => {
      const g = c.createLinearGradient(0, y0, 0, y1);
      g.addColorStop(0, rgba(col, 0.1)); g.addColorStop(1, rgba(col, 0));
      c.fillStyle = g; c.fillRect(L, Math.min(y0, y1), R - L, Math.abs(y1 - y0));
    };
    tint(top, T, MID - 120);
    tint(bottom, B, MID + 120);
    // air holes
    for (let y = T + 18; y < B; y += 30) {
      for (let x = L + 18 + ((y - T) / 30 % 2) * 15; x < R; x += 30) {
        c.fillStyle = 'rgba(0,0,12,0.55)'; c.beginPath(); c.arc(x, y, 2.2, 0, Math.PI * 2); c.fill();
        c.fillStyle = 'rgba(170,200,255,0.12)'; c.beginPath(); c.arc(x + 0.6, y + 1, 1.2, 0, Math.PI * 2); c.fill();
      }
    }
    // markings (glowing paint)
    const glow = (col: number, a: number, wid: number, fn: () => void, blur = 16) => {
      c.save(); c.shadowColor = rgba(col, 0.9); c.shadowBlur = blur;
      c.strokeStyle = rgba(col, a); c.lineWidth = wid; fn(); c.restore();
    };
    // goal creases
    for (const [gy, col, a0, a1] of [[T, top, 0, Math.PI], [B, bottom, Math.PI, Math.PI * 2]] as const) {
      c.fillStyle = rgba(col, 0.09); c.beginPath(); c.arc(W / 2, gy, 150, a0, a1); c.fill();
      glow(col, 0.75, 5, () => { c.beginPath(); c.arc(W / 2, gy, 150, a0, a1); c.stroke(); });
    }
    // blue-line style quarter lines and face-off rings
    for (const [y, col] of [[MID - 250, top], [MID + 250, bottom]] as const) {
      glow(col, 0.32, 4, () => { c.beginPath(); c.moveTo(L, y); c.lineTo(R, y); c.stroke(); }, 8);
      for (const x of [190, 530]) {
        glow(col, 0.35, 3, () => { c.beginPath(); c.arc(x, y + (y < MID ? -110 : 110), 34, 0, Math.PI * 2); c.stroke(); }, 6);
        c.fillStyle = rgba(col, 0.5); c.beginPath(); c.arc(x, y + (y < MID ? -110 : 110), 6, 0, Math.PI * 2); c.fill();
      }
    }
    // centre line, circle and spot
    glow(PINK, 0.8, 6, () => { c.beginPath(); c.moveTo(L, MID); c.lineTo(R, MID); c.stroke(); });
    c.fillStyle = rgba(PINK, 0.07); c.beginPath(); c.arc(W / 2, MID, 95, 0, Math.PI * 2); c.fill();
    glow(PINK, 0.8, 5, () => { c.beginPath(); c.arc(W / 2, MID, 95, 0, Math.PI * 2); c.stroke(); });
    c.fillStyle = rgba(PINK, 0.95); c.beginPath(); c.arc(W / 2, MID, 10, 0, Math.PI * 2); c.fill();
    // gloss: a soft light pool and a diagonal sheen
    const pool = c.createRadialGradient(W * 0.32, T + 260, 20, W * 0.32, T + 260, 560);
    pool.addColorStop(0, 'rgba(255,255,255,0.09)'); pool.addColorStop(1, 'rgba(255,255,255,0)');
    c.fillStyle = pool; c.fillRect(L, T, R - L, B - T);
    const sheen = c.createLinearGradient(L, T, R, B);
    sheen.addColorStop(0.36, 'rgba(255,255,255,0)'); sheen.addColorStop(0.43, 'rgba(255,255,255,0.06)');
    sheen.addColorStop(0.47, 'rgba(255,255,255,0.015)'); sheen.addColorStop(0.5, 'rgba(255,255,255,0.05)');
    sheen.addColorStop(0.56, 'rgba(255,255,255,0)');
    c.fillStyle = sheen; c.fillRect(L, T, R - L, B - T);
    // inner shadow along the rail
    rrect(c, L, T, R - L, B - T, CR);
    c.strokeStyle = 'rgba(0,0,10,0.55)'; c.lineWidth = 18; c.stroke();
    c.restore();

    // goal pockets cut through the rail, glowing in the defender's colour
    for (const [y0, col, dir] of [[T, top, -1], [B, bottom, 1]] as const) {
      const y1 = y0 + dir * POCKET;
      c.fillStyle = '#02030a'; c.fillRect(GOAL_L, Math.min(y0, y1) - (dir < 0 ? 2 : 0), GOAL_R - GOAL_L, POCKET + 2);
      const g = c.createLinearGradient(0, y0, 0, y1);
      g.addColorStop(0, rgba(col, 0.6)); g.addColorStop(1, rgba(col, 0));
      c.fillStyle = g; c.fillRect(GOAL_L, Math.min(y0, y1), GOAL_R - GOAL_L, POCKET);
      glow(col, 0.95, 4, () => { c.beginPath(); c.moveTo(GOAL_L, y0); c.lineTo(GOAL_R, y0); c.stroke(); }, 22);
      for (const x of [GOAL_L, GOAL_R]) {
        c.save(); c.shadowColor = rgba(col, 1); c.shadowBlur = 18;
        c.fillStyle = css(mix(col, 0.35)); c.beginPath(); c.arc(x, y0, POST_R, 0, Math.PI * 2); c.fill();
        c.restore();
        c.fillStyle = 'rgba(255,255,255,0.7)'; c.beginPath(); c.arc(x - 2, y0 - 2, 3, 0, Math.PI * 2); c.fill();
      }
    }
  });
  return key;
}

/** Puck, mallets, glow dot and power-up icons (shared by the menu decor and the game). */
export function makeHockeyTextures(scene: Phaser.Scene): void {
  paint(scene, 'ah-dot', 32, 32, (c) => {
    const g = c.createRadialGradient(16, 16, 0, 16, 16, 16);
    g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.35, 'rgba(255,255,255,0.6)'); g.addColorStop(1, 'rgba(255,255,255,0)');
    c.fillStyle = g; c.fillRect(0, 0, 32, 32);
  });
  paint(scene, 'ah-glow', 128, 128, (c) => {
    const g = c.createRadialGradient(64, 64, 0, 64, 64, 64);
    g.addColorStop(0, 'rgba(255,255,255,0.55)'); g.addColorStop(0.45, 'rgba(255,255,255,0.18)'); g.addColorStop(1, 'rgba(255,255,255,0)');
    c.fillStyle = g; c.fillRect(0, 0, 128, 128);
  });
  paint(scene, 'ah-puck', 88, 88, (c) => {
    const x = 44, y = 44, r = PUCK_R;
    c.save(); c.shadowColor = 'rgba(0,0,0,0.6)'; c.shadowBlur = 10; c.shadowOffsetX = 3; c.shadowOffsetY = 6;
    c.fillStyle = '#101018'; c.beginPath(); c.arc(x, y, r, 0, Math.PI * 2); c.fill();
    c.restore();
    const body = c.createRadialGradient(x - 8, y - 10, 2, x, y, r);
    body.addColorStop(0, '#4a4f6a'); body.addColorStop(0.6, '#1d1f2c'); body.addColorStop(1, '#0c0c14');
    c.fillStyle = body; c.beginPath(); c.arc(x, y, r, 0, Math.PI * 2); c.fill();
    c.strokeStyle = css(GOLD); c.lineWidth = 5; c.beginPath(); c.arc(x, y, r - 3, 0, Math.PI * 2); c.stroke();
    c.strokeStyle = rgba(GOLD, 0.45); c.lineWidth = 2; c.beginPath(); c.arc(x, y, r - 12, 0, Math.PI * 2); c.stroke();
    const spec = c.createRadialGradient(x - 9, y - 11, 0, x - 9, y - 11, 13);
    spec.addColorStop(0, 'rgba(255,255,255,0.55)'); spec.addColorStop(1, 'rgba(255,255,255,0)');
    c.fillStyle = spec; c.beginPath(); c.arc(x, y, r - 2, 0, Math.PI * 2); c.fill();
  });
  const mallet = (key: string, col: number) => paint(scene, key, 140, 140, (c) => {
    const x = 70, y = 70, r = MAL_R;
    const halo = c.createRadialGradient(x, y, r - 6, x, y, 68);
    halo.addColorStop(0, rgba(col, 0.45)); halo.addColorStop(1, rgba(col, 0));
    c.fillStyle = halo; c.fillRect(0, 0, 140, 140);
    c.save(); c.shadowColor = 'rgba(0,0,0,0.65)'; c.shadowBlur = 14; c.shadowOffsetX = 4; c.shadowOffsetY = 8;
    c.fillStyle = css(mix(col, -0.55)); c.beginPath(); c.arc(x, y, r, 0, Math.PI * 2); c.fill();
    c.restore();
    const base = c.createRadialGradient(x - 14, y - 16, 4, x, y, r);
    base.addColorStop(0, css(mix(col, 0.45))); base.addColorStop(0.55, css(col)); base.addColorStop(1, css(mix(col, -0.45)));
    c.fillStyle = base; c.beginPath(); c.arc(x, y, r - 4, 0, Math.PI * 2); c.fill();
    c.strokeStyle = 'rgba(0,0,0,0.28)'; c.lineWidth = 3; c.beginPath(); c.arc(x, y, r - 15, 0, Math.PI * 2); c.stroke();
    // the handle knob
    c.save(); c.shadowColor = 'rgba(0,0,0,0.5)'; c.shadowBlur = 8; c.shadowOffsetY = 4;
    const knob = c.createRadialGradient(x - 6, y - 8, 2, x, y, 21);
    knob.addColorStop(0, css(mix(col, 0.6))); knob.addColorStop(0.6, css(mix(col, 0.05))); knob.addColorStop(1, css(mix(col, -0.4)));
    c.fillStyle = knob; c.beginPath(); c.arc(x, y, 21, 0, Math.PI * 2); c.fill();
    c.restore();
    const spec = c.createRadialGradient(x - 16, y - 20, 0, x - 16, y - 20, 22);
    spec.addColorStop(0, 'rgba(255,255,255,0.6)'); spec.addColorStop(1, 'rgba(255,255,255,0)');
    c.fillStyle = spec; c.beginPath(); c.arc(x, y, r - 4, 0, Math.PI * 2); c.fill();
    c.strokeStyle = 'rgba(255,255,255,0.35)'; c.lineWidth = 2; c.beginPath(); c.arc(x, y, r - 4, Math.PI * 1.05, Math.PI * 1.6); c.stroke();
  });
  mallet('ah-mallet-red', RED);
  mallet('ah-mallet-blue', BLUE);

  const icon = (kind: PowerKind, symbol: (c: CanvasRenderingContext2D) => void) => paint(scene, `ah-pw-${kind}`, 104, 104, (c) => {
    const col = POWER_COL[kind];
    const halo = c.createRadialGradient(52, 52, 20, 52, 52, 52);
    halo.addColorStop(0, rgba(col, 0.55)); halo.addColorStop(1, rgba(col, 0));
    c.fillStyle = halo; c.fillRect(0, 0, 104, 104);
    const g = c.createRadialGradient(44, 40, 4, 52, 52, 34);
    g.addColorStop(0, css(mix(col, 0.5))); g.addColorStop(0.7, css(col)); g.addColorStop(1, css(mix(col, -0.45)));
    c.fillStyle = g; c.beginPath(); c.arc(52, 52, 34, 0, Math.PI * 2); c.fill();
    c.strokeStyle = 'rgba(255,255,255,0.9)'; c.lineWidth = 3; c.beginPath(); c.arc(52, 52, 34, 0, Math.PI * 2); c.stroke();
    c.fillStyle = '#ffffff'; c.strokeStyle = '#ffffff'; c.lineCap = 'round'; c.lineJoin = 'round';
    c.save(); c.shadowColor = 'rgba(0,0,0,0.45)'; c.shadowBlur = 4; c.shadowOffsetY = 2;
    symbol(c);
    c.restore();
  });
  icon('big', (c) => {
    // a mallet with outward arrows
    c.lineWidth = 4; c.beginPath(); c.arc(52, 52, 10, 0, Math.PI * 2); c.fill();
    for (let i = 0; i < 4; i++) {
      const a = Math.PI / 4 + (i * Math.PI) / 2, cx = Math.cos(a), cy = Math.sin(a);
      c.beginPath(); c.moveTo(52 + cx * 15, 52 + cy * 15); c.lineTo(52 + cx * 25, 52 + cy * 25); c.stroke();
      c.beginPath(); c.moveTo(52 + cx * 27, 52 + cy * 27); c.lineTo(52 + cx * 18 - cy * 6, 52 + cy * 18 + cx * 6); c.lineTo(52 + cx * 18 + cy * 6, 52 + cy * 18 - cx * 6); c.closePath(); c.fill();
    }
  });
  icon('fast', (c) => {
    c.beginPath(); c.moveTo(58, 28); c.lineTo(38, 56); c.lineTo(51, 56); c.lineTo(45, 77); c.lineTo(67, 46); c.lineTo(54, 46); c.closePath(); c.fill();
  });
  icon('multi', (c) => {
    for (const [x, y] of [[43, 46], [61, 60]]) {
      c.fillStyle = '#1a1a26'; c.beginPath(); c.arc(x, y, 13, 0, Math.PI * 2); c.fill();
      c.lineWidth = 4; c.strokeStyle = '#ffffff'; c.beginPath(); c.arc(x, y, 12, 0, Math.PI * 2); c.stroke();
    }
  });
}
