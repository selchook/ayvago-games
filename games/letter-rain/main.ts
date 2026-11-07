import { launch, loadAudio, type GameMeta } from '@core';
import meta from './game.json';
import { PlayScene } from './PlayScene';
import { menuRain } from './art';

launch({
  meta: meta as GameMeta,
  background: '#24305e',
  physics: 'none',
  preload(scene) {
    const l = scene.load;
    const J = 'oga/junkala-sfx/';
    const G = J + 'general-sounds/';
    loadAudio(l, 'sel', G + 'simple-bleeps/sfx-sounds-blip3');
    loadAudio(l, 'valid', G + 'coins/sfx-coin-cluster3');
    loadAudio(l, 'great', G + 'positive-sounds/sfx-sounds-powerup4');
    loadAudio(l, 'combo', G + 'coins/sfx-coin-double2');
    loadAudio(l, 'wrong', G + 'negative-sounds/sfx-sounds-error8');
    loadAudio(l, 'deny', G + 'menu-sounds/sfx-menu-move4');
    loadAudio(l, 'land', J + 'movement/jumping-and-landing/sfx-movement-jump9-landing');
    loadAudio(l, 'bomb', J + 'explosions/short/sfx-exp-short-soft3');
    loadAudio(l, 'crumble', G + 'impacts/sfx-sounds-impact5');
    loadAudio(l, 'harden', G + 'simple-damage-sounds/sfx-damage-hit3');
    loadAudio(l, 'levelup', G + 'fanfares/sfx-sounds-fanfare2');
    loadAudio(l, 'shuffle', G + 'menu-sounds/sfx-menu-select2');
    loadAudio(l, 'hint', G + 'high-pitched-sounds/sfx-sounds-high7');
    loadAudio(l, 'alarm', G + 'alarms/low-health-alarms/sfx-lowhealth-alarmloop1');
    loadAudio(l, 'warn', G + 'simple-bleeps/sfx-sounds-blip10');
    loadAudio(l, 'over', G + 'negative-sounds/sfx-sounds-negative1');
  },
  menuDecor: menuRain,
  scenes: [PlayScene],
  strings: {
    tr: {
      send: 'GÖNDER', boardFull: 'TAHTA DOLDU!', dragHint: 'Harflerin üzerinde sürükle ya da tek tek dokun',
      notWord: 'Sözlükte yok', tooShort: 'En az 3 harf', noWords: 'Kelime yok, karıştır!',
      newHint: '+1 İPUCU', newShuffle: '+1 KARIŞTIR', faster: 'Yağmur hızlanıyor!', lookOut: 'DİKKAT!',
      praise1: 'Harika!', praise2: 'Süper!', praise3: 'Muhteşem!',
      introGold: 'ALTIN: kelime puanı ×2', introBomb: 'BOMBA: çevresini temizler',
      introCracked: 'ÇATLAK: çabuk kullan, yoksa taşa döner', introStone: 'TAŞ: yanında kelime kur',
      levelWords: '{n}/{m}',
    },
    en: {
      send: 'SEND', boardFull: 'BOARD FULL!', dragHint: 'Drag across the letters or tap them one by one',
      notWord: 'Not a word', tooShort: 'At least 3 letters', noWords: 'No words, shuffle!',
      newHint: '+1 HINT', newShuffle: '+1 SHUFFLE', faster: 'The rain speeds up!', lookOut: 'LOOK OUT!',
      praise1: 'Great!', praise2: 'Superb!', praise3: 'Amazing!',
      introGold: 'GOLD: double word score', introBomb: 'BOMB: clears its neighbours',
      introCracked: 'CRACKED: use it soon or it turns to stone', introStone: 'STONE: spell a word next to it',
      levelWords: '{n}/{m}',
    },
  },
});
