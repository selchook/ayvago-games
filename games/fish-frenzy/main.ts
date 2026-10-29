import { launch, loadAudio, loadSfx, kenney, type GameMeta } from '@core';
import meta from './game.json';
import { PlayScene, SPECIES } from './PlayScene';

const F = 'fish/png/default_size/fishtile_';
const tile = (n: number) => kenney(`${F}${String(n).padStart(3, '0')}.png`);

const J = 'oga/junkala-sfx/';

launch({
  meta: meta as GameMeta,
  background: '#0d3b66',
  physics: 'none',
  preload(scene) {
    const l = scene.load;
    for (const s of SPECIES) l.image(s.key, tile(s.tile));
    l.image('ff-player', tile(81));
    l.image('ff-puffer', tile(101));
    for (const n of [90, 92, 94]) l.image(`ff-bone${n}`, tile(n));
    for (const n of [1, 2, 3, 4, 5, 6, 7, 8, 9]) l.image(`ff-sand${n}`, tile(n));
    for (const n of [10, 11, 12, 14, 28, 29, 30, 32, 34, 48, 64, 65, 70, 47, 51, 82, 84, 86]) l.image(`ff-deco${n}`, tile(n));
    l.image('ff-bubble', tile(123));
    loadSfx(l, 'eat1', 'sfx-interface/audio/drop_001');
    loadSfx(l, 'eat2', 'sfx-interface/audio/drop_002');
    loadSfx(l, 'eat3', 'sfx-interface/audio/drop_003');
    loadSfx(l, 'eatbig', 'sfx-interface/audio/drop_004');
    loadAudio(l, 'chomp', J + 'weapons/melee/sfx-wpn-punch4');
    loadAudio(l, 'bite', J + 'weapons/melee/sfx-wpn-punch2');
    loadAudio(l, 'hurt', J + 'general-sounds/negative-sounds/sfx-sounds-damage3');
    loadAudio(l, 'sink', J + 'movement/falling-sounds/sfx-sounds-falling6');
    loadAudio(l, 'low', J + 'general-sounds/alarms/low-health-alarms/sfx-lowhealth-alarmloop5');
    loadAudio(l, 'warn', J + 'general-sounds/alarms/alarms/sfx-alarm-loop6');
    loadAudio(l, 'puff', J + 'movement/jumping-and-landing/sfx-movement-jump4');
    loadAudio(l, 'level', J + 'general-sounds/fanfares/sfx-sounds-fanfare1');
    loadAudio(l, 'grow', J + 'general-sounds/positive-sounds/sfx-sounds-powerup13');
  },
  menuDecor(scene) {
    const { width, height } = scene.scale;
    for (let x = 32; x < width + 64; x += 64) scene.add.image(x, height - 32, 'ff-sand2');
    [[60, 'ff-deco32'], [180, 'ff-deco12'], [1100, 'ff-deco29'], [1220, 'ff-deco10']].forEach(([x, k]) => {
      const d = scene.add.image(x as number, height - 56, k as string).setOrigin(0.5, 1).setScale(1.6);
      scene.tweens.add({ targets: d, angle: 6, duration: 1400, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    });
    const swim = (key: string, y: number, s: number, dur: number, flip: boolean) => {
      const f = scene.add.image(flip ? width + 100 : -100, y, key).setScale(s).setFlipX(flip);
      scene.tweens.add({ targets: f, x: flip ? -100 : width + 100, duration: dur, repeat: -1, delay: dur * 0.2 });
    };
    swim('ff-player', height * 0.1, 1.5, 7000, false);
    swim('ff-fish-green', height * 0.92 - 60, 2.4, 9000, true);
    swim('ff-fish-pink', height * 0.12, 1, 5000, true);
  },
  scenes: [PlayScene],
  strings: {
    tr: { growth: 'BÜYÜME', shark: 'KÖPEKBALIĞI!', eaten: 'YEM OLDUN!', bigger: 'BÜYÜDÜN!' },
    en: { growth: 'GROWTH', shark: 'SHARK!', eaten: 'YOU GOT EATEN!', bigger: 'BIGGER!' },
  },
});
