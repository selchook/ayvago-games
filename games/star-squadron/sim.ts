// Star Squadron: the whole run as a pure simulation (no three.js, no Phaser), stepped at a fixed
// 60 Hz. The Play scene draws it and feeds it input; the bot and the headless balance run
// (balance.ts) play it directly. Everything that happens is also pushed to `events`, so the view
// can add sounds and effects.
import {
  FIELD, TUNING, ENEMIES, SECTORS, BOSSES, ARMOURED, TIMES, POWER_CD, POWER_IDS, playerHalfWidth,
  type Mode, type Tuning, type EnemyKind, type BossKind, type PowerId, type PickupKind, type SectorDef,
} from './defs';
import { CARD, shipStats, rollDraft, offerable, NO_TALENTS, type CardId, type Stacks, type ShipStats, type TalentFx } from './cards';

export const STEP = 1 / 60;

export interface Input {
  /** Keyboard / stick axes, −1..1 (z: negative is up the screen). */
  mx: number;
  mz: number;
  /** A point to fly to (touch drag, held mouse): wins over the axes. */
  tx: number | null;
  tz: number | null;
  bomb: boolean;
  shield: boolean;
  overdrive: boolean;
}

export const NO_INPUT: Input = { mx: 0, mz: 0, tx: null, tz: null, bomb: false, shield: false, overdrive: false };

export type Behaviour = 'dive' | 'swoop' | 'hold' | 'kamikaze' | 'drift';

export interface Enemy {
  id: number;
  kind: EnemyKind;
  beh: Behaviour;
  x: number;
  z: number;
  vx: number;
  vz: number;
  hp: number;
  maxHp: number;
  r: number;
  t: number;
  /** Behaviour parameters. */
  x0: number;
  z0: number;
  tx: number;
  tz: number;
  amp: number;
  freq: number;
  speed: number;
  stay: number;
  side: number;
  phase: number;
  fireT: number;
  /** 1 on a hit, fades (the view flashes the ship white). */
  flash: number;
  /** Kamikaze: 0 entering, 1 locking on (a warning), 2 dashing. */
  state: number;
  yaw: number;
  bank: number;
  spin: number;
  dead: boolean;
  /** Left the field without being shot. */
  gone: boolean;
}

export type BulletKind = 'orb' | 'big' | 'mine' | 'needle';

export interface EBullet {
  x: number;
  z: number;
  vx: number;
  vz: number;
  r: number;
  kind: BulletKind;
  t: number;
  dead: boolean;
}

export type ShotKind = 'laser' | 'missile' | 'drone';

export interface PBullet {
  x: number;
  z: number;
  vx: number;
  vz: number;
  kind: ShotKind;
  dmg: number;
  crit: boolean;
  pierce: number;
  bounces: number;
  /** Ids (enemies, boss parts: 1000+, the hull: 999) already hit by this shot. */
  hit: number[];
  t: number;
  dead: boolean;
  /** Overdrive / fan shots look heavier. */
  heavy: boolean;
}

export interface Pickup {
  kind: PickupKind;
  x: number;
  z: number;
  vx: number;
  vz: number;
  t: number;
  dead: boolean;
  /** Pulled in by the magnet. */
  pulled: boolean;
}

export interface BossPart {
  id: number;
  kind: 'turret' | 'pod';
  dx: number;
  dz: number;
  /** Orbiting pods: their angle and distance. */
  ang: number;
  dist: number;
  orbit: boolean;
  x: number;
  z: number;
  r: number;
  hp: number;
  maxHp: number;
  alive: boolean;
  flash: number;
  fireT: number;
  aim: number;
}

export interface Boss {
  kind: BossKind;
  x: number;
  z: number;
  r: number;
  hp: number;
  maxHp: number;
  t: number;
  /** 0 → 2 as the hull loses hit points. */
  phase: number;
  parts: BossPart[];
  /** Flying in: no damage yet. */
  entering: boolean;
  flash: number;
  spin: number;
  timers: number[];
  burst: number;
  dead: boolean;
  score: number;
  coins: number;
}

export type Phase = 'intro' | 'wave' | 'clear' | 'warning' | 'boss' | 'bossDeath' | 'warp' | 'dead';

/**
 * A card offer, earned by a cleared wave or a boss: its cards are rolled when it is earned and it
 * waits in `Sim.offers` until the player opens it and takes one (the run never stops for it).
 */
export interface Offer {
  /** Counts up through the run (the UI tells offers apart by it). */
  id: number;
  cards: CardId[];
  from: 'wave' | 'boss';
  /** The wave (1-based) or the boss's sector (1-based) that earned it. */
  n: number;
  /** Paid rerolls so far and free ones left (the Free Reroll talent). */
  rerolls: number;
  free: number;
}

export type SimEvent =
  | { type: 'fire'; x: number; z: number; heavy: boolean }
  | { type: 'missile'; x: number; z: number }
  | { type: 'hit'; x: number; z: number; crit: boolean; dmg: number; armour: boolean }
  | { type: 'kill'; e: Enemy; score: number }
  | { type: 'partKill'; part: BossPart; boss: Boss }
  | { type: 'chain'; pts: { x: number; z: number }[] }
  | { type: 'hurt'; dmg: number; shield: boolean; x: number; z: number }
  | { type: 'deflect'; x: number; z: number }
  | { type: 'pickup'; kind: PickupKind; x: number; z: number; value: number }
  | { type: 'power'; id: PowerId }
  | { type: 'eshot'; x: number; z: number; big: boolean }
  | { type: 'mine'; x: number; z: number }
  | { type: 'wave'; n: number }
  | { type: 'sector'; n: number }
  | { type: 'clear'; flawless: boolean; bonus: number }
  | { type: 'warning' }
  | { type: 'bossSpawn'; boss: Boss }
  | { type: 'bossPhase'; n: number }
  | { type: 'bossKill'; boss: Boss; score: number }
  | { type: 'warp' }
  | { type: 'offer'; offer: Offer }
  | { type: 'card'; id: CardId }
  | { type: 'reflex' }
  | { type: 'phoenix' }
  | { type: 'ready'; id: PowerId }
  | { type: 'death'; x: number; z: number };

export interface Player {
  x: number;
  z: number;
  vx: number;
  vz: number;
  hull: number;
  maxHull: number;
  shield: number;
  /** Seconds since the last hit (shields regrow after a pause). */
  calm: number;
  inv: number;
  fireT: number;
  missileT: number;
  droneT: number;
  bank: number;
  alive: boolean;
}

interface Spawn {
  t: number;
  kind: EnemyKind;
  beh: Behaviour;
  x: number;
  z: number;
  p: Partial<Enemy>;
}

export interface PowerState { cd: number; max: number }

export interface RunStats {
  kills: number;
  wavesCleared: number;
  bosses: number;
  damageTaken: number;
  creditsEarned: number;
  cards: number;
  time: number;
}

/** A small seeded random generator (mulberry32). */
export function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), a | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const PLAYER_R = 0.3;
/** Enemy bullets on screen at most. */
export const MAX_BULLETS = 320;
const BUBBLE_R = 1.5;

export class Sim {
  readonly tune: Tuning;
  readonly rnd: () => number;
  phase: Phase = 'intro';
  phaseT = TIMES.intro;
  /** Sectors flown, from 0 (the loop's sector is `sector % 4`). */
  sector = 0;
  waveIx = 0;
  time = 0;
  score = 0;
  credits = 0;
  player: Player;
  enemies: Enemy[] = [];
  ebullets: EBullet[] = [];
  pbullets: PBullet[] = [];
  pickups: Pickup[] = [];
  boss: Boss | null = null;
  stacks: Stacks = {};
  cardOrder: CardId[] = [];
  stats: ShipStats;
  powers: Record<PowerId, PowerState>;
  shieldT = 0;
  overdriveT = 0;
  novaT = 0;
  boostT = 0;
  slowT = 0;
  reflexCd = 0;
  phoenix = 0;
  /** Card offers earned and not opened yet, oldest first. */
  offers: Offer[] = [];
  private offerId = 0;
  events: SimEvent[] = [];
  run: RunStats = { kills: 0, wavesCleared: 0, bosses: 0, damageTaken: 0, creditsEarned: 0, cards: 0, time: 0 };
  private nextId = 1;
  private queue: Spawn[] = [];
  private waveT = 0;
  private waveHurt = false;
  private acc = 0;

  constructor(readonly mode: Mode, seed: number, readonly talents: TalentFx = NO_TALENTS) {
    this.tune = TUNING[mode];
    this.rnd = seeded(seed);
    this.stats = shipStats(this.stacks, talents);
    const maxHull = this.tune.hull + this.stats.hullBonus;
    this.player = {
      x: 0, z: FIELD.home + 6, vx: 0, vz: 0, hull: maxHull, maxHull, shield: this.stats.shieldMax, calm: 9, inv: 0,
      fireT: 0, missileT: 0, droneT: 0, bank: 0, alive: true,
    };
    this.powers = { bomb: { cd: 0, max: 1 }, shield: { cd: 0, max: 1 }, overdrive: { cd: 0, max: 1 } };
    this.phoenix = talents.phoenix;
    this.events.push({ type: 'sector', n: 0 });
  }

  get sectorDef(): SectorDef { return SECTORS[this.sector % SECTORS.length]; }
  get loop(): number { return Math.floor(this.sector / SECTORS.length); }
  get wavesInSector(): number { return this.sectorDef.waves; }
  /** Difficulty index: 0 in the first sector, growing with sectors (and a little with waves). */
  get diff(): number { return (this.sector + this.waveIx * 0.15) * this.tune.ramp; }
  get hpMul(): number { const d = this.diff; return (1 + 0.6 * d + 0.07 * d * d) * this.tune.enemyHp * Math.pow(1.5, this.loop); }
  /** The endless loop: every pass after the first adds to the caps below. */
  private get loopK(): number { return 1 + 0.5 * this.loop; }
  get fireMul(): number { return Math.min(3.2, 1 + 0.2 * this.diff) * this.tune.fire * this.loopK; }
  get speedMul(): number { return Math.min(1.5, 1 + 0.06 * this.diff) * this.tune.bulletSpeed * Math.min(1.25, this.loopK); }
  get densityMul(): number { return Math.min(2.6, 1 + 0.15 * this.diff) * this.tune.density * this.loopK; }
  /** Damage of an enemy bullet now. */
  get bulletDmg(): number { return this.tune.bulletDmg * (1 + 0.2 * this.diff); }
  get scoreMul(): number { return 1 + 0.25 * this.sector; }
  get over(): boolean { return this.phase === 'dead'; }
  /** The run's stardust (the talent board's currency), see meta.ts. */

  // ------------------------------------------------------------------ main step

  /** Advances the run by `dt` seconds of play (fixed 60 Hz steps inside). */
  step(dt: number, input: Input): void {
    this.acc += Math.min(dt, 0.1);
    let first = true;
    while (this.acc >= STEP) {
      this.acc -= STEP;
      this.tick(STEP, first ? input : { ...input, bomb: false, shield: false, overdrive: false });
      first = false;
    }
  }

  private tick(dt: number, input: Input): void {
    this.time += dt;
    this.run.time += dt;
    const p = this.player;
    if (this.phase === 'dead') {
      // the wreck drifts while the world goes on a little
      this.phaseT -= dt;
      this.moveWorld(dt * 0.6);
      return;
    }
    // bullet time from the Reflex card slows everything but the ship
    if (this.slowT > 0) this.slowT -= dt;
    const es = this.slowT > 0 ? 0.35 : 1;
    this.reflexCd -= dt;

    this.movePlayer(dt, input);
    this.updatePowers(dt, input);
    const firing = this.phase === 'wave' || this.phase === 'boss' || this.phase === 'clear' || this.phase === 'warning';
    if (firing && p.alive) this.weapons(dt);
    if (this.phase === 'wave') this.spawner(dt * es);
    this.moveWorld(dt * es);
    this.collide();
    this.pickupsStep(dt);
    this.regen(dt);
    this.phases(dt);
    this.compact();
  }

  /** Enemies, the boss and every bullet move (also while the ship is down). */
  private moveWorld(dt: number): void {
    for (const e of this.enemies) this.moveEnemy(e, dt);
    if (this.boss) this.moveBoss(this.boss, dt);
    for (const b of this.ebullets) {
      b.t += dt;
      if (b.kind === 'mine') {
        b.vz *= 1 - 0.9 * dt;
        if (b.t > 1.7) {
          b.dead = true;
          this.events.push({ type: 'mine', x: b.x, z: b.z });
          const n = Math.max(5, Math.round(7 * this.densityMul));
          this.ring(b.x, b.z, n, 4.6, this.rnd() * Math.PI, 'orb');
        }
      }
      b.x += b.vx * dt;
      b.z += b.vz * dt;
      if (b.z > FIELD.bottom || b.z < FIELD.top - 6 || Math.abs(b.x) > 9) b.dead = true;
    }
    const pdt = this.phase === 'dead' ? dt : dt; // player shots are not slowed by the Reflex card
    for (const s of this.pbullets) this.moveShot(s, pdt);
  }

  // ------------------------------------------------------------------ the ship

  private movePlayer(dt: number, input: Input): void {
    const p = this.player;
    if (!p.alive) return;
    const sp = this.stats.speed;
    let vx = 0, vz = 0;
    if (this.phase === 'intro' || this.phase === 'warp') {
      // fly in to the home row at the start of a sector
      vx = (0 - p.x) * 2.5;
      vz = (FIELD.home - p.z) * 2.5;
      if (this.phase === 'warp') vz = Math.min(vz, 0);
    } else if (input.tx !== null && input.tz !== null) {
      const dx = input.tx - p.x, dz = input.tz - p.z;
      const d = Math.hypot(dx, dz);
      const max = sp * 2.6;
      if (d > 0.001) {
        const v = Math.min(max, d / dt * 0.5);
        vx = (dx / d) * v;
        vz = (dz / d) * v;
      }
    } else {
      const len = Math.hypot(input.mx, input.mz);
      const k = len > 1 ? 1 / len : 1;
      vx = input.mx * k * sp;
      vz = input.mz * k * sp;
    }
    p.vx = vx;
    p.vz = vz;
    p.x += vx * dt;
    p.z += vz * dt;
    if (this.phase !== 'intro' && this.phase !== 'warp') {
      p.z = Math.max(FIELD.pTop, Math.min(FIELD.pBottom, p.z));
      const hw = playerHalfWidth(p.z);
      p.x = Math.max(-hw, Math.min(hw, p.x));
    }
    p.bank += (Math.max(-1, Math.min(1, -vx / sp)) - p.bank) * Math.min(1, dt * 8);
    if (p.inv > 0) p.inv -= dt;
    p.calm += dt;
  }

  private regen(dt: number): void {
    const p = this.player;
    if (!p.alive) return;
    const s = this.stats;
    if (s.shieldMax > 0 && p.calm > 4 && p.shield < s.shieldMax) p.shield = Math.min(s.shieldMax, p.shield + s.shieldRegen * dt);
    if (s.hullRegen > 0 && p.calm > 3 && p.hull < p.maxHull) p.hull = Math.min(p.maxHull, p.hull + s.hullRegen * dt);
  }

  // ------------------------------------------------------------------ powers

  canUse(id: PowerId): boolean {
    return this.powers[id].cd <= 0 && this.player.alive && (this.phase === 'wave' || this.phase === 'boss' || this.phase === 'clear' || this.phase === 'warning');
  }

  private updatePowers(dt: number, input: Input): void {
    for (const id of POWER_IDS) {
      const pw = this.powers[id];
      if (pw.cd > 0) {
        pw.cd -= dt;
        if (pw.cd <= 0) { pw.cd = 0; this.events.push({ type: 'ready', id }); }
      }
    }
    if (this.shieldT > 0) this.shieldT -= dt;
    if (this.overdriveT > 0) this.overdriveT -= dt;
    if (this.novaT > 0) this.novaT -= dt;
    if (this.boostT > 0) this.boostT -= dt;
    if (input.bomb) this.use('bomb');
    if (input.shield) this.use('shield');
    if (input.overdrive) this.use('overdrive');
  }

  /** Fires a power if it is ready; false when it is not. */
  use(id: PowerId): boolean {
    if (!this.canUse(id)) return false;
    const pw = this.powers[id];
    pw.max = POWER_CD[id] * this.stats.cdK;
    pw.cd = pw.max;
    this.events.push({ type: 'power', id });
    if (id === 'bomb') this.bomb();
    else if (id === 'shield') this.shieldT = 3.6;
    else this.overdriveT = this.stats.overdriveT;
    return true;
  }

  private bomb(): void {
    const dmg = this.stats.bombDmg;
    for (const b of this.ebullets) b.dead = true;
    this.novaT = Math.max(this.novaT, 0.35 + this.stats.bombNova);
    for (const e of this.enemies) if (!e.dead && e.z > FIELD.top + 1.5) this.damage(e, dmg, false, true);
    const bs = this.boss;
    if (bs && !bs.entering) {
      for (const pt of bs.parts) if (pt.alive) this.damagePart(bs, pt, dmg * 0.8, false);
      this.damageBoss(bs, dmg * 0.45, false, true);
    }
  }

  // ------------------------------------------------------------------ weapons

  private weapons(dt: number): void {
    const p = this.player, s = this.stats;
    const od = this.overdriveT > 0;
    const rate = s.fireRate * (od ? 2.2 : 1) * (this.boostT > 0 ? 1.5 : 1);
    p.fireT -= dt;
    if (p.fireT <= 0) {
      p.fireT += 1 / rate;
      if (p.fireT < 0) p.fireT = 0;
      const spread = s.spread + (od ? 1 : 0);
      const pierce = s.pierce + (od && s.overdrivePierce ? 1 : 0);
      this.shot(p.x - 0.22, p.z - 0.6, 0, pierce, od);
      this.shot(p.x + 0.22, p.z - 0.6, 0, pierce, od);
      for (let i = 1; i <= spread; i++) {
        const a = i * 0.13;
        // the fan's angled shots hit harder with Laser Fan
        this.shot(p.x - 0.3, p.z - 0.4, -a, pierce, od || s.laserFan, s.laserFan ? 1.4 : 0.8);
        this.shot(p.x + 0.3, p.z - 0.4, a, pierce, od || s.laserFan, s.laserFan ? 1.4 : 0.8);
      }
      this.events.push({ type: 'fire', x: p.x, z: p.z, heavy: od });
    }
    if (s.missiles > 0) {
      p.missileT -= dt;
      if (p.missileT <= 0) {
        p.missileT = s.missileCd;
        for (let i = 0; i < s.missiles; i++) {
          const side = i % 2 ? 1 : -1;
          const crit = this.rnd() < s.crit;
          this.pbullets.push({
            x: p.x + side * 0.5, z: p.z, vx: side * (4 + i), vz: -6, kind: 'missile', dmg: s.damage * 2.6 * (crit ? 2 : 1), crit,
            pierce: 0, bounces: 0, hit: [], t: 0, dead: false, heavy: false,
          });
        }
        this.events.push({ type: 'missile', x: p.x, z: p.z });
      }
    }
    if (s.drones > 0) {
      p.droneT -= dt;
      if (p.droneT <= 0) {
        p.droneT = 0.5;
        for (let i = 0; i < s.drones; i++) {
          const d = this.dronePos(i);
          const tgt = this.nearestTarget(d.x, d.z, 14, []);
          let vx = 0, vz = -22;
          if (tgt) {
            const dx = tgt.x - d.x, dz = tgt.z - d.z, l = Math.hypot(dx, dz) || 1;
            vx = (dx / l) * 22; vz = (dz / l) * 22;
          }
          const crit = s.sniperDrones || this.rnd() < s.crit;
          this.pbullets.push({ x: d.x, z: d.z, vx, vz, kind: 'drone', dmg: s.droneDmg * (crit ? 2 : 1), crit, pierce: 0, bounces: 0, hit: [], t: 0, dead: false, heavy: false });
        }
      }
    }
  }

  /** Where drone i is (they circle the ship). */
  dronePos(i: number): { x: number; z: number } {
    const n = this.stats.drones;
    const a = this.time * 2.1 + (i * Math.PI * 2) / Math.max(1, n);
    return { x: this.player.x + Math.cos(a) * 1.35, z: this.player.z + 0.2 + Math.sin(a) * 0.8 };
  }

  private shot(x: number, z: number, ang: number, pierce: number, heavy: boolean, dmgK = 1): void {
    const s = this.stats;
    const crit = this.rnd() < s.crit;
    this.pbullets.push({
      x, z, vx: Math.sin(ang) * s.bulletSpeed, vz: -Math.cos(ang) * s.bulletSpeed, kind: 'laser',
      dmg: s.damage * dmgK * (crit ? 2 : 1), crit, pierce, bounces: 0, hit: [], t: 0, dead: false, heavy,
    });
  }

  private moveShot(s: PBullet, dt: number): void {
    s.t += dt;
    if (s.kind === 'missile') {
      const tgt = s.t > 0.15 ? this.nearestTarget(s.x, s.z, 30, s.hit) : null;
      const sp = Math.min(17, 7 + s.t * 22);
      let ang = Math.atan2(s.vx, -s.vz);
      if (tgt) {
        const want = Math.atan2(tgt.x - s.x, -(tgt.z - s.z));
        let d = want - ang;
        while (d > Math.PI) d -= Math.PI * 2;
        while (d < -Math.PI) d += Math.PI * 2;
        ang += Math.max(-7 * dt, Math.min(7 * dt, d));
      } else ang *= 1 - 2 * dt;
      s.vx = Math.sin(ang) * sp;
      s.vz = -Math.cos(ang) * sp;
      if (s.t > 4) s.dead = true;
    }
    s.x += s.vx * dt;
    s.z += s.vz * dt;
    if (s.z < FIELD.top - 2 || s.z > FIELD.bottom || Math.abs(s.x) > 9) s.dead = true;
  }

  /** The closest thing to shoot at: an enemy on screen, a living boss part or the boss hull. */
  nearestTarget(x: number, z: number, range: number, skip: number[]): { x: number; z: number; id: number } | null {
    let best: { x: number; z: number; id: number } | null = null, bd = range * range;
    for (const e of this.enemies) {
      if (e.dead || e.z < FIELD.top + 2 || skip.includes(e.id)) continue;
      const d = (e.x - x) ** 2 + (e.z - z) ** 2;
      if (d < bd) { bd = d; best = { x: e.x, z: e.z, id: e.id }; }
    }
    const b = this.boss;
    if (b && !b.dead && !b.entering) {
      for (const pt of b.parts) {
        if (!pt.alive || skip.includes(1000 + pt.id)) continue;
        const d = (pt.x - x) ** 2 + (pt.z - z) ** 2;
        if (d < bd) { bd = d; best = { x: pt.x, z: pt.z, id: 1000 + pt.id }; }
      }
      if (!skip.includes(999)) {
        const d = (b.x - x) ** 2 + (b.z - z) ** 2;
        if (d < bd) { bd = d; best = { x: b.x, z: b.z, id: 999 }; }
      }
    }
    return best;
  }

  // ------------------------------------------------------------------ waves

  private startWave(ix: number): void {
    this.waveIx = ix;
    this.phase = 'wave';
    this.waveT = 0;
    this.waveHurt = false;
    this.queue = buildWave(this, ix);
    this.events.push({ type: 'wave', n: ix });
  }

  private spawner(dt: number): void {
    this.waveT += dt;
    while (this.queue.length && this.queue[0].t <= this.waveT) {
      const s = this.queue.shift()!;
      this.spawn(s.kind, s.beh, s.x, s.z, s.p);
    }
  }

  spawn(kind: EnemyKind, beh: Behaviour, x: number, z: number, p: Partial<Enemy> = {}): Enemy {
    const def = ENEMIES[kind];
    const hp = Math.round(def.hp * this.hpMul);
    const e: Enemy = {
      id: this.nextId++, kind, beh, x, z, vx: 0, vz: 0, hp, maxHp: hp, r: def.r, t: 0,
      x0: x, z0: z, tx: x, tz: -12, amp: 0, freq: 1, speed: 5, stay: 6, side: 1, phase: this.rnd() * Math.PI * 2,
      fireT: 0.5 + this.rnd() * 1.2, flash: 0, state: 0, yaw: 0, bank: 0, spin: 0, dead: false, gone: false,
      ...p,
    };
    if (def.rock) e.spin = (this.rnd() - 0.5) * 3;
    this.enemies.push(e);
    return e;
  }

  private moveEnemy(e: Enemy, dt: number): void {
    if (e.dead) return;
    e.t += dt;
    if (e.flash > 0) e.flash = Math.max(0, e.flash - dt * 6);
    const px = this.player.x, pz = this.player.z;
    const ox = e.x, oz = e.z;
    switch (e.beh) {
      case 'dive':
        e.z += e.speed * dt;
        e.x = e.x0 + e.amp * Math.sin(e.freq * e.t + e.phase);
        break;
      case 'swoop': {
        // across the screen on a shallow arc
        e.x += -e.side * e.speed * dt;
        e.z = e.z0 + 3.2 * Math.sin(Math.min(Math.PI, (Math.abs(e.x - e.x0) / 14) * Math.PI));
        break;
      }
      case 'hold': {
        if (e.state === 0) {
          const dx = e.tx - e.x, dz = e.tz - e.z, d = Math.hypot(dx, dz);
          const v = Math.min(9, 1.5 + d * 2.2);
          if (d < 0.08) { e.state = 1; e.t = 0; }
          else { e.x += (dx / d) * v * dt; e.z += (dz / d) * v * dt; }
        } else if (e.state === 1) {
          e.x = e.tx + Math.sin(e.t * e.freq + e.phase) * e.amp;
          e.z = e.tz + Math.sin(e.t * 1.3 + e.phase) * 0.35;
          if (e.t > e.stay) { e.state = 2; e.t = 0; }
        } else {
          e.vz = Math.min(9, e.vz + 7 * dt);
          e.z += e.vz * dt;
        }
        break;
      }
      case 'kamikaze': {
        if (e.state === 0) {
          const dx = e.tx - e.x, dz = e.tz - e.z, d = Math.hypot(dx, dz);
          if (d < 0.1) { e.state = 1; e.t = 0; }
          else { const v = Math.min(10, 2 + d * 2.5); e.x += (dx / d) * v * dt; e.z += (dz / d) * v * dt; }
        } else if (e.state === 1) {
          // locks on (the view shows a red line), then dashes at where the ship was
          if (e.t > 0.85) {
            e.state = 2;
            const dx = px - e.x, dz = pz - e.z, d = Math.hypot(dx, dz) || 1;
            const v = 12 * Math.min(1.3, this.tune.bulletSpeed * (1 + 0.04 * this.diff));
            e.vx = (dx / d) * v; e.vz = (dz / d) * v;
          }
        } else {
          e.x += e.vx * dt;
          e.z += e.vz * dt;
        }
        break;
      }
      case 'drift':
        e.x += e.vx * dt;
        e.z += e.vz * dt;
        break;
    }
    // facing: down the screen, banking with sideways motion
    const mvx = (e.x - ox) / Math.max(dt, 1e-4), mvz = (e.z - oz) / Math.max(dt, 1e-4);
    if (e.beh === 'kamikaze' && e.state >= 1) e.yaw = Math.atan2(px - e.x, pz - e.z);
    else if (Math.hypot(mvx, mvz) > 0.5) e.yaw += (Math.atan2(mvx, Math.max(0.6, mvz)) * 0.6 - e.yaw) * Math.min(1, dt * 5);
    e.bank += (Math.max(-1, Math.min(1, mvx / 6)) - e.bank) * Math.min(1, dt * 5);
    if (e.z > FIELD.bottom || Math.abs(e.x) > 10 || (e.beh === 'swoop' && e.t > 1 && Math.abs(e.x) > 8)) {
      e.dead = true;
      e.gone = true;
    }
    if (!e.dead) this.enemyFire(e, dt);
  }

  private enemyFire(e: Enemy, dt: number): void {
    const visible = e.z > FIELD.top + 3 && e.z < this.player.z - 2.2;
    if (ENEMIES[e.kind].rock || e.kind === 'striker') return;
    e.fireT -= dt * this.fireMul;
    if (e.fireT > 0 || !visible || this.phase === 'dead') return;
    const sp = this.speedMul;
    const dn = this.densityMul;
    switch (e.kind) {
      case 'scout':
        e.fireT = 1.9 + this.rnd() * 0.9;
        this.aimed(e.x, e.z + 0.4, 1, 0, 6.2 * sp, 'orb');
        break;
      case 'fighter':
        if (e.beh === 'hold' && e.state !== 1) { e.fireT = 0.3; return; }
        e.fireT = 1.8 + this.rnd() * 0.5;
        this.aimed(e.x, e.z + 0.5, dn > 1.25 ? 5 : 3, 0.24, 6.4 * sp, 'needle');
        break;
      case 'gunship': {
        e.fireT = 2.7;
        const n = Math.max(6, Math.round(10 * dn));
        this.ring(e.x, e.z, n, 4.6 * sp, e.t * 0.7, 'orb');
        break;
      }
      case 'bomber':
        e.fireT = 2.4;
        this.ebullets.push({ x: e.x, z: e.z + 0.6, vx: 0, vz: 3.2, r: 0.32, kind: 'mine', t: 0, dead: false });
        this.events.push({ type: 'eshot', x: e.x, z: e.z, big: true });
        break;
      case 'carrier':
        if (e.state !== 1) { e.fireT = 0.4; return; }
        if (e.phase > 0 && Math.floor(e.t / 5) % 2 === 1) {
          // launch bay: two scouts
          e.fireT = 4.5;
          for (const s of [-1, 1]) this.spawn('scout', 'dive', e.x + s * 1.1, e.z + 0.5, { speed: 4.5, amp: 1.4, freq: 1.4, x0: e.x + s * 1.6, fireT: 2 });
        } else {
          e.fireT = 0.2;
          const arms = Math.max(2, Math.round(3 * dn));
          e.spin += 0.32;
          for (let i = 0; i < arms; i++) {
            const a = e.spin + (i * Math.PI * 2) / arms;
            this.bullet(e.x, e.z, Math.sin(a) * 4.4 * sp, Math.cos(a) * 4.4 * sp, 'orb');
          }
        }
        break;
    }
  }

  // ------------------------------------------------------------------ bullet patterns

  private bullet(x: number, z: number, vx: number, vz: number, kind: BulletKind): void {
    // a mega-bomb nova eats new bullets; past MAX_BULLETS the screen would be unreadable
    if (this.novaT > 0 || this.ebullets.length >= MAX_BULLETS) return;
    const r = kind === 'big' ? 0.36 : kind === 'mine' ? 0.32 : kind === 'needle' ? 0.17 : 0.21;
    this.ebullets.push({ x, z, vx, vz, r, kind, t: 0, dead: false });
  }

  /** `n` shots at the ship, `spread` radians apart. */
  aimed(x: number, z: number, n: number, spread: number, speed: number, kind: BulletKind): void {
    const p = this.player;
    const base = Math.atan2(p.x - x, p.z - z);
    for (let i = 0; i < n; i++) {
      const a = base + (i - (n - 1) / 2) * spread;
      this.bullet(x, z, Math.sin(a) * speed, Math.cos(a) * speed, kind);
    }
    this.events.push({ type: 'eshot', x, z, big: kind === 'big' });
  }

  ring(x: number, z: number, n: number, speed: number, off: number, kind: BulletKind): void {
    for (let i = 0; i < n; i++) {
      const a = off + (i * Math.PI * 2) / n;
      this.bullet(x, z, Math.sin(a) * speed, Math.cos(a) * speed, kind);
    }
    this.events.push({ type: 'eshot', x, z, big: true });
  }

  /** A wall of bullets across the field with a gap to slip through. */
  curtain(z: number, speed: number): void {
    const n = 13;
    const gap = 1 + Math.floor(this.rnd() * (n - 4));
    for (let i = 0; i < n; i++) {
      if (i >= gap && i < gap + 3) continue;
      const x = -5.2 + (i * 10.4) / (n - 1);
      this.bullet(x, z, 0, speed, 'orb');
    }
    this.events.push({ type: 'eshot', x: 0, z, big: true });
  }

  // ------------------------------------------------------------------ the boss

  private spawnBoss(): void {
    const kind = this.sectorDef.boss;
    const def = BOSSES[kind];
    const k = this.hpMul;
    const parts: BossPart[] = def.parts.map((p, i) => ({
      id: i, kind: p.kind, dx: p.dx, dz: p.dz, ang: Math.atan2(p.dx, p.dz), dist: Math.hypot(p.dx, p.dz), orbit: !!p.orbit,
      x: 0, z: FIELD.top - 6, r: p.r, hp: Math.round(p.hp * k), maxHp: Math.round(p.hp * k), alive: true, flash: 0,
      fireT: 1.5 + i * 0.45, aim: 0,
    }));
    const hp = Math.round(def.hp * k);
    this.boss = {
      kind, x: 0, z: FIELD.top - 7, r: def.r, hp, maxHp: hp, t: 0, phase: 0, parts, entering: true, flash: 0, spin: 0,
      timers: [2, 3, 5, 4], burst: 0, dead: false, score: Math.round(def.score * this.scoreMul), coins: def.coins,
    };
    this.phase = 'boss';
    this.events.push({ type: 'bossSpawn', boss: this.boss });
  }

  private moveBoss(b: Boss, dt: number): void {
    if (b.dead) return;
    const def = BOSSES[b.kind];
    b.t += dt;
    if (b.flash > 0) b.flash = Math.max(0, b.flash - dt * 6);
    if (b.entering) {
      b.z += (def.z - b.z) * Math.min(1, dt * 1.2);
      if (Math.abs(b.z - def.z) < 0.25) b.entering = false;
    } else {
      b.x = Math.sin(b.t * 0.42) * def.sway * (b.phase === 2 ? 1.25 : 1);
      b.z = def.z + Math.sin(b.t * 0.7) * 0.5;
    }
    const spin = b.t * (b.phase === 2 ? 0.9 : 0.6);
    for (const pt of b.parts) {
      if (pt.flash > 0) pt.flash = Math.max(0, pt.flash - dt * 6);
      if (pt.orbit) {
        pt.x = b.x + Math.sin(pt.ang + spin) * pt.dist;
        pt.z = b.z + Math.cos(pt.ang + spin) * pt.dist * 0.75;
      } else {
        pt.x = b.x + pt.dx;
        pt.z = b.z + pt.dz;
      }
      pt.aim = Math.atan2(this.player.x - pt.x, this.player.z - pt.z);
    }
    if (!b.entering && this.phase !== 'dead') this.bossFire(b, dt);
  }

  private bossFire(b: Boss, dt: number): void {
    const f = this.fireMul, sp = this.speedMul, dn = this.densityMul;
    const N = (n: number) => Math.max(4, Math.round(n * dn));
    // the parts
    for (const pt of b.parts) {
      if (!pt.alive) continue;
      pt.fireT -= dt * f;
      if (pt.fireT > 0) continue;
      if (pt.kind === 'turret') {
        pt.fireT = b.kind === 'fortress' ? 2.2 : 2.0;
        this.aimed(pt.x, pt.z + 0.4, b.kind === 'fortress' ? 2 : 3, 0.22, 6.3 * sp, 'needle');
      } else {
        pt.fireT = b.kind === 'titan' ? 2.6 : 1.7;
        if (b.kind === 'titan') this.ring(pt.x, pt.z, N(6), 4.2 * sp, b.t, 'orb');
        else this.aimed(pt.x, pt.z, 1, 0, 6.6 * sp, 'orb');
      }
    }
    // the hull, by phase
    const T = b.timers;
    for (let i = 0; i < T.length; i++) T[i] -= dt * f;
    const ph = b.phase;
    const spiral = (arms: number, step: number, both = false) => {
      b.spin += step;
      for (let i = 0; i < arms; i++) {
        const a = b.spin + (i * Math.PI * 2) / arms;
        this.bullet(b.x, b.z + 0.5, Math.sin(a) * 4.3 * sp, Math.cos(a) * 4.3 * sp, 'orb');
        if (both) this.bullet(b.x, b.z + 0.5, Math.sin(-a) * 3.8 * sp, Math.cos(-a) * 3.8 * sp, 'orb');
      }
      if (Math.floor(b.t * 4) % 2 === 0) this.events.push({ type: 'eshot', x: b.x, z: b.z, big: false });
    };
    // a spiral runs in bursts: on for a while, then off
    const burst = (on: number, off: number) => (b.t % (on + off)) < on;
    switch (b.kind) {
      case 'dread':
        if (T[0] <= 0) { T[0] = ph === 0 ? 3.4 : 2.6; if (ph < 2) this.ring(b.x, b.z + 0.8, N(ph ? 16 : 12), 4.4 * sp, b.t, 'orb'); }
        if (ph >= 1 && T[1] <= 0) { T[1] = 3.1; this.aimed(b.x, b.z + 1, 1, 0, 5.2 * sp, 'big'); }
        if (ph === 2 && T[2] <= 0 && burst(2.6, 1.4)) { T[2] = 0.11; spiral(N(4), 0.27); }
        if (ph === 2 && T[3] <= 0) { T[3] = 6.5; for (const s of [-1, 1]) this.spawn('scout', 'dive', b.x + s * 2, b.z + 1, { speed: 5, amp: 1.2, freq: 1.5, x0: b.x + s * 2.5 }); }
        break;
      case 'hive':
        if (ph === 0 && T[0] <= 0 && burst(2, 2)) { T[0] = 0.14; spiral(N(3), 0.21); }
        if (ph >= 1 && T[1] <= 0) { T[1] = 2.8; this.ring(b.x, b.z, N(14), 4.2 * sp, b.t, 'orb'); }
        if (ph >= 1 && T[2] <= 0) {
          T[2] = ph === 2 ? 7 : 6;
          for (const s of [-1, 1]) this.spawn('striker', 'kamikaze', b.x + s * 1.5, b.z + 1, { tx: b.x + s * 3, tz: b.z + 3 });
        }
        if (ph === 2 && T[3] <= 0 && burst(2.4, 1.6)) { T[3] = 0.13; spiral(N(3), 0.23, true); }
        break;
      case 'fortress':
        if (T[0] <= 0) { T[0] = ph === 0 ? 3.4 : ph === 1 ? 2.8 : 2.3; this.curtain(b.z + 2, 3.8 * sp); }
        if (ph >= 1 && T[1] <= 0) { T[1] = 3.0; this.aimed(b.x, b.z + 1, 3, 0.35, 5.0 * sp, 'big'); }
        if (ph === 2 && T[2] <= 0) { T[2] = 3.2; this.ring(b.x, b.z, N(18), 4.0 * sp, b.t, 'orb'); }
        break;
      case 'titan':
        if (T[0] <= 0) {
          T[0] = 2.4;
          if (Math.floor(b.t / 2.4) % 2) this.ring(b.x, b.z + 0.6, N(14), 4.4 * sp, b.t, 'orb');
          else this.aimed(b.x, b.z + 1, 3, 0.3, 5.2 * sp, 'big');
        }
        if (ph >= 1 && T[1] <= 0 && burst(2.5, 1.8)) { T[1] = 0.12; spiral(N(ph === 2 ? 5 : 4), 0.26, ph === 2); }
        if (ph >= 1 && T[2] <= 0) { T[2] = 4.2; this.curtain(b.z + 2.5, 3.6 * sp); }
        if (ph === 2 && T[3] <= 0) {
          T[3] = 7;
          this.spawn('striker', 'kamikaze', b.x - 2, b.z + 1, { tx: b.x - 3, tz: b.z + 3 });
          this.spawn('striker', 'kamikaze', b.x + 2, b.z + 1, { tx: b.x + 3, tz: b.z + 3 });
        }
        break;
    }
  }

  private damageBoss(b: Boss, dmg: number, crit: boolean, ignoreArmour = false): void {
    if (b.dead || b.entering) return;
    const armour = !ignoreArmour && b.parts.some((p) => p.alive);
    const d = armour ? dmg * ARMOURED : dmg;
    b.hp -= d;
    b.flash = Math.max(b.flash, armour ? 0.35 : 1);
    this.events.push({ type: 'hit', x: b.x, z: b.z + 0.6, crit, dmg: d, armour });
    const frac = b.hp / b.maxHp;
    const ph = frac > 0.66 ? 0 : frac > 0.33 ? 1 : 2;
    if (ph > b.phase) {
      b.phase = ph;
      b.burst = 0;
      this.events.push({ type: 'bossPhase', n: ph });
    }
    if (b.hp <= 0) this.killBoss(b);
  }

  private damagePart(b: Boss, pt: BossPart, dmg: number, crit: boolean): void {
    if (!pt.alive || b.entering) return;
    pt.hp -= dmg;
    pt.flash = 1;
    this.events.push({ type: 'hit', x: pt.x, z: pt.z, crit, dmg, armour: false });
    if (pt.hp <= 0) {
      pt.alive = false;
      this.score += Math.round(800 * this.scoreMul);
      this.dropCoins(pt.x, pt.z, 4);
      this.events.push({ type: 'partKill', part: pt, boss: b });
    }
  }

  private killBoss(b: Boss): void {
    b.dead = true;
    b.hp = 0;
    for (const pt of b.parts) pt.alive = false;
    this.score += b.score;
    this.run.bosses++;
    for (const e of this.enemies) if (!e.dead) { e.dead = true; this.events.push({ type: 'kill', e, score: 0 }); }
    for (const s of this.ebullets) s.dead = true;
    this.dropCoins(b.x, b.z, b.coins);
    this.drop(b.x - 1, b.z, 'repair');
    this.drop(b.x + 1, b.z, this.stats.shieldMax > 0 ? 'cell' : 'charge');
    this.events.push({ type: 'bossKill', boss: b, score: b.score });
    this.phase = 'bossDeath';
    this.phaseT = TIMES.bossDeath;
  }

  // ------------------------------------------------------------------ hits

  private collide(): void {
    const p = this.player;
    const b = this.boss;
    // the ship's shots
    for (const s of this.pbullets) {
      if (s.dead) continue;
      const sr = s.kind === 'missile' ? 0.3 : 0.16;
      for (const e of this.enemies) {
        if (e.dead || e.z < FIELD.top + 1 || s.hit.includes(e.id)) continue;
        const rr = e.r + sr;
        if ((e.x - s.x) ** 2 + (e.z - s.z) ** 2 > rr * rr) continue;
        this.shotHits(s, e.id, e.x, e.z, (dmg, crit) => this.damage(e, dmg, crit));
        if (s.dead) break;
      }
      if (s.dead || !b || b.dead || b.entering) continue;
      for (const pt of b.parts) {
        if (!pt.alive || s.hit.includes(1000 + pt.id)) continue;
        const rr = pt.r + sr;
        if ((pt.x - s.x) ** 2 + (pt.z - s.z) ** 2 > rr * rr) continue;
        this.shotHits(s, 1000 + pt.id, pt.x, pt.z, (dmg, crit) => this.damagePart(b, pt, dmg, crit));
        if (s.dead) break;
      }
      if (s.dead || s.hit.includes(999)) continue;
      const rr = b.r + sr;
      if ((b.x - s.x) ** 2 + (b.z - s.z) ** 2 <= rr * rr) this.shotHits(s, 999, b.x, b.z, (dmg, crit) => this.damageBoss(b, dmg, crit));
    }
    if (!p.alive) return;
    // enemy bullets
    const bubble = this.shieldT > 0;
    for (const s of this.ebullets) {
      if (s.dead) continue;
      const d2 = (s.x - p.x) ** 2 + (s.z - p.z) ** 2;
      if (bubble && d2 < (BUBBLE_R + s.r) ** 2) {
        s.dead = true;
        this.events.push({ type: 'deflect', x: s.x, z: s.z });
        continue;
      }
      if (this.novaT > 0) { s.dead = true; continue; }
      const rr = PLAYER_R * this.stats.hitK + s.r;
      if (d2 < rr * rr) {
        s.dead = true;
        this.hurt(this.bulletDmg * (s.kind === 'big' ? 1.5 : 1));
      } else if (this.stats.reflex && this.reflexCd <= 0 && d2 < 1.1 * 1.1 && p.inv <= 0) {
        // a near miss: the Reflex card slows the world down
        this.slowT = 1.6;
        this.reflexCd = 9;
        this.events.push({ type: 'reflex' });
      }
    }
    // bodies
    for (const e of this.enemies) {
      if (e.dead) continue;
      const rr = (bubble ? BUBBLE_R : 0.5) + e.r * 0.8;
      if ((e.x - p.x) ** 2 + (e.z - p.z) ** 2 > rr * rr) continue;
      this.damage(e, bubble ? 200 : 90, false);
      if (!bubble) this.hurt(this.tune.contactDmg * (1 + 0.1 * this.diff));
    }
    if (b && !b.dead && !bubble) {
      const rr = b.r * 0.9 + 0.4;
      if ((b.x - p.x) ** 2 + (b.z - p.z) ** 2 < rr * rr) this.hurt(this.tune.contactDmg);
    }
  }

  /** A shot meets something: damage, then chain lightning, pierce or a ricochet. */
  private shotHits(s: PBullet, id: number, x: number, z: number, apply: (dmg: number, crit: boolean) => void): void {
    s.hit.push(id);
    const st = this.stats;
    apply(s.dmg, s.crit);
    if (s.kind === 'missile') {
      // a small blast around the missile
      for (const e of this.enemies) {
        if (e.dead || e.id === id) continue;
        if ((e.x - x) ** 2 + (e.z - z) ** 2 < 1.4 * 1.4) this.damage(e, s.dmg * 0.5, false);
      }
      if (st.storm) this.chain(id, x, z, s.dmg * 0.6, st.chainN + 1);
      s.dead = true;
      return;
    }
    if (st.chainChance > 0 && this.rnd() < st.chainChance) this.chain(id, x, z, s.dmg * 0.7, st.chainN);
    if (s.pierce > 0) { s.pierce--; return; }
    if (s.bounces < st.ricochet) {
      const tgt = this.nearestTarget(x, z, 7, s.hit);
      if (tgt) {
        s.bounces++;
        const dx = tgt.x - s.x, dz = tgt.z - s.z, l = Math.hypot(dx, dz) || 1;
        const sp = Math.hypot(s.vx, s.vz);
        s.vx = (dx / l) * sp;
        s.vz = (dz / l) * sp;
        if (st.trickShot && !s.crit) { s.crit = true; s.dmg *= 2; }
        return;
      }
    }
    s.dead = true;
  }

  private chain(fromId: number, x: number, z: number, dmg: number, n: number): void {
    const pts = [{ x, z }];
    const skip = [fromId];
    let cx = x, cz = z;
    for (let i = 0; i < n; i++) {
      const t = this.nearestTarget(cx, cz, 5, skip);
      if (!t) break;
      skip.push(t.id);
      pts.push({ x: t.x, z: t.z });
      cx = t.x; cz = t.z;
      if (t.id === 999 && this.boss) this.damageBoss(this.boss, dmg, false);
      else if (t.id >= 1000 && this.boss) { const pt = this.boss.parts[t.id - 1000]; if (pt) this.damagePart(this.boss, pt, dmg, false); }
      else { const e = this.enemies.find((q) => q.id === t.id); if (e) this.damage(e, dmg, false); }
    }
    if (pts.length > 1) this.events.push({ type: 'chain', pts });
  }

  damage(e: Enemy, dmg: number, crit: boolean, bomb = false): void {
    if (e.dead) return;
    e.hp -= dmg;
    e.flash = 1;
    if (!bomb) this.events.push({ type: 'hit', x: e.x, z: e.z, crit, dmg, armour: false });
    if (e.hp <= 0) this.kill(e);
  }

  private kill(e: Enemy): void {
    e.dead = true;
    const def = ENEMIES[e.kind];
    const sc = Math.round(def.score * this.scoreMul);
    this.score += sc;
    this.run.kills++;
    this.dropCoins(e.x, e.z, def.coins);
    if (this.rnd() < def.drop * this.tune.dropK) this.drop(e.x, e.z, this.rollPickup());
    this.events.push({ type: 'kill', e, score: sc });
  }

  private rollPickup(): PickupKind {
    const p = this.player;
    const hurt = p.hull < p.maxHull * 0.7;
    const opts: [PickupKind, number][] = [
      ['repair', hurt ? 40 : 14], ['cell', this.stats.shieldMax > 0 ? 22 : 0], ['charge', 22], ['boost', 26],
    ];
    const total = opts.reduce((s, o) => s + o[1], 0);
    let x = this.rnd() * total;
    for (const [k, w] of opts) { x -= w; if (x <= 0) return k; }
    return 'boost';
  }

  private dropCoins(x: number, z: number, n: number): void {
    for (let i = 0; i < n; i++) this.drop(x + (this.rnd() - 0.5) * 0.6, z + (this.rnd() - 0.5) * 0.6, 'credit');
  }

  private drop(x: number, z: number, kind: PickupKind): void {
    const a = this.rnd() * Math.PI * 2, v = kind === 'credit' ? 1.5 + this.rnd() * 2.5 : 1;
    this.pickups.push({ kind, x, z, vx: Math.cos(a) * v, vz: Math.sin(a) * v - 1, t: 0, dead: false, pulled: false });
  }

  private hurt(dmg: number): void {
    const p = this.player;
    if (p.inv > 0 || !p.alive || this.shieldT > 0) return;
    p.calm = 0;
    this.waveHurt = true;
    let rest = dmg;
    let absorbed = false;
    if (p.shield > 0) {
      const a = Math.min(p.shield, rest);
      p.shield -= a;
      rest -= a;
      absorbed = true;
    }
    p.hull -= rest;
    this.run.damageTaken += rest;
    p.inv = rest > 0 ? 1.0 : 0.35;
    this.events.push({ type: 'hurt', dmg: rest, shield: absorbed && rest <= 0, x: p.x, z: p.z });
    if (p.hull <= 0) {
      if (this.phoenix > 0) {
        this.phoenix--;
        p.hull = Math.round(p.maxHull * 0.4);
        p.inv = 2.6;
        for (const b of this.ebullets) b.dead = true;
        this.novaT = 1.5;
        this.events.push({ type: 'phoenix' });
        return;
      }
      p.hull = 0;
      p.alive = false;
      this.phase = 'dead';
      this.phaseT = 2.5;
      this.events.push({ type: 'death', x: p.x, z: p.z });
    }
  }

  // ------------------------------------------------------------------ pickups

  private pickupsStep(dt: number): void {
    const p = this.player;
    const mag = this.stats.magnet * (this.phase === 'clear' || this.phase === 'bossDeath' ? 4 : 1);
    for (const k of this.pickups) {
      if (k.dead) continue;
      k.t += dt;
      const dx = p.x - k.x, dz = p.z - k.z, d = Math.hypot(dx, dz);
      if (p.alive && (d < mag || k.pulled)) {
        k.pulled = true;
        const v = 6 + k.t * 5;
        k.vx = (dx / (d || 1)) * v;
        k.vz = (dz / (d || 1)) * v;
      } else {
        k.vx *= 1 - 2.2 * dt;
        k.vz += (1.7 - k.vz) * Math.min(1, dt * 1.5);
      }
      k.x += k.vx * dt;
      k.z += k.vz * dt;
      if (p.alive && d < 0.7) this.collect(k);
      else if (k.z > FIELD.bottom + 1) k.dead = true;
    }
  }

  private collect(k: Pickup): void {
    k.dead = true;
    const p = this.player, s = this.stats;
    let value = 0;
    switch (k.kind) {
      case 'credit':
        value = 5 * s.creditK;
        this.credits += value;
        this.run.creditsEarned += value;
        this.score += 10;
        if (s.siphon) p.shield = Math.min(s.shieldMax, p.shield + 3);
        break;
      case 'repair': value = 12; p.hull = Math.min(p.maxHull, p.hull + value); break;
      case 'cell': value = 25; p.shield = Math.min(s.shieldMax, p.shield + value); p.hull = Math.min(p.maxHull, p.hull + 6); break;
      case 'charge': for (const id of POWER_IDS) this.powers[id].cd = Math.max(0, this.powers[id].cd - 7); break;
      case 'boost': this.boostT = 8; break;
    }
    this.events.push({ type: 'pickup', kind: k.kind, x: k.x, z: k.z, value });
  }

  // ------------------------------------------------------------------ phases

  private phases(dt: number): void {
    this.phaseT -= dt;
    switch (this.phase) {
      case 'intro':
        if (this.phaseT <= 0) this.startWave(0);
        break;
      case 'wave':
        if (!this.queue.length && !this.enemies.some((e) => !e.dead)) {
          this.run.wavesCleared++;
          const bonus = Math.round(300 * this.scoreMul) + (this.waveHurt ? 0 : Math.round(500 * this.scoreMul));
          this.score += bonus;
          this.events.push({ type: 'clear', flawless: !this.waveHurt, bonus });
          this.phase = 'clear';
          this.phaseT = TIMES.clear;
          this.addOffer(this.roll(), 'wave');
        }
        break;
      case 'clear':
        if (this.phaseT <= 0) {
          // the clear phase pulled every coin in; what is left is picked up now
          for (const k of this.pickups) if (!k.dead) this.collect(k);
          if (this.waveIx + 1 < this.wavesInSector) this.startWave(this.waveIx + 1);
          else { this.phase = 'warning'; this.phaseT = TIMES.warning; this.events.push({ type: 'warning' }); }
        }
        break;
      case 'warning':
        if (this.phaseT <= 0) this.spawnBoss();
        break;
      case 'bossDeath':
        if (this.phaseT <= 0) {
          for (const k of this.pickups) if (!k.dead) this.collect(k);
          this.addOffer(this.roll(), 'boss');
          this.phase = 'warp';
          this.phaseT = TIMES.warp;
          this.events.push({ type: 'warp' });
        }
        break;
      case 'warp':
        if (this.phaseT <= 0) {
          this.sector++;
          this.waveIx = 0;
          this.boss = null;
          this.phase = 'intro';
          this.phaseT = TIMES.intro;
          this.player.z = Math.max(this.player.z, FIELD.home);
          this.events.push({ type: 'sector', n: this.sector });
        }
        break;
    }
  }

  /** A cleared wave or a downed boss earns a card offer; the run goes on without waiting for it. */
  private addOffer(cards: CardId[], from: 'wave' | 'boss', front = false): Offer {
    const offer: Offer = {
      id: ++this.offerId, cards, from, n: from === 'wave' ? this.waveIx + 1 : this.sector + 1,
      rerolls: 0, free: this.talents.freeRerolls,
    };
    if (front) this.offers.unshift(offer); else this.offers.push(offer);
    this.events.push({ type: 'offer', offer });
    return offer;
  }

  private roll(exclude: CardId[] = [], n = this.talents.draftN): CardId[] {
    const p = this.player;
    return rollDraft(this.stacks, n, this.talents.luck, p.hull >= p.maxHull * 0.8, this.rnd, exclude);
  }

  /** Credits a reroll of offer `i` costs now (0 when a free one is left). */
  rerollCost(i = 0): number {
    const o = this.offers[i];
    if (!o) return 0;
    return o.free > 0 ? 0 : 40 + 30 * o.rerolls;
  }

  canReroll(i = 0): boolean { return !!this.offers[i] && this.player.alive && this.credits >= this.rerollCost(i); }

  /** Rolls offer `i` again (credits, or a free reroll); false when the player cannot afford it. */
  reroll(i = 0): boolean {
    if (!this.canReroll(i)) return false;
    const o = this.offers[i];
    if (o.free > 0) o.free--;
    else { this.credits -= this.rerollCost(i); o.rerolls++; }
    o.cards = this.roll();
    return true;
  }

  /** Takes card `id` from offer `i`: its effect applies at once and the offer is used up. */
  take(i: number, id: CardId): boolean {
    const o = this.offers[i];
    if (!o || !o.cards.includes(id) || !this.player.alive) return false;
    this.offers.splice(i, 1);
    this.apply(id);
    this.refreshOffers();
    return true;
  }

  /** The autopilot and the balance run: every waiting offer is taken at once. */
  takeAll(choose: (cards: CardId[]) => CardId): void {
    while (this.offers.length) if (!this.take(0, choose(this.offers[0].cards))) this.offers.shift();
  }

  /**
   * A banked offer may hold a card that a later pick maxed out: that card is swapped for another
   * one (and an offer left with nothing to give is dropped).
   */
  private refreshOffers(): void {
    for (const o of this.offers) {
      for (let k = 0; k < o.cards.length; k++) {
        if (offerable(this.stacks, o.cards[k], false)) continue;
        const next = this.roll(o.cards, 1)[0];
        if (next) o.cards[k] = next; else { o.cards.splice(k, 1); k--; }
      }
    }
    this.offers = this.offers.filter((o) => o.cards.length > 0);
  }

  /** Adds a card's effect (also used by the tests to set up a ship). */
  apply(id: CardId): void {
    const p = this.player;
    this.stacks[id] = (this.stacks[id] ?? 0) + 1;
    if (id !== 'repair' && !this.cardOrder.includes(id)) this.cardOrder.push(id);
    this.run.cards++;
    const before = this.stats.shieldMax;
    this.stats = shipStats(this.stacks, this.talents);
    const maxHull = this.tune.hull + this.stats.hullBonus;
    p.hull += maxHull - p.maxHull;
    p.maxHull = maxHull;
    if (this.stats.shieldMax > before) p.shield += this.stats.shieldMax - before;
    if (id === 'repair') p.hull = Math.min(p.maxHull, p.hull + p.maxHull * 0.45);
    if (id === 'phoenix') this.phoenix++;
    this.events.push({ type: 'card', id });
  }

  stack(id: CardId): number { return this.stacks[id] ?? 0; }

  private compact(): void {
    if (this.enemies.some((e) => e.dead)) this.enemies = this.enemies.filter((e) => !e.dead);
    if (this.ebullets.some((b) => b.dead)) this.ebullets = this.ebullets.filter((b) => !b.dead);
    if (this.pbullets.some((b) => b.dead)) this.pbullets = this.pbullets.filter((b) => !b.dead);
    if (this.pickups.some((b) => b.dead)) this.pickups = this.pickups.filter((b) => !b.dead);
  }

  // ------------------------------------------------------------------ test hooks

  /** Jumps to a sector's boss (tests and the store art). */
  skipToBoss(): void {
    this.queue = [];
    for (const e of this.enemies) e.dead = true;
    this.waveIx = this.wavesInSector - 1;
    this.phase = 'warning';
    this.phaseT = 0.5;
    this.events.push({ type: 'warning' });
  }

  /** Puts an offer with the given cards at the front of the queue (tests and the store art). */
  forceOffer(cards: CardId[]): Offer {
    return this.addOffer(cards.filter((c) => CARD[c]), this.boss ? 'boss' : 'wave', true);
  }

  /** Gives the ship a moment without damage (the card bar opening or closing). */
  grace(s: number): void { if (this.player.alive) this.player.inv = Math.max(this.player.inv, s); }
}

// ------------------------------------------------------------------ wave builder

interface Group { cost: number; min: number; minWave?: number; w: (sim: Sim) => number; build: (sim: Sim, t: number, out: Spawn[]) => number }

const r = (sim: Sim, a: number, b: number) => a + sim.rnd() * (b - a);

/** The formations a wave is made of; `build` returns how long the group takes to come in. */
const GROUPS: Group[] = [
  { // a V of scouts diving straight down
    cost: 4, min: 0, w: () => 3,
    build: (sim, t, out) => {
      const c = r(sim, -2, 2), n = 5;
      for (let i = 0; i < n; i++) {
        const k = i - (n - 1) / 2;
        out.push({ t: t + Math.abs(k) * 0.18, kind: 'scout', beh: 'dive', x: c + k * 1.2, z: FIELD.top, p: { speed: 5.2, amp: 0 } });
      }
      return 1.2;
    },
  },
  { // a snake of scouts weaving down
    cost: 5, min: 0, w: () => 3,
    build: (sim, t, out) => {
      const c = r(sim, -1.5, 1.5), ph = sim.rnd() * 6;
      for (let i = 0; i < 6; i++) out.push({ t: t + i * 0.32, kind: 'scout', beh: 'dive', x: c, z: FIELD.top, p: { speed: 5, amp: 2.4, freq: 1.5, phase: ph } });
      return 2;
    },
  },
  { // a line of scouts sweeping across
    cost: 5, min: 0, w: () => 2.5,
    build: (sim, t, out) => {
      const side = sim.rnd() < 0.5 ? -1 : 1, z0 = r(sim, -19, -14);
      for (let i = 0; i < 5; i++) out.push({ t: t + i * 0.3, kind: 'scout', beh: 'swoop', x: side * 7.5, z: z0, p: { side, speed: 6, z0, x0: side * 7.5 } });
      return 1.8;
    },
  },
  { // two fighters take positions and fire fans
    cost: 6, min: 0, minWave: 1, w: () => 2.5,
    build: (sim, t, out) => {
      const z = r(sim, -15, -12);
      for (const s of [-1, 1]) out.push({ t: t + (s > 0 ? 0.4 : 0), kind: 'fighter', beh: 'hold', x: s * 3, z: FIELD.top, p: { tx: s * r(sim, 1.6, 3), tz: z, amp: 1, freq: 0.9, stay: 7 } });
      return 2.5;
    },
  },
  { // three fighters in a wedge
    cost: 9, min: 1, w: () => 2,
    build: (sim, t, out) => {
      const slots = [[-2.8, -12.5], [0, -14.5], [2.8, -12.5]];
      slots.forEach(([x, z], i) => out.push({ t: t + i * 0.3, kind: 'fighter', beh: 'hold', x, z: FIELD.top, p: { tx: x, tz: z, amp: 0.8, freq: 1, stay: 8 } }));
      return 3;
    },
  },
  { // strikers lock on and ram
    cost: 6, min: 0, minWave: 2, w: () => 2,
    build: (sim, t, out) => {
      const n = sim.sector >= 2 ? 3 : 2;
      for (let i = 0; i < n; i++) {
        const x = (i - (n - 1) / 2) * 2.6;
        out.push({ t: t + i * 0.7, kind: 'striker', beh: 'kamikaze', x, z: FIELD.top, p: { tx: x + r(sim, -0.5, 0.5), tz: r(sim, -16, -13) } });
      }
      return 2.5;
    },
  },
  { // a gunship with an escort
    cost: 9, min: 0, minWave: 2, w: () => 1.6,
    build: (sim, t, out) => {
      const x = r(sim, -1.5, 1.5);
      out.push({ t, kind: 'gunship', beh: 'hold', x, z: FIELD.top, p: { tx: x, tz: -15, amp: 1.6, freq: 0.6, stay: 9 } });
      for (const s of [-1, 1]) out.push({ t: t + 1, kind: 'scout', beh: 'dive', x: x + s * 2.5, z: FIELD.top, p: { speed: 4.6, amp: 0.8, freq: 1.4 } });
      return 4;
    },
  },
  { // a bomber laying mines on its way down
    cost: 9, min: 1, w: () => 1.6,
    build: (sim, t, out) => {
      const x = r(sim, -2.5, 2.5);
      out.push({ t, kind: 'bomber', beh: 'dive', x, z: FIELD.top, p: { speed: 1.5, amp: 1.5, freq: 0.5 } });
      return 4;
    },
  },
  { // a carrier: spirals and a launch bay
    cost: 14, min: 2, minWave: 1, w: () => 1.2,
    build: (sim, t, out) => {
      out.push({ t, kind: 'carrier', beh: 'hold', x: 0, z: FIELD.top, p: { tx: r(sim, -1, 1), tz: -16, amp: 1.8, freq: 0.45, stay: 13, phase: 1 } });
      return 6;
    },
  },
  { // an asteroid shower (crystal rocks drop many credits)
    cost: 5, min: 0, w: (sim) => 1.4 * sim.sectorDef.rocks,
    build: (sim, t, out) => {
      const n = 4 + Math.floor(sim.rnd() * 3);
      for (let i = 0; i < n; i++) {
        const x = r(sim, -4.2, 4.2);
        out.push({
          t: t + i * r(sim, 0.35, 0.7), kind: sim.rnd() < 0.22 ? 'crystal' : 'rock', beh: 'drift', x, z: FIELD.top,
          p: { vx: r(sim, -0.6, 0.6) - x * 0.05, vz: r(sim, 2.6, 4.2) },
        });
      }
      return 2.2;
    },
  },
];

function buildWave(sim: Sim, ix: number): Spawn[] {
  const out: Spawn[] = [];
  const s = sim.sector * sim.tune.ramp;
  let budget = 11 + 4 * ix + 5.5 * s;
  let t = 0.6;
  const gap = Math.max(1.1, 2.6 - 0.22 * s);
  let first = true;
  while (budget > 0) {
    const ok = GROUPS.filter((g) => g.min <= sim.sector && (g.minWave ?? 0) <= ix + (sim.sector > 0 ? 2 : 0) && (g.cost <= budget + 3 || first));
    if (!ok.length) break;
    const total = ok.reduce((a, g) => a + g.w(sim), 0);
    let x = sim.rnd() * total;
    let g = ok[0];
    for (const q of ok) { x -= q.w(sim); if (x <= 0) { g = q; break; } }
    const len = g.build(sim, t, out);
    t += len + gap * (0.8 + sim.rnd() * 0.4);
    budget -= g.cost;
    first = false;
  }
  return out.sort((a, b) => a.t - b.t);
}

export { POWER_IDS };
export type { PowerId, EnemyKind, BossKind, PickupKind, CardId };
