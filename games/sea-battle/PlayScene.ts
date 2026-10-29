import Phaser from 'phaser';
import { ArcadeScene, Button, burst, shake, flash, popup, txt, t, rng, net } from '@core';
import { N, FLEET, cellsOf, fits, randomFleet, occupancy, resolve, newGunner, aim, learn, type Ship, type ShotResult, type Gunner } from './fleet';

interface Grid { x: number; y: number; cell: number }
const BIG: Grid = { x: 100, y: 250, cell: 58 };     // placement sea, then the target sea
const SMALL: Grid = { x: 52, y: 950, cell: 26 };    // your own fleet during the battle
const ROWS = 'ABCDEFGHIJ';
const PLACE_SECONDS = 75;

type Phase = 'place' | 'battle' | 'done';
type Turn = 'aim' | 'wait' | 'theirs' | 'busy';
interface ShotMsg { i: number; k: number }
interface ResMsg { i: number; k: number; r: 0 | 1 | 2; s?: number[]; l?: number; w?: 1 }

export class PlayScene extends ArcadeScene {
  private phase: Phase = 'place';
  private turn: Turn = 'busy';
  private ships: Ship[] = [];
  private occ = new Int8Array(N * N);
  private incoming = new Int8Array(N * N);   // shots received on my sea
  private known = new Int8Array(N * N);      // my shots: 0 unknown, 1 miss, 2 hit, 3 sunk
  private enemy: Ship[] = [];                // solo: the CPU's fleet
  private enemyOcc = new Int8Array(N * N);
  private enemyShots = new Int8Array(N * N);
  private enemyLeft: number[] = [];
  private gunner!: Gunner;
  private shipImgs: Phaser.GameObjects.Image[] = [];
  private phaseObjs: Phaser.GameObjects.GameObject[] = [];
  private fires: Phaser.GameObjects.Particles.ParticleEmitter[] = [];
  private sel = 0;
  private drag: { idx: number; ox: number; oy: number; sx: number; sy: number; moved: boolean } | null = null;
  private cur = 44;
  private cross!: Phaser.GameObjects.Image;
  private status!: Phaser.GameObjects.Text;
  private info!: Phaser.GameObjects.Text;
  private banner!: Phaser.GameObjects.Text;
  private fleetList: Phaser.GameObjects.Container[] = [];
  private level = 0;
  private lives = 2;
  private streak = 0;
  private round = 0;
  private shots = 0;
  private hits = 0;
  private combo = 0;
  // online
  private online = false;
  private myReady = false;
  private theirReady = false;
  private shotNo = 0;
  private shotsIn: ShotMsg[] = [];
  private resIn: ResMsg[] = [];
  private placeLeft = PLACE_SECONDS;
  private landAt = 0;

  createGame(): void {
    const { width } = this.scale;
    this.phase = 'place'; this.turn = 'busy';
    this.ships = []; this.enemy = []; this.enemyLeft = [];
    this.shipImgs = []; this.phaseObjs = []; this.fires = []; this.fleetList = [];
    this.sel = 0; this.drag = null; this.cur = 44;
    this.level = 0; this.lives = 2; this.streak = 0; this.round = 0;
    this.shots = 0; this.hits = 0; this.combo = 0;
    this.online = net.active;
    this.myReady = false; this.theirReady = false; this.shotNo = 0; this.shotsIn = []; this.resIn = []; this.landAt = 0;
    this.useHud = !this.online;
    this.cameras.main.setBackgroundColor('#06172e');
    this.makeTextures();

    this.status = txt(this, width / 2, 128, '', { title: true, size: 24, color: '#ffd23f' }).setDepth(30);
    this.info = txt(this, width / 2, 182, '', { size: 28, color: '#8fc8ff' }).setDepth(30);
    this.banner = txt(this, width / 2, BIG.y + BIG.cell * 5, '', { title: true, size: 46, strokeThickness: 10 }).setDepth(60).setVisible(false);
    this.cross = this.add.image(0, 0, 'cross').setDisplaySize(BIG.cell, BIG.cell).setDepth(40).setVisible(false);
    this.tweens.add({ targets: this.cross, angle: 90, duration: 2400, repeat: -1 });

    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => this.onDown(p));
    this.input.on('pointermove', (p: Phaser.Input.Pointer) => this.onMove(p));
    this.input.on('pointerup', (p: Phaser.Input.Pointer) => this.onUp(p));
    const kb = this.input.keyboard;
    const arrow = (dx: number, dy: number) => this.onArrow(dx, dy);
    kb?.on('keydown-LEFT', () => arrow(-1, 0)); kb?.on('keydown-A', () => arrow(-1, 0));
    kb?.on('keydown-RIGHT', () => arrow(1, 0)); kb?.on('keydown-D', () => arrow(1, 0));
    kb?.on('keydown-UP', () => arrow(0, -1)); kb?.on('keydown-W', () => arrow(0, -1));
    kb?.on('keydown-DOWN', () => arrow(0, 1)); kb?.on('keydown-S', () => arrow(0, 1));
    for (const k of ['SPACE', 'ENTER']) kb?.on(`keydown-${k}`, () => this.onConfirm());
    kb?.on('keydown-R', () => this.rotateSel()); kb?.on('keydown-Z', () => this.rotateSel());
    kb?.on('keydown-X', () => { if (this.phase === 'place' && !this.myReady) this.autoPlace(); });
    kb?.on('keydown-SHIFT', () => this.cycleSel()); kb?.on('keydown-TAB', () => this.cycleSel());

    if (this.online) {
      net.onScene(this, 'rdy', () => {
        this.theirReady = true;
        if (this.phase === 'place' && !this.myReady) { popup(this, 360, BIG.y + BIG.cell * 5, t('rivalReady'), '#5dff7a', 30); this.sfx('tick', { volume: 0.4 }); }
        this.tryBattle();
      });
      net.onScene(this, 'shot', (d: ShotMsg) => { if (d && typeof d.i === 'number') { this.shotsIn.push(d); this.takeShots(); } });
      net.onScene(this, 'res', (d: ResMsg) => { if (d && typeof d.i === 'number') { this.resIn.push(d); this.takeResults(); } });
      this.time.addEvent({ delay: 1000, loop: true, callback: () => this.tickPlaceTimer() });
    }
    this.ships = randomFleet();
    this.startPlacement();
  }

  // ------------------------------------------------------------------ textures

  private makeTextures(): void {
    for (const len of [2, 3, 4, 5]) {
      const key = `ship${len}`;
      if (this.textures.exists(key)) continue;
      const w = len * 64, h = 64;
      const tex = this.textures.createCanvas(key, w, h)!, ctx = tex.getContext();
      const hull = () => {
        ctx.beginPath();
        ctx.moveTo(10, 14); ctx.lineTo(w - 30, 12);
        ctx.quadraticCurveTo(w - 4, 22, w - 2, 32);
        ctx.quadraticCurveTo(w - 4, 42, w - 30, 52);
        ctx.lineTo(10, 50); ctx.quadraticCurveTo(2, 32, 10, 14);
        ctx.closePath();
      };
      ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.save(); ctx.translate(3, 4); hull(); ctx.fill(); ctx.restore();
      const gr = ctx.createLinearGradient(0, 12, 0, 52);
      gr.addColorStop(0, '#c4ccd8'); gr.addColorStop(0.5, '#8d98a8'); gr.addColorStop(1, '#5a6474');
      ctx.fillStyle = gr; hull(); ctx.fill();
      ctx.strokeStyle = '#2c3440'; ctx.lineWidth = 3; hull(); ctx.stroke();
      ctx.fillStyle = '#6a7484'; ctx.fillRect(16, 26, w - 56, 12);
      if (len === 5) {
        // carrier: flat deck with a runway and an island
        ctx.fillStyle = '#4c5563'; ctx.fillRect(14, 18, w - 50, 28);
        ctx.strokeStyle = '#f3f2f2'; ctx.setLineDash([10, 8]); ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(20, 32); ctx.lineTo(w - 44, 32); ctx.stroke(); ctx.setLineDash([]);
        ctx.fillStyle = '#9aa4b4'; ctx.fillRect(w * 0.55, 12, 26, 10);
      } else {
        ctx.fillStyle = '#a8b2c0'; ctx.fillRect(w * 0.42, 20, 34, 24);
        ctx.fillStyle = '#3a4250'; ctx.fillRect(w * 0.42 + 6, 25, 22, 6);
        for (let k = 0; k < len - 1; k++) {
          const tx = 26 + k * ((w - 70) / Math.max(1, len - 1));
          if (Math.abs(tx - (w * 0.42 + 17)) < 30) continue;
          ctx.fillStyle = '#4a5260'; ctx.beginPath(); ctx.arc(tx, 32, 8, 0, Math.PI * 2); ctx.fill();
          ctx.fillRect(tx, 30, 16, 4);
        }
      }
      tex.refresh();
    }
    if (!this.textures.exists('xmark')) {
      const g = this.make.graphics({ x: 0, y: 0 }, false);
      g.lineStyle(9, 0x000000, 0.6).lineBetween(8, 8, 40, 40).lineBetween(40, 8, 8, 40);
      g.lineStyle(5, 0xff4a2a).lineBetween(8, 8, 40, 40).lineBetween(40, 8, 8, 40);
      g.generateTexture('xmark', 48, 48);
      g.destroy();
    }
    if (!this.textures.exists('cross')) {
      const g = this.make.graphics({ x: 0, y: 0 }, false);
      g.lineStyle(5, 0xff4a2a).strokeCircle(32, 32, 22);
      g.lineBetween(32, 2, 32, 18).lineBetween(32, 46, 32, 62).lineBetween(2, 32, 18, 32).lineBetween(46, 32, 62, 32);
      g.fillStyle(0xff4a2a).fillCircle(32, 32, 3);
      g.generateTexture('cross', 64, 64);
      g.destroy();
    }
  }

  // ------------------------------------------------------------------ sea drawing

  private cx(g: Grid, i: number): number { return g.x + (i % N) * g.cell + g.cell / 2; }
  private cy(g: Grid, i: number): number { return g.y + Math.floor(i / N) * g.cell + g.cell / 2; }
  private cellAt(g: Grid, x: number, y: number): number {
    const c = Math.floor((x - g.x) / g.cell), r = Math.floor((y - g.y) / g.cell);
    return c >= 0 && r >= 0 && c < N && r < N ? r * N + c : -1;
  }

  private drawSea(g: Grid, labels: boolean, tint = 0x0d3a6e): void {
    const S = g.cell * N;
    const gfx = this.add.graphics().setDepth(1);
    gfx.fillStyle(0x000000, 0.4).fillRoundedRect(g.x - 8, g.y - 4, S + 16, S + 16, 10);
    gfx.fillStyle(tint).fillRoundedRect(g.x - 6, g.y - 6, S + 12, S + 12, 10);
    for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) {
      gfx.fillStyle((r + c) % 2 ? 0x0f4a8a : 0x11528f, 1).fillRect(g.x + c * g.cell, g.y + r * g.cell, g.cell, g.cell);
    }
    gfx.lineStyle(1, 0x5fa8ff, 0.35);
    for (let k = 0; k <= N; k++) {
      gfx.lineBetween(g.x + k * g.cell, g.y, g.x + k * g.cell, g.y + S);
      gfx.lineBetween(g.x, g.y + k * g.cell, g.x + S, g.y + k * g.cell);
    }
    gfx.lineStyle(3, 0x5fa8ff, 0.8).strokeRect(g.x, g.y, S, S);
    this.phaseObjs.push(gfx);
    if (labels) {
      for (let k = 0; k < N; k++) {
        this.phaseObjs.push(txt(this, g.x + k * g.cell + g.cell / 2, g.y - 20, String(k + 1), { size: 22, color: '#8fc8ff' }).setDepth(2));
        this.phaseObjs.push(txt(this, g.x - 22, g.y + k * g.cell + g.cell / 2, ROWS[k], { size: 22, color: '#8fc8ff' }).setDepth(2));
      }
    }
    // a few glints drifting over the water
    for (let k = 0; k < 5; k++) {
      const gl = this.add.rectangle(g.x + rng.int(10, S - 40), g.y + rng.int(10, S - 10), rng.int(14, 30), 3, 0xbfe3ff, 0.25).setDepth(2);
      this.tweens.add({ targets: gl, x: gl.x + 30, alpha: 0, duration: rng.int(1800, 2600), yoyo: true, repeat: -1, delay: rng.int(0, 1500) });
      this.phaseObjs.push(gl);
    }
  }

  private shipImage(g: Grid, s: { len: number; x: number; y: number; h: boolean }, depth = 5): Phaser.GameObjects.Image {
    const img = this.add.image(0, 0, `ship${s.len}`).setDepth(depth);
    this.placeShipImage(img, g, s);
    return img;
  }

  private placeShipImage(img: Phaser.GameObjects.Image, g: Grid, s: { len: number; x: number; y: number; h: boolean }): void {
    const w = s.len * g.cell, h = g.cell;
    img.setDisplaySize(w - 4, h - 6);
    img.setAngle(s.h ? 0 : 90);
    img.setPosition(g.x + s.x * g.cell + (s.h ? w : h) / 2, g.y + s.y * g.cell + (s.h ? h : w) / 2);
  }

  private clearPhase(): void {
    this.phaseObjs.forEach((o) => o.destroy());
    this.shipImgs.forEach((o) => o.destroy());
    this.fires.forEach((f) => f.destroy());
    this.fleetList.forEach((c) => c.destroy());
    this.phaseObjs = []; this.shipImgs = []; this.fires = []; this.fleetList = [];
  }

  // ------------------------------------------------------------------ placement

  private startPlacement(): void {
    this.round++;
    this.phase = 'place'; this.turn = 'busy';
    this.myReady = false; this.theirReady = false;
    this.placeLeft = PLACE_SECONDS;
    this.clearPhase();
    this.cross.setVisible(false);
    this.ships.forEach((s) => { s.hits = 0; });
    this.drawSea(BIG, true);
    this.shipImgs = this.ships.map((s) => this.shipImage(BIG, s));
    this.shipImgs.forEach((img, k) => {
      const y = img.y;
      img.setAlpha(0).setY(y - 30);
      this.tweens.add({ targets: img, alpha: 1, y, duration: 300, delay: k * 70, ease: 'Back.easeOut' });
    });
    this.sel = 0;
    const by = BIG.y + BIG.cell * N + 100;
    const b1 = new Button(this, 135, by, t('rotate'), () => this.rotateSel(), { width: 210, height: 88, size: 20, color: 0x2a6fd6 });
    const b2 = new Button(this, 360, by, t('auto'), () => this.autoPlace(), { width: 210, height: 88, size: 20, color: 0x2a6fd6 });
    const b3 = new Button(this, 585, by, t('ready'), () => this.confirmPlacement(), { width: 210, height: 88, size: 22, color: 0x2fa84f });
    b1.setDepth(20); b2.setDepth(20); b3.setDepth(20);
    b3.setName('readyBtn');
    this.phaseObjs.push(b1, b2, b3);
    const touch = this.sys.game.device.input.touch;
    this.phaseObjs.push(txt(this, 360, by + 110, touch ? t('placeTouch') : t('placeKeys'), { size: 24, color: '#8fc8ff', wrap: 660 }).setDepth(20));
    this.status.setText(t('placeTitle')).setColor('#ffd23f');
    this.updateInfo();
    this.highlightSel();
  }

  private updateInfo(): void {
    if (this.online) {
      const base = t('vs', { name: net.peerName || t('opponent') });
      this.info.setText(this.phase === 'place' ? `${base}   ${t('timeLeft', { n: this.placeLeft })}` : base);
    } else {
      this.hud.setRight(`${t('lives')} ${Math.max(0, this.lives)}`);
      this.hud.setCenter(`${t('level')} ${this.level + 1}`);
      this.info.setText(`${t('rival', { name: t('d' + this.level) })}   ${t('streak', { n: this.streak })}`);
    }
  }

  private tickPlaceTimer(): void {
    if (this.phase !== 'place' || this.myReady || this.isOver) return;
    this.placeLeft--;
    this.updateInfo();
    if (this.placeLeft <= 10 && this.placeLeft > 0) this.sfx('tick', { volume: 0.35 });
    if (this.placeLeft <= 0) this.confirmPlacement();
  }

  private highlightSel(): void {
    this.shipImgs.forEach((img, k) => img.setTint(k === this.sel && this.phase === 'place' && !this.myReady ? 0xfff2a0 : 0xffffff));
  }

  private cycleSel(): void {
    if (this.phase !== 'place' || this.myReady) return;
    this.sel = (this.sel + 1) % this.ships.length;
    this.highlightSel();
    this.sfx('move', { volume: 0.35 });
  }

  private rotateSel(): void {
    if (this.phase !== 'place' || this.myReady) return;
    const s = this.ships[this.sel];
    const h = !s.h;
    // keep the ship in the sea: slide it back inside when the turn pokes out
    let x = s.x, y = s.y;
    if (h) x = Math.min(x, N - s.len); else y = Math.min(y, N - s.len);
    if (!fits(this.ships, this.sel, x, y, h)) { this.sfx('error', { volume: 0.5 }); this.wiggle(this.sel); return; }
    Object.assign(s, { x, y, h });
    this.placeShipImage(this.shipImgs[this.sel], BIG, s);
    this.sfx('rotate', { volume: 0.5 });
  }

  private wiggle(k: number): void {
    const img = this.shipImgs[k];
    if (img) this.tweens.add({ targets: img, x: img.x + 8, duration: 45, yoyo: true, repeat: 2 });
  }

  private autoPlace(): void {
    if (this.phase !== 'place' || this.myReady) return;
    this.ships = randomFleet();
    this.ships.forEach((s, k) => {
      const img = this.shipImgs[k];
      this.placeShipImage(img, BIG, s);
      const sx = img.scaleX, sy = img.scaleY;
      img.setScale(sx * 0.2, sy * 0.2);
      this.tweens.add({ targets: img, scaleX: sx, scaleY: sy, duration: 220, delay: k * 50, ease: 'Back.easeOut' });
    });
    this.sfx('auto', { volume: 0.5 });
  }

  private moveSel(dx: number, dy: number): void {
    const s = this.ships[this.sel];
    // step over other ships when the next square is taken
    for (let k = 1; k < N; k++) {
      const x = s.x + dx * k, y = s.y + dy * k;
      if (!fits(this.ships, this.sel, x, y, s.h)) {
        if (x < 0 || y < 0 || x >= N || y >= N) break;
        continue;
      }
      s.x = x; s.y = y;
      this.placeShipImage(this.shipImgs[this.sel], BIG, s);
      this.sfx('move', { volume: 0.3 });
      return;
    }
    this.sfx('error', { volume: 0.4 });
  }

  private confirmPlacement(): void {
    if (this.phase !== 'place' || this.myReady || this.isOver) return;
    this.myReady = true;
    this.drag = null;
    this.highlightSel();
    this.sfx('ready', { volume: 0.6 });
    this.occ = occupancy(this.ships);
    this.incoming = new Int8Array(N * N);
    this.known = new Int8Array(N * N);
    this.shots = 0; this.hits = 0; this.combo = 0; this.shotNo = 0;
    const btn = this.children.getByName('readyBtn') as Button | null;
    btn?.setAlpha(0.4);
    if (this.online) {
      net.send('rdy', {});
      this.status.setText(t('waitingFleet')).setColor('#8fc8ff');
      this.tryBattle();
    } else {
      this.enemy = randomFleet();
      this.enemyOcc = occupancy(this.enemy);
      this.enemyShots = new Int8Array(N * N);
      this.gunner = newGunner(Math.min(this.level, 4));
      this.time.delayedCall(350, () => this.startBattle(this.round % 2 === 1));
    }
  }

  private tryBattle(): void {
    if (this.phase === 'place' && this.myReady && this.theirReady) this.time.delayedCall(250, () => this.startBattle(net.myTurnFirst));
  }

  // ------------------------------------------------------------------ battle

  private startBattle(meFirst: boolean): void {
    if (this.phase !== 'place' || this.isOver) return;
    this.phase = 'battle';
    this.status.setText('');
    this.clearPhase();
    this.enemyLeft = [...FLEET];
    this.drawSea(BIG, true, 0x0a2f5c);
    this.drawSea(SMALL, false);
    this.phaseObjs.push(txt(this, SMALL.x + SMALL.cell * 5, SMALL.y - 26, t('yourFleet'), { title: true, size: 16, color: '#8fc8ff' }).setDepth(3));
    this.shipImgs = this.ships.map((s) => this.shipImage(SMALL, s, 3));
    // enemy fleet board
    const lx = 360, ly = SMALL.y - 26;
    this.phaseObjs.push(txt(this, lx + 160, ly, t('enemyFleet'), { title: true, size: 16, color: '#ff9a8a' }).setDepth(3));
    FLEET.forEach((len, k) => {
      const c = this.add.container(lx + 20, ly + 50 + k * 48).setDepth(3);
      const img = this.add.image(0, 0, `ship${len}`).setOrigin(0, 0.5).setDisplaySize(len * 40, 34);
      const name = txt(this, len * 40 + 14, 0, t('ship' + k), { size: 20, color: '#c8d8ec' }).setOrigin(0, 0.5);
      c.add([img, name]);
      c.setData('len', len);
      this.fleetList.push(c);
    });
    this.cross.setPosition(this.cx(BIG, this.cur), this.cy(BIG, this.cur));
    this.sfx('horn', { volume: 0.6 });
    const go = txt(this, 360, BIG.y + BIG.cell * 5, t('battle'), { title: true, size: 44, color: '#ffd23f', strokeThickness: 10 }).setDepth(60).setScale(0.3);
    this.tweens.add({ targets: go, scale: 1, duration: 350, ease: 'Back.easeOut', hold: 600, yoyo: true, onComplete: () => go.destroy() });
    this.updateInfo();
    this.time.delayedCall(900, () => this.setTurn(meFirst ? 'aim' : 'theirs', false));
  }

  private setTurn(s: Turn, again: boolean): void {
    if (this.isOver || this.phase !== 'battle') return;
    const was = this.turn;
    this.turn = s;
    this.cross.setVisible(s === 'aim');
    if (s === 'aim') {
      this.status.setText(again ? t('again') : t('yourTurn')).setColor('#ffd23f');
      this.tweens.add({ targets: this.status, scale: { from: 1.25, to: 1 }, duration: 260, ease: 'Back.easeOut' });
      if (this.online && was === 'theirs') this.sfx('turn', { volume: 0.5 });
      return;
    }
    if (s === 'theirs') {
      this.status.setText(this.online ? t('theirTurn') : t('aiTurn')).setColor('#ff9a8a');
      if (this.online) this.takeShots();
      else this.time.delayedCall(again ? rng.int(450, 650) : rng.int(650, 950), () => this.aiShoot());
    }
  }

  private fire(i: number): void {
    if (this.phase !== 'battle' || this.turn !== 'aim' || this.isOver) return;
    if (this.known[i]) { this.sfx('error', { volume: 0.45 }); return; }
    this.turn = 'wait';
    this.cross.setVisible(false);
    this.shots++;
    const x = this.cx(BIG, i), y = this.cy(BIG, i);
    this.known[i] = 1;   // pending: no double shots
    const landAt = this.time.now + 420;
    this.shell(SMALL.x + SMALL.cell * 5, SMALL.y, x, y, 420);
    this.sfx('fire', { volume: 0.55 });
    if (this.online) {
      net.send('shot', { i, k: this.shotNo } satisfies ShotMsg);
      this.landAt = landAt;
      return;
    }
    const res = resolve(this.enemy, this.enemyOcc, this.enemyShots, i);
    this.time.delayedCall(420, () => this.applyMyShot(i, res));
  }

  /** A shell arcing from (x1, y1) to (x2, y2). */
  private shell(x1: number, y1: number, x2: number, y2: number, ms: number): void {
    const b = this.add.circle(x1, y1, 8, 0xffe08a).setDepth(50);
    const glow = this.add.image(x1, y1, 'glow').setDisplaySize(40, 40).setTint(0xffa040).setBlendMode('ADD').setDepth(49);
    const peak = Math.min(y1, y2) - 140;
    this.tweens.addCounter({
      from: 0, to: 1, duration: ms,
      onUpdate: (tw) => {
        const k = tw.getValue() ?? 0;
        const x = x1 + (x2 - x1) * k, y = (1 - k) * (1 - k) * y1 + 2 * (1 - k) * k * peak + k * k * y2;
        b.setPosition(x, y).setScale(1 + Math.sin(k * Math.PI) * 0.8);
        glow.setPosition(x, y);
      },
      onComplete: () => { b.destroy(); glow.destroy(); },
    });
  }

  private takeResults(): void {
    while (this.turn === 'wait' && !this.isOver && this.resIn.length) {
      const d = this.resIn.shift()!;
      if (d.k !== this.shotNo) continue;
      const wait = Math.max(0, this.landAt - this.time.now);
      const res: ShotResult = { r: d.r, cells: d.s, len: d.l, all: !!d.w };
      this.turn = 'busy';
      this.time.delayedCall(wait, () => this.applyMyShot(d.i, res));
    }
  }

  /** Result of my shot at cell i (from the CPU's fleet or the opponent's answer). */
  private applyMyShot(i: number, res: ShotResult): void {
    if (this.isOver) return;
    this.shotNo++;
    const x = this.cx(BIG, i), y = this.cy(BIG, i);
    if (res.r === 0) {
      this.known[i] = 1;
      this.combo = 0;
      this.splash(BIG, i);
      this.sfxAt('miss', x, { volume: 0.55 });
      this.setTurn('theirs', false);
      return;
    }
    this.hits++; this.combo++;
    this.known[i] = 2;
    this.explode(BIG, i, true);
    if (!this.online) this.addScore(10 * Math.min(this.combo, 5), x, y - 30);
    if (res.r === 2 && res.cells) {
      for (const c of res.cells) this.known[c] = 3;
      this.sinkReveal(res.cells);
      const k = this.enemyLeft.indexOf(res.len ?? res.cells.length);
      if (k >= 0) this.enemyLeft.splice(k, 1);
      this.markFleetList(res.len ?? res.cells.length);
      if (!this.online) this.addScore(40 * (res.len ?? 2), x, y - 70);
    }
    if (res.all) { this.time.delayedCall(700, () => this.finish(true)); return; }
    this.time.delayedCall(res.r === 2 ? 650 : 250, () => this.setTurn('aim', true));
  }

  private markFleetList(len: number): void {
    const c = this.fleetList.find((o) => o.getData('len') === len && !o.getData('sunk'));
    if (!c) return;
    c.setData('sunk', true);
    c.setAlpha(0.45);
    const x = this.add.image(len * 20, 0, 'xmark').setDisplaySize(40, 40);
    c.add(x);
    this.tweens.add({ targets: c, scale: { from: 1.2, to: 1 }, duration: 300 });
  }

  private sinkReveal(cells: number[]): void {
    const xs = cells.map((c) => c % N), ys = cells.map((c) => Math.floor(c / N));
    const s = { len: cells.length, x: Math.min(...xs), y: Math.min(...ys), h: new Set(ys).size === 1 };
    const img = this.shipImage(BIG, s, 6).setTint(0x8a4a40).setAlpha(0);
    this.phaseObjs.push(img);
    this.tweens.add({ targets: img, alpha: 0.9, duration: 400 });
    cells.forEach((c, k) => this.time.delayedCall(k * 90, () => {
      burst(this, this.cx(BIG, c), this.cy(BIG, c), [0xff7a2a, 0xffd23f, 0x444444], 16, 260);
      this.smoke(BIG, c);
    }));
    shake(this, 0.014, 320);
    flash(this, 0xffa040, 140);
    this.sfx('sink', { volume: 0.7 });
    popup(this, 360, BIG.y - 40 + BIG.cell * 5, t('sunk'), '#ffd23f', 40);
  }

  private splash(g: Grid, i: number): void {
    const x = this.cx(g, i), y = this.cy(g, i);
    const big = g === BIG;
    const dot = this.add.circle(x, y, big ? 9 : 4, 0xe8f4ff).setDepth(7).setScale(0);
    this.tweens.add({ targets: dot, scale: 1, duration: 200, ease: 'Back.easeOut' });
    this.phaseObjs.push(dot);
    for (let k = 0; k < 2; k++) {
      const ring = this.add.circle(x, y, big ? 10 : 5).setStrokeStyle(3, 0xbfe3ff, 0.9).setDepth(7);
      this.tweens.add({ targets: ring, scale: big ? 3 : 2.4, alpha: 0, duration: 600, delay: k * 160, onComplete: () => ring.destroy() });
    }
    burst(this, x, y, [0xbfe3ff, 0xffffff], big ? 10 : 5, big ? 140 : 70);
  }

  private explode(g: Grid, i: number, fire: boolean): void {
    const x = this.cx(g, i), y = this.cy(g, i);
    const big = g === BIG;
    const peg = this.add.circle(x, y, big ? 13 : 7, 0xec3013).setStrokeStyle(3, 0x5a0a00).setDepth(8).setScale(0);
    this.tweens.add({ targets: peg, scale: 1, duration: 200, ease: 'Back.easeOut' });
    this.phaseObjs.push(peg);
    const boom = this.add.image(x, y, 'glow').setDisplaySize(big ? 120 : 60, big ? 120 : 60).setTint(0xffa040).setBlendMode('ADD').setDepth(9);
    this.tweens.add({ targets: boom, alpha: 0, scale: boom.scale * 1.6, duration: 380, onComplete: () => boom.destroy() });
    burst(this, x, y, [0xff7a2a, 0xffd23f, 0xffffff], big ? 18 : 10, big ? 280 : 160);
    shake(this, big ? 0.008 : 0.012, 160);
    this.sfxAt('hit', x, { volume: 0.65 });
    if (fire) {
      const em = this.add.particles(x, y, 'fire', {
        lifespan: 520, speedY: { min: -60, max: -20 }, speedX: { min: -10, max: 10 }, scale: { start: big ? 0.07 : 0.035, end: 0 },
        alpha: { start: 0.85, end: 0 }, tint: [0xff7a2a, 0xffd23f], frequency: 110, blendMode: 'ADD',
      }).setDepth(9);
      this.fires.push(em);
    }
  }

  private smoke(g: Grid, i: number): void {
    const em = this.add.particles(this.cx(g, i), this.cy(g, i), 'smoke', {
      lifespan: 1300, speedY: { min: -40, max: -18 }, speedX: { min: -8, max: 8 }, scale: { start: 0.05, end: 0.12 },
      alpha: { start: 0.35, end: 0 }, tint: 0x333333, frequency: 380,
    }).setDepth(9);
    this.fires.push(em);
  }

  // ---- incoming shots (CPU or opponent)

  private aiShoot(): void {
    if (this.isOver || this.turn !== 'theirs' || this.phase !== 'battle') return;
    const i = aim(this.gunner);
    if (i < 0) return;
    this.takeIncoming(i, (res) => learn(this.gunner, i, res));
  }

  private takeShots(): void {
    while (this.turn === 'theirs' && !this.isOver && this.shotsIn.length) {
      const d = this.shotsIn.shift()!;
      if (d.k !== this.shotNo || d.i < 0 || d.i >= N * N || this.incoming[d.i]) continue;
      this.takeIncoming(d.i, (res) => {
        const msg: ResMsg = { i: d.i, k: d.k, r: res.r };
        if (res.cells) { msg.s = res.cells; msg.l = res.len; }
        if (res.all) msg.w = 1;
        net.send('res', msg);
      });
    }
  }

  private takeIncoming(i: number, report: (res: ShotResult) => void): void {
    this.turn = 'busy';
    const res = resolve(this.ships, this.occ, this.incoming, i);
    report(res);
    const x = this.cx(SMALL, i), y = this.cy(SMALL, i);
    this.shell(360, 60, x, y, 380);
    this.sfx('incoming', { volume: 0.4 });
    this.time.delayedCall(380, () => {
      if (this.isOver) return;
      this.shotNo++;
      if (res.r === 0) {
        this.splash(SMALL, i);
        this.sfxAt('miss', x, { volume: 0.45 });
        this.time.delayedCall(300, () => this.setTurn('aim', false));
        return;
      }
      this.explode(SMALL, i, false);
      flash(this, 0xec3013, 90, 0.25);
      if (res.r === 2) {
        const k = this.occ[i] - 1;
        this.shipImgs[k]?.setTint(0x8a4a40);
        shake(this, 0.02, 300);
        this.sfx('sink', { volume: 0.6 });
        popup(this, SMALL.x + SMALL.cell * 5, SMALL.y + SMALL.cell * 5, t('lostShip'), '#ff7a7a', 26);
      }
      if (res.all) { this.time.delayedCall(700, () => this.finish(false)); return; }
      this.time.delayedCall(250, () => this.setTurn('theirs', true));
    });
  }

  // ------------------------------------------------------------------ input

  private onDown(p: Phaser.Input.Pointer): void {
    if (this.isOver) return;
    if (this.phase === 'place' && !this.myReady) {
      const i = this.cellAt(BIG, p.x, p.y);
      if (i < 0) return;
      const k = occupancy(this.ships)[i] - 1;
      if (k >= 0) {
        const s = this.ships[k];
        this.drag = { idx: k, ox: (i % N) - s.x, oy: Math.floor(i / N) - s.y, sx: s.x, sy: s.y, moved: false };
        if (k !== this.sel) { this.sel = k; this.highlightSel(); this.sfx('pick', { volume: 0.5 }); this.drag.moved = true; }
        this.shipImgs[k].setDepth(12);
        return;
      }
      // tap on open water: move the selected ship there
      const s = this.ships[this.sel];
      const x = Math.min(i % N, s.h ? N - s.len : N - 1), y = Math.min(Math.floor(i / N), s.h ? N - 1 : N - s.len);
      if (fits(this.ships, this.sel, x, y, s.h)) { s.x = x; s.y = y; this.placeShipImage(this.shipImgs[this.sel], BIG, s); this.sfx('move', { volume: 0.4 }); }
      else this.sfx('error', { volume: 0.4 });
      return;
    }
    if (this.phase === 'battle') {
      const i = this.cellAt(BIG, p.x, p.y);
      if (i < 0) return;
      this.cur = i;
      this.cross.setPosition(this.cx(BIG, i), this.cy(BIG, i));
      this.fire(i);
    }
  }

  private onMove(p: Phaser.Input.Pointer): void {
    if (this.phase === 'battle' && this.turn === 'aim' && !p.wasTouch) {
      const i = this.cellAt(BIG, p.x, p.y);
      if (i >= 0 && i !== this.cur) { this.cur = i; this.cross.setPosition(this.cx(BIG, i), this.cy(BIG, i)); }
      return;
    }
    const d = this.drag;
    if (!d || !p.isDown || this.phase !== 'place') return;
    const s = this.ships[d.idx];
    const c = Math.floor((p.x - BIG.x) / BIG.cell) - d.ox, r = Math.floor((p.y - BIG.y) / BIG.cell) - d.oy;
    const x = Phaser.Math.Clamp(c, 0, s.h ? N - s.len : N - 1), y = Phaser.Math.Clamp(r, 0, s.h ? N - 1 : N - s.len);
    if (x === s.x && y === s.y) return;
    d.moved = true;
    const ok = fits(this.ships, d.idx, x, y, s.h);
    s.x = x; s.y = y;
    this.placeShipImage(this.shipImgs[d.idx], BIG, s);
    this.shipImgs[d.idx].setTint(ok ? 0xfff2a0 : 0xff6a5a);
  }

  private onUp(_p: Phaser.Input.Pointer): void {
    const d = this.drag;
    this.drag = null;
    if (!d || this.phase !== 'place' || this.myReady) return;
    const s = this.ships[d.idx];
    this.shipImgs[d.idx].setDepth(5);
    if (!d.moved && s.x === d.sx && s.y === d.sy) { this.rotateSel(); this.highlightSel(); return; }
    if (!fits(this.ships, d.idx, s.x, s.y, s.h)) {
      s.x = d.sx; s.y = d.sy;
      this.placeShipImage(this.shipImgs[d.idx], BIG, s);
      this.sfx('error', { volume: 0.5 });
      this.wiggle(d.idx);
    } else if (s.x !== d.sx || s.y !== d.sy) this.sfx('drop', { volume: 0.5 });
    this.highlightSel();
  }

  private onArrow(dx: number, dy: number): void {
    if (this.phase === 'place' && !this.myReady) { this.moveSel(dx, dy); return; }
    if (this.phase === 'battle') {
      const x = Phaser.Math.Wrap((this.cur % N) + dx, 0, N), y = Phaser.Math.Wrap(Math.floor(this.cur / N) + dy, 0, N);
      this.cur = y * N + x;
      this.cross.setPosition(this.cx(BIG, this.cur), this.cy(BIG, this.cur));
      if (this.turn === 'aim') this.sfx('move', { volume: 0.25 });
    }
  }

  private onConfirm(): void {
    if (this.phase === 'place') this.confirmPlacement();
    else if (this.phase === 'battle') this.fire(this.cur);
  }

  // ------------------------------------------------------------------ end of a battle

  private finish(win: boolean): void {
    if (this.isOver || this.phase !== 'battle') return;
    this.phase = 'done';
    this.turn = 'busy';
    this.cross.setVisible(false);
    this.status.setText('');
    const acc = this.shots ? Math.round((this.hits / this.shots) * 100) : 0;
    this.banner.setText(win ? t('victory') : t('defeat')).setColor(win ? '#5dff7a' : '#ec3013').setVisible(true).setAlpha(1).setScale(0.3);
    this.tweens.add({ targets: this.banner, scale: 1, duration: 400, ease: 'Back.easeOut' });
    popup(this, 360, BIG.y + BIG.cell * 5 + 70, t('accuracy', { n: acc }), '#8fc8ff', 30);
    if (win) {
      this.sfx('win'); flash(this, 0x5dff7a, 150);
      for (let k = 0; k < 6; k++) this.time.delayedCall(k * 130, () => burst(this, rng.int(120, 600), rng.int(280, 800), [0xffd23f, 0xffffff, 0x5dff7a], 22, 320));
    } else { this.sfx('lose'); flash(this, 0xec3013, 200); shake(this, 0.02, 400); }
    // the defender's whole fleet comes up when the CPU wins
    if (!win && !this.online) this.enemy.forEach((s) => {
      if (s.hits >= s.len) return;
      const img = this.shipImage(BIG, s, 6).setAlpha(0);
      this.phaseObjs.push(img);
      this.tweens.add({ targets: img, alpha: 0.75, duration: 500 });
    });
    if (this.online) {
      this.setScore(win ? 300 + acc * 3 : this.hits * 10);
      this.endGame({ win, title: win ? t('youWin') : t('youLose'), delay: 2400 });
      return;
    }
    if (win) {
      this.streak++;
      this.addScore(300 * (this.level + 1) + acc * 5 + this.streak * 50, 360, BIG.y + 40);
      this.level = Math.min(this.level + 1, 4);
    } else { this.lives--; this.streak = 0; }
    this.updateInfo();
    if (this.lives <= 0) { this.endGame({ delay: 2600 }); return; }
    this.time.delayedCall(2800, () => {
      if (this.isOver) return;
      this.tweens.add({ targets: this.banner, alpha: 0, duration: 250, onComplete: () => this.banner.setVisible(false) });
      this.startPlacement();
    });
  }

  updateGame(): void {
    /* turn-based: driven by input, timers and tweens */
  }
}
