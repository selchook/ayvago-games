// City generator: the plan's data types. A plan is plain data (numbers, strings, arrays): it
// can be hashed, saved as JSON, sent to a worker or a bot, and drawn by CityView.
import type { P, OBB } from './geom';

export type { P, OBB };

export type RoadClass = 'boulevard' | 'avenue' | 'street' | 'alley';

export type DistrictKind = 'downtown' | 'commercial' | 'residential' | 'suburban' | 'industrial' | 'docks' | 'park';
export const DISTRICTS: readonly DistrictKind[] = ['downtown', 'commercial', 'residential', 'suburban', 'industrial', 'docks', 'park'];

export type StyleId = 'metropolis' | 'coast' | 'industrial' | 'suburbia' | 'harbor';

export interface CityOptions {
  seed: number;
  /** Side of the square city in metres (default from the style, 1200–2000). */
  size?: number;
  style?: StyleId;
  /** District mix: multiplies each district's weight (1 = the style's own mix). */
  districts?: Partial<Record<DistrictKind, number>>;
  /** Override the style's water: 'river', 'coast', 'both' or 'none'. */
  water?: 'river' | 'coast' | 'both' | 'none';
  /** Ring road around downtown (default from the style). */
  ring?: boolean;
  /** Height multiplier for buildings (default 1). */
  height?: number;
}

export interface RoadNode {
  id: number; x: number; z: number;
  /** Incident edges, sorted by angle (atan2(z, x)) of their direction away from the node. */
  edges: number[];
  /** Junction (3+ roads), bend (2) or dead end (1). */
  kind: 'junction' | 'bend' | 'end';
  /** Traffic lights. */
  signal: boolean;
  /** Painted crosswalks on its approaches. */
  crosswalks: boolean;
  /** Roundabout island radius (0 = none). */
  island: number;
  /** The asphalt outline of the junction (empty for a plain bend). */
  poly: P[];
  /** Signal cycle offset in seconds. */
  phase: number;
}

export interface RoadEdge {
  id: number; a: number; b: number;
  cls: RoadClass;
  /** Centreline from node a to node b (≥ 2 points). */
  pts: P[];
  len: number;
  /** Half the asphalt width. */
  half: number;
  /** Lanes per direction. */
  lanes: number;
  /** Width of the planted median (0 = painted centre line). */
  median: number;
  /** A parking strip on both kerbs. */
  parking: boolean;
  bridge: boolean;
  /** Where the plain road starts and ends (arc length from a; the junctions own the rest). */
  trimA: number; trimB: number;
  /** Block on the N side going a→b, and on the other side (-1: outside the city). */
  faceN: number; faceS: number;
  name: string;
}

/** 'void': a leftover tangle of kerbs the generator gave up on (no ground drawn, nothing built). */
export type BlockKind = 'block' | 'park' | 'plaza' | 'water' | 'outer' | 'void';
export type Ground = 'grass' | 'paving' | 'gravel' | 'asphalt' | 'concrete' | 'sand' | 'dirt';

export interface Block {
  id: number;
  kind: BlockKind;
  district: DistrictKind;
  /** Kerb line (the sidewalk's outer edge), positive area except for 'outer'. */
  curb: P[];
  /** Road edge each kerb segment curb[i]→curb[i+1] runs along (-1 at corners). */
  curbEdge: number[];
  /** Inner edge of the sidewalk (null when the block is all pavement). */
  inner: P[] | null;
  /** Road edge each inner segment runs along (-1 at corners). */
  innerEdge: number[];
  walk: number;
  ground: Ground;
  area: number;
  c: P;
  lots: number[];
}

export type LotUse = 'building' | 'parking' | 'yard' | 'gas' | 'containers' | 'plaza' | 'empty';

export interface Lot {
  id: number; block: number; district: DistrictKind;
  /** u along the street, v inwards (the front is at -hd along v). */
  obb: OBB;
  /** The road the lot faces. */
  edge: number;
  use: LotUse;
  building: number;
}

export type BuildingType = 'tower' | 'office' | 'midrise' | 'shop' | 'apartment' | 'rowhouse' | 'house' | 'warehouse' | 'factory' | 'gas' | 'kiosk';
export type RoofKind = 'flat' | 'gable' | 'hip' | 'sawtooth' | 'shed' | 'dome';
/** How the shader draws a facade: punched windows, glass curtain, ribbon windows, brick, shed. */
export type FacadeStyle = 'punched' | 'glass' | 'ribbon' | 'brick' | 'shed' | 'house' | 'blank';
export type PartKind = 'mass' | 'roofbox' | 'tank' | 'antenna' | 'spire' | 'awning' | 'sign' | 'balconies' | 'fireescape' | 'chimney' | 'canopy' | 'stairs' | 'helipad' | 'crown' | 'loading' | 'garage';

export interface Part {
  kind: PartKind;
  obb: OBB;
  y0: number; y1: number;
  color: number;
  roof?: RoofKind;
  facade?: FacadeStyle;
  /** Shopfronts on the ground floor of this mass. */
  shop?: boolean;
  /** Floors (masses) or count of items (balconies). */
  n?: number;
  /** Second colour (trim, awning stripes, roof tiles). */
  color2?: number;
}

export interface Building {
  id: number; lot: number; block: number;
  type: BuildingType;
  district: DistrictKind;
  /** Footprint of the ground floor. */
  obb: OBB;
  /** Top of the highest mass (roof level, without antennas). */
  h: number;
  floors: number;
  floorH: number;
  parts: Part[];
  /** Front door on the street side: position and heading (facing out). */
  door: { x: number; z: number; h: number };
  /** A walkable roof reached by stairs: the stair door at street level and the roof spot. */
  roofAccess: { door: P; roof: P; y: number } | null;
  landmark: string;
  /** Lit-window share at night (0..1). */
  lit: number;
  seed: number;
}

export type PropKind = 'lamp' | 'signal' | 'tree' | 'palm' | 'conifer' | 'bench' | 'bin' | 'hydrant' | 'car' | 'bollard' | 'container' | 'pump' | 'fountain' | 'statue' | 'crane' | 'busstop' | 'planter' | 'pool' | 'pond' | 'tank' | 'kiosk' | 'umbrella';

export interface Prop {
  kind: PropKind; x: number; z: number;
  /** Heading the prop faces. */
  h: number;
  /** Height of its base (stacked containers). */
  y: number;
  /** Size or variant. */
  s: number;
  /** Colour (cars, containers, umbrellas). */
  c: number;
}

export type WallKind = 'fence' | 'hedge' | 'railing' | 'wall' | 'chainlink';
export interface Wall { kind: WallKind; a: P; b: P; h: number }

export interface ParkingSpot { x: number; z: number; h: number; kind: 'street' | 'lot'; edge: number; taken: boolean }

export type Turn = 'straight' | 'left' | 'right' | 'uturn';

export interface Lane {
  id: number; edge: number;
  /** 1: from node a to node b, -1: from b to a. */
  dir: 1 | -1;
  /** 0 is the lane next to the centre line. */
  index: number;
  from: number; to: number;
  pts: P[]; len: number;
  /** Connectors leaving the lane's end. */
  next: number[];
  /** Speed limit, m/s. */
  speed: number;
}

export interface Connector {
  id: number; node: number; from: number; to: number;
  turn: Turn;
  pts: P[]; len: number;
  /** Signal group that must be green (−1: no signal). */
  group: number;
}

export interface Signal { node: number; edge: number; x: number; z: number; h: number; group: number }

export type SpawnKind = 'start' | 'parking' | 'door' | 'rooftop' | 'gas' | 'landmark' | 'dock' | 'park' | 'plaza' | 'bridge';
export interface Spawn { kind: SpawnKind; x: number; y: number; z: number; h: number; ref: number; name: string }

export interface Collider { obb: OBB; y0: number; y1: number; ref: number }
export interface Circle { x: number; z: number; r: number }

export interface Water {
  /** River outline polygons and the sea outline (big polygons, beyond the city too). */
  polys: P[][];
  /** Beaches: sand strips sloping into the sea (first half of each outline along the land, then back along the water). */
  beaches: P[][];
  /** Water surface height. */
  level: number;
}

export interface CityPlan {
  version: number;
  seed: number;
  size: number;
  style: StyleId;
  /** Land outline (the perimeter road's outer kerb). */
  land: P[];
  centre: P;
  nodes: RoadNode[];
  edges: RoadEdge[];
  blocks: Block[];
  lots: Lot[];
  buildings: Building[];
  props: Prop[];
  walls: Wall[];
  parking: ParkingSpot[];
  lanes: Lane[];
  connectors: Connector[];
  /** Pedestrian graph: points and edges (crossings marked). */
  walk: { pts: P[]; edges: [number, number, 0 | 1][] };
  signals: Signal[];
  spawns: Spawn[];
  colliders: Collider[];
  circles: Circle[];
  water: Water;
  /** Generation time in ms (not part of the hash). */
  ms: number;
}
