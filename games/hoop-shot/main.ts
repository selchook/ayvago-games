import { launch, loadAudio, loadSfx, type GameMeta } from '@core';
import meta from './game.json';
import { PlayScene } from './PlayScene';
import { Cam, Arena, camFor, drawHoop, drawBall, type NetState } from './view';
import { SPOTS, RIM_Y, BALL_R, v3, lerp3 } from './sim';

launch({
  meta: meta as GameMeta,
  background: '#1b1420',
  physics: 'none',
  preload(scene) {
    const l = scene.load;
    const J = 'oga/junkala-sfx/';
    loadAudio(l, 'throw', J + 'movement/jumping-and-landing/sfx-movement-jump16');
    loadSfx(l, 'rim', 'sfx-impact/audio/impactmetal_light_001');
    loadSfx(l, 'rim2', 'sfx-impact/audio/impactmetal_light_003');
    loadSfx(l, 'rim3', 'sfx-impact/audio/impactmetal_medium_002');
    loadSfx(l, 'board', 'sfx-impact/audio/impactplank_medium_001');
    loadSfx(l, 'board2', 'sfx-impact/audio/impactplank_medium_003');
    loadSfx(l, 'bounce', 'sfx-impact/audio/impactsoft_heavy_001');
    loadSfx(l, 'bounce2', 'sfx-impact/audio/impactsoft_heavy_003');
    loadAudio(l, 'net', J + 'weapons/melee/sfx-wpn-sword1');
    loadAudio(l, 'score', J + 'general-sounds/coins/sfx-coin-double2');
    loadAudio(l, 'swish', J + 'general-sounds/positive-sounds/sfx-sounds-powerup8');
    loadAudio(l, 'beater', J + 'general-sounds/fanfares/sfx-sounds-fanfare1');
    loadAudio(l, 'tick', J + 'general-sounds/high-pitched-sounds/sfx-sounds-high1');
    loadAudio(l, 'buzzer', J + 'general-sounds/alarms/alarms/sfx-alarm-loop5');
    loadAudio(l, 'levelup', J + 'general-sounds/positive-sounds/sfx-sounds-powerup2');
    loadAudio(l, 'miss', J + 'general-sounds/negative-sounds/sfx-sounds-error15');
  },
  menuDecor(scene) {
    // the arena from the top of the key, dimmed, with a ball dropping through the net on a loop
    const cam = new Cam();
    const c = camFor(SPOTS[2]);
    cam.set(c.pos, c.look);
    const bg = scene.make.graphics({}, false);
    new Arena().draw(bg, cam);
    scene.add.renderTexture(0, 0, scene.scale.width, scene.scale.height).setOrigin(0).draw(bg);
    bg.destroy();
    const gb = scene.add.graphics(), gk = scene.add.graphics(), gball = scene.add.graphics(), gf = scene.add.graphics();
    scene.add.rectangle(0, 0, scene.scale.width, scene.scale.height, 0x000000, 0.4).setOrigin(0);
    const ns: NetState = { stretch: 0, sway: 0, swayZ: 0, bulge: null, t: 0 };
    const from = v3(0, 2.2, 7.1), top = v3(0, 5.6, 3.4), to = v3(0, RIM_Y - 0.5, 0);
    scene.tweens.addCounter({
      from: 0, to: 1, duration: 2200, repeat: -1,
      onUpdate: (tw) => {
        const k = tw.getValue() ?? 0;
        ns.t += 0.016;
        const p = k < 0.8 ? quad(from, top, v3(0, RIM_Y + 0.1, 0.05), k / 0.8) : lerp3(v3(0, RIM_Y + 0.1, 0.05), to, (k - 0.8) / 0.2);
        ns.stretch = k > 0.8 ? 1 - Math.abs(k - 0.9) * 5 : Math.max(0, ns.stretch - 0.03);
        drawHoop(gb, gk, gf, cam, ns, 0);
        const pr = cam.project(p);
        gball.clear();
        if (pr) drawBall(gball, pr.x, pr.y, BALL_R * pr.s, { phase: k * 18, roll: 0, money: false }, k > 0.97 ? 0 : 1);
      },
    });
  },
  scenes: [PlayScene],
  strings: {
    tr: {
      spotLC: 'SOL KÖŞE', spotLW: 'SOL KANAT', spotTop: 'TEPE', spotRW: 'SAĞ KANAT', spotRC: 'SAĞ KÖŞE',
      round: 'TUR {n}', target: 'Hedef: {n} sayı', ptsLabel: 'SAYI', needLabel: 'HEDEF',
      moneyBall: 'PARA TOPU!', swish: 'TEMİZ!', bank: 'TAHTADAN!', streak: 'SERİ x{n}', airball: 'HAVA TOPU!',
      short: 'KISA!', long: 'UZUN!', rimOut: 'ÇEMBERDEN DÖNDÜ!', perfectRack: 'KUSURSUZ RAF!', onFire: 'ALEV ALDI!',
      qualified: 'TUR ATLADIN!', out: 'ELENDİN!', timeUp: 'SÜRE BİTTİ!', timeBonus: 'Süre bonusu +{n}',
      hintTouch: 'Basılı tut, yeşilde bırak · nişan için kaydır', hintKeys: 'Boşluk basılı tut, yeşilde bırak · ←→ nişan',
    },
    en: {
      spotLC: 'LEFT CORNER', spotLW: 'LEFT WING', spotTop: 'TOP OF THE KEY', spotRW: 'RIGHT WING', spotRC: 'RIGHT CORNER',
      round: 'ROUND {n}', target: 'Target: {n} points', ptsLabel: 'PTS', needLabel: 'NEED',
      moneyBall: 'MONEY BALL!', swish: 'SWISH!', bank: 'BANK SHOT!', streak: 'STREAK x{n}', airball: 'AIR BALL!',
      short: 'SHORT!', long: 'LONG!', rimOut: 'RIM OUT!', perfectRack: 'PERFECT RACK!', onFire: 'ON FIRE!',
      qualified: 'YOU ADVANCE!', out: 'KNOCKED OUT!', timeUp: "TIME'S UP!", timeBonus: 'Time bonus +{n}',
      hintTouch: 'Hold, release on green · slide to aim', hintKeys: 'Hold Space, release on green · ←→ to aim',
    },
  },
});

function quad(a: ReturnType<typeof v3>, b: ReturnType<typeof v3>, c: ReturnType<typeof v3>, t: number) {
  return lerp3(lerp3(a, b, t), lerp3(b, c, t), t);
}
