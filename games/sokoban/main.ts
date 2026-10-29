import { launch, kenney, loadAudio, type GameMeta } from '@core';
import meta from './game.json';
import { PlayScene } from './PlayScene';

const SK = 'sokoban/png/default_size/';

launch({
  meta: meta as GameMeta,
  background: '#1c1626',
  physics: 'none',
  preload(scene) {
    const l = scene.load;
    for (const b of ['block_05', 'block_06', 'block_07', 'block_08']) l.image(b, kenney(`${SK}blocks/${b}.png`));
    for (const g of ['ground_01', 'ground_03', 'ground_05', 'ground_06']) l.image(g, kenney(`${SK}ground/${g}.png`));
    l.image('sk-crate', kenney(`${SK}crates/crate_02.png`));
    l.image('sk-crate-on', kenney(`${SK}crates/crate_05.png`));
    l.image('sk-goal', kenney(`${SK}environment/environment_04.png`));
    l.image('sk-down', kenney(`${SK}player/player_01.png`));
    l.image('sk-up', kenney(`${SK}player/player_02.png`));
    l.image('sk-right', kenney(`${SK}player/player_11.png`));
    l.image('sk-left', kenney(`${SK}player/player_14.png`));
    l.image('sk-arrow', kenney('game-icons/png/white/1x/arrowup.png'));
    l.image('sk-restart', kenney('game-icons/png/white/1x/previous.png'));
    const J = 'oga/junkala-sfx/';
    loadAudio(l, 'step1', J + 'movement/footsteps/sfx-movement-footsteps1a');
    loadAudio(l, 'step2', J + 'movement/footsteps/sfx-movement-footsteps1b');
    loadAudio(l, 'push1', J + 'general-sounds/impacts/sfx-sounds-impact2');
    loadAudio(l, 'push2', J + 'general-sounds/impacts/sfx-sounds-impact8');
    loadAudio(l, 'bump', J + 'general-sounds/simple-damage-sounds/sfx-damage-hit2');
    loadAudio(l, 'goal', J + 'general-sounds/coins/sfx-coin-double1');
    loadAudio(l, 'undo', J + 'general-sounds/pause-sounds/sfx-sounds-pause1-out');
    loadAudio(l, 'restart', J + 'general-sounds/pause-sounds/sfx-sounds-pause7-out');
    loadAudio(l, 'win', J + 'general-sounds/fanfares/sfx-sounds-fanfare2');
    loadAudio(l, 'star', J + 'general-sounds/coins/sfx-coin-single5');
    loadAudio(l, 'start', J + 'general-sounds/pause-sounds/sfx-sounds-pause3-in');
  },
  menuDecor(scene) {
    const { width, height } = scene.scale;
    for (let i = 0; i < 6; i++) scene.add.image(width * (0.08 + i * 0.168), height * 0.86, 'block_05').setDisplaySize(110, 110).setAlpha(0.7);
    const p = scene.add.image(width * 0.3, height * 0.78, 'sk-right').setDisplaySize(110, 110);
    const c = scene.add.image(width * 0.45, height * 0.78, 'sk-crate').setDisplaySize(100, 100);
    scene.add.image(width * 0.75, height * 0.78, 'sk-goal').setDisplaySize(100, 100);
    scene.tweens.add({ targets: [p, c], x: '+=90', duration: 1400, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    scene.add.image(width * 0.15, height * 0.08, 'sk-crate-on').setDisplaySize(90, 90).setAngle(-10);
    scene.add.image(width * 0.85, height * 0.09, 'sk-crate').setDisplaySize(90, 90).setAngle(12);
  },
  scenes: [PlayScene],
  strings: {
    tr: { par: 'HEDEF' },
    en: { par: 'PAR' },
  },
});
