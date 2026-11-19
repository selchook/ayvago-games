// Astro Crew: the autopilot. It plays a mission the way a player does with a stick and three
// buttons: it crosses the planet to the objective (the next nest, keycard, rover, the dome or the
// boss's lair, then the beacon), steering round rocks, wrecks and lava; it picks up crystal caches,
// the castaway and health on the way; in a fight it kites the aliens at its weapon's reach, steps out
// of telegraphed slams, charges and dives, rolls through spit and fire rings, fires its skill into
// crowds and calls the mech when the swarm is thick. Between missions it buys base modules and
// picks power cards. Used by the menu's live backdrop, the store-art stage, the test hooks and the
// headless balance check (balance.ts).
import { HERO, WORLD_R, OBJ } from './defs';
import { CARD, UPGRADE, UPGRADE_IDS, MAX_RANK, type CardId, type Ranks, type UpgradeId } from './powers';
import type { Mission, Input } from './sim';
import type { Spot } from './world';

export interface Skill {
  /** Seconds between decisions (reaction). */
  think: number;
  /** Chance to notice a telegraph or a shot in time. */
  notice: number;
  /** Sloppiness of the steering (noise). */
  noise: number;
}
export const SKILL: Record<'casual' | 'decent' | 'good', Skill> = {
  casual: { think: 0.45, notice: 0.35, noise: 0.8 },
  decent: { think: 0.28, notice: 0.6, noise: 0.45 },
  good: { think: 0.1, notice: 0.92, noise: 0.12 },
};

interface Goal extends Spot { r: number; w: number }

export class Bot {
  private t = 0;
  private mx = 0;
  private mz = 0;
  private dodge = false;
  private skill = false;
  private mech = false;
  /** Stays home (the menu's backdrop keeps its fight on screen). */
  stay: Spot | null = null;

  constructor(private sim: Mission, private skillLv: Skill, private rnd: () => number) {}

  setSim(s: Mission): void { this.sim = s; this.t = 0; }

  input(dt: number): Input {
    this.t -= dt;
    if (this.t <= 0) { this.t = this.skillLv.think * (0.7 + this.rnd() * 0.6); this.decide(); }
    const out: Input = { mx: this.mx, mz: this.mz, dodge: this.dodge, skill: this.skill, mech: this.mech };
    this.dodge = this.skill = this.mech = false;
    return out;
  }

  private decide(): void {
    const s = this.sim, h = s.hero, S = this.skillLv;
    if (!h.alive || s.phase !== 'play') { this.mx = this.mz = 0; return; }
    const range = HERO[s.run.hero].range * s.m.range;
    let vx = 0, vz = 0;
    let danger = false;
    // threats: aliens push away (strongly when close or winding up), the target pulls in to reach
    let nearest = Infinity;
    let crowd = 0;
    let fighting = false;
    for (const f of s.foes) {
      if (f.state === 'dead' || f.sleep || f.kind === 'nest') continue;
      const dx = h.x - f.x, dz = h.z - f.z;
      if (Math.abs(dx) > 16 || Math.abs(dz) > 16) continue;
      const d = Math.hypot(dx, dz) || 0.01;
      if (f.engaged && d < 13) fighting = true;
      nearest = Math.min(nearest, d);
      if (d < 7) crowd += f.kind === 'boss' ? 5 : f.kind === 'brute' ? 2 : 1;
      const w = (f.kind === 'boss' ? 3 : f.kind === 'brute' ? 1.8 : 1) * (f.state === 'wind' || f.state === 'dive' ? 2.4 : 1);
      if (d < 5.5) { vx += (dx / d) * w * (5.5 - d) / 5.5 * 2; vz += (dz / d) * w * (5.5 - d) / 5.5 * 2; }
      if ((f.state === 'wind' || f.state === 'dive') && d < 5 && this.rnd() < S.notice) danger = true;
    }
    // telegraphs and spit
    for (const z of s.hazards) {
      if (!z.hostile || z.t < 0) continue;
      if (z.kind === 'slam' || z.kind === 'ring') {
        const d = Math.hypot(h.x - z.x, h.z - z.z);
        if (z.kind === 'slam' && d < z.r + 1) { vx += (h.x - z.x) / (d || 1) * 3; vz += (h.z - z.z) / (d || 1) * 3; if (z.max - z.t < 0.4 && this.rnd() < S.notice) danger = true; }
        if (z.kind === 'ring' && Math.abs(d - z.r) < 1.4 && d > z.r && this.rnd() < S.notice) danger = true;
      } else if (z.kind === 'charge' || z.kind === 'dive') {
        const ex = Math.sin(z.ang), ez = Math.cos(z.ang);
        const px = h.x - z.x, pz = h.z - z.z, along = px * ex + pz * ez, off = px * ez - pz * ex;
        if (along > 0 && along < z.len + 2 && Math.abs(off) < z.w + 1) {
          const side = off >= 0 ? 1 : -1;
          vx += ez * side * 3.5; vz += -ex * side * 3.5;
          if (z.max - z.t < 0.3 && this.rnd() < S.notice) danger = true;
        }
      }
    }
    for (const sh of s.shots) {
      if (!sh.hostile) continue;
      const dx = h.x - sh.x, dz = h.z - sh.z, d = Math.hypot(dx, dz);
      if (d < 2.2 && (dx * sh.vx + dz * sh.vz) > 0 && this.rnd() < S.notice) danger = true;
    }
    // the target at reach: step in when far, back off when close
    const tgt = s.nearestFoe(h.x, h.z, 14);
    if (tgt && tgt.engaged) {
      const dx = tgt.x - h.x, dz = tgt.z - h.z, d = Math.hypot(dx, dz) || 1;
      const want = Math.min(range * 0.75, tgt.kind === 'boss' ? 6.5 : range * 0.7);
      const k = d > want ? 0.6 : -0.4;
      vx += (dx / d) * k; vz += (dz / d) * k;
    }
    // where to go
    const goal = this.goal(fighting);
    if (goal) {
      const dx = goal.x - h.x, dz = goal.z - h.z, d = Math.hypot(dx, dz) || 1;
      if (d > goal.r) {
        const w = goal.w * (fighting ? 0.45 : 1);
        let gx = dx / d, gz = dz / d;
        // steer round the solids ahead
        for (const o of s.plan.solids) {
          const ox = o.x - h.x, oz = o.z - h.z;
          const along = ox * gx + oz * gz;
          if (along < 0 || along > Math.min(d, 8)) continue;
          const off = ox * gz - oz * gx;
          if (Math.abs(off) < o.r + 1.3) { const side = off >= 0 ? -1 : 1, px = gz * side, pz = -gx * side; gx += px * 1.4; gz += pz * 1.4; }
        }
        const gl = Math.hypot(gx, gz) || 1;
        vx += (gx / gl) * w; vz += (gz / gl) * w;
      } else if (goal.r > 3 && d < goal.r * 0.5) { vx -= (dx / d) * 0.4; vz -= (dz / d) * 0.4; }
    }
    // pickups near (health when hurt, the rest when near)
    for (const p of s.picks) {
      const dx = p.x - h.x, dz = p.z - h.z;
      if (Math.abs(dx) > 9 || Math.abs(dz) > 9) continue;
      const d = Math.hypot(dx, dz) || 1;
      const w = p.kind === 'health' ? (h.hp < h.max * 0.6 ? 2 : 0) : p.kind === 'thunder' || p.kind === 'bullets' || p.kind === 'jar' ? 1 : p.kind === 'xp' ? 0.25 : 0;
      if (w && d < 9) { vx += (dx / d) * w * (9 - d) / 9; vz += (dz / d) * w * (9 - d) / 9; }
    }
    // keep out of the lava
    if (s.plan.lava) for (const p of s.plan.pools) {
      const dx = h.x - p.x, dz = h.z - p.z, d = Math.hypot(dx, dz) || 0.01;
      if (d < p.r + 1.6) { vx += (dx / d) * 2.5; vz += (dz / d) * 2.5; }
    }
    // stay off the rim
    const r = Math.hypot(h.x, h.z);
    if (r > WORLD_R - 3) { vx -= (h.x / r) * (r - (WORLD_R - 3)); vz -= (h.z / r) * (r - (WORLD_R - 3)); }
    vx += (this.rnd() - 0.5) * S.noise * 2;
    vz += (this.rnd() - 0.5) * S.noise * 2;
    const l = Math.hypot(vx, vz);
    if (l > 0.15) { this.mx = vx / Math.max(1, l); this.mz = vz / Math.max(1, l); } else { this.mx = this.mz = 0; }
    if (danger && h.rollCd <= 0) this.dodge = true;
    else if (h.rollCd <= 0 && nearest < 1.6 && this.rnd() < 0.2) this.dodge = true;
    const boss = s.boss && s.bossAwake && s.boss.state !== 'dead' && Math.hypot(s.boss.x - h.x, s.boss.z - h.z) < 10;
    const nest = s.nearestNest(h.x, h.z, 8);
    if (h.charges > 0 && (crowd >= 5 || boss || (nest && crowd >= 2))) this.skill = true;
    if (h.charge >= 1 && h.mech <= 0 && (crowd >= 7 || boss || h.hp < h.max * 0.35 || (nest && crowd >= 4))) this.mech = true;
  }

  /** Where the mission wants the hero: the objective, with a detour for loot close by. */
  private goal(fighting: boolean): Goal | null {
    const s = this.sim, h = s.hero, P = s.plan;
    const range = HERO[s.run.hero].range * s.m.range;
    if (this.stay) return { ...this.stay, r: 7, w: 0.5 };
    // health when low
    if (h.hp < h.max * 0.4) {
      let best: Spot | null = null, bd = 22;
      for (const p of s.picks) if (p.kind === 'health') { const d = Math.hypot(p.x - h.x, p.z - h.z); if (d < bd) { bd = d; best = p; } }
      if (best) return { ...best, r: 0.3, w: 1.8 };
    }
    // the castaway and crystal caches nearby
    const c = s.castaway;
    if (c && !c.saved && Math.hypot(c.x - h.x, c.z - h.z) < 24) return { x: c.x, z: c.z, r: OBJ.castR * 0.6, w: 1.4 };
    if (!fighting) {
      for (const p of s.picks) if (p.kind === 'jar' && Math.hypot(p.x - h.x, p.z - h.z) < 16) return { x: p.x, z: p.z, r: 0.3, w: 1.3 };
    }
    switch (s.def.kind) {
      case 'defend': {
        const D = s.dome;
        const busy = s.alerts.active > 0 || s.alerts.next < 7;
        if (!busy) {
          let best: Spot | null = null, bd = 34;
          for (const n of s.nests) if (n.alive) { const d = Math.hypot(n.x - D.x, n.z - D.z); if (d < bd) { bd = d; best = n; } }
          if (best) return { ...best, r: range * 0.7, w: 1.4 };
        }
        // by the dome, on the side the aliens come from
        let ax = 0, az = 0;
        for (const f of s.foes) if (f.wave && f.state !== 'dead') { ax += f.x - D.x; az += f.z - D.z; }
        const al = Math.hypot(ax, az);
        return al > 0 ? { x: D.x + ax / al * 5, z: D.z + az / al * 5, r: 3, w: 1.6 } : { x: D.x, z: D.z - 5, r: 4, w: 1.4 };
      }
      case 'clear': {
        const o = s.objectives()[0];
        return o ? { ...o, r: range * 0.7, w: 1.5 } : null;
      }
      case 'keys': {
        const o = s.objectives()[0];
        if (!o) return null;
        if (s.keys.hold >= 0) return { ...P.base, r: OBJ.beaconR * 0.55, w: 2 };
        return { ...o, r: 0.2, w: 1.6 };
      }
      case 'rescue': {
        let best: Spot | null = null, bd = Infinity;
        for (const r of s.rovers) if (!r.fixed) { const d = Math.hypot(r.x - h.x, r.z - h.z) - r.prog * 30; if (d < bd) { bd = d; best = r; } }
        return best ? { ...best, r: OBJ.fixR * 0.6, w: 2.2 } : null;
      }
      case 'boss': {
        if (s.shielded) { const o = s.objectives()[0]; if (o) return { ...o, r: range * 0.7, w: 1.5 }; }
        const b = s.boss;
        if (b && b.state !== 'dead') return { x: b.x, z: b.z, r: s.bossAwake ? 6.5 : 4, w: s.bossAwake ? 0.8 : 1.5 };
        return P.lair ? { ...P.lair, r: 4, w: 1.5 } : null;
      }
    }
    return null;
  }
}

/** Upgrades in the bot's order of preference. */
const WISH: UpgradeId[] = ['hull', 'armory', 'lab', 'solar', 'thrusters', 'radar', 'drone', 'hull', 'armory', 'drone', 'lab', 'solar', 'radar', 'thrusters', 'hull', 'armory', 'drone', 'lab', 'solar', 'thrusters', 'radar'];

/** Buys what it can afford in its order; returns the crystals left. */
export function botShop(ranks: Ranks, purse: number): number {
  for (let pass = 0; pass < 2; pass++) {
    for (const u of WISH) {
      const r = ranks[u];
      if (r >= MAX_RANK) continue;
      const p = UPGRADE[u].price[r];
      if (p <= purse) { ranks[u] = r + 1; purse -= p; }
    }
  }
  return purse;
}

/** The best card of an offer. */
export function botPick(offer: CardId[]): number {
  let best = 0;
  offer.forEach((c, i) => { if (CARD[c].value > CARD[offer[best]].value) best = i; });
  return best;
}

export { UPGRADE_IDS };
