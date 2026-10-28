import { launch, kenney, loadSfx, type GameMeta } from '@core';
import meta from './game.json';
import { PlayScene, PIECES } from './PlayScene';

launch({
  meta: meta as GameMeta,
  background: '#100c24',
  physics: 'none',
  preload(scene) {
    const l = scene.load;
    for (const c of ['red', 'blue', 'green', 'yellow', 'grey']) l.image(`sq-${c}`, kenney(`puzzle/png/element_${c}_square_glossy.png`));
    l.image('sq-purple', kenney('puzzle/png/element_purple_cube_glossy.png'));
    l.image('spark', kenney('puzzle/png/particlestar.png'));
    loadSfx(l, 'move', 'sfx-interface/audio/tick_001');
    loadSfx(l, 'rotate', 'sfx-interface/audio/click_004');
    loadSfx(l, 'lock', 'sfx-impact/audio/impactplate_light_002');
    loadSfx(l, 'harddrop', 'sfx-impact/audio/impactmetal_light_001');
    loadSfx(l, 'hold', 'sfx-interface/audio/switch_002');
    loadSfx(l, 'line', 'sfx-digital/audio/powerup2');
    loadSfx(l, 'tetris', 'sfx-digital/audio/powerup10');
    loadSfx(l, 'levelup', 'sfx-digital/audio/phaserup3');
    loadSfx(l, 'bad', 'sfx-interface/audio/error_004');
  },
  menuDecor(scene) {
    const { width, height } = scene.scale;
    // a little well of messy rows that shimmer
    const rows = ['ZZ.OO.TTT.', 'JZZOOLLTSS', 'JJJ.LLSSII'];
    const size = 44, x0 = width / 2 - 5 * size + size / 2, y0 = height * 0.845;
    const idx = (ch: string) => PIECES.findIndex((p) => p.name === ch);
    rows.forEach((row, r) => [...row].forEach((ch, c) => {
      if (ch === '.') return;
      const def = PIECES[idx(ch)];
      const im = scene.add.image(x0 + c * size, y0 + r * size, def.tex).setDisplaySize(size - 2, size - 2);
      if (def.tint) im.setTint(def.tint);
      scene.tweens.add({ targets: im, alpha: 0.6, duration: 700, delay: (r + c) * 90, yoyo: true, repeat: -1 });
    }));
  },
  scenes: [PlayScene],
  strings: {
    tr: { hold: 'SAKLA', next: 'SIRADAKİ', lines: 'SATIR', single: 'TEK!', double: 'ÇİFT!', triple: 'ÜÇLÜ!', tetris: 'DÖRTLÜ!', b2b: 'ART ARDA!', levelUp: 'SEVİYE ATLADIN!' },
    en: { hold: 'HOLD', next: 'NEXT', lines: 'LINES', single: 'SINGLE!', double: 'DOUBLE!', triple: 'TRIPLE!', tetris: 'QUAD!', b2b: 'BACK TO BACK!', levelUp: 'LEVEL UP!' },
  },
});
