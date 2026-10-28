import { launch, kenney, loadSfx, type GameMeta } from '@core';
import meta from './game.json';
import { PlayScene } from './PlayScene';

const SG = 'shooting-gallery/png/';

launch({
  meta: meta as GameMeta,
  background: '#3a2416',
  physics: 'none',
  preload(scene) {
    const l = scene.load;
    for (const f of ['bg_wood', 'bg_blue', 'curtain', 'curtain_straight', 'curtain_top', 'grass1', 'grass2', 'water1', 'water2', 'tree_oak', 'tree_pine', 'cloud1', 'cloud2']) {
      l.image(f, kenney(SG + 'stall/' + f + '.png'));
    }
    for (const f of ['duck_brown', 'duck_white', 'duck_yellow', 'duck_target_brown', 'duck_target_white', 'duck_target_yellow', 'duck_back',
      'target_red1', 'target_red2', 'target_red3', 'target_colored', 'target_back', 'stick_wood', 'stick_metal', 'shot_brown_small', 'shot_grey_large', 'rifle']) {
      l.image(f, kenney(SG + 'objects/' + f + '.png'));
    }
    for (const f of ['crosshair_red_large', 'icon_bullet_gold_long', 'icon_bullet_empty_long']) l.image(f, kenney(SG + 'hud/' + f + '.png'));
    loadSfx(l, 'shot', 'sfx-impact/audio/impactpunch_heavy_001');
    loadSfx(l, 'ding', 'sfx-impact/audio/impactbell_heavy_001');
    loadSfx(l, 'quack', 'sfx-impact/audio/impactplate_light_002');
    loadSfx(l, 'miss', 'sfx-impact/audio/impactwood_light_001');
    loadSfx(l, 'dry', 'sfx-interface/audio/error_002');
    loadSfx(l, 'shell', 'sfx-ui/audio/switch3');
    loadSfx(l, 'reloaded', 'sfx-interface/audio/drop_002');
    loadSfx(l, 'bonus', 'sfx-digital/audio/powerup2');
    loadSfx(l, 'tick', 'sfx-interface/audio/tick_002');
    loadSfx(l, 'round', 'jingles/audio/8-bit_jingles/jingles_nes07');
    loadSfx(l, 'go', 'sfx-digital/audio/threetone2');
  },
  menuDecor(scene) {
    const { width, height } = scene.scale;
    scene.add.tileSprite(0, 0, width, height, 'bg_wood').setOrigin(0).setAlpha(0.35);
    scene.add.image(110, height * 0.6, 'duck_yellow').setScale(1.2);
    scene.add.image(width - 110, height * 0.6, 'target_colored').setScale(0.9);
    scene.add.image(width - 110, height * 0.2, 'duck_target_white').setScale(0.9).setFlipX(true);
    scene.add.image(110, height * 0.2, 'target_red2').setScale(0.8);
    scene.add.tileSprite(0, 0, width, 70, 'curtain_straight').setOrigin(0);
  },
  scenes: [PlayScene],
  strings: {
    tr: { round: 'TUR', roundN: 'TUR {n}', goal: 'Hedef: {n} puan', reload: 'DOLDUR', empty: 'BOŞ!', timeUp: 'SÜRE BİTTİ', roundClear: 'TUR TAMAM!', accuracy: 'İsabet bonusu +{n}', time: 'SÜRE' },
    en: { round: 'ROUND', roundN: 'ROUND {n}', goal: 'Goal: {n} points', reload: 'RELOAD', empty: 'EMPTY!', timeUp: 'TIME UP', roundClear: 'ROUND CLEAR!', accuracy: 'Accuracy bonus +{n}', time: 'TIME' },
  },
});
