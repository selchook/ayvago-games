import { launch, kenney, loadSfx, type GameMeta } from '@core';
import meta from './game.json';
import { PlayScene } from './PlayScene';
import { warmText } from './fasttext';

const TILE = (n: number) => kenney(`tower-defense/png/default_size/towerdefense_tile${String(n).padStart(3, '0')}.png`);

const IMAGES: Record<string, number> = {
  'td-grass': 157, 'td-dirt': 158, 'td-bush': 130, 'td-bush2': 131, 'td-rock': 135, 'td-rock2': 136,
  'td-b0': 180, 'td-b1': 181, 'td-b2': 182, 'td-h0': 203, 'td-h1': 226, 'td-h2': 206, 'td-h2b': 205,
  'td-e0': 245, 'td-e1': 246, 'td-e2': 247, 'td-tank': 268, 'td-tank-t': 291, 'td-tank2': 269, 'td-tank2-t': 292,
  'td-plane': 270, 'td-shadow': 293, 'td-bullet': 273, 'td-shell': 274, 'td-rocket': 251, 'td-coin': 272,
  'td-scorch': 19, 'td-blast': 21, 'td-fire': 295,
};

launch({
  meta: meta as GameMeta,
  background: '#14261a',
  physics: 'none',
  preload(scene) {
    const l = scene.load;
    for (const [k, n] of Object.entries(IMAGES)) l.image(k, TILE(n));
    loadSfx(l, 'build', 'sfx-impact/audio/impactmetal_heavy_001');
    loadSfx(l, 'gun', 'sfx-digital/audio/laser9');
    loadSfx(l, 'cannon', 'sfx-impact/audio/impactpunch_heavy_002');
    loadSfx(l, 'missile', 'sfx-digital/audio/phaserup2');
    loadSfx(l, 'boom', 'sfx-impact/audio/impactmining_001');
    loadSfx(l, 'kill', 'sfx-digital/audio/zap1');
    loadSfx(l, 'leak', 'sfx-digital/audio/phaserdown3');
    loadSfx(l, 'wave', 'sfx-digital/audio/threetone1');
    loadSfx(l, 'clear', 'sfx-digital/audio/powerup3');
    loadSfx(l, 'upgrade', 'sfx-digital/audio/powerup7');
    loadSfx(l, 'sell', 'sfx-casino/audio/chipsstack2');
    loadSfx(l, 'error', 'sfx-interface/audio/error_004');
    loadSfx(l, 'select', 'sfx-interface/audio/select_004');
  },
  menuDecor(scene) {
    warmText(scene, [[26, true], [16, true], [1, true], [26, false], [22, false], [18, true], [20, true], [48, true], [36, true], [32, true]]);
    const { width, height } = scene.scale;
    for (let x = 0; x < width; x += 80) scene.add.image(x + 40, height - 40, 'td-dirt').setDisplaySize(80, 80).setAlpha(0.35);
    scene.add.image(width * 0.12, height * 0.55, 'td-b2').setScale(1.6);
    scene.add.image(width * 0.12, height * 0.55, 'td-h2').setScale(1.6).setAngle(30);
    scene.add.image(width * 0.88, height * 0.55, 'td-b0').setScale(1.6);
    scene.add.image(width * 0.88, height * 0.55, 'td-h0').setScale(1.6).setAngle(-40);
    scene.add.image(width * 0.25, height * 0.86, 'td-tank').setScale(1.3);
    scene.add.image(width * 0.25, height * 0.86, 'td-tank-t').setScale(1.3);
    scene.add.image(width * 0.75, height * 0.15, 'td-plane').setScale(1.2).setAngle(-10);
  },
  scenes: [PlayScene],
  strings: {
    tr: {
      tGun: 'Taret', tCannon: 'Top', tMissile: 'Füze', groundOnly: 'Sadece kara', airGround: 'Kara + hava',
      upgrade: 'GELİŞTİR', sell: 'SAT', max: 'MAKS', nextWave: 'DALGA', nextIn: 'BAŞLAT {n}', waveOf: 'DALGA {n}/{m}',
      finalWave: 'SON DALGA!', bossIn: 'DEV TANK!', noGold: 'Altın yetmiyor!', cantBuild: 'Buraya kurulmaz', clearBonus: 'DALGA TEMİZ',
      lvl: 'Sv.', victory: 'ÜS KURTULDU!',
    },
    en: {
      tGun: 'Turret', tCannon: 'Cannon', tMissile: 'Missile', groundOnly: 'Ground only', airGround: 'Ground + air',
      upgrade: 'UPGRADE', sell: 'SELL', max: 'MAX', nextWave: 'WAVE', nextIn: 'START {n}', waveOf: 'WAVE {n}/{m}',
      finalWave: 'FINAL WAVE!', bossIn: 'GIANT TANK!', noGold: 'Not enough gold!', cantBuild: "Can't build here", clearBonus: 'WAVE CLEAR',
      lvl: 'Lv.', victory: 'BASE SAVED!',
    },
  },
});
