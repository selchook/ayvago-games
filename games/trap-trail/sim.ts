// Trap Trail: the stage simulation. Deterministic at a fixed 60 Hz step (DT), no three.js: the view
// reads its state and the events it leaves each step. The hero is a box (HERO_R wide both ways,
// HERO_H tall) moved axis by axis against the solids (islands, bridges, models, moving floes,
// doors); the hazards are simple shapes tested against the hero's body.
//
// Feel: coyote time and a jump buffer (TUNING), a variable jump (letting go early cuts the rise),
// an air jump (upgrade or Spring), a dash that hangs in the air, ice that slides, springs, and
// knock-back with a short invulnerability on a hit. A fall off the course costs a heart and puts
// the hero back on the last checkpoint.
import {
  MOVE, HERO_R, HERO_H, TUNING, THUNDER_SPEED, MAGNET_RANGE, SPRING_JUMP, POWER_TIME, GEM_POINTS, SCORE,
  dashCooldown, airDashes, dashShield, magnetRange, thunderTime, airJumps, type Tuning, type Ranks, type PowerId, type GemKind,
} from './defs';
import type { Course, Solid, Box, Pickup, Bomb, Foe, FoeKind } from './course';

export interface Input {
  /** Wanted direction on the ground plane (x right, z towards the camera), length 0..1. */
  mx: number;
  mz: number;
  jump: boolean;
  jumpPressed: boolean;
  dashPressed: boolean;
}
export const NO_INPUT: Input = { mx: 0, mz: 0, jump: false, jumpPressed: false, dashPressed: false };

export type SimEvent =
  | { e: 'jump' | 'airjump' | 'dash' | 'bounce' | 'respawn' | 'checkpoint' | 'lever' | 'door' | 'goal' | 'shieldPop' | 'needKey' | 'crumble' | 'trapUp' | 'fire' | 'boom' | 'fuse' | 'roll' | 'drop' | 'die' | 'fall' | 'hurt' | 'break' | 'chest' | 'powerEnd'; x: number; y: number; z: number; n?: number }
  | { e: 'land'; x: number; y: number; z: number; v: number }
  | { e: 'pickup'; x: number; y: number; z: number; p: Pickup }
  | { e: 'stomp' | 'smash' | 'foeAlert' | 'foeHop' | 'foeSwoop'; x: number; y: number; z: number; kind: FoeKind }
  | { e: 'bump'; x: number; y: number; z: number; used: boolean };

export const CRUMBLE_TIME = 0.55;

/** Each enemy's body (radius, height), the half-hearts its touch costs, its score when beaten. */
export const FOE: Record<FoeKind, { r: number; h: number; dmg: number; points: number }> = {
  crab: { r: 0.55, h: 0.75, dmg: 1, points: 150 },
  skull: { r: 0.45, h: 0.72, dmg: 1, points: 200 },
  gob: { r: 0.55, h: 0.82, dmg: 2, points: 250 },
  bee: { r: 0.5, h: 0.8, dmg: 1, points: 250 },
};

export class Hero {
  x = 0; y = 0; z = 0;
  vx = 0; vy = 0; vz = 0;
  /** Facing angle (0 faces -z, the way of the course). */
  yaw = 0;
  ground: Solid | null = null;
  coyote = 0;
  buffer = 0;
  /** The jump in progress may still be cut short. */
  rising = false;
  airJumps = 0;
  airDashes = 0;
  dashT = 0;
  dashCd = 0;
  dashX = 0; dashZ = 0;
  hurtT = 0;
  /** Half-hearts. */
  hp = 6;
  max = 6;
  shield = false;
  powers: Record<PowerId, number> = { thunder: 0, shield: 0, magnet: 0, spring: 0 };
  keys = 0;
  state: 'play' | 'fall' | 'dead' | 'goal' = 'play';
  stateT = 0;
  /** For the view: how fast it last landed, time on the ground, time since a jump. */
  landV = 0;
  airT = 0;
  onIce = false;
  get speed(): number { return Math.hypot(this.vx, this.vz); }
}

export interface Stats { coins: number; gems: number; gemPoints: number; stars: boolean[]; hits: number; falls: number; chests: number; foes: number; time: number }

export class Sim {
  readonly hero = new Hero();
  readonly tune: Tuning;
  events: SimEvent[] = [];
  time = 0;
  /** The stage clock (stops at the goal). */
  clock = 0;
  checkpoint = -1;
  stats: Stats = { coins: 0, gems: 0, gemPoints: 0, stars: [false, false, false], hits: 0, falls: 0, chests: 0, foes: 0, time: 0 };
  /** Test hook: no damage, no falls cost. */
  god = false;
  /** Points scored this stage while playing (coins, gems; stars and clear bonus are added at the goal). */
  points = 0;

  constructor(readonly c: Course, readonly ranks: Ranks, easy: boolean, readonly startShield: boolean) {
    this.tune = TUNING[easy ? 'easy' : 'normal'];
    const h = this.hero;
    h.max = this.tune.hp + ranks.heart * 2;
    h.hp = h.max;
    h.shield = startShield;
    this.place(c.start.x, c.start.y, c.start.z);
  }

  private place(x: number, y: number, z: number): void {
    const h = this.hero;
    h.x = x; h.y = y + 0.02; h.z = z;
    h.vx = h.vy = h.vz = 0;
    h.yaw = 0;
    h.ground = null;
    h.dashT = 0;
    h.rising = false;
  }

  private ev(e: SimEvent['e'], x: number, y: number, z: number, n?: number): void { this.events.push({ e, x, y, z, n } as SimEvent); }

  /** The respawn point: the last checkpoint, else the start. */
  spawnPoint(): { x: number; y: number; z: number } {
    const cp = this.c.checkpoints[this.checkpoint];
    return cp ? { x: cp.x, y: cp.y, z: cp.z + 1.2 } : this.c.start;
  }

  // ---------------------------------------------------------------- the step

  step(dt: number, inp: Input): void {
    this.time += dt;
    const h = this.hero;
    if (h.state === 'play') this.clock += dt;
    this.moveWorld(dt);
    if (h.state === 'play') this.moveHero(dt, inp);
    else if (h.state === 'fall') {
      h.stateT -= dt;
      h.vy -= MOVE.gravity * dt; h.y += h.vy * dt;
      if (h.stateT <= 0) this.respawn();
    } else if (h.state === 'goal') {
      h.stateT += dt;
      h.vx *= 0.8; h.vz *= 0.8;
    }
    this.hazards(dt);
    this.pickups(dt);
    if (h.state === 'play') this.triggers();
    for (const p of Object.keys(h.powers) as PowerId[]) {
      if (p === 'shield' || h.powers[p] <= 0) continue;
      h.powers[p] = Math.max(0, h.powers[p] - dt);
      if (h.powers[p] === 0) this.ev('powerEnd', h.x, h.y, h.z);
    }
    h.hurtT = Math.max(0, h.hurtT - dt);
  }

  // ---------------------------------------------------------------- the moving world

  private moveWorld(dt: number): void {
    const t = this.time, pace = this.tune.pace;
    for (const m of this.c.movers) {
      const k = Math.sin((t * pace * Math.PI * 2) / m.period + m.phase);
      const b = m.solid.b, r = m.rest;
      const nx = r.x0 + m.ax * k, ny = r.y0 + m.ay * k, nz = r.z0 + m.az * k;
      m.solid.dx = nx - b.x0; m.solid.dy = ny - b.y0; m.solid.dz = nz - b.z0;
      shift(b, m.solid.dx, m.solid.dy, m.solid.dz);
    }
    for (const c of this.c.crumbles) {
      const s = c.solid;
      s.dx = s.dy = s.dz = 0;
      if (c.state === 'shake') {
        c.stand += dt;
        if (c.stand >= CRUMBLE_TIME) { c.state = 'fall'; c.vy = 0; c.back = 3.2; s.off = true; this.ev('crumble', (s.b.x0 + s.b.x1) / 2, s.b.y1, (s.b.z0 + s.b.z1) / 2); }
      } else if (c.state === 'fall') {
        c.vy -= MOVE.gravity * 0.6 * dt;
        c.fallY += c.vy * dt;
        c.back -= dt;
        if (c.back <= 0 && !this.heroOver(c.rest)) { c.state = 'idle'; c.stand = 0; c.fallY = 0; s.off = false; }
      }
    }
    for (const d of this.c.doors) {
      if (!d.opening || d.open >= 1) continue;
      d.open = Math.min(1, d.open + dt / 0.9);
      if (d.open > 0.55) d.panel.off = true;
    }
    for (const b of this.c.bouncers) b.squash = Math.max(0, b.squash - dt * 3.5);
  }

  private heroOver(b: Box): boolean {
    const h = this.hero;
    return h.x + HERO_R > b.x0 - 0.3 && h.x - HERO_R < b.x1 + 0.3 && h.z + HERO_R > b.z0 - 0.3 && h.z - HERO_R < b.z1 + 0.3 && h.y < b.y1 + 2 && h.y > b.y0 - 1;
  }

  // ---------------------------------------------------------------- the hero

  private moveHero(dt: number, inp: Input): void {
    const h = this.hero, T = this.tune, R = this.ranks;
    const thunder = h.powers.thunder > 0, spring = h.powers.spring > 0;
    h.dashCd = Math.max(0, h.dashCd - dt);
    // carried by what it stands on
    if (h.ground && !h.ground.off) { h.x += h.ground.dx; h.y += h.ground.dy; h.z += h.ground.dz; }
    // the wanted direction
    let mx = inp.mx, mz = inp.mz;
    const ml = Math.hypot(mx, mz);
    if (ml > 1) { mx /= ml; mz /= ml; }
    if (ml > 0.15) h.yaw = Math.atan2(-mx, -mz);
    const grounded = !!h.ground;
    h.onIce = grounded && h.ground!.surf === 'ice';
    // timers
    h.coyote = grounded ? T.coyote : Math.max(0, h.coyote - dt);
    h.buffer = inp.jumpPressed ? T.buffer : Math.max(0, h.buffer - dt);
    if (grounded) { h.airJumps = airJumps(R) + (spring ? 1 : 0); h.airDashes = airDashes(R); h.airT = 0; }
    else h.airT += dt;
    // dash
    if (inp.dashPressed && h.dashCd <= 0 && h.dashT <= 0 && (grounded || h.airDashes > 0)) {
      if (!grounded) h.airDashes--;
      let dx = mx, dz = mz;
      if (Math.hypot(dx, dz) < 0.2) { dx = -Math.sin(h.yaw); dz = -Math.cos(h.yaw); }
      const l = Math.hypot(dx, dz) || 1;
      h.dashX = dx / l; h.dashZ = dz / l;
      h.dashT = MOVE.dashTime;
      h.dashCd = dashCooldown(R);
      h.vy = Math.max(0, h.vy) * 0.2;
      h.rising = false;
      this.ev('dash', h.x, h.y, h.z);
    }
    const speed = MOVE.run * (thunder ? THUNDER_SPEED : 1);
    if (h.dashT > 0) {
      h.dashT -= dt;
      const ds = MOVE.dashSpeed * (thunder ? 1.2 : 1);
      h.vx = h.dashX * ds; h.vz = h.dashZ * ds; h.vy = 0;
      if (h.dashT <= 0) { h.vx *= 0.45; h.vz *= 0.45; }
    } else {
      const tx = mx * speed, tz = mz * speed;
      const acc = grounded ? (h.onIce ? MOVE.accIce : MOVE.accGround) : MOVE.accAir;
      const dec = grounded ? (h.onIce ? MOVE.decIce : MOVE.decGround) : MOVE.accAir * 0.5;
      const rate = ml > 0.1 ? acc : dec;
      h.vx = approach(h.vx, tx, rate * dt);
      h.vz = approach(h.vz, tz, rate * dt);
      // jump: buffered press, coyote time, then the air jumps
      if (h.buffer > 0) {
        const boost = spring ? SPRING_JUMP : 1;
        if (h.coyote > 0) {
          h.vy = MOVE.jump * boost; h.coyote = 0; h.buffer = 0; h.rising = true; h.ground = null;
          this.ev('jump', h.x, h.y, h.z);
        } else if (h.airJumps > 0) {
          h.airJumps--; h.vy = MOVE.airJump * boost; h.buffer = 0; h.rising = true;
          this.ev('airjump', h.x, h.y, h.z);
        }
      }
      if (h.rising && !inp.jump && h.vy > 0) { h.vy *= MOVE.jumpCut; h.rising = false; }
      if (h.vy <= 0) h.rising = false;
      h.vy -= MOVE.gravity * (h.vy < 0 ? MOVE.fallGravity : 1) * dt;
      if (h.vy < -MOVE.maxFall) h.vy = -MOVE.maxFall;
    }
    this.collide(dt);
    // fell off the course
    if (h.y < this.c.floor - MOVE.voidDepth) this.fall();
  }

  /** Moves the hero axis by axis; steps up low ledges; lands and bumps its head. */
  private collide(dt: number): void {
    const h = this.hero;
    const wasGround = h.ground;
    const vyBefore = h.vy;
    for (const axis of ['x', 'z'] as const) {
      const d = (axis === 'x' ? h.vx : h.vz) * dt;
      if (!d) continue;
      if (axis === 'x') h.x += d; else h.z += d;
      for (const s of this.c.solids) {
        if (s.off || !this.overlap(s.b)) continue;
        // a low ledge: step onto it when on the ground (stairs, planks)
        const rise = s.b.y1 - h.y;
        if (rise > 0 && rise <= MOVE.stepUp && wasGround && !this.blockedAbove(s.b.y1)) { h.y = s.b.y1; continue; }
        if (s.bouncer && rise > 0 && rise < 0.9 && wasGround) { h.y = s.b.y1; h.ground = s; this.bounce(s); continue; }
        if (axis === 'x') { h.x = d > 0 ? s.b.x0 - HERO_R - 1e-4 : s.b.x1 + HERO_R + 1e-4; h.vx = 0; }
        else { h.z = d > 0 ? s.b.z0 - HERO_R - 1e-4 : s.b.z1 + HERO_R + 1e-4; h.vz = 0; }
        if (h.dashT > 0) h.dashT = 0;
      }
    }
    h.y += h.vy * dt;
    let landed: Solid | null = null;
    for (const s of this.c.solids) {
      if (s.off || !this.overlap(s.b)) continue;
      if (h.vy <= 0 && h.y - h.vy * dt >= s.b.y1 - 0.3 - Math.max(0, -s.dy)) { h.y = s.b.y1; h.vy = 0; landed = s; }
      else if (h.vy > 0 && h.y + HERO_H - h.vy * dt <= s.b.y0 + 0.05) {
        h.y = s.b.y0 - HERO_H - 1e-3; h.vy = 0; h.rising = false;
        if (s.bonus) this.bump(s.bonus);
      }
    }
    // still on the ground? (walking off an edge leaves it; standing still on it keeps it)
    if (!landed && h.vy <= 0) {
      for (const s of this.c.solids) {
        if (s.off) continue;
        if (h.x + HERO_R > s.b.x0 && h.x - HERO_R < s.b.x1 && h.z + HERO_R > s.b.z0 && h.z - HERO_R < s.b.z1 && Math.abs(h.y - s.b.y1) < 0.05) { landed = s; h.y = s.b.y1; h.vy = 0; break; }
      }
    }
    h.ground = landed;
    if (landed && !wasGround) {
      h.landV = -vyBefore;
      if (-vyBefore > 3) this.ev('land', h.x, h.y, h.z, -vyBefore);
      if (landed.bouncer) this.bounce(landed);
    }
    if (landed?.crumble && landed.crumble.state === 'idle') { landed.crumble.state = 'shake'; landed.crumble.stand = 0; }
  }

  /** A "?" block bumped from below: its coins spring out (once), it bobs every time. */
  private bump(bn: { x: number; y: number; z: number; used: boolean; bump: number; coins: number }): void {
    bn.bump = 1;
    this.events.push({ e: 'bump', x: bn.x, y: bn.y, z: bn.z, used: bn.used });
    if (bn.used) return;
    bn.used = true;
    for (let i = 0; i < bn.coins; i++) this.c.pickups.push({ kind: 'coin', x: bn.x + (i - 2) * 0.3, y: bn.y + 0.9 + (i % 2) * 0.3, z: bn.z, taken: false, pull: true, bob: i });
  }

  private overlap(b: Box): boolean {
    const h = this.hero;
    return h.x + HERO_R > b.x0 && h.x - HERO_R < b.x1 && h.z + HERO_R > b.z0 && h.z - HERO_R < b.z1 && h.y + HERO_H > b.y0 && h.y < b.y1;
  }

  private blockedAbove(top: number): boolean {
    const h = this.hero;
    for (const s of this.c.solids) {
      if (s.off) continue;
      const b = s.b;
      if (h.x + HERO_R > b.x0 && h.x - HERO_R < b.x1 && h.z + HERO_R > b.z0 && h.z - HERO_R < b.z1 && b.y0 < top + HERO_H && b.y1 > top + 0.01) return true;
    }
    return false;
  }

  private bounce(s: Solid): void {
    const h = this.hero, b = s.bouncer!;
    h.vy = MOVE.bounce * (h.powers.spring > 0 ? 1.1 : 1);
    h.ground = null; h.rising = false; h.coyote = 0;
    h.airJumps = airJumps(this.ranks) + (h.powers.spring > 0 ? 1 : 0);
    h.airDashes = airDashes(this.ranks);
    b.squash = 1;
    this.ev('bounce', b.x, b.y, b.z);
  }

  // ---------------------------------------------------------------- hits, falls, respawns

  private get safe(): boolean {
    const h = this.hero;
    return this.god || h.hurtT > 0 || h.powers.thunder > 0 || (h.dashT > 0 && dashShield(this.ranks)) || h.state !== 'play';
  }

  /** A hazard at (x, z) touches the hero for `dmg` half-hearts. Returns true when it hurt or broke. */
  hurt(dmg: number, x: number, z: number): boolean {
    const h = this.hero;
    if (this.safe) return false;
    const away = Math.atan2(h.x - x, h.z - z);
    if (h.shield) {
      h.shield = false;
      h.hurtT = 0.9;
      h.vx = Math.sin(away) * MOVE.knock * 0.6; h.vz = Math.cos(away) * MOVE.knock * 0.6; h.vy = Math.max(h.vy, MOVE.knockUp * 0.6);
      h.ground = null; h.dashT = 0;
      this.ev('shieldPop', h.x, h.y, h.z);
      return true;
    }
    h.hp = Math.max(0, h.hp - dmg);
    this.stats.hits++;
    h.hurtT = MOVE.hurtTime;
    h.vx = Math.sin(away) * MOVE.knock; h.vz = Math.cos(away) * MOVE.knock; h.vy = MOVE.knockUp;
    h.ground = null; h.dashT = 0; h.rising = false;
    this.ev('hurt', h.x, h.y, h.z, dmg);
    if (h.hp <= 0) { h.state = 'dead'; h.stateT = 0; this.ev('die', h.x, h.y, h.z); }
    return true;
  }

  private fall(): void {
    const h = this.hero;
    this.stats.falls++;
    if (!this.god) h.hp = Math.max(0, h.hp - this.tune.fallCost);
    this.ev('fall', h.x, h.y, h.z);
    if (h.hp <= 0) { h.state = 'dead'; h.stateT = 0; this.ev('die', h.x, h.y, h.z); return; }
    h.state = 'fall';
    h.stateT = 0.6;
  }

  respawn(): void {
    const h = this.hero, p = this.spawnPoint();
    this.place(p.x, p.y, p.z);
    h.state = 'play';
    h.hurtT = 1.2;
    if (this.ranks.shield >= 2 && this.startShield) h.shield = true;
    this.ev('respawn', h.x, h.y, h.z);
  }

  /** The rewarded continue: back on the last checkpoint with full health. */
  revive(): void {
    const h = this.hero;
    h.hp = h.max;
    h.powers = { thunder: 0, shield: 0, magnet: 0, spring: 0 };
    this.respawn();
    h.hurtT = 2;
    // clear what was about to hit there
    for (const b of this.c.cannons) b.t = 0;
    for (const r of this.c.rollers) r.logs = [];
    for (const b of this.c.bombs) if (b.state === 'lit' && Math.hypot(b.x - h.x, b.z - h.z) < 6) { b.state = 'gone'; b.back = 4; }
  }

  // ---------------------------------------------------------------- the hazards

  private hazards(dt: number): void {
    const h = this.hero, t = this.time, pace = this.tune.pace;
    const hx = h.x, hz = h.z, hy = h.y + HERO_H * 0.5;
    const alive = h.state === 'play';
    // saws
    for (const s of this.c.saws) {
      const k = (Math.sin((t * pace * Math.PI * 2) / s.period + s.phase) + 1) / 2;
      s.x = s.ax + (s.bx - s.ax) * k; s.y = s.ay + (s.by - s.ay) * k; s.z = s.az + (s.bz - s.az) * k;
      s.spin += dt * 14 * pace;
      if (!alive) continue;
      const thin = s.normal === 'z' ? Math.abs(hz - s.z) : Math.abs(hx - s.x);
      if (thin > HERO_R + 0.1) continue;
      const across = s.normal === 'z' ? hx - s.x : hz - s.z;
      const dy = clamp(s.y, h.y + 0.25, h.y + HERO_H - 0.2) - s.y;
      if (Math.hypot(across, dy) < s.r * 0.86 + HERO_R * 0.6) this.hurt(1, s.x, s.z);
    }
    // spike traps on a rhythm
    for (const s of this.c.traps) {
      const per = s.period, up = s.up, warn = 0.55 * this.tune.warn;
      const tt = (((t * pace + s.offset) % per) + per) % per;
      const prev = s.state;
      s.state = tt > per - up ? 'up' : tt > per - up - warn ? 'warn' : 'down';
      const want = s.state === 'up' ? 1 : s.state === 'warn' ? 0.16 : 0;
      s.lift += (want - s.lift) * Math.min(1, dt * (s.state === 'up' ? 30 : 10));
      if (s.state === 'up' && prev !== 'up' && Math.hypot(s.x - hx, s.z - hz) < 9) this.ev('trapUp', s.x, s.y, s.z);
      if (alive && s.lift > 0.6 && Math.abs(hx - s.x) < s.half + HERO_R * 0.4 && Math.abs(hz - s.z) < s.half + HERO_R * 0.4 && h.y < s.y + 0.7) this.hurt(1, s.x, s.z);
    }
    // fixed spikes and spinning columns
    if (alive) {
      for (const s of this.c.spikes) if (Math.hypot(hx - s.x, hz - s.z) < s.r + HERO_R * 0.7 && h.y < s.y + s.h * 0.85 && h.y + HERO_H > s.y) this.hurt(1, s.x, s.z);
      for (const p of this.c.pillars) if (Math.hypot(hx - p.x, hz - p.z) < p.r + HERO_R + 0.05 && h.y < p.y + p.h && h.y + HERO_H > p.y) this.hurt(1, p.x, p.z);
    }
    for (const p of this.c.pillars) p.spin += dt * 2.2 * pace;
    // rolling logs
    for (const r of this.c.rollers) {
      r.t += dt * pace;
      const every = r.every * this.tune.fireGap;
      if (r.t >= every + r.offset) { r.t = r.offset > 0 ? 0 : 0; r.offset = 0; r.logs.push({ z: r.z0, y: r.y, vy: 0, spin: 0 }); this.ev('roll', r.x, r.y, r.z0); }
      for (const l of r.logs) {
        l.z += r.speed * pace * dt;
        l.spin += (r.speed * pace * dt) / r.r;
        if (l.z > r.z1) { l.vy -= MOVE.gravity * dt; l.y += l.vy * dt; }
        if (alive && Math.abs(hx - r.x) < r.len / 2 + HERO_R && Math.abs(hz - l.z) < r.r + HERO_R * 0.8 && h.y < l.y + r.r * 1.75 && h.y + HERO_H > l.y) {
          if (h.powers.thunder > 0) { l.y = -999; this.ev('break', r.x, l.y + r.r, l.z); }
          else this.hurt(2, r.x, l.z - 1);
        }
      }
      r.logs = r.logs.filter((l) => l.y > r.y - 30);
    }
    // cannons and their balls
    for (const c of this.c.cannons) {
      c.t += dt * pace;
      const every = c.every * this.tune.fireGap;
      const until = every - ((c.t + c.offset) % every);
      c.charge = until < 0.8 ? 1 - until / 0.8 : 0;
      c.recoil = Math.max(0, c.recoil - dt * 3);
      if (((c.t + c.offset) % every) < dt * pace && c.t > 0.3) {
        const dx = Math.sin(c.yaw), dz = Math.cos(c.yaw);
        this.c.balls.push({ x: c.x + dx * 1.3, y: c.y + 0.85, z: c.z + dz * 1.3, vx: dx * c.speed * pace, vy: 0, vz: dz * c.speed * pace, life: c.range / c.speed, dead: false });
        c.recoil = 1;
        this.ev('fire', c.x, c.y + 0.6, c.z);
      }
    }
    for (const b of this.c.balls) {
      b.x += b.vx * dt; b.z += b.vz * dt;
      b.life -= dt;
      if (b.life < 0) { b.vy -= MOVE.gravity * dt; b.y += b.vy * dt; }
      if (b.y < this.c.floor - 20) b.dead = true;
      if (alive && !b.dead && Math.hypot(hx - b.x, hz - b.z) < 0.3 + HERO_R && Math.abs(hy - b.y) < 0.3 + HERO_H * 0.5) {
        if (h.powers.thunder > 0) { b.dead = true; this.ev('break', b.x, b.y, b.z); }
        else if (this.hurt(2, b.x - b.vx, b.z - b.vz)) { b.dead = true; this.ev('boom', b.x, b.y, b.z, 1); }
      }
    }
    this.c.balls = this.c.balls.filter((b) => !b.dead);
    // bombs and the pipes that drop them
    for (const d of this.c.droppers) {
      d.t += dt * pace;
      const every = d.every * this.tune.fireGap;
      const ph = (d.t + d.offset) % every;
      d.warn = ph > every - 1.1 ? (ph - (every - 1.1)) / 1.1 : 0;
      if (ph < dt * pace && d.t > 0.3) {
        this.c.bombs.push({ x: d.x, y: d.y, z: d.z, vy: 0, ground: d.ground, state: 'fall', fuse: 0.9, t: 0, dropped: true, back: 0, home: [d.x, d.y, d.z] });
        this.ev('drop', d.x, d.y, d.z);
      }
    }
    for (const b of this.c.bombs) {
      if (b.state === 'gone') {
        if (!b.dropped) { b.back -= dt; if (b.back <= 0 && Math.hypot(hx - b.home[0], hz - b.home[2]) > 5) { b.state = 'idle'; b.t = 0; } }
        continue;
      }
      if (b.state === 'idle' && alive && Math.hypot(hx - b.x, hz - b.z) < 2.6 && Math.abs(h.y - b.y) < 2.5) { b.state = 'lit'; b.t = 0; this.ev('fuse', b.x, b.y, b.z); }
      if (b.state === 'fall') {
        b.vy -= MOVE.gravity * dt; b.y += b.vy * dt;
        if (alive && Math.hypot(hx - b.x, hz - b.z) < 0.7 && b.y > h.y && b.y < h.y + HERO_H + 0.3) { this.explode(b); continue; }
        if (b.y <= b.ground) { b.y = b.ground; b.vy = 0; b.state = 'lit'; b.t = 0; this.ev('fuse', b.x, b.y, b.z); }
      }
      if (b.state === 'lit') {
        b.t += dt * pace;
        if (alive && h.powers.thunder > 0 && Math.hypot(hx - b.x, hz - b.z) < 0.9 && Math.abs(h.y - b.y) < 1.2) { b.state = 'gone'; b.back = 5; this.ev('break', b.x, b.y, b.z); continue; }
        if (b.t >= b.fuse * (b.dropped ? 1 : 1.5) * this.tune.warn) this.explode(b);
      }
    }
    this.c.bombs = this.c.bombs.filter((b) => !(b.dropped && b.state === 'gone'));
    // pendulums and orbiting balls
    for (const p of this.c.pendulums) {
      p.ang = p.amp * Math.sin((t * pace * Math.PI * 2) / p.period + p.phase);
      const sx = Math.sin(p.ang) * p.len, sy = -Math.cos(p.ang) * p.len;
      p.x = p.px + (p.axis === 'x' ? sx : 0); p.z = p.pz + (p.axis === 'z' ? sx : 0); p.y = p.py + sy;
      if (alive && Math.hypot(hx - p.x, hz - p.z) < 0.48 + HERO_R && Math.abs(hy - p.y) < 0.48 + HERO_H * 0.45) this.hurt(2, p.x, p.z);
    }
    this.foes(dt);
    for (const b of this.c.bonuses) b.bump = Math.max(0, b.bump - dt * 4);
    for (const o of this.c.orbiters) {
      for (let i = 0; i < o.n; i++) {
        const a = o.phase + t * o.speed * pace + (i * Math.PI * 2) / o.n;
        const b = o.balls[i];
        b.x = o.x + Math.cos(a) * o.r; b.y = o.y; b.z = o.z + Math.sin(a) * o.r;
        if (alive && Math.hypot(hx - b.x, hz - b.z) < 0.45 + HERO_R && Math.abs(hy - b.y) < 0.45 + HERO_H * 0.45) this.hurt(1, b.x, b.z);
      }
    }
  }

  // ---------------------------------------------------------------- enemies

  private foes(dt: number): void {
    const h = this.hero, pace = this.tune.pace;
    const alive = h.state === 'play';
    for (const f of this.c.foes) {
      if (f.state === 'dead') { f.t += dt; continue; }
      f.t += dt;
      const dx = h.x - f.x, dz = h.z - f.z, dist = Math.hypot(dx, dz);
      const sees = alive && dist < 7 && Math.abs(h.y - f.ground) < 2.2;
      const a = f.area;
      switch (f.kind) {
        case 'crab': {
          // sideways along x, turning at the end of its beat or of its isle
          f.vx = f.dir * 1.7 * pace; f.vz = 0;
          if ((f.dir > 0 && (f.x > f.hx + f.range || f.x > a.x1)) || (f.dir < 0 && (f.x < f.hx - f.range || f.x < a.x0))) f.dir *= -1;
          f.yaw = sees ? Math.atan2(dx, dz) * 0.3 : 0;
          break;
        }
        case 'gob': {
          // strolls; spotting the hero it roars (the warning), then charges in a straight line
          if (f.state === 'walk') {
            f.vx = f.dir * 1.1 * pace; f.vz = 0; f.yaw = f.dir > 0 ? Math.PI / 2 : -Math.PI / 2;
            if ((f.dir > 0 && f.x > f.hx + f.range) || (f.dir < 0 && f.x < f.hx - f.range)) f.dir *= -1;
            if (sees && dist < 6.2 && f.t > 0.6) { f.state = 'alert'; f.t = 0; f.vx = f.vz = 0; this.foeEv('foeAlert', f); }
          } else if (f.state === 'alert') {
            f.yaw = Math.atan2(dx, dz);
            if (f.t > 0.65 / Math.max(0.6, this.tune.warn * 0.9)) { const l = dist || 1; f.ax = dx / l; f.az = dz / l; f.state = 'charge'; f.t = 0; }
          } else if (f.state === 'charge') {
            f.vx = f.ax * 5.4 * pace; f.vz = f.az * 5.4 * pace; f.yaw = Math.atan2(f.ax, f.az);
            if (f.t > 1.1 || f.x < a.x0 || f.x > a.x1 || f.z < a.z0 || f.z > a.z1) { f.state = 'rest'; f.t = 0; f.vx = f.vz = 0; }
          } else if (f.state === 'rest') { f.vx = f.vz = 0; if (f.t > 1.1) { f.state = 'walk'; f.t = 0; } }
          break;
        }
        case 'skull': {
          // waits, then hops: at the hero when it is near, else back home
          if (f.state === 'walk' || f.state === 'wait') {
            f.state = 'wait'; f.vx = f.vz = 0;
            if (sees) f.yaw = Math.atan2(dx, dz);
            if (f.t > 1.0) {
              const tx = sees ? dx : f.hx - f.x, tz = sees ? dz : f.hz - f.z, l = Math.hypot(tx, tz);
              const sp = l > 0.3 ? 2.8 * pace : 0;
              f.vx = l > 0 ? (tx / l) * sp : 0; f.vz = l > 0 ? (tz / l) * sp : 0; f.vy = 7.2;
              f.state = 'hop'; f.t = 0;
              this.foeEv('foeHop', f);
            }
          } else if (f.state === 'hop') {
            f.vy -= MOVE.gravity * 0.8 * dt;
            f.y += f.vy * dt;
            if (f.y <= f.ground) { f.y = f.ground; f.vy = 0; f.vx = f.vz = 0; f.state = 'wait'; f.t = 0; }
          }
          break;
        }
        case 'bee': {
          // hovers round its home; near the hero it stops, buzzes (the warning) and swoops at it
          const hy = f.ground + 1.5;
          if (f.state === 'hover') {
            const ang = f.t * 1.2 * pace;
            const tx = f.hx + Math.cos(ang) * 1.4, tz = f.hz + Math.sin(ang * 0.8) * 1.0;
            f.vx = (tx - f.x) * 3; f.vz = (tz - f.z) * 3; f.vy = (hy + Math.sin(f.t * 3) * 0.2 - f.y) * 3;
            f.yaw = sees ? Math.atan2(dx, dz) : Math.atan2(f.vx, f.vz);
            if (sees && dist < 5.2 && f.t > 1.2) { f.state = 'alert'; f.t = 0; this.foeEv('foeAlert', f); }
          } else if (f.state === 'alert') {
            f.vx = f.vz = f.vy = 0; f.yaw = Math.atan2(dx, dz);
            if (f.t > 0.6 / Math.max(0.6, this.tune.warn * 0.9)) {
              const ty = h.y + 0.6 - f.y, l = Math.hypot(dx, ty, dz) || 1;
              f.ax = dx / l; f.ay = ty / l; f.az = dz / l; f.state = 'swoop'; f.t = 0;
              this.foeEv('foeSwoop', f);
            }
          } else if (f.state === 'swoop') {
            f.vx = f.ax * 7.5 * pace; f.vy = f.ay * 7.5 * pace; f.vz = f.az * 7.5 * pace;
            if (f.t > 0.75 || f.y < f.ground + 0.4) { f.state = 'back'; f.t = 0; }
          } else if (f.state === 'back') {
            const tx = f.hx - f.x, ty = hy - f.y, tz = f.hz - f.z, l = Math.hypot(tx, ty, tz) || 1;
            f.vx = (tx / l) * 3; f.vy = (ty / l) * 3; f.vz = (tz / l) * 3; f.yaw = Math.atan2(tx, tz);
            if (l < 0.4) { f.state = 'hover'; f.t = 0; }
          }
          f.y += f.vy * dt;
          break;
        }
      }
      f.x += f.vx * dt; f.z += f.vz * dt;
      if (f.kind !== 'bee') { f.x = Math.max(a.x0, Math.min(a.x1, f.x)); f.z = Math.max(a.z0, Math.min(a.z1, f.z)); }
      // the hero: a stomp from above beats it, Thunder (or a shielded dash) smashes it, else it hurts
      if (!alive) continue;
      const F = FOE[f.kind];
      const fy = f.y;
      if (Math.hypot(h.x - f.x, h.z - f.z) > F.r + HERO_R) continue;
      if (h.y > fy + F.h + 0.05 || h.y + HERO_H < fy) continue;
      if (h.vy < -0.5 && h.y > fy + F.h * 0.45) {
        this.beat(f, 'stomp');
        h.vy = MOVE.jump * 0.85; h.rising = true; h.ground = null;
        h.airJumps = airJumps(this.ranks) + (h.powers.spring > 0 ? 1 : 0); h.airDashes = airDashes(this.ranks);
      } else if (h.powers.thunder > 0 || (h.dashT > 0 && dashShield(this.ranks))) this.beat(f, 'smash');
      else this.hurt(F.dmg, f.x, f.z);
    }
  }

  private beat(f: Foe, how: 'stomp' | 'smash'): void {
    f.state = 'dead'; f.t = 0; f.vx = f.vy = f.vz = 0;
    this.stats.foes++;
    this.points += FOE[f.kind].points;
    this.foeEv(how, f);
  }

  private foeEv(e: 'stomp' | 'smash' | 'foeAlert' | 'foeHop' | 'foeSwoop', f: Foe): void {
    this.events.push({ e, x: f.x, y: f.y, z: f.z, kind: f.kind });
  }

  private explode(b: Bomb): void {
    const h = this.hero;
    b.state = 'gone';
    b.back = 5;
    this.ev('boom', b.x, b.y + 0.3, b.z);
    if (h.state === 'play' && Math.hypot(h.x - b.x, h.z - b.z) < 2.2 && Math.abs(h.y - b.y) < 2) this.hurt(2, b.x, b.z);
  }

  // ---------------------------------------------------------------- pickups and triggers

  private pickups(dt: number): void {
    const h = this.hero;
    if (h.state !== 'play' && h.state !== 'goal') return;
    const range = Math.max(h.powers.magnet > 0 ? MAGNET_RANGE : 0, magnetRange(this.ranks));
    const cx = h.x, cy = h.y + HERO_H * 0.5, cz = h.z;
    for (const p of this.c.pickups) {
      if (p.taken) continue;
      const d = Math.hypot(p.x - cx, p.y - cy, p.z - cz);
      if (range > 0 && (p.kind === 'coin' || p.kind === 'gem') && d < range) p.pull = true;
      if (p.pull) {
        const k = Math.min(1, (16 * dt) / Math.max(0.01, d));
        p.x += (cx - p.x) * k; p.y += (cy - p.y) * k; p.z += (cz - p.z) * k;
      }
      const reach = p.kind === 'power' ? 1.0 : p.kind === 'star' ? 0.95 : 0.85;
      if (d < reach) this.take(p);
    }
  }

  private take(p: Pickup): void {
    const h = this.hero, s = this.stats;
    p.taken = true;
    switch (p.kind) {
      case 'coin': s.coins++; this.points += SCORE.coin; break;
      case 'gem': s.gems++; s.gemPoints += GEM_POINTS[p.gem as GemKind]; this.points += GEM_POINTS[p.gem as GemKind]; break;
      case 'star': s.stars[p.star!] = true; break;
      case 'heart': h.hp = Math.min(h.max, h.hp + 2); break;
      case 'half': h.hp = Math.min(h.max, h.hp + 1); break;
      case 'key': h.keys++; break;
      case 'power': {
        const id = p.power!;
        if (id === 'shield') h.shield = true;
        else h.powers[id] = id === 'thunder' ? thunderTime(this.ranks) : POWER_TIME[id];
        if (id === 'spring' && h.ground) h.airJumps = airJumps(this.ranks) + 1;
        break;
      }
    }
    this.events.push({ e: 'pickup', x: p.x, y: p.y, z: p.z, p });
  }

  private triggers(): void {
    const h = this.hero, c = this.c;
    const near = (x: number, y: number, z: number, r: number, dy = 2) => Math.hypot(h.x - x, h.z - z) < r && h.y > y - 0.6 && h.y < y + dy;
    c.checkpoints.forEach((cp, i) => {
      if (cp.on || !near(cp.x, cp.y, cp.z, 1.5, 3)) return;
      for (let k = 0; k <= i; k++) c.checkpoints[k].on = true;
      if (i > this.checkpoint) this.checkpoint = i;
      if (this.ranks.shield >= 2 && this.startShield) h.shield = true;
      this.ev('checkpoint', cp.x, cp.y, cp.z, cp.n);
    });
    for (const l of c.levers) {
      if (l.on || !near(l.x, l.y, l.z, 1.2)) continue;
      l.on = true;
      this.ev('lever', l.x, l.y, l.z);
      const d = c.doors[l.door];
      if (d && !d.opening) { d.opening = true; this.ev('door', d.x, d.y, d.z); }
    }
    for (const ch of c.chests) {
      ch.nag = Math.max(0, ch.nag - DT_TRIG);
      if (ch.opened || !near(ch.x, ch.y, ch.z, 1.7)) continue;
      if (h.keys <= 0) { if (ch.nag <= 0) { ch.nag = 2.5; this.ev('needKey', ch.x, ch.y + 1.2, ch.z); } continue; }
      h.keys--;
      ch.opened = true;
      this.stats.chests++;
      this.ev('chest', ch.x, ch.y, ch.z);
      // the loot springs out and flies to the hero
      for (let i = 0; i < ch.coins; i++) {
        const a = (i / ch.coins) * Math.PI * 2;
        c.pickups.push({ kind: 'coin', x: ch.x + Math.cos(a) * 0.6, y: ch.y + 1.2 + (i % 3) * 0.3, z: ch.z + Math.sin(a) * 0.6, taken: false, pull: true, bob: i });
      }
      if (ch.gem) c.pickups.push({ kind: 'gem', gem: ch.gem, x: ch.x, y: ch.y + 1.8, z: ch.z, taken: false, pull: true, bob: 0 });
      if (ch.heart) c.pickups.push({ kind: 'heart', x: ch.x, y: ch.y + 2.2, z: ch.z, taken: false, pull: true, bob: 0 });
    }
    for (const ch of c.chests) if (ch.opened) ch.open = Math.min(1, ch.open + DT_TRIG / 0.45);
    for (const l of c.levers) if (l.on) l.t = Math.min(1, l.t + DT_TRIG / 0.3);
    if (near(c.goal.x, c.goal.y, c.goal.z, 1.6, 4)) {
      h.state = 'goal';
      h.stateT = 0;
      this.stats.time = this.clock;
      this.ev('goal', c.goal.x, c.goal.y, c.goal.z);
    }
  }
}

const DT_TRIG = 1 / 60;

export function approach(v: number, target: number, step: number): number {
  return v < target ? Math.min(target, v + step) : Math.max(target, v - step);
}
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
function shift(b: Box, dx: number, dy: number, dz: number): void { b.x0 += dx; b.x1 += dx; b.y0 += dy; b.y1 += dy; b.z0 += dz; b.z1 += dz; }
