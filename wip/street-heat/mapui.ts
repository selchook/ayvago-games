// Street Heat: the city map, full screen over the paused round (M on the keyboard, a tap on the
// minimap, Back on a pad): the whole of Neon Bay north up, the GPS route, the job markers, the
// police and their search circle, the player's arrow and a legend. Closes with M, Esc, Enter or a tap.
import Phaser from 'phaser';
import { t, labelAt, fitWidth, themeCard, KitButton, type LabelStyle } from '@core';
import { MAP_PX, toMap, mapK } from './hud';
import { MARKER_COLOR } from './view';
import { calloutStyle, CYAN, PANEL, caps } from './theme';
import type { Sim } from './sim';
import type { Job } from './jobs';

const LEGEND: LabelStyle = { size: 22, color: '#2a1d14', stroke: null, shadow: false };

export interface MapData { sim: Sim; job: Job | null; route: number[]; from: string }

export class MapScene extends Phaser.Scene {
  constructor() { super('Map'); }

  create(data: MapData): void {
    const { width: W, height: H } = this.scale;
    this.add.rectangle(0, 0, W, H, 0x07040f, 0.72).setOrigin(0).setInteractive();
    const cx = W / 2 - 150, cy = H / 2 + 6;
    this.add.existing(themeCard(this, cx, cy, PANEL.mapW, PANEL.mapH));
    const S = 560;
    const k = S / MAP_PX;
    const x0 = cx - S / 2, y0 = cy - S / 2 + 18;
    this.add.image(x0, y0, 'sh-mapbase').setOrigin(0).setDisplaySize(S, S);
    this.add.existing(fitWidth(labelAt(this, cx, cy - PANEL.mapH / 2 + 36, caps(t('cityName')), calloutStyle('#ffb03a', 44)), 500));
    const g = this.add.graphics();
    const P = (x: number, z: number): [number, number] => [x0 + toMap(x) * k, y0 + toMap(z) * k];
    const { sim, job, route } = data;
    if (sim.searching) {
      const [sx, sy] = P(sim.searchX, sim.searchZ);
      g.fillStyle(0xff4060, 0.18).fillCircle(sx, sy, sim.searchR * mapK * k).lineStyle(2, 0xff4060, 0.9).strokeCircle(sx, sy, sim.searchR * mapK * k);
    }
    if (route.length >= 4) {
      g.lineStyle(4, CYAN, 1).beginPath();
      for (let i = 0; i < route.length; i += 2) { const [x, y] = P(route[i], route[i + 1]); if (i) g.lineTo(x, y); else g.moveTo(x, y); }
      g.strokePath();
    }
    if (job) for (const m of job.markers) {
      const [x, y] = P(m.x, m.z);
      g.fillStyle(0x000000, 0.6).fillCircle(x, y, 9).fillStyle(MARKER_COLOR[m.kind], 1).fillCircle(x, y, 6.5);
    }
    for (const c of sim.cars) if (c.role === 'cop' && c.cop !== 'out') { const [x, y] = P(c.x, c.z); g.fillStyle(c.siren ? 0xff3040 : 0x6a8aff, 1).fillCircle(x, y, 5); }
    const p = sim.player;
    const [px, py] = P(p.x, p.z);
    const a = Math.atan2(Math.cos(p.h), Math.sin(p.h));
    const tri = (r: number, col: number) => g.fillStyle(col, 1).fillTriangle(px + Math.cos(a) * r, py + Math.sin(a) * r, px + Math.cos(a + 2.4) * r * 0.8, py + Math.sin(a + 2.4) * r * 0.8, px + Math.cos(a - 2.4) * r * 0.8, py + Math.sin(a - 2.4) * r * 0.8);
    tri(14, 0x000000); tri(11, 0xffffff);
    // places
    for (const [name, s] of sim.city.places) {
      if (!['garage', 'precinct', 'spray', 'bank', 'docks', 'station', 'park', 'plaza'].includes(name)) continue;
      const [x, y] = P(s.x, s.z);
      this.add.existing(fitWidth(labelAt(this, x, y - 14, t('pl_' + name), { size: 16, color: '#fff4e2', stroke: '#1a0b2e', strokeWidth: 4 }), 110));
    }
    // the legend on the right
    const lx = cx + PANEL.mapW / 2 + 40, ly = cy - 150;
    const rows: [string, number][] = [['lg_you', 0xffffff], ['lg_police', 0xff3040], ['lg_job', MARKER_COLOR.pickup], ['garage', MARKER_COLOR.garage], ['pl_spray', MARKER_COLOR.spray], ['lg_search', 0xff4060]];
    this.add.existing(themeCard(this, lx + 100, ly + 130, 240, 330));
    rows.forEach(([key, col], i) => {
      const y = ly + 10 + i * 46;
      this.add.graphics().fillStyle(0x000000, 0.5).fillCircle(lx + 20, y, 11).fillStyle(col, 1).fillCircle(lx + 20, y, 8);
      this.add.existing(fitWidth(labelAt(this, lx + 42, y, caps(t(key)), LEGEND, 0), 160));
    });
    const close = new KitButton(this, lx + 100, ly + 330, { w: 200, h: 64, label: t('close'), size: 28 }, () => this.close(data.from));
    this.add.existing(close);
    const kb = this.input.keyboard;
    for (const k of ['M', 'ESC', 'ENTER', 'SPACE', 'BACKSPACE']) kb?.once('keydown-' + k, () => this.close(data.from));
    this.input.once('pointerup', (_p: Phaser.Input.Pointer, over: Phaser.GameObjects.GameObject[]) => { if (!over.length) this.close(data.from); });
  }

  private close(from: string): void {
    if (!this.scene.isActive()) return;
    this.scene.stop();
    this.scene.resume(from);
    this.scene.get(from)?.events.emit('map-closed');
  }
}
