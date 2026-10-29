import { launch, loadAudio, kenney, type GameMeta } from '@core';
import meta from './game.json';
import { PlayScene, BUBBLE_COLORS } from './PlayScene';

const J = 'oga/junkala-sfx/';

launch({
  meta: meta as GameMeta,
  background: '#141026',
  physics: 'none',
  preload(scene) {
    const l = scene.load;
    // the orange set is numbered one lower than the other colours (34 = outlined circle)
    BUBBLE_COLORS.forEach((c, i) => l.image(`b${i}`, kenney(`puzzle2/png/tiles_${c}/tile${c}_${c === 'orange' ? 34 : 35}.png`)));
    l.image('spark', kenney('puzzle2/png/particles_white/particlewhite_1.png'));
    loadAudio(l, 'shoot1', J + 'movement/jumping-and-landing/sfx-movement-jump2');
    loadAudio(l, 'shoot2', J + 'movement/jumping-and-landing/sfx-movement-jump3');
    loadAudio(l, 'bounce', J + 'movement/jumping-and-landing/sfx-movement-jump14-landing');
    loadAudio(l, 'stick', J + 'movement/jumping-and-landing/sfx-movement-jump12-landing');
    loadAudio(l, 'pop', J + 'general-sounds/simple-bleeps/sfx-sounds-blip11');
    loadAudio(l, 'combo', J + 'general-sounds/positive-sounds/sfx-sounds-powerup11');
    loadAudio(l, 'drop', J + 'movement/falling-sounds/sfx-sounds-falling11');
    loadAudio(l, 'coins', J + 'general-sounds/coins/sfx-coin-cluster2');
    loadAudio(l, 'row', J + 'general-sounds/impacts/sfx-sounds-impact11');
    loadAudio(l, 'danger', J + 'general-sounds/alarms/low-health-alarms/sfx-lowhealth-alarmloop7');
    loadAudio(l, 'swap', J + 'general-sounds/menu-sounds/sfx-menu-move5');
    loadAudio(l, 'level', J + 'general-sounds/fanfares/sfx-sounds-fanfare1');
    loadAudio(l, 'lose', J + 'general-sounds/negative-sounds/sfx-sounds-negative2');
  },
  menuDecor(scene) {
    const { width, height } = scene.scale;
    const spots = [[0.12, 0.08], [0.3, 0.05], [0.7, 0.06], [0.88, 0.1], [0.15, 0.82], [0.85, 0.84], [0.5, 0.86]];
    spots.forEach(([x, y], i) => {
      const b = scene.add.image(width * x, height * y, `b${i % BUBBLE_COLORS.length}`).setDisplaySize(84, 84).setAlpha(0.85);
      scene.tweens.add({ targets: b, y: b.y - 16, duration: 900 + i * 130, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    });
  },
  scenes: [PlayScene],
  strings: {
    tr: { clear: 'TAHTA TEMİZ!', newRow: 'YENİ SIRA!', shots: 'ATIŞ' },
    en: { clear: 'BOARD CLEAR!', newRow: 'NEW ROW!', shots: 'SHOTS' },
  },
});
