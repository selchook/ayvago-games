// Monster Roundup: the play HUD, the touch pad and every label the play scene shows, painted ahead in
// Boot under the Ayvago intro (prebakePlay).
//   - Chips (new-game skill §4): the score and the hearts (core), the level and its clock (right, clear
//     of the pause button), the monsters banked of the level's with the quota mark, the sprint energy
//     bar, the combo while it runs, the carried power (keyboard players; touch players see it on the
//     POWER button) and, in a boss level, the boss's bar with its three phase pips. Landscape keeps
//     one row where it fits; portrait stacks a second.
//   - Edge arrows point at loose monsters off screen, at the nearest pod while towing and at the
//     exit once it opens; a monster that was hit shows its daze pips for a moment.
//   - Touch: the core's floating stick on the left half; STUN, TOW / DROP, POWER and the held DASH
//     under the right thumb, discs painted once, a little see-through at rest and solid while held;
//     every finger is read, so walking, sprinting and shooting work together. STUN fills a ring
//     while a charged shot builds.
import Phaser from 'phaser';
import {
  t, isLandscape, labelAt, labelTexture, bake, hudChip, HUD_ROW_Y, HUD_ROW2_Y, HUD_MARGIN, HUD_GAP, hudRightEdge,
  type Hud, type HudChip, type LabelStyle,
} from '@core';
import { ic, makeArt } from './art';
import { INK, css } from './paint';
import { LEVEL_COUNT, sectorIndex, inSectorOf } from './levels';
import { POWER_IDS, BOSS_IDS, MONSTERS, BOSSES, SECTOR_IDS } from './defs';
import type { Sim, Mon } from './sim';

export const S_BANNER: LabelStyle = { size: 58, fill: ['#ffffff', '#c8fff4', '#3ae0c8'], stroke: INK, strokeWidth: 9 };
export const S_BIG: LabelStyle = { size: 76, fill: ['#ffffff', '#ffe9a0', '#ff9a2a'], stroke: INK, strokeWidth: 11 };
export const S_SUBBANNER: LabelStyle = { size: 28, color: '#eaf4ff', stroke: INK, strokeWidth: 6 };
export const S_TOAST: LabelStyle = { size: 27, color: '#eaf4ff', stroke: INK, strokeWidth: 6 };
export const S_WARN: LabelStyle = { size: 30, color: '#ffb08a', stroke: INK, strokeWidth: 6 };
export const S_GOOD: LabelStyle = { size: 32, color: '#9affc0', stroke: INK, strokeWidth: 6 };
export const S_POWER: LabelStyle = { size: 42, fill: ['#ffffff', '#ffe9a0'], stroke: INK, strokeWidth: 8 };
export const S_HINT: LabelStyle = { size: 24, color: '#eaf4ff', stroke: INK, strokeWidth: 5, body: true };
export const S_BOSS: LabelStyle = { size: 64, fill: ['#ffffff', '#ffd0d8', '#ff5a7a'], stroke: INK, strokeWidth: 10 };
const S_BTN: LabelStyle = { size: 22, color: '#ffffff', stroke: INK, strokeWidth: 5 };
const S_BOSSNAME: LabelStyle = { size: 18, color: '#ffd0d8', stroke: INK, strokeWidth: 4 };

export const TOASTS = ['captured', 'spored', 'multi', 'grabbed', 'full', 'heavy', 'woke', 'escaped', 'evolveWarn', 'evolved', 'split', 'blinked', 'squawk', 'glance', 'glanceKey', 'snack', 'handsFull', 'unlocked', 'hacking',
  'teleported', 'vent', 'shielded', 'lowHull', 'bossDazed', 'bossPhase', 'bossDizzy', 'bossFree', 'bossThud', 'exitOpenSub',
  'hurt_laser', 'hurt_turret', 'hurt_bite', 'hurt_spikes', 'hurt_wave', 'hurt_slam', 'hurt_boss', 'hurt_charge', 'hurt_beam', 'hurt_spike', 'hurt_orb', 'hurt_lob',
  ...POWER_IDS.map((p) => 'pd_' + p), ...POWER_IDS.map((p) => 'pd_' + p + 'Key')];
export const WARNS = ['spored', 'evolveWarn', 'full', 'heavy', 'woke', 'escaped', 'lowHull', 'bossFree', 'glance', 'glanceKey', 'handsFull',
  'hurt_laser', 'hurt_turret', 'hurt_bite', 'hurt_spikes', 'hurt_wave', 'hurt_slam', 'hurt_boss', 'hurt_charge', 'hurt_beam', 'hurt_spike', 'hurt_orb', 'hurt_lob'];
export const GOODS = ['multi', 'captured', 'unlocked', 'bossDizzy', 'bossDazed', 'bossThud', 'snack'];
export const HINTS = ['h_tow', 'h_runner', 'h_split', 'h_terminal', 'h_boss', 'h_caller', 'h_leaper', 'h_spore', 'h_lobber', 'h_spiky', 'h_laser', 'h_ice', 'h_blinker', 'h_bite', 'h_sweeper', 'h_evolve',
  'tut_move', 'tut_moveKey', 'tut_stun', 'tut_stunKey', 'tut_tow', 'tut_towKey', 'tut_bank'];

/** A long line in two halves (split at the space nearest the middle), as the toasts draw it. */
export function splitLine(text: string, max = 44): string[] {
  if (text.length <= max) return [text];
  const mid = text.length / 2;
  let best = -1;
  for (let i = 0; i < text.length; i++) if (text[i] === ' ' && (best < 0 || Math.abs(i - mid) < Math.abs(best - mid))) best = i;
  return best < 0 ? [text] : [text.slice(0, best), text.slice(best + 1)];
}

export const levelLabel = (n: number): string => t('stageN', { w: sectorIndex(n) + 1, n: inSectorOf(n) });
export const bossName = (id: string): string => t('b_' + id.replace('-', ''));

// ------------------------------------------------------------------ the touch pad

export type PadId = 'stun' | 'tow' | 'power' | 'dash';
interface PadDef { id: PadId; x: number; y: number; r: number; color: number; label: string; icon: string }

/** The right thumb's buttons, from the bottom-right corner, per orientation (game units). */
export function padDefs(W: number, H: number): PadDef[] {
  if (W > H) return [
    { id: 'stun', x: W - 112, y: H - 128, r: 80, color: 0x3ae0ff, label: 'btnStun', icon: 'combo' },
    { id: 'tow', x: W - 282, y: H - 92, r: 64, color: 0x3ae0c8, label: 'btnTow', icon: 'pod' },
    { id: 'power', x: W - 262, y: H - 262, r: 56, color: 0xc07aff, label: 'btnPower', icon: 'p-freeze' },
    { id: 'dash', x: W - 104, y: H - 312, r: 58, color: 0xffb03a, label: 'btnDash', icon: 'energy' },
  ];
  return [
    { id: 'stun', x: W - 118, y: H - 160, r: 84, color: 0x3ae0ff, label: 'btnStun', icon: 'combo' },
    { id: 'tow', x: W - 294, y: H - 118, r: 66, color: 0x3ae0c8, label: 'btnTow', icon: 'pod' },
    { id: 'power', x: W - 276, y: H - 296, r: 58, color: 0xc07aff, label: 'btnPower', icon: 'p-freeze' },
    { id: 'dash', x: W - 108, y: H - 350, r: 60, color: 0xffb03a, label: 'btnDash', icon: 'energy' },
  ];
}

const discKey = (d: PadDef, on: boolean): string => `mrd-pad-${d.id}-${d.r}-${on ? 1 : 0}`;

function paintDisc(scene: Phaser.Scene, d: PadDef): void {
  for (const on of [false, true]) {
    const s = d.r * 2 + 24;
    bake(scene, discKey(d, on), s, s, (c) => {
      const cx = s / 2, R = d.r;
      c.save();
      c.shadowColor = 'rgba(0,0,0,0.5)'; c.shadowBlur = 10; c.shadowOffsetY = 4;
      c.beginPath(); c.arc(cx, cx, R, 0, Math.PI * 2);
      const g = c.createRadialGradient(cx - R * 0.3, cx - R * 0.4, R * 0.1, cx, cx, R);
      g.addColorStop(0, on ? 'rgba(60,80,120,0.95)' : 'rgba(40,52,80,0.85)'); g.addColorStop(1, on ? 'rgba(16,22,40,0.95)' : 'rgba(10,14,28,0.85)');
      c.fillStyle = g; c.fill();
      c.restore();
      c.lineWidth = on ? 6 : 4; c.strokeStyle = css(d.color);
      c.beginPath(); c.arc(cx, cx, R - 3, 0, Math.PI * 2); c.stroke();
      c.globalAlpha = 0.35; c.lineWidth = 2; c.strokeStyle = '#ffffff';
      c.beginPath(); c.arc(cx, cx, R - 11, Math.PI * 1.1, Math.PI * 1.75); c.stroke();
      c.globalAlpha = 1;
      if (on) { const gg = c.createRadialGradient(cx, cx, 0, cx, cx, R); gg.addColorStop(0, css(d.color, 0.45)); gg.addColorStop(1, css(d.color, 0)); c.fillStyle = gg; c.beginPath(); c.arc(cx, cx, R, 0, Math.PI * 2); c.fill(); }
    });
  }
}

interface Btn { d: PadDef; root: Phaser.GameObjects.Container; disc: Phaser.GameObjects.Image; icon: Phaser.GameObjects.Image; label: Phaser.GameObjects.Image; down: boolean; was: boolean; ptr: number }

export class TouchPad {
  private btns: Btn[] = [];
  private ring: Phaser.GameObjects.Graphics;
  /** 0..1 while a charged shot builds (a ring on STUN). */
  charge = 0;
  private towDrop = false;
  private shown = true;

  constructor(private scene: Phaser.Scene) {
    scene.input.addPointer(4);
    const W = scene.scale.width, H = scene.scale.height;
    for (const d of padDefs(W, H)) {
      paintDisc(scene, d);
      const root = scene.add.container(d.x, d.y).setScrollFactor(0).setDepth(9400);
      const disc = scene.add.image(0, 0, discKey(d, false));
      const icon = scene.add.image(0, -d.r * 0.18, ic(d.icon)).setDisplaySize(d.r * 0.82, d.r * 0.82);
      const label = labelAt(scene, 0, d.r * 0.5, t(d.label), S_BTN);
      if (label.width > d.r * 1.6) label.setScale((d.r * 1.6) / label.width);
      root.add([disc, icon, label]);
      root.setAlpha(0.7);
      const b: Btn = { d, root, disc, icon, label, down: false, was: false, ptr: -1 };
      disc.setInteractive(new Phaser.Geom.Circle(disc.width / 2, disc.height / 2, d.r + 12), Phaser.Geom.Circle.Contains);
      disc.on('pointerdown', (p: Phaser.Input.Pointer, _x: number, _y: number, ev: Phaser.Types.Input.EventData) => { ev?.stopPropagation?.(); b.down = true; b.ptr = p.id; this.look(b); });
      const up = (p: Phaser.Input.Pointer) => { if (p.id === b.ptr || !p.isDown) { b.down = false; b.ptr = -1; this.look(b); } };
      disc.on('pointerup', up);
      disc.on('pointerout', up);
      scene.input.on('pointerup', up);
      this.btns.push(b);
    }
    this.ring = scene.add.graphics().setScrollFactor(0).setDepth(9402);
  }

  private look(b: Btn): void {
    b.disc.setTexture(discKey(b.d, b.down));
    b.root.setScale(b.down ? 0.94 : 1);
  }

  private btn(id: PadId): Btn { return this.btns.find((b) => b.d.id === id)!; }
  held(id: PadId): boolean { return this.btn(id).down; }
  /** Pressed since the last call of `frame()`. */
  pressed(id: PadId): boolean { const b = this.btn(id); return b.down && !b.was; }

  /** Call once per frame after reading the presses: the looks (alpha, the charge ring, the carried power). */
  frame(power: string | null, towDrop: boolean): void {
    for (const b of this.btns) {
      b.was = b.down;
      const base = b.d.id === 'power' && !power ? 0.38 : 0.7;
      b.root.setAlpha(b.down ? 1 : base);
    }
    const pw = this.btn('power');
    const key = ic('p-' + (power ?? 'freeze'));
    if (pw.icon.texture.key !== key) pw.icon.setTexture(key).setDisplaySize(pw.d.r * 0.82, pw.d.r * 0.82);
    if (towDrop !== this.towDrop) {
      this.towDrop = towDrop;
      const tw = this.btn('tow');
      tw.label.destroy();
      tw.label = labelAt(this.scene, 0, tw.d.r * 0.5, t(towDrop ? 'btnDrop' : 'btnTow'), S_BTN);
      if (tw.label.width > tw.d.r * 1.6) tw.label.setScale((tw.d.r * 1.6) / tw.label.width);
      tw.root.add(tw.label);
    }
    const s = this.btn('stun').d;
    this.ring.clear();
    if (this.charge > 0 && this.shown) this.ring.lineStyle(8, this.charge >= 1 ? 0xffe060 : 0x5ae8ff, 1).beginPath().arc(s.x, s.y, s.r + 7, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * Math.min(1, this.charge)).strokePath();
  }

  setVisible(v: boolean): void {
    this.shown = v;
    for (const b of this.btns) { b.root.setVisible(v); if (!v) { b.down = false; b.ptr = -1; this.look(b); } }
    this.ring.setVisible(v);
  }

  /** The buttons' screen boxes (toasts keep clear of them). */
  get top(): number { return Math.min(...this.btns.map((b) => b.d.y - b.d.r)); }
}

/** Paints the play scene's words and the pad ahead (Boot, under the intro). */
export function prebakePlay(scene: Phaser.Scene): void {
  makeArt(scene);
  for (let n = 1; n <= LEVEL_COUNT; n++) { labelTexture(scene, t('l' + n), S_BANNER); labelTexture(scene, levelLabel(n) + '  ·  ' + t('r_' + SECTOR_IDS[sectorIndex(n)]), S_SUBBANNER); }
  for (const k of ['levelDone', 'exitOpen', 'go']) labelTexture(scene, t(k), S_BIG);
  labelTexture(scene, t('loseHull'), S_BANNER);
  labelTexture(scene, t('bossIn'), S_BOSS);
  for (const b of BOSS_IDS) { labelTexture(scene, bossName(b), S_BANNER); labelTexture(scene, bossName(b), S_BOSSNAME); }
  for (const k of TOASTS) for (const line of splitLine(t(k))) labelTexture(scene, line, S_TOAST);
  for (const k of WARNS) for (const line of splitLine(t(k))) labelTexture(scene, line, S_WARN);
  for (const k of GOODS) for (const line of splitLine(t(k))) labelTexture(scene, line, S_GOOD);
  for (const k of HINTS) for (const line of splitLine(t(k))) labelTexture(scene, line, S_HINT);
  for (const p of POWER_IDS) labelTexture(scene, t('p_' + p), S_POWER);
  for (let n = 2; n <= 4; n++) labelTexture(scene, t('combo', { n }), S_POWER);
  for (const k of ['btnStun', 'btnTow', 'btnDrop', 'btnPower', 'btnDash']) labelTexture(scene, t(k), S_BTN);
  for (const d of [...padDefs(1280, 720), ...padDefs(720, 1280)]) paintDisc(scene, d);
}

// ------------------------------------------------------------------ the chips

const BAR_W = 110, BAR_H = 14, BOSS_W = 220;

export class PlayHud {
  private level: HudChip;
  private caught: HudChip;
  private energy: HudChip;
  private bar: Phaser.GameObjects.Graphics;
  private combo: HudChip;
  private power: HudChip;
  private bossChip: HudChip;
  private bossBar: Phaser.GameObjects.Graphics;
  private bossLabel: Phaser.GameObjects.Image | null = null;
  private bossId = '';
  private arrows: Phaser.GameObjects.Image[] = [];
  private pips: Phaser.GameObjects.Graphics;
  private shown = { hp: -1, max: -1, clock: '', caught: '', combo: -1, power: '', quota: false };
  private visible = true;
  private land = isLandscape();

  constructor(private scene: Phaser.Scene, private hud: Hud, private touch: boolean) {
    makeArt(scene);
    this.level = hudChip(scene, hudRightEdge(scene), HUD_ROW_Y, { align: 'right', label: '1-1', icon: ic('clock'), iconSize: 26, text: '0:00', minWidth: 130 });
    this.caught = hudChip(scene, 0, HUD_ROW_Y, { icon: ic('pod'), iconSize: 34, text: '0/0', minWidth: 96 });
    this.bar = scene.add.graphics();
    this.bar.setData('chipWidth', BAR_W);
    this.energy = hudChip(scene, HUD_MARGIN, HUD_ROW2_Y, { icon: ic('energy'), iconSize: 30, items: [this.bar], minWidth: BAR_W + 50 });
    this.combo = hudChip(scene, 0, HUD_ROW2_Y, { icon: ic('combo'), iconSize: 30, text: '×2', color: '#ffe08a' });
    this.power = hudChip(scene, 0, HUD_ROW2_Y, { icon: ic('p-freeze'), iconSize: 34, text: 'Q' });
    this.bossBar = scene.add.graphics();
    this.bossBar.setData('chipWidth', BOSS_W);
    this.bossChip = hudChip(scene, scene.scale.width / 2, HUD_ROW2_Y, { align: 'center', icon: ic('crown'), iconSize: 30, items: [this.bossBar], minWidth: BOSS_W + 60 });
    for (let i = 0; i < 7; i++) this.arrows.push(scene.add.image(0, 0, ic('arrow')).setDisplaySize(34, 34).setScrollFactor(0).setDepth(8990).setVisible(false));
    this.pips = scene.add.graphics().setScrollFactor(0).setDepth(8980);
  }

  private all(): HudChip[] { return [this.level, this.caught, this.energy, this.combo, this.power, this.bossChip]; }

  setVisible(v: boolean): void {
    this.visible = v;
    for (const c of this.all()) c.setVisible(v);
    this.hud.setVisible(v);
    if (!v) { for (const a of this.arrows) a.setVisible(false); this.pips.clear(); }
    if (v) this.shown = { hp: -1, max: -1, clock: '', caught: '', combo: -1, power: '', quota: false };
  }

  update(sim: Sim, n: number, time: number, project: (x: number, y: number, z: number) => { x: number; y: number; visible: boolean }): void {
    if (!this.visible) return;
    const v = sim.mech, s = this.shown, sc = this.scene, W = sc.scale.width, H = sc.scale.height;
    // hearts (core)
    if (v.hp !== s.hp || v.max !== s.max) { s.hp = v.hp; s.max = v.max; this.hud.setLives(v.hp, v.max); }
    // the level and its clock, right
    const clock = fmtTime(sim.stats.time);
    if (clock !== s.clock) { s.clock = clock; this.level.setText(clock); this.level.setCaption(levelLabel(n)); }
    this.level.setTextColor(sim.stats.time > sim.c.par ? '#ffb08a' : '#ffffff');
    const hearts = this.hud.livesChip;
    // landscape: left of the hearts; portrait: the second row's right end
    if (this.land) this.level.setAnchor(hearts.visible ? hearts.left - HUD_GAP : hudRightEdge(sc), HUD_ROW_Y, 'right');
    else this.level.setAnchor(W - HUD_MARGIN, HUD_ROW2_Y, 'right');
    // banked of the level's (green once the quota is met)
    const cg = `${sim.captured}/${sim.c.total}`;
    if (cg !== s.caught) { const more = s.caught !== ''; s.caught = cg; this.caught.setText(cg); if (more) sc.tweens.add({ targets: this.caught, scale: 1.2, duration: 110, yoyo: true }); }
    const q = sim.captured >= sim.c.quota;
    if (q !== s.quota) { s.quota = q; this.caught.setTextColor(q ? '#9affc0' : '#ffffff'); }
    const scoreR = this.hud.scoreChip.right;
    // row 1 (landscape): score, banked, energy; portrait: score, banked; energy on row 2
    let x = scoreR + HUD_GAP;
    // portrait: the banked count opens the second row (the first holds the score and the hearts)
    if (this.land) this.caught.setAnchor(x, HUD_ROW_Y, 'left');
    else this.caught.setAnchor(HUD_MARGIN, HUD_ROW2_Y, 'left');
    x = this.caught.right + HUD_GAP;
    const row2 = !this.land || this.caught.right + HUD_GAP + BAR_W + 60 > this.level.left - HUD_GAP;
    const y2 = row2 ? HUD_ROW2_Y : HUD_ROW_Y;
    this.energy.setAnchor(row2 ? (this.land ? HUD_MARGIN : this.caught.right + HUD_GAP) : x, y2, 'left');
    const k = Math.max(0, v.energy / v.emax);
    const g = this.bar.clear(), x0 = -BAR_W / 2;
    g.fillStyle(0x060a14, 0.85).fillRoundedRect(x0, -BAR_H / 2, BAR_W, BAR_H, 6);
    const col = v.tired > 0 ? 0xff5a3a : v.sprint ? 0x7af0ff : 0x4ab8ff;
    if (k > 0) g.fillStyle(col, v.tired > 0 ? 0.5 + 0.5 * Math.abs(Math.sin(time / 90)) : 1).fillRoundedRect(x0 + 1, -BAR_H / 2 + 1, Math.max(4, (BAR_W - 2) * k), BAR_H - 2, 5);
    g.fillStyle(0xffffff, 0.22).fillRoundedRect(x0 + 3, -BAR_H / 2 + 2, Math.max(2, (BAR_W - 6) * k), 4, 2);
    g.lineStyle(2, 0x9fd8ff, 0.85).strokeRoundedRect(x0, -BAR_H / 2, BAR_W, BAR_H, 6);
    let x2 = this.energy.right + HUD_GAP, yy = y2;
    const place = (chip: HudChip, on: boolean) => {
      chip.setVisible(on);
      if (!on) return;
      chip.setAnchor(x2, yy, 'left');
      const lim = yy === this.level.y ? this.level.left - HUD_GAP : W - HUD_MARGIN;
      if (chip.right > lim) { x2 = HUD_MARGIN; yy += HUD_ROW2_Y - HUD_ROW_Y; chip.setAnchor(x2, yy, 'left'); }
      x2 = chip.right + HUD_GAP;
    };
    if (sim.combo !== s.combo) { const up = sim.combo > s.combo && s.combo > 0; s.combo = sim.combo; this.combo.setText('×' + sim.combo); if (up) sc.tweens.add({ targets: this.combo, scale: 1.3, duration: 120, yoyo: true }); }
    place(this.combo, sim.combo > 1);
    const pw = v.power ?? '';
    if (pw !== s.power) { s.power = pw; if (pw) this.power.setIcon(ic('p-' + pw), undefined, 34); }
    place(this.power, !!pw && !this.touch);
    if (pw) this.power.setAlpha(0.85 + 0.15 * Math.sin(time / 150));
    // the boss's bar
    const b = sim.boss;
    const showBoss = !!b && b.state !== 'gone' && b.state !== 'captured';
    this.bossChip.setVisible(showBoss);
    if (b && showBoss) {
      if (this.bossId !== b.boss) {
        this.bossId = b.boss!;
        this.bossLabel?.destroy();
        this.bossLabel = labelAt(sc, 0, 0, bossName(b.boss!), S_BOSSNAME);
        this.bossChip.setItems([this.bossLabel, this.bossBar]);
      }
      const bg = this.bossBar.clear(), bx = -BOSS_W / 2;
      bg.fillStyle(0x060a14, 0.85).fillRoundedRect(bx, -8, BOSS_W, 16, 6);
      const dizzy = b.state === 'dizzy' || b.state === 'towed';
      const kk = dizzy ? b.dizzy / b.dizzyMax : b.bar / b.barMax;
      bg.fillStyle(dizzy ? 0x6aff8a : b.state === 'b-daze' ? 0xffe060 : 0xff4a6a, 1).fillRoundedRect(bx + 1, -7, Math.max(3, (BOSS_W - 2) * kk), 14, 5);
      for (let p = 0; p < 3; p++) bg.fillStyle(p < b.phase ? 0x4a5262 : p === b.phase ? 0xffd23a : 0xffffff, 1).fillCircle(bx + BOSS_W - 30 + p * 12, -14, 4);
      bg.lineStyle(2, 0xffb0c0, 0.9).strokeRoundedRect(bx, -8, BOSS_W, 16, 6);
      // landscape: the bottom edge's middle (between the thumbs); portrait: under the second row
      this.bossChip.setAnchor(W / 2, this.land ? H - 34 : HUD_ROW2_Y + 62, 'center');
    }
    this.edges(sim, time, project, W, H);
  }

  /** Arrows at the screen's edge for what matters off screen; daze pips over monsters just hit. */
  private edges(sim: Sim, time: number, project: (x: number, y: number, z: number) => { x: number; y: number; visible: boolean }, W: number, H: number): void {
    const v = sim.mech;
    const targets: { x: number; z: number; col: number; key: string }[] = [];
    if (v.towing.length) {
      const pods = [...sim.c.pods, ...(sim.c.field ? [sim.c.field] : [])];
      let best = pods[0], bd = Infinity;
      for (const p of pods) { const d = Math.hypot(p.x - v.x, p.z - v.z); if (d < bd) { bd = d; best = p; } }
      if (best) targets.push({ x: best.x, z: best.z, col: 0x3ae0c8, key: 'pod' });
    }
    if (sim.exitOpen && sim.c.exit) targets.push({ x: sim.c.exit.x, z: sim.c.exit.z, col: 0x5aff9a, key: 'exit' });
    for (const m of sim.mons) {
      if (targets.length >= this.arrows.length) break;
      if (m.state === 'gone' || m.state === 'captured' || m.state === 'towed' || m.state === 'vent') continue;
      targets.push({ x: m.x, z: m.z, col: m.boss ? 0xff4a6a : m.state === 'dizzy' ? 0xffe060 : m.def ? MONSTERS[m.kind!].color : BOSSES[m.boss!].color, key: 'arrow' });
    }
    const pad = 46, top = HUD_ROW2_Y + 40, bottom = H - (this.touch ? 60 : 40);
    let i = 0;
    for (const tg of targets) {
      const p = project(tg.x, 1, tg.z);
      if (p.visible && p.x > 0 && p.x < W && p.y > top && p.y < H) continue;
      const a = this.arrows[i++];
      if (!a) break;
      const cx = W / 2, cy = H / 2;
      let dx = p.x - cx, dy = p.y - cy;
      if (!p.visible) { dx = -dx; dy = -dy; }
      const kx = dx ? ((dx > 0 ? W - pad : pad) - cx) / dx : Infinity, ky = dy ? ((dy > 0 ? bottom : top) - cy) / dy : Infinity;
      const k = Math.min(Math.abs(kx), Math.abs(ky));
      a.setVisible(true).setPosition(cx + dx * k, cy + dy * k).setRotation(Math.atan2(dy, dx) + Math.PI / 2);
      a.setTexture(ic(tg.key === 'arrow' ? 'arrow' : tg.key)).setDisplaySize(tg.key === 'arrow' ? 30 : 42, tg.key === 'arrow' ? 30 : 42);
      if (tg.key !== 'arrow') a.setRotation(0);
      a.setTint(tg.key === 'arrow' ? tg.col : 0xffffff);
      a.setAlpha(0.75 + 0.25 * Math.sin(time / 160));
    }
    for (; i < this.arrows.length; i++) this.arrows[i].setVisible(false);
    // daze pips over a monster hit in the last moments
    const g = this.pips.clear();
    for (const m of sim.mons) {
      if (m.boss || !m.def || !sim.shootable(m) || m.sinceHit > 2.2 || m.maxHp < 2) continue;
      const p = project(m.x, m.y + m.height + 0.4, m.z);
      if (!p.visible) continue;
      const n = m.maxHp, w = 12;
      for (let k = 0; k < n; k++) {
        const px = p.x + (k - (n - 1) / 2) * (w + 4);
        g.fillStyle(0x0b1020, 0.8).fillRoundedRect(px - w / 2 - 2, p.y - 6, w + 4, 12, 4);
        g.fillStyle(k < m.hp ? 0xffd23a : 0x3a4252, 1).fillRoundedRect(px - w / 2, p.y - 4, w, 8, 3);
      }
    }
  }
}

export function fmtTime(sec: number): string {
  const s = Math.max(0, Math.floor(sec));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

export type { Mon };
