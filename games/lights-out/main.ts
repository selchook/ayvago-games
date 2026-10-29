import { launch, loadAudio, type GameMeta } from '@core';
import meta from './game.json';
import { PlayScene, makeLightTextures } from './PlayScene';

launch({
  meta: meta as GameMeta,
  background: '#0a0b1c',
  physics: 'none',
  preload(scene) {
    const l = scene.load;
    const J = 'oga/junkala-sfx/general-sounds/';
    loadAudio(l, 'toggle', J + 'buttons/sfx-sounds-button6');
    loadAudio(l, 'move', J + 'menu-sounds/sfx-menu-move2');
    loadAudio(l, 'hint', J + 'pause-sounds/sfx-sounds-pause4-in');
    loadAudio(l, 'warn', J + 'alarms/low-health-alarms/sfx-lowhealth-alarmloop6');
    loadAudio(l, 'solved', J + 'positive-sounds/sfx-sounds-powerup13');
    loadAudio(l, 'perfect', J + 'coins/sfx-coin-cluster8');
    loadAudio(l, 'fail', J + 'negative-sounds/sfx-sounds-negative2');
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
