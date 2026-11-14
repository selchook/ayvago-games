// Rooftop Courier: the text lanes. Everything that floats over the run goes through here so that
// nothing piles up when a delivery, a Rush, a pigeon scatter and a style move land together:
//   - big banners (district, Rush, praise, warnings) show one at a time in the banner band under
//     the HUD; the others wait in a short queue by priority (praise is dropped rather than kept);
//   - the delivery stamp is the hero: while it shows no banner starts and the one up fades out;
//   - small lines (+points, landing words, pickups) take the free spot nearest to where they want
//     to be, never over each other, the banner, the stamp, the courier or the touch buttons;
//   - style moves landing within a moment of each other merge into one line ("Gap · Vault +345").
import Phaser from 'phaser';
import { txt, getLang } from '@core';
import { banner, rubberStamp, UI_DEPTH } from './ui';

type Rect = { x0: number; y0: number; x1: number; y1: number };
type BannerOpts = Parameters<typeof banner>[4];
interface Queued { text: string; o: BannerOpts; prio: number; at: number }

/** The banner band (centre y) and the stamp's place. */
export const BANNER_Y = 360;
export const STAMP_Y = 505;
/** Where small lines may float (under the HUD chips and toasts, over the bottom of the screen). */
const TOP = 320;
const BOTTOM = 1060;

export class Callouts {
  private queue: Queued[] = [];
  private current: { c: Phaser.GameObjects.Container; until: number; prio: number } | null = null;
  private stampUntil = 0;
  private pops: { o: Phaser.GameObjects.Text; until: number; rise: number; gone?: boolean }[] = [];
  private move: { o: Phaser.GameObjects.Text; names: string[]; pts: number; until: number; color: string } | null = null;
  /** The courier on screen (set every frame) and fixed no-go boxes (touch buttons). */
  private courier: Rect | null = null;
  private blocked: Rect[] = [];

  constructor(private scene: Phaser.Scene) {}

  private get now(): number { return this.scene.time.now; }

  /** The touch buttons and anything else small lines must never cover. */
  block(r: Rect): void { this.blocked.push(r); }

  /** Where the courier is on screen this frame. */
  setCourier(r: Rect | null): void { this.courier = r; }

  // ------------------------------------------------------------------ banners

  /**
   * A big banner. Priority: 3 run-changing (fall, late, Rush), 2 news (district, gold, first
   * parcel, tutorial), 1 pickups and misses, 0 praise (never waits: dropped when the band is busy).
   */
  banner(text: string, o: BannerOpts = {}, prio = 1): void {
    if (prio === 0 && (this.busyBand() || this.queue.length)) return;
    // the same text already waiting: keep one
    if (this.queue.some((q) => q.text === text)) return;
    this.queue.push({ text, o, prio, at: this.now });
    this.queue.sort((a, b) => b.prio - a.prio || a.at - b.at);
    if (this.queue.length > 3) this.queue.length = 3;
    this.pump();
  }

  private busyBand(): boolean { return !!this.current || this.now < this.stampUntil; }

  private pump(): void {
    if (this.current && this.now >= this.current.until) this.current = null;
    // a run-changing banner may cut a minor one short
    const next = this.queue[0];
    if (next && this.current && next.prio >= 3 && this.current.prio < 3) { this.fadeOut(this.current.c); this.current = null; }
    if (this.busyBand() || !next) return;
    this.queue.shift();
    // stale news is skipped (it waited too long to still mean anything)
    if (this.now - next.at > 4000 && next.prio < 3) { this.pump(); return; }
    const W = this.scene.scale.width;
    const c = banner(this.scene, W / 2, BANNER_Y, next.text, next.o);
    const hold = (next.o?.hold ?? 0.8) * 1000;
    this.current = { c, until: this.now + 220 + hold + 300, prio: next.prio };
  }

  private fadeOut(c: Phaser.GameObjects.Container): void {
    if (!c.active) return;
    this.scene.tweens.killTweensOf(c);
    this.scene.tweens.add({ targets: c, alpha: 0, duration: 140, onComplete: () => c.destroy() });
  }

  // ------------------------------------------------------------------ the stamp

  /** The delivery stamp: the hero of the moment. */
  stamp(word: string, sub: string): void {
    if (this.current) { this.fadeOut(this.current.c); this.current = null; }
    // the small lines behind it make room
    for (const p of this.pops) if (p.o.active && this.hits(this.rectOf(p.o, p.rise), this.stampRect())) { p.gone = true; this.scene.tweens.killTweensOf(p.o); this.scene.tweens.add({ targets: p.o, alpha: 0, duration: 120, onComplete: () => p.o.destroy() }); }
    rubberStamp(this.scene, this.scene.scale.width / 2, STAMP_Y, word, sub);
    this.stampUntil = this.now + 1500;
  }

  private stampRect(): Rect {
    const W = this.scene.scale.width;
    return { x0: W / 2 - 300, y0: STAMP_Y - 110, x1: W / 2 + 300, y1: STAMP_Y + 110 };
  }

  // ------------------------------------------------------------------ small lines

  /** A small line near (x, y), moved to the nearest free spot. */
  pop(x: number, y: number, s: string, color: string, size = 26): Phaser.GameObjects.Text | null {
    const t = this.placeText(x, y, s, color, size);
    return t;
  }

  /**
   * A style move's "+points". Moves within 0.6 s of the last one join its line instead of
   * starting another.
   */
  addMove(name: string, pts: number, color: string, x: number, y: number): void {
    const m = this.move;
    const live = m && m.o.active && !this.pops.find((q) => q.o === m.o)?.gone;
    if (m && live && this.now < m.until) {
      if (!m.names.includes(name)) m.names.push(name);
      m.pts += pts;
      m.until = this.now + 600;
      const shown = m.names.length > 3 ? ['…', ...m.names.slice(-3)] : m.names;
      m.o.setText(`${shown.join(' · ')} +${fmtInt(m.pts)}`);
      // keep it in view a little longer, on screen
      const W = this.scene.scale.width;
      m.o.x = Math.min(W - m.o.width / 2 - 12, Math.max(m.o.width / 2 + 12, m.o.x));
      this.scene.tweens.killTweensOf(m.o);
      m.o.setAlpha(1);
      this.scene.tweens.add({ targets: m.o, scale: { from: 1.15, to: 1 }, duration: 160 });
      this.scene.tweens.add({ targets: m.o, y: m.o.y - 60, alpha: 0, delay: 620, duration: 380, onComplete: () => m.o.destroy() });
      const p = this.pops.find((q) => q.o === m.o);
      if (p) p.until = this.now + 1100;
      return;
    }
    const o = this.placeText(x, y, `${name} +${fmtInt(pts)}`, color, 26);
    this.move = o ? { o, names: [name], pts, until: this.now + 600, color } : null;
  }

  private placeText(x: number, y: number, s: string, color: string, size: number): Phaser.GameObjects.Text | null {
    const sc = this.scene;
    const W = sc.scale.width;
    const o = txt(sc, x, y, s, { title: true, size, color, strokeThickness: 7 }).setScrollFactor(0).setDepth(UI_DEPTH + 40);
    const rise = 60;
    const w = o.width, h = o.height;
    const taken = this.taken();
    const score = (cx: number, cy: number) => {
      const r: Rect = { x0: cx - w / 2, y0: cy - h / 2 - rise, x1: cx + w / 2, y1: cy + h / 2 };
      let a = 0;
      for (const q of taken) a += this.area(r, q);
      return a;
    };
    let best = { x, y }, bestS = Infinity;
    const xs = [x, W / 2, w / 2 + 20, W - w / 2 - 20, W * 0.3, W * 0.7].map((v) => Math.min(W - w / 2 - 12, Math.max(w / 2 + 12, v)));
    for (const cx of xs) {
      for (let cy = TOP + rise + h / 2; cy <= BOTTOM - h / 2; cy += 14) {
        const sc2 = score(cx, cy) * 1000 + Math.abs(cy - y) + Math.abs(cx - x) * 0.6;
        if (sc2 < bestS) { bestS = sc2; best = { x: cx, y: cy }; }
      }
    }
    o.setPosition(best.x, best.y).setScale(0.4).setAlpha(0);
    sc.tweens.add({ targets: o, scale: 1, alpha: 1, duration: 150, ease: 'Back.easeOut' });
    sc.tweens.add({ targets: o, y: best.y - rise, alpha: 0, delay: 560, duration: 380, onComplete: () => o.destroy() });
    this.pops.push({ o, until: this.now + 1100, rise });
    return o;
  }

  /** Everything a new small line must keep clear of. */
  private taken(): Rect[] {
    const out: Rect[] = [...this.blocked];
    this.pops = this.pops.filter((p) => p.o.active && this.now < p.until + 200);
    for (const p of this.pops) out.push(this.rectOf(p.o, p.rise));
    if (this.courier) out.push(this.courier);
    if (this.now < this.stampUntil) out.push(this.stampRect());
    if (this.current?.c.active) {
      const b = this.current.c.getBounds(), k = Math.max(0.05, this.current.c.scale);
      out.push({ x0: b.centerX - b.width / k / 2, y0: BANNER_Y - b.height / k / 2 - 50, x1: b.centerX + b.width / k / 2, y1: BANNER_Y + b.height / k / 2 + 10 });
    }
    return out;
  }

  private rectOf(o: Phaser.GameObjects.Text, rise: number): Rect {
    const w = o.width, h = o.height;
    return { x0: o.x - w / 2 - 6, y0: o.y - h / 2 - rise - 6, x1: o.x + w / 2 + 6, y1: o.y + h / 2 + 6 };
  }

  private area(a: Rect, b: Rect): number {
    const ox = Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0), oy = Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0);
    return ox > 0 && oy > 0 ? ox * oy : 0;
  }

  private hits(a: Rect, b: Rect): boolean { return this.area(a, b) > 0; }

  /** Call every frame: starts the next banner when the band is free. */
  update(): void { this.pump(); }

  /** Test hook: what floats now (no two may overlap). */
  boxes(): { kind: string; r: Rect }[] {
    const out: { kind: string; r: Rect }[] = [];
    for (const p of this.pops) if (p.o.active && !p.gone) out.push({ kind: 'pop', r: this.rectOf(p.o, 0) });
    if (this.now < this.stampUntil) out.push({ kind: 'stamp', r: this.stampRect() });
    if (this.current?.c.active) { const b = this.current.c.getBounds(); out.push({ kind: 'banner', r: { x0: b.x, y0: b.y, x1: b.right, y1: b.bottom } }); }
    return out;
  }
}

const fmtInt = (n: number): string => Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, getLang() === 'tr' ? '.' : ',');

export { UI_DEPTH };
