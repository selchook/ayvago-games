import { launch, kenney, loadAudio, loadCharacter, peerCharacter, CHARACTER_FRAME, type GameMeta } from '@core';
import meta from './game.json';
import { PlayScene, CREW_POSES } from './PlayScene';
import { makeArt, BODY } from './art';

const J = 'oga/junkala-sfx/';

launch({
  meta: meta as GameMeta,
  background: '#0d1b33',
  physics: 'none',
  music: { play: 'stage2' },
  preload(scene) {
    const l = scene.load;
    l.image('tt-dirt', kenney('tanks/png/environment/dirt.png'));
    for (const k of ['smokewhite', 'smokegrey', 'smokeorange']) for (let i = 0; i < 6; i++) l.image(`${k}${i}`, kenney(`tanks/png/smoke/${k}${i}.png`));
    // the commanders standing in the hatches: you, and the computer or your online opponent
    loadCharacter(l, { prefix: 'pc', poses: CREW_POSES });
    loadCharacter(l, { id: peerCharacter(), prefix: 'op', poses: CREW_POSES });
    // the real cannon shot (the same one Sea Battle fires)
    loadAudio(l, 'cannon', J + 'weapons/cannon/sfx-wpn-cannon2');
    loadAudio(l, 'boom1', J + 'explosions/medium-length/sfx-exp-medium1');
    loadAudio(l, 'boom2', J + 'explosions/medium-length/sfx-exp-medium3');
    loadAudio(l, 'boom3', J + 'explosions/medium-length/sfx-exp-medium6');
    loadAudio(l, 'bigboom', J + 'explosions/double/sfx-exp-double2');
    loadAudio(l, 'whistle', J + 'weapons/grenade-whistles/sfx-wpn-grenadewhistle1');
    loadAudio(l, 'engine', J + 'movement/vehicles/sfx-vehicle-engineloop');
    loadAudio(l, 'charge', J + 'general-sounds/positive-sounds/sfx-sounds-powerup10');
    loadAudio(l, 'tick', J + 'general-sounds/simple-bleeps/sfx-sounds-blip10');
    loadAudio(l, 'turn', J + 'general-sounds/neutral-sounds/sfx-sound-neutral1');
    loadAudio(l, 'round', J + 'general-sounds/high-pitched-sounds/sfx-sounds-high3');
    loadAudio(l, 'wide', J + 'movement/falling-sounds/sfx-sounds-falling3');
    loadAudio(l, 'crack', J + 'general-sounds/impacts/sfx-sounds-impact5');
    loadAudio(l, 'clank', J + 'general-sounds/impacts/sfx-sounds-impact12');
    loadAudio(l, 'roundwin', J + 'general-sounds/fanfares/sfx-sounds-fanfare1');
    loadAudio(l, 'victory', J + 'general-sounds/fanfares/sfx-sounds-fanfare3');
    loadAudio(l, 'roundlose', J + 'general-sounds/negative-sounds/sfx-sounds-negative1');
  },
  menuDecor(scene) {
    // two tanks on the hills at the bottom corners, trading shots
    makeArt(scene);
    const { width, height } = scene.scale;
    const g = scene.add.graphics();
    g.fillStyle(0x24803a, 1).beginPath().moveTo(0, height);
    for (let x = 0; x <= width; x += 20) g.lineTo(x, height - 52 - Math.sin(x / 140) * 10);
    g.lineTo(width, height).closePath().fillPath();
    const tanks = [0, 1].map((seat) => {
      const x = seat === 0 ? 250 : width - 250, y = height - 62;
      const barrel = scene.add.image(x, y - (BODY.groundY - BODY.pivotY), 'tt-barrel').setOrigin(0.06, 0.5).setRotation(seat === 0 ? -0.75 : -(Math.PI - 0.75));
      const crew = scene.add.image(x, y - (BODY.groundY - 14) - 100 * 0.34, `${seat === 0 ? 'pc' : 'op'}-stand`).setOrigin(0.5, 0).setScale(0.34).setFlipX(seat === 1);
      crew.setCrop(0, 0, CHARACTER_FRAME.width, 100);
      scene.add.image(x, y, `tt-tank${seat}`).setOrigin(0.5, BODY.groundY / BODY.h);
      return { x, y, barrel, crew };
    });
    let turn = 0;
    const shoot = () => {
      const a = tanks[turn], b = tanks[1 - turn];
      const sx = a.x + (turn === 0 ? 40 : -40), sy = a.y - 75;
      const shell = scene.add.image(sx, sy, 'tt-shell');
      const flash = scene.add.image(sx, sy, 'tt-glow').setTint(0xffd27a).setScale(0.7);
      scene.tweens.add({ targets: flash, alpha: 0, scale: 0.2, duration: 160, onComplete: () => flash.destroy() });
      const peak = height - 330;
      scene.tweens.addCounter({
        from: 0, to: 1, duration: 1500, ease: 'Linear',
        onUpdate: (tw) => {
          const k = tw.getValue() ?? 0;
          const x = sx + (b.x - sx) * k;
          const y = (1 - k) * (1 - k) * sy + 2 * (1 - k) * k * peak + k * k * (b.y - 20);
          shell.setRotation(Math.atan2(y - shell.y, x - shell.x)).setPosition(x, y);
        },
        onComplete: () => {
          shell.destroy();
          const boom = scene.add.image(b.x + (turn === 0 ? -60 : 60), b.y - 30, `smokeorange${Math.floor(Math.random() * 6)}`).setScale(0.3);
          scene.tweens.add({ targets: boom, scale: 0.9, alpha: 0, duration: 600, onComplete: () => boom.destroy() });
          turn = 1 - turn;
        },
      });
    };
    scene.time.addEvent({ delay: 2100, loop: true, callback: shoot });
    scene.time.delayedCall(600, shoot);
  },
  scenes: [PlayScene],
  strings: {
    tr: {
      fire: 'ATEŞ', round: 'TUR {n}', cpu: 'BOT', cpuTurn: 'BOT NİŞAN ALIYOR…', wind: 'RÜZGÂR',
      roundWon: 'TURU KAZANDIN!', roundLost: 'TURU KAYBETTİN', champion: 'ŞAMPİYON!', defeat: 'YENİLDİN!',
      direct: 'TAM İSABET!', oneShot: 'TEK ATIŞ!', close: 'KIL PAYI!', selfHit: 'KENDİNİ VURDUN!', destroyed: 'YOK EDİLDİ!',
      misses: 'ISKA!|VIIIN!|HAYIR!|PUF!|BOŞA GİTTİ!',
      hintTouch: 'Nişan için sürükle · tankını sürükleyerek kaydır · ATEŞ’e basılı tut, bırak',
      hintKeys: '↑↓ nişan · ←→ hareket · Boşluk’a basılı tut, bırak',
    },
    en: {
      fire: 'FIRE', round: 'ROUND {n}', cpu: 'CPU', cpuTurn: 'CPU IS AIMING…', wind: 'WIND',
      roundWon: 'ROUND WON!', roundLost: 'ROUND LOST', champion: 'CHAMPION!', defeat: 'DEFEATED!',
      direct: 'DIRECT HIT!', oneShot: 'ONE SHOT!', close: 'SO CLOSE!', selfHit: 'SELF-DESTRUCT!', destroyed: 'DESTROYED!',
      misses: 'MISS!|WHOOSH!|NOPE!|POOF!|WIDE!',
      hintTouch: 'Drag to aim · drag your tank to drive · hold FIRE, let go to shoot',
      hintKeys: '↑↓ aim · ←→ drive · hold Space, let go to shoot',
    },
  },
});
