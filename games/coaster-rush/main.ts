import Phaser from 'phaser';
import { launch, loadAudio, loadSfx, type GameMeta } from '@core';
import meta from './game.json';
import { PlayScene, lastRunTokens, prebakePlay } from './PlayScene';
import { ShopScene, prebakeShop, prebakeFork } from './shop';
import { FAIR_THEME, shopButton } from './menu';
import { STRINGS } from './strings';
import { loadKit } from './kit';
import { View, keepPrograms } from './view';
import { Sim, NO_INPUT } from './sim';
import { Bot, SKILL } from './bot';
import { loadMeta, saveMeta, lookOf } from './meta';
import { makeIcons } from './art';
import { makeSounds } from './audio';

launch({
  meta: meta as GameMeta,
  background: '#16203a',
  physics: 'none',
  difficulty: true,
  music: { menu: 'select', play: 'stage1' },
  preload(scene) {
    const l = scene.load;
    loadKit(l);
    const J = 'oga/junkala-sfx/', G = J + 'general-sounds/', F = 'sfx-foley/audio/', I = 'sfx-impact/audio/';
    loadAudio(l, 'coin', G + 'coins/sfx-coin-single2');
    loadAudio(l, 'ticket', G + 'coins/sfx-coin-double3');
    loadAudio(l, 'fare', G + 'coins/sfx-coin-cluster3');
    loadAudio(l, 'shopBuy', G + 'coins/sfx-coin-cluster3');
    loadAudio(l, 'shopNo', G + 'negative-sounds/sfx-sounds-error3');
    loadAudio(l, 'levelUp', G + 'fanfares/sfx-sounds-fanfare2');
    loadAudio(l, 'perfect', G + 'fanfares/sfx-sounds-fanfare3');
    loadAudio(l, 'good', G + 'positive-sounds/sfx-sounds-powerup2');
    loadAudio(l, 'area', G + 'fanfares/sfx-sounds-fanfare1');
    loadAudio(l, 'missed', G + 'negative-sounds/sfx-sounds-negative1');
    loadAudio(l, 'stall', G + 'negative-sounds/sfx-sounds-negative2');
    loadAudio(l, 'lean', G + 'negative-sounds/sfx-sounds-error6');
    loadAudio(l, 'launch', G + 'positive-sounds/sfx-sounds-powerup13');
    loadAudio(l, 'loop', G + 'positive-sounds/sfx-sounds-powerup16');
    loadAudio(l, 'air', G + 'simple-bleeps/sfx-sounds-blip3');
    loadAudio(l, 'hint', G + 'interactions/sfx-sounds-interaction9');
    loadAudio(l, 'tick', G + 'menu-sounds/sfx-menu-move2');
    loadAudio(l, 'pwEnd', G + 'simple-bleeps/sfx-sounds-blip8');
    loadAudio(l, 'saved', G + 'weird-sounds/sfx-sound-bling');
    loadAudio(l, 'respawn', J + 'movement/portals-and-transitions/sfx-movement-portal1');
    loadAudio(l, 'derail', J + 'explosions/short/sfx-exp-short-soft3');
    loadAudio(l, 'pw_turbo', G + 'positive-sounds/sfx-sounds-powerup10');
    loadAudio(l, 'pw_magnet', G + 'positive-sounds/sfx-sounds-powerup6');
    loadAudio(l, 'pw_safety', G + 'weird-sounds/sfx-sound-poweron');
    loadAudio(l, 'pw_slowmo', G + 'pause-sounds/sfx-sounds-pause2-in');
    loadAudio(l, 'pw_golden', G + 'coins/sfx-coin-double1');
    loadAudio(l, 'pw_balloon', G + 'positive-sounds/sfx-sounds-powerup8');
    loadSfx(l, 'crash', I + 'impactmetal_heavy_001');
    loadSfx(l, 'depart', I + 'impactbell_heavy_002');
    loadSfx(l, 'woosh', F + 'woosh/woosh2');
    loadSfx(l, 'woosh2', F + 'woosh/woosh4');
    loadSfx(l, 'boost', F + 'woosh/woosh7');
    loadSfx(l, 'splash', F + 'woosh/woosh6');
    loadSfx(l, 'brake', F + 'rocks/stonedrag3');
    // the workshop's marquees, tickets and words (and the junction card's), painted under the Ayvago intro (shop.ts)
    l.once(Phaser.Loader.Events.COMPLETE, () => {
      const t0 = performance.now();
      prebakeShop(scene);
      prebakeFork(scene);
      prebakePlay(scene);
      // how long that took (read by the screenshot and timing scripts)
      scene.registry.set('innerPaintMs', Math.round(performance.now() - t0));
    });
  },
  menuDecor(scene) {
    makeIcons(scene);
    // the ride's synthesised loops are made here, not when a ride starts
    makeSounds(scene.game);
    // a live autopilot ride behind the menu. Building it here also compiles every shader the
    // Play scene uses (keepPrograms), so the first Play frame compiles none.
    const seed = 23;
    const sim = new Sim('easy', seed);
    const bot = new Bot(sim, SKILL.good, seed);
    const view = new View(scene, sim, lookOf(loadMeta()));
    view.menuShift = 0.25;
    // test hook: the menu's world (the warm-up check compares its programs with the Play scene's)
    scene.data.set('world', view.world);
    // the backdrop's darkening is the menu theme's (frame.dim in menu.ts): one full-screen layer
    // compile every shader the ride uses now, while the menu is built (the first Play frame then
    // compiles none)
    keepPrograms(view.world.renderer, view.world.scene, view.world.camera);
    let acc = 0;
    view.world.onFrame = (dt) => {
      acc += dt;
      let n = 0;
      while (acc > 1 / 60 && n < 4) {
        acc -= 1 / 60;
        n++;
        sim.step(1 / 60, sim.over ? NO_INPUT : bot.input(1 / 60));
        for (const ev of sim.events) view.handle(ev, sim);
        sim.events.length = 0;
        // the menu's train never stops for good: a derail or scared riders put it back on the track
        if (sim.over) sim.revive();
      }
      if (n >= 4) acc = 0;
      view.sync(sim, dt);
    };
  },
  // the workshop: a button under the difficulty switch
  menuOption: {
    build(scene, x, y) {
      const open = () => {
        if (!scene.scene.isActive()) return;
        scene.scene.pause();
        scene.scene.launch('Shop', { from: scene.scene.key });
      };
      const { refresh } = shopButton(scene, x, y + 6, open, () => loadMeta().tokens);
      scene.events.on('shop-closed', refresh);
      scene.input.keyboard?.on('keydown-M', open);
      scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => scene.events.off('shop-closed', refresh));
    },
  },
  // circus tickets, bunting and a bulb-lit marquee, the logo over a coaster loop (menu.ts)
  menuTheme: FAIR_THEME,
  ads: {
    continue: (play) => (play as PlayScene).revive(),
    double: {
      show: () => lastRunTokens > 0,
      grant: () => { const m = loadMeta(); m.tokens += lastRunTokens; saveMeta(m); },
    },
  },
  scenes: [PlayScene, ShopScene],
  strings: STRINGS,
});
