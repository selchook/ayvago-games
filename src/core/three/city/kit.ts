// City generator: the modular building assembler. A kit building (Building.kit) is a box snapped
// to the Quaternius Downtown City MegaKit's grid (2 m bays, 3 m floors); kitLayout() lays its
// pieces out: storefronts, doors and plain bases on the ground floor, windows above in the
// building's rhythm, corner columns, a band over the shops, a cornice round the top, roof tiles
// and a few AC units. Sides facing a street get the full facade; the others are plainer (fewer
// windows, no shops), which keeps the triangle count down.
//
// Pure data: the layout is a list of piece indices and transforms (positions in the world's x and
// z, heights from the building's ground floor), the same in Node and in the browser. CityView
// draws it with one InstancedMesh per piece (kitview.ts); the plan's doors come from the same
// rules (kitDoors), so a game's door points match the drawn doors.
import { type P, obbCorners } from './geom';
import { hash01 } from './rng';
import type { Building, KitSpec, Door } from './types';

/** The pieces in tools/import-megakit.mjs (root node names of kit.glb); the index is the id. */
export const KIT_PIECES = [
  'brick-plain', 'brick-plain-1', 'brick-base', 'brick-top', 'brick-band', 'brick-window', 'brick-window-trim', 'brick-window-arch',
  'brick-window-double', 'brick-corner', 'brick-corner-base', 'brick-corner-top', 'brick-corner-cap', 'trim-plain', 'trim-window',
  'trim-ground', 'trim-shop', 'trim-band', 'trim-column', 'trim-column-base', 'metal-ground', 'metal-shop', 'metal-window',
  'metal-plain', 'metal-column', 'door-metal', 'door-wood', 'door-arch', 'cornice-brick', 'cornice-brick-corner', 'cornice-trim',
  'cornice-trim-corner', 'cornice-metal', 'cornice-metal-corner', 'roof', 'roof-2', 'steps', 'ac', 'bollard', 'planter', 'drain', 'manhole',
] as const;
export type KitPiece = (typeof KIT_PIECES)[number];
const ID = Object.fromEntries(KIT_PIECES.map((k, i) => [k, i])) as Record<KitPiece, number>;
export const kitId = (p: KitPiece): number => ID[p];

/** Floor height and bay width of the kit. */
export const KIT_FLOOR = 3;
export const KIT_BAY = 2;
/** Height of the cornice over the top floor. */
export const KIT_CORNICE = 1;

/** Pieces whose glass lights up at night (windows, shopfronts, doors). */
export const KIT_GLASS = new Set<number>([
  'brick-window', 'brick-window-trim', 'brick-window-arch', 'brick-window-double', 'trim-window', 'trim-shop', 'metal-shop', 'metal-window',
  'door-metal', 'door-wood', 'door-arch',
].map((k) => ID[k as KitPiece]));

/** A laid-out building: per instance a piece index and x, y, z, yaw, sx, sy, sz. */
export interface KitLayout { n: number; piece: Uint8Array; m: Float32Array }

interface Side { a: P; d: P; n: P; yaw: number; bays: number; street: boolean }

/** The four sides of a footprint, each seen from outside: left end a, along d, facing n. */
function sides(b: Building): Side[] {
  const fp = b.parts[0].obb;
  const c = obbCorners(fp);
  const out: Side[] = [];
  for (let i = 0; i < 4; i++) {
    const a = c[(i + 1) % 4], e = c[i];
    const L = Math.hypot(e.x - a.x, e.z - a.z);
    const d = { x: (e.x - a.x) / L, z: (e.z - a.z) / L };
    const n = { x: -d.z, z: d.x };
    out.push({ a, d, n, yaw: Math.atan2(n.x, n.z), bays: Math.max(1, Math.round(L / KIT_BAY)), street: i === 0 || !!(b.kit!.street & (1 << i)) });
  }
  return out;
}

/** The point at bay k of a side (its middle), pushed out by `out` metres. */
const bayAt = (s: Side, k: number, out = 0, w = 1): P => ({ x: s.a.x + s.d.x * KIT_BAY * (k + w / 2) + s.n.x * out, z: s.a.z + s.d.z * KIT_BAY * (k + w / 2) + s.n.z * out });

/** Door piece for a building: glass doors for shops, wood for homes, an arch for stone. */
function doorPiece(k: KitSpec, shop: boolean): KitPiece {
  if (k.wall === 'stone') return 'door-arch';
  return shop || k.wall === 'metal' ? 'door-metal' : 'door-wood';
}

/** The doors a kit building has (front doors on the street, one at the back). */
export function kitDoors(b: Building): Door[] {
  const k = b.kit!;
  const s = sides(b);
  const out: Door[] = [];
  for (const bay of k.doors) {
    const q = bayAt(s[0], bay, 0.35);
    out.push({ x: q.x, y: b.y, z: q.z, h: s[0].yaw, kind: k.ground === 'plain' ? 'main' : 'shop' });
  }
  const back = bayAt(s[2], Math.floor(s[2].bays / 2), 0.35);
  out.push({ x: back.x, y: b.y, z: back.z, h: s[2].yaw, kind: 'back' });
  return out;
}

const cache = new WeakMap<Building, KitLayout>();

export function kitLayout(b: Building): KitLayout {
  let lay = cache.get(b);
  if (lay) return lay;
  const k = b.kit!;
  const piece: number[] = [], m: number[] = [];
  const put = (p: KitPiece, x: number, y: number, z: number, yaw: number, sx = 1, sy = 1, sz = 1) => { piece.push(ID[p]); m.push(x, y, z, yaw, sx, sy, sz); };
  const S = sides(b);
  const F = b.floors;
  const top = F * KIT_FLOOR;
  const wall = k.wall;
  const plain: KitPiece = wall === 'stone' ? 'trim-plain' : wall === 'metal' ? 'metal-plain' : 'brick-plain';
  const base: KitPiece = wall === 'stone' ? 'trim-ground' : wall === 'metal' ? 'metal-ground' : 'brick-base';
  const topPlain: KitPiece = wall === 'stone' || wall === 'metal' ? plain : 'brick-top';
  const shopPiece: KitPiece = k.ground === 'stoneshop' ? 'trim-shop' : 'metal-shop';
  const win: KitPiece = ({ square: 'brick-window', trim: 'brick-window-trim', arch: 'brick-window-arch', double: 'brick-window-double', stone: 'trim-window', metal: 'metal-window' } as const)[k.window];
  const wide = k.window === 'arch' || k.window === 'double';
  const cornice: KitPiece = `cornice-${k.top}` as KitPiece;
  const h = hash01(Math.floor(b.seed * 1e6), b.id);
  S.forEach((s, i) => {
    const full = s.street;
    for (let f = 0; f < F; f++) {
      const y = f * KIT_FLOOR;
      // which bays of this floor are windows
      for (let bay = 0; bay < s.bays;) {
        const q = bayAt(s, bay);
        if (f === 0) {
          let p: KitPiece = base;
          if (i === 0 && k.doors.includes(bay)) p = doorPiece(k, k.ground !== 'plain');
          else if (full && k.ground !== 'plain' && bay > 0 && bay < s.bays - 1) p = shopPiece;
          else if (full && k.ground === 'plain' && (bay % 2 === 1)) p = wide ? 'brick-window' : win;
          else if (!full && i === 2 && bay === Math.floor(s.bays / 2)) p = doorPiece(k, false);
          put(p, q.x, y, q.z, s.yaw);
          bay++;
          continue;
        }
        // street sides in the building's rhythm; the others get a plain window every fourth bay
        const rhythm = full ? k.rhythm : 3;
        const isWin = rhythm === 0 ? true : rhythm === 1 ? bay % 2 === 1 : rhythm === 2 ? bay % 3 !== 2 : bay % 4 === 2;
        if (isWin && wide && bay + 1 < s.bays && full) {
          const q2 = bayAt(s, bay, 0, 2);
          put(win, q2.x, y, q2.z, s.yaw);
          bay += 2;
          continue;
        }
        const cheap: KitPiece = wall === 'metal' ? 'metal-window' : 'brick-window';
        put(isWin ? (wide || !full ? cheap : win) : f === F - 1 ? topPlain : plain, q.x, y, q.z, s.yaw);
        bay++;
      }
    }
    // a band over the ground floor on the street sides
    if (k.band && full && F > 1) for (let bay = 0; bay < s.bays; bay++) { const q = bayAt(s, bay); put('trim-band', q.x, KIT_FLOOR - 0.32, q.z, s.yaw); }
    // the cornice round the top (corner pieces at the sides' right ends); the moulded stone
    // cornice only where a street sees it
    const ck: KitPiece = full || k.top !== 'trim' ? cornice : 'cornice-brick';
    const top2 = full || k.top !== 'trim' ? k.top : 'brick';
    for (let bay = 0; bay < s.bays; bay++) {
      const q = bayAt(s, bay);
      const corner = bay === s.bays - 1 && top2 !== 'trim';
      put(corner ? (`cornice-${top2}-corner` as KitPiece) : ck, q.x, top, q.z, s.yaw);
    }
    // corner columns at the right end of each side
    if (k.corners) {
      const e = { x: s.a.x + s.d.x * s.bays * KIT_BAY, z: s.a.z + s.d.z * s.bays * KIT_BAY };
      for (let f = 0; f < F; f++) {
        if (wall === 'stone') put(f === 0 ? 'trim-column-base' : 'trim-column', e.x, f * KIT_FLOOR, e.z, s.yaw);
        else if (wall === 'metal') put('metal-column', e.x, f * KIT_FLOOR, e.z, s.yaw);
        else put(f === 0 ? 'brick-corner-base' : f === F - 1 ? 'brick-corner-top' : 'brick-corner', e.x, f * KIT_FLOOR, e.z, s.yaw);
      }
    }
  });
  // roof tiles, stretched a little to cover the footprint exactly
  const fp = b.parts[0].obb;
  const nu = Math.max(1, Math.round((fp.hw * 2) / 4)), nv = Math.max(1, Math.round((fp.hd * 2) / 4));
  const su = (fp.hw * 2) / (nu * 4), sv = (fp.hd * 2) / (nv * 4);
  // local x along the footprint's u, local z along v
  const yaw = Math.atan2(-fp.uz, fp.ux);
  for (let a = 0; a < nu; a++) for (let c = 0; c < nv; c++) {
    const lu = -fp.hw + (a + 0.5) * 4 * su, lv = -fp.hd + (c + 0.5) * 4 * sv;
    put('roof', fp.x + fp.ux * lu - fp.uz * lv, top + 0.25, fp.z + fp.uz * lu + fp.ux * lv, yaw, su, 1, sv);
  }
  // AC units on the roof
  const acs = 1 + Math.floor(h * 3);
  for (let j = 0; j < acs; j++) {
    const r1 = hash01(b.id, j, 5), r2 = hash01(b.id, j, 9);
    const lu = (r1 * 2 - 1) * (fp.hw - 1.5), lv = (r2 * 2 - 1) * (fp.hd - 1.5);
    put('ac', fp.x + fp.ux * lu - fp.uz * lv, top + 0.05, fp.z + fp.uz * lu + fp.ux * lv, yaw + (j % 2) * Math.PI / 2);
  }
  lay = { n: piece.length, piece: Uint8Array.from(piece), m: Float32Array.from(m) };
  cache.set(b, lay);
  return lay;
}
