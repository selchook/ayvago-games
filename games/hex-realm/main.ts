import Phaser from 'phaser';
import { launch, loadAudio, loadSfx, storage, labelTexture, bakePara, bakeFmt, glyphAtlas, isEasy, type GameMeta } from '@core';
import meta from './game.json';
import { PlayScene, TUT_KEYS, T_TITLE, T_BODY, S_SUM, S_SUM_SMALL, S_PLACE } from './PlayScene';
import { STRINGS } from './strings';
import { loadKit } from './kit';
import { makeSounds } from './audio';
import { View } from './view';
import { Battle, NO_INPUT } from './battle';
import { BattleBot, SKILL } from './bot';
import { Campaign, store } from './campaign';
import { HexMap } from './hexmap';
import { CLASS_IDS, PLACE_IDS, QUEST_IDS, type ArenaKind, type Room } from './defs';
import { REALM_THEME } from './menu';
import { TUT_W, SUMMARY_W } from './sizes';
import { t } from '@core';

// the campaign saves through the core storage
store.get = <T>(k: string, fallback: T) => storage.get<T>(k, fallback);
store.set = (k, v) => storage.set(k, v);

/** Showcase fights behind the menu. */
const MENU_FIGHTS: { arena: ArenaKind; room: Room; level: number }[] = [
  { arena: 'field', room: { arena: 'field', waves: [[['knight', 1], ['cultist', 1], ['ghoul', 2]], [['brute', 1], ['skeleton', 2]]], shrine: true }, level: 6 },
  { arena: 'fort', room: { arena: 'fort', waves: [[['skeleton', 3], ['archer', 1]], [['ghoul', 3], ['knight', 1]]], shrine: true }, level: 5 },
  { arena: 'farm', room: { arena: 'farm', waves: [[['bandit', 3], ['archer', 1]], [['bandit', 2], ['brute', 1]]], shrine: true }, level: 4 },
  { arena: 'forest', room: { arena: 'forest', waves: [[['cultist', 2], ['acolyte', 2]], [['knight', 1], ['ghoul', 3]]], shrine: true }, level: 7 },
];

launch({
  meta: meta as GameMeta,
  background: '#0e0b16',
  physics: 'none',
  difficulty: true,
  music: { menu: 'select', play: 'stage1' },
  preload(scene) {
    const l = scene.load;
    loadKit(l);
    const J = 'oga/junkala-sfx/';
    loadAudio(l, 'swing1', J + 'weapons/melee/sfx-wpn-sword1');
    loadAudio(l, 'swing2', J + 'weapons/melee/sfx-wpn-sword2');
    loadAudio(l, 'swing3', J + 'weapons/melee/sfx-wpn-sword3');
    loadAudio(l, 'hit', J + 'general-sounds/simple-damage-sounds/sfx-damage-hit3');
    loadAudio(l, 'crit', J + 'general-sounds/simple-damage-sounds/sfx-damage-hit8');
    loadAudio(l, 'kill', J + 'general-sounds/simple-damage-sounds/sfx-damage-hit10');
    loadSfx(l, 'bones', 'sfx-impact/audio/impactplank_medium_002');
    loadSfx(l, 'clang', 'sfx-impact/audio/impactmetal_light_002');
    loadSfx(l, 'break', 'sfx-impact/audio/impactmetal_heavy_001');
    loadAudio(l, 'hurt', J + 'general-sounds/negative-sounds/sfx-sounds-damage1');
    loadAudio(l, 'death', J + 'general-sounds/negative-sounds/sfx-sounds-negative2');
    loadAudio(l, 'lose', J + 'general-sounds/negative-sounds/sfx-sounds-negative1');
    loadSfx(l, 'roll', 'sfx-foley/audio/woosh/woosh4');
    loadSfx(l, 'dash', 'sfx-foley/audio/woosh/woosh7');
    loadSfx(l, 'whirl', 'sfx-foley/audio/woosh/woosh2');
    loadSfx(l, 'bow', 'sfx-foley/audio/woosh/woosh6');
    loadAudio(l, 'bowFoe', J + 'weapons/melee/sfx-wpn-dagger');
    loadAudio(l, 'zap', J + 'weapons/lasers/sfx-wpn-laser8');
    loadAudio(l, 'orb', J + 'weapons/lasers/sfx-wpn-laser3');
    loadAudio(l, 'fireball', J + 'explosions/various/sfx-exp-various2');
    loadAudio(l, 'boom', J + 'explosions/short/sfx-exp-short-soft4');
    loadAudio(l, 'slam', J + 'explosions/medium-length/sfx-exp-medium3');
    loadAudio(l, 'bossDie', J + 'explosions/long/sfx-exp-long3');
    loadAudio(l, 'frost', J + 'general-sounds/weird-sounds/sfx-sound-depressurizing');
    loadAudio(l, 'nova', J + 'general-sounds/weird-sounds/sfx-sound-vaporizing');
    loadAudio(l, 'holy', J + 'general-sounds/positive-sounds/sfx-sounds-powerup8');
    loadAudio(l, 'smite', J + 'general-sounds/positive-sounds/sfx-sounds-powerup11');
    loadAudio(l, 'blink', J + 'movement/portals-and-transitions/sfx-movement-portal3');
    loadAudio(l, 'spawn', J + 'movement/portals-and-transitions/sfx-movement-portal1');
    loadAudio(l, 'shrine', J + 'movement/portals-and-transitions/sfx-movement-portal5');
    loadAudio(l, 'coin', J + 'general-sounds/coins/sfx-coin-single2');
    loadAudio(l, 'buy', J + 'general-sounds/coins/sfx-coin-cluster3');
    loadAudio(l, 'power', J + 'general-sounds/positive-sounds/sfx-sounds-powerup2');
    loadAudio(l, 'heal', J + 'general-sounds/positive-sounds/sfx-sounds-powerup4');
    loadAudio(l, 'drink', J + 'general-sounds/interactions/sfx-sounds-interaction7');
    loadAudio(l, 'levelup', J + 'general-sounds/positive-sounds/sfx-sounds-powerup16');
    loadAudio(l, 'bash', J + 'general-sounds/impacts/sfx-sounds-impact3');
    loadAudio(l, 'palm', J + 'general-sounds/impacts/sfx-sounds-impact7');
    loadAudio(l, 'flurry', J + 'general-sounds/impacts/sfx-sounds-impact1');
    loadAudio(l, 'smoke', J + 'general-sounds/weird-sounds/sfx-sound-noise');
    loadAudio(l, 'volley', J + 'weapons/melee/sfx-wpn-sword2');
    loadAudio(l, 'trap', J + 'general-sounds/interactions/sfx-sounds-interaction3');
    loadAudio(l, 'trapSnap', J + 'general-sounds/impacts/sfx-sounds-impact10');
    loadAudio(l, 'wave', J + 'general-sounds/menu-sounds/sfx-menu-select1');
    loadAudio(l, 'move', J + 'general-sounds/menu-sounds/sfx-menu-move2');
    loadAudio(l, 'error', J + 'general-sounds/negative-sounds/sfx-sounds-error3');
    loadAudio(l, 'fanfare', J + 'general-sounds/fanfares/sfx-sounds-fanfare2');
    loadAudio(l, 'horn', J + 'general-sounds/fanfares/sfx-sounds-fanfare3');
    loadAudio(l, 'ambush', J + 'general-sounds/alarms/alarms/sfx-alarm-loop1');
    loadAudio(l, 'alarm', J + 'general-sounds/alarms/low-health-alarms/sfx-lowhealth-alarmloop4');
    loadAudio(l, 'clear', J + 'general-sounds/positive-sounds/sfx-sounds-powerup10');
    loadAudio(l, 'tele', J + 'general-sounds/weird-sounds/sfx-sound-bling');
    loadAudio(l, 'cast', J + 'general-sounds/weird-sounds/sfx-sound-poweron');
    loadAudio(l, 'door', J + 'movement/opening-doors/sfx-movement-dooropen1');
    loadAudio(l, 'step', J + 'movement/footsteps/sfx-movement-footsteps1a');
    loadAudio(l, 'reveal', J + 'general-sounds/positive-sounds/sfx-sounds-powerup6');
    loadSfx(l, 'anvil', 'sfx-impact/audio/impactbell_heavy_000');
    loadSfx(l, 'equip', 'sfx-foley/audio/swords/swordslide1');
    loadSfx(l, 'page', 'sfx-foley/audio/plating/platesslide3');
    // 1.1: the combos' and the powers' sounds
    loadAudio(l, 'leap', J + 'movement/jumping-and-landing/sfx-movement-jump12');
    loadAudio(l, 'land', J + 'movement/jumping-and-landing/sfx-movement-jump12-landing');
    loadAudio(l, 'punch1', J + 'weapons/melee/sfx-wpn-punch1');
    loadAudio(l, 'punch2', J + 'weapons/melee/sfx-wpn-punch3');
    loadAudio(l, 'cleave', J + 'general-sounds/impacts/sfx-sounds-impact12');
    loadAudio(l, 'charge', J + 'general-sounds/positive-sounds/sfx-sounds-powerup13');
    loadAudio(l, 'charged', J + 'general-sounds/positive-sounds/sfx-sounds-powerup18');
    loadAudio(l, 'sigil', J + 'general-sounds/coins/sfx-coin-double3');
    // the summary's, the training's and the place names' words, painted under the Ayvago intro
    l.once(Phaser.Loader.Events.COMPLETE, () => {
      const t0 = performance.now();
      for (const k of TUT_KEYS) { labelTexture(scene, t(k), T_TITLE); bakePara(scene, t(k), T_BODY, TUT_W - 90); }
      for (const k of ['fallenTitle', 'chapterTitle', 'restTitle', 'victoryTitle', 'riftTitle']) labelTexture(scene, t(k), S_SUM);
      bakeFmt(scene, 'sumRenown', ['n'], S_SUM);
      for (const k of ['sumLevel', 'sumKills', 'sumGold', 'lostGold']) bakeFmt(scene, k, ['n'], S_SUM_SMALL);
      bakeFmt(scene, 'lostGold', ['n'], { ...S_SUM_SMALL, color: '#8a1c24' });
      bakePara(scene, t('restore'), S_SUM_SMALL, SUMMARY_W - 90);
      bakePara(scene, t('sumDone'), S_SUM_SMALL, SUMMARY_W - 90);
      for (const q of QUEST_IDS) bakePara(scene, t('sumNext', { name: t('q_' + q) }), S_SUM_SMALL, SUMMARY_W - 90);
      for (const p of [...PLACE_IDS.map((x) => 'p_' + x), 'p_camp']) labelTexture(scene, t(p), S_PLACE);
      for (const k of ['enter', 'onward', 'tutSkip']) { labelTexture(scene, t(k), { size: 22 }); labelTexture(scene, t(k), { size: 24 }); labelTexture(scene, t(k), { size: 28 }); }
      glyphAtlas(scene, S_SUM); glyphAtlas(scene, S_SUM_SMALL);
      scene.registry.set('innerPaintMs', Math.round(performance.now() - t0));
    });
  },
  menuDecor(scene) {
    makeSounds(scene.game);
    // a live fight behind the menu: the autopilot plays the hero of the save on a showcase arena.
    // Building the world here also compiles every shader the Play scene uses (the map included).
    const camp = Campaign.load(isEasy() ? 'easy' : 'normal');
    const view = new View(scene, new HexMap(), camp.s.cls, { menu: true });
    let seed = 3, k = Math.floor(Math.random() * MENU_FIGHTS.length);
    let battle: Battle, bot: BattleBot;
    const fresh = () => {
      const f = MENU_FIGHTS[k++ % MENU_FIGHTS.length];
      const c = new Campaign('normal', null);
      c.reset(view.battle.heroCls);
      c.s.level = 8;
      battle = new Battle({ mode: 'normal', seed: seed++, stats: c.stats(), hp: 9999, potions: 3, rooms: [f.room], level: f.level });
      bot = new BattleBot(battle, SKILL.good, seed);
      view.battle.clear();
      view.setMode('battle', f.arena);
      view.battle.showArena(f.arena, battle.layoutSeed);
      view.battle.camDist = 0.95;
    };
    fresh();
    view.warm();
    let acc = 0;
    view.world.onFrame = (dt) => {
      acc += dt;
      let n = 0;
      while (acc > 1 / 60 && n < 4) {
        acc -= 1 / 60;
        n++;
        battle.hero.invuln = Math.max(battle.hero.invuln, 0.1);
        battle.step(1 / 60, battle.over ? NO_INPUT : bot.input(1 / 60));
        for (const ev of battle.events) { if (ev.type === 'room') continue; view.battle.handle(ev, battle); }
        battle.events.length = 0;
        if (battle.over || battle.time > 90) fresh();
      }
      if (n >= 4) acc = 0;
      view.syncBattle(battle, dt);
    };
    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => view.dispose());
  },
  // carved stone and gilded heraldry, a castle wall round the screen, the logo over a crowned shield (menu.ts)
  menuTheme: REALM_THEME,
  scenes: [PlayScene],
  strings: STRINGS,
});

void CLASS_IDS;
