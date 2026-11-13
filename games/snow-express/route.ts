// Snow Express: route finding on the track graph. From where a train is heading, the shortest way
// to a goal (its stop, or a snow drift for the plow) and the switch settings it needs on the way,
// in the order the train meets them. The bot routes with it and the levels get their par times
// from it. Pure.
import { Board, W } from './graph';
import type { ColorId } from './defs';

export interface Choice {
  junction: number;
  opt: number;
  /** Distance from the start of the search to the switch tile's edge. */
  at: number;
}

export interface Route {
  len: number;
  choices: Choice[];
  /** Tiles the route runs through, in order, with the distance to where it enters each. */
  tiles: number[];
  enter: number[];
}

export interface RouteGoal {
  stop?: number;
  /** Drift tiles to reach (the plow). */
  drift?: Set<number>;
  /** Tiles a train must not enter (uncleared drifts). */
  avoid?: Set<number>;
}

interface Node { seg: number; fwd: boolean; len: number; prev: Node | null; choice: { junction: number; opt: number } | null; tile: number }

/**
 * Shortest route from the end of segment `seg` (run in direction `fwd`), `rest` being what is
 * left of that segment.
 */
export function findRoute(b: Board, seg: number, fwd: boolean, rest: number, goal: RouteGoal): Route | null {
  const start: Node = { seg, fwd, len: rest, prev: null, choice: null, tile: b.segs[seg].tile };
  const open: Node[] = [start];
  const best = new Map<string, number>();
  best.set(seg + (fwd ? '+' : '-'), rest);
  const finish = (n: Node, extra: number): Route => {
    const choices: Choice[] = [];
    const tiles: number[] = [];
    const enter: number[] = [];
    for (let p: Node | null = n; p; p = p.prev) {
      if (p.choice && p.prev) choices.push({ ...p.choice, at: p.prev.len });
      if (p.tile >= 0) { tiles.push(p.tile); enter.push(p.len - b.segs[p.seg].len); }
    }
    choices.reverse();
    tiles.reverse();
    enter.reverse();
    return { len: n.len + extra, choices, tiles, enter };
  };
  while (open.length) {
    // the cheapest open node (small graphs: a scan is fine)
    let bi = 0;
    for (let i = 1; i < open.length; i++) if (open[i].len < open[bi].len) bi = i;
    const n = open.splice(bi, 1)[0];
    const s = b.segs[n.seg];
    if (n.len > 80) continue;
    // where the end of this segment leads
    let outs: { seg: number; fwd: boolean; stop?: number; tunnel?: number; junction?: number; opt?: number }[] = [];
    if (s.tile < 0) {
      // a lead: out of a tunnel onto the board (cabin leads end the line)
      const tn = b.tunnels.find((t) => t.lead === n.seg);
      if (!tn || !n.fwd) continue;
      const tile = tn.tc + tn.tr * W;
      const j = b.junctionAt[tile];
      if (j >= 0 && b.junctions[j].facing === tn.edge) {
        for (const opt of [0, 1]) {
          const r = b.enter(tile, tn.edge, () => opt);
          if (r) outs.push({ ...r, junction: j, opt });
        }
      } else {
        const r = b.enter(tile, tn.edge, () => 0);
        if (r) outs.push(r);
      }
    } else {
      const e = b.exitEdge(n.seg, n.fwd);
      const r0 = b.next(s.tile, e, () => 0);
      if (r0?.junction !== undefined) {
        for (const opt of [0, 1]) {
          const r = b.next(s.tile, e, () => opt);
          if (r) outs.push({ ...r, opt });
        }
      } else if (r0) outs.push(r0);
    }
    for (const o of outs) {
      const g = b.segs[o.seg];
      if (o.stop !== undefined) {
        if (goal.stop === o.stop) {
          const end: Node = { seg: o.seg, fwd: o.fwd, len: n.len, prev: n, choice: o.junction !== undefined ? { junction: o.junction, opt: o.opt! } : null, tile: -1 };
          return finish(end, 0);
        }
        continue;
      }
      if (o.tunnel !== undefined) continue;
      if (goal.avoid?.has(g.tile)) continue;
      const node: Node = { seg: o.seg, fwd: o.fwd, len: n.len + g.len, prev: n, choice: o.junction !== undefined ? { junction: o.junction, opt: o.opt! } : null, tile: g.tile };
      if (goal.drift?.has(g.tile)) return finish(node, 0);
      const key = o.seg + (o.fwd ? '+' : '-');
      if ((best.get(key) ?? Infinity) <= node.len) continue;
      best.set(key, node.len);
      open.push(node);
    }
  }
  return null;
}

/** Colours a tunnel can reach (its trains only carry these), keeping off the `avoid` tiles. */
export function reachable(b: Board, tunnel: number, avoid?: Set<number>): ColorId[] {
  const tn = b.tunnels[tunnel];
  const out: ColorId[] = [];
  for (const st of b.stops) {
    if (out.includes(st.color)) continue;
    if (findRoute(b, tn.lead, true, b.segs[tn.lead].len, { stop: st.id, avoid })) out.push(st.color);
  }
  return out;
}
