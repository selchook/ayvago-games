import Phaser from 'phaser';

/**
 * Painted textures for Solitaire: the felt table, crisp card faces sized 1:1 for the 720-wide
 * world, a classic lattice back, empty-slot marks, a soft card shadow and glow rings. Drawn once
 * on canvases and cached by key, so the menu decor and every round share them.
 */

type Ctx = CanvasRenderingContext2D;

export const CW = 96;
export const CH = 136;
const R = 10;
/** Extra canvas around a card for the shadow and glow textures. */
export const PAD = 22;

const TITLE_FONT = 'Fredoka, sans-serif';
const RED = '#cf2338';
const BLACK = '#1d2433';
export const RANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];

export const faceKey = (suit: number, rank: number): string => `sol-c-${suit}-${rank}`;
export const BACK = 'sol-back';
export const SHADOW = 'sol-shadow';
export const GLOW = 'sol-glow';
export const SEL = 'sol-sel';
export const FELT = 'sol-felt';

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

// ---------- suit symbols (paths, so no font is needed) ----------

/** Fills a suit symbol of height s centred on (x, y). 0 clubs, 1 diamonds, 2 hearts, 3 spades. */
export function suitPath(c: Ctx, suit: number, x: number, y: number, s: number): void {
  c.beginPath();
  if (suit === 2) {
    c.moveTo(x, y + s * 0.46);
    c.bezierCurveTo(x - s * 0.12, y + s * 0.3, x - s * 0.56, y + s * 0.06, x - s * 0.52, y - s * 0.2);
    c.bezierCurveTo(x - s * 0.48, y - s * 0.52, x - s * 0.06, y - s * 0.52, x, y - s * 0.22);
    c.bezierCurveTo(x + s * 0.06, y - s * 0.52, x + s * 0.48, y - s * 0.52, x + s * 0.52, y - s * 0.2);
    c.bezierCurveTo(x + s * 0.56, y + s * 0.06, x + s * 0.12, y + s * 0.3, x, y + s * 0.46);
    c.fill();
  } else if (suit === 1) {
    c.moveTo(x, y - s * 0.5);
    c.quadraticCurveTo(x + s * 0.14, y - s * 0.18, x + s * 0.4, y);
    c.quadraticCurveTo(x + s * 0.14, y + s * 0.18, x, y + s * 0.5);
    c.quadraticCurveTo(x - s * 0.14, y + s * 0.18, x - s * 0.4, y);
    c.quadraticCurveTo(x - s * 0.14, y - s * 0.18, x, y - s * 0.5);
    c.fill();
  } else if (suit === 3) {
    c.moveTo(x, y - s * 0.5);
    c.bezierCurveTo(x + s * 0.12, y - s * 0.3, x + s * 0.56, y - s * 0.08, x + s * 0.52, y + s * 0.16);
    c.bezierCurveTo(x + s * 0.48, y + s * 0.42, x + s * 0.12, y + s * 0.4, x + s * 0.03, y + s * 0.2);
    c.lineTo(x - s * 0.03, y + s * 0.2);
    c.bezierCurveTo(x - s * 0.12, y + s * 0.4, x - s * 0.48, y + s * 0.42, x - s * 0.52, y + s * 0.16);
    c.bezierCurveTo(x - s * 0.56, y - s * 0.08, x - s * 0.12, y - s * 0.3, x, y - s * 0.5);
    c.fill();
    stem(c, x, y, s);
  } else {
    const r = s * 0.22;
    c.arc(x, y - s * 0.25, r, 0, Math.PI * 2);
    c.moveTo(x - s * 0.25 + r, y + s * 0.07);
    c.arc(x - s * 0.25, y + s * 0.07, r, 0, Math.PI * 2);
    c.moveTo(x + s * 0.25 + r, y + s * 0.07);
    c.arc(x + s * 0.25, y + s * 0.07, r, 0, Math.PI * 2);
    c.fill();
    c.beginPath();
    c.arc(x, y - s * 0.02, s * 0.14, 0, Math.PI * 2);
    c.fill();
    stem(c, x, y, s);
  }
}

function stem(c: Ctx, x: number, y: number, s: number): void {
  c.beginPath();
  c.moveTo(x - s * 0.04, y + s * 0.08);
  c.quadraticCurveTo(x - s * 0.04, y + s * 0.38, x - s * 0.22, y + s * 0.5);
  c.lineTo(x + s * 0.22, y + s * 0.5);
  c.quadraticCurveTo(x + s * 0.04, y + s * 0.38, x + s * 0.04, y + s * 0.08);
  c.closePath();
  c.fill();
}

const suitColor = (suit: number): string => (suit === 1 || suit === 2 ? RED : BLACK);

/** A crown (K), a coronet (Q) or a plume (J) above the court letter. */
function courtMark(c: Ctx, rank: number, x: number, y: number): void {
  c.fillStyle = '#c99a2e';
  c.strokeStyle = 'rgba(90,60,10,0.6)';
  c.lineWidth = 1.2;
  c.beginPath();
  if (rank === 13) {
    c.moveTo(x - 15, y + 7); c.lineTo(x - 17, y - 6); c.lineTo(x - 8, y + 1); c.lineTo(x, y - 9);
    c.lineTo(x + 8, y + 1); c.lineTo(x + 17, y - 6); c.lineTo(x + 15, y + 7); c.closePath();
    c.fill(); c.stroke();
    for (const dx of [-17, 0, 17]) { c.beginPath(); c.arc(x + dx, dx ? y - 7 : y - 10, 2.4, 0, Math.PI * 2); c.fill(); }
  } else if (rank === 12) {
    c.moveTo(x - 13, y + 6); c.quadraticCurveTo(x - 14, y - 3, x - 7, y - 3); c.quadraticCurveTo(x, y - 12, x + 7, y - 3);
    c.quadraticCurveTo(x + 14, y - 3, x + 13, y + 6); c.closePath();
    c.fill(); c.stroke();
    c.beginPath(); c.arc(x, y - 9, 2.6, 0, Math.PI * 2); c.fill();
  } else {
    c.moveTo(x - 4, y + 7);
    c.bezierCurveTo(x - 10, y - 2, x - 2, y - 10, x + 9, y - 11);
    c.bezierCurveTo(x + 4, y - 5, x + 4, y + 2, x + 4, y + 7);
    c.closePath(); c.fill(); c.stroke();
  }
}

function cardBase(c: Ctx): void {
  rr(c, 0.5, 0.5, CW - 1, CH - 1, R);
  const g = c.createLinearGradient(0, 0, 0, CH);
  g.addColorStop(0, '#ffffff');
  g.addColorStop(1, '#f2eee4');
  c.fillStyle = g;
  c.fill();
  c.strokeStyle = 'rgba(30,30,40,0.35)';
  c.lineWidth = 1.2;
  c.stroke();
}

function rankText(c: Ctx, rank: number, x: number, y: number, size: number): void {
  const label = RANKS[rank - 1];
  c.font = `700 ${label === '10' ? size - 4 : size}px ${TITLE_FONT}`;
  // "10" needs to fit the same box as one-digit ranks
  (c as Ctx & { letterSpacing?: string }).letterSpacing = label === '10' ? '-2px' : '0px';
  c.fillText(label, x, y);
  (c as Ctx & { letterSpacing?: string }).letterSpacing = '0px';
}

function drawFace(c: Ctx, suit: number, rank: number): void {
  cardBase(c);
  const col = suitColor(suit);
  c.fillStyle = col;
  // big corner index: readable in the overlapped strip of a tableau column
  c.textAlign = 'left';
  c.textBaseline = 'alphabetic';
  rankText(c, rank, 7, 37, 38);
  suitPath(c, suit, CW - 18, 21, 24);
  if (rank > 10) {
    // court card: a tinted panel with the letter and its mark
    const red = suit === 1 || suit === 2;
    rr(c, 10, 48, CW - 20, CH - 58, 7);
    const g = c.createLinearGradient(0, 48, 0, CH - 10);
    g.addColorStop(0, red ? '#fdeaea' : '#e8edf8');
    g.addColorStop(1, red ? '#f5c9cc' : '#c9d3ea');
    c.fillStyle = g;
    c.fill();
    c.strokeStyle = '#c99a2e';
    c.lineWidth = 2;
    c.stroke();
    rr(c, 14, 52, CW - 28, CH - 66, 5);
    c.strokeStyle = 'rgba(201,154,46,0.45)';
    c.lineWidth = 1;
    c.stroke();
    courtMark(c, rank, CW / 2, 66);
    c.fillStyle = col;
    c.textAlign = 'center';
    c.font = `700 46px ${TITLE_FONT}`;
    c.fillText(RANKS[rank - 1], CW / 2, 112);
    c.globalAlpha = 0.9;
    suitPath(c, suit, CW - 22, CH - 22, 14);
    suitPath(c, suit, 22, CH - 22, 14);
    c.globalAlpha = 1;
    return;
  }
  // number card: one big centre suit (an ornate ring around the ace)
  if (rank === 1) {
    c.strokeStyle = suit === 1 || suit === 2 ? 'rgba(207,35,56,0.35)' : 'rgba(29,36,51,0.3)';
    c.lineWidth = 2;
    c.beginPath(); c.arc(CW / 2, 86, 36, 0, Math.PI * 2); c.stroke();
    suitPath(c, suit, CW / 2, 86, 52);
  } else {
    suitPath(c, suit, CW / 2, 84, 56);
  }
}

function drawBack(c: Ctx): void {
  rr(c, 0.5, 0.5, CW - 1, CH - 1, R);
  c.fillStyle = '#fbf7ee';
  c.fill();
  c.strokeStyle = 'rgba(30,30,40,0.35)';
  c.lineWidth = 1.2;
  c.stroke();
  const ix = 5, iy = 5, iw = CW - 10, ih = CH - 10;
  rr(c, ix, iy, iw, ih, 7);
  const g = c.createLinearGradient(0, iy, 0, iy + ih);
  g.addColorStop(0, '#b3233c');
  g.addColorStop(1, '#7a1026');
  c.fillStyle = g;
  c.fill();
  c.save();
  rr(c, ix, iy, iw, ih, 7);
  c.clip();
  // diagonal lattice
  c.strokeStyle = 'rgba(255,214,150,0.28)';
  c.lineWidth = 1.2;
  for (let k = -CH; k < CW + CH; k += 9) {
    c.beginPath(); c.moveTo(k, 0); c.lineTo(k + CH, CH); c.stroke();
    c.beginPath(); c.moveTo(k + CH, 0); c.lineTo(k, CH); c.stroke();
  }
  // soft sheen
  const sh = c.createLinearGradient(0, 0, CW, CH);
  sh.addColorStop(0, 'rgba(255,255,255,0.18)');
  sh.addColorStop(0.5, 'rgba(255,255,255,0)');
  c.fillStyle = sh;
  c.fillRect(0, 0, CW, CH);
  c.restore();
  c.strokeStyle = '#e2b45a';
  c.lineWidth = 1.6;
  rr(c, ix + 4, iy + 4, iw - 8, ih - 8, 5);
  c.stroke();
  // centre medallion
  const cx = CW / 2, cy = CH / 2;
  c.fillStyle = '#7a1026';
  c.beginPath(); c.ellipse(cx, cy, 22, 28, 0, 0, Math.PI * 2); c.fill();
  c.strokeStyle = '#e2b45a';
  c.lineWidth = 2;
  c.stroke();
  c.fillStyle = '#e2b45a';
  suitPath(c, 1, cx, cy, 30);
  c.fillStyle = '#7a1026';
  suitPath(c, 1, cx, cy, 14);
}

function slotBase(c: Ctx, x: number, y: number): void {
  rr(c, x + 1.5, y + 1.5, CW - 3, CH - 3, R);
  c.fillStyle = 'rgba(0,0,0,0.16)';
  c.fill();
  c.setLineDash([7, 5]);
  c.strokeStyle = 'rgba(220,255,230,0.32)';
  c.lineWidth = 2.5;
  c.stroke();
  c.setLineDash([]);
}

/** Every texture the game uses; safe to call more than once. */
export function makeArt(scene: Phaser.Scene): void {
  for (let s = 0; s < 4; s++) for (let r = 1; r <= 13; r++) make(scene, faceKey(s, r), CW, CH, (c) => drawFace(c, s, r));
  make(scene, BACK, CW, CH, drawBack);
  // a soft shadow that sits under each card
  make(scene, SHADOW, CW + PAD * 2, CH + PAD * 2, (c) => {
    c.shadowColor = 'rgba(0,0,0,0.75)';
    c.shadowBlur = 12;
    c.shadowOffsetX = 2000;
    rr(c, PAD - 2000, PAD, CW, CH, R);
    c.fillStyle = '#000';
    c.fill();
  });
  const ring = (key: string, color: string, glow: string) => make(scene, key, CW + PAD * 2, CH + PAD * 2, (c) => {
    c.shadowColor = glow;
    c.shadowBlur = 16;
    c.strokeStyle = color;
    c.lineWidth = 5;
    for (let k = 0; k < 2; k++) { rr(c, PAD - 3, PAD - 3, CW + 6, CH + 6, R + 3); c.stroke(); }
  });
  ring(GLOW, '#ffe27a', 'rgba(255,200,40,1)');
  ring(SEL, '#8fe8ff', 'rgba(60,200,255,1)');
  // empty slots
  make(scene, 'sol-slot', CW, CH, (c) => slotBase(c, 0, 0));
  for (let s = 0; s < 4; s++) make(scene, `sol-slot-f${s}`, CW, CH, (c) => {
    slotBase(c, 0, 0);
    c.fillStyle = 'rgba(220,255,230,0.2)';
    suitPath(c, s, CW / 2, CH / 2 + 6, 50);
    c.font = `700 26px ${TITLE_FONT}`;
    c.textAlign = 'left';
    c.fillText('A', 10, 32);
  });
  make(scene, 'sol-slot-k', CW, CH, (c) => {
    slotBase(c, 0, 0);
    c.font = `700 64px ${TITLE_FONT}`;
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.strokeStyle = 'rgba(220,255,230,0.3)';
    c.lineWidth = 2.5;
    c.strokeText('K', CW / 2, CH / 2 + 3);
  });
  const stockSlot = (key: string, recycle: boolean) => make(scene, key, CW, CH, (c) => {
    slotBase(c, 0, 0);
    c.strokeStyle = 'rgba(220,255,230,0.42)';
    c.fillStyle = 'rgba(220,255,230,0.42)';
    c.lineWidth = 6;
    c.lineCap = 'round';
    const cx = CW / 2, cy = CH / 2;
    if (recycle) {
      c.beginPath(); c.arc(cx, cy, 24, -Math.PI * 0.35, Math.PI * 1.45); c.stroke();
      const a = -Math.PI * 0.35, ax = cx + Math.cos(a) * 24, ay = cy + Math.sin(a) * 24;
      c.beginPath(); c.moveTo(ax + 11, ay - 2); c.lineTo(ax - 4, ay - 11); c.lineTo(ax - 3, ay + 8); c.closePath(); c.fill();
    } else {
      c.beginPath(); c.moveTo(cx - 16, cy - 16); c.lineTo(cx + 16, cy + 16); c.moveTo(cx + 16, cy - 16); c.lineTo(cx - 16, cy + 16); c.stroke();
    }
  });
  stockSlot('sol-slot-re', true);
  stockSlot('sol-slot-x', false);
}

/** The felt table: a lit green gradient, fine noise, a vignette and a dark tray for the buttons. */
export function makeFelt(scene: Phaser.Scene, w: number, h: number, trayY: number): string {
  return make(scene, FELT, w, h, (c) => {
    const g = c.createRadialGradient(w / 2, h * 0.42, 40, w / 2, h * 0.45, h * 0.75);
    g.addColorStop(0, '#2b8f5a');
    g.addColorStop(0.45, '#1a6d42');
    g.addColorStop(1, '#0a3a22');
    c.fillStyle = g;
    c.fillRect(0, 0, w, h);
    const rnd = seeded(7);
    // fine felt noise
    for (let i = 0; i < 26000; i++) {
      c.fillStyle = rnd() < 0.5 ? `rgba(255,255,255,${0.02 + rnd() * 0.03})` : `rgba(0,0,0,${0.04 + rnd() * 0.05})`;
      c.fillRect(rnd() * w, rnd() * h, 1 + (rnd() < 0.2 ? 1 : 0), 1);
    }
    // short fibres
    c.lineWidth = 1;
    for (let i = 0; i < 900; i++) {
      const x = rnd() * w, y = rnd() * h, a = rnd() * Math.PI, l = 3 + rnd() * 5;
      c.strokeStyle = rnd() < 0.5 ? 'rgba(255,255,255,0.035)' : 'rgba(0,0,0,0.06)';
      c.beginPath(); c.moveTo(x, y); c.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l); c.stroke();
    }
    // vignette
    const v = c.createRadialGradient(w / 2, h / 2, h * 0.3, w / 2, h / 2, h * 0.72);
    v.addColorStop(0, 'rgba(0,0,0,0)');
    v.addColorStop(1, 'rgba(0,0,0,0.45)');
    c.fillStyle = v;
    c.fillRect(0, 0, w, h);
    // a faint rosette in the middle of the table: two rings and the four suits
    const ox = w / 2, oy = trayY * 0.69;
    c.strokeStyle = 'rgba(255,240,200,0.07)';
    c.lineWidth = 3;
    c.beginPath(); c.ellipse(ox, oy, 200, 168, 0, 0, Math.PI * 2); c.stroke();
    c.lineWidth = 1.5;
    c.beginPath(); c.ellipse(ox, oy, 184, 152, 0, 0, Math.PI * 2); c.stroke();
    c.fillStyle = 'rgba(255,240,200,0.07)';
    [[0, -96], [96, 0], [0, 96], [-96, 0]].forEach(([dx, dy], s) => suitPath(c, s, ox + dx, oy + dy, 58));
    c.beginPath();
    for (let i = 0; i < 8; i++) {
      const a = -Math.PI / 2 + (i / 8) * Math.PI * 2, r = i % 2 ? 12 : 34;
      const px = ox + Math.cos(a) * r, py = oy + Math.sin(a) * r;
      if (i) c.lineTo(px, py); else c.moveTo(px, py);
    }
    c.closePath(); c.fill();
    // a fine stitched border
    c.setLineDash([10, 7]);
    c.strokeStyle = 'rgba(255,230,170,0.16)';
    c.lineWidth = 2;
    rr(c, 8, 8, w - 16, trayY - 18, 26);
    c.stroke();
    c.setLineDash([]);
    // the button tray at the bottom
    const t = c.createLinearGradient(0, trayY, 0, h);
    t.addColorStop(0, 'rgba(4,24,14,0.55)');
    t.addColorStop(1, 'rgba(2,14,8,0.8)');
    c.fillStyle = t;
    c.fillRect(0, trayY, w, h - trayY);
    c.fillStyle = 'rgba(255,230,170,0.18)';
    c.fillRect(0, trayY, w, 2);
  });
}
