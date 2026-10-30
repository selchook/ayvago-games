// Backgammon (tavla) rules: pure functions shared by the board, the AI and the online check.
//
// A position keeps each side's checkers in that side's own numbering: index 1..24 are the points
// (every side moves from 24 down to 1), 25 is the bar and 0 holds the borne-off checkers.
// Point x of one side is point 25 - x of the other.

export type Side = 0 | 1;
export interface Pos { p: [number[], number[]] }
export interface Step { from: number; to: number; die: number; hit: boolean }

export const BAR = 25;
export const OFF = 0;
export const other = (s: Side): Side => (s === 0 ? 1 : 0);

export function initial(): Pos {
  const side = () => {
    const a = new Array(26).fill(0);
    a[24] = 2; a[13] = 5; a[8] = 3; a[6] = 5;
    return a;
  };
  return { p: [side(), side()] };
}

export const clone = (pos: Pos): Pos => ({ p: [pos.p[0].slice(), pos.p[1].slice()] });

export function key(pos: Pos): string {
  return pos.p[0].join(',') + '|' + pos.p[1].join(',');
}

export function pips(pos: Pos, s: Side): number {
  let n = 0;
  const a = pos.p[s];
  for (let i = 1; i <= 25; i++) n += a[i] * i;
  return n;
}

export function allHome(a: number[]): boolean {
  for (let i = 7; i <= 25; i++) if (a[i]) return false;
  return true;
}

/** Single-checker moves of side `s` with one die. */
export function singleMoves(pos: Pos, s: Side, d: number): Step[] {
  const me = pos.p[s], op = pos.p[other(s)];
  const out: Step[] = [];
  const land = (from: number, to: number) => {
    const o = op[25 - to];
    if (o < 2) out.push({ from, to, die: d, hit: o === 1 });
  };
  if (me[BAR] > 0) {
    land(BAR, BAR - d);
    return out;
  }
  const home = allHome(me);
  let highest = 0;
  for (let i = 6; i >= 1; i--) if (me[i]) { highest = i; break; }
  for (let from = 24; from >= 1; from--) {
    if (!me[from]) continue;
    const to = from - d;
    if (to >= 1) land(from, to);
    else if (home && (to === 0 || from === highest)) out.push({ from, to: OFF, die: d, hit: false });
  }
  return out;
}

export function apply(pos: Pos, s: Side, m: Step): Pos {
  const n = clone(pos);
  const me = n.p[s], op = n.p[other(s)];
  me[m.from]--;
  if (m.to === OFF) me[OFF]++;
  else {
    if (op[25 - m.to] === 1) { op[25 - m.to] = 0; op[BAR]++; }
    me[m.to]++;
  }
  return n;
}

const diceKey = (dice: number[]) => dice.slice().sort().join('');

/** Most dice that can still be used from this position. */
export function maxUsable(pos: Pos, s: Side, dice: number[], memo = new Map<string, number>()): number {
  if (!dice.length) return 0;
  const k = key(pos) + '#' + diceKey(dice);
  const hit = memo.get(k);
  if (hit !== undefined) return hit;
  let best = 0;
  for (const d of new Set(dice)) {
    const rest = dice.slice();
    rest.splice(rest.indexOf(d), 1);
    for (const m of singleMoves(pos, s, d)) {
      best = Math.max(best, 1 + maxUsable(apply(pos, s, m), s, rest, memo));
      if (best === dice.length) break;
    }
    if (best === dice.length) break;
  }
  memo.set(k, best);
  return best;
}

/**
 * Legal next steps: every step that still lets the turn use as many dice as possible; when
 * only one of two different dice can be played, the larger one must be (if it can).
 */
export function legalSteps(pos: Pos, s: Side, dice: number[]): Step[] {
  if (!dice.length) return [];
  const memo = new Map<string, number>();
  const max = maxUsable(pos, s, dice, memo);
  if (max === 0) return [];
  let out: Step[] = [];
  for (const d of new Set(dice)) {
    const rest = dice.slice();
    rest.splice(rest.indexOf(d), 1);
    for (const m of singleMoves(pos, s, d)) if (1 + maxUsable(apply(pos, s, m), s, rest, memo) === max) out.push(m);
  }
  if (max === 1 && dice.length === 2 && dice[0] !== dice[1]) {
    const big = Math.max(dice[0], dice[1]);
    if (out.some((m) => m.die === big)) out = out.filter((m) => m.die === big);
  }
  return out;
}

export function rollDice(rand: () => number = Math.random): [number, number] {
  return [1 + Math.floor(rand() * 6), 1 + Math.floor(rand() * 6)];
}

/** The dice a roll gives to play: doubles move four times. */
export function diceList(d: [number, number]): number[] {
  return d[0] === d[1] ? [d[0], d[0], d[0], d[0]] : [d[0], d[1]];
}

export function removeDie(dice: number[], d: number): number[] {
  const r = dice.slice();
  const i = r.indexOf(d);
  if (i >= 0) r.splice(i, 1);
  return r;
}

/** Checks a whole turn sent by the other player; returns the final position or null. */
export function playTurn(pos: Pos, s: Side, roll: [number, number], seq: Array<[number, number, number]>): Pos | null {
  let cur = pos;
  let dice = diceList(roll);
  for (const [from, to, die] of seq) {
    const m = legalSteps(cur, s, dice).find((x) => x.from === from && x.to === to && x.die === die);
    if (!m) return null;
    cur = apply(cur, s, m);
    dice = removeDie(dice, die);
  }
  return legalSteps(cur, s, dice).length ? null : cur;
}

/** 0 while the game runs; else the points the winner `s` takes (1, or 2 for a gammon / mars). */
export function result(pos: Pos, s: Side): number {
  if (pos.p[s][OFF] < 15) return 0;
  return pos.p[other(s)][OFF] === 0 ? 2 : 1;
}

// ---------------------------------------------------------------- AI

/** Every distinct end position of a full turn, with one step sequence that reaches it. */
export function turnOutcomes(pos: Pos, s: Side, roll: [number, number]): Array<{ pos: Pos; seq: Step[] }> {
  const out = new Map<string, { pos: Pos; seq: Step[] }>();
  const seen = new Set<string>();
  const walk = (cur: Pos, dice: number[], seq: Step[]) => {
    const k = key(cur) + '#' + diceKey(dice);
    if (seen.has(k)) return;
    seen.add(k);
    const steps = legalSteps(cur, s, dice);
    if (!steps.length) {
      const fk = key(cur);
      if (!out.has(fk)) out.set(fk, { pos: cur, seq });
      return;
    }
    for (const m of steps) walk(apply(cur, s, m), removeDie(dice, m.die), [...seq, m]);
  };
  walk(pos, diceList(roll), []);
  return [...out.values()];
}

/** How likely a blot `dist` pips in front of an enemy checker is to be hit (rough odds). */
const SHOT = [0, 11, 12, 14, 15, 15, 17, 6, 6, 5, 3, 2, 3, 0, 0, 1, 1, 0, 1, 0, 1, 0, 0, 0, 1].map((n) => n / 36);

/** Heuristic value of a position for side `s` (the other side moves next). */
export function evaluate(pos: Pos, s: Side): number {
  const me = pos.p[s], op = pos.p[other(s)];
  const myP = pips(pos, s), opP = pips(pos, other(s));
  let myBack = 0, opBack = 0;
  for (let i = 25; i >= 1; i--) if (me[i]) { myBack = i; break; }
  for (let i = 25; i >= 1; i--) if (op[i]) { opBack = i; break; }
  const contact = myBack + opBack > 25;
  let v = (opP - myP) * 1.0 + (me[OFF] - op[OFF]) * 4;
  if (!contact) {
    // pure race: pips and checkers off; wasted pips deep in the home board cost a little
    return v * 1.6 + me[OFF] * 3 - me[1] * 0.4;
  }
  // made points, the home board most of all, and primes
  let run = 0, prime = 0, homePts = 0;
  for (let i = 1; i <= 24; i++) {
    if (me[i] >= 2) {
      run++; prime = Math.max(prime, run);
      v += i <= 6 ? 5 + (i >= 4 ? 2 : 0) : i === 7 ? 6 : i <= 11 ? 3 : i >= 18 ? 3 : 1.5;
      if (i <= 6) homePts++;
      if (me[i] > 3) v -= (me[i] - 3) * 0.8;          // stacking
    } else run = 0;
  }
  v += prime >= 3 ? (prime - 2) * (prime - 2) * 3 : 0;
  // enemy checkers on the bar against our home board
  v += op[BAR] * (6 + homePts * 2.5);
  v -= me[BAR] * 9;
  // blots: chance to be hit times what being hit costs (the pips back to the start)
  for (let i = 1; i <= 24; i++) {
    if (me[i] !== 1) continue;
    const at = 25 - i;            // the blot in the opponent's numbering
    let risk = 0;
    for (let q = at + 1; q <= 25; q++) if (op[q]) risk += SHOT[q - at] ?? 0;
    risk = Math.min(0.85, risk);
    if (risk > 0) v -= risk * (25 - i) * 0.55 + 1;
  }
  return v;
}

/** AI turn for side `s`: `noise` > 0 makes it sloppier. */
export function chooseTurn(pos: Pos, s: Side, roll: [number, number], noise: number, rand: () => number = Math.random): Step[] {
  const opts = turnOutcomes(pos, s, roll);
  let best = -Infinity, pick: Step[] = [];
  for (const o of opts) {
    const win = result(o.pos, s);
    const v = win ? 1000 * win : evaluate(o.pos, s) + (rand() * 2 - 1) * noise;
    if (v > best) { best = v; pick = o.seq; }
  }
  return pick;
}

/** AI levels: evaluation noise (lower = stronger). */
export const LEVELS = [16, 9, 5, 2, 0];
