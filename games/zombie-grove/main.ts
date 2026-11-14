import Phaser from 'phaser';
import { launch, loadAudio, loadSfx, t, type GameMeta } from '@core';
import meta from './game.json';
import { PlayScene } from './PlayScene';
import { CampScene } from './camp';
import { STRINGS } from './strings';
import { loadKit } from './kit';
import { makeArt, COIN } from './art';
import { makeSounds } from './audio';
import { View } from './view';
import { Sim, NO_INPUT } from './sim';
import { Bot, SKILL } from './bot';
import { NO_META } from './meta';
import { loadMeta } from './save';
import { Pill } from './ui';

launch({
  meta: meta as GameMeta,
  background: '#0d1410',
  physics: 'none',
  difficulty: true,
  music: { play: 'level3' },
  preload(scene) {
    const l = scene.load;
    loadKit(l);
    const J = 'oga/junkala-sfx/';
    loadAudio(l, 'swing', J + 'weapons/melee/sfx-wpn-sword1');
    loadAudio(l, 'swingBig', J + 'weapons/melee/sfx-wpn-sword3');
    loadSfx(l, 'thrust', 'sfx-foley/audio/woosh/woosh4');
    loadSfx(l, 'toss', 'sfx-foley/audio/woosh/woosh6');
    loadAudio(l, 'bow', J + 'weapons/melee/sfx-wpn-dagger');
    loadAudio(l, 'blaster', J + 'weapons/lasers/sfx-wpn-laser8');
    loadAudio(l, 'laser', J + 'weapons/lasers/sfx-wpn-laser2');
    loadAudio(l, 'zap', J + 'weapons/lasers/sfx-wpn-laser10');
    loadAudio(l, 'ignite', J + 'explosions/shortest/sfx-exp-shortest-soft3');
    loadSfx(l, 'clang', 'sfx-impact/audio/impactmetal_light_002');
    loadAudio(l, 'hit', J + 'general-sounds/simple-damage-sounds/sfx-damage-hit3');
    loadAudio(l, 'crit', J + 'general-sounds/simple-damage-sounds/sfx-damage-hit8');
    loadSfx(l, 'squish', 'sfx-impact/audio/impactsoft_medium_001');
    loadAudio(l, 'boom', J + 'explosions/short/sfx-exp-short-soft4');
    loadAudio(l, 'slam', J + 'explosions/medium-length/sfx-exp-medium4');
    loadAudio(l, 'bossDie', J + 'explosions/long/sfx-exp-long3');
    loadAudio(l, 'fuse', J + 'general-sounds/weird-sounds/sfx-sound-vaporizing');
    loadAudio(l, 'spit', J + 'general-sounds/interactions/sfx-sounds-interaction7');
    loadAudio(l, 'charge', J + 'general-sounds/weird-sounds/sfx-sound-depressurizing');
    loadAudio(l, 'hurt', J + 'general-sounds/negative-sounds/sfx-sounds-damage1');
    loadAudio(l, 'death', J + 'general-sounds/negative-sounds/sfx-sounds-negative2');
    loadAudio(l, 'gem', J + 'general-sounds/coins/sfx-coin-single1');
    loadAudio(l, 'coin', J + 'general-sounds/coins/sfx-coin-double2');
    loadAudio(l, 'coins', J + 'general-sounds/coins/sfx-coin-cluster5');
    loadAudio(l, 'buy', J + 'general-sounds/coins/sfx-coin-cluster3');
    loadAudio(l, 'heal', J + 'general-sounds/positive-sounds/sfx-sounds-powerup2');
    loadAudio(l, 'magnet', J + 'general-sounds/positive-sounds/sfx-sounds-powerup7');
    loadAudio(l, 'chest', J + 'general-sounds/positive-sounds/sfx-sounds-powerup12');
    loadAudio(l, 'levelup', J + 'general-sounds/positive-sounds/sfx-sounds-powerup4');
    loadAudio(l, 'evolve', J + 'general-sounds/positive-sounds/sfx-sounds-powerup13');
    loadAudio(l, 'revive', J + 'general-sounds/positive-sounds/sfx-sounds-powerup5');
    loadAudio(l, 'alarm', J + 'general-sounds/alarms/alarms/sfx-alarm-loop3');
    loadAudio(l, 'fanfare', J + 'general-sounds/fanfares/sfx-sounds-fanfare2');
    loadAudio(l, 'dawn', J + 'general-sounds/fanfares/sfx-sounds-fanfare1');
    loadAudio(l, 'offer', J + 'general-sounds/menu-sounds/sfx-menu-select1');
    loadAudio(l, 'move', J + 'general-sounds/menu-sounds/sfx-menu-move2');
    loadAudio(l, 'error', J + 'general-sounds/negative-sounds/sfx-sounds-error3');
    loadAudio(l, 'cardPick', J + 'general-sounds/positive-sounds/sfx-sounds-powerup10');
    loadAudio(l, 'epic', J + 'general-sounds/weird-sounds/sfx-sound-bling');
    loadAudio(l, 'star', J + 'general-sounds/coins/sfx-coin-double4');
    loadAudio(l, 'slowIn', J + 'general-sounds/pause-sounds/sfx-sounds-pause3-in');
    loadAudio(l, 'slowOut', J + 'general-sounds/pause-sounds/sfx-sounds-pause3-out');
    loadSfx(l, 'step', 'sfx-impact/audio/footstep_grass_001');
    const C = 'sfx-casino/audio/';
    loadSfx(l, 'cardFan', C + 'cardfan1');
    loadSfx(l, 'cardSlide', C + 'cardslide3');
    loadSfx(l, 'reroll', C + 'cardshuffle');
  },
  menuDecor(scene) {
    makeArt(scene);
    makeSounds(scene.game);
    // a live night behind the menu: the autopilot fights in the grove. Building it here also
    // compiles every shader the Play scene uses (View in menu mode keeps the programs).
    const view = new View(scene, { hero: loadMeta().hero, menu: true });
    let seed = 7;
    const fresh = () => {
      const s = new Sim('normal', seed++, { ...NO_META, weapons: ['blade', 'bow', 'spear', 'blaster', 'wards', 'torch', 'robot'] });
      // straight into a busy night with a few weapons
      s.setTime(260);
      s.weapons = [{ id: 'blade', lv: 4, evo: false }, { id: 'wards', lv: 3, evo: false }, { id: 'torch', lv: 3, evo: false }, { id: 'robot', lv: 2, evo: false }];
      s.passives = [{ id: 'vigor', lv: 5 }, { id: 'armor', lv: 5 }, { id: 'regen', lv: 5 }];
      s.recalc();
      s.player.hp = s.player.maxHp;
      s.horde(60);
      return s;
    };
    let sim = fresh();
    let bot = new Bot(sim, SKILL.good);
    scene.add.rectangle(0, 0, scene.scale.width, scene.scale.height, 0x060a08, 0.38).setOrigin(0).setDepth(-90);
    let acc = 0;
    view.world.onFrame = (dt) => {
      acc += dt;
      let n = 0;
      while (acc > 1 / 60 && n < 4) {
        acc -= 1 / 60;
        n++;
        sim.takeAll((cards) => bot.choose(cards));
        sim.step(1 / 60, sim.over ? NO_INPUT : bot.input(1 / 60));
        for (const ev of sim.events) view.handle(ev, sim);
        sim.events.length = 0;
        // never let the backdrop end: a fresh night when the hero falls or the time runs long
        if (sim.phase !== 'night' || sim.time > 400) {
          sim = fresh();
          bot = new Bot(sim, SKILL.good);
          view.heroDead = false;
          view.hero.play('idle', { fade: 0.2 });
        }
      }
      if (n >= 4) acc = 0;
      view.sync(sim, dt);
    };
    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => view.dispose());
  },
  // the camp: a button under the difficulty switch (C on the keyboard)
  menuOption: {
    build(scene, x, y) {
      makeArt(scene);
      const btn = new Pill(scene, x, y + 6, 330, 86, 0x8a5a2a, () => open(), 28);
      btn.setIcon(COIN);
      const label = () => { const m = loadMeta(); btn.setLabels(t('camp'), String(m.coins)); };
      label();
      const open = () => {
        if (!scene.scene.isActive()) return;
        scene.scene.pause();
        scene.scene.launch('Camp', { from: scene.scene.key });
      };
      scene.events.on('camp-closed', label);
      scene.input.keyboard?.on('keydown-C', open);
      scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => scene.events.off('camp-closed', label));
      scene.tweens.add({ targets: btn, scale: 1.03, duration: 900, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    },
  },
  scenes: [PlayScene, CampScene],
  strings: STRINGS,
});
