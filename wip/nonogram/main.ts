import { launch, loadSfx, type GameMeta } from '@core';
import meta from './game.json';
import { PlayScene } from './PlayScene';
import { PUZZLES, PALETTE } from './puzzles';

launch({
  meta: meta as GameMeta,
  background: '#1a1626',
  physics: 'none',
  preload(scene) {
    const l = scene.load;
    loadSfx(l, 'fill', 'sfx-interface/audio/click_003');
    loadSfx(l, 'mark', 'sfx-interface/audio/tick_002');
    loadSfx(l, 'wrong', 'sfx-interface/audio/error_006');
    loadSfx(l, 'line', 'sfx-interface/audio/confirmation_001');
    loadSfx(l, 'solved', 'sfx-digital/audio/powerup3');
    loadSfx(l, 'reveal', 'sfx-digital/audio/phaserup3');
    loadSfx(l, 'toggle', 'sfx-interface/audio/switch_002');
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
    tr: { fill: 'BOYA', markMode: 'İŞARET', puzzle: 'BULMACA {n}/{m}', solved: 'ÇÖZÜLDÜ!', mistake: 'HATA!', allDone: 'HEPSİ ÇÖZÜLDÜ!' },
    en: { fill: 'FILL', markMode: 'MARK', puzzle: 'PUZZLE {n}/{m}', solved: 'SOLVED!', mistake: 'MISTAKE!', allDone: 'ALL SOLVED!' },
  },
});
