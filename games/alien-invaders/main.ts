import { launch, kenney, loadSfx, type GameMeta } from '@core';
import meta from './game.json';
import { PlayScene } from './PlayScene';

const SS = 'space-shooter/png/';

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
    loadSfx(l, 'shoot', 'sfx-digital/audio/laser4');
    loadSfx(l, 'kill', 'sfx-digital/audio/spacetrash3');
    loadSfx(l, 'bomb', 'sfx-digital/audio/laser9');
    loadSfx(l, 'hurt', 'sfx-digital/audio/phaserdown3');
    loadSfx(l, 'march', 'sfx-digital/audio/tone1');
    loadSfx(l, 'ufo', 'sfx-digital/audio/phaserup5');
    loadSfx(l, 'ufo-kill', 'sfx-digital/audio/threetone2');
    loadSfx(l, 'clink', 'sfx-digital/audio/zap1');
    loadSfx(l, 'level', 'sfx-digital/audio/powerup6');
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
