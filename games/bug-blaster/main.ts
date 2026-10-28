import { launch, loadSfx, type GameMeta } from '@core';
import meta from './game.json';
import { PlayScene, makeTextures, PALETTES } from './PlayScene';

launch({
  meta: meta as GameMeta,
  background: '#07060f',
  physics: 'none',
  preload(scene) {
    const l = scene.load;
    loadSfx(l, 'shoot', 'sfx-digital/audio/laser9');
    loadSfx(l, 'hit', 'sfx-digital/audio/zap1');
    loadSfx(l, 'head', 'sfx-digital/audio/pepsound3');
    loadSfx(l, 'mush', 'sfx-impact/audio/impactsoft_medium_000');
    loadSfx(l, 'spider', 'sfx-digital/audio/spacetrash2');
    loadSfx(l, 'spiderIn', 'sfx-digital/audio/lowrandom');
    loadSfx(l, 'flea', 'sfx-digital/audio/phaserdown1');
    loadSfx(l, 'die', 'sfx-digital/audio/lowdown');
    loadSfx(l, 'wave', 'sfx-digital/audio/threetone1');
    loadSfx(l, 'oneup', 'sfx-digital/audio/powerup4');
    loadSfx(l, 'repair', 'sfx-interface/audio/tick_001');
  },
  menuDecor(scene) {
    makeTextures(scene);
    const { width, height } = scene.scale;
    const pal = PALETTES[0];
    for (let i = 0; i < 9; i++) {
      const x = width / 2 + 200 - i * 46, y = height * 0.86 + Math.sin(i * 0.9) * 18;
      const s = scene.add.image(x, y, i === 0 ? 'head' : 'seg').setTint(pal.seg).setScale(1.1);
      scene.tweens.add({ targets: s, y: y - 14, duration: 500, yoyo: true, repeat: -1, delay: i * 80, ease: 'Sine.easeInOut' });
    }
    for (const [x, y] of [[0.12, 0.08], [0.85, 0.12], [0.3, 0.06], [0.08, 0.78], [0.62, 0.9]]) {
      scene.add.image(width * x, height * y, 'mush0').setTint(pal.mush).setScale(1.3);
    }
    scene.add.image(width * 0.8, height * 0.79, 'spider').setScale(1.3);
  },
  scenes: [PlayScene],
  strings: {
    tr: { oneUp: '+1 CAN', waveN: 'DALGA {n}', repair: 'ONARIM' },
    en: { oneUp: '1UP!', waveN: 'WAVE {n}', repair: 'REPAIR' },
  },
});
