// Dungeon Rescue: the play HUD and the touch buttons, and every label the play scene shows, painted
// ahead in Boot under the Ayvago intro (prebakePlay).
//   Portrait: the top row holds the score and the hearts (the core's widgets) and the coins on the
//   right (clear of the pause button). Second row: the rescued count, the detection readout (an eye:
//   shut when hidden, open, "?" when a guard is suspicious, "!" in a chase), what there is to throw,
//   the tricks in the bag and the running ones with their seconds, the crew's WAIT when they sit;
//   the level and its clock on the right, the alarm clock in its place during an escape. The Jailer
//   Chief's alertness bar sits centred below. Landscape (desktops and tablets): one row, the readouts
//   after the hearts, the level (or alarm) clock left of the coins; a full row wraps to the next.
//   Touch (whatever the orientation): the stick anywhere on the left half (core Controls; pushed all
//   the way it sprints), ACT (big, its word follows what it would do), THROW, POWER and CREW.
import Phaser from 'phaser';
import {
  t, isLandscape, labelTexture, labelAt, fitWidth, skinTexture, hudChip, HUD_ROW_Y, HUD_ROW2_Y, HUD_MARGIN, HUD_GAP, hudRightEdge,
  type Hud, type HudChip, type LabelStyle,
} from '@core';
import { makeArt, POWER_ICON } from './art';
import { INK, CRIMSON, ROYAL, GOLD, MOSS, SLATE } from './paint';
import { LEVEL_COUNT, wingOf, inWingOf } from './levels';
import { WING_IDS, POWER_IDS, CREW_IDS, CREW } from './defs';
import type { Sim } from './sim';

export const S_BANNER: LabelStyle = { size: 56, fill: ['#fff6cc', '#f2cf6a', '#c8781e'], stroke: INK, strokeWidth: 9 };
export const S_BIG: LabelStyle = { size: 78, fill: ['#ffffff', '#ffe9a0', '#e8962a'], stroke: INK, strokeWidth: 11 };
export const S_ALARM: LabelStyle = { size: 84, fill: ['#ffffff', '#ffb0a0', '#e0301a'], stroke: INK, strokeWidth: 11 };
export const S_SUBBANNER: LabelStyle = { size: 28, color: '#fff2d8', stroke: INK, strokeWidth: 6 };
export const S_TOAST: LabelStyle = { size: 28, color: '#fff2d8', stroke: INK, strokeWidth: 6 };
export const S_WARN: LabelStyle = { size: 31, color: '#ffb08a', stroke: INK, strokeWidth: 6 };
export const S_GOOD: LabelStyle = { size: 31, color: '#b8ffb0', stroke: INK, strokeWidth: 6 };
export const S_POWER: LabelStyle = { size: 42, fill: ['#ffffff', '#ffe9a0'], stroke: INK, strokeWidth: 8 };
export const S_HINT: LabelStyle = { size: 22, color: '#fff2d8', stroke: INK, strokeWidth: 5, body: true };
export const S_BTN: LabelStyle = { size: 22, color: '#fff6e0', stroke: INK, strokeWidth: 5 };
export const S_PROMPT: LabelStyle = { size: 22, color: '#ffe9a0', stroke: INK, strokeWidth: 5 };
export const S_BOSS: LabelStyle = { size: 40, fill: ['#ffffff', '#ffd0a0', '#c8541e'], stroke: INK, strokeWidth: 8 };

export const TOASTS = ['leaveNow', 'full', 'noThrow', 'noPower', 'pickBreak', 'unlocked', 'freed', 'crewWait', 'crewFollow', 'fell', 'checkpoint', 'torchOut', 'gateOpen', 'gateShut',
  'chest', 'chiefCall', 'stolen', 'keysBack', 'lockedIn', 'guardFell', 'alarmRun', 'dozing', 'moo', 'pd_smoke', 'pd_disguise', 'pd_powder', 'pd_swift', 'pd_decoy'];
export const WARNS = ['spiked', 'shrug', 'alarmLow', 'timeUp', 'caught'];
export const HINTS = ['h_cone', 'h_pick', 'h_hide', 'h_throw', 'h_boss1', 'h_sleep', 'h_lever', 'h_power', 'h_crowd', 'h_boss2', 'h_spikes', 'h_trapdoor', 'h_powder', 'h_decoy', 'h_boss3',
  'h_heavy', 'h_rounds', 'h_dark', 'h_all', 'h_boss4', 'h_final2', 'tut_move', 'tut_moveKey', 'tut_act', 'tut_actKey'];
export const VERBS = ['v_pick', 'v_key', 'v_lever', 'v_torch', 'v_hide', 'v_chest', 'v_steal', 'v_exit', 'v_unhide'];
export const DETECT_KEYS = ['det_hidden', 'det_unseen', 'det_seen', 'det_spotted'];

export const levelLabel = (n: number): string => t('stageN', { w: WING_IDS.indexOf(wingOf(n)) + 1, n: inWingOf(n) });
export const joinedText = (id: string): string => t('joined', { name: CREW[id]?.name ?? '' });

/** The touch buttons: [x, y, radius] in each orientation, from the bottom-right corner. */
export function buttonLayout(W: number, H: number): Record<'act' | 'throw' | 'power' | 'crew' | 'run', [number, number, number]> {
  // RUN (hold) sits with the other right-thumb buttons, on the right half (the stick has the left)
  return isLandscape()
    ? { act: [W - 122, H - 128, 80], throw: [W - 286, H - 86, 56], power: [W - 112, H - 300, 54], crew: [W - 262, H - 238, 46], run: [W - 432, H - 80, 50] }
    : { act: [W - 122, H - 172, 84], throw: [W - 294, H - 118, 60], power: [W - 118, H - 362, 56], crew: [W - 280, H - 300, 50], run: [W - 290, H - 452, 50] };
}

/** Paints the play scene's words ahead (Boot, under the intro). */
export function prebakePlay(scene: Phaser.Scene): void {
  makeArt(scene);
  for (let n = 1; n <= LEVEL_COUNT; n++) { labelTexture(scene, t('l' + n), S_BANNER); labelTexture(scene, levelLabel(n), S_SUBBANNER); }
  for (const k of ['escaped', 'go', 'caught']) labelTexture(scene, t(k), S_BIG);
  labelTexture(scene, t('alarm'), S_ALARM);
  labelTexture(scene, t('outwit'), S_BANNER);
  labelTexture(scene, t('loseHearts'), S_BANNER);
  labelTexture(scene, t('chiefName'), S_BOSS);
  for (const k of TOASTS) labelTexture(scene, t(k), S_TOAST);
  for (const k of WARNS) labelTexture(scene, t(k), S_WARN);
  for (const id of CREW_IDS) labelTexture(scene, joinedText(id), S_GOOD);
  for (let n = 1; n <= 3; n++) labelTexture(scene, t('needMore', { n }), S_WARN);
  for (const k of HINTS) labelTexture(scene, t(k), S_HINT);
  for (const p of POWER_IDS) labelTexture(scene, t('p_' + p), S_POWER);
  for (const k of ['act', 'throw', 'power', 'crew', 'run', ...VERBS]) labelTexture(scene, t(k), S_BTN);
  for (const k of VERBS) labelTexture(scene, t(k), S_PROMPT);
  for (const r of [46, 50, 54, 56, 60, 80, 84]) for (const c of [CRIMSON, ROYAL, MOSS, SLATE]) for (const st of ['up', 'down', 'off'] as const) skinTexture(scene, 'round', r * 2, r * 2, st, c);
}

// ------------------------------------------------------------------ the touch buttons

/** A round action button: a shield face, an icon, its word, a count badge. */
export class ActionButton {
  readonly root: Phaser.GameObjects.Container;
  private face: Phaser.GameObjects.Image;
  private ic: Phaser.GameObjects.Image;
  private lab: Phaser.GameObjects.Image;
  private badge: Phaser.GameObjects.Text | null = null;
  private zone: Phaser.GameObjects.Zone;
  private holdId = -1;
  private word = '';
  private iconKey: string;
  presses = 0;
  releases = 0;
  private pop = 0;

  constructor(private scene: Phaser.Scene, x: number, y: number, readonly r: number, iconKey: string, label: string, private color: number, badge = false) {
    this.root = scene.add.container(x, y).setScrollFactor(0).setDepth(9050);
    this.face = scene.add.image(0, 0, skinTexture(scene, 'round', r * 2, r * 2, 'up', color));
    this.ic = scene.add.image(0, -r * 0.14, iconKey).setDisplaySize(r * 0.92, r * 0.92);
    this.iconKey = iconKey;
    this.lab = fitWidth(labelAt(scene, 0, r * 0.52, label, S_BTN), r * 1.6);
    this.word = label;
    this.root.add([this.face, this.ic, this.lab]);
    if (badge) {
      this.badge = scene.add.text(r * 0.64, -r * 0.62, '0', { fontFamily: 'Nunito', fontSize: '24px', fontStyle: '900', color: '#fff6e0', stroke: INK, strokeThickness: 5 }).setOrigin(0.5);
      this.root.add(this.badge);
    }
    this.root.setAlpha(0.94);
    const R = r * 1.18;
    this.zone = scene.add.zone(x, y, R * 2, R * 2).setScrollFactor(0).setDepth(9060).setInteractive(new Phaser.Geom.Circle(R, R, R), Phaser.Geom.Circle.Contains);
    this.zone.on('pointerdown', (p: Phaser.Input.Pointer, _x: number, _y: number, ev: Phaser.Types.Input.EventData) => {
      ev?.stopPropagation?.();
      this.presses++;
      this.holdId = p.id;
      this.pop = 0.14;
    });
    const up = (p: Phaser.Input.Pointer) => { if (p.id === this.holdId) { this.holdId = -1; this.releases++; } };
    scene.input.on('pointerup', up);
    scene.input.on('pointerupoutside', up);
  }

  get held(): boolean { return this.holdId >= 0; }
  take(): boolean { const n = this.presses > 0; this.presses = 0; return n; }
  takeRelease(): boolean { const n = this.releases > 0; this.releases = 0; return n; }

  setVisible(on: boolean): void {
    this.root.setVisible(on);
    if (on) this.zone.setInteractive(); else { this.zone.disableInteractive(); this.holdId = -1; this.presses = 0; this.releases = 0; }
  }

  setWord(text: string): void {
    if (text === this.word) return;
    this.word = text;
    const img = labelAt(this.scene, 0, this.r * 0.52, text, S_BTN);
    fitWidth(img, this.r * 1.6);
    this.lab.setTexture(img.texture.key).setScale(img.scaleX);
    img.destroy();
  }

  setIcon(key: string): void { if (key !== this.iconKey) { this.iconKey = key; this.ic.setTexture(key).setDisplaySize(this.r * 0.92, this.r * 0.92); } }

  draw(dt: number, enabled = true, count = -1, ring = -1): void {
    this.pop = Math.max(0, this.pop - dt);
    const tex = skinTexture(this.scene, 'round', this.r * 2, this.r * 2, this.held ? 'down' : enabled ? 'up' : 'off', this.color);
    if (this.face.texture.key !== tex) this.face.setTexture(tex);
    this.root.setScale(1 + this.pop);
    if (this.badge) { this.badge.setVisible(count >= 0); if (count >= 0) { const s = String(count); if (this.badge.text !== s) this.badge.setText(s); } }
    void ring;
  }
}

// ------------------------------------------------------------------ the chips

const iconImg = (s: Phaser.Scene, key: string, size: number) => s.add.image(0, 0, key).setDisplaySize(size, size);
const BAR_W = 170, BAR_H = 14;

export class PlayHud {
  private level: HudChip;
  private rescued: HudChip;
  private detect: HudChip;
  private throws: HudChip;
  private bag: HudChip;
  private disguise: HudChip;
  private swift: HudChip;
  private crew: HudChip;
  private alarm: HudChip;
  private boss: HudChip;
  private bossBar: Phaser.GameObjects.Graphics;
  private shown = { hp: -1, max: -1, coins: -1, res: '', det: '', thr: -1, bag: '', clock: '', alarm: '', bossK: -1 };
  private visible = true;
  private land = isLandscape();

  constructor(private scene: Phaser.Scene, private hud: Hud) {
    makeArt(scene);
    this.level = hudChip(scene, hudRightEdge(scene), HUD_ROW2_Y, { align: 'right', label: '1-1', icon: 'dr-clock', iconSize: 26, text: '0:00', minWidth: 130 });
    this.rescued = hudChip(scene, HUD_MARGIN, HUD_ROW2_Y, { icon: 'dr-person', iconSize: 32, text: '0/0', minWidth: 80 });
    this.detect = hudChip(scene, 0, HUD_ROW2_Y, { icon: 'dr-eye', iconSize: 36, text: t('det_unseen'), minWidth: 120 });
    this.throws = hudChip(scene, 0, HUD_ROW2_Y, { icon: 'dr-vase', iconSize: 30, text: '×1' });
    this.bag = hudChip(scene, 0, HUD_ROW2_Y, { icon: 'dr-smoke', iconSize: 32, text: '×1' });
    this.disguise = hudChip(scene, 0, HUD_ROW2_Y, { icon: 'dr-disguise', iconSize: 32, text: '', minWidth: 60 });
    this.swift = hudChip(scene, 0, HUD_ROW2_Y, { icon: 'dr-swift', iconSize: 32, text: '', minWidth: 60 });
    this.crew = hudChip(scene, 0, HUD_ROW2_Y, { icon: 'dr-crew', iconSize: 32, text: t('crewWait'), color: '#ffd070' });
    this.alarm = hudChip(scene, hudRightEdge(scene), HUD_ROW2_Y, { align: 'right', icon: 'dr-bell', iconSize: 32, text: '0:00', minWidth: 100, color: '#ffb08a' });
    this.bossBar = scene.add.graphics();
    this.bossBar.setData('chipWidth', BAR_W);
    this.boss = hudChip(scene, scene.scale.width / 2, HUD_ROW2_Y + (HUD_ROW2_Y - HUD_ROW_Y), { align: 'center', icon: 'dr-chief', iconSize: 36, items: [this.bossBar], label: t('chiefBar'), minWidth: BAR_W + 70 });
  }

  private all(): HudChip[] { return [this.level, this.rescued, this.detect, this.throws, this.bag, this.disguise, this.swift, this.crew, this.alarm, this.boss]; }

  setVisible(v: boolean): void {
    this.visible = v;
    for (const c of this.all()) c.setVisible(v);
    this.hud.setVisible(v);
    if (v) this.shown = { hp: -1, max: -1, coins: -1, res: '', det: '', thr: -1, bag: '', clock: '', alarm: '', bossK: -1 };
  }

  update(sim: Sim, n: number, time: number): void {
    if (!this.visible) return;
    const h = sim.hero, s = this.shown, sc = this.scene;
    if (h.hp !== s.hp || h.max !== s.max) { s.hp = h.hp; s.max = h.max; this.hud.setLives(Math.max(0, h.hp), h.max); }
    // coins in the core's right slot (beside the hearts)
    if (sim.stats.coins !== s.coins) {
      const more = sim.stats.coins > s.coins && s.coins >= 0;
      s.coins = sim.stats.coins;
      this.hud.setRight(String(s.coins), 'dr-coin');
      if (more) sc.tweens.add({ targets: this.hud.rightChip, scale: 1.12, duration: 70, yoyo: true });
    }
    // the level clock, or the alarm clock in its place
    const esc = sim.alarm && h.state !== 'clear';
    const clock = fmtTime(sim.stats.time);
    if (clock !== s.clock) { s.clock = clock; this.level.setText(clock); this.level.setCaption(levelLabel(n)); }
    const row = this.land ? HUD_ROW_Y : HUD_ROW2_Y;
    const rightX = this.land ? Math.min(this.hud.livesChip.visible ? this.hud.livesChip.left : Infinity, this.hud.rightChip.visible ? this.hud.rightChip.left : Infinity, hudRightEdge(sc)) - HUD_GAP : hudRightEdge(sc);
    this.level.setVisible(!esc);
    this.level.setAnchor(rightX, row, 'right');
    this.alarm.setVisible(esc);
    this.alarm.setAnchor(rightX, row, 'right');
    if (esc) {
      const a = fmtTime(Math.ceil(sim.alarmT));
      if (a !== s.alarm) { s.alarm = a; this.alarm.setText(a); }
      this.alarm.setScale(1 + Math.max(0, Math.sin(time / (sim.alarmT < 15 ? 90 : 160))) * 0.07);
    }
    // the readouts, left to right (the next row when this one fills up)
    let x = this.land ? this.hud.scoreChip.right + HUD_GAP : HUD_MARGIN, y = row;
    const limit = () => (y === row ? (esc ? this.alarm.left : this.level.left) - HUD_GAP : sc.scale.width - HUD_MARGIN);
    const place = (chip: HudChip, on: boolean) => {
      chip.setVisible(on);
      if (!on) return;
      chip.setAnchor(x, y, 'left');
      if (chip.right > limit() && y === row) { x = HUD_MARGIN; y = row + (HUD_ROW2_Y - HUD_ROW_Y); chip.setAnchor(x, y, 'left'); }
      x = chip.right + HUD_GAP;
    };
    const freed = sim.followers.filter((f) => f.mode !== 'cell').length;
    const res = `${freed}/${sim.followers.length}`;
    if (res !== s.res) { const more = s.res !== ''; s.res = res; this.rescued.setText(res); if (more) sc.tweens.add({ targets: this.rescued, scale: 1.22, duration: 120, yoyo: true }); }
    place(this.rescued, true);
    const det = h.state === 'hidden' ? 'hidden' : sim.detection();
    if (det !== s.det) {
      s.det = det;
      this.detect.setText(t('det_' + det));
      this.detect.setIcon(det === 'hidden' ? 'dr-eye-shut' : det === 'seen' ? 'dr-eye-q' : det === 'spotted' ? 'dr-eye-x' : 'dr-eye');
      this.detect.setTextColor(det === 'hidden' ? '#a8ffa0' : det === 'seen' ? '#ffd070' : det === 'spotted' ? '#ff8a70' : '#fff2d8');
    }
    this.detect.setScale(det === 'spotted' ? 1 + Math.max(0, Math.sin(time / 110)) * 0.08 : 1);
    place(this.detect, true);
    const thr = h.throws;
    if (thr !== s.thr) { s.thr = thr; this.throws.setText('×' + thr); }
    place(this.throws, thr > 0);
    const bagKey = h.bag.join(',');
    if (bagKey !== s.bag) { s.bag = bagKey; if (h.bag.length) { this.bag.setIcon(POWER_ICON[h.bag[0]]); this.bag.setText('×' + h.bag.length); } }
    place(this.bag, h.bag.length > 0);
    place(this.disguise, h.disguise > 0);
    if (h.disguise > 0) { this.disguise.setText(Math.ceil(h.disguise) + 's'); this.disguise.setAlpha(h.disguise < 2 ? 0.55 + 0.45 * Math.abs(Math.sin(time / 110)) : 1); }
    place(this.swift, h.swift > 0);
    if (h.swift > 0) { this.swift.setText(Math.ceil(h.swift) + 's'); this.swift.setAlpha(h.swift < 2 ? 0.55 + 0.45 * Math.abs(Math.sin(time / 110)) : 1); }
    place(this.crew, sim.crewWaiting);
    // the Chief's alertness
    const b = sim.boss;
    const showBoss = !!b && !sim.stats.outwit && b.state !== 'fallen' && b.state !== 'locked';
    this.boss.setVisible(showBoss);
    if (showBoss && b) {
      const by = Math.max(y, row) + (HUD_ROW2_Y - HUD_ROW_Y) * (this.land ? 1 : 1);
      this.boss.setAnchor(sc.scale.width / 2, by, 'center');
      const k = b.state === 'chase' || b.state === 'charge' || b.state === 'slam' ? 1 : b.state === 'doze' ? 0 : b.susp;
      if (Math.abs(k - s.bossK) > 0.005 || b.state === 'chase') {
        s.bossK = k;
        const g = this.bossBar.clear(), x0 = -BAR_W / 2;
        g.fillStyle(0x0e0a0c, 0.85).fillRoundedRect(x0, -BAR_H / 2, BAR_W, BAR_H, 6);
        const col = k >= 1 ? 0xe8302a : k > 0.42 ? 0xf0962a : b.state === 'doze' ? 0x8a9ad8 : 0x8ac85a;
        const fl = k >= 1 ? 0.6 + 0.4 * Math.abs(Math.sin(time / 90)) : 1;
        g.fillStyle(col, fl).fillRoundedRect(x0 + 1, -BAR_H / 2 + 1, Math.max(6, (BAR_W - 2) * Math.max(0.04, k)), BAR_H - 2, 5);
        g.lineStyle(2, GOLD, 0.85).strokeRoundedRect(x0, -BAR_H / 2, BAR_W, BAR_H, 6);
      }
    }
  }
}

export function fmtTime(sec: number): string {
  const s = Math.max(0, Math.floor(sec));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}
