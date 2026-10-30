import { launch, kenney, loadAudio, loadCharacter, CHARACTER_FRAME, Phaser, type GameMeta } from '@core';
import meta from './game.json';
import { PlayScene, F, HERO_SCALE } from './PlayScene';

const J = 'oga/junkala-sfx/';
const M = J + 'movement/jumping-and-landing/';
const G = J + 'general-sounds/';

launch({
  meta: meta as GameMeta,
  background: '#1d2a3a',
  pixelArt: true,
  physics: 'none',
  preload(scene) {
    const l = scene.load;
    l.spritesheet('pp', kenney('pixel-platformer/tilemap/tilemap_packed.png'), { frameWidth: 21, frameHeight: 21 });
    l.spritesheet('ppbg', kenney('pixel-platformer/backgrounds/backgrounds.png'), { frameWidth: 231, frameHeight: 63 });
    // The player's chosen character. The game samples nearest (pixelArt); the character is smooth
    // vector art scaled down, so its textures keep linear filtering.
    const poses = ['stand', 'jump', 'walk1', 'walk2', 'hit'] as const;
    loadCharacter(l, { poses });
    l.once('complete', () => {
      for (const pose of poses) scene.textures.get(`pc-${pose}`).setFilter(Phaser.Textures.FilterMode.LINEAR);
    });
    loadAudio(l, 'fire', M + 'sfx-movement-jump3');
    loadAudio(l, 'attach', G + 'impacts/sfx-sounds-impact9');
    loadAudio(l, 'release', M + 'sfx-movement-jump12');
    loadAudio(l, 'land', M + 'sfx-movement-jump12-landing');
    loadAudio(l, 'coin', G + 'coins/sfx-coin-single2');
    loadAudio(l, 'miss', G + 'negative-sounds/sfx-sounds-error6');
    loadAudio(l, 'spike', G + 'negative-sounds/sfx-sounds-damage2');
    loadAudio(l, 'fall', J + 'movement/falling-sounds/sfx-sounds-falling3');
    loadAudio(l, 'bonk', G + 'impacts/sfx-sounds-impact1');
    loadAudio(l, 'milestone', G + 'positive-sounds/sfx-sounds-powerup8');
  },
  menuDecor(scene) {
    const { width, height } = scene.scale;
    scene.cameras.main.setBackgroundColor('#1d2a3a');
    scene.add.tileSprite(0, height - 260, width, 189, 'ppbg', 0).setOrigin(0).setTileScale(3).setAlpha(0.5);
    scene.add.tileSprite(0, height - 63, width, 63, 'pp', F.top).setOrigin(0).setTileScale(3);
    scene.add.tileSprite(0, 0, width, 63, 'pp', F.rock).setOrigin(0).setTileScale(3).setAlpha(0.9);
    // the hero swings on a rope from the ceiling, left of the title
    const ax = 190, ay = 63, len = 330;
    const rope = scene.add.graphics();
    const hero = scene.add.image(0, 0, 'pc-jump').setScale(HERO_SCALE * 1.3).setOrigin(0.5, CHARACTER_FRAME.originY - 0.3);
    const st = { a: -0.6 };
    scene.tweens.add({
      targets: st, a: 0.6, duration: 1100, yoyo: true, repeat: -1, ease: 'Sine.easeInOut',
      onUpdate: () => {
        const x = ax + Math.sin(st.a) * len, y = ay + Math.cos(st.a) * len;
        rope.clear().lineStyle(5, 0x8b5a2b, 1).lineBetween(ax, ay, x, y);
        hero.setPosition(x, y).setRotation(-st.a * 0.8);
      },
    });
    for (let i = 0; i < 5; i++) {
      const c = scene.add.image(width - 290 + i * 50, height * 0.42 - Math.sin((i / 4) * Math.PI) * 50, 'pp', F.coin).setScale(3);
      scene.tweens.add({ targets: c, scaleX: 0.5, duration: 300, yoyo: true, repeat: -1, delay: i * 90 });
    }
  },
  scenes: [PlayScene],
  strings: {
    tr: {
      coins: 'ALTIN', meters: '{n} m', fell: 'DÜŞTÜN!', spiked: 'DİKENE TAKILDIN!', faster: 'HIZLANIYOR!',
      tutorial: 'Basılı tut: ip at · Bırak: uç', miss: 'TUTMADI!',
    },
    en: {
      coins: 'COINS', meters: '{n} m', fell: 'YOU FELL!', spiked: 'SPIKED!', faster: 'SPEEDING UP!',
      tutorial: 'Hold: fire the rope · Release: fly', miss: 'MISSED!',
    },
  },
});
