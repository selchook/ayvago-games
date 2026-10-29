import { launch, kenney, loadAudio, loadSfx, type GameMeta } from '@core';
import meta from './game.json';
import { PlayScene } from './PlayScene';
import { FRUITS, makeFruitTextures } from './art';

const P = 'particles/png_transparent/';
const J = 'oga/junkala-sfx/';

launch({
  meta: meta as GameMeta,
  background: '#24140a',
  physics: 'none',
  preload(scene) {
    const l = scene.load;
    l.image('bomb', kenney('platformer/png/tiles/bomb.png'));
    l.image('glow', kenney(P + 'light_01.png'));
    l.image('splat', kenney(P + 'dirt_01.png'));
    l.image('scorch', kenney(P + 'scorch_01.png'));
    loadAudio(l, 'slice1', J + 'weapons/melee/sfx-wpn-sword1');
    loadAudio(l, 'slice2', J + 'weapons/melee/sfx-wpn-sword2');
    loadAudio(l, 'slice3', J + 'weapons/melee/sfx-wpn-sword3');
    loadAudio(l, 'swish', J + 'weapons/melee/sfx-wpn-dagger');
    loadSfx(l, 'squish', 'sfx-impact/audio/impactsoft_medium_002');
    loadSfx(l, 'toss', 'sfx-impact/audio/impactsoft_medium_000');
    loadSfx(l, 'fuse', 'sfx-digital/audio/lowrandom');
    loadAudio(l, 'boom', J + 'explosions/long/sfx-exp-long3');
    loadAudio(l, 'miss', J + 'general-sounds/negative-sounds/sfx-sounds-damage3');
    loadAudio(l, 'combo', J + 'general-sounds/coins/sfx-coin-cluster3');
    loadAudio(l, 'crit', J + 'general-sounds/positive-sounds/sfx-sounds-powerup9');
    loadAudio(l, 'star', J + 'general-sounds/positive-sounds/sfx-sounds-powerup16');
    loadSfx(l, 'freeze', 'sfx-interface/audio/glass_002');
  },
  menuDecor(scene) {
    makeFruitTextures(scene);
    const { width, height } = scene.scale;
    FRUITS.forEach((f, i) => {
      const x = width / 2 + (i - 2.5) * 110, y = height * 0.84 + (i % 2) * 40;
      const img = scene.add.image(x, y, `fruit-${f.key}`).setAngle(i * 30);
      scene.tweens.add({ targets: img, y: y - 26, angle: img.angle + 20, duration: 900 + i * 90, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    });
    const g = scene.add.graphics();
    g.lineStyle(14, 0x3ee6ff, 0.25).lineBetween(width * 0.12, height * 0.88, width * 0.88, height * 0.78);
    g.lineStyle(5, 0xffffff, 0.8).lineBetween(width * 0.12, height * 0.88, width * 0.88, height * 0.78);
  },
  scenes: [PlayScene],
  strings: {
    tr: {
      startHint: 'Meyveleri kaydırarak kes, bombalara dokunma!\nKlavye: oklarla bıçağı taşı, Boşluk basılıyken kes.',
      critical: 'KRİTİK!', boom: 'BOMBA!', tooManyMiss: '3 MEYVE KAÇTI', frenzy: 'MEYVE YAĞMURU!', freeze: 'ZAMAN YAVAŞLADI!',
    },
    en: {
      startHint: 'Swipe to slice the fruit, never the bombs!\nKeyboard: move the blade with the arrows, hold Space to slash.',
      critical: 'CRITICAL!', boom: 'BOOM!', tooManyMiss: '3 FRUIT MISSED', frenzy: 'FRUIT FRENZY!', freeze: 'SLOW MOTION!',
    },
  },
});
