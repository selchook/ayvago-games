import { launch, loadAudio, type GameMeta } from '@core';
import meta from './game.json';
import { PlayScene } from './PlayScene';
import { PALETTE, makeSymbols } from './symbols';

const J = 'oga/junkala-sfx/general-sounds/';

launch({
  meta: meta as GameMeta,
  background: '#17122b',
  physics: 'none',
  preload(scene) {
    const l = scene.load;
    loadAudio(l, 'roll', J + 'interactions/sfx-sounds-interaction5');
    loadAudio(l, 'stop', J + 'impacts/sfx-sounds-impact1');
    loadAudio(l, 'bump', J + 'negative-sounds/sfx-sounds-error3');
    loadAudio(l, 'paint', J + 'simple-bleeps/sfx-sounds-blip2');
    loadAudio(l, 'undo', J + 'menu-sounds/sfx-menu-move1');
    loadAudio(l, 'restart', J + 'interactions/sfx-sounds-interaction10');
    loadAudio(l, 'turn', J + 'menu-sounds/sfx-menu-move3');
    loadAudio(l, 'start', J + 'positive-sounds/sfx-sounds-powerup10');
    loadAudio(l, 'clear', J + 'fanfares/sfx-sounds-fanfare1');
    loadAudio(l, 'star', J + 'coins/sfx-coin-single3');
    loadAudio(l, 'tick', J + 'simple-bleeps/sfx-sounds-blip9');
    loadAudio(l, 'timeup', J + 'negative-sounds/sfx-sounds-negative2');
  },
  menuDecor(scene) {
    makeSymbols(scene);
    const { width, height } = scene.scale;
    // a small maze being painted by a rolling ball
    const cs = 38, cols = 8, rows = 3;
    const ox = width / 2 - (cols * cs) / 2, oy = height * 0.79;
    const g = scene.add.graphics();
    g.fillStyle(0x6c5fa8, 1).fillRect(ox - cs, oy - cs, (cols + 2) * cs, (rows + 2) * cs);
    g.fillStyle(0x2a2346, 1).fillRect(ox, oy, cols * cs, cs).fillRect(ox + (cols - 1) * cs, oy, cs, rows * cs)
      .fillRect(ox, oy + (rows - 1) * cs, cols * cs, cs).fillRect(ox, oy, cs, rows * cs);
    const path: [number, number][] = [];
    for (let x = 0; x < cols; x++) path.push([x, 0]);
    for (let y = 1; y < rows; y++) path.push([cols - 1, y]);
    for (let x = cols - 2; x >= 0; x--) path.push([x, rows - 1]);
    for (let y = rows - 2; y > 0; y--) path.push([0, y]);
    const tiles = path.map(([x, y]) => scene.add.rectangle(ox + x * cs + cs / 2, oy + y * cs + cs / 2, cs - 4, cs - 4, PALETTE[0]).setAlpha(0));
    const ball = scene.add.circle(ox + cs / 2, oy + cs / 2, 13, 0xffffff).setStrokeStyle(4, PALETTE[0]);
    let i = 0;
    scene.time.addEvent({
      delay: 90, loop: true, callback: () => {
        const [x, y] = path[i % path.length];
        if (i % path.length === 0) tiles.forEach((tl) => tl.setAlpha(0));
        tiles[i % path.length].setAlpha(1);
        ball.setPosition(ox + x * cs + cs / 2, oy + y * cs + cs / 2);
        i++;
      },
    });
  },
  scenes: [PlayScene],
  strings: {
    tr: {
      chooseLevel: 'BÖLÜM SEÇ', selectHint: 'Bir bölüme dokun ya da oklarla seçip Enter’a bas',
      undo: 'GERİ AL', restart: 'BAŞTAN', levels: 'BÖLÜMLER', par: 'HEDEF',
      timeUp: 'SÜRE BİTTİ!', allClear: 'HEPSİ BOYANDI!',
    },
    en: {
      chooseLevel: 'CHOOSE LEVEL', selectHint: 'Tap a level, or pick one with the arrows and press Enter',
      undo: 'UNDO', restart: 'RESTART', levels: 'LEVELS', par: 'PAR',
      timeUp: "TIME'S UP!", allClear: 'ALL PAINTED!',
    },
  },
});
