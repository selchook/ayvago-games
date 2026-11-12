// Snack Shack: an autopilot that plays the simulation like a player would, one tap at a time with
// a reaction delay. It drives the attract demo behind the menu and the headless balance check.
import { Sim, type Item, type StationId, type UpgradeId } from './sim';

export interface BotSkill {
  /** Seconds between taps. */
  tap: number;
  /** Chance that a tap goes to a random open station instead (a fumble). */
  fumble: number;
}

export const SKILL: Record<'expert' | 'good' | 'casual', BotSkill> = {
  expert: { tap: 0.42, fumble: 0.03 },
  good: { tap: 0.6, fumble: 0.06 },
  casual: { tap: 0.9, fumble: 0.12 },
};

export class Bot {
  private wait = 0.6;
  constructor(readonly sim: Sim, readonly skill: BotSkill = SKILL.good, private rand: () => number = Math.random) {}

  /** Runs the bot for dt seconds; returns the station it tapped (or a customer id), if any. */
  update(dt: number): StationId | null {
    this.wait -= dt;
    if (this.wait > 0 || this.sim.over || this.sim.state === 'done') return null;
    this.wait = this.skill.tap * (0.8 + this.rand() * 0.4);
    let st = this.choose();
    if (this.rand() < this.skill.fumble) {
      const open = (['grill', 'pass', 'soda', 'fryer', 'veggie', 'dogs', 'cream'] as StationId[]).filter((s) => this.sim.open(s));
      st = open[Math.floor(this.rand() * open.length)];
    }
    if (!st) return null;
    this.sim.act(st);
    return st;
  }

  /** The most useful tap right now. */
  choose(): StationId | null {
    const s = this.sim;
    const want = (it: Item) => s.wanting(it).length > 0;
    // 1. a done patty or sausage that would burn soon, while a plate is free
    const freePlate = s.plates.slice(0, s.plateCount).some((p) => !p);
    const urgentCook = (slots: typeof s.grill, n: number) => slots.slice(0, n).some((x) => x.s === 'done' && x.t > s.burnTime * 0.4);
    if (freePlate && urgentCook(s.grill, s.grillSlots)) return 'grill';
    if (freePlate && s.open('dogs') && urgentCook(s.dogs, s.dogSlots)) return 'dogs';
    // 2. serve what is ready and wanted
    const plates = s.plates.slice(0, s.plateCount);
    const deluxeNeeded = s.wanting('deluxe').length;
    if (plates.some((p) => p && p !== 'burger' && want(p)) || plates.some((p) => p === 'burger' && want('burger'))) return 'pass';
    if (s.tray > 0 && want('fries')) return 'fryer';
    if (s.soda.some((x) => x.s === 'full') && want('soda')) return 'soda';
    if (s.open('cream') && s.cream.some((x) => x.s === 'full') && want('icecream')) return 'cream';
    // 3. a plain burger turned deluxe for someone waiting for one
    const d = s.demand();
    const onPlates = (it: Item) => plates.filter((p) => p === it).length;
    // (wanted plain burgers were served just above, so a plain one left on the pass is spare)
    if (s.open('veggie') && deluxeNeeded > onPlates('deluxe') && onPlates('burger') > 0) return 'veggie';
    if (s.open('veggie') && d.deluxe > onPlates('deluxe') && onPlates('burger') > d.burger) return 'veggie';
    // 4. move done patties / sausages to plates, bin burnt ones
    if (freePlate && s.grill.slice(0, s.grillSlots).some((x) => x.s === 'done')) return 'grill';
    if (s.grill.slice(0, s.grillSlots).some((x) => x.s === 'burnt')) return 'grill';
    if (s.open('dogs') && freePlate && s.dogs.some((x) => x.s === 'done')) return 'dogs';
    if (s.open('dogs') && s.dogs.some((x) => x.s === 'burnt')) return 'dogs';
    // 5. start what is owed and not yet on the way
    const cooking = (slots: typeof s.grill, n: number) => slots.slice(0, n).filter((x) => x.s === 'cook' || x.s === 'done').length;
    const deficit: [StationId, number][] = [];
    const burgers = d.burger + d.deluxe - onPlates('burger') - onPlates('deluxe') - cooking(s.grill, s.grillSlots);
    deficit.push(['grill', burgers]);
    if (s.open('dogs')) deficit.push(['dogs', d.hotdog - onPlates('hotdog') - cooking(s.dogs, s.dogSlots)]);
    deficit.push(['soda', d.soda - s.soda.filter((x) => x.s !== 'empty').length]);
    if (s.open('fryer')) deficit.push(['fryer', d.fries - s.tray - (s.fryer.s === 'fry' ? s.batch : 0)]);
    if (s.open('cream')) deficit.push(['cream', d.icecream - s.cream.filter((x) => x.s !== 'empty').length]);
    deficit.sort((a, b) => b[1] - a[1]);
    for (const [st, n] of deficit) {
      if (n <= 0) break;
      if (this.canStart(st)) return st;
    }
    // 6. a jammed pass: clear it
    if (plates.every((p) => !!p) && !plates.some((p) => p && want(p))) return 'pass';
    return null;
  }

  private canStart(st: StationId): boolean {
    const s = this.sim;
    switch (st) {
      case 'grill': return s.grill.slice(0, s.grillSlots).some((x) => x.s === 'empty');
      case 'dogs': return s.dogs.slice(0, s.dogSlots).some((x) => x.s === 'empty');
      case 'soda': return s.soda.some((x) => x.s === 'empty');
      case 'cream': return s.cream.some((x) => x.s === 'empty');
      case 'fryer': return s.fryer.s === 'idle' && s.tray < s.trayMax;
      default: return false;
    }
  }

  /** Spends the tips between days, cheapest useful upgrade first. */
  shop(): UpgradeId[] {
    const s = this.sim;
    const bought: UpgradeId[] = [];
    const prefer: UpgradeId[] = ['patience', 'seat', 'grill', 'timer', 'plate', 'fryer', 'drinks'];
    for (let guard = 0; guard < 12; guard++) {
      const list = s.shopList().filter((id) => s.upgradeCost(id) !== null && s.upgradeCost(id)! <= s.wallet);
      if (!list.length) break;
      list.sort((a, b) => prefer.indexOf(a) - prefer.indexOf(b));
      if (s.buy(list[0])) bought.push(list[0]);
    }
    return bought;
  }
}

