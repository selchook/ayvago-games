import { launch, kenney, loadAudio, type GameMeta } from '@core';
import meta from './game.json';
import { PlayScene } from './PlayScene';

launch({
  meta: meta as GameMeta,
  background: '#0f1029',
  physics: 'none',
  preload(scene) {
    const l = scene.load;
    l.image('glow', kenney('puzzle2/png/particles_white/particlewhite_4.png'));
    const J = 'oga/junkala-sfx/general-sounds/';
    loadAudio(l, 'line', J + 'menu-sounds/sfx-menu-select2');
    loadAudio(l, 'box', J + 'coins/sfx-coin-single3');
    loadAudio(l, 'move', J + 'menu-sounds/sfx-menu-move2');
    loadAudio(l, 'turn', J + 'simple-bleeps/sfx-sounds-blip7');
    loadAudio(l, 'error', J + 'negative-sounds/sfx-sounds-error3');
    loadAudio(l, 'clear', 'oga/junkala-sfx/movement/portals-and-transitions/sfx-movement-portal2');
    loadAudio(l, 'win', J + 'fanfares/sfx-sounds-fanfare2');
    loadAudio(l, 'lose', J + 'negative-sounds/sfx-sounds-negative1');
    loadAudio(l, 'draw', J + 'neutral-sounds/sfx-sound-neutral6');
  },
  menuDecor(scene) {
    const { width, height } = scene.scale;
    const s = 56, x0 = width / 2 - s * 1.5, y0 = height * 0.87 - s;
    const g = scene.add.graphics();
    g.fillStyle(0x3ee6ff, 0.4).fillRect(x0 + 4, y0 + 4, s - 8, s - 8);
    g.fillStyle(0xff4fa3, 0.4).fillRect(x0 + s * 2 + 4, y0 + s + 4, s - 8, s - 8);
    g.lineStyle(8, 0x3ee6ff).strokeRect(x0, y0, s, s).lineBetween(x0 + s, y0, x0 + s * 2, y0);
    g.lineStyle(8, 0xff4fa3).strokeRect(x0 + s * 2, y0 + s, s, s).lineBetween(x0, y0 + s * 2, x0 + s, y0 + s * 2);
    for (let r = 0; r <= 2; r++) for (let c = 0; c <= 3; c++) scene.add.circle(x0 + c * s, y0 + r * s, 9, 0xf3f2f2);
  },
  scenes: [PlayScene],
  strings: {
    tr: {
      yourTurn: 'SIRA SENDE', again: 'BİR DAHA!', aiTurn: 'RAKİP DÜŞÜNÜYOR', cpu: 'RAKİP',
      roundWin: 'KAZANDIN!', roundLose: 'KAYBETTİN', roundDraw: 'BERABERE',
      rival: 'Rakip: {name}', streak: 'Seri: {n}',
      keysHint: 'Oklar: çizgi seç · X: yön değiştir · Boşluk: çiz', touchHint: 'İki noktanın arasına dokun: çizgi çiz',
      d0: 'Acemi', d1: 'Kolay', d2: 'Kurnaz', d3: 'Zincirci', d4: 'Usta',
    },
    en: {
      yourTurn: 'YOUR TURN', again: 'GO AGAIN!', aiTurn: 'AI THINKING', cpu: 'CPU',
      roundWin: 'YOU WIN!', roundLose: 'YOU LOSE', roundDraw: 'DRAW',
      rival: 'Rival: {name}', streak: 'Streak: {n}',
      keysHint: 'Arrows: pick line · X: flip · Space: draw', touchHint: 'Tap between two dots to draw a line',
      d0: 'Rookie', d1: 'Easy', d2: 'Sly', d3: 'Chainer', d4: 'Master',
    },
  },
});
