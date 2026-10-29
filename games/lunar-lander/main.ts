import { launch, kenney, loadAudio, loadSfx, type GameMeta } from '@core';
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
    const J = 'oga/junkala-sfx/';
    loadAudio(l, 'thrust', J + 'movement/vehicles/sfx-vehicle-plainloop');
    loadAudio(l, 'boom', J + 'explosions/medium-length/sfx-exp-medium3');
    loadSfx(l, 'crash', 'sfx-impact/audio/impactmetal_heavy_003');
    loadAudio(l, 'land', J + 'general-sounds/positive-sounds/sfx-sounds-powerup13');
    loadAudio(l, 'perfect', J + 'general-sounds/fanfares/sfx-sounds-fanfare1');
    loadAudio(l, 'refuel', J + 'general-sounds/coins/sfx-coin-cluster3');
    loadAudio(l, 'warn', J + 'general-sounds/alarms/low-health-alarms/sfx-lowhealth-alarmloop6');
    loadAudio(l, 'empty', J + 'weapons/out-of-ammo/sfx-wpn-noammo3');
    loadAudio(l, 'touch', J + 'movement/jumping-and-landing/sfx-movement-jump17-landing');
    loadAudio(l, 'ready', J + 'movement/portals-and-transitions/sfx-movement-portal5');
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
