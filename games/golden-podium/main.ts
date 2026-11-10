import { launch, loadAudio, loadSfx, kenney, t, type GameMeta } from '@core';
import { World3D, loadKenney3d, loadModel, kenney3d, MINI_CHARACTERS_KIT } from '@core/three';
import meta from './game.json';
import { PlayScene } from './PlayScene';
import { STRINGS } from './strings';
import { Athlete, celebrate } from './athlete';
import { loadCast, playerKey, pickRivals } from './cast';
import { buildVenues, TEAM_COLORS } from './stadium';
import { Confetti } from './fx3d';
import { makeCrowdSounds } from './crowd-audio';

launch({
  meta: meta as GameMeta,
  background: '#1b3f78',
  physics: 'none',
  difficulty: true,
  preload(scene) {
    const l = scene.load;
    // rigged 3D athletes (Kenney Mini Characters): the player's model and every male rival
    loadCast(l);
    loadModel(l, 'bow', kenney3d(MINI_CHARACTERS_KIT, 'weapon-bow'));
    for (const [key, name] of [['light', 'lightPostLarge'], ['flagRed', 'flagRed'], ['flagGreen', 'flagGreen'], ['tent', 'tentLong']]) {
      loadKenney3d(l, key, 'racing-kit', name);
    }
    for (const [key, name] of [['treeA', 'tree_default'], ['treeB', 'tree_oak'], ['treeC', 'tree_pineRoundA'], ['palm', 'tree_palmTall'], ['palmB', 'tree_palmBend']]) {
      loadKenney3d(l, key, 'nature-kit', name);
    }
    l.image('medal-gold', kenney('medals/png/shaded_medal4.png'));
    l.image('medal-silver', kenney('medals/png/shaded_medal3.png'));
    l.image('medal-bronze', kenney('medals/png/shaded_medal2.png'));
    const J = 'oga/junkala-sfx/';
    loadAudio(l, 'gun', J + 'weapons/single-shot-sounds/sfx-weapon-singleshot3');
    loadAudio(l, 'whistle', J + 'general-sounds/weird-sounds/sfx-sound-refereewhistle');
    loadAudio(l, 'jump', J + 'movement/jumping-and-landing/sfx-movement-jump10');
    loadAudio(l, 'finish', J + 'general-sounds/positive-sounds/sfx-sounds-powerup2');
    loadAudio(l, 'gold', J + 'general-sounds/fanfares/sfx-sounds-fanfare1');
    loadAudio(l, 'podium', J + 'general-sounds/fanfares/sfx-sounds-fanfare3');
    loadAudio(l, 'medal', J + 'general-sounds/coins/sfx-coin-double2');
    loadAudio(l, 'record', J + 'general-sounds/positive-sounds/sfx-sounds-powerup4');
    loadAudio(l, 'lose', J + 'general-sounds/negative-sounds/sfx-sounds-negative1');
    loadAudio(l, 'tick', J + 'general-sounds/menu-sounds/sfx-menu-move2');
    loadAudio(l, 'beat', J + 'general-sounds/simple-bleeps/sfx-sounds-blip2');
    loadAudio(l, 'clear', J + 'general-sounds/coins/sfx-coin-single2');
    loadAudio(l, 'stumble', J + 'general-sounds/simple-damage-sounds/sfx-damage-hit3');
    loadAudio(l, 'missbeat', J + 'general-sounds/negative-sounds/sfx-sounds-error2');
    loadAudio(l, 'warn', J + 'general-sounds/simple-bleeps/sfx-sounds-blip9');
    loadAudio(l, 'splash', J + 'explosions/shortest/sfx-exp-shortest-soft2');
    loadAudio(l, 'breath', J + 'general-sounds/interactions/sfx-sounds-interaction2');
    loadAudio(l, 'release', J + 'weapons/melee/sfx-wpn-dagger');
    loadAudio(l, 'nock', J + 'general-sounds/interactions/sfx-sounds-interaction5');
    loadAudio(l, 'bull', J + 'general-sounds/coins/sfx-coin-cluster5');
    loadSfx(l, 'step', 'sfx-impact/audio/footstep_concrete_001');
    loadSfx(l, 'sand', 'sfx-impact/audio/impactsoft_heavy_001');
    loadSfx(l, 'stroke', 'sfx-impact/audio/impactsoft_medium_002');
    loadSfx(l, 'hurdle', 'sfx-impact/audio/impactplank_medium_002');
    loadSfx(l, 'thud', 'sfx-impact/audio/impactplank_medium_001');
    loadSfx(l, 'ground', 'sfx-impact/audio/footstep_grass_002');
  },
  menuDecor(scene) {
    makeCrowdSounds(scene.game);
    // the podium in the stadium, the player on top, under a little confetti
    const world = new World3D(scene, { background: 0x8fd0ff, fog: { color: 0xcfeaff, near: 60, far: 260 }, fov: 42, far: 800 });
    world.addLights({ ambient: 1.8, intensity: 2.4, extent: 14, dir: [-0.45, 1, 0.55] });
    const v = buildVenues(world.scene, t('cup'));
    const pod = v.podium.position;
    const keys = [playerKey(), ...pickRivals(2).map((r) => r.key)];
    const xs = [0, -2.1, 2.1], hs = [1.0, 0.7, 0.45];
    const athletes = keys.map((key, i) => {
      const a = new Athlete(key, TEAM_COLORS[i]);
      a.showMarks(false);
      a.root.position.set(pod.x + xs[i], hs[i], pod.z);
      a.face(Math.PI / 2 + (i === 1 ? -0.25 : i === 2 ? 0.25 : 0));
      v.track.add(a.root);
      return a;
    });
    scene.events.once('shutdown', () => athletes.forEach((a) => a.dispose()));
    const confetti = new Confetti(v.track, pod.clone(), 6, 160);
    confetti.start();
    // the podium stands on the left, beside PLAY and above the how-to text
    world.camera.position.set(pod.x + 10.8, 3.6, pod.z + 22);
    world.camera.lookAt(pod.x + 10.8, 3.25, pod.z);
    scene.add.rectangle(0, 0, 1280, 720, 0x0b1430, 0.28).setOrigin(0).setDepth(-90);
    const t0 = performance.now() / 1000;
    world.onFrame = (dt) => {
      const time = performance.now() / 1000;
      for (const c of v.crowds) if (c.venue.visible) c.crowd.update(dt, time);
      confetti.update(dt, time);
      // the champion hops and cheers, the others clap along now and then
      const tt = time - t0;
      celebrate(athletes[0], tt);
      athletes[1].play(Math.floor(tt / 2.2) % 2 ? 'emote-yes' : 'idle', { fade: 0.3 });
      athletes[2].play(Math.floor(tt / 2.2 + 0.5) % 2 ? 'emote-yes' : 'idle', { fade: 0.3 });
      for (const a of athletes) a.update(dt);
      for (const c of v.crowds) c.crowd.cheer(0.6);
      world.camera.position.x = pod.x + 10.8 + Math.sin(time * 0.25) * 0.3;
    };
  },
  scenes: [PlayScene],
  strings: STRINGS,
});
