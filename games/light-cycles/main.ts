import { launch, kenney, loadAudio, type GameMeta } from '@core';
import meta from './game.json';
import { PlayScene } from './PlayScene';

launch({
  meta: meta as GameMeta,
  background: '#05040f',
  physics: 'none',
  preload(scene) {
    const l = scene.load;
    l.image('glow', kenney('particles/png_transparent/circle_05.png'));
    const J = 'oga/junkala-sfx/';
    loadAudio(l, 'steer', J + 'general-sounds/menu-sounds/sfx-menu-move1');
    loadAudio(l, 'count', J + 'general-sounds/simple-bleeps/sfx-sounds-blip10');
    loadAudio(l, 'go', J + 'general-sounds/positive-sounds/sfx-sounds-powerup13');
    loadAudio(l, 'crash', J + 'explosions/short/sfx-exp-short-hard8');
    loadAudio(l, 'point', J + 'general-sounds/coins/sfx-coin-double3');
    loadAudio(l, 'draw', J + 'general-sounds/neutral-sounds/sfx-sound-neutral6');
    loadAudio(l, 'next', J + 'movement/portals-and-transitions/sfx-movement-portal5');
    loadAudio(l, 'win', J + 'general-sounds/fanfares/sfx-sounds-fanfare3');
    loadAudio(l, 'lose', J + 'general-sounds/negative-sounds/sfx-sounds-negative2');
  },
  menuDecor(scene) {
    const { width, height } = scene.scale;
    const g = scene.add.graphics();
    const y0 = height * 0.87;
    g.lineStyle(14, 0x3ee6ff, 0.2).lineBetween(width / 2 - 220, y0 + 40, width / 2 - 40, y0 + 40).lineBetween(width / 2 - 40, y0 + 40, width / 2 - 40, y0 - 30);
    g.lineStyle(6, 0x3ee6ff).lineBetween(width / 2 - 220, y0 + 40, width / 2 - 40, y0 + 40).lineBetween(width / 2 - 40, y0 + 40, width / 2 - 40, y0 - 30);
    g.lineStyle(14, 0xff8a2a, 0.2).lineBetween(width / 2 + 220, y0 - 40, width / 2 + 40, y0 - 40).lineBetween(width / 2 + 40, y0 - 40, width / 2 + 40, y0 + 30);
    g.lineStyle(6, 0xff8a2a).lineBetween(width / 2 + 220, y0 - 40, width / 2 + 40, y0 - 40).lineBetween(width / 2 + 40, y0 - 40, width / 2 + 40, y0 + 30);
    const a = scene.add.image(width / 2 - 40, y0 - 30, 'glow').setDisplaySize(60, 60).setTint(0x3ee6ff).setBlendMode('ADD');
    const b = scene.add.image(width / 2 + 40, y0 + 30, 'glow').setDisplaySize(60, 60).setTint(0xff8a2a).setBlendMode('ADD');
    scene.tweens.add({ targets: [a, b], alpha: 0.4, duration: 500, yoyo: true, repeat: -1 });
  },
  scenes: [PlayScene],
  strings: {
    tr: {
      round: 'TUR', left: 'SOL', right: 'SAĞ', c3: '3', c2: '2', c1: '1', go: 'BAŞLA!',
      roundWin: 'TURU ALDIN!', roundLose: 'ÇARPTIN!', bothCrash: 'İKİNİZ DE ÇARPTINIZ',
      matchWon: 'MAÇI KAZANDIN!', nextRival: 'SIRADAKİ RAKİP: {name}', champion: 'ŞAMPİYON!',
      keysHint: 'Oklar / WASD: yön ver', keysHint2: 'Z / X: sola / sağa dön · Ekranda kaydır: yön ver',
      r0: 'Çaylak', r1: 'Gezgin', r2: 'Avcı', r3: 'Kesici', r4: 'Hayalet',
    },
    en: {
      round: 'ROUND', left: 'LEFT', right: 'RIGHT', c3: '3', c2: '2', c1: '1', go: 'GO!',
      roundWin: 'ROUND WON!', roundLose: 'CRASHED!', bothCrash: 'BOTH CRASHED',
      matchWon: 'MATCH WON!', nextRival: 'NEXT RIVAL: {name}', champion: 'CHAMPION!',
      keysHint: 'Arrows / WASD: steer', keysHint2: 'Z / X: turn left / right · Swipe: steer',
      r0: 'Rookie', r1: 'Drifter', r2: 'Hunter', r3: 'Cutter', r4: 'Ghost',
    },
  },
});
