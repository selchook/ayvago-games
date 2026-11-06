import { launch, loadAudio, getLang, type GameMeta } from '@core';
import meta from './game.json';
import { PlayScene } from './PlayScene';
import Phaser from 'phaser';
import { makeTextures, paintTable } from './art';
import { TABLES } from './tables';

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
    const th = TABLES[0].theme;
    scene.add.image(0, 0, paintTable(scene, TABLES[0], getLang() === 'tr' ? 'tr' : 'en')).setOrigin(0).setAlpha(0.55);
    scene.add.rectangle(0, 0, width, height, 0x05040f, 0.5).setOrigin(0);
    for (const [x, y] of [[width * 0.18, height * 0.11], [width * 0.82, height * 0.11]]) {
      const halo = scene.add.image(x, y, 'pb-glow').setTint(th.bumper).setBlendMode(Phaser.BlendModes.ADD).setAlpha(0.4).setScale(1.1);
      const body = scene.add.image(x, y, 'pb-bumper').setTint(th.bumper).setScale(0.82);
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
      tableN: 'MASA {n}', target: 'HEDEF', tableClear: 'MASA TAMAM!', newTable: 'YENİ MASA AÇILDI!', round: 'TUR {n}', jackpot: 'JACKPOT!',
      pickTable: 'MASA SEÇ', locked: 'KİLİTLİ', pickHint: 'Bir masaya dokun ya da ↑↓ ve Enter',
      m_ramps: 'RAMPA', m_orbits: 'YÖRÜNGE', m_spinner: 'FIRILDAK', m_bumpers: 'TAMPON', m_lanes: 'AYVA', m_banks: 'HEDEF SETİ',
      m_saucer: 'KAPAN', m_vortex: 'GİRDAP', m_wormhole: 'SOLUCAN DELİĞİ', m_cannon: 'TOP ATAR',
      launch: 'FIRLAT', nudge: 'SALLA', ball: 'TOP', ballSave: 'TOP KORUMA', saved: 'TOP KURTARILDI!', lost: 'TOP KAÇTI!',
      bank: 'HEDEFLER DÜŞTÜ!', multUp: 'ÇARPAN x{n}!', holdLaunch: 'FIRLAT ya da Boşluk:\nbasılı tut, bırak',
      lastBall: 'SON TOP!',
      extraBall: 'EKSTRA TOP!', done: 'TAMAM', goalDone: '{g} TAMAM!',
      combo: 'KOMBO {n}!',
      ramp: 'RAMPA!', orbit: 'YÖRÜNGE!', rampCombo: 'RAMPA KOMBO!',
      tilt: 'TILT', danger: 'DİKKAT!', ballBonus: 'TOP BONUSU',
    },
    en: {
      tableN: 'TABLE {n}', target: 'TARGET', tableClear: 'TABLE CLEAR!', newTable: 'NEW TABLE UNLOCKED!', round: 'ROUND {n}', jackpot: 'JACKPOT!',
      pickTable: 'PICK A TABLE', locked: 'LOCKED', pickHint: 'Tap a table, or ↑↓ and Enter',
      m_ramps: 'RAMPS', m_orbits: 'ORBITS', m_spinner: 'SPINNER', m_bumpers: 'BUMPERS', m_lanes: 'AYVA', m_banks: 'TARGET BANKS',
      m_saucer: 'SAUCER', m_vortex: 'VORTEX', m_wormhole: 'WORMHOLE', m_cannon: 'CANNON',
      launch: 'LAUNCH', nudge: 'NUDGE', ball: 'BALL', ballSave: 'BALL SAVE', saved: 'BALL SAVED!', lost: 'BALL LOST!',
      bank: 'TARGETS DOWN!', multUp: 'MULTIPLIER x{n}!', holdLaunch: 'LAUNCH or Space:\nhold, then release',
      lastBall: 'LAST BALL!',
      extraBall: 'EXTRA BALL!', done: 'DONE', goalDone: '{g} DONE!',
      combo: 'COMBO {n}!',
      ramp: 'RAMP!', orbit: 'ORBIT!', rampCombo: 'RAMP COMBO!',
      tilt: 'TILT', danger: 'DANGER!', ballBonus: 'BALL BONUS',
    },
  },
});
