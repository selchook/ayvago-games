// Hex Realm: the battle arenas as data (pure, seeded): where every Retro Fantasy Kit piece and every
// Hexagon Kit tile of an arena stands, the props the fight bumps into (colliders), where foes come
// in, where the hero starts and where a shrine may rise. The view (battleview.ts) merges the pieces
// into one mesh per kit; the simulation (battle.ts) only reads the bounds and the colliders.
//   field / forest    a meadow of hex grass tiles, forest and hill tiles round it, fences, trees
//   farm              the farm's yard: fences, crates, hay structures, the farm and the mill around
//   mine / cavern     timbered galleries on stone, a big cave of boulders for the troll
//   fort              a ruined fort: broken fortified walls, fallen columns, rubble
//   tower / spire     the wizard's painted halls, then the open top among the battlements
//   docks             planks over the lake, crates and barrels, a ship moored
//   court/hall/throne the dark castle: the courtyard with its towers, the pillared hall, the throne
//   rift              a ruined platform for the endless rift
// 1.2: the arenas are wider than deep (the game is landscape: the whole width shows), and a few
// crates, barrels and small crates stand loose: any blow breaks them (gold, now and then a potion).
import type { ArenaKind } from './defs';
import { retroKey, hexKey, type Placed } from './keys';

export interface Collider { x: number; z: number; r: number }
export interface ArenaLayout {
  kind: ArenaKind;
  hx: number;
  hz: number;
  retro: Placed[];
  hex: Placed[];
  colliders: Collider[];
  spawns: { x: number; z: number }[];
  hero: { x: number; z: number };
  shrine: { x: number; z: number };
  water: boolean;
  /** Torches / braziers: glow spots (x, y, z). */
  lights: [number, number, number][];
  /** Loose crates and barrels a blow breaks (drawn apart from the merged arena). */
  breakables: Breakable[];
}

export interface Breakable { key: string; x: number; z: number; rot: number; s: number; r: number }

/** Retro pieces are scaled ×2 (a wall is two units high, about twice the hero). */
const S = 2;
/** Hex tiles round the arenas are scaled ×2.2. */
const HS = 2.2;

function rng(seed: number): () => number {
  let a = seed >>> 0 || 1;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), a | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

class Builder {
  retro: Placed[] = [];
  hex: Placed[] = [];
  colliders: Collider[] = [];
  lights: [number, number, number][] = [];
  breakables: Breakable[] = [];
  constructor(readonly hx: number, readonly hz: number, readonly r: () => number) {}

  piece(name: string, x: number, z: number, rot = 0, s = S, y = 0, sy?: number): void {
    this.retro.push({ key: retroKey(name), x, y, z, rot, s, sy });
  }
  tile(name: string, x: number, z: number, rot = 0, s = HS, y = -0.2 * HS): void {
    this.hex.push({ key: hexKey(name), x, y, z, rot, s });
  }
  block(x: number, z: number, r: number): void { this.colliders.push({ x, z, r }); }

  /** A floor of retro tiles over the arena and a margin round it. */
  floor(name: string, margin = 1, y = -0.1): void {
    for (let x = -this.hx - margin * S; x <= this.hx + margin * S + 0.01; x += S) {
      for (let z = -this.hz - margin * S; z <= this.hz + margin * S + 0.01; z += S) this.piece(name, x, z, 0, S, y);
    }
  }

  /** A floor of hex tiles (grass, dirt, stone, sand), with `edge` tiles in a ring outside the arena. */
  hexFloor(name: string, edge: string[], ring = 3): void {
    const w = 1 * HS, rh = (Math.sqrt(3) / 2) * HS;
    const rows = Math.ceil((this.hz + ring * rh) / rh), cols = Math.ceil((this.hx + ring * w) / w);
    for (let r = -rows; r <= rows; r++) {
      for (let c = -cols; c <= cols; c++) {
        const x = c * w + (r & 1 ? w / 2 : 0), z = r * rh;
        const outside = Math.abs(x) > this.hx + 0.9 || Math.abs(z) > this.hz + 0.9;
        const far = Math.abs(x) > this.hx + w * 1.6 || Math.abs(z) > this.hz + rh * 1.6;
        const rot = Math.floor(this.r() * 6) * (Math.PI / 3);
        if (outside && edge.length && (far || this.r() < 0.55) && z > -this.hz - rh * 4) this.tile(edge[Math.floor(this.r() * edge.length)], x, z, rot);
        else this.tile(name, x, z, rot);
      }
    }
  }

  /** Walls along the arena's sides: `back` along the far side, `side` left and right, `front` near the camera (null: none). */
  walls(back: string | null, side: string | null, front: string | null, o: { gateBack?: string; inset?: number } = {}): void {
    const ins = o.inset ?? 0.5;
    const X = this.hx + ins + S / 2 - 1, Z = this.hz + ins + S / 2 - 1;
    const nx = Math.round((this.hx * 2) / S), nz = Math.round((this.hz * 2) / S);
    for (let i = 0; i <= nx; i++) {
      const x = -this.hx + i * S;
      if (back) this.piece(o.gateBack && i === Math.floor(nx / 2) ? o.gateBack : back, x, -Z, 0);
      if (front) this.piece(front, x, Z, Math.PI);
    }
    for (let j = 0; j <= nz; j++) {
      const z = -this.hz + j * S;
      if (side) { this.piece(side, -X, z, Math.PI / 2); this.piece(side, X, z, -Math.PI / 2); }
    }
  }

  /** Corner towers (a base, a tower and a crenellated top). */
  towers(base: string, top = true): void {
    const X = this.hx + 1.2, Z = this.hz + 1.2;
    for (const [x, z] of [[-X, -Z], [X, -Z], [-X, Z], [X, Z]] as [number, number][]) {
      if (z > 0) continue;
      this.piece(base, x, z, 0, S * 1.1);
      this.piece('tower', x, z, 0, S * 1.0, S * 1.1);
      if (top) this.piece('tower-top', x, z, 0, S * 1.0, S * 2.1);
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

  /** `n` loose crates and barrels a blow breaks, clear of the middle, the hero's start and other props. */
  loose(n: number): void {
    const list: [string, number, number][] = [['detail-barrel', 1.05, 0.42], ['detail-crate', 0.95, 0.45], ['detail-crate-small', 1.15, 0.38]];
    let tries = 0;
    while (n > 0 && tries++ < 200) {
      const x = (this.r() * 2 - 1) * (this.hx - 1.4), z = (this.r() * 2 - 1) * (this.hz - 1.4);
      if (Math.hypot(x, z) < 3.4 || Math.hypot(x, z - (this.hz - 3)) < 3.2) continue;
      if (this.colliders.some((c) => Math.hypot(c.x - x, c.z - z) < c.r + 1.6)) continue;
      if (this.breakables.some((c) => Math.hypot(c.x - x, c.z - z) < 2.2)) continue;
      const [name, sc, rad] = list[Math.floor(this.r() * list.length)];
      this.breakables.push({ key: retroKey(name), x, z, rot: this.r() * Math.PI * 2, s: S * sc, r: rad });
      n--;
    }
  }

  /** Pines (the Hexagon Kit's tree, scaled up) scattered inside, each a collider. */
  trees(n: number): void {
    let tries = 0;
    while (n > 0 && tries++ < 200) {
      const x = (this.r() * 2 - 1) * (this.hx - 1.2), z = (this.r() * 2 - 1) * (this.hz - 1.5);
      if (Math.hypot(x, z) < 3 || Math.hypot(x, z - (this.hz - 3)) < 3) continue;
      if (this.colliders.some((c) => Math.hypot(c.x - x, c.z - z) < c.r + 1.8)) continue;
      this.hex.push({ key: hexKey('unit-tree'), x, y: 0, z, rot: this.r() * 6, s: 4 + this.r() * 1.2 });
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
}

/** Where foes come in: along the far side and down the flanks. */
function spawnPoints(hx: number, hz: number): { x: number; z: number }[] {
  const out: { x: number; z: number }[] = [];
  for (let i = 0; i < 6; i++) out.push({ x: -hx + 1.4 + ((hx * 2 - 2.8) * i) / 5, z: -hz + 1.4 });
  for (const s of [-1, 1]) for (let j = 0; j < 3; j++) out.push({ x: s * (hx - 1.2), z: -hz + 3.6 + j * 3.0 });
  return out;
}

export function buildArena(kind: ArenaKind, seed: number): ArenaLayout {
  const r = rng(seed * 7919 + kind.length * 31);
  const big = kind === 'cavern' || kind === 'spire' || kind === 'throne';
  // landscape: wider than deep (1.1's portrait arenas were 15 × 21)
  const hx = big ? 12 : 11, hz = big ? 8.5 : 7.5;
  /** Pieces along a side: the half-count of two-unit steps. */
  const nx = Math.ceil(hx / S), nz = Math.ceil(hz / S);
  const b = new Builder(hx, hz, r);
  let water = false;
  switch (kind) {
    case 'field':
    case 'forest': {
      b.hexFloor('grass', kind === 'forest' ? ['grass-forest', 'grass-forest', 'grass-hill'] : ['grass-forest', 'grass-hill', 'stone-rocks', 'grass']);
      b.walls('fence-wood', null, null, { inset: 0.2 });
      b.trees(kind === 'forest' ? 7 : 3);
      if (kind === 'field') b.scatter([['bricks', 1.1, 0.4], ['detail-crate', 1.0, 0.4]], 2);
      b.loose(kind === 'field' ? 3 : 2);
      break;
    }
    case 'farm': {
      b.hexFloor('grass', ['building-farm', 'grass', 'building-sheep', 'grass-forest', 'building-mill']);
      b.walls('fence-wood', 'fence-wood', null, { inset: 0.2 });
      b.scatter([['detail-crate', 1.1, 0.4], ['barrels', 1.0, 0.45], ['detail-crate-ropes', 1.1, 0.4]], 5);
      b.edges([['detail-crate-small', 1.2], ['detail-barrel', 1.1]], 5);
      b.loose(4);
      break;
    }
    case 'mine':
    case 'cavern': {
      if (kind === 'mine') b.hexFloor('stone', ['stone-hill', 'stone-rocks', 'stone-mountain'], 2);
      if (kind === 'mine') {
        b.walls('wall-detail', 'wall', null);
        b.walls('wall', null, null);
        for (const x of [-6.6, 6.6]) for (const z of [-3.4, 2.4]) { b.piece('column-wood', x, z, 0, S * 0.8); b.block(x, z, 0.4); }
        b.edges([['detail-crate-ropes', 1.1], ['pulley-crate', 1.0], ['ladder', 1.0], ['barrels', 1.0]], 6);
        b.scatter([['detail-crate', 1.1, 0.4], ['bricks', 1.3, 0.45]], 2);
        b.loose(3);
      } else {
        b.hexFloor('stone', ['stone-mountain', 'stone-hill', 'stone-rocks', 'stone-mountain'], 4);
        b.scatter([['bricks', 1.8, 0.65]], 4, { clear: 4.5 });
        b.edges([['detail-crate-ropes', 1.1], ['barrels', 1.0], ['column-wood', 1.2]], 5);
        b.loose(2);
      }
      for (const [x, z] of [[-hx + 0.8, -hz + 1], [hx - 0.8, -hz + 1], [-hx + 0.8, 0], [hx - 0.8, 0]] as [number, number][]) b.lights.push([x, 1.6, z]);
      break;
    }
    case 'fort': {
      b.hexFloor('grass', ['grass', 'grass-hill', 'stone-rocks']);
      b.walls('wall-fortified', 'wall-fortified-window', null, { gateBack: 'wall-fortified-gate' });
      b.towers('tower-base', false);
      b.scatter([['column-damaged', 1.1, 0.4], ['bricks', 1.3, 0.45], ['column', 1.1, 0.4]], 7);
      b.loose(2);
      break;
    }
    case 'tower': {
      b.floor('wood-floor', 0, -0.26);
      b.walls('wall-paint-window', 'wall-paint', null);
      for (const s of [-1, 1]) for (const x of [4, 7.5]) { b.piece('column-paint', s * x, -2.6, 0, S * 1.2); b.block(s * x, -2.6, 0.45); }
      b.edges([['barrels', 1.0], ['detail-crate-small', 1.2]], 4);
      b.loose(2);
      for (const [x, z] of [[-4, -hz + 0.8], [4, -hz + 0.8]] as [number, number][]) b.lights.push([x, 1.8, z]);
      break;
    }
    case 'spire': {
      b.hexFloor('stone', [], 1);
      for (let i = -nx; i <= nx; i++) {
        b.piece('battlement', i * S, -hz - 1.6, 0);
        b.piece('battlement', i * S, hz + 1.6, Math.PI);
      }
      for (let j = -nz; j <= nz; j++) { b.piece('battlement', -hx - 1.6, j * S, Math.PI / 2); b.piece('battlement', hx + 1.6, j * S, -Math.PI / 2); }
      for (const [x, z] of [[-6.5, -3.6], [6.5, -3.6], [-6.5, 3.4], [6.5, 3.4]] as [number, number][]) { b.piece('column-paint', x, z, 0, S * 0.8); b.block(x, z, 0.4); b.lights.push([x, 1.9, z]); }
      break;
    }
    case 'docks': {
      water = true;
      b.floor('wood-floor', 0, -0.25);
      for (let i = -nx; i <= nx; i++) { b.piece('dock-side', i * S, -hz - 1, 0); }
      for (let j = -nz; j <= nz; j++) { b.piece('wood-floor-railing', -hx - 1, j * S, Math.PI / 2); b.piece('wood-floor-railing', hx + 1, j * S, -Math.PI / 2); }
      b.scatter([['barrels', 1.0, 0.45], ['detail-crate-ropes', 1.1, 0.4], ['pulley-crate', 0.9, 0.4]], 5);
      b.edges([['detail-barrel', 1.1], ['detail-crate-small', 1.2]], 5);
      b.loose(4);
      b.tile('unit-ship', -hx - 5, -3, 0.4, 6, -1.2);
      b.tile('unit-ship', hx + 6, -6, 2.6, 5, -1.2);
      break;
    }
    case 'court': {
      b.hexFloor('stone', ['stone-hill', 'stone', 'stone-rocks'], 2);
      b.walls('wall-fortified-paint', 'wall-fortified-paint', null, { gateBack: 'wall-fortified-paint-gate' });
      b.towers('tower-paint-base');
      b.scatter([['column-damaged', 1.1, 0.4], ['bricks', 1.2, 0.4]], 5);
      b.loose(2);
      for (const [x, z] of [[-hx + 0.8, -hz + 0.8], [hx - 0.8, -hz + 0.8]] as [number, number][]) b.lights.push([x, 2.0, z]);
      break;
    }
    case 'hall':
    case 'throne': {
      b.hexFloor('stone', ['stone-mountain', 'stone-hill'], 2);
      b.walls('wall-paint-window', 'wall-paint', null);
      // two rows of pillars across the hall (the long side runs left to right)
      const xs = kind === 'hall' ? [3.4, 8] : [4, 8.8];
      const zs = kind === 'hall' ? [-3.6, 2.8] : [-4.4, 3];
      for (const s of [-1, 1]) for (const x of xs) for (const z of zs) { b.piece('column-paint', s * x, z, 0, S * 1.3); b.block(s * x, z, 0.45); if (x === xs[1]) b.lights.push([s * x, 2.2, z + 0.6]); }
      if (kind === 'hall') b.loose(2);
      if (kind === 'throne') { b.piece('stairs-stone', 0, -hz - 0.4, Math.PI / 2, S * 0.9, 0, S * 0.4); }
      break;
    }
    case 'rift': {
      b.hexFloor('stone', ['stone-mountain', 'stone-rocks', 'stone-hill'], 3);
      b.scatter([['column-damaged', 1.1, 0.4], ['bricks', 1.3, 0.45], ['column', 1.2, 0.4]], 6);
      for (let i = -nx; i <= nx; i++) b.piece('battlement', i * S, -hz - 1.6, 0);
      break;
    }
  }
  return {
    kind, hx, hz, retro: b.retro, hex: b.hex, colliders: b.colliders, spawns: spawnPoints(hx, hz),
    hero: { x: 0, z: hz - 3 }, shrine: { x: (r() < 0.5 ? -1 : 1) * (hx - 2.6), z: -1 + r() * 3 }, water, lights: b.lights, breakables: b.breakables,
  };
}
