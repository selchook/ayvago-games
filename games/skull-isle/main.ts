import Phaser from 'phaser';
import { launch, loadAudio, loadSfx, t, txt, playSfx, type GameMeta } from '@core';
import meta from './game.json';
import { PlayScene } from './PlayScene';
import { BoardScene } from './board';
import { STRINGS } from './strings';
import { loadKit } from './kit';
import { makeArt, MAP, DOUBLOON } from './art';
import { makeSounds } from './audio';
import { View } from './view';
import { Sim, NO_INPUT } from './sim';
import { Bot, SKILL } from './bot';
import { loadMeta, saveMeta } from './meta';
import { ALL_NODES } from './upgrades';
import { HERO, type HeroId } from './defs';
import { glass, Pill } from './ui';

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
    loadSfx(l, 'card', 'sfx-casino/audio/cardslide3');
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
    scene.add.rectangle(0, 0, scene.scale.width, scene.scale.height, 0x061018, 0.34).setOrigin(0).setDepth(-90);
    let acc = 0;
    view.world.onFrame = (dt) => {
      acc += dt;
      let n = 0;
      while (acc > 1 / 60 && n < 4) {
        acc -= 1 / 60;
        n++;
        sim.p.invuln = Math.max(sim.p.invuln, 0.1);
        if (sim.phase === 'shop') { bot.shop(); sim.leaveShop(); }
        if (sim.phase === 'draft') sim.pickBoon(0);
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
      const touch = scene.sys.game.device.input.touch;
      const sel = scene.add.container(x - 112, y + 4);
      sel.add(glass(scene, 420, 104, { r: 24, color: 0x0e1a24, alpha: 0.86 }));
      const name = txt(scene, 0, -24, '', { title: true, size: 30, color: '#ffd23f', strokeThickness: 0, shadow: false });
      const desc = txt(scene, 0, 16, '', { size: 16, color: '#e6eef4', strokeThickness: 0, shadow: false, wrap: 290 });
      sel.add([name, desc]);
      const arrow = (dx: number, dir: 1 | -1) => {
        const g = scene.add.graphics();
        g.fillStyle(0xffffff, 0.14).fillCircle(dx, 0, 30);
        g.fillStyle(0xffd23f, 1).fillTriangle(dx + dir * 12, 0, dx - dir * 8, -13, dx - dir * 8, 13);
        const hit = scene.add.zone(dx, 0, 90, 104).setInteractive({ useHandCursor: true });
        hit.on('pointerup', () => cycle(dir));
        sel.add([g, hit]);
      };
      arrow(-174, -1);
      arrow(174, 1);
      const show = () => {
        const mm = loadMeta();
        name.setText(t('h_' + mm.hero));
        desc.setText(t('hd_' + mm.hero));
        if (desc.height > 44) desc.setScale(44 / desc.height); else desc.setScale(1);
        name.setColor('#' + HERO[mm.hero].color.toString(16).padStart(6, '0'));
      };
      const cycle = (dir: 1 | -1) => {
        const mm = loadMeta();
        const list = mm.heroes;
        const i = list.indexOf(mm.hero);
        mm.hero = list[(i + dir + list.length) % list.length] as HeroId;
        saveMeta(mm);
        playSfx(scene, 'move', { volume: 0.4 });
        show();
        scene.tweens.add({ targets: sel, scale: 1.04, duration: 80, yoyo: true });
        menuView?.setHero(mm.hero);
      };
      show();
      const map = new Pill(scene, x + 220, y + 4, 196, 104, 0x8a5a2a, () => open(), 28);
      map.setIcon(DOUBLOON, 26);
      const label = () => { map.setLabels(t('map'), String(loadMeta().doubloons)); map.main.setX(20); };
      label();
      map.add(scene.add.image(-map.main.width / 2 - 8, -12, MAP).setDisplaySize(40, 40));
      const open = () => {
        if (!scene.scene.isActive()) return;
        scene.scene.pause();
        scene.scene.launch('Board', { from: scene.scene.key });
      };
      const closed = () => { label(); show(); };
      scene.events.on('map-closed', closed);
      scene.input.keyboard?.on('keydown-M', open);
      scene.input.keyboard?.on('keydown-H', () => cycle(1));
      scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => scene.events.off('map-closed', closed));
      if (!touch) txt(scene, x, y + 74, t('heroKeys'), { size: 17, color: '#9fc0d8', strokeThickness: 0, shadow: false });
    },
  },
  scenes: [PlayScene, BoardScene],
  strings: STRINGS,
});
