import Phaser from 'phaser';
import { launch, loadAudio, loadSfx, type GameMeta } from '@core';
import meta from './game.json';
import { PlayScene, prebakePlay } from './PlayScene';
import { STRINGS } from './strings';
import { loadKit } from './kit';
import { loadIcons } from './icons';
import { View } from './view';
import { MapView, BaseView } from './mapview';
import { Mission, newRun, mulberry, NO_INPUT } from './sim';
import { Bot, SKILL } from './bot';
import { DT, type MissionDef } from './defs';
import { loadMeta } from './meta';
import { ASTRO_THEME } from './menu';
import { makeArt } from './art';

/** The menu's backdrop: a busy fight on the dune planet. */
const BACKDROP: MissionDef = { n: 5, theme: 'desert', kind: 'clear', planet: 'planet-6', count: 99, par: 999, foes: ['xs', 's', 'fly', 'brute'] };

launch({
  meta: meta as GameMeta,
  background: '#07061a',
  physics: 'none',
  difficulty: true,
  music: { play: 'stage1' },
  preload(scene) {
    const l = scene.load;
    loadKit(l);
    loadIcons(l);
    const J = 'oga/junkala-sfx/';
    // weapons
    loadAudio(l, 'shot_bubble', J + 'general-sounds/interactions/sfx-sounds-interaction5');
    loadAudio(l, 'shot_sting', J + 'weapons/lasers/sfx-wpn-laser8');
    loadAudio(l, 'shot_laser', J + 'weapons/lasers/sfx-wpn-laser2');
    loadAudio(l, 'shot_ember', J + 'weapons/cannon/sfx-wpn-cannon2');
    loadAudio(l, 'shot_cannon', J + 'weapons/cannon/sfx-wpn-cannon4');
    loadAudio(l, 'power', J + 'weapons/lasers/sfx-wpn-laser10');
    loadAudio(l, 'zap', J + 'weapons/lasers/sfx-wpn-laser5');
    loadAudio(l, 'hit', J + 'general-sounds/simple-damage-sounds/sfx-damage-hit3');
    loadAudio(l, 'punch', J + 'weapons/melee/sfx-wpn-punch2');
    loadAudio(l, 'kick', J + 'weapons/melee/sfx-wpn-punch4');
    loadAudio(l, 'roll', J + 'movement/jumping-and-landing/sfx-movement-jump8');
    // the crew's skills and the mech
    loadAudio(l, 'skill_frog', J + 'movement/jumping-and-landing/sfx-movement-jump12');
    loadAudio(l, 'skill_bee', J + 'general-sounds/weird-sounds/sfx-sound-bling');
    loadAudio(l, 'skill_flamingo', J + 'weapons/lasers/sfx-wpn-laser11');
    loadAudio(l, 'skill_panda', J + 'weapons/grenade-whistles/sfx-wpn-grenadewhistle1');
    loadAudio(l, 'mechOn', J + 'general-sounds/positive-sounds/sfx-sounds-powerup13');
    loadAudio(l, 'mechOff', J + 'general-sounds/pause-sounds/sfx-sounds-pause3-out');
    loadAudio(l, 'ready', J + 'general-sounds/positive-sounds/sfx-sounds-powerup9');
    // booms
    loadAudio(l, 'pop', J + 'general-sounds/interactions/sfx-sounds-interaction7');
    loadAudio(l, 'boom', J + 'explosions/short/sfx-exp-short-soft4');
    loadAudio(l, 'bigBoom', J + 'explosions/medium-length/sfx-exp-medium4');
    loadAudio(l, 'ember', J + 'explosions/shortest/sfx-exp-shortest-soft3');
    loadAudio(l, 'slam', J + 'explosions/short/sfx-exp-short-hard6');
    loadAudio(l, 'nova', J + 'movement/portals-and-transitions/sfx-movement-portal2');
    loadAudio(l, 'bossDie', J + 'explosions/long/sfx-exp-long3');
    loadAudio(l, 'scream', J + 'death-screams/alien/sfx-deathscream-alien3');
    // aliens
    loadAudio(l, 'portal', J + 'movement/portals-and-transitions/sfx-movement-portal1');
    loadAudio(l, 'spit', J + 'general-sounds/interactions/sfx-sounds-interaction12');
    loadAudio(l, 'tele', J + 'general-sounds/simple-bleeps/sfx-sounds-blip4');
    loadAudio(l, 'bossIn', J + 'general-sounds/alarms/alarms/sfx-alarm-loop3');
    loadAudio(l, 'rage', J + 'death-screams/alien/sfx-deathscream-alien5');
    loadAudio(l, 'alarm', J + 'general-sounds/alarms/alarms/sfx-alarm-loop1');
    // the hero
    loadAudio(l, 'hurt', J + 'general-sounds/negative-sounds/sfx-sounds-damage1');
    loadAudio(l, 'shieldHit', J + 'general-sounds/impacts/sfx-sounds-impact3');
    loadAudio(l, 'death', J + 'general-sounds/negative-sounds/sfx-sounds-negative2');
    loadAudio(l, 'revive', J + 'general-sounds/positive-sounds/sfx-sounds-powerup5');
    loadAudio(l, 'lowhp', J + 'general-sounds/alarms/low-health-alarms/sfx-lowhealth-alarmloop1');
    loadAudio(l, 'lose', J + 'general-sounds/negative-sounds/sfx-sounds-negative1');
    // pickups and objectives
    loadAudio(l, 'gem', J + 'general-sounds/coins/sfx-coin-single1');
    loadAudio(l, 'coins', J + 'general-sounds/coins/sfx-coin-cluster5');
    loadAudio(l, 'heal', J + 'general-sounds/positive-sounds/sfx-sounds-powerup2');
    loadAudio(l, 'ammo', J + 'weapons/out-of-ammo/sfx-wpn-reload');
    loadAudio(l, 'thunder', J + 'general-sounds/positive-sounds/sfx-sounds-powerup7');
    loadAudio(l, 'crate', J + 'general-sounds/impacts/sfx-sounds-impact8');
    loadAudio(l, 'key', J + 'general-sounds/positive-sounds/sfx-sounds-powerup10');
    loadAudio(l, 'beacon', J + 'general-sounds/positive-sounds/sfx-sounds-powerup12');
    loadAudio(l, 'fixed', J + 'general-sounds/positive-sounds/sfx-sounds-powerup4');
    loadAudio(l, 'domeHit', J + 'general-sounds/impacts/sfx-sounds-impact11');
    loadAudio(l, 'levelup', J + 'general-sounds/positive-sounds/sfx-sounds-powerup16');
    // screens
    loadAudio(l, 'fanfare', J + 'general-sounds/fanfares/sfx-sounds-fanfare2');
    loadAudio(l, 'star', J + 'general-sounds/coins/sfx-coin-double4');
    loadAudio(l, 'warp', J + 'movement/portals-and-transitions/sfx-movement-portal5');
    loadAudio(l, 'land', J + 'movement/jumping-and-landing/sfx-movement-jump10-landing');
    loadAudio(l, 'buy', J + 'general-sounds/coins/sfx-coin-cluster3');
    loadAudio(l, 'deny', J + 'general-sounds/negative-sounds/sfx-sounds-error1');
    loadAudio(l, 'move', J + 'general-sounds/menu-sounds/sfx-menu-move2');
    loadAudio(l, 'pick', J + 'general-sounds/menu-sounds/sfx-menu-select3');
    loadAudio(l, 'start', J + 'general-sounds/menu-sounds/sfx-menu-select2');
    loadSfx(l, 'click', 'sfx-interface/audio/click_002');
    loadSfx(l, 'card', 'sfx-casino/audio/cardslide3');
    loadSfx(l, 'deal', 'sfx-casino/audio/cardfan1');
    l.once(Phaser.Loader.Events.COMPLETE, () => prebakePlay(scene));
  },
  menuDecor(scene) {
    makeArt(scene);
    // a live fight behind the menu: the autopilot plays on the dune planet. Building it here, with
    // the star map and the base, also compiles every shader the Play scene uses.
    const hero = loadMeta().crew;
    const view = new View(scene, { hero });
    const map = new MapView(view);
    const base = new BaseView(view, hero);
    base.build({ hull: 3, armory: 3, lab: 3, thrusters: 3, solar: 3, radar: 3, drone: 3 });
    view.warm();
    view.setMode('arena');
    void map;
    let seed = 11;
    const fresh = () => {
      const run = newRun('normal', hero, { hull: 2, armory: 2, lab: 1, thrusters: 1, solar: 1, radar: 1, drone: 1 });
      run.cards = ['blades', 'twin', 'flame'];
      run.depth = 2;
      const sim = new Mission(BACKDROP, run, seed++);
      view.buildMission(BACKDROP, sim);
      return { sim, bot: new Bot(sim, SKILL.good, mulberry(seed)) };
    };
    let cur = fresh();
    for (let i = 0; i < 60 * 6; i++) { cur.sim.step(DT, cur.bot.input(DT)); cur.sim.events.length = 0; cur.sim.pendingLevels = 0; }
    let acc = 0;
    view.world.onFrame = (dt) => {
      acc += dt;
      let n = 0;
      while (acc > DT && n < 4) {
        acc -= DT;
        n++;
        const s = cur.sim;
        s.hero.hp = Math.max(s.hero.hp, s.hero.max * 0.5);
        s.pendingLevels = 0;
        if (s.hero.charge >= 1 && Math.random() < 0.02) s.step(DT, { ...NO_INPUT, mech: true });
        else s.step(DT, s.phase === 'play' ? cur.bot.input(DT) : NO_INPUT);
        for (const e of s.events) view.handle(e, s);
        s.events.length = 0;
        if (s.phase !== 'play' || s.time > 240) cur = fresh();
      }
      if (n >= 4) acc = 0;
      view.sync(cur.sim, dt);
    };
    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => { view.dispose(); base.dispose(); });
  },
  menuTheme: ASTRO_THEME,
  // a lost mission may go on once, after a rewarded ad (the hero back up, or the dome patched)
  ads: { continue: (play) => (play as PlayScene).revive() },
  scenes: [PlayScene],
  strings: STRINGS,
});
