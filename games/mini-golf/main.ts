import { launch, kenney, loadSfx, type GameMeta } from '@core';
import Phaser from 'phaser';
import meta from './game.json';
import { PlayScene } from './PlayScene';

launch({
  meta: meta as GameMeta,
  background: '#14261a',
  physics: 'none',
  preload(scene) {
    const l = scene.load;
    l.image('ball', kenney('sports/png/equipment/ball_golf.png'));
    l.image('flag', kenney('sports/png/equipment/flag_checkered.png'));
    loadSfx(l, 'putt', 'sfx-impact/audio/impactgeneric_light_002');
    loadSfx(l, 'wall', 'sfx-impact/audio/impactwood_light_001');
    loadSfx(l, 'bumper', 'sfx-digital/audio/pepsound2');
    loadSfx(l, 'cup', 'sfx-casino/audio/chiplay2');
    loadSfx(l, 'splash', 'sfx-impact/audio/impactsoft_medium_001');
    loadSfx(l, 'sand', 'sfx-impact/audio/footstep_snow_001');
    loadSfx(l, 'great', 'sfx-digital/audio/powerup2');
    loadSfx(l, 'next', 'sfx-interface/audio/maximize_003');
    loadSfx(l, 'bad', 'sfx-interface/audio/error_004');
  },
  menuDecor(scene) {
    const { width, height } = scene.scale;
    scene.textures.get('ball').setFilter(Phaser.Textures.FilterMode.NEAREST);
    scene.textures.get('flag').setFilter(Phaser.Textures.FilterMode.NEAREST);
    const g = scene.add.graphics();
    g.fillStyle(0x4caf50).fillRoundedRect(width / 2 - 260, height * 0.79, 520, 190, 30);
    g.fillStyle(0x111111).fillCircle(width / 2 + 150, height * 0.86, 18);
    scene.add.image(width / 2 + 150, height * 0.86, 'flag').setOrigin(0.12, 0.92).setScale(4);
    const b = scene.add.image(width / 2 - 180, height * 0.86, 'ball').setScale(4);
    scene.tweens.add({ targets: b, x: width / 2 + 140, duration: 1600, repeat: -1, ease: 'Cubic.easeOut', hold: 500 });
  },
  scenes: [PlayScene],
  strings: {
    tr: {
      hole: 'DELİK', par: 'PAR', strokes: 'VURUŞ', ace: 'TEK VURUŞ!', albatross: 'ALBATROS!', eagle: 'KARTAL!', birdie: 'BİRDİ!',
      parName: 'PAR', bogey: 'BOGİ', dbogey: 'ÇİFT BOGİ', over: 'SONRAKİ DELİĞE', water: 'SUYA DÜŞTÜ! +1', finish: 'PARKUR TAMAM!', total: 'TOPLAM {n} VURUŞ',
    },
    en: {
      hole: 'HOLE', par: 'PAR', strokes: 'STROKES', ace: 'HOLE IN ONE!', albatross: 'ALBATROSS!', eagle: 'EAGLE!', birdie: 'BIRDIE!',
      parName: 'PAR', bogey: 'BOGEY', dbogey: 'DOUBLE BOGEY', over: 'NEXT HOLE', water: 'IN THE WATER! +1', finish: 'COURSE CLEAR!', total: 'TOTAL {n} STROKES',
    },
  },
});
