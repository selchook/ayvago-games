// Star Squadron: an autopilot. It dodges by scoring a ring of candidate moves against where every
// bullet and ship will be a moment later, lines up under its target, collects pickups, fires the
// powers when things get hot and picks cards from a priority list. Two skills: a good pilot and a
// casual one (slower reactions, a shorter look ahead, random cards). It plays the menu backdrop,
// the store art and the headless balance run (balance.ts).
import { FIELD, playerHalfWidth } from './defs';
import { CARD, type CardId } from './cards';
import { type Sim, type Input, NO_INPUT, PLAYER_R } from './sim';

export interface Skill {
  /** Seconds between decisions. */
  think: number;
  /** How far ahead bullets are projected (s). */
  look: number;
  /** Candidate directions. */
  dirs: number;
  /** Extra safety margin around bullets. */
  margin: number;
  /** Random steering noise. */
  noise: number;
  /** Uses powers well (true) or late and at random. */
  powers: boolean;
  /** Picks cards by priority (true) or at random. */
  cards: boolean;
  /** Share of decisions made without looking at the bullets (a human glancing away). */
  lapse: number;
}

export const SKILL: Record<'good' | 'casual', Skill> = {
  good: { think: 1 / 15, look: 0.45, dirs: 12, margin: 0.1, noise: 0.1, powers: true, cards: true, lapse: 0.06 },
  casual: { think: 0.28, look: 0.25, dirs: 8, margin: 0, noise: 0.5, powers: false, cards: false, lapse: 0.4 },
};

/** Card priorities of the good pilot (higher first); synergies always first. */
const PRIORITY: Partial<Record<CardId, number>> = {
  stormMissiles: 100, laserFan: 100, sniperDrones: 100, trickShot: 95, siphon: 90,
  spread: 60, drone: 58, homing: 56, rapidFire: 52, heavyRounds: 50, pierce: 48, chain: 45, crit: 44,
  shieldGen: 42, nanoRepair: 40, phoenix: 40, ricochet: 38, plating: 36, overload: 34, reflex: 30,
  megaBomb: 28, capacitors: 26, thrusters: 20, magnet: 16, bounty: 12, repair: 10,
};

export class Bot {
  private t = 0;
  private dir = { x: 0, z: 0 };
  private hold = 0;

  constructor(private sim: Sim, readonly skill: Skill, private rnd: () => number = Math.random) {}

  /** The card the bot takes from the offer. */
  choose(offer: CardId[]): CardId {
    if (!offer.length) return 'repair';
    if (!this.skill.cards) return offer[Math.floor(this.rnd() * offer.length)];
    const p = this.sim.player;
    const score = (id: CardId) => {
      let s = PRIORITY[id] ?? 20;
      if (id === 'repair') s = p.hull < p.maxHull * 0.5 ? 90 : 5;
      if (id === 'plating' && p.hull < p.maxHull * 0.5) s += 30;
      if (CARD[id].rarity === 'epic') s += 4;
      return s;
    };
    return [...offer].sort((a, b) => score(b) - score(a))[0];
  }

  /** The input for this frame. */
  input(dt: number): Input {
    const sim = this.sim, p = sim.player, sk = this.skill;
    if (!p.alive || sim.phase === 'draft') return NO_INPUT;
    this.t -= dt;
    let bomb = false, shield = false, overdrive = false;
    if (this.t <= 0) {
      this.t = sk.think;
      this.decide();
      const danger = this.danger(p.x, p.z, 0.45);
      const near = sim.ebullets.filter((b) => (b.x - p.x) ** 2 + (b.z - p.z) ** 2 < 2.2 * 2.2).length;
      const fight = sim.phase === 'boss' || sim.enemies.length >= 4;
      if (sk.powers) {
        if (danger > 2.5 && near >= 4) { if (sim.canUse('shield')) shield = true; else if (sim.canUse('bomb')) bomb = true; }
        if (near >= 9 && sim.canUse('bomb')) bomb = true;
        if (p.hull < p.maxHull * 0.35 && near >= 3 && sim.canUse('bomb')) bomb = true;
        if (fight && sim.canUse('overdrive')) overdrive = true;
      } else if (this.rnd() < 0.04) {
        // a casual pilot remembers the buttons now and then
        if (near >= 6 && sim.canUse('bomb')) bomb = true;
        else if (danger > 4 && sim.canUse('shield')) shield = true;
        else if (fight && sim.canUse('overdrive')) overdrive = true;
      }
    }
    return { mx: this.dir.x, mz: this.dir.z, tx: null, tz: null, bomb, shield, overdrive };
  }

  /** Picks the best of a ring of moves (and staying put). */
  private decide(): void {
    const sim = this.sim, p = sim.player, sk = this.skill;
    const sp = sim.stats.speed;
    const want = this.goal();
    if (this.rnd() < sk.lapse) {
      // not looking: straight for the goal
      const dx = want.x - p.x, dz = want.z - p.z, l = Math.hypot(dx, dz);
      this.dir = l > 0.3 ? { x: dx / l, z: dz / l } : { x: 0, z: 0 };
      return;
    }
    let best = { x: 0, z: 0 }, bestS = Infinity;
    for (let i = -1; i < sk.dirs; i++) {
      const dx = i < 0 ? 0 : Math.cos((i / sk.dirs) * Math.PI * 2);
      const dz = i < 0 ? 0 : Math.sin((i / sk.dirs) * Math.PI * 2);
      let s = 0;
      for (const h of [0.15, 0.3, sk.look]) {
        let x = p.x + dx * sp * h, z = p.z + dz * sp * h;
        z = Math.max(FIELD.pTop, Math.min(FIELD.pBottom, z));
        const hw = playerHalfWidth(z);
        x = Math.max(-hw, Math.min(hw, x));
        s += this.danger(x, z, h) * (h < 0.2 ? 2.2 : 1);
        if (h === sk.look) s += 0.06 * ((x - want.x) ** 2 + 0.6 * (z - want.z) ** 2);
      }
      if (i >= 0 && this.dir.x * dx + this.dir.z * dz > 0.7) s -= 0.05; // keep a heading
      if (s < bestS) { bestS = s; best = { x: dx, z: dz }; }
    }
    if (sk.noise > 0 && this.rnd() < sk.noise * 0.3) {
      const a = this.rnd() * Math.PI * 2;
      best = { x: Math.cos(a), z: Math.sin(a) };
      this.hold = sk.think * 2;
    }
    if (this.hold > 0) { this.hold -= sk.think; return; }
    this.dir = best;
  }

  /** Where the pilot would like to be: under its target, near the home row, over pickups. */
  private goal(): { x: number; z: number } {
    const sim = this.sim, p = sim.player;
    let x = 0, z = FIELD.home;
    const b = sim.boss;
    if (b && !b.dead) {
      const pt = b.parts.find((q) => q.alive);
      x = pt ? pt.x : b.x;
    } else {
      let best = Infinity;
      for (const e of sim.enemies) {
        if (e.dead || e.z < FIELD.top + 3 || e.z > p.z - 1) continue;
        const d = Math.abs(e.x - p.x) + e.hp / 60;
        if (d < best) { best = d; x = e.x; }
      }
    }
    // a pickup close by is worth a detour
    for (const k of sim.pickups) {
      if (k.kind === 'credit') continue;
      if (Math.abs(k.x - p.x) < 3 && k.z > p.z - 4) { x = k.x; z = Math.max(z, k.z); break; }
    }
    return { x, z };
  }

  /** How dangerous a spot is `h` seconds from now. */
  private danger(x: number, z: number, h: number): number {
    const sim = this.sim, m = this.skill.margin;
    let d = 0;
    for (const b of sim.ebullets) {
      const bx = b.x + b.vx * h, bz = b.z + b.vz * h;
      const rr = PLAYER_R + b.r + m;
      const q = (bx - x) ** 2 + (bz - z) ** 2;
      if (q < rr * rr) d += 10;
      else if (q < (rr + 0.7) ** 2) d += 1.2 / (1 + q);
    }
    for (const e of sim.enemies) {
      if (e.dead) continue;
      let ex = e.x, ez = e.z;
      if (e.beh === 'kamikaze' && e.state >= 1) {
        ex += e.vx * h; ez += e.vz * h;
        if (e.state === 1) { ex = e.x + (sim.player.x - e.x) * 0.5; ez = e.z + (sim.player.z - e.z) * 0.5; }
      } else if (e.beh === 'drift' || e.beh === 'dive') { ez += (e.vz || e.speed) * h; ex += e.vx * h; }
      const rr = e.r + 0.7 + m;
      const q = (ex - x) ** 2 + (ez - z) ** 2;
      if (q < rr * rr) d += 8;
    }
    const b = sim.boss;
    if (b && !b.dead) {
      const q = (b.x - x) ** 2 + (b.z - z) ** 2;
      if (q < (b.r + 1.6) ** 2) d += 8;
    }
    // walls are uncomfortable
    if (Math.abs(x) > playerHalfWidth(z) - 0.2) d += 0.6;
    return d;
  }
}
