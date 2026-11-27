import Phaser from 'phaser';
import { launch, loadAudio, loadSfx, type GameMeta } from '@core';
import meta from './game.json';
import { PlayScene, lastRunCredits } from './PlayScene';
import { STRINGS } from './strings';
import { loadKit } from './kit';
import { LAB_THEME } from './menu';
import { View } from './view';
import { Sim } from './sim';
import { Bot } from './bot';
import { buildLevel } from './levels';
import { DT, noRanks } from './defs';
import { loadMeta } from './meta';

/** The level the menu's backdrop plays (the autopilot, god mode on). */
const MENU_LEVEL = 2;

launch({
  meta: meta as GameMeta,
  background: '#0a0e18',
  physics: 'none',
  difficulty: true,
  music: { menu: 'select', play: 'stage1' },
  // the pad: A stuns, B tows (X), X stuns (J), Y tows (K), LB uses the power (Q), RB tows (E), LT
  // sprints (L), RT stuns (Z): all from the core's table
  preload(scene) {
    const l = scene.load;
    loadKit(l);
    const J = 'oga/junkala-sfx/';
    // the mech
    loadAudio(l, 'shot', J + 'weapons/lasers/sfx-wpn-laser4');
    loadAudio(l, 'shotBig', J + 'weapons/lasers/sfx-wpn-laser10');
    loadAudio(l, 'shotL', J + 'weapons/lasers/sfx-wpn-laser1');
    loadAudio(l, 'lance', J + 'weapons/lasers/sfx-wpn-laser12');
    loadAudio(l, 'shotS', J + 'weapons/shotgun/sfx-weapon-shotgun1');
    loadAudio(l, 'pulse', J + 'explosions/short/sfx-exp-short-soft5');
    loadAudio(l, 'shotM', J + 'weapons/cannon/sfx-wpn-cannon1');
    loadAudio(l, 'splash', J + 'explosions/shortest/sfx-exp-shortest-soft4');
    loadAudio(l, 'shell', J + 'weapons/cannon/sfx-wpn-cannon4');
    loadAudio(l, 'shellHit', J + 'explosions/short/sfx-exp-short-hard3');
    loadAudio(l, 'grab', J + 'movement/portals-and-transitions/sfx-movement-portal3');
    loadAudio(l, 'drop', J + 'general-sounds/neutral-sounds/sfx-sound-neutral3');
    loadAudio(l, 'hurt', J + 'general-sounds/negative-sounds/sfx-sounds-damage1');
    loadAudio(l, 'alarm', J + 'general-sounds/alarms/low-health-alarms/sfx-lowhealth-alarmloop1');
    loadAudio(l, 'lose', J + 'general-sounds/negative-sounds/sfx-sounds-negative2');
    loadAudio(l, 'mechDown', J + 'general-sounds/weird-sounds/sfx-sound-shutdown1');
    loadAudio(l, 'hello', J + 'general-sounds/interactions/sfx-sounds-interaction5');
    // monsters
    loadAudio(l, 'zap', J + 'general-sounds/impacts/sfx-sounds-impact3');
    loadAudio(l, 'zapBig', J + 'general-sounds/impacts/sfx-sounds-impact7');
    loadAudio(l, 'glance', J + 'weapons/melee/sfx-wpn-sword2');
    loadAudio(l, 'dizzy', J + 'general-sounds/high-pitched-sounds/sfx-sounds-high3');
    loadAudio(l, 'wake', J + 'general-sounds/interactions/sfx-sounds-interaction12');
    loadAudio(l, 'capture', J + 'general-sounds/positive-sounds/sfx-sounds-powerup4');
    loadAudio(l, 'combo', J + 'general-sounds/coins/sfx-coin-cluster3');
    loadAudio(l, 'split', J + 'movement/jumping-and-landing/sfx-movement-jump9');
    loadAudio(l, 'blink', J + 'movement/portals-and-transitions/sfx-movement-portal5');
    loadAudio(l, 'warn', J + 'general-sounds/alarms/alarms/sfx-alarm-loop3');
    loadAudio(l, 'evolve', J + 'general-sounds/weird-sounds/sfx-sound-poweron');
    loadAudio(l, 'eat', J + 'general-sounds/interactions/sfx-sounds-interaction10');
    loadAudio(l, 'snack', J + 'general-sounds/coins/sfx-coin-double2');
    loadAudio(l, 'squawk', J + 'death-screams/alien/sfx-deathscream-alien3');
    loadAudio(l, 'growl', J + 'death-screams/alien/sfx-deathscream-alien1');
    loadAudio(l, 'vent', J + 'movement/jumping-and-landing/sfx-movement-jump12-landing');
    loadAudio(l, 'hop', J + 'movement/jumping-and-landing/sfx-movement-jump1');
    loadAudio(l, 'spore', J + 'general-sounds/weird-sounds/sfx-sound-depressurizing');
    // the station
    loadAudio(l, 'tele', J + 'movement/portals-and-transitions/sfx-movement-portal2');
    loadAudio(l, 'doorOpen', J + 'movement/opening-doors/sfx-movement-dooropen1');
    loadAudio(l, 'doorClose', J + 'movement/opening-doors/sfx-movement-dooropen3');
    loadAudio(l, 'unlock', J + 'general-sounds/positive-sounds/sfx-sounds-powerup9');
    loadAudio(l, 'crate', J + 'explosions/shortest/sfx-exp-shortest-soft2');
    loadAudio(l, 'thunk', J + 'general-sounds/impacts/sfx-sounds-impact1');
    loadAudio(l, 'exitOpen', J + 'general-sounds/fanfares/sfx-sounds-fanfare3');
    // powers
    loadAudio(l, 'power', J + 'general-sounds/positive-sounds/sfx-sounds-powerup12');
    loadAudio(l, 'powerDown', J + 'general-sounds/weird-sounds/sfx-sound-shutdown2');
    loadAudio(l, 'powerUse', J + 'general-sounds/positive-sounds/sfx-sounds-powerup16');
    loadAudio(l, 'freeze', J + 'general-sounds/weird-sounds/sfx-sound-vaporizing');
    loadAudio(l, 'magnet', J + 'movement/portals-and-transitions/sfx-movement-portal6');
    loadSfx(l, 'shield', 'sfx-sci-fi/audio/forcefield_000');
    loadSfx(l, 'shieldHit', 'sfx-sci-fi/audio/impactmetal_001');
    // bosses
    loadAudio(l, 'roar', J + 'death-screams/alien/sfx-deathscream-alien5');
    loadAudio(l, 'windup', J + 'general-sounds/weird-sounds/sfx-sound-mechanicalnoise2');
    loadAudio(l, 'slam', J + 'explosions/medium-length/sfx-exp-medium3');
    loadAudio(l, 'volley', J + 'weapons/single-shot-sounds/sfx-weapon-singleshot2');
    loadAudio(l, 'lob', J + 'weapons/grenade-whistles/sfx-wpn-grenadewhistle1');
    loadAudio(l, 'charge', J + 'movement/vehicles/sfx-vehicle-engineloop');
    loadAudio(l, 'beam', J + 'weapons/lasers/sfx-wpn-laser8');
    loadAudio(l, 'leap', J + 'movement/jumping-and-landing/sfx-movement-jump9');
    loadAudio(l, 'summon', J + 'general-sounds/weird-sounds/sfx-sound-bling');
    loadAudio(l, 'bossDizzy', J + 'general-sounds/fanfares/sfx-sounds-fanfare1');
    // screens
    loadAudio(l, 'fanfare', J + 'general-sounds/fanfares/sfx-sounds-fanfare2');
    loadAudio(l, 'deny', J + 'general-sounds/negative-sounds/sfx-sounds-error1');
    loadAudio(l, 'move', J + 'general-sounds/menu-sounds/sfx-menu-move2');
    loadAudio(l, 'start', J + 'general-sounds/menu-sounds/sfx-menu-select2');
    loadAudio(l, 'go', J + 'general-sounds/positive-sounds/sfx-sounds-powerup4');
    loadAudio(l, 'buy', J + 'general-sounds/coins/sfx-coin-cluster5');
    loadAudio(l, 'star', J + 'general-sounds/positive-sounds/sfx-sounds-powerup2');
  },
  menuDecor(scene) {
    // behind the menu: the autopilot rounding up Rush Hour (1-2), the camera after it
    const view = new View(scene, { quality: 0.8 });
    let sim: Sim, bot: Bot;
    const fresh = () => {
      const meta = loadMeta();
      sim = new Sim(buildLevel(MENU_LEVEL), noRanks(), false, meta.mech);
      sim.god = true;
      bot = new Bot(sim);
      view.build(sim);
      view.setMech(meta.mech, false, meta.paint[meta.mech]);
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
        if (sim.mech.state !== 'play' || sim.clock > 150) fresh();
      }
      if (n >= 4) acc = 0;
      view.sync(sim, dt);
    };
    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => view.dispose());
  },
  menuTheme: LAB_THEME,
  // a lost run may go on once after a rewarded ad (full hearts where the mech fell); the credits of a
  // run may be doubled
  ads: {
    continue: (play) => (play as PlayScene).revive(),
    canContinue: (play) => (play as PlayScene).canContinue(),
    double: { grant: (play) => (play as PlayScene).doubleCredits(), show: () => lastRunCredits() > 0 },
  },
  scenes: [PlayScene],
  strings: STRINGS,
});
