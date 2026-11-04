import Phaser from 'phaser';
import { launch, loadAudio, loadSfx, type GameMeta } from '@core';
import meta from './game.json';
import { PlayScene } from './PlayScene';
import { PALETTE, makeSymbols } from './symbols';

const J = 'oga/junkala-sfx/general-sounds/';

launch({
  meta: meta as GameMeta,
  background: '#15112a',
  physics: 'none',
  preload(scene) {
    const l = scene.load;
    loadAudio(l, 'turn', J + 'menu-sounds/sfx-menu-move3');
    loadAudio(l, 'hit', J + 'coins/sfx-coin-single2');
    loadAudio(l, 'rainbow', J + 'coins/sfx-coin-double4');
    loadAudio(l, 'combo', J + 'positive-sounds/sfx-sounds-powerup4');
    loadAudio(l, 'newcol', J + 'positive-sounds/sfx-sounds-powerup10');
    loadAudio(l, 'wave', J + 'simple-bleeps/sfx-sounds-blip6');
    loadAudio(l, 'clear', J + 'fanfares/sfx-sounds-fanfare3');
    loadAudio(l, 'wrong', J + 'negative-sounds/sfx-sounds-damage2');
    loadSfx(l, 'shatter', 'sfx-impact/audio/impactglass_heavy_001');
  },
  menuDecor(scene) {
    makeSymbols(scene);
    const { width, height } = scene.scale;
    const cx = width / 2, cy = height * 0.84;
    const ring = scene.add.container(cx, cy);
    const g = scene.add.graphics();
    ring.add(g);
    for (let i = 0; i < 5; i++) {
      const a0 = Phaser.Math.DegToRad(i * 72 + 1.5), a1 = Phaser.Math.DegToRad((i + 1) * 72 - 1.5);
      g.lineStyle(30, PALETTE[i], 1).beginPath().arc(0, 0, 64, a0, a1).strokePath();
      const a = Phaser.Math.DegToRad(i * 72 + 36);
      ring.add(scene.add.image(Math.cos(a) * 64, Math.sin(a) * 64, `sym-${i}`).setScale(0.34));
    }
    scene.tweens.add({ targets: ring, angle: 360, duration: 6000, repeat: -1 });
    [0, 180, 35, 145].forEach((deg, i) => {
      const a = Phaser.Math.DegToRad(deg);
      const d = scene.add.circle(cx + Math.cos(a) * 300, cy + Math.sin(a) * 300, 14, PALETTE[i]).setStrokeStyle(3, 0xffffff);
      scene.tweens.add({ targets: d, x: cx + Math.cos(a) * 100, y: cy + Math.sin(a) * 100, alpha: { from: 1, to: 0.2 }, duration: 1500, delay: i * 380, repeat: -1, ease: 'Quad.easeIn' });
    });
  },
  scenes: [PlayScene],
  strings: {
    tr: {
      hint: 'Sol / sağ yarıya dokun, sürükle ya da ok tuşlarını kullan',
      wrong: 'YANLIŞ RENK!', newColour: 'YENİ RENK!', waveClear: 'DALGA TAMAM',
    },
    en: {
      hint: 'Tap the left / right half, drag or use the arrow keys',
      wrong: 'WRONG COLOUR!', newColour: 'NEW COLOUR!', waveClear: 'WAVE CLEAR',
    },
  },
});
