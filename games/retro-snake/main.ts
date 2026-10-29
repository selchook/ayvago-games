import { launch, kenney, loadAudio, type GameMeta } from '@core';
import meta from './game.json';
import { PlayScene, FOODS } from './PlayScene';

launch({
  meta: meta as GameMeta,
  background: '#0f1a12',
  physics: 'none',
  preload(scene) {
    const l = scene.load;
    l.spritesheet('onebit', kenney('onebit/tilesheet/colored_transparent_packed.png'), { frameWidth: 16, frameHeight: 16 });
    const J = 'oga/junkala-sfx/general-sounds/';
    loadAudio(l, 'eat', J + 'coins/sfx-coin-single2');
    loadAudio(l, 'bonus', J + 'coins/sfx-coin-cluster5');
    loadAudio(l, 'level', J + 'positive-sounds/sfx-sounds-powerup12');
    loadAudio(l, 'rock', J + 'impacts/sfx-sounds-impact11');
    loadAudio(l, 'die', 'oga/junkala-sfx/explosions/shortest/sfx-exp-shortest-hard5');
    loadAudio(l, 'crumble', J + 'impacts/sfx-sounds-impact3');
    loadAudio(l, 'turn', J + 'menu-sounds/sfx-menu-move3');
    loadAudio(l, 'mode', J + 'menu-sounds/sfx-menu-move2');
    loadAudio(l, 'go', J + 'menu-sounds/sfx-menu-select2');
    loadAudio(l, 'spawn', J + 'pause-sounds/sfx-sounds-pause1-in');
    loadAudio(l, 'expire', J + 'pause-sounds/sfx-sounds-pause1-out');
  },
  menuDecor(scene) {
    scene.textures.get('onebit').setFilter(1);
    const { width, height } = scene.scale;
    const g = scene.add.graphics();
    const path = [[3, 0], [2, 0], [1, 0], [0, 0], [0, 1], [0, 2], [1, 2], [2, 2], [3, 2], [4, 2]];
    path.forEach(([cx, cy], i) => {
      g.fillStyle(i === 0 ? 0x9dff6a : i % 2 ? 0x3fbf3f : 0x4fd84f).fillRoundedRect(width / 2 - 150 + cx * 44, height * 0.77 + cy * 44, 40, 40, 10);
    });
    scene.add.image(width / 2 + 120, height * 0.77 + 20, 'onebit', FOODS[0]).setScale(2.5);
  },
  scenes: [PlayScene],
  strings: {
    tr: { choose: 'MOD SEÇ', classic: 'KLASİK', walls: 'DUVARLI', classicInfo: 'Kenarlardan karşıya geçersin', wallsInfo: 'Kenarlar öldürür · puan x2', bonus: 'BONUS!', faster: 'HIZLANDIN!' },
    en: { choose: 'CHOOSE MODE', classic: 'CLASSIC', walls: 'WALLS', classicInfo: 'Wrap around the edges', wallsInfo: 'Edges kill · points x2', bonus: 'BONUS!', faster: 'FASTER!' },
  },
});
