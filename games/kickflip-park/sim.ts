// Kickflip Park: the skate simulation. Deterministic (fixed 1/120 s steps, a seeded RNG) and free
// of three.js and Phaser, so the Play scene, the menu's autopilot and the headless balance run all
// drive the same code. The ground comes from park.ts; the view reads the state and the events.
//
// Riding: on the ground the board keeps a heading and a signed speed along it; gravity pulls along
// the slope, wheels grip sideways, a push tops you up. A transition that gets steep enough throws
// you off its lip: off a vert ramp straight up (and you come back in, turned round), off anything
// else along the surface. In the air the stick spins you; flips, grabs and specials have their own
// timing; landing checks the board against the way you are going. Grinds lock onto rails near the
// board while the grind button is held, with a balance to keep; manuals balance on two wheels.
import {
  TUNING, RIDE, G, FLIPS, GRABS, GRINDS, MANUALS, SPECIALS, SPIN_PTS, GRAB_MIN, REPEAT_DECAY, FLIP_REPEAT_PTS,
  clamp, wrap, seeded, type Mode, type Tuning, type Dir, type TrickDef, UP, DOWN,
} from './defs';
import { onSeg, inZone, type RailSeg, type Shape, type Surface } from './park';
import type { ParkDef, GoalDef } from './parks';

export interface Input {
  /**
   * −1 … 1: the rider's left / right, which is the screen's left / right behind the rider (steer on
   * the ground, spin in the air, balance on rails). Headings are atan2(x, z) in three.js's
   * right-handed world (y up), so a turn to the right makes the heading smaller: see turnBy().
   */
  steer: number;
  /** −1 … 1: push / brake on the ground, balance in a manual. */
  fwd: number;
  /** Held: crouch on the ground (release to ollie); in the air it asks for a grind. */
  crouch: boolean;
  /** Held: grind (keyboard L); also asks for a grind like crouch. */
  grind: boolean;
  /** A flip trick pressed this frame (direction), or −1. */
  flip: number;
  /** The grab held now (direction), or −1. */
  grab: number;
  /** Manual pressed this frame. */
  manual: boolean;
  /** Special pressed this frame. */
  special: boolean;
  /** Direction for grinds and manuals chosen this frame (−1 none). */
  dir: number;
}

export const NO_INPUT: Input = { steer: 0, fwd: 0, crouch: false, grind: false, flip: -1, grab: -1, manual: false, special: false, dir: -1 };

export type State = 'ground' | 'air' | 'grind' | 'manual' | 'bail';

/**
 * How well the board came down: PERFECT (square to the way you go, every flip finished), CLEAN, or
 * SKETCHY (way off the line, or a flip still finishing as the wheels touched). The landing that ends
 * a combo scales it: LAND_MULT.
 */
export type Quality = 'perfect' | 'clean' | 'sketchy';
export const LAND_MULT: Record<Quality, number> = { perfect: 1.2, clean: 1, sketchy: 0.8 };
/** Share of the landing tolerance that is still PERFECT, and beyond which it is SKETCHY. */
const PERFECT_TOL = 0.25, SKETCHY_TOL = 0.62;

export interface Entry {
  /** Trick id ('kickflip', 'spin', 'gap' …). */
  id: string;
  /** Spin half turns, flip repeats, the gap's id. */
  n: number;
  key?: string;
  /** Points of this entry (before repeat decay). */
  pts: number;
  /** Repeat decay factor in this combo. */
  decay: number;
  /** Still growing (a grab held, a grind going on). */
  live: boolean;
}

export type SimEvent =
  | { type: 'push' }
  | { type: 'ollie'; power: number }
  | { type: 'launch'; vert: boolean; speed: number }
  | { type: 'land'; clean: true; impact: number; surf: Surface; fakie: boolean; quality: Quality; tricks: boolean }
  | { type: 'bail'; reason: 'land' | 'grind' | 'manual' | 'flip' | 'fall' }
  | { type: 'recover' }
  | { type: 'trick'; entry: Entry }
  | { type: 'flip'; def: TrickDef }
  | { type: 'grab'; def: TrickDef }
  | { type: 'grindStart'; rail: string; kind: 'rail' | 'ledge'; def: TrickDef }
  | { type: 'grindEnd'; ollie: boolean }
  | { type: 'manualStart' }
  | { type: 'manualEnd' }
  | { type: 'special'; def: TrickDef }
  | { type: 'specialReady' }
  | { type: 'combo'; score: number; tricks: number; entries: Entry[]; sum: number; quality: Quality; mult: number }
  | { type: 'comboLost'; score: number }
  | { type: 'gap'; id: string; pts: number }
  | { type: 'tape'; i: number; x: number; y: number; z: number }
  | { type: 'goal'; goal: GoalDef }
  | { type: 'wall'; speed: number }
  | { type: 'timeUp' };

const STEP = 1 / 120;

/**
 * The heading change for a turn of `rad` to the rider's right. Headings are atan2(x, z) (0 = +z,
 * π/2 = +x) and the world is right-handed with y up, so seen from behind (camera looking along +z)
 * +x is the screen's LEFT: turning right means a smaller heading. Getting this sign wrong swaps
 * the steering (the 1.0.0 bug: → turned left).
 */
export const turnBy = (rad: number): number => -rad;

interface AirState {
  t: number;
  /** Spin turned by the player (rad, signed). */
  spin: number;
  spinVel: number;
  /** Turn still to come from a vert launch (rad) and its rate. */
  auto: number;
  autoRate: number;
  autoDir: number;
  vert: boolean;
  fromX: number; fromZ: number;
  startY: number; topY: number;
  /** The lip the vert air left from (for the camera and the height goal). */
  lipY: number;
  /** Vert airs: where the lip is, the uphill direction, the wall's normal and the air's expected length. */
  lipX: number; lipZ: number; ux: number; uz: number; nx: number; ny: number; nz: number; tTotal: number;
  flip: { def: TrickDef; t: number; special: boolean } | null;
  /** The last flip done in this air (doubles). */
  lastFlip: string;
  grab: { def: TrickDef; t: number; entry: Entry | null } | null;
  overGaps: Set<string>;
  /** A manual is wanted on landing (pressed late in the air). */
  manualBuf: number;
  /** Rail we just left (no re-lock for a moment). */
  leftRail: string;
  leftT: number;
}

interface GrindState {
  seg: RailSeg;
  /** Position along the segment (0…1) and the way we go on it (+1 towards b). */
  u: number;
  dir: 1 | -1;
  def: TrickDef;
  t: number;
  bal: number;
  balV: number;
  entry: Entry;
  special: boolean;
}

interface ManualState { def: TrickDef; t: number; bal: number; balV: number; entry: Entry; special: boolean }

export class Sim {
  readonly tune: Tuning;
  readonly rnd: () => number;
  // the skater
  x = 0; y = 0; z = 0;
  heading = 0;
  /** Signed speed along the heading on the ground (m/s). */
  speed = 0;
  vx = 0; vy = 0; vz = 0;
  state: State = 'ground';
  /** Seconds in the current state. */
  stateT = 0;
  crouchT = 0;
  crouching = false;
  pushT = 0;
  /** A push stroke is playing (for the view), counts down. */
  pushing = 0;
  air: AirState | null = null;
  grind: GrindState | null = null;
  manual: ManualState | null = null;
  bailT = 0;
  /** Slope under the board (for the view): dh/dx, dh/dz. */
  gx = 0; gz = 0;
  /** Board yaw offset from the heading for the last fakie landing (the view eases it out). */
  surf: Surface = 'concrete';
  // the session
  time = 0;
  timeLeft: number;
  score = 0;
  over = false;
  private ending = 0;
  // combos
  combo: Entry[] = [];
  /** A landed combo waits this long for a manual before it is banked. */
  linkT = -1;
  special = 0;
  specialReady = false;
  /** For the view: the steering's turn to the rider's right on the ground (rad/s), and a sketchy landing's wobble (s). */
  carve = 0;
  sketchT = 0;
  /** The last landing of the combo going on (it scales the combo when it lands). */
  landQ: Quality = 'clean';
  stats2 = { perfect: 0, clean: 0, sketchy: 0 };
  // goals and run stats
  readonly done = new Set<string>();
  tapes: boolean[];
  stats = { bestCombo: 0, longestManual: 0, maxSpin: 0, vertHeight: 0, specials: 0, bails: 0, combos: 0, tricks: 0, gaps: new Set<string>(), railTime: new Map<string, number>(), comboRails: new Set<string>(), maxRails: 0 };
  events: SimEvent[] = [];
  private acc = 0;
  private prevCrouch = false;
  private lastSafe = { x: 0, z: 0, h: 0, t: 0 };
  private safeRing: { x: number; z: number; heading: number }[] = [];
  /** The last place the board rolled to freely (walls put it back here). */
  private good = { x: 0, z: 0 };

  constructor(readonly park: ParkDef, readonly mode: Mode, seed: number, readonly goalsDone: ReadonlySet<string> = new Set()) {
    this.tune = TUNING[mode];
    this.rnd = seeded(seed);
    this.timeLeft = this.tune.session;
    this.tapes = park.tapes.map(() => false);
    this.respawn(park.spawn.x, park.spawn.z, park.spawn.heading);
    this.speed = 3;
  }

  get terrain() { return this.park.terrain; }

  respawn(x: number, z: number, heading: number): void {
    this.x = x; this.z = z;
    this.y = this.terrain.height(x, z);
    this.heading = heading;
    this.speed = 0;
    this.vx = this.vy = this.vz = 0;
    this.setState('ground');
    this.air = null; this.grind = null; this.manual = null;
  }

  private setState(s: State): void {
    this.state = s;
    this.stateT = 0;
  }

  private emit(e: SimEvent): void { this.events.push(e); }

  /** Runs the simulation for `dt` seconds (fixed steps inside). */
  step(dt: number, inp: Input): void {
    if (this.over) return;
    this.handleEdges(inp);
    this.acc += Math.min(dt, 0.1);
    while (this.acc >= STEP) {
      this.acc -= STEP;
      this.tick(STEP, inp);
      if (this.over) break;
    }
  }

  // ------------------------------------------------------------------ one-shot inputs

  private handleEdges(inp: Input): void {
    if (this.state === 'bail') return;
    // special
    if (inp.special && this.specialReady) {
      if (this.state === 'air' && this.air && !this.air.flip) {
        const def = inp.dir === DOWN ? SPECIALS.pinwheel : SPECIALS.comet;
        this.endGrab();
        this.air.flip = { def, t: 0, special: true };
        this.emit({ type: 'special', def });
      } else if (this.state === 'grind' && this.grind && !this.grind.special) {
        this.grind.special = true;
        this.grind.def = SPECIALS.spark;
        this.grind.entry = this.addEntry({ id: SPECIALS.spark.id, n: 0, pts: SPECIALS.spark.pts, decay: 1, live: true });
        this.emit({ type: 'special', def: SPECIALS.spark });
      } else if (this.state === 'manual' && this.manual && !this.manual.special) {
        this.manual.special = true;
        this.manual.def = SPECIALS.moon;
        this.manual.entry = this.addEntry({ id: SPECIALS.moon.id, n: 0, pts: SPECIALS.moon.pts, decay: 1, live: true });
        this.emit({ type: 'special', def: SPECIALS.moon });
      }
    }
    // flips
    if (inp.flip >= 0 && this.state === 'air' && this.air) {
      const a = this.air;
      const f = a.flip;
      if (!a.grab && (!f || (!f.special && f.t >= (f.def.dur ?? 0.4) * 0.92))) {
        const def = FLIPS[inp.flip as Dir];
        a.flip = { def, t: 0, special: false };
        this.emit({ type: 'flip', def });
      }
    }
    // manuals
    if (inp.manual) {
      if (this.state === 'manual') this.endManual(true);
      else if (this.state === 'ground') this.startManual(inp.dir === UP);
      else if (this.state === 'air' && this.air) this.air.manualBuf = 0.4;
    }
  }

  // ------------------------------------------------------------------ the tick

  private tick(dt: number, inp: Input): void {
    this.time += dt;
    this.stateT += dt;
    if (this.timeLeft > 0) {
      this.timeLeft -= dt;
      if (this.timeLeft <= 0) { this.timeLeft = 0; this.emit({ type: 'timeUp' }); }
    } else {
      // the session is over: the trick in progress may still land
      this.ending += dt;
      const settled = (this.state === 'ground' && this.linkT < 0 && !this.combo.length) || this.state === 'bail';
      if ((settled && this.ending > 0.3) || this.ending > 9) {
        if (this.combo.length && this.state !== 'bail') this.bank();
        this.over = true;
        return;
      }
    }
    if (this.pushing > 0) this.pushing -= dt;
    if (this.sketchT > 0) this.sketchT -= dt;
    if (this.state !== 'ground' && this.state !== 'manual') this.carve = 0;
    switch (this.state) {
      case 'ground': case 'manual': this.ride(dt, inp); break;
      case 'air': this.fly(dt, inp); break;
      case 'grind': this.slide(dt, inp); break;
      case 'bail': this.tumble(dt); break;
    }
    if (this.state !== 'bail') {
      this.checkTapes();
      this.checkCombo(dt);
    }
    this.special = Math.max(0, this.special - dt * (this.combo.length ? 0 : 0.012));
    if (this.specialReady && this.special < 0.5) this.specialReady = false;
    this.prevCrouch = inp.crouch;
  }

  // ------------------------------------------------------------------ riding

  private ride(dt: number, inp: Input): void {
    const t = this.terrain;
    const g = t.ground(this.x, this.z);
    this.gx = g.gx; this.gz = g.gz;
    const hx = Math.sin(this.heading), hz = Math.cos(this.heading);
    const m = g.gx * hx + g.gz * hz;
    const cosA = 1 / Math.sqrt(1 + m * m);
    const manual = this.state === 'manual';
    // gravity along the slope, rolling resistance, drag
    const climbing = m * this.speed > 0;
    this.speed -= G * m * cosA * dt * (climbing ? RIDE.climb : 1);
    const sp = Math.abs(this.speed);
    const fric = RIDE.roll + (manual ? 0.25 : 0) + RIDE.drag * sp * sp;
    if (sp > 0) this.speed -= Math.sign(this.speed) * Math.min(sp, fric * dt);
    // push and brake (not in a manual, not while crouching)
    this.pushT -= dt;
    if (!manual && !this.crouching) {
      const flat = Math.abs(m) < 0.25;
      const wantPush = inp.fwd > 0.3 || (inp.fwd > -0.3 && this.speed < RIDE.cruise && this.speed > -0.5);
      if (wantPush && flat && this.speed < RIDE.pushTop && this.pushT <= 0) {
        this.pushT = RIDE.pushEvery;
        this.pushing = 0.5;
        this.speed = Math.min(RIDE.pushTop, Math.max(this.speed, 0) + RIDE.pushKick);
        this.emit({ type: 'push' });
      }
      if (inp.fwd < -0.3) this.speed -= Math.sign(this.speed) * Math.min(Math.abs(this.speed), RIDE.brake * -inp.fwd * dt);
    }
    this.speed = clamp(this.speed, -RIDE.maxSpeed, RIDE.maxSpeed);
    // steering, and the side slope turning you downhill
    const turn = RIDE.turnSlow + (RIDE.turnFast - RIDE.turnSlow) * clamp(sp / 12, 0, 1);
    const dirSign = this.speed < -0.3 ? -1 : 1;
    this.carve = inp.steer * turn * (manual ? 0.7 : 1) * dirSign;
    this.heading += turnBy(this.carve * dt);
    const q = g.gx * Math.cos(this.heading) - g.gz * Math.sin(this.heading);
    this.heading += clamp(q, -3, 3) * 2.2 / Math.max(2.5, sp) * dt * Math.sign(this.speed || 1);
    // rolling backwards on the flat: turn round (a revert)
    if (this.speed < -0.6 && Math.abs(m) < 0.15 && Math.abs(q) < 0.15 && this.state === 'ground') {
      this.heading += Math.PI;
      this.speed = -this.speed;
    }
    // crouch and ollie
    if (inp.crouch && this.state !== 'bail') {
      this.crouching = true;
      this.crouchT += dt;
    } else if (this.crouching) {
      this.crouching = false;
      this.ollie(this.crouchT);
      this.crouchT = 0;
      return;
    }
    if (manual) {
      this.balanceManual(dt, inp);
      // too slow to hold a manual: the wheels come down
      if (this.state === 'manual' && Math.abs(this.speed) < 1.2 && this.manual!.t > 0.3) this.endManual(true);
    }
    if ((this.state as State) === 'bail') return;
    this.moveOnGround(dt, m, cosA);
  }

  private moveOnGround(dt: number, m: number, cosA: number): void {
    const t = this.terrain;
    if (t.height(this.x, this.z) > this.y + 0.3) this.unstick();
    const hx = Math.sin(this.heading), hz = Math.cos(this.heading);
    const run = this.speed * cosA * dt;
    let nx = this.x + hx * run, nz = this.z + hz * run;
    const b = this.park.bounds;
    let ng = t.ground(nx, nz);
    const predicted = this.y + m * run;
    const blocked = (h: number, x: number, z: number) => h > this.y + Math.abs(m * run) + RIDE.stepUp || x < b.x0 || x > b.x1 || z < b.z0 || z > b.z1;
    if (blocked(ng.h, nx, nz)) {
      // a wall: slide along it if we can, else bounce
      const tryX = this.x + hx * run, tryZ = this.z + hz * run;
      const hX = t.height(tryX, this.z), hZ = t.height(this.x, tryZ);
      const okX = !blocked(hX, tryX, this.z) && Math.abs(hx) > 0.2, okZ = !blocked(hZ, this.x, tryZ) && Math.abs(hz) > 0.2;
      const sp = Math.abs(this.speed);
      if (okX && (!okZ || Math.abs(hx) >= Math.abs(hz))) {
        this.heading = Math.atan2(Math.sign(hx * this.speed), 0);
        this.speed = Math.abs(this.speed) * Math.abs(hx);
        nx = tryX; nz = this.z;
      } else if (okZ) {
        this.heading = Math.atan2(0, Math.sign(hz * this.speed));
        this.speed = Math.abs(this.speed) * Math.abs(hz);
        nx = this.x; nz = tryZ;
      } else {
        this.speed = -this.speed * 0.3;
        this.x = this.good.x; this.z = this.good.z;
        if (sp > 2.5) this.emit({ type: 'wall', speed: sp });
        return;
      }
      if (sp - Math.abs(this.speed) > 2.5) this.emit({ type: 'wall', speed: sp - Math.abs(this.speed) });
      ng = t.ground(nx, nz);
    }
    if (ng.h < predicted - 0.07) {
      // the ground falls away: off we go, along the surface
      const vh = this.speed * cosA;
      this.x = nx; this.z = nz;
      this.takeOff(hx * vh, this.speed * m * cosA, hz * vh, false);
      return;
    }
    this.good.x = this.x; this.good.z = this.z;
    this.x = nx; this.z = nz; this.y = ng.h;
    this.gx = ng.gx; this.gz = ng.gz;
    this.surf = ng.shape?.surf ?? this.terrain.baseSurf;
    // a lip?
    const s = ng.shape;
    const m2 = ng.gx * hx + ng.gz * hz;
    const slope = Math.hypot(ng.gx, ng.gz);
    if (s && slope > s.lip && m2 * this.speed > 0) this.lipLaunch(s, ng.gx, ng.gz);
    else if (this.state === 'ground' && slope < 0.05 && this.y > this.park.fallY + 2) this.remember();
  }

  /** Standing inside something (a wall's edge): step out to the nearest free spot. */
  private unstick(): void {
    const t = this.terrain;
    for (let r = 0.12; r <= 2; r += 0.12) {
      for (let k = 0; k < 12; k++) {
        const a = k * Math.PI / 6;
        const x = this.x + Math.sin(a) * r, z = this.z + Math.cos(a) * r;
        const h = t.height(x, z);
        if (h <= this.y + RIDE.stepUp && h > this.y - 0.5) { this.x = x; this.z = z; this.y = h; return; }
      }
    }
  }

  /** Off the top of a transition. */
  private lipLaunch(s: Shape, gx: number, gz: number): void {
    const hx = Math.sin(this.heading), hz = Math.cos(this.heading);
    const slope = Math.hypot(gx, gz);
    const m = gx * hx + gz * hz;
    const cosA = 1 / Math.sqrt(1 + m * m);
    const vh = this.speed * cosA;
    let vx = hx * vh, vz = hz * vh;
    const vy = this.speed * m * cosA;
    if (s.vert) {
      // straight up: keep only the part of the motion along the lip, so you fall back in
      const ux = gx / slope, uz = gz / slope;
      const along = vx * ux + vz * uz;
      vx -= ux * along; vz -= uz * along;
      const up = Math.hypot(vy, along);
      // the board turns round by itself: from the way up to the way back down (the heading
      // mirrored across the lip), so a plain air lands clean; spins add to it
      const h = hx * ux + hz * uz;
      const rx = hx - 2 * h * ux, rz = hz - 2 * h * uz;
      let turn = wrap(Math.atan2(rx, rz) - this.heading);
      if (Math.abs(turn) > Math.PI - 0.05) turn = Math.PI;
      this.takeOff(vx, up, vz, true);
      if (this.air) {
        const tAir = 2 * up / G;
        this.air.auto = Math.abs(turn);
        this.air.autoDir = Math.sign(turn) || 1;
        this.air.autoRate = Math.abs(turn) / Math.max(0.3, tAir * 0.75);
        const a = this.air;
        a.lipY = this.y; a.lipX = this.x; a.lipZ = this.z; a.ux = ux; a.uz = uz;
        const nl = Math.hypot(gx, 1, gz);
        a.nx = -gx / nl; a.ny = 1 / nl; a.nz = -gz / nl;
        a.tTotal = tAir;
      }
    } else this.takeOff(vx, vy, vz, false);
  }

  private ollie(crouch: number): void {
    const k = clamp(crouch / RIDE.crouchFull, 0, 1);
    const pop = RIDE.ollieMin + (RIDE.ollieMax - RIDE.ollieMin) * k;
    const fromManual = this.state === 'manual';
    if (fromManual) this.endManual(false);
    const hx = Math.sin(this.heading), hz = Math.cos(this.heading);
    const m = this.gx * hx + this.gz * hz;
    const cosA = 1 / Math.sqrt(1 + m * m);
    const vh = this.speed * cosA;
    this.emit({ type: 'ollie', power: k });
    const g = this.terrain.ground(this.x, this.z);
    if (g.shape?.vert && Math.hypot(g.gx, g.gz) > 1.5 && m * this.speed > 0) {
      // popping up a vert wall: a higher air straight up, back into the ramp
      this.speed += Math.min(pop, 3.2) * Math.sign(this.speed);
      this.lipLaunch(g.shape, g.gx, g.gz);
      return;
    }
    this.takeOff(hx * vh, this.speed * m * cosA + pop, hz * vh, false);
    this.y += 0.02;
  }

  private takeOff(vx: number, vy: number, vz: number, vert: boolean): void {
    const fromRail = this.state === 'grind' ? this.grind?.seg.rail.id ?? '' : '';
    if (this.state === 'manual') this.endManual(false);
    this.vx = vx; this.vy = vy; this.vz = vz;
    this.air = {
      t: 0, spin: 0, spinVel: 0, auto: 0, autoRate: 0, autoDir: 1, vert, fromX: this.x, fromZ: this.z, startY: this.y, topY: this.y, lipY: this.y, lipX: this.x, lipZ: this.z, ux: 0, uz: 0, nx: 0, ny: 1, nz: 0, tTotal: 1,
      flip: null, lastFlip: '', grab: null, overGaps: new Set(), manualBuf: 0, leftRail: fromRail, leftT: fromRail ? (this.railEnd ? 99 : 0.3) : 0,
    };
    this.grind = null;
    this.crouching = false;
    this.crouchT = 0;
    this.setState('air');
    if (this.linkT >= 0) this.linkT = -1; // still the same combo
    this.emit({ type: 'launch', vert, speed: Math.hypot(vx, vy, vz) });
  }

  // ------------------------------------------------------------------ the air

  private fly(dt: number, inp: Input): void {
    const a = this.air!;
    a.t += dt;
    a.leftT = Math.max(0, a.leftT - dt);
    a.manualBuf = Math.max(0, a.manualBuf - dt);
    // spin
    const target = inp.steer * RIDE.spinRate;
    const dv = target - a.spinVel;
    a.spinVel += clamp(dv, -RIDE.spinAccel * dt, RIDE.spinAccel * dt);
    if (inp.steer === 0 && Math.abs(a.spinVel) < 3) a.spinVel *= Math.max(0, 1 - dt * 10);
    // spinVel and spin count to the rider's right (holding → spins clockwise seen from above)
    this.heading += turnBy(a.spinVel * dt);
    a.spin += a.spinVel * dt;
    if (a.auto > 0) {
      const d = Math.min(a.auto, a.autoRate * dt);
      a.auto -= d;
      this.heading += d * a.autoDir;
    }
    // grab
    if (inp.grab >= 0 && !a.flip) {
      if (!a.grab) {
        const def = GRABS[inp.grab as Dir];
        a.grab = { def, t: 0, entry: null };
        this.emit({ type: 'grab', def });
      }
    } else if (a.grab) this.endGrab();
    if (a.grab) {
      a.grab.t += dt;
      if (a.grab.t >= GRAB_MIN) {
        const pts = a.grab.def.pts + (a.grab.def.perSec ?? 0) * Math.min(3, a.grab.t - GRAB_MIN);
        if (!a.grab.entry) a.grab.entry = this.addEntry({ id: a.grab.def.id, n: 0, pts, decay: 1, live: true });
        else a.grab.entry.pts = Math.round(pts);
      }
    }
    // flip
    if (a.flip) {
      a.flip.t += dt;
      const dur = a.flip.def.dur ?? 0.4;
      if (a.flip.t >= dur) {
        const def = a.flip.def;
        const last = this.combo[this.combo.length - 1];
        if (!a.flip.special && a.lastFlip === def.id && last && last.id === def.id && last.n < 3) {
          last.n++;
          last.pts = Math.round(def.pts * FLIP_REPEAT_PTS[Math.min(2, last.n - 1)] * last.n);
          this.emit({ type: 'trick', entry: last });
        } else {
          this.addEntry({ id: def.id, n: 1, pts: def.pts, decay: 1, live: false });
          if (a.flip.special) this.stats.specials++;
        }
        a.lastFlip = def.id;
        a.flip = null;
      }
    }
    // motion
    const px = this.x, pz = this.z;
    this.vy -= G * dt;
    this.x += this.vx * dt; this.y += this.vy * dt; this.z += this.vz * dt;
    a.topY = Math.max(a.topY, this.y);
    if (a.vert) this.stats.vertHeight = Math.max(this.stats.vertHeight, this.y - a.lipY);
    const b = this.park.bounds;
    if (this.x < b.x0 || this.x > b.x1) { this.x = px; this.vx = -this.vx * 0.2; }
    if (this.z < b.z0 || this.z > b.z1) { this.z = pz; this.vz = -this.vz * 0.2; }
    // fell off the roofs
    if (this.y < this.park.fallY) { this.doBail('fall'); return; }
    // gaps flown over
    for (const gp of this.park.gaps) {
      if (gp.kind === 'over' && !a.overGaps.has(gp.id) && inZone(gp.a, this.x, this.z) && this.y > (gp.a.y ?? 0)) {
        a.overGaps.add(gp.id);
        this.gap(gp.id, gp.pts);
      }
    }
    // rails
    if ((inp.grind || inp.crouch) && this.tryGrind(inp)) return;
    // ground
    const g = this.terrain.ground(this.x, this.z);
    if (this.y <= g.h) {
      if (g.h - this.y > 0.45 && this.vy > -12) {
        // flew into the side of something: drop the motion into it
        const hX = this.terrain.height(this.x, pz), hZ = this.terrain.height(px, this.z);
        if (hX > this.y + 0.2) { this.x = px; this.vx = -this.vx * 0.15; }
        if (hZ > this.y + 0.2) { this.z = pz; this.vz = -this.vz * 0.15; }
        if (this.terrain.height(this.x, this.z) > this.y + 0.2) { this.x = px; this.z = pz; this.vx = this.vz = 0; }
        this.emit({ type: 'wall', speed: 4 });
        return;
      }
      this.land(g.h, g.gx, g.gz, g.shape);
    }
  }

  /**
   * The half turns an air scores: the rider's own spin, and on a vert air one more when they spun
   * at all (the ramp's own turn round on top makes a 360 there a 540, as skaters count it).
   */
  private spinHalves(a: AirState): number {
    const own = Math.round(Math.abs(a.spin) / Math.PI);
    return own >= 1 && a.vert && a.auto <= 0.2 ? own + 1 : own;
  }

  private endGrab(): void {
    const a = this.air;
    if (!a?.grab) return;
    if (a.grab.entry) a.grab.entry.live = false;
    a.grab = null;
  }

  private land(h: number, gx: number, gz: number, shape: Shape | null): void {
    const a = this.air!;
    // the surface's normal and the velocity along it
    const nl = Math.hypot(gx, 1, gz);
    const nx = -gx / nl, ny = 1 / nl, nz = -gz / nl;
    const vn = this.vx * nx + this.vy * ny + this.vz * nz;
    let tx = this.vx - vn * nx, ty = this.vy - vn * ny, tz = this.vz - vn * nz;
    let along = Math.hypot(tx, ty, tz);
    void ty;
    const slope = Math.hypot(gx, gz);
    let dir: number;
    if (Math.hypot(tx, tz) > 0.6) dir = Math.atan2(tx, tz);
    else if (slope > 0.08) { dir = Math.atan2(-gx, -gz); along = Math.max(along, Math.abs(vn) * 0.3); }
    else dir = this.heading;
    // the board against the way we go
    const d = wrap(this.heading - dir);
    const fakie = Math.abs(d) > Math.PI / 2;
    const off = fakie ? Math.abs(wrap(d - Math.PI)) : Math.abs(d);
    const tol = this.tune.landTol;
    const f = a.flip;
    const flipLate = f ? f.t < (f.def.dur ?? 0.4) * (1 - (f.special ? this.tune.flipGrace * 0.5 : this.tune.flipGrace)) : false;
    this.y = h;
    if (off > tol || flipLate) {
      this.doBail(flipLate ? 'flip' : 'land');
      return;
    }
    // clean: how clean (before the air's tricks are finished)
    const q: Quality = !f && off < tol * PERFECT_TOL ? 'perfect' : f || off > tol * SKETCHY_TOL ? 'sketchy' : 'clean';
    // clean: finish the air's tricks
    if (f) {
      this.addEntry({ id: f.def.id, n: 1, pts: f.def.pts, decay: 1, live: false });
      if (f.special) this.stats.specials++;
      a.flip = null;
    }
    this.endGrab();
    const half = this.spinHalves(a);
    if (half >= 1) {
      this.addEntry({ id: 'spin', n: half, pts: SPIN_PTS[Math.min(SPIN_PTS.length - 1, half)], decay: 1, live: false });
      this.stats.maxSpin = Math.max(this.stats.maxSpin, half * 180);
    }
    this.checkJumpGaps(a.fromX, a.fromZ, this.x, this.z);
    this.heading = dir;
    this.speed = along * 0.97;
    this.gx = gx; this.gz = gz;
    this.surf = shape?.surf ?? this.terrain.baseSurf;
    const impact = Math.max(0, -vn);
    this.air = null;
    this.setState('ground');
    const tricks = this.combo.length > 0;
    if (tricks) { this.landQ = q; this.stats2[q]++; }
    if (q === 'sketchy') this.sketchT = 0.6;
    this.emit({ type: 'land', clean: true, impact, surf: this.surf, fakie, quality: q, tricks });
    if (this.combo.length) {
      if (a.manualBuf > 0) this.startManual(false);
      else this.linkT = this.tune.linkWindow;
    }
  }

  private checkJumpGaps(fx: number, fz: number, x: number, z: number): void {
    for (const gp of this.park.gaps) {
      if (gp.kind === 'jump' && gp.b && inZone(gp.a, fx, fz) && inZone(gp.b, x, z)) this.gap(gp.id, gp.pts);
    }
  }

  private gap(id: string, pts: number): void {
    this.stats.gaps.add(id);
    this.addEntry({ id: 'gap', n: 0, key: id, pts, decay: 1, live: false });
    this.emit({ type: 'gap', id, pts });
    this.goalCheck('gap', 0, id);
  }

  // ------------------------------------------------------------------ grinds

  private tryGrind(inp: Input): boolean {
    const a = this.air!;
    if (a.t < 0.06 && this.vy > 0 && !a.leftRail) return false;
    const snap = this.tune.snap;
    let best: RailSeg | null = null, bestD = Infinity, bestY = 0, bestT = 0;
    for (const s of this.park.segs) {
      if (a.leftT > 0 && s.rail.id === a.leftRail) continue;
      const r = onSeg(s, this.x, this.z);
      if (r.d > snap || r.d > bestD) continue;
      if (this.y < r.y - 0.35 || this.y > r.y + 1.25) continue;
      // rising fast: going over it, not onto it (rails lock on the way down or level)
      if (this.vy > 3.5 && this.y < r.y) continue;
      if (this.vy > 2.5) continue;
      best = s; bestD = r.d; bestY = r.y; bestT = r.t;
    }
    if (!best) return false;
    const vh = Math.hypot(this.vx, this.vz);
    let along: number;
    if (vh > 1.2) {
      along = (this.vx * best.dx + this.vz * best.dz);
      if (Math.abs(along) / vh < 0.42) return false;
    } else along = (Math.sin(this.heading) * best.dx + Math.cos(this.heading) * best.dz) * 3;
    const dir: 1 | -1 = along >= 0 ? 1 : -1;
    // not right at the far end of a rail (a corner of two ledges would bounce you between them)
    if ((dir > 0 ? 1 - bestT : bestT) * best.len < 0.7 && !this.park.segs.some((q) => q.rail === best!.rail && q.i === best!.i + dir)) return false;
    // tricks of the air land on the rail
    if (a.flip) {
      const f = a.flip;
      if (f.t < (f.def.dur ?? 0.4) * (1 - this.tune.flipGrace)) { this.doBail('flip'); return true; }
      this.addEntry({ id: f.def.id, n: 1, pts: f.def.pts, decay: 1, live: false });
      a.flip = null;
    }
    this.endGrab();
    const half = this.spinHalves(a);
    if (half >= 1) this.addEntry({ id: 'spin', n: half, pts: SPIN_PTS[Math.min(SPIN_PTS.length - 1, half)], decay: 1, live: false });
    this.checkJumpGaps(a.fromX, a.fromZ, this.x, this.z);
    const def = GRINDS[(inp.dir >= 0 ? inp.dir : 4) as Dir | 4];
    const entry = this.addEntry({ id: def.id, n: 0, pts: def.pts, decay: 1, live: true });
    const lat = (this.rnd() - 0.5) * 0.3;
    this.grind = { seg: best, u: bestT, dir, def, t: 0, bal: lat, balV: lat * 0.5, entry, special: false };
    this.speed = Math.max(3.4, Math.abs(along));
    this.x = best.ax + (best.bx - best.ax) * bestT;
    this.z = best.az + (best.bz - best.az) * bestT;
    this.y = bestY;
    this.heading = Math.atan2(best.dx * dir, best.dz * dir);
    this.air = null;
    this.linkT = -1;
    this.setState('grind');
    this.stats.comboRails.add(best.rail.id);
    this.stats.maxRails = Math.max(this.stats.maxRails, this.stats.comboRails.size);
    this.goalCheck('rails', this.stats.comboRails.size);
    this.emit({ type: 'grindStart', rail: best.rail.id, kind: best.rail.kind, def });
    return true;
  }

  private slide(dt: number, inp: Input): void {
    const gr = this.grind!;
    gr.t += dt;
    const s = gr.seg;
    const slope = (s.by - s.ay) / s.len * gr.dir;
    this.speed -= G * slope / Math.sqrt(1 + slope * slope) * dt * 0.85;
    this.speed -= 0.3 * dt;
    // the balance: an unstable lean the stick holds up
    const tip = this.tune.grindTip + this.tune.grindTipRamp * gr.t;
    if (this.rnd() < dt * 3) gr.balV += (this.rnd() - 0.5) * 1.6 * this.tune.wobble;
    gr.balV += (gr.bal * tip - inp.steer * 5.5) * dt;
    gr.balV *= Math.max(0, 1 - dt * 2.2);
    gr.bal += gr.balV * dt;
    if (gr.special) gr.bal *= Math.max(0, 1 - dt * 3);
    if (Math.abs(gr.bal) > 1) { this.doBail('grind'); return; }
    // points grow
    gr.entry.pts = Math.round(gr.def.pts + (gr.def.perSec ?? 0) * gr.t);
    const rt = (this.stats.railTime.get(s.rail.id) ?? 0) + dt;
    this.stats.railTime.set(s.rail.id, rt);
    if (s.rail.tag) this.goalCheck('rail', rt, s.rail.tag);
    // ollie off
    if (!inp.crouch && this.prevCrouch && this.crouchT > 0) {
      const pop = RIDE.ollieMin + (RIDE.ollieMax - RIDE.ollieMin) * clamp(this.crouchT / RIDE.crouchFull, 0, 1) * 0.7;
      this.crouchT = 0;
      this.leaveRail(pop, true);
      return;
    }
    if (inp.crouch) this.crouchT += dt;
    // along the rail
    if (this.speed < 1) { this.leaveRail(1, false); return; }
    const cosA = 1 / Math.sqrt(1 + slope * slope);
    gr.u += this.speed * cosA * dt / s.len * gr.dir;
    if (gr.u > 1 || gr.u < 0) {
      // the next piece of this rail, or off the end
      const segs = this.park.segs;
      const next = segs.find((q) => q.rail === s.rail && q.i === s.i + gr.dir);
      if (next) {
        gr.seg = next;
        gr.u = gr.dir > 0 ? 0 : 1;
      } else {
        gr.u = clamp(gr.u, 0, 1);
        this.placeOnRail();
        this.railEnd = true;
        this.leaveRail(2.4, false);
        this.railEnd = false;
        return;
      }
    }
    this.placeOnRail();
  }

  private placeOnRail(): void {
    const gr = this.grind!, s = gr.seg;
    this.x = s.ax + (s.bx - s.ax) * gr.u;
    this.z = s.az + (s.bz - s.az) * gr.u;
    this.y = s.ay + (s.by - s.ay) * gr.u;
    this.heading = Math.atan2(s.dx * gr.dir, s.dz * gr.dir);
  }

  private leaveRail(up: number, ollie: boolean): void {
    const gr = this.grind!;
    gr.entry.live = false;
    const s = gr.seg;
    const slope = (s.by - s.ay) / s.len * gr.dir;
    const cosA = 1 / Math.sqrt(1 + slope * slope);
    const vh = this.speed * cosA;
    this.emit({ type: 'grindEnd', ollie });
    this.takeOff(s.dx * gr.dir * vh, this.speed * slope * cosA + up, s.dz * gr.dir * vh, false);
    this.y += 0.05;
  }

  // ------------------------------------------------------------------ manuals

  private startManual(nose: boolean): void {
    const def = nose ? MANUALS.nose : MANUALS.manual;
    const entry = this.addEntry({ id: def.id, n: 0, pts: def.pts, decay: 1, live: true });
    const k = (this.rnd() - 0.5) * 0.25;
    this.manual = { def, t: 0, bal: k, balV: k, entry, special: false };
    this.linkT = -1;
    this.setState('manual');
    this.emit({ type: 'manualStart' });
  }

  private balanceManual(dt: number, inp: Input): void {
    const mn = this.manual!;
    mn.t += dt;
    const tip = this.tune.manualTip + this.tune.manualTipRamp * mn.t;
    if (this.rnd() < dt * 3) mn.balV += (this.rnd() - 0.5) * 1.3 * this.tune.wobble;
    mn.balV += (mn.bal * tip - inp.fwd * 4.5) * dt;
    mn.balV *= Math.max(0, 1 - dt * 2.2);
    mn.bal += mn.balV * dt;
    if (mn.special) mn.bal *= Math.max(0, 1 - dt * 3);
    mn.entry.pts = Math.round(mn.def.pts + (mn.def.perSec ?? 0) * mn.t);
    this.stats.longestManual = Math.max(this.stats.longestManual, mn.t);
    this.goalCheck('manual', mn.t);
    if (Math.abs(mn.bal) > 1) this.doBail('manual');
  }

  private endManual(bank: boolean): void {
    const mn = this.manual;
    if (!mn) return;
    mn.entry.live = false;
    this.manual = null;
    if (this.state === 'manual') this.setState('ground');
    this.emit({ type: 'manualEnd' });
    if (bank) this.linkT = 0.05;
  }

  // ------------------------------------------------------------------ bails

  private doBail(reason: 'land' | 'grind' | 'manual' | 'flip' | 'fall'): void {
    if (reason === 'fall') {
      // keep falling a little for the camera, then back on the last safe roof
      this.vx *= 0.3; this.vz *= 0.3;
    } else if (this.state === 'air') {
      this.speed = Math.hypot(this.vx, this.vz) * 0.5;
      this.heading = Math.atan2(this.vx, this.vz) || this.heading;
    }
    if (this.state === 'grind' || this.state === 'manual') this.speed *= 0.5;
    const lost = this.comboValue();
    this.combo = [];
    this.landQ = 'clean';
    this.linkT = -1;
    this.stats.comboRails.clear();
    this.stats.bails++;
    this.special = 0;
    this.specialReady = false;
    this.air = null; this.grind = null; this.manual = null;
    this.crouching = false; this.crouchT = 0;
    this.bailT = 0;
    this.bailFall = reason === 'fall';
    this.setState('bail');
    this.emit({ type: 'bail', reason });
    if (lost > 0) this.emit({ type: 'comboLost', score: lost });
  }
  private bailFall = false;
  /** Leaving a rail off its end (no re-lock onto it in this air). */
  private railEnd = false;

  private tumble(dt: number): void {
    this.bailT += dt;
    if (this.bailFall) {
      this.vy -= G * dt;
      this.x += this.vx * dt; this.y += this.vy * dt; this.z += this.vz * dt;
    } else {
      // slide to a stop on the ground
      const sp = Math.max(0, this.speed - 9 * dt);
      this.speed = sp;
      const hx = Math.sin(this.heading), hz = Math.cos(this.heading);
      const nx = this.x + hx * sp * dt, nz = this.z + hz * sp * dt;
      const h = this.terrain.height(nx, nz);
      const b = this.park.bounds;
      if (h < this.y + 0.3 && h > this.y - 1.5 && nx > b.x0 && nx < b.x1 && nz > b.z0 && nz < b.z1) { this.x = nx; this.z = nz; this.y = h; }
      else this.y = Math.max(this.terrain.height(this.x, this.z), this.y - 3 * dt);
    }
    if (this.bailT >= RIDE.bailTime) {
      if (this.bailFall || this.y < this.park.fallY + 1) {
        const s = this.safeRing[0] ?? { x: this.park.spawn.x, z: this.park.spawn.z, heading: this.park.spawn.heading };
        this.respawn(s.x, s.z, s.heading);
      } else {
        // stand up where we stopped, facing down the slope if there is one
        const g = this.terrain.ground(this.x, this.z);
        if (Math.hypot(g.gx, g.gz) > 0.3) this.heading = Math.atan2(-g.gx, -g.gz);
        this.y = g.h;
        this.speed = Math.hypot(g.gx, g.gz) > 0.3 ? 1 : 0;
        this.setState('ground');
      }
      this.emit({ type: 'recover' });
    }
  }

  /** Keeps a few recent places on safe flat ground (where a fall puts you back). */
  private remember(): void {
    if (this.time - this.lastSafe.t < 0.5) return;
    this.lastSafe.t = this.time;
    this.safeRing.push({ x: this.x, z: this.z, heading: this.heading });
    if (this.safeRing.length > 4) this.safeRing.shift();
  }

  // ------------------------------------------------------------------ combos and score

  private addEntry(e: Entry): Entry {
    const same = this.combo.filter((q) => q.id === e.id && q.key === e.key).length;
    e.decay = Math.pow(REPEAT_DECAY, same);
    this.combo.push(e);
    this.stats.tricks++;
    this.linkT = -1;
    this.emit({ type: 'trick', entry: e });
    return e;
  }

  /** The combo's sum of points (after repeats) and its value (sum × tricks). */
  comboSum(): number {
    let s = 0;
    for (const e of this.combo) s += Math.round(e.pts * e.decay);
    return s;
  }

  comboValue(): number {
    return this.comboSum() * this.combo.length;
  }

  private checkCombo(dt: number): void {
    if (this.linkT < 0) return;
    if (this.state !== 'ground') return;
    this.linkT -= dt;
    if (this.linkT <= 0) this.bank();
  }

  private bank(): void {
    this.linkT = -1;
    if (!this.combo.length) return;
    const quality = this.landQ, mult = LAND_MULT[quality];
    const sum = this.comboSum();
    const v = Math.round(this.comboValue() * mult);
    const entries = this.combo;
    this.combo = [];
    this.landQ = 'clean';
    this.score += v;
    this.stats.combos++;
    this.stats.bestCombo = Math.max(this.stats.bestCombo, v);
    this.stats.comboRails.clear();
    const was = this.specialReady;
    this.special = Math.min(1, this.special + v / this.tune.specialFill);
    if (this.special >= 1 && !was) { this.specialReady = true; this.emit({ type: 'specialReady' }); }
    this.emit({ type: 'combo', score: v, tricks: entries.length, entries, sum, quality, mult });
    this.goalCheck('combo', v);
    this.goalCheck('score', this.score);
    if (entries.some((e) => e.id === 'spin')) this.goalCheck('spin', this.stats.maxSpin);
    if (this.stats.specials > 0) this.goalCheck('special', this.stats.specials);
    if (this.stats.vertHeight > 0) this.goalCheck('vert', this.stats.vertHeight);
  }

  // ------------------------------------------------------------------ collectibles and goals

  private checkTapes(): void {
    const tp = this.park.tapes;
    for (let i = 0; i < tp.length; i++) {
      if (this.tapes[i]) continue;
      const [x, y, z] = tp[i];
      if (Math.abs(x - this.x) > 1.6 || Math.abs(z - this.z) > 1.6) continue;
      if (Math.hypot(x - this.x, y - (this.y + 0.7), z - this.z) < 1.5) {
        this.tapes[i] = true;
        this.emit({ type: 'tape', i, x, y, z });
        this.goalCheck('tapes', this.tapes.filter(Boolean).length);
      }
    }
  }

  /** Marks goals of this kind reached by `value` (and `tag` for landmarks). */
  goalCheck(kind: GoalDef['kind'], value: number, tag?: string): void {
    for (const gl of this.park.goals) {
      if (gl.kind !== kind || this.done.has(gl.id)) continue;
      if (gl.tag && gl.tag !== tag) continue;
      const need = gl.kind === 'score' || gl.kind === 'combo' ? Math.round(gl.n * this.tune.goalScale / 500) * 500 : gl.n;
      if (value >= need) {
        this.done.add(gl.id);
        this.emit({ type: 'goal', goal: gl });
      }
    }
  }

  /** What a goal asks for in this mode (score goals scale in Easy). */
  goalNeed(gl: GoalDef): number {
    return gl.kind === 'score' || gl.kind === 'combo' ? Math.round(gl.n * this.tune.goalScale / 500) * 500 : gl.n;
  }

  // ------------------------------------------------------------------ test hooks (screenshots)

  /** Up into the air from here at `vy`, keeping the ground speed. */
  testAir(vy: number): void {
    const hx = Math.sin(this.heading), hz = Math.cos(this.heading);
    this.takeOff(hx * this.speed, vy, hz * this.speed, false);
  }

  /** Onto a rail (by id) at `u` along its first segment. */
  testGrind(rail: string, u = 0.2, dir: 1 | -1 = 1, d = -1): void {
    const seg = this.park.segs.find((q) => q.rail.id === rail);
    if (!seg) return;
    this.x = seg.ax + (seg.bx - seg.ax) * u; this.z = seg.az + (seg.bz - seg.az) * u; this.y = seg.ay + (seg.by - seg.ay) * u + 0.3;
    this.heading = Math.atan2(seg.dx * dir, seg.dz * dir);
    this.vx = seg.dx * dir * Math.max(4, this.speed); this.vz = seg.dz * dir * Math.max(4, this.speed); this.vy = -1;
    this.takeOff(this.vx, -1, this.vz, false);
    this.air!.t = 0.2;
    this.tryGrind({ ...NO_INPUT, grind: true, dir: d });
  }

  testManual(nose = false): void { if (this.state === 'ground') this.startManual(nose); }

  // ------------------------------------------------------------------ for the view and the bot

  /** The flip in progress: 0…1, or −1. */
  flipProgress(): number {
    const f = this.air?.flip;
    return f ? clamp(f.t / (f.def.dur ?? 0.4), 0, 1) : -1;
  }

  /** Seconds until the board meets the ground below, flying as now (air only). */
  timeToLand(): number {
    if (this.state !== 'air') return 0;
    let x = this.x, y = this.y, z = this.z, vy = this.vy;
    for (let t = 0; t < 4; t += 1 / 30) {
      vy -= G / 30;
      x += this.vx / 30; y += vy / 30; z += this.vz / 30;
      if (y <= this.terrain.height(x, z)) return t;
    }
    return 4;
  }
}
