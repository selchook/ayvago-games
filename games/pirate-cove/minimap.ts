// The sea chart: a round radar in a glass HUD chip under the gun chip (top right). Heading-up
// (it turns with the camera, so left on the chart is left on the screen), centred a little below
// the player's ship so more of the sea ahead shows. A tap on it (or M) swaps between the close
// chart and a larger one that shows the whole archipelago.
//
// Drawn with one Phaser Graphics clipped to the disc by a geometry mask, redrawn at REDRAW_HZ;
// nothing is rendered a second time in 3D.
import Phaser from 'phaser';
import { hudChip, HudChip, txt, t, HUD_MARGIN, HUD_ROW2_Y, HUD_CHIP_H, HUD_GAP } from '@core';
import { THREE } from '@core/three';

export interface MapPoint { x: number; z: number }
export interface MapShip extends MapPoint { heading: number }

/** What the chart shows; built by the play scene at every redraw. */
export interface MapState {
  /** The player's ship, and the camera's yaw (the chart's "up"). */
  player: MapShip;
  yaw: number;
  /** Radius of the playable sea around (0, 0). */
  bound: number;
  islands: (MapPoint & { r: number; home: boolean; rock: boolean })[];
  foes: MapShip[];
  boss: MapShip | null;
  forts: MapPoint[];
  loot: (MapPoint & { kind: 'chest' | 'barrel' | 'bottle'; mission: boolean })[];
  ally: MapShip | null;
  berth: MapPoint & { r: number; goal: boolean; repair: boolean };
  /** 0..1 storm strength, and the share of the storm countdown left (-1: no countdown). */
  storm: number;
  stormLeft: number;
  stormLate: boolean;
  /** The sea the camera sees: a quad on the water. */
  view: MapPoint[] | null;
}

/** Chart radius in px (small and large), and the sea radius in world units each shows. */
const SIZES = [
  { r: 80, range: 88 },
  { r: 132, range: 178 },
];
/** The player sits this share of the radius below the centre (more sea ahead). */
const AHEAD = 0.2;
const REDRAW_HZ = 20;
const DEPTH = 9002;

const SEA = 0x1f7aa8;
const OPEN = 0x081a2c;
const SAND = 0xe3c78e;
const ROCK = 0x8d97a3;
const SAND_EDGE = 0x6b4a1e;
const GRASS = 0x5fb04a;
const FOE = 0xff3b30;
const BOSS = 0x3dffb0;
const FORT = 0xff6a2c;
const GOLD = 0xffd23f;
const ALLY = 0x4aa8ff;
const BERTH = 0x7dff9a;
const INK = 0x10141f;

export class Minimap {
  /** Large chart on. */
  big = false;
  /** Average milliseconds per redraw (tests read it), and redraws so far. */
  drawMs = 0;
  draws = 0;

  private chip!: HudChip;
  private chips: HudChip[] = [];
  private g: Phaser.GameObjects.Graphics;
  private maskG: Phaser.GameObjects.Graphics;
  private north: Phaser.GameObjects.Text;
  private zone: Phaser.GameObjects.Zone;
  private acc = 1;
  private time = 0;
  private hidden = false;
  /** Screen centre and radius of the chart now. */
  cx = 0;
  cy = 0;
  r = 0;

  constructor(private scene: Phaser.Scene, private state: () => MapState) {
    const { width } = scene.scale;
    const right = width - HUD_MARGIN;
    const top = HUD_ROW2_Y + HUD_CHIP_H / 2 + HUD_GAP;
    // one glass chip per size (a round chip: as wide as it is high)
    for (const s of SIZES) {
      const d = s.r * 2;
      this.chips.push(hudChip(scene, right, top + s.r, { align: 'right', height: d, minWidth: d, depth: DEPTH - 1 }).setVisible(false));
    }
    this.g = scene.add.graphics().setDepth(DEPTH).setScrollFactor(0);
    this.maskG = scene.make.graphics({}, false).setScrollFactor(0);
    this.g.setMask(this.maskG.createGeometryMask());
    this.north = txt(scene, 0, 0, t('north'), { title: true, size: 15, color: '#ffffff', strokeThickness: 4 })
      .setOrigin(0.5).setDepth(DEPTH + 1).setScrollFactor(0);
    this.zone = scene.add.zone(0, 0, 10, 10).setScrollFactor(0).setDepth(DEPTH).setInteractive();
    this.zone.on('pointerdown', () => this.toggle());
    this.setSize(false);
  }

  /** Swaps the close and the large chart. */
  toggle(): void {
    this.setSize(!this.big);
    this.scene.tweens.add({ targets: [this.chip, this.g], scale: { from: 0.94, to: 1 }, duration: 160, ease: 'Back.easeOut' });
  }

  private setSize(big: boolean): void {
    this.big = big;
    const s = SIZES[big ? 1 : 0];
    this.chips.forEach((c, i) => c.setVisible(!this.hidden && i === (big ? 1 : 0)));
    this.chip = this.chips[big ? 1 : 0];
    this.r = s.r;
    this.cx = this.chip.right - s.r;
    this.cy = this.chip.y;
    this.g.setPosition(this.cx, this.cy);
    this.maskG.clear().fillStyle(0xffffff).fillCircle(this.cx, this.cy, s.r - 2);
    this.zone.setPosition(this.cx, this.cy).setSize(s.r * 2, s.r * 2);
    this.acc = 1;
  }

  /** Left and bottom edges of the chart on screen, for laying out what is around it. */
  get left(): number { return this.cx - this.r; }
  get bottom(): number { return this.cy + this.r; }

  setHidden(h: boolean): void {
    if (h === this.hidden) return;
    this.hidden = h;
    this.chip.setVisible(!h);
    this.g.setVisible(!h);
    this.north.setVisible(!h);
    if (h) this.zone.disableInteractive(); else this.zone.setInteractive();
  }

  update(dt: number): void {
    this.time += dt;
    this.acc += dt;
    if (this.hidden || this.acc < 1 / REDRAW_HZ) return;
    this.acc = 0;
    const t0 = performance.now();
    this.draw(this.state());
    const ms = performance.now() - t0;
    this.draws++;
    this.drawMs += (ms - this.drawMs) / Math.min(this.draws, 60);
  }

  private draw(s: MapState): void {
    const g = this.g;
    const R = this.r;
    const k = R / SIZES[this.big ? 1 : 0].range;
    const sy = Math.sin(s.yaw), cy = Math.cos(s.yaw);
    const px = s.player.x, pz = s.player.z;
    const oy = R * AHEAD;
    // world (x, z) to chart px around the chart centre: up the chart is the camera's forward,
    // right is starboard
    const mx = (x: number, z: number) => ((x - px) * -cy + (z - pz) * sy) * k;
    const my = (x: number, z: number) => oy - ((x - px) * sy + (z - pz) * cy) * k;
    const inside = (x: number, y: number, pad: number) => x * x + y * y < (R - pad) ** 2;
    g.clear();

    // open sea beyond the edge of the map, the playable sea, and its edge
    g.fillStyle(OPEN, 0.72).fillCircle(0, 0, R);
    const bx = mx(0, 0), by = my(0, 0);
    g.fillStyle(SEA, 0.62).fillCircle(bx, by, s.bound * k);
    g.lineStyle(1.5, 0xffffff, 0.4).strokeCircle(bx, by, s.bound * k);
    if (s.storm > 0.02) g.fillStyle(0x3a4250, Math.min(0.55, s.storm * 0.6)).fillCircle(0, 0, R);

    // what the camera sees
    if (s.view) {
      g.fillStyle(0xffffff, 0.1).lineStyle(1, 0xffffff, 0.28);
      g.beginPath();
      s.view.forEach((p, i) => (i ? g.lineTo(mx(p.x, p.z), my(p.x, p.z)) : g.moveTo(mx(p.x, p.z), my(p.x, p.z))));
      g.closePath();
      g.fillPath();
      g.strokePath();
    }

    // islands: sand with a dark shore line and green palms, bare rocks grey
    for (const i of s.islands) {
      const x = mx(i.x, i.z), y = my(i.x, i.z), r = Math.max(2.5, i.r * k);
      if (!inside(x, y, -r)) continue;
      g.fillStyle(i.rock ? ROCK : SAND, 1).fillCircle(x, y, r);
      g.lineStyle(1.2, i.rock ? INK : SAND_EDGE, 0.7).strokeCircle(x, y, r);
      if (!i.rock) g.fillStyle(GRASS, 1).fillCircle(x - r * 0.12, y - r * 0.1, r * (i.home ? 0.55 : 0.4));
    }

    // the berth (repairs; the treasure ship's goal in the escort wave)
    {
      const x = mx(s.berth.x, s.berth.z), y = my(s.berth.x, s.berth.z);
      const pulse = 0.5 + 0.5 * Math.sin(this.time * 5);
      const hot = s.berth.goal || s.berth.repair;
      const r = Math.max(4, s.berth.r * k);
      if (s.ally) {
        // the treasure ship's course home, dashed
        const ax = mx(s.ally.x, s.ally.z), ay = my(s.ally.x, s.ally.z);
        const n = Math.max(2, Math.floor(Math.hypot(x - ax, y - ay) / 7));
        g.lineStyle(1.5, ALLY, 0.7);
        for (let j = 0; j < n; j += 2) {
          g.lineBetween(ax + (x - ax) * (j / n), ay + (y - ay) * (j / n), ax + (x - ax) * ((j + 1) / n), ay + (y - ay) * ((j + 1) / n));
        }
      }
      if (inside(x, y, 4)) {
        g.lineStyle(hot ? 2.5 : 1.5, BERTH, hot ? 0.65 + pulse * 0.35 : 0.5).strokeCircle(x, y, r + (hot ? pulse * 1.5 : 0));
        if (s.berth.repair) {
          g.fillStyle(BERTH, 1).fillRect(x - 3.5, y - 1, 7, 2).fillRect(x - 1, y - 3.5, 2, 7);
        } else if (s.berth.goal) star(g, x, y, 4.5, GOLD);
      }
    }

    // the edge of the chart: important markers out of range sit on the rim
    const clamp = (x: number, y: number, pad: number): [number, number, boolean] => {
      const d = Math.hypot(x, y), m = R - pad;
      return d <= m ? [x, y, false] : [(x / d) * m, (y / d) * m, true];
    };

    // loot: chests gold, barrels green, bottles blue; the wave's chests pulse and stay on the rim
    for (const l of s.loot) {
      const [x, y, out] = clamp(mx(l.x, l.z), my(l.x, l.z), 6);
      if (out && !l.mission) continue;
      const c = l.kind === 'chest' ? GOLD : l.kind === 'barrel' ? BERTH : 0x7fd8ff;
      const r = l.mission ? (out ? 3 : 3.6 + Math.sin(this.time * 6) * 0.6) : 2.4;
      g.fillStyle(INK, 0.85).fillCircle(x, y, r + 1.3);
      g.fillStyle(c, 1).fillCircle(x, y, r);
    }

    // forts: little towers
    for (const f of s.forts) {
      const [x, y, out] = clamp(mx(f.x, f.z), my(f.x, f.z), 7);
      const h = out ? 4 : 5.5;
      g.fillStyle(INK, 0.9).fillRect(x - h - 1.5, y - h - 1.5, h * 2 + 3, h * 2 + 3);
      g.fillStyle(FORT, 1).fillRect(x - h, y - h, h * 2, h * 2);
      // battlements
      g.fillStyle(INK, 0.9).fillRect(x - h * 0.33, y - h, h * 0.66, h * 0.55);
    }

    // enemy ships
    for (const f of s.foes) {
      const [x, y, out] = clamp(mx(f.x, f.z), my(f.x, f.z), 5);
      const r = out ? 3.2 : 4.2;
      g.fillStyle(INK, 0.9).fillCircle(x, y, r + 1.4);
      g.fillStyle(FOE, 1).fillCircle(x, y, r);
    }

    // the treasure ship
    if (s.ally) {
      const [x, y] = clamp(mx(s.ally.x, s.ally.z), my(s.ally.x, s.ally.z), 7);
      arrow(g, x, y, s.ally.heading - s.yaw, 7.5, ALLY, 0xffffff);
    }

    // the Ghost Galleon: a big green diamond in a pulsing ring
    if (s.boss) {
      const [x, y] = clamp(mx(s.boss.x, s.boss.z), my(s.boss.x, s.boss.z), 9);
      const pulse = 0.5 + 0.5 * Math.sin(this.time * 4);
      g.lineStyle(2, BOSS, 0.35 + pulse * 0.5).strokeCircle(x, y, 10 + pulse * 2);
      g.fillStyle(INK, 0.9).fillPoints([{ x, y: y - 9 }, { x: x + 8, y }, { x, y: y + 9 }, { x: x - 8, y }], true);
      g.fillStyle(BOSS, 1).fillPoints([{ x, y: y - 7 }, { x: x + 6, y }, { x, y: y + 7 }, { x: x - 6, y }], true);
    }

    // the player: a white arrow along the heading, in the middle of it all
    arrow(g, 0, oy, s.player.heading - s.yaw, 10, 0xffffff, INK);

    // the storm countdown runs round the rim
    if (s.stormLeft >= 0) {
      g.lineStyle(4, 0x000000, 0.35).strokeCircle(0, 0, R - 4);
      g.lineStyle(4, s.stormLate ? 0xff8a6a : 0xc8dcff, 0.95);
      g.beginPath();
      g.arc(0, 0, R - 4, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * Math.max(0.001, s.stormLeft));
      g.strokePath();
    }

    // north (+z) on the rim
    const nx = sy, ny = -cy;
    this.north.setPosition(this.cx + nx * (R - 13), this.cy + ny * (R - 13));
  }
}

/** A ship arrow pointing along `rel` (radians from chart-up; positive turns to port). */
function arrow(g: Phaser.GameObjects.Graphics, x: number, y: number, rel: number, size: number, fill: number, edge: number): void {
  const dx = -Math.sin(rel), dy = -Math.cos(rel);
  const sx = -dy, sy = dx;
  const pts = [
    { x: x + dx * size, y: y + dy * size },
    { x: x - dx * size * 0.7 + sx * size * 0.68, y: y - dy * size * 0.7 + sy * size * 0.68 },
    { x: x - dx * size * 0.35, y: y - dy * size * 0.35 },
    { x: x - dx * size * 0.7 - sx * size * 0.68, y: y - dy * size * 0.7 - sy * size * 0.68 },
  ];
  g.lineStyle(3, edge, 0.95).strokePoints(pts, true, true);
  g.fillStyle(fill, 1).fillPoints(pts, true);
}

function star(g: Phaser.GameObjects.Graphics, x: number, y: number, r: number, c: number): void {
  const pts: { x: number; y: number }[] = [];
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5, rr = i % 2 ? r * 0.45 : r;
    pts.push({ x: x + Math.cos(a) * rr, y: y + Math.sin(a) * rr });
  }
  g.fillStyle(c, 1).fillPoints(pts, true);
}

/** The sea the camera sees: its four screen corners cast down onto the water (y = 0). */
export function viewQuad(cam: THREE.PerspectiveCamera, far = 160): MapPoint[] {
  const out: MapPoint[] = [];
  const v = new THREE.Vector3();
  for (const [nx, ny] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
    v.set(nx, ny, 0.5).unproject(cam).sub(cam.position).normalize();
    const hl = Math.hypot(v.x, v.z) || 1;
    let d = v.y < -0.01 ? (-cam.position.y / v.y) * hl : far;
    d = Math.min(d, far);
    out.push({ x: cam.position.x + (v.x / hl) * d, z: cam.position.z + (v.z / hl) * d });
  }
  return out;
}
