import Phaser from 'phaser';
import { launch, kenney, loadSfx, type GameMeta } from '@core';
import meta from './game.json';
import { PlayScene, makeTextures, GHOST_COLORS } from './PlayScene';

launch({
  meta: meta as GameMeta,
  background: '#07071a',
  physics: 'none',
  preload(scene) {
    const l = scene.load;
    l.spritesheet('onebit', kenney('onebit/tilesheet/colored_transparent_packed.png'), { frameWidth: 16, frameHeight: 16 });
    loadSfx(l, 'waka', 'sfx-interface/audio/tick_002');
    loadSfx(l, 'pellet', 'sfx-digital/audio/powerup2');
    loadSfx(l, 'eatghost', 'sfx-digital/audio/zapthreetoneup');
    loadSfx(l, 'fruit', 'sfx-digital/audio/threetone1');
    loadSfx(l, 'die', 'sfx-digital/audio/phaserdown3');
    loadSfx(l, 'clear', 'sfx-digital/audio/powerup10');
    loadSfx(l, 'ready', 'jingles/audio/8-bit_jingles/jingles_nes00');
    loadSfx(l, 'life', 'sfx-digital/audio/powerup5');
    loadSfx(l, 'turn', 'sfx-interface/audio/click_001');
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
