import { launch, loadAudio, type GameMeta } from '@core';
import meta from './game.json';
import { PlayScene, blockColor } from './PlayScene';

launch({
  meta: meta as GameMeta,
  background: '#1b1830',
  physics: 'none',
  preload(scene) {
    const l = scene.load;
    const J = 'oga/junkala-sfx/';
    loadAudio(l, 'place1', J + 'movement/jumping-and-landing/sfx-movement-jump13-landing');
    loadAudio(l, 'place2', J + 'movement/jumping-and-landing/sfx-movement-jump16-landing');
    loadAudio(l, 'place3', J + 'movement/jumping-and-landing/sfx-movement-jump17-landing');
    loadAudio(l, 'cut', J + 'weapons/melee/sfx-wpn-sword1');
    loadAudio(l, 'perfect', J + 'general-sounds/coins/sfx-coin-single4');
    loadAudio(l, 'grow', J + 'general-sounds/positive-sounds/sfx-sounds-powerup5');
    loadAudio(l, 'miss', J + 'movement/falling-sounds/sfx-sounds-falling11');
    loadAudio(l, 'crash', J + 'explosions/shortest/sfx-exp-shortest-hard7');
    loadAudio(l, 'level', J + 'general-sounds/fanfares/sfx-sounds-fanfare3');
  },
  menuDecor(scene) {
    const { width, height } = scene.scale;
    for (const [x, dir] of [[96, 1], [width - 96, -1]] as const) {
      for (let i = 0; i < 6; i++) {
        const w = 130 - i * 9;
        const b = scene.add.rectangle(x + Math.sin(i * 1.7) * 6 * dir, height - 150 - i * 34, w, 32, blockColor(i * 2)).setStrokeStyle(3, 0x000000, 0.35);
        b.setAlpha(0).setY(b.y - 40);
        scene.tweens.add({ targets: b, alpha: 1, y: b.y + 40, duration: 300, ease: 'Bounce.easeOut', delay: 90 * i + (dir < 0 ? 45 : 0) });
      }
    }
  },
  scenes: [PlayScene],
  strings: {
    tr: { perfect: 'KUSURSUZ!', grow: 'BÜYÜDÜ!', floor: 'KAT', tapDrop: 'Bırakmak için dokun', down: 'KULE YIKILDI!' },
    en: { perfect: 'PERFECT!', grow: 'REGROW!', floor: 'FLOOR', tapDrop: 'Tap to drop', down: 'TOWER DOWN!' },
  },
});
