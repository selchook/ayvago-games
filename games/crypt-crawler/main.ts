import { launch, kenney, loadAudio, loadSfx, type GameMeta } from '@core';
import { World3D, THREE, playerCharacter3d } from '@core/three';
import meta from './game.json';
import { PlayScene, CAM } from './PlayScene';
import { STRINGS } from './strings';
import { loadKit, keepPrograms } from './kit';
import { Sim, seeded } from './sim';
import { Bot, SKILL } from './bot';
import { DungeonView, paletteOf, SKY } from './view';
import { HeroFigure } from './hero';
import { Fx } from './fx3d';

launch({
  meta: meta as GameMeta,
  background: '#141019',
  physics: 'none',
  difficulty: true,
  music: { play: 'stage1' },
  // a lost run may go on once after a rewarded ad: half the hearts back (src/core/ads.ts)
  ads: { continue: (play) => (play as PlayScene).revive() },
  preload(scene) {
    const l = scene.load;
    loadKit(l);
    l.image('cc-coin', kenney('platformer/png/hud/hudcoin.png'));
    l.image('cc-key', kenney('platformer/png/hud/hudkey_yellow.png'));
    const J = 'oga/junkala-sfx/';
    loadAudio(l, 'swing', J + 'weapons/melee/sfx-wpn-sword1');
    loadAudio(l, 'spin', J + 'weapons/melee/sfx-wpn-sword3');
    loadAudio(l, 'enemySwing', J + 'weapons/melee/sfx-wpn-sword2');
    loadAudio(l, 'throw', J + 'weapons/melee/sfx-wpn-dagger');
    loadAudio(l, 'hit', J + 'general-sounds/simple-damage-sounds/sfx-damage-hit3');
    loadAudio(l, 'hitBig', J + 'general-sounds/impacts/sfx-sounds-impact3');
    loadAudio(l, 'poof', J + 'explosions/shortest/sfx-exp-shortest-soft3');
    loadAudio(l, 'splat', J + 'general-sounds/simple-damage-sounds/sfx-damage-hit8');
    loadAudio(l, 'hurt', J + 'general-sounds/negative-sounds/sfx-sounds-damage1');
    loadAudio(l, 'dash', J + 'movement/jumping-and-landing/sfx-movement-jump12');
    loadAudio(l, 'charged', J + 'general-sounds/high-pitched-sounds/sfx-sounds-high3');
    loadAudio(l, 'coin', J + 'general-sounds/coins/sfx-coin-single2');
    loadAudio(l, 'coins', J + 'general-sounds/coins/sfx-coin-cluster3');
    loadAudio(l, 'gem', J + 'general-sounds/coins/sfx-coin-double4');
    loadAudio(l, 'heal', J + 'general-sounds/positive-sounds/sfx-sounds-powerup2');
    loadAudio(l, 'key', J + 'general-sounds/positive-sounds/sfx-sounds-powerup10');
    loadAudio(l, 'unlock', J + 'general-sounds/interactions/sfx-sounds-interaction5');
    loadAudio(l, 'chest', J + 'movement/opening-doors/sfx-movement-dooropen3');
    loadAudio(l, 'open', J + 'movement/opening-doors/sfx-movement-dooropen1');
    loadAudio(l, 'appear', J + 'general-sounds/positive-sounds/sfx-sounds-powerup6');
    loadAudio(l, 'spawn', J + 'movement/portals-and-transitions/sfx-movement-portal1');
    loadAudio(l, 'portal', J + 'movement/portals-and-transitions/sfx-movement-portal4');
    loadAudio(l, 'stairs', J + 'movement/portals-and-transitions/sfx-movement-portal2');
    loadAudio(l, 'shrine', J + 'general-sounds/positive-sounds/sfx-sounds-powerup15');
    loadAudio(l, 'upgrade', J + 'general-sounds/positive-sounds/sfx-sounds-powerup4');
    loadAudio(l, 'clearJingle', J + 'general-sounds/positive-sounds/sfx-sounds-powerup3');
    loadAudio(l, 'fanfare', J + 'general-sounds/fanfares/sfx-sounds-fanfare2');
    loadAudio(l, 'boom', J + 'explosions/short/sfx-exp-short-soft3');
    loadAudio(l, 'bigBoom', J + 'explosions/long/sfx-exp-long3');
    loadAudio(l, 'quake', J + 'explosions/medium-length/sfx-exp-medium3');
    loadAudio(l, 'orb', J + 'weapons/lasers/sfx-wpn-laser8');
    loadAudio(l, 'blink', J + 'movement/portals-and-transitions/sfx-movement-portal5');
    loadAudio(l, 'bossHorn', J + 'general-sounds/alarms/low-health-alarms/sfx-lowhealth-alarmloop4');
    loadAudio(l, 'growl', J + 'general-sounds/weird-sounds/sfx-sound-depressurizing');
    loadAudio(l, 'lose', J + 'general-sounds/negative-sounds/sfx-sounds-negative1');
    loadAudio(l, 'error', J + 'general-sounds/negative-sounds/sfx-sounds-error3');
    loadAudio(l, 'move', J + 'general-sounds/menu-sounds/sfx-menu-move2');
    loadAudio(l, 'select', J + 'general-sounds/menu-sounds/sfx-menu-select2');
    loadAudio(l, 'buy', J + 'general-sounds/coins/sfx-coin-double2');
    loadAudio(l, 'tick', J + 'general-sounds/menu-sounds/sfx-menu-move4');
    loadAudio(l, 'hintPing', J + 'general-sounds/interactions/sfx-sounds-interaction2');
    const I = 'sfx-impact/audio/';
    loadSfx(l, 'pot', I + 'impactglass_medium_001');
    loadSfx(l, 'barrel', I + 'impactplank_medium_002');
    loadSfx(l, 'slam', I + 'impactplate_heavy_001');
    loadSfx(l, 'thud', I + 'impactpunch_heavy_000');
    loadSfx(l, 'parry', I + 'impactmetal_light_002');
    loadSfx(l, 'block', I + 'impactbell_heavy_001');
    loadSfx(l, 'spikes', I + 'impactmetal_medium_001');
  },
  menuDecor(scene) {
    // a live run behind the menu: the autopilot fights its way down the crypt (Easy)
    const pal = paletteOf(1);
    const world = new World3D(scene, { fov: CAM.fov, near: 1, far: 60, background: SKY[pal], fog: { color: SKY[pal], near: 20, far: 34 } });
    world.addLights({ extent: 9, dir: [-0.35, 1, 0.45], intensity: 1.9, ambient: 1.55, sky: 0xd8d0ff, ground: 0x4a3a40, sun: 0xfff0dd }).shadow.mapSize.set(1024, 1024);
    // the same lights as the Play scene, so its shaders are compiled here already
    const light = new THREE.PointLight(0xff9a40, 7, 7, 1.6);
    const light2 = new THREE.PointLight(0xff9a40, 0, 7, 1.6);
    world.scene.add(light, light2);
    let seed = 7;
    let sim = new Sim('easy', seed);
    let bot = new Bot(sim, SKILL.good, seeded(seed));
    const view = new DungeonView(scene, world.scene, pal);
    view.build(sim.floor, pal);
    const hero = new HeroFigure(scene, playerCharacter3d());
    world.scene.add(hero.root);
    const fx = new Fx(world.scene, world.camera);
    scene.add.rectangle(0, 0, scene.scale.width, scene.scale.height, 0x0b0812, 0.35).setOrigin(0).setDepth(-90);
    keepPrograms(world.renderer, world.scene, world.camera);
    let time = 0, acc = 0, swing = false;
    const cam = new THREE.Vector3(sim.hero.x, 0, sim.hero.z);
    world.onFrame = (dt) => {
      time += dt;
      acc += dt;
      while (acc > 1 / 60) {
        acc -= 1 / 60;
        bot.update(1 / 60);
        sim.step(1 / 60);
        for (const ev of sim.events) {
          if (ev.type === 'shrine') sim.applyUpgrade(bot.choose(sim.offer()));
          else if (ev.type === 'swing') { swing = true; fx.slash(sim.hero.x, sim.hero.z, ev.ang, sim.stats.range, false); }
          else if (ev.type === 'kill') fx.burst(ev.e.x, 0.4, ev.e.z, 0xf2ead8, 10, 3, { up: 3 });
          else if (ev.type === 'pot') fx.burst(ev.pot.x, 0.3, ev.pot.z, 0xa8a4c0, 8, 2.5);
        }
        if (sim.events.some((e) => e.type === 'stairs') || sim.over || sim.floorNo > 3) {
          // an endless show: the next floor, or a fresh run
          if (sim.over || sim.floorNo >= 3) { seed++; sim = new Sim('easy', seed); bot = new Bot(sim, SKILL.good, seeded(seed)); }
          else sim.nextFloor();
          view.build(sim.floor, pal);
          fx.clear();
          cam.set(sim.hero.x, 0, sim.hero.z);
        }
      }
      const h = sim.hero;
      hero.drive(dt, { x: h.x, z: h.z, face: h.face, speed: h.speed, swing: h.swingT > 0, swingStart: swing, spin: h.spinT, charge: 0, dash: h.dashT > 0, alive: h.alive, hurt: h.hitT, inv: 0 });
      swing = false;
      view.update(dt, sim, time, world.camera);
      fx.update(dt, sim.enemies.filter((e) => e.alive && e.tele).map((e) => ({ tele: e.tele!, p: 0.6 })));
      const r = sim.room >= 0 ? sim.floor.rooms[sim.room] : null;
      cam.x += ((r ? r.cx : h.x) - cam.x) * Math.min(1, dt * 4);
      cam.z += (h.z - 1 - cam.z) * Math.min(1, dt * 4);
      world.camera.position.set(cam.x + Math.sin(time * 0.2) * 1.5, 16, cam.z + 10.5);
      world.camera.lookAt(cam.x, 0, cam.z);
      const near = view.flamesAt.reduce<THREE.Vector3 | null>((b, p) => (!b || (p.x - h.x) ** 2 + (p.z - h.z) ** 2 < (b.x - h.x) ** 2 + (b.z - h.z) ** 2 ? p : b), null);
      if (near) light.position.set(near.x, near.y + 0.3, near.z + 0.4);
      light.intensity = 7 + Math.sin(time * 13) * 1.2;
      world.followSun(cam);
    };
  },
  scenes: [PlayScene],
  strings: STRINGS,
});
