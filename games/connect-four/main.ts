import { launch, kenney, loadAudio, loadSfx, type GameMeta } from '@core';
import meta from './game.json';
import { PlayScene } from './PlayScene';

const BG = 'boardgame/png/chips/';

launch({
  meta: meta as GameMeta,
  background: '#101a3a',
  physics: 'none',
  preload(scene) {
    const l = scene.load;
    l.image('chip-p', kenney(BG + 'chipredwhite_border.png'));
    l.image('chip-ai', kenney(BG + 'chipwhite_border.png'));
    const J = 'oga/junkala-sfx/general-sounds/';
    loadSfx(l, 'drop1', 'sfx-casino/audio/chiplay1');
    loadSfx(l, 'drop2', 'sfx-casino/audio/chiplay2');
    loadAudio(l, 'move', J + 'menu-sounds/sfx-menu-move2');
    loadAudio(l, 'turn', J + 'simple-bleeps/sfx-sounds-blip7');
    loadAudio(l, 'win', J + 'fanfares/sfx-sounds-fanfare2');
    loadAudio(l, 'lose', J + 'negative-sounds/sfx-sounds-negative1');
    loadAudio(l, 'draw', J + 'neutral-sounds/sfx-sound-neutral6');
    loadSfx(l, 'clear', 'sfx-casino/audio/chipscollide2');
    loadAudio(l, 'error', J + 'negative-sounds/sfx-sounds-error3');
  },
  menuDecor(scene) {
    const { width, height } = scene.scale;
    const cols = [0, 1, 2, 3];
    cols.forEach((i) => {
      scene.add.image(width / 2 - 150 + i * 100, height * 0.84 - (i % 2) * 20, i % 2 ? 'chip-ai' : 'chip-p')
        .setScale(1.2).setTint(i % 2 ? 0xffd23f : 0xffffff);
    });
  },
  scenes: [PlayScene],
  strings: {
    tr: {
      yourTurn: 'SENİN SIRAN', aiTurn: 'RAKİP DÜŞÜNÜYOR', you: 'SEN', cpu: 'RAKİP',
      roundWin: 'KAZANDIN!', roundLose: 'KAYBETTİN', roundDraw: 'BERABERE',
      rival: 'Rakip: {name}', streak: 'Seri: {n}', keysHint: '←/→ seç · Boşluk bırak · 1-7 sütun',
      d0: 'Acemi', d1: 'Kolay', d2: 'Orta', d3: 'Zorlu', d4: 'Zor', d5: 'Uzman', d6: 'Efsane',
      netMine: 'SIRA SENDE', netTheirs: 'RAKİBİN SIRASI',
    },
    en: {
      yourTurn: 'YOUR TURN', aiTurn: 'AI THINKING', you: 'YOU', cpu: 'CPU',
      roundWin: 'YOU WIN!', roundLose: 'YOU LOSE', roundDraw: 'DRAW',
      rival: 'Rival: {name}', streak: 'Streak: {n}', keysHint: '←/→ pick · Space drop · 1-7 column',
      d0: 'Rookie', d1: 'Easy', d2: 'Medium', d3: 'Tough', d4: 'Hard', d5: 'Expert', d6: 'Legend',
      netMine: 'YOUR TURN', netTheirs: 'THEIR TURN',
    },
  },
});
