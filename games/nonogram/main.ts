import { launch, loadAudio, type GameMeta } from '@core';
import meta from './game.json';
import { PlayScene } from './PlayScene';
import { PUZZLES, PALETTE } from './puzzles';

launch({
  meta: meta as GameMeta,
  background: '#1a1626',
  physics: 'none',
  preload(scene) {
    const l = scene.load;
    const J = 'oga/junkala-sfx/general-sounds/';
    loadAudio(l, 'fill', J + 'simple-bleeps/sfx-sounds-blip5');
    loadAudio(l, 'mark', J + 'simple-bleeps/sfx-sounds-blip8');
    loadAudio(l, 'wrong', J + 'negative-sounds/sfx-sounds-error8');
    loadAudio(l, 'line', J + 'coins/sfx-coin-double3');
    loadAudio(l, 'solved', J + 'fanfares/sfx-sounds-fanfare1');
    loadAudio(l, 'perfect', J + 'coins/sfx-coin-cluster8');
    loadAudio(l, 'reveal', J + 'positive-sounds/sfx-sounds-powerup14');
    loadAudio(l, 'toggle', J + 'buttons/sfx-sounds-button11');
    loadAudio(l, 'move', J + 'menu-sounds/sfx-menu-move2');
    loadAudio(l, 'warn', J + 'high-pitched-sounds/sfx-sounds-high1');
    loadAudio(l, 'timeup', J + 'negative-sounds/sfx-sounds-negative2');
  },
  menuDecor(scene) {
    const { width, height } = scene.scale;
    const rows = PUZZLES[0].rows, s = 26;
    rows.forEach((r, y) => [...r].forEach((c, x) => {
      scene.add.rectangle(width / 2 + (x - 2) * s, height * 0.82 + (y - 2) * s, s - 3, s - 3, c === '.' ? 0x2a2440 : PALETTE[c]);
    }));
  },
  scenes: [PlayScene],
  strings: {
    tr: { fill: 'BOYA', markMode: 'İŞARET', puzzle: 'BULMACA {n}/{m}', solved: 'ÇÖZÜLDÜ!', mistake: 'HATA!', allDone: 'HEPSİ ÇÖZÜLDÜ!', perfect: 'HATASIZ! +300', mistakes: 'Hata', timeUp: 'SÜRE BİTTİ!' },
    en: { fill: 'FILL', markMode: 'MARK', puzzle: 'PUZZLE {n}/{m}', solved: 'SOLVED!', mistake: 'MISTAKE!', allDone: 'ALL SOLVED!', perfect: 'PERFECT! +300', mistakes: 'Mistakes', timeUp: "TIME'S UP!" },
  },
});
