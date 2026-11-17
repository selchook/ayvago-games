// Sushi Rush: one day at the bar as a pure simulation (no Phaser, no three.js), stepped at a fixed
// rate by the Play scene, the menu's live backdrop and the headless balance bot alike.
//   - The chef walks the aisle between the back counter's stations and the bar. Taps queue actions
//     (up to QUEUE_MAX): a station (with the fridge's fish or the pot's / steamer's dish chosen at
//     tap time) or a seat to serve. Work at a station takes time (chopping, rolling, starting the
//     pot); the pot and the steamer then cook on their own and spoil if left too long.
//   - Customers walk in, sit, order one dish (two from day 5), wait while their patience runs
//     down, eat, pay the price and a tip by the patience left, and leave. A wrong dish costs a few
//     coins and patience; a customer who runs out of patience leaves angry and takes a heart.
//   - The day ends when its timer runs out (goal reached or not) or when the hearts are gone.
// Everything the view and the sounds need comes out as events.
import {
  DISH, STATION, AISLE_MIN, AISLE_MAX, DOOR, STOOL_Z, RABBITS, COOK, CHEF_SPEED, QUEUE_MAX, TIP_MAX, VIP, WRONG, TUNING,
  dayTune, menuOn, fridgeOn, potOn, steamOn, stationsOn, dishOf, seatXs, isFilling, cutOf, CUTTABLE, POT2_DX, STEAM2_DX,
  type Mode, type Item, type DishId, type CookId, type StationId, type FridgeItem, type RabbitId, type DayTune,
} from './defs';
import { mods, type Mods, type Ranks, type CardId } from './powers';

// ------------------------------------------------------------------ randomness

export function mulberry(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ------------------------------------------------------------------ types

export interface Plate { items: Item[]; rolled: boolean; ready: DishId | null }
export const emptyPlate = (): Plate => ({ items: [], rolled: false, ready: null });
export const plateDish = (p: Plate): DishId | null => p.ready ?? dishOf(p.items, p.rolled);
export const plateEmpty = (p: Plate): boolean => !p.ready && !p.items.length;

export type Action =
  | { kind: 'station'; st: StationId; item?: FridgeItem | 'prep'; cook?: CookId }
  | { kind: 'serve'; seat: number };

export type CookState = 'empty' | 'cooking' | 'done' | 'burnt';
export interface Cooker { state: CookState; what: CookId | null; t: number; max: number; portions: number }

export type CustState = 'enter' | 'sit' | 'wait' | 'eat' | 'happy' | 'angry' | 'leave' | 'gone';
export interface Customer {
  id: number;
  seat: number;
  rabbit: RabbitId;
  vip: boolean;
  state: CustState;
  x: number;
  z: number;
  /** Facing (radians, 0 = +z). */
  rot: number;
  t: number;
  patience: number;
  max: number;
  orders: DishId[];
  served: number;
  paid: number;
  bell: boolean;
  /** The path while walking (in or out). */
  path: { x: number; z: number }[];
  wrongs: number;
}

export type ChefState = 'idle' | 'walk' | 'work';

export type DenyReason = 'full' | 'hasRice' | 'hasNori' | 'hasFilling' | 'noCut' | 'cantRoll' | 'needCut' | 'busy' | 'notEmpty' | 'nothing' | 'noDish' | 'noCustomer' | 'queueFull' | 'rolled' | 'notReady' | 'bell';

export type SimEvent =
  | { type: 'arrive'; c: Customer }
  | { type: 'order'; c: Customer }
  | { type: 'serve'; c: Customer; dish: DishId; coins: number; tip: number; golden: boolean; lucky: boolean; streak: number; last: boolean }
  | { type: 'wrong'; c: Customer; dish: DishId; coins: number; forgiven: boolean }
  | { type: 'angry'; c: Customer; forgiven: boolean }
  | { type: 'calm'; c: Customer }
  | { type: 'eatDone'; c: Customer }
  | { type: 'leave'; c: Customer }
  | { type: 'work'; st: StationId; dur: number; slot: number }
  | { type: 'add'; st: StationId; item: Item | DishId }
  | { type: 'cut'; item: Item; spare: boolean }
  | { type: 'roll'; dish: DishId }
  | { type: 'cookStart'; st: 'pot' | 'steamer'; slot: number; what: CookId }
  | { type: 'cookDone'; st: 'pot' | 'steamer'; slot: number }
  | { type: 'burnt'; slot: number }
  | { type: 'take'; st: 'pot' | 'steamer'; slot: number; what: CookId }
  | { type: 'dump'; slot: number }
  | { type: 'deny'; why: DenyReason; st?: StationId; seat?: number }
  | { type: 'bin'; had: DishId | null }
  | { type: 'heart'; left: number }
  | { type: 'zen' }
  | { type: 'bell' }
  | { type: 'queue' }
  | { type: 'end'; won: boolean; why: 'time' | 'hearts' };

/** What lasts between the days of a run. */
export interface RunState {
  mode: Mode;
  day: number;
  /** Total earnings of the run (the score). */
  earned: number;
  cards: CardId[];
  ranks: Ranks;
  seed: number;
  /** Totals of the run. */
  served: number;
  tips: number;
}

export interface DayStats { served: number; tips: number; coins: number; wrong: number; lost: number; best: Partial<Record<DishId, number>>; vips: number; maxStreak: number }

// ------------------------------------------------------------------ the day

export class Day {
  readonly tune: DayTune;
  readonly m: Mods;
  readonly rnd: () => number;
  readonly events: SimEvent[] = [];
  readonly menu: DishId[];
  readonly fridge: FridgeItem[];
  readonly pots: CookId[];
  readonly steams: CookId[];
  readonly stations: StationId[];
  time = 0;
  length: number;
  coins = 0;
  goal: number;
  hearts: number;
  maxHearts: number;
  over = false;
  won = false;
  why: 'time' | 'hearts' | null = null;
  /** Paused by an overlay (the view keeps drawing). */
  frozen = false;

  // the chef
  chef = { x: STATION.mat.x, target: STATION.mat.x, face: 'back' as 'back' | 'front', state: 'idle' as ChefState, workT: 0, workMax: 0, action: null as Action | null, speed: 0, dashing: false };
  plate: Plate = emptyPlate();
  queue: Action[] = [];
  /** The spare cut slice on the board (Sharp Knife II). */
  spare: Item | null = null;
  potSlots: Cooker[];
  basketSlots: Cooker[];
  prepLeft: number;

  // customers
  seats: number;
  seatX: number[];
  occupant: (Customer | null)[];
  customers: Customer[] = [];
  private nextId = 1;
  private nextSpawn = 1.2;
  private vipTimes: number[] = [];
  bellCd = 0;
  private bellNext = false;
  zenT = 0;
  private zenUsed = false;
  private teapotUsed = false;
  private catUsed = false;
  private lastServe = -99;
  streak = 0;
  private servedCount = 0;
  readonly stats: DayStats = { served: 0, tips: 0, coins: 0, wrong: 0, lost: 0, best: {}, vips: 0, maxStreak: 0 };

  constructor(readonly run: RunState, seed: number) {
    this.rnd = mulberry(seed);
    this.m = mods(run.ranks, run.cards);
    this.tune = dayTune(run.day, run.mode);
    this.length = this.tune.length + this.m.overtime;
    this.goal = this.tune.goal;
    this.maxHearts = TUNING[run.mode].hearts + this.m.hearts;
    this.hearts = this.maxHearts;
    this.menu = menuOn(run.day).map((d) => d.id);
    this.fridge = fridgeOn(run.day);
    this.pots = potOn(run.day);
    this.steams = steamOn(run.day);
    this.stations = stationsOn(run.day);
    this.potSlots = Array.from({ length: this.m.pots }, () => this.cooker());
    this.basketSlots = Array.from({ length: this.m.baskets }, () => this.cooker());
    this.prepLeft = this.m.prep;
    this.seats = this.m.seats;
    this.seatX = seatXs(this.seats);
    this.occupant = new Array(this.seats).fill(null);
    if (this.m.autoRice) this.plate.items = ['rice'];
    // the VIP critics' arrival times, spread over the day
    const vips = this.tune.vips + (this.m.critic && run.day >= 2 ? 1 : 0);
    for (let i = 0; i < vips; i++) this.vipTimes.push(this.length * (0.2 + 0.65 * (i + this.rnd() * 0.6) / Math.max(1, vips)));
  }

  private cooker(): Cooker { return { state: 'empty', what: null, t: 0, max: 0, portions: 0 }; }

  get timeLeft(): number { return Math.max(0, this.length - this.time); }
  /** The ready roll Prep Ahead hands out (the best roll on today's menu). */
  get prepDish(): DishId {
    for (const d of ['uniroll', 'sakeroll', 'kappa', 'onigiri'] as DishId[]) if (this.menu.includes(d)) return d;
    return 'onigiri';
  }

  // ---------------------------------------------------------------- input

  /** Queues an action (false when it cannot be done: a deny event says why). */
  tap(a: Action): boolean {
    if (this.over) return false;
    if (this.queue.length >= QUEUE_MAX) { this.deny('queueFull'); return false; }
    const why = this.check(a, this.projected());
    if (why) { this.deny(why, a.kind === 'station' ? a.st : undefined, a.kind === 'serve' ? a.seat : undefined); return false; }
    this.queue.push(a);
    this.events.push({ type: 'queue' });
    return true;
  }

  /** Throws the plate away at once (no walk). */
  bin(): void {
    if (this.over) return;
    if (plateEmpty(this.plate) || (this.m.autoRice && this.plate.items.length === 1 && this.plate.items[0] === 'rice' && !this.plate.ready)) { this.deny('nothing'); return; }
    const had = plateDish(this.plate);
    this.freshPlate();
    // what was queued for that plate goes too
    this.queue = this.queue.filter((q) => q.kind === 'station' && (q.st === 'pot' || q.st === 'steamer'));
    this.events.push({ type: 'bin', had });
  }

  /** Rings the bell (Bell II): the next customer comes now. */
  ringBell(): boolean {
    if (!this.m.bell || this.over) return false;
    if (this.bellCd > 0 || !this.occupant.some((o) => !o) || this.time > this.length - 8) { this.deny('bell'); return false; }
    this.bellCd = 12;
    this.bellNext = true;
    this.nextSpawn = this.time;
    this.events.push({ type: 'bell' });
    return true;
  }

  /** The cooker (pot or basket) an action at the pot / steamer would use, and what it would do. */
  cookerPlan(st: 'pot' | 'steamer', a: { cook?: CookId }): { slot: number; act: 'take' | 'dump' | 'start' } | null {
    const slots = st === 'pot' ? this.potSlots : this.basketSlots;
    const ready = slots.findIndex((s) => s.state === 'done');
    const burnt = slots.findIndex((s) => s.state === 'burnt');
    const free = slots.findIndex((s) => s.state === 'empty');
    if (a.cook) return free >= 0 ? { slot: free, act: 'start' } : null;
    if (ready >= 0) return { slot: ready, act: 'take' };
    if (burnt >= 0) return { slot: burnt, act: 'dump' };
    return null;
  }

  /** The plate as it will be after the queued actions (for checks at tap time). */
  projected(): Plate {
    const p: Plate = { items: [...this.plate.items], rolled: this.plate.rolled, ready: this.plate.ready };
    const acts = this.chef.action ? [this.chef.action, ...this.queue] : this.queue;
    for (const a of acts) this.applyTo(p, a, true);
    return p;
  }

  /** Why an action cannot be done on plate p (null: it can). */
  check(a: Action, p: Plate): DenyReason | null {
    if (a.kind === 'serve') {
      const c = this.occupant[a.seat];
      if (!c || (c.state !== 'wait' && c.state !== 'sit' && c.state !== 'enter')) return 'noCustomer';
      if (!plateDish(p)) return 'noDish';
      return null;
    }
    const riceOnly = !p.ready && p.items.length === 1 && p.items[0] === 'rice' && !p.rolled;
    switch (a.st) {
      case 'rice':
        if (p.ready) return 'notEmpty';
        if (p.rolled) return 'rolled';
        if (p.items.includes('rice')) return 'hasRice';
        return null;
      case 'nori':
        if (p.ready) return 'notEmpty';
        if (p.rolled) return 'rolled';
        if (p.items.includes('nori')) return 'hasNori';
        return null;
      case 'fridge':
        if (a.item === 'prep') return plateEmpty(p) || riceOnly ? null : 'notEmpty';
        if (p.ready) return 'notEmpty';
        if (p.rolled) return 'rolled';
        if (p.items.some(isFilling)) return 'hasFilling';
        return null;
      case 'knife':
        if (p.ready || p.rolled) return p.ready ? 'notEmpty' : 'rolled';
        if (p.items.some((i) => CUTTABLE.includes(i))) return null;
        if (this.spare && !p.items.some(isFilling)) return null;
        return 'noCut';
      case 'mat': {
        if (p.ready) return 'notEmpty';
        if (p.rolled) return 'rolled';
        if (dishOf(p.items, true)) return null;
        if (p.items.some((i) => CUTTABLE.includes(i))) return 'needCut';
        return 'cantRoll';
      }
      case 'pot': case 'steamer': {
        const plan = this.cookerPlan(a.st, a);
        if (!plan) return a.cook ? 'busy' : 'notReady';
        if (plan.act === 'take' && !(plateEmpty(p) || riceOnly)) return 'notEmpty';
        return null;
      }
    }
    return null;
  }

  /** Applies a station action to a plate (dry: only the plate, for the projection). */
  private applyTo(p: Plate, a: Action, dry: boolean): void {
    if (a.kind === 'serve') {
      const c = this.occupant[a.seat];
      const d = plateDish(p);
      if (c && d && c.orders.slice(c.served).includes(d)) { p.items = this.m.autoRice ? ['rice'] : []; p.rolled = false; p.ready = null; }
      return;
    }
    switch (a.st) {
      case 'rice': p.items.push('rice'); break;
      case 'nori': p.items.push('nori'); break;
      case 'fridge':
        if (a.item === 'prep') { p.items = []; p.ready = this.prepDish; }
        else if (a.item) p.items.push(a.item);
        break;
      case 'knife': {
        const i = p.items.findIndex((x) => CUTTABLE.includes(x));
        if (i >= 0) p.items[i] = cutOf(p.items[i]);
        else if (dry && this.spare) p.items.push(this.spare);
        break;
      }
      case 'mat': p.rolled = true; break;
      case 'pot': case 'steamer': {
        if (a.cook) break;
        if (dry) {
          const slots = a.st === 'pot' ? this.potSlots : this.basketSlots;
          const s = slots.find((x) => x.state === 'done' || x.state === 'cooking');
          if (s?.what) { p.items = []; p.rolled = false; p.ready = s.what; }
        }
        break;
      }
    }
  }

  private deny(why: DenyReason, st?: StationId, seat?: number): void { this.events.push({ type: 'deny', why, st, seat }); }

  private freshPlate(): void {
    this.plate = emptyPlate();
    if (this.m.autoRice) this.plate.items = ['rice'];
  }

  // ---------------------------------------------------------------- the step

  step(dt: number): void {
    if (this.over || this.frozen) return;
    this.time += dt;
    this.bellCd = Math.max(0, this.bellCd - dt);
    this.zenT = Math.max(0, this.zenT - dt);
    this.stepChef(dt);
    this.stepCookers(dt);
    this.stepCustomers(dt);
    this.spawn();
    if (this.time >= this.length) this.finish('time');
  }

  private stepChef(dt: number): void {
    const ch = this.chef;
    if (!ch.action && this.queue.length) {
      ch.action = this.queue.shift()!;
      const a = ch.action;
      ch.target = a.kind === 'serve' ? this.seatX[a.seat] : this.stationX(a.st, a);
      ch.target = Math.max(AISLE_MIN, Math.min(AISLE_MAX, ch.target));
      ch.state = 'walk';
    }
    if (ch.state === 'walk') {
      const d = ch.target - ch.x;
      const far = Math.abs(d) > 3.5;
      ch.dashing = this.m.dash && far;
      ch.speed = CHEF_SPEED * this.m.speed * (ch.dashing ? 1.45 : 1);
      const stepX = ch.speed * dt;
      if (Math.abs(d) <= stepX) {
        ch.x = ch.target;
        this.arrive();
      } else ch.x += Math.sign(d) * stepX;
    } else if (ch.state === 'work') {
      ch.speed = 0;
      ch.workT -= dt;
      if (ch.workT <= 0) this.finishWork();
    } else ch.speed = 0;
  }

  /** Where the chef stands for a station action (the second pot / basket stands aside). */
  stationX(st: StationId, a: { cook?: CookId }): number {
    let x = STATION[st].x;
    if (st === 'pot' || st === 'steamer') {
      const plan = this.cookerPlan(st, a);
      if (plan && plan.slot === 1) x += st === 'pot' ? POT2_DX : STEAM2_DX;
    }
    return x;
  }

  /** The chef reached the target: check the action again and start its work. */
  private arrive(): void {
    const ch = this.chef, a = ch.action!;
    if (a.kind === 'serve') { ch.face = 'front'; this.serve(a.seat); ch.action = null; ch.state = 'idle'; return; }
    ch.face = 'back';
    const why = this.check(a, this.plate);
    if (why) { this.deny(why, a.st); ch.action = null; ch.state = 'idle'; return; }
    let dur = STATION[a.st].work * this.m.work;
    if (a.st === 'knife') {
      const hasRaw = this.plate.items.some((i) => CUTTABLE.includes(i));
      dur = !hasRaw ? 0.25 : this.m.instantChop ? 0.18 : dur * this.m.chop;
    }
    if (a.st === 'rice' && this.m.riceInstant) dur = 0.12;
    if ((a.st === 'pot' || a.st === 'steamer') && !a.cook) dur = 0.3;
    ch.state = 'work';
    ch.workT = ch.workMax = dur;
    let slot = 0;
    if (a.st === 'pot' || a.st === 'steamer') slot = this.cookerPlan(a.st, a)?.slot ?? 0;
    this.events.push({ type: 'work', st: a.st, dur, slot });
  }

  private finishWork(): void {
    const ch = this.chef, a = ch.action as Extract<Action, { kind: 'station' }>;
    ch.action = null;
    ch.state = 'idle';
    const why = this.check(a, this.plate);
    if (why) { this.deny(why, a.st); return; }
    const p = this.plate;
    switch (a.st) {
      case 'rice': p.items.push('rice'); this.events.push({ type: 'add', st: 'rice', item: 'rice' }); break;
      case 'nori': p.items.push('nori'); this.events.push({ type: 'add', st: 'nori', item: 'nori' }); break;
      case 'fridge':
        if (a.item === 'prep') { this.prepLeft--; p.items = []; p.ready = this.prepDish; this.events.push({ type: 'add', st: 'fridge', item: p.ready }); }
        else if (a.item) { p.items.push(a.item); this.events.push({ type: 'add', st: 'fridge', item: a.item }); }
        break;
      case 'knife': {
        const i = p.items.findIndex((x) => CUTTABLE.includes(x));
        if (i >= 0) {
          const raw = p.items[i];
          p.items[i] = cutOf(raw);
          const spare = this.m.spareSlice && !this.spare;
          if (spare) this.spare = cutOf(raw);
          this.events.push({ type: 'cut', item: cutOf(raw), spare });
        } else if (this.spare) {
          p.items.push(this.spare);
          this.events.push({ type: 'add', st: 'knife', item: this.spare });
          this.spare = null;
        }
        break;
      }
      case 'mat': p.rolled = true; this.events.push({ type: 'roll', dish: plateDish(p)! }); break;
      case 'pot': case 'steamer': {
        const plan = this.cookerPlan(a.st, a)!;
        const s = (a.st === 'pot' ? this.potSlots : this.basketSlots)[plan.slot];
        if (plan.act === 'start') {
          s.state = 'cooking';
          s.what = a.cook!;
          s.max = (a.st === 'pot' ? COOK.pot * this.m.cookPot : COOK.steamer * this.m.cookSteam) * this.m.work;
          s.t = s.max;
          s.portions = a.st === 'steamer' && this.m.steamTwo ? 2 : 1;
          this.events.push({ type: 'cookStart', st: a.st, slot: plan.slot, what: a.cook! });
        } else if (plan.act === 'take') {
          p.items = []; p.rolled = false; p.ready = s.what;
          this.events.push({ type: 'take', st: a.st, slot: plan.slot, what: s.what! });
          s.portions--;
          if (s.portions <= 0) { s.state = 'empty'; s.what = null; }
          else s.t = COOK.keep;
        } else {
          s.state = 'empty'; s.what = null;
          this.events.push({ type: 'dump', slot: plan.slot });
        }
        break;
      }
    }
  }

  private stepCookers(dt: number): void {
    for (const [st, slots] of [['pot', this.potSlots], ['steamer', this.basketSlots]] as ['pot' | 'steamer', Cooker[]][]) {
      slots.forEach((s, i) => {
        if (s.state === 'cooking') {
          s.t -= dt;
          if (s.t <= 0) { s.state = 'done'; s.t = COOK.keep; this.events.push({ type: 'cookDone', st, slot: i }); }
        } else if (s.state === 'done' && st === 'pot' && !this.m.noBurn) {
          s.t -= dt;
          if (s.t <= 0) { s.state = 'burnt'; this.events.push({ type: 'burnt', slot: i }); }
        }
      });
    }
  }

  // ---------------------------------------------------------------- customers

  private spawn(): void {
    if (this.time < this.nextSpawn || this.time > this.length - 7) return;
    const free = this.occupant.map((o, i) => (o ? -1 : i)).filter((i) => i >= 0);
    if (!free.length) return;
    const seat = free[Math.floor(this.rnd() * free.length)];
    const vip = this.vipTimes.length > 0 && this.time >= this.vipTimes[0];
    if (vip) this.vipTimes.shift();
    const used = new Set(this.customers.filter((c) => c.state !== 'gone').map((c) => c.rabbit));
    const pool = RABBITS.filter((r) => !used.has(r));
    const rabbit = (pool.length ? pool : RABBITS)[Math.floor(this.rnd() * (pool.length || RABBITS.length))];
    const double = this.rnd() < this.tune.double + (this.m.doubleOrder ? 0.25 : 0);
    const orders = [this.pickDish()];
    if (double || (vip && this.run.day >= 6)) orders.push(this.pickDish());
    const max = this.tune.patience * this.m.patience * (vip ? VIP.patience : 1) * (orders.length > 1 ? 1.45 : 1);
    const x = this.seatX[seat];
    const c: Customer = {
      id: this.nextId++, seat, rabbit, vip, state: 'enter', x: DOOR.x, z: DOOR.z, rot: Math.PI / 2, t: 0,
      patience: 1, max, orders, served: 0, paid: 0, bell: this.bellNext, wrongs: 0,
      path: [{ x: DOOR.x + 1.6, z: DOOR.z + 0.4 }, { x: DOOR.x + 2.6, z: STOOL_Z + 1.5 }, { x, z: STOOL_Z + 1.5 }, { x, z: STOOL_Z + 0.05 }],
    };
    this.bellNext = false;
    this.occupant[seat] = c;
    this.customers.push(c);
    if (vip) this.stats.vips++;
    this.events.push({ type: 'arrive', c });
    const gap = this.tune.gap * this.m.arrive;
    this.nextSpawn = this.time + gap * (0.75 + this.rnd() * 0.5);
  }

  /** A dish from today's menu (today's new dishes twice as likely). */
  private pickDish(): DishId {
    const w = this.menu.map((d) => (DISH[d].day === this.run.day && this.run.day > 1 ? 2 : 1));
    let x = this.rnd() * w.reduce((s, v) => s + v, 0);
    for (let i = 0; i < w.length; i++) { x -= w[i]; if (x <= 0) return this.menu[i]; }
    return this.menu[0];
  }

  private stepCustomers(dt: number): void {
    // Zen Tea: once a day, when someone is about to give up, everyone's patience stops for 8 s
    if (this.m.zenTea && !this.zenUsed && this.customers.some((c) => c.state === 'wait' && c.patience < 0.25)) {
      this.zenUsed = true;
      this.zenT = 8;
      this.events.push({ type: 'zen' });
    }
    for (const c of this.customers) {
      c.t += dt;
      switch (c.state) {
        case 'enter':
          if (this.walk(c, dt, 3.4)) { c.state = 'sit'; c.t = 0; c.rot = Math.PI; }
          break;
        case 'sit':
          if (c.t >= 0.45) { c.state = 'wait'; c.t = 0; this.events.push({ type: 'order', c }); }
          break;
        case 'wait':
          if (this.zenT <= 0) c.patience -= (dt * this.m.drain) / c.max;
          if (c.patience <= 0) {
            if (this.m.teapot && !this.teapotUsed) {
              this.teapotUsed = true;
              c.patience = 0.6;
              this.events.push({ type: 'calm', c });
              break;
            }
            c.patience = 0;
            c.state = 'angry';
            c.t = 0;
            this.stats.lost++;
            const forgiven = this.forgive();
            this.events.push({ type: 'angry', c, forgiven });
            if (!forgiven) {
              this.hearts--;
              this.events.push({ type: 'heart', left: this.hearts });
              if (this.hearts <= 0) this.finish('hearts');
            }
          }
          break;
        case 'eat':
          if (c.t >= 2.6) { c.state = 'happy'; c.t = 0; this.events.push({ type: 'eatDone', c }); }
          break;
        case 'happy':
          if (c.t >= 1.5) this.leave(c);
          break;
        case 'angry':
          if (c.t >= 1.3) this.leave(c);
          break;
        case 'leave':
          if (this.walk(c, dt, c.patience <= 0 ? 4.6 : 3.4)) { c.state = 'gone'; this.events.push({ type: 'leave', c }); }
          break;
      }
    }
    this.customers = this.customers.filter((c) => c.state !== 'gone' || c.t < 0.1);
  }

  private leave(c: Customer): void {
    c.state = 'leave';
    c.t = 0;
    if (this.occupant[c.seat] === c) this.occupant[c.seat] = null;
    c.path = [{ x: c.x, z: STOOL_Z + 1.5 }, { x: DOOR.x + 2.6, z: STOOL_Z + 1.5 }, { x: DOOR.x + 1.6, z: DOOR.z + 0.4 }, { x: DOOR.x - 1.5, z: DOOR.z }];
  }

  /** Walks a customer along its path; true when it is done. */
  private walk(c: Customer, dt: number, speed: number): boolean {
    let left = speed * dt;
    while (left > 0 && c.path.length) {
      const p = c.path[0];
      const dx = p.x - c.x, dz = p.z - c.z, d = Math.hypot(dx, dz);
      if (d > 1e-4) c.rot = Math.atan2(dx, dz);
      if (d <= left) { c.x = p.x; c.z = p.z; left -= d; c.path.shift(); }
      else { c.x += (dx / d) * left; c.z += (dz / d) * left; left = 0; }
    }
    return c.path.length === 0;
  }

  /** Lucky Cat: the first mistake of the day is forgiven. */
  private forgive(): boolean {
    if (this.m.luckyCat && !this.catUsed) { this.catUsed = true; return true; }
    return false;
  }

  private serve(seat: number): void {
    const c = this.occupant[seat];
    const dish = plateDish(this.plate);
    if (!c || (c.state !== 'wait')) { this.deny('noCustomer', undefined, seat); return; }
    if (!dish) { this.deny('noDish', undefined, seat); return; }
    const want = c.orders.slice(c.served);
    if (!want.includes(dish)) {
      c.wrongs++;
      this.stats.wrong++;
      const forgiven = this.forgive();
      const lose = forgiven ? 0 : Math.min(this.coins, WRONG.coins);
      if (!forgiven) { c.patience = Math.max(0.02, c.patience - WRONG.patience); this.coins -= lose; this.run.earned -= lose; }
      this.events.push({ type: 'wrong', c, dish, coins: lose, forgiven });
      return;
    }
    // put the served dish first among what is left, so `served` counts from the front
    const k = c.orders.indexOf(dish, c.served);
    [c.orders[c.served], c.orders[k]] = [c.orders[k], c.orders[c.served]];
    c.served++;
    const pay = this.payFor(c, dish);
    this.coins += pay.coins + pay.tip;
    this.run.earned += pay.coins + pay.tip;
    this.run.served++;
    this.run.tips += pay.tip;
    c.paid += pay.coins + pay.tip;
    this.stats.served++;
    this.stats.tips += pay.tip;
    this.stats.coins += pay.coins + pay.tip;
    this.stats.best[dish] = (this.stats.best[dish] ?? 0) + 1;
    this.stats.maxStreak = Math.max(this.stats.maxStreak, this.streak);
    const last = c.served >= c.orders.length;
    if (last) { c.state = 'eat'; c.t = 0; }
    else c.patience = Math.min(1, c.patience + 0.35);
    this.freshPlate();
    this.events.push({ type: 'serve', c, dish, coins: pay.coins, tip: pay.tip, golden: pay.golden, lucky: pay.lucky, streak: this.streak, last });
  }

  /** The price and the tip of a dish served to c now. Card and upgrade bonuses add up (they do not multiply). */
  private payFor(c: Customer, dish: DishId): { coins: number; tip: number; golden: boolean; lucky: boolean } {
    const d = DISH[dish], m = this.m;
    let base = d.price * (c.vip ? VIP.price : 1);
    if (d.items?.includes('rice')) base += m.ricePay;
    base += m.flat;
    let payK = m.pay - 1;
    if (d.items?.some((i) => i.startsWith('tuna') || i.startsWith('salmon') || i.startsWith('ebi') || i.startsWith('octo') || i === 'urchin')) payK += m.fishPay - 1;
    if (d.cook === 'pot') payK += m.noodlePay - 1;
    if (m.goldenHour && this.timeLeft < 30) payK += 0.4;
    // a quick serve after the last one builds the streak (Streak card: +8 % a step)
    this.streak = this.time - this.lastServe < 6 ? this.streak + 1 : 0;
    this.lastServe = this.time;
    if (m.streak) payK += Math.min(5, this.streak) * 0.08;
    let tipK = m.tips - 1;
    if (m.happyHour && this.time < 30) tipK += 1;
    if (m.bellTip && c.bell) tipK += 0.5;
    const tip = d.price * TIP_MAX * (m.feast ? 1 : c.patience) * (1 + tipK) * (c.vip ? VIP.tip : 1);
    let k = 1 + payK;
    this.servedCount++;
    const golden = m.goldenPlate && this.servedCount % 5 === 0;
    if (golden) k *= 2;
    const lucky = m.luckyCoins && this.rnd() < 0.12;
    if (lucky) k *= 2;
    return { coins: Math.round(base * k), tip: Math.round(tip * (golden ? 2 : 1)), golden, lucky };
  }

  private finish(why: 'time' | 'hearts'): void {
    if (this.over) return;
    this.over = true;
    this.why = why;
    this.won = why === 'time' && this.coins >= this.goal;
    this.events.push({ type: 'end', won: this.won, why });
  }

  /** A continue (rewarded ad): hearts back or 30 more seconds. */
  revive(): void {
    if (!this.over) return;
    this.over = false;
    if (this.why === 'hearts') { this.hearts = Math.max(2, Math.ceil(this.maxHearts / 2)); }
    else this.length = this.time + 30;
    // the angry ones are gone; the waiting ones get a breath
    for (const c of this.customers) if (c.state === 'wait') c.patience = Math.max(c.patience, 0.6);
    this.why = null;
    this.won = false;
  }

  /** Stations that move some waiting order on (the glow hints). */
  usefulStations(): Set<StationId> {
    const out = new Set<StationId>();
    const p = this.projected();
    const want = new Set<DishId>();
    for (const c of this.customers) if (c.state === 'wait' || c.state === 'sit') for (const d of c.orders.slice(c.served)) want.add(d);
    const pd = plateDish(p);
    if (pd && want.has(pd)) return out;
    for (const d of want) {
      const def = DISH[d];
      for (const s of def.steps) {
        const a: Action = { kind: 'station', st: s.st, item: s.item, cook: def.cook ? d as CookId : undefined };
        if (s.st === 'pot' || s.st === 'steamer') {
          const slots = s.st === 'pot' ? this.potSlots : this.basketSlots;
          if (slots.some((x) => x.state === 'done' || x.state === 'burnt') || slots.some((x) => x.state === 'empty')) out.add(s.st);
          continue;
        }
        if (!this.check(a, p)) {
          // only if it fits this dish: the plate's contents are a subset of the dish's
          if (def.items && p.items.every((i) => def.items!.includes(i) || (CUTTABLE.includes(i) && def.items!.includes(cutOf(i))))) out.add(s.st);
        }
      }
    }
    return out;
  }
}
