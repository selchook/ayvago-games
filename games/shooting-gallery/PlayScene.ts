import Phaser from 'phaser';
import { ArcadeScene, Controls, burst, shake, flash, popup, t, txt, rng } from '@core';

const W = 1280, H = 720;
const COUNTER = 640;          // top of the wooden counter (tap = reload)
const MAX_AMMO = 6;
const ROUND_TIME = 30;

type Kind = { key: string; pts: number; scale: number; gold?: boolean; duck: boolean };
const DUCKS: Kind[] = [
  { key: 'duck_brown', pts: 10, scale: 0.95, duck: true },
  { key: 'duck_white', pts: 15, scale: 0.9, duck: true },
  { key: 'duck_yellow', pts: 20, scale: 0.85, duck: true },
  { key: 'duck_target_brown', pts: 30, scale: 0.85, duck: true },
  { key: 'duck_target_white', pts: 30, scale: 0.85, duck: true },
];
const GOLD: Kind = { key: 'duck_target_yellow', pts: 25, scale: 0.85, gold: true, duck: true };
const TARGETS: Kind[] = [
  { key: 'target_red1', pts: 20, scale: 0.7, duck: false },
  { key: 'target_red2', pts: 25, scale: 0.62, duck: false },
  { key: 'target_red3', pts: 30, scale: 0.55, duck: false },
];
const BULLSEYE: Kind = { key: 'target_colored', pts: 60, scale: 0.42, duck: false };

interface Row { top: number; dir: number; speed: number; gap: number; dist: number; water: boolean; targets: boolean; depth: number; }
interface Item {
  c: Phaser.GameObjects.Container;
  img: Phaser.GameObjects.Image;
  kind: Kind;
  row: Row;
  hit: boolean;
  extra: number;    // extra speed factor (bullseye runs faster)
  hide: number;     // pop-down timer (later rounds)
  dip: number;      // current pop-down offset
  t: number;
}

export class PlayScene extends ArcadeScene {
  private controls!: Controls;
  private rows: Row[] = [];
  private items: Item[] = [];
  private cross!: Phaser.GameObjects.Image;
  private rifle!: Phaser.GameObjects.Image;
  private ammoIcons: Phaser.GameObjects.Image[] = [];
  private reloadText!: Phaser.GameObjects.Text;
  private waters: Phaser.GameObjects.TileSprite[] = [];
  private ammo = MAX_AMMO;
  private reloading = 0;
  private round = 1;
  private roundScore = 0;
  private quota = 200;
  private timeLeft = ROUND_TIME;
  private running = false;
  private streak = 0;
  private shots = 0;
  private hits = 0;
  private lastTick = 0;
  private keyR?: Phaser.Input.Keyboard.Key;

  createGame(): void {
    this.items = []; this.ammoIcons = []; this.waters = [];
    this.ammo = MAX_AMMO; this.reloading = 0; this.round = 1; this.roundScore = 0;
    this.quota = this.quotaFor(1); this.timeLeft = ROUND_TIME; this.running = false;
    this.streak = 0; this.shots = 0; this.hits = 0; this.lastTick = 0;

    // --- stall scenery (back to front)
    this.add.tileSprite(0, 0, W, H, 'bg_blue').setOrigin(0).setTileScale(1);
    for (let i = 0; i < 5; i++) {
      const cl = this.add.image(rng.int(0, W), rng.int(110, 190), rng.pick(['cloud1', 'cloud2'])).setAlpha(0.95);
      this.tweens.add({ targets: cl, x: cl.x + 120, duration: rng.int(9000, 15000), yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    }
    for (const x of [150, 420, 880, 1130]) this.add.image(x, 340, rng.pick(['tree_oak', 'tree_pine'])).setOrigin(0.5, 1).setScale(0.8).setDepth(1);
    this.rows = [
      { top: 300, dir: 1, speed: 110, gap: 250, dist: 9999, water: false, targets: true, depth: 10 },
      { top: 450, dir: -1, speed: 150, gap: 230, dist: 9999, water: false, targets: false, depth: 20 },
      { top: 590, dir: 1, speed: 190, gap: 220, dist: 9999, water: true, targets: false, depth: 30 },
    ];
    this.add.tileSprite(0, 300, W, 200, 'grass1').setOrigin(0).setDepth(15);
    this.add.tileSprite(0, 450, W, 216, 'grass2').setOrigin(0).setDepth(25);
    this.waters.push(this.add.tileSprite(0, 580, W, 224, 'water2').setOrigin(0).setDepth(33).setTileScale(1));
    this.waters.push(this.add.tileSprite(0, 600, W, 224, 'water1').setOrigin(0).setDepth(35));
    // counter, curtains
    this.add.tileSprite(0, COUNTER, W, H - COUNTER, 'bg_wood').setOrigin(0).setDepth(40);
    this.add.rectangle(0, COUNTER, W, 8, 0x5a3418).setOrigin(0).setDepth(41);
    this.add.image(0, 0, 'curtain').setOrigin(0.25, 0).setDepth(45).setScale(1, 1.55);
    this.add.image(W, 0, 'curtain').setOrigin(0.25, 0).setFlipX(true).setDepth(45).setScale(1, 1.55).setOrigin(0.75, 0);
    this.add.tileSprite(0, 0, W, 80, 'curtain_straight').setOrigin(0).setDepth(46);
    for (let x = 160; x < W; x += 320) this.add.image(x, 70, 'curtain_top').setOrigin(0.5, 0).setScale(0.8).setDepth(46);

    // pre-fill rows so the stall isn't empty at the start
    for (const r of this.rows) {
      for (let x = r.dir > 0 ? W - 100 : 100; x > -100 && x < W + 100; x -= r.dir * (r.gap + rng.int(-40, 60))) this.spawn(r, x);
      r.dist = 0;
    }

    // --- HUD on the counter
    for (let i = 0; i < MAX_AMMO; i++) {
      this.ammoIcons.push(this.add.image(46 + i * 30, 680, 'icon_bullet_gold_long').setDepth(50));
    }
    this.reloadText = txt(this, 330, 680, t('reload'), { title: true, size: 20, color: '#ffd23f' }).setDepth(50);
    this.rifle = this.add.image(W / 2, H + 130, 'rifle').setOrigin(0.5, 0.9).setDepth(55).setScale(0.9);
    this.cross = this.add.image(W / 2, 360, 'crosshair_red_large').setDepth(60).setScale(1.3);

    // --- input
    this.controls = new Controls(this);
    this.keyR = this.input.keyboard?.addKey(Phaser.Input.Keyboard.KeyCodes.R);
    this.input.on('pointermove', (p: Phaser.Input.Pointer) => {
      if (p.y < COUNTER) this.cross.setPosition(p.x, p.y);
    });
    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => {
      if (p.x > W - 130 && p.y < 130) return;          // pause button
      if (p.y >= COUNTER) { this.startReload(); return; }
      this.cross.setPosition(p.x, p.y);
      this.fire();
    });

    this.updateHud();
    this.countdown();
  }

  private quotaFor(r: number): number {
    return 180 + (r - 1) * 110;
  }

  private countdown(): void {
    this.running = false;
    const a = txt(this, W / 2, 300, t('roundN', { n: this.round }), { title: true, size: 52, color: '#ffd23f' }).setDepth(80).setScale(0.3);
    const b = txt(this, W / 2, 380, t('goal', { n: this.quota }), { size: 38 }).setDepth(80);
    this.tweens.add({ targets: a, scale: 1, duration: 400, ease: 'Back.easeOut' });
    this.time.delayedCall(1500, () => {
      a.setText(t('go'));
      this.sfx('go', { volume: 0.5 });
      this.tweens.add({ targets: [a, b], alpha: 0, delay: 400, duration: 300, onComplete: () => { a.destroy(); b.destroy(); } });
      this.running = true;
    });
  }

  private updateHud(): void {
    const s = Math.ceil(this.timeLeft);
    this.hud.setCenter(`${t('round')} ${this.round}  ${t('time')} ${s}`);
    this.hud.setRight(`${this.roundScore}/${this.quota}`);
    this.ammoIcons.forEach((ic, i) => ic.setTexture(i < this.ammo ? 'icon_bullet_gold_long' : 'icon_bullet_empty_long'));
    this.reloadText.setColor(this.ammo === 0 ? '#ec3013' : '#ffd23f');
  }

  private pickKind(row: Row): Kind {
    if (row.targets) {
      if (this.round >= 2 && rng.chance(0.12 + this.round * 0.02)) return BULLSEYE;
      return rng.pick(TARGETS);
    }
    if (rng.chance(0.07)) return GOLD;
    return rng.pick(DUCKS);
  }

  private spawn(row: Row, x: number): void {
    const kind = this.pickKind(row);
    const c = this.add.container(x, row.top).setDepth(row.depth);
    const stickY = row.water ? -20 : -70;
    const stick = this.add.image(0, stickY, this.round >= 3 && rng.chance(0.4) ? 'stick_metal' : 'stick_wood').setOrigin(0.5, 0);
    const img = this.add.image(0, stickY - (kind.duck ? 40 : 46) * kind.scale, kind.key).setScale(kind.scale);
    if (kind.duck && row.dir < 0) img.setFlipX(true);
    if (row.water) stick.setVisible(false);
    c.add([stick, img]);
    this.items.push({ c, img, kind, row, hit: false, extra: kind === BULLSEYE ? 1.6 : 1, hide: rng.int(20, 60) / 10, dip: 0, t: rng.int(0, 100) / 10 });
  }

  private startReload(): void {
    if (this.reloading > 0 || this.ammo === MAX_AMMO || !this.running) return;
    this.reloading = 0.9;
    this.sfx('shell', { volume: 0.5 });
    this.tweens.add({ targets: this.rifle, y: H + 220, duration: 200, yoyo: true, hold: 450 });
  }

  private fire(): void {
    if (!this.running || this.isOver) return;
    if (this.reloading > 0) return;
    if (this.ammo <= 0) {
      this.sfx('dry', { volume: 0.4 });
      popup(this, this.cross.x, this.cross.y - 40, t('empty'), '#ec3013', 24);
      this.startReload();
      return;
    }
    this.ammo--;
    this.shots++;
    this.sfx('shot', { volume: 0.55 });
    this.tweens.add({ targets: this.rifle, y: this.rifle.y + 30, duration: 60, yoyo: true });
    this.tweens.add({ targets: this.cross, scale: 1.7, duration: 60, yoyo: true });
    shake(this, 0.003, 60);
    const x = this.cross.x, y = this.cross.y;
    // front rows first (water > middle > back)
    const order = [...this.items].filter((i) => !i.hit).sort((a, b) => b.row.depth - a.row.depth);
    let target: Item | null = null;
    for (const it of order) {
      const wx = it.c.x + it.img.x, wy = it.c.y + it.img.y;
      const r = it.img.displayWidth * 0.46;
      // targets hidden behind the grass/water can't be hit
      if (wy > it.row.top + 10) continue;
      if (Phaser.Math.Distance.Between(x, y, wx, wy) < r && y < (it.row.water ? it.row.top + 30 : it.row.top)) { target = it; break; }
    }
    // blocked by grass/water in front?
    if (target) this.hitItem(target, x, y);
    else {
      this.streak = 0;
      this.sfx('miss', { volume: 0.4 });
      const hole = this.add.image(x, y, 'shot_grey_large').setDepth(y > COUNTER ? 42 : 36).setScale(0.6).setAlpha(0.8);
      this.tweens.add({ targets: hole, alpha: 0, delay: 600, duration: 500, onComplete: () => hole.destroy() });
      burst(this, x, y, [0x8b5a2b, 0xd2a36c], 6, 120);
    }
    if (this.ammo === 0) this.time.delayedCall(250, () => this.startReload());
    this.updateHud();
  }

  private hitItem(it: Item, x: number, y: number): void {
    it.hit = true;
    this.hits++;
    this.streak++;
    const mult = Math.min(4, 1 + Math.floor(this.streak / 4));
    const pts = it.kind.pts * mult;
    this.roundScore += pts;
    this.addScore(pts, x, y - 40);
    if (mult > 1) popup(this, x + 60, y - 10, `x${mult}`, '#ff4fa3', 22);
    this.sfx(it.kind.duck ? 'quack' : 'ding', { volume: it.kind.duck ? 0.5 : 0.3 });
    burst(this, x, y, it.kind.duck ? [0xffd23f, 0xffffff, 0x8b5a2b] : [0xec3013, 0xffffff], 18, 260);
    const hole = this.add.image(x - it.c.x, y - it.c.y, 'shot_brown_small');
    it.c.add(hole);
    if (it.kind.gold) {
      this.timeLeft += 3;
      this.sfx('bonus', { volume: 0.5 });
      flash(this, 0xffd23f, 120);
      popup(this, x, y - 90, '+3s', '#5dff7a', 30);
    }
    // flip to the back side, then drop behind the scenery
    this.tweens.add({
      targets: it.img, scaleX: 0, duration: 90, yoyo: true,
      onYoyo: () => { it.img.setTexture(it.kind.duck ? 'duck_back' : 'target_back'); hole.setVisible(false); },
    });
    this.tweens.add({ targets: it.c, y: it.c.y + 230, delay: 260, duration: 320, ease: 'Back.easeIn', onComplete: () => it.c.destroy() });
    if (this.roundScore >= this.quota && this.roundScore - pts < this.quota) {
      popup(this, W / 2, 250, t('roundClear'), '#5dff7a', 30);
      this.sfx('bonus', { volume: 0.4 });
    }
  }

  private endRound(): void {
    this.running = false;
    if (this.roundScore >= this.quota) {
      const acc = this.shots ? this.hits / this.shots : 0;
      const bonus = Math.round(acc * 100) * this.round;
      this.addScore(bonus);
      this.sfx('round', { volume: 0.5 });
      const a = txt(this, W / 2, 290, t('roundClear'), { title: true, size: 48, color: '#5dff7a' }).setDepth(80).setScale(0.3);
      const b = txt(this, W / 2, 370, t('accuracy', { n: bonus }), { size: 36 }).setDepth(80);
      this.tweens.add({ targets: a, scale: 1, duration: 400, ease: 'Back.easeOut' });
      burst(this, W / 2, 290, [0xffd23f, 0x5dff7a, 0xff4fa3], 50, 500);
      this.time.delayedCall(2000, () => {
        a.destroy(); b.destroy();
        if (this.isOver) return;
        this.round++;
        this.roundScore = 0; this.shots = 0; this.hits = 0;
        this.quota = this.quotaFor(this.round);
        this.timeLeft = ROUND_TIME;
        this.ammo = MAX_AMMO; this.reloading = 0;
        this.updateHud();
        this.countdown();
      });
    } else {
      shake(this, 0.01, 200);
      this.endGame({ title: t('timeUp'), delay: 900 });
    }
  }

  updateGame(_time: number, delta: number): void {
    const dt = delta / 1000;
    const c = this.controls;
    // keyboard aim
    if (c.axisX || c.axisY) {
      this.cross.x = Phaser.Math.Clamp(this.cross.x + c.axisX * 900 * dt, 20, W - 20);
      this.cross.y = Phaser.Math.Clamp(this.cross.y + c.axisY * 900 * dt, 90, COUNTER - 10);
    }
    if (c.justA()) this.fire();
    if (c.justB() || (this.keyR && Phaser.Input.Keyboard.JustDown(this.keyR))) this.startReload();
    this.rifle.x = Phaser.Math.Linear(this.rifle.x, this.cross.x * 0.6 + W * 0.2 + 160, Math.min(1, dt * 10));
    this.rifle.setAngle(Phaser.Math.RadToDeg(Math.atan2(this.cross.x - this.rifle.x, this.rifle.y - this.cross.y)) * 0.5);

    // reload
    if (this.reloading > 0) {
      this.reloading -= dt;
      const want = Math.min(MAX_AMMO, Math.floor((0.9 - this.reloading) / 0.9 * MAX_AMMO) + 1);
      if (want > this.ammo && this.reloading > 0) { this.ammo = want; this.updateHud(); }
      if (this.reloading <= 0) { this.reloading = 0; this.ammo = MAX_AMMO; this.sfx('reloaded', { volume: 0.5 }); this.updateHud(); }
    }

    // water waves
    this.waters[0].tilePositionX += 30 * dt;
    this.waters[1].tilePositionX -= 45 * dt;

    // rows
    const mult = 1 + (this.round - 1) * 0.14;
    for (const r of this.rows) {
      const step = r.speed * mult * dt;
      r.dist += step;
      if (r.dist >= r.gap) { r.dist = -rng.int(0, 80); this.spawn(r, r.dir > 0 ? -90 : W + 90); }
    }
    for (const it of this.items) {
      if (!it.c.active) continue;
      it.t += dt;
      if (!it.hit) it.c.x += it.row.dir * it.row.speed * mult * it.extra * dt;
      if (it.row.water) it.img.y = -38 * it.kind.scale + Math.sin(it.t * 4) * 6;
      if (it.kind.duck && !it.row.water && !it.hit) it.img.setAngle(Math.sin(it.t * 6) * 5);
      // later rounds: back-row targets pop down behind the grass
      if (this.round >= 3 && it.row.targets && !it.hit) {
        it.hide -= dt;
        if (it.hide <= 0) { it.hide = rng.int(25, 50) / 10; this.tweens.add({ targets: it.c, y: it.row.top + 150, duration: 220, yoyo: true, hold: 700 }); }
      }
      if ((it.row.dir > 0 && it.c.x > W + 120) || (it.row.dir < 0 && it.c.x < -120)) it.c.destroy();
    }
    this.items = this.items.filter((i) => i.c.active);

    // round clock
    if (this.running) {
      this.timeLeft -= dt;
      const s = Math.ceil(this.timeLeft);
      if (s !== this.lastTick) {
        this.lastTick = s;
        if (s <= 5 && s > 0) this.sfx('tick', { volume: 0.5 });
        this.updateHud();
      }
      if (this.timeLeft <= 0) { this.timeLeft = 0; this.updateHud(); this.endRound(); }
    }
  }
}
