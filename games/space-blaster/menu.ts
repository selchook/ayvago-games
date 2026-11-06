import Phaser from 'phaser';
import { makeFx, makeNebula, makePlanet, makeStars } from './art';

/** Menu backdrop: scrolling nebula and stars, a far planet, the ship firing at a passing fleet. */
export function menuScene(scene: Phaser.Scene): void {
  const { width, height } = scene.scale;
  const ADD = Phaser.BlendModes.ADD;
  makeFx(scene); makeNebula(scene, width, height); makePlanet(scene);
  makeStars(scene, 'sb-stars-far', width, height, 260, false, 3);
  makeStars(scene, 'sb-stars-near', width, height, 90, true, 9);
  const layers = [
    { ts: scene.add.tileSprite(0, 0, width, height, 'sb-nebula').setOrigin(0), speed: 14 },
    { ts: scene.add.tileSprite(0, 0, width, height, 'sb-stars-far').setOrigin(0), speed: 60 },
    { ts: scene.add.tileSprite(0, 0, width, height, 'sb-stars-near').setOrigin(0), speed: 190 },
  ];
  const planet = scene.add.image(width * 0.78, height * 0.3, 'sb-planet').setAlpha(0.8).setScale(0.8);

  const sx = width / 2, sy = height * 0.83;
  const flames = [{ x: 0, y: 34, s: 1.15 }, { x: -25, y: 24, s: 0.6 }, { x: 25, y: 24, s: 0.6 }].map((f) =>
    ({ ...f, img: scene.add.image(sx + f.x * 1.4, sy + f.y * 1.4, 'flame1').setOrigin(0.5, 0).setScale(f.s * 1.4) }));
  const ship = scene.add.image(sx, sy, 'ship').setScale(1.4);
  scene.tweens.add({ targets: ship, y: sy - 10, duration: 1400, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });

  // a fleet sweeps across the top now and then
  const fleet = () => {
    const dir = Math.random() < 0.5 ? 1 : -1;
    const kinds = ['enemy-black1', 'enemy-blue2', 'enemy-green3'];
    for (let i = 0; i < 5; i++) {
      const e = scene.add.image(dir > 0 ? -60 - i * 70 : width + 60 + i * 70, height * 0.1 + Math.abs(i - 2) * 26, kinds[i % 3]).setScale(0.6).setAngle(180);
      scene.tweens.add({ targets: e, x: e.x + dir * (width + 500), duration: 7000, onComplete: () => e.destroy() });
    }
  };
  fleet();
  scene.time.addEvent({ delay: 8000, loop: true, callback: fleet });
  scene.time.addEvent({
    delay: 380, loop: true, callback: () => {
      const l = scene.add.image(ship.x, ship.y - 60, 'laser').setBlendMode(ADD).setScale(1.2);
      scene.tweens.add({ targets: l, y: -60, duration: 900, onComplete: () => l.destroy() });
    },
  });

  let flick = 0;
  const update = (_t: number, delta: number) => {
    const dt = delta / 1000;
    for (const l of layers) l.ts.tilePositionY -= l.speed * dt;
    planet.y += 6 * dt;
    if (planet.y > height + 160) planet.y = -160;
    flick += dt;
    const key = Math.floor(flick * 14) % 2 ? 'flame1' : 'flame2';
    for (const f of flames) f.img.setTexture(key).setPosition(ship.x + f.x * 1.4, ship.y + f.y * 1.4).setScale(f.s * 1.4, f.s * 1.4 * (0.85 + Math.random() * 0.3));
  };
  scene.events.on(Phaser.Scenes.Events.UPDATE, update);
  scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => scene.events.off(Phaser.Scenes.Events.UPDATE, update));
}
