// Crypt Crawler: the rules as a pure simulation (no three.js, no Phaser), shared by the Play
// scene, the attract scene behind the menu and the headless balance bot (bot.ts).
// Units: one floor tile = 1, time in seconds. x grows to the east (screen right), z to the south
// (towards the camera). A floor is a grid of rooms (cells) that share their walls; doors sit in
// the middle of the shared walls.

export type Tune = 'easy' | 'normal';

/** Easy and Normal side by side (§7c): Normal is the reference, Easy only ever helps. */
export interface Tuning {
  hearts: number;
  /** Enemy and boss health. */
  enemyHp: number;
  enemySpeed: number;
  /** Wind-up (telegraph) time of every enemy attack. */
  windup: number;
  /** Pause between an enemy's attacks. */
  attackGap: number;
  projSpeed: number;
  /** Chance an enemy drops a heart; pots; chests. */
  heartDrop: number;
  potHeart: number;
  chestHeart: number;
  /** Floor f plays like floor 1 + (f - 1) * ramp. */
  ramp: number;
  /** Hearts given back at every floor clear. */
  clearHeal: number;
}

export const TUNING: Record<Tune, Tuning> = {
  normal: { hearts: 5, enemyHp: 1, enemySpeed: 1, windup: 1, attackGap: 1, projSpeed: 1, heartDrop: 0.06, potHeart: 0.08, chestHeart: 0.5, ramp: 1, clearHeal: 0 },
  easy: { hearts: 7, enemyHp: 0.7, enemySpeed: 0.85, windup: 1.3, attackGap: 1.35, projSpeed: 0.78, heartDrop: 0.09, potHeart: 0.12, chestHeart: 0.75, ramp: 0.65, clearHeal: 1 },
};

export const ROOM_W = 9;
export const ROOM_H = 11;
export const PX = ROOM_W + 1;
export const PZ = ROOM_H + 1;
/** Every third floor ends in a boss room. */
export const BOSS_EVERY = 3;

// ------------------------------------------------------------------ random numbers

export function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), a | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ------------------------------------------------------------------ enemies

export type EnemyKind =
  | 'slime' | 'slimelet' | 'skeleton' | 'spearman' | 'ghost' | 'zombie' | 'orc' | 'vampire'
  | 'boneking' | 'warlord' | 'vamplord';

export interface EnemyDef {
  hp: number;
  speed: number;
  r: number;
  /** Points of a room's budget. */
  cost: number;
  minFloor: number;
  coins: [number, number];
  boss?: boolean;
  fly?: boolean;
}

export const ENEMIES: Record<EnemyKind, EnemyDef> = {
  slime: { hp: 18, speed: 1.25, r: 0.3, cost: 1, minFloor: 1, coins: [1, 2] },
  slimelet: { hp: 7, speed: 1.6, r: 0.2, cost: 0, minFloor: 99, coins: [0, 1] },
  skeleton: { hp: 26, speed: 1.75, r: 0.28, cost: 2, minFloor: 1, coins: [1, 2] },
  spearman: { hp: 20, speed: 1.6, r: 0.28, cost: 2, minFloor: 2, coins: [1, 3] },
  ghost: { hp: 16, speed: 2.0, r: 0.28, cost: 2, minFloor: 2, coins: [1, 2], fly: true },
  zombie: { hp: 46, speed: 1.05, r: 0.32, cost: 3, minFloor: 3, coins: [2, 3] },
  orc: { hp: 54, speed: 1.4, r: 0.36, cost: 4, minFloor: 4, coins: [3, 5] },
  vampire: { hp: 40, speed: 1.7, r: 0.3, cost: 4, minFloor: 5, coins: [3, 5] },
  boneking: { hp: 360, speed: 1.55, r: 0.7, cost: 0, minFloor: 99, coins: [30, 30], boss: true },
  warlord: { hp: 560, speed: 1.6, r: 0.8, cost: 0, minFloor: 99, coins: [40, 40], boss: true },
  vamplord: { hp: 640, speed: 1.9, r: 0.7, cost: 0, minFloor: 99, coins: [50, 50], boss: true },
};

export const BOSSES: EnemyKind[] = ['boneking', 'warlord', 'vamplord'];

export type EnemyState = 'spawn' | 'move' | 'windup' | 'act' | 'recover' | 'stun' | 'blink';

/** A telegraph the view draws on the floor while an attack winds up. */
export interface Tele {
  kind: 'circle' | 'line' | 'cone';
  x: number; z: number;
  r: number;
  /** Direction (line, cone) as an angle: atan2(dx, dz). */
  ang: number;
  len: number;
}

export interface Enemy {
  id: number;
  kind: EnemyKind;
  room: number;
  x: number; z: number;
  /** Knockback velocity. */
  kx: number; kz: number;
  /** Own velocity (charges, swoops, hops). */
  vx: number; vz: number;
  hp: number; maxHp: number;
  r: number;
  speed: number;
  face: number;
  state: EnemyState;
  t: number;
  /** Seconds until the next attack may start. */
  cd: number;
  /** Which attack the wind-up leads to (bosses). */
  move: string;
  /** Moves done in the current pattern (charges in a row, volleys). */
  count: number;
  elite: boolean;
  alive: boolean;
  /** Time since the last hit (flash). */
  hitT: number;
  /** Per-enemy cooldown for the orbiting blades. */
  orbitCd: number;
  /** Height above the floor (hops, ghosts, blinks). */
  y: number;
  tele: Tele | null;
  /** Did this attack already hit the hero (one hit per swing/charge). */
  struck: boolean;
  /** Walking distance (for the view's stride). */
  walk: number;
  /** Boss in its second phase. */
  rage: boolean;
}

export type ProjKind = 'spear' | 'orb' | 'bone' | 'wave';

export interface Proj {
  id: number;
  kind: ProjKind;
  x: number; z: number;
  vx: number; vz: number;
  r: number;
  life: number;
  /** Shock waves: current radius and the centre. */
  radius: number;
  cx: number; cz: number;
  dead: boolean;
}

export type PickKind = 'coin' | 'heart' | 'key' | 'gem';

export interface Pickup {
  id: number;
  kind: PickKind;
  x: number; z: number; y: number;
  vx: number; vz: number; vy: number;
  value: number;
  age: number;
  taken: boolean;
  magnet: boolean;
}

export type PotKind = 'urn' | 'urn2' | 'barrel';
export interface Pot { id: number; kind: PotKind; x: number; z: number; room: number; broken: boolean; yaw: number }

export interface Chest {
  id: number;
  x: number; z: number;
  room: number;
  opened: boolean;
  big: boolean;
  /** Holds the floor's key. */
  key: boolean;
  /** Seconds since it appeared (pop-in) / opened (lid). */
  t: number;
  openT: number;
}

export interface Spike { x: number; z: number; room: number; period: number; phase: number; /** 0 down, 1 warning, 2 up */ state: number }
export interface Blade { x: number; z: number; room: number; amp: number; period: number; phase: number; bx: number }

export type RoomType = 'start' | 'combat' | 'shrine' | 'vault' | 'trap' | 'exit' | 'boss';
export type Side = 'n' | 's' | 'e' | 'w';

export interface Door {
  id: number;
  x: number; z: number;
  /** 'x' when the passage runs east-west (door in a vertical wall). */
  axis: 'x' | 'z';
  a: number; b: number;
  open: boolean;
  /** Needs the floor's key. */
  keyLocked: boolean;
}

export type ObstKind = 'column' | 'rocks' | 'brazier' | 'wood' | 'pillar' | 'coffin' | 'grave';
export interface Obstacle { kind: ObstKind; x: number; z: number; yaw: number }

export interface Room {
  id: number;
  gx: number; gy: number;
  type: RoomType;
  /** Interior tiles x0..x1, z0..z1 (inclusive). */
  x0: number; z0: number; x1: number; z1: number;
  cx: number; cz: number;
  doors: number[];
  sides: Partial<Record<Side, number>>;
  visited: boolean;
  /** Seen on the minimap (visited or next to a visited room). */
  known: boolean;
  cleared: boolean;
  locked: boolean;
  waves: EnemyKind[][];
  wave: number;
  /** Seconds until the next wave appears (or the first, on entry). */
  waveT: number;
  obstacles: Obstacle[];
  layout: number;
  /** The reward chest appears here when the room is cleared (holds the key on key floors). */
  rewardChest: boolean;
  keyChest: boolean;
  /** Shrine used, stairs live. */
  used: boolean;
  elite: boolean;
}

// ------------------------------------------------------------------ upgrades

export const UPGRADES = ['damage', 'speed', 'dash', 'heart', 'lifesteal', 'orbit', 'reach', 'whirl', 'magnet', 'shield'] as const;
export type UpgradeId = (typeof UPGRADES)[number];
export const UPGRADE_MAX: Record<UpgradeId, number> = {
  damage: 5, speed: 4, dash: 3, heart: 4, lifesteal: 3, orbit: 3, reach: 3, whirl: 2, magnet: 2, shield: 2,
};

/** Between-runs camp shop (kept in the core storage by the Play scene). */
export const META = ['vigor', 'edge', 'greed', 'boots', 'blessing'] as const;
export type MetaId = (typeof META)[number];
export const META_MAX: Record<MetaId, number> = { vigor: 3, edge: 3, greed: 3, boots: 2, blessing: 1 };
export const META_COST: Record<MetaId, number[]> = {
  vigor: [60, 150, 320],
  edge: [50, 130, 280],
  greed: [40, 110, 240],
  boots: [45, 120],
  blessing: [180],
};
export type MetaLevels = Partial<Record<MetaId, number>>;

export interface Stats {
  dmg: number;
  atkCd: number;
  range: number;
  arc: number;
  dashCd: number;
  chargeTime: number;
  spinMul: number;
  magnet: number;
  goldMul: number;
  /** Kills per healed heart (0 = none). */
  lifesteal: number;
  orbit: number;
  shieldMax: number;
  speed: number;
}

// ------------------------------------------------------------------ hero

export interface HeroInput {
  /** Movement (-1..1 each, length ≤ 1). */
  mx: number; mz: number;
  /** Aim direction (mouse); used when `aim` is set, otherwise the hero aims where it faces. */
  ax: number; az: number;
  aim: boolean;
  /** Attack button held. */
  attack: boolean;
  /** Dash pressed this step. */
  dash: boolean;
}

export interface Hero {
  x: number; z: number;
  vx: number; vz: number;
  face: number;
  hp: number; maxHp: number;
  inv: number;
  dashT: number; dashCd: number;
  dx: number; dz: number;
  atkCd: number;
  swingT: number;
  swingHit: boolean;
  swingAng: number;
  hold: number;
  chargeT: number;
  charged: boolean;
  spinT: number;
  spinHit: boolean;
  shield: number;
  keys: number;
  gold: number;
  kills: number;
  alive: boolean;
  walk: number;
  hitT: number;
  /** Knockback when hit. */
  kx: number; kz: number;
  speed: number;
  orbitAng: number;
}

export type SimEvent =
  | { type: 'swing'; x: number; z: number; ang: number }
  | { type: 'spin'; x: number; z: number }
  | { type: 'charged' }
  | { type: 'hit'; e: Enemy; dmg: number; big: boolean; x: number; z: number; kill: boolean }
  | { type: 'kill'; e: Enemy }
  | { type: 'split'; e: Enemy }
  | { type: 'heroHit'; x: number; z: number; dmg: number }
  | { type: 'block'; x: number; z: number }
  | { type: 'die' }
  | { type: 'dash'; x: number; z: number; dx: number; dz: number }
  | { type: 'pick'; p: Pickup }
  | { type: 'pot'; pot: Pot }
  | { type: 'chest'; c: Chest }
  | { type: 'chestAppear'; c: Chest }
  | { type: 'lock'; room: Room }
  | { type: 'clear'; room: Room }
  | { type: 'enter'; room: Room }
  | { type: 'spawn'; e: Enemy }
  | { type: 'windup'; e: Enemy }
  | { type: 'attack'; e: Enemy }
  | { type: 'shoot'; p: Proj; e: Enemy }
  | { type: 'parry'; x: number; z: number }
  | { type: 'wallHit'; e: Enemy }
  | { type: 'slam'; x: number; z: number; r: number }
  | { type: 'blink'; x: number; z: number }
  | { type: 'bossIntro'; e: Enemy }
  | { type: 'bossDie'; e: Enemy }
  | { type: 'rage'; e: Enemy }
  | { type: 'stairs' }
  | { type: 'shrine'; room: Room }
  | { type: 'unlock'; door: Door }
  | { type: 'needKey'; door: Door }
  | { type: 'spikes'; s: Spike }
  | { type: 'heal'; n: number }
  | { type: 'trapHit'; x: number; z: number };

// ------------------------------------------------------------------ tiles

export const T_VOID = 0, T_FLOOR = 1, T_WALL = 2, T_DOOR = 3, T_OBST = 4, T_STAIRS = 5;

/** Room layouts: obstacle tiles in room coordinates (i 0..8, j 0..10). The door lanes (i = 4, j = 5) stay free. */
const LAYOUTS: { i: number; j: number; k?: ObstKind }[][] = [
  [],
  [{ i: 2, j: 2 }, { i: 6, j: 2 }, { i: 2, j: 8 }, { i: 6, j: 8 }],
  [{ i: 1, j: 3, k: 'rocks' }, { i: 2, j: 3, k: 'rocks' }, { i: 6, j: 7, k: 'rocks' }, { i: 7, j: 7, k: 'rocks' }],
  [{ i: 3, j: 3 }, { i: 5, j: 3 }, { i: 3, j: 7 }, { i: 5, j: 7 }],
  [{ i: 2, j: 2, k: 'wood' }, { i: 6, j: 8, k: 'wood' }, { i: 7, j: 2, k: 'rocks' }, { i: 1, j: 8, k: 'rocks' }],
  [{ i: 1, j: 2, k: 'pillar' }, { i: 7, j: 2, k: 'pillar' }, { i: 1, j: 8, k: 'pillar' }, { i: 7, j: 8, k: 'pillar' }, { i: 3, j: 4, k: 'coffin' }, { i: 5, j: 6, k: 'coffin' }],
  [{ i: 2, j: 3, k: 'grave' }, { i: 6, j: 3, k: 'grave' }, { i: 2, j: 7, k: 'grave' }, { i: 6, j: 7, k: 'grave' }, { i: 3, j: 1, k: 'rocks' }],
];

export interface Floor {
  n: number;
  rooms: Room[];
  doors: Door[];
  /** Tile grid, tx 0..gw-1, tz 0..gh-1. */
  gw: number; gh: number;
  tiles: Uint8Array;
  doorAt: Map<number, Door>;
  pots: Pot[];
  chests: Chest[];
  spikes: Spike[];
  blades: Blade[];
  start: number;
  exit: number;
  stairs: { x: number; z: number; active: boolean };
  boss: boolean;
}

// ------------------------------------------------------------------ the simulation

const UPG_DESC_ORDER = UPGRADES;

export class Sim {
  readonly tune: Tuning;
  rng: () => number;
  floorNo = 1;
  floor!: Floor;
  hero!: Hero;
  enemies: Enemy[] = [];
  projs: Proj[] = [];
  picks: Pickup[] = [];
  events: SimEvent[] = [];
  upgrades: Record<UpgradeId, number> = Object.fromEntries(UPGRADES.map((u) => [u, 0])) as Record<UpgradeId, number>;
  stats!: Stats;
  time = 0;
  /** Room the hero is in (-1 in a doorway). */
  room = -1;
  /** Floors fully cleared (stairs taken). */
  cleared = 0;
  bossesBeaten = 0;
  /** Gold picked up this run (score and bank). */
  goldRun = 0;
  /** The input of the next step. */
  input: HeroInput = { mx: 0, mz: 0, ax: 0, az: 1, aim: false, attack: false, dash: false };
  /** Set while the shrine choice or a card is open: the world waits. */
  frozen = false;
  /** The run ended (no hearts). */
  over = false;
  /** Test hook: the hero takes no damage (scripted screenshot runs). */
  immortal = false;
  private prevAttack = false;
  private nextId = 1;
  private flow: Int16Array | null = null;
  private flowTile = -1;
  private flowRoom = -1;
  readonly meta: MetaLevels;

  constructor(readonly mode: Tune, seed: number, meta: MetaLevels = {}) {
    this.tune = TUNING[mode];
    this.rng = seeded(seed);
    this.meta = { ...meta };
    if (this.meta.blessing) {
      const pick = (['damage', 'speed', 'dash', 'orbit', 'shield'] as UpgradeId[])[Math.floor(this.rng() * 5)];
      this.upgrades[pick] = 1;
    }
    this.computeStats();
    const maxHp = this.tune.hearts + (this.meta.vigor ?? 0) + this.upgrades.heart;
    this.hero = {
      x: 0, z: 0, vx: 0, vz: 0, face: Math.PI, hp: maxHp, maxHp, inv: 0, dashT: 0, dashCd: 0, dx: 0, dz: 1,
      atkCd: 0, swingT: 0, swingHit: true, swingAng: 0, hold: 0, chargeT: 0, charged: false, spinT: 0, spinHit: true,
      shield: this.stats.shieldMax, keys: 0, gold: 0, kills: 0, alive: true, walk: 0, hitT: 9, kx: 0, kz: 0, speed: 0, orbitAng: 0,
    };
    this.buildFloor(1);
  }

  /** The camp's upgrades changed before the run began: the hero starts with them. */
  applyMeta(levels: MetaLevels): void {
    const had = !!this.meta.blessing;
    Object.assign(this.meta, levels);
    if (this.meta.blessing && !had) {
      const pick = (['damage', 'speed', 'dash', 'orbit', 'shield'] as UpgradeId[])[Math.floor(this.rng() * 5)];
      this.upgrades[pick] = Math.max(1, this.upgrades[pick]);
    }
    this.computeStats();
    const h = this.hero;
    h.maxHp = this.tune.hearts + (this.meta.vigor ?? 0) + this.upgrades.heart;
    h.hp = h.maxHp;
    h.shield = this.stats.shieldMax;
  }

  /** Difficulty level of the current floor (Easy ramps slower). */
  get level(): number {
    return 1 + (this.floorNo - 1) * this.tune.ramp;
  }

  get isBossFloor(): boolean {
    return this.floorNo % BOSS_EVERY === 0;
  }

  computeStats(): void {
    const u = this.upgrades, m = this.meta;
    this.stats = {
      dmg: 10 * (1 + 0.25 * u.damage) * (1 + 0.1 * (m.edge ?? 0)),
      atkCd: 0.36 / (1 + 0.2 * u.speed),
      range: 1.3 * (1 + 0.18 * u.reach),
      arc: (62 + 14 * u.reach) * Math.PI / 180,
      dashCd: 0.95 * (1 - 0.22 * u.dash) * (1 - 0.1 * (m.boots ?? 0)),
      chargeTime: 0.62 * (1 - 0.3 * u.whirl),
      spinMul: 2 + 0.6 * u.whirl,
      magnet: 1.7 + 1.2 * u.magnet,
      goldMul: (1 + 0.15 * (m.greed ?? 0)) * (1 + 0.15 * u.magnet),
      lifesteal: u.lifesteal ? [0, 12, 9, 6][u.lifesteal] : 0,
      orbit: u.orbit,
      shieldMax: u.shield,
      speed: 3.5 * (1 + 0.04 * u.speed),
    };
  }

  /** Three different upgrades the shrine offers (none at its maximum). */
  offer(): UpgradeId[] {
    const pool = UPG_DESC_ORDER.filter((u) => this.upgrades[u] < UPGRADE_MAX[u]);
    for (let i = pool.length - 1; i > 0; i--) {
      const j = Math.floor(this.rng() * (i + 1));
      [pool[i], pool[j]] = [pool[j], pool[i]];
    }
    return pool.slice(0, 3);
  }

  applyUpgrade(id: UpgradeId): void {
    this.upgrades[id] = Math.min(UPGRADE_MAX[id], this.upgrades[id] + 1);
    this.computeStats();
    const h = this.hero;
    if (id === 'heart') {
      h.maxHp++;
      h.hp = Math.min(h.maxHp, h.hp + 1);
    }
    if (id === 'shield') h.shield = this.stats.shieldMax;
  }

  // ---------------------------------------------------------------- floors

  /** Builds floor n and puts the hero in its start room. */
  buildFloor(n: number): void {
    this.floorNo = n;
    this.enemies = [];
    this.projs = [];
    this.picks = [];
    this.flow = null;
    this.flowTile = -1;
    this.floor = this.generate(n);
    const st = this.floor.rooms[this.floor.start];
    const h = this.hero;
    h.x = st.cx;
    h.z = st.z1 - 1.5;
    h.vx = h.vz = h.kx = h.kz = 0;
    h.face = Math.PI;
    h.dashT = h.swingT = h.spinT = 0;
    h.chargeT = 0;
    h.charged = false;
    h.inv = 0.5;
    h.keys = 0;
    h.shield = this.stats.shieldMax;
    this.room = -1;
    this.updateRoom();
  }

  /** The stairs were taken: count the floor and go deeper. */
  nextFloor(): void {
    this.cleared++;
    const heal = this.tune.clearHeal;
    if (heal) this.hero.hp = Math.min(this.hero.maxHp, this.hero.hp + heal);
    this.buildFloor(this.floorNo + 1);
  }

  private generate(n: number): Floor {
    const rng = this.rng;
    const boss = n % BOSS_EVERY === 0;
    const count = Math.min(9, 5 + Math.floor((n - 1) / 2) + (rng() < 0.4 ? 1 : 0));
    // grow a tree of cells from the start
    const cells = new Map<string, { gx: number; gy: number; links: Set<string> }>();
    const key = (x: number, y: number) => `${x},${y}`;
    cells.set(key(0, 0), { gx: 0, gy: 0, links: new Set() });
    const dirs: [number, number][] = [[1, 0], [-1, 0], [0, 1], [0, -1]];
    let guard = 0;
    while (cells.size < count && guard++ < 2000) {
      const list = [...cells.values()];
      // favour the newest cells a little, so floors stretch out instead of clumping
      const from = list[Math.min(list.length - 1, Math.floor(Math.pow(rng(), 0.6) * list.length))];
      const [dx, dy] = dirs[Math.floor(rng() * 4)];
      const nx = from.gx + dx, ny = from.gy + dy;
      if (Math.abs(nx) > 3 || ny > 1 || ny < -4 || cells.has(key(nx, ny))) continue;
      let nb = 0;
      for (const [ex, ey] of dirs) if (cells.has(key(nx + ex, ny + ey))) nb++;
      if (nb > 1 && rng() < 0.75) continue;
      cells.set(key(nx, ny), { gx: nx, gy: ny, links: new Set([key(from.gx, from.gy)]) });
      from.links.add(key(nx, ny));
    }
    // a loop or two
    for (const c of cells.values()) for (const [dx, dy] of dirs) {
      const k2 = key(c.gx + dx, c.gy + dy);
      const o = cells.get(k2);
      if (o && !c.links.has(k2) && rng() < 0.18) { c.links.add(k2); o.links.add(key(c.gx, c.gy)); }
    }
    const minX = Math.min(...[...cells.values()].map((c) => c.gx));
    const minY = Math.min(...[...cells.values()].map((c) => c.gy));
    const maxX = Math.max(...[...cells.values()].map((c) => c.gx));
    const maxY = Math.max(...[...cells.values()].map((c) => c.gy));
    const GW = maxX - minX + 1, GH = maxY - minY + 1;
    const gw = GW * PX + 1, gh = GH * PZ + 1;
    const tiles = new Uint8Array(gw * gh);
    const rooms: Room[] = [];
    const idOf = new Map<string, number>();
    for (const c of cells.values()) {
      const gx = c.gx - minX, gy = c.gy - minY;
      const x0 = gx * PX + 1, z0 = gy * PZ + 1;
      const r: Room = {
        id: rooms.length, gx, gy, type: 'combat', x0, z0, x1: x0 + ROOM_W - 1, z1: z0 + ROOM_H - 1,
        cx: x0 + (ROOM_W - 1) / 2, cz: z0 + (ROOM_H - 1) / 2, doors: [], sides: {}, visited: false, known: false,
        cleared: false, locked: false, waves: [], wave: 0, waveT: 0, obstacles: [], layout: 0, rewardChest: false,
        keyChest: false, used: false, elite: false,
      };
      idOf.set(key(c.gx, c.gy), r.id);
      rooms.push(r);
      for (let z = z0 - 1; z <= r.z1 + 1; z++) for (let x = x0 - 1; x <= r.x1 + 1; x++) {
        const inside = x >= x0 && x <= r.x1 && z >= z0 && z <= r.z1;
        const i = z * gw + x;
        if (inside) tiles[i] = T_FLOOR;
        else if (tiles[i] === T_VOID) tiles[i] = T_WALL;
      }
    }
    // doors
    const doors: Door[] = [];
    const doorAt = new Map<number, Door>();
    for (const c of cells.values()) {
      const a = idOf.get(key(c.gx, c.gy))!;
      for (const l of c.links) {
        const b = idOf.get(l)!;
        if (b < a) continue;
        const A = rooms[a], B = rooms[b];
        let x: number, z: number, axis: 'x' | 'z';
        if (A.gx !== B.gx) {
          axis = 'x';
          x = Math.max(A.gx, B.gx) * PX;
          z = A.cz;
          const [w, e] = A.gx < B.gx ? [A, B] : [B, A];
          w.sides.e = doors.length; e.sides.w = doors.length;
        } else {
          axis = 'z';
          x = A.cx;
          z = Math.max(A.gy, B.gy) * PZ;
          const [nn, ss] = A.gy < B.gy ? [A, B] : [B, A];
          nn.sides.s = doors.length; ss.sides.n = doors.length;
        }
        const d: Door = { id: doors.length, x, z, axis, a, b, open: true, keyLocked: false };
        doors.push(d);
        A.doors.push(d.id);
        B.doors.push(d.id);
        tiles[z * gw + x] = T_DOOR;
        doorAt.set(z * gw + x, d);
      }
    }
    // room roles: the start is the first cell; the exit (or boss) the farthest room from it
    const start = idOf.get(key(0, 0))!;
    const dist = new Array(rooms.length).fill(-1);
    dist[start] = 0;
    const q = [start];
    while (q.length) {
      const r = q.shift()!;
      for (const di of rooms[r].doors) {
        const d = doors[di];
        const o = d.a === r ? d.b : d.a;
        if (dist[o] < 0) { dist[o] = dist[r] + 1; q.push(o); }
      }
    }
    let exit = start;
    for (const r of rooms) if (dist[r.id] > dist[exit] || (dist[r.id] === dist[exit] && r.gy < rooms[exit].gy)) exit = r.id;
    rooms[start].type = 'start';
    rooms[exit].type = boss ? 'boss' : 'exit';
    const others = () => rooms.filter((r) => r.type === 'combat');
    const deadEnds = () => others().filter((r) => r.doors.length === 1);
    const pick = <T>(arr: T[]): T | undefined => arr[Math.floor(rng() * arr.length)];
    const shrine = pick(deadEnds()) ?? pick(others());
    if (shrine) shrine.type = 'shrine';
    if (n >= 2 && rooms.length >= 6) {
      const vault = pick(deadEnds().filter((r) => dist[r.id] >= 2));
      if (vault) {
        vault.type = 'vault';
        doors[vault.doors[0]].keyLocked = true;
        // the key waits in the reward chest of a fight on the way
        const holder = pick(others().filter((r) => dist[r.id] >= 1));
        if (holder) { holder.keyChest = true; holder.rewardChest = true; }
        else vault.type = 'combat';
      }
    }
    if (n >= 2) {
      const trap = pick(others().filter((r) => !r.keyChest));
      if (trap) trap.type = 'trap';
    }
    // contents
    const floor: Floor = {
      n, rooms, doors, gw, gh, tiles, doorAt, pots: [], chests: [], spikes: [], blades: [], start, exit,
      stairs: { x: rooms[exit].cx, z: rooms[exit].z0 + 1, active: false }, boss,
    };
    for (const r of rooms) this.furnish(floor, r, dist[r.id]);
    return floor;
  }

  /** Obstacles, pots, traps and enemy waves of one room. */
  private furnish(f: Floor, r: Room, depth: number): void {
    const rng = this.rng;
    const n = f.n;
    const special = r.type === 'shrine' || r.type === 'boss' || r.type === 'start' || r.type === 'vault';
    r.layout = special ? 0 : 1 + Math.floor(rng() * (LAYOUTS.length - 1));
    const used = new Set<string>();
    const lane = (i: number, j: number) => i === 4 || j === 5;
    const put = (i: number, j: number) => used.add(`${i},${j}`);
    const free = (i: number, j: number) => !used.has(`${i},${j}`) && !lane(i, j);
    const setTile = (i: number, j: number, v: number) => { f.tiles[(r.z0 + j) * f.gw + r.x0 + i] = v; };
    // braziers in the two far corners light every room
    for (const [i, j] of [[0, 0], [8, 0]]) {
      r.obstacles.push({ kind: 'brazier', x: r.x0 + i, z: r.z0 + j, yaw: 0 });
      setTile(i, j, T_OBST);
      put(i, j);
    }
    for (const o of LAYOUTS[r.layout]) {
      const k = o.k ?? 'column';
      r.obstacles.push({ kind: k, x: r.x0 + o.i, z: r.z0 + o.j, yaw: k === 'coffin' ? Math.PI / 2 * Math.floor(rng() * 2) : Math.floor(rng() * 4) * Math.PI / 2 });
      setTile(o.i, o.j, T_OBST);
      put(o.i, o.j);
    }
    // the stairs (exit) and the shrine's altar
    if (r.type === 'exit' || r.type === 'boss') {
      setTile(4, 1, T_STAIRS);
      put(4, 1); put(3, 1); put(5, 1);
    }
    if (r.type === 'shrine') {
      setTile(4, 3, T_OBST);
      put(4, 3);
      for (const [i, j] of [[3, 3], [5, 3], [3, 4], [5, 4], [4, 4]]) put(i, j);
    }
    // pots and barrels along the walls
    const potCount = r.type === 'boss' ? 0 : r.type === 'vault' ? 6 : r.type === 'trap' ? 5 : 1 + Math.floor(rng() * 4);
    let tries = 0;
    for (let k = 0; k < potCount && tries < 60; tries++) {
      const edge = Math.floor(rng() * 4);
      const i = edge === 0 ? 0 : edge === 1 ? 8 : Math.floor(rng() * 9);
      const j = edge === 2 ? 0 : edge === 3 ? 10 : Math.floor(rng() * 11);
      if (!free(i, j)) continue;
      put(i, j);
      const kinds: PotKind[] = ['urn', 'urn2', 'barrel'];
      f.pots.push({ id: this.nextId++, kind: kinds[Math.floor(rng() * 3)], x: r.x0 + i + (rng() - 0.5) * 0.2, z: r.z0 + j + (rng() - 0.5) * 0.2, room: r.id, broken: false, yaw: rng() * Math.PI * 2 });
      k++;
    }
    // vault: the big chest
    if (r.type === 'vault') {
      f.chests.push({ id: this.nextId++, x: r.cx, z: r.cz, room: r.id, opened: false, big: true, key: false, t: 9, openT: 0 });
    }
    // traps
    const spikes = (cnt: number) => {
      let t2 = 0;
      for (let k = 0; k < cnt && t2 < 80; t2++) {
        const i = 1 + Math.floor(rng() * 7), j = 1 + Math.floor(rng() * 9);
        if (used.has(`${i},${j}`)) continue;
        if (r.type !== 'trap' && lane(i, j)) continue;
        put(i, j);
        f.spikes.push({ x: r.x0 + i, z: r.z0 + j, room: r.id, period: 2.6, phase: ((i + j) % 3) * 0.55, state: 0 });
        k++;
      }
    };
    if (r.type === 'trap') {
      put(7, 1);
      spikes(10 + Math.min(6, n));
      const rows = [2, 8];
      for (const j of rows) {
        if (rng() < 0.85) f.blades.push({ x: r.cx, z: r.z0 + j, room: r.id, amp: 3.6, period: 2.4 + rng() * 0.8, phase: rng() * 6, bx: r.cx });
      }
      // coins on the floor between the traps
      for (let k = 0; k < 8; k++) {
        const i = Math.floor(rng() * 9), j = 1 + Math.floor(rng() * 9);
        this.dropAt('coin', r.x0 + i, r.z0 + j, 1, false);
      }
      // the chest waits in a corner (never in front of a door)
      put(7, 1);
      f.chests.push({ id: this.nextId++, x: r.x0 + 7, z: r.z0 + 1, room: r.id, opened: false, big: false, key: false, t: 9, openT: 0 });
    } else if (r.type === 'combat' && n >= 3 && rng() < 0.5) spikes(1 + Math.floor(rng() * Math.min(4, n - 1)));
    if (r.type === 'combat' && n >= 5 && rng() < 0.25) {
      f.blades.push({ x: r.cx, z: r.z0 + (rng() < 0.5 ? 2 : 8), room: r.id, amp: 3.4, period: 2.8, phase: rng() * 6, bx: r.cx });
    }
    // enemies
    const lvl = this.level;
    if (r.type === 'combat' || r.type === 'exit' || (r.type === 'start' && n === 1)) {
      const budget = r.type === 'start' ? 3 : (3 + 1.35 * lvl) * (r.type === 'exit' ? 1.15 : 1) * (0.9 + rng() * 0.25);
      r.waves.push(this.makeWave(budget, n, r.type === 'start'));
      if ((lvl >= 2.6 && rng() < 0.45) || (r.type === 'exit' && lvl >= 2)) r.waves.push(this.makeWave(budget * 0.6, n, false));
      if (n >= 4 && rng() < 0.18 + 0.02 * n) r.elite = true;
      if (r.type === 'combat' && !r.rewardChest && rng() < 0.22) r.rewardChest = true;
    } else if (r.type === 'boss') {
      r.waves.push([BOSSES[Math.floor((n / BOSS_EVERY - 1)) % BOSSES.length]]);
    }
    if (r.type !== 'combat' && r.type !== 'exit' && r.type !== 'boss' && !(r.type === 'start' && n === 1)) r.cleared = true;
    void depth;
  }

  private makeWave(budget: number, n: number, intro: boolean): EnemyKind[] {
    if (intro) return ['slime', 'slime', 'skeleton'];
    const kinds = (Object.keys(ENEMIES) as EnemyKind[]).filter((k) => ENEMIES[k].cost > 0 && ENEMIES[k].minFloor <= n);
    const out: EnemyKind[] = [];
    let b = budget;
    let guard = 0;
    while (b > 0.5 && out.length < 8 && guard++ < 50) {
      // newer kinds a little more often, so each floor shows off what it adds
      const w = kinds.map((k) => 1 + (ENEMIES[k].minFloor >= n - 1 ? 0.8 : 0));
      let s = this.rng() * w.reduce((a, c) => a + c, 0);
      let k = kinds[0];
      for (let i = 0; i < kinds.length; i++) { s -= w[i]; if (s <= 0) { k = kinds[i]; break; } }
      if (ENEMIES[k].cost > b + 0.6) { if (b < 1.5) break; continue; }
      out.push(k);
      b -= ENEMIES[k].cost;
    }
    if (!out.length) out.push('slime');
    return out;
  }

  // ---------------------------------------------------------------- tile helpers

  tileAt(x: number, z: number): number {
    const tx = Math.round(x), tz = Math.round(z);
    const f = this.floor;
    if (tx < 0 || tz < 0 || tx >= f.gw || tz >= f.gh) return T_VOID;
    return f.tiles[tz * f.gw + tx];
  }

  /** True when a tile blocks walking. */
  solid(tx: number, tz: number, fly = false): boolean {
    const f = this.floor;
    if (tx < 0 || tz < 0 || tx >= f.gw || tz >= f.gh) return true;
    const t = f.tiles[tz * f.gw + tx];
    if (t === T_FLOOR || t === T_STAIRS) return false;
    if (t === T_DOOR) { const d = f.doorAt.get(tz * f.gw + tx)!; return !d.open; }
    if (t === T_OBST) return !fly;
    return true;
  }

  roomAt(x: number, z: number): number {
    const gx = Math.floor((x - 0.5) / PX), gy = Math.floor((z - 0.5) / PZ);
    for (const r of this.floor.rooms) if (r.gx === gx && r.gy === gy) {
      if (x >= r.x0 - 0.5 && x <= r.x1 + 0.5 && z >= r.z0 - 0.5 && z <= r.z1 + 0.5) return r.id;
    }
    return -1;
  }

  /** Pushes a circle out of solid tiles (and pots). */
  private collide(o: { x: number; z: number }, r: number, fly = false, pots = true): boolean {
    let hit = false;
    const tx0 = Math.round(o.x), tz0 = Math.round(o.z);
    for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
      const tx = tx0 + dx, tz = tz0 + dz;
      if (!this.solid(tx, tz, fly)) continue;
      const nx = Math.max(tx - 0.5, Math.min(o.x, tx + 0.5));
      const nz = Math.max(tz - 0.5, Math.min(o.z, tz + 0.5));
      let ex = o.x - nx, ez = o.z - nz;
      const d2 = ex * ex + ez * ez;
      if (d2 >= r * r) continue;
      hit = true;
      if (d2 < 1e-8) {
        // centre inside the tile: out along the shallower axis
        const px = o.x - tx, pz = o.z - tz;
        if (Math.abs(px) > Math.abs(pz)) o.x = tx + Math.sign(px || 1) * (0.5 + r);
        else o.z = tz + Math.sign(pz || 1) * (0.5 + r);
        continue;
      }
      const d = Math.sqrt(d2);
      ex /= d; ez /= d;
      o.x = nx + ex * r;
      o.z = nz + ez * r;
    }
    if (pots) for (const p of this.floor.pots) {
      if (p.broken || p.room !== this.room) continue;
      const dx = o.x - p.x, dz = o.z - p.z, d = Math.hypot(dx, dz), m = r + 0.22;
      if (d < m && d > 1e-4) { o.x = p.x + dx / d * m; o.z = p.z + dz / d * m; }
    }
    if (pots) for (const c of this.floor.chests) {
      if (c.room !== this.room || c.t < 0.3) continue;
      const dx = o.x - c.x, dz = o.z - c.z, d = Math.hypot(dx, dz), m = r + (c.big ? 0.42 : 0.3);
      if (d < m && d > 1e-4) { o.x = c.x + dx / d * m; o.z = c.z + dz / d * m; }
    }
    return hit;
  }

  // ---------------------------------------------------------------- step

  step(dt: number): void {
    this.events.length = 0;
    if (this.frozen || this.over) return;
    this.time += dt;
    this.updateHero(dt);
    this.updateRoom();
    this.updateRoomFight(dt);
    this.updateEnemies(dt);
    this.updateProjs(dt);
    this.updateTraps(dt);
    this.updatePicks(dt);
    for (const c of this.floor.chests) { c.t += dt; if (c.opened) c.openT += dt; }
    this.enemies = this.enemies.filter((e) => e.alive || e.hitT < 3);
  }

  private updateHero(dt: number): void {
    const h = this.hero, s = this.stats, inp = this.input;
    if (!h.alive) return;
    h.inv = Math.max(0, h.inv - dt);
    h.dashCd = Math.max(0, h.dashCd - dt);
    h.atkCd = Math.max(0, h.atkCd - dt);
    h.hitT += dt;
    const len = Math.hypot(inp.mx, inp.mz);
    const mx = len > 1 ? inp.mx / len : inp.mx, mz = len > 1 ? inp.mz / len : inp.mz;
    // aim: the mouse, or the way the hero moves; a little help towards the nearest enemy in front
    let aimAng = h.face;
    if (inp.aim) aimAng = Math.atan2(inp.ax, inp.az);
    else if (len > 0.2) aimAng = Math.atan2(mx, mz);
    if (!inp.aim) aimAng = this.assist(aimAng);

    // dash
    if (inp.dash && h.dashCd <= 0 && h.dashT <= 0 && h.spinT <= 0) {
      let dx = mx, dz = mz;
      if (Math.hypot(dx, dz) < 0.2) { dx = Math.sin(h.face); dz = Math.cos(h.face); }
      const l = Math.hypot(dx, dz);
      h.dx = dx / l; h.dz = dz / l;
      h.dashT = 0.17;
      h.dashCd = s.dashCd;
      h.chargeT = 0; h.charged = false; h.hold = 0;
      h.face = Math.atan2(h.dx, h.dz);
      this.events.push({ type: 'dash', x: h.x, z: h.z, dx: h.dx, dz: h.dz });
    }

    // attack: a press swings, holding charges a spin that goes off on release
    const pressed = inp.attack && !this.prevAttack;
    const released = !inp.attack && this.prevAttack;
    this.prevAttack = inp.attack;
    if (pressed && h.dashT <= 0 && h.spinT <= 0) {
      if (h.atkCd <= 0) {
        h.swingT = 0.24;
        h.swingHit = false;
        h.swingAng = aimAng;
        h.face = aimAng;
        h.atkCd = s.atkCd;
        this.events.push({ type: 'swing', x: h.x, z: h.z, ang: aimAng });
      }
      h.hold = 0;
    }
    if (inp.attack && h.dashT <= 0 && h.spinT <= 0) {
      h.hold += dt;
      if (h.hold > 0.22) {
        h.chargeT += dt;
        if (!h.charged && h.chargeT >= s.chargeTime) { h.charged = true; this.events.push({ type: 'charged' }); }
      }
    }
    if (released) {
      if (h.charged && h.dashT <= 0) {
        h.spinT = 0.42;
        h.spinHit = false;
        this.events.push({ type: 'spin', x: h.x, z: h.z });
      }
      h.chargeT = 0; h.charged = false; h.hold = 0;
    }

    // movement
    let sp = s.speed;
    if (h.chargeT > 0) sp *= 0.55;
    if (h.swingT > 0) sp *= 0.6;
    if (h.dashT > 0) {
      h.dashT -= dt;
      h.vx = h.dx * 13.5; h.vz = h.dz * 13.5;
      // dashing through pots breaks them
      for (const p of this.floor.pots) if (!p.broken && p.room === this.room && Math.hypot(p.x - h.x, p.z - h.z) < 0.55) this.breakPot(p);
    } else {
      const k = Math.min(1, dt * 14);
      h.vx += (mx * sp - h.vx) * k;
      h.vz += (mz * sp - h.vz) * k;
      if (len > 0.2 && h.swingT <= 0) h.face = turn(h.face, Math.atan2(mx, mz), dt * 16);
      if (h.chargeT > 0 && inp.aim) h.face = turn(h.face, aimAng, dt * 12);
    }
    h.kx *= Math.exp(-dt * 9); h.kz *= Math.exp(-dt * 9);
    const ox = h.x, oz = h.z;
    h.x += (h.vx + h.kx) * dt;
    h.z += (h.vz + h.kz) * dt;
    this.collide(h, 0.27);
    // enemies push back (not while dashing)
    if (h.dashT <= 0) for (const e of this.enemies) {
      if (!e.alive || e.state === 'spawn' || e.y > 0.5) continue;
      const dx = h.x - e.x, dz = h.z - e.z, d = Math.hypot(dx, dz), m = e.r + 0.25;
      if (d < m && d > 1e-4) { const push = (m - d) * (ENEMIES[e.kind].boss ? 1 : 0.5); h.x += dx / d * push; h.z += dz / d * push; }
    }
    this.collide(h, 0.27);
    // a locked room keeps the hero in (no dash or knockback through a closed door)
    if (this.room >= 0) {
      const lr = this.floor.rooms[this.room];
      if (lr.locked) {
        h.x = Math.max(lr.x0 - 0.5 + 0.27, Math.min(lr.x1 + 0.5 - 0.27, h.x));
        h.z = Math.max(lr.z0 - 0.5 + 0.27, Math.min(lr.z1 + 0.5 - 0.27, h.z));
      }
    }
    const moved = Math.hypot(h.x - ox, h.z - oz);
    h.speed = moved / Math.max(dt, 1e-4);
    h.walk += moved;

    // swing hits a short moment after it starts
    if (h.swingT > 0) {
      h.swingT -= dt;
      if (!h.swingHit && h.swingT < 0.17) {
        h.swingHit = true;
        this.strike(h.swingAng, s.range, s.arc, s.dmg, false);
      }
    }
    if (h.spinT > 0) {
      h.spinT -= dt;
      if (!h.spinHit && h.spinT < 0.32) {
        h.spinHit = true;
        this.strike(0, s.range * 1.3, Math.PI, s.dmg * s.spinMul, true);
      }
    }
    // the orbiting blades
    if (s.orbit > 0) {
      h.orbitAng += dt * 3.4;
      for (let k = 0; k < s.orbit; k++) {
        const a = h.orbitAng + k * Math.PI * 2 / s.orbit;
        const bx = h.x + Math.sin(a) * 1.25, bz = h.z + Math.cos(a) * 1.25;
        for (const e of this.enemies) {
          if (!e.alive || e.state === 'spawn' || e.orbitCd > 0) continue;
          if (Math.hypot(e.x - bx, e.z - bz) < e.r + 0.3) {
            e.orbitCd = 0.5;
            this.damage(e, s.dmg * 0.55, Math.atan2(e.x - h.x, e.z - h.z), 2, false);
          }
        }
        for (const p of this.floor.pots) if (!p.broken && p.room === this.room && Math.hypot(p.x - bx, p.z - bz) < 0.4) this.breakPot(p);
        for (const p of this.projs) if (!p.dead && p.kind !== 'wave' && Math.hypot(p.x - bx, p.z - bz) < 0.35) { p.dead = true; this.events.push({ type: 'parry', x: p.x, z: p.z }); }
      }
    }
    // stairs
    const st = this.floor.stairs;
    if (st.active && Math.abs(h.x - st.x) < 0.45 && Math.abs(h.z - st.z) < 0.45) {
      st.active = false;
      this.events.push({ type: 'stairs' });
    }
    // shrine
    const r = this.room >= 0 ? this.floor.rooms[this.room] : null;
    if (r && r.type === 'shrine' && !r.used && Math.hypot(h.x - r.cx, h.z - (r.z0 + 4.4)) < 0.9) {
      r.used = true;
      this.events.push({ type: 'shrine', room: r });
    }
    // chests open on a bump
    for (const c of this.floor.chests) {
      if (c.opened || c.room !== this.room || c.t < 0.5) continue;
      if (Math.hypot(h.x - c.x, h.z - c.z) < (c.big ? 0.82 : 0.7)) this.openChest(c);
    }
    // key doors
    for (const di of r?.doors ?? []) {
      const d = this.floor.doors[di];
      if (!d.keyLocked || r?.locked) continue;
      if (Math.hypot(h.x - d.x, h.z - d.z) < 1.05) {
        if (h.keys > 0) {
          h.keys--;
          d.keyLocked = false;
          d.open = true;
          this.events.push({ type: 'unlock', door: d });
        } else if (this.time - this.lastKeyNag > 2.5) {
          this.lastKeyNag = this.time;
          this.events.push({ type: 'needKey', door: d });
        }
      }
    }
  }
  private lastKeyNag = -9;

  /** Aim help: the nearest enemy within 40° and 3 tiles of where the hero looks. */
  private assist(ang: number): number {
    const h = this.hero;
    let best = ang, bestD = 3.2;
    for (const e of this.enemies) {
      if (!e.alive || e.state === 'spawn') continue;
      const d = Math.hypot(e.x - h.x, e.z - h.z);
      if (d > bestD) continue;
      const a = Math.atan2(e.x - h.x, e.z - h.z);
      if (Math.abs(angDiff(a, ang)) < 0.7) { best = a; bestD = d; }
    }
    return best;
  }

  /** A sword hit in an arc (spin: all round). */
  private strike(ang: number, range: number, arc: number, dmg: number, spin: boolean): void {
    const h = this.hero;
    for (const e of this.enemies) {
      if (!e.alive || e.state === 'spawn' || e.state === 'blink') continue;
      const dx = e.x - h.x, dz = e.z - h.z, d = Math.hypot(dx, dz);
      if (d > range + e.r) continue;
      const a = Math.atan2(dx, dz);
      if (!spin && Math.abs(angDiff(a, ang)) > arc) continue;
      const stunBonus = e.state === 'stun' ? 1.5 : 1;
      this.damage(e, dmg * stunBonus, a, spin ? 7 : 5, spin);
    }
    for (const p of this.floor.pots) {
      if (p.broken || p.room !== this.room) continue;
      const dx = p.x - h.x, dz = p.z - h.z, d = Math.hypot(dx, dz);
      if (d > range + 0.25) continue;
      if (!spin && Math.abs(angDiff(Math.atan2(dx, dz), ang)) > arc + 0.2) continue;
      this.breakPot(p);
    }
    for (const c of this.floor.chests) {
      if (c.opened || c.room !== this.room || c.t < 0.5) continue;
      if (Math.hypot(c.x - h.x, c.z - h.z) < range + 0.3) this.openChest(c);
    }
    // the blade knocks enemy shots out of the air
    for (const p of this.projs) {
      if (p.dead || p.kind === 'wave') continue;
      const dx = p.x - h.x, dz = p.z - h.z, d = Math.hypot(dx, dz);
      if (d > range + 0.2) continue;
      if (!spin && Math.abs(angDiff(Math.atan2(dx, dz), ang)) > arc + 0.2) continue;
      p.dead = true;
      this.events.push({ type: 'parry', x: p.x, z: p.z });
    }
  }

  private damage(e: Enemy, dmg: number, ang: number, knock: number, big: boolean): void {
    const boss = ENEMIES[e.kind].boss;
    e.hp -= dmg;
    e.hitT = 0;
    const kb = boss ? knock * 0.08 : e.kind === 'orc' && e.state === 'act' ? knock * 0.2 : knock;
    e.kx += Math.sin(ang) * kb;
    e.kz += Math.cos(ang) * kb;
    // a hit interrupts a small enemy's wind-up (not bosses, orcs or zombies)
    if (!boss && e.state === 'windup' && (e.kind === 'skeleton' || e.kind === 'slime' || e.kind === 'spearman' || e.kind === 'ghost') && big) {
      e.state = 'recover'; e.t = 0.4; e.tele = null;
    }
    const kill = e.hp <= 0;
    this.events.push({ type: 'hit', e, dmg: Math.round(dmg), big, x: e.x, z: e.z, kill });
    if (kill) this.kill(e);
    else if (boss && !e.rage && e.hp < e.maxHp * 0.5) {
      e.rage = true;
      this.events.push({ type: 'rage', e });
    }
  }

  private kill(e: Enemy): void {
    e.alive = false;
    e.hp = 0;
    e.hitT = 0;
    e.tele = null;
    const h = this.hero;
    h.kills++;
    const def = ENEMIES[e.kind];
    this.events.push({ type: e.kind === 'slime' && e.elite === false && this.floorNo >= 3 ? 'split' : 'kill', e });
    if (def.boss) {
      this.events.push({ type: 'bossDie', e });
      for (const o of this.enemies) if (o.alive && o.room === e.room) { o.alive = false; o.hitT = 0; this.events.push({ type: 'kill', e: o }); }
    }
    const [c0, c1] = def.coins;
    let coins = c0 + Math.floor(this.rng() * (c1 - c0 + 1));
    if (e.elite) coins = coins * 3 + 2;
    for (let i = 0; i < coins; i++) this.dropAt('coin', e.x, e.z, 1, true);
    if (def.boss) {
      this.dropAt('gem', e.x, e.z, 25, true);
      this.dropAt('heart', e.x + 0.4, e.z, 1, true);
    } else if (this.rng() < this.tune.heartDrop * (e.elite ? 4 : 1)) this.dropAt('heart', e.x, e.z, 1, true);
    // the big slime splits in two from floor 3 on
    if (e.kind === 'slime' && this.floorNo >= 3) {
      for (const s of [-1, 1]) {
        const c = this.spawn('slimelet', e.room, e.x + s * 0.3, e.z);
        c.state = 'move'; c.t = 0; c.kx = s * 3;
      }
    }
    if (this.stats.lifesteal && h.kills % this.stats.lifesteal === 0 && h.hp < h.maxHp) {
      h.hp++;
      this.events.push({ type: 'heal', n: 1 });
    }
  }

  dropAt(kind: PickKind, x: number, z: number, value: number, pop: boolean): void {
    const a = this.rng() * Math.PI * 2, sp = pop ? 0.8 + this.rng() * 1.6 : 0;
    this.picks.push({
      id: this.nextId++, kind, x, z, y: pop ? 0.3 : 0, vx: Math.sin(a) * sp, vz: Math.cos(a) * sp, vy: pop ? 3.5 + this.rng() * 2 : 0,
      value, age: pop ? 0 : 1, taken: false, magnet: false,
    });
  }

  private breakPot(p: Pot): void {
    p.broken = true;
    this.events.push({ type: 'pot', pot: p });
    const n = Math.floor(this.rng() * 4);
    for (let i = 0; i < n; i++) this.dropAt('coin', p.x, p.z, 1, true);
    if (this.rng() < this.tune.potHeart) this.dropAt('heart', p.x, p.z, 1, true);
  }

  /** A click on a chest: opens it when the hero stands close enough. */
  tryOpen(c: Chest): boolean {
    const h = this.hero;
    if (c.opened || c.t < 0.5 || !h.alive || Math.hypot(c.x - h.x, c.z - h.z) > 1.9) return false;
    this.openChest(c);
    return true;
  }

  private openChest(c: Chest): void {
    c.opened = true;
    c.openT = 0;
    this.events.push({ type: 'chest', c });
    const n = c.big ? 18 + this.floorNo * 3 : 6 + Math.floor(this.rng() * 5) + this.floorNo;
    for (let i = 0; i < n; i++) this.dropAt('coin', c.x, c.z + 0.2, 1, true);
    if (c.big) this.dropAt('gem', c.x, c.z + 0.2, 15 + this.floorNo * 3, true);
    if (c.key) this.dropAt('key', c.x, c.z + 0.2, 1, true);
    if (c.big || this.rng() < this.tune.chestHeart) this.dropAt('heart', c.x, c.z + 0.2, 1, true);
  }

  // ---------------------------------------------------------------- rooms

  private updateRoom(): void {
    const h = this.hero;
    const r = this.roomAt(h.x, h.z);
    if (r === this.room) return;
    this.room = r;
    if (r < 0) return;
    const room = this.floor.rooms[r];
    const first = !room.visited;
    room.visited = true;
    room.known = true;
    for (const di of room.doors) {
      const d = this.floor.doors[di];
      this.floor.rooms[d.a].known = true;
      this.floor.rooms[d.b].known = true;
    }
    if (first) {
      this.events.push({ type: 'enter', room });
      if (!room.cleared) room.waveT = room.type === 'start' ? 1.1 : room.type === 'boss' ? 0.2 : 0.35;
    }
  }

  private updateRoomFight(dt: number): void {
    if (this.room < 0) return;
    const r = this.floor.rooms[this.room];
    if (r.cleared) return;
    const h = this.hero;
    // lock the doors once the hero is clear of the doorway
    if (!r.locked) {
      const inside = h.x > r.x0 - 0.1 && h.x < r.x1 + 0.1 && h.z > r.z0 - 0.1 && h.z < r.z1 + 0.1;
      if (!inside) return;
      r.locked = true;
      for (const di of r.doors) this.floor.doors[di].open = false;
      this.events.push({ type: 'lock', room: r });
    }
    const alive = this.enemies.some((e) => e.alive && e.room === r.id);
    if (r.wave < r.waves.length) {
      if (alive && r.wave > 0) {
        // the next wave comes when this one is nearly done
        const left = this.enemies.filter((e) => e.alive && e.room === r.id).length;
        if (left > 1) return;
      }
      r.waveT -= dt;
      if (r.waveT > 0) return;
      this.spawnWave(r, r.waves[r.wave]);
      r.wave++;
      r.waveT = 0.6;
      return;
    }
    if (alive) return;
    // cleared
    r.cleared = true;
    r.locked = false;
    for (const di of r.doors) { const d = this.floor.doors[di]; if (!d.keyLocked) d.open = true; }
    if (r.type === 'exit' || r.type === 'boss') this.floor.stairs.active = true;
    h.shield = this.stats.shieldMax;
    this.events.push({ type: 'clear', room: r });
    if (r.rewardChest) {
      const c: Chest = { id: this.nextId++, x: r.cx, z: r.cz - 1, room: r.id, opened: false, big: false, key: r.keyChest, t: 0, openT: 0 };
      // never on the hero
      if (Math.hypot(c.x - h.x, c.z - h.z) < 1.2) c.z = r.cz + 2;
      this.floor.chests.push(c);
      this.events.push({ type: 'chestAppear', c });
    }
  }

  private spawnWave(r: Room, kinds: EnemyKind[]): void {
    const h = this.hero;
    const spots: [number, number][] = [];
    for (let j = 1; j < ROOM_H - 1; j++) for (let i = 1; i < ROOM_W - 1; i++) {
      const x = r.x0 + i, z = r.z0 + j;
      if (this.solid(x, z) || this.tileAt(x, z) === T_STAIRS) continue;
      if (Math.hypot(x - h.x, z - h.z) < 3.2) continue;
      if (this.floor.spikes.some((s) => s.x === x && s.z === z)) continue;
      spots.push([x, z]);
    }
    for (let i = spots.length - 1; i > 0; i--) { const j = Math.floor(this.rng() * (i + 1)); [spots[i], spots[j]] = [spots[j], spots[i]]; }
    kinds.forEach((k, i) => {
      const boss = ENEMIES[k].boss;
      const [x, z] = boss ? [r.cx, r.z0 + 3] : spots[i % Math.max(1, spots.length)] ?? [r.cx, r.cz];
      const e = this.spawn(k, r.id, x, z);
      if (r.elite && i === 0 && !boss) {
        e.elite = true;
        e.maxHp = e.hp = e.hp * 2.2;
        e.r *= 1.2;
      }
      if (boss) {
        e.t = 2.6;
        this.events.push({ type: 'bossIntro', e });
      }
    });
  }

  spawn(kind: EnemyKind, room: number, x: number, z: number): Enemy {
    const def = ENEMIES[kind];
    const boss = !!def.boss;
    const cycle = boss ? Math.floor((this.floorNo - 1) / (BOSS_EVERY * BOSSES.length)) : 0;
    const hpMul = this.tune.enemyHp * (boss ? 1 + 0.12 * (this.level - BOSS_EVERY) / BOSS_EVERY + 0.6 * cycle : 1 + 0.14 * (this.level - 1));
    const e: Enemy = {
      id: this.nextId++, kind, room, x, z, kx: 0, kz: 0, vx: 0, vz: 0, hp: def.hp * hpMul, maxHp: def.hp * hpMul, r: def.r,
      speed: def.speed * this.tune.enemySpeed * (1 + 0.025 * (this.level - 1)), face: Math.atan2(this.hero.x - x, this.hero.z - z),
      state: 'spawn', t: 0.75, cd: 0.6 + this.rng() * 0.8, move: '', count: 0, elite: false, alive: true, hitT: 9, orbitCd: 0,
      y: 0, tele: null, struck: false, walk: 0, rage: false,
    };
    this.enemies.push(e);
    this.events.push({ type: 'spawn', e });
    return e;
  }

  // ---------------------------------------------------------------- enemies

  /** Distance field (tiles) to the hero inside the hero's room, for walking around obstacles. */
  private flowField(): Int16Array | null {
    if (this.room < 0) return this.flow;
    const f = this.floor, h = this.hero;
    const tile = Math.round(h.z) * f.gw + Math.round(h.x);
    if (tile === this.flowTile && this.room === this.flowRoom && this.flow) return this.flow;
    this.flowTile = tile;
    this.flowRoom = this.room;
    const field = this.flow && this.flow.length === f.gw * f.gh ? this.flow : new Int16Array(f.gw * f.gh);
    field.fill(-1);
    const r = f.rooms[this.room];
    const q: number[] = [tile];
    field[tile] = 0;
    for (let qi = 0; qi < q.length; qi++) {
      const t = q[qi];
      const tx = t % f.gw, tz = (t - tx) / f.gw;
      for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = tx + dx, nz = tz + dz;
        if (nx < r.x0 || nx > r.x1 || nz < r.z0 || nz > r.z1) continue;
        const ni = nz * f.gw + nx;
        if (field[ni] >= 0 || this.solid(nx, nz)) continue;
        field[ni] = field[t] + 1;
        q.push(ni);
      }
    }
    this.flow = field;
    return field;
  }

  /** Direction to walk towards the hero (around obstacles). */
  private seek(e: Enemy, fly: boolean): [number, number] {
    const h = this.hero;
    const dx = h.x - e.x, dz = h.z - e.z, d = Math.hypot(dx, dz) || 1;
    if (fly || d < 1.3) return [dx / d, dz / d];
    const field = this.flowField();
    if (!field) return [dx / d, dz / d];
    const f = this.floor;
    const tx = Math.round(e.x), tz = Math.round(e.z);
    const here = field[tz * f.gw + tx];
    let best = here < 0 ? 9999 : here, bx = 0, bz = 0;
    for (const [ox, oz] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]]) {
      const nx = tx + ox, nz = tz + oz;
      if (nx < 0 || nz < 0 || nx >= f.gw || nz >= f.gh) continue;
      const v = field[nz * f.gw + nx];
      if (v < 0) continue;
      // no corner cutting
      if (ox && oz && (this.solid(tx + ox, tz) || this.solid(tx, tz + oz))) continue;
      if (v < best) { best = v; bx = nx; bz = nz; }
    }
    if (best === here || (bx === 0 && bz === 0)) return [dx / d, dz / d];
    const sx = bx - e.x, sz = bz - e.z, sl = Math.hypot(sx, sz) || 1;
    return [sx / sl, sz / sl];
  }

  private updateEnemies(dt: number): void {
    const h = this.hero;
    const W = this.tune.windup, G = this.tune.attackGap;
    for (const e of this.enemies) {
      e.hitT += dt;
      if (!e.alive) continue;
      e.orbitCd = Math.max(0, e.orbitCd - dt);
      e.cd -= dt;
      e.t -= dt;
      const def = ENEMIES[e.kind];
      const dx = h.x - e.x, dz = h.z - e.z, dist = Math.hypot(dx, dz);
      const toHero = Math.atan2(dx, dz);
      let mvx = 0, mvz = 0, sp = e.speed;
      if (e.state === 'spawn') {
        if (e.t <= 0) { e.state = 'move'; e.t = 0; }
      } else if (def.boss) {
        [mvx, mvz, sp] = this.bossAi(e, dt, dist, toHero);
      } else {
        switch (e.kind) {
          case 'slime':
          case 'slimelet': {
            // hops towards the hero; only the landing hurts
            if (e.state === 'move') {
              if (e.t <= 0) { e.state = 'act'; e.t = 0.55; const [sx, sz] = this.seek(e, false); e.vx = sx * 2.4 * this.tune.enemySpeed; e.vz = sz * 2.4 * this.tune.enemySpeed; e.face = Math.atan2(sx, sz); e.struck = false; }
            } else if (e.state === 'act') {
              mvx = e.vx; mvz = e.vz; sp = 1;
              e.y = Math.sin(Math.max(0, 1 - e.t / 0.55) * Math.PI) * 0.45;
              if (e.t <= 0) { e.state = 'move'; e.t = (0.6 + this.rng() * 0.5) * G; e.y = 0; }
              if (!e.struck && e.y < 0.2 && e.t < 0.25 && dist < e.r + 0.3) { e.struck = true; this.hurtHero(e.x, e.z); }
            }
            break;
          }
          case 'skeleton':
          case 'zombie': {
            const reach = e.kind === 'zombie' ? 1.05 : 1.0;
            if (e.state === 'move') {
              [mvx, mvz] = this.seek(e, false);
              e.face = turn(e.face, Math.atan2(mvx, mvz), dt * 8);
              if (dist < reach + e.r && e.cd <= 0) {
                e.state = 'windup'; e.t = (e.kind === 'zombie' ? 0.7 : 0.5) * W; e.face = toHero;
                e.tele = { kind: 'cone', x: e.x, z: e.z, r: reach + 0.3, ang: toHero, len: 1.1 };
                this.events.push({ type: 'windup', e });
              }
            } else if (e.state === 'windup') {
              if (e.tele) { e.tele.x = e.x; e.tele.z = e.z; }
              if (e.t <= 0) {
                e.state = 'recover'; e.t = (e.kind === 'zombie' ? 0.9 : 0.6) * G; e.cd = 0.8 * G;
                const tele = e.tele; e.tele = null;
                this.events.push({ type: 'attack', e });
                if (tele && dist < tele.r + 0.25 && Math.abs(angDiff(toHero, tele.ang)) < 1.1) this.hurtHero(e.x, e.z);
              }
            } else if (e.state === 'recover') {
              if (e.t <= 0) e.state = 'move';
            }
            break;
          }
          case 'spearman': {
            // keeps its distance and throws spears
            if (e.state === 'move') {
              const [sx, sz] = this.seek(e, false);
              if (dist < 3) { mvx = -dx / dist; mvz = -dz / dist; }
              else if (dist > 5) { mvx = sx; mvz = sz; }
              else { mvx = -dz / dist * 0.5; mvz = dx / dist * 0.5; }
              e.face = turn(e.face, toHero, dt * 6);
              if (e.cd <= 0 && dist < 7) {
                e.state = 'windup'; e.t = 0.6 * W; e.face = toHero;
                e.tele = { kind: 'line', x: e.x, z: e.z, r: 0.2, ang: toHero, len: 6 };
                this.events.push({ type: 'windup', e });
              }
            } else if (e.state === 'windup') {
              e.face = turn(e.face, toHero, dt * 1.5);
              if (e.tele) { e.tele.x = e.x; e.tele.z = e.z; e.tele.ang = e.face; }
              if (e.t <= 0) {
                e.tele = null;
                this.shoot(e, 'spear', e.face, 6.5);
                e.state = 'recover'; e.t = 0.5; e.cd = (1.8 + this.rng()) * G;
              }
            } else if (e.state === 'recover' && e.t <= 0) e.state = 'move';
            break;
          }
          case 'ghost': {
            e.y = 0.25 + Math.sin(this.time * 3 + e.id) * 0.1;
            if (e.state === 'move') {
              const wob = Math.sin(this.time * 2.2 + e.id * 1.7);
              mvx = dx / dist + (-dz / dist) * wob * 0.8; mvz = dz / dist + (dx / dist) * wob * 0.8;
              e.face = turn(e.face, toHero, dt * 6);
              if (dist < 3.2 && e.cd <= 0) {
                e.state = 'windup'; e.t = 0.55 * W; e.face = toHero;
                e.tele = { kind: 'line', x: e.x, z: e.z, r: 0.35, ang: toHero, len: 3.4 };
                this.events.push({ type: 'windup', e });
              }
            } else if (e.state === 'windup') {
              if (e.tele) { e.tele.x = e.x; e.tele.z = e.z; }
              if (e.t <= 0) {
                e.state = 'act'; e.t = 0.42; e.struck = false;
                const a = e.tele?.ang ?? toHero;
                e.vx = Math.sin(a) * 8 * this.tune.enemySpeed; e.vz = Math.cos(a) * 8 * this.tune.enemySpeed; e.tele = null;
                this.events.push({ type: 'attack', e });
              }
            } else if (e.state === 'act') {
              mvx = e.vx; mvz = e.vz; sp = 1;
              if (!e.struck && dist < e.r + 0.3) { e.struck = true; this.hurtHero(e.x, e.z); }
              if (e.t <= 0) { e.state = 'recover'; e.t = 0.7; e.cd = 1.6 * G; }
            } else if (e.state === 'recover') {
              mvx = -dx / dist * 0.4; mvz = -dz / dist * 0.4;
              if (e.t <= 0) e.state = 'move';
            }
            break;
          }
          case 'orc': {
            // lines up and charges; a wall stuns it
            if (e.state === 'move') {
              [mvx, mvz] = this.seek(e, false);
              e.face = turn(e.face, Math.atan2(mvx, mvz), dt * 6);
              if (dist < 5 && dist > 1.4 && e.cd <= 0) {
                e.state = 'windup'; e.t = 0.75 * W; e.face = toHero;
                e.tele = { kind: 'line', x: e.x, z: e.z, r: 0.45, ang: toHero, len: 5.5 };
                this.events.push({ type: 'windup', e });
              } else if (dist < 1.1 && e.cd <= 0) {
                e.state = 'windup'; e.move = 'swipe'; e.t = 0.55 * W; e.face = toHero;
                e.tele = { kind: 'cone', x: e.x, z: e.z, r: 1.4, ang: toHero, len: 1.2 };
                this.events.push({ type: 'windup', e });
              }
            } else if (e.state === 'windup') {
              if (e.move !== 'swipe') { e.face = turn(e.face, toHero, dt * 1.2); if (e.tele) e.tele.ang = e.face; }
              if (e.tele) { e.tele.x = e.x; e.tele.z = e.z; }
              if (e.t <= 0) {
                if (e.move === 'swipe') {
                  const tele = e.tele; e.tele = null; e.move = '';
                  if (tele && dist < tele.r + 0.2 && Math.abs(angDiff(toHero, tele.ang)) < 1.1) this.hurtHero(e.x, e.z);
                  this.events.push({ type: 'attack', e });
                  e.state = 'recover'; e.t = 0.7 * G; e.cd = 1 * G;
                } else {
                  e.tele = null;
                  e.state = 'act'; e.t = 1.1; e.struck = false;
                  e.vx = Math.sin(e.face) * 8 * this.tune.enemySpeed; e.vz = Math.cos(e.face) * 8 * this.tune.enemySpeed;
                  this.events.push({ type: 'attack', e });
                }
              }
            } else if (e.state === 'act') {
              mvx = e.vx; mvz = e.vz; sp = 1;
              if (!e.struck && dist < e.r + 0.32) { e.struck = true; this.hurtHero(e.x, e.z); }
              if (e.t <= 0) { e.state = 'recover'; e.t = 0.6; e.cd = 1.4 * G; }
            } else if (e.state === 'stun') {
              if (e.t <= 0) { e.state = 'move'; e.cd = 0.8 * G; }
            } else if (e.state === 'recover' && e.t <= 0) e.state = 'move';
            break;
          }
          case 'vampire': {
            if (e.state === 'move') {
              if (dist < 2.2 && e.cd < 0.8) {
                e.state = 'blink'; e.t = 0.45;
                this.events.push({ type: 'blink', x: e.x, z: e.z });
                break;
              }
              const want = 4.2;
              const [sx, sz] = this.seek(e, false);
              if (dist > want + 1) { mvx = sx; mvz = sz; } else if (dist < want - 1) { mvx = -dx / dist; mvz = -dz / dist; } else { mvx = dz / dist * 0.6; mvz = -dx / dist * 0.6; }
              e.face = turn(e.face, toHero, dt * 6);
              if (e.cd <= 0) {
                e.state = 'windup'; e.t = 0.65 * W; e.face = toHero;
                e.tele = { kind: 'cone', x: e.x, z: e.z, r: 3.2, ang: toHero, len: 0.6 };
                this.events.push({ type: 'windup', e });
              }
            } else if (e.state === 'blink') {
              e.y = -1;
              if (e.t <= 0) {
                this.blinkTo(e, 3.5);
                e.state = 'recover'; e.t = 0.4; e.y = 0; e.cd = Math.max(e.cd, 0.6);
              }
            } else if (e.state === 'windup') {
              e.face = turn(e.face, toHero, dt * 3);
              if (e.tele) { e.tele.x = e.x; e.tele.z = e.z; e.tele.ang = e.face; }
              if (e.t <= 0) {
                e.tele = null;
                for (const o of [-0.35, 0, 0.35]) this.shoot(e, 'orb', e.face + o, 4.2);
                this.events.push({ type: 'attack', e });
                e.state = 'recover'; e.t = 0.6; e.cd = 2.2 * G;
              }
            } else if (e.state === 'recover' && e.t <= 0) e.state = 'move';
            break;
          }
        }
      }
      if (e.state === 'move' && e.kind !== 'slime' && e.kind !== 'slimelet') {
        // keep apart from the others
        for (const o of this.enemies) {
          if (o === e || !o.alive || o.room !== e.room) continue;
          const ox = e.x - o.x, oz = e.z - o.z, od = Math.hypot(ox, oz);
          if (od < e.r + o.r && od > 1e-4) { mvx += ox / od * 0.8; mvz += oz / od * 0.8; }
        }
      }
      e.kx *= Math.exp(-dt * 8); e.kz *= Math.exp(-dt * 8);
      const px = e.x, pz = e.z;
      e.x += (mvx * sp + e.kx) * dt;
      e.z += (mvz * sp + e.kz) * dt;
      const hit = this.collide(e, e.r, false, false);
      // keep enemies inside their room
      const r = this.floor.rooms[e.room];
      e.x = Math.max(r.x0 - 0.5 + e.r, Math.min(r.x1 + 0.5 - e.r, e.x));
      e.z = Math.max(r.z0 - 0.5 + e.r, Math.min(r.z1 + 0.5 - e.r, e.z));
      e.walk += Math.hypot(e.x - px, e.z - pz);
      if (hit && e.state === 'act' && (e.kind === 'orc' || (def.boss && e.move === 'charge'))) {
        e.state = 'stun'; e.t = def.boss ? 0.9 : 1.3; e.vx = e.vz = 0;
        this.events.push({ type: 'wallHit', e });
      }
      // ground enemies on raised spikes get hurt too
      if (!def.fly && !def.boss && e.state !== 'spawn') for (const s of this.floor.spikes) {
        if (s.state === 2 && s.room === e.room && Math.abs(s.x - e.x) < 0.45 && Math.abs(s.z - e.z) < 0.45 && e.orbitCd <= 0) {
          e.orbitCd = 0.8;
          this.damage(e, 8, 0, 0, false);
        }
      }
      // contact with bosses and charging enemies is handled in their own states
      if (def.boss && e.alive && dist < e.r + 0.25 && (e.state === 'move' || e.state === 'act')) this.hurtHero(e.x, e.z);
    }
  }

  private blinkTo(e: Enemy, minDist: number): void {
    const r = this.floor.rooms[e.room], h = this.hero;
    for (let k = 0; k < 30; k++) {
      const x = r.x0 + 1 + Math.floor(this.rng() * (ROOM_W - 2)), z = r.z0 + 1 + Math.floor(this.rng() * (ROOM_H - 2));
      if (this.solid(x, z) || Math.hypot(x - h.x, z - h.z) < minDist) continue;
      e.x = x; e.z = z;
      break;
    }
    this.events.push({ type: 'blink', x: e.x, z: e.z });
  }

  /** Boss behaviour: a cycle of moves; below half health (rage) everything is quicker. */
  private bossAi(e: Enemy, dt: number, dist: number, toHero: number): [number, number, number] {
    const W = this.tune.windup * (e.rage ? 0.8 : 1);
    const G = this.tune.attackGap * (e.rage ? 0.75 : 1);
    const h = this.hero;
    let mvx = 0, mvz = 0, sp = e.speed * (e.rage ? 1.2 : 1);
    const adds = () => this.enemies.filter((o) => o.alive && o.room === e.room && !ENEMIES[o.kind].boss).length;
    const startWind = (move: string, t: number, tele: Tele | null) => {
      e.state = 'windup'; e.move = move; e.t = t * W; e.tele = tele; e.face = toHero;
      this.events.push({ type: 'windup', e });
    };
    if (e.state === 'move') {
      const [sx, sz] = this.seek(e, e.kind === 'vamplord');
      if (e.kind !== 'vamplord' || dist > 4) { mvx = sx; mvz = sz; }
      e.face = turn(e.face, toHero, dt * 4);
      if (e.cd <= 0) {
        const roll = this.rng();
        if (e.kind === 'boneking') {
          if (dist < 2.4 && roll < 0.55) startWind('slam', 1.0, { kind: 'circle', x: e.x + Math.sin(toHero) * 0.8, z: e.z + Math.cos(toHero) * 0.8, r: 1.7, ang: 0, len: 0 });
          else if (roll < 0.3 && adds() < 3) startWind('summon', 0.8, null);
          else if (roll < 0.62) startWind('bones', 0.75, { kind: 'circle', x: e.x, z: e.z, r: 1.0, ang: 0, len: 0 });
          else if (dist < 3.5) startWind('sweep', 0.7, { kind: 'circle', x: e.x, z: e.z, r: 1.6, ang: 0, len: 0 });
        } else if (e.kind === 'warlord') {
          if (dist < 2.2 && roll < 0.5) startWind('quake', 1.0, { kind: 'circle', x: e.x, z: e.z, r: 1.9, ang: 0, len: 0 });
          else if (roll < 0.25 && adds() < 3) startWind('summon', 0.8, null);
          else { e.count = e.rage ? 3 : 2; startWind('charge', 0.8, { kind: 'line', x: e.x, z: e.z, r: 0.8, ang: toHero, len: 8 }); }
        } else {
          if (roll < 0.25 && adds() < 3) startWind('summon', 0.8, null);
          else if (roll < 0.6) startWind('nova', 0.85, { kind: 'circle', x: e.x, z: e.z, r: 1.2, ang: 0, len: 0 });
          else { e.count = 3; startWind('volley', 0.55, { kind: 'cone', x: e.x, z: e.z, r: 4, ang: toHero, len: 0.7 }); }
        }
      }
    } else if (e.state === 'windup') {
      if (e.move === 'charge') { e.face = turn(e.face, toHero, dt * 1.5); if (e.tele) { e.tele.ang = e.face; e.tele.x = e.x; e.tele.z = e.z; } }
      else if (e.move === 'volley') { e.face = turn(e.face, toHero, dt * 4); if (e.tele) { e.tele.ang = e.face; e.tele.x = e.x; e.tele.z = e.z; } }
      if (e.t <= 0) {
        const tele = e.tele;
        e.tele = null;
        this.events.push({ type: 'attack', e });
        switch (e.move) {
          case 'slam':
          case 'quake': {
            const t = tele!;
            this.events.push({ type: 'slam', x: t.x, z: t.z, r: t.r });
            if (Math.hypot(h.x - t.x, h.z - t.z) < t.r + 0.2) this.hurtHero(t.x, t.z);
            if (e.move === 'quake') this.wave(e, e.rage ? 2 : 1);
            if (e.rage && e.move === 'slam') this.ring(e, 'bone', 8, 4, this.rng());
            e.state = 'recover'; e.t = 0.9 * G; e.cd = 1.2 * G;
            break;
          }
          case 'sweep':
            e.state = 'act'; e.t = 1.2; e.struck = false;
            e.tele = { kind: 'circle', x: e.x, z: e.z, r: 1.3, ang: 0, len: 0 };
            break;
          case 'summon': {
            const kind: EnemyKind = e.kind === 'boneking' ? 'skeleton' : e.kind === 'warlord' ? 'slime' : 'ghost';
            for (let k = 0; k < 2; k++) {
              const a = this.rng() * Math.PI * 2;
              const x = e.x + Math.sin(a) * 1.6, z = e.z + Math.cos(a) * 1.6;
              const r = this.floor.rooms[e.room];
              this.spawn(kind, e.room, Math.max(r.x0, Math.min(r.x1, x)), Math.max(r.z0, Math.min(r.z1, z)));
            }
            e.state = 'recover'; e.t = 0.6; e.cd = 1.4 * G;
            break;
          }
          case 'bones':
            this.ring(e, 'bone', e.rage ? 14 : 10, 4.2, this.rng());
            e.state = 'recover'; e.t = 0.6 * G; e.cd = 1.3 * G;
            break;
          case 'charge':
            e.state = 'act'; e.t = 1.3; e.struck = false;
            e.vx = Math.sin(e.face) * 9 * this.tune.enemySpeed; e.vz = Math.cos(e.face) * 9 * this.tune.enemySpeed;
            break;
          case 'nova':
            this.ring(e, 'orb', e.rage ? 16 : 12, 3.6, this.rng());
            if (e.rage) this.ring(e, 'orb', 12, 2.6, this.rng());
            e.state = 'recover'; e.t = 0.5; e.cd = 1.4 * G;
            break;
          case 'volley':
            for (const o of [-0.3, 0, 0.3]) this.shoot(e, 'orb', e.face + o, 4.6);
            e.count--;
            if (e.count > 0) { e.state = 'windup'; e.t = 0.3 * W; e.tele = { kind: 'cone', x: e.x, z: e.z, r: 4, ang: e.face, len: 0.7 }; }
            else { e.state = 'recover'; e.t = 0.6; e.cd = 1.1 * G; if (this.rng() < 0.6) { e.state = 'blink'; e.t = 0.5; this.events.push({ type: 'blink', x: e.x, z: e.z }); } }
            break;
        }
      }
    } else if (e.state === 'act') {
      if (e.move === 'sweep') {
        // spins towards the hero
        mvx = Math.sin(toHero) * 1.4; mvz = Math.cos(toHero) * 1.4; sp = this.tune.enemySpeed * (e.rage ? 1.25 : 1);
        e.face += dt * 14;
        if (e.tele) { e.tele.x = e.x; e.tele.z = e.z; }
        if (dist < 1.3 + 0.2) this.hurtHero(e.x, e.z);
        if (e.t <= 0) { e.state = 'stun'; e.t = 1.0; e.cd = 1 * G; e.tele = null; }
      } else if (e.move === 'charge') {
        mvx = e.vx; mvz = e.vz; sp = 1;
        if (e.t <= 0) this.afterCharge(e, W);
      }
    } else if (e.state === 'stun') {
      if (e.t <= 0) {
        if (e.move === 'charge') this.afterCharge(e, W);
        else { e.state = 'move'; e.cd = Math.max(e.cd, 0.5 * G); }
      }
    } else if (e.state === 'recover') {
      if (e.t <= 0) e.state = 'move';
    } else if (e.state === 'blink') {
      e.y = -2;
      if (e.t <= 0) { this.blinkTo(e, 3.5); e.y = 0; e.state = 'recover'; e.t = 0.5; }
    }
    return [mvx, mvz, sp];
  }

  private afterCharge(e: Enemy, W: number): void {
    e.count--;
    if (e.count > 0) {
      const toHero = Math.atan2(this.hero.x - e.x, this.hero.z - e.z);
      e.state = 'windup'; e.move = 'charge'; e.t = 0.55 * W; e.face = toHero;
      e.tele = { kind: 'line', x: e.x, z: e.z, r: 0.8, ang: toHero, len: 8 };
      this.events.push({ type: 'windup', e });
    } else { e.state = 'recover'; e.t = 0.8; e.cd = 1.1 * this.tune.attackGap; e.move = ''; }
  }

  private shoot(e: Enemy, kind: ProjKind, ang: number, speed: number): void {
    const sp = speed * this.tune.projSpeed;
    const p: Proj = { id: this.nextId++, kind, x: e.x + Math.sin(ang) * 0.4, z: e.z + Math.cos(ang) * 0.4, vx: Math.sin(ang) * sp, vz: Math.cos(ang) * sp, r: kind === 'orb' ? 0.2 : 0.16, life: 4, radius: 0, cx: 0, cz: 0, dead: false };
    this.projs.push(p);
    this.events.push({ type: 'shoot', p, e });
  }

  private ring(e: Enemy, kind: ProjKind, n: number, speed: number, off: number): void {
    for (let k = 0; k < n; k++) this.shoot(e, kind, off * Math.PI * 2 + k * Math.PI * 2 / n, speed);
  }

  /** An expanding shock ring on the floor: dash through it. */
  private wave(e: Enemy, n: number): void {
    for (let k = 0; k < n; k++) {
      const p: Proj = { id: this.nextId++, kind: 'wave', x: e.x, z: e.z, vx: 0, vz: 0, r: 0.28, life: 1.6 + k * 0.5, radius: 0.6 - k * 1.4, cx: e.x, cz: e.z, dead: false };
      this.projs.push(p);
      this.events.push({ type: 'shoot', p, e });
    }
  }

  hurtHero(fx: number, fz: number): void {
    const h = this.hero;
    if (!h.alive || h.inv > 0 || h.dashT > 0 || this.immortal) return;
    const a = Math.atan2(h.x - fx, h.z - fz);
    h.kx = Math.sin(a) * 6; h.kz = Math.cos(a) * 6;
    if (h.shield > 0) {
      h.shield--;
      h.inv = 0.7;
      this.events.push({ type: 'block', x: h.x, z: h.z });
      return;
    }
    h.hp--;
    h.inv = 1.0;
    h.hitT = 0;
    h.chargeT = 0; h.charged = false;
    this.events.push({ type: 'heroHit', x: h.x, z: h.z, dmg: 1 });
    if (h.hp <= 0) {
      h.hp = 0;
      h.alive = false;
      this.over = true;
      this.events.push({ type: 'die' });
    }
  }

  /** Rewarded continue: half the hearts back, a breather and the shots near the hero gone. */
  revive(): void {
    const h = this.hero;
    h.alive = true;
    h.hp = Math.max(1, Math.ceil(h.maxHp / 2));
    h.inv = 2.5;
    h.kx = h.kz = 0;
    this.over = false;
    this.projs = [];
    for (const e of this.enemies) {
      if (!e.alive) continue;
      const d = Math.hypot(e.x - h.x, e.z - h.z);
      if (d < 2.5) { const a = Math.atan2(e.x - h.x, e.z - h.z); e.kx = Math.sin(a) * 9; e.kz = Math.cos(a) * 9; }
      if (e.state === 'windup' || e.state === 'act') { e.state = 'recover'; e.t = 1; e.tele = null; }
    }
  }

  // ---------------------------------------------------------------- projectiles, traps, pickups

  private updateProjs(dt: number): void {
    const h = this.hero;
    for (const p of this.projs) {
      if (p.dead) continue;
      p.life -= dt;
      if (p.life <= 0) { p.dead = true; continue; }
      if (p.kind === 'wave') {
        p.radius += dt * 4.2 * this.tune.projSpeed;
        if (p.radius > 0.4) {
          const d = Math.hypot(h.x - p.cx, h.z - p.cz);
          if (Math.abs(d - p.radius) < 0.3) this.hurtHero(p.cx, p.cz);
        }
        continue;
      }
      p.x += p.vx * dt;
      p.z += p.vz * dt;
      const t = this.tileAt(p.x, p.z);
      if (t === T_WALL || t === T_OBST || t === T_VOID || (t === T_DOOR && this.solid(Math.round(p.x), Math.round(p.z)))) { p.dead = true; this.events.push({ type: 'parry', x: p.x, z: p.z }); continue; }
      if (Math.hypot(h.x - p.x, h.z - p.z) < p.r + 0.24 && h.inv <= 0 && h.dashT <= 0) {
        p.dead = true;
        this.hurtHero(p.x - p.vx, p.z - p.vz);
      }
    }
    this.projs = this.projs.filter((p) => !p.dead);
  }

  private updateTraps(dt: number): void {
    const h = this.hero;
    for (const s of this.floor.spikes) {
      if (s.room !== this.room) { s.state = 0; continue; }
      const u = ((this.time + s.phase) % s.period) / s.period;
      const st = u < 0.55 ? 0 : u < 0.72 ? 1 : 2;
      if (st === 2 && s.state !== 2) this.events.push({ type: 'spikes', s });
      s.state = st;
      if (st === 2 && Math.abs(h.x - s.x) < 0.42 && Math.abs(h.z - s.z) < 0.42 && h.inv <= 0 && h.dashT <= 0) {
        this.events.push({ type: 'trapHit', x: s.x, z: s.z });
        this.hurtHero(s.x, s.z + 0.01);
      }
    }
    for (const b of this.floor.blades) {
      b.bx = b.x + Math.sin(this.time * Math.PI * 2 / b.period + b.phase) * b.amp;
      if (b.room !== this.room) continue;
      if (Math.abs(h.x - b.bx) < 0.42 && Math.abs(h.z - b.z) < 0.4 && h.inv <= 0 && h.dashT <= 0) {
        this.events.push({ type: 'trapHit', x: b.bx, z: b.z });
        this.hurtHero(b.bx, b.z);
      }
    }
    void dt;
  }

  private updatePicks(dt: number): void {
    const h = this.hero, s = this.stats;
    for (const p of this.picks) {
      if (p.taken) continue;
      p.age += dt;
      if (p.vy !== 0 || p.y > 0) {
        p.vy -= 18 * dt;
        p.y += p.vy * dt;
        if (p.y <= 0) { p.y = 0; p.vy = Math.abs(p.vy) > 2 ? -p.vy * 0.35 : 0; p.vx *= 0.5; p.vz *= 0.5; }
      }
      p.x += p.vx * dt; p.z += p.vz * dt;
      p.vx *= Math.exp(-dt * 2); p.vz *= Math.exp(-dt * 2);
      const o = { x: p.x, z: p.z };
      this.collide(o, 0.15, false, false);
      p.x = o.x; p.z = o.z;
      if (!h.alive) continue;
      const d = Math.hypot(h.x - p.x, h.z - p.z);
      const magnetR = p.kind === 'coin' || p.kind === 'gem' ? s.magnet : p.kind === 'key' ? 1.4 : 1.4;
      if (p.age > 0.45 && d < magnetR && (p.kind !== 'heart' || h.hp < h.maxHp)) p.magnet = true;
      if (p.magnet) {
        const k = Math.min(1, dt * 10), sp = 9;
        p.vx += ((h.x - p.x) / (d || 1) * sp - p.vx) * k;
        p.vz += ((h.z - p.z) / (d || 1) * sp - p.vz) * k;
      }
      if (d < 0.38 && p.age > 0.3) {
        if (p.kind === 'heart' && h.hp >= h.maxHp) continue;
        p.taken = true;
        if (p.kind === 'coin' || p.kind === 'gem') {
          const v = Math.max(1, Math.round(p.value * s.goldMul));
          h.gold += v;
          this.goldRun += v;
          p.value = v;
        } else if (p.kind === 'heart') h.hp = Math.min(h.maxHp, h.hp + 1);
        else if (p.kind === 'key') h.keys++;
        this.events.push({ type: 'pick', p });
      }
    }
    this.picks = this.picks.filter((p) => !p.taken);
  }

  /** The run's score: floors cleared and gold picked up. */
  get score(): number {
    return this.cleared * 200 + this.goldRun;
  }
}

/** Shortest signed difference between two angles. */
export function angDiff(a: number, b: number): number {
  let d = a - b;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
}

/** Turns angle `a` towards `b` by at most `step` radians. */
export function turn(a: number, b: number, step: number): number {
  const d = angDiff(b, a);
  return a + Math.max(-step, Math.min(step, d));
}
