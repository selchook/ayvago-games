import { launch, loadAudio, loadSfx, kenney, type GameMeta } from '@core';
import meta from './game.json';
import { PlayScene } from './PlayScene';
import { menuScene } from './menu';

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
    menuScene(scene);
  },
  scenes: [PlayScene],
  strings: {
    tr: { extraLife: 'EKSTRA CAN!', waveClear: 'DALGA TEMİZ!', ufoAlert: 'UFO!', hyper: 'HİPERUZAY' },
    en: { extraLife: 'EXTRA LIFE!', waveClear: 'WAVE CLEAR!', ufoAlert: 'UFO!', hyper: 'HYPERSPACE' },
  },
});
