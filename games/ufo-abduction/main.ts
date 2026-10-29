import Phaser from 'phaser';
import { launch, kenney, loadAudio, loadSfx, type GameMeta } from '@core';
import meta from './game.json';
import { PlayScene, ANIMALS, makeTextures } from './PlayScene';

const UFO = 'alien-ufo/png/';

launch({
  meta: meta as GameMeta,
  background: '#120f2b',
  physics: 'none',
  preload(scene) {
    const l = scene.load;
    l.image('ufo0', kenney(UFO + 'shipgreen.png'));
    l.image('ufo1', kenney(UFO + 'shipgreen_damage1.png'));
    l.image('ufo2', kenney(UFO + 'shipgreen_damage2.png'));
    l.image('boom', kenney(UFO + 'laserpink_burst.png'));
    l.image('gburst', kenney(UFO + 'lasergreen_groundburst.png'));
    for (const a of ANIMALS) l.image('an-' + a.k, kenney(`animals/png/round/${a.k}.png`));
    for (const n of [1, 2, 3]) l.image('plane' + n, kenney(`tappy-plane/png/planes/planered${n}.png`));
    l.image('puff', kenney('tappy-plane/png/puffsmall.png'));
    l.image('grass', kenney('platformer/png/ground/grass/grassmid.png'));
    const J = 'oga/junkala-sfx/';
    loadAudio(l, 'beam', J + 'weapons/lasers/sfx-wpn-laser3');
    loadAudio(l, 'grab', J + 'general-sounds/positive-sounds/sfx-sounds-powerup10');
    loadAudio(l, 'golden', J + 'general-sounds/coins/sfx-coin-cluster1');
    loadAudio(l, 'combo', J + 'general-sounds/positive-sounds/sfx-sounds-powerup6');
    loadAudio(l, 'launch', J + 'weapons/grenade-whistles/sfx-wpn-missilelaunch');
    loadAudio(l, 'warn', J + 'general-sounds/alarms/low-health-alarms/sfx-lowhealth-alarmloop7');
    loadAudio(l, 'warnplane', J + 'general-sounds/weird-sounds/sfx-sound-nagger1');
    loadAudio(l, 'jet', J + 'movement/vehicles/sfx-vehicle-plainloop');
    loadAudio(l, 'boom', J + 'explosions/shortest/sfx-exp-shortest-hard1');
    loadAudio(l, 'fizzle', J + 'explosions/shortest/sfx-exp-shortest-soft5');
    loadAudio(l, 'hurt', J + 'general-sounds/negative-sounds/sfx-sounds-damage1');
    loadAudio(l, 'die', J + 'explosions/long/sfx-exp-long1');
    loadAudio(l, 'bonk', J + 'movement/jumping-and-landing/sfx-movement-jump9-landing');
    loadAudio(l, 'overheat', J + 'general-sounds/weird-sounds/sfx-sound-vaporizing');
    loadAudio(l, 'ready', J + 'general-sounds/pause-sounds/sfx-sounds-pause3-in');
    loadSfx(l, 'level', 'jingles/audio/8-bit_jingles/jingles_nes05');
  },
  menuDecor(scene) {
    makeTextures(scene);
    const { width, height } = scene.scale;
    scene.add.image(width / 2, height, 'sky').setOrigin(0.5, 1).setAlpha(0.9);
    const ufo = scene.add.image(width / 2, height * 0.8, 'ufo0').setScale(1.3);
    const beam = scene.add.graphics();
    beam.fillStyle(0x7dffb0, 0.25).fillPoints([
      new Phaser.Geom.Point(width / 2 - 40, height * 0.83), new Phaser.Geom.Point(width / 2 + 40, height * 0.83),
      new Phaser.Geom.Point(width / 2 + 110, height * 0.95), new Phaser.Geom.Point(width / 2 - 110, height * 0.95),
    ], true);
    const cow = scene.add.image(width / 2, height * 0.91, 'an-cow').setScale(0.55);
    scene.tweens.add({ targets: cow, y: height * 0.88, angle: 12, duration: 900, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    scene.tweens.add({ targets: ufo, y: ufo.y - 10, duration: 1200, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    scene.add.image(width * 0.15, height * 0.1, 'an-pig').setScale(0.5).setAngle(-15);
    scene.add.image(width * 0.85, height * 0.12, 'an-chick').setScale(0.5).setAngle(15);
  },
  scenes: [PlayScene],
  strings: {
    tr: { energy: 'ENERJİ', levelUp: 'SEVİYE {n}', overheat: 'AŞIRI ISINDI!', goal: 'Hedef: {n} hayvan', repaired: 'ONARILDI +1', caught: 'KAÇIRILAN' },
    en: { energy: 'ENERGY', levelUp: 'LEVEL {n}', overheat: 'OVERHEATED!', goal: 'Goal: {n} animals', repaired: 'REPAIRED +1', caught: 'CAUGHT' },
  },
});
