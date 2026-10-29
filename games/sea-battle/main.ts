import { launch, kenney, loadAudio, type GameMeta } from '@core';
import meta from './game.json';
import { PlayScene } from './PlayScene';

launch({
  meta: meta as GameMeta,
  background: '#06172e',
  physics: 'none',
  preload(scene) {
    const l = scene.load;
    const P = 'particles/png_transparent/';
    l.image('fire', kenney(P + 'fire_01.png'));
    l.image('smoke', kenney(P + 'smoke_04.png'));
    l.image('glow', kenney(P + 'circle_05.png'));
    const J = 'oga/junkala-sfx/';
    loadAudio(l, 'fire', J + 'weapons/cannon/sfx-wpn-cannon2');
    loadAudio(l, 'incoming', J + 'weapons/grenade-whistles/sfx-wpn-missilelaunch');
    loadAudio(l, 'hit', J + 'explosions/short/sfx-exp-short-hard4');
    loadAudio(l, 'sink', J + 'explosions/long/sfx-exp-long2');
    loadAudio(l, 'miss', J + 'movement/falling-sounds/sfx-sounds-falling11');
    loadAudio(l, 'move', J + 'general-sounds/menu-sounds/sfx-menu-move2');
    loadAudio(l, 'pick', J + 'general-sounds/menu-sounds/sfx-menu-select1');
    loadAudio(l, 'drop', J + 'general-sounds/interactions/sfx-sounds-interaction5');
    loadAudio(l, 'rotate', J + 'general-sounds/menu-sounds/sfx-menu-move4');
    loadAudio(l, 'auto', J + 'movement/portals-and-transitions/sfx-movement-portal2');
    loadAudio(l, 'ready', J + 'general-sounds/positive-sounds/sfx-sounds-powerup5');
    loadAudio(l, 'horn', J + 'general-sounds/alarms/alarms/sfx-alarm-loop6');
    loadAudio(l, 'tick', J + 'general-sounds/simple-bleeps/sfx-sounds-blip10');
    loadAudio(l, 'turn', J + 'general-sounds/simple-bleeps/sfx-sounds-blip7');
    loadAudio(l, 'error', J + 'general-sounds/negative-sounds/sfx-sounds-error3');
    loadAudio(l, 'win', J + 'general-sounds/fanfares/sfx-sounds-fanfare3');
    loadAudio(l, 'lose', J + 'general-sounds/negative-sounds/sfx-sounds-negative2');
  },
  menuDecor(scene) {
    const { width, height } = scene.scale;
    const g = scene.add.graphics();
    const y0 = height * 0.87;
    g.fillStyle(0x0f4a8a).fillRoundedRect(width / 2 - 200, y0 - 60, 400, 120, 12);
    g.lineStyle(1, 0x5fa8ff, 0.4);
    for (let k = 0; k <= 10; k++) g.lineBetween(width / 2 - 200 + k * 40, y0 - 60, width / 2 - 200 + k * 40, y0 + 60);
    for (let k = 0; k <= 3; k++) g.lineBetween(width / 2 - 200, y0 - 60 + k * 40, width / 2 + 200, y0 - 60 + k * 40);
    g.fillStyle(0x8d98a8).fillRoundedRect(width / 2 - 150, y0 - 52, 152, 24, 10);
    g.fillStyle(0x8d98a8).fillRoundedRect(width / 2 + 52, y0 - 12, 104, 24, 10);
    const peg = scene.add.circle(width / 2 + 100, y0 + 40, 12, 0xec3013);
    scene.tweens.add({ targets: peg, scale: 1.4, duration: 400, yoyo: true, repeat: -1 });
    scene.add.circle(width / 2 - 100, y0 + 40, 8, 0xe8f4ff);
  },
  scenes: [PlayScene],
  strings: {
    tr: {
      placeTitle: 'FİLONU YERLEŞTİR', rotate: 'ÇEVİR', auto: 'OTOMATİK', ready: 'HAZIR',
      placeTouch: 'Gemiyi sürükle · Döndürmek için gemiye dokun', placeKeys: 'Oklar: taşı · R: çevir · Shift: sıradaki gemi · X: otomatik · Boşluk: hazır',
      waitingFleet: 'RAKİP FİLOSUNU DİZİYOR…', rivalReady: 'Rakip hazır!', timeLeft: 'Süre: {n}', battle: 'SAVAŞ!',
      yourTurn: 'ATEŞ ET!', again: 'İSABET! BİR DAHA', aiTurn: 'RAKİP NİŞAN ALIYOR', cpu: 'RAKİP',
      yourFleet: 'FİLON', enemyFleet: 'DÜŞMAN FİLOSU', sunk: 'BATIRDIN!', lostShip: 'Gemin battı!',
      ship0: 'Uçak Gemisi', ship1: 'Zırhlı', ship2: 'Kruvazör', ship3: 'Denizaltı', ship4: 'Muhrip',
      victory: 'ZAFER!', defeat: 'FİLON BATTI', accuracy: 'İsabet: %{n}',
      rival: 'Rakip: {name}', streak: 'Seri: {n}',
      d0: 'Acemi Er', d1: 'Tayfa', d2: 'Kaptan', d3: 'Komodor', d4: 'Amiral',
    },
    en: {
      placeTitle: 'DEPLOY YOUR FLEET', rotate: 'ROTATE', auto: 'AUTO', ready: 'READY',
      placeTouch: 'Drag a ship · Tap a ship to rotate it', placeKeys: 'Arrows: move · R: rotate · Shift: next ship · X: auto · Space: ready',
      waitingFleet: 'RIVAL IS DEPLOYING…', rivalReady: 'Rival is ready!', timeLeft: 'Time: {n}', battle: 'BATTLE!',
      yourTurn: 'FIRE!', again: 'HIT! FIRE AGAIN', aiTurn: 'RIVAL TAKING AIM', cpu: 'CPU',
      yourFleet: 'YOUR FLEET', enemyFleet: 'ENEMY FLEET', sunk: 'SUNK!', lostShip: 'Ship lost!',
      ship0: 'Carrier', ship1: 'Battleship', ship2: 'Cruiser', ship3: 'Submarine', ship4: 'Destroyer',
      victory: 'VICTORY!', defeat: 'FLEET SUNK', accuracy: 'Accuracy: {n}%',
      rival: 'Rival: {name}', streak: 'Streak: {n}',
      d0: 'Cadet', d1: 'Sailor', d2: 'Captain', d3: 'Commodore', d4: 'Admiral',
    },
  },
});
