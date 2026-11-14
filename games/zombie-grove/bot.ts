// Zombie Grove: an autopilot. It kites: every think step it scores a ring of directions by where
// the zombies, the goo and the bosses' charges and slams will be a moment later, keeps out of the
// trees and away from the arena's edge, drifts towards gems when it is safe and away from the
// thick of the crowd. It takes every card offer at once from a priority list. Two skills: a good
// survivor and a casual one (slower reactions, a shorter look ahead, lapses, random cards). It
// plays the menu backdrop, the store art and the headless balance run (balance.ts).
import { EVOLVES_WITH, PLAY_EDGE, isBoss, type WeaponId, type PassiveId } from './defs';
import type { Card } from './cards';
import { type Sim, type Input, NO_INPUT } from './sim';

export interface Skill {
  /** Seconds between decisions. */
  think: number;
  /** How far ahead the bot looks (s). */
  look: number;
  /** Candidate directions. */
  dirs: number;
  /** Random steering noise. */
  noise: number;
  /** Share of decisions made without looking (a glance away). */
  lapse: number;
  /** How keen it is on gems. */
  greed: number;
  /** Picks cards by priority (true) or at random. */
  cards: boolean;
}

export const SKILL: Record<'good' | 'casual', Skill> = {
  good: { think: 1 / 12, look: 0.55, dirs: 16, noise: 0.05, lapse: 0.03, greed: 1, cards: true },
  casual: { think: 0.3, look: 0.3, dirs: 8, noise: 0.4, lapse: 0.3, greed: 0.8, cards: false },
};

const WEAPON_PRI: Record<WeaponId, number> = { wards: 9, torch: 8, bow: 7, blade: 7, spear: 6, robot: 6, shield: 6, blaster: 5 };
const PASSIVE_PRI: Record<PassiveId, number> = { vigor: 7, armor: 7, haste: 6, reach: 5, regen: 5, swift: 5, magnet: 4, luck: 3 };

/** How much the bot wants each pickup (gems by value, the stew by health). */
const PICKUP_WANT: Partial<Record<string, number>> = { chest: 14, nuke: 10, freeze: 9, vacuum: 8, rage: 8, boots: 7 };

export class Bot {
  private t = 0;
  private dir = { x: 0, z: 0 };

  constructor(private sim: Sim, readonly skill: Skill, private rnd: () => number = Math.random) {}

  /** The card the bot takes from an offer (its index). */
  choose(cards: Card[]): number {
    if (!cards.length) return 0;
    if (!this.skill.cards) return Math.floor(this.rnd() * cards.length);
    const sim = this.sim, p = sim.player;
    const score = (c: Card) => {
      switch (c.kind) {
        case 'evo': return 100;
        case 'heal': return p.hp < p.maxHp * 0.45 ? 90 : 2;
        case 'gold': return 1;
        case 'weapon': {
          const own = sim.weapon(c.id as WeaponId);
          const pri = WEAPON_PRI[c.id as WeaponId];
          if (!own) return sim.weapons.length < 4 ? 70 + pri : 30 + pri;
          return 50 + pri + c.add * 4 + (own.lv + c.add >= 5 ? 8 : 0);
        }
        case 'passive': {
          const pairs = sim.weapons.some((w) => EVOLVES_WITH[w.id] === c.id);
          return 35 + PASSIVE_PRI[c.id as PassiveId] + (pairs ? 14 : 0) + c.add * 3 + (c.id === 'vigor' && p.hp < p.maxHp * 0.5 ? 20 : 0);
        }
      }
      return 0;
    };
    let best = 0;
    cards.forEach((c, i) => { if (score(c) > score(cards[best])) best = i; });
    return best;
  }

  /** The input for this frame. */
  input(dt: number): Input {
    const sim = this.sim, p = sim.player, sk = this.skill;
    if (!p.alive) return NO_INPUT;
    this.t -= dt;
    if (this.t <= 0) {
      this.t = sk.think * (0.8 + this.rnd() * 0.4);
      if (this.rnd() >= sk.lapse) this.decide();
    }
    return { mx: this.dir.x, mz: this.dir.z };
  }

  private decide(): void {
    const sim = this.sim, p = sim.player, sk = this.skill;
    const sp = sim.speedNow;
    const T = sk.look;
    // what is near
    const near: { x: number; z: number; r: number; sp: number; boss: boolean }[] = [];
    let cx = 0, cz = 0;
    for (const zb of sim.zombies) {
      const dx = zb.x - p.x, dz = zb.z - p.z, d2 = dx * dx + dz * dz;
      if (d2 > 15 * 15) continue;
      const d = Math.sqrt(d2) || 1;
      // the crowd's weight: where most of them are
      cx += dx / (d * d); cz += dz / (d * d);
      if (d < 9) near.push({ x: zb.x, z: zb.z, r: zb.r, sp: zb.act === 'charge' ? 10.5 : zb.speed, boss: isBoss(zb.kind) });
    }
    const n = sk.dirs;
    let best = -Infinity, bx = 0, bz = 0;
    for (let k = 0; k <= n; k++) {
      const still = k === n;
      const a = (k / n) * Math.PI * 2;
      const ux = still ? 0 : Math.sin(a), uz = still ? 0 : Math.cos(a);
      let s = 0;
      for (const t of [T * 0.4, T]) {
        const px = p.x + ux * sp * t, pz = p.z + uz * sp * t;
        if (!sim.isFree(px, pz, 0.35)) { s -= t === T ? 40 : 80; continue; }
        for (const zb of near) {
          // the zombie walks towards where the survivor is now
          const dx = p.x - zb.x, dz = p.z - zb.z, dl = Math.hypot(dx, dz) || 1;
          const zx = zb.x + (dx / dl) * zb.sp * t, zz = zb.z + (dz / dl) * zb.sp * t;
          const d = Math.hypot(px - zx, pz - zz) - zb.r;
          const safe = zb.boss ? 2.6 : 1.25;
          if (d < safe) s -= (safe - d) * (safe - d) * (zb.boss ? 30 : 16);
        }
        for (const g of sim.goo) {
          const gx = g.x + g.vx * t, gz = g.z + g.vz * t;
          const d = Math.hypot(px - gx, pz - gz);
          if (d < 1.1) s -= (1.1 - d) * 50;
        }
        // lit exploders
        for (const zb of sim.zombies) {
          if (zb.fuse < 0) continue;
          const d = Math.hypot(px - zb.x, pz - zb.z);
          if (d < 2.9) s -= (2.9 - d) * 30;
        }
        // bosses about to slam or charge
        const b = sim.boss;
        if (b && !b.dead) {
          const d = Math.hypot(px - b.x, pz - b.z);
          if (b.act === 'slam' && d < (b.kind === 'king' ? 5.2 : 4.4)) s -= 60;
          if (b.act === 'windup' || b.act === 'charge') {
            const along = (px - b.x) * b.ax + (pz - b.z) * b.az, side = Math.abs((px - b.x) * b.az - (pz - b.z) * b.ax);
            if (along > -1 && along < 10 && side < 1.8) s -= 45 * (1.8 - side);
          }
        }
      }
      // room ahead: fewer zombies round where it will be in a second; keep moving; stay off the
      // edges and drift back towards the open middle when far out
      const fx = p.x + ux * sp, fz = p.z + uz * sp;
      // a fight at arm's length: zombies a few steps away are where the weapons hit
      let crowd = 0, inReach = 0;
      for (const zb of near) {
        const d2 = (zb.x - fx) ** 2 + (zb.z - fz) ** 2;
        if (d2 < 16) crowd++;
        const d = Math.hypot(zb.x - p.x - ux * sp * 0.4, zb.z - p.z - uz * sp * 0.4);
        if (d > 1.7 && d < 4.6) inReach++;
      }
      s -= crowd * 1.4;
      s += Math.min(8, inReach) * 0.55;
      s -= (ux * cx + uz * cz) * 2.5;
      s += (ux * this.dir.x + uz * this.dir.z) * 0.8;
      s -= still ? 0.6 : 0;
      const far = Math.hypot(fx, fz);
      if (far > 14) s -= (far - 14) * 0.35;
      const edge1 = PLAY_EDGE - Math.max(Math.abs(fx), Math.abs(fz));
      if (edge1 < 9) s -= (9 - edge1) * (9 - edge1) * 0.5;
      // gems, when it is calm enough
      let gem = 0;
      for (const q of sim.pickups) {
        if (q.fly) continue;
        const d = Math.hypot(q.x - p.x, q.z - p.z);
        if (d > 18) continue;
        const toward = ((q.x - p.x) * ux + (q.z - p.z) * uz) / (d || 1);
        const v = PICKUP_WANT[q.kind] ?? (q.kind === 'gem' ? Math.min(6, q.value) : q.kind === 'heal' ? (p.hp < p.maxHp * 0.6 ? 12 : 1) : 2);
        gem += toward * v / (1 + d * 0.35);
      }
      s += Math.min(6, gem * sk.greed * 0.6);
      s += (this.rnd() - 0.5) * sk.noise * 6;
      if (s > best) { best = s; bx = ux; bz = uz; }
    }
    this.dir.x = bx; this.dir.z = bz;
  }
}
