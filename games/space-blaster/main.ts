import { launch, kenney, loadAudio, type GameMeta } from '@core';
import meta from './game.json';
import { PlayScene } from './PlayScene';

const SS = 'space-shooter/png/';

launch({
  meta: meta as GameMeta,
  background: '#0b0a1a',
  preload(scene) {
    const l = scene.load;
    l.image('ship', kenney(SS + 'playership1_red.png'));
    l.image('life', kenney(SS + 'ui/playerlife1_red.png'));
    l.image('laser', kenney(SS + 'lasers/laserred01.png'));
    l.image('elaser', kenney(SS + 'lasers/lasergreen11.png'));
    for (const c of ['black', 'blue', 'green']) for (const n of [1, 2, 3]) l.image(`enemy-${c}${n}`, kenney(`${SS}enemies/enemy${c}${n}.png`));
    l.image('meteor-big', kenney(SS + 'meteors/meteorbrown_big1.png'));
    l.image('meteor-med', kenney(SS + 'meteors/meteorbrown_med1.png'));
    l.image('pu-bolt', kenney(SS + 'power-ups/powerupred_bolt.png'));
    l.image('pu-shield', kenney(SS + 'power-ups/powerupblue_shield.png'));
    l.image('shield', kenney(SS + 'effects/shield1.png'));
    l.image('star', kenney(SS + 'effects/star1.png'));
    const J = 'oga/junkala-sfx/';
    loadAudio(l, 'shoot', J + 'weapons/lasers/sfx-wpn-laser8');
    loadAudio(l, 'eshot', J + 'weapons/lasers/sfx-wpn-laser2');
    loadAudio(l, 'hit', J + 'general-sounds/simple-damage-sounds/sfx-damage-hit5');
    loadAudio(l, 'boom1', J + 'explosions/shortest/sfx-exp-shortest-hard2');
    loadAudio(l, 'boom2', J + 'explosions/shortest/sfx-exp-shortest-hard8');
    loadAudio(l, 'boom3', J + 'explosions/shortest/sfx-exp-shortest-hard9');
    loadAudio(l, 'rock', J + 'explosions/short/sfx-exp-short-soft5');
    loadAudio(l, 'power-bolt', J + 'general-sounds/positive-sounds/sfx-sounds-powerup11');
    loadAudio(l, 'power-shield', J + 'general-sounds/positive-sounds/sfx-sounds-powerup13');
    loadAudio(l, 'shieldhit', J + 'general-sounds/impacts/sfx-sounds-impact13');
    loadAudio(l, 'hurt', J + 'general-sounds/negative-sounds/sfx-sounds-damage1');
    loadAudio(l, 'die', J + 'explosions/medium-length/sfx-exp-medium3');
    loadAudio(l, 'wave', J + 'general-sounds/fanfares/sfx-sounds-fanfare3');
  },
  menuDecor(scene) {
    const { width, height } = scene.scale;
    scene.add.image(width / 2, height * 0.83, 'ship').setScale(1.4);
    scene.add.image(width * 0.2, height * 0.08, 'enemy-black1').setScale(0.8).setAngle(180);
    scene.add.image(width * 0.8, height * 0.1, 'enemy-blue2').setScale(0.8).setAngle(180);
  },
  scenes: [PlayScene],
});
