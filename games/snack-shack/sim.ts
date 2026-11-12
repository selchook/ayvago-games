// Snack Shack: the rules as a pure simulation (no Phaser, no three.js), shared by the Play scene,
// the attract demo behind the menu and the headless balance bot. Time is in seconds.
//
// A day: customers walk in, take a stool at the bar (or queue by the door), order one to four
// items and wait with a patience meter. The player cooks and serves with one tap per station:
//   grill   patty → (cook) → done → (left too long) burnt; a done patty goes to a free plate as a burger
//   pass    the plates: a tap serves the plate item the most impatient customer wants
//   soda    fills a cup; a full cup goes to a customer who ordered a drink
//   fryer   fries a batch into the fries tray; a portion goes to a customer who ordered fries
//   veggie  lettuce and tomato turn a plain burger on a plate into a deluxe burger
//   dogs    like the grill, with sausages: a done one goes to a plate as a hot dog
//   cream   fills an ice-cream cone
// A served order pays its price plus a tip (faster = more, combos multiply it). An angry customer
// costs a heart; the run ends when the hearts are gone. Between days tips buy upgrades.

export type Item = 'burger' | 'deluxe' | 'soda' | 'fries' | 'hotdog' | 'icecream';
export type StationId = 'grill' | 'pass' | 'soda' | 'fryer' | 'veggie' | 'dogs' | 'cream';
export type Diff = 'easy' | 'normal';

/** Stations in number-key order (1–7). */
export const STATIONS: StationId[] = ['grill', 'pass', 'soda', 'fryer', 'veggie', 'dogs', 'cream'];
/** The day each station opens. */
export const STATION_DAY: Record<StationId, number> = { grill: 1, pass: 1, soda: 1, fryer: 2, veggie: 3, dogs: 4, cream: 5 };
export const ITEMS: Item[] = ['burger', 'soda', 'fries', 'deluxe', 'hotdog', 'icecream'];
/** The day each item joins the menu. */
export const ITEM_DAY: Record<Item, number> = { burger: 1, soda: 1, fries: 2, deluxe: 3, hotdog: 4, icecream: 5 };
export const PRICE: Record<Item, number> = { burger: 10, deluxe: 14, soda: 5, fries: 6, hotdog: 9, icecream: 7 };
/** Where each item comes from. */
export const ITEM_STATION: Record<Item, StationId> = { burger: 'pass', deluxe: 'pass', hotdog: 'pass', soda: 'soda', fries: 'fryer', icecream: 'cream' };

export interface Tune {
  hearts: number;
  maxHearts: number;
  /** Seconds of patience at the bar for a one-item order on day 1. */
  patience: number;
  /** Extra patience per item after the first. */
  perItem: number;
  /** Seconds a customer waits in the queue by the door before leaving angry. */
  queueWait: number;
  /** Opening hours of a day in seconds (customers arrive during them). */
  dayLen: number;
  /** Seconds between arrivals on day 1, and the floor it ramps down to. */
  gap: number;
  minGap: number;
  /** How fast the days get harder: day d plays like 1 + (d - 1) * ramp. */
  ramp: number;
  cook: number;
  burn: number;
  fry: number;
  fill: number;
  dog: number;
  cream: number;
}

/** Normal and Easy side by side (§7c). */
export const TUNING: Record<Diff, Tune> = {
  normal: { hearts: 4, maxHearts: 5, patience: 21, perItem: 6, queueWait: 14, dayLen: 64, gap: 6.4, minGap: 2.3, ramp: 1, cook: 4.2, burn: 5, fry: 4.8, fill: 2.6, dog: 3.4, cream: 1.6 },
  easy: { hearts: 6, maxHearts: 8, patience: 30, perItem: 8, queueWait: 22, dayLen: 60, gap: 7.6, minGap: 3.2, ramp: 0.6, cook: 3.8, burn: 8, fry: 4.2, fill: 2.2, dog: 3, cream: 1.3 },
};

export type UpgradeId = 'grill' | 'patience' | 'seat' | 'plate' | 'timer' | 'fryer' | 'drinks';
export const UPGRADES: { id: UpgradeId; cost: number[]; day: number }[] = [
  { id: 'patience', cost: [50, 110, 190], day: 1 },
  { id: 'grill', cost: [70, 150], day: 1 },
  { id: 'seat', cost: [90, 190], day: 1 },
  { id: 'plate', cost: [90], day: 1 },
  { id: 'timer', cost: [55], day: 1 },
  { id: 'drinks', cost: [70], day: 1 },
  { id: 'fryer', cost: [85], day: 2 },
];

export const MAX_SEATS = 5;
export const MAX_QUEUE = 3;

export type CookState = 'empty' | 'cook' | 'done' | 'burnt';
export type FillState = 'empty' | 'fill' | 'full';
export interface CookSlot { s: CookState; t: number }
export interface FillSlot { s: FillState; t: number }

export type Phase = 'in' | 'queue' | 'toSeat' | 'seated' | 'happy' | 'angry' | 'out' | 'gone';
export interface OrderLine { item: Item; done: boolean }
export interface Customer {
  id: number;
  /** Which figure and colour the view draws. */
  look: number;
  phase: Phase;
  /** Seconds in the current phase. */
  t: number;
  seat: number;
  order: OrderLine[];
  patience: number;
  max: number;
  /** Seconds spent in the queue. */
  waited: number;
  /** What the customer paid (for the view's coins). */
  paid: number;
  tip: number;
}

export type Ref = { st: StationId; slot: number };
export type SimEvent =
  | { type: 'place'; at: Ref }
  | { type: 'ready'; at: Ref }
  | { type: 'burnt'; at: Ref }
  | { type: 'trash'; at: Ref; item?: Item }
  | { type: 'plate'; from: Ref; to: number; item: Item }
  | { type: 'veggie'; to: number }
  | { type: 'serve'; from: Ref; item: Item; c: Customer }
  | { type: 'pay'; c: Customer; base: number; tip: number; combo: number }
  | { type: 'angry'; c: Customer }
  | { type: 'arrive'; c: Customer }
  | { type: 'seat'; c: Customer }
  | { type: 'error'; st: StationId; reason: string }
  | { type: 'heart'; hearts: number }
  | { type: 'closing' }
  | { type: 'dayDone' };

/** Seconds a customer takes from the door to stool `seat`, or back. */
export const walkTime = (seat: number): number => 1.1 + 0.32 * seat;
/** Seconds a customer takes from the door to the queue. */
export const QUEUE_WALK = 0.8;
export const HAPPY_T = 1.3;
export const ANGRY_T = 1.3;
/** Seconds within which completed orders chain into a combo. */
export const COMBO_WINDOW = 8;
export const FIGURES = 4;

/** A small seeded random generator (mulberry32), so a day's customers are the same on every run. */
export function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), a | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface Arrival { at: number; order: Item[]; look: number }

export class Sim {
  readonly tune: Tune;
  day = 0;
  /** Seconds since the day opened. */
  clock = 0;
  /** 'open' while customers arrive, 'closing' until the last one leaves, then 'done'. */
  state: 'open' | 'closing' | 'done' = 'open';
  hearts: number;
  score = 0;
  /** Tips: spent on upgrades between days. */
  wallet = 0;
  combo = 0;
  bestCombo = 0;
  private lastServe = -99;
  over = false;
  levels: Record<UpgradeId, number> = { grill: 0, patience: 0, seat: 0, plate: 0, timer: 0, fryer: 0, drinks: 0 };

  grill: CookSlot[] = [];
  dogs: CookSlot[] = [];
  plates: (Item | null)[] = [];
  soda: FillSlot[] = [];
  cream: FillSlot[] = [];
  fryer = { s: 'idle' as 'idle' | 'fry', t: 0 };
  tray = 0;
  customers: Customer[] = [];
  events: SimEvent[] = [];
  /** Today's numbers for the result card. */
  stats = { served: 0, angry: 0, earned: 0, tips: 0, customers: 0 };
  private arrivals: Arrival[] = [];
  private nextId = 1;
  /** Seed for the days' arrivals (the run's own, so a retry is a new run). */
  private seed: number;

  constructor(readonly diff: Diff = 'normal', seed = 1) {
    this.tune = TUNING[diff];
    this.hearts = this.tune.hearts;
    this.seed = seed;
  }

  // ------------------------------------------------------------------ derived values

  get seats(): number { return 3 + this.levels.seat; }
  get plateCount(): number { return 3 + this.levels.plate; }
  get grillSlots(): number { return 3 + this.levels.plate; }
  get dogSlots(): number { return 2; }
  get trayMax(): number { return 3; }
  get batch(): number { return this.levels.fryer ? 3 : 2; }
  get cookTime(): number { return this.tune.cook * Math.pow(0.8, this.levels.grill); }
  get dogTime(): number { return this.tune.dog * Math.pow(0.8, this.levels.grill); }
  get burnTime(): number { return this.tune.burn * (this.levels.timer ? 1.8 : 1); }
  get fryTime(): number { return this.tune.fry * (this.levels.fryer ? 0.8 : 1); }
  get fillTime(): number { return this.tune.fill * (this.levels.drinks ? 0.65 : 1); }
  get creamTime(): number { return this.tune.cream * (this.levels.drinks ? 0.65 : 1); }
  /** Difficulty level of the current day (the ramp). */
  get heat(): number { return 1 + (this.day - 1) * this.tune.ramp; }
  open(st: StationId): boolean { return this.day >= STATION_DAY[st]; }
  menu(): Item[] { return ITEMS.filter((i) => this.day >= ITEM_DAY[i]); }

  // ------------------------------------------------------------------ days

  /** Opens the next day: clears the kitchen, keeps upgrades, hearts and tips, plans the arrivals. */
  startDay(): void {
    this.day++;
    this.clock = 0;
    this.state = 'open';
    this.combo = 0;
    this.lastServe = -99;
    this.customers = [];
    this.events = [];
    this.stats = { served: 0, angry: 0, earned: 0, tips: 0, customers: 0 };
    this.grill = Array.from({ length: 4 }, () => ({ s: 'empty' as CookState, t: 0 }));
    this.dogs = Array.from({ length: 2 }, () => ({ s: 'empty' as CookState, t: 0 }));
    this.plates = Array.from({ length: 4 }, () => null);
    this.soda = Array.from({ length: 2 }, () => ({ s: 'empty' as FillState, t: 0 }));
    this.cream = Array.from({ length: 2 }, () => ({ s: 'empty' as FillState, t: 0 }));
    this.fryer = { s: 'idle', t: 0 };
    this.tray = 0;
    this.arrivals = this.plan();
  }

  /** The length of today's opening hours. */
  get dayLen(): number { return this.tune.dayLen + Math.min(30, (this.day - 1) * 4); }

  private plan(): Arrival[] {
    const r = seeded(this.seed * 7919 + this.day * 104729);
    const h = this.heat;
    // past day 10 the floor itself sinks a little each day, so the rush never stops growing
    const floor = this.tune.minGap * Math.max(0.7, Math.pow(0.97, Math.max(0, this.day - 10)));
    const gap = Math.max(floor, this.tune.gap / (1 + 0.16 * (h - 1)));
    const out: Arrival[] = [];
    const menu = this.menu();
    const fresh = menu.filter((i) => ITEM_DAY[i] === this.day);
    let at = 0.5;
    while (at < this.dayLen) {
      // order size: 1–2 at first, up to 3 from day 3 and 4 late
      const maxN = h < 2 ? 2 : h < 4.5 ? 3 : 4;
      const roll = r();
      let n = 1 + Math.floor(roll * roll * maxN * 1.05 + (h > 3 ? r() * 0.6 : 0));
      n = Math.max(1, Math.min(maxN, n));
      const order: Item[] = [];
      // the day's new item shows up often, so the player meets it
      if (fresh.length && r() < 0.55) order.push(fresh[Math.floor(r() * fresh.length)]);
      // a main dish (burger / deluxe / hot dog) is likely; drinks and sides fill up the rest
      while (order.length < n) {
        const pick = menu[Math.floor(r() * menu.length)];
        order.push(pick);
      }
      out.push({ at, order: order.slice(0, n), look: Math.floor(r() * 64) });
      // arrivals come in loose clumps (a lunch rush) rather than a metronome
      const jitter = 0.55 + r() * 0.9;
      at += gap * jitter * (n > 2 ? 1.2 : 1);
    }
    return out;
  }

  /** Total customers today (for the progress readout). */
  get todayTotal(): number { return this.stats.customers + this.arrivals.length; }

  // ------------------------------------------------------------------ the loop

  /** Advances the world by dt seconds. */
  update(dt: number): void {
    if (this.over || this.state === 'done') return;
    this.dt = dt;
    this.clock += dt;
    // arrivals
    while (this.state === 'open' && this.arrivals.length && this.arrivals[0].at <= this.clock) {
      const a = this.arrivals[0];
      const queued = this.customers.filter((c) => c.phase === 'queue' || (c.phase === 'in')).length;
      if (queued >= MAX_QUEUE) { a.at += 1; break; } // the door is crowded: they come a little later
      this.arrivals.shift();
      this.arrive(a);
    }
    if (this.state === 'open' && this.clock >= this.dayLen && !this.arrivals.length) {
      this.state = 'closing';
      this.events.push({ type: 'closing' });
    }
    if (this.state === 'open' && this.clock >= this.dayLen + 20) {
      // a crowded door at closing time: the last ones are sent home politely
      this.arrivals = [];
    }
    this.cook(this.grill, this.cookTime, 'grill', this.grillSlots);
    this.cook(this.dogs, this.dogTime, 'dogs', this.dogSlots);
    this.fill(this.soda, this.fillTime, 'soda');
    this.fill(this.cream, this.creamTime, 'cream');
    if (this.fryer.s === 'fry') {
      this.fryer.t += dt;
      if (this.fryer.t >= this.fryTime) {
        this.fryer = { s: 'idle', t: 0 };
        this.tray = Math.min(this.trayMax, this.tray + this.batch);
        this.events.push({ type: 'ready', at: { st: 'fryer', slot: 0 } });
      }
    }
    this.stepCustomers(dt);
    if (this.state === 'closing' && this.customers.every((c) => c.phase === 'gone')) {
      this.state = 'done';
      this.events.push({ type: 'dayDone' });
    }
  }
  private dt = 0;

  private cook(slots: CookSlot[], time: number, st: StationId, n: number): void {
    const dt = this.dt;
    for (let i = 0; i < n; i++) {
      const s = slots[i];
      if (s.s === 'cook') {
        s.t += dt;
        if (s.t >= time) { s.s = 'done'; s.t = 0; this.events.push({ type: 'ready', at: { st, slot: i } }); }
      } else if (s.s === 'done') {
        s.t += dt;
        if (s.t >= this.burnTime) { s.s = 'burnt'; s.t = 0; this.events.push({ type: 'burnt', at: { st, slot: i } }); }
      } else if (s.s === 'burnt') s.t += dt;
    }
  }

  private fill(slots: FillSlot[], time: number, st: StationId): void {
    const dt = this.dt;
    slots.forEach((s, i) => {
      if (s.s === 'fill') {
        s.t += dt;
        if (s.t >= time) { s.s = 'full'; s.t = 0; this.events.push({ type: 'ready', at: { st, slot: i } }); }
      } else if (s.s === 'full') s.t += dt;
    });
  }

  private arrive(a: Arrival): void {
    const c: Customer = {
      id: this.nextId++, look: a.look, phase: 'in', t: 0, seat: -1,
      order: a.order.map((item) => ({ item, done: false })),
      patience: 0, max: 0, waited: 0, paid: 0, tip: 0,
    };
    this.stats.customers++;
    const seat = this.freeSeat();
    if (seat >= 0) { c.seat = seat; c.phase = 'toSeat'; }
    this.customers.push(c);
    this.events.push({ type: 'arrive', c });
  }

  private freeSeat(): number {
    for (let s = 0; s < this.seats; s++) {
      if (!this.customers.some((c) => c.seat === s && (c.phase === 'toSeat' || c.phase === 'seated' || c.phase === 'happy' || c.phase === 'angry'))) return s;
    }
    return -1;
  }

  /** Patience for an order of n items today. */
  patienceFor(n: number): number {
    const h = this.heat;
    const base = this.tune.patience * Math.max(0.5, 1 - 0.06 * (h - 1)) + this.tune.perItem * (n - 1);
    return base * (1 + 0.15 * this.levels.patience);
  }

  private stepCustomers(dt: number): void {
    for (const c of this.customers) {
      c.t += dt;
      switch (c.phase) {
        case 'in':
          if (c.t >= QUEUE_WALK) { c.phase = 'queue'; c.t = 0; }
          break;
        case 'queue': {
          c.waited += dt;
          const seat = this.freeSeat();
          // first in line takes a free stool
          const first = this.customers.find((o) => o.phase === 'queue');
          if (seat >= 0 && first === c) { c.seat = seat; c.phase = 'toSeat'; c.t = 0; break; }
          if (c.waited >= this.tune.queueWait * (1 + 0.15 * this.levels.patience)) this.storm(c);
          break;
        }
        case 'toSeat':
          if (c.t >= walkTime(c.seat)) {
            c.phase = 'seated';
            c.t = 0;
            c.max = c.patience = this.patienceFor(c.order.length);
            this.events.push({ type: 'seat', c });
          }
          break;
        case 'seated':
          c.patience -= dt;
          if (c.patience <= 0) this.storm(c);
          break;
        case 'happy':
          if (c.t >= HAPPY_T) { c.phase = 'out'; c.t = 0; }
          break;
        case 'angry':
          if (c.t >= ANGRY_T) { c.phase = 'out'; c.t = 0; }
          break;
        case 'out':
          if (c.t >= (c.seat >= 0 ? walkTime(c.seat) : QUEUE_WALK)) c.phase = 'gone';
          break;
      }
    }
    // drop the gone ones once nobody looks at them (the view reads ids)
    if (this.customers.length > 24) this.customers = this.customers.filter((c) => c.phase !== 'gone');
  }

  /** A customer gives up: a heart is lost. */
  private storm(c: Customer): void {
    c.phase = 'angry';
    c.t = 0;
    c.patience = 0;
    this.combo = 0;
    this.stats.angry++;
    this.hearts--;
    this.events.push({ type: 'angry', c });
    this.events.push({ type: 'heart', hearts: this.hearts });
    if (this.hearts <= 0) this.over = true;
  }

  // ------------------------------------------------------------------ demand

  /** Seated customers who still need `item`, most impatient first. */
  wanting(item: Item): Customer[] {
    return this.customers
      .filter((c) => c.phase === 'seated' && c.order.some((o) => !o.done && o.item === item))
      .sort((a, b) => a.patience / a.max - b.patience / b.max);
  }

  /** Items still owed to seated, walking and queued customers. */
  demand(): Record<Item, number> {
    const d: Record<Item, number> = { burger: 0, deluxe: 0, soda: 0, fries: 0, hotdog: 0, icecream: 0 };
    for (const c of this.customers) {
      if (c.phase !== 'seated' && c.phase !== 'toSeat' && c.phase !== 'queue' && c.phase !== 'in') continue;
      for (const o of c.order) if (!o.done) d[o.item]++;
    }
    return d;
  }

  // ------------------------------------------------------------------ actions

  /** One tap on a station (or its number key). Returns false when nothing happened. */
  act(st: StationId): boolean {
    if (this.over || this.state === 'done' || !this.open(st)) return false;
    switch (st) {
      case 'grill': return this.cookAct('grill', this.grill, this.grillSlots, 'burger');
      case 'dogs': return this.cookAct('dogs', this.dogs, this.dogSlots, 'hotdog');
      case 'pass': return this.passAct();
      case 'soda': return this.fillAct('soda', this.soda, 'soda');
      case 'cream': return this.fillAct('cream', this.cream, 'icecream');
      case 'fryer': return this.fryAct();
      case 'veggie': return this.veggieAct();
    }
  }

  private freePlate(): number {
    for (let i = 0; i < this.plateCount; i++) if (!this.plates[i]) return i;
    return -1;
  }

  private cookAct(st: StationId, slots: CookSlot[], n: number, item: Item): boolean {
    // 1. a done patty / sausage goes to a free plate (the one closest to burning first)
    let best = -1;
    for (let i = 0; i < n; i++) if (slots[i].s === 'done' && (best < 0 || slots[i].t > slots[best].t)) best = i;
    const plate = this.freePlate();
    if (best >= 0 && plate >= 0) {
      slots[best] = { s: 'empty', t: 0 };
      this.plates[plate] = item;
      this.events.push({ type: 'plate', from: { st, slot: best }, to: plate, item });
      return true;
    }
    // 2. a burnt one goes in the bin
    const burnt = slots.findIndex((s, i) => i < n && s.s === 'burnt');
    if (burnt >= 0) {
      slots[burnt] = { s: 'empty', t: 0 };
      this.events.push({ type: 'trash', at: { st, slot: burnt } });
      return true;
    }
    // 3. a new one on a free spot
    for (let i = 0; i < n; i++) {
      if (slots[i].s === 'empty') {
        slots[i] = { s: 'cook', t: 0 };
        this.events.push({ type: 'place', at: { st, slot: i } });
        return true;
      }
    }
    this.events.push({ type: 'error', st, reason: best >= 0 ? 'platesFull' : 'busy' });
    return false;
  }

  private passAct(): boolean {
    // the plate item the most impatient customer is waiting for
    let pick: { plate: number; c: Customer } | null = null;
    for (let i = 0; i < this.plateCount; i++) {
      const it = this.plates[i];
      if (!it) continue;
      const c = this.wanting(it)[0];
      if (c && (!pick || c.patience / c.max < pick.c.patience / pick.c.max)) pick = { plate: i, c };
    }
    if (pick) {
      const item = this.plates[pick.plate]!;
      this.plates[pick.plate] = null;
      this.give(pick.c, item, { st: 'pass', slot: pick.plate });
      return true;
    }
    // nobody wants what is there: the oldest plate is cleared, so the pass never jams
    const full = this.plates.findIndex((p, i) => i < this.plateCount && !!p);
    if (full >= 0 && this.plates.slice(0, this.plateCount).every((p) => !!p)) {
      const item = this.plates[full]!;
      this.plates[full] = null;
      this.events.push({ type: 'trash', at: { st: 'pass', slot: full }, item });
      return true;
    }
    this.events.push({ type: 'error', st: 'pass', reason: full >= 0 ? 'nobody' : 'empty' });
    return false;
  }

  private fillAct(st: StationId, slots: FillSlot[], item: Item): boolean {
    const want = this.wanting(item)[0];
    const full = slots.findIndex((s) => s.s === 'full');
    if (full >= 0 && want) {
      slots[full] = { s: 'empty', t: 0 };
      this.give(want, item, { st, slot: full });
      return true;
    }
    const free = slots.findIndex((s) => s.s === 'empty');
    if (free >= 0) {
      slots[free] = { s: 'fill', t: 0 };
      this.events.push({ type: 'place', at: { st, slot: free } });
      return true;
    }
    this.events.push({ type: 'error', st, reason: full >= 0 ? 'nobody' : 'busy' });
    return false;
  }

  private fryAct(): boolean {
    const want = this.wanting('fries')[0];
    if (this.tray > 0 && want) {
      this.tray--;
      this.give(want, 'fries', { st: 'fryer', slot: this.tray });
      return true;
    }
    if (this.fryer.s === 'idle' && this.tray < this.trayMax) {
      this.fryer = { s: 'fry', t: 0 };
      this.events.push({ type: 'place', at: { st: 'fryer', slot: 0 } });
      return true;
    }
    this.events.push({ type: 'error', st: 'fryer', reason: this.tray > 0 ? 'nobody' : 'busy' });
    return false;
  }

  private veggieAct(): boolean {
    // prefer a plain burger when someone waits for a deluxe one
    const i = this.plates.findIndex((p, k) => k < this.plateCount && p === 'burger');
    if (i < 0) { this.events.push({ type: 'error', st: 'veggie', reason: 'noBurger' }); return false; }
    this.plates[i] = 'deluxe';
    this.events.push({ type: 'veggie', to: i });
    return true;
  }

  /** Tap on a customer: everything ready that they ordered goes to them. */
  serveCustomer(id: number): boolean {
    const c = this.customers.find((o) => o.id === id);
    if (!c || c.phase !== 'seated' || this.over) return false;
    let any = false;
    for (const line of c.order) {
      if (line.done || c.phase !== 'seated') continue;
      const it = line.item;
      if (ITEM_STATION[it] === 'pass') {
        const p = this.plates.findIndex((x, k) => k < this.plateCount && x === it);
        if (p >= 0) { this.plates[p] = null; this.give(c, it, { st: 'pass', slot: p }); any = true; }
      } else if (it === 'fries') {
        if (this.tray > 0) { this.tray--; this.give(c, it, { st: 'fryer', slot: this.tray }); any = true; }
      } else {
        const slots = it === 'soda' ? this.soda : this.cream;
        const f = slots.findIndex((s) => s.s === 'full');
        if (f >= 0) { slots[f] = { s: 'empty', t: 0 }; this.give(c, it, { st: it === 'soda' ? 'soda' : 'cream', slot: f }); any = true; }
      }
    }
    if (!any) this.events.push({ type: 'error', st: 'pass', reason: 'notReady' });
    return any;
  }

  private give(c: Customer, item: Item, from: Ref): void {
    const line = c.order.find((o) => !o.done && o.item === item);
    if (!line) return;
    line.done = true;
    this.events.push({ type: 'serve', from, item, c });
    if (c.order.every((o) => o.done)) this.pay(c);
  }

  private pay(c: Customer): void {
    const base = c.order.reduce((s, o) => s + PRICE[o.item], 0);
    this.combo = this.clock - this.lastServe <= COMBO_WINDOW ? this.combo + 1 : 1;
    this.lastServe = this.clock;
    this.bestCombo = Math.max(this.bestCombo, this.combo);
    const ratio = Math.max(0, c.patience / c.max);
    const mul = 1 + 0.15 * Math.min(this.combo - 1, 5);
    const tip = Math.round(base * (0.06 + 0.36 * ratio) * mul);
    c.phase = 'happy';
    c.t = 0;
    c.paid = base;
    c.tip = tip;
    this.score += base + tip;
    this.wallet += tip;
    this.stats.served++;
    this.stats.earned += base + tip;
    this.stats.tips += tip;
    this.events.push({ type: 'pay', c, base, tip, combo: this.combo });
  }

  // ------------------------------------------------------------------ between days

  /** Stars for the day just finished: share of customers who left happy. */
  dayStars(): number {
    const n = this.stats.served + this.stats.angry;
    if (!n) return 0;
    const r = this.stats.served / n;
    return r >= 0.999 ? 3 : r >= 0.8 ? 2 : r >= 0.5 ? 1 : 0;
  }

  /** Tips for the stars, paid on the result card. */
  starBonus(stars = this.dayStars()): number {
    return [0, 6, 14, 26][stars] + (stars ? (this.day - 1) * 2 : 0);
  }

  /** Closes the day's books: star bonus to the tips and the score, a heart back. */
  closeDay(): { stars: number; bonus: number; heart: boolean } {
    const stars = this.dayStars();
    const bonus = this.starBonus(stars);
    this.wallet += bonus;
    this.score += bonus;
    const heart = stars >= 2 && this.hearts < this.tune.maxHearts;
    if (heart) this.hearts++;
    return { stars, bonus, heart };
  }

  upgradeCost(id: UpgradeId): number | null {
    const u = UPGRADES.find((x) => x.id === id)!;
    const lv = this.levels[id];
    return lv < u.cost.length ? u.cost[lv] : null;
  }

  /** Upgrades the shop offers before day `this.day + 1`. */
  shopList(): UpgradeId[] {
    return UPGRADES.filter((u) => u.day <= this.day + 1).map((u) => u.id);
  }

  buy(id: UpgradeId): boolean {
    const cost = this.upgradeCost(id);
    if (cost === null || cost > this.wallet) return false;
    this.wallet -= cost;
    this.levels[id]++;
    return true;
  }

  /** Rewarded continue: two hearts back and the angriest customers calmed down. */
  revive(): void {
    this.over = false;
    this.hearts = Math.min(this.tune.maxHearts, Math.max(this.hearts, 0) + 2);
    for (const c of this.customers) if (c.phase === 'seated') c.patience = Math.max(c.patience, c.max * 0.6);
    for (const c of this.customers) if (c.phase === 'queue') c.waited = 0;
  }
}
