// Crypt Crawler: how the dungeon looks. Every room is merged into one static mesh per kit
// (floor tiles, walls, doorways, obstacles, decor), so a floor costs two draw calls per room and
// three.js culls the rooms out of view. Everything that moves or changes is instanced: doors,
// spikes, saws, pots, chests, pickups, projectiles, flames and the enemies (FigureRig).
import Phaser from 'phaser';
import { THREE } from '@core/three';
import {
  Batch, Instances, FigureRig, kitGeo, centered, nodeGeo, md, gy, pk, mdMat, gyMat, vcMat, softMat, shadeMat, fistOf,
  boneGeo, slimeGeo, discGeo, ringGeo, stripGeo, plain,
} from './kit';
import {
  T_FLOOR, T_WALL, T_DOOR, T_OBST, T_STAIRS, ENEMIES,
  type Sim, type Floor, type Enemy, type EnemyKind, type Room,
} from './sim';
import { FIG } from './hero';

const _m = new THREE.Matrix4();
const _m2 = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _v = new THREE.Vector3();
const _s = new THREE.Vector3();
const _c = new THREE.Color();
const _e = new THREE.Euler();
const UP = new THREE.Vector3(0, 1, 0);

/** Palette of a floor: floors 1–3 the kit's colours, 4–6 its "variation-a", then again. */
export const paletteOf = (floor: number): number => Math.floor((floor - 1) / 3) % 2;

/** Background and fog colour per palette. */
export const SKY = [0x141019, 0x0e1420];

interface Look {
  rig: 'skeleton' | 'zombie' | 'ghost' | 'vampire' | 'orc' | 'slime';
  scale: number;
  tint: [number, number, number];
  weapon?: 'sword' | 'spear';
  weaponScale?: number;
}

export const LOOKS: Record<EnemyKind, Look> = {
  slime: { rig: 'slime', scale: 1.15, tint: [1, 1, 1] },
  slimelet: { rig: 'slime', scale: 0.7, tint: [1.1, 1.2, 0.8] },
  skeleton: { rig: 'skeleton', scale: FIG, tint: [1, 1, 1], weapon: 'sword', weaponScale: 1 },
  spearman: { rig: 'skeleton', scale: FIG, tint: [0.75, 0.9, 1.25], weapon: 'spear', weaponScale: 1 },
  ghost: { rig: 'ghost', scale: FIG, tint: [0.9, 1, 1.2] },
  zombie: { rig: 'zombie', scale: FIG * 1.05, tint: [1, 1, 1] },
  orc: { rig: 'orc', scale: FIG * 1.12, tint: [1, 1, 1], weapon: 'sword', weaponScale: 1.35 },
  vampire: { rig: 'vampire', scale: FIG, tint: [1, 1, 1] },
  boneking: { rig: 'skeleton', scale: FIG * 2.35, tint: [1.25, 1.1, 0.7], weapon: 'sword', weaponScale: 1.2 },
  warlord: { rig: 'orc', scale: FIG * 2.2, tint: [1.15, 0.85, 0.75], weapon: 'spear', weaponScale: 1.3 },
  vamplord: { rig: 'vampire', scale: FIG * 2.15, tint: [1.15, 0.8, 1.25] },
};

const RIG_CLIPS = ['idle', 'walk', 'sprint', 'attack-melee-right', 'holding-right', 'die', 'emote-no', 'jump'];

interface Vis { clip: string; t: number; state: string; born: number; yaw: number; dieT: number }

/** One room's static meshes. */
interface RoomMesh { md: THREE.Mesh; gy: THREE.Mesh | null; decal: THREE.Mesh | null }

export class DungeonView {
  readonly group = new THREE.Group();
  private floorGroup = new THREE.Group();
  private rooms: RoomMesh[] = [];
  private paletteNo = 0;

  // instanced dynamic parts
  private doors: Instances;
  private spikes: Instances;
  private saws: Instances;
  private pots: Record<'urn' | 'urn2' | 'barrel', Instances>;
  private chestBody: Instances;
  private chestLid: Instances;
  private coins: Instances;
  private hearts: Instances;
  private keys: Instances;
  private gems: Instances;
  private flames: Instances;
  private glows: Instances;
  private shadows: Instances;
  private spears: Instances;
  private swords: Instances;
  private bones: Instances;
  private orbs: Instances;
  private waves: Instances;
  private stairsGlow: Instances;
  private hover: Instances;
  private rigs: Record<Exclude<Look['rig'], 'slime'>, FigureRig>;
  private slimes: Instances;
  private vis = new Map<number, Vis>();
  /** Brazier flame spots of the current floor (lights follow the nearest). */
  readonly flamesAt: THREE.Vector3[] = [];
  private sockets: Record<string, { idx: number; rest: Record<'sword' | 'spear', THREE.Matrix4> }> = {};
  private doorOpen: number[] = [];
  private chestLidAng = new Map<number, number>();
  /** Hovered object (mouse): highlighted ring. */
  hoverAt: { x: number; z: number; r: number; color: number } | null = null;

  constructor(private scene: Phaser.Scene, parent: THREE.Object3D, palette: number) {
    parent.add(this.group);
    this.group.add(this.floorGroup);
    this.paletteNo = palette;
    const mm = mdMat(scene, palette), gm = gyMat(), vm = vcMat();
    const g = this.group;
    this.doors = new Instances(g, nodeGeo(md('gate'), 'door'), mm, 24, { shadows: true, colors: true });
    this.spikes = new Instances(g, nodeGeo(md('trap'), 'spikes'), mm, 60, { colors: true });
    this.saws = new Instances(g, centered(pk('saw')), vm, 8, { shadows: true });
    this.pots = {
      urn: new Instances(g, kitGeo(gy('urn-round')), gm, 40, { shadows: true, colors: true }),
      urn2: new Instances(g, kitGeo(gy('urn-square')), gm, 40, { shadows: true, colors: true }),
      barrel: new Instances(g, kitGeo(md('barrel')), mm, 40, { shadows: true, colors: true }),
    };
    this.chestBody = new Instances(g, kitGeo(md('chest'), ['lid']), mm, 12, { shadows: true, colors: true });
    this.chestLid = new Instances(g, nodeGeo(md('chest'), 'lid'), mm, 12, { shadows: true, colors: true });
    this.coins = new Instances(g, kitGeo(md('coin')), mm, 160, { colors: true });
    this.hearts = new Instances(g, centered(pk('heart')), vm, 16);
    this.keys = new Instances(g, centered(pk('key')), vm, 4);
    this.gems = new Instances(g, centered(pk('jewel')), vm, 6, { colors: true });
    this.flames = new Instances(g, plain(new THREE.PlaneGeometry(1, 1)), softMat(), 80, { colors: true, order: 6 });
    this.glows = new Instances(g, plain(new THREE.PlaneGeometry(1, 1)), softMat(), 120, { colors: true, order: 6 });
    this.shadows = new Instances(g, discGeo(16), shadeMat(), 200, { order: 1 });
    this.spears = new Instances(g, kitGeo(md('weapon-spear')), mm, 40, { shadows: true, colors: true });
    this.swords = new Instances(g, kitGeo(md('weapon-sword')), mm, 40, { shadows: true, colors: true });
    this.bones = new Instances(g, boneGeo(), vm, 60, { shadows: false });
    this.orbs = new Instances(g, plain(new THREE.PlaneGeometry(1, 1)), softMat(), 80, { colors: true, order: 7 });
    this.waves = new Instances(g, ringGeo(0.82), softMat(), 6, { colors: true, order: 3 });
    this.stairsGlow = new Instances(g, ringGeo(0.7), softMat(), 2, { colors: true, order: 3 });
    this.hover = new Instances(g, ringGeo(0.8), softMat(), 2, { colors: true, order: 3 });
    this.rigs = {
      skeleton: new FigureRig(g, gy('character-skeleton'), RIG_CLIPS, 24, gm),
      zombie: new FigureRig(g, gy('character-zombie'), RIG_CLIPS, 16, gm),
      ghost: new FigureRig(g, gy('character-ghost'), RIG_CLIPS, 16, gm),
      vampire: new FigureRig(g, gy('character-vampire'), RIG_CLIPS, 10, gm),
      orc: new FigureRig(g, md('character-orc'), RIG_CLIPS, 10, mdMat(scene, 0)),
    };
    this.slimes = new Instances(g, slimeGeo(), vm, 40, { shadows: true, colors: true });
    // weapons in the right fist (rest space), blade forward
    for (const [name, rig] of Object.entries(this.rigs)) {
      const fist = fistOf(rig.boxes.get('arm-right'));
      const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.PI / 2, 0, 0));
      this.sockets[name] = {
        idx: rig.partIndex('arm-right'),
        rest: {
          sword: new THREE.Matrix4().compose(fist, q, new THREE.Vector3(1, 1, 1)),
          spear: new THREE.Matrix4().compose(fist.clone().add(new THREE.Vector3(0, 0, -0.15)), q, new THREE.Vector3(1, 1, 1)),
        },
      };
    }
  }

  /** Draw calls of the dynamic parts (for the test hook). */
  get drawCalls(): number {
    let n = 0;
    this.group.traverse((o) => { if ((o as THREE.InstancedMesh).isInstancedMesh && (o as THREE.InstancedMesh).count > 0) n++; });
    return n;
  }

  // ---------------------------------------------------------------- the floor

  /** Builds the floor's static meshes (frees the previous floor's). */
  build(f: Floor, palette: number): void {
    for (const r of this.rooms) {
      for (const m of [r.md, r.gy, r.decal]) if (m) { m.geometry.dispose(); this.floorGroup.remove(m); }
    }
    this.rooms = [];
    this.flamesAt.length = 0;
    this.doorOpen = f.doors.map(() => 1);
    this.chestLidAng.clear();
    this.vis.clear();
    if (palette !== this.paletteNo) {
      this.paletteNo = palette;
      const mm = mdMat(this.scene, palette);
      for (const inst of [this.doors, this.spikes, this.pots.barrel, this.chestBody, this.chestLid, this.coins, this.spears, this.swords]) inst.mesh.material = mm;
    }
    const mm = mdMat(this.scene, palette), gm = gyMat();
    const G = (n: Parameters<typeof md>[0]) => kitGeo(md(n));
    const GG = (n: Parameters<typeof gy>[0]) => kitGeo(gy(n));
    const open = (tx: number, tz: number) => {
      if (tx < 0 || tz < 0 || tx >= f.gw || tz >= f.gh) return false;
      const t = f.tiles[tz * f.gw + tx];
      return t === T_FLOOR || t === T_OBST || t === T_STAIRS;
    };
    const rnd = seededRand(f.n * 977 + f.rooms.length);
    const owner = (tx: number, tz: number): Room | null => {
      for (const r of f.rooms) if (tx >= r.x0 - 1 && tx <= r.x1 + 1 && tz >= r.z0 - 1 && tz <= r.z1 + 1) return r;
      return null;
    };
    const batches = f.rooms.map(() => ({ md: new Batch(), gy: new Batch(), decal: new Batch() }));
    const stripG = stripGeo();
    for (let tz = 0; tz < f.gh; tz++) for (let tx = 0; tx < f.gw; tx++) {
      const t = f.tiles[tz * f.gw + tx];
      if (t === 0) continue;
      const r = owner(tx, tz);
      if (!r) continue;
      const b = batches[r.id];
      const rot = Math.floor(rnd() * 4) * Math.PI / 2;
      if (t === T_FLOOR || t === T_OBST || t === T_DOOR) b.md.add(rnd() < 0.18 ? G('floor-detail') : G('floor'), tx, 0, tz, rot);
      if (t === T_WALL) {
        const n = open(tx, tz - 1), s = open(tx, tz + 1), w = open(tx - 1, tz), e = open(tx + 1, tz);
        const cnt = +n + +s + +w + +e;
        if (cnt === 0) {
          if (open(tx - 1, tz - 1) || open(tx + 1, tz - 1) || open(tx - 1, tz + 1) || open(tx + 1, tz + 1)) b.md.add(G('wall'), tx, 0, tz, 0, 1, 1.0);
          continue;
        }
        if (cnt === 1) {
          const ang = n ? Math.PI : s ? 0 : w ? -Math.PI / 2 : Math.PI / 2;
          // the camera looks north: walls on the south edge of a room stay low
          const low = n && !s;
          b.md.add(G('wall-half'), tx, 0, tz, ang, 1, low ? 0.45 : 1, 1);
          // a banner on some north walls
          if (s && rnd() < 0.22 && Math.abs(tx - r.cx) > 1.5) b.md.add(G('banner'), tx, 0, tz + 1, 0);
          continue;
        }
        // a wall between two rooms: facing the room below (the camera looks north) or a full
        // block between rooms side by side
        if (n && s) b.md.add(G('wall-half'), tx, 0, tz, 0, 1, 0.6, 1);
        else b.md.add(G('wall'), tx, 0, tz, 0);
      }
      if (t === T_DOOR) {
        const d = f.doorAt.get(tz * f.gw + tx)!;
        b.md.add(G('wall-opening'), tx, 0, tz, d.axis === 'x' ? Math.PI / 2 : 0, 1, d.axis === 'z' ? 0.75 : 1, 1);
      }
      if (t === T_STAIRS) {
        // a stairwell going down: the kit's stairs sunk into the floor, a dark pit round it
        b.md.add(G('stairs'), tx, -0.9, tz, Math.PI);
        b.decal.add(stripG, tx, 0.004, tz - 0.5, 0, 1.0, 1, 1.0);
      }
    }
    // obstacles and decor per room
    for (const r of f.rooms) {
      const b = batches[r.id];
      for (const o of r.obstacles) {
        switch (o.kind) {
          case 'column': b.md.add(G('column'), o.x, 0, o.z, o.yaw); break;
          case 'rocks': b.md.add(G('rocks'), o.x, 0, o.z, o.yaw, 0.9); break;
          case 'wood': b.md.add(G('wood-structure'), o.x, 0, o.z, o.yaw); b.md.add(G('barrel'), o.x, 0, o.z, o.yaw, 0.8); break;
          case 'brazier':
            b.md.add(G('column'), o.x, 0, o.z, 0, 0.9, 0.85, 0.9);
            b.gy.add(GG('fire-basket'), o.x, 0.93, o.z, 0, 1.6);
            this.flamesAt.push(new THREE.Vector3(o.x, 1.3, o.z));
            break;
          case 'pillar': b.gy.add(GG('pillar-large'), o.x, 0, o.z, o.yaw, 1.6, 1.15, 1.6); b.md.add(G('stones'), o.x, 0, o.z, o.yaw, 0.6); break;
          case 'coffin': b.gy.add(GG('coffin'), o.x, 0, o.z, o.yaw, 1.5); break;
          case 'grave': b.gy.add(GG('gravestone-cross'), o.x, 0, o.z, o.yaw + Math.PI, 1.1); b.gy.add(GG('debris'), o.x, 0, o.z + 0.2, o.yaw, 1.2); break;
        }
      }
      // loose decor on free tiles
      const deco = r.type === 'shrine' ? 2 : 3 + Math.floor(rnd() * 3);
      for (let k = 0; k < deco; k++) {
        const x = r.x0 + Math.floor(rnd() * 9), z = r.z0 + Math.floor(rnd() * 11);
        if (f.tiles[z * f.gw + x] !== T_FLOOR || x === Math.round(r.cx) || z === Math.round(r.cz)) continue;
        const roll = rnd();
        if (roll < 0.45) b.md.add(G('stones'), x + (rnd() - 0.5) * 0.4, 0, z + (rnd() - 0.5) * 0.4, rnd() * 6, 0.55);
        else if (roll < 0.7) b.gy.add(GG('debris'), x, 0, z, rnd() * 6, 1);
        else if (roll < 0.85) b.gy.add(GG('candle-multiple'), x + (rnd() - 0.5) * 0.5, 0, z + (rnd() - 0.5) * 0.5, rnd() * 6, 1.4);
        else b.gy.add(GG('candle'), x + (rnd() - 0.5) * 0.5, 0, z + (rnd() - 0.5) * 0.5, rnd() * 6, 1.6);
      }
      if (r.type === 'shrine') {
        b.gy.add(GG('altar-stone'), r.cx, 0, r.z0 + 3, 0, 1.6);
        for (const [dx, dz] of [[-1.3, 0.2], [1.3, 0.2], [-1.6, 1.8], [1.6, 1.8]]) b.gy.add(GG('lantern-candle'), r.cx + dx, 0, r.z0 + 3 + dz, 0, 1.4);
        b.gy.add(GG('candle-multiple'), r.cx - 0.35, 0.78, r.z0 + 3, 0, 1.2);
        b.gy.add(GG('candle-multiple'), r.cx + 0.35, 0.78, r.z0 + 3, 0, 1.2);
      }
      if (r.type === 'boss') {
        for (const [i, j] of [[1, 2], [7, 2], [1, 8], [7, 8]]) b.gy.add(GG('lantern-candle'), r.x0 + i, 0, r.z0 + j, 0, 1.6);
      }
      if (r.type === 'vault') {
        for (const [i, j] of [[1, 1], [7, 1], [1, 9], [7, 9]]) b.gy.add(GG('candle-multiple'), r.x0 + i, 0, r.z0 + j, 0, 1.5);
      }
    }
    // spike plates and saw slots
    for (const s of f.spikes) batches[s.room].md.add(kitGeo(md('trap'), ['spikes']), s.x, 0, s.z, 0, 1.4);
    for (const bl of f.blades) batches[bl.room].decal.add(stripG, bl.x - bl.amp - 0.3, 0.006, bl.z, Math.PI / 2, 0.16, 1, bl.amp * 2 + 0.6);
    stripG.dispose();
    for (const r of f.rooms) {
      const b = batches[r.id];
      const room: RoomMesh = { md: b.md.build(mm), gy: b.gy.empty ? null : b.gy.build(gm), decal: b.decal.empty ? null : b.decal.build(shadeMat(), false) };
      if (room.decal) { room.decal.receiveShadow = false; room.decal.renderOrder = 1; }
      for (const m of [room.md, room.gy, room.decal]) if (m) this.floorGroup.add(m);
      this.rooms.push(room);
    }
  }

  // ---------------------------------------------------------------- per frame

  update(dt: number, sim: Sim, time: number, camera: THREE.Camera): void {
    const f = sim.floor;
    const camQ = camera.quaternion;
    // doors slide down into the floor when open
    this.doors.begin();
    f.doors.forEach((d, i) => {
      const target = d.open ? 1 : 0;
      const cur = this.doorOpen[i] ?? 1;
      // slam fast, open with a little bounce
      this.doorOpen[i] = target === 0 ? Math.max(0, cur - dt * 9) : Math.min(1, cur + dt * 2.4);
      const k = this.doorOpen[i];
      const y = -0.78 * (target === 1 ? Phaser.Math.Easing.Back.In(k) : k);
      if (k >= 0.999) return;
      const col = d.keyLocked ? _c.setRGB(1.4, 1.15, 0.45) : !d.open ? _c.setRGB(1.15, 0.85, 0.8) : _c.setRGB(1, 1, 1);
      _m.compose(_v.set(d.x, y, d.z), _q.setFromAxisAngle(UP, d.axis === 'x' ? Math.PI / 2 : 0), _s.set(1.15, 1.2, 1.4));
      this.doors.put(_m, col);
    });
    this.doors.end();
    // spikes
    this.spikes.begin();
    for (const s of f.spikes) {
      const y = s.state === 2 ? 0 : s.state === 1 ? -0.1 + Math.sin(time * 60) * 0.008 : -0.16;
      this.spikes.at(s.x, y, s.z, 0, 1.4, s.state === 1 ? 0xffb0a0 : 0xffffff);
    }
    this.spikes.end();
    this.saws.begin();
    for (const b of f.blades) {
      _q.setFromEuler(_e.set(time * 14, Math.PI / 2, 0, 'YXZ'));
      _m.compose(_v.set(b.bx, 0.2, b.z), _q, _s.set(1.3, 1.3, 1.3));
      this.saws.put(_m, _c.setRGB(0.8, 0.8, 0.88));
    }
    this.saws.end();
    // pots
    for (const k in this.pots) this.pots[k as keyof typeof this.pots].begin();
    for (const p of f.pots) {
      if (p.broken) continue;
      const near = this.hoverAt && Math.hypot(this.hoverAt.x - p.x, this.hoverAt.z - p.z) < 0.1;
      const s = p.kind === 'barrel' ? 1.05 : 1.75;
      this.pots[p.kind].at(p.x, 0, p.z, p.yaw, s, near ? 0xffffff : 0xffffff);
    }
    for (const k in this.pots) this.pots[k as keyof typeof this.pots].end();
    // chests: pop in, lid swings open
    this.chestBody.begin();
    this.chestLid.begin();
    for (const c of f.chests) {
      const pop = c.t < 0.5 ? Phaser.Math.Easing.Back.Out(Math.min(1, c.t / 0.5)) : 1;
      const s = (c.big ? 1.9 : 1.35) * pop;
      const hov = this.hoverAt && Math.abs(this.hoverAt.x - c.x) < 0.05 && Math.abs(this.hoverAt.z - c.z) < 0.05;
      const tint = c.big ? _c.setRGB(1.35, 1.15, 0.6) : _c.setRGB(1, 1, 1);
      if (hov && !c.opened) tint.multiplyScalar(1.35 + Math.sin(time * 8) * 0.15);
      const y = 0.05 * s + (c.t < 0.5 ? (1 - pop) * 0.6 : 0);
      _m.compose(_v.set(c.x, y, c.z), _q.identity(), _s.set(s, s, s));
      this.chestBody.put(_m, tint);
      const ang = c.opened ? -1.2 * Phaser.Math.Easing.Back.Out(Math.min(1, c.openT / 0.35)) : (c.t > 1 ? Math.max(0, Math.sin(time * 5 + c.id)) * -0.06 : 0);
      _m2.compose(_v.set(0, 0.2, -0.2), _q.setFromEuler(_e.set(ang, 0, 0)), _s.set(1, 1, 1));
      _m.multiply(_m2);
      this.chestLid.put(_m, tint);
    }
    this.chestBody.end();
    this.chestLid.end();
    // pickups: coins spin, hearts and gems bob
    this.coins.begin(); this.hearts.begin(); this.keys.begin(); this.gems.begin(); this.shadows.begin(); this.glows.begin();
    for (const p of sim.picks) {
      const bob = p.y > 0 ? p.y : 0.08 + Math.sin(time * 4 + p.id) * 0.05;
      const yaw = time * 4 + p.id;
      if (p.kind === 'coin') this.coins.at(p.x, bob, p.z, yaw, 0.62);
      else if (p.kind === 'heart') { this.hearts.at(p.x, bob + 0.25, p.z, yaw * 0.6, 1.1); this.glowAt(p.x, bob + 0.25, p.z, 0.9, 0xff4a6a, camQ, 0.5); }
      else if (p.kind === 'key') { this.keys.at(p.x, bob + 0.25, p.z, yaw * 0.6, 1.7); this.glowAt(p.x, bob + 0.25, p.z, 1.1, 0xffd23f, camQ, 0.6); }
      else { this.gems.at(p.x, bob + 0.22, p.z, yaw * 0.6, 1.2, 0xffffff); this.glowAt(p.x, bob + 0.2, p.z, 1.2, 0x9ff3ff, camQ, 0.6); }
      this.shadows.at(p.x, 0.012, p.z, 0, 0.16);
    }
    // enemies
    for (const rig of Object.values(this.rigs)) rig.begin();
    this.slimes.begin(); this.spears.begin(); this.swords.begin();
    for (const e of sim.enemies) this.drawEnemy(e, dt, camQ);
    for (const rig of Object.values(this.rigs)) rig.end();
    this.slimes.end();
    // projectiles
    this.bones.begin(); this.orbs.begin(); this.waves.begin();
    for (const p of sim.projs) {
      const ang = Math.atan2(p.vx, p.vz);
      if (p.kind === 'spear') {
        _q.setFromEuler(_e.set(Math.PI / 2, ang, 0, 'YXZ'));
        _m.compose(_v.set(p.x - Math.sin(ang) * 0.3, 0.55, p.z - Math.cos(ang) * 0.3), _q, _s.set(1.1, 1.1, 1.1));
        this.spears.put(_m, _c.setRGB(1, 1, 1));
      } else if (p.kind === 'bone') {
        _q.setFromEuler(_e.set(0, ang + time * 14, 0));
        _m.compose(_v.set(p.x, 0.5, p.z), _q, _s.set(1.4, 1.4, 1.4));
        this.bones.put(_m);
        this.glowAt(p.x, 0.5, p.z, 0.55, 0xfff0c0, camQ, 0.35, this.orbs);
      } else if (p.kind === 'orb') {
        this.glowAt(p.x, 0.55, p.z, 0.75, 0xc04dff, camQ, 1, this.orbs);
        this.glowAt(p.x, 0.55, p.z, 0.32, 0xffffff, camQ, 1, this.orbs);
      } else if (p.radius > 0) {
        _m.compose(_v.set(p.cx, 0.05, p.cz), _q.identity(), _s.set(p.radius + 0.3, 1, p.radius + 0.3));
        this.waves.put(_m, _c.setRGB(1, 0.45, 0.2));
      }
      if (p.kind !== 'wave') this.shadows.at(p.x, 0.012, p.z, 0, 0.14);
    }
    this.bones.end(); this.orbs.end(); this.waves.end();
    this.spears.end(); this.swords.end();
    // brazier flames
    this.flames.begin();
    for (let i = 0; i < this.flamesAt.length; i++) {
      const p = this.flamesAt[i];
      const fl = 0.8 + Math.sin(time * 11 + i * 1.7) * 0.12 + Math.sin(time * 23 + i) * 0.08;
      this.glowAt(p.x, p.y, p.z, 0.75 * fl, 0xff8a2a, camQ, 1, this.flames);
      this.glowAt(p.x, p.y + 0.12, p.z, 0.42 * fl, 0xffe08a, camQ, 1, this.flames);
      this.glowAt(p.x, p.y - 0.2, p.z, 2.2, 0xff6a1a, camQ, 0.18 * fl, this.flames);
    }
    this.flames.end();
    // the live stairs glow, the shrine's halo
    this.stairsGlow.begin();
    if (f.stairs.active) {
      const k = 0.7 + Math.sin(time * 4) * 0.3;
      _m.compose(_v.set(f.stairs.x, 0.04, f.stairs.z), _q.identity(), _s.set(0.95, 1, 0.95));
      this.stairsGlow.put(_m, _c.setRGB(0.4 * k, 0.9 * k, 1 * k));
    }
    for (const r of f.rooms) if (r.type === 'shrine' && !r.used) {
      const k = 0.7 + Math.sin(time * 3) * 0.3;
      _m.compose(_v.set(r.cx, 0.04, r.z0 + 4.4), _q.identity(), _s.set(0.9, 1, 0.9));
      this.stairsGlow.put(_m, _c.setRGB(0.9 * k, 0.75 * k, 0.25 * k));
      this.glowAt(r.cx, 1.0 + Math.sin(time * 2) * 0.08, r.z0 + 3, 1.2, 0xffd27a, camQ, 0.5);
    }
    this.stairsGlow.end();
    this.hover.begin();
    if (this.hoverAt) {
      const h = this.hoverAt, k = 0.75 + Math.sin(time * 7) * 0.25;
      _c.setHex(h.color).multiplyScalar(k);
      _m.compose(_v.set(h.x, 0.05, h.z), _q.identity(), _s.set(h.r, 1, h.r));
      this.hover.put(_m, _c);
    }
    this.hover.end();
    this.coins.end(); this.hearts.end(); this.keys.end(); this.gems.end(); this.shadows.end(); this.glows.end();
  }

  /** A camera-facing soft glow. */
  private glowAt(x: number, y: number, z: number, size: number, color: number, camQ: THREE.Quaternion, k: number, inst = this.glows): void {
    _m.compose(_v.set(x, y, z), camQ, _s.set(size, size, size));
    inst.put(_m, _c.setHex(color).multiplyScalar(k));
  }

  /** Head height of an enemy (bars, popups). */
  headY(kind: EnemyKind): number {
    const L = LOOKS[kind];
    if (L.rig === 'slime') return 0.55 * L.scale + 0.15;
    return 0.8 * L.scale + 0.1;
  }

  private drawEnemy(e: Enemy, dt: number, camQ: THREE.Quaternion): void {
    const L = LOOKS[e.kind];
    let v = this.vis.get(e.id);
    if (!v) { v = { clip: 'idle', t: Math.random(), state: '', born: 0, yaw: e.face, dieT: 0 }; this.vis.set(e.id, v); }
    v.born += dt;
    // smooth turning
    let d = e.face - v.yaw;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    v.yaw += d * Math.min(1, dt * 14);
    const boss = !!ENEMIES[e.kind].boss;
    // clip from state
    let clip = 'idle', speed = 1, hold = false;
    if (!e.alive) { clip = 'die'; hold = true; v.dieT += dt; }
    else if (e.state === 'spawn') clip = boss ? 'idle' : 'jump';
    else if (e.state === 'windup') clip = 'holding-right';
    else if (e.state === 'act') clip = e.kind === 'orc' || e.move === 'charge' ? 'sprint' : e.kind === 'ghost' ? 'holding-right' : 'attack-melee-right';
    else if (e.state === 'recover') { clip = 'attack-melee-right'; hold = true; }
    else if (e.state === 'stun') clip = 'emote-no';
    else if (e.state === 'move') { clip = e.kind === 'ghost' ? 'idle' : 'walk'; speed = Math.max(0.6, e.speed * 0.9 / (L.scale * 0.95)); }
    if (clip !== v.clip || e.state !== v.state) {
      const keep = clip === v.clip && (clip === 'walk' || clip === 'idle');
      if (!keep) v.t = 0;
      v.clip = clip;
      v.state = e.state;
    }
    v.t += dt * speed * (e.state === 'recover' ? 1.8 : 1);
    if (!e.alive && v.dieT > 2.6) return;
    // flash white when hit, glow red when about to strike
    let f = 1;
    if (e.hitT < 0.1) f = 2.8;
    const tint = L.tint;
    _c.setRGB(tint[0] * f, tint[1] * f, tint[2] * f);
    if (e.elite) _c.multiply(new THREE.Color(1.3, 1.1, 0.55));
    if (e.state === 'windup') _c.lerp(new THREE.Color(2.2, 0.6, 0.5), 0.35 + 0.25 * Math.sin(v.born * 30));
    if (e.state === 'stun') _c.multiplyScalar(0.85);
    let y = e.y;
    if (e.state === 'spawn') {
      const k = Math.max(0, Math.min(1, 1 - e.t / (boss ? 2.6 : 0.75)));
      y = boss ? (1 - Phaser.Math.Easing.Bounce.Out(k)) * 6 : -L.scale * 0.75 * (1 - Phaser.Math.Easing.Cubic.Out(k));
    }
    if (!e.alive) y = -Math.max(0, v.dieT - 1.4) * 0.6;
    if (e.state === 'blink') return;
    const s = L.scale * (e.elite ? 1.2 : 1) * (e.state === 'act' && L.rig === 'slime' ? 1.08 : 1);
    if (L.rig === 'slime') {
      // squash and stretch with the hop
      const sq = e.state === 'act' ? 1 + e.y * 0.6 : 1 + Math.sin(v.born * 6 + e.id) * 0.06;
      const k = !e.alive ? Math.max(0, 1 - v.dieT * 3) : 1;
      if (k <= 0) return;
      _m.compose(_v.set(e.x, Math.max(0, y), e.z), _q.setFromAxisAngle(UP, v.yaw), _s.set(s / Math.sqrt(sq) * k, s * sq * k, s / Math.sqrt(sq) * k));
      this.slimes.put(_m, _c);
      this.shadows.at(e.x, 0.012, e.z, 0, 0.32 * s * k);
      return;
    }
    const rig = this.rigs[L.rig];
    _m.compose(_v.set(e.x, y, e.z), _q.setFromAxisAngle(UP, v.yaw), _s.set(s, s, s));
    const frame = rig.put(_m, clip, v.t, _c, hold);
    if (e.kind === 'ghost' || e.kind === 'vampire' || e.kind === 'vamplord') this.shadows.at(e.x, 0.012, e.z, 0, 0.3 * s);
    if (frame && L.weapon) {
      const sock = this.sockets[L.rig];
      if (sock.idx >= 0) {
        _m2.multiplyMatrices(_m, frame[sock.idx]).multiply(sock.rest[L.weapon]);
        if (L.weaponScale && L.weaponScale !== 1) _m2.multiply(new THREE.Matrix4().makeScale(L.weaponScale, L.weaponScale, L.weaponScale));
        (L.weapon === 'sword' ? this.swords : this.spears).put(_m2, _c.setRGB(1, 1, 1));
      }
    }
    void camQ;
  }

  /** Forget an enemy's animation state. */
  drop(id: number): void { this.vis.delete(id); }
}

/** A small seeded random generator (decor placement must not use the game's own). */
function seededRand(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), a | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
