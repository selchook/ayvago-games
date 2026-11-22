// Last Convoy: the escape drive as a pure simulation (60 Hz). After every mission the survivor
// drives the convoy's lead vehicle out of Northdale to the town sign on the highway, the rest of the
// convoy behind. The route is a chain of 16 m road cells (two of the kit's street tiles wide), mostly
// north with turns east and west: first through town between buildings, then up the on-ramp and
// along the highway between barriers. Zombies wander onto the road (run them down), barricades of
// traffic barriers block it with a gap to thread (or ram them), wrecks stand in the way, and nitro
// cans, repair kits and scrap lie on the tarmac. Walls and wrecks scrape the armour; the armoured
// body (upgrade) takes less; nitro rams through. The convoy wrecked loses the mission; the sign
// reached wins it (a third star with 60 % armour left).
//
// Steering comes from the shared car steering (@core CarSteering: arrows, wheel or tilt on touch,
// ←/→ on the keyboard) as one value -1..1; GAS, BRAKE and NITRO from the right thumb (↑, ↓, Space).
import { DRIVE, TUNING, type MissionDef, type Mode, type VehicleId } from './defs';
import type { Mods } from './powers';
import { mulberry } from './town';

export const BIG = 16;
/** A wreck's body circles along its length (the kit's cars are about 5.3 m long). */
const WRECK_ALONG = [-1.45, 0, 1.45];

export interface DriveInput { steer: number; gas: boolean; brake: boolean; nitro: boolean }
export const NO_DRIVE: DriveInput = { steer: 0, gas: false, brake: false, nitro: false };

export interface RouteCell { i: number; j: number; x: number; z: number; in: [number, number]; out: [number, number]; zone: 'town' | 'ramp' | 'highway'; walls: [number, number, number, number][] }
export interface RoadZombie { id: number; kind: 'basic' | 'runner' | 'chubby'; x: number; z: number; face: number; state: 'walk' | 'lunge' | 'dead'; t: number; speed: number; deadT: number; vx: number; vz: number; vy: number; y: number }
export interface Obstacle { id: number; kind: 'wreck' | 'barrier'; x: number; z: number; rot: number; r: number; hp: number; down: boolean; t: number; vx: number; vz: number; tint: number; cell: number }
export interface RoadPick { id: number; kind: 'nitro' | 'repair' | 'scrap'; x: number; z: number; taken: boolean }

export type DriveEvent =
  | { type: 'runover'; kind: string; x: number; z: number; pts: number }
  | { type: 'crash'; dmg: number; x: number; z: number; hard: boolean }
  | { type: 'ram'; x: number; z: number; dmg: number }
  | { type: 'scrape'; x: number; z: number }
  | { type: 'pick'; kind: string; x: number; z: number }
  | { type: 'nitro' } | { type: 'nitroEnd' } | { type: 'zone'; zone: string } | { type: 'sign' }
  | { type: 'win' } | { type: 'lose' };

export class Drive {
  readonly cells: RouteCell[] = [];
  zombies: RoadZombie[] = [];
  obstacles: Obstacle[] = [];
  picks: RoadPick[] = [];
  events: DriveEvent[] = [];
  readonly tune = TUNING.normal;
  rnd: () => number;
  time = 0;
  phase: 'count' | 'play' | 'won' | 'lost' = 'count';
  count = 2.4;
  /** The car: position, heading (dir = sin, cos), speed, armour, nitro. */
  x = 0; z = 0; h = Math.PI; v = 0; steer = 0;
  armor = 100; maxArmor = 100;
  nitro = 2; nitroT = 0;
  hitT = 0;
  /** The route index the car is on and the farthest it got (0..1 progress). */
  ci = 0;
  best = 0;
  /** The convoy behind: the lead's past positions it follows. */
  trail: { x: number; z: number; h: number }[] = [];
  stats = { runover: 0, crashes: 0, scrap: 0, rams: 0, pts: 0 };
  readonly top: number;
  readonly r: number;
  private nextId = 1;
  private spawnedTo = 0;
  private zoneSaid = 'town';

  constructor(readonly def: MissionDef, mode: Mode, readonly vehicle: VehicleId, readonly m: Mods, seed: number) {
    this.rnd = mulberry(seed);
    (this as { tune: typeof TUNING.normal }).tune = TUNING[mode];
    this.top = DRIVE.top[vehicle];
    this.r = vehicle === 'truck' ? 1.45 : 1.3;
    this.maxArmor = this.armor = Math.round(DRIVE.armor[vehicle] * m.armor * (m.plated ? DRIVE.armorPlated : 1) * (mode === 'easy' ? 1.35 : 1));
    this.nitro = m.nitro;
    this.buildRoute(Math.max(16, Math.round(def.drive.cells / 2)));
    this.x = this.cells[0].x; this.z = this.cells[0].z + BIG * 0.3;
    this.placeThings();
  }

  /** North in long runs, short jogs east or west between them; the last third is the highway. */
  private buildRoute(n: number): void {
    let i = 0, j = 0;
    let dir: [number, number] = [0, -1];
    const seq: [number, number][] = [[0, -1]];
    let side = this.rnd() < 0.5 ? 1 : -1;
    let run = 4;
    for (let k = 1; k < n; k++) {
      // the highway's last stretch is straight
      const late = k > n - 6;
      if (dir[1] === -1 && run <= 0 && !late) { dir = [side, 0]; side = -side; run = 1 + Math.floor(this.rnd() * 2); }
      else if (dir[1] === 0 && run <= 0) { dir = [0, -1]; run = 3 + Math.floor(this.rnd() * 4); }
      seq.push(dir);
      run--;
    }
    const cells: { i: number; j: number }[] = [{ i, j }];
    for (let k = 1; k < n; k++) { i += seq[k][0]; j += seq[k][1]; cells.push({ i, j }); }
    const townEnd = Math.floor(n * 0.5), rampEnd = Math.floor(n * 0.62);
    cells.forEach((c, k) => {
      const prev = k > 0 ? cells[k - 1] : { i: c.i, j: c.j + 1 };
      const next = k < n - 1 ? cells[k + 1] : { i: c.i, j: c.j - 1 };
      const din: [number, number] = [c.i - prev.i, c.j - prev.j];
      const dout: [number, number] = [next.i - c.i, next.j - c.j];
      const x = c.i * BIG, z = c.j * BIG, H = BIG / 2;
      const open = (dx: number, dz: number) => (dx === -din[0] && dz === -din[1]) || (dx === dout[0] && dz === dout[1]);
      const walls: [number, number, number, number][] = [];
      if (!open(0, -1)) walls.push([x - H, z - H, x + H, z - H]);
      if (!open(0, 1)) walls.push([x - H, z + H, x + H, z + H]);
      if (!open(-1, 0)) walls.push([x - H, z - H, x - H, z + H]);
      if (!open(1, 0)) walls.push([x + H, z - H, x + H, z + H]);
      this.cells.push({ i: c.i, j: c.j, x, z, in: din, out: dout, zone: k < townEnd ? 'town' : k < rampEnd ? 'ramp' : 'highway', walls });
    });
    // the lead-in: one more stretch of street behind the start, closed at its far end, where the
    // rest of the convoy stands at the countdown (and nobody reverses off the map)
    const c0 = this.cells[0], H = BIG / 2;
    c0.walls.push([c0.x - H, c0.z + H, c0.x - H, c0.z + H + BIG], [c0.x + H, c0.z + H, c0.x + H, c0.z + H + BIG], [c0.x - H, c0.z + H + BIG, c0.x + H, c0.z + H + BIG]);
    // and the highway goes on past the sign (the convoy rolls to a stop there after the win)
    const cl = this.cells[this.cells.length - 1];
    cl.walls.push([cl.x - H, cl.z - H - BIG, cl.x - H, cl.z - H], [cl.x + H, cl.z - H - BIG, cl.x + H, cl.z - H]);
  }

  /** Wrecks, barricades and pickups along the route (not in the first cells or in turns). */
  private placeThings(): void {
    const n = this.cells.length;
    const blocks = new Set<number>();
    const want = this.def.drive.blocks;
    for (let k = 0; k < want; k++) {
      const at = Math.floor(4 + ((k + 0.5) / want) * (n - 8));
      blocks.add(at);
    }
    for (let k = 3; k < n - 2; k++) {
      const c = this.cells[k];
      const straight = c.in[0] === c.out[0] && c.in[1] === c.out[1];
      const ax = c.out[0], az = c.out[1];
      const rx = -az, rz = ax;
      if (blocks.has(k) && straight) {
        // a line of barriers across the road with a gap on one side
        const gap = this.rnd() < 0.5 ? -1 : 1;
        for (let s = -3; s <= 3; s++) {
          if (Math.sign(s) === gap && Math.abs(s) >= 2) continue;
          const off = s * 2.05;
          this.obstacles.push({ id: this.nextId++, kind: 'barrier', x: c.x + rx * off, z: c.z + rz * off, rot: Math.atan2(rx, rz), r: 0.95, hp: 1, down: false, t: 0, vx: 0, vz: 0, tint: 0xffffff, cell: k });
        }
        continue;
      }
      if (straight && this.rnd() < 0.45) {
        const off = (this.rnd() < 0.5 ? -1 : 1) * (2.5 + this.rnd() * 3.5);
        const along = (this.rnd() - 0.5) * 8;
        this.obstacles.push({ id: this.nextId++, kind: 'wreck', x: c.x + rx * off + ax * along, z: c.z + rz * off + az * along, rot: Math.atan2(ax, az) + (this.rnd() - 0.5) * 0.8, r: 1.3, hp: 1, down: false, t: 0, vx: 0, vz: 0, tint: [0x8a7a6a, 0x6a7a8a, 0x8a6a6a, 0x7a8a6a][Math.floor(this.rnd() * 4)], cell: k });
      }
      if (this.rnd() < 0.3) {
        const kind = this.rnd() < 0.45 ? 'nitro' : this.rnd() < 0.5 ? 'repair' : 'scrap';
        const off = (this.rnd() - 0.5) * 10;
        this.picks.push({ id: this.nextId++, kind, x: c.x + rx * off, z: c.z + rz * off, taken: false });
      }
    }
  }

  /** Zombies stagger onto the road a little ahead of the convoy. */
  private spawnAhead(): void {
    const ahead = Math.min(this.cells.length - 2, this.ci + 5);
    while (this.spawnedTo < ahead) {
      this.spawnedTo++;
      const k = this.spawnedTo;
      if (k < 2) continue;
      const c = this.cells[k];
      const dens = this.def.drive.zombies * this.tune.roadZ * (c.zone === 'highway' ? 0.8 : 1);
      const count = Math.floor(dens * 3 + this.rnd() * dens * 3);
      for (let q = 0; q < count; q++) {
        const kind: RoadZombie['kind'] = this.rnd() < 0.08 + this.def.n * 0.01 ? 'chubby' : this.rnd() < 0.25 ? 'runner' : 'basic';
        this.zombies.push({ id: this.nextId++, kind, x: c.x + (this.rnd() - 0.5) * 13, z: c.z + (this.rnd() - 0.5) * 13, face: this.rnd() * 6.28, state: 'walk', t: 0, speed: kind === 'runner' ? 3.5 : kind === 'chubby' ? 1 : 1.2, deadT: 0, vx: 0, vz: 0, vy: 0, y: 0 });
      }
    }
  }

  get progress(): number { return Math.min(1, this.best / (this.cells.length - 1)); }

  step(dt: number, inp: DriveInput): void {
    this.time += dt;
    this.hitT = Math.max(0, this.hitT - dt);
    if (this.phase === 'count') {
      this.count -= dt;
      this.steer = inp.steer;
      if (this.count <= 0) this.phase = 'play';
      this.spawnAhead();
      this.updateZombies(dt);
      return;
    }
    if (this.phase !== 'play') {
      // the car rolls to a stop (past the sign it brakes, staying on the road drawn beyond it)
      this.v *= Math.exp(-dt * (this.phase === 'won' ? 3 : 1.5));
      this.move(dt);
      this.updateZombies(dt);
      return;
    }
    this.steer = inp.steer;
    // nitro
    if (inp.nitro && this.nitro > 0 && this.nitroT <= 0) { this.nitro--; this.nitroT = DRIVE.nitroTime; this.events.push({ type: 'nitro' }); }
    if (this.nitroT > 0) { this.nitroT -= dt; if (this.nitroT <= 0) this.events.push({ type: 'nitroEnd' }); }
    const top = this.nitroT > 0 ? DRIVE.nitroTop : this.top;
    if (this.nitroT > 0) this.v = Math.min(top, this.v + DRIVE.accel * 2.2 * dt);
    else if (inp.gas) this.v += DRIVE.accel * Math.max(0.15, 1 - this.v / top) * dt;
    else if (inp.brake) this.v -= (this.v > 0 ? DRIVE.brake : DRIVE.accel * 0.5) * dt;
    else this.v -= Math.sign(this.v) * Math.min(Math.abs(this.v), DRIVE.coast * dt);
    if (this.v > top) this.v = Math.max(top, this.v - DRIVE.brake * dt);
    this.v = Math.max(-5, this.v);
    this.move(dt);
    this.collideWalls();
    this.collideThings();
    this.spawnAhead();
    this.updateZombies(dt);
    this.updatePicks();
    // where on the route
    for (let k = Math.max(0, this.ci - 2); k < Math.min(this.cells.length, this.ci + 3); k++) {
      const c = this.cells[k];
      if (Math.abs(this.x - c.x) <= BIG / 2 && Math.abs(this.z - c.z) <= BIG / 2) { this.ci = k; break; }
    }
    this.best = Math.max(this.best, this.ci);
    const zone = this.cells[this.ci].zone;
    if (zone !== this.zoneSaid) { this.zoneSaid = zone; this.events.push({ type: 'zone', zone }); }
    // the sign: past the last cell's middle
    const last = this.cells[this.cells.length - 1];
    if (this.ci === this.cells.length - 1 && this.z < last.z) {
      this.phase = 'won';
      this.events.push({ type: 'sign' }, { type: 'win' });
    }
    this.trail.push({ x: this.x, z: this.z, h: this.h });
    if (this.trail.length > 240) this.trail.shift();
  }

  private move(dt: number): void {
    // yaw: full lock turns at DRIVE.yaw rad/s from about 6 m/s; a slower car turns less; reverse turns back
    const k = Math.min(1, Math.abs(this.v) / 6) * Math.sign(this.v || 1) * (1 - Math.min(0.25, Math.abs(this.v) / 120));
    this.h -= this.steer * DRIVE.yaw * k * dt;
    this.x += Math.sin(this.h) * this.v * dt;
    this.z += Math.cos(this.h) * this.v * dt;
  }

  /** The route's walls: segment against circle; the car slides along, loses speed and armour. */
  private collideWalls(): void {
    const r = this.r;
    for (let k = Math.max(0, this.ci - 2); k < Math.min(this.cells.length, this.ci + 3); k++) {
      for (const [x0, z0, x1, z1] of this.cells[k].walls) {
        const sx = x1 - x0, sz = z1 - z0, l2 = sx * sx + sz * sz;
        const t = Math.max(0, Math.min(1, ((this.x - x0) * sx + (this.z - z0) * sz) / l2));
        const px = x0 + sx * t, pz = z0 + sz * t;
        const dx = this.x - px, dz = this.z - pz, d = Math.hypot(dx, dz);
        if (d >= r || d < 1e-5) continue;
        const nx = dx / d, nz = dz / d;
        this.x += nx * (r - d); this.z += nz * (r - d);
        // the speed into the wall
        const vx = Math.sin(this.h) * this.v, vz = Math.cos(this.h) * this.v;
        const into = -(vx * nx + vz * nz);
        if (into > 0.5) {
          const hard = into > 7;
          const dmg = (hard ? into * 1.1 : into * 0.35) * this.tune.crash * (this.m.plated ? 0.6 : 1);
          this.hurt(dmg);
          this.v *= hard ? 0.45 : 0.85;
          this.events.push(hard ? { type: 'crash', dmg, x: px, z: pz, hard } : { type: 'scrape', x: px, z: pz });
          // turn the nose along the wall
          const along = Math.atan2(sz, sx);
          const a1 = Math.PI / 2 - along, a2 = a1 + Math.PI;
          const pick = Math.abs(angle(this.h - a1)) < Math.abs(angle(this.h - a2)) ? a1 : a2;
          this.h += angle(pick - this.h) * 0.35;
          if (hard) this.stats.crashes++;
        }
      }
    }
  }

  private collideThings(): void {
    const fx = Math.sin(this.h), fz = Math.cos(this.h);
    // the car is a capsule: two circles along its length
    const pts = [[this.x + fx * 1.4, this.z + fz * 1.4], [this.x - fx * 1.2, this.z - fz * 1.2]];
    const ram = this.nitroT > 0;
    for (const o of this.obstacles) {
      if (o.down || Math.abs(o.x - this.x) > 8 || Math.abs(o.z - this.z) > 8) continue;
      // a wreck is a car-long capsule (three circles along its body), not one circle in its middle
      const ofs = o.kind === 'wreck' ? WRECK_ALONG : [0];
      for (const [px, pz] of pts) {
        let ox = o.x, oz = o.z, best = 1e9;
        for (const a of ofs) {
          const cx = o.x + Math.sin(o.rot) * a, cz = o.z + Math.cos(o.rot) * a, dd = Math.hypot(px - cx, pz - cz);
          if (dd < best) { best = dd; ox = cx; oz = cz; }
        }
        const dx = px - ox, dz = pz - oz, d = Math.hypot(dx, dz), m = o.r + this.r * 0.85;
        if (d >= m || d < 1e-5) continue;
        if (o.kind === 'barrier') {
          // smashed aside
          o.down = true; o.t = 0;
          o.vx = fx * this.v * 0.6 - dx / d * 3; o.vz = fz * this.v * 0.6 - dz / d * 3;
          const dmg = (ram ? 1 : this.m.ramSpikes ? 2.5 : 6) * this.tune.crash * this.m.ramDmg * (this.m.plated ? 0.6 : 1);
          this.hurt(dmg);
          this.v *= ram ? 0.92 : this.m.plated ? 0.8 : 0.68;
          this.stats.rams++;
          this.events.push({ type: 'ram', x: o.x, z: o.z, dmg });
          break;
        }
        // a wreck: solid
        const nx = dx / d, nz = dz / d;
        this.x += nx * (m - d); this.z += nz * (m - d);
        const into = -(fx * this.v * nx + fz * this.v * nz);
        if (into > 1.5) {
          const dmg = into * 0.9 * this.tune.crash * (this.m.plated ? 0.6 : 1) * (ram ? 0.5 : 1);
          this.hurt(dmg);
          this.v *= 0.5;
          this.stats.crashes++;
          this.events.push({ type: 'crash', dmg, x: ox, z: oz, hard: into > 6 });
        }
        break;
      }
    }
    for (const o of this.obstacles) if (o.down && o.t < 3) { o.t += 1 / 60; o.x += o.vx / 60; o.z += o.vz / 60; o.vx *= 0.96; o.vz *= 0.96; }
  }

  private updateZombies(dt: number): void {
    const fx = Math.sin(this.h), fz = Math.cos(this.h);
    for (const z of this.zombies) {
      z.t += dt;
      if (z.state === 'dead') {
        z.deadT += dt;
        z.x += z.vx * dt; z.z += z.vz * dt; z.vy -= 20 * dt; z.y = Math.max(0, z.y + z.vy * dt);
        z.vx *= Math.exp(-dt * 2); z.vz *= Math.exp(-dt * 2);
        continue;
      }
      const dx = this.x - z.x, dz = this.z - z.z, d = Math.hypot(dx, dz);
      // shamble towards the car once it is near; runners lunge
      if (d < 26 && this.phase === 'play') {
        const sp = z.kind === 'runner' && d < 12 ? 5 : z.speed;
        z.x += (dx / d) * sp * dt; z.z += (dz / d) * sp * dt;
        z.face = Math.atan2(dx, dz);
        if (z.kind === 'runner' && d < 12) z.state = 'lunge';
      }
      // run over: in front of the car's middle, moving
      const ox = z.x - this.x, oz = z.z - this.z;
      const along = ox * fx + oz * fz, side = Math.abs(ox * fz - oz * fx);
      if (along > -2.4 && along < 2.9 && side < 1.5 && Math.abs(this.v) > 3) {
        z.state = 'dead'; z.deadT = 0;
        z.vx = fx * this.v * 0.7 + (this.rnd() - 0.5) * 4; z.vz = fz * this.v * 0.7 + (this.rnd() - 0.5) * 4; z.vy = 4 + Math.abs(this.v) * 0.25;
        const ram = this.nitroT > 0;
        const dmg = (z.kind === 'chubby' ? 9 : z.kind === 'runner' ? 0.6 : 1.2) * this.tune.crash * (ram ? 0.2 : 1) * (this.m.plated ? 0.6 : 1) * this.m.ramDmg;
        this.hurt(dmg);
        if (z.kind === 'chubby') this.v *= 0.7;
        const pts = (z.kind === 'chubby' ? 60 : 15) * this.m.runOver;
        this.stats.runover++;
        this.stats.pts += pts;
        this.events.push({ type: 'runover', kind: z.kind, x: z.x, z: z.z, pts });
      } else if (d < 1.9 && Math.abs(this.v) < 3) {
        // a crowd on a stopped car claws at it
        this.hurt((z.kind === 'chubby' ? 6 : 2) * dt * this.tune.crash);
      }
    }
    // keep the list short: the dead fade, the ones far behind go
    this.zombies = this.zombies.filter((z) => (z.state !== 'dead' || z.deadT < 3) && Math.hypot(z.x - this.x, z.z - this.z) < 90);
  }

  private updatePicks(): void {
    for (const p of this.picks) {
      if (p.taken || Math.hypot(p.x - this.x, p.z - this.z) > 2.6) continue;
      p.taken = true;
      if (p.kind === 'nitro') this.nitro = Math.min(6, this.nitro + 1);
      else if (p.kind === 'repair') this.armor = Math.min(this.maxArmor, this.armor + this.maxArmor * 0.2);
      else { this.stats.scrap += 12; }
      this.events.push({ type: 'pick', kind: p.kind, x: p.x, z: p.z });
    }
  }

  private hurt(dmg: number): void {
    if (this.phase !== 'play' || dmg <= 0) return;
    this.armor -= dmg;
    this.hitT = 0.25;
    if (this.armor <= 0) {
      this.armor = 0;
      this.phase = 'lost';
      this.events.push({ type: 'lose' });
    }
  }

  /** A rewarded continue: the convoy patched up to half and on its way again. */
  revive(): void {
    this.armor = this.maxArmor * 0.5;
    this.phase = 'play';
    const c = this.cells[this.ci];
    this.x = c.x; this.z = c.z;
    this.h = Math.atan2(c.out[0], c.out[1]);
    this.v = 4;
    for (const z of this.zombies) if (Math.hypot(z.x - this.x, z.z - this.z) < 12) { z.state = 'dead'; z.deadT = 2.5; }
  }

  /** The arrival bonus: 600 and 5 per armour percent. */
  bonus(): number { return 600 + Math.round((this.armor / this.maxArmor) * 500); }
}

export const angle = (a: number): number => { while (a > Math.PI) a -= Math.PI * 2; while (a < -Math.PI) a += Math.PI * 2; return a; };
