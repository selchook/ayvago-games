// Hex Realm: the battle arenas as data (pure, seeded): the props the fight bumps into (colliders),
// the loose crates any blow breaks, where foes come in, where the hero starts and where a shrine may
// rise, and the scenery round it all (scenery.ts merges it into one mesh). The simulation (battle.ts)
// only reads the bounds, the colliders and the crates.
// 1.3: the scenery comes only from the Quaternius Medieval Village MegaKit (walls, floors, roofs,
// doors, windows, stairs, fences, crates, the wagon) and the Ultimate Nature Pack (trees, bushes,
// rocks, stumps, logs, grass, crops); nothing of the overworld's Hexagon Kit. The gameplay stream of
// 1.2 is kept draw for draw (`r`): every collider, crate, spawn point and shrine stands where it stood,
// and each prop takes its new look at its old place. The decoration has a stream of its own (`d`)
// and stays outside the floor, except the props that were always in play:
//   field      a meadow (the south's flowers, fence and cottage; the north's pines and boulders)
//   forest     a clearing ringed with pines, oaks and birches, stumps, logs and mossy rocks (snow in the north)
//   farm       the farmyard: fences, the farmhouse and barn, the wagon, wheat and corn
//   mine       timbered galleries: brick retaining walls, posts and beams, boulders, crates
//   cavern     the troll's cave: a ring of huge boulders, standing stones
//   fort       the ruined fort: broken walls and a gate, a stump of a tower, rubble, dead trees, vines
//   tower      the spire's hall: dark boards, plaster walls with round windows, stone pillars, stairs
//   spire      the open top: brick, a stone parapet, iron railings, the turrets' tiled roofs
//   docks      planks over the lake, posts, crates, the far shore's warehouse and willows, lilies
//   court      the dark castle's courtyard: brick, walls and towers with tiled roofs, the gate up its stairs
//   hall/throne the castle's halls: red brick and dark boards, windows, stone pillars, the dais
//   rift       a broken platform in the void, ruins and dead birches, rocks drifting below
import type { ArenaKind } from './defs';
import { villageKey, natureKey, type Placed } from './keys';

export interface Collider { x: number; z: number; r: number }
export interface ArenaLayout {
  kind: ArenaKind;
  hx: number;
  hz: number;
  /** The scenery (village and nature pieces). */
  deco: Placed[];
  colliders: Collider[];
  spawns: { x: number; z: number }[];
  hero: { x: number; z: number };
  shrine: { x: number; z: number };
  water: boolean;
  /** Torches and braziers: flames (x, y, z). */
  lights: [number, number, number][];
  /** Loose crates a blow breaks (drawn apart from the merged arena). */
  breakables: Breakable[];
}

export interface Breakable { key: string; x: number; z: number; rot: number; s: number; r: number }

/** The overworld region a fight is in (a look only: the north's pines and snow). */
export type ArenaLook = 'south' | 'north';

/** 1.2's grid: pillars, walls and props were laid out in steps of two units. */
const S = 2;
/** The village kit is in metres: a wall 2 × 3.12; × 0.7 a wall stands about twice the hero. */
const V = 0.7;
/** A wall piece's width and height in the arena. */
const WW = 2 * V, WH = 3.12 * V;

function rng(seed: number): () => number {
  let a = seed >>> 0 || 1;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), a | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const TREES = {
  oak: ['CommonTree_1', 'CommonTree_2', 'CommonTree_3', 'CommonTree_4', 'CommonTree_5'],
  pine: ['PineTree_1', 'PineTree_2', 'PineTree_3', 'PineTree_4', 'PineTree_5'],
  snowPine: ['PineTree_Snow_1', 'PineTree_Snow_2', 'PineTree_Snow_3'],
  birch: ['BirchTree_1', 'BirchTree_2', 'BirchTree_3'],
  autumn: ['CommonTree_Autumn_1', 'CommonTree_Autumn_2'],
  dead: ['CommonTree_Dead_1', 'CommonTree_Dead_2', 'CommonTree_Dead_3'],
  deadBirch: ['BirchTree_Dead_1', 'BirchTree_Dead_2', 'BirchTree_Dead_3'],
  willow: ['Willow_1', 'Willow_2', 'Willow_4'],
  /** Narrow ones for inside the arena (their crowns keep clear of the fight). */
  slim: ['PineTree_4', 'PineTree_5', 'BirchTree_2', 'BirchTree_3', 'CommonTree_3'],
};
const ROCKS = ['Rock_1', 'Rock_2', 'Rock_3', 'Rock_4', 'Rock_5', 'Rock_6', 'Rock_7'];
const MOSSY = ['Rock_Moss_1', 'Rock_Moss_2', 'Rock_Moss_3', 'Rock_Moss_4'];
const SNOWY = ['Rock_Snow_1', 'Rock_Snow_3', 'Rock_Snow_6'];
const BUSHES = ['Bush_1', 'Bush_2', 'BushBerries_1'];
const GRASS = ['Grass', 'Grass_Short', 'Grass_2', 'Grass_Short'];

type Style = 'plaster' | 'brick' | 'mixed';

class Builder {
  deco: Placed[] = [];
  colliders: Collider[] = [];
  lights: [number, number, number][] = [];
  breakables: Breakable[] = [];
  /** How each arena dresses 1.2's props at their places (name, x, z, turn, scale). */
  dress: (name: string, x: number, z: number, rot: number, s: number) => void = () => {};
  constructor(readonly hx: number, readonly hz: number, readonly r: () => number, readonly d: () => number) {}

  // ------------------------------------------------------------ 1.2's gameplay stream (kept draw for draw)

  piece(name: string, x: number, z: number, rot = 0, s = S): void { this.dress(name, x, z, rot, s); }
  block(x: number, z: number, r: number): void { this.colliders.push({ x, z, r }); }

  /** 1.2 laid hex tiles here; their draws are made (and dropped) so everything after keeps its place. */
  legacyFloor(edges: number, ring = 3): void {
    const HS = 2.2, w = 1 * HS, rh = (Math.sqrt(3) / 2) * HS;
    const rows = Math.ceil((this.hz + ring * rh) / rh), cols = Math.ceil((this.hx + ring * w) / w);
    for (let r = -rows; r <= rows; r++) {
      for (let c = -cols; c <= cols; c++) {
        const x = c * w + (r & 1 ? w / 2 : 0), z = r * rh;
        const outside = Math.abs(x) > this.hx + 0.9 || Math.abs(z) > this.hz + 0.9;
        const far = Math.abs(x) > this.hx + w * 1.6 || Math.abs(z) > this.hz + rh * 1.6;
        this.r();
        if (outside && edges && (far || this.r() < 0.55) && z > -this.hz - rh * 4) this.r();
      }
    }
  }

  /** `n` props from `list` scattered inside the arena (clear of the middle and the hero's start). */
  scatter(list: [string, number, number][], n: number, o: { margin?: number; clear?: number; collide?: boolean } = {}): void {
    const m = o.margin ?? 1.2, clear = o.clear ?? 3.2;
    let tries = 0;
    while (n > 0 && tries++ < 200) {
      const x = (this.r() * 2 - 1) * (this.hx - m), z = (this.r() * 2 - 1) * (this.hz - m);
      if (Math.hypot(x, z) < clear || Math.hypot(x, z - (this.hz - 3)) < 3) continue;
      if (this.colliders.some((c) => Math.hypot(c.x - x, c.z - z) < c.r + 1.6)) continue;
      const [name, s, r] = list[Math.floor(this.r() * list.length)];
      this.piece(name, x, z, this.r() * Math.PI * 2, S * s);
      if (o.collide !== false && r > 0) this.block(x, z, r);
      n--;
    }
  }

  /** `n` loose crates a blow breaks, clear of the middle, the hero's start and other props. */
  loose(n: number): void {
    // 1.2's barrel, crate and small crate (their radii), now the village kit's crate at three sizes
    const list: [number, number][] = [[0.7, 0.42], [0.8, 0.45], [0.62, 0.38]];
    let tries = 0;
    while (n > 0 && tries++ < 200) {
      const x = (this.r() * 2 - 1) * (this.hx - 1.4), z = (this.r() * 2 - 1) * (this.hz - 1.4);
      if (Math.hypot(x, z) < 3.4 || Math.hypot(x, z - (this.hz - 3)) < 3.2) continue;
      if (this.colliders.some((c) => Math.hypot(c.x - x, c.z - z) < c.r + 1.6)) continue;
      if (this.breakables.some((c) => Math.hypot(c.x - x, c.z - z) < 2.2)) continue;
      const [sc, rad] = list[Math.floor(this.r() * list.length)];
      this.breakables.push({ key: villageKey('Prop_Crate'), x, z, rot: this.r() * Math.PI * 2, s: sc, r: rad });
      n--;
    }
  }

  /** Trees inside the arena (1.2's places), each a collider; `pick` gives the model. */
  trees(n: number, pick: () => string): void {
    let tries = 0;
    while (n > 0 && tries++ < 200) {
      const x = (this.r() * 2 - 1) * (this.hx - 1.2), z = (this.r() * 2 - 1) * (this.hz - 1.5);
      if (Math.hypot(x, z) < 3 || Math.hypot(x, z - (this.hz - 3)) < 3) continue;
      if (this.colliders.some((c) => Math.hypot(c.x - x, c.z - z) < c.r + 1.8)) continue;
      const rot = this.r() * 6, s = 4 + this.r() * 1.2;
      this.nat(pick(), x, z, rot, 0.95 + (s - 4) * 0.15);
      this.block(x, z, 0.45);
      n--;
    }
  }

  /** Props hugging the walls (decor that never blocks the middle). */
  edges(list: [string, number][], n: number): void {
    for (let i = 0; i < n; i++) {
      const [name, s] = list[Math.floor(this.r() * list.length)];
      const side = Math.floor(this.r() * 3);
      const u = this.r() * 2 - 1;
      const x = side === 0 ? u * (this.hx - 0.8) : side === 1 ? -this.hx + 0.6 : this.hx - 0.6;
      const z = side === 0 ? -this.hz + 0.6 : u * (this.hz - 2);
      this.piece(name, x, z, this.r() * Math.PI * 2, S * s);
      this.block(x, z, 0.55 * s * S * 0.5);
    }
  }

  // ------------------------------------------------------------ the scenery (its own stream)

  vil(name: string, x: number, z: number, rot = 0, s = V, y = 0, sy?: number, tint?: number): void {
    this.deco.push({ key: villageKey(name), x, y, z, rot, s, sy, tint });
  }
  nat(name: string, x: number, z: number, rot = 0, s = 1, y = 0, tint?: number): void {
    this.deco.push({ key: natureKey(name), x, y, z, rot, s, tint });
  }
  pick<T>(list: readonly T[]): T { return list[Math.floor(this.d() * list.length)]; }
  /** A slight shade per placement, so repeated models differ. */
  shade(k = 0.18): number {
    const v = 1 - this.d() * k;
    const c = Math.round(v * 255);
    return (c << 16) | (Math.round(Math.min(1, v + 0.04) * 255) << 8) | c;
  }

  private seedN = -1;
  /** A smooth noise in 0…1 over the arena (patches of floor and ground). */
  noise(x: number, z: number, f = 0.22): number {
    if (this.seedN < 0) this.seedN = this.d() * 1000;
    const h = (i: number, j: number) => { const t = Math.sin(i * 127.1 + j * 311.7 + this.seedN) * 43758.5453; return t - Math.floor(t); };
    x *= f; z *= f;
    const i = Math.floor(x), j = Math.floor(z), fx = x - i, fz = z - j;
    const u = fx * fx * (3 - 2 * fx), v = fz * fz * (3 - 2 * fz);
    return (h(i, j) * (1 - u) + h(i + 1, j) * u) * (1 - v) + (h(i, j + 1) * (1 - u) + h(i + 1, j + 1) * u) * v;
  }

  /**
   * A floor of village tiles laid straight (so their bricks and boards run on) over the arena and
   * `margin` tiles round it; `pick(x, z, inside)` names each (null: none; `inside`: it touches the floor
   * the fight walks on, which never has holes).
   */
  tiles(pick: (x: number, z: number, inside: boolean) => string | null, margin = 1, y = 0.005, rot = 0): void {
    const st = 2 * V;
    const nx = Math.ceil(this.hx / st) + margin, nz = Math.ceil(this.hz / st) + margin;
    for (let i = -nx; i <= nx; i++) for (let j = -nz; j <= nz; j++) {
      const x = i * st, z = j * st;
      const inside = Math.abs(x) - st / 2 < this.hx && Math.abs(z) - st / 2 < this.hz;
      const nm = pick(x, z, inside);
      if (nm) this.vil(nm, x, z, rot, V, y);
    }
  }

  /** A row of wall pieces from x0 to x1 at z (facing +z when rot is 0); `pick(i)` names each. */
  wallRow(pick: (i: number) => string | null, x0: number, x1: number, z: number, rot: number, y = 0, sy?: number): void {
    const n = Math.max(1, Math.round((x1 - x0) / WW));
    for (let i = 0; i < n; i++) {
      const nm = pick(i);
      if (nm) this.vil(nm, x0 + (i + 0.5) * WW, z, rot, V, y, sy);
    }
  }
  /** The same down a side, from z0 to z1 at x (rot ±π/2 faces the arena). */
  wallCol(pick: (j: number) => string | null, z0: number, z1: number, x: number, rot: number, y = 0, sy?: number): void {
    const n = Math.max(1, Math.round((z1 - z0) / WW));
    for (let j = 0; j < n; j++) {
      const nm = pick(j);
      if (nm) this.vil(nm, x, z0 + (j + 0.5) * WW, rot, V, y, sy);
    }
  }

  /** A wooden fence from (x0, z0) to (x1, z1), with gaps where `gap(i)` says. */
  fence(x0: number, z0: number, x1: number, z1: number, gap: (i: number) => boolean = () => false): void {
    const len = Math.hypot(x1 - x0, z1 - z0), n = Math.max(1, Math.round(len / (2.04 * V)));
    const rot = Math.atan2(-(z1 - z0), x1 - x0);
    for (let i = 0; i < n; i++) {
      if (gap(i)) continue;
      const k = (i + 0.5) / n;
      this.vil(i % 3 === 1 ? 'Prop_WoodenFence_Extension1' : 'Prop_WoodenFence_Single', x0 + (x1 - x0) * k, z0 + (z1 - z0) * k, rot, V * 1.02, 0, undefined, this.shade(0.12));
    }
  }

  /**
   * A house of `w` × `d` wall pieces and `floors` storeys, its front facing `rot` (0: the camera),
   * centred on (cx, cz): walls with a door and windows, corner posts, a round-tile roof with gables.
   */
  house(cx: number, cz: number, w: number, d: number, floors: number, style: Style, rot = 0, o: { door?: boolean; vines?: boolean; chimney?: boolean; roof?: boolean } = {}): void {
    const c = Math.cos(rot), s = Math.sin(rot);
    const put = (name: string, lx: number, lz: number, lrot: number, y = 0, sc = V) => {
      // local metres (× V) turned round the house's middle
      const x = lx * sc, z = lz * sc;
      this.vil(name, cx + x * c + z * s, cz - x * s + z * c, rot + lrot, sc, y * V);
    };
    const wall = (floor: number, kind: 'plain' | 'window' | 'door' | 'wide') => {
      const brick = style === 'brick' || (style === 'mixed' && floor === 0);
      const base = brick ? 'Wall_UnevenBrick_' : 'Wall_Plaster_';
      if (kind === 'door') return base + 'Door_Round';
      if (kind === 'window') return base + 'Window_Thin_Round';
      if (kind === 'wide') return base + 'Window_Wide_Round';
      return brick ? 'Wall_UnevenBrick_Straight' : this.d() < 0.35 ? 'Wall_Plaster_WoodGrid' : 'Wall_Plaster_Straight';
    };
    const doorAt = o.door === false ? -1 : Math.floor(w / 2);
    for (let f = 0; f < floors; f++) {
      const y = f * 3.12;
      for (let i = 0; i < w; i++) {
        const lx = -w + 1 + i * 2;
        const kind = f === 0 && i === doorAt ? 'door' : (i + f) % 2 === 0 ? 'window' : w > 2 && i % 2 ? 'wide' : 'plain';
        const nm = wall(f, kind);
        put(nm, lx, d, 0, y);
        if (kind === 'door') put('Door_4_Round', lx - 0.55, d - 0.12, 0, y + 0.02);
        if (kind === 'window') { put('Window_Thin_Round1', lx, d - 0.1, 0, y); if (this.d() < 0.6) put('WindowShutters_Thin_Round_Open', lx, d - 0.12, 0, y); }
        if (kind === 'wide') put('Window_Wide_Round1', lx, d - 0.1, 0, y);
        put(wall(f, (i + f) % 2 ? 'window' : 'plain'), lx, -d, Math.PI, y);
      }
      for (let j = 0; j < d; j++) {
        const lz = -d + 1 + j * 2;
        put(wall(f, j % 2 ? 'window' : 'plain'), -w, lz, -Math.PI / 2, y);
        put(wall(f, j % 2 ? 'plain' : 'window'), w, lz, Math.PI / 2, y);
      }
      for (const [px, pz] of [[-w, d], [w, d], [-w, -d], [w, -d]]) put('Corner_Exterior_Wood', px, pz, 0, y);
    }
    const top = floors * 3.12;
    if (o.roof === false) return;
    const roof = d >= 3 ? 'Roof_RoundTiles_4x6' : 'Roof_RoundTiles_4x4';
    put(roof, 0, 0, 0, top);
    // the gables close the roof's open ends
    put('Roof_Front_Brick4', 0, d, 0, top);
    put('Roof_Front_Brick4', 0, -d, Math.PI, top);
    if (o.chimney) put('Prop_Chimney2', w - 0.8, -d + 1, 0, top - 0.5);
    if (o.vines) put(this.pick(['Prop_Vine1', 'Prop_Vine2']), -w + 1, d + 0.12, 0, 2.6);
  }

  /**
   * `n` nature models from `list` in the band outside the floor (x beyond ±hx + in, z behind
   * -hz - in, their footprint `rad` × scale clear of it too), not nearer than `gap` to each other.
   */
  ring(list: readonly string[], n: number, o: { in?: number; out?: number; back?: number; s?: [number, number]; gap?: number; front?: boolean; tint?: number; rad?: number; y?: number } = {}): void {
    const inn = o.in ?? 1.2, out = o.out ?? 9, back = o.back ?? 12, gap = o.gap ?? 1.6, rad = o.rad ?? 0.3;
    const [s0, s1] = o.s ?? [1, 1.3];
    const placed: [number, number][] = [];
    let tries = 0;
    while (n > 0 && tries++ < n * 40 + 200) {
      const x = (this.d() * 2 - 1) * (this.hx + out), z = -this.hz - back + this.d() * (this.hz * 2 + back + (o.front ? 3 : 0));
      const sc = s0 + this.d() * (s1 - s0), m = inn + rad * sc;
      const inside = Math.abs(x) < this.hx + m && z > -this.hz - m && (o.front || z < this.hz + m);
      if (inside || (!o.front && z > this.hz + 0.5 && Math.abs(x) < this.hx + 3)) continue;
      if (placed.some(([px, pz]) => Math.hypot(px - x, pz - z) < gap)) continue;
      placed.push([x, z]);
      this.nat(this.pick(list), x, z, this.d() * Math.PI * 2, sc, o.y ?? 0, o.tint ?? this.shade(0.2));
      n--;
    }
  }

  /** A few small tufts on the floor itself (sparse, low: they never hide a warning). */
  tufts(list: readonly string[], n: number, s = 0.6): void {
    for (let i = 0; i < n; i++) {
      const x = (this.d() * 2 - 1) * (this.hx - 0.5), z = (this.d() * 2 - 1) * (this.hz - 0.5);
      this.nat(this.pick(list), x, z, this.d() * 6, s * (0.7 + this.d() * 0.5), 0, this.shade(0.3));
    }
  }

  /** Small things (grass, flowers) along the floor's inner margin, where nobody fights. */
  fringe(list: readonly string[], n: number, s = 0.8): void {
    for (let i = 0; i < n; i++) {
      const side = Math.floor(this.d() * 3);
      const u = this.d() * 2 - 1;
      const x = side === 0 ? u * (this.hx + 0.6) : (side === 1 ? -1 : 1) * (this.hx + 0.2 + this.d() * 0.8);
      const z = side === 0 ? -this.hz - 0.2 - this.d() * 0.8 : u * this.hz;
      this.nat(this.pick(list), x, z, this.d() * 6, s * (0.8 + this.d() * 0.5), 0, this.shade(0.25));
    }
  }

  /** A crate stack (two or three crates). */
  crates(x: number, z: number, rot: number, s = 0.75): void {
    this.vil('Prop_Crate', x, z, rot, s);
    if (this.d() < 0.7) this.vil('Prop_Crate', x + 0.25 * s, z - 0.1, rot + 0.4, s * 0.72, 1.06 * s);
    if (this.d() < 0.4) this.vil('Prop_Crate', x - 0.9 * s, z + 0.2, rot - 0.3, s * 0.8);
  }

  /** A pile of loose bricks. */
  rubble(x: number, z: number, n = 5, spread = 0.6): void {
    for (let i = 0; i < n; i++) {
      const a = this.d() * Math.PI * 2, rr = this.d() * spread;
      this.vil(this.pick(['Prop_Brick1', 'Prop_Brick2', 'Prop_Brick3']), x + Math.cos(a) * rr, z + Math.sin(a) * rr, this.d() * 6, 1.1 + this.d() * 0.5, 0, undefined, this.shade(0.2));
    }
  }

  /** A stone pillar (a brick chimney stack), `h` its height in units; broken ones lean a little. */
  pillar(x: number, z: number, h: number, rot = 0, broken = false): void {
    const sc = 0.62;
    this.deco.push({ key: villageKey('Prop_Chimney'), x, y: 0, z, rot, s: sc, sy: h / 3.18, tilt: broken ? (this.d() - 0.5) * 0.12 : 0 });
    if (broken) this.rubble(x + 0.3, z + 0.35, 4, 0.5);
  }

  /** A torch on a wall facing `rot` (an iron bracket under the flame the view draws). */
  torch(x: number, y: number, z: number, rot: number): void {
    this.lights.push([x + Math.sin(rot) * 0.18, y, z + Math.cos(rot) * 0.18]);
    this.vil('Prop_Support', x, z, rot + Math.PI / 2, 0.32, y - 0.62);
  }

  /** A timber post (a corner post of the kit), `h` units high, `w` its thickness (× 0.21). */
  post(x: number, z: number, h: number, rot = 0, w = 1.5): void { this.vil('Corner_Exterior_Wood', x, z, rot, w, 0, h / 3); }
}

/** Where foes come in: along the far side and down the flanks. */
function spawnPoints(hx: number, hz: number): { x: number; z: number }[] {
  const out: { x: number; z: number }[] = [];
  for (let i = 0; i < 6; i++) out.push({ x: -hx + 1.4 + ((hx * 2 - 2.8) * i) / 5, z: -hz + 1.4 });
  for (const s of [-1, 1]) for (let j = 0; j < 3; j++) out.push({ x: s * (hx - 1.2), z: -hz + 3.6 + j * 3.0 });
  return out;
}

export function buildArena(kind: ArenaKind, seed: number, look: ArenaLook = 'south'): ArenaLayout {
  const r = rng(seed * 7919 + kind.length * 31);
  const d = rng(seed * 4099 + kind.length * 17 + 7);
  const big = kind === 'cavern' || kind === 'spire' || kind === 'throne';
  // landscape: wider than deep (1.1's portrait arenas were 15 × 21)
  const hx = big ? 12 : 11, hz = big ? 8.5 : 7.5;
  const b = new Builder(hx, hz, r, d);
  const north = look === 'north';
  let water = false;
  /** Back wall line, side wall line. */
  const BZ = -hz - 0.6, SX = hx + 0.6;
  switch (kind) {
    case 'field':
    case 'forest': {
      const forest = kind === 'forest';
      const inner = forest ? (north ? ['PineTree_Snow_1', 'PineTree_Snow_2', 'PineTree_4', 'PineTree_5'] : TREES.slim) : north ? ['PineTree_4', 'PineTree_5', 'BirchTree_Dead_2'] : ['CommonTree_3', 'BirchTree_2', 'BirchTree_3'];
      b.dress = (name, x, z, rot) => {
        // 1.2's bricks (r 0.4): a boulder of that size; its crate: a stack
        if (name === 'bricks') b.nat(b.pick(north ? SNOWY : MOSSY), x, z, rot, 1.15, -0.05, b.shade());
        else b.crates(x, z, rot, 0.62);
      };
      b.legacyFloor(1);
      b.trees(forest ? 7 : 3, () => b.pick(inner));
      if (!forest) b.scatter([['bricks', 1.1, 0.4], ['detail-crate', 1.0, 0.4]], 2);
      b.loose(forest ? 2 : 3);
      // the scenery
      if (forest) {
        const ringTrees = north ? [...TREES.snowPine, ...TREES.snowPine, ...TREES.pine, 'BirchTree_Dead_1'] : [...TREES.pine, ...TREES.oak, ...TREES.birch, ...TREES.autumn];
        b.ring(ringTrees, 46, { in: 0.8, out: 10, back: 13, s: [1.15, 1.6], gap: 1.7 });
        b.ring(north ? ['Bush_Snow_1', ...SNOWY] : [...BUSHES, ...MOSSY], 16, { in: 0.3, out: 6, back: 4, s: [0.9, 1.4], gap: 1.1, rad: 0.6 });
        b.ring(north ? ['TreeStump', 'WoodLog', 'Bush_Snow_1'] : ['TreeStump_Moss', 'WoodLog_Moss', 'TreeStump', 'Plant_3', 'Plant_1'], 10, { in: 0.3, out: 5, back: 3, s: [0.9, 1.2], gap: 1.2, rad: 0.7, tint: north ? 0xe0e6ee : undefined });
        // fallen logs along the far edge, where 1.2's fence stood
        for (let x = -hx + 2; x < hx - 1; x += 4.2 + b.d() * 2) b.nat(north ? 'WoodLog' : b.pick(['WoodLog', 'WoodLog_Moss']), x, BZ - 0.5, Math.PI / 2 + (b.d() - 0.5) * 0.4, 1.1, 0, north ? 0xe8eef4 : undefined);
        b.fringe(north ? ['Grass_Short', 'Rock_Snow_3'] : [...GRASS, 'Plant_1', 'Flowers'], 40);
        b.tufts(north ? ['Grass_Short'] : ['Grass_Short', 'Grass_Short', 'Flowers'], 14);
      } else if (north) {
        b.ring([...TREES.pine, ...TREES.snowPine, ...TREES.dead], 30, { in: 1.4, out: 10, back: 13, s: [1.1, 1.5], gap: 2.2 });
        b.ring([...ROCKS, ...SNOWY], 22, { in: 0.3, out: 9, back: 12, s: [1.6, 3.4], gap: 1.6, rad: 0.5 });
        b.fringe(['Grass_Short', 'Grass', 'Rock_2', 'Rock_5'], 34);
        b.tufts(['Grass_Short', 'Rock_2', 'Rock_3'], 12, 0.5);
      } else {
        // the south's meadow: a fence along the far side, a cottage beyond it, oaks and birches, flowers
        b.fence(-hx, BZ + 0.2, hx, BZ + 0.2, (i) => i === 7 || i === 8);
        b.house(-6.5 + d() * 3, BZ - 6.5, 2, 2, d() < 0.5 ? 2 : 1, 'plaster', 0, { vines: true, chimney: true });
        b.vil('Prop_Wagon', 4 + d() * 3, BZ - 3.2, 1.2 + d() * 0.6, V * 0.95);
        b.ring([...TREES.oak, ...TREES.birch], 26, { in: 1.6, out: 10, back: 14, s: [1.1, 1.5], gap: 2.4 });
        b.ring(BUSHES, 14, { in: 0.3, out: 6, back: 4, s: [0.9, 1.3], gap: 1.2, rad: 0.6 });
        b.ring(['Flowers', 'Flowers', 'Plant_1', 'Rock_Moss_3'], 18, { in: 0.3, out: 6, back: 5, s: [0.8, 1.2], gap: 0.8, rad: 0.4 });
        b.fringe([...GRASS, 'Flowers'], 40);
        b.tufts(['Grass_Short', 'Flowers', 'Grass_Short'], 16);
      }
      break;
    }
    case 'farm': {
      b.dress = (name, x, z, rot) => {
        if (name === 'barrels') { b.vil('Prop_Crate', x, z, rot, 0.78); b.vil('Prop_Crate', x, z, rot + 0.5, 0.55, 0.82); }
        else if (name === 'detail-crate-small') b.vil('Prop_Crate', x, z, rot, 0.75);
        else if (name === 'detail-barrel') b.crates(x, z, rot, 0.68);
        else b.crates(x, z, rot, 0.62);
      };
      b.legacyFloor(5);
      b.scatter([['detail-crate', 1.1, 0.4], ['barrels', 1.0, 0.45], ['detail-crate-ropes', 1.1, 0.4]], 5);
      b.edges([['detail-crate-small', 1.2], ['detail-barrel', 1.1]], 5);
      b.loose(4);
      // the yard's fences, the farmhouse and the barn behind it, the wagon, the crops
      b.fence(-hx - 0.2, BZ + 0.2, hx + 0.2, BZ + 0.2, (i) => i === 5 || i === 6);
      b.fence(-SX, BZ + 0.2, -SX, hz + 1);
      b.fence(SX, BZ + 0.2, SX, hz + 1, (i) => i === 4);
      b.house(-4.5, BZ - 4.6, 3, 2, 2, 'mixed', 0, { vines: true, chimney: true });
      b.house(5.5, BZ - 4.2, 2, 3, 1, 'plaster', 0, { door: true });
      b.vil('Prop_Wagon', 1.2, BZ - 2.2, -1.35, V);
      b.crates(9.5, BZ - 1.6, 0.4, 0.7);
      for (const sx of [-1, 1]) {
        // a field of wheat or corn beyond each side fence
        const crop = sx < 0 ? 'Wheat' : 'Corn_2', st = crop === 'Wheat' ? 1.0 : 1.25;
        for (let x = hx + 1.9; x < hx + 6.5; x += st) for (let z = -hz + 0.6; z < hz + 1; z += st) {
          b.nat(crop, sx * (x + (b.d() - 0.5) * 0.3), z + (b.d() - 0.5) * 0.3, b.d() * 6, crop === 'Wheat' ? 1.2 + b.d() * 0.3 : 1.0 + b.d() * 0.25, 0, b.shade(0.15));
        }
      }
      b.ring([...TREES.oak, 'Willow_1'], 14, { in: 10, out: 14, back: 15, s: [1.2, 1.6], gap: 3 });
      b.fringe([...GRASS, 'Flowers'], 28);
      b.tufts(['Grass_Short', 'Grass_Short', 'Flowers'], 12);
      break;
    }
    case 'mine':
    case 'cavern': {
      const mine = kind === 'mine';
      b.dress = (name, x, z, rot, s) => {
        // 1.2's bricks: a boulder the size of its collider (r 0.45 in the mine, 0.65 in the cave)
        if (name === 'bricks') { b.nat(b.pick(ROCKS), x, z, rot, s * 0.48, -0.1, 0xb8b0a8); b.nat(b.pick(ROCKS), x + s * 0.3, z + s * 0.2, rot + 1, s * 0.16, -0.05, 0xa8a098); }
        else if (name === 'column-wood') b.post(x, z, 2.6, 0, 2.9);
        else if (name === 'ladder') { b.post(x - 0.2, z, 1.6, rot, 1.4); b.post(x + 0.2, z, 1.6, rot, 1.4); }
        else if (name === 'barrels') { b.vil('Prop_Crate', x, z, rot, 0.8); b.vil('Prop_Crate', x, z, rot + 0.6, 0.58, 0.84); }
        else b.crates(x, z, rot, 0.68);
      };
      if (mine) {
        b.legacyFloor(3, 2);
        for (const x of [-6.6, 6.6]) for (const z of [-3.4, 2.4]) { b.dress('column-wood', x, z, 0, S * 0.8); b.block(x, z, 0.4); }
        b.edges([['detail-crate-ropes', 1.1], ['pulley-crate', 1.0], ['ladder', 1.0], ['barrels', 1.0]], 6);
        b.scatter([['detail-crate', 1.1, 0.4], ['bricks', 1.3, 0.45]], 2);
        b.loose(3);
        // the gallery: brick retaining walls, timber frames along them, the rock face above and beyond
        b.wallRow((i) => (i % 5 === 2 ? 'Wall_UnevenBrick_Door_Round' : 'Wall_UnevenBrick_Straight'), -hx - 1.4, hx + 1.4, BZ, 0);
        b.wallCol(() => 'Wall_UnevenBrick_Straight', -hz - 0.6, hz + 1.4, -SX - 0.2, Math.PI / 2);
        b.wallCol(() => 'Wall_UnevenBrick_Straight', -hz - 0.6, hz + 1.4, SX + 0.2, -Math.PI / 2);
        // posts along the far wall, a lintel log between each pair
        for (let x = -hx + 1; x <= hx - 1; x += 4.4) { b.post(x, BZ + 0.3, 2.3, 0, 2); if (x + 4.4 <= hx - 1) b.vil('Roof_Log', x + 2.2, BZ + 0.3, Math.PI / 2, 0.4, 2.25 - 3.85 * 0.4); }
        for (const sx of [-1, 1]) for (let z = -hz + 2; z <= hz; z += 4.2) b.post(sx * (SX - 0.1), z, 2.3, 0, 2);
        b.ring(ROCKS, 40, { in: 1.8, out: 9, back: 11, s: [2.4, 4.6], gap: 1.6, tint: 0x8a8078, rad: 0.4 });
        b.vil('Prop_Wagon', -hx + 2.6, BZ - 1.5, Math.PI / 2 + 0.2, V * 0.9);
        b.fringe(['Rock_2', 'Rock_3', 'Rock_5'], 26, 0.9);
        b.tufts(['Rock_2', 'Rock_3', 'Rock_5'], 10, 0.35);
      } else {
        b.legacyFloor(4, 4);
        b.scatter([['bricks', 1.8, 0.65]], 4, { clear: 4.5 });
        b.edges([['detail-crate-ropes', 1.1], ['barrels', 1.0], ['column-wood', 1.2]], 5);
        b.loose(2);
        // the troll's cave: boulders piled round the floor, standing stones, bones of old timber
        b.ring(ROCKS, 70, { in: 0.2, out: 10, back: 12, s: [2.4, 5.2], gap: 1.4, tint: 0x9a9088, rad: 0.42 });
        b.ring(['Rock_1', 'Rock_4', 'Rock_7'], 12, { in: 2.5, out: 9, back: 11, s: [4.5, 7], gap: 3, tint: 0x857c74, rad: 0.42 });
        for (const [x, z] of [[-hx + 2, BZ - 1.4], [hx - 3, BZ - 1.2], [-hx - 0.8, 2], [hx + 0.9, -1.5]] as [number, number][]) { b.post(x, z, 2.4, 0, 2.2); b.lights.push([x, 2.55, z + 0.12]); }
        b.fringe(['Rock_2', 'Rock_3', 'Rock_5', 'Rock_6'], 30, 1.1);
        b.tufts(['Rock_2', 'Rock_3', 'Rock_5'], 12, 0.35);
      }
      if (mine) for (const sx of [-1, 1]) for (const z of [-hz + 1, 0]) b.torch(sx * (SX + 0.08), 1.6, z, -sx * Math.PI / 2);
      break;
    }
    case 'fort': {
      b.dress = (name, x, z, rot) => {
        if (name === 'bricks') b.rubble(x, z, 6, 0.4);
        else b.pillar(x, z, name === 'column' ? 2.3 : 1.1 + b.d() * 0.6, rot, name !== 'column');
      };
      b.legacyFloor(3);
      b.scatter([['column-damaged', 1.1, 0.4], ['bricks', 1.3, 0.45], ['column', 1.1, 0.4]], 7);
      b.loose(2);
      // broken walls round a worn stone yard, the gate in the far wall, a stump of a tower in each far corner
      b.tiles((x, z, inside) => (inside || z > hz || b.noise(x, z, 0.5) > 0.45 ? 'Floor_UnevenBrick' : null), 2);
      const gate = Math.floor((hx * 2 + 2.8) / WW / 2);
      b.wallRow((i) => (i === gate ? 'Wall_UnevenBrick_Door_Round' : b.d() < 0.22 ? null : 'Wall_UnevenBrick_Straight'), -hx - 1.4, hx + 1.4, BZ - 1, 0, 0, 1);
      b.vil('Door_4_Round', -hx - 1.4 + (gate + 0.5) * WW - 0.55 * V, BZ - 1 - 0.12 * V, 0);
      for (const sx of [-1, 1]) b.wallCol(() => (b.d() < 0.3 ? null : 'Wall_UnevenBrick_Straight'), -hz - 1.6, hz + 1.4, sx * (SX + 1.2), -sx * Math.PI / 2, 0, 0.55 + b.d() * 0.45);
      for (const sx of [-1, 1]) {
        // a tower's stump: a roofless ring of brick, its stones round its foot
        const tx = sx * (hx + 2.8), tz = BZ - 2.4;
        b.house(tx, tz, 2, 2, 1, 'brick', 0, { door: false, roof: false });
        b.rubble(tx - sx * 1.6, tz + 1.8, 8, 0.9);
      }
      b.ring([...TREES.dead, 'CommonTree_4', 'BirchTree_Dead_3'], 18, { in: 2.6, out: 10, back: 13, s: [1.1, 1.5], gap: 2.6 });
      b.ring([...MOSSY, ...ROCKS], 20, { in: 1.4, out: 9, back: 11, s: [1.2, 2.6], gap: 1.4, rad: 0.45 });
      b.ring(['Bush_1', 'Grass', 'Plant_3'], 16, { in: 1.4, out: 7, back: 6, s: [0.9, 1.3], gap: 1, rad: 0.6 });
      for (let i = 0; i < 6; i++) b.vil(b.pick(['Prop_Vine1', 'Prop_Vine2', 'Prop_Vine5']), -hx + 1 + b.d() * (hx * 2 - 2), BZ - 1 + 0.15, 0, V, WH * 0.95);
      b.fringe([...GRASS, 'Rock_Moss_3'], 30);
      break;
    }
    case 'tower': {
      b.dress = (name, x, z, rot) => b.crates(x, z, rot, name === 'barrels' ? 0.72 : 0.62);
      for (const s of [-1, 1]) for (const x of [4, 7.5]) { b.pillar(s * x, -2.6, 2.6, 0); b.block(s * x, -2.6, 0.45); }
      b.edges([['barrels', 1.0], ['detail-crate-small', 1.2]], 4);
      b.loose(2);
      // dark boards with a light border, plaster walls with round windows, a stair up the far corner, a gallery over it
      b.tiles((x, z) => (Math.abs(x) > hx - 0.8 || Math.abs(z) > hz - 0.8 ? 'Floor_WoodLight' : 'Floor_WoodDark'), 1);
      b.wallRow((i) => (i % 3 === 1 ? 'Wall_Plaster_Window_Wide_Round' : 'Wall_Plaster_Straight'), -hx - 1.4, hx + 1.4, BZ, 0);
      b.wallRow(() => 'Wall_Plaster_Straight', -hx - 1.4, hx + 1.4, BZ, 0, WH);
      for (let i = 0; i < Math.round((hx * 2 + 2.8) / WW); i++) if (i % 3 === 1) b.vil('Window_Wide_Round1', -hx - 1.4 + (i + 0.5) * WW, BZ - 0.07, 0);
      for (const sx of [-1, 1]) {
        b.wallCol((j) => (j % 3 === 1 ? 'Wall_Plaster_Window_Thin_Round' : 'Wall_Plaster_Straight'), -hz - 0.6, hz + 1.4, sx * (SX + 0.2), -sx * Math.PI / 2);
        b.wallCol(() => 'Wall_Plaster_Straight', -hz - 0.6, hz + 1.4, sx * (SX + 0.2), -sx * Math.PI / 2, WH);
      }
      for (let x = -hx - 0.7; x < hx + 1.4; x += WW) b.vil('Balcony_Cross_Straight', x, BZ - 0.7 * V + 0.05, 0, V, WH - 0.1);
      for (const x of [-hx + 0.6, hx - 0.6]) b.crates(x, BZ + 0.7, 0.3, 0.62);
      for (const x of [-4, 4]) b.torch(x, 1.8, BZ + 0.1, 0);
      break;
    }
    case 'spire': {
      b.dress = () => {};
      b.legacyFloor(0, 1);
      for (const [x, z] of [[-6.5, -3.6], [6.5, -3.6], [-6.5, 3.4], [6.5, 3.4]] as [number, number][]) { b.pillar(x, z, 1.8, 0); b.block(x, z, 0.4); b.lights.push([x, 2.0, z]); }
      // brick paving with a red cross, a low stone parapet with iron railings, the turrets round it
      b.tiles((x, z) => (Math.abs(x) < 1 || Math.abs(z) < 1 ? 'Floor_RedBrick' : 'Floor_Brick'), 1);
      const lowWall = 0.42;
      b.wallRow(() => 'Wall_UnevenBrick_Straight', -hx - 1.4, hx + 1.4, -hz - 1.6, 0, 0, lowWall);
      for (const sx of [-1, 1]) b.wallCol(() => 'Wall_UnevenBrick_Straight', -hz - 1.6, hz + 1.6, sx * (hx + 1.6), -sx * Math.PI / 2, 0, lowWall);
      b.wallRow(() => 'Wall_UnevenBrick_Straight', -hx - 1.4, hx + 1.4, hz + 1.6, Math.PI, 0, lowWall);
      for (let x = -hx - 0.7; x <= hx + 0.7; x += 2.8) b.vil('Prop_MetalFence_Simple', x, -hz - 1.75, 0, V * 0.55, WH * lowWall);
      for (const sx of [-1, 1]) {
        // the turrets beside the top, under conical roofs
        const tx = sx * (hx + 4.4), tz = -hz - 3.6;
        b.house(tx, tz, 2, 2, 1, 'brick', 0, { door: false, roof: false });
        b.vil('Roof_Tower_RoundTiles', tx, tz, 0, V * 0.78, WH);
      }
      b.house(0, -hz - 9, 2, 2, 2, 'brick', 0, { door: false, roof: false });
      b.vil('Roof_Tower_RoundTiles', 0, -hz - 9, 0, V * 0.78, 2 * WH);
      break;
    }
    case 'docks': {
      water = true;
      b.dress = (name, x, z, rot) => {
        if (name === 'barrels') { b.vil('Prop_Crate', x, z, rot, 0.78); b.vil('Prop_Crate', x, z, rot + 0.5, 0.55, 0.82); }
        else if (name === 'pulley-crate') { b.crates(x, z, rot, 0.65); b.post(x + 0.55, z, 2.2, 0, 1.6); }
        else b.crates(x, z, rot, name === 'detail-crate-small' ? 0.62 : 0.66);
      };
      b.scatter([['barrels', 1.0, 0.45], ['detail-crate-ropes', 1.1, 0.4], ['pulley-crate', 0.9, 0.4]], 5);
      b.edges([['detail-barrel', 1.1], ['detail-crate-small', 1.2]], 5);
      b.loose(4);
      // the pier: light boards over the lake on posts, railings along the sides
      b.tiles((_x, _z, inside) => (inside ? 'Floor_WoodLight' : null), 1, 0.01);
      for (let x = -hx; x <= hx; x += 2.8) b.post(x, -hz - 0.75, 1.0, 0, 2);
      for (const sx of [-1, 1]) for (let z = -hz; z <= hz; z += 2.8) b.post(sx * (hx + 0.75), z, 1.0, 0, 2);
      for (const sx of [-1, 1]) b.fence(sx * (hx + 0.55), -hz - 0.8, sx * (hx + 0.55), hz + 1, (i) => i === 2 || i === 9);
      // the far shore: a warehouse, a house, willows, rocks; lilies on the water
      b.house(-5, -hz - 10, 3, 2, 2, 'brick', 0, { chimney: true });
      b.house(5.5, -hz - 10.5, 2, 2, 1, 'plaster', 0, {});
      for (let x = -hx - 6; x <= hx + 6; x += 3 + b.d() * 2.5) if (Math.abs(x + 5) > 3.5 && Math.abs(x - 5.5) > 2.8) b.nat(b.pick([...TREES.willow, 'CommonTree_2']), x, -hz - 8 - b.d() * 3, b.d() * 6, 1.3 + b.d() * 0.3, -0.3);
      b.ring(['Lilypad', 'Lilypad', 'Rock_6', 'Rock_3'], 22, { in: 1.6, out: 8, back: 5, s: [0.8, 1.4], gap: 1.6, front: true, y: -0.48, rad: 0.5 });
      break;
    }
    case 'court': {
      b.dress = (name, x, z, rot) => {
        if (name === 'bricks') b.rubble(x, z, 6, 0.4);
        else b.pillar(x, z, 1.3 + b.d() * 0.5, rot, true);
      };
      b.legacyFloor(3, 2);
      b.scatter([['column-damaged', 1.1, 0.4], ['bricks', 1.2, 0.4]], 5);
      b.loose(2);
      // the courtyard: brick paving in a stone frame, the keep's wall with its gate up a stair, towers with tiled roofs
      b.tiles((x, z) => (Math.abs(x) > hx - 0.8 || Math.abs(z) > hz - 0.8 ? 'Floor_UnevenBrick' : 'Floor_Brick'), 1);
      const gate = Math.floor((hx * 2 + 2.8) / WW / 2);
      const KZ = BZ - 1.4;
      b.wallRow(() => 'Wall_UnevenBrick_Straight', -hx - 1.4, hx + 1.4, KZ, 0, 0, 0.32);
      b.wallRow((i) => (i === gate ? 'Wall_UnevenBrick_Door_Round' : i % 3 === 0 ? 'Wall_UnevenBrick_Window_Thin_Round' : 'Wall_UnevenBrick_Straight'), -hx - 1.4, hx + 1.4, KZ, 0, WH * 0.32);
      b.wallRow(() => 'Wall_UnevenBrick_Straight', -hx - 1.4, hx + 1.4, KZ, 0, WH * 1.32);
      const gx = -hx - 1.4 + (gate + 0.5) * WW;
      b.vil('Door_4_Round', gx - 0.55 * V, KZ - 0.12 * V, 0, V, WH * 0.32);
      b.vil('Stairs_Exterior_Straight', gx, BZ - 0.55, Math.PI, V, 0, 0.75);
      for (const sx of [-1, 1]) b.torch(gx + sx * 2.1, 2.0 + WH * 0.32 - 0.4, KZ + 0.1, 0);
      for (let x = -hx - 0.7; x <= hx + 0.7; x += WW) if (Math.abs(x - gx) > 1) b.vil('Prop_ExteriorBorder_Straight1', x, KZ + 0.1, Math.PI, V);
      for (const sx of [-1, 1]) {
        b.wallCol((j) => (j % 4 === 2 ? 'Wall_UnevenBrick_Window_Thin_Round' : 'Wall_UnevenBrick_Straight'), KZ, hz + 1.4, sx * (SX + 0.2), -sx * Math.PI / 2);
        const tx = sx * (hx + 2.4), tz = KZ - 1.2;
        b.house(tx, tz, 2, 2, 3, 'brick', 0, { door: false, roof: false });
        b.vil('Roof_Tower_RoundTiles', tx, tz, 0, V * 0.78, 3 * WH);
      }
      for (let i = 0; i < 5; i++) b.vil(b.pick(['Prop_Vine1', 'Prop_Vine2', 'Prop_Vine5']), -hx + 1 + b.d() * (hx * 2 - 2), KZ + 0.15, 0, V, WH * 1.2);
      for (const sx of [-1, 1]) for (const z of [-2, 3]) b.vil('Prop_MetalFence_Ornament', sx * (SX - 0.05), z, -sx * Math.PI / 2, V * 0.6);
      b.ring(TREES.dead, 6, { in: 4, out: 9, back: 12, s: [1.2, 1.5], gap: 3 });
      break;
    }
    case 'hall':
    case 'throne': {
      b.dress = () => {};
      b.legacyFloor(2, 2);
      // two rows of pillars across the hall (the long side runs left to right)
      const xs = kind === 'hall' ? [3.4, 8] : [4, 8.8];
      const zs = kind === 'hall' ? [-3.6, 2.8] : [-4.4, 3];
      for (const s of [-1, 1]) for (const x of xs) for (const z of zs) { b.pillar(s * x, z, 3.0, 0); b.block(s * x, z, 0.45); if (x === xs[1]) b.torch(s * x, 2.2, z + 0.3, 0); }
      if (kind === 'hall') b.loose(2);
      // grey brick with a red aisle (across the hall; up to the dais in the throne room), walls with tall windows, a gallery
      const throne = kind === 'throne';
      b.tiles((x, z) => ((throne ? Math.abs(x) < 1.5 : Math.abs(z + 0.4) < 1.5) ? 'Floor_RedBrick' : 'Floor_Brick'), 1);
      b.wallRow((i) => (i % 2 ? 'Wall_UnevenBrick_Window_Thin_Round' : 'Wall_UnevenBrick_Straight'), -hx - 1.4, hx + 1.4, BZ, 0);
      b.wallRow((i) => (i % 2 ? 'Wall_UnevenBrick_Window_Wide_Round' : 'Wall_UnevenBrick_Straight'), -hx - 1.4, hx + 1.4, BZ, 0, WH);
      for (const sx of [-1, 1]) {
        b.wallCol((j) => (j % 3 === 1 ? 'Wall_UnevenBrick_Window_Thin_Round' : 'Wall_UnevenBrick_Straight'), -hz - 0.6, hz + 1.4, sx * (SX + 0.2), -sx * Math.PI / 2);
        b.wallCol(() => 'Wall_UnevenBrick_Straight', -hz - 0.6, hz + 1.4, sx * (SX + 0.2), -sx * Math.PI / 2, WH);
      }
      for (let x = -hx - 0.7; x < hx + 1.4; x += WW) b.vil('Balcony_Cross_Straight', x, BZ - 0.7 * V + 0.05, 0, V, WH - 0.1);
      if (throne) {
        // the dais: a stone platform up its steps, iron screens behind it
        for (const x of [-1.4, 0, 1.4]) b.vil('Stairs_Exterior_Platform', x, BZ - 0.1, 0, V, 0, 0.45);
        for (const x of [-1.4, 0, 1.4]) b.vil('Stairs_Exterior_Straight', x, BZ + 1.3, Math.PI, V, 0, 0.45);
        for (const x of [-2.4, 2.4]) b.vil('Prop_MetalFence_Ornament', x, BZ + 0.1, 0, V * 0.8);
      } else for (const x of [-hx + 1.2, hx - 1.2]) b.crates(x, BZ + 0.8, 0.5, 0.65);
      break;
    }
    case 'rift': {
      b.dress = (name, x, z, rot) => {
        if (name === 'bricks') b.rubble(x, z, 7, 0.45);
        else b.pillar(x, z, name === 'column' ? 2.2 : 1.0 + b.d() * 0.7, rot, name !== 'column');
      };
      b.legacyFloor(3);
      b.scatter([['column-damaged', 1.1, 0.4], ['bricks', 1.3, 0.45], ['column', 1.2, 0.4]], 6);
      // a broken platform of worn stone in the void, ruins along its far edge, dead birches, rocks adrift
      b.tiles((x, z, inside) => (inside || z > hz || b.noise(x, z, 0.6) > 0.5 ? 'Floor_UnevenBrick' : null), 2);
      b.wallRow((i) => (b.d() < 0.35 ? null : i % 4 === 1 ? 'Wall_UnevenBrick_Window_Thin_Round' : 'Wall_UnevenBrick_Straight'), -hx - 1.4, hx + 1.4, -hz - 1.6, 0, 0, 0.4 + d() * 0.6);
      b.ring(TREES.deadBirch, 8, { in: 1.4, out: 3, back: 2.5, s: [1.0, 1.3], gap: 2.5, tint: 0xc8b8e8 });
      for (let i = 0; i < 26; i++) {
        const a = d() * Math.PI * 2, rr = 15 + d() * 14;
        b.nat(b.pick(ROCKS), Math.cos(a) * rr * 1.3, Math.sin(a) * rr - 6, d() * 6, 1.5 + d() * 3.5, -2 - d() * 6, 0x9a88b8);
      }
      break;
    }
  }
  return {
    kind, hx, hz, deco: b.deco, colliders: b.colliders, spawns: spawnPoints(hx, hz),
    hero: { x: 0, z: hz - 3 }, shrine: { x: (r() < 0.5 ? -1 : 1) * (hx - 2.6), z: -1 + r() * 3 }, water, lights: b.lights, breakables: b.breakables,
  };
}
