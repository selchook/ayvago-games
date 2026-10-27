import { launch, kenney, loadSfx, type GameMeta } from '@core';
import meta from './game.json';
import { PlayScene } from './PlayScene';

const TP = 'tappy-plane/png/';

launch({
  meta: meta as GameMeta,
  background: '#1d3b4f',
  physics: 'none',
  preload(scene) {
    const l = scene.load;
    l.image('bg', kenney(TP + 'background.png'));
    for (const g of ['grass', 'dirt', 'snow', 'ice', 'rock']) l.image('ground-' + g, kenney(`${TP}ground${g}.png`));
    for (const r of ['rock', 'rockgrass', 'rocksnow', 'rockice']) {
      l.image(r, kenney(`${TP}${r}.png`));
      l.image(r + 'down', kenney(`${TP}${r}down.png`));
    }
    for (const n of [1, 2, 3]) l.image('plane' + n, kenney(`${TP}planes/planered${n}.png`));
    l.image('menu-plane-y', kenney(TP + 'planes/planeyellow1.png'));
    l.image('menu-plane-b', kenney(TP + 'planes/planeblue1.png'));
    l.image('puff-l', kenney(TP + 'pufflarge.png'));
    l.image('puff-s', kenney(TP + 'puffsmall.png'));
    l.image('star', kenney(TP + 'stargold.png'));
    l.image('tap', kenney(TP + 'ui/tap.png'));
    for (const m of ['bronze', 'silver', 'gold']) l.image('medal-' + m, kenney(`${TP}ui/medal${m}.png`));
    loadSfx(l, 'flap', 'sfx-digital/audio/phasejump1');
    loadSfx(l, 'pass', 'sfx-interface/audio/pluck_001');
    loadSfx(l, 'star', 'sfx-digital/audio/powerup2');
    loadSfx(l, 'crash', 'sfx-impact/audio/impactmetal_heavy_001');
    loadSfx(l, 'fall', 'sfx-digital/audio/phaserdown3');
    loadSfx(l, 'medal', 'jingles/audio/8-bit_jingles/jingles_nes04');
    loadSfx(l, 'biome', 'sfx-digital/audio/threetone1');
  },
  menuDecor(scene) {
    const { width, height } = scene.scale;
    const bg = scene.add.tileSprite(0, 0, width, height, 'bg').setOrigin(0).setAlpha(0.35);
    bg.tileScaleX = bg.tileScaleY = height / 480;
    scene.add.image(width * 0.15, height, 'rockgrass').setOrigin(0.5, 1).setScale(1.3, 1.6).setAlpha(0.8);
    scene.add.image(width * 0.85, 0, 'rockgrassdown').setOrigin(0.5, 0).setScale(1.3, 1.4).setAlpha(0.8);
    const p = scene.add.image(width / 2, height * 0.85, 'plane1').setScale(1.6);
    scene.tweens.add({ targets: p, y: p.y - 30, angle: -8, duration: 900, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    scene.add.image(width * 0.22, height * 0.12, 'menu-plane-y').setScale(0.9).setAngle(-10);
    scene.add.image(width * 0.75, height * 0.32, 'menu-plane-b').setScale(0.8).setAngle(8).setFlipX(true);
  },
  scenes: [PlayScene],
  strings: {
    tr: { getReady: 'HAZIR OL', tapFly: 'Uçmak için dokun', bronze: 'BRONZ MADALYA!', silver: 'GÜMÜŞ MADALYA!', gold: 'ALTIN MADALYA!', gaps: 'GEÇİT', crashed: 'ÇAKILDIN!' },
    en: { getReady: 'GET READY', tapFly: 'Tap to fly', bronze: 'BRONZE MEDAL!', silver: 'SILVER MEDAL!', gold: 'GOLD MEDAL!', gaps: 'GAPS', crashed: 'CRASHED!' },
  },
});
