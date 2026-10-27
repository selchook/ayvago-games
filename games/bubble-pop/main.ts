import { launch, kenney, loadSfx, type GameMeta } from '@core';
import meta from './game.json';
import { PlayScene, BUBBLE_COLORS } from './PlayScene';

launch({
  meta: meta as GameMeta,
  background: '#141026',
  physics: 'none',
  preload(scene) {
    const l = scene.load;
    // the orange set is numbered one lower than the other colours (34 = outlined circle)
    BUBBLE_COLORS.forEach((c, i) => l.image(`b${i}`, kenney(`puzzle2/png/tiles_${c}/tile${c}_${c === 'orange' ? 34 : 35}.png`)));
    l.image('spark', kenney('puzzle2/png/particles_white/particlewhite_1.png'));
    loadSfx(l, 'shoot', 'sfx-digital/audio/phasejump1');
    loadSfx(l, 'bounce', 'sfx-interface/audio/tick_002');
    loadSfx(l, 'stick', 'sfx-impact/audio/impactglass_light_000');
    loadSfx(l, 'pop', 'sfx-digital/audio/pepsound2');
    loadSfx(l, 'drop', 'sfx-interface/audio/drop_002');
    loadSfx(l, 'row', 'sfx-impact/audio/impactmetal_heavy_000');
    loadSfx(l, 'swap', 'sfx-interface/audio/switch_002');
    loadSfx(l, 'level', 'sfx-digital/audio/powerup3');
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
