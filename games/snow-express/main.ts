import Phaser from 'phaser';
import { launch, loadAudio, loadSfx, kenney, t, type GameMeta } from '@core';
import meta from './game.json';
import { PlayScene } from './PlayScene';
import { MapScene } from './mapui';
import { STRINGS } from './strings';
import { loadKit } from './kit';
import { View, keepPrograms } from './view';
import { Sim, NO_INPUT } from './sim';
import { Bot, SKILL } from './bot';
import { loadMeta } from './meta';
import { level, RUSH, timetable } from './levels';
import { makeArt, Overlay, Pill } from './ui';

launch({
  meta: meta as GameMeta,
  background: '#16234a',
  physics: 'none',
  difficulty: true,
  music: { play: 'select' },
  preload(scene) {
    const l = scene.load;
    loadKit(l);
    for (const icon of ['locked', 'star']) l.image('icon-' + icon, kenney(`game-icons/png/white/1x/${icon}.png`));
    const I = 'sfx-impact/audio/', U = 'sfx-interface/audio/', J = 'oga/junkala-sfx/general-sounds/';
    loadSfx(l, 'flip', U + 'switch_002');
    loadSfx(l, 'signal', U + 'toggle_002');
    loadSfx(l, 'clack', I + 'impactmetal_light_001');
    loadSfx(l, 'clack2', I + 'impactmetal_light_003');
    loadSfx(l, 'bonk', I + 'impactwood_medium_001');
    loadSfx(l, 'ding', I + 'impactbell_heavy_001');
    loadSfx(l, 'snow', I + 'footstep_snow_002');
    loadSfx(l, 'snow2', I + 'footstep_snow_004');
    loadSfx(l, 'thump', I + 'impactpunch_heavy_001');
    loadSfx(l, 'glass', U + 'glass_003');
    loadAudio(l, 'coin', J + 'coins/sfx-coin-double3');
    loadAudio(l, 'star', J + 'coins/sfx-coin-double4');
    loadAudio(l, 'combo', J + 'coins/sfx-coin-cluster5');
    loadAudio(l, 'power', J + 'positive-sounds/sfx-sounds-powerup13');
    loadAudio(l, 'cocoa', J + 'pause-sounds/sfx-sounds-pause3-in');
    loadAudio(l, 'cocoaOut', J + 'pause-sounds/sfx-sounds-pause3-out');
    loadAudio(l, 'globe', J + 'weird-sounds/sfx-sound-bling');
    loadAudio(l, 'heart', J + 'negative-sounds/sfx-sounds-damage1');
    loadAudio(l, 'error', J + 'negative-sounds/sfx-sounds-error3');
    loadAudio(l, 'tick', J + 'menu-sounds/sfx-menu-move2');
    loadAudio(l, 'crash', 'oga/junkala-sfx/explosions/short/sfx-exp-short-soft6');
    loadAudio(l, 'crash2', 'oga/junkala-sfx/explosions/short/sfx-exp-short-hard4');
  },
  menuDecor(scene) {
    makeArt(scene);
    // a live autopilot runs the chosen board behind the menu. Building it here also compiles every
    // shader the Play scene uses (keepPrograms), so the first Play frame compiles none.
    const m = loadMeta();
    const def = m.mode === 'rush' ? RUSH[m.rushRuns % RUSH.length] : level(m.level);
    const view = new View(scene, def, { menu: true, evening: m.mode === 'rush' ? 0.55 : undefined });
    view.menuShift = 0.1;
    let seed = 3;
    const fresh = () => new Sim({ map: def, mode: 'easy', seed, spawns: m.mode === 'rush' ? null : timetable(def, 'normal', seed).map((s) => ({ ...s, t: s.t * 0.7 })), speed: def.spec.speed });
    let sim = fresh();
    let bot = new Bot(sim, SKILL.good, seed);
    const overlay = new Overlay(scene, view, false);
    scene.add.rectangle(0, 0, scene.scale.width, scene.scale.height, 0x0a1230, 0.4).setOrigin(0).setDepth(-60);
    let acc = 0;
    let warm = false;
    view.world.onFrame = (dt) => {
      acc += dt;
      while (acc > 1 / 30) {
        acc -= 1 / 30;
        sim.step(1 / 30, sim.over ? NO_INPUT : bot.input(1 / 30));
        for (const ev of sim.events) view.handle(ev, sim);
        sim.events.length = 0;
        if (sim.over || sim.time > 150) {
          seed++;
          sim = fresh();
          bot = new Bot(sim, SKILL.good, seed);
          view.reset();
        }
      }
      view.sync(sim, dt);
      overlay.sync(sim, dt);
      if (!warm) { warm = true; keepPrograms(view.world.renderer, view.world.scene, view.world.camera); }
    };
  },
  // the Journey map (levels by chapter, Holiday Rush): a button under the difficulty switch
  menuOption: {
    build(scene, x, y) {
      const btn = new Pill(scene, x, y + 6, 380, 86, 0x2f7fd8, () => open(), 26);
      const label = () => {
        const mm = loadMeta();
        btn.setLabels(mm.mode === 'rush' ? t('menuRush') : t('menuJourney', { n: mm.level }), t('menuSub'));
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
  },
  scenes: [PlayScene, MapScene],
  strings: STRINGS,
});
