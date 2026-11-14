import Phaser from 'phaser';
import { launch, loadAudio, loadSfx, t, type GameMeta } from '@core';
import meta from './game.json';
import { PlayScene, lastRunStamps } from './PlayScene';
import { ShopScene, Pill } from './shop';
import { STRINGS } from './strings';
import { loadKit } from './kit';
import { View, keepPrograms } from './view';
import { Sim, NO_INPUT } from './sim';
import { Bot, SKILL } from './bot';
import { loadMeta, saveMeta, lookOf } from './meta';
import { makeIcons } from './art';

launch({
  meta: meta as GameMeta,
  background: '#1a1230',
  physics: 'none',
  difficulty: true,
  preload(scene) {
    const l = scene.load;
    loadKit(l);
    const I = 'sfx-impact/audio/', F = 'sfx-foley/audio/', J = 'oga/junkala-sfx/';
    loadSfx(l, 'step1', I + 'footstep_concrete_000');
    loadSfx(l, 'step2', I + 'footstep_concrete_003');
    loadSfx(l, 'step3', I + 'footstep_concrete_001');
    loadSfx(l, 'land', I + 'impactsoft_medium_001');
    loadSfx(l, 'landHard', I + 'impactsoft_heavy_001');
    loadSfx(l, 'metal', I + 'impactmetal_light_001');
    loadSfx(l, 'wood', I + 'impactplank_medium_002');
    loadSfx(l, 'vault', I + 'impactwood_light_002');
    loadSfx(l, 'mantle', I + 'impactsoft_medium_002');
    loadSfx(l, 'bounce', I + 'impactplate_light_001');
    loadSfx(l, 'stumble', I + 'impactpunch_medium_002');
    loadSfx(l, 'smash', I + 'impactwood_heavy_002');
    loadSfx(l, 'bonk', I + 'impactsoft_heavy_002');
    loadSfx(l, 'deliver', I + 'impactwood_heavy_000');
    loadSfx(l, 'woosh', F + 'woosh/woosh2');
    loadSfx(l, 'woosh2', F + 'woosh/woosh7');
    loadSfx(l, 'roll', F + 'woosh/woosh4');
    loadSfx(l, 'paper', F + 'woosh/woosh6');
    loadSfx(l, 'slide', F + 'rocks/stonedrag3');
    loadSfx(l, 'zipGrab', F + 'plating/plateshit4');
    loadSfx(l, 'zip-src', F + 'swords/swordslide1');
    loadAudio(l, 'jump', J + 'movement/jumping-and-landing/sfx-movement-jump3');
    loadAudio(l, 'climb1', J + 'movement/climbing-ladder/sfx-movement-ladder1a');
    loadAudio(l, 'fall', J + 'movement/falling-sounds/sfx-sounds-falling3');
    loadAudio(l, 'stamp', J + 'general-sounds/coins/sfx-coin-single2');
    loadAudio(l, 'cash', J + 'general-sounds/coins/sfx-coin-cluster3');
    loadAudio(l, 'perfect', J + 'general-sounds/coins/sfx-coin-double3');
    loadAudio(l, 'bottle', J + 'general-sounds/positive-sounds/sfx-sounds-powerup4');
    loadAudio(l, 'spring', J + 'general-sounds/positive-sounds/sfx-sounds-powerup10');
    loadAudio(l, 'springGet', J + 'general-sounds/positive-sounds/sfx-sounds-powerup10');
    loadAudio(l, 'rush', J + 'general-sounds/positive-sounds/sfx-sounds-powerup13');
    loadAudio(l, 'district', J + 'general-sounds/fanfares/sfx-sounds-fanfare1');
    loadAudio(l, 'mission', J + 'general-sounds/fanfares/sfx-sounds-fanfare2');
    loadAudio(l, 'gold', J + 'general-sounds/fanfares/sfx-sounds-fanfare3');
    loadAudio(l, 'parcel', J + 'general-sounds/interactions/sfx-sounds-interaction5');
    loadAudio(l, 'missed', J + 'general-sounds/negative-sounds/sfx-sounds-negative1');
    loadAudio(l, 'flowLost', J + 'general-sounds/negative-sounds/sfx-sounds-negative2');
    loadAudio(l, 'late', J + 'general-sounds/negative-sounds/sfx-sounds-error6');
    loadAudio(l, 'shopNo', J + 'general-sounds/negative-sounds/sfx-sounds-error3');
    loadAudio(l, 'shopBuy', J + 'general-sounds/coins/sfx-coin-cluster3');
    loadAudio(l, 'tick', J + 'general-sounds/menu-sounds/sfx-menu-move2');
    loadAudio(l, 'move', J + 'general-sounds/simple-bleeps/sfx-sounds-blip3');
    loadAudio(l, 'praise', J + 'general-sounds/positive-sounds/sfx-sounds-powerup2');
    // power-ups, the fall's puff and the respawn
    const G = J + 'general-sounds/';
    loadAudio(l, 'pw_magnet', G + 'positive-sounds/sfx-sounds-powerup6');
    loadAudio(l, 'pw_glide', G + 'positive-sounds/sfx-sounds-powerup8');
    loadAudio(l, 'pw_shield', G + 'weird-sounds/sfx-sound-poweron');
    loadAudio(l, 'pw_double', G + 'coins/sfx-coin-double1');
    loadAudio(l, 'pw_watch', G + 'pause-sounds/sfx-sounds-pause2-in');
    loadAudio(l, 'pw_express', G + 'positive-sounds/sfx-sounds-powerup16');
    loadAudio(l, 'watchOut', G + 'pause-sounds/sfx-sounds-pause2-out');
    loadAudio(l, 'pwEnd', G + 'simple-bleeps/sfx-sounds-blip8');
    loadAudio(l, 'shieldPop', G + 'weird-sounds/sfx-sound-bling');
    loadAudio(l, 'rescue', J + 'movement/portals-and-transitions/sfx-movement-portal3');
    loadAudio(l, 'respawn', J + 'movement/portals-and-transitions/sfx-movement-portal1');
    loadAudio(l, 'poof', J + 'explosions/shortest/sfx-exp-shortest-soft1');
    loadAudio(l, 'stamp2', G + 'coins/sfx-coin-single4');
    loadAudio(l, 'hint', G + 'interactions/sfx-sounds-interaction9');
    loadAudio(l, 'levelUp', G + 'fanfares/sfx-sounds-fanfare2');
  },
  menuDecor(scene) {
    makeIcons(scene);
    // a live autopilot courier runs the rooftops behind the menu. Building it here also compiles
    // every shader the Play scene uses (keepPrograms), so the first Play frame compiles none.
    const seed = 41;
    const sim = new Sim('easy', seed);
    const bot = new Bot(sim, SKILL.good, seed);
    const view = new View(scene, sim, lookOf(loadMeta()));
    view.menuShift = 0.3;
    scene.add.rectangle(0, 0, scene.scale.width, scene.scale.height, 0x0c0818, 0.4).setOrigin(0).setDepth(-90);
    let acc = 0;
    let warm = false;
    view.world.onFrame = (dt) => {
      acc += dt;
      let n = 0;
      while (acc > 1 / 60 && n < 4) {
        acc -= 1 / 60;
        n++;
        sim.step(1 / 60, sim.over ? NO_INPUT : bot.input(1 / 60));
        for (const ev of sim.events) view.handle(ev, sim);
        sim.events.length = 0;
        // the courier never stops on the menu: a fall or a late parcel puts it back on the roof
        if (sim.over) sim.revive();
      }
      if (n >= 4) acc = 0;
      view.sync(sim, dt);
      if (!warm) { warm = true; keepPrograms(view.world.renderer, view.world.scene, view.world.camera); }
    };
  },
  // the shop: a button under the difficulty switch
  menuOption: {
    build(scene, x, y) {
      const btn = new Pill(scene, x, y + 6, 360, 86, 0xd0702a, () => open(), 28);
      const label = () => btn.setLabels(t('shop'), t('shopStamps', { n: loadMeta().stamps }));
      label();
      const open = () => {
        if (!scene.scene.isActive()) return;
        scene.scene.pause();
        scene.scene.launch('Shop', { from: scene.scene.key });
      };
      scene.events.on('shop-closed', label);
      scene.input.keyboard?.on('keydown-M', open);
      scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => scene.events.off('shop-closed', label));
      scene.tweens.add({ targets: btn, scale: 1.03, duration: 900, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    },
  },
  ads: {
    continue: (play) => (play as PlayScene).revive(),
    double: {
      show: () => lastRunStamps > 0,
      grant: () => { const m = loadMeta(); m.stamps += lastRunStamps; saveMeta(m); },
    },
  },
  scenes: [PlayScene, ShopScene],
  strings: STRINGS,
});
