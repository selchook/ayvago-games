import { launch, kenney, loadAudio, loadSfx, type GameMeta } from '@core';
import meta from './game.json';
import { PlayScene } from './PlayScene';

const P = 'platformer/png/';

launch({
  meta: meta as GameMeta,
  background: '#9ad7f5',
  physics: 'arcade',
  gravityY: 1800,
  preload(scene) {
    const l = scene.load;
    const img = (key: string, path: string) => l.image(key, kenney(P + path));
    for (const [k, f] of [['p-stand', 'stand'], ['p-walk1', 'walk1'], ['p-walk2', 'walk2'], ['p-jump', 'jump'], ['p-hit', 'hit']]) img(k, `players/128x256/pink/alienpink_${f}.png`);
    for (const [k, f] of [['g-mid', 'grassmid'], ['g-left', 'grassleft'], ['g-right', 'grassright'], ['g-single', 'grass'], ['g-center', 'grasscenter'],
      ['h-mid', 'grasshalf_mid'], ['h-left', 'grasshalf_left'], ['h-right', 'grasshalf_right'], ['h-single', 'grasshalf']]) img(k, `ground/grass/${f}.png`);
    img('spikes', 'tiles/spikes.png');
    img('spring', 'tiles/spring.png');
    img('sprung', 'tiles/sprung.png');
    img('lava-top', 'tiles/lavatop_low.png');
    img('flag-down', 'items/flagred_down.png');
    img('flag-1', 'items/flagred1.png');
    for (const c of ['blue', 'green', 'red', 'yellow']) img(`gem-${c}`, `items/gem${c}.png`);
    img('heart', 'hud/hudheart_full.png');
    img('heart-empty', 'hud/hudheart_empty.png');
    for (const [k, f] of [['e-slime', 'slimegreen'], ['e-slime-move', 'slimegreen_move'], ['e-slime-dead', 'slimegreen_dead'],
      ['e-snail', 'snail'], ['e-snail-move', 'snail_move'], ['e-snail-shell', 'snail_shell'], ['e-saw', 'saw'],
      ['e-fly', 'fly'], ['e-fly-2', 'fly_dead'], ['e-fly-dead', 'fly_move'], ['e-bee', 'bee'], ['e-bee-move', 'bee_move'], ['e-bee-dead', 'bee_dead']]) img(k, `enemies/${f}.png`);
    for (const [k, f] of [['bg-grass', 'colored_grass'], ['bg-land', 'colored_land'], ['bg-shroom', 'colored_shroom'], ['bg-desert', 'colored_desert']]) img(k, `backgrounds/${f}.png`);
    const J = 'oga/junkala-sfx/';
    const M = J + 'movement/jumping-and-landing/';
    loadAudio(l, 'jump', M + 'sfx-movement-jump3');
    loadAudio(l, 'jump2', M + 'sfx-movement-jump2');
    loadAudio(l, 'land', M + 'sfx-movement-jump13-landing');
    loadAudio(l, 'gem', J + 'general-sounds/coins/sfx-coin-double2');
    loadAudio(l, 'flagup', J + 'general-sounds/positive-sounds/sfx-sounds-powerup12');
    loadAudio(l, 'stomp', J + 'general-sounds/impacts/sfx-sounds-impact5');
    loadAudio(l, 'spring', M + 'sfx-movement-jump6');
    loadAudio(l, 'hurt', J + 'general-sounds/negative-sounds/sfx-sounds-damage1');
    loadAudio(l, 'fall', J + 'movement/falling-sounds/sfx-sounds-falling11');
    loadSfx(l, 'win', 'jingles/audio/8-bit_jingles/jingles_nes04');
    loadAudio(l, 'start', J + 'general-sounds/menu-sounds/sfx-menu-select5');
  },
  menuDecor(scene) {
    const { width, height } = scene.scale;
    scene.add.image(0, height, 'bg-grass').setOrigin(0, 1).setScale(1.25).setAlpha(0.9);
    for (let i = 0; i < 20; i++) scene.add.image(32 + i * 64, height - 32, i === 0 ? 'g-left' : i === 19 ? 'g-right' : 'g-mid').setScale(0.5);
    const hero = scene.add.image(150, height - 64 - 64, 'p-stand').setScale(0.5);
    scene.tweens.add({ targets: hero, y: hero.y - 90, duration: 420, yoyo: true, repeat: -1, ease: 'Quad.easeOut', repeatDelay: 500 });
    scene.add.image(width - 160, height - 96, 'flag-1').setScale(0.5);
    const slime = scene.add.image(width - 320, height - 96, 'e-slime').setScale(0.5);
    scene.tweens.add({ targets: slime, x: width - 460, duration: 2000, yoyo: true, repeat: -1, onYoyo: () => slime.setFlipX(true), onRepeat: () => slime.setFlipX(false) });
    for (let i = 0; i < 3; i++) {
      const g = scene.add.image(310 + i * 70, height - 200, ['gem-blue', 'gem-green', 'gem-red'][i]).setScale(0.45);
      scene.tweens.add({ targets: g, y: g.y - 12, duration: 600, yoyo: true, repeat: -1, delay: i * 150, ease: 'Sine.easeInOut' });
    }
  },
  scenes: [PlayScene],
  strings: {
    tr: { gems: 'MÜCEVHER', collectAll: 'Tüm mücevherleri topla, sonra bayrağa koş!', flagUp: 'BAYRAK AÇIK!' },
    en: { gems: 'GEMS', collectAll: 'Collect every gem, then run to the flag!', flagUp: 'FLAG IS UP!' },
  },
});
