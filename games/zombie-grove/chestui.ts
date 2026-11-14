// Zombie Grove: the gold chest opening. A mini-boss's chest holds one to three free upgrades (the
// simulation has already rolled and applied them); this shows them as a little slot machine: a
// glass panel with one reel per upgrade, each spinning through the card icons and stopping, one
// after another, on what was won, with its name and level underneath. A tap, Enter or Space
// hurries it; it closes by itself.
import Phaser from 'phaser';
import { txt, t } from '@core';
import { RARITY_COLOR, type Card } from './cards';
import { cardArt, weaponArt, passiveArt, CHEST, COIN, HEAL, GOLD } from './art';
import { WEAPON_IDS, PASSIVE_IDS } from './defs';
import { glass } from './ui';
import { cardText, levelTag } from './cardsui';

export const CHEST_DEPTH = 9650;
const REEL = 118;

export class ChestReveal {
  private root: Phaser.GameObjects.Container;
  private reels: { img: Phaser.GameObjects.Image; frame: Phaser.GameObjects.Graphics; name: Phaser.GameObjects.Text; tag: Phaser.GameObjects.Text; stopAt: number; stopped: boolean; card: Card; x: number }[] = [];
  private t = 0;
  private tick = 0;
  private spinPool: string[];
  private holdT = 0;
  done = false;

  constructor(private scene: Phaser.Scene, cards: Card[], coins: number, private sfx: (key: string, v?: number, rate?: number) => void, private onClose: () => void) {
    const { width } = scene.scale;
    const n = cards.length;
    const W = Math.max(440, n * (REEL + 34) + 60), H = 400;
    this.root = scene.add.container(width / 2, 720).setScrollFactor(0).setDepth(CHEST_DEPTH);
    const hit = scene.add.zone(0, 0, W, H).setInteractive();
    hit.on('pointerdown', (_p: Phaser.Input.Pointer, _x: number, _y: number, ev: Phaser.Types.Input.EventData) => { ev.stopPropagation(); this.hurry(); });
    const bg = glass(scene, W, H, { alpha: 0.9, r: 28, color: 0x2a1c08, rim: 0xffd23f });
    const icon = scene.add.image(-W / 2 + 64, -H / 2 + 60, CHEST).setDisplaySize(96, 96);
    const title = txt(scene, 30, -H / 2 + 46, t('chestTitle'), { title: true, size: 40, color: '#ffd23f', strokeThickness: 7 });
    const sub = txt(scene, 30, -H / 2 + 92, n === 1 ? t('chest1') : t('chestN', { n }), { size: 22, color: '#fff3c4', strokeThickness: 0, shadow: false });
    const coin = scene.add.image(-36, H / 2 - 34, COIN).setDisplaySize(30, 30);
    const cz = txt(scene, 0, H / 2 - 33, t('coinsPlus', { n: coins }), { title: true, size: 22, color: '#ffe68a', strokeThickness: 4 }).setOrigin(0, 0.5);
    coin.setX(-(cz.width + 38) / 2 + 15);
    cz.setX(coin.x + 22);
    this.root.add([hit, bg, icon, title, sub, coin, cz]);
    this.spinPool = [...WEAPON_IDS.map((w) => weaponArt(w)), ...PASSIVE_IDS.map((p) => passiveArt(p)), HEAL, GOLD];
    cards.forEach((card, i) => {
      const x = (i - (n - 1) / 2) * (REEL + 34);
      const frame = scene.add.graphics();
      frame.fillStyle(0x0b0804, 0.92).fillRoundedRect(x - REEL / 2, -60, REEL, REEL + 20, 18);
      frame.lineStyle(4, 0xffd23f, 0.9).strokeRoundedRect(x - REEL / 2, -60, REEL, REEL + 20, 18);
      const img = scene.add.image(x, 10, this.spinPool[i % this.spinPool.length]).setDisplaySize(92, 92);
      // the reel window's shading, top and bottom
      const shade = scene.add.graphics();
      shade.fillStyle(0x000000, 0.45).fillRect(x - REEL / 2 + 4, -56, REEL - 8, 18).fillRect(x - REEL / 2 + 4, REEL - 62, REEL - 8, 18);
      const tx = cardText(card);
      const col = RARITY_COLOR[card.rarity];
      const name = txt(scene, x, 96, tx.name, { title: true, size: 17, color: col.text, strokeThickness: 4 }).setAlpha(0);
      if (name.width > REEL + 28) name.setScale((REEL + 28) / name.width);
      const tag = txt(scene, x, 124, levelTag(card), { size: 16, color: card.to === card.add ? '#7affc0' : '#ffd23f', strokeThickness: 3 }).setAlpha(0);
      this.root.add([frame, img, shade, name, tag]);
      this.reels.push({ img, frame, name, tag, stopAt: 0.9 + i * 0.65, stopped: false, card, x });
    });
    this.root.setScale(0.4).setAlpha(0);
    scene.tweens.add({ targets: this.root, scale: 1, alpha: 1, duration: 320, ease: 'Back.easeOut' });
    this.holdT = 1.6;
  }

  /** Stops the reels at once (a tap), or closes when they all stand. */
  hurry(): void {
    if (this.done) return;
    if (this.reels.every((r) => r.stopped)) { this.close(); return; }
    for (const r of this.reels) r.stopAt = Math.min(r.stopAt, this.t);
  }

  key(code: string): boolean {
    if (code === 'Enter' || code === 'Space' || code === 'KeyE') { this.hurry(); return true; }
    return false;
  }

  update(dt: number): void {
    if (this.done) return;
    this.t += dt;
    this.tick -= dt;
    const spin = this.tick <= 0;
    if (spin) this.tick = 0.07;
    let left = 0;
    for (const r of this.reels) {
      if (r.stopped) continue;
      if (this.t >= r.stopAt) { this.stop(r); continue; }
      left++;
      if (spin) {
        r.img.setTexture(this.spinPool[Math.floor(Math.random() * this.spinPool.length)]).setDisplaySize(92, 92);
        r.img.y = -6;
        this.scene.tweens.add({ targets: r.img, y: 10, duration: 60 });
      }
    }
    if (spin && left) this.sfx('reel', 0.18, 0.9 + Math.random() * 0.3);
    if (!left) {
      this.holdT -= dt;
      if (this.holdT <= 0) this.close();
    }
  }

  private stop(r: (typeof this.reels)[number]): void {
    r.stopped = true;
    const c = r.card;
    r.img.setTexture(cardArt(c.kind, c.id)).setDisplaySize(92, 92);
    r.img.y = 10;
    const col = RARITY_COLOR[c.rarity];
    r.frame.clear()
      .fillStyle(col.dark, 0.95).fillRoundedRect(r.x - REEL / 2, -60, REEL, REEL + 20, 18)
      .lineStyle(5, col.frame, 1).strokeRoundedRect(r.x - REEL / 2, -60, REEL, REEL + 20, 18);
    this.scene.tweens.add({ targets: r.img, scale: { from: r.img.scale * 1.35, to: r.img.scale }, duration: 260, ease: 'Back.easeOut' });
    this.scene.tweens.add({ targets: [r.name, r.tag], alpha: 1, duration: 200 });
    const burst = this.scene.add.graphics();
    burst.lineStyle(5, col.frame, 1).strokeRoundedRect(r.x - REEL / 2, -60, REEL, REEL + 20, 18);
    this.root.add(burst);
    this.scene.tweens.add({ targets: burst, alpha: 0, duration: 420, onComplete: () => burst.destroy() });
    this.sfx(c.rarity === 'epic' || c.rarity === 'legend' ? 'epic' : 'star', 0.55);
  }

  close(): void {
    if (this.done) return;
    this.done = true;
    this.scene.tweens.add({ targets: this.root, scale: 0.85, alpha: 0, duration: 240, ease: 'Quad.easeIn', onComplete: () => this.root.destroy() });
    this.onClose();
  }

  destroy(): void { this.done = true; this.root.destroy(); }

  get ready(): boolean { return this.reels.every((r) => r.stopped); }
}
