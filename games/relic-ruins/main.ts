import Phaser from 'phaser';
import { launch, loadAudio, loadSfx, type GameMeta } from '@core';
import meta from './game.json';
import { PlayScene, lastRunCoins } from './PlayScene';
import { STRINGS } from './strings';
import { loadKit } from './kit';
import { loadIcons } from './art';
import { RUIN_THEME } from './menu';
import { View } from './view';
import { Sim } from './sim';
import { Bot } from './bot';
import { buildLevel } from './levels';
import { DT, noRanks } from './defs';

launch({
  meta: meta as GameMeta,
  background: '#0c0a08',
  physics: 'none',
  difficulty: true,
  music: { menu: 'select', play: 'level3' },
  // desktop: the keys on the first ruin and along the bottom of the pause (src/core/key-help.ts)
  keyHelp: [
    { keys: ['W A S D', 'Up Down Left Right'], label: 'kh_walk' },
    { keys: ['Space', 'E'], label: 'kh_act' },
    { keys: ['F', 'Shift'], label: 'kh_flare' },
    { keys: ['Esc'], label: 'kh_pause' },
  ],
  preload(scene) {
    const l = scene.load;
    loadKit(l);
    loadIcons(l);
    const J = 'oga/junkala-sfx/';
    // the hero
    loadSfx(l, 'step', 'sfx-impact/audio/footstep_concrete_001');
    loadSfx(l, 'roll', 'sfx-foley/audio/woosh/woosh4');
    loadAudio(l, 'hurt', J + 'general-sounds/negative-sounds/sfx-sounds-damage1');
    loadAudio(l, 'fall', J + 'movement/falling-sounds/sfx-sounds-falling3');
    loadAudio(l, 'respawn', J + 'movement/portals-and-transitions/sfx-movement-portal2');
    loadAudio(l, 'lose', J + 'general-sounds/negative-sounds/sfx-sounds-negative2');
    loadAudio(l, 'dark', J + 'general-sounds/weird-sounds/sfx-sound-shutdown2');
    // the torch, fires and the flare
    loadSfx(l, 'ignite', 'sfx-foley/audio/woosh/woosh6');
    loadSfx(l, 'puff', 'sfx-foley/audio/woosh/woosh2');
    loadAudio(l, 'flare', J + 'explosions/short/sfx-exp-short-soft6');
    // pick-ups and powers
    loadAudio(l, 'coin', J + 'general-sounds/coins/sfx-coin-single2');
    loadAudio(l, 'gem', J + 'general-sounds/coins/sfx-coin-double2');
    loadAudio(l, 'key', J + 'general-sounds/coins/sfx-coin-double5');
    loadAudio(l, 'power', J + 'general-sounds/positive-sounds/sfx-sounds-powerup12');
    loadAudio(l, 'powerDown', J + 'general-sounds/weird-sounds/sfx-sound-shutdown1');
    loadAudio(l, 'star', J + 'general-sounds/positive-sounds/sfx-sounds-powerup9');
    loadAudio(l, 'relic', J + 'general-sounds/fanfares/sfx-sounds-fanfare1');
    loadAudio(l, 'fanfare', J + 'general-sounds/fanfares/sfx-sounds-fanfare2');
    // the ruin
    loadSfx(l, 'lever', 'sfx-impact/audio/impactmetal_medium_001');
    loadAudio(l, 'door', J + 'movement/opening-doors/sfx-movement-dooropen3');
    loadAudio(l, 'unlock', J + 'movement/opening-doors/sfx-movement-dooropen1');
    loadSfx(l, 'seal', 'sfx-foley/audio/rocks/stonedrag3');
    loadAudio(l, 'magic', J + 'general-sounds/positive-sounds/sfx-sounds-powerup16');
    loadSfx(l, 'grind', 'sfx-foley/audio/rocks/stonedrag1');
    loadSfx(l, 'push', 'sfx-foley/audio/rocks/stonedrag3');
    loadSfx(l, 'cart', 'sfx-impact/audio/impactwood_heavy_002');
    loadSfx(l, 'bump', 'sfx-impact/audio/impactwood_heavy_000');
    loadSfx(l, 'plate', 'sfx-impact/audio/impactmining_002');
    loadSfx(l, 'pot', 'sfx-impact/audio/impactglass_medium_001');
    loadSfx(l, 'barrel', 'sfx-impact/audio/impactplank_medium_002');
    loadSfx(l, 'splash', 'sfx-foley/audio/rocks/stonehit2');
    loadSfx(l, 'snap', 'sfx-impact/audio/impactmetal_heavy_002');
    loadSfx(l, 'trapdoor', 'sfx-impact/audio/impactwood_medium_003');
    loadSfx(l, 'crack', 'sfx-impact/audio/impactmining_000');
    loadAudio(l, 'collapse', J + 'explosions/long/sfx-exp-long3');
    loadSfx(l, 'brick', 'sfx-impact/audio/impactmining_004');
    loadAudio(l, 'whistle', J + 'weapons/grenade-whistles/sfx-wpn-grenadewhistle1');
    // creatures
    loadAudio(l, 'growl', J + 'death-screams/alien/sfx-deathscream-alien2');
    // screens
    loadAudio(l, 'deny', J + 'general-sounds/negative-sounds/sfx-sounds-error1');
    loadAudio(l, 'move', J + 'general-sounds/menu-sounds/sfx-menu-move2');
    loadAudio(l, 'start', J + 'general-sounds/menu-sounds/sfx-menu-select2');
    loadAudio(l, 'go', J + 'general-sounds/positive-sounds/sfx-sounds-powerup4');
    loadAudio(l, 'buy', J + 'general-sounds/coins/sfx-coin-cluster3');
  },
  menuDecor(scene) {
    // behind the menu: the autopilot exploring the Moss Hall by torchlight, the camera following it
    const view = new View(scene, { quality: 0.8 });
    let sim: Sim, bot: Bot;
    const fresh = () => {
      sim = new Sim(buildLevel(3), noRanks(), false);
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
        if (sim.hero.state === 'clear' || sim.clock > 120) fresh();
      }
      if (n >= 4) acc = 0;
      view.sync(sim, dt);
    };
    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => view.dispose());
  },
  menuTheme: RUIN_THEME,
  // a lost run may go on once after a rewarded ad (full hearts and torch at the last brazier);
  // the coins of a run may be doubled
  ads: {
    continue: (play) => (play as PlayScene).revive(),
    canContinue: (play) => (play as PlayScene).canContinue(),
    double: { grant: (play) => (play as PlayScene).doubleCoins(), show: () => lastRunCoins() > 0 },
  },
  scenes: [PlayScene],
  strings: STRINGS,
});
