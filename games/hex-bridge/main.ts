import Phaser from 'phaser';
import { launch, loadAudio, loadSfx, type GameMeta } from '@core';
import meta from './game.json';
import { PlayScene, makeHexTextures } from './PlayScene';

launch({
  meta: meta as GameMeta,
  background: '#0f1424',
  physics: 'none',
  difficulty: true,
  preload(scene) {
    const l = scene.load;
    const J = 'oga/junkala-sfx/general-sounds/';
    loadSfx(l, 'place', 'sfx-casino/audio/chiplay1');
    loadSfx(l, 'place2', 'sfx-casino/audio/chiplay3');
    loadSfx(l, 'clear', 'sfx-casino/audio/chipscollide3');
    loadAudio(l, 'swap', J + 'positive-sounds/sfx-sounds-powerup13');
    loadAudio(l, 'move', J + 'menu-sounds/sfx-menu-move2');
    loadAudio(l, 'turn', J + 'simple-bleeps/sfx-sounds-blip7');
    loadAudio(l, 'chime', J + 'coins/sfx-coin-single2');
    loadAudio(l, 'error', J + 'negative-sounds/sfx-sounds-error3');
    loadAudio(l, 'win', J + 'fanfares/sfx-sounds-fanfare2');
    loadAudio(l, 'lose', J + 'negative-sounds/sfx-sounds-negative1');
  },
  menuDecor(scene) {
    makeHexTextures(scene);
    const { width, height } = scene.scale;
    const g = scene.add.graphics();
    const s = 20, cx = width / 2, cy = height * 0.855;
    const hex = (x: number, y: number) => {
      const pts: Phaser.Math.Vector2[] = [];
      for (let k = 0; k < 6; k++) pts.push(new Phaser.Math.Vector2(x + s * Math.cos((k * Math.PI) / 3), y + s * Math.sin((k * Math.PI) / 3)));
      return pts;
    };
    const cells: Array<[number, number, string | null]> = [];
    for (let r = -2; r <= 2; r++) for (let c = -1; c <= 1; c++) {
      const x = cx + r * 1.5 * s, y = cy + (c + r / 2) * Math.sqrt(3) * s - 0;
      cells.push([x, y, (r + c) % 3 === 0 ? 'hx-red' : (r - c) % 4 === 1 ? 'hx-blue' : null]);
    }
    for (const [x, y] of cells) { g.fillStyle(0x2c3a60).fillPoints(hex(x, y), true); g.lineStyle(2, 0x5a6a9a).strokePoints(hex(x, y), true, true); }
    cells.forEach(([x, y, key], k) => {
      if (!key) return;
      const st = scene.add.image(x, y, key).setDisplaySize(28, 28);
      scene.tweens.add({ targets: st, scale: st.scale * 1.15, duration: 500, delay: k * 90, yoyo: true, repeat: -1 });
    });
  },
  scenes: [PlayScene],
  strings: {
    tr: {
      aiTurn: 'RAKİP DÜŞÜNÜYOR', cpu: 'RAKİP', swap: 'DEĞİŞTİR', swapOr: 'OYNA YA DA DEĞİŞTİR', swapped: 'DEĞİŞTİ!',
      roundWin: 'KAZANDIN!', roundLose: 'KAYBETTİN',
      rival: 'Rakip: {name}', lv: 'Seviye {n}', streak: 'Seri: {n}',
      redGoal: 'üstten alta', blueGoal: 'soldan sağa',
      keysHint: 'Oklar: seç · Boşluk: taş koy · X: değiştir', touchHint: 'Dokun: nişan al · Tekrar dokun: taş koy',
      d0: 'Acemi', d1: 'Çırak', d2: 'Usta', d3: 'Zorlu', d4: 'Uzman', d5: 'Büyükusta',
    },
    en: {
      aiTurn: 'AI THINKING', cpu: 'CPU', swap: 'SWAP', swapOr: 'PLAY OR SWAP', swapped: 'SWAPPED!',
      roundWin: 'YOU WIN!', roundLose: 'YOU LOSE',
      rival: 'Rival: {name}', lv: 'Level {n}', streak: 'Streak: {n}',
      redGoal: 'top to bottom', blueGoal: 'left to right',
      keysHint: 'Arrows: aim · Space: place · X: swap', touchHint: 'Tap: aim · Tap again: place',
      d0: 'Rookie', d1: 'Apprentice', d2: 'Adept', d3: 'Tough', d4: 'Expert', d5: 'Grandmaster',
    },
  },
});
