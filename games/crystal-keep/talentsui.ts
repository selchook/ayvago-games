// Crystal Keep: the talent board. Three columns of four talents (each needs the one above it),
// bought with Crystal Shards; a reset gives every shard back. Mouse, touch and keyboard.
import Phaser from 'phaser';
import { txt, t } from '@core';
import { TALENTS, TALENT, buyState, buy, resetTalents, type Meta, type TalentId, type BuyState } from './meta';
import { talentArt } from './art';
import { shardIcon } from './thumbs';
import { glass, Pill } from './ui';

export const BOARD_DEPTH = 9800;
const COLS = ['col_keep', 'col_powers', 'col_mastery'];
const NW = 200, NH = 150;
const colX = (c: number) => 360 + (c - 1) * 222;
const rowY = (r: number) => 404 + r * 172;

interface Node { id: TalentId; box: Phaser.GameObjects.Container; bg: Phaser.GameObjects.Graphics; cost: Phaser.GameObjects.Text; gem: Phaser.GameObjects.Image; art: Phaser.GameObjects.Image; lock: Phaser.GameObjects.Graphics }

export class TalentBoard {
  private root: Phaser.GameObjects.Container;
  private nodes: Node[] = [];
  private lines: Phaser.GameObjects.Graphics;
  private shardText: Phaser.GameObjects.Text;
  private shardChip: Phaser.GameObjects.Container;
  private infoName: Phaser.GameObjects.Text;
  private infoDesc: Phaser.GameObjects.Text;
  private buyBtn: Pill;
  private resetBtn: Pill;
  private focus: TalentId;
  private resetArmed = false;
  closed = false;

  constructor(private scene: Phaser.Scene, private meta: Meta, private o: { input: 'mouse' | 'touch' | 'keys'; focus?: TalentId; sfx: (k: string, v?: number) => void; onClose: () => void; onChange: () => void }) {
    const { width, height } = scene.scale;
    this.focus = o.focus ?? (TALENTS.find((tl) => buyState(meta, tl.id) === 'ok')?.id ?? 'gold1');
    this.root = scene.add.container(0, 0).setScrollFactor(0, 0, true).setDepth(BOARD_DEPTH);
    const dim = scene.add.rectangle(0, 0, width, height, 0x070a14, 0.7).setOrigin(0).setInteractive();
    const panel = scene.add.container(width / 2, 652);
    panel.add(glass(scene, 700, 1236, { alpha: 0.96, r: 30 }));
    this.root.add([dim, panel]);
    this.root.add(txt(scene, width / 2, 96, t('talentsTitle'), { title: true, size: 42, color: '#ffd23f', strokeThickness: 7 }));
    // the shard counter
    this.shardChip = scene.add.container(width / 2, 160);
    const chipBg = scene.add.graphics().fillStyle(0x0b1020, 0.8).fillRoundedRect(-110, -26, 220, 52, 26).lineStyle(2, 0xd27bff, 0.8).strokeRoundedRect(-110, -26, 220, 52, 26);
    this.shardText = txt(scene, 16, 0, '', { title: true, size: 28, color: '#f0d0ff', strokeThickness: 0, shadow: false });
    this.shardChip.add([chipBg, scene.add.image(-70, 0, shardIcon()).setDisplaySize(44, 44), this.shardText]);
    this.root.add(this.shardChip);
    COLS.forEach((k, c) => this.root.add(txt(scene, colX(c), 252, t(k), { title: true, size: 24, color: '#9fb0d8', strokeThickness: 0, shadow: false })));
    this.lines = scene.add.graphics();
    this.root.add(this.lines);
    for (const tl of TALENTS) {
      const box = scene.add.container(colX(tl.col), rowY(tl.row));
      const bg = scene.add.graphics();
      const art = scene.add.image(0, -24, talentArt(tl.id)).setDisplaySize(86, 86);
      const name = txt(scene, 0, 30, t('tl_' + tl.id), { title: true, size: 21, strokeThickness: 0, shadow: false });
      name.setScale(Math.min(1, (NW - 16) / name.width));
      const gem = scene.add.image(-18, 56, shardIcon()).setDisplaySize(28, 28);
      const cost = txt(scene, 4, 56, '', { title: true, size: 20, color: '#f0d0ff', strokeThickness: 0, shadow: false }).setOrigin(0, 0.5);
      const lock = scene.add.graphics();
      const hit = scene.add.zone(0, 0, NW, NH).setInteractive({ useHandCursor: true });
      hit.on('pointerover', (p: Phaser.Input.Pointer) => { if (!p.wasTouch && tl.id !== this.focus) this.scene.tweens.add({ targets: box, scale: 1.04, duration: 90 }); });
      hit.on('pointerout', () => { if (tl.id !== this.focus) this.scene.tweens.add({ targets: box, scale: 1, duration: 90 }); });
      hit.on('pointerup', () => {
        if (this.focus === tl.id) this.tryBuy();
        else { this.setFocus(tl.id); }
      });
      box.add([bg, art, name, gem, cost, lock, hit]);
      this.root.add(box);
      this.nodes.push({ id: tl.id, box, bg, cost, gem, art, lock });
    }
    // what the focused talent does, and the buy button
    const info = scene.add.container(width / 2, 1086);
    info.add(scene.add.graphics().fillStyle(0x0b1020, 0.7).fillRoundedRect(-330, -58, 660, 116, 20));
    this.infoName = txt(scene, -310, -32, '', { title: true, size: 26, strokeThickness: 0, shadow: false }).setOrigin(0, 0.5);
    this.infoDesc = txt(scene, -310, -10, '', { size: 19, color: '#dfe7fb', strokeThickness: 0, shadow: false, wrap: 420, align: 'left' }).setOrigin(0, 0);
    this.buyBtn = new Pill(scene, 222, 0, 190, 84, 0x8a3fd0, () => this.tryBuy(), 24);
    info.add([this.infoName, this.infoDesc, this.buyBtn]);
    this.root.add(info);
    this.resetBtn = new Pill(scene, width / 2 - 170, 1196, 230, 72, 0xc8553d, () => this.reset(), 22);
    const closeBtn = new Pill(scene, width / 2 + 170, 1196, 230, 72, 0x2f9e56, () => this.close(), 24);
    closeBtn.setLabels(t('close'));
    this.root.add([this.resetBtn, closeBtn]);
    this.root.add(txt(scene, width / 2, 1252, o.input === 'keys' ? t('talentsKeys') : o.input === 'touch' ? t('talentsTouch') : t('talentsKeys'), { size: 18, color: '#9fb0d8', strokeThickness: 0, shadow: false }));
    this.root.setScrollFactor(0, 0, true);
    this.root.setAlpha(0);
    scene.tweens.add({ targets: this.root, alpha: 1, duration: 200 });
    panel.setScale(0.94);
    scene.tweens.add({ targets: panel, scale: 1, duration: 260, ease: 'Back.easeOut' });
    this.draw();
  }

  private setFocus(id: TalentId, sound = true): void {
    if (id === this.focus) return;
    this.focus = id;
    if (sound) this.o.sfx('move', 0.4);
    this.draw();
  }

  private draw(): void {
    const m = this.meta;
    this.shardText.setText(String(m.shards));
    const g = this.lines.clear();
    for (const tl of TALENTS) {
      if (!tl.req) continue;
      const a = TALENT[tl.req];
      const on = m.talents.includes(tl.req);
      g.lineStyle(8, on ? 0xd27bff : 0x2a3350, on ? 0.9 : 1).lineBetween(colX(a.col), rowY(a.row) + NH / 2 - 6, colX(tl.col), rowY(tl.row) - NH / 2 + 6);
    }
    for (const n of this.nodes) {
      const st = buyState(m, n.id);
      const on = n.id === this.focus;
      const fill: Record<BuyState, number> = { owned: 0x2a5e3e, ok: 0x30245a, poor: 0x1c2238, locked: 0x151a2a };
      const rim: Record<BuyState, number> = { owned: 0x7dffa0, ok: 0xd27bff, poor: 0x46506e, locked: 0x2a3350 };
      const b = n.bg.clear();
      b.fillStyle(0x000000, 0.3).fillRoundedRect(-NW / 2, -NH / 2 + 6, NW, NH, 20);
      b.fillStyle(fill[st], 1).fillRoundedRect(-NW / 2, -NH / 2, NW, NH, 20);
      b.fillStyle(0xffffff, 0.06).fillRoundedRect(-NW / 2 + 4, -NH / 2 + 4, NW - 8, NH * 0.4, { tl: 17, tr: 17, bl: 6, br: 6 });
      b.lineStyle(on ? 5 : 3, on ? 0xfff3a0 : rim[st], 1).strokeRoundedRect(-NW / 2, -NH / 2, NW, NH, 20);
      n.art.setAlpha(st === 'locked' ? 0.3 : st === 'poor' ? 0.6 : 1);
      n.box.setScale(on ? 1.05 : 1);
      if (st === 'owned') { n.cost.setText(t('ownedTalent')).setColor('#9dffb8'); n.gem.setVisible(false); n.cost.setOrigin(0.5, 0.5).setX(0); }
      else {
        n.cost.setText(String(TALENT[n.id].cost)).setColor(st === 'ok' ? '#f0d0ff' : '#7a86a8').setOrigin(0, 0.5).setX(4);
        n.gem.setVisible(true).setAlpha(st === 'ok' ? 1 : 0.5);
      }
      // a padlock over locked talents
      const l = n.lock.clear();
      if (st === 'locked') {
        l.fillStyle(0x0b1020, 0.8).fillRoundedRect(36, -64, 48, 46, 10);
        l.lineStyle(5, 0x9fb0d8, 1).strokeCircle(60, -50, 10);
        l.fillStyle(0x9fb0d8, 1).fillRoundedRect(46, -48, 28, 22, 5);
      }
    }
    const st = buyState(m, this.focus);
    const tl = TALENT[this.focus];
    this.infoName.setText(t('tl_' + this.focus)).setColor(st === 'owned' ? '#9dffb8' : '#ffffff');
    this.infoDesc.setText(st === 'locked' && tl.req ? `${t('td_' + this.focus)}\n${t('needs', { name: t('tl_' + tl.req) })}` : t('td_' + this.focus));
    this.infoDesc.setScale(Math.min(1, 62 / this.infoDesc.height));
    if (st === 'owned') this.buyBtn.setLabels(t('ownedTalent')).setEnabled(false);
    else this.buyBtn.setLabels(t('unlock'), String(tl.cost)).setEnabled(st === 'ok');
    const spent = m.talents.length > 0;
    this.resetBtn.setLabels(this.resetArmed ? t('sure') : t('reset')).setEnabled(spent).setColor(this.resetArmed ? 0xe0782a : 0xc8553d);
  }

  private tryBuy(): void {
    const id = this.focus;
    const st = buyState(this.meta, id);
    const n = this.nodes.find((q) => q.id === id)!;
    if (st !== 'ok') {
      this.o.sfx('error', 0.4);
      this.scene.tweens.add({ targets: n.box, x: { from: n.box.x - 8, to: n.box.x }, duration: 260, ease: 'Elastic.easeOut', easeParams: [1.4, 0.25] });
      if (st === 'poor') this.flash(t('notEnoughShards'));
      return;
    }
    buy(this.meta, id);
    this.resetArmed = false;
    this.o.sfx('talent', 0.75);
    this.o.onChange();
    // shards fly from the counter into the talent, which pops
    for (let i = 0; i < 6; i++) {
      const s = this.scene.add.image(this.shardChip.x - 70, this.shardChip.y, shardIcon()).setDisplaySize(30, 30);
      this.root.add(s);
      this.scene.tweens.add({ targets: s, x: n.box.x + (Math.random() - 0.5) * 40, y: n.box.y + (Math.random() - 0.5) * 30, duration: 380 + i * 50, delay: i * 30, ease: 'Cubic.easeIn', onComplete: () => s.destroy() });
    }
    this.scene.time.delayedCall(420, () => {
      if (this.closed) return;
      this.scene.tweens.add({ targets: n.box, scale: 1.18, duration: 140, yoyo: true, ease: 'Quad.easeOut' });
      const ring = this.scene.add.graphics().lineStyle(6, 0xd27bff, 1).strokeRoundedRect(-NW / 2, -NH / 2, NW, NH, 20);
      ring.setPosition(n.box.x, n.box.y);
      this.root.add(ring);
      this.scene.tweens.add({ targets: ring, scale: 1.35, alpha: 0, duration: 420, onComplete: () => ring.destroy() });
      this.o.sfx('star', 0.5);
    });
    this.draw();
  }

  private reset(): void {
    if (!this.meta.talents.length) return;
    if (!this.resetArmed) { this.resetArmed = true; this.o.sfx('move', 0.5); this.draw(); return; }
    this.resetArmed = false;
    const back = resetTalents(this.meta);
    this.o.sfx('refund', 0.7);
    this.o.onChange();
    this.flash(t('refunded', { n: back }), '#f0d0ff');
    this.scene.tweens.add({ targets: this.shardChip, scale: 1.2, duration: 120, yoyo: true });
    this.draw();
  }

  private flash(s: string, color = '#ffb0a0'): void {
    const p = txt(this.scene, this.scene.scale.width / 2, 1000, s, { size: 26, color, strokeThickness: 5 });
    this.root.add(p);
    this.scene.tweens.add({ targets: p, y: 960, alpha: 0, delay: 700, duration: 500, onComplete: () => p.destroy() });
  }

  /** Keyboard: arrows move, Enter unlocks, Backspace resets (twice), Esc / T close. */
  key(code: string): void {
    if (this.closed) return;
    const tl = TALENT[this.focus];
    const move: Record<string, [number, number]> = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
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
    this.o.sfx('move', 0.4);
    this.scene.tweens.add({ targets: this.root, alpha: 0, duration: 160, onComplete: () => this.root.destroy() });
    this.o.onClose();
  }

  /** Test hook. */
  testFocus(id: TalentId): void { this.setFocus(id, false); }
}

