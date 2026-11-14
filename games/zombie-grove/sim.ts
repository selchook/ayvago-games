// Zombie Grove: the simulation. Deterministic for a seed and pure (no Phaser, no three.js), so
// the Play scene, the menu's autopilot and the headless balance run (balance.ts) all use it.
//   - The survivor moves; every weapon fires on its own at the nearest zombies.
//   - Zombies follow a flow field round the trees and rocks (a breadth-first search from the
//     survivor's cell, refreshed a few times a second), keep apart through a spatial hash and
//     bite on contact. Runners sprint, swarms come in packs, spitters lob goo from a distance,
//     exploders light a fuse, tanks shrug off knockback; mini-bosses and the Rot King have
//     their own attacks.
//   - Kills drop XP gems; levels earn card offers that wait until the player opens them.
//   - The night lasts TUNING.night seconds; at dawn the sun burns the horde away (a win).
// Everything the view and the sounds need to show is in the state and in `events`.
import {
  TUNING, ZOMBIES, ARENA, PLAY_EDGE, PLAYER_SPEED, PLAYER_R, SPAWN_R, BITE_CD, FUSE_R, FUSE, BLAST_R, BLAST_DMG,
  SPIT_RANGE, SPIT_CD, GOO_DMG, GOO_SPEED, MINIS, PASSIVE_STEP, MAX_LEVEL, HEROES, isBoss, weaponStats, xpToNext,
  type Mode, type Tuning, type ZombieKind, type BossKind, type WeaponId, type PassiveId, type WeaponStats,
} from './defs';
import { arena, seeded, type Collider } from './arena';
import { rollOffer, cardKey, type Card, type Bag, type OwnedWeapon, type OwnedPassive } from './cards';
import { NO_META, type MetaFx } from './meta';

export { seeded };

export interface Input { mx: number; mz: number }
export const NO_INPUT: Input = { mx: 0, mz: 0 };

export type Act = 'walk' | 'windup' | 'charge' | 'slam' | 'spit' | 'summon' | 'spray';

export interface Zombie {
  id: number;
  kind: ZombieKind;
  x: number; z: number;
  /** Knockback velocity. */
  kx: number; kz: number;
  hp: number; maxHp: number;
  speed: number;
  r: number;
  dmg: number;
  /** Seconds until it may bite again. */
  bite: number;
  /** Hit flash (s left). */
  flash: number;
  /** Facing angle (atan2 of the walk direction, x over z). */
  face: number;
  /** Animation clock and a random offset. */
  anim: number;
  /** Size and colour variation (0–1). */
  vary: number;
  /** Bite animation (s left). */
  atk: number;
  /** Burning (s left) and its damage per second. */
  burn: number; burnDps: number;
  /** Exploder fuse (s left, -1 when unlit). */
  fuse: number;
  /** Spitter / boss attack timer. */
  cd: number;
  /** Wards' hit timer. */
  ward: number;
  /** Bosses: the current move and its timer, charge direction. */
  act: Act; actT: number; ax: number; az: number;
  /** Phase two of the Rot King (below half health). */
  rage: boolean;
  dead: boolean;
  /** Spawned by the dawn's last wave or a horde rush (for the view's entrance). */
  born: number;
}

export interface Corpse { kind: ZombieKind; x: number; z: number; face: number; vary: number; t: number; burnt: boolean; scale: number }

export type ShotKind = 'arrow' | 'shot' | 'ember' | 'laser';
export interface Shot { kind: ShotKind; x: number; z: number; vx: number; vz: number; dmg: number; pierce: number; life: number; hits: number[]; dead: boolean; evo: boolean }
export interface Goo { x: number; z: number; vx: number; vz: number; life: number; dmg: number; dead: boolean; big: boolean }
export interface Fire { x: number; z: number; r: number; t: number; max: number; dps: number; tick: number; evo: boolean }
export interface Torch { x0: number; z0: number; x1: number; z1: number; t: number; T: number; r: number; dps: number; burn: number; evo: boolean }
export type PickupKind = 'gem' | 'coin' | 'heal' | 'magnet' | 'chest';
export interface Pickup { kind: PickupKind; x: number; z: number; value: number; fly: boolean; v: number; dead: boolean; t: number }

export interface Offer { id: number; cards: Card[]; from: 'level' | 'chest'; n: number }

export interface Player {
  x: number; z: number; vx: number; vz: number;
  face: number;
  hp: number; maxHp: number;
  /** Damage flash / i-frames (s left). */
  hurt: number;
  inv: number;
  alive: boolean;
  moving: boolean;
}

export interface Stats {
  speed: number; maxHp: number; regen: number; magnet: number; armor: number; cdK: number; areaK: number; luck: number;
  dmgK: number; crit: number;
}

export type SimEvent =
  | { type: 'hit'; x: number; z: number; dmg: number; crit: boolean; boss: boolean }
  | { type: 'kill'; z: Zombie; by: WeaponId | 'blast' | 'dawn' | 'fire' }
  | { type: 'swing'; x: number; z: number; ang: number; arc: number; r: number; evo: boolean; n: number }
  | { type: 'thrust'; x: number; z: number; ang: number; len: number; evo: boolean }
  | { type: 'chain'; pts: { x: number; z: number }[] }
  | { type: 'fire'; w: WeaponId; x: number; z: number; ang: number }
  | { type: 'torch'; t: Torch }
  | { type: 'ignite'; x: number; z: number; r: number }
  | { type: 'ward'; x: number; z: number }
  | { type: 'hurt'; dmg: number; x: number; z: number; by: ZombieKind | 'goo' | 'blast' }
  | { type: 'gem'; value: number }
  | { type: 'coin' }
  | { type: 'heal'; n: number }
  | { type: 'magnet' }
  | { type: 'chest'; x: number; z: number }
  | { type: 'level'; n: number }
  | { type: 'offer'; offer: Offer }
  | { type: 'card'; card: Card }
  | { type: 'explode'; x: number; z: number; r: number }
  | { type: 'fuse'; z: Zombie }
  | { type: 'spit'; x: number; z: number; boss: boolean }
  | { type: 'gooHit'; x: number; z: number }
  | { type: 'warn'; boss: BossKind }
  | { type: 'boss'; z: Zombie }
  | { type: 'telegraph'; z: Zombie; kind: 'charge' | 'slam'; x: number; z2: number; r: number; ang: number; t: number }
  | { type: 'slam'; x: number; z: number; r: number }
  | { type: 'bossDead'; z: Zombie }
  | { type: 'rush' }
  | { type: 'rage'; z: Zombie }
  | { type: 'dawn' }
  | { type: 'won' }
  | { type: 'revive'; x: number; z: number }
  | { type: 'death'; x: number; z: number };

export interface RunStats { kills: number; bosses: number; minis: number; coins: number; time: number; damage: number; killer: ZombieKind | 'goo' | 'blast' | null; byWeapon: Partial<Record<WeaponId, number>> }

const GRID = 2 * ARENA; // flow field cells (1 unit)
const HASH = 2; // spatial hash cell size
const HN = Math.ceil((2 * ARENA) / HASH);
const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];

export class Sim {
  readonly mode: Mode;
  readonly tune: Tuning;
  readonly rnd: () => number;
  readonly meta: MetaFx;
  time = 0;
  phase: 'night' | 'dawn' | 'won' | 'dead' = 'night';
  /** Seconds since the dawn or the death. */
  phaseT = 0;
  player: Player;
  stats!: Stats;
  zombies: Zombie[] = [];
  corpses: Corpse[] = [];
  shots: Shot[] = [];
  goo: Goo[] = [];
  fires: Fire[] = [];
  torches: Torch[] = [];
  pickups: Pickup[] = [];
  /** The robot helper (when owned). */
  robot = { x: 0, z: 0, face: 0, fire: 0, on: false };
  weapons: OwnedWeapon[] = [];
  passives: OwnedPassive[] = [];
  /** Weapon timers by id. */
  private wcd: Partial<Record<WeaponId, number>> = {};
  /** The wards' spin. */
  wardAng = 0;
  level = 1;
  xp = 0;
  offers: Offer[] = [];
  rerolls = 2;
  revives = 0;
  score = 0;
  coins = 0;
  run: RunStats = { kills: 0, bosses: 0, minis: 0, coins: 0, time: 0, damage: 0, killer: null, byWeapon: {} };
  events: SimEvent[] = [];
  boss: Zombie | null = null;
  over = false;
  won = false;
  /** Test hook: nothing hurts the survivor (the store art's staged fight). */
  god = false;
  private nextId = 1;
  private offerId = 0;
  private spawnAcc = 0;
  private swarmT = 125;
  private rushT: number;
  private minisDone = 0;
  private kingDone = false;
  private warned = new Set<string>();
  private scoreAcc = 0;
  private regenAcc = 0;
  // flow field and hashes
  private blocked = new Uint8Array(GRID * GRID);
  private dist = new Int16Array(GRID * GRID);
  private queue = new Int32Array(GRID * GRID);
  private flowT = 0;
  private flowCell = -1;
  private head = new Int32Array(HN * HN);
  private next = new Int32Array(1024);
  private colHash: number[][] = [];
  readonly colliders: Collider[];

  constructor(mode: Mode, seed: number, meta: MetaFx = NO_META) {
    this.mode = mode;
    this.tune = TUNING[mode];
    this.rnd = seeded(seed);
    this.meta = meta;
    this.rushT = 100;
    const a = arena();
    this.colliders = a.colliders;
    this.buildStatic();
    const hero = HEROES[meta.hero];
    this.player = { x: a.start.x, z: a.start.z, vx: 0, vz: 0, face: 0, hp: 1, maxHp: 1, hurt: 0, inv: 0, alive: true, moving: false };
    this.rerolls = 2 + meta.rerolls;
    this.revives = meta.revives;
    this.weapons.push({ id: hero.start, lv: 1, evo: false });
    this.recalc();
    this.player.hp = this.player.maxHp;
    this.robot.x = this.player.x - 1; this.robot.z = this.player.z + 1;
  }

  // ------------------------------------------------------------------ stats

  private plv(id: PassiveId): number { return this.passives.find((p) => p.id === id)?.lv ?? 0; }
  weapon(id: WeaponId): OwnedWeapon | undefined { return this.weapons.find((w) => w.id === id); }
  get bag(): Bag { return { weapons: this.weapons, passives: this.passives, allowed: this.meta.weapons }; }

  recalc(): void {
    const hero = HEROES[this.meta.hero];
    const p = this.player;
    const maxHp = this.tune.hp + this.meta.hp + hero.hp + PASSIVE_STEP.vigor * this.plv('vigor');
    if (p.maxHp > 1) p.hp += Math.max(0, maxHp - p.maxHp);
    p.maxHp = maxHp;
    p.hp = Math.min(p.hp, maxHp);
    const luck = PASSIVE_STEP.luck * this.plv('luck');
    this.stats = {
      speed: PLAYER_SPEED * (1 + PASSIVE_STEP.swift * this.plv('swift') + hero.speed) * this.meta.speedK,
      maxHp,
      regen: PASSIVE_STEP.regen * this.plv('regen'),
      magnet: this.tune.magnet * (1 + PASSIVE_STEP.magnet * this.plv('magnet')) * this.meta.magnetK,
      armor: PASSIVE_STEP.armor * this.plv('armor') + hero.armor,
      cdK: Math.pow(1 - PASSIVE_STEP.haste, this.plv('haste')),
      areaK: 1 + PASSIVE_STEP.reach * this.plv('reach'),
      luck,
      dmgK: this.meta.dmgK,
      crit: 0.05 + luck * 0.6,
    };
    this.robot.on = !!this.weapon('robot');
  }

  ws(id: WeaponId): WeaponStats {
    const w = this.weapon(id)!;
    return weaponStats(id, w.lv, w.evo);
  }

  // ------------------------------------------------------------------ static world

  private buildStatic(): void {
    const half = ARENA;
    for (let gz = 0; gz < GRID; gz++) {
      for (let gx = 0; gx < GRID; gx++) {
        const x = gx - half + 0.5, z = gz - half + 0.5;
        let b = Math.abs(x) > PLAY_EDGE + 2 || Math.abs(z) > PLAY_EDGE + 2 ? 1 : 0;
        if (!b) for (const c of this.colliders) if ((c.x - x) ** 2 + (c.z - z) ** 2 < (c.r + 0.2) ** 2) { b = 1; break; }
        this.blocked[gz * GRID + gx] = b;
      }
    }
    this.colHash = Array.from({ length: HN * HN }, () => []);
    this.colliders.forEach((c, i) => {
      const x0 = this.hc(c.x - c.r - 0.6), x1 = this.hc(c.x + c.r + 0.6), z0 = this.hc(c.z - c.r - 0.6), z1 = this.hc(c.z + c.r + 0.6);
      for (let hz = z0; hz <= z1; hz++) for (let hx = x0; hx <= x1; hx++) this.colHash[hz * HN + hx].push(i);
    });
  }

  private hc(v: number): number { return Math.max(0, Math.min(HN - 1, Math.floor((v + ARENA) / HASH))); }
  private cell(x: number, z: number): number {
    const gx = Math.max(0, Math.min(GRID - 1, Math.floor(x + ARENA))), gz = Math.max(0, Math.min(GRID - 1, Math.floor(z + ARENA)));
    return gz * GRID + gx;
  }

  /** Pushes a circle out of the trees and rocks. */
  private collide(o: { x: number; z: number }, r: number): void {
    const list = this.colHash[this.hc(o.z) * HN + this.hc(o.x)];
    for (const i of list) {
      const c = this.colliders[i];
      const dx = o.x - c.x, dz = o.z - c.z, d2 = dx * dx + dz * dz, rr = c.r + r;
      if (d2 < rr * rr) {
        const d = Math.sqrt(d2) || 0.001;
        o.x = c.x + (dx / d) * rr;
        o.z = c.z + (dz / d) * rr;
      }
    }
  }

  isFree(x: number, z: number, r: number): boolean {
    if (Math.abs(x) > PLAY_EDGE || Math.abs(z) > PLAY_EDGE) return false;
    for (const i of this.colHash[this.hc(z) * HN + this.hc(x)]) {
      const c = this.colliders[i];
      if ((c.x - x) ** 2 + (c.z - z) ** 2 < (c.r + r) ** 2) return false;
    }
    return true;
  }

  /** Breadth-first distances from the survivor's cell over the open cells. */
  private flow(): void {
    const start = this.cell(this.player.x, this.player.z);
    this.flowCell = start;
    this.dist.fill(-1);
    let qh = 0, qt = 0;
    this.dist[start] = 0;
    this.queue[qt++] = start;
    while (qh < qt) {
      const c = this.queue[qh++];
      const cx = c % GRID, cz = (c / GRID) | 0, d = this.dist[c] + 1;
      for (let k = 0; k < 4; k++) {
        const nx = cx + DIRS[k][0], nz = cz + DIRS[k][1];
        if (nx < 0 || nz < 0 || nx >= GRID || nz >= GRID) continue;
        const n = nz * GRID + nx;
        if (this.dist[n] >= 0 || this.blocked[n]) continue;
        this.dist[n] = d;
        this.queue[qt++] = n;
      }
    }
  }

  /** The way to the survivor from (x, z): a unit vector. */
  private steer(x: number, z: number, out: { x: number; z: number }): void {
    const p = this.player;
    const dx = p.x - x, dz = p.z - z, d = Math.hypot(dx, dz) || 1;
    if (d < 3.2) { out.x = dx / d; out.z = dz / d; return; }
    const c = this.cell(x, z);
    const here = this.dist[c];
    if (here < 0) { out.x = dx / d; out.z = dz / d; return; }
    const cx = c % GRID, cz = (c / GRID) | 0;
    let best = here, bx = 0, bz = 0;
    for (let k = 0; k < 8; k++) {
      const nx = cx + DIRS[k][0], nz = cz + DIRS[k][1];
      if (nx < 0 || nz < 0 || nx >= GRID || nz >= GRID) continue;
      const v = this.dist[nz * GRID + nx];
      if (v < 0) continue;
      // diagonals only when both sides are open (no corner cutting)
      if (k >= 4 && (this.dist[cz * GRID + nx] < 0 || this.dist[nz * GRID + cx] < 0)) continue;
      const vv = v - (k >= 4 ? 0.4 : 0);
      if (vv < best) { best = vv; bx = DIRS[k][0]; bz = DIRS[k][1]; }
    }
    if (bx === 0 && bz === 0) { out.x = dx / d; out.z = dz / d; return; }
    // aim at the next cell's centre, blended with the straight line so the crowd flows
    const tx = cx + bx - ARENA + 0.5 - x, tz = cz + bz - ARENA + 0.5 - z;
    const tl = Math.hypot(tx, tz) || 1;
    out.x = tx / tl * 0.8 + dx / d * 0.2;
    out.z = tz / tl * 0.8 + dz / d * 0.2;
    const ol = Math.hypot(out.x, out.z) || 1;
    out.x /= ol; out.z /= ol;
  }

  private rebuildHash(): void {
    this.head.fill(-1);
    if (this.next.length < this.zombies.length) this.next = new Int32Array(this.zombies.length * 2);
    for (let i = 0; i < this.zombies.length; i++) {
      const z = this.zombies[i];
      const h = this.hc(z.z) * HN + this.hc(z.x);
      this.next[i] = this.head[h];
      this.head[h] = i;
    }
  }

  /** Calls fn for every zombie whose cell is within `r` of (x, z). */
  private near(x: number, z: number, r: number, fn: (zb: Zombie, i: number) => void): void {
    const x0 = this.hc(x - r), x1 = this.hc(x + r), z0 = this.hc(z - r), z1 = this.hc(z + r);
    for (let hz = z0; hz <= z1; hz++) {
      for (let hx = x0; hx <= x1; hx++) {
        for (let i = this.head[hz * HN + hx]; i >= 0; i = this.next[i]) fn(this.zombies[i], i);
      }
    }
  }

  /** The nearest living zombie within `r` (and not in `skip`). */
  nearest(x: number, z: number, r: number, skip?: Set<number>): Zombie | null {
    let best: Zombie | null = null, bd = r * r;
    this.near(x, z, r, (zb) => {
      if (zb.dead || skip?.has(zb.id)) return;
      const d = (zb.x - x) ** 2 + (zb.z - z) ** 2;
      if (d < bd) { bd = d; best = zb; }
    });
    return best;
  }

  // ------------------------------------------------------------------ the step

  step(dt: number, input: Input): void {
    if (this.over) return;
    this.time += dt;
    this.phaseT += dt;
    const p = this.player;
    if (this.phase === 'night') this.run.time = this.time;
    this.rebuildHash();
    if (p.alive) this.movePlayer(dt, input);
    this.flowT -= dt;
    if (this.flowT <= 0 || this.cell(p.x, p.z) !== this.flowCell) { this.flow(); this.flowT = 0.3; }
    if (this.phase === 'night') {
      this.direct(dt);
      if (this.time >= this.tune.night) this.startDawn();
    }
    this.moveZombies(dt);
    this.rebuildHash();
    if (p.alive && this.phase === 'night') this.fireWeapons(dt);
    this.moveShots(dt);
    this.moveGoo(dt);
    this.burnFires(dt);
    this.movePickups(dt);
    for (const c of this.corpses) c.t += dt;
    if (this.corpses.length && this.corpses[0].t > 1.2) this.corpses = this.corpses.filter((c) => c.t <= 1.2);
    if (this.corpses.length > 160) this.corpses.splice(0, this.corpses.length - 160);
    if (this.phase === 'dawn') this.dawn(dt);
    if (this.phase === 'dead' && this.phaseT > 2.4) this.over = true;
    if (this.phase === 'won' && this.phaseT > 3.2) this.over = true;
    this.compact();
  }

  private movePlayer(dt: number, input: Input): void {
    const p = this.player;
    let mx = input.mx, mz = input.mz;
    const l = Math.hypot(mx, mz);
    if (l > 1) { mx /= l; mz /= l; }
    p.moving = l > 0.1;
    const sp = this.stats.speed;
    // a quick ease so the hero starts and stops crisply
    const k = Math.min(1, dt * 14);
    p.vx += (mx * sp - p.vx) * k;
    p.vz += (mz * sp - p.vz) * k;
    p.x += p.vx * dt;
    p.z += p.vz * dt;
    if (p.moving) p.face = Math.atan2(mx, mz);
    p.x = Math.max(-PLAY_EDGE, Math.min(PLAY_EDGE, p.x));
    p.z = Math.max(-PLAY_EDGE, Math.min(PLAY_EDGE, p.z));
    this.collide(p, PLAYER_R);
    p.hurt = Math.max(0, p.hurt - dt);
    p.inv = Math.max(0, p.inv - dt);
    if (this.stats.regen > 0 && p.hp < p.maxHp) {
      this.regenAcc += this.stats.regen * dt;
      if (this.regenAcc >= 1) { p.hp = Math.min(p.maxHp, p.hp + Math.floor(this.regenAcc)); this.regenAcc %= 1; }
    }
    // the score ticks with every second survived
    this.scoreAcc += dt * 2;
    if (this.scoreAcc >= 1) { this.score += Math.floor(this.scoreAcc); this.scoreAcc %= 1; }
    // the robot trails behind
    if (this.robot.on) {
      const r = this.robot;
      const tx = p.x - Math.sin(p.face) * 1.3 + Math.cos(p.face) * 0.9, tz = p.z - Math.cos(p.face) * 1.3 - Math.sin(p.face) * 0.9;
      const dx = tx - r.x, dz = tz - r.z, d = Math.hypot(dx, dz);
      if (d > 0.15) {
        const v = Math.min(d * 4, this.stats.speed * 1.3);
        r.x += (dx / d) * v * dt; r.z += (dz / d) * v * dt;
        r.face = Math.atan2(dx, dz);
      }
      this.collide(r, 0.25);
    }
  }

  // ------------------------------------------------------------------ the director

  /** Seconds into the night (the roster and zombie health follow it; Easy's night ends earlier). */
  get storyT(): number { return this.time; }

  private direct(dt: number): void {
    const f = Math.min(1, this.time / this.tune.night);
    const tn = this.storyT;
    const cap = Math.round(this.tune.capStart + (this.tune.capEnd - this.tune.capStart) * Math.pow(f, 0.85) * (f > 0.9 ? 1.12 : 1));
    const rate = this.tune.rateStart + (this.tune.rateEnd - this.tune.rateStart) * Math.pow(f, 1.3);
    this.spawnAcc += rate * dt;
    const live = this.zombies.length;
    while (this.spawnAcc >= 1) {
      this.spawnAcc -= 1;
      if (this.zombies.length >= cap) { this.spawnAcc = Math.min(this.spawnAcc, 2); break; }
      this.spawnOne(this.pickKind(tn));
    }
    void live;
    // swarm packs
    if (tn >= this.swarmT) {
      this.swarmT = tn + 22 - Math.min(10, f * 12);
      const n = 9 + Math.floor(f * 14);
      const at = this.spawnPoint();
      if (at) for (let i = 0; i < n; i++) this.spawn('swarm', at.x + (this.rnd() - 0.5) * 3, at.z + (this.rnd() - 0.5) * 3);
    }
    // horde rushes: a ring of runners and swarmers all round
    if (tn >= this.rushT && tn < this.tune.night - 10) {
      this.rushT = tn + this.tune.rushEvery;
      const n = Math.round(18 + f * 34);
      const p = this.player;
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2 + this.rnd() * 0.1;
        const d = 13.5 + this.rnd() * 2;
        let x = p.x + Math.sin(a) * d, z = p.z + Math.cos(a) * d;
        x = Math.max(-PLAY_EDGE, Math.min(PLAY_EDGE, x)); z = Math.max(-PLAY_EDGE, Math.min(PLAY_EDGE, z));
        if (!this.isFree(x, z, 0.3)) continue;
        this.spawn(f > 0.35 && i % 2 ? 'runner' : 'swarm', x, z).born = 1;
      }
      this.events.push({ type: 'rush' });
    }
    // mini-bosses and the Rot King, each announced a few seconds early
    if (this.minisDone < MINIS.length) {
      const kind = MINIS[this.minisDone], t0 = this.tune.minis[this.minisDone];
      if (this.time >= t0 - 4 && !this.warned.has(kind)) { this.warned.add(kind); this.events.push({ type: 'warn', boss: kind }); }
      if (this.time >= t0) { this.minisDone++; this.spawnBoss(kind); }
    }
    if (!this.kingDone) {
      const t0 = this.tune.king;
      if (this.time >= t0 - 5 && !this.warned.has('king')) { this.warned.add('king'); this.events.push({ type: 'warn', boss: 'king' }); }
      if (this.time >= t0) { this.kingDone = true; this.spawnBoss('king'); }
    }
  }

  private pickKind(tn: number): ZombieKind {
    const kinds: ZombieKind[] = ['shambler', 'runner', 'spitter', 'exploder', 'tank'];
    const ok = kinds.filter((k) => tn >= ZOMBIES[k].from);
    const w = ok.map((k) => ZOMBIES[k].w * (k === 'runner' ? 1 + tn / 400 : k === 'tank' ? 1 + tn / 500 : 1));
    let x = this.rnd() * w.reduce((s, v) => s + v, 0);
    for (let i = 0; i < ok.length; i++) { x -= w[i]; if (x <= 0) return ok[i]; }
    return 'shambler';
  }

  /** A spot just outside the view, in the open; biased ahead of where the survivor is going. */
  private spawnPoint(): { x: number; z: number } | null {
    const p = this.player;
    const sp = Math.hypot(p.vx, p.vz);
    for (let tries = 0; tries < 14; tries++) {
      let a = this.rnd() * Math.PI * 2;
      if (sp > 1 && this.rnd() < 0.45) a = Math.atan2(p.vx, p.vz) + (this.rnd() - 0.5) * 1.6;
      const d = SPAWN_R[0] + this.rnd() * (SPAWN_R[1] - SPAWN_R[0]);
      const x = p.x + Math.sin(a) * d, z = p.z + Math.cos(a) * d;
      if (this.isFree(x, z, 0.5) && this.dist[this.cell(x, z)] >= 0) return { x, z };
    }
    return null;
  }

  private spawnOne(kind: ZombieKind): void {
    const at = this.spawnPoint();
    if (at) this.spawn(kind, at.x, at.z);
  }

  private hpScale(): number { return this.tune.hpK * (1 + this.tune.hpPerMin * (this.storyT / 60)); }

  spawn(kind: ZombieKind, x: number, z: number): Zombie {
    const d = ZOMBIES[kind];
    const boss = isBoss(kind);
    const hp = boss ? d.hp * this.tune.bossK * (1 + (this.storyT / 600) * 0.4) : d.hp * this.hpScale();
    const vary = this.rnd();
    const zb: Zombie = {
      id: this.nextId++, kind, x, z, kx: 0, kz: 0, hp, maxHp: hp,
      speed: d.speed * this.tune.speedK * (1 + Math.min(0.25, this.storyT / 2400)) * (boss ? 1 : 0.9 + vary * 0.2),
      r: d.r * (boss ? 1 : 0.92 + vary * 0.16), dmg: d.dmg * this.tune.dmgK, bite: 0, flash: 0, face: 0, anim: this.rnd() * 10, vary,
      atk: 0, burn: 0, burnDps: 0, fuse: -1, cd: kind === 'spitter' ? 1 + this.rnd() * SPIT_CD : 2.5, ward: 0,
      act: 'walk', actT: 0, ax: 0, az: 0, rage: false, dead: false, born: 0,
    };
    this.zombies.push(zb);
    return zb;
  }

  private spawnBoss(kind: BossKind): void {
    const p = this.player;
    let at: { x: number; z: number } | null = null;
    for (let i = 0; i < 20 && !at; i++) {
      const a = this.rnd() * Math.PI * 2, d = 11 + this.rnd() * 2;
      const x = p.x + Math.sin(a) * d, z = p.z + Math.cos(a) * d;
      if (this.isFree(x, z, 1.2) && this.dist[this.cell(x, z)] >= 0) at = { x, z };
    }
    at ??= this.spawnPoint() ?? { x: p.x, z: p.z - 12 };
    const zb = this.spawn(kind, at.x, at.z);
    zb.cd = 3;
    this.boss = zb;
    this.events.push({ type: 'boss', z: zb });
  }

  // ------------------------------------------------------------------ zombies

  private tmp = { x: 0, z: 0 };

  private moveZombies(dt: number): void {
    const p = this.player;
    const zs = this.zombies;
    for (let i = 0; i < zs.length; i++) {
      const zb = zs[i];
      if (zb.dead) continue;
      zb.flash = Math.max(0, zb.flash - dt);
      zb.atk = Math.max(0, zb.atk - dt);
      zb.bite = Math.max(0, zb.bite - dt);
      zb.ward = Math.max(0, zb.ward - dt);
      zb.born = Math.max(0, zb.born - dt);
      if (zb.burn > 0) {
        zb.burn -= dt;
        this.damage(zb, zb.burnDps * dt, 0, 0, 0, 'torch', false, true);
        if (zb.dead) continue;
      }
      const boss = isBoss(zb.kind);
      let sp = zb.speed;
      this.steer(zb.x, zb.z, this.tmp);
      let dx = this.tmp.x, dz = this.tmp.z;
      const px = p.x - zb.x, pz = p.z - zb.z, pd = Math.hypot(px, pz);
      if (!p.alive) { dx = -px / (pd || 1); dz = -pz / (pd || 1); sp *= 0.3; }
      if (zb.kind === 'spitter' && p.alive) {
        // keep a distance, lob goo
        if (pd < SPIT_RANGE - 1) { dx = -dx; dz = -dz; sp *= 0.7; } else if (pd < SPIT_RANGE + 1) sp *= 0.15;
        zb.cd -= dt;
        if (zb.cd <= 0 && pd < SPIT_RANGE + 3) { zb.cd = SPIT_CD * (0.85 + this.rnd() * 0.3); this.spit(zb, Math.atan2(px, pz), false); zb.atk = 0.4; }
      }
      if (zb.kind === 'exploder' && p.alive) {
        if (zb.fuse < 0 && pd < FUSE_R + zb.r) { zb.fuse = FUSE; this.events.push({ type: 'fuse', z: zb }); }
        if (zb.fuse >= 0) {
          sp *= 0.35;
          zb.fuse -= dt;
          if (zb.fuse <= 0) { this.kill(zb, 'blast'); continue; }
        }
      }
      if (boss && p.alive) {
        const r = this.bossAct(zb, dt, pd, px, pz);
        if (r) { dx = r.dx; dz = r.dz; sp = r.sp; }
      }
      if (this.phase === 'dawn') sp *= 0.4;
      zb.x += dx * sp * dt + zb.kx * dt;
      zb.z += dz * sp * dt + zb.kz * dt;
      const damp = Math.exp(-dt * 7);
      zb.kx *= damp; zb.kz *= damp;
      if (sp > 0.05) {
        const want = Math.atan2(dx, dz);
        let da = want - zb.face;
        da = Math.atan2(Math.sin(da), Math.cos(da));
        zb.face += da * Math.min(1, dt * (boss ? 4 : 8));
      }
      zb.anim += dt * (sp / 1.3);
      // keep apart
      this.near(zb.x, zb.z, zb.r + 0.6, (o, j) => {
        if (j <= i || o.dead) return;
        const ox = zb.x - o.x, oz = zb.z - o.z, rr = zb.r + o.r;
        const d2 = ox * ox + oz * oz;
        if (d2 >= rr * rr || d2 < 1e-6) return;
        const d = Math.sqrt(d2), push = (rr - d) * 0.5;
        const wa = isBoss(o.kind) ? 1 : isBoss(zb.kind) ? 0 : 0.5, wb = 1 - wa;
        zb.x += (ox / d) * push * wa * 2; zb.z += (oz / d) * push * wa * 2;
        o.x -= (ox / d) * push * wb * 2; o.z -= (oz / d) * push * wb * 2;
      });
      this.collide(zb, zb.r * (boss ? 0.6 : 0.9));
      zb.x = Math.max(-ARENA + 2, Math.min(ARENA - 2, zb.x));
      zb.z = Math.max(-ARENA + 2, Math.min(ARENA - 2, zb.z));
      // bites
      if (p.alive && this.phase === 'night') {
        const qx = p.x - zb.x, qz = p.z - zb.z, rr = PLAYER_R + zb.r + 0.08;
        if (qx * qx + qz * qz < rr * rr) {
          // the survivor is pushed out a little (the crowd closes in, never through)
          const d = Math.hypot(qx, qz) || 1;
          if (!boss) { p.x += (qx / d) * (rr - d) * 0.35; p.z += (qz / d) * (rr - d) * 0.35; }
          if (zb.bite <= 0) {
            // bosses bite slower; a charge hits once, hard
            const charging = zb.act === 'charge';
            zb.bite = boss ? (charging ? 1.2 : BITE_CD * 1.8) : BITE_CD;
            zb.atk = 0.45;
            this.hurt(zb.dmg * (charging ? 1.25 : boss ? 0.8 : 1), zb.kind, zb.x, zb.z);
            if (charging) zb.actT = Math.min(zb.actT, 0.15);
          }
        }
      }
      // far behind: walk them back in ahead of the survivor
      if (!boss && pd > 30 && this.phase === 'night') {
        const at = this.spawnPoint();
        if (at) { zb.x = at.x; zb.z = at.z; zb.kx = zb.kz = 0; }
      }
    }
  }

  /** A boss's moves; returns how it walks this frame (or null to chase). */
  private bossAct(zb: Zombie, dt: number, pd: number, px: number, pz: number): { dx: number; dz: number; sp: number } | null {
    const p = this.player;
    const king = zb.kind === 'king';
    if (king && !zb.rage && zb.hp < zb.maxHp * 0.5) { zb.rage = true; this.events.push({ type: 'rage', z: zb }); }
    const pace = zb.rage ? 0.7 : 1;
    if (zb.act !== 'walk') {
      zb.actT -= dt;
      switch (zb.act) {
        case 'windup':
          if (zb.actT <= 0) { zb.act = 'charge'; zb.actT = 0.85; }
          return { dx: zb.ax, dz: zb.az, sp: 0 };
        case 'charge':
          if (zb.actT <= 0) { zb.act = 'walk'; zb.cd = (3.2 + this.rnd() * 1.5) * pace; }
          return { dx: zb.ax, dz: zb.az, sp: 10.5 };
        case 'slam':
          if (zb.actT <= 0) {
            const r = king ? 4.4 : 3.6;
            this.events.push({ type: 'slam', x: zb.x, z: zb.z, r });
            if (pd < r + PLAYER_R) this.hurt(zb.dmg * 1.4, zb.kind, zb.x, zb.z);
            this.near(zb.x, zb.z, r, (o) => { if (o !== zb) { const d = Math.hypot(o.x - zb.x, o.z - zb.z) || 1; o.kx += (o.x - zb.x) / d * 6; o.kz += (o.z - zb.z) / d * 6; } });
            zb.act = 'walk'; zb.cd = (3 + this.rnd()) * pace;
          }
          return { dx: 0, dz: 0, sp: 0 };
        case 'spray':
          zb.ax += dt;
          if (zb.ax > 0.1) { zb.ax = 0; zb.az += 0.62; this.spit(zb, zb.az, true); if (zb.rage) this.spit(zb, zb.az + Math.PI, true); }
          if (zb.actT <= 0) { zb.act = 'walk'; zb.cd = (2.6 + this.rnd()) * pace; }
          return { dx: 0, dz: 0, sp: 0 };
        case 'summon':
        case 'spit':
          if (zb.actT <= 0) { zb.act = 'walk'; zb.cd = (3 + this.rnd()) * pace; }
          return { dx: 0, dz: 0, sp: 0 };
        default:
          return null;
      }
    }
    zb.cd -= dt;
    if (zb.cd > 0) return null;
    const ang = Math.atan2(px, pz);
    const roll = this.rnd();
    const charge = () => {
      zb.act = 'windup'; zb.actT = 0.9 * (zb.rage ? 0.75 : 1);
      zb.ax = px / (pd || 1); zb.az = pz / (pd || 1); zb.face = ang;
      this.events.push({ type: 'telegraph', z: zb, kind: 'charge', x: zb.x, z2: zb.z, r: 9.5, ang, t: zb.actT });
    };
    const slam = () => {
      zb.act = 'slam'; zb.actT = 1.05 * (zb.rage ? 0.8 : 1);
      this.events.push({ type: 'telegraph', z: zb, kind: 'slam', x: zb.x, z2: zb.z, r: king ? 4.4 : 3.6, ang, t: zb.actT });
    };
    const ring = (n: number) => {
      for (let i = 0; i < n; i++) this.spit(zb, ang + (i / n) * Math.PI * 2, true);
      zb.act = 'spit'; zb.actT = 0.6;
    };
    const summon = (kind: ZombieKind, n: number) => {
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2;
        const x = zb.x + Math.sin(a) * 2.2, z = zb.z + Math.cos(a) * 2.2;
        if (this.isFree(x, z, 0.3)) this.spawn(kind, x, z).born = 0.6;
      }
      zb.act = 'summon'; zb.actT = 0.9;
      this.events.push({ type: 'spit', x: zb.x, z: zb.z, boss: true });
    };
    switch (zb.kind) {
      case 'brute':
        if (pd < 10) charge(); else zb.cd = 0.5;
        break;
      case 'matron':
        if (roll < 0.6) ring(10); else summon('swarm', 8);
        break;
      case 'knight':
        if (pd < 4.5) slam(); else if (pd < 10) charge(); else zb.cd = 0.5;
        break;
      case 'king':
        if (pd < 5 && roll < 0.45) slam();
        else if (roll < 0.62) { zb.act = 'spray'; zb.actT = 1.7; zb.ax = 0; zb.az = ang; }
        else if (roll < 0.8) summon(zb.rage ? 'runner' : 'shambler', zb.rage ? 10 : 8);
        else if (pd < 11) charge(); else zb.cd = 0.5;
        break;
      default:
        break;
    }
    return null;
  }

  private spit(zb: Zombie, ang: number, big: boolean): void {
    const sp = GOO_SPEED * (big ? 0.85 : 1);
    this.goo.push({ x: zb.x + Math.sin(ang) * zb.r, z: zb.z + Math.cos(ang) * zb.r, vx: Math.sin(ang) * sp, vz: Math.cos(ang) * sp, life: big ? 4 : 2.6, dmg: GOO_DMG * this.tune.dmgK * (big ? 1.4 : 1), dead: false, big });
    if (!big) this.events.push({ type: 'spit', x: zb.x, z: zb.z, boss: false });
  }

  private moveGoo(dt: number): void {
    const p = this.player;
    const wards = this.weapon('wards');
    for (const g of this.goo) {
      if (g.dead) continue;
      g.x += g.vx * dt; g.z += g.vz * dt; g.life -= dt;
      if (g.life <= 0 || !this.isFreeLoose(g.x, g.z)) { g.dead = true; this.events.push({ type: 'gooHit', x: g.x, z: g.z }); continue; }
      // the evolved wards stop goo
      if (wards?.evo && this.phase === 'night') {
        const st = this.ws('wards');
        for (let k = 0; k < st.n; k++) {
          const a = this.wardAng + (k / st.n) * Math.PI * 2;
          const sx = p.x + Math.sin(a) * st.size * this.stats.areaK, sz = p.z + Math.cos(a) * st.size * this.stats.areaK;
          if ((g.x - sx) ** 2 + (g.z - sz) ** 2 < 0.5) { g.dead = true; this.events.push({ type: 'ward', x: sx, z: sz }); break; }
        }
        if (g.dead) continue;
      }
      if (p.alive && this.phase === 'night' && (g.x - p.x) ** 2 + (g.z - p.z) ** 2 < (PLAYER_R + (g.big ? 0.32 : 0.22)) ** 2) {
        g.dead = true;
        this.hurt(g.dmg, 'goo', g.x, g.z);
        this.events.push({ type: 'gooHit', x: g.x, z: g.z });
      }
    }
  }

  /** Projectiles pass over low things: only tall trees and rocks stop them. */
  private isFreeLoose(x: number, z: number): boolean {
    if (Math.abs(x) > ARENA - 2 || Math.abs(z) > ARENA - 2) return false;
    for (const i of this.colHash[this.hc(z) * HN + this.hc(x)]) {
      const c = this.colliders[i];
      if (c.r > 0.5 && (c.x - x) ** 2 + (c.z - z) ** 2 < (c.r * 0.8) ** 2) return false;
    }
    return true;
  }

  private hurt(dmg: number, by: ZombieKind | 'goo' | 'blast', x: number, z: number): void {
    const p = this.player;
    if (!p.alive || p.inv > 0 || this.god || this.phase !== 'night') return;
    const d = Math.max(1, dmg - this.stats.armor);
    p.hp -= d;
    p.hurt = 0.25;
    this.run.damage += d;
    this.events.push({ type: 'hurt', dmg: d, x, z, by });
    if (p.hp <= 0) {
      if (this.revives > 0) {
        this.revives--;
        p.hp = p.maxHp * 0.5;
        p.inv = 2.5;
        this.blast(p.x, p.z, 5, 200, false);
        this.events.push({ type: 'revive', x: p.x, z: p.z });
        return;
      }
      p.hp = 0;
      p.alive = false;
      this.run.killer = by;
      this.phase = 'dead';
      this.phaseT = 0;
      this.events.push({ type: 'death', x: p.x, z: p.z });
    }
  }

  // ------------------------------------------------------------------ damage

  /** Hits a zombie. Returns the damage dealt. */
  damage(zb: Zombie, base: number, fx: number, fz: number, knock: number, by: WeaponId | 'blast', canCrit = true, dot = false): number {
    if (zb.dead) return 0;
    let dmg = base * this.stats.dmgK;
    const crit = canCrit && this.rnd() < this.stats.crit;
    if (crit) dmg *= 2;
    zb.hp -= dmg;
    if (by !== 'blast') this.run.byWeapon[by] = (this.run.byWeapon[by] ?? 0) + dmg;
    if (!dot) {
      zb.flash = 0.12;
      const heavy = ZOMBIES[zb.kind].heavy;
      if (knock > 0 && heavy < 1) {
        const l = Math.hypot(fx, fz) || 1;
        zb.kx += (fx / l) * knock * (1 - heavy) * 3.2;
        zb.kz += (fz / l) * knock * (1 - heavy) * 3.2;
      }
      this.events.push({ type: 'hit', x: zb.x, z: zb.z, dmg, crit, boss: isBoss(zb.kind) });
    }
    if (zb.hp <= 0) this.kill(zb, dot ? 'fire' : by);
    return dmg;
  }

  private kill(zb: Zombie, by: WeaponId | 'blast' | 'dawn' | 'fire'): void {
    if (zb.dead) return;
    zb.dead = true;
    zb.hp = 0;
    const def = ZOMBIES[zb.kind];
    const boss = isBoss(zb.kind);
    this.corpses.push({ kind: zb.kind, x: zb.x, z: zb.z, face: zb.face, vary: zb.vary, t: 0, burnt: by === 'dawn' || by === 'fire' || zb.burn > 0, scale: 1 });
    this.events.push({ type: 'kill', z: zb, by });
    if (by === 'dawn') return;
    this.run.kills++;
    this.score += def.score;
    if (zb.kind === 'exploder') this.blast(zb.x, zb.z, BLAST_R, BLAST_DMG * this.tune.dmgK, true);
    if (boss) {
      if (zb.kind === 'king') this.run.bosses++; else this.run.minis++;
      if (this.boss === zb) this.boss = null;
      this.events.push({ type: 'bossDead', z: zb });
      // a shower of gems and coins, and a chest from a mini-boss
      for (let i = 0; i < 18; i++) this.drop('gem', zb.x + (this.rnd() - 0.5) * 3, zb.z + (this.rnd() - 0.5) * 3, i < 4 ? 25 : 5);
      for (let i = 0; i < 10; i++) this.drop('coin', zb.x + (this.rnd() - 0.5) * 3, zb.z + (this.rnd() - 0.5) * 3, 1);
      if (zb.kind !== 'king') this.drop('chest', zb.x, zb.z, 1);
      return;
    }
    // XP gems: big zombies drop bigger gems
    let xp = def.xp;
    if (xp < 1) xp = this.rnd() < xp ? 1 : 0;
    if (xp > 0) this.drop('gem', zb.x, zb.z, xp);
    const luck = this.stats.luck;
    if (this.rnd() < def.coin * (1 + luck)) this.drop('coin', zb.x + 0.3, zb.z, 1);
    if (this.rnd() < 0.006 * (1 + luck)) this.drop('heal', zb.x, zb.z - 0.3, 1);
    else if (this.rnd() < 0.0022) this.drop('magnet', zb.x, zb.z - 0.3, 1);
  }

  /** An explosion: hurts zombies (and the survivor when `hurtsPlayer`). */
  private blast(x: number, z: number, r: number, dmg: number, hurtsPlayer: boolean): void {
    this.events.push({ type: 'explode', x, z, r });
    this.near(x, z, r + 1, (o) => {
      if (o.dead) return;
      const d = Math.hypot(o.x - x, o.z - z);
      if (d < r + o.r) this.damage(o, dmg * (isBoss(o.kind) ? 0.5 : 2), o.x - x, o.z - z, 2.5, 'blast', false);
    });
    const p = this.player;
    if (hurtsPlayer && Math.hypot(p.x - x, p.z - z) < r + PLAYER_R) this.hurt(dmg, 'blast', x, z);
  }

  private drop(kind: PickupKind, x: number, z: number, value: number): void {
    // too many gems on the ground: fold them into the oldest
    if (kind === 'gem') {
      let gems = 0;
      for (const q of this.pickups) if (q.kind === 'gem' && !q.dead) gems++;
      if (gems > 260) {
        const old = this.pickups.find((q) => q.kind === 'gem' && !q.dead && !q.fly);
        if (old) { old.value += value; return; }
      }
    }
    this.pickups.push({ kind, x, z, value, fly: false, v: 0, dead: false, t: 0 });
  }

  // ------------------------------------------------------------------ weapons

  private fireWeapons(dt: number): void {
    const p = this.player;
    for (const w of this.weapons) {
      const st = weaponStats(w.id, w.lv, w.evo);
      if (w.id === 'wards') { this.spinWards(dt, st, w.evo); continue; }
      const cd = (this.wcd[w.id] ?? 0.4) - dt;
      if (cd > 0) { this.wcd[w.id] = cd; continue; }
      const fired = this.fire(w, st);
      this.wcd[w.id] = fired ? st.cd * this.stats.cdK : 0.12;
    }
    void p;
  }

  private fire(w: OwnedWeapon, st: WeaponStats): boolean {
    const p = this.player;
    const A = this.stats.areaK;
    switch (w.id) {
      case 'blade': {
        const r = st.size * A;
        const t = this.nearest(p.x, p.z, r + 1.6);
        if (!t) return false;
        const ang = t ? Math.atan2(t.x - p.x, t.z - p.z) : p.face;
        const arc = w.evo ? Math.PI * 2 : Math.PI * 0.85;
        for (let k = 0; k < st.n; k++) {
          const a = w.evo ? ang : ang + k * Math.PI;
          this.near(p.x, p.z, r + 1, (zb) => {
            if (zb.dead) return;
            const dx = zb.x - p.x, dz = zb.z - p.z, d = Math.hypot(dx, dz);
            if (d > r + zb.r) return;
            let da = Math.atan2(dx, dz) - a;
            da = Math.atan2(Math.sin(da), Math.cos(da));
            if (Math.abs(da) > arc / 2 + 0.15 && d > zb.r + 0.4) return;
            this.damage(zb, st.dmg, dx, dz, st.knock, 'blade');
          });
          this.events.push({ type: 'swing', x: p.x, z: p.z, ang: a, arc, r, evo: w.evo, n: k });
        }
        return true;
      }
      case 'bow': {
        const t = this.nearest(p.x, p.z, st.size);
        if (!t) return false;
        const base = t ? Math.atan2(t.x - p.x, t.z - p.z) : p.face;
        const n = st.n;
        for (let k = 0; k < n; k++) {
          const a = w.evo ? base + (k / n) * Math.PI * 2 : base + (k - (n - 1) / 2) * 0.16;
          this.shoot('arrow', p.x, p.z, a, st.speed, st.dmg, st.pierce, st.size / st.speed + 0.2, w.evo);
        }
        this.events.push({ type: 'fire', w: 'bow', x: p.x, z: p.z, ang: base });
        return true;
      }
      case 'spear': {
        const len = st.size * A;
        const t = this.nearest(p.x, p.z, len + 0.5);
        if (!t) return false;
        const base = Math.atan2(t.x - p.x, t.z - p.z);
        const angs = st.n === 1 ? [base] : st.n === 2 ? [base, base + Math.PI] : [base, base + 2.09, base - 2.09];
        for (const a of angs) {
          const ux = Math.sin(a), uz = Math.cos(a);
          const hit: Zombie[] = [];
          this.near(p.x + ux * len / 2, p.z + uz * len / 2, len / 2 + 1, (zb) => {
            if (zb.dead) return;
            const dx = zb.x - p.x, dz = zb.z - p.z;
            const along = dx * ux + dz * uz, side = Math.abs(dx * uz - dz * ux);
            if (along < -0.2 || along > len + zb.r || side > 0.55 + zb.r) return;
            hit.push(zb);
          });
          for (const zb of hit) this.damage(zb, st.dmg, ux, uz, st.knock, 'spear');
          this.events.push({ type: 'thrust', x: p.x, z: p.z, ang: a, len, evo: w.evo });
          if (w.evo && hit.length) {
            // lightning jumps on from the farthest one hit
            const seen = new Set(hit.map((h) => h.id));
            let from = hit.reduce((a2, b) => (Math.hypot(b.x - p.x, b.z - p.z) > Math.hypot(a2.x - p.x, a2.z - p.z) ? b : a2));
            const pts = [{ x: from.x, z: from.z }];
            for (let k = 0; k < st.pierce; k++) {
              const nx = this.nearest(from.x, from.z, 4.5, seen);
              if (!nx) break;
              seen.add(nx.id);
              this.damage(nx, st.dmg * 0.6, nx.x - from.x, nx.z - from.z, 0.6, 'spear');
              pts.push({ x: nx.x, z: nx.z });
              from = nx;
            }
            if (pts.length > 1) this.events.push({ type: 'chain', pts });
          }
        }
        return true;
      }
      case 'blaster': {
        const t = this.nearest(p.x, p.z, st.size);
        if (!t) return false;
        const a = Math.atan2(t.x - p.x, t.z - p.z);
        for (let k = 0; k < st.n; k++) {
          const off = st.n === 1 ? 0 : (k - 0.5) * 0.14;
          this.shoot(w.evo ? 'ember' : 'shot', p.x, p.z, a + off + (this.rnd() - 0.5) * 0.05, st.speed, st.dmg, st.pierce, st.size / st.speed + 0.1, w.evo);
        }
        this.events.push({ type: 'fire', w: 'blaster', x: p.x, z: p.z, ang: a });
        return true;
      }
      case 'torch': {
        const targets: { x: number; z: number }[] = [];
        const seen = new Set<number>();
        for (let k = 0; k < st.n; k++) {
          // a crowded spot near the survivor
          let best: Zombie | null = null, bs = -1;
          for (let tries = 0; tries < 6; tries++) {
            const zb = this.zombies[Math.floor(this.rnd() * this.zombies.length)];
            if (!zb || zb.dead || seen.has(zb.id)) continue;
            const d = Math.hypot(zb.x - p.x, zb.z - p.z);
            if (d > 8.5) continue;
            let crowd = 0;
            this.near(zb.x, zb.z, 1.5, () => { crowd++; });
            const s = crowd - d * 0.15;
            if (s > bs) { bs = s; best = zb; }
          }
          if (best) { seen.add(best.id); targets.push({ x: best.x, z: best.z }); }
        }
        if (!targets.length) return false;
        for (const t of targets) {
          const d = Math.hypot(t.x - p.x, t.z - p.z);
          const torch: Torch = { x0: p.x, z0: p.z, x1: t.x, z1: t.z, t: 0, T: 0.35 + d * 0.05, r: st.size * A, dps: st.dmg, burn: st.speed, evo: w.evo };
          this.torches.push(torch);
          this.events.push({ type: 'torch', t: torch });
        }
        return true;
      }
      case 'robot': {
        const r = this.robot;
        const t = this.nearest(r.x, r.z, st.size);
        if (!t) return false;
        const a = Math.atan2(t.x - r.x, t.z - r.z);
        r.face = a;
        for (let k = 0; k < st.n; k++) this.shoot('laser', r.x, r.z, a + (k - (st.n - 1) / 2) * 0.12, st.speed, st.dmg, st.pierce, st.size / st.speed + 0.1, w.evo);
        this.events.push({ type: 'fire', w: 'robot', x: r.x, z: r.z, ang: a });
        r.fire = 0.25;
        return true;
      }
      default:
        return false;
    }
  }

  private shoot(kind: ShotKind, x: number, z: number, a: number, sp: number, dmg: number, pierce: number, life: number, evo: boolean): void {
    this.shots.push({ kind, x: x + Math.sin(a) * 0.4, z: z + Math.cos(a) * 0.4, vx: Math.sin(a) * sp, vz: Math.cos(a) * sp, dmg, pierce, life, hits: [], dead: false, evo });
  }

  private spinWards(dt: number, st: WeaponStats, evo: boolean): void {
    const p = this.player;
    this.wardAng += st.speed * dt;
    const R = st.size * this.stats.areaK;
    for (let k = 0; k < st.n; k++) {
      const a = this.wardAng + (k / st.n) * Math.PI * 2;
      const sx = p.x + Math.sin(a) * R, sz = p.z + Math.cos(a) * R;
      this.near(sx, sz, 1, (zb) => {
        if (zb.dead || zb.ward > 0) return;
        if ((zb.x - sx) ** 2 + (zb.z - sz) ** 2 > (zb.r + 0.42) ** 2) return;
        zb.ward = st.cd;
        this.damage(zb, st.dmg, zb.x - p.x, zb.z - p.z, st.knock, 'wards');
        this.events.push({ type: 'ward', x: sx, z: sz });
      });
    }
    void evo;
  }

  private moveShots(dt: number): void {
    for (const s of this.shots) {
      if (s.dead) continue;
      s.x += s.vx * dt; s.z += s.vz * dt; s.life -= dt;
      if (s.life <= 0 || (s.kind !== 'laser' && !this.isFreeLoose(s.x, s.z))) { s.dead = true; continue; }
      const by: WeaponId = s.kind === 'arrow' ? 'bow' : s.kind === 'laser' ? 'robot' : 'blaster';
      this.near(s.x, s.z, 1.2, (zb) => {
        if (s.dead || zb.dead || s.hits.includes(zb.id)) return;
        const rr = zb.r + (s.kind === 'arrow' ? 0.18 : 0.14);
        if ((zb.x - s.x) ** 2 + (zb.z - s.z) ** 2 > rr * rr) return;
        s.hits.push(zb.id);
        this.damage(zb, s.dmg, s.vx, s.vz, s.kind === 'arrow' ? 0.8 : 0.35, by);
        if (s.kind === 'ember') { zb.burn = 2; zb.burnDps = 6; }
        if (s.hits.length > s.pierce) s.dead = true;
      });
    }
    // torches in flight land as fires
    for (const t of this.torches) {
      t.t += dt;
      if (t.t >= t.T) {
        this.fires.push({ x: t.x1, z: t.z1, r: t.r, t: t.burn, max: t.burn, dps: t.dps, tick: 0, evo: t.evo });
        this.events.push({ type: 'ignite', x: t.x1, z: t.z1, r: t.r });
      }
    }
    if (this.torches.some((t) => t.t >= t.T)) this.torches = this.torches.filter((t) => t.t < t.T);
  }

  private burnFires(dt: number): void {
    for (const f of this.fires) {
      f.t -= dt;
      f.tick -= dt;
      if (f.tick > 0 || this.phase !== 'night') continue;
      f.tick = 0.33;
      this.near(f.x, f.z, f.r + 0.6, (zb) => {
        if (zb.dead) return;
        if ((zb.x - f.x) ** 2 + (zb.z - f.z) ** 2 > (f.r + zb.r * 0.5) ** 2) return;
        this.damage(zb, f.dps * 0.33, 0, 0, 0, 'torch', true);
        if (f.evo) { zb.burn = Math.max(zb.burn, 1.5); zb.burnDps = 8; }
      });
    }
    if (this.fires.some((f) => f.t <= 0)) this.fires = this.fires.filter((f) => f.t > 0);
  }

  // ------------------------------------------------------------------ pickups

  private movePickups(dt: number): void {
    const p = this.player;
    if (!p.alive) return;
    const mag = this.stats.magnet;
    const robotMag = this.weapon('robot')?.evo ? 5 : 0;
    const r = this.robot;
    for (const q of this.pickups) {
      if (q.dead) continue;
      q.t += dt;
      const dx = p.x - q.x, dz = p.z - q.z, d = Math.hypot(dx, dz);
      if (!q.fly) {
        const reach = q.kind === 'gem' || q.kind === 'coin' ? mag : 1.1;
        if (d < reach || (robotMag && q.kind === 'gem' && Math.hypot(r.x - q.x, r.z - q.z) < robotMag)) { q.fly = true; q.v = q.kind === 'chest' ? 3 : -3; }
        continue;
      }
      // a little hop away first, then in, faster and faster
      q.v = Math.min(22, q.v + dt * 34);
      const step = q.v * dt;
      q.x += (dx / (d || 1)) * step;
      q.z += (dz / (d || 1)) * step;
      if (d < 0.45) this.collect(q);
    }
  }

  private collect(q: Pickup): void {
    q.dead = true;
    const p = this.player;
    switch (q.kind) {
      case 'gem':
        this.xp += q.value;
        this.events.push({ type: 'gem', value: q.value });
        while (this.xp >= xpToNext(this.level)) {
          this.xp -= xpToNext(this.level);
          this.level++;
          this.events.push({ type: 'level', n: this.level });
          this.addOffer('level');
        }
        break;
      case 'coin':
        this.coins += q.value;
        this.run.coins += q.value;
        this.events.push({ type: 'coin' });
        break;
      case 'heal': {
        const n = Math.min(p.maxHp - p.hp, 30);
        p.hp += n;
        this.events.push({ type: 'heal', n: Math.round(n) });
        break;
      }
      case 'magnet':
        for (const g of this.pickups) if (g.kind === 'gem' && !g.dead) { g.fly = true; g.v = 6; }
        this.events.push({ type: 'magnet' });
        break;
      case 'chest':
        this.coins += 15;
        this.run.coins += 15;
        this.events.push({ type: 'chest', x: q.x, z: q.z });
        this.addOffer('chest');
        break;
    }
  }

  // ------------------------------------------------------------------ offers

  private addOffer(from: 'level' | 'chest', front = false): Offer {
    const cards = rollOffer(this.bag, 3, this.stats.luck, this.rnd, from === 'chest');
    const offer: Offer = { id: ++this.offerId, cards, from, n: this.level };
    if (front) this.offers.unshift(offer); else this.offers.push(offer);
    this.events.push({ type: 'offer', offer });
    return offer;
  }

  canReroll(): boolean { return this.rerolls > 0 && this.player.alive; }

  reroll(i = 0): boolean {
    const o = this.offers[i];
    if (!o || !this.canReroll()) return false;
    this.rerolls--;
    o.cards = rollOffer(this.bag, 3, this.stats.luck, this.rnd, o.from === 'chest', o.cards.filter((c) => c.kind !== 'heal' && c.kind !== 'gold').map(cardKey));
    return true;
  }

  /** Takes card `k` of offer `i`; it applies at once and the offer is used up. */
  take(i: number, k: number): boolean {
    const o = this.offers[i];
    const c = o?.cards[k];
    if (!o || !c || !this.player.alive) return false;
    this.offers.splice(i, 1);
    this.apply(c);
    this.refreshOffers();
    return true;
  }

  takeAll(choose: (cards: Card[]) => number): void {
    while (this.offers.length) if (!this.take(0, choose(this.offers[0].cards))) this.offers.shift();
  }

  /** Applies a card (also used by the tests to set up a run). */
  apply(c: Card): void {
    const p = this.player;
    switch (c.kind) {
      case 'weapon': {
        const w = this.weapon(c.id as WeaponId);
        if (w) w.lv = Math.min(MAX_LEVEL, w.lv + c.add);
        else this.weapons.push({ id: c.id as WeaponId, lv: Math.min(MAX_LEVEL, c.add), evo: false });
        break;
      }
      case 'passive': {
        const q = this.passives.find((x) => x.id === c.id);
        if (q) q.lv = Math.min(MAX_LEVEL, q.lv + c.add);
        else this.passives.push({ id: c.id as PassiveId, lv: Math.min(MAX_LEVEL, c.add) });
        break;
      }
      case 'evo': {
        const w = this.weapon(c.id as WeaponId);
        if (w) { w.evo = true; w.lv = MAX_LEVEL; }
        break;
      }
      case 'heal':
        p.hp = Math.min(p.maxHp, p.hp + p.maxHp * 0.4);
        break;
      case 'gold':
        this.coins += 12;
        this.run.coins += 12;
        break;
    }
    this.recalc();
    this.events.push({ type: 'card', card: c });
  }

  /** Banked offers may hold a card a later pick made pointless: roll that one again. */
  private refreshOffers(): void {
    const bag = this.bag;
    for (const o of this.offers) {
      o.cards = o.cards.map((c) => {
        if (c.kind === 'heal' || c.kind === 'gold') return c;
        const still = rollOffer(bag, 99, 0, () => 0.99).some((x) => cardKey(x) === cardKey(c));
        if (still && c.kind !== 'evo') {
          const lv = c.kind === 'weapon' ? (this.weapon(c.id as WeaponId)?.lv ?? 0) : (this.passives.find((x) => x.id === c.id)?.lv ?? 0);
          const add = Math.min(MAX_LEVEL - lv, c.add);
          return { ...c, add, to: lv + add };
        }
        if (still) return c;
        return rollOffer(bag, 1, this.stats.luck, this.rnd, false, o.cards.map(cardKey))[0] ?? { kind: 'heal', id: 'heal', rarity: 'common', add: 0, to: 0 };
      });
    }
  }

  // ------------------------------------------------------------------ dawn

  private startDawn(): void {
    this.phase = 'dawn';
    this.phaseT = 0;
    this.score += 2500 + Math.round((this.player.hp / this.player.maxHp) * 1000);
    this.events.push({ type: 'dawn' });
    for (const g of this.goo) g.dead = true;
  }

  /** The sun comes up: the horde burns away from the edges inwards, then the run is won. */
  private dawn(dt: number): void {
    const p = this.player;
    const reach = 22 - this.phaseT * 9;
    for (const zb of this.zombies) {
      if (zb.dead) continue;
      zb.burn = 1;
      zb.burnDps = 0;
      const d = Math.hypot(zb.x - p.x, zb.z - p.z);
      if (d > reach || this.phaseT > 2.2) this.kill(zb, 'dawn');
    }
    // the gems left on the ground fly home
    for (const q of this.pickups) if (!q.dead && (q.kind === 'gem' || q.kind === 'coin')) q.fly = true;
    if (this.phaseT > 2.4 && this.phase === 'dawn') {
      this.phase = 'won';
      this.phaseT = 0;
      this.won = true;
      this.events.push({ type: 'won' });
    }
    void dt;
  }

  private compact(): void {
    if (this.zombies.some((z) => z.dead)) this.zombies = this.zombies.filter((z) => !z.dead);
    if (this.shots.some((s) => s.dead)) this.shots = this.shots.filter((s) => !s.dead);
    if (this.goo.some((g) => g.dead)) this.goo = this.goo.filter((g) => !g.dead);
    if (this.pickups.some((q) => q.dead)) this.pickups = this.pickups.filter((q) => !q.dead);
  }

  // ------------------------------------------------------------------ test hooks

  /** Jumps the clock (tests, screenshots and the store art); the director catches up. */
  setTime(t: number): void {
    this.time = t;
    this.swarmT = Math.max(this.swarmT, this.storyT);
    this.rushT = Math.max(this.rushT, this.storyT + 20);
    while (this.minisDone < MINIS.length && this.tune.minis[this.minisDone] < t) { this.warned.add(MINIS[this.minisDone]); this.minisDone++; }
    if (this.tune.king < t) { this.kingDone = true; this.warned.add('king'); }
  }

  /** Puts `n` zombies around the survivor at once (tests and the store art). */
  horde(n: number, kinds: ZombieKind[] = ['shambler', 'runner', 'shambler', 'swarm', 'tank', 'spitter', 'exploder']): void {
    const p = this.player;
    let made = 0;
    for (let tries = 0; made < n && tries < n * 6; tries++) {
      const a = this.rnd() * Math.PI * 2, d = 3.5 + Math.sqrt(this.rnd()) * 12;
      const x = p.x + Math.sin(a) * d, z = p.z + Math.cos(a) * d;
      if (!this.isFree(x, z, 0.35)) continue;
      this.spawn(kinds[made % kinds.length], x, z);
      made++;
    }
  }

  bossNow(kind: BossKind): void { this.spawnBoss(kind); }

  /** Puts an offer with these cards at the front of the queue (tests and the store art). */
  forceOffer(cards: Card[]): Offer {
    const o = this.addOffer('level', true);
    o.cards = cards;
    return o;
  }

  /** A moment without damage (the card bar opening). */
  grace(s: number): void { if (this.player.alive) this.player.inv = Math.max(this.player.inv, s); }
}
