import { launch, kenney, loadAudio, steeringOption, type GameMeta } from '@core';
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
    loadAudio(l, 'engine', J + 'movement/vehicles/sfx-vehicle-carloop2');
    loadAudio(l, 'boost', J + 'movement/portals-and-transitions/sfx-movement-portal3');
  },
  menuDecor(scene) {
    warmText(scene, [[16, true], [18, true], [20, true], [22, true], [26, true], [28, true], [40, true], [44, true], [48, true], [56, true], [72, true], [24, false]]);
    makeRacerTextures(scene);
    const { width, height } = scene.scale;
    // the highway runs under the whole menu, dimmed so the text stays readable
    scene.add.tileSprite(0, 0, width, height, 'grass').setOrigin(0);
    const roadL = width / 2 - 240;
    scene.add.rectangle(roadL, 0, 480, height, 0x3a3d45).setOrigin(0);
    const lines = scene.add.tileSprite(roadL, 0, 480, height, 'tr-lines').setOrigin(0);
    scene.tweens.add({ targets: lines, tilePositionY: -1200, duration: 2400, repeat: -1 });
    // traffic slips by under the dimming, the player's car weaves between it at the bottom
    const lanes = [roadL + 60, roadL + 180, roadL + 300, roadL + 420];
    const keys = ['car_blue_3', 'car_yellow_2', 'car_green_4', 'car_black_1', 'motorcycle_yellow'];
    lanes.forEach((x, i) => {
      const c = scene.add.image(x, -120, keys[i % keys.length]);
      scene.tweens.add({ targets: c, y: height + 120, duration: 3200 + i * 700, delay: i * 900, repeat: -1, repeatDelay: 400 + i * 300 });
    });
    scene.add.rectangle(0, 0, width, height, 0x0b1408, 0.62).setOrigin(0);
    const p = scene.add.image(lanes[1], height * 0.86, 'player');
    scene.tweens.add({ targets: p, x: lanes[2], angle: 8, duration: 700, yoyo: true, repeat: -1, hold: 900, repeatDelay: 900, ease: 'Sine.easeInOut' });
  },
  difficulty: true,
  menuOption: steeringOption,
  scenes: [PlayScene],
  strings: {
    tr: {
      level: 'SEVİYE', near: 'KIL PAYI!', fuel: 'BENZİN', fuelUp: '+BENZİN', lowFuel: 'BENZİN AZ!', outOfFuel: 'BENZİN BİTTİ!', crash: 'KAZA!',
      kmh: 'KM/SA', km: 'KM', oil: 'YAĞ!', go: 'GAZLA!', boost: 'TURBO', brake: 'FREN', combo: 'KOMBO',
    },
    en: {
      level: 'LEVEL', near: 'NEAR MISS!', fuel: 'FUEL', fuelUp: '+FUEL', lowFuel: 'LOW FUEL!', outOfFuel: 'OUT OF FUEL!', crash: 'CRASH!',
      kmh: 'KM/H', km: 'KM', oil: 'OIL!', go: 'GO!', boost: 'BOOST', brake: 'BRAKE', combo: 'COMBO',
    },
  },
});
