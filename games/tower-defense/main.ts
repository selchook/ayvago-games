import { launch, kenney, loadAudio, type GameMeta } from '@core';
import meta from './game.json';
import { PlayScene } from './PlayScene';
import { warmText } from './fasttext';

const TILE = (n: number) => kenney(`tower-defense/png/default_size/towerdefense_tile${String(n).padStart(3, '0')}.png`);

const IMAGES: Record<string, number> = {
  'td-grass': 157, 'td-dirt': 158, 'td-bush': 130, 'td-bush2': 131, 'td-rock': 135, 'td-rock2': 136,
  'td-b0': 180, 'td-b1': 181, 'td-b2': 182, 'td-h0': 203, 'td-h1': 226, 'td-h2': 206, 'td-h2b': 205,
  'td-e0': 245, 'td-e1': 246, 'td-e2': 247, 'td-tank': 268, 'td-tank-t': 291, 'td-tank2': 269, 'td-tank2-t': 292,
  'td-plane': 270, 'td-shadow': 293, 'td-bullet': 273, 'td-shell': 274, 'td-rocket': 251, 'td-coin': 272,
  'td-scorch': 19, 'td-blast': 21, 'td-fire': 295,
};

launch({
  meta: meta as GameMeta,
  background: '#14261a',
  physics: 'none',
  preload(scene) {
    const l = scene.load;
    for (const [k, n] of Object.entries(IMAGES)) l.image(k, TILE(n));
    const J = 'oga/junkala-sfx/';
    loadAudio(l, 'build', J + 'general-sounds/impacts/sfx-sounds-impact12');
    loadAudio(l, 'gun', J + 'weapons/single-shot-sounds/sfx-weapon-singleshot19');
    loadAudio(l, 'cannon', J + 'weapons/cannon/sfx-wpn-cannon1');
    loadAudio(l, 'missile', J + 'weapons/grenade-whistles/sfx-wpn-missilelaunch');
    loadAudio(l, 'boom1', J + 'explosions/shortest/sfx-exp-shortest-hard4');
    loadAudio(l, 'boom2', J + 'explosions/shortest/sfx-exp-shortest-hard5');
    loadAudio(l, 'boom3', J + 'explosions/shortest/sfx-exp-shortest-hard6');
    loadAudio(l, 'kill1', J + 'general-sounds/simple-damage-sounds/sfx-damage-hit9');
    loadAudio(l, 'kill2', J + 'general-sounds/simple-damage-sounds/sfx-damage-hit3');
    loadAudio(l, 'killtank', J + 'explosions/short/sfx-exp-short-hard6');
    loadAudio(l, 'killplane', J + 'explosions/shortest/sfx-exp-shortest-soft3');
    loadAudio(l, 'killboss', J + 'explosions/medium-length/sfx-exp-medium2');
    loadAudio(l, 'leak', J + 'general-sounds/negative-sounds/sfx-sounds-damage2');
    loadAudio(l, 'lowhp', J + 'general-sounds/alarms/low-health-alarms/sfx-lowhealth-alarmloop5');
    loadAudio(l, 'wave', J + 'general-sounds/alarms/alarms/sfx-alarm-loop6');
    loadAudio(l, 'final', J + 'general-sounds/alarms/alarms/sfx-alarm-loop3');
    loadAudio(l, 'tick', J + 'general-sounds/simple-bleeps/sfx-sounds-blip8');
    loadAudio(l, 'clear', J + 'general-sounds/fanfares/sfx-sounds-fanfare2');
    loadAudio(l, 'upgrade', J + 'general-sounds/positive-sounds/sfx-sounds-powerup12');
    loadAudio(l, 'sell', J + 'general-sounds/coins/sfx-coin-cluster4');
    loadAudio(l, 'error', J + 'general-sounds/negative-sounds/sfx-sounds-error5');
    loadAudio(l, 'select', J + 'general-sounds/menu-sounds/sfx-menu-select2');
  },
  menuDecor(scene) {
    warmText(scene, [[26, true], [16, true], [1, true], [26, false], [22, false], [18, true], [20, true], [48, true], [36, true], [32, true]]);
    const { width, height } = scene.scale;
    for (let x = 0; x < width; x += 80) scene.add.image(x + 40, height - 40, 'td-dirt').setDisplaySize(80, 80).setAlpha(0.35);
    scene.add.image(width * 0.12, height * 0.55, 'td-b2').setScale(1.6);
    scene.add.image(width * 0.12, height * 0.55, 'td-h2').setScale(1.6).setAngle(30);
    scene.add.image(width * 0.88, height * 0.55, 'td-b0').setScale(1.6);
    scene.add.image(width * 0.88, height * 0.55, 'td-h0').setScale(1.6).setAngle(-40);
    scene.add.image(width * 0.25, height * 0.86, 'td-tank').setScale(1.3);
    scene.add.image(width * 0.25, height * 0.86, 'td-tank-t').setScale(1.3);
    scene.add.image(width * 0.75, height * 0.15, 'td-plane').setScale(1.2).setAngle(-10);
  },
  scenes: [PlayScene],
  strings: {
    tr: {
      tGun: 'Taret', tCannon: 'Top', tMissile: 'Füze', groundOnly: 'Sadece kara', airGround: 'Kara + hava',
      upgrade: 'GELİŞTİR', sell: 'SAT', max: 'MAKS', nextWave: 'DALGA', nextIn: 'BAŞLAT {n}', waveOf: 'DALGA {n}/{m}',
      finalWave: 'SON DALGA!', bossIn: 'DEV TANK!', noGold: 'Altın yetmiyor!', cantBuild: 'Buraya kurulmaz', clearBonus: 'DALGA TEMİZ',
      lvl: 'Sv.', victory: 'ÜS KURTULDU!',
    },
    en: {
      tGun: 'Turret', tCannon: 'Cannon', tMissile: 'Missile', groundOnly: 'Ground only', airGround: 'Ground + air',
      upgrade: 'UPGRADE', sell: 'SELL', max: 'MAX', nextWave: 'WAVE', nextIn: 'START {n}', waveOf: 'WAVE {n}/{m}',
      finalWave: 'FINAL WAVE!', bossIn: 'GIANT TANK!', noGold: 'Not enough gold!', cantBuild: "Can't build here", clearBonus: 'WAVE CLEAR',
      lvl: 'Lv.', victory: 'BASE SAVED!',
    },
  },
});
