// Skull Isle: the autopilot. It fights (closes in, swings full combos, picks targets), reads the
// red telegraphs and rolls or walks out of them, keeps off the waterline when sharks hunt, grabs
// loot and power-ups, opens chests (swimming out to a hidden islet's when the beach is quiet),
// uses the special and the powder kegs, shops between islands (crew, ship and repairs), picks a
// route and sails: it steers out of the red warnings and round the rocks, fires the broadsides and
// salvages what floats by. It plays behind the menu, in the store art and in the headless balance
// run; the casual skill reacts late, misses some warnings and wanders, like a first-time player.
import { seeded, PLAYER, SEA, type Route } from './defs';
import { landD, waterD } from './island';
import { SHOP_COST, SHOP_IDS, SHIP_COST, type ShopId, type ShipId } from './upgrades';
import { NO_INPUT, type Input, type Sim, type Tele } from './sim';

export interface Skill {
  /** Seconds before a new telegraph is noticed. */
  react: number;
  /** Chance a telegraph is noticed at all. */
  notice: number;
  /** Chance to roll out of a telegraph instead of walking. */
  roll: number;
  /** Presses per second while in reach. */
  apm: number;
  /** Uses the special / kegs well. */
  tactics: number;
  /** Random wandering. */
  sloppy: number;
}

export const SKILL: Record<'casual' | 'good', Skill> = {
  casual: { react: 0.4, notice: 0.6, roll: 0.25, apm: 3.5, tactics: 0.3, sloppy: 0.45 },
  good: { react: 0.1, notice: 0.97, roll: 0.75, apm: 9, tactics: 1, sloppy: 0.04 },
};

const SHOP_ORDER: ShopId[] = ['dmg', 'hp', 'combo', 'dmg', 'hp', 'dodge', 'charge', 'magnet', 'crit', 'dmg', 'hp', 'combo', 'crit', 'charge', 'dodge', 'hp', 'dmg', 'magnet', 'crit', 'hp', 'charge', 'magnet', 'dodge', 'dmg'];
const SHIP_ORDER: ShipId[] = ['hull', 'cannon', 'net', 'hull', 'sails', 'cannon', 'swim', 'figurehead', 'hull', 'cannon', 'sails', 'net', 'figurehead', 'hull', 'swim', 'cannon', 'sails', 'figurehead', 'net', 'swim'];

export class Bot {
  private rnd: () => number;
  private seen = new Map<number, { at: number; noticed: boolean }>();
  private pressT = 0;
  private wanderT = 0;
  private wx = 0;
  private wz = 0;
  private lastPress = false;

  constructor(private sim: Sim, private skill: Skill, seed = 7) {
    this.rnd = seeded(seed * 31 + 5);
  }

  /** The telegraphs the bot has noticed and is afraid of. */
  private threats(): Tele[] {
    const s = this.sim;
    const out: Tele[] = [];
    for (const T of s.teles) {
      if (T.friendly || (T.dmg <= 0 && !T.lane && T.id !== s.tutTele)) continue;
      let e = this.seen.get(T.id);
      if (!e) { e = { at: s.time, noticed: this.rnd() < this.skill.notice }; this.seen.set(T.id, e); }
      if (e.noticed && s.time - e.at >= this.skill.react) out.push(T);
    }
    if (this.seen.size > 200) for (const id of [...this.seen.keys()].slice(0, 100)) this.seen.delete(id);
    return out;
  }

  input(dt: number): Input {
    const s = this.sim, p = s.p;
    const inp: Input = { ...NO_INPUT };
    if (s.over || p.state === 'dead') return inp;
    this.pressT -= dt;
    this.wanderT -= dt;
    if (s.atSea) return this.sail(dt);
    // ---------------------------------------------- danger first
    let fleeX = 0, fleeZ = 0, danger = false, urgent = false;
    for (const T of this.threats()) {
      if (!s.inTele(T, p.x, p.z, PLAYER.radius + 0.5)) continue;
      danger = true;
      const left = T.dur - T.t;
      if (left < 0.45) urgent = true;
      let ax: number, az: number;
      if (T.kind === 'line') {
        const ux = Math.sin(T.ang), uz = Math.cos(T.ang);
        const v = -(p.x - T.x) * uz + (p.z - T.z) * ux;
        const side = v >= 0 ? 1 : -1;
        ax = -uz * side; az = ux * side;
      } else {
        ax = p.x - T.x; az = p.z - T.z;
        const l = Math.hypot(ax, az) || 1;
        ax /= l; az /= l;
        if (l < 0.2) { ax = 0; az = 1; }
      }
      fleeX += ax; fleeZ += az;
    }
    // walking out to sea is not an escape
    if (danger) {
      const l = Math.hypot(fleeX, fleeZ) || 1;
      fleeX /= l; fleeZ /= l;
      if (landD(s.L, p.x + fleeX * 2, p.z + fleeZ * 2) > -0.6 && !p.swim) { const t = fleeX; fleeX = -fleeZ; fleeZ = t; }
      inp.mx = fleeX; inp.mz = fleeZ;
      if (!p.swim) this.stayAshore(inp);
      if (urgent && p.dodgeCd <= 0 && this.rnd() < this.skill.roll * dt * 30) inp.dodge = true;
      return inp;
    }
    // ---------------------------------------------- the target
    const foes = s.foes.filter((f) => s.targetable(f));
    let target: { x: number; z: number; r: number } | null = null;
    let bd = 1e9;
    for (const f of foes) {
      const c = f.kind === 'arm' || f.kind === 'tentacle' ? s.armPoint(f, p.x, p.z) : f;
      const d = Math.hypot(c.x - p.x, c.z - p.z) + (f.hp / Math.max(1, f.maxHp)) * 1.5 + (f.kind === 'head' ? -8 : f.kind === 'captain' ? -2 : 0);
      if (d < bd) { bd = d; target = { x: c.x, z: c.z, r: f.r * f.scale }; }
    }
    if (!target) {
      // a tentacle waiting in the water: walk into its reach to bait the slam (then roll, then hit)
      for (const f of s.foes) {
        if ((f.kind !== 'tentacle' && f.kind !== 'arm') || f.state !== 'idle') continue;
        const bx = f.bx + Math.sin(f.yaw) * f.len * 0.75, bz = f.bz + Math.cos(f.yaw) * f.len * 0.75;
        const d = Math.hypot(bx - p.x, bz - p.z);
        if (d < bd) { bd = d; target = { x: bx, z: bz, r: 1.5 }; }
      }
    }
    let islet = false;
    if (!target) {
      for (const c of s.chests) {
        if (c.open) continue;
        // the islet's treasure: only when the beach is quiet and the hero is fit (the good bot always, the casual one now and then)
        if (c.islet && (p.hp < s.st.maxHp * (p.swim ? 0.35 : 0.6) || (p.breath < s.shipSt.breath * 0.9 && !p.swim) || s.phase === 'cleared' || s.bossActive || this.skill.tactics < 0.5 && (s.wave + s.k) % 2 === 0)) continue;
        const d = Math.hypot(c.x - p.x, c.z - p.z);
        if (d < bd) { bd = d; target = { x: c.x, z: c.z, r: 0.6 }; islet = !!c.islet; }
      }
    }
    // power-ups and loot nearby are worth a detour
    let loot: { x: number; z: number } | null = null, ld = foes.length ? 4.5 : 30;
    for (const l of s.loot) {
      if (l.kind !== 'power' && foes.length) continue;
      const d = Math.hypot(l.x - p.x, l.z - p.z);
      if (d < ld) { ld = d; loot = l; }
    }
    // ---------------------------------------------- special and kegs
    const near = foes.filter((f) => Math.hypot(f.x - p.x, f.z - p.z) < 6).length;
    const bossOut = s.foes.some((f) => (f.kind === 'head' && f.state === 'open') || (f.kind === 'captain' && f.state !== 'ship'));
    if (p.special >= PLAYER.pip && (near >= 3 || bossOut || p.special >= s.maxSpecial) && this.rnd() < this.skill.tactics * dt * 6) inp.special = true;
    if (p.kegs > 0 && near >= 3 && this.rnd() < this.skill.tactics * dt * 3) inp.item = true;
    // ---------------------------------------------- moving
    let gx = 0, gz = 0;
    if (loot && (!target || ld < 2.5)) { gx = loot.x - p.x; gz = loot.z - p.z; }
    else if (target) {
      const dx = target.x - p.x, dz = target.z - p.z, d = Math.hypot(dx, dz);
      const reach = Math.min(1.5 + target.r, 2.1 + target.r * 0.4);
      if (d > reach) { gx = dx; gz = dz; }
      else {
        // in reach: swing (a steady rhythm, so the combo chains)
        gx = dx / d * 0.25; gz = dz / d * 0.25;
        if (this.pressT <= 0) { inp.attack = true; this.pressT = 1 / this.skill.apm; }
      }
    } else {
      // nothing to do: back to the middle
      gx = -p.x * 0.3; gz = (s.L.rz * 0.2 - p.z) * 0.3;
    }
    // round the palms, rocks and houses in the way
    const gl = Math.hypot(gx, gz);
    if (gl > 0.3) {
      const ux = gx / gl, uz = gz / gl;
      for (const o of s.L.props) {
        if (o.r <= 0) continue;
        const ox = o.x - p.x, oz = o.z - p.z;
        const along = ox * ux + oz * uz;
        if (along < 0 || along > Math.min(gl, 3)) continue;
        const side = -ox * uz + oz * ux;
        if (Math.abs(side) > o.r + PLAYER.radius + 0.25) continue;
        const sgn = side >= 0 ? -1 : 1;
        gx += -uz * sgn * 2.2 * gl / Math.max(1, gl); gz += ux * sgn * 2.2 * gl / Math.max(1, gl);
      }
    }
    // keep off the waterline where sharks hunt; out of breath (or with nothing to swim for): back to land
    if (!islet && s.isle.sharks && landD(s.L, p.x, p.z) > -3.4) { gx -= p.x * 0.25; gz -= p.z * 0.25; }
    if (p.swim && (!islet || p.breath < 2.5)) {
      const toI = s.L.islet && waterD(s.L, p.x, p.z) < landD(s.L, p.x, p.z) && islet;
      const cx = toI ? s.L.islet!.x : 0, cz = toI ? s.L.islet!.z : 0;
      gx = (cx - p.x); gz = (cz - p.z);
    }
    if (this.skill.sloppy > 0) {
      if (this.wanderT <= 0) { this.wanderT = 0.6 + this.rnd(); const a = this.rnd() * 6.28; this.wx = Math.cos(a); this.wz = Math.sin(a); }
      gx += this.wx * this.skill.sloppy * 3; gz += this.wz * this.skill.sloppy * 3;
    }
    const l = Math.hypot(gx, gz);
    if (l > 0.05) { const k = l > 1 ? 1 / l : 1; inp.mx = gx * k; inp.mz = gz * k; }
    if (!islet && !p.swim) this.stayAshore(inp);
    // do not hold attack down: press edges only
    if (inp.attack && this.lastPress) inp.attack = false;
    this.lastPress = inp.attack;
    return inp;
  }

  /** Unless it swims for the islet, the bot keeps its feet dry: no stepping out past the shallows. */
  private stayAshore(inp: Input): void {
    const s = this.sim, p = s.p;
    if (landD(s.L, p.x + inp.mx * 1.2, p.z + inp.mz * 1.2) < -0.5) return;
    const d = Math.hypot(p.x, p.z) || 1, ox = p.x / d, oz = p.z / d;
    const out = inp.mx * ox + inp.mz * oz;
    if (out > 0) { inp.mx -= ox * out; inp.mz -= oz * out; }
  }

  // ------------------------------------------------------------------ at sea

  /** The route: the good bot braves the storm with a sound hull; the casual one picks at random. */
  route(): Route {
    const s = this.sim;
    if (this.skill === SKILL.casual) return this.rnd() < 0.5 ? 'calm' : 'storm';
    return s.hull >= s.shipSt.maxHull * 0.6 ? 'storm' : 'calm';
  }

  private sail(dt: number): Input {
    const s = this.sim, v = s.voyage;
    const inp: Input = { ...NO_INPUT };
    if (!v || s.phase !== 'sea') return inp;
    const ship = v.ship;
    const threats = this.threats();
    // where across the lane to be: every candidate is scored for the warnings it would be inside
    // when they land, the rocks ahead, the loot afloat and a foe lined up beside the ship
    const look = ship.speed * 3.2;
    let foe: { x: number; z: number } | null = null, fd = 1e9;
    for (const f of v.foes) {
      if (!v.targetable(f)) continue;
      const d = Math.abs(f.z - ship.z);
      if (d < fd && d < 20) { fd = d; foe = v.aimPoint(f); }
    }
    let best = ship.x, bc = 1e9, slow = false;
    for (let cx = -SEA.lane; cx <= SEA.lane + 1e-6; cx += 0.75) {
      let c = Math.abs(cx - ship.x) * 0.12;
      for (const r of v.rocks) {
        const dz = ship.z - r.z;
        if (dz < -5 || dz > look) continue;
        const need = r.r + 1.3 + 0.8;
        if (Math.abs(cx - r.x) < need) c += 45 * (1 - Math.max(0, dz) / look * 0.5);
      }
      for (const T of threats) {
        const left = Math.max(0, T.dur - T.t);
        const z = ship.z - ship.speed * left;
        let inside = false;
        for (const u of [3.3, 0, -3.3]) if (s.inTele(T, cx, z - u, 1.3)) inside = true;
        if (inside) { c += 60; if (T.kind === 'line' && Math.abs(Math.sin(T.ang)) > 0.7) slow = true; }
      }
      for (const f of v.floats) {
        const dz = ship.z - f.z;
        if (dz < -2 || dz > 26) continue;
        if (Math.abs(cx - f.x) < s.shipSt.net + 0.8) c -= 8 * (1 - Math.max(0, dz) / 30) * (f.kind === 'crate' && ship.hull < s.shipSt.maxHull * 0.7 ? 2 : 1);
      }
      if (foe) c += Math.abs(Math.abs(cx - foe.x) - 6) * 0.25;
      if (c < bc) { bc = c; best = cx; }
    }
    let gx = (best - ship.x) * 0.7;
    if (this.skill.sloppy > 0) {
      if (this.wanderT <= 0) { this.wanderT = 0.8 + this.rnd(); this.wx = this.rnd() * 2 - 1; }
      gx += this.wx * this.skill.sloppy * 1.4;
    }
    inp.mx = Math.max(-1, Math.min(1, gx));
    if (slow) inp.mz = 0.9;
    // evade when a warning is about to land on the hull and the rudder alone is too slow
    let urgent = false;
    for (const T of threats) if (T.dur - T.t < 0.5 && v.shipIn(T)) urgent = true;
    if (urgent && ship.evadeCd <= 0 && this.rnd() < this.skill.roll * dt * 30) { inp.dodge = true; inp.mx = Math.sign(best - ship.x) || inp.mx; }
    // fire whenever a broadside bears
    if (v.aim && ship.reload[v.aim.side] <= 0 && this.pressT <= 0 && this.rnd() < this.skill.tactics * 0.6 + 0.4) { inp.attack = true; this.pressT = 1 / this.skill.apm + 0.1; }
    if (inp.attack && this.lastPress) inp.attack = false;
    this.lastPress = inp.attack;
    return inp;
  }

  /** Between islands: buy what it can, in a sensible order, a patch-up when hurt, the shipwright when battered. */
  shop(): void {
    const s = this.sim;
    if (s.hull < s.shipSt.maxHull * 0.45) s.buyRepair();
    if (s.p.hp < s.st.maxHp * 0.55) s.buyPatch();
    for (const id of SHOP_ORDER) {
      const lv = s.shop[id] ?? 0;
      if (lv < SHOP_COST[id].length && s.gold >= SHOP_COST[id][lv]) s.buy(id);
    }
    for (const id of SHOP_IDS) {
      const lv = s.shop[id] ?? 0;
      if (lv < SHOP_COST[id].length && s.gold >= SHOP_COST[id][lv]) s.buy(id);
    }
    if (s.p.hp < s.st.maxHp * 0.8) s.buyPatch();
    if (s.hull < s.shipSt.maxHull * 0.75) s.buyRepair();
    // the ship gets what is left
    for (const id of SHIP_ORDER) {
      const lv = s.shipLv[id] ?? 0;
      if (lv < SHIP_COST[id].length && s.gold >= SHIP_COST[id][lv] + 10) { s.buyShip(id); break; }
    }
  }

  /** A boon: the first of the three (the casual bot picks at random). */
  draft(): number { return this.skill === SKILL.casual ? Math.floor(this.rnd() * 3) : 0; }
}
