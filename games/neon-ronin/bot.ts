// Neon Ronin: the autopilot. It plays a level the way a player does, one input frame at a time:
// runs for the exit, jumps walls and pits (double jump when the landing is not there), waits out
// live cables, steam and lasers, rolls through bolts and charges, jumps shockwaves and low beams,
// rolls under high ones, hits levers, opens lootboxes, picks up chips near its path, and fights
// with the blade moves: taps the quick chain, holds ATTACK for the cleave against armour and the
// boss, rolls in for the lunge (and holds on into the iaido where the roof runs on), sprints in
// with the cyclone, launches light foes and juggles them with the air string, ends a chain with
// blade & bolt, slashes bolts back (Mirror Cut) instead of rolling now and then, and shoots from
// range while the blaster is cool. Between levels it buys cyberware and takes its banked implant
// picks. Used by the menu's live backdrop, the store-art stage and the headless balance check
// (balance.ts).
import { FOE, MOVE, HAZARD, DT as DT_BOT } from './defs';
import { NO_INPUT, hazardBox, type Input, type Sim, type Foe } from './sim';
import { CARD, UPGRADE_IDS, MAX_RANK, UPGRADE, RARITIES, type CardId, type Ranks } from './powers';

export interface Skill {
  /** Seconds before it reacts to a threat. */
  react: number;
  /** Chance per threat of not reacting at all. */
  miss: number;
  /** Uses the cleave and the lunge. */
  combos: boolean;
  /** Share of chances it takes for the flashier moves (cyclone, launcher juggles, blade & bolt, mirror, iaido). */
  flair: number;
  /** Fires the blaster. */
  gun: boolean;
  /** Chance that a jump is mistimed (held too long or too short, like a hurried thumb). */
  slip: number;
}
export const SKILL: Record<'casual' | 'decent' | 'good', Skill> = {
  casual: { react: 0.34, miss: 0.4, combos: false, gun: true, slip: 0.1, flair: 0 },
  decent: { react: 0.22, miss: 0.22, combos: true, gun: true, slip: 0.05, flair: 0.35 },
  good: { react: 0.12, miss: 0.08, combos: true, gun: true, slip: 0.015, flair: 0.7 },
};

export class Bot {
  private jumpHeld = 0;
  private attackHeld = 0;
  private holdFor = 0;
  private tapCd = 0;
  private wait = 0;
  private seen = new Map<number, number>();
  private ignored = new Set<number>();
  private stuck = 0;
  private lastX = 0;
  private dir: 1 | -1 = 1;
  private backDir: 1 | -1 = 1;
  private backT = 0;
  private lungeT = 0;
  private juggleT = 0;
  private iaido = false;
  private mirror = new Map<number, boolean>();
  private flairCd = 0;

  constructor(private sim: Sim, private skill: Skill, private rnd: () => number) {}

  setSim(s: Sim): void { this.sim = s; this.seen.clear(); this.ignored.clear(); this.mirror.clear(); this.stuck = 0; }

  input(dt: number): Input {
    const s = this.sim, p = s.p;
    if (p.state === 'dead' || p.state === 'win' || s.over) return NO_INPUT;
    const inp: Input = { ...NO_INPUT };
    this.tapCd -= dt;
    this.wait -= dt;
    this.backT -= dt;
    this.lungeT -= dt;
    this.juggleT -= dt;
    this.flairCd -= dt;
    this.sloppy -= dt;
    // ---- where to go: the exit; in a boss fight, a good distance from the boss
    let goal = s.W - 4;
    const boss = s.boss && s.boss.state !== 'dead' && s.bossOn ? s.boss : null;
    if (boss) {
      const side = p.x < boss.x ? -1 : 1;
      goal = boss.x + side * (boss.state === 'vent' || boss.state === 'patrol' ? 2.6 : 6.5);
      if (goal < 2 || goal > s.W - 2) goal = boss.x - side * 6.5;
    } else if (s.boss && s.boss.state !== 'dead' && !s.bossOn) goal = 12;
    // a chip near the path (given up after a few seconds)
    let chip = false;
    for (const k of s.picks) {
      if (k.kind !== 'chip' || k.taken || this.ignored.has(k.id)) continue;
      if (k.x > p.x - 3 && k.x < p.x + 8 && k.y - p.y < 5.5 && k.y > p.y - 1) {
        goal = k.x;
        chip = true;
        const t0 = this.chase.get(k.id) ?? s.time;
        this.chase.set(k.id, t0);
        if (s.time - t0 > 5) this.ignored.add(k.id);
        // right under it: jump (and jump again at the top)
        if (Math.abs(k.x - p.x) < 1.2 && k.y > p.y + 1.6) {
          if (p.ground) { this.jumpNow = true; this.jumpHeld = 0.5; } else if (p.vy < 1 && p.airJumps > 0 && k.y > p.y + 1.2) { this.jumpNow = true; this.jumpHeld = 0.4; }
        }
        break;
      }
    }
    void chip;
    if (this.anchor !== null) goal = this.anchor;
    let mx = Math.abs(goal - p.x) < 0.4 ? 0 : Math.sign(goal - p.x);
    if (this.backT > 0) mx = -this.backDir;
    // ---- threats
    const danger = this.threat();
    if (danger === 'slash') inp.attack = true;
    else if (danger === 'roll') inp.roll = true;
    else if (danger === 'jump') this.jumpHeld = 0.3;
    else if (danger === 'back') mx = p.x < (boss?.x ?? p.x + 1) ? -1 : 1;
    // ---- hazards ahead: wait for them to switch off
    if (mx !== 0 && this.hazardAhead(mx)) mx = 0;
    // ---- fights
    const target = this.nearestFoe();
    const flair = (): boolean => this.flairCd <= 0 && this.rnd() < this.skill.flair && ((this.flairCd = 0.8), true);
    const light = (f: Foe): boolean => f.kind === 'walker' || f.kind === 'gunner' || f.kind === 'drone' || f.kind === 'gdrone';
    if (target && this.juggleT > 0 && target.juggle > 0) {
      // a launched foe: jump after it and cut it in the air
      const dx = target.x - p.x, dy = target.y - p.y;
      mx = Math.abs(dx) > 1.1 ? Math.sign(dx) : 0;
      if (!p.ground && dy > 0.6 && p.airJumps > 0 && p.vy < 3 && this.tapCd <= 0) { this.jumpNow = true; this.jumpHeld = 0.3; this.tapCd = 0.15; }
      else if (!p.ground && Math.abs(dx) < 2.2 && dy > -1.8 && dy < 2.4 && this.tapCd <= 0) { inp.attack = true; this.tapCd = 0.2; }
    } else if (target) {
      const dx = target.x - p.x, adx = Math.abs(dx), dy = target.y - p.y;
      const reach = adx < 1.5 + target.w / 2 && dy > -1.5 && dy < 1.6;
      const armoured = target.maxArmour > 0 && target.armour > 0;
      const open = (id: 'rise' | 'iaido'): boolean => s.hasAbility(id);
      if (this.skill.combos && p.state === 'run' && p.runT >= 0.32 && adx < 2.9 && adx > 1.2 && Math.abs(dy) < 1 && Math.sign(dx) === p.face && this.tapCd <= 0 && !armoured && target.kind !== 'boss' && flair()) {
        // sprinting in: the cyclone
        inp.attack = true; this.tapCd = 0.3;
      } else if (reach && this.skill.combos && p.ground && open('rise') && light(target) && !FOE[target.kind].flies && target.juggle <= 0 && Math.abs(dy) < 0.8 && this.tapCd <= 0 && flair()) {
        // the launcher, then the juggle
        if (Math.sign(dx) !== p.face) mx = Math.sign(dx);
        else { inp.up = true; inp.attack = true; this.tapCd = 0.25; this.juggleT = 1.4; mx = 0; }
      } else if (reach) {
        if (!boss || adx < 3) mx = 0;
        if (Math.sign(dx) !== p.face) mx = Math.sign(dx);
        // the heavy chain against armour and the boss: hold
        if (this.skill.combos && (armoured || target.kind === 'boss') && s.hasAbility('cleave')) { this.attackHeld = Math.max(this.attackHeld, 0.9); if (this.tapCd <= 0) { inp.attack = true; this.tapCd = 0.3; } }
        else if (this.tapCd <= 0) { inp.attack = true; this.tapCd = 0.14; }
        // blade & bolt ends the chain on a light foe
        if (this.skill.combos && s.run.ranks.gun >= 1 && p.state === 'attack' && p.atk?.kind === 'kick' && !armoured && target.kind !== 'boss' && this.rnd() < this.skill.flair * 0.12) inp.shoot = true;
      } else if (this.skill.combos && adx < 4.5 && adx > 2.4 && Math.abs(dy) < 1 && p.ground && p.rollCd <= 0 && this.lungeT <= 0 && target.state !== 'tell' && !FOE[target.kind].fixed && Math.sign(dx) === p.face) {
        // roll in for the lunge
        inp.roll = true;
        this.lungeT = 1.5;
      } else if (this.skill.gun && !p.hot && p.heat < 78 && adx < 12 && (Math.abs(dy) < 2.2 || (FOE[target.kind].flies && Math.abs(dy) < adx * 0.7 + 0.5))) {
        if (Math.sign(dx) !== p.face && p.ground) mx = Math.sign(dx);
        else inp.shootHeld = true;
        if (target.kind !== 'boss' && adx < 7 && FOE[target.kind].fixed) mx = 0;
      }
      // keep pushing in on turrets and the teleporter
      if (FOE[target.kind].fixed && adx > 1.3 && !p.hot && p.heat > 70) mx = Math.sign(dx);
    }
    // the lunge: attack as the roll ends (and hold on into the iaido where the roof runs on)
    if (p.state === 'roll' && this.lungeT > 0 && p.t > MOVE.roll * 0.5) {
      inp.attack = true;
      this.iaido = s.hasAbility('iaido') && !boss && this.roofAhead(8) && this.rnd() < this.skill.flair;
      if (this.iaido) this.attackHeld = Math.max(this.attackHeld, 0.75);
    }
    // a hold meant for the cleave must not draw the iaido out of a lunge
    if (p.state === 'attack' && p.atk?.kind === 'lunge' && !this.iaido) this.attackHeld = 0;
    // ---- levers and lootboxes
    for (const pr of s.props) {
      if ((pr.kind === 'lever' || pr.kind === 'lootbox') && !pr.on && Math.abs(pr.x - p.x) < 1.6 && Math.abs(pr.y - p.y) < 1 && this.tapCd <= 0) {
        if (Math.sign(pr.x - p.x) !== p.face) mx = Math.sign(pr.x - p.x);
        else { inp.attack = true; this.tapCd = 0.3; mx = 0; }
      }
    }
    // ---- moving: walls, pits and ledges
    if (mx !== 0 && p.state !== 'roll') mx = this.navigate(mx);
    else if (!p.ground && this.aimAt && p.state !== 'roll') mx = this.navigate(this.dir);
    if (mx !== 0) this.dir = mx > 0 ? 1 : -1;
    inp.mx = mx;
    if (this.jumpHeld > 0) { inp.jumpHeld = true; this.jumpHeld -= dt; }
    if (this.jumpNow) { inp.jump = true; inp.jumpHeld = true; this.jumpNow = false; }
    if (this.attackHeld > 0) { inp.attackHeld = true; this.attackHeld -= dt; }
    if (danger === 'jump' && p.ground) { inp.jump = true; inp.jumpHeld = true; }
    // ---- stuck: try the other way for a moment, then jump
    if (Math.abs(p.x - this.lastX) < 0.01 && mx !== 0) this.stuck += dt; else this.stuck = Math.max(0, this.stuck - dt);
    this.lastX = p.x;
    if (this.stuck > 1.2) {
      this.stuck = 0;
      if (p.ground) { inp.jump = true; inp.jumpHeld = true; this.jumpHeld = 0.4; }
      for (const k of s.picks) if (k.kind === 'chip' && Math.abs(k.x - p.x) < 6) this.ignored.add(k.id);
    }
    return inp;
  }

  /** Solid ground for `n` metres ahead (the iaido's dash will not end over a pit). */
  private roofAhead(n: number): boolean {
    const s = this.sim, p = s.p;
    const y = Math.floor(p.y - 0.05);
    for (let i = 1; i <= n; i++) {
      const x = Math.floor(p.x + p.face * i);
      if (!s.standable(x, y) || s.solid(x, y + 1)) return false;
    }
    return true;
  }

  private jumpNow = false;
  /** Hold this spot (the store-art stage keeps the fight in frame). */
  anchor: number | null = null;
  private chase = new Map<number, number>();

  /** The next platform ahead to land on: its columns and top. */
  private landing(mx: number): { x0: number; x1: number; top: number } | null {
    const s = this.sim, p = s.p;
    for (let i = 1; i <= 11; i++) {
      const cx = Math.floor(p.x) + mx * i;
      let top = -1;
      for (let y = Math.min(s.H - 1, Math.floor(p.y + 5)); y >= Math.max(0, Math.floor(p.y) - 4); y--) {
        if (s.standable(cx, y) && !s.solid(cx, y + 1) && !s.solid(cx, y + 2)) { top = y + 1; break; }
      }
      if (top < 0) continue;
      // reachable at all? (a double jump climbs about 5)
      if (top - p.y > 5) continue;
      let a = cx, b = cx;
      while (b - a < 12 && s.standable(b + mx, top - 1) && !s.solid(b + mx, top)) b += mx;
      return { x0: Math.min(a, b), x1: Math.max(a, b) + 1, top };
    }
    return null;
  }

  /** Jumps walls and pits on the way; steers in the air onto the platform it aims for. */
  private navigate(mx: number): number {
    const s = this.sim, p = s.p;
    const front = p.x + mx * (p.w / 2 + 0.25);
    const fy = Math.floor(p.y + 0.3);
    const wall = s.solid(Math.floor(front + mx * 0.3), fy) || s.solid(Math.floor(front + mx * 0.3), fy + 1);
    const ahead = (d: number): boolean => {
      const x = Math.floor(p.x + mx * d);
      for (let y = Math.floor(p.y - 0.05); y >= Math.floor(p.y) - 2; y--) if (s.standable(x, y)) return true;
      return false;
    };
    if (p.ground) {
      this.aimAt = null;
      if (wall) { this.jumpNow = true; this.jumpHeld = 0.45; return mx; }
      if (!ahead(0.75)) {
        const t = this.landing(mx);
        // nothing to land on in reach (a falling ledge not back yet): wait at the edge
        if ((!t || (mx > 0 ? t.x0 - p.x : p.x - t.x1) > 8.5 + (t.top < p.y ? 1.5 : 0)) && this.edgeWait < 2.5) { this.edgeWait += DT_BOT; return 0; }
        this.edgeWait = 0;
        this.aimAt = t;
        let hold = 0.5;
        if (t) {
          const near = (mx > 0 ? t.x0 - p.x : p.x - t.x1) * MOVE.run / s.runSpeed();
          const up = t.top - p.y;
          if (up <= 0.5) hold = near < 2.2 ? 0.08 : near < 3.4 ? 0.16 : near < 4.6 ? 0.26 : 0.5;
          else if (up <= 1.5) hold = near < 2.5 ? 0.2 : 0.5;
        }
        this.jumpNow = true;
        this.jumpHeld = this.rnd() < this.skill.slip ? hold * (this.rnd() < 0.5 ? 0.45 : 1.8) : hold;
        if (this.jumpHeld !== hold) this.sloppy = 0.5;
      }
      return mx;
    }
    // in the air: steer onto the target (an analogue stick: the speed that lands on its near
    // end), double jump when it is out of reach
    const t = this.aimAt;
    if (t && this.sloppy <= 0) {
      const lo = t.x0 + 0.4, hi = t.x1 - 0.4;
      const want = mx > 0 ? Math.min(hi, lo + 0.7) : Math.max(lo, hi - 0.7);
      const g = MOVE.gravity, disc = p.vy * p.vy + 2 * g * (p.y - t.top);
      const speed = s.runSpeed();
      if (disc >= 0) {
        const tf = (p.vy + Math.sqrt(disc)) / g;
        const need = (want - p.x) / Math.max(0.05, tf);
        mx = Math.max(-1, Math.min(1, need / speed));
        if (Math.abs(need) > speed * 1.05 && p.airJumps > 0 && p.vy < 1) { this.jumpNow = true; this.jumpHeld = 0.4; mx = Math.sign(need); }
      } else if (p.airJumps > 0 && p.vy < 1.5) { this.jumpNow = true; this.jumpHeld = 0.4; mx = Math.sign(want - p.x); }
      else mx = Math.sign(want - p.x);
      return mx;
    }
    if (p.airJumps > 0 && p.vy < 1.5) {
      let land = false;
      const x = Math.floor(p.x + mx * 1.2);
      for (let y = Math.floor(p.y - 0.05); y >= Math.max(0, Math.floor(p.y) - 6); y--) if (s.standable(x, y) || s.standable(Math.floor(p.x), y)) { land = true; break; }
      if (!land || (wall && p.vy < 0.5)) { this.jumpNow = true; this.jumpHeld = 0.4; }
    }
    return mx;
  }

  private aimAt: { x0: number; x1: number; top: number } | null = null;
  private edgeWait = 0;
  /** After a slipped jump the air steering lapses for a moment. */
  private sloppy = 0;

  /** A hazard just ahead that is on or about to be. */
  private hazardAhead(mx: number): boolean {
    const s = this.sim, p = s.p;
    for (const h of s.hazards) {
      const [x0, y0, x1, y1] = hazardBox(h);
      const d = mx > 0 ? x0 - (p.x + p.w / 2) : (p.x - p.w / 2) - x1;
      if (d < -0.2 || d > 2.6) continue;
      if (y1 < p.y + 0.1 || y0 > p.y + p.h + 1.2) continue;
      const [off, warn, on] = HAZARD[h.kind];
      const c = (s.time + h.off) % (off + warn + on);
      // time left while it is off
      const free = c < off ? off - c : 0;
      const need = (d + 1.6) / MOVE.run + 0.15;
      if (h.phase !== 'off' || free < need) return d > 0.15;
    }
    return false;
  }

  private nearestFoe(): Foe | null {
    const s = this.sim, p = s.p;
    let best: Foe | null = null, bd = 14;
    for (const f of s.foes) {
      if (f.state === 'dead' || f.state === 'spawn') continue;
      const d = Math.abs(f.x - p.x) + Math.max(0, Math.abs(f.y - p.y) - 1) * 1.5;
      if (d < bd && Math.abs(f.y - p.y) < 6) { bd = d; best = f; }
    }
    return best;
  }

  /** What to do about the closest danger, after a reaction delay. */
  private threat(): 'roll' | 'jump' | 'back' | 'slash' | null {
    const s = this.sim, p = s.p;
    const react = (id: number): boolean => {
      const first = this.seen.get(id);
      if (first === undefined) { this.seen.set(id, s.time + (this.rnd() < this.skill.miss ? 99 : this.skill.react)); return false; }
      return s.time >= first;
    };
    // foe bolts flying at the hero
    for (const sh of s.shots) {
      if (sh.hero || sh.kind === 'shell') continue;
      const dx = p.x - sh.x;
      if (Math.sign(dx) !== Math.sign(sh.vx) && Math.abs(sh.vx) > 0.5) continue;
      const tt = Math.abs(dx) / Math.max(1, Math.abs(sh.vx));
      const yAt = sh.y + sh.vy * tt;
      if (tt < 0.32 && yAt > p.y - 0.2 && yAt < p.y + p.h + 0.2 && react(sh.id)) {
        // Mirror Cut: a slash met head on sends it back (a well-timed one, now and then)
        const can = s.run.ranks.sword >= 1 && Math.sign(sh.x - p.x) === p.face && (p.state === 'idle' || p.state === 'run') && p.ground;
        let plan = this.mirror.get(sh.id);
        if (plan === undefined) { plan = can && this.rnd() < this.skill.flair * 0.5; this.mirror.set(sh.id, plan); }
        if (plan && can) return tt < 0.1 ? 'slash' : null;
        return p.ground && p.rollCd <= 0 ? 'roll' : 'jump';
      }
    }
    // shockwaves along the ground
    for (const w of s.waves) {
      if (w.hero) continue;
      const dx = p.x - w.x;
      if (Math.sign(dx) === w.dir && Math.abs(dx) < 2.4 && Math.abs(p.y - w.y) < 0.5 && react(w.id)) return 'jump';
    }
    // the cannons' marks and the boss's barrage
    for (const m of s.marks) if (Math.abs(m.x - p.x) < m.r + 0.4 && m.t < 0.8 && react(m.id)) return 'back';
    for (const f of s.foes) {
      if (f.state === 'dead') continue;
      const dx = f.x - p.x, adx = Math.abs(dx);
      if (f.kind === 'walker' && f.state === 'act' && adx < 2.6 && Math.sign(f.vx) === -Math.sign(dx) && Math.abs(f.y - p.y) < 1 && react(f.id * 7)) return p.rollCd <= 0 ? 'roll' : 'jump';
      if (f.kind === 'drone' && f.state === 'act' && adx < 2.5 && react(f.id * 7)) return 'roll';
      if (f.kind === 'brute' && f.state === 'tell' && adx < 3.4 && react(f.id * 7 + f.t * 0)) { this.backDir = (dx > 0 ? 1 : -1); this.backT = 0.4; return null; }
      if (f.kind === 'boss') {
        if (f.state === 'tell' && f.move === 'laserLow' && f.t < 0.12 && react(f.id * 13 + 1)) return 'jump';
        if (f.state === 'act' && f.move === 'laserHigh' && react(f.id * 13 + 2)) return p.ground && p.rollCd <= 0 ? 'roll' : null;
        if (f.state === 'tell' && f.move === 'stomp' && adx < 5 && react(f.id * 13 + 3)) return 'back';
      }
    }
    return null;
  }
}

/** Picks the best card of an offer (rarer first, offence early). */
export function botPick(offer: CardId[]): number {
  let best = 0, bs = -1;
  offer.forEach((id, i) => {
    const c = CARD[id];
    const sc = RARITIES.indexOf(c.rarity) * 10 + (c.group === 'defence' ? 3 : c.group === 'offence' ? 2 : 1) - (id === 'glassCannon' ? 25 : 0);
    if (sc > bs) { bs = sc; best = i; }
  });
  return best;
}

/** Spends gears on cyberware, cheapest useful rank first; returns what is left. */
export function botShop(ranks: Ranks, gears: number): number {
  for (;;) {
    let pick: string | null = null, price = Infinity;
    const order = ['armor', 'sword', 'gun', 'heat', 'boots', 'magnet'];
    for (const u of order) {
      const r = ranks[u as keyof Ranks];
      if (r >= MAX_RANK) continue;
      const pr = UPGRADE[u as keyof Ranks].price[r];
      if (pr < price) { price = pr; pick = u; }
    }
    if (!pick || price > gears) return gears;
    gears -= price;
    ranks[pick as keyof Ranks]++;
  }
}
export { UPGRADE_IDS };
