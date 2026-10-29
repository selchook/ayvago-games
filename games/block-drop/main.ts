import { launch, loadAudio, kenney, type GameMeta } from '@core';
import meta from './game.json';
import { PlayScene, PIECES } from './PlayScene';

const J = 'oga/junkala-sfx/';

launch({
  meta: meta as GameMeta,
  music: { play: 'stage2' },
  background: '#100c24',
  physics: 'none',
  preload(scene) {
    const l = scene.load;
    for (const c of ['red', 'blue', 'green', 'yellow', 'grey']) l.image(`sq-${c}`, kenney(`puzzle/png/element_${c}_square_glossy.png`));
    l.image('sq-purple', kenney('puzzle/png/element_purple_cube_glossy.png'));
    l.image('spark', kenney('puzzle/png/particlestar.png'));
    loadAudio(l, 'move', J + 'general-sounds/menu-sounds/sfx-menu-move4');
    loadAudio(l, 'rotate', J + 'general-sounds/menu-sounds/sfx-menu-move2');
    loadAudio(l, 'lock1', J + 'movement/jumping-and-landing/sfx-movement-jump15-landing');
    loadAudio(l, 'lock2', J + 'movement/jumping-and-landing/sfx-movement-jump18-landing');
    loadAudio(l, 'harddrop', J + 'general-sounds/impacts/sfx-sounds-impact8');
    loadAudio(l, 'hold', J + 'general-sounds/interactions/sfx-sounds-interaction7');
    loadAudio(l, 'line', J + 'general-sounds/positive-sounds/sfx-sounds-powerup5');
    loadAudio(l, 'tetris', J + 'general-sounds/fanfares/sfx-sounds-fanfare1');
    loadAudio(l, 'combo', J + 'general-sounds/coins/sfx-coin-double1');
    loadAudio(l, 'levelup', J + 'general-sounds/positive-sounds/sfx-sounds-powerup8');
    loadAudio(l, 'bad', J + 'general-sounds/negative-sounds/sfx-sounds-error14');
    loadAudio(l, 'danger', J + 'general-sounds/alarms/low-health-alarms/sfx-lowhealth-alarmloop7');
    loadAudio(l, 'topout', J + 'movement/falling-sounds/sfx-sounds-falling1');
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
