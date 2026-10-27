import { launch, loadSfx, type GameMeta } from '@core';
import meta from './game.json';
import { PlayScene } from './PlayScene';

launch({
  meta: meta as GameMeta,
  background: '#17132a',
  physics: 'none',
  preload(scene) {
    const l = scene.load;
    loadSfx(l, 'slide', 'sfx-interface/audio/scroll_002');
    loadSfx(l, 'merge', 'sfx-digital/audio/pepsound2');
    loadSfx(l, 'bump', 'sfx-interface/audio/tick_004');
    loadSfx(l, 'undo', 'sfx-interface/audio/back_003');
    loadSfx(l, 'level', 'sfx-digital/audio/powerup4');
    loadSfx(l, 'win', 'sfx-digital/audio/threetone1');
    loadSfx(l, 'over', 'sfx-digital/audio/lowdown');
  },
  menuDecor(scene) {
    const { width, height } = scene.scale;
    const tiles: Array<[number, number, string, number]> = [
      [0.15, 0.08, '2', 0x5b6ee1], [0.38, 0.1, '8', 0x2fc9b3], [0.62, 0.08, '64', 0xffd23f], [0.85, 0.1, '512', 0xec3013],
      [0.2, 0.86, '2048', 0x8b5cff], [0.5, 0.88, '16', 0x5dff7a], [0.8, 0.86, '128', 0xffa53a],
    ];
    tiles.forEach(([x, y, s, col], i) => {
      const c = scene.add.container(width * x, height * y);
      c.add(scene.add.rectangle(0, 0, 120, 120, col).setStrokeStyle(5, 0x000000));
      c.add(scene.add.text(0, 0, s, { fontFamily: '"Press Start 2P"', fontSize: s.length > 3 ? '24px' : '34px', color: '#fff', stroke: '#000', strokeThickness: 5 }).setOrigin(0.5));
      c.setAngle(i % 2 ? 6 : -6).setAlpha(0.85);
      scene.tweens.add({ targets: c, y: c.y - 12, duration: 1000 + i * 130, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    });
  },
  scenes: [PlayScene],
  strings: {
    tr: {
      maxTile: 'EN BÜYÜK', undo: 'GERİ', goal: 'HEDEF: 2048', hint: 'Kaydır ya da ok tuşlarını kullan. Aynı sayılar birleşir!',
      noMoves: 'HAMLE YOK!', stuckUndo: 'Hamle kalmadı! Geri al?', made2048: '2048 YAPTIN!', keepGoing: 'Devam edip rekoru zorla ya da bitir.',
      continue: 'DEVAM', finish: 'BİTİR',
    },
    en: {
      maxTile: 'MAX TILE', undo: 'UNDO', goal: 'GOAL: 2048', hint: 'Swipe or use the arrow keys. Equal numbers merge!',
      noMoves: 'NO MOVES!', stuckUndo: 'No moves left! Undo?', made2048: 'YOU MADE 2048!', keepGoing: 'Keep going for a higher score, or finish now.',
      continue: 'CONTINUE', finish: 'FINISH',
    },
  },
});
