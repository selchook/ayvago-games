import Phaser from 'phaser';
import { launch, loadAudio, loadSfx, SkinButton, keyHelpShown, t, type GameMeta } from '@core';
import meta from './game.json';
import { PlayScene, prebakePlay, entry } from './PlayScene';
import { STRINGS } from './strings';
import { loadKit } from './kit';
import { makeArt } from './art';
import { prebakeHud } from './hud';
import { View } from './view';
import { Sim, newRun, mulberry, NO_INPUT } from './sim';
import { Bot, SKILL } from './bot';
import { DT } from './defs';
import { noRanks } from './powers';
import { NEON_THEME, MOVES_BTN, MOVES_BTN_KEYS } from './menu';
import { OverlayScene, openOverlay } from './overlay';

launch({
  meta: meta as GameMeta,
  background: '#05030f',
  physics: 'none',
  difficulty: true,
  music: { menu: 'title', play: 'level2' },
  preload(scene) {
    const l = scene.load;
    loadKit(l);
    const J = 'oga/junkala-sfx/';
    loadAudio(l, 'slash1', J + 'weapons/melee/sfx-wpn-sword1');
    loadAudio(l, 'slash2', J + 'weapons/melee/sfx-wpn-sword2');
    loadAudio(l, 'slash3', J + 'weapons/melee/sfx-wpn-sword3');
    loadAudio(l, 'punch', J + 'weapons/melee/sfx-wpn-punch2');
    loadAudio(l, 'kick', J + 'weapons/melee/sfx-wpn-punch4');
    loadAudio(l, 'shoot', J + 'weapons/lasers/sfx-wpn-laser8');
    loadAudio(l, 'heavy', J + 'weapons/lasers/sfx-wpn-laser10');
    loadAudio(l, 'foeShot', J + 'weapons/lasers/sfx-wpn-laser3');
    loadAudio(l, 'overheat', J + 'weapons/out-of-ammo/sfx-wpn-noammo2');
    loadAudio(l, 'cooled', J + 'weapons/out-of-ammo/sfx-wpn-reload');
    loadAudio(l, 'jump', J + 'movement/jumping-and-landing/sfx-movement-jump12');
    loadAudio(l, 'airJump', J + 'movement/jumping-and-landing/sfx-movement-jump14');
    loadAudio(l, 'land', J + 'movement/jumping-and-landing/sfx-movement-jump12-landing');
    loadSfx(l, 'roll', 'sfx-foley/audio/woosh/woosh4');
    loadSfx(l, 'dash', 'sfx-foley/audio/woosh/woosh7');
    loadAudio(l, 'hit', J + 'general-sounds/simple-damage-sounds/sfx-damage-hit3');
    loadAudio(l, 'crit', J + 'general-sounds/simple-damage-sounds/sfx-damage-hit8');
    loadSfx(l, 'clang', 'sfx-impact/audio/impactmetal_light_002');
    loadSfx(l, 'parry', 'sfx-impact/audio/impactmetal_heavy_001');
    loadAudio(l, 'break', J + 'explosions/short/sfx-exp-short-hard6');
    loadAudio(l, 'hurt', J + 'general-sounds/negative-sounds/sfx-sounds-damage1');
    loadAudio(l, 'die', J + 'general-sounds/negative-sounds/sfx-sounds-negative2');
    loadAudio(l, 'robotDie', J + 'death-screams/robot/sfx-deathscream-robot2');
    loadAudio(l, 'boom', J + 'explosions/short/sfx-exp-short-soft4');
    loadAudio(l, 'bigBoom', J + 'explosions/medium-length/sfx-exp-medium4');
    loadAudio(l, 'bossDie', J + 'explosions/long/sfx-exp-long3');
    loadAudio(l, 'gear', J + 'general-sounds/coins/sfx-coin-single2');
    loadAudio(l, 'chip', J + 'general-sounds/positive-sounds/sfx-sounds-powerup16');
    loadAudio(l, 'heal', J + 'general-sounds/positive-sounds/sfx-sounds-powerup4');
    loadAudio(l, 'power', J + 'general-sounds/positive-sounds/sfx-sounds-powerup2');
    loadAudio(l, 'coolant', J + 'general-sounds/positive-sounds/sfx-sounds-powerup6');
    loadAudio(l, 'checkpoint', J + 'general-sounds/positive-sounds/sfx-sounds-powerup12');
    loadAudio(l, 'star', J + 'general-sounds/positive-sounds/sfx-sounds-powerup1');
    loadAudio(l, 'lever', J + 'general-sounds/interactions/sfx-sounds-interaction7');
    loadAudio(l, 'door', J + 'movement/opening-doors/sfx-movement-dooropen1');
    loadAudio(l, 'bridge', J + 'movement/opening-doors/sfx-movement-dooropen3');
    loadAudio(l, 'tell', J + 'general-sounds/high-pitched-sounds/sfx-sounds-high1');
    loadAudio(l, 'warp', J + 'movement/portals-and-transitions/sfx-movement-portal3');
    loadAudio(l, 'exit', J + 'movement/portals-and-transitions/sfx-movement-portal1');
    loadSfx(l, 'zap', 'sfx-digital/audio/zap1');
    loadSfx(l, 'laserGate', 'sfx-digital/audio/phaserup3');
    loadAudio(l, 'steam', J + 'general-sounds/weird-sounds/sfx-sound-depressurizing');
    loadAudio(l, 'stomp', J + 'explosions/short/sfx-exp-short-hard2');
    loadAudio(l, 'alarm', J + 'general-sounds/alarms/alarms/sfx-alarm-loop3');
    loadAudio(l, 'fanfare', J + 'general-sounds/fanfares/sfx-sounds-fanfare2');
    loadAudio(l, 'fanfare2', J + 'general-sounds/fanfares/sfx-sounds-fanfare1');
    loadAudio(l, 'phase', J + 'general-sounds/fanfares/sfx-sounds-fanfare3');
    loadAudio(l, 'move', J + 'general-sounds/menu-sounds/sfx-menu-move2');
    loadAudio(l, 'pick', J + 'general-sounds/menu-sounds/sfx-menu-select3');
    loadAudio(l, 'start', J + 'general-sounds/menu-sounds/sfx-menu-select2');
    loadAudio(l, 'deny', J + 'general-sounds/negative-sounds/sfx-sounds-error3');
    loadAudio(l, 'buy', J + 'general-sounds/coins/sfx-coin-cluster3');
    loadAudio(l, 'tick', J + 'general-sounds/simple-bleeps/sfx-sounds-blip3');
    loadSfx(l, 'card', 'sfx-casino/audio/cardslide3');
    loadSfx(l, 'deal', 'sfx-casino/audio/cardfan1');
    // 1.1: a sound for every blade move
    loadSfx(l, 'mvSpin', 'sfx-foley/audio/woosh/woosh2');
    loadAudio(l, 'mvRise', J + 'movement/jumping-and-landing/sfx-movement-jump9');
    loadAudio(l, 'mvSky', J + 'general-sounds/impacts/sfx-sounds-impact6');
    loadAudio(l, 'mvDive', J + 'movement/falling-sounds/sfx-sounds-falling3');
    loadAudio(l, 'mvDiveLand', J + 'explosions/shortest/sfx-exp-shortest-hard3');
    loadAudio(l, 'mvDraw', J + 'weapons/melee/sfx-wpn-dagger');
    loadAudio(l, 'mvIaido', J + 'general-sounds/weird-sounds/sfx-sound-bling');
    loadAudio(l, 'mvBurst', J + 'weapons/shotgun/sfx-weapon-shotgun2');
    loadAudio(l, 'mvMirror', J + 'weapons/lasers/sfx-wpn-laser-10');
    loadAudio(l, 'mvCrash', J + 'general-sounds/impacts/sfx-sounds-impact12');
    l.once(Phaser.Loader.Events.COMPLETE, () => {
      const t0 = performance.now();
      makeArt(scene);
      prebakeHud(scene);
      prebakePlay(scene);
      scene.registry.set('innerPaintMs', Math.round(performance.now() - t0));
    });
  },
  menuDecor(scene) {
    // a live rooftop behind the menu: the autopilot runs "Rain Runner" in the rain (the hero cannot
    // fall); building it here also compiles every shader the Play scene uses
    entry.to = 'map';
    makeArt(scene);
    const view = new View(scene, { quality: 0.7 });
    view.offsetX = -7;
    let seed = 3;
    const fresh = (): { sim: Sim; bot: Bot } => {
      const run = newRun('normal', { ...noRanks(), sword: 2, gun: 2, boots: 2 }, ['wall', 'cleave', 'slam']);
      run.cards = ['voltBlade', 'kitsune'];
      const sim = new Sim(1, run, seed++);
      sim.demo = true;
      return { sim, bot: new Bot(sim, SKILL.good, mulberry(seed)) };
    };
    let cur = fresh();
    view.build(cur.sim);
    let acc = 0;
    view.world.onFrame = (dt) => {
      acc += dt;
      let n = 0;
      while (acc > DT && n < 3) {
        acc -= DT;
        n++;
        cur.sim.p.iframes = Math.max(cur.sim.p.iframes, 0.1);
        cur.sim.step(DT, cur.sim.cleared ? NO_INPUT : cur.bot.input(DT));
        for (const e of cur.sim.events) view.handle(e, cur.sim);
        cur.sim.events.length = 0;
        if (cur.sim.cleared && cur.sim.p.t > 2.5) { cur = fresh(); view.build(cur.sim); }
      }
      if (n >= 3) acc = 0;
      view.sync(cur.sim, dt);
    };
    // rain over the city
    scene.add.particles(0, 0, 'nr-rain', {
      x: { min: -60, max: 1340 }, y: -50, lifespan: 800, speedY: { min: 1000, max: 1250 }, speedX: -170, rotate: 9,
      alpha: { start: 0.45, end: 0.2 }, quantity: 2, frequency: 20, blendMode: Phaser.BlendModes.ADD,
    }).setDepth(-60);
    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => view.dispose());
  },
  // the game's own menu row: MOVES (every blade move and how it unlocks; M on the keyboard)
  menuOption: {
    build(scene, x, y) {
      const open = () => openOverlay(scene, { kind: 'moves' });
      // desktop: the HOW TO PLAY card shows the key caps and sits a little higher, so the button is slimmer
      const b = keyHelpShown(scene) ? MOVES_BTN_KEYS : { ...MOVES_BTN, lift: 0 };
      new SkinButton(scene, x, y - b.lift, t('moves'), open, { width: b.w, height: b.h, size: 30, baked: true });
      scene.input.keyboard?.on('keydown-M', open);
      scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => scene.input.keyboard?.off('keydown-M', open));
    },
  },
  // neon glitch panels, HUD brackets, a synthwave sun behind the logo (menu.ts)
  menuTheme: NEON_THEME,
  // desktop key help (pause strip, the menu's how-to, the first-time keys in play). S / ↓ and ↑ only
  // change other moves (down + jump drops through a ledge, down / up + slash dive / rise): the tips
  // and MOVES teach them
  keyHelp: [
    { keys: ['A D', 'Left Right'], label: 'kh_run' },
    { keys: ['W', 'Up', 'Space'], label: 'kh_jump' },
    { keys: ['J', 'Z'], label: 'kh_slash' },
    { keys: ['K', 'X'], label: 'kh_shoot' },
    { keys: ['Shift', 'L', 'C'], label: 'kh_roll' },
    { keys: ['Esc'], label: 'kh_pause' },
  ],
  // a lost run may go on once from its last checkpoint, after a rewarded ad
  ads: { continue: (play) => (play as PlayScene).revive() },
  scenes: [PlayScene, OverlayScene],
  strings: STRINGS,
});
