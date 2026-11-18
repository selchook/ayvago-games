import Phaser from 'phaser';
import { launch, loadAudio, loadSfx, type GameMeta } from '@core';
import meta from './game.json';
import { PlayScene, prebakePlay } from './PlayScene';
import { BoardScene, prebakeBoard } from './board';
import { prebakeIsleScreens } from './shop';
import { STRINGS } from './strings';
import { loadKit } from './kit';
import { makeArt } from './art';
import { makeSounds } from './audio';
import { View } from './view';
import { Sim, NO_INPUT } from './sim';
import { Bot, SKILL } from './bot';
import { loadMeta } from './meta';
import { ALL_NODES } from './upgrades';
import { menuRow, SKULL_THEME } from './menu';

/** The menu's live backdrop (the hero selector swaps its pirate). */
let menuView: View | null = null;

launch({
  meta: meta as GameMeta,
  background: '#0b1a24',
  physics: 'none',
  difficulty: true,
  // the owner's two shanties, made loop-ready: the chant on the menu, the shanty at sea
  music: {
    menu: { file: 'music/owner/rolling-maritime-chant.mp3', gain: 2.2 },
    play: { file: 'music/owner/rolling-sea-shanty.mp3', gain: 1.9 },
  },
  preload(scene) {
    const l = scene.load;
    loadKit(l);
    const J = 'oga/junkala-sfx/';
    loadAudio(l, 'swing1', J + 'weapons/melee/sfx-wpn-sword1');
    loadAudio(l, 'swing2', J + 'weapons/melee/sfx-wpn-sword2');
    loadAudio(l, 'swing3', J + 'weapons/melee/sfx-wpn-sword3');
    loadAudio(l, 'hit', J + 'general-sounds/simple-damage-sounds/sfx-damage-hit3');
    loadAudio(l, 'crit', J + 'general-sounds/simple-damage-sounds/sfx-damage-hit8');
    loadAudio(l, 'peck', J + 'general-sounds/high-pitched-sounds/sfx-sounds-high1');
    loadSfx(l, 'bones', 'sfx-impact/audio/impactplank_medium_002');
    loadSfx(l, 'squish', 'sfx-impact/audio/impactsoft_medium_001');
    loadSfx(l, 'clang', 'sfx-impact/audio/impactmetal_light_002');
    loadAudio(l, 'hurt', J + 'general-sounds/negative-sounds/sfx-sounds-damage1');
    loadAudio(l, 'death', J + 'general-sounds/negative-sounds/sfx-sounds-negative2');
    loadSfx(l, 'roll', 'sfx-foley/audio/woosh/woosh4');
    loadSfx(l, 'toss', 'sfx-foley/audio/woosh/woosh6');
    loadSfx(l, 'lunge', 'sfx-foley/audio/woosh/woosh7');
    loadSfx(l, 'rumble', 'sfx-foley/audio/rocks/stonedrag1');
    loadSfx(l, 'rise', 'sfx-foley/audio/rocks/stonedrag3');
    loadAudio(l, 'pistol', J + 'weapons/single-shot-sounds/sfx-weapon-singleshot2');
    loadAudio(l, 'whistle', J + 'weapons/grenade-whistles/sfx-wpn-grenadewhistle1');
    loadAudio(l, 'cannon', J + 'weapons/cannon/sfx-wpn-cannon4');
    loadAudio(l, 'spit', J + 'general-sounds/interactions/sfx-sounds-interaction7');
    loadAudio(l, 'boom', J + 'explosions/short/sfx-exp-short-soft4');
    loadAudio(l, 'bigBoom', J + 'explosions/medium-length/sfx-exp-medium4');
    loadAudio(l, 'slam', J + 'explosions/medium-length/sfx-exp-medium3');
    loadAudio(l, 'splat', J + 'explosions/shortest/sfx-exp-shortest-soft5');
    loadAudio(l, 'thud', J + 'explosions/shortest/sfx-exp-shortest-hard2');
    loadAudio(l, 'fuse', J + 'general-sounds/weird-sounds/sfx-sound-vaporizing');
    loadAudio(l, 'tele', J + 'general-sounds/weird-sounds/sfx-sound-depressurizing');
    loadAudio(l, 'coin', J + 'general-sounds/coins/sfx-coin-single2');
    loadAudio(l, 'bag', J + 'general-sounds/coins/sfx-coin-cluster5');
    loadAudio(l, 'buy', J + 'general-sounds/coins/sfx-coin-cluster3');
    loadAudio(l, 'power', J + 'general-sounds/positive-sounds/sfx-sounds-powerup2');
    loadAudio(l, 'heal', J + 'general-sounds/positive-sounds/sfx-sounds-powerup4');
    loadAudio(l, 'revive', J + 'general-sounds/positive-sounds/sfx-sounds-powerup5');
    loadAudio(l, 'boon', J + 'general-sounds/positive-sounds/sfx-sounds-powerup10');
    loadAudio(l, 'chest', J + 'general-sounds/positive-sounds/sfx-sounds-powerup12');
    loadAudio(l, 'ready', J + 'general-sounds/positive-sounds/sfx-sounds-powerup14');
    loadAudio(l, 'clear', J + 'general-sounds/positive-sounds/sfx-sounds-powerup8');
    loadAudio(l, 'expire', J + 'general-sounds/pause-sounds/sfx-sounds-pause3-out');
    loadAudio(l, 'wave', J + 'general-sounds/menu-sounds/sfx-menu-select1');
    loadAudio(l, 'move', J + 'general-sounds/menu-sounds/sfx-menu-move2');
    loadAudio(l, 'error', J + 'general-sounds/negative-sounds/sfx-sounds-error3');
    loadAudio(l, 'fanfare', J + 'general-sounds/fanfares/sfx-sounds-fanfare2');
    loadAudio(l, 'fanfare2', J + 'general-sounds/fanfares/sfx-sounds-fanfare1');
    loadAudio(l, 'horn', J + 'general-sounds/fanfares/sfx-sounds-fanfare3');
    loadAudio(l, 'alarm', J + 'general-sounds/alarms/low-health-alarms/sfx-lowhealth-alarmloop4');
    loadAudio(l, 'bossDie', J + 'explosions/long/sfx-exp-long3');
    loadSfx(l, 'sail', 'sfx-interface/audio/maximize_003');
    // at sea and in the water
    loadAudio(l, 'cannon2', J + 'weapons/cannon/sfx-wpn-cannon1');
    loadAudio(l, 'cannon3', J + 'weapons/cannon/sfx-wpn-cannon2');
    loadAudio(l, 'thunder', J + 'explosions/long/sfx-exp-long5');
    loadAudio(l, 'ghost', J + 'movement/portals-and-transitions/sfx-movement-portal3');
    loadAudio(l, 'bling', J + 'general-sounds/weird-sounds/sfx-sound-bling');
    loadAudio(l, 'gasp', J + 'general-sounds/negative-sounds/sfx-sounds-negative1');
    loadAudio(l, 'fireUp', J + 'explosions/various/sfx-exp-various2');
    loadAudio(l, 'spy', J + 'general-sounds/menu-sounds/sfx-menu-select2');
    loadAudio(l, 'wind', J + 'general-sounds/positive-sounds/sfx-sounds-powerup6');
    loadAudio(l, 'treasure', J + 'general-sounds/positive-sounds/sfx-sounds-powerup16');
    loadSfx(l, 'hullHit', 'sfx-impact/audio/impactwood_heavy_002');
    loadSfx(l, 'repair', 'sfx-impact/audio/impactwood_medium_001');
    loadSfx(l, 'rockHit', 'sfx-foley/audio/rocks/stonehit2');
    loadSfx(l, 'gust', 'sfx-foley/audio/woosh/woosh2');
    loadSfx(l, 'card', 'sfx-casino/audio/cardslide3');
    // the treasure map's and the between-island screens' charts, planks, notes and words, painted
    // under the Ayvago intro (board.ts, shop.ts)
    l.once(Phaser.Loader.Events.COMPLETE, () => {
      const t0 = performance.now();
      prebakeBoard(scene);
      prebakeIsleScreens(scene);
      prebakePlay(scene);
      // how long that took (read by the screenshot and timing scripts)
      scene.registry.set('innerPaintMs', Math.round(performance.now() - t0));
    });
  },
  menuDecor(scene) {
    makeArt(scene);
    makeSounds(scene.game);
    // a live beach behind the menu: the autopilot raids Sandy Cove with the chosen pirate. Building
    // it here also compiles every shader the Play scene uses (View in menu mode keeps the programs).
    const m = loadMeta();
    const view = new View(scene, { hero: m.hero, menu: true });
    menuView = view;
    let seed = 11;
    const fresh = () => {
      const s = new Sim('normal', seed++, { hero: loadMeta().hero, nodes: ALL_NODES });
      s.p.kegs = 2;
      return s;
    };
    let sim = fresh();
    let bot = new Bot(sim, SKILL.good, seed);
    // the backdrop's darkening is the menu theme's (frame.dim in menu.ts): one full-screen layer
    let acc = 0;
    view.world.onFrame = (dt) => {
      acc += dt;
      let n = 0;
      while (acc > 1 / 60 && n < 4) {
        acc -= 1 / 60;
        n++;
        sim.p.invuln = Math.max(sim.p.invuln, 0.1);
        if (sim.voyage) sim.voyage.ship.invuln = Math.max(sim.voyage.ship.invuln, 0.1);
        if (sim.phase === 'shop') { bot.shop(); sim.leaveShop(); }
        if (sim.phase === 'draft') sim.pickBoon(0);
        if (sim.phase === 'chart') sim.pickRoute(bot.route());
        sim.step(1 / 60, sim.over ? NO_INPUT : bot.input(1 / 60));
        for (const ev of sim.events) view.handle(ev, sim);
        sim.events.length = 0;
        if (sim.over || sim.time > 600) {
          sim = fresh();
          bot = new Bot(sim, SKILL.good, seed);
          view.heroDead = false;
        }
      }
      if (n >= 4) acc = 0;
      view.sync(sim, dt);
    };
    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => { view.dispose(); if (menuView === view) menuView = null; });
  },
  // the pirate and the treasure map: a row under the difficulty switch (H and M on the keyboard)
  menuOption: {
    build(scene, x, y) {
      makeArt(scene);
      const open = () => {
        if (!scene.scene.isActive()) return;
        scene.scene.pause();
        scene.scene.launch('Board', { from: scene.scene.key });
      };
      const row = menuRow(scene, x, y, (hero) => menuView?.setHero(hero), open);
      scene.events.on('map-closed', row.refresh);
      scene.input.keyboard?.on('keydown-M', open);
      scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => scene.events.off('map-closed', row.refresh));
    },
  },
  // pirate wood, rope and parchment, the logo over a Jolly Roger (menu.ts)
  menuTheme: SKULL_THEME,
  scenes: [PlayScene, BoardScene],
  strings: STRINGS,
});
