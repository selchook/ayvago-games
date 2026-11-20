import Phaser from 'phaser';
import { launch, asset, loadAudio, loadSfx, steeringOption, type GameMeta } from '@core';
import { loadModel, model } from '@core/three';
import meta from './game.json';
import { PlayScene, clearRetry, lastBanked, prebakeCallouts } from './PlayScene';
import { MapScene } from './mapui';
import { STRINGS } from './strings';
import { HEAT_THEME } from './theme';
import { View } from './view';
import { Sim } from './sim';
import { TUNING } from './defs';
import { adoptPack, loadCity } from './kit';
import { city } from './city';
import { loadMeta } from './meta';
import { makeIcons } from './hud';
import { prebakeScreens } from './screens';

launch({
  meta: meta as GameMeta,
  background: '#0b0d1f',
  physics: 'none',
  difficulty: true,
  // the STEERING switch (ARROWS | WHEEL | TILT) on touch screens, beside PLAY under Easy/Normal
  menuOption: steeringOption,
  music: { play: 'stage2' },
  // the pad keeps the core's keys: the triggers are also read as analogue gas and brake
  // (PlayScene.readInput), A (Space) is the handbrake, X (J) and RB (E) nitro, B (X) and LB (Q)
  // the horn, Y (K) the camera, Back (M) the map
  preload(scene) {
    const l = scene.load;
    // the cars come under the Ayvago intro (the menu shows one); the city loads after the menu is up
    loadModel(l, 'sh-cars', asset('quaternius/city-cars/cars.glb'));
    const J = 'oga/junkala-sfx/', G = J + 'general-sounds/', I = 'sfx-impact/audio/';
    loadAudio(l, 'engine', J + 'movement/vehicles/sfx-vehicle-carloop1');
    loadAudio(l, 'nitro', J + 'movement/portals-and-transitions/sfx-movement-portal3');
    loadAudio(l, 'crash', J + 'explosions/shortest/sfx-exp-shortest-soft2');
    loadAudio(l, 'crashBig', J + 'explosions/short/sfx-exp-short-soft6');
    loadAudio(l, 'explode', J + 'explosions/medium-length/sfx-exp-medium3');
    loadAudio(l, 'land', J + 'movement/jumping-and-landing/sfx-movement-jump12-landing');
    loadAudio(l, 'pickup', G + 'positive-sounds/sfx-sounds-powerup2');
    loadAudio(l, 'deliver', G + 'coins/sfx-coin-cluster3');
    loadAudio(l, 'cash', G + 'coins/sfx-coin-double2');
    loadAudio(l, 'check', G + 'interactions/sfx-sounds-interaction5');
    loadAudio(l, 'star', G + 'coins/sfx-coin-double4');
    loadAudio(l, 'alarm', G + 'negative-sounds/sfx-sounds-negative1');
    loadAudio(l, 'busted', G + 'negative-sounds/sfx-sounds-negative2');
    loadAudio(l, 'lose', G + 'negative-sounds/sfx-sounds-error3');
    loadAudio(l, 'deny', G + 'negative-sounds/sfx-sounds-error2');
    loadAudio(l, 'lostThem', G + 'fanfares/sfx-sounds-fanfare3');
    loadAudio(l, 'fanfare', G + 'fanfares/sfx-sounds-fanfare1');
    loadAudio(l, 'go', G + 'menu-sounds/sfx-menu-select2');
    loadAudio(l, 'tick', G + 'simple-bleeps/sfx-sounds-blip3');
    loadAudio(l, 'blip', G + 'simple-bleeps/sfx-sounds-blip2');
    loadAudio(l, 'hey', G + 'negative-sounds/sfx-sounds-damage1');
    loadAudio(l, 'pop', J + 'explosions/shortest/sfx-exp-shortest-soft5');
    loadAudio(l, 'sh-buy', G + 'coins/sfx-coin-cluster5');
    loadAudio(l, 'sh-deny', G + 'negative-sounds/sfx-sounds-error1');
    loadAudio(l, 'sh-spray', G + 'weird-sounds/sfx-sound-vaporizing');
    loadAudio(l, 'spray', G + 'weird-sounds/sfx-sound-vaporizing');
    loadSfx(l, 'crunch', I + 'impactmetal_heavy_002');
    loadSfx(l, 'scrape', I + 'impactmetal_light_001');
    loadSfx(l, 'thump', I + 'impactpunch_heavy_001');
    loadSfx(l, 'clonk', I + 'impactplate_light_001');
    loadSfx(l, 'bin', I + 'impactmetal_light_003');
    loadSfx(l, 'glass', 'sfx-interface/audio/glass_003');
  },
  menuDecor(scene) {
    clearRetry();
    makeIcons(scene);
    // a live street corner downtown behind the menu: the player's car under a lamp, traffic and
    // a patrol going by; the buildings appear as the city arrives (loaded after the menu is up)
    adoptPack('cars', model('sh-cars', { shadows: false }));
    const m = loadMeta();
    const c = city();
    // a parking spot on the avenue by the plaza, the car facing north
    const spot = { ...c.places.get('bank')!, x: 4 * 64 + 5.6, z: 150, h: Math.PI };
    const sim = new Sim({ car: m.car, up: m.up, paint: m.paint, tune: { ...TUNING.normal, traffic: 18 }, seed: 7, start: spot, night: 1 });
    sim.frozen = true;
    const view = new View(scene, { menu: true, night: 1, radius: 150 });
    scene.time.delayedCall(200, () => void loadCity());
    let acc = 0;
    view.world.onFrame = (dt) => {
      acc += dt;
      let n = 0;
      while (acc > 1 / 30 && n < 3) { acc -= 1 / 30; n++; sim.step(1 / 30, { steer: 0, gas: 0, brake: 0, handbrake: false, nitro: false, horn: false, hold: true }); sim.events.length = 0; }
      if (n >= 3) acc = 0;
      for (const car of sim.cars) if (car.role === 'cop') car.siren = true;
      view.buildStep(1);
      view.sync(sim, null, dt);
    };
    void Phaser;
  },
  // neon tubes on smoked glass, case files, a chrome frame with police lights in the corners (theme.ts)
  menuTheme: { ...HEAT_THEME, prebake: (scene) => { prebakeScreens(scene); prebakeCallouts(scene); } },
  // a busted or wrecked run may go on once after a rewarded ad; the run's cash may be doubled
  ads: {
    continue: (play) => (play as PlayScene).revive(),
    canContinue: (play) => (play as PlayScene).canContinue(),
    double: { grant: (scene) => (scene.scene.get('Play') as PlayScene).doubleCash(), show: () => lastBanked() > 0 },
  },
  scenes: [PlayScene, MapScene],
  strings: STRINGS,
});
