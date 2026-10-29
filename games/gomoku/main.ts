import { launch, loadAudio, loadSfx, type GameMeta } from '@core';
import meta from './game.json';
import { PlayScene } from './PlayScene';

launch({
  meta: meta as GameMeta,
  background: '#1c140c',
  physics: 'none',
  preload(scene) {
    const l = scene.load;
    const J = 'oga/junkala-sfx/general-sounds/';
    loadSfx(l, 'place', 'sfx-casino/audio/chiplay1');
    loadSfx(l, 'place2', 'sfx-casino/audio/chiplay3');
    loadSfx(l, 'clear', 'sfx-casino/audio/chipscollide3');
    loadAudio(l, 'move', J + 'menu-sounds/sfx-menu-move2');
    loadAudio(l, 'turn', J + 'simple-bleeps/sfx-sounds-blip7');
    loadAudio(l, 'chime', J + 'coins/sfx-coin-single2');
    loadAudio(l, 'error', J + 'negative-sounds/sfx-sounds-error3');
    loadAudio(l, 'win', J + 'fanfares/sfx-sounds-fanfare2');
    loadAudio(l, 'lose', J + 'negative-sounds/sfx-sounds-negative1');
    loadAudio(l, 'draw', J + 'neutral-sounds/sfx-sound-neutral6');
  },
  menuDecor(scene) {
    const { width, height } = scene.scale;
    const g = scene.add.graphics();
    const y0 = height * 0.87, gap = 44;
    g.fillStyle(0xd9a55a, 0.9).fillRoundedRect(width / 2 - 150, y0 - 56, 300, 112, 12);
    g.lineStyle(2, 0x5a3a16);
    for (let k = 0; k < 7; k++) g.lineBetween(width / 2 - 132 + k * gap, y0 - 50, width / 2 - 132 + k * gap, y0 + 50);
    for (let k = 0; k < 3; k++) g.lineBetween(width / 2 - 140, y0 - gap + k * gap, width / 2 + 140, y0 - gap + k * gap);
    for (let k = 0; k < 5; k++) {
      const c = scene.add.circle(width / 2 - 132 + (k + 1) * gap, y0 - gap + (k % 2) * gap, 18, k % 2 ? 0xf1eee6 : 0x1a1a1e).setStrokeStyle(2, 0x000000, 0.5);
      scene.tweens.add({ targets: c, scale: 1.12, duration: 500, delay: k * 120, yoyo: true, repeat: -1 });
    }
  },
  scenes: [PlayScene],
  strings: {
    tr: {
      yourTurn: 'SIRA SENDE', aiTurn: 'RAKİP DÜŞÜNÜYOR', cpu: 'RAKİP',
      roundWin: 'KAZANDIN!', roundLose: 'KAYBETTİN', roundDraw: 'BERABERE',
      rival: 'Rakip: {name}', lv: 'Seviye {n}', streak: 'Seri: {n}',
      keysHint: 'Oklar: seç · Boşluk: taş koy · Fare: tıkla', touchHint: 'Dokun: nişan al · Tekrar dokun: taş koy',
      d0: 'Acemi', d1: 'Çırak', d2: 'Usta', d3: 'Zorlu', d4: 'Uzman', d5: 'Büyükusta',
    },
    en: {
      yourTurn: 'YOUR TURN', aiTurn: 'AI THINKING', cpu: 'CPU',
      roundWin: 'YOU WIN!', roundLose: 'YOU LOSE', roundDraw: 'DRAW',
      rival: 'Rival: {name}', lv: 'Level {n}', streak: 'Streak: {n}',
      keysHint: 'Arrows: aim · Space: place · Mouse: click', touchHint: 'Tap: aim · Tap again: place',
      d0: 'Rookie', d1: 'Apprentice', d2: 'Adept', d3: 'Tough', d4: 'Expert', d5: 'Grandmaster',
    },
  },
});
