// Last Convoy: a mission on foot as a pure simulation, stepped at 60 Hz (no Phaser, no three.js),
// so the Play scene, the menu's live backdrop and the headless balance check (balance.ts) run the
// same rules. The view (view.ts) draws its state; the scene reacts to its events.
//
// The survivor walks Northdale's district (town.ts) with a gun and a melee weapon. ATTACK uses the
// one in hand; the simulation owns the combo chain (§7g): two steps, then a finisher (a tap) or a
// charged finisher (held), or the dash strike straight after a dodge. Out of combat ATTACK is one
// clean swing or shot. Guns are loud: every shot calls the zombies in earshot and fills the horde
// meter (a horde comes when it is full); melee is quiet. Night falls on a timer and more of them
// wander in. The dog follows, bites, barks at crawlers hidden under wrecks and, on command, either
// attacks the foe in the aim or sniffs out the nearest supply chest. Missions chain stages: collect
// items, free survivors (they follow; lose one and the mission is lost), break the barricade at the
// north gate, hold out at the convoy / the pump / the radio, beat the district's boss; then everyone
// back to the convoy and the escape drive (drive.ts). Last Stand reuses all of it at the square:
// endless waves against the parked truck.
import {
  HERO, GUN, MELEE, ZOMBIE, BOSS, COMBO, FINISH, STAND, TUNING,
  type HeroId, type GunDef, type MeleeDef, type ZKind, type BossId, type MissionDef, type Mode, type ItemKind, type Stage,
} from './defs';
import { mods, type Mods, type CardId, type Ranks } from './powers';
import { planTown, pushOut, lineClear, walkable, Flow, mulberry, HALF, type TownPlan, type Spot, type Rect } from './town';

export { mulberry };

export interface Input {
  mx: number; mz: number;
  /** ATTACK held, and pressed this step. */
  atk: boolean; atkPress: boolean;
  /** An aim point on the ground (mouse), or NaN. */
  ax: number; az: number;
  dodge: boolean; swap: boolean; reload: boolean; ability: boolean; dog: boolean;
  /** INTERACT pressed, and held (opening a chest, freeing a survivor). */
  use: boolean; useHeld: boolean;
}
export const NO_INPUT: Input = { mx: 0, mz: 0, atk: false, atkPress: false, ax: NaN, az: NaN, dodge: false, swap: false, reload: false, ability: false, dog: false, use: false, useHeld: false };

export type DogKind = 'shepherd' | 'pug';

/** What lasts for the whole run (several missions, or a Last Stand). */
export interface RunState {
  mode: Mode;
  kind: 'campaign' | 'stand';
  hero: HeroId;
  /** The survivor that follows as a squadmate (null: none yet). */
  buddy: HeroId | null;
  dog: DogKind;
  cards: CardId[];
  ranks: Ranks;
  score: number;
  depth: number;
  kills: number;
  scrap: number;
  supplies: number;
}

export function newRun(mode: Mode, kind: RunState['kind'], hero: HeroId, buddy: HeroId | null, dog: DogKind, ranks: Ranks): RunState {
  return { mode, kind, hero, buddy, dog, cards: [], ranks, score: 0, depth: 0, kills: 0, scrap: 0, supplies: 0 };
}

export type StepKind = 'none' | 's1' | 's2' | 'single' | 'pre3' | 'fa' | 'fb' | 'fc';

export interface Hero {
  id: HeroId;
  x: number; z: number; face: number; vx: number; vz: number;
  hp: number; max: number; alive: boolean;
  weapon: 'gun' | 'melee';
  mag: number; reserve: number; reloadT: number; swapT: number;
  /** The chain: the step playing, its clock and length, when it lands, whether it landed. */
  step: StepKind; stepT: number; stepLen: number; hitAt: number; landed: boolean;
  /** ATTACK held time in the third step (the charge), and a press buffered for the next step. */
  chargeT: number; queued: boolean; lastEnd: number;
  dodgeT: number; dodgeCd: number; ddx: number; ddz: number; sinceDodge: number;
  invuln: number; hurtT: number;
  grab: number; grabT: number; mash: number;
  abilityCd: number; buffT: number; regenT: number;
  lastBlow: number;
  aimX: number; aimZ: number; lock: number;
  useT: number; useKind: string; useId: number;
  firedT: number; recoil: number;
  /** The run's free abilities (the legendary card): every third finisher. */
  finishers: number;
  secondUsed: boolean;
  /** The last chain step that ended (what a press within the window chains on to). */
  lastStepKind: StepKind;
  pressedPre: boolean;
}

export type ZState = 'lurk' | 'rise' | 'idle' | 'wander' | 'hunt' | 'tell' | 'strike' | 'grab' | 'charge' | 'stun' | 'dead';
export type BossMove = 'slam' | 'charge' | 'roar';

export interface Zombie {
  id: number; kind: ZKind; boss: BossId | null;
  x: number; z: number; y: number; vy: number; face: number; kx: number; kz: number;
  hp: number; max: number; r: number; walk: number; run: number; dmg: number; reach: number;
  state: ZState; t: number; cd: number;
  /** What it goes for: 'hero' | 'buddy' | 'surv' | 'dog' | 'bar' | 'truck' | 'flare', and its id. */
  tk: string; tid: number;
  wx: number; wz: number; wt: number;
  hitT: number; deadT: number; burn: number; bleed: number; stun: number;
  /** Wave zombies always hunt; the horde's are flagged for the view's markers. */
  wave: boolean;
  /** A lurker: revealed by the dog's bark (seconds until it rises). */
  reveal: number;
  /** The boss's armour (halves damage until a charged finisher breaks it), its move and phase. */
  armor: boolean; move: BossMove | null; phase: number; ax: number; az: number;
  scale: number;
}

export interface Survivor { id: number; who: HeroId | 'civ'; body: HeroId; x: number; z: number; face: number; hp: number; max: number; state: 'trapped' | 'follow' | 'safe' | 'down'; fireT: number; downT: number; armed: boolean; hurtT: number; tint: number }
export interface Buddy { id: HeroId; x: number; z: number; face: number; hp: number; max: number; down: number; fireT: number; firedT: number; lock: number; abilityT: number; moving: boolean }
export interface Dog { x: number; z: number; face: number; state: 'follow' | 'attack' | 'sniff' | 'wait' | 'down'; t: number; target: number; biteT: number; down: number; barkT: number; speed: number; trail: Spot[]; ti: number; chest: number; cmdCd: number; hp: number }
export interface Chest { id: number; x: number; z: number; special: boolean; opened: boolean; item: ItemKind | null; rot: number }
export interface Item { id: number; kind: ItemKind; x: number; z: number; taken: boolean; hidden: boolean }
export interface Pickup { id: number; kind: 'ammo' | 'med' | 'scrap'; x: number; z: number; v: number; t: number }
export interface Wall { id: number; rect: Rect; hp: number; max: number; kind: 'gate' | 'barricade'; t: number; spikes: boolean; boom: boolean; x: number; z: number; rot: number; down: boolean }
export interface Flare { x: number; z: number; t: number; life: number; fly: number; sx: number; sz: number }

export type SimEvent =
  | { type: 'shot'; gun: string; x: number; z: number; tx: number[]; tz: number[]; big: boolean; who: 'hero' | 'buddy' | 'surv' }
  | { type: 'swing'; step: StepKind; x: number; z: number; face: number }
  | { type: 'hit'; id: number; x: number; z: number; dmg: number; crit: boolean; big: boolean }
  | { type: 'kill'; id: number; kind: ZKind; x: number; z: number; boss: boolean; melee: boolean }
  | { type: 'hurt'; dmg: number; who: 'hero' | 'buddy' | 'surv' | 'dog' | 'truck' }
  | { type: 'finisher'; name: string; x: number; z: number; kind: 'fa' | 'fb' | 'fc' }
  | { type: 'grab' } | { type: 'free' } | { type: 'pull' }
  | { type: 'dodge' } | { type: 'reload' } | { type: 'reloaded' } | { type: 'swap'; to: 'gun' | 'melee' } | { type: 'empty' }
  | { type: 'ability'; kind: string; x: number; z: number; r: number }
  | { type: 'abilityReady' }
  | { type: 'bark'; x: number; z: number } | { type: 'reveal'; x: number; z: number } | { type: 'rise'; x: number; z: number }
  | { type: 'sniff' } | { type: 'sic' } | { type: 'found'; x: number; z: number } | { type: 'bite'; x: number; z: number } | { type: 'dogDown' }
  | { type: 'pickup'; kind: string; v: number; x: number; z: number }
  | { type: 'chest'; special: boolean; x: number; z: number; scrap: number; ammo: number }
  | { type: 'item'; kind: ItemKind; got: number; of: number; x: number; z: number }
  | { type: 'freed'; who: string; x: number; z: number } | { type: 'help'; x: number; z: number } | { type: 'safe' }
  | { type: 'stage'; i: number; kind: string } | { type: 'holdStart' } | { type: 'holdDone' }
  | { type: 'horde'; n: number } | { type: 'night' }
  | { type: 'boss'; id: BossId } | { type: 'tell'; move: BossMove; x: number; z: number; r: number } | { type: 'slam'; x: number; z: number; r: number }
  | { type: 'roar'; x: number; z: number } | { type: 'armor' } | { type: 'armorBreak'; x: number; z: number }
  | { type: 'burst'; x: number; z: number } | { type: 'blast'; x: number; z: number; r: number }
  | { type: 'wallHit'; x: number; z: number } | { type: 'wallDown'; x: number; z: number; gate: boolean } | { type: 'locked' }
  | { type: 'wave'; n: number; boss: boolean } | { type: 'waveClear'; n: number }
  | { type: 'buddyDown' } | { type: 'buddyUp' } | { type: 'revive' }
  | { type: 'groan'; x: number; z: number } | { type: 'tellZ'; id: number }
  | { type: 'win' } | { type: 'lose'; why: 'hero' | 'surv' | 'truck' };

const tv = { x: 0, z: 0 };
const angDiff = (a: number, b: number): number => { let d = a - b; while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2; return d; };
const turn = (cur: number, want: number, k: number): number => cur + angDiff(want, cur) * Math.min(1, k);

/** Gun idioms of the finishers: A (tap), B (held), C (after a dodge). */
const GUN_FIN: Record<string, { a: string; b: string; c: string }> = {
  pistol: { a: 'doubleTap', b: 'piercer', c: 'rollShot' },
  smg: { a: 'burst', b: 'spray', c: 'rollShot' },
  shotgun: { a: 'slug', b: 'buckshot', c: 'pointBlank' },
  rifle: { a: 'headshot', b: 'rail', c: 'rollShot' },
};
const MELEE_FIN = { a: 'whirl', b: 'cleave', c: 'lunge' };

export class Mission {
  readonly plan: TownPlan;
  readonly tune = TUNING.normal;
  m!: Mods;
  rnd: () => number;
  time = 0;
  phase: 'play' | 'won' | 'lost' = 'play';
  events: SimEvent[] = [];
  hero!: Hero;
  buddy: Buddy | null = null;
  dog: Dog;
  zombies: Zombie[] = [];
  survivors: Survivor[] = [];
  chests: Chest[] = [];
  items: Item[] = [];
  pickups: Pickup[] = [];
  walls: Wall[] = [];
  flares: Flare[] = [];
  stage = 0;
  /** The hold stage's progress (seconds) and whether it was started at its spot. */
  hold = { t: 0, on: false, x: 0, z: 0, r: 7 };
  horde = 0;
  night = 0;
  stop = 0;
  truck: { x: number; z: number; hp: number; max: number } | null = null;
  wave = { n: 0, left: 0, spawn: 0, gap: 0, active: false, pendingDraft: false };
  boss: Zombie | null = null;
  stats = { kills: 0, melee: 0, chests: 0, hordes: 0, scrap: 0, supplies: 0, items: 0, time: 0, minHp: 1, shots: 0, finishers: { fa: 0, fb: 0, fc: 0 } };
  /** Hints the scene shows the first time (combos not used yet). */
  used = new Set<string>();
  convoy: { x: number; z: number; rot: number };
  private flow: Flow;
  private flareFlow: Flow;
  private flowT = 0;
  private nextId = 1;
  private trickleT = 4;
  private nightSaid = false;
  private gateIds: number[] = [];

  constructor(readonly def: MissionDef | null, readonly run: RunState, seed: number) {
    this.rnd = mulberry(seed);
    (this as { tune: typeof TUNING.normal }).tune = TUNING[run.mode];
    this.plan = planTown(def ? def.district : 'main');
    this.convoy = { ...this.plan.convoy };
    this.flow = new Flow(this.plan);
    this.flareFlow = new Flow(this.plan);
    this.refreshMods();
    const H = HERO[run.hero];
    const c = this.convoy;
    const gun = GUN[H.gun];
    this.hero = {
      id: run.hero, x: c.x - 4, z: c.z - 3.5, face: Math.PI, vx: 0, vz: 0,
      hp: 0, max: 0, alive: true, weapon: 'gun', mag: gun.mag, reserve: Math.round(gun.reserve * this.m.ammo * this.tune.ammo), reloadT: 0, swapT: 0,
      step: 'none', stepT: 0, stepLen: 0, hitAt: 0, landed: false, chargeT: 0, queued: false, lastEnd: -9,
      dodgeT: 0, dodgeCd: 0, ddx: 0, ddz: 0, sinceDodge: 9, invuln: 0, hurtT: 0, grab: -1, grabT: 0, mash: 0,
      abilityCd: 3, buffT: 0, regenT: 0, lastBlow: -9, aimX: 0, aimZ: -1, lock: -1, useT: 0, useKind: '', useId: -1, firedT: 9, recoil: 0, finishers: 0, secondUsed: false, lastStepKind: 'none', pressedPre: false,
    };
    this.hero.max = this.hero.hp = Math.round(H.hp * this.m.hp * this.tune.hp);
    if (run.buddy && run.buddy !== run.hero) {
      const B = HERO[run.buddy];
      this.buddy = { id: run.buddy, x: c.x - 6, z: c.z - 2, face: Math.PI, hp: Math.round(B.hp * 0.7 * this.tune.hp), max: Math.round(B.hp * 0.7 * this.tune.hp), down: 0, fireT: 0, firedT: 9, lock: -1, abilityT: 12, moving: false };
    }
    this.dog = { x: c.x - 2, z: c.z - 4.5, face: Math.PI, state: 'follow', t: 0, target: -1, biteT: 0, down: 0, barkT: 0, speed: run.dog === 'pug' ? 6.4 : 7.2, trail: [], ti: 0, chest: -1, cmdCd: 0, hp: 60 };
    if (run.kind === 'stand') this.setupStand();
    else this.setupMission();
    this.rebuildFlow();
  }

  refreshMods(): void { this.m = mods(this.run.hero, this.run.ranks, this.run.cards); }

  get gun(): GunDef { return GUN[HERO[this.run.hero].gun]; }
  get melee(): MeleeDef { return MELEE[HERO[this.run.hero].melee]; }
  get stageDef(): Stage | null { return this.def ? this.def.stages[this.stage] ?? null : null; }
  get alive(): number { let n = 0; for (const z of this.zombies) if (z.state !== 'dead') n++; return n; }

  // ---------------------------------------------------------------- setup

  /** Spots far from the convoy and from each other (greedy farthest point). */
  private pickSpots(from: Spot[], n: number, minFromConvoy: number, taken: Spot[]): Spot[] {
    const out: Spot[] = [];
    const pool = from.filter((s) => Math.hypot(s.x - this.convoy.x, s.z - this.convoy.z) > minFromConvoy && !taken.some((t) => Math.hypot(t.x - s.x, t.z - s.z) < 4));
    for (let k = 0; k < n && pool.length; k++) {
      let best = 0, bs = -1;
      for (let i = 0; i < pool.length; i++) {
        const s = pool[i];
        let d = 1e9;
        for (const t of [...out, ...taken]) d = Math.min(d, Math.hypot(t.x - s.x, t.z - s.z));
        const score = Math.min(d, 40) + this.rnd() * 8;
        if (score > bs) { bs = score; best = i; }
      }
      out.push(pool[best]);
      pool.splice(best, 1);
    }
    return out;
  }

  private setupMission(): void {
    const def = this.def!;
    const P = this.plan;
    const taken: Spot[] = [{ x: this.convoy.x, z: this.convoy.z }];
    // supply chests: three to five, one special (supplies)
    const nChests = 4 + (def.n > 6 ? 1 : 0);
    const cs = this.pickSpots([...P.open, ...P.doors], nChests, 14, taken);
    cs.forEach((s, i) => { this.chests.push({ id: this.nextId++, x: s.x, z: s.z, special: i === cs.length - 1, opened: false, item: null, rot: this.rnd() * 6.28 }); taken.push(s); });
    // the stages' things
    for (const st of def.stages) {
      if (st.kind === 'collect' && st.item) {
        const spots = this.pickSpots([...P.open, ...P.doors], st.n ?? 1, 22, taken);
        spots.forEach((s, i) => {
          // a third hide in chests (the dog can find them); the rest lie in the open
          const inChest = i > 0 && this.rnd() < 0.34;
          if (inChest) {
            this.chests.push({ id: this.nextId++, x: s.x, z: s.z, special: false, opened: false, item: st.item!, rot: this.rnd() * 6.28 });
          } else this.items.push({ id: this.nextId++, kind: st.item!, x: s.x, z: s.z, taken: false, hidden: false });
          taken.push(s);
          // guards round every item
          this.spawnGroup(s.x, s.z, 2 + Math.floor(this.rnd() * 2), 'idle');
        });
      }
      if (st.kind === 'rescue') {
        const spots = this.pickSpots(P.doors.length ? P.doors : P.open, st.n ?? 1, 26, taken);
        spots.forEach((s) => {
          const who = st.who === 'hero' ? this.rescueHero() : 'civ';
          const body = who === 'civ' ? (['matt', 'sam', 'shaun', 'lis'] as HeroId[])[Math.floor(this.rnd() * 4)] : who;
          const max = Math.round((who === 'civ' ? 90 : 110) * this.tune.hp);
          this.survivors.push({ id: this.nextId++, who, body, x: s.x, z: s.z, face: 0, hp: max, max, state: 'trapped', fireT: 0, downT: 0, armed: who !== 'civ', hurtT: 0, tint: who === 'civ' ? [0xb0c8e0, 0xe0c8b0, 0xc8e0b0][Math.floor(this.rnd() * 3)] : 0xffffff });
          taken.push(s);
          this.spawnGroup(s.x, s.z, 3, 'idle');
        });
      }
      if (st.kind === 'clear') {
        const x = 0, z = -HALF + 1.2;
        const w: Wall = { id: this.nextId++, rect: { x0: x - 3.8, z0: z - 1, x1: x + 3.8, z1: z + 0.6 }, hp: 320, max: 320, kind: 'gate', t: 0, spikes: false, boom: false, x, z, rot: 0, down: false };
        this.walls.push(w);
        this.gateIds.push(w.id);
        this.spawnGroup(x, z + 5, 4, 'idle');
      }
    }
    // the rest of the town's population: scattered, some lurking under wrecks
    const start = Math.round(def.start * this.tune.zCount * (1 + Math.min(8, this.run.depth) * 0.02));
    const spots = [...P.open, ...P.doors, ...P.spawns].filter((s) => Math.hypot(s.x - this.convoy.x, s.z - this.convoy.z) > 16);
    for (let i = 0; i < start; i++) {
      const s = spots[Math.floor(this.rnd() * spots.length)];
      this.spawn(this.pickKind(), s.x + (this.rnd() - 0.5) * 4, s.z + (this.rnd() - 0.5) * 4, this.rnd() < 0.5 ? 'idle' : 'wander');
    }
    for (const l of P.lurks) {
      if (this.rnd() < 0.55 && Math.hypot(l.x - this.convoy.x, l.z - this.convoy.z) > 14) this.spawn('crawler', l.x, l.z, 'lurk');
    }
    if (this.m.dogReveal) for (const z of this.zombies) if (z.state === 'lurk') z.reveal = 99;
    this.enterStage(0);
  }

  /** The survivor this mission frees: the next in the story's order not yet with the squad. */
  rescueHero(): HeroId {
    const have = new Set([this.run.hero, ...(this.unlocked ?? [])]);
    return (['matt', 'sam', 'shaun', 'lis'] as HeroId[]).find((h) => !have.has(h)) ?? 'lis';
  }
  /** The survivors the player already has (set by the scene before the mission runs). */
  unlocked: HeroId[] | null = null;

  private setupStand(): void {
    const P = this.plan;
    const a = P.arena;
    // clear the square for the truck
    P.props = P.props.filter((p) => Math.hypot(p.x - a.x, p.z - a.z) > 6);
    P.posts = P.posts.filter((p) => Math.hypot(p.x - a.x, p.z - a.z) > 5);
    P.solids = P.solids.filter((s) => !(s.x0 < a.x + 5 && s.x1 > a.x - 5 && s.z0 < a.z + 5 && s.z1 > a.z - 5));
    P.lamps = P.lamps.filter((p) => Math.hypot(p.x - a.x, p.z - a.z) > 5);
    this.flow = new Flow(P);
    this.flareFlow = new Flow(P);
    this.convoy = { x: a.x, z: a.z, rot: 0 };
    const hp = Math.round(STAND.truckHp * this.m.armor * (this.m.plated ? 1.3 : 1) * (this.run.mode === 'easy' ? 1.4 : 1));
    this.truck = { x: a.x, z: a.z, hp, max: hp };
    this.hero.x = a.x; this.hero.z = a.z + 4.5;
    this.dog.x = a.x + 2; this.dog.z = a.z + 5;
    if (this.buddy) { this.buddy.x = a.x - 2; this.buddy.z = a.z + 5; }
    this.chests = [];
    const cs = this.pickSpots([...P.open, ...P.doors], 4, 10, [{ x: a.x, z: a.z }]);
    cs.forEach((s, i) => this.chests.push({ id: this.nextId++, x: s.x, z: s.z, special: i === 0, opened: false, item: null, rot: this.rnd() * 6.28 }));
    this.wave.gap = 4;
  }

  /** The convoy's collider (the truck in Last Stand, the parked vehicle otherwise). */
  get convoyRect(): Rect {
    const c = this.convoy;
    const along = Math.abs(Math.sin(c.rot)) > 0.7;
    const hw = along ? 2.9 : 1.4, hd = along ? 1.4 : 2.9;
    return { x0: c.x - hw, z0: c.z - hd, x1: c.x + hw, z1: c.z + hd };
  }

  private extraSolids(): Rect[] {
    const out = [this.convoyRect];
    for (const w of this.walls) if (!w.down) out.push(w.rect);
    return out;
  }

  private pickKind(): Exclude<ZKind, 'boss'> {
    const mix = this.def ? this.def.mix : [6, 3, 1, 2, 1];
    const kinds: Exclude<ZKind, 'boss'>[] = ['basic', 'runner', 'crawler', 'arm', 'chubby'];
    const total = mix.reduce((a, b) => a + b, 0);
    let x = this.rnd() * total;
    for (let i = 0; i < 5; i++) { x -= mix[i]; if (x <= 0) return kinds[i]; }
    return 'basic';
  }

  spawn(kind: ZKind, x: number, z: number, state: ZState, boss: BossId | null = null): Zombie {
    const T = this.tune;
    // over the hard cap: the farthest idle one wanders off for good (the town never floods)
    if (kind !== 'boss' && this.alive >= T.cap + 10) {
      let far: Zombie | null = null, fd = -1;
      for (const o of this.zombies) {
        if (o.state === 'dead' || o.boss) continue;
        const d = Math.hypot(o.x - this.hero.x, o.z - this.hero.z) + (o.state === 'idle' || o.state === 'wander' || o.state === 'lurk' ? 100 : 0);
        if (d > fd) { fd = d; far = o; }
      }
      if (far) { far.state = 'dead'; far.deadT = 99; }
    }
    const ramp = 1 + Math.min(8, this.run.depth) * 0.025;
    let zz: Zombie;
    const base = {
      y: 0, vy: 0, face: this.rnd() * 6.28, kx: 0, kz: 0, t: 0, cd: 1 + this.rnd(), tk: 'hero', tid: 0, wx: x, wz: z, wt: 0,
      hitT: 9, deadT: 0, burn: 0, bleed: 0, stun: 0, wave: false, reveal: 0, armor: false, move: null, phase: 0, ax: 0, az: 0,
    };
    if (kind === 'boss' && boss) {
      const B = BOSS[boss];
      const hp = Math.round(B.hp * T.zHp * (this.run.kind === 'stand' ? 0.3 + 0.06 * this.wave.n : 1));
      zz = { ...base, id: this.nextId++, kind, boss, x, z, hp, max: hp, r: 0.75 * B.scale * 0.8, walk: B.speed * 0.6, run: B.speed * T.zSpeed, dmg: B.dmg * T.zDmg, reach: 2.4, state, cd: 2.5, scale: B.scale };
    } else {
      const Z = ZOMBIE[kind as Exclude<ZKind, 'boss'>];
      const hp = Math.round(Z.hp * T.zHp * ramp * (0.9 + this.rnd() * 0.2));
      zz = { ...base, id: this.nextId++, kind, boss: null, x, z, hp, max: hp, r: Z.r, walk: Z.walk * T.zSpeed * (0.85 + this.rnd() * 0.3), run: Z.run * T.zSpeed * (0.9 + this.rnd() * 0.2), dmg: Z.dmg * T.zDmg, reach: Z.reach, state, scale: Z.scale * (0.94 + this.rnd() * 0.12) };
    }
    const p = { x: zz.x, z: zz.z };
    pushOut(this.plan, p, zz.r, this.extraSolids());
    zz.x = p.x; zz.z = p.z;
    this.zombies.push(zz);
    return zz;
  }

  private spawnGroup(x: number, z: number, n: number, state: ZState): void {
    for (let i = 0; i < n; i++) {
      const a = this.rnd() * 6.28, d = 2 + this.rnd() * 3;
      const k = this.pickKind();
      this.spawn(k === 'chubby' && this.rnd() < 0.5 ? 'basic' : k, x + Math.cos(a) * d, z + Math.sin(a) * d, state);
    }
  }

  /** A spawn point on the ring road out of sight (at least `min` m from the survivor). */
  private farSpawn(min = 22, max = 60): Spot {
    const h = this.hero;
    const ok = this.plan.spawns.filter((s) => { const d = Math.hypot(s.x - h.x, s.z - h.z); return d > min && d < max; });
    const pool = ok.length ? ok : this.plan.spawns;
    return pool[Math.floor(this.rnd() * pool.length)];
  }

  // ---------------------------------------------------------------- stages

  private enterStage(i: number): void {
    this.stage = i;
    const st = this.stageDef;
    if (!st) return;
    this.hold = { t: 0, on: false, x: this.convoy.x, z: this.convoy.z, r: 7.5 };
    if (st.kind === 'hold') {
      const spot = st.hold === 'pump' ? this.plan.pump : st.hold === 'radio' ? this.plan.radio : null;
      if (spot) this.hold = { t: 0, on: false, x: spot.x, z: spot.z, r: 7 };
    }
    // a hold or a boss fight starts with a crate of ammo and a medkit close by
    if (st.kind === 'hold' || st.kind === 'boss') {
      const at = st.kind === 'hold' ? this.hold : this.hero;
      this.drop('ammo', at.x + 2, at.z + 1.5, 1); this.drop('ammo', at.x - 2, at.z + 1.5, 1); this.drop('med', at.x, at.z + 2.5, 1);
    }
    if (st.kind === 'boss' && st.boss) {
      const a = this.plan.arena;
      const far = Math.hypot(a.x - this.hero.x, a.z - this.hero.z) > 18 ? a : this.farSpawn(18, 50);
      this.boss = this.spawn('boss', far.x, far.z, 'hunt', st.boss);
      this.events.push({ type: 'boss', id: st.boss });
    }
    this.events.push({ type: 'stage', i, kind: st.kind });
  }

  private stageDone(): void {
    this.run.score += 300;
    if (this.stage + 1 < (this.def?.stages.length ?? 0)) this.enterStage(this.stage + 1);
  }

  /** [done, of] of the current stage (for the HUD). */
  progress(): [number, number] {
    const st = this.stageDef;
    if (!st) return [0, 0];
    switch (st.kind) {
      case 'collect': { const of = st.n ?? 1; return [Math.min(of, this.items.filter((v) => v.taken && v.kind === st.item).length), of]; }
      case 'rescue': { const of = st.n ?? 1; return [this.survivors.filter((s) => this.stageSurvivor(s, st) && s.state !== 'trapped').length, of]; }
      case 'hold': return [Math.floor(this.hold.t), st.secs ?? 30];
      case 'boss': return [this.boss && this.boss.state !== 'dead' ? 0 : 1, 1];
      case 'clear': return [this.walls.some((w) => w.kind === 'gate' && !w.down) ? 0 : 1, 1];
      case 'return': return [this.survivors.filter((s) => s.state === 'safe').length, this.survivors.length];
    }
    return [0, 0];
  }

  private stageSurvivor(s: Survivor, st: Stage): boolean { return st.who === 'hero' ? s.who !== 'civ' : s.who === 'civ'; }

  /** Where the objectives are (the HUD's edge arrows): the current stage's targets. */
  objectives(): Spot[] {
    const st = this.stageDef;
    if (!st || this.run.kind === 'stand') return [];
    const out: Spot[] = [];
    if (st.kind === 'collect') {
      for (const it of this.items) if (!it.taken && it.kind === st.item && !it.hidden) out.push(it);
      for (const c of this.chests) if (!c.opened && c.item === st.item) out.push(c);
    } else if (st.kind === 'rescue') {
      for (const s of this.survivors) if (s.state === 'trapped' && this.stageSurvivor(s, st)) out.push(s);
    } else if (st.kind === 'clear') {
      for (const w of this.walls) if (w.kind === 'gate' && !w.down) out.push(w);
    } else if (st.kind === 'hold') out.push(this.hold);
    else if (st.kind === 'boss' && this.boss && this.boss.state !== 'dead') out.push(this.boss);
    else if (st.kind === 'return') out.push(this.convoy);
    return out;
  }

  // ---------------------------------------------------------------- the step

  step(dt: number, inp: Input): void {
    if (this.phase !== 'play') { this.animateOnly(dt); return; }
    if (this.stop > 0) { this.stop -= dt; return; }
    this.time += dt;
    this.stats.time = this.time;
    this.night = this.def ? Math.min(1, this.time / this.def.night) : Math.min(1, this.wave.n / 12);
    if (this.night >= 1 && !this.nightSaid && this.def) { this.nightSaid = true; this.events.push({ type: 'night' }); }
    this.horde = Math.max(0, this.horde - dt * 1.1);
    this.flowT -= dt;
    if (this.flowT <= 0) { this.flowT = 0.35; this.rebuildFlow(); }
    this.updateHero(dt, inp);
    this.updateBuddy(dt);
    this.updateDog(dt, inp);
    this.updateSurvivors(dt);
    this.updateZombies(dt);
    this.updateFlares(dt);
    this.updateWalls(dt);
    this.updatePickups(dt);
    if (this.run.kind === 'stand') this.updateStand(dt);
    else { this.updateStage(dt); this.updateSpawns(dt); }
    const h = this.hero;
    this.stats.minHp = Math.min(this.stats.minHp, h.hp / h.max);
  }

  /** After the end: only clocks run (deaths play out). */
  private animateOnly(dt: number): void {
    for (const z of this.zombies) { z.t += dt; if (z.state === 'dead') z.deadT += dt; }
    this.zombies = this.zombies.filter((z) => z.state !== 'dead' || z.deadT < 4);
  }

  private rebuildFlow(): void {
    this.flow.setBlocked(this.extraSolids());
    const t: Spot[] = [];
    if (this.hero.alive) t.push(this.hero);
    if (this.buddy && this.buddy.down <= 0) t.push(this.buddy);
    for (const s of this.survivors) if (s.state === 'follow') t.push(s);
    if (this.truck) t.push(this.truck);
    this.flow.build(t.length ? t : [this.hero]);
    const f = this.flares.find((fl) => fl.fly <= 0);
    if (f) this.flareFlow.build([f]);
  }

  // ---------------------------------------------------------------- the survivor

  private inCombat(): boolean {
    const h = this.hero;
    if (this.time - h.lastBlow < COMBO.recent) return true;
    if (this.boss && this.boss.state !== 'dead' && Math.hypot(this.boss.x - h.x, this.boss.z - h.z) < 18) return true;
    const range = h.weapon === 'gun' ? this.gun.range : COMBO.engage;
    for (const z of this.zombies) {
      if (z.state === 'dead' || z.state === 'lurk') continue;
      const d = Math.hypot(z.x - h.x, z.z - h.z);
      if (d < COMBO.engage || (d < range && (z.state === 'hunt' || z.state === 'tell'))) return true;
    }
    return false;
  }

  /** The best foe ahead (soft lock): inside a cone round `dir` within `range`, nearest first. */
  aimAssist(x: number, z: number, dx: number, dz: number, range: number, cone = 0.75): Zombie | null {
    let best: Zombie | null = null, bs = 1e9;
    for (const zb of this.zombies) {
      if (zb.state === 'dead' || zb.state === 'lurk' || zb.y > 1.5) continue;
      const ox = zb.x - x, oz = zb.z - z, d = Math.hypot(ox, oz);
      if (d > range + zb.r || d < 0.01) continue;
      const cos = (ox * dx + oz * dz) / d;
      if (cos < Math.cos(cone) && d > 2.2) continue;
      if (!lineClear(this.plan, x, z, zb.x, zb.z)) continue;
      const s = d * (1.6 - cos) + (zb.state === 'tell' ? -1.5 : 0) + (zb.boss ? -2 : 0);
      if (s < bs) { bs = s; best = zb; }
    }
    return best;
  }

  private updateHero(dt: number, inp: Input): void {
    const h = this.hero, m = this.m;
    if (!h.alive) return;
    const H = HERO[h.id];
    h.invuln = Math.max(0, h.invuln - dt);
    h.hurtT = Math.max(0, h.hurtT - dt);
    h.dodgeCd = Math.max(0, h.dodgeCd - dt);
    h.sinceDodge += dt;
    h.firedT += dt;
    h.recoil = Math.max(0, h.recoil - dt * 6);
    h.buffT = Math.max(0, h.buffT - dt);
    h.swapT = Math.max(0, h.swapT - dt);
    if (h.regenT > 0) { h.regenT -= dt; h.hp = Math.min(h.max, h.hp + 4 * dt); }
    const wasCd = h.abilityCd > 0;
    h.abilityCd = Math.max(0, h.abilityCd - dt);
    if (wasCd && h.abilityCd <= 0) this.events.push({ type: 'abilityReady' });
    // aim: the mouse's point, else the stick's way, else the facing
    let ax = Math.sin(h.face), az = Math.cos(h.face);
    const mlen = Math.hypot(inp.mx, inp.mz);
    if (!Number.isNaN(inp.ax)) { const dx = inp.ax - h.x, dz = inp.az - h.z, l = Math.hypot(dx, dz); if (l > 0.3) { ax = dx / l; az = dz / l; } }
    else if (mlen > 0.2) { ax = inp.mx / mlen; az = inp.mz / mlen; }
    h.aimX = ax; h.aimZ = az;
    const range = h.weapon === 'gun' ? this.gun.range : this.melee.reach + 2.2;
    const lock = this.aimAssist(h.x, h.z, ax, az, range, Number.isNaN(inp.ax) ? 0.8 : 0.35);
    h.lock = lock ? lock.id : -1;
    // grabbed: slowed, hurt, attacks and a dodge break free
    if (h.grab >= 0) {
      const g = this.zombies.find((z) => z.id === h.grab);
      h.grabT += dt;
      if (!g || g.state !== 'grab' || h.grabT > 2.4 || h.mash >= 3) this.release(g ?? null);
      else { this.hurtHero(4 * this.tune.zDmg * dt, true); if (inp.atkPress) h.mash++; }
    }
    // dodge
    if (inp.dodge && h.dodgeCd <= 0 && h.dodgeT <= 0) {
      const dl = mlen > 0.2 ? mlen : 0;
      h.ddx = dl ? inp.mx / mlen : Math.sin(h.face);
      h.ddz = dl ? inp.mz / mlen : Math.cos(h.face);
      h.dodgeT = 0.42; h.dodgeCd = 0.75; h.invuln = Math.max(h.invuln, 0.34 + m.rollInvuln);
      h.face = Math.atan2(h.ddx, h.ddz);
      this.endChain();
      if (h.grab >= 0) this.release(this.zombies.find((z) => z.id === h.grab) ?? null);
      this.events.push({ type: 'dodge' });
      this.used.add('dodge');
    }
    // swap and reload
    if (inp.swap && h.swapT <= 0 && h.dodgeT <= 0) {
      h.weapon = h.weapon === 'gun' ? 'melee' : 'gun';
      h.swapT = 0.25; h.reloadT = 0;
      this.endChain();
      this.events.push({ type: 'swap', to: h.weapon });
    }
    if (h.weapon === 'gun' && h.reloadT <= 0 && h.mag < this.gun.mag && h.reserve > 0 && (inp.reload || h.mag === 0) && h.step === 'none') {
      h.reloadT = this.gun.reload * m.reload;
      this.events.push({ type: 'reload' });
    }
    if (h.reloadT > 0) {
      h.reloadT -= dt;
      if (h.reloadT <= 0) {
        const take = Math.min(this.gun.mag - h.mag, h.reserve);
        h.mag += take; h.reserve -= take;
        this.events.push({ type: 'reloaded' });
      }
    }
    // the ability
    if (inp.ability && h.abilityCd <= 0 && h.dodgeT <= 0) this.useAbility();
    // the chain
    this.updateChain(dt, inp, lock);
    // movement
    let spd = H.speed * m.speed;
    if (h.grab >= 0) spd *= 0.25;
    if (h.step !== 'none') spd *= h.step === 'pre3' ? 0.25 : h.weapon === 'gun' ? 0.62 : 0.38;
    if (h.hurtT > 0.25) spd *= 0.5;
    if (h.useT > 0) spd *= 0.2;
    let vx = 0, vz = 0;
    if (h.dodgeT > 0) {
      const k = h.dodgeT / 0.42;
      vx = h.ddx * (5 + 9 * k); vz = h.ddz * (5 + 9 * k);
      h.dodgeT -= dt;
      if (h.dodgeT <= 0) h.sinceDodge = 0;
    } else if (mlen > 0.12) {
      const s = Math.min(1, mlen);
      vx = (inp.mx / mlen) * spd * s; vz = (inp.mz / mlen) * spd * s;
    }
    // lunges and the dash strike carry the body
    if (h.step === 'fc' && h.stepT < h.stepLen * 0.5) { vx += Math.sin(h.face) * 9; vz += Math.cos(h.face) * 9; }
    else if (h.weapon === 'melee' && (h.step === 's1' || h.step === 's2') && h.stepT < 0.12) { vx += Math.sin(h.face) * 2.2; vz += Math.cos(h.face) * 2.2; }
    h.vx = vx; h.vz = vz;
    h.x += vx * dt; h.z += vz * dt;
    this.collide(h, 0.42);
    // facing: the target while attacking, else the aim or the way it moves
    let want = h.face;
    if (h.dodgeT > 0) want = Math.atan2(h.ddx, h.ddz);
    else if (h.step !== 'none' || h.firedT < 0.4) want = lock ? Math.atan2(lock.x - h.x, lock.z - h.z) : Math.atan2(ax, az);
    else if (!Number.isNaN(inp.ax)) want = Math.atan2(ax, az);
    else if (mlen > 0.15) want = Math.atan2(inp.mx, inp.mz);
    h.face = turn(h.face, want, dt * (h.step !== 'none' ? 22 : 14));
    // interact
    this.updateUse(dt, inp);
  }

  private collide(o: { x: number; z: number }, r: number): void {
    pushOut(this.plan, o, r, this.extraSolids());
    const lim = HALF - 0.6;
    o.x = Math.max(-lim, Math.min(lim, o.x)); o.z = Math.max(-lim, Math.min(lim, o.z));
  }

  private endChain(): void {
    const h = this.hero;
    if (h.step !== 'none') h.lastEnd = this.time;
    h.step = 'none'; h.stepT = 0; h.chargeT = 0; h.queued = false;
  }

  private startStep(kind: StepKind): void {
    const h = this.hero;
    const gun = h.weapon === 'gun';
    const W = gun ? this.gun : this.melee;
    const rate = W.rate;
    h.step = kind; h.stepT = 0; h.landed = false; h.chargeT = 0; h.queued = false;
    switch (kind) {
      case 's1': case 'single': h.stepLen = gun ? rate : rate * 1.4; h.hitAt = gun ? 0 : h.stepLen * 0.42; break;
      case 's2': h.stepLen = gun ? rate : rate * 1.35; h.hitAt = gun ? 0 : h.stepLen * 0.4; break;
      case 'pre3': h.stepLen = 9; h.hitAt = 99; break;
      case 'fa': h.stepLen = gun ? Math.max(0.42, rate * 1.8) : 0.62; h.hitAt = gun ? 0 : 0.3; break;
      case 'fb': h.stepLen = gun ? 0.55 : 0.7; h.hitAt = gun ? 0.05 : 0.2; break;
      case 'fc': h.stepLen = gun ? 0.45 : 0.5; h.hitAt = gun ? 0.05 : 0.18; break;
      default: break;
    }
    if (kind === 'fa' || kind === 'fb' || kind === 'fc') this.used.add(kind);
    if (!gun) this.events.push({ type: 'swing', step: kind, x: h.x, z: h.z, face: h.face });
    if (!gun) this.horde = Math.min(100, this.horde + 0.25);
  }

  private updateChain(dt: number, inp: Input, lock: Zombie | null): void {
    const h = this.hero;
    if (inp.atkPress) h.queued = true;
    if (h.dodgeT > 0 || h.swapT > 0 || (h.weapon === 'gun' && h.reloadT > 0)) {
      if (h.weapon === 'gun' && h.reloadT > 0 && inp.atkPress && h.mag > 0) { h.reloadT = 0; }
      else return;
    }
    if (h.weapon === 'gun' && h.mag <= 0 && h.step === 'none') {
      if (h.queued && h.reserve <= 0) { h.queued = false; this.events.push({ type: 'empty' }); h.weapon = 'melee'; h.swapT = 0.25; this.events.push({ type: 'swap', to: 'melee' }); }
      return;
    }
    if (h.step === 'none') {
      const want = h.queued || inp.atk;
      if (!want) return;
      if (h.sinceDodge < COMBO.dash) { this.startStep('fc'); return; }
      if (!this.inCombat()) { this.startStep('single'); return; }
      const chainOn = this.time - h.lastEnd < COMBO.window ? h.lastStepKind : 'none';
      this.startStep(chainOn === 's1' ? 's2' : chainOn === 's2' ? 'pre3' : 's1');
      if ((h.step as StepKind) === 'pre3') { h.chargeT = 0; h.pressedPre = inp.atkPress || h.queued; }
      return;
    }
    h.stepT += dt;
    if (h.step === 'pre3') {
      // held: the charge fills (the finisher B on full); let go early: finisher A
      if (inp.atk) {
        h.chargeT += dt;
        if (h.chargeT >= COMBO.charge * this.m.charge) { h.lastStepKind = 'pre3'; this.startStep('fb'); }
      } else { h.lastStepKind = 'pre3'; this.startStep('fa'); }
      return;
    }
    if (!h.landed && h.stepT >= h.hitAt) {
      h.landed = true;
      if (h.weapon === 'gun') this.fire(h.step, lock);
      else this.strike(h.step);
    }
    if (h.stepT >= h.stepLen) {
      const done = h.step;
      h.lastStepKind = done;
      h.lastEnd = this.time;
      h.step = 'none';
      if (done === 'fa' || done === 'fb' || done === 'fc' || done === 'single') h.lastStepKind = 'none';
    }
  }

  // ---------------------------------------------------------------- guns

  private fire(step: StepKind, lock: Zombie | null): void {
    const h = this.hero, G = this.gun, m = this.m;
    const fin = step === 'fa' ? 'a' : step === 'fb' ? 'b' : step === 'fc' ? 'c' : '';
    const dir = lock ? Math.atan2(lock.x - h.x, lock.z - h.z) : Math.atan2(h.aimX, h.aimZ);
    h.face = dir;
    let pellets = G.pellets + m.spread * 2, spread = G.spread + m.spread * 14, dmg = G.dmg * m.gunDmg * (h.buffT > 0 ? 1.3 : 1), pierce = G.pierce + m.pierce, knock = G.knock, range = G.range, ammo = 1, crit = false;
    let name = '';
    if (fin) {
      const F = GUN_FIN[G.id];
      name = F[fin as 'a' | 'b' | 'c'];
      const mult = FINISH[fin as 'a' | 'b' | 'c'].dmg * m.finisher * (fin === 'c' ? m.dashDmg : 1);
      switch (name) {
        case 'doubleTap': pellets = 2; spread = 2; dmg *= mult * 0.7; crit = true; break;
        case 'burst': pellets = 5; spread = 7; dmg *= mult * 0.55; ammo = 3; break;
        case 'slug': pellets = 1; spread = 0; dmg = G.dmg * G.pellets * m.gunDmg * mult * 0.6; pierce = 4; knock = 2.5; range = 14; break;
        case 'headshot': dmg *= mult * 1.2; crit = true; break;
        case 'piercer': dmg *= mult; pierce = 5; knock = 2; range = 22; break;
        case 'spray': pellets = 9; spread = 50; dmg *= mult * 0.5; ammo = 4; break;
        case 'buckshot': pellets = 12; spread = 46; dmg *= mult * 0.45; knock = 3.2; ammo = 2; break;
        case 'rail': dmg *= mult; pierce = 99; knock = 1.5; range = 30; break;
        case 'rollShot': pellets = 3; spread = 24; dmg *= mult * 0.8; break;
        case 'pointBlank': pellets = 8; spread = 36; dmg *= mult * 0.6; knock = 3; range = 6; break;
      }
      this.stats.finishers[fin === 'a' ? 'fa' : fin === 'b' ? 'fb' : 'fc']++;
      h.finishers++;
      if (m.freeAbility && h.finishers % m.freeAbility === 0) { h.abilityCd = 0; this.events.push({ type: 'abilityReady' }); }
      this.events.push({ type: 'finisher', name, x: h.x + Math.sin(dir) * 2, z: h.z + Math.cos(dir) * 2, kind: ('f' + fin) as 'fa' | 'fb' | 'fc' });
    }
    ammo = Math.min(ammo, h.mag);
    h.mag -= ammo;
    h.firedT = 0;
    h.recoil = fin ? 1 : 0.6;
    this.stats.shots++;
    const tx: number[] = [], tz: number[] = [];
    for (let p = 0; p < pellets; p++) {
      const a = dir + (pellets > 1 ? (p / (pellets - 1) - 0.5) * spread : (this.rnd() - 0.5) * spread) * Math.PI / 180 + (this.rnd() - 0.5) * 0.02;
      const end = this.ray(h.x, h.z, a, range, dmg, pierce, knock, crit, fin === 'b' || name === 'rail', !!fin);
      tx.push(end.x); tz.push(end.z);
    }
    // the gate takes shots too (half damage: melee breaks it faster)
    this.events.push({ type: 'shot', gun: G.id, x: h.x, z: h.z, tx, tz, big: !!fin, who: 'hero' });
    if (fin) { this.stop = Math.max(this.stop, FINISH[fin as 'a' | 'b' | 'c'].stop * 0.6); }
    this.makeNoise(h.x, h.z, G.noise * m.noise, G.loud * (fin ? 1.5 : 1));
    h.lastBlow = this.time;
  }

  /** A bullet: hits the zombies along the line (nearest first, `pierce` more after the first), stops at walls. */
  private ray(x: number, z: number, a: number, range: number, dmg: number, pierce: number, knock: number, crit: boolean, breaks: boolean, fin: boolean): Spot {
    const dx = Math.sin(a), dz = Math.cos(a);
    // the wall's distance along the ray (posts are thin and ignored)
    let maxT = range;
    for (const s of [...this.plan.solids, ...this.extraSolids()]) {
      let t0 = 0, t1 = maxT;
      let hit = true;
      for (const [p, d, lo, hi] of [[x, dx, s.x0, s.x1], [z, dz, s.z0, s.z1]] as [number, number, number, number][]) {
        if (Math.abs(d) < 1e-9) { if (p < lo || p > hi) { hit = false; break; } continue; }
        let u = (lo - p) / d, v = (hi - p) / d;
        if (u > v) [u, v] = [v, u];
        t0 = Math.max(t0, u); t1 = Math.min(t1, v);
        if (t0 > t1) { hit = false; break; }
      }
      if (hit && t0 > 0.05) maxT = Math.min(maxT, t0);
    }
    const hits: { z: Zombie; t: number }[] = [];
    for (const zb of this.zombies) {
      if (zb.state === 'dead' || zb.state === 'lurk') continue;
      const ox = zb.x - x, oz = zb.z - z;
      const t = ox * dx + oz * dz;
      if (t < 0 || t > maxT) continue;
      const px = ox - dx * t, pz = oz - dz * t;
      const rr = zb.r + 0.25;
      if (px * px + pz * pz > rr * rr) continue;
      hits.push({ z: zb, t });
    }
    hits.sort((p, q) => p.t - q.t);
    let n = 0, endT = maxT;
    for (const hh of hits) {
      const isCrit = crit || this.rnd() < 0.06;
      const fall = 1 - 0.45 * Math.min(1, hh.t / range);
      this.damage(hh.z, dmg * fall * (isCrit ? 1.8 : 1) * (1 - n * 0.15), { kx: dx, kz: dz, knock: knock * fall, crit: isCrit, melee: false, breaks, big: fin });
      if (this.m.burnRounds) hh.z.burn = Math.max(hh.z.burn, 2);
      n++;
      if (n > pierce) { endT = hh.t; break; }
    }
    // walls along the line
    for (const w of this.walls) {
      if (w.down) continue;
      const cx = (w.rect.x0 + w.rect.x1) / 2, cz = (w.rect.z0 + w.rect.z1) / 2;
      const t = (cx - x) * dx + (cz - z) * dz;
      if (t > 0 && t <= endT + 1.5 && Math.abs((cx - x) * dz - (cz - z) * dx) < 4) this.hitWall(w, dmg * 0.5);
    }
    return { x: x + dx * endT, z: z + dz * endT };
  }

  /** A sound zombies hear: idle and wandering ones within `r` come looking; it fills the horde meter. */
  makeNoise(x: number, z: number, r: number, loud: number): void {
    for (const zb of this.zombies) {
      if (zb.state !== 'idle' && zb.state !== 'wander') continue;
      if (Math.hypot(zb.x - x, zb.z - z) < r) { zb.state = 'hunt'; zb.t = 0; }
    }
    if (this.run.kind === 'stand') return;
    this.horde = Math.min(100, this.horde + loud * this.tune.noise * this.m.horde);
    if (this.horde >= 100) {
      this.horde = 0;
      this.stats.hordes++;
      const n = Math.round((7 + (this.def?.n ?? 1) * 0.8 + this.night * 4) * this.tune.zCount);
      const s = this.farSpawn(20, 45);
      for (let i = 0; i < n; i++) {
        const zb = this.spawn(this.pickKind(), s.x + (this.rnd() - 0.5) * 6, s.z + (this.rnd() - 0.5) * 6, 'hunt');
        zb.wave = true;
      }
      this.events.push({ type: 'horde', n });
    }
  }

  // ---------------------------------------------------------------- melee

  private strike(step: StepKind): void {
    const h = this.hero, M = this.melee, m = this.m;
    let reach = M.reach, arc = M.arc, dmg = M.dmg * m.meleeDmg * (h.buffT > 0 ? 1.3 : 1), knock = M.knock * m.knock, launch = false, breaks = false, fin = '';
    if (step === 'fa') { arc = 360; reach *= 1.15; dmg *= FINISH.a.dmg * m.finisher; knock *= 1.8; fin = 'a'; }
    if (step === 'fb') { reach *= 1.1; arc = 70; dmg *= FINISH.b.dmg * m.finisher; knock *= 2.6; breaks = true; fin = 'b'; }
    if (step === 'fc') { reach *= 1.2; arc = 90; dmg *= FINISH.c.dmg * m.finisher * m.dashDmg; launch = true; fin = 'c'; }
    if (step === 's2') dmg *= 1.1;
    const fx = Math.sin(h.face), fz = Math.cos(h.face);
    let hits = 0;
    for (const zb of this.zombies) {
      if (zb.state === 'dead' || zb.state === 'lurk' || zb.y > 1.8) continue;
      const ox = zb.x - h.x, oz = zb.z - h.z, d = Math.hypot(ox, oz);
      if (d > reach + zb.r) continue;
      if (arc < 360 && d > 0.3 && (ox * fx + oz * fz) / d < Math.cos((arc / 2) * Math.PI / 180)) continue;
      const kx = d > 0.01 ? ox / d : fx, kz = d > 0.01 ? oz / d : fz;
      this.damage(zb, dmg, { kx, kz, knock, crit: !!fin, melee: true, breaks, big: !!fin, launch: launch && zb.kind !== 'chubby' && !zb.boss });
      if (m.bleed) zb.bleed = Math.max(zb.bleed, 3);
      if (m.burn && fin) zb.burn = Math.max(zb.burn, 3);
      hits++;
    }
    // the charged cleave sends a shockwave lane forward
    if (step === 'fb') {
      const lane = 7 + (m.finisherWave ? 3 : 0);
      for (const zb of this.zombies) {
        if (zb.state === 'dead' || zb.state === 'lurk') continue;
        const ox = zb.x - h.x, oz = zb.z - h.z, t = ox * fx + oz * fz;
        if (t < reach || t > lane) continue;
        if (Math.abs(ox * fz - oz * fx) > 1.4 + zb.r) continue;
        this.damage(zb, dmg * 0.55, { kx: fx, kz: fz, knock: knock * 0.7, crit: false, melee: true, breaks: true, big: true });
        hits++;
      }
      this.events.push({ type: 'blast', x: h.x + fx * lane * 0.5, z: h.z + fz * lane * 0.5, r: lane * 0.5 });
    }
    if (step === 'fa' && m.finisherWave) this.events.push({ type: 'blast', x: h.x, z: h.z, r: reach * 1.3 });
    for (const w of this.walls) {
      if (w.down) continue;
      const cx = Math.max(w.rect.x0, Math.min(h.x, w.rect.x1)), cz = Math.max(w.rect.z0, Math.min(h.z, w.rect.z1));
      if (Math.hypot(cx - h.x, cz - h.z) < reach + 0.5) { this.hitWall(w, dmg * 1.5); hits++; }
    }
    if (fin) {
      const F = FINISH[fin as 'a' | 'b' | 'c'];
      this.stats.finishers[('f' + fin) as 'fa' | 'fb' | 'fc']++;
      h.finishers++;
      if (m.freeAbility && h.finishers % m.freeAbility === 0) { h.abilityCd = 0; this.events.push({ type: 'abilityReady' }); }
      if (hits) {
        this.stop = Math.max(this.stop, F.stop);
        const name = MELEE_FIN[fin as 'a' | 'b' | 'c'];
        this.events.push({ type: 'finisher', name, x: h.x + fx * 1.5, z: h.z + fz * 1.5, kind: ('f' + fin) as 'fa' | 'fb' | 'fc' });
      }
    }
    if (hits) h.lastBlow = this.time;
    this.horde = Math.min(100, this.horde + 0.2);
  }

  damage(zb: Zombie, dmg: number, o: { kx: number; kz: number; knock: number; crit: boolean; melee: boolean; breaks: boolean; big: boolean; launch?: boolean }): void {
    if (zb.state === 'dead') return;
    if (zb.state === 'lurk') { zb.state = 'rise'; zb.t = 0; }
    let d = dmg;
    if (zb.boss) {
      if (zb.armor) {
        if (o.breaks) { zb.armor = false; zb.stun = 2; zb.state = 'stun'; zb.t = 0; this.events.push({ type: 'armorBreak', x: zb.x, z: zb.z }); d *= 1.5; }
        else d *= 0.4;
      }
    }
    zb.hp -= d;
    zb.hitT = 0;
    this.events.push({ type: 'hit', id: zb.id, x: zb.x, z: zb.z, dmg: Math.round(d), crit: o.crit, big: o.big });
    const w = zb.boss ? 0.12 : ZOMBIE[zb.kind as Exclude<ZKind, 'boss'>].weight;
    const push = o.knock * w;
    zb.kx += o.kx * push * 6; zb.kz += o.kz * push * 6;
    if (o.launch) { zb.vy = 7; zb.y = 0.01; }
    // a grabber lets go when hit
    if (zb.state === 'grab') this.release(zb);
    if (zb.hp <= 0) { this.kill(zb, o.melee); return; }
    // flinch: big hits stagger everything but the boss; light hits only stagger light zombies
    if (!zb.boss && ((o.melee && push > 0.5) || push > 0.9 || o.big) && zb.state !== 'charge') { zb.state = 'stun'; zb.stun = o.big ? 0.55 : 0.3; zb.t = 0; }
    if (zb.state === 'idle' || zb.state === 'wander') { zb.state = 'hunt'; zb.t = 0; }
  }

  private kill(zb: Zombie, melee: boolean): void {
    zb.state = 'dead'; zb.deadT = 0; zb.t = 0;
    this.stats.kills++;
    if (melee) this.stats.melee++;
    this.run.kills++;
    const score = zb.boss ? BOSS[zb.boss].score : ZOMBIE[zb.kind as Exclude<ZKind, 'boss'>].score;
    this.run.score += score;
    this.events.push({ type: 'kill', id: zb.id, kind: zb.kind, x: zb.x, z: zb.z, boss: !!zb.boss, melee });
    if (this.m.killHeal && this.hero.alive) this.hero.hp = Math.min(this.hero.max, this.hero.hp + this.m.killHeal);
    // drops: scrap often, ammo sometimes, a medkit rarely
    const r = this.rnd();
    if (zb.boss) {
      for (let i = 0; i < 6; i++) this.drop('scrap', zb.x + (this.rnd() - 0.5) * 3, zb.z + (this.rnd() - 0.5) * 3, 6);
      this.drop('ammo', zb.x + 1, zb.z, 1); this.drop('med', zb.x - 1, zb.z, 1);
      this.stats.supplies += 2;
      this.run.supplies += 2;
    } else if (r < 0.3) this.drop('scrap', zb.x, zb.z, ZOMBIE[zb.kind as Exclude<ZKind, 'boss'>].scrap * 2);
    else if (r < 0.3 + 0.17 * this.tune.ammo * this.m.ammoDrop) this.drop('ammo', zb.x, zb.z, 1);
    else if (r < 0.52) this.drop('med', zb.x, zb.z, 1);
    // the brute bursts; the epic card makes others pop too
    if (zb.kind === 'chubby' || (this.m.chain && this.rnd() < this.m.chain)) this.burst(zb.x, zb.z, zb.kind === 'chubby' ? 3.2 : 2.4, zb.kind === 'chubby' ? 12 : 10);
    if (zb.boss) { this.boss = zb; this.stop = 0.2; }
    if (this.wave.active && zb.wave) this.wave.left = Math.max(0, this.wave.left - 1);
  }

  private burst(x: number, z: number, r: number, dmg: number): void {
    this.events.push({ type: 'burst', x, z });
    for (const zb of this.zombies) {
      if (zb.state === 'dead') continue;
      const d = Math.hypot(zb.x - x, zb.z - z);
      if (d < r && d > 0.01) this.damage(zb, dmg * 2.5, { kx: (zb.x - x) / d, kz: (zb.z - z) / d, knock: 1.2, crit: false, melee: false, breaks: false, big: true });
    }
    if (Math.hypot(this.hero.x - x, this.hero.z - z) < r) this.hurtHero(dmg * this.tune.zDmg);
  }

  private drop(kind: Pickup['kind'], x: number, z: number, v: number): void {
    const p = { x, z };
    pushOut(this.plan, p, 0.3, this.extraSolids());
    this.pickups.push({ id: this.nextId++, kind, x: p.x, z: p.z, v, t: 0 });
  }

  hitWall(w: Wall, dmg: number): void {
    if (w.down) return;
    if (w.kind === 'gate' && this.stageDef?.kind !== 'clear') { if (w.t <= 0) { w.t = 1.5; this.events.push({ type: 'locked' }); } return; }
    w.hp -= dmg;
    this.events.push({ type: 'wallHit', x: w.x, z: w.z });
    if (w.hp <= 0) {
      w.down = true;
      this.events.push({ type: 'wallDown', x: w.x, z: w.z, gate: w.kind === 'gate' });
      if (w.boom) this.burst(w.x, w.z, 3.5, 24);
      if (w.kind === 'gate') { this.run.score += 400; this.stageDone(); }
      this.flowT = 0;
    }
  }

  // ---------------------------------------------------------------- abilities

  private useAbility(): void {
    const h = this.hero, m = this.m, rank = m.abilityRank, card = m.abilityCard;
    const H = HERO[h.id];
    h.abilityCd = H.cd * m.abilityCd * (card && h.id === 'lis' ? 0.5 : card && h.id === 'shaun' ? 0.7 : 1);
    const fx = Math.sin(h.face), fz = Math.cos(h.face);
    this.used.add('ability');
    switch (H.ability) {
      case 'barricade': {
        const n = rank >= 3 ? 2 : 1;
        for (let k = 0; k < n; k++) {
          const off = n === 2 ? (k - 0.5) * 2.9 : 0;
          const x = h.x + fx * 2.2 + fz * off, z = h.z + fz * 2.2 - fx * off;
          const rot = h.face;
          const hw = Math.abs(Math.cos(rot)) * 1.4 + Math.abs(Math.sin(rot)) * 0.35, hd = Math.abs(Math.sin(rot)) * 1.4 + Math.abs(Math.cos(rot)) * 0.35;
          const hp = (rank >= 1 ? 230 : 160) * (card ? 2 : 1);
          this.walls.push({ id: this.nextId++, rect: { x0: x - hw, z0: z - hd, x1: x + hw, z1: z + hd }, hp, max: hp, kind: 'barricade', t: card ? 40 : 22, spikes: rank >= 2, boom: rank >= 3, x, z, rot, down: false });
        }
        this.events.push({ type: 'ability', kind: 'barricade', x: h.x + fx * 2.2, z: h.z + fz * 2.2, r: 1.5 });
        // the hero must not be inside it
        this.collide(h, 0.42);
        this.flowT = 0;
        break;
      }
      case 'flare': {
        const n = card ? 2 : 1;
        for (let k = 0; k < n; k++) {
          const a = h.face + (n === 2 ? (k - 0.5) * 0.9 : 0);
          const d = 9;
          const p = { x: h.x + Math.sin(a) * d, z: h.z + Math.cos(a) * d };
          pushOut(this.plan, p, 0.4, this.extraSolids());
          this.flares.push({ x: p.x, z: p.z, t: 0, life: rank >= 1 ? 9 : 7, fly: 0.55, sx: h.x, sz: h.z });
        }
        this.events.push({ type: 'ability', kind: 'flare', x: h.x, z: h.z, r: 1 });
        break;
      }
      case 'heal': {
        const amt = (rank >= 1 ? 50 : 35) * (card ? 1.25 : 1);
        const r = 7;
        h.hp = Math.min(h.max, h.hp + amt);
        if (rank >= 3) h.regenT = 5;
        if (this.buddy && Math.hypot(this.buddy.x - h.x, this.buddy.z - h.z) < r) {
          if (this.buddy.down > 0 && rank >= 3) { this.buddy.down = 0; this.buddy.hp = this.buddy.max * 0.5; this.events.push({ type: 'buddyUp' }); }
          else this.buddy.hp = Math.min(this.buddy.max, this.buddy.hp + amt);
        }
        for (const s of this.survivors) if (Math.hypot(s.x - h.x, s.z - h.z) < r) s.hp = Math.min(s.max, s.hp + amt);
        if (this.dog.state === 'down' && rank >= 3) { this.dog.state = 'follow'; this.dog.down = 0; }
        if (rank >= 2) this.shove(h.x, h.z, 5, 15, 1.2, 0);
        this.events.push({ type: 'ability', kind: 'heal', x: h.x, z: h.z, r });
        break;
      }
      case 'warcry': {
        const r = rank >= 1 ? 7.5 : 6;
        const stun = (rank >= 3 ? 2.4 : 1.6) * (card ? 1.5 : 1);
        this.shove(h.x, h.z, r, 12 * m.meleeDmg, 1.6, stun);
        if (rank >= 2) h.buffT = 6;
        this.events.push({ type: 'ability', kind: 'warcry', x: h.x, z: h.z, r });
        this.horde = Math.min(100, this.horde + 6);
        break;
      }
    }
  }

  /** Damage, push and stun every zombie within r (the war cry, the heal's shove). */
  private shove(x: number, z: number, r: number, dmg: number, knock: number, stun: number): void {
    for (const zb of this.zombies) {
      if (zb.state === 'dead' || zb.state === 'lurk') continue;
      const d = Math.hypot(zb.x - x, zb.z - z);
      if (d > r + zb.r) continue;
      const kx = d > 0.01 ? (zb.x - x) / d : 1, kz = d > 0.01 ? (zb.z - z) / d : 0;
      this.damage(zb, dmg, { kx, kz, knock, crit: false, melee: true, breaks: false, big: true });
      if (stun && (zb.state as ZState) !== 'dead') { zb.state = 'stun'; zb.stun = zb.boss ? stun * 0.35 : stun; zb.t = 0; }
    }
  }

  // ---------------------------------------------------------------- interact

  /** What INTERACT would do here and now (the scene labels the button with it). */
  context(): { kind: 'free' | 'open' | 'start' | 'board' | 'revive'; id: number; x: number; z: number; need: number } | null {
    const h = this.hero;
    if (!h.alive) return null;
    for (const s of this.survivors) if (s.state === 'trapped' && Math.hypot(s.x - h.x, s.z - h.z) < 2.6) return { kind: 'free', id: s.id, x: s.x, z: s.z, need: 1.1 };
    if (this.buddy && this.buddy.down > 0 && Math.hypot(this.buddy.x - h.x, this.buddy.z - h.z) < 2.4) return { kind: 'revive', id: 0, x: this.buddy.x, z: this.buddy.z, need: 1.2 };
    for (const c of this.chests) if (!c.opened && Math.hypot(c.x - h.x, c.z - h.z) < 2.2) return { kind: 'open', id: c.id, x: c.x, z: c.z, need: 0.55 };
    const st = this.stageDef;
    if (st?.kind === 'hold' && !this.hold.on && Math.hypot(this.hold.x - h.x, this.hold.z - h.z) < 4.5) return { kind: 'start', id: 0, x: this.hold.x, z: this.hold.z, need: 0 };
    if (st?.kind === 'return' && this.boardable() && Math.hypot(this.convoy.x - h.x, this.convoy.z - h.z) < 5.2) return { kind: 'board', id: 0, x: this.convoy.x, z: this.convoy.z, need: 0 };
    return null;
  }

  /** Every freed survivor is at the convoy (or there is none). */
  boardable(): boolean {
    return this.survivors.every((s) => s.state === 'safe' || s.state === 'trapped' || Math.hypot(s.x - this.convoy.x, s.z - this.convoy.z) < 9);
  }

  private updateUse(dt: number, inp: Input): void {
    const h = this.hero;
    const c = this.context();
    if (!c) { h.useT = 0; h.useKind = ''; return; }
    if (c.need <= 0) {
      if (inp.use) this.doUse(c.kind, c.id);
      return;
    }
    if (inp.useHeld || inp.use) {
      if (h.useKind !== c.kind || h.useId !== c.id) { h.useKind = c.kind; h.useId = c.id; h.useT = 0; }
      h.useT += dt;
      if (h.useT >= c.need) { h.useT = 0; h.useKind = ''; this.doUse(c.kind, c.id); }
    } else { h.useT = 0; h.useKind = ''; }
  }

  private doUse(kind: string, id: number): void {
    const h = this.hero;
    if (kind === 'free') {
      const s = this.survivors.find((v) => v.id === id)!;
      s.state = 'follow';
      this.run.score += 500;
      this.events.push({ type: 'freed', who: s.who, x: s.x, z: s.z });
      this.used.add('use');
      // the rescue stage completes when all of its survivors are out
      const st = this.stageDef;
      if (st?.kind === 'rescue' && this.survivors.filter((v) => this.stageSurvivor(v, st)).every((v) => v.state !== 'trapped')) this.stageDone();
    } else if (kind === 'open') {
      const c = this.chests.find((v) => v.id === id)!;
      c.opened = true;
      this.stats.chests++;
      this.used.add('use');
      const k = this.m.chests;
      const scrap = Math.round((c.special ? 30 : 12 + this.rnd() * 10) * k * this.m.scrap);
      const ammo = Math.round(this.gun.mag * (c.special ? 2 : 1) * this.tune.ammo);
      this.stats.scrap += scrap;
      this.run.scrap += scrap;
      h.reserve += ammo;
      if (c.special) { const sup = (this.m.goldenDog ? 2 : 1) * k; this.stats.supplies += sup; this.run.supplies += sup; }
      if (this.rnd() < 0.35 || c.special) this.drop('med', c.x + 0.8, c.z + 0.5, 1);
      this.events.push({ type: 'chest', special: c.special, x: c.x, z: c.z, scrap, ammo });
      if (c.item) this.items.push({ id: this.nextId++, kind: c.item, x: c.x + 0.9, z: c.z + 0.9, taken: false, hidden: false });
      if (this.dog.chest === c.id) { this.dog.state = 'follow'; this.dog.chest = -1; }
    } else if (kind === 'revive' && this.buddy) {
      this.buddy.down = 0; this.buddy.hp = this.buddy.max * 0.5;
      this.events.push({ type: 'buddyUp' });
    } else if (kind === 'start') {
      this.hold.on = true;
      this.events.push({ type: 'holdStart' });
      // the noise of the work calls a crowd
      this.makeNoise(this.hold.x, this.hold.z, 26, 0);
    } else if (kind === 'board') {
      for (const s of this.survivors) if (s.state === 'follow') s.state = 'safe';
      this.phase = 'won';
      this.events.push({ type: 'win' });
    }
  }

  // ---------------------------------------------------------------- hurt

  hurtHero(dmg: number, dot = false): void {
    const h = this.hero;
    if (!h.alive || this.phase !== 'play') return;
    if (!dot && h.invuln > 0) return;
    const armour = h.step === 'pre3' ? 0.5 : 1;
    h.hp -= dmg * armour;
    if (!dot) {
      h.invuln = 0.3;
      if (h.step !== 'pre3') { h.hurtT = 0.35; }
      this.events.push({ type: 'hurt', dmg: Math.round(dmg * armour), who: 'hero' });
    }
    if (h.hp <= 0) {
      if (this.m.second && !h.secondUsed) { h.secondUsed = true; h.hp = h.max * 0.5; h.invuln = 2; this.shove(h.x, h.z, 6, 20, 2, 1.5); this.events.push({ type: 'revive' }); return; }
      if (this.m.selfRevive && !h.secondUsed) { h.secondUsed = true; h.hp = h.max * 0.4; h.invuln = 2; this.shove(h.x, h.z, 5, 10, 2, 1.2); this.events.push({ type: 'revive' }); return; }
      h.hp = 0;
      h.alive = false;
      h.step = 'none';
      this.phase = 'lost';
      this.events.push({ type: 'lose', why: 'hero' });
    }
  }

  hurtTruck(dmg: number): void {
    const tr = this.truck;
    if (!tr || this.phase !== 'play') return;
    tr.hp -= dmg;
    this.events.push({ type: 'hurt', dmg: Math.round(dmg), who: 'truck' });
    if (tr.hp <= 0) { tr.hp = 0; this.phase = 'lost'; this.events.push({ type: 'lose', why: 'truck' }); }
  }

  private release(z: Zombie | null): void {
    const h = this.hero;
    if (h.grab < 0) return;
    h.grab = -1; h.grabT = 0; h.mash = 0;
    if (z && z.state === 'grab') { z.state = 'stun'; z.stun = 0.8; z.t = 0; const d = Math.hypot(z.x - h.x, z.z - h.z) || 1; z.kx += ((z.x - h.x) / d) * 5; z.kz += ((z.z - h.z) / d) * 5; }
    this.events.push({ type: 'free' });
  }

  /** A rewarded continue: back up at 60 %, the crowd pushed back. */
  revive(): void {
    const h = this.hero;
    h.alive = true; h.hp = h.max * 0.6; h.invuln = 3; h.grab = -1;
    if (this.truck && this.truck.hp <= 0) this.truck.hp = this.truck.max * 0.5;
    for (const s of this.survivors) if (s.hp <= 0) { s.hp = s.max * 0.5; s.state = 'follow'; }
    this.shove(h.x, h.z, 9, 0, 3, 2.5);
    for (const z of this.zombies) if (z.state !== 'dead' && Math.hypot(z.x - h.x, z.z - h.z) < 5) { z.hp = 0; this.kill(z, false); }
    this.phase = 'play';
    this.events.push({ type: 'revive' });
  }

  // ---------------------------------------------------------------- the squadmate

  private updateBuddy(dt: number): void {
    const b = this.buddy, h = this.hero;
    if (!b) return;
    b.firedT += dt;
    if (b.down > 0) {
      b.down -= dt;
      if (b.down <= 0) { b.hp = b.max * 0.4; this.events.push({ type: 'buddyUp' }); }
      return;
    }
    const B = HERO[b.id];
    const G = GUN[B.gun];
    // stay 3 to 6 m behind the survivor, out of their line
    const dx = h.x - b.x, dz = h.z - b.z, d = Math.hypot(dx, dz);
    let vx = 0, vz = 0;
    if (d > 5) {
      if (lineClear(this.plan, b.x, b.z, h.x, h.z) || !this.flow.dir(b.x, b.z, tv)) { vx = dx / d; vz = dz / d; }
      else { vx = tv.x; vz = tv.z; }
      const s = Math.min(1, (d - 3) / 3) * B.speed * 0.98;
      vx *= s; vz *= s;
    }
    b.moving = Math.hypot(vx, vz) > 0.3;
    b.x += vx * dt; b.z += vz * dt;
    this.collide(b, 0.4);
    // shoot the nearest zombie in range
    b.fireT -= dt;
    const t = this.aimAssist(b.x, b.z, Math.sin(b.face), Math.cos(b.face), G.range * 0.9, Math.PI);
    b.lock = t ? t.id : -1;
    if (t) {
      b.face = turn(b.face, Math.atan2(t.x - b.x, t.z - b.z), dt * 10);
      if (b.fireT <= 0) {
        b.fireT = Math.max(0.2, G.rate * 1.8);
        b.firedT = 0;
        const a = b.face;
        const tx: number[] = [], tz: number[] = [];
        for (let p = 0; p < Math.min(3, G.pellets); p++) {
          const end = this.ray(b.x, b.z, a + (this.rnd() - 0.5) * G.spread * 0.6 * Math.PI / 180, G.range, G.dmg * 0.65 * (G.pellets > 1 ? 1.6 : 1), G.pierce, G.knock * 0.6, false, false, false);
          tx.push(end.x); tz.push(end.z);
        }
        this.events.push({ type: 'shot', gun: G.id, x: b.x, z: b.z, tx, tz, big: false, who: 'buddy' });
        this.makeNoise(b.x, b.z, G.noise * 0.5, G.loud * 0.3);
      }
    } else if (b.moving) b.face = turn(b.face, Math.atan2(vx, vz), dt * 8);
    // their ability, when it helps: the medic heals a hurt survivor, the brawler cries out in a crowd
    b.abilityT -= dt;
    if (b.abilityT <= 0) {
      const crowd = this.zombies.filter((z) => z.state !== 'dead' && z.state !== 'lurk' && Math.hypot(z.x - b.x, z.z - b.z) < 5).length;
      if (B.ability === 'heal' && h.hp < h.max * 0.55 && d < 7) { h.hp = Math.min(h.max, h.hp + 25); b.abilityT = 22; this.events.push({ type: 'ability', kind: 'heal', x: b.x, z: b.z, r: 7 }); }
      else if (B.ability === 'warcry' && crowd >= 4) { this.shove(b.x, b.z, 5.5, 8, 1.4, 1.2); b.abilityT = 20; this.events.push({ type: 'ability', kind: 'warcry', x: b.x, z: b.z, r: 5.5 }); }
      else b.abilityT = 2;
    }
  }

  private hurtBuddy(dmg: number): void {
    const b = this.buddy;
    if (!b || b.down > 0) return;
    b.hp -= dmg;
    this.events.push({ type: 'hurt', dmg: Math.round(dmg), who: 'buddy' });
    if (b.hp <= 0) { b.hp = 0; b.down = 9; this.events.push({ type: 'buddyDown' }); }
  }

  // ---------------------------------------------------------------- the dog

  private updateDog(dt: number, inp: Input): void {
    const g = this.dog, h = this.hero, m = this.m;
    g.biteT = Math.max(0, g.biteT - dt);
    g.barkT = Math.max(0, g.barkT - dt);
    g.cmdCd = Math.max(0, g.cmdCd - dt);
    g.t += dt;
    if (g.state === 'down') {
      g.down -= dt;
      if (g.down <= 0) { g.state = 'follow'; g.hp = 60; }
      return;
    }
    // the command: attack the foe in the aim, else sniff out the nearest closed chest
    if (inp.dog && g.cmdCd <= 0) {
      g.cmdCd = 1;
      this.used.add('dog');
      const t = h.lock >= 0 ? this.zombies.find((z) => z.id === h.lock) : this.aimAssist(h.x, h.z, h.aimX, h.aimZ, 16, 0.9);
      if (t && t.state !== 'dead') { g.state = 'attack'; g.target = t.id; g.t = 0; this.events.push({ type: 'sic' }); }
      else this.sniff();
    }
    // barks at crawlers hidden near the survivor
    for (const z of this.zombies) {
      if (z.state !== 'lurk') continue;
      const d = Math.hypot(z.x - h.x, z.z - h.z);
      if (z.reveal <= 0 && d < 12) {
        z.reveal = 1.3;
        g.barkT = 0.8;
        this.events.push({ type: 'bark', x: g.x, z: g.z });
        this.events.push({ type: 'reveal', x: z.x, z: z.z });
      }
      if (z.reveal > 0 && z.reveal < 50) { z.reveal -= dt; if (z.reveal <= 0) { z.state = 'rise'; z.t = 0; this.events.push({ type: 'rise', x: z.x, z: z.z }); } }
      else if (z.reveal >= 50 && d < 6) { z.state = 'rise'; z.t = 0; this.events.push({ type: 'rise', x: z.x, z: z.z }); }
    }
    let tx = h.x - Math.sin(h.face) * 1.6 + Math.cos(h.face) * 1.4, tz = h.z - Math.cos(h.face) * 1.6 - Math.sin(h.face) * 1.4, speed = g.speed;
    if (g.state === 'follow') {
      // bite whatever comes close to the survivor
      const near = this.zombies.find((z) => z.state !== 'dead' && z.state !== 'lurk' && !z.boss && Math.hypot(z.x - h.x, z.z - h.z) < 4.5 && Math.hypot(z.x - g.x, z.z - g.z) < 7);
      if (near) { g.state = 'attack'; g.target = near.id; g.t = 0; }
    }
    if (g.state === 'attack') {
      const t = this.zombies.find((z) => z.id === g.target);
      if (!t || t.state === 'dead' || g.t > 8) { g.state = 'follow'; g.target = -1; }
      else {
        tx = t.x; tz = t.z;
        const d = Math.hypot(t.x - g.x, t.z - g.z);
        if (d < t.r + 0.9 && g.biteT <= 0) {
          g.biteT = 0.85;
          this.damage(t, 11 * m.dogDmg, { kx: (t.x - g.x) / (d || 1), kz: (t.z - g.z) / (d || 1), knock: 0.3, crit: false, melee: true, breaks: false, big: false });
          if (m.dogPin && (t.state as ZState) !== 'dead' && !t.boss) { t.state = 'stun'; t.stun = m.dogPin; t.t = 0; }
          this.events.push({ type: 'bite', x: t.x, z: t.z });
        }
        if (d < t.r + 0.7) { tx = g.x; tz = g.z; }
      }
    }
    if (g.state === 'sniff') {
      const pt = g.trail[g.ti];
      const c = this.chests.find((v) => v.id === g.chest);
      if (!c || c.opened) { g.state = 'follow'; g.chest = -1; }
      else if (pt) {
        tx = pt.x; tz = pt.z;
        if (Math.hypot(pt.x - g.x, pt.z - g.z) < 1.2) g.ti++;
      } else {
        g.state = 'wait';
        this.events.push({ type: 'found', x: c.x, z: c.z });
      }
    }
    if (g.state === 'wait') {
      const c = this.chests.find((v) => v.id === g.chest);
      if (!c || c.opened || g.t > 25) { g.state = 'follow'; g.chest = -1; }
      else { tx = c.x + 1; tz = c.z + 1; if (g.barkT <= 0 && Math.hypot(h.x - c.x, h.z - c.z) > 4) { g.barkT = 2.5; this.events.push({ type: 'bark', x: g.x, z: g.z }); } }
    }
    const dx = tx - g.x, dz = tz - g.z, d = Math.hypot(dx, dz);
    let vx = 0, vz = 0;
    if (d > 0.5) {
      if (g.state === 'follow' && Math.hypot(h.x - g.x, h.z - g.z) < 2.6) speed *= 0.35;
      if (lineClear(this.plan, g.x, g.z, tx, tz)) { vx = dx / d; vz = dz / d; }
      else if (this.flow.dir(g.x, g.z, tv) && g.state === 'follow') { vx = tv.x; vz = tv.z; }
      else { vx = dx / d; vz = dz / d; }
      const s = Math.min(speed, d * 3 + 1);
      vx *= s; vz *= s;
    }
    g.x += vx * dt; g.z += vz * dt;
    this.collide(g, 0.35);
    if (Math.hypot(vx, vz) > 0.4) g.face = turn(g.face, Math.atan2(vx, vz), dt * 10);
    else if (g.state === 'attack') { const t = this.zombies.find((z) => z.id === g.target); if (t) g.face = turn(g.face, Math.atan2(t.x - g.x, t.z - g.z), dt * 10); }
    // never lost: snaps back when far behind
    if (Math.hypot(h.x - g.x, h.z - g.z) > 30 && g.state === 'follow') { g.x = h.x - 1; g.z = h.z + 1; this.collide(g, 0.35); }
  }

  /** The dog's nose: the path (down a flow field from the survivor) to the nearest closed chest. */
  sniff(): void {
    const g = this.dog, h = this.hero;
    let best: Chest | null = null, bd = 1e9;
    for (const c of this.chests) {
      if (c.opened) continue;
      const d = Math.hypot(c.x - h.x, c.z - h.z) - (c.item ? 6 : 0) - (c.special && this.m.dogSupplies ? 10 : 0);
      if (d < bd) { bd = d; best = c; }
    }
    if (!best) { this.events.push({ type: 'bark', x: g.x, z: g.z }); return; }
    const f = new Flow(this.plan);
    f.setBlocked(this.extraSolids());
    f.build([best]);
    const trail: Spot[] = [];
    const p = { x: g.x, z: g.z };
    for (let i = 0; i < 160; i++) {
      if (!f.dir(p.x, p.z, tv)) break;
      p.x += tv.x * 1.2; p.z += tv.z * 1.2;
      if (i % 2 === 0) trail.push({ x: p.x, z: p.z });
      if (Math.hypot(p.x - best.x, p.z - best.z) < 1.6) break;
    }
    trail.push({ x: best.x + 0.8, z: best.z + 0.8 });
    g.trail = trail; g.ti = 0; g.chest = best.id; g.state = 'sniff'; g.t = 0;
    this.events.push({ type: 'sniff' });
  }

  private hurtDog(dmg: number): void {
    const g = this.dog;
    if (g.state === 'down') return;
    g.hp -= dmg;
    if (g.hp <= 0) { g.state = 'down'; g.down = 7; this.events.push({ type: 'dogDown' }); }
  }

  // ---------------------------------------------------------------- survivors

  private updateSurvivors(dt: number): void {
    const h = this.hero;
    let k = 0;
    for (const s of this.survivors) {
      s.hurtT = Math.max(0, s.hurtT - dt);
      if (s.state === 'trapped') {
        s.face = turn(s.face, Math.atan2(h.x - s.x, h.z - s.z), dt * 3);
        if (Math.hypot(h.x - s.x, h.z - s.z) < 18 && this.rnd() < dt * 0.3) this.events.push({ type: 'help', x: s.x, z: s.z });
        continue;
      }
      if (s.state === 'safe') { s.x += (this.convoy.x - 2 - s.x) * dt; s.z += (this.convoy.z - 2.6 - s.z) * dt; continue; }
      if (s.state === 'down') continue;
      // follow in a loose line behind the survivor
      k++;
      const back = 2 + k * 1.5;
      const tx = h.x - Math.sin(h.face) * back, tz = h.z - Math.cos(h.face) * back;
      const dx = tx - s.x, dz = tz - s.z, d = Math.hypot(dx, dz);
      if (d > 0.8) {
        let vx = dx / d, vz = dz / d;
        if (!lineClear(this.plan, s.x, s.z, tx, tz) && this.flow.dir(s.x, s.z, tv)) { vx = tv.x; vz = tv.z; }
        const sp = Math.min(5.2, d * 2);
        s.x += vx * sp * dt; s.z += vz * sp * dt;
        s.face = turn(s.face, Math.atan2(vx, vz), dt * 8);
      }
      this.collide(s, 0.4);
      // freed survivors of the squad fight beside you
      if (s.armed) {
        s.fireT -= dt;
        const G = GUN[HERO[s.body].gun];
        const t = this.aimAssist(s.x, s.z, Math.sin(s.face), Math.cos(s.face), G.range * 0.8, Math.PI);
        if (t && s.fireT <= 0) {
          s.fireT = Math.max(0.3, G.rate * 2.2);
          const a = Math.atan2(t.x - s.x, t.z - s.z);
          s.face = a;
          const end = this.ray(s.x, s.z, a, G.range, G.dmg * 0.5 * (G.pellets > 1 ? 2 : 1), G.pierce, G.knock * 0.5, false, false, false);
          this.events.push({ type: 'shot', gun: G.id, x: s.x, z: s.z, tx: [end.x], tz: [end.z], big: false, who: 'surv' });
        }
      }
      if (Math.hypot(s.x - this.convoy.x, s.z - this.convoy.z) < 6 && this.stageDef?.kind === 'return' && s.state === 'follow') { /* waits by the convoy */ }
    }
  }

  private hurtSurvivor(s: Survivor, dmg: number): void {
    if (s.state !== 'follow' || this.phase !== 'play') return;
    s.hp -= dmg;
    s.hurtT = 0.3;
    this.events.push({ type: 'hurt', dmg: Math.round(dmg), who: 'surv' });
    if (s.hp <= 0) {
      s.hp = 0;
      s.state = 'down';
      this.phase = 'lost';
      this.events.push({ type: 'lose', why: 'surv' });
    }
  }

  // ---------------------------------------------------------------- zombies

  private updateZombies(dt: number): void {
    const h = this.hero;
    const night = 1 + 0.12 * this.night;
    const flare = this.flares.find((f) => f.fly <= 0);
    const zs = this.zombies;
    for (const z of zs) {
      z.t += dt;
      z.hitT += dt;
      z.cd -= dt;
      if (z.state === 'dead') { z.deadT += dt; continue; }
      // airborne (the dash strike's launcher)
      if (z.y > 0 || z.vy > 0) {
        z.vy -= 22 * dt; z.y += z.vy * dt;
        if (z.y <= 0) { z.y = 0; z.vy = 0; if ((z.state as ZState) !== 'dead') { z.state = 'stun'; z.stun = 0.7; z.t = 0; } }
      }
      if (z.burn > 0) { z.burn -= dt; z.hp -= 9 * dt; if (z.hp <= 0) { this.kill(z, false); continue; } }
      if (z.bleed > 0) { z.bleed -= dt; z.hp -= 5 * dt; if (z.hp <= 0) { this.kill(z, true); continue; } }
      // knockback slides
      if (z.kx || z.kz) {
        z.x += z.kx * dt; z.z += z.kz * dt;
        const f = Math.exp(-dt * 9);
        z.kx *= f; z.kz *= f;
        if (Math.abs(z.kx) + Math.abs(z.kz) < 0.05) { z.kx = 0; z.kz = 0; }
      }
      if (z.boss) { this.updateBoss(z, dt); this.collide(z, z.r); continue; }
      // who to go for: the flare draws everything near it; else the nearest of the squad
      let tx = h.x, tz = h.z, tk = 'hero', tid = 0;
      let best = h.alive ? Math.hypot(h.x - z.x, h.z - z.z) : 1e9;
      const consider = (x: number, y: number, k: string, id: number, bias = 0) => { const d = Math.hypot(x - z.x, y - z.z) + bias; if (d < best) { best = d; tx = x; tz = y; tk = k; tid = id; } };
      if (this.buddy && this.buddy.down <= 0) consider(this.buddy.x, this.buddy.z, 'buddy', 0, 1);
      for (const s of this.survivors) if (s.state === 'follow') consider(s.x, s.z, 'surv', s.id, 1);
      // the dog only when it is biting this one or right beside it
      if (this.dog.state !== 'down' && (this.dog.target === z.id || Math.hypot(this.dog.x - z.x, this.dog.z - z.z) < 3)) consider(this.dog.x, this.dog.z, 'dog', 0, 1);
      if (this.truck && this.truck.hp > 0) consider(this.truck.x, this.truck.z, 'truck', 0, -1.5);
      if (flare && Math.hypot(flare.x - z.x, flare.z - z.z) < 24) { tx = flare.x; tz = flare.z; tk = 'flare'; best = Math.hypot(flare.x - z.x, flare.z - z.z); }
      z.tk = tk; z.tid = tid;
      const reachTo = tk === 'truck' ? z.reach + 3 : z.reach + 0.35;
      switch (z.state) {
        case 'lurk': continue;
        case 'rise': if (z.t > 1.1) { z.state = 'hunt'; z.t = 0; } continue;
        case 'stun': z.stun -= dt; if (z.stun <= 0) { z.state = 'hunt'; z.t = 0; } break;
        case 'idle': case 'wander': {
          // notice the survivor in sight
          const dh = Math.hypot(h.x - z.x, h.z - z.z);
          if (h.alive && (dh < 4 || (dh < 13 * (1 + this.night * 0.35) && lineClear(this.plan, z.x, z.z, h.x, h.z)))) { z.state = 'hunt'; z.t = 0; if (this.rnd() < 0.3) this.events.push({ type: 'groan', x: z.x, z: z.z }); break; }
          if (tk === 'flare' || tk === 'truck') { z.state = 'hunt'; z.t = 0; break; }
          if (z.state === 'idle') { if (z.t > 3 + this.rnd() * 4) { z.state = 'wander'; z.t = 0; z.wt = 0; } break; }
          z.wt -= dt;
          if (z.wt <= 0) {
            z.wt = 3 + this.rnd() * 4;
            // wander drifts towards the survivor's part of town as night falls
            const pull = 0.25 + this.night * 0.5;
            const a = this.rnd() * 6.28;
            z.wx = z.x + Math.cos(a) * 6 + (h.x - z.x) * pull * 0.3;
            z.wz = z.z + Math.sin(a) * 6 + (h.z - z.z) * pull * 0.3;
          }
          this.steer(z, z.wx, z.wz, z.walk * night, dt, false);
          if (z.t > 10) { z.state = 'idle'; z.t = 0; }
          break;
        }
        case 'hunt': {
          if (best <= reachTo && z.cd <= 0 && z.y <= 0) {
            z.state = 'tell'; z.t = 0;
            z.face = Math.atan2(tx - z.x, tz - z.z);
            if (z.kind === 'arm' || z.kind === 'chubby') this.events.push({ type: 'tellZ', id: z.id });
            break;
          }
          // the brute charges from mid range
          if (z.kind === 'chubby' && z.cd <= 0 && best < 9 && best > 3 && tk === 'hero' && lineClear(this.plan, z.x, z.z, tx, tz)) {
            z.state = 'tell'; z.t = 0; z.move = 'charge'; z.ax = tx - z.x; z.az = tz - z.z;
            const l = Math.hypot(z.ax, z.az) || 1; z.ax /= l; z.az /= l;
            z.face = Math.atan2(z.ax, z.az);
            this.events.push({ type: 'tellZ', id: z.id });
            break;
          }
          const spd = z.run * night * (tk === 'flare' ? 1.1 : 1);
          if (best < reachTo * 0.9) { z.face = turn(z.face, Math.atan2(tx - z.x, tz - z.z), dt * 8); break; }
          this.steer(z, tx, tz, spd, dt, tk !== 'flare' && tk !== 'dog');
          break;
        }
        case 'tell': {
          const tell = z.move === 'charge' ? 0.65 : ZOMBIE[z.kind as Exclude<ZKind, 'boss'>].tell;
          if (z.move !== 'charge') z.face = turn(z.face, Math.atan2(tx - z.x, tz - z.z), dt * 4);
          if (z.t >= tell) {
            if (z.move === 'charge') { z.state = 'charge'; z.t = 0; }
            else { z.state = 'strike'; z.t = 0; this.zombieStrike(z, tx, tz, tk, tid); }
          }
          break;
        }
        case 'strike': if (z.t > 0.45) { z.state = 'hunt'; z.t = 0; z.cd = ZOMBIE[z.kind as Exclude<ZKind, 'boss'>].cd * (0.8 + this.rnd() * 0.4); } break;
        case 'grab': {
          z.face = Math.atan2(h.x - z.x, h.z - z.z);
          const d = Math.hypot(h.x - z.x, h.z - z.z);
          if (d > 1.2) { z.x += ((h.x - z.x) / d) * (d - 1.0); z.z += ((h.z - z.z) / d) * (d - 1.0); }
          if (h.grab !== z.id) { z.state = 'stun'; z.stun = 0.5; z.t = 0; }
          break;
        }
        case 'charge': {
          const sp = 7.5 * this.tune.zSpeed;
          const ox = z.x, oz = z.z;
          z.x += z.ax * sp * dt; z.z += z.az * sp * dt;
          const p = { x: z.x, z: z.z };
          const hitWall = pushOut(this.plan, p, z.r, this.extraSolids()) > 0.01;
          z.x = p.x; z.z = p.z;
          if (h.alive && Math.hypot(h.x - z.x, h.z - z.z) < z.r + 0.6) {
            this.hurtHero(z.dmg * 1.15);
            h.x += z.ax * 1.2; h.z += z.az * 1.2;
            this.collide(h, 0.42);
            z.state = 'hunt'; z.t = 0; z.cd = 3; z.move = null;
          } else if (hitWall || z.t > 1.3 || (Math.abs(ox - z.x) + Math.abs(oz - z.z) < 0.01)) {
            z.state = 'stun'; z.stun = hitWall ? 1.4 : 0.5; z.t = 0; z.cd = 3.2; z.move = null;
            if (hitWall) this.events.push({ type: 'slam', x: z.x, z: z.z, r: 1.2 });
          }
          for (const w of this.walls) if (!w.down && Math.hypot(w.x - z.x, w.z - z.z) < 2.2) this.hitWall(w, 30);
          break;
        }
      }
      this.collide(z, z.r);
    }
    // crowding: zombies push each other apart (a light pass)
    for (let i = 0; i < zs.length; i++) {
      const a = zs[i];
      if (a.state === 'dead' || a.state === 'lurk') continue;
      for (let j = i + 1; j < zs.length; j++) {
        const b = zs[j];
        if (b.state === 'dead' || b.state === 'lurk') continue;
        const dx = b.x - a.x, dz = b.z - a.z, m = a.r + b.r;
        if (Math.abs(dx) > m || Math.abs(dz) > m) continue;
        const d = Math.hypot(dx, dz);
        if (d >= m || d < 1e-4) continue;
        const push = (m - d) * 0.5, ux = dx / d, uz = dz / d;
        const wa = a.boss ? 0.1 : 1, wb = b.boss ? 0.1 : 1;
        a.x -= ux * push * wa; a.z -= uz * push * wa;
        b.x += ux * push * wb; b.z += uz * push * wb;
      }
      // and the squad: nobody walks through a zombie
      for (const o of [h, this.buddy, this.dog] as ({ x: number; z: number } | null)[]) {
        if (!o) continue;
        const dx = a.x - o.x, dz = a.z - o.z, m = a.r + 0.4, d = Math.hypot(dx, dz);
        if (d < m && d > 1e-4) { a.x += (dx / d) * (m - d) * 0.6; a.z += (dz / d) * (m - d) * 0.6; }
      }
    }
    // corpses fade (the view keeps them 4 s)
    if (zs.length > 60 || this.time % 1 < dt) this.zombies = zs.filter((z) => z.state !== 'dead' || z.deadT < 4);
  }

  /** Steps a zombie towards (tx, tz): straight when in sight, else down the flow field. */
  private steer(z: Zombie, tx: number, tz: number, spd: number, dt: number, useFlow: boolean): void {
    const dx = tx - z.x, dz = tz - z.z, d = Math.hypot(dx, dz);
    if (d < 0.05) return;
    let vx = dx / d, vz = dz / d;
    if (d > 3 && !lineClear(this.plan, z.x, z.z, tx, tz, this.extraSolids())) {
      const f = this.flares.find((fl) => fl.fly <= 0);
      const field = f && z.tk === 'flare' ? this.flareFlow : this.flow;
      if ((useFlow || z.tk === 'flare') && field.dir(z.x, z.z, tv)) { vx = tv.x; vz = tv.z; }
    }
    z.x += vx * spd * dt; z.z += vz * spd * dt;
    z.face = turn(z.face, Math.atan2(vx, vz), dt * 6);
    // a barricade in the way gets attacked
    for (const w of this.walls) {
      if (w.down || w.kind !== 'barricade') continue;
      const cx = Math.max(w.rect.x0, Math.min(z.x, w.rect.x1)), cz = Math.max(w.rect.z0, Math.min(z.z, w.rect.z1));
      if (Math.hypot(cx - z.x, cz - z.z) < z.r + 0.25 && z.cd <= 0) {
        z.cd = ZOMBIE[z.kind as Exclude<ZKind, 'boss'>]?.cd ?? 1.5;
        z.state = 'strike'; z.t = 0;
        this.hitWall(w, z.dmg * 1.2);
        if (w.spikes) this.damage(z, 10, { kx: -vx, kz: -vz, knock: 0.6, crit: false, melee: false, breaks: false, big: false });
      }
    }
  }

  private zombieStrike(z: Zombie, tx: number, tz: number, tk: string, tid: number): void {
    const d = Math.hypot(tx - z.x, tz - z.z);
    if (tk === 'truck' && this.truck) {
      if (d < z.reach + 3.4) this.hurtTruck(z.dmg);
      return;
    }
    if (d > z.reach + 0.6) return;
    if (tk === 'hero') {
      const h = this.hero;
      if (h.invuln > 0 || !h.alive) return;
      if (z.kind === 'arm') {
        // pulls the survivor in
        const l = d || 1;
        h.x -= ((h.x - z.x) / l) * Math.max(0, d - 1.3) * 0.7; h.z -= ((h.z - z.z) / l) * Math.max(0, d - 1.3) * 0.7;
        this.collide(h, 0.42);
        this.events.push({ type: 'pull' });
      }
      this.hurtHero(z.dmg);
      if (z.kind === 'basic' && h.grab < 0 && h.dodgeT <= 0 && this.rnd() < 0.35 && h.alive) {
        h.grab = z.id; h.grabT = 0; h.mash = 0;
        z.state = 'grab'; z.t = 0;
        this.events.push({ type: 'grab' });
      }
    } else if (tk === 'buddy') this.hurtBuddy(z.dmg * 0.8);
    else if (tk === 'surv') { const s = this.survivors.find((v) => v.id === tid); if (s) this.hurtSurvivor(s, z.dmg * 0.7); }
    else if (tk === 'dog') this.hurtDog(z.dmg);
  }

  // ---------------------------------------------------------------- the boss

  private updateBoss(z: Zombie, dt: number): void {
    const h = this.hero;
    const frac = z.hp / z.max;
    const phase = frac > 0.6 ? 1 : frac > 0.3 ? 2 : 3;
    if (phase !== z.phase) {
      if (z.phase > 0) { z.state = 'tell'; z.move = 'roar'; z.t = 0; this.events.push({ type: 'tell', move: 'roar', x: z.x, z: z.z, r: 0 }); }
      z.phase = phase;
    }
    const rage = phase === 3 ? 1.3 : 1;
    let tx = h.x, tz = h.z;
    if (this.truck && this.truck.hp > 0 && Math.hypot(this.truck.x - z.x, this.truck.z - z.z) < Math.hypot(h.x - z.x, h.z - z.z) - 2) { tx = this.truck.x; tz = this.truck.z; }
    const d = Math.hypot(tx - z.x, tz - z.z);
    switch (z.state) {
      case 'stun': z.stun -= dt; if (z.stun <= 0) { z.state = 'hunt'; z.t = 0; } return;
      case 'idle': case 'wander': case 'lurk': case 'rise': z.state = 'hunt'; return;
      case 'hunt': {
        if (z.cd <= 0) {
          // pick a move: slam close, charge at range
          if (d < 5.5) { z.move = 'slam'; z.state = 'tell'; z.t = 0; this.events.push({ type: 'tell', move: 'slam', x: z.x, z: z.z, r: phase === 3 ? 6 : 4.6 }); return; }
          if (d < 16 && lineClear(this.plan, z.x, z.z, tx, tz)) {
            z.move = 'charge'; z.state = 'tell'; z.t = 0;
            z.ax = (tx - z.x) / d; z.az = (tz - z.z) / d;
            z.face = Math.atan2(z.ax, z.az);
            this.events.push({ type: 'tell', move: 'charge', x: z.x, z: z.z, r: 0 });
            return;
          }
        }
        if (d > 2.2) this.steer(z, tx, tz, z.run * rage, dt, true);
        else z.face = turn(z.face, Math.atan2(tx - z.x, tz - z.z), dt * 4);
        return;
      }
      case 'tell': {
        const tell = z.move === 'roar' ? 1.2 : z.move === 'slam' ? 0.95 / rage : 0.8 / rage;
        if (z.move === 'slam') z.face = turn(z.face, Math.atan2(tx - z.x, tz - z.z), dt * 3);
        if (z.t < tell) return;
        if (z.move === 'slam') {
          const r = phase === 3 ? 6 : 4.6;
          this.events.push({ type: 'slam', x: z.x, z: z.z, r });
          if (Math.hypot(h.x - z.x, h.z - z.z) < r) { this.hurtHero(z.dmg); const l = Math.hypot(h.x - z.x, h.z - z.z) || 1; h.x += ((h.x - z.x) / l) * 2; h.z += ((h.z - z.z) / l) * 2; this.collide(h, 0.42); }
          if (this.buddy && Math.hypot(this.buddy.x - z.x, this.buddy.z - z.z) < r) this.hurtBuddy(z.dmg * 0.6);
          if (this.truck && Math.hypot(this.truck.x - z.x, this.truck.z - z.z) < r + 2.5) this.hurtTruck(z.dmg);
          for (const w of this.walls) if (!w.down && Math.hypot(w.x - z.x, w.z - z.z) < r + 1) this.hitWall(w, 80);
          z.state = 'strike'; z.t = 0; z.cd = 2.2 / rage;
        } else if (z.move === 'charge') { z.state = 'charge'; z.t = 0; }
        else {
          // the roar: the armour comes up and the horde answers
          this.events.push({ type: 'roar', x: z.x, z: z.z });
          z.armor = true;
          this.events.push({ type: 'armor' });
          const n = Math.round((4 + phase * 2) * this.tune.zCount);
          const s = this.farSpawn(14, 40);
          for (let i = 0; i < n; i++) { const zz = this.spawn(this.rnd() < 0.6 ? 'basic' : 'runner', s.x + (this.rnd() - 0.5) * 5, s.z + (this.rnd() - 0.5) * 5, 'hunt'); zz.wave = true; }
          z.state = 'hunt'; z.t = 0; z.cd = 1.5;
        }
        return;
      }
      case 'strike': if (z.t > 0.6) { z.state = 'hunt'; z.t = 0; } return;
      case 'charge': {
        const sp = 10 * rage;
        z.x += z.ax * sp * dt; z.z += z.az * sp * dt;
        const p = { x: z.x, z: z.z };
        const hitWall = pushOut(this.plan, p, z.r, this.extraSolids()) > 0.02;
        z.x = p.x; z.z = p.z;
        if (h.alive && Math.hypot(h.x - z.x, h.z - z.z) < z.r + 0.7 && h.invuln <= 0) {
          this.hurtHero(z.dmg * 1.2);
          h.x += z.az * 2.5 * (Math.random() < 0.5 ? 1 : -1); h.z -= z.ax * 2.5;
          this.collide(h, 0.42);
        }
        for (const w of this.walls) if (!w.down && Math.hypot(w.x - z.x, w.z - z.z) < 3) this.hitWall(w, 120);
        if (hitWall || z.t > 1.6) {
          z.state = 'stun'; z.stun = hitWall ? 2 : 0.8; z.t = 0; z.cd = 2.6 / rage;
          if (hitWall) this.events.push({ type: 'slam', x: z.x, z: z.z, r: 2 });
        }
        return;
      }
    }
  }

  // ---------------------------------------------------------------- flares, walls, pickups

  private updateFlares(dt: number): void {
    const r = this.m.abilityRank;
    for (const f of this.flares) {
      if (f.fly > 0) { f.fly -= dt; if (f.fly <= 0) this.flowT = 0; continue; }
      f.t += dt;
      if (r >= 2) for (const z of this.zombies) if (z.state !== 'dead' && z.state !== 'lurk' && Math.hypot(z.x - f.x, z.z - f.z) < 2.6) { z.hp -= 12 * dt; z.hitT = 0; if (z.hp <= 0) this.kill(z, false); }
      if (f.t >= f.life && r >= 3) {
        this.events.push({ type: 'blast', x: f.x, z: f.z, r: 4 });
        for (const z of this.zombies) { if (z.state === 'dead') continue; const d = Math.hypot(z.x - f.x, z.z - f.z); if (d < 4) this.damage(z, 70, { kx: (z.x - f.x) / (d || 1), kz: (z.z - f.z) / (d || 1), knock: 2, crit: false, melee: false, breaks: true, big: true }); }
      }
    }
    this.flares = this.flares.filter((f) => f.t < f.life);
  }

  private updateWalls(dt: number): void {
    for (const w of this.walls) {
      if (w.kind !== 'barricade' || w.down) { w.t = Math.max(0, w.t - dt); continue; }
      w.t -= dt;
      if (w.t <= 0) { w.down = true; this.events.push({ type: 'wallDown', x: w.x, z: w.z, gate: false }); this.flowT = 0; }
    }
    this.walls = this.walls.filter((w) => !w.down || w.kind === 'gate');
  }

  private updatePickups(dt: number): void {
    const h = this.hero;
    for (const p of this.pickups) {
      p.t += dt;
      const d = Math.hypot(h.x - p.x, h.z - p.z);
      if (d < 3.2 && p.t > 0.4) { p.x += ((h.x - p.x) / (d || 1)) * dt * 9; p.z += ((h.z - p.z) / (d || 1)) * dt * 9; }
      if (d < 1.1 && p.t > 0.4) {
        p.t = -99;
        if (p.kind === 'scrap') { const v = Math.round(p.v * this.m.scrap); this.stats.scrap += v; this.run.scrap += v; this.events.push({ type: 'pickup', kind: 'scrap', v, x: p.x, z: p.z }); }
        else if (p.kind === 'ammo') { const v = Math.round(this.gun.mag * this.tune.ammo * this.m.ammo); h.reserve += v; this.events.push({ type: 'pickup', kind: 'ammo', v, x: p.x, z: p.z }); }
        else { const v = Math.round(30 * this.tune.hp); h.hp = Math.min(h.max, h.hp + v); this.events.push({ type: 'pickup', kind: 'med', v, x: p.x, z: p.z }); }
      }
    }
    this.pickups = this.pickups.filter((p) => p.t >= 0 && p.t < 40);
    // objective items
    const st = this.stageDef;
    for (const it of this.items) {
      if (it.taken || it.hidden) continue;
      if (Math.hypot(h.x - it.x, h.z - it.z) < 1.4) {
        it.taken = true;
        this.stats.items++;
        this.run.score += 200;
        const of = st?.kind === 'collect' && st.item === it.kind ? st.n ?? 1 : 1;
        const got = this.items.filter((v) => v.taken && v.kind === it.kind).length;
        this.events.push({ type: 'item', kind: it.kind, got, of, x: it.x, z: it.z });
        if (st?.kind === 'collect' && st.item === it.kind && got >= of) this.stageDone();
      }
    }
  }

  // ---------------------------------------------------------------- stages and spawns

  private updateStage(dt: number): void {
    const st = this.stageDef;
    if (!st) return;
    if (st.kind === 'hold' && this.hold.on) {
      const inside = Math.hypot(this.hero.x - this.hold.x, this.hero.z - this.hold.z) < this.hold.r;
      if (inside) this.hold.t += dt;
      // a crowd comes at the noise every few seconds
      if (Math.floor((this.hold.t - dt) / 7) !== Math.floor(this.hold.t / 7) && this.alive < this.tune.cap) {
        const s = this.farSpawn(18, 45);
        const n = Math.round((2 + (this.def?.n ?? 1) * 0.2) * this.tune.zCount);
        for (let i = 0; i < n; i++) { const z = this.spawn(this.pickKind(), s.x + (this.rnd() - 0.5) * 5, s.z + (this.rnd() - 0.5) * 5, 'hunt'); z.wave = true; }
      }
      if (this.hold.t >= (st.secs ?? 30)) { this.hold.on = false; this.events.push({ type: 'holdDone' }); this.stageDone(); }
    }
    if (st.kind === 'boss' && this.boss && this.boss.state === 'dead') { this.run.score += 0; this.stageDone(); }
    if (st.kind === 'return') {
      // survivors near the convoy climb aboard by themselves
      for (const s of this.survivors) if (s.state === 'follow' && Math.hypot(s.x - this.convoy.x, s.z - this.convoy.z) < 5 && Math.hypot(this.hero.x - this.convoy.x, this.hero.z - this.convoy.z) < 6) { s.state = 'safe'; this.events.push({ type: 'safe' }); }
    }
  }

  private updateSpawns(dt: number): void {
    const def = this.def!;
    this.trickleT -= dt;
    if (this.trickleT > 0) return;
    const rate = 1 + (this.tune.night - 1) * this.night;
    this.trickleT = def.trickle / rate;
    if (this.alive >= this.tune.cap) return;
    const n = this.night > 0.6 && this.rnd() < 0.5 ? 2 : 1;
    const s = this.farSpawn();
    for (let i = 0; i < n; i++) this.spawn(this.pickKind(), s.x + (this.rnd() - 0.5) * 3, s.z + (this.rnd() - 0.5) * 3, 'wander');
  }

  // ---------------------------------------------------------------- Last Stand

  private updateStand(dt: number): void {
    const w = this.wave, T = this.tune;
    if (!w.active) {
      w.gap -= dt;
      if (w.gap <= 0 && !w.pendingDraft) {
        w.n++;
        w.active = true;
        const boss = w.n % STAND.bossEvery === 0;
        w.left = Math.round(STAND.count(1 + (w.n - 1) * T.ramp) * T.standCount);
        w.spawn = w.left;
        this.events.push({ type: 'wave', n: w.n, boss });
        if (boss) {
          const ids: BossId[] = ['butcher', 'hulk', 'grease', 'titan'];
          const s = this.farSpawn(18, 45);
          const b = this.spawn('boss', s.x, s.z, 'hunt', ids[(w.n / STAND.bossEvery - 1) % 4]);
          b.wave = true; w.left++;
          this.boss = b;
          this.events.push({ type: 'boss', id: b.boss! });
        }
      }
      return;
    }
    // trickle the wave in from the ring road
    if (w.spawn > 0 && this.alive < T.cap) {
      const k = Math.min(w.spawn, this.rnd() < dt * (2.2 + w.n * 0.15) ? 1 + Math.floor(this.rnd() * 3) : 0);
      if (k) {
        const s = this.farSpawn(18, 55);
        const mix: [number, number, number, number, number] = [6, Math.min(5, 1 + w.n * 0.4), 1, Math.min(3, w.n * 0.25), Math.min(3, Math.max(0, w.n - 2) * 0.3)];
        for (let i = 0; i < k; i++) {
          const kinds: Exclude<ZKind, 'boss'>[] = ['basic', 'runner', 'crawler', 'arm', 'chubby'];
          const tot = mix.reduce((a, b) => a + b, 0);
          let x = this.rnd() * tot, kind: Exclude<ZKind, 'boss'> = 'basic';
          for (let j = 0; j < 5; j++) { x -= mix[j]; if (x <= 0) { kind = kinds[j]; break; } }
          const z = this.spawn(kind, s.x + (this.rnd() - 0.5) * 4, s.z + (this.rnd() - 0.5) * 4, 'hunt');
          z.wave = true;
        }
        w.spawn -= k;
      }
    }
    if (w.spawn <= 0 && !this.zombies.some((z) => z.wave && z.state !== 'dead')) {
      w.active = false;
      w.gap = STAND.breather;
      this.run.score += 100 * w.n;
      this.events.push({ type: 'waveClear', n: w.n });
      if (w.n % STAND.draftEvery === 0) w.pendingDraft = true;
      // a few supplies between waves
      const a = this.plan.arena;
      this.drop('ammo', a.x + 3, a.z + 3, 1);
      if (w.n % 2 === 0) this.drop('med', a.x - 3, a.z + 3, 1);
    }
  }

  /** The stars of a won mission: done, its side goal, (the drive's is the scene's). */
  sideGoal(): boolean {
    const d = this.def;
    if (!d) return false;
    switch (d.side) {
      case 'chests': return this.stats.chests >= d.sideN;
      case 'quiet': return this.stats.hordes === 0;
      case 'melee': return this.stats.melee >= d.sideN;
      case 'unhurt': return this.hero.hp >= this.hero.max * 0.5;
      case 'fast': return this.time <= d.sideN;
    }
    return false;
  }
}

