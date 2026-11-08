import { launch, loadAudio, type GameMeta } from '@core';
import meta from './game.json';
import { PlayScene } from './PlayScene';
import { menuDecor } from './art';

launch({
  meta: meta as GameMeta,
  background: '#1d3a5c',
  physics: 'none',
  preload(scene) {
    const l = scene.load;
    const G = 'oga/junkala-sfx/general-sounds/';
    loadAudio(l, 'type', G + 'simple-bleeps/sfx-sounds-blip1');
    loadAudio(l, 'del', G + 'menu-sounds/sfx-menu-move2');
    loadAudio(l, 'invalid', G + 'negative-sounds/sfx-sounds-error3');
    loadAudio(l, 'flip', G + 'simple-bleeps/sfx-sounds-blip8');
    loadAudio(l, 'solve', G + 'fanfares/sfx-sounds-fanfare3');
    loadAudio(l, 'coins', G + 'coins/sfx-coin-cluster3');
    loadAudio(l, 'miss', G + 'negative-sounds/sfx-sounds-negative2');
    loadAudio(l, 'life', G + 'simple-damage-sounds/sfx-damage-hit5');
    loadAudio(l, 'joker', G + 'positive-sounds/sfx-sounds-powerup7');
    loadAudio(l, 'earn', G + 'high-pitched-sounds/sfx-sounds-high3');
    loadAudio(l, 'deny', G + 'menu-sounds/sfx-menu-move4');
    loadAudio(l, 'tick', G + 'simple-bleeps/sfx-sounds-blip10');
    loadAudio(l, 'grow', G + 'positive-sounds/sfx-sounds-powerup10');
  },
  menuDecor,
  scenes: [PlayScene],
  strings: {
    tr: {
      notInList: 'Listede yok', tooShort: 'Harf eksik', reveal: 'HARF AÇ', remove: '5 HARF AT',
      noJoker: 'Joker yok', nothingLeft: 'Açılacak harf kalmadı', newJoker: '+1 JOKER',
      wordWas: 'Gizli kelime:', timeUp: 'SÜRE DOLDU!', outOfTries: 'HAKLAR BİTTİ!',
      letters: '{n} HARFLİ KELİMELER!', solved1: 'Harika!', solved2: 'Süper!', solved3: 'Muhteşem!',
      lastLife: 'SON CAN!',
    },
    en: {
      notInList: 'Not in the list', tooShort: 'Not enough letters', reveal: 'REVEAL', remove: 'DROP 5',
      noJoker: 'No jokers', nothingLeft: 'Nothing left to reveal', newJoker: '+1 JOKER',
      wordWas: 'The secret word:', timeUp: "TIME'S UP!", outOfTries: 'OUT OF TRIES!',
      letters: '{n}-LETTER WORDS!', solved1: 'Great!', solved2: 'Superb!', solved3: 'Amazing!',
      lastLife: 'LAST LIFE!',
    },
  },
});
