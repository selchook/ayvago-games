import { launch, loadAudio, kenney, type GameMeta } from '@core';
import meta from './game.json';
import { PlayScene } from './PlayScene';

const J = 'oga/junkala-sfx/';

launch({
  meta: meta as GameMeta,
  background: '#070614',
  physics: 'none',
  preload(scene) {
    const l = scene.load;
    l.image('oh-ship', kenney('space-shooter/png/playership1_blue.png'));
    l.image('oh-meteor1', kenney('space-shooter/png/meteors/meteorbrown_big1.png'));
    l.image('oh-meteor2', kenney('space-shooter/png/meteors/meteorgrey_big3.png'));
    loadAudio(l, 'launch', J + 'weapons/lasers/sfx-wpn-laser4');
    loadAudio(l, 'catch', J + 'general-sounds/positive-sounds/sfx-sounds-powerup2');
    loadAudio(l, 'star', J + 'general-sounds/coins/sfx-coin-double4');
    loadAudio(l, 'level', J + 'general-sounds/fanfares/sfx-sounds-fanfare3');
    loadAudio(l, 'alarm', J + 'general-sounds/alarms/low-health-alarms/sfx-lowhealth-alarmloop5');
    loadAudio(l, 'warn', J + 'general-sounds/simple-bleeps/sfx-sounds-blip9');
    loadAudio(l, 'boom', J + 'explosions/short/sfx-exp-short-hard4');
    loadAudio(l, 'lost', J + 'movement/falling-sounds/sfx-sounds-falling3');
  },
  menuDecor(scene) {
    const { width, height } = scene.scale;
    const cx = width / 2, cy = height * 0.84;
    const g = scene.add.graphics();
    g.fillStyle(0x3b6fe0, 0.2).fillCircle(cx, cy, 56).fillStyle(0x3b6fe0, 1).fillCircle(cx, cy, 42);
    g.fillStyle(0x000000, 0.2).fillCircle(cx + 12, cy + 12, 34).fillStyle(0x3b6fe0, 1).fillCircle(cx - 5, cy - 5, 31);
    for (let i = 0; i < 36; i++) {
      const a = (i / 36) * Math.PI * 2;
      g.fillStyle(0xffffff, 0.45).fillCircle(cx + Math.cos(a) * 92, cy + Math.sin(a) * 92, 2.5);
    }
    const p2 = scene.add.circle(cx + 230, cy + 30, 26, 0xffd83a).setAlpha(0.9);
    const p3 = scene.add.circle(cx - 220, cy + 70, 20, 0xe8433a).setAlpha(0.9);
    scene.tweens.add({ targets: [p2, p3], scale: 1.08, duration: 900, yoyo: true, repeat: -1 });
    const ship = scene.add.image(cx, cy - 92, 'oh-ship').setScale(0.4);
    scene.tweens.addCounter({
      from: 0, to: Math.PI * 2, duration: 2600, repeat: -1,
      onUpdate: (tw) => {
        const a = (tw.getValue() ?? 0) - Math.PI / 2;
        ship.setPosition(cx + Math.cos(a) * 92, cy + Math.sin(a) * 92);
        ship.rotation = a + Math.PI;
      },
    });
  },
  scenes: [PlayScene],
  strings: {
    tr: {
      hint: 'Fırlamak için dokun ya da Boşluk tuşuna bas', planets: 'GEZEGEN', perfect: 'KUSURSUZ!', skip: 'ÇİFT ATLAYIŞ!',
      lost: 'UZAYDA KAYBOLDUN!', crashed: 'ÇARPTIN!', burned: 'YÖRÜNGE ÇÖKTÜ!', comet: 'KUYRUKLU YILDIZ!',
    },
    en: {
      hint: 'Tap or press Space to launch', planets: 'PLANETS', perfect: 'PERFECT!', skip: 'DOUBLE HOP!',
      lost: 'LOST IN SPACE!', crashed: 'CRASHED!', burned: 'ORBIT COLLAPSED!', comet: 'COMET HIT!',
    },
  },
});
