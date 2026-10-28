import { launch, loadSfx, type GameMeta } from '@core';
import meta from './game.json';
import { PlayScene, makeHockeyTextures } from './PlayScene';
import { warmText } from './fasttext';

launch({
  meta: meta as GameMeta,
  background: '#070b1e',
  physics: 'none',
  preload(scene) {
    const l = scene.load;
    loadSfx(l, 'hit', 'sfx-impact/audio/impactplate_light_001');
    loadSfx(l, 'hit2', 'sfx-impact/audio/impactplate_medium_002');
    loadSfx(l, 'wall', 'sfx-impact/audio/impactgeneric_light_001');
    loadSfx(l, 'goal', 'sfx-digital/audio/powerup2');
    loadSfx(l, 'concede', 'sfx-digital/audio/phaserdown3');
    loadSfx(l, 'serve', 'sfx-interface/audio/select_005');
    loadSfx(l, 'tick', 'sfx-interface/audio/tick_002');
  },
  menuDecor(scene) {
    warmText(scene, [[22, true], [26, true], [40, true], [60, true], [96, true], [24, false]]);
    makeHockeyTextures(scene);
    const { width, height } = scene.scale;
    const g = scene.add.graphics();
    g.lineStyle(6, 0x3ee6ff, 0.5).strokeRoundedRect(60, height * 0.74, width - 120, 260, 40);
    g.lineStyle(4, 0xff4fa3, 0.5).lineBetween(60, height * 0.74 + 130, width - 60, height * 0.74 + 130).strokeCircle(width / 2, height * 0.74 + 130, 50);
    scene.add.image(width * 0.3, height * 0.74 + 200, 'ah-mallet-red').setScale(0.9);
    scene.add.image(width * 0.7, height * 0.74 + 60, 'ah-mallet-blue').setScale(0.9);
    const p = scene.add.image(width * 0.35, height * 0.74 + 120, 'ah-puck');
    scene.tweens.add({ targets: p, x: width * 0.65, y: height * 0.74 + 150, duration: 900, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
  },
  scenes: [PlayScene],
  strings: {
    tr: { goal: 'GOL!', concede: 'GOL YEDİN!', firstTo: 'İLK 7', you: 'SEN', cpu: 'RAKİP', serve: 'HAZIR!', power: 'SERT ŞUT +{n}', matchPoint: 'MAÇ SAYISI!', save: 'KURTARIŞ!' },
    en: { goal: 'GOAL!', concede: 'CONCEDED!', firstTo: 'FIRST TO 7', you: 'YOU', cpu: 'CPU', serve: 'READY!', power: 'POWER SHOT +{n}', matchPoint: 'MATCH POINT!', save: 'SAVE!' },
  },
});
