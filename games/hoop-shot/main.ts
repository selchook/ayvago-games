import { launch, kenney, loadAudio, loadSfx, type GameMeta } from '@core';
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
    const J = 'oga/junkala-sfx/';
    loadAudio(l, 'throw', J + 'movement/jumping-and-landing/sfx-movement-jump16');
    loadSfx(l, 'rim', 'sfx-impact/audio/impactmetal_light_001');
    loadSfx(l, 'rim2', 'sfx-impact/audio/impactmetal_light_003');
    loadSfx(l, 'rim3', 'sfx-impact/audio/impactmetal_medium_002');
    loadSfx(l, 'board', 'sfx-impact/audio/impactplank_medium_001');
    loadSfx(l, 'board2', 'sfx-impact/audio/impactplank_medium_003');
    loadSfx(l, 'bounce', 'sfx-impact/audio/impactsoft_heavy_001');
    loadSfx(l, 'bounce2', 'sfx-impact/audio/impactsoft_heavy_003');
    loadAudio(l, 'net', J + 'weapons/melee/sfx-wpn-sword1');
    loadAudio(l, 'score', J + 'general-sounds/coins/sfx-coin-double2');
    loadAudio(l, 'swish', J + 'general-sounds/positive-sounds/sfx-sounds-powerup8');
    loadAudio(l, 'beater', J + 'general-sounds/fanfares/sfx-sounds-fanfare1');
    loadAudio(l, 'tick', J + 'general-sounds/high-pitched-sounds/sfx-sounds-high1');
    loadAudio(l, 'buzzer', J + 'general-sounds/alarms/alarms/sfx-alarm-loop5');
    loadAudio(l, 'levelup', J + 'general-sounds/positive-sounds/sfx-sounds-powerup2');
    loadAudio(l, 'miss', J + 'general-sounds/negative-sounds/sfx-sounds-error15');
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
