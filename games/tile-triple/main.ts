import { launch, kenney, loadSfx, type GameMeta } from '@core';
import meta from './game.json';
import { PlayScene } from './PlayScene';

launch({
  meta: meta as GameMeta,
  background: '#0e0d12',
  preload(scene) {
    // scene.load.image('player', kenney('space-shooter/png/playership1_blue.png'));
    loadSfx(scene.load, 'blip', 'sfx-digital/audio/pepsound1');
  },
  scenes: [PlayScene],
  strings: { tr: {}, en: {} },
});
