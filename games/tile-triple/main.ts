import { launch, kenney, loadSfx, type GameMeta } from '@core';
import meta from './game.json';
import { PlayScene, ANIMALS } from './PlayScene';

launch({
  meta: meta as GameMeta,
  background: '#1d3b2a',
  physics: 'none',
  preload(scene) {
    const l = scene.load;
    for (const a of ANIMALS) l.image('an-' + a, kenney(`animals/png/round/${a}.png`));
    loadSfx(l, 'pick', 'sfx-casino/audio/chiplay1');
    loadSfx(l, 'match', 'sfx-digital/audio/powerup2');
    loadSfx(l, 'blocked', 'sfx-interface/audio/error_004');
    loadSfx(l, 'warn', 'sfx-interface/audio/error_006');
    loadSfx(l, 'undo', 'sfx-interface/audio/back_002');
    loadSfx(l, 'shuffle', 'sfx-casino/audio/cardshuffle');
    loadSfx(l, 'deal', 'sfx-casino/audio/cardfan1');
    loadSfx(l, 'clear', 'sfx-digital/audio/threetone2');
    loadSfx(l, 'lose', 'sfx-digital/audio/phaserdown3');
    loadSfx(l, 'tick', 'sfx-interface/audio/tick_002');
  },
  menuDecor(scene) {
    const { width, height } = scene.scale;
    ['chick', 'frog', 'pig'].forEach((a, i) => {
      const x = width / 2 + (i - 1) * 130, y = height * 0.86;
      const bg = scene.add.rectangle(x, y, 104, 112, 0xfff4dc).setStrokeStyle(5, 0x6b4a22).setAngle((i - 1) * 8);
      const img = scene.add.image(x, y, 'an-' + a).setScale(0.62).setAngle((i - 1) * 8);
      scene.tweens.add({ targets: [bg, img], y: y - 16, duration: 650, delay: i * 160, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    });
  },
  scenes: [PlayScene],
  strings: {
    tr: { undo: 'GERİ AL', shuffle: 'KARIŞTIR', trayFull: 'TEPSİ DOLDU!' },
    en: { undo: 'UNDO', shuffle: 'SHUFFLE', trayFull: 'TRAY FULL!' },
  },
});
