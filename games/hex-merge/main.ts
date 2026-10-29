import Phaser from 'phaser';
import { launch, loadAudio, loadSfx, kenney, type GameMeta } from '@core';
import meta from './game.json';
import { PlayScene, makeHexTextures, HEX_COLORS } from './PlayScene';

const J = 'oga/junkala-sfx/';

launch({
  meta: meta as GameMeta,
  background: '#160f26',
  physics: 'none',
  preload(scene) {
    const l = scene.load;
    l.spritesheet('ob', kenney('onebit/tilesheet/colored_transparent_packed.png'), { frameWidth: 16, frameHeight: 16 });
    loadSfx(l, 'drop1', 'sfx-casino/audio/chiplay1');
    loadSfx(l, 'drop2', 'sfx-casino/audio/chiplay2');
    loadSfx(l, 'drop3', 'sfx-casino/audio/chiplay3');
    loadAudio(l, 'merge', J + 'general-sounds/positive-sounds/sfx-sounds-powerup5');
    loadAudio(l, 'chain', J + 'general-sounds/positive-sounds/sfx-sounds-powerup6');
    loadAudio(l, 'nova', J + 'explosions/odd/sfx-exp-odd6');
    loadAudio(l, 'novaJingle', J + 'general-sounds/fanfares/sfx-sounds-fanfare1');
    loadAudio(l, 'boom', J + 'explosions/short/sfx-exp-short-hard14');
    loadAudio(l, 'full', J + 'general-sounds/negative-sounds/sfx-sounds-negative1');
    loadAudio(l, 'low', J + 'general-sounds/alarms/low-health-alarms/sfx-lowhealth-alarmloop6');
    loadAudio(l, 'swap', J + 'general-sounds/interactions/sfx-sounds-interaction24');
    loadAudio(l, 'nope', J + 'general-sounds/negative-sounds/sfx-sounds-error8');
    loadSfx(l, 'stone', 'sfx-impact/audio/impactmining_001');
    loadSfx(l, 'crack', 'sfx-impact/audio/impactmining_003');
    loadAudio(l, 'levelup', J + 'general-sounds/positive-sounds/sfx-sounds-powerup8');
    loadAudio(l, 'move', J + 'general-sounds/menu-sounds/sfx-menu-move4');
  },
  menuDecor(scene) {
    makeHexTextures(scene);
    const { width, height } = scene.scale;
    const spots: Array<[number, number, number]> = [[-2, 0, 1], [-1, 0, 2], [0, 0, 3], [1, 0, 4], [2, 0, 5]];
    spots.forEach(([q, , v], i) => {
      const x = width / 2 + q * 120, y = height * 0.08 + (i % 2) * 52;
      const c = scene.add.container(x, y);
      c.add(scene.add.image(0, 0, 'hx-tile').setTint(HEX_COLORS[v]).setScale(0.9));
      c.add(scene.add.text(0, 2, String(v), { fontFamily: '"Press Start 2P"', fontSize: '30px', color: '#fff', stroke: '#000', strokeThickness: 6 }).setOrigin(0.5));
      scene.tweens.add({ targets: c, y: y - 10, duration: 800 + i * 140, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    });
    [[-1, 1], [1, 1], [0, 0]].forEach(([dx, dy], i) => {
      const c = scene.add.container(width / 2 + dx * 90, height * 0.84 + dy * 52 - 26);
      c.add(scene.add.image(0, 0, 'hx-tile').setTint(HEX_COLORS[3]).setScale(0.75));
      c.add(scene.add.text(0, 2, '3', { fontFamily: '"Press Start 2P"', fontSize: '26px', color: '#fff', stroke: '#000', strokeThickness: 6 }).setOrigin(0.5));
      scene.tweens.add({ targets: c, x: width / 2, y: height * 0.84, duration: 700, yoyo: true, repeat: -1, hold: 400, repeatDelay: 600, delay: i * 20, ease: 'Cubic.easeIn' });
    });
    scene.textures.get('ob').setFilter(Phaser.Textures.FilterMode.NEAREST);
  },
  scenes: [PlayScene],
  strings: {
    tr: {
      nextPiece: 'SIRADAKİ', swap: 'DEĞİŞTİR', boardFull: 'TAHTA DOLU!', chain: 'ZİNCİR', maxTile: 'EN BÜYÜK',
      stoneWarn: 'TAŞ DÜŞTÜ!', nova: 'SÜPERNOVA!', bomb: 'BOMBA', bombHint: 'Bombayı her yere bırakabilirsin',
    },
    en: {
      nextPiece: 'NEXT', swap: 'SWAP', boardFull: 'BOARD FULL!', chain: 'CHAIN', maxTile: 'MAX',
      stoneWarn: 'A STONE FELL!', nova: 'SUPERNOVA!', bomb: 'BOMB', bombHint: 'A bomb can go on any hex',
    },
  },
});
