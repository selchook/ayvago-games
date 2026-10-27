import { launch, kenney, loadSfx, type GameMeta } from '@core';
import meta from './game.json';
import { PlayScene, makeLanderTexture } from './PlayScene';

const SS = 'space-shooter/png/';

launch({
  meta: meta as GameMeta,
  background: '#05050c',
  preload(scene) {
    const l = scene.load;
    l.image('flame', kenney(SS + 'effects/fire13.png'));
    l.image('star', kenney(SS + 'effects/star1.png'));
    l.image('planet', kenney(SS + 'meteors/meteorgrey_big4.png'));
    loadSfx(l, 'thrust', 'sfx-digital/audio/lowrandom');
    loadSfx(l, 'boom', 'sfx-digital/audio/lowdown');
    loadSfx(l, 'crash', 'sfx-impact/audio/impactmetal_heavy_003');
    loadSfx(l, 'land', 'sfx-digital/audio/threetone2');
    loadSfx(l, 'perfect', 'sfx-digital/audio/powerup8');
    loadSfx(l, 'warn', 'sfx-interface/audio/error_006');
    loadSfx(l, 'touch', 'sfx-impact/audio/footstep_concrete_000');
    loadSfx(l, 'ready', 'sfx-digital/audio/phaserup3');
  },
  menuDecor(scene) {
    makeLanderTexture(scene);
    const { width, height } = scene.scale;
    for (let i = 0; i < 70; i++) scene.add.image(Math.random() * width, Math.random() * height, 'star').setScale(0.06 + Math.random() * 0.2).setAlpha(0.3 + Math.random() * 0.4);
    scene.add.image(width * 0.82, height * 0.1, 'planet').setScale(1.3).setTint(0x8fb4ff);
    const g = scene.add.graphics();
    g.fillStyle(0x3a3a46).beginPath().moveTo(0, height);
    const pts = [0.86, 0.83, 0.88, 0.88, 0.84, 0.87, 0.9, 0.85, 0.82];
    pts.forEach((p, i) => g.lineTo((width / (pts.length - 1)) * i, height * p));
    g.lineTo(width, height).closePath().fillPath();
    const lander = scene.add.image(width * 0.5, height * 0.79, 'lander').setScale(1.4);
    const fl = scene.add.image(width * 0.5, height * 0.79 + 36, 'flame').setOrigin(0.5, 0).setScale(1.8);
    scene.tweens.add({ targets: [lander, fl], y: '-=20', duration: 1400, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
  },
  scenes: [PlayScene],
  strings: {
    tr: {
      fuel: 'YAKIT', hspeed: 'YATAY', vspeed: 'DİKEY', landed: 'İNİŞ BAŞARILI!', perfect: 'MÜKEMMEL!', crashed: 'KAZA!',
      tooFast: 'ÇOK HIZLI', tilted: 'EĞİK', noPad: 'PİST DEĞİL', lowFuel: 'YAKIT AZ!', noFuel: 'YAKIT BİTTİ', wind: 'RÜZGAR', fuelBonus: 'YAKIT',
    },
    en: {
      fuel: 'FUEL', hspeed: 'H-SPEED', vspeed: 'V-SPEED', landed: 'TOUCHDOWN!', perfect: 'PERFECT!', crashed: 'CRASHED!',
      tooFast: 'TOO FAST', tilted: 'TILTED', noPad: 'NOT A PAD', lowFuel: 'LOW FUEL!', noFuel: 'OUT OF FUEL', wind: 'WIND', fuelBonus: 'FUEL',
    },
  },
});
