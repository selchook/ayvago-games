import { launch, kenney, loadSfx, type GameMeta } from '@core';
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
    loadSfx(l, 'shoot', 'sfx-digital/audio/laser4');
    loadSfx(l, 'boom', 'sfx-digital/audio/lowdown');
    loadSfx(l, 'hit', 'sfx-digital/audio/zap1');
    loadSfx(l, 'power', 'sfx-digital/audio/powerup3');
    loadSfx(l, 'hurt', 'sfx-digital/audio/phaserdown3');
  },
  menuDecor(scene) {
    const { width, height } = scene.scale;
    scene.add.image(width / 2, height * 0.83, 'ship').setScale(1.4);
    scene.add.image(width * 0.2, height * 0.08, 'enemy-black1').setScale(0.8).setAngle(180);
    scene.add.image(width * 0.8, height * 0.1, 'enemy-blue2').setScale(0.8).setAngle(180);
  },
  scenes: [PlayScene],
});
