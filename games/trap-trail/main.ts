import Phaser from 'phaser';
import { launch, loadAudio, loadSfx, type GameMeta } from '@core';
import meta from './game.json';
import { PlayScene, lastRunCoins } from './PlayScene';
import { STRINGS } from './strings';
import { loadKit } from './kit';
import { loadIcons } from './icons';
import { TRAIL_THEME } from './menu';
import { View } from './view';
import { Sim } from './sim';
import { Bot } from './bot';
import { buildStage } from './levels';
import { DT, noRanks } from './defs';

launch({
  meta: meta as GameMeta,
  background: '#4aa6f0',
  physics: 'none',
  difficulty: true,
  music: { menu: 'select', play: 'level1' },
  preload(scene) {
    const l = scene.load;
    loadKit(l);
    loadIcons(l);
    const J = 'oga/junkala-sfx/';
    // the hero
    loadAudio(l, 'jump', J + 'movement/jumping-and-landing/sfx-movement-jump8');
    loadAudio(l, 'jump2', J + 'movement/jumping-and-landing/sfx-movement-jump12');
    loadAudio(l, 'land', J + 'movement/jumping-and-landing/sfx-movement-jump9-landing');
    loadSfx(l, 'dash', 'sfx-foley/audio/woosh/woosh4');
    loadAudio(l, 'boing', J + 'movement/jumping-and-landing/sfx-movement-jump16');
    loadAudio(l, 'hurt', J + 'general-sounds/negative-sounds/sfx-sounds-damage1');
    loadAudio(l, 'fall', J + 'movement/falling-sounds/sfx-sounds-falling3');
    loadAudio(l, 'respawn', J + 'movement/portals-and-transitions/sfx-movement-portal2');
    loadAudio(l, 'lose', J + 'general-sounds/negative-sounds/sfx-sounds-negative2');
    loadAudio(l, 'shieldPop', J + 'general-sounds/impacts/sfx-sounds-impact5');
    // pickups and powers
    loadAudio(l, 'coin', J + 'general-sounds/coins/sfx-coin-single2');
    loadAudio(l, 'gem', J + 'general-sounds/coins/sfx-coin-double2');
    loadAudio(l, 'star', J + 'general-sounds/positive-sounds/sfx-sounds-powerup9');
    loadAudio(l, 'heal', J + 'general-sounds/positive-sounds/sfx-sounds-powerup2');
    loadAudio(l, 'key', J + 'general-sounds/coins/sfx-coin-double5');
    loadAudio(l, 'power', J + 'general-sounds/positive-sounds/sfx-sounds-powerup12');
    loadAudio(l, 'powerDown', J + 'general-sounds/weird-sounds/sfx-sound-shutdown1');
    // the course
    loadAudio(l, 'checkpoint', J + 'general-sounds/positive-sounds/sfx-sounds-powerup16');
    loadSfx(l, 'lever', 'sfx-impact/audio/impactmetal_light_002');
    loadAudio(l, 'door', J + 'movement/opening-doors/sfx-movement-dooropen2');
    loadAudio(l, 'chest', J + 'general-sounds/coins/sfx-coin-cluster5');
    loadSfx(l, 'crumble', 'sfx-foley/audio/rocks/stonedrag1');
    loadSfx(l, 'spike', 'sfx-impact/audio/impactmetal_light_000');
    loadAudio(l, 'cannon', J + 'weapons/cannon/sfx-wpn-cannon1');
    loadAudio(l, 'boom', J + 'explosions/short/sfx-exp-short-hard2');
    loadAudio(l, 'fuse', J + 'general-sounds/simple-bleeps/sfx-sounds-blip4');
    loadSfx(l, 'roll', 'sfx-impact/audio/impactwood_heavy_001');
    loadAudio(l, 'drop', J + 'weapons/grenade-whistles/sfx-wpn-grenadewhistle1');
    loadAudio(l, 'break', J + 'general-sounds/impacts/sfx-sounds-impact3');
    loadAudio(l, 'fanfare', J + 'general-sounds/fanfares/sfx-sounds-fanfare2');
    // enemies and blocks
    loadAudio(l, 'stomp', J + 'general-sounds/impacts/sfx-sounds-impact1');
    loadAudio(l, 'smash', J + 'general-sounds/impacts/sfx-sounds-impact12');
    loadAudio(l, 'roar', J + 'death-screams/alien/sfx-deathscream-alien2');
    loadAudio(l, 'buzz', J + 'general-sounds/weird-sounds/sfx-sound-mechanicalnoise2');
    loadAudio(l, 'hop', J + 'movement/jumping-and-landing/sfx-movement-jump19');
    loadSfx(l, 'bump', 'sfx-impact/audio/impactmetal_heavy_000');
    // screens
    loadAudio(l, 'deny', J + 'general-sounds/negative-sounds/sfx-sounds-error1');
    loadAudio(l, 'move', J + 'general-sounds/menu-sounds/sfx-menu-move2');
    loadAudio(l, 'start', J + 'general-sounds/menu-sounds/sfx-menu-select2');
    loadAudio(l, 'go', J + 'general-sounds/positive-sounds/sfx-sounds-powerup4');
    loadAudio(l, 'buy', J + 'general-sounds/coins/sfx-coin-cluster3');
  },
  menuDecor(scene) {
    // behind the menu: the autopilot running Saw Meadow, the camera following it
    const view = new View(scene, { quality: 0.85 });
    let sim: Sim, bot: Bot;
    const fresh = () => {
      sim = new Sim(buildStage(2), noRanks(), false, false);
      sim.god = true;
      bot = new Bot(sim);
      view.build(sim.c);
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
        if (sim.hero.state === 'goal' || sim.time > 120) fresh();
      }
      if (n >= 4) acc = 0;
      view.sync(sim, dt);
    };
    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => view.dispose());
  },
  menuTheme: TRAIL_THEME,
  // a lost run may go on once after a rewarded ad (back on the last checkpoint, full hearts);
  // the coins of a run may be doubled
  ads: {
    continue: (play) => (play as PlayScene).revive(),
    canContinue: (play) => (play as PlayScene).canContinue(),
    double: { grant: (play) => (play as PlayScene).doubleCoins(), show: () => lastRunCoins() > 0 },
  },
  scenes: [PlayScene],
  strings: STRINGS,
});
