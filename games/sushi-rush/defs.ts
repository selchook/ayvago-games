// Sushi Rush: the game's data, shared by the simulation, the view, the bot and the screens.
//   - The bar: stations along the back counter (rice, nori, the fish fridge, the cutting board,
//     the rolling mat, the noodle pot, the steamer), the chef's aisle, the front bar with its
//     stools. World units are the kit's (a counter is 4 wide); +z points at the dining room.
//   - The plate: what the chef holds. Ingredients are added at the stations, cut on the board and
//     rolled on the mat; whenever the plate matches a dish it is that dish (a plate of rice and cut
//     tuna IS maguro nigiri). Noodles and steamed dishes come out of their pot or basket ready.
//   - Days: each day has a timer and a coin goal; the menu grows over the days and customers get
//     less patient. Easy keeps Normal's curve but with more patience and fewer customers.

export type Mode = 'easy' | 'normal';
export const DT = 1 / 60;

// ------------------------------------------------------------------ the bar's layout

/** The back counter's centre line, the chef's aisle, the front bar's centre line and the stools (z). */
export const BACK_Z = -5.35;
export const AISLE_Z = -3.4;
export const BAR_Z = -1.62;
export const STOOL_Z = 0.85;
/** The aisle's ends (the chef stays between them). */
export const AISLE_MIN = -9.6, AISLE_MAX = 10;
/** Where customers come in and leave (the door on the left wall). */
export const DOOR = { x: -12.6, z: 0.2 };

export type StationId = 'rice' | 'nori' | 'fridge' | 'knife' | 'mat' | 'pot' | 'steamer';
export const STATION_IDS: StationId[] = ['fridge', 'rice', 'nori', 'knife', 'mat', 'pot', 'steamer'];
/** Station x along the back counter, its key (1–7) and how long its work takes (seconds, before upgrades). */
export const STATION: Record<StationId, { x: number; key: number; work: number }> = {
  fridge: { x: -9.1, key: 1, work: 0.35 },
  rice: { x: -6.0, key: 2, work: 0.45 },
  nori: { x: -3.6, key: 3, work: 0.3 },
  knife: { x: -1.0, key: 4, work: 1.15 },
  mat: { x: 1.9, key: 5, work: 1.0 },
  pot: { x: 5.6, key: 6, work: 0.6 },
  steamer: { x: 9.0, key: 7, work: 0.5 },
};
/** The second pot and the second steamer basket (upgrades) stand a little to the side. */
export const POT2_DX = 1.05, STEAM2_DX = -1.15;

/** Stool x for n seats along the bar. */
export function seatXs(n: number): number[] {
  const gap = n <= 4 ? 3.1 : n === 5 ? 2.9 : n === 6 ? 2.75 : 2.6;
  return Array.from({ length: n }, (_, i) => (i - (n - 1) / 2) * gap);
}
export const MAX_SEATS = 7;

// ------------------------------------------------------------------ ingredients and dishes

/** What can be on a plate. `-cut` forms come off the cutting board. */
export type Item =
  | 'rice' | 'nori'
  | 'tuna' | 'salmon' | 'ebi' | 'octo' | 'cucumber' | 'urchin'
  | 'tuna-cut' | 'salmon-cut' | 'ebi-cut' | 'octo-cut' | 'cucumber-cut';
/** What the fridge hands out. */
export type FridgeItem = 'tuna' | 'salmon' | 'ebi' | 'octo' | 'cucumber' | 'urchin';
export const FRIDGE_ITEMS: FridgeItem[] = ['tuna', 'salmon', 'cucumber', 'ebi', 'octo', 'urchin'];
export const CUTTABLE: Item[] = ['tuna', 'salmon', 'ebi', 'octo', 'cucumber'];
export const isFilling = (i: Item): boolean => i !== 'rice' && i !== 'nori';
export const cutOf = (i: Item): Item => (CUTTABLE.includes(i) ? (i + '-cut') as Item : i);

export type CookId = 'ramen' | 'udon' | 'gyoza' | 'chukaman' | 'dango';
export type DishId =
  | 'onigiri' | 'maguro' | 'sake' | 'ebi' | 'tako' | 'kappa' | 'sakeroll' | 'uniroll'
  | CookId;

export interface DishDef {
  id: DishId;
  /** The kit model drawn for it (and its icon). */
  model: string;
  /** Plate contents (sorted) + rolled, for the plate dishes. */
  items?: Item[];
  rolled?: boolean;
  /** Made in the pot or the steamer. */
  cook?: 'pot' | 'steamer';
  price: number;
  /** First day on the menu. */
  day: number;
  /** The recipe's steps, for the recipe card and the bot (station, and the fridge item). */
  steps: { st: StationId; item?: FridgeItem }[];
}

const D = (id: DishId, model: string, price: number, day: number, steps: DishDef['steps'], o: Partial<DishDef> = {}): DishDef => ({ id, model, price, day, steps, ...o });

export const DISHES: DishDef[] = [
  D('maguro', 'maguro-nigiri', 9, 1, [{ st: 'rice' }, { st: 'fridge', item: 'tuna' }, { st: 'knife' }], { items: ['rice', 'tuna-cut'] }),
  D('onigiri', 'onigiri', 8, 1, [{ st: 'rice' }, { st: 'nori' }, { st: 'mat' }], { items: ['nori', 'rice'], rolled: true }),
  D('sake', 'salmon-nigiri', 10, 2, [{ st: 'rice' }, { st: 'fridge', item: 'salmon' }, { st: 'knife' }], { items: ['rice', 'salmon-cut'] }),
  D('kappa', 'roll', 13, 2, [{ st: 'rice' }, { st: 'nori' }, { st: 'fridge', item: 'cucumber' }, { st: 'knife' }, { st: 'mat' }], { items: ['cucumber-cut', 'nori', 'rice'], rolled: true }),
  D('ramen', 'ramen', 15, 3, [{ st: 'pot' }], { cook: 'pot' }),
  D('gyoza', 'gyoza', 12, 4, [{ st: 'steamer' }], { cook: 'steamer' }),
  D('ebi', 'ebi-nigiri', 12, 4, [{ st: 'rice' }, { st: 'fridge', item: 'ebi' }, { st: 'knife' }], { items: ['ebi-cut', 'rice'] }),
  D('sakeroll', 'salmon-roll', 16, 5, [{ st: 'rice' }, { st: 'nori' }, { st: 'fridge', item: 'salmon' }, { st: 'knife' }, { st: 'mat' }], { items: ['nori', 'rice', 'salmon-cut'], rolled: true }),
  D('udon', 'udon', 15, 5, [{ st: 'pot' }], { cook: 'pot' }),
  D('chukaman', 'chukaman', 12, 6, [{ st: 'steamer' }], { cook: 'steamer' }),
  D('tako', 'octopus-nigiri', 14, 6, [{ st: 'rice' }, { st: 'fridge', item: 'octo' }, { st: 'knife' }], { items: ['octo-cut', 'rice'] }),
  D('uniroll', 'urchin-roll', 20, 7, [{ st: 'rice' }, { st: 'nori' }, { st: 'fridge', item: 'urchin' }, { st: 'mat' }], { items: ['nori', 'rice', 'urchin'], rolled: true }),
  D('dango', 'dango', 13, 7, [{ st: 'steamer' }], { cook: 'steamer' }),
];
export const DISH: Record<DishId, DishDef> = Object.fromEntries(DISHES.map((d) => [d.id, d])) as Record<DishId, DishDef>;
export const DISH_IDS = DISHES.map((d) => d.id);
export const POT_DISHES: CookId[] = ['ramen', 'udon'];
export const STEAM_DISHES: CookId[] = ['gyoza', 'chukaman', 'dango'];

/** The dishes on the menu on a day. */
export const menuOn = (day: number): DishDef[] => DISHES.filter((d) => d.day <= day);
/** The fridge items needed by a day's menu. */
export function fridgeOn(day: number): FridgeItem[] {
  const need = new Set<FridgeItem>();
  for (const d of menuOn(day)) for (const s of d.steps) if (s.item) need.add(s.item);
  return FRIDGE_ITEMS.filter((i) => need.has(i));
}
export const potOn = (day: number): CookId[] => POT_DISHES.filter((c) => DISH[c].day <= day);
export const steamOn = (day: number): CookId[] => STEAM_DISHES.filter((c) => DISH[c].day <= day);
/** Stations in use on a day. */
export function stationsOn(day: number): StationId[] {
  const s = new Set<StationId>();
  for (const d of menuOn(day)) for (const st of d.steps) s.add(st.st);
  return STATION_IDS.filter((x) => s.has(x));
}

/** The dish a plate is now (or null): contents compared as a set, plus rolled. */
export function dishOf(items: Item[], rolled: boolean): DishId | null {
  const key = [...items].sort().join('+');
  for (const d of DISHES) if (d.items && !!d.rolled === rolled && [...d.items].sort().join('+') === key) return d.id;
  return null;
}

// ------------------------------------------------------------------ customers

/** The seven rabbits (rabbits.glb's bodies). */
export const RABBITS = ['bald', 'blond', 'cyan', 'green', 'grey', 'pink', 'purple'] as const;
export type RabbitId = (typeof RABBITS)[number];

/** The chefs: the panda and four knife-holding rabbits. */
export const CHEF_IDS = ['panda', 'cyan', 'blond', 'purple', 'grey'] as const;
export type ChefId = (typeof CHEF_IDS)[number];

// ------------------------------------------------------------------ days and difficulty

export interface DayTune {
  /** Seconds the day lasts. */
  length: number;
  /** Coins to earn today. */
  goal: number;
  /** Seconds a customer waits for the order (full patience). */
  patience: number;
  /** Seconds between arrivals (when a stool is free). */
  gap: number;
  /** Chance a customer orders two dishes (from day 5). */
  double: number;
  /** VIP critics today. */
  vips: number;
}

/** Normal and Easy side by side (§7c). */
export const TUNING = {
  normal: { patience: 1, gap: 1, hearts: 3, length: 0, goal: 1 },
  easy: { patience: 1.3, gap: 1.15, hearts: 4, length: 6, goal: 0.92 },
};

/** A day's tuning (before upgrades and cards). */
export function dayTune(day: number, mode: Mode): DayTune {
  const k = TUNING[mode];
  const d = day - 1;
  const length = 80 + Math.min(40, d * 5) + k.length;
  const goal = Math.round((80 + d * 45 + d * d * 9) * k.goal / 5) * 5;
  const patience = Math.max(15, 34 - d * 2.1) * k.patience;
  const gap = Math.max(2.2, 5.2 - d * 0.36) * k.gap;
  const double = day >= 5 ? Math.min(0.3, 0.08 + (day - 5) * 0.04) : 0;
  const vips = day < 3 ? 0 : day < 6 ? 1 : day < 9 ? 2 : 3;
  return { length, goal, patience, gap, double, vips };
}

/** A tip on top of the price: up to 60 % of it at full patience. */
export const TIP_MAX = 0.6;
/** The VIP critic: shorter patience, a big tip. */
export const VIP = { patience: 0.62, tip: 2.2, price: 1.5 };
/** What a wrong dish costs (coins) and takes off the customer's patience (fraction). */
export const WRONG = { coins: 3, patience: 0.18 };

/** Seconds a noodle bowl / a steamer basket takes, and how long it stays good once done. */
export const COOK = { pot: 7.5, steamer: 6.5, keep: 7 };

/** Chef walking speed (units per second) before upgrades. */
export const CHEF_SPEED = 6.2;
/** Most actions waiting in the chef's queue. */
export const QUEUE_MAX = 4;
