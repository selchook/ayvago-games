// Last Convoy: the game's data. Survivors (classes), weapons and their three combos, zombies,
// bosses, the twelve missions over four districts, Last Stand, the escape drive and the Easy /
// Normal tuning side by side. Pure data: the simulation (sim.ts, drive.ts), the view and the
// screens read it.

/** The simulation's fixed step (seconds). */
export const DT = 1 / 60;

export type Mode = 'easy' | 'normal';
export type HeroId = 'matt' | 'sam' | 'shaun' | 'lis';
export const HERO_IDS: readonly HeroId[] = ['matt', 'sam', 'shaun', 'lis'];

export type GunId = 'pistol' | 'smg' | 'shotgun' | 'rifle';
export type MeleeId = 'axe' | 'knife' | 'spear' | 'guitar' | 'bat-barbed' | 'bat-saw';
export type WeaponId = GunId | MeleeId;
export type AbilityId = 'barricade' | 'flare' | 'heal' | 'warcry';

export interface HeroDef {
  id: HeroId;
  hp: number;
  speed: number;
  gun: GunId;
  melee: MeleeId;
  ability: AbilityId;
  /** Seconds between ability uses. */
  cd: number;
  /** The tint of the hero's ring and portraits. */
  color: number;
  /** Stat pips for the squad screen (1..5): health, speed, guns, melee. */
  pips: [number, number, number, number];
}

export const HERO: Record<HeroId, HeroDef> = {
  // the bruiser: a shotgun and an axe, drops a barricade
  matt: { id: 'matt', hp: 140, speed: 4.9, gun: 'shotgun', melee: 'axe', ability: 'barricade', cd: 16, color: 0xff8a2a, pips: [5, 2, 4, 4] },
  // the scout: a rifle and a knife, throws a flare that draws the horde
  sam: { id: 'sam', hp: 100, speed: 5.7, gun: 'rifle', melee: 'knife', ability: 'flare', cd: 14, color: 0xffd23f, pips: [3, 5, 5, 2] },
  // the medic: an SMG and a spear, a heal pulse
  shaun: { id: 'shaun', hp: 110, speed: 5.2, gun: 'smg', melee: 'spear', ability: 'heal', cd: 15, color: 0x5ad8a0, pips: [4, 3, 4, 3] },
  // the brawler: a guitar and a pistol, a war cry
  lis: { id: 'lis', hp: 125, speed: 5.4, gun: 'pistol', melee: 'guitar', ability: 'warcry', cd: 13, color: 0x5ab4ff, pips: [4, 4, 2, 5] },
};

/** The order the story frees the others in (skipping the one you start with). */
export const RESCUE_ORDER: HeroId[] = ['matt', 'sam', 'shaun', 'lis'];

/** The player's platform character → the survivor they start as. */
export const START_HERO: Record<string, HeroId> = { adventurer: 'sam', explorer: 'shaun', rookie: 'lis', soldier: 'matt', zombie: 'matt' };

// ------------------------------------------------------------------ weapons

export interface GunDef {
  id: GunId;
  kind: 'gun';
  /** Damage per bullet (pellet). */
  dmg: number;
  pellets: number;
  /** Seconds between shots in the chain. */
  rate: number;
  /** Spread in degrees (the whole cone). */
  spread: number;
  range: number;
  mag: number;
  /** The reserve the survivor starts a mission with (more from pickups). */
  reserve: number;
  reload: number;
  /** Metres of push on a hit. */
  knock: number;
  /** Foes one bullet passes through. */
  pierce: number;
  /** How far the shot is heard (zombies there come looking) and how much it fills the horde meter. */
  noise: number;
  loud: number;
  /** The three combos' names (strings: `cmb_<id>_a` …). */
}

export interface MeleeDef {
  id: MeleeId;
  kind: 'melee';
  dmg: number;
  /** Reach (m) and the arc (degrees) of a swing. */
  reach: number;
  arc: number;
  /** Seconds per chain step. */
  rate: number;
  knock: number;
  /** Light (fast, short), balanced, heavy (slow, wide, knocks far), reach (long, narrow). */
  feel: 'light' | 'balanced' | 'heavy' | 'reach';
}

export const GUN: Record<GunId, GunDef> = {
  pistol: { id: 'pistol', kind: 'gun', dmg: 15, pellets: 1, rate: 0.26, spread: 3, range: 17, mag: 12, reserve: 48, reload: 0.95, knock: 0.35, pierce: 0, noise: 20, loud: 5 },
  smg: { id: 'smg', kind: 'gun', dmg: 8, pellets: 1, rate: 0.095, spread: 9, range: 15, mag: 30, reserve: 120, reload: 1.35, knock: 0.15, pierce: 0, noise: 24, loud: 2.2 },
  shotgun: { id: 'shotgun', kind: 'gun', dmg: 8, pellets: 6, rate: 0.62, spread: 26, range: 9.5, mag: 6, reserve: 30, reload: 1.6, knock: 1.6, pierce: 0, noise: 28, loud: 11 },
  rifle: { id: 'rifle', kind: 'gun', dmg: 38, pellets: 1, rate: 0.5, spread: 1, range: 24, mag: 8, reserve: 40, reload: 1.5, knock: 0.6, pierce: 2, noise: 30, loud: 9 },
};

export const MELEE: Record<MeleeId, MeleeDef> = {
  axe: { id: 'axe', kind: 'melee', dmg: 26, reach: 2.3, arc: 120, rate: 0.42, knock: 1.0, feel: 'heavy' },
  knife: { id: 'knife', kind: 'melee', dmg: 15, reach: 1.9, arc: 80, rate: 0.26, knock: 0.35, feel: 'light' },
  spear: { id: 'spear', kind: 'melee', dmg: 20, reach: 3.1, arc: 50, rate: 0.36, knock: 0.7, feel: 'reach' },
  guitar: { id: 'guitar', kind: 'melee', dmg: 24, reach: 2.5, arc: 150, rate: 0.4, knock: 1.2, feel: 'heavy' },
  'bat-barbed': { id: 'bat-barbed', kind: 'melee', dmg: 21, reach: 2.2, arc: 110, rate: 0.34, knock: 0.9, feel: 'balanced' },
  'bat-saw': { id: 'bat-saw', kind: 'melee', dmg: 23, reach: 2.3, arc: 110, rate: 0.36, knock: 0.8, feel: 'balanced' },
};

/** The hand's mesh (heroes.glb) for a weapon. */
export const WEAPON_MESH: Record<WeaponId, string> = {
  pistol: 'pistol', smg: 'smg', shotgun: 'shotgun', rifle: 'rifle', axe: 'axe', knife: 'knife', spear: 'spear', guitar: 'guitar', 'bat-barbed': 'bat-barbed', 'bat-saw': 'bat-saw',
};
/** Melee upgrades swap the weapon (Rank II of the melee track): bats get barbs or a saw. */
export const MELEE_UPGRADE: Partial<Record<MeleeId, MeleeId>> = {};

/** The chain's rules (§7g): how long a held ATTACK charges, the window to chain on, the dash window. */
export const COMBO = {
  /** Seconds ATTACK must stay held on the last step for the charged finisher. */
  charge: 0.35,
  /** Seconds after a step's end that a press still chains on. */
  window: 0.42,
  /** Seconds after a dodge in which ATTACK is the dash strike. */
  dash: 0.4,
  /** "In combat": a foe within this range (melee) or the gun's range, or a blow in the last 2.5 s. */
  engage: 6.5,
  recent: 2.5,
};

/** Multipliers of the finishers and the dash strike. */
export const FINISH = {
  a: { dmg: 1.9, stop: 0.07, shake: 0.006 },
  b: { dmg: 2.8, stop: 0.12, shake: 0.012 },
  c: { dmg: 2.1, stop: 0.06, shake: 0.005 },
};

// ------------------------------------------------------------------ zombies

export type ZKind = 'basic' | 'runner' | 'crawler' | 'arm' | 'chubby' | 'boss';
export type BossId = 'butcher' | 'hulk' | 'grease' | 'titan';

export interface ZDef {
  kind: ZKind;
  /** The model file and its scale. */
  file: 'zombie-basic' | 'zombie-ribcage' | 'zombie-arm' | 'zombie-chubby';
  scale: number;
  hp: number;
  /** Speed wandering and hunting (m/s). */
  walk: number;
  run: number;
  dmg: number;
  /** Body radius (m). */
  r: number;
  /** Strike reach and the tell before it (s). */
  reach: number;
  tell: number;
  /** Seconds between strikes. */
  cd: number;
  score: number;
  scrap: number;
  /** How far a hit pushes it (1 = full). */
  weight: number;
}

export const ZOMBIE: Record<Exclude<ZKind, 'boss'>, ZDef> = {
  // shamblers in crowds: slow, they grab and hold you
  basic: { kind: 'basic', file: 'zombie-basic', scale: 1.22, hp: 44, walk: 0.8, run: 1.85, dmg: 9, r: 0.42, reach: 1.15, tell: 0.42, cd: 1.3, score: 10, scrap: 1, weight: 1 },
  // fast runners: the ribcage sprints
  runner: { kind: 'runner', file: 'zombie-ribcage', scale: 1.45, hp: 24, walk: 1.2, run: 4.2, dmg: 6, r: 0.36, reach: 1.0, tell: 0.28, cd: 0.9, score: 12, scrap: 1, weight: 1.3 },
  // crawlers: the ribcage, low and hidden under cars until the dog barks
  crawler: { kind: 'crawler', file: 'zombie-ribcage', scale: 1.4, hp: 30, walk: 0.7, run: 1.7, dmg: 8, r: 0.4, reach: 1.0, tell: 0.35, cd: 1.1, score: 12, scrap: 1, weight: 1.2 },
  // the long arm: reaches far and pulls you in
  arm: { kind: 'arm', file: 'zombie-arm', scale: 1.15, hp: 70, walk: 0.9, run: 2.0, dmg: 11, r: 0.45, reach: 3.3, tell: 0.75, cd: 2.4, score: 22, scrap: 2, weight: 0.8 },
  // the brute: charges, and bursts when it falls
  chubby: { kind: 'chubby', file: 'zombie-chubby', scale: 1.25, hp: 220, walk: 0.8, run: 1.55, dmg: 22, r: 0.75, reach: 1.6, tell: 0.7, cd: 2.2, score: 45, scrap: 5, weight: 0.3 },
};

export interface BossDef { id: BossId; hp: number; scale: number; tint: number; speed: number; dmg: number; score: number }
/** One per district: a huge recoloured brute with phases (a charge, a slam ring, a roar that calls the horde). */
export const BOSS: Record<BossId, BossDef> = {
  butcher: { id: 'butcher', hp: 1300, scale: 2.3, tint: 0xd86a5a, speed: 1.7, dmg: 26, score: 1500 },
  hulk: { id: 'hulk', hp: 1900, scale: 2.5, tint: 0x6a9ad8, speed: 1.8, dmg: 30, score: 2200 },
  grease: { id: 'grease', hp: 2500, scale: 2.6, tint: 0x8a8a4a, speed: 1.9, dmg: 32, score: 3000 },
  titan: { id: 'titan', hp: 3300, scale: 2.8, tint: 0xa85ad8, speed: 2.0, dmg: 36, score: 4200 },
};

// ------------------------------------------------------------------ the town

export type DistrictId = 'main' | 'docks' | 'gas' | 'hill';
export const DISTRICTS: DistrictId[] = ['main', 'docks', 'gas', 'hill'];

/** The convoy's vehicles (vehicles.glb), plain and armoured. */
export type VehicleId = 'pickup' | 'truck' | 'sports';

export type ItemKind = 'fuel' | 'part' | 'key' | 'battery';
export type StageKind = 'collect' | 'rescue' | 'clear' | 'hold' | 'boss' | 'return';
export interface Stage { kind: StageKind; item?: ItemKind; n?: number; who?: 'hero' | 'civ'; hold?: 'repair' | 'pump' | 'radio'; secs?: number; boss?: BossId }
export type SideGoal = 'chests' | 'quiet' | 'melee' | 'unhurt' | 'fast';

export interface MissionDef {
  n: number;
  district: DistrictId;
  vehicle: VehicleId;
  stages: Stage[];
  /** The zombies placed at the start, and the trickle (one every `trickle` s at dusk). */
  start: number;
  trickle: number;
  /** The mix: weights of basic, runner, crawler, arm, chubby. */
  mix: [number, number, number, number, number];
  side: SideGoal;
  /** The side goal's number (chests to open, melee kills, seconds …). */
  sideN: number;
  /** The drive: its length in road cells and how thick the road is with zombies (0..1). */
  drive: { cells: number; zombies: number; blocks: number };
  /** Seconds the night takes to fall. */
  night: number;
}

const S = (kind: StageKind, o: Partial<Stage> = {}): Stage => ({ kind, ...o });

export const MISSIONS: MissionDef[] = [
  // Main Street
  { n: 1, district: 'main', vehicle: 'pickup', stages: [S('collect', { item: 'fuel', n: 3 }), S('return')], start: 14, trickle: 7, mix: [10, 1, 0, 0, 0], side: 'chests', sideN: 2, drive: { cells: 60, zombies: 0.35, blocks: 2 }, night: 260 },
  { n: 2, district: 'main', vehicle: 'pickup', stages: [S('rescue', { who: 'hero', n: 1 }), S('return')], start: 18, trickle: 6, mix: [9, 2, 1, 0, 0], side: 'unhurt', sideN: 0, drive: { cells: 66, zombies: 0.42, blocks: 3 }, night: 240 },
  { n: 3, district: 'main', vehicle: 'pickup', stages: [S('collect', { item: 'key', n: 1 }), S('boss', { boss: 'butcher' }), S('return')], start: 18, trickle: 6, mix: [8, 2, 1, 1, 1], side: 'quiet', sideN: 0, drive: { cells: 72, zombies: 0.5, blocks: 3 }, night: 230 },
  // The docks
  { n: 4, district: 'docks', vehicle: 'truck', stages: [S('collect', { item: 'part', n: 3 }), S('return')], start: 20, trickle: 5.5, mix: [8, 3, 1, 1, 1], side: 'chests', sideN: 3, drive: { cells: 74, zombies: 0.5, blocks: 3 }, night: 230 },
  { n: 5, district: 'docks', vehicle: 'truck', stages: [S('rescue', { who: 'civ', n: 2 }), S('clear'), S('return')], start: 22, trickle: 5, mix: [7, 3, 2, 2, 1], side: 'melee', sideN: 25, drive: { cells: 78, zombies: 0.55, blocks: 4 }, night: 220 },
  { n: 6, district: 'docks', vehicle: 'truck', stages: [S('hold', { hold: 'repair', secs: 50 }), S('boss', { boss: 'hulk' }), S('return')], start: 18, trickle: 5, mix: [7, 3, 1, 2, 2], side: 'unhurt', sideN: 0, drive: { cells: 82, zombies: 0.6, blocks: 4 }, night: 220 },
  // The gas station and the on-ramp
  { n: 7, district: 'gas', vehicle: 'truck', stages: [S('collect', { item: 'fuel', n: 4 }), S('hold', { hold: 'pump', secs: 30 }), S('return')], start: 24, trickle: 4.6, mix: [7, 3, 2, 2, 2], side: 'quiet', sideN: 0, drive: { cells: 84, zombies: 0.6, blocks: 4 }, night: 210 },
  { n: 8, district: 'gas', vehicle: 'truck', stages: [S('rescue', { who: 'hero', n: 1 }), S('clear'), S('return')], start: 26, trickle: 4.4, mix: [6, 4, 2, 2, 2], side: 'chests', sideN: 3, drive: { cells: 88, zombies: 0.65, blocks: 5 }, night: 210 },
  { n: 9, district: 'gas', vehicle: 'truck', stages: [S('collect', { item: 'part', n: 2 }), S('boss', { boss: 'grease' }), S('return')], start: 24, trickle: 4.4, mix: [6, 4, 2, 3, 2], side: 'melee', sideN: 35, drive: { cells: 90, zombies: 0.7, blocks: 5 }, night: 200 },
  // Water tower hill
  { n: 10, district: 'hill', vehicle: 'truck', stages: [S('collect', { item: 'battery', n: 3 }), S('return')], start: 28, trickle: 4.2, mix: [6, 4, 2, 3, 2], side: 'fast', sideN: 150, drive: { cells: 94, zombies: 0.7, blocks: 5 }, night: 200 },
  { n: 11, district: 'hill', vehicle: 'truck', stages: [S('rescue', { who: 'hero', n: 1 }), S('rescue', { who: 'civ', n: 2 }), S('return')], start: 28, trickle: 4, mix: [6, 4, 3, 3, 2], side: 'unhurt', sideN: 0, drive: { cells: 98, zombies: 0.75, blocks: 6 }, night: 200 },
  { n: 12, district: 'hill', vehicle: 'truck', stages: [S('hold', { hold: 'radio', secs: 45 }), S('boss', { boss: 'titan' }), S('return')], start: 26, trickle: 4, mix: [6, 4, 2, 3, 3], side: 'quiet', sideN: 0, drive: { cells: 110, zombies: 0.85, blocks: 6 }, night: 190 },
];

export const DISTRICT_OF = (n: number): DistrictId => MISSIONS[n - 1].district;

/** Last Stand: the convoy parked in Main Street's square, endless waves. */
export const STAND = {
  /** Wave n: this many zombies (plus a boss every `bossEvery` waves). */
  count: (w: number): number => 7 + Math.round(w * 3.2),
  bossEvery: 5,
  /** Seconds of quiet between waves; a power-card draft after every `draftEvery` waves. */
  breather: 7,
  draftEvery: 2,
  truckHp: 900,
};

/** The scrap a won mission pays (plus what was picked up), and the rare supplies. */
export const scrapFor = (n: number, stars: number): number => 40 + n * 12 + stars * 15;
export const suppliesFor = (n: number, boss: boolean): number => (boss ? 3 : 1) + (n > 6 ? 1 : 0);

// ------------------------------------------------------------------ the drive

export const DRIVE = {
  /** Road cells are the street tiles: 8 m. */
  cell: 8,
  /** Top speeds (m/s), acceleration and braking, the yaw rate at full lock. */
  top: { pickup: 21, truck: 18.5, sports: 23 } as Record<VehicleId, number>,
  accel: 9,
  brake: 16,
  coast: 2.2,
  nitroTop: 29,
  nitroTime: 1.8,
  yaw: 1.75,
  /** The convoy's armour (HP): a plain vehicle, the armoured one (upgrade rank II) per vehicle. */
  armor: { pickup: 100, truck: 130, sports: 90 } as Record<VehicleId, number>,
  armorPlated: 1.5,
};

// ------------------------------------------------------------------ tuning: Normal | Easy side by side

export interface Tuning {
  /** Damage the zombies deal (x), their speed (x) and health (x). */
  zDmg: number;
  zSpeed: number;
  zHp: number;
  /** The population: start count and trickle (x), the cap of zombies alive. */
  zCount: number;
  cap: number;
  /** The survivor's health (x), ammo found (x), the horde meter's fill (x). */
  hp: number;
  ammo: number;
  noise: number;
  /** Night pressure at full night (spawn rate x). */
  night: number;
  /** The drive: crash damage (x), zombies on the road (x). */
  crash: number;
  roadZ: number;
  /** Last Stand: wave size (x), the ramp per wave. */
  standCount: number;
  ramp: number;
}

export const TUNING: Record<Mode, Tuning> = {
  normal: { zDmg: 1, zSpeed: 1, zHp: 1, zCount: 1, cap: 34, hp: 1, ammo: 1, noise: 1, night: 1.7, crash: 1, roadZ: 1, standCount: 1, ramp: 1 },
  easy: { zDmg: 0.55, zSpeed: 0.85, zHp: 0.8, zCount: 0.75, cap: 24, hp: 1.35, ammo: 1.5, noise: 0.6, night: 1.3, crash: 0.55, roadZ: 0.7, standCount: 0.75, ramp: 0.7 },
};

/** Heroes who join with the mission they are freed in (index in MISSIONS of the rescue). */
export const RESCUE_MISSIONS = [2, 8, 11];
