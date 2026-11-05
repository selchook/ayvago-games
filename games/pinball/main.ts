import { launch, loadAudio, type GameMeta } from '@core';
import meta from './game.json';
import { PlayScene } from './PlayScene';
import Phaser from 'phaser';
import { makeTextures, paintTable } from './art';
import { THEMES } from './levels';

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
    scene.add.image(0, 0, paintTable(scene, THEMES[0], 0)).setOrigin(0).setAlpha(0.55);
    scene.add.rectangle(0, 0, width, height, 0x05040f, 0.5).setOrigin(0);
    const flip = (x: number, rot: number) => scene.add.image(x, height * 0.82, 'pb-flipper').setOrigin(16 / 148, 0.5).setRotation(rot).setTint(THEMES[0].flipper);
    const left = flip(width / 2 - 130, 0.4), right = flip(width / 2 + 130, Math.PI - 0.4);
    scene.add.image(width / 2 - 130, height * 0.82, 'pb-pivot');
    scene.add.image(width / 2 + 130, height * 0.82, 'pb-pivot');
    scene.tweens.add({ targets: left, rotation: -0.35, duration: 120, yoyo: true, repeat: -1, repeatDelay: 1300 });
    scene.tweens.add({ targets: right, rotation: Math.PI + 0.35, duration: 120, yoyo: true, repeat: -1, repeatDelay: 1300, delay: 700 });
    for (const [x, y] of [[width * 0.18, height * 0.11], [width * 0.82, height * 0.11]]) {
      const halo = scene.add.image(x, y, 'pb-glow').setTint(THEMES[0].bumper).setBlendMode(Phaser.BlendModes.ADD).setAlpha(0.4).setScale(1.1);
      const body = scene.add.image(x, y, 'pb-bumper').setTint(THEMES[0].bumper).setScale(0.82);
      const cap = scene.add.image(x, y - 2, 'pb-cap').setScale(0.95);
      scene.tweens.add({ targets: [body, cap], scaleX: '+=0.1', scaleY: '+=0.1', duration: 500, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
      scene.tweens.add({ targets: halo, alpha: 0.8, duration: 500, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    }
    // a ball bouncing between the two bumpers, above the title
    const ball = scene.add.image(width * 0.18 + 60, height * 0.085, 'pb-ball').setScale(1.3);
    scene.tweens.add({ targets: ball, x: width * 0.82 - 60, duration: 900, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    scene.tweens.add({ targets: ball, y: height * 0.05, duration: 450, yoyo: true, repeat: -1, ease: 'Quad.easeOut' });
  },
  scenes: [PlayScene],
  strings: {
    tr: {
      launch: 'FIRLAT', nudge: 'SALLA', ball: 'TOP', ballSave: 'TOP KORUMA', saved: 'TOP KURTARILDI!', lost: 'TOP KAÇTI!',
      bank: 'HEDEFLER DÜŞTÜ!', multUp: 'ÇARPAN x{n}!', holdLaunch: 'FIRLAT ya da Boşluk:\nbasılı tut, bırak', levelUp: 'SEVİYE {n}',
      lastBall: 'SON TOP!', touchHint: 'Sol / sağ yarı: paletler', shake: 'SARSINTI!',
      levelClear: 'SEVİYE {n} TAMAM!', bonus: 'BONUS +{n}', extraBall: 'EKSTRA TOP!', done: 'TAMAM', goalDone: '{g} TAMAM!',
      unlockSaucer: 'YENİ: KAPAN!', unlockBumper: 'YENİ: 4. TAMPON!', unlockGuard: 'YENİ: HAREKETLİ ENGEL!', combo: 'KOMBO {n}!',
      g_bumpers: 'TAMPON', g_lanes: 'AYVA', g_targets: 'HEDEF SETİ', g_slings: 'SAPAN', g_saucer: 'KAPAN', g_points: 'PUAN',
    },
    en: {
      launch: 'LAUNCH', nudge: 'NUDGE', ball: 'BALL', ballSave: 'BALL SAVE', saved: 'BALL SAVED!', lost: 'BALL LOST!',
      bank: 'TARGETS DOWN!', multUp: 'MULTIPLIER x{n}!', holdLaunch: 'LAUNCH or Space:\nhold, then release', levelUp: 'LEVEL {n}',
      lastBall: 'LAST BALL!', touchHint: 'Left / right half: flippers', shake: 'NUDGE!',
      levelClear: 'LEVEL {n} CLEAR!', bonus: 'BONUS +{n}', extraBall: 'EXTRA BALL!', done: 'DONE', goalDone: '{g} DONE!',
      unlockSaucer: 'NEW: SAUCER!', unlockBumper: 'NEW: 4TH BUMPER!', unlockGuard: 'NEW: MOVING GUARD!', combo: 'COMBO {n}!',
      g_bumpers: 'BUMPERS', g_lanes: 'AYVA', g_targets: 'TARGET BANK', g_slings: 'SLINGS', g_saucer: 'SAUCER', g_points: 'POINTS',
    },
  },
});
