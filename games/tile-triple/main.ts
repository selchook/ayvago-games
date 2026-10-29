import { launch, kenney, loadAudio, type GameMeta } from '@core';
import meta from './game.json';
import { PlayScene, ANIMALS } from './PlayScene';

launch({
  meta: meta as GameMeta,
  background: '#1d3b2a',
  physics: 'none',
  preload(scene) {
    const l = scene.load;
    for (const a of ANIMALS) l.image('an-' + a, kenney(`animals/png/round/${a}.png`));
    const J = 'oga/junkala-sfx/general-sounds/';
    loadAudio(l, 'pick', J + 'interactions/sfx-sounds-interaction7');
    loadAudio(l, 'match', J + 'coins/sfx-coin-cluster2');
    loadAudio(l, 'combo', J + 'coins/sfx-coin-cluster5');
    loadAudio(l, 'blocked', J + 'negative-sounds/sfx-sounds-error3');
    loadAudio(l, 'warn', J + 'alarms/low-health-alarms/sfx-lowhealth-alarmloop6');
    loadAudio(l, 'undo', J + 'pause-sounds/sfx-sounds-pause1-out');
    loadAudio(l, 'shuffle', J + 'interactions/sfx-sounds-interaction16');
    loadAudio(l, 'deal', J + 'interactions/sfx-sounds-interaction15');
    loadAudio(l, 'clear', J + 'fanfares/sfx-sounds-fanfare1');
    loadAudio(l, 'lose', J + 'negative-sounds/sfx-sounds-error12');
    loadAudio(l, 'tick', J + 'menu-sounds/sfx-menu-move1');
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
