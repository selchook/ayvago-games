import { launch, kenney, loadAudio, loadSfx, type GameMeta } from '@core';
import meta from './game.json';
import { PlayScene } from './PlayScene';
import { makeLabTextures, W, H, FLOOR } from './art';

const AL = 'platformer/png/players/variable_sizes/green/aliengreen_';
const J = 'oga/junkala-sfx/';

launch({
  meta: meta as GameMeta,
  background: '#0d1020',
  physics: 'none',
  preload(scene) {
    const l = scene.load;
    l.image('hero-walk1', kenney(AL + 'walk1.png'));
    l.image('hero-walk2', kenney(AL + 'walk2.png'));
    l.image('hero-jump', kenney(AL + 'jump.png'));
    l.image('hero-hit', kenney(AL + 'hit.png'));
    l.image('coin', kenney('platformer/png/items/coingold.png'));
    l.image('gem', kenney('platformer/png/items/gemblue.png'));
    loadAudio(l, 'jet', J + 'movement/vehicles/sfx-vehicle-engineloop');
    loadAudio(l, 'thrust', J + 'movement/jumping-and-landing/sfx-movement-jump12');
    loadAudio(l, 'land', J + 'movement/jumping-and-landing/sfx-movement-jump12-landing');
    loadAudio(l, 'coin', J + 'general-sounds/coins/sfx-coin-single2');
    loadAudio(l, 'zap', J + 'general-sounds/weird-sounds/sfx-sound-vaporizing');
    loadAudio(l, 'boom', J + 'explosions/medium-length/sfx-exp-medium4');
    loadAudio(l, 'alarm', J + 'general-sounds/high-pitched-sounds/sfx-sounds-high3');
    loadSfx(l, 'beep', 'sfx-interface/audio/tick_002');
    loadAudio(l, 'launch', J + 'weapons/grenade-whistles/sfx-wpn-missilelaunch');
    loadAudio(l, 'shield', J + 'general-sounds/positive-sounds/sfx-sounds-powerup13');
    loadAudio(l, 'pop', J + 'general-sounds/impacts/sfx-sounds-impact13');
    loadAudio(l, 'milestone', J + 'general-sounds/fanfares/sfx-sounds-fanfare3');
  },
  menuDecor(scene) {
    makeLabTextures(scene);
    scene.add.tileSprite(0, 0, W, H, 'lab-wall').setOrigin(0).setAlpha(0.55);
    scene.add.tileSprite(0, FLOOR, W, 84, 'lab-floor').setOrigin(0).setAlpha(0.8);
    const hero = scene.add.image(W * 0.16, H * 0.55, 'hero-jump').setScale(0.6);
    scene.add.image(W * 0.16 - 36, H * 0.55 + 4, 'jetpack');
    scene.tweens.add({ targets: hero, y: hero.y - 30, duration: 800, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    for (let i = 0; i < 5; i++) scene.add.image(W * 0.8 + i * 40, H * 0.5 - Math.sin(i) * 30, 'coin').setScale(0.3);
  },
  scenes: [PlayScene],
  strings: {
    tr: {
      startHint: 'Uçmak için basılı tut, düşmek için bırak!\nDokun · Boşluk · Yukarı ok',
      coins: 'ALTIN', crashed: 'ÇARPTIN!', shield: 'KALKAN',
    },
    en: {
      startHint: 'Hold to fly, let go to drop!\nTouch · Space · Up arrow',
      coins: 'COINS', crashed: 'CRASHED!', shield: 'SHIELD',
    },
  },
});
