import { launch, loadAudio, loadSfx, type GameMeta } from '@core';
import { World3D, THREE, loadKenney3d } from '@core/three';
import meta from './game.json';
import { PlayScene } from './PlayScene';
import { STRINGS } from './strings';
import { MODELS, parseHole } from './kit';
import { makeMovers } from './movers';
import { HOLES } from './holes';
import { THEMES, DECOR_MODELS, buildHole3D, dressWorld, addClouds } from './course3d';
import { makeSounds } from './sounds';

launch({
  meta: meta as GameMeta,
  background: '#4aa8f0',
  physics: 'none',
  difficulty: true,
  preload(scene) {
    const l = scene.load;
    for (const name of MODELS) loadKenney3d(l, 'mg:' + name, 'minigolf-kit', name);
    for (const name of DECOR_MODELS) loadKenney3d(l, name, 'nature-kit', name);
    const I = 'sfx-impact/audio/';
    loadSfx(l, 'putt', I + 'impactglass_light_002');
    loadSfx(l, 'clack', I + 'impactwood_light_001');
    loadSfx(l, 'thud', I + 'impactsoft_medium_001');
    loadSfx(l, 'bonk', I + 'impactplank_medium_000');
    loadSfx(l, 'cup', I + 'impacttin_medium_001');
    loadSfx(l, 'lip', I + 'impactmetal_light_002');
    loadSfx(l, 'plop', 'sfx-interface/audio/drop_002');
    loadSfx(l, 'tick', 'sfx-interface/audio/tick_002');
    loadSfx(l, 'whoosh', 'sfx-interface/audio/maximize_003');
    const J = 'oga/junkala-sfx/';
    loadAudio(l, 'fanfare', J + 'general-sounds/fanfares/sfx-sounds-fanfare3');
    loadAudio(l, 'birdie', J + 'general-sounds/coins/sfx-coin-double2');
    loadAudio(l, 'par', J + 'general-sounds/coins/sfx-coin-single2');
    loadAudio(l, 'bogey', J + 'general-sounds/neutral-sounds/sfx-sound-neutral2');
    loadAudio(l, 'penalty', J + 'general-sounds/negative-sounds/sfx-sounds-negative1');
    loadAudio(l, 'splash', J + 'explosions/shortest/sfx-exp-shortest-soft2');
    loadAudio(l, 'respawn', J + 'movement/portals-and-transitions/sfx-movement-portal1');
  },
  menuDecor(scene) {
    makeSounds(scene.game);
    // a slow fly-over of the windmill hole behind the menu
    const def = HOLES.find((h) => h.map.some((r) => r.includes('wm'))) ?? HOLES[0];
    const p = parseHole(def);
    const movers = makeMovers(p, def.movers, def.windmill);
    const world = new World3D(scene, { fov: 50, near: 0.03, far: 120 });
    const sun = world.addLights({ ambient: 1.55, intensity: 2.4, extent: 7 });
    const th = THEMES.meadow;
    dressWorld(world.scene, th);
    sun.color.setHex(th.sun);
    const h = buildHole3D(world.scene, def, p, th, movers, 6);
    addClouds(world.scene, h.center);
    world.followSun(h.center);
    // a dim veil keeps the menu text readable
    scene.add.rectangle(0, 0, scene.scale.width, scene.scale.height, 0x0b1430, 0.32).setOrigin(0).setDepth(-90);
    const t0 = performance.now();
    world.onFrame = () => {
      const time = (performance.now() - t0) / 1000;
      for (const m of movers) m.update(time);
      for (const s of h.sails) s.pivot.rotation.z = s.mover.angle;
      // circle the hole high enough to clear the trees around it
      const a = time * 0.09 + 0.6;
      const r = h.radius + 2.2;
      world.camera.position.set(h.center.x + Math.sin(a) * r, h.radius * 1.1 + 2.6 + Math.sin(time * 0.3) * 0.2, h.center.z + Math.cos(a) * r);
      world.camera.lookAt(h.center.x, 0, h.center.z);
      for (const o of h.decor) o.visible = Math.hypot(o.position.x - world.camera.position.x, o.position.z - world.camera.position.z) > 2.2 + o.scale.x * 0.5;
    };
    void THREE;
  },
  scenes: [PlayScene],
  strings: STRINGS,
});
