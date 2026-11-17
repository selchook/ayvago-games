// Sushi Rush: the restaurant's static scenery as placed kit models, merged by view.ts into one lit
// and one glowing mesh. What the upgrades add shows here: the rice cooker, the knife rack, the
// second pot and steamer basket, tea on the bar, the lanterns, the sakura tree and the falling
// petals' corner, the extra stools and the bell on the counter.
import {
  STATION, BACK_Z, BAR_Z, STOOL_Z, DOOR, POT2_DX, STEAM2_DX, seatXs,
} from './defs';
import type { Ranks } from './powers';
import { modelBox, type Placed } from './kit';

/** The counter top's height. */
export const TOP = 1.92;
/** The front bar is lower than the back counter (a serving counter the chef shows over). */
export const BAR_SY = 0.62;
export const BAR_TOP = TOP * BAR_SY;
const P = (key: string, x: number, y: number, z: number, rot = 0, s = 1, o: Partial<Placed> = {}): Placed => ({ key, x, y, z, rot, s, ...o });

/** A model standing on y (its lowest point there). */
function stand(key: string, x: number, y: number, z: number, rot = 0, s = 1): Placed {
  const b = modelBox(key);
  return P(key, x, y - b.min.y * s, z, rot, s);
}

export interface RoomOpts { ranks: Ranks; seats: number; day: number; menu?: boolean }

export function roomLayout(o: RoomOpts): Placed[] {
  const out: Placed[] = [];
  const r = o.ranks;
  // floors: kitchen tiles behind the bar, wood in the dining room
  for (let x = -14; x <= 14; x += 4) {
    for (let z = -6; z <= -2; z += 4) out.push(P('floor-kitchen', x, 0, z));
    for (let z = 2; z <= 14; z += 4) out.push(P('floor-wood', x, 0, z));
  }
  // the back wall (a wall piece's inner face is 1.67 in front of its origin): shoji panels and
  // shelves behind the stations; the side walls, the door on the left where customers come in
  const wallZ = BACK_Z - 0.9 + 1.67;
  ['wall-shoji', 'wall-shoji', 'wall-shelves', 'wall-normal', 'wall-normal', 'wall-shelves', 'wall-shoji', 'wall-shoji'].forEach((k, i) => out.push(P(k, -14 + i * 4, 0, wallZ)));
  for (let z = -4; z <= 12; z += 4) {
    out.push(P(Math.abs(z - DOOR.z) < 2.1 ? 'wall-door' : 'wall-shoji', -13.9 + 1.67, 0, z, Math.PI / 2));
    out.push(P('wall-shoji', 13.9 - 1.67, 0, z, -Math.PI / 2));
  }
  // the back counter with the stations
  const bz = BACK_Z;
  out.push(stand('fridge', STATION.fridge.x, 0, bz - 0.2));
  out.push(P('counter-end', -7.3 + 0.54 + 2 - 2.0, 0, bz, 0, 1, { sx: -1 }));
  out.push(P('counter-drawers', -5.1, 0, bz));
  out.push(P('counter-sink', -1.1, 0, bz));
  out.push(P('counter-doors', 2.9, 0, bz));
  out.push(stand('oven', STATION.pot.x, 0, bz - 0.2));
  out.push(P('counter-drawers', 8.9, 0, bz));
  out.push(P('counter-end', 10.9 + 2 - 0.54 + 0.0, 0, bz));
  // upper cabinets and a shelf of bottles
  out.push(P('cabinet-shelves', -5.1, 4.2, bz - 0.15));
  out.push(P('cabinet-doors', 2.9, 4.2, bz - 0.15));
  out.push(P('cabinet-shelves', 8.9, 4.2, bz - 0.15));
  out.push(stand('bottles', 8.0, 3.52, bz - 0.25, 0, 0.8));
  out.push(stand('plate', -5.9, 3.52, bz - 0.2), stand('plate', -5.9, 3.62, bz - 0.2), stand('plate', -5.9, 3.72, bz - 0.2));
  out.push(stand('bowl', -4.6, 3.52, bz - 0.2, 0, 0.8), stand('bowl', -4.0, 3.52, bz - 0.2, 0, 0.8));
  // the stations' props
  out.push(stand('rice', STATION.rice.x, TOP, bz + 0.15));
  if (r.rice >= 1) out.push(stand('pot2-empty', STATION.rice.x - 1.25, TOP, bz - 0.3, 0.4, 0.8));
  for (let i = 0; i < 4; i++) out.push(stand('nori', STATION.nori.x, TOP + i * 0.045, bz + 0.15, i * 0.25, 0.85));
  out.push(stand('cutting-table', STATION.knife.x + 0.2, TOP, bz + 0.1));
  if (r.knife >= 1) out.push(stand('knives', STATION.knife.x - 1.35, TOP, bz - 0.35, 0.3));
  out.push(stand('board', STATION.mat.x, TOP, bz + 0.15, 0, 1.6));
  out.push(stand('plate', STATION.mat.x + 1.2, TOP, bz - 0.2, 0, 0.8), stand('plate', STATION.mat.x + 1.2, TOP + 0.1, bz - 0.2, 0, 0.8));
  out.push(stand('wasabi', STATION.mat.x - 1.1, TOP, bz - 0.3));
  out.push(stand('steamer', STATION.steamer.x, TOP, bz + 0.1));
  if (r.steamer >= 2) out.push(stand('steamer', STATION.steamer.x + STEAM2_DX, TOP, bz + 0.1));
  void POT2_DX;
  // the front bar and its stools
  for (const x of [-6, -2, 2, 6]) out.push(P('counter-bar', x, 0, BAR_Z, Math.PI, 1, { sy: BAR_SY }));
  out.push(P('counter-end', -8.0 - 1.46 + 0.0, 0, BAR_Z, Math.PI, 1, { sx: -1, sy: BAR_SY }));
  out.push(P('counter-end', 8.0 + 1.46, 0, BAR_Z, Math.PI, 1, { sy: BAR_SY }));
  for (const x of seatXs(o.seats)) {
    out.push(P('stool', x, 0, STOOL_Z));
    if (r.tea >= 2) out.push(stand('bottle', x + 0.75, BAR_TOP, BAR_Z + 0.55, 0, 0.42));
  }
  if (r.bell >= 1) out.push(stand('bell', 8.6, BAR_TOP, BAR_Z + 0.2, Math.PI, 0.32));
  // the dining room: tables in the corners, plants, a carpet, paintings
  for (const [x, z] of [[-10.6, 5.6], [10.6, 5.6]]) {
    out.push(P('table', x, 0, z));
    out.push(P('chair', x - 1.7, 0, z, Math.PI / 2), P('chair', x + 1.7, 0, z, -Math.PI / 2));
  }
  out.push(P('carpet', 0, 0.02, 5.2, Math.PI / 2, 1.3));
  out.push(stand('plant2', -12.6, 0, -1.2), stand('plant2', 12.6, 0, -1.2));
  out.push(stand('bamboo', 12.7, 0, 2.2, 0, 0.9));
  out.push(stand('plant1', -12.6, 0, 1.8));
  out.push(P('sign', 0, 6.4, BACK_Z - 0.9, 0, 0.85));
  // decor upgrades: lanterns over the bar, a sakura tree, more lanterns
  const lanterns = r.decor >= 3 ? [-9, -4.5, 0, 4.5, 9] : r.decor >= 1 ? [-6, 0, 6] : [-3, 3];
  for (const x of lanterns) out.push(P('lantern', x, 6.2, BAR_Z - 0.3, 0, 0.7));
  if (r.decor >= 2) out.push(stand('sakura-tree', 11.4, 0, 1.6, -0.6, 0.85));
  else out.push(stand('sakura-flower', 10.8, BAR_TOP, BAR_Z, 0, 1.2));
  if (r.decor >= 3) out.push(stand('sakura-tree', -11.2, 0, 1.0, 0.5, 0.75));
  out.push(stand('deco-fish', -11.4, 3.6, -3.9, Math.PI / 2, 0.8));
  return out;
}
