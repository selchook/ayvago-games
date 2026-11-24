// Trap Trail: the play HUD and the touch buttons, and every label the play scene shows, painted
// ahead in Boot under the Ayvago intro (prebakePlay).
//   Top row: the score (core), the hearts (full, half and empty: the pack's own heart models), the
//   stage and its clock in the centre, the stars found and the coins on the right (clear of the
//   pause button). Second row: keys held and the running powers with their seconds left.
//   Touch: the stick anywhere on the left half (core Controls), JUMP (big) and DASH on the right.
import Phaser from 'phaser';
import {
  t, labelTexture, labelAt, fitWidth, skinTexture, hudChip, HUD_ROW_Y, HUD_ROW2_Y, HUD_MARGIN, HUD_GAP, hudRightEdge,
  type Hud, type HudChip, type LabelStyle,
} from '@core';
import { ICON_SHEET, iconFrame } from './icons';
import { makeArt } from './art';
import { INK, ORANGE, BLUE } from './paint';
import { STAGE_COUNT, worldOf, inWorldOf } from './levels';
import { POWER_IDS, WORLD_IDS, type PowerId } from './defs';
import type { Sim } from './sim';

export const S_BANNER: LabelStyle = { size: 64, fill: ['#fff8c8', '#ffd23a', '#f07a12'], stroke: INK, strokeWidth: 10 };
export const S_BIG: LabelStyle = { size: 84, fill: ['#ffffff', '#fff0a0', '#ffa31a'], stroke: INK, strokeWidth: 12 };
export const S_SUBBANNER: LabelStyle = { size: 30, color: '#ffffff', stroke: INK, strokeWidth: 6 };
export const S_TOAST: LabelStyle = { size: 30, color: '#fff6d8', stroke: INK, strokeWidth: 6 };
export const S_POWER: LabelStyle = { size: 46, fill: ['#ffffff', '#fff3a0'], stroke: INK, strokeWidth: 9 };
export const S_HINT: LabelStyle = { size: 26, color: '#ffffff', stroke: INK, strokeWidth: 6 };
export const S_BTN: LabelStyle = { size: 22, color: '#ffffff', stroke: INK, strokeWidth: 5 };
export const S_KEY: LabelStyle = { size: 15, color: '#1b2a4a', stroke: null, shadow: false, body: true };

const TOASTS = ['checkpoint', 'needKey', 'gateOpen', 'chestOpen', 'gotKey', 'gotStar', 'gotHeart', 'shieldPop', 'fell',
  'pd_thunder', 'pd_shield', 'pd_magnet', 'pd_spring', 'tut_move', 'tut_moveKey', 'tut_jump', 'tut_jumpKey', 'tut_dash', 'tut_dashKey'];

export const stageLabel = (n: number): string => t('stageN', { w: WORLD_IDS.indexOf(worldOf(n)) + 1, n: inWorldOf(n) });

/** Paints the play scene's words ahead (Boot, under the intro). */
export function prebakePlay(scene: Phaser.Scene): void {
  makeArt(scene);
  for (let n = 1; n <= STAGE_COUNT; n++) { labelTexture(scene, t('s' + n), S_BANNER); labelTexture(scene, stageLabel(n), S_SUBBANNER); }
  for (const w of WORLD_IDS) labelTexture(scene, t('w_' + w), S_SUBBANNER);
  for (const k of ['stageClear', 'readyQ']) labelTexture(scene, t(k), S_BIG);
  labelTexture(scene, t('go'), S_BIG);
  labelTexture(scene, t('loseHearts'), S_BANNER);
  for (const k of TOASTS) labelTexture(scene, t(k), k.startsWith('tut_') ? S_HINT : S_TOAST);
  for (const p of POWER_IDS) labelTexture(scene, t('p_' + p), S_POWER);
  for (const k of ['jump', 'dash']) labelTexture(scene, t(k), S_BTN);
  for (const k of ['Space', 'Shift']) labelTexture(scene, k, S_KEY);
  for (const r of [56, 76, 88]) for (const c of [ORANGE, BLUE]) for (const st of ['up', 'down', 'off'] as const) skinTexture(scene, 'round', r * 2, r * 2, st, c);
}

// ------------------------------------------------------------------ the touch buttons

/** A round action button: a toy face, an icon, its word, a ring for the dash's recharge. */
export class ActionButton {
  readonly root: Phaser.GameObjects.Container;
  private face: Phaser.GameObjects.Image;
  private ring: Phaser.GameObjects.Graphics;
  private zone: Phaser.GameObjects.Zone;
  private holdId = -1;
  presses = 0;
  private pop = 0;

  constructor(private scene: Phaser.Scene, x: number, y: number, readonly r: number, iconKey: string, label: string, private color: number) {
    this.root = scene.add.container(x, y).setScrollFactor(0).setDepth(9050);
    this.face = scene.add.image(0, 0, skinTexture(scene, 'round', r * 2, r * 2, 'up', color));
    const ic = scene.add.image(0, -r * 0.12, iconKey).setDisplaySize(r * 0.9, r * 0.9);
    this.ring = scene.add.graphics();
    const lab = fitWidth(labelAt(scene, 0, r * 0.5, label, S_BTN), r * 1.6);
    this.root.add([this.face, this.ring, ic, lab]);
    this.root.setAlpha(0.92);
    const R = r * 1.2;
    this.zone = scene.add.zone(x, y, R * 2, R * 2).setScrollFactor(0).setDepth(9060).setInteractive(new Phaser.Geom.Circle(R, R, R), Phaser.Geom.Circle.Contains);
    this.zone.on('pointerdown', (p: Phaser.Input.Pointer, _x: number, _y: number, ev: Phaser.Types.Input.EventData) => {
      ev?.stopPropagation?.();
      this.presses++;
      this.holdId = p.id;
      this.pop = 0.14;
    });
    const up = (p: Phaser.Input.Pointer) => { if (p.id === this.holdId) this.holdId = -1; };
    scene.input.on('pointerup', up);
    scene.input.on('pointerupoutside', up);
  }

  get held(): boolean { return this.holdId >= 0; }
  take(): boolean { const n = this.presses > 0; this.presses = 0; return n; }

  setVisible(on: boolean): void {
    this.root.setVisible(on);
    if (on) this.zone.setInteractive(); else { this.zone.disableInteractive(); this.holdId = -1; this.presses = 0; }
  }

  /** `k` 0..1 recharged (1 = ready). */
  draw(k: number, dt: number): void {
    this.pop = Math.max(0, this.pop - dt);
    const g = this.ring.clear();
    if (k < 1) g.lineStyle(7, 0x1b2a4a, 0.55).strokeCircle(0, -2, this.r + 6).lineStyle(7, 0xffffff, 0.95).beginPath().arc(0, -2, this.r + 6, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * k).strokePath();
    const tex = skinTexture(this.scene, 'round', this.r * 2, this.r * 2, this.held ? 'down' : k < 1 ? 'off' : 'up', this.color);
    if (this.face.texture.key !== tex) this.face.setTexture(tex);
    this.root.setScale(1 + this.pop);
  }
}

// ------------------------------------------------------------------ the chips

const iconImg = (s: Phaser.Scene, key: string, size: number) => s.add.image(0, 0, ICON_SHEET, iconFrame(key)).setDisplaySize(size, size);

export class PlayHud {
  private hearts: HudChip;
  private heartImgs: Phaser.GameObjects.Image[] = [];
  private stage: HudChip;
  private coins: HudChip;
  private stars: HudChip;
  private starImgs: Phaser.GameObjects.Image[] = [];
  private keys: HudChip;
  private powers = new Map<PowerId, HudChip>();
  private shown = { hp: -1, max: -1, coins: -1, stars: '', keys: -1, clock: '' };
  private visible = true;

  constructor(private scene: Phaser.Scene, private hud: Hud) {
    const W = scene.scale.width;
    for (let i = 0; i < 9; i++) this.heartImgs.push(iconImg(scene, 'heart', 36));
    this.hearts = hudChip(scene, 0, HUD_ROW_Y, { items: this.heartImgs, minWidth: 60 });
    this.stage = hudChip(scene, W / 2, HUD_ROW_Y, { align: 'center', label: '1-1', icon: 'tt-clock', iconSize: 26, text: '0:00', minWidth: 150 });
    this.coins = hudChip(scene, hudRightEdge(scene), HUD_ROW_Y, { align: 'right', icon: ICON_SHEET, iconFrame: iconFrame('coin'), iconSize: 34, text: '0', minWidth: 96 });
    for (let i = 0; i < 3; i++) this.starImgs.push(iconImg(scene, 'star-empty', 34));
    this.stars = hudChip(scene, 0, HUD_ROW_Y, { align: 'right', items: this.starImgs, minWidth: 60 });
    this.keys = hudChip(scene, HUD_MARGIN, HUD_ROW2_Y, { icon: ICON_SHEET, iconFrame: iconFrame('key'), iconSize: 32, text: '×1' });
    for (const p of POWER_IDS) this.powers.set(p, hudChip(scene, 0, HUD_ROW2_Y, { icon: ICON_SHEET, iconFrame: iconFrame(p === 'spring' ? 'spring' : p), iconSize: 34, text: '', minWidth: 60 }));
  }

  setVisible(v: boolean): void {
    this.visible = v;
    for (const c of [this.hearts, this.stage, this.coins, this.stars, this.keys, ...this.powers.values()]) c.setVisible(v);
    this.hud.setVisible(v);
    if (v) this.shown = { hp: -1, max: -1, coins: -1, stars: '', keys: -1, clock: '' };
  }

  update(sim: Sim, stageN: number): void {
    if (!this.visible) return;
    const h = sim.hero, s = this.shown;
    // hearts: full, half and empty, laid out in the chip
    if (h.hp !== s.hp || h.max !== s.max) {
      const lost = h.hp < s.hp && s.hp >= 0;
      s.hp = h.hp; s.max = h.max;
      const n = Math.ceil(h.max / 2);
      this.heartImgs.forEach((img, i) => {
        img.setVisible(i < n);
        const left = h.hp - i * 2;
        img.setFrame(iconFrame(left >= 2 ? 'heart' : left === 1 ? 'heart-half' : 'heart-empty'));
        img.setDisplaySize(36, 36);
        img.setPosition(i * 34, 0);
      });
      this.hearts.setItems(this.heartImgs.slice(0, n));
      if (lost) this.scene.tweens.add({ targets: this.hearts, scale: 1.18, duration: 90, yoyo: true });
    }
    // the low-health beat
    if (h.hp <= 2 && h.hp > 0) this.hearts.setScale(1 + Math.max(0, Math.sin(this.scene.time.now / 160)) * 0.08);
    this.hearts.setAnchor(this.hud.scoreChip.right + HUD_GAP, HUD_ROW_Y, 'left');
    // the stage and its clock
    const clock = fmtTime(sim.clock);
    if (clock !== s.clock) { s.clock = clock; this.stage.setText(clock); this.stage.setCaption(stageLabel(stageN)); }
    // coins and stars
    if (sim.stats.coins !== s.coins) {
      const more = sim.stats.coins > s.coins && s.coins >= 0;
      s.coins = sim.stats.coins;
      this.coins.setText(String(s.coins));
      if (more) this.scene.tweens.add({ targets: this.coins, scale: 1.1, duration: 70, yoyo: true });
    }
    const st = sim.stats.stars.map((x) => (x ? 1 : 0)).join('');
    if (st !== s.stars) {
      const got = s.stars !== '' ;
      s.stars = st;
      this.starImgs.forEach((img, i) => { img.setFrame(iconFrame(sim.stats.stars[i] ? 'star' : 'star-empty')).setDisplaySize(34, 34).setPosition(i * 36, 0); });
      this.stars.setItems(this.starImgs);
      if (got) this.scene.tweens.add({ targets: this.stars, scale: 1.25, duration: 120, yoyo: true, ease: 'Back.easeOut' });
    }
    this.stars.setAnchor(this.coins.left - HUD_GAP, HUD_ROW_Y, 'right');
    // second row: keys and powers
    let x = HUD_MARGIN;
    if (h.keys !== s.keys) { s.keys = h.keys; this.keys.setText('×' + h.keys); }
    this.keys.setVisible(h.keys > 0);
    if (h.keys > 0) { this.keys.setAnchor(x, HUD_ROW2_Y, 'left'); x = this.keys.right + HUD_GAP; }
    for (const p of POWER_IDS) {
      const chip = this.powers.get(p)!;
      const on = p === 'shield' ? h.shield : h.powers[p] > 0;
      chip.setVisible(on);
      if (!on) continue;
      chip.setText(p === 'shield' ? '' : Math.ceil(h.powers[p]) + 's');
      const low = p !== 'shield' && h.powers[p] < 2;
      chip.setAlpha(low ? 0.55 + 0.45 * Math.abs(Math.sin(this.scene.time.now / 110)) : 1);
      chip.setAnchor(x, HUD_ROW2_Y, 'left');
      x = chip.right + HUD_GAP;
    }
  }
}

export function fmtTime(sec: number): string {
  const s = Math.max(0, Math.floor(sec));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}
