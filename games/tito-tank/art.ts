import Phaser from 'phaser';

// Vector art drawn once into canvas textures: the two tanks, the barrel, trees, clouds, the shell
// and a soft glow. Side-view tanks are not in the Kenney packs (theirs are top-down).

export const TEAM = [
  { main: '#22b8c8', light: '#7fe6ee', dark: '#137480', hex: 0x22b8c8 },   // seat 0: left, teal
  { main: '#f2545b', light: '#ff9ea2', dark: '#9b2a31', hex: 0xf2545b },   // seat 1: right, coral
] as const;

/** Tank body frame: 128x72, treads touch the ground at y=66, turret pivot at (64, 28). */
export const BODY = { w: 128, h: 72, groundY: 66, pivotY: 28 } as const;

function canvas(scene: Phaser.Scene, key: string, w: number, h: number, draw: (c: CanvasRenderingContext2D) => void): void {
  if (scene.textures.exists(key)) return;
  const tex = scene.textures.createCanvas(key, w, h);
  if (!tex) return;
  draw(tex.getContext());
  tex.refresh();
}

function rr(c: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  c.beginPath(); c.roundRect(x, y, w, h, r);
}

export function makeArt(scene: Phaser.Scene): void {
  TEAM.forEach((t, i) => canvas(scene, `tt-tank${i}`, BODY.w, BODY.h, (c) => {
    // treads
    const tg = c.createLinearGradient(0, 44, 0, 70);
    tg.addColorStop(0, '#3a4150'); tg.addColorStop(1, '#1d2129');
    c.fillStyle = tg; rr(c, 8, 44, 112, 24, 12); c.fill();
    c.strokeStyle = '#11141a'; c.lineWidth = 2; rr(c, 8, 44, 112, 24, 12); c.stroke();
    for (let k = 0; k < 6; k++) {
      const x = 22 + k * 16.8;
      c.fillStyle = '#596274'; c.beginPath(); c.arc(x, 56, 7.5, 0, Math.PI * 2); c.fill();
      c.fillStyle = '#a7b0c0'; c.beginPath(); c.arc(x, 56, 3, 0, Math.PI * 2); c.fill();
    }
    // tread teeth
    c.fillStyle = 'rgba(255,255,255,0.08)';
    for (let x = 14; x < 116; x += 7) c.fillRect(x, 45, 3, 3);
    // hull
    const hg = c.createLinearGradient(0, 28, 0, 48);
    hg.addColorStop(0, t.light); hg.addColorStop(0.45, t.main); hg.addColorStop(1, t.dark);
    c.fillStyle = hg;
    c.beginPath(); c.moveTo(16, 30); c.lineTo(112, 30); c.lineTo(124, 46); c.lineTo(4, 46); c.closePath(); c.fill();
    c.strokeStyle = t.dark; c.lineWidth = 2; c.stroke();
    c.fillStyle = 'rgba(0,0,0,0.18)'; c.fillRect(8, 42, 112, 4);
    // turret dome
    const dg = c.createRadialGradient(56, 18, 4, 64, 30, 30);
    dg.addColorStop(0, t.light); dg.addColorStop(1, t.main);
    c.fillStyle = dg;
    c.beginPath(); c.ellipse(64, 31, 28, 19, 0, Math.PI, 0); c.closePath(); c.fill();
    c.strokeStyle = t.dark; c.lineWidth = 2; c.stroke();
    // hatch ring where the commander stands
    c.fillStyle = t.dark; c.beginPath(); c.ellipse(64, 14, 12, 4, 0, 0, Math.PI * 2); c.fill();
    // emblem: a white star on the hull
    c.fillStyle = 'rgba(255,255,255,0.9)';
    c.beginPath();
    for (let k = 0; k < 10; k++) {
      const r = k % 2 ? 3 : 7, a = -Math.PI / 2 + (k * Math.PI) / 5;
      c.lineTo(36 + Math.cos(a) * r, 38 + Math.sin(a) * r);
    }
    c.closePath(); c.fill();
    // rivets
    c.fillStyle = 'rgba(0,0,0,0.25)';
    for (let x = 52; x < 110; x += 10) { c.beginPath(); c.arc(x, 39, 1.6, 0, Math.PI * 2); c.fill(); }
  }));

  canvas(scene, 'tt-barrel', 52, 14, (c) => {
    const g = c.createLinearGradient(0, 1, 0, 13);
    g.addColorStop(0, '#9aa3b5'); g.addColorStop(0.5, '#5b6476'); g.addColorStop(1, '#2f3542');
    c.fillStyle = g; rr(c, 0, 3, 46, 8, 4); c.fill();
    c.fillStyle = '#3a4150'; rr(c, 40, 1, 12, 12, 3); c.fill();
    c.fillStyle = '#11141a'; c.fillRect(49, 4, 3, 6);
  });

  // a pine and a round tree, drawn with their trunk at the bottom centre
  canvas(scene, 'tt-tree0', 70, 130, (c) => {
    c.fillStyle = '#6b4a2b'; c.fillRect(31, 96, 8, 34);
    const tiers = [[35, 6, 22], [35, 30, 28], [35, 56, 33]];
    for (const [x, y, w] of tiers) {
      const g = c.createLinearGradient(x - w, 0, x + w, 0);
      g.addColorStop(0, '#2f8f4e'); g.addColorStop(1, '#1d6b3a');
      c.fillStyle = g;
      c.beginPath(); c.moveTo(x, y); c.lineTo(x + w, y + 46); c.lineTo(x - w, y + 46); c.closePath(); c.fill();
    }
  });
  canvas(scene, 'tt-tree1', 90, 120, (c) => {
    c.fillStyle = '#6b4a2b'; c.fillRect(41, 70, 9, 50);
    const blob = (x: number, y: number, r: number, col: string) => { c.fillStyle = col; c.beginPath(); c.arc(x, y, r, 0, Math.PI * 2); c.fill(); };
    blob(45, 46, 32, '#2f9e4f'); blob(28, 56, 22, '#2a8c47'); blob(62, 56, 22, '#2a8c47'); blob(40, 34, 18, '#46b864');
  });

  canvas(scene, 'tt-cloud', 220, 90, (c) => {
    c.fillStyle = 'rgba(255,255,255,0.92)';
    for (const [x, y, r] of [[60, 56, 32], [104, 44, 42], [150, 54, 34], [180, 64, 22], [36, 66, 22]] as const) {
      c.beginPath(); c.arc(x, y, r, 0, Math.PI * 2); c.fill();
    }
    c.fillRect(36, 60, 150, 26);
  });

  canvas(scene, 'tt-shell', 20, 12, (c) => {
    c.fillStyle = '#2b2f38'; rr(c, 0, 1, 18, 10, 5); c.fill();
    c.fillStyle = '#c9a34a'; c.fillRect(2, 2, 4, 8);
    c.fillStyle = 'rgba(255,255,255,0.35)'; c.fillRect(7, 3, 8, 2);
  });

  canvas(scene, 'tt-glow', 128, 128, (c) => {
    const g = c.createRadialGradient(64, 64, 0, 64, 64, 64);
    g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.35, 'rgba(255,255,255,0.45)'); g.addColorStop(1, 'rgba(255,255,255,0)');
    c.fillStyle = g; c.fillRect(0, 0, 128, 128);
  });

  canvas(scene, 'tt-dot', 16, 16, (c) => {
    c.fillStyle = '#ffffff'; c.beginPath(); c.arc(8, 8, 7, 0, Math.PI * 2); c.fill();
  });
}
