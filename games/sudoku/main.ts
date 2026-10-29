import { launch, loadAudio, type GameMeta } from '@core';
import meta from './game.json';
import { PlayScene } from './PlayScene';

const J = 'oga/junkala-sfx/general-sounds/';

launch({
  meta: meta as GameMeta,
  background: '#0e1024',
  physics: 'none',
  preload(scene) {
    const l = scene.load;
    loadAudio(l, 'move', J + 'menu-sounds/sfx-menu-move1');
    loadAudio(l, 'place', J + 'simple-bleeps/sfx-sounds-blip9');
    loadAudio(l, 'note', J + 'simple-bleeps/sfx-sounds-blip2');
    loadAudio(l, 'toggle', J + 'menu-sounds/sfx-menu-select2');
    loadAudio(l, 'erase', J + 'interactions/sfx-sounds-interaction5');
    loadAudio(l, 'nope', J + 'negative-sounds/sfx-sounds-error1');
    loadAudio(l, 'error', J + 'negative-sounds/sfx-sounds-damage1');
    loadAudio(l, 'fail', J + 'negative-sounds/sfx-sounds-negative1');
    loadAudio(l, 'unit', J + 'coins/sfx-coin-double3');
    loadAudio(l, 'hint', J + 'positive-sounds/sfx-sounds-powerup4');
    loadAudio(l, 'solved', J + 'fanfares/sfx-sounds-fanfare1');
    loadAudio(l, 'start', J + 'menu-sounds/sfx-menu-select4');
  },
  menuDecor(scene) {
    const { width, height } = scene.scale;
    const digits = [5, 3, 0, 0, 7, 0, 6, 0, 0, 1, 9, 5, 0, 9, 8, 0, 0, 0];
    const g = scene.add.graphics();
    // Below the menu's how-to text (three lines end near y 955) and above the bottom buttons.
    const S = 56, x0 = width / 2 - S * 3, y0 = height * 0.765;
    g.fillStyle(0x1b1e3a, 0.9).fillRect(x0, y0, S * 6, S * 3);
    g.lineStyle(2, 0x6a73c4, 0.6);
    for (let k = 0; k <= 6; k++) g.lineBetween(x0 + k * S, y0, x0 + k * S, y0 + 3 * S);
    for (let k = 0; k <= 3; k++) g.lineBetween(x0, y0 + k * S, x0 + 6 * S, y0 + k * S);
    g.lineStyle(5, 0xd8dcff, 1).strokeRect(x0, y0, S * 3, S * 3).strokeRect(x0 + S * 3, y0, S * 3, S * 3);
    digits.forEach((d, i) => {
      if (!d) return;
      scene.add.text(x0 + (i % 6) * S + S / 2, y0 + Math.floor(i / 6) * S + S / 2 + 2, String(d), {
        fontFamily: '"Press Start 2P", monospace', fontSize: '28px', color: i % 4 ? '#f3f2f2' : '#5ee8ff',
      }).setOrigin(0.5);
    });
  },
  scenes: [PlayScene],
  strings: {
    tr: {
      chooseDiff: 'ZORLUK SEÇ', easy: 'KOLAY', medium: 'ORTA', hard: 'ZOR', expert: 'UZMAN',
      clues: 'hazır rakam', bestTime: 'En iyi süre', puzzle: 'Bulmaca',
      runInfo: 'Her çözümden sonra bir üst zorluğa geçersin. Bir bulmacada 3 hata oyunu bitirir.',
      keysSelect: '↑/↓ seç · Enter başla · 1-4 hızlı seçim',
      notes: 'NOT', erase: 'SİL', hint: 'İPUCU', mistakes: 'HATA',
      solved: 'ÇÖZÜLDÜ!', allSolved: 'HEPSİ ÇÖZÜLDÜ!', tooMany: '3 HATA!',
    },
    en: {
      chooseDiff: 'CHOOSE DIFFICULTY', easy: 'EASY', medium: 'MEDIUM', hard: 'HARD', expert: 'EXPERT',
      clues: 'clues', bestTime: 'Best time', puzzle: 'Puzzle',
      runInfo: 'Each solve moves you up one difficulty. 3 mistakes in a puzzle end the game.',
      keysSelect: '↑/↓ choose · Enter start · 1-4 quick pick',
      notes: 'NOTES', erase: 'ERASE', hint: 'HINT', mistakes: 'MISTAKES',
      solved: 'SOLVED!', allSolved: 'ALL SOLVED!', tooMany: '3 MISTAKES!',
    },
  },
});
