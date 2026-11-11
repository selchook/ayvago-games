import { launch, kenney, loadAudio, type GameMeta } from '@core';
import meta from './game.json';
import { PlayScene } from './PlayScene';
import { menuScene } from './menu';

const SS = 'space-shooter/png/';

launch({
  meta: meta as GameMeta,
  background: '#0b0a1a',
  difficulty: true,
  // rewarded continue: one more life after a lost run (core ads, only while the platform has ads on)
  ads: { continue: (play) => (play as PlayScene).revive() },
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
    l.image('speed', kenney(SS + 'effects/speed.png'));
    l.image('impact', kenney(SS + 'lasers/laserred08.png'));
    l.image('meteor-small', kenney(SS + 'meteors/meteorbrown_small1.png'));
    l.image('meteor-tiny', kenney(SS + 'meteors/meteorbrown_tiny1.png'));
    // engine flames (tip pointing down) that follow the ship's bank
    l.image('flame1', kenney(SS + 'effects/fire13.png'));
    l.image('flame2', kenney(SS + 'effects/fire16.png'));
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
    menuScene(scene);
  },
  scenes: [PlayScene],
  strings: {
    tr: { pBolt: 'ÇİFT ATIŞ', pShield: 'KALKAN' },
    en: { pBolt: 'DOUBLE SHOT', pShield: 'SHIELD' },
  },
});
