import Phaser from 'phaser';
import { launch, kenney, loadAudio, loadSfx, type GameMeta } from '@core';
import meta from './game.json';
import { PlayScene, makeTextures, GHOST_COLORS } from './PlayScene';

launch({
  meta: meta as GameMeta,
  background: '#07071a',
  physics: 'none',
  preload(scene) {
    const l = scene.load;
    l.spritesheet('onebit', kenney('onebit/tilesheet/colored_transparent_packed.png'), { frameWidth: 16, frameHeight: 16 });
    const J = 'oga/junkala-sfx/general-sounds/';
    loadAudio(l, 'waka', J + 'simple-bleeps/sfx-sounds-blip11');
    loadAudio(l, 'waka2', J + 'simple-bleeps/sfx-sounds-blip3');
    loadAudio(l, 'pellet', J + 'positive-sounds/sfx-sounds-powerup6');
    loadAudio(l, 'unfright', J + 'pause-sounds/sfx-sounds-pause1-out');
    loadAudio(l, 'eatghost', J + 'positive-sounds/sfx-sounds-powerup5');
    loadAudio(l, 'fruit', J + 'coins/sfx-coin-cluster5');
    loadAudio(l, 'die', 'oga/junkala-sfx/movement/falling-sounds/sfx-sounds-falling1');
    loadAudio(l, 'clear', J + 'fanfares/sfx-sounds-fanfare1');
    loadSfx(l, 'ready', 'jingles/audio/8-bit_jingles/jingles_nes00');
    loadAudio(l, 'life', J + 'fanfares/sfx-sounds-fanfare3');
    loadAudio(l, 'turn', J + 'menu-sounds/sfx-menu-move1');
  },
  menuDecor(scene) {
    makeTextures(scene);
    const { width, height } = scene.scale;
    const y = height * 0.82;
    const g = scene.add.graphics();
    g.fillStyle(0xffd23f).slice(120, y, 34, Phaser.Math.DegToRad(30), Phaser.Math.DegToRad(330), false).fillPath();
    for (let i = 0; i < 3; i++) scene.add.circle(190 + i * 40, y, 6, 0xffe0b0);
    GHOST_COLORS.forEach((c, i) => {
      const gx = 340 + i * 82;
      const b = scene.add.image(gx, y, 'mm-ghost0').setTint(c).setScale(2);
      scene.add.image(gx, y, 'mm-eyes2').setScale(2);
      scene.tweens.add({ targets: b, y: y - 8, duration: 400 + i * 60, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    });
  },
  scenes: [PlayScene],
  strings: {
    tr: { ready: 'HAZIR!', extraLife: 'EKSTRA CAN!', allClear: 'TEMİZLENDİ!' },
    en: { ready: 'READY!', extraLife: 'EXTRA LIFE!', allClear: 'ALL CLEAR!' },
  },
});
