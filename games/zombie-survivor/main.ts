import { launch, kenney, loadSfx, type GameMeta } from '@core';
import meta from './game.json';
import { PlayScene } from './PlayScene';

const P = 'topdown-shooter/png/';

launch({
  meta: meta as GameMeta,
  background: '#1b2a1a',
  preload(scene) {
    const l = scene.load;
    for (const w of ['gun', 'machine', 'silencer']) l.image(`hero-${w}`, kenney(`${P}survivor_1/survivor1_${w}.png`));
    l.image('zombie', kenney(P + 'zombie_1/zoimbie1_hold.png'));
    l.image('grass', kenney(P + 'tiles/tile_01.png'));
    l.image('dirt', kenney(P + 'tiles/tile_05.png'));
    l.image('crate', kenney(P + 'tiles/tile_129.png'));
    l.image('bush', kenney(P + 'tiles/tile_183.png'));
    l.image('bush2', kenney(P + 'tiles/tile_186.png'));
    l.image('rock', kenney(P + 'tiles/tile_237.png'));
    loadSfx(l, 'shoot', 'sfx-digital/audio/laser6');
    loadSfx(l, 'hit', 'sfx-impact/audio/impactsoft_heavy_001');
    loadSfx(l, 'die', 'sfx-impact/audio/impactpunch_heavy_002');
    loadSfx(l, 'hurt', 'sfx-digital/audio/phaserdown3');
    loadSfx(l, 'upgrade', 'sfx-digital/audio/powerup5');
    loadSfx(l, 'pickup', 'sfx-digital/audio/powerup2');
    loadSfx(l, 'wave', 'sfx-digital/audio/threetone1');
    loadSfx(l, 'toggle', 'sfx-interface/audio/switch_002');
  },
  menuDecor(scene) {
    const { width, height } = scene.scale;
    scene.add.tileSprite(0, 0, width, height, 'grass').setOrigin(0).setAlpha(0.3);
    scene.add.image(width * 0.12, height * 0.5, 'hero-machine').setScale(3);
    for (const [x, y, r] of [[0.84, 0.38, 3.3], [0.9, 0.58, 3.0], [0.78, 0.62, 2.9]]) scene.add.image(width * x, height * y, 'zombie').setScale(2.6).setRotation(r);
  },
  scenes: [PlayScene],
  strings: {
    tr: {
      autoAim: 'OTO-NİŞAN', chooseUp: 'BİR GÜÇLENDİRME SEÇ', upRate: 'ATIŞ HIZI', upDmg: 'HASAR', upMulti: 'ÇOKLU ATIŞ', upPierce: 'DELİCİ MERMİ',
      upSpeed: 'KOŞU HIZI', upHeal: 'MAKS CAN +1', boss: 'DEV ZOMBİ!', waveClear: 'DALGA TAMAM', heal: 'CAN +1', on: 'AÇIK', off: 'KAPALI',
    },
    en: {
      autoAim: 'AUTO-AIM', chooseUp: 'CHOOSE AN UPGRADE', upRate: 'FIRE RATE', upDmg: 'DAMAGE', upMulti: 'MULTI-SHOT', upPierce: 'PIERCING',
      upSpeed: 'RUN SPEED', upHeal: 'MAX HP +1', boss: 'GIANT ZOMBIE!', waveClear: 'WAVE CLEAR', heal: 'HP +1', on: 'ON', off: 'OFF',
    },
  },
});
