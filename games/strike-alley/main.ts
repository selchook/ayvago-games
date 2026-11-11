import { launch, loadAudio, loadSfx, t, type GameMeta } from '@core';
import { World3D, THREE, loadCharacter3d, loadMiniCharacter, playerCharacter3d } from '@core/three';
import meta from './game.json';
import { PlayScene } from './PlayScene';
import { STRINGS } from './strings';
import { makeSounds } from './sounds';
import { buildAlley, drawScreen } from './alley';
import { Person } from './bowler';
import { poseBowler, approachPose, HOLD_T, WALK_T } from './approach';
import { SPOTS, PIN_COM, HEAD_Z } from './sim';

const SPECTATORS = ['character-male-a', 'character-male-c', 'character-male-e'];

launch({
  meta: meta as GameMeta,
  background: '#0d0820',
  physics: 'none',
  difficulty: true,
  music: { play: 'level2' },
  preload(scene) {
    const l = scene.load;
    loadCharacter3d(l);
    for (const s of SPECTATORS) loadMiniCharacter(l, s);
    const I = 'sfx-impact/audio/';
    loadSfx(l, 'pop', I + 'impactsoft_heavy_002');
    loadSfx(l, 'clack', I + 'impactmetal_light_001');
    loadSfx(l, 'thud', I + 'impactsoft_heavy_000');
    loadSfx(l, 'gutter', I + 'impactplank_medium_002');
    loadSfx(l, 'hit', I + 'impactwood_heavy_001');
    loadSfx(l, 'wood', I + 'impactwood_medium_002');
    loadSfx(l, 'clunk', I + 'impactmetal_heavy_001');
    loadSfx(l, 'tick', 'sfx-interface/audio/tick_002');
    loadSfx(l, 'step', I + 'footstep_wood_001');
    const J = 'oga/junkala-sfx/general-sounds/';
    loadAudio(l, 'fanfare', J + 'fanfares/sfx-sounds-fanfare1');
    loadAudio(l, 'bonus', J + 'positive-sounds/sfx-sounds-powerup4');
    loadAudio(l, 'spare', J + 'coins/sfx-coin-double2');
    loadAudio(l, 'good', J + 'coins/sfx-coin-single2');
    loadAudio(l, 'count', J + 'neutral-sounds/sfx-sound-neutral2');
    loadAudio(l, 'bad', J + 'negative-sounds/sfx-sounds-negative1');
    loadAudio(l, 'split', J + 'negative-sounds/sfx-sounds-error2');
  },
  menuDecor(scene) {
    makeSounds(scene.game);
    // the alley behind the menu: the player's bowler at the line, ball in hand, pins down the lane
    const world = new World3D(scene, { fov: 46, near: 0.05, far: 80, background: 0x0d0820, fog: { color: 0x0d0820, near: 26, far: 60 } });
    world.addLights({ sky: 0xe6dcff, ground: 0x3a2a48, ambient: 1.35, intensity: 1.7, dir: [0.2, 1, -0.35], extent: 3 });
    const a = buildAlley(world);
    a.pins.forEach((p, i) => {
      p.position.set(SPOTS[i].x, PIN_COM, SPOTS[i].z);
      a.mirrorPins[i].position.copy(p.position);
    });
    const bowler = new Person(playerCharacter3d());
    world.scene.add(bowler.root);
    bowler.root.position.set(0.3, 0, 2.6);
    bowler.face(0.04).play('idle', { fade: 0 });
    poseBowler(bowler, 0);
    bowler.legs.w = 0;
    a.mirrorBall.visible = false;
    scene.events.once('shutdown', () => bowler.dispose());
    world.followSun(new THREE.Vector3(0.1, 0, 1.9));
    drawScreen(a, { title: t('lane'), big: '300', sub: t('perfect'), color: '#ffd23f' });
    scene.add.rectangle(0, 0, scene.scale.width, scene.scale.height, 0x0b0620, 0.36).setOrigin(0).setDepth(-90);
    const t0 = performance.now();
    // a practice swing on the spot, over and over: steps in place, push-away, backswing, the
    // forward swing into a slide and the follow-through (the ball stays in the hand)
    const CYCLE = HOLD_T + 1.6;
    let last = 0;
    world.onFrame = (dt) => {
      const time = (performance.now() - t0) / 1000;
      const tt = (time + 0.55) % CYCLE;
      const pose = approachPose(Math.min(tt, HOLD_T + 0.4));
      if (tt < last) bowler.relax();
      poseBowler(bowler, tt, pose);
      // back into the stance at the end of the loop
      const back = Math.min(1, Math.max(0, (tt - HOLD_T - 0.4) / 1.0));
      if (back > 0) {
        const st = approachPose(0);
        const k = back * back * (3 - 2 * back);
        bowler.armR.swing += (st.swing - bowler.armR.swing) * k;
        bowler.armR.abd += (st.abd - bowler.armR.abd) * k;
        bowler.armL.w += (st.lw - bowler.armL.w) * k;
        bowler.armL.swing += (st.lSwing - bowler.armL.swing) * k;
        bowler.armL.abd += (st.lAbd - bowler.armL.abd) * k;
        bowler.torso.pitch += (st.pitch - bowler.torso.pitch) * k;
        bowler.legs.w *= 1 - k;
        bowler.headPitch *= 1 - k;
      }
      bowler.stepLegs(tt < WALK_T ? dt * 1.6 : 0, tt < WALK_T ? 1 : 0, 0.45);
      last = tt;
      bowler.update(dt);
      bowler.ballAt(a.ball.position);
      bowler.ballQuat(a.ball.quaternion);
      a.neon.forEach((n, i) => n.mat.color.copy(n.base).offsetHSL(Math.sin(time * 0.7 + i) * 0.04, 0, 0));
      const sway = Math.sin(time * 0.25);
      // behind the bowler's left shoulder, the swinging arm on the right, down the lane to the rack
      world.camera.position.set(-0.5 + sway * 0.1, 1.3 + Math.sin(time * 0.31) * 0.04, 7.3);
      world.camera.lookAt(-0.05, 1.25, HEAD_Z * 0.7);
    };
  },
  scenes: [PlayScene],
  strings: STRINGS,
});
