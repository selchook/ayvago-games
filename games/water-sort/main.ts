import { launch, loadAudio, loadSfx, type GameMeta } from '@core';
import meta from './game.json';
import { PlayScene } from './PlayScene';
import { makeTextures, drawGlass, drawLiquid, TUBE_H } from './art';

const J = 'oga/junkala-sfx/general-sounds/';

launch({
  meta: meta as GameMeta,
  background: '#14102a',
  physics: 'none',
  preload(scene) {
    const l = scene.load;
    loadAudio(l, 'pick', J + 'menu-sounds/sfx-menu-move3');
    loadAudio(l, 'putback', J + 'menu-sounds/sfx-menu-move1');
    loadSfx(l, 'pour1', 'sfx-interface/audio/drop_001');
    loadSfx(l, 'pour2', 'sfx-interface/audio/drop_002');
    loadSfx(l, 'pour3', 'sfx-interface/audio/drop_003');
    loadAudio(l, 'error', J + 'negative-sounds/sfx-sounds-error3');
    loadAudio(l, 'full', J + 'coins/sfx-coin-double3');
    loadAudio(l, 'clear', J + 'fanfares/sfx-sounds-fanfare1');
    loadAudio(l, 'undo', J + 'interactions/sfx-sounds-interaction5');
    loadAudio(l, 'addtube', J + 'positive-sounds/sfx-sounds-powerup10');
    loadAudio(l, 'tick', J + 'simple-bleeps/sfx-sounds-blip2');
    loadAudio(l, 'fail', J + 'negative-sounds/sfx-sounds-negative2');
    loadAudio(l, 'bonus', J + 'positive-sounds/sfx-sounds-powerup4');
  },
  menuDecor(scene) {
    makeTextures(scene);
    const { width, height } = scene.scale;
    const sets = [[0, 1, 0, 2], [2, 2, 1, 0], [1, 3, 3, 1], [3, 0, 2, 3]];
    sets.forEach((layers, i) => {
      const x = width / 2 + (i - 1.5) * 120, y = height * 0.795;
      const c = scene.add.container(x, y).setScale(0.62).setAlpha(0.9);
      const liquid = scene.add.graphics();
      drawLiquid(liquid, layers);
      const glass = scene.add.graphics();
      drawGlass(glass);
      c.add([liquid, glass]);
      layers.forEach((col, k) => c.add(scene.add.image(0, TUBE_H - 8 - (k + 0.5) * 54, `sym-${col}`)));
      scene.tweens.add({ targets: c, y: y - 14, duration: 1100 + i * 140, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    });
  },
  scenes: [PlayScene],
  strings: {
    tr: {
      undo: 'GERİ AL', addTube: '+ TÜP', par: 'HEDEF', mult: 'ÇARPAN',
      noMoves: 'Hamle kalmadı!\nGeri al ya da tüp ekle.', stuck: 'SIKIŞTIN!', timeUp: 'SÜRE BİTTİ!',
      clean: 'TEMİZ! ÇARPAN x{n}', fewMoves: 'AZ HAMLE +{n}', timeBonus: 'SÜRE +{n}', hurry: 'ACELE ET!',
      used: 'KULLANILDI', keysHint: 'Oklar + Boşluk · Z: geri al · X: tüp ekle',
    },
    en: {
      undo: 'UNDO', addTube: '+ TUBE', par: 'PAR', mult: 'MULTIPLIER',
      noMoves: 'No moves left!\nUndo or add a tube.', stuck: 'STUCK!', timeUp: "TIME'S UP!",
      clean: 'CLEAN! MULTIPLIER x{n}', fewMoves: 'FEW MOVES +{n}', timeBonus: 'TIME +{n}', hurry: 'HURRY UP!',
      used: 'USED', keysHint: 'Arrows + Space · Z: undo · X: add tube',
    },
  },
});
