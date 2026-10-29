import { launch, kenney, loadAudio, loadSfx, type GameMeta } from '@core';
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
    const J = 'oga/junkala-sfx/general-sounds/';
    loadAudio(l, 'goal', J + 'positive-sounds/sfx-sounds-powerup4');
    loadSfx(l, 'net', 'sfx-impact/audio/impactsoft_medium_002');
    loadSfx(l, 'save', 'sfx-impact/audio/impactsoft_heavy_002');
    loadSfx(l, 'post', 'sfx-impact/audio/impactmetal_heavy_001');
    loadAudio(l, 'whistle', J + 'high-pitched-sounds/sfx-sounds-high3');
    loadAudio(l, 'boo', J + 'negative-sounds/sfx-sounds-error11');
    loadAudio(l, 'curl', J + 'menu-sounds/sfx-menu-move2');
    loadAudio(l, 'clock', J + 'simple-bleeps/sfx-sounds-blip10');
    loadAudio(l, 'wide', 'oga/junkala-sfx/movement/falling-sounds/sfx-sounds-falling3');
    loadAudio(l, 'lose', J + 'negative-sounds/sfx-sounds-negative1');
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
      kickN: 'PENALTI', pickDive: 'ATLAYACAĞIN YERİ SEÇ!', waitPeer: 'RAKİP BEKLENİYOR…',
    },
    en: {
      you: 'YOU', them: 'THEM', shoot: 'TAKE YOUR SHOT!', keep: 'SAVE IT!', goal: 'GOAL!', saved: 'SAVED!', bigSave: 'GREAT SAVE!',
      wide: 'WIDE!', post: 'POST!', over: 'OVER THE BAR!', matchWin: 'MATCH WON!', sudden: 'SUDDEN DEATH', champion: 'CHAMPIONS!',
      out: 'KNOCKED OUT!', m1: 'QUARTER-FINAL', m2: 'SEMI-FINAL', m3: 'FINAL', curl: 'CURL', corner: 'TOP CORNER!',
      kickN: 'KICK', pickDive: 'PICK YOUR DIVE!', waitPeer: 'WAITING FOR OPPONENT…',
    },
  },
});
