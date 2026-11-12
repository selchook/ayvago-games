import { launch, loadAudio, steeringOption, type GameMeta } from '@core';
import { World3D, THREE, loadKenney3d, model, grounded } from '@core/three';
import meta from './game.json';
import { PlayScene } from './PlayScene';

launch({
  meta: meta as GameMeta,
  background: '#5aa9e6',
  physics: 'none',
  preload(scene) {
    const l = scene.load;
    loadKenney3d(l, 'car', 'car-kit', 'race');
    loadKenney3d(l, 'block', 'platformer-kit', 'block');
    loadKenney3d(l, 'coin', 'platformer-kit', 'coinGold');
    loadKenney3d(l, 'crate', 'platformer-kit', 'crate');
    loadKenney3d(l, 'spikes', 'platformer-kit', 'spikes');
    loadKenney3d(l, 'heart', 'platformer-kit', 'heart');
    loadKenney3d(l, 'tree', 'platformer-kit', 'tree');
    loadKenney3d(l, 'rocks', 'platformer-kit', 'rocks');
    const J = 'oga/junkala-sfx/';
    loadAudio(l, 'jump', J + 'movement/jumping-and-landing/sfx-movement-jump12');
    loadAudio(l, 'land', J + 'movement/jumping-and-landing/sfx-movement-jump12-landing');
    loadAudio(l, 'coin', J + 'general-sounds/coins/sfx-coin-single2');
    loadAudio(l, 'heart', J + 'general-sounds/positive-sounds/sfx-sounds-powerup4');
    loadAudio(l, 'crash', J + 'explosions/short/sfx-exp-short-hard2');
    loadAudio(l, 'fall', J + 'movement/falling-sounds/sfx-sounds-falling3');
    loadAudio(l, 'respawn', J + 'movement/portals-and-transitions/sfx-movement-portal1');
    loadAudio(l, 'level', J + 'general-sounds/fanfares/sfx-sounds-fanfare2');
  },
  menuDecor(scene) {
    // the car turning slowly on a floating block, in the free band between the title and the best
    // score (the bottom row holds the Ayvago logo)
    const world = new World3D(scene, { background: null, shadows: true, fov: 40 });
    world.addLights({ ambient: 1.8, intensity: 2.2, extent: 4 });
    const stage = new THREE.Group();
    const block = grounded(model('block'));
    // a squat block keeps the stage clear of the best score under it
    block.scale.set(1.9, 0.9, 1.9);
    block.position.y = -0.9;
    const car = grounded(model('car'));
    car.scale.setScalar(0.9);
    stage.add(block, car);
    stage.scale.setScalar(0.5);
    world.scene.add(stage);
    // looking below the car puts it in the upper part of the screen, under the title
    world.camera.position.set(0, 1.6, 16);
    world.camera.lookAt(0, -2.45, 0);
    world.onFrame = (dt) => {
      stage.rotation.y += dt * 0.6;
      stage.position.y = Math.sin(performance.now() / 700) * 0.08;
    };
  },
  // touch screens choose ARROWS | WHEEL | TILT under PLAY (the shared driving-game switch)
  menuOption: steeringOption,
  scenes: [PlayScene],
  strings: {
    tr: { levelUp: 'HIZ ARTIYOR!', jump: 'ZIPLA' },
    en: { levelUp: 'SPEED UP!', jump: 'JUMP' },
  },
});
