// Sushi Rush: the autopilot. It plays a day the way a player does, one tap at a time: serve a
// finished dish to whoever wants it (the least patient first), keep the pot and the steamer busy
// for the noodle and steamed orders, and build the next plate dish step by step (rice, nori, fish,
// cut, roll). Between days it buys upgrades and picks power cards. Used by the menu's live
// backdrop, the store-art stage and the headless balance check (balance.ts).
import { DISH, type DishId, type CookId, type StationId } from './defs';
import { Day, plateDish, type Action } from './sim';
import { CARD, UPGRADE, UPGRADE_IDS, UPGRADE_DAY, MAX_RANK, type CardId, type Ranks, type UpgradeId } from './powers';

export interface Skill {
  /** Seconds between the chef going idle and the next tap. */
  think: number;
  /** Chance of tapping the wrong fish now and then (and binning it). */
  slip: number;
  /** Taps queued ahead (1 = waits for each step). */
  ahead: number;
}
export const SKILL: Record<'casual' | 'decent' | 'good', Skill> = {
  casual: { think: 0.75, slip: 0.06, ahead: 1 },
  decent: { think: 0.42, slip: 0.03, ahead: 1 },
  good: { think: 0.2, slip: 0.01, ahead: 2 },
};

export class Bot {
  private wait = 0;

  constructor(private day: Day, private skill: Skill, private rnd: () => number) {}

  setDay(d: Day): void { this.day = d; this.wait = 0.5; }

  /** Called every step: maybe taps something. */
  step(dt: number): void {
    const d = this.day;
    if (d.over) return;
    this.wait -= dt;
    if (this.wait > 0) return;
    if (d.queue.length + (d.chef.action ? 1 : 0) >= this.skill.ahead) return;
    if (d.m.bell && d.bellCd <= 0 && d.occupant.some((o) => !o) && d.time < d.length - 15) d.ringBell();
    const a = this.next();
    this.wait = this.skill.think * (0.7 + this.rnd() * 0.6);
    if (a === 'bin') { d.bin(); return; }
    if (a) d.tap(a);
  }

  /** The waiting orders, least patient first. */
  private wants(): { seat: number; dish: DishId; patience: number }[] {
    const out: { seat: number; dish: DishId; patience: number }[] = [];
    for (const c of this.day.customers) {
      if (c.state !== 'wait') continue;
      for (const dish of c.orders.slice(c.served)) out.push({ seat: c.seat, dish, patience: c.patience });
    }
    return out.sort((a, b) => a.patience - b.patience);
  }

  next(): Action | 'bin' | null {
    const d = this.day;
    // only plan from a settled plate (nothing queued)
    if (d.queue.length || d.chef.action) return null;
    const wants = this.wants();
    const plate = d.plate;
    const pd = plateDish(plate);
    if (pd) {
      const w = wants.find((x) => x.dish === pd);
      if (w) return { kind: 'serve', seat: w.seat };
      // a dish nobody wants now: keep it a while if more customers are coming, else bin it
      if (!wants.length) return null;
      return plate.ready && wants.length < 2 ? null : 'bin';
    }
    // collect cooked dishes that are ready
    for (const st of ['pot', 'steamer'] as const) {
      const slots = st === 'pot' ? d.potSlots : d.basketSlots;
      if (slots.some((s) => s.state === 'burnt')) return { kind: 'station', st };
      const ready = slots.find((s) => s.state === 'done');
      if (ready && wants.some((w) => w.dish === ready.what) && this.plateFree()) return { kind: 'station', st };
    }
    // start the pot / the steamer for waiting orders not cooking yet
    for (const st of ['pot', 'steamer'] as const) {
      const slots = st === 'pot' ? d.potSlots : d.basketSlots;
      if (!slots.some((s) => s.state === 'empty')) continue;
      const cooking = new Map<CookId, number>();
      for (const s of slots) if (s.what && s.state !== 'burnt') cooking.set(s.what, (cooking.get(s.what) ?? 0) + s.portions);
      const need = new Map<CookId, number>();
      for (const w of wants) if (DISH[w.dish].cook === st) need.set(w.dish as CookId, (need.get(w.dish as CookId) ?? 0) + 1);
      for (const [what, n] of need) if (n > (cooking.get(what) ?? 0)) return { kind: 'station', st, cook: what };
    }
    // build the most urgent plate dish
    const target = wants.find((w) => !DISH[w.dish].cook);
    if (!target) return null;
    if (d.prepLeft > 0 && d.prepDish === target.dish && this.plateFree()) return { kind: 'station', st: 'fridge', item: 'prep' };
    const def = DISH[target.dish];
    // a plate that cannot become the target: start over
    if (!plate.items.every((i) => def.items!.includes(i) || def.items!.includes((i + '-cut') as never))) return 'bin';
    for (const s of def.steps) {
      if (s.st === 'rice' && plate.items.includes('rice')) continue;
      if (s.st === 'nori' && plate.items.includes('nori')) continue;
      if (s.st === 'fridge' && plate.items.some((i) => i.startsWith(s.item!))) continue;
      if (s.st === 'knife' && !plate.items.some((i) => ['tuna', 'salmon', 'ebi', 'octo', 'cucumber'].includes(i)) && plate.items.some((i) => i.endsWith('-cut'))) continue;
      if (s.st === 'mat' && plate.rolled) continue;
      if (s.st === 'fridge' && this.rnd() < this.skill.slip) {
        const other = d.fridge.find((f) => f !== s.item);
        if (other) return { kind: 'station', st: 'fridge', item: other };
      }
      // Sharp Knife II: take the spare slice instead of a fresh fish
      if (s.st === 'fridge' && d.spare === s.item + '-cut') return { kind: 'station', st: 'knife' };
      return { kind: 'station', st: s.st as StationId, item: s.item };
    }
    return null;
  }

  private plateFree(): boolean {
    const p = this.day.plate;
    return !p.ready && (!p.items.length || (p.items.length === 1 && p.items[0] === 'rice'));
  }
}

/** Upgrades in the bot's order of preference. */
const WISH: UpgradeId[] = ['sandals', 'tea', 'knife', 'rice', 'seats', 'pot', 'sandals', 'decor', 'steamer', 'tea', 'bell', 'knife', 'seats', 'pot', 'rice', 'steamer', 'decor', 'bell'];

/** Buys what it can afford (cheapest wish first); returns the coins left. */
export function botShop(ranks: Ranks, purse: number, day: number): number {
  for (let pass = 0; pass < 3; pass++) {
    for (const u of WISH) {
      if (UPGRADE_DAY[u] > day + 1) continue;
      const r = ranks[u];
      if (r >= MAX_RANK) continue;
      const p = UPGRADE[u].price[r];
      if (p <= purse * 0.85) { ranks[u] = r + 1; purse -= p; }
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
