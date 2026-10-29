import Phaser from 'phaser';
import { ArcadeScene, Controls, burst, shake, flash, popup, t, txt, rng } from '@core';
import { LEVELS } from './levels';
import { HERO_SCALE, HERO_ORIGIN_Y, HERO_BODY } from './hero';

const TS = 64, OY = 720 - 11 * TS, SC = 0.5;
const RUN = 300, ACCEL = 2400, JUMP = -800, SPRING = -1290, CUT = -320;
const BGS = ['bg-grass', 'bg-land', 'bg-shroom', 'bg-desert'];
const GEMS = ['gem-blue', 'gem-green', 'gem-red', 'gem-yellow'];

type Body = Phaser.Physics.Arcade.Body;
type Kind = 's' | 'n' | 'w' | 'f' | 'b';
interface Enemy { kind: Kind; spr: Phaser.Physics.Arcade.Sprite; dir: number; t: number; x0: number; y0: number; alive: boolean }
interface Mover { obj: Phaser.GameObjects.TileSprite; min: number; max: number; dir: number }
interface Rect { x: number; y: number; w: number; h: number }

export class PlayScene extends ArcadeScene {
  private controls!: Controls;
  private player!: Phaser.Physics.Arcade.Sprite;
  private solids!: Phaser.Physics.Arcade.StaticGroup;
  private oneways!: Phaser.Physics.Arcade.StaticGroup;
  private movers: Mover[] = [];
  private moverGroup!: Phaser.Physics.Arcade.Group;
  private enemyGroup!: Phaser.Physics.Arcade.Group;
  private enemies: Enemy[] = [];
  private hazards: Rect[] = [];
  private springs: Array<{ r: Rect; img: Phaser.GameObjects.Image }> = [];
  private gems: Phaser.GameObjects.Image[] = [];
  private flag!: Phaser.GameObjects.Image;
  private levelObjs: Phaser.GameObjects.GameObject[] = [];
  private hearts: Phaser.GameObjects.Image[] = [];
  private bg!: Phaser.GameObjects.Image;
  private level = 0;
  private lives = 3;
  private gemsGot = 0;
  private gemsTotal = 0;
  private state: 'intro' | 'play' | 'dead' | 'won' = 'intro';
  private levelT = 0;
  private coyote = 0;
  private jumpBuf = 0;
  private prevJump = false;
  private touch = { left: false, right: false, jump: false };
  private walkT = 0;
  private wasOnGround = true;
  /** Vertical speed in the previous frame, for the landing thud. */
  private airVy = 0;
  private stompChain = 0;
  private boosted = false;

  createGame(): void {
    this.level = 0; this.lives = 3; this.gemsGot = 0; this.gemsTotal = 0; this.state = 'intro';
    this.movers = []; this.enemies = []; this.hazards = []; this.springs = []; this.gems = []; this.levelObjs = []; this.hearts = [];
    this.coyote = 0; this.jumpBuf = 0; this.prevJump = false; this.walkT = 0; this.wasOnGround = true; this.stompChain = 0; this.boosted = false;
    this.touch = { left: false, right: false, jump: false };

    this.bg = this.add.image(0, 720, BGS[0]).setOrigin(0, 1).setScale(1.25).setDepth(-10);
    this.physics.world.setBounds(0, -400, 1280, 1400, true, true, false, false);
    this.solids = this.physics.add.staticGroup();
    this.oneways = this.physics.add.staticGroup();
    this.moverGroup = this.physics.add.group({ allowGravity: false, immovable: true, frictionX: 1 });
    this.enemyGroup = this.physics.add.group();

    this.player = this.physics.add.sprite(100, 400, 'pc-stand').setOrigin(0.5, HERO_ORIGIN_Y).setScale(HERO_SCALE).setDepth(20);
    const pb = this.player.body as Body;
    pb.setSize(HERO_BODY[0], HERO_BODY[1]).setOffset(HERO_BODY[2], HERO_BODY[3]);
    pb.setMaxVelocity(RUN, 1300);
    this.player.setCollideWorldBounds(true);

    this.physics.add.collider(this.player, this.solids);
    this.physics.add.collider(this.player, this.oneways);
    this.physics.add.collider(this.player, this.moverGroup);
    const walkerOnly = (e: unknown) => ((e as Phaser.Physics.Arcade.Sprite).body as Body).allowGravity;
    this.physics.add.collider(this.enemyGroup, this.solids, undefined, walkerOnly);
    this.physics.add.collider(this.enemyGroup, this.oneways, undefined, walkerOnly);

    for (let i = 0; i < 3; i++) this.hearts.push(this.add.image(42 + i * 50, 92, 'heart').setScale(0.36).setDepth(9000));

    this.controls = new Controls(this);
    this.buildTouch();
    this.loadLevel();
  }

  // ---------- touch controls ----------

  private buildTouch(): void {
    if (!this.sys.game.device.input.touch) return;
    this.input.addPointer(2);
    const mk = (x: number, y: number, r: number, key: 'left' | 'right' | 'jump', draw: (g: Phaser.GameObjects.Graphics) => void) => {
      const c = this.add.circle(x, y, r, 0xffffff, 0.18).setStrokeStyle(5, 0xffffff, 0.6).setDepth(9500).setInteractive();
      const g = this.add.graphics({ x, y }).setDepth(9501);
      g.fillStyle(0xffffff, 0.85);
      draw(g);
      const set = (v: boolean) => { this.touch[key] = v; c.setFillStyle(0xffffff, v ? 0.4 : 0.18); };
      c.on('pointerdown', () => set(true));
      c.on('pointerup', () => set(false));
      c.on('pointerout', () => set(false));
    };
    mk(95, 625, 66, 'left', (g) => g.fillTriangle(-26, 0, 16, -26, 16, 26));
    mk(255, 625, 66, 'right', (g) => g.fillTriangle(26, 0, -16, -26, -16, 26));
    mk(1180, 615, 78, 'jump', (g) => g.fillTriangle(0, -28, -30, 18, 30, 18));
  }

  // ---------- level building ----------

  private cell(c: number, r: number): string {
    const rows = LEVELS[this.level];
    if (r < 0 || r >= rows.length || c < 0 || c >= 20) return '.';
    return rows[r][c];
  }

  private solidAt(c: number, r: number): boolean {
    const ch = this.cell(c, r);
    return ch === '#' || ch === '=';
  }

  private clearLevel(): void {
    this.solids.clear(true, true);
    this.oneways.clear(true, true);
    this.moverGroup.clear(true, true);
    this.enemyGroup.clear(true, true);
    this.levelObjs.forEach((o) => o.destroy());
    this.levelObjs = []; this.movers = []; this.enemies = []; this.hazards = []; this.springs = []; this.gems = [];
  }

  private img(x: number, y: number, key: string, depth = 5): Phaser.GameObjects.Image {
    const im = this.add.image(x, y, key).setScale(SC).setDepth(depth);
    this.levelObjs.push(im);
    return im;
  }

  private zone(group: Phaser.Physics.Arcade.StaticGroup, x: number, y: number, w: number, h: number, oneWay = false): void {
    const z = this.add.zone(x + w / 2, y + h / 2, w, h);
    this.physics.add.existing(z, true);
    group.add(z);
    if (oneWay) {
      const b = z.body as Phaser.Physics.Arcade.StaticBody;
      b.checkCollision.down = false; b.checkCollision.left = false; b.checkCollision.right = false;
    }
  }

  private loadLevel(): void {
    this.clearLevel();
    const rows = LEVELS[this.level];
    this.bg.setTexture(BGS[Math.floor(this.level / 3) % BGS.length]);
    this.gemsGot = 0; this.gemsTotal = 0; this.levelT = 0; this.stompChain = 0;
    let start = { x: 100, y: 500 };
    for (let r = 0; r < rows.length; r++) {
      // merged colliders for runs of ground / platforms
      for (const [ch, group, oneWay] of [['#', this.solids, false], ['=', this.oneways, true]] as const) {
        let c = 0;
        while (c < 20) {
          if (rows[r][c] !== ch) { c++; continue; }
          const c0 = c;
          while (c < 20 && rows[r][c] === ch) c++;
          this.zone(group, c0 * TS, OY + r * TS, (c - c0) * TS, oneWay ? 34 : TS, oneWay);
        }
      }
      for (let c = 0; c < 20; c++) {
        const ch = rows[r][c];
        const x = c * TS + TS / 2, y = OY + r * TS + TS / 2;
        switch (ch) {
          case '#': {
            const above = this.cell(c, r - 1);
            const open = (!this.solidAt(c, r - 1) || above === '=') && above !== '~' && above !== '^';
            if (!open) { this.img(x, y, 'g-center'); break; }
            const l = this.cell(c - 1, r) === '#', rr = this.cell(c + 1, r) === '#';
            this.img(x, y, l && rr ? 'g-mid' : l ? 'g-right' : rr ? 'g-left' : 'g-single');
            break;
          }
          case '=': {
            const l = this.cell(c - 1, r) === '=', rr = this.cell(c + 1, r) === '=';
            this.img(x, y, l && rr ? 'h-mid' : l ? 'h-right' : rr ? 'h-left' : 'h-single');
            break;
          }
          case '^':
            this.img(x, y, 'spikes');
            this.hazards.push({ x: c * TS + 6, y: OY + r * TS + 40, w: TS - 12, h: 24 });
            break;
          case '~': {
            const lv = this.img(x, y, 'lava-top', 4);
            this.tweens.add({ targets: lv, y: y - 4, duration: 600 + (c % 3) * 120, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
            this.hazards.push({ x: c * TS, y: OY + r * TS + 28, w: TS, h: 36 });
            break;
          }
          case 'S': {
            const im = this.img(x, y, 'spring', 6);
            this.springs.push({ r: { x: c * TS + 8, y: OY + r * TS + 32, w: TS - 16, h: 32 }, img: im });
            break;
          }
          case 'G': {
            const g = this.img(x, y - 4, GEMS[this.gemsTotal % GEMS.length], 8);
            this.tweens.add({ targets: g, y: y - 14, duration: 700, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
            this.gems.push(g);
            this.gemsTotal++;
            break;
          }
          case 'F':
            this.flag = this.img(x, y, 'flag-down', 6);
            break;
          case 'P':
            start = { x, y: OY + (r + 1) * TS - 64 };
            break;
          case 'm': {
            const obj = this.add.tileSprite(c * TS + TS * 1.5, y, TS * 3, TS, 'h-mid').setTileScale(SC).setDepth(6);
            this.levelObjs.push(obj);
            this.moverGroup.add(obj);
            const b = obj.body as Body;
            b.setSize(TS * 3, 34).setOffset(0, 0);
            b.setAllowGravity(false).setImmovable(true).setFriction(1, 0);
            b.checkCollision.down = false; b.checkCollision.left = false; b.checkCollision.right = false;
            b.setVelocityX(110);
            this.movers.push({ obj, min: obj.x, max: obj.x + TS * 8, dir: 1 });
            break;
          }
          case 's': case 'n': case 'w': case 'f': case 'b':
            this.spawnEnemy(ch, x, y);
            break;
        }
      }
    }
    const pb = this.player.body as Body;
    pb.enable = true;
    this.player.setPosition(start.x, start.y).setTexture('pc-stand').setFlipX(false).setAngle(0).setAlpha(1).setVisible(true);
    pb.reset(start.x, start.y);
    pb.setVelocity(0, 0);
    this.updateHud();

    // intro banner
    this.state = 'intro';
    const b = txt(this, 640, 300, `${t('level')} ${this.level + 1}/${LEVELS.length}`, { title: true, size: 48, color: '#ffd23f' }).setDepth(9000).setScale(0.2);
    const sub = txt(this, 640, 370, t('collectAll'), { size: 30, color: '#ffffff' }).setDepth(9000).setAlpha(0);
    this.tweens.add({ targets: b, scale: 1, duration: 350, ease: 'Back.easeOut' });
    this.tweens.add({ targets: sub, alpha: 1, duration: 300, delay: 200 });
    this.tweens.add({ targets: [b, sub], alpha: 0, delay: 1300, duration: 300, onComplete: () => { b.destroy(); sub.destroy(); } });
    this.time.delayedCall(700, () => { if (this.state === 'intro') this.state = 'play'; });
    this.sfx('start', { volume: 0.45 });
  }

  private spawnEnemy(kind: Kind, x: number, y: number): void {
    const key = { s: 'e-slime', n: 'e-snail', w: 'e-saw', f: 'e-fly', b: 'e-bee' }[kind];
    const spr = this.enemyGroup.create(x, y, key) as Phaser.Physics.Arcade.Sprite;
    spr.setScale(SC).setDepth(10);
    const b = spr.body as Body;
    if (kind === 's') b.setSize(80, 56).setOffset(24, 72);
    else if (kind === 'n') b.setSize(88, 62).setOffset(20, 66);
    else if (kind === 'w') b.setCircle(50, 14, 14);
    else b.setSize(80, 64).setOffset(24, 34);
    const flying = kind === 'f' || kind === 'b';
    b.setAllowGravity(!flying);
    if (kind === 'w') { spr.setY(y); }
    const speed = { s: 70, n: 40, w: 140, f: 120, b: 0 }[kind];
    const e: Enemy = { kind, spr, dir: -1, t: 0, x0: x, y0: y, alive: true };
    b.setVelocityX(-speed);
    spr.setData('speed', speed);
    this.enemies.push(e);
    spr.setAlpha(0);
    this.tweens.add({ targets: spr, alpha: 1, duration: 400 });
  }

  // ---------- helpers ----------

  private updateHud(): void {
    this.hud.setRight(`${t('level')} ${this.level + 1}`);
    this.hud.setCenter(`${t('gems')} ${this.gemsGot}/${this.gemsTotal}`);
    this.hearts.forEach((h, i) => h.setTexture(i < this.lives ? 'heart' : 'heart-empty'));
  }

  private playerRect(): Rect {
    const b = this.player.body as Body;
    return { x: b.x, y: b.y, w: b.width, h: b.height };
  }

  private hit(a: Rect, b: Rect): boolean {
    return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
  }

  // ---------- events ----------

  private collectGem(g: Phaser.GameObjects.Image): void {
    this.gems = this.gems.filter((x) => x !== g);
    this.gemsGot++;
    this.addScore(100, g.x, g.y - 30);
    this.sfxAt('gem', g.x, { volume: 0.5, rate: 1 + this.gemsGot * 0.08 });
    burst(this, g.x, g.y, [0x3ee6ff, 0xffffff, 0xffd23f], 16, 220);
    this.tweens.killTweensOf(g);
    this.tweens.add({ targets: g, scale: 0.8, alpha: 0, y: g.y - 40, duration: 260, onComplete: () => g.destroy() });
    this.updateHud();
    if (this.gemsGot >= this.gemsTotal) {
      this.flag.setTexture('flag-1');
      this.sfxAt('flagup', this.flag.x, { volume: 0.6 });
      burst(this, this.flag.x, this.flag.y - 20, [0x5dff7a, 0xffffff], 20, 260);
      popup(this, this.flag.x, this.flag.y - 70, t('flagUp'), '#5dff7a', 20);
      this.tweens.add({ targets: this.flag, scale: SC * 1.2, duration: 160, yoyo: true });
    }
  }

  private die(): void {
    if (this.state !== 'play') return;
    this.state = 'dead';
    this.lives--;
    this.updateHud();
    this.sfxAt('hurt', this.player.x, { volume: 0.65 });
    this.time.delayedCall(300, () => this.sfx('fall', { volume: 0.5 }));
    shake(this, 0.018, 280);
    flash(this, 0xec3013, 160);
    const pb = this.player.body as Body;
    pb.enable = false;
    this.player.setTexture('pc-hit');
    burst(this, this.player.x, this.player.y, [0xec3013, 0xffffff], 22, 300);
    this.tweens.add({ targets: this.player, y: this.player.y - 90, duration: 300, ease: 'Quad.easeOut', yoyo: false,
      onComplete: () => this.tweens.add({ targets: this.player, y: 900, angle: 200, duration: 700, ease: 'Quad.easeIn' }) });
    this.time.delayedCall(1300, () => {
      if (this.lives <= 0) this.endGame({ delay: 0 });
      else this.loadLevel();
    });
  }

  private winLevel(): void {
    this.state = 'won';
    const pb = this.player.body as Body;
    pb.setVelocity(0, 0); pb.enable = false;
    this.player.setTexture('pc-jump');
    const bonus = 300 + Math.max(0, Math.round(60 - this.levelT)) * 10;
    this.addScore(bonus, this.flag.x - 60, this.flag.y - 90);
    this.sfx('win', { volume: 0.6, exact: true });
    flash(this, 0x5dff7a, 150);
    for (let i = 0; i < 4; i++) this.time.delayedCall(i * 150, () => burst(this, this.flag.x + (i - 1.5) * 30, this.flag.y - 40, [0xffd23f, 0x5dff7a, 0x3ee6ff, 0xff4fa3], 18, 320));
    this.tweens.add({ targets: this.player, y: this.player.y - 40, duration: 220, yoyo: true, repeat: 1 });
    const msg = txt(this, 640, 300, t('levelClear'), { title: true, size: 46, color: '#5dff7a' }).setDepth(9000).setScale(0.2);
    this.tweens.add({ targets: msg, scale: 1, duration: 350, ease: 'Back.easeOut' });
    this.time.delayedCall(1700, () => {
      msg.destroy();
      if (this.level >= LEVELS.length - 1) {
        this.addScore(this.lives * 1000, 640, 360);
        this.endGame({ win: true, delay: 300 });
        return;
      }
      this.level++;
      this.loadLevel();
    });
  }

  // ---------- loop ----------

  updateGame(_time: number, delta: number): void {
    const dt = delta / 1000;
    for (const m of this.movers) {
      const b = m.obj.body as Body;
      if (m.obj.x >= m.max && m.dir > 0) { m.dir = -1; b.setVelocityX(-110); }
      else if (m.obj.x <= m.min && m.dir < 0) { m.dir = 1; b.setVelocityX(110); }
    }
    this.updateEnemies(dt);
    if (this.state !== 'play' && this.state !== 'intro') return;

    const pb = this.player.body as Body;
    const c = this.controls;
    const ax = (c.axisX < -0.3 || this.touch.left ? -1 : 0) + (c.axisX > 0.3 || this.touch.right ? 1 : 0);
    const jumpHeld = c.a || c.up || this.touch.jump;
    const jumpPressed = jumpHeld && !this.prevJump;
    this.prevJump = jumpHeld;
    if (this.state === 'intro') { pb.setVelocityX(0); return; }
    this.levelT += dt;

    // horizontal with a little acceleration
    const target = ax * RUN;
    const vx = pb.velocity.x;
    const step = ACCEL * dt * (pb.blocked.down ? 1 : 0.7);
    pb.setVelocityX(Math.abs(target - vx) <= step ? target : vx + Math.sign(target - vx) * step);
    if (ax) this.player.setFlipX(ax < 0);

    const onGround = pb.blocked.down || pb.touching.down;
    if (onGround) { this.coyote = 0.1; this.stompChain = 0; } else this.coyote -= dt;
    if (jumpPressed) this.jumpBuf = 0.13; else this.jumpBuf -= dt;
    if (this.jumpBuf > 0 && this.coyote > 0) {
      pb.setVelocityY(JUMP);
      this.coyote = 0; this.jumpBuf = 0;
      this.sfxAt(rng.pick(['jump', 'jump2']), this.player.x, { volume: 0.4 });
      burst(this, this.player.x, pb.bottom, 0xffffff, 6, 120);
    }
    if (pb.velocity.y >= 0) this.boosted = false;
    if (!jumpHeld && !this.boosted && pb.velocity.y < CUT) pb.setVelocityY(CUT);
    if (onGround && !this.wasOnGround) {
      if (this.airVy > 300) this.sfxAt('land', this.player.x, { volume: Math.min(0.9, 0.4 + this.airVy / 2000) });
      burst(this, this.player.x, pb.bottom, 0xd8f0c0, 5, 90);
    }
    this.wasOnGround = onGround;
    this.airVy = pb.velocity.y;

    // animation
    if (!onGround) this.player.setTexture('pc-jump');
    else if (Math.abs(pb.velocity.x) > 20) {
      this.walkT += dt * Math.abs(pb.velocity.x) / RUN;
      this.player.setTexture(Math.floor(this.walkT * 9) % 2 ? 'pc-walk1' : 'pc-walk2');
    } else this.player.setTexture('pc-stand');

    const pr = this.playerRect();
    // springs
    for (const s of this.springs) {
      if (pb.velocity.y >= 0 && this.hit(pr, s.r)) {
        pb.setVelocityY(SPRING);
        this.boosted = true;
        this.coyote = 0;
        s.img.setTexture('sprung');
        this.time.delayedCall(220, () => s.img.active && s.img.setTexture('spring'));
        this.sfxAt('spring', s.img.x, { volume: 0.55 });
        this.tweens.add({ targets: s.img, scaleY: SC * 1.15, duration: 90, yoyo: true });
      }
    }
    // hazards
    for (const h of this.hazards) if (this.hit(pr, h)) { this.die(); return; }
    if (pb.top > 720) { this.die(); return; }
    // gems
    for (const g of [...this.gems]) {
      if (this.hit(pr, { x: g.x - 22, y: g.y - 20, w: 44, h: 40 })) this.collectGem(g);
    }
    // flag
    if (this.gemsGot >= this.gemsTotal && this.hit(pr, { x: this.flag.x - 20, y: this.flag.y - 32, w: 40, h: 64 })) { this.winLevel(); return; }
    // enemies
    for (const e of this.enemies) {
      if (!e.alive) continue;
      const eb = e.spr.body as Body;
      if (!this.hit(pr, { x: eb.x + 4, y: eb.y + 4, w: eb.width - 8, h: eb.height - 8 })) continue;
      const fromAbove = pb.velocity.y > 50 && pr.y + pr.h - eb.y < 22;
      if (fromAbove && e.kind !== 'w') {
        this.stomp(e);
        pb.setVelocityY(jumpHeld ? -720 : -480);
        this.boosted = true;
      } else { this.die(); return; }
    }
  }

  private stomp(e: Enemy): void {
    e.alive = false;
    this.stompChain++;
    const pts = 100 * this.stompChain;
    this.addScore(pts, e.spr.x, e.spr.y - 40);
    this.sfxAt('stomp', e.spr.x, { volume: 0.65, rate: 1 + Math.min(5, this.stompChain - 1) * 0.08 });
    shake(this, 0.006, 100);
    burst(this, e.spr.x, e.spr.y, [0xffffff, 0x5dff7a, 0xffd23f], 16, 260);
    const dead = { s: 'e-slime-dead', n: 'e-snail-shell', w: 'e-saw', f: 'e-fly-dead', b: 'e-bee-dead' }[e.kind];
    e.spr.setTexture(dead);
    const b = e.spr.body as Body;
    b.enable = false;
    this.tweens.add({ targets: e.spr, scaleY: SC * 0.5, alpha: 0, y: e.spr.y + 14, duration: 450, delay: 150, onComplete: () => e.spr.destroy() });
  }

  private updateEnemies(dt: number): void {
    for (const e of this.enemies) {
      if (!e.alive || !e.spr.body) continue;
      const b = e.spr.body as Body;
      e.t += dt;
      const sp = e.spr.getData('speed') as number;
      if (e.kind === 's' || e.kind === 'n' || e.kind === 'w') {
        // turn at walls and ledges
        const aheadX = e.dir > 0 ? b.right + 4 : b.left - 4;
        const col = Math.floor(aheadX / TS), row = Math.floor((b.bottom + 6 - OY) / TS);
        const ledge = b.blocked.down && !this.solidAt(col, row);
        if ((e.dir < 0 && b.blocked.left) || (e.dir > 0 && b.blocked.right) || ledge || aheadX < 4 || aheadX > 1276) e.dir = -e.dir;
        b.setVelocityX(sp * e.dir);
        e.spr.setFlipX(e.dir > 0);
        if (e.kind === 'w') e.spr.setAngle(e.spr.angle - e.dir * 400 * dt);
        else e.spr.setTexture(Math.floor(e.t * 4) % 2 ? `e-${e.kind === 's' ? 'slime' : 'snail'}-move` : `e-${e.kind === 's' ? 'slime' : 'snail'}`);
      } else if (e.kind === 'f') {
        if ((e.dir < 0 && (e.spr.x < Math.max(40, e.x0 - TS * 4))) || (e.dir > 0 && (e.spr.x > Math.min(1240, e.x0 + TS * 4)))) e.dir = -e.dir;
        b.setVelocity(sp * e.dir, Math.cos(e.t * 4) * 40);
        e.spr.setFlipX(e.dir > 0);
        e.spr.setTexture(Math.floor(e.t * 14) % 2 ? 'e-fly' : 'e-fly-2');
      } else if (e.kind === 'b') {
        b.setVelocity(0, Math.cos(e.t * 2.2) * TS * 1.6 * 2.2);
        e.spr.setTexture(Math.floor(e.t * 14) % 2 ? 'e-bee' : 'e-bee-move');
      }
    }
  }
}
