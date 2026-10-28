import { launch, kenney, loadSfx, type GameMeta } from '@core';
import meta from './game.json';
import { PlayScene } from './PlayScene';

const CARS = 'racing/png/cars/';

launch({
  meta: meta as GameMeta,
  background: '#16331d',
  physics: 'none',
  preload(scene) {
    const l = scene.load;
    l.image('frog', kenney('animals/png/round/frog.png'));
    l.image('hippo', kenney('animals/png/round/hippo.png'));
    l.image('chick', kenney('animals/png/round/chick.png'));
    l.image('tree', kenney('racing/png/objects/tree_small.png'));
    for (const c of ['black', 'blue', 'green', 'red', 'yellow']) {
      l.image(`car-${c}`, kenney(`${CARS}car_${c}_small_1.png`));
      l.image(`car2-${c}`, kenney(`${CARS}car_${c}_small_3.png`));
      l.image(`truck-${c}`, kenney(`${CARS}car_${c}_5.png`));
    }
    for (const c of ['blue', 'yellow', 'red']) l.image(`moto-${c}`, kenney(`racing/png/motorcycles/motorcycle_${c}.png`));
    loadSfx(l, 'hop', 'sfx-interface/audio/pluck_002');
    loadSfx(l, 'splat', 'sfx-impact/audio/impactpunch_heavy_001');
    loadSfx(l, 'splash', 'sfx-impact/audio/impactsoft_heavy_004');
    loadSfx(l, 'home', 'sfx-digital/audio/powerup3');
    loadSfx(l, 'bonus', 'sfx-digital/audio/threetone2');
    loadSfx(l, 'level', 'jingles/audio/8-bit_jingles/jingles_nes03');
    loadSfx(l, 'tick', 'sfx-interface/audio/tick_004');
    loadSfx(l, 'honk', 'sfx-digital/audio/twotone2');
  },
  menuDecor(scene) {
    const { width, height } = scene.scale;
    const y = height * 0.82;
    scene.add.rectangle(0, y - 40, width, 80, 0x3b3b44).setOrigin(0);
    for (let x = 20; x < width; x += 80) scene.add.rectangle(x, y, 40, 6, 0xffffff, 0.6).setOrigin(0, 0.5);
    const car = scene.add.image(-80, y, 'car-red').setAngle(90);
    scene.tweens.add({ targets: car, x: width + 80, duration: 2600, repeat: -1 });
    const frog = scene.add.image(width / 2, y + 110, 'frog').setScale(0.6);
    scene.tweens.add({ targets: frog, y: frog.y - 24, scale: 0.68, duration: 260, yoyo: true, repeat: -1, repeatDelay: 600, ease: 'Quad.easeOut' });
    scene.add.image(90, height * 0.08, 'tree').setScale(0.6).setAlpha(0.8);
    scene.add.image(width - 90, height * 0.1, 'tree').setScale(0.5).setAlpha(0.8);
  },
  scenes: [PlayScene],
  strings: {
    tr: { home: 'YUVA!', rescue: 'CİVCİV KURTARILDI!', timeUp: 'SÜRE BİTTİ!', fastTraffic: 'TRAFİK HIZLANDI!' },
    en: { home: 'HOME!', rescue: 'CHICK RESCUED!', timeUp: "TIME'S UP!", fastTraffic: 'TRAFFIC SPEEDS UP!' },
  },
});
