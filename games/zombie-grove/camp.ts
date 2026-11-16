// Zombie Grove: the camp, a scene of its own opened from the menu (the menu waits under it, so its
// keys do not start a run). Three tabs:
//   - Heroes: the chosen hero on a live 3D turntable (their Mini Character in its idle clip,
//     holding their weapon; drag to turn it), their name, twist, weapon and how they are unlocked,
//     and a gallery of all eight with portraits rendered from the same models.
//   - Upgrades: fifteen lasting upgrades with level pips, the effect now and next, and the price
//     (the Curse is free and opt-in: a tap steps it up, and from the top back to off).
//   - Weapons: all eight weapons; coins unlock the five that start locked for the drafts.
// Mouse, touch and keyboard (Q/E or 1–3 tabs, arrows choose, Enter buys or picks, Esc back).
//
// It wears the menu theme (menu.ts): the camp is a dark notice board nailed together under the
// bramble frame, the tabs, tiles and buttons are mossy boards that glow toxic green in focus, the
// hero stands on a mound of grave dirt under the moon, and the coins sit on a board chip. Every
// piece and every fixed label is painted in Boot under the Ayvago intro (`prebakeCamp`, the
// theme's `prebake`); opening the camp only places images (the 3D portraits are rendered on the
// first visit, as before). Prices and purses count in painted digits; the texts that change with
// the focus are its only live text.
import Phaser from 'phaser';
import {
  txt, t, playSfx, SkinButton, skinImage, skinTexture, themeCard, themeLabel, labelTexture, placeLabel, ThemeNumber, bake, frameBorder,
  type LabelStyle, type SkinState,
} from '@core';
import { World3D, THREE, playerCharacter3d, miniKey } from '@core/three';
import { HEROES, HERO_IDS, WEAPON_IDS, EVOLVES_WITH, type HeroId, type WeaponId } from './defs';
import {
  UPGRADE_IDS, UPGRADES, WEAPON_COST, upgradeCost, buyUpgrade, buyWeapon, chooseHero, lvl, milestoneProgress,
  type Meta, type UpgradeId,
} from './meta';
import { loadMeta, saveMeta } from './save';
import { upgradeArt, weaponArt, COIN, LOCK, makeArt } from './art';
import { heroFigure, holdClip, disposeHeroFigure } from './heroes3d';
import { Figure } from './figure';

type Tab = 'heroes' | 'upgrades' | 'weapons';
const TABS: Tab[] = ['heroes', 'upgrades', 'weapons'];
type Item = { kind: 'up'; id: UpgradeId } | { kind: 'weapon'; id: WeaponId } | { kind: 'hero'; id: HeroId };

interface Tile { item: Item; x: number; y: number; w: number; h: number; box: Phaser.GameObjects.Container; bg: Phaser.GameObjects.Image; draw: () => void }

/** Where the turntable's hero stands on the screen (feet), and the gallery and info rows. */
const STAGE = { x: 360, y: 560, top: 214 };
const INFO_Y = 640;
const GRID_Y = [924, 1060];
const PORTRAIT = 160;

/** The camp's world image sits over the panel (the world draws itself under everything by default). */
const WORLD_IMAGE_DEPTH = 2;

// ------------------------------------------------------------------ the painted pieces

/** The notice board behind the camp (the theme's card, menu.ts paintNotice). */
export const CAMP_PANEL = { w: 700, h: 1240 };
const WOOD = 0x5d5040, DARK = 0x2e2820, MOSS = 0x557f2a, GOLD = 0x8a6a22, CURSE = 0x6a2424, MAXED = 0x3f5a2a, BLOOD = 0x6a2a3a;
const TAB = { w: 212, h: 62 }, BACK = { w: 260, h: 76 }, ARROW = 76, CHIP = { w: 220, h: 56 };
const HERO_TILE = { w: 150, h: 128 }, UP_TILE = { w: 152, h: 150 }, WEAPON_TILE = { w: 152, h: 190 };
const HERO_INFO = { w: 640, h: 194 }, ITEM_INFO = { w: 640, h: 230 };
const HERO_ACT = { w: 280, h: 66 }, ITEM_ACT = { w: 180, h: 84 };
const TILE_COLOR = { owned: WOOD, locked: DARK, selected: MOSS, ok: WOOD, poor: DARK, max: MAXED, curse: CURSE } as const;
const INK = '#0b1208';
const TITLE_STYLE: LabelStyle = { size: 58, fill: ['#f4ffd8', '#b6ff5a', '#4f8a1a'], stroke: INK, strokeWidth: 9 };
const NOTE_STYLE: LabelStyle = { size: 18, color: '#c8d8c0', stroke: null, shadow: false, body: true };
const HINT_STYLE: LabelStyle = { size: 16, color: '#9fb09a', stroke: null, shadow: false, body: true };
const COIN_STYLE: LabelStyle = { size: 30, color: '#ffe68a', stroke: INK, strokeWidth: 5 };
const PRICE_STYLE: LabelStyle = { size: 22, color: '#ffe68a', stroke: INK, strokeWidth: 4, shadow: false, body: true };
const ACT_PRICE_STYLE: LabelStyle = { size: 30, color: '#fff3c4', stroke: INK, strokeWidth: 5 };
const HEAD_STYLE: LabelStyle = { size: 36, color: '#ffe68a', stroke: INK, strokeWidth: 6 };
const ITEM_HEAD_STYLE: LabelStyle = { size: 30, color: '#ffe68a', stroke: INK, strokeWidth: 5, shadow: false };
const tileName = (col: string): LabelStyle => ({ size: 16, color: col, stroke: INK, strokeWidth: 4, shadow: false, body: true });
const STATE_STYLE: LabelStyle = { size: 17, color: '#7affc0', stroke: INK, strokeWidth: 4, shadow: false, body: true };
const HERO_NAME_COL = { selected: '#ffd23f', owned: '#ffffff', locked: '#a0aa9a' };
const BTN = { tab: 26, back: 30, act: 26 };

/** Moonlight behind the turntable: a soft pale glow. */
function moonTexture(scene: Phaser.Scene): string {
  return bake(scene, 'zg-camp-moon', 440, 520, (c) => {
    const g = c.createRadialGradient(220, 230, 10, 220, 250, 250);
    g.addColorStop(0, 'rgba(230,255,190,0.34)'); g.addColorStop(0.45, 'rgba(160,220,120,0.14)'); g.addColorStop(1, 'rgba(120,200,80,0)');
    c.fillStyle = g; c.fillRect(0, 0, 440, 520);
  });
}

/** The mound the hero stands on: grave dirt with moss round its rim and a faint toxic ring. */
function stageTexture(scene: Phaser.Scene): string {
  return bake(scene, 'zg-camp-stage', 360, 110, (c) => {
    let s = 7;
    const r = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
    c.save();
    c.shadowColor = 'rgba(156,255,58,0.55)'; c.shadowBlur = 16;
    c.strokeStyle = 'rgba(156,255,58,0.6)'; c.lineWidth = 3;
    c.beginPath(); c.ellipse(180, 52, 158, 34, 0, 0, Math.PI * 2); c.stroke();
    c.restore();
    const soil = c.createRadialGradient(170, 44, 10, 180, 54, 160);
    soil.addColorStop(0, '#5a4028'); soil.addColorStop(0.7, '#36261a'); soil.addColorStop(1, '#1a120a');
    c.fillStyle = soil;
    c.beginPath(); c.ellipse(180, 54, 150, 30, 0, 0, Math.PI * 2); c.fill();
    c.strokeStyle = '#0b0805'; c.lineWidth = 2.5; c.stroke();
    // clods and pebbles, moss on the rim
    for (let i = 0; i < 40; i++) {
      const a = r() * Math.PI * 2, d = Math.sqrt(r());
      c.fillStyle = r() < 0.5 ? '#4a3420' : '#24180c';
      c.beginPath(); c.arc(180 + Math.cos(a) * 140 * d, 54 + Math.sin(a) * 26 * d, 1.5 + r() * 2.5, 0, Math.PI * 2); c.fill();
    }
    const greens = ['#2f5a1c', '#3f7424', '#5a8f2e', '#78a83a'];
    for (let i = 0; i < 160; i++) {
      const a = r() * Math.PI * 2;
      c.fillStyle = greens[Math.floor(r() * greens.length)];
      c.beginPath(); c.arc(180 + Math.cos(a) * (146 + r() * 8), 54 + Math.sin(a) * (27 + r() * 4), 1.4 + r() * 2.6, 0, Math.PI * 2); c.fill();
    }
  });
}

/** A carved arrow head for the hero arrows (pointing right; flipped for left). */
function chevronTexture(scene: Phaser.Scene): string {
  return bake(scene, 'zg-camp-chev', 40, 50, (c) => {
    c.lineJoin = 'round'; c.lineCap = 'round';
    const path = () => { c.beginPath(); c.moveTo(12, 8); c.lineTo(30, 25); c.lineTo(12, 42); };
    c.strokeStyle = INK; c.lineWidth = 13; path(); c.stroke();
    c.strokeStyle = '#eef3d6'; c.lineWidth = 7; path(); c.stroke();
  });
}

/**
 * Paints everything the camp shows (the theme's `prebake`, in Boot under the intro): the tabs,
 * tiles and buttons in each state and colour, the info boards, the chip, the moon, the mound and
 * every fixed label in the current language. Opening the camp then paints nothing.
 */
export function prebakeCamp(scene: Phaser.Scene): void {
  const press: SkinState[] = ['up', 'over', 'down'];
  for (const st of press) {
    for (const c of [MOSS, WOOD]) skinTexture(scene, 'button', TAB.w, TAB.h, st, c);
    skinTexture(scene, 'button', BACK.w, BACK.h, st, BLOOD);
    skinTexture(scene, 'round', ARROW, ARROW, st, WOOD);
  }
  for (const st of [...press, 'off'] as SkinState[]) {
    for (const c of [MOSS, GOLD]) skinTexture(scene, 'button', HERO_ACT.w, HERO_ACT.h, st, c);
    for (const c of [MOSS, CURSE]) skinTexture(scene, 'button', ITEM_ACT.w, ITEM_ACT.h, st, c);
  }
  for (const st of ['up', 'on'] as SkinState[]) {
    for (const c of [WOOD, DARK, MOSS]) skinTexture(scene, 'plate', HERO_TILE.w, HERO_TILE.h, st, c);
    for (const c of [WOOD, DARK, MAXED, CURSE]) skinTexture(scene, 'plate', UP_TILE.w, UP_TILE.h, st, c);
    for (const c of [WOOD, DARK, MAXED]) skinTexture(scene, 'plate', WEAPON_TILE.w, WEAPON_TILE.h, st, c);
  }
  skinTexture(scene, 'plate', CHIP.w, CHIP.h);
  skinTexture(scene, 'board', HERO_INFO.w, HERO_INFO.h);
  skinTexture(scene, 'board', ITEM_INFO.w, ITEM_INFO.h);
  moonTexture(scene); stageTexture(scene); chevronTexture(scene);
  labelTexture(scene, t('campTitle'), TITLE_STYLE);
  labelTexture(scene, t('campSub'), NOTE_STYLE);
  labelTexture(scene, t('campKeys'), HINT_STYLE);
  for (const tb of TABS) labelTexture(scene, t(tabKey(tb)), { size: BTN.tab });
  labelTexture(scene, t('campBack'), { size: BTN.back });
  labelTexture(scene, '', { size: 30 });   // the hero arrows' (empty) label
  for (const k of ['selected', 'pick', 'curseSet', 'max', 'owned', '']) labelTexture(scene, k ? t(k) : '', { size: BTN.act });
  for (const k of ['max', 'owned']) labelTexture(scene, t(k), STATE_STYLE);
  for (const h of HERO_IDS) {
    labelTexture(scene, t('h_' + h), HEAD_STYLE);
    for (const col of Object.values(HERO_NAME_COL)) labelTexture(scene, t('h_' + h), tileName(col));
  }
  for (const id of UPGRADE_IDS) for (const col of ['#ffffff', '#a0aa9a']) labelTexture(scene, t('u_' + id), tileName(col));
  for (const id of UPGRADE_IDS) labelTexture(scene, t('u_' + id), ITEM_HEAD_STYLE);
  for (const id of WEAPON_IDS) { for (const col of ['#ffffff', '#a0aa9a']) labelTexture(scene, t('w_' + id), tileName(col)); labelTexture(scene, t('w_' + id), ITEM_HEAD_STYLE); }
  for (const o of [COIN_STYLE, PRICE_STYLE, ACT_PRICE_STYLE]) new ThemeNumber(scene, 0, 0, 0, o).destroy();
}

const tabKey = (tb: Tab) => 'tab' + tb[0].toUpperCase() + tb.slice(1);

export class CampScene extends Phaser.Scene {
  private meta!: Meta;
  private tab: Tab = 'heroes';
  private layer!: Phaser.GameObjects.Container;
  private tiles: Tile[] = [];
  private focus = 0;
  private coins!: ThemeNumber;
  private tabPills: SkinButton[] = [];
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
  private heroName!: Phaser.GameObjects.Image;
  private heroTwist!: Phaser.GameObjects.Text;
  private heroWeapon!: Phaser.GameObjects.Text;
  private heroWeaponIcon!: Phaser.GameObjects.Image;
  private heroUnlock!: Phaser.GameObjects.Text;
  private actBtn!: SkinButton;
  private actCoin!: Phaser.GameObjects.Image;
  private actPrice!: ThemeNumber;
  /** The action button's two colours (MOSS and another) for the current tab. */
  private actAlt = GOLD;
  // the upgrade / weapon tabs' info panel
  private infoName!: Phaser.GameObjects.Image;
  private infoLevel!: Phaser.GameObjects.Text;
  private infoDesc!: Phaser.GameObjects.Text;

  /** How long create() took (ms; a test hook for the open time). */
  openMs = 0;

  constructor() { super('Camp'); }

  create(data: { from?: string }): void {
    const t0 = performance.now();
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
    // the notice board (menu.ts paintNotice through the theme's card) inside the bramble frame
    themeCard(this, width / 2, 648, CAMP_PANEL.w, CAMP_PANEL.h);
    frameBorder(this).forEach((o) => (o as Phaser.GameObjects.Image).setDepth(0));
    const title = themeLabel(this, 44, 72, t('campTitle'), TITLE_STYLE);
    title.setOrigin(0, title.originY).setScale(Math.min(1, 380 / title.width));
    const chip = this.add.container(width - 150, 72);
    this.coins = new ThemeNumber(this, 18, 0, this.meta.coins, COIN_STYLE);
    chip.add([skinImage(this, 0, 0, 'plate', CHIP.w, CHIP.h), this.add.image(-68, 0, COIN).setDisplaySize(40, 40), this.coins]);
    const sub = themeLabel(this, width / 2, 126, t('campSub'), NOTE_STYLE);
    sub.setScale(Math.min(1, 640 / sub.width));
    TABS.forEach((tb, i) => {
      const p = new SkinButton(this, width / 2 + (i - 1) * 222, 176, t(tabKey(tb)), () => this.setTab(tb), { width: TAB.w, height: TAB.h, size: BTN.tab, color: WOOD, baked: true, sfx: '' });
      p.fitLabel(TAB.w - 24);
      this.tabPills.push(p);
    });
    new SkinButton(this, width / 2, 1192, t('campBack'), () => this.close(), { width: BACK.w, height: BACK.h, size: BTN.back, color: BLOOD, baked: true, sfx: '' });
    if (!this.sys.game.device.input.touch) {
      const keys = themeLabel(this, width / 2, 1250, t('campKeys'), HINT_STYLE);
      keys.setScale(Math.min(1, 640 / keys.width));
    }

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
    this.openMs = performance.now() - t0;
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
    this.tabPills.forEach((p, i) => { p.setColor(TABS[i] === tab ? MOSS : WOOD); p.setScale(TABS[i] === tab ? 1.04 : 1); });
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
    // the stage: moonlight behind the turntable, the hero on a mound of grave dirt
    L.add(this.add.image(STAGE.x, STAGE.y - 170, moonTexture(this)));
    L.add(this.add.image(STAGE.x, STAGE.y + 4, stageTexture(this)));
    const arrow = (x: number, d: number) => {
      const p = new SkinButton(this, x, STAGE.y - 170, '', () => this.cycle(d), { width: ARROW, height: ARROW, kind: 'round', color: WOOD, baked: true, sfx: '' });
      p.add(this.add.image(d < 0 ? -2 : 2, 0, chevronTexture(this)).setFlipX(d < 0));
      p.setDepth(WORLD_IMAGE_DEPTH + 1);
      L.add(p);
    };
    arrow(66, -1);
    arrow(width - 66, 1);
    // the info: name, twist, weapon, unlock, and the action button
    const info = this.add.container(width / 2, INFO_Y);
    info.add(skinImage(this, 0, -62 + HERO_INFO.h / 2, 'board', HERO_INFO.w, HERO_INFO.h));
    this.heroName = themeLabel(this, 0, -30, t('h_' + this.shown), HEAD_STYLE);
    this.heroTwist = txt(this, 0, 14, '', { size: 21, color: '#e6efdf', strokeThickness: 0, shadow: false, wrap: 600 });
    this.heroWeaponIcon = this.add.image(0, 58, weaponArt('blade')).setDisplaySize(38, 38);
    this.heroWeapon = txt(this, 0, 59, '', { size: 20, color: '#cfe0ff', strokeThickness: 0, shadow: false }).setOrigin(0, 0.5);
    this.heroUnlock = txt(this, 0, 100, '', { size: 18, color: '#ffb0a0', strokeThickness: 0, shadow: false, wrap: 600 });
    info.add([this.heroName, this.heroTwist, this.heroWeaponIcon, this.heroWeapon, this.heroUnlock]);
    this.makeAct(0, 168, HERO_ACT, GOLD);
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
    const bg = skinImage(this, 0, 0, 'plate', w, h, 'up', WOOD);
    const own = playerCharacter3d();
    const img = this.add.image(0, -12, portraitKey(id, own)).setDisplaySize(108, 108);
    const name = themeLabel(this, 0, h / 2 - 17, t('h_' + id), tileName(HERO_NAME_COL.owned));
    const lock = this.add.image(w / 2 - 22, -h / 2 + 22, LOCK).setDisplaySize(32, 32);
    const hit = this.add.zone(0, 0, w, h).setInteractive({ useHandCursor: true });
    box.add([bg, img, name, lock, hit]);
    this.layer.add(box);
    const i = this.tiles.length;
    const draw = () => {
      const m = this.meta, on = this.shown === id, ownd = m.heroes.includes(id), sel = m.hero === id;
      const k = sel ? 'selected' : ownd ? 'owned' : 'locked';
      bg.setTexture(skinTexture(this, 'plate', w, h, on ? 'on' : 'up', TILE_COLOR[k]));
      img.setTint(ownd ? 0xffffff : 0x808a80).setAlpha(ownd ? 1 : 0.85);
      lock.setVisible(!ownd);
      placeLabel(name, labelTexture(this, t('h_' + id), tileName(HERO_NAME_COL[k])));
      name.setScale(Math.min(1, (w - 14) / name.width));
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
    const bg = skinImage(this, 0, 0, 'plate', w, h, 'up', WOOD);
    const art = item.kind === 'up' ? upgradeArt(item.id) : weaponArt(item.id as WeaponId);
    const icon = this.add.image(0, -h / 2 + 46, art).setDisplaySize(item.kind === 'up' ? 66 : 84, item.kind === 'up' ? 66 : 84);
    const name = themeLabel(this, 0, h / 2 - 62, this.name(item), tileName('#ffffff'));
    const coin = this.add.image(0, h / 2 - 22, COIN).setDisplaySize(24, 24);
    const cost = new ThemeNumber(this, 0, h / 2 - 22, 0, PRICE_STYLE);
    const state = themeLabel(this, 0, h / 2 - 22, t('max'), STATE_STYLE);
    const pips = this.add.graphics();
    const hit = this.add.zone(0, 0, w, h).setInteractive({ useHandCursor: true });
    box.add([bg, icon, name, pips, coin, cost, state, hit]);
    this.layer.add(box);
    const i = this.tiles.length;
    const draw = () => {
      const st = this.state(item);
      const on = i === this.focus;
      const curse = item.kind === 'up' && item.id === 'curse';
      const col = curse ? TILE_COLOR.curse : st === 'poor' ? TILE_COLOR.poor : st === 'max' || st === 'owned' ? TILE_COLOR.max : TILE_COLOR.ok;
      bg.setTexture(skinTexture(this, 'plate', w, h, on ? 'on' : 'up', col));
      const c = this.cost(item);
      const label = curse ? '' : st === 'max' ? t('max') : st === 'owned' ? t('owned') : '';
      if (label) placeLabel(state, labelTexture(this, label, STATE_STYLE));
      state.setVisible(!!label);
      placeLabel(name, labelTexture(this, this.name(item), tileName(st === 'poor' ? '#a0aa9a' : '#ffffff')));
      name.setScale(Math.min(1, (w - 14) / name.width));
      const showCost = !label && !curse && c !== null;
      cost.setVisible(showCost).setAlpha(st === 'poor' ? 0.55 : 1);
      coin.setVisible(showCost).setAlpha(st === 'poor' ? 0.6 : 1);
      if (showCost) {
        cost.setValue(c!);
        const rowW = 24 + 4 + cost.textWidth;
        coin.setX(-rowW / 2 + 12);
        cost.setX(-rowW / 2 + 28 + cost.textWidth / 2);
      }
      icon.setAlpha(st === 'poor' ? 0.6 : 1);
      // level pips (the Curse's are red)
      pips.clear();
      if (item.kind === 'up') {
        const max = UPGRADES[item.id].max, n = lvl(this.meta, item.id);
        const pw = 16, gap = 4, w0 = max * pw + (max - 1) * gap;
        const py = curse ? h / 2 - 22 : h / 2 - 40;
        for (let k = 0; k < max; k++) {
          pips.fillStyle(0x0b0805, 0.85).fillRoundedRect(-w0 / 2 + k * (pw + gap) - 1, py - 1, pw + 2, 9, 4);
          pips.fillStyle(k < n ? (curse ? 0xff3a4a : 0xc8ff66) : 0x3a3228, 1).fillRoundedRect(-w0 / 2 + k * (pw + gap), py, pw, 7, 3);
        }
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
    info.add(skinImage(this, 0, 0, 'board', ITEM_INFO.w, ITEM_INFO.h));
    this.infoName = themeLabel(this, -290, -84, this.name(this.tiles[0].item), ITEM_HEAD_STYLE).setOrigin(0, 0.5);
    this.infoLevel = txt(this, -290, -66, '', { title: true, size: 17, color: '#b6ff5a', strokeThickness: 0, shadow: false, wrap: 400, align: 'left' }).setOrigin(0, 0);
    this.infoDesc = txt(this, -290, -8, '', { size: 18, color: '#e8e4cf', strokeThickness: 0, shadow: false, wrap: 400, align: 'left' }).setOrigin(0, 0);
    this.makeAct(206, 0, ITEM_ACT, CURSE);
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

  /** The action button (a mossy board; `alt` its other colour on this tab), with a price row. */
  private makeAct(x: number, y: number, size: { w: number; h: number }, alt: number): void {
    this.actAlt = alt;
    this.actBtn = new SkinButton(this, x, y, '', () => this.act(), { width: size.w, height: size.h, size: BTN.act, color: MOSS, baked: true, sfx: '' });
    this.actBtn.onDenied = () => this.act();
    this.actCoin = this.add.image(0, 0, COIN).setDisplaySize(32, 32);
    this.actPrice = new ThemeNumber(this, 0, 0, 0, ACT_PRICE_STYLE);
    this.actBtn.add([this.actCoin, this.actPrice]);
  }

  /** The action button: a label, or a price with a coin; `alt` paints it in the tab's other colour. */
  private setAction(label: string | null, price: number | null, enabled: boolean, alt = false): void {
    const b = this.actBtn;
    b.setVisible(label !== null || price !== null);
    b.setColor(alt ? this.actAlt : MOSS);
    b.setText(price !== null ? '' : label ?? '');
    b.fitLabel(b.w - 24);
    this.actCoin.setVisible(price !== null);
    this.actPrice.setVisible(price !== null);
    if (price !== null) {
      this.actPrice.setValue(price);
      const w = this.actPrice.textWidth;
      this.actCoin.setPosition(-(w + 40) / 2 + 16, 0);
      this.actPrice.setX(this.actCoin.x + 22 + w / 2);
    }
    b.setEnabled(enabled);
  }

  private refresh(): void {
    this.coins.setValue(this.meta.coins);
    for (const tl of this.tiles) tl.draw();
    if (this.tab === 'heroes') this.refreshHero();
    else this.refreshItem();
  }

  private refreshHero(): void {
    const h = this.shown, d = HEROES[h], m = this.meta;
    placeLabel(this.heroName, labelTexture(this, t('h_' + h), HEAD_STYLE));
    this.heroName.setScale(Math.min(1, 600 / this.heroName.width));
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
    if (st === 'selected') this.setAction(t('selected'), null, true, true);
    else if (st === 'pick') this.setAction(t('pick'), null, true);
    else this.setAction(null, d.cost, st === 'ok');
  }

  private refreshItem(): void {
    const tl = this.tiles[this.focus];
    if (!tl) return;
    const it = tl.item, m = this.meta;
    placeLabel(this.infoName, labelTexture(this, this.name(it), ITEM_HEAD_STYLE)).setOrigin(0, this.infoName.originY);
    this.infoName.setScale(Math.min(1, 380 / this.infoName.width));
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
    this.infoLevel.setY(this.infoName.y + (this.infoName.height * this.infoName.scaleY) / 2 + 2);
    this.infoDesc.setY(this.infoLevel.y + this.infoLevel.height + 6);
    const st = this.state(it);
    if (it.kind === 'up' && it.id === 'curse') this.setAction(t('curseSet'), null, true, true);
    else if (st === 'max' || st === 'owned') this.setAction(st === 'max' ? t('max') : t('owned'), null, false);
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
