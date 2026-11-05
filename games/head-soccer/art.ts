import Phaser from 'phaser';
import { W, GROUND, GOAL_W, GOAL_TOP, BALL_R } from './sim';

/** Ball and spark textures (drawn, so they stay crisp at any size). */
export function makeTextures(scene: Phaser.Scene): void {
  if (scene.textures.exists('hs-ball')) return;
  const g = scene.make.graphics({ x: 0, y: 0 }, false);
  const r = BALL_R, c = r + 2;
  g.fillStyle(0x000000, 1).fillCircle(c, c, r + 1);
  g.fillStyle(0xffffff, 1).fillCircle(c, c, r - 1);
  const pent = (x: number, y: number, s: number, rot: number) => {
    const pts: Phaser.Types.Math.Vector2Like[] = [];
    for (let k = 0; k < 5; k++) {
      const a = rot + (k * Math.PI * 2) / 5 - Math.PI / 2;
      pts.push({ x: x + Math.cos(a) * s, y: y + Math.sin(a) * s });
    }
    g.fillStyle(0x1b1b22, 1).fillPoints(pts, true);
  };
  pent(c, c, 8, 0);
  for (let k = 0; k < 5; k++) {
    const a = (k * Math.PI * 2) / 5 - Math.PI / 2;
    pent(c + Math.cos(a) * (r - 3), c + Math.sin(a) * (r - 3), 7, Math.PI / 5);
  }
  g.lineStyle(2, 0x1b1b22, 0.8);
  for (let k = 0; k < 5; k++) {
    const a = (k * Math.PI * 2) / 5 - Math.PI / 2;
    g.lineBetween(c + Math.cos(a) * 8, c + Math.sin(a) * 8, c + Math.cos(a) * (r - 9), c + Math.sin(a) * (r - 9));
  }
  g.fillStyle(0xffffff, 0.45).fillCircle(c - 8, c - 9, 6);
  g.lineStyle(2, 0x000000, 1).strokeCircle(c, c, r);
  g.generateTexture('hs-ball', c * 2, c * 2);

  g.clear();
  g.fillStyle(0xffffff, 1).fillCircle(4, 4, 4);
  g.generateTexture('hs-dot', 8, 8);
  g.destroy();
}

/** Team colours: you (left, orange) and the rival (right, cyan); the fans wear them too. */
export const TEAM = ['#ff7a4a', '#4fc8ff'] as const;

function canvas(scene: Phaser.Scene, key: string, w: number, h: number, draw: (c: CanvasRenderingContext2D) => void): void {
  if (scene.textures.exists(key)) return;
  const tex = scene.textures.createCanvas(key, w, h);
  if (!tex) return;
  draw(tex.getContext());
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

/** Night sky, roof, floodlights and the pitch (one canvas); the crowd is its own layer. */
function paintStadium(c: CanvasRenderingContext2D): void {
  const r = seeded(9);
  const sky = c.createLinearGradient(0, 0, 0, 300);
  sky.addColorStop(0, '#060a1f'); sky.addColorStop(1, '#1d2a5c');
  c.fillStyle = sky; c.fillRect(0, 0, W, 420);
  for (let k = 0; k < 70; k++) {
    c.fillStyle = `rgba(255,255,255,${0.25 + r() * 0.6})`;
    c.beginPath(); c.arc(r() * W, r() * 150, 0.6 + r() * 1.3, 0, Math.PI * 2); c.fill();
  }
  // stadium roof edge
  c.fillStyle = '#0c1130';
  c.beginPath(); c.moveTo(0, 190); c.quadraticCurveTo(W / 2, 150, W, 190); c.lineTo(W, 236); c.lineTo(0, 236); c.closePath(); c.fill();
  c.fillStyle = 'rgba(255,255,255,0.06)';
  for (let x = 20; x < W; x += 40) c.fillRect(x, 200, 3, 34);
  // floodlight towers (clear of the HUD in the top corners) and their glow
  for (const x of [250, W - 250]) {
    const g = c.createRadialGradient(x, 110, 0, x, 110, 300);
    g.addColorStop(0, 'rgba(255,248,210,0.38)'); g.addColorStop(0.25, 'rgba(255,248,210,0.12)'); g.addColorStop(1, 'rgba(255,248,210,0)');
    c.fillStyle = g; c.fillRect(0, 0, W, 460);
    c.fillStyle = '#2b3152'; c.fillRect(x - 4, 124, 8, 110);
    c.fillStyle = '#20263f'; c.beginPath(); c.roundRect(x - 44, 92, 88, 34, 6); c.fill();
    for (let i = 0; i < 4; i++) for (let j = 0; j < 2; j++) {
      c.fillStyle = '#fffbe4'; c.beginPath(); c.arc(x - 30 + i * 20, 102 + j * 14, 5.5, 0, Math.PI * 2); c.fill();
    }
  }
  // advertising boards
  c.fillStyle = '#0a0d1c'; c.fillRect(0, 402, W, 38);
  const boards = ['#ec3013', '#2d6cdf', '#ffb020', '#1f9d55'];
  for (let x = 0, k = 0; x < W; x += 160, k++) {
    const b = c.createLinearGradient(0, 408, 0, 434);
    b.addColorStop(0, boards[k % 4]); b.addColorStop(1, '#000000');
    c.globalAlpha = 0.92; c.fillStyle = b; c.beginPath(); c.roundRect(x + 5, 407, 150, 28, 5); c.fill(); c.globalAlpha = 1;
    c.fillStyle = 'rgba(255,255,255,0.92)'; c.font = '700 18px Fredoka, Nunito, sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle';
    c.fillText(k % 2 ? 'AYVAGO GAMES' : 'AYVAGO', x + 80, 422);
  }
  // grass: mown stripes and a soft light from the floodlights
  const grass = c.createLinearGradient(0, 440, 0, 720);
  grass.addColorStop(0, '#2b8a3a'); grass.addColorStop(1, '#3fae4d');
  c.fillStyle = grass; c.fillRect(0, 440, W, 280);
  for (let k = 0; k < 10; k++) { c.fillStyle = 'rgba(255,255,255,0.07)'; c.fillRect(k * 128, 440, 64, GROUND - 440); }
  c.fillStyle = 'rgba(0,0,0,0.18)'; c.fillRect(0, GROUND, W, 720 - GROUND);
  // lines: touchline, halfway line, centre circle and the arcs before both goals
  c.strokeStyle = 'rgba(255,255,255,0.8)'; c.lineWidth = 4; c.lineCap = 'round';
  c.beginPath(); c.moveTo(0, GROUND - 1); c.lineTo(W, GROUND - 1); c.stroke();
  c.beginPath(); c.moveTo(W / 2, 444); c.lineTo(W / 2, GROUND); c.stroke();
  c.beginPath(); c.ellipse(W / 2, GROUND - 1, 150, 22, 0, Math.PI, Math.PI * 2); c.stroke();
  c.beginPath(); c.ellipse(W / 2, GROUND - 1, 150, 22, 0, 0, Math.PI); c.stroke();
  c.fillStyle = '#ffffff'; c.beginPath(); c.ellipse(W / 2, GROUND - 1, 7, 3, 0, 0, Math.PI * 2); c.fill();
  for (const left of [true, false]) {
    const gx = left ? GOAL_W : W - GOAL_W;
    c.beginPath(); c.ellipse(gx, GROUND - 1, 210, 26, 0, left ? -Math.PI / 2 : Math.PI / 2, left ? Math.PI / 2 : Math.PI * 1.5, false); c.stroke();
  }
  // vignette
  const v = c.createRadialGradient(W / 2, 400, 300, W / 2, 400, 820);
  v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(1, 'rgba(0,0,0,0.42)');
  c.fillStyle = v; c.fillRect(0, 0, W, 720);
}

/** The crowd in the stands: the fans on each half wear their side's colour. */
function paintCrowd(c: CanvasRenderingContext2D): void {
  const r = seeded(4);
  const skins = ['#f5d0a9', '#e0ac69', '#c68642', '#8d5524', '#ffdbac'];
  const others = ['#f3f2f2', '#ffd23f', '#3a3f5a', '#8b5cff'];
  for (let row = 0; row < 6; row++) {
    const y = 26 + row * 24;
    c.fillStyle = row % 2 ? '#141936' : '#181e40';
    c.fillRect(0, y - 14, W, 24);
    for (let x = 8 + (row % 2) * 14; x < W; x += 28) {
      if (r() < 0.05) continue;
      const side = x < W / 2 ? 0 : 1;
      const shirt = r() < 0.75 ? TEAM[side] : others[Math.floor(r() * others.length)];
      c.fillStyle = shirt;
      c.beginPath(); c.roundRect(x - 9, y - 1, 18, 13, 5); c.fill();
      c.fillStyle = skins[Math.floor(r() * skins.length)];
      c.beginPath(); c.arc(x, y - 6, 7, 0, Math.PI * 2); c.fill();
      if (r() < 0.12) { c.fillStyle = shirt; c.fillRect(x + 6, y - 22, 3, 14); c.fillRect(x + 6, y - 24, 10, 7); }   // a flag
    }
    c.fillStyle = `rgba(6,10,31,${0.5 * (1 - row / 6)})`;
    c.fillRect(0, y - 15, W, 26);
  }
}

/** Stadium, pitch and the crowd. Returns the crowd so a goal can make it jump. */
export function drawPitch(scene: Phaser.Scene): Phaser.GameObjects.Image {
  canvas(scene, 'hs-stadium', W, 720, paintStadium);
  canvas(scene, 'hs-crowd', W, 166, paintCrowd);
  // below depth 0, so the menu's own title and buttons always sit on top
  scene.add.image(0, 0, 'hs-stadium').setOrigin(0).setDepth(-3);
  return scene.add.image(0, 236, 'hs-crowd').setOrigin(0).setDepth(-2);
}

/** Nets and posts: drawn above the players so the ball looks inside the goal. */
export function drawNets(scene: Phaser.Scene, depth: number): Phaser.GameObjects.Image[] {
  canvas(scene, 'hs-net', GOAL_W + 12, GROUND - GOAL_TOP + 16, (c) => {
    const h = GROUND - GOAL_TOP, x0 = 0;
    // net: shaded inside, a diamond mesh
    const g = c.createLinearGradient(0, 8, 0, h + 8);
    g.addColorStop(0, 'rgba(255,255,255,0.14)'); g.addColorStop(1, 'rgba(255,255,255,0.05)');
    c.fillStyle = g; c.fillRect(x0, 8, GOAL_W, h);
    c.strokeStyle = 'rgba(255,255,255,0.35)'; c.lineWidth = 1.5;
    for (let k = -h; k < GOAL_W + h; k += 16) {
      c.beginPath(); c.moveTo(x0 + k, 8); c.lineTo(x0 + k + h, 8 + h); c.stroke();
      c.beginPath(); c.moveTo(x0 + k + h, 8); c.lineTo(x0 + k, 8 + h); c.stroke();
    }
    // front post, rounded and shaded
    const px = GOAL_W - 6;
    const pg = c.createLinearGradient(px, 0, px + 12, 0);
    pg.addColorStop(0, '#ffffff'); pg.addColorStop(1, '#b8bfcc');
    c.fillStyle = pg; c.beginPath(); c.roundRect(px, 2, 12, h + 8, 6); c.fill();
    // crossbar with the red stripe
    const cg = c.createLinearGradient(0, 0, 0, 16);
    cg.addColorStop(0, '#ffffff'); cg.addColorStop(1, '#c4cad6');
    c.fillStyle = cg; c.beginPath(); c.roundRect(0, 0, GOAL_W + 6, 16, 7); c.fill();
    c.fillStyle = '#ec3013'; c.fillRect(8, 5, GOAL_W - 16, 6);
  });
  return [true, false].map((left) => scene.add.image(left ? 0 : W, GOAL_TOP - 8, 'hs-net').setOrigin(left ? 0 : 1, 0).setFlipX(!left).setDepth(depth));
}
