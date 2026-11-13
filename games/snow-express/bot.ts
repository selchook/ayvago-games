// Snow Express: the autopilot. It routes every train to a cabin of its colour (the plow to the
// snow drifts first), sets each switch for the train that reaches it next, as soon as the switch
// is free, and, when good, holds trains at red signals so two of them never meet at a crossing or
// a merge, and reaches for the powers when the board gets crowded. The casual bot reacts late and
// sometimes gets a switch wrong. It drives the menu backdrop, the store art and the balance runs.
import type { SimInput, Train } from './sim';
import { NO_INPUT, Sim } from './sim';
import { findRoute, type Route } from './route';
import { Rng, CAR_GAP } from './defs';

export interface Skill {
  /** Seconds before it acts on a switch a train needs. */
  react: number;
  /** Chance a switch decision goes wrong. */
  mistake: number;
  /** It only looks at trains this close (tiles) to a switch. */
  look: number;
  /** Uses the signals to keep trains apart. */
  signals: boolean;
  /** Uses Hot Cocoa / Snow Globe sensibly. */
  powers: boolean;
  /** Seconds between its glances at the board (actions are spaced out). */
  glance: number;
}

export const SKILL: Record<'good' | 'casual', Skill> = {
  good: { react: 0.2, mistake: 0, look: 7, signals: true, powers: true, glance: 0.1 },
  casual: { react: 0.9, mistake: 0.05, look: 3.4, signals: false, powers: false, glance: 0.45 },
};

interface Need { junction: number; opt: number; at: number; train: Train }

export class Bot {
  private rng: Rng;
  private seen = new Map<string, number>();
  private botched = new Map<string, boolean>();
  private wait = 0;
  private routes = new Map<number, Route | null>();
  /** Debug: the last plan (needs per switch). */
  plan: Need[] = [];

  constructor(private sim: Sim, private skill: Skill, seed = 1) {
    this.rng = new Rng(seed);
  }

  /** The route of a train from the end of its committed path to where it should go. */
  route(tr: Train): Route | null {
    const sim = this.sim, b = sim.board;
    const last = tr.path[tr.path.length - 1];
    const seg = b.segs[last.seg];
    const rest = last.start + seg.len - tr.head;
    let best: Route | null = null;
    if (tr.kind === 'plow') {
      if (sim.drifts.size) best = findRoute(b, last.seg, last.fwd, rest, { drift: sim.drifts });
      if (!best) for (const st of b.stops) {
        const r = findRoute(b, last.seg, last.fwd, rest, { stop: st.id });
        if (r && (!best || r.len < best.len)) best = r;
      }
      return best;
    }
    for (const st of b.stops) {
      if (st.color !== tr.color) continue;
      const r = findRoute(b, last.seg, last.fwd, rest, { stop: st.id, avoid: sim.drifts });
      if (r && (!best || r.len < best.len)) best = r;
    }
    return best;
  }

  input(dt: number): SimInput {
    const sim = this.sim;
    this.wait -= dt;
    if (this.wait > 0 || sim.over) return NO_INPUT;
    this.wait = this.skill.glance;
    const flips: number[] = [];
    // every running train's next switch settings
    const needs: Need[] = [];
    this.routes.clear();
    for (const tr of sim.trains) {
      if (tr.state !== 'run') continue;
      const r = this.route(tr);
      this.routes.set(tr.id, r);
      if (!r) continue;
      const done = new Set<number>();
      for (const c of r.choices) {
        if (done.has(c.junction)) continue;
        done.add(c.junction);
        needs.push({ junction: c.junction, opt: c.opt, at: c.at, train: tr });
      }
    }
    // trains about to come out of a tunnel: a player sees the lamp and the preview and gets ready
    for (const { spawn, index } of sim.announced()) {
      const tn = sim.board.tunnels[spawn.tunnel];
      const lead = sim.board.segs[tn.lead];
      const goal = spawn.kind === 'plow'
        ? (sim.drifts.size ? { drift: sim.drifts } : null)
        : { stop: -1, avoid: sim.drifts };
      if (!goal) continue;
      let best: Route | null = null;
      if ('drift' in goal) best = findRoute(sim.board, tn.lead, true, Sim.START_BACK, goal);
      else for (const st of sim.board.stops) {
        if (st.color !== spawn.color) continue;
        const r = findRoute(sim.board, tn.lead, true, Sim.START_BACK, { stop: st.id, avoid: sim.drifts });
        if (r && (!best || r.len < best.len)) best = r;
      }
      if (!best) continue;
      const lag = Math.max(0, spawn.t - sim.clock) * sim.speedOf(spawn.kind);
      const ghost = { id: -1000 - index, cruise: sim.speedOf(spawn.kind) } as Train;
      const done = new Set<number>();
      for (const c of best.choices) {
        if (done.has(c.junction)) continue;
        done.add(c.junction);
        needs.push({ junction: c.junction, opt: c.opt, at: c.at + lag, train: ghost });
      }
    }
    // per switch, the train that gets there first
    const first = new Map<number, Need>();
    for (const n of needs) {
      const f = first.get(n.junction);
      if (!f || n.at < f.at) first.set(n.junction, n);
    }
    this.plan = [...first.values()];
    const now = sim.time;
    for (const n of first.values()) {
      if (n.at > this.skill.look) continue;
      const key = n.train.id + ':' + n.junction;
      if (!this.seen.has(key)) this.seen.set(key, now);
      if (now - this.seen.get(key)! < this.skill.react) continue;
      if (!this.botched.has(key)) this.botched.set(key, this.rng.chance(this.skill.mistake));
      const want = this.botched.get(key) ? 1 - n.opt : n.opt;
      if (sim.state[n.junction] === want) continue;
      if (!sim.switchFree(n.junction)) continue;
      const ci = sim.board.controls.findIndex((c) => c.kind === 'switch' && c.id === n.junction);
      if (ci >= 0) flips.push(ci);
    }
    // signals: hold a train that would meet another at a shared tile
    if (this.skill.signals && sim.board.signals.length) this.signals(flips);
    let power: SimInput['power'] = null;
    if (this.skill.powers) power = this.powers();
    if (!flips.length && !power) return NO_INPUT;
    return { flips, power };
  }

  /** When each running train is on each tile of its way (seconds from now), nose to tail. */
  private occupancy(tr: Train): Map<number, [number, number]> {
    const out = new Map<number, [number, number]>();
    const r = this.routes.get(tr.id);
    const v = Math.max(0.3, tr.cruise);
    const span = (tr.cars - 1) * CAR_GAP + 0.9;
    if (!r) return out;
    for (let i = 0; i < r.tiles.length; i++) {
      const d = r.enter[i];
      if (d > 9) break;
      const t0 = Math.max(0, (d - 0.5) / v), t1 = (d + 1 + span) / v;
      const prev = out.get(r.tiles[i]);
      out.set(r.tiles[i], prev ? [Math.min(prev[0], t0), Math.max(prev[1], t1)] : [t0, t1]);
    }
    // the tiles it is on now
    const set = new Set<number>();
    this.sim.occupied(tr, set);
    for (const t of set) {
      const prev = out.get(t);
      out.set(t, [0, Math.max(prev?.[1] ?? 0, span / v)]);
    }
    return out;
  }

  private signals(flips: number[]): void {
    const sim = this.sim, b = sim.board;
    const occ = new Map<number, Map<number, [number, number]>>();
    for (const tr of sim.trains) if (tr.state === 'run' || tr.state === 'crashed' || tr.state === 'stuck') occ.set(tr.id, this.occupancy(tr));
    const wantRed = b.signals.map(() => false);
    for (const tr of sim.trains) {
      if (tr.state !== 'run') continue;
      const r = this.routes.get(tr.id);
      if (!r) continue;
      // the first signal on its way, close ahead
      let si = -1, sd = 0;
      for (let i = 0; i < r.tiles.length; i++) {
        if (r.enter[i] > 2.2) break;
        const s = b.signalAt[r.tiles[i]];
        if (s >= 0 && r.enter[i] > -0.2) { si = s; sd = r.enter[i]; break; }
      }
      if (si < 0) continue;
      const mine = occ.get(tr.id)!;
      let clash = false;
      for (const o of sim.trains) {
        if (o === tr) continue;
        const theirs = occ.get(o.id);
        if (!theirs) continue;
        for (const [tile, [a0, a1]] of mine) {
          const t = theirs.get(tile);
          if (!t) continue;
          // only tiles past the signal matter, and only if the other gets there first
          if (a0 < sd / Math.max(0.3, tr.cruise)) continue;
          if (a0 < t[1] + 0.4 && t[0] < a1 + 0.4 && (t[0] < a0 || (t[0] === a0 && o.id < tr.id))) { clash = true; break; }
        }
        if (clash) break;
      }
      if (clash) wantRed[si] = true;
    }
    wantRed.forEach((red, i) => {
      if (sim.red[i] !== red) {
        const ci = b.controls.findIndex((c) => c.kind === 'signal' && c.id === i);
        if (ci >= 0) flips.push(ci);
      }
    });
  }

  private powers(): SimInput['power'] {
    const sim = this.sim;
    const running = sim.trains.filter((t) => t.state === 'run').length;
    if (sim.powers.cocoa > 0 && sim.cocoaT <= 0 && sim.globeT <= 0 && running >= 4) return 'cocoa';
    if (sim.powers.globe > 0 && sim.globeT <= 0 && sim.cocoaT <= 0 && running >= 5) return 'globe';
    return null;
  }
}
