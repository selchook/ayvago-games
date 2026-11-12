// Crypt Crawler autopilot: plays the hero through the pure simulation like a player would.
// It explores the floor (pickups, pots, chests, the shrine, the key and the vault, then the
// stairs), fights the nearest enemy, sidesteps or dashes out of telegraphed attacks and shots
// after a reaction delay, and charges a spin when surrounded. It drives the attract scene
// behind the menu, the in-game test hook and the headless balance check (balance.ts).
import { Sim, ENEMIES, T_STAIRS, angDiff, type Enemy, type UpgradeId, type Tele } from './sim';

export interface Skill {
  /** Seconds before a new threat is noticed. */
  react: number;
  /** Chance a noticed threat is dodged at all. */
  dodge: number;
  /** Aim error in radians. */
  aim: number;
  /** Breaks pots and opens every chest. */
  greedy: boolean;
  /** Explores every room before taking the stairs. */
  explore: boolean;
  /** Seconds between attack presses at best. */
  tap: number;
}

export const SKILL: Record<'good' | 'casual', Skill> = {
  good: { react: 0.2, dodge: 0.8, aim: 0.12, greedy: true, explore: true, tap: 0.14 },
  casual: { react: 0.32, dodge: 0.58, aim: 0.25, greedy: true, explore: true, tap: 0.22 },
};

/** Upgrade preference (lower = sooner). */
const PREF: Record<UpgradeId, number> = {
  damage: 0, heart: 1, orbit: 2, speed: 3, shield: 4, lifesteal: 5, reach: 6, dash: 7, whirl: 8, magnet: 9,
};

export class Bot {
  private seen = new Map<number, number>();
  private path: number[] = [];
  private pathT = 0;
  private pathGoal = -1;
  private tapT = 0;
  private holdT = 0;
  private wasAttack = false;
  private dodgeRoll = new Map<number, boolean>();
  private stuckT = 0;
  private potAttack = false;
  private goalRoom = -1;
  private floorRef: unknown = null;
  /** Loot the bot gave up on (out of reach), and how long it has chased the current one. */
  private ignore = new Set<number>();
  private chase = new Map<number, number>();
  private lastX = 0;
  private lastZ = 0;
  /** What it is doing (test hook). */
  doing = '';

  constructor(private sim: Sim, private skill: Skill = SKILL.good, private rng: () => number = Math.random) {}

  choose(offer: UpgradeId[]): UpgradeId {
    return [...offer].sort((a, b) => PREF[a] - PREF[b] + (this.rng() - 0.5) * 3)[0];
  }

  update(dt: number): void {
    const sim = this.sim, h = sim.hero, inp = sim.input;
    if (sim.floor !== this.floorRef) {
      this.floorRef = sim.floor;
      this.goalRoom = -1;
      this.ignore.clear();
      this.chase.clear();
      this.path = [];
    }
    inp.mx = 0; inp.mz = 0; inp.dash = false; inp.aim = false;
    let attack = false;
    this.tapT -= dt;
    this.pathT -= dt;
    if (!h.alive) { inp.attack = false; return; }
    const now = sim.time;
    const room = sim.room;
    const foes = sim.enemies.filter((e) => e.alive && e.room === room && e.state !== 'spawn');

    // ---- threats: telegraphs, shots, shock rings, spikes
    let ex = 0, ez = 0, urgent = false;
    const noticed = (id: number) => {
      if (!this.seen.has(id)) this.seen.set(id, now);
      if (!this.dodgeRoll.has(id)) this.dodgeRoll.set(id, this.rng() < this.skill.dodge);
      return now - this.seen.get(id)! >= this.skill.react && this.dodgeRoll.get(id)!;
    };
    for (const e of foes) {
      if ((e.state !== 'windup' && e.state !== 'act') || !e.tele) { this.seen.delete(e.id); this.dodgeRoll.delete(e.id); continue; }
      if (!inTele(e.tele, h.x, h.z, 0.45)) continue;
      if (!noticed(e.id)) continue;
      const [ax, az] = away(e.tele, h.x, h.z);
      ex += ax; ez += az;
      if (e.t < 0.28 || e.state === 'act') urgent = true;
    }
    for (const p of sim.projs) {
      const id = 1e6 + p.id;
      if (p.kind === 'wave') {
        const d = Math.hypot(h.x - p.cx, h.z - p.cz);
        if (p.radius < d && d - p.radius < 0.9 && noticed(id)) urgent = true;
        continue;
      }
      const rx = h.x - p.x, rz = h.z - p.z;
      const sp = Math.hypot(p.vx, p.vz) || 1;
      const along = (rx * p.vx + rz * p.vz) / sp;
      if (along < 0 || along > 2.6) continue;
      const perp = (rx * -p.vz + rz * p.vx) / sp;
      if (Math.abs(perp) > 0.55) continue;
      if (!noticed(id)) continue;
      const s = perp >= 0 ? 1 : -1;
      ex += -p.vz / sp * s * 1.4; ez += p.vx / sp * s * 1.4;
      if (along < 1.3) urgent = true;
    }
    for (const s of sim.floor.spikes) {
      if (s.room !== room || s.state === 0) continue;
      const d = Math.hypot(h.x - s.x, h.z - s.z);
      if (d < 0.75) { ex += (h.x - s.x) / (d || 1); ez += (h.z - s.z) / (d || 1); }
    }
    for (const b of sim.floor.blades) {
      if (b.room !== room) continue;
      if (Math.abs(h.z - b.z) < 0.85 && Math.abs(h.x - b.bx) < 1.4) { ez += h.z > b.z ? 1.2 : -1.2; }
    }

    if (ex || ez) {
      const l = Math.hypot(ex, ez);
      inp.mx = ex / l; inp.mz = ez / l;
      if (urgent && h.dashCd <= 0) inp.dash = true;
      this.doing = 'dodge';
    } else if (foes.length) {
      // ---- fight the nearest
      let tgt: Enemy | null = null, best = 1e9;
      for (const e of foes) {
        if (e.y < -0.5) continue;
        const d = Math.hypot(e.x - h.x, e.z - h.z) - (e.state === 'stun' ? 1 : 0);
        if (d < best) { best = d; tgt = e; }
      }
      if (tgt) {
        const d = Math.hypot(tgt.x - h.x, tgt.z - h.z);
        const reach = sim.stats.range * 0.85 + tgt.r;
        const boss = ENEMIES[tgt.kind].boss;
        const near = foes.filter((e) => Math.hypot(e.x - h.x, e.z - h.z) < sim.stats.range * 1.3).length;
        if (d > reach) this.goTowards(tgt.x, tgt.z);
        else if (boss && tgt.state !== 'stun' && tgt.state !== 'recover' && d < tgt.r + 0.6) {
          inp.mx = (h.x - tgt.x) / d; inp.mz = (h.z - tgt.z) / d;
        }
        const ang = Math.atan2(tgt.x - h.x, tgt.z - h.z) + (this.rng() - 0.5) * this.skill.aim * 2;
        inp.ax = Math.sin(ang); inp.az = Math.cos(ang); inp.aim = true;
        if (near >= 3 && h.atkCd <= 0) {
          // charge a spin
          this.holdT += dt;
          attack = this.holdT < sim.stats.chargeTime + 0.35;
          if (!attack) this.holdT = 0;
        } else {
          this.holdT = 0;
          if (d <= reach + 0.15 && this.tapT <= 0 && h.atkCd <= 0) { attack = true; this.tapT = this.skill.tap; }
        }
        this.doing = 'fight';
      }
    } else {
      this.holdT = 0;
      this.potAttack = false;
      this.explore();
      attack = this.potAttack;
    }
    // a press needs a release first
    if (attack && this.wasAttack && this.holdT === 0) attack = false;
    inp.attack = attack;
    this.wasAttack = attack;

    // stuck against something: a nudge
    const moved = Math.hypot(h.x - this.lastX, h.z - this.lastZ);
    this.lastX = h.x; this.lastZ = h.z;
    if ((inp.mx || inp.mz) && moved < dt * 0.3) {
      this.stuckT += dt;
      if (this.stuckT > 0.6) { attack = !this.wasAttack; inp.attack = attack; this.wasAttack = attack; this.path = []; this.pathT = 0; inp.mx += (this.rng() - 0.5) * 2; inp.mz += (this.rng() - 0.5) * 2; if (this.stuckT > 1.2) this.stuckT = 0; }
    } else this.stuckT = 0;
  }

  /** Walks the floor: loot here, then the shrine, the vault, unexplored rooms, the stairs. */
  private explore(): void {
    const sim = this.sim, h = sim.hero, f = sim.floor, room = sim.room;
    const inp = sim.input;
    // pickups in the room
    let tx = 0, tz = 0, found = false, best = 1e9;
    let id = -1;
    for (const p of sim.picks) {
      if (sim.roomAt(p.x, p.z) !== room || this.ignore.has(p.id)) continue;
      if (p.kind === 'heart' && h.hp >= h.maxHp) continue;
      const d = Math.hypot(p.x - h.x, p.z - h.z);
      if (d < best) { best = d; tx = p.x; tz = p.z; found = true; id = p.id; }
    }
    if (found && this.giveUp(id)) found = false;
    if (found) { this.doing = 'loot'; this.goTowards(tx, tz); return; }
    if (this.skill.greedy) {
      for (const p of f.pots) {
        if (p.broken || p.room !== room || this.ignore.has(p.id)) continue;
        const d = Math.hypot(p.x - h.x, p.z - h.z);
        if (d < best) { best = d; tx = p.x; tz = p.z; found = true; id = p.id; }
      }
      if (found && this.giveUp(id)) found = false;
      if (found) {
        this.doing = 'pot';
        if (best < 1.1) {
          const a = Math.atan2(tx - h.x, tz - h.z);
          inp.ax = Math.sin(a); inp.az = Math.cos(a); inp.aim = true;
          if (this.tapT <= 0 && h.atkCd <= 0) { this.potAttack = true; this.tapT = this.skill.tap; }
        } else this.goTowards(tx, tz);
        return;
      }
    }
    for (const c of f.chests) {
      if (c.opened || c.room !== room || this.ignore.has(c.id) || this.giveUp(c.id)) continue;
      this.doing = 'chest';
      this.goTowards(c.x, c.z);
      return;
    }
    const r = room >= 0 ? f.rooms[room] : null;
    if (r && r.type === 'shrine' && !r.used) { this.doing = 'shrine'; this.goTowards(r.cx, r.z0 + 4.4); return; }
    // where next: the vault with a key, an unexplored room, the stairs
    let goal = -1;
    if (h.keys > 0) {
      const d = f.doors.find((d) => d.keyLocked);
      if (d) { this.doing = 'vault'; this.goTowards(d.x, d.z); return; }
    }
    // keep going to the room chosen before (no dithering between two equally near rooms)
    const keep = this.goalRoom >= 0 ? f.rooms[this.goalRoom] : null;
    if (keep && !keep.visited && !(keep.type === 'vault' && f.doors[keep.doors[0]].keyLocked)) goal = keep.id;
    else if (this.skill.explore || !f.stairs.active) {
      let bd = 1e9;
      for (const o of f.rooms) {
        if (o.visited) continue;
        if (o.type === 'vault' && f.doors[o.doors[0]].keyLocked) continue;
        if ((o.type === 'exit' || o.type === 'boss') && f.rooms.some((x) => !x.visited && x !== o && !(x.type === 'vault' && f.doors[x.doors[0]].keyLocked))) continue;
        const d = Math.abs(o.cx - h.x) + Math.abs(o.cz - h.z);
        if (d < bd) { bd = d; goal = o.id; }
      }
    }
    this.goalRoom = goal;
    if (goal >= 0) { this.doing = 'explore'; this.goTowards(f.rooms[goal].cx, f.rooms[goal].cz); return; }
    if (f.stairs.active) { this.doing = 'stairs'; this.goTowards(f.stairs.x, f.stairs.z); return; }
    const exit = f.rooms[f.exit];
    this.doing = 'exit';
    this.goTowards(exit.cx, exit.cz);
  }

  /** True when the bot has chased this target too long (out of reach): it is skipped from now on. */
  private giveUp(id: number): boolean {
    const t = (this.chase.get(id) ?? 0) + 1 / 30;
    this.chase.set(id, t);
    if (t > 6) { this.ignore.add(id); return true; }
    return false;
  }

  /** Steers along a tile path (BFS over walkable tiles, spikes avoided when possible). */
  private goTowards(x: number, z: number): void {
    const sim = this.sim, h = sim.hero, f = sim.floor, inp = sim.input;
    const goal = Math.round(z) * f.gw + Math.round(x);
    const direct = Math.hypot(x - h.x, z - h.z);
    if (direct < 1.2) { inp.mx = (x - h.x) / (direct || 1); inp.mz = (z - h.z) / (direct || 1); return; }
    if (this.pathT <= 0 || goal !== this.pathGoal || !this.path.length) {
      this.path = this.bfs(Math.round(h.x), Math.round(h.z), Math.round(x), Math.round(z));
      this.pathGoal = goal;
      this.pathT = 0.3;
    }
    while (this.path.length > 1) {
      const t = this.path[0];
      const px = t % f.gw, pz = (t - px) / f.gw;
      if (Math.hypot(px - h.x, pz - h.z) < 0.35) this.path.shift(); else break;
    }
    const t = this.path[0];
    let gx = x, gz = z;
    if (t !== undefined) { gx = t % f.gw; gz = (t - gx) / f.gw; }
    const d = Math.hypot(gx - h.x, gz - h.z) || 1;
    inp.mx = (gx - h.x) / d; inp.mz = (gz - h.z) / d;
  }

  private bfs(sx: number, sz: number, gx: number, gz: number): number[] {
    const sim = this.sim, f = sim.floor;
    const spikes = new Set(f.spikes.map((s) => s.z * f.gw + s.x));
    const pots = new Set(f.pots.filter((p) => !p.broken).map((p) => Math.round(p.z) * f.gw + Math.round(p.x)));
    for (const c of f.chests) pots.add(Math.round(c.z) * f.gw + Math.round(c.x));
    const run = (avoid: boolean, solidItems = true): number[] | null => {
      const prev = new Int32Array(f.gw * f.gh).fill(-1);
      const start = sz * f.gw + sx, goal = gz * f.gw + gx;
      prev[start] = start;
      const q = [start];
      for (let i = 0; i < q.length; i++) {
        const c = q[i];
        if (c === goal) break;
        const cx = c % f.gw, cz = (c - cx) / f.gw;
        for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const nx = cx + dx, nz = cz + dz;
          if (nx < 0 || nz < 0 || nx >= f.gw || nz >= f.gh) continue;
          const ni = nz * f.gw + nx;
          if (prev[ni] >= 0) continue;
          const isGoal = ni === goal;
          if (!isGoal && sim.solid(nx, nz)) continue;
          if (!isGoal && f.tiles[ni] === T_STAIRS && !f.stairs.active) continue;
          if (!isGoal && f.tiles[ni] === T_STAIRS && this.doing !== 'stairs') continue;
          if (avoid && spikes.has(ni) && !isGoal) continue;
          if (solidItems && pots.has(ni) && !isGoal && ni !== start) continue;
          prev[ni] = c;
          q.push(ni);
        }
      }
      if (prev[goal] < 0) return null;
      const out: number[] = [];
      for (let c = goal; c !== start; c = prev[c]) out.unshift(c);
      return out;
    };
    return run(true) ?? run(false) ?? run(false, false) ?? [];
  }
}

/** Is (x, z) inside a telegraph (with a margin)? */
export function inTele(t: Tele, x: number, z: number, m: number): boolean {
  const dx = x - t.x, dz = z - t.z, d = Math.hypot(dx, dz);
  if (t.kind === 'circle') return d < t.r + m;
  if (t.kind === 'cone') return d < t.r + m && Math.abs(angDiff(Math.atan2(dx, dz), t.ang)) < 1.15;
  const along = dx * Math.sin(t.ang) + dz * Math.cos(t.ang);
  const perp = -dx * Math.cos(t.ang) + dz * Math.sin(t.ang);
  return along > -0.5 && along < t.len + m && Math.abs(perp) < t.r + m;
}

/** The quickest way out of a telegraph. */
function away(t: Tele, x: number, z: number): [number, number] {
  const dx = x - t.x, dz = z - t.z, d = Math.hypot(dx, dz) || 1;
  if (t.kind !== 'line') return [dx / d, dz / d];
  const perp = -dx * Math.cos(t.ang) + dz * Math.sin(t.ang);
  const s = perp >= 0 ? 1 : -1;
  return [-Math.cos(t.ang) * s, Math.sin(t.ang) * s];
}
