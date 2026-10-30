import Phaser from 'phaser';
import { W, GROUND, GOAL_W, GOAL_TOP, BALL_R } from './sim';

/** Ball, boot and spark textures (drawn, so they stay crisp at any size). */
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

  // boot on a short leg; the hip is the top centre (14, 0), the toe points right
  g.clear();
  g.fillStyle(0xffffff, 1).fillRect(8, 0, 13, 40);
  g.fillStyle(0xec3013, 1).fillRect(8, 10, 13, 5).fillRect(8, 22, 13, 5);
  g.fillStyle(0x000000, 1).fillRoundedRect(4, 36, 34, 18, 7);
  g.fillStyle(0x2a2a33, 1).fillRoundedRect(6, 38, 30, 12, 5);
  g.fillStyle(0xffffff, 1).fillRect(14, 40, 3, 4).fillRect(20, 40, 3, 4).fillRect(26, 40, 3, 4);
  g.fillStyle(0xffd23f, 1).fillRect(6, 50, 32, 4);
  g.generateTexture('hs-boot', 40, 56);

  g.clear();
  g.fillStyle(0xffffff, 1).fillCircle(4, 4, 4);
  g.generateTexture('hs-dot', 8, 8);
  g.destroy();
}

/** Stadium, pitch and both goals (the nets are drawn over the players later by `drawNets`). */
export function drawPitch(scene: Phaser.Scene): void {
  const g = scene.add.graphics().setDepth(0);
  // night sky and stands
  g.fillGradientStyle(0x0b1030, 0x0b1030, 0x24346e, 0x24346e, 1).fillRect(0, 0, W, 330);
  g.fillStyle(0x161a35, 1).fillRect(0, 240, W, 170);
  // crowd: rows of coloured heads
  const cols = [0xec3013, 0xffd23f, 0x3ee6ff, 0xffffff, 0x5dff7a, 0xff4fa3, 0x8b5cff];
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let row = 0; row < 6; row++) {
    const y = 262 + row * 24;
    g.fillStyle(0x0f1228, 1).fillRect(0, y + 8, W, 6);
    for (let x = 10 + (row % 2) * 14; x < W; x += 28) {
      g.fillStyle(cols[Math.floor(rnd() * cols.length)], 0.55 + rnd() * 0.3).fillCircle(x + rnd() * 6, y, 8);
    }
  }
  // floodlights
  for (const x of [150, W - 150]) {
    g.fillStyle(0x3a3f5c, 1).fillRect(x - 4, 70, 8, 200);
    g.fillStyle(0xfff6c2, 1).fillRoundedRect(x - 46, 40, 92, 36, 6);
    g.fillStyle(0xfff6c2, 0.08).fillTriangle(x - 46, 76, x + 46, 76, x + (x < W / 2 ? 260 : -260), 420);
  }
  // advertising boards
  g.fillStyle(0x101422, 1).fillRect(0, 404, W, 34);
  for (let x = 0; x < W; x += 160) g.fillStyle([0xec3013, 0x3ee6ff, 0xffd23f, 0x5dff7a][(x / 160) % 4], 0.85).fillRect(x + 6, 410, 148, 22);
  // grass with mowing stripes
  g.fillStyle(0x2f8f3a, 1).fillRect(0, 438, W, 282);
  for (let k = 0; k < 10; k++) g.fillStyle(0x38a046, 1).fillRect(k * 128, 438, 64, GROUND - 438);
  g.fillStyle(0x24722e, 1).fillRect(0, GROUND, W, 720 - GROUND);
  g.fillStyle(0x2f8f3a, 1).fillRect(0, GROUND, W, 6);
  // lines
  g.lineStyle(4, 0xffffff, 0.75).lineBetween(W / 2, 438, W / 2, GROUND);
  g.strokeEllipse(W / 2, GROUND - 2, 300, 46);
  g.lineBetween(0, GROUND - 1, W, GROUND - 1);
  g.lineBetween(GOAL_W + 150, GROUND - 1, GOAL_W + 70, 470).lineBetween(W - GOAL_W - 150, GROUND - 1, W - GOAL_W - 70, 470);
}

/** Nets and posts: drawn above the players so the ball looks inside the goal. */
export function drawNets(scene: Phaser.Scene, depth: number): void {
  const g = scene.add.graphics().setDepth(depth);
  for (const left of [true, false]) {
    const x0 = left ? 0 : W - GOAL_W, x1 = left ? GOAL_W : W;
    g.fillStyle(0xffffff, 0.08).fillRect(x0, GOAL_TOP, GOAL_W, GROUND - GOAL_TOP);
    g.lineStyle(2, 0xffffff, 0.32);
    for (let x = x0 + 12; x < x1; x += 16) g.lineBetween(x, GOAL_TOP, x, GROUND);
    for (let y = GOAL_TOP + 14; y < GROUND; y += 16) g.lineBetween(x0, y, x1, y);
    // crossbar and front post
    const front = left ? GOAL_W : W - GOAL_W;
    g.fillStyle(0x000000, 0.35).fillRect(front - 6, GOAL_TOP, 12, GROUND - GOAL_TOP);
    g.fillStyle(0xffffff, 1).fillRect(front - 5, GOAL_TOP - 4, 10, GROUND - GOAL_TOP + 4);
    g.fillStyle(0xffffff, 1).fillRoundedRect(x0, GOAL_TOP - 8, GOAL_W, 16, 6);
    g.fillStyle(0xec3013, 1).fillRect(x0 + 8, GOAL_TOP - 3, GOAL_W - 16, 6);
  }
}
