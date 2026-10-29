import { launch, kenney, loadAudio, type GameMeta } from '@core';
import meta from './game.json';
import { PlayScene } from './PlayScene';

const P = 'topdown-shooter/png/';

launch({
  meta: meta as GameMeta,
  background: '#1b2a1a',
  preload(scene) {
    const l = scene.load;
    for (const w of ['gun', 'machine', 'silencer']) l.image(`hero-${w}`, kenney(`${P}survivor_1/survivor1_${w}.png`));
    l.image('zombie', kenney(P + 'zombie_1/zoimbie1_hold.png'));
    l.image('grass', kenney(P + 'tiles/tile_01.png'));
    l.image('dirt', kenney(P + 'tiles/tile_05.png'));
    l.image('crate', kenney(P + 'tiles/tile_129.png'));
    l.image('bush', kenney(P + 'tiles/tile_183.png'));
    l.image('bush2', kenney(P + 'tiles/tile_186.png'));
    l.image('rock', kenney(P + 'tiles/tile_237.png'));
    const J = 'oga/junkala-sfx/';
    loadAudio(l, 'shoot1', J + 'weapons/single-shot-sounds/sfx-weapon-singleshot15');
    loadAudio(l, 'shoot2', J + 'weapons/single-shot-sounds/sfx-weapon-singleshot4');
    loadAudio(l, 'shoot3', J + 'weapons/single-shot-sounds/sfx-weapon-singleshot20');
    loadAudio(l, 'hit1', J + 'general-sounds/simple-damage-sounds/sfx-damage-hit1');
    loadAudio(l, 'hit2', J + 'general-sounds/simple-damage-sounds/sfx-damage-hit6');
    loadAudio(l, 'splat1', J + 'explosions/shortest/sfx-exp-shortest-soft1');
    loadAudio(l, 'splat2', J + 'explosions/shortest/sfx-exp-shortest-soft8');
    loadAudio(l, 'brutedie', J + 'death-screams/alien/sfx-deathscream-alien5');
    loadAudio(l, 'bossdie', J + 'death-screams/alien/sfx-deathscream-alien1');
    loadAudio(l, 'hurt', J + 'general-sounds/negative-sounds/sfx-sounds-damage1');
    loadAudio(l, 'die', J + 'death-screams/human/sfx-deathscream-human1');
    loadAudio(l, 'lowhp', J + 'general-sounds/alarms/low-health-alarms/sfx-lowhealth-alarmloop3');
    loadAudio(l, 'pickup', J + 'general-sounds/positive-sounds/sfx-sounds-powerup4');
    loadAudio(l, 'wave', J + 'general-sounds/alarms/alarms/sfx-alarm-loop5');
    loadAudio(l, 'boss', J + 'general-sounds/alarms/alarms/sfx-alarm-loop4');
    loadAudio(l, 'menu', J + 'general-sounds/pause-sounds/sfx-sounds-pause5-in');
    loadAudio(l, 'upgrade', J + 'general-sounds/positive-sounds/sfx-sounds-powerup18');
    loadAudio(l, 'toggle', J + 'general-sounds/menu-sounds/sfx-menu-move5');
    loadAudio(l, 'aim', J + 'general-sounds/buttons/sfx-sounds-button3');
  },
  menuDecor(scene) {
    const { width, height } = scene.scale;
    scene.add.tileSprite(0, 0, width, height, 'grass').setOrigin(0).setAlpha(0.3);
    scene.add.image(width * 0.12, height * 0.5, 'hero-machine').setScale(3);
    for (const [x, y, r] of [[0.84, 0.38, 3.3], [0.9, 0.58, 3.0], [0.78, 0.62, 2.9]]) scene.add.image(width * x, height * y, 'zombie').setScale(2.6).setRotation(r);
  },
  scenes: [PlayScene],
  strings: {
    tr: {
      autoAim: 'OTO-NİŞAN', chooseUp: 'BİR GÜÇLENDİRME SEÇ', upRate: 'ATIŞ HIZI', upDmg: 'HASAR', upMulti: 'ÇOKLU ATIŞ', upPierce: 'DELİCİ MERMİ',
      upSpeed: 'KOŞU HIZI', upHeal: 'MAKS CAN +1', boss: 'DEV ZOMBİ!', waveClear: 'DALGA TAMAM', heal: 'CAN +1', on: 'AÇIK', off: 'KAPALI',
    },
    en: {
      autoAim: 'AUTO-AIM', chooseUp: 'CHOOSE AN UPGRADE', upRate: 'FIRE RATE', upDmg: 'DAMAGE', upMulti: 'MULTI-SHOT', upPierce: 'PIERCING',
      upSpeed: 'RUN SPEED', upHeal: 'MAX HP +1', boss: 'GIANT ZOMBIE!', waveClear: 'WAVE CLEAR', heal: 'HP +1', on: 'ON', off: 'OFF',
    },
  },
});
