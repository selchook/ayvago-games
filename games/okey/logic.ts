// Turkish Okey rules, pure and deterministic so every seat computes the same table from the
// shared seed (online play sends only the actions).
//
// 106 tiles: four colours × 1–13 × two copies, plus two false jokers. A face-up indicator
// tile decides the okey: the next number in the same colour (13 → 1). Okeys are wild; the
// false jokers stand for the okey's own colour and number. The dealer gets 15 tiles, the
// others 14. On your turn you draw (the centre pile or the tile the previous player just
// discarded) and discard one. You finish by discarding your 15th tile while the other 14 form
// sets (3–4 of a number in different colours) and runs (3+ in a row in one colour; 12-13-1 is
// allowed), or seven pairs.

export const COLORS = 4;
export const MAX_NUM = 13;
export const HAND = 14;

export interface Tile {
  /** Unique id 0–105 (104 and 105 are the false jokers). */
  id: number;
  /** 0 red, 1 yellow, 2 blue, 3 black; the false jokers keep -1 here. */
  color: number;
  /** 1–13; 0 for the false jokers. */
  num: number;
}

export const FALSE_JOKER = 0;

export function makeTiles(): Tile[] {
  const tiles: Tile[] = [];
  let id = 0;
  for (let copy = 0; copy < 2; copy++)
    for (let c = 0; c < COLORS; c++) for (let n = 1; n <= MAX_NUM; n++) tiles.push({ id: id++, color: c, num: n });
  tiles.push({ id: id++, color: -1, num: FALSE_JOKER }, { id: id++, color: -1, num: FALSE_JOKER });
  return tiles;
}

/** Small seeded PRNG (mulberry32). */
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), a | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** The okey for an indicator tile: same colour, next number (13 → 1). */
export function okeyOf(indicator: Tile): { color: number; num: number } {
  return { color: indicator.color, num: indicator.num === MAX_NUM ? 1 : indicator.num + 1 };
}

export interface Deal {
  hands: number[][];
  pile: number[];
  indicator: number;
  okey: { color: number; num: number };
  dealer: number;
}

/** Shuffles and deals a hand: the dealer gets 15 tiles, the others 14. */
export function deal(seed: number, dealer: number, players = 4): Deal {
  const tiles = makeTiles();
  const r = rng(seed);
  const order = tiles.map((t) => t.id);
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  // the indicator is never a false joker
  let ii = order.findIndex((id) => tiles[id].num !== FALSE_JOKER);
  const indicator = order.splice(ii, 1)[0];
  const hands: number[][] = [];
  for (let p = 0; p < players; p++) {
    const seat = (dealer + p) % players;
    hands[seat] = order.splice(0, seat === dealer ? HAND + 1 : HAND);
  }
  ii = 0;
  return { hands, pile: order, indicator, okey: okeyOf(tiles[indicator]), dealer };
}

/** What a tile is worth in play: okeys are wild, false jokers stand for the okey's value. */
export interface Face {
  wild: boolean;
  color: number;
  num: number;
}

export function faceOf(t: Tile, okey: { color: number; num: number }): Face {
  if (t.num === FALSE_JOKER) return { wild: false, color: okey.color, num: okey.num };
  if (t.color === okey.color && t.num === okey.num) return { wild: true, color: t.color, num: t.num };
  return { wild: false, color: t.color, num: t.num };
}

export interface Analysis {
  /** Most non-wild tiles that fit into sets and runs. */
  covered: number;
  /** Groups found for that best cover (tile ids; wild ids included). */
  groups: number[][];
  /** Ids left over. */
  loose: number[];
}

/**
 * Best arrangement of a hand into sets and runs (wilds fill gaps). A memoized search over
 * the set of used tiles; hands are at most 15 tiles with at most two wilds.
 */
export function analyse(ids: number[], tiles: Tile[], okey: { color: number; num: number }): Analysis {
  const faces = ids.map((id) => ({ id, f: faceOf(tiles[id], okey) }));
  const wilds = faces.filter((x) => x.f.wild).map((x) => x.id);
  const plain = faces.filter((x) => !x.f.wild).sort((a, b) => a.f.color - b.f.color || a.f.num - b.f.num);
  const n = plain.length;
  const memo = new Map<number, { score: number; groups: number[][] }>();

  const solve = (mask: number, w: number): { score: number; groups: number[][] } => {
    if (mask === (1 << n) - 1) return { score: 0, groups: [] };
    const key = mask * 4 + w;
    const hit = memo.get(key);
    if (hit) return hit;
    let i = 0;
    while (mask & (1 << i)) i++;
    const fi = plain[i].f;
    // leave tile i out
    let best = solve(mask | (1 << i), w);
    best = { score: best.score, groups: best.groups };
    const consider = (used: number[], wildsUsed: number) => {
      let m = mask;
      for (const u of used) m |= 1 << u;
      const rest = solve(m, w - wildsUsed);
      const score = rest.score + used.length;
      if (score > best.score) {
        const group = used.map((u) => plain[u].id);
        for (let k = 0; k < wildsUsed; k++) group.push(-1 - k);
        best = { score, groups: [group, ...rest.groups] };
      }
    };
    // sets: one tile per colour with this number
    const byColor: number[] = [];
    for (let j = i + 1; j < n; j++) {
      if (mask & (1 << j)) continue;
      const fj = plain[j].f;
      if (fj.num === fi.num && fj.color !== fi.color && byColor[fj.color] === undefined) byColor[fj.color] = j;
    }
    const others = byColor.filter((x) => x !== undefined);
    for (let pick = 0; pick < 1 << others.length; pick++) {
      const used = [i];
      others.forEach((j, k) => {
        if (pick & (1 << k)) used.push(j);
      });
      for (let wu = 0; wu <= w; wu++) {
        const size = used.length + wu;
        if (size >= 3 && size <= 4) consider(used, wu);
      }
    }
    // runs in tile i's colour, starting at i (wilds may sit before it and fill gaps)
    for (let pre = 0; pre <= w; pre++) {
      if (fi.num - pre < 1) break;
      let wu = pre;
      const used = [i];
      let len = 1 + pre;
      let v = fi.num;
      let m2 = mask | (1 << i);
      for (;;) {
        const next = v + 1;
        if (next > MAX_NUM + 1) break;
        const want = next === MAX_NUM + 1 ? 1 : next;
        let j = -1;
        for (let k = i + 1; k < n; k++) {
          if (m2 & (1 << k)) continue;
          if (plain[k].f.color === fi.color && plain[k].f.num === want) { j = k; break; }
        }
        // a 1 after 13 must be a different tile than a 1 already used
        if (want === 1 && next === MAX_NUM + 1) {
          j = -1;
          for (let k = 0; k < n; k++) {
            if (k === i || m2 & (1 << k) || used.includes(k)) continue;
            if (plain[k].f.color === fi.color && plain[k].f.num === 1) { j = k; break; }
          }
        }
        if (j >= 0) {
          used.push(j);
          m2 |= 1 << j;
        } else if (wu < w) wu++;
        else break;
        len++;
        v = next;
        if (len >= 3) consider([...used], wu);
        if (next === MAX_NUM + 1) break;
      }
    }
    // a 1 that ends a run: 12-13-1, 11-12-13-1 … (tile i is the lowest, so the 1 comes first)
    if (fi.num === 1) {
      let wu = 0;
      const used = [i];
      let m2 = mask | (1 << i);
      for (let v = MAX_NUM; v >= 2; v--) {
        let j = -1;
        for (let k = i + 1; k < n; k++) {
          if (m2 & (1 << k)) continue;
          if (plain[k].f.color === fi.color && plain[k].f.num === v) { j = k; break; }
        }
        if (j >= 0) {
          used.push(j);
          m2 |= 1 << j;
        } else if (wu < w) wu++;
        else break;
        if (used.length + wu >= 3) consider([...used], wu);
      }
    }
    memo.set(key, best);
    return best;
  };

  const res = solve(0, wilds.length);
  // swap the wild placeholders (-1, -2) for real wild ids
  const wildQueue = [...wilds];
  const groups = res.groups.map((g) => g.map((id) => (id < 0 ? (wildQueue.shift() as number) : id)));
  const used = new Set(groups.flat());
  const loose = ids.filter((id) => !used.has(id));
  return { covered: res.score, groups, loose };
}

/** Seven pairs: identical tiles (wilds pair with anything). Returns the number of pairs possible. */
export function pairCount(ids: number[], tiles: Tile[], okey: { color: number; num: number }): number {
  const counts = new Map<string, number>();
  let wild = 0;
  for (const id of ids) {
    const f = faceOf(tiles[id], okey);
    if (f.wild) { wild++; continue; }
    const k = `${f.color}:${f.num}`;
    counts.set(k, (counts.get(k) ?? 0) + 1);
  }
  let pairs = 0, singles = 0;
  for (const c of counts.values()) { pairs += Math.floor(c / 2); singles += c % 2; }
  const fill = Math.min(wild, singles);
  pairs += fill;
  pairs += Math.floor((wild - fill) / 2);
  return pairs;
}

export type WinKind = 'normal' | 'pairs';

/** Whether 14 tiles form a finished hand, and how. */
export function winKind(ids: number[], tiles: Tile[], okey: { color: number; num: number }): WinKind | null {
  if (ids.length !== HAND) return null;
  const plainCount = ids.filter((id) => !faceOf(tiles[id], okey).wild).length;
  const a = analyse(ids, tiles, okey);
  // every plain tile in a group; left-over wilds can always extend one of them
  if (a.covered === plainCount && (a.groups.length > 0 || plainCount === 0)) return 'normal';
  if (pairCount(ids, tiles, okey) >= 7) return 'pairs';
  return null;
}

/** A finishing discard from 15 tiles: the tile to throw and how the hand wins, or null. */
export function findFinish(ids: number[], tiles: Tile[], okey: { color: number; num: number }): { discard: number; kind: WinKind; withOkey: boolean } | null {
  let found: { discard: number; kind: WinKind; withOkey: boolean } | null = null;
  for (const id of ids) {
    const rest = ids.filter((x) => x !== id);
    const kind = winKind(rest, tiles, okey);
    if (!kind) continue;
    const withOkey = faceOf(tiles[id], okey).wild;
    // throwing the okey to finish doubles the score: prefer it
    if (!found || (withOkey && !found.withOkey)) found = { discard: id, kind, withOkey };
  }
  return found;
}

/** Points for a finished hand: 2, doubled for seven pairs and doubled for throwing the okey. */
export function handPoints(kind: WinKind, withOkey: boolean): number {
  return 2 * (kind === 'pairs' ? 2 : 1) * (withOkey ? 2 : 1);
}

// ---------- bots ----------

/** How promising a hand is: tiles in groups, plus partial groups and pairs. */
export function handValue(ids: number[], tiles: Tile[], okey: { color: number; num: number }): number {
  const a = analyse(ids, tiles, okey);
  let partial = 0;
  const loose = a.loose.map((id) => faceOf(tiles[id], okey)).filter((f) => !f.wild);
  for (let i = 0; i < loose.length; i++) {
    for (let j = i + 1; j < loose.length; j++) {
      const p = loose[i], q = loose[j];
      if (p.color === q.color && Math.abs(p.num - q.num) <= 2 && p.num !== q.num) partial += 0.6;
      else if (p.num === q.num && p.color !== q.color) partial += 0.6;
    }
  }
  const wilds = ids.filter((id) => faceOf(tiles[id], okey).wild).length;
  const pairs = pairCount(ids, tiles, okey);
  return a.covered * 3 + Math.min(partial, 6) + wilds * 2 + (pairs >= 5 ? pairs * 1.5 : 0);
}

/** Bot: take the previous player's discard if it improves the hand clearly. */
export function botTakesDiscard(hand: number[], discard: number, tiles: Tile[], okey: { color: number; num: number }): boolean {
  if (faceOf(tiles[discard], okey).wild) return true;
  const withIt = [...hand, discard];
  // best value after also throwing one tile
  const best = Math.max(...withIt.filter((id) => id !== discard).map((out) => handValue(withIt.filter((x) => x !== out), tiles, okey)));
  return best > handValue(hand, tiles, okey) + 1.5;
}

/** Bot: the tile to throw from 15 (never a wild unless it finishes). */
export function botDiscard(hand: number[], tiles: Tile[], okey: { color: number; num: number }, rand: () => number): number {
  let best = -Infinity, pick = hand[0];
  for (const id of hand) {
    if (faceOf(tiles[id], okey).wild) continue;
    const v = handValue(hand.filter((x) => x !== id), tiles, okey) + rand() * 0.2;
    if (v > best) { best = v; pick = id; }
  }
  return pick;
}

/** Tile label for logs and tests: "R7", "K13", "*" for a false joker. */
export function label(t: Tile): string {
  return t.num === FALSE_JOKER ? '*' : 'RYBK'[t.color] + t.num;
}
