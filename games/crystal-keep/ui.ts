// Crystal Keep: the game's own UI pieces in the modern style (glass panels, rounded buttons):
// the build bar, the tower card, the wave button and stars. Fixed to the camera.
import Phaser from 'phaser';
import { txt, t } from '@core';
import { TOWERS, TOWER_KINDS, ENEMIES, type TowerKind, type Tower, type Sim, type EnemyKind } from './sim';
import { towerThumb, enemyThumb } from './thumbs';

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

// ------------------------------------------------------------------ build bar

export class BuildBar extends Phaser.GameObjects.Container {
  private cards: { kind: TowerKind; bg: Phaser.GameObjects.Graphics; cost: Phaser.GameObjects.Text; name: Phaser.GameObjects.Text; img: Phaser.GameObjects.Image; hit: Phaser.GameObjects.Zone }[] = [];
  private sig = '';
  static CW = 164;
  static CH = 196;

  constructor(scene: Phaser.Scene, x: number, y: number, private onPick: (k: TowerKind) => void) {
    super(scene, x, y);
    const W = 4 * BuildBar.CW + 3 * 10 + 20;
    this.add(glass(scene, W, BuildBar.CH + 20));
    TOWER_KINDS.forEach((kind, i) => {
      const cx = -W / 2 + 10 + BuildBar.CW / 2 + i * (BuildBar.CW + 10);
      const bg = scene.add.graphics({ x: cx, y: 0 });
      const img = scene.add.image(cx, -34, towerThumb(kind, 0)).setDisplaySize(118, 118);
      const name = txt(scene, cx, 40, t('t_' + kind), { size: 22, strokeThickness: 0 });
      const cost = txt(scene, cx, 72, '', { title: true, size: 22, color: '#ffd23f', strokeThickness: 0 });
      const key = txt(scene, cx - BuildBar.CW / 2 + 20, -BuildBar.CH / 2 + 22, String(i + 1), { size: 18, color: '#9fb0d8', strokeThickness: 0 });
      const hit = scene.add.zone(cx, 0, BuildBar.CW, BuildBar.CH).setInteractive({ useHandCursor: true });
      hit.on('pointerup', () => this.onPick(kind));
      this.add([bg, img, name, cost, key, hit]);
      this.cards.push({ kind, bg, cost, name, img, hit });
    });
    this.setScrollFactor(0, 0, true).setDepth(UI_DEPTH).setVisible(false);
    scene.add.existing(this);
  }

  refresh(gold: number, pending: TowerKind | null): void {
    const s = `${gold}|${pending}`;
    if (s === this.sig) return;
    this.sig = s;
    for (const c of this.cards) {
      const cost = TOWERS[c.kind].tiers[0].cost;
      const ok = gold >= cost;
      const sel = pending === c.kind;
      const g = c.bg.clear();
      const w = BuildBar.CW, h = BuildBar.CH;
      g.fillStyle(sel ? 0x2f8f4e : ok ? 0x24345a : 0x2a2f40, 1).fillRoundedRect(-w / 2, -h / 2, w, h, 20);
      g.lineStyle(sel ? 4 : 2, sel ? 0x9dffb8 : 0xffffff, sel ? 1 : 0.14).strokeRoundedRect(-w / 2, -h / 2, w, h, 20);
      c.cost.setText(sel ? `${t('build')} ${cost}` : String(cost)).setColor(ok ? (sel ? '#ffffff' : '#ffd23f') : '#ff7a7a');
      c.img.setAlpha(ok ? 1 : 0.55);
      c.name.setAlpha(ok ? 1 : 0.6);
    }
  }

  open(): void {
    if (this.visible) return;
    this.sig = '';
    // the icons are rendered after the bar was made: pick them up
    for (const c of this.cards) {
      const key = towerThumb(c.kind, 0);
      if (c.img.texture.key !== key && this.scene.textures.exists(key)) c.img.setTexture(key).setDisplaySize(118, 118);
    }
    this.setVisible(true).setAlpha(0);
    this.y += 30;
    this.scene.tweens.add({ targets: this, alpha: 1, y: this.y - 30, duration: 180, ease: 'Quad.easeOut' });
  }

  close(): void { this.setVisible(false); }
}

// ------------------------------------------------------------------ tower card

export class TowerCard extends Phaser.GameObjects.Container {
  private img: Phaser.GameObjects.Image;
  private title: Phaser.GameObjects.Text;
  private stats: Phaser.GameObjects.Text;
  private pips: Phaser.GameObjects.Graphics;
  readonly up: Pill;
  readonly sell: Pill;
  private sig = '';

  constructor(scene: Phaser.Scene, x: number, y: number, onUpgrade: () => void, onSell: () => void, onClose: () => void) {
    super(scene, x, y);
    const W = 696, H = 216;
    this.add(glass(scene, W, H));
    this.img = scene.add.image(-W / 2 + 84, -6, towerThumb('ballista', 0)).setDisplaySize(140, 140);
    this.title = txt(scene, -W / 2 + 168, -H / 2 + 34, '', { title: true, size: 28, strokeThickness: 0 }).setOrigin(0, 0.5);
    this.pips = scene.add.graphics();
    this.stats = txt(scene, -W / 2 + 168, 34, '', { size: 21, color: '#cfd8f0', strokeThickness: 0, align: 'left', wrap: 300 }).setOrigin(0, 0.5);
    this.up = new Pill(scene, W / 2 - 128, -40, 196, 88, 0x2f9e56, onUpgrade, 24);
    this.sell = new Pill(scene, W / 2 - 128, 58, 196, 76, 0xc8553d, onSell, 22);
    const close = txt(scene, W / 2 - 18, -H / 2 + 14, '×', { size: 34, color: '#9fb0d8', strokeThickness: 0 });
    const closeHit = scene.add.zone(W / 2 - 24, -H / 2 + 20, 84, 84).setInteractive({ useHandCursor: true });
    closeHit.on('pointerup', onClose);
    this.add([this.img, this.title, this.pips, this.stats, this.up, this.sell, close, closeHit]);
    // the close zone sits over the panel corner, the buttons stay below it
    this.bringToTop(this.up);
    this.setScrollFactor(0, 0, true).setDepth(UI_DEPTH).setVisible(false);
    scene.add.existing(this);
  }

  refresh(tw: Tower, sim: Sim, sellArmed: boolean): void {
    const cost = sim.upgradeCost(tw);
    const s = `${tw.id}|${tw.tier}|${sim.gold >= (cost ?? 0)}|${sellArmed}|${tw.kills}`;
    if (s === this.sig) return;
    this.sig = s;
    const def = TOWERS[tw.kind];
    const st = def.tiers[tw.tier];
    this.img.setTexture(towerThumb(tw.kind, tw.tier)).setDisplaySize(140, 140);
    this.title.setText(t('t_' + tw.kind));
    const g = this.pips.clear();
    for (let i = 0; i < 3; i++) drawStar(g, this.title.x + this.title.width + 26 + i * 30, this.title.y, 12, i <= tw.tier);
    const air = def.air ? t('airToo') : t('groundOnly');
    this.stats.setText(
      `${t('dmg')} ${st.dmg} · ${t('range')} ${st.range.toFixed(1)}\n${t('rate')} ${(1 / st.every).toFixed(1)} · ${air}${st.splash ? '\n' + t('splash') + ' · ' : '\n'}${t('kills')}: ${tw.kills}`,
    );
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
