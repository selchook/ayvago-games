// Last Convoy: the autopilot. It plays the menu's live backdrop, the store art's stage and the
// headless balance runs (balance.ts) with the same inputs a player has. Two skills: `good` reads the
// telegraphs and rolls out of them, plays the three combos (taps, a held charge against crowds and
// the boss's armour, the dash strike after a roll), fires its ability into crowds, swaps to the quiet
// melee among shamblers, reloads when it is safe and sends the dog sniffing for chests; `casual`
// reacts late, rolls rarely, mostly holds ATTACK, wanders off the line and forgets the dog. It walks
// the district down a flow field to the current objective, opens chests on its way, frees and
// escorts survivors, starts the hold and boards the convoy. The drive bot follows the route with a
// look-ahead, slows for the turns, threads the barricades' gaps and fires nitro on long straights.
import { NO_INPUT, type Input, type Mission, type Zombie } from './sim';
import { Flow, lineClear, type Spot } from './town';
import { HERO, GUN, type HeroId } from './defs';
import { BIG, angle, type Drive, type DriveInput } from './drive';
import { rollCards, CARD, UPGRADE, type CardId, type Ranks } from './powers';

export interface Skill { react: number; dodge: number; combos: number; ability: number; aim: number; chests: number; dog: number; drive: number }
export const SKILL: Record<'good' | 'casual', Skill> = {
  good: { react: 0.12, dodge: 0.85, combos: 0.9, ability: 0.9, aim: 0.05, chests: 0.8, dog: 0.6, drive: 1 },
  casual: { react: 0.38, dodge: 0.3, combos: 0.25, ability: 0.45, aim: 0.25, chests: 0.35, dog: 0.15, drive: 0.75 },
};

export class Bot {
  private flow: Flow | null = null;
  private goal: Spot | null = null;
  private flowT = 0;
  private held = false;
  private holdT = 0;
  private tapGap = 0;
  private dodgeCd = 0;
  private thinkT = 0;
  private wanderT = 0;
  private wx = 0; private wz = 0;
  private lastDog = 0;
  private stuckT = 0;
  private lx = 0; private lz = 0;
  private useHold = 0;
  /** Stay near a point (the menu backdrop keeps the fight in view). */
  stay: Spot | null = null;

  constructor(private sim: Mission, readonly skill: Skill, private rnd: () => number) {}

  setSim(s: Mission): void { this.sim = s; this.flow = null; this.goal = null; }

  /** The point the bot walks to now. */
  private target(): Spot | null {
    const s = this.sim, h = s.hero;
    if (this.stay) return this.stay;
    if (s.run.kind === 'stand' && s.truck) {
      // defend the truck: go for the zombie nearest to it (staying close to the truck)
      const tr = s.truck;
      let best: Spot | null = null, bd = 18;
      for (const z of s.zombies) { if (z.state === 'dead' || z.state === 'lurk') continue; const d = Math.hypot(z.x - tr.x, z.z - tr.z); if (d < bd) { bd = d; best = z; } }
      if (!best) return { x: tr.x, z: tr.z + 4 };
      const dx = best.x - tr.x, dz = best.z - tr.z, l = Math.hypot(dx, dz) || 1;
      const r = Math.min(l, 6);
      return { x: tr.x + (dx / l) * r, z: tr.z + (dz / l) * r };
    }
    // chests close by on the way (the good bot detours for them)
    const st = s.stageDef;
    if (st && st.kind !== 'return' && st.kind !== 'hold' && st.kind !== 'boss') {
      for (const c of s.chests) {
        if (c.opened) continue;
        const d = Math.hypot(c.x - h.x, c.z - h.z);
        if (d < 14 * this.skill.chests && this.rnd() < 0.999) return c;
      }
    }
    const objs = s.objectives();
    let best: Spot | null = null, bd = 1e9;
    for (const o of objs) { const d = Math.hypot(o.x - h.x, o.z - h.z); if (d < bd) { bd = d; best = o; } }
    // items hidden in chests the bot cannot see: the dog's nose, else the nearest closed chest
    if (!best && st?.kind === 'collect') {
      for (const c of s.chests) if (!c.opened) { const d = Math.hypot(c.x - h.x, c.z - h.z); if (d < bd) { bd = d; best = c; } }
    }
    return best;
  }

  input(dt: number): Input {
    const s = this.sim, h = s.hero, K = this.skill;
    const inp: Input = { ...NO_INPUT };
    if (!h.alive) return inp;
    this.dodgeCd -= dt; this.thinkT -= dt; this.flowT -= dt; this.tapGap -= dt; this.useHold -= dt;
    // the nearest threats
    let near: Zombie | null = null, nd = 1e9, crowd = 0, telling: Zombie | null = null;
    for (const z of s.zombies) {
      if (z.state === 'dead' || z.state === 'lurk') continue;
      const d = Math.hypot(z.x - h.x, z.z - h.z);
      if (d < 4.5) crowd++;
      if (d < nd) { nd = d; near = z; }
      if (z.state === 'tell' && d < (z.boss ? 7 : z.reach + 1.2) && (!telling || d < Math.hypot(telling.x - h.x, telling.z - h.z))) telling = z;
      if (z.state === 'charge' && d < 7) telling = z;
    }
    // roll out of a telegraphed blow
    if (telling && this.dodgeCd <= 0 && telling.t > K.react && this.rnd() < K.dodge) {
      const ax = h.x - telling.x, az = h.z - telling.z, l = Math.hypot(ax, az) || 1;
      const side = this.rnd() < 0.5 ? 1 : -1;
      // a slam: straight out of the ring; a charge or a blow: sideways out of its line
      const away = telling.boss && telling.move === 'slam' ? 1 : 0.5, across = telling.boss && telling.move === 'slam' ? 0.25 : 1;
      inp.mx = (ax / l) * away + (-az / l) * side * across; inp.mz = (az / l) * away + (ax / l) * side * across;
      inp.dodge = true;
      this.dodgeCd = 0.9;
      return inp;
    }
    if (h.grab >= 0) { inp.atkPress = this.rnd() < 0.3; inp.atk = true; if (this.rnd() < K.dodge * 0.05) inp.dodge = true; return inp; }
    // the gun or the quiet melee
    const G = GUN[HERO[h.id].gun];
    if (h.weapon === 'gun' && h.mag === 0 && h.reserve === 0 && h.swapT <= 0) inp.swap = true;
    if (K.combos > 0.5 && h.swapT <= 0 && h.step === 'none') {
      const bossNear = !!s.boss && s.boss.state !== 'dead' && Math.hypot(s.boss.x - h.x, s.boss.z - h.z) < 16;
      const wantMelee = (!bossNear && crowd <= 2 && nd < 3 && near && !near.boss && near.kind !== 'chubby' && s.horde > 55) || (h.weapon === 'gun' && h.reserve + h.mag === 0);
      const wantGun = (h.mag + h.reserve > 0) && (nd > 4 || crowd > 3 || near?.boss || near?.kind === 'chubby');
      if (h.weapon === 'gun' && wantMelee) inp.swap = true;
      else if (h.weapon === 'melee' && wantGun) inp.swap = true;
    }
    if (h.weapon === 'gun' && h.mag < G.mag * 0.35 && h.reserve > 0 && nd > 8) inp.reload = true;
    // the ability: into a crowd, or a heal when hurt, or the flare when chased by many
    if (h.abilityCd <= 0 && this.rnd() < K.ability * dt * 4) {
      const ab = HERO[h.id].ability;
      if ((ab === 'heal' && h.hp < h.max * 0.55) || (ab !== 'heal' && crowd >= 3) || (ab === 'flare' && crowd >= 2) || (near?.boss && nd < 7 && ab !== 'heal')) inp.ability = true;
    }
    // the dog: at the nearest foe, or sniffing for chests when items hide in them
    if (this.rnd() < K.dog * dt * 0.5 && s.time - this.lastDog > 6) {
      this.lastDog = s.time;
      inp.dog = true;
    }
    // attack: what is in range
    const range = h.weapon === 'gun' ? G.range * 0.9 : 2.6;
    const tgt = near && nd < range && lineClear(s.plan, h.x, h.z, near.x, near.z) ? near : null;
    let attack = false;
    if (tgt) {
      attack = true;
      // the combos: hold for the charged finisher against crowds and armour, tap otherwise
      // the heavy finisher roots you: only into a crowd, a bloater or the boss's armour, never beside a boss winding up
      const bossClose = !!s.boss && s.boss.state !== 'dead' && Math.hypot(s.boss.x - h.x, s.boss.z - h.z) < 7;
      const heavy = (crowd >= 3 || tgt.armor || tgt.kind === 'chubby') && (!bossClose || tgt.armor);
      if (this.rnd() < K.combos) {
        if (h.step === 'pre3') { this.held = heavy; }
        else if (h.step === 'none') { if (this.tapGap <= 0) { inp.atkPress = true; this.tapGap = 0.05; } this.held = true; }
        else this.held = h.weapon === 'gun' || h.stepT > h.stepLen * 0.5;
      } else this.held = true;
      inp.atk = this.held;
      // the dash strike: attack right after a roll
      if (h.sinceDodge < 0.3) { inp.atkPress = true; inp.atk = true; }
      inp.ax = tgt.x + (this.rnd() - 0.5) * K.aim * 6; inp.az = tgt.z + (this.rnd() - 0.5) * K.aim * 6;
    } else this.held = false;
    // the gate: when it is the objective and in reach, hit it (melee breaks it faster)
    const gate = s.stageDef?.kind === 'clear' ? s.walls.find((w) => w.kind === 'gate' && !w.down) : null;
    if (gate && !attack && Math.hypot(gate.x - h.x, gate.z - h.z) < 5) {
      inp.atk = true;
      if (this.tapGap <= 0) { inp.atkPress = true; this.tapGap = 0.3; }
      inp.ax = gate.x; inp.az = gate.z;
      if (h.weapon === 'gun' && h.swapT <= 0 && h.step === 'none' && !near) inp.swap = true;
    }
    // interact (hold)
    const c = s.context();
    if (c && (c.kind !== 'board' || s.boardable()) && (!tgt || nd > 4)) { inp.use = true; inp.useHeld = true; }
    // movement: to the goal down the field, backing off a crowd
    const goal = this.target();
    let mx = 0, mz = 0;
    if (goal) {
      if (!this.goal || Math.hypot(goal.x - this.goal.x, goal.z - this.goal.z) > 2 || this.flowT <= 0 || !this.flow) {
        this.goal = { x: goal.x, z: goal.z };
        this.flowT = 1.2;
        this.flow = this.flow ?? new Flow(s.plan);
        this.flow.build([this.goal]);
      }
      const d = Math.hypot(goal.x - h.x, goal.z - h.z);
      const stop = s.stageDef?.kind === 'hold' ? 3 : this.stay ? 5 : 0.6;
      if (d > stop) {
        const v = { x: 0, z: 0 };
        if (d < 5 || lineClear(s.plan, h.x, h.z, goal.x, goal.z)) { mx = (goal.x - h.x) / d; mz = (goal.z - h.z) / d; }
        else if (this.flow.dir(h.x, h.z, v)) { mx = v.x; mz = v.z; }
      }
    }
    // keep shooting distance from what comes at you (guns), close in with melee
    if (near && nd < (h.weapon === 'gun' || near.kind === 'chubby' ? (near.kind === 'chubby' ? 4.2 : 3.2) : 1.2) && !near.boss) { const l = nd || 1; mx += ((h.x - near.x) / l) * 1.2; mz += ((h.z - near.z) / l) * 1.2; }
    if (near && h.weapon === 'melee' && nd > 1.6 && nd < 6 && !attack) { mx += (near.x - h.x) / nd; mz += (near.z - h.z) / nd; }
    if (near?.boss && (nd < 4.5 || (h.weapon === 'melee' && nd < 9))) { const l = nd || 1; mx += ((h.x - near.x) / l) * 1.6; mz += ((h.z - near.z) / l) * 1.6; }
    // casual drift
    this.wanderT -= dt;
    if (this.wanderT <= 0) { this.wanderT = 1 + this.rnd() * 2; const a = this.rnd() * 6.28; this.wx = Math.cos(a); this.wz = Math.sin(a); }
    mx += this.wx * K.aim * 1.5; mz += this.wz * K.aim * 1.5;
    // unstick: walked into something for a while
    const moved = Math.hypot(h.x - this.lx, h.z - this.lz);
    this.lx = h.x; this.lz = h.z;
    if (Math.hypot(mx, mz) > 0.3 && moved < dt * 0.5) this.stuckT += dt; else this.stuckT = Math.max(0, this.stuckT - dt);
    if (this.stuckT > 0.8) { const a = this.rnd() * 6.28; mx = Math.cos(a); mz = Math.sin(a); if (this.stuckT > 1.4) this.stuckT = 0; }
    const l = Math.hypot(mx, mz);
    if (l > 1) { mx /= l; mz /= l; }
    inp.mx = mx; inp.mz = mz;
    if (!tgt && inp.atk === false && Number.isNaN(inp.ax)) { /* aim with the stick */ }
    return inp;
  }
}

/** The drive's autopilot: a look-ahead along the route, slow for turns, through the gaps. */
export function driveBot(d: Drive, skill: Skill, rnd: () => number): DriveInput {
  const inp: DriveInput = { steer: 0, gas: true, brake: false, nitro: false };
  const c = d.cells[d.ci];
  const nxt = d.cells[Math.min(d.cells.length - 1, d.ci + 1)];
  const nxt2 = d.cells[Math.min(d.cells.length - 1, d.ci + 2)];
  // aim at a point ahead: towards the next cell's middle, then the one after
  const fwd = Math.sin(d.h) * (nxt.x - d.x) + Math.cos(d.h) * (nxt.z - d.z);
  const p = fwd < BIG * 0.5 ? nxt2 : nxt;
  let tx = p.x, tz = p.z;
  // an obstacle ahead in the lane: aim beside it (the gap of a barricade)
  for (const o of d.obstacles) {
    if (o.down) continue;
    const ox = o.x - d.x, oz = o.z - d.z;
    const along = ox * Math.sin(d.h) + oz * Math.cos(d.h);
    const side = ox * Math.cos(d.h) - oz * Math.sin(d.h);
    if (along < 2 || along > 22 || Math.abs(side) > 3.2) continue;
    // find the open side of the road at that point
    const cell = d.cells[o.cell] ?? c;
    const rx = -cell.out[1], rz = cell.out[0];
    const lat = (o.x - cell.x) * rx + (o.z - cell.z) * rz;
    const shift = lat > 0 ? -5 : 5;
    tx = cell.x + rx * shift + cell.out[0] * 4; tz = cell.z + rz * shift + cell.out[1] * 4;
    break;
  }
  const want = Math.atan2(tx - d.x, tz - d.z);
  const diff = angle(want - d.h);
  inp.steer = Math.max(-1, Math.min(1, -diff * 2.2 * skill.drive + (rnd() - 0.5) * (1 - skill.drive) * 0.6));
  // slow into turns
  const turning = nxt.out[0] !== nxt.in[0] || nxt.out[1] !== nxt.in[1];
  const slow = turning && d.v > 13 * skill.drive + 1;
  if (slow || Math.abs(diff) > 0.7) { inp.gas = false; inp.brake = d.v > 9; }
  const straight = !turning && (nxt2.out[0] === nxt2.in[0] && nxt2.out[1] === nxt2.in[1]);
  if (straight && d.nitro > 0 && d.nitroT <= 0 && d.v > 12 && rnd() < 0.01 * skill.drive) inp.nitro = true;
  return inp;
}

/** Picks a card (rarest first, then this survivor's own). */
export function botPick(offer: CardId[], hero: HeroId): number {
  const rank = { common: 0, rare: 1, epic: 2, legendary: 3 };
  let best = 0, bs = -1;
  offer.forEach((id, i) => { const c = CARD[id]; const sc = rank[c.rarity] * 2 + (c.hero === hero ? 3 : 0); if (sc > bs) { bs = sc; best = i; } });
  return best;
}

/** Spends scrap and supplies in the garage: guns, vest, convoy, the hero's ability, melee, dog ... */
export function botShop(ranks: Ranks, purse: { scrap: number; supplies: number }, hero: HeroId): void {
  const order = ['guns', 'vest', 'convoy', ({ matt: 'barricade', sam: 'flare', shaun: 'heal', lis: 'warcry' } as const)[hero], 'pouch', 'melee', 'dog'] as const;
  for (let pass = 0; pass < 3; pass++) for (const u of order) {
    const r = ranks[u];
    if (r >= 3 || r > pass) continue;
    const price = UPGRADE[u].scrap[r], sup = UPGRADE[u].supplies[r];
    if (price <= purse.scrap && sup <= purse.supplies) { purse.scrap -= price; purse.supplies -= sup; ranks[u]++; }
  }
}

export { rollCards };
