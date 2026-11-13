import Phaser from 'phaser';
import { launch, loadAudio, loadSfx, t, type GameMeta } from '@core';
import meta from './game.json';
import { PlayScene } from './PlayScene';
import { TalentScene } from './talentsui';
import { STRINGS } from './strings';
import { loadKit } from './kit';
import { makeArt, DUST } from './art';
import { View } from './view';
import { Sim, NO_INPUT } from './sim';
import { Bot, SKILL } from './bot';
import { loadMeta } from './meta';
import { Pill } from './ui';

launch({
  meta: meta as GameMeta,
  background: '#0a0d1f',
  physics: 'none',
  difficulty: true,
  music: { play: 'level2' },
  preload(scene) {
    const l = scene.load;
    loadKit(l);
    const J = 'oga/junkala-sfx/';
    const K = 'sfx-sci-fi/audio/';
    loadSfx(l, 'shot', K + 'lasersmall_001');
    loadSfx(l, 'eshot', K + 'laserretro_000');
    loadSfx(l, 'bigShot', K + 'laserlarge_000');
    loadSfx(l, 'shieldUp', K + 'forcefield_000');
    loadSfx(l, 'bomb', K + 'lowfrequency_explosion_000');
    loadSfx(l, 'boom', K + 'explosioncrunch_000');
    loadSfx(l, 'boomMid', K + 'explosioncrunch_002');
    loadSfx(l, 'clink', K + 'impactmetal_001');
    loadAudio(l, 'missile', J + 'weapons/lasers/sfx-wpn-laser6');
    loadAudio(l, 'hit', J + 'general-sounds/simple-damage-sounds/sfx-damage-hit3');
    loadAudio(l, 'crit', J + 'general-sounds/simple-damage-sounds/sfx-damage-hit8');
    loadAudio(l, 'boomBig', J + 'explosions/medium-length/sfx-exp-medium4');
    loadAudio(l, 'bossBoom', J + 'explosions/long/sfx-exp-long3');
    loadAudio(l, 'partBoom', J + 'explosions/medium-length/sfx-exp-medium7');
    loadAudio(l, 'death', J + 'explosions/long/sfx-exp-long1');
    loadAudio(l, 'nova', J + 'explosions/various/sfx-exp-various4');
    loadAudio(l, 'overdrive', J + 'general-sounds/positive-sounds/sfx-sounds-powerup5');
    loadAudio(l, 'hurt', J + 'general-sounds/negative-sounds/sfx-sounds-damage1');
    loadAudio(l, 'deflect', J + 'general-sounds/simple-damage-sounds/sfx-damage-hit1');
    loadAudio(l, 'coin', J + 'general-sounds/coins/sfx-coin-single3');
    loadAudio(l, 'pickup', J + 'general-sounds/positive-sounds/sfx-sounds-powerup2');
    loadAudio(l, 'ready', J + 'general-sounds/menu-sounds/sfx-menu-select3');
    loadAudio(l, 'alarm', J + 'general-sounds/alarms/alarms/sfx-alarm-loop3');
    loadAudio(l, 'lowHull', J + 'general-sounds/alarms/low-health-alarms/sfx-lowhealth-alarmloop2');
    loadAudio(l, 'waveStart', J + 'movement/portals-and-transitions/sfx-movement-portal2');
    loadAudio(l, 'waveClear', J + 'general-sounds/positive-sounds/sfx-sounds-powerup12');
    loadAudio(l, 'warp', J + 'movement/portals-and-transitions/sfx-movement-portal5');
    loadAudio(l, 'fanfare', J + 'general-sounds/fanfares/sfx-sounds-fanfare2');
    loadAudio(l, 'phoenix', J + 'general-sounds/fanfares/sfx-sounds-fanfare1');
    loadAudio(l, 'reflex', J + 'general-sounds/weird-sounds/sfx-sound-depressurizing');
    loadAudio(l, 'chain', J + 'weapons/lasers/sfx-wpn-laser10');
    loadAudio(l, 'mine', J + 'explosions/shortest/sfx-exp-shortest-soft3');
    loadAudio(l, 'cardPick', J + 'general-sounds/positive-sounds/sfx-sounds-powerup10');
    loadAudio(l, 'epic', J + 'general-sounds/weird-sounds/sfx-sound-bling');
    loadAudio(l, 'move', J + 'general-sounds/menu-sounds/sfx-menu-move2');
    loadAudio(l, 'error', J + 'general-sounds/negative-sounds/sfx-sounds-error3');
    loadAudio(l, 'talent', J + 'general-sounds/positive-sounds/sfx-sounds-powerup13');
    loadAudio(l, 'refund', J + 'general-sounds/weird-sounds/sfx-sound-shutdown1');
    loadAudio(l, 'star', J + 'general-sounds/coins/sfx-coin-double4');
    loadAudio(l, 'dust', J + 'general-sounds/coins/sfx-coin-cluster5');
    const C = 'sfx-casino/audio/';
    loadSfx(l, 'cardFan', C + 'cardfan1');
    loadSfx(l, 'cardFlip', C + 'cardplace1');
    loadSfx(l, 'cardSlide', C + 'cardslide3');
    loadSfx(l, 'reroll', C + 'cardshuffle');
  },
  menuDecor(scene) {
    makeArt(scene);
    // an endless fight behind the menu: the autopilot flies an Easy run. Building it here also
    // compiles every shader the Play scene uses (View in menu mode keeps the programs).
    const view = new View(scene, { menu: true });
    let seed = 11;
    let sim = new Sim('easy', seed);
    let bot = new Bot(sim, SKILL.good);
    scene.add.rectangle(0, 0, scene.scale.width, scene.scale.height, 0x060818, 0.42).setOrigin(0).setDepth(-90);
    let acc = 0;
    view.world.onFrame = (dt) => {
      acc += dt;
      while (acc > 1 / 60) {
        acc -= 1 / 60;
        if (sim.phase === 'draft') sim.pick(bot.choose(sim.offer));
        sim.step(1 / 60, sim.over ? NO_INPUT : bot.input(1 / 60));
        for (const ev of sim.events) {
          view.handle(ev, sim);
          if (ev.type === 'sector') view.scenery.show(ev.n);
        }
        sim.events.length = 0;
        if (sim.over && sim.phaseT < -1.5) {
          seed++;
          sim = new Sim('easy', seed);
          bot = new Bot(sim, SKILL.good);
          view.reset();
          view.scenery.show(0);
        }
      }
      view.speed = sim.phase === 'warp' ? 40 : 5;
      view.sync(sim, dt);
    };
  },
  // the talent board: a button under the difficulty switch (T on the keyboard)
  menuOption: {
    build(scene, x, y) {
      const m = loadMeta();
      const btn = new Pill(scene, x, y + 6, 330, 86, 0x7a3fd0, () => open(), 28);
      btn.setIcon(DUST);
      const label = () => { const mm = loadMeta(); btn.setLabels(t('talents'), String(mm.dust)); };
      label();
      void m;
      const open = () => {
        if (!scene.scene.isActive()) return;
        scene.scene.pause();
        scene.scene.launch('Talents', { from: scene.scene.key });
      };
      scene.events.on('talents-closed', label);
      scene.input.keyboard?.on('keydown-T', open);
      scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => scene.events.off('talents-closed', label));
      scene.tweens.add({ targets: btn, scale: 1.03, duration: 900, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    },
  },
  scenes: [PlayScene, TalentScene],
  strings: STRINGS,
});
