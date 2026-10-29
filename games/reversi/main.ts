import { launch, kenney, loadAudio, loadSfx, type GameMeta } from '@core';
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
    const J = 'oga/junkala-sfx/general-sounds/';
    loadSfx(l, 'place', 'sfx-casino/audio/chiplay1');
    loadSfx(l, 'place2', 'sfx-casino/audio/chiplay3');
    loadSfx(l, 'flip', 'sfx-casino/audio/chipshandle2');
    loadAudio(l, 'move', J + 'menu-sounds/sfx-menu-move2');
    loadAudio(l, 'turn', J + 'simple-bleeps/sfx-sounds-blip7');
    loadAudio(l, 'big', J + 'coins/sfx-coin-double3');
    loadAudio(l, 'error', J + 'negative-sounds/sfx-sounds-error3');
    loadAudio(l, 'pass', J + 'neutral-sounds/sfx-sound-neutral6');
    loadAudio(l, 'win', J + 'fanfares/sfx-sounds-fanfare2');
    loadAudio(l, 'lose', J + 'negative-sounds/sfx-sounds-negative1');
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
      netMine: 'SIRA SENDE', netTheirs: 'RAKİBİN SIRASI',
    },
    en: {
      yourTurn: 'YOUR TURN', aiTurn: 'AI THINKING', pass: 'PASS!', you: 'YOU', cpu: 'CPU',
      roundWin: 'YOU WIN!', roundLose: 'YOU LOSE', roundDraw: 'DRAW',
      rival: 'Rival: {name}', streak: 'Streak: {n}', keysHint: 'Arrows: pick · Space: play',
      d0: 'Rookie', d1: 'Easy', d2: 'Medium', d3: 'Hard', d4: 'Expert', d5: 'Legend',
      netMine: 'YOUR TURN', netTheirs: 'THEIR TURN',
    },
  },
});
