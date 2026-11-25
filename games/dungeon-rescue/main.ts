import Phaser from 'phaser';
import { launch, loadAudio, loadSfx, type GameMeta } from '@core';
import meta from './game.json';
import { PlayScene, lastRunCoins } from './PlayScene';
import { STRINGS } from './strings';
import { loadKit } from './kit';
import { KEEP_THEME } from './menu';
import { View } from './view';
import { Sim } from './sim';
import { Bot } from './bot';
import { buildLevel, castOf } from './levels';
import { DT, noRanks } from './defs';
import { loadMeta } from './meta';

/** The level the menu's backdrop plays (its figures load under the intro). */
const MENU_LEVEL = 2;

launch({
  meta: meta as GameMeta,
  background: '#0d0b10',
  physics: 'none',
  difficulty: true,
  music: { menu: 'select', play: 'stage2' },
  // the pad: A acts, LB throws (held to aim), Y uses a power (K), X calls the crew (J), B or RT sprints
  gamepad: { b: 'ShiftLeft', rt: 'ShiftLeft' },
  preload(scene) {
    const l = scene.load;
    loadKit(l, [...new Set([...castOf(MENU_LEVEL), 'knight', loadMeta().look, 'soldier'])]);
    const J = 'oga/junkala-sfx/';
    // the knight
    loadSfx(l, 'step', 'sfx-impact/audio/footstep_concrete_001');
    loadSfx(l, 'clank', 'sfx-impact/audio/impactmetal_light_001');
    loadSfx(l, 'whoosh', 'sfx-foley/audio/woosh/woosh4');
    loadSfx(l, 'hide', 'sfx-impact/audio/impactwood_medium_003');
    loadSfx(l, 'grab', 'sfx-impact/audio/impactwood_light_002');
    loadAudio(l, 'hurt', J + 'general-sounds/negative-sounds/sfx-sounds-damage1');
    loadAudio(l, 'fall', J + 'movement/falling-sounds/sfx-sounds-falling3');
    loadAudio(l, 'respawn', J + 'movement/portals-and-transitions/sfx-movement-portal2');
    loadAudio(l, 'lose', J + 'general-sounds/negative-sounds/sfx-sounds-negative2');
    loadAudio(l, 'caught', J + 'general-sounds/negative-sounds/sfx-sounds-negative1');
    // guards
    loadAudio(l, 'huh', J + 'general-sounds/interactions/sfx-sounds-interaction5');
    loadAudio(l, 'alert', J + 'general-sounds/alarms/low-health-alarms/sfx-lowhealth-alarmloop1');
    loadAudio(l, 'shout', J + 'general-sounds/negative-sounds/sfx-sounds-error3');
    loadAudio(l, 'slam', J + 'explosions/short/sfx-exp-short-soft6');
    loadAudio(l, 'sting', J + 'general-sounds/fanfares/sfx-sounds-fanfare3');
    // things
    loadAudio(l, 'coin', J + 'general-sounds/coins/sfx-coin-single2');
    loadAudio(l, 'coins', J + 'general-sounds/coins/sfx-coin-cluster3');
    loadAudio(l, 'keys', J + 'general-sounds/coins/sfx-coin-double5');
    loadAudio(l, 'unlock', J + 'movement/opening-doors/sfx-movement-dooropen1');
    loadAudio(l, 'door', J + 'movement/opening-doors/sfx-movement-dooropen3');
    loadSfx(l, 'gate', 'sfx-foley/audio/plating/platesslide3');
    loadAudio(l, 'tick', J + 'general-sounds/simple-bleeps/sfx-sounds-blip4');
    loadSfx(l, 'lever', 'sfx-impact/audio/impactmetal_medium_001');
    loadSfx(l, 'puff', 'sfx-foley/audio/woosh/woosh2');
    loadSfx(l, 'smash', 'sfx-impact/audio/impactglass_medium_001');
    loadSfx(l, 'thud', 'sfx-impact/audio/impactwood_heavy_002');
    loadSfx(l, 'spikes', 'sfx-impact/audio/impactmetal_heavy_002');
    loadSfx(l, 'creak', 'sfx-impact/audio/impactwood_light_004');
    loadSfx(l, 'trapdoor', 'sfx-impact/audio/impactwood_medium_001');
    loadSfx(l, 'rattle', 'sfx-impact/audio/impacttin_medium_002');
    loadSfx(l, 'ignite', 'sfx-foley/audio/woosh/woosh6');
    loadSfx(l, 'bell', 'sfx-impact/audio/impactbell_heavy_001');
    loadAudio(l, 'alarm', J + 'general-sounds/alarms/alarms/sfx-alarm-loop2');
    // powers
    loadAudio(l, 'power', J + 'general-sounds/positive-sounds/sfx-sounds-powerup12');
    loadAudio(l, 'smoke', J + 'explosions/shortest/sfx-exp-shortest-soft3');
    loadAudio(l, 'powder', J + 'general-sounds/positive-sounds/sfx-sounds-powerup16');
    loadAudio(l, 'moo', J + 'general-sounds/weird-sounds/sfx-sound-nagger1');
    // rescues
    loadAudio(l, 'cheer', J + 'general-sounds/positive-sounds/sfx-sounds-powerup9');
    loadAudio(l, 'fanfare', J + 'general-sounds/fanfares/sfx-sounds-fanfare2');
    loadAudio(l, 'star', J + 'general-sounds/positive-sounds/sfx-sounds-powerup4');
    // screens
    loadAudio(l, 'deny', J + 'general-sounds/negative-sounds/sfx-sounds-error1');
    loadAudio(l, 'move', J + 'general-sounds/menu-sounds/sfx-menu-move2');
    loadAudio(l, 'start', J + 'general-sounds/menu-sounds/sfx-menu-select2');
    loadAudio(l, 'go', J + 'general-sounds/positive-sounds/sfx-sounds-powerup4');
    loadAudio(l, 'buy', J + 'general-sounds/coins/sfx-coin-cluster5');
  },
  menuDecor(scene) {
    // behind the menu: the autopilot sneaking through the Lock Picks cellblock, the camera following it
    const view = new View(scene, { quality: 0.8 });
    view.heroLook = loadMeta().look;
    let sim: Sim, bot: Bot;
    const fresh = () => {
      sim = new Sim(buildLevel(MENU_LEVEL), noRanks(), false);
      sim.god = true;
      bot = new Bot(sim);
      bot.patience = 0.4;
      view.build(sim);
      view.snap(sim);
    };
    fresh();
    view.warm();
    let acc = 0;
    view.world.onFrame = (dt) => {
      acc += dt;
      let n = 0;
      while (acc > DT && n < 4) {
        acc -= DT; n++;
        sim.step(DT, bot.input());
        sim.events.length = 0;
        if (sim.hero.state === 'clear' || sim.clock > 110) fresh();
      }
      if (n >= 4) acc = 0;
      view.sync(sim, dt);
    };
    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => view.dispose());
  },
  menuTheme: KEEP_THEME,
  // a lost run may go on once after a rewarded ad (full hearts at the last campfire); the run's
  // coins may be doubled
  ads: {
    continue: (play) => (play as PlayScene).revive(),
    canContinue: (play) => (play as PlayScene).canContinue(),
    double: { grant: (play) => (play as PlayScene).doubleCoins(), show: () => lastRunCoins() > 0 },
  },
  scenes: [PlayScene],
  strings: STRINGS,
});
