import { launch, kenney, loadAudio, type GameMeta } from '@core';
import meta from './game.json';
import { PlayScene, F } from './PlayScene';

launch({
  meta: meta as GameMeta,
  background: '#bfe8ee',
  pixelArt: true,
  physics: 'none',
  preload(scene) {
    const l = scene.load;
    l.spritesheet('pp', kenney('pixel-platformer/tilemap/tilemap_packed.png'), { frameWidth: 21, frameHeight: 21 });
    l.spritesheet('ppbg', kenney('pixel-platformer/backgrounds/backgrounds.png'), { frameWidth: 231, frameHeight: 63 });
    const J = 'oga/junkala-sfx/';
    const M = J + 'movement/jumping-and-landing/';
    loadAudio(l, 'jump', M + 'sfx-movement-jump9');
    loadAudio(l, 'jump2', M + 'sfx-movement-jump12');
    loadAudio(l, 'coin', J + 'general-sounds/coins/sfx-coin-single3');
    loadAudio(l, 'coin10', J + 'general-sounds/coins/sfx-coin-double2');
    loadAudio(l, 'stomp', J + 'general-sounds/impacts/sfx-sounds-impact8');
    loadAudio(l, 'hurt', J + 'general-sounds/negative-sounds/sfx-sounds-damage1');
    loadAudio(l, 'fall', J + 'movement/falling-sounds/sfx-sounds-falling3');
    loadAudio(l, 'die', J + 'movement/falling-sounds/sfx-sounds-falling11');
    loadAudio(l, 'land', M + 'sfx-movement-jump12-landing');
    loadAudio(l, 'land2', M + 'sfx-movement-jump16-landing');
    loadAudio(l, 'milestone', J + 'general-sounds/positive-sounds/sfx-sounds-powerup8');
    loadAudio(l, 'faster', J + 'general-sounds/positive-sounds/sfx-sounds-powerup12');
  },
  menuDecor(scene) {
    const { width, height } = scene.scale;
    scene.add.tileSprite(0, height - 300, width, 252, 'ppbg', 0).setOrigin(0).setTileScale(4).setAlpha(0.7);
    scene.add.tileSprite(0, height - 200, width, 252, 'ppbg', 1).setOrigin(0).setTileScale(4).setAlpha(0.5);
    scene.add.tileSprite(0, height - 63, width, 63, 'pp', F.top).setOrigin(0).setTileScale(3);
    scene.cameras.main.setBackgroundColor('#1d2a3a');
    const runner = scene.add.sprite(140, height - 63 - 30, 'pp', F.run[0]).setScale(3);
    let f = 0;
    scene.time.addEvent({ delay: 110, loop: true, callback: () => runner.setFrame(F.run[++f % 2]) });
    scene.tweens.add({ targets: runner, x: width - 140, duration: 5200, yoyo: true, repeat: -1, onYoyo: () => runner.setFlipX(true), onRepeat: () => runner.setFlipX(false) });
    for (let i = 0; i < 5; i++) {
      const c = scene.add.image(300 + i * 160, height - 140, 'pp', F.coin).setScale(3);
      scene.tweens.add({ targets: c, scaleX: 0.4, duration: 300, yoyo: true, repeat: -1, delay: i * 90 });
    }
  },
  scenes: [PlayScene],
  strings: {
    tr: { coins: 'ALTIN', meters: '{n} m', stomp: 'EZDİN!', fell: 'DÜŞTÜN!', faster: 'HIZLANIYOR!' },
    en: { coins: 'COINS', meters: '{n} m', stomp: 'STOMP!', fell: 'YOU FELL!', faster: 'SPEEDING UP!' },
  },
});
