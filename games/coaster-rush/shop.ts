// Coaster Rush: the train workshop, opened from the menu (the menu waits under it). Two tabs:
// UPGRADES (eight upgrades in a grid of cards: each with its level pips, what it does now and at
// the next level, and its price) and PAINT (train paints and speed-trail colours). A purchase pops
// the card, fills its pip and throws a little confetti. Touch or mouse on the tabs, cards and
// swatches; keys: arrows pick, Enter buys or uses, Tab (or Q / E) switches the tab, Esc goes back.
// It wears the menu theme (menu.ts): bunting round a night at the fair, the cards little
// marquees ringed with lit bulbs, the tabs and buttons circus tickets, every heading in Sancreek.
// Everything it shows is painted under the Ayvago intro (`prebakeShop`, from main.ts): opening
// it, picking a card or switching a tab only places images.
import Phaser from 'phaser';
import { t, playSfx, burst, getLang, labelTexture, skinTexture, SKIN_PAD, type LabelStyle } from '@core';
import { frameBorder } from '@core/menu-theme';
import { PAINTS as BAGS, TRAILS as CAPS, loadMeta, saveMeta, type Meta } from './meta';
import { UPGRADES, UPGRADE_IDS, UP, BASE, type UpgradeId } from './upgrades';
import { TUNING, KMH } from './defs';
import { TOKEN_ICON as STAMP_ICON, UPGRADE_ICON, makeIcons } from './art';
import { RED as ORANGE, BLUE as INDIGO, GOLD, INK, css, shade, bulb, star } from './menu';
import { bakeTex, bakeButton, bakeFmt, bakePara, glyphAtlas, labelAt, fit, GlyphText, FmtLine, Para, KitButton } from './panels';

type Item = { kind: 'bag' | 'cap'; id: string } | { kind: 'up'; id: UpgradeId };
type Tab = 'up' | 'look';

/** A number for the player's language (TR: a decimal comma). */
const num = (v: number, d = 1): string => {
  const r = Math.round(v * 10 ** d) / 10 ** d;
  const str = Number.isInteger(r) ? String(r) : r.toFixed(d);
  return getLang() === 'tr' ? str.replace('.', ',') : str;
};

/** What an upgrade gives at a level, as the card shows it. */
export function upgradeEffect(id: UpgradeId, lv: number): string {
  switch (id) {
    case 'brakes': return t('ef_brakes', { n: Math.round((BASE.brake + UP.brakes * lv) / BASE.brake * 100) });
    case 'grip': return t('ef_grip', { n: num(TUNING.normal.grip + UP.grip * lv, 2) });
    case 'booster': return t('ef_booster', { n: Math.round(UP.booster * lv * KMH) });
    case 'lift': return t('ef_lift', { n: Math.round((BASE.chain + UP.lift * lv) * KMH) });
    case 'cars': return t('ef_cars', { n: BASE.cars + UP.cars * lv });
    case 'magnet': return t('ef_magnet', { n: BASE.magnetT + UP.magnet * lv });
    case 'safety': return t(lv ? 'ef_safetyOn' : 'ef_safetyOff');
    case 'comfort': return t('ef_comfort', { n: Math.round(UP.comfort * lv * 100) });
  }
}

const COLS = 2;
const CARD_W = 322, CARD_H = 162;
const SW_H = 170;
const cardX = (i: number) => 360 + ((i % COLS) - 0.5) * (CARD_W + 16);
const cardY = (i: number) => 352 + Math.floor(i / COLS) * (CARD_H + 14);
const GREEN = 0x2fae5a, POOR = 0x8a5a62;
/** Room for the name and the line under it, right of the icon. */
const SUB_W = CARD_W - 112;

// the styles (shared with the prebake, so the painted keys match)
const TITLE: LabelStyle = { size: 46, fill: ['#fffbe8', '#ffe27a', '#f6b21c'], stroke: INK, strokeWidth: 8 };
const WALLET: LabelStyle = { size: 30, color: '#fff6e6', stroke: INK };
const TAB: LabelStyle = { size: 30 };
const NAME: LabelStyle = { size: 23, color: INK, stroke: null, shadow: false };
const SUB: LabelStyle = { size: 15, color: '#6a4a3a', stroke: null, shadow: false, body: true };
const EFF: LabelStyle = { size: 17, color: '#2a5fa8', stroke: null, shadow: false, body: true };
const EFF_DONE: LabelStyle = { size: 17, color: '#1f7a3e', stroke: null, shadow: false, body: true };
const PRICE: LabelStyle = { size: 24, color: '#fff6e6', stroke: INK, strokeWidth: 4 };
const BTN_SMALL: LabelStyle = { size: 22 };
const SECTION: LabelStyle = { size: 32, color: '#fff6e6', stroke: INK, strokeWidth: 6 };
const SW_NAME: LabelStyle = { size: 17, color: INK, stroke: null, shadow: false, body: true };
const TAG_WORN: LabelStyle = { size: 21, color: '#1f7a3e', stroke: null, shadow: false };
const TAG_WEAR: LabelStyle = { size: 21, color: '#2a5fa8', stroke: null, shadow: false };
const TAG_OK: LabelStyle = { size: 21, color: '#c41e2e', stroke: null, shadow: false };
const TAG_POOR: LabelStyle = { size: 21, color: '#9a8478', stroke: null, shadow: false };
const POP: LabelStyle = { size: 34, color: '#7dffa0', stroke: INK, strokeWidth: 8 };
const NEED: LabelStyle = { size: 26, color: '#ff9a7a', stroke: INK, strokeWidth: 7 };
const KEYS: LabelStyle = { size: 17, color: '#e0d0c0', stroke: INK, strokeWidth: 3, body: true };
const BTN: LabelStyle = { size: 34 };

const effectLine = (id: UpgradeId, lv: number): string => (lv >= UPGRADES[id].length ? t('shopNow', { v: upgradeEffect(id, lv) }) : `${upgradeEffect(id, lv)}  →  ${upgradeEffect(id, lv + 1)}`);

/** Paints the shop's every texture in the current language (Boot, under the Ayvago intro). */
export function prebakeShop(scene: Phaser.Scene): void {
  skyTexture(scene);
  skinTexture(scene, 'board', 480, 96);
  labelTexture(scene, t('shopTitle'), TITLE);
  bakeButton(scene, 'plate', 240, 58, INDIGO);
  for (const o of [WALLET, PRICE, TAG_OK, TAG_POOR]) glyphAtlas(scene, o);
  bakeButton(scene, 'button', 306, 74, INDIGO);
  bakeButton(scene, 'button', 306, 74, ORANGE, false, true);
  for (const k of ['shopUpgrades', 'shopLooks']) labelTexture(scene, t(k), TAB);
  cardTexture(scene, CARD_W, CARD_H);
  for (const n of [BAGS.length, CAPS.length]) cardTexture(scene, swatchGap(n).cw, SW_H);
  let most = 0;
  for (const id of UPGRADE_IDS) {
    labelTexture(scene, t('up_' + id), NAME);
    bakePara(scene, t('up_' + id + 'Sub'), SUB, SUB_W);
    const max = UPGRADES[id].length;
    most = Math.max(most, max);
    for (let lv = 0; lv <= max; lv++) labelTexture(scene, effectLine(id, lv), lv >= max ? EFF_DONE : EFF);
  }
  for (const c of [GREEN, POOR]) bakeButton(scene, 'button', 128, 46, c);
  bakeButton(scene, 'button', 128, 46, INDIGO, true);
  labelTexture(scene, t('maxed'), BTN_SMALL);
  for (let n = 1; n <= most; n++) labelTexture(scene, t('shopLevelUp', { n }), POP);
  bakeFmt(scene, 'shopNeed', ['n'], NEED);
  for (const k of ['shopPaints', 'shopTrails']) labelTexture(scene, t(k), SECTION);
  for (const b of BAGS) labelTexture(scene, t('paint_' + b.id), SW_NAME);
  for (const c of CAPS) labelTexture(scene, t('trail_' + c.id), SW_NAME);
  labelTexture(scene, t('worn'), TAG_WORN);
  labelTexture(scene, t('wear'), TAG_WEAR);
  labelTexture(scene, t('shopKeys'), KEYS);
  labelTexture(scene, t('back'), BTN);
  bakeButton(scene, 'button', 300, 84, INDIGO);
}

// ------------------------------------------------------------------ the junction card (in play)

const FORK_ON: LabelStyle = { size: 28, color: '#ffe27a', stroke: INK, strokeWidth: 5 };
const FORK_OFF: LabelStyle = { size: 28, color: '#e8dcd0', stroke: INK, strokeWidth: 5 };
const forkText = (arrow: string, key: string): string => `${arrow}  ${t(key)}`;

/** Paints the junction card's tickets and words ahead (PlayScene.forkCard, keyboards only). */
export function prebakeFork(scene: Phaser.Scene): void {
  skinTexture(scene, 'plate', 260, 76, 'on', ORANGE);
  skinTexture(scene, 'plate', 260, 76, 'up', INDIGO);
  for (const a of ['←', '→']) for (const k of ['thrill', 'safe']) for (const o of [FORK_ON, FORK_OFF]) labelTexture(scene, forkText(a, k), o);
}

/**
 * The junction card on keyboards: two tickets naming the branches (← and →), the one picked red
 * with a gold rule. Only places images painted in Boot; a little see-through, so the ride shows.
 */
export function forkTickets(scene: Phaser.Scene, c: Phaser.GameObjects.Container, chosen: number, ltKey: string, rtKey: string): void {
  const mk = (x: number, key: string, sel: boolean, arrow: string) => {
    c.add(scene.add.image(x, SKIN_PAD / 2, skinTexture(scene, 'plate', 260, 76, sel ? 'on' : 'up', sel ? ORANGE : INDIGO)).setAlpha(sel ? 0.96 : 0.8));
    c.add(fit(labelAt(scene, x, 0, forkText(arrow, key), sel ? FORK_ON : FORK_OFF), 236));
  };
  mk(-150, ltKey, chosen > 0, '←');
  mk(150, rtKey, chosen < 0, '→');
}

/** A night at the fair behind the workshop: deep blue to a warm glow of lights (a small gradient, scaled up). */
function skyTexture(scene: Phaser.Scene): string {
  return bakeTex(scene, 'cr-shop-sky', 8, 128, (c) => {
    const g = c.createLinearGradient(0, 0, 0, 128);
    g.addColorStop(0, '#0a0f24'); g.addColorStop(0.55, '#1a2050'); g.addColorStop(0.85, '#3a2048'); g.addColorStop(1, '#6a2a30');
    c.fillStyle = g; c.fillRect(0, 0, 8, 128);
  });
}

const PAD = 14;

/**
 * A little fairground marquee as a card: a cream panel with faint red stripes in a red frame
 * ringed with lit bulbs, gold rules and gold star rosettes in the corners. Painted once per size
 * (cached).
 */
function cardTexture(scene: Phaser.Scene, w: number, h: number): string {
  return bakeTex(scene, `cr-marquee-${w}x${h}`, w + PAD * 2, h + PAD * 3, (c) => {
    c.translate(PAD, PAD);
    const R = 12, band = 11;
    const outer = new Path2D(); outer.roundRect(0, 0, w, h, R);
    c.save();
    c.shadowColor = 'rgba(0,0,0,0.6)'; c.shadowBlur = 12; c.shadowOffsetY = 6;
    c.fillStyle = '#000'; c.fill(outer);
    c.restore();
    const red = c.createLinearGradient(0, 0, 0, h);
    red.addColorStop(0, css(shade(ORANGE, 0.12))); red.addColorStop(1, css(shade(ORANGE, -0.3)));
    c.fillStyle = red; c.fill(outer);
    const inner = new Path2D(); inner.roundRect(band, band, w - band * 2, h - band * 2, 6);
    const cream = c.createLinearGradient(0, band, 0, h - band);
    cream.addColorStop(0, '#fff8e8'); cream.addColorStop(1, '#f4e2c0');
    c.fillStyle = cream; c.fill(inner);
    c.save(); c.clip(inner);
    for (let x = band, i = 0; x < w - band; x += 22, i++) if (i % 2) { c.fillStyle = 'rgba(212,42,54,0.05)'; c.fillRect(x, band, 22, h - band * 2); }
    c.restore();
    c.lineWidth = 2; c.strokeStyle = css(shade(GOLD, -0.1)); c.stroke(inner);
    c.lineWidth = 2.5; c.strokeStyle = css(shade(ORANGE, -0.65)); c.stroke(outer);
    // the bulbs along the frame, gold rosettes in the corners
    const nx = Math.max(2, Math.round((w - band) / 24)), ny = Math.max(2, Math.round((h - band) / 24));
    for (let i = 1; i < nx; i++) { bulb(c, band / 2 + ((w - band) * i) / nx, band / 2, 3); bulb(c, band / 2 + ((w - band) * i) / nx, h - band / 2, 3); }
    for (let i = 1; i < ny; i++) { bulb(c, band / 2, band / 2 + ((h - band) * i) / ny, 3); bulb(c, w - band / 2, band / 2 + ((h - band) * i) / ny, 3); }
    for (const [x, y] of [[band / 2, band / 2], [w - band / 2, band / 2], [band / 2, h - band / 2], [w - band / 2, h - band / 2]]) {
      c.fillStyle = css(shade(GOLD, -0.1));
      c.beginPath(); c.arc(x, y, 7, 0, Math.PI * 2); c.fill();
      c.strokeStyle = css(shade(GOLD, -0.6)); c.lineWidth = 1.5; c.stroke();
      star(c, x, y, 5, '#fff6d0');
    }
  });
}

const stampCard = (scene: Phaser.Scene, w: number, h: number): Phaser.GameObjects.Image => scene.add.image(0, PAD / 2, cardTexture(scene, w, h));
/** A swatch row's spacing and card width (six paints, five trails). */
const swatchGap = (n: number): { gap: number; cw: number } => { const gap = Math.min(128, 560 / (n - 1)); return { gap, cw: Math.round(Math.min(112, gap - 8)) }; };

export class ShopScene extends Phaser.Scene {
  private meta!: Meta;
  private root!: Phaser.GameObjects.Container;
  private body!: Phaser.GameObjects.Container;
  private stampsText!: GlyphText;
  private stampChip!: Phaser.GameObjects.Container;
  private tabs: { id: Tab; b: KitButton }[] = [];
  private tab: Tab = 'up';
  private items: Item[] = [];
  private sel = 0;
  private closed = false;
  private from = 'Menu';
  private changed = false;
  /** The card or swatch of each item as drawn (the purchase pop). */
  private cellOf = new Map<string, Phaser.GameObjects.Container>();

  constructor() { super('Shop'); }

  create(data: { from?: string }): void {
    this.from = data?.from ?? 'Menu';
    this.meta = loadMeta();
    this.closed = false;
    this.changed = false;
    this.tab = 'up';
    makeIcons(this);
    const { width, height } = this.scale;
    this.root = this.add.container(0, 0);
    this.root.add(this.add.image(0, 0, skyTexture(this)).setOrigin(0).setDisplaySize(width, height).setInteractive());
    this.root.add(frameBorder(this));
    // the title on a street sign
    this.root.add(this.add.image(width / 2, 84 + SKIN_PAD / 2, skinTexture(this, 'board', 480, 96)));
    this.root.add(fit(labelAt(this, width / 2, 84, t('shopTitle'), TITLE), 420));
    const chip = this.add.container(width / 2, 164);
    chip.add(this.add.image(0, SKIN_PAD / 2, skinTexture(this, 'plate', 240, 58, 'up', INDIGO)));
    chip.add(this.add.image(-80, 0, STAMP_ICON).setDisplaySize(36, 36));
    this.stampsText = new GlyphText(this, 14, 0, '', WALLET);
    chip.add(this.stampsText);
    this.stampChip = chip;
    this.root.add(chip);
    // the tabs
    this.tabs = (['up', 'look'] as Tab[]).map((id, i) => {
      const b = new KitButton(this, width / 2 + (i - 0.5) * 318, 240, { w: 306, h: 74, color: INDIGO, label: t(id === 'up' ? 'shopUpgrades' : 'shopLooks'), style: TAB, sfx: null }, () => this.setTab(id));
      this.root.add(b);
      return { id, b };
    });
    this.body = this.add.container(0, 0);
    this.root.add(this.body);
    const back = new KitButton(this, width / 2, 1204, { w: 300, h: 84, color: INDIGO, label: t('back'), style: BTN }, () => this.close());
    this.root.add(back);
    if (!this.sys.game.device.input.touch) this.root.add(fit(labelAt(this, width / 2, 1142, t('shopKeys'), KEYS), width - 80));
    this.setTab('up', true);
    this.input.keyboard?.on('keydown', (e: KeyboardEvent) => {
      if (this.closed) return;
      const n = this.items.length;
      if (e.code === 'Tab' || e.code === 'KeyQ' || e.code === 'KeyE') { e.preventDefault(); this.setTab(this.tab === 'up' ? 'look' : 'up'); return; }
      if (e.code === 'ArrowRight' || e.code === 'KeyD') this.select((this.sel + 1) % n);
      else if (e.code === 'ArrowLeft' || e.code === 'KeyA') this.select((this.sel - 1 + n) % n);
      else if (e.code === 'ArrowDown' || e.code === 'KeyS') this.select(this.vertical(1));
      else if (e.code === 'ArrowUp' || e.code === 'KeyW') this.select(this.vertical(-1));
      else if (e.code === 'Enter' || e.code === 'Space') this.act(this.items[this.sel]);
      else if (e.code === 'Escape' || e.code === 'Backspace') this.close();
    });
    this.root.setAlpha(0);
    this.tweens.add({ targets: this.root, alpha: 1, duration: 160 });
  }

  private setTab(id: Tab, first = false): void {
    if (id === this.tab && !first) return;
    this.tab = id;
    this.items = id === 'up'
      ? UPGRADE_IDS.map((u) => ({ kind: 'up' as const, id: u }))
      : [...BAGS.map((b) => ({ kind: 'bag' as const, id: b.id })), ...CAPS.map((c) => ({ kind: 'cap' as const, id: c.id }))];
    this.sel = id === 'up' ? 0 : Math.max(0, BAGS.findIndex((b) => b.id === this.meta.paint));
    if (!first) playSfx(this, 'ui-click');
    this.drawTabs();
    this.draw();
    this.body.setAlpha(0);
    this.tweens.add({ targets: this.body, alpha: 1, duration: 140 });
  }

  private drawTabs(): void {
    for (const { id, b } of this.tabs) b.setLook(id === this.tab ? ORANGE : INDIGO, id === this.tab);
  }

  /** Up or down a row in the grid (upgrades) or between the satchels and the caps. */
  private vertical(d: number): number {
    const it = this.items[this.sel];
    if (this.tab === 'up') {
      const j = this.sel + d * COLS;
      return j >= 0 && j < this.items.length ? j : this.sel;
    }
    const rows = ['bag', 'cap'];
    const r = clampI(rows.indexOf(it.kind) + d, 0, 1);
    const col = this.items.filter((q) => q.kind === it.kind).findIndex((q) => q.id === it.id);
    const row = this.items.map((q, i) => ({ q, i })).filter(({ q }) => q.kind === rows[r]);
    return row[Math.min(col, row.length - 1)]?.i ?? this.sel;
  }

  private select(i: number): void {
    if (i === this.sel) return;
    this.sel = i;
    playSfx(this, 'ui-click');
    this.draw();
  }

  private price(it: Item): number {
    if (it.kind === 'bag') return BAGS.find((b) => b.id === it.id)!.price;
    if (it.kind === 'cap') return CAPS.find((c) => c.id === it.id)!.price;
    const id = it.id as UpgradeId, lv = this.meta.upgrades[id];
    return lv >= UPGRADES[id].length ? Infinity : UPGRADES[id][lv];
  }

  private owned(it: Item): boolean {
    if (it.kind === 'bag') return this.meta.paints.includes(it.id);
    if (it.kind === 'cap') return this.meta.trails.includes(it.id);
    return false;
  }

  private act(it: Item): void {
    const m = this.meta;
    const key = it.kind + ':' + it.id;
    if (it.kind !== 'up' && this.owned(it)) {
      if (it.kind === 'bag') m.paint = it.id; else m.trail = it.id;
      playSfx(this, 'ui-select');
    } else {
      const p = this.price(it);
      if (!isFinite(p) || m.tokens < p) {
        playSfx(this, 'shopNo');
        this.cameras.main.shake(120, 0.004);
        const cell = this.cellOf.get(key);
        if (cell) this.tweens.add({ targets: cell, x: cell.x + 10, duration: 50, yoyo: true, repeat: 2 });
        if (isFinite(p)) this.floatText(cell, new FmtLine(this, 0, 0, NEED).set('shopNeed', { n: p - m.tokens }));
        return;
      }
      m.tokens -= p;
      if (it.kind === 'bag') { m.paints.push(it.id); m.paint = it.id; }
      else if (it.kind === 'cap') { m.trails.push(it.id); m.trail = it.id; }
      else m.upgrades[it.id as UpgradeId]++;
      playSfx(this, 'shopBuy');
      if (it.kind === 'up') playSfx(this, 'levelUp', { volume: 0.5 });
      this.changed = true;
      saveMeta(m);
      this.draw();
      this.purchasePop(key, it.kind === 'up' ? m.upgrades[it.id as UpgradeId] : 0);
      return;
    }
    this.changed = true;
    saveMeta(m);
    this.draw();
  }

  /** The bought card pops, its pips fill, confetti flies and the stamps chip ticks down. */
  private purchasePop(key: string, level: number): void {
    const cell = this.cellOf.get(key);
    if (!cell) return;
    cell.setScale(1.12);
    this.tweens.add({ targets: cell, scale: 1, duration: 380, ease: 'Back.easeOut' });
    const wx = cell.x, wy = cell.y;
    burst(this, wx, wy, [0xffd23f, 0x7dffa0, 0xffffff, 0xff9a4a], 34, 420);
    const fw = key.startsWith('up:') ? CARD_W : swatchGap(key.startsWith('bag:') ? BAGS.length : CAPS.length).cw, fh = key.startsWith('up:') ? CARD_H : SW_H;
    const flashR = this.add.graphics().setPosition(wx, wy);
    flashR.fillStyle(0xffffff, 0.45).fillRoundedRect(-fw / 2, -fh / 2, fw, fh, 10);
    this.tweens.add({ targets: flashR, alpha: 0, duration: 320, onComplete: () => flashR.destroy() });
    if (level) this.floatText(cell, labelAt(this, 0, 0, t('shopLevelUp', { n: level }), POP));
    this.tweens.add({ targets: this.stampChip, scale: 1.15, duration: 110, yoyo: true });
  }

  /** A word (painted ahead) pops over a card and floats away. */
  private floatText(cell: Phaser.GameObjects.Container | undefined, w: Phaser.GameObjects.Image | FmtLine): void {
    const x = cell?.x ?? this.scale.width / 2, y = (cell?.y ?? 600) - 40;
    w.setPosition(x, y).setDepth(50);
    w.setScale(0.5);
    this.tweens.add({ targets: w, scale: 1, duration: 160, ease: 'Back.easeOut' });
    this.tweens.add({ targets: w, y: y - 60, alpha: 0, delay: 600, duration: 400, onComplete: () => w.destroy() });
  }

  private draw(): void {
    const b = this.body;
    b.removeAll(true);
    this.cellOf.clear();
    this.stampsText.setText(String(this.meta.tokens));
    if (this.tab === 'up') this.drawUpgrades(); else this.drawLooks();
  }

  private drawUpgrades(): void {
    const m = this.meta, b = this.body;
    this.items.forEach((it, i) => {
      if (it.kind !== 'up') return;
      const id = it.id;
      const lv = m.upgrades[id], max = UPGRADES[id].length, done = lv >= max;
      const sel = i === this.sel;
      const p = this.price(it), afford = !done && m.tokens >= p;
      const c = this.add.container(cardX(i), cardY(i));
      c.add(stampCard(this, CARD_W, CARD_H));
      // the pick: an amber ring round the stamp; a finished one a green rule inside
      if (sel) c.add(this.add.graphics().lineStyle(5, 0xffcf4a, 1).strokeRoundedRect(-CARD_W / 2 - 5, -CARD_H / 2 - 5, CARD_W + 10, CARD_H + 10, 12));
      if (done) c.add(this.add.graphics().lineStyle(3, 0x2fae5a, 1).strokeRect(-CARD_W / 2 + 11, -CARD_H / 2 + 11, CARD_W - 22, CARD_H - 22));
      const L = -CARD_W / 2 + 22;
      c.add(this.add.graphics().fillStyle(INDIGO, 1).fillCircle(L + 28, -CARD_H / 2 + 50, 28).lineStyle(2, 0xe8692a, 1).strokeCircle(L + 28, -CARD_H / 2 + 50, 25));
      c.add(this.add.image(L + 28, -CARD_H / 2 + 50, UPGRADE_ICON(id)).setDisplaySize(42, 42));
      c.add(fit(labelAt(this, L + 66, -CARD_H / 2 + 34, t('up_' + id), NAME, 0), SUB_W));
      // what it does (up to two lines under the name)
      c.add(new Para(this, L + 66, -CARD_H / 2 + 46, t('up_' + id + 'Sub'), SUB, SUB_W, 0, 17));
      // now → next
      c.add(fit(labelAt(this, L, 16, effectLine(id, lv), done ? EFF_DONE : EFF, 0), CARD_W - 44));
      // level pips
      const pips = this.add.graphics();
      for (let k = 0; k < max; k++) {
        pips.fillStyle(k < lv ? GREEN : 0x4a0a12, k < lv ? 1 : 0.16).fillRoundedRect(L + k * 28, CARD_H / 2 - 36, 22, 12, 6);
        if (k < lv) pips.lineStyle(1.5, 0x1f6a3a, 1).strokeRoundedRect(L + k * 28, CARD_H / 2 - 36, 22, 12, 6);
      }
      c.add(pips);
      // the price
      const btn = new KitButton(this, CARD_W / 2 - 80, CARD_H / 2 - 32, { w: 128, h: 46, color: done ? INDIGO : afford ? GREEN : POOR, style: BTN_SMALL, sfx: null }, () => { this.sel = i; this.act(it); });
      if (done) btn.setLabel(t('maxed')).setEnabled(false);
      else {
        const price = new GlyphText(this, 14, 0, String(p), PRICE);
        btn.addContent(price, this.add.image(14 - price.textWidth / 2 - 16, 0, STAMP_ICON).setDisplaySize(24, 24));
      }
      c.add(btn);
      c.setSize(CARD_W, CARD_H).setInteractive({ useHandCursor: true }).on('pointerup', () => { if (this.sel !== i) this.select(i); });
      b.add(c);
      this.cellOf.set('up:' + id, c);
    });
  }

  private drawLooks(): void {
    const m = this.meta, b = this.body;
    const section = (y: number, key: string) => b.add(labelAt(this, 60, y, t(key), SECTION, 0));
    section(318, 'shopPaints');
    section(608, 'shopTrails');
    const swatchRow = (kind: 'bag' | 'cap', y: number) => {
      const list = kind === 'bag' ? BAGS : CAPS;
      list.forEach((q, i) => {
        const it: Item = { kind, id: q.id };
        const { gap, cw } = swatchGap(list.length);
        const x = 360 - gap * (list.length - 1) / 2 + i * gap;
        const idx = this.items.findIndex((v) => v.kind === kind && v.id === q.id);
        const sel = idx === this.sel;
        const worn = kind === 'bag' ? m.paint === q.id : m.trail === q.id;
        const own = this.owned(it);
        const c = this.add.container(x, y);
        c.add(stampCard(this, cw, SW_H));
        if (worn || sel) c.add(this.add.graphics().lineStyle(5, worn ? 0x2fae5a : 0xffcf4a, 1).strokeRoundedRect(-cw / 2 - 5, -SW_H / 2 - 5, cw + 10, SW_H + 10, 14));
        if (worn && sel) c.add(this.add.graphics().lineStyle(3, 0xffcf4a, 1).strokeRoundedRect(-cw / 2 - 11, -SW_H / 2 - 11, cw + 22, SW_H + 22, 17));
        const g = this.add.graphics();
        if (kind === 'bag') {
          // a little coaster car in the paint's colour
          const col = (q as typeof BAGS[number]).swatch;
          g.fillStyle(0x000000, 0.2).fillRoundedRect(-34, -34, 68, 40, 8);
          g.fillStyle(col, 1).fillRoundedRect(-34, -40, 68, 36, 8);
          g.fillStyle(0x3a3a48, 1).fillRect(-24, -50, 14, 14).fillRect(6, -50, 14, 14);
          g.fillStyle(0xffffff, 0.25).fillRoundedRect(-30, -38, 60, 10, 4);
          g.fillStyle(0x2a2a33, 1).fillCircle(-20, -2, 7).fillCircle(20, -2, 7);
        } else {
          // the speed trail: streaks fading out, on a dark strip so the white one shows
          const col = (q as typeof CAPS[number]).color;
          g.fillStyle(0x1a2050, 1).fillRoundedRect(-cw / 2 + 16, -52, cw - 32, 50, 8);
          for (let k = 0; k < 4; k++) g.lineStyle(6 - k, col, 1 - k * 0.2).lineBetween(-30 + k * 5, -44 + k * 10, 30 - k * 4, -36 + k * 10);
        }
        c.add(g);
        c.add(fit(labelAt(this, 0, 30, t((kind === 'bag' ? 'paint_' : 'trail_') + q.id), SW_NAME), cw - 26));
        if (worn || own) c.add(fit(labelAt(this, 0, 60, t(worn ? 'worn' : 'wear'), worn ? TAG_WORN : TAG_WEAR), cw - 24));
        else {
          const tag = new GlyphText(this, 12, 60, String(q.price), m.tokens >= q.price ? TAG_OK : TAG_POOR);
          c.add([tag, this.add.image(12 - tag.textWidth / 2 - 14, 60, STAMP_ICON).setDisplaySize(22, 22)]);
        }
        c.setSize(cw, SW_H).setInteractive({ useHandCursor: true }).on('pointerup', () => { this.sel = idx; this.act(it); });
        b.add(c);
        this.cellOf.set(kind + ':' + q.id, c);
      });
    };
    swatchRow('bag', 448);
    swatchRow('cap', 738);
  }

  close(): void {
    if (this.closed) return;
    this.closed = true;
    this.tweens.add({
      targets: this.root, alpha: 0, duration: 150, onComplete: () => {
        this.scene.stop();
        const menu = this.scene.get(this.from);
        // the menu's train wears what was bought: build it again
        if (this.changed) menu.scene.restart();
        else { this.scene.resume(this.from); menu.events.emit('shop-closed'); }
      },
    });
  }
}

const clampI = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
