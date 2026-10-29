import { launch, kenney, loadAudio, loadSfx, type GameMeta } from '@core';
import meta from './game.json';
import { PlayScene } from './PlayScene';

const SS = 'space-shooter/png/';
const J = 'oga/junkala-sfx/';

launch({
  meta: meta as GameMeta,
  background: '#090814',
  preload(scene) {
    const l = scene.load;
    l.image('player', kenney(SS + 'playership3_green.png'));
    l.image('life', kenney(SS + 'ui/playerlife3_green.png'));
    l.image('shot', kenney(SS + 'lasers/laserblue01.png'));
    l.image('bomb', kenney(SS + 'lasers/laserred08.png'));
    l.image('star', kenney(SS + 'effects/star1.png'));
    for (const k of ['red1', 'red5', 'blue3', 'blue2', 'green2', 'green3']) l.image('alien-' + k, kenney(`${SS}enemies/enemy${k}.png`));
    l.image('mystery', kenney('alien-ufo/png/shippink.png'));
    l.image('mystery-menu', kenney('alien-ufo/png/shipyellow_manned.png'));
    loadAudio(l, 'shoot1', J + 'weapons/lasers/sfx-wpn-laser8');
    loadAudio(l, 'shoot2', J + 'weapons/lasers/sfx-wpn-laser2');
    loadAudio(l, 'kill1', J + 'explosions/shortest/sfx-exp-shortest-hard2');
    loadAudio(l, 'kill2', J + 'explosions/shortest/sfx-exp-shortest-hard9');
    loadAudio(l, 'kill3', J + 'explosions/shortest/sfx-exp-shortest-soft7');
    loadAudio(l, 'bomb', J + 'weapons/lasers/sfx-wpn-laser10');
    loadAudio(l, 'chip', J + 'general-sounds/simple-damage-sounds/sfx-damage-hit3');
    loadAudio(l, 'hurt', J + 'explosions/short/sfx-exp-short-hard4');
    loadAudio(l, 'death', J + 'explosions/medium-length/sfx-exp-medium3');
    loadAudio(l, 'low', J + 'general-sounds/alarms/low-health-alarms/sfx-lowhealth-alarmloop5');
    loadSfx(l, 'march', 'sfx-digital/audio/tone1');
    loadAudio(l, 'ufo', J + 'general-sounds/alarms/alarms/sfx-alarm-loop4');
    loadAudio(l, 'ufo-kill', J + 'explosions/short/sfx-exp-short-hard1');
    loadAudio(l, 'ufo-coins', J + 'general-sounds/coins/sfx-coin-cluster3');
    loadAudio(l, 'clink', J + 'general-sounds/impacts/sfx-sounds-impact5');
    loadAudio(l, 'level', J + 'general-sounds/fanfares/sfx-sounds-fanfare1');
  },
  menuDecor(scene) {
    const { width, height } = scene.scale;
    for (let i = 0; i < 60; i++) scene.add.image(Math.random() * width, Math.random() * height, 'star').setScale(0.08 + Math.random() * 0.2).setAlpha(0.3 + Math.random() * 0.4);
    const rows = ['alien-red1', 'alien-blue3', 'alien-green2'];
    rows.forEach((k, r) => {
      for (let c = 0; c < 5; c++) {
        const a = scene.add.image(width / 2 + (c - 2) * 84, 52 + r * 50, k).setScale(0.42);
        scene.tweens.add({ targets: a, x: a.x + 30, duration: 900, yoyo: true, repeat: -1, ease: 'Stepped', easeParams: [4] });
      }
    });
    scene.add.image(width / 2, height * 0.8, 'player').setScale(1);
    scene.add.image(width * 0.8, height * 0.87, 'mystery-menu').setScale(0.6);
  },
  scenes: [PlayScene],
  strings: {
    tr: { invaded: 'İSTİLA EDİLDİ!', mystery: 'GİZEMLİ UFO!' },
    en: { invaded: 'INVADED!', mystery: 'MYSTERY UFO!' },
  },
});
