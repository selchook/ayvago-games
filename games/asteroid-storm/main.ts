import { launch, loadAudio, loadSfx, kenney, type GameMeta } from '@core';
import meta from './game.json';
import { PlayScene } from './PlayScene';

const SS = 'space-shooter/png/';

const J = 'oga/junkala-sfx/';

launch({
  meta: meta as GameMeta,
  background: '#07060f',
  preload(scene) {
    const l = scene.load;
    l.image('ship', kenney(SS + 'playership1_blue.png'));
    l.image('life', kenney(SS + 'ui/playerlife1_blue.png'));
    l.image('flame', kenney(SS + 'effects/fire08.png'));
    l.image('shot', kenney(SS + 'lasers/laserblue01.png'));
    l.image('eshot', kenney(SS + 'lasers/laserred10.png'));
    l.image('ufo-big', kenney(SS + 'ufored.png'));
    l.image('ufo-small', kenney(SS + 'ufoyellow.png'));
    l.image('shield', kenney(SS + 'effects/shield1.png'));
    l.image('star', kenney(SS + 'effects/star1.png'));
    for (const n of [1, 2, 3, 4]) l.image(`rock0-${n}`, kenney(`${SS}meteors/meteorgrey_big${n}.png`));
    l.image('rock1-1', kenney(SS + 'meteors/meteorgrey_med1.png'));
    l.image('rock1-2', kenney(SS + 'meteors/meteorgrey_med2.png'));
    l.image('rock2-1', kenney(SS + 'meteors/meteorgrey_small1.png'));
    l.image('rock2-2', kenney(SS + 'meteors/meteorgrey_small2.png'));
    l.image('rock-brown', kenney(SS + 'meteors/meteorbrown_big3.png'));
    loadAudio(l, 'shoot1', J + 'weapons/lasers/sfx-wpn-laser10');
    loadAudio(l, 'shoot2', J + 'weapons/lasers/sfx-wpn-laser2');
    loadAudio(l, 'boom0a', J + 'explosions/short/sfx-exp-short-soft2');
    loadAudio(l, 'boom0b', J + 'explosions/short/sfx-exp-short-soft5');
    loadAudio(l, 'boom1a', J + 'explosions/shortest/sfx-exp-shortest-soft3');
    loadAudio(l, 'boom1b', J + 'explosions/shortest/sfx-exp-shortest-soft5');
    loadAudio(l, 'boom2a', J + 'explosions/shortest/sfx-exp-shortest-hard6');
    loadAudio(l, 'boom2b', J + 'explosions/shortest/sfx-exp-shortest-hard8');
    loadAudio(l, 'hurt', J + 'explosions/short/sfx-exp-short-hard5');
    loadAudio(l, 'death', J + 'explosions/medium-length/sfx-exp-medium8');
    loadAudio(l, 'low', J + 'general-sounds/alarms/low-health-alarms/sfx-lowhealth-alarmloop5');
    loadAudio(l, 'hyper', J + 'movement/portals-and-transitions/sfx-movement-portal5');
    loadAudio(l, 'ufo', J + 'general-sounds/alarms/alarms/sfx-alarm-loop6');
    loadAudio(l, 'ufo-boom', J + 'explosions/short/sfx-exp-short-hard13');
    loadAudio(l, 'eshoot', J + 'weapons/lasers/sfx-wpn-laser1');
    loadAudio(l, 'wave', J + 'movement/portals-and-transitions/sfx-movement-portal3');
    loadAudio(l, 'clear', J + 'general-sounds/fanfares/sfx-sounds-fanfare2');
    loadAudio(l, 'life', J + 'general-sounds/positive-sounds/sfx-sounds-powerup12');
    loadSfx(l, 'beat', 'sfx-digital/audio/tone1');
  },
  menuDecor(scene) {
    const { width, height } = scene.scale;
    for (let i = 0; i < 70; i++) scene.add.image(Math.random() * width, Math.random() * height, 'star').setScale(0.1 + Math.random() * 0.25).setAlpha(0.3 + Math.random() * 0.5);
    const rocks: Array<[number, number, string, number]> = [[0.15, 0.08, 'rock0-1', 1.1], [0.85, 0.12, 'rock-brown', 1], [0.2, 0.86, 'rock1-1', 1.4], [0.82, 0.9, 'rock0-3', 1.2]];
    for (const [x, y, k, s] of rocks) {
      const r = scene.add.image(width * x, height * y, k).setScale(s);
      scene.tweens.add({ targets: r, angle: 360, duration: 9000 + Math.random() * 6000, repeat: -1 });
    }
    scene.add.image(width / 2, height * 0.8, 'ship').setScale(1.1).setAngle(-20);
  },
  scenes: [PlayScene],
  strings: {
    tr: { extraLife: 'EKSTRA CAN!', waveClear: 'DALGA TEMİZ!', ufoAlert: 'UFO!', hyper: 'HİPERUZAY' },
    en: { extraLife: 'EXTRA LIFE!', waveClear: 'WAVE CLEAR!', ufoAlert: 'UFO!', hyper: 'HYPERSPACE' },
  },
});
