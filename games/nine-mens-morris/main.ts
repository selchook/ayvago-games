import { launch, loadAudio, loadSfx, type GameMeta } from '@core';
import meta from './game.json';
import { PlayScene, makeMorrisTextures } from './PlayScene';

launch({
  meta: meta as GameMeta,
  background: '#1a1410',
  physics: 'none',
  preload(scene) {
    const l = scene.load;
    const J = 'oga/junkala-sfx/general-sounds/';
    loadSfx(l, 'place', 'sfx-casino/audio/chiplay1');
    loadSfx(l, 'place2', 'sfx-casino/audio/chiplay3');
    loadSfx(l, 'pick', 'sfx-casino/audio/chipshandle2');
    loadSfx(l, 'clear', 'sfx-casino/audio/chipscollide3');
    loadAudio(l, 'mill', J + 'positive-sounds/sfx-sounds-powerup10');
    loadAudio(l, 'capture', J + 'impacts/sfx-sounds-impact8');
    loadAudio(l, 'move', J + 'menu-sounds/sfx-menu-move2');
    loadAudio(l, 'turn', J + 'simple-bleeps/sfx-sounds-blip7');
    loadAudio(l, 'error', J + 'negative-sounds/sfx-sounds-error3');
    loadAudio(l, 'win', J + 'fanfares/sfx-sounds-fanfare2');
    loadAudio(l, 'lose', J + 'negative-sounds/sfx-sounds-negative1');
    loadAudio(l, 'draw', J + 'neutral-sounds/sfx-sound-neutral6');
  },
  menuDecor(scene) {
    makeMorrisTextures(scene);
    const { width, height } = scene.scale;
    const cx = width / 2, cy = height * 0.86, u = 30;
    const g = scene.add.graphics();
    g.fillStyle(0xc8924e).fillRoundedRect(cx - 3 * u - 22, cy - 3 * u - 22, 6 * u + 44, 6 * u + 44, 12);
    g.lineStyle(4, 0x4a2c10);
    for (const k of [3, 2, 1]) g.strokeRect(cx - k * u, cy - k * u, 2 * k * u, 2 * k * u);
    g.lineBetween(cx, cy - 3 * u, cx, cy - u).lineBetween(cx, cy + u, cx, cy + 3 * u);
    g.lineBetween(cx - 3 * u, cy, cx - u, cy).lineBetween(cx + u, cy, cx + 3 * u, cy);
    const spots: Array<[number, number, string]> = [[-3, -3, 'mm-1'], [0, -3, 'mm-1'], [3, -3, 'mm-1'], [-1, 1, 'mm-2'], [1, 1, 'mm-2'], [3, 0, 'mm-2']];
    spots.forEach(([x, y, key], k) => {
      const s = scene.add.image(cx + x * u, cy + y * u, key).setDisplaySize(36, 36);
      scene.tweens.add({ targets: s, scale: s.scale * 1.15, duration: 520, delay: k * 120, yoyo: true, repeat: -1 });
    });
  },
  scenes: [PlayScene],
  strings: {
    tr: {
      aiTurn: 'RAKİP DÜŞÜNÜYOR', cpu: 'RAKİP', mill: 'DEĞİRMEN!',
      roundWin: 'KAZANDIN!', roundLose: 'KAYBETTİN', roundDraw: 'BERABERE',
      rival: 'Rakip: {name}', lv: 'Seviye {n}', streak: 'Seri: {n}',
      pPlace: 'Boş bir noktaya taş koy', pPick: 'Oynatacağın taşı seç', pDest: 'Taşı komşu boş noktaya götür',
      pFlyPick: 'Üç taşın kaldı: uçacak taşı seç', pFly: 'İstediğin boş noktaya uç', pTake: 'Rakibin bir taşını al',
      flyNow: 'UÇMA ZAMANI!', drawSoon: 'Taş alınmazsa yakında berabere', rTwo: 'İki taş kaldı', rBlocked: 'Hamle kalmadı', rQuiet: 'Uzun süre taş alınmadı',
      keysHint: 'Oklar: nokta seç · Boşluk: oyna · X: seçimi bırak', touchHint: 'Noktaya dokun · Taşına, sonra hedefe dokun',
      d0: 'Acemi', d1: 'Çırak', d2: 'Usta', d3: 'Zorlu', d4: 'Uzman', d5: 'Büyükusta',
    },
    en: {
      aiTurn: 'AI THINKING', cpu: 'CPU', mill: 'MILL!',
      roundWin: 'YOU WIN!', roundLose: 'YOU LOSE', roundDraw: 'DRAW',
      rival: 'Rival: {name}', lv: 'Level {n}', streak: 'Streak: {n}',
      pPlace: 'Place a stone on an empty point', pPick: 'Pick a stone to move', pDest: 'Move it to a free neighbouring point',
      pFlyPick: 'Three stones left: pick one to fly', pFly: 'Fly to any empty point', pTake: "Take one of your rival's stones",
      flyNow: 'TIME TO FLY!', drawSoon: 'No capture soon means a draw', rTwo: 'Down to two stones', rBlocked: 'No moves left', rQuiet: 'No capture for too long',
      keysHint: 'Arrows: pick a point · Space: play · X: drop selection', touchHint: 'Tap a point · Tap your stone, then its target',
      d0: 'Rookie', d1: 'Apprentice', d2: 'Adept', d3: 'Tough', d4: 'Expert', d5: 'Grandmaster',
    },
  },
});
