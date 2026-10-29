import { launch, kenney, loadAudio, type GameMeta } from '@core';
import meta from './game.json';
import { PlayScene, makeRacerTextures, TRAFFIC } from './PlayScene';
import { warmText } from './fasttext';

const RC = 'racing/png/';

launch({
  meta: meta as GameMeta,
  background: '#1d2b1a',
  physics: 'none',
  preload(scene) {
    const l = scene.load;
    l.image('player', kenney(RC + 'cars/car_red_1.png'));
    for (const k of TRAFFIC) l.image(k, kenney(`${RC}${k.startsWith('motorcycle') ? 'motorcycles' : 'cars'}/${k}.png`));
    l.image('grass', kenney(RC + 'tiles/grass/land_grass11.png'));
    l.image('tree', kenney(RC + 'objects/tree_small.png'));
    l.image('cone', kenney(RC + 'objects/cone_straight.png'));
    l.image('barrel', kenney(RC + 'objects/barrel_red.png'));
    l.image('oil', kenney(RC + 'objects/oil.png'));
    l.image('tires', kenney(RC + 'objects/tires_white.png'));
    l.image('coin', kenney('platformer/png/items/coingold.png'));
    const J = 'oga/junkala-sfx/';
    loadAudio(l, 'beep', J + 'general-sounds/simple-bleeps/sfx-sounds-blip2');
    loadAudio(l, 'coin1', J + 'general-sounds/coins/sfx-coin-single2');
    loadAudio(l, 'coin2', J + 'general-sounds/coins/sfx-coin-single4');
    loadAudio(l, 'crash', J + 'explosions/short/sfx-exp-short-hard3');
    loadAudio(l, 'wreck', J + 'explosions/medium-length/sfx-exp-medium8');
    loadAudio(l, 'bump', J + 'general-sounds/impacts/sfx-sounds-impact12');
    loadAudio(l, 'near', J + 'general-sounds/high-pitched-sounds/sfx-sounds-high4');
    loadAudio(l, 'fuel', J + 'general-sounds/positive-sounds/sfx-sounds-powerup14');
    loadAudio(l, 'level', J + 'general-sounds/fanfares/sfx-sounds-fanfare3');
    loadAudio(l, 'low', J + 'general-sounds/alarms/low-health-alarms/sfx-lowhealth-alarmloop1');
    loadAudio(l, 'skid', J + 'movement/vehicles/sfx-vehicle-breaks');
    loadAudio(l, 'empty', J + 'general-sounds/weird-sounds/sfx-sound-shutdown1');
  },
  menuDecor(scene) {
    warmText(scene, [[18, true], [20, true], [22, true], [26, true], [28, true], [40, true], [44, true], [48, true], [56, true], [72, true], [24, false]]);
    makeRacerTextures(scene);
    const { width, height } = scene.scale;
    const g = scene.add.graphics();
    g.fillStyle(0x3a3d45, 1).fillRect(width / 2 - 200, height * 0.72, 400, height * 0.28);
    g.fillStyle(0xffffff, 0.8);
    for (let y = height * 0.72; y < height; y += 60) { g.fillRect(width / 2 - 70, y, 8, 34); g.fillRect(width / 2 + 62, y, 8, 34); }
    const p = scene.add.image(width / 2, height * 0.9, 'player');
    scene.tweens.add({ targets: p, x: width / 2 + 130, angle: 8, duration: 700, yoyo: true, repeat: -1, hold: 300, repeatDelay: 300, ease: 'Sine.easeInOut' });
    const c = scene.add.image(width / 2 - 130, height * 0.76, 'car_blue_3');
    scene.tweens.add({ targets: c, y: height * 1.1, duration: 2200, repeat: -1 });
  },
  scenes: [PlayScene],
  strings: {
    tr: {
      level: 'SEVİYE', near: 'KIL PAYI!', fuel: 'BENZİN', fuelUp: '+BENZİN', lowFuel: 'BENZİN AZ!', outOfFuel: 'BENZİN BİTTİ!', crash: 'KAZA!',
      kmh: 'KM/SA', km: 'KM', oil: 'YAĞ!', go: 'GAZLA!',
    },
    en: {
      level: 'LEVEL', near: 'NEAR MISS!', fuel: 'FUEL', fuelUp: '+FUEL', lowFuel: 'LOW FUEL!', outOfFuel: 'OUT OF FUEL!', crash: 'CRASH!',
      kmh: 'KM/H', km: 'KM', oil: 'OIL!', go: 'GO!',
    },
  },
});
