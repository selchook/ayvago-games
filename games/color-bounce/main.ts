import Phaser from 'phaser';
import { launch, loadAudio, loadSfx, type GameMeta } from '@core';
import meta from './game.json';
import { PlayScene } from './PlayScene';
import { PALETTE, makeSymbols } from './symbols';

const J = 'oga/junkala-sfx/';

launch({
  meta: meta as GameMeta,
  background: '#1a1230',
  physics: 'none',
  preload(scene) {
    const l = scene.load;
    loadAudio(l, 'jump1', J + 'movement/jumping-and-landing/sfx-movement-jump3');
    loadAudio(l, 'jump2', J + 'movement/jumping-and-landing/sfx-movement-jump8');
    loadAudio(l, 'bounce', J + 'general-sounds/simple-bleeps/sfx-sounds-blip4');
    loadAudio(l, 'switch', J + 'general-sounds/menu-sounds/sfx-menu-move3');
    loadAudio(l, 'newcol', J + 'general-sounds/positive-sounds/sfx-sounds-powerup10');
    loadAudio(l, 'milestone', J + 'general-sounds/fanfares/sfx-sounds-fanfare1');
    loadAudio(l, 'wrong', J + 'general-sounds/negative-sounds/sfx-sounds-damage2');
    loadSfx(l, 'shatter', 'sfx-impact/audio/impactglass_heavy_001');
  },
  menuDecor(scene) {
    makeSymbols(scene);
    const { width, height } = scene.scale;
    // a little tower of bars with a bouncing ball
    const bars = [[width / 2 - 120, height * 0.92, 0], [width / 2 + 110, height * 0.85, 1], [width / 2 - 60, height * 0.78, 2]] as const;
    for (const [x, y, c] of bars) {
      scene.add.rectangle(x, y, 170, 26, PALETTE[c]).setStrokeStyle(3, 0x000000, 0.6);
      scene.add.image(x, y, `sym-${c}`).setScale(0.34);
    }
    const ball = scene.add.container(bars[0][0], bars[0][1] - 40);
    const g = scene.add.graphics();
    ball.add([g, scene.add.image(0, 0, 'sym-0').setScale(0.36)]);
    let step = 0;
    const paint = (c: number) => {
      g.clear().fillStyle(PALETTE[c], 1).fillCircle(0, 0, 20).lineStyle(4, 0xffffff, 1).strokeCircle(0, 0, 20);
      (ball.list[1] as Phaser.GameObjects.Image).setTexture(`sym-${c}`);
    };
    paint(0);
    const hop = () => {
      const from = bars[step % 3], to = bars[(step + 1) % 3];
      step++;
      scene.tweens.addCounter({
        from: 0, to: 1, duration: 650,
        onUpdate: (tw) => {
          const u = tw.getValue() ?? 0;
          ball.x = from[0] + (to[0] - from[0]) * u;
          ball.y = from[1] - 34 + (to[1] - from[1]) * u - 90 * Math.sin(Math.PI * u);
          if (u > 0.5) paint(to[2]);
        },
        onComplete: hop,
      });
    };
    hop();
  },
  scenes: [PlayScene],
  strings: {
    tr: {
      hint: 'Topun rengini değiştirmek için sol / sağ yarıya dokun. Aynı renk ve şekle düş!',
      wrong: 'YANLIŞ RENK!', newColour: 'YENİ RENK!', height: 'KAT', metres: 'METRE',
    },
    en: {
      hint: 'Tap the left / right half to change the ball colour. Land on the matching colour and symbol!',
      wrong: 'WRONG COLOUR!', newColour: 'NEW COLOUR!', height: 'FLOOR', metres: 'METRES',
    },
  },
});
