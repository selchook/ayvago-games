import { launch, kenney, loadSfx, type GameMeta } from '@core';
import meta from './game.json';
import { PlayScene } from './PlayScene';
import { warmText } from './fasttext';

const P2 = 'puzzle2/png/';

launch({
  meta: meta as GameMeta,
  background: '#140f2a',
  physics: 'none',
  preload(scene) {
    const l = scene.load;
    l.image('ball', kenney(P2 + 'balls/blue/ballblue_09.png'));
    l.image('ball-gold', kenney(P2 + 'balls/yellow/ballyellow_09.png'));
    l.image('peg-gold', kenney(P2 + 'coins/coin_06.png'));
    l.image('spark', kenney(P2 + 'particles_yellow/particleyellow_3.png'));
    loadSfx(l, 'ping', 'sfx-interface/audio/pluck_001');
    loadSfx(l, 'drop', 'sfx-interface/audio/drop_002');
    loadSfx(l, 'land', 'sfx-casino/audio/chiplay1');
    loadSfx(l, 'big', 'sfx-casino/audio/chipsstack3');
    loadSfx(l, 'gold', 'sfx-digital/audio/pepsound3');
    loadSfx(l, 'mult', 'sfx-digital/audio/powerup4');
    loadSfx(l, 'bump', 'sfx-digital/audio/zap1');
    loadSfx(l, 'extra', 'sfx-digital/audio/powerup9');
    loadSfx(l, 'clear', 'sfx-digital/audio/threetone1');
    loadSfx(l, 'fail', 'sfx-digital/audio/phaserdown2');
    loadSfx(l, 'zero', 'sfx-interface/audio/error_004');
  },
  menuDecor(scene) {
    warmText(scene, [[20, true], [22, true], [26, true], [28, true], [40, true], [22, false], [26, false]]);
    const { width, height } = scene.scale;
    const g = scene.add.graphics();
    for (let r = 0; r < 4; r++) for (let c = 0; c < 7 - (r % 2); c++) {
      g.fillStyle(0xffffff, 0.5).fillCircle(width / 2 - 210 + (r % 2) * 35 + c * 70, height * 0.79 + r * 50, 7);
    }
    const b = scene.add.image(width / 2, height * 0.74, 'ball').setDisplaySize(34, 34);
    scene.tweens.add({ targets: b, y: height * 0.95, x: width / 2 + 60, duration: 1500, repeat: -1, ease: 'Bounce.easeOut' });
    scene.add.image(width * 0.15, height * 0.09, 'peg-gold').setDisplaySize(60, 60);
    scene.add.image(width * 0.85, height * 0.09, 'ball-gold').setDisplaySize(60, 60);
  },
  scenes: [PlayScene],
  strings: {
    tr: {
      round: 'TUR', target: 'HEDEF', balls: 'TOP', roundClear: 'TUR TAMAM!', roundFail: 'HEDEF KAÇTI!', lifeLost: '-1 CAN',
      allGold: 'TÜM ALTINLAR! +{n}', extraBall: '+1 TOP', hint: 'Sürükle ve bırak · Oklar ve BOŞLUK', bonus: 'BONUS +{n}', x2: 'x2', x3: 'x3',
    },
    en: {
      round: 'ROUND', target: 'TARGET', balls: 'BALLS', roundClear: 'ROUND CLEAR!', roundFail: 'TARGET MISSED!', lifeLost: '-1 LIFE',
      allGold: 'ALL GOLD! +{n}', extraBall: '+1 BALL', hint: 'Drag and release · Arrows and SPACE', bonus: 'BONUS +{n}', x2: 'x2', x3: 'x3',
    },
  },
});
