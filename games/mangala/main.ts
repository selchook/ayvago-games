import { launch, loadAudio, loadSfx, rng, type GameMeta } from '@core';
import meta from './game.json';
import { PlayScene, cellRect, BOARD } from './PlayScene';
import { makeStoneTextures, drawBoard } from './art';

launch({
  meta: meta as GameMeta,
  background: '#1d120b',
  physics: 'none',
  preload(scene) {
    const l = scene.load;
    const J = 'oga/junkala-sfx/general-sounds/';
    loadSfx(l, 'pick', 'sfx-casino/audio/chipshandle2');
    loadSfx(l, 'drop', 'sfx-casino/audio/chiplay1');
    loadSfx(l, 'store', 'sfx-impact/audio/impactglass_light_001');
    loadSfx(l, 'clear', 'sfx-casino/audio/chipscollide3');
    loadAudio(l, 'capture', J + 'coins/sfx-coin-cluster3');
    loadAudio(l, 'steal', J + 'negative-sounds/sfx-sounds-damage1');
    loadAudio(l, 'again', J + 'positive-sounds/sfx-sounds-powerup2');
    loadAudio(l, 'move', J + 'menu-sounds/sfx-menu-move2');
    loadAudio(l, 'turn', J + 'simple-bleeps/sfx-sounds-blip7');
    loadAudio(l, 'error', J + 'negative-sounds/sfx-sounds-error3');
    loadAudio(l, 'win', J + 'fanfares/sfx-sounds-fanfare2');
    loadAudio(l, 'lose', J + 'negative-sounds/sfx-sounds-negative1');
    loadAudio(l, 'draw', J + 'neutral-sounds/sfx-sound-neutral6');
  },
  menuDecor(scene) {
    const { width, height } = scene.scale;
    makeStoneTextures(scene);
    // a small mangala board under the menu buttons
    const k = 0.44, cx = width / 2, cy = height * 0.825;
    const cell = (v: number) => {
      const c = cellRect(v);
      return { x: cx + (c.x - 360) * k, y: cy + (c.y - BOARD.mid) * k, w: c.w * k, h: c.h * k };
    };
    drawBoard(scene.add.graphics(), cx - (BOARD.w / 2) * k, cy - (BOARD.h / 2) * k, BOARD.w * k, BOARD.h * k, cell);
    for (let v = 0; v < 14; v++) {
      if (v === 6 || v === 13) continue;
      const c = cell(v);
      for (let s = 0; s < 4; s++) {
        const img = scene.add.image(c.x + (s % 2 ? 9 : -9), c.y + (s < 2 ? -12 : 12), `mg-stone${rng.int(0, 5)}`).setScale(0.75);
        scene.tweens.add({ targets: img, y: img.y - 4, duration: 600 + rng.int(0, 400), yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
      }
    }
  },
  scenes: [PlayScene],
  strings: {
    tr: {
      aiTurn: 'RAKİP DÜŞÜNÜYOR', cpu: 'BİLGİSAYAR', again: 'BİR DAHA!', even: 'ÇİFT!', emptyPit: 'BOŞ KUYU!', sweep: 'TAŞLAR BİTTİ!',
      notYours: 'Senin kuyun değil', roundWin: 'KAZANDIN!', roundLose: 'KAYBETTİN', roundDraw: 'BERABERE',
      rival: 'Rakip: {name}', lv: 'Seviye {n}', streak: 'Seri: {n}',
      keysHint: 'Sağ/Sol ok: kuyu seç · Boşluk: taşları dağıt', touchHint: 'Alttaki kuyularından birine dokun, taşlar sağa doğru dağılır',
      rules: 'Son taş hazinene düşerse tekrar oynarsın. Rakip kuyuyu çift yaparsan oradaki taşları alırsın.',
      d0: 'Çaylak', d1: 'Heveskâr', d2: 'Kahvehane Ustası', d3: 'Zorlu', d4: 'Üstat', d5: 'Mangala Ustası',
    },
    en: {
      aiTurn: 'CPU THINKING', cpu: 'CPU', again: 'GO AGAIN!', even: 'EVEN!', emptyPit: 'EMPTY PIT!', sweep: 'SIDE CLEARED!',
      notYours: 'Not your pit', roundWin: 'YOU WIN!', roundLose: 'YOU LOSE', roundDraw: 'DRAW',
      rival: 'Rival: {name}', lv: 'Level {n}', streak: 'Streak: {n}',
      keysHint: 'Left/Right: pick a pit · Space: sow the stones', touchHint: 'Tap one of your pits at the bottom; the stones are sown to the right',
      rules: 'Last stone in your store: play again. Make a rival pit even and you take its stones.',
      d0: 'Rookie', d1: 'Amateur', d2: 'Café Champ', d3: 'Tough', d4: 'Master', d5: 'Mangala Grandmaster',
    },
  },
});
