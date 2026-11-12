// Crypt Crawler: the 2D parts over the 3D dungeon: glass panels, the upgrade icons (drawn as
// vector shapes), the minimap chip and the boss bar.
import Phaser from 'phaser';
import { hudChip, HudChip, txt } from '@core';
import type { Sim, UpgradeId, MetaId } from './sim';

export const UI_DEPTH = 8000;

/** A frosted glass panel. */
export function glass(g: Phaser.GameObjects.Graphics, x: number, y: number, w: number, h: number, r = 26, tint = 0x15111f, alpha = 0.86): Phaser.GameObjects.Graphics {
  g.fillStyle(0x000000, 0.3).fillRoundedRect(x, y + 8, w, h, r);
  g.fillStyle(tint, alpha).fillRoundedRect(x, y, w, h, r);
  g.fillStyle(0xffffff, 0.07).fillRoundedRect(x + 6, y + 5, w - 12, Math.min(h * 0.4, 70), { tl: r - 4, tr: r - 4, bl: 8, br: 8 });
  g.lineStyle(2, 0xffffff, 0.28).strokeRoundedRect(x, y, w, h, r);
  return g;
}

/** Icon colours per upgrade. */
export const UP_COLOR: Record<UpgradeId | MetaId, number> = {
  damage: 0xff6a4a, speed: 0xffc04a, dash: 0x6ad8ff, heart: 0xff4a6a, lifesteal: 0xd04aff, orbit: 0xb0c4ff,
  reach: 0x9cff6a, whirl: 0x4affd2, magnet: 0xffd23f, shield: 0xc8ced8,
  vigor: 0xff4a6a, edge: 0xff6a4a, greed: 0xffd23f, boots: 0x6ad8ff, blessing: 0xfff2a8,
};

/** Draws an upgrade's icon centred at (x, y), `s` = half size. */
export function drawIcon(g: Phaser.GameObjects.Graphics, id: UpgradeId | MetaId, x: number, y: number, s: number): void {
  const col = UP_COLOR[id];
  g.fillStyle(col, 0.18).fillCircle(x, y, s * 1.05);
  g.lineStyle(3, col, 0.9).strokeCircle(x, y, s * 1.05);
  const sword = (cx: number, cy: number, ang: number, len: number, c = 0xe8eef8) => {
    const dx = Math.cos(ang), dy = Math.sin(ang), px = -dy, py = dx;
    const w = len * 0.11;
    g.fillStyle(c, 1).fillPoints([
      new Phaser.Math.Vector2(cx - dx * len * 0.2 + px * w, cy - dy * len * 0.2 + py * w),
      new Phaser.Math.Vector2(cx + dx * len * 0.6 + px * w, cy + dy * len * 0.6 + py * w),
      new Phaser.Math.Vector2(cx + dx * len * 0.8, cy + dy * len * 0.8),
      new Phaser.Math.Vector2(cx + dx * len * 0.6 - px * w, cy + dy * len * 0.6 - py * w),
      new Phaser.Math.Vector2(cx - dx * len * 0.2 - px * w, cy - dy * len * 0.2 - py * w),
    ], true);
    g.lineStyle(w * 1.3, 0x8a5a2b, 1).lineBetween(cx - dx * len * 0.2 + px * len * 0.22, cy - dy * len * 0.2 + py * len * 0.22, cx - dx * len * 0.2 - px * len * 0.22, cy - dy * len * 0.2 - py * len * 0.22);
    g.lineStyle(w * 1.2, 0x5a3a1b, 1).lineBetween(cx - dx * len * 0.2, cy - dy * len * 0.2, cx - dx * len * 0.45, cy - dy * len * 0.45);
  };
  const heart = (cx: number, cy: number, r: number, c: number) => {
    g.fillStyle(c, 1);
    g.fillCircle(cx - r * 0.5, cy - r * 0.2, r * 0.55);
    g.fillCircle(cx + r * 0.5, cy - r * 0.2, r * 0.55);
    g.fillTriangle(cx - r * 1.02, cy - r * 0.05, cx + r * 1.02, cy - r * 0.05, cx, cy + r * 1.0);
  };
  const bolt = (cx: number, cy: number, r: number, c: number) => {
    g.fillStyle(c, 1).fillPoints([
      new Phaser.Math.Vector2(cx + r * 0.2, cy - r), new Phaser.Math.Vector2(cx - r * 0.55, cy + r * 0.15), new Phaser.Math.Vector2(cx - r * 0.02, cy + r * 0.15),
      new Phaser.Math.Vector2(cx - r * 0.2, cy + r), new Phaser.Math.Vector2(cx + r * 0.55, cy - r * 0.15), new Phaser.Math.Vector2(cx + r * 0.02, cy - r * 0.15),
    ], true);
  };
  switch (id) {
    case 'damage': case 'edge':
      sword(x - s * 0.1, y + s * 0.1, -Math.PI / 4, s * 1.5);
      if (id === 'edge') g.fillStyle(0xffd23f, 1).fillCircle(x + s * 0.45, y + s * 0.45, s * 0.18);
      break;
    case 'speed':
      sword(x - s * 0.2, y + s * 0.15, -Math.PI / 4, s * 1.3);
      g.lineStyle(4, col, 1);
      for (const k of [0, 1, 2]) g.lineBetween(x - s * 0.9, y - s * 0.1 + k * s * 0.3, x - s * 0.45, y - s * 0.1 + k * s * 0.3);
      break;
    case 'dash': case 'boots':
      for (const k of [0, 1]) {
        g.lineStyle(6, k ? 0xffffff : col, 1);
        g.beginPath();
        g.moveTo(x - s * 0.6 + k * s * 0.45, y - s * 0.5);
        g.lineTo(x - s * 0.1 + k * s * 0.45, y);
        g.lineTo(x - s * 0.6 + k * s * 0.45, y + s * 0.5);
        g.strokePath();
      }
      break;
    case 'heart': case 'vigor':
      heart(x, y, s * 0.62, 0xff4a6a);
      g.fillStyle(0xffffff, 1).fillRect(x - s * 0.08, y - s * 0.5, s * 0.16, s * 0.5).fillRect(x - s * 0.25, y - s * 0.33, s * 0.5, s * 0.16);
      break;
    case 'lifesteal':
      sword(x - s * 0.1, y + s * 0.1, -Math.PI / 4, s * 1.4, 0xd88aff);
      heart(x + s * 0.45, y + s * 0.45, s * 0.28, 0xff4a6a);
      break;
    case 'orbit':
      g.lineStyle(3, 0xffffff, 0.6).strokeCircle(x, y, s * 0.6);
      g.fillStyle(0x8ab0ff, 1).fillCircle(x, y, s * 0.18);
      for (let k = 0; k < 3; k++) {
        const a = k * Math.PI * 2 / 3;
        sword(x + Math.cos(a) * s * 0.6, y + Math.sin(a) * s * 0.6, a + Math.PI / 2, s * 0.6);
      }
      break;
    case 'reach':
      g.lineStyle(5, col, 0.9);
      g.beginPath();
      g.arc(x - s * 0.3, y + s * 0.3, s * 0.95, -Math.PI * 0.5, 0);
      g.strokePath();
      sword(x - s * 0.3, y + s * 0.3, -Math.PI / 4, s * 1.4);
      break;
    case 'whirl':
      g.lineStyle(5, col, 1);
      for (let k = 0; k < 3; k++) {
        g.beginPath();
        g.arc(x, y, s * (0.3 + k * 0.22), k * 2, k * 2 + Math.PI * 1.3);
        g.strokePath();
      }
      break;
    case 'magnet': case 'greed':
      g.lineStyle(s * 0.32, 0xff4a4a, 1);
      g.beginPath();
      g.arc(x, y - s * 0.05, s * 0.5, Math.PI, 0, false);
      g.strokePath();
      g.fillStyle(0xd8dde8, 1).fillRect(x - s * 0.66, y - s * 0.08, s * 0.32, s * 0.32).fillRect(x + s * 0.34, y - s * 0.08, s * 0.32, s * 0.32);
      g.fillStyle(0xffd23f, 1).fillCircle(x, y + s * 0.55, s * 0.2);
      break;
    case 'shield':
      g.fillStyle(0xc8ced8, 1).fillPoints([
        new Phaser.Math.Vector2(x - s * 0.6, y - s * 0.55), new Phaser.Math.Vector2(x + s * 0.6, y - s * 0.55),
        new Phaser.Math.Vector2(x + s * 0.55, y + s * 0.1), new Phaser.Math.Vector2(x, y + s * 0.7), new Phaser.Math.Vector2(x - s * 0.55, y + s * 0.1),
      ], true);
      g.fillStyle(0x6a7488, 1).fillRect(x - s * 0.08, y - s * 0.45, s * 0.16, s * 0.95);
      break;
    case 'blessing':
      bolt(x, y, s * 0.7, 0xfff2a8);
      break;
  }
}

/** Minimap of the floor in a glass chip: explored rooms, the current one, known doors. */
export class Minimap {
  chip: HudChip | null = null;
  private g: Phaser.GameObjects.Graphics;
  private key = '';
  private dims = '';
  private visible = true;
  private static CW = 20;
  private static CH = 24;
  private static GAP = 5;

  constructor(private scene: Phaser.Scene, private right: number, private top: number) {
    this.g = scene.add.graphics();
  }

  update(sim: Sim, time: number): void {
    const f = sim.floor;
    const { CW, CH, GAP } = Minimap;
    const gw = Math.max(...f.rooms.map((r) => r.gx)) + 1, gh = Math.max(...f.rooms.map((r) => r.gy)) + 1;
    const W = gw * (CW + GAP) - GAP, H = gh * (CH + GAP) - GAP;
    const dims = `${gw}x${gh}`;
    if (dims !== this.dims || !this.chip) {
      this.dims = dims;
      this.chip?.remove(this.g);
      this.chip?.destroy();
      this.g.setData('chipWidth', W);
      this.chip = hudChip(this.scene, this.right, this.top + (H + 18) / 2, { align: 'right', text: '', height: H + 18, minWidth: W + 24 });
      this.chip.setItems([this.g]);
      this.chip.setVisible(this.visible);
      this.key = '';
    }
    const hx0 = Math.round(sim.hero.x * 2), hz0 = Math.round(sim.hero.z * 2);
    const k = f.rooms.map((r) => (r.known ? 1 : 0) + (r.visited ? 2 : 0) + (r.cleared ? 4 : 0) + (r.used ? 8 : 0)).join('') + '|' + sim.room + '|' + f.stairs.active + '|' + (Math.floor(time * 3) % 2) + f.doors.map((d) => +d.keyLocked).join('') + hx0 + ',' + hz0;
    if (k === this.key) return;
    this.key = k;
    const g = this.g;
    g.clear();
    const ox = -W / 2, oy = -H / 2;
    const at = (gx: number, gy: number) => [ox + gx * (CW + GAP), oy + gy * (CH + GAP)];
    for (const d of f.doors) {
      const A = f.rooms[d.a], B = f.rooms[d.b];
      if (!(A.visited || B.visited)) continue;
      const [ax, ay] = at(A.gx, A.gy), [bx, by] = at(B.gx, B.gy);
      g.lineStyle(4, d.keyLocked ? 0xffd23f : 0x9aa3c0, 0.9).lineBetween(ax + CW / 2, ay + CH / 2, bx + CW / 2, by + CH / 2);
    }
    for (const r of f.rooms) {
      if (!r.known) continue;
      const [x, y] = at(r.gx, r.gy);
      const cur = r.id === sim.room;
      if (r.visited) g.fillStyle(cur ? 0xfff2c8 : r.cleared ? 0x8a93b5 : 0xc0584a, 1).fillRoundedRect(x, y, CW, CH, 5);
      else {
        g.fillStyle(0x2a2f45, 1).fillRoundedRect(x, y, CW, CH, 5);
        g.lineStyle(2, 0x6a7395, 1).strokeRoundedRect(x, y, CW, CH, 5);
      }
      if (cur && Math.floor(time * 3) % 2 === 0) g.lineStyle(3, 0xffd23f, 1).strokeRoundedRect(x - 2, y - 2, CW + 4, CH + 4, 6);
      const cx = x + CW / 2, cy = y + CH / 2;
      if (r.type === 'shrine' && !r.used) g.fillStyle(0xffc84a, 1).fillCircle(cx, cy, 5);
      else if (r.type === 'boss') g.fillStyle(0xff3a3a, 1).fillCircle(cx, cy, 6);
      else if (r.type === 'exit') g.fillStyle(f.stairs.active ? 0x4ae0ff : 0x2a7a9a, 1).fillTriangle(cx - 5, cy - 4, cx + 5, cy - 4, cx, cy + 5);
      else if (r.type === 'vault') g.fillStyle(0xffd23f, 1).fillRect(cx - 4, cy - 4, 8, 8);
    }
    const hx = ox + (sim.hero.x - 0.5) / 10 * (CW + GAP), hy = oy + (sim.hero.z - 0.5) / 12 * (CH + GAP);
    g.fillStyle(0x000000, 0.6).fillCircle(hx, hy, 4.5);
    g.fillStyle(0x4aff8a, 1).fillCircle(hx, hy, 3.2);
  }

  /** Bottom edge of the chip (things below it start here). */
  get bottom(): number { return this.chip ? this.chip.y + (this.chip.height || 0) : this.top; }

  setVisible(v: boolean): void { this.visible = v; this.chip?.setVisible(v); }
}

/** The boss's health bar with its name, under the HUD. */
export class BossBar {
  private g: Phaser.GameObjects.Graphics;
  private name: Phaser.GameObjects.Text;
  private shown = 0;
  constructor(scene: Phaser.Scene, private x: number, private y: number, private w: number) {
    this.g = scene.add.graphics().setDepth(UI_DEPTH - 10).setScrollFactor(0);
    this.name = txt(scene, x + w / 2, y - 22, '', { size: 24, color: '#ffd6c8' }).setDepth(UI_DEPTH - 9).setScrollFactor(0);
    this.set(null, 0, 0, false);
  }
  set(label: string | null, hp: number, max: number, rage: boolean): void {
    const g = this.g;
    g.clear();
    this.name.setVisible(!!label);
    if (!label) return;
    this.name.setText(label);
    const k = Math.max(0, hp / max);
    this.shown += (k - this.shown) * 0.15;
    if (Math.abs(this.shown - k) < 0.002) this.shown = k;
    const { x, y, w } = this;
    g.fillStyle(0x000000, 0.55).fillRoundedRect(x - 4, y - 4, w + 8, 26, 10);
    g.fillStyle(0xffffff, 0.35).fillRoundedRect(x, y, w * this.shown, 18, 7);
    g.fillStyle(rage ? 0xff3a2a : 0xd8384a, 1).fillRoundedRect(x, y, Math.max(8, w * k), 18, 7);
    g.fillStyle(0xffffff, 0.25).fillRoundedRect(x + 3, y + 2, Math.max(4, w * k - 6), 6, 3);
  }
}
