import { launch, kenney, loadSfx, type GameMeta } from '@core';
import meta from './game.json';
import { PlayScene } from './PlayScene';

const BG = 'boardgame/png/chips/';

launch({
  meta: meta as GameMeta,
  background: '#0d2418',
  physics: 'none',
  preload(scene) {
    const l = scene.load;
    l.image('disc-b', kenney(BG + 'chipblackwhite_border.png'));
    l.image('disc-w', kenney(BG + 'chipwhite_border.png'));
    loadSfx(l, 'place', 'sfx-casino/audio/chiplay1');
    loadSfx(l, 'place2', 'sfx-casino/audio/chiplay3');
    loadSfx(l, 'flip', 'sfx-casino/audio/chipshandle2');
    loadSfx(l, 'move', 'sfx-interface/audio/tick_002');
    loadSfx(l, 'error', 'sfx-interface/audio/error_004');
    loadSfx(l, 'pass', 'sfx-interface/audio/question_002');
    loadSfx(l, 'win', 'sfx-digital/audio/powerup3');
    loadSfx(l, 'lose', 'sfx-digital/audio/phaserdown3');
    loadSfx(l, 'clear', 'sfx-casino/audio/chipscollide3');
  },
  menuDecor(scene) {
    const { width, height } = scene.scale;
    [[-1, -1, 'disc-w'], [1, -1, 'disc-b'], [-1, 1, 'disc-b'], [1, 1, 'disc-w']].forEach(([dx, dy, k]) => {
      scene.add.image(width / 2 + (dx as number) * 44, height * 0.84 + (dy as number) * 44, k as string).setScale(1.2);
    });
  },
  scenes: [PlayScene],
  strings: {
    tr: {
      yourTurn: 'SENİN SIRAN', aiTurn: 'RAKİP DÜŞÜNÜYOR', pass: 'PAS!', you: 'SEN', cpu: 'RAKİP',
      roundWin: 'KAZANDIN!', roundLose: 'KAYBETTİN', roundDraw: 'BERABERE',
      rival: 'Rakip: {name}', streak: 'Seri: {n}', keysHint: 'Oklar: seç · Boşluk: oyna',
      d0: 'Acemi', d1: 'Kolay', d2: 'Orta', d3: 'Zor', d4: 'Uzman', d5: 'Efsane',
    },
    en: {
      yourTurn: 'YOUR TURN', aiTurn: 'AI THINKING', pass: 'PASS!', you: 'YOU', cpu: 'CPU',
      roundWin: 'YOU WIN!', roundLose: 'YOU LOSE', roundDraw: 'DRAW',
      rival: 'Rival: {name}', streak: 'Streak: {n}', keysHint: 'Arrows: pick · Space: play',
      d0: 'Rookie', d1: 'Easy', d2: 'Medium', d3: 'Hard', d4: 'Expert', d5: 'Legend',
    },
  },
});
