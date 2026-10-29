import { launch, kenney, loadAudio, loadSfx, type GameMeta } from '@core';
import meta from './game.json';
import { PlayScene } from './PlayScene';

launch({
  meta: meta as GameMeta,
  background: '#22140b',
  physics: 'none',
  preload(scene) {
    const l = scene.load;
    l.image('pc-w', kenney('boardgame/png/pieces_white/piecewhite_border11.png'));
    l.image('pc-b', kenney('boardgame/png/pieces_black/pieceblack_border11.png'));
    const J = 'oga/junkala-sfx/general-sounds/';
    loadSfx(l, 'place', 'sfx-impact/audio/impactwood_light_000');
    loadSfx(l, 'place2', 'sfx-impact/audio/impactwood_light_003');
    loadSfx(l, 'pick', 'sfx-impact/audio/impactwood_light_002');
    loadSfx(l, 'jump', 'sfx-impact/audio/impactplank_medium_001');
    loadAudio(l, 'capture', J + 'impacts/sfx-sounds-impact8');
    loadAudio(l, 'king', J + 'positive-sounds/sfx-sounds-powerup12');
    loadAudio(l, 'move', J + 'menu-sounds/sfx-menu-move2');
    loadAudio(l, 'turn', J + 'simple-bleeps/sfx-sounds-blip7');
    loadAudio(l, 'error', J + 'negative-sounds/sfx-sounds-error3');
    loadAudio(l, 'win', J + 'fanfares/sfx-sounds-fanfare2');
    loadAudio(l, 'lose', J + 'negative-sounds/sfx-sounds-negative1');
    loadAudio(l, 'draw', J + 'neutral-sounds/sfx-sound-neutral6');
    loadSfx(l, 'clear', 'sfx-casino/audio/chipscollide3');
  },
  menuDecor(scene) {
    const { width, height } = scene.scale;
    const s = 54, x0 = width / 2 - s * 2, y0 = height * 0.87 - s;
    for (let r = 0; r < 2; r++) for (let c = 0; c < 4; c++) {
      scene.add.rectangle(x0 + c * s + s / 2, y0 + r * s + s / 2, s, s, (r + c) % 2 ? 0xc98e4f : 0xe7c08a);
      scene.add.image(x0 + c * s + s / 2, y0 + r * s + s / 2, r ? 'pc-w' : 'pc-b').setDisplaySize(46, 46);
    }
  },
  scenes: [PlayScene],
  strings: {
    tr: {
      yourTurn: 'SIRA SENDE', mustTake: 'TAŞ ALMAK ZORUNLU!', aiTurn: 'RAKİP DÜŞÜNÜYOR', cpu: 'RAKİP', dama: 'DAMA!',
      roundWin: 'KAZANDIN!', roundLose: 'KAYBETTİN', roundDraw: 'BERABERE',
      rival: 'Rakip: {name}', streak: 'Seri: {n}',
      keysHint: 'Oklar: taş / hamle seç · Boşluk: seç / oyna · X: bırak', touchHint: 'Taşa dokun, sonra gideceği kareye dokun',
      d0: 'Acemi', d1: 'Heveskâr', d2: 'Mahalle Ustası', d3: 'Zorlu', d4: 'Uzman', d5: 'Dama Ustası',
    },
    en: {
      yourTurn: 'YOUR TURN', mustTake: 'CAPTURE IS A MUST!', aiTurn: 'AI THINKING', cpu: 'CPU', dama: 'DAMA!',
      roundWin: 'YOU WIN!', roundLose: 'YOU LOSE', roundDraw: 'DRAW',
      rival: 'Rival: {name}', streak: 'Streak: {n}',
      keysHint: 'Arrows: pick piece / move · Space: select / play · X: drop', touchHint: 'Tap a piece, then tap where it goes',
      d0: 'Rookie', d1: 'Amateur', d2: 'Local Hero', d3: 'Tough', d4: 'Expert', d5: 'Dama Master',
    },
  },
});
