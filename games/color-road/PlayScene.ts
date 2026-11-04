import Phaser from 'phaser';
import { ArcadeScene, Controls, burst, shake, popup, txt, t, rng, ensurePixel } from '@core';
import { PALETTE, makeSymbols, softFlash, banner } from './symbols';

// ---- pseudo-3D projection: world x in px at depth z = 1 (the ball), z grows into the screen ----
const CX = 360;
const HORIZON = 420;
const GROUND = 1100;                 // screen y of the road at the ball (z = 1)
const CAM_H = GROUND - HORIZON;
const LW = 290;                      // half the lane width at z = 1
const ZMAX = 9;
const BLOCK_H = 92;
const BLOCK_D = 0.16;
const GATE_H = 430;
const BALL_R = 44;
const ROWS_PER_LEVEL = 12;
const GEM = 99;
const EMPTY = -1;

const sx = (x: number, z: number) => CX + x / z;
const sy = (z: number, h = 0) => HORIZON + (CAM_H - h) / z;

interface Row {
  z: number;
  n: number;
  cells: number[];                   // palette index, EMPTY or GEM
  imgs: (Phaser.GameObjects.Image | null)[];
  done: boolean;
}
interface Gate {
  z: number;
  cols: number[];                    // one colour, or [left, right] for a split gate
  imgs: Phaser.GameObjects.Image[];
  done: boolean;
}

function shade(c: number, k: number): number {
  const r = (c >> 16) & 255, g = (c >> 8) & 255, b = c & 255;
  const f = (v: number) => Math.max(0, Math.min(255, Math.round(k >= 0 ? v + (255 - v) * k : v * (1 + k))));
  return (f(r) << 16) | (f(g) << 8) | f(b);
}

export class PlayScene extends ArcadeScene {
  private controls!: Controls;
  private sky!: Phaser.GameObjects.Graphics;
  private road!: Phaser.GameObjects.Graphics;
  private back!: Phaser.GameObjects.Graphics;
  private gateG!: Phaser.GameObjects.Graphics;
  private front!: Phaser.GameObjects.Graphics;
  private ball!: Phaser.GameObjects.Container;
  private ballG!: Phaser.GameObjects.Graphics;
  private ballSym!: Phaser.GameObjects.Image;
  private shadow!: Phaser.GameObjects.Ellipse;
  private trail!: Phaser.GameObjects.Particles.ParticleEmitter;
  private hint!: Phaser.GameObjects.Text;
  private multText!: Phaser.GameObjects.Text;
  private rows: Row[] = [];
  private gates: Gate[] = [];
  private bx = 0;
  private colour = 0;
  private genCols: number[] = [];    // colours the next rows are built for
  private genZ = 0;                  // z of the last generated thing
  private rowsSinceGate = 0;
  private nextGateIn = 6;
  private speed = 3.2;
  private dist = 0;
  private level = 1;
  private passedRows = 0;
  private combo = 0;
  private mult = 1;
  private dead = false;
  private roll = 0;

  createGame(): void {
    makeSymbols(this);
    this.rows = []; this.gates = []; this.bx = 0; this.dist = 0; this.level = 1; this.passedRows = 0;
    this.combo = 0; this.mult = 1; this.dead = false; this.roll = 0;
    this.speed = 3.2; this.rowsSinceGate = 0; this.nextGateIn = rng.int(5, 7);
    this.colour = rng.int(0, 2);
    this.genCols = [this.colour];
    this.genZ = 4.5;

    if (!this.textures.exists('cr-gem')) {
      const g = this.make.graphics({ x: 0, y: 0 }, false);
      const pts = [[32, 4], [58, 24], [32, 60], [6, 24]].map(([x, y]) => new Phaser.Math.Vector2(x, y));
      g.fillStyle(0xffffff, 1).fillPoints(pts, true);
      g.fillStyle(0xbdf4ff, 1).fillTriangle(6, 24, 58, 24, 32, 60);
      g.lineStyle(4, 0x000000, 0.7).strokePoints(pts, true).lineBetween(6, 24, 58, 24);
      g.generateTexture('cr-gem', 64, 64);
      g.destroy();
    }
    // touch: floating joystick anywhere on the screen, read as axisX (analog)
    this.controls = new Controls(this, { joystick: true });
    this.sky = this.add.graphics().setDepth(-20);
    this.drawSky();
    this.road = this.add.graphics().setDepth(-10);
    this.back = this.add.graphics().setDepth(5);
    this.gateG = this.add.graphics().setDepth(8);
    this.front = this.add.graphics().setDepth(30);

    this.shadow = this.add.ellipse(CX, GROUND + 4, BALL_R * 2.1, 22, 0x000000, 0.45).setDepth(19);
    this.ball = this.add.container(CX, GROUND - BALL_R).setDepth(20);
    this.ballG = this.add.graphics();
    this.ballSym = this.add.image(0, 0, `sym-${this.colour}`).setScale(0.78);
    this.ball.add([this.ballG, this.ballSym]);
    this.trail = this.add.particles(0, 0, ensurePixel(this), {
      x: { min: -20, max: 20 }, lifespan: 380, frequency: 26, speedY: { min: 120, max: 220 }, speedX: { min: -40, max: 40 },
      scale: { start: 4, end: 0 }, alpha: { start: 0.6, end: 0 }, tint: PALETTE[this.colour],
    }).setDepth(18);
    this.trail.startFollow(this.ball, 0, BALL_R - 6);
    this.drawBall();

    this.multText = txt(this, CX, 132, '', { title: true, size: 24, color: '#5dff7a' }).setDepth(9000);
    this.hint = txt(this, CX, 1200, t('hint'), { size: 30, wrap: 640 }).setDepth(9000);
    this.tweens.add({ targets: this.hint, alpha: 0.4, duration: 650, yoyo: true, repeat: -1 });
    this.time.delayedCall(4500, () => { this.tweens.killTweensOf(this.hint); this.tweens.add({ targets: this.hint, alpha: 0, duration: 400 }); });

    this.fill();
    this.updateHud();
  }

  private updateHud(): void {
    this.hud.setRight(`${t('level')} ${this.level}`);
    this.multText.setText(this.mult > 1 ? `x${this.mult}` : '');
  }

  // ---------- generation ----------
  private fill(): void {
    while (this.genZ < ZMAX + 1) this.generate();
  }

  private generate(): void {
    const L = this.levelAt();
    const spacing = Math.min(3.7, 2.5 + (this.speed - 3.2) * 0.3);
    if (this.rowsSinceGate >= this.nextGateIn) {
      // colour gate halfway to the next row
      const z = this.genZ + spacing * 0.55;
      const ncol = this.colourCount(L);
      const options = [...Array(ncol).keys()].filter((c) => !this.genCols.includes(c));
      const a = rng.pick(options.length ? options : [...Array(ncol).keys()]);
      let cols = [a];
      if (L >= 4 && rng.chance(0.4)) {
        const others = [...Array(ncol).keys()].filter((c) => c !== a);
        cols = rng.shuffle([a, rng.pick(others)]);
      }
      const imgs: Phaser.GameObjects.Image[] = [];
      for (let i = 0; i < (cols.length === 1 ? 3 : 4); i++) imgs.push(this.add.image(0, 0, `sym-${cols[cols.length === 1 ? 0 : Math.floor(i / 2)]}`).setDepth(9));
      this.gates.push({ z, cols, imgs, done: false });
      this.genCols = cols;
      this.genZ = z + spacing * 0.45 - spacing;
      this.rowsSinceGate = 0;
      this.nextGateIn = rng.int(Math.max(3, 6 - Math.floor(L / 3)), 8);
      return;
    }
    const z = this.genZ + spacing * (this.rows.length ? 1 : 0);
    const n = L >= 6 ? 5 : L >= 3 ? 4 : 3;
    const ncol = this.colourCount(L);
    const emptyP = Math.max(0.08, 0.5 - 0.07 * L);
    const cells = new Array(n).fill(EMPTY);
    // every colour the ball can have here gets at least one block
    const slots = rng.shuffle([...Array(n).keys()]);
    this.genCols.forEach((c, i) => { cells[slots[i]] = c; });
    for (const s of slots.slice(this.genCols.length)) {
      if (rng.chance(emptyP)) cells[s] = rng.chance(0.25) ? GEM : EMPTY;
      else if (rng.chance(L <= 2 ? 0.25 : 0.12)) cells[s] = rng.pick(this.genCols);
      else {
        const others = [...Array(ncol).keys()].filter((c) => !this.genCols.includes(c));
        cells[s] = others.length ? rng.pick(others) : EMPTY;
      }
    }
    const imgs = cells.map((c) => (c >= 0 && c !== GEM ? this.add.image(0, 0, `sym-${c}`).setDepth(6) : c === GEM ? this.add.image(0, 0, 'cr-gem').setDepth(6) : null));
    this.rows.push({ z, n, cells, imgs, done: false });
    this.genZ = z;
    this.rowsSinceGate++;
  }

  private levelAt(): number {
    // generation runs ahead of the ball: use the level the ball will have when it gets there
    return this.level + (this.passedRows % ROWS_PER_LEVEL > ROWS_PER_LEVEL - 4 ? 1 : 0);
  }

  private colourCount(L: number): number {
    return L >= 7 ? 5 : L >= 4 ? 4 : 3;
  }

  // ---------- update ----------
  updateGame(_time: number, delta: number): void {
    const dt = delta / 1000;
    if (!this.dead) {
      this.bx += this.controls.axisX * 1150 * dt;
      this.bx = Phaser.Math.Clamp(this.bx, -LW + BALL_R * 0.6, LW - BALL_R * 0.6);
      const dz = this.speed * dt;
      this.dist += dz;
      this.genZ -= dz;
      for (const r of this.rows) {
        const was = r.z;
        r.z -= dz;
        if (!r.done && was > 1 && r.z <= 1) this.passRow(r);
        if (this.dead) break;
      }
      for (const g of this.gates) {
        const was = g.z;
        g.z -= dz;
        if (!g.done && was > 1 && g.z <= 1) this.passGate(g);
      }
      this.rows = this.rows.filter((r) => {
        if (r.z > 0.62) return true;
        r.imgs.forEach((i) => i?.destroy());
        return false;
      });
      this.gates = this.gates.filter((g) => {
        if (g.z > 0.75) return true;
        g.imgs.forEach((i) => i.destroy());
        return false;
      });
      this.fill();
      this.roll += dt * this.speed * 2.2;
    }
    this.ball.x = CX + this.bx;
    this.shadow.x = this.ball.x;
    this.drawBall();
    this.drawRoad();
    this.drawThings();
  }

  private passRow(r: Row): void {
    r.done = true;
    const slot = Phaser.Math.Clamp(Math.floor(((this.bx + LW) / (2 * LW)) * r.n), 0, r.n - 1);
    const c = r.cells[slot];
    const x0 = -LW + (slot * 2 * LW) / r.n, x1 = x0 + (2 * LW) / r.n;
    const px = sx((x0 + x1) / 2, 1), py = sy(1, BLOCK_H / 2);
    if (c === EMPTY) {
      if (r.cells.includes(this.colour)) this.breakCombo();
    } else if (c === GEM) {
      r.cells[slot] = EMPTY;
      r.imgs[slot]?.destroy(); r.imgs[slot] = null;
      this.addScore(25 * this.mult, px, py - 60);
      burst(this, px, py, [0xffffff, 0x45dcf2, 0xffd83a], 22, 320);
      this.sfxAt('gem', px, { volume: 0.5 });
      if (r.cells.includes(this.colour)) this.breakCombo();
    } else if (c === this.colour) {
      r.cells[slot] = EMPTY;
      r.imgs[slot]?.destroy(); r.imgs[slot] = null;
      this.combo++;
      const m = Math.min(5, 1 + Math.floor(this.combo / 8));
      if (m > this.mult) {
        this.sfx('combo', { volume: 0.5 });
        popup(this, CX, 300, `${t('combo')} x${m}`, '#5dff7a', 28);
      }
      this.mult = m;
      this.addScore(10 * this.mult, px, py - 70);
      burst(this, px, py, [PALETTE[c], shade(PALETTE[c], 0.5), 0xffffff], 34, 460);
      this.sfxAt('smash', px, { volume: 0.55, exact: true, rate: 1 + Math.min(10, this.combo % 11) * 0.04 });
      shake(this, 0.004, 80);
      this.tweens.add({ targets: this.ball, scaleX: 1.2, scaleY: 0.85, duration: 60, yoyo: true });
      this.updateHud();
    } else {
      this.die(px, py);
      return;
    }
    this.passedRows++;
    if (this.passedRows % ROWS_PER_LEVEL === 0) this.levelUp();
  }

  private breakCombo(): void {
    if (this.combo >= 8) popup(this, CX + this.bx, GROUND - 140, t('comboLost'), '#ff8a1f', 20);
    this.combo = 0;
    this.mult = 1;
    this.updateHud();
  }

  private passGate(g: Gate): void {
    g.done = true;
    const c = g.cols.length === 1 ? g.cols[0] : this.bx < 0 ? g.cols[0] : g.cols[1];
    if (c !== this.colour) {
      this.colour = c;
      this.trail.particleTint = PALETTE[c];
      this.ballSym.setTexture(`sym-${c}`);
      this.sfx('switch', { volume: 0.55 });
      burst(this, this.ball.x, this.ball.y, [PALETTE[c], 0xffffff], 40, 420);
      softFlash(this, PALETTE[c], 90, 0.25);
      this.tweens.add({ targets: this.ball, scale: 1.35, duration: 90, yoyo: true });
    } else {
      this.sfx('pass', { volume: 0.4 });
    }
    this.addScore(5);
  }

  private levelUp(): void {
    this.level++;
    this.speed = Math.min(7.2, 3.2 + 0.4 * (this.level - 1));
    const bonus = 50 * this.level;
    this.addScore(bonus);
    banner(this, 300, `${t('level')} ${this.level}`);
    popup(this, CX, 380, `+${bonus}`, '#5dff7a');
    this.sfx('level', { volume: 0.6, exact: true });
    softFlash(this, 0xffffff, 90, 0.2);
    this.updateHud();
  }

  private die(px: number, py: number): void {
    this.dead = true;
    this.ball.setVisible(false);
    this.shadow.setVisible(false);
    this.trail.stop();
    burst(this, this.ball.x, this.ball.y, [PALETTE[this.colour], 0xffffff], 50, 560);
    burst(this, px, py, PALETTE.slice(0, 5), 40, 480);
    this.sfx('shatter', { volume: 0.6 });
    this.sfx('wrong', { volume: 0.5 });
    shake(this, 0.028, 380);
    softFlash(this, 0xec3013, 170);
    popup(this, this.ball.x, GROUND - 160, t('wrong'), '#ec3013', 24);
    this.endGame({ title: t('wrong'), delay: 1100 });
  }

  // ---------- drawing ----------
  private drawSky(): void {
    const g = this.sky;
    g.fillGradientStyle(0x120c2a, 0x120c2a, 0x3a1550, 0x3a1550, 1).fillRect(0, 0, 720, HORIZON + 2);
    // synthwave sun with cut stripes
    for (let i = 0; i < 18; i++) {
      const y = HORIZON - 10 - i * 9;
      const w = Math.sqrt(Math.max(0, 150 * 150 - (i * 9 - 10) ** 2));
      if (i < 6 && i % 2) continue;
      const col = Phaser.Display.Color.Interpolate.ColorWithColor(Phaser.Display.Color.ValueToColor(0xff4fa3), Phaser.Display.Color.ValueToColor(0xffd83a), 17, i);
      g.fillStyle(Phaser.Display.Color.GetColor(col.r, col.g, col.b), 0.9).fillRect(CX - w, y - 9, w * 2, 9);
    }
    for (let i = 0; i < 50; i++) {
      g.fillStyle(0xffffff, Phaser.Math.FloatBetween(0.15, 0.6)).fillRect(rng.int(0, 718), rng.int(0, HORIZON - 170), 2, 2);
    }
    // ground beyond the road
    g.fillGradientStyle(0x1a0f33, 0x1a0f33, 0x0b0818, 0x0b0818, 1).fillRect(0, HORIZON, 720, 1280 - HORIZON);
  }

  private drawRoad(): void {
    const g = this.road;
    g.clear();
    const zf = ZMAX + 2, zn = 0.5;
    const quad = (xa: number, xb: number, za: number, zb: number) => [
      new Phaser.Math.Vector2(sx(xa, za), sy(za)), new Phaser.Math.Vector2(sx(xb, za), sy(za)),
      new Phaser.Math.Vector2(sx(xb, zb), sy(zb)), new Phaser.Math.Vector2(sx(xa, zb), sy(zb)),
    ];
    g.fillStyle(0x221a3d, 1).fillPoints(quad(-LW, LW, zf, zn), true);
    // cross stripes that scroll with the distance travelled
    const off = this.dist % 1;
    for (let z = Math.ceil(zn) - off; z < zf; z += 1) {
      if (z < zn) continue;
      const a = Phaser.Math.Clamp(1.4 - z / ZMAX, 0, 1);
      g.fillStyle(0x3b2f66, a).fillPoints(quad(-LW, LW, z + 0.08, z), true);
    }
    // kerbs
    for (let k = Math.floor(this.dist); k < this.dist + zf + 1; k++) {
      const za = k - this.dist, zb = za + 0.5;
      if (zb < zn || za > zf) continue;
      const a = Math.max(zn, za), b = Math.min(zf, zb);
      const col = k % 2 ? 0xff4fa3 : 0x45dcf2;
      g.fillStyle(col, 0.9).fillPoints(quad(-LW - 26, -LW, b, a), true).fillPoints(quad(LW, LW + 26, b, a), true);
    }
    // lane dividers for the current row width
    const n = this.rows.find((r) => !r.done)?.n ?? 3;
    for (let i = 1; i < n; i++) {
      const x = -LW + (i * 2 * LW) / n;
      g.lineStyle(3, 0xffffff, 0.08).lineBetween(sx(x, zf), sy(zf), sx(x, zn), sy(zn));
    }
    // horizon glow
    g.fillStyle(0xff4fa3, 0.25).fillRect(0, HORIZON - 2, 720, 4);
  }

  private drawThings(): void {
    this.back.clear(); this.front.clear(); this.gateG.clear();
    const all = [...this.rows].sort((a, b) => b.z - a.z);
    for (const r of all) {
      const g = r.z < 1 ? this.front : this.back;
      const fade = Phaser.Math.Clamp((ZMAX + 0.5 - r.z) / 1.5, 0, 1);
      for (let i = 0; i < r.n; i++) {
        const c = r.cells[i];
        const img = r.imgs[i];
        const xa = -LW + (i * 2 * LW) / r.n + 8, xb = -LW + ((i + 1) * 2 * LW) / r.n - 8;
        if (c === EMPTY) continue;
        if (c === GEM) {
          const z = r.z, s = 1 / z;
          const bob = Math.sin(this.time.now / 180 + i) * 10;
          img?.setPosition(sx((xa + xb) / 2, z), sy(z, 70 + bob)).setScale(0.9 * s).setAlpha(fade).setDepth(r.z < 1 ? 31 : 6);
          g.fillStyle(0x000000, 0.3 * fade).fillEllipse(sx((xa + xb) / 2, z), sy(z), 60 * s, 14 * s);
          continue;
        }
        const z0 = r.z, z1 = r.z + BLOCK_D;
        const col = PALETTE[c];
        // top face
        g.fillStyle(shade(col, 0.35), fade).fillPoints([
          new Phaser.Math.Vector2(sx(xa, z0), sy(z0, BLOCK_H)), new Phaser.Math.Vector2(sx(xb, z0), sy(z0, BLOCK_H)),
          new Phaser.Math.Vector2(sx(xb, z1), sy(z1, BLOCK_H)), new Phaser.Math.Vector2(sx(xa, z1), sy(z1, BLOCK_H)),
        ], true);
        // side faces toward the centre
        if (xb < 0) g.fillStyle(shade(col, -0.35), fade).fillPoints([
          new Phaser.Math.Vector2(sx(xb, z0), sy(z0)), new Phaser.Math.Vector2(sx(xb, z1), sy(z1)),
          new Phaser.Math.Vector2(sx(xb, z1), sy(z1, BLOCK_H)), new Phaser.Math.Vector2(sx(xb, z0), sy(z0, BLOCK_H)),
        ], true);
        if (xa > 0) g.fillStyle(shade(col, -0.35), fade).fillPoints([
          new Phaser.Math.Vector2(sx(xa, z0), sy(z0)), new Phaser.Math.Vector2(sx(xa, z1), sy(z1)),
          new Phaser.Math.Vector2(sx(xa, z1), sy(z1, BLOCK_H)), new Phaser.Math.Vector2(sx(xa, z0), sy(z0, BLOCK_H)),
        ], true);
        // front face
        const fx = sx(xa, z0), fy = sy(z0, BLOCK_H), fw = sx(xb, z0) - fx, fh = sy(z0) - fy;
        g.fillStyle(col, fade).fillRect(fx, fy, fw, fh);
        g.lineStyle(Math.max(1, 3 / z0), 0x000000, 0.5 * fade).strokeRect(fx, fy, fw, fh);
        g.fillStyle(0xffffff, 0.25 * fade).fillRect(fx + 4 / z0, fy + 4 / z0, fw - 8 / z0, 5 / z0);
        img?.setPosition(fx + fw / 2, fy + fh / 2).setScale(Math.min(0.9, 0.85 / z0)).setAlpha(fade).setDepth(r.z < 1 ? 31 : 6);
      }
    }
    for (const gt of this.gates) {
      const z = gt.z;
      if (z < 0.75) continue;
      const fade = Phaser.Math.Clamp((ZMAX + 0.5 - z) / 1.5, 0, 1) * Phaser.Math.Clamp((z - 0.75) / 0.4, 0, 1);
      const g = this.gateG;
      const top = sy(z, GATE_H), ground = sy(z);
      const xl = sx(-LW - 26, z), xr = sx(LW + 26, z), pw = 22 / z;
      const halves = gt.cols.length === 2 ? [[-LW, 0, gt.cols[0]], [0, LW, gt.cols[1]]] : [[-LW, LW, gt.cols[0]]];
      for (const [a, b, c] of halves) {
        g.fillStyle(PALETTE[c], 0.22 * fade).fillRect(sx(a, z), top, sx(b, z) - sx(a, z), ground - top);
        g.fillStyle(PALETTE[c], fade).fillRect(sx(a, z), top, sx(b, z) - sx(a, z), 46 / z);
      }
      if (gt.cols.length === 2) g.fillStyle(0xffffff, fade).fillRect(CX - pw / 2, top, pw, ground - top);
      g.fillStyle(0xffffff, fade).fillRect(xl - pw, top, pw, ground - top).fillRect(xr, top, pw, ground - top);
      g.lineStyle(Math.max(1, 4 / z), 0x000000, 0.6 * fade).strokeRect(xl, top, xr - xl, 46 / z);
      // symbols on the beam
      gt.imgs.forEach((img, i) => {
        const k = gt.imgs.length;
        const x = -LW + ((i + 0.5) * 2 * LW) / k;
        img.setPosition(sx(x, z), top + 23 / z).setScale(Math.min(1, 0.55 / z)).setAlpha(fade);
      });
    }
  }

  private drawBall(): void {
    const g = this.ballG;
    g.clear();
    const col = PALETTE[this.colour];
    g.fillStyle(col, 1).fillCircle(0, 0, BALL_R);
    // rolling bands
    for (let i = 0; i < 2; i++) {
      const p = ((this.roll + i * 0.5) % 1) * 2 - 1;      // -1 .. 1 top to bottom
      const yy = p * BALL_R;
      const w = Math.sqrt(Math.max(0, BALL_R * BALL_R - yy * yy));
      g.fillStyle(shade(col, -0.25), 0.8).fillEllipse(0, yy, w * 2, 10 * (1 - Math.abs(p)) + 2);
    }
    g.lineStyle(5, 0xffffff, 0.95).strokeCircle(0, 0, BALL_R);
    g.fillStyle(0xffffff, 0.35).fillCircle(-14, -16, 10);
  }
}
