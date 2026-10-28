import Phaser from 'phaser';
import { launch, kenney, loadSfx, type GameMeta } from '@core';
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
    loadSfx(l, 'beam', 'sfx-digital/audio/phaserup2');
    loadSfx(l, 'grab', 'sfx-digital/audio/powerup3');
    loadSfx(l, 'combo', 'sfx-digital/audio/powerup7');
    loadSfx(l, 'launch', 'sfx-digital/audio/laser6');
    loadSfx(l, 'warn', 'sfx-interface/audio/tick_002');
    loadSfx(l, 'jet', 'sfx-digital/audio/phasejump3');
    loadSfx(l, 'boom', 'sfx-digital/audio/lowdown');
    loadSfx(l, 'hurt', 'sfx-digital/audio/phaserdown3');
    loadSfx(l, 'bonk', 'sfx-impact/audio/impactsoft_medium_001');
    loadSfx(l, 'over', 'sfx-interface/audio/error_004');
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
