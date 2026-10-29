import { launch, kenney, loadAudio, loadCharacter, type GameMeta } from '@core';
import meta from './game.json';
import { PlayScene, BIOMES } from './PlayScene';
import { HERO_SCALE, HERO_ORIGIN_Y } from './hero';

const J = 'jumper/png/';

launch({
  meta: meta as GameMeta,
  background: '#7cc8ef',
  physics: 'none',
  preload(scene) {
    const l = scene.load;
    for (const n of [2, 3, 4]) l.image('bg' + n, kenney(`${J}background/bg_layer${n}.png`));
    // the player's chosen character: pc-jump (rising), pc-stand (falling), pc-hit (lost)
    loadCharacter(l, { poses: ['jump', 'stand', 'hit'] });
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
    const S = 'oga/junkala-sfx/';
    loadAudio(l, 'jump1', S + 'movement/jumping-and-landing/sfx-movement-jump2');
    loadAudio(l, 'jump2', S + 'movement/jumping-and-landing/sfx-movement-jump3');
    loadAudio(l, 'spring', S + 'movement/jumping-and-landing/sfx-movement-jump6');
    loadAudio(l, 'break', S + 'general-sounds/impacts/sfx-sounds-impact11');
    loadAudio(l, 'carrot', S + 'general-sounds/coins/sfx-coin-single2');
    loadAudio(l, 'gold', S + 'general-sounds/coins/sfx-coin-double2');
    loadAudio(l, 'stomp', S + 'weapons/melee/sfx-wpn-punch4');
    loadAudio(l, 'ouch', S + 'general-sounds/negative-sounds/sfx-sounds-damage2');
    loadAudio(l, 'fall', S + 'movement/falling-sounds/sfx-sounds-falling2');
    loadAudio(l, 'jet', S + 'weapons/grenade-whistles/sfx-wpn-missilelaunch');
    loadAudio(l, 'milestone', S + 'general-sounds/fanfares/sfx-sounds-fanfare1');
  },
  menuDecor(scene) {
    const { width, height } = scene.scale;
    scene.add.image(width / 2, height + 200, 'bg3').setOrigin(0.5, 1).setScale(0.8).setAlpha(0.7);
    scene.add.image(width * 0.25, height * 0.9, 'plat-grass').setScale(0.7);
    scene.add.image(width * 0.75, height * 0.78, 'plat-wood').setScale(0.7);
    const b = scene.add.image(width * 0.25, height * 0.83, 'pc-jump').setOrigin(0.5, HERO_ORIGIN_Y).setScale(HERO_SCALE * 1.1);
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
