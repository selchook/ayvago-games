// Relic Ruins: the play HUD and the touch buttons, and every label the play scene shows, painted
// ahead in Boot under the Ayvago intro (prebakePlay).
//   Portrait: the top row holds the score (core), the hearts (full, half and empty) and the coins on
//   the right (clear of the pause button). Second row: the torch (a flame and a bar that burns down,
//   red and flickering when low), the gems found of the level's gems, then keys, flares, lit candles
//   and the running powers with their seconds; the level and its clock on the right, the collapse
//   clock in its place during an escape. Landscape (desktops and tablets): one row, the torch and
//   the readouts after the hearts, the level (or collapse) clock left of the coins; a full row
//   wraps to the next. Touch (whatever the orientation): the stick anywhere on the left half (core
//   Controls), ACT (big, its word follows what it would do) and FLARE (with the flares left) on
//   the right.
import Phaser from 'phaser';
import {
  t, isLandscape, labelTexture, labelAt, fitWidth, skinTexture, hudChip, HUD_ROW_Y, HUD_ROW2_Y, HUD_MARGIN, HUD_GAP, hudRightEdge,
  type Hud, type HudChip, type LabelStyle,
} from '@core';
import { ICON_SHEET, iconFrame, makeArt } from './art';
import { INK, AMBER, VERDIGRIS, EMBER } from './paint';
import { LEVEL_COUNT, worldOf, inWorldOf } from './levels';
import { WORLD_IDS, POWER_IDS, TIMED } from './defs';
import type { Sim } from './sim';

export const S_BANNER: LabelStyle = { size: 56, fill: ['#fff6cc', '#f6cf6a', '#c8781e'], stroke: INK, strokeWidth: 9 };
export const S_BIG: LabelStyle = { size: 76, fill: ['#ffffff', '#ffe9a0', '#e8962a'], stroke: INK, strokeWidth: 11 };
export const S_SUBBANNER: LabelStyle = { size: 28, color: '#fff2d8', stroke: INK, strokeWidth: 6 };
export const S_TOAST: LabelStyle = { size: 27, color: '#fff2d8', stroke: INK, strokeWidth: 6 };
export const S_WARN: LabelStyle = { size: 30, color: '#ffb08a', stroke: INK, strokeWidth: 6 };
export const S_POWER: LabelStyle = { size: 40, fill: ['#ffffff', '#ffe9a0'], stroke: INK, strokeWidth: 8 };
export const S_HINT: LabelStyle = { size: 22, color: '#fff2d8', stroke: INK, strokeWidth: 5, body: true };
export const S_BTN: LabelStyle = { size: 21, color: '#fff6e0', stroke: INK, strokeWidth: 5 };
export const S_PROMPT: LabelStyle = { size: 20, color: '#ffe9a0', stroke: INK, strokeWidth: 5 };

const TOASTS = ['brazierLit', 'exitOpen', 'needRelic', 'needKey', 'unlock', 'gotKey', 'gotGem', 'doorOpen', 'doorShut', 'sealedOpen', 'secret', 'candleOut', 'torchLow', 'fell', 'snap', 'noFlare', 'collapse', 'darkHit',
  'pd_flare', 'pd_oil', 'pd_boots', 'pd_compass', 'pd_ghost'];
const HINTS = ['h_torch', 'h_push', 'h_lever', 'h_key', 'h_escape', 'h_bookcase', 'h_candle', 'h_guardian', 'h_water', 'h_beartrap', 'h_trapdoor', 'h_sconce', 'h_mix', 'h_cracked', 'h_cart', 'h_stairs', 'h_all',
  'tut_move', 'tut_moveKey', 'tut_act', 'tut_actKey'];
export const VERBS = ['v_relic', 'v_lever', 'v_light', 'v_pot', 'v_bookcase', 'v_grab', 'v_roll'];

export const levelLabel = (n: number): string => t('stageN', { w: WORLD_IDS.indexOf(worldOf(n)) + 1, n: inWorldOf(n) });

/** Paints the play scene's words ahead (Boot, under the intro). */
export function prebakePlay(scene: Phaser.Scene): void {
  makeArt(scene);
  for (let n = 1; n <= LEVEL_COUNT; n++) { labelTexture(scene, t('l' + n), S_BANNER); labelTexture(scene, levelLabel(n), S_SUBBANNER); }
  for (const k of ['levelClear', 'relicTaken', 'run']) labelTexture(scene, t(k), S_BIG);
  labelTexture(scene, t('go'), S_BIG);
  for (const k of ['loseHearts', 'torchOut']) labelTexture(scene, t(k), S_BANNER);
  for (const k of TOASTS) labelTexture(scene, t(k), S_TOAST);
  labelTexture(scene, t('torchOut'), S_WARN);
  labelTexture(scene, t('torchLow'), S_WARN);
  for (const k of HINTS) labelTexture(scene, t(k), S_HINT);
  for (const p of POWER_IDS) labelTexture(scene, t('p_' + p), S_POWER);
  for (const k of ['act', 'flare', ...VERBS]) labelTexture(scene, t(k), S_BTN);
  for (const k of VERBS) labelTexture(scene, t(k), S_PROMPT);
  for (const r of [58, 84]) for (const c of [AMBER, VERDIGRIS]) for (const st of ['up', 'down', 'off'] as const) skinTexture(scene, 'round', r * 2, r * 2, st, c);
}

// ------------------------------------------------------------------ the touch buttons

/** A round action button: a stone face, an icon, its word, a count badge. */
export class ActionButton {
  readonly root: Phaser.GameObjects.Container;
  private face: Phaser.GameObjects.Image;
  private ic: Phaser.GameObjects.Image;
  private lab: Phaser.GameObjects.Image;
  private badge: Phaser.GameObjects.Text | null = null;
  private zone: Phaser.GameObjects.Zone;
  private holdId = -1;
  private word = '';
  presses = 0;
  private pop = 0;

  constructor(private scene: Phaser.Scene, x: number, y: number, readonly r: number, iconKey: string, label: string, private color: number, badge = false) {
    this.root = scene.add.container(x, y).setScrollFactor(0).setDepth(9050);
    this.face = scene.add.image(0, 0, skinTexture(scene, 'round', r * 2, r * 2, 'up', color));
    this.ic = scene.add.image(0, -r * 0.14, iconKey).setDisplaySize(r * 0.92, r * 0.92);
    this.lab = fitWidth(labelAt(scene, 0, r * 0.5, label, S_BTN), r * 1.6);
    this.word = label;
    this.root.add([this.face, this.ic, this.lab]);
    if (badge) {
      this.badge = scene.add.text(r * 0.62, -r * 0.62, '0', { fontFamily: 'Nunito', fontSize: '24px', fontStyle: '900', color: '#fff6e0', stroke: INK, strokeThickness: 5 }).setOrigin(0.5);
      this.root.add(this.badge);
    }
    this.root.setAlpha(0.94);
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

  /** The word on the button (a prebaked label). */
  setWord(text: string): void {
    if (text === this.word) return;
    this.word = text;
    const img = labelAt(this.scene, 0, this.r * 0.5, text, S_BTN);
    fitWidth(img, this.r * 1.6);
    this.lab.setTexture(img.texture.key).setScale(img.scaleX);
    img.destroy();
  }

  draw(dt: number, enabled = true, count = -1): void {
    this.pop = Math.max(0, this.pop - dt);
    const tex = skinTexture(this.scene, 'round', this.r * 2, this.r * 2, this.held ? 'down' : enabled ? 'up' : 'off', this.color);
    if (this.face.texture.key !== tex) this.face.setTexture(tex);
    this.root.setScale(1 + this.pop);
    if (this.badge && count >= 0) { const s = String(count); if (this.badge.text !== s) this.badge.setText(s); }
  }
}

// ------------------------------------------------------------------ the chips

const iconImg = (s: Phaser.Scene, key: string, size: number) => (key.startsWith('rr-') ? s.add.image(0, 0, key) : s.add.image(0, 0, ICON_SHEET, iconFrame(key))).setDisplaySize(size, size);
const BAR_W = 150, BAR_H = 16;

export class PlayHud {
  private hearts: HudChip;
  private heartImgs: Phaser.GameObjects.Image[] = [];
  private level: HudChip;
  private coins: HudChip;
  private torch: HudChip;
  private bar: Phaser.GameObjects.Graphics;
  private gems: HudChip;
  private keys: HudChip;
  private flares: HudChip;
  private candles: HudChip;
  private escape: HudChip;
  private powers = new Map<string, HudChip>();
  private shown = { hp: -1, max: -1, coins: -1, gems: '', keys: -1, flares: -1, clock: '', candles: '', esc: '' };
  private visible = true;
  /** Landscape: one row of chips (the level clock beside the coins). */
  private land = isLandscape();

  constructor(private scene: Phaser.Scene, private hud: Hud) {
    for (let i = 0; i < 9; i++) this.heartImgs.push(iconImg(scene, 'heart', 34));
    this.hearts = hudChip(scene, 0, HUD_ROW_Y, { items: this.heartImgs, minWidth: 60 });
    this.level = hudChip(scene, hudRightEdge(scene), HUD_ROW2_Y, { align: 'right', label: '1-1', icon: 'rr-clock', iconSize: 26, text: '0:00', minWidth: 130 });
    this.coins = hudChip(scene, hudRightEdge(scene), HUD_ROW_Y, { align: 'right', icon: ICON_SHEET, iconFrame: iconFrame('coin'), iconSize: 32, text: '0', minWidth: 90 });
    this.bar = scene.add.graphics();
    this.bar.setData('chipWidth', BAR_W);
    this.torch = hudChip(scene, HUD_MARGIN, HUD_ROW2_Y, { icon: 'rr-flame', iconSize: 36, items: [this.bar], minWidth: BAR_W + 60 });
    this.gems = hudChip(scene, 0, HUD_ROW2_Y, { icon: 'rr-gem', iconSize: 30, text: '0/0', minWidth: 80 });
    this.keys = hudChip(scene, 0, HUD_ROW2_Y, { icon: ICON_SHEET, iconFrame: iconFrame('key'), iconSize: 30, text: '×1' });
    this.flares = hudChip(scene, 0, HUD_ROW2_Y, { icon: 'rr-flare', iconSize: 32, text: '×1' });
    this.candles = hudChip(scene, 0, HUD_ROW2_Y, { icon: 'rr-candle', iconSize: 30, text: '0/0' });
    this.escape = hudChip(scene, hudRightEdge(scene), HUD_ROW2_Y, { align: 'right', icon: 'rr-crack', iconSize: 32, text: '0:00', minWidth: 100, color: '#ffb08a' });
    for (const p of TIMED) this.powers.set(p, hudChip(scene, 0, HUD_ROW2_Y, { icon: 'rr-' + p, iconSize: 32, text: '', minWidth: 60 }));
  }

  private all(): HudChip[] { return [this.hearts, this.level, this.coins, this.torch, this.gems, this.keys, this.flares, this.candles, this.escape, ...this.powers.values()]; }

  setVisible(v: boolean): void {
    this.visible = v;
    for (const c of this.all()) c.setVisible(v);
    this.hud.setVisible(v);
    if (v) this.shown = { hp: -1, max: -1, coins: -1, gems: '', keys: -1, flares: -1, clock: '', candles: '', esc: '' };
  }

  update(sim: Sim, n: number, time: number): void {
    if (!this.visible) return;
    const h = sim.hero, s = this.shown, sc = this.scene;
    // hearts: full, half and empty
    if (h.hp !== s.hp || h.max !== s.max) {
      const lost = h.hp < s.hp && s.hp >= 0;
      s.hp = h.hp; s.max = h.max;
      const cnt = Math.ceil(h.max / 2);
      this.heartImgs.forEach((img, i) => {
        img.setVisible(i < cnt);
        const left = h.hp - i * 2;
        img.setFrame(iconFrame(left >= 2 ? 'heart' : left === 1 ? 'heart-half' : 'heart-empty')).setDisplaySize(34, 34).setPosition(i * 31, 0);
      });
      this.hearts.setItems(this.heartImgs.slice(0, cnt));
      if (lost) sc.tweens.add({ targets: this.hearts, scale: 1.18, duration: 90, yoyo: true });
    }
    if (h.hp <= 2 && h.hp > 0) this.hearts.setScale(1 + Math.max(0, Math.sin(time / 160)) * 0.08);
    this.hearts.setAnchor(this.hud.scoreChip.right + HUD_GAP, HUD_ROW_Y, 'left');
    // the level and its clock
    const clock = fmtTime(sim.stats.time);
    if (clock !== s.clock) { s.clock = clock; this.level.setText(clock); this.level.setCaption(levelLabel(n)); }
    if (sim.stats.coins !== s.coins) {
      const more = sim.stats.coins > s.coins && s.coins >= 0;
      s.coins = sim.stats.coins;
      this.coins.setText(String(s.coins));
      if (more) sc.tweens.add({ targets: this.coins, scale: 1.1, duration: 70, yoyo: true });
    }
    // the torch: a bar that burns down
    const k = Math.max(0, h.torch / h.tmax);
    const low = k < 0.25 || h.dark >= 0;
    const g = this.bar.clear(), x0 = -BAR_W / 2;
    g.fillStyle(0x0e0904, 0.85).fillRoundedRect(x0, -BAR_H / 2, BAR_W, BAR_H, 6);
    const col = h.dark >= 0 ? EMBER : k < 0.25 ? 0xe8582a : k < 0.5 ? 0xf0962a : 0xffc850;
    const fl = low ? 0.55 + 0.45 * Math.abs(Math.sin(time / 90)) : 1;
    if (k > 0) g.fillStyle(col, fl).fillRoundedRect(x0 + 1, -BAR_H / 2 + 1, Math.max(4, (BAR_W - 2) * k), BAR_H - 2, 5);
    g.fillStyle(0xffffff, 0.22).fillRoundedRect(x0 + 3, -BAR_H / 2 + 2, Math.max(2, (BAR_W - 6) * k), 4, 2);
    g.lineStyle(2, 0xe8b84a, 0.8).strokeRoundedRect(x0, -BAR_H / 2, BAR_W, BAR_H, 6);
    if (h.dark >= 0) { g.fillStyle(0xff5030, 0.9).fillRect(x0, BAR_H / 2 + 2, BAR_W * (h.dark / sim.tune.grace), 3); }
    // the level and its clock: right of row two (portrait) or left of the coins (landscape); the
    // collapse clock takes its place in an escape
    const esc = sim.escapeT >= 0 && h.state !== 'clear';
    const row = this.land ? HUD_ROW_Y : HUD_ROW2_Y;
    const rightX = this.land ? this.coins.left - HUD_GAP : hudRightEdge(sc);
    this.level.setVisible(!esc);
    this.level.setAnchor(rightX, row, 'right');
    this.escape.setAnchor(rightX, row, 'right');
    // the torch after the hearts (landscape) or first on row two (portrait)
    this.torch.setAnchor(this.land ? this.hearts.right + HUD_GAP : HUD_MARGIN, row, 'left');
    // the readouts, left to right after the torch (the next row when this one fills up)
    let x = this.torch.right + HUD_GAP, y = row;
    const limit = () => (y === row ? (esc ? this.escape.left : this.level.left) - HUD_GAP : sc.scale.width - HUD_MARGIN);
    const place = (chip: HudChip, on: boolean) => {
      chip.setVisible(on);
      if (!on) return;
      chip.setAnchor(x, y, 'left');
      if (chip.right > limit() && y === row) { x = HUD_MARGIN; y = row + (HUD_ROW2_Y - HUD_ROW_Y); chip.setAnchor(x, y, 'left'); }
      x = chip.right + HUD_GAP;
    };
    const gm = `${sim.stats.gems}/${sim.c.gems}`;
    if (gm !== s.gems) { const more = s.gems !== ''; s.gems = gm; this.gems.setText(gm); if (more) sc.tweens.add({ targets: this.gems, scale: 1.22, duration: 120, yoyo: true }); }
    place(this.gems, sim.c.gems > 0);
    if (h.keys !== s.keys) { s.keys = h.keys; this.keys.setText('×' + h.keys); }
    place(this.keys, h.keys > 0);
    if (h.flares !== s.flares) { s.flares = h.flares; this.flares.setText('×' + h.flares); }
    place(this.flares, h.flares > 0);
    const cands = sim.things.filter((th) => th.kind === 'candles');
    const lit = cands.filter((th) => th.on).length;
    const cs = `${lit}/${cands.length}`;
    if (cs !== s.candles) { s.candles = cs; this.candles.setText(cs); }
    place(this.candles, cands.length > 0 && lit > 0 && !sim.sealedOpen);
    for (const p of TIMED) {
      const chip = this.powers.get(p)!, v = h.powers[p as 'boots'];
      place(chip, v > 0);
      if (v <= 0) continue;
      chip.setText(Math.ceil(v) + 's');
      chip.setAlpha(v < 2 ? 0.55 + 0.45 * Math.abs(Math.sin(time / 110)) : 1);
    }
    // the collapse clock
    this.escape.setVisible(esc);
    if (esc) {
      const e = fmtTime(Math.ceil(sim.escapeLeft()));
      if (e !== s.esc) { s.esc = e; this.escape.setText(e); }
      this.escape.setScale(1 + Math.max(0, Math.sin(time / 140)) * 0.06);
    }
    void POWER_IDS;
  }
}

export function fmtTime(sec: number): string {
  const s = Math.max(0, Math.floor(sec));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}
