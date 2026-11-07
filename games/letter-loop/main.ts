import { launch, loadAudio, loc, txt, type GameMeta } from '@core';
import meta from './game.json';
import { PlayScene } from './PlayScene';

launch({
  meta: meta as GameMeta,
  background: '#2a3270',
  physics: 'none',
  preload(scene) {
    const l = scene.load;
    const J = 'oga/junkala-sfx/general-sounds/';
    loadAudio(l, 'sel', J + 'simple-bleeps/sfx-sounds-blip3');
    loadAudio(l, 'found', J + 'coins/sfx-coin-cluster3');
    loadAudio(l, 'bonus', J + 'coins/sfx-coin-double2');
    loadAudio(l, 'dup', J + 'menu-sounds/sfx-menu-move4');
    loadAudio(l, 'wrong', J + 'negative-sounds/sfx-sounds-error8');
    loadAudio(l, 'hint', J + 'high-pitched-sounds/sfx-sounds-high7');
    loadAudio(l, 'shuffle', J + 'menu-sounds/sfx-menu-select2');
    loadAudio(l, 'clear', J + 'fanfares/sfx-sounds-fanfare1');
    loadAudio(l, 'tick', J + 'simple-bleeps/sfx-sounds-blip10');
    loadAudio(l, 'timeup', J + 'negative-sounds/sfx-sounds-negative1');
  },
  menuDecor(scene) {
    // a small letter wheel that turns slowly under the menu
    const { width, height } = scene.scale;
    const cx = width / 2, cy = height * 0.84, R = 92;
    const word = loc({ tr: 'ÇEMBER', en: 'LETTER' });
    const ring = scene.add.circle(cx, cy, R + 58, 0xffffff, 0.12).setStrokeStyle(3, 0xffffff, 0.3);
    const wheel = scene.add.container(cx, cy);
    [...word].forEach((ch, i) => {
      const a = -Math.PI / 2 + (i / word.length) * Math.PI * 2;
      const disc = scene.add.circle(Math.cos(a) * R, Math.sin(a) * R, 40, i === 0 ? 0xff8a3d : 0xfff6e2);
      const label = txt(scene, disc.x, disc.y - 2, ch, { title: true, size: 40, color: i === 0 ? '#ffffff' : '#24263a', strokeThickness: 0, shadow: false });
      wheel.add([disc, label]);
      scene.tweens.add({ targets: label, angle: -360, duration: 24000, repeat: -1 });
    });
    scene.tweens.add({ targets: wheel, angle: 360, duration: 24000, repeat: -1 });
    scene.tweens.add({ targets: ring, scale: 1.04, duration: 1400, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
  },
  scenes: [PlayScene],
  strings: {
    tr: {
      bonus: 'Bonus', bonusWord: 'BONUS KELİME!', already: 'Zaten bulundu', tooShort: 'En az 3 harf',
      newHint: '+1 İPUCU', fullWord: 'TAM KELİME!', praise1: 'Harika!', praise2: 'Süper!', praise3: 'Muhteşem!',
      levelClear: 'BÖLÜM TAMAM!', timeBonus: 'Süre bonusu', timeUp: 'SÜRE BİTTİ!',
    },
    en: {
      bonus: 'Bonus', bonusWord: 'BONUS WORD!', already: 'Already found', tooShort: 'At least 3 letters',
      newHint: '+1 HINT', fullWord: 'FULL WORD!', praise1: 'Great!', praise2: 'Superb!', praise3: 'Amazing!',
      levelClear: 'LEVEL CLEAR!', timeBonus: 'Time bonus', timeUp: "TIME'S UP!",
    },
  },
});
