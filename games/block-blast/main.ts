import { launch, loadAudio, kenney, type GameMeta } from '@core';
import meta from './game.json';
import { PlayScene, BLOCK_TILES } from './PlayScene';
import { makeBackdrop } from './art';

const J = 'oga/junkala-sfx/';

launch({
  meta: meta as GameMeta,
  background: '#12102a',
  physics: 'none',
  preload(scene) {
    const l = scene.load;
    BLOCK_TILES.forEach((f, i) => l.image(`blk${i}`, kenney(`puzzle2/png/${f}`)));
    loadAudio(l, 'pick', J + 'general-sounds/interactions/sfx-sounds-interaction1');
    loadAudio(l, 'nudge', J + 'general-sounds/menu-sounds/sfx-menu-move3');
    loadAudio(l, 'back', J + 'general-sounds/menu-sounds/sfx-menu-move1');
    loadAudio(l, 'place1', J + 'movement/jumping-and-landing/sfx-movement-jump12-landing');
    loadAudio(l, 'place2', J + 'movement/jumping-and-landing/sfx-movement-jump13-landing');
    loadAudio(l, 'place3', J + 'movement/jumping-and-landing/sfx-movement-jump16-landing');
    loadAudio(l, 'bad', J + 'general-sounds/negative-sounds/sfx-sounds-error3');
    loadAudio(l, 'clear1', J + 'general-sounds/positive-sounds/sfx-sounds-powerup10');
    loadAudio(l, 'clear2', J + 'general-sounds/positive-sounds/sfx-sounds-powerup11');
    loadAudio(l, 'clear3', J + 'general-sounds/positive-sounds/sfx-sounds-powerup18');
    loadAudio(l, 'combo', J + 'general-sounds/fanfares/sfx-sounds-fanfare2');
    loadAudio(l, 'wipe', J + 'general-sounds/fanfares/sfx-sounds-fanfare1');
    loadAudio(l, 'level', J + 'general-sounds/positive-sounds/sfx-sounds-powerup2');
    loadAudio(l, 'refill', J + 'general-sounds/interactions/sfx-sounds-interaction10');
    loadAudio(l, 'stuck', J + 'general-sounds/negative-sounds/sfx-sounds-negative2');
  },
  menuDecor(scene) {
    const { width, height } = scene.scale;
    makeBackdrop(scene);
    scene.add.image(0, 0, 'bb-bg').setOrigin(0);
    // two little pieces in the corners, and blocks falling softly behind the menu
    const cells = [[0, 0], [1, 0], [2, 0], [1, 1]];
    cells.forEach(([c, r], i) => {
      scene.add.image(70 + c * 56, height * 0.05 + r * 56, `blk${i % 6}`).setDisplaySize(54, 54).setAlpha(0.85);
      scene.add.image(width - 70 - c * 56, height * 0.79 + r * 56, `blk${(i + 3) % 6}`).setDisplaySize(54, 54).setAlpha(0.85);
    });
    for (let i = 0; i < 8; i++) {
      const b = scene.add.image(80 + i * 80, -60, `blk${i % 6}`).setDisplaySize(48, 48).setAlpha(0.18);
      scene.tweens.add({ targets: b, y: height + 60, angle: 90, duration: 7000 + i * 700, delay: i * 900, repeat: -1 });
    }
  },
  scenes: [PlayScene],
  strings: {
    tr: { good: 'GÜZEL!', great: 'HARİKA!', amazing: 'MUHTEŞEM!', noFit: 'YER KALMADI!' },
    en: { good: 'NICE!', great: 'GREAT!', amazing: 'AMAZING!', noFit: 'NO ROOM LEFT!' },
  },
});
