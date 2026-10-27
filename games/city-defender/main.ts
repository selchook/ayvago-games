import { launch, kenney, loadSfx, type GameMeta } from '@core';
import meta from './game.json';
import { PlayScene, makeTextures } from './PlayScene';

const SS = 'space-shooter/png/';

launch({
  meta: meta as GameMeta,
  background: '#0a0718',
  preload(scene) {
    const l = scene.load;
    l.image('crosshair', kenney('shooting-gallery/png/hud/crosshair_white_large.png'));
    l.image('marker', kenney(SS + 'lasers/laserblue10.png'));
    l.image('turret', kenney(SS + 'parts/turretbase_big.png'));
    l.image('gun', kenney(SS + 'parts/gun09.png'));
    l.image('star', kenney(SS + 'effects/star1.png'));
    l.image('warhead', kenney(SS + 'lasers/laserred08.png'));
    loadSfx(l, 'launch', 'sfx-digital/audio/laser6');
    loadSfx(l, 'boom', 'sfx-digital/audio/lowdown');
    loadSfx(l, 'pop', 'sfx-digital/audio/spacetrash1');
    loadSfx(l, 'impact', 'sfx-impact/audio/impactmetal_heavy_002');
    loadSfx(l, 'empty', 'sfx-interface/audio/error_004');
    loadSfx(l, 'tally', 'sfx-interface/audio/select_001');
    loadSfx(l, 'wave', 'sfx-digital/audio/threetone1');
    loadSfx(l, 'bonus', 'sfx-digital/audio/powerup8');
    loadSfx(l, 'split', 'sfx-digital/audio/zap2');
  },
  menuDecor(scene) {
    makeTextures(scene);
    const { width, height } = scene.scale;
    for (let i = 0; i < 60; i++) scene.add.image(Math.random() * width, Math.random() * height * 0.7, 'star').setScale(0.08 + Math.random() * 0.2).setAlpha(0.3 + Math.random() * 0.4);
    const g = scene.add.graphics();
    g.fillStyle(0x2b1d0e).fillRect(0, height * 0.9, width, height * 0.1);
    for (const x of [0.2, 0.35, 0.65, 0.8]) scene.add.image(width * x, height * 0.9, 'city').setOrigin(0.5, 1);
    g.lineStyle(4, 0xec3013, 0.9);
    for (const [x0, x1] of [[0.1, 0.35], [0.6, 0.2], [0.9, 0.7]]) g.lineBetween(width * x0, 0, width * x1, height * 0.12);
    for (const x of [0.35, 0.2, 0.7]) scene.add.circle(width * x, height * 0.12, 26, 0xffd23f, 0.85);
  },
  scenes: [PlayScene],
  strings: {
    tr: { cities: 'ŞEHİR', ammo: 'MERMİ', bonusCity: 'BONUS ŞEHİR!', out: 'BİTTİ', low: 'AZ', fallen: 'ŞEHİRLER DÜŞTÜ' },
    en: { cities: 'CITIES', ammo: 'AMMO', bonusCity: 'BONUS CITY!', out: 'OUT', low: 'LOW', fallen: 'CITIES FALLEN' },
  },
});
