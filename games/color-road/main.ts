import { launch, loadAudio, loadSfx, type GameMeta } from '@core';
import meta from './game.json';
import { PlayScene } from './PlayScene';
import { PALETTE, makeSymbols } from './symbols';

const J = 'oga/junkala-sfx/general-sounds/';

launch({
  meta: meta as GameMeta,
  background: '#120c2a',
  physics: 'none',
  preload(scene) {
    const l = scene.load;
    loadAudio(l, 'smash', J + 'impacts/sfx-sounds-impact3');
    loadAudio(l, 'gem', J + 'coins/sfx-coin-double4');
    loadAudio(l, 'combo', J + 'positive-sounds/sfx-sounds-powerup4');
    loadAudio(l, 'switch', J + 'positive-sounds/sfx-sounds-powerup10');
    loadAudio(l, 'pass', J + 'simple-bleeps/sfx-sounds-blip6');
    loadAudio(l, 'level', J + 'fanfares/sfx-sounds-fanfare3');
    loadAudio(l, 'wrong', J + 'negative-sounds/sfx-sounds-damage2');
    loadSfx(l, 'shatter', 'sfx-impact/audio/impactglass_heavy_001');
  },
  menuDecor(scene) {
    makeSymbols(scene);
    const { width, height } = scene.scale;
    // a road vanishing to a point, a ball and coloured blocks rushing at it
    const g = scene.add.graphics();
    const hy = height * 0.76, by = height * 0.97;
    g.fillStyle(0x221a3d, 1).fillTriangle(width / 2, hy, width / 2 - 300, by, width / 2 + 300, by);
    g.lineStyle(6, 0xff4fa3, 0.9).lineBetween(width / 2, hy, width / 2 - 300, by).lineBetween(width / 2, hy, width / 2 + 300, by);
    [0, 1, 2].forEach((c, i) => {
      const r = scene.add.container(width / 2 + (i - 1) * 16, hy + 10).setScale(0.15);
      r.add([scene.add.rectangle(0, 0, 110, 80, PALETTE[c]).setStrokeStyle(4, 0x000000, 0.6), scene.add.image(0, 0, `sym-${c}`).setScale(0.8)]);
      scene.tweens.add({
        targets: r, x: width / 2 + (i - 1) * 190, y: by - 50, scale: 1, alpha: { from: 1, to: 0.2 },
        duration: 1600, delay: i * 520, repeat: -1, ease: 'Quad.easeIn',
      });
    });
  },
  scenes: [PlayScene],
  strings: {
    tr: {
      hint: 'Sağa sola sürükle ya da ok tuşlarını kullan. Sadece kendi rengindeki bloklara çarp!',
      wrong: 'YANLIŞ RENK!', comboLost: 'KOMBO BİTTİ',
    },
    en: {
      hint: 'Drag sideways or use the arrow keys. Hit only blocks of your own colour!',
      wrong: 'WRONG COLOUR!', comboLost: 'COMBO LOST',
    },
  },
});
