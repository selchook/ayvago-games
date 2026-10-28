import Phaser from 'phaser';
import { launch, kenney, loadSfx, type GameMeta } from '@core';
import meta from './game.json';
import { PlayScene, makeMineTextures, OB } from './PlayScene';

launch({
  meta: meta as GameMeta,
  background: '#0d0f1f',
  physics: 'none',
  preload(scene) {
    const l = scene.load;
    l.spritesheet('ob', kenney('onebit/tilesheet/colored_transparent_packed.png'), { frameWidth: 16, frameHeight: 16 });
    loadSfx(l, 'dig', 'sfx-interface/audio/click_003');
    loadSfx(l, 'flood', 'sfx-interface/audio/drop_002');
    loadSfx(l, 'flag', 'sfx-interface/audio/pluck_001');
    loadSfx(l, 'unflag', 'sfx-interface/audio/pluck_002');
    loadSfx(l, 'boom', 'sfx-digital/audio/lowdown');
    loadSfx(l, 'boom2', 'sfx-impact/audio/impactplate_heavy_002');
    loadSfx(l, 'clear', 'sfx-digital/audio/powerup5');
    loadSfx(l, 'tick', 'sfx-interface/audio/tick_002');
    loadSfx(l, 'mode', 'sfx-interface/audio/switch_002');
    loadSfx(l, 'move', 'sfx-interface/audio/tick_001');
    loadSfx(l, 'nope', 'sfx-interface/audio/error_004');
  },
  menuDecor(scene) {
    makeMineTextures(scene);
    scene.textures.get('ob').setFilter(Phaser.Textures.FilterMode.NEAREST);
    const { width, height } = scene.scale;
    const pattern = ['c', 'o1', 'c', 'f', 'o2', 'c', 'b', 'o1'];
    pattern.forEach((p, i) => {
      const x = width / 2 - 280 + i * 80, y = height * 0.075 + (i % 2) * 30;
      scene.add.image(x, y, p === 'c' || p === 'f' || p === 'b' ? (p === 'b' ? 'ms-boom' : 'ms-cover') : 'ms-open').setDisplaySize(76, 76);
      if (p === 'f') scene.add.image(x, y, 'ob', OB.flag).setScale(3.5);
      if (p === 'b') scene.add.image(x, y, 'ob', OB.bomb).setScale(3.5);
      if (p === 'o1' || p === 'o2') scene.add.text(x, y, p === 'o1' ? '1' : '2', { fontFamily: '"Press Start 2P"', fontSize: '30px', color: p === 'o1' ? '#3ee6ff' : '#5dff7a' }).setOrigin(0.5);
    });
    const bomb = scene.add.image(width / 2, height * 0.84, 'ob', OB.bomb).setScale(9);
    scene.tweens.add({ targets: bomb, angle: { from: -8, to: 8 }, duration: 700, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
  },
  scenes: [PlayScene],
  strings: {
    tr: {
      chooseDiff: 'ZORLUK SEÇ', easy: 'KOLAY', medium: 'ORTA', hard: 'ZOR', mines: 'mayın',
      bestTime: 'En iyi süre', none: '—', modeDig: 'MOD: AÇ', modeFlag: 'MOD: BAYRAK',
      penalty: '-15 SN', cleared: 'TARLA TEMİZ!', newBestTime: 'YENİ SÜRE REKORU!', timeUp: 'SÜRE BİTTİ!',
      firstSafe: 'İlk dokunuş her zaman güvenli', field: 'TARLA', keysHint: '1-2-3 ya da oklar + Boşluk',
    },
    en: {
      chooseDiff: 'CHOOSE DIFFICULTY', easy: 'EASY', medium: 'MEDIUM', hard: 'HARD', mines: 'mines',
      bestTime: 'Best time', none: '—', modeDig: 'MODE: DIG', modeFlag: 'MODE: FLAG',
      penalty: '-15 S', cleared: 'FIELD CLEAR!', newBestTime: 'NEW BEST TIME!', timeUp: "TIME'S UP!",
      firstSafe: 'The first tap is always safe', field: 'FIELD', keysHint: '1-2-3 or arrows + Space',
    },
  },
});
