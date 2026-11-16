// Hex Realm: the campaign, what is saved between sessions (core storage, one save per difficulty):
// the hero's class, level, XP, gold, potions, health, gear and bag, talents, the quests, the fog of
// war, cleared camps, New Game+ cycles, the rift and the renown (the score). Pure logic: the Play
// scene, the screens, the bot and the headless balance all drive the same object.
//   - Items: weapons, armour and trinkets (rings, amulets, charms) in five rarities with clear stat
//     lines, found in chests, bought at the market, upgraded at the smithy (+1 … +5).
//   - Battles: random encounters on wild hexes, camps, the dungeons behind the places, the rift.
//   - Powers (powers.ts): the Shrine's ranks of every skill and finisher (gold and Sigils, kept),
//     and the power cards of the journey (dealt after won chapters, camps and level-ups, cleared
//     when the session ends).
import {
  CLASS, TUNING, QUEST, QUEST_IDS, DUNGEON, PLACE_LEVEL, CYCLE_LEVELS, RENOWN, FOE, TALENT_IDS, TALENT_MAX, SLOTS, TRINKETS,
  TRINKET_STAT, RARITY_MULT, RARITY_AFFIXES, STAT_CAP, MAX_UP, UP_BONUS, MAX_LEVEL,
  baseStats, xpToNext, mainStats, affixValue, itemValue, upgradeCost,
  type ClassId, type Mode, type Item, type Slot, type Rarity, type Stat, type TalentId, type QuestId, type PlaceId,
  type Room, type FoeKind, type ArenaKind, type Wave,
} from './defs';
import { HexMap, CAMPS, START, BRIDGE, PLACE_HEX, WILD, hexIndex, regionOf, type Hex } from './hexmap';
import { makeRng, type HeroStats, type Battle } from './battle';
import { HAND_MAX, MAX_RANK, TRACK_KINDS, classRanks, rankPrice, trackId, rollCards, type TrackKind } from './powers';

export type QuestState = 'locked' | 'open' | 'done';

export interface Save {
  v: 1;
  cls: ClassId;
  chosen: boolean;
  level: number;
  xp: number;
  gold: number;
  hp: number;
  potions: number;
  potionMax: number;
  gear: Record<Slot, Item | null>;
  bag: Item[];
  talents: Record<TalentId, number>;
  points: number;
  quests: Record<QuestId, QuestState>;
  staff: boolean;
  pos: [number, number];
  seen: number[];
  camps: string[];
  cycle: number;
  rift: number;
  victory: boolean;
  renown: number;
  market: Item[];
  marketAt: number;
  nid: number;
  rng: number;
  steps: number;
  battles: number;
  kills: number;
  deaths: number;
  goldEarned: number;
  hints: string[];
  tutorial: boolean;
  time: number;
  /** The Shrine's currency and the ranks bought (by track id, powers.ts). */
  sigils: number;
  ranks: Record<string, number>;
  /** The power cards of this journey (cleared when it ends). */
  cards: string[];
  /** The finishers landed so far (combo hints). */
  combosSeen: string[];
}

export const BAG_MAX = 12;
export const POTION_PRICE = 25;
export const BELT_PRICE = [120, 220, 360];
export const MAX_POTIONS = 6;

/** What a finished battle gave. */
export interface Spoils {
  won: boolean;
  gold: number;
  xp: number;
  items: Item[];
  /** Items the bag had no room for, sold on the spot. */
  sold: number;
  levels: number;
  quest: QuestId | null;
  questGold: number;
  boss: FoeKind | null;
  staff: boolean;
  renown: number;
  lostGold: number;
  rift: number;
  /** Sigils found; whether a card draft follows (and a rich one: after a boss or a camp). */
  sigils: number;
  draft: boolean;
  rich: boolean;
}

/** A fight to start: where it comes from and what it holds. */
export interface Fight {
  kind: 'encounter' | 'camp' | 'dungeon' | 'rift';
  place: PlaceId | null;
  camp: string | null;
  rooms: Room[];
  level: number;
  tutorial?: boolean;
}

const KEY = (mode: Mode) => `hex-realm:save:${mode}`;

/** Where saves go: the core storage in the game (main.ts), nothing in the headless balance. */
export const store: { get<T>(k: string, fallback: T): T; set(k: string, v: unknown): void } = {
  get: <T>(_k: string, fallback: T) => fallback,
  set: () => undefined,
};

export function freshSave(cls: ClassId, mode: Mode): Save {
  const quests = Object.fromEntries(QUEST_IDS.map((q) => [q, QUEST[q].needs.length ? 'locked' : 'open'])) as Record<QuestId, QuestState>;
  const talents = Object.fromEntries(TALENT_IDS.map((t) => [t, 0])) as Record<TalentId, number>;
  return {
    v: 1, cls, chosen: false, level: 1, xp: 0, gold: 40, hp: baseStats(cls, 1).hp, potions: TUNING[mode].potions, potionMax: TUNING[mode].potions,
    gear: { weapon: null, armor: null, trinket: null }, bag: [], talents, points: 0, quests, staff: false,
    pos: [START[0], START[1]], seen: [], camps: [], cycle: 0, rift: 0, victory: false, renown: 0, market: [], marketAt: -1,
    nid: 1, rng: 12345, steps: 0, battles: 0, kills: 0, deaths: 0, goldEarned: 0, hints: [], tutorial: false, time: 0,
    sigils: 0, ranks: {}, cards: [], combosSeen: [],
  };
}

export class Campaign {
  s: Save;
  readonly map = new HexMap();
  private rnd: () => number;

  constructor(readonly mode: Mode, save?: Save | null) {
    this.s = save ?? freshSave('warrior', mode);
    this.clean();
    this.rnd = makeRng(this.s.rng);
    if (!this.s.seen.length) this.reveal(this.s.pos[0], this.s.pos[1], 2);
    if (!this.s.gear.weapon) this.starterGear();
    if (this.s.marketAt < 0) this.restock();
  }

  static load(mode: Mode): Campaign {
    return new Campaign(mode, store.get<Save | null>(KEY(mode), null));
  }

  static exists(mode: Mode): boolean {
    const s = store.get<Save | null>(KEY(mode), null);
    return !!s && !!s.chosen;
  }

  save(): void { this.s.rng = Math.floor(this.rnd() * 2 ** 31); this.rnd = makeRng(this.s.rng); store.set(KEY(this.mode), this.s); }

  /** A fresh campaign for a class (the old one is replaced). */
  reset(cls: ClassId): void {
    this.s = freshSave(cls, this.mode);
    this.rnd = makeRng(this.s.rng + Date.now() % 1000);
    this.reveal(this.s.pos[0], this.s.pos[1], 2);
    this.starterGear();
    this.restock();
  }

  /** Repairs an old or damaged save. */
  private clean(): void {
    const s = this.s;
    const f = freshSave(CLASS[s.cls] ? s.cls : 'warrior', this.mode);
    for (const k of Object.keys(f) as (keyof Save)[]) if (s[k] === undefined || s[k] === null && f[k] !== null) (s as unknown as Record<string, unknown>)[k] = f[k];
    if (!CLASS[s.cls]) s.cls = 'warrior';
    for (const q of QUEST_IDS) if (!s.quests[q]) s.quests[q] = f.quests[q];
    for (const t of TALENT_IDS) if (typeof s.talents[t] !== 'number') s.talents[t] = 0;
    s.level = Math.max(1, Math.min(MAX_LEVEL, Math.floor(s.level)));
    if (!Array.isArray(s.bag)) s.bag = [];
    if (!Array.isArray(s.cards)) s.cards = [];
    if (!Array.isArray(s.combosSeen)) s.combosSeen = [];
    if (typeof s.ranks !== 'object' || !s.ranks) s.ranks = {};
    s.sigils = Math.max(0, Math.floor(Number(s.sigils) || 0));
    if (!this.map.passable(this.map.at(s.pos[0], s.pos[1]))) s.pos = [START[0], START[1]];
    s.hp = Math.max(1, Math.min(this.maxHp, Number(s.hp) || this.maxHp));
  }

  private starterGear(): void {
    this.s.gear.weapon = this.makeItem('weapon', 1, 'common');
    this.s.gear.armor = this.makeItem('armor', 1, 'common');
  }

  rand(): number { return this.rnd(); }

  // ------------------------------------------------------------------ the hero

  get maxHp(): number { return this.stats().maxHp; }

  /** The hero's stats with gear, talents, the Shrine's ranks and the journey's cards. */
  stats(): HeroStats {
    const s = this.s, t = s.talents;
    const base = baseStats(s.cls, s.level);
    const g = this.gearStats();
    const pct = (k: Stat) => Math.min(STAT_CAP[k] ?? 100, g[k] ?? 0) / 100;
    const has = (c: string) => s.cards.includes(c);
    // the cards that only move numbers: Keen Edge, Hawk Eye, Arcane Flow, Greed, Avatar of War
    const atkK = (has('edge') ? 1.1 : 1) * (has('avatar') ? 1.2 : 1);
    return {
      cls: s.cls,
      level: s.level,
      maxHp: Math.round((base.hp + (g.hp ?? 0)) * (1 + 0.08 * t.vigor)),
      atk: (base.atk + (g.atk ?? 0)) * (1 + 0.06 * t.might) * atkK,
      def: pct('def'),
      crit: Math.min(0.6, CLASS[s.cls].crit + pct('crit') + 0.04 * t.precision + (has('hawk') ? 0.08 : 0)),
      cdr: Math.min(0.6, pct('cdr') + 0.07 * t.focus + (has('flow') ? 0.12 : 0) + (has('avatar') ? 0.1 : 0)),
      leech: pct('leech'),
      goldf: pct('goldf') + 0.1 * t.fortune + (has('greed') ? 0.3 : 0),
      speed: pct('speed') + (has('avatar') ? 0.15 : 0),
      skill1: t.skill1,
      skill2: t.skill2,
      potion: t.potion,
      ranks: classRanks(s.cls, s.ranks),
      cards: [...s.cards],
    };
  }

  // ------------------------------------------------------------------ the Shrine and the cards

  rankOf(kind: TrackKind): number { return this.s.ranks[trackId(this.s.cls, kind)] ?? 0; }

  /** The next rank's price, or null when maxed. */
  rankCost(kind: TrackKind): { gold: number; sigils: number } | null {
    const r = this.rankOf(kind);
    return r >= MAX_RANK ? null : rankPrice(r, this.s.cycle);
  }

  /** The Shrine: one rank up for a move of the current class. */
  buyRank(kind: TrackKind): boolean {
    const c = this.rankCost(kind);
    if (!c || this.s.gold < c.gold || this.s.sigils < c.sigils) return false;
    this.s.gold -= c.gold;
    this.s.sigils -= c.sigils;
    this.s.ranks[trackId(this.s.cls, kind)] = this.rankOf(kind) + 1;
    return true;
  }

  /** May a card be dealt now (room in the hand)? */
  canDraft(): boolean { return this.s.cards.length < HAND_MAX; }

  /** Three cards for a draft (a rich draft after a boss or a camp). */
  dealCards(rich: boolean): string[] { return rollCards(this.s.cls, this.s.cards, () => this.rnd(), rich); }

  takeCard(id: string): void {
    if (this.s.cards.includes(id) || this.s.cards.length >= HAND_MAX) return;
    const before = this.maxHp;
    this.s.cards.push(id);
    if (this.maxHp > before) this.s.hp += this.maxHp - before;
  }

  /** The journey ended: its cards are gone. */
  endJourney(): void { this.s.cards = []; this.s.hp = Math.min(this.s.hp, this.maxHp); }

  /** Every track of the class (for the screens and the bot). */
  tracks(): TrackKind[] { return TRACK_KINDS; }

  gearStats(): Partial<Record<Stat, number>> {
    const out: Partial<Record<Stat, number>> = {};
    for (const slot of SLOTS) {
      const it = this.s.gear[slot];
      if (!it) continue;
      for (const [k, v] of Object.entries(itemStats(it)) as [Stat, number][]) out[k] = (out[k] ?? 0) + v;
    }
    return out;
  }

  /** XP in; returns the levels gained. */
  gainXp(n: number): number {
    const s = this.s;
    let gained = 0;
    s.xp += Math.round(n * (1 + 0.1 * s.talents.fortune) * (s.cards.includes('scholar') ? 1.25 : 1));
    while (s.level < MAX_LEVEL && s.xp >= xpToNext(s.level)) {
      s.xp -= xpToNext(s.level);
      s.level++;
      s.points++;
      gained++;
    }
    if (gained) s.hp = this.maxHp;
    return gained;
  }

  addGold(n: number): void { this.s.gold += n; if (n > 0) this.s.goldEarned += n; }

  heal(k = 1): void { this.s.hp = Math.min(this.maxHp, this.s.hp + this.maxHp * k); }

  spendTalent(id: TalentId): boolean {
    const s = this.s;
    if (s.points <= 0 || s.talents[id] >= TALENT_MAX[id]) return false;
    const before = this.maxHp;
    s.talents[id]++;
    s.points--;
    if (this.maxHp > before) s.hp += this.maxHp - before;
    return true;
  }

  /** Changes class (at the inn): the level, gear and talents stay. */
  setClass(cls: ClassId): void {
    const k = this.s.hp / this.maxHp;
    this.s.cls = cls;
    this.s.hp = Math.round(this.maxHp * k);
  }

  // ------------------------------------------------------------------ items

  makeItem(slot: Slot, ilvl: number, rarity: Rarity): Item {
    const r = this.rnd;
    const kind = slot === 'trinket' ? TRINKETS[Math.floor(r() * TRINKETS.length)] : undefined;
    const stats: Partial<Record<Stat, number>> = {};
    const mult = RARITY_MULT[rarity];
    for (const [k, v] of Object.entries(mainStats(slot, ilvl, kind)) as [Stat, number][]) stats[k] = round1(v * (k === 'def' ? Math.sqrt(mult) : mult));
    const pool: Stat[] = slot === 'weapon' ? ['crit', 'leech', 'speed', 'hp', 'cdr'] : slot === 'armor' ? ['hp', 'speed', 'goldf', 'cdr', 'atk'] : ['atk', 'hp', 'crit', 'cdr', 'leech', 'goldf', 'speed'];
    const free = pool.filter((p) => stats[p] === undefined);
    for (let i = 0; i < RARITY_AFFIXES[rarity] && free.length; i++) {
      const k = free.splice(Math.floor(r() * free.length), 1)[0];
      stats[k] = round1(affixValue(k, ilvl) * (0.8 + r() * 0.4) * (rarity === 'legendary' ? 1.3 : 1));
    }
    if (kind && rarity === 'common') stats[TRINKET_STAT[kind]] = round1((stats[TRINKET_STAT[kind]] ?? 0));
    return { id: this.s.nid++, slot, kind, rarity, ilvl, up: 0, stats };
  }

  /** A random item for a chest. */
  lootItem(ilvl: number, weights: [Rarity, number][]): Item {
    const r = this.rnd();
    const slot: Slot = r < 0.4 ? 'weapon' : r < 0.72 ? 'armor' : 'trinket';
    const tot = weights.reduce((a, [, w]) => a + w, 0);
    let x = this.rnd() * tot;
    let rarity: Rarity = weights[0][0];
    for (const [k, w] of weights) { if ((x -= w) <= 0) { rarity = k; break; } }
    return this.makeItem(slot, Math.max(1, ilvl), rarity);
  }

  /** Puts an item in the bag; false (and sold for gold) when the bag is full. */
  stow(it: Item): boolean {
    if (this.s.bag.length >= BAG_MAX) { this.addGold(Math.round(itemValue(it) / 3)); return false; }
    this.s.bag.push(it);
    return true;
  }

  equip(id: number): void {
    const s = this.s;
    const i = s.bag.findIndex((b) => b.id === id);
    if (i < 0) return;
    const it = s.bag[i];
    const k = s.hp / this.maxHp;
    const old = s.gear[it.slot];
    s.bag.splice(i, 1);
    if (old) s.bag.splice(i, 0, old);
    s.gear[it.slot] = it;
    s.hp = Math.max(1, Math.round(this.maxHp * k));
  }

  sell(id: number): number {
    const s = this.s;
    const i = s.bag.findIndex((b) => b.id === id);
    if (i < 0) return 0;
    const g = Math.round(itemValue(s.bag[i]) / 3);
    s.bag.splice(i, 1);
    this.addGold(g);
    return g;
  }

  /** The smithy: one level up for an equipped item. */
  upgrade(slot: Slot): boolean {
    const it = this.s.gear[slot];
    if (!it || it.up >= MAX_UP) return false;
    const c = upgradeCost(it);
    if (this.s.gold < c) return false;
    const k = this.s.hp / this.maxHp;
    this.s.gold -= c;
    it.up++;
    this.s.hp = Math.round(this.maxHp * k);
    return true;
  }

  /** Is this better for the hero than what they wear (a rough score for the bot and the bag's arrow)? */
  better(it: Item): boolean {
    const cur = this.s.gear[it.slot];
    return !cur || itemScore(it) > itemScore(cur) * 1.02;
  }

  // ------------------------------------------------------------------ the market

  /** Fresh stock: four pieces around the hero's level. */
  restock(): void {
    const lvl = Math.max(1, this.s.level + this.s.cycle * CYCLE_LEVELS);
    this.s.market = [0, 1, 2, 3].map((i) => this.lootItem(lvl + (i === 3 ? 1 : 0), i === 3 ? [['rare', 70], ['epic', 30]] : [['common', 30], ['uncommon', 50], ['rare', 20]]));
    this.s.marketAt = this.s.battles;
  }

  marketPrice(it: Item): number { return Math.round(itemValue(it) * 2.2); }

  buy(i: number): boolean {
    const it = this.s.market[i];
    if (!it || this.s.gold < this.marketPrice(it) || this.s.bag.length >= BAG_MAX) return false;
    this.s.gold -= this.marketPrice(it);
    this.s.market.splice(i, 1);
    this.s.bag.push(it);
    return true;
  }

  buyPotion(): boolean {
    if (this.s.gold < POTION_PRICE || this.s.potions >= this.s.potionMax) return false;
    this.s.gold -= POTION_PRICE;
    this.s.potions++;
    return true;
  }

  beltPrice(): number | null {
    const k = this.s.potionMax - TUNING[this.mode].potions;
    return this.s.potionMax >= MAX_POTIONS || k >= BELT_PRICE.length ? null : BELT_PRICE[Math.max(0, k)];
  }

  buyBelt(): boolean {
    const p = this.beltPrice();
    if (p === null || this.s.gold < p) return false;
    this.s.gold -= p;
    this.s.potionMax++;
    this.s.potions++;
    return true;
  }

  // ------------------------------------------------------------------ the map

  reveal(c: number, r: number, rad: number): number[] {
    const fresh: number[] = [];
    const seen = new Set(this.s.seen);
    for (const h of this.map.around(c, r, rad)) if (!seen.has(h.i)) { seen.add(h.i); fresh.push(h.i); }
    this.s.seen = [...seen];
    return fresh;
  }

  isSeen(h: Hex): boolean { return this.s.seen.includes(h.i); }

  bridgeOpen(): boolean { return this.s.quests.mine === 'done' && this.s.quests.tower === 'done'; }

  /** Can the party walk onto this hex? */
  canStand(h: Hex): boolean {
    if (!this.map.passable(h)) return false;
    if (h.c === BRIDGE[0] && h.r === BRIDGE[1]) return true;
    return true;
  }

  /** Can the party cross this hex on the way somewhere (the warded bridge stops them)? */
  canPass(h: Hex): boolean {
    if (!this.map.passable(h)) return false;
    if (h.c === BRIDGE[0] && h.r === BRIDGE[1] && !this.bridgeOpen()) return false;
    return true;
  }

  /** The way to a hex (walking stops at places and camps on the way unless they are the goal). */
  pathTo(c: number, r: number): [number, number][] | null {
    const [c0, r0] = this.s.pos;
    if (c0 === c && r0 === r) return null;
    const goal = this.map.at(c, r);
    if (!this.map.passable(goal)) return null;
    return this.map.findPath(c0, r0, c, r, (h) => {
      if (!this.canPass(h) && h !== goal) return 1e6;
      if (h !== goal && (h.place || this.campAt(h))) return 6;
      return h.road ? 0.8 : 1;
    });
  }

  campAt(h: Hex): string | null {
    if (h.camp < 0) return null;
    const id = CAMPS[h.camp].id;
    return this.s.camps.includes(id) ? null : id;
  }

  /** One step onto a hex: reveals around it; a fight may start (random or a camp). */
  stepTo(c: number, r: number): Fight | null {
    const s = this.s;
    s.pos = [c, r];
    s.steps++;
    this.reveal(c, r, 2);
    const h = this.map.at(c, r);
    if (this.s.hp < this.maxHp) this.heal(0.015);
    const camp = this.campAt(h);
    if (camp) {
      const cp = CAMPS.find((x) => x.id === camp)!;
      const arena: Record<string, ArenaKind> = { den: 'forest', brutes: 'field', bones: 'fort', ruins: 'fort', cult: 'rift', guard: 'court' };
      return { kind: 'camp', place: null, camp, level: cp.level + s.cycle * CYCLE_LEVELS, rooms: [{ arena: arena[camp] ?? 'field', waves: cp.waves, shrine: true }] };
    }
    if (h.place || h.road || !s.tutorial) return null;
    const wild = WILD.includes(h.terrain) || (h.r <= 3 && h.terrain !== 'bridge');
    if (!wild || s.steps < 3) return null;
    if (this.rnd() >= TUNING[this.mode].encounter) return null;
    s.steps = 0;
    return this.encounter(h);
  }

  /** A random fight for a hex's region. */
  encounter(h: Hex): Fight {
    const reg = regionOf(h.r);
    const pick = () => reg.pool[Math.floor(this.rnd() * reg.pool.length)];
    const wave = (n: number): Wave => {
      const out = new Map<FoeKind, number>();
      for (let i = 0; i < n; i++) { let k = pick(); if (k === 'brute' && (out.has('brute') || i === 0)) k = reg.pool[0]; out.set(k, (out.get(k) ?? 0) + 1); }
      return [...out.entries()];
    };
    const lvl = Math.max(1, reg.level + Math.round(this.rnd() * 1.4 - 0.4)) + this.s.cycle * CYCLE_LEVELS;
    const waves: Wave[] = reg.level <= 1 ? [wave(2), wave(3)] : [wave(3), wave(3 + (this.rnd() < 0.5 ? 1 : 0))];
    const arena: ArenaKind = h.terrain === 'forest' ? 'forest' : reg.arena;
    return { kind: 'encounter', place: null, camp: null, level: lvl, rooms: [{ arena, waves, shrine: this.rnd() < 0.35 }] };
  }

  // ------------------------------------------------------------------ places and quests

  questFor(place: PlaceId): QuestId | null {
    return QUEST_IDS.find((q) => QUEST[q].place === place) ?? null;
  }

  /** May the party go into a place now? 'ok', or why not. */
  access(place: PlaceId): 'ok' | 'village' | 'done' | 'locked' | 'sealed' | 'rift' {
    if (place === 'village') return 'village';
    const q = this.questFor(place);
    if (place === 'castle' && this.s.victory) return 'rift';
    if (!q) return 'locked';
    if (place === 'tower' && !this.s.staff && this.s.quests.tower !== 'done') return 'sealed';
    const st = this.s.quests[q];
    if (st === 'done') return 'done';
    return st === 'open' ? 'ok' : 'locked';
  }

  /** The fight behind a place (its dungeon). */
  dungeon(place: Exclude<PlaceId, 'village'>): Fight {
    return { kind: 'dungeon', place, camp: null, level: PLACE_LEVEL[place] + this.s.cycle * CYCLE_LEVELS, rooms: DUNGEON[place] };
  }

  /** One floor of the endless rift: random rooms, a boss every fifth floor. */
  riftFloor(): Fight {
    const n = this.s.rift + 1;
    const pool: FoeKind[] = ['knight', 'cultist', 'acolyte', 'brute', 'ghoul', 'archer', 'skeleton', 'bandit'];
    const pick = () => pool[Math.floor(this.rnd() * pool.length)];
    const arenas: ArenaKind[] = ['rift', 'court', 'hall', 'fort', 'cavern', 'spire'];
    const wave = (k: number): Wave => Array.from({ length: k }, () => [pick(), 1] as [FoeKind, number]);
    const room: Room = { arena: arenas[Math.floor(this.rnd() * arenas.length)], waves: [wave(3), wave(3 + Math.min(3, Math.floor(n / 3)))], shrine: true };
    if (n % 5 === 0) room.boss = (['troll', 'mage', 'lord'] as FoeKind[])[Math.floor(n / 5 - 1) % 3];
    return { kind: 'rift', place: 'castle', camp: null, level: 12 + n + this.s.cycle * CYCLE_LEVELS, rooms: [room] };
  }

  /** The quest marked on the map: the first open main quest (else any open one). */
  tracked(): QuestId | null {
    const open = QUEST_IDS.filter((q) => this.s.quests[q] === 'open');
    return open.find((q) => QUEST[q].main) ?? open[0] ?? null;
  }

  trackedHex(): [number, number] | null {
    if (this.s.victory) return PLACE_HEX.castle;
    const q = this.tracked();
    if (!q) return null;
    if (q === 'tower' && !this.s.staff) return PLACE_HEX.fort;
    return PLACE_HEX[QUEST[q].place];
  }

  private unlockQuests(): void {
    for (const q of QUEST_IDS) {
      if (this.s.quests[q] !== 'locked') continue;
      if (QUEST[q].needs.every((n) => this.s.quests[n] === 'done')) this.s.quests[q] = 'open';
    }
  }

  /** The battle is over: XP, gold, loot, quests. */
  settle(f: Fight, b: Battle): Spoils {
    const s = this.s;
    const won = b.over === 'won';
    const out: Spoils = { won, gold: 0, xp: 0, items: [], sold: 0, levels: 0, quest: null, questGold: 0, boss: null, staff: false, renown: 0, lostGold: 0, rift: 0, sigils: 0, draft: false, rich: false };
    s.battles++;
    s.kills += b.kills;
    for (const c of b.finishers) if (!s.combosSeen.includes(c)) s.combosSeen.push(c);
    // Sigils picked up are kept, even in a lost fight
    out.sigils = b.sigils;
    s.potions = Math.min(s.potionMax + 2, b.hero.potions);
    const renown0 = s.renown;
    s.sigils += out.sigils;
    const sigil = () => { out.sigils++; s.sigils++; };
    if (!won) {
      s.deaths++;
      // what was learnt in a lost fight stays
      out.xp = b.xp;
      out.levels = this.gainXp(b.xp);
      s.renown += b.xp;
      out.lostGold = Math.round(s.gold * (1 - TUNING[this.mode].keepGold));
      s.gold -= out.lostGold;
      // back at the village inn, mended
      s.pos = [START[0], START[1]];
      s.hp = this.maxHp;
      s.potions = Math.max(s.potions, Math.min(s.potionMax, 1));
      return out;
    }
    out.gold = b.gold;
    out.xp = b.xp;
    this.addGold(b.gold);
    out.levels = this.gainXp(b.xp);
    s.hp = Math.min(this.maxHp, Math.max(b.hero.hp, 1) + this.maxHp * TUNING[this.mode].heal);
    // the Glory card: more renown from the battles of this journey
    s.renown += Math.round((b.xp + Math.round(b.gold / 2)) * (s.cards.includes('glory') ? 1.2 : 1));
    const ilvl = f.level;
    const take = (it: Item) => { if (this.stow(it)) out.items.push(it); else out.sold++; };
    if (f.kind === 'encounter') { if (this.rnd() < 0.4) take(this.lootItem(ilvl, [['common', 55], ['uncommon', 33], ['rare', 10], ['epic', 2]])); }
    else if (f.kind === 'camp') {
      take(this.lootItem(ilvl + 1, [['uncommon', 50], ['rare', 38], ['epic', 12]]));
      if (f.camp) s.camps.push(f.camp);
      s.renown += RENOWN.camp;
      sigil();
    } else if (f.kind === 'rift') {
      s.rift++;
      out.rift = s.rift;
      sigil();
      s.renown += RENOWN.rift * Math.ceil(s.rift / 2);
      take(this.lootItem(ilvl, s.rift % 5 === 0 ? [['epic', 60], ['legendary', 40]] : [['uncommon', 30], ['rare', 50], ['epic', 20]]));
    } else if (f.place) {
      for (let i = 0; i < f.rooms.length - 1; i++) take(this.lootItem(ilvl, [['common', 30], ['uncommon', 45], ['rare', 20], ['epic', 5]]));
      const q = this.questFor(f.place);
      if (q && s.quests[q] === 'open') {
        s.quests[q] = 'done';
        out.quest = q;
        out.questGold = Math.round(QUEST[q].gold * (1 + s.cycle * 0.6) * TUNING[this.mode].gold);
        this.addGold(out.questGold);
        s.renown += QUEST[q].renown;
        take(this.lootItem(ilvl + 1, [[QUEST[q].reward, 1]]));
        if (q === 'staff') { s.staff = true; out.staff = true; }
        if (q === 'port') { s.potionMax = Math.min(MAX_POTIONS, s.potionMax + 1); s.potions++; }
        if (q === 'castle') s.victory = true;
        this.unlockQuests();
      }
    }
    for (const k of b.bossesKilled) {
      if (FOE[k].ai === 'boss' && (k === 'troll' || k === 'mage' || k === 'lord')) { out.boss = k; s.renown += RENOWN.boss * (1 + s.cycle); }
    }
    if (s.battles - s.marketAt >= 3) this.restock();
    // Midas Touch: one more Sigil for every won chapter, camp or rift floor
    if (s.cards.includes('midas') && f.kind !== 'encounter') sigil();
    // a card draft after a won chapter, camp or rift floor and on reaching an even level (not when
    // the journey ends here)
    const chapterEnd = !!out.boss;
    out.rich = f.kind === 'camp' || b.bossesKilled.length > 0;
    const evenLevel = out.levels > 0 && (s.level % 2 === 0 || out.levels > 1);
    out.draft = !chapterEnd && this.canDraft() && (f.kind !== 'encounter' || evenLevel);
    out.renown = s.renown - renown0;
    return out;
  }

  /** New Game+: the realm darkens again (quests, camps and bosses back, foes stronger). */
  newGamePlus(): void {
    const s = this.s;
    s.cycle++;
    s.victory = false;
    s.staff = false;
    s.camps = [];
    for (const q of QUEST_IDS) s.quests[q] = QUEST[q].needs.length ? 'locked' : 'open';
    s.pos = [START[0], START[1]];
    this.restock();
  }

  /** The inn: full health, potions topped up to what the belt holds for free? No: only health. */
  rest(): void { this.s.hp = this.maxHp; }
}

const round1 = (v: number): number => Math.round(v * 10) / 10;

/** An item's stats with its smithy levels. */
export function itemStats(it: Item): Partial<Record<Stat, number>> {
  const k = 1 + it.up * UP_BONUS;
  const out: Partial<Record<Stat, number>> = {};
  const main = Object.keys(mainStats(it.slot, 1, it.kind));
  for (const [s, v] of Object.entries(it.stats) as [Stat, number][]) out[s] = main.includes(s) ? round1(v * k) : v;
  return out;
}

/** A rough worth of an item for comparisons. */
export function itemScore(it: Item): number {
  const st = itemStats(it);
  const w: Record<Stat, number> = { atk: 3, hp: 0.35, def: 2.2, crit: 2, cdr: 1.6, leech: 3, goldf: 0.4, speed: 1.2 };
  return (Object.entries(st) as [Stat, number][]).reduce((a, [k, v]) => a + v * w[k], 0);
}

export { hexIndex };
