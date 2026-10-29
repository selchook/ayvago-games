import { launch, kenney, loadAudio, loadSfx, loadCharacter, type GameMeta } from '@core';
import meta from './game.json';
import { PlayScene } from './PlayScene';
import { makeArcheryTextures, W, H, GROUND, ARCHER_SCALE, ARCHER_ORIGIN_Y } from './art';

const SG = 'shooting-gallery/png/stall/';
const J = 'oga/junkala-sfx/';

launch({
  meta: meta as GameMeta,
  background: '#2a5d8a',
  physics: 'none',
  preload(scene) {
    const l = scene.load;
    // the player's chosen character: pc-stand (aiming), pc-jump (round cleared), pc-hit (round failed)
    loadCharacter(l, { poses: ['stand', 'jump', 'hit'] });
    l.image('cloud1', kenney(SG + 'cloud1.png'));
    l.image('cloud2', kenney(SG + 'cloud2.png'));
    l.image('tree_oak', kenney(SG + 'tree_oak.png'));
    l.image('tree_pine', kenney(SG + 'tree_pine.png'));
    loadSfx(l, 'creak', 'sfx-interface/audio/scratch_002');
    loadAudio(l, 'release', J + 'weapons/melee/sfx-wpn-dagger');
    loadAudio(l, 'whoosh', J + 'movement/jumping-and-landing/sfx-movement-jump3');
    loadSfx(l, 'thunk', 'sfx-impact/audio/impactplank_medium_001');
    loadSfx(l, 'ground', 'sfx-impact/audio/footstep_grass_002');
    loadAudio(l, 'bull', J + 'general-sounds/coins/sfx-coin-cluster5');
    loadAudio(l, 'miss', J + 'general-sounds/negative-sounds/sfx-sounds-error4');
    loadAudio(l, 'nock', J + 'general-sounds/interactions/sfx-sounds-interaction2');
    loadAudio(l, 'round', J + 'general-sounds/menu-sounds/sfx-menu-select3');
    loadAudio(l, 'pass', J + 'general-sounds/fanfares/sfx-sounds-fanfare2');
    loadAudio(l, 'fail', J + 'general-sounds/negative-sounds/sfx-sounds-negative1');
  },
  menuDecor(scene) {
    makeArcheryTextures(scene);
    scene.add.image(0, 0, 'sky').setOrigin(0).setDisplaySize(W, H).setAlpha(0.5);
    scene.add.tileSprite(0, GROUND - 12, W, 112, 'turf').setOrigin(0).setAlpha(0.85);
    // above the how-to text, which reaches the right side of the menu at y 515-580
    const face = scene.add.image(W * 0.85, GROUND - 250, 'face').setScale(0.7);
    scene.tweens.add({ targets: face, angle: 6, duration: 1200, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    scene.add.image(W * 0.06, GROUND + 2, 'pc-stand').setOrigin(0.5, ARCHER_ORIGIN_Y).setScale(ARCHER_SCALE * 0.97);
    const arrow = scene.add.image(W * 0.83, GROUND - 255, 'arrow').setOrigin(1, 0.5).setAngle(12).setScale(1.2);
    scene.tweens.add({ targets: arrow, angle: 14, duration: 1200, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
  },
  scenes: [PlayScene],
  strings: {
    tr: {
      round: 'TUR', arrows: 'OK', roundPts: 'PUAN', needPts: 'Geçmek için {n} puan', moving: 'Hareketli hedef',
      wind: 'Rüzgar', noWind: 'Rüzgar yok', miss: 'ISKA', roundClear: 'TURU GEÇTİN!', roundFail: 'TURU GEÇEMEDİN',
    },
    en: {
      round: 'ROUND', arrows: 'ARROWS', roundPts: 'POINTS', needPts: '{n} points to pass', moving: 'Moving target',
      wind: 'Wind', noWind: 'No wind', miss: 'MISS', roundClear: 'ROUND CLEAR!', roundFail: 'ROUND FAILED',
    },
  },
});
