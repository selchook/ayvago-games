// Trap Trail: what a stage is made of. levels.ts builds a Course for each stage; the sim (sim.ts)
// plays it and the view (view.ts) draws it. Coordinates are metres: the course runs from the start
// (z = 0) towards -z, y is up, the hero's feet stand on the tops of the solids.
import type { GemKind, PowerId, WorldId } from './defs';

export interface Box { x0: number; y0: number; z0: number; x1: number; y1: number; z1: number }

export type Surf = 'ground' | 'ice' | 'wood' | 'metal';

/** Something the hero stands on or bumps into. `off` solids are ignored (an open door, a fallen floe). */
export interface Solid {
  b: Box;
  surf: Surf;
  /** Drawn as a floating island (its top and striped sides), else the model on it is the look. */
  island?: boolean;
  off?: boolean;
  /** Moving solids: how far it moved this step (the hero standing on it is carried). */
  dx: number; dy: number; dz: number;
  bouncer?: Bouncer;
  bonus?: Bonus;
  crumble?: Crumble;
  mover?: Mover;
}

export interface Mover {
  solid: Solid;
  /** The box at its middle position, the half-swing and the period. */
  rest: Box;
  ax: number; ay: number; az: number;
  period: number;
  phase: number;
}

export interface Crumble {
  solid: Solid;
  rest: Box;
  /** Seconds the hero has stood on it; it falls after CRUMBLE_TIME. */
  stand: number;
  state: 'idle' | 'shake' | 'fall';
  fallY: number;
  vy: number;
  back: number;
}

export interface Bouncer { x: number; y: number; z: number; squash: number; solid: Solid }

/** A saw blade moving to and fro between a and b, its face across `normal` ('z': the blade faces along z). */
export interface Saw { x: number; y: number; z: number; ax: number; ay: number; az: number; bx: number; by: number; bz: number; period: number; phase: number; r: number; normal: 'x' | 'z'; spin: number }

export interface SpikeTrap { x: number; y: number; z: number; half: number; period: number; up: number; offset: number; state: 'down' | 'warn' | 'up'; lift: number }

/** A fixed cluster of spikes (a cylinder that hurts). */
export interface Spikes { x: number; y: number; z: number; r: number; h: number; scale: number; rot: number }

/** A standing spiked column that spins (hurts, and blocks like a wall). */
export interface Pillar { x: number; y: number; z: number; r: number; h: number; spin: number }

/** Spiked logs rolled down a lane towards +z, one every `every` seconds. */
export interface Roller { x: number; y: number; z0: number; z1: number; len: number; r: number; speed: number; every: number; offset: number; t: number; logs: { z: number; y: number; vy: number; spin: number }[] }

export interface Cannon { x: number; y: number; z: number; yaw: number; every: number; offset: number; speed: number; range: number; t: number; charge: number; recoil: number }
export interface Ball { x: number; y: number; z: number; vx: number; vy: number; vz: number; life: number; dead: boolean }

/** A bomb on the path (lights when the hero comes near) or dropped by a pipe. */
export interface Bomb { x: number; y: number; z: number; vy: number; ground: number; state: 'idle' | 'fall' | 'lit' | 'gone'; fuse: number; t: number; dropped: boolean; back: number; home: [number, number, number] }

/** A pipe over the path that drops a bomb every `every` seconds onto (x, ground, z). */
export interface Dropper { x: number; y: number; z: number; ground: number; every: number; offset: number; t: number; warn: number }

/** A spiked ball swinging on a chain from a pivot, across `axis`. */
export interface Pendulum { px: number; py: number; pz: number; len: number; axis: 'x' | 'z'; amp: number; period: number; phase: number; x: number; y: number; z: number; ang: number }

/** Spiked balls circling a post. */
export interface Orbiter { x: number; y: number; z: number; r: number; speed: number; n: number; phase: number; balls: { x: number; y: number; z: number }[] }

export interface Checkpoint { x: number; y: number; z: number; n: number; on: boolean; wp: number }
export interface Lever { x: number; y: number; z: number; rot: number; door: number; on: boolean; t: number }
export interface Door { x: number; y: number; z: number; w: number; h: number; panel: Solid; open: number; opening: boolean }
export interface Chest { x: number; y: number; z: number; rot: number; coins: number; gem: GemKind | null; heart: boolean; open: number; opened: boolean; solid: Solid; nag: number }

/** The pack's four enemies: a crab that patrols sideways, a skull that hops after the hero, a horned gob that spots, roars and charges, a bee that hovers and swoops. */
export type FoeKind = 'crab' | 'skull' | 'gob' | 'bee';
export interface Foe {
  kind: FoeKind;
  x: number; y: number; z: number;
  vx: number; vy: number; vz: number;
  yaw: number;
  /** Where it lives: its home, how far it patrols, the isle it may not leave and that isle's top. */
  hx: number; hz: number; range: number;
  area: { x0: number; x1: number; z0: number; z1: number };
  ground: number;
  state: 'walk' | 'alert' | 'charge' | 'rest' | 'wait' | 'hop' | 'hover' | 'swoop' | 'back' | 'dead';
  t: number;
  dir: number;
  /** Swoop or charge direction. */
  ax: number; ay: number; az: number;
}

/** A "?" block over the path: bump it from below for coins (once). */
export interface Bonus { x: number; y: number; z: number; solid: Solid; used: boolean; bump: number; coins: number }

export type PickupKind = 'coin' | 'gem' | 'star' | 'heart' | 'half' | 'key' | 'power';
export interface Pickup { kind: PickupKind; x: number; y: number; z: number; gem?: GemKind; star?: number; power?: PowerId; taken: boolean; pull: boolean; bob: number }

/** Decor drawn with the static scenery (merged): a model key, place, turn and scale. */
export interface Decor { key: string; x: number; y: number; z: number; rot: number; s: number; tint?: number }

/** A point the autopilot walks through; `jump` there, `dash` there, `bounce` waits for the spring. */
export interface Waypoint {
  x: number; y: number; z: number; jump?: boolean; dash?: boolean; hold?: number;
  /** The point rides on mover `on` (it moves with it); a jump waits for mover `wait` to come round. */
  on?: number; wait?: number;
}

export interface Course {
  world: WorldId;
  /** 1-based stage number (1..20) and its place in its world (1..5). */
  n: number;
  inWorld: number;
  start: { x: number; y: number; z: number };
  goal: { x: number; y: number; z: number };
  par: number;
  solids: Solid[];
  movers: Mover[];
  crumbles: Crumble[];
  bouncers: Bouncer[];
  saws: Saw[];
  traps: SpikeTrap[];
  spikes: Spikes[];
  pillars: Pillar[];
  rollers: Roller[];
  cannons: Cannon[];
  balls: Ball[];
  bombs: Bomb[];
  droppers: Dropper[];
  pendulums: Pendulum[];
  orbiters: Orbiter[];
  checkpoints: Checkpoint[];
  levers: Lever[];
  doors: Door[];
  chests: Chest[];
  pickups: Pickup[];
  foes: Foe[];
  bonuses: Bonus[];
  decor: Decor[];
  /** Arrow signs and the stage number (models placed with the scenery). */
  waypoints: Waypoint[];
  /** The lowest island bottom: below it the hero has fallen. */
  floor: number;
  /** The castle tower behind the last goal. */
  tower: boolean;
}

export const box = (x0: number, y0: number, z0: number, x1: number, y1: number, z1: number): Box => ({
  x0: Math.min(x0, x1), y0: Math.min(y0, y1), z0: Math.min(z0, z1), x1: Math.max(x0, x1), y1: Math.max(y0, y1), z1: Math.max(z0, z1),
});

/** A box from its centre on x/z, its top and its size. */
export const topBox = (x: number, z: number, w: number, d: number, top: number, depth: number): Box =>
  box(x - w / 2, top - depth, z - d / 2, x + w / 2, top, z + d / 2);
