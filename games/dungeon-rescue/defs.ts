// Dungeon Rescue: the numbers. The knight's feel, the guards' eyes and ears, Easy beside Normal in
// one table, the four wings' moods, the tricks (powers), the hideout's upgrades, the crew and the
// bonuses they lend the knight, the knight's armour looks, and the scoring.

/** Fixed simulation step (the sim runs at 60 Hz whatever the frame rate). */
export const DT = 1 / 60;

/** One cell of the pack's grid, in metres (a wall piece is 2 × 2 m). */
export const CELL = 2;
/** The walls' height as drawn (the pack's 2 m walls). */
export const WALL_H = 2;

/** Every figure of the character pack is about 3.4 units tall: drawn this tall (metres). */
export const FIG_H = 1.55;
export const FIG_SCALE = FIG_H / 3.42;

export const MOVE = {
  /** The knight walks quietly, sprints loudly (his armour clanks). */
  walk: 3.4,
  sprint: 5.7,
  acc: 30,
  dec: 38,
  /** A circle this wide on the floor. */
  radius: 0.34,
  /** How far ACT reaches (metres from the knight's centre to the thing's). */
  reach: 1.75,
  /** On touch: pushing the stick this far sprints. */
  stickSprint: 0.93,
  /** Pick-ups are taken by walking over them within this distance. */
  grab: 0.95,
};

export const GUARD = {
  walk: 2.05,
  run: 4.6,
  /** In the alarm: guards hurry along their rounds. */
  alarmWalk: 2.9,
  /** Half the field of view (radians) and the sight range (metres) in normal light. */
  fov: 0.6,
  range: 6.5,
  /** A touch closer than this catches. */
  catchR: 0.95,
  /** Pauses at a waypoint (seconds), looking left and right. */
  pause: 1.6,
  /** Searching a spot this long before going back. */
  search: 3.6,
  /** A chase gives up when the target has been out of sight this long. */
  lost: 2.4,
  /** A stunned or smoked guard stands confused this long. */
  confused: 3,
};

/** The Jailer Chief: a wider, longer cone that sweeps, a lantern, sharper ears; more each wing. */
export const CHIEF = {
  scale: 1.32,
  fov: 0.86,
  range: 8.6,
  sweep: 0.75,
  /** His lantern lights this far round him (metres). */
  lantern: 3.2,
  /** Noises reach him from this much farther (wing 2 on). */
  hearing: 1.5,
  /** He calls the guards within this radius when he spots you (wing 2 on). */
  call: 16,
  /** Lane charges (wing 3 on): wind-up, speed, the daze after hitting something. */
  chargeWind: 0.65,
  chargeSpeed: 8.6,
  chargeDaze: 2.2,
  chargeCd: 3.5,
  /** Ground slams (wing 4): wind-up, radius, how long followers stay stunned, cooldown. */
  slamWind: 0.7,
  slamR: 4,
  slamStun: 1.6,
  slamCd: 6,
  /** Stealing the key ring from behind: hold ACT this long (Quick Hands helps). */
  steal: 1.15,
};

/** What the eyes make of a target. */
export const DETECT = {
  /** Suspicion per second at mid range in plain light. */
  rate: 0.62,
  /** Closer targets are noticed faster: × near at 0 m, × far at full range. */
  near: 1.6,
  far: 0.62,
  /** Suspicion fades this fast out of sight. */
  decay: 0.3,
  /** "?": the guard comes to look. "!" at 1: the chase. */
  question: 0.42,
  /** Light: sight reaches this much farther in lit cells and this much less in shadow. */
  lit: 1.3,
  shadow: 0.55,
  litAt: 0.6,
  darkAt: 0.22,
  /** A follower is a little harder to notice than the clanking knight; one sitting still much harder. */
  follower: 0.85,
  sitting: 0.55,
  /** A sprinting knight is easier to notice. */
  sprinting: 1.3,
};

/** Noise rings (metres). */
export const NOISE = {
  sprint: 5.4,
  /** A sprint step clanks this often (seconds). */
  sprintEvery: 0.34,
  land: 8.4,
  decoy: 10,
  slam: 7,
  /** Sleepers wake to a noise this much of its radius. */
  wake: 0.9,
};

export const THROW = {
  range: 8.4,
  flight: 0.55,
  maxCarry: 3,
};

/** Powers (tricks): picked up into a bag of three, used one at a time with POWER. */
export const POWER_IDS = ['smoke', 'disguise', 'powder', 'swift', 'decoy'] as const;
export type PowerId = typeof POWER_IDS[number];
export const POWER = {
  /** Smoke bomb: guards this near lose you and stand confused; you vanish inside for a moment. */
  smokeR: 6,
  smokeHide: 2.6,
  /** Guards in the cloud stand dazed this long (seconds). */
  smokeDaze: 4,
  /** Disguise: guards ignore you unless you sprint. */
  disguise: 8,
  /** Sleepy powder: a guard this near in front of you dozes this long. */
  powderR: 2.9,
  powderSleep: 12,
  /** Swift shoes: faster, and sprinting is silent. */
  swift: 8,
  swiftK: 1.3,
  /** Decoy: a noisemaker that rattles this often for this long. */
  decoyEvery: 1.6,
  decoyTime: 8,
};
export const POWER_COLOR: Record<PowerId, number> = { smoke: 0xb8c0d0, disguise: 0x5a9a5a, powder: 0xc8a0ff, swift: 0x40c8ff, decoy: 0xffc040 };

export interface Tuning {
  /** Hearts at the start of a level (before upgrades and the Doctor). */
  hearts: number;
  /** Suspicion grows this much faster. */
  susp: number;
  /** Guards see this much farther. */
  sight: number;
  /** Guards move at this rate. */
  pace: number;
  /** Seconds on the alarm clock. */
  alarm: number;
  /** Seconds to pick a lock. */
  pick: number;
  /** The Chief's patience: his lane charges come this much later and slower. */
  chief: number;
}

/** Normal and Easy side by side (Easy: more hearts, slower suspicion, shorter sight, slower guards, a longer alarm). */
export const TUNING: Record<'normal' | 'easy', Tuning> = {
  normal: { hearts: 3, susp: 1, sight: 1, pace: 1, alarm: 80, pick: 2.4, chief: 1 },
  easy: { hearts: 5, susp: 0.6, sight: 0.85, pace: 0.85, alarm: 115, pick: 1.8, chief: 0.8 },
};

// ------------------------------------------------------------------ wings

export const WING_IDS = ['cells', 'barracks', 'treasury', 'tower'] as const;
export type WingId = typeof WING_IDS[number];

export interface WingLook {
  bg: number;
  floor: number;
  wall: number;
  cap: number;
  hemi: [number, number, number];
  moon: [number, number];
  flame: number;
  /** Brightness away from every light (0..1). */
  dark: number;
  /** Light everywhere before torches (0..1, for the guards' eyes). */
  ambient: number;
  banner: number;
}

export const WINGS: Record<WingId, WingLook> = {
  cells: { bg: 0x0d0b10, floor: 0xd8d2dc, wall: 0xffffff, cap: 0x544a58, hemi: [0xb8b0c8, 0x3a3038, 1.15], moon: [0xc8c0e0, 0.55], flame: 0xffa040, dark: 0.58, ambient: 0.3, banner: 0xffffff },
  barracks: { bg: 0x100c0a, floor: 0xe6d8c8, wall: 0xf2e2cc, cap: 0x5a4a3c, hemi: [0xd0b8a0, 0x3a2c20, 1.15], moon: [0xe0c8a8, 0.5], flame: 0xff9a3a, dark: 0.56, ambient: 0.3, banner: 0x5a80d8 },
  treasury: { bg: 0x0e0c08, floor: 0xf0e2c0, wall: 0xffe8c0, cap: 0x5e5038, hemi: [0xe8d0a0, 0x3c3020, 1.2], moon: [0xffe0a0, 0.55], flame: 0xffb040, dark: 0.6, ambient: 0.32, banner: 0xffd060 },
  tower: { bg: 0x0a0a10, floor: 0xc8ccd8, wall: 0xd8d8e8, cap: 0x484c64, hemi: [0xa8b0d0, 0x2a2a3a, 1.05], moon: [0xb0c0ff, 0.6], flame: 0xffa04a, dark: 0.5, ambient: 0.24, banner: 0x7a50b0 },
};

// ------------------------------------------------------------------ the cast

/** The guards (no knights among them: the hero is the knight). */
export const GUARD_KINDS = ['soldier', 'soldier-f', 'bluesoldier', 'bluesoldier-f', 'goblin', 'goblin-f', 'viking', 'viking-f'] as const;
export type GuardKind = typeof GUARD_KINDS[number] | 'chief';
/** Vikings are the heavies: a wider, longer look, a little slower. */
export const HEAVY: Partial<Record<GuardKind, { fov: number; range: number; pace: number }>> = {
  viking: { fov: 1.2, range: 1.12, pace: 0.9 },
  'viking-f': { fov: 1.2, range: 1.12, pace: 0.9 },
};

/** The knight's armour looks: the pack's knights, unlocked by stars. */
export const LOOKS = [
  { id: 'knight', stars: 0 },
  { id: 'knight-gold', stars: 12 },
  { id: 'knight-gold-f', stars: 30 },
] as const;
export type LookId = typeof LOOKS[number]['id'];

/** The crew's kinds: what each lends the knight when chosen as a companion in the hideout. */
export const KIND_IDS = ['casual', 'chef', 'doctor', 'worker', 'classy', 'suit', 'kimono', 'pirate', 'cowboy', 'ninja', 'elf', 'wizard', 'witch', 'cow', 'pug'] as const;
export type KindId = typeof KIND_IDS[number];

/** Perks as numbers the sim reads (neutral 1 / 0). */
export interface Perks {
  /** Followers are noticed this much (Casual: a steady crowd). */
  crowd: number;
  /** Throw noises hold guards this much longer and reach this much farther (Chef). */
  lure: number;
  /** Extra hearts (Doctor). */
  hearts: number;
  /** Lock-picking and stealing take this much of the time (Worker). */
  pick: number;
  /** Suspicion fades this much faster (Classy). */
  calm: number;
  /** Coins are worth this much (Suit). */
  coins: number;
  /** Walking speed (Kimono). */
  walk: number;
  /** Throw range (Pirate). */
  arm: number;
  /** Powers last this much longer (Cowboy). */
  tricks: number;
  /** Sprint noise (Ninja). */
  quiet: number;
  /** Arrows at the screen's edge point to guards out of sight (Elf). */
  sharp: boolean;
  /** Smoke cloud radius (Wizard). */
  smoke: number;
  /** Shadows hide you better (Witch). */
  shadow: number;
  /** A free moo decoy every level (Cow). */
  moo: boolean;
  /** Guards notice the knight this much (Pug). */
  small: number;
}

export const NO_PERKS: Perks = { crowd: 1, lure: 1, hearts: 0, pick: 1, calm: 1, coins: 1, walk: 1, arm: 1, tricks: 1, quiet: 1, sharp: false, smoke: 1, shadow: 1, moo: false, small: 1 };

export const PERK: Record<KindId, Partial<Perks>> = {
  casual: { crowd: 0.7 },
  chef: { lure: 1.6 },
  doctor: { hearts: 1 },
  worker: { pick: 0.65 },
  classy: { calm: 1.6 },
  suit: { coins: 1.3 },
  kimono: { walk: 1.12 },
  pirate: { arm: 1.35 },
  cowboy: { tricks: 1.35 },
  ninja: { quiet: 0.6 },
  elf: { sharp: true },
  wizard: { smoke: 1.6 },
  witch: { shadow: 0.75 },
  cow: { moo: true },
  pug: { small: 0.78 },
};

/** The prisoners: each a figure of the character pack with a name; freed, they join the crew. */
export const CREW: Record<string, { kind: KindId; name: string }> = {
  casual: { kind: 'casual', name: 'Tom' },
  'casual-f': { kind: 'casual', name: 'Elif' },
  casual2: { kind: 'casual', name: 'Deniz' },
  'casual2-f': { kind: 'casual', name: 'Maya' },
  casual3: { kind: 'casual', name: 'Can' },
  'casual3-f': { kind: 'casual', name: 'Zoe' },
  chef: { kind: 'chef', name: 'Marco' },
  'chef-f': { kind: 'chef', name: 'Ayla' },
  doctor: { kind: 'doctor', name: 'Emre' },
  'doctor-f': { kind: 'doctor', name: 'Selin' },
  'doctor-old': { kind: 'doctor', name: 'Hakan' },
  'doctor-old-f': { kind: 'doctor', name: 'Nora' },
  worker: { kind: 'worker', name: 'Ali' },
  'worker-f': { kind: 'worker', name: 'Ece' },
  gent: { kind: 'classy', name: 'Albert' },
  lady: { kind: 'classy', name: 'Rose' },
  suit: { kind: 'suit', name: 'Victor' },
  'suit-f': { kind: 'suit', name: 'Lina' },
  kimono: { kind: 'kimono', name: 'Leo' },
  'kimono-f': { kind: 'kimono', name: 'Mina' },
  pirate: { kind: 'pirate', name: 'Jack' },
  'pirate-f': { kind: 'pirate', name: 'Anne' },
  cowboy: { kind: 'cowboy', name: 'Luke' },
  'cowboy-f': { kind: 'cowboy', name: 'Ruby' },
  ninja: { kind: 'ninja', name: 'Ren' },
  'ninja-f': { kind: 'ninja', name: 'Kira' },
  elf: { kind: 'elf', name: 'Elwin' },
  wizard: { kind: 'wizard', name: 'Merlo' },
  witch: { kind: 'witch', name: 'Hilda' },
  cow: { kind: 'cow', name: 'Bella' },
  pug: { kind: 'pug', name: 'Pako' },
};
export const CREW_IDS = Object.keys(CREW);
/** How many companions the knight takes along. */
export const COMPANIONS = 2;

/** The perks of the chosen companions (a kind counts once). */
export function perksOf(companions: string[]): Perks {
  const p: Perks = { ...NO_PERKS };
  const kinds = new Set(companions.map((c) => CREW[c]?.kind).filter(Boolean) as KindId[]);
  for (const k of kinds) {
    const q = PERK[k];
    for (const [key, v] of Object.entries(q)) {
      const cur = (p as unknown as Record<string, number | boolean>)[key];
      (p as unknown as Record<string, number | boolean>)[key] = typeof v === 'boolean' ? v : key === 'hearts' ? (cur as number) + (v as number) : (cur as number) * (v as number);
    }
  }
  return p;
}

// ------------------------------------------------------------------ the hideout's upgrades

export const UPGRADE_IDS = ['soft', 'hands', 'heart', 'arm', 'tricks', 'smoke'] as const;
export type UpgradeId = typeof UPGRADE_IDS[number];
export type Ranks = Record<UpgradeId, number>;
export const noRanks = (): Ranks => ({ soft: 0, hands: 0, heart: 0, arm: 0, tricks: 0, smoke: 0 });

export const UPGRADE: Record<UpgradeId, { prices: number[] }> = {
  soft: { prices: [40, 90, 160] },
  hands: { prices: [40, 90, 160] },
  heart: { prices: [120, 260] },
  arm: { prices: [50, 110] },
  tricks: { prices: [50, 110, 180] },
  smoke: { prices: [150] },
};

/** What the ranks do. */
export const RANK = {
  /** Sprint noise radius per rank of Soft Steps. */
  soft: [1, 0.82, 0.66, 0.5],
  hands: [1, 0.85, 0.7, 0.56],
  arm: [1, 1.2, 1.4],
  tricks: [1, 1.25, 1.5, 1.75],
};

// ------------------------------------------------------------------ scoring and coins

export const SCORE = {
  coin: 10,
  rescue: 150,
  chest: 500,
  outwit: 1000,
  clear: 400,
  perWing: 150,
  star: 300,
  unseen: 600,
  /** Points for every second under par. */
  parSecond: 12,
};
export const COINS = { pile: 5, bag: 15, chest: 50 };
export const CLEAR_COINS = (wing: number): number => 20 + wing * 10;
export const STAR_COINS = 10;
