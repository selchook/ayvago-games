import Phaser from 'phaser';
import { launch, loadAudio, loadSfx, type GameMeta } from '@core';
import meta from './game.json';
import { PlayScene, PALETTE } from './PlayScene';

const J = 'oga/junkala-sfx/';

launch({
  meta: meta as GameMeta,
  background: '#14111f',
  physics: 'none',
  preload(scene) {
    const l = scene.load;
    loadAudio(l, 'hop1', J + 'movement/jumping-and-landing/sfx-movement-jump1');
    loadAudio(l, 'hop2', J + 'movement/jumping-and-landing/sfx-movement-jump5');
    loadAudio(l, 'hop3', J + 'movement/jumping-and-landing/sfx-movement-jump10');
    loadAudio(l, 'switch', J + 'general-sounds/positive-sounds/sfx-sounds-powerup10');
    loadAudio(l, 'pass', J + 'general-sounds/simple-bleeps/sfx-sounds-blip6');
    loadAudio(l, 'checkpoint', J + 'general-sounds/coins/sfx-coin-double4');
    loadAudio(l, 'level', J + 'general-sounds/fanfares/sfx-sounds-fanfare3');
    loadSfx(l, 'shatter', 'sfx-impact/audio/impactglass_heavy_001');
    loadAudio(l, 'die', J + 'general-sounds/negative-sounds/sfx-sounds-damage2');
    loadAudio(l, 'respawn', J + 'movement/portals-and-transitions/sfx-movement-portal5');
    loadAudio(l, 'tick', J + 'general-sounds/simple-bleeps/sfx-sounds-blip10');
    loadAudio(l, 'go', J + 'general-sounds/menu-sounds/sfx-menu-select4');
    loadAudio(l, 'buzzer', J + 'general-sounds/negative-sounds/sfx-sounds-error3');
    loadAudio(l, 'win', J + 'general-sounds/fanfares/sfx-sounds-fanfare1');
    loadAudio(l, 'lose', J + 'general-sounds/negative-sounds/sfx-sounds-negative1');
  },
  menuDecor(scene) {
    const { width, height } = scene.scale;
    const g = scene.add.graphics({ x: width / 2, y: height * 0.85 });
    PALETTE.forEach((c, i) => {
      g.lineStyle(22, c, 1).beginPath();
      g.arc(0, 0, 88, Phaser.Math.DegToRad(i * 90), Phaser.Math.DegToRad((i + 1) * 90));
      g.strokePath();
    });
    scene.tweens.add({ targets: g, angle: 360, duration: 4000, repeat: -1 });
    const a = scene.add.circle(width / 2 - 22, height * 0.85 + 30, 18, PALETTE[0]).setStrokeStyle(4, 0xffffff, 0.8);
    const b = scene.add.circle(width / 2 + 22, height * 0.85 + 30, 18, PALETTE[1], 0.5).setStrokeStyle(4, 0xffffff, 0.5);
    scene.tweens.add({ targets: a, y: a.y - 70, duration: 420, yoyo: true, repeat: -1, ease: 'Quad.easeOut' });
    scene.tweens.add({ targets: b, y: b.y - 55, duration: 470, yoyo: true, repeat: -1, ease: 'Quad.easeOut', delay: 120 });
  },
  scenes: [PlayScene],
  strings: {
    tr: {
      tapHop: 'Zıplamak için dokun', backTo: 'Kontrol noktası: dokun ve devam et',
      keyHop: "Zıplamak için Boşluk'a bas", backToKey: "Kontrol noktası: Boşluk'la devam et", wrong: 'YANLIŞ RENK!', fell: 'DÜŞTÜN!',
      finish: 'ZİRVE', checkpoint: 'KONTROL NOKTASI!', timeUp: 'SÜRE BİTTİ', raceWin: 'YARIŞI KAZANDIN!', raceLose: 'HAYALET KAZANDI',
      ghost: 'HAYALET', roundN: '{n}. Tur', rival: 'Rakip: {name}',
      d0: 'Acemi', d1: 'Çırak', d2: 'Usta', d3: 'Zorlu', d4: 'Uzman', d5: 'Şimşek',
    },
    en: {
      tapHop: 'Tap to hop', backTo: 'Checkpoint: tap to carry on',
      keyHop: 'Press Space to hop', backToKey: 'Checkpoint: press Space to carry on', wrong: 'WRONG COLOUR!', fell: 'YOU FELL!',
      finish: 'THE TOP', checkpoint: 'CHECKPOINT!', timeUp: "TIME'S UP", raceWin: 'RACE WON!', raceLose: 'THE GHOST WON',
      ghost: 'GHOST', roundN: 'Round {n}', rival: 'Rival: {name}',
      d0: 'Rookie', d1: 'Apprentice', d2: 'Adept', d3: 'Tough', d4: 'Expert', d5: 'Lightning',
    },
  },
});
