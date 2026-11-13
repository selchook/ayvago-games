// A stand-in for a person, for the headless balance runs: it reads the same AI decisions as the
// computer players but turns them into button presses (Input), so it plays through exactly the
// path a person's keys take (shots are held and released with the bot's own timing error).
import { aiIntent, type AiLevel } from './ai';
import { NO_INPUT, PEAK, type Game, type Input } from './sim';

export interface Skill {
  /** How the bot plays (the AI's decisions with these values). */
  play: AiLevel;
  /** Spread of its own shot releases (s). */
  sigma: number;
  /** Chance per second of a pointless press (button mashing). */
  mash: number;
  /** Chance the bot swaps to the defender nearest the ball when it loses the ball. */
  swap: number;
}

const base: AiLevel = { speed: 1, react: 0.22, sigma: 0.04, aim: 1, steal: 1, block: 1, gap: 1.2, pass: 0.6, drive: 0.65, three: 0.45, cross: 0.35, balance: 1 };

export const SKILL: Record<'good' | 'casual', Skill> = {
  good: { play: base, sigma: 0.05, mash: 0, swap: 0.9 },
  casual: { play: { ...base, react: 0.45, gap: 1.7, pass: 0.4, drive: 0.5, three: 0.55, cross: 0.15 }, sigma: 0.11, mash: 0.4, swap: 0.3 },
};

export class Bot {
  private holdUntil = -1;
  private holdFrom = 0;
  private lastOffence = -1;

  constructor(private g: Game, private team: 0 | 1, private skill: Skill, private rnd: () => number) {}

  input(dt: number): Input {
    const g = this.g;
    const inp: Input = { ...NO_INPUT };
    const id = g.ctrl[this.team];
    if (id < 0) return inp;
    const p = g.p[id];
    // a shot in progress: let go when the bot's own timing says so
    if (p.act === 'shot' && this.holdUntil > 0) {
      if (g.t >= this.holdUntil) { inp.shootUp = g.t - this.holdFrom; this.holdUntil = -1; }
      return inp;
    }
    if (g.offence !== this.lastOffence) {
      this.lastOffence = g.offence;
      if (g.offence === 1 - this.team && this.rnd() < this.skill.swap) inp.swap = true;
    }
    const it = aiIntent(g, p, this.skill.play, dt);
    inp.mx = it.mx; inp.mz = it.mz; inp.turbo = it.turbo;
    if (it.shoot) {
      inp.shootDown = true;
      const u = Math.max(1e-6, this.rnd()), v = this.rnd();
      const err = Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v) * this.skill.sigma;
      this.holdFrom = g.t;
      this.holdUntil = g.t + Math.max(0.1, PEAK + err);
    }
    if (it.pass > -2) { inp.pass = true; inp.passTo = it.pass; }
    if (it.cross || it.steal) inp.action = true;
    if (it.jump) inp.jump = true;
    if (this.skill.mash > 0 && this.rnd() < this.skill.mash * dt) inp.action = true;
    return inp;
  }
}
