import Phaser from 'phaser';
import { launch, loadAudio, loadSfx, steeringOption, type GameMeta } from '@core';
import meta from './game.json';
import { PlayScene } from './PlayScene';
import { STRINGS } from './strings';
import { loadKit } from './kit';
import { loadIcons, renderIconSheet } from './icons';
import { View } from './view';
import { Mission, newRun, mulberry, NO_INPUT } from './sim';
import { Bot, SKILL } from './bot';
import { DT, MISSIONS } from './defs';
import { noRanks } from './powers';
import { loadMeta } from './meta';
import { CONVOY_THEME } from './menu';
import { makeArt } from './art';
import { makeSounds } from './audio';

launch({
  meta: meta as GameMeta,
  background: '#120f0c',
  physics: 'none',
  difficulty: true,
  menuOption: steeringOption,
  music: { play: 'stage2' },
  preload(scene) {
    const l = scene.load;
    loadKit(l);
    loadIcons(l);
    const J = 'oga/junkala-sfx/';
    // guns and melee
    loadAudio(l, 'shot_pistol', J + 'weapons/single-shot-sounds/sfx-weapon-singleshot3');
    loadAudio(l, 'shot_smg', J + 'weapons/single-shot-sounds/sfx-weapon-singleshot7');
    loadAudio(l, 'shot_shotgun', J + 'weapons/shotgun/sfx-weapon-shotgun1');
    loadAudio(l, 'shot_rifle', J + 'weapons/single-shot-sounds/sfx-weapon-singleshot12');
    loadAudio(l, 'swing', J + 'weapons/melee/sfx-wpn-sword1');
    loadAudio(l, 'swingHeavy', J + 'weapons/melee/sfx-wpn-sword3');
    loadAudio(l, 'punch', J + 'weapons/melee/sfx-wpn-punch2');
    loadAudio(l, 'reload', J + 'weapons/out-of-ammo/sfx-wpn-reload');
    loadAudio(l, 'empty', J + 'weapons/out-of-ammo/sfx-wpn-noammo1');
    loadSfx(l, 'hit', 'sfx-impact/audio/impactpunch_medium_001');
    loadSfx(l, 'hitBig', 'sfx-impact/audio/impactpunch_heavy_002');
    loadSfx(l, 'splat', 'sfx-impact/audio/impactsoft_heavy_001');
    loadSfx(l, 'splatBig', 'sfx-impact/audio/impactsoft_heavy_003');
    loadSfx(l, 'metal', 'sfx-impact/audio/impactmetal_medium_002');
    loadSfx(l, 'wood', 'sfx-impact/audio/impactwood_heavy_001');
    loadSfx(l, 'reloaded', 'sfx-impact/audio/impactmetal_light_001');
    loadSfx(l, 'swap', 'sfx-foley/audio/woosh/woosh4');
    loadSfx(l, 'roll', 'sfx-foley/audio/woosh/woosh6');
    loadSfx(l, 'scrape', 'sfx-foley/audio/rocks/stonedrag1');
    // finishers, abilities and booms
    loadAudio(l, 'finisherA', J + 'explosions/shortest/sfx-exp-shortest-hard3');
    loadAudio(l, 'finisherB', J + 'explosions/short/sfx-exp-short-hard6');
    loadAudio(l, 'ab_barricade', J + 'general-sounds/impacts/sfx-sounds-impact8');
    loadAudio(l, 'ab_flare', J + 'weapons/grenade-whistles/sfx-wpn-grenadewhistle1');
    loadAudio(l, 'ab_heal', J + 'general-sounds/positive-sounds/sfx-sounds-powerup2');
    loadAudio(l, 'ab_warcry', J + 'weapons/cannon/sfx-wpn-cannon2');
    loadAudio(l, 'ready', J + 'general-sounds/positive-sounds/sfx-sounds-powerup9');
    loadAudio(l, 'burst', J + 'explosions/short/sfx-exp-short-soft4');
    loadAudio(l, 'blast', J + 'explosions/shortest/sfx-exp-shortest-soft3');
    loadAudio(l, 'slam', J + 'explosions/short/sfx-exp-short-hard2');
    loadAudio(l, 'bossDie', J + 'explosions/long/sfx-exp-long3');
    loadAudio(l, 'explode', J + 'explosions/medium-length/sfx-exp-medium4');
    loadAudio(l, 'gate', J + 'explosions/medium-length/sfx-exp-medium2');
    loadAudio(l, 'crash', J + 'general-sounds/impacts/sfx-sounds-impact11');
    loadAudio(l, 'break', J + 'general-sounds/impacts/sfx-sounds-impact3');
    loadAudio(l, 'shield', J + 'general-sounds/positive-sounds/sfx-sounds-powerup13');
    loadAudio(l, 'tell', J + 'general-sounds/simple-bleeps/sfx-sounds-blip4');
    loadAudio(l, 'tellSmall', J + 'general-sounds/simple-bleeps/sfx-sounds-blip1');
    // the survivor
    loadAudio(l, 'hurt', J + 'general-sounds/negative-sounds/sfx-sounds-damage1');
    loadAudio(l, 'hurtSoft', J + 'general-sounds/simple-damage-sounds/sfx-damage-hit3');
    loadAudio(l, 'grab', J + 'death-screams/human/sfx-deathscream-human4');
    loadAudio(l, 'revive', J + 'general-sounds/positive-sounds/sfx-sounds-powerup5');
    loadAudio(l, 'lose', J + 'general-sounds/negative-sounds/sfx-sounds-negative2');
    // the dog, pickups, objectives
    loadAudio(l, 'bite', J + 'weapons/melee/sfx-wpn-punch4');
    loadAudio(l, 'found', J + 'general-sounds/positive-sounds/sfx-sounds-powerup10');
    loadAudio(l, 'coin', J + 'general-sounds/coins/sfx-coin-single1');
    loadAudio(l, 'ammo', J + 'weapons/out-of-ammo/sfx-wpn-reload');
    loadAudio(l, 'heal', J + 'general-sounds/positive-sounds/sfx-sounds-powerup2');
    loadAudio(l, 'chest', J + 'general-sounds/coins/sfx-coin-cluster5');
    loadAudio(l, 'item', J + 'general-sounds/positive-sounds/sfx-sounds-powerup12');
    loadAudio(l, 'freed', J + 'general-sounds/fanfares/sfx-sounds-fanfare1');
    loadAudio(l, 'stage', J + 'general-sounds/positive-sounds/sfx-sounds-powerup4');
    loadAudio(l, 'board', J + 'movement/portals-and-transitions/sfx-movement-portal5');
    loadAudio(l, 'alarm', J + 'general-sounds/alarms/alarms/sfx-alarm-loop1');
    loadAudio(l, 'bossIn', J + 'general-sounds/alarms/alarms/sfx-alarm-loop3');
    loadAudio(l, 'fanfare', J + 'general-sounds/fanfares/sfx-sounds-fanfare2');
    loadAudio(l, 'fanfareS', J + 'general-sounds/positive-sounds/sfx-sounds-powerup16');
    // the drive
    loadAudio(l, 'engine', J + 'movement/vehicles/sfx-vehicle-engineloop');
    loadAudio(l, 'engineStart', J + 'movement/vehicles/sfx-vehicle-breaks');
    loadAudio(l, 'nitro', J + 'weapons/grenade-whistles/sfx-wpn-missilelaunch');
    loadAudio(l, 'go', J + 'general-sounds/menu-sounds/sfx-menu-select2');
    // screens
    loadAudio(l, 'levelup', J + 'general-sounds/positive-sounds/sfx-sounds-powerup16');
    loadAudio(l, 'star', J + 'general-sounds/coins/sfx-coin-double4');
    loadAudio(l, 'buy', J + 'general-sounds/coins/sfx-coin-cluster3');
    loadAudio(l, 'deny', J + 'general-sounds/negative-sounds/sfx-sounds-error1');
    loadAudio(l, 'move', J + 'general-sounds/menu-sounds/sfx-menu-move2');
    loadAudio(l, 'pick', J + 'general-sounds/menu-sounds/sfx-menu-select3');
    loadAudio(l, 'start', J + 'general-sounds/menu-sounds/sfx-menu-select2');
    loadSfx(l, 'card', 'sfx-casino/audio/cardslide3');
    loadSfx(l, 'deal', 'sfx-casino/audio/cardfan1');
    l.once(Phaser.Loader.Events.COMPLETE, () => makeSounds(scene.game));
  },
  menuDecor(scene) {
    makeArt(scene);
    // a live fight behind the menu: the autopilot holds the square on Main Street with the dog
    const m = loadMeta();
    const view = new View(scene, { hero: m.hero, dog: m.dog, quality: 0.85 });
    (window as unknown as Record<string, unknown>).__lcIcons = () => renderIconSheet(view.world.renderer);
    let seed = 21;
    const fresh = () => {
      const run = newRun('normal', 'campaign', m.hero, m.heroes.find((h) => h !== m.hero) ?? (m.hero === 'matt' ? 'lis' : 'matt'), m.dog, noRanks());
      run.cards = ['fury', 'heavy'];
      const sim = new Mission(MISSIONS[2], run, seed++);
      const a = sim.plan.arena;
      sim.hero.x = a.x - 2; sim.hero.z = a.z + 2;
      sim.dog.x = a.x; sim.dog.z = a.z + 3;
      if (sim.buddy) { sim.buddy.x = a.x - 4; sim.buddy.z = a.z + 3; }
      for (let i = 0; i < 9; i++) { const ang = (i / 9) * Math.PI * 2; sim.spawn(i % 4 === 0 ? 'runner' : 'basic', a.x + Math.cos(ang) * 9, a.z + Math.sin(ang) * 8, 'hunt'); }
      view.buildTown(sim.plan, { id: 'pickup', ...sim.convoy });
      const bot = new Bot(sim, SKILL.good, mulberry(seed));
      bot.stay = { x: a.x, z: a.z + 2 };
      return { sim, bot };
    };
    let cur = fresh();
    for (let i = 0; i < 60 * 2; i++) { cur.sim.step(DT, cur.bot.input(DT)); cur.sim.events.length = 0; }
    view.warm();
    let acc = 0;
    view.world.onFrame = (dt) => {
      acc += dt;
      let n = 0;
      while (acc > DT && n < 4) {
        acc -= DT;
        n++;
        const s = cur.sim;
        s.hero.hp = Math.max(s.hero.hp, s.hero.max * 0.5);
        s.step(DT, s.phase === 'play' ? cur.bot.input(DT) : NO_INPUT);
        for (const e of s.events) view.handle(e, s);
        s.events.length = 0;
        // keep the fight going: more of them wander in
        if (s.alive < 8 && Math.random() < 0.02) { const sp = s.plan.spawns[Math.floor(Math.random() * s.plan.spawns.length)]; s.spawn('basic', sp.x, sp.z, 'hunt'); }
        if (s.phase !== 'play' || s.time > 150) cur = fresh();
      }
      if (n >= 4) acc = 0;
      view.sync(cur.sim, dt);
    };
    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => view.dispose());
  },
  menuTheme: CONVOY_THEME,
  // a lost mission (on foot or on the drive) may go on once, after a rewarded ad
  ads: { continue: (play) => (play as PlayScene).revive(), canContinue: (play) => (play as PlayScene).canContinue() },
  scenes: [PlayScene],
  strings: STRINGS,
});
