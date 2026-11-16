// The level select and the level-clear card in the menu theme (theme.ts): the maple panel as the
// card, lacquered wood tiles and buttons, labels in the display face. Every face, card and fixed
// line (titles, the worlds, the levels' names, button labels) is painted in Boot under the Ayvago
// intro (`prebakeMaze`, the theme's `prebake`), and the changing numbers (stars, gems, times,
// scores) are set from painted glyphs, so opening a screen only places images.
import Phaser from 'phaser';
import { t, loc, labelTexture, type LabelStyle, type SkinKind, type SkinState, bakeButton, bakeFmt, bakePara, glyphAtlas } from '@core';
import { LEVELS, WORLDS } from './levels';
import { THEMES } from './look';

// the theme's colours (theme.ts imports this file, so they are repeated here)
export const MAPLE = 0xa8743e, WALNUT = 0x4a2d18, CHERRY = 0xc4452a, GREEN = 0x3c9a4a, PLUM = 0x7a4fb0;
const INK = '#2a160a';

/** The level-clear card (`menuTheme.cards`) and the level select's tiles (`pieces`). */
export const CLEAR_CARD = { w: 600, h: 750 };
export const TILE = 92;
export const TILE_PIECES: Array<{ kind: SkinKind; w: number; h: number; color: number; states: SkinState[] }> = [
  { kind: 'plate', w: TILE, h: TILE, color: MAPLE, states: ['up', 'over', 'down'] },
  { kind: 'plate', w: TILE, h: TILE, color: WALNUT, states: ['off'] },
];
export const BTN = {
  finish: { w: 420, h: 92 }, next: { w: 330, h: 96 }, again: { w: 190, h: 96 }, levels: { w: 300, h: 76 },
};

export const NUMS = '0123456789/:.+ ·';

export const MS = {
  title: { size: 40, fill: ['#fff6dc', '#ffd36b', '#d08a18'], stroke: INK } as LabelStyle,
  count: { size: 30 } as LabelStyle,
  world: (accent: string): LabelStyle => ({ size: 22, color: accent, stroke: INK, strokeWidth: 5 }),
  tile: { size: 34, strokeWidth: 5 } as LabelStyle,
  hint: { size: 26, color: '#f4e4c8', body: true } as LabelStyle,
  btn: { size: 30 } as LabelStyle,
  small: { size: 26 } as LabelStyle,
  smaller: { size: 24 } as LabelStyle,
  done: { size: 44, fill: ['#e8ffe0', '#7be05a', '#2e8a2a'], stroke: INK } as LabelStyle,
  name: { size: 28, color: '#6e4626', stroke: null, shadow: false, body: true } as LabelStyle,
  line: { size: 27, color: '#2b1a0e', stroke: null, shadow: false, body: true } as LabelStyle,
  lineOff: { size: 27, color: '#9a8468', stroke: null, shadow: false, body: true } as LabelStyle,
  extra: { size: 26, color: '#8a3412', stroke: null, shadow: false, body: true } as LabelStyle,
  bonus: { size: 26, color: '#c2186a', stroke: INK, strokeWidth: 4 } as LabelStyle,
};

/** A world's heading on the level select. */
export const worldLine = (wi: number): string => `${t('worldN', { n: wi + 1 })} · ${loc(WORLDS[wi].name)}`;

/**
 * Paints everything the level select and the level-clear card show (the theme's `prebake`, in
 * Boot under the Ayvago intro): the buttons' faces, the titles, the worlds, the tiles' numbers,
 * every level's name and the glyphs of the counts, times and scores.
 */
export function prebakeMaze(scene: Phaser.Scene): void {
  bakeButton(scene, 'button', BTN.finish.w, BTN.finish.h, GREEN);
  bakeButton(scene, 'button', BTN.next.w, BTN.next.h, GREEN);
  bakeButton(scene, 'button', BTN.again.w, BTN.again.h, PLUM);
  bakeButton(scene, 'button', BTN.levels.w, BTN.levels.h, WALNUT);
  labelTexture(scene, t('chooseLevel'), MS.title);
  glyphAtlas(scene, MS.count, NUMS);
  WORLDS.forEach((_, wi) => labelTexture(scene, worldLine(wi), MS.world(THEMES[wi].accent)));
  LEVELS.forEach((lv, i) => {
    labelTexture(scene, String(i + 1), MS.tile);
    labelTexture(scene, loc(lv.name), MS.name);
  });
  bakePara(scene, t('selectHint'), MS.hint, 600);
  bakeFmt(scene, 'finishRun', ['score'], MS.btn, NUMS);
  for (const k of ['next', 'allClear']) labelTexture(scene, t(k), MS.btn);
  labelTexture(scene, t('again'), MS.small);
  labelTexture(scene, t('levels'), MS.smaller);
  labelTexture(scene, t('levelDone'), MS.done);
  labelTexture(scene, t('finishedLine'), MS.line);
  for (const o of [MS.line, MS.lineOff]) { bakeFmt(scene, 'gemsLine', ['n', 'max'], o, NUMS); bakeFmt(scene, 'timeLine', ['t', 'par'], o, NUMS); }
  bakeFmt(scene, 'levelScore', ['n'], MS.extra, NUMS);
  labelTexture(scene, t('newRecord'), MS.extra);
  labelTexture(scene, t('extraMarble'), MS.bonus);
}
