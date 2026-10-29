import { launch, kenney, loadAudio, type GameMeta } from '@core';
import meta from './game.json';
import { PlayScene } from './PlayScene';

const P = 'puzzle2/png/pipes/';

launch({
  meta: meta as GameMeta,
  background: '#16202b',
  physics: 'none',
  preload(scene) {
    const l = scene.load;
    // empty grey / empty green / water-filled green: elbow, straight, tee, cross
    const ids: Record<string, [string, string, string, string]> = {
      grey: ['01', '03', '05', '06'], green: ['01', '03', '05', '06'], water: ['07', '09', '11', '12'],
    };
    for (const [set, list] of Object.entries(ids)) {
      const folder = set === 'grey' ? 'grey/pipegrey_' : 'green/pipegreen_';
      ['elbow', 'straight', 'tee', 'cross'].forEach((kind, i) => l.image(`pf-${set}-${kind}`, kenney(`${P}${folder}${list[i]}.png`)));
    }
    const J = 'oga/junkala-sfx/';
    loadAudio(l, 'rotate', J + 'movement/opening-doors/sfx-movement-dooropen3');
    loadAudio(l, 'rotate2', J + 'movement/opening-doors/sfx-movement-dooropen4');
    loadAudio(l, 'rotate3', J + 'movement/opening-doors/sfx-movement-dooropen1');
    loadAudio(l, 'locked', J + 'general-sounds/negative-sounds/sfx-sounds-error7');
    loadAudio(l, 'link', J + 'general-sounds/coins/sfx-coin-double4');
    loadAudio(l, 'flow', J + 'general-sounds/weird-sounds/sfx-sound-noise');
    loadAudio(l, 'fill', J + 'movement/jumping-and-landing/sfx-movement-jump4');
    loadAudio(l, 'leak', J + 'explosions/shortest/sfx-exp-shortest-soft2');
    loadAudio(l, 'win', J + 'general-sounds/fanfares/sfx-sounds-fanfare1');
    loadAudio(l, 'fail', J + 'general-sounds/negative-sounds/sfx-sounds-negative2');
    loadAudio(l, 'tick', J + 'general-sounds/high-pitched-sounds/sfx-sounds-high1');
    loadAudio(l, 'move', J + 'general-sounds/menu-sounds/sfx-menu-move3');
  },
  menuDecor(scene) {
    const { width, height } = scene.scale;
    const s = 0.5;
    const row: Array<[string, number]> = [['water-straight', 90], ['water-elbow', 180], ['green-elbow', 0], ['green-straight', 90], ['grey-tee', 90], ['grey-cross', 0]];
    row.forEach(([k, ang], i) => {
      const c = scene.add.container(width / 2 - 275 + i * 110, height * 0.085).setScale(s).setAngle(ang);
      const kind = k.split('-')[1];
      const off = kind === 'elbow' ? [30, 30] : kind === 'tee' ? [0, 30] : [0, 0];
      c.add(scene.add.image(off[0], off[1], 'pf-' + k));
      if (i === 3) scene.tweens.add({ targets: c, angle: ang + 90, duration: 300, yoyo: true, repeat: -1, hold: 900, repeatDelay: 900 });
    });
    const big = scene.add.container(width / 2, height * 0.82).setScale(0.6);
    big.add(scene.add.image(0, 0, 'pf-water-cross'));
    scene.tweens.add({ targets: big, angle: 360, duration: 6000, repeat: -1 });
  },
  scenes: [PlayScene],
  strings: {
    tr: {
      flowIn: 'SU GELİYOR: {s}', flowing: 'SU AKIYOR!', openNow: 'SUYU AÇ', connected: 'BAĞLANDI!', leak: 'SIZINTI!',
      drained: 'TAMAM!', blocked: 'SU TIKANDI!', earlyBonus: 'ERKEN BONUSU', pipes: 'BORU',
    },
    en: {
      flowIn: 'WATER IN: {s}', flowing: 'WATER FLOWING!', openNow: 'FLOW NOW', connected: 'CONNECTED!', leak: 'LEAK!',
      drained: 'DONE!', blocked: 'WATER BLOCKED!', earlyBonus: 'EARLY BONUS', pipes: 'PIPES',
    },
  },
});
