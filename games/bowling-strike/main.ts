import Phaser from 'phaser';
import { launch, kenney, loadSfx, type GameMeta } from '@core';
import meta from './game.json';
import { PlayScene, makeBowlingTextures } from './PlayScene';
import { warmText } from './fasttext';

launch({
  meta: meta as GameMeta,
  background: '#1a1220',
  physics: 'none',
  preload(scene) {
    const l = scene.load;
    l.image('ball', kenney('sports/png/equipment/ball_bowling1.png'));
    l.image('ball2', kenney('sports/png/equipment/ball_bowling2.png'));
    loadSfx(l, 'throw', 'sfx-impact/audio/impactsoft_heavy_001');
    loadSfx(l, 'roll', 'sfx-impact/audio/footstep_carpet_002');
    loadSfx(l, 'pin1', 'sfx-impact/audio/impactwood_medium_000');
    loadSfx(l, 'pin2', 'sfx-impact/audio/impactwood_medium_002');
    loadSfx(l, 'pin3', 'sfx-impact/audio/impactplank_medium_001');
    loadSfx(l, 'crash', 'sfx-impact/audio/impactwood_heavy_003');
    loadSfx(l, 'gutter', 'sfx-impact/audio/impactmetal_light_002');
    loadSfx(l, 'lock', 'sfx-interface/audio/select_003');
    loadSfx(l, 'strike', 'jingles/audio/8-bit_jingles/jingles_nes05');
    loadSfx(l, 'spare', 'sfx-digital/audio/powerup3');
    loadSfx(l, 'meh', 'sfx-interface/audio/error_004');
    loadSfx(l, 'reset', 'sfx-interface/audio/drop_003');
  },
  menuDecor(scene) {
    warmText(scene, [[14, true], [16, true], [18, true], [20, true], [22, true], [26, true], [44, true], [24, false]]);
    makeBowlingTextures(scene);
    scene.textures.get('ball').setFilter(Phaser.Textures.FilterMode.NEAREST);
    const { width, height } = scene.scale;
    const spots: Array<[number, number]> = [[0, 0], [-1, -1], [1, -1], [-2, -2], [0, -2], [2, -2], [-3, -3], [-1, -3], [1, -3], [3, -3]];
    for (const [c, r] of spots) scene.add.image(width / 2 + c * 34, height * 0.86 + r * 34, 'bw-pin').setScale(0.9);
    const b = scene.add.image(width / 2 - 260, height * 0.9, 'ball').setDisplaySize(64, 64);
    scene.tweens.add({ targets: b, x: width / 2 + 260, angle: 720, duration: 2200, repeat: -1, repeatDelay: 600, ease: 'Sine.easeIn' });
  },
  scenes: [PlayScene],
  strings: {
    tr: {
      frame: 'TUR', strike: 'STRIKE!', spare: 'SPARE!', double: 'ÇİFTE STRIKE!', turkey: 'ÜST ÜSTE 3 STRIKE!', gutter: 'OLUK!', split: 'SPLİT!',
      pins: '{n} LOBUT', nopins: 'HİÇ LOBUT YOK', aimHint: 'Topu sürükle · nişan için DOKUN', powerHint: 'GÜÇ için DOKUN', spinHint: 'FALSO için DOKUN',
      power: 'GÜÇ', spin: 'FALSO', perfect: 'MÜKEMMEL OYUN!', bonusRoll: 'BONUS ATIŞ', lastFrame: 'SON TUR',
    },
    en: {
      frame: 'FRAME', strike: 'STRIKE!', spare: 'SPARE!', double: 'DOUBLE!', turkey: 'TURKEY!', gutter: 'GUTTER!', split: 'SPLIT!',
      pins: '{n} PINS', nopins: 'NO PINS', aimHint: 'Drag the ball · TAP to aim', powerHint: 'TAP to set POWER', spinHint: 'TAP to set SPIN',
      power: 'POWER', spin: 'SPIN', perfect: 'PERFECT GAME!', bonusRoll: 'BONUS ROLL', lastFrame: 'LAST FRAME',
    },
  },
});
