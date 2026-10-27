import { launch, kenney, loadSfx, type GameMeta } from '@core';
import meta from './game.json';
import { PlayScene, BLOCK_TILES } from './PlayScene';

launch({
  meta: meta as GameMeta,
  background: '#12102a',
  physics: 'none',
  preload(scene) {
    const l = scene.load;
    BLOCK_TILES.forEach((f, i) => l.image(`blk${i}`, kenney(`puzzle2/png/${f}`)));
    loadSfx(l, 'pick', 'sfx-interface/audio/click_003');
    loadSfx(l, 'place', 'sfx-impact/audio/impactplate_light_001');
    loadSfx(l, 'bad', 'sfx-interface/audio/error_004');
    loadSfx(l, 'clear', 'sfx-digital/audio/powerup2');
    loadSfx(l, 'combo', 'sfx-digital/audio/threetone1');
    loadSfx(l, 'refill', 'sfx-interface/audio/maximize_003');
  },
  menuDecor(scene) {
    const { width, height } = scene.scale;
    const cells = [[0, 0], [1, 0], [2, 0], [1, 1], [0, 3], [0, 4], [1, 4]];
    cells.forEach(([c, r], i) => {
      scene.add.image(70 + c * 56, height * 0.06 + r * 56, `blk${i % 6}`).setDisplaySize(54, 54).setAlpha(0.8);
      scene.add.image(width - 70 - c * 56, height * 0.8 + r * 56, `blk${(i + 3) % 6}`).setDisplaySize(54, 54).setAlpha(0.8);
    });
  },
  scenes: [PlayScene],
  strings: {
    tr: { good: 'GÜZEL!', great: 'HARİKA!', amazing: 'MUHTEŞEM!', noFit: 'YER KALMADI!' },
    en: { good: 'NICE!', great: 'GREAT!', amazing: 'AMAZING!', noFit: 'NO ROOM LEFT!' },
  },
});
