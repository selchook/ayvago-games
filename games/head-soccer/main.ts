import { launch, kenney, loadAudio, loadSfx, loadCharacter, playerCharacter, peerCharacter, CHARACTER_FRAME, type GameMeta } from '@core';
import meta from './game.json';
import { PlayScene, POSES } from './PlayScene';
import { makeTextures, drawPitch, drawNets } from './art';
import { GROUND } from './sim';

const J = 'oga/junkala-sfx/';

launch({
  meta: meta as GameMeta,
  background: '#0b1030',
  physics: 'none',
  preload(scene) {
    const l = scene.load;
    // you: your platform character; the rival: the online opponent's, or another one in solo
    loadCharacter(l, { id: playerCharacter(), prefix: 'p1', poses: POSES });
    loadCharacter(l, { id: peerCharacter(), prefix: 'p2', poses: POSES });
    loadSfx(l, 'kick', 'sfx-impact/audio/impactpunch_medium_000');
    loadSfx(l, 'head', 'sfx-impact/audio/impactsoft_heavy_002');
    loadSfx(l, 'bounce', 'sfx-impact/audio/impactsoft_medium_002');
    loadSfx(l, 'post', 'sfx-impact/audio/impactbell_heavy_001');
    loadAudio(l, 'swing', J + 'general-sounds/menu-sounds/sfx-menu-move3');
    loadAudio(l, 'jump', J + 'movement/jumping-and-landing/sfx-movement-jump1');
    loadAudio(l, 'whistle', J + 'general-sounds/weird-sounds/sfx-sound-refereewhistle');
    loadAudio(l, 'goal', J + 'general-sounds/positive-sounds/sfx-sounds-powerup4');
    loadAudio(l, 'concede', J + 'general-sounds/negative-sounds/sfx-sounds-negative2');
    loadAudio(l, 'tick', J + 'general-sounds/simple-bleeps/sfx-sounds-blip10');
    loadAudio(l, 'win', J + 'general-sounds/fanfares/sfx-sounds-fanfare1');
    loadAudio(l, 'lose', J + 'general-sounds/negative-sounds/sfx-sounds-negative1');
  },
  menuDecor(scene) {
    makeTextures(scene);
    drawPitch(scene);
    drawNets(scene, 1);
    scene.add.rectangle(0, 0, scene.scale.width, scene.scale.height, 0x000000, 0.45).setOrigin(0);
    const you = scene.add.image(150, GROUND, 'p1-walk1').setOrigin(0.5, CHARACTER_FRAME.originY);
    const rival = scene.add.image(1130, GROUND, 'p2-stand').setOrigin(0.5, CHARACTER_FRAME.originY).setFlipX(true);
    const ball = scene.add.image(640, GROUND - 26, 'hs-ball');
    scene.tweens.add({ targets: ball, y: GROUND - 230, duration: 600, yoyo: true, repeat: -1, ease: 'Quad.easeOut' });
    scene.tweens.add({ targets: ball, angle: 360, duration: 1200, repeat: -1 });
    let f = 0;
    scene.time.addEvent({ delay: 160, loop: true, callback: () => { f++; you.setTexture(f % 2 ? 'p1-walk2' : 'p1-walk1'); rival.setTexture(f % 6 < 3 ? 'p2-stand' : 'p2-jump'); } });
  },
  scenes: [PlayScene],
  strings: {
    tr: {
      matchN: 'MAÇ {n}', matchIntro: 'Rakip: {name}', kickoff: 'BAŞLAMA VURUŞU', goalBanner: 'GOL!', goalYou: 'Harika vuruş!', goalThem: 'Gol yedin!',
      golden: 'ALTIN GOL!', goldenSub: 'İlk gol maçı kazanır', goldenShort: 'ALTIN GOL', matchWin: 'MAÇI KAZANDIN!', matchLose: 'MAÇI KAYBETTİN',
      nextRival: 'Sıradaki rakip daha güçlü!',
      d0: 'Amatör', d1: 'Yarı Pro', d2: 'Profesyonel', d3: 'Yıldız', d4: 'Süper Yıldız', d5: 'Efsane',
    },
    en: {
      matchN: 'MATCH {n}', matchIntro: 'Rival: {name}', kickoff: 'KICK-OFF', goalBanner: 'GOAL!', goalYou: 'What a strike!', goalThem: 'You conceded!',
      golden: 'GOLDEN GOAL!', goldenSub: 'Next goal wins', goldenShort: 'GOLDEN', matchWin: 'MATCH WON!', matchLose: 'MATCH LOST',
      nextRival: 'The next rival is tougher!',
      d0: 'Amateur', d1: 'Semi-Pro', d2: 'Pro', d3: 'Star', d4: 'Superstar', d5: 'Legend',
    },
  },
});
