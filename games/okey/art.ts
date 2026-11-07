import Phaser from 'phaser';
import { FALSE_JOKER, type Tile } from './logic';

/** Painted textures for Okey: the felt table, ivory tiles, the wooden rack, glows. */

type Ctx = CanvasRenderingContext2D;

export const TILE_W = 62;
export const TILE_H = 86;
/** Number colours: red, yellow, blue, black. */
export const NUM_COLORS = ['#d7263d', '#e8a317', '#1f6fd1', '#1d1d24'];

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

/** A green felt table with a wooden rim and a soft spotlight. */
export function makeTable(scene: Phaser.Scene, w: number, h: number): string {
  return make(scene, 'ok-table', w, h, (c) => {
    c.fillStyle = '#3a2416'; c.fillRect(0, 0, w, h);
    const wood = c.createLinearGradient(0, 0, 0, h);
    wood.addColorStop(0, '#6b4226'); wood.addColorStop(0.5, '#4a2d19'); wood.addColorStop(1, '#2e1b0f');
    c.fillStyle = wood; c.fillRect(0, 0, w, h);
    const rnd = seeded(4);
    c.strokeStyle = 'rgba(0,0,0,0.12)'; c.lineWidth = 2;
    for (let y = 4; y < h; y += 9) { c.beginPath(); c.moveTo(0, y + rnd() * 3); c.bezierCurveTo(w * 0.3, y + rnd() * 8, w * 0.6, y - rnd() * 8, w, y + rnd() * 3); c.stroke(); }
    const m = 22;
    rr(c, m, m, w - m * 2, h - m * 2, 46);
    const felt = c.createRadialGradient(w / 2, h * 0.42, 60, w / 2, h / 2, w * 0.65);
    felt.addColorStop(0, '#1f8a55'); felt.addColorStop(0.6, '#136a40'); felt.addColorStop(1, '#0a4227');
    c.fillStyle = felt; c.fill();
    c.save(); rr(c, m, m, w - m * 2, h - m * 2, 46); c.clip();
    for (let i = 0; i < 2600; i++) {
      c.fillStyle = rnd() < 0.5 ? 'rgba(255,255,255,0.025)' : 'rgba(0,0,0,0.05)';
      c.fillRect(m + rnd() * (w - m * 2), m + rnd() * (h - m * 2), 2, 2);
    }
    c.shadowColor = 'rgba(0,0,0,0.6)'; c.shadowBlur = 30;
    c.strokeStyle = 'rgba(0,0,0,0.6)'; c.lineWidth = 20; rr(c, m - 10, m - 10, w - m * 2 + 20, h - m * 2 + 20, 56); c.stroke();
    c.restore();
    c.strokeStyle = 'rgba(255,220,150,0.35)'; c.lineWidth = 2; rr(c, m, m, w - m * 2, h - m * 2, 46); c.stroke();
    // a faint ornament in the middle
    c.strokeStyle = 'rgba(255,255,255,0.06)'; c.lineWidth = 3;
    c.beginPath(); c.ellipse(w / 2, h * 0.43, 210, 120, 0, 0, Math.PI * 2); c.stroke();
    c.beginPath(); c.ellipse(w / 2, h * 0.43, 190, 104, 0, 0, Math.PI * 2); c.stroke();
  });
}

/** The player's wooden rack: two shelves. */
export function makeRack(scene: Phaser.Scene, w: number, h: number): string {
  return make(scene, 'ok-rack', w + 30, h + 30, (c) => {
    const x = 15, y = 10;
    c.save(); c.shadowColor = 'rgba(0,0,0,0.55)'; c.shadowBlur = 18; c.shadowOffsetY = 8;
    rr(c, x, y, w, h, 18);
    const g = c.createLinearGradient(0, y, 0, y + h);
    g.addColorStop(0, '#c98b4f'); g.addColorStop(1, '#7b4a22');
    c.fillStyle = g; c.fill(); c.restore();
    const rnd = seeded(9);
    c.save(); rr(c, x, y, w, h, 18); c.clip();
    c.strokeStyle = 'rgba(70,35,10,0.25)'; c.lineWidth = 2;
    for (let yy = y; yy < y + h; yy += 6) { c.beginPath(); c.moveTo(x, yy + rnd() * 2); c.bezierCurveTo(x + w * 0.4, yy + rnd() * 5, x + w * 0.7, yy - rnd() * 5, x + w, yy + rnd() * 2); c.stroke(); }
    c.restore();
    // two shelves: a darker groove under each row
    for (const sy of [h * 0.47, h - 14]) {
      const lip = c.createLinearGradient(0, y + sy - 10, 0, y + sy + 8);
      lip.addColorStop(0, 'rgba(60,30,10,0.0)'); lip.addColorStop(0.5, 'rgba(60,30,10,0.7)'); lip.addColorStop(1, 'rgba(255,220,170,0.35)');
      c.fillStyle = lip; c.fillRect(x + 10, y + sy - 10, w - 20, 18);
    }
    c.strokeStyle = 'rgba(255,230,190,0.5)'; c.lineWidth = 2; rr(c, x + 1, y + 1, w - 2, h - 2, 17); c.stroke();
  });
}

function tileBase(c: Ctx, w: number, h: number, pad: number, face: boolean): void {
  c.save(); c.shadowColor = 'rgba(0,0,0,0.45)'; c.shadowBlur = 6; c.shadowOffsetY = 4;
  rr(c, pad, pad, w, h, 9);
  c.fillStyle = face ? '#efe6d2' : '#d8c7a4'; c.fill(); c.restore();
  // the side of the tile
  rr(c, pad, pad + h - 9, w, 9, 6); c.fillStyle = face ? '#cbbd9d' : '#b49c70'; c.fill();
  const g = c.createLinearGradient(0, pad, 0, pad + h - 8);
  g.addColorStop(0, face ? '#fffaf0' : '#efe1c2'); g.addColorStop(1, face ? '#ece2cb' : '#d4c19b');
  rr(c, pad, pad, w, h - 8, 9); c.fillStyle = g; c.fill();
  c.strokeStyle = 'rgba(80,60,30,0.35)'; c.lineWidth = 1.5; rr(c, pad + 0.5, pad + 0.5, w - 1, h - 1, 9); c.stroke();
}

/** One texture per tile face ("ok-t-<color>-<num>", "ok-t-joker") and a back ("ok-t-back"). */
export function makeTiles(scene: Phaser.Scene, font: string): void {
  const pad = 6, w = TILE_W, h = TILE_H;
  for (let col = 0; col < 4; col++) for (let n = 1; n <= 13; n++) {
    make(scene, `ok-t-${col}-${n}`, w + pad * 2, h + pad * 2, (c) => {
      tileBase(c, w, h, pad, true);
      c.fillStyle = NUM_COLORS[col];
      c.font = `700 ${n >= 10 ? 36 : 42}px ${font}`;
      c.textAlign = 'center'; c.textBaseline = 'middle';
      c.fillText(String(n), pad + w / 2, pad + h * 0.4);
      // the little circle under the number, as on real okey tiles
      c.beginPath(); c.arc(pad + w / 2, pad + h * 0.72, 6.5, 0, Math.PI * 2); c.fill();
      c.fillStyle = 'rgba(255,255,255,0.45)'; c.beginPath(); c.arc(pad + w / 2 - 2, pad + h * 0.72 - 2, 2, 0, Math.PI * 2); c.fill();
    });
  }
  make(scene, 'ok-t-joker', w + pad * 2, h + pad * 2, (c) => {
    tileBase(c, w, h, pad, true);
    // a star for the false joker
    c.fillStyle = '#2a7a3d';
    c.beginPath();
    for (let i = 0; i < 10; i++) {
      const a = -Math.PI / 2 + (i / 10) * Math.PI * 2, r = i % 2 ? 9 : 22;
      const px = pad + w / 2 + Math.cos(a) * r, py = pad + h * 0.45 + Math.sin(a) * r;
      if (i) c.lineTo(px, py); else c.moveTo(px, py);
    }
    c.closePath(); c.fill();
  });
  make(scene, 'ok-t-back', w + pad * 2, h + pad * 2, (c) => {
    tileBase(c, w, h, pad, false);
    c.strokeStyle = 'rgba(120,80,30,0.45)'; c.lineWidth = 3;
    rr(c, pad + 10, pad + 10, w - 20, h - 28, 6); c.stroke();
  });
  // soft glow and a ring
  make(scene, 'ok-glow', 128, 128, (c) => {
    const g = c.createRadialGradient(64, 64, 0, 64, 64, 64);
    g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.3, 'rgba(255,255,255,0.45)'); g.addColorStop(1, 'rgba(255,255,255,0)');
    c.fillStyle = g; c.fillRect(0, 0, 128, 128);
  });
  make(scene, 'ok-ring', 128, 128, (c) => {
    c.strokeStyle = '#ffffff'; c.lineWidth = 6;
    c.beginPath(); c.arc(64, 64, 56, 0, Math.PI * 2); c.stroke();
  });
}

export function tileKey(t: Tile): string {
  return t.num === FALSE_JOKER ? 'ok-t-joker' : `ok-t-${t.color}-${t.num}`;
}
