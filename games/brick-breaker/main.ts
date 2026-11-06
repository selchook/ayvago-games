import { launch, loadAudio, loadSfx, kenney, type GameMeta } from '@core';
import meta from './game.json';
import { PlayScene } from './PlayScene';
import { BRICK_COLORS } from './levels';
import { menuScene } from './menu';

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
    menuScene(scene);
  },
  scenes: [PlayScene],
  strings: {
    tr: { launch: 'Fırlatmak için dokun', wide: 'GENİŞ RAKET', multi: 'ÇOKLU TOP', slow: 'YAVAŞ TOP', life: '+1 CAN', fast: 'HIZLANDI!',
      lv1: 'Gökkuşağı', lv2: 'Piramit', lv3: 'Dama Tahtası', lv4: 'İstilacı', lv5: 'Kalp', lv6: 'Kapılar', lv7: 'Elmas', lv8: 'Sütunlar', lv9: 'Kale', lv10: 'Çekirdek',
    },
    en: { launch: 'Tap to launch', wide: 'WIDE PADDLE', multi: 'MULTIBALL', slow: 'SLOW BALL', life: '+1 LIFE', fast: 'SPEED UP!',
      lv1: 'Rainbow', lv2: 'Pyramid', lv3: 'Checkerboard', lv4: 'Invader', lv5: 'Heart', lv6: 'Gates', lv7: 'Diamond', lv8: 'Columns', lv9: 'Fortress', lv10: 'The Core',
    },
  },
});
