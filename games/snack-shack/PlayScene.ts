// Snack Shack: a 3D time-management cooking arcade. The Play scene runs days of service (rules in
// sim.ts) in a diner drawn by three.js (diner.ts) under a Phaser HUD: a day intro, the rush, the
// day's result card with stars, then the upgrade shop, until too many customers leave angry.
import Phaser from 'phaser';
import {
  ArcadeScene, txt, t, loc, upper, currentGame, popup, isEasy, hudChip, HudChip, HUD_MARGIN, HUD_ROW2_Y, Button, shake, storage, burst,
} from '@core';
import { World3D, THREE } from '@core/three';
import {
  Sim, STATIONS, STATION_DAY, ITEMS, ITEM_DAY, UPGRADES, seeded,
  type StationId, type SimEvent, type Item, type UpgradeId, type Customer,
} from './sim';
import {
  buildRoom, DinerView, stationCentre, slotPos, KITCHEN_ROW, ITEM_MODEL, ITEM_SCALE, TOP, F,
  KITCHEN_Z, PASS_Z,
} from './diner';
import { Fx } from './fx3d';
import { foodMat, furnMat } from './kit';
import { Chef } from './chef';
import { makeThumbs, itemThumb, upgradeThumb } from './thumbs';
import { Bubble, glass, drawStar, chipLabel, UI_DEPTH } from './ui';
import { Bot, SKILL } from './bot';

type Phase = 'intro' | 'play' | 'result' | 'shop';

const UNIT = 0.43 * F;
const HINTS_KEY = 'snack-shack:hints';
const CAM_POS = new THREE.Vector3(0, 10.4, 7.5);
const CAM_LOOK = new THREE.Vector3(0, 0, -1.95);
export const CAMERA = { pos: CAM_POS, look: CAM_LOOK, fov: 46 };

/** Where each station's tap zone sits in the world (a box over its counter top). */
function stationBox(st: StationId): THREE.Box3 {
  const c = stationCentre(st);
  const half = st === 'pass' ? UNIT * 1.5 : UNIT / 2;
  const z0 = (st === 'pass' || st === 'veggie') ? PASS_Z - UNIT : KITCHEN_Z - UNIT;
  const z1 = (st === 'pass' || st === 'veggie') ? PASS_Z : KITCHEN_Z;
  return new THREE.Box3(new THREE.Vector3(c.x - half, TOP - 0.3, z0), new THREE.Vector3(c.x + half, TOP + 0.25, z1));
}

export class PlayScene extends ArcadeScene {
  world!: World3D;
  sim!: Sim;
  phase: Phase = 'intro';
  /** 'easy' | 'normal', exposed for tests. */
  tune: 'easy' | 'normal' = 'normal';
  view!: DinerView;
  private fx!: Fx;
  private chef!: Chef;
  private room: THREE.Group | null = null;
  private roomKey = '';

  // UI
  private bubbles = new Map<number, Bubble>();
  private zones = new Map<StationId, Phaser.Geom.Rectangle>();
  private hl!: Phaser.GameObjects.Graphics;
  private rings!: Phaser.GameObjects.Graphics;
  private stationUi: Phaser.GameObjects.GameObject[] = [];
  private tipChip!: HudChip;
  private clockChip!: HudChip;
  private comboChip!: HudChip;
  private hint!: Phaser.GameObjects.Text;
  private hintQueue: string[] = [];
  private hintT = 0;
  private card: Phaser.GameObjects.GameObject[] = [];
  private cardKeys: (() => void)[] = [];
  private focus = 0;
  private hover: StationId | null = null;
  private cursor: StationId = 'grill';
  private keyboardUsed = false;
  private flashZone: { st: StationId; t: number; bad: boolean } | null = null;
  private shownCombo = 0;
  private ended = false;
  private time3 = 0;
  private camKick = new THREE.Vector3();
  private camIntro = 0;
  private seen = new Set<string>();
  private steamT = 0;
  /** Test hook: an autopilot plays the day (screenshots, balance in the browser). */
  autopilot: Bot | null = null;

  createGame(): void {
    this.tune = isEasy() ? 'easy' : 'normal';
    this.phase = 'intro';
    this.bubbles = new Map();
    this.zones = new Map();
    this.stationUi = [];
    this.hintQueue = [];
    this.hintT = 0;
    this.card = [];
    this.cardKeys = [];
    this.focus = 0;
    this.hover = null;
    this.cursor = 'grill';
    this.keyboardUsed = false;
    this.flashZone = null;
    this.shownCombo = 0;
    this.ended = false;
    this.time3 = 0;
    this.camKick = new THREE.Vector3();
    this.camIntro = 0;
    this.steamT = 0;
    this.room = null;
    this.roomKey = '';
    this.autopilot = null;
    this.seen = new Set(storage.get<string[]>(HINTS_KEY, []));

    // the run's seed: Math.random (the memory check seeds it, so restarts build the same world)
    this.sim = new Sim(this.tune, Math.floor(Math.random() * 1e9));

    this.world = new World3D(this, { fov: CAMERA.fov, near: 0.3, far: 60, background: 0xe9e1d3 });
    const sun = this.world.addLights({ extent: 6.5, dir: [-0.35, 1, 0.55], intensity: 2.1, ambient: 1.7, sky: 0xfff4e6, ground: 0x8a7563 });
    sun.shadow.mapSize.set(1024, 1024);
    sun.target.position.set(0, 0, -0.8);
    sun.position.add(new THREE.Vector3(0, 0, -0.8));
    this.view = new DinerView(this.world.scene);
    this.fx = new Fx(this.world.scene);
    this.chef = new Chef(this.world.scene);
    makeThumbs(this, this.world.renderer);
    this.placeCamera(0);

    // HUD: score, hearts and the day badge from the core; tips, the clock and the combo in chips
    const { width } = this.scale;
    this.tipChip = hudChip(this, HUD_MARGIN, HUD_ROW2_Y, { icon: 'ss-coin', iconSize: 30, text: '0', color: '#ffd23f', minWidth: 104 });
    this.clockChip = hudChip(this, width / 2, HUD_ROW2_Y, { align: 'center', text: '09:00', minWidth: 120 });
    this.comboChip = hudChip(this, width - HUD_MARGIN, HUD_ROW2_Y, { align: 'right', text: '', color: '#ff9a3c', minWidth: 120 }).setVisible(false);
    this.hl = this.add.graphics().setDepth(UI_DEPTH - 60);
    this.rings = this.add.graphics().setDepth(UI_DEPTH - 55);
    this.hint = txt(this, width / 2, 1196, '', { size: 26, color: '#ffffff', strokeThickness: 6, wrap: 660 }).setDepth(UI_DEPTH + 10).setAlpha(0);

    this.setupInput();
    this.startDay();
  }

  // ------------------------------------------------------------------ camera and helpers

  private placeCamera(dt: number): void {
    const cam = this.world.camera;
    this.camKick.multiplyScalar(Math.max(0, 1 - dt * 7));
    const intro = this.camIntro;
    cam.position.copy(CAM_POS).add(new THREE.Vector3(0, intro * 1.6, intro * 1.8)).add(this.camKick);
    const look = CAM_LOOK.clone().add(new THREE.Vector3(this.camKick.x * 0.5, 0, 0));
    cam.lookAt(look);
  }

  /** A small push of the camera (serves, angry customers). */
  private nudge(x: number, y: number, z: number): void {
    this.camKick.add(new THREE.Vector3(x, y, z));
  }

  private screen(v: THREE.Vector3): { x: number; y: number } {
    const p = this.world.toScreen(v);
    return { x: p.x, y: p.y };
  }

  private computeZones(): void {
    this.zones.clear();
    for (const st of STATIONS) {
      const b = stationBox(st);
      let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
      for (const x of [b.min.x, b.max.x]) for (const y of [b.min.y, b.max.y]) for (const z of [b.min.z, b.max.z]) {
        const p = this.screen(new THREE.Vector3(x, y, z));
        x0 = Math.min(x0, p.x); x1 = Math.max(x1, p.x); y0 = Math.min(y0, p.y); y1 = Math.max(y1, p.y);
      }
      this.zones.set(st, new Phaser.Geom.Rectangle(x0, y0, x1 - x0, y1 - y0));
    }
    // the pass and the veggie board share a row: keep their zones apart
    const v = this.zones.get('veggie')!, p = this.zones.get('pass')!;
    if (v.right > p.left) { const mid = (v.right + p.left) / 2; v.width = mid - v.x - 2; p.width = p.right - mid - 2; p.x = mid + 2; }
    // neighbours in the kitchen row split their overlap
    for (let i = 0; i < KITCHEN_ROW.length - 1; i++) {
      const a = this.zones.get(KITCHEN_ROW[i])!, b = this.zones.get(KITCHEN_ROW[i + 1])!;
      if (a.right > b.left) { const mid = (a.right + b.left) / 2; a.width = mid - a.x - 2; b.width = b.right - mid - 2; b.x = mid + 2; }
    }
    // the rows do not overlap either
    const pass = this.zones.get('pass')!;
    for (const st of KITCHEN_ROW) {
      const k = this.zones.get(st)!;
      if (k.top < pass.bottom + 4) { const cut = pass.bottom + 4 - k.top; k.y += cut; k.height -= cut; }
    }
  }

  private stationName(st: StationId): string { return t('s_' + st); }

  /** Station labels: key numbers on desktop, a padlock with the opening day on closed ones. */
  private drawStationUi(): void {
    for (const o of this.stationUi) o.destroy();
    this.stationUi = [];
    const touchOnly = this.sys.game.device.input.touch && !this.keyboardUsed;
    STATIONS.forEach((st, i) => {
      const z = this.zones.get(st)!;
      if (!this.sim.open(st)) {
        const lock = chipLabel(this, z.centerX, z.centerY, t('lockDay', { n: STATION_DAY[st] }), { size: 20, icon: 'ss-lock' });
        this.stationUi.push(lock);
        return;
      }
      if (!touchOnly) this.stationUi.push(chipLabel(this, z.x + 20, z.y + 18, String(i + 1), { size: 18, color: '#ffd23f' }));
    });
  }

  // ------------------------------------------------------------------ days

  private startDay(): void {
    this.sim.startDay();
    this.phase = 'intro';
    for (const b of this.bubbles.values()) b.box.destroy();
    this.bubbles.clear();
    this.view.flights = [];
    this.view.hidden.clear();
    const key = `${this.sim.day >= 5 ? 5 : this.sim.day}:${this.sim.seats}`;
    if (key !== this.roomKey) {
      if (this.room) {
        this.world.scene.remove(this.room);
        // a room is ours to free mid-round: its merged geometry and the sign's canvas texture
        this.room.traverse((o) => {
          const m = o as THREE.Mesh;
          if (!m.isMesh) return;
          m.geometry.dispose();
          const mat = m.material as THREE.Material;
          if (mat !== foodMat() && mat !== furnMat()) { (mat as THREE.MeshBasicMaterial).map?.dispose(); mat.dispose(); }
        });
      }
      this.room = buildRoom(this.world.scene, this.sim.day, this.sim.seats, upper(loc(currentGame().meta.title)));
      this.roomKey = key;
    }
    this.camIntro = 1;
    this.placeCamera(0);
    this.world.camera.updateMatrixWorld();
    // zones are measured from the resting camera
    const save = this.camIntro;
    this.camIntro = 0;
    this.placeCamera(0);
    this.world.camera.updateMatrixWorld();
    this.computeZones();
    this.camIntro = save;
    this.drawStationUi();
    this.hud.setLevel(this.sim.day);
    this.hud.setLives(this.sim.hearts, this.sim.tune.maxHearts);
    this.tipChip.setText(String(this.sim.wallet));
    this.comboChip.setVisible(false);
    this.shownCombo = 0;
    this.showDayIntro();
  }

  private showDayIntro(): void {
    this.clearCard();
    this.hideHint();
    const { width, height } = this.scale;
    const day = this.sim.day;
    const newItems = ITEMS.filter((i) => ITEM_DAY[i] === day);
    const newStations = STATIONS.filter((s) => STATION_DAY[s] === day && day > 1);
    const dim = this.add.rectangle(0, 0, width, height, 0x0b1020, 0.35).setOrigin(0).setDepth(UI_DEPTH);
    const g = glass(this.add.graphics().setDepth(UI_DEPTH + 1), 70, 430, width - 140, newItems.length ? 400 : 260);
    const title = txt(this, width / 2, 500, t('dayN', { n: day }), { title: true, size: 64, color: '#ffd23f', strokeThickness: 8 }).setDepth(UI_DEPTH + 2);
    title.setScale(0.3);
    this.tweens.add({ targets: title, scale: 1, duration: 420, ease: 'Back.easeOut' });
    const objs: Phaser.GameObjects.GameObject[] = [dim, g, title];
    let y = 580;
    if (newItems.length) {
      newItems.forEach((it, i) => {
        const img = this.add.image(width / 2 + (i - (newItems.length - 1) / 2) * 140, y + 60, itemThumb(it)).setDisplaySize(130, 130).setDepth(UI_DEPTH + 2);
        img.setScale(0);
        this.tweens.add({ targets: img, scaleX: 130 / 112, scaleY: 130 / 112, duration: 380, delay: 250 + i * 120, ease: 'Back.easeOut' });
        objs.push(img);
      });
      const names = newItems.map((i) => t('i_' + i)).join(', ');
      objs.push(txt(this, width / 2, y + 150, t('newOnMenu', { name: names }), { size: 30, color: '#ffffff', wrap: width - 180 }).setDepth(UI_DEPTH + 2));
      if (newStations.length) objs.push(txt(this, width / 2, y + 194, t('newStation', { name: newStations.map((s) => this.stationName(s)).join(', ') }), { size: 24, color: '#9fe3ff' }).setDepth(UI_DEPTH + 2));
    } else {
      objs.push(txt(this, width / 2, y + 30, day > 5 ? t('rushDay') : t('goal'), { size: 30, color: '#ffffff' }).setDepth(UI_DEPTH + 2));
    }
    this.card = objs;
    this.sfx('dayStart', { volume: 0.6, exact: true });
    const go = () => {
      if (this.phase !== 'intro' || !this.scene.isActive()) return;
      this.clearCard();
      this.phase = 'play';
      if (day === 1) this.showHint('h_grill');
      if (newItems.includes('fries')) this.showHint('h_fries');
      if (newItems.includes('deluxe')) this.showHint('h_veggie');
      if (newItems.includes('hotdog')) this.showHint('h_dogs');
      if (newItems.includes('icecream')) this.showHint('h_cream');
      if (!this.sys.game.device.input.touch && day === 1) this.showHint('h_keys');
    };
    this.cardKeys = [go];
    this.time.delayedCall(2300, go);
  }

  /** Hides the gameplay hint (cards cover the kitchen). */
  private hideHint(): void {
    this.hintT = 0;
    this.hintQueue = [];
    this.tweens.killTweensOf(this.hint);
    this.hint.setAlpha(0);
  }

  private clearCard(): void {
    for (const o of this.card) o.destroy();
    this.card = [];
    this.cardKeys = [];
  }

  private showResult(): void {
    this.phase = 'result';
    this.clearCard();
    this.hideHint();
    const sim = this.sim;
    const close = sim.closeDay();
    this.hud.setLives(sim.hearts, sim.tune.maxHearts);
    this.hud.setScore(sim.score);
    this.setScore(sim.score);
    this.chef.react('emote-yes');
    const { width, height } = this.scale;
    const D = UI_DEPTH;
    const dim = this.add.rectangle(0, 0, width, height, 0x0b1020, 0.5).setOrigin(0).setDepth(D).setInteractive();
    const g = glass(this.add.graphics().setDepth(D + 1), 60, 300, width - 120, 720);
    const objs: Phaser.GameObjects.GameObject[] = [dim, g];
    objs.push(txt(this, width / 2, 370, t('dayDone', { n: sim.day }), { title: true, size: 48, color: '#ffd23f', strokeThickness: 8 }).setDepth(D + 2));
    const stars = this.add.graphics().setDepth(D + 2);
    objs.push(stars);
    for (let k = 0; k < 3; k++) drawStar(stars, width / 2 + (k - 1) * 110, 480, 44, false);
    for (let k = 0; k < close.stars; k++) {
      this.time.delayedCall(350 + k * 300, () => {
        if (!stars.active) return;
        const s = this.add.graphics().setDepth(D + 3);
        drawStar(s, 0, 0, 44, true);
        s.setPosition(width / 2 + (k - 1) * 110, 480).setScale(2.2).setAlpha(0);
        this.tweens.add({ targets: s, scale: 1, alpha: 1, duration: 320, ease: 'Back.easeOut' });
        this.card.push(s);
        burst(this, width / 2 + (k - 1) * 110, 480, [0xffd23f, 0xffffff], 14, 260);
        this.sfx('star', { rate: 1 + k * 0.12 });
      });
    }
    const rows: [string, string, string?][] = [
      [t('happy'), String(sim.stats.served), '#7dffa0'],
      [t('angry'), String(sim.stats.angry), sim.stats.angry ? '#ff8a7a' : '#ffffff'],
      [t('earned'), String(sim.stats.earned)],
      [t('tipsToday'), '+' + sim.stats.tips, '#ffd23f'],
      [t('starBonus'), '+' + close.bonus, '#ffd23f'],
      [t('bestCombo'), '×' + Math.max(1, sim.bestCombo)],
    ];
    rows.forEach(([a, b, col], i) => {
      const y = 580 + i * 52;
      objs.push(txt(this, 110, y, a, { size: 28, color: '#dfe6f5', strokeThickness: 0, align: 'left' }).setOrigin(0, 0.5).setDepth(D + 2));
      objs.push(txt(this, width - 110, y, b, { size: 30, color: col ?? '#ffffff', strokeThickness: 0, title: true }).setOrigin(1, 0.5).setDepth(D + 2));
    });
    if (close.heart) objs.push(txt(this, width / 2, 900, t('heartBack'), { size: 26, color: '#ff8fb0' }).setDepth(D + 2));
    const btn = new Button(this, width / 2, 965, t('toShop'), () => this.showShop(), { width: 420, height: 92, size: 32, color: 0x2fae5a }).setDepth(D + 3);
    objs.push(btn);
    this.card = objs;
    this.cardKeys = [() => this.showShop()];
    this.sfx('fanfare', { volume: 0.6, exact: true });
    this.tipChip.setText(String(sim.wallet));
  }

  private showShop(): void {
    if (this.phase !== 'result') return;
    this.phase = 'shop';
    this.clearCard();
    this.focus = 0;
    this.renderShop();
    this.showHint('h_shop');
  }

  private renderShop(): void {
    for (const o of this.card) o.destroy();
    this.card = [];
    const sim = this.sim;
    const { width, height } = this.scale;
    const D = UI_DEPTH;
    const dim = this.add.rectangle(0, 0, width, height, 0x0b1020, 0.55).setOrigin(0).setDepth(D).setInteractive();
    const list = sim.shopList();
    const cw = width - 100, ch = 92, gy = 10;
    const top = 290;
    const panelH = 130 + list.length * (ch + gy) + 130;
    const g = glass(this.add.graphics().setDepth(D + 1), 34, top - 120, width - 68, panelH);
    const objs: Phaser.GameObjects.GameObject[] = [dim, g];
    objs.push(txt(this, width / 2, top - 74, t('shopTitle'), { title: true, size: 42, color: '#ffd23f', strokeThickness: 8 }).setDepth(D + 2));
    objs.push(this.add.image(width / 2 - 70, top - 22, 'ss-coin').setDisplaySize(30, 30).setDepth(D + 2));
    objs.push(txt(this, width / 2 - 48, top - 22, `${t('yourTips')}: ${sim.wallet}`, { size: 28, color: '#ffffff', strokeThickness: 0, align: 'left' }).setOrigin(0, 0.5).setDepth(D + 2));
    const actions: (() => void)[] = [];
    list.forEach((id, i) => {
      const x = 50, y = top + 10 + i * (ch + gy);
      const cost = sim.upgradeCost(id);
      const lv = sim.levels[id];
      const max = UPGRADES.find((u) => u.id === id)!.cost.length;
      const can = cost !== null && cost <= sim.wallet;
      const focused = this.focus === i;
      const bg = this.add.graphics().setDepth(D + 2);
      bg.fillStyle(focused ? 0x2b3a63 : 0x1a2340, 0.95).fillRoundedRect(x, y, cw, ch, 20);
      bg.lineStyle(focused ? 4 : 2, focused ? 0xffd23f : 0xffffff, focused ? 1 : 0.25).strokeRoundedRect(x, y, cw, ch, 20);
      objs.push(bg);
      objs.push(this.add.image(x + 52, y + ch / 2, upgradeThumb(id)).setDisplaySize(84, 84).setDepth(D + 3));
      objs.push(txt(this, x + 104, y + 26, t('u_' + id), { size: 25, title: true, color: '#ffffff', strokeThickness: 0, align: 'left' }).setOrigin(0, 0.5).setDepth(D + 3));
      objs.push(txt(this, x + 104, y + 55, t('d_' + id), { size: 20, color: '#c9d3ea', strokeThickness: 0, align: 'left' }).setOrigin(0, 0.5).setDepth(D + 3));
      const pips = this.add.graphics().setDepth(D + 3);
      for (let k = 0; k < max; k++) pips.fillStyle(k < lv ? 0x7dffa0 : 0x3a4560, 1).fillRoundedRect(x + 104 + k * 26, y + 76, 20, 8, 4);
      objs.push(pips);
      const label = cost === null ? t('maxed') : String(cost);
      const pill = this.add.graphics().setDepth(D + 3);
      const pw = 118, px = x + cw - pw - 14, py = y + ch / 2 - 22;
      pill.fillStyle(cost === null ? 0x3a4560 : can ? 0x2fae5a : 0x6a3a3a, 1).fillRoundedRect(px, py, pw, 44, 22);
      objs.push(pill);
      if (cost !== null) objs.push(this.add.image(px + 26, py + 22, 'ss-coin').setDisplaySize(26, 26).setDepth(D + 4));
      objs.push(txt(this, px + pw / 2 + (cost !== null ? 12 : 0), py + 23, label, { size: 24, title: true, strokeThickness: 0, color: '#ffffff' }).setDepth(D + 4));
      if (!this.sys.game.device.input.touch || this.keyboardUsed) objs.push(chipLabel(this, x + 14, y + 14, String(i + 1), { size: 16, color: '#ffd23f' }).setDepth(D + 4));
      const buy = () => this.buy(id, x + cw / 2, y + ch / 2);
      const zone = this.add.zone(x + cw / 2, y + ch / 2, cw, ch).setDepth(D + 5).setInteractive({ useHandCursor: true });
      zone.on('pointerup', buy);
      zone.on('pointerover', (p: Phaser.Input.Pointer) => { if (!p.wasTouch && this.focus !== i) { this.focus = i; this.renderShop(); } });
      objs.push(zone);
      actions.push(buy);
    });
    const by = top + 10 + list.length * (ch + gy) + 62;
    const next = () => this.nextDay();
    if (this.focus === list.length) {
      const ring = this.add.graphics().setDepth(D + 3);
      ring.lineStyle(4, 0xffd23f, 1).strokeRoundedRect(width / 2 - 244, by - 56, 488, 112, 36);
      objs.push(ring);
    }
    objs.push(new Button(this, width / 2, by, t('openDay', { n: sim.day + 1 }), next, { width: 460, height: 96, size: 34, color: 0xec3013 }).setDepth(D + 4));
    actions.push(next);
    this.card = objs;
    this.cardKeys = actions;
  }

  private buy(id: UpgradeId, x: number, y: number): void {
    if (this.phase !== 'shop') return;
    const cost = this.sim.upgradeCost(id);
    if (cost === null) return;
    if (!this.sim.buy(id)) {
      this.sfx('error', { volume: 0.5 });
      popup(this, x, y, t('poor'), '#ff8a7a', 26);
      return;
    }
    this.sfx('buy', { volume: 0.7 });
    burst(this, x, y, [0xffd23f, 0x7dffa0, 0xffffff], 22, 300);
    popup(this, x, y - 30, t('bought'), '#7dffa0', 30);
    this.tipChip.setText(String(this.sim.wallet));
    this.renderShop();
  }

  private nextDay(): void {
    if (this.phase !== 'shop') return;
    this.clearCard();
    this.startDay();
  }

  // ------------------------------------------------------------------ input

  private setupInput(): void {
    this.input.on('pointerup', (p: Phaser.Input.Pointer) => this.tap(p.x, p.y));
    this.input.on('pointermove', (p: Phaser.Input.Pointer) => {
      if (p.wasTouch) return;
      this.hover = this.phase === 'play' ? this.zoneAt(p.x, p.y) : null;
      const overCustomer = this.phase === 'play' && this.customerAt(p.x, p.y);
      this.input.manager.canvas.style.cursor = (this.hover && this.sim.open(this.hover)) || overCustomer ? 'pointer' : 'default';
    });
    const kb = this.input.keyboard;
    if (!kb) return;
    kb.on('keydown', (e: KeyboardEvent) => {
      if (this.isOver) return;
      if (!this.keyboardUsed) { this.keyboardUsed = true; if (this.phase === 'play' || this.phase === 'intro') this.drawStationUi(); }
      const n = Number(e.key);
      if (this.phase === 'play') {
        if (n >= 1 && n <= 7) { this.cursor = STATIONS[n - 1]; this.useStation(STATIONS[n - 1]); return; }
        if (e.key === 'ArrowLeft' || e.key === 'ArrowRight' || e.key === 'ArrowUp' || e.key === 'ArrowDown') { this.moveCursor(e.key); return; }
        if (e.key === 'Enter' || e.key === ' ') { this.useStation(this.cursor); return; }
      } else if (this.phase === 'shop') {
        const n2 = this.cardKeys.length;
        if (n >= 1 && n <= n2 - 1) { this.focus = n - 1; this.cardKeys[n - 1](); return; }
        if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') this.focus = Math.max(0, this.focus - 1);
        else if (e.key === 'ArrowRight' || e.key === 'ArrowDown') this.focus = Math.min(n2 - 1, this.focus + 1);
        else if (e.key === 'Enter' || e.key === ' ') { this.cardKeys[this.focus]?.(); return; }
        else return;
        this.renderShop();
      } else if ((this.phase === 'result' || this.phase === 'intro') && (e.key === 'Enter' || e.key === ' ')) {
        this.cardKeys[0]?.();
      }
    });
  }

  private moveCursor(key: string): void {
    const rows: StationId[][] = [['veggie', 'pass'], KITCHEN_ROW];
    const open = (s: StationId) => this.sim.open(s);
    let r = rows[0].includes(this.cursor) ? 0 : 1;
    let row = rows[r].filter(open);
    let i = row.indexOf(this.cursor);
    if (key === 'ArrowLeft') i = Math.max(0, i - 1);
    else if (key === 'ArrowRight') i = Math.min(row.length - 1, i + 1);
    else {
      const x = this.zones.get(this.cursor)!.centerX;
      r = key === 'ArrowUp' ? 0 : 1;
      row = rows[r].filter(open);
      let best = 0;
      row.forEach((s, k) => { if (Math.abs(this.zones.get(s)!.centerX - x) < Math.abs(this.zones.get(row[best])!.centerX - x)) best = k; });
      i = best;
    }
    this.cursor = row[i] ?? this.cursor;
    this.sfx('move', { volume: 0.3 });
  }

  private zoneAt(x: number, y: number): StationId | null {
    for (const [st, r] of this.zones) if (r.contains(x, y)) return st;
    return null;
  }

  private customerAt(x: number, y: number): Customer | null {
    for (const c of this.sim.customers) {
      if (c.phase !== 'seated') continue;
      const b = this.bubbles.get(c.id);
      if (b?.contains(x, y)) return c;
      const head = this.screen(this.view.headOf(c, this.sim));
      if (Math.abs(x - head.x) < 58 && y > head.y - 30 && y < head.y + 120) return c;
    }
    return null;
  }

  private tap(x: number, y: number): void {
    if (this.isOver) return;
    if (this.phase === 'intro') { this.cardKeys[0]?.(); return; }
    if (this.phase !== 'play') return;
    const c = this.customerAt(x, y);
    if (c) { this.serveCustomer(c); return; }
    const st = this.zoneAt(x, y);
    if (st) { this.cursor = st; this.useStation(st); }
  }

  private serveCustomer(c: Customer): void {
    if (!this.sim.serveCustomer(c.id)) return;
    this.showHint('h_customer');
  }

  private useStation(st: StationId): void {
    if (this.phase !== 'play') return;
    if (!this.sim.open(st)) {
      this.sfx('error', { volume: 0.4 });
      const z = this.zones.get(st)!;
      popup(this, z.centerX, z.y, t('lockDay', { n: STATION_DAY[st] }), '#ffb0a0', 24);
      return;
    }
    const ok = this.sim.act(st);
    this.flashZone = { st, t: 0.25, bad: !ok };
    const c = stationCentre(st);
    const kitchen = KITCHEN_ROW.includes(st);
    if (ok) this.chef.goTo(c.x, kitchen ? 1 : -1, kitchen ? 'interact-right' : 'pick-up');
  }

  // ------------------------------------------------------------------ hints

  private showHint(key: string): void {
    if (this.seen.has(key) || this.hintQueue.includes(key)) return;
    if (this.hintT > 0) { this.hintQueue.push(key); return; }
    this.displayHint(key);
  }

  private displayHint(key: string): void {
    this.seen.add(key);
    storage.set(HINTS_KEY, [...this.seen]);
    this.hint.setText(t(key)).setAlpha(0).setScale(0.9);
    this.tweens.killTweensOf(this.hint);
    this.tweens.add({ targets: this.hint, alpha: 1, scale: 1, duration: 260, ease: 'Back.easeOut' });
    this.hintT = 4.2;
  }

  private stepHint(dt: number): void {
    if (this.hintT <= 0) return;
    this.hintT -= dt;
    if (this.hintT <= 0) {
      this.tweens.add({ targets: this.hint, alpha: 0, duration: 260 });
      const next = this.hintQueue.shift();
      if (next) this.time.delayedCall(320, () => { if (this.scene.isActive()) this.displayHint(next); });
    }
  }

  // ------------------------------------------------------------------ the loop

  updateGame(_time: number, delta: number): void {
    const dt = delta / 1000;
    this.time3 += dt;
    if (this.phase === 'play') {
      this.autopilot?.update(dt);
      this.sim.update(dt);
      this.handleEvents(this.sim.events);
      this.sim.events.length = 0;
      if (this.sim.over && !this.ended) this.lose();
    }
    this.camIntro = Math.max(0, this.camIntro - dt * 1.2);
    this.placeCamera(dt);
    this.chef.update(dt);
    this.view.update(dt, this.sim);
    this.ambient(dt);
    this.fx.update(dt);
    this.drawOverlays(dt);
    this.stepHint(dt);
    this.updateHud();
  }

  /** Steam over hot food and the fryer, now and then. */
  private ambient(dt: number): void {
    this.steamT -= dt;
    if (this.steamT > 0) return;
    this.steamT = 0.12;
    const sim = this.sim;
    sim.grill.forEach((s, i) => {
      if (i >= sim.grillSlots) return;
      const p = slotPos('grill', i);
      if (s.s === 'cook' && Math.random() < 0.7) { this.fx.puff(p.x, TOP + 0.08, p.z, 0xffffff, 1, { size: 0.045, life: 0.8 }); this.fx.spark(p.x, TOP + 0.06, p.z, 0xffe38a, 1, 0.8, 1.4); }
      if (s.s === 'burnt' && Math.random() < 0.8) this.fx.puff(p.x, TOP + 0.08, p.z, 0x3a3a3a, 1, { size: 0.07, life: 1.1, up: 1.2 });
      if (s.s === 'done' && s.t > sim.burnTime * 0.6 && Math.random() < 0.5) this.fx.puff(p.x, TOP + 0.08, p.z, 0x8a8a8a, 1, { size: 0.05 });
    });
    if (sim.open('dogs')) sim.dogs.forEach((s, i) => {
      const p = slotPos('dogs', i);
      if (s.s === 'cook' && Math.random() < 0.5) this.fx.puff(p.x, TOP + 0.06, p.z, 0xffffff, 1, { size: 0.04 });
      if (s.s === 'burnt' && Math.random() < 0.8) this.fx.puff(p.x, TOP + 0.08, p.z, 0x3a3a3a, 1, { size: 0.06, life: 1.1 });
    });
    if (sim.open('fryer') && sim.fryer.s === 'fry') {
      const c = stationCentre('fryer');
      this.fx.puff(c.x + (Math.random() - 0.5) * 0.3, TOP + 0.3, c.z - 0.1, 0xffffff, 1, { size: 0.06, life: 0.9 });
      if (Math.random() < 0.6) this.fx.spark(c.x, TOP + 0.3, c.z - 0.1, 0xffd27a, 1, 0.9, 1.6);
    }
  }

  private drawOverlays(dt: number): void {
    const g = this.hl;
    g.clear();
    if (this.flashZone) this.flashZone.t -= dt;
    if (this.flashZone && this.flashZone.t <= 0) this.flashZone = null;
    if (this.phase === 'play') {
      const pulse = 0.5 + 0.5 * Math.sin(this.time3 * 6);
      const outline = (st: StationId, color: number, alpha: number, w = 4) => {
        const r = this.zones.get(st);
        if (!r) return;
        g.lineStyle(w, color, alpha).strokeRoundedRect(r.x, r.y, r.width, r.height, 18);
      };
      if (this.hover && this.sim.open(this.hover)) {
        const r = this.zones.get(this.hover)!;
        g.fillStyle(0xffffff, 0.1).fillRoundedRect(r.x, r.y, r.width, r.height, 18);
        outline(this.hover, 0xffffff, 0.85);
      }
      if (this.keyboardUsed) outline(this.cursor, 0xffd23f, 0.6 + 0.4 * pulse, 5);
      if (this.flashZone) outline(this.flashZone.st, this.flashZone.bad ? 0xff5a4a : 0x7dffa0, this.flashZone.t * 4, 6);
      // a gentle pulse on the station of the current first-time hint
      if (!this.seen.has('h_done') && this.sim.day === 1 && this.sim.grill.every((s) => s.s === 'empty') && this.sim.plates.every((p) => !p)) outline('grill', 0xffd23f, 0.4 + 0.5 * pulse, 5);
    }
    // progress rings over cooking food
    const r = this.rings;
    r.clear();
    if (this.phase !== 'play' && this.phase !== 'intro') return;
    const sim = this.sim;
    const ring = (v: THREE.Vector3, u: number, color: number, rad = 17) => {
      const p = this.screen(v);
      r.fillStyle(0x0b1020, 0.55).fillCircle(p.x, p.y, rad + 4);
      r.lineStyle(6, color, 1).beginPath();
      r.arc(p.x, p.y, rad, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * Math.min(1, u), false);
      r.strokePath();
    };
    const cookRings = (slots: typeof sim.grill, n: number, st: StationId, cookT: number) => {
      for (let i = 0; i < n; i++) {
        const s = slots[i];
        const p = slotPos(st, i).clone().setY(TOP + 0.3);
        if (s.s === 'cook') ring(p, s.t / cookT, 0xfff3c4);
        else if (s.s === 'done') {
          const k = s.t / sim.burnTime;
          ring(p, 1 - k, k > 0.6 ? (Math.sin(this.time3 * 18) > 0 ? 0xff5a4a : 0xffd23f) : 0x7dffa0);
        }
      }
    };
    if (sim.open('grill')) cookRings(sim.grill, sim.grillSlots, 'grill', sim.cookTime);
    if (sim.open('dogs')) cookRings(sim.dogs, sim.dogSlots, 'dogs', sim.dogTime);
    sim.soda.forEach((s, i) => { if (s.s === 'fill') ring(slotPos('soda', i).clone().setY(TOP + 0.55), s.t / sim.fillTime, 0x9fe3ff, 14); });
    if (sim.open('cream')) sim.cream.forEach((s, i) => { if (s.s === 'fill') ring(slotPos('cream', i).clone().setY(TOP + 0.5), s.t / sim.creamTime, 0xffc0e0, 14); });
    if (sim.open('fryer') && sim.fryer.s === 'fry') ring(stationCentre('fryer').clone().setY(TOP + 0.6), sim.fryer.t / sim.fryTime, 0xffd27a);
    // customers' bubbles follow their heads
    for (const c of sim.customers) {
      const b = this.bubbles.get(c.id);
      if (!b) continue;
      const head = this.screen(this.view.headOf(c, sim));
      const stagger = c.seat >= 0 && sim.seats >= 4 && c.seat % 2 ? -26 : 0;
      b.update(c, head.x, head.y - 22 + stagger, this.time3);
    }
  }

  private updateHud(): void {
    const sim = this.sim;
    const minutes = Math.min(1, sim.clock / sim.dayLen) * 8 * 60;
    const hh = 9 + Math.floor(minutes / 60), mm = Math.floor(minutes % 60 / 10) * 10;
    this.clockChip.setText(sim.state === 'open' ? `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}` : t('closed'));
    this.clockChip.setTextColor(sim.state === 'open' ? (sim.clock > sim.dayLen - 10 ? '#ffb070' : '#ffffff') : '#ff8a7a');
    if (sim.combo >= 2 && this.phase === 'play') {
      if (this.shownCombo !== sim.combo) {
        this.shownCombo = sim.combo;
        this.comboChip.setText(t('combo', { n: sim.combo })).setVisible(true);
        this.comboChip.setScale(1.3);
        this.tweens.add({ targets: this.comboChip, scale: 1, duration: 260, ease: 'Back.easeOut' });
      }
    } else if (this.shownCombo) {
      this.shownCombo = 0;
      this.comboChip.setVisible(false);
    }
  }

  // ------------------------------------------------------------------ events → juice

  private handleEvents(events: SimEvent[]): void {
    for (const ev of events) {
      switch (ev.type) {
        case 'place': this.onPlace(ev.at.st, ev.at.slot); break;
        case 'ready': this.onReady(ev.at.st, ev.at.slot); break;
        case 'burnt': {
          const p = slotPos(ev.at.st, ev.at.slot);
          this.fx.puff(p.x, TOP + 0.1, p.z, 0x2a2a2a, 10, { size: 0.08, up: 1.4, life: 1.2 });
          this.sfxAt('burnt', this.screen(p).x, { volume: 0.6 });
          const s = this.screen(p.clone().setY(TOP + 0.4));
          popup(this, s.x, s.y, t('burnt'), '#ff8a7a', 26);
          this.showHint('h_burnt');
          break;
        }
        case 'trash': {
          const from = slotPos(ev.at.st, ev.at.slot).clone().setY(TOP + 0.05);
          const bin = new THREE.Vector3(-3 * UNIT - 0.35 + 0.2, 0.8, PASS_Z - 0.3);
          const model = ev.item ? ITEM_MODEL[ev.item] : ev.at.st === 'dogs' ? 'meat-sausage' : 'meat-patty';
          this.view.fly(model, ev.item ? ITEM_SCALE[ev.item] : 0.95, from, bin, { dur: 0.45, arc: 1.2, tint: ev.item ? undefined : new THREE.Color(0.22, 0.19, 0.17), onLand: () => {
            this.fx.puff(bin.x, bin.y, bin.z, 0x555555, 5, { size: 0.06 });
            this.sfx('trash', { volume: 0.5 });
          } });
          if (ev.item) this.showHint('h_trash');
          const s = this.screen(from);
          popup(this, s.x, s.y - 30, t('binned'), '#c9d3ea', 22);
          break;
        }
        case 'plate': {
          const from = slotPos(ev.from.st, ev.from.slot).clone().setY(TOP + 0.05);
          const to = slotPos('pass', ev.to).clone().setY(TOP + 0.05);
          this.view.fly(ITEM_MODEL[ev.item], ITEM_SCALE[ev.item], from, to, { dur: 0.4, arc: 0.9, hide: 'pass' + ev.to, onLand: () => {
            this.fx.puff(to.x, TOP + 0.08, to.z, 0xffffff, 4, { size: 0.04, speed: 0.8, up: 0.4 });
            this.sfxAt('plop', this.screen(to).x, { volume: 0.6 });
          } });
          this.sfxAt('whoosh', this.screen(from).x, { volume: 0.35 });
          if (ev.item === 'burger') this.showHint('h_serve');
          break;
        }
        case 'veggie': {
          const from = stationCentre('veggie').clone().setY(TOP + 0.1);
          const to = slotPos('pass', ev.to).clone().setY(TOP + 0.1);
          this.view.fly('cabbage', 0.45, from, to, { dur: 0.32, arc: 0.6, onLand: () => this.view.pop({ st: 'pass', slot: ev.to }) });
          this.view.fly('tomato', 0.6, from.clone().add(new THREE.Vector3(0.15, 0, 0.1)), to, { dur: 0.38, arc: 0.7, onLand: () => {
            this.fx.spark(to.x, TOP + 0.2, to.z, 0x7dff8a, 8, 1.2, 1.6);
            this.sfx('veggie', { volume: 0.5 });
          } });
          break;
        }
        case 'serve': this.onServe(ev.item, ev.from.st, ev.from.slot, ev.c); break;
        case 'pay': this.onPay(ev.c, ev.base, ev.tip, ev.combo); break;
        case 'angry': this.onAngry(ev.c); break;
        case 'heart': this.hud.setLives(Math.max(0, ev.hearts), this.sim.tune.maxHearts); break;
        case 'arrive': {
          this.sfx('door', { volume: 0.35 });
          if (ev.c.seat < 0) this.showHint('h_queue');
          break;
        }
        case 'seat': {
          const b = new Bubble(this, ev.c);
          this.bubbles.set(ev.c.id, b);
          b.show();
          this.sfx('order', { volume: 0.4 });
          if (this.sim.stats.customers >= 2) this.showHint('h_patience');
          break;
        }
        case 'error': {
          const z = this.zones.get(ev.st);
          if (z) popup(this, z.centerX, z.y + 10, t('e_' + ev.reason), '#ffb0a0', 24);
          this.sfx('error', { volume: 0.35 });
          break;
        }
        case 'closing': this.banner(t('closing'), '#ffb070'); break;
        case 'dayDone': this.time.delayedCall(700, () => { if (this.phase === 'play' && !this.isOver) this.showResult(); }); break;
      }
    }
  }

  private onPlace(st: StationId, slot: number): void {
    const p = st === 'fryer' ? stationCentre('fryer') : slotPos(st, slot);
    this.view.pop({ st, slot });
    const sx = this.screen(p).x;
    if (st === 'grill' || st === 'dogs') {
      this.fx.spark(p.x, TOP + 0.05, p.z, 0xffe38a, 7, 1.2, 1.8);
      this.fx.puff(p.x, TOP + 0.05, p.z, 0xffffff, 3, { size: 0.05 });
      this.sfxAt('sizzle', sx, { volume: 0.45 });
      this.sfxAt('plop', sx, { volume: 0.4 });
    } else if (st === 'fryer') {
      this.fx.spark(p.x, TOP + 0.3, p.z - 0.1, 0xffd27a, 12, 1.4, 2);
      this.sfxAt('sizzle', sx, { volume: 0.55, rate: 1.2 });
    } else {
      this.sfxAt('pour', sx, { volume: 0.4 });
      if (st === 'soda') this.showHint('h_soda');
    }
  }

  private onReady(st: StationId, slot: number): void {
    const p = st === 'fryer' ? slotPos('fryer', Math.max(0, this.sim.tray - 1)) : slotPos(st, slot);
    this.fx.spark(p.x, TOP + 0.2, p.z, 0xfff6b0, 6, 0.9, 2);
    this.fx.ring(p.x, TOP + 0.02, p.z, 0x7dffa0, 0.3);
    this.view.pop({ st, slot });
    this.sfxAt('ding', this.screen(p).x, { volume: 0.35 });
    if (st === 'grill') this.showHint('h_done');
  }

  private onServe(item: Item, st: StationId, slot: number, c: Customer): void {
    const from = (st === 'fryer' ? slotPos('fryer', slot) : slotPos(st, slot)).clone().setY(TOP + 0.1);
    const head = this.view.headOf(c, this.sim).clone().add(new THREE.Vector3(0, -0.45, 0.35));
    this.view.fly(ITEM_MODEL[item], ITEM_SCALE[item], from, head, { dur: 0.5, arc: 1.3, onLand: () => {
      this.fx.spark(head.x, head.y + 0.2, head.z, 0xffffff, 8, 1.2, 1.8);
      this.sfx('serve', { volume: 0.5 });
    } });
    this.sfxAt('whoosh', this.screen(from).x, { volume: 0.4 });
    const kitchen = KITCHEN_ROW.includes(st);
    this.chef.goTo(stationCentre(st).x, kitchen ? 1 : -1, kitchen ? 'interact-right' : 'pick-up');
  }

  private onPay(c: Customer, base: number, tip: number, combo: number): void {
    const headV = this.view.headOf(c, this.sim);
    const head = this.screen(headV);
    const b = this.bubbles.get(c.id);
    if (b) { this.bubbles.delete(c.id); this.time.delayedCall(420, () => b.leave(true)); }
    this.time.delayedCall(450, () => {
      if (!this.scene.isActive()) return;
      this.setScore(this.sim.score);
      popup(this, head.x, head.y - 60, '+' + (base + tip), '#ffd23f', 34);
      if (tip > 0) popup(this, head.x, head.y - 14, t('tipPop', { n: tip }), '#7dffa0', 24);
      this.flyCoins(head.x, head.y, Math.min(8, 2 + Math.round(tip / 3)));
      this.fx.spark(headV.x, headV.y + 0.2, headV.z, 0xffd23f, 14, 1.6, 2.2);
      this.fx.ring(headV.x, 0.05, headV.z, 0xffd23f, 0.7, 0.5);
      this.sfx(tip >= 8 ? 'coins' : 'coin', { volume: 0.6 });
      this.nudge(0, -0.06, -0.08);
      if (combo >= 2) {
        popup(this, this.scale.width / 2, 300, t('comboPop', { n: combo }), '#ff9a3c', 40);
        this.sfx('combo', { rate: Math.min(1.6, 1 + (combo - 2) * 0.1) });
        this.showHint('h_combo');
      }
      if (c.patience / c.max > 0.75) popup(this, head.x, head.y - 100, t('fast'), '#9fe3ff', 24);
    });
  }

  /** Coins fly from a customer to the tips chip, which counts up as they land. */
  private flyCoins(x: number, y: number, n: number): void {
    const target = { x: this.tipChip.left + 22, y: HUD_ROW2_Y };
    for (let i = 0; i < n; i++) {
      const coin = this.add.image(x + (Math.random() - 0.5) * 40, y + (Math.random() - 0.5) * 30, 'ss-coin').setDisplaySize(30, 30).setDepth(UI_DEPTH + 5);
      this.tweens.add({
        targets: coin, x: target.x, y: target.y, duration: 520 + i * 60, delay: i * 50, ease: 'Cubic.easeIn',
        onComplete: () => {
          coin.destroy();
          if (i === n - 1) {
            this.tipChip.setText(String(this.sim.wallet));
            this.tipChip.setScale(1.18);
            this.tweens.add({ targets: this.tipChip, scale: 1, duration: 200, ease: 'Back.easeOut' });
          }
        },
      });
    }
  }

  private onAngry(c: Customer): void {
    const headV = this.view.headOf(c, this.sim);
    const head = this.screen(headV);
    const b = this.bubbles.get(c.id);
    if (b) { this.bubbles.delete(c.id); b.leave(false); }
    popup(this, head.x, head.y - 50, t('angryPop'), '#ff6a5a', 30);
    this.fx.puff(headV.x, headV.y + 0.1, headV.z, 0xff4a3a, 10, { size: 0.07, up: 1.4, speed: 0.6 });
    this.sfx('angry', { volume: 0.7 });
    shake(this, 0.008, 220);
    this.nudge((Math.random() - 0.5) * 0.2, 0.12, 0.1);
    if (c.seat >= 0 && Math.random() < 0.5) this.chef.react('emote-no');
  }

  private banner(s: string, color: string): void {
    const { width } = this.scale;
    const b = txt(this, width / 2, 260, s, { title: true, size: 34, color, strokeThickness: 8, wrap: 640 }).setDepth(UI_DEPTH + 10).setScale(0.4);
    this.tweens.add({ targets: b, scale: 1, duration: 300, ease: 'Back.easeOut' });
    this.tweens.add({ targets: b, alpha: 0, y: 230, delay: 1800, duration: 400, onComplete: () => b.destroy() });
  }

  // ------------------------------------------------------------------ the end

  private lose(): void {
    this.ended = true;
    this.hideHint();
    this.banner(t('daysServed', { n: this.sim.day }), '#ffd23f');
    this.chef.react('emote-no');
    shake(this, 0.014, 400);
    this.sfx('lose', { volume: 0.7, exact: true });
    this.setScore(this.sim.score);
    this.endGame({ title: t('shutDown'), delay: 1300 });
  }

  /** Rewarded continue (src/core/ads.ts): two hearts back and calmer customers. */
  revive(): void {
    this.sim.revive();
    this.ended = false;
    this.phase = 'play';
    this.hud.setLives(this.sim.hearts, this.sim.tune.maxHearts);
    this.banner(t('revived'), '#7dffa0');
  }

  // ------------------------------------------------------------------ test hooks

  /** Jumps to the start of day `n` with the bot's upgrades (screenshots). */
  testDay(n: number, opts: { wallet?: number; seats?: number } = {}): void {
    const bot = new Bot(this.sim, undefined, seeded(9));
    while (this.sim.day < n - 1) {
      this.sim.update(0);
      this.sim.closeDay();
      this.sim.wallet += 120;
      bot.shop();
      this.sim.startDay();
    }
    if (opts.wallet !== undefined) this.sim.wallet = opts.wallet;
    if (opts.seats !== undefined) this.sim.levels.seat = Math.max(0, Math.min(2, opts.seats - 3));
    this.phase = 'shop';
    this.nextDay();
  }

  /** Runs the simulation forward with the autopilot (headless screenshots of a busy rush). */
  fastForward(seconds: number, auto = true, skill: keyof typeof SKILL = 'good'): void {
    if (auto) this.autopilot ??= new Bot(this.sim, SKILL[skill], seeded(4));
    if (this.phase === 'intro') { this.cardKeys[0]?.(); }
    const step = 1 / 30;
    for (let s = 0; s < seconds && this.phase === 'play'; s += step) {
      if (auto) this.autopilot?.update(step);
      this.sim.update(step);
      this.handleEvents(this.sim.events);
      this.sim.events.length = 0;
      this.view.update(step, this.sim);
      this.fx.update(step);
      this.chef.update(step);
      if (this.sim.over) break;
    }
  }

  /** Ends camera moves at once (screenshots: headless frames are slow). */
  settle(): void {
    this.camIntro = 0;
    this.camKick.set(0, 0, 0);
  }

  /** Draw calls of the last rendered frame. */
  drawCalls(): number { return this.world.renderer.info.render.calls; }
}

