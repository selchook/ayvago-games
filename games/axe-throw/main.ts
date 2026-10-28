import { launch, kenney, loadSfx, type GameMeta } from '@core';
import meta from './game.json';
import { PlayScene, makeTextures } from './PlayScene';

launch({
  meta: meta as GameMeta,
  background: '#15201a',
  physics: 'none',
  preload(scene) {
    const l = scene.load;
    for (const n of [1, 2, 3]) l.image('debris' + n, kenney(`physics/png/debris/debriswood_${n}.png`));
    for (const k of ['target_colored', 'target_red1', 'target_red2', 'target_red3']) l.image(k, kenney(`shooting-gallery/png/objects/${k}.png`));
    l.image('pine', kenney('shooting-gallery/png/stall/tree_pine.png'));
    l.image('oak', kenney('shooting-gallery/png/stall/tree_oak.png'));
    loadSfx(l, 'throw', 'sfx-digital/audio/phasejump1');
    for (const n of [0, 1, 2]) loadSfx(l, 'thunk' + n, `sfx-impact/audio/impactwood_heavy_00${n}`);
    loadSfx(l, 'clang', 'sfx-impact/audio/impactmetal_heavy_000');
    loadSfx(l, 'plate', 'sfx-impact/audio/impactplate_heavy_001');
    loadSfx(l, 'apple', 'sfx-impact/audio/impactsoft_heavy_000');
    loadSfx(l, 'bonus', 'sfx-digital/audio/powerup5');
    loadSfx(l, 'shatter', 'sfx-impact/audio/impactplank_medium_002');
    loadSfx(l, 'stage', 'sfx-digital/audio/threetone1');
    loadSfx(l, 'boss', 'jingles/audio/8-bit_jingles/jingles_nes10');
  },
  menuDecor(scene) {
    makeTextures(scene);
    const { width, height } = scene.scale;
    scene.add.image(width / 2, height / 2, 'forest');
    const log = scene.add.image(width / 2, height * 0.86, 'log').setScale(0.55);
    scene.tweens.add({ targets: log, angle: 360, duration: 4000, repeat: -1 });
    scene.add.image(width * 0.15, height * 0.1, 'axe').setAngle(-30).setScale(0.8);
    scene.add.image(width * 0.85, height * 0.1, 'axe').setAngle(30).setScale(0.8);
  },
  scenes: [PlayScene],
  strings: {
    tr: { stage: 'AŞAMA', stageN: 'AŞAMA {n}', boss: 'DEV HEDEF!', bossDown: 'DEV HEDEF YENİLDİ!', clear: 'TEMİZ!', apple: 'ELMA!' },
    en: { stage: 'STAGE', stageN: 'STAGE {n}', boss: 'BOSS TARGET!', bossDown: 'BOSS DEFEATED!', clear: 'CLEAR!', apple: 'APPLE!' },
  },
});
