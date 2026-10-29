import { launch, kenney, loadAudio, loadSfx, type GameMeta } from '@core';
import meta from './game.json';
import { PlayScene, ANIMALS, makeCardTextures } from './PlayScene';

launch({
  meta: meta as GameMeta,
  background: '#14243a',
  physics: 'none',
  preload(scene) {
    const l = scene.load;
    for (const a of ANIMALS) l.image('an-' + a, kenney(`animals/png/round/${a}.png`));
    loadSfx(l, 'flip', 'sfx-casino/audio/cardplace1');
    loadSfx(l, 'flipback', 'sfx-casino/audio/cardslide2');
    loadSfx(l, 'deal', 'sfx-casino/audio/cardfan1');
    loadSfx(l, 'shuffle', 'sfx-casino/audio/cardshuffle');
    const J = 'oga/junkala-sfx/general-sounds/';
    loadAudio(l, 'match', J + 'coins/sfx-coin-double1');
    loadAudio(l, 'theirMatch', J + 'neutral-sounds/sfx-sound-neutral2');
    loadAudio(l, 'miss', J + 'negative-sounds/sfx-sounds-error5');
    loadAudio(l, 'clear', J + 'fanfares/sfx-sounds-fanfare1');
    loadAudio(l, 'lose', J + 'negative-sounds/sfx-sounds-negative1');
    loadAudio(l, 'draw', J + 'neutral-sounds/sfx-sound-neutral6');
    loadAudio(l, 'timeup', J + 'negative-sounds/sfx-sounds-negative2');
    loadAudio(l, 'star', J + 'coins/sfx-coin-single3');
    loadAudio(l, 'tick', J + 'simple-bleeps/sfx-sounds-blip10');
    loadAudio(l, 'move', J + 'menu-sounds/sfx-menu-move2');
    loadAudio(l, 'turn', J + 'simple-bleeps/sfx-sounds-blip7');
  },
  menuDecor(scene) {
    makeCardTextures(scene);
    const { width, height } = scene.scale;
    const picks = ['panda', 'frog', 'pig', 'owl', 'parrot'];
    picks.forEach((a, i) => {
      const x = width / 2 + (i - 2) * 120, y = height * 0.085 + Math.abs(i - 2) * 14;
      const c = scene.add.container(x, y).setAngle((i - 2) * 8);
      const face = i % 2 === 0;
      c.add(scene.add.image(0, 0, face ? 'mm-face' : 'mm-back').setDisplaySize(104, 136));
      if (face) c.add(scene.add.image(0, 0, 'an-' + a).setScale(0.62));
      scene.tweens.add({ targets: c, y: y - 10, duration: 900 + i * 120, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    });
    const pair = ['zebra', 'zebra'];
    pair.forEach((a, i) => {
      const c = scene.add.container(width / 2 + (i ? 80 : -80), height * 0.86).setAngle(i ? 8 : -8);
      c.add(scene.add.image(0, 0, 'mm-face').setDisplaySize(120, 156));
      c.add(scene.add.image(0, 0, 'an-' + a).setScale(0.72));
      scene.tweens.add({ targets: c, angle: i ? 12 : -12, duration: 800, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    });
  },
  scenes: [PlayScene],
  strings: {
    tr: {
      memorize: 'EZBERLE!', pairs: 'ÇİFT', timeUp: 'SÜRE BİTTİ!', great: 'HARİKA!', timeBonus: 'Süre bonusu',
      starBonus: 'Yıldız bonusu', tapAnywhere: 'Bir sonraki bölüm geliyor…',
    },
    en: {
      memorize: 'MEMORIZE!', pairs: 'PAIRS', timeUp: "TIME'S UP!", great: 'GREAT!', timeBonus: 'Time bonus',
      starBonus: 'Star bonus', tapAnywhere: 'Next level coming up…',
    },
  },
});
