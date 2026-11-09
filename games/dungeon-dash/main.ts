import { launch, loadAudio, loadCharacter, kenney, CHARACTER_FRAME, Phaser, type GameMeta } from '@core';
import meta from './game.json';
import { PlayScene, HERO_POSES, HERO_SCALE } from './PlayScene';
import { warmText } from './fasttext';

const J = 'oga/junkala-sfx/';
const BG = [34, 35, 35];       // the pack's opaque background colour

/**
 * 'mrk': the micro-roguelike sheet with its dark background made transparent, for everything that
 * stands on the floor (monsters, items, icons), so they show the floor around them and a hit
 * flash lights up the creature, not a square.
 */
function keyedSheet(scene: Phaser.Scene): void {
  if (scene.textures.exists('mrk')) return;
  const src = scene.textures.get('mr').getSourceImage() as HTMLImageElement;
  const canvas = document.createElement('canvas');
  canvas.width = src.width; canvas.height = src.height;
  const ctx = canvas.getContext('2d')!;
  ctx.drawImage(src, 0, 0);
  const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) if (d[i] === BG[0] && d[i + 1] === BG[1] && d[i + 2] === BG[2]) d[i + 3] = 0;
  ctx.putImageData(img, 0, 0);
  const tex = scene.textures.addCanvas('mrk', canvas);
  if (!tex) return;
  const cols = canvas.width / 8;
  for (let f = 0; f < cols * (canvas.height / 8); f++) tex.add(f, 0, (f % cols) * 8, Math.floor(f / cols) * 8, 8, 8);
}

launch({
  meta: meta as GameMeta,
  difficulty: true,
  music: { play: 'stage1' },
  background: '#141018',
  pixelArt: true,
  physics: 'none',
  preload(scene) {
    const l = scene.load;
    l.spritesheet('mr', kenney('micro-roguelike/tilemap/colored_tilemap_packed.png'), { frameWidth: 8, frameHeight: 8 });
    // The hero is the player's own character, posed by the way it walks. The dungeon is pixel art
    // (nearest sampling); the characters are smooth vector art scaled down, so they keep linear filtering.
    loadCharacter(l, { poses: HERO_POSES });
    l.once('complete', () => {
      for (const pose of HERO_POSES) scene.textures.get(`pc-${pose}`).setFilter(Phaser.Textures.FilterMode.LINEAR);
      keyedSheet(scene);
    });
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
    // your character faces the dungeon's creatures, three on each side
    const y = height * 0.86;
    [10, 22, 12, 21, 9, 23].forEach((f, i) => {
      const x = width * (i < 3 ? 0.1 + i * 0.12 : 0.66 + (i - 3) * 0.12);
      const m = scene.add.image(x, y, 'mrk', f).setScale(8).setFlipX(i < 3);
      scene.tweens.add({ targets: m, y: y - 6, duration: 420 + i * 37, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    });
    const hero = scene.add.image(width / 2, y + 34, 'pc-front').setOrigin(0.5, CHARACTER_FRAME.originY).setScale(HERO_SCALE * 1.25);
    scene.time.addEvent({ delay: 650, loop: true, callback: () => hero.setTexture(hero.texture.key === 'pc-front' ? 'pc-cheer1' : 'pc-front') });
    scene.add.image(width * 0.12, height * 0.08, 'mrk', 120).setScale(8);
    scene.add.image(width * 0.88, height * 0.08, 'mrk', 120).setScale(8).setFlipX(true);
  },
  scenes: [PlayScene],
  strings: {
    tr: { floor: 'KAT', wait: 'BEKLE', potion: 'İKSİR', atk: 'SALDIRI', armor: 'ZIRH', maxhp: 'MAKS. CAN', heal: 'CAN', boss: 'KAT BEKÇİSİ!', down: 'MERDİVEN AÇILDI!', full: 'Çanta dolu', locked: 'Önce kat bekçisini yen!', trap: 'TUZAK!', levelUp: 'SEVİYE {n}! GÜÇLENDİN', lv: 'SV' },
    en: { floor: 'FLOOR', wait: 'WAIT', potion: 'POTION', atk: 'ATTACK', armor: 'ARMOR', maxhp: 'MAX HP', heal: 'HP', boss: 'FLOOR GUARDIAN!', down: 'STAIRS OPEN!', full: 'Bag full', locked: 'Defeat the guardian first!', trap: 'TRAP!', levelUp: 'LEVEL {n}! STRONGER', lv: 'LV' },
  },
});
