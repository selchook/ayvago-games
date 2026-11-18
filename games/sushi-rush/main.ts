import Phaser from 'phaser';
import { launch, loadAudio, loadSfx, SkinButton, type GameMeta } from '@core';
import meta from './game.json';
import { PlayScene, prebakePlay } from './PlayScene';
import { STRINGS } from './strings';
import { loadKit } from './kit';
import { loadIcons } from './icons';
import { View } from './view';
import { Day, mulberry, type RunState } from './sim';
import { Bot, SKILL } from './bot';
import { DT } from './defs';
import { noRanks } from './powers';
import { loadMeta } from './meta';
import { SUSHI_THEME } from './menu';
import { MENU_ROW_W, MENU_ROW_H } from './screens';
import { BookScene } from './book';
import { t } from '@core';

launch({
  meta: meta as GameMeta,
  background: '#2a1a12',
  physics: 'none',
  difficulty: true,
  music: { menu: 'select', play: 'stage2' },
  preload(scene) {
    const l = scene.load;
    loadKit(l);
    loadIcons(l);
    const J = 'oga/junkala-sfx/';
    loadSfx(l, 'chop', 'sfx-impact/audio/impactwood_light_001');
    loadSfx(l, 'roll', 'sfx-foley/audio/woosh/woosh2');
    loadSfx(l, 'add', 'sfx-impact/audio/impactsoft_medium_001');
    loadAudio(l, 'fridge', J + 'movement/opening-doors/sfx-movement-dooropen1');
    loadAudio(l, 'door', J + 'movement/opening-doors/sfx-movement-dooropen2');
    loadAudio(l, 'boil', J + 'general-sounds/weird-sounds/sfx-sound-vaporizing');
    loadSfx(l, 'ding', 'sfx-impact/audio/impactbell_heavy_001');
    loadSfx(l, 'bell', 'sfx-impact/audio/impactbell_heavy_000');
    loadAudio(l, 'done', J + 'general-sounds/positive-sounds/sfx-sounds-powerup1');
    loadAudio(l, 'coin', J + 'general-sounds/coins/sfx-coin-single2');
    loadAudio(l, 'tip', J + 'general-sounds/coins/sfx-coin-double2');
    loadAudio(l, 'golden', J + 'general-sounds/coins/sfx-coin-cluster5');
    loadAudio(l, 'buy', J + 'general-sounds/coins/sfx-coin-cluster3');
    loadAudio(l, 'happy', J + 'general-sounds/positive-sounds/sfx-sounds-powerup4');
    loadAudio(l, 'angry', J + 'general-sounds/negative-sounds/sfx-sounds-negative1');
    loadAudio(l, 'wrong', J + 'general-sounds/negative-sounds/sfx-sounds-error3');
    loadAudio(l, 'deny', J + 'general-sounds/negative-sounds/sfx-sounds-error1');
    loadAudio(l, 'lose', J + 'general-sounds/negative-sounds/sfx-sounds-negative2');
    loadSfx(l, 'bin', 'sfx-impact/audio/impactplate_light_001');
    loadSfx(l, 'serve', 'sfx-impact/audio/impactplate_medium_001');
    loadAudio(l, 'burnt', J + 'explosions/shortest/sfx-exp-shortest-soft5');
    loadAudio(l, 'order', J + 'general-sounds/menu-sounds/sfx-menu-select1');
    loadAudio(l, 'fanfare', J + 'general-sounds/fanfares/sfx-sounds-fanfare2');
    loadAudio(l, 'fanfare2', J + 'general-sounds/fanfares/sfx-sounds-fanfare1');
    loadAudio(l, 'vip', J + 'general-sounds/fanfares/sfx-sounds-fanfare3');
    loadAudio(l, 'power', J + 'general-sounds/positive-sounds/sfx-sounds-powerup2');
    loadAudio(l, 'zen', J + 'general-sounds/positive-sounds/sfx-sounds-powerup6');
    loadAudio(l, 'start', J + 'general-sounds/menu-sounds/sfx-menu-select2');
    loadAudio(l, 'pick', J + 'general-sounds/menu-sounds/sfx-menu-select3');
    loadAudio(l, 'move', J + 'general-sounds/menu-sounds/sfx-menu-move2');
    loadAudio(l, 'tick', J + 'general-sounds/simple-bleeps/sfx-sounds-blip3');
    loadSfx(l, 'click', 'sfx-interface/audio/click_002');
    loadSfx(l, 'card', 'sfx-casino/audio/cardslide3');
    loadSfx(l, 'deal', 'sfx-casino/audio/cardfan1');
    l.once(Phaser.Loader.Events.COMPLETE, () => {
      const t0 = performance.now();
      prebakePlay(scene);
      scene.registry.set('innerPaintMs', Math.round(performance.now() - t0));
    });
  },
  menuDecor(scene) {
    // a live bar behind the menu: the autopilot runs a busy day with the chosen chef. Building it
    // here also compiles every shader the Play scene uses.
    const ranks = { ...noRanks(), decor: 3, seats: 2, pot: 2, steamer: 2, tea: 2, knife: 2, bell: 1 };
    let seed = 7;
    const fresh = (): { day: Day; bot: Bot } => {
      const run: RunState = { mode: 'normal', day: 7, earned: 0, cards: ['luckyCat', 'regulars'], ranks, seed, served: 0, tips: 0 };
      const day = new Day(run, seed++);
      return { day, bot: new Bot(day, SKILL.good, mulberry(seed)) };
    };
    let cur = fresh();
    const view = new View(scene, { chef: loadMeta().chef, ranks, day: 7, seats: cur.day.seats });
    // skip the empty opening seconds
    for (let i = 0; i < 60 * 9; i++) { cur.bot.step(DT); cur.day.step(DT); for (const e of cur.day.events) view.handle(e); cur.day.events.length = 0; }
    let acc = 0;
    view.world.onFrame = (dt) => {
      acc += dt;
      let n = 0;
      while (acc > DT && n < 4) {
        acc -= DT;
        n++;
        cur.day.hearts = 9;
        cur.bot.step(DT);
        cur.day.step(DT);
        for (const e of cur.day.events) view.handle(e);
        cur.day.events.length = 0;
        if (cur.day.over) cur = fresh();
      }
      if (n >= 4) acc = 0;
      view.sync(cur.day, dt);
    };
    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => view.dispose());
  },
  // RECIPES and CARDS: a row under the Easy / Normal switch (R and C on the keyboard), opened in
  // a scene of their own over the paused menu (book.ts)
  menuOption: {
    build(scene, x, y) {
      const open = (which: 'recipes' | 'cards') => {
        if (!scene.scene.isActive()) return;
        scene.scene.pause();
        scene.scene.launch('Book', { which, from: scene.scene.key });
      };
      const gap = 14;
      const a = new SkinButton(scene, x - MENU_ROW_W / 2 - gap / 2, y, t('menuRecipes'), () => open('recipes'), { width: MENU_ROW_W, height: MENU_ROW_H, size: 26 });
      const b = new SkinButton(scene, x + MENU_ROW_W / 2 + gap / 2, y, t('menuCards'), () => open('cards'), { width: MENU_ROW_W, height: MENU_ROW_H, size: 26 });
      scene.add.existing(a);
      scene.add.existing(b);
      a.fitLabel(MENU_ROW_W - 24);
      b.fitLabel(MENU_ROW_W - 24);
      scene.input.keyboard?.on('keydown-R', () => open('recipes'));
      scene.input.keyboard?.on('keydown-C', () => open('cards'));
    },
  },
  menuTheme: SUSHI_THEME,
  // a failed day may go on once, after a rewarded ad (hearts back, or 30 more seconds)
  ads: { continue: (play) => (play as PlayScene).revive() },
  scenes: [PlayScene, BookScene],
  strings: STRINGS,
});
