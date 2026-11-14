// Rooftop Courier: the simulation. A deterministic, seeded run with no rendering in it: the
// courier's movement over the course's boxes, ramps, ladders and cables (sim state machine:
// run, air, slide, roll, vault, climb, mantle, zip, stumble, fall), the parcels and their
// timers, pickups and pigeons, the flow chain and Rush, the districts, the score and the
// missions' counters. Everything that happens goes out as an event for the view and the scene.
// Steps at a fixed 1/60 s; the bot, the balance run and the menu backdrop drive it the same way.
import { Course, type Box, type Block, type Zip, type Ladder, type Pickup, type Flock } from './course';
import {
  TUNING, HW, RAD, H_STAND, H_LOW, GRAV, STEP, REACH, THEMES, clamp, type Mode, type Tune, type Theme,
} from './defs';

export interface Input {
  /** −1 (left) … 1 (right). */
  steer: number;
  /** Jump held. */
  jump: boolean;
  /** Slide / roll held. */
  down: boolean;
}
export const NO_INPUT: Input = { steer: 0, jump: false, down: false };

export type State = 'run' | 'air' | 'slide' | 'roll' | 'vault' | 'climb' | 'mantle' | 'zip' | 'stumble' | 'slam' | 'fall' | 'done';
export type MoveKind = 'gap' | 'bigGap' | 'vault' | 'slide' | 'roll' | 'perfectRoll' | 'zip' | 'bounce' | 'climb' | 'mantle' | 'pigeons' | 'drop';
export type OverReason = 'fell' | 'late';

export type SimEvent =
  | { type: 'jump'; spring: boolean; big: boolean }
  | { type: 'land'; drop: number; hard: boolean; roll: 'perfect' | 'ok' | null; surf: string }
  | { type: 'step' }
  | { type: 'slide' }
  | { type: 'move'; kind: MoveKind; pts: number; chain: number }
  | { type: 'vault'; box: Box }
  | { type: 'climb'; ladder: Ladder }
  | { type: 'climbTop' }
  | { type: 'mantle' }
  | { type: 'zip'; zip: Zip }
  | { type: 'zipEnd' }
  | { type: 'bounce'; box: Box }
  | { type: 'stumble'; box: Box | null; smash: boolean }
  | { type: 'bonk' }
  | { type: 'slam' }
  | { type: 'falling' }
  | { type: 'fell'; hearts: number }
  | { type: 'respawn' }
  | { type: 'pickup'; p: Pickup }
  | { type: 'gold'; f: Flock }
  | { type: 'pigeons'; f: Flock }
  | { type: 'parcel'; first: boolean }
  | { type: 'deliver'; pts: number; perfect: boolean; streak: number; bank: number }
  | { type: 'missed' }
  | { type: 'late'; hearts: number }
  | { type: 'flowLost'; chain: number }
  | { type: 'rush' }
  | { type: 'rushEnd' }
  | { type: 'district'; theme: Theme; n: number }
  | { type: 'districtSoon'; theme: Theme }
  | { type: 'over'; reason: OverReason };

export interface Parcel {
  block: number;
  s: number;
  x: number;
  y: number;
  left: number;
  total: number;
  route: number;
}

/** Run counters (missions, the result card, the balance run). */
export interface Stats {
  distance: number; deliveries: number; perfect: number; zips: number; vaults: number; slides: number; rolls: number;
  bounces: number; climbs: number; stamps: number; flocks: number; rushes: number; gaps: number; stumbles: number;
  falls: number; gold: number; bestChain: number;
}

/** Upgrades bought with stamps (meta.ts). */
export interface Upgrades { time: number; flow: number }

export const LAT_RUN = 7.2;
export const LAT_AIR = 5.6;
export const JUMP_V = 7.3;
export const HOLD_T = 0.27;
export const HOLD_G = 0.36;
const COYOTE = 0.11;
const BUFFER = 0.14;
const SLIDE_T = 0.68;
const ROLL_T = 0.46;
const CLIMB_V = 5.2;
const MANTLE_T = 0.3;
const ROLL_WINDOW = 0.32;
const PERFECT_WINDOW = 0.16;
/** A landing from this high (m) is hard: roll it or stagger. */
export const HARD = 3.6;
const RUSH_T = 6.5;

export class Sim {
  readonly tune: Tune;
  readonly course: Course;
  readonly events: SimEvent[] = [];
  // the courier
  s = 0; x = 0; y = 0;
  vs = 0; vx = 0; vy = 0;
  state: State = 'run';
  stateT = 0;
  /** Seconds since the run started. */
  time = 0;
  score = 0;
  /** Stamps collected this run (meta currency). */
  stamps = 0;
  hearts: number;
  over = false;
  overReason: OverReason | null = null;
  parcel: Parcel | null = null;
  streak = 0;
  /** Flow: moves chained without running on flat ground, its window and the Rush meter. */
  chain = 0;
  flowT = 0;
  meter = 0;
  rushT = 0;
  springs = 0;
  /** Invulnerable after a respawn (s). */
  ghostT = 0;
  readonly stats: Stats = { distance: 0, deliveries: 0, perfect: 0, zips: 0, vaults: 0, slides: 0, rolls: 0, bounces: 0, climbs: 0, stamps: 0, flocks: 0, rushes: 0, gaps: 0, stumbles: 0, falls: 0, gold: 0, bestChain: 0 };
  /** The block underfoot (or last stood on), the district the courier is in. */
  block: Block | null = null;
  district = 0;
  /** Deliveries counted towards the next district. */
  private towardDistrict = 0;
  private districtQueued = -1;
  // jump and slide input
  private prevJump = false;
  private prevDown = false;
  private jumpBuf = 0;
  private downAt = -9;
  private holdT = 0;
  private coyote = 0;
  apexY = 0;
  private airFrom = 0;
  private springAir = false;
  private bounceVs = -1;
  private boost = 0;
  private boostT = 0;
  // scripted moves
  private vault: { box: Box; s0: number; y0: number; s1: number; top: number; t: number; dur: number } | null = null;
  ladder: Ladder | null = null;
  private mantle: { s0: number; y0: number; s1: number; y1: number; t: number } | null = null;
  zip: Zip | null = null;
  zipV = 0;
  private stumbleT = 0;
  private lastSafe = { s: 0, x: 0, y: 0 };
  private safeBlock = 0;
  private landedOnce = false;
  /** Seconds the courier stood blocked against a wall (the bot uses it). */
  blockedT = 0;
  readonly upg: Upgrades;
  private lastStep = 0;
  private passedOver = new Set<number>();

  constructor(readonly mode: Mode, readonly seed: number, upg: Upgrades = { time: 0, flow: 0 }) {
    this.tune = TUNING[mode];
    this.upg = upg;
    this.course = new Course(seed, this.tune);
    this.hearts = this.tune.hearts;
    const b = this.course.blocks[0];
    this.s = 0;
    this.y = b.y;
    this.block = b;
    this.vs = this.tune.speed0 * 0.6;
    this.lastSafe = { s: 0, x: 0, y: b.y };
    this.course.ensure(this.s + 130);
  }

  get theme(): Theme { return THEMES[this.district % THEMES.length]; }
  get height(): number { return this.state === 'slide' || this.state === 'roll' ? H_LOW : H_STAND; }
  get grounded(): boolean { return this.state === 'run' || this.state === 'slide' || this.state === 'roll' || this.state === 'stumble'; }
  get rush(): boolean { return this.rushT > 0; }
  get flowMult(): number { return 1 + 0.15 * Math.min(this.chain, 20); }
  /** The running speed the courier builds towards here. */
  get target(): number { return this.course.speedAt(this.s) * (this.rush ? 1.18 : 1) + this.boost; }
  get windowLen(): number { return this.tune.flowWindow + this.upg.flow * 0.45; }

  private emit(e: SimEvent): void { this.events.push(e); }

  // ------------------------------------------------------------------ step

  step(dt: number, inp: Input): void {
    if (this.over) return;
    this.time += dt;
    this.stateT += dt;
    const jumpEdge = inp.jump && !this.prevJump;
    const downEdge = inp.down && !this.prevDown;
    this.prevJump = inp.jump;
    this.prevDown = inp.down;
    if (jumpEdge) this.jumpBuf = BUFFER;
    else this.jumpBuf = Math.max(0, this.jumpBuf - dt);
    if (downEdge) this.downAt = this.time;
    this.ghostT = Math.max(0, this.ghostT - dt);
    if (this.boostT > 0) { this.boostT -= dt; if (this.boostT <= 0) this.boost = 0; }

    const s0 = this.s;
    switch (this.state) {
      case 'run': case 'slide': case 'roll': case 'stumble': this.ground(dt, inp, downEdge); break;
      case 'air': this.air(dt, inp); break;
      case 'vault': this.doVault(dt, inp); break;
      case 'climb': this.doClimb(dt, inp); break;
      case 'mantle': this.doMantle(dt); break;
      case 'zip': this.doZip(dt, inp); break;
      case 'slam': case 'fall': this.doFall(dt); break;
      case 'done': break;
    }
    if (this.over) return;
    const ds = Math.max(0, this.s - s0);
    this.stats.distance += ds;
    this.score += ds * (this.rush ? 2 : 1);
    this.flow(dt);
    this.parcels(dt);
    this.pickups();
    this.course.ensure(this.s + 130);
    this.course.forget(this.s - 70);
    this.updateDistrict();
  }

  // ------------------------------------------------------------------ on the ground

  private ground(dt: number, inp: Input, downEdge: boolean): void {
    // forward speed eases to the target (a stumble starts slow)
    const tgt = this.target * (this.state === 'stumble' ? 0.45 : this.state === 'slide' ? 0.97 : 1);
    const acc = this.vs < tgt ? (this.state === 'stumble' ? 3 : 4.2) : 9;
    this.vs += clamp(tgt - this.vs, -acc * dt, acc * dt);
    this.steer(dt, inp.steer, LAT_RUN);
    if (this.state === 'slide' && this.stateT > SLIDE_T && !this.overheadAbove()) this.setState('run');
    if (this.state === 'roll' && this.stateT > ROLL_T && !this.overheadAbove()) this.setState('run');
    if (this.state === 'stumble' && this.stateT > this.stumbleT) this.setState('run');
    // jump (or vault when a low wall is just ahead)
    if (this.jumpBuf > 0 && this.state !== 'stumble') {
      this.jumpBuf = 0;
      const low = this.lowAhead(2.7);
      if (low) { this.startVault(low); return; }
      this.jump();
      return;
    }
    if (downEdge && (this.state === 'run' || this.state === 'stumble')) {
      this.setState('slide');
      this.stats.slides++;
      this.emit({ type: 'slide' });
    }
    // move forward, hitting what stands in the way
    this.advance(dt);
    if (this.state === 'air' || this.state === 'climb' || this.state === 'mantle' || this.state === 'vault') return;
    // follow the ground; walk off an edge into the air
    const g = this.course.groundAt(this.s, this.x, this.y + STEP);
    if (g.y >= this.y - 0.35) {
      this.y = g.y;
      this.onGround(g.box);
    } else {
      // off an edge (a ramp's lip launches upwards)
      const prevRamp = this.course.ramps.find((r) => this.s >= r.s1 && this.s < r.s1 + 1 && this.x >= r.x0 && this.x <= r.x1 && Math.abs(this.y - r.yb) < 0.4);
      this.vy = prevRamp ? this.vs * (prevRamp.yb - prevRamp.ya) / (prevRamp.s1 - prevRamp.s0) * 0.95 : 0;
      this.toAir(true);
      if (prevRamp) this.emit({ type: 'jump', spring: false, big: true });
    }
    // footsteps
    if (this.state === 'run' && this.vs > 1) {
      this.lastStep += dt * this.vs;
      if (this.lastStep > 1.7) { this.lastStep = 0; this.emit({ type: 'step' }); }
    }
  }

  private onGround(box: Box | null): void {
    if (box && (box.kind === 'roof' || box.kind === 'bridge' || box.kind === 'scaf')) {
      const b = this.course.blockById(box.block);
      if (b && box.kind === 'roof') {
        if (b !== this.block) this.block = b;
        if (this.s > b.s0 + 1.2 && this.s < b.s1 - 1.5) { this.lastSafe = { s: this.s, x: this.x, y: this.y }; this.safeBlock = b.i; }
      }
    }
  }

  private steer(dt: number, steer: number, lat: number): void {
    const want = clamp(steer, -1, 1) * lat;
    this.vx += clamp(want - this.vx, -38 * dt, 38 * dt);
    let nx = this.x + this.vx * dt;
    const lim = HW - RAD;
    if (nx < -lim) { nx = -lim; this.vx = Math.max(0, this.vx); }
    if (nx > lim) { nx = lim; this.vx = Math.min(0, this.vx); }
    // sideways into an obstacle: stop at its side
    for (const b of this.course.boxes) {
      if (b.s0 > this.s + RAD) break;
      if (b.kind === 'roof' || b.kind === 'bridge' || b.kind === 'scaf' || b.kind === 'awning' || b.hit) continue;
      if (this.s + RAD <= b.s0 || this.s - RAD >= b.s1) continue;
      if (this.y >= b.y1 - 0.05 || this.y + this.height <= b.y0) continue;
      if (nx + RAD > b.x0 && nx - RAD < b.x1) {
        if (this.x <= b.x0) nx = b.x0 - RAD; else if (this.x >= b.x1) nx = b.x1 + RAD;
        this.vx = 0;
      }
    }
    this.x = nx;
  }

  /** Is an overhead obstacle right above (stay low under it)? */
  private overheadAbove(): boolean {
    for (const b of this.course.boxes) {
      if (b.s0 > this.s + RAD) break;
      if (b.kind !== 'over' || b.hit) continue;
      if (this.s + RAD > b.s0 && this.s - RAD < b.s1 && this.x + RAD > b.x0 && this.x - RAD < b.x1 && this.y + H_STAND > b.y0 && this.y < b.y1) return true;
    }
    return false;
  }

  /** A low obstacle within `d` m ahead in the courier's path. */
  lowAhead(d: number): Box | null {
    for (const b of this.course.boxes) {
      if (b.s0 > this.s + d + RAD) break;
      if (b.kind !== 'low' || b.hit || b.s0 < this.s + RAD - 0.05) continue;
      if (this.x + RAD > b.x0 && this.x - RAD < b.x1 && Math.abs(b.y0 - this.y) < 0.4) return b;
    }
    return null;
  }

  /**
   * Moves forward by vs·dt and resolves the first front face crossed: a step up, a ladder, a
   * ledge to mantle, a wall to bonk or slam into, an obstacle to stumble over.
   */
  private advance(dt: number, extra = 0): void {
    const ns = this.s + this.vs * dt + extra;
    const h = this.height;
    for (const b of this.course.boxes) {
      if (b.s0 > ns + RAD) break;
      const face = b.s0 - RAD;
      if (face < this.s - 1e-6 || face > ns) continue;
      if (b.kind === 'awning' || (b.hit && b.kind !== 'roof' && b.kind !== 'scaf')) continue;
      if (this.x + RAD <= b.x0 || this.x - RAD >= b.x1) continue;
      if (this.y + h <= b.y0 || this.y >= b.y1 - 1e-6) continue;
      // overhead pieces are passed under while low (sliding, rolling)
      if (b.kind === 'over') {
        if (this.state === 'slide' || this.state === 'roll') {
          if (!this.passedOver.has(b.id)) {
            this.passedOver.add(b.id);
            this.move('slide', 45);
          }
          continue;
        }
      }
      const up = b.y1 - this.y;
      if (this.grounded && up <= STEP && b.kind !== 'over') { this.y = b.y1; continue; }
      if (this.hitFace(b, face)) return;
    }
    this.s = ns;
  }

  /** The courier meets a face at s = `face`. Returns true when it stopped the move. */
  private hitFace(b: Box, face: number): boolean {
    const up = b.y1 - this.y;
    // buildings and scaffolding: a ladder, a ledge, or a wall
    if (b.kind === 'roof' || b.kind === 'scaf') {
      const lad = this.course.ladders.find((l) => Math.abs(l.s - b.s0) < 0.2 && this.x >= l.x0 - 0.15 && this.x <= l.x1 + 0.15 && this.y >= l.y0 - 0.6);
      if (lad) { this.startClimb(lad, face); return true; }
      if (up <= REACH + this.tune.grab + (this.grounded ? -0.3 : 0.35)) { this.startMantle(b, face); return true; }
      this.s = face;
      if (this.grounded) {
        if (this.vs > 3) this.emit({ type: 'bonk' });
        this.vs = 0;
        this.blockedT += 1 / 60;
      } else {
        this.vs = 0;
        // an awning under the wall catches the courier sliding down it
        const below = this.course.groundAt(face, this.x, this.y);
        if (below.box?.kind === 'awning') return true;
        this.setState('slam');
        this.emit({ type: 'slam' });
      }
      return true;
    }
    // obstacles: Rush and the respawn shield smash through; otherwise a stumble
    const smash = this.rush || this.ghostT > 0;
    b.hit = true;
    if (!smash) {
      this.stats.stumbles++;
      this.vs *= 0.35;
      this.breakChain();
      if (this.parcel) this.parcel.left = Math.max(0.5, this.parcel.left - 2);
      if (this.state === 'air' || this.state === 'vault') { this.vy = Math.min(this.vy, 0); }
      else { this.stumbleT = 0.55; this.setState('stumble'); }
    }
    this.emit({ type: 'stumble', box: b, smash });
    return false;
  }

  // ------------------------------------------------------------------ jumping and the air

  private jump(): void {
    const spring = this.springs > 0;
    if (spring) this.springs--;
    this.vy = JUMP_V * (spring ? 1.38 : 1);
    // off a ramp the slope adds its lift
    const rp = this.course.groundAt(this.s, this.x, this.y + 0.1).ramp;
    if (rp) this.vy += this.vs * (rp.yb - rp.ya) / (rp.s1 - rp.s0) * 0.8;
    this.holdT = HOLD_T;
    this.springAir = spring;
    if (spring) { this.boost = Math.max(this.boost, 2.2); this.boostT = 1.2; }
    // how far it is to the next roof (wind and slow motion on the big ones)
    const nb = this.course.nextBlock(this.s);
    const cur = this.course.blockAt(this.s);
    const edge = cur ? cur.s1 - this.s : 99;
    const big = !!nb && edge < 4 && (nb.gap >= 6 || nb.y < this.y - 5);
    this.emit({ type: 'jump', spring, big });
    this.toAir(false);
  }

  private toAir(walkedOff: boolean): void {
    this.setState('air');
    this.coyote = walkedOff ? COYOTE : 0;
    this.apexY = this.y;
    this.airFrom = this.s;
    if (!walkedOff) this.holdT = HOLD_T; else this.holdT = 0;
    this.bounceVs = -1;
  }

  private air(dt: number, inp: Input): void {
    // a jump just after running off an edge still counts (coyote time)
    if (this.coyote > 0) {
      this.coyote -= dt;
      if (this.jumpBuf > 0 && this.vy <= 0.5) { this.jumpBuf = 0; this.jump(); return; }
    }
    let g = GRAV;
    if (this.holdT > 0) {
      this.holdT -= dt;
      if (inp.jump && this.vy > 0) g *= HOLD_G; else this.holdT = 0;
    }
    this.vy -= g * dt;
    // a bounce off an awning carries a guided forward speed until the top of the arc
    if (this.bounceVs >= 0) {
      this.vs = this.bounceVs;
      if (this.vy < 0) this.bounceVs = -1;
    } else {
      const tgt = this.target;
      if (this.vs < tgt * 0.6) this.vs += 4 * dt;
    }
    this.steer(dt, inp.steer, LAT_AIR);
    const pull = this.assist(dt);
    const py = this.y;
    this.advance(dt, pull);
    if (this.state !== 'air') return;
    this.y += this.vy * dt;
    this.apexY = Math.max(this.apexY, this.y);
    // a cable within reach: grab it
    for (const z of this.course.zips) {
      if (this.s < z.sa + 0.3 || this.s > z.sb - 4) continue;
      if (Math.abs(this.x - z.x) > 1.15 + this.tune.grab) continue;
      const cy = this.course.cableY(z, this.s), hands = this.y + REACH + 0.15;
      if (hands > cy - 1.05 - this.tune.grab && hands < cy + 0.45) { this.startZip(z); return; }
    }
    // land
    if (this.vy <= 0) {
      const gr = this.course.groundAt(this.s, this.x, py + 0.02);
      if (this.y <= gr.y && gr.y > 0.5) { this.land(gr.y, gr.box); return; }
    }
    // overhead pieces hit from below
    if (this.vy > 0) {
      for (const b of this.course.boxes) {
        if (b.s0 > this.s + RAD) break;
        if (b.kind !== 'over' || b.hit) continue;
        if (this.s + RAD > b.s0 && this.s - RAD < b.s1 && this.x + RAD > b.x0 && this.x - RAD < b.x1 && py + H_STAND <= b.y0 + 0.05 && this.y + H_STAND > b.y0) {
          this.y = b.y0 - H_STAND;
          this.vy = 0;
          this.hitFace(b, this.s);
        }
      }
    }
    this.checkDoom();
  }

  /** Easy's jump assist: a landing just out of reach pulls the courier in. */
  private assist(dt: number): number {
    const a = this.tune.assist;
    if (a <= 0 || this.vy > 2) return 0;
    if (this.course.groundAt(this.s, this.x, this.y + 0.1).y > this.y - 6) return 0;
    const nb = this.course.nextBlock(this.s);
    if (!nb) return 0;
    // where the fall ends at this speed
    const t = (this.vy + Math.sqrt(Math.max(0, this.vy * this.vy + 2 * GRAV * Math.max(0, this.y - nb.y)))) / GRAV;
    const land = this.s + this.vs * t;
    const short = nb.s0 + 0.6 - land;
    let pull = 0;
    if (short > 0 && short < a) pull = Math.min(short, 3.2 * dt);
    // and towards a narrow bridge or a feature underfoot
    const br = this.course.boxes.find((b) => b.kind === 'bridge' && this.s > b.s0 - 3 && this.s < b.s1);
    if (br) {
      const cx = (br.x0 + br.x1) / 2;
      if (Math.abs(cx - this.x) < 1.6) this.x += clamp(cx - this.x, -1.6 * dt, 1.6 * dt);
    }
    return pull;
  }

  private land(gy: number, box: Box | null): void {
    const drop = this.apexY - gy;
    this.y = gy;
    this.vy = 0;
    // an awning throws the courier up onto the roof above it
    if (box?.kind === 'awning') { this.bounce(box); return; }
    const hard = drop > HARD;
    const since = this.time - this.downAt;
    const roll: 'perfect' | 'ok' | null = since < ROLL_WINDOW ? (since < PERFECT_WINDOW || since < 0.22 && hard ? 'perfect' : 'ok') : null;
    const surf = box?.kind === 'bridge' ? box.look : box?.kind === 'roof' ? (this.course.blockById(box.block)?.wall === 'b' ? 'metal' : 'roof') : 'roof';
    this.emit({ type: 'land', drop, hard, roll, surf });
    const gapped = this.s - this.airFrom;
    // across a gap: a move
    const cleared = !!box && this.cleared();
    if (cleared) {
      this.stats.gaps++;
      const big = gapped > 8 || drop > 6;
      this.move(big ? 'bigGap' : 'gap', Math.round(20 + gapped * 4 + Math.max(0, drop) * 3));
    }
    this.onGround(box);
    if (roll) {
      this.setState('roll');
      this.stats.rolls++;
      this.downAt = -9;
      if (roll === 'perfect' && hard) { this.boost = 2.2; this.boostT = 1.6; this.move('perfectRoll', 110); }
      else this.move('roll', hard ? 70 : 25);
      this.vs = Math.max(this.vs, this.target * 0.95);
    } else if (hard) {
      // a hard landing without a roll: a stagger
      this.vs *= 0.55;
      this.stumbleT = 0.4;
      this.setState('stumble');
      this.breakChain();
    } else this.setState('run');
    this.landedOnce = true;
  }

  /** Did the last air cross a gap (from one roof to another)? */
  private cleared(): boolean {
    const a = this.course.blockAt(this.airFrom), b = this.course.blockAt(this.s);
    return !!a && !!b && a !== b;
  }

  private bounce(box: Box): void {
    const b = this.course.blockById(box.block);
    const top = b ? b.y : this.y + 6;
    const face = b ? b.s0 : this.s + 2;
    const vy = Math.sqrt(2 * GRAV * Math.max(1.5, top + 1.1 - this.y));
    this.vy = vy;
    const tr = vy / GRAV;
    this.bounceVs = clamp((face + 0.9 - this.s) / (tr * 0.8), 2, 12);
    this.vs = this.bounceVs;
    this.setState('air');
    this.apexY = this.y;
    this.airFrom = this.s;
    this.holdT = 0;
    this.stats.bounces++;
    this.emit({ type: 'bounce', box });
    this.move('bounce', 70);
  }

  // ------------------------------------------------------------------ scripted moves

  private startVault(b: Box): void {
    this.setState('vault');
    const dur = clamp(0.34 + (b.s1 - b.s0) / Math.max(6, this.vs), 0.34, 0.6);
    this.vault = { box: b, s0: this.s, y0: this.y, s1: b.s1 + RAD + 0.25, top: b.y1 + 0.28, t: 0, dur };
    this.stats.vaults++;
    this.passedOver.add(b.id);
    this.emit({ type: 'vault', box: b });
    this.move('vault', 55);
  }

  private doVault(dt: number, inp: Input): void {
    const v = this.vault!;
    v.t += dt;
    const k = clamp(v.t / v.dur, 0, 1);
    const ns = v.s0 + (v.s1 - v.s0) * k;
    this.vs = Math.max(this.vs, (v.s1 - v.s0) / v.dur);
    this.steer(dt, inp.steer * 0.4, LAT_RUN);
    this.s = ns;
    const after = this.course.groundAt(this.s, this.x, v.top).y;
    this.y = Math.max(after, v.y0 + (v.top - v.y0) * Math.sin(Math.PI * Math.min(1, k * 1.15)));
    if (k >= 1) {
      this.vault = null;
      const g = this.course.groundAt(this.s, this.x, this.y + STEP);
      if (g.y >= this.y - 0.35) { this.y = g.y; this.setState('run'); this.vs = Math.max(this.vs, this.target * 0.95); }
      else { this.vy = 0; this.toAir(true); }
    }
  }

  private startClimb(l: Ladder, face: number): void {
    this.s = face;
    this.ladder = l;
    this.vs = 0;
    this.vy = 0;
    this.setState('climb');
    this.stats.climbs++;
    this.emit({ type: 'climb', ladder: l });
  }

  private doClimb(dt: number, inp: Input): void {
    const l = this.ladder!;
    const cx = clamp(this.x, l.x0 + 0.5, l.x1 - 0.5);
    this.x += clamp(cx - this.x, -3 * dt, 3 * dt);
    this.y += CLIMB_V * dt * (this.rush ? 1.3 : 1);
    void inp;
    if (this.y >= l.y1 - 0.9) {
      this.emit({ type: 'climbTop' });
      this.move('climb', 40);
      this.mantle = { s0: this.s, y0: this.y, s1: this.s + RAD + 0.7, y1: l.y1, t: 0 };
      this.ladder = null;
      this.setState('mantle');
    }
  }

  private startMantle(b: Box, face: number): void {
    this.s = face;
    this.mantle = { s0: face, y0: this.y, s1: b.s0 + 0.75, y1: b.y1, t: 0 };
    this.vy = 0;
    this.setState('mantle');
    this.emit({ type: 'mantle' });
    this.move('mantle', 30);
  }

  private doMantle(dt: number): void {
    const m = this.mantle!;
    m.t += dt;
    const k = clamp(m.t / MANTLE_T, 0, 1);
    this.y = m.y0 + (m.y1 - m.y0) * Math.min(1, k * 1.6);
    this.s = m.s0 + (m.s1 - m.s0) * Math.max(0, (k - 0.35) / 0.65);
    if (k >= 1) {
      this.mantle = null;
      this.y = m.y1;
      this.vs = Math.max(this.vs * 0.6, this.target * 0.6);
      this.setState('run');
    }
  }

  private startZip(z: Zip): void {
    this.zip = z;
    this.zipV = Math.max(this.vs, 9);
    this.vy = 0;
    this.setState('zip');
    this.stats.zips++;
    this.emit({ type: 'zip', zip: z });
  }

  private doZip(dt: number, inp: Input): void {
    const z = this.zip!;
    const slope = (z.ya - z.yb) / (z.sb - z.sa);
    this.zipV = clamp(this.zipV + (GRAV * slope * 0.6 - 0.012 * this.zipV * this.zipV) * dt, 8, 17);
    this.s += this.zipV * dt;
    this.vs = this.zipV;
    this.x += clamp(z.x - this.x, -4 * dt, 4 * dt);
    this.y = this.course.cableY(z, this.s) - REACH;
    const release = this.s >= z.sb - 2.3 || (this.jumpBuf > 0 && this.stateT > 0.35);
    if (release) {
      this.jumpBuf = 0;
      this.zip = null;
      this.vy = this.s >= z.sb - 2.3 ? 1.5 : 4.5;
      this.vs = Math.min(this.zipV, 13);
      this.toAir(false);
      this.holdT = 0;
      this.airFrom = this.s;
      this.emit({ type: 'zipEnd' });
      this.move('zip', 80);
    }
    void inp;
  }

  // ------------------------------------------------------------------ falling

  /** Below the point of no return over an alley: the courier falls. */
  private checkDoom(): void {
    const b = this.course.blockAt(this.s);
    if (b && this.course.groundAt(this.s, this.x, this.y + 0.1).y > 0.5) return;
    const prev = this.course.blocks.filter((q) => q.s1 <= this.s + 0.01).pop();
    const next = this.course.nextBlock(this.s);
    const ref = Math.min(prev?.y ?? this.y, next?.y ?? this.y, this.lastSafe.y);
    if (this.y < ref - 4.4) {
      this.setState('fall');
      this.emit({ type: 'falling' });
    }
  }

  private doFall(dt: number): void {
    this.vy -= GRAV * dt;
    this.y += this.vy * dt;
    this.vs *= Math.max(0, 1 - dt * 2);
    this.s += this.vs * dt;
    if (this.state === 'slam') {
      // sliding down the wall: a ledge below can't be caught any more
      this.checkDoom();
      return;
    }
    if (this.stateT > 1.05) this.fell();
  }

  private fell(): void {
    this.stats.falls++;
    this.breakChain();
    if (this.hearts > 1) {
      this.hearts--;
      this.emit({ type: 'fell', hearts: this.hearts });
      this.respawn();
    } else {
      this.hearts = 0;
      this.emit({ type: 'fell', hearts: 0 });
      this.finish('fell');
    }
  }

  /** Back on the last safe roof (Easy hearts, a rewarded continue). */
  respawn(): void {
    const b = this.course.blockById(this.safeBlock) ?? this.course.blocks[0];
    const s = clamp(this.lastSafe.s - 4, b.s0 + 1, b.s1 - 2);
    this.s = s;
    this.x = clamp(this.lastSafe.x, -HW + 1, HW - 1);
    this.y = b.y;
    this.vy = 0; this.vx = 0;
    this.vs = this.target * 0.6;
    this.ladder = null; this.zip = null; this.vault = null; this.mantle = null;
    this.ghostT = 2;
    this.setState('run');
    this.over = false;
    this.overReason = null;
    this.emit({ type: 'respawn' });
  }

  /** A rewarded continue: one more heart, back on the roof, a fresh parcel if it was late. */
  revive(): void {
    this.hearts = Math.max(1, this.hearts);
    if (this.overReason === 'late' || !this.parcel || this.parcel.left <= 0) this.newParcel(false);
    this.respawn();
  }

  private finish(reason: OverReason): void {
    this.over = true;
    this.overReason = reason;
    this.setState('done');
    this.emit({ type: 'over', reason });
  }

  // ------------------------------------------------------------------ flow, Rush, style

  private move(kind: MoveKind, base: number): void {
    this.chain++;
    this.stats.bestChain = Math.max(this.stats.bestChain, this.chain);
    this.flowT = this.windowLen;
    const pts = Math.round(base * this.flowMult * (this.rush ? 2 : 1));
    this.score += pts;
    if (!this.rush) {
      this.meter = Math.min(1, this.meter + base / 820 + this.chain * 0.004);
      if (this.meter >= 1) {
        this.rushT = RUSH_T;
        this.stats.rushes++;
        this.emit({ type: 'rush' });
      }
    }
    this.emit({ type: 'move', kind, pts, chain: this.chain });
  }

  private breakChain(): void {
    if (this.chain >= 3) this.emit({ type: 'flowLost', chain: this.chain });
    this.chain = 0;
    this.flowT = 0;
  }

  private flow(dt: number): void {
    if (this.rushT > 0) {
      this.rushT -= dt;
      this.meter = Math.max(0, this.rushT / RUSH_T);
      if (this.rushT <= 0) { this.rushT = 0; this.meter = 0; this.emit({ type: 'rushEnd' }); }
    }
    // the chain lasts while the courier keeps moving (only running on flat ground uses the window)
    if (this.chain > 0 && this.state === 'run') {
      this.flowT -= dt;
      if (this.flowT <= 0) this.breakChain();
    }
    if (this.chain === 0 && this.rushT <= 0) this.meter = Math.max(0, this.meter - dt * 0.012);
  }

  // ------------------------------------------------------------------ parcels

  private newParcel(first: boolean): void {
    const c = this.course;
    const minD = (first ? 60 : 100) + Math.min(50, this.district * 10);
    c.ensure(this.s + minD + 60);
    const cands = c.blocks.filter((b) => b.drop.s > this.s + minD && b.s1 - b.s0 >= 9 && b.link !== 'start');
    const b = cands[0] ?? c.blocks[c.blocks.length - 1];
    const route = b.drop.s - this.s;
    const v = (c.speedAt(this.s) + c.speedAt(b.drop.s)) / 2;
    const bank = this.parcel && this.parcel.left > 0 ? Math.min(6, this.parcel.left * 0.35) : 0;
    const total = this.tune.timerBase + route / v * this.tune.slack + this.upg.time * 1.5 + bank + (first ? 6 : 0);
    this.parcel = { block: b.i, s: b.drop.s, x: b.drop.x, y: b.y, left: total, total, route };
    this.emit({ type: 'parcel', first });
  }

  private parcels(dt: number): void {
    if (!this.parcel) {
      if (this.s > 6) this.newParcel(true);
      return;
    }
    const p = this.parcel;
    if (this.state !== 'fall' && this.state !== 'slam') p.left -= dt;
    // delivered: on the drop roof, at the hatch
    const reach = this.mode === 'easy' ? 2.1 : 1.6;
    if (Math.abs(this.s - p.s) < reach && Math.abs(this.x - p.x) < reach + 0.2 && Math.abs(this.y - p.y) < 1.2 && this.state !== 'fall') {
      this.deliver(p);
      return;
    }
    if (this.s > p.s + reach + 0.5 && this.grounded) {
      // ran past the hatch: the parcel goes to the next drop, the clock keeps running
      this.streak = 0;
      this.emit({ type: 'missed' });
      const left = p.left;
      this.newParcel(false);
      this.parcel!.left = Math.max(6, Math.min(this.parcel!.total, left + 4));
      this.parcel!.total = Math.max(this.parcel!.total, this.parcel!.left);
      return;
    }
    if (p.left <= 0) {
      this.streak = 0;
      if (this.hearts > 1) {
        this.hearts--;
        this.emit({ type: 'late', hearts: this.hearts });
        this.parcel = null;
        this.newParcel(false);
      } else {
        this.hearts = 0;
        this.emit({ type: 'late', hearts: 0 });
        this.finish('late');
      }
    }
  }

  private deliver(p: Parcel): void {
    const margin = p.left / p.total;
    const perfect = margin >= 0.4;
    this.streak++;
    const mult = Math.min(3, 1 + 0.25 * (this.streak - 1));
    const pts = Math.round((300 + (perfect ? 150 : 0)) * mult * (this.rush ? 2 : 1));
    this.score += pts;
    this.stats.deliveries++;
    if (perfect) this.stats.perfect++;
    this.towardDistrict++;
    this.emit({ type: 'deliver', pts, perfect, streak: this.streak, bank: Math.min(6, p.left * 0.35) });
    this.move('drop', 40);
    if (this.towardDistrict >= this.tune.districtEvery) {
      this.towardDistrict = 0;
      this.course.district++;
      this.districtQueued = this.course.district;
      this.emit({ type: 'districtSoon', theme: THEMES[this.course.district % THEMES.length] });
    }
    this.newParcel(false);
  }

  private updateDistrict(): void {
    const b = this.course.blockAt(this.s);
    if (b && b.district !== this.district && this.grounded) {
      this.district = b.district;
      this.emit({ type: 'district', theme: b.theme, n: b.district });
      if (this.districtQueued === b.district) this.districtQueued = -1;
    }
  }

  // ------------------------------------------------------------------ pickups and pigeons

  private pickups(): void {
    for (const p of this.course.pickups) {
      if (p.taken || Math.abs(p.s - this.s) > 1.1) continue;
      if (Math.abs(p.x - this.x) > 1.0 || p.y < this.y - 0.4 || p.y > this.y + this.height + 0.6) continue;
      p.taken = true;
      if (p.kind === 'stamp') { this.stamps++; this.stats.stamps++; this.score += 5; }
      else if (p.kind === 'bottle') { if (this.parcel) { this.parcel.left += 5; this.parcel.total = Math.max(this.parcel.total, this.parcel.left); } this.score += 50; }
      else if (p.kind === 'spring') { this.springs = 3; this.score += 50; }
      this.emit({ type: 'pickup', p });
    }
    for (const f of this.course.flocks) {
      if (!f.startled && Math.abs(f.s - this.s) < 6.5 && Math.abs(f.x - this.x) < 5 && Math.abs(f.y - this.y) < 3) {
        f.startled = true;
        this.stats.flocks++;
        this.emit({ type: 'pigeons', f });
        this.move('pigeons', 15);
      }
      if (f.gold && !f.goldTaken && Math.abs(f.s - this.s) < 1.5 && Math.abs(f.x - this.x) < 1.4 && Math.abs(f.y + 0.4 - this.y) < 2.2) {
        f.goldTaken = true;
        this.stats.gold++;
        this.stamps += 25;
        this.stats.stamps += 25;
        this.score += 500;
        this.emit({ type: 'gold', f });
      }
    }
  }

  private setState(s: State): void {
    if (s !== this.state) { this.state = s; this.stateT = 0; }
    if (s !== 'run') this.blockedT = 0;
  }

  // ------------------------------------------------------------------ test hooks

  /** Puts the courier at a point of the course (screenshots, the store card). */
  place(s: number, x: number): void {
    this.course.ensure(s + 130);
    const b = this.course.blockAt(s) ?? this.course.nextBlock(s)!;
    this.s = Math.max(s, b.s0 + 0.5);
    this.x = x;
    this.y = this.course.groundAt(this.s, x, 99).y;
    this.vy = 0;
    this.vs = this.target;
    this.zip = null; this.ladder = null; this.vault = null; this.mantle = null;
    this.setState('run');
    this.block = b;
  }

  /** A fresh parcel from here, without a miss (test hook after a jump ahead). */
  reroute(): void { const p = this.parcel; this.newParcel(false); if (p && this.parcel) { this.parcel.left = this.parcel.total; } }

  /** Throws the courier into the air (vy) as if it had jumped. */
  launch(vy: number): void {
    this.vy = vy;
    this.toAir(false);
    this.holdT = 0;
  }
}
