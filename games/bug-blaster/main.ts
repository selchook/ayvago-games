import { launch, loadAudio, type GameMeta } from '@core';
import meta from './game.json';
import { PlayScene, makeTextures, PALETTES } from './PlayScene';

const J = 'oga/junkala-sfx/';

launch({
  meta: meta as GameMeta,
  background: '#07060f',
  physics: 'none',
  preload(scene) {
    const l = scene.load;
    loadAudio(l, 'shoot1', J + 'weapons/lasers/sfx-wpn-laser8');
    loadAudio(l, 'shoot2', J + 'weapons/lasers/sfx-wpn-laser2');
    loadAudio(l, 'hit1', J + 'general-sounds/simple-damage-sounds/sfx-damage-hit2');
    loadAudio(l, 'hit2', J + 'general-sounds/simple-damage-sounds/sfx-damage-hit6');
    loadAudio(l, 'hit3', J + 'general-sounds/simple-damage-sounds/sfx-damage-hit9');
    loadAudio(l, 'head', J + 'explosions/shortest/sfx-exp-shortest-hard5');
    loadAudio(l, 'mush1', J + 'general-sounds/impacts/sfx-sounds-impact3');
    loadAudio(l, 'mush2', J + 'general-sounds/impacts/sfx-sounds-impact4');
    loadAudio(l, 'spider', J + 'death-screams/alien/sfx-deathscream-alien3');
    loadAudio(l, 'spiderIn', J + 'general-sounds/interactions/sfx-sounds-interaction5');
    loadAudio(l, 'flea', J + 'movement/falling-sounds/sfx-sounds-falling5');
    loadAudio(l, 'fleaKill', J + 'death-screams/alien/sfx-deathscream-alien6');
    loadAudio(l, 'die', J + 'explosions/short/sfx-exp-short-hard6');
    loadAudio(l, 'death', J + 'explosions/medium-length/sfx-exp-medium10');
    loadAudio(l, 'low', J + 'general-sounds/alarms/low-health-alarms/sfx-lowhealth-alarmloop5');
    loadAudio(l, 'clear', J + 'general-sounds/fanfares/sfx-sounds-fanfare2');
    loadAudio(l, 'oneup', J + 'general-sounds/positive-sounds/sfx-sounds-powerup12');
    loadAudio(l, 'repair', J + 'general-sounds/coins/sfx-coin-single3');
  },
  menuDecor(scene) {
    makeTextures(scene);
    const { width, height } = scene.scale;
    const pal = PALETTES[0];
    for (let i = 0; i < 9; i++) {
      const x = width / 2 + 200 - i * 46, y = height * 0.86 + Math.sin(i * 0.9) * 18;
      const s = scene.add.image(x, y, i === 0 ? 'head' : 'seg').setTint(pal.seg).setScale(1.1);
      scene.tweens.add({ targets: s, y: y - 14, duration: 500, yoyo: true, repeat: -1, delay: i * 80, ease: 'Sine.easeInOut' });
    }
    for (const [x, y] of [[0.12, 0.08], [0.85, 0.12], [0.3, 0.06], [0.08, 0.78], [0.62, 0.9]]) {
      scene.add.image(width * x, height * y, 'mush0').setTint(pal.mush).setScale(1.3);
    }
    scene.add.image(width * 0.8, height * 0.79, 'spider').setScale(1.3);
  },
  scenes: [PlayScene],
  strings: {
    tr: { oneUp: '+1 CAN', waveN: 'DALGA {n}', repair: 'ONARIM' },
    en: { oneUp: '1UP!', waveN: 'WAVE {n}', repair: 'REPAIR' },
  },
});
