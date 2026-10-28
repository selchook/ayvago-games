import Phaser from 'phaser';
import { ArcadeScene, Controls, burst, shake, flash, popup, t, txt, rng } from '@core';

const W = 720, H = 1280;
const CELL = 40, COLS = 18;
const ROW0 = 3;          // first playfield row (y = 120)
const ZONE = 25;         // first row of the player zone
const MAXR = 30;         // last row (y = 1200..1240)

export const PALETTES = [
  { mush: 0xec3013, seg: 0x5dff7a },
  { mush: 0x3ee6ff, seg: 0xff4fa3 },
  { mush: 0xffd23f, seg: 0x8b5cff },
  { mush: 0x5dff7a, seg: 0xec3013 },
  { mush: 0xff4fa3, seg: 0x3ee6ff },
  { mush: 0x8b5cff, seg: 0xffd23f },
];

const cx = (c: number) => c * CELL + CELL / 2;
const cy = (r: number) => r * CELL + CELL / 2;

/** All art is drawn: chunky retro sprites generated once per game. */
export function makeTextures(scene: Phaser.Scene): void {
  if (scene.textures.exists('seg')) return;
  const g = scene.make.graphics({ x: 0, y: 0 }, false);
  // body segment (white, tinted per wave)
  const body = (head: boolean) => {
    g.clear();
    g.lineStyle(4, 0x777777).lineBetween(8, 6, 2, 0).lineBetween(28, 6, 34, 0).lineBetween(8, 30, 2, 36).lineBetween(28, 30, 34, 36);
    g.fillStyle(0x9a9a9a).fillCircle(18, 19, 15);
    g.fillStyle(0xffffff).fillCircle(18, 17, 14);
    g.fillStyle(0xffffff, 1).fillCircle(13, 12, 4);
    if (head) {
      g.lineStyle(3, 0xffffff).lineBetween(30, 10, 36, 2).lineBetween(30, 26, 36, 34);
      g.fillStyle(0x000000).fillCircle(26, 11, 5).fillCircle(26, 25, 5);
      g.fillStyle(0xffffff).fillCircle(27, 10, 2).fillCircle(27, 24, 2);
    }
  };
  body(false); g.generateTexture('seg', 36, 36);
  body(true); g.generateTexture('head', 36, 36);
  // mushrooms in 4 damage states (cap white -> tinted); damage eats the cap from the top
  for (let s = 0; s < 4; s++) {
    g.clear();
    g.fillStyle(0xd8d0c0).fillRect(13, 22, 12, 14);
    g.fillStyle(0x000000, 0.25).fillRect(13, 22, 12, 3);
    if (s === 0) {
      g.fillStyle(0xffffff).fillRoundedRect(3, 4, 32, 20, 9);
      g.fillStyle(0x000000, 0.3).fillCircle(12, 11, 3).fillCircle(25, 9, 3).fillCircle(20, 17, 2);
    } else {
      const top = 4 + s * 5;
      g.fillStyle(0xffffff).fillRect(3, top + 3, 32, 24 - top - 3);
      for (let k = 0; k < 4; k++) g.fillTriangle(3 + k * 8, top + 3, 11 + k * 8, top + 3, 7 + k * 8, top - 2 + (k % 2) * 3);
      g.fillStyle(0x000000, 0.3).fillCircle(20, 19, 2);
    }
    g.fillStyle(0x000000, 0.2).fillRect(3, 20, 32, 4);
    g.generateTexture('mush' + s, 38, 38);
  }
  // spider
  g.clear();
  g.lineStyle(4, 0xffd23f);
  for (const [sx, ex, ey] of [[20, 2, 4], [20, 0, 22], [20, 4, 38], [36, 54, 4], [36, 56, 22], [36, 52, 38]]) {
    g.lineBetween(sx, 22, (sx + ex) / 2, ey < 22 ? 8 : 34).lineBetween((sx + ex) / 2, ey < 22 ? 8 : 34, ex, ey);
  }
  g.fillStyle(0x8b5cff).fillEllipse(28, 22, 34, 24);
  g.fillStyle(0xb894ff).fillEllipse(24, 18, 14, 8);
  g.fillStyle(0xffffff).fillCircle(22, 26, 4).fillCircle(34, 26, 4);
  g.fillStyle(0xec3013).fillCircle(22, 27, 2).fillCircle(34, 27, 2);
  g.generateTexture('spider', 56, 42);
  // flea
  g.clear();
  g.fillStyle(0xff4fa3).fillEllipse(15, 14, 22, 26);
  g.lineStyle(3, 0xffffff).lineBetween(6, 20, 0, 30).lineBetween(24, 20, 30, 30).lineBetween(8, 8, 2, 0).lineBetween(22, 8, 28, 0);
  g.fillStyle(0xffffff).fillCircle(11, 20, 3).fillCircle(19, 20, 3);
  g.generateTexture('flea', 30, 32);
  // shooter (bug wand / garden gnome turret)
  g.clear();
  g.fillStyle(0x3ee6ff).fillTriangle(4, 38, 36, 38, 20, 8);
  g.fillStyle(0xffffff).fillRect(17, 0, 6, 14);
  g.fillStyle(0xf3f2f2).fillCircle(20, 26, 7);
  g.fillStyle(0x0b0a1a).fillCircle(17, 25, 2).fillCircle(23, 25, 2);
  g.fillStyle(0xec3013).fillRect(6, 34, 28, 4);
  g.generateTexture('shooter', 40, 40);
  // bolt
  g.clear();
  g.fillStyle(0xffffff).fillRect(2, 0, 4, 22);
  g.fillStyle(0xffd23f).fillRect(0, 4, 8, 4);
  g.generateTexture('bolt', 8, 22);
  // background grid tile
  g.clear();
  g.fillStyle(0x07060f).fillRect(0, 0, 40, 40);
  g.fillStyle(0x15122a).fillRect(0, 0, 40, 1).fillRect(0, 0, 1, 40);
  g.generateTexture('gridbg', 40, 40);
  g.destroy();
}

interface Seg { c: number; r: number; pc: number; pr: number; img: Phaser.GameObjects.Image; }
interface Chain { segs: Seg[]; dx: number; dy: number; }
interface Mush { hp: number; img: Phaser.GameObjects.Image; }
interface Spider { img: Phaser.GameObjects.Image; vx: number; vy: number; }
interface Flea { img: Phaser.GameObjects.Image; hp: number; vy: number; lastRow: number; }

export class PlayScene extends ArcadeScene {
  private controls!: Controls;
  private player!: Phaser.GameObjects.Image;
  private bolt!: Phaser.GameObjects.Image;
  private boltOn = false;
  private fireCd = 0;
  private grid: (Mush | null)[][] = [];
  private chains: Chain[] = [];
  private spider: Spider | null = null;
  private flea: Flea | null = null;
  private wave = 1;
  private lives = 3;
  private nextLife = 6000;
  private stepT = 0.1;
  private acc = 0;
  private zoneT = 0;
  private spiderCd = 5;
  private dead = false;
  private dragX: number | null = null;
  private dragY: number | null = null;

  createGame(): void {
    makeTextures(this);
    this.boltOn = false; this.fireCd = 0; this.chains = []; this.spider = null; this.flea = null;
    this.wave = 1; this.lives = 3; this.nextLife = 6000; this.acc = 0; this.zoneT = 0; this.spiderCd = 6;
    this.dead = false; this.dragX = this.dragY = null;
    this.add.tileSprite(0, ROW0 * CELL, W, (MAXR + 1 - ROW0) * CELL, 'gridbg').setOrigin(0);
    this.add.rectangle(0, ZONE * CELL, W, (MAXR + 1 - ZONE) * CELL, 0x3ee6ff, 0.05).setOrigin(0);
    this.add.rectangle(0, ZONE * CELL, W, 2, 0x3ee6ff, 0.25).setOrigin(0);
    this.add.rectangle(0, ROW0 * CELL - 2, W, 2, 0xffffff, 0.15).setOrigin(0);

    this.grid = [];
    for (let r = 0; r <= MAXR; r++) this.grid.push(new Array(COLS).fill(null));
    for (let i = 0; i < 42; i++) this.addMush(rng.int(0, COLS - 1), rng.int(ROW0 + 1, ZONE - 1));
    for (let i = 0; i < 5; i++) {
      const c = rng.int(0, COLS - 1);
      if (Math.abs(c - COLS / 2) > 2) this.addMush(c, rng.int(ZONE, MAXR - 2));
    }

    this.player = this.add.image(W / 2, cy(MAXR - 1), 'shooter').setDepth(20).setScale(1.3);
    this.bolt = this.add.image(0, 0, 'bolt').setDepth(19).setVisible(false);
    this.controls = new Controls(this);
    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => { this.dragX = p.x; this.dragY = p.y; });
    this.input.on('pointermove', (p: Phaser.Input.Pointer) => {
      if (!p.isDown || this.dragX === null || this.dragY === null || this.dead) return;
      this.movePlayer((p.x - this.dragX) * 1.25, (p.y - this.dragY) * 1.25);
      this.dragX = p.x; this.dragY = p.y;
    });
    this.input.on('pointerup', () => { this.dragX = this.dragY = null; });
    this.startWave(true);
  }

  private get pal() {
    return PALETTES[(this.wave - 1) % PALETTES.length];
  }

  private addMush(c: number, r: number): void {
    if (c < 0 || c >= COLS || r < ROW0 || r > MAXR || this.grid[r][c]) return;
    const img = this.add.image(cx(c), cy(r), 'mush0').setTint(this.pal.mush).setDepth(5);
    img.setScale(0.2);
    this.tweens.add({ targets: img, scale: 1, duration: 180, ease: 'Back.easeOut' });
    this.grid[r][c] = { hp: 4, img };
  }

  private hitMush(c: number, r: number, byPlayer: boolean): void {
    const m = this.grid[r]?.[c];
    if (!m) return;
    m.hp--;
    if (m.hp <= 0) {
      burst(this, m.img.x, m.img.y, [this.pal.mush, 0xffffff], 10, 160);
      m.img.destroy();
      this.grid[r][c] = null;
      if (byPlayer) this.gain(1);
    } else m.img.setTexture('mush' + (4 - m.hp));
    if (byPlayer) this.sfx('mush', { volume: 0.25 });
  }

  private gain(n: number, x?: number, y?: number): void {
    this.addScore(n, x, y);
    if (this.score >= this.nextLife) {
      this.nextLife += 6000;
      this.lives++;
      this.updateHud();
      this.sfx('oneup', { volume: 0.5 });
      popup(this, this.player.x, this.player.y - 60, t('oneUp'), '#5dff7a', 26);
    }
  }

  private updateHud(): void {
    this.hud.setRight(`${t('lives')} ${Math.max(0, this.lives)}`);
    this.hud.setCenter(`${t('wave')} ${this.wave}`);
  }

  private startWave(first: boolean): void {
    this.updateHud();
    this.stepT = Math.max(0.05, 0.1 - (this.wave - 1) * 0.006);
    // recolour the field
    for (const row of this.grid) for (const m of row) if (m) m.img.setTint(this.pal.mush);
    const len = Math.min(16, 9 + this.wave);
    const fromLeft = rng.chance(0.5);
    this.spawnChain(len, fromLeft ? 0 : COLS - 1, fromLeft ? 1 : -1);
    // from wave 3 extra single heads join the main body
    for (let i = 0; i < Math.min(4, Math.floor((this.wave - 1) / 2)); i++) {
      this.spawnChain(1, rng.int(2, COLS - 3), rng.pick([-1, 1]));
    }
    const b = txt(this, W / 2, 560, t('waveN', { n: this.wave }), { title: true, size: 44, color: '#ffd23f' }).setDepth(9000).setScale(0.3);
    this.tweens.add({ targets: b, scale: 1, duration: 350, ease: 'Back.easeOut' });
    this.tweens.add({ targets: b, alpha: 0, delay: 1200, duration: 400, onComplete: () => b.destroy() });
    if (!first) this.sfx('wave', { volume: 0.5 });
  }

  private spawnChain(len: number, c: number, dx: number): void {
    const segs: Seg[] = [];
    for (let i = 0; i < len; i++) {
      const sc = c - dx * i;
      const img = this.add.image(cx(sc), cy(ROW0), i === 0 ? 'head' : 'seg').setTint(this.pal.seg).setDepth(10);
      segs.push({ c: sc, r: ROW0, pc: sc - dx, pr: ROW0, img });
    }
    this.chains.push({ segs, dx, dy: 1 });
  }

  private stepChains(): void {
    for (const ch of this.chains) {
      const head = ch.segs[0];
      const prev = ch.segs.map((s) => ({ c: s.c, r: s.r }));
      const nc = head.c + ch.dx;
      const onGrid = head.c >= 0 && head.c < COLS;
      const blocked = onGrid && (nc < 0 || nc >= COLS || !!this.grid[head.r][nc]);
      head.pc = head.c; head.pr = head.r;
      if (blocked) {
        let nr = head.r + ch.dy;
        if (nr > MAXR) { ch.dy = -1; nr = head.r - 1; }
        else if (ch.dy < 0 && nr < ZONE) { ch.dy = 1; nr = head.r + 1; }
        head.r = nr;
        ch.dx = -ch.dx;
      } else head.c = nc;
      for (let i = 1; i < ch.segs.length; i++) {
        const s = ch.segs[i];
        s.pc = s.c; s.pr = s.r;
        s.c = prev[i - 1].c; s.r = prev[i - 1].r;
      }
    }
  }

  private renderChains(f: number): void {
    const wob = Math.sin(this.elapsed * 18);
    for (const ch of this.chains) {
      ch.segs.forEach((s, i) => {
        s.img.x = Phaser.Math.Linear(cx(s.pc), cx(s.c), f);
        s.img.y = Phaser.Math.Linear(cy(s.pr), cy(s.r), f);
        const ang = Math.atan2(s.r - s.pr, s.c - s.pc);
        s.img.setRotation(ang);
        s.img.setScale(1 + (i % 2 ? wob : -wob) * 0.06);
        s.img.setTexture(i === 0 ? 'head' : 'seg');
      });
    }
  }

  private hitSegment(ch: Chain, idx: number): void {
    const s = ch.segs[idx];
    const isHead = idx === 0;
    this.gain(isHead ? 100 : 10, s.img.x, s.img.y);
    burst(this, s.img.x, s.img.y, [this.pal.seg, 0xffffff], isHead ? 20 : 12, isHead ? 300 : 220);
    this.sfx(isHead ? 'head' : 'hit', { volume: 0.35 });
    if (isHead) shake(this, 0.004, 80);
    s.img.destroy();
    // the hit segment becomes a mushroom
    if (s.c >= 0 && s.c < COLS) this.addMush(s.c, s.r);
    const tail = ch.segs.slice(idx + 1);
    ch.segs = ch.segs.slice(0, idx);
    if (tail.length) {
      const nh = tail[0];
      const dx = nh.c !== nh.pc ? Math.sign(nh.c - nh.pc) : ch.dx;
      this.chains.push({ segs: tail, dx, dy: ch.dy });
    }
    this.chains = this.chains.filter((c) => c.segs.length > 0);
    if (!this.chains.length) this.waveClear();
  }

  private waveClear(): void {
    this.gain(50 * this.wave, W / 2, 700);
    this.wave++;
    flash(this, this.pal.seg, 150);
    this.time.delayedCall(600, () => { if (!this.isOver && !this.dead && !this.chains.length) this.startWave(false); });
  }

  private movePlayer(dx: number, dy: number): void {
    const minY = cy(ZONE), maxY = cy(MAXR);
    const nx = Phaser.Math.Clamp(this.player.x + dx, 20, W - 20);
    const ny = Phaser.Math.Clamp(this.player.y + dy, minY, maxY);
    if (!this.blocked(nx, ny)) { this.player.setPosition(nx, ny); return; }
    if (!this.blocked(nx, this.player.y)) this.player.x = nx;
    else if (!this.blocked(this.player.x, ny)) this.player.y = ny;
  }

  private blocked(x: number, y: number): boolean {
    const c0 = Math.floor((x - 16) / CELL), c1 = Math.floor((x + 16) / CELL);
    const r0 = Math.floor((y - 16) / CELL), r1 = Math.floor((y + 16) / CELL);
    for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) {
      const m = this.grid[r]?.[c];
      if (!m) continue;
      const px = Phaser.Math.Clamp(x, c * CELL + 4, c * CELL + CELL - 4), py = Phaser.Math.Clamp(y, r * CELL + 4, r * CELL + CELL - 4);
      if (Math.hypot(px - x, py - y) < 15) return true;
    }
    return false;
  }

  private die(): void {
    if (this.dead || this.isOver) return;
    this.dead = true;
    this.lives--;
    this.updateHud();
    this.sfx('die', { volume: 0.6 });
    shake(this, 0.025, 350);
    flash(this, 0xec3013, 180);
    burst(this, this.player.x, this.player.y, [0x3ee6ff, 0xffffff, 0xec3013], 50, 460);
    this.player.setVisible(false);
    this.boltOn = false; this.bolt.setVisible(false);
    if (this.lives <= 0) { this.endGame({ delay: 900 }); return; }
    // clear the creatures, then repair damaged mushrooms one by one (classic bonus)
    this.time.delayedCall(700, () => {
      if (this.isOver) return;
      for (const ch of this.chains) for (const s of ch.segs) { burst(this, s.img.x, s.img.y, this.pal.seg, 6, 120); s.img.destroy(); }
      this.chains = [];
      this.spider?.img.destroy(); this.spider = null;
      this.flea?.img.destroy(); this.flea = null;
      let k = 0;
      for (let r = ROW0; r <= MAXR; r++) for (let c = 0; c < COLS; c++) {
        const m = this.grid[r][c];
        if (m && m.hp < 4) {
          this.time.delayedCall(40 * k++, () => {
            if (!m.img.active) return;
            m.hp = 4; m.img.setTexture('mush0');
            this.tweens.add({ targets: m.img, scale: 1.3, duration: 80, yoyo: true });
            this.gain(5); this.sfx('repair', { volume: 0.25 });
          });
        }
      }
      this.time.delayedCall(40 * k + 500, () => {
        if (this.isOver) return;
        this.player.setPosition(W / 2, cy(MAXR - 1)).setVisible(true).setAlpha(0);
        this.tweens.add({ targets: this.player, alpha: 1, duration: 300 });
        // clear a landing spot
        for (let r = MAXR - 2; r <= MAXR; r++) for (let c = 8; c <= 9; c++) { const m = this.grid[r][c]; if (m) { m.img.destroy(); this.grid[r][c] = null; } }
        this.dead = false;
        this.spiderCd = 5;
        this.startWave(true);
      });
    });
  }

  private spawnSpider(): void {
    const fromLeft = rng.chance(0.5);
    const y = rng.int(cy(ZONE - 2), cy(MAXR));
    const img = this.add.image(fromLeft ? -40 : W + 40, y, 'spider').setDepth(15);
    const sp = 120 + Math.min(10, this.wave) * 12;
    this.spider = { img, vx: fromLeft ? sp : -sp, vy: rng.pick([-1, 1]) * rng.int(180, 300) };
    this.sfx('spiderIn', { volume: 0.35 });
  }

  private killSpider(): void {
    const s = this.spider!;
    const d = Phaser.Math.Distance.Between(s.img.x, s.img.y, this.player.x, this.player.y);
    const pts = d < 120 ? 900 : d < 240 ? 600 : 300;
    this.gain(pts, s.img.x, s.img.y);
    burst(this, s.img.x, s.img.y, [0x8b5cff, 0xffd23f, 0xffffff], 30, 360);
    shake(this, 0.01, 150);
    this.sfx('spider', { volume: 0.5 });
    s.img.destroy();
    this.spider = null;
  }

  updateGame(_time: number, delta: number): void {
    const dt = delta / 1000;
    // --- centipede steps on a fixed grid clock, rendered smoothly in between
    if (!this.dead) {
      this.acc += dt;
      while (this.acc >= this.stepT) { this.acc -= this.stepT; this.stepChains(); }
    }
    this.renderChains(this.acc / this.stepT);
    if (this.dead) return;

    // --- player
    const c = this.controls;
    if (c.axisX || c.axisY) this.movePlayer(c.axisX * 520 * dt, c.axisY * 520 * dt);

    // --- auto fire, one bolt at a time (classic)
    this.fireCd -= dt;
    if (!this.boltOn && this.fireCd <= 0) {
      this.boltOn = true;
      this.bolt.setPosition(this.player.x, this.player.y - 24).setVisible(true);
      this.fireCd = 0.07;
      this.sfx('shoot', { volume: 0.1 });
    }
    if (this.boltOn) this.moveBolt(dt);

    // --- extra heads when the centipede lingers in the player zone
    const inZone = this.chains.some((ch) => ch.segs.some((s) => s.r >= ZONE));
    if (inZone) {
      this.zoneT += dt;
      if (this.zoneT > Math.max(3, 7 - this.wave * 0.4)) {
        this.zoneT = 0;
        const fromLeft = rng.chance(0.5);
        const img = this.add.image(fromLeft ? -20 : W + 20, cy(ZONE), 'head').setTint(this.pal.seg).setDepth(10);
        const c0 = fromLeft ? -1 : COLS;
        this.chains.push({ segs: [{ c: c0, r: ZONE, pc: c0, pr: ZONE, img }], dx: fromLeft ? 1 : -1, dy: 1 });
      }
    } else this.zoneT = 0;

    // --- spider
    this.spiderCd -= dt;
    if (!this.spider && this.spiderCd <= 0) this.spawnSpider();
    if (this.spider) {
      const s = this.spider;
      s.img.x += s.vx * dt; s.img.y += s.vy * dt;
      s.img.setAngle(Math.sin(this.elapsed * 20) * 8);
      const top = cy(ZONE - 3), bot = cy(MAXR);
      if (s.img.y < top) { s.img.y = top; s.vy = Math.abs(s.vy); }
      if (s.img.y > bot) { s.img.y = bot; s.vy = -Math.abs(s.vy); }
      if (rng.chance(dt * 0.8)) s.vy = rng.pick([-1, 1]) * rng.int(150, 320);
      // eats mushrooms it passes over
      const mc = Math.floor(s.img.x / CELL), mr = Math.floor(s.img.y / CELL);
      const m = this.grid[mr]?.[mc];
      if (m && rng.chance(dt * 6)) { m.img.destroy(); this.grid[mr][mc] = null; }
      if (s.img.x < -80 || s.img.x > W + 80) {
        s.img.destroy(); this.spider = null; this.spiderCd = rng.int(30, 70) / 10;
      } else if (Phaser.Math.Distance.Between(s.img.x, s.img.y, this.player.x, this.player.y) < 34) { this.die(); return; }
    }

    // --- flea drops when the player zone is too clear
    if (this.wave >= 2 && !this.flea) {
      let n = 0;
      for (let r = ZONE; r <= MAXR; r++) for (let cc = 0; cc < COLS; cc++) if (this.grid[r][cc]) n++;
      if (n < 3 + this.wave && rng.chance(dt * 0.5)) {
        const col = rng.int(0, COLS - 1);
        const img = this.add.image(cx(col), 80, 'flea').setDepth(15);
        this.flea = { img, hp: 2, vy: 420 + this.wave * 20, lastRow: 1 };
        this.sfx('flea', { volume: 0.4 });
      }
    }
    if (this.flea) {
      const f = this.flea;
      f.img.y += f.vy * dt;
      const row = Math.floor(f.img.y / CELL);
      if (row !== f.lastRow) {
        f.lastRow = row;
        if (row >= ROW0 + 1 && row < MAXR && rng.chance(0.28)) this.addMush(Math.floor(f.img.x / CELL), row);
      }
      if (f.img.y > H + 30) { f.img.destroy(); this.flea = null; }
      else if (Phaser.Math.Distance.Between(f.img.x, f.img.y, this.player.x, this.player.y) < 30) { this.die(); return; }
    }

    // --- centipede touches player
    for (const ch of this.chains) for (const s of ch.segs) {
      if (s.r >= ZONE - 1 && Phaser.Math.Distance.Between(s.img.x, s.img.y, this.player.x, this.player.y) < 30) { this.die(); return; }
    }
  }

  private moveBolt(dt: number): void {
    const total = 1700 * dt;
    const steps = Math.ceil(total / 14);
    for (let i = 0; i < steps; i++) {
      this.bolt.y -= total / steps;
      const bx = this.bolt.x, by = this.bolt.y - 10;
      if (by < ROW0 * CELL) { this.boltOn = false; this.bolt.setVisible(false); return; }
      // segments
      for (const ch of this.chains) {
        for (let k = 0; k < ch.segs.length; k++) {
          const s = ch.segs[k];
          if (Math.abs(s.img.x - bx) < 20 && Math.abs(s.img.y - by) < 20) {
            this.boltOn = false; this.bolt.setVisible(false);
            this.hitSegment(ch, k);
            return;
          }
        }
      }
      if (this.spider && Math.abs(this.spider.img.x - bx) < 28 && Math.abs(this.spider.img.y - by) < 20) {
        this.boltOn = false; this.bolt.setVisible(false);
        this.killSpider();
        return;
      }
      if (this.flea && Math.abs(this.flea.img.x - bx) < 18 && Math.abs(this.flea.img.y - by) < 18) {
        this.boltOn = false; this.bolt.setVisible(false);
        const f = this.flea;
        f.hp--;
        if (f.hp <= 0) {
          this.gain(200, f.img.x, f.img.y);
          burst(this, f.img.x, f.img.y, [0xff4fa3, 0xffffff], 20, 280);
          this.sfx('spider', { volume: 0.4 });
          f.img.destroy(); this.flea = null;
        } else { f.vy *= 1.8; f.img.setTintFill(0xffffff); this.time.delayedCall(60, () => f.img.active && f.img.clearTint()); this.sfx('hit', { volume: 0.3 }); }
        return;
      }
      const c = Math.floor(bx / CELL), r = Math.floor(by / CELL);
      if (this.grid[r]?.[c]) {
        this.boltOn = false; this.bolt.setVisible(false);
        this.hitMush(c, r, true);
        return;
      }
    }
  }
}
