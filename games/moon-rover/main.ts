import Phaser from 'phaser';
import { launch, loadAudio, loadSfx, steeringOption, type GameMeta } from '@core';
import meta from './game.json';
import { PlayScene, lastRunCredits } from './PlayScene';
import { STRINGS } from './strings';
import { loadKit } from './kit';
import { BASE_THEME } from './menu';
import { View } from './view';
import { Sim } from './sim';
import { Bot } from './bot';
import { buildLevel } from './levels';
import { DT, noRanks } from './defs';
import { loadMeta } from './meta';

/** The mission the menu's backdrop drives (the autopilot, god mode on). */
const MENU_LEVEL = 2;

launch({
  meta: meta as GameMeta,
  background: '#05070e',
  physics: 'none',
  difficulty: true,
  menuOption: steeringOption,
  music: { menu: { file: 'music/owner/regolith-drift.mp3', gain: 1.85 }, play: { file: 'music/owner/regolith-drift.mp3', gain: 1.85 } },
  // the pad: the stick steers (and up / down are GAS / BRAKE), RT gas, LT brake, A uses the power
  gamepad: { rt: 'ArrowUp', lt: 'ArrowDown' },
  preload(scene) {
    const l = scene.load;
    loadKit(l);
    const J = 'oga/junkala-sfx/';
    // the rover
    loadAudio(l, 'engine', J + 'movement/vehicles/sfx-vehicle-engineloop');
    loadAudio(l, 'jump', J + 'movement/jumping-and-landing/sfx-movement-jump9');
    loadAudio(l, 'land', J + 'movement/jumping-and-landing/sfx-movement-jump12-landing');
    loadAudio(l, 'landBig', J + 'explosions/shortest/sfx-exp-shortest-soft2');
    loadAudio(l, 'bump', J + 'general-sounds/impacts/sfx-sounds-impact3');
    loadAudio(l, 'crash', J + 'explosions/short/sfx-exp-short-hard3');
    loadAudio(l, 'fall', J + 'movement/falling-sounds/sfx-sounds-falling3');
    loadAudio(l, 'hurt', J + 'general-sounds/negative-sounds/sfx-sounds-damage1');
    loadAudio(l, 'lose', J + 'general-sounds/negative-sounds/sfx-sounds-negative2');
    loadAudio(l, 'powerDown', J + 'general-sounds/weird-sounds/sfx-sound-shutdown1');
    loadAudio(l, 'alarm', J + 'general-sounds/alarms/low-health-alarms/sfx-lowhealth-alarmloop1');
    loadAudio(l, 'tow', J + 'movement/portals-and-transitions/sfx-movement-portal3');
    loadAudio(l, 'respawn', J + 'movement/portals-and-transitions/sfx-movement-portal2');
    loadAudio(l, 'charge', J + 'general-sounds/weird-sounds/sfx-sound-poweron');
    loadAudio(l, 'perfect', J + 'general-sounds/positive-sounds/sfx-sounds-powerup2');
    // the mission
    loadAudio(l, 'crystal', J + 'general-sounds/coins/sfx-coin-double2');
    loadAudio(l, 'hey', J + 'general-sounds/interactions/sfx-sounds-interaction5');
    loadAudio(l, 'board', J + 'general-sounds/positive-sounds/sfx-sounds-powerup9');
    loadAudio(l, 'rescue', J + 'general-sounds/positive-sounds/sfx-sounds-powerup4');
    loadAudio(l, 'deliver', J + 'general-sounds/coins/sfx-coin-cluster3');
    loadAudio(l, 'checkpoint', J + 'general-sounds/interactions/sfx-sounds-interaction10');
    loadAudio(l, 'alien', J + 'general-sounds/fanfares/sfx-sounds-fanfare1');
    loadAudio(l, 'genOff', J + 'general-sounds/weird-sounds/sfx-sound-shutdown2');
    loadAudio(l, 'sting', J + 'general-sounds/fanfares/sfx-sounds-fanfare3');
    loadAudio(l, 'fanfare', J + 'general-sounds/fanfares/sfx-sounds-fanfare2');
    loadAudio(l, 'rocket', J + 'explosions/long/sfx-exp-long3');
    loadAudio(l, 'star', J + 'general-sounds/positive-sounds/sfx-sounds-powerup4');
    // hazards
    loadAudio(l, 'whistle', J + 'weapons/grenade-whistles/sfx-wpn-grenadewhistle1');
    loadAudio(l, 'boom', J + 'explosions/medium-length/sfx-exp-medium3');
    loadAudio(l, 'laser', J + 'weapons/lasers/sfx-wpn-laser8');
    loadAudio(l, 'tcharge', J + 'general-sounds/weird-sounds/sfx-sound-vaporizing');
    loadAudio(l, 'horn', J + 'general-sounds/alarms/alarms/sfx-alarm-loop3');
    loadAudio(l, 'storm', J + 'general-sounds/weird-sounds/sfx-sound-depressurizing');
    loadSfx(l, 'zap', 'sfx-sci-fi/audio/laserretro_000');
    // powers
    loadAudio(l, 'power', J + 'general-sounds/positive-sounds/sfx-sounds-powerup12');
    loadAudio(l, 'boost', J + 'movement/portals-and-transitions/sfx-movement-portal5');
    loadSfx(l, 'shield', 'sfx-sci-fi/audio/forcefield_000');
    loadSfx(l, 'shieldHit', 'sfx-sci-fi/audio/impactmetal_001');
    loadAudio(l, 'hover', J + 'movement/portals-and-transitions/sfx-movement-portal6');
    loadAudio(l, 'magnet', J + 'general-sounds/positive-sounds/sfx-sounds-powerup16');
    loadSfx(l, 'emp', 'sfx-sci-fi/audio/lowfrequency_explosion_000');
    // screens
    loadAudio(l, 'deny', J + 'general-sounds/negative-sounds/sfx-sounds-error1');
    loadAudio(l, 'move', J + 'general-sounds/menu-sounds/sfx-menu-move2');
    loadAudio(l, 'start', J + 'general-sounds/menu-sounds/sfx-menu-select2');
    loadAudio(l, 'go', J + 'general-sounds/positive-sounds/sfx-sounds-powerup4');
    loadAudio(l, 'buy', J + 'general-sounds/coins/sfx-coin-cluster5');
  },
  menuDecor(scene) {
    // behind the menu: the autopilot driving the Crater Hop, the chase camera after it
    const view = new View(scene, { quality: 0.8 });
    view.setSkin(loadMeta().skin);
    let sim: Sim, bot: Bot;
    const fresh = () => {
      sim = new Sim(buildLevel(MENU_LEVEL), noRanks(), false);
      sim.god = true;
      bot = new Bot(sim);
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
        if (sim.rover.state === 'clear' || sim.clock > 140) fresh();
      }
      if (n >= 4) acc = 0;
      view.sync(sim, dt);
    };
    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => view.dispose());
  },
  menuTheme: BASE_THEME,
  // a lost run may go on once after a rewarded ad (full hearts and battery at the last checkpoint);
  // the credits of a run may be doubled
  ads: {
    continue: (play) => (play as PlayScene).revive(),
    canContinue: (play) => (play as PlayScene).canContinue(),
    double: { grant: (play) => (play as PlayScene).doubleCredits(), show: () => lastRunCredits() > 0 },
  },
  scenes: [PlayScene],
  strings: STRINGS,
});
