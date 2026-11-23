// City generator: the seaside. Along the promenade of a coast city: a wooden pier with lamps and a
// café at its head, a stone breakwater with the lighthouse on its tip, the marina's jetties with
// moored sail and motor boats (in the basin carved up to the sea wall), rows of beach huts,
// lifeguard towers, palms and benches along the sea wall. Pure data (decks, props and railings);
// CityView draws them.
import { type P, p, dist, clamp } from './geom';
import { type Rng, hash01 } from './rng';
import type { Site } from './roads';
import { roadDims } from './roads';
import type { Deck, Prop, PropKind, Wall } from './types';

export interface CoastOut {
  decks: Deck[];
  lighthouse: { x: number; z: number; y: number; h: number } | null;
  props: Prop[];
  walls: Wall[];
  /** Points on the sea wall where a deck starts (its railing leaves a gap there). */
  gaps: { p: P; r: number }[];
  /** Places the beach props keep clear of (decks, huts). */
  keepOut: { p: P; r: number }[];
}

const BOAT_COLOURS = [0xffffff, 0xffffff, 0xf4f1ea, 0x1f3a5f, 0xffffff, 0x2a7f8f, 0xb03a2e, 0xffffff, 0x1c2833];
const HUT_COLOURS = [0x3b8fd1, 0xf2c94c, 0xe9573f, 0x45b39d, 0xf28db2, 0xffffff, 0x8e6fd1, 0x5dc1e6];

export function makeCoast(site: Site, rnd: Rng): CoastOut {
  const out: CoastOut = { decks: [], lighthouse: null, props: [], walls: [], gaps: [], keepOut: [] };
  const c = site.coast;
  if (!c) return out;
  const { toWorld, shoreV, promV, features: f } = c;
  const S = site.S;
  const half = roadDims('avenue', false, false).half;
  /** The sea wall: the outer edge of the promenade's sea-side sidewalk. */
  const wallV = (u: number) => promV(u) - half - 3.5;
  const seaward = (u: number): P => { const a = toWorld(u, 0), b = toWorld(u, -1); return p(b.x - a.x, b.z - a.z); };
  const heading = (d: P) => Math.atan2(d.x, d.z);
  const add = (kind: PropKind, q: P, h: number, s = 1, col = 0, y = 0) => out.props.push({ kind, x: q.x, z: q.z, h, y, s, c: col });
  const rail = (a: P, b: P) => out.walls.push({ kind: 'railing', a, b, h: 1.05 });

  // ---- the pier
  if (f.pier !== null) {
    const u = f.pier;
    const L = rnd.range(115, 150);
    const a = toWorld(u, wallV(u) + 0.6), b = toWorld(u, shoreV(u) - L);
    const d = seaward(u), n = p(-d.z, d.x);
    const deck: Deck = { kind: 'pier', a, b, half: 3.6, y: 0.15, head: 13 };
    out.decks.push(deck);
    out.gaps.push({ p: toWorld(u, wallV(u)), r: deck.half + 0.4 });
    const len = dist(a, b);
    const at = (s: number, o: number): P => p(a.x + d.x * s + n.x * o, a.z + d.z * s + n.z * o);
    // railings along both sides (the head has its own), lamps and benches
    rail(at(1.5, deck.half - 0.1), at(len - 5, deck.half - 0.1));
    rail(at(len - 5, -(deck.half - 0.1)), at(1.5, -(deck.half - 0.1)));
    const hb = deck.head, hd = 10;
    const h0 = len - 5, h1 = len + hd - 5;
    rail(at(h0, deck.half - 0.1), at(h0, hb - 0.1)); rail(at(h0, hb - 0.1), at(h1, hb - 0.1));
    rail(at(h1, hb - 0.1), at(h1, -(hb - 0.1))); rail(at(h1, -(hb - 0.1)), at(h0, -(hb - 0.1))); rail(at(h0, -(hb - 0.1)), at(h0, -(deck.half - 0.1)));
    for (let s = 10, k = 0; s < len - 8; s += 16, k++) {
      const side = k % 2 ? 1 : -1;
      add('lamp', at(s, side * (deck.half - 0.45)), heading(p(-n.x * side, -n.z * side)), 0.85, 0, 0);
      if (k % 2 === 0) add('bench', at(s + 8, -side * (deck.half - 0.7)), heading(p(n.x * side, n.z * side)) + Math.PI, 1, 0, 0);
    }
    // the head: a café kiosk, its tables, lamps at the corners
    const hc = h0 + hd / 2;
    add('kiosk', at(hc, 0), heading(p(-d.x, -d.z)));
    for (const o of [-8, 8]) add('cafe', at(hc - 1.5, o), heading(d), 1, 0, 0);
    add('cafe', at(hc + 3, -6.5), 0.7, 1, 0, 0); add('cafe', at(hc + 3, 6.5), 2.2, 1, 0, 0);
    for (const o of [-(hb - 0.6), hb - 0.6]) add('lamp', at(h1 - 0.6, o), heading(p(-d.x, -d.z)), 0.85);
    out.keepOut.push({ p: at(len / 2, 0), r: len / 2 + 4 }, { p: toWorld(u, (wallV(u) + shoreV(u)) / 2), r: 8 });
  }

  // ---- the breakwater and its lighthouse
  {
    const u = f.light;
    const L = clamp(S * 0.13, 150, 210);
    const a = toWorld(u, wallV(u) + 0.6), b = toWorld(u, Math.min(shoreV(u), wallV(u)) - L);
    out.decks.push({ kind: 'breakwater', a, b, half: 4.2, y: 0.15, head: 8 });
    out.gaps.push({ p: toWorld(u, wallV(u)), r: 4.6 });
    const d = seaward(u);
    const tip = p(b.x + d.x * 2, b.z + d.z * 2);
    out.lighthouse = { x: tip.x, z: tip.z, y: 0.15, h: heading(d) };
    out.keepOut.push({ p: toWorld(u, wallV(u) - L / 2), r: L / 2 + 8 });
  }

  // ---- the marina: jetties into the basin, boats moored along them
  if (f.marina) {
    const [m0, m1] = f.marina;
    const first = f.dir > 0 ? f.light + 20 : f.light - 20;
    for (let k = 0; k < 8; k++) {
      const u = first + f.dir * k * 26;
      if (u < m0 + 8 || u > m1 - 8) break;
      const L = rnd.range(52, 72);
      const d = seaward(u), n = p(-d.z, d.x);
      const a = toWorld(u, wallV(u) + 0.6), b = toWorld(u, wallV(u) - L);
      out.decks.push({ kind: 'jetty', a, b, half: 1.3, y: -0.2, head: 0 });
      out.gaps.push({ p: toWorld(u, wallV(u)), r: 1.7 });
      for (const side of [1, -1]) {
        for (let s = 7; s < L - 3; s += 4.6) {
          const r = hash01(site.seed, Math.round(u), Math.round(s * 10), side + 5);
          if (r < 0.2) continue;
          const len = 7 + r * 5;
          const o = side * (1.3 + 0.6 + len / 2);
          const q = p(a.x + d.x * s + n.x * o, a.z + d.z * s + n.z * o);
          // bow out (away from the jetty), a sailboat when r is high
          add(r > 0.55 ? 'sailboat' : 'boat', q, heading(p(n.x * side, n.z * side)), len / 9, BOAT_COLOURS[Math.floor(r * 97) % BOAT_COLOURS.length]);
        }
      }
      // lamps at the jetty's end
      add('lamp', p(b.x + n.x * 0.9, b.z + n.z * 0.9), heading(p(-n.x, -n.z)), 0.6, 0, -0.35);
    }
  }

  // ---- beach huts, lifeguard towers, palms and benches along the sea wall
  if (site.style.beach) {
    const onBeach = (u: number) => promV(u) - shoreV(u) >= c.beachW && (!f.marina || u < f.marina[0] - 14 || u > f.marina[1] + 14)
      && (f.pier === null || Math.abs(u - f.pier) > 22) && Math.abs(u - f.light) > 14;
    const hutRow = (u0: number, n: number) => {
      const col = Math.floor(rnd() * HUT_COLOURS.length);
      for (let i = 0; i < n; i++) {
        const u = u0 + i * 3.4;
        if (!onBeach(u)) continue;
        const q = toWorld(u, wallV(u) - 2.4);
        add('hut', q, heading(seaward(u)), 1, HUT_COLOURS[(col + i) % HUT_COLOURS.length]);
        out.keepOut.push({ p: q, r: 3 });
      }
    };
    const pu = f.pier ?? S / 2;
    hutRow(pu + 55, 8);
    hutRow(pu - 55 - 8 * 3.4, 7);
    for (const du of [-230, 190]) {
      const u = pu + du;
      if (u < c.m + 20 || u > S - c.m - 20 || !onBeach(u)) continue;
      const q = toWorld(u, (wallV(u) + shoreV(u)) / 2);
      add('lifeguard', q, heading(seaward(u)));
      out.keepOut.push({ p: q, r: 5 });
    }
    for (let u = c.m + 12, k = 0; u < S - c.m - 12; u += 11, k++) {
      if (f.pier !== null && Math.abs(u - f.pier) < 8) continue;
      if (Math.abs(u - f.light) < 9) continue;
      if (f.marina && u > f.marina[0] - 2 && u < f.marina[1] + 2 && k % 3 !== 0) continue;
      const q = toWorld(u, wallV(u) + 1.1);
      if (k % 2 === 0) add('palm', q, rnd.range(0, 6.28), rnd.range(0.85, 1.1));
      else add('bench', toWorld(u, wallV(u) + 1.3), heading(seaward(u)));
    }
  }
  return out;
}
