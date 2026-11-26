// Moon Rover: the twenty hand-built missions in four regions, and the parser that turns their maps
// into terrain, objectives and hazards. A map is a grid of 4 m tiles (north is up, row 0):
//   terrain   0-5 ground at that level (2 m a level) · . chasm · ^ v < > a ramp rising north, south,
//             west or east (from the level of the tile behind it; a kicker when the tile ahead is not
//             higher) · _ road · i ice · d dust · c crystal field (slow) · o crater · O big crater ·
//             p pit crater (a hole) · r small rocks · l lamp post · t monorail track (straight lines)
//   places    B base pad (2×2: the start, the return, a charger) · H hangar block · Q habitat dome
//             block · L launch tower and rocket (2×2) · U outpost (a supply drop) · E charging pad
//             (also a checkpoint) · G checkpoint gate · M force-field gate (on and off on a cycle)
//   things    C crystal sample · A stranded astronaut · P power pick-up (the level's `powers` in map
//             order) · X the hidden alien (bonus) · N generator (the miner set-piece) · Z the rogue
//             miner's start
//   obstacles T turret · Y double turret · R boulder · K crystal boulder · S tower · D dish · F fuel
//             barrels · W antenna
// Every non-digit tile takes the level most of its neighbours share (walls, level 4 and up, only
// when nothing else is near). Floors and plateaus are levels 0 to 3; walls 4 and 5.
import { TILE, STEP, type RegionId, type PowerId, REGION_IDS } from './defs';

export type Surf = 'rock' | 'road' | 'ice' | 'dust' | 'field';

export interface Tile {
  k: 'ground' | 'chasm' | 'ramp';
  /** Height level (the low end of a ramp). */
  L: number;
  /** A ramp's rising direction: 0 N, 1 E, 2 S, 3 W. */
  dir: number;
  surf: Surf;
  /** The map character. */
  ch: string;
  /** Something solid stands on it (the bot's planner avoids it). */
  solid: boolean;
}

export interface Crater { x: number; z: number; R: number; H: number; large: boolean; pit: boolean; fresh?: boolean }

export interface Spot { x: number; z: number; y: number; c: number; r: number }

export interface Obstacle {
  kind: 'boulder' | 'crystalRock' | 'tower' | 'dish' | 'fuel' | 'antenna' | 'lamp' | 'hangar' | 'dome' | 'rocket' | 'turret' | 'generator';
  x: number; z: number; y: number;
  /** A circle (r) or a box (hw × hd half sizes, axis-aligned). */
  r: number;
  box?: [number, number];
  /** The top (m above its ground): the rover clears it above this. */
  top: number;
  rot: number;
  /** Size of the block it fills (tiles), for buildings. */
  w?: number; d?: number;
  seed: number;
}

export interface Track { axis: 'x' | 'z'; /** The fixed coordinate (m). */ at: number; from: number; to: number; y: number; period: number; offset: number; speed: number; dir: 1 | -1 }
export interface GateDef extends Spot { axis: 'x' | 'z'; open: number; closed: number; offset: number }
export interface TurretDef extends Spot { double: boolean; pattern: 'aim' | 'sweep'; yaw: number }

export interface RawLevel {
  region: RegionId;
  par: number;
  map: string[];
  powers?: PowerId[];
  /** Meteors strike near the rover every `every` seconds (from `first`). */
  meteors?: { every: number; first?: number };
  /** Solar storms: every `every` seconds for `len` seconds (from `first`). */
  storms?: { every: number; len: number; first: number };
  trains?: { period: number; offset: number; speed?: number; dir?: 1 | -1 }[];
  gates?: { open: number; closed: number; offset?: number }[];
  turrets?: ('aim' | 'sweep')[];
  setpiece?: 'miner' | 'escape';
  /** Escape set-pieces: seconds to reach the rocket. */
  countdown?: number;
  /** The hint shown the first time (strings key). */
  hint?: string;
}

export interface Level {
  n: number;
  region: RegionId;
  par: number;
  cols: number;
  rows: number;
  tiles: Tile[];
  start: { x: number; z: number; yaw: number };
  base: Spot;
  crystals: Spot[];
  astronauts: Spot[];
  outposts: Spot[];
  chargers: Spot[];
  checkpoints: (Spot & { axis: 'x' | 'z' })[];
  gates: GateDef[];
  turrets: TurretDef[];
  powers: (Spot & { id: PowerId })[];
  alien: Spot | null;
  generators: Spot[];
  rocket: Spot | null;
  miner: Spot | null;
  obstacles: Obstacle[];
  decor: { kind: 'rocks' | 'lamp'; x: number; z: number; y: number; seed: number }[];
  craters: Crater[];
  tracks: Track[];
  meteors: { every: number; first: number } | null;
  storms: { every: number; len: number; first: number } | null;
  setpiece: 'miner' | 'escape' | null;
  countdown: number;
  hint: string;
}

export const LEVELS_PER_REGION = 5;

// ------------------------------------------------------------------ the maps

export const RAW: RawLevel[] = [
  // 1-1 First Tracks: the plain below the base, a road north, a kicker, a crater, one astronaut
  {
    region: 'plains', par: 75, hint: 'h_drive',
    map: [
      '5555555555555555',
      '5333333333333335',
      '531111C1111U1135',
      '5311r111111r1135',
      '531111111111C135',
      '53C11o111A111135',
      '5311111_11111135',
      '531C11P_1111C135',
      '5311111_11r11135',
      '5311111^11111135',
      '531111C11C111135',
      '5311111_1111X135',
      '53111C1_11111135',
      '5311111_1C111135',
      '531r111_11111135',
      '5311111_11111135',
      '531111BB11111335',
      '531111BB11111335',
      '531HH11111111335',
      '531HH11111111335',
      '5333333333333335',
      '5555555555555555',
    ],
    powers: ['boost'],
  },
  {
    region: 'plains', par: 90, hint: 'h_craters', powers: ['magnet'],
    map: [
      '555555555555555555',
      '533333333333333335',
      '531111111C1111U135',
      '53111o111111o11135',
      '531C111A11111C1135',
      '5311o1111O1111o135',
      '53111111111111C135',
      '531C11o1111o111135',
      '5311111111111r1135',
      '5311O111C111111135',
      '53111111111o111135',
      '5311A11o11P111C135',
      '53111111E111111135',
      '531C1111111o111135',
      '5311111o1111111135',
      '5311r11111C1111135',
      '53111111111111X135',
      '531111111BB1111135',
      '531HH1111BB1111135',
      '531HH1111111111135',
      '533333333333333335',
      '555555555555555555',
    ],
  },
  {
    region: 'plains', par: 95, hint: 'h_ridge', powers: ['boost'],
    map: [
      '555555555555555555',
      '544444444444444445',
      '542C2222222233U345',
      '5422A222222233^345',
      '54222222C222222245',
      '542X22222222C22245',
      '5422222r2424222245',
      '542C222224242C2245',
      '5422222224v4222245',
      '54..............45',
      '54..............45',
      '5411114^4111111145',
      '54111C41411C111145',
      '541111414111111145',
      '541r1111E1111A1145',
      '541111111111C11145',
      '54111C111_11111145',
      '541111111_1r111145',
      '5411C1111_111C1145',
      '54111111BB11111145',
      '541HH111BB11111145',
      '541HH1111111r11145',
      '544444444444444445',
      '555555555555555555',
    ],
  },
  {
    region: 'plains', par: 105, hint: 'h_meteors', meteors: {'every': 3.6, 'first': 6}, powers: ['shield', 'boost'],
    map: [
      '555555555555555555',
      '544444444444444445',
      '541111C111U1111145',
      '54111dd11111111C45',
      '541C1ddd1111dd1145',
      '54111d1111A1d11145',
      '541111114441111145',
      '5411C1114441C11145',
      '541111114441111145',
      '54dd1111444111dd45',
      '541dd11E4441P11145',
      '5411d111444r111145',
      '541A111144411C1145',
      '541111114441111145',
      '5411C1114441111145',
      '541111114441111145',
      '54P111111111111d45',
      '54C11r111111ddd145',
      '5411111111111d1145',
      '541111111BB11C1145',
      '541HH1111BB1111145',
      '541HH1111111X11145',
      '544444444444444445',
      '555555555555555555',
    ],
  },
  {
    region: 'plains', par: 120, setpiece: 'miner', powers: ['emp', 'shield', 'emp'],
    map: [
      '55555555555555555555',
      '53333333333333333335',
      '531N1111111111111N35',
      '53111111C11C11111135',
      '5311R11111111R111135',
      '53111o111Z111o111135',
      '531C11111111111C1135',
      '53111111R11R11111135',
      '5311P111111111P11135',
      '53111o111N1111o11135',
      '531C11111111111C1135',
      '5311111R11111R111135',
      '53111111111111111135',
      '5311C11o11111o11C135',
      '53111111111111111135',
      '5311111111P111111135',
      '531r111111111111r135',
      '5311111111BB11111135',
      '531HH11111BB11111135',
      '531HH111111111111X35',
      '53333333333333333335',
      '55555555555555555555',
    ],
  },
  {
    region: 'canyon', par: 110, hint: 'h_turrets', turrets: ['aim'], powers: ['shield'],
    map: [
      '555555555555555555',
      '544444444444444445',
      '544444444C11U11445',
      '5444444441111C1445',
      '544444444111T11445',
      '541C111G111ccc1145',
      '5411cc1111111c1145',
      '5411cc144444411145',
      '54111114444441C145',
      '544441144444411G45',
      '544441144444c11145',
      '541C11144444c1C145',
      '541111G11111111145',
      '54111c111111ccc145',
      '541A1cc111C1111145',
      '54111111111111A145',
      '544441144444411G45',
      '544441144444411145',
      '541C1114444441C145',
      '54111111E111111145',
      '5411cc111111cc1145',
      '541111111BB1111145',
      '541HH1111BB111X145',
      '541HH1111111111145',
      '544444444444444445',
      '555555555555555555',
    ],
  },
  {
    region: 'canyon', par: 120, hint: 'h_gates', turrets: ['aim'], gates: [{'open': 3, 'closed': 2.4}, {'open': 3, 'closed': 2.4, 'offset': 1.5}], powers: ['magnet', 'emp'],
    map: [
      '555555555555555555',
      '544444444444444445',
      '541C11cc11cc11U145',
      '5411cc11C11cc11145',
      '541cc1111T111cc145',
      '5411C1cc1111C11145',
      '541111111111111A45',
      '544444441M44444445',
      '54111cc111111cc145',
      '541C11cc1111cc1C45',
      '5411111P11111X1145',
      '541cc1111C11111145',
      '541111cc111cc11145',
      '5444444441M4444445',
      '5411c1111111c11C45',
      '541C11cc1111111145',
      '541111cc11111cc145',
      '5411A1111E11111145',
      '541cc11C11111c1145',
      '54111111BB11111145',
      '541HH111BB1111C145',
      '541HH1111111111145',
      '544444444444444445',
      '555555555555555555',
    ],
  },
  {
    region: 'canyon', par: 125, turrets: ['aim', 'aim'], powers: ['hover', 'shield'],
    map: [
      '555555555555555555',
      '544444444444444445',
      '542C2222U2222C2245',
      '542222222222222245',
      '5422A22222T2222245',
      '542222C222222C2245',
      '542222222222222245',
      '542C222222222A2245',
      '542222424222222245',
      '54222C424222222245',
      '5422224v4222222245',
      '54..............45',
      '54..............45',
      '54222222224^422245',
      '542C222P2242422245',
      '54222222224242C245',
      '5422X22222E2222245',
      '542222U22222222245',
      '54222222222222T245',
      '542222222222222245',
      '54111111^111111145',
      '541C11111BB1111145',
      '541HH1111BB111C145',
      '541HH1111111111145',
      '544444444444444445',
      '555555555555555555',
    ],
  },
  {
    region: 'canyon', par: 115, turrets: ['sweep', 'sweep', 'aim'], powers: ['shield'],
    map: [
      '555555555555555555',
      '544444444444444445',
      '541C111111111U1145',
      '54111111C11111C145',
      '541Y1111111111Y145',
      '54111cc1111cc11145',
      '541A111C11C111A145',
      '541111111111111145',
      '54C1o111T1111o1145',
      '541111111111111145',
      '5411111C11C1111145',
      '544444411114444445',
      '541111111111111145',
      '541C11cc11cc11C145',
      '54111111E111111145',
      '541A11111111P11145',
      '5411111o1111111C45',
      '54C111111BB1111145',
      '541HH1111BB111X145',
      '541HH1111111111145',
      '544444444444444445',
      '555555555555555555',
    ],
  },
  {
    region: 'canyon', par: 110, setpiece: 'escape', countdown: 110, meteors: {'every': 2.1, 'first': 3}, powers: ['shield', 'boost'],
    map: [
      '555555555555555555',
      '544444444444444445',
      '54444411LL11444445',
      '54444411LL11444445',
      '544441111111C14445',
      '54441C111111114445',
      '5441111cc111A11445',
      '54411111cc11111445',
      '544C11111111C11445',
      '544411111111114445',
      '54..............45',
      '54..............45',
      '54111114^411111145',
      '541C111414111C1145',
      '54111cc4141A111145',
      '541111cc11111P1145',
      '5411C1111111C11145',
      '544444111111444445',
      '54444411E111444445',
      '541C1111111111C145',
      '541111111111111145',
      '5411cc1111111cc145',
      '54111111BB11111145',
      '541HH111BB11111145',
      '541HH111111111X145',
      '544444444444444445',
      '555555555555555555',
    ],
  },
  {
    region: 'polar', par: 100, hint: 'h_ice', trains: [{'period': 11, 'offset': 2}], powers: ['hover'],
    map: [
      '555555555555555555',
      '544444444444444445',
      '541C1111U11111C145',
      '5411ii111111ii1145',
      '541iiii1A11iiii145',
      '5411ii11111iiC1145',
      '541C111o1111111145',
      '541111111111111145',
      '54tttttttttttttt45',
      '541111111111111145',
      '541iii1111C11iii45',
      '541iii11E1111iii45',
      '5411C11111111C1145',
      '5411111iiii111A145',
      '54C1111iiii1111145',
      '541111111P11111145',
      '5411ii1111111ii145',
      '541111111BB1111145',
      '541HH11i1BB111X145',
      '541HH1111111111145',
      '544444444444444445',
      '555555555555555555',
    ],
  },
  {
    region: 'polar', par: 110, hint: 'h_trains', trains: [{'period': 10, 'offset': 0}, {'period': 12, 'offset': 5, 'dir': -1}], powers: ['magnet'],
    map: [
      '555555555555555555',
      '544444444444444445',
      '542C2222U22222C245',
      '54222222222A222245',
      '54tttttttttttttt45',
      '542222222222222245',
      '542211111111112245',
      '542C1iiiiiiii12245',
      '54221iiOiiiOi12245',
      '54221iiiiiiii1C245',
      '5422<iiCiiiCi>2245',
      '54221iiiiOiii12245',
      '542A1iiiiiiii12245',
      '54221iiCiiiii12245',
      '542211111111112245',
      '54222222E222222245',
      '54tttttttttttttt45',
      '54222222222222C245',
      '542C2222222X222245',
      '54222222BB22222245',
      '542HH222BB22222245',
      '542HH2222222222245',
      '544444444444444445',
      '555555555555555555',
    ],
  },
  {
    region: 'polar', par: 125, turrets: ['aim', 'aim'], trains: [{'period': 10, 'offset': 1}, {'period': 12, 'offset': 6, 'dir': -1}, {'period': 9, 'offset': 3}], powers: ['shield', 'emp'],
    map: [
      '555555555555555555',
      '544444444444444445',
      '541C111U1111C11145',
      '5411ii1111A11ii145',
      '54tttttttttttttt45',
      '541111C1111111C145',
      '541o1111T11111o145',
      '5411ii111111ii1145',
      '54tttttttttttttt45',
      '541C11111111U11145',
      '5411111iiii111A145',
      '541A11iiCCii111145',
      '5411111iiii1111C45',
      '54tttttttttttttt45',
      '541111E11111T11145',
      '541C1111o1111C1145',
      '5411ii111111ii1145',
      '541111111P11111145',
      '541111111BB1111145',
      '541HH1111BB11X1145',
      '541HH1111111111145',
      '544444444444444445',
      '555555555555555555',
    ],
  },
  {
    region: 'polar', par: 115, hint: 'h_storm', storms: {'every': 40, 'len': 14, 'first': 14}, meteors: {'every': 5, 'first': 10}, powers: ['shield', 'hover'],
    map: [
      '555555555555555555',
      '544444444444444445',
      '541C11111U11111C45',
      '54111iii11111iii45',
      '541A1iiip1iiii1145',
      '54111iii1111C11145',
      '541C11111o1111A145',
      '54111p11111p111145',
      '541111C111111C1145',
      '54ii1111E111111i45',
      '54iii11111111iii45',
      '541C11p11C11p11C45',
      '541111111111111145',
      '5411ii11P1111ii145',
      '541C1i1111111i1C45',
      '54111111BB11111145',
      '541HH111BB1111X145',
      '541HH1111111111145',
      '544444444444444445',
      '555555555555555555',
    ],
  },
  {
    region: 'polar', par: 135, setpiece: 'miner', powers: ['emp', 'shield'],
    map: [
      '55555555555555555555',
      '54444444444444444445',
      '541N111111ii11111N45',
      '54111iiii1111iii1145',
      '5411i11C1111C11i1145',
      '541ii11R11Z11R1ii145',
      '54111111111111111145',
      '541C1iiii11iiii1C145',
      '54111iP11111111i1145',
      '541N11i11o111i11N145',
      '54111111111111P11145',
      '5411C111R111R11C1145',
      '54111ii111111ii11145',
      '54111111111111111145',
      '54111111E11111111145',
      '541r111111BB11111r45',
      '541HH11111BB111X1145',
      '541HH111111111111145',
      '54444444444444444445',
      '55555555555555555555',
    ],
  },
  {
    region: 'dark', par: 110, hint: 'h_dark', powers: ['magnet'],
    map: [
      '555555555555555555',
      '544444444444444445',
      '54U111l1C11l11C145',
      '54___________11145',
      '541l1C1p111l_1A145',
      '5411111111111_1145',
      '541C1A11111C1_1145',
      '5411l1111111l_1U45',
      '541111C11p111_1145',
      '541C11111111l_1C45',
      '54111pp111111_1145',
      '541l1111E1111_1145',
      '5411C1111111l_1A45',
      '5411111111111_1145',
      '541l11P1111____145',
      '541111111BB_111145',
      '541HH1111BB11X1145',
      '541HH1111111111145',
      '544444444444444445',
      '555555555555555555',
    ],
  },
  {
    region: 'dark', par: 125, turrets: ['aim', 'aim', 'sweep'], powers: ['hover', 'shield'],
    map: [
      '555555555555555555',
      '544444444444444445',
      '541C111U111111C145',
      '5411T11111111T1145',
      '541C1111p11111A145',
      '541111111111111145',
      '541l11111111l11145',
      '54111C1111111C1145',
      '5411p1414111111145',
      '541A114141C1111145',
      '5411114v4111111145',
      '54..............45',
      '54..............45',
      '5411111114^4111145',
      '541C1111141411C145',
      '54111p1114141Y1145',
      '541l1111E11111l145',
      '54111111111111P145',
      '5411111111111p1C45',
      '541111111BB1111145',
      '541HH1111BB11X1145',
      '541HH1111111111145',
      '544444444444444445',
      '555555555555555555',
    ],
  },
  {
    region: 'dark', par: 120, storms: {'every': 28, 'len': 12, 'first': 10}, meteors: {'every': 4.2, 'first': 8}, gates: [{'open': 3.2, 'closed': 2.2}, {'open': 3, 'closed': 2.4, 'offset': 1.2}], powers: ['shield', 'emp'],
    map: [
      '555555555555555555',
      '544444444444444445',
      '541C11111U1111C145',
      '541111111111111145',
      '541A11C1111C11A145',
      '541111111111111145',
      '54444444M444444445',
      '5411C111111111C145',
      '54111o1111111o1145',
      '541C1111E111111A45',
      '5411111111111C1145',
      '54444444444M444445',
      '541C1111111111C145',
      '54111o11P1111o1145',
      '541l1111111111l145',
      '5411C11111111C1145',
      '541111111BB1111145',
      '541HH1111BB11X1145',
      '541HH1111111111145',
      '544444444444444445',
      '555555555555555555',
    ],
  },
  {
    region: 'dark', par: 140, turrets: ['aim', 'sweep'], gates: [{'open': 3, 'closed': 2.5}], trains: [{'period': 11, 'offset': 3}], meteors: {'every': 6, 'first': 12}, powers: ['shield', 'emp'],
    map: [
      '555555555555555555',
      '544444444444444445',
      '541U1111C11111U145',
      '5411ii1T1111ii1145',
      '541C111111111C1A45',
      '54444444M444444445',
      '541111111111111145',
      '54tttttttttttttt45',
      '541C11111111111C45',
      '5411o11U11o111A145',
      '541111ii1111ii1145',
      '541C111Y11111C1145',
      '54..111111111..145',
      '54..1111E11111..45',
      '5411111111111p1145',
      '541A11C11111C11145',
      '5411111111P1111145',
      '541111111BB1111145',
      '541HH1111BB11X1145',
      '541HH1111111111145',
      '544444444444444445',
      '555555555555555555',
    ],
  },
  {
    region: 'dark', par: 150, setpiece: 'escape', countdown: 150, meteors: {'every': 2.2, 'first': 4}, storms: {'every': 35, 'len': 10, 'first': 20}, trains: [{'period': 9, 'offset': 2}, {'period': 10, 'offset': 6, 'dir': -1}], turrets: ['aim', 'sweep'], gates: [{'open': 3.4, 'closed': 2}], powers: ['shield', 'boost', 'emp'],
    map: [
      '55555555555555555555',
      '54444444444444444445',
      '544444441LL144444445',
      '544444441LL144444445',
      '544441111111111C4445',
      '5441C111111111111445',
      '54411111T1111A111445',
      '54411111111111111445',
      '54tttttttttttttttt45',
      '541C11111111111C1145',
      '54111111111111111145',
      '54................45',
      '54................45',
      '5411114^411114^41145',
      '541C1141411114141145',
      '5411114Y4111P4141145',
      '541A1111111111A11145',
      '54444444M44444444445',
      '5411C11111111111C145',
      '5411111111E111111145',
      '541C11o1111111o11145',
      '54tttttttttttttttt45',
      '54111111111111111C45',
      '541C111111111P111145',
      '5411111111BB11111145',
      '541HH11111BB111X1145',
      '541HH111111111111145',
      '54444444444444444445',
      '55555555555555555555',
    ],
  },
];

// ------------------------------------------------------------------ the parser

const DIGITS = '012345';
const RAMPS = '^>v<';
const SURF: Record<string, Surf> = { _: 'road', i: 'ice', d: 'dust', c: 'field', t: 'road', B: 'road', E: 'road', U: 'road', G: 'road', M: 'road', L: 'road' };
const SOLID = 'HQTYRKSDFWlNL';
const OBST: Record<string, { kind: Obstacle['kind']; r: number; top: number }> = {
  T: { kind: 'turret', r: 1.3, top: 2.4 },
  Y: { kind: 'turret', r: 1.6, top: 2.0 },
  R: { kind: 'boulder', r: 1.8, top: 2.4 },
  K: { kind: 'crystalRock', r: 1.7, top: 2.6 },
  S: { kind: 'tower', r: 1.7, top: 7 },
  D: { kind: 'dish', r: 1.5, top: 3.2 },
  F: { kind: 'fuel', r: 1.4, top: 1.6 },
  W: { kind: 'antenna', r: 1.4, top: 2.4 },
  l: { kind: 'lamp', r: 0.5, top: 5 },
  N: { kind: 'generator', r: 1.5, top: 2.6 },
};

let cache: Map<number, Level> = new Map();

export const LEVEL_COUNT = RAW.length;
export const regionOf = (n: number): RegionId => RAW[n - 1]?.region ?? REGION_IDS[Math.min(3, Math.floor((n - 1) / LEVELS_PER_REGION))];
export const regionIndex = (n: number): number => REGION_IDS.indexOf(regionOf(n));
export const inRegionOf = (n: number): number => ((n - 1) % LEVELS_PER_REGION) + 1;
export const parOf = (n: number): number => RAW[n - 1]?.par ?? 90;

function hash(a: number, b: number, s = 0): number {
  let h = (a * 374761393 + b * 668265263 + s * 2147483647) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** A fresh copy of level n (1-based), parsed once and cloned. */
export function buildLevel(n: number): Level {
  let L = cache.get(n);
  if (!L) { L = parse(n, RAW[n - 1]); cache.set(n, L); }
  return structuredClone(L);
}

function parse(n: number, raw: RawLevel): Level {
  const rows = raw.map.length, cols = Math.max(...raw.map.map((s) => s.length));
  const ch = (c: number, r: number): string => (r >= 0 && r < rows && c >= 0 && c < cols ? raw.map[r][c] ?? '5' : '#');
  // heights: digits are given; every other tile takes the level most of its resolved neighbours
  // share (the four sides count twice, the corners once; a tie takes the lower), ramps last
  const H = new Array<number>(cols * rows).fill(-1);
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
    const k = ch(c, r);
    if (DIGITS.includes(k)) H[r * cols + c] = Number(k);
  }
  for (let pass = 0; pass < cols + rows; pass++) {
    const next = H.slice();
    let left = 0;
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
      const p = r * cols + c, k = ch(c, r);
      if (H[p] >= 0 || RAMPS.includes(k) || k === '.') continue;
      const votes = new Map<number, number>();
      for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
        if (!dr && !dc) continue;
        const nc = c + dc, nr = r + dr;
        if (nc < 0 || nr < 0 || nc >= cols || nr >= rows) continue;
        const h = H[nr * cols + nc];
        if (h >= 0) votes.set(h, (votes.get(h) ?? 0) + (dr && dc ? 1 : 2));
      }
      // walls (level 4 and up) never lend their height to a place on the floor beside them
      let best = -1, bv = 0;
      const floor = [...votes.keys()].some((h) => h < 4);
      for (const [h, n] of votes) if ((!floor || h < 4) && (n > bv || (n === bv && h < best))) { best = h; bv = n; }
      if (best >= 0) next[p] = best; else left++;
    }
    for (let i = 0; i < H.length; i++) H[i] = next[i];
    if (!left) break;
  }
  const tiles: Tile[] = [];
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
    const k = ch(c, r);
    const t: Tile = { k: 'ground', L: Math.max(0, H[r * cols + c]), dir: 0, surf: SURF[k] ?? 'rock', ch: k, solid: SOLID.includes(k) };
    if (k === '.') { t.k = 'chasm'; t.L = 0; }
    const ri = RAMPS.indexOf(k);
    if (ri >= 0) {
      t.k = 'ramp'; t.dir = ri;
      const [dx, dz] = [[0, -1], [1, 0], [0, 1], [-1, 0]][ri];
      const behind = H[(r - dz) * cols + (c - dx)];
      if (behind === undefined || behind < 0) throw new Error(`level ${n}: ramp at ${c},${r} has no ground behind it`);
      t.L = behind;
      t.surf = 'road';
    }
    tiles.push(t);
  }
  const cx = (c: number) => c * TILE + TILE / 2, cz = (r: number) => r * TILE + TILE / 2;
  const spot = (c: number, r: number): Spot => ({ x: cx(c), z: cz(r), y: tiles[r * cols + c].L * STEP, c, r });
  const L: Level = {
    n, region: raw.region, par: raw.par, cols, rows, tiles,
    start: { x: 0, z: 0, yaw: Math.PI }, base: spot(0, 0),
    crystals: [], astronauts: [], outposts: [], chargers: [], checkpoints: [], gates: [], turrets: [], powers: [],
    alien: null, generators: [], rocket: null, miner: null, obstacles: [], decor: [], craters: [], tracks: [],
    meteors: raw.meteors ? { every: raw.meteors.every, first: raw.meteors.first ?? 8 } : null,
    storms: raw.storms ?? null, setpiece: raw.setpiece ?? null, countdown: raw.countdown ?? 0, hint: raw.hint ?? '',
  };
  // blocks (B, H, Q, L): connected rectangles of one letter
  const seen = new Set<number>();
  const block = (c0: number, r0: number, k: string): { c0: number; r0: number; w: number; d: number } => {
    let w = 1, d = 1;
    while (ch(c0 + w, r0) === k) w++;
    while (ch(c0, r0 + d) === k) d++;
    for (let r = r0; r < r0 + d; r++) for (let c = c0; c < c0 + w; c++) seen.add(r * cols + c);
    return { c0, r0, w, d };
  };
  let powerI = 0, gateI = 0, turretI = 0;
  const walls = (c: number, r: number): 'x' | 'z' => {
    // a gate spans the corridor: across x when its east and west sides are walls or solid
    const blockedX = (k: string) => !'_0123456789BEUGMLicdtor'.includes(k) || k === '#';
    const hc = H[r * cols + c];
    const side = (dc: number, dr: number) => { const k = ch(c + dc, r + dr); const h = H[(r + dr) * cols + c + dc]; return blockedX(k) || h > hc; };
    return side(-1, 0) || side(1, 0) ? 'x' : side(0, -1) || side(0, 1) ? 'z' : 'x';
  };
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
    const k = ch(c, r), p = r * cols + c;
    const s = spot(c, r);
    const seed = Math.floor(hash(c, r, n) * 1e6);
    if ('BHQL'.includes(k) && !seen.has(p)) {
      const b = block(c, r, k);
      const x = b.c0 * TILE + (b.w * TILE) / 2, z = b.r0 * TILE + (b.d * TILE) / 2, y = s.y;
      if (k === 'B') { L.base = { x, z, y, c: b.c0, r: b.r0 }; L.start = { x, z: z + 0.6, yaw: Math.PI }; }
      else if (k === 'L') { L.rocket = { x, z, y, c: b.c0, r: b.r0 }; L.obstacles.push({ kind: 'rocket', x, z, y, r: 2.4, top: 30, rot: 0, seed, w: b.w, d: b.d }); }
      else L.obstacles.push({ kind: k === 'H' ? 'hangar' : 'dome', x, z, y, r: 0, box: [(b.w * TILE) / 2 - 0.3, (b.d * TILE) / 2 - 0.3], top: k === 'H' ? 4.4 : 5, rot: b.w >= b.d ? 0 : Math.PI / 2, seed, w: b.w, d: b.d });
      continue;
    }
    switch (k) {
      case 'C': L.crystals.push(s); break;
      case 'A': L.astronauts.push(s); break;
      case 'U': L.outposts.push(s); break;
      case 'E': L.chargers.push(s); break;
      case 'G': L.checkpoints.push({ ...s, axis: walls(c, r) }); break;
      case 'M': { const g = raw.gates?.[gateI++] ?? { open: 3, closed: 2.5 }; L.gates.push({ ...s, axis: walls(c, r), open: g.open, closed: g.closed, offset: g.offset ?? 0 }); break; }
      case 'P': L.powers.push({ ...s, id: raw.powers?.[powerI++] ?? 'boost' }); break;
      case 'X': L.alien = s; break;
      case 'N': L.generators.push(s); break;
      case 'Z': L.miner = s; break;
      case 'o': L.craters.push({ x: s.x + (hash(c, r, 3) - 0.5) * 0.8, z: s.z + (hash(c, r, 4) - 0.5) * 0.8, R: 3.6, H: 0.95, large: false, pit: false }); break;
      case 'O': L.craters.push({ x: s.x, z: s.z, R: 6.2, H: 1.5, large: true, pit: false }); break;
      case 'p': L.craters.push({ x: s.x, z: s.z, R: 5.6, H: 1.1, large: true, pit: true }); break;
      case 'r': L.decor.push({ kind: 'rocks', x: s.x, z: s.z, y: s.y, seed }); break;
    }
    const o = OBST[k];
    if (o) {
      const ob: Obstacle = { kind: o.kind, x: s.x, z: s.z, y: s.y, r: o.r, top: o.top, rot: Math.floor(hash(c, r, 7) * 4) * (Math.PI / 2), seed };
      L.obstacles.push(ob);
      if (k === 'T' || k === 'Y') {
        L.turrets.push({ ...s, double: k === 'Y', pattern: raw.turrets?.[turretI++] ?? 'aim', yaw: Math.PI });
      }
      if (k === 'l') L.decor.push({ kind: 'lamp', x: s.x, z: s.z, y: s.y, seed });
    }
  }
  // monorail tracks: straight runs of t (a full row or column)
  const used = new Set<number>();
  let trainI = 0;
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
    if (ch(c, r) !== 't' || used.has(r * cols + c)) continue;
    let w = 0, d = 0;
    while (ch(c + w, r) === 't') w++;
    while (ch(c, r + d) === 't') d++;
    const horiz = w >= d;
    const len = horiz ? w : d;
    for (let i = 0; i < len; i++) used.add(horiz ? r * cols + c + i : (r + i) * cols + c);
    const tr = raw.trains?.[trainI++] ?? { period: 12, offset: 0 };
    L.tracks.push({
      axis: horiz ? 'x' : 'z', at: horiz ? cz(r) : cx(c), from: (horiz ? c : r) * TILE, to: (horiz ? c + len : r + len) * TILE, y: tiles[r * cols + c].L * STEP,
      period: tr.period, offset: tr.offset, speed: tr.speed ?? 15, dir: tr.dir ?? 1,
    });
  }
  return L;
}

/** Map centre of a tile (m). */
export const tileX = (c: number): number => c * TILE + TILE / 2;
export const tileZ = (r: number): number => r * TILE + TILE / 2;

/** Drops the parsed copies (tests). */
export function resetLevelCache(): void { cache = new Map(); }
