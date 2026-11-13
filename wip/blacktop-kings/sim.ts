// Blacktop Kings: the match itself, without any drawing. Solo play, the online host and the
// headless balance runs all step this same deterministic simulation (seeded random numbers, fixed
// steps), and the view, the guest's snapshots and the sound effects are driven by its state and
// its event list.
//
// Rules (street 3-on-3, half court, one hoop):
//   - a basket inside the arc is worth 2, from behind it 3, a dunk 2;
//   - after a made basket the other team takes the ball under the hoop, and after a defensive
//     rebound or a steal the ball must be taken back behind the arc before the next shot;
//   - a 14 s shot clock, a 3:00 game clock, first to 21 wins at once; level after the clock: the
//     next basket wins;
//   - three baskets in a row put a team "on fire" (better odds) until the other team scores.
import {
  ARC_R, BALL_R, BOARD_HALF_W, BOARD_X, BOARD_Y0, BOARD_Y1, BOUNDS, DUNK_R, HOOP_X, HOOP_Z, RIM_R, RIM_Y,
  TIP_BALL, TIP_SPOTS, hoopDist, isCleared, isThree,
} from './court';
import { aiIntent, type AiLevel } from './ai';
import { G, SUB, ballStep, judge, launch, noHit, predict, type Body, type Hit } from './hoop';
import { REACH_M, SHOULDER_M, ARM_M } from './body';
import { MOVES, M_CROSS, M_BTL, M_BTB, M_SPIN, M_HESI, DUNKS, D_ALLEY, D_BTL, D_HANG, D_POWER, D_REVERSE, D_360, D_TOMAHAWK, D_WINDMILL, GATHER_MAX, GATHER_V } from './moves';

export type Act = 'free' | 'shot' | 'dunk' | 'pass' | 'steal' | 'jump' | 'cross' | 'stumble';
export const ACTS: Act[] = ['free', 'shot', 'dunk', 'pass', 'steal', 'jump', 'cross', 'stumble'];
export type BallState = 'held' | 'pass' | 'shot' | 'rattle' | 'loose' | 'dead' | 'tip';
export const BALL_STATES: BallState[] = ['held', 'pass', 'shot', 'rattle', 'loose', 'dead', 'tip'];
export type Phase = 'tip' | 'play' | 'final';
export const PHASES: Phase[] = ['tip', 'play', 'final'];

// ------------------------------------------------------------------ tuning

/** Seconds from the jump to its top: let go of SHOOT here for a perfect shot. */
export const PEAK = 0.55;
export const PERFECT = 0.05;
export const GOOD = 0.12;
/** A held shot goes by itself (late) this long after the jump. */
export const SHOT_AUTO = 1.0;
const SHOT_JUMP = 0.72;
const SHOT_LAND = 1.12;
const JUMP_T = 0.72, JUMP_H = 0.95;
const PASS_T = 0.28, STEAL_T = 0.4, STUMBLE_T = 0.9;
export const RUN = 5.0;
export const TURBO = 1.42;
const DRAIN = 34, REGEN = 15, CROSS_COST = 22;
/** A move started this soon after the last one ended is mistimed: easier to read, easier to strip. */
const MOVE_GAP = 0.45;
export const SHOT_CLOCK = 14;
export const GAME_S = 180;
export const WIN_PTS = 21;
/** Where a jump shot leaves the hands (above the floor, before the jump) and a dribbled ball is held. */
export const SHOT_Y = SHOULDER_M + ARM_M * 0.9 + 0.2;
const HOLD_Y = 0.75;
const CATCH_R = 0.9;
const PICK_R = 0.75;

export interface Input {
  /** Stick in world axes: +x towards the hoop, +z towards the camera (-1..1). */
  mx: number;
  mz: number;
  turbo: boolean;
  /** SHOOT went down this step (on defence: jump). */
  shootDown: boolean;
  /** SHOOT came up this step after being held this many seconds; -1 otherwise. */
  shootUp: number;
  pass: boolean;
  /** Pass to this player (a click on a teammate); -1 picks by the stick. */
  passTo: number;
  jump: boolean;
  /** Offence: crossover. Defence: steal. */
  action: boolean;
  /** Defence: control the teammate nearest the ball. */
  swap: boolean;
}
export const NO_INPUT: Input = { mx: 0, mz: 0, turbo: false, shootDown: false, shootUp: -1, pass: false, passTo: -1, jump: false, action: false, swap: false };

export interface Intent {
  mx: number;
  mz: number;
  turbo: boolean;
  shoot: boolean;
  /** AI: how long it will hold the shot (s); -1 waits for a release. */
  hold: number;
  release: number;
  pass: number;          // -2 none, -1 pick by dir, else player id
  dir: { x: number; z: number } | null;
  jump: boolean;
  steal: boolean;
  cross: boolean;
  /** Facing while standing (radians), or NaN. */
  face: number;
}
export const idle = (): Intent => ({ mx: 0, mz: 0, turbo: false, shoot: false, hold: -1, release: -1, pass: -2, dir: null, jump: false, steal: false, cross: false, face: NaN });

export interface Player {
  id: number;
  team: 0 | 1;
  slot: number;
  x: number; z: number; vx: number; vz: number;
  face: number;
  lift: number;
  act: Act;
  actT: number;
  /** The dribble move (act 'cross') or the dunk (act 'dunk'): an index into moves.ts. */
  kind: number;
  stamina: number;
  turbo: boolean;
  stealCd: number;
  // a jump shot: where it started, when to let go (AI), whether it has gone
  hold: number;
  released: boolean;
  // a dunk: from where to where
  dx0: number; dz0: number; dx1: number; dz1: number; gx: number; gz: number; gT: number; slammed: boolean;
  crossX: number; crossZ: number; crossHit: boolean; riskHit: boolean; moveEnd: number; spam: boolean;
  squeakT: number;
  // AI memory
  aiT: number; aiGoalX: number; aiGoalZ: number; aiMode: number; aiSpot: number; aiSpotT: number; aiJumpAt: number; aiTurbo: boolean;
}

export interface Ball {
  x: number; y: number; z: number; vx: number; vy: number; vz: number;
  state: BallState;
  holder: number;
  // a flight (pass or shot) from 0 to 1 in fT seconds
  x0: number; y0: number; z0: number; x1: number; y1: number; z1: number; vy0: number; ft: number; fT: number;
  pts: number;
  shooter: number;
  receiver: number;
  /** A shot: rim contacts so far, whether it hit the board, time since the last rim sound, a perfect release. */
  rims: number;
  board: boolean;
  rimT: number;
  perfect: boolean;
  /** After a basket or a violation only this team may pick the ball up (-1: anyone). */
  inTeam: number;
  /** Players that already tried to block or intercept this flight (bits). */
  tried: number;
  lastTeam: number;
  legal: boolean;
  dunk: boolean;
  spin: number;
}

export type EvKind =
  | 'shoot' | 'release' | 'make' | 'swish' | 'rim' | 'board' | 'airball' | 'miss' | 'dunk' | 'slam' | 'block'
  | 'steal' | 'intercept' | 'pass' | 'catch' | 'cross' | 'ankles' | 'needClear' | 'cleared' | 'shotClock'
  | 'fire' | 'fireOut' | 'toss' | 'tip' | 'jump' | 'land' | 'squeak' | 'bounce' | 'rebound' | 'pickup'
  | 'overtime' | 'end' | 'switch' | 'clockOut' | 'bank';
export const EV_KINDS: EvKind[] = [
  'shoot', 'release', 'make', 'swish', 'rim', 'board', 'airball', 'miss', 'dunk', 'slam', 'block',
  'steal', 'intercept', 'pass', 'catch', 'cross', 'ankles', 'needClear', 'cleared', 'shotClock',
  'fire', 'fireOut', 'toss', 'tip', 'jump', 'land', 'squeak', 'bounce', 'rebound', 'pickup',
  'overtime', 'end', 'switch', 'clockOut', 'bank',
];
/** An event: kind, the player (or team) it is about, and a number (points, quality …). */
export interface Ev { k: EvKind; p: number; a: number }

export interface TeamStats {
  pts: number; fga: number; fgm: number; threes: number; threesMade: number; dunks: number; dunkTries: number;
  passes: number; steals: number; blocks: number; takeBacks: number; perfect: number; turnovers: number; rebounds: number;
}
const newStats = (): TeamStats => ({ pts: 0, fga: 0, fgm: 0, threes: 0, threesMade: 0, dunks: 0, dunkTries: 0, passes: 0, steals: 0, blocks: 0, takeBacks: 0, perfect: 0, turnovers: 0, rebounds: 0 });

export interface GameOpts {
  seed: number;
  /** Per team: the AI level of a computer team, or null when a person plays it. */
  ai: [AiLevel | null, AiLevel | null];
  /** The AI of a human team's other two players. */
  mates: AiLevel;
  seconds?: number;
  winPts?: number;
}

export function mulberry(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), a | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);

function newPlayer(id: number): Player {
  return {
    id, team: id < 3 ? 0 : 1, slot: id % 3, x: 0, z: 0, vx: 0, vz: 0, face: 0, lift: 0, act: 'free', actT: 0, kind: 0, stamina: 100, turbo: false,
    stealCd: 0, hold: -1, released: false, dx0: 0, dz0: 0, dx1: 0, dz1: 0, gx: 0, gz: 0, gT: 0, slammed: false, crossX: 0, crossZ: 0, crossHit: false, riskHit: false, moveEnd: -9, spam: false, squeakT: 0,
    aiT: 0, aiGoalX: 0, aiGoalZ: 0, aiMode: 0, aiSpot: -1, aiSpotT: 0, aiJumpAt: -1, aiTurbo: false,
  };
}

export class Game {
  readonly p: Player[] = [0, 1, 2, 3, 4, 5].map(newPlayer);
  readonly ball: Ball = {
    x: TIP_BALL.x, y: 1.2, z: TIP_BALL.z, vx: 0, vy: 0, vz: 0, state: 'tip', holder: -1,
    x0: 0, y0: 0, z0: 0, x1: 0, y1: 0, z1: 0, vy0: 0, ft: 0, fT: 1, pts: 2, shooter: -1, receiver: -1,
    rims: 0, board: false, rimT: 0, perfect: false, inTeam: -1, tried: 0, lastTeam: -1, legal: true, dunk: false, spin: 0,
  };
  score: [number, number] = [0, 0];
  clock: number;
  shotClock = SHOT_CLOCK;
  phase: Phase = 'tip';
  phaseT = 0;
  /** The team with the ball (-1 before the tip-off is caught). */
  offence = -1;
  /** The team with the ball has taken it behind the arc since it won it. */
  cleared = true;
  fire: [boolean, boolean] = [false, false];
  streak: [number, number] = [0, 0];
  overtime = false;
  winner = -1;
  /** Per team: the player a person controls (-1 for a computer team). */
  ctrl: [number, number];
  events: Ev[] = [];
  stats: [TeamStats, TeamStats] = [newStats(), newStats()];
  t = 0;
  rnd: () => number;
  readonly winPts: number;
  /** AI levels in force (per team, for every player of a computer team). */
  readonly ai: [AiLevel | null, AiLevel | null];
  readonly mates: AiLevel;
  private tipT = 0;
  private tipped = false;

  constructor(o: GameOpts) {
    this.rnd = mulberry(o.seed);
    this.ai = o.ai;
    this.mates = o.mates;
    this.clock = o.seconds ?? GAME_S;
    this.winPts = o.winPts ?? WIN_PTS;
    this.ctrl = [o.ai[0] ? -1 : 0, o.ai[1] ? -1 : 3];
    this.placeTip();
  }

  private placeTip(): void {
    for (const p of this.p) {
      const s = TIP_SPOTS[p.team][p.slot];
      p.x = s.x; p.z = s.z; p.vx = p.vz = 0;
      p.face = p.team === 0 ? Math.PI / 2 : -Math.PI / 2;
      p.act = 'free'; p.lift = 0;
    }
    const b = this.ball;
    b.state = 'tip'; b.x = TIP_BALL.x; b.z = TIP_BALL.z; b.y = 1.25; b.vx = b.vy = b.vz = 0; b.holder = -1;
    this.phase = 'tip'; this.phaseT = 0; this.tipT = 0; this.tipped = false;
  }

  /** The level an AI player plays at. */
  levelOf(p: Player): AiLevel {
    return this.ai[p.team] ?? this.mates;
  }

  /** True when a person steers this player now. */
  human(p: Player): boolean {
    return this.ctrl[p.team] === p.id;
  }

  holder(): Player | null {
    return this.ball.state === 'held' && this.ball.holder >= 0 ? this.p[this.ball.holder] : null;
  }

  private ev(k: EvKind, p = -1, a = 0): void {
    this.events.push({ k, p, a });
  }

  get inPlay(): boolean {
    return this.phase === 'play';
  }

  // ------------------------------------------------------------------ the step

  step(dt: number, inputs: [Input | null, Input | null]): void {
    this.events.length = 0;
    this.t += dt;
    this.phaseT += dt;
    const intents = this.p.map((p) => this.intentOf(p, inputs[p.team], dt));
    for (const team of [0, 1] as const) {
      const inp = inputs[team];
      if (inp?.swap && this.ctrl[team] >= 0) this.swap(team);
    }
    if (this.phase === 'play') this.tickClocks(dt);
    for (let i = 0; i < 6; i++) this.applyIntent(this.p[i], intents[i], dt);
    this.separate();
    this.moveBall(dt);
    this.rules();
  }

  private intentOf(p: Player, inp: Input | null, dt: number): Intent {
    if (this.phase === 'final') return idle();
    if (inp && this.human(p) && !this.autopilot(p)) return this.fromInput(p, inp);
    return aiIntent(this, p, this.levelOf(p), dt);
  }

  /** A person's player that the game moves for a moment (picking the ball up after a basket). */
  private autopilot(p: Player): boolean {
    const b = this.ball;
    return (b.inTeam === p.team && b.state === 'loose' && this.inbounder(p.team) === p.id) || (b.state === 'pass' && b.receiver === p.id && this.phase === 'tip');
  }

  private fromInput(p: Player, inp: Input): Intent {
    const it = idle();
    it.mx = inp.mx; it.mz = inp.mz; it.turbo = inp.turbo;
    const mine = this.ball.holder === p.id && this.ball.state === 'held';
    if (mine) {
      if (inp.shootDown) it.shoot = true;
      if (inp.pass) { it.pass = inp.passTo >= 0 ? inp.passTo : -1; it.dir = Math.hypot(inp.mx, inp.mz) > 0.3 ? { x: inp.mx, z: inp.mz } : null; }
      if (inp.action) it.cross = true;
    } else {
      if (inp.shootDown || inp.jump) it.jump = true;
      if (inp.action) it.steal = true;
    }
    if (inp.shootUp >= 0) it.release = inp.shootUp;
    // a defender that stands still keeps facing the ball
    const h = this.holder();
    if (h && h.team !== p.team) it.face = Math.atan2(h.x - p.x, h.z - p.z);
    return it;
  }

  /** Control passes to the teammate nearest the ball (not the current one). */
  swap(team: 0 | 1): void {
    const b = this.ball;
    const mates = this.p.filter((q) => q.team === team && q.id !== this.ctrl[team] && q.act !== 'dunk');
    if (!mates.length || (b.state === 'held' && this.p[b.holder].team === team)) return;
    mates.sort((a, c) => Math.hypot(a.x - b.x, a.z - b.z) - Math.hypot(c.x - b.x, c.z - b.z));
    this.ctrl[team] = mates[0].id;
    this.ev('switch', mates[0].id);
  }

  private tickClocks(dt: number): void {
    const b = this.ball;
    const live = b.inTeam < 0 && b.state !== 'dead' && this.offence >= 0;
    if (!live) return;
    if (this.clock > 0) {
      this.clock -= dt;
      if (this.clock <= 0) { this.clock = 0; this.ev('clockOut'); }
    }
    if (b.state === 'held' || b.state === 'pass' || b.state === 'loose') this.shotClock -= dt;
  }

  // ------------------------------------------------------------------ actions

  private applyIntent(p: Player, it: Intent, dt: number): void {
    const b = this.ball;
    p.stealCd = Math.max(0, p.stealCd - dt);
    p.squeakT = Math.max(0, p.squeakT - dt);
    p.actT += dt;
    const has = b.state === 'held' && b.holder === p.id;
    if (this.phase === 'play' || this.phase === 'tip') {
      if (p.act === 'free' || p.act === 'pass' && p.actT > 0.12) {
        if (has && it.shoot && this.phase === 'play') this.tryShot(p, it.hold);
        else if (has && it.pass > -2 && this.phase === 'play') this.doPass(p, it.pass, it.dir);
        else if (has && it.cross && p.stamina >= CROSS_COST * 0.5 && p.act === 'free') this.startMove(p, it);
        else if (!has && it.jump && p.act === 'free') this.setAct(p, 'jump'), this.ev('jump', p.id);
        else if (!has && it.steal && p.act === 'free' && p.stealCd <= 0 && this.phase === 'play') { this.setAct(p, 'steal'); p.stealCd = 0.65; }
      }
      if (p.act === 'shot' && !p.released && it.release >= 0) this.release(p, it.release - PEAK);
    }
    this.moveFigure(p, it, dt);
  }

  private setAct(p: Player, a: Act): void {
    p.act = a;
    p.actT = 0;
  }

  private tryShot(p: Player, hold: number): void {
    const d = hoopDist(p.x, p.z);
    if (!this.cleared && !isCleared(p.x, p.z)) {
      // after a rebound or a steal the ball goes behind the arc first
      this.ev('needClear', p.id);
      return;
    }
    if (d < DUNK_R && this.inLane(p)) { this.startDunk(p); return; }
    this.setAct(p, 'shot');
    p.hold = hold;
    p.released = false;
    p.vx *= 0.3; p.vz *= 0.3;
    p.face = Math.atan2(HOOP_X - p.x, HOOP_Z - p.z);
    this.ev('shoot', p.id);
  }

  /** The player is near enough to the rim for a dunk and not right under it. */
  private inLane(p: Player): boolean {
    return p.x < HOOP_X + 0.35;
  }

  /**
   * A dunk: gather steps to its take-off spot, the flight to the rim, the slam, the hang and the
   * drop. actT runs from minus the gather time, so 0 is the take-off for every kind.
   */
  private startDunk(p: Player, kind = this.pickDunk(p)): void {
    const D = DUNKS[kind];
    const d = Math.max(0.01, hoopDist(p.x, p.z));
    const ux = (p.x - HOOP_X) / d, uz = (p.z - HOOP_Z) / d;
    const tg = clamp((d - D.takeoff) / GATHER_V, 0, GATHER_MAX);
    const take = Math.max(D.reach + 0.3, d - tg * GATHER_V);
    this.setAct(p, 'dunk');
    p.actT = -tg;
    p.gT = tg;
    p.kind = kind;
    p.dx0 = p.x; p.dz0 = p.z;
    p.gx = HOOP_X + ux * take; p.gz = HOOP_Z + uz * take;
    p.dx1 = HOOP_X + ux * D.reach; p.dz1 = HOOP_Z + uz * D.reach;
    p.face = Math.atan2(-ux, -uz);
    p.slammed = false;
    p.vx = p.vz = 0;
    this.ball.tried = 0;
    this.stats[p.team].dunkTries++;
    this.ev('dunk', p.id, kind);
  }

  /** Which dunk: the approach (from the baseline: a reverse), the speed, turbo, the fire, and luck. */
  private pickDunk(p: Player): number {
    const sp = Math.hypot(p.vx, p.vz);
    const baseline = p.x > HOOP_X - 0.9 && Math.abs(p.z - HOOP_Z) > 0.5;
    const w = [1, 1, baseline ? 2.4 : 0.12, 0.35, 0.45, 0, 0.05, 0.4];
    if (sp > 4) { w[D_TOMAHAWK] += 1.2; w[D_WINDMILL] += 0.5; w[D_360] += 0.3; w[D_POWER] -= 0.5; w[D_HANG] -= 0.2; }
    if (sp < 2) { w[D_POWER] += 0.9; w[D_HANG] += 0.6; w[D_TOMAHAWK] -= 0.4; w[D_WINDMILL] -= 0.3; }
    if (p.turbo) { w[D_WINDMILL] += 0.8; w[D_360] += 0.8; }
    if (this.fire[p.team]) { w[D_BTL] += 0.5; w[D_360] += 0.6; w[D_WINDMILL] += 0.4; }
    let sum = 0;
    for (let i = 0; i < w.length; i++) { w[i] = Math.max(0, w[i]); sum += w[i]; }
    let r = this.rnd() * sum;
    for (let i = 0; i < w.length; i++) { r -= w[i]; if (r <= 0) return i; }
    return D_POWER;
  }

  /**
   * A dribble move. A person picks it with the stick (relative to the way the player faces):
   * ahead = hesitation, to a side = crossover (between the legs with a defender right on him),
   * back to a side = behind the back, straight back = spin; with the stick centred the game
   * picks one for the defender in front. The computer picks by the same context. The kind's
   * bit 3 says the move goes to the player's right.
   */
  private startMove(p: Player, it: Intent): void {
    const fx = Math.sin(p.face), fz = Math.cos(p.face);       // ahead
    const lx = Math.cos(p.face), lz = -Math.sin(p.face);      // the player's left
    const foe = this.nearestFoe(p);
    const fd = foe ? Math.hypot(foe.x - p.x, foe.z - p.z) : 99;
    const front = foe && fd < 1.6 ? ((foe.x - p.x) * fx + (foe.z - p.z) * fz) / (fd || 1) > 0.3 : false;
    const foeSide = foe ? Math.sign((foe.x - p.x) * lx + (foe.z - p.z) * lz) || 1 : 1;
    const stick = Math.hypot(it.mx, it.mz) > 0.3 ? { x: it.mx, z: it.mz } : null;
    let kind: number, side: number;
    const r = this.rnd;
    if (stick && this.human(p)) {
      const sl = Math.hypot(stick.x, stick.z);
      const ahead = (stick.x * fx + stick.z * fz) / sl, left = (stick.x * lx + stick.z * lz) / sl;
      const a = Math.acos(clamp(ahead, -1, 1));
      side = left >= 0 ? 1 : -1;
      if (a < 0.55) kind = M_HESI;
      else if (a < 1.6) kind = front && fd < 1.15 ? M_BTL : M_CROSS;
      else if (a < 2.5) kind = M_BTB;
      else kind = M_SPIN;
      if (kind === M_SPIN) side = -foeSide;
    } else {
      // away from the defender's side; by context with some variety
      side = stick ? ((stick.x * lx + stick.z * lz) >= 0 ? 1 : -1) : -foeSide;
      const roll = r();
      if (front && fd < 1.15) kind = roll < 0.35 ? M_SPIN : roll < 0.7 ? M_BTL : roll < 0.85 ? M_BTB : M_CROSS;
      else if (front) kind = roll < 0.45 ? M_CROSS : roll < 0.7 ? M_HESI : roll < 0.85 ? M_BTB : M_BTL;
      else kind = roll < 0.5 ? M_HESI : M_CROSS;
      if (kind === M_SPIN) side = -foeSide;
    }
    const m = MOVES[kind];
    this.setAct(p, 'cross');
    p.kind = kind + (side < 0 ? 8 : 0);
    p.stamina = Math.max(0, p.stamina - m.cost);
    p.spam = this.t - p.moveEnd < MOVE_GAP;
    // the burst: to the side (crossover, between the legs), to the side and a little back (behind
    // the back), round the defender (spin), straight on (hesitation, or towards the stick)
    let dx: number, dz: number;
    if (kind === M_HESI) {
      dx = stick ? stick.x : fx; dz = stick ? stick.z : fz;
    } else if (kind === M_SPIN) {
      dx = lx * side * 0.75 + fx * 0.66; dz = lz * side * 0.75 + fz * 0.66;
    } else if (kind === M_BTB) {
      dx = lx * side * 0.9 + fx * 0.25; dz = lz * side * 0.9 + fz * 0.25;
    } else {
      dx = lx * side; dz = lz * side;
    }
    const dl = Math.hypot(dx, dz) || 1;
    p.crossX = dx / dl; p.crossZ = dz / dl; p.crossHit = false; p.riskHit = false;
    this.ev('cross', p.id, p.kind);
  }

  nearestFoe(p: Player): Player | null {
    let best: Player | null = null, bd = 1e9;
    for (const q of this.p) {
      if (q.team === p.team) continue;
      const d = Math.hypot(q.x - p.x, q.z - p.z);
      if (d < bd) { bd = d; best = q; }
    }
    return best;
  }

  /** Distance from a player to the nearest opponent. */
  openness(p: Player): number {
    const q = this.nearestFoe(p);
    return q ? Math.hypot(q.x - p.x, q.z - p.z) : 99;
  }

  private doPass(p: Player, to: number, dir: { x: number; z: number } | null): void {
    const mates = this.p.filter((q) => q.team === p.team && q.id !== p.id);
    let r: Player | undefined = to >= 0 ? mates.find((q) => q.id === to) : undefined;
    if (!r && dir) {
      const dl = Math.hypot(dir.x, dir.z) || 1;
      let best = -2;
      for (const q of mates) {
        const rx = q.x - p.x, rz = q.z - p.z, rl = Math.hypot(rx, rz) || 1;
        const s = (rx * dir.x + rz * dir.z) / (rl * dl);
        if (s > best) { best = s; r = q; }
      }
      if (best < 0.2) r = undefined;
    }
    if (!r) r = mates.reduce((a, c) => (this.openness(c) - hoopDist(c.x, c.z) * 0.05 > this.openness(a) - hoopDist(a.x, a.z) * 0.05 ? c : a));
    const b = this.ball;
    const d0 = Math.hypot(r.x - p.x, r.z - p.z);
    if (this.alleyOop(p, r, d0)) return;
    const T = clamp(d0 / 13 + 0.1, 0.2, 0.85);
    // a lead pass: where the receiver will be
    let tx = r.x + r.vx * T * 0.75, tz = r.z + r.vz * T * 0.75;
    tx = clamp(tx, BOUNDS.x0, BOUNDS.x1); tz = clamp(tz, BOUNDS.z0, BOUNDS.z1);
    p.face = Math.atan2(tx - p.x, tz - p.z);
    this.setAct(p, 'pass');
    this.flight(p.x + Math.sin(p.face) * 0.4, 1.3, p.z + Math.cos(p.face) * 0.4, tx, 1.25, tz, T, 'pass');
    b.receiver = r.id;
    b.holder = -1;
    b.tried = 0;
    b.lastTeam = p.team;
    if (this.ctrl[p.team] >= 0) this.ctrl[p.team] = r.id;
    this.stats[p.team].passes++;
    this.ev('pass', p.id, r.id);
  }

  /**
   * A pass to a teammate cutting hard to the rim, with room, becomes an alley-oop: a lob to above
   * the rim, timed to meet him at the top of his jump, and he throws it down.
   */
  private alleyOop(p: Player, r: Player, d0: number): boolean {
    if (this.phase !== 'play' || r.act !== 'free' || !this.cleared || d0 < 2.4) return false;
    const d = hoopDist(r.x, r.z);
    const toward = (r.vx * (HOOP_X - r.x) + r.vz * (HOOP_Z - r.z)) / Math.max(0.01, d);
    if (d > 4.4 || d < 1.4 || toward < 2.6 || r.x > HOOP_X + 0.3 || this.openness(r) < 0.9) return false;
    if (!this.human(p) && this.rnd() > 0.8) return false;
    const b = this.ball;
    this.startDunk(r, D_ALLEY);
    const D = DUNKS[D_ALLEY];
    // where he will be when the lob meets him (most of the way up)
    const u = 0.78, k = u * u * (3 - 2 * u);
    const cx = r.gx + (r.dx1 - r.gx) * k, cz = r.gz + (r.dz1 - r.gz) * k;
    const cy = REACH_M + Math.sin(u * Math.PI / 2) * D.height - 0.05;
    const T = Math.max(0.5, r.gT + D.rise * u);
    p.face = Math.atan2(cx - p.x, cz - p.z);
    this.setAct(p, 'pass');
    this.flight(p.x + Math.sin(p.face) * 0.4, 1.5, p.z + Math.cos(p.face) * 0.4, cx, cy, cz, T, 'pass');
    b.receiver = r.id;
    b.holder = -1;
    b.tried = 0;
    b.lastTeam = p.team;
    if (this.ctrl[p.team] >= 0) this.ctrl[p.team] = r.id;
    this.stats[p.team].passes++;
    this.ev('pass', p.id, r.id);
    return true;
  }

  private flight(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, T: number, state: BallState, g = G): void {
    const b = this.ball;
    b.state = state;
    b.x0 = x0; b.y0 = y0; b.z0 = z0; b.x1 = x1; b.y1 = y1; b.z1 = z1;
    b.fT = T; b.ft = 0;
    b.vy0 = (y1 - y0 + 0.5 * g * T * T) / T;
    b.x = x0; b.y = y0; b.z = z0;
    b.vx = (x1 - x0) / T; b.vz = (z1 - z0) / T; b.vy = b.vy0;
  }

  /** The shot leaves the hands: `err` is how far from the top of the jump it went (s). */
  private release(p: Player, err: number): void {
    p.released = true;
    const b = this.ball;
    const d = hoopDist(p.x, p.z);
    const three = isThree(p.x, p.z);
    const st = this.stats[p.team];
    st.fga++;
    if (three) st.threes++;
    const lv = this.human(p) ? null : this.levelOf(p);
    const e = Math.abs(err);
    const perfect = e <= PERFECT;
    if (perfect) st.perfect++;
    // base odds by distance, then the timing, the closest defender and the fire
    let base = d < 2.5 ? 0.7 : d < 4.5 ? 0.56 : d <= ARC_R ? 0.47 : 0.4 - Math.max(0, d - ARC_R - 0.6) * 0.09;
    base = Math.max(0.05, base);
    const timing = perfect ? 1.75 : e <= GOOD ? 1.12 : e <= 0.2 ? 0.75 : 0.35;
    const foe = this.nearestFoe(p);
    const fd = foe ? Math.hypot(foe.x - p.x, foe.z - p.z) : 9;
    const toHoop = foe ? (foe.x - p.x) * (HOOP_X - p.x) + (foe.z - p.z) * (HOOP_Z - p.z) > 0 : false;
    const contest = !toHoop ? (fd < 1 ? 0.85 : 1) : fd < 0.9 ? 0.55 : fd < 1.6 ? 0.78 : fd < 2.3 ? 0.92 : 1;
    let pm = base * timing * (perfect ? 0.55 + 0.45 * contest : contest);
    if (this.fire[p.team]) pm = pm * 1.15 + 0.12;
    if (lv) pm *= lv.aim;
    pm = clamp(pm, 0.02, perfect ? 0.97 : 0.9);
    const make = this.rnd() < pm;
    b.pts = three ? 3 : 2;
    b.shooter = p.id;
    b.legal = this.cleared || isCleared(p.x, p.z);
    b.dunk = false;
    b.tried = 0;
    b.lastTeam = p.team;
    b.spin = perfect ? 2 : 1;
    b.rims = 0; b.board = false; b.rimT = 1; b.perfect = perfect;
    const sx = p.x + Math.sin(p.face) * 0.25, sz = p.z + Math.cos(p.face) * 0.25;
    this.aimShot(p, { x: sx, y: SHOT_Y + p.lift, z: sz }, make, perfect ? 0 : e <= GOOD ? 1 : e <= 0.2 ? 2 : 3, err);
    b.holder = -1;
    this.ev('release', p.id, perfect ? 3 : e <= GOOD ? 2 : e <= 0.2 ? 1 : 0);
    // a defender in the air right in front of the shooter may swat it at once
    for (const q of this.p) {
      if (q.team === p.team || q.act !== 'jump' || q.lift < 0.3) continue;
      const qd = Math.hypot(q.x - p.x, q.z - p.z);
      if (qd > 1.35) continue;
      b.tried |= 1 << q.id;
      const lvq = this.human(q) ? null : this.levelOf(q);
      const chance = (0.62 - qd * 0.3) * (lvq ? lvq.block : 1);
      if (this.rnd() < chance) { this.swat(q, p); return; }
    }
  }

  /**
   * Sends the shot on its way. The odds already decided make or miss; the arc is then chosen so
   * the physics agrees: candidate releases (by the quality of the timing: a perfect one aims at the
   * middle of the ring, a poor one near the rim's edge, an early one short, a late one long, now
   * and then off the glass) are run ahead through the same steps (hoop.ts) until one ends as
   * decided. Deterministic: the seeded random numbers pick the candidates.
   */
  private aimShot(p: Player, s: { x: number; y: number; z: number }, make: boolean, q: number, err: number): void {
    const b = this.ball, r = this.rnd;
    const d = Math.max(0.5, hoopDist(s.x, s.z));
    const ux = (HOOP_X - s.x) / d, uz = (HOOP_Z - s.z) / d;      // along the shot
    const wx = -uz, wz = ux;                                     // across it
    const T = 0.72 + d * 0.065;
    const gauss = () => { const u = Math.max(1e-6, r()), v = r(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };
    const tgt = { x: 0, y: 0, z: 0 };
    const at = (long: number, side: number, y = RIM_Y) => { tgt.x = HOOP_X + ux * long + wx * side; tgt.y = y; tgt.z = HOOP_Z + uz * long + wz * side; return tgt; };
    const v: Body = { x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0 };
    // off the glass: from the wings at mid range
    const angle = Math.abs(Math.atan2(s.z - HOOP_Z, HOOP_X - s.x));
    const bankable = d > 1.8 && d < 6 && angle > 0.35 && angle < 1.25;
    const bank = bankable && r() < (make ? 0.28 : 0.15);
    const sideSign = Math.sign(s.z - HOOP_Z) || 1;
    const sigma = [0.02, 0.05, 0.08, 0.1][q];
    let ok = false;
    for (let i = 0; i < 18 && !ok; i++) {
      let P: typeof tgt;
      if (bank && i < 8) {
        // a spot on the board above the rim, on the shooter's side
        P = { x: BOARD_X - BALL_R, y: RIM_Y + 0.25 + r() * 0.4, z: HOOP_Z + sideSign * (0.08 + r() * 0.32) };
      } else if (make) {
        const k = 1 + i * 0.2;
        // a clean release finds the middle; a rough one goes near the rim and may rattle in
        if (q >= 1 && i < 5 && r() < (q >= 2 ? 0.65 : 0.3)) { const a = r() * Math.PI * 2, m = 0.11 + r() * 0.09; P = at(Math.cos(a) * m, Math.sin(a) * m); }
        else P = at(gauss() * sigma * k, gauss() * sigma * 0.8 * k);
      } else {
        const roll = r();
        const short = err < -0.05 ? 0.65 : err > 0.05 ? 0.25 : 0.45;
        if (err < -0.24 && i < 3 && roll < 0.5) P = at(-(0.6 + r() * 0.35), gauss() * 0.15);            // air ball
        else if (roll < short * 0.7) P = at(-(0.17 + r() * 0.16), gauss() * 0.08);                         // front rim
        else if (roll < 0.7) P = at(0.17 + r() * 0.18, gauss() * 0.08);                                    // back rim
        else if (roll < 0.88) P = at(gauss() * 0.06, (r() < 0.5 ? -1 : 1) * (0.16 + r() * 0.14));          // off the side
        else { const a = r() * Math.PI * 2, m = 0.12 + r() * 0.1; P = at(Math.cos(a) * m, Math.sin(a) * m); } // on the edge: rattles
      }
      launch(s, P, T, v);
      ok = predict(v).made === make;
    }
    if (!ok) launch(s, make ? at(0, 0) : at(-0.8, 0), T, v);
    this.flight(s.x, s.y, s.z, s.x + v.vx * T, s.y + v.vy * T - 0.5 * G * T * T, s.z + v.vz * T, T, 'shot');
    b.vx = v.vx; b.vy = v.vy; b.vz = v.vz;
  }

  /** A blocked shot or dunk flies off the defender's hand. */
  private swat(q: Player, shooter: Player): void {
    const b = this.ball;
    const dx = b.x - q.x, dz = b.z - q.z, dl = Math.hypot(dx, dz) || 1;
    b.state = 'loose';
    b.holder = -1;
    b.vx = (dx / dl) * 4.5 + (this.rnd() - 0.5) * 2;
    b.vz = (dz / dl) * 4.5 + (this.rnd() - 0.5) * 2;
    b.vy = 2.5 + this.rnd() * 2;
    b.y = Math.max(b.y, 2.2);
    b.lastTeam = q.team;
    b.inTeam = -1;
    this.stats[q.team].blocks++;
    this.ev('block', q.id, shooter.id);
    if (shooter.act === 'dunk') { shooter.act = 'jump'; shooter.actT = JUMP_T * 0.5; }
  }

  // ------------------------------------------------------------------ movement

  private moveFigure(p: Player, it: Intent, dt: number): void {
    const b = this.ball;
    const human = this.human(p);
    const lv = this.levelOf(p);
    const has = b.state === 'held' && b.holder === p.id;
    let speed = RUN * (human ? 1 : lv.speed) * (has ? 0.94 : 1);
    let ctrl = 1;
    p.lift = 0;
    switch (p.act) {
      case 'shot': {
        ctrl = 0;
        const t = p.actT;
        p.lift = Math.max(0, Math.sin(Math.PI * Math.min(t, SHOT_LAND) / SHOT_LAND)) * SHOT_JUMP;
        if (!p.released) {
          if (p.hold >= 0 && t >= p.hold) this.release(p, t - PEAK);
          else if (t >= SHOT_AUTO) this.release(p, t - PEAK);
        }
        if (t >= SHOT_LAND) { this.setAct(p, 'free'); this.ev('land', p.id); }
        break;
      }
      case 'dunk': {
        ctrl = 0;
        const D = DUNKS[p.kind] ?? DUNKS[0];
        const t = p.actT;
        if (t < 0) {
          // the gather steps
          const u = p.gT > 0 ? 1 + t / p.gT : 1;
          p.x = p.dx0 + (p.gx - p.dx0) * u;
          p.z = p.dz0 + (p.gz - p.dz0) * u;
        } else if (t < D.rise) {
          const u = t / D.rise, k = u * u * (3 - 2 * u);
          p.x = p.gx + (p.dx1 - p.gx) * k;
          p.z = p.gz + (p.dz1 - p.gz) * k;
          p.lift = Math.sin(u * Math.PI / 2) * D.height;
          this.dunkBlocks(p, u);
        } else if (t < D.rise + D.hang) {
          // at the rim: the slam, then a moment hanging there (longer on a rim hang)
          const u = (t - D.rise) / D.hang;
          p.lift = D.height * (0.97 - (D.id === 'hang' ? 0.1 * u : 0.05 * u));
          if (!p.slammed) this.slam(p);
        } else if (t < D.rise + D.hang + D.drop) {
          const u = (t - D.rise - D.hang) / D.drop;
          const top = D.height * (D.id === 'hang' ? 0.87 : 0.92);
          p.lift = top * (1 - u * u);
        } else {
          this.setAct(p, 'free');
          this.ev('land', p.id);
        }
        p.vx = p.vz = 0;
        break;
      }
      case 'jump':
        p.lift = Math.sin(Math.PI * Math.min(1, p.actT / JUMP_T)) * JUMP_H;
        ctrl = 0.35;
        if (p.actT >= JUMP_T) { this.setAct(p, 'free'); this.ev('land', p.id); }
        break;
      case 'pass':
        ctrl = 0.6;
        if (p.actT >= PASS_T) this.setAct(p, 'free');
        break;
      case 'steal':
        ctrl = 0.45;
        if (p.actT >= 0.12 && p.actT - dt < 0.12) this.stealCheck(p);
        if (p.actT >= STEAL_T) this.setAct(p, 'free');
        break;
      case 'cross': {
        ctrl = 0;
        const m = MOVES[p.kind & 7] ?? MOVES[0];
        const u = p.actT / m.T;
        const fx = Math.sin(p.face), fz = Math.cos(p.face);
        if (u < m.go) {
          // the set-up: plant (a hesitation stops dead and rises up)
          const k = Math.max(0, 1 - dt * (m.id === 'hesi' ? 14 : 7));
          p.vx *= k; p.vz *= k;
        } else {
          // the burst out of it, fading
          const k = Math.pow(Math.max(0, 1 - (u - m.go) / (1 - m.go)), 0.6);
          const on = m.id === 'hesi' ? 0 : 1.2;
          p.vx = p.crossX * m.burst * k + fx * on;
          p.vz = p.crossZ * m.burst * k + fz * on;
        }
        if (!p.crossHit && u >= m.go) this.crossCheck(p, m.ankles);
        if (!p.riskHit && u >= (m.expose[0] + m.expose[1]) / 2) this.moveRisk(p, m.risk);
        if (p.actT >= m.T) { this.setAct(p, 'free'); p.moveEnd = this.t; }
        break;
      }
      case 'stumble':
        ctrl = 0;
        p.vx *= 0.8; p.vz *= 0.8;
        if (p.actT >= STUMBLE_T) this.setAct(p, 'free');
        break;
      default:
        break;
    }
    if (this.phase === 'tip' && p.act !== 'jump') ctrl = this.tipped ? ctrl : 0;
    // turbo and stamina
    const mag = Math.min(1, Math.hypot(it.mx, it.mz));
    const boosting = it.turbo && p.stamina > 1 && mag > 0.2 && ctrl > 0.5;
    p.turbo = boosting;
    if (boosting) { speed *= TURBO; p.stamina = Math.max(0, p.stamina - DRAIN * dt); }
    else p.stamina = Math.min(100, p.stamina + REGEN * dt);
    if (ctrl > 0) {
      const tvx = (mag > 0.05 ? it.mx / Math.max(1, Math.hypot(it.mx, it.mz)) : 0) * speed * ctrl;
      const tvz = (mag > 0.05 ? it.mz / Math.max(1, Math.hypot(it.mx, it.mz)) : 0) * speed * ctrl;
      const ovx = p.vx, ovz = p.vz;
      const k = Math.min(1, dt * 11);
      p.vx += (tvx - p.vx) * k;
      p.vz += (tvz - p.vz) * k;
      // a sharp change of direction at speed: sneakers squeak
      const os = Math.hypot(ovx, ovz), ns = Math.hypot(tvx, tvz);
      if (os > 3.2 && ns > 2 && (ovx * tvx + ovz * tvz) / (os * ns) < -0.2 && p.squeakT <= 0) { p.squeakT = 0.45; this.ev('squeak', p.id); }
    } else if (p.act !== 'cross' && p.act !== 'dunk') {
      p.vx *= Math.max(0, 1 - dt * 6); p.vz *= Math.max(0, 1 - dt * 6);
    }
    if (p.act !== 'dunk') {
      p.x = clamp(p.x + p.vx * dt, BOUNDS.x0, BOUNDS.x1);
      p.z = clamp(p.z + p.vz * dt, BOUNDS.z0, BOUNDS.z1);
    }
    // facing: the way it runs, else where the AI or the defence wants to look
    const sp = Math.hypot(p.vx, p.vz);
    if (p.act === 'free' || p.act === 'pass' || p.act === 'steal' || p.act === 'jump') {
      let want = NaN;
      if (sp > 1.2 && !(Number.isFinite(it.face) && sp < 3.5 && !has)) want = Math.atan2(p.vx, p.vz);
      else if (Number.isFinite(it.face)) want = it.face;
      else if (has && sp < 1.2) want = Math.atan2(HOOP_X - p.x, HOOP_Z - p.z);
      if (Number.isFinite(want)) {
        let d = want - p.face;
        while (d > Math.PI) d -= Math.PI * 2;
        while (d < -Math.PI) d += Math.PI * 2;
        p.face += d * Math.min(1, dt * 12);
      }
    }
  }

  private dunkBlocks(p: Player, u: number): void {
    if (u < 0.35 || u > 0.9) return;
    const b = this.ball;
    for (const q of this.p) {
      if (q.team === p.team || q.act !== 'jump' || q.lift < 0.35 || b.tried & (1 << q.id)) continue;
      const qd = Math.hypot(q.x - p.x, q.z - p.z);
      if (qd > 1.15) continue;
      b.tried |= 1 << q.id;
      const lvq = this.human(q) ? null : this.levelOf(q);
      if (this.rnd() < 0.42 * (lvq ? lvq.block : 1) * (1.15 - qd * 0.4)) { this.swat(q, p); return; }
    }
  }

  private slam(p: Player): void {
    p.slammed = true;
    const b = this.ball;
    if (b.holder !== p.id || b.state !== 'held') return; // blocked
    b.state = 'dead';
    b.holder = -1;
    b.x = HOOP_X; b.z = HOOP_Z; b.y = RIM_Y + 0.08;
    b.vx = 0; b.vz = 0; b.vy = -7;
    b.rims = 1; b.board = false;
    b.shooter = p.id; b.pts = 2; b.dunk = true; b.legal = true; b.lastTeam = p.team;
    this.stats[p.team].dunks++;
    this.stats[p.team].fga++;
    this.ev('slam', p.id, p.kind);
    this.score_(p.team, 2, p.id);
  }

  private stealCheck(p: Player): void {
    const h = this.holder();
    if (!h || h.team === p.team) return;
    const dx = h.x - p.x, dz = h.z - p.z, d = Math.hypot(dx, dz);
    if (d > 1.4) return;
    const front = (Math.sin(p.face) * dx + Math.cos(p.face) * dz) / (d || 1);
    if (front < 0.2) return;
    if (h.act === 'shot' || h.act === 'dunk') return;
    const lv = this.human(p) ? null : this.levelOf(p);
    let chance = 0.36 * (lv ? lv.steal : 1);
    if (h.turbo) chance *= 1.35;
    if (h.act === 'cross') chance *= 0.3;
    if (this.human(h)) chance *= 1; else chance *= 0.85;
    if (this.rnd() < chance) {
      this.take(p, 'steal');
      this.stats[p.team].steals++;
      this.stats[h.team].turnovers++;
      this.ev('steal', p.id, h.id);
    }
  }

  /** The move's moment of truth: the nearest defender may lose his feet (ANKLE BREAKER). */
  private crossCheck(p: Player, base: number): void {
    p.crossHit = true;
    for (const q of this.p) {
      if (q.team === p.team || q.act === 'stumble' || q.act === 'jump') continue;
      const dx = q.x - p.x, dz = q.z - p.z, d = Math.hypot(dx, dz);
      if (d > 1.7) continue;
      const lv = this.human(q) ? null : this.levelOf(q);
      // a defender rushing at the handler bites harder on a hesitation
      const rush = (q.vx * -dx + q.vz * -dz) / (d || 1) > 1.5 ? 1.25 : 1;
      const chance = base * (lv ? lv.balance : 0.8) * rush * (p.spam ? 0.35 : 1);
      if (this.rnd() < chance) {
        this.setAct(q, 'stumble');
        this.ev('ankles', q.id, p.id);
      }
      return;
    }
  }

  /**
   * While the ball is out in the open (crossing in front, round the back, pulled round in a spin),
   * a defender right in front can reach in and take it; more so on a mistimed move (too soon
   * after the last one) or when he is already swiping.
   */
  private moveRisk(p: Player, base: number): void {
    p.riskHit = true;
    const b = this.ball;
    if (b.state !== 'held' || b.holder !== p.id) return;
    const fx = Math.sin(p.face), fz = Math.cos(p.face);
    for (const q of this.p) {
      if (q.team === p.team || q.act === 'stumble' || q.act === 'jump' || q.act === 'dunk') continue;
      const dx = q.x - p.x, dz = q.z - p.z, d = Math.hypot(dx, dz);
      if (d > 1.15 || (dx * fx + dz * fz) / (d || 1) < 0.2) continue;
      const lv = this.human(q) ? null : this.levelOf(q);
      const chance = base * (lv ? lv.steal : 1) * (p.spam ? 2.6 : 1) * (q.act === 'steal' ? 2.2 : 1);
      if (this.rnd() < chance) {
        this.take(q, 'steal');
        this.stats[q.team].steals++;
        this.stats[p.team].turnovers++;
        this.ev('steal', q.id, p.id);
        p.vx *= 0.3; p.vz *= 0.3;
      }
      return;
    }
  }

  private separate(): void {
    const ps = this.p;
    for (let i = 0; i < 6; i++) {
      for (let j = i + 1; j < 6; j++) {
        const a = ps[i], c = ps[j];
        const dx = c.x - a.x, dz = c.z - a.z, d = Math.hypot(dx, dz);
        const min = 0.72;
        if (d >= min || d < 1e-4) continue;
        const push = (min - d) / 2;
        const ux = dx / d, uz = dz / d;
        const fa = a.act === 'dunk' ? 0 : c.act === 'dunk' ? 2 : 1;
        const fc = c.act === 'dunk' ? 0 : a.act === 'dunk' ? 2 : 1;
        a.x -= ux * push * fa; a.z -= uz * push * fa;
        c.x += ux * push * fc; c.z += uz * push * fc;
      }
    }
  }

  // ------------------------------------------------------------------ the ball

  /** Where a holder carries the ball (the view draws it in the hand). */
  holdPoint(p: Player): { x: number; y: number; z: number } {
    if (p.act === 'shot') return { x: p.x + Math.sin(p.face) * 0.2, y: SHOT_Y + p.lift, z: p.z + Math.cos(p.face) * 0.2 };
    if (p.act === 'dunk') return { x: p.x + Math.sin(p.face) * 0.35, y: REACH_M + 0.2 + p.lift, z: p.z + Math.cos(p.face) * 0.35 };
    return { x: p.x + Math.sin(p.face) * 0.42, y: HOLD_Y + p.lift, z: p.z + Math.cos(p.face) * 0.42 };
  }

  private moveBall(dt: number): void {
    const b = this.ball;
    switch (b.state) {
      case 'tip': this.tipBall(dt); break;
      case 'held': {
        const h = this.p[b.holder];
        const hp = this.holdPoint(h);
        b.vx = (hp.x - b.x) / Math.max(dt, 1e-3); b.vy = 0; b.vz = (hp.z - b.z) / Math.max(dt, 1e-3);
        b.x = hp.x; b.y = hp.y; b.z = hp.z;
        break;
      }
      case 'pass': this.passBall(dt); break;
      case 'shot': this.shotBall(dt); break;
      case 'rattle': this.shotBall(dt); break;
      case 'loose':
      case 'dead':
        this.physics(dt);
        if (b.state === 'loose') this.pickups();
        break;
    }
  }

  private flightStep(dt: number): void {
    const b = this.ball;
    b.ft = Math.min(b.fT, b.ft + dt);
    const u = b.ft / b.fT;
    b.x = b.x0 + (b.x1 - b.x0) * u;
    b.z = b.z0 + (b.z1 - b.z0) * u;
    b.y = b.y0 + b.vy0 * b.ft - 0.5 * G * b.ft * b.ft;
    b.vy = b.vy0 - G * b.ft;
  }

  private tipBall(dt: number): void {
    const b = this.ball;
    this.tipT += dt;
    if (this.tipT < 0.9) { b.y = 1.25; b.vy = 0; return; }
    if (b.vy === 0 && b.y <= 1.25) { b.vy = 7.2; this.ev('toss'); }
    b.vy -= G * dt;
    b.y += b.vy * dt;
    // the jumpers reach for it
    for (const p of [this.p[0], this.p[3]]) {
      if (p.act !== 'jump') continue;
      const reach = REACH_M + 0.15 + p.lift;
      if (Math.abs(reach - b.y) < 0.3 && b.y > 2.4) { this.tipTo(p); return; }
    }
    if (b.y < 1.5 && b.vy < 0) {
      // nobody tipped it: a jump ball nobody wins, it drops and is fair game
      this.phase = 'play'; this.phaseT = 0; this.tipped = true;
      b.state = 'loose'; b.vx = (this.rnd() - 0.5) * 2; b.vz = (this.rnd() - 0.5) * 2;
      this.ev('tip', -1);
    }
  }

  private tipTo(p: Player): void {
    const mates = this.p.filter((q) => q.team === p.team && q.id !== p.id);
    const r = mates[Math.floor(this.rnd() * mates.length)];
    const b = this.ball;
    const T = 0.55;
    this.flight(b.x, b.y, b.z, r.x, 1.3, r.z, T, 'pass', G);
    b.receiver = r.id; b.tried = 0; b.lastTeam = p.team;
    if (this.ctrl[p.team] >= 0) this.ctrl[p.team] = r.id;
    this.phase = 'play'; this.phaseT = 0; this.tipped = true;
    this.ev('tip', p.id, r.id);
  }

  private passBall(dt: number): void {
    const b = this.ball;
    this.flightStep(dt);
    // a defender in the lane may pick it off
    for (const q of this.p) {
      if (q.team === b.lastTeam || b.tried & (1 << q.id) || q.act === 'stumble' || q.act === 'dunk') continue;
      const d = Math.hypot(q.x - b.x, q.z - b.z);
      if (d > 0.6 || b.y > 2.1 + q.lift + (q.act === 'jump' ? 0.4 : 0)) continue;
      b.tried |= 1 << q.id;
      const lv = this.human(q) ? null : this.levelOf(q);
      const keen = q.act === 'steal' || q.act === 'jump' ? 0.72 : 0.3;
      if (this.rnd() < keen * (lv ? lv.steal : 1)) {
        const from = this.p.find((x) => x.team === b.lastTeam && x.act === 'pass') ?? this.p[b.receiver];
        this.take(q, 'intercept');
        this.stats[q.team].steals++;
        this.stats[from.team].turnovers++;
        this.ev('intercept', q.id, from.id);
        return;
      }
    }
    // the receiver (or any teammate) catches it
    let best: Player | null = null, bd = CATCH_R;
    for (const q of this.p) {
      const oop = q.act === 'dunk' && q.kind === D_ALLEY && q.id === b.receiver;
      if (q.team !== b.lastTeam || q.act === 'stumble' || (q.act === 'dunk' && !oop) || q.act === 'pass' && q.actT < 0.2) continue;
      if (oop && b.ft < b.fT - 0.12) continue;
      const d = Math.hypot(q.x - b.x, q.z - b.z) - (q.id === b.receiver ? 0.2 : 0);
      if (d < bd && b.y < REACH_M + 0.3 + q.lift && b.y > 0.3) { bd = d; best = q; }
    }
    if (best && b.ft > 0.08) { this.take(best, 'catch'); return; }
    if (b.ft >= b.fT) { b.state = 'loose'; b.inTeam = -1; }
  }

  private shotBall(dt: number): void {
    const b = this.ball;
    b.ft += dt;
    // early in the flight a jumping defender near the ball can still get a hand on it
    if (b.state === 'shot' && b.ft < 0.3) {
      for (const q of this.p) {
        if (q.team === b.lastTeam || q.act !== 'jump' || b.tried & (1 << q.id)) continue;
        const d = Math.hypot(q.x - b.x, q.z - b.z);
        if (d > 0.7 || b.y > REACH_M + 0.4 + q.lift) continue;
        b.tried |= 1 << q.id;
        const lv = this.human(q) ? null : this.levelOf(q);
        if (this.rnd() < 0.5 * (lv ? lv.block : 1)) { this.swat(q, this.p[b.shooter]); return; }
      }
    }
    // the ball flies under the same physics the release was planned with (hoop.ts)
    const n = Math.max(1, Math.round(dt * SUB)), h = dt / n;
    for (let i = 0; i < n; i++) {
      const hit = noHit(this.hit);
      ballStep(b, h, false, hit);
      this.contact(hit, true);
      const j = judge(b, hit.through);
      if (j > 0) {
        b.state = 'dead';
        if (b.rims === 0 && !b.board) this.ev('swish', b.shooter, b.perfect ? 1 : 0);
        else this.ev(b.board && b.rims < 2 ? 'bank' : 'make', b.shooter, 1);
        this.basket();
        return;
      }
      if (j < 0) {
        b.state = 'loose'; b.inTeam = -1;
        if (b.rims === 0 && !b.board) this.ev('airball', b.shooter);
        this.ev('miss', b.shooter, b.rims > 0 ? 1 : 0);
        return;
      }
    }
  }

  private hit: Hit = { rim: 0, board: 0, floor: 0, through: false };

  /** Sounds and the shot clock for what the ball touched this substep. */
  private contact(hit: Hit, shot: boolean): void {
    const b = this.ball;
    b.rimT += 1 / SUB;
    if (hit.rim > 0) {
      if (shot && b.rims === 0 && !b.board) { this.shotClock = SHOT_CLOCK; b.state = 'rattle'; }
      if (shot && !this.rimOn) b.rims++;
      if (hit.rim > 0.35 && (b.rimT > 0.07 || hit.rim > 1.5)) { this.ev('rim', b.shooter, Math.min(1, hit.rim / 6)); b.rimT = 0; }
    }
    if (hit.board > 0) {
      if (shot && !b.board) { this.shotClock = SHOT_CLOCK; b.state = 'rattle'; }
      if (shot) b.board = true;
      if (hit.board > 0.8) this.ev('board', b.shooter, Math.min(1, hit.board / 7));
    }
    this.rimOn = hit.rim > 0;
    if (hit.floor > 1.2) this.ev('bounce', -1, Math.min(1, hit.floor / 8));
  }
  private rimOn = false;

  /** A loose ball or one falling through the net: free flight with the hoop, the floor and the fence. */
  private physics(dt: number): void {
    const b = this.ball;
    const n = Math.max(1, Math.round(dt * SUB)), h = dt / n;
    for (let i = 0; i < n; i++) {
      const hit = noHit(this.hit);
      ballStep(b, h, b.state === 'dead', hit);
      this.contact(hit, false);
      // through the ring from above (a loose ball counts too: a tip-in)
      if (b.state === 'loose' && hit.through) {
        b.state = 'dead';
        b.shooter = this.p.find((p) => p.team === b.lastTeam)?.id ?? 0;
        b.pts = 2; b.dunk = false; b.legal = true;
        this.ev('swish', b.shooter, 0);
        this.basket();
      }
      if (hit.floor > 0 && b.state === 'dead') b.state = 'loose';
    }
  }

  private pickups(): void {
    const b = this.ball;
    let best: Player | null = null, bd = PICK_R;
    for (const q of this.p) {
      if (b.inTeam >= 0 && q.team !== b.inTeam) continue;
      if (q.act === 'dunk' || q.act === 'stumble' || q.act === 'shot') continue;
      const reach = REACH_M + 0.15 + q.lift + (q.act === 'jump' ? 0.45 : 0);
      if (b.y > reach) continue;
      const d = Math.hypot(q.x - b.x, q.z - b.z);
      if (d < bd) { bd = d; best = q; }
    }
    if (best) this.take(best, 'pickup');
  }

  /** A player gets the ball (catch, rebound, steal, pick-up). */
  private take(p: Player, how: 'catch' | 'pickup' | 'steal' | 'intercept'): void {
    const b = this.ball;
    const wasOffence = this.offence;
    const inbound = b.inTeam >= 0;
    b.state = 'held'; b.holder = p.id; b.inTeam = -1; b.receiver = -1; b.lastTeam = p.team;
    if (wasOffence !== p.team) {
      this.offence = p.team;
      this.shotClock = SHOT_CLOCK;
      // a defensive rebound, a steal or the ball after a basket: take it back behind the arc
      // (the opening tip-off does not count)
      this.cleared = wasOffence < 0;
      if (wasOffence >= 0 && how === 'pickup' && !inbound) { this.stats[p.team].rebounds++; this.ev('rebound', p.id, 0); }
      // a person on the other team now defends with the player nearest the ball
      const other = 1 - p.team;
      if (this.ctrl[other] >= 0) {
        let near = this.p[this.ctrl[other]], nd = 1e9;
        for (const q of this.p) if (q.team === other) { const d = Math.hypot(q.x - p.x, q.z - p.z); if (d < nd) { nd = d; near = q; } }
        this.ctrl[other] = near.id;
      }
    } else if (how === 'pickup' && !inbound) { this.stats[p.team].rebounds++; this.ev('rebound', p.id, 1); }
    if (inbound) this.shotClock = SHOT_CLOCK;
    if (this.ctrl[p.team] >= 0) this.ctrl[p.team] = p.id;
    if (how === 'catch') this.ev('catch', p.id);
    else if (how === 'pickup') this.ev('pickup', p.id);
  }

  /** After a basket or a violation: the player of `team` who fetches the ball. */
  inbounder(team: number): number {
    const b = this.ball;
    let best = -1, bd = 1e9;
    for (const q of this.p) {
      if (q.team !== team) continue;
      const d = Math.hypot(q.x - b.x, q.z - b.z);
      if (d < bd) { bd = d; best = q.id; }
    }
    return best;
  }

  // ------------------------------------------------------------------ scoring and rules

  /** A shot went in (the ball is falling through the net). */
  private basket(): void {
    const b = this.ball;
    const s = this.p[b.shooter];
    this.score_(s.team, b.pts, s.id);
  }

  private score_(team: 0 | 1, pts: number, shooter: number): void {
    const b = this.ball;
    const st = this.stats[team];
    st.pts += pts; st.fgm++;
    if (pts === 3) st.threesMade++;
    this.score[team] += pts;
    this.streak[team]++;
    this.streak[1 - team] = 0;
    if (this.fire[1 - team]) { this.fire[1 - team] = false; this.ev('fireOut', -1, 1 - team); }
    this.ev('make', shooter, pts);
    if (this.streak[team] >= 3 && !this.fire[team]) { this.fire[team] = true; this.ev('fire', shooter, team); }
    // the other team takes it under the hoop
    b.inTeam = 1 - team;
    this.offence = 1 - team;
    this.cleared = false;
    this.shotClock = SHOT_CLOCK;
    const other = 1 - team;
    if (this.ctrl[other] >= 0) this.ctrl[other] = this.inbounder(other);
    if (this.overtime || this.score[team] >= this.winPts) this.finish(team);
  }

  private finish(team: number): void {
    if (this.phase === 'final') return;
    this.phase = 'final';
    this.phaseT = 0;
    this.winner = team;
    this.ev('end', -1, team);
  }

  private rules(): void {
    if (this.phase !== 'play') return;
    const b = this.ball;
    const h = this.holder();
    if (h && h.team === this.offence && !this.cleared && isCleared(h.x, h.z)) {
      this.cleared = true;
      this.stats[h.team].takeBacks++;
      this.ev('cleared', h.id);
    }
    if (this.shotClock <= 0 && h && h.act !== 'shot' && h.act !== 'dunk') {
      // shot clock violation: the ball goes to the other team where it is
      this.ev('shotClock', h.id, h.team);
      this.stats[h.team].turnovers++;
      this.turnover(h);
    }
    if (this.clock <= 0) {
      const flying = b.state === 'shot' || b.state === 'rattle' || (h !== null && (h.act === 'shot' || h.act === 'dunk'));
      if (flying || b.state === 'dead') return;
      if (this.score[0] === this.score[1]) {
        if (!this.overtime) { this.overtime = true; this.ev('overtime'); }
      } else this.finish(this.score[0] > this.score[1] ? 0 : 1);
    }
  }

  private turnover(h: Player): void {
    const b = this.ball;
    b.state = 'loose'; b.holder = -1;
    b.vx = Math.sin(h.face) * 1.2; b.vz = Math.cos(h.face) * 1.2; b.vy = 1.8;
    b.inTeam = 1 - h.team;
    this.offence = 1 - h.team;
    this.cleared = false;
    this.shotClock = SHOT_CLOCK;
    const other = 1 - h.team;
    if (this.ctrl[other] >= 0) this.ctrl[other] = this.inbounder(other);
  }
}
