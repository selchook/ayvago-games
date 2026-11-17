// Hex Realm: the game's data. Classes and their combos and skills, the foes and the three bosses,
// the item tiers and rarities, the talents, the quests, the dungeons and the Easy / Normal tuning,
// side by side. Pure data and small pure helpers: shared by the simulation (battle.ts), the
// campaign (campaign.ts), the bot and the views.

export const DT = 1 / 60;
export type Mode = 'easy' | 'normal';

// ------------------------------------------------------------------ tuning (Normal | Easy)

export interface Tuning {
  foeHp: number;
  foeDmg: number;
  /** Telegraph wind-ups are this much longer (more time to dodge). */
  windup: number;
  gold: number;
  xp: number;
  /** Chance of a random encounter on a wild hex. */
  encounter: number;
  potions: number;
  /** Health back after a won battle (fraction of max). */
  heal: number;
  /** Gold kept when the hero falls. */
  keepGold: number;
}

export const TUNING: Record<Mode, Tuning> = {
  normal: { foeHp: 1, foeDmg: 1, windup: 1, gold: 1, xp: 1, encounter: 0.2, potions: 3, heal: 0.3, keepGold: 0.8 },
  easy: { foeHp: 0.75, foeDmg: 0.6, windup: 1.3, gold: 1.25, xp: 1.2, encounter: 0.13, potions: 4, heal: 0.5, keepGold: 0.95 },
};

// ------------------------------------------------------------------ classes

export const CLASS_IDS = ['warrior', 'rogue', 'ranger', 'monk', 'cleric', 'wizard'] as const;
export type ClassId = (typeof CLASS_IDS)[number];

/** The three combos every class has: A, the blade chain (tap ATTACK); B, the heavy chain (tap, tap,
 * then hold ATTACK: a charged finisher); C, the dash strike (ATTACK right after a ROLL). */
export const COMBO_IDS = ['chain', 'heavy', 'dash'] as const;
export type ComboId = (typeof COMBO_IDS)[number];

/** How a blow looks (its trail, its impact) in the view. */
export type BlowFx = 'slash' | 'stab' | 'spin' | 'cleave' | 'thrust' | 'rise' | 'plunge' | 'shot' | 'power' | 'rain' | 'meteor' | 'burst' | 'consecrate' | 'lance' | 'palm' | 'kick';

/** One blow of a combo. */
export interface Blow {
  anim: string;
  /** Clip speed. */
  speed: number;
  /** Seconds from the start to the hit (or the shot). */
  hit: number;
  /** Seconds before the next blow may start (and the combo window opens). */
  dur: number;
  dmg: number;
  range: number;
  /** Cone in radians; the lane's width for a 'line'. */
  arc: number;
  lunge: number;
  knock: number;
  /** Ranged: projectiles fired (spread) instead of a melee cone. */
  shots?: number;
  /** The fan of several shots (radians between two). */
  spread?: number;
  pierce?: boolean;
  /** A small burst round the target (the cleric's finisher). */
  burst?: number;
  /** The hit's shape: a cone (default), all round (a spin) or a lane ahead (a thrust). */
  shape?: 'cone' | 'circle' | 'line';
  /** The body turns this many full circles over the blow (view). */
  spin?: number;
  /** Throws light foes into the air for this long. */
  lift?: number;
  /** A leap: the hero flies this far ahead and lands on the hit, a ring all round. */
  leap?: number;
  stun?: number;
  freeze?: number;
  /** Breaks shields and guards at once. */
  breaks?: boolean;
  /** Always a critical hit. */
  crit?: boolean;
  /** A delayed area at the target (arrow rain, meteor): its radius. */
  rain?: number;
  /** A shockwave lane ahead after the hit (cleave, lance): its length. */
  wave?: number;
  /** The clip held (played slowly) while a heavy finisher charges. */
  charge?: { anim: string; speed: number };
  /** Hit-stop on impact (seconds). */
  stop?: number;
  fx: BlowFx;
}

export interface SkillDef {
  id: string;
  cd: number;
  anim: string;
  speed: number;
  /** Colour of its button ring and effects. */
  color: number;
}

export interface ClassDef {
  hp: number;
  atk: number;
  speed: number;
  crit: number;
  ranged: boolean;
  /** Projectile of a ranged class's blows. */
  shot?: 'arrow' | 'bolt';
  /** The three combos (B shares A's first two blows; its third is the charged finisher). */
  combos: Record<ComboId, Blow[]>;
  skills: [SkillDef, SkillDef];
  /** The roll (the cleric has none: a blessed step, Run sped up). */
  dodgeAnim: string;
  color: number;
  /** The clip used as the combat idle. */
  idle: string;
}

const B = (anim: string, speed: number, hit: number, dur: number, dmg: number, range: number, arc: number, lunge = 0.6, knock = 0.6, o: Partial<Blow> = {}): Blow =>
  ({ anim, speed, hit, dur, dmg, range, arc, lunge, knock, fx: 'slash', ...o });
const TAU = Math.PI * 2;
/** A full combo set: A's blows, the heavy finisher (after A's first two) and C's three blows. */
const C = (chain: Blow[], heavy: Blow, dash: Blow[]): Record<ComboId, Blow[]> => ({ chain, heavy: [chain[0], chain[1], heavy], dash });

export const CLASS: Record<ClassId, ClassDef> = {
  // the sword: slash, backslash and a spinning Whirl; an overhead Cleave with a shockwave; a
  // lunging thrust, a rising slash that throws light foes up and a leaping Plunge
  warrior: {
    hp: 150, atk: 12, speed: 4.9, crit: 0.05, ranged: false, color: 0xd8574a, dodgeAnim: 'Roll', idle: 'Idle_Attacking',
    combos: C([
      B('Sword_Attack', 1.7, 0.2, 0.42, 1, 1.9, 2.4, 0.7, 0.7),
      B('Sword_Attack2', 1.7, 0.2, 0.42, 1.1, 1.9, 2.6, 0.7, 0.8),
      B('Sword_Attack2', 1.45, 0.26, 0.62, 1.75, 2.45, TAU, 0.35, 1.7, { shape: 'circle', spin: 1, fx: 'spin', stop: 0.05 }),
    ], B('Sword_Attack', 1.35, 0.28, 0.78, 2.6, 2.6, 1.7, 1.0, 2.8, { wave: 4.6, breaks: true, stun: 0.5, fx: 'cleave', charge: { anim: 'Sword_Attack', speed: 0.11 }, stop: 0.09 }), [
      B('Sword_Attack', 2.3, 0.12, 0.4, 1.3, 3.3, 1.2, 2.7, 0.9, { shape: 'line', fx: 'thrust' }),
      B('Sword_Attack2', 1.6, 0.2, 0.48, 1.2, 2.1, 2.4, 0.4, 0.3, { lift: 0.9, fx: 'rise' }),
      B('Sword_Attack', 1.1, 0.42, 0.8, 2.4, 2.6, TAU, 0, 2.0, { shape: 'circle', leap: 3.2, stun: 0.4, fx: 'plunge', stop: 0.08 }),
    ]),
    skills: [
      { id: 'bash', cd: 7, anim: 'Punch', speed: 1.5, color: 0xffb04a },
      { id: 'whirl', cd: 12, anim: 'Sword_Attack2', speed: 2.4, color: 0xff6a4a },
    ],
  },
  // twin daggers: four quick stabs and a spinning Blade Dance; a crouched Eviscerate that always
  // crits; a shadow lunge, an uppercut and Death from Above
  rogue: {
    hp: 112, atk: 10, speed: 5.7, crit: 0.16, ranged: false, color: 0x8a6ad8, dodgeAnim: 'Roll', idle: 'Idle_Attacking',
    combos: C([
      B('Dagger_Attack', 2.1, 0.13, 0.27, 0.85, 1.6, 2.2, 0.5, 0.3, { fx: 'stab' }),
      B('Dagger_Attack2', 2.6, 0.17, 0.3, 0.85, 1.6, 2.2, 0.5, 0.3, { fx: 'stab' }),
      B('Dagger_Attack', 2.1, 0.13, 0.27, 0.9, 1.6, 2.2, 0.5, 0.3, { fx: 'stab' }),
      B('Dagger_Attack2', 2.0, 0.22, 0.52, 1.7, 2.2, TAU, 0.4, 1.4, { shape: 'circle', spin: 2, fx: 'spin', stop: 0.05 }),
    ], B('Dagger_Attack2', 1.7, 0.2, 0.62, 2.3, 2.0, 1.3, 1.8, 1.6, { crit: true, breaks: true, fx: 'stab', charge: { anim: 'Dagger_Attack', speed: 0.1 }, stop: 0.09 }), [
      B('Dagger_Attack', 2.5, 0.1, 0.34, 1.1, 3.5, 1.1, 3.0, 0.6, { shape: 'line', fx: 'thrust' }),
      B('Punch', 1.8, 0.16, 0.4, 1.1, 2.0, 2.2, 0.4, 0.3, { lift: 0.9, fx: 'rise' }),
      B('Dagger_Attack2', 1.25, 0.4, 0.72, 2.2, 2.4, TAU, 0, 1.6, { shape: 'circle', leap: 3.4, stun: 0.3, fx: 'plunge', stop: 0.08 }),
    ]),
    skills: [
      { id: 'dash', cd: 6, anim: 'Roll', speed: 2.2, color: 0xb08aff },
      { id: 'smoke', cd: 14, anim: 'Punch', speed: 1.6, color: 0x9aa4b8 },
    ],
  },
  // the bow: two shots and a Triple Shot; a fully drawn Power Shot that pierces; a kick, a twin
  // shot and an Arrow Rain on the target
  ranger: {
    hp: 106, atk: 11, speed: 5.3, crit: 0.1, ranged: true, shot: 'arrow', color: 0x5ab84a, dodgeAnim: 'Roll', idle: 'Idle_Attacking',
    combos: C([
      B('Bow_Shoot', 1.6, 0.16, 0.36, 1, 13, 0, 0, 0.4, { shots: 1, fx: 'shot' }),
      B('Bow_Shoot', 1.6, 0.16, 0.36, 1, 13, 0, 0, 0.4, { shots: 1, fx: 'shot' }),
      B('Bow_Shoot', 1.3, 0.22, 0.55, 0.95, 14, 0, 0, 1.0, { shots: 3, spread: 0.2, fx: 'shot' }),
    ], B('Bow_Shoot', 1.0, 0.12, 0.6, 3.0, 16, 0, 0, 2.6, { shots: 1, pierce: true, breaks: true, fx: 'power', charge: { anim: 'Bow_Draw', speed: 0.55 }, stop: 0.07 }), [
      B('Punch', 1.8, 0.14, 0.34, 1.0, 1.9, 2.0, 0.3, 3.2, { fx: 'kick' }),
      B('Bow_Shoot', 2.0, 0.12, 0.32, 0.9, 13, 0, 0, 0.5, { shots: 2, spread: 0.12, fx: 'shot' }),
      B('Bow_Shoot', 1.2, 0.25, 0.6, 2.4, 12, 0, 0, 1.2, { rain: 2.7, fx: 'rain' }),
    ]),
    skills: [
      { id: 'volley', cd: 7, anim: 'Bow_Shoot', speed: 1.2, color: 0x9aff6a },
      { id: 'trap', cd: 10, anim: 'PickUp', speed: 2.4, color: 0xd8b04a },
    ],
  },
  // bare hands: jab, cross, jab and a Tornado Kick; a charged Iron Palm with a shock wave; a flying
  // knee, a rising dragon uppercut and a Falling Star
  monk: {
    hp: 126, atk: 9.5, speed: 5.6, crit: 0.08, ranged: false, color: 0xf0a030, dodgeAnim: 'Roll', idle: 'Idle_Attacking',
    combos: C([
      B('Attack', 2.2, 0.14, 0.28, 0.85, 1.6, 2.2, 0.6, 0.4, { fx: 'kick' }),
      B('Attack2', 2.2, 0.14, 0.28, 0.85, 1.6, 2.2, 0.6, 0.4, { fx: 'kick' }),
      B('Attack', 2.4, 0.13, 0.26, 0.9, 1.6, 2.2, 0.6, 0.4, { fx: 'kick' }),
      B('Attack2', 1.6, 0.2, 0.52, 1.7, 2.3, TAU, 0.4, 2.4, { shape: 'circle', spin: 1, fx: 'spin', stop: 0.05 }),
    ], B('Attack', 1.25, 0.22, 0.7, 2.4, 2.3, 1.5, 0.9, 3.0, { wave: 4.2, breaks: true, stun: 0.7, fx: 'palm', charge: { anim: 'Attack', speed: 0.1 }, stop: 0.09 }), [
      B('Attack2', 2.4, 0.12, 0.36, 1.2, 3.1, 1.2, 2.8, 1.0, { shape: 'line', fx: 'thrust' }),
      B('Attack', 1.8, 0.16, 0.42, 1.1, 2.0, 2.2, 0.4, 0.3, { lift: 1.0, fx: 'rise' }),
      B('Attack2', 1.2, 0.42, 0.74, 2.3, 2.5, TAU, 0, 2.0, { shape: 'circle', leap: 3.2, stun: 0.4, fx: 'plunge', stop: 0.08 }),
    ]),
    skills: [
      { id: 'flurry', cd: 7, anim: 'Attack', speed: 3, color: 0xffd04a },
      { id: 'palm', cd: 9, anim: 'Attack2', speed: 1.4, color: 0x7ad8ff },
    ],
  },
  // the holy staff: two blows and a Judgement burst; a charged Consecrate ring all round; a staff
  // thrust, a rising light and a Holy Leap
  cleric: {
    hp: 136, atk: 10, speed: 4.9, crit: 0.06, ranged: false, color: 0xf2e08a, dodgeAnim: 'Run', idle: 'Idle_Attacking',
    combos: C([
      B('Staff_Attack', 1.7, 0.18, 0.4, 1, 1.9, 2.4, 0.6, 0.6),
      B('Staff_Attack', 1.9, 0.16, 0.38, 1.05, 1.9, 2.4, 0.6, 0.6),
      B('Staff_Attack', 1.4, 0.24, 0.6, 1.5, 2.0, 2.6, 0.8, 1.8, { burst: 2.2, fx: 'burst' }),
    ], B('Spell1', 1.15, 0.4, 0.85, 2.2, 3.4, TAU, 0, 1.6, { shape: 'circle', breaks: true, stun: 0.5, fx: 'consecrate', charge: { anim: 'Spell1', speed: 0.12 }, stop: 0.08 }), [
      B('Staff_Attack', 2.2, 0.12, 0.36, 1.2, 3.0, 1.2, 2.4, 0.9, { shape: 'line', fx: 'thrust' }),
      B('Punch', 1.6, 0.18, 0.42, 1.1, 2.0, 2.2, 0.4, 0.3, { lift: 0.9, fx: 'rise' }),
      B('Staff_Attack', 1.1, 0.42, 0.76, 2.2, 2.5, TAU, 0, 1.8, { shape: 'circle', leap: 3.0, stun: 0.3, fx: 'plunge', stop: 0.08 }),
    ]),
    skills: [
      { id: 'heal', cd: 12, anim: 'Spell1', speed: 1.6, color: 0x7aff9a },
      { id: 'smite', cd: 8, anim: 'Staff_Attack', speed: 1.3, color: 0xffe27a },
    ],
  },
  // the wizard's staff: two bolts and a Starburst fan; a charged Arcane Lance down a lane; a staff
  // jab, a frost burst that freezes and a Meteor on the target
  wizard: {
    hp: 96, atk: 12, speed: 5.0, crit: 0.08, ranged: true, shot: 'bolt', color: 0x5ab0ff, dodgeAnim: 'Roll', idle: 'Idle_Attacking',
    combos: C([
      B('Staff_Attack', 1.8, 0.16, 0.38, 1, 12, 0, 0, 0.5, { shots: 1, fx: 'shot' }),
      B('Staff_Attack', 1.8, 0.16, 0.38, 1, 12, 0, 0, 0.5, { shots: 1, fx: 'shot' }),
      B('Spell2', 2.2, 0.3, 0.6, 0.8, 12, 0, 0, 0.8, { shots: 3, spread: 0.24, fx: 'shot' }),
    ], B('Spell1', 1.25, 0.3, 0.75, 2.6, 11, 1.3, 0, 1.8, { wave: 11, breaks: true, fx: 'lance', charge: { anim: 'Spell1', speed: 0.12 }, stop: 0.07 }), [
      B('Staff_Attack', 2.2, 0.12, 0.34, 1.0, 2.4, 1.2, 2.2, 2.4, { shape: 'line', fx: 'thrust' }),
      B('Spell2', 1.9, 0.2, 0.45, 0.9, 2.7, TAU, 0, 1.0, { shape: 'circle', freeze: 0.8, fx: 'burst' }),
      B('Spell1', 1.3, 0.3, 0.65, 2.6, 12, 0, 0, 1.6, { rain: 2.9, fx: 'meteor' }),
    ]),
    skills: [
      { id: 'fireball', cd: 6, anim: 'Spell1', speed: 1.8, color: 0xff7a2a },
      { id: 'nova', cd: 11, anim: 'Spell2', speed: 1.6, color: 0x8ae8ff },
    ],
  },
};

/** Seconds ATTACK must be held at the third blow to charge the heavy finisher. */
export const CHARGE_T = 0.35;
/** After a roll ends, an attack in this window starts the dash strike. */
export const DASH_WINDOW = 0.45;

/** The model of every class: public/assets/quaternius/rpg-characters/<id>.glb. */
export const HERO_MODELS = CLASS_IDS;

/** Hero stats at a level (before gear and talents). */
export function baseStats(cls: ClassId, level: number): { hp: number; atk: number } {
  const c = CLASS[cls];
  return { hp: Math.round(c.hp * (1 + 0.11 * (level - 1))), atk: c.atk * (1 + 0.1 * (level - 1)) };
}

/** XP to go from `level` to the next. */
export const xpToNext = (level: number): number => Math.round(40 + 30 * level + 6 * level * level);
export const MAX_LEVEL = 40;

export const DODGE = { dist: 4.4, time: 0.42, iframes: 0.36, cd: 0.75 };
export const POTION_HEAL = 0.4;

// ------------------------------------------------------------------ foes

export type FoeKind = 'bandit' | 'archer' | 'skeleton' | 'ghoul' | 'brute' | 'acolyte' | 'knight' | 'cultist'
  | 'chief' | 'warden' | 'captain' | 'troll' | 'mage' | 'lord';

export const BOSS_KINDS: FoeKind[] = ['troll', 'mage', 'lord'];
export const MINIBOSS_KINDS: FoeKind[] = ['chief', 'warden', 'captain'];

export interface FoeDef {
  /** Model key (kit.ts) and its look. */
  model: string;
  scale: number;
  /** Texture recolour: hue turn (radians), saturation, multiply colour, glow. */
  hue: number;
  sat: number;
  tint: number;
  glow: number;
  hp: number;
  dmg: number;
  speed: number;
  radius: number;
  xp: number;
  gold: number;
  /** Attack style. */
  ai: 'melee' | 'archer' | 'lunge' | 'slam' | 'caster' | 'shield' | 'fire' | 'boss';
  /** Melee reach (cone) or shot range. */
  reach: number;
  windup: number;
  /** Seconds between attacks. */
  rate: number;
  attack: string;
  /** Hit-reaction stagger chance (bosses never). */
  stagger: number;
}

export const FOE: Record<FoeKind, FoeDef> = {
  bandit: { model: 'rogue', scale: 0.92, hue: 0.45, sat: 0.75, tint: 0xf0d8c0, glow: 0x100604, hp: 34, dmg: 8, speed: 4.1, radius: 0.42, xp: 8, gold: 4, ai: 'melee', reach: 1.7, windup: 0.5, rate: 1.5, attack: 'Dagger_Attack', stagger: 1 },
  archer: { model: 'ranger', scale: 0.92, hue: 0, sat: 0.9, tint: 0xfff0d8, glow: 0x0a0806, hp: 28, dmg: 9, speed: 3.5, radius: 0.42, xp: 9, gold: 5, ai: 'archer', reach: 10, windup: 0.85, rate: 2.4, attack: 'Bow_Shoot', stagger: 1 },
  skeleton: { model: 'skeleton', scale: 1.05, hue: 0, sat: 1, tint: 0xffffff, glow: 0, hp: 46, dmg: 10, speed: 3.3, radius: 0.44, xp: 10, gold: 5, ai: 'melee', reach: 1.9, windup: 0.6, rate: 1.7, attack: 'Sword', stagger: 1 },
  ghoul: { model: 'headless', scale: 1.0, hue: 0, sat: 1, tint: 0xd8ecc8, glow: 0x061006, hp: 30, dmg: 8, speed: 5.4, radius: 0.42, xp: 9, gold: 4, ai: 'lunge', reach: 4.6, windup: 0.55, rate: 2.2, attack: 'Punch', stagger: 1 },
  brute: { model: 'monk', scale: 1.38, hue: 2.0, sat: 1.0, tint: 0xe8ffd8, glow: 0x101a08, hp: 120, dmg: 17, speed: 2.7, radius: 0.7, xp: 24, gold: 12, ai: 'slam', reach: 2.3, windup: 1.0, rate: 2.8, attack: 'Attack2', stagger: 0.3 },
  acolyte: { model: 'cleric', scale: 0.95, hue: 0, sat: 1, tint: 0xc8a8ff, glow: 0x100820, hp: 40, dmg: 9, speed: 3.0, radius: 0.42, xp: 12, gold: 6, ai: 'caster', reach: 9, windup: 0.8, rate: 2.6, attack: 'Spell1', stagger: 1 },
  knight: { model: 'warrior', scale: 1.06, hue: 3.6, sat: 0.5, tint: 0xb8c0d0, glow: 0x0a0a14, hp: 90, dmg: 14, speed: 3.0, radius: 0.5, xp: 20, gold: 10, ai: 'shield', reach: 2.0, windup: 0.7, rate: 2.0, attack: 'Sword_Attack', stagger: 0.4 },
  cultist: { model: 'wizard', scale: 0.95, hue: 2.45, sat: 1.15, tint: 0xffd8d0, glow: 0x180404, hp: 38, dmg: 12, speed: 3.0, radius: 0.42, xp: 14, gold: 7, ai: 'fire', reach: 9, windup: 1.1, rate: 3.0, attack: 'Spell1', stagger: 1 },
  chief: { model: 'rogue', scale: 1.35, hue: 0.45, sat: 1.1, tint: 0xffe0c8, glow: 0x301008, hp: 320, dmg: 13, speed: 4.4, radius: 0.6, xp: 60, gold: 40, ai: 'boss', reach: 2.0, windup: 0.6, rate: 1.5, attack: 'Dagger_Attack2', stagger: 0 },
  warden: { model: 'skeleton', scale: 1.55, hue: 0, sat: 1, tint: 0xd8f0ff, glow: 0x002040, hp: 520, dmg: 16, speed: 3.4, radius: 0.7, xp: 90, gold: 60, ai: 'boss', reach: 2.4, windup: 0.7, rate: 1.6, attack: 'Sword', stagger: 0 },
  captain: { model: 'ranger', scale: 1.35, hue: 2.4, sat: 1.0, tint: 0xffd0b0, glow: 0x180c04, hp: 560, dmg: 15, speed: 3.8, radius: 0.6, xp: 100, gold: 80, ai: 'boss', reach: 10, windup: 0.8, rate: 1.4, attack: 'Bow_Shoot', stagger: 0 },
  troll: { model: 'monk', scale: 2.15, hue: 2.0, sat: 1.1, tint: 0xf0ffe0, glow: 0x24381a, hp: 800, dmg: 24, speed: 3.0, radius: 1.1, xp: 220, gold: 150, ai: 'boss', reach: 3.2, windup: 1.0, rate: 1.4, attack: 'Attack2', stagger: 0 },
  mage: { model: 'wizard', scale: 1.6, hue: 0.87, sat: 1.2, tint: 0xe0c8ff, glow: 0x200838, hp: 1060, dmg: 22, speed: 3.6, radius: 0.8, xp: 380, gold: 220, ai: 'boss', reach: 10, windup: 1.0, rate: 1.3, attack: 'Spell1', stagger: 0 },
  lord: { model: 'warrior', scale: 1.85, hue: 0, sat: 0.35, tint: 0xa098a8, glow: 0x300404, hp: 1700, dmg: 30, speed: 3.6, radius: 1.0, xp: 600, gold: 400, ai: 'boss', reach: 3.6, windup: 0.85, rate: 1.2, attack: 'Sword_Attack', stagger: 0 },
};

/** A foe's level scaling. */
export const foeHpAt = (base: number, lvl: number): number => base * HP_SCALE * (1 + 0.46 * (lvl - 1));
/** All foes' health and damage (tuned with balance.ts; 1.1 added the combos, the Shrine and the cards). */
export const HP_SCALE = 1.9;
export const DMG_SCALE = 1.18;
export const foeDmgAt = (base: number, lvl: number): number => base * DMG_SCALE * (1 + 0.21 * (lvl - 1));

// ------------------------------------------------------------------ power-ups

export const POWER_IDS = ['haste', 'rage', 'shield', 'regen', 'gold'] as const;
export type PowerId = (typeof POWER_IDS)[number];
export const POWER_TIME: Record<PowerId, number> = { haste: 10, rage: 10, shield: 12, regen: 10, gold: 15 };
export const POWER_COLOR: Record<PowerId, number> = { haste: 0x5ae8ff, rage: 0xff4a3a, shield: 0x8ab8ff, regen: 0x6aff8a, gold: 0xffd23f };

// ------------------------------------------------------------------ items

export type Slot = 'weapon' | 'armor' | 'trinket';
export const SLOTS: Slot[] = ['weapon', 'armor', 'trinket'];
export const RARITIES = ['common', 'uncommon', 'rare', 'epic', 'legendary'] as const;
export type Rarity = (typeof RARITIES)[number];
export const RARITY_COLOR: Record<Rarity, number> = { common: 0xd8d4c8, uncommon: 0x6ae06a, rare: 0x5aa8ff, epic: 0xc87aff, legendary: 0xffb43a };
export const RARITY_MULT: Record<Rarity, number> = { common: 1, uncommon: 1.2, rare: 1.45, epic: 1.75, legendary: 2.1 };
export const RARITY_AFFIXES: Record<Rarity, number> = { common: 0, uncommon: 1, rare: 2, epic: 3, legendary: 3 };

export type Stat = 'atk' | 'hp' | 'def' | 'crit' | 'cdr' | 'leech' | 'goldf' | 'speed';
export const STATS: Stat[] = ['atk', 'hp', 'def', 'crit', 'cdr', 'leech', 'goldf', 'speed'];
/** Shown as a percentage. */
export const PCT_STATS: Stat[] = ['def', 'crit', 'cdr', 'leech', 'goldf', 'speed'];
export const STAT_CAP: Partial<Record<Stat, number>> = { def: 45, crit: 50, cdr: 40, leech: 15, speed: 30, goldf: 100 };

/** Trinket kinds: their main stat. */
export const TRINKETS = ['ring', 'amulet', 'charm'] as const;
export type TrinketKind = (typeof TRINKETS)[number];
export const TRINKET_STAT: Record<TrinketKind, Stat> = { ring: 'crit', amulet: 'cdr', charm: 'leech' };

/** Material tiers by item level. */
export const TIERS = ['worn', 'iron', 'steel', 'silver', 'runed', 'mythic'] as const;
export type Tier = (typeof TIERS)[number];
export const tierOf = (ilvl: number): Tier => TIERS[Math.min(TIERS.length - 1, Math.floor((ilvl - 1) / 4))];

export interface Item {
  id: number;
  slot: Slot;
  /** Trinket kind (rings, amulets, charms). */
  kind?: TrinketKind;
  rarity: Rarity;
  ilvl: number;
  /** The blacksmith's upgrades, +0 … +5. */
  up: number;
  /** Its stat lines (main first). */
  stats: Partial<Record<Stat, number>>;
}

export const MAX_UP = 5;

/** The main stat values of an item kind at an item level (before rarity and upgrades). */
export function mainStats(slot: Slot, ilvl: number, kind?: TrinketKind): Partial<Record<Stat, number>> {
  if (slot === 'weapon') return { atk: 2 + 1.6 * ilvl };
  if (slot === 'armor') return { hp: 10 + 9 * ilvl, def: 2 + 0.5 * ilvl };
  return { [TRINKET_STAT[kind ?? 'ring']]: kind === 'charm' ? 2 + 0.22 * ilvl : kind === 'amulet' ? 4 + 0.45 * ilvl : 3 + 0.35 * ilvl };
}

/** An affix's size at an item level. */
export function affixValue(s: Stat, ilvl: number): number {
  switch (s) {
    case 'atk': return 1 + 0.6 * ilvl;
    case 'hp': return 6 + 4.5 * ilvl;
    case 'def': return 1 + 0.25 * ilvl;
    case 'crit': return 2 + 0.2 * ilvl;
    case 'cdr': return 3 + 0.25 * ilvl;
    case 'leech': return 1 + 0.12 * ilvl;
    case 'goldf': return 6 + 0.8 * ilvl;
    case 'speed': return 3 + 0.25 * ilvl;
  }
}

/** What an item sells for (the market buys at a third). */
export const itemValue = (it: Item): number => Math.round((14 + it.ilvl * 9) * RARITY_MULT[it.rarity] ** 1.6 * (1 + it.up * 0.25));
export const upgradeCost = (it: Item): number => Math.round(18 * (it.ilvl + 3) * (it.up + 1) * (0.8 + RARITY_MULT[it.rarity] * 0.2));
export const UP_BONUS = 0.12;

// ------------------------------------------------------------------ talents

export const TALENT_IDS = ['vigor', 'might', 'focus', 'precision', 'skill1', 'skill2', 'fortune', 'potion'] as const;
export type TalentId = (typeof TALENT_IDS)[number];
export const TALENT_MAX: Record<TalentId, number> = { vigor: 5, might: 5, focus: 4, precision: 4, skill1: 3, skill2: 3, fortune: 3, potion: 3 };

// ------------------------------------------------------------------ the world: places, quests, dungeons

export type PlaceId = 'village' | 'farm' | 'mine' | 'fort' | 'tower' | 'port' | 'castle';
export const PLACE_IDS: PlaceId[] = ['village', 'farm', 'mine', 'fort', 'tower', 'port', 'castle'];

export type QuestId = 'farm' | 'mine' | 'staff' | 'tower' | 'port' | 'castle';
export const QUEST_IDS: QuestId[] = ['farm', 'mine', 'staff', 'tower', 'port', 'castle'];

export interface QuestDef {
  place: PlaceId;
  /** Quests that must be done before this one opens. */
  needs: QuestId[];
  gold: number;
  /** Item level bonus of the reward and its rarity. */
  reward: Rarity;
  main: boolean;
  renown: number;
}

export const QUEST: Record<QuestId, QuestDef> = {
  farm: { place: 'farm', needs: [], gold: 60, reward: 'uncommon', main: true, renown: 200 },
  mine: { place: 'mine', needs: ['farm'], gold: 150, reward: 'rare', main: true, renown: 600 },
  staff: { place: 'fort', needs: ['mine'], gold: 110, reward: 'rare', main: true, renown: 300 },
  port: { place: 'port', needs: ['farm'], gold: 130, reward: 'rare', main: false, renown: 300 },
  tower: { place: 'tower', needs: ['staff'], gold: 240, reward: 'epic', main: true, renown: 900 },
  castle: { place: 'castle', needs: ['mine', 'tower'], gold: 500, reward: 'legendary', main: true, renown: 1500 },
};

export type ArenaKind = 'field' | 'forest' | 'farm' | 'mine' | 'cavern' | 'fort' | 'tower' | 'spire' | 'docks' | 'court' | 'hall' | 'throne' | 'rift';

/** A wave: foe kinds (with counts). */
export type Wave = [FoeKind, number][];
export interface Room { arena: ArenaKind; waves: Wave[]; boss?: FoeKind; shrine?: boolean }

/** The dungeons behind each place (levels are the place's, see PLACE_LEVEL). */
export const DUNGEON: Record<Exclude<PlaceId, 'village'>, Room[]> = {
  farm: [
    { arena: 'farm', waves: [[['bandit', 3]], [['bandit', 2], ['archer', 2]]], shrine: true },
    { arena: 'farm', waves: [[['bandit', 2]]], boss: 'chief' },
  ],
  mine: [
    { arena: 'mine', waves: [[['skeleton', 3]], [['skeleton', 2], ['ghoul', 2]]] },
    { arena: 'mine', waves: [[['ghoul', 3], ['skeleton', 1]], [['brute', 1], ['skeleton', 2]]], shrine: true },
    { arena: 'cavern', waves: [], boss: 'troll' },
  ],
  fort: [
    { arena: 'fort', waves: [[['skeleton', 3], ['archer', 1]], [['ghoul', 3], ['skeleton', 2]]], shrine: true },
    { arena: 'fort', waves: [[['knight', 1], ['skeleton', 2]]], boss: 'warden' },
  ],
  port: [
    { arena: 'docks', waves: [[['bandit', 3], ['archer', 2]], [['bandit', 2], ['brute', 1]]], shrine: true },
    { arena: 'docks', waves: [[['archer', 2]]], boss: 'captain' },
  ],
  tower: [
    { arena: 'tower', waves: [[['acolyte', 2], ['ghoul', 2]], [['cultist', 2], ['skeleton', 2]]] },
    { arena: 'tower', waves: [[['cultist', 2], ['acolyte', 1], ['knight', 1]], [['brute', 1], ['cultist', 2]]], shrine: true },
    { arena: 'spire', waves: [], boss: 'mage' },
  ],
  castle: [
    { arena: 'court', waves: [[['knight', 2], ['archer', 2]], [['knight', 1], ['cultist', 2], ['ghoul', 2]]], shrine: true },
    { arena: 'hall', waves: [[['knight', 2], ['acolyte', 2]], [['brute', 2], ['cultist', 1]]], shrine: true },
    { arena: 'throne', waves: [], boss: 'lord' },
  ],
};

/** The foes' level at each place (and the item level of what drops there). */
export const PLACE_LEVEL: Record<PlaceId, number> = { village: 1, farm: 2, mine: 4, fort: 7, port: 7, tower: 9, castle: 13 };

/** New Game+ adds this many levels to every foe per cycle. */
export const CYCLE_LEVELS = 9;

// ------------------------------------------------------------------ score

/** Renown for a boss, a quest and a rift floor (the score: the campaign's renown). */
export const RENOWN = { boss: 400, rift: 120, camp: 80 };
