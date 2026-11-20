// Street Heat: the screens inside the Play scene, in the theme's look (theme-panels): the DISPATCH
// board (story jobs, free roam, the two quick modes, the bank), the case file that briefs a job
// (story, objectives, reward, what each star asks), the GARAGE (cars, upgrades, paint) and the end
// of job card. Labels are painted once and cached (labelTexture); only the city lives behind them.
import Phaser from 'phaser';
import {
  t, KitButton, labelAt, fitWidth, Para, GlyphText, themeCard, skinImage, pushModal, bakeButton, labelTexture, glyphAtlas, type LabelStyle,
} from '@core';
import { MISSIONS, type Mode, type MissionDef, type StageDef } from './jobs';
import { CARS, UPGRADES, PAINTS, PAINT_PRICE, carSpec, handling, fmtMoney, mmss, type CarId, type UpgradeId } from './defs';
import { saveMeta, unlocked, type Meta } from './meta';
import { calloutStyle, ORANGE, PINK, CYAN, PAPER_INK, PANEL, caps } from './theme';
import { UI_DEPTH } from './hud';

const HEAD: LabelStyle = { size: 40, fill: ['#ffffff', '#7ff6ff', '#2aa8c0'], stroke: '#1a0b2e', strokeWidth: 7 };
const ROW: LabelStyle = { size: 24, color: '#fff4e2', stroke: '#1a0b2e', strokeWidth: 4, shadow: false };
const ROW_DIM: LabelStyle = { size: 24, color: '#8a7aa8', stroke: '#1a0b2e', strokeWidth: 4, shadow: false };
const INK_TITLE: LabelStyle = { size: 38, color: '#2a1d14', stroke: null, shadow: false };
const INK_BODY: LabelStyle = { size: 22, color: PAPER_INK, stroke: null, shadow: false, body: true };
const INK_SMALL: LabelStyle = { size: 20, color: '#5a3a1a', stroke: null, shadow: false, body: true };
const INK_HEAD: LabelStyle = { size: 22, color: '#c42a2a', stroke: null, shadow: false };
const MONEY: LabelStyle = { size: 30, color: '#ffd23f', stroke: '#1a0b2e', strokeWidth: 5 };
const MONEY_INK: LabelStyle = { size: 30, color: '#1a6a2a', stroke: null, shadow: false };

/** A star criterion line for a mission. */
export function starLines(def: MissionDef, timeK: number): string[] {
  let two: string;
  if (def.star2 > 0) two = t('st2time', { t: mmss(def.star2 * timeK) });
  else if (def.stages.some((s) => s.type === 'tail')) two = t('st2tail');
  else if (def.stages.some((s) => s.type === 'escort')) two = t('st2escort');
  else two = t('st2fast', { t: mmss(150 + def.stages.length * 30) });
  return [t('st1'), two, t('st3')];
}

/** The objective lines of a mission's stages. */
export function goalLines(def: MissionDef): string[] {
  const out: string[] = [];
  for (const s of def.stages) {
    const st = s as StageDef;
    switch (st.type) {
      case 'goto': out.push(t('g_' + st.act, { place: t('pl_' + st.to) })); break;
      case 'checkpoints': out.push(t('g_checks', { n: st.points.length })); break;
      case 'lose': out.push(t('g_lose')); break;
      case 'tail': out.push(t('g_tail')); break;
      case 'chase': out.push(t('g_chase')); break;
      case 'escort': out.push(t('g_escort', { place: t('pl_' + st.to) })); break;
      case 'swap': break;
    }
  }
  return out;
}

export interface DispatchChoice { mode: Mode; mission: number }

/**
 * The dispatch board: modes on the left, the job list in the middle, the case file on the right.
 * `onStart` runs the chosen job; `onGarage` opens the garage.
 */
export class Dispatch {
  readonly root: Phaser.GameObjects.Container;
  private mode: Mode;
  private mission: number;
  private modeBtns = new Map<Mode, KitButton>();
  private list: Phaser.GameObjects.Container;
  private file: Phaser.GameObjects.Container;
  private rows: KitButton[] = [];
  private release: () => void;
  private keys: [string, () => void][] = [];

  constructor(private scene: Phaser.Scene, private meta: Meta, private timeK: number, private onStart: (c: DispatchChoice) => void, private onGarage: () => void, private onMap: () => void, only: 'all' | 'file' = 'all') {
    this.mode = meta.mode;
    this.mission = meta.mission;
    if (!unlocked(meta, this.mission)) this.mission = 1;
    const W = scene.scale.width;
    this.root = scene.add.container(0, 0).setDepth(UI_DEPTH + 100).setScrollFactor(0);
    this.release = pushModal(scene);
    this.list = scene.add.container(0, 0);
    this.file = scene.add.container(0, 0);
    if (only === 'all') {
      // the left column
      this.root.add(fitWidth(labelAt(scene, 165, 70, caps(t('dispatch')), HEAD), 280));
      const modes: Mode[] = ['story', 'roam', 'getaway', 'rush'];
      modes.forEach((m, i) => {
        const b = new KitButton(scene, 165, 150 + i * 84, { w: 270, h: 72, label: t('m_' + m), size: 28, color: 0x8a5aff, sfx: 'ui-click' }, () => this.setMode(m));
        this.modeBtns.set(m, b);
        this.root.add(b);
      });
      const g = new KitButton(scene, 165, 150 + 4 * 84 + 8, { w: 270, h: 72, label: t('garage'), size: 28, color: ORANGE }, () => this.onGarage());
      const mp = new KitButton(scene, 165, 150 + 5 * 84 + 8, { w: 270, h: 60, label: t('map'), size: 24, color: 0x6a5aff }, () => this.onMap());
      this.root.add([g, mp]);
      const plate = skinImage(scene, 165, 670, 'plate', 270, 54);
      const bankL = fitWidth(labelAt(scene, 50, 670, t('bankCash'), ROW, 0), 110);
      const cash = new GlyphText(scene, 280, 672, fmtMoney(meta.cash), MONEY, 1);
      this.root.add([plate, bankL, cash]);
      this.root.add(this.list);
    }
    this.root.add(this.file);
    if (only === 'file') this.file.x = W / 2 - (790 + PANEL.fileW / 2);
    this.setMode(this.mode, only === 'file');
    const kb = scene.input.keyboard;
    if (kb) {
      // listeners, not key objects: the car's controls share those
      const on = (key: string, fn: () => void) => { const h = () => { if (this.root.active) fn(); }; kb.on('keydown-' + key, h); this.keys.push(['keydown-' + key, h]); };
      on('ENTER', () => this.start());
      on('SPACE', () => this.start());
      if (only === 'all') {
        on('UP', () => this.step(-1));
        on('DOWN', () => this.step(1));
        on('LEFT', () => this.cycleMode(-1));
        on('RIGHT', () => this.cycleMode(1));
        on('G', () => this.onGarage());
        on('M', () => this.onMap());
      }
    }
    this.root.setAlpha(0);
    scene.tweens.add({ targets: this.root, alpha: 1, duration: 220 });
  }

  private cycleMode(d: number): void {
    const modes: Mode[] = ['story', 'roam', 'getaway', 'rush'];
    this.setMode(modes[(modes.indexOf(this.mode) + d + 4) % 4]);
  }

  private step(d: number): void {
    if (this.mode !== 'story') { this.cycleMode(d); return; }
    let m = this.mission + d;
    while (m >= 1 && m <= MISSIONS.length && !unlocked(this.meta, m)) m += d;
    if (m >= 1 && m <= MISSIONS.length) this.pick(m);
  }

  private setMode(m: Mode, fileOnly = false): void {
    this.mode = m;
    for (const [k, b] of this.modeBtns) b.setSelected(k === m);
    if (!fileOnly) this.buildList();
    this.buildFile();
  }

  private pick(id: number): void {
    this.mission = id;
    this.rows.forEach((r, i) => r.setSelected(i + 1 === id));
    this.buildFile();
  }

  private buildList(): void {
    const sc = this.scene;
    this.list.removeAll(true);
    this.rows = [];
    const cx = 330 + PANEL.listW / 2, cy = 380;
    this.list.add(themeCard(sc, cx, cy, PANEL.listW, PANEL.listH));
    if (this.mode === 'story') {
      MISSIONS.forEach((m, i) => {
        const open = unlocked(this.meta, m.id);
        const y = cy - PANEL.listH / 2 + 62 + i * 39;
        const label = `${String(m.id).padStart(2, '0')}  ${t(`m${m.id}t`)}`;
        const b = new KitButton(sc, cx, y, { w: PANEL.listW - 50, h: 36, kind: 'plate', color: open ? 0x6a3aa8 : 0x3a3048, sfx: 'ui-click', on: m.id === this.mission, tapWhenOff: false }, () => this.pick(m.id));
        b.addContent(fitWidth(labelAt(sc, -(PANEL.listW - 50) / 2 + 16, 0, label, open ? ROW : ROW_DIM, 0), 260));
        const stars = this.meta.stars[m.id] ?? 0;
        if (open) for (let s = 0; s < 3; s++) b.addContent(sc.add.image((PANEL.listW - 50) / 2 - 70 + s * 26, 0, s < stars ? 'sh-star-on' : 'sh-star-off').setDisplaySize(22, 22));
        else b.addContent(sc.add.image((PANEL.listW - 50) / 2 - 44, 0, 'sh-lock').setDisplaySize(22, 22));
        if (!open) b.setEnabled(false);
        this.rows.push(b);
        this.list.add(b);
      });
    } else {
      const key = this.mode === 'roam' ? 'roam_d' : this.mode === 'getaway' ? 'getaway_d' : 'rush_d';
      const head = fitWidth(labelAt(sc, cx, cy - 210, caps(t('m_' + this.mode)), calloutStyle('#ffb03a', 40)), PANEL.listW - 60);
      const para = new Para(sc, cx - PANEL.listW / 2 + 34, cy - 160, t(key), { size: 24, color: '#2a1d14', stroke: null, shadow: false, body: true }, PANEL.listW - 70, 0, 32);
      const best = this.meta.best[this.mode as 'roam' | 'getaway' | 'rush'] ?? 0;
      const bestL = labelAt(sc, cx, cy + 180, t('bestN', { n: this.mode === 'getaway' ? String(best) : fmtMoney(best) }), INK_HEAD);
      this.list.add([head, para, bestL]);
    }
  }

  private buildFile(): void {
    const sc = this.scene;
    this.file.removeAll(true);
    const cx = 790 + PANEL.fileW / 2, cy = 360;
    this.file.add(themeCard(sc, cx, cy, PANEL.fileW, PANEL.fileH));
    const left = cx - PANEL.fileW / 2 + 36, room = PANEL.fileW - 72;
    let y = cy - PANEL.fileH / 2 + 58;
    const add = (o: Phaser.GameObjects.GameObject) => this.file.add(o);
    if (this.mode === 'story') {
      const def = MISSIONS[this.mission - 1];
      add(fitWidth(labelAt(sc, left, y - 20, caps(t('caseFile')) + ' #' + String(def.id).padStart(2, '0'), INK_HEAD, 0), room));
      add(fitWidth(labelAt(sc, left, y + 16, t(`m${def.id}t`), INK_TITLE, 0), room));
      y += 50;
      const p = new Para(sc, left, y, t(`m${def.id}b`), INK_BODY, room, 0, 28);
      add(p);
      y += p.textHeight + 14;
      add(labelAt(sc, left, y, caps(t('goals')), INK_HEAD, 0));
      y += 26;
      for (const g of goalLines(def)) { add(fitWidth(labelAt(sc, left + 12, y, '› ' + g, INK_SMALL, 0), room - 12)); y += 26; }
      y += 8;
      add(labelAt(sc, left, y, caps(t('starsH')), INK_HEAD, 0));
      y += 26;
      for (const s of starLines(def, this.timeK)) { add(fitWidth(labelAt(sc, left + 12, y, s, INK_SMALL, 0), room - 12)); y += 25; }
      add(labelAt(sc, left, cy + PANEL.fileH / 2 - 120, caps(t('reward')), INK_HEAD, 0));
      add(new GlyphText(sc, left + 120, cy + PANEL.fileH / 2 - 118, fmtMoney(def.pay), MONEY_INK, 0));
    } else {
      const key = 'm_' + this.mode;
      add(fitWidth(labelAt(sc, left, y + 10, t(key), INK_TITLE, 0), room));
      y += 60;
      const p = new Para(sc, left, y, t(this.mode === 'roam' ? 'roam_d' : this.mode === 'getaway' ? 'getaway_d' : 'rush_d'), INK_BODY, room, 0, 28);
      add(p);
    }
    const startB = new KitButton(sc, cx, cy + PANEL.fileH / 2 - 56, { w: 300, h: 76, label: t('start'), size: 34, color: ORANGE, sfx: 'ui-click' }, () => this.start());
    add(startB);
    sc.tweens.add({ targets: startB, scale: 1.04, duration: 600, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
  }

  private start(): void {
    if (!this.root.active) return;
    if (this.mode === 'story' && !unlocked(this.meta, this.mission)) return;
    this.meta.mode = this.mode;
    this.meta.mission = this.mission;
    saveMeta(this.meta);
    const c = { mode: this.mode, mission: this.mission };
    this.close();
    this.onStart(c);
  }

  close(): void {
    if (!this.root.active) return;
    this.release();
    for (const [ev, h] of this.keys) this.scene.input.keyboard?.off(ev, h);
    this.keys = [];
    this.root.destroy();
  }
}

// ------------------------------------------------------------------ the garage

export class Garage {
  readonly root: Phaser.GameObjects.Container;
  private panel: Phaser.GameObjects.Container;
  private cars: KitButton[] = [];
  private sel: CarId;
  private release: () => void;
  private keys: [string, () => void][] = [];
  private cash!: GlyphText;

  constructor(private scene: Phaser.Scene, private meta: Meta, private onChange: () => void, private onClose: () => void) {
    this.sel = meta.car;
    this.root = scene.add.container(0, 0).setDepth(UI_DEPTH + 100).setScrollFactor(0);
    this.release = pushModal(scene);
    this.root.add(fitWidth(labelAt(scene, 165, 70, caps(t('garage')), HEAD), 280));
    CARS.forEach((c, i) => {
      const b = new KitButton(scene, 165, 140 + i * 74, { w: 270, h: 64, label: t('car_' + c.id), size: 26, color: c.id === 'super' || c.id === 'sports' ? PINK : 0x8a5aff, on: c.id === this.sel }, () => this.pick(c.id));
      this.cars.push(b);
      this.root.add(b);
    });
    const back = new KitButton(scene, 165, 140 + 6 * 74 + 20, { w: 270, h: 64, label: t('back'), size: 26, color: 0x6a5aff }, () => this.close());
    this.root.add(back);
    const plate = skinImage(scene, 165, 670, 'plate', 270, 54);
    this.cash = new GlyphText(scene, 280, 672, fmtMoney(meta.cash), MONEY, 1);
    this.root.add([plate, fitWidth(labelAt(scene, 50, 670, t('bankCash'), ROW, 0), 110), this.cash]);
    this.panel = scene.add.container(0, 0);
    this.root.add(this.panel);
    this.build();
    const kb = scene.input.keyboard;
    if (kb) {
      const on = (key: string, fn: () => void) => { const h = () => { if (this.root.active) fn(); }; kb.on('keydown-' + key, h); this.keys.push(['keydown-' + key, h]); };
      on('UP', () => this.stepCar(-1));
      on('DOWN', () => this.stepCar(1));
      on('ENTER', () => this.buyOrSelect());
      on('SPACE', () => this.buyOrSelect());
      on('BACKSPACE', () => this.close());
      on('ESC', () => this.close());
      on('G', () => this.close());
    }
  }

  private stepCar(d: number): void {
    const i = CARS.findIndex((c) => c.id === this.sel);
    this.pick(CARS[(i + d + CARS.length) % CARS.length].id);
  }

  private pick(id: CarId): void {
    this.sel = id;
    this.cars.forEach((b, i) => b.setSelected(CARS[i].id === id));
    if (this.meta.cars.includes(id)) { this.meta.car = id; saveMeta(this.meta); this.onChange(); }
    this.build();
  }

  private buyOrSelect(): void {
    const spec = carSpec(this.sel);
    const owned = this.meta.cars.includes(this.sel);
    const open = spec.unlock === 0 || (this.meta.stars[spec.unlock] ?? 0) > 0;
    if (owned) { this.meta.car = this.sel; saveMeta(this.meta); this.onChange(); this.build(); return; }
    if (!open || this.meta.cash < spec.price) { this.scene.cameras.main.shake(120, 0.004); this.scene.sound.play('sh-deny', { volume: 0.5 }); return; }
    this.meta.cash -= spec.price;
    this.meta.cars.push(this.sel);
    this.meta.car = this.sel;
    saveMeta(this.meta);
    this.scene.sound.play('sh-buy', { volume: 0.6 });
    this.onChange();
    this.build();
  }

  private build(): void {
    const sc = this.scene, m = this.meta;
    this.panel.removeAll(true);
    this.cash.setText(fmtMoney(m.cash));
    const cx = 960, cy = 365, w = PANEL.garageW, h = PANEL.garageH;
    this.panel.add(themeCard(sc, cx, cy, w, h));
    const spec = carSpec(this.sel);
    const hand = handling(spec, m.up);
    const left = cx - w / 2 + 40;
    let y = cy - h / 2 + 64;
    this.panel.add(fitWidth(labelAt(sc, left, y, t('car_' + spec.id), INK_TITLE, 0), 300));
    // stats
    y += 46;
    const stat = (key: string, k: number) => {
      this.panel.add(fitWidth(labelAt(sc, left, y, t(key), INK_SMALL, 0), 150));
      const g = sc.add.graphics();
      g.fillStyle(0x3a2a1a, 0.25).fillRoundedRect(left + 160, y - 8, 300, 16, 7);
      g.fillStyle(ORANGE, 1).fillRoundedRect(left + 160, y - 8, Math.max(8, 300 * Math.min(1, k)), 16, 7);
      this.panel.add(g);
      y += 30;
    };
    stat('st_speed', hand.top / 52);
    stat('st_accel', hand.accel / 15);
    stat('st_grip', hand.grip / 1.5);
    stat('st_armour', hand.hp / 260);
    // buy / select
    const owned = m.cars.includes(spec.id);
    const open = spec.unlock === 0 || (m.stars[spec.unlock] ?? 0) > 0;
    const inUse = m.car === spec.id;
    const label = inUse ? t('inUse') : owned ? t('select') : !open ? t('afterJob', { n: spec.unlock }) : `${t('buy')} ${fmtMoney(spec.price)}`;
    const buy = new KitButton(sc, cx + w / 2 - 130, cy - h / 2 + 64, { w: 220, h: 60, label, size: 22, color: owned ? CYAN : ORANGE, on: inUse, tapWhenOff: true }, () => this.buyOrSelect());
    buy.setEnabled(owned || (open && m.cash >= spec.price));
    this.panel.add(buy);
    if (spec.id === 'taxi') this.panel.add(fitWidth(labelAt(sc, cx, y + 4, t('taxiNote'), INK_SMALL), w - 60));
    y += 34;
    // upgrades (for every car)
    this.panel.add(labelAt(sc, left, y, caps(t('upgrades')), INK_HEAD, 0));
    y += 34;
    for (const u of UPGRADES) {
      const lvl = m.up[u.id];
      this.panel.add(fitWidth(labelAt(sc, left, y, t('up_' + u.id), INK_BODY, 0), 140));
      for (let k = 0; k < 3; k++) {
        const g = sc.add.graphics();
        g.fillStyle(k < lvl ? ORANGE : 0x3a2a1a, k < lvl ? 1 : 0.25).fillRoundedRect(left + 150 + k * 34, y - 10, 28, 20, 5);
        this.panel.add(g);
      }
      const price = u.prices[lvl];
      const b = new KitButton(sc, cx + w / 2 - 110, y, { w: 170, h: 46, label: lvl >= 3 ? t('maxed') : fmtMoney(price), size: 22, color: lvl >= 3 ? 0x5a5470 : 0x2fae5a, tapWhenOff: true }, () => this.upgrade(u.id));
      b.setEnabled(lvl < 3 && m.cash >= price);
      this.panel.add(b);
      y += 54;
    }
    // paint
    y += 4;
    this.panel.add(labelAt(sc, left, y, caps(t('paint')) + ' · ' + fmtMoney(PAINT_PRICE), INK_HEAD, 0));
    y += 44;
    PAINTS.forEach((c, i) => {
      const x = left + 22 + i * 60;
      const g = sc.add.graphics();
      g.fillStyle(0x000000, 0.4).fillCircle(x, y + 3, 23);
      g.fillStyle(c, 1).fillCircle(x, y, 22);
      if (c === m.paint) g.lineStyle(4, CYAN, 1).strokeCircle(x, y, 25);
      g.setInteractive(new Phaser.Geom.Circle(x, y, 28), Phaser.Geom.Circle.Contains);
      g.on('pointerup', () => this.paint(c));
      this.panel.add(g);
    });
  }

  private upgrade(id: UpgradeId): void {
    const m = this.meta, lvl = m.up[id];
    const price = UPGRADES.find((u) => u.id === id)!.prices[lvl];
    if (lvl >= 3 || m.cash < price) { this.scene.cameras.main.shake(120, 0.004); this.scene.sound.play('sh-deny', { volume: 0.5 }); return; }
    m.cash -= price; m.up[id]++;
    saveMeta(m);
    this.scene.sound.play('sh-buy', { volume: 0.6 });
    this.onChange();
    this.build();
  }

  private paint(c: number): void {
    const m = this.meta;
    if (c === m.paint) return;
    if (m.cash < PAINT_PRICE) { this.scene.cameras.main.shake(120, 0.004); this.scene.sound.play('sh-deny', { volume: 0.5 }); return; }
    m.cash -= PAINT_PRICE; m.paint = c;
    saveMeta(m);
    this.scene.sound.play('sh-spray', { volume: 0.6 });
    this.onChange();
    this.build();
  }

  close(): void {
    if (!this.root.active) return;
    this.release();
    for (const [ev, h] of this.keys) this.scene.input.keyboard?.off(ev, h);
    this.keys = [];
    this.root.destroy();
    this.onClose();
  }
}

/**
 * Paints the dispatch board's and the garage's pieces under the Ayvago intro (menuTheme.prebake):
 * the button faces of every size and colour they use and their fixed labels, so opening them
 * mostly places images.
 */
export function prebakeScreens(scene: Phaser.Scene): void {
  for (const [w, h, c] of [[270, 72, 0x8a5aff], [270, 72, ORANGE], [270, 60, 0x6a5aff], [300, 76, ORANGE], [270, 64, 0x8a5aff], [270, 64, PINK], [270, 64, 0x6a5aff], [220, 60, CYAN], [220, 60, ORANGE], [170, 46, 0x2fae5a], [200, 64, 0x6a3aa8]] as [number, number, number][]) bakeButton(scene, 'button', w, h, c, true, true);
  bakeButton(scene, 'plate', PANEL.listW - 50, 36, 0x6a3aa8, true, true);
  bakeButton(scene, 'plate', PANEL.listW - 50, 36, 0x3a3048, true, false);
  labelTexture(scene, caps(t('dispatch')), HEAD);
  labelTexture(scene, caps(t('garage')), HEAD);
  for (const k of ['m_story', 'm_roam', 'm_getaway', 'm_rush', 'garage', 'map', 'back', 'start']) labelTexture(scene, t(k), { size: 28 });
  for (const m of MISSIONS) {
    const open = m.id === 1;
    labelTexture(scene, `${String(m.id).padStart(2, '0')}  ${t(`m${m.id}t`)}`, open ? ROW : ROW_DIM);
  }
  glyphAtlas(scene, MONEY);
  glyphAtlas(scene, MONEY_INK);
}
