import { launch, kenney, loadAudio, loadSfx, type GameMeta } from '@core';
import meta from './game.json';
import { PlayScene, cardKey } from './PlayScene';

const C = 'boardgame/png/cards/';
const SUITS = ['clubs', 'diamonds', 'hearts', 'spades'];
const RANKS = ['a', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'j', 'q', 'k'];

launch({
  meta: meta as GameMeta,
  background: '#0f3d26',
  physics: 'none',
  preload(scene) {
    const l = scene.load;
    SUITS.forEach((s, si) => RANKS.forEach((r, ri) => l.image(cardKey(si, ri + 1), kenney(`${C}card${s}${r}.png`))));
    l.image('card-back', kenney(C + 'cardback_red2.png'));
    // physical card sounds stay Kenney casino; cues and stings come from the Junkala pack
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
    loadAudio(l, 'cursor', J + 'menu-sounds/sfx-menu-move3');
    loadAudio(l, 'error', J + 'negative-sounds/sfx-sounds-error6');
    loadAudio(l, 'undo', J + 'pause-sounds/sfx-sounds-pause2-out');
    loadAudio(l, 'stuck', J + 'negative-sounds/sfx-sounds-negative2');
    loadAudio(l, 'win', J + 'fanfares/sfx-sounds-fanfare1');
  },
  menuDecor(scene) {
    const { width, height } = scene.scale;
    [[0, 1], [3, 1], [2, 13], [1, 12]].forEach(([s, r], i) => {
      scene.add.image(width / 2 - 135 + i * 90, height * 0.84 + Math.abs(i - 1.5) * 14, cardKey(s, r)).setScale(0.75).setAngle((i - 1.5) * 9);
    });
  },
  scenes: [PlayScene],
  strings: {
    tr: {
      undo: 'GERİ AL', hint: 'İPUCU', deck: 'Deste turu: {n}/{m}', noMoves: 'HAMLE KALMADI', solved: 'TEBRİKLER!',
      movesN: 'Hamle: {n}',
    },
    en: {
      undo: 'UNDO', hint: 'HINT', deck: 'Deck pass: {n}/{m}', noMoves: 'NO MOVES LEFT', solved: 'SOLVED!',
      movesN: 'Moves: {n}',
    },
  },
});
