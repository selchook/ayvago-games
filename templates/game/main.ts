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
  // Keyboard controls as key caps on desktop (required in 3D games, src/core/key-help.ts): the
  // menu's HOW TO PLAY box and the pause strip show them; PlayScene calls showKeyHelp(this) once
  // play starts. Labels are string keys (TR + EN); kh_pause is a core string.
  // keyHelp: [
  //   { keys: ['A D', 'Left Right'], label: 'kh_move' },
  //   { keys: ['Space'], label: 'kh_jump' },
  //   { keys: ['Esc'], label: 'kh_pause' },
  // ],
  scenes: [PlayScene],
  strings: { tr: {}, en: {} },
});
