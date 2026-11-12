import { launch, kenney, loadAudio, loadSfx, steeringOption, type GameMeta } from '@core';
import { World3D, THREE, loadKenney3d } from '@core/three';
import meta from './game.json';
import { PlayScene } from './PlayScene';
import { STRINGS } from './strings';
import { Sea, Gulls, Clouds, PALETTES, freeOwnGeometry } from './sea';
import { Ship } from './ship';
import { Archipelago, BERTH, ISLAND_MODELS } from './islands';
import { makeSeaSounds } from './sounds';

const SHIPS = ['ship-pirate-medium', 'ship-pirate-small', 'ship-small', 'ship-medium', 'ship-large', 'ship-ghost'];
const PROPS = ['cannon-ball', 'chest', 'barrel', 'bottle-large'];

launch({
  meta: meta as GameMeta,
  background: '#1d6f9e',
  physics: 'none',
  preload(scene) {
    const l = scene.load;
    for (const name of new Set([...SHIPS, ...PROPS, ...ISLAND_MODELS])) loadKenney3d(l, 'pk:' + name, 'pirate-kit', name);
    l.image('pc-coin', kenney('platformer/png/hud/hudcoin.png'));
    const J = 'oga/junkala-sfx/';
    loadAudio(l, 'cannon', J + 'weapons/cannon/sfx-wpn-cannon2');
    // the cannon (Tito Tank's shot): two copies for the player's broadsides, one for enemy guns,
    // so a new volley never cuts the tail of the last one
    loadAudio(l, 'cannonB', J + 'weapons/cannon/sfx-wpn-cannon2');
    loadAudio(l, 'cannonFoe', J + 'weapons/cannon/sfx-wpn-cannon2');
    loadAudio(l, 'cannonFar', J + 'weapons/cannon/sfx-wpn-cannon4');
    loadAudio(l, 'whistle', J + 'weapons/grenade-whistles/sfx-wpn-grenadewhistle1');
    loadAudio(l, 'boom1', J + 'explosions/medium-length/sfx-exp-medium1');
    loadAudio(l, 'boom2', J + 'explosions/medium-length/sfx-exp-medium3');
    loadAudio(l, 'boom3', J + 'explosions/medium-length/sfx-exp-medium6');
    loadAudio(l, 'boomDouble', J + 'explosions/double/sfx-exp-double2');
    loadAudio(l, 'splash', J + 'explosions/shortest/sfx-exp-shortest-soft2');
    loadAudio(l, 'sink', J + 'explosions/medium-length/sfx-exp-medium3');
    loadAudio(l, 'bigBoom', J + 'explosions/long/sfx-exp-long3');
    loadAudio(l, 'thunder', J + 'explosions/long/sfx-exp-long1');
    loadAudio(l, 'coin', J + 'general-sounds/coins/sfx-coin-single2');
    loadAudio(l, 'chest', J + 'general-sounds/coins/sfx-coin-cluster3');
    loadAudio(l, 'repair', J + 'general-sounds/positive-sounds/sfx-sounds-powerup4');
    loadAudio(l, 'rapid', J + 'general-sounds/positive-sounds/sfx-sounds-powerup2');
    loadAudio(l, 'fanfare', J + 'general-sounds/fanfares/sfx-sounds-fanfare2');
    loadAudio(l, 'lose', J + 'general-sounds/negative-sounds/sfx-sounds-negative1');
    loadAudio(l, 'bossHorn', J + 'general-sounds/alarms/low-health-alarms/sfx-lowhealth-alarmloop4');
    loadAudio(l, 'hurt', J + 'general-sounds/simple-damage-sounds/sfx-damage-hit3');
    const I = 'sfx-impact/audio/';
    loadSfx(l, 'hit', I + 'impactwood_heavy_002');
    loadSfx(l, 'stone', I + 'impactmining_002');
    loadSfx(l, 'bump', I + 'impactwood_heavy_004');
    loadSfx(l, 'hammer', I + 'impactplank_medium_001');
    loadSfx(l, 'bell', I + 'impactbell_heavy_001');
    loadSfx(l, 'sail', 'sfx-interface/audio/maximize_003');
    loadSfx(l, 'click', 'sfx-interface/audio/click_002');
  },
  menuDecor(scene) {
    makeSeaSounds(scene.game);
    // the ship sails slow circles off the cove behind the menu
    let menuScene: THREE.Scene | undefined;
    freeOwnGeometry(scene, () => menuScene);
    const world = new World3D(scene, { fov: 46, near: 0.5, far: 220, fog: { color: PALETTES.sunset.fog, near: 60, far: 170 }, background: PALETTES.sunset.sky });
    menuScene = world.scene;
    const sun = world.addLights({ ambient: 1.4, intensity: 2.1, extent: 30, dir: [-0.6, 0.8, -0.3] });
    sun.color.setHex(PALETTES.sunset.sun);
    const sea = new Sea(world.scene);
    sea.setColors(PALETTES.sunset);
    const map = new Archipelago(world.scene, 7);
    sea.shoals = map.shoals();
    const ship = new Ship(world.scene, 'pk:ship-pirate-medium', 1);
    const gulls = new Gulls(world.scene, 4);
    const clouds = new Clouds(world.scene, 6);
    // a dim veil keeps the menu text readable
    scene.add.rectangle(0, 0, scene.scale.width, scene.scale.height, 0x0b1430, 0.3).setOrigin(0).setDepth(-90);
    const t0 = performance.now();
    const centre = new THREE.Vector3(BERTH.x + 6, 0, BERTH.z + 34);
    world.onFrame = (dt) => {
      const time = (performance.now() - t0) / 1000;
      const a = time * 0.16;
      ship.x = centre.x + Math.cos(a) * 20;
      ship.z = centre.z + Math.sin(a) * 20;
      ship.heading = Math.atan2(-Math.sin(a), Math.cos(a));
      ship.speed = 4;
      ship.rudder = 0.4;
      ship.setFurl(0.8);
      sea.update(dt, centre.x, centre.z);
      ship.update(dt, (x, z) => sea.height(x, z), time);
      gulls.update(dt, ship.x, ship.z, time);
      clouds.update(dt, centre.x, centre.z, 2);
      map.update(time);
      world.followSun(centre);
      // the camera trails the ship from outside its circle and looks down past it, so the ship
      // sails across the open top of the screen above the title, with the cove behind
      const ca = a + 0.35;
      world.camera.position.set(centre.x + Math.cos(ca) * 78, 34, centre.z + Math.sin(ca) * 78);
      world.camera.lookAt(ship.x, -25, ship.z);
      // islands the camera passes over step aside (a palm right under the lens fills the screen)
      for (const i of map.islands) i.root.visible = Math.hypot(i.x - world.camera.position.x, i.z - world.camera.position.z) > i.r + 34;
    };
  },
  difficulty: true,
  // touch screens choose ARROWS | WHEEL | TILT for the helm under PLAY (the shared steering switch)
  menuOption: steeringOption,
  music: { play: 'stage2' },
  scenes: [PlayScene],
  strings: STRINGS,
});
