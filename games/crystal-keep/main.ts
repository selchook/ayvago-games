import { launch, kenney, loadAudio, loadSfx, type GameMeta } from '@core';
import { World3D, THREE } from '@core/three';
import meta from './game.json';
import { PlayScene } from './PlayScene';
import { STRINGS } from './strings';
import { loadKit, kitMat } from './kit';
import { Board, buildTower, animateTower, GRASS_Y, PALETTE_LOOK } from './board';
import { EnemyView } from './enemies';
import { Fx } from './fx3d';
import { Sim } from './sim';
import { Bot } from './bot';

launch({
  meta: meta as GameMeta,
  background: '#2b5a3f',
  physics: 'none',
  difficulty: true,
  music: { play: 'stage1' },
  // a lost map may go on once after a rewarded ad: half the lives back (src/core/ads.ts)
  ads: { continue: (play) => (play as PlayScene).revive() },
  preload(scene) {
    const l = scene.load;
    loadKit(l);
    l.image('ck-coin', kenney('platformer/png/hud/hudcoin.png'));
    const J = 'oga/junkala-sfx/';
    loadAudio(l, 'cannon', J + 'weapons/cannon/sfx-wpn-cannon1');
    loadAudio(l, 'gun', J + 'weapons/single-shot-sounds/sfx-weapon-singleshot5');
    loadAudio(l, 'bolt', J + 'weapons/melee/sfx-wpn-dagger');
    loadAudio(l, 'boom', J + 'explosions/short/sfx-exp-short-soft3');
    loadAudio(l, 'crash', J + 'explosions/medium-length/sfx-exp-medium3');
    loadAudio(l, 'bigBoom', J + 'explosions/long/sfx-exp-long3');
    loadAudio(l, 'splat', J + 'general-sounds/simple-damage-sounds/sfx-damage-hit5');
    loadAudio(l, 'coin', J + 'general-sounds/coins/sfx-coin-single2');
    loadAudio(l, 'coins', J + 'general-sounds/coins/sfx-coin-double2');
    loadAudio(l, 'sell', J + 'general-sounds/coins/sfx-coin-cluster3');
    loadAudio(l, 'build', J + 'general-sounds/positive-sounds/sfx-sounds-powerup3');
    loadAudio(l, 'upgrade', J + 'general-sounds/positive-sounds/sfx-sounds-powerup4');
    loadAudio(l, 'waveStart', J + 'movement/portals-and-transitions/sfx-movement-portal2');
    loadAudio(l, 'portal', J + 'movement/portals-and-transitions/sfx-movement-portal4');
    loadAudio(l, 'waveClear', J + 'general-sounds/positive-sounds/sfx-sounds-powerup2');
    loadAudio(l, 'bossHorn', J + 'general-sounds/alarms/low-health-alarms/sfx-lowhealth-alarmloop4');
    loadAudio(l, 'hurt', J + 'general-sounds/negative-sounds/sfx-sounds-damage2');
    loadAudio(l, 'drop', J + 'weapons/lasers/sfx-wpn-laser8');
    loadAudio(l, 'fanfare', J + 'general-sounds/fanfares/sfx-sounds-fanfare2');
    loadAudio(l, 'star', J + 'general-sounds/coins/sfx-coin-double4');
    loadAudio(l, 'lose', J + 'general-sounds/negative-sounds/sfx-sounds-negative1');
    loadAudio(l, 'error', J + 'general-sounds/negative-sounds/sfx-sounds-error3');
    loadAudio(l, 'move', J + 'general-sounds/menu-sounds/sfx-menu-move2');
    loadAudio(l, 'arm', J + 'general-sounds/menu-sounds/sfx-menu-select2');
    loadAudio(l, 'meteorFall', J + 'movement/falling-sounds/sfx-sounds-falling3');
    const I = 'sfx-impact/audio/';
    loadSfx(l, 'catapult', I + 'impactplank_medium_000');
    loadSfx(l, 'hammer', I + 'impactplank_medium_002');
    loadSfx(l, 'rock', I + 'impactmining_002');
    loadSfx(l, 'thud', I + 'impactpunch_heavy_000');
    loadSfx(l, 'clank', I + 'impactmetal_light_002');
  },
  menuDecor(scene) {
    // a live battle on the Green Valley behind the menu: the autopilot defends the keep
    const world = new World3D(scene, { fov: 34, near: 0.5, far: 140, background: PALETTE_LOOK.green.sky });
    world.scene.fog = new THREE.Fog(PALETTE_LOOK.green.fog, 30, 70);
    world.addLights({ extent: 12, dir: [-0.45, 1, 0.5], intensity: 2.3, ambient: 1.5 });
    const sim = new Sim(0, 'easy');
    sim.gold = 2000;
    const board = new Board(scene, world.scene, sim.map);
    const enemies = new EnemyView(scene, world.scene);
    const fx = new Fx(scene, world.scene);
    enemies.onCrash = (x, z) => fx.boom(x, z, 0.6);
    const bot = new Bot(sim);
    const views = new Map<number, ReturnType<typeof buildTower>>();
    scene.add.rectangle(0, 0, scene.scale.width, scene.scale.height, 0x0b1a14, 0.32).setOrigin(0).setDepth(-90);
    let time = 0;
    world.onFrame = (dt) => {
      time += dt;
      bot.update(dt);
      if (sim.wave === 0 || sim.countdown > 0) sim.callWave();
      sim.step(dt);
      for (const ev of sim.events) {
        if (ev.type === 'kill') { enemies.kill(ev.e); fx.puff(ev.e.x, 0.35, ev.e.z, 0x9fd27a, 6); }
        else if (ev.type === 'leak') enemies.drop(ev.e);
        else if (ev.type === 'impact' && ev.r > 0) fx.boom(ev.x, ev.z, ev.r);
        else if (ev.type === 'meteorHit') fx.boom(ev.m.x, ev.m.z, 1.5, true);
        else if (ev.type === 'fire') { const v = views.get(ev.tower.id); if (v) v.kick = 1; }
      }
      sim.events.length = 0;
      sim.compact();
      // an endless show: a new game once this one ends
      if (sim.over) { sim.over = null; sim.lives = sim.maxLives; }
      for (const tw of sim.towers) {
        let v = views.get(tw.id);
        if (!v || (v as { tier?: number }).tier !== tw.tier) {
          if (v) world.scene.remove(v.root);
          v = buildTower(tw.kind, tw.tier, kitMat(scene), true);
          (v as { tier?: number }).tier = tw.tier;
          v.root.position.set(tw.x, GRASS_Y, tw.z);
          world.scene.add(v.root);
          views.set(tw.id, v);
        }
        animateTower(v, tw.kind, tw.target ? tw.aim : v.yaw, dt);
      }
      enemies.update(dt, time, sim.enemies);
      fx.update(dt, sim.shots, sim.meteors);
      board.update(dt, time, 1);
      const a = time * 0.08;
      const D = 26;
      world.camera.position.set(Math.sin(a) * D * 0.5, D * 0.8, 1 + Math.cos(a) * D * 0.5);
      world.camera.lookAt(0, 0, 0.5);
    };
  },
  scenes: [PlayScene],
  strings: STRINGS,
});
