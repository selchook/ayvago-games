import { launch, loadSfx, type GameMeta } from '@core';
import meta from './game.json';
import { PlayScene } from './PlayScene';

launch({
  meta: meta as GameMeta,
  background: '#141018',
  physics: 'none',
  preload(scene) {
    const l = scene.load;
    loadSfx(l, 'buzz', 'sfx-digital/audio/lowdown');
    loadSfx(l, 'round', 'sfx-digital/audio/powerup2');
    loadSfx(l, 'levelup', 'sfx-digital/audio/threetone1');
    // fallback pad sounds when Web Audio synthesis is unavailable
    loadSfx(l, 'pad', 'sfx-digital/audio/tone1');
  },
  menuDecor(scene) {
    const { width, height } = scene.scale;
    const cols = [0x2ecc40, 0xd02020, 0x1f5fe0, 0xd8b000];
    cols.forEach((c, i) => {
      const a = -Math.PI / 2 + (i * Math.PI) / 2;
      scene.add.circle(width / 2 + Math.cos(a) * 70, height * 0.84 + Math.sin(a) * 70, 42, c).setStrokeStyle(6, 0x000000);
    });
  },
  scenes: [PlayScene],
  strings: {
    tr: { watch: 'İZLE', yourTurn: 'SIRA SENDE', round: 'TUR', wrong: 'YANLIŞ!', tooSlow: 'GEÇ KALDIN!', speedUp: 'HIZLANIYOR!', perfect: 'MÜKEMMEL!', keys: 'Klavye: ↑ → ↓ ← veya 1-4' },
    en: { watch: 'WATCH', yourTurn: 'YOUR TURN', round: 'ROUND', wrong: 'WRONG!', tooSlow: 'TOO SLOW!', speedUp: 'SPEED UP!', perfect: 'PERFECT!', keys: 'Keys: ↑ → ↓ ← or 1-4' },
  },
});
