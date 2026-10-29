import { launch, kenney, loadAudio, type GameMeta } from '@core';
import meta from './game.json';
import { PlayScene } from './PlayScene';

launch({
  meta: meta as GameMeta,
  background: '#14213d',
  physics: 'none',
  preload(scene) {
    const l = scene.load;
    l.image('tile', kenney('letter-tiles/png/blue/letter.png'));
    for (const c of ['a', 'b', 'c', 'd']) l.image('menu-' + c, kenney(`letter-tiles/png/wood/letter_${c}.png`));
    const J = 'oga/junkala-sfx/general-sounds/';
    loadAudio(l, 'tap', J + 'simple-bleeps/sfx-sounds-blip3');
    loadAudio(l, 'tick', J + 'menu-sounds/sfx-menu-move4');
    loadAudio(l, 'wrong', J + 'negative-sounds/sfx-sounds-error8');
    loadAudio(l, 'found', J + 'coins/sfx-coin-cluster3');
    loadAudio(l, 'clear', J + 'fanfares/sfx-sounds-fanfare1');
    loadAudio(l, 'hint', J + 'high-pitched-sounds/sfx-sounds-high7');
    loadAudio(l, 'warn', J + 'simple-bleeps/sfx-sounds-blip10');
    loadAudio(l, 'timeup', J + 'negative-sounds/sfx-sounds-negative1');
    loadAudio(l, 'start', J + 'pause-sounds/sfx-sounds-pause4-in');
  },
  menuDecor(scene) {
    const { width, height } = scene.scale;
    ['menu-a', 'menu-b', 'menu-c', 'menu-d'].forEach((k, i) => {
      const img = scene.add.image(width / 2 + (i - 1.5) * 120, height * 0.86, k).setDisplaySize(100, 100).setAngle((i % 2 ? 1 : -1) * 6);
      scene.tweens.add({ targets: img, y: img.y - 14, duration: 700, delay: i * 140, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    });
  },
  scenes: [PlayScene],
  strings: {
    tr: { hint: 'İPUCU', timeUp: 'SÜRE BİTTİ!', timeBonus: 'BONUS', allFound: 'HEPSİNİ BULDUN!' },
    en: { hint: 'HINT', timeUp: "TIME'S UP!", timeBonus: 'BONUS', allFound: 'ALL FOUND!' },
  },
});
