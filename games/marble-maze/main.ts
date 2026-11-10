import { launch, loadAudio, loadSfx, type GameMeta } from '@core';
import { World3D, loadKenney3d } from '@core/three';
import meta from './game.json';
import { PlayScene } from './PlayScene';
import { STRINGS } from './strings';
import { controlOption } from './tilt-board';
import { makeRollSound } from './rollsound';
import { Board3D, envMap } from './board';
import { THEMES } from './look';
import { Sim, parseLevel, TUNE } from './sim';

/** The menu's backdrop board: a small workshop maze rocking slowly while its marble rolls. */
const MENU_MAP = [
  '###########',
  '#.........#',
  '#.##.#.##.#',
  '#....#....#',
  '#.#.*.*.#.#',
  '#.#..G..#.#',
  '#.#.*.*.#.#',
  '#....#....#',
  '#.##.#.##.#',
  '#....S....#',
  '###########',
];

launch({
  meta: meta as GameMeta,
  background: '#2b1d14',
  physics: 'none',
  preload(scene) {
    const l = scene.load;
    const P = 'platformer-kit', N = 'nature-kit';
    for (const [key, kit, name] of [
      ['jewel', P, 'jewel'], ['key', P, 'key'], ['flag', P, 'flag'], ['barrel', P, 'barrel'], ['crate', P, 'crate'],
      ['crateStrong', P, 'crateStrong'], ['blockSnow', P, 'blockSnow'], ['stoneTall', N, 'stone_tallB'],
      ['tree', N, 'tree_default'], ['treeOak', N, 'tree_oak'], ['bush', N, 'plant_bushDetailed'], ['flowerRed', N, 'flower_redA'],
      ['flowerYellow', N, 'flower_yellowA'], ['rockTall', N, 'rock_tallA'],
      ['column', N, 'statue_column'], ['columnBroken', N, 'statue_columnDamaged'], ['obelisk', N, 'statue_obelisk'],
    ] as const) loadKenney3d(l, key, kit, name);
    const J = 'oga/junkala-sfx/';
    loadSfx(l, 'click', 'sfx-impact/audio/impactglass_light_000');
    loadSfx(l, 'click2', 'sfx-impact/audio/impactglass_light_002');
    loadSfx(l, 'knock', 'sfx-impact/audio/impactwood_heavy_001');
    loadAudio(l, 'bumper', J + 'movement/jumping-and-landing/sfx-movement-jump3');
    loadAudio(l, 'pad', J + 'movement/jumping-and-landing/sfx-movement-jump12');
    loadAudio(l, 'land', J + 'movement/jumping-and-landing/sfx-movement-jump12-landing');
    loadAudio(l, 'gem', J + 'general-sounds/coins/sfx-coin-double3');
    loadAudio(l, 'key', J + 'general-sounds/positive-sounds/sfx-sounds-powerup6');
    loadAudio(l, 'button', J + 'general-sounds/buttons/sfx-sounds-button3');
    loadAudio(l, 'gate', J + 'movement/opening-doors/sfx-movement-dooropen2');
    loadAudio(l, 'checkpoint', J + 'general-sounds/positive-sounds/sfx-sounds-powerup2');
    loadAudio(l, 'locked', J + 'general-sounds/negative-sounds/sfx-sounds-error4');
    loadAudio(l, 'fall', J + 'movement/falling-sounds/sfx-sounds-falling3');
    loadAudio(l, 'plop', J + 'explosions/shortest/sfx-exp-shortest-soft2');
    loadAudio(l, 'respawn', J + 'movement/portals-and-transitions/sfx-movement-portal1');
    loadAudio(l, 'goal', J + 'general-sounds/fanfares/sfx-sounds-fanfare2');
    loadAudio(l, 'star', J + 'general-sounds/coins/sfx-coin-single5');
    loadAudio(l, 'beep', J + 'general-sounds/simple-bleeps/sfx-sounds-blip2');
    loadAudio(l, 'move', J + 'general-sounds/menu-sounds/sfx-menu-move2');
    loadAudio(l, 'pick', J + 'general-sounds/menu-sounds/sfx-menu-select2');
    loadAudio(l, 'lose', J + 'general-sounds/negative-sounds/sfx-sounds-negative1');
    loadAudio(l, 'life', J + 'general-sounds/positive-sounds/sfx-sounds-powerup4');
    loadAudio(l, 'unlock', J + 'general-sounds/weird-sounds/sfx-sound-bling');
    makeRollSound(scene.game);
  },
  menuDecor(scene) {
    const th = THEMES[0];
    const world = new World3D(scene, { background: th.bg, fog: th.fog ?? undefined, fov: 40 });
    world.addLights({ sky: th.sky, ground: th.ground, ambient: th.ambient, intensity: th.sunPower, sun: th.sun, extent: 9, dir: [-0.5, 1, 0.45] });
    const L = parseLevel(MENU_MAP);
    const sim = new Sim(L, TUNE.normal);
    const board = new Board3D(world.scene, L, th, envMap(world.renderer), 99);
    const cx = L.w / 2, cz = L.h / 2;
    board.pivot.position.set(cx, 0, cz);
    board.board.position.set(-cx, 0, -cz);
    world.camera.position.set(cx, 15.5, cz + 9.5);
    world.camera.lookAt(cx, -2.2, cz - 1.2);
    world.followSun(board.pivot.position);
    // the menu reads over a dimmed board
    scene.add.rectangle(0, 0, scene.scale.width, scene.scale.height, 0x120b06, 0.5).setOrigin(0).setDepth(-50);
    let time = 0;
    world.onFrame = (dt) => {
      time += dt;
      // a slow wandering tilt, as if someone were playing
      const ix = Math.sin(time * 0.7) * 0.8 + Math.sin(time * 1.9) * 0.2;
      const iy = Math.cos(time * 0.53) * 0.8 + Math.sin(time * 1.3) * 0.2;
      sim.step(dt, ix, iy);
      if (sim.state !== 'roll') sim.respawn();
      for (const g of sim.L.gems) g.taken = false;
      board.pivot.rotation.set(sim.tiltY * 0.14, 0, -sim.tiltX * 0.14);
      board.sync(sim, dt, time);
    };
    scene.events.once('shutdown', () => board.dispose());
  },
  difficulty: true,
  menuOption: controlOption,
  scenes: [PlayScene],
  strings: STRINGS,
});
