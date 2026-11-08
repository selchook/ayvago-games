import Phaser from 'phaser';
import { launch, kenney, loadAudio, type GameMeta } from '@core';
import meta from './game.json';
import { PlayScene } from './PlayScene';
import { warmText } from './fasttext';
import { paintTextures, BALL_LOOK } from './textures';
import type { BallKind } from './sim';

/** Menu decor: a small peg field at the bottom with balls bouncing through it. */
function menuDecor(scene: Phaser.Scene): void {
  warmText(scene, [[18, true], [20, true], [22, true], [24, true], [26, true], [28, true], [34, true], [38, true], [46, true], [56, true], [24, false]]);
  paintTextures(scene);
  const { width, height } = scene.scale;
  scene.add.image(0, 0, 'pk-bg').setOrigin(0).setDisplaySize(width, height);
  const glow = scene.add.image(width / 2, height * 0.25, 'pk-glow').setDisplaySize(900, 900).setTint(0x8b5cff).setAlpha(0.25)
    .setBlendMode(Phaser.BlendModes.ADD);
  scene.tweens.add({ targets: glow, alpha: 0.12, duration: 2600, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });

  // corner balls bobbing
  const corner: Array<[number, number, BallKind, number]> = [[0.13, 0.085, 'gold', 64], [0.87, 0.085, 'normal', 56], [0.08, 0.2, 'split', 36], [0.92, 0.19, 'ghost', 40]];
  corner.forEach(([fx, fy, kind, s], i) => {
    const img = scene.add.image(width * fx, height * fy, `pk-ball-${kind}`).setDisplaySize(s, s);
    scene.tweens.add({ targets: img, y: img.y - 14, angle: i % 2 ? -20 : 20, duration: 1300 + i * 230, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
  });

  // mini board
  const top = height * 0.79, rows = 4, gap = 64;
  const pegs: Array<{ x: number; y: number; img: Phaser.GameObjects.Image; glow: Phaser.GameObjects.Image }> = [];
  for (let r = 0; r < rows; r++) {
    const odd = r % 2 === 1;
    for (let c = 0; c < (odd ? 10 : 11); c++) {
      const x = width / 2 - 320 + (odd ? gap / 2 : 0) + c * gap, y = top + r * 48;
      const glowImg = scene.add.image(x, y, 'pk-glow').setDisplaySize(48, 48).setAlpha(0).setTint(0x3ee6ff).setBlendMode(Phaser.BlendModes.ADD);
      pegs.push({ x, y, img: scene.add.image(x, y, 'pk-peg').setDisplaySize(26, 26), glow: glowImg });
    }
  }
  interface MB { x: number; y: number; vx: number; vy: number; img: Phaser.GameObjects.Image; trail: number[]; col: number }
  const balls: MB[] = [];
  const trail = scene.add.graphics().setBlendMode(Phaser.BlendModes.ADD);
  const kinds: BallKind[] = ['normal', 'normal', 'gold', 'split', 'normal', 'ghost', 'heavy'];
  let spawnT = 0, k = 0;
  const BR = 12, PR = 7;
  const step = (_t: number, delta: number) => {
    const dt = Math.min(delta, 50) / 1000;
    spawnT -= dt;
    if (spawnT <= 0 && balls.length < 7) {
      spawnT = 0.7;
      const kind = kinds[k++ % kinds.length];
      const img = scene.add.image(width / 2 + (Math.random() - 0.5) * 520, top - 34, `pk-ball-${kind}`).setDisplaySize(BR * 2.2, BR * 2.2).setAlpha(0);
      scene.tweens.add({ targets: img, alpha: 1, duration: 200 });
      balls.push({ x: img.x, y: img.y, vx: (Math.random() - 0.5) * 60, vy: 0, img, trail: [], col: BALL_LOOK[kind].trail });
    }
    trail.clear();
    for (let i = balls.length - 1; i >= 0; i--) {
      const b = balls[i];
      for (let s = 0; s < 3; s++) {
        const h = dt / 3;
        b.vy += 1500 * h;
        b.x += b.vx * h; b.y += b.vy * h;
        for (const p of pegs) {
          const dx = b.x - p.x, dy = b.y - p.y, d = Math.hypot(dx, dy);
          if (d > 0 && d < BR + PR) {
            const nx = dx / d, ny = dy / d;
            b.x = p.x + nx * (BR + PR); b.y = p.y + ny * (BR + PR);
            const vn = b.vx * nx + b.vy * ny;
            if (vn < 0) {
              b.vx -= 1.35 * vn * nx + (Math.random() - 0.5) * 20; b.vy -= 1.35 * vn * ny;
              p.glow.setAlpha(0.9);
              scene.tweens.add({ targets: p.glow, alpha: 0, duration: 380 });
            }
          }
        }
      }
      b.img.setPosition(b.x, b.y);
      b.img.rotation += b.vx * dt * 0.03;
      b.trail.push(b.x, b.y);
      if (b.trail.length > 16) b.trail.splice(0, 2);
      const n = b.trail.length / 2;
      for (let j = 0; j < n - 1; j++) trail.fillStyle(b.col, ((j + 1) / n) * 0.3).fillCircle(b.trail[j * 2], b.trail[j * 2 + 1], BR * (0.3 + (0.6 * (j + 1)) / n));
      if (b.y > height + 30 || b.x < -30 || b.x > width + 30) { b.img.destroy(); balls.splice(i, 1); }
    }
  };
  scene.events.on(Phaser.Scenes.Events.UPDATE, step);
  scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => scene.events.off(Phaser.Scenes.Events.UPDATE, step));
}

launch({
  meta: meta as GameMeta,
  background: '#140f2a',
  physics: 'none',
  preload(scene) {
    const l = scene.load;
    l.image('spark', kenney('particles/png_transparent/star_06.png'));
    const J = 'oga/junkala-sfx/general-sounds/';
    loadAudio(l, 'ping', J + 'simple-bleeps/sfx-sounds-blip10');
    loadAudio(l, 'drop', 'oga/junkala-sfx/movement/jumping-and-landing/sfx-movement-jump5');
    loadAudio(l, 'land', J + 'coins/sfx-coin-double1');
    loadAudio(l, 'big', J + 'coins/sfx-coin-cluster4');
    loadAudio(l, 'gold', J + 'coins/sfx-coin-single5');
    loadAudio(l, 'allgold', J + 'coins/sfx-coin-cluster6');
    loadAudio(l, 'star', J + 'coins/sfx-coin-single2');
    loadAudio(l, 'goal', J + 'positive-sounds/sfx-sounds-powerup10');
    loadAudio(l, 'split', J + 'high-pitched-sounds/sfx-sounds-high3');
    loadAudio(l, 'smash', J + 'impacts/sfx-sounds-impact7');
    loadAudio(l, 'solid', J + 'menu-sounds/sfx-menu-move2');
    loadAudio(l, 'bump', 'oga/junkala-sfx/movement/jumping-and-landing/sfx-movement-jump18');
    loadAudio(l, 'extra', J + 'fanfares/sfx-sounds-fanfare3');
    loadAudio(l, 'jackpot', J + 'fanfares/sfx-sounds-fanfare2');
    loadAudio(l, 'round', J + 'pause-sounds/sfx-sounds-pause4-in');
    loadAudio(l, 'clear', J + 'fanfares/sfx-sounds-fanfare1');
    loadAudio(l, 'fail', J + 'negative-sounds/sfx-sounds-negative2');
    loadAudio(l, 'zero', J + 'negative-sounds/sfx-sounds-error3');
  },
  menuDecor,
  scenes: [PlayScene],
  strings: {
    tr: {
      board: 'TAHTA', goal: 'HEDEF', balls: 'TOP', nextBalls: 'SIRADAKİ',
      goalLine: '{g} puan · {b} top', goalReached: 'HEDEF TAMAM!', boardClear: 'TAHTA TAMAM!', goalMissed: 'HEDEF KAÇTI!',
      bonus: 'BONUS +{n}', extraBall: '+1 TOP', extraShort: '+1', carry: 'SONRAKİ TAHTAYA +1 TOP',
      jackpot: 'BÜYÜK İKRAMİYE!', allGold: 'TÜM ALTINLAR! +{n}', comboX: 'KOMBO x{n}', split: 'BÖLÜNDÜ!',
      newBall: 'YENİ: {n}', hint: 'Sürükle ve bırak · Oklar ve BOŞLUK',
      bn_classic: 'KLASİK', bn_diamonds: 'ELMASLAR', bn_bumpers: 'TAMPONLAR', bn_sliders: 'KAYAN ÇUBUKLAR',
      bn_spinner: 'PERVANELER', bn_waves: 'DALGALAR', bn_funnel: 'HUNİLER',
      bname_gold: 'ALTIN TOP', bname_ghost: 'HAYALET TOP', bname_split: 'BÖLÜNEN TOP', bname_heavy: 'AĞIR TOP',
      desc_gold: 'ALTIN TOP: düştüğü cebin puanı x2',
      desc_ghost: 'HAYALET TOP: üst sıraların içinden geçer',
      desc_split: 'BÖLÜNEN TOP: ilk çarpışmada üçe ayrılır',
      desc_heavy: 'AĞIR TOP: ilk 3 çiviyi kırıp geçer',
    },
    en: {
      board: 'BOARD', goal: 'GOAL', balls: 'BALLS', nextBalls: 'NEXT',
      goalLine: '{g} points · {b} balls', goalReached: 'GOAL REACHED!', boardClear: 'BOARD CLEAR!', goalMissed: 'GOAL MISSED!',
      bonus: 'BONUS +{n}', extraBall: '+1 BALL', extraShort: '+1', carry: '+1 BALL ON THE NEXT BOARD',
      jackpot: 'JACKPOT!', allGold: 'ALL GOLD! +{n}', comboX: 'COMBO x{n}', split: 'SPLIT!',
      newBall: 'NEW: {n}', hint: 'Drag and release · Arrows and SPACE',
      bn_classic: 'CLASSIC', bn_diamonds: 'DIAMONDS', bn_bumpers: 'BUMPERS', bn_sliders: 'SLIDERS',
      bn_spinner: 'SPINNERS', bn_waves: 'WAVES', bn_funnel: 'FUNNELS',
      bname_gold: 'GOLDEN BALL', bname_ghost: 'GHOST BALL', bname_split: 'SPLIT BALL', bname_heavy: 'HEAVY BALL',
      desc_gold: 'GOLDEN BALL: pocket points x2',
      desc_ghost: 'GHOST BALL: passes through the top rows',
      desc_split: 'SPLIT BALL: splits into three on its first hit',
      desc_heavy: 'HEAVY BALL: smashes through its first 3 pegs',
    },
  },
});
