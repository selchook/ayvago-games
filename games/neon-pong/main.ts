import { launch, kenney, loadSfx, type GameMeta } from '@core';
import meta from './game.json';
import { PlayScene } from './PlayScene';

const P = 'puzzle2/png/';

launch({
  meta: meta as GameMeta,
  background: '#07041a',
  physics: 'none',
  preload(scene) {
    const l = scene.load;
    l.image('paddle-me', kenney(P + 'paddles/paddle_05.png'));
    l.image('paddle-ai', kenney(P + 'paddles/paddle_01.png'));
    l.image('ball', kenney(P + 'balls/yellow/ballyellow_04.png'));
    l.image('glow', kenney(P + 'particles_white/particlewhite_4.png'));
    l.image('spark', kenney(P + 'particles_white/particlewhite_7.png'));
    loadSfx(l, 'hit', 'sfx-digital/audio/tone1');
    loadSfx(l, 'hit2', 'sfx-digital/audio/pepsound2');
    loadSfx(l, 'wall', 'sfx-digital/audio/twotone1');
    loadSfx(l, 'goal', 'sfx-digital/audio/powerup5');
    loadSfx(l, 'miss', 'sfx-digital/audio/phaserdown2');
    loadSfx(l, 'serve', 'sfx-digital/audio/phasejump1');
    loadSfx(l, 'match', 'jingles/audio/8-bit_jingles/jingles_nes06');
  },
  menuDecor(scene) {
    const { width, height } = scene.scale;
    const g = scene.add.graphics();
    g.lineStyle(4, 0xff4fa3, 0.35);
    for (let x = 30; x < width; x += 50) g.lineBetween(x, height * 0.79, x + 25, height * 0.79);
    scene.add.image(width / 2 - 120, height * 0.73, 'paddle-ai').setDisplaySize(170, 40).setBlendMode('ADD');
    scene.add.image(width / 2 + 120, height * 0.86, 'paddle-me').setDisplaySize(170, 40).setBlendMode('ADD');
    const ball = scene.add.image(width / 2 - 60, height * 0.77, 'ball').setDisplaySize(34, 34);
    scene.tweens.add({ targets: ball, x: width / 2 + 90, y: height * 0.83, duration: 900, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
  },
  scenes: [PlayScene],
  strings: {
    tr: { round: 'TUR', you: 'SEN', cpu: 'RAKİP', youPoint: 'SAYI!', cpuPoint: 'KAÇTI!', matchWon: 'MAÇI KAZANDIN!', rally: 'RALLİ', spin: 'FALSO!', champion: 'ŞAMPİYON!', firstTo: 'İLK 7' },
    en: { round: 'ROUND', you: 'YOU', cpu: 'CPU', youPoint: 'POINT!', cpuPoint: 'MISSED!', matchWon: 'MATCH WON!', rally: 'RALLY', spin: 'SPIN!', champion: 'CHAMPION!', firstTo: 'FIRST TO 7' },
  },
});
