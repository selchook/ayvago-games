// The online match's wire format and the guest's interpolation, kept free of Phaser and three.js
// so a headless test can drive the exact code the game runs (see netbench.ts).
//
//   host → guest 'st' (~20 Hz): every player's place, facing, jump height, action and speed, the
//     ball, the score, both clocks, the phase, who controls whom, the fire, and the events of the
//     last 0.7 s with sequence numbers (sounds and effects; the guest plays each one once);
//   guest → host 'in' (~20 Hz, and at once on a change): the stick, turbo, and every button as a
//     press counter (nothing is lost if a message is late), plus the shot's hold time.
import { ACTS, BALL_STATES, PHASES, EV_KINDS, type Act, type BallState, type Ev, type Game, type Phase } from './sim';
import type { FigState } from './players';

export interface Snap {
  t: number;
  p: number[];                    // 6 × [x, z, face, lift, act, actT, spd, turbo, kind] (×100 for the first seven)
  b: number[];                    // x, y, z (×100), state, holder
  s: [number, number];
  c: number;                      // game clock, tenths
  sc: number;                     // shot clock, tenths
  ph: number;
  ot: number;
  cl: number;                     // the team with the ball has cleared
  of: number;                     // offence
  f: number;                      // fire bits
  ct: [number, number];
  st: number;                     // the guest's controlled player's stamina
  ev: number[][];                 // [seq, kind, p, a]
  w: number;
  a: number;                      // the guest's last input (q) the host had
  ia: number;                     // ms the host had been playing it
}

export interface InMsg { x: number; z: number; tb: number; sd: number; su: number; sh: number; ps: number; pt: number; jp: number; ac: number; sw: number; q: number }
export const emptyIn = (): InMsg => ({ x: 0, z: 0, tb: 0, sd: 0, su: 0, sh: 0, ps: 0, pt: -1, jp: 0, ac: 0, sw: 0, q: -1 });

export const PER_PLAYER = 9;
/** The view: a held ball that would move further than this in one frame eases there instead (m). */
export const HELD_SNAP = 0.3;

/** Host: the snapshot of the match now. */
export function encodeSnap(g: Game, now: number, ev: number[][], lastIn: number, inFor: number): Snap {
  const r = (v: number) => Math.round(v * 100);
  const p: number[] = [];
  for (const q of g.p) p.push(r(q.x), r(q.z), r(q.face), r(q.lift), ACTS.indexOf(q.act), r(q.actT), r(Math.hypot(q.vx, q.vz)), q.turbo ? 1 : 0, q.kind);
  const b = g.ball;
  const c1 = g.ctrl[1];
  return {
    t: Math.round(now), p, b: [r(b.x), r(b.y), r(b.z), BALL_STATES.indexOf(b.state), b.holder],
    s: [g.score[0], g.score[1]], c: Math.ceil(g.clock * 10), sc: Math.ceil(g.shotClock * 10), ph: PHASES.indexOf(g.phase), ot: g.overtime ? 1 : 0,
    cl: g.cleared ? 1 : 0, of: g.offence, f: (g.fire[0] ? 1 : 0) | (g.fire[1] ? 2 : 0), ct: [g.ctrl[0], g.ctrl[1]],
    st: c1 >= 0 ? Math.round(g.p[c1].stamina) : 100, ev, w: g.winner, a: lastIn, ia: lastIn >= 0 ? Math.round(inFor) : 0,
  };
}

/** Host: keeps the events of the last `keep` ms, numbered, for the snapshots. */
export class EventLog {
  private log: Array<{ at: number; e: number[] }> = [];
  private seq = 0;
  constructor(private keep = 700) {}
  add(e: Ev, now: number): void {
    this.seq++;
    this.log.push({ at: now, e: [this.seq, EV_KINDS.indexOf(e.k), e.p, Math.round(e.a * 100) / 100] });
    this.trim(now);
  }
  recent(now: number): number[][] {
    this.trim(now);
    return this.log.map((x) => x.e);
  }
  private trim(now: number): void {
    while (this.log.length && now - this.log[0].at > this.keep) this.log.shift();
  }
}

/** What the guest draws at one moment. */
export interface Sampled {
  p: FigState[];
  ball: { x: number; y: number; z: number; state: BallState; holder: number };
  fire: [boolean, boolean];
  ctrl: [number, number];
  phase: Phase;
  snap: Snap;
}

/**
 * Guest: the host's snapshots, mapped to the guest's clock (the smallest delay seen, drifting up
 * slowly) and sampled `delay` ms in the past, linearly between the two snapshots around that
 * moment. Angles take the short way round; a ball that jumped more than 3 m between two
 * snapshots (never in play) is not smeared across the gap.
 */
export class SnapBuffer {
  readonly snaps: Array<{ s: Snap; at: number }> = [];
  offset = Number.NaN;
  /** The offset the drawing uses: it follows `offset` by at most 1 ms a frame, so time never jumps. */
  private shown = Number.NaN;
  count = 0;
  private lastSeq = 0;
  constructor(public delay = 110) {}

  push(s: Snap, at: number): void {
    const off = at - s.t;
    this.offset = Number.isNaN(this.offset) ? off : Math.min(off, this.offset + 2);
    this.snaps.push({ s, at });
    if (this.snaps.length > 40) this.snaps.shift();
    this.count++;
  }

  /** Events not seen before, in order. */
  newEvents(s: Snap): Ev[] {
    const out: Ev[] = [];
    for (const e of s.ev ?? []) {
      if (e[0] <= this.lastSeq) continue;
      this.lastSeq = e[0];
      const k = EV_KINDS[e[1]];
      if (k) out.push({ k, p: e[2], a: e[3] });
    }
    return out;
  }

  get latest(): Snap | null {
    return this.snaps.length ? this.snaps[this.snaps.length - 1].s : null;
  }

  sample(now: number): Sampled | null {
    if (!this.snaps.length) return null;
    if (Number.isNaN(this.shown)) this.shown = this.offset;
    this.shown += Math.max(-1, Math.min(1, this.offset - this.shown));
    const target = now - this.shown - this.delay;
    let a = this.snaps[0], b = a;
    for (let i = this.snaps.length - 1; i >= 0; i--) {
      if (this.snaps[i].s.t <= target) { a = this.snaps[i]; b = this.snaps[i + 1] ?? a; break; }
    }
    const span = b.s.t - a.s.t;
    const k = span > 0 ? Math.max(0, Math.min(1, (target - a.s.t) / span)) : 0;
    const L = (x: number, y: number) => x + (y - x) * k;
    const A = (x: number, y: number) => { let d = y - x; while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2; return x + d * k; };
    const S = k < 0.5 ? a.s : b.s;
    const pa = a.s.p, pb = b.s.p;
    const phase = PHASES[S.ph] ?? 'play';
    const p: FigState[] = [];
    const B0 = k < 0.5 ? a.s.b : b.s.b;
    const hold = BALL_STATES[B0[3]] === 'held' ? B0[4] : -1;
    for (let i = 0; i < 6; i++) {
      const o = i * PER_PLAYER;
      p.push({
        x: L(pa[o], pb[o]) / 100, z: L(pa[o + 1], pb[o + 1]) / 100, face: A(pa[o + 2] / 100, pb[o + 2] / 100), lift: L(pa[o + 3], pb[o + 3]) / 100,
        act: (ACTS[S.p[o + 4]] ?? 'free') as Act, actT: S.p[o + 5] / 100 + (k < 0.5 ? k : k - 1) * span / 1000, spd: L(pa[o + 6], pb[o + 6]) / 100, turbo: !!S.p[o + 7],
        mood: phase === 'final' ? ((i < 3 ? 0 : 1) === S.w ? 1 : 2) : 0, guard: false, kind: S.p[o + 8] ?? 0,
      });
    }
    // a defender near the ball handler crouches into his stance
    if (hold >= 0) {
      const h = p[hold];
      for (let i = 0; i < 6; i++) if ((i < 3) !== (hold < 3)) p[i].guard = Math.hypot(p[i].x - h.x, p[i].z - h.z) < 2.2;
    }
    const ba = a.s.b, bb = b.s.b;
    // the ball changed hands between the two (a catch, a pick-up, a release): no smearing, the
    // view eases the switch from one to the other
    const jumpy = Math.hypot(ba[0] - bb[0], ba[1] - bb[1], ba[2] - bb[2]) > 300 || ba[3] !== bb[3] || ba[4] !== bb[4];
    const B = k < 0.5 ? ba : bb;
    return {
      p,
      ball: {
        x: (jumpy ? B[0] : L(ba[0], bb[0])) / 100, y: (jumpy ? B[1] : L(ba[1], bb[1])) / 100, z: (jumpy ? B[2] : L(ba[2], bb[2])) / 100,
        state: (BALL_STATES[B[3]] ?? 'loose') as BallState, holder: B[4],
      },
      fire: [!!(S.f & 1), !!(S.f & 2)],
      ctrl: [S.ct[0], S.ct[1]],
      phase,
      snap: S,
    };
  }
}
