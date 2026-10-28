import { launch, kenney, loadSfx, type GameMeta } from '@core';
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
    loadSfx(l, 'tap', 'sfx-interface/audio/click_003');
    loadSfx(l, 'tick', 'sfx-interface/audio/tick_002');
    loadSfx(l, 'wrong', 'sfx-interface/audio/error_004');
    loadSfx(l, 'found', 'sfx-digital/audio/powerup2');
    loadSfx(l, 'clear', 'sfx-digital/audio/threetone2');
    loadSfx(l, 'hint', 'sfx-interface/audio/question_002');
    loadSfx(l, 'warn', 'sfx-interface/audio/tick_004');
    loadSfx(l, 'timeup', 'sfx-digital/audio/phaserdown3');
    loadSfx(l, 'start', 'sfx-interface/audio/maximize_004');
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
