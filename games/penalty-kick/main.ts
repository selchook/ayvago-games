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
    // a small goal above the title: your character dives for a curling shot
    const { width } = scene.scale;
    makeBall(scene);
    const g = scene.add.graphics();
    const cx = width / 2, gw = 380, gh = 132, gt = 56, gb = gt + gh;
    const glow = scene.add.ellipse(cx, gb + 6, gw + 120, 34, 0x2f9a3e, 0.35);
    glow.setDepth(-1);
    g.fillStyle(0x0b1324, 0.45).fillRect(cx - gw / 2, gt, gw, gh);
    g.lineStyle(1.5, 0xffffff, 0.28);
    for (let x = cx - gw / 2 + 19; x < cx + gw / 2; x += 19) g.lineBetween(x, gt, x, gb);
    for (let y = gt + 19; y < gb; y += 19) g.lineBetween(cx - gw / 2, y, cx + gw / 2, y);
    g.fillStyle(0xd9dde6).fillRoundedRect(cx - gw / 2 - 10, gt - 10, 10, gh + 12, 4).fillRoundedRect(cx + gw / 2, gt - 10, 10, gh + 12, 4)
      .fillRoundedRect(cx - gw / 2 - 10, gt - 10, gw + 20, 10, 4);
    g.lineStyle(3, 0xffffff, 0.7).lineBetween(cx - gw / 2 - 70, gb + 2, cx + gw / 2 + 70, gb + 2);
    const keeper = scene.add.image(cx, gb + 2, 'me-cheer2').setOrigin(0.5, CHARACTER_FRAME.originY).setScale(0.78);
    const ball = scene.add.image(cx - 160, gb + 40, 'pk-ball').setScale(0.5);
    const loop = () => {
      keeper.setTexture('me-cheer2').setPosition(cx, gb + 2).setAngle(0).setFlipX(false);
      ball.setPosition(cx - 40, gb + 70).setScale(0.55).setAlpha(1);
      const right = Math.random() < 0.5;
      const tx = cx + (right ? 1 : -1) * 140, ty = gt + 30;
      scene.tweens.add({ targets: ball, x: tx, y: ty, scale: 0.36, angle: 720, duration: 650, delay: 500, ease: 'Sine.easeOut' });
      scene.tweens.add({
        targets: keeper, x: cx + (right ? 70 : -70), y: gb - 26, angle: right ? 55 : -55, duration: 420, delay: 640, ease: 'Quad.easeOut',
        onStart: () => keeper.setTexture('me-hang').setFlipX(!right),
      });
      scene.tweens.add({ targets: ball, alpha: 0, delay: 1500, duration: 300 });
      scene.time.delayedCall(2200, loop);
    };
    loop();
  },
  scenes: [PlayScene],
  strings: {
    tr: {
      you: 'SEN', them: 'RAKİP', shoot: 'ŞUTUNU ÇEK!', keep: 'KALEYİ KORU!', goal: 'GOL!', saved: 'KURTARDI!', bigSave: 'KURTARIŞ!',
      wide: 'AUT!', post: 'DİREK!', over: 'ÜSTTEN AUT!', matchWin: 'MAÇI KAZANDIN!', sudden: 'ANİ ÖLÜM', champion: 'ŞAMPİYON!',
      out: 'ELENDİN!', m1: 'ÇEYREK FİNAL', m2: 'YARI FİNAL', m3: 'FİNAL', curl: 'FALSO', corner: 'DOKSAN!',
      kickN: 'PENALTI', pickDive: 'ATLAYACAĞIN YERİ SEÇ!', waitPeer: 'RAKİP BEKLENİYOR…',
      hintShoot: 'Ekranın her yerinden kaleye doğru kaydır · kaleye dokun', hintKeep: 'Atlamak için dokun ya da kaydır',
      hintShootKeys: 'Kaleye doğru sürükle · oklar nişan, X falso, Boşluk şut', hintKeepKeys: 'Atlamak için tıkla ya da okları kullan',
    },
    en: {
      you: 'YOU', them: 'THEM', shoot: 'TAKE YOUR SHOT!', keep: 'SAVE IT!', goal: 'GOAL!', saved: 'SAVED!', bigSave: 'GREAT SAVE!',
      wide: 'WIDE!', post: 'POST!', over: 'OVER THE BAR!', matchWin: 'MATCH WON!', sudden: 'SUDDEN DEATH', champion: 'CHAMPIONS!',
      out: 'KNOCKED OUT!', m1: 'QUARTER-FINAL', m2: 'SEMI-FINAL', m3: 'FINAL', curl: 'CURL', corner: 'TOP CORNER!',
      kickN: 'KICK', pickDive: 'PICK YOUR DIVE!', waitPeer: 'WAITING FOR OPPONENT…',
      hintShoot: 'Swipe toward the goal from anywhere · or tap the goal', hintKeep: 'Tap or swipe to dive',
      hintShootKeys: 'Drag toward the goal · arrows aim, X curl, Space shoots', hintKeepKeys: 'Click or use the arrows to dive',
    },
  },
});
