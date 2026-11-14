// Rooftop Courier: the course. An endless row of buildings along s (metres forward), assembled
// block by block from templates with a seeded generator, so a seed always gives the same city.
// Each block is one building with how it is reached from the one before (its link: a plain gap,
// a drop, a fire-escape ladder, scaffolding, an awning to bounce off, a zip-line cable, a beam or
// plank bridge, a kicker ramp) and what stands on its roof (low walls to vault, tall clutter to
// steer round, beams and cables to slide under, stamps, bottles, springs and pigeons).
//
// The gameplay shape is a plain list: boxes (roofs, bridges, scaffold towers, awnings and
// obstacles), ramps, ladders and cables. The simulation only ever asks this list; the view builds
// its meshes from the same blocks.
import { TILE, STOREY, HW, THEMES, Rng, clamp, lerp, type Theme, type Tune } from './defs';

export type Link = 'start' | 'gap' | 'flat' | 'ladder' | 'scaffold' | 'awning' | 'zip' | 'beam' | 'plank' | 'kicker';
export type BoxKind = 'roof' | 'bridge' | 'scaf' | 'awning' | 'low' | 'tall' | 'over';
/** What an obstacle looks like (the view picks the kit model from it). */
export type Look =
  | 'building' | 'beam' | 'plank' | 'scaffold' | 'awning'
  | 'lowWall' | 'barrier' | 'parapet' | 'pallets' | 'fence'
  | 'block' | 'dumpster' | 'chimney' | 'stack' | 'tank' | 'crate'
  | 'overBeam' | 'overCable' | 'overScaf';

export interface Box {
  id: number;
  kind: BoxKind;
  look: Look;
  s0: number; s1: number;
  x0: number; x1: number;
  y0: number; y1: number;
  block: number;
  /** Knocked by the courier (passable from then on). */
  hit: boolean;
}

export interface Ramp { s0: number; s1: number; x0: number; x1: number; ya: number; yb: number; block: number }
export interface Ladder { s: number; x0: number; x1: number; y0: number; y1: number; kind: 'ladder' | 'scaffold'; block: number }
export interface Zip { id: number; sa: number; ya: number; sb: number; yb: number; x: number; block: number }
export type PickupKind = 'stamp' | 'bottle' | 'spring';
export interface Pickup { id: number; kind: PickupKind; s: number; x: number; y: number; taken: boolean; block: number }
export interface Flock { id: number; s: number; x: number; y: number; n: number; gold: boolean; startled: boolean; goldTaken: boolean; block: number }

export interface Block {
  i: number;
  theme: Theme;
  /** District number (0, 1, 2 …: themes cycle, the city keeps getting harder). */
  district: number;
  s0: number; s1: number;
  /** Roof height (m) and storeys. */
  y: number;
  storeys: number;
  link: Link;
  /** The alley before this block (m; 0 = it stands against the previous one). */
  gap: number;
  /** Facade: brick, painted plaster or green metal panels. */
  wall: 'a' | 'ap' | 'b';
  /** Where a parcel can be dropped on this roof. */
  drop: { s: number; x: number };
  /** The ladder or scaffold, awning, bridge, cable or kicker of the link (the view draws them). */
  feature: { x0: number; x1: number } | null;
  /** Seed for the view's decoration (windows, neighbours, street props). */
  seed: number;
}

/** How likely each link is per district. */
const LINKS: Record<Theme, Partial<Record<Link, number>>> = {
  brick: { gap: 46, flat: 20, ladder: 16, beam: 10, zip: 8 },
  market: { gap: 30, awning: 24, zip: 20, flat: 14, ladder: 6, beam: 6 },
  site: { gap: 26, scaffold: 22, plank: 22, flat: 14, ladder: 8, beam: 8 },
  factory: { gap: 32, kicker: 24, zip: 14, beam: 12, ladder: 10, flat: 8 },
};

/** Obstacles per district: low (vault), tall (steer round or jump), over (slide). */
const CLUTTER: Record<Theme, { low: Look[]; tall: Look[]; over: Look[]; w: [number, number, number] }> = {
  brick: { low: ['lowWall', 'barrier'], tall: ['chimney', 'block'], over: ['overCable', 'overBeam'], w: [5, 3, 2] },
  market: { low: ['barrier', 'pallets', 'crate'], tall: ['stack', 'block'], over: ['overCable', 'overCable', 'overBeam'], w: [4, 2, 3] },
  site: { low: ['pallets', 'barrier', 'lowWall'], tall: ['dumpster', 'stack', 'block'], over: ['overBeam', 'overScaf'], w: [4, 3, 3] },
  factory: { low: ['barrier', 'lowWall', 'fence'], tall: ['chimney', 'tank', 'block'], over: ['overBeam', 'overCable'], w: [3, 4, 2] },
};

/** Sizes of the obstacles (across x, along s, height). */
export const OBSTACLE: Record<string, [number, number, number]> = {
  lowWall: [6, 0.32, 1.15], barrier: [2, 0.72, 1.0], parapet: [9, 0.32, 1.1], pallets: [3, 2.4, 0.9], fence: [6, 0.3, 1.2], crate: [1.5, 1.5, 1.1],
  block: [1.5, 1.5, 1.5], dumpster: [1.8, 1.4, 1.65], chimney: [1.1, 1.1, 3.2], stack: [2.4, 1.6, 2.2], tank: [3, 2.6, 2.6],
  overBeam: [9, 0.8, 0.28], overCable: [9, 0.3, 0.12], overScaf: [9, 3, 0.25],
};
/** Clear height under overhead obstacles (above the roof). */
export const OVER_Y = 1.12;

export class Course {
  readonly blocks: Block[] = [];
  readonly boxes: Box[] = [];
  readonly ramps: Ramp[] = [];
  readonly ladders: Ladder[] = [];
  readonly zips: Zip[] = [];
  readonly pickups: Pickup[] = [];
  readonly flocks: Flock[] = [];
  /** The district new blocks belong to (the simulation moves it on as parcels are delivered). */
  district = 0;
  private rng: Rng;
  private nextId = 1;
  private end = 0;
  private lastY = 15;
  private sinceFeature = 0;
  private lastLink: Link = 'start';

  constructor(readonly seed: number, private tune: Tune) {
    this.rng = new Rng(seed * 7919 + 13);
    this.addStart();
  }

  get theme(): Theme { return THEMES[this.district % THEMES.length]; }
  /** The far end of the generated course. */
  get length(): number { return this.end; }

  /** The expected running speed at a distance (for gap sizes and parcel timers). */
  speedAt(s: number): number {
    const t = this.tune;
    return t.speed0 + (t.speedMax - t.speed0) * clamp(s / t.ramp, 0, 1);
  }

  /** How hard the course is here (0 … 1). */
  hardness(s: number, district: number): number {
    return clamp(0.12 + district * 0.2 + s / 3800, 0, 1);
  }

  /** Generates until `s` is covered. */
  ensure(s: number): void {
    while (this.end < s) this.addBlock();
  }

  /** Drops everything behind `s`. */
  forget(s: number): void {
    const keep = <T>(a: T[], f: (v: T) => boolean) => { let n = 0; while (n < a.length && !f(a[n])) n++; if (n) a.splice(0, n); };
    keep(this.blocks, (b) => b.s1 > s);
    const first = this.blocks[0]?.i ?? 0;
    keep(this.boxes, (b) => b.block >= first);
    keep(this.ramps, (b) => b.block >= first);
    keep(this.ladders, (b) => b.block >= first);
    keep(this.zips, (b) => b.block >= first);
    keep(this.pickups, (b) => b.block >= first);
    keep(this.flocks, (b) => b.block >= first);
  }

  blockAt(s: number): Block | null {
    for (const b of this.blocks) if (s >= b.s0 - 1e-6 && s < b.s1) return b;
    return null;
  }

  /** The block that starts after `s` (the next building ahead). */
  nextBlock(s: number): Block | null {
    for (const b of this.blocks) if (b.s0 > s) return b;
    return null;
  }

  blockById(i: number): Block | null {
    for (const b of this.blocks) if (b.i === i) return b;
    return null;
  }

  // ------------------------------------------------------------------ queries

  /**
   * The highest walkable surface at (s, x) not above `yMax`: roofs, bridges, scaffold tops,
   * awnings, obstacle tops and ramps (the street, y = 0, when nothing else).
   */
  groundAt(s: number, x: number, yMax: number, r = 0.18): { y: number; box: Box | null; ramp: Ramp | null } {
    let best = 0, box: Box | null = null, ramp: Ramp | null = null;
    for (const b of this.boxes) {
      if (b.s0 > s + r) break;
      if (s - r >= b.s1 || x + r <= b.x0 || x - r >= b.x1) continue;
      if (b.hit && b.kind !== 'roof') continue;
      if (b.y1 <= yMax + 1e-6 && b.y1 > best) { best = b.y1; box = b; ramp = null; }
    }
    for (const rp of this.ramps) {
      if (s < rp.s0 || s >= rp.s1 || x < rp.x0 || x > rp.x1) continue;
      const y = rp.ya + (rp.yb - rp.ya) * (s - rp.s0) / (rp.s1 - rp.s0);
      if (y <= yMax + 1e-6 && y >= best) { best = y; ramp = rp; box = null; }
    }
    return { y: best, box, ramp };
  }

  /** The top of whatever stands at (s, x) (camera clearance; ignores overhead gaps). */
  heightAt(s: number, x: number, solidOnly = false): number {
    let h = 0;
    for (const b of this.boxes) {
      if (b.s0 > s) break;
      if (s >= b.s1 || x < b.x0 || x > b.x1) continue;
      if (solidOnly && b.kind === 'over') continue;
      if (b.y1 > h) h = b.y1;
    }
    for (const rp of this.ramps) {
      if (s < rp.s0 || s >= rp.s1 || x < rp.x0 || x > rp.x1) continue;
      h = Math.max(h, rp.ya + (rp.yb - rp.ya) * (s - rp.s0) / (rp.s1 - rp.s0));
    }
    return h;
  }

  cableY(z: Zip, s: number): number {
    const k = clamp((s - z.sa) / (z.sb - z.sa), 0, 1);
    return lerp(z.ya, z.yb, k) - 0.45 * Math.sin(Math.PI * k);
  }

  // ------------------------------------------------------------------ building the course

  private box(kind: BoxKind, look: Look, block: number, s0: number, s1: number, x0: number, x1: number, y0: number, y1: number): Box {
    const b: Box = { id: this.nextId++, kind, look, s0, s1, x0, x1, y0, y1, block, hit: false };
    // the list stays sorted by s0 (the queries stop at the first box past the point)
    let i = this.boxes.length;
    while (i > 0 && this.boxes[i - 1].s0 > s0) i--;
    this.boxes.splice(i, 0, b);
    return b;
  }

  private newBlock(link: Link, s0: number, len: number, storeys: number, gap: number): Block {
    const r = this.rng;
    const theme = this.theme;
    const wall: Block['wall'] = theme === 'factory' ? (r.chance(0.7) ? 'b' : 'a') : theme === 'market' ? (r.chance(0.55) ? 'ap' : 'a') : theme === 'site' ? (r.chance(0.35) ? 'b' : 'a') : (r.chance(0.15) ? 'ap' : 'a');
    const b: Block = {
      i: this.blocks.length ? this.blocks[this.blocks.length - 1].i + 1 : 0,
      theme, district: this.district, s0, s1: s0 + len, y: storeys * STOREY, storeys, link, gap, wall,
      drop: { s: s0 + len * r.range(0.45, 0.7), x: r.range(-2.8, 2.8) },
      feature: null, seed: Math.floor(r.next() * 1e9),
    };
    this.blocks.push(b);
    this.box('roof', 'building', b.i, b.s0, b.s1, -HW, HW, 0, b.y);
    this.end = b.s1;
    this.lastY = b.y;
    return b;
  }

  private addStart(): void {
    // a long, quiet first roof, then a gentle opening (a small gap, a beam to slide under, a low
    // wall to vault, a cable): the tutorial's prompts meet each of them
    const a = this.newBlock('start', -12, TILE * 16, 5, 0);
    a.drop = { s: a.s1 - 8, x: 0 };
    this.stampLine(a, 14, 0, 6, 1.6);
    const b = this.linkGap(a, 3.2, 0);
    this.obstacle(b, 'overBeam', b.s0 + 8, 0);
    this.stampLine(b, b.s0 + 3, -2, 4, 1.6);
    const c = this.linkGap(b, 3.6, -1);
    this.obstacle(c, 'lowWall', c.s0 + 8, 0);
    this.flock(c, c.s1 - 5, 1.5, false);
    this.lastLink = 'gap';
    this.linkZip(c, 11, -1);
    this.sinceFeature = 0;
  }

  private addBlock(): void {
    const r = this.rng;
    const prev = this.blocks[this.blocks.length - 1];
    const s = prev.s1;
    const hard = this.hardness(s, this.district);
    const w: Partial<Record<Link, number>> = { ...LINKS[this.theme] };
    // no two features of a kind in a row; plain gaps more often after a feature
    if (this.lastLink !== 'gap' && this.lastLink !== 'flat') w[this.lastLink] = (w[this.lastLink] ?? 0) * 0.25;
    if (this.sinceFeature === 0) { w.gap = (w.gap ?? 0) * 1.6; w.flat = (w.flat ?? 0) * 1.3; }
    // heights stay between 4 and 9 storeys
    const storeys = prev.storeys;
    if (storeys >= 8) { w.ladder = 0; w.scaffold = 0; w.awning = 0; }
    if (storeys <= 4) { w.zip = 0; }
    const link = r.weighted(w);
    let b: Block;
    switch (link) {
      case 'flat': b = this.linkFlat(prev, r.chance(0.35) && storeys > 4 ? -1 : 0); break;
      case 'ladder': b = this.linkLadder(prev, r.chance(0.6) ? 1 : 2, r.chance(0.5) ? 0 : r.range(1.4, 2.4)); break;
      case 'scaffold': b = this.linkScaffold(prev, r.chance(0.55) ? 1 : 2); break;
      case 'awning': b = this.linkAwning(prev, r.chance(0.5) ? 2 : 1, r.range(2.4, 3.8 + hard)); break;
      case 'zip': b = this.linkZip(prev, r.range(10, 13 + hard * 4), storeys >= 7 && r.chance(0.5) ? -2 : -1); break;
      case 'beam': case 'plank': b = this.linkBridge(prev, link, r.range(8.5, 10.5 + hard * 3)); break;
      case 'kicker': b = this.linkKicker(prev, Math.min(r.range(6, 8 + hard * 3), this.speedAt(s) * 0.95)); break;
      default: {
        const v = this.speedAt(s);
        // a jump's reach at this speed (held, level): the widest gaps ask for most of it
        const reach = v * 0.8 * this.tune.gaps;
        const dy = storeys >= 7 && r.chance(0.35) ? -2 : storeys > 4 && r.chance(0.4) ? -1 : storeys < 8 && r.chance(0.18) ? 1 : 0;
        const lo = 2.2, hi = lerp(3.6, reach * 0.86, hard) + (dy < 0 ? 1.2 * -dy : dy > 0 ? -1.4 : 0);
        b = this.linkGap(prev, clamp(r.range(lo, Math.max(lo + 0.5, hi)), 2, 11), dy);
      }
    }
    this.sinceFeature = link === 'gap' || link === 'flat' ? this.sinceFeature + 1 : 0;
    this.lastLink = link;
    this.dress(b, hard);
  }

  /** A block of `tiles` length at a gap and a height change from `prev`. */
  private next(prev: Block, link: Link, gap: number, dy: number, tiles?: number): Block {
    const r = this.rng;
    const n = tiles ?? r.int(3, 6);
    const storeys = clamp(prev.storeys + dy, 4, 9);
    return this.newBlock(link, prev.s1 + gap, TILE * n, storeys, gap);
  }

  private linkGap(prev: Block, gap: number, dy: number): Block {
    return this.next(prev, 'gap', gap * (dy === 0 ? this.tune.gaps : 1), dy);
  }

  private linkFlat(prev: Block, dy: number): Block {
    const b = this.next(prev, 'flat', 0, dy);
    // a parapet on the line between the two roofs when they are level: vault it
    if (dy === 0 && this.rng.chance(0.6)) this.obstacle(b, 'parapet', b.s0 + 0.4, 0);
    return b;
  }

  private linkLadder(prev: Block, up: number, gap: number): Block {
    const b = this.next(prev, 'ladder', gap, up);
    const w = 2.6 + this.tune.grab * 2;
    const cx = this.rng.range(-HW + w / 2 + 0.3, HW - w / 2 - 0.3);
    b.feature = { x0: cx - w / 2, x1: cx + w / 2 };
    this.ladders.push({ s: b.s0, x0: cx - w / 2, x1: cx + w / 2, y0: prev.y - (gap > 0 ? STOREY : 0.5), y1: b.y, kind: 'ladder', block: b.i });
    return b;
  }

  private linkScaffold(prev: Block, up: number): Block {
    const b = this.next(prev, 'scaffold', TILE, up);
    const left = this.rng.chance(0.5);
    const x0 = left ? -HW : -HW + TILE, x1 = left ? HW - TILE : HW;
    b.feature = { x0, x1 };
    this.box('scaf', 'scaffold', b.i, b.s0 - TILE, b.s0, x0, x1, 0, b.y);
    this.ladders.push({ s: b.s0 - TILE, x0, x1, y0: prev.y - STOREY, y1: b.y, kind: 'scaffold', block: b.i });
    return b;
  }

  private linkAwning(prev: Block, up: number, gap: number): Block {
    const b = this.next(prev, 'awning', gap, up);
    const w = 4.6 + this.tune.grab * 3;
    const cx = this.rng.range(-HW + w / 2, HW - w / 2);
    b.feature = { x0: cx - w / 2, x1: cx + w / 2 };
    const depth = Math.min(gap + 0.4, 2.7);
    this.box('awning', 'awning', b.i, b.s0 - depth, b.s0, cx - w / 2, cx + w / 2, prev.y + 0.15, prev.y + 0.55);
    // stamps along the bounce
    for (let k = 0; k < 4; k++) this.pickup('stamp', b.s0 - 0.6 + k * 0.9, cx, prev.y + 2.5 + k * 1.6, b.i);
    return b;
  }

  private linkZip(prev: Block, gap: number, down: number): Block {
    const b = this.next(prev, 'zip', gap, down, this.rng.int(4, 6));
    const x = this.rng.range(-HW + 1.4, HW - 1.4);
    b.feature = { x0: x - 0.6, x1: x + 0.6 };
    const z: Zip = { id: this.nextId++, sa: prev.s1 - 3, ya: prev.y + 3.3, sb: b.s0 + 3, yb: b.y + 2.85, x, block: b.i };
    this.zips.push(z);
    // stamps under the cable
    for (let k = 1; k <= 5; k++) {
      const s = z.sa + (z.sb - z.sa) * (0.2 + k * 0.12);
      this.pickup('stamp', s, x, this.cableY(z, s) - 1.4, b.i);
    }
    return b;
  }

  private linkBridge(prev: Block, kind: 'beam' | 'plank', gap: number): Block {
    const b = this.next(prev, kind, gap, 0);
    const w = (kind === 'beam' ? 1.15 : 1.75) + this.tune.grab;
    const cx = this.rng.range(-HW + w / 2 + 0.5, HW - w / 2 - 0.5);
    b.feature = { x0: cx - w / 2, x1: cx + w / 2 };
    this.box('bridge', kind, b.i, prev.s1 - 0.4, b.s0 + 0.4, cx - w / 2, cx + w / 2, prev.y - 0.3, prev.y);
    for (let k = 0; k < 5; k++) this.pickup('stamp', prev.s1 + (k + 0.5) * gap / 5, cx, prev.y + 0.9, b.i);
    return b;
  }

  private linkKicker(prev: Block, gap: number): Block {
    // the ramp stands at the end of the previous roof
    const len = TILE, h = 1.5;
    this.ramps.push({ s0: prev.s1 - len, s1: prev.s1, x0: -HW, x1: HW, ya: prev.y, yb: prev.y + h, block: prev.i });
    const b = this.next(prev, 'kicker', gap, this.rng.chance(0.5) ? -1 : 0);
    b.feature = { x0: -HW, x1: HW };
    const x = this.rng.range(-2.5, 2.5);
    for (let k = 0; k < 5; k++) this.pickup('stamp', prev.s1 + (k + 0.5) * gap / 5, x, prev.y + h + 1.8 + Math.sin(Math.PI * (k + 0.5) / 5) * 1.6, b.i);
    return b;
  }

  // ------------------------------------------------------------------ roof contents

  private obstacle(b: Block, look: Look, s: number, x: number): Box {
    const [w, d, h] = OBSTACLE[look];
    const kind: BoxKind = look === 'overBeam' || look === 'overCable' || look === 'overScaf' ? 'over' : h <= 1.25 ? 'low' : 'tall';
    const x0 = clamp(x - w / 2, -HW, HW), x1 = clamp(x + w / 2, -HW, HW);
    const y0 = kind === 'over' ? b.y + OVER_Y : b.y;
    const y1 = kind === 'over' ? b.y + OVER_Y + h : b.y + h;
    return this.box(kind, look, b.i, s, s + d, x0, x1, y0, y1);
  }

  /** Obstacles, stamps, bottles, springs and pigeons on a new roof. */
  private dress(b: Block, hard: number): void {
    const r = this.rng;
    const C = CLUTTER[b.theme];
    const len = b.s1 - b.s0;
    // the roof's usable stretch: clear of the landing and of the take-off at the far end
    const from = b.s0 + (b.link === 'scaffold' || b.link === 'ladder' ? 4 : b.link === 'beam' || b.link === 'plank' || b.link === 'zip' || b.link === 'awning' ? 7.5 : 5.5);
    const to = b.s1 - 4.5;
    const dens = (0.35 + hard * 0.9) * this.tune.clutter;
    let s = from + r.range(0, 2);
    const spacing = lerp(9, 5.8, hard);
    while (s < to - 1) {
      // keep the drop spot free
      if (Math.abs(s - b.drop.s) < 3) { s = b.drop.s + 3; continue; }
      if (r.chance(Math.min(0.95, dens * (len / 18 + 0.4)))) {
        const t = r.weighted({ low: C.w[0], tall: C.w[1], over: C.w[2] } as Record<'low' | 'tall' | 'over', number>);
        if (t === 'tall') {
          // one or two pieces leaving a lane free
          const look = r.pick(C.tall);
          const [w] = OBSTACLE[look];
          const xa = r.range(-HW + w / 2, HW - w / 2);
          this.obstacle(b, look, s, xa);
          if (hard > 0.35 && r.chance(0.4)) {
            const side = xa > 0 ? -1 : 1;
            const xb = clamp(xa + side * (w + r.range(2.4, 3.6)), -HW + w / 2, HW - w / 2);
            if (Math.abs(xb - xa) > w + 2.2) this.obstacle(b, look, s + r.range(-0.5, 0.5), xb);
          }
          // stamps through the free lane
          if (r.chance(0.5)) this.stampLine(b, s - 2, xa > 0 ? xa - w / 2 - 1.3 : xa + w / 2 + 1.3, 3, 1.5);
        } else if (t === 'low') {
          const look = r.pick(C.low);
          const [w] = OBSTACLE[look];
          this.obstacle(b, look, s, w >= 6 ? r.range(-HW + w / 2, HW - w / 2) : r.range(-HW + w / 2, HW - w / 2));
          if (r.chance(0.45)) this.pickup('stamp', s + 0.2, clamp(r.range(-2, 2), -3, 3), b.y + 1.9, b.i);
        } else {
          this.obstacle(b, r.pick(C.over), s, 0);
          if (r.chance(0.5)) this.stampLine(b, s - 1.5, r.range(-2.5, 2.5), 3, 1.2, 0.45);
        }
        s += spacing + r.range(0, 3);
      } else s += r.range(3, 6);
    }
    // stamps in a line somewhere
    if (r.chance(0.55)) this.stampLine(b, b.s0 + r.range(2, 5), r.range(-3, 3), r.int(4, 7), 1.6);
    // a bottle (more time), a spring (big jumps)
    if (r.chance(0.13 + hard * 0.05)) this.pickup('bottle', b.s0 + len * r.range(0.3, 0.8), r.range(-3, 3), b.y + 0.9, b.i);
    else if (r.chance(0.07)) this.pickup('spring', b.s0 + len * r.range(0.3, 0.7), r.range(-3, 3), b.y + 0.9, b.i);
    // pigeons on the roof (a golden one now and then, further on)
    if (r.chance(0.32) && len >= 12) this.flock(b, b.s0 + len * r.range(0.35, 0.8), r.range(-3.2, 3.2), b.s0 > 250 && r.chance(0.09));
  }

  private stampLine(b: Block, s: number, x: number, n: number, step: number, y = 0.9): void {
    for (let k = 0; k < n; k++) {
      const ss = s + k * step;
      if (ss > b.s1 - 0.5) break;
      const ground = this.groundAt(ss, x, b.y + 3).y;
      // not inside an obstacle
      if (ground > b.y + 0.05) continue;
      this.pickup('stamp', ss, clamp(x, -HW + 0.6, HW - 0.6), b.y + y, b.i);
    }
  }

  private pickup(kind: PickupKind, s: number, x: number, y: number, block: number): void {
    this.pickups.push({ id: this.nextId++, kind, s, x, y, taken: false, block });
  }

  private flock(b: Block, s: number, x: number, gold: boolean): void {
    this.flocks.push({ id: this.nextId++, s, x, y: b.y, n: this.rng.int(3, 6), gold, startled: false, goldTaken: false, block: b.i });
  }
}
