import { launch, kenney, loadAudio, type GameMeta } from '@core';
import meta from './game.json';
import { PlayScene } from './PlayScene';

const T = 'tanks/png/';
const SS = 'space-shooter/png/';

launch({
  meta: meta as GameMeta,
  background: '#2a2416',
  preload(scene) {
    const l = scene.load;
    for (const c of ['blue', 'green', 'red', 'black', 'beige']) {
      l.image(`tank-${c}`, kenney(`${T}tanks/tank${c}.png`));
      l.image(`barrel-${c}`, kenney(`${T}tanks/barrel${c}.png`));
    }
    l.image('bullet-p', kenney(T + 'bullets/bulletblue.png'));
    l.image('bullet-e', kenney(T + 'bullets/bulletred.png'));
    l.image('ground', kenney(T + 'environment/sand.png'));
    l.image('dirt', kenney(T + 'environment/dirt.png'));
    l.image('tracks', kenney(T + 'tanks/trackssmall.png'));
    l.image('sandbag', kenney(T + 'obstacles/sandbagbrown.png'));
    l.image('barrel-red', kenney(T + 'obstacles/barrelred_up.png'));
    l.image('oil', kenney(T + 'obstacles/oil.png'));
    l.image('tree', kenney(T + 'environment/treesmall.png'));
    l.image('crate', kenney('sokoban/png/default_size/crates/crate_02.png'));
    for (let i = 0; i < 6; i++) l.image(`smoke${i}`, kenney(`${T}smoke/smokeorange${i}.png`));
    l.image('smokeg', kenney(T + 'smoke/smokegrey2.png'));
    l.image('pu-rapid', kenney(SS + 'power-ups/powerupred_bolt.png'));
    l.image('pu-triple', kenney(SS + 'power-ups/powerupyellow_star.png'));
    l.image('pu-shield', kenney(SS + 'power-ups/powerupblue_shield.png'));
    l.image('pu-repair', kenney(SS + 'power-ups/pill_green.png'));
    l.image('shield', kenney(SS + 'effects/shield2.png'));
    const J = 'oga/junkala-sfx/';
    loadAudio(l, 'fire', J + 'weapons/cannon/sfx-wpn-cannon4');
    loadAudio(l, 'efire', J + 'weapons/single-shot-sounds/sfx-weapon-singleshot3');
    loadAudio(l, 'boom1', J + 'explosions/short/sfx-exp-short-hard2');
    loadAudio(l, 'boom2', J + 'explosions/short/sfx-exp-short-hard4');
    loadAudio(l, 'boom3', J + 'explosions/short/sfx-exp-short-hard12');
    loadAudio(l, 'pop', J + 'explosions/shortest/sfx-exp-shortest-soft7');
    loadAudio(l, 'die', J + 'explosions/medium-length/sfx-exp-medium1');
    loadAudio(l, 'clang1', J + 'general-sounds/simple-damage-sounds/sfx-damage-hit10');
    loadAudio(l, 'clang2', J + 'general-sounds/simple-damage-sounds/sfx-damage-hit7');
    loadAudio(l, 'thud', J + 'general-sounds/impacts/sfx-sounds-impact3');
    loadAudio(l, 'wood', J + 'general-sounds/impacts/sfx-sounds-impact8');
    loadAudio(l, 'crate', J + 'general-sounds/impacts/sfx-sounds-impact11');
    loadAudio(l, 'shieldhit', J + 'general-sounds/impacts/sfx-sounds-impact13');
    loadAudio(l, 'power', J + 'general-sounds/positive-sounds/sfx-sounds-powerup13');
    loadAudio(l, 'repair', J + 'general-sounds/positive-sounds/sfx-sounds-powerup2');
    loadAudio(l, 'hurt', J + 'general-sounds/negative-sounds/sfx-sounds-damage3');
    loadAudio(l, 'lowhp', J + 'general-sounds/alarms/low-health-alarms/sfx-lowhealth-alarmloop6');
    loadAudio(l, 'wave', J + 'general-sounds/alarms/alarms/sfx-alarm-loop5');
    loadAudio(l, 'clear', J + 'general-sounds/fanfares/sfx-sounds-fanfare2');
    loadAudio(l, 'perfect', J + 'general-sounds/fanfares/sfx-sounds-fanfare1');
  },
  menuDecor(scene) {
    const { width, height } = scene.scale;
    scene.add.tileSprite(0, 0, width, height, 'ground').setOrigin(0).setAlpha(0.25);
    const deco = (x: number, y: number, c: string, rot: number) => {
      scene.add.image(x, y, `tank-${c}`).setScale(1.6).setRotation(rot);
      scene.add.image(x, y, `barrel-${c}`).setOrigin(0.5, 0.1).setScale(1.6).setRotation(rot);
    };
    deco(width * 0.12, height * 0.5, 'blue', -Math.PI / 2);
    deco(width * 0.88, height * 0.5, 'red', Math.PI / 2);
  },
  scenes: [PlayScene],
  strings: {
    tr: { perfect: 'KUSURSUZ!', waveClear: 'DALGA TAMAM', rapid: 'HIZLI ATIŞ', triple: 'ÜÇLÜ ATIŞ', shieldOn: 'KALKAN', repair: 'TAMİR' },
    en: { perfect: 'PERFECT!', waveClear: 'WAVE CLEAR', rapid: 'RAPID FIRE', triple: 'TRIPLE SHOT', shieldOn: 'SHIELD', repair: 'REPAIR' },
  },
});
