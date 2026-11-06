import Phaser from 'phaser';
import { makeFx, makeNebula, makePlanet, makeStars } from './art';

/** Menu backdrop: drifting space, tumbling rocks and the ship circling and firing at them. */
export function menuScene(scene: Phaser.Scene): void {
  const { width, height } = scene.scale;
  const ADD = Phaser.BlendModes.ADD;
  makeFx(scene); makeNebula(scene, width, height); makePlanet(scene);
  makeStars(scene, 'as-stars-far', width, height, 240, false, 5);
  makeStars(scene, 'as-stars-near', width, height, 70, true, 13);
  const layers = [
    { ts: scene.add.tileSprite(0, 0, width, height, 'as-nebula').setOrigin(0), speed: 6 },
    { ts: scene.add.tileSprite(0, 0, width, height, 'as-stars-far').setOrigin(0), speed: 12 },
    { ts: scene.add.tileSprite(0, 0, width, height, 'as-stars-near').setOrigin(0), speed: 26 },
  ];
  scene.add.image(width * 0.8, height * 0.33, 'as-planet').setAlpha(0.75).setScale(0.8);

  const rocks = ([[0.15, 0.08, 'rock0-1', 1.1], [0.85, 0.12, 'rock-brown', 1], [0.2, 0.86, 'rock1-1', 1.4], [0.82, 0.9, 'rock0-3', 1.2], [0.08, 0.45, 'rock2-1', 1.3], [0.92, 0.6, 'rock1-2', 1.2]] as const)
    .map(([x, y, k, s]) => {
      const r = scene.add.image(width * x, height * y, k).setScale(s);
      scene.tweens.add({ targets: r, angle: 360, duration: 9000 + Math.random() * 6000, repeat: -1 });
      scene.tweens.add({ targets: r, x: r.x + Phaser.Math.Between(-30, 30), y: r.y + Phaser.Math.Between(-24, 24), duration: 4000 + Math.random() * 3000, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
      return r;
    });

  // the ship circles the lower half and fires at the nearest rock now and then
  const cx = width / 2, cy = height * 0.8;
  const glow = scene.add.image(0, 0, 'as-glow').setBlendMode(ADD).setTint(0xff9a3d).setScale(0.45);
  const flame = scene.add.image(0, 0, 'flame');
  const ship = scene.add.image(cx, cy, 'ship').setScale(1);
  let a = 0, cd = 1;
  const update = (_t: number, delta: number) => {
    const dt = Math.min(0.05, delta / 1000);
    for (const l of layers) { l.ts.tilePositionY -= l.speed * dt; l.ts.tilePositionX += l.speed * 0.4 * dt; }
    a += dt * 0.6;
    ship.setPosition(cx + Math.cos(a) * 150, cy + Math.sin(a) * 50);
    const head = a + Math.PI / 2;
    ship.setRotation(head + Math.PI / 2);
    const bx = ship.x - Math.cos(head) * 34, by = ship.y - Math.sin(head) * 34;
    flame.setPosition(bx, by).setRotation(head + Math.PI / 2).setScale(1.2, 0.9 + Math.random() * 0.5);
    glow.setPosition(bx, by);
    cd -= dt;
    if (cd <= 0) {
      cd = 0.9;
      let best = rocks[0], bd = 1e9;
      for (const r of rocks) { const d = Phaser.Math.Distance.Between(ship.x, ship.y, r.x, r.y); if (d < bd) { bd = d; best = r; } }
      const ang = Phaser.Math.Angle.Between(ship.x, ship.y, best.x, best.y);
      const s = scene.add.image(ship.x, ship.y, 'shot').setBlendMode(ADD).setRotation(ang + Math.PI / 2).setScale(0.8);
      scene.tweens.add({
        targets: s, x: best.x, y: best.y, duration: bd / 0.9, onComplete: () => {
          s.destroy();
          if (!best.active) return;
          best.setTintFill(0xffffff);
          scene.time.delayedCall(60, () => best.active && best.clearTint());
          const g = scene.add.image(best.x, best.y, 'as-glow').setBlendMode(ADD).setTint(0xffb36b).setScale(0.3);
          scene.tweens.add({ targets: g, scale: 0.9, alpha: 0, duration: 240, onComplete: () => g.destroy() });
        },
      });
    }
  };
  scene.events.on(Phaser.Scenes.Events.UPDATE, update);
  scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => scene.events.off(Phaser.Scenes.Events.UPDATE, update));
}
