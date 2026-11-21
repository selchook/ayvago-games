// Street Heat: the driving HUD, every readout in its own themed chip (theme.ts HUD_SKIN through the
// core's hudChip): the heat stars, the speedometer, the damage bar, nitro charges, the job's clock,
// a meter for fragile cargo, the passenger's calm, suspicion or the escorted SUV, and the minimap
// (heading up, GPS route, markers, police blips, the search circle). Plus what floats over the
// streets: the target's diamond with its distance, arrows at the screen edge for targets off
// screen, the busted ring and the nitro streaks. Icons are painted on canvases once per game.
import Phaser from 'phaser';
import { hudChip, HudChip, HUD_ROW2_Y, HUD_MARGIN, hudRightEdge, t } from '@core';
import { city, SIZE, PITCH, NB, halfWidth, type Block } from './city';
import { MARKER_COLOR } from './view';
import { clamp, KMH, mmss } from './defs';
import type { Sim } from './sim';
import type { Job } from './jobs';
import { ORANGE, CYAN, PINK } from './theme';

export const UI_DEPTH = 9300;

function tex(scene: Phaser.Scene, key: string, w: number, h: number, draw: (g: CanvasRenderingContext2D) => void): string {
  if (scene.textures.exists(key)) return key;
  const cv = document.createElement('canvas');
  cv.width = w; cv.height = h;
  draw(cv.getContext('2d')!);
  scene.textures.addCanvas(key, cv);
  return key;
}

function star(g: CanvasRenderingContext2D, x: number, y: number, r: number): void {
  g.beginPath();
  for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, rr = i % 2 ? r * 0.45 : r; g.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr); }
  g.closePath();
}

/** The HUD's icons (canvas textures, once per game). */
export function makeIcons(scene: Phaser.Scene): void {
  tex(scene, 'sh-star-on', 40, 40, (g) => { g.shadowColor = '#ff9a2a'; g.shadowBlur = 8; star(g, 20, 21, 15); const gr = g.createLinearGradient(0, 6, 0, 36); gr.addColorStop(0, '#fff3a0'); gr.addColorStop(1, '#ff8a1e'); g.fillStyle = gr; g.fill(); g.shadowBlur = 0; g.lineWidth = 2; g.strokeStyle = '#3a1406'; g.stroke(); });
  tex(scene, 'sh-star-off', 40, 40, (g) => { star(g, 20, 21, 14); g.fillStyle = 'rgba(80,60,120,0.55)'; g.fill(); g.lineWidth = 1.5; g.strokeStyle = 'rgba(200,180,255,0.35)'; g.stroke(); });
  tex(scene, 'sh-star-hot', 40, 40, (g) => { g.shadowColor = '#ff2040'; g.shadowBlur = 10; star(g, 20, 21, 15); g.fillStyle = '#ff4060'; g.fill(); g.shadowBlur = 0; g.lineWidth = 2; g.strokeStyle = '#3a0612'; g.stroke(); });
  tex(scene, 'sh-wrench', 40, 40, (g) => { g.translate(20, 20); g.rotate(-0.8); g.fillStyle = '#fff4e2'; g.fillRect(-3.5, -4, 7, 18); g.beginPath(); g.arc(0, -8, 8, 0, Math.PI * 2); g.fill(); g.globalCompositeOperation = 'destination-out'; g.fillRect(-3, -18, 6, 10); });
  tex(scene, 'sh-bolt', 40, 40, (g) => { g.fillStyle = '#7ff6ff'; g.shadowColor = '#3ef2ff'; g.shadowBlur = 6; g.beginPath(); g.moveTo(23, 3); g.lineTo(9, 22); g.lineTo(19, 22); g.lineTo(15, 37); g.lineTo(31, 16); g.lineTo(21, 16); g.closePath(); g.fill(); });
  tex(scene, 'sh-clock', 40, 40, (g) => { g.strokeStyle = '#fff4e2'; g.lineWidth = 4; g.beginPath(); g.arc(20, 21, 14, 0, Math.PI * 2); g.stroke(); g.beginPath(); g.moveTo(20, 21); g.lineTo(20, 12); g.moveTo(20, 21); g.lineTo(27, 25); g.stroke(); });
  tex(scene, 'sh-box', 40, 40, (g) => { g.fillStyle = '#ffd08a'; g.fillRect(7, 11, 26, 22); g.fillStyle = '#b07a42'; g.fillRect(18, 11, 4, 22); g.strokeStyle = '#3a2410'; g.lineWidth = 2; g.strokeRect(7, 11, 26, 22); });
  tex(scene, 'sh-eye', 40, 40, (g) => { g.fillStyle = '#fff4e2'; g.beginPath(); g.ellipse(20, 20, 16, 9, 0, 0, Math.PI * 2); g.fill(); g.fillStyle = '#1a0b2e'; g.beginPath(); g.arc(20, 20, 6, 0, Math.PI * 2); g.fill(); });
  tex(scene, 'sh-diamond', 48, 48, (g) => { g.shadowColor = '#fff'; g.shadowBlur = 6; g.fillStyle = '#ffffff'; g.beginPath(); g.moveTo(24, 4); g.lineTo(40, 24); g.lineTo(24, 44); g.lineTo(8, 24); g.closePath(); g.fill(); });
  tex(scene, 'sh-arrow', 48, 48, (g) => { g.shadowColor = '#000'; g.shadowBlur = 4; g.fillStyle = '#ffffff'; g.beginPath(); g.moveTo(44, 24); g.lineTo(10, 6); g.lineTo(18, 24); g.lineTo(10, 42); g.closePath(); g.fill(); });
  tex(scene, 'sh-streak', 8, 64, (g) => { const gr = g.createLinearGradient(0, 0, 0, 64); gr.addColorStop(0, 'rgba(255,255,255,0)'); gr.addColorStop(0.5, 'rgba(200,240,255,0.9)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(2, 0, 4, 64); });
  tex(scene, 'sh-cam', 48, 48, (g) => { g.fillStyle = '#fff4e2'; g.beginPath(); g.roundRect(6, 14, 30, 22, 4); g.fill(); g.beginPath(); g.moveTo(36, 22); g.lineTo(44, 16); g.lineTo(44, 34); g.lineTo(36, 28); g.closePath(); g.fill(); g.fillStyle = '#1a0b2e'; g.beginPath(); g.arc(21, 25, 6, 0, Math.PI * 2); g.fill(); });
  tex(scene, 'sh-mapicon', 48, 48, (g) => { g.fillStyle = '#fff4e2'; g.beginPath(); g.moveTo(6, 12); g.lineTo(18, 8); g.lineTo(30, 12); g.lineTo(42, 8); g.lineTo(42, 38); g.lineTo(30, 42); g.lineTo(18, 38); g.lineTo(6, 42); g.closePath(); g.fill(); g.strokeStyle = '#1a0b2e'; g.lineWidth = 2; g.beginPath(); g.moveTo(18, 8); g.lineTo(18, 38); g.moveTo(30, 12); g.lineTo(30, 42); g.stroke(); });
  tex(scene, 'sh-lock', 40, 40, (g) => { g.strokeStyle = '#8a7aa8'; g.lineWidth = 4; g.beginPath(); g.arc(20, 16, 8, Math.PI, 0); g.stroke(); g.fillStyle = '#8a7aa8'; g.fillRect(9, 16, 22, 17); });
  makeMapTexture(scene);
}

// ------------------------------------------------------------------ the city map (one texture)

export const MAP_PX = 640;
/** World → map texture px: the city plus a margin. */
export const MAP_MARGIN = 40;
export const mapK = MAP_PX / (SIZE + MAP_MARGIN * 2);
export const toMap = (v: number): number => (v + MAP_MARGIN) * mapK;

function makeMapTexture(scene: Phaser.Scene): void {
  tex(scene, 'sh-mapbase', MAP_PX, MAP_PX, (g) => {
    const c = city();
    g.fillStyle = '#120a22'; g.fillRect(0, 0, MAP_PX, MAP_PX);
    // the river
    g.fillStyle = '#0d2a4a'; g.fillRect(0, toMap(SIZE + halfWidth(0) + 3.6), MAP_PX, MAP_PX);
    // streets
    g.strokeStyle = '#5a5070'; g.lineCap = 'butt';
    for (const e of c.edges) {
      const a = c.nodes[e.a], b = c.nodes[e.b];
      g.lineWidth = halfWidth(e.line) * 2 * mapK;
      g.beginPath(); g.moveTo(toMap(a.x), toMap(a.z)); g.lineTo(toMap(b.x), toMap(b.z)); g.stroke();
    }
    // blocks
    const fill = (b: Block) => b.type === 'P' ? '#1f4a2a' : b.type === 'L' || b.type === 'K' ? '#2a2638' : b.type === 'S' ? '#4a3a2a' : b.type === 'X' ? '#3a3050' : '#24183a';
    for (const b of c.blocks) {
      const r = b.inner;
      g.fillStyle = fill(b);
      g.fillRect(toMap(r.x0 - 1), toMap(r.z0 - 1), (r.x1 - r.x0 + 2) * mapK, (r.z1 - r.z0 + 2) * mapK);
      if (b.alley) { g.fillStyle = '#3a3050'; g.fillRect(toMap(b.alley.x0), toMap(b.inner.z0), (b.alley.x1 - b.alley.x0) * mapK, (b.inner.z1 - b.inner.z0) * mapK); }
    }
    // avenues brighter
    g.strokeStyle = 'rgba(255,170,90,0.35)';
    for (const e of c.edges) {
      if (e.lanes < 2) continue;
      const a = c.nodes[e.a], b = c.nodes[e.b];
      g.lineWidth = 1.5;
      g.beginPath(); g.moveTo(toMap(a.x), toMap(a.z)); g.lineTo(toMap(b.x), toMap(b.z)); g.stroke();
    }
    void PITCH; void NB;
  });
}

// ------------------------------------------------------------------ the minimap

export class MiniMap {
  readonly box: Phaser.GameObjects.Container;
  /** The heading-up map, drawn into one texture kept across rounds (a new framebuffer on every
   *  round stalls the GPU queue while the city is uploading). */
  private rt: Phaser.Textures.DynamicTexture;
  private img: Phaser.GameObjects.Image;
  private g: Phaser.GameObjects.Graphics;
  private frame: Phaser.GameObjects.Graphics;
  readonly size: number;
  private tick = 0;
  /** Metres per minimap pixel ÷ zoom. */
  private zoom = 0.75;

  constructor(private scene: Phaser.Scene, x: number, y: number, size = 188, onTap?: () => void) {
    this.size = size;
    const inner = size - 16;
    this.frame = scene.add.graphics();
    const r = 18;
    this.frame.fillStyle(0x0a0614, 0.86).fillRoundedRect(-size / 2, -size / 2, size, size, r);
    this.frame.lineStyle(6, ORANGE, 0.25).strokeRoundedRect(-size / 2 + 2, -size / 2 + 2, size - 4, size - 4, r - 2);
    this.frame.lineStyle(2.5, ORANGE, 0.95).strokeRoundedRect(-size / 2 + 2, -size / 2 + 2, size - 4, size - 4, r - 2);
    this.frame.lineStyle(1, 0xffe0b0, 0.9).strokeRoundedRect(-size / 2 + 2, -size / 2 + 2, size - 4, size - 4, r - 2);
    const key = `sh-minimap-${inner}`;
    this.rt = scene.textures.exists(key) ? (scene.textures.get(key) as Phaser.Textures.DynamicTexture) : scene.textures.addDynamicTexture(key, inner, inner)!;
    const view = scene.add.image(0, 0, key);
    this.img = scene.make.image({ key: 'sh-mapbase', add: false });
    this.g = scene.add.graphics();
    this.box = scene.add.container(x, y, [this.frame, view, this.g]).setScrollFactor(0, 0, true).setDepth(UI_DEPTH - 5);
    if (onTap) {
      this.box.setSize(size, size).setInteractive({ useHandCursor: true });
      this.box.on('pointerup', onTap);
    }
  }

  sync(sim: Sim, job: Job | null, route: number[], dt: number): void {
    if (++this.tick % 2) return;
    const p = sim.player;
    const inner = this.size - 16;
    // zoom out at speed
    const want = 0.95 - clamp(p.speedAbs / 40, 0, 1) * 0.3;
    this.zoom += (want - this.zoom) * Math.min(1, dt * 4);
    const k = this.zoom;
    const th = -Math.PI / 2 - Math.atan2(Math.cos(p.h), Math.sin(p.h));
    const cos = Math.cos(th), sin = Math.sin(th);
    const scale = k / mapK;
    this.img.setOrigin(toMap(p.x) / MAP_PX, toMap(p.z) / MAP_PX).setRotation(th).setScale(scale);
    this.rt.clear();
    this.rt.draw(this.img, inner / 2, inner / 2);
    const g = this.g.clear();
    const half = inner / 2 - 6;
    const P = (x: number, z: number, edge: boolean): [number, number] => {
      const dx = (x - p.x) * k, dz = (z - p.z) * k;
      let sx = dx * cos - dz * sin, sy = dx * sin + dz * cos;
      if (edge) {
        const m = Math.max(Math.abs(sx), Math.abs(sy));
        if (m > half) { sx *= half / m; sy *= half / m; }
      }
      return [sx, sy];
    };
    // the search circle
    if (sim.searching) {
      const [cx, cy] = P(sim.searchX, sim.searchZ, false);
      g.lineStyle(2, 0xff4060, 0.8).fillStyle(0xff4060, 0.12);
      g.fillCircle(cx, cy, sim.searchR * k).strokeCircle(cx, cy, sim.searchR * k);
    }
    // the GPS route
    if (route.length >= 4) {
      g.lineStyle(5, 0x000000, 0.5);
      g.beginPath();
      for (let i = 0; i < route.length; i += 2) { const [x, y] = P(route[i], route[i + 1], false); if (i) g.lineTo(x, y); else g.moveTo(x, y); }
      g.strokePath();
      g.lineStyle(3, CYAN, 1);
      g.beginPath();
      for (let i = 0; i < route.length; i += 2) { const [x, y] = P(route[i], route[i + 1], false); if (i) g.lineTo(x, y); else g.moveTo(x, y); }
      g.strokePath();
    }
    // markers (pinned to the edge when far)
    if (job) for (const m of job.markers) {
      const [x, y] = P(m.x, m.z, true);
      g.fillStyle(0x000000, 0.6).fillCircle(x, y, 7);
      g.fillStyle(MARKER_COLOR[m.kind], 1).fillCircle(x, y, m.next ? 3.5 : 5);
    }
    // police
    const flash = Math.floor(sim.time * 4) % 2;
    for (const c of sim.cars) {
      if (c.role !== 'cop' || c.cop === 'out') continue;
      const [x, y] = P(c.x, c.z, false);
      if (Math.abs(x) > half || Math.abs(y) > half) continue;
      g.fillStyle(c.siren ? (flash ? 0xff3040 : 0x3a6aff) : 0x6a8aff, 1).fillCircle(x, y, 4);
    }
    // the player: an arrow pointing up
    g.fillStyle(0x000000, 0.6).fillTriangle(0, -10, -8, 8, 8, 8);
    g.fillStyle(0xffffff, 1).fillTriangle(0, -8, -6, 6, 6, 6);
    // north marker
    const [nx, ny] = [-sin * (half - 2) * 0 + sin * half, -cos * half];
    g.fillStyle(PINK, 1).fillCircle(nx, ny, 4);
  }
}

// ------------------------------------------------------------------ the chips

/** A bar inside a chip: a Graphics with a fixed slot width. */
function bar(scene: Phaser.Scene, w: number): Phaser.GameObjects.Graphics {
  const g = scene.add.graphics();
  g.setData('chipWidth', w);
  return g;
}

function drawBar(g: Phaser.GameObjects.Graphics, w: number, k: number, color: number): void {
  g.clear();
  g.fillStyle(0x000000, 0.5).fillRoundedRect(-w / 2, -7, w, 14, 6);
  g.fillStyle(color, 1).fillRoundedRect(-w / 2 + 2, -5, Math.max(4, (w - 4) * clamp(k, 0, 1)), 10, 5);
  g.fillStyle(0xffffff, 0.25).fillRect(-w / 2 + 4, -4, Math.max(0, (w - 8) * clamp(k, 0, 1)), 2);
}

export class DriveHud {
  readonly heat: HudChip;
  readonly speed: HudChip;
  readonly damage: HudChip;
  readonly nitro: HudChip;
  readonly clock: HudChip;
  readonly meter: HudChip;
  readonly minimap: MiniMap;
  private stars: Phaser.GameObjects.Image[] = [];
  private searchBar: Phaser.GameObjects.Graphics;
  private dmgBar: Phaser.GameObjects.Graphics;
  private meterBar: Phaser.GameObjects.Graphics;
  private diamond: Phaser.GameObjects.Image;
  private dist: HudChip;
  private edge: Phaser.GameObjects.Image;
  private bustRing: Phaser.GameObjects.Graphics;
  private streaks: Phaser.GameObjects.Image[] = [];
  private last = { stars: -1, speed: -1, dmg: -1, nitro: -1, clock: -1, meter: -1, meterKind: '', search: -1, hot: false };
  private visible = true;

  constructor(private scene: Phaser.Scene, onMap: () => void, private touch: boolean) {
    const W = scene.scale.width, H = scene.scale.height;
    const right = hudRightEdge(scene);
    for (let i = 0; i < 5; i++) this.stars.push(scene.add.image(0, 0, 'sh-star-off').setDisplaySize(26, 26).setData('chipWidth', 26));
    this.searchBar = bar(scene, 0);
    this.heat = hudChip(scene, right, 50, { align: 'right', label: t('heat'), items: [...this.stars, this.searchBar], minWidth: 210, depth: UI_DEPTH - 5 });
    this.clock = hudChip(scene, W / 2, HUD_ROW2_Y, { align: 'center', icon: 'sh-clock', iconSize: 26, text: '', size: 28, minWidth: 120, depth: UI_DEPTH - 5 });
    this.meterBar = bar(scene, 110);
    this.meter = hudChip(scene, HUD_MARGIN, HUD_ROW2_Y, { align: 'left', icon: 'sh-box', iconSize: 26, label: t('cargo'), items: [this.meterBar], depth: UI_DEPTH - 5 });
    // bottom: speed in the middle, damage left of it, nitro right of it (clear of the pads on touch)
    const by = H - 46;
    this.speed = hudChip(scene, W / 2, by, { align: 'center', text: '0', size: 40, label: t('kmh'), height: 58, minWidth: 150, depth: UI_DEPTH - 5 });
    this.dmgBar = bar(scene, 96);
    this.damage = hudChip(scene, W / 2 - 92, by, { align: 'right', icon: 'sh-wrench', iconSize: 24, items: [this.dmgBar], height: 48, depth: UI_DEPTH - 5 });
    this.nitro = hudChip(scene, W / 2 + 92, by, { align: 'left', icon: 'sh-bolt', iconSize: 28, text: '×0', size: 26, height: 48, depth: UI_DEPTH - 5 });
    this.minimap = new MiniMap(scene, W - 16 - 94, HUD_ROW2_Y + 22 + 94, 188, onMap);
    this.diamond = scene.add.image(0, 0, 'sh-diamond').setDisplaySize(30, 30).setDepth(UI_DEPTH - 30).setVisible(false);
    this.dist = hudChip(scene, 0, 0, { align: 'center', text: '', size: 20, height: 34, minWidth: 64, depth: UI_DEPTH - 30 });
    this.dist.setVisible(false);
    this.edge = scene.add.image(0, 0, 'sh-arrow').setDisplaySize(44, 44).setDepth(UI_DEPTH - 30).setVisible(false);
    this.bustRing = scene.add.graphics().setDepth(UI_DEPTH - 10).setScrollFactor(0);
    for (let i = 0; i < 10; i++) this.streaks.push(scene.add.image(0, 0, 'sh-streak').setScrollFactor(0).setDepth(UI_DEPTH - 40).setAlpha(0).setBlendMode(Phaser.BlendModes.ADD));
    this.meter.setVisible(false);
    this.clock.setVisible(false);
    void PINK;
  }

  setVisible(v: boolean): void {
    this.visible = v;
    for (const o of [this.heat, this.speed, this.damage, this.nitro, this.minimap.box]) o.setVisible(v);
    if (!v) { for (const s of this.streaks) s.setAlpha(0); this.clock.setVisible(false); this.meter.setVisible(false); this.diamond.setVisible(false); this.dist.setVisible(false); this.edge.setVisible(false); this.bustRing.clear(); }
    // the next sync redraws the clock and the meter (shown or hidden) from the job in hand
    this.last.clock = -2; this.last.meter = -1; this.last.meterKind = '-';
  }

  sync(sim: Sim, job: Job, route: number[], nav: { x: number; z: number } | null, toScreen: (x: number, y: number, z: number) => { x: number; y: number; visible: boolean }, dt: number): void {
    if (!this.visible) return;
    const p = sim.player;
    const L = this.last;
    // heat
    const hot = sim.pursuit && !sim.searching;
    const stars = sim.stars;
    if (stars !== L.stars || hot !== L.hot) {
      if (stars > L.stars && L.stars >= 0) this.scene.tweens.add({ targets: this.heat, scale: { from: 1.25, to: 1 }, duration: 300, ease: 'Back.easeOut' });
      L.stars = stars; L.hot = hot;
      this.stars.forEach((s, i) => s.setTexture(i < stars ? (hot ? 'sh-star-hot' : 'sh-star-on') : 'sh-star-off').setDisplaySize(26, 26));
    }
    if (hot) { const f = Math.floor(sim.time * 4) % 2; this.stars.forEach((s, i) => { if (i < stars) s.setAlpha(f ? 1 : 0.55); }); }
    else this.stars.forEach((s) => s.setAlpha(1));
    const search = sim.searching ? Math.ceil((sim.searchLeft / sim.searchTotal) * 20) : -1;
    if (search !== L.search) {
      L.search = search;
      this.searchBar.setData('chipWidth', search >= 0 ? 70 : 0);
      if (search >= 0) drawBar(this.searchBar, 70, search / 20, 0x3ef2ff); else this.searchBar.clear();
      this.heat.setCaption(search >= 0 ? t('searching') : t('heat'));
      this.heat.layout();
    }
    // speed
    const kmh = Math.round(p.speedAbs * KMH);
    if (kmh !== L.speed) { L.speed = kmh; this.speed.setText(String(kmh)); this.speed.setTextColor(p.nitroT > 0 ? '#7ff6ff' : kmh > 100 ? '#ffd23f' : '#fff4e2'); }
    const dmg = Math.round((1 - p.health / p.hp) * 40);
    if (dmg !== L.dmg) {
      if (dmg > L.dmg && L.dmg >= 0) this.scene.tweens.add({ targets: this.damage, x: { from: this.damage.x - 6, to: this.damage.x }, duration: 160, ease: 'Bounce.easeOut' });
      L.dmg = dmg;
      const k = p.health / p.hp;
      drawBar(this.dmgBar, 96, k, k > 0.55 ? 0x5dff7a : k > 0.3 ? 0xffd23f : 0xff4060);
    }
    if (sim.nitro !== L.nitro) { L.nitro = sim.nitro; this.nitro.setText('×' + sim.nitro); }
    this.nitro.setVisible(!this.touch);
    // clock
    const clk = job.clock === Infinity ? -1 : Math.ceil(job.clock);
    if (clk !== L.clock) {
      L.clock = clk;
      this.clock.setVisible(clk >= 0);
      if (clk >= 0) {
        this.clock.setText(mmss(clk));
        this.clock.setTextColor(clk <= 10 ? '#ff6070' : clk <= 20 ? '#ffd23f' : '#fff4e2');
        if (clk <= 10) this.scene.tweens.add({ targets: this.clock, scale: { from: 1.2, to: 1 }, duration: 220 });
      }
    }
    // the meter: cargo, calm, suspicion or the escort
    let kind = '', k = 0, color = 0x5dff7a;
    if (job.cargo !== null) { kind = job.cargoKind === 'nervous' ? 'calm' : 'cargo'; k = job.cargo / 100; }
    else if (job.actor && job.actor.role === 'target' && job.def?.stages[job.stage]?.type === 'tail') { kind = 'suspicion'; k = job.suspicion / 100; color = 0xff4060; }
    else if (job.actor && job.actor.role === 'escort') { kind = 'escortHp'; k = job.actor.health / job.actor.hp; }
    else if (job.actor && job.actor.role === 'target') { kind = 'target'; k = job.actor.health / job.actor.hp; color = 0xff7a1a; }
    if (kind !== L.meterKind) {
      L.meterKind = kind;
      this.meter.setVisible(!!kind);
      if (kind) {
        this.meter.setCaption(t(kind === 'target' ? 'damage' : kind));
        this.meter.setIcon(kind === 'suspicion' ? 'sh-eye' : kind === 'cargo' || kind === 'calm' ? 'sh-box' : 'sh-wrench', undefined, 26);
      }
      L.meter = -1;
    }
    const mk = Math.round(k * 50);
    if (kind && mk !== L.meter) {
      L.meter = mk;
      if (kind !== 'suspicion') color = k > 0.55 ? 0x5dff7a : k > 0.3 ? 0xffd23f : 0xff4060;
      drawBar(this.meterBar, 110, k, color);
    }
    // the target: a diamond over it with the distance, or an arrow on the edge
    const W = this.scene.scale.width, H = this.scene.scale.height;
    if (nav) {
      const sp = toScreen(nav.x, 3.5, nav.z);
      let d = 0;
      for (let i = 2; i < route.length; i += 2) d += Math.hypot(route[i] - route[i - 2], route[i + 1] - route[i - 1]);
      if (!route.length) d = Math.hypot(nav.x - p.x, nav.z - p.z);
      const on = sp.visible && sp.x > 40 && sp.x < W - 40 && sp.y > 110 && sp.y < H - 120;
      this.diamond.setVisible(on).setPosition(sp.x, sp.y).setTint(0x3ef2ff);
      this.dist.setVisible(on && d > 12).setPosition(sp.x, sp.y + 30);
      if (on) this.dist.setText(d >= 1000 ? (d / 1000).toFixed(1) + ' km' : Math.round(d / 5) * 5 + ' m');
      this.edge.setVisible(!on);
      if (!on) {
        // the direction to the target on screen (behind: flipped)
        let ex = sp.x - W / 2, ey = sp.y - H / 2;
        if (!sp.visible) { ex = -ex; ey = -ey; }
        const a = Math.atan2(ey, ex);
        const rx = W / 2 - 70, ry = H / 2 - 90;
        const s = Math.min(rx / Math.max(0.001, Math.abs(Math.cos(a))), ry / Math.max(0.001, Math.abs(Math.sin(a))));
        this.edge.setPosition(W / 2 + Math.cos(a) * s, H / 2 + Math.sin(a) * s).setRotation(a).setTint(0x3ef2ff).setAlpha(0.6 + 0.4 * Math.sin(sim.time * 6));
      }
    } else { this.diamond.setVisible(false); this.dist.setVisible(false); this.edge.setVisible(false); }
    // the busted ring
    const g = this.bustRing.clear();
    if (sim.bust > 0.05 && !sim.busted) {
      const k2 = clamp(sim.bust / sim.tune.bustTime, 0, 1);
      const cx = W / 2, cy = H - 150;
      g.lineStyle(10, 0x000000, 0.5).strokeCircle(cx, cy, 34);
      g.lineStyle(7, 0xff3040, 1).beginPath().arc(cx, cy, 34, -Math.PI / 2, -Math.PI / 2 + k2 * Math.PI * 2).strokePath();
      g.fillStyle(0x3a6aff, Math.floor(sim.time * 6) % 2 ? 0.9 : 0.3).fillCircle(cx, cy, 14);
    }
    // nitro streaks
    const on = p.nitroT > 0;
    this.streaks.forEach((s, i) => {
      if (!on) { s.setAlpha(Math.max(0, s.alpha - dt * 4)); return; }
      if (Math.random() < dt * 10) {
        const left = i % 2 === 0;
        s.setPosition(left ? Phaser.Math.Between(10, 240) : Phaser.Math.Between(W - 240, W - 10), Phaser.Math.Between(140, H - 160)).setScale(1.3, Phaser.Math.FloatBetween(2, 4)).setAlpha(0.7).setRotation(left ? -0.9 : 0.9);
      }
      s.x += (i % 2 === 0 ? -1 : 1) * dt * 600;
      s.y += dt * 400;
      s.setAlpha(Math.max(0, s.alpha - dt * 1.6));
    });
    this.minimap.sync(sim, job, route, dt);
  }
}
