import { launch, loadSfx, net, type GameMeta } from '@core';
import meta from './game.json';
import { PlayScene, setPendingSync, type SyncData } from './PlayScene';
import { makeTable, makeTiles as makeTileArt, tileKey } from './art';
import { makeTiles } from './logic';

launch({
  meta: meta as GameMeta,
  background: '#0a4227',
  physics: 'none',
  preload(scene) {
    const l = scene.load;
    loadSfx(l, 'shuffle', 'sfx-casino/audio/cardshuffle');
    loadSfx(l, 'draw', 'sfx-casino/audio/cardslide3');
    loadSfx(l, 'slide', 'sfx-casino/audio/cardslide1');
    loadSfx(l, 'place', 'sfx-casino/audio/cardplace2');
    loadSfx(l, 'chips', 'sfx-casino/audio/chipscollide2');
    loadSfx(l, 'win', 'sfx-casino/audio/chipshandle1');
    loadSfx(l, 'bad', 'sfx-interface/audio/error_004');
  },
  menuDecor(scene) {
    const { width, height } = scene.scale;
    scene.add.image(0, 0, makeTable(scene, width, height)).setOrigin(0);
    scene.add.rectangle(0, 0, width, height, 0x000000, 0.28).setOrigin(0);
    makeTileArt(scene, '"Fredoka", "Nunito", sans-serif');
    // a fanned hand of tiles at the bottom, and a winning run on each side
    const tiles = makeTiles();
    const pick = (c: number, n: number) => tiles.find((t) => t.color === c && t.num === n)!;
    const fan = [pick(0, 7), pick(1, 7), pick(2, 7), pick(3, 7), tiles[104], pick(2, 10), pick(2, 11), pick(2, 12)];
    fan.forEach((tile, i) => {
      const a = (i - (fan.length - 1) / 2) * 7;
      const img = scene.add.image(width / 2 + (i - (fan.length - 1) / 2) * 52, height + 30, tileKey(tile)).setAngle(a).setOrigin(0.5, 1);
      scene.tweens.add({ targets: img, y: height - 18 - Math.abs(i - 3.5) * 4, duration: 500, delay: 60 * i, ease: 'Back.easeOut' });
    });
    [[0, 3], [3, 9]].forEach(([c, start], k) => {
      for (let i = 0; i < 3; i++) {
        const x = k === 0 ? 130 + i * 58 : width - 246 + i * 58;
        const img = scene.add.image(x, 140, tileKey(pick(c, start + i))).setScale(0.8).setAngle(k === 0 ? -6 : 6);
        scene.tweens.add({ targets: img, y: 150, duration: 1600 + i * 120, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
      }
    });
    // at a table, a player who comes back asks the host for the game so far
    if (net.isTable && !net.isHost) {
      net.onScene(scene, 'sync', (d: SyncData) => {
        if (!d || d.seat !== net.playerIndex) return;
        setPendingSync(d);
        scene.scene.start('Play');
      });
      net.send('hello', { seat: net.playerIndex });
    }
  },
  scenes: [PlayScene],
  strings: {
    tr: {
      bot0: 'Ayşe', bot1: 'Mehmet', bot2: 'Zeynep', botTag: 'BOT',
      indicator: 'Gösterge', sortRuns: 'Seri diz', sortPairs: 'Çift diz', discard: 'AT', finish: 'BİTİR',
      handOf: 'EL {n}/{m}', left: '{n} taş', pts: '{n} puan',
      yourDraw: 'Sıra sende: ortadan ya da soldaki yığından taş çek', yourDiscard: 'Bir taş seç ve at',
      canFinish: 'Elin hazır! BİTİR ile el aç', waitingFor: '{name} oynuyor…',
      pickTile: 'Önce atacağın taşı seç', cantFinish: 'Elin henüz bitmedi',
      pileOut: 'Ortada taş kalmadı: el berabere', handWon: '{name} eli kazandı!',
      normalWin: 'Seri ve perlerle', withPairs: 'Çiftle', withOkey: 'Okey atarak',
      lastTile: 'son taş', results: 'SONUÇLAR', nextHand: 'SONRAKİ EL', waitHostHand: 'Masa sahibi sonraki eli başlatacak…',
      matchWon: 'MAÇI KAZANDIN!', matchWonBy: 'Kazanan: {name}', noWinner: 'Kimse el açamadı',
    },
    en: {
      bot0: 'Ayşe', bot1: 'Mehmet', bot2: 'Zeynep', botTag: 'BOT',
      indicator: 'Indicator', sortRuns: 'Sort runs', sortPairs: 'Sort pairs', discard: 'THROW', finish: 'FINISH',
      handOf: 'HAND {n}/{m}', left: '{n} tiles', pts: '{n} pts',
      yourDraw: 'Your turn: draw from the middle or the pile on your left', yourDiscard: 'Pick a tile and throw it',
      canFinish: 'Your hand is ready! Press FINISH', waitingFor: '{name} is playing…',
      pickTile: 'Pick the tile to throw first', cantFinish: 'Your hand is not finished yet',
      pileOut: 'The middle ran out: no winner', handWon: '{name} won the hand!',
      normalWin: 'Sets and runs', withPairs: 'Seven pairs', withOkey: 'Finished with the okey',
      lastTile: 'last tile', results: 'RESULTS', nextHand: 'NEXT HAND', waitHostHand: 'The host starts the next hand…',
      matchWon: 'YOU WON THE MATCH!', matchWonBy: 'Winner: {name}', noWinner: 'Nobody finished a hand',
    },
  },
});
