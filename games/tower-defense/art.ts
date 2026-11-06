import Phaser from 'phaser';

/** Painted textures for Tower Defense: the battlefield, the sidebar panel, glows, smoke and banners. */

type Ctx = CanvasRenderingContext2D;

function make(scene: Phaser.Scene, key: string, w: number, h: number, draw: (c: Ctx) => void): void {
  if (scene.textures.exists(key)) return;
  const tex = scene.textures.createCanvas(key, w, h);
  if (!tex) return;
  const c = tex.getContext();
  c.save();
  draw(c);
  c.restore();
  tex.refresh();
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

function rr(c: Ctx, x: number, y: number, w: number, h: number, r: number): void {
  c.beginPath();
  c.moveTo(x + r, y);
  c.arcTo(x + w, y, x + w, y + h, r);
  c.arcTo(x + w, y + h, x, y + h, r);
  c.arcTo(x, y + h, x, y, r);
  c.arcTo(x, y, x + w, y, r);
  c.closePath();
}

const GRASS_A = '#3f9b4c', GRASS_B = '#43a251';

/**
 * The whole battlefield as one texture: a mown lawn with tufts and flowers, a dirt road with a
 * dark rim, wheel ruts and pebbles, painted direction chevrons and a faint build grid.
 * `pts` are the road waypoints in texture space, `road(c, r)` tells which cells are road.
 */
export function makeField(scene: Phaser.Scene, key: string, cols: number, rows: number, cell: number, pts: { x: number; y: number }[], road: (c: number, r: number) => boolean): void {
  const W = cols * cell, H = rows * cell;
  make(scene, key, W, H, (c) => {
    const rnd = seeded(31);
    // lawn: alternating mown cells
    for (let r = 0; r < rows; r++) for (let k = 0; k < cols; k++) {
      c.fillStyle = (r + k) % 2 ? GRASS_A : GRASS_B;
      c.fillRect(k * cell, r * cell, cell, cell);
    }
    // soft light patches
    for (let i = 0; i < 14; i++) {
      const x = rnd() * W, y = rnd() * H, rad = 60 + rnd() * 120;
      const g = c.createRadialGradient(x, y, 0, x, y, rad);
      const light = rnd() < 0.5;
      g.addColorStop(0, light ? 'rgba(160,230,120,0.10)' : 'rgba(10,60,20,0.10)');
      g.addColorStop(1, 'rgba(0,0,0,0)');
      c.fillStyle = g; c.fillRect(0, 0, W, H);
    }
    // grass tufts
    c.lineCap = 'round';
    for (let i = 0; i < 380; i++) {
      const x = rnd() * W, y = rnd() * H, s = 3 + rnd() * 4;
      c.strokeStyle = rnd() < 0.6 ? 'rgba(30,100,45,0.42)' : 'rgba(120,210,110,0.38)';
      c.lineWidth = 2;
      c.beginPath();
      c.moveTo(x - s * 0.6, y - s); c.lineTo(x, y);
      c.lineTo(x + s * 0.6, y - s);
      c.moveTo(x, y); c.lineTo(x, y - s * 1.2);
      c.stroke();
    }
    // flowers
    for (let i = 0; i < 46; i++) {
      const x = rnd() * W, y = rnd() * H;
      const col = ['#ffffff', '#ffe066', '#ff9ecb', '#b9a6ff'][Math.floor(rnd() * 4)];
      for (let j = 0; j < 3; j++) {
        c.fillStyle = col;
        c.beginPath(); c.arc(x + (rnd() - 0.5) * 12, y + (rnd() - 0.5) * 10, 2.2, 0, Math.PI * 2); c.fill();
      }
    }
    // faint build grid on the lawn
    c.strokeStyle = 'rgba(0,0,0,0.07)'; c.lineWidth = 1;
    for (let r = 0; r < rows; r++) for (let k = 0; k < cols; k++) {
      if (road(k, r)) continue;
      c.strokeRect(k * cell + 0.5, r * cell + 0.5, cell - 1, cell - 1);
    }

    // the road, in layers along the waypoint polyline
    const line = (w: number, style: string, dy = 0) => {
      c.strokeStyle = style; c.lineWidth = w; c.lineJoin = 'round'; c.lineCap = 'butt';
      c.beginPath();
      pts.forEach((p, i) => (i ? c.lineTo(p.x, p.y + dy) : c.moveTo(p.x, p.y + dy)));
      c.stroke();
    };
    line(cell * 0.98 + 8, 'rgba(150,220,120,0.35)');   // light lip on the grass
    line(cell * 0.98, 'rgba(0,0,0,0.22)', 5);           // the road sits a little lower
    line(cell * 0.98, '#7a4f27');                       // rim
    line(cell * 0.86, '#bb8044');                       // dirt
    line(cell * 0.62, '#c78b4d');                       // worn, lighter middle
    line(cell * 0.52, 'rgba(120,75,35,0.55)');          // two wheel ruts ...
    line(cell * 0.4, '#c78b4d');                        // ... left after painting the centre back
    line(cell * 0.12, 'rgba(214,160,100,0.5)');         // dusty crown
    // pebbles and dirt specks scattered along the road
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i], b = pts[i + 1];
      const len = Math.hypot(b.x - a.x, b.y - a.y);
      const nx = -(b.y - a.y) / len, ny = (b.x - a.x) / len;
      for (let d = 0; d < len; d += 9) {
        const t = d / len, off = (rnd() - 0.5) * cell * 0.76;
        const x = a.x + (b.x - a.x) * t + nx * off, y = a.y + (b.y - a.y) * t + ny * off;
        const big = rnd() < 0.18;
        c.fillStyle = big ? (rnd() < 0.5 ? '#94643a' : '#d9a56a') : 'rgba(110,70,35,0.45)';
        c.beginPath(); c.ellipse(x, y, big ? 3.2 : 1.6, big ? 2.4 : 1.4, rnd() * 3, 0, Math.PI * 2); c.fill();
        if (big) { c.fillStyle = 'rgba(255,255,255,0.25)'; c.beginPath(); c.arc(x - 1, y - 1, 1, 0, Math.PI * 2); c.fill(); }
      }
    }
    // painted direction chevrons at the entry and before each bend
    const chevron = (x: number, y: number, ang: number) => {
      c.save(); c.translate(x, y); c.rotate(ang);
      c.strokeStyle = 'rgba(255,230,150,0.45)'; c.lineWidth = 5; c.lineJoin = 'miter'; c.lineCap = 'butt';
      for (const o of [-9, 5]) { c.beginPath(); c.moveTo(o - 6, -12); c.lineTo(o + 4, 0); c.lineTo(o - 6, 12); c.stroke(); }
      c.restore();
    };
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i], b = pts[i + 1];
      const ang = Math.atan2(b.y - a.y, b.x - a.x);
      const len = Math.hypot(b.x - a.x, b.y - a.y);
      const t = i === 0 ? Math.min(0.5, (cell * 1.4) / len) : 0.5;
      chevron(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t, ang);
    }
    // edge vignette
    const v = c.createRadialGradient(W / 2, H / 2, H * 0.45, W / 2, H / 2, W * 0.7);
    v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(1, 'rgba(0,20,10,0.32)');
    c.fillStyle = v; c.fillRect(0, 0, W, H);
  });
}

/** The red-and-white barrier that guards the base where the road leaves the map. */
export function makeGate(scene: Phaser.Scene): void {
  make(scene, 'td-gate', 96, 40, (c) => {
    c.fillStyle = 'rgba(0,0,0,0.3)'; rr(c, 4, 18, 88, 20, 6); c.fill();
    for (const x of [6, 78]) { c.fillStyle = '#3a3f4a'; rr(c, x, 4, 12, 30, 3); c.fill(); c.fillStyle = '#5c6372'; c.fillRect(x + 2, 6, 3, 26); }
    c.save(); rr(c, 14, 10, 68, 14, 4); c.clip();
    for (let i = -2; i < 10; i++) { c.fillStyle = i % 2 ? '#f4f4f4' : '#e8342a'; c.beginPath(); c.moveTo(14 + i * 12, 24); c.lineTo(26 + i * 12, 10); c.lineTo(38 + i * 12, 10); c.lineTo(26 + i * 12, 24); c.fill(); }
    c.restore();
    c.strokeStyle = '#1b1d24'; c.lineWidth = 2; rr(c, 14, 10, 68, 14, 4); c.stroke();
    for (const x of [12, 84]) { c.fillStyle = '#ffd23f'; c.beginPath(); c.arc(x, 6, 4, 0, Math.PI * 2); c.fill(); }
  });
}

/** Sidebar panel: dark steel with rivets and a bevelled inner edge. */
export function makeSidebar(scene: Phaser.Scene, w: number, h: number): void {
  make(scene, 'td-side', w, h, (c) => {
    const g = c.createLinearGradient(0, 0, w, 0);
    g.addColorStop(0, '#1b1825'); g.addColorStop(1, '#14121c');
    c.fillStyle = g; c.fillRect(0, 0, w, h);
    c.strokeStyle = 'rgba(255,255,255,0.025)'; c.lineWidth = 2;
    for (let y = -w; y < h; y += 14) { c.beginPath(); c.moveTo(0, y); c.lineTo(w, y + w); c.stroke(); }
    c.fillStyle = '#000000'; c.fillRect(0, 0, 4, h);
    c.fillStyle = 'rgba(255,255,255,0.10)'; c.fillRect(4, 0, 2, h);
    for (const y of [12, h - 12]) for (const x of [16, w - 12]) {
      c.fillStyle = '#3a3548'; c.beginPath(); c.arc(x, y, 4, 0, Math.PI * 2); c.fill();
      c.fillStyle = 'rgba(255,255,255,0.25)'; c.beginPath(); c.arc(x - 1, y - 1, 1.5, 0, Math.PI * 2); c.fill();
    }
  });
}

/** Top bar: dark band with a bright bottom edge. */
export function makeTopBar(scene: Phaser.Scene, w: number, h: number): void {
  make(scene, 'td-top', w, h, (c) => {
    const g = c.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, '#191624'); g.addColorStop(1, '#0e0d14');
    c.fillStyle = g; c.fillRect(0, 0, w, h);
    c.fillStyle = '#000000'; c.fillRect(0, h - 4, w, 4);
    c.fillStyle = 'rgba(255,210,63,0.35)'; c.fillRect(0, h - 6, w, 2);
  });
}

export function makeFx(scene: Phaser.Scene): void {
  make(scene, 'td-glow', 128, 128, (c) => {
    const g = c.createRadialGradient(64, 64, 0, 64, 64, 64);
    g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.25, 'rgba(255,255,255,0.55)'); g.addColorStop(1, 'rgba(255,255,255,0)');
    c.fillStyle = g; c.fillRect(0, 0, 128, 128);
  });
  make(scene, 'td-ring', 128, 128, (c) => {
    c.strokeStyle = '#ffffff'; c.lineWidth = 7;
    c.beginPath(); c.arc(64, 64, 56, 0, Math.PI * 2); c.stroke();
  });
  // a star-shaped muzzle flash
  make(scene, 'td-flash', 64, 64, (c) => {
    const g = c.createRadialGradient(32, 32, 0, 32, 32, 30);
    g.addColorStop(0, 'rgba(255,255,230,1)'); g.addColorStop(0.35, 'rgba(255,210,80,0.9)'); g.addColorStop(1, 'rgba(255,120,20,0)');
    c.fillStyle = g;
    c.beginPath();
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2, r = i % 2 ? 11 : 30;
      if (i) c.lineTo(32 + Math.cos(a) * r, 32 + Math.sin(a) * r); else c.moveTo(32 + r, 32);
    }
    c.closePath(); c.fill();
  });
  make(scene, 'td-puff', 48, 48, (c) => {
    const g = c.createRadialGradient(24, 24, 0, 24, 24, 24);
    g.addColorStop(0, 'rgba(235,235,235,0.9)'); g.addColorStop(0.6, 'rgba(200,200,200,0.5)'); g.addColorStop(1, 'rgba(180,180,180,0)');
    c.fillStyle = g; c.fillRect(0, 0, 48, 48);
  });
  // soft contact shadow under units, towers and props
  make(scene, 'td-shade', 64, 40, (c) => {
    const g = c.createRadialGradient(32, 20, 0, 32, 20, 30);
    g.addColorStop(0, 'rgba(0,0,0,0.55)'); g.addColorStop(1, 'rgba(0,0,0,0)');
    c.setTransform(1, 0, 0, 0.62, 0, 7.6);
    c.fillStyle = g; c.fillRect(0, 0, 64, 64);
  });
  // a drifting cloud shadow
  make(scene, 'td-cloud', 256, 160, (c) => {
    const rnd = seeded(5);
    for (let i = 0; i < 7; i++) {
      const x = 50 + rnd() * 156, y = 50 + rnd() * 60, r = 36 + rnd() * 30;
      const g = c.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, 'rgba(0,0,0,0.5)'); g.addColorStop(1, 'rgba(0,0,0,0)');
      c.fillStyle = g; c.fillRect(0, 0, 256, 160);
    }
  });
  // red edge vignette for low lives / leaks
  make(scene, 'td-vig', 320, 180, (c) => {
    const g = c.createRadialGradient(160, 90, 60, 160, 90, 190);
    g.addColorStop(0, 'rgba(236,48,19,0)'); g.addColorStop(1, 'rgba(236,48,19,0.9)');
    c.fillStyle = g; c.fillRect(0, 0, 320, 180);
  });
  // the wave banner ribbon
  make(scene, 'td-banner', 512, 96, (c) => {
    const g = c.createLinearGradient(0, 0, 0, 96);
    g.addColorStop(0, 'rgba(20,18,30,0.92)'); g.addColorStop(1, 'rgba(8,8,14,0.92)');
    c.fillStyle = g; c.fillRect(0, 10, 512, 76);
    c.fillStyle = '#ffffff'; c.fillRect(0, 4, 512, 4); c.fillRect(0, 88, 512, 4);
    c.fillStyle = 'rgba(255,255,255,0.12)'; c.fillRect(0, 12, 512, 2);
  });
}
