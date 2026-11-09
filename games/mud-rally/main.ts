import { launch, loadAudio, type GameMeta } from '@core';
import { World3D, THREE, loadKenney3d } from '@core/three';
import meta from './game.json';
import { PlayScene } from './PlayScene';
import { STRINGS } from './strings';
import { steeringMenu, touchScreen } from './steering';
import { Truck } from './truck';
import { noise2 } from './terrain';

/** A dirt mound with flat-shaded facets, for the menu stage. */
function mound(radius: number, seed: number): THREE.Mesh {
  const geo = new THREE.CylinderGeometry(radius * 0.72, radius, radius * 0.42, 18, 3);
  const pos = geo.getAttribute('position') as THREE.BufferAttribute;
  const cols: number[] = [];
  const dirt = new THREE.Color(0xb27a4b), dark = new THREE.Color(0x8a5a35), c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    const n = noise2(x * 1.3 + 10, z * 1.3, seed);
    if (y > -radius * 0.2) pos.setY(i, y + (n - 0.5) * 0.18);
    c.copy(dirt).lerp(dark, y > radius * 0.2 ? n * 0.4 : 0.7).toArray(cols, i * 3);
  }
  geo.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
  geo.computeVertexNormals();
  const m = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }));
  m.userData.ownMaterial = true;
  m.receiveShadow = true;
  m.castShadow = true;
  return m;
}

launch({
  meta: meta as GameMeta,
  background: '#24324a',
  physics: 'none',
  preload(scene) {
    const l = scene.load;
    for (const [key, name] of [['suv', 'suv'], ['suvLux', 'suvLuxury'], ['truck', 'truck'], ['truckFlat', 'truckFlat']]) loadKenney3d(l, key, 'car-kit', name);
    for (const [key, name] of [['barrier', 'barrierWall'], ['fence', 'fenceStraight'], ['flagCheckers', 'flagCheckers'], ['stand', 'grandStandCovered'],
      ['tent', 'tentLong'], ['light', 'lightPostLarge'], ['pylon', 'pylon']]) {
      loadKenney3d(l, key, 'racing-kit', name);
    }
    for (const [key, name] of [['treeA', 'tree_default'], ['treeB', 'tree_oak'], ['treeC', 'tree_pineRoundA'], ['rock', 'stone_largeA'],
      ['cactus', 'cactus_tall'], ['bush', 'plant_bushDetailed'], ['grass', 'grass_large']]) {
      loadKenney3d(l, key, 'nature-kit', name);
    }
    loadKenney3d(l, 'coin', 'platformer-kit', 'coinGold');
    loadKenney3d(l, 'barrel', 'platformer-kit', 'barrel');
    const J = 'oga/junkala-sfx/';
    loadAudio(l, 'engine', J + 'movement/vehicles/sfx-vehicle-carloop1');
    loadAudio(l, 'beep', J + 'general-sounds/simple-bleeps/sfx-sounds-blip2');
    loadAudio(l, 'go', J + 'general-sounds/positive-sounds/sfx-sounds-powerup2');
    loadAudio(l, 'nitro', J + 'movement/portals-and-transitions/sfx-movement-portal3');
    loadAudio(l, 'bump', J + 'general-sounds/impacts/sfx-sounds-impact3');
    loadAudio(l, 'wall', J + 'general-sounds/simple-damage-sounds/sfx-damage-hit3');
    loadAudio(l, 'jump', J + 'movement/jumping-and-landing/sfx-movement-jump9');
    loadAudio(l, 'land', J + 'movement/jumping-and-landing/sfx-movement-jump12-landing');
    loadAudio(l, 'splash', J + 'explosions/shortest/sfx-exp-shortest-soft2');
    loadAudio(l, 'cash', J + 'general-sounds/coins/sfx-coin-double2');
    loadAudio(l, 'nitroPick', J + 'general-sounds/positive-sounds/sfx-sounds-powerup4');
    loadAudio(l, 'lap', J + 'general-sounds/weird-sounds/sfx-sound-bling');
    loadAudio(l, 'finish', J + 'general-sounds/fanfares/sfx-sounds-fanfare1');
    loadAudio(l, 'lose', J + 'general-sounds/negative-sounds/sfx-sounds-negative1');
    loadAudio(l, 'buy', J + 'general-sounds/coins/sfx-coin-cluster3');
    loadAudio(l, 'nope', J + 'general-sounds/negative-sounds/sfx-sounds-error2');
    loadAudio(l, 'move', J + 'general-sounds/menu-sounds/sfx-menu-move2');
    loadAudio(l, 'skid', J + 'movement/vehicles/sfx-vehicle-breaks');
  },
  menuDecor(scene) {
    // two trucks turning slowly on dirt mounds, either side of the menu
    const world = new World3D(scene, { background: null, shadows: true, fov: 36 });
    world.addLights({ ambient: 1.7, intensity: 2.3, extent: 16, dir: [-0.4, 1, 0.6] });
    const stages: THREE.Group[] = [];
    const looks: [number, number][] = [[0x2f7dff, 0], [0xe8402f, 1]];
    looks.forEach(([color, i]) => {
      const stage = new THREE.Group();
      const hill = mound(3.2, 4 + i);
      hill.position.y = -0.67;
      const truck = new Truck(i ? 'truck' : 'suv', color, false);
      truck.root.position.y = 0.03;
      truck.root.scale.setScalar(1.35);
      truck.root.rotation.y = i ? 0.6 : -0.6;
      stage.add(hill, truck.root);
      // with the steering switch beside PLAY (touch screens) the trucks stand a little wider
      const x = touchScreen(scene) ? 12.9 : 10.8;
      stage.position.set(i ? x : -x, -0.5, 0);
      world.scene.add(stage);
      stages.push(stage);
    });
    world.camera.position.set(0, 5.5, 26);
    world.camera.lookAt(0, 0.6, 0);
    world.onFrame = (dt) => {
      stages[0].rotation.y += dt * 0.5;
      stages[1].rotation.y -= dt * 0.5;
      const t = performance.now() / 700;
      stages[0].position.y = -0.5 + Math.sin(t) * 0.07;
      stages[1].position.y = -0.5 + Math.sin(t + 1.5) * 0.07;
    };
  },
  menuOption: { show: touchScreen, build: steeringMenu },
  scenes: [PlayScene],
  strings: STRINGS,
});
