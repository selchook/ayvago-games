import Phaser from 'phaser';
import { ArcadeScene, Controls, Button, burst, shake, flash, popup, t, txt, rng, type EndOptions } from '@core';

type Body = Phaser.Types.Physics.Arcade.ImageWithDynamicBody;

interface ZType { hp: number; speed: number; scale: number; tint: number; pts: number }
const Z: Record<string, ZType> = {
  walker: { hp: 2, speed: 62, scale: 1.25, tint: 0xffffff, pts: 10 },
  runner: { hp: 1, speed: 125, scale: 1.1, tint: 0xff9a8a, pts: 15 },
  brute: { hp: 9, speed: 42, scale: 1.8, tint: 0x9fc29a, pts: 50 },
  boss: { hp: 60, speed: 48, scale: 3, tint: 0xc77dff, pts: 500 },
};

type UpKey = 'upRate' | 'upDmg' | 'upMulti' | 'upPierce' | 'upSpeed' | 'upHeal';

export class PlayScene extends ArcadeScene {
  private controls!: Controls;
  private hero!: Body;
  private zombies!: Phaser.Physics.Arcade.Group;
  private bullets!: Phaser.Physics.Arcade.Group;
  private items!: Phaser.Physics.Arcade.Group;
  private props!: Phaser.Physics.Arcade.StaticGroup;
  private aimTxt!: Phaser.GameObjects.Text;
  private hp = 5;
  private maxHp = 5;
  private wave = 0;
  private toSpawn = 0;
  private spawnCd = 0;
  private fireCd = 0;
  private invuln = 0;
  private aim = 0;
  private autoAim = true;
  private manual: { id: number; ox: number; oy: number; angle: number; stick: boolean } | null = null;
  private choosing = false;
  private nextWaveIn = 0;
  // weapon stats
  private rate = 0.32;
  private dmg = 1;
  private multi = 1;
  private pierce = 0;
  private speed = 240;

  createGame(): void {
    const { width, height } = this.scale;
    this.hp = this.maxHp = 5; this.wave = 0; this.toSpawn = 0; this.spawnCd = 0; this.fireCd = 0; this.invuln = 0;
    this.aim = 0; this.autoAim = true; this.manual = null; this.choosing = false; this.nextWaveIn = 1;
    this.rate = 0.32; this.dmg = 1; this.multi = 1; this.pierce = 0; this.speed = 240;

    this.add.tileSprite(0, 0, width, height, 'grass').setOrigin(0);
    for (let i = 0; i < 5; i++) this.add.image(rng.int(80, width - 80), rng.int(120, height - 80), 'dirt').setAlpha(0.35).setScale(rng.pick([1, 1.5])).setAngle(rng.int(0, 3) * 90);
    this.props = this.physics.add.staticGroup();
    const spots = [[260, 200], [1020, 200], [260, 520], [1020, 520], [640, 150], [640, 590], [430, 360], [850, 360]];
    for (const [x, y] of rng.shuffle(spots).slice(0, 5)) {
      const p = this.props.create(x + rng.int(-30, 30), y + rng.int(-20, 20), rng.pick(['crate', 'rock'])) as Phaser.Types.Physics.Arcade.ImageWithStaticBody;
      p.setScale(p.texture.key === 'crate' ? 1 : 1.3).refreshBody();
      p.body.setSize(p.displayWidth * 0.85, p.displayHeight * 0.85);
    }
    for (let i = 0; i < 6; i++) this.add.image(rng.int(40, width - 200), rng.int(140, height - 40), rng.pick(['bush', 'bush2'])).setDepth(20).setAlpha(0.92).setScale(rng.pick([0.9, 1.2]));

    if (!this.textures.exists('zs-bullet')) {
      const g = this.make.graphics({ x: 0, y: 0 }, false);
      g.fillStyle(0xfff3a0).fillRect(0, 0, 14, 5).fillStyle(0xffffff).fillRect(8, 1, 6, 3);
      g.generateTexture('zs-bullet', 14, 5);
      g.clear().fillStyle(0xffffff).fillRoundedRect(0, 0, 40, 40, 8).fillStyle(0xec3013).fillRect(15, 6, 10, 28).fillRect(6, 15, 28, 10);
      g.generateTexture('zs-medkit', 40, 40);
      g.destroy();
    }

    this.bullets = this.physics.add.group();
    this.zombies = this.physics.add.group();
    this.items = this.physics.add.group();
    this.hero = this.physics.add.image(width / 2, height / 2, 'hero-gun').setDepth(10).setScale(1.3) as Body;
    this.hero.setCollideWorldBounds(true).body.setCircle(16, 2, 5);

    this.controls = new Controls(this, { joystick: true, buttons: ['B'] });
    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => {
      if (this.isOver || this.choosing) return;
      if (p.x > width - 130 && p.y < 130) return;
      if (this.controls.touchUi) {
        if (p.x < width * 0.5 || Phaser.Math.Distance.Between(p.x, p.y, width - 110, height - 130) < 85) return;
      }
      this.manual = { id: p.id, ox: p.x, oy: p.y, angle: Phaser.Math.Angle.Between(this.hero.x, this.hero.y, p.x, p.y), stick: this.controls.touchUi };
    });
    this.input.on('pointermove', (p: Phaser.Input.Pointer) => {
      const m = this.manual;
      if (!m || p.id !== m.id) return;
      if (m.stick) { if (Phaser.Math.Distance.Between(m.ox, m.oy, p.x, p.y) > 20) m.angle = Phaser.Math.Angle.Between(m.ox, m.oy, p.x, p.y); }
      else m.angle = Phaser.Math.Angle.Between(this.hero.x, this.hero.y, p.x, p.y);
    });
    const up = (p: Phaser.Input.Pointer) => { if (this.manual && p.id === this.manual.id) this.manual = null; };
    this.input.on('pointerup', up);
    this.input.on('pointerupoutside', up);

    this.physics.add.collider(this.hero, this.props);
    this.physics.add.collider(this.zombies, this.props);
    this.physics.add.collider(this.zombies, this.zombies);
    this.physics.add.overlap(this.bullets, this.zombies, (b, z) => this.hitZombie(b as Body, z as Body));
    this.physics.add.overlap(this.bullets, this.props, (b) => { burst(this, (b as Body).x, (b as Body).y, 0xd9a066, 4, 120); b.destroy(); });
    this.physics.add.overlap(this.hero, this.zombies, (_h, z) => this.hurt(z as Body));
    this.physics.add.overlap(this.hero, this.items, (_h, it) => this.pickup(it as Body));

    this.aimTxt = txt(this, width / 2, height - 28, '', { size: 22, color: '#5dff7a' }).setDepth(9000);
    this.updateHud();
  }

  private updateHud(): void {
    this.hud.setRight(`${t('lives')} ${Math.max(0, this.hp)}/${this.maxHp}`);
    this.hud.setCenter(this.wave ? `${t('wave')} ${this.wave}` : '');
    this.aimTxt.setText(`${t('autoAim')}: ${this.autoAim ? t('on') : t('off')}  [B]`).setColor(this.autoAim ? '#5dff7a' : '#ffd23f');
  }

  private banner(s: string, color = '#ffd23f'): void {
    const { width, height } = this.scale;
    const b = txt(this, width / 2, height * 0.3, s, { title: true, size: 40, color }).setDepth(9000).setScale(0.3).setAlpha(0);
    b.setName('banner');
    this.tweens.add({ targets: b, scale: 1, alpha: 1, duration: 300, ease: 'Back.easeOut', hold: 900, yoyo: true, onComplete: () => b.destroy() });
  }

  private startWave(): void {
    this.wave++;
    this.toSpawn = 8 + this.wave * 4;
    this.spawnCd = 0.5;
    this.updateHud();
    if (this.wave % 5 === 0) this.sfx('boss', { volume: 0.5 });
    else this.sfx('wave', { volume: 0.4 });
    if (this.wave % 5 === 0) { this.banner(t('boss'), '#c77dff'); this.time.delayedCall(1500, () => !this.isOver && this.spawnZombie('boss')); }
    else this.banner(`${t('wave')} ${this.wave}`);
  }

  private spawnZombie(kind?: string): void {
    const { width, height } = this.scale;
    if (!kind) {
      const pool = ['walker', 'walker', 'walker'];
      if (this.wave >= 2) pool.push('runner', 'runner');
      if (this.wave >= 3) pool.push('brute');
      if (this.wave >= 6) pool.push('runner', 'brute');
      kind = rng.pick(pool);
    }
    const zt = Z[kind];
    const side = rng.int(0, 3);
    const x = side === 0 ? -40 : side === 1 ? width + 40 : rng.int(0, width);
    const y = side === 2 ? -40 : side === 3 ? height + 40 : rng.int(0, height);
    const z = this.zombies.create(x, y, 'zombie') as Body;
    const hp = Math.ceil(zt.hp * (1 + (this.wave - 1) * 0.12));
    z.setScale(zt.scale).setTint(zt.tint).setDepth(kind === 'boss' ? 12 : 9);
    z.body.setCircle(14, 4, 7);
    z.setData('hp', hp).setData('kind', kind).setData('speed', zt.speed * (1 + Math.min(0.6, this.wave * 0.04)) * rng.int(90, 110) / 100).setData('wob', rng.int(0, 100));
    if (kind === 'boss') shake(this, 0.01, 400);
  }

  private fire(): void {
    const n = this.multi, spread = 0.13;
    for (let i = 0; i < n; i++) {
      const a = this.aim + (i - (n - 1) / 2) * spread;
      const tipX = this.hero.x + Math.cos(this.aim) * 30 - Math.sin(this.aim) * 12;
      const tipY = this.hero.y + Math.sin(this.aim) * 30 + Math.cos(this.aim) * 12;
      const b = this.bullets.create(tipX, tipY, 'zs-bullet') as Body;
      b.setRotation(a).setDepth(8).setData('pierce', this.pierce).setData('hits', []);
      b.body.setSize(8, 8);
      b.setVelocity(Math.cos(a) * 900, Math.sin(a) * 900);
    }
    burst(this, this.hero.x + Math.cos(this.aim) * 38, this.hero.y + Math.sin(this.aim) * 38, [0xffd23f, 0xffffff], 4, 120);
    this.sfxAt(rng.pick(['shoot1', 'shoot2', 'shoot3']), this.hero.x, { volume: 0.18 });
  }

  private hitZombie(b: Body, z: Body): void {
    if (!b.active || !z.active) return;
    const hits = b.getData('hits') as Body[];
    if (hits.includes(z)) return;
    hits.push(z);
    const pierce = b.getData('pierce') as number;
    if (pierce <= 0) b.destroy(); else b.setData('pierce', pierce - 1);
    const hp = (z.getData('hp') as number) - this.dmg;
    z.setData('hp', hp);
    const ang = Phaser.Math.Angle.Between(this.hero.x, this.hero.y, z.x, z.y);
    const kb = z.getData('kind') === 'boss' ? 4 : 14;
    z.x += Math.cos(ang) * kb; z.y += Math.sin(ang) * kb;
    burst(this, z.x, z.y, [0x8a1c1c, 0x5a0f0f], 6, 160);
    if (hp > 0) {
      z.setTintFill(0xffffff);
      this.time.delayedCall(50, () => z.active && z.setTint(Z[z.getData('kind') as string].tint));
      this.sfxAt(rng.pick(['hit1', 'hit2']), z.x, { volume: 0.3 });
      return;
    }
    this.killZombie(z);
  }

  private killZombie(z: Body): void {
    const kind = z.getData('kind') as string;
    const zt = Z[kind];
    this.addScore(zt.pts * (1 + Math.floor(this.wave / 4)), z.x, z.y - 20);
    burst(this, z.x, z.y, [0x8a1c1c, 0x5a0f0f, 0x6b8e4e], kind === 'boss' ? 60 : 16, kind === 'boss' ? 420 : 240);
    const blood = this.add.circle(z.x, z.y, 14 * zt.scale, 0x5a0f0f, 0.55).setDepth(1).setScale(1, 0.7);
    this.tweens.add({ targets: blood, alpha: 0, delay: 3000, duration: 1500, onComplete: () => blood.destroy() });
    if (kind === 'boss') this.sfxAt('bossdie', z.x, { volume: 0.8 });
    else if (kind === 'brute') this.sfxAt('brutedie', z.x, { volume: 0.5 });
    else this.sfxAt(rng.pick(['splat1', 'splat2']), z.x, { volume: 0.4 });
    if (kind === 'boss' || kind === 'brute') shake(this, kind === 'boss' ? 0.02 : 0.006, kind === 'boss' ? 400 : 120);
    if (kind === 'boss' || rng.chance(0.035)) this.dropMedkit(z.x, z.y);
    z.destroy();
  }

  private dropMedkit(x: number, y: number): void {
    const m = this.items.create(x, y, 'zs-medkit') as Body;
    m.setDepth(7).setScale(0);
    this.tweens.add({ targets: m, scale: 0.9, duration: 300, ease: 'Back.easeOut' });
    this.tweens.add({ targets: m, angle: 10, yoyo: true, repeat: -1, duration: 400 });
    this.time.delayedCall(9000, () => m.active && m.destroy());
  }

  private pickup(m: Body): void {
    if (!m.active) return;
    m.destroy();
    this.hp = Math.min(this.maxHp, this.hp + 1);
    popup(this, this.hero.x, this.hero.y - 40, t('heal'), '#5dff7a', 22);
    this.sfxAt('pickup', this.hero.x, { volume: 0.55 });
    this.updateHud();
  }

  private hurt(z: Body): void {
    if (this.invuln > 0 || this.isOver || this.choosing) return;
    const dmg = z.getData('kind') === 'boss' ? 2 : 1;
    this.hp -= dmg;
    this.invuln = 1;
    const a = Phaser.Math.Angle.Between(z.x, z.y, this.hero.x, this.hero.y);
    this.hero.x += Math.cos(a) * 30; this.hero.y += Math.sin(a) * 30;
    if (this.hp > 0) this.sfxAt('hurt', this.hero.x, { volume: 0.6 });
    else this.sfxAt('die', this.hero.x, { volume: 0.75 });
    if (this.hp === 1) this.time.delayedCall(250, () => this.sfx('lowhp', { volume: 0.5 }));
    shake(this, 0.015, 200);
    flash(this, 0x8a1c1c, 150);
    burst(this, this.hero.x, this.hero.y, 0xec3013, 12, 200);
    this.updateHud();
    if (this.hp <= 0) {
      this.hero.setTint(0x555555);
      this.tweens.add({ targets: this.hero, angle: this.hero.angle + 90, alpha: 0.4, duration: 600 });
      this.endGame({ delay: 1000 });
    }
  }

  endGame(o: EndOptions = {}): void {
    for (const c of [...this.children.list]) if (c.name === 'banner' || c.name === 'card') c.destroy();
    super.endGame(o);
  }

  // ---------- upgrades between waves ----------
  private openUpgrades(): void {
    this.choosing = true;
    this.physics.world.pause();
    const { width, height } = this.scale;
    const pool: UpKey[] = ['upRate', 'upDmg', 'upMulti', 'upPierce', 'upSpeed', 'upHeal'];
    if (this.multi >= 5) pool.splice(pool.indexOf('upMulti'), 1);
    if (this.rate <= 0.1) pool.splice(pool.indexOf('upRate'), 1);
    const picks = rng.shuffle([...pool]).slice(0, 3);
    const objs: Phaser.GameObjects.GameObject[] = [];
    const dim = this.add.rectangle(0, 0, width, height, 0x000000, 0.6).setOrigin(0).setDepth(9100).setInteractive();
    const title = txt(this, width / 2, height * 0.25, t('chooseUp'), { title: true, size: 30, color: '#ffd23f' }).setDepth(9101);
    objs.push(dim, title);
    let sel = 1;
    this.sfx('menu', { volume: 0.5 });
    const cards: Button[] = [];
    const choose = (k: UpKey) => {
      if (!this.choosing) return;
      this.applyUpgrade(k);
      for (const o of objs) o.destroy();
      this.input.keyboard?.off('keydown', onKey);
      this.choosing = false;
      this.physics.world.resume();
      this.nextWaveIn = 0.8;
    };
    picks.forEach((k, i) => {
      const b = new Button(this, width / 2 + (i - 1) * 400, height * 0.55, t(k), () => choose(k), { width: 360, height: 130, size: 22, color: [0xec3013, 0x8b5cff, 0x2a9d8f][i] });
      b.setDepth(9102).setName('card');
      b.setScale(0);
      this.tweens.add({ targets: b, scale: 1, duration: 300, delay: i * 100, ease: 'Back.easeOut' });
      cards.push(b);
      objs.push(b);
      const n = txt(this, b.x, b.y + 105, `${i + 1}`, { title: true, size: 20, color: '#ffffff' }).setDepth(9102);
      objs.push(n);
    });
    const marker = this.add.rectangle(0, 0, 380, 150).setStrokeStyle(6, 0xffd23f).setDepth(9101);
    objs.push(marker);
    const place = () => marker.setPosition(cards[sel].x, cards[sel].y + 4);
    place();
    const onKey = (e: KeyboardEvent) => {
      if (e.code === 'Digit1' || e.code === 'Digit2' || e.code === 'Digit3') choose(picks[+e.code.slice(5) - 1]);
      else if (e.code === 'ArrowLeft' || e.code === 'KeyA') { sel = (sel + 2) % 3; place(); this.sfx('toggle', { volume: 0.4 }); }
      else if (e.code === 'ArrowRight' || e.code === 'KeyD') { sel = (sel + 1) % 3; place(); this.sfx('toggle', { volume: 0.4 }); }
      else if (e.code === 'Space' || e.code === 'Enter' || e.code === 'KeyZ') choose(picks[sel]);
    };
    // short delay so a held fire key doesn't instantly pick
    this.time.delayedCall(350, () => this.choosing && this.input.keyboard?.on('keydown', onKey));
  }

  private applyUpgrade(k: UpKey): void {
    if (k === 'upRate') this.rate = Math.max(0.08, this.rate * 0.8);
    if (k === 'upDmg') this.dmg++;
    if (k === 'upMulti') this.multi++;
    if (k === 'upPierce') this.pierce++;
    if (k === 'upSpeed') this.speed *= 1.12;
    if (k === 'upHeal') { this.maxHp++; this.hp = this.maxHp; }
    this.hero.setTexture(this.multi >= 3 ? 'hero-machine' : this.dmg >= 3 ? 'hero-silencer' : 'hero-gun');
    this.sfx('upgrade', { volume: 0.6 });
    flash(this, 0x5dff7a, 120);
    burst(this, this.hero.x, this.hero.y, [0x5dff7a, 0xffd23f], 30, 300);
    this.updateHud();
  }

  // ---------- loop ----------
  updateGame(_time: number, delta: number): void {
    if (this.choosing) { this.hero.setVelocity(0, 0); return; }
    const dt = delta / 1000;
    const { width, height } = this.scale;
    const c = this.controls;
    this.invuln = Math.max(0, this.invuln - dt);
    if (c.justB()) { this.autoAim = !this.autoAim; this.sfx('aim', { volume: 0.45 }); this.updateHud(); }

    let mx = c.axisX, my = c.axisY;
    const len = Math.hypot(mx, my);
    if (len > 1) { mx /= len; my /= len; }
    this.hero.setVelocity(mx * this.speed, my * this.speed);

    // aiming: manual (pointer / right stick) > auto-aim nearest > movement direction
    let target: Body | null = null, bd = 520;
    if (!this.manual && this.autoAim) {
      for (const z of this.zombies.getChildren() as Body[]) {
        if (z.x < -10 || z.x > width + 10 || z.y < -10 || z.y > height + 10) continue;
        const d = Phaser.Math.Distance.Between(z.x, z.y, this.hero.x, this.hero.y);
        if (d < bd) { bd = d; target = z; }
      }
    }
    let want = this.aim, shooting = false;
    if (this.manual) { want = this.manual.angle; shooting = true; }
    else if (target) { want = Phaser.Math.Angle.Between(this.hero.x, this.hero.y, target.x, target.y); shooting = true; }
    else if (len > 0.2) { want = Math.atan2(my, mx); shooting = !this.autoAim || c.a; }
    if (c.a) shooting = true;
    this.aim = Phaser.Math.Angle.RotateTo(this.aim, want, 14 * dt);
    this.hero.setRotation(this.aim);
    this.fireCd -= dt;
    if (shooting && this.fireCd <= 0) { this.fire(); this.fireCd = this.rate; }
    this.hero.setAlpha(this.invuln > 0 && Math.floor(this.elapsed * 14) % 2 ? 0.4 : 1);

    // zombies shamble toward the hero
    for (const z of this.zombies.getChildren() as Body[]) {
      const a = Phaser.Math.Angle.Between(z.x, z.y, this.hero.x, this.hero.y);
      const sp = z.getData('speed') as number;
      const wob = Math.sin(this.elapsed * 3 + (z.getData('wob') as number)) * 0.35;
      z.setVelocity(Math.cos(a + wob) * sp, Math.sin(a + wob) * sp);
      z.setRotation(a);
    }
    for (const b of [...this.bullets.getChildren()] as Body[]) if (b.x < -30 || b.x > width + 30 || b.y < -30 || b.y > height + 30) b.destroy();

    // waves
    if (this.toSpawn > 0) {
      this.spawnCd -= dt;
      if (this.spawnCd <= 0) {
        this.toSpawn--;
        this.spawnZombie();
        this.spawnCd = Math.max(0.18, 1.0 - this.wave * 0.07) * rng.int(60, 140) / 100;
      }
    } else if (this.zombies.countActive() === 0) {
      if (this.wave > 0 && this.nextWaveIn <= 0) {
        this.addScore(100 * this.wave, this.hero.x, this.hero.y - 50);
        this.banner(t('waveClear'), '#5dff7a');
        this.nextWaveIn = 99;
        this.time.delayedCall(1300, () => !this.isOver && this.openUpgrades());
      } else if (this.nextWaveIn < 90) {
        this.nextWaveIn -= dt;
        if (this.nextWaveIn <= 0) { this.startWave(); }
      }
    }
  }
}
