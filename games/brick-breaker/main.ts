import { launch, loadAudio, loadSfx, kenney, type GameMeta } from '@core';
import meta from './game.json';
import { PlayScene } from './PlayScene';
import { BRICK_COLORS } from './levels';

const P = 'puzzle2/png/';

const J = 'oga/junkala-sfx/';

launch({
  meta: meta as GameMeta,
  music: { play: 'level1' },
  background: '#0d0b1e',
  physics: 'none',
  preload(scene) {
    const l = scene.load;
    for (const [k, v] of Object.entries(BRICK_COLORS)) {
      l.image(`brick-${k}`, kenney(`${P}${v.plain}.png`));
      l.image(`brick-${k}2`, kenney(`${P}${v.framed}.png`));
    }
    l.image('steel', kenney(P + 'tiles_grey/tilegrey_50.png'));
    l.image('paddle', kenney(P + 'paddles/paddle_07.png'));
    l.image('ball', kenney(P + 'balls/grey/ballgrey_09.png'));
    l.image('spark', kenney(P + 'particles_white/particlewhite_7.png'));
    l.image('star', kenney(P + 'particles_white/particlewhite_3.png'));
    loadAudio(l, 'paddle', J + 'general-sounds/simple-bleeps/sfx-sounds-blip9');
    loadAudio(l, 'brick', J + 'general-sounds/simple-bleeps/sfx-sounds-blip5');
    loadAudio(l, 'debris', J + 'explosions/shortest/sfx-exp-shortest-soft7');
    loadAudio(l, 'crack', J + 'general-sounds/simple-damage-sounds/sfx-damage-hit5');
    loadAudio(l, 'steel', J + 'general-sounds/impacts/sfx-sounds-impact2');
    loadAudio(l, 'wall', J + 'general-sounds/menu-sounds/sfx-menu-move1');
    loadAudio(l, 'launch', J + 'movement/jumping-and-landing/sfx-movement-jump12');
    loadAudio(l, 'drop', J + 'general-sounds/high-pitched-sounds/sfx-sounds-high2');
    loadAudio(l, 'power', J + 'general-sounds/positive-sounds/sfx-sounds-powerup3');
    loadAudio(l, 'life', J + 'general-sounds/positive-sounds/sfx-sounds-powerup12');
    loadAudio(l, 'fast', J + 'general-sounds/positive-sounds/sfx-sounds-powerup15');
    loadAudio(l, 'lose', J + 'general-sounds/negative-sounds/sfx-sounds-negative2');
    loadAudio(l, 'low', J + 'general-sounds/alarms/low-health-alarms/sfx-lowhealth-alarmloop5');
    loadSfx(l, 'clear', 'jingles/audio/8-bit_jingles/jingles_nes05');
  },
  menuDecor(scene) {
    const { width, height } = scene.scale;
    const cols = ['r', 'o', 'y', 'g', 'b', 'p'];
    for (let r = 0; r < 3; r++) for (let c = 0; c < 8; c++) {
      const img = scene.add.image(width / 2 - 280 + c * 80, 70 + r * 40, `brick-${cols[(r * 2 + c) % 6]}`).setDisplaySize(76, 34).setAlpha(0.85);
      scene.tweens.add({ targets: img, alpha: 0.45, duration: 900 + c * 90, yoyo: true, repeat: -1 });
    }
    scene.add.image(width / 2, height * 0.88, 'paddle').setDisplaySize(180, 43);
    scene.add.image(width / 2 + 40, height * 0.84, 'ball').setDisplaySize(30, 30);
  },
  scenes: [PlayScene],
  strings: {
    tr: { launch: 'Fırlatmak için dokun', wide: 'GENİŞ RAKET', multi: 'ÇOKLU TOP', slow: 'YAVAŞ TOP', life: '+1 CAN', fast: 'HIZLANDI!' },
    en: { launch: 'Tap to launch', wide: 'WIDE PADDLE', multi: 'MULTIBALL', slow: 'SLOW BALL', life: '+1 LIFE', fast: 'SPEED UP!' },
  },
});
