import { launch, loadAudio, loadSfx, type GameMeta } from '@core';
import meta from './game.json';
import { PlayScene, makeSumoTextures } from './PlayScene';

launch({
  meta: meta as GameMeta,
  background: '#1b1420',
  physics: 'none',
  music: { play: 'boss' },
  preload(scene) {
    const l = scene.load;
    const J = 'oga/junkala-sfx/';
    loadSfx(l, 'bump', 'sfx-impact/audio/impactpunch_medium_000');
    loadSfx(l, 'bumpHard', 'sfx-impact/audio/impactpunch_heavy_002');
    loadAudio(l, 'dash', J + 'movement/jumping-and-landing/sfx-movement-jump9');
    loadAudio(l, 'thud', J + 'general-sounds/impacts/sfx-sounds-impact3');
    loadAudio(l, 'fall', J + 'movement/falling-sounds/sfx-sounds-falling3');
    loadAudio(l, 'tick', J + 'general-sounds/simple-bleeps/sfx-sounds-blip10');
    loadAudio(l, 'go', J + 'general-sounds/menu-sounds/sfx-menu-select4');
    loadAudio(l, 'shrink', J + 'general-sounds/neutral-sounds/sfx-sound-neutral2');
    loadAudio(l, 'cheer', J + 'general-sounds/positive-sounds/sfx-sounds-powerup4');
    loadAudio(l, 'boo', J + 'general-sounds/negative-sounds/sfx-sounds-negative2');
    loadAudio(l, 'win', J + 'general-sounds/fanfares/sfx-sounds-fanfare1');
    loadAudio(l, 'lose', J + 'general-sounds/negative-sounds/sfx-sounds-negative1');
  },
  menuDecor(scene) {
    makeSumoTextures(scene);
    const { width, height } = scene.scale;
    const cy = height * 0.86;
    const g = scene.add.graphics();
    g.fillStyle(0xe6cf9a).fillCircle(width / 2, cy, 120);
    g.lineStyle(12, 0xcdb060).strokeCircle(width / 2, cy, 124);
    const a = scene.add.image(width / 2 - 50, cy, 'sm-red').setDisplaySize(110, 110);
    const b = scene.add.image(width / 2 + 50, cy, 'sm-blue').setDisplaySize(110, 110).setRotation(Math.PI);
    scene.tweens.add({ targets: a, x: a.x + 14, duration: 380, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    scene.tweens.add({ targets: b, x: b.x + 14, duration: 380, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
  },
  scenes: [PlayScene],
  strings: {
    tr: {
      cpu: 'RAKİP', dash: 'HÜCUM', bout: '{n}. TUR', boutWin: 'İTTİN!', boutLose: 'DIŞARIDASIN!',
      shrink: 'Halka daralıyor!', nextRival: 'YENİ RAKİP', matchLost: 'MAÇI KAYBETTİN',
      rival: 'Rakip: {name}', keysHint: 'Oklar: yürü · Boşluk: hücum',
      d0: 'Çaylak', d1: 'Acemi Pehlivan', d2: 'Pehlivan', d3: 'Usta', d4: 'Şampiyon', d5: 'Yokozuna',
    },
    en: {
      cpu: 'CPU', dash: 'DASH', bout: 'BOUT {n}', boutWin: 'PUSHED OUT!', boutLose: "YOU'RE OUT!",
      shrink: 'The ring is shrinking!', nextRival: 'NEW RIVAL', matchLost: 'MATCH LOST',
      rival: 'Rival: {name}', keysHint: 'Arrows: move · Space: dash',
      d0: 'Rookie', d1: 'Novice', d2: 'Wrestler', d3: 'Master', d4: 'Champion', d5: 'Yokozuna',
    },
  },
});
