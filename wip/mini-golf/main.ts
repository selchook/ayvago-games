import { launch, loadAudio, loadSfx, type GameMeta } from '@core';
import meta from './game.json';
import { PlayScene } from './PlayScene';
import { makeArt, paintBackdrop, paintMenuGreen } from './art';

launch({
  meta: meta as GameMeta,
  background: '#14261a',
  physics: 'none',
  preload(scene) {
    const l = scene.load;
    loadSfx(l, 'putt', 'sfx-impact/audio/impactgeneric_light_002');
    loadSfx(l, 'wall', 'sfx-impact/audio/impactwood_light_001');
    const J = 'oga/junkala-sfx/general-sounds/';
    loadAudio(l, 'bumper', J + 'simple-bleeps/sfx-sounds-blip9');
    loadSfx(l, 'cup', 'sfx-casino/audio/chiplay2');
    loadSfx(l, 'splash', 'sfx-impact/audio/impactsoft_medium_001');
    loadSfx(l, 'sand', 'sfx-impact/audio/footstep_snow_001');
    loadAudio(l, 'great', J + 'fanfares/sfx-sounds-fanfare1');
    loadAudio(l, 'par', J + 'coins/sfx-coin-double2');
    loadAudio(l, 'next', J + 'pause-sounds/sfx-sounds-pause4-in');
    loadAudio(l, 'bad', J + 'negative-sounds/sfx-sounds-error11');
    loadAudio(l, 'turn', J + 'simple-bleeps/sfx-sounds-blip7');
  },
  menuDecor(scene) {
    const { width } = scene.scale;
    makeArt(scene);
    paintBackdrop(scene);
    paintMenuGreen(scene);
    scene.add.image(0, 0, 'mg-bg').setOrigin(0);
    // a little putting green above the title: the ball rolls into the cup again and again
    const gx = width / 2, gy = 150, cx = gx + 130, cy = gy - 4;
    scene.add.image(gx, gy, 'mg-menu-green');
    const shadow = scene.add.image(0, 0, 'mg-shadow').setDisplaySize(36, 18).setAlpha(0.8);
    const ball = scene.add.image(0, 0, 'mg-ball').setScale(0.5);
    const pole = scene.add.image(0, 2, 'mg-pole').setOrigin(0.5, 1).setScale(0.85);
    const pennant = scene.add.image(3, -78, 'mg-pennant').setOrigin(0, 0).setScale(0.85);
    scene.add.container(cx, cy, [pole, pennant]);
    scene.tweens.add({ targets: pennant, scaleX: 0.68, scaleY: 0.9, duration: 650, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    const follow = () => shadow.setPosition(ball.x + 3, ball.y + 7).setVisible(ball.alpha > 0.6);
    const roll = () => {
      ball.setPosition(gx - 220, gy + 8).setScale(0.5).setAlpha(1);
      scene.tweens.add({
        targets: ball, x: cx, y: cy, duration: 1700, ease: 'Cubic.easeOut', onUpdate: follow,
        onComplete: () => scene.tweens.add({
          targets: ball, scale: 0.2, alpha: 0, y: cy + 3, duration: 220, ease: 'Quad.easeIn', onUpdate: follow,
          onComplete: () => {
            const r = scene.add.image(cx, cy, 'mg-ring').setScale(0.25);
            scene.tweens.add({ targets: r, scale: 0.8, alpha: 0, duration: 450, onComplete: () => r.destroy() });
            scene.time.delayedCall(900, roll);
          },
        }),
      });
    };
    roll();
  },
  scenes: [PlayScene],
  strings: {
    tr: {
      hole: 'DELİK', par: 'PAR', strokes: 'VURUŞ', ace: 'TEK VURUŞ!', albatross: 'ALBATROS!', eagle: 'KARTAL!', birdie: 'BİRDİ!',
      parName: 'PAR', bogey: 'BOGİ', dbogey: 'ÇİFT BOGİ', over: 'SONRAKİ DELİĞE', water: 'SUYA DÜŞTÜ! +1', finish: 'PARKUR TAMAM!', total: 'TOPLAM {n} VURUŞ', maxed: 'VURUŞ HAKKI BİTTİ',
    },
    en: {
      hole: 'HOLE', par: 'PAR', strokes: 'STROKES', ace: 'HOLE IN ONE!', albatross: 'ALBATROSS!', eagle: 'EAGLE!', birdie: 'BIRDIE!',
      parName: 'PAR', bogey: 'BOGEY', dbogey: 'DOUBLE BOGEY', over: 'NEXT HOLE', water: 'IN THE WATER! +1', finish: 'COURSE CLEAR!', total: 'TOTAL {n} STROKES', maxed: 'OUT OF STROKES',
    },
  },
});
