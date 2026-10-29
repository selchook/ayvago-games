import { launch, kenney, loadAudio, loadSfx, type GameMeta } from '@core';
import meta from './game.json';
import { PlayScene } from './PlayScene';

const PL = 'platformer/png/';
const AL = PL + 'players/variable_sizes/';
const J = 'oga/junkala-sfx/';

launch({
  meta: meta as GameMeta,
  background: '#1a1626',
  physics: 'none',
  preload(scene) {
    const l = scene.load;
    l.image('brick', kenney(PL + 'tiles/brickgrey.png'));
    l.image('crate', kenney(PL + 'tiles/boxcrate_double.png'));
    l.image('bomb', kenney(PL + 'tiles/bomb.png'));
    l.image('al-green', kenney(AL + 'green/aliengreen_front.png'));
    l.image('al-pink', kenney(AL + 'pink/alienpink_front.png'));
    l.image('al-blue', kenney(AL + 'blue/alienblue_front.png'));
    l.image('al-yellow', kenney(AL + 'yellow/alienyellow_front.png'));
    l.image('al-beige', kenney(AL + 'beige/alienbiege_front.png'));
    loadSfx(l, 'place', 'sfx-impact/audio/impactsoft_heavy_001');
    loadAudio(l, 'boom1', J + 'explosions/short/sfx-exp-short-hard2');
    loadAudio(l, 'boom2', J + 'explosions/short/sfx-exp-short-hard6');
    loadAudio(l, 'boom3', J + 'explosions/short/sfx-exp-short-hard11');
    loadSfx(l, 'crate', 'sfx-impact/audio/impactwood_heavy_002');
    loadAudio(l, 'power', J + 'general-sounds/positive-sounds/sfx-sounds-powerup2');
    loadAudio(l, 'die', J + 'general-sounds/negative-sounds/sfx-sounds-negative2');
    loadAudio(l, 'botdie', J + 'death-screams/alien/sfx-deathscream-alien2');
    loadAudio(l, 'clear', J + 'general-sounds/fanfares/sfx-sounds-fanfare1');
    loadAudio(l, 'start', J + 'general-sounds/menu-sounds/sfx-menu-select3');
  },
  menuDecor(scene) {
    const { width, height } = scene.scale;
    const y = height * 0.85;
    for (let i = 0; i < 7; i++) scene.add.image(width / 2 + (i - 3) * 90, y + 40, i % 2 ? 'brick' : 'crate').setDisplaySize(84, 84);
    scene.add.image(width / 2 - 170, y - 44, 'al-green').setScale(0.55);
    scene.add.image(width / 2 + 170, y - 44, 'al-pink').setScale(0.55).setFlipX(true);
    const bomb = scene.add.image(width / 2, y - 22, 'bomb').setDisplaySize(80, 80).setTint(0x2c2c38);
    scene.tweens.add({ targets: bomb, scaleX: bomb.scaleX * 1.12, scaleY: bomb.scaleY * 0.9, duration: 300, yoyo: true, repeat: -1 });
  },
  scenes: [PlayScene],
  strings: {
    tr: {
      bombBtn: 'BOMBA', bots: 'ROBOT', pu_range: 'MENZİL+', pu_bomb: 'BOMBA+', pu_speed: 'HIZ+',
    },
    en: {
      bombBtn: 'BOMB', bots: 'BOTS', pu_range: 'RANGE+', pu_bomb: 'BOMB+', pu_speed: 'SPEED+',
    },
  },
});
