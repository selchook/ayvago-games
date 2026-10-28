import { launch, loadSfx, type GameMeta } from '@core';
import meta from './game.json';
import { PlayScene, makeTileTexture, tileColor } from './PlayScene';

launch({
  meta: meta as GameMeta,
  background: '#121a2e',
  physics: 'none',
  preload(scene) {
    const l = scene.load;
    loadSfx(l, 'slide', 'sfx-interface/audio/scroll_003');
    loadSfx(l, 'bump', 'sfx-interface/audio/tick_004');
    loadSfx(l, 'shuffle', 'sfx-interface/audio/maximize_006');
    loadSfx(l, 'place', 'sfx-interface/audio/drop_003');
    loadSfx(l, 'solved', 'sfx-digital/audio/powerup5');
    loadSfx(l, 'pick', 'sfx-interface/audio/switch_002');
    loadSfx(l, 'move', 'sfx-interface/audio/tick_001');
  },
  menuDecor(scene) {
    makeTileTexture(scene);
    const { width, height } = scene.scale;
    const order = [1, 2, 3, 4, 5, 6, 7, 0, 8];
    order.forEach((v, i) => {
      if (!v) return;
      const x = width / 2 + ((i % 3) - 1) * 70, y = height * 0.83 + (Math.floor(i / 3) - 1) * 70;
      const c = scene.add.container(x, y);
      c.add(scene.add.image(0, 0, 'sp-tile').setDisplaySize(64, 64).setTint(tileColor(v - 1, 3)));
      c.add(scene.add.text(0, 2, String(v), { fontFamily: '"Press Start 2P"', fontSize: '22px', color: '#fff', stroke: '#000', strokeThickness: 5 }).setOrigin(0.5));
      if (v === 8) scene.tweens.add({ targets: c, x: x - 70, duration: 700, yoyo: true, repeat: -1, hold: 500, repeatDelay: 500, ease: 'Cubic.easeInOut' });
    });
    for (let i = 0; i < 6; i++) {
      const s = scene.add.image(width * (0.1 + i * 0.16), height * 0.08 + (i % 2) * 26, 'sp-tile').setDisplaySize(64, 64).setTint(tileColor(i * 3, 5)).setAngle(i % 2 ? 8 : -8);
      scene.tweens.add({ targets: s, y: s.y - 10, duration: 900 + i * 110, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    }
  },
  scenes: [PlayScene],
  strings: {
    tr: {
      chooseSize: 'BOYUT SEÇ', bestMoves: 'En az hamle', bestTime: 'En iyi süre', none: '—', solved: 'ÇÖZÜLDÜ!',
      nextSize: 'Sıradaki: {n}', allSolved: 'HEPSİ ÇÖZÜLDÜ!', record: 'YENİ REKOR!', keysHint: '1-2-3 ya da oklar + Boşluk',
      runInfo: 'Seçtiğin boyuttan başla, 5×5 ile bitir', puzzle: 'BULMACA',
    },
    en: {
      chooseSize: 'CHOOSE SIZE', bestMoves: 'Fewest moves', bestTime: 'Best time', none: '—', solved: 'SOLVED!',
      nextSize: 'Next: {n}', allSolved: 'ALL SOLVED!', record: 'NEW RECORD!', keysHint: '1-2-3 or arrows + Space',
      runInfo: 'Start at any size, finish with 5×5', puzzle: 'PUZZLE',
    },
  },
});
