import Phaser from 'phaser';
import { makeBackdrop, makeFx } from './art';

/**
 * Menu backdrop in attract mode: the night arcade sky, a brick wall at the top and a ball that
 * bounces between the wall and a paddle that follows it on its own.
 */
export function menuScene(scene: Phaser.Scene): void {
  const { width, height } = scene.scale;
  const ADD = Phaser.BlendModes.ADD;
  makeFx(scene);
  makeBackdrop(scene, 'bk-menu-bg', width, height);
  scene.add.image(0, 0, 'bk-menu-bg').setOrigin(0);

  const cols = ['r', 'o', 'y', 'g', 'b', 'p'];
  const bricks: Phaser.GameObjects.Image[] = [];
  for (let r = 0; r < 3; r++) for (let c = 0; c < 8; c++) {
    const x = width / 2 - 280 + c * 80, y = 70 + r * 40;
    const sh = scene.add.image(x + 6, y + 7, 'bk-shadow').setDisplaySize(84, 44).setAlpha(0);
    const img = scene.add.image(x, y - 300, `brick-${cols[(r * 2 + c) % 6]}`).setDisplaySize(76, 34);
    scene.tweens.add({ targets: img, y, duration: 500, delay: r * 80 + c * 25, ease: 'Bounce.easeOut' });
    scene.tweens.add({ targets: sh, alpha: 1, duration: 200, delay: 300 + r * 80 + c * 25 });
    bricks.push(img);
  }
  // a glint that runs along the wall now and then
  scene.time.addEvent({
    delay: 4200, loop: true, callback: () => {
      for (const b of bricks) scene.time.delayedCall((b.x - 80) * 1.2 + (b.y - 70) * 2, () => {
        if (!b.active) return;
        b.setTintFill(0xffffff);
        scene.time.delayedCall(60, () => b.active && b.clearTint());
      });
    },
  });

  const padY = height * 0.88, top = 70 + 2 * 40 + 17;
  const padGlow = scene.add.image(width / 2, padY + 14, 'bk-glow').setBlendMode(ADD).setTint(0x3ee6ff).setAlpha(0.35).setDisplaySize(280, 70);
  const paddle = scene.add.image(width / 2, padY, 'paddle').setDisplaySize(180, 43);
  const trail = scene.add.particles(0, 0, 'spark', {
    lifespan: 300, scale: { start: 0.16, end: 0 }, alpha: { start: 0.6, end: 0 }, tint: 0x3ee6ff, frequency: -1, blendMode: 'ADD',
  });
  const glow = scene.add.image(0, 0, 'bk-glow').setBlendMode(ADD).setTint(0x3ee6ff).setScale(0.75).setAlpha(0.5);
  const ball = scene.add.image(width / 2 + 40, padY - 36, 'ball').setDisplaySize(30, 30);
  let vx = 300, vy = -430;
  const R = 15;

  const update = (_t: number, delta: number) => {
    const dt = Math.min(0.05, delta / 1000);
    ball.x += vx * dt; ball.y += vy * dt;
    if (ball.x < R + 10) { ball.x = R + 10; vx = Math.abs(vx); }
    if (ball.x > width - R - 10) { ball.x = width - R - 10; vx = -Math.abs(vx); }
    if (ball.y < top + R) {
      ball.y = top + R; vy = Math.abs(vy);
      const hit = bricks.find((b) => Math.abs(b.x - ball.x) < 40 && b.y > 130);
      if (hit) {
        hit.setTintFill(0xffffff);
        scene.time.delayedCall(70, () => hit.active && hit.clearTint());
        scene.tweens.add({ targets: hit, scaleY: hit.scaleY * 1.15, duration: 60, yoyo: true });
      }
    }
    if (vy > 0 && ball.y > padY - 36) {
      ball.y = padY - 36;
      const off = Phaser.Math.Clamp((ball.x - paddle.x) / 90, -1, 1);
      const a = Phaser.Math.DegToRad(-90 + off * 55), s = Math.hypot(vx, vy);
      vx = Math.cos(a) * s; vy = Math.sin(a) * s;
      scene.tweens.add({ targets: paddle, scaleY: paddle.scaleY * 0.75, duration: 60, yoyo: true });
    }
    // the paddle chases the ball with a little lag and an offset, so the angles vary
    const want = ball.x + Math.sin(scene.time.now / 1300) * 50;
    paddle.x = Phaser.Math.Clamp(paddle.x + (want - paddle.x) * Math.min(1, dt * 6), 100, width - 100);
    padGlow.x = paddle.x;
    ball.rotation += dt * 6;
    glow.setPosition(ball.x, ball.y);
    trail.emitParticleAt(ball.x, ball.y);
  };
  scene.events.on(Phaser.Scenes.Events.UPDATE, update);
  scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => scene.events.off(Phaser.Scenes.Events.UPDATE, update));
}
