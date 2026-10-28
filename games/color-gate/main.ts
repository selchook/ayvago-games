import Phaser from 'phaser';
import { launch, kenney, loadSfx, type GameMeta } from '@core';
import meta from './game.json';
import { PlayScene, PALETTE } from './PlayScene';

launch({
  meta: meta as GameMeta,
  background: '#14111f',
  physics: 'none',
  preload(scene) {
    const l = scene.load;
    l.image('cg-star', kenney('platformer/png/items/star.png'));
    loadSfx(l, 'hop', 'sfx-digital/audio/pepsound2');
    loadSfx(l, 'star', 'sfx-digital/audio/powerup2');
    loadSfx(l, 'switch', 'sfx-digital/audio/phaserup3');
    loadSfx(l, 'die', 'sfx-digital/audio/lowdown');
    loadSfx(l, 'shatter', 'sfx-impact/audio/impactglass_heavy_001');
    loadSfx(l, 'level', 'sfx-digital/audio/threetone1');
  },
  menuDecor(scene) {
    const { width, height } = scene.scale;
    // a spinning four-colour ring with a ball in it, under the title
    const g = scene.add.graphics({ x: width / 2, y: height * 0.84 });
    PALETTE.forEach((c, i) => {
      g.lineStyle(22, c, 1).beginPath();
      g.arc(0, 0, 88, Phaser.Math.DegToRad(i * 90), Phaser.Math.DegToRad((i + 1) * 90));
      g.strokePath();
    });
    scene.tweens.add({ targets: g, angle: 360, duration: 4000, repeat: -1 });
    const ball = scene.add.circle(width / 2, height * 0.84 + 30, 18, PALETTE[0]).setStrokeStyle(4, 0xffffff, 0.8);
    scene.tweens.add({ targets: ball, y: ball.y - 60, duration: 420, yoyo: true, repeat: -1, ease: 'Quad.easeOut' });
    for (let i = 0; i < 4; i++) {
      const s = scene.add.image(width * (0.12 + i * 0.25), height * 0.08 + (i % 2) * 40, 'cg-star').setScale(0.35).setAlpha(0.8);
      scene.tweens.add({ targets: s, angle: 360, duration: 3000 + i * 400, repeat: -1 });
    }
  },
  scenes: [PlayScene],
  strings: {
    tr: { tapHop: 'Zıplamak için dokun', wrong: 'YANLIŞ RENK!', fell: 'DÜŞTÜN!', stars: 'YILDIZ' },
    en: { tapHop: 'Tap to hop', wrong: 'WRONG COLOUR!', fell: 'YOU FELL!', stars: 'STARS' },
  },
});
