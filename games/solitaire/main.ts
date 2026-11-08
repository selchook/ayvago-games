import { launch, loadAudio, loadSfx, type GameMeta } from '@core';
import meta from './game.json';
import { PlayScene } from './PlayScene';
import { BACK, SHADOW, faceKey, makeArt, makeFelt } from './art';

launch({
  meta: meta as GameMeta,
  background: '#0f3d26',
  physics: 'none',
  preload(scene) {
    const l = scene.load;
    // the cards and the table are painted at run time (art.ts); only sounds load here.
    // Physical card sounds are Kenney casino; cues and stings come from the Junkala pack.
    loadSfx(l, 'place1', 'sfx-casino/audio/cardplace1');
    loadSfx(l, 'place2', 'sfx-casino/audio/cardplace3');
    loadSfx(l, 'place3', 'sfx-casino/audio/cardplace4');
    loadSfx(l, 'flip1', 'sfx-casino/audio/cardslide5');
    loadSfx(l, 'flip2', 'sfx-casino/audio/cardslide6');
    loadSfx(l, 'shuffle', 'sfx-casino/audio/cardshuffle');
    loadSfx(l, 'recycle', 'sfx-casino/audio/cardshove2');
    loadSfx(l, 'fan', 'sfx-casino/audio/cardfan2');
    const J = 'oga/junkala-sfx/general-sounds/';
    loadAudio(l, 'found', J + 'coins/sfx-coin-single1');
    loadAudio(l, 'suit', J + 'coins/sfx-coin-cluster3');
    loadAudio(l, 'reveal', J + 'high-pitched-sounds/sfx-sounds-high6');
    loadAudio(l, 'hint', J + 'high-pitched-sounds/sfx-sounds-high2');
    loadAudio(l, 'ready', J + 'positive-sounds/sfx-sounds-powerup2');
    loadAudio(l, 'cursor', J + 'menu-sounds/sfx-menu-move3');
    loadAudio(l, 'error', J + 'negative-sounds/sfx-sounds-error6');
    loadAudio(l, 'undo', J + 'pause-sounds/sfx-sounds-pause2-out');
    loadAudio(l, 'stuck', J + 'negative-sounds/sfx-sounds-negative2');
    loadAudio(l, 'win', J + 'fanfares/sfx-sounds-fanfare1');
  },
  menuDecor(scene) {
    const { width, height } = scene.scale;
    makeArt(scene);
    scene.add.image(0, 0, makeFelt(scene, width, height, 1140)).setOrigin(0).setDepth(-100);
    // a fanned hand: the back, then the ace of spades, the king of hearts and the queen of diamonds
    const hand: [string, number][] = [[BACK, -15], [faceKey(3, 1), -5], [faceKey(2, 13), 5], [faceKey(1, 12), 15]];
    hand.forEach(([key, angle], i) => {
      const x = width / 2 - 105 + i * 70, y = height * 0.868 + Math.abs(i - 1.5) * 10;
      const shadow = scene.add.image(x + 3, y + 6, SHADOW).setAngle(angle).setAlpha(0.45).setScale(0.85);
      const card = scene.add.image(x, y, key).setAngle(angle).setScale(0.85);
      scene.tweens.add({ targets: [card, shadow], y: '-=10', duration: 1400, delay: i * 180, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    });
  },
  scenes: [PlayScene],
  strings: {
    tr: {
      undo: 'GERİ AL', hint: 'İPUCU', auto: 'OTOMATİK BİTİR', giveUp: 'PES ET', sure: 'EMİN MİSİN?',
      noMoves: 'HAMLE KALMADI', solved: 'TEBRİKLER!', gaveUp: 'PES ETTİN',
      cards: 'kart', passN: 'Tur {n}/{m}', noUseful: 'Yararlı hamle yok',
      timeBonus: 'Süre {t} · bonus +{n}',
    },
    en: {
      undo: 'UNDO', hint: 'HINT', auto: 'AUTO FINISH', giveUp: 'GIVE UP', sure: 'SURE?',
      noMoves: 'NO MOVES LEFT', solved: 'SOLVED!', gaveUp: 'YOU GAVE UP',
      cards: 'cards', passN: 'Pass {n}/{m}', noUseful: 'No useful move',
      timeBonus: 'Time {t} · bonus +{n}',
    },
  },
});
