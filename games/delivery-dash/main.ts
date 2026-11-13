import Phaser from 'phaser';
import { launch, loadAudio, loadSfx, kenney, t, steeringOption, type GameMeta } from '@core';
import meta from './game.json';
import { PlayScene } from './PlayScene';
import { MapScene } from './mapui';
import { STRINGS } from './strings';
import { loadKit } from './kit';
import { View, keepPrograms } from './view';
import { Sim, NO_INPUT } from './sim';
import { Bot, SKILL } from './bot';
import { loadMeta } from './meta';
import { shift, rushShift } from './shifts';
import { handling, vehicle } from './defs';
import { makeArt, Pill, Badges } from './ui';

launch({
  meta: meta as GameMeta,
  background: '#1b2a44',
  physics: 'none',
  difficulty: true,
  // the STEERING switch (ARROWS | WHEEL | TILT) on touch screens, under the Easy/Normal switch
  menuOption: steeringOption,
  preload(scene) {
    const l = scene.load;
    loadKit(l);
    for (const icon of ['locked', 'star']) l.image('icon-' + icon, kenney(`game-icons/png/white/1x/${icon}.png`));
    const I = 'sfx-impact/audio/', U = 'sfx-interface/audio/', J = 'oga/junkala-sfx/general-sounds/', M = 'oga/junkala-sfx/movement/';
    loadAudio(l, 'engine', M + 'vehicles/sfx-vehicle-carloop1');
    loadAudio(l, 'brakeS', M + 'vehicles/sfx-vehicle-breaks');
    loadAudio(l, 'door', M + 'opening-doors/sfx-movement-dooropen2');
    loadAudio(l, 'hop', M + 'jumping-and-landing/sfx-movement-jump1');
    loadAudio(l, 'ping', J + 'interactions/sfx-sounds-interaction5');
    loadAudio(l, 'pickup', J + 'positive-sounds/sfx-sounds-powerup2');
    loadAudio(l, 'vipsting', J + 'fanfares/sfx-sounds-fanfare3');
    loadAudio(l, 'fanfare', J + 'fanfares/sfx-sounds-fanfare1');
    loadAudio(l, 'turbo', J + 'positive-sounds/sfx-sounds-powerup13');
    loadAudio(l, 'coin', J + 'coins/sfx-coin-double3');
    loadAudio(l, 'star', J + 'coins/sfx-coin-double4');
    loadAudio(l, 'error', J + 'negative-sounds/sfx-sounds-error3');
    loadAudio(l, 'cancel', J + 'negative-sounds/sfx-sounds-negative1');
    loadAudio(l, 'hey', J + 'negative-sounds/sfx-sounds-damage1');
    loadAudio(l, 'tick', J + 'menu-sounds/sfx-menu-move2');
    loadAudio(l, 'crash', 'oga/junkala-sfx/explosions/short/sfx-exp-short-soft6');
    loadAudio(l, 'thunder', 'oga/junkala-sfx/explosions/short/sfx-exp-short-soft2');
    loadSfx(l, 'crunch', I + 'impactmetal_heavy_002');
    loadSfx(l, 'scrape', I + 'impactmetal_light_001');
    loadSfx(l, 'thump', I + 'impactpunch_heavy_001');
    loadSfx(l, 'bumpS', I + 'impactsoft_medium_001');
    loadSfx(l, 'box', I + 'impactwood_light_002');
    loadSfx(l, 'glass', U + 'glass_003');
    loadSfx(l, 'slurp', U + 'pluck_001');
    loadSfx(l, 'whistle', U + 'confirmation_002');
  },
  menuDecor(scene) {
    makeArt(scene);
    // a live autopilot does deliveries in the chosen district behind the menu. Building it here
    // also compiles every shader the Play scene uses (keepPrograms), so the first Play frame
    // compiles none.
    const m = loadMeta();
    const def = { ...(m.mode === 'rush' ? rushShift() : shift(m.shift)), night: false, works: false, cars: 9, peds: 8 };
    const hand = handling(vehicle(m.vehicle), m.up);
    let seed = 3;
    const fresh = () => new Sim({ shift: def, rush: false, mode: 'normal', seed, hand, endless: true });
    let sim = fresh();
    const view = new View(scene, sim, { menu: true, vehicle: m.vehicle, paint: m.paint });
    let bot = new Bot(sim, SKILL.good, seed);
    const badges = new Badges(scene, view, false);
    scene.add.rectangle(0, 0, scene.scale.width, scene.scale.height, 0x0a1430, 0.42).setOrigin(0).setDepth(-60);
    let acc = 0;
    let warm = false;
    view.world.onFrame = (dt) => {
      acc += dt;
      while (acc > 1 / 30) {
        acc -= 1 / 30;
        sim.step(1 / 30, bot.input(1 / 30));
        for (const ev of sim.events) view.handle(ev, sim);
        sim.events.length = 0;
        if (sim.time > 180) {
          seed++;
          sim = fresh();
          bot = new Bot(sim, SKILL.good, seed);
          view.reset();
          view.snap(sim);
        }
      }
      view.sync(sim, dt);
      badges.sync(sim, dt);
      if (!warm) { warm = true; keepPrograms(view.world.renderer, view.world.scene, view.world.camera); }
    };
    void NO_INPUT;
    // the town map (shifts, Endless Rush, garage): a button at the top
    const btn = new Pill(scene, scene.scale.width / 2, 136, 460, 92, 0xff8a1a, () => open(), 28);
    btn.setDepth(10);
    const label = () => {
      const mm = loadMeta();
      btn.setLabels(mm.mode === 'rush' ? t('menuRush') : t('menuShift', { n: mm.shift, d: t('d' + shift(mm.shift).district) }), t('menuSub'));
    };
    label();
    const open = () => {
      if (!scene.scene.isActive()) return;
      scene.scene.pause();
      scene.scene.launch('Map', { from: scene.scene.key });
    };
    scene.events.on('map-closed', label);
    scene.input.keyboard?.on('keydown-M', open);
    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => scene.events.off('map-closed', label));
    scene.tweens.add({ targets: btn, scale: 1.03, duration: 900, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
  },
  scenes: [PlayScene, MapScene],
  strings: STRINGS,
});
