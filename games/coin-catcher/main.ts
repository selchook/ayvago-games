import { launch, loadAudio, kenney, type GameMeta } from '@core';
import meta from './game.json';
import { PlayScene } from './PlayScene';

const P = 'platformer/png/';

const J = 'oga/junkala-sfx/';

launch({
  meta: meta as GameMeta,
  background: '#2c5d8a',
  physics: 'none',
  preload(scene) {
    const l = scene.load;
    l.image('cc-bg', kenney(P + 'backgrounds/colored_grass.png'));
    l.image('cc-grass', kenney(P + 'ground/grass/grass.png'));
    for (const f of ['front', 'walk1', 'walk2', 'hit', 'jump']) {
      l.image('cc-alien-' + f, kenney(`${P}players/variable_sizes/green/aliengreen_${f}.png`));
    }
    for (const c of ['gold', 'silver', 'bronze']) l.image('cc-coin-' + c, kenney(`${P}items/coin${c}.png`));
    for (const c of ['blue', 'green', 'red', 'yellow']) l.image('cc-gem-' + c, kenney(`${P}items/gem${c}.png`));
    l.image('cc-star', kenney(P + 'items/star.png'));
    l.image('cc-bomb', kenney(P + 'tiles/bomb.png'));
    l.image('cc-heart', kenney(P + 'hud/hudheart_full.png'));
    l.image('cc-heart-empty', kenney(P + 'hud/hudheart_empty.png'));
    l.image('cc-spark', kenney('particles/png_transparent/star_06.png'));
    l.image('cc-smoke', kenney('particles/png_transparent/smoke_01.png'));
    loadAudio(l, 'coin', J + 'general-sounds/coins/sfx-coin-single2');
    loadAudio(l, 'gem', J + 'general-sounds/weird-sounds/sfx-sound-bling');
    loadAudio(l, 'heart', J + 'general-sounds/positive-sounds/sfx-sounds-powerup9');
    loadAudio(l, 'magnet', J + 'general-sounds/positive-sounds/sfx-sounds-powerup1');
    loadAudio(l, 'combo', J + 'general-sounds/coins/sfx-coin-cluster5');
    loadAudio(l, 'thud', J + 'movement/jumping-and-landing/sfx-movement-jump10-landing');
    loadAudio(l, 'broken', J + 'general-sounds/negative-sounds/sfx-sounds-damage3');
    loadAudio(l, 'boom', J + 'explosions/short/sfx-exp-short-hard9');
    loadAudio(l, 'boomFar', J + 'explosions/shortest/sfx-exp-shortest-hard7');
    loadAudio(l, 'hurt', J + 'death-screams/alien/sfx-deathscream-alien5');
    loadAudio(l, 'death', J + 'death-screams/alien/sfx-deathscream-alien1');
    loadAudio(l, 'low', J + 'general-sounds/alarms/low-health-alarms/sfx-lowhealth-alarmloop5');
    loadAudio(l, 'level', J + 'general-sounds/fanfares/sfx-sounds-fanfare3');
  },
  menuDecor(scene) {
    const { width, height } = scene.scale;
    scene.add.image(width / 2, height / 2, 'cc-bg').setDisplaySize(height, height).setAlpha(0.35);
    for (let i = 0; i < 6; i++) scene.add.image(48 + i * 125, height - 30, 'cc-grass').setScale(0.75).setAlpha(0.6);
    const items = ['cc-coin-gold', 'cc-gem-blue', 'cc-coin-silver', 'cc-gem-red', 'cc-coin-gold', 'cc-bomb'];
    items.forEach((k, i) => {
      const img = scene.add.image(70 + i * 116, height * 0.08 + (i % 2) * 50, k).setScale(0.6);
      scene.tweens.add({ targets: img, y: img.y + 24, duration: 700 + i * 90, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    });
    const a = scene.add.image(width * 0.18, height - 110, 'cc-alien-walk1').setOrigin(0.5, 1).setScale(0.7);
    scene.tweens.add({ targets: a, x: width * 0.82, duration: 2600, yoyo: true, repeat: -1, ease: 'Sine.easeInOut', onYoyo: () => a.setFlipX(true), onRepeat: () => a.setFlipX(false) });
  },
  scenes: [PlayScene],
  strings: {
    tr: { magnet: 'MIKNATIS!', life: '+1 CAN', boom: 'BUM!', dragHint: '< Sürükle >', bombs: 'BOMBA YAĞMURU!' },
    en: { magnet: 'MAGNET!', life: '+1 LIFE', boom: 'BOOM!', dragHint: '< Drag >', bombs: 'BOMB RAIN!' },
  },
});
