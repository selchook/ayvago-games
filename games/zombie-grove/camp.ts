// Zombie Grove: the camp, a scene of its own opened from the menu (the menu waits under it, so its
// keys do not start a run). Three tabs:
//   - Heroes: the chosen hero on a live 3D turntable (their Mini Character in its idle clip,
//     holding their weapon; drag to turn it), their name, twist, weapon and how they are unlocked,
//     and a gallery of all eight with portraits rendered from the same models.
//   - Upgrades: fifteen lasting upgrades with level pips, the effect now and next, and the price
//     (the Curse is free and opt-in: a tap steps it up, and from the top back to off).
//   - Weapons: all eight weapons; coins unlock the five that start locked for the drafts.
// Mouse, touch and keyboard (Q/E or 1–3 tabs, arrows choose, Enter buys or picks, Esc back).
import Phaser from 'phaser';
import { txt, t, playSfx } from '@core';
import { World3D, THREE, playerCharacter3d, miniKey } from '@core/three';
import { HEROES, HERO_IDS, WEAPON_IDS, EVOLVES_WITH, type HeroId, type WeaponId } from './defs';
import {
  UPGRADE_IDS, UPGRADES, WEAPON_COST, upgradeCost, buyUpgrade, buyWeapon, chooseHero, lvl, milestoneProgress,
  type Meta, type UpgradeId,
} from './meta';
import { loadMeta, saveMeta } from './save';
import { upgradeArt, weaponArt, COIN, LOCK, makeArt } from './art';
import { glass, Pill } from './ui';
import { heroFigure, holdClip, disposeHeroFigure } from './heroes3d';
import { Figure } from './figure';

type Tab = 'heroes' | 'upgrades' | 'weapons';
const TABS: Tab[] = ['heroes', 'upgrades', 'weapons'];
type Item = { kind: 'up'; id: UpgradeId } | { kind: 'weapon'; id: WeaponId } | { kind: 'hero'; id: HeroId };

interface Tile { item: Item; x: number; y: number; w: number; h: number; box: Phaser.GameObjects.Container; bg: Phaser.GameObjects.Graphics; draw: () => void }

/** Where the turntable's hero stands on the screen (feet), and the gallery and info rows. */
const STAGE = { x: 360, y: 560, top: 214 };
const INFO_Y = 640;
const GRID_Y = [924, 1060];
const PORTRAIT = 160;

/** The camp's world image sits over the panel (the world draws itself under everything by default). */
const WORLD_IMAGE_DEPTH = 2;

export class CampScene extends Phaser.Scene {
  private meta!: Meta;
  private tab: Tab = 'heroes';
  private layer!: Phaser.GameObjects.Container;
  private tiles: Tile[] = [];
  private focus = 0;
  private coinText!: Phaser.GameObjects.Text;
  private tabPills: Pill[] = [];
  private closed = false;
  private from = 'Menu';
  private heroAtOpen: HeroId = 'survivor';
  /** The hero on show on the turntable (may be a locked one). */
  private shown: HeroId = 'survivor';
  private world!: World3D;
  private stage = new THREE.Group();
  private fig: Figure | null = null;
  private buddy: Figure | null = null;
  private spin = 0.5;
  private drag: { x: number; v: number } | null = null;
  private flourishT = 3;
  private popT = 1;
  private worldImage: Phaser.GameObjects.Image | null = null;
  // the hero tab's info panel
  private heroName!: Phaser.GameObjects.Text;
  private heroTwist!: Phaser.GameObjects.Text;
  private heroWeapon!: Phaser.GameObjects.Text;
  private heroWeaponIcon!: Phaser.GameObjects.Image;
  private heroUnlock!: Phaser.GameObjects.Text;
  private actBtn!: Pill;
  private actCoin!: Phaser.GameObjects.Image;
  // the upgrade / weapon tabs' info panel
  private infoName!: Phaser.GameObjects.Text;
  private infoLevel!: Phaser.GameObjects.Text;
  private infoDesc!: Phaser.GameObjects.Text;

  constructor() { super('Camp'); }

  create(data: { from?: string }): void {
    makeArt(this);
    this.from = data?.from ?? 'Menu';
    this.meta = loadMeta();
    this.heroAtOpen = this.meta.hero;
    this.shown = this.meta.hero;
    this.tiles = [];
    this.tabPills = [];
    this.closed = false;
    this.fig = null;
    this.buddy = null;
    this.stage = new THREE.Group();
    this.tab = 'heroes';
    const { width, height } = this.scale;
    this.add.rectangle(0, 0, width, height, 0x050a06, 0.82).setOrigin(0).setInteractive();
    const panel = this.add.container(width / 2, 648);
    panel.add(glass(this, 700, 1240, { alpha: 0.96, r: 30, sheen: false }));
    txt(this, 44, 70, t('campTitle'), { title: true, size: 46, color: '#ffd23f', strokeThickness: 7 }).setOrigin(0, 0.5);
    const chip = this.add.container(width - 150, 70);
    chip.add(this.add.graphics().fillStyle(0x0b120d, 0.85).fillRoundedRect(-110, -28, 220, 56, 28).lineStyle(2, 0xffd23f, 0.8).strokeRoundedRect(-110, -28, 220, 56, 28));
    chip.add(this.add.image(-70, 0, COIN).setDisplaySize(40, 40));
    this.coinText = txt(this, 12, 1, '', { title: true, size: 28, color: '#ffe68a', strokeThickness: 0, shadow: false });
    chip.add(this.coinText);
    const sub = txt(this, width / 2, 124, t('campSub'), { size: 18, color: '#c8d8c0', strokeThickness: 0, shadow: false });
    if (sub.width > 650) sub.setScale(650 / sub.width);
    TABS.forEach((tb, i) => {
      const p = new Pill(this, width / 2 + (i - 1) * 222, 176, 212, 62, 0x2a3a30, () => this.setTab(tb), 22);
      p.setLabels(t('tab' + tb[0].toUpperCase() + tb.slice(1)));
      this.tabPills.push(p);
    });
    const back = new Pill(this, width / 2, 1196, 260, 76, 0x5a3048, () => this.close(), 28);
    back.setLabels(t('campBack'));
    if (!this.sys.game.device.input.touch) txt(this, width / 2, 1252, t('campKeys'), { size: 17, color: '#9fb09a', strokeThickness: 0, shadow: false });

    this.initWorld();
    this.layer = this.add.container(0, 0);
    const kb = this.input.keyboard;
    kb?.on('keydown', (e: KeyboardEvent) => {
      if (this.closed) return;
      if (e.code === 'Escape' || e.code === 'KeyC') { this.close(); return; }
      if (e.code === 'Enter' || e.code === 'Space') { this.act(); return; }
      const ti = ['Digit1', 'Digit2', 'Digit3'].indexOf(e.code);
      if (ti >= 0) { this.setTab(TABS[ti]); return; }
      if (e.code === 'KeyQ' || e.code === 'KeyE' || e.code === 'Tab') {
        e.preventDefault?.();
        this.setTab(TABS[(TABS.indexOf(this.tab) + (e.code === 'KeyQ' ? 2 : 1)) % 3]);
        return;
      }
      const dir = ({ ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1], KeyA: [-1, 0], KeyD: [1, 0], KeyW: [0, -1], KeyS: [0, 1] } as Record<string, number[]>)[e.code];
      if (dir) this.move(dir[0], dir[1]);
    });
    this.setTab('heroes', true);
  }

  // ------------------------------------------------------------------ the 3D turntable

  private initWorld(): void {
    const { width, height } = this.scale;
    this.world = new World3D(this, { fov: 26, near: 0.5, far: 40, background: null });
    // the world's image is drawn over the panel, under the text
    this.worldImage = this.children.list.find((o) => o instanceof Phaser.GameObjects.Image && (o as Phaser.GameObjects.Image).texture.key.startsWith('__world3d_')) as Phaser.GameObjects.Image ?? null;
    this.worldImage?.setDepth(WORLD_IMAGE_DEPTH);
    const sc = this.world.scene;
    sc.add(new THREE.HemisphereLight(0xfff4e6, 0x4a3a46, 2.1));
    const key = new THREE.DirectionalLight(0xffe8d0, 2.3);
    key.position.set(-2, 3, 4);
    const rim = new THREE.DirectionalLight(0x9fd8ff, 2.2);
    rim.position.set(2.5, 2, -3);
    sc.add(key, rim);
    // a soft round shadow under the hero
    const cv = document.createElement('canvas');
    cv.width = cv.height = 64;
    const g = cv.getContext('2d')!;
    const r = g.createRadialGradient(32, 32, 2, 32, 32, 31);
    r.addColorStop(0, 'rgba(0,0,0,0.6)'); r.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = r; g.fillRect(0, 0, 64, 64);
    const blob = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.9), new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(cv), transparent: true, depthWrite: false }));
    blob.rotation.x = -Math.PI / 2;
    blob.position.y = 0.003;
    sc.add(blob, this.stage);
    const cam = this.world.camera;
    cam.position.set(0, 1.55, 7.3);
    cam.lookAt(0, 0.36, 0);
    cam.updateMatrixWorld(true);
    // the hero's feet at STAGE on the screen
    const feet = new THREE.Vector3(0, 0, 0).project(cam);
    const fy = (1 - feet.y) / 2 * height;
    cam.setViewOffset(width, height, 0, fy - STAGE.y, width, height);
    cam.updateProjectionMatrix();
    this.renderPortraits();
    this.world.onFrame = (dt) => this.turn(dt);
    // drag the stage to turn the hero
    const zone = this.add.zone(STAGE.x, (STAGE.top + STAGE.y + 40) / 2, 420, STAGE.y + 40 - STAGE.top).setInteractive();
    zone.on('pointerdown', (p: Phaser.Input.Pointer) => { this.drag = { x: p.x, v: 0 }; });
    this.input.on('pointermove', (p: Phaser.Input.Pointer) => {
      if (!this.drag || !p.isDown) return;
      const dx = p.x - this.drag.x;
      this.drag.x = p.x;
      this.spin += dx * 0.012;
      this.drag.v = dx * 0.6;
    });
    this.input.on('pointerup', () => { this.drag = null; });
    this.layerZone = zone;
  }
  private layerZone: Phaser.GameObjects.Zone | null = null;

  private turn(dt: number): void {
    if (!this.fig) return;
    if (!this.drag) this.spin += dt * 0.55;
    this.stage.rotation.y = this.spin;
    // a little pop when a new hero steps up
    this.popT = Math.min(1, this.popT + dt * 3.2);
    const k = this.popT, s = 1 + Math.sin(k * Math.PI) * 0.12 * (1 - k * 0.5);
    this.stage.scale.setScalar((0.55 + 0.45 * Math.min(1, k * 1.6)) * s);
    // every few seconds they show off their weapon
    this.flourishT -= dt;
    if (this.flourishT <= 0) {
      this.flourishT = 4.5;
      const w = HEROES[this.shown].start;
      const clip = w === 'bow' ? 'holding-both-shoot' : w === 'blaster' ? 'holding-right-shoot' : w === 'wards' || w === 'shield' ? 'attack-melee-left' : w === 'robot' ? 'emote-yes' : w === 'torch' ? 'interact-right' : 'attack-melee-right';
      this.fig.act(clip, 0.8, 1.1);
    }
    this.fig.update(dt);
    if (this.buddy) {
      this.buddy.root.position.y = 0.22 + Math.sin(this.time.now / 300) * 0.04;
      this.buddy.update(dt);
    }
  }

  /** Puts a hero on the turntable. */
  private showHero(h: HeroId): void {
    if (this.fig) { this.stage.remove(this.fig.root); disposeHeroFigure(this.fig); this.fig = null; }
    if (this.buddy) { this.stage.remove(this.buddy.root); this.buddy.dispose(); disposeSkeletons(this.buddy.root); this.buddy = null; }
    this.shown = h;
    const fig = heroFigure(h, { scale: 1, shadows: false });
    fig.armsRest = holdClip(h);
    fig.play('idle');
    this.stage.add(fig.root);
    this.fig = fig;
    // the Scout's weapon is her robot: it hovers at her side
    if (HEROES[h].start === 'robot') {
      const b = new Figure(miniKey('character-robot'), 0.42, { shadows: false });
      b.root.position.set(0.42, 0.22, -0.12);
      b.play('walk', { speed: 1.2 });
      this.stage.add(b.root);
      this.buddy = b;
    }
    this.popT = 0;
    this.flourishT = 1.6;
  }

  /**
   * The gallery's portraits: each hero rendered once from their own 3D model (head and shoulders,
   * weapon in hand) into a canvas texture, cached for the page.
   */
  private renderPortraits(): void {
    const own = playerCharacter3d();
    const todo = HERO_IDS.filter((h) => !this.textures.exists(portraitKey(h, own)));
    if (!todo.length) return;
    const r = this.world.renderer;
    const sc = new THREE.Scene();
    sc.add(new THREE.HemisphereLight(0xfff4e6, 0x3a3046, 2.2));
    const key = new THREE.DirectionalLight(0xffe8d0, 2.4);
    key.position.set(-2, 3, 4);
    const rim = new THREE.DirectionalLight(0x9fd8ff, 2.4);
    rim.position.set(2.5, 2, -3);
    sc.add(key, rim);
    const cam = new THREE.PerspectiveCamera(24, 1, 0.1, 20);
    const H = r.domElement.height;
    const size = new THREE.Vector2();
    r.getSize(size);
    r.setScissorTest(true);
    r.setViewport(0, 0, PORTRAIT, PORTRAIT);
    r.setScissor(0, 0, PORTRAIT, PORTRAIT);
    for (const h of todo) {
      const fig = heroFigure(h, { scale: 1, shadows: false });
      fig.armsRest = holdClip(h);
      fig.play('idle');
      fig.update(0.6);
      fig.root.rotation.y = -0.45;
      sc.add(fig.root);
      fig.root.updateMatrixWorld(true);
      // frame the head and shoulders of this model (they differ in height)
      const box = new THREE.Box3().setFromObject(fig.body);
      const top = box.max.y;
      cam.position.set(0.55, top - 0.02, 1.75);
      cam.lookAt(0.02, top - 0.2, 0);
      r.setClearColor(0x000000, 0);
      r.clear();
      r.render(sc, cam);
      const tex = this.textures.createCanvas(portraitKey(h, own), PORTRAIT, PORTRAIT);
      tex?.getContext().drawImage(r.domElement, 0, H - PORTRAIT, PORTRAIT, PORTRAIT, 0, 0, PORTRAIT, PORTRAIT);
      tex?.refresh();
      sc.remove(fig.root);
      disposeHeroFigure(fig);
    }
    r.setScissorTest(false);
    r.setViewport(0, 0, size.x, size.y);
    sc.clear();
  }

  // ------------------------------------------------------------------ tabs

  private setTab(tab: Tab, first = false): void {
    if (this.tab === tab && !first) return;
    if (!first) playSfx(this, 'move', { volume: 0.35 });
    this.tab = tab;
    this.tabPills.forEach((p, i) => { p.setColor(TABS[i] === tab ? 0xc8902a : 0x2a3a30); p.setScale(TABS[i] === tab ? 1.04 : 1); });
    this.layer.removeAll(true);
    this.tiles = [];
    const hero = tab === 'heroes';
    this.worldImage?.setVisible(hero);
    this.layerZone?.setActive(hero).setVisible(hero);
    if (this.layerZone) { if (hero) this.layerZone.setInteractive(); else this.layerZone.disableInteractive(); }
    if (hero) this.buildHeroes();
    else if (tab === 'upgrades') this.buildUpgrades();
    else this.buildWeapons();
    if (!first) { this.layer.setAlpha(0); this.tweens.add({ targets: this.layer, alpha: 1, duration: 160 }); }
    this.refresh();
  }

  private buildHeroes(): void {
    const { width } = this.scale;
    const L = this.layer;
    // the stage: a warm spotlight behind the turntable
    const spot = this.add.graphics();
    for (let i = 10; i >= 1; i--) spot.fillStyle(0xffd27a, 0.025).fillEllipse(STAGE.x, STAGE.y - 150, 120 + i * 34, 220 + i * 30);
    spot.fillStyle(0x000000, 0.25).fillEllipse(STAGE.x, STAGE.y + 4, 300, 56);
    spot.lineStyle(3, 0xffd27a, 0.35).strokeEllipse(STAGE.x, STAGE.y + 4, 300, 56);
    L.add(spot);
    const arrow = (x: number, d: number) => {
      const p = new Pill(this, x, STAGE.y - 170, 76, 76, 0x2a3a30, () => this.cycle(d), 34);
      p.setLabels(d < 0 ? '‹' : '›');
      p.setDepth(WORLD_IMAGE_DEPTH + 1);
      L.add(p);
    };
    arrow(66, -1);
    arrow(width - 66, 1);
    // the info: name, twist, weapon, unlock, and the action button
    const info = this.add.container(width / 2, INFO_Y);
    info.add(this.add.graphics().fillStyle(0x0b120d, 0.72).fillRoundedRect(-320, -62, 640, 194, 22));
    this.heroName = txt(this, 0, -32, '', { title: true, size: 36, color: '#ffe68a', strokeThickness: 6 });
    this.heroTwist = txt(this, 0, 14, '', { size: 21, color: '#e6efdf', strokeThickness: 0, shadow: false, wrap: 600 });
    this.heroWeaponIcon = this.add.image(0, 58, weaponArt('blade')).setDisplaySize(38, 38);
    this.heroWeapon = txt(this, 0, 59, '', { size: 20, color: '#cfe0ff', strokeThickness: 0, shadow: false }).setOrigin(0, 0.5);
    this.heroUnlock = txt(this, 0, 100, '', { size: 18, color: '#ffb0a0', strokeThickness: 0, shadow: false, wrap: 600 });
    info.add([this.heroName, this.heroTwist, this.heroWeaponIcon, this.heroWeapon, this.heroUnlock]);
    this.actBtn = new Pill(this, 0, 168, 280, 66, 0x2f9a5a, () => this.act(), 26);
    this.actCoin = this.add.image(0, 0, COIN).setDisplaySize(32, 32);
    this.actBtn.add(this.actCoin);
    info.add(this.actBtn);
    info.setDepth(WORLD_IMAGE_DEPTH + 1);
    L.add(info);
    // the gallery
    HERO_IDS.forEach((id, i) => {
      const w = 150, h = 128, gap = 12;
      const x = width / 2 - (4 * w + 3 * gap) / 2 + w / 2 + (i % 4) * (w + gap);
      this.heroTile(id, x, GRID_Y[Math.floor(i / 4)], w, h);
    });
    this.focus = HERO_IDS.indexOf(this.shown);
    this.showHero(this.shown);
  }

  private heroTile(id: HeroId, x: number, y: number, w: number, h: number): void {
    const box = this.add.container(x, y);
    const bg = this.add.graphics();
    const own = playerCharacter3d();
    const img = this.add.image(0, -10, portraitKey(id, own)).setDisplaySize(112, 112);
    const name = txt(this, 0, h / 2 - 18, t('h_' + id), { title: true, size: 17, strokeThickness: 3 });
    if (name.width > w - 10) name.setScale((w - 10) / name.width);
    const lock = this.add.image(w / 2 - 22, -h / 2 + 22, LOCK).setDisplaySize(32, 32);
    const hit = this.add.zone(0, 0, w, h).setInteractive({ useHandCursor: true });
    box.add([bg, img, name, lock, hit]);
    this.layer.add(box);
    const i = this.tiles.length;
    const draw = () => {
      const m = this.meta, on = this.shown === id, ownd = m.heroes.includes(id), sel = m.hero === id;
      const frame = sel ? 0xffd23f : ownd ? 0x7ab8ff : 0x5a6a5a;
      bg.clear()
        .fillStyle(0x000000, 0.3).fillRoundedRect(-w / 2, -h / 2 + 6, w, h, 18)
        .fillStyle(ownd ? 0x1c2a30 : 0x141a16, 0.95).fillRoundedRect(-w / 2, -h / 2, w, h, 18)
        .lineStyle(on ? 5 : 3, on ? 0xfff3a0 : frame, on ? 1 : 0.85).strokeRoundedRect(-w / 2, -h / 2, w, h, 18);
      img.setTint(ownd ? 0xffffff : 0x808a80).setAlpha(ownd ? 1 : 0.85);
      lock.setVisible(!ownd);
      name.setColor(sel ? '#ffd23f' : ownd ? '#ffffff' : '#a0aa9a');
      box.setScale(on ? 1.05 : 1);
    };
    hit.on('pointerup', () => {
      if (this.shown === id && this.focus === i) { this.act(); return; }
      this.focus = i;
      playSfx(this, 'move', { volume: 0.3 });
      this.showHero(id);
      this.refresh();
    });
    this.tiles.push({ item: { kind: 'hero', id }, x, y, w, h, box, bg, draw });
  }

  private cycle(d: number): void {
    const i = (HERO_IDS.indexOf(this.shown) + d + HERO_IDS.length) % HERO_IDS.length;
    this.focus = i;
    playSfx(this, 'move', { volume: 0.3 });
    this.showHero(HERO_IDS[i]);
    this.refresh();
  }

  private buildUpgrades(): void {
    const { width } = this.scale;
    UPGRADE_IDS.forEach((id, i) => {
      const w = 152, h = 150, gap = 10;
      const x = width / 2 - (4 * w + 3 * gap) / 2 + w / 2 + (i % 4) * (w + gap);
      this.itemTile({ kind: 'up', id }, x, 300 + Math.floor(i / 4) * (h + gap), w, h);
    });
    this.buildInfo(1000);
    this.focus = Math.max(0, this.tiles.findIndex((tl) => this.state(tl.item) === 'ok'));
  }

  private buildWeapons(): void {
    const { width } = this.scale;
    WEAPON_IDS.forEach((id, i) => {
      const w = 152, h = 190, gap = 10;
      const x = width / 2 - (4 * w + 3 * gap) / 2 + w / 2 + (i % 4) * (w + gap);
      this.itemTile({ kind: 'weapon', id }, x, 340 + Math.floor(i / 4) * (h + gap), w, h);
    });
    this.buildInfo(920);
    this.focus = Math.max(0, this.tiles.findIndex((tl) => this.state(tl.item) === 'ok'));
  }

  /** An upgrade or weapon tile: icon, name, level pips and the price (or its state). */
  private itemTile(item: Item, x: number, y: number, w: number, h: number): void {
    const box = this.add.container(x, y);
    const bg = this.add.graphics();
    const art = item.kind === 'up' ? upgradeArt(item.id) : weaponArt(item.id as WeaponId);
    const icon = this.add.image(0, -h / 2 + 46, art).setDisplaySize(item.kind === 'up' ? 66 : 84, item.kind === 'up' ? 66 : 84);
    const name = txt(this, 0, h / 2 - 62, this.name(item), { title: true, size: 17, strokeThickness: 0, shadow: false });
    if (name.width > w - 12) name.setScale((w - 12) / name.width);
    const coin = this.add.image(0, h / 2 - 20, COIN).setDisplaySize(24, 24);
    const cost = txt(this, 0, h / 2 - 19, '', { title: true, size: 18, color: '#ffe68a', strokeThickness: 0, shadow: false }).setOrigin(0, 0.5);
    const state = txt(this, 0, h / 2 - 19, '', { title: true, size: 16, color: '#7affc0', strokeThickness: 0, shadow: false });
    const pips = this.add.graphics();
    const hit = this.add.zone(0, 0, w, h).setInteractive({ useHandCursor: true });
    box.add([bg, icon, name, pips, coin, cost, state, hit]);
    this.layer.add(box);
    const i = this.tiles.length;
    const draw = () => {
      const st = this.state(item);
      const on = i === this.focus;
      const curse = item.kind === 'up' && item.id === 'curse';
      const frame = curse ? 0xc01a2a : st === 'ok' ? 0x5ad08a : st === 'poor' ? 0x5a6a5a : 0x7ab8ff;
      bg.clear()
        .fillStyle(0x000000, 0.3).fillRoundedRect(-w / 2, -h / 2 + 6, w, h, 18)
        .fillStyle(curse ? 0x2a1014 : st === 'poor' ? 0x161c18 : 0x1c2a20, 0.95).fillRoundedRect(-w / 2, -h / 2, w, h, 18)
        .lineStyle(on ? 5 : 3, on ? 0xfff3a0 : frame, on ? 1 : 0.8).strokeRoundedRect(-w / 2, -h / 2, w, h, 18);
      const c = this.cost(item);
      const label = curse ? '' : st === 'max' ? t('max') : st === 'owned' ? t('owned') : '';
      state.setText(label).setVisible(!!label);
      const showCost = !label && !curse && c !== null;
      cost.setText(showCost ? String(c) : '').setVisible(showCost).setColor(st === 'poor' ? '#a0806a' : '#ffe68a');
      coin.setVisible(showCost).setX(-(cost.width + 28) / 2 + 12);
      cost.setX(coin.x + 16);
      icon.setAlpha(st === 'poor' ? 0.6 : 1);
      // level pips (the Curse's are red)
      pips.clear();
      if (item.kind === 'up') {
        const max = UPGRADES[item.id].max, n = lvl(this.meta, item.id);
        const pw = 16, gap = 4, w0 = max * pw + (max - 1) * gap;
        const py = curse ? h / 2 - 22 : h / 2 - 40;
        for (let k = 0; k < max; k++) pips.fillStyle(k < n ? (curse ? 0xff3a4a : 0xfff07a) : 0x2a3340, 1).fillRoundedRect(-w0 / 2 + k * (pw + gap), py, pw, 7, 3);
      }
      box.setScale(on ? 1.04 : 1);
    };
    hit.on('pointerup', () => {
      if (this.focus === i) this.act();
      else { this.focus = i; playSfx(this, 'move', { volume: 0.3 }); this.refresh(); }
    });
    this.tiles.push({ item, x, y, w, h, box, bg, draw });
  }

  /** The focused upgrade's or weapon's name, level, effect now and next, text and buy button. */
  private buildInfo(y: number): void {
    const { width } = this.scale;
    const info = this.add.container(width / 2, y);
    info.add(this.add.graphics().fillStyle(0x0b120d, 0.72).fillRoundedRect(-320, -115, 640, 230, 22));
    this.infoName = txt(this, -298, -88, '', { title: true, size: 26, color: '#ffe68a', strokeThickness: 0, shadow: false }).setOrigin(0, 0.5);
    this.infoLevel = txt(this, -298, -68, '', { title: true, size: 17, color: '#9fe8c0', strokeThickness: 0, shadow: false, wrap: 410, align: 'left' }).setOrigin(0, 0);
    this.infoDesc = txt(this, -298, -8, '', { size: 18, color: '#e6efdf', strokeThickness: 0, shadow: false, wrap: 410, align: 'left' }).setOrigin(0, 0);
    this.actBtn = new Pill(this, 214, 0, 180, 84, 0x2f9a5a, () => this.act(), 26);
    this.actCoin = this.add.image(0, 0, COIN).setDisplaySize(30, 30);
    this.actBtn.add(this.actCoin);
    info.add([this.infoName, this.infoLevel, this.infoDesc, this.actBtn]);
    this.layer.add(info);
  }

  // ------------------------------------------------------------------ state

  private name(it: Item): string {
    return it.kind === 'up' ? t('u_' + it.id) : it.kind === 'weapon' ? t('w_' + it.id) : t('h_' + it.id);
  }

  /** ok: can buy, poor: too dear, max/owned/selected: nothing to buy, pick: a hero to switch to. */
  private state(it: Item): 'ok' | 'poor' | 'max' | 'owned' | 'selected' | 'pick' {
    const m = this.meta;
    if (it.kind === 'up') { const c = upgradeCost(m, it.id); return c === null ? 'max' : m.coins >= c ? 'ok' : 'poor'; }
    if (it.kind === 'weapon') { const c = WEAPON_COST[it.id]; return c === undefined || m.weapons.includes(it.id) ? 'owned' : m.coins >= c ? 'ok' : 'poor'; }
    if (m.hero === it.id) return 'selected';
    if (m.heroes.includes(it.id)) return 'pick';
    return m.coins >= HEROES[it.id].cost ? 'ok' : 'poor';
  }

  private cost(it: Item): number | null {
    if (it.kind === 'up') return upgradeCost(this.meta, it.id);
    if (it.kind === 'weapon') return this.meta.weapons.includes(it.id) ? null : WEAPON_COST[it.id] ?? null;
    return this.meta.heroes.includes(it.id) ? null : HEROES[it.id].cost;
  }

  /** The action button: a label, or a price with a coin. */
  private setAction(label: string | null, price: number | null, enabled: boolean, color = 0x2f9a5a): void {
    const b = this.actBtn;
    b.setVisible(label !== null || price !== null);
    b.setColor(color);
    b.setLabels(price !== null ? String(price) : label ?? '');
    this.actCoin.setVisible(price !== null);
    if (price !== null) {
      const w = b.main.width * b.main.scaleX;
      this.actCoin.setPosition(-(w + 38) / 2 + 15, 0);
      b.main.setX(this.actCoin.x + 21 + w / 2);
    } else b.main.setX(0);
    b.setEnabled(enabled);
  }

  private refresh(): void {
    this.coinText.setText(String(this.meta.coins));
    for (const tl of this.tiles) tl.draw();
    if (this.tab === 'heroes') this.refreshHero();
    else this.refreshItem();
  }

  private refreshHero(): void {
    const h = this.shown, d = HEROES[h], m = this.meta;
    this.heroName.setText(t('h_' + h));
    this.heroTwist.setText(t('ht_' + h));
    this.heroWeaponIcon.setTexture(weaponArt(d.start)).setDisplaySize(38, 38);
    this.heroWeapon.setText(t('heroStarts', { w: t('w_' + d.start) }));
    const rowW = 46 + this.heroWeapon.width;
    this.heroWeaponIcon.setX(-rowW / 2 + 19);
    this.heroWeapon.setX(-rowW / 2 + 46);
    const st = this.state({ kind: 'hero', id: h });
    let unlock = '';
    if (!m.heroes.includes(h) && d.milestone) {
      const [a, b] = milestoneProgress(m, d.milestone);
      const ms = d.milestone;
      const n = ms.kind === 'time' ? ms.n / 60 : ms.n;
      const prog = ms.kind === 'time' ? t('msProgress', { a: fmtTime(a), b: fmtTime(b) }) : t('msProgress', { a, b });
      unlock = t('ms_' + ms.kind, { n }) + ' ' + prog + ' · ' + t('orBuy');
    }
    this.heroUnlock.setText(unlock).setVisible(!!unlock);
    if (st === 'selected') this.setAction(t('selected'), null, true, 0xc8902a);
    else if (st === 'pick') this.setAction(t('pick'), null, true);
    else this.setAction(null, d.cost, st === 'ok');
    this.actBtn.setAlpha(st === 'selected' ? 0.9 : 1);
  }

  private refreshItem(): void {
    const tl = this.tiles[this.focus];
    if (!tl) return;
    const it = tl.item, m = this.meta;
    this.infoName.setText(this.name(it));
    if (it.kind === 'up') {
      const def = UPGRADES[it.id], n = lvl(m, it.id);
      const fx = (k: number) => (it.id === 'curse' && k === 0 ? t('upOff') : t('ue_' + it.id, { v: def.v(k) }));
      const now = n > 0 || it.id === 'curse' ? t('upNow', { v: fx(n) }) : '';
      const next = it.id === 'curse' ? t('upNext', { v: fx((n + 1) % (def.max + 1)) }) : n < def.max ? t('upNext', { v: fx(n + 1) }) : '';
      this.infoLevel.setText([[t('upLevel', { a: n, b: def.max }), now].filter(Boolean).join(' · '), next].filter(Boolean).join('\n'));
      this.infoDesc.setText(t('ud_' + it.id));
    } else if (it.kind === 'weapon') {
      const p = EVOLVES_WITH[it.id];
      this.infoLevel.setText(t('e_' + it.id) + ' ★\n' + t('evolvesWith', { p: t('p_' + p) }));
      this.infoDesc.setText(t('wd_' + it.id) + (WEAPON_COST[it.id] !== undefined && !m.weapons.includes(it.id) ? ' ' + t('unlockWeapon') : ''));
    }
    // stack the lines from the name's real height so a tall title font never overlaps the level line
    this.infoLevel.setY(this.infoName.y + this.infoName.height / 2 + 4);
    this.infoDesc.setY(this.infoLevel.y + this.infoLevel.height + 6);
    const st = this.state(it);
    if (it.kind === 'up' && it.id === 'curse') this.setAction(t('curseSet'), null, true, 0xa0304a);
    else if (st === 'max' || st === 'owned') this.setAction(st === 'max' ? t('max') : t('owned'), null, false, 0x3a5a7a);
    else this.setAction(null, this.cost(it), st === 'ok');
  }

  private move(dx: number, dy: number): void {
    if (this.tab === 'heroes' && dx && !dy) { this.cycle(dx); return; }
    const cur = this.tiles[this.focus];
    let best = -1, bd = Infinity;
    this.tiles.forEach((tl, i) => {
      if (i === this.focus) return;
      const ddx = tl.x - cur.x, ddy = tl.y - cur.y;
      if (dx && (Math.sign(ddx) !== dx || Math.abs(ddy) > 20)) return;
      if (dy && (Math.sign(ddy) !== dy || Math.abs(ddy) < 20)) return;
      const d = Math.abs(ddx) + Math.abs(ddy) * (dy ? 0.6 : 3);
      if (d < bd) { bd = d; best = i; }
    });
    if (best < 0) return;
    this.focus = best;
    playSfx(this, 'move', { volume: 0.3 });
    const it = this.tiles[best].item;
    if (it.kind === 'hero') this.showHero(it.id);
    this.refresh();
  }

  /** Buys or picks what is focused (the hero on show in the heroes tab). */
  private act(): void {
    const m = this.meta;
    const tl = this.tab === 'heroes' ? this.tiles[HERO_IDS.indexOf(this.shown)] : this.tiles[this.focus];
    if (!tl) return;
    const it = tl.item;
    let ok = false;
    if (it.kind === 'up') ok = buyUpgrade(m, it.id);
    else if (it.kind === 'weapon') ok = buyWeapon(m, it.id);
    else {
      if (m.hero === it.id) { playSfx(this, 'move', { volume: 0.3 }); return; }
      const r = chooseHero(m, it.id);
      ok = r !== 'poor';
      if (r === 'picked') {
        saveMeta(m);
        playSfx(this, 'cardPick', { volume: 0.5 });
        this.fig?.act('emote-yes', 1, 1);
        this.refresh();
        return;
      }
    }
    if (!ok) {
      playSfx(this, 'error', { volume: 0.4 });
      this.tweens.add({ targets: tl.box, x: { from: tl.x - 8, to: tl.x }, duration: 260, ease: 'Elastic.easeOut' });
      return;
    }
    saveMeta(m);
    const curse = it.kind === 'up' && it.id === 'curse';
    playSfx(this, curse ? 'roar' : 'buy', { volume: curse ? 0.4 : 0.6 });
    this.tweens.add({ targets: tl.box, scale: 1.14, duration: 110, yoyo: true });
    if (!curse) {
      const sp = this.add.particles(tl.x, tl.y, 'zg-coin', { speed: { min: 120, max: 260 }, scale: { start: 0.35, end: 0 }, lifespan: 500, quantity: 12, emitting: false }).setDepth(10);
      sp.explode(12);
      this.time.delayedCall(700, () => sp.destroy());
    }
    if (it.kind === 'hero') { this.fig?.act('emote-yes', 1, 1); playSfx(this, 'evolve', { volume: 0.5 }); }
    this.refresh();
  }

  private close(): void {
    if (this.closed) return;
    this.closed = true;
    playSfx(this, 'move', { volume: 0.35 });
    if (this.fig) { disposeHeroFigure(this.fig); this.fig = null; }
    if (this.buddy) { this.buddy.dispose(); this.buddy = null; }
    const from = this.scene.get(this.from);
    this.scene.stop();
    this.scene.resume(this.from);
    // a new hero stands at the camp: the menu shows them
    if (this.meta.hero !== this.heroAtOpen) from.scene.restart();
    else from.events.emit('camp-closed');
  }

  // ------------------------------------------------------------------ test hooks

  testTab(tab: Tab): void { this.setTab(tab); }
  testHero(h: HeroId): void { this.focus = HERO_IDS.indexOf(h); this.showHero(h); this.refresh(); }
  testFocus(i: number): void { this.focus = i; this.refresh(); }
}

/** The texture key of a hero's portrait (the survivor's depends on the platform character). */
const portraitKey = (h: HeroId, own: string) => 'zg-hp-' + h + (h === 'survivor' ? '-' + own : '');

const fmtTime = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

function disposeSkeletons(root: THREE.Object3D): void {
  root.traverse((o) => { if ((o as THREE.SkinnedMesh).isSkinnedMesh) (o as THREE.SkinnedMesh).skeleton.dispose(); });
}
