import { launch, loadAudio, loadSfx, kenney, type GameMeta } from '@core';
import meta from './game.json';
import { PlayScene } from './PlayScene';
import { menuOpened } from './setup';
import { STRINGS } from './strings';
import { loadKit } from './kit';
import { View, keepPrograms } from './view';
import { Sim, NO_INPUT } from './sim';
import { Bot, SKILL } from './bot';
import { loadMeta } from './meta';
import { park } from './parks';
import { makeIcons } from './art';

launch({
  meta: meta as GameMeta,
  background: '#0d1a2e',
  physics: 'none',
  difficulty: true,
  preload(scene) {
    const l = scene.load;
    loadKit(l);
    for (const icon of ['checkmark', 'locked', 'arrowleft', 'arrowright']) l.image('icon-' + icon, kenney(`game-icons/png/white/1x/${icon}.png`));
    const I = 'sfx-impact/audio/', F = 'sfx-foley/audio/', J = 'oga/junkala-sfx/';
    loadSfx(l, 'roll-src', F + 'rocks/stonedrag3');
    loadSfx(l, 'ledge-src', F + 'rocks/stonedrag1');
    loadSfx(l, 'grind-src', F + 'swords/swordslide1');
    loadSfx(l, 'whoosh1', F + 'woosh/woosh2');
    loadSfx(l, 'whoosh2', F + 'woosh/woosh7');
    loadSfx(l, 'whoosh4', F + 'woosh/woosh4');
    loadSfx(l, 'grab', F + 'woosh/woosh6');
    loadSfx(l, 'clank', F + 'plating/plateshit4');
    loadSfx(l, 'ledgeHit', F + 'rocks/stonehit2');
    loadSfx(l, 'pop', I + 'impactplank_medium_001');
    loadSfx(l, 'flick', I + 'impactwood_light_002');
    loadSfx(l, 'land', I + 'impactwood_heavy_001');
    loadSfx(l, 'land2', I + 'impactwood_heavy_003');
    loadSfx(l, 'land3', I + 'impactwood_medium_002');
    loadSfx(l, 'landWood', I + 'impactplank_medium_003');
    loadSfx(l, 'landWood2', I + 'impactplank_medium_000');
    loadSfx(l, 'landWood3', I + 'impactwood_heavy_004');
    loadSfx(l, 'landMetal', I + 'impactmetal_light_002');
    loadSfx(l, 'thud', I + 'impactsoft_heavy_002');
    loadSfx(l, 'thud2', I + 'impactpunch_medium_002');
    loadSfx(l, 'scrape', F + 'plating/platesslide3');
    loadSfx(l, 'push', I + 'footstep_concrete_002');
    loadSfx(l, 'crash', I + 'impactpunch_heavy_001');
    loadSfx(l, 'wall', I + 'impactsoft_medium_001');
    loadAudio(l, 'bail', J + 'general-sounds/simple-damage-sounds/sfx-damage-hit2');
    loadAudio(l, 'trick', J + 'general-sounds/simple-bleeps/sfx-sounds-blip3');
    loadAudio(l, 'tick', J + 'general-sounds/menu-sounds/sfx-menu-move2');
    loadAudio(l, 'combo', J + 'general-sounds/coins/sfx-coin-double3');
    loadAudio(l, 'perfect', J + 'general-sounds/coins/sfx-coin-single3');
    loadAudio(l, 'comboBig', J + 'general-sounds/coins/sfx-coin-cluster5');
    loadAudio(l, 'tape', J + 'general-sounds/positive-sounds/sfx-sounds-powerup2');
    loadAudio(l, 'goal', J + 'general-sounds/fanfares/sfx-sounds-fanfare2');
    loadAudio(l, 'unlock', J + 'general-sounds/fanfares/sfx-sounds-fanfare1');
    loadAudio(l, 'specialReady', J + 'general-sounds/positive-sounds/sfx-sounds-powerup13');
    loadAudio(l, 'specialGo', J + 'general-sounds/weird-sounds/sfx-sound-bling');
    loadAudio(l, 'horn', J + 'general-sounds/weird-sounds/sfx-sound-refereewhistle');
    loadAudio(l, 'whistle', J + 'general-sounds/weird-sounds/sfx-sound-refereewhistle');
    loadAudio(l, 'error', J + 'general-sounds/negative-sounds/sfx-sounds-error3');
  },
  menuDecor(scene) {
    makeIcons(scene);
    // PLAY (or Enter) from here opens the session setup in the Play scene
    menuOpened();
    // a live autopilot skates the chosen park behind the menu. Building it here also compiles
    // every shader the Play scene uses (keepPrograms), so the first Play frame compiles none.
    const m = loadMeta();
    const view = new View(scene, m.park, { board: m.board, menu: true });
    view.camDist = 1.25;
    view.menuShift = 0.35;
    let seed = 21;
    let sim = new Sim(park(m.park), 'easy', seed);
    let bot = new Bot(sim, SKILL.good, seed);
    scene.add.rectangle(0, 0, scene.scale.width, scene.scale.height, 0x060a18, 0.38).setOrigin(0).setDepth(-90);
    let acc = 0;
    let warm = false;
    view.world.onFrame = (dt) => {
      acc += dt;
      while (acc > 1 / 60) {
        acc -= 1 / 60;
        sim.step(1 / 60, sim.over ? NO_INPUT : bot.input(1 / 60));
        for (const ev of sim.events) view.handle(ev, sim);
        sim.events.length = 0;
        if (sim.over || sim.time > 70) {
          seed++;
          sim = new Sim(park(m.park), 'easy', seed);
          bot = new Bot(sim, SKILL.good, seed);
          view.reset();
        }
      }
      view.sync(sim, dt);
      if (!warm) { warm = true; keepPrograms(view.world.renderer, view.world.scene, view.world.camera); }
    };
  },
  scenes: [PlayScene],
  strings: STRINGS,
});
