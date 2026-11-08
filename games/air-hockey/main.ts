import { launch, loadAudio, loadSfx, type GameMeta } from '@core';
import Phaser from 'phaser';
import meta from './game.json';
import { PlayScene } from './PlayScene';
import { makeHockeyTextures, GOLD, RED, BLUE } from './table';
import { warmText } from './fasttext';

/** Menu decor: a puck glides back and forth between two mallets on a strip of glossy table. */
function menuRink(scene: Phaser.Scene): void {
  makeHockeyTextures(scene);
  const { width, height } = scene.scale;
  const y = height - 152, x0 = 150, x1 = width - 150;
  const g = scene.add.graphics();
  g.fillStyle(0x13205a, 0.55).fillRoundedRect(96, y - 46, width - 192, 92, 46);
  g.lineStyle(4, 0x8b5cff, 0.8).strokeRoundedRect(96, y - 46, width - 192, 92, 46);
  g.lineStyle(3, 0xff4fa3, 0.55).lineBetween(width / 2, y - 44, width / 2, y + 44).strokeCircle(width / 2, y, 26);
  g.fillStyle(0xffffff, 0.06).fillRoundedRect(110, y - 40, width - 220, 26, 13);
  const left = scene.add.image(x0, y, 'ah-mallet-red').setScale(0.66);
  const right = scene.add.image(x1, y, 'ah-mallet-blue').setScale(0.66);
  const trail = scene.add.particles(0, 0, 'ah-dot', {
    speed: 0, lifespan: 320, scale: { start: 1.1, end: 0 }, alpha: { start: 0.5, end: 0 }, frequency: 16,
    tint: GOLD, blendMode: Phaser.BlendModes.ADD,
  });
  const puck = scene.add.image(x0 + 52, y, 'ah-puck').setScale(0.66);
  trail.startFollow(puck);
  const reach = 52;
  let toRight = true;
  const stroke = () => {
    const from = toRight ? left : right, to = toRight ? right : left;
    const col = toRight ? RED : BLUE;
    // the striking mallet jabs, then the puck glides over with the air table's slow fade-out
    scene.tweens.add({ targets: from, x: from.x + (toRight ? 18 : -18), scale: 0.76, duration: 90, yoyo: true, ease: 'Quad.easeOut' });
    const burst = scene.add.particles(puck.x, puck.y, 'ah-dot', {
      speed: { min: 60, max: 220 }, lifespan: 360, scale: { start: 0.6, end: 0 }, tint: [col, 0xffffff],
      blendMode: Phaser.BlendModes.ADD, emitting: false,
    });
    burst.explode(10);
    scene.time.delayedCall(500, () => burst.destroy());
    const targetY = y + Phaser.Math.Between(-14, 14);
    scene.tweens.add({ targets: to, y: targetY, duration: 600, ease: 'Sine.easeInOut' });
    scene.tweens.add({
      targets: puck, x: to.x + (toRight ? -reach : reach), y: targetY, duration: 820, ease: 'Quad.easeOut',
      onComplete: () => { toRight = !toRight; stroke(); },
    });
  };
  scene.time.delayedCall(300, stroke);
}

launch({
  meta: meta as GameMeta,
  background: '#070b1e',
  physics: 'none',
  preload(scene) {
    const l = scene.load;
    loadSfx(l, 'hit', 'sfx-impact/audio/impactplate_light_001');
    loadSfx(l, 'hit2', 'sfx-impact/audio/impactplate_medium_002');
    loadSfx(l, 'wall', 'sfx-impact/audio/impactgeneric_light_001');
    const J = 'oga/junkala-sfx/general-sounds/';
    loadAudio(l, 'goal', J + 'positive-sounds/sfx-sounds-powerup8');
    loadAudio(l, 'concede', J + 'negative-sounds/sfx-sounds-negative2');
    loadAudio(l, 'serve', J + 'menu-sounds/sfx-menu-select4');
    loadAudio(l, 'matchPoint', J + 'high-pitched-sounds/sfx-sounds-high5');
    loadAudio(l, 'horn', J + 'alarms/alarms/sfx-alarm-loop3');
    loadAudio(l, 'tick', J + 'simple-bleeps/sfx-sounds-blip2');
    loadAudio(l, 'smash', J + 'impacts/sfx-sounds-impact3');
    loadAudio(l, 'pwSpawn', J + 'interactions/sfx-sounds-interaction5');
    loadAudio(l, 'pwGet', J + 'positive-sounds/sfx-sounds-powerup3');
    loadAudio(l, 'win', J + 'fanfares/sfx-sounds-fanfare1');
    loadAudio(l, 'boom', 'oga/junkala-sfx/explosions/short/sfx-exp-short-hard2');
  },
  menuDecor(scene) {
    warmText(scene, [[14, true], [15, true], [20, true], [22, true], [24, true], [26, true], [30, true], [64, true], [96, true]]);
    menuRink(scene);
  },
  scenes: [PlayScene],
  strings: {
    tr: {
      goal: 'GOL!', concede: 'GOL YEDİN!', firstTo: 'İLK 7', firstToWin: '7 GOLÜ ATAN KAZANIR', you: 'SEN', cpu: 'RAKİP',
      power: 'SERT ŞUT +{n}', bank: 'BANTTAN GOL! +60', matchPoint: 'MAÇ SAYISI', save: 'KURTARIŞ! +15',
      lvl: 'SEVİYE {n}', aiUp: 'RAKİP GÜÇLENDİ: SEVİYE {n}', replay: 'TEKRAR',
      pwBig: 'DEV RAKET!', pwFast: 'HIZLI PAK!', pwMulti: 'ÇİFT PAK!',
    },
    en: {
      goal: 'GOAL!', concede: 'CONCEDED!', firstTo: 'FIRST TO 7', firstToWin: 'FIRST TO 7 WINS', you: 'YOU', cpu: 'CPU',
      power: 'POWER SHOT +{n}', bank: 'BANK SHOT! +60', matchPoint: 'MATCH POINT', save: 'SAVE! +15',
      lvl: 'LEVEL {n}', aiUp: 'CPU LEVEL UP: {n}', replay: 'REPLAY',
      pwBig: 'BIG MALLET!', pwFast: 'FAST PUCK!', pwMulti: 'MULTI-PUCK!',
    },
  },
});
