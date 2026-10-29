import Phaser from 'phaser';
import { ArcadeScene, Controls, burst, shake, flash, popup, t, txt, rng, type EndOptions } from '@core';

type Body = Phaser.Types.Physics.Arcade.ImageWithDynamicBody;
type Static = Phaser.Types.Physics.Arcade.ImageWithStaticBody;

interface Kind { color: string; hp: number; speed: number; rate: number; bullet: number; pts: number; scale: number }
const KINDS: Record<string, Kind> = {
  green: { color: 'green', hp: 1, speed: 85, rate: 2.8, bullet: 360, pts: 100, scale: 0.85 },
  beige: { color: 'beige', hp: 1, speed: 150, rate: 1.9, bullet: 400, pts: 150, scale: 0.8 },
  red: { color: 'red', hp: 2, speed: 110, rate: 1.4, bullet: 430, pts: 200, scale: 0.9 },
  black: { color: 'black', hp: 4, speed: 70, rate: 1.7, bullet: 460, pts: 350, scale: 1.05 },
};

interface Tank {
  b: Body; barrel: Phaser.GameObjects.Image; kind: Kind; hp: number;
  heading: number; aim: number; fireCd: number; thinkCd: number; gx: number; gy: number; trackCd: number;
}

const CELL = 80, COLS = 16, ROWS = 9;

export class PlayScene extends ArcadeScene {
  private controls!: Controls;
  private player!: Tank;
  private enemies: Tank[] = [];
  private walls!: Phaser.Physics.Arcade.StaticGroup;
  private pBullets!: Phaser.Physics.Arcade.Group;
  private eBullets!: Phaser.Physics.Arcade.Group;
  private items!: Phaser.Physics.Arcade.Group;
  private enemyGroup!: Phaser.Physics.Arcade.Group;
  private shieldFx!: Phaser.GameObjects.Image;
  private lives = 3;
  private wave = 0;
  private toSpawn = 0;
  private spawnCd = 0;
  private waveDamage = false;
  private betweenWaves = 0;
  private rapid = 0;
  private triple = 0;
  private shield = 0;
  private invuln = 0;
  private pointerAim: { x: number; y: number } | null = null;
  private banners: Phaser.GameObjects.Text[] = [];

  createGame(): void {
    const { width, height } = this.scale;
    this.enemies = []; this.banners = [];
    this.lives = 3; this.wave = 0; this.toSpawn = 0; this.spawnCd = 0; this.betweenWaves = 1.2;
    this.rapid = 0; this.triple = 0; this.shield = 0; this.invuln = 0; this.pointerAim = null; this.waveDamage = false;
    this.physics.world.setBounds(0, 0, width, height);

    this.add.tileSprite(0, 0, width, height, 'ground').setOrigin(0);
    for (let i = 0; i < 4; i++) this.add.image(rng.int(100, width - 100), rng.int(100, height - 100), 'oil').setAlpha(0.35).setScale(rng.pick([0.8, 1.2]));

    this.walls = this.physics.add.staticGroup();
    this.pBullets = this.physics.add.group();
    this.eBullets = this.physics.add.group();
    this.items = this.physics.add.group();
    this.enemyGroup = this.physics.add.group();
    this.buildArena();

    this.player = this.makeTank(width / 2, height / 2, { color: 'blue', hp: 99, speed: 230, rate: 0.4, bullet: 720, pts: 0, scale: 0.9 });
    this.player.heading = -Math.PI / 2; this.player.aim = -Math.PI / 2;
    this.shieldFx = this.add.image(0, 0, 'shield').setDepth(12).setVisible(false).setScale(0.75).setAlpha(0.7);

    this.controls = new Controls(this, { joystick: true, buttons: ['A'] });
    // Tap / click on the battlefield = aim there and fire (touch: right half only; left half is the joystick).
    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => {
      if (this.isOver) return;
      if (this.controls.touchUi && (p.x < width * 0.5 || Phaser.Math.Distance.Between(p.x, p.y, width - 110, height - 130) < 90)) return;
      if (p.x > width - 130 && p.y < 130) return;   // pause button
      this.pointerAim = { x: p.x, y: p.y };
      this.player.aim = Phaser.Math.Angle.Between(this.player.b.x, this.player.b.y, p.x, p.y);
      this.tryFire();
    });

    this.physics.add.collider(this.player.b, this.walls);
    this.physics.add.overlap(this.pBullets, this.walls, (bl, w) => this.bulletWall(bl as Body, w as Static, true));
    this.physics.add.overlap(this.eBullets, this.walls, (bl, w) => this.bulletWall(bl as Body, w as Static, false));
    this.physics.add.overlap(this.player.b, this.eBullets, (_p, bl) => { this.spark(bl as Body); this.hurt(); });
    this.physics.add.overlap(this.player.b, this.items, (_p, it) => this.collect(it as Body));
    this.physics.add.collider(this.enemyGroup, this.walls);
    this.physics.add.collider(this.enemyGroup, this.enemyGroup);
    this.physics.add.collider(this.enemyGroup, this.player.b);
    this.physics.add.overlap(this.enemyGroup, this.pBullets, (e, bl) => this.hitEnemy((e as Body).getData('tank') as Tank, bl as Body));
    this.updateHud();
  }

  // ---------- arena ----------
  private occupied(c: number, r: number): boolean {
    const x = c * CELL + CELL / 2, y = r * CELL + CELL / 2;
    for (const w of this.walls.getChildren() as Static[]) if (Math.abs(w.x - x) < CELL * 0.6 && Math.abs(w.y - y) < CELL * 0.6) return true;
    return false;
  }

  private reserved(c: number, r: number): boolean {
    if (r === 0 || r === ROWS - 1 || c === 0 || c === COLS - 1) return true;          // border lanes (spawns + HUD)
    if (Math.abs(c - 7.5) < 2 && Math.abs(r - 4) < 2) return true;                     // player start
    if (r === 4 || c === 7 || c === 8) return rng.chance(0.7);                          // keep cross lanes mostly open
    return false;
  }

  private buildArena(): void {
    // symmetric sandbag walls (indestructible)
    const layouts = [
      [[3, 2], [4, 2], [11, 2], [12, 2], [3, 6], [4, 6], [11, 6], [12, 6]],
      [[5, 2], [5, 3], [10, 2], [10, 3], [5, 5], [5, 6], [10, 5], [10, 6]],
      [[2, 3], [2, 5], [13, 3], [13, 5], [6, 1], [9, 1], [6, 7], [9, 7]],
    ];
    for (const [c, r] of rng.pick(layouts)) this.addWall(c, r, 'sandbag');
    for (const [c, r] of [[1, 1], [14, 7], [1, 7]]) if (rng.chance(0.6)) this.addWall(c, r, 'tree');
    this.refillCrates();
  }

  private addWall(c: number, r: number, kind: 'sandbag' | 'tree' | 'crate' | 'barrel'): Static {
    const x = c * CELL + CELL / 2, y = r * CELL + CELL / 2;
    const key = kind === 'barrel' ? 'barrel-red' : kind;
    const w = this.walls.create(x, y, key) as Static;
    w.setData('kind', kind).setData('hp', kind === 'crate' ? 2 : 1).setDepth(3);
    if (kind === 'sandbag') w.setScale(1.15).setRotation(rng.chance(0.5) ? 0 : Math.PI / 2);
    if (kind === 'crate') w.setScale(0.95);
    if (kind === 'tree') w.setScale(0.95).setDepth(15);
    w.refreshBody();
    if (kind === 'sandbag' && w.rotation !== 0) w.body.setSize(w.displayHeight, w.displayWidth);
    if (kind === 'tree') w.body.setCircle(30, w.width / 2 - 30, w.height / 2 - 30);
    if (kind === 'crate' || kind === 'barrel') { w.setScale(0); this.tweens.add({ targets: w, scale: kind === 'crate' ? 0.95 : 1, duration: 300, ease: 'Back.easeOut' }); }
    return w;
  }

  private refillCrates(): void {
    const target = 10 + Math.min(8, this.wave);
    let have = (this.walls.getChildren() as Static[]).filter((w) => ['crate', 'barrel'].includes(w.getData('kind'))).length;
    for (let tries = 0; tries < 200 && have < target; tries++) {
      const c = rng.int(1, COLS - 2), r = rng.int(1, ROWS - 2);
      if (this.reserved(c, r) || this.occupied(c, r)) continue;
      const x = c * CELL + CELL / 2, y = r * CELL + CELL / 2;
      if (this.player && Phaser.Math.Distance.Between(x, y, this.player.b.x, this.player.b.y) < 110) continue;
      if (this.enemies.some((e) => Phaser.Math.Distance.Between(x, y, e.b.x, e.b.y) < 110)) continue;
      this.addWall(c, r, rng.chance(0.25) ? 'barrel' : 'crate');
      have++;
    }
  }

  // ---------- tanks ----------
  private makeTank(x: number, y: number, kind: Kind, group?: Phaser.Physics.Arcade.Group): Tank {
    const b = (group ? group.create(x, y, `tank-${kind.color}`) : this.physics.add.image(x, y, `tank-${kind.color}`)) as Body;
    b.setDepth(10).setScale(kind.scale).setCollideWorldBounds(true);
    b.body.setCircle(30, b.width / 2 - 30, b.height / 2 - 30);
    const barrel = this.add.image(x, y, `barrel-${kind.color}`).setOrigin(0.5, 0.12).setDepth(11).setScale(kind.scale);
    const tk: Tank = { b, barrel, kind, hp: kind.hp, heading: 0, aim: 0, fireCd: rng.int(8, 20) / 10, thinkCd: 0, gx: x, gy: y, trackCd: 0 };
    b.setData('tank', tk);
    return tk;
  }

  private spawnEnemy(): void {
    const { width, height } = this.scale;
    const pool = ['green'];
    if (this.wave >= 2) pool.push('beige');
    if (this.wave >= 3) pool.push('red', 'green');
    if (this.wave >= 5) pool.push('black');
    if (this.wave >= 8) pool.push('red', 'black');
    const spots = [[CELL / 2, height / 2], [width - CELL / 2, height / 2], [width / 2, height - CELL / 2], [CELL / 2, height - CELL / 2], [width - CELL / 2, height - CELL / 2], [width / 2 - 200, CELL / 2]];
    const far = spots.filter(([x, y]) => Phaser.Math.Distance.Between(x, y, this.player.b.x, this.player.b.y) > 300 &&
      !this.enemies.some((e) => Phaser.Math.Distance.Between(x, y, e.b.x, e.b.y) < 80));
    if (!far.length) { this.spawnCd = 0.5; return; }
    const [x, y] = rng.pick(far);
    const e = this.makeTank(x, y, KINDS[rng.pick(pool)], this.enemyGroup);
    e.heading = e.aim = Phaser.Math.Angle.Between(x, y, width / 2, height / 2);
    e.fireCd = 2 + Math.random() * 1.5;
    const sc = e.kind.scale;
    e.b.setScale(0); e.barrel.setScale(0);
    this.tweens.add({ targets: [e.b, e.barrel], scale: sc, duration: 400, ease: 'Back.easeOut' });
    this.puff(x, y, 'smokeg', 1.4);
    this.enemies.push(e);
  }

  private puff(x: number, y: number, key: string, scale: number): void {
    const s = this.add.image(x, y, key).setDepth(13).setScale(scale * 0.4).setAlpha(0.9).setRotation(rng.int(0, 6));
    this.tweens.add({ targets: s, scale, alpha: 0, duration: 600, ease: 'Cubic.easeOut', onComplete: () => s.destroy() });
  }

  private explode(x: number, y: number, big: boolean): void {
    for (let i = 0; i < (big ? 4 : 2); i++) this.puff(x + rng.int(-25, 25), y + rng.int(-25, 25), `smoke${rng.int(0, 5)}`, big ? 1.4 : 0.8);
    burst(this, x, y, [0xffd23f, 0xec3013, 0x333333], big ? 30 : 14, big ? 380 : 240);
    if (big) this.sfxAt(rng.pick(['boom1', 'boom2', 'boom3']), x, { volume: 0.6 });
    else this.sfxAt('pop', x, { volume: 0.4 });
    shake(this, big ? 0.012 : 0.005, big ? 220 : 120);
  }

  private fireFrom(tk: Tank, group: Phaser.Physics.Arcade.Group, key: string, speed: number, angle: number): void {
    const tip = 46 * tk.kind.scale;
    const x = tk.b.x + Math.cos(angle) * tip, y = tk.b.y + Math.sin(angle) * tip;
    const bl = group.create(x, y, key) as Body;
    bl.setRotation(angle + Math.PI / 2).setDepth(9);
    bl.body.setSize(10, 10);
    bl.setVelocity(Math.cos(angle) * speed, Math.sin(angle) * speed);
    this.puff(x, y, 'smokeg', 0.35);
    // barrel recoil
    tk.barrel.setData('recoil', 6);
  }

  private tryFire(): void {
    if (this.player.fireCd > 0) return;
    const a = this.player.aim;
    const angles = this.triple > 0 ? [a - 0.22, a, a + 0.22] : [a];
    for (const an of angles) this.fireFrom(this.player, this.pBullets, 'bullet-p', this.player.kind.bullet, an);
    this.player.fireCd = this.rapid > 0 ? 0.16 : this.player.kind.rate;
    this.sfxAt('fire', this.player.b.x, { volume: 0.4 });
    shake(this, 0.003, 60);
  }

  private bulletWall(bl: Body, w: Static, mine: boolean): void {
    if (!bl.active || !w.active) return;
    this.spark(bl);
    const kind = w.getData('kind') as string;
    if (kind === 'sandbag' || kind === 'tree') { this.sfxAt('thud', bl.x, { volume: 0.3 }); return; }
    const hp = (w.getData('hp') as number) - 1;
    w.setData('hp', hp);
    if (hp > 0) {
      this.sfxAt('wood', w.x, { volume: 0.35 });
      w.setTintFill(0xffffff); this.time.delayedCall(60, () => w.active && w.clearTint());
      return;
    }
    this.breakWall(w, mine);
  }

  private breakWall(w: Static, scored: boolean): void {
    if (!w.active) return;
    const kind = w.getData('kind') as string;
    const { x, y } = w;
    w.destroy();
    if (kind === 'barrel') {
      this.explode(x, y, true);
      if (scored) this.addScore(40, x, y);
      // chain reaction: everything within blast radius
      this.time.delayedCall(80, () => {
        for (const o of [...this.walls.getChildren()] as Static[]) {
          if (['crate', 'barrel'].includes(o.getData('kind')) && Phaser.Math.Distance.Between(x, y, o.x, o.y) < 130) this.breakWall(o, scored);
        }
        for (const e of [...this.enemies]) if (Phaser.Math.Distance.Between(x, y, e.b.x, e.b.y) < 130) this.damageEnemy(e, 2);
        if (Phaser.Math.Distance.Between(x, y, this.player.b.x, this.player.b.y) < 110) this.hurt();
      });
    } else {
      this.sfxAt('crate', x, { volume: 0.5 });
      burst(this, x, y, [0x9c6b3c, 0xd9a066, 0x5a3a1e], 18, 260);
      if (scored) this.addScore(25, x, y);
      if (rng.chance(0.28)) this.dropItem(x, y);
    }
  }

  private spark(bl: Body): void {
    burst(this, bl.x, bl.y, [0xffffff, 0xffd23f], 6, 160);
    bl.destroy();
  }

  private hitEnemy(e: Tank, bl: Body): void {
    if (!e || !bl.active || !e.b.active) return;
    this.spark(bl);
    this.damageEnemy(e, 1);
  }

  private damageEnemy(e: Tank, dmg: number): void {
    if (!e.b.active) return;
    e.hp -= dmg;
    e.b.setTintFill(0xffffff); e.barrel.setTintFill(0xffffff);
    this.time.delayedCall(70, () => { if (e.b.active) { e.b.clearTint(); e.barrel.clearTint(); } });
    if (e.hp > 0) { this.sfxAt(rng.pick(['clang1', 'clang2']), e.b.x, { volume: 0.45 }); return; }
    this.explode(e.b.x, e.b.y, true);
    this.addScore(e.kind.pts, e.b.x, e.b.y - 30);
    if (rng.chance(0.14)) this.dropItem(e.b.x, e.b.y);
    const wreck = this.add.image(e.b.x, e.b.y, `tank-${e.kind.color}`).setTint(0x222222).setAlpha(0.6).setRotation(e.b.rotation).setScale(e.kind.scale).setDepth(2);
    this.tweens.add({ targets: wreck, alpha: 0, delay: 2500, duration: 800, onComplete: () => wreck.destroy() });
    e.b.destroy(); e.barrel.destroy();
    this.enemies = this.enemies.filter((o) => o !== e);
  }

  private dropItem(x: number, y: number): void {
    const key = rng.pick(['pu-rapid', 'pu-triple', 'pu-shield', 'pu-repair']);
    const it = this.items.create(x, y, key) as Body;
    it.setDepth(8).setScale(0);
    this.tweens.add({ targets: it, scale: key === 'pu-repair' ? 2.2 : 1.5, duration: 300, ease: 'Back.easeOut' });
    this.tweens.add({ targets: it, angle: 15, duration: 400, yoyo: true, repeat: -1 });
    this.time.delayedCall(7000, () => it.active && this.tweens.add({ targets: it, alpha: 0.2, duration: 150, yoyo: true, repeat: 6, onComplete: () => it.destroy() }));
  }

  private collect(it: Body): void {
    if (!it.active) return;
    const key = it.texture.key;
    let label = '';
    if (key === 'pu-rapid') { this.rapid = 8; label = t('rapid'); }
    if (key === 'pu-triple') { this.triple = 8; label = t('triple'); }
    if (key === 'pu-shield') { this.shield = 8; label = t('shieldOn'); }
    if (key === 'pu-repair') { this.lives = Math.min(5, this.lives + 1); label = t('repair'); this.updateHud(); }
    popup(this, it.x, it.y - 30, label, '#5dff7a', 22);
    this.addScore(30);
    this.sfxAt(key === 'pu-repair' ? 'repair' : 'power', it.x, { volume: 0.6 });
    flash(this, 0x3ee6ff, 90);
    it.destroy();
  }

  private hurt(): void {
    if (this.invuln > 0 || this.isOver) return;
    if (this.shield > 0) { this.shield = 0; this.invuln = 0.8; this.sfxAt('shieldhit', this.player.b.x, { volume: 0.6 }); return; }
    this.lives--;
    this.waveDamage = true;
    this.invuln = 1.6;
    if (this.lives > 0) this.sfxAt('hurt', this.player.b.x, { volume: 0.7 });
    if (this.lives === 1) this.time.delayedCall(250, () => this.sfx('lowhp', { volume: 0.5 }));
    shake(this, 0.02, 260);
    flash(this, 0xec3013, 160);
    this.updateHud();
    if (this.lives <= 0) {
      this.explode(this.player.b.x, this.player.b.y, true);
      this.sfxAt('die', this.player.b.x, { volume: 0.8 });
      this.player.b.setVisible(false); this.player.barrel.setVisible(false);
      this.endGame({ delay: 900 });
    }
  }

  endGame(o: EndOptions = {}): void {
    for (const b of this.banners) if (b.active) b.destroy();
    super.endGame(o);
  }

  private updateHud(): void {
    this.hud.setRight(`${t('lives')} ${Math.max(0, this.lives)}`);
    this.hud.setCenter(this.wave ? `${t('wave')} ${this.wave}` : '');
  }

  private banner(s: string, color = '#ffd23f'): void {
    const { width, height } = this.scale;
    const b = txt(this, width / 2, height * 0.42, s, { title: true, size: 44, color }).setDepth(9000).setScale(0.3).setAlpha(0);
    this.banners.push(b);
    this.tweens.add({ targets: b, scale: 1, alpha: 1, duration: 350, ease: 'Back.easeOut', hold: 800, yoyo: true, onComplete: () => b.destroy() });
  }

  private startWave(): void {
    this.wave++;
    this.waveDamage = false;
    this.toSpawn = 2 + this.wave + Math.floor(this.wave / 3);
    this.spawnCd = 0.6;
    this.refillCrates();
    this.updateHud();
    this.banner(`${t('wave')} ${this.wave}`);
    this.sfx('wave', { volume: 0.4 });
  }

  // ---------- update ----------
  private moveTank(tk: Tank, vx: number, vy: number, dt: number): void {
    const moving = vx !== 0 || vy !== 0;
    if (moving) {
      const want = Math.atan2(vy, vx);
      tk.heading = Phaser.Math.Angle.RotateTo(tk.heading, want, 7 * dt);
      tk.trackCd -= dt;
      if (tk.trackCd <= 0) {
        tk.trackCd = 0.16;
        const tr = this.add.image(tk.b.x, tk.b.y, 'tracks').setRotation(tk.heading - Math.PI / 2).setScale(0.55 * tk.kind.scale).setAlpha(0.25).setDepth(1);
        this.tweens.add({ targets: tr, alpha: 0, duration: 2200, onComplete: () => tr.destroy() });
      }
    }
    tk.b.setVelocity(vx, vy);
    tk.b.setRotation(tk.heading - Math.PI / 2);
    const rec = (tk.barrel.getData('recoil') as number) || 0;
    tk.barrel.setData('recoil', Math.max(0, rec - 40 * dt));
    tk.barrel.setPosition(tk.b.x - Math.cos(tk.aim) * rec, tk.b.y - Math.sin(tk.aim) * rec).setRotation(tk.aim - Math.PI / 2);
  }

  private nearestEnemy(): Tank | null {
    let best: Tank | null = null, bd = Infinity;
    for (const e of this.enemies) {
      const d = Phaser.Math.Distance.Between(e.b.x, e.b.y, this.player.b.x, this.player.b.y);
      if (d < bd) { bd = d; best = e; }
    }
    return best;
  }

  updateGame(_time: number, delta: number): void {
    const dt = delta / 1000;
    const { width, height } = this.scale;
    const c = this.controls, p = this.player;
    this.rapid = Math.max(0, this.rapid - dt);
    this.triple = Math.max(0, this.triple - dt);
    this.shield = Math.max(0, this.shield - dt);
    this.invuln = Math.max(0, this.invuln - dt);
    p.fireCd -= dt;

    // player
    let mx = c.axisX, my = c.axisY;
    const len = Math.hypot(mx, my);
    if (len > 1) { mx /= len; my /= len; }
    this.moveTank(p, mx * p.kind.speed, my * p.kind.speed, dt);
    const target = this.nearestEnemy();
    if (this.pointerAim && this.input.activePointer.isDown && !c.touchUi) {
      this.pointerAim = { x: this.input.activePointer.x, y: this.input.activePointer.y };
      p.aim = Phaser.Math.Angle.Between(p.b.x, p.b.y, this.pointerAim.x, this.pointerAim.y);
      this.tryFire();
    } else if (target) {
      const want = Phaser.Math.Angle.Between(p.b.x, p.b.y, target.b.x, target.b.y);
      p.aim = Phaser.Math.Angle.RotateTo(p.aim, want, 6 * dt);
    } else if (len > 0.2) p.aim = Phaser.Math.Angle.RotateTo(p.aim, p.heading, 4 * dt);
    if (c.a) this.tryFire();
    const blink = this.invuln > 0 && this.shield <= 0 && Math.floor(this.elapsed * 12) % 2 === 0;
    p.b.setAlpha(blink ? 0.35 : 1); p.barrel.setAlpha(blink ? 0.35 : 1);
    p.barrel.setTint(this.rapid > 0 ? 0xffd23f : 0xffffff);
    this.shieldFx.setVisible(this.shield > 0).setPosition(p.b.x, p.b.y).setRotation(this.elapsed * 2);

    // enemies
    for (const e of this.enemies) {
      e.thinkCd -= dt; e.fireCd -= dt;
      const blocked = !e.b.body.blocked.none || !e.b.body.touching.none;
      const dGoal = Phaser.Math.Distance.Between(e.b.x, e.b.y, e.gx, e.gy);
      if (e.thinkCd <= 0 || dGoal < 30 || (blocked && e.thinkCd < 1.2)) {
        e.thinkCd = rng.int(15, 30) / 10;
        if (rng.chance(0.55 + Math.min(0.3, this.wave * 0.03))) {
          const a = rng.int(0, 628) / 100, r = rng.int(140, 280);
          e.gx = p.b.x + Math.cos(a) * r; e.gy = p.b.y + Math.sin(a) * r;
        } else { e.gx = rng.int(80, width - 80); e.gy = rng.int(80, height - 80); }
        e.gx = Phaser.Math.Clamp(e.gx, 60, width - 60); e.gy = Phaser.Math.Clamp(e.gy, 60, height - 60);
      }
      const ga = Phaser.Math.Angle.Between(e.b.x, e.b.y, e.gx, e.gy);
      const sp = e.kind.speed * (1 + Math.min(0.5, this.wave * 0.04));
      this.moveTank(e, dGoal > 20 ? Math.cos(ga) * sp : 0, dGoal > 20 ? Math.sin(ga) * sp : 0, dt);
      const want = Phaser.Math.Angle.Between(e.b.x, e.b.y, p.b.x, p.b.y);
      e.aim = Phaser.Math.Angle.RotateTo(e.aim, want, (1.5 + Math.min(1.5, this.wave * 0.12)) * dt);
      const dist = Phaser.Math.Distance.Between(e.b.x, e.b.y, p.b.x, p.b.y);
      if (e.fireCd <= 0 && dist < 650 && Math.abs(Phaser.Math.Angle.Wrap(e.aim - want)) < 0.25 && p.b.visible) {
        e.fireCd = e.kind.rate * (0.8 + Math.random() * 0.5) / (1 + Math.min(0.6, this.wave * 0.05));
        this.fireFrom(e, this.eBullets, 'bullet-e', e.kind.bullet, e.aim + (Math.random() - 0.5) * 0.12);
        this.sfxAt('efire', e.b.x, { volume: 0.25 });
      }
    }

    for (const g of [this.pBullets, this.eBullets]) {
      for (const o of [...g.getChildren()] as Body[]) if (o.x < -20 || o.x > width + 20 || o.y < -20 || o.y > height + 20) o.destroy();
    }

    // wave flow
    if (this.toSpawn > 0) {
      this.spawnCd -= dt;
      if (this.spawnCd <= 0 && this.enemies.length < 4 + Math.floor(this.wave / 2)) {
        this.spawnCd = Math.max(0.6, 1.6 - this.wave * 0.08);
        this.toSpawn--;
        this.spawnEnemy();
      }
    } else if (this.enemies.length === 0) {
      if (this.betweenWaves <= 0 && this.wave > 0) {
        this.betweenWaves = 2.2;
        const bonus = 200 * this.wave + (this.waveDamage ? 0 : 500);
        this.addScore(bonus, p.b.x, p.b.y - 60);
        this.banner(this.waveDamage ? t('waveClear') : t('perfect'), '#5dff7a');
        this.sfx(this.waveDamage ? 'clear' : 'perfect', { volume: 0.65, exact: true });
      } else if (this.betweenWaves > 0) {
        this.betweenWaves -= dt;
        if (this.betweenWaves <= 0) this.startWave();
      } else this.startWave();
    }
  }
}
