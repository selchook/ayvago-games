import { launch, kenney, loadSfx, type GameMeta } from '@core';
import Phaser from 'phaser';
import meta from './game.json';
import { PlayScene } from './PlayScene';

launch({
  meta: meta as GameMeta,
  background: '#0f1a2e',
  physics: 'none',
  preload(scene) {
    const l = scene.load;
    l.image('ball', kenney('sports/png/equipment/ball_soccer2.png'));
    l.image('glove', kenney('sports/png/equipment/boxing_glove.png'));
    loadSfx(l, 'kick', 'sfx-impact/audio/impactpunch_medium_000');
    loadSfx(l, 'goal', 'sfx-digital/audio/powerup2');
    loadSfx(l, 'net', 'sfx-impact/audio/impactsoft_medium_002');
    loadSfx(l, 'save', 'sfx-impact/audio/impactsoft_heavy_002');
    loadSfx(l, 'post', 'sfx-impact/audio/impactmetal_heavy_001');
    loadSfx(l, 'whistle', 'sfx-digital/audio/twotone1');
    loadSfx(l, 'boo', 'sfx-interface/audio/error_003');
    loadSfx(l, 'curl', 'sfx-interface/audio/switch_002');
    loadSfx(l, 'step', 'sfx-impact/audio/footstep_grass_001');
  },
  menuDecor(scene) {
    const { width, height } = scene.scale;
    scene.textures.get('ball').setFilter(Phaser.Textures.FilterMode.NEAREST);
    const g = scene.add.graphics();
    g.lineStyle(10, 0xffffff).strokeRect(width / 2 - 200, height * 0.79, 400, 150);
    g.lineStyle(2, 0xffffff, 0.3);
    for (let x = width / 2 - 180; x < width / 2 + 200; x += 25) g.lineBetween(x, height * 0.79, x, height * 0.79 + 150);
    const b = scene.add.image(width / 2, height * 0.95, 'ball').setScale(5);
    scene.tweens.add({ targets: b, y: height * 0.84, scale: 2.5, angle: 360, duration: 900, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
  },
  scenes: [PlayScene],
  strings: {
    tr: {
      you: 'SEN', them: 'RAKİP', shoot: 'ŞUTUNU ÇEK!', keep: 'KALEYİ KORU!', goal: 'GOL!', saved: 'KURTARDI!', bigSave: 'KURTARIŞ!',
      wide: 'AUT!', post: 'DİREK!', over: 'ÜSTTEN AUT!', matchWin: 'MAÇI KAZANDIN!', sudden: 'ANİ ÖLÜM', champion: 'ŞAMPİYON!',
      out: 'ELENDİN!', m1: 'ÇEYREK FİNAL', m2: 'YARI FİNAL', m3: 'FİNAL', curl: 'FALSO', corner: 'DOKSAN!',
    },
    en: {
      you: 'YOU', them: 'THEM', shoot: 'TAKE YOUR SHOT!', keep: 'SAVE IT!', goal: 'GOAL!', saved: 'SAVED!', bigSave: 'GREAT SAVE!',
      wide: 'WIDE!', post: 'POST!', over: 'OVER THE BAR!', matchWin: 'MATCH WON!', sudden: 'SUDDEN DEATH', champion: 'CHAMPIONS!',
      out: 'KNOCKED OUT!', m1: 'QUARTER-FINAL', m2: 'SEMI-FINAL', m3: 'FINAL', curl: 'CURL', corner: 'TOP CORNER!',
    },
  },
});
