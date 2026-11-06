import Phaser from 'phaser';
import { launch, loadAudio, loadSfx, kenney, type GameMeta } from '@core';
import meta from './game.json';
import { PlayScene, PALETTE } from './PlayScene';
import { makeArt, neonArc } from './art';

const J = 'oga/junkala-sfx/';

launch({
  meta: meta as GameMeta,
  background: '#14111f',
  physics: 'none',
  preload(scene) {
    const l = scene.load;
    l.image('cg-star', kenney('platformer/png/items/star.png'));
    loadAudio(l, 'hop1', J + 'movement/jumping-and-landing/sfx-movement-jump1');
    loadAudio(l, 'hop2', J + 'movement/jumping-and-landing/sfx-movement-jump5');
    loadAudio(l, 'hop3', J + 'movement/jumping-and-landing/sfx-movement-jump10');
    loadAudio(l, 'star', J + 'general-sounds/coins/sfx-coin-double4');
    loadAudio(l, 'switch', J + 'general-sounds/positive-sounds/sfx-sounds-powerup10');
    loadAudio(l, 'pass', J + 'general-sounds/simple-bleeps/sfx-sounds-blip6');
    loadAudio(l, 'level', J + 'general-sounds/fanfares/sfx-sounds-fanfare3');
    loadSfx(l, 'shatter', 'sfx-impact/audio/impactglass_heavy_001');
    loadAudio(l, 'die', J + 'general-sounds/negative-sounds/sfx-sounds-damage2');
    loadAudio(l, 'respawn', J + 'movement/portals-and-transitions/sfx-movement-portal5');
    loadAudio(l, 'low', J + 'general-sounds/alarms/low-health-alarms/sfx-lowhealth-alarmloop5');
  },
  menuDecor(scene) {
    const { width, height } = scene.scale;
    makeArt(scene, PALETTE);
    scene.add.image(0, 0, 'cg-sky').setOrigin(0);
    const far = scene.add.tileSprite(0, 0, width, height, 'cg-stars-far').setOrigin(0);
    const near = scene.add.tileSprite(0, 0, width, height, 'cg-stars-near').setOrigin(0);
    scene.tweens.addCounter({ from: 0, to: 2560, duration: 60000, repeat: -1, onUpdate: (tw) => { const v = tw.getValue() ?? 0; far.tilePositionY = -v * 0.4; near.tilePositionY = -v; } });
    // a spinning neon four-colour ring with a glossy ball hopping in it, under the title
    const g = scene.add.graphics({ x: width / 2, y: height * 0.115 });
    PALETTE.forEach((c, i) => neonArc(g, 62, i * 90 + 1.5, (i + 1) * 90 - 1.5, 16, c));
    scene.tweens.add({ targets: g, angle: 360, duration: 4000, repeat: -1 });
    const glow = scene.add.image(width / 2, height * 0.115 + 22, 'cg-glow').setScale(0.7).setTint(PALETTE[0]).setAlpha(0.6).setBlendMode(Phaser.BlendModes.ADD);
    const ball = scene.add.image(width / 2, height * 0.115 + 22, 'cg-ball').setDisplaySize(30, 30).setTint(PALETTE[0]);
    scene.tweens.add({ targets: [ball, glow], y: ball.y - 44, duration: 420, yoyo: true, repeat: -1, ease: 'Quad.easeOut' });
    for (let i = 0; i < 4; i++) {
      const s = scene.add.image(width * [0.08, 0.22, 0.78, 0.92][i], height * 0.08 + (i % 2) * 40, 'cg-star').setScale(0.35).setAlpha(0.8);
      scene.tweens.add({ targets: s, angle: 360, duration: 3000 + i * 400, repeat: -1 });
    }
  },
  scenes: [PlayScene],
  strings: {
    tr: { tapHop: 'Zıplamak için dokun', wrong: 'YANLIŞ RENK!', fell: 'DÜŞTÜN!', stars: 'YILDIZ' },
    en: { tapHop: 'Tap to hop', wrong: 'WRONG COLOUR!', fell: 'YOU FELL!', stars: 'STARS' },
  },
});
