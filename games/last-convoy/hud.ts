// Last Convoy: the play HUD's pieces. The round action buttons of the right thumb (ATTACK in the
// corner, DODGE, ABILITY, SWAP, DOG round it, USE popping up with what it would do), each a bolted
// steel face with an icon, a ring for a cooldown or the heavy charge, its word and, on desktops, its
// key; and every label the play scene shows (banners, toasts, combo names, hints), painted ahead in
// Boot under the Ayvago intro.
import Phaser from 'phaser';
import { t, labelTexture, labelAt, fitWidth, bakeFmt, glyphAtlas, NUMERIC_GLYPHS, type LabelStyle } from '@core';
import { makeArt, btnKey, iconKey } from './art';
import { MISSIONS } from './defs';

const INK = '#14100c';
export const S_BANNER: LabelStyle = { size: 58, fill: ['#fff4c8', '#f2c84a', '#e8902a'], stroke: INK, strokeWidth: 9 };
export const S_BIG: LabelStyle = { size: 74, fill: ['#ffffff', '#ffd8a0', '#ff8a3a'], stroke: INK, strokeWidth: 11 };
export const S_RED: LabelStyle = { size: 60, fill: ['#ffe8d8', '#ff7a5a', '#c82a1a'], stroke: INK, strokeWidth: 9 };
export const S_TOAST: LabelStyle = { size: 25, color: '#fff2cc', stroke: INK, strokeWidth: 5 };
export const S_BTN: LabelStyle = { size: 16, color: '#ffffff', stroke: INK, strokeWidth: 4 };
export const S_KEY: LabelStyle = { size: 14, color: '#f2c84a', stroke: INK, strokeWidth: 4 };
export const S_DMG: LabelStyle = { size: 22, color: '#ffffff', stroke: INK, strokeWidth: 4 };
export const S_CRIT: LabelStyle = { size: 28, color: '#ffd84a', stroke: INK, strokeWidth: 5 };
export const S_HURT: LabelStyle = { size: 26, color: '#ff6a5a', stroke: INK, strokeWidth: 5 };
export const S_FIN: LabelStyle = { size: 22, color: '#ffe8b0', stroke: INK, strokeWidth: 4 };
export const S_DIST: LabelStyle = { size: 18, color: '#ffffff', stroke: INK, strokeWidth: 4 };
export const S_SMALL: LabelStyle = { size: 18, color: '#ffffff', stroke: INK, strokeWidth: 4 };
export const DIST_GLYPHS = NUMERIC_GLYPHS + 'm';

const TOASTS = ['night', 'gunNoise', 'armor', 'locked2', 'freed', 'safe', 'help', 'medkit', 'holdStart', 'holdDone', 'stageCollect', 'stageRescue', 'stageClear', 'stageHold', 'stageBoss', 'stageReturn',
  'grabbed', 'pulled', 'empty', 'reloadT', 'abilityReady', 'dogDown', 'buddyDown', 'buddyUp', 'revived', 'bark', 'sniff', 'found', 'sic', 'waveClear', 'nextWave',
  'zone_ramp', 'zone_highway', 'repaired', 'nitroUp', 'scrapUp',
  'tut_move', 'tut_moveKey', 'tut_attack', 'tut_attackKey', 'tut_hold', 'tut_holdKey', 'tut_dodge', 'tut_dodgeKey', 'tut_use', 'tut_useKey', 'tut_dog', 'tut_dogKey', 'tut_swap', 'tut_swapKey', 'tut_done',
  'drive_tut', 'drive_tutKey', 'hint_fa', 'hint_fb', 'hint_fc'];
const BANNERS = ['horde', 'bossIn', 'armorBreak', 'driveGo', 'driveSign', 'crash', 'nitroGo'];
const FINISHERS = ['whirl', 'cleave', 'lunge', 'doubleTap', 'burst', 'slug', 'headshot', 'piercer', 'spray', 'buckshot', 'rail', 'rollShot', 'pointBlank'];
export const BUTTON_WORDS = ['attack', 'dodge', 'abilityBtn', 'swap', 'reload', 'dogBtn', 'use', 'use_free', 'use_open', 'use_start', 'use_board', 'use_revive', 'skip'];

/** Paints the play scene's words ahead (Boot, under the intro). */
export function prebakePlay(scene: Phaser.Scene): void {
  makeArt(scene);
  for (const k of BANNERS) labelTexture(scene, t(k), k === 'driveGo' || k === 'driveSign' ? S_BIG : k === 'crash' ? S_RED : S_BANNER);
  for (const k of TOASTS) labelTexture(scene, t(k), S_TOAST);
  for (const m of MISSIONS) labelTexture(scene, t('m_' + m.n), S_BANNER);
  for (const k of ['loseHero', 'loseSurv', 'loseTruck', 'loseDrive']) labelTexture(scene, t(k), S_RED);
  for (const k of FINISHERS) labelTexture(scene, t('cmb_' + k), S_FIN);
  for (const k of BUTTON_WORDS) labelTexture(scene, t(k), S_BTN);
  for (const k of [t('keySpace'), 'Shift', 'Q', 'E', 'F', 'R', 'C', 'K', 'J', 'Tab']) labelTexture(scene, k, S_KEY);
  for (const k of ['it_fuel', 'it_part', 'it_key', 'it_battery']) labelTexture(scene, t(k), S_TOAST);
  bakeFmt(scene, 'itemN', ['item', 'n', 'm'], S_TOAST);
  bakeFmt(scene, 'hordeN', ['n'], S_TOAST);
  bakeFmt(scene, 'chestScrap', ['n'], S_TOAST);
  bakeFmt(scene, 'supplyN', ['n'], S_TOAST);
  bakeFmt(scene, 'ammoN', ['n'], S_TOAST);
  bakeFmt(scene, 'wave', ['n'], S_BANNER);
  bakeFmt(scene, 'waveBoss', ['n'], S_BANNER);
  for (const o of [S_DMG, S_CRIT, S_HURT, S_SMALL]) glyphAtlas(scene, o);
  glyphAtlas(scene, S_DIST, DIST_GLYPHS);
}

/** A round action button: a steel face, an icon, a ring for its cooldown or charge, its word, its key. */
export class ActionButton {
  readonly root: Phaser.GameObjects.Container;
  private ring: Phaser.GameObjects.Graphics;
  private face: Phaser.GameObjects.Image;
  readonly icon: Phaser.GameObjects.Image;
  private lab: Phaser.GameObjects.Image;
  presses = 0;
  private holdId = -1;
  private pop = 0;
  private lastReady = false;
  private zone: Phaser.GameObjects.Zone;
  down = false;
  shown = true;

  constructor(private scene: Phaser.Scene, x: number, y: number, readonly r: number, readonly kind: string, icon: string, label: string, keyHint: string, private color: number) {
    this.root = scene.add.container(x, y).setScrollFactor(0).setDepth(9050);
    this.face = scene.add.image(0, 0, btnKey(kind)).setDisplaySize(r * 2.2, r * 2.2);
    this.icon = scene.add.image(0, -r * 0.14, iconKey(icon)).setDisplaySize(r * 0.95, r * 0.95);
    this.ring = scene.add.graphics();
    this.lab = fitWidth(labelAt(scene, 0, r * 0.58, label, S_BTN), r * 1.7);
    this.root.add([this.face, this.ring, this.icon, this.lab]);
    if (keyHint) this.root.add(labelAt(scene, 0, r + 14, keyHint, S_KEY));
    const R = r * 1.15;
    this.zone = scene.add.zone(x, y, R * 2, R * 2).setScrollFactor(0).setDepth(9060)
      .setInteractive(new Phaser.Geom.Circle(R, R, R), Phaser.Geom.Circle.Contains);
    this.zone.on('pointerdown', (p: Phaser.Input.Pointer, _x: number, _y: number, ev: Phaser.Types.Input.EventData) => {
      ev?.stopPropagation?.();
      this.presses++;
      this.holdId = p.id;
      this.kick();
    });
    const up = (p: Phaser.Input.Pointer) => { if (p.id === this.holdId) this.holdId = -1; };
    scene.input.on('pointerup', up);
    scene.input.on('pointerupoutside', up);
  }

  get held(): boolean { return this.holdId >= 0; }
  get x(): number { return this.root.x; }
  get y(): number { return this.root.y; }

  take(): boolean { const n = this.presses > 0; this.presses = 0; return n; }
  kick(): void { this.pop = 0.16; }

  setLabel(s: string): void {
    const tex = labelTexture(this.scene, s, S_BTN);
    if (this.lab.texture.key !== tex) { this.lab.setTexture(tex); this.lab.setScale(1); fitWidth(this.lab, this.r * 1.7); }
  }
  setIcon(name: string): void { const k = iconKey(name); if (this.icon.texture.key !== k) this.icon.setTexture(k).setDisplaySize(this.r * 0.95, this.r * 0.95); }

  setVisible(on: boolean): void {
    this.shown = on;
    this.root.setVisible(on);
    if (on) this.zone.setInteractive(); else { this.zone.disableInteractive(); this.holdId = -1; this.presses = 0; }
  }

  /** `k` 0..1 filled; ready lights it; `charge` 0..1 the heavy finisher's ring. */
  draw(k: number, ready: boolean, time: number, dt: number, charge = 0): void {
    this.pop = Math.max(0, this.pop - dt);
    const g = this.ring.clear();
    const R = this.r * 1.03;
    g.lineStyle(7, 0x0a0806, 0.6).strokeCircle(0, 0, R);
    if (k > 0 && k < 1) g.lineStyle(7, 0x8a8478, 1).beginPath().arc(0, 0, R, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * Math.min(1, k)).strokePath();
    else if (ready) g.lineStyle(5, this.color, 0.9).strokeCircle(0, 0, R);
    if (charge > 0) g.lineStyle(9, charge >= 1 ? 0xffe07a : 0xff8a2a, 1).beginPath().arc(0, 0, R + 6, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * Math.min(1, charge)).strokePath();
    if (this.kind === 'attack' && this.down) g.fillStyle(this.color, 0.2).fillCircle(0, 0, R - 4);
    if (ready && (this.kind === 'ability' || this.kind === 'use')) g.lineStyle(4, 0xffffff, 0.35 + Math.sin(time * 8) * 0.3).strokeCircle(0, 0, R + 7);
    this.face.setTexture(btnKey(ready ? this.kind : 'off'));
    this.icon.setAlpha(ready ? 1 : 0.45);
    const s = (this.kind === 'attack' && this.down ? 0.94 : 1) + this.pop * 0.6;
    this.root.setScale(s);
    if (ready && !this.lastReady && this.kind === 'ability') this.scene.tweens.add({ targets: this.root, scale: 1.18, duration: 120, yoyo: true });
    this.lastReady = ready;
  }
}
