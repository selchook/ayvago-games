// Zombie Grove: the numbers. Difficulty tuning (Easy and Normal side by side), the zombie roster,
// the weapons with their five levels and evolutions, the passive trinkets and the XP curve.
// Pure data: the simulation (sim.ts) reads it, the view and the UI only name and draw it.

export type Mode = 'easy' | 'normal';

export interface Tuning {
  /** Length of the night in seconds: surviving it brings the dawn (a win). */
  night: number;
  /** Most zombies alive at once, from the first minute to the last. */
  capStart: number;
  capEnd: number;
  /** Zombies per second from the first minute to the last (before the horde rushes). */
  rateStart: number;
  rateEnd: number;
  /** Zombie speed and health multipliers, and how fast health grows per minute. */
  speedK: number;
  hpK: number;
  hpPerMin: number;
  /** Damage zombies deal. */
  dmgK: number;
  /** The survivor's health and pickup reach. */
  hp: number;
  magnet: number;
  /** Boss and mini-boss health multiplier. */
  bossK: number;
  /** Seconds between horde rushes (a ring of fast zombies). */
  rushEvery: number;
  /** Coins a run earns (Easy pays less). */
  coinK: number;
  /** Seconds when the three mini-bosses come, and the Rot King. */
  minis: [number, number, number];
  king: number;
}

export const TUNING: Record<Mode, Tuning> = {
  easy: {
    night: 420, capStart: 24, capEnd: 170, rateStart: 0.9, rateEnd: 5.5, speedK: 0.86, hpK: 0.8, hpPerMin: 0.14,
    dmgK: 0.6, hp: 140, magnet: 3.4, bossK: 0.55, rushEvery: 85, coinK: 0.5,
    minis: [140, 260, 340], king: 375,
  },
  normal: {
    night: 600, capStart: 30, capEnd: 300, rateStart: 1.1, rateEnd: 13, speedK: 1, hpK: 1, hpPerMin: 0.18,
    dmgK: 1, hp: 110, magnet: 2.7, bossK: 1, rushEvery: 70, coinK: 1,
    minis: [150, 300, 450], king: 525,
  },
};

/** The arena is a square of ±ARENA units; the survivor stays inside ±PLAY_EDGE. */
export const ARENA = 46;
export const PLAY_EDGE = 41;
/** Survivor speed (units / s) and body radius. */
export const PLAYER_SPEED = 4.3;
export const PLAYER_R = 0.32;
/** Where new zombies appear: just outside the view, around the survivor. */
export const SPAWN_R = [15.5, 19];

// ------------------------------------------------------------------ zombies

export type ZombieKind = 'shambler' | 'runner' | 'swarm' | 'spitter' | 'exploder' | 'tank' | 'brute' | 'matron' | 'knight' | 'king';
export type BossKind = 'brute' | 'matron' | 'knight' | 'king';
export const BOSS_KINDS: BossKind[] = ['brute', 'matron', 'knight', 'king'];
export const isBoss = (k: ZombieKind): k is BossKind => (BOSS_KINDS as string[]).includes(k);

export interface ZombieDef {
  hp: number;
  speed: number;
  r: number;
  /** Damage per bite (bites every BITE_CD seconds while touching). */
  dmg: number;
  /** XP dropped (0.5 = a gem half the time). */
  xp: number;
  score: number;
  /** Share of a hit's knockback it shrugs off. */
  heavy: number;
  /** Seconds into the night when it starts to appear. */
  from: number;
  /** Spawn weight once it appears. */
  w: number;
  /** Chance to drop a coin. */
  coin: number;
}

export const ZOMBIES: Record<ZombieKind, ZombieDef> = {
  shambler: { hp: 10, speed: 1.3, r: 0.3, dmg: 6, xp: 1, score: 10, heavy: 0, from: 0, w: 10, coin: 0.012 },
  runner: { hp: 7, speed: 2.75, r: 0.28, dmg: 5, xp: 1, score: 12, heavy: 0, from: 70, w: 5, coin: 0.015 },
  swarm: { hp: 3, speed: 2.15, r: 0.22, dmg: 3, xp: 0.5, score: 4, heavy: 0, from: 120, w: 0, coin: 0.004 },
  spitter: { hp: 16, speed: 1.1, r: 0.3, dmg: 4, xp: 2, score: 25, heavy: 0.2, from: 150, w: 2, coin: 0.03 },
  exploder: { hp: 14, speed: 1.75, r: 0.36, dmg: 4, xp: 2, score: 20, heavy: 0.1, from: 210, w: 2, coin: 0.03 },
  tank: { hp: 95, speed: 0.95, r: 0.55, dmg: 14, xp: 6, score: 50, heavy: 0.8, from: 240, w: 1.4, coin: 0.15 },
  brute: { hp: 1100, speed: 1.25, r: 0.85, dmg: 15, xp: 0, score: 500, heavy: 1, from: 0, w: 0, coin: 0 },
  matron: { hp: 1300, speed: 1.15, r: 0.8, dmg: 14, xp: 0, score: 500, heavy: 1, from: 0, w: 0, coin: 0 },
  knight: { hp: 2100, speed: 1.45, r: 0.8, dmg: 20, xp: 0, score: 600, heavy: 1, from: 0, w: 0, coin: 0 },
  king: { hp: 9500, speed: 1.45, r: 1.15, dmg: 24, xp: 0, score: 3000, heavy: 1, from: 0, w: 0, coin: 0 },
};

export const BITE_CD = 0.55;
/** Exploders light their fuse this close and burst after FUSE seconds. */
export const FUSE_R = 1.5;
export const FUSE = 0.9;
export const BLAST_R = 2.25;
export const BLAST_DMG = 14;
/** Spitters keep about this far away and lob goo every SPIT_CD seconds. */
export const SPIT_RANGE = 6.5;
export const SPIT_CD = 3.2;
export const GOO_DMG = 7;
export const GOO_SPEED = 4.9;

/** The mini-bosses in the order they come (times in TUNING). */
export const MINIS: BossKind[] = ['brute', 'matron', 'knight'];

// ------------------------------------------------------------------ weapons and trinkets

export type WeaponId = 'blade' | 'bow' | 'spear' | 'blaster' | 'wards' | 'torch' | 'robot' | 'shield';
export type PassiveId = 'swift' | 'vigor' | 'regen' | 'magnet' | 'armor' | 'haste' | 'reach' | 'luck';

export const WEAPON_IDS: WeaponId[] = ['blade', 'bow', 'spear', 'blaster', 'wards', 'torch', 'robot', 'shield'];
export const PASSIVE_IDS: PassiveId[] = ['swift', 'vigor', 'regen', 'magnet', 'armor', 'haste', 'reach', 'luck'];
export const MAX_LEVEL = 5;
export const MAX_WEAPONS = 6;
export const MAX_PASSIVES = 6;

/** Each weapon evolves at level 5 with this trinket in the bag. */
export const EVOLVES_WITH: Record<WeaponId, PassiveId> = {
  blade: 'reach', bow: 'luck', spear: 'haste', blaster: 'swift', wards: 'armor', torch: 'vigor', robot: 'magnet', shield: 'regen',
};

/** A weapon's numbers at a level (1–5), evolved or not. */
export interface WeaponStats {
  cd: number;
  dmg: number;
  /** Projectiles, swings, thrusts, shields or torches. */
  n: number;
  /** Enemies a projectile passes through (bow), or chain hops (evolved spear). */
  pierce: number;
  /** Reach: swing radius, thrust length, fire radius, orbit radius, range. */
  size: number;
  /** Extra: projectile speed, orbit speed, burn time. */
  speed: number;
  knock: number;
}

const L = (lv: number, a: number[]) => a[Math.min(a.length, lv) - 1];

export function weaponStats(id: WeaponId, lv: number, evo: boolean): WeaponStats {
  switch (id) {
    case 'blade': // a wide arc in front; level 4 swings behind too; evolved: a full spin
      return evo
        ? { cd: 1.05, dmg: 46, n: 2, pierce: 0, size: 3.7, speed: 0, knock: 4.5 }
        : { cd: L(lv, [1.35, 1.35, 1.3, 1.3, 1.12]), dmg: L(lv, [17, 23, 25, 27, 35]), n: lv >= 4 ? 2 : 1, pierce: 0, size: L(lv, [2.3, 2.35, 2.85, 2.9, 3.0]), speed: 0, knock: 2.6 };
    case 'bow': // arrows at the nearest zombies, passing through
      return evo
        ? { cd: 0.85, dmg: 22, n: 10, pierce: 5, size: 15, speed: 19, knock: 1.2 }
        : { cd: L(lv, [1.05, 1.05, 1.0, 1.0, 0.82]), dmg: L(lv, [12, 13, 18, 19, 21]), n: L(lv, [1, 2, 2, 3, 3]), pierce: L(lv, [1, 1, 2, 2, 3]), size: 13, speed: 17, knock: 0.8 };
    case 'spear': // a thrust along a line; evolved: three thrusts and chain lightning
      return evo
        ? { cd: 1.0, dmg: 44, n: 3, pierce: 4, size: 7.5, speed: 0, knock: 2 }
        : { cd: L(lv, [1.6, 1.55, 1.5, 1.5, 1.25]), dmg: L(lv, [22, 30, 32, 34, 40]), n: lv >= 4 ? 2 : 1, pierce: 0, size: L(lv, [4.4, 4.5, 6.0, 6.1, 6.3]), speed: 0, knock: 1.6 };
    case 'blaster': // fast shots; evolved: a stream of embers that set zombies alight
      return evo
        ? { cd: 0.11, dmg: 10, n: 1, pierce: 1, size: 12, speed: 26, knock: 0.3 }
        : { cd: L(lv, [0.34, 0.33, 0.28, 0.28, 0.26]), dmg: L(lv, [6, 8, 8, 8, 11]), n: lv >= 4 ? 2 : 1, pierce: 0, size: 11, speed: 23, knock: 0.35 };
    case 'wards': // shields circling the survivor; evolved: a ring of six that also stops goo
      return evo
        ? { cd: 0.45, dmg: 22, n: 6, pierce: 0, size: 2.6, speed: 4.2, knock: 3.4 }
        : { cd: 0.5, dmg: L(lv, [9, 9, 14, 14, 16]), n: L(lv, [2, 3, 3, 4, 4]), pierce: 0, size: L(lv, [1.9, 1.9, 1.95, 2.0, 2.4]), speed: L(lv, [2.9, 3.0, 3.1, 3.2, 4.0]), knock: 2.8 };
    case 'torch': // torches thrown into the crowd leave burning ground; evolved: wildfire
      return evo
        ? { cd: 1.9, dmg: 22, n: 4, pierce: 0, size: 2.7, speed: 5, knock: 0 }
        : { cd: L(lv, [2.4, 2.4, 2.3, 2.3, 2.1]), dmg: L(lv, [10, 10, 11, 16, 17]), n: L(lv, [1, 2, 2, 2, 3]), pierce: 0, size: L(lv, [1.6, 1.6, 2.0, 2.05, 2.1]), speed: L(lv, [3, 3, 3, 4.5, 4.5]), knock: 0 };
    case 'shield': // a shove of the tower shield: a wide, short cone that hurls zombies back and stuns
      // them (speed: stun seconds); level 4 shoves behind too; evolved: a ring that heals per hit
      return evo
        ? { cd: 1.05, dmg: 34, n: 1, pierce: 0, size: 3.1, speed: 1.1, knock: 6 }
        : { cd: L(lv, [1.6, 1.55, 1.45, 1.45, 1.25]), dmg: L(lv, [13, 17, 20, 22, 28]), n: lv >= 4 ? 2 : 1, pierce: 0, size: L(lv, [2.1, 2.2, 2.45, 2.5, 2.7]), speed: L(lv, [0.5, 0.55, 0.7, 0.7, 0.9]), knock: 5 };
    case 'robot': // a robot helper with a laser; evolved: a piercing beam and a gem magnet
      return evo
        ? { cd: 0.42, dmg: 20, n: 2, pierce: 6, size: 12, speed: 30, knock: 0.6 }
        : { cd: L(lv, [0.8, 0.8, 0.64, 0.64, 0.6]), dmg: L(lv, [9, 12, 12, 13, 17]), n: lv >= 4 ? 2 : 1, pierce: 0, size: L(lv, [9, 9, 9, 9, 11]), speed: 24, knock: 0.4 };
  }
}

/** What the trinkets do per level. */
export const PASSIVE_STEP: Record<PassiveId, number> = {
  swift: 0.08, // +8 % move speed
  vigor: 18, // +18 max HP
  regen: 0.35, // +0.35 HP / s
  magnet: 0.3, // +30 % pickup reach
  armor: 1, // −1 damage per bite
  haste: 0.07, // −7 % cooldowns
  reach: 0.1, // +10 % area
  luck: 0.1, // +10 % luck (rarer cards, crits, coins)
};

/** XP to go from level n to n + 1. */
export function xpToNext(n: number): number {
  return Math.round(5 + (n - 1) * 6 + Math.pow(Math.max(0, n - 1), 1.75) * 0.9);
}

/**
 * The heroes: who stands at the camp, which Mini Character they are, what they start with and
 * their twist. Every hero is recruited with coins; three can also be earned by a milestone.
 */
export type HeroId = 'survivor' | 'ranger' | 'knight' | 'soldier' | 'worker' | 'medic' | 'scout' | 'mech';
export const HERO_IDS: HeroId[] = ['survivor', 'ranger', 'knight', 'soldier', 'worker', 'medic', 'scout', 'mech'];
export type Milestone = { kind: 'level' | 'time' | 'dawn'; n: number };
export interface HeroDef {
  /** The 3D model ('own' is the player's platform character; 'mf:' a Mini Forest model). */
  model: string;
  start: WeaponId;
  hp: number;
  /** Speed bonus (0.1 = +10 %). */
  speed: number;
  armor: number;
  cost: number;
  /** Damage, coin and pickup-reach multipliers. */
  dmgK?: number;
  coinK?: number;
  magnetK?: number;
  /** Health per second. */
  regen?: number;
  /** Heal pickups heal this much more; every coin heals this many points (the Medic). */
  healK?: number;
  coinHeal?: number;
  /** Extra levels the starting weapon begins with. */
  startLv?: number;
  /** Earned for free by this milestone (or bought). */
  milestone?: Milestone;
}
export const HEROES: Record<HeroId, HeroDef> = {
  survivor: { model: 'own', start: 'blade', hp: 0, speed: 0, armor: 0, cost: 0 },
  ranger: { model: 'mf:character-archer', start: 'bow', hp: 0, speed: 0.1, armor: 0, cost: 220 },
  knight: { model: 'character-knight', start: 'spear', hp: 25, speed: 0, armor: 2, cost: 380 },
  soldier: { model: 'character-soldier', start: 'blaster', hp: 0, speed: 0, armor: 0, cost: 300, dmgK: 1.15 },
  worker: { model: 'character-worker', start: 'torch', hp: 20, speed: 0, armor: 0, cost: 260, coinK: 1.3, startLv: 1 },
  medic: { model: 'character-female-e', start: 'wards', hp: 0, speed: 0, armor: 0, cost: 600, regen: 0.45, healK: 1.6, coinHeal: 3, milestone: { kind: 'level', n: 20 } },
  scout: { model: 'character-female-c', start: 'robot', hp: -10, speed: 0.15, armor: 0, cost: 450, magnetK: 1.4, milestone: { kind: 'time', n: 300 } },
  mech: { model: 'character-robot', start: 'shield', hp: 30, speed: -0.12, armor: 2, cost: 900, milestone: { kind: 'dawn', n: 1 } },
};

// ------------------------------------------------------------------ power-ups

/** Pickups beyond the gems and coins: dropped by zombies (the chest by mini-bosses). */
export type PowerId = 'heal' | 'vacuum' | 'nuke' | 'freeze' | 'rage' | 'boots';
export const POWER_IDS: PowerId[] = ['heal', 'vacuum', 'nuke', 'freeze', 'rage', 'boots'];
/** The timed ones and how long they last (s). */
export type BuffId = 'freeze' | 'rage' | 'boots';
export const BUFF_IDS: BuffId[] = ['freeze', 'rage', 'boots'];
export const BUFF_TIME: Record<BuffId, number> = { freeze: 4, rage: 10, boots: 10 };
/** Rage Tonic damage and Speed Boots speed multipliers; Heal Stew health. */
export const RAGE_K = 1.6;
export const BOOTS_K = 1.4;
export const STEW_HP = 30;
/** Drop odds per kill (a Hulk is far likelier), the least gap between drops and the pity timer (s). */
export const POWER_DROP = { base: 0.0065, tank: 0.12, gap: 9, pity: 50 };
/** Spawn weights of the power-ups. */
export const POWER_W: Record<PowerId, number> = { heal: 24, vacuum: 15, nuke: 7, freeze: 12, rage: 14, boots: 12 };

// ------------------------------------------------------------------ endless

/** After the dawn: the horde grows per minute of the endless night; a boss every bossEvery s. */
export const ENDLESS = {
  capPerMin: 0.15, capMax: 1.9, ratePerMin: 0.25,
  /** Zombie health and bites compound per minute of the endless night; speed grows up to +35 %. */
  hpGrow: 1.24, dmgGrow: 1.09, speedPerMin: 0.03, speedMax: 0.35,
  bossEvery: 75, coinK: 1.5, coinsPerMin: 12,
};
