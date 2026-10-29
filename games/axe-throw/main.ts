import { launch, loadAudio, loadSfx, kenney, type GameMeta } from '@core';
import meta from './game.json';
import { PlayScene, makeTextures } from './PlayScene';

const J = 'oga/junkala-sfx/';

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
    loadAudio(l, 'throw1', J + 'weapons/melee/sfx-wpn-sword1');
    loadAudio(l, 'throw2', J + 'weapons/melee/sfx-wpn-sword2');
    loadAudio(l, 'throw3', J + 'weapons/melee/sfx-wpn-sword3');
    loadSfx(l, 'thunk0', 'sfx-impact/audio/impactwood_heavy_000');
    loadSfx(l, 'thunk1', 'sfx-impact/audio/impactwood_heavy_001');
    loadSfx(l, 'thunk2', 'sfx-impact/audio/impactwood_heavy_002');
    loadSfx(l, 'clang', 'sfx-impact/audio/impactmetal_heavy_000');
    loadAudio(l, 'hurt', J + 'general-sounds/negative-sounds/sfx-sounds-damage1');
    loadAudio(l, 'low', J + 'general-sounds/alarms/low-health-alarms/sfx-lowhealth-alarmloop6');
    loadSfx(l, 'plate', 'sfx-impact/audio/impactplate_heavy_001');
    loadSfx(l, 'apple', 'sfx-impact/audio/impactsoft_heavy_000');
    loadAudio(l, 'bonus', J + 'general-sounds/coins/sfx-coin-double2');
    loadSfx(l, 'shatter', 'sfx-impact/audio/impactplank_medium_002');
    loadAudio(l, 'crunch', J + 'explosions/shortest/sfx-exp-shortest-soft4');
    loadAudio(l, 'clear', J + 'general-sounds/fanfares/sfx-sounds-fanfare3');
    loadAudio(l, 'stage', J + 'general-sounds/menu-sounds/sfx-menu-select2');
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
