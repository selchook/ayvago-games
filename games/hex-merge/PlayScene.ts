import Phaser from 'phaser';
import { ArcadeScene, burst, shake, popup, txt, t, rng } from '@core';

const SIZE = 60;                     // hex circumradius
const SQ3 = Math.sqrt(3);
const RADIUS = 3;                    // board radius in hexes (37 cells)
const CX = 360;
const CY = 590;
const MAXV = 7;
const BOMB = 99;
const STONE = -1;
const TRAY_Y = 1100;
const CUR_X = 290;
const NEXT_X = 500;
export const HEX_COLORS: Record<number, number> = {
  1: 0x3ee6ff, 2: 0x5dff7a, 3: 0xffd23f, 4: 0xffa53a, 5: 0xec3013, 6: 0xff4fa3, 7: 0x8b5cff, [BOMB]: 0x2a2a3a,
};
const AXIAL_DIRS: Array<[number, number]> = [[1, 0], [1, -1], [0, -1], [-1, 0], [-1, 1], [0, 1]];

function hexPoints(r: number, cx: number, cy: number): Phaser.Math.Vector2[] {
  const pts: Phaser.Math.Vector2[] = [];
  for (let k = 0; k < 6; k++) {
    const a = (Math.PI / 3) * k;
    pts.push(new Phaser.Math.Vector2(cx + r * Math.cos(a), cy + r * Math.sin(a)));
  }
  return pts;
}

/** Flat-top hex textures: tintable tile, empty slot and stone. */
export function makeHexTextures(scene: Phaser.Scene): void {
  if (scene.textures.exists('hx-tile')) return;
  const W = SIZE * 2, H = Math.ceil(SQ3 * SIZE) + 6;
  const g = scene.make.graphics({ x: 0, y: 0 }, false);
  g.fillStyle(0x000000, 0.5).fillPoints(hexPoints(SIZE - 3, SIZE, H / 2 + 4), true);
  g.fillStyle(0x6e6e6e).fillPoints(hexPoints(SIZE - 3, SIZE, H / 2), true);
  g.fillStyle(0xffffff).fillPoints(hexPoints(SIZE - 9, SIZE, H / 2 - 1), true);
  g.fillStyle(0xcfcfcf).fillPoints(hexPoints(SIZE - 22, SIZE, H / 2 + 2), true);
  g.fillStyle(0xffffff, 0.8).fillRect(SIZE - 22, H / 2 - SIZE * 0.68, 44, 5);
  g.generateTexture('hx-tile', W, H);
  g.clear();
  g.fillStyle(0x000000, 0.45).fillPoints(hexPoints(SIZE - 4, SIZE, H / 2), true);
  g.lineStyle(3, 0x4a3f7a, 1).strokePoints(hexPoints(SIZE - 6, SIZE, H / 2), true);
  g.generateTexture('hx-slot', W, H);
  g.clear();
  g.fillStyle(0x000000, 0.5).fillPoints(hexPoints(SIZE - 3, SIZE, H / 2 + 4), true);
  g.fillStyle(0x4f4a58).fillPoints(hexPoints(SIZE - 3, SIZE, H / 2), true);
  g.fillStyle(0x6d6878).fillPoints(hexPoints(SIZE - 12, SIZE, H / 2 - 2), true);
  g.fillStyle(0x3a3642);
  g.fillCircle(SIZE - 18, H / 2 - 10, 7).fillCircle(SIZE + 16, H / 2 + 8, 9).fillCircle(SIZE + 4, H / 2 - 22, 4).fillCircle(SIZE - 10, H / 2 + 20, 5);
  g.generateTexture('hx-stone', W, H);
  g.destroy();
}

interface HexCell { q: number; r: number; x: number; y: number; v: number; piece: Phaser.GameObjects.Container | null; nb: number[] }

export class PlayScene extends ArcadeScene {
  private cells: HexCell[] = [];
  private cur = 1;
  private next = 1;
  private curC!: Phaser.GameObjects.Container;
  private nextC!: Phaser.GameObjects.Container;
  private swapUsed = false;
  private locked = false;
  private placed = 0;
  private level = 1;
  private best = 1;
  private cursor = 0;
  private showCursor = false;
  private cursorImg!: Phaser.GameObjects.Image;
  private hintText!: Phaser.GameObjects.Text;
  private maxText!: Phaser.GameObjects.Text;
  private downX = 0;
  private downY = 0;
  private over = false;

  createGame(): void {
    makeHexTextures(this);
    this.textures.get('ob').setFilter(Phaser.Textures.FilterMode.NEAREST);
    this.cells = []; this.swapUsed = false; this.locked = false; this.placed = 0; this.level = 1; this.best = 1;
    this.showCursor = false; this.over = false;

    for (let q = -RADIUS; q <= RADIUS; q++) for (let r = -RADIUS; r <= RADIUS; r++) {
      if (Math.abs(q + r) > RADIUS) continue;
      this.cells.push({ q, r, x: CX + 1.5 * SIZE * q, y: CY + SQ3 * SIZE * (r + q / 2), v: 0, piece: null, nb: [] });
    }
    for (const c of this.cells) {
      c.nb = AXIAL_DIRS.map(([dq, dr]) => this.cells.findIndex((o) => o.q === c.q + dq && o.r === c.r + dr)).filter((i) => i >= 0);
    }
    this.cells.forEach((c, i) => {
      const s = this.add.image(c.x, c.y, 'hx-slot').setScale(0);
      this.tweens.add({ targets: s, scale: 1, duration: 300, delay: i * 14, ease: 'Back.easeOut' });
    });
    this.cursor = this.cells.findIndex((c) => c.q === 0 && c.r === 0);
    this.cursorImg = this.add.image(0, 0, 'hx-slot').setTint(0xffd23f).setScale(1.08).setDepth(8).setVisible(false).setBlendMode(Phaser.BlendModes.ADD);

    this.maxText = txt(this, 360, 112, '', { title: true, size: 20, color: '#ffd23f' }).setDepth(9);
    // tray
    const tray = this.add.graphics();
    tray.fillStyle(0x000000, 0.45).fillRoundedRect(150, TRAY_Y - 80, 420, 160, 20);
    tray.lineStyle(4, 0x4a3f7a, 1).strokeRoundedRect(150, TRAY_Y - 80, 420, 160, 20);
    txt(this, NEXT_X, TRAY_Y - 58, t('nextPiece'), { title: true, size: 14, color: '#aab0d0' });
    this.hintText = txt(this, 360, TRAY_Y + 118, t('swap'), { title: true, size: 16, color: '#ff4fa3' });
    this.cur = this.gen(); this.next = this.gen();
    this.curC = this.add.container(CUR_X, TRAY_Y).setDepth(6);
    this.nextC = this.add.container(NEXT_X, TRAY_Y + 10).setDepth(6).setScale(0.62);
    this.drawPiece(this.curC, this.cur);
    this.drawPiece(this.nextC, this.next);
    this.tweens.add({ targets: this.curC, y: TRAY_Y - 6, duration: 600, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });

    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => { this.downX = p.x; this.downY = p.y; });
    this.input.on('pointerup', (p: Phaser.Input.Pointer) => {
      if (Phaser.Math.Distance.Between(p.x, p.y, this.downX, this.downY) > 30) return;
      if (Phaser.Math.Distance.Between(p.x, p.y, CUR_X, TRAY_Y) < 70 || Phaser.Math.Distance.Between(p.x, p.y, NEXT_X, TRAY_Y) < 60) { this.swap(); return; }
      const i = this.cellAt(p.x, p.y);
      if (i < 0) return;
      this.showCursor = false; this.cursorImg.setVisible(false); this.cursor = i;
      this.place(i);
    });
    this.input.keyboard?.on('keydown', (e: KeyboardEvent) => this.onKey(e));
    this.updateHud();
  }

  updateGame(): void { /* event driven */ }

  // ---------- pieces ----------

  private gen(): number {
    if (this.level >= 2 && this.placed > 8 && rng.chance(0.05)) return BOMB;
    const maxV = Math.min(5, 3 + Math.floor((this.level - 1) / 2));
    const weights = [40, 30, 18, 8, 4].slice(0, maxV);
    let roll = Math.random() * weights.reduce((a, b) => a + b, 0);
    for (let v = 0; v < weights.length; v++) { roll -= weights[v]; if (roll <= 0) return v + 1; }
    return 1;
  }

  private drawPiece(c: Phaser.GameObjects.Container, v: number): void {
    c.removeAll(true);
    if (v === STONE) { c.add(this.add.image(0, 0, 'hx-stone')); return; }
    c.add(this.add.image(0, 0, 'hx-tile').setTint(HEX_COLORS[v]));
    if (v === BOMB) c.add(this.add.image(0, 0, 'ob', 477).setScale(3.6));
    else c.add(this.add.text(0, 2, String(v), { fontFamily: '"Press Start 2P", monospace', fontSize: '34px', color: '#ffffff', stroke: '#000000', strokeThickness: 7 }).setOrigin(0.5));
  }

  private makePiece(i: number, v: number): Phaser.GameObjects.Container {
    const cell = this.cells[i];
    const c = this.add.container(cell.x, cell.y).setDepth(5);
    this.drawPiece(c, v);
    cell.piece = c;
    cell.v = v;
    return c;
  }

  private clearCell(i: number, fx = true): void {
    const cell = this.cells[i];
    const p = cell.piece;
    if (p) {
      if (fx) burst(this, cell.x, cell.y, cell.v === STONE ? [0x6d6878, 0x3a3642] : [HEX_COLORS[cell.v] ?? 0xffffff, 0xffffff], 12, 240);
      this.tweens.add({ targets: p, scale: 0, angle: 90, duration: 200, onComplete: () => p.destroy() });
    }
    cell.piece = null;
    cell.v = 0;
  }

  private cellAt(px: number, py: number): number {
    let best = -1, bd = SIZE * 0.92;
    this.cells.forEach((c, i) => {
      const d = Phaser.Math.Distance.Between(px, py, c.x, c.y);
      if (d < bd) { bd = d; best = i; }
    });
    return best;
  }

  // ---------- turn ----------

  private swap(): void {
    if (this.locked || this.over) return;
    if (this.swapUsed) { this.sfx('nope', { volume: 0.35 }); this.tweens.add({ targets: this.hintText, x: 368, duration: 40, yoyo: true, repeat: 2 }); return; }
    this.swapUsed = true;
    [this.cur, this.next] = [this.next, this.cur];
    this.drawPiece(this.curC, this.cur);
    this.drawPiece(this.nextC, this.next);
    this.tweens.add({ targets: this.curC, angle: { from: -180, to: 0 }, duration: 260, ease: 'Back.easeOut' });
    this.tweens.add({ targets: this.nextC, angle: { from: 180, to: 0 }, duration: 260, ease: 'Back.easeOut' });
    this.sfx('swap', { volume: 0.5 });
    this.updateHud();
  }

  private place(i: number): void {
    if (this.locked || this.over) return;
    const cell = this.cells[i];
    if (this.cur === BOMB) { this.locked = true; this.bomb(i); return; }
    if (cell.v !== 0) {
      this.sfx('nope', { volume: 0.35 });
      if (cell.piece) this.tweens.add({ targets: cell.piece, x: cell.x + 6, duration: 40, yoyo: true, repeat: 2 });
      return;
    }
    this.locked = true;
    const p = this.makePiece(i, this.cur);
    p.setPosition(cell.x, cell.y - 70).setScale(1.3).setAlpha(0);
    this.tweens.add({ targets: p, y: cell.y, scale: 1, alpha: 1, duration: 170, ease: 'Quad.easeIn' });
    this.sfx('drop', { volume: 0.5, detune: rng.int(-100, 100) });
    this.addScore(this.cur);
    this.time.delayedCall(190, () => {
      burst(this, cell.x, cell.y + 20, [0xffffff, HEX_COLORS[cell.v] ?? 0xffffff], 5, 110);
      this.resolve(i, 1);
    });
  }

  private group(i: number): number[] {
    const v = this.cells[i].v;
    const seen = new Set([i]);
    const q = [i];
    while (q.length) {
      const c = q.pop()!;
      for (const n of this.cells[c].nb) if (!seen.has(n) && this.cells[n].v === v) { seen.add(n); q.push(n); }
    }
    return [...seen];
  }

  private resolve(i: number, chain: number): void {
    const cell = this.cells[i];
    const v = cell.v;
    const grp = v > 0 && v <= MAXV ? this.group(i) : [i];
    if (grp.length < 3) { this.finishTurn(); return; }

    // stones touching the group crack and crumble
    const stones = new Set<number>();
    for (const g of grp) for (const n of this.cells[g].nb) if (this.cells[n].v === STONE) stones.add(n);
    stones.forEach((s) => this.clearCell(s));
    if (stones.size) this.sfx('crack', { volume: 0.5 });

    if (v === MAXV) { this.supernova(i, grp, chain); return; }
    const nv = v + 1;
    const pts = nv * 10 * grp.length * chain;
    for (const g of grp) {
      if (g === i) continue;
      const o = this.cells[g];
      const p = o.piece;
      o.piece = null; o.v = 0;
      if (p) this.tweens.add({ targets: p, x: cell.x, y: cell.y, scale: 0.6, duration: 180, ease: 'Cubic.easeIn', onComplete: () => p.destroy() });
    }
    this.time.delayedCall(190, () => {
      cell.v = nv;
      if (cell.piece) this.drawPiece(cell.piece, nv);
      this.tweens.add({ targets: cell.piece, scale: { from: 1.45, to: 1 }, duration: 260, ease: 'Back.easeOut' });
      burst(this, cell.x, cell.y, [HEX_COLORS[nv], 0xffffff, HEX_COLORS[v]], 18 + chain * 6, 260 + chain * 40);
      this.sfx(chain > 1 ? 'chain' : 'merge', { volume: 0.55, detune: (nv - 2) * 120 + (chain - 1) * 100 });
      this.addScore(pts, cell.x, cell.y - 50);
      if (chain > 1) {
        popup(this, CX, CY - 380, `${t('chain')} x${chain}`, '#ff4fa3', 26);
        shake(this, 0.004 * chain, 140);
      }
      if (nv > this.best) { this.best = nv; this.updateHud(); this.tweens.add({ targets: this.maxText, scale: { from: 1.5, to: 1 }, duration: 300, ease: 'Back.easeOut' }); }
      this.time.delayedCall(240, () => this.resolve(i, chain + 1));
    });
  }

  private supernova(i: number, grp: number[], chain: number): void {
    const cell = this.cells[i];
    const area = new Set(grp);
    for (const g of grp) for (const n of this.cells[g].nb) area.add(n);
    const pts = 1000 * chain + area.size * 20;
    area.forEach((a, k) => this.time.delayedCall(k * 25, () => this.clearCell(a)));
    this.sfx('nova', { volume: 0.7 });
    shake(this, 0.025, 450);
    softFlash(this, HEX_COLORS[MAXV], 0.4);
    for (let k = 0; k < 5; k++) this.time.delayedCall(k * 90, () => burst(this, cell.x + rng.int(-80, 80), cell.y + rng.int(-80, 80), [0x8b5cff, 0xff4fa3, 0xffd23f, 0xffffff], 30, 460));
    popup(this, CX, CY - 380, t('nova'), '#8b5cff', 30);
    this.addScore(pts, cell.x, cell.y - 40);
    this.time.delayedCall(area.size * 25 + 250, () => this.finishTurn());
  }

  private bomb(i: number): void {
    const cell = this.cells[i];
    const area = [i, ...cell.nb];
    let pts = 0;
    for (const a of area) { const v = this.cells[a].v; if (v > 0 && v <= MAXV) pts += v * 5; }
    area.forEach((a) => this.clearCell(a));
    burst(this, cell.x, cell.y, [0xec3013, 0xffd23f, 0xffa53a, 0xffffff], 40, 420);
    shake(this, 0.02, 300);
    softFlash(this, 0xffa53a, 0.3);
    this.sfx('boom', { volume: 0.6 });
    if (pts) this.addScore(pts, cell.x, cell.y - 40);
    this.time.delayedCall(260, () => this.finishTurn());
  }

  private finishTurn(): void {
    this.placed++;
    this.cur = this.next;
    this.next = this.gen();
    this.swapUsed = false;
    this.drawPiece(this.curC, this.cur);
    this.drawPiece(this.nextC, this.next);
    this.curC.setScale(0);
    this.tweens.add({ targets: this.curC, scale: 1, duration: 220, ease: 'Back.easeOut' });
    if (this.placed % 12 === 0) this.levelUp();
    this.locked = false;
    this.updateHud();
    this.checkOver();
  }

  private levelUp(): void {
    this.level++;
    this.sfx('levelup', { volume: 0.5 });
    popup(this, CX, CY - 380, `${t('level')} ${this.level}`, '#3ee6ff', 28);
    if (this.level < 3) return;
    const empty = this.cells.map((c, i) => (c.v === 0 ? i : -1)).filter((i) => i >= 0);
    if (empty.length < 6) return;
    const s = rng.pick(empty);
    const cell = this.cells[s];
    const p = this.makePiece(s, STONE);
    p.setY(cell.y - 300).setAlpha(0);
    this.tweens.add({
      targets: p, y: cell.y, alpha: 1, duration: 420, ease: 'Bounce.easeOut', delay: 300,
      onComplete: () => { this.sfx('stone', { volume: 0.6 }); shake(this, 0.01, 160); burst(this, cell.x, cell.y + 30, [0x6d6878, 0x3a3642], 12, 200); },
    });
    this.time.delayedCall(300, () => popup(this, CX, CY - 330, t('stoneWarn'), '#aab0d0', 20));
  }

  private checkOver(): void {
    if (this.cells.some((c) => c.v === 0)) return;
    if (this.cur === BOMB || (this.next === BOMB && !this.swapUsed)) return;
    this.over = true;
    this.locked = true;
    this.cursorImg.setVisible(false);
    this.sfx('boom', { volume: 0.6 });
    shake(this, 0.02, 400);
    this.cells.forEach((c, k) => this.time.delayedCall(k * 30, () => c.piece?.list.forEach((o) => (o as Phaser.GameObjects.Image).setTint?.(0x555566))));
    const band = this.add.rectangle(360, CY, 720, 130, 0x000000, 0.8).setDepth(40);
    const msg = txt(this, 360, CY, t('boardFull'), { title: true, size: 38, color: '#ec3013' }).setDepth(41).setScale(0);
    this.tweens.add({ targets: msg, scale: 1, duration: 400, ease: 'Back.easeOut' });
    void band;
    this.endGame({ delay: 1800, title: t('boardFull') });
  }

  // ---------- keyboard ----------

  private onKey(e: KeyboardEvent): void {
    if (this.over) return;
    const dirs: Record<string, [number, number]> = {
      ArrowLeft: [-1, 0], KeyA: [-1, 0], ArrowRight: [1, 0], KeyD: [1, 0], ArrowUp: [0, -1], KeyW: [0, -1], ArrowDown: [0, 1], KeyS: [0, 1],
    };
    const d = dirs[e.code];
    if (d) {
      const c = this.cells[this.cursor];
      let best = -1, bs = Infinity;
      this.cells.forEach((o, i) => {
        if (i === this.cursor) return;
        const dx = o.x - c.x, dy = o.y - c.y;
        const along = dx * d[0] + dy * d[1];
        if (along <= 10) return;
        const side = Math.abs(dx * d[1] - dy * d[0]);
        const score = along + side * 2;
        if (score < bs) { bs = score; best = i; }
      });
      if (best >= 0) this.cursor = best;
      this.showCursor = true;
      this.moveCursor();
      this.sfx('move', { volume: 0.25 });
    } else if (e.code === 'Space' || e.code === 'KeyZ' || e.code === 'Enter') {
      this.showCursor = true; this.moveCursor(); this.place(this.cursor);
    } else if (e.code === 'KeyX' || e.code === 'ShiftLeft' || e.code === 'ShiftRight') this.swap();
  }

  private moveCursor(): void {
    const c = this.cells[this.cursor];
    this.cursorImg.setPosition(c.x, c.y).setVisible(this.showCursor);
  }

  private updateHud(): void {
    this.hud.setCenter(`${t('level')} ${this.level}`);
    this.maxText?.setText(`${t('maxTile')}: ${this.best}`).setColor(Phaser.Display.Color.IntegerToColor(HEX_COLORS[this.best]).rgba);
    if (this.hintText) {
      const bombNow = this.cur === BOMB;
      this.hintText.setText(bombNow ? t('bombHint') : t('swap')).setAlpha(this.swapUsed && !bombNow ? 0.35 : 1);
    }
  }
}

/** Semi-transparent screen flash (the camera flash starts fully opaque). */
function softFlash(scene: Phaser.Scene, color: number, alpha = 0.35, ms = 220): void {
  const { width, height } = scene.scale;
  const r = scene.add.rectangle(0, 0, width, height, color, alpha).setOrigin(0).setDepth(7000);
  scene.tweens.add({ targets: r, alpha: 0, duration: ms, onComplete: () => r.destroy() });
}
