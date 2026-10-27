import { launch, kenney, loadSfx, type GameMeta } from '@core';
import meta from './game.json';
import { PlayScene, GEM_FILES } from './PlayScene';

launch({
  meta: meta as GameMeta,
  background: '#1a1030',
  physics: 'none',
  preload(scene) {
    const l = scene.load;
    GEM_FILES.forEach((f, i) => l.image(`gem${i}`, kenney(`puzzle/png/element_${f}_glossy.png`)));
    l.image('gm-selector', kenney('puzzle/png/selectora.png'));
    l.image('gm-star', kenney('puzzle/png/particlestar.png'));
    loadSfx(l, 'swap', 'sfx-interface/audio/switch_002');
    loadSfx(l, 'match', 'sfx-digital/audio/pepsound1');
    loadSfx(l, 'bad', 'sfx-interface/audio/error_004');
    loadSfx(l, 'special', 'sfx-digital/audio/powerup2');
    loadSfx(l, 'line', 'sfx-digital/audio/laser5');
    loadSfx(l, 'bomb', 'sfx-impact/audio/impactglass_heavy_000');
    loadSfx(l, 'rainbow', 'sfx-digital/audio/phaserup3');
    loadSfx(l, 'land', 'sfx-interface/audio/drop_002');
    loadSfx(l, 'select', 'sfx-interface/audio/tick_002');
    loadSfx(l, 'clear', 'sfx-digital/audio/threetone1');
  },
  menuDecor(scene) {
    const { width, height } = scene.scale;
    const pos: Array<[number, number, number]> = [[0.12, 0.08, 0], [0.88, 0.1, 1], [0.2, 0.86, 2], [0.8, 0.85, 3], [0.5, 0.9, 4], [0.1, 0.45, 5], [0.9, 0.45, 0]];
    for (const [x, y, i] of pos) {
      const g = scene.add.image(width * x, height * y, `gem${i}`).setDisplaySize(84, 84).setAlpha(0.85);
      scene.tweens.add({ targets: g, y: g.y - 14, angle: rngSign(i) * 10, duration: 1200 + i * 150, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    }
  },
  scenes: [PlayScene],
  strings: {
    tr: {
      target: 'HEDEF', shuffle: 'KARIŞTIRILIYOR', outOfMoves: 'HAMLE BİTTİ', nice: 'GÜZEL!', great: 'SÜPER!',
      awesome: 'MÜTHİŞ!', bonus: 'BONUS', hint: 'Taşları kaydır, 3 tane eşle!',
    },
    en: {
      target: 'TARGET', shuffle: 'SHUFFLE', outOfMoves: 'OUT OF MOVES', nice: 'NICE!', great: 'GREAT!',
      awesome: 'AWESOME!', bonus: 'BONUS', hint: 'Swap gems to match 3!',
    },
  },
});

function rngSign(i: number): number {
  return i % 2 ? 1 : -1;
}
