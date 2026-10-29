import { launch, kenney, loadAudio, type GameMeta } from '@core';
import meta from './game.json';
import { PlayScene, ANIMALS } from './PlayScene';

const F = 'foliage/png/default_size/';

launch({
  meta: meta as GameMeta,
  background: '#3f7d3a',
  physics: 'none',
  preload(scene) {
    const l = scene.load;
    for (const a of ANIMALS) l.image('wm-' + a, kenney(`animals/png/round/${a}.png`));
    l.image('wm-bomb', kenney('platformer/png/tiles/bomb.png'));
    l.image('wm-spark', kenney('particles/png_transparent/star_06.png'));
    l.image('wm-smoke', kenney('particles/png_transparent/smoke_01.png'));
    for (const n of ['001', '003', '007', '010', '038', '041', '049', '050', '051', '053', '062']) l.image('wm-f' + n, kenney(`${F}foliagepack_${n}.png`));
    l.image('wm-leaf', kenney(`${F}leaves/foliagepack_leaves_007.png`));
    const J = 'oga/junkala-sfx/';
    loadAudio(l, 'whack1', J + 'weapons/melee/sfx-wpn-punch1');
    loadAudio(l, 'whack2', J + 'weapons/melee/sfx-wpn-punch2');
    loadAudio(l, 'whack3', J + 'weapons/melee/sfx-wpn-punch3');
    loadAudio(l, 'swish', J + 'weapons/melee/sfx-wpn-sword2');
    loadAudio(l, 'pop1', J + 'movement/jumping-and-landing/sfx-movement-jump1');
    loadAudio(l, 'pop2', J + 'movement/jumping-and-landing/sfx-movement-jump5');
    loadAudio(l, 'gold', J + 'general-sounds/coins/sfx-coin-double3');
    loadAudio(l, 'combo', J + 'general-sounds/positive-sounds/sfx-sounds-powerup15');
    loadAudio(l, 'quota', J + 'general-sounds/positive-sounds/sfx-sounds-powerup8');
    loadAudio(l, 'boom', J + 'explosions/short/sfx-exp-short-hard5');
    loadAudio(l, 'hurt', J + 'general-sounds/negative-sounds/sfx-sounds-damage3');
    loadAudio(l, 'tick', J + 'general-sounds/simple-bleeps/sfx-sounds-blip6');
    loadAudio(l, 'clear', J + 'general-sounds/fanfares/sfx-sounds-fanfare1');
    loadAudio(l, 'go', J + 'general-sounds/weird-sounds/sfx-sound-refereewhistle');
  },
  menuDecor(scene) {
    const { width, height } = scene.scale;
    scene.add.rectangle(width / 2, 70, width, 140, 0x9ed8f5);
    [['wm-f007', 60], ['wm-f010', 190], ['wm-f041', 560], ['wm-f007', 680]].forEach(([k, x]) => scene.add.image(x as number, 150, k as string).setOrigin(0.5, 1).setScale(0.7));
    const xs = [150, 360, 570];
    ['bear', 'rabbit', 'pig'].forEach((a, i) => {
      const y = height - 150;
      scene.add.ellipse(xs[i], y + 10, 190, 80, 0x8a5a35);
      scene.add.ellipse(xs[i], y, 150, 52, 0x2a1a0e);
      const img = scene.add.image(xs[i], y + 80, 'wm-' + a).setScale(0.75);
      const m = scene.make.graphics({ x: 0, y: 0 }, false).fillRect(xs[i] - 120, y - 220, 240, 226);
      img.setMask(m.createGeometryMask());
      scene.tweens.add({ targets: img, y: y - 34, duration: 380, delay: i * 500, hold: 700, yoyo: true, repeat: -1, repeatDelay: 900, ease: 'Back.easeOut' });
    });
  },
  scenes: [PlayScene],
  strings: {
    tr: { round: 'TUR', roundClear: 'TUR TAMAM!', timeUp: 'SÜRE DOLDU!', boom: 'BUM!', target: 'HEDEF', bonus: 'BONUS' },
    en: { round: 'ROUND', roundClear: 'ROUND CLEAR!', timeUp: "TIME'S UP!", boom: 'BOOM!', target: 'TARGET', bonus: 'BONUS' },
  },
});
