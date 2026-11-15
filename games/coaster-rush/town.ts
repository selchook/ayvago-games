// Coaster Rush: the festive town around the ride, from the Fantasy Town Kit. Houses come from the
// course (the simulation knows them: near-misses); everything else is dressing placed here from
// the area's seed: windmills on the hill, watermills on the river, market stalls with their
// awnings and stools, fountains, lanterns, banners, carts, hedges, fences, trees and rocks, and
// the Coaster Kit's park bits round the stations (food and drink stalls, benches, flowers). Static
// parts are merged into one mesh per 24-unit block; windmill sails and water wheels turn.
import { THREE, model } from '@core/three';
import { Batch, ftKey, ckKey } from './kit';
import { STYLES, Rng, type AreaDef } from './defs';
import { STATION_Y, STEP, type AreaBuilt, type House, type Section, type Station } from './track';

const QUARTER = Math.PI / 2;
const BLOCK = 24;

export interface Spinner { obj: THREE.Object3D; axis: 'x' | 'z'; speed: number }

export interface Water { x0: number; z0: number; x1: number; z1: number; round?: boolean }

export interface TownBuilt {
  /** Merge batches per 24-unit block: Fantasy Town Kit and Coaster Kit parts. */
  blocks: Map<string, { ft: Batch; ck: Batch }>;
  /** Moving landmarks (windmill sails, water wheels) as their own objects. */
  objects: THREE.Object3D[];
  spinners: Spinner[];
  water: Water[];
  /** Station dressing and queue spots per station (world positions and facing). */
  queues: Map<Section, { x: number; y: number; z: number; yaw: number }[]>;
}

/** Points of the track's footprint (every half unit) for keeping props clear of it. */
function footprint(area: AreaBuilt): Float32Array {
  const out: number[] = [];
  for (const sec of area.sections) {
    const g = sec.seg;
    for (let i = 0; i < g.n; i += 5) out.push(g.p[i * 3], g.p[i * 3 + 1], g.p[i * 3 + 2]);
  }
  return new Float32Array(out);
}

class Grid {
  private cells = new Map<string, number[]>();
  constructor(pts: Float32Array, private size = 4) {
    for (let i = 0; i < pts.length; i += 3) {
      const k = `${Math.floor(pts[i] / size)},${Math.floor(pts[i + 2] / size)}`;
      let l = this.cells.get(k);
      if (!l) this.cells.set(k, (l = []));
      l.push(pts[i], pts[i + 1], pts[i + 2]);
    }
  }
  /** Distance (sideways) to the nearest track point lower than `top` + `room` within `r`. */
  near(x: number, z: number, r: number, top = Infinity, room = 1.4): boolean {
    const cx = Math.floor(x / this.size), cz = Math.floor(z / this.size);
    const span = Math.ceil(r / this.size);
    for (let dx = -span; dx <= span; dx++) for (let dz = -span; dz <= span; dz++) {
      const l = this.cells.get(`${cx + dx},${cz + dz}`);
      if (!l) continue;
      for (let i = 0; i < l.length; i += 3) if (l[i + 1] < top + room && Math.hypot(l[i] - x, l[i + 2] - z) < r) return true;
    }
    return false;
  }
}

/** Builds an area's town. `batches(x, z)` gives the merge batch of the block at a point. */
export function buildTown(area: AreaBuilt, def: AreaDef): TownBuilt {
  const rng = new Rng(area.seed ^ 0x2545f491);
  const blocks = new Map<string, { ft: Batch; ck: Batch }>();
  const at = (x: number, z: number) => {
    const k = `${Math.floor(x / BLOCK)},${Math.floor(z / BLOCK)}`;
    let b = blocks.get(k);
    if (!b) blocks.set(k, (b = { ft: new Batch(), ck: new Batch() }));
    return b;
  };
  const fp = footprint(area);
  const grid = new Grid(fp);
  const spinners: Spinner[] = [];
  const objects: THREE.Object3D[] = [];
  const water: Water[] = [];
  const queues = new Map<Section, { x: number; y: number; z: number; yaw: number }[]>();
  const taken: { x: number; z: number; r: number }[] = area.houses.map((h) => ({ x: h.x, z: h.z, r: Math.max(h.w, h.d) * 0.75 }));
  const free = (x: number, z: number, r: number, top = 3): boolean => {
    if (grid.near(x, z, r + 1.0, top, STYLES[def.style].hang ? 2.2 : 1.3)) return false;
    for (const t of taken) if (Math.hypot(t.x - x, t.z - z) < t.r + r + 0.3) return false;
    return true;
  };
  const tintWall = new THREE.Color(def.pal.wall);

  // ---------------------------------------------------------------- houses
  for (const h of area.houses) house(at(h.x, h.z).ft, h, rng, tintWall);

  // ---------------------------------------------------------------- the area's landmarks
  const bounds = { x0: Infinity, x1: -Infinity, z0: Infinity, z1: -Infinity };
  for (let i = 0; i < fp.length; i += 3) {
    bounds.x0 = Math.min(bounds.x0, fp[i]); bounds.x1 = Math.max(bounds.x1, fp[i]);
    bounds.z0 = Math.min(bounds.z0, fp[i + 2]); bounds.z1 = Math.max(bounds.z1, fp[i + 2]);
  }
  const tryPlace = (r: number, top: number, n: number, fn: (x: number, z: number) => void, near = 12) => {
    let placed = 0;
    for (let k = 0; k < n * 30 && placed < n; k++) {
      // somewhere beside the track: a random track point pushed out sideways
      const i = Math.floor(rng.next() * (fp.length / 3)) * 3;
      const a = rng.next() * Math.PI * 2, d = r + 2 + rng.next() * near;
      const x = fp[i] + Math.cos(a) * d, z = fp[i + 2] + Math.sin(a) * d;
      if (!free(x, z, r, top)) continue;
      taken.push({ x, z, r });
      fn(x, z);
      placed++;
    }
  };

  if (def.id === 'windmill' || def.id === 'square') {
    tryPlace(1.6, 5.5, def.id === 'windmill' ? 4 : 1, (x, z) => windmill(at(x, z).ft, x, z, rng, spinners, objects), 10);
  }
  if (def.id === 'river') {
    // the river runs across the area; water wheels turn on its banks
    const zc = (bounds.z0 + bounds.z1) / 2 + rng.range(-8, 8);
    water.push({ x0: bounds.x0 - 160, x1: bounds.x1 + 160, z0: zc - 5, z1: zc + 5 });
    const zc2 = bounds.z0 + rng.range(6, 14);
    water.push({ x0: bounds.x0 - 160, x1: bounds.x1 + 160, z0: zc2 - 3.5, z1: zc2 + 3.5 });
    for (const [zw, half] of [[zc, 5], [zc2, 3.5]] as [number, number][]) {
      for (let k = 0; k < 6; k++) {
        const x = bounds.x0 - 10 + rng.next() * (bounds.x1 - bounds.x0 + 20);
        const side = rng.chance(0.5) ? 1 : -1;
        const z = zw + side * (half + 0.9);
        if (!free(x, z, 1.4, 4)) continue;
        taken.push({ x, z, r: 1.4 });
        watermill(at(x, z).ft, x, z, side, rng, spinners, objects);
      }
    }
  }
  if (def.id === 'splash') {
    // pools under the flume's drops
    for (const sec of area.sections) for (const f of sec.features) {
      if (f.kind !== 'drop') continue;
      const g = sec.seg, i = Math.min(g.n - 1, Math.round((f.s1 - g.s0) / STEP));
      const x = g.p[i * 3], z = g.p[i * 3 + 2];
      water.push({ x0: x - 4.5, x1: x + 4.5, z0: z - 4.5, z1: z + 4.5, round: true });
    }
    const zc = (bounds.z0 + bounds.z1) / 2;
    water.push({ x0: bounds.x1 + 6, x1: bounds.x1 + 40, z0: zc - 16, z1: zc + 16, round: true });
  }
  if (def.id === 'market' || def.id === 'square') {
    tryPlace(1.2, 2, def.id === 'market' ? 14 : 5, (x, z) => stall(at(x, z).ft, x, z, rng), 6);
    tryPlace(2.2, 1.5, def.id === 'square' ? 3 : 1, (x, z) => fountain(at(x, z).ft, x, z), 8);
  }
  // lanterns, banners on poles, carts, hedges, fences
  tryPlace(0.4, 2, 10, (x, z) => at(x, z).ft.add(ftKey('lantern'), x, 0, z, rng.next() * 6), 5);
  tryPlace(0.9, 1.2, def.id === 'market' ? 8 : 4, (x, z) => at(x, z).ft.add(ftKey(rng.chance(0.5) ? 'cart' : 'cart-high'), x, 0, z, rng.next() * 6), 6);
  tryPlace(0.6, 2.2, 8, (x, z) => {
    const b = at(x, z).ft, yaw = rng.int(0, 3) * QUARTER;
    b.add(ftKey('pillar-wood'), x, 0, z, 0, 1, 2.2, 1);
    b.add(ftKey(rng.chance(0.5) ? 'banner-red' : 'banner-green'), x - Math.cos(yaw) * 0.42, 1.2, z + Math.sin(yaw) * 0.42, yaw + Math.PI);
  }, 5);
  tryPlace(1.0, 1, 10, (x, z) => {
    const b = at(x, z).ft, yaw = rng.int(0, 3) * QUARTER;
    for (let k = -1; k <= 1; k++) b.add(ftKey(rng.chance(0.3) ? 'hedge-large' : 'hedge'), x + Math.sin(yaw) * k, 0, z + Math.cos(yaw) * k, yaw);
  }, 10);
  // trees and rocks all round
  const trees = ['tree', 'tree-high', 'tree-crooked', 'tree-high-round'];
  tryPlace(0.7, 3.2, def.id === 'rooftops' ? 18 : 40, (x, z) => at(x, z).ft.add(ftKey(rng.pick(trees)), x, 0, z, rng.next() * 6, 0.9 + rng.next() * 0.5), 22);
  tryPlace(0.9, 1.3, 12, (x, z) => at(x, z).ft.add(ftKey(rng.pick(['rock-large', 'rock-wide', 'rock-small'])), x, 0, z, rng.next() * 6, 0.7 + rng.next() * 0.6), 26);
  tryPlace(0.6, 0.5, 14, (x, z) => at(x, z).ck.add(ckKey('flowers'), x, 0, z, rng.next() * 6, 1.4), 10);

  // ---------------------------------------------------------------- stations
  for (const sec of area.sections) {
    if (sec.station) queues.set(sec, station(at, sec, sec.station, def, rng));
    if (sec.start) station(at, sec, sec.start, def, rng, true);
  }

  return { blocks, objects, spinners, water, queues };
}

/** A house: stone ground floor, timber floors above, a roof on every cell. */
function house(b: Batch, h: House, rng: Rng, tint: THREE.Color): void {
  const r = new Rng(h.seed);
  const yaw = h.rot * QUARTER;
  const cos = Math.cos(yaw), sin = Math.sin(yaw);
  // cell centres in the house's own axes (x across w, z across d), centred on (h.x, h.z)
  const cell = (i: number, j: number): [number, number] => {
    const lx = i - (h.w - 1) / 2, lz = j - (h.d - 1) / 2;
    return [h.x + lx * cos + lz * sin, h.z - lx * sin + lz * cos];
  };
  const c = new THREE.Color().copy(tint).multiplyScalar(0.92 + r.next() * 0.1);
  const stone = ['wall', 'wall-window-shutters', 'wall-window-small', 'wall-window-glass', 'wall-window-round'];
  const timber = ['wall-wood', 'wall-wood-window-shutters', 'wall-wood-window-small', 'wall-wood-detail-cross', 'wall-wood-window-glass', 'wall-wood-detail-diagonal'];
  const woodAll = h.wood;
  for (let fl = 0; fl < h.floors; fl++) {
    const set = fl === 0 && !woodAll ? stone : timber;
    for (let i = 0; i < h.w; i++) for (let j = 0; j < h.d; j++) {
      const [x, z] = cell(i, j);
      // the wall piece sits on its cell's +x edge: turn it to each outer side
      const sides: [boolean, number][] = [[i === h.w - 1, 0], [i === 0, Math.PI], [j === h.d - 1, -QUARTER], [j === 0, QUARTER]];
      for (const [outer, a] of sides) {
        if (!outer) continue;
        // windows on the front (towards the track) and now and then on the sides; the back is plain
        const front = a === -QUARTER, back = a === QUARTER;
        let name = back ? set[0] : front || r.chance(0.35) ? r.pick(set) : set[0];
        // the front door on the ground floor, facing the track (+z side of the house's frame)
        if (fl === 0 && a === -QUARTER && i === Math.floor(h.w / 2)) name = woodAll ? 'wall-wood-door' : 'wall-door';
        b.add(ftKey(name), x, fl, z, yaw + a, 1, 1, 1, c);
      }
    }
  }
  // roofs: a tall point on towers, gables along the row on longer houses
  const top = h.floors;
  const red = r.chance(0.55);
  for (let i = 0; i < h.w; i++) for (let j = 0; j < h.d; j++) {
    const [x, z] = cell(i, j);
    if (h.w === 1 && h.d === 1) b.add(ftKey(red ? 'roof-high-point' : 'roof-point'), x, top, z, yaw, 1, 1, 1, c);
    else b.add(ftKey(red ? 'roof-high-gable' : 'roof-gable'), x, top, z, yaw + (h.w >= h.d ? 0 : QUARTER), 1, 1, 1, c);
  }
  if (r.chance(0.5)) { const [x, z] = cell(0, 0); b.add(ftKey('chimney'), x, top, z, yaw, 1, 1, 1, c); }
  void rng;
}

function windmill(b: Batch, x: number, z: number, rng: Rng, spinners: Spinner[], objects: THREE.Object3D[]): void {
  const yaw = rng.int(0, 3) * QUARTER;
  const floors = 3;
  for (let fl = 0; fl < floors; fl++) {
    for (const a of [0, Math.PI, QUARTER, -QUARTER]) b.add(ftKey(fl === 0 ? (a === 0 ? 'wall-door' : 'wall') : fl === 1 ? 'wall-wood-window-small' : 'wall-wood'), x, fl, z, yaw + a, 1.5, 1, 1.5);
  }
  b.add(ftKey('roof-high-point'), x, floors, z, yaw, 1.5, 1.4, 1.5);
  // the sails, turning on the front wall
  const sails = model(ftKey('windmill'), { shadows: true });
  const hub = new THREE.Group();
  hub.add(sails);
  const fx = Math.cos(yaw), fz = -Math.sin(yaw);
  hub.position.set(x + fx * 0.95, floors - 0.35, z + fz * 0.95);
  hub.rotation.y = yaw;
  spinners.push({ obj: sails, axis: 'x', speed: 0.9 + rng.next() * 0.5 });
  objects.push(hub);
}

function watermill(b: Batch, x: number, z: number, side: number, rng: Rng, spinners: Spinner[], objects: THREE.Object3D[]): void {
  // the house stands on the bank, the wheel dips into the water on its river side
  const yaw = side > 0 ? QUARTER : -QUARTER;
  for (let fl = 0; fl < 2; fl++) for (const a of [0, Math.PI, QUARTER, -QUARTER]) b.add(ftKey(fl === 0 ? 'wall' : 'wall-wood-window-shutters'), x, fl, z + side * 0.6, yaw + a, 1.6, 1, 1.4);
  b.add(ftKey('roof-high-gable'), x, 2, z + side * 0.6, yaw, 1.6, 1, 1.4);
  const wheel = model(ftKey('watermill'), { shadows: true });
  const hub = new THREE.Group();
  hub.add(wheel);
  hub.position.set(x, 0.75, z - side * 0.45);
  hub.rotation.y = QUARTER;
  spinners.push({ obj: wheel, axis: 'x', speed: -side * (0.7 + rng.next() * 0.3) });
  objects.push(hub);
}

function stall(b: Batch, x: number, z: number, rng: Rng): void {
  const yaw = rng.int(0, 3) * QUARTER;
  b.add(ftKey(rng.chance(0.5) ? 'stall-red' : 'stall-green'), x, 0, z, yaw);
  const ox = Math.cos(yaw + QUARTER) * 0.8, oz = -Math.sin(yaw + QUARTER) * 0.8;
  b.add(ftKey('stall-stool'), x + ox, 0, z + oz, yaw);
  if (rng.chance(0.5)) b.add(ftKey('stall-bench'), x - ox, 0, z - oz, yaw);
}

function fountain(b: Batch, x: number, z: number): void {
  b.add(ftKey('fountain-round-detail'), x, 0, z, 0, 1.3);
  for (let k = 0; k < 4; k++) {
    const a = k * QUARTER + Math.PI / 4;
    b.add(ftKey('lantern'), x + Math.cos(a) * 2.2, 0, z + Math.sin(a) * 2.2, 0);
  }
}

/**
 * A station: the Coaster Kit's platform pieces (a deck either side of the track, one unit long)
 * along the station's straights, gates by the cars where the train stops and railings elsewhere,
 * columns under the decks, stairs down to a little plaza with a stall, a bench and a tree.
 * Returns the queue's spots on the platform side the riders board from.
 */
function station(at: (x: number, z: number) => { ft: Batch; ck: Batch }, sec: Section, st: Station, def: AreaDef, rng: Rng, gate = false): { x: number; y: number; z: number; yaw: number }[] {
  const g = sec.seg;
  const side = st.side;
  const hang = !!STYLES[def.style].hang;
  const deckY = hang ? 0.25 : STATION_Y;
  const spots: { x: number; y: number; z: number; yaw: number }[] = [];
  const iA = Math.max(0, Math.round((st.s0 - g.s0) / STEP)), iB = Math.min(g.n - 1, Math.round((st.s1 - g.s0) / STEP));
  const iStop = Math.round((st.stop - g.s0) / STEP);
  const tx = g.t[iA * 3], tz = g.t[iA * 3 + 2];
  const yaw = Math.atan2(tx, tz);
  // left of the track = up × forward = (tz, 0, −tx)
  const lx = tz * side, lz = -tx * side;
  for (let i = iA + 5; i <= iB - 4; i += 10) {
    const x = g.p[i * 3], z = g.p[i * 3 + 2];
    const b = at(x, z).ck;
    b.add(ckKey('station'), x, deckY, z, yaw);
    // gates where the cars stand when the train stops, railings elsewhere
    const atCars = i <= iStop + 5 && i >= iStop - 60;
    b.add(ckKey(atCars ? 'station-gate' : 'station-fence'), x, deckY, z, yaw);
    if (deckY > 0.5) for (const k of [-1, 1]) b.add(ckKey('support-small'), x + tz * 0.6 * k, 0, z - tx * 0.6 * k, 0, 1, deckY, 1);
    if (atCars) spots.push({ x: x + lx * 0.66, y: deckY + 0.3, z: z + lz * 0.66, yaw: Math.atan2(-lx, -lz) });
  }
  // stairs down to the street, stalls and benches on the plaza
  const mid = Math.round((iA + iB) / 2);
  const px = g.p[mid * 3] + lx * 3.4, pz = g.p[mid * 3 + 2] + lz * 3.4;
  const b = at(px, pz);
  if (deckY > 0.5) b.ft.add(ftKey('stairs-wood'), g.p[mid * 3] + lx * 1.4, 0, g.p[mid * 3 + 2] + lz * 1.4, Math.atan2(lx, lz) + QUARTER, 1, deckY + 0.3, 1.1);
  for (let k = -2; k <= 2; k++) for (let j = 0; j < 2; j++) b.ft.add(ftKey('road'), px + tx * k + lx * j, 0.005, pz + tz * k + lz * j, yaw, 1, 1, 1);
  b.ck.add(ckKey(rng.pick(['stall-food', 'stall-drinks', 'stall-information'])), px + lx * 1.8 + tx * 2.5, 0, pz + lz * 1.8 + tz * 2.5, Math.atan2(-lx, -lz));
  b.ck.add(ckKey('bench'), px + tx * -2.4, 0, pz + tz * -2.4, Math.atan2(-lx, -lz));
  b.ck.add(ckKey('trash'), px + tx * -3.4 + lx * 0.4, 0, pz + tz * -3.4 + lz * 0.4, 0);
  b.ck.add(ckKey('tree'), px + lx * 2.6 - tx * 4, 0, pz + lz * 2.6 - tz * 4, rng.next() * 6);
  // the ride's sign by the stairs, and the park's gate at the very first station
  b.ck.add(ckKey('ride-entrance'), px - lx * 0.9 + tx * 1.4, 0, pz - lz * 0.9 + tz * 1.4, Math.atan2(lx, lz));
  if (gate) b.ck.add(ckKey('park-entrance'), px + lx * 4.5, 0, pz + lz * 4.5, Math.atan2(lx, lz), 1.2);
  return spots;
}
