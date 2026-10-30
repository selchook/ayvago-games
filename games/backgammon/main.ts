import { launch, kenney, loadAudio, loadSfx, rng, type GameMeta } from '@core';
import meta from './game.json';
import { PlayScene } from './PlayScene';

launch({
  meta: meta as GameMeta,
  background: '#160d07',
  physics: 'none',
  preload(scene) {
    const l = scene.load;
    l.image('bg-w', kenney('boardgame/png/pieces_white/piecewhite_border11.png'));
    l.image('bg-b', kenney('boardgame/png/pieces_black/pieceblack_border11.png'));
    for (let n = 1; n <= 6; n++) {
      l.image(`die-white-${n}`, kenney(`boardgame/png/dice/diewhite_border${n}.png`));
      l.image(`die-red-${n}`, kenney(`boardgame/png/dice/diered_border${n}.png`));
    }
    l.image('bg-undo', kenney('game-icons/png/white/2x/return.png'));
    l.image('bg-ok', kenney('game-icons/png/white/2x/checkmark.png'));
    const J = 'oga/junkala-sfx/general-sounds/';
    loadSfx(l, 'roll', 'sfx-casino/audio/dieshuffle1');
    loadSfx(l, 'land', 'sfx-casino/audio/diethrow1');
    loadSfx(l, 'place', 'sfx-impact/audio/impactwood_light_000');
    loadSfx(l, 'place2', 'sfx-impact/audio/impactwood_light_003');
    loadSfx(l, 'pick', 'sfx-impact/audio/impactwood_light_002');
    loadSfx(l, 'off', 'sfx-casino/audio/chipsstack3');
    loadSfx(l, 'clear', 'sfx-casino/audio/chipscollide3');
    loadAudio(l, 'hit', J + 'impacts/sfx-sounds-impact8');
    loadAudio(l, 'move', J + 'menu-sounds/sfx-menu-move2');
    loadAudio(l, 'undo', J + 'menu-sounds/sfx-menu-move4');
    loadAudio(l, 'confirm', J + 'menu-sounds/sfx-menu-select2');
    loadAudio(l, 'turn', J + 'simple-bleeps/sfx-sounds-blip7');
    loadAudio(l, 'error', J + 'negative-sounds/sfx-sounds-error3');
    loadAudio(l, 'win', J + 'positive-sounds/sfx-sounds-powerup12');
    loadAudio(l, 'fanfare', J + 'fanfares/sfx-sounds-fanfare2');
    loadAudio(l, 'lose', J + 'negative-sounds/sfx-sounds-negative1');
  },
  menuDecor(scene) {
    const { width, height } = scene.scale;
    // a few checkers and dice along the bottom of the menu
    const y = height * 0.9;
    for (let k = 0; k < 5; k++) {
      scene.add.image(width * 0.12 + k * 44, y, 'bg-w').setDisplaySize(52, 52);
      scene.add.image(width * 0.88 - k * 44, y, 'bg-b').setDisplaySize(52, 52);
    }
    const d1 = scene.add.image(width * 0.36, y, `die-white-${rng.int(1, 6)}`).setDisplaySize(52, 52).setAngle(-12);
    const d2 = scene.add.image(width * 0.64, y, `die-red-${rng.int(1, 6)}`).setDisplaySize(52, 52).setAngle(10);
    scene.tweens.add({ targets: [d1, d2], angle: '+=360', duration: 2600, repeat: -1, ease: 'Cubic.easeInOut', repeatDelay: 900 });
  },
  scenes: [PlayScene],
  strings: {
    tr: {
      matchTo: '{n} PUANLIK MAÇ', waitPeer: 'RAKİP BEKLENİYOR…', undo: 'GERİ AL', done: 'TAMAM', pips: 'Pip: {n}', doubles: 'ÇİFT ZAR!', noMoves: 'HAMLE YOK',
      hit: 'KIRILDI!', barFirst: 'Önce kırık taşı sok', cantMove: 'Bu taş oynayamaz', confirm: 'HAMLEYİ ONAYLA', aiTurn: 'RAKİP OYNUYOR',
      mars: 'MARS!', gameWin: 'EL SENİN!', gameLose: 'ELİ VERDİN', matchWin: 'MAÇI KAZANDIN!', matchLose: 'MAÇI KAYBETTİN',
      d0: 'Acemi', d1: 'Heveskâr', d2: 'Kahveci', d3: 'Usta', d4: 'Tavla Üstadı',
    },
    en: {
      matchTo: 'MATCH TO {n}', waitPeer: 'WAITING FOR OPPONENT…', undo: 'UNDO', done: 'DONE', pips: 'Pips: {n}', doubles: 'DOUBLES!', noMoves: 'NO MOVES',
      hit: 'HIT!', barFirst: 'Enter from the bar first', cantMove: "That checker can't move", confirm: 'CONFIRM YOUR MOVE', aiTurn: 'CPU IS PLAYING',
      mars: 'GAMMON!', gameWin: 'GAME WON!', gameLose: 'GAME LOST', matchWin: 'MATCH WON!', matchLose: 'MATCH LOST',
      d0: 'Rookie', d1: 'Amateur', d2: 'Café Regular', d3: 'Pro', d4: 'Grandmaster',
    },
  },
});
