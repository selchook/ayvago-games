import { launch, loadAudio, kenney, type GameMeta } from '@core';
import meta from './game.json';
import { PlayScene, makeTextures } from './PlayScene';

const SS = 'space-shooter/png/';

const J = 'oga/junkala-sfx/';

launch({
  meta: meta as GameMeta,
  background: '#0a0718',
  preload(scene) {
    const l = scene.load;
    l.image('crosshair', kenney('shooting-gallery/png/hud/crosshair_white_large.png'));
    l.image('marker', kenney(SS + 'lasers/laserblue10.png'));
    l.image('turret', kenney(SS + 'parts/turretbase_big.png'));
    l.image('gun', kenney(SS + 'parts/gun09.png'));
    l.image('star', kenney(SS + 'effects/star1.png'));
    l.image('warhead', kenney(SS + 'lasers/laserred08.png'));
    loadAudio(l, 'launch', J + 'weapons/grenade-whistles/sfx-wpn-missilelaunch');
    loadAudio(l, 'boom1', J + 'explosions/shortest/sfx-exp-shortest-soft1');
    loadAudio(l, 'boom2', J + 'explosions/shortest/sfx-exp-shortest-soft2');
    loadAudio(l, 'boom3', J + 'explosions/shortest/sfx-exp-shortest-soft6');
    loadAudio(l, 'pop', J + 'general-sounds/simple-damage-sounds/sfx-damage-hit7');
    loadAudio(l, 'combo', J + 'general-sounds/positive-sounds/sfx-sounds-powerup6');
    loadAudio(l, 'impact', J + 'explosions/short/sfx-exp-short-hard2');
    loadAudio(l, 'ruin', J + 'explosions/medium-length/sfx-exp-medium5');
    loadAudio(l, 'fallen', J + 'explosions/long/sfx-exp-long2');
    loadAudio(l, 'low', J + 'general-sounds/alarms/low-health-alarms/sfx-lowhealth-alarmloop5');
    loadAudio(l, 'empty', J + 'weapons/out-of-ammo/sfx-wpn-noammo1');
    loadAudio(l, 'tally', J + 'general-sounds/coins/sfx-coin-single4');
    loadAudio(l, 'tallyCity', J + 'general-sounds/coins/sfx-coin-double6');
    loadAudio(l, 'clear', J + 'general-sounds/fanfares/sfx-sounds-fanfare2');
    loadAudio(l, 'wave', J + 'general-sounds/alarms/alarms/sfx-alarm-loop1');
    loadAudio(l, 'bonus', J + 'general-sounds/positive-sounds/sfx-sounds-powerup16');
    loadAudio(l, 'split', J + 'weapons/lasers/sfx-wpn-laser4');
  },
  menuDecor(scene) {
    makeTextures(scene);
    const { width, height } = scene.scale;
    for (let i = 0; i < 60; i++) scene.add.image(Math.random() * width, Math.random() * height * 0.7, 'star').setScale(0.08 + Math.random() * 0.2).setAlpha(0.3 + Math.random() * 0.4);
    const g = scene.add.graphics();
    g.fillStyle(0x2b1d0e).fillRect(0, height * 0.9, width, height * 0.1);
    for (const x of [0.2, 0.35, 0.65, 0.8]) scene.add.image(width * x, height * 0.9, 'city').setOrigin(0.5, 1);
    g.lineStyle(4, 0xec3013, 0.9);
    for (const [x0, x1] of [[0.1, 0.35], [0.6, 0.2], [0.9, 0.7]]) g.lineBetween(width * x0, 0, width * x1, height * 0.12);
    for (const x of [0.35, 0.2, 0.7]) scene.add.circle(width * x, height * 0.12, 26, 0xffd23f, 0.85);
  },
  scenes: [PlayScene],
  strings: {
    tr: { cities: 'ŞEHİR', ammo: 'MERMİ', bonusCity: 'BONUS ŞEHİR!', out: 'BİTTİ', low: 'AZ', fallen: 'ŞEHİRLER DÜŞTÜ' },
    en: { cities: 'CITIES', ammo: 'AMMO', bonusCity: 'BONUS CITY!', out: 'OUT', low: 'LOW', fallen: 'CITIES FALLEN' },
  },
});
