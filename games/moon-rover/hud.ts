// Moon Rover: the play HUD and every label the play scene shows, painted ahead in Boot under the
// Ayvago intro (prebakePlay).
//   Portrait: the top row holds the score (core), the hearts (full, half and empty) and the mission
//   clock on the right (clear of the pause button). Second row: the battery (a bar that drains, red
//   and blinking when low, green while charging), the crystals found of the level's, the crew
//   rescued of the level's (with the seats aboard), the supply crates still to deliver, generators
//   left (the miner set-piece), the launch countdown (escape set-pieces) and the carried power.
//   Landscape (desktops and tablets): one row, wrapping to the second when it fills up. Touch: the
//   core's car pad (steering on the left; GAS, BRAKE and POWER on the right), the carried power's
//   icon on the POWER button.
import Phaser from 'phaser';
import {
  t, isLandscape, labelTexture, hudChip, HUD_ROW_Y, HUD_ROW2_Y, HUD_MARGIN, HUD_GAP, hudRightEdge,
  type Hud, type HudChip, type LabelStyle,
} from '@core';
import { ic, makeArt } from './art';
import { INK } from './paint';
import { LEVEL_COUNT, regionIndex, inRegionOf } from './levels';
import { POWER_IDS, POWER_COLOR, REGION_IDS } from './defs';
import type { Sim } from './sim';

export const S_BANNER: LabelStyle = { size: 58, fill: ['#ffffff', '#ffe08a', '#ff9a2a'], stroke: INK, strokeWidth: 9 };
export const S_BIG: LabelStyle = { size: 76, fill: ['#ffffff', '#ffe9a0', '#ff8a1a'], stroke: INK, strokeWidth: 11 };
export const S_SUBBANNER: LabelStyle = { size: 28, color: '#eaf4ff', stroke: INK, strokeWidth: 6 };
export const S_TOAST: LabelStyle = { size: 27, color: '#eaf4ff', stroke: INK, strokeWidth: 6 };
export const S_WARN: LabelStyle = { size: 30, color: '#ffb08a', stroke: INK, strokeWidth: 6 };
export const S_GOOD: LabelStyle = { size: 32, color: '#9affc0', stroke: INK, strokeWidth: 6 };
export const S_LAND: LabelStyle = { size: 40, fill: ['#ffffff', '#c8f4ff', '#4ab8ff'], stroke: INK, strokeWidth: 8 };
export const S_POWER: LabelStyle = { size: 42, fill: ['#ffffff', '#ffe9a0'], stroke: INK, strokeWidth: 8 };
export const S_HINT: LabelStyle = { size: 22, color: '#eaf4ff', stroke: INK, strokeWidth: 5, body: true };

export const TOASTS = ['boarded', 'rescued', 'delivered', 'seatsFull', 'needCargo', 'needGen', 'checkpoint', 'charging', 'charged', 'towed', 'flipped', 'fell', 'good', 'rough',
  'meteors', 'stormEnd', 'alien', 'shielded', 'emp', 'train', 'zap', 'gen0', 'gen1', 'gen2', 'gen3', 'minerHit', 'returnBase', 'toRocket', 'hurtBolt', 'hurtMeteor', 'hurtTrain',
  ...POWER_IDS.map((p) => 'pd_' + p), ...POWER_IDS.map((p) => 'pd_' + p + 'Key')];
export const WARNS = ['lowBattery', 'empty', 'storm', 'timeLow', 'timeUp', 'needCargo', 'needGen', 'seatsFull'];
export const HINTS = ['h_drive', 'h_craters', 'h_ridge', 'h_meteors', 'h_turrets', 'h_gates', 'h_ice', 'h_trains', 'h_storm', 'h_dark', 'tut_drive', 'tut_driveKey', 'tut_air', 'tut_power', 'tut_powerKey'];

export const levelLabel = (n: number): string => t('stageN', { w: regionIndex(n) + 1, n: inRegionOf(n) });

/** Paints the play scene's words ahead (Boot, under the intro). */
export function prebakePlay(scene: Phaser.Scene): void {
  makeArt(scene);
  for (let n = 1; n <= LEVEL_COUNT; n++) { labelTexture(scene, t('l' + n), S_BANNER); labelTexture(scene, levelLabel(n) + '  ·  ' + t('r_' + REGION_IDS[regionIndex(n)]), S_SUBBANNER); }
  for (const k of ['missionDone', 'launch', 'minerOff', 'perfect']) labelTexture(scene, t(k), S_BIG);
  for (const k of ['loseHearts', 'sp_miner', 'sp_escape']) labelTexture(scene, t(k), S_BANNER);
  for (const k of ['sp_minerSub', 'sp_escapeSub']) labelTexture(scene, t(k), S_SUBBANNER);
  labelTexture(scene, t('go'), S_BIG);
  labelTexture(scene, t('perfect'), S_LAND);
  for (const k of TOASTS) labelTexture(scene, t(k), S_TOAST);
  for (const k of WARNS) labelTexture(scene, t(k), S_WARN);
  for (const k of ['rescued', 'delivered', 'alien', 'charged']) labelTexture(scene, t(k), S_GOOD);
  for (const k of HINTS) labelTexture(scene, t(k), S_HINT);
  for (const p of POWER_IDS) labelTexture(scene, t('p_' + p), S_POWER);
}

// ------------------------------------------------------------------ the chips

const img = (s: Phaser.Scene, name: string, size: number) => s.add.image(0, 0, ic(name)).setDisplaySize(size, size);
const BAR_W = 130, BAR_H = 16;

export class PlayHud {
  private hearts: HudChip;
  private heartImgs: Phaser.GameObjects.Image[] = [];
  private level: HudChip;
  private battery: HudChip;
  private bar: Phaser.GameObjects.Graphics;
  private crystals: HudChip;
  private crew: HudChip;
  private seats: Phaser.GameObjects.Image[] = [];
  private cargo: HudChip;
  private gens: HudChip;
  private countdown: HudChip;
  private power: HudChip;
  private shown = { hp: -1, max: -1, clock: '', crys: '', crew: '', aboard: -1, seatsN: -1, cargo: -1, gens: -1, cd: '', power: '' };
  private visible = true;
  private land = isLandscape();

  constructor(private scene: Phaser.Scene, private hud: Hud, private touch: boolean) {
    makeArt(scene);
    for (let i = 0; i < 6; i++) this.heartImgs.push(img(scene, 'heart', 34));
    this.hearts = hudChip(scene, 0, HUD_ROW_Y, { items: this.heartImgs, minWidth: 60 });
    this.level = hudChip(scene, hudRightEdge(scene), HUD_ROW_Y, { align: 'right', label: '1-1', icon: ic('clock'), iconSize: 26, text: '0:00', minWidth: 130 });
    this.bar = scene.add.graphics();
    this.bar.setData('chipWidth', BAR_W);
    this.battery = hudChip(scene, HUD_MARGIN, HUD_ROW2_Y, { icon: ic('battery'), iconSize: 34, items: [this.bar], minWidth: BAR_W + 56 });
    this.crystals = hudChip(scene, 0, HUD_ROW2_Y, { icon: ic('crystal'), iconSize: 30, text: '0/0', minWidth: 80 });
    for (let i = 0; i < 4; i++) this.seats.push(img(scene, 'crew', 18));
    this.crew = hudChip(scene, 0, HUD_ROW2_Y, { icon: ic('crew'), iconSize: 30, text: '0/0', minWidth: 80 });
    this.cargo = hudChip(scene, 0, HUD_ROW2_Y, { icon: ic('crate'), iconSize: 30, text: '×1' });
    this.gens = hudChip(scene, 0, HUD_ROW2_Y, { icon: ic('generator'), iconSize: 30, text: '×3', color: '#ffb08a' });
    this.countdown = hudChip(scene, 0, HUD_ROW2_Y, { icon: ic('rocket'), iconSize: 32, text: '0:00', minWidth: 100, color: '#ffe08a' });
    this.power = hudChip(scene, 0, HUD_ROW2_Y, { icon: ic('p-boost'), iconSize: 34, text: '' });
  }

  private all(): HudChip[] { return [this.hearts, this.level, this.battery, this.crystals, this.crew, this.cargo, this.gens, this.countdown, this.power]; }

  setVisible(v: boolean): void {
    this.visible = v;
    for (const c of this.all()) c.setVisible(v);
    this.hud.setVisible(v);
    if (v) this.shown = { hp: -1, max: -1, clock: '', crys: '', crew: '', aboard: -1, seatsN: -1, cargo: -1, gens: -1, cd: '', power: '' };
  }

  update(sim: Sim, n: number, time: number): void {
    if (!this.visible) return;
    const v = sim.rover, s = this.shown, sc = this.scene;
    // hearts: full, half and empty
    if (v.hp !== s.hp || v.max !== s.max) {
      const lost = v.hp < s.hp && s.hp >= 0;
      s.hp = v.hp; s.max = v.max;
      const cnt = Math.ceil(v.max / 2);
      this.heartImgs.forEach((im, i) => {
        im.setVisible(i < cnt);
        const left = v.hp - i * 2;
        im.setTexture(ic(left >= 2 ? 'heart' : left === 1 ? 'heart-half' : 'heart-empty')).setDisplaySize(34, 34).setPosition(i * 31, 0);
      });
      this.hearts.setItems(this.heartImgs.slice(0, cnt));
      if (lost) sc.tweens.add({ targets: this.hearts, scale: 1.2, duration: 90, yoyo: true });
    }
    if (v.hp <= 2 && v.hp > 0) this.hearts.setScale(1 + Math.max(0, Math.sin(time / 160)) * 0.08);
    this.hearts.setAnchor(this.hud.scoreChip.right + HUD_GAP, HUD_ROW_Y, 'left');
    // the clock
    const clock = fmtTime(sim.stats.time);
    if (clock !== s.clock) { s.clock = clock; this.level.setText(clock); this.level.setCaption(levelLabel(n)); }
    this.level.setAnchor(hudRightEdge(sc), HUD_ROW_Y, 'right');
    // the battery
    const k = Math.max(0, v.battery / v.bmax);
    const low = k < 0.22;
    const g = this.bar.clear(), x0 = -BAR_W / 2;
    g.fillStyle(0x060a14, 0.85).fillRoundedRect(x0, -BAR_H / 2, BAR_W, BAR_H, 6);
    const col = v.charging ? 0x5aff9a : low ? 0xff4a3a : k < 0.45 ? 0xffc040 : 0x4ae08a;
    const fl = low && !v.charging ? 0.5 + 0.5 * Math.abs(Math.sin(time / 110)) : v.charging ? 0.75 + 0.25 * Math.sin(time / 90) : 1;
    if (k > 0) g.fillStyle(col, fl).fillRoundedRect(x0 + 1, -BAR_H / 2 + 1, Math.max(4, (BAR_W - 2) * k), BAR_H - 2, 5);
    g.fillStyle(0xffffff, 0.22).fillRoundedRect(x0 + 3, -BAR_H / 2 + 2, Math.max(2, (BAR_W - 6) * k), 4, 2);
    for (let i = 1; i < 5; i++) g.fillStyle(0x060a14, 0.5).fillRect(x0 + (BAR_W * i) / 5, -BAR_H / 2 + 2, 2, BAR_H - 4);
    g.lineStyle(2, sim.stormK > 0.3 ? 0xff6a3a : 0x9fd8ff, 0.85).strokeRoundedRect(x0, -BAR_H / 2, BAR_W, BAR_H, 6);
    const row = this.land ? HUD_ROW_Y : HUD_ROW2_Y;
    this.battery.setAnchor(this.land ? this.hearts.right + HUD_GAP : HUD_MARGIN, row, 'left');
    // the readouts, left to right (the next row when this one fills up)
    let x = this.battery.right + HUD_GAP, y = row;
    const limit = () => (y === row && this.land ? this.level.left - HUD_GAP : sc.scale.width - HUD_MARGIN);
    const place = (chip: HudChip, on: boolean) => {
      chip.setVisible(on);
      if (!on) return;
      chip.setAnchor(x, y, 'left');
      if (chip.right > limit()) { x = HUD_MARGIN; y += HUD_ROW2_Y - HUD_ROW_Y; chip.setAnchor(x, y, 'left'); }
      x = chip.right + HUD_GAP;
    };
    const cr = `${sim.stats.crystals}/${sim.c.crystals.length}`;
    if (cr !== s.crys) { const more = s.crys !== ''; s.crys = cr; this.crystals.setText(cr); if (more) sc.tweens.add({ targets: this.crystals, scale: 1.18, duration: 100, yoyo: true }); }
    place(this.crystals, sim.c.crystals.length > 0);
    const cw = `${sim.stats.rescued}/${sim.c.astronauts.length}`;
    if (cw !== s.crew || v.aboard !== s.aboard || v.seats !== s.seatsN) {
      const more = s.crew !== '' && cw !== s.crew;
      s.crew = cw; s.aboard = v.aboard; s.seatsN = v.seats;
      this.crew.setText(cw);
      // a small helmet for every seat, lit when taken
      this.seats.forEach((im, i) => { im.setVisible(i < v.seats); im.setAlpha(i < v.aboard ? 1 : 0.28).setPosition(i * 16, 0); });
      this.crew.setItems(this.seats.slice(0, v.seats));
      if (more) sc.tweens.add({ targets: this.crew, scale: 1.2, duration: 110, yoyo: true });
    }
    place(this.crew, sim.c.astronauts.length > 0);
    if (v.cargo !== s.cargo) { s.cargo = v.cargo; this.cargo.setText('×' + v.cargo); }
    place(this.cargo, v.cargo > 0);
    const gl = sim.generators.filter((q) => !q.off).length;
    if (gl !== s.gens) { s.gens = gl; this.gens.setText('×' + gl); }
    place(this.gens, sim.generators.length > 0 && gl > 0);
    if (sim.countdown >= 0 && !sim.launched) {
      const c = fmtTime(Math.ceil(sim.countdown));
      if (c !== s.cd) { s.cd = c; this.countdown.setText(c); }
      this.countdown.setScale(sim.countdown < 15 ? 1 + Math.max(0, Math.sin(time / 120)) * 0.08 : 1);
    }
    place(this.countdown, sim.countdown >= 0 && !sim.launched);
    // the carried power (touch players see it on the POWER button)
    const pw = v.power ?? '';
    if (pw !== s.power) { s.power = pw; if (pw) this.power.setIcon(ic('p-' + pw)); }
    place(this.power, !!pw && !this.touch);
    if (pw) this.power.setAlpha(0.8 + 0.2 * Math.sin(time / 150));
  }
}

export function fmtTime(sec: number): string {
  const s = Math.max(0, Math.floor(sec));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

export { POWER_COLOR };
