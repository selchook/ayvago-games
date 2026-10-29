import Phaser from 'phaser';
import { launch, kenney, loadAudio, type GameMeta } from '@core';
import meta from './game.json';
import { PlayScene, makeMineTextures, OB } from './PlayScene';

launch({
  meta: meta as GameMeta,
  background: '#0d0f1f',
  physics: 'none',
  preload(scene) {
    const l = scene.load;
    l.spritesheet('ob', kenney('onebit/tilesheet/colored_transparent_packed.png'), { frameWidth: 16, frameHeight: 16 });
    const J = 'oga/junkala-sfx/general-sounds/';
    const X = 'oga/junkala-sfx/explosions/';
    loadAudio(l, 'dig', J + 'impacts/sfx-sounds-impact1');
    loadAudio(l, 'dig2', J + 'impacts/sfx-sounds-impact6');
    loadAudio(l, 'dig3', J + 'impacts/sfx-sounds-impact7');
    loadAudio(l, 'flood', J + 'interactions/sfx-sounds-interaction12');
    loadAudio(l, 'flag', J + 'buttons/sfx-sounds-button9');
    loadAudio(l, 'unflag', J + 'pause-sounds/sfx-sounds-pause3-out');
    loadAudio(l, 'boom', X + 'short/sfx-exp-short-hard5');
    loadAudio(l, 'penalty', J + 'negative-sounds/sfx-sounds-damage2');
    loadAudio(l, 'bigboom', X + 'long/sfx-exp-long2');
    loadAudio(l, 'pop', X + 'shortest/sfx-exp-shortest-soft7');
    loadAudio(l, 'clear', J + 'fanfares/sfx-sounds-fanfare1');
    loadAudio(l, 'best', J + 'coins/sfx-coin-cluster8');
    loadAudio(l, 'tick', J + 'high-pitched-sounds/sfx-sounds-high1');
    loadAudio(l, 'pick', J + 'menu-sounds/sfx-menu-select2');
    loadAudio(l, 'mode', J + 'buttons/sfx-sounds-button11');
    loadAudio(l, 'move', J + 'menu-sounds/sfx-menu-move3');
    loadAudio(l, 'nope', J + 'negative-sounds/sfx-sounds-error6');
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
