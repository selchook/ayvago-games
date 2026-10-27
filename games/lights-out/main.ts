import { launch, loadSfx, type GameMeta } from '@core';
import meta from './game.json';
import { PlayScene, makeLightTextures } from './PlayScene';

launch({
  meta: meta as GameMeta,
  background: '#0a0b1c',
  physics: 'none',
  preload(scene) {
    const l = scene.load;
    loadSfx(l, 'toggle', 'sfx-interface/audio/switch_003');
    loadSfx(l, 'move', 'sfx-interface/audio/tick_001');
    loadSfx(l, 'hint', 'sfx-interface/audio/question_002');
    loadSfx(l, 'solved', 'sfx-digital/audio/powerup5');
    loadSfx(l, 'fail', 'sfx-digital/audio/phaserdown2');
  },
  menuDecor(scene) {
    makeLightTextures(scene);
    const { width, height } = scene.scale;
    for (let c = 0; c < 5; c++) {
      const on = c % 2 === 0;
      const img = scene.add.image(width / 2 - 240 + c * 120, height * 0.08, on ? 'lo-on' : 'lo-off').setDisplaySize(90, 90);
      if (on) scene.tweens.add({ targets: img, alpha: 0.45, duration: 600 + c * 150, yoyo: true, repeat: -1 });
    }
  },
  scenes: [PlayScene],
  strings: {
    tr: { hint: 'İPUCU', solved: 'KARANLIK!', outOfMoves: 'HAMLE BİTTİ!', par: 'HEDEF', perfect: 'KUSURSUZ!' },
    en: { hint: 'HINT', solved: 'LIGHTS OUT!', outOfMoves: 'OUT OF MOVES!', par: 'PAR', perfect: 'PERFECT!' },
  },
});
