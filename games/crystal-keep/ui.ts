// Crystal Keep: the game's own UI pieces in the modern style (glass panels, rounded buttons):
// the build bar, the tower card, the wave button and stars. Fixed to the camera.
import Phaser from 'phaser';
import { txt, t } from '@core';
import { TOWERS, TOWER_KINDS, ENEMIES, POWERS, POWER_IDS, type TowerKind, type Tower, type Sim, type EnemyKind, type TargetMode, type PowerId } from './sim';
import { towerThumb, enemyThumb, meteorThumb } from './thumbs';
import { powerArt } from './art';

export const UI_DEPTH = 9100;

/** A glass panel centred on (0, 0) of a container. */
export function glass(scene: Phaser.Scene, w: number, h: number, o: { r?: number; color?: number; alpha?: number; rim?: number } = {}): Phaser.GameObjects.Graphics {
  const r = o.r ?? 26;
  const g = scene.add.graphics();
  g.fillStyle(0x000000, 0.28).fillRoundedRect(-w / 2, -h / 2 + 8, w, h, r);
  g.fillStyle(o.color ?? 0x14203a, o.alpha ?? 0.9).fillRoundedRect(-w / 2, -h / 2, w, h, r);
  g.fillStyle(0xffffff, 0.06).fillRoundedRect(-w / 2 + 4, -h / 2 + 4, w - 8, h * 0.4, { tl: r - 3, tr: r - 3, bl: 6, br: 6 });
  g.lineStyle(2, o.rim ?? 0xffffff, o.rim ? 0.9 : 0.16).strokeRoundedRect(-w / 2, -h / 2, w, h, r);
  return g;
}

/** A five-pointed star. */
export function drawStar(g: Phaser.GameObjects.Graphics, x: number, y: number, r: number, on: boolean): void {
  const pts: Phaser.Math.Vector2[] = [];
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const rr = i % 2 ? r * 0.45 : r;
    pts.push(new Phaser.Math.Vector2(x + Math.cos(a) * rr, y + Math.sin(a) * rr));
  }
  g.fillStyle(on ? 0xffd23f : 0x3a4560, 1).fillPoints(pts, true);
  g.lineStyle(3, on ? 0xb07a00 : 0x222a40, 1).strokePoints(pts, true);
}

/** A rounded, tappable button with a main label and an optional second line. */
export class Pill extends Phaser.GameObjects.Container {
  private g: Phaser.GameObjects.Graphics;
  readonly main: Phaser.GameObjects.Text;
  readonly sub: Phaser.GameObjects.Text;
  enabled = true;
  private color: number;

  constructor(scene: Phaser.Scene, x: number, y: number, readonly w: number, readonly h: number, color: number, private onTap: () => void, size = 28) {
    super(scene, x, y);
    this.color = color;
    this.g = scene.add.graphics();
    this.main = txt(scene, 0, 0, '', { title: true, size, strokeThickness: 0, shadow: false });
    this.sub = txt(scene, 0, 0, '', { size: Math.round(size * 0.72), color: '#fff3c4', strokeThickness: 0, shadow: false });
    this.add([this.g, this.main, this.sub]);
    this.setSize(w, h).setInteractive({ useHandCursor: true });
    this.on('pointerdown', () => { if (this.enabled) scene.tweens.add({ targets: this, scale: 0.95, duration: 70 }); });
    this.on('pointerout', () => scene.tweens.add({ targets: this, scale: 1, duration: 120 }));
    this.on('pointerup', () => {
      scene.tweens.add({ targets: this, scale: 1, duration: 200, ease: 'Back.easeOut' });
      this.onTap();
    });
    this.draw();
    scene.add.existing(this);
  }

  setColor(c: number): this {
    if (c !== this.color) { this.color = c; this.draw(); }
    return this;
  }

  setEnabled(on: boolean): this {
    if (on !== this.enabled) { this.enabled = on; this.draw(); }
    return this;
  }

  setLabels(main: string, sub = ''): this {
    if (this.main.text !== main) this.main.setText(main);
    if (this.sub.text !== sub) this.sub.setText(sub);
    this.main.y = sub ? -12 : 0;
    this.sub.y = 20;
    this.sub.setVisible(!!sub);
    return this;
  }

  private draw(): void {
    const { w, h } = this;
    const r = Math.min(26, h / 2);
    const c = this.enabled ? this.color : 0x4a5168;
    const dark = Phaser.Display.Color.IntegerToColor(c).darken(22).color;
    const g = this.g.clear();
    g.fillStyle(0x000000, 0.3).fillRoundedRect(-w / 2, -h / 2 + 7, w, h, r);
    g.fillStyle(dark, 1).fillRoundedRect(-w / 2, -h / 2 + 3, w, h, r);
    g.fillStyle(c, 1).fillRoundedRect(-w / 2, -h / 2, w, h, r);
    g.fillStyle(0xffffff, 0.16).fillRoundedRect(-w / 2 + 5, -h / 2 + 4, w - 10, h * 0.42, { tl: r - 4, tr: r - 4, bl: 8, br: 8 });
    g.lineStyle(2, 0xffffff, 0.22).strokeRoundedRect(-w / 2 + 1, -h / 2 + 1, w - 2, h - 2, r);
    this.main.setAlpha(this.enabled ? 1 : 0.7);
  }
}

// ------------------------------------------------------------------ build dock

/** What a dock card arms: a tower to build or one of the keep's powers. */
export type ArmKind = TowerKind | PowerId;
export const isPower = (k: ArmKind | null): k is PowerId => !!k && (POWER_IDS as string[]).includes(k);

interface DockCard {
  kind: ArmKind;
  box: Phaser.GameObjects.Container;
  /** Resting x in the dock. */
  x0: number;
  bg: Phaser.GameObjects.Graphics;
  img: Phaser.GameObjects.Image;
  coin: Phaser.GameObjects.Image | null;
  cost: Phaser.GameObjects.Text;
  cd: Phaser.GameObjects.Graphics;
  cdText: Phaser.GameObjects.Text;
}

export interface PowerState { cd: number; max: number; ready: boolean }

export interface DockState {
  gold: number;
  /** Gold of each tower (cards may make them cheaper). */
  costs: Record<TowerKind, number>;
  armed: ArmKind | null;
  /** A tile is selected and waits for a card (the cards glow). */
  waiting: boolean;
  powers: Partial<Record<PowerId, PowerState>>;
  time: number;
}

/**
 * The build inventory, always open at the bottom of the field: the four towers and the equipped
 * powers. A card is "armed" when picked; the scene then places it where the player clicks or taps.
 * With more powers the cards get narrower, so the dock always fits the screen.
 */
export class BuildDock extends Phaser.GameObjects.Container {
  static W = 696;
  static H = 144;
  static CH = 128;
  cw = 128;
  cards: DockCard[] = [];
  private panel: Phaser.GameObjects.Graphics;
  private info: Phaser.GameObjects.Container;
  private infoBg: Phaser.GameObjects.Graphics;
  private infoText: Phaser.GameObjects.Text;
  private sig = '';
  w = BuildDock.W;
  /** The card under the mouse (desktop), for the info line. */
  hoverKind: ArmKind | null = null;

  constructor(scene: Phaser.Scene, x: number, y: number, private onPick: (k: ArmKind) => void) {
    super(scene, x, y);
    this.panel = scene.add.graphics();
    this.add(this.panel);
    // the panel swallows clicks between the cards, so they never reach the map below
    this.add(scene.add.zone(0, 0, BuildDock.W, BuildDock.H).setInteractive());
    // one line about the armed (or hovered) card, above the dock
    this.info = scene.add.container(0, -BuildDock.H / 2 - 38);
    this.infoBg = scene.add.graphics();
    this.infoText = txt(scene, 0, 0, '', { size: 21, strokeThickness: 0, shadow: false });
    this.info.add([this.infoBg, this.infoText]).setVisible(false);
    this.add(this.info);
    this.setScrollFactor(0, 0, true).setDepth(UI_DEPTH).setVisible(false);
    scene.add.existing(this);
    this.setPowers(['meteor']);
  }

  /** Lays the cards out for the towers and these powers. */
  setPowers(powers: PowerId[]): void {
    for (const c of this.cards) c.box.destroy();
    this.cards = [];
    const kinds: ArmKind[] = [...TOWER_KINDS, ...powers];
    const n = kinds.length, gap = 8;
    const cw = this.cw = Math.min(128, Math.floor((BuildDock.W - 16 - gap * (n - 1)) / n));
    const W = this.w = n * cw + (n - 1) * gap + 16;
    const CH = BuildDock.CH;
    this.panel.clear();
    this.panel.fillStyle(0x000000, 0.28).fillRoundedRect(-W / 2, -BuildDock.H / 2 + 8, W, BuildDock.H, 26);
    this.panel.fillStyle(0x14203a, 0.86).fillRoundedRect(-W / 2, -BuildDock.H / 2, W, BuildDock.H, 26);
    this.panel.fillStyle(0xffffff, 0.06).fillRoundedRect(-W / 2 + 4, -BuildDock.H / 2 + 4, W - 8, BuildDock.H * 0.4, { tl: 23, tr: 23, bl: 6, br: 6 });
    this.panel.lineStyle(2, 0xffffff, 0.16).strokeRoundedRect(-W / 2, -BuildDock.H / 2, W, BuildDock.H, 26);
    const icon = Math.min(88, cw - 22);
    kinds.forEach((kind, i) => {
      const cx = -W / 2 + 8 + cw / 2 + i * (cw + gap);
      const box = this.scene.add.container(cx, 0);
      const bg = this.scene.add.graphics();
      const power = isPower(kind);
      const img = this.scene.add.image(0, -14, this.iconKey(kind)).setDisplaySize(icon, icon);
      const coin = power ? null : this.scene.add.image(0, 43, 'ck-coin').setDisplaySize(22, 22);
      const cost = txt(this.scene, 0, 43, '', { title: true, size: power ? 17 : 21, color: '#ffd23f', strokeThickness: 0, shadow: false });
      if (!power) cost.setOrigin(0, 0.5);
      const key = txt(this.scene, -cw / 2 + 15, -CH / 2 + 15, power ? POWERS[kind].key : String(i + 1), { size: 16, color: '#9fb0d8', strokeThickness: 0, shadow: false });
      const cd = this.scene.add.graphics();
      const cdText = txt(this.scene, 0, -14, '', { title: true, size: 34, strokeThickness: 6 });
      const hit = this.scene.add.zone(0, 0, cw, CH).setInteractive({ useHandCursor: true });
      hit.on('pointerdown', () => this.scene.tweens.add({ targets: box, scale: 0.93, duration: 60 }));
      hit.on('pointerup', () => {
        this.scene.tweens.add({ targets: box, scale: 1, duration: 180, ease: 'Back.easeOut' });
        this.onPick(kind);
      });
      hit.on('pointerover', (p: Phaser.Input.Pointer) => { if (!p.wasTouch) { this.hoverKind = kind; this.sig = ''; } });
      hit.on('pointerout', () => {
        this.scene.tweens.add({ targets: box, scale: 1, duration: 120 });
        if (this.hoverKind === kind) { this.hoverKind = null; this.sig = ''; }
      });
      box.add([bg, img, ...(coin ? [coin] : []), cost, key, cd, cdText, hit]);
      this.add(box);
      this.cards.push({ kind, box, x0: cx, bg, img, coin, cost, cd, cdText });
    });
    this.bringToTop(this.info);
    this.sig = '';
  }

  private iconKey(kind: ArmKind): string {
    return isPower(kind) ? (kind === 'meteor' && !this.scene.textures.exists(powerArt('meteor')) ? meteorThumb() : powerArt(kind)) : towerThumb(kind, 0);
  }

  card(kind: ArmKind): DockCard | undefined {
    return this.cards.find((c) => c.kind === kind);
  }

  /** Picks up the icons rendered after the dock was made. */
  syncIcons(): void {
    const icon = Math.min(88, this.cw - 22);
    for (const c of this.cards) {
      const key = this.iconKey(c.kind);
      if (c.img.texture.key !== key && this.scene.textures.exists(key)) c.img.setTexture(key).setDisplaySize(icon, icon);
    }
  }

  refresh(s: DockState): void {
    const pulse = 0.55 + Math.sin(s.time * 6) * 0.35;
    const cds = Object.entries(s.powers).map(([k, p]) => `${k}${Math.ceil(p!.cd)}${p!.ready}`).join();
    const sig = `${s.gold}|${s.armed}|${s.waiting}|${cds}|${Object.values(s.costs).join()}|${this.hoverKind}|${s.armed || s.waiting ? Math.round(pulse * 8) : 0}`;
    if (sig === this.sig) return;
    this.sig = sig;
    const w = this.cw, h = BuildDock.CH;
    for (const c of this.cards) {
      const power = isPower(c.kind);
      const ps = power ? s.powers[c.kind as PowerId] : undefined;
      const cost = power ? 0 : s.costs[c.kind as TowerKind];
      const ok = ps ? ps.ready : s.gold >= cost;
      const on = s.armed === c.kind;
      const hover = this.hoverKind === c.kind;
      const g = c.bg.clear();
      g.fillStyle(0x000000, 0.25).fillRoundedRect(-w / 2, -h / 2 + 5, w, h, 18);
      g.fillStyle(on ? (power ? POWER_COLOR[c.kind as PowerId] : 0x2f8f4e) : ok ? (hover ? 0x2e4370 : 0x24345a) : 0x262b3b, 1).fillRoundedRect(-w / 2, -h / 2, w, h, 18);
      g.fillStyle(0xffffff, on ? 0.14 : 0.07).fillRoundedRect(-w / 2 + 4, -h / 2 + 4, w - 8, h * 0.4, { tl: 15, tr: 15, bl: 6, br: 6 });
      if (on) g.lineStyle(4, power ? 0xffe0b0 : 0x9dffb8, 0.6 + pulse * 0.4).strokeRoundedRect(-w / 2, -h / 2, w, h, 18);
      else if (s.waiting && ok && !power) g.lineStyle(3, 0xfff3a0, pulse).strokeRoundedRect(-w / 2, -h / 2, w, h, 18);
      else if (ps?.ready) g.lineStyle(3, 0xffd27a, 0.35 + pulse * 0.2).strokeRoundedRect(-w / 2, -h / 2, w, h, 18);
      else g.lineStyle(2, 0xffffff, hover ? 0.4 : 0.14).strokeRoundedRect(-w / 2, -h / 2, w, h, 18);
      c.box.y = on ? -8 : 0;
      c.img.setAlpha(ok || on ? 1 : 0.5);
      if (ps) {
        c.cost.setText(t('ps_' + c.kind)).setColor(ps.ready ? '#ffc27a' : '#9fb0d8');
        c.cost.setScale(Math.min(1, (w - 10) / Math.max(1, c.cost.width)));
        const k = ps.ready || ps.max <= 0 ? 0 : Phaser.Math.Clamp(ps.cd / ps.max, 0, 1);
        const cg = c.cd.clear();
        if (k > 0) {
          const hh = (h - 4) * k;
          cg.fillStyle(0x0b1020, 0.62).fillRoundedRect(-w / 2 + 2, -h / 2 + 2, w - 4, hh, Math.min(16, hh / 2));
        }
        const cdS = Math.ceil(ps.cd);
        c.cdText.setText(ps.cd > 0 && cdS > 0 ? String(cdS) : '').setVisible(ps.cd > 0);
      } else {
        c.cost.setText(String(cost)).setColor(ok ? (on ? '#ffffff' : '#ffd23f') : '#ff7a7a');
        const tw = c.cost.width + 26;
        c.coin!.x = -tw / 2 + 11;
        c.cost.x = c.coin!.x + 15;
      }
    }
    const k = this.hoverKind ?? s.armed;
    if (k) {
      const name = isPower(k) ? t('p_' + k) : t('t_' + k);
      const line = `${name} · ${t('d_' + k)}`;
      if (this.infoText.text !== line) this.infoText.setText(line);
      this.infoText.setScale(Math.min(1, (BuildDock.W - 40) / Math.max(1, this.infoText.width)));
      const iw = Math.min(BuildDock.W, this.infoText.displayWidth + 44);
      this.infoBg.clear().fillStyle(0x0b1020, 0.78).fillRoundedRect(-iw / 2, -22, iw, 44, 22).lineStyle(2, 0xffffff, 0.16).strokeRoundedRect(-iw / 2, -22, iw, 44, 22);
      this.info.setVisible(true);
    } else this.info.setVisible(false);
  }

  /** The card says no: a quick shake with a red rim (not enough gold, power recharging). */
  shake(kind: ArmKind): void {
    const c = this.card(kind);
    if (!c) return;
    const cx = c.x0;
    this.scene.tweens.killTweensOf(c.box);
    c.box.x = cx;
    c.box.setScale(1);
    this.scene.tweens.add({ targets: c.box, x: { from: cx - 9, to: cx }, duration: 260, ease: 'Elastic.easeOut', easeParams: [1.4, 0.25] });
    const red = this.scene.add.graphics();
    red.lineStyle(5, 0xff5a4a, 1).strokeRoundedRect(-this.cw / 2, -BuildDock.CH / 2, this.cw, BuildDock.CH, 18);
    c.box.add(red);
    this.scene.tweens.add({ targets: red, alpha: 0, duration: 420, onComplete: () => red.destroy() });
  }

  open(): void {
    if (this.visible) return;
    this.sig = '';
    this.syncIcons();
    this.setVisible(true).setAlpha(0);
    this.scene.tweens.add({ targets: this, alpha: 1, duration: 160 });
  }

  close(): void {
    this.setVisible(false);
    this.hoverKind = null;
  }
}

/** The armed colour of each power's card. */
export const POWER_COLOR: Record<PowerId, number> = { meteor: 0xb4521f, frost: 0x2f7fbf, lightning: 0xb08a1a, knights: 0x3d5a9e };

// ------------------------------------------------------------------ tower card

const MODE_KEY: Record<TargetMode, string> = { first: 'tm_first', strong: 'tm_strong', close: 'tm_close' };

export class TowerCard extends Phaser.GameObjects.Container {
  static W = 696;
  static H = 262;
  private img: Phaser.GameObjects.Image;
  private title: Phaser.GameObjects.Text;
  private labels: Phaser.GameObjects.Text;
  private values: Phaser.GameObjects.Text;
  private nexts: Phaser.GameObjects.Text;
  private kind: Phaser.GameObjects.Text;
  private record: Phaser.GameObjects.Text;
  private pips: Phaser.GameObjects.Graphics;
  readonly up: Pill;
  readonly sell: Pill;
  readonly mode: Pill;
  private sig = '';

  constructor(scene: Phaser.Scene, x: number, y: number, onUpgrade: () => void, onSell: () => void, onClose: () => void, onMode: () => void) {
    super(scene, x, y);
    const { W, H } = TowerCard;
    this.add(glass(scene, W, H));
    // the panel swallows clicks, so a tap on it never reaches the map below
    this.add(scene.add.zone(0, 0, W, H).setInteractive());
    this.img = scene.add.image(-W / 2 + 84, -46, towerThumb('ballista', 0)).setDisplaySize(132, 132);
    this.mode = new Pill(scene, -W / 2 + 84, 76, 152, 78, 0x3d5a9e, onMode, 19);
    this.title = txt(scene, -W / 2 + 172, -H / 2 + 34, '', { title: true, size: 28, strokeThickness: 0 }).setOrigin(0, 0.5);
    this.pips = scene.add.graphics();
    const col = { size: 21, strokeThickness: 0, align: 'left', shadow: false } as const;
    this.labels = txt(scene, -W / 2 + 172, -H / 2 + 64, '', { ...col, color: '#9fb0d8' }).setOrigin(0, 0).setLineSpacing(6);
    this.values = txt(scene, -W / 2 + 290, -H / 2 + 64, '', { ...col, color: '#ffffff' }).setOrigin(0, 0).setLineSpacing(6);
    this.nexts = txt(scene, -W / 2 + 346, -H / 2 + 64, '', { ...col, color: '#9dffb8' }).setOrigin(0, 0).setLineSpacing(6);
    this.kind = txt(scene, -W / 2 + 172, 52, '', { size: 20, color: '#cfd8f0', strokeThickness: 0, align: 'left', wrap: 300, shadow: false }).setOrigin(0, 0.5);
    this.record = txt(scene, -W / 2 + 172, 90, '', { size: 21, color: '#ffd23f', strokeThickness: 0, align: 'left', shadow: false }).setOrigin(0, 0.5);
    this.up = new Pill(scene, W / 2 - 116, -46, 204, 100, 0x2f9e56, onUpgrade, 24);
    this.sell = new Pill(scene, W / 2 - 116, 70, 204, 84, 0xc8553d, onSell, 22);
    const close = txt(scene, W / 2 - 18, -H / 2 + 14, '×', { size: 34, color: '#9fb0d8', strokeThickness: 0 });
    const closeHit = scene.add.zone(W / 2 - 24, -H / 2 + 20, 84, 84).setInteractive({ useHandCursor: true });
    closeHit.on('pointerup', onClose);
    this.add([this.img, this.mode, this.title, this.pips, this.labels, this.values, this.nexts, this.kind, this.record, this.up, this.sell, close, closeHit]);
    // the close zone sits over the panel corner, the buttons stay below it
    this.bringToTop(this.up);
    this.setScrollFactor(0, 0, true).setDepth(UI_DEPTH).setVisible(false);
    scene.add.existing(this);
  }

  refresh(tw: Tower, sim: Sim, sellArmed: boolean): void {
    const cost = sim.upgradeCost(tw);
    const s = `${tw.id}|${tw.tier}|${sim.gold >= (cost ?? 0)}|${cost}|${sim.cardOrder.length}|${sellArmed}|${tw.kills}|${Math.floor(tw.dealt / 10)}|${tw.mode}`;
    if (s === this.sig) return;
    this.sig = s;
    const def = TOWERS[tw.kind];
    const st = sim.towerStats(tw.kind, tw.tier);
    const nx = tw.tier < 2 ? sim.towerStats(tw.kind, tw.tier + 1) : null;
    this.img.setTexture(towerThumb(tw.kind, tw.tier)).setDisplaySize(132, 132);
    this.title.setText(t('t_' + tw.kind));
    const g = this.pips.clear();
    for (let i = 0; i < 3; i++) drawStar(g, this.title.x + this.title.width + 26 + i * 30, this.title.y, 12, i <= tw.tier);
    const rate = (e: number) => (1 / e).toFixed(1);
    this.labels.setText([t('dmg'), t('rate'), t('range')].join('\n'));
    this.values.setText([String(st.dmg), rate(st.every), st.range.toFixed(1)].join('\n'));
    this.nexts.setText(nx ? [`→ ${nx.dmg}`, `→ ${rate(nx.every)}`, `→ ${nx.range.toFixed(1)}`].join('\n') : '');
    // the next column starts after the widest value
    this.nexts.x = this.values.x + Math.max(48, this.values.width + 14);
    this.kind.setText((def.air ? t('airToo') : t('groundOnly')) + (st.splash ? ' · ' + t('splash') : ''));
    this.record.setText(t('record', { k: tw.kills, d: Math.round(tw.dealt) }));
    this.mode.setLabels(t(MODE_KEY[tw.mode]), t('target'));
    if (cost === null) this.up.setLabels(t('maxLevel')).setEnabled(false);
    else this.up.setLabels(t('upgrade'), `${cost}`).setEnabled(sim.gold >= cost);
    this.sell.setLabels(sellArmed ? t('sure') : t('sell'), `+${sim.refund(tw)}`).setColor(sellArmed ? 0xe0782a : 0xc8553d);
  }

  open(): void {
    this.sig = '';
    if (this.visible) return;
    this.setVisible(true).setAlpha(0);
    this.y += 30;
    this.scene.tweens.add({ targets: this, alpha: 1, y: this.y - 30, duration: 180, ease: 'Quad.easeOut' });
  }

  close(): void { this.setVisible(false); }
}

// ------------------------------------------------------------------ wave button

export class WaveButton extends Phaser.GameObjects.Container {
  readonly pill: Pill;
  private icons: Phaser.GameObjects.Image[] = [];
  private discs: Phaser.GameObjects.Arc[] = [];
  private counts: Phaser.GameObjects.Text[] = [];
  private kindsKey = '';

  constructor(scene: Phaser.Scene, x: number, y: number, w: number, h: number, onTap: () => void) {
    super(scene, x, y);
    this.pill = new Pill(scene, 0, 0, w, h, 0x2f9e56, onTap, 28);
    this.add(this.pill);
    for (let i = 0; i < 4; i++) {
      const disc = scene.add.circle(-w / 2 + 44 + i * 58, -2, 25, 0xc8343c, 0.85).setVisible(false);
      this.discs.push(disc);
      this.add(disc);
      const img = scene.add.image(-w / 2 + 44 + i * 58, -2, enemyThumb('zombie')).setDisplaySize(54, 54).setVisible(false);
      const n = txt(scene, img.x + 20, 22, '', { size: 18, strokeThickness: 4 }).setVisible(false);
      this.icons.push(img);
      this.counts.push(n);
      this.add([img, n]);
    }
    this.setScrollFactor(0, 0, true).setDepth(UI_DEPTH);
    scene.add.existing(this);
  }

  /** Shows the enemy kinds of the coming wave on the button's left. */
  setKinds(kinds: { kind: EnemyKind; count: number }[]): void {
    const k = kinds.map((q) => q.kind + q.count).join(',');
    if (k === this.kindsKey) return;
    this.kindsKey = k;
    const n = Math.min(4, kinds.length);
    this.icons.forEach((img, i) => {
      const on = i < n;
      img.setVisible(on);
      this.counts[i].setVisible(on);
      this.discs[i].setVisible(on && ENEMIES[kinds[i].kind].boss);
      if (on) { img.setTexture(enemyThumb(kinds[i].kind)).setDisplaySize(54, 54); this.counts[i].setText('×' + kinds[i].count); }
    });
    // labels move right of the icons
    const shift = n ? (n * 58) / 2 : 0;
    this.pill.main.x = this.pill.sub.x = shift;
  }
}
