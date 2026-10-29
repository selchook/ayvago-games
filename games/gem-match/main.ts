import { launch, loadAudio, kenney, type GameMeta } from '@core';
import meta from './game.json';
import { PlayScene, GEM_FILES } from './PlayScene';

const J = 'oga/junkala-sfx/';

launch({
  meta: meta as GameMeta,
  background: '#1a1030',
  physics: 'none',
  preload(scene) {
    const l = scene.load;
    GEM_FILES.forEach((f, i) => l.image(`gem${i}`, kenney(`puzzle/png/element_${f}_glossy.png`)));
    l.image('gm-selector', kenney('puzzle/png/selectora.png'));
    l.image('gm-star', kenney('puzzle/png/particlestar.png'));
    loadAudio(l, 'swap', J + 'general-sounds/interactions/sfx-sounds-interaction18');
    loadAudio(l, 'cursor', J + 'general-sounds/menu-sounds/sfx-menu-move2');
    loadAudio(l, 'select', J + 'general-sounds/buttons/sfx-sounds-button11');
    loadAudio(l, 'bad', J + 'general-sounds/negative-sounds/sfx-sounds-error3');
    loadAudio(l, 'match', J + 'general-sounds/high-pitched-sounds/sfx-sounds-high3');
    loadAudio(l, 'combo', J + 'general-sounds/positive-sounds/sfx-sounds-powerup11');
    loadAudio(l, 'special', J + 'general-sounds/positive-sounds/sfx-sounds-powerup4');
    loadAudio(l, 'line', J + 'weapons/lasers/sfx-wpn-laser6');
    loadAudio(l, 'bomb', J + 'explosions/short/sfx-exp-short-soft3');
    loadAudio(l, 'rainbow', J + 'general-sounds/weird-sounds/sfx-sound-bling');
    loadAudio(l, 'land', J + 'movement/jumping-and-landing/sfx-movement-jump16-landing');
    loadAudio(l, 'shuffle', J + 'general-sounds/interactions/sfx-sounds-interaction13');
    loadAudio(l, 'low', J + 'general-sounds/alarms/low-health-alarms/sfx-lowhealth-alarmloop6');
    loadAudio(l, 'fail', J + 'general-sounds/negative-sounds/sfx-sounds-negative2');
    loadAudio(l, 'clear', J + 'general-sounds/fanfares/sfx-sounds-fanfare1');
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
