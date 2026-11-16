// Star Squadron: the talent board, a scene of its own opened from the menu (the menu waits under
// it, so its keys do not start a run). Three columns of four talents, each needing the one above
// it, bought with Stardust; a reset gives everything back. Mouse, touch and keyboard.
//
// It wears the menu theme (theme.ts): a cockpit display behind it all, the HUD frame round the
// screen, brushed-metal plates for the talents (lit green when owned, violet when affordable, a
// cyan glow on the one in focus), glowing conduits between the ranks, the Stardust count on a
// metal chip and metal plate buttons. Every piece and every fixed label is painted in Boot under
// the Ayvago intro (`prebakeTalents`, the theme's `prebake`), so opening the board only places
// images: the info text and the price are its only live text.
import Phaser from 'phaser';
import {
  txt, t, playSfx, SkinButton, skinImage, skinTexture, themeLabel, themeCard, labelTexture, placeLabel, ThemeNumber, bake, frameBorder,
  type LabelStyle, type SkinState,
} from '@core';
import { TALENTS, TALENT, type TalentId } from './talents';
import { loadMeta, buyState, buy, resetTalents, type Meta, type BuyState } from './meta';
import { talentArt, DUST, makeArt } from './art';

const COLS = ['col_hull', 'col_weapons', 'col_tactics'];
const NW = 200, NH = 150;
const colX = (c: number) => 360 + (c - 1) * 222;
const rowY = (r: number) => 400 + r * 170;

// ------------------------------------------------------------------ the painted pieces

const CYAN = 0x3ee6ff, VIOLET = 0xd27bff, GREEN = 0x7dffa0;
/** The board behind everything (the theme's cockpit display, `themeCard`). */
export const TALENT_PANEL = { w: 700, h: 1236 };
/** A talent's plate per state: owned green metal, affordable violet, too dear steel, locked dark. */
const NODE_COLOR: Record<BuyState, number> = { owned: 0x2c7a52, ok: 0x5a3fa8, poor: 0x2a3a5c, locked: 0x141b30 };
const INFO = { w: 660, h: 116 };
const CHIP = { w: 240, h: 56 };
const BUY = { w: 190, h: 84 };
const ROW = { w: 230, h: 72 };
const RESET_COLOR = 0xa83a3a;
/** The Stardust count's digits, the info heading and the node labels. */
const DUST_STYLE: LabelStyle = { size: 30, color: '#f0d0ff', stroke: '#061230', strokeWidth: 5 };
const nameStyle = (st: BuyState): LabelStyle => ({ size: 20, color: st === 'owned' ? '#c8ffd8' : st === 'locked' ? '#7a86a8' : '#ffffff', stroke: '#061230', strokeWidth: 4, shadow: false });
const costStyle = (ok: boolean): LabelStyle => ({ size: 22, color: ok ? '#f0d0ff' : '#7a86a8', stroke: '#061230', strokeWidth: 4, shadow: false });
const OWNED_STYLE: LabelStyle = { size: 20, color: '#9dffb8', stroke: '#061230', strokeWidth: 4, shadow: false };
const infoStyle = (owned: boolean): LabelStyle => ({ size: 26, color: owned ? '#9dffb8' : '#ffffff', stroke: '#061230', strokeWidth: 4, shadow: false });
const TITLE_STYLE: LabelStyle = { size: 50, fill: ['#ffffff', '#bff6ff', '#3ec8ff'], stroke: '#061230', strokeWidth: 8 };
const COL_STYLE: LabelStyle = { size: 24, color: '#7ff3ff', stroke: '#061230', strokeWidth: 4, shadow: false };
const NOTE_STYLE: LabelStyle = { size: 20, color: '#cfd8f0', stroke: null, shadow: false, body: true };
const HINT_STYLE: LabelStyle = { size: 17, color: '#9fb0d8', stroke: null, shadow: false, body: true };
const BTN = { buy: 26, row: 24 };

/** A soft glow behind a lit plate (white, tinted per state). */
function haloTexture(scene: Phaser.Scene): string {
  return bake(scene, 'ss-tal-halo', NW + 70, NH + 70, (c) => {
    c.save();
    c.shadowColor = 'rgba(255,255,255,0.95)'; c.shadowBlur = 22;
    c.strokeStyle = 'rgba(255,255,255,0.9)'; c.lineWidth = 6;
    const k = 18, x = 35, y = 35, W = NW, H = NH;
    c.beginPath();
    c.moveTo(x + k, y); c.lineTo(x + W - k, y); c.lineTo(x + W, y + k); c.lineTo(x + W, y + H - k);
    c.lineTo(x + W - k, y + H); c.lineTo(x + k, y + H); c.lineTo(x, y + H - k); c.lineTo(x, y + k); c.closePath();
    c.stroke(); c.stroke();
    c.restore();
  });
}

/** A small padlock on a dark display tile (a locked talent). */
function lockTexture(scene: Phaser.Scene): string {
  return bake(scene, 'ss-tal-lock', 52, 52, (c) => {
    c.fillStyle = 'rgba(6,12,30,0.9)';
    c.beginPath(); c.roundRect(2, 2, 48, 48, 10); c.fill();
    c.strokeStyle = 'rgba(62,230,255,0.45)'; c.lineWidth = 2; c.stroke();
    c.strokeStyle = '#9fb0d8'; c.lineWidth = 5;
    c.beginPath(); c.arc(26, 20, 9, Math.PI, 0); c.lineTo(35, 26); c.moveTo(17, 26); c.lineTo(17, 20); c.stroke();
    c.fillStyle = '#9fb0d8';
    c.beginPath(); c.roundRect(13, 24, 26, 20, 4); c.fill();
    c.fillStyle = '#141b30';
    c.beginPath(); c.arc(26, 32, 3, 0, Math.PI * 2); c.fill(); c.fillRect(24.8, 33, 2.4, 6);
  });
}

/**
 * Paints everything the talent board shows (the theme's `prebake`, in Boot under the intro): the
 * plates in their states, the chip, the info display, the buttons, the halo, the padlock and every
 * fixed label in the current language. Opening the board then creates no texture.
 */
export function prebakeTalents(scene: Phaser.Scene): void {
  for (const st of Object.keys(NODE_COLOR) as BuyState[]) for (const s of ['up', 'on'] as SkinState[]) skinTexture(scene, 'plate', NW, NH, s, NODE_COLOR[st]);
  skinTexture(scene, 'plate', CHIP.w, CHIP.h);
  skinTexture(scene, 'board', INFO.w, INFO.h);
  const states: SkinState[] = ['up', 'over', 'down', 'off'];
  for (const s of states) {
    skinTexture(scene, 'button', BUY.w, BUY.h, s, 0xe8641c);
    skinTexture(scene, 'button', BUY.w, BUY.h, s, NODE_COLOR.owned);
    skinTexture(scene, 'button', ROW.w, ROW.h, s, RESET_COLOR);
    skinTexture(scene, 'button', ROW.w, ROW.h, s, 0xe8641c);
    skinTexture(scene, 'button', ROW.w, ROW.h, s, 0x2d5a96);
  }
  haloTexture(scene);
  lockTexture(scene);
  labelTexture(scene, t('talentsTitle'), TITLE_STYLE);
  labelTexture(scene, t('talentsSub'), NOTE_STYLE);
  labelTexture(scene, t('talentsKeys'), HINT_STYLE);
  labelTexture(scene, t('talentsTouch'), HINT_STYLE);
  for (const k of COLS) labelTexture(scene, t(k), COL_STYLE);
  for (const tl of TALENTS) {
    for (const st of Object.keys(NODE_COLOR) as BuyState[]) labelTexture(scene, t('tl_' + tl.id), nameStyle(st));
    labelTexture(scene, t('tl_' + tl.id), infoStyle(false));
    labelTexture(scene, t('tl_' + tl.id), infoStyle(true));
  }
  for (const c of new Set(TALENTS.map((tl) => tl.cost))) { labelTexture(scene, String(c), costStyle(true)); labelTexture(scene, String(c), costStyle(false)); }
  labelTexture(scene, t('owned'), OWNED_STYLE);
  for (const k of ['unlock', 'owned']) labelTexture(scene, t(k), { size: BTN.buy });
  for (const k of ['reset', 'sure', 'close']) labelTexture(scene, t(k), { size: BTN.row });
  new ThemeNumber(scene, 0, 0, 0, DUST_STYLE).destroy();
}

interface Node {
  id: TalentId; box: Phaser.GameObjects.Container; plate: Phaser.GameObjects.Image; halo: Phaser.GameObjects.Image;
  name: Phaser.GameObjects.Image; cost: Phaser.GameObjects.Image; gem: Phaser.GameObjects.Image; art: Phaser.GameObjects.Image; lock: Phaser.GameObjects.Image;
}

export class TalentScene extends Phaser.Scene {
  private meta!: Meta;
  private nodes: Node[] = [];
  private lines!: Phaser.GameObjects.Graphics;
  private dust!: ThemeNumber;
  private dustChip!: Phaser.GameObjects.Container;
  private infoName!: Phaser.GameObjects.Image;
  private infoDesc!: Phaser.GameObjects.Text;
  private buyBtn!: SkinButton;
  private buyGem!: Phaser.GameObjects.Image;
  private resetBtn!: SkinButton;
  private focus: TalentId = 'plating';
  private resetArmed = false;
  private closed = false;
  private from = 'Menu';
  private root!: Phaser.GameObjects.Container;
  /** How long create() took (ms; a test hook for the open time). */
  openMs = 0;

  constructor() { super('Talents'); }

  create(data: { from?: string; focus?: TalentId }): void {
    const t0 = performance.now();
    makeArt(this);
    this.from = data?.from ?? 'Menu';
    this.meta = loadMeta();
    this.nodes = [];
    this.closed = false;
    this.resetArmed = false;
    const touch = this.sys.game.device.input.touch;
    const { width, height } = this.scale;
    this.focus = data?.focus ?? (TALENTS.find((tl) => buyState(this.meta, tl.id) === 'ok')?.id ?? 'plating');
    this.root = this.add.container(0, 0);
    const dim = this.add.rectangle(0, 0, width, height, 0x02040e, 0.72).setOrigin(0).setInteractive();
    // the cockpit display (theme.ts hudPanel through the theme's card) and the HUD frame
    const panel = this.add.container(width / 2, 652);
    panel.add(themeCard(this, 0, 0, TALENT_PANEL.w, TALENT_PANEL.h));
    this.root.add([dim, panel, ...frameBorder(this).map((o) => (o as Phaser.GameObjects.Image).setDepth(0))]);
    const title = themeLabel(this, width / 2, 92, t('talentsTitle'), TITLE_STYLE);
    title.setScale(Math.min(1, 600 / title.width));
    const sub = themeLabel(this, width / 2, 144, t('talentsSub'), NOTE_STYLE);
    sub.setScale(Math.min(1, 640 / sub.width));
    this.root.add([title, sub]);
    // the Stardust on a metal chip
    this.dustChip = this.add.container(width / 2, 202);
    this.dust = new ThemeNumber(this, 22, 0, this.meta.dust, DUST_STYLE);
    this.dustChip.add([skinImage(this, 0, 0, 'plate', CHIP.w, CHIP.h), this.add.image(-74, 0, DUST).setDisplaySize(48, 48), this.dust]);
    this.root.add(this.dustChip);
    COLS.forEach((k, c) => {
      const l = themeLabel(this, colX(c), 276, t(k), COL_STYLE);
      l.setScale(Math.min(1, 200 / l.width));
      this.root.add(l);
    });
    this.lines = this.add.graphics();
    this.root.add(this.lines);
    const lockKey = lockTexture(this), haloKey = haloTexture(this);
    for (const tl of TALENTS) {
      const box = this.add.container(colX(tl.col), rowY(tl.row));
      const halo = this.add.image(0, 0, haloKey).setVisible(false);
      const plate = skinImage(this, 0, 0, 'plate', NW, NH, 'up', NODE_COLOR.ok);
      const art = this.add.image(0, -24, talentArt(tl.id)).setDisplaySize(86, 86);
      const name = themeLabel(this, 0, 30, t('tl_' + tl.id), nameStyle('ok'));
      const gem = this.add.image(-18, 56, DUST).setDisplaySize(30, 30);
      const cost = themeLabel(this, 4, 56, String(tl.cost), costStyle(true)).setOrigin(0, 0.5);
      const lock = this.add.image(62, -46, lockKey).setVisible(false);
      const hit = this.add.zone(0, 0, NW, NH).setInteractive({ useHandCursor: true });
      hit.on('pointerover', (p: Phaser.Input.Pointer) => { if (!p.wasTouch && tl.id !== this.focus) this.tweens.add({ targets: box, scale: 1.04, duration: 90 }); });
      hit.on('pointerout', () => { if (tl.id !== this.focus) this.tweens.add({ targets: box, scale: 1, duration: 90 }); });
      hit.on('pointerup', () => { if (this.focus === tl.id) this.tryBuy(); else this.setFocus(tl.id); });
      box.add([halo, plate, art, name, gem, cost, lock, hit]);
      this.root.add(box);
      this.nodes.push({ id: tl.id, box, plate, halo, name, cost, gem, art, lock });
    }
    // the info display: the talent's name and text, the unlock button
    const info = this.add.container(width / 2, 1086);
    info.add(skinImage(this, 0, 0, 'board', INFO.w, INFO.h));
    this.infoName = themeLabel(this, -306, -30, t('tl_' + this.focus), infoStyle(false)).setOrigin(0, 0.5);
    this.infoDesc = txt(this, -306, -10, '', { size: 19, color: '#dfe7fb', strokeThickness: 0, shadow: false, wrap: 410, align: 'left' }).setOrigin(0, 0);
    this.buyBtn = new SkinButton(this, 222, 0, t('unlock'), () => this.tryBuy(), { width: BUY.w, height: BUY.h, size: BTN.buy, color: 0xe8641c, baked: true, sfx: '' });
    this.buyBtn.onDenied = () => this.tryBuy();
    this.buyGem = this.add.image(0, 0, DUST).setDisplaySize(26, 26);
    this.buyBtn.add(this.buyGem);
    info.add([this.infoName, this.infoDesc, this.buyBtn]);
    this.root.add(info);
    this.resetBtn = new SkinButton(this, width / 2 - 170, 1188, t('reset'), () => this.reset(), { width: ROW.w, height: ROW.h, size: BTN.row, color: RESET_COLOR, baked: true, sfx: '' });
    const closeBtn = new SkinButton(this, width / 2 + 170, 1188, t('close'), () => this.close(), { width: ROW.w, height: ROW.h, size: BTN.row, baked: true, sfx: '' });
    this.root.add([this.resetBtn, closeBtn]);
    const hint = themeLabel(this, width / 2, 1250, touch ? t('talentsTouch') : t('talentsKeys'), HINT_STYLE);
    hint.setScale(Math.min(1, 640 / hint.width));
    this.root.add(hint);
    this.root.setAlpha(0);
    this.tweens.add({ targets: this.root, alpha: 1, duration: 200 });
    panel.setScale(0.94);
    this.tweens.add({ targets: panel, scale: 1, duration: 260, ease: 'Back.easeOut' });
    this.input.keyboard?.on('keydown', (e: KeyboardEvent) => this.key(e.code));
    this.draw();
    this.openMs = performance.now() - t0;
  }

  private sfx(key: string, volume = 0.5): void { playSfx(this, key, { volume }); }

  private setFocus(id: TalentId, sound = true): void {
    if (id === this.focus) return;
    this.focus = id;
    if (sound) this.sfx('move', 0.4);
    this.draw();
  }

  private draw(): void {
    const m = this.meta;
    this.dust.setValue(m.dust);
    // the conduits between the ranks: lit violet once the rank above is owned
    const g = this.lines.clear();
    for (const tl of TALENTS) {
      if (!tl.req) continue;
      const a = TALENT[tl.req];
      const on = m.talents.includes(tl.req);
      const x0 = colX(a.col), y0 = rowY(a.row) + NH / 2 - 4, x1 = colX(tl.col), y1 = rowY(tl.row) - NH / 2 + 4;
      g.lineStyle(14, 0x02040e, 0.9).lineBetween(x0, y0, x1, y1);
      if (on) {
        g.lineStyle(16, VIOLET, 0.22).lineBetween(x0, y0, x1, y1);
        g.lineStyle(6, VIOLET, 1).lineBetween(x0, y0, x1, y1);
        g.lineStyle(2, 0xffffff, 0.8).lineBetween(x0, y0, x1, y1);
      } else g.lineStyle(4, 0x2a3a5c, 1).lineBetween(x0, y0, x1, y1);
    }
    for (const n of this.nodes) {
      const st = buyState(m, n.id);
      const on = n.id === this.focus;
      n.plate.setTexture(skinTexture(this, 'plate', NW, NH, on ? 'on' : 'up', NODE_COLOR[st]));
      n.halo.setVisible(st === 'owned' || st === 'ok' || on).setTint(on ? CYAN : st === 'owned' ? GREEN : VIOLET).setAlpha(on ? 0.75 : st === 'owned' ? 0.5 : 0.35);
      n.art.setAlpha(st === 'locked' ? 0.3 : st === 'poor' ? 0.6 : 1);
      placeLabel(n.name, labelTexture(this, t('tl_' + n.id), nameStyle(st)));
      n.name.setScale(Math.min(1, (NW - 16) / n.name.width));
      n.box.setScale(on ? 1.05 : 1);
      if (st === 'owned') {
        placeLabel(n.cost, labelTexture(this, t('owned'), OWNED_STYLE)).setOrigin(0.5, n.cost.originY).setX(0);
        n.cost.setScale(Math.min(1, (NW - 20) / n.cost.width));
        n.gem.setVisible(false);
      } else {
        placeLabel(n.cost, labelTexture(this, String(TALENT[n.id].cost), costStyle(st === 'ok'))).setOrigin(0, n.cost.originY).setX(4).setScale(1);
        n.gem.setVisible(true).setAlpha(st === 'ok' ? 1 : 0.5);
      }
      n.lock.setVisible(st === 'locked');
    }
    const st = buyState(m, this.focus);
    const tl = TALENT[this.focus];
    placeLabel(this.infoName, labelTexture(this, t('tl_' + this.focus), infoStyle(st === 'owned'))).setOrigin(0, this.infoName.originY);
    this.infoName.setScale(Math.min(1, 400 / this.infoName.width));
    this.infoDesc.setText(st === 'locked' && tl.req ? `${t('td_' + this.focus)}\n${t('needs', { name: t('tl_' + tl.req) })}` : t('td_' + this.focus));
    this.infoDesc.setScale(Math.min(1, 62 / this.infoDesc.height));
    if (st === 'owned') {
      this.buyBtn.setText(t('owned')).setSub('').setColor(NODE_COLOR.owned).setEnabled(false);
      this.buyGem.setVisible(false);
    } else {
      this.buyBtn.setText(t('unlock')).setSub(String(tl.cost), { color: st === 'ok' ? '#fff3c4' : '#c0c8dc' }).setColor(0xe8641c).setEnabled(st === 'ok');
      const sub = this.buyBtn.sub!;
      const w = sub.width * sub.scaleX + 30;
      this.buyGem.setVisible(true).setAlpha(st === 'ok' ? 1 : 0.6).setPosition(-w / 2 + 12, sub.y);
      sub.setX(-w / 2 + 30 + (sub.width * sub.scaleX) / 2);
    }
    this.resetBtn.setText(this.resetArmed ? t('sure') : t('reset')).setColor(this.resetArmed ? 0xe8641c : RESET_COLOR).setEnabled(m.talents.length > 0);
  }

  private tryBuy(): void {
    const id = this.focus;
    const st = buyState(this.meta, id);
    const n = this.nodes.find((q) => q.id === id)!;
    if (st !== 'ok') {
      this.sfx('error', 0.4);
      this.tweens.add({ targets: n.box, x: { from: n.box.x - 8, to: n.box.x }, duration: 260, ease: 'Elastic.easeOut', easeParams: [1.4, 0.25] });
      if (st === 'poor') this.flash(t('notEnough'));
      return;
    }
    buy(this.meta, id);
    this.resetArmed = false;
    this.sfx('talent', 0.75);
    for (let i = 0; i < 6; i++) {
      const s = this.add.image(this.dustChip.x - 74, this.dustChip.y, DUST).setDisplaySize(32, 32);
      this.root.add(s);
      this.tweens.add({ targets: s, x: n.box.x + (Math.random() - 0.5) * 40, y: n.box.y + (Math.random() - 0.5) * 30, duration: 380 + i * 50, delay: i * 30, ease: 'Cubic.easeIn', onComplete: () => s.destroy() });
    }
    this.time.delayedCall(420, () => {
      if (this.closed) return;
      this.tweens.add({ targets: n.box, scale: 1.18, duration: 140, yoyo: true, ease: 'Quad.easeOut' });
      // a ring of the plate's glow flies off it
      const ring = this.add.image(n.box.x, n.box.y, haloTexture(this)).setTint(GREEN);
      this.root.add(ring);
      this.tweens.add({ targets: ring, scale: 1.35, alpha: 0, duration: 420, onComplete: () => ring.destroy() });
      this.cameras.main.shake(120, 0.004);
      this.sfx('star', 0.5);
    });
    this.draw();
  }

  private reset(): void {
    if (!this.meta.talents.length) return;
    if (!this.resetArmed) { this.resetArmed = true; this.sfx('move', 0.5); this.draw(); return; }
    this.resetArmed = false;
    const back = resetTalents(this.meta);
    this.sfx('refund', 0.7);
    this.flash(t('refunded', { n: back }), '#f0d0ff');
    this.tweens.add({ targets: this.dustChip, scale: 1.2, duration: 120, yoyo: true });
    this.draw();
  }

  private flash(s: string, color = '#ffb0a0'): void {
    const p = txt(this, this.scale.width / 2, 1000, s, { size: 26, color, strokeThickness: 5 });
    this.root.add(p);
    this.tweens.add({ targets: p, y: 960, alpha: 0, delay: 700, duration: 500, onComplete: () => p.destroy() });
  }

  private key(code: string): void {
    if (this.closed) return;
    const tl = TALENT[this.focus];
    const move: Record<string, [number, number]> = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1], KeyA: [-1, 0], KeyD: [1, 0], KeyW: [0, -1], KeyS: [0, 1] };
    if (move[code]) {
      const c = Phaser.Math.Clamp(tl.col + move[code][0], 0, 2), r = Phaser.Math.Clamp(tl.row + move[code][1], 0, 3);
      const to = TALENTS.find((q) => q.col === c && q.row === r);
      if (to) this.setFocus(to.id);
      return;
    }
    if (code === 'Enter' || code === 'Space') this.tryBuy();
    else if (code === 'Backspace' || code === 'Delete') this.reset();
    else if (code === 'Escape' || code === 'KeyT') this.close();
  }

  close(): void {
    if (this.closed) return;
    this.closed = true;
    this.sfx('move', 0.4);
    this.tweens.add({
      targets: this.root, alpha: 0, duration: 160, onComplete: () => {
        this.scene.stop();
        // the menu redraws its talents button (new balance)
        const menu = this.scene.get(this.from);
        this.scene.resume(this.from);
        menu.events.emit('talents-closed');
      },
    });
  }

  /** Test hook. */
  testFocus(id: TalentId): void { this.setFocus(id, false); }
}
