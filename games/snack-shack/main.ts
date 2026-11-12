import { launch, kenney, loadAudio, loadSfx, loc, upper, type GameMeta } from '@core';
import { World3D, THREE, loadCharacter3d } from '@core/three';
import meta from './game.json';
import { PlayScene, CAMERA } from './PlayScene';
import { STRINGS } from './strings';
import { loadKit } from './kit';
import { buildRoom, DinerView, stationCentre } from './diner';
import { Chef } from './chef';
import { Fx } from './fx3d';
import { Sim, seeded } from './sim';
import { Bot, SKILL } from './bot';
import { makeThumbs } from './thumbs';

launch({
  meta: meta as GameMeta,
  background: '#3b2a26',
  physics: 'none',
  difficulty: true,
  music: { play: 'level3' },
  // a lost run may go on once after a rewarded ad: two hearts back, calmer customers
  ads: { continue: (play) => (play as PlayScene).revive() },
  preload(scene) {
    const l = scene.load;
    loadKit(l);
    loadCharacter3d(l);
    l.image('ss-coin', kenney('platformer/png/hud/hudcoin.png'));
    l.image('ss-lock', kenney('game-icons/png/white/2x/locked.png'));
    const J = 'oga/junkala-sfx/general-sounds/';
    loadAudio(l, 'sizzle', J + 'weird-sounds/sfx-sound-noise');
    loadAudio(l, 'ding', J + 'weird-sounds/sfx-sound-bling');
    loadAudio(l, 'coin', J + 'coins/sfx-coin-double2');
    loadAudio(l, 'coins', J + 'coins/sfx-coin-cluster3');
    loadAudio(l, 'star', J + 'coins/sfx-coin-double4');
    loadAudio(l, 'combo', J + 'positive-sounds/sfx-sounds-powerup2');
    loadAudio(l, 'buy', J + 'positive-sounds/sfx-sounds-powerup3');
    loadAudio(l, 'dayStart', J + 'positive-sounds/sfx-sounds-powerup10');
    loadAudio(l, 'fanfare', J + 'fanfares/sfx-sounds-fanfare1');
    loadAudio(l, 'angry', J + 'negative-sounds/sfx-sounds-negative1');
    loadAudio(l, 'lose', J + 'negative-sounds/sfx-sounds-negative2');
    loadAudio(l, 'burnt', J + 'negative-sounds/sfx-sounds-damage2');
    loadAudio(l, 'error', J + 'negative-sounds/sfx-sounds-error3');
    loadAudio(l, 'move', J + 'menu-sounds/sfx-menu-move2');
    loadAudio(l, 'order', J + 'interactions/sfx-sounds-interaction5');
    loadSfx(l, 'plop', 'sfx-impact/audio/impactsoft_medium_000');
    loadSfx(l, 'serve', 'sfx-impact/audio/impactplate_light_000');
    loadSfx(l, 'trash', 'sfx-impact/audio/impactmetal_light_001');
    loadSfx(l, 'door', 'sfx-impact/audio/impactbell_heavy_000');
    loadSfx(l, 'whoosh', 'sfx-casino/audio/cardslide1');
    loadSfx(l, 'pour', 'sfx-interface/audio/drop_002');
    loadSfx(l, 'veggie', 'sfx-interface/audio/glass_002');
  },
  menuDecor(scene) {
    // a live lunch rush behind the menu: the autopilot runs the shack on day 5
    const world = new World3D(scene, { fov: CAMERA.fov, near: 0.3, far: 60, background: 0xe9e1d3 });
    world.addLights({ extent: 6.5, dir: [-0.35, 1, 0.55], intensity: 2.1, ambient: 1.7, sky: 0xfff4e6, ground: 0x8a7563 });
    const sim = new Sim('normal', 77);
    sim.levels.seat = 2;
    for (let d = 0; d < 8; d++) sim.startDay();
    buildRoom(world.scene, sim.day, sim.seats, upper(loc(meta.title)));
    const view = new DinerView(world.scene);
    // the order and upgrade icons, made here so the first round starts at once
    makeThumbs(scene, world.renderer);
    const chef = new Chef(world.scene);
    const fx = new Fx(world.scene, seeded(3));
    const bot = new Bot(sim, SKILL.expert, seeded(5));
    scene.add.rectangle(0, 0, scene.scale.width, scene.scale.height, 0x1a1020, 0.42).setOrigin(0).setDepth(-90);
    let time = 0;
    // the bar sits between the title and PLAY, where the menu leaves room to watch
    const menuLook = CAMERA.look.clone().add(new THREE.Vector3(0, 0, 1.1));
    // start mid-rush: the bar is full when the menu opens
    for (let i = 0; i < 1200; i++) { bot.update(1 / 30); sim.update(1 / 30); sim.events.length = 0; view.update(1 / 30, sim); }
    world.onFrame = (dt) => {
      time += dt;
      const st = bot.update(dt);
      sim.update(dt);
      for (const ev of sim.events) {
        if (ev.type === 'place' && (ev.at.st === 'grill' || ev.at.st === 'dogs')) fx.puff(0, 0.95, 1.7, 0xffffff, 2, { size: 0.05 });
      }
      sim.events.length = 0;
      if (st) chef.goTo(stationCentre(st).x, st === 'pass' || st === 'veggie' ? -1 : 1);
      if (sim.state === 'done' || sim.over) { sim.hearts = sim.tune.hearts; sim.over = false; sim.day = 7; sim.startDay(); }
      view.update(dt, sim);
      chef.update(dt);
      fx.update(dt);
      const a = Math.sin(time * 0.15) * 0.6;
      world.camera.position.copy(CAMERA.pos).add(new THREE.Vector3(a, 0.6, 0.8));
      world.camera.lookAt(menuLook);
    };
  },
  scenes: [PlayScene],
  strings: STRINGS,
});
