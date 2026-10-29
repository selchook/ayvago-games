import { launch, loadAudio, kenney, type GameMeta } from '@core';
import meta from './game.json';
import { PlayScene, makeTextures } from './PlayScene';

const TP = 'tappy-plane/png/';

const J = 'oga/junkala-sfx/';

launch({
  meta: meta as GameMeta,
  background: '#120c0a',
  physics: 'none',
  preload(scene) {
    const l = scene.load;
    for (const k of ['rock', 'rockdown', 'rockgrass', 'rockgrassdown', 'rockice', 'rockicedown', 'rocksnow', 'rocksnowdown', 'stargold', 'puffsmall', 'pufflarge']) {
      l.image(k, kenney(TP + k + '.png'));
    }
    loadAudio(l, 'star1', J + 'general-sounds/coins/sfx-coin-double3');
    loadAudio(l, 'star2', J + 'general-sounds/coins/sfx-coin-double4');
    loadAudio(l, 'hit', J + 'explosions/short/sfx-exp-short-hard3');
    loadAudio(l, 'low', J + 'general-sounds/alarms/low-health-alarms/sfx-lowhealth-alarmloop5');
    loadAudio(l, 'crash', J + 'explosions/medium-length/sfx-exp-medium1');
    loadAudio(l, 'zone', J + 'general-sounds/fanfares/sfx-sounds-fanfare3');
    loadAudio(l, 'start', J + 'general-sounds/weird-sounds/sfx-sound-poweron');
    loadAudio(l, 'blip', J + 'general-sounds/high-pitched-sounds/sfx-sounds-high3');
    loadAudio(l, 'rotor', J + 'movement/vehicles/sfx-vehicle-helicopterloop1');
  },
  menuDecor(scene) {
    makeTextures(scene);
    const { width, height } = scene.scale;
    const g = scene.add.graphics();
    g.fillStyle(0x3b2618).fillRect(0, 0, width, 90).fillRect(0, height - 110, width, 110);
    g.lineStyle(8, 0x8a5a3a).lineBetween(0, 90, width, 90).lineBetween(0, height - 110, width, height - 110);
    const heli = scene.add.container(width / 2, height * 0.83);
    const rotor = scene.add.image(4, -34, 'rotor');
    heli.add([scene.add.image(0, 0, 'heli'), rotor]).setScale(1.4);
    scene.tweens.add({ targets: rotor, scaleX: 0.15, duration: 60, yoyo: true, repeat: -1 });
    scene.tweens.add({ targets: heli, y: heli.y - 24, angle: -4, duration: 900, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    scene.add.image(width * 0.12, 90, 'rockdown').setOrigin(0.5, 0.1).setScale(0.7);
    scene.add.image(width * 0.88, height - 110, 'rock').setOrigin(0.5, 0.9).setScale(0.7);
  },
  scenes: [PlayScene],
  strings: {
    tr: { hold: 'YÜKSELMEK İÇİN BASILI TUT', zone: 'BÖLGE', zoneN: 'BÖLGE {n}' },
    en: { hold: 'HOLD TO FLY UP', zone: 'ZONE', zoneN: 'ZONE {n}' },
  },
});
