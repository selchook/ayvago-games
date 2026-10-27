import { launch, kenney, loadSfx, type GameMeta } from '@core';
import Phaser from 'phaser';
import meta from './game.json';
import { PlayScene, drawHoop } from './PlayScene';

const SP = 'sports/png/';

launch({
  meta: meta as GameMeta,
  background: '#1b1420',
  physics: 'none',
  preload(scene) {
    const l = scene.load;
    l.image('ball', kenney(SP + 'equipment/ball_basket1.png'));
    loadSfx(l, 'throw', 'sfx-interface/audio/drop_002');
    loadSfx(l, 'rim', 'sfx-impact/audio/impactmetal_light_001');
    loadSfx(l, 'board', 'sfx-impact/audio/impactplank_medium_001');
    loadSfx(l, 'bounce', 'sfx-impact/audio/impactsoft_heavy_001');
    loadSfx(l, 'score', 'sfx-digital/audio/powerup3');
    loadSfx(l, 'swish', 'sfx-interface/audio/confirmation_002');
    loadSfx(l, 'tick', 'sfx-interface/audio/tick_001');
    loadSfx(l, 'buzzer', 'sfx-digital/audio/lowthreetone');
    loadSfx(l, 'levelup', 'sfx-digital/audio/phaserup3');
    loadSfx(l, 'miss', 'sfx-interface/audio/error_004');
  },
  menuDecor(scene) {
    const { width, height } = scene.scale;
    scene.textures.get('ball').setFilter(Phaser.Textures.FilterMode.NEAREST);
    const g = scene.add.graphics();
    drawHoop(g, width / 2, height * 0.84, 0, 0);
    const b = scene.add.image(width * 0.3, height * 0.76, 'ball').setScale(4.4);
    scene.tweens.add({ targets: b, y: height * 0.7, angle: 360, duration: 900, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
  },
  scenes: [PlayScene],
  strings: {
    tr: { timeUp: 'SÜRE BİTTİ!', swish: 'TEMİZ!', streak: 'SERİ x{n}', buzzer: 'SON SANİYE!', bank: 'TAHTADAN!', levelUp: 'SEVİYE {n}', secs: '+{n} sn' },
    en: { timeUp: "TIME'S UP!", swish: 'SWISH!', streak: 'STREAK x{n}', buzzer: 'BUZZER BEATER!', bank: 'BANK SHOT!', levelUp: 'LEVEL {n}', secs: '+{n}s' },
  },
});
