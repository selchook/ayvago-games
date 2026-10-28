import { launch, kenney, loadSfx, type GameMeta } from '@core';
import meta from './game.json';
import { PlayScene } from './PlayScene';
import { warmText } from './fasttext';

launch({
  meta: meta as GameMeta,
  background: '#141018',
  pixelArt: true,
  physics: 'none',
  preload(scene) {
    const l = scene.load;
    l.spritesheet('mr', kenney('micro-roguelike/tilemap/colored_tilemap_packed.png'), { frameWidth: 8, frameHeight: 8 });
    loadSfx(l, 'step', 'sfx-impact/audio/footstep_concrete_001');
    loadSfx(l, 'hit', 'sfx-impact/audio/impactpunch_medium_001');
    loadSfx(l, 'hurt', 'sfx-impact/audio/impactpunch_heavy_003');
    loadSfx(l, 'kill', 'sfx-digital/audio/zap2');
    loadSfx(l, 'coin', 'sfx-casino/audio/chipshandle3');
    loadSfx(l, 'potion', 'sfx-digital/audio/powerup2');
    loadSfx(l, 'item', 'sfx-digital/audio/powerup9');
    loadSfx(l, 'chest', 'sfx-impact/audio/impactwood_heavy_001');
    loadSfx(l, 'stairs', 'sfx-digital/audio/phaserdown1');
    loadSfx(l, 'bump', 'sfx-interface/audio/error_006');
    loadSfx(l, 'boss', 'sfx-digital/audio/lowthreetone');
  },
  menuDecor(scene) {
    warmText(scene, [[18, true], [22, true], [24, true], [18, true], [30, true], [28, true], [20, true], [40, true]]);
    const { width, height } = scene.scale;
    const frames = [4, 10, 22, 12, 21, 9];
    frames.forEach((f, i) => scene.add.image(width * (0.15 + i * 0.14), height * 0.86, 'mr', f).setScale(9));
    scene.add.image(width * 0.12, height * 0.08, 'mr', 120).setScale(8);
    scene.add.image(width * 0.88, height * 0.08, 'mr', 120).setScale(8).setFlipX(true);
  },
  scenes: [PlayScene],
  strings: {
    tr: { floor: 'KAT', wait: 'BEKLE', potion: 'İKSİR', atk: 'SALDIRI', armor: 'ZIRH', maxhp: 'MAKS. CAN', heal: 'CAN', boss: 'KAT BEKÇİSİ!', down: 'MERDİVEN AÇILDI!', full: 'Çanta dolu', locked: 'Önce kat bekçisini yen!', trap: 'TUZAK!', levelUp: 'SEVİYE {n}! GÜÇLENDİN', lv: 'SV' },
    en: { floor: 'FLOOR', wait: 'WAIT', potion: 'POTION', atk: 'ATTACK', armor: 'ARMOR', maxhp: 'MAX HP', heal: 'HP', boss: 'FLOOR GUARDIAN!', down: 'STAIRS OPEN!', full: 'Bag full', locked: 'Defeat the guardian first!', trap: 'TRAP!', levelUp: 'LEVEL {n}! STRONGER', lv: 'LV' },
  },
});
