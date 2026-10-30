import { launch, loadAudio, type GameMeta } from '@core';
import meta from './game.json';
import { PlayScene } from './PlayScene';
import { makeTextures } from './art';

const J = 'oga/junkala-sfx/';
const G = J + 'general-sounds/';

launch({
  meta: meta as GameMeta,
  background: '#0c0a1e',
  physics: 'none',
  preload(scene) {
    const l = scene.load;
    loadAudio(l, 'flip', G + 'impacts/sfx-sounds-impact5');
    loadAudio(l, 'flipdown', G + 'impacts/sfx-sounds-impact2');
    loadAudio(l, 'bumper1', G + 'simple-bleeps/sfx-sounds-blip7');
    loadAudio(l, 'bumper2', G + 'simple-bleeps/sfx-sounds-blip8');
    loadAudio(l, 'bumper3', G + 'simple-bleeps/sfx-sounds-blip9');
    loadAudio(l, 'sling', G + 'impacts/sfx-sounds-impact3');
    loadAudio(l, 'target', G + 'buttons/sfx-sounds-button6');
    loadAudio(l, 'bank', G + 'fanfares/sfx-sounds-fanfare2');
    loadAudio(l, 'lane', G + 'coins/sfx-coin-single1');
    loadAudio(l, 'lanes', G + 'positive-sounds/sfx-sounds-powerup16');
    loadAudio(l, 'charge', J + 'weapons/out-of-ammo/sfx-wpn-reload');
    loadAudio(l, 'launch', G + 'impacts/sfx-sounds-impact12');
    loadAudio(l, 'drain', G + 'negative-sounds/sfx-sounds-negative1');
    loadAudio(l, 'saved', G + 'positive-sounds/sfx-sounds-powerup3');
    loadAudio(l, 'nudge', G + 'impacts/sfx-sounds-impact14');
    loadAudio(l, 'wall', G + 'impacts/sfx-sounds-impact7');
    loadAudio(l, 'newball', G + 'menu-sounds/sfx-menu-select2');
    loadAudio(l, 'deny', G + 'negative-sounds/sfx-sounds-error1');
  },
  menuDecor(scene) {
    makeTextures(scene);
    const { width, height } = scene.scale;
    const left = scene.add.image(width / 2 - 130, height * 0.82, 'flipper').setOrigin(16 / 145, 0.5).setRotation(0.4);
    const right = scene.add.image(width / 2 + 130, height * 0.82, 'flipper').setOrigin(16 / 145, 0.5).setRotation(Math.PI - 0.4);
    scene.tweens.add({ targets: left, rotation: -0.35, duration: 120, yoyo: true, repeat: -1, repeatDelay: 1300 });
    scene.tweens.add({ targets: right, rotation: Math.PI + 0.35, duration: 120, yoyo: true, repeat: -1, repeatDelay: 1300, delay: 700 });
    for (const [x, y] of [[width * 0.18, height * 0.11], [width * 0.82, height * 0.11]]) {
      const b = scene.add.image(x, y, 'bumper').setScale(0.9);
      scene.tweens.add({ targets: b, scale: 1.05, duration: 500, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    }
    // a ball bouncing between the two bumpers, above the title
    const ball = scene.add.image(width * 0.18 + 60, height * 0.085, 'ball').setScale(1.3);
    scene.tweens.add({ targets: ball, x: width * 0.82 - 60, duration: 900, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    scene.tweens.add({ targets: ball, y: height * 0.05, duration: 450, yoyo: true, repeat: -1, ease: 'Quad.easeOut' });
  },
  scenes: [PlayScene],
  strings: {
    tr: {
      launch: 'FIRLAT', nudge: 'SALLA', ball: 'TOP', ballSave: 'TOP KORUMA', saved: 'TOP KURTARILDI!', lost: 'TOP KAÇTI!',
      bank: 'HEDEFLER TAMAM!', multUp: 'ÇARPAN x{n}!', holdLaunch: 'FIRLAT ya da Boşluk:\nbasılı tut, bırak', levelUp: 'SEVİYE {n}',
      lastBall: 'SON TOP!', touchHint: 'Sol / sağ yarı: paletler', shake: 'SARSINTI!',
    },
    en: {
      launch: 'LAUNCH', nudge: 'NUDGE', ball: 'BALL', ballSave: 'BALL SAVE', saved: 'BALL SAVED!', lost: 'BALL LOST!',
      bank: 'TARGETS DOWN!', multUp: 'MULTIPLIER x{n}!', holdLaunch: 'LAUNCH or Space:\nhold, then release', levelUp: 'LEVEL {n}',
      lastBall: 'LAST BALL!', touchHint: 'Left / right half: flippers', shake: 'NUDGE!',
    },
  },
});
