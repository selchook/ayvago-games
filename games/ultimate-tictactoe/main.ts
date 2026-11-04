import { launch, loadAudio, loadSfx, type GameMeta } from '@core';
import meta from './game.json';
import { PlayScene, makeMarkTextures } from './PlayScene';

launch({
  meta: meta as GameMeta,
  background: '#12102a',
  physics: 'none',
  preload(scene) {
    const l = scene.load;
    const J = 'oga/junkala-sfx/general-sounds/';
    loadAudio(l, 'markX', J + 'interactions/sfx-sounds-interaction5');
    loadAudio(l, 'markO', J + 'interactions/sfx-sounds-interaction6');
    loadAudio(l, 'boardWin', J + 'positive-sounds/sfx-sounds-powerup10');
    loadAudio(l, 'boardLose', J + 'negative-sounds/sfx-sounds-negative2');
    loadAudio(l, 'fill', J + 'neutral-sounds/sfx-sound-neutral3');
    loadAudio(l, 'move', J + 'menu-sounds/sfx-menu-move2');
    loadAudio(l, 'turn', J + 'simple-bleeps/sfx-sounds-blip7');
    loadAudio(l, 'chime', J + 'coins/sfx-coin-single2');
    loadAudio(l, 'error', J + 'negative-sounds/sfx-sounds-error3');
    loadAudio(l, 'win', J + 'fanfares/sfx-sounds-fanfare2');
    loadAudio(l, 'lose', J + 'negative-sounds/sfx-sounds-negative1');
    loadAudio(l, 'draw', J + 'neutral-sounds/sfx-sound-neutral6');
    loadSfx(l, 'clear', 'sfx-casino/audio/chipscollide3');
  },
  menuDecor(scene) {
    makeMarkTextures(scene);
    const { width, height } = scene.scale;
    const cx = width / 2, cy = height * 0.855, s = 52, gap = 6;
    const g = scene.add.graphics();
    for (let b = 0; b < 9; b++) {
      const x = cx + ((b % 3) - 1) * (s + gap) - s / 2, y = cy + (Math.floor(b / 3) - 1) * (s + gap) - s / 2;
      g.fillStyle(0x2e2860).fillRoundedRect(x, y, s, s, 6);
      g.lineStyle(2, 0x6c64b8);
      g.lineBetween(x + s / 3, y + 4, x + s / 3, y + s - 4).lineBetween(x + (2 * s) / 3, y + 4, x + (2 * s) / 3, y + s - 4);
      g.lineBetween(x + 4, y + s / 3, x + s - 4, y + s / 3).lineBetween(x + 4, y + (2 * s) / 3, x + s - 4, y + (2 * s) / 3);
    }
    [0, 4, 8].forEach((b, k) => {
      const x = cx + ((b % 3) - 1) * (s + gap), y = cy + (Math.floor(b / 3) - 1) * (s + gap);
      const m = scene.add.image(x, y, k === 1 ? 'ut-o' : 'ut-x').setDisplaySize(44, 44);
      scene.tweens.add({ targets: m, scale: m.scale * 1.15, duration: 520, delay: k * 160, yoyo: true, repeat: -1 });
    });
  },
  scenes: [PlayScene],
  strings: {
    tr: {
      aiTurn: 'RAKİP DÜŞÜNÜYOR', cpu: 'RAKİP', anywhere: 'İSTEDİĞİN YERE',
      roundWin: 'KAZANDIN!', roundLose: 'KAYBETTİN', roundDraw: 'BERABERE',
      rival: 'Rakip: {name}', lv: 'Seviye {n}', streak: 'Seri: {n}', boards: 'Tahta: {n}',
      keysHint: 'Oklar: seç · Boşluk: oyna · Fare: tıkla', touchHint: 'Parlayan tahtada bir kareye dokun',
      d0: 'Acemi', d1: 'Çırak', d2: 'Usta', d3: 'Zorlu', d4: 'Uzman', d5: 'Büyükusta',
    },
    en: {
      aiTurn: 'AI THINKING', cpu: 'CPU', anywhere: 'PLAY ANYWHERE',
      roundWin: 'YOU WIN!', roundLose: 'YOU LOSE', roundDraw: 'DRAW',
      rival: 'Rival: {name}', lv: 'Level {n}', streak: 'Streak: {n}', boards: 'Boards: {n}',
      keysHint: 'Arrows: aim · Space: play · Mouse: click', touchHint: 'Tap a square on a glowing board',
      d0: 'Rookie', d1: 'Apprentice', d2: 'Adept', d3: 'Tough', d4: 'Expert', d5: 'Grandmaster',
    },
  },
});
