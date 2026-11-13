import { launch, loadAudio, loadSfx, playerCharacter, type GameMeta } from '@core';
import { World3D, THREE, MINI_MALES, miniKey } from '@core/three';
import meta from './game.json';
import { PlayScene } from './PlayScene';
import { STRINGS } from './strings';
import { loadKit, keepPrograms, charKey } from './kit';
import { CourtView, CAM_FOV, type ViewState } from './view';
import { Game } from './sim';
import { LEVELS, MATES } from './ai';
import { makeSounds } from './crowd';
import { KITS, figState, SKY_FOG } from './look';

const J = 'oga/junkala-sfx/';
const I = 'sfx-impact/audio/';

launch({
  meta: meta as GameMeta,
  background: '#1b2433',
  physics: 'none',
  difficulty: true,
  music: { play: 'level2' },
  preload(scene) {
    const l = scene.load;
    loadKit(l);
    loadSfx(l, 'dribble', I + 'impactsoft_heavy_001');
    loadSfx(l, 'bounce', I + 'impactsoft_medium_002');
    loadSfx(l, 'catch', I + 'impactpunch_medium_001');
    loadSfx(l, 'rim', I + 'impactmetal_light_002');
    loadSfx(l, 'rimHard', I + 'impactmetal_medium_001');
    loadSfx(l, 'board', I + 'impactplate_heavy_001');
    loadSfx(l, 'slam', I + 'impactmetal_heavy_001');
    loadSfx(l, 'blockHit', I + 'impactpunch_heavy_000');
    loadAudio(l, 'boom', J + 'explosions/shortest/sfx-exp-shortest-hard1');
    loadAudio(l, 'whoosh', J + 'general-sounds/menu-sounds/sfx-menu-move3');
    loadAudio(l, 'jump', J + 'movement/jumping-and-landing/sfx-movement-jump1');
    loadAudio(l, 'steal', J + 'general-sounds/interactions/sfx-sounds-interaction5');
    loadAudio(l, 'cross', J + 'movement/jumping-and-landing/sfx-movement-jump12');
    loadAudio(l, 'whistle', J + 'general-sounds/weird-sounds/sfx-sound-refereewhistle');
    loadAudio(l, 'score', J + 'general-sounds/positive-sounds/sfx-sounds-powerup4');
    loadAudio(l, 'three', J + 'general-sounds/coins/sfx-coin-cluster3');
    loadAudio(l, 'concede', J + 'general-sounds/negative-sounds/sfx-sounds-negative2');
    loadAudio(l, 'fire', J + 'explosions/short/sfx-exp-short-soft3');
    loadAudio(l, 'fireUp', J + 'general-sounds/positive-sounds/sfx-sounds-powerup15');
    loadAudio(l, 'error', J + 'general-sounds/negative-sounds/sfx-sounds-error3');
    loadAudio(l, 'tick', J + 'general-sounds/simple-bleeps/sfx-sounds-blip10');
    loadAudio(l, 'perfect', J + 'general-sounds/high-pitched-sounds/sfx-sounds-high3');
    loadAudio(l, 'switch', J + 'general-sounds/menu-sounds/sfx-menu-move2');
    loadAudio(l, 'win', J + 'general-sounds/fanfares/sfx-sounds-fanfare1');
    loadAudio(l, 'lose', J + 'general-sounds/negative-sounds/sfx-sounds-negative1');
  },
  menuDecor(scene) {
    makeSounds(scene.game);
    // an endless pick-up game behind the menu: two computer crews
    const world = new World3D(scene, { fov: CAM_FOV, near: 0.3, far: 220, background: SKY_FOG, fog: { color: SKY_FOG, near: 45, far: 140 } });
    world.addLights({ ambient: 1.55, intensity: 2.3, extent: 13, dir: [-0.45, 1, 0.6], sky: 0xe6f0ff, ground: 0x6d6255, sun: 0xfff1dc });
    const me = charKey(playerCharacter());
    const pool = MINI_MALES.map((m) => miniKey(m)).filter((k) => k !== me);
    const keys = [me, pool[0], pool[1], pool[2], pool[3], pool[4]];
    const view = new CourtView(world, [KITS[0], KITS[1]], keys, true);
    scene.add.rectangle(0, 0, scene.scale.width, scene.scale.height, 0x0b1020, 0.38).setOrigin(0).setDepth(-90);
    keepPrograms(world.renderer, world.scene, world.camera);
    let seed = 11;
    let g = new Game({ seed, ai: [LEVELS[2], LEVELS[2]], mates: MATES });
    let acc = 0;
    const vs: ViewState = { p: [], ball: { x: 0, y: 0, z: 0, state: 'tip', holder: -1 }, fire: [false, false], ctrl: [-1, -1], me: -1, takeBack: false };
    world.onFrame = (dt) => {
      acc += dt;
      while (acc > 1 / 60) {
        acc -= 1 / 60;
        g.step(1 / 60, [null, null]);
        if (g.phase === 'final' && g.phaseT > 3) { seed++; g = new Game({ seed, ai: [LEVELS[2], LEVELS[2]], mates: MATES }); }
      }
      vs.p = g.p.map((p) => figState(g, p));
      const b = g.ball;
      vs.ball = { x: b.x, y: b.y, z: b.z, state: b.state, holder: b.holder };
      vs.fire = g.fire;
      view.update(dt, vs);
    };
    void THREE;
  },
  scenes: [PlayScene],
  strings: STRINGS,
});
