// Kickflip Park: the parks screen, opened from the menu (the menu waits under it, so its keys do
// not start a session). One park at a time with its goals ticked off, its best score and a button
// to skate it (locked parks say what opens them), and the board below: deck graphics and wheel
// colours, the ones not yet earned shown locked with what they need. Touch, mouse and keyboard
// (←/→ parks, Enter skate here, Esc back).
import Phaser from 'phaser';
import { txt, t, playSfx, isEasy } from '@core';
import { PARKS, UNLOCK_GOALS, park, type ParkId } from './parks';
import { loadMeta, saveMeta, unlocked, deckOpen, wheelOpen, goalsDone, type Meta } from './meta';
import { DECKS, WHEELS, DECK_GOALS, WHEEL_SCORE, WHEEL_COLOR, type DeckId, type WheelId } from './defs';
import { goalText, goalNeed, fmt } from './PlayScene';

/** A frosted panel (the core's modern glass look). */
export function glass(scene: Phaser.Scene, w: number, h: number, o: { r?: number; color?: number; alpha?: number; rim?: number } = {}): Phaser.GameObjects.Graphics {
  const r = o.r ?? 26;
  const g = scene.add.graphics();
  g.fillStyle(0x000000, 0.28).fillRoundedRect(-w / 2, -h / 2 + 8, w, h, r);
  g.fillStyle(o.color ?? 0x121a33, o.alpha ?? 0.9).fillRoundedRect(-w / 2, -h / 2, w, h, r);
  g.fillStyle(0xffffff, 0.06).fillRoundedRect(-w / 2 + 4, -h / 2 + 4, w - 8, h * 0.4, { tl: r - 3, tr: r - 3, bl: 6, br: 6 });
  g.lineStyle(2, o.rim ?? 0xffffff, o.rim ? 0.9 : 0.16).strokeRoundedRect(-w / 2, -h / 2, w, h, r);
  return g;
}

/** A rounded, tappable button with a main label and an optional second line. */
export class Pill extends Phaser.GameObjects.Container {
  private g: Phaser.GameObjects.Graphics;
  readonly main: Phaser.GameObjects.Text;
  readonly sub: Phaser.GameObjects.Text;
  enabled = true;

  constructor(scene: Phaser.Scene, x: number, y: number, readonly w: number, readonly h: number, private color: number, private onTap: () => void, size = 28) {
    super(scene, x, y);
    this.g = scene.add.graphics();
    this.main = txt(scene, 0, 0, '', { title: true, size, strokeThickness: 0, shadow: false });
    this.sub = txt(scene, 0, 0, '', { size: Math.round(size * 0.7), color: '#fff3c4', strokeThickness: 0, shadow: false });
    this.add([this.g, this.main, this.sub]);
    this.setSize(w, h).setInteractive({ useHandCursor: true });
    this.on('pointerdown', () => { if (this.enabled) scene.tweens.add({ targets: this, scale: 0.95, duration: 70 }); });
    this.on('pointerout', () => scene.tweens.add({ targets: this, scale: 1, duration: 120 }));
    this.on('pointerup', () => {
      scene.tweens.add({ targets: this, scale: 1, duration: 200, ease: 'Back.easeOut' });
      if (this.enabled) this.onTap();
    });
    this.draw();
    scene.add.existing(this);
  }

  setColor(c: number): this { if (c !== this.color) { this.color = c; this.draw(); } return this; }
  setEnabled(on: boolean): this { if (on !== this.enabled) { this.enabled = on; this.draw(); } return this; }

  setLabels(main: string, sub = ''): this {
    this.main.setText(main);
    this.sub.setText(sub).setVisible(!!sub);
    this.main.y = sub ? -13 : 0;
    this.sub.y = 20;
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

/** Small deck graphics for the board picker (drawn like the 3D board's underside). */
export function deckSwatch(scene: Phaser.Scene, id: DeckId): string {
  const key = 'kf-deck-' + id;
  if (scene.textures.exists(key)) return key;
  const cv = document.createElement('canvas');
  cv.width = 48; cv.height = 112;
  const g = cv.getContext('2d')!;
  g.save();
  g.beginPath(); g.roundRect(2, 2, 44, 108, 22); g.clip();
  const W = 48, H = 112;
  switch (id) {
    case 'classic': g.fillStyle = '#ef5b2a'; g.fillRect(0, 0, W, H); g.fillStyle = '#ffd23f'; g.fillRect(0, 44, W, 8); g.fillRect(0, 60, W, 8); break;
    case 'flame': {
      g.fillStyle = '#26222e'; g.fillRect(0, 0, W, H);
      const grd = g.createLinearGradient(0, H, 0, 20); grd.addColorStop(0, '#ffdf3a'); grd.addColorStop(0.5, '#ff7a1a'); grd.addColorStop(1, '#e8322b');
      g.fillStyle = grd; for (let i = 0; i < 3; i++) { g.beginPath(); g.moveTo(i * 16 - 2, H); g.quadraticCurveTo(i * 16 + 2, 50, i * 16 + 8, 26 + i * 10); g.quadraticCurveTo(i * 16 + 14, 60, i * 16 + 18, H); g.fill(); }
      break;
    }
    case 'checker': g.fillStyle = '#f4f1ea'; g.fillRect(0, 0, W, H); g.fillStyle = '#26222e'; for (let y = 0; y < 7; y++) for (let x = 0; x < 3; x++) if ((x + y) % 2) g.fillRect(x * 16, y * 16, 16, 16); break;
    case 'wave': g.fillStyle = '#2f7fd8'; g.fillRect(0, 0, W, H); g.strokeStyle = '#ffffff'; g.lineWidth = 3; for (let i = 0; i < 6; i++) { g.beginPath(); for (let x = 0; x <= W; x += 4) g.lineTo(x, i * 18 + 10 + Math.sin(x / 7 + i) * 4); g.stroke(); } break;
    case 'galaxy': { const grd = g.createLinearGradient(0, 0, 0, H); grd.addColorStop(0, '#2a1259'); grd.addColorStop(0.5, '#7a2fb8'); grd.addColorStop(1, '#1a0f3a'); g.fillStyle = grd; g.fillRect(0, 0, W, H); g.fillStyle = '#fff'; for (let i = 0; i < 24; i++) g.fillRect((i * 29) % W, (i * 47) % H, 2, 2); break; }
    case 'gold': { const grd = g.createLinearGradient(0, 0, W, H); grd.addColorStop(0, '#fff2a8'); grd.addColorStop(0.5, '#e8b020'); grd.addColorStop(1, '#fff0a0'); g.fillStyle = grd; g.fillRect(0, 0, W, H); break; }
  }
  g.restore();
  g.strokeStyle = 'rgba(255,255,255,0.8)'; g.lineWidth = 3;
  g.beginPath(); g.roundRect(2, 2, 44, 108, 22); g.stroke();
  scene.textures.addCanvas(key, cv);
  return key;
}

export class ParkScene extends Phaser.Scene {
  private meta!: Meta;
  private idx = 0;
  private root!: Phaser.GameObjects.Container;
  private card!: Phaser.GameObjects.Container;
  private board!: Phaser.GameObjects.Container;
  private closed = false;
  private from = 'Menu';
  private go!: Pill;

  constructor() { super('Parks'); }

  create(data: { from?: string }): void {
    this.from = data?.from ?? 'Menu';
    this.meta = loadMeta();
    this.closed = false;
    this.idx = PARKS.indexOf(this.meta.park);
    const { width, height } = this.scale;
    this.root = this.add.container(0, 0);
    // an opaque backdrop: nothing of the menu shows through
    const dim = this.add.rectangle(0, 0, width, height, 0x070b1a, 1).setOrigin(0).setInteractive();
    const panel = this.add.container(width / 2, 650, [glass(this, 690, 1240, { alpha: 1, r: 30 })]);
    this.root.add([dim, panel]);
    this.root.add(txt(this, width / 2, 84, t('parksTitle'), { title: true, size: 40, color: '#ffd23f', strokeThickness: 7 }));
    // park arrows
    const arrow = (x: number, d: number, icon: string) => {
      const c = this.add.container(x, 170);
      const g = this.add.graphics().fillStyle(0xffffff, 0.12).fillCircle(0, 0, 40).lineStyle(2, 0xffffff, 0.35).strokeCircle(0, 0, 40);
      c.add([g, this.add.image(0, 0, icon).setDisplaySize(42, 42)]);
      c.setSize(90, 90).setInteractive({ useHandCursor: true }).on('pointerup', () => this.step(d));
      this.root.add(c);
    };
    arrow(78, -1, 'icon-arrowleft');
    arrow(width - 78, 1, 'icon-arrowright');
    this.card = this.add.container(0, 0);
    this.board = this.add.container(0, 0);
    this.root.add([this.card, this.board]);
    this.go = new Pill(this, width / 2, 890, 420, 92, 0x2fae5a, () => this.pick(), 32);
    const back = new Pill(this, width / 2, 1208, 300, 76, 0x3b4466, () => this.close(), 26);
    back.setLabels(t('back'));
    this.root.add([this.go, back]);
    this.draw();
    this.drawBoard();
    const kb = this.input.keyboard;
    kb?.on('keydown', (e: KeyboardEvent) => {
      if (this.closed) return;
      if (e.code === 'ArrowLeft' || e.code === 'KeyA') this.step(-1);
      else if (e.code === 'ArrowRight' || e.code === 'KeyD') this.step(1);
      else if (e.code === 'Enter' || e.code === 'Space') this.pick();
      else if (e.code === 'Escape' || e.code === 'Backspace') this.close();
    });
    panel.setScale(0.96);
    this.tweens.add({ targets: panel, scale: 1, duration: 160, ease: 'Back.easeOut' });
  }

  private get id(): ParkId { return PARKS[this.idx]; }

  private step(d: number): void {
    this.idx = (this.idx + d + PARKS.length) % PARKS.length;
    playSfx(this, 'ui-click');
    this.draw();
    this.card.setX(d * 40).setAlpha(0.3);
    this.tweens.add({ targets: this.card, x: 0, alpha: 1, duration: 200, ease: 'Quad.easeOut' });
  }

  private draw(): void {
    const { width } = this.scale;
    const c = this.card;
    c.removeAll(true);
    const id = this.id, p = park(id), m = this.meta;
    const open = unlocked(m, id);
    const done = m.goals[id];
    c.add(txt(this, width / 2, 158, t('park_' + id), { title: true, size: 36, color: '#ffffff', strokeThickness: 6 }));
    c.add(txt(this, width / 2, 206, t('parkSub_' + id), { size: 21, color: '#cfd8f0', strokeThickness: 0, shadow: false, wrap: 500 }));
    // dots: which park of three
    PARKS.forEach((q, i) => {
      const g = this.add.graphics().fillStyle(i === this.idx ? 0xffd23f : 0xffffff, i === this.idx ? 1 : 0.3).fillCircle(width / 2 + (i - 1) * 26, 242, 7);
      c.add(g);
      void q;
    });
    const box = this.add.container(width / 2, 520, [glass(this, 620, 470, { color: 0x0b1020, alpha: 0.7, r: 22 })]);
    c.add(box);
    box.add(txt(this, 0, -200, t('goalsCount', { n: done.length, m: p.goals.length }) + '   ·   ' + t('bestIn', { n: fmt(m.best[id]) }), { title: true, size: 22, color: '#ffd23f', strokeThickness: 0, shadow: false }));
    const mode = isEasy() ? 'easy' : 'normal';
    p.goals.forEach((g, i) => {
      const y = -150 + i * 50;
      const ok = done.includes(g.id);
      const mark = this.add.graphics();
      if (ok) mark.fillStyle(0x2fae5a, 1).fillCircle(-268, y, 15).lineStyle(4, 0xffffff, 1).beginPath().moveTo(-275, y).lineTo(-269, y + 6).lineTo(-259, y - 6).strokePath();
      else mark.lineStyle(3, 0xffffff, 0.45).strokeCircle(-268, y, 14);
      const tx = txt(this, -240, y, goalText(g, goalNeed(g, mode)), { size: 22, color: ok ? '#9dffb8' : '#ffffff', strokeThickness: 0, shadow: false }).setOrigin(0, 0.5);
      box.add([mark, tx]);
    });
    if (!open) {
      const prev = PARKS[this.idx - 1];
      const lock = this.add.container(0, 0, [this.add.graphics().fillStyle(0x050814, 0.86).fillRoundedRect(-310, -235, 620, 470, 22)]);
      lock.add(this.add.image(0, -70, 'icon-locked').setDisplaySize(90, 90));
      lock.add(txt(this, 0, 40, t('locked', { park: t('park_' + prev), n: UNLOCK_GOALS }), { title: true, size: 26, color: '#ffd23f', strokeThickness: 0, shadow: false, wrap: 500 }));
      box.add(lock);
    }
    const sel = m.park === id;
    this.go.setEnabled(open);
    this.go.setColor(sel ? 0x3b7fd8 : 0x2fae5a);
    this.go.setLabels(sel ? t('selected') : t('skateHere'));
  }

  private drawBoard(): void {
    const { width } = this.scale;
    const b = this.board;
    b.removeAll(true);
    const m = this.meta;
    b.add(txt(this, width / 2, 978, t('board'), { title: true, size: 24, color: '#9fe8ff', strokeThickness: 0, shadow: false }));
    // decks
    DECKS.forEach((d, i) => {
      const x = 120 + i * 96, y = 1050;
      const open = deckOpen(m, d);
      const img = this.add.image(x, y, deckSwatch(this, d)).setDisplaySize(36, 84).setAngle(90);
      const c = this.add.container(0, 0, [img]);
      if (m.deck === d) c.add(this.add.graphics().lineStyle(4, 0xffd23f, 1).strokeRoundedRect(x - 46, y - 26, 92, 52, 14));
      if (!open) {
        c.add(this.add.rectangle(x, y, 86, 40, 0x050814, 0.6));
        c.add(txt(this, x, y, t('needGoals', { n: DECK_GOALS[d] }), { size: 16, color: '#ffd23f', strokeThickness: 3 }));
      }
      const z = this.add.zone(x, y, 90, 60).setInteractive({ useHandCursor: true }).on('pointerup', () => this.setDeck(d));
      b.add([c, z]);
    });
    // wheels
    WHEELS.forEach((w, i) => {
      const x = 120 + i * 96, y = 1128;
      const open = wheelOpen(m, w);
      const g = this.add.graphics();
      g.fillStyle(0x000000, 0.3).fillCircle(x, y + 3, 22).fillStyle(WHEEL_COLOR[w], open ? 1 : 0.35).fillCircle(x, y, 22).fillStyle(0x333344, 1).fillCircle(x, y, 8);
      if (m.wheel === w) g.lineStyle(4, 0xffd23f, 1).strokeCircle(x, y, 30);
      const items: Phaser.GameObjects.GameObject[] = [g];
      if (!open) items.push(txt(this, x, y + 2, t('needScore', { n: fmt(WHEEL_SCORE[w] / 1000) + 'k' }), { size: 14, color: '#ffd23f', strokeThickness: 3 }));
      const z = this.add.zone(x, y, 80, 64).setInteractive({ useHandCursor: true }).on('pointerup', () => this.setWheel(w));
      b.add([...items, z]);
    });
  }

  private setDeck(d: DeckId): void {
    if (!deckOpen(this.meta, d)) { playSfx(this, 'error'); return; }
    this.meta.deck = d;
    saveMeta(this.meta);
    playSfx(this, 'ui-click');
    this.drawBoard();
  }

  private setWheel(w: WheelId): void {
    if (!wheelOpen(this.meta, w)) { playSfx(this, 'error'); return; }
    this.meta.wheel = w;
    saveMeta(this.meta);
    playSfx(this, 'ui-click');
    this.drawBoard();
  }

  private pick(): void {
    if (!unlocked(this.meta, this.id)) { playSfx(this, 'error'); return; }
    this.meta.park = this.id;
    saveMeta(this.meta);
    playSfx(this, 'ui-select');
    this.close(true);
  }

  close(changed = false): void {
    if (this.closed) return;
    this.closed = true;
    void goalsDone;
    this.tweens.add({
      targets: this.root, alpha: 0, duration: 150, onComplete: () => {
        this.scene.stop();
        const menu = this.scene.get(this.from);
        // the menu's backdrop shows the chosen park: build it again
        if (changed) menu.scene.restart();
        else { this.scene.resume(this.from); menu.events.emit('parks-closed'); }
      },
    });
  }

  /** Test hook. */
  testStep(d: number): void { this.step(d); }
}
