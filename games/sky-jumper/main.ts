import { launch, kenney, loadSfx, type GameMeta } from '@core';
import meta from './game.json';
import { PlayScene, BIOMES } from './PlayScene';

const J = 'jumper/png/';

launch({
  meta: meta as GameMeta,
  background: '#7cc8ef',
  physics: 'none',
  preload(scene) {
    const l = scene.load;
    for (const n of [2, 3, 4]) l.image('bg' + n, kenney(`${J}background/bg_layer${n}.png`));
    for (const f of ['jump', 'stand', 'hurt']) l.image('bunny-' + f, kenney(`${J}players/bunny1_${f}.png`));
    for (const b of BIOMES) {
      l.image(`plat-${b}`, kenney(`${J}environment/ground_${b}_small.png`));
      l.image(`plat-${b}-broken`, kenney(`${J}environment/ground_${b}_small_broken.png`));
    }
    l.image('plat-wood', kenney(J + 'environment/ground_wood_small.png'));
    l.image('ground', kenney(J + 'environment/ground_grass.png'));
    l.image('spring', kenney(J + 'items/spring.png'));
    l.image('spring-out', kenney(J + 'items/spring_out.png'));
    l.image('carrot', kenney(J + 'items/carrot.png'));
    l.image('carrot-gold', kenney(J + 'items/carrot_gold.png'));
    l.image('pu-jet', kenney(J + 'items/powerup_jetpack.png'));
    l.image('jetpack', kenney(J + 'items/jetpack.png'));
    l.image('flame', kenney(J + 'particles/flame.png'));
    l.image('flyman', kenney(J + 'enemies/flyman_fly.png'));
    l.image('flyman2', kenney(J + 'enemies/flyman_still_fly.png'));
    l.image('spikeball', kenney(J + 'enemies/spikeball1.png'));
    l.image('wingman', kenney(J + 'enemies/wingman1.png'));
    l.image('wingman2', kenney(J + 'enemies/wingman3.png'));
    l.image('piece', kenney(J + 'particles/particle_brown.png'));
    loadSfx(l, 'jump', 'sfx-digital/audio/phasejump1');
    loadSfx(l, 'spring', 'sfx-digital/audio/phaserup6');
    loadSfx(l, 'break', 'sfx-impact/audio/impactwood_light_002');
    loadSfx(l, 'carrot', 'sfx-digital/audio/powerup4');
    loadSfx(l, 'stomp', 'sfx-impact/audio/impactpunch_medium_000');
    loadSfx(l, 'die', 'sfx-digital/audio/phaserdown2');
    loadSfx(l, 'jet', 'sfx-digital/audio/powerup8');
    loadSfx(l, 'milestone', 'sfx-digital/audio/threetone2');
  },
  menuDecor(scene) {
    const { width, height } = scene.scale;
    scene.add.image(width / 2, height + 200, 'bg3').setOrigin(0.5, 1).setScale(0.8).setAlpha(0.7);
    scene.add.image(width * 0.25, height * 0.9, 'plat-grass').setScale(0.7);
    scene.add.image(width * 0.75, height * 0.78, 'plat-wood').setScale(0.7);
    const b = scene.add.image(width * 0.25, height * 0.83, 'bunny-jump').setScale(0.55);
    scene.tweens.add({ targets: b, y: b.y - 120, duration: 450, yoyo: true, repeat: -1, ease: 'Quad.easeOut' });
    scene.add.image(width * 0.82, height * 0.1, 'wingman').setScale(0.5);
    scene.add.image(width * 0.15, height * 0.32, 'carrot').setScale(0.7).setAngle(-20);
  },
  scenes: [PlayScene],
  strings: {
    tr: { meters: 'm', steer: '<  DOKUN  >', fell: 'DÜŞTÜN!', ouch: 'YAKALANDIN!' },
    en: { meters: 'm', steer: '<  TOUCH  >', fell: 'YOU FELL!', ouch: 'CAUGHT!' },
  },
});
