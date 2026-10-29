import { launch, loadAudio, kenney, type GameMeta } from '@core';
import meta from './game.json';
import { PlayScene } from './PlayScene';
import { warmText } from './fasttext';

const J = 'oga/junkala-sfx/';

launch({
  meta: meta as GameMeta,
  music: { play: 'stage1' },
  background: '#141018',
  pixelArt: true,
  physics: 'none',
  preload(scene) {
    const l = scene.load;
    l.spritesheet('mr', kenney('micro-roguelike/tilemap/colored_tilemap_packed.png'), { frameWidth: 8, frameHeight: 8 });
    loadAudio(l, 'step1', J + 'movement/footsteps/sfx-movement-footsteps1a');
    loadAudio(l, 'step2', J + 'movement/footsteps/sfx-movement-footsteps1b');
    loadAudio(l, 'wait', J + 'movement/footsteps/sfx-movement-footsteps5');
    loadAudio(l, 'bump', J + 'general-sounds/impacts/sfx-sounds-impact1');
    loadAudio(l, 'nope', J + 'general-sounds/negative-sounds/sfx-sounds-error2');
    loadAudio(l, 'locked', J + 'general-sounds/negative-sounds/sfx-sounds-error5');
    loadAudio(l, 'slash1', J + 'weapons/melee/sfx-wpn-sword1');
    loadAudio(l, 'slash2', J + 'weapons/melee/sfx-wpn-sword2');
    loadAudio(l, 'slash3', J + 'weapons/melee/sfx-wpn-sword3');
    loadAudio(l, 'crit', J + 'general-sounds/simple-damage-sounds/sfx-damage-hit10');
    loadAudio(l, 'punch1', J + 'weapons/melee/sfx-wpn-punch1');
    loadAudio(l, 'punch2', J + 'weapons/melee/sfx-wpn-punch2');
    loadAudio(l, 'punch3', J + 'weapons/melee/sfx-wpn-punch3');
    loadAudio(l, 'hurt', J + 'general-sounds/negative-sounds/sfx-sounds-damage1');
    loadAudio(l, 'low', J + 'general-sounds/alarms/low-health-alarms/sfx-lowhealth-alarmloop3');
    loadAudio(l, 'death', J + 'death-screams/human/sfx-deathscream-human3');
    loadAudio(l, 'kill1', J + 'death-screams/alien/sfx-deathscream-alien2');
    loadAudio(l, 'kill2', J + 'death-screams/alien/sfx-deathscream-alien4');
    loadAudio(l, 'bossdown', J + 'explosions/double/sfx-exp-double2');
    loadAudio(l, 'boss', J + 'general-sounds/negative-sounds/sfx-sounds-negative1');
    loadAudio(l, 'trap', J + 'explosions/shortest/sfx-exp-shortest-soft9');
    loadAudio(l, 'coin', J + 'general-sounds/coins/sfx-coin-double3');
    loadAudio(l, 'item', J + 'general-sounds/positive-sounds/sfx-sounds-powerup17');
    loadAudio(l, 'potion', J + 'general-sounds/positive-sounds/sfx-sounds-powerup14');
    loadAudio(l, 'heart', J + 'general-sounds/positive-sounds/sfx-sounds-powerup3');
    loadAudio(l, 'chest', J + 'movement/opening-doors/sfx-movement-dooropen2');
    loadAudio(l, 'loot', J + 'general-sounds/fanfares/sfx-sounds-fanfare3');
    loadAudio(l, 'levelup', J + 'general-sounds/positive-sounds/sfx-sounds-powerup7');
    loadAudio(l, 'stairs', J + 'movement/portals-and-transitions/sfx-movement-portal1');
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
