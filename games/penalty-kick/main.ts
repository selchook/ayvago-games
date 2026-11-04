import { launch, loadAudio, loadSfx, loadCharacter, playerCharacter, peerCharacter, CHARACTER_FRAME, type GameMeta } from '@core';
import meta from './game.json';
import { PlayScene, POSES, makeBall } from './PlayScene';

launch({
  meta: meta as GameMeta,
  background: '#0f1a2e',
  physics: 'none',
  preload(scene) {
    const l = scene.load;
    // the kicker and the keeper are the players' own characters: yours, and the online
    // opponent's (or the first rival in solo; later rivals load on demand)
    loadCharacter(l, { id: playerCharacter(), prefix: 'me', poses: POSES });
    loadCharacter(l, { id: peerCharacter(), prefix: 'op', poses: POSES });
    loadSfx(l, 'kick', 'sfx-impact/audio/impactpunch_medium_000');
    const J = 'oga/junkala-sfx/general-sounds/';
    loadAudio(l, 'goal', J + 'positive-sounds/sfx-sounds-powerup4');
    loadSfx(l, 'net', 'sfx-impact/audio/impactsoft_medium_002');
    loadSfx(l, 'save', 'sfx-impact/audio/impactsoft_heavy_002');
    loadSfx(l, 'post', 'sfx-impact/audio/impactmetal_heavy_001');
    loadAudio(l, 'whistle', J + 'high-pitched-sounds/sfx-sounds-high3');
    loadAudio(l, 'boo', J + 'negative-sounds/sfx-sounds-error11');
    loadAudio(l, 'curl', J + 'menu-sounds/sfx-menu-move2');
    loadAudio(l, 'clock', J + 'simple-bleeps/sfx-sounds-blip10');
    loadAudio(l, 'wide', 'oga/junkala-sfx/movement/falling-sounds/sfx-sounds-falling3');
    loadAudio(l, 'lose', J + 'negative-sounds/sfx-sounds-negative1');
    loadAudio(l, 'dive', 'oga/junkala-sfx/movement/jumping-and-landing/sfx-movement-jump9');
    loadSfx(l, 'step', 'sfx-impact/audio/footstep_grass_001');
  },
  menuDecor(scene) {
    const { width, height } = scene.scale;
    makeBall(scene);
    const g = scene.add.graphics();
    const gy = height * 0.8, gw = 420, gh = 170;
    g.fillStyle(0x000000, 0.3).fillRect(width / 2 - gw / 2, gy, gw, gh);
    g.lineStyle(2, 0xffffff, 0.3);
    for (let x = width / 2 - gw / 2 + 20; x < width / 2 + gw / 2; x += 22) g.lineBetween(x, gy, x, gy + gh);
    for (let y = gy + 20; y < gy + gh; y += 22) g.lineBetween(width / 2 - gw / 2, y, width / 2 + gw / 2, y);
    g.lineStyle(10, 0xffffff).strokeRect(width / 2 - gw / 2, gy, gw, gh + 40);
    // your character in goal, ready
    const keeper = scene.add.image(width / 2 + 40, gy + gh + 4, 'me-cheer2').setOrigin(0.5, CHARACTER_FRAME.originY).setScale(0.95);
    const ball = scene.add.image(width / 2 - 150, gy + gh - 10, 'pk-ball').setScale(0.6);
    scene.tweens.add({ targets: ball, x: width / 2 + 150, y: gy + 40, scale: 0.42, angle: 540, duration: 900, yoyo: true, repeat: -1, repeatDelay: 300, ease: 'Sine.easeInOut' });
    scene.tweens.add({
      targets: keeper, x: width / 2 + 110, angle: 50, duration: 900, yoyo: true, repeat: -1, repeatDelay: 300, ease: 'Sine.easeInOut',
      onStart: () => keeper.setTexture('me-hang'),
      onYoyo: () => keeper.setTexture('me-cheer2'),
      onRepeat: () => keeper.setTexture('me-hang'),
    });
  },
  scenes: [PlayScene],
  strings: {
    tr: {
      you: 'SEN', them: 'RAKİP', shoot: 'ŞUTUNU ÇEK!', keep: 'KALEYİ KORU!', goal: 'GOL!', saved: 'KURTARDI!', bigSave: 'KURTARIŞ!',
      wide: 'AUT!', post: 'DİREK!', over: 'ÜSTTEN AUT!', matchWin: 'MAÇI KAZANDIN!', sudden: 'ANİ ÖLÜM', champion: 'ŞAMPİYON!',
      out: 'ELENDİN!', m1: 'ÇEYREK FİNAL', m2: 'YARI FİNAL', m3: 'FİNAL', curl: 'FALSO', corner: 'DOKSAN!',
      kickN: 'PENALTI', pickDive: 'ATLAYACAĞIN YERİ SEÇ!', waitPeer: 'RAKİP BEKLENİYOR…',
      hintShoot: 'Ekranın her yerinden kaleye doğru kaydır · kaleye dokun', hintKeep: 'Atlamak için dokun ya da kaydır',
      hintShootKeys: 'Oklar nişan · X falso · Boşluk şut', hintKeepKeys: 'Oklar ile atla',
    },
    en: {
      you: 'YOU', them: 'THEM', shoot: 'TAKE YOUR SHOT!', keep: 'SAVE IT!', goal: 'GOAL!', saved: 'SAVED!', bigSave: 'GREAT SAVE!',
      wide: 'WIDE!', post: 'POST!', over: 'OVER THE BAR!', matchWin: 'MATCH WON!', sudden: 'SUDDEN DEATH', champion: 'CHAMPIONS!',
      out: 'KNOCKED OUT!', m1: 'QUARTER-FINAL', m2: 'SEMI-FINAL', m3: 'FINAL', curl: 'CURL', corner: 'TOP CORNER!',
      kickN: 'KICK', pickDive: 'PICK YOUR DIVE!', waitPeer: 'WAITING FOR OPPONENT…',
      hintShoot: 'Swipe toward the goal from anywhere · or tap the goal', hintKeep: 'Tap or swipe to dive',
      hintShootKeys: 'Arrows aim · X curl · Space shoots', hintKeepKeys: 'Arrows to dive',
    },
  },
});
