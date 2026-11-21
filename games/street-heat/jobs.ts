// Street Heat: the jobs on top of the simulation. The story (13 missions of stages: drive to a
// marker and stop, pick up and deliver, fragile cargo and a nervous passenger, checkpoints, lose the
// heat, tail a car without being seen, chase and ram a car, escort a car through a police attack, a
// final job of four stages), free roam (a night shift with job phones, taxi fares, stunt jumps, the
// spray shop and the garage) and the quick modes (Getaway: survive the escalating police; Delivery
// Rush: deliveries against the clock). A job reads the sim each frame and says what the HUD, the
// markers and the GPS show; its events go to the scene.
import { Sim, Car } from './sim';
import { type Place, type Spot } from './city';
import { clamp, type CarId, type Tuning } from './defs';

export type Mode = 'story' | 'roam' | 'getaway' | 'rush';

export type StageDef =
  | { type: 'goto'; to: Place; act: 'pickup' | 'deliver' | 'arrive' | 'passenger'; time?: number; cargo?: 'fragile' | 'nervous' }
  | { type: 'checkpoints'; points: Place[]; time: number }
  | { type: 'lose'; stars: number }
  | { type: 'tail'; from: Place; to: Place }
  | { type: 'chase'; from: Place; time: number }
  | { type: 'escort'; from: Place; to: Place; stars: number }
  | { type: 'swap'; car: CarId; stars: number };

export interface MissionDef {
  id: number;
  start: Place;
  /** 0 day … 1 night. */
  night: number;
  pay: number;
  stages: StageDef[];
  /** ★★: seconds left on the job's clock (or 0: no clock, the stage's own measure). */
  star2: number;
  /** Patrols in the streets. */
  police?: boolean;
}

export const MISSIONS: MissionDef[] = [
  { id: 1, start: 'garage', night: 0.55, pay: 400, star2: 25, police: false, stages: [{ type: 'goto', to: 'diner', act: 'pickup', time: 75 }, { type: 'goto', to: 'hotel', act: 'deliver', time: 70 }] },
  { id: 2, start: 'garage', night: 0.7, pay: 650, star2: 30, stages: [{ type: 'goto', to: 'gallery', act: 'pickup', time: 80 }, { type: 'goto', to: 'tower', act: 'deliver', time: 80, cargo: 'fragile' }] },
  { id: 3, start: 'plaza', night: 0.8, pay: 800, star2: 20, stages: [{ type: 'checkpoints', points: ['bank', 'tower', 'parking', 'spray', 'station', 'hotel', 'market', 'gallery'], time: 120 }] },
  { id: 4, start: 'garage', night: 0.9, pay: 1100, star2: 0, stages: [{ type: 'goto', to: 'bank', act: 'pickup', time: 80 }, { type: 'lose', stars: 2 }, { type: 'goto', to: 'garage', act: 'deliver' }] },
  { id: 5, start: 'garage', night: 0.85, pay: 1200, star2: 35, stages: [{ type: 'goto', to: 'market', act: 'pickup', time: 60 }, { type: 'goto', to: 'station', act: 'deliver', time: 60 }, { type: 'goto', to: 'park', act: 'deliver', time: 55 }, { type: 'goto', to: 'docks', act: 'deliver', time: 70 }] },
  { id: 6, start: 'hotel', night: 0.95, pay: 1400, star2: 0, stages: [{ type: 'tail', from: 'station', to: 'warehouse' }] },
  { id: 7, start: 'garage', night: 0.9, pay: 1500, star2: 20, stages: [{ type: 'goto', to: 'hotel', act: 'passenger', time: 60 }, { type: 'goto', to: 'station', act: 'deliver', time: 62, cargo: 'nervous' }] },
  { id: 8, start: 'tower', night: 1, pay: 1800, star2: 60, stages: [{ type: 'chase', from: 'parking', time: 120 }] },
  { id: 9, start: 'station', night: 1, pay: 2000, star2: 0, stages: [{ type: 'escort', from: 'docks', to: 'garage', stars: 2 }] },
  { id: 10, start: 'bank', night: 1, pay: 2400, star2: 0, stages: [{ type: 'goto', to: 'precinct', act: 'arrive', time: 90 }, { type: 'swap', car: 'super', stars: 3 }, { type: 'lose', stars: 3 }, { type: 'goto', to: 'garage', act: 'deliver' }] },
  { id: 11, start: 'garage', night: 1, pay: 2200, star2: 25, stages: [{ type: 'checkpoints', points: ['park', 'market', 'stunt', 'diner', 'gallery', 'bank', 'tower', 'precinct', 'spray', 'docks'], time: 150 }] },
  { id: 12, start: 'docks', night: 1, pay: 2600, star2: 0, stages: [{ type: 'lose', stars: 3 }, { type: 'goto', to: 'spray', act: 'arrive' }] },
  { id: 13, start: 'garage', night: 1, pay: 5000, star2: 0, stages: [{ type: 'goto', to: 'bank', act: 'passenger', time: 70 }, { type: 'lose', stars: 2 }, { type: 'chase', from: 'tower', time: 100 }, { type: 'goto', to: 'precinct', act: 'deliver', time: 75 }] },
];

export type MarkerKind = 'pickup' | 'drop' | 'check' | 'phone' | 'fare' | 'spray' | 'garage' | 'stunt' | 'target';
export interface Marker { x: number; z: number; kind: MarkerKind; next?: boolean }

export type JobEvent =
  | { type: 'stage'; key: string; vars?: Record<string, string | number> }
  | { type: 'pickup'; x: number; z: number }
  | { type: 'deliver'; x: number; z: number; pay: number }
  | { type: 'checkpoint'; left: number; x: number; z: number }
  | { type: 'cash'; n: number; key: string }
  | { type: 'time'; n: number }
  | { type: 'warn'; key: string }
  | { type: 'cargo'; left: number }
  | { type: 'swap'; car: CarId }
  | { type: 'fail'; key: string }
  | { type: 'done' };

/** Why a run ended (the result screen and the continue offer read it). */
export type EndReason = 'done' | 'busted' | 'wrecked' | 'time' | 'cargo' | 'lost' | 'spotted' | 'escaped' | 'escort' | 'shift';

export class Job {
  readonly events: JobEvent[] = [];
  /** The run's score: pay, bonuses, fares. */
  cash = 0;
  /** Seconds on the job's clock (Infinity: none). */
  clock = Infinity;
  clockMax = 0;
  stage = 0;
  over: EndReason | null = null;
  /** The objective line: i18n key and values. */
  goal = { key: '', vars: {} as Record<string, string | number> };
  /** Where the GPS points (null: nowhere). */
  nav: { x: number; z: number } | null = null;
  markers: Marker[] = [];
  /** Fragile cargo / the passenger's nerves (100 → 0), or null. */
  cargo: number | null = null;
  cargoKind: 'fragile' | 'nervous' | null = null;
  /** Tail: suspicion (0 → 100) and the distance band. */
  suspicion = 0;
  tailFar = 0;
  /** The car of the stage (tail, chase, escort). */
  actor: Car | null = null;
  /** Free roam and rush: the side job in hand. */
  side: { kind: 'delivery' | 'fare'; to: Spot; time: number; pay: number; from: Spot } | null = null;
  phones: Spot[] = [];
  fares: Spot[] = [];
  jumpsDone = new Set<number>();
  deliveries = 0;
  /** Getaway: seconds survived. */
  survived = 0;
  /** Stars of a finished story mission. */
  rating = 0;
  readonly def: MissionDef | null;
  private checkList: Spot[] = [];
  private stageT = 0;
  private startHp = 1;
  private hitCount = 0;
  private sawDamage = 0;
  private escapeT = 0;
  private lastCrashT = -9;
  /** The escort's police attack starts when it drives off. */
  private escortStars = 0;
  private tailT = 0;
  private armed = false;

  constructor(readonly sim: Sim, readonly mode: Mode, mission: number, readonly tune: Tuning) {
    this.def = mode === 'story' ? MISSIONS.find((m) => m.id === mission) ?? MISSIONS[0] : null;
    this.startHp = sim.player.health;
    if (mode === 'roam') { this.clock = this.clockMax = 8 * 60; this.goal = { key: 'g_roam', vars: {} }; }
    if (mode === 'rush') { this.clock = this.clockMax = 150 * tune.time; }
    if (mode === 'getaway') { sim.forceStars(2); this.goal = { key: 'g_getaway', vars: {} }; }
    if (mode === 'roam' || mode === 'rush') this.refillPhones();
    if (mode === 'story') this.enter();
  }

  private place(p: Place): Spot { return this.sim.city.places.get(p)!; }

  // ---------------------------------------------------------------- story stages

  private get st(): StageDef | null { return this.def?.stages[this.stage] ?? null; }

  private enter(): void {
    const st = this.st, sim = this.sim;
    if (!st) return;
    this.stageT = 0;
    this.markers = [];
    this.actor = null;
    const time = (s: number | undefined) => { if (s) { this.clock = this.clockMax = s * this.tune.time; } };
    switch (st.type) {
      case 'goto': {
        time(st.time);
        if (!st.time && this.clock !== Infinity && this.stage > 0) this.clock = Infinity;
        const s = this.place(st.to);
        this.markers = [{ x: s.x, z: s.z, kind: st.act === 'pickup' || st.act === 'passenger' ? 'pickup' : st.act === 'arrive' ? 'check' : 'drop' }];
        this.goal = { key: 'g_' + st.act, vars: { place: 'pl_' + st.to } };
        if (st.cargo) { this.cargo = 100; this.cargoKind = st.cargo; }
        this.events.push({ type: 'stage', key: 'g_' + st.act, vars: { place: 'pl_' + st.to } });
        break;
      }
      case 'checkpoints':
        time(st.time);
        this.checkList = st.points.map((p) => this.place(p));
        this.goal = { key: 'g_checks', vars: { n: this.checkList.length } };
        this.events.push({ type: 'stage', key: 'g_checks', vars: { n: this.checkList.length } });
        this.clock = this.clockMax = st.time * this.tune.time;
        break;
      case 'lose':
        this.clock = Infinity;
        sim.forceStars(st.stars);
        this.goal = { key: 'g_lose', vars: {} };
        this.events.push({ type: 'stage', key: 'g_lose', vars: {} });
        break;
      case 'tail': {
        this.clock = Infinity;
        const from = this.place(st.from), to = this.place(st.to);
        this.actor = sim.addActor('target', 'cars:SportsCar2', 0x7a3ad8, from, routeAi(to, 12.5, true), { top: 24, accel: 6 });
        this.actor.waitFor = 50;
        this.goal = { key: 'g_find', vars: {} };
        this.suspicion = 0;
        this.events.push({ type: 'stage', key: 'g_tail', vars: {} });
        break;
      }
      case 'chase': {
        time(st.time);
        const from = this.place(st.from);
        this.actor = sim.addActor('target', 'cars:SUV', 0x1c1d22, from, fleeAi(), { top: 31, accel: 8.5, hp: 110, mass: 1.4 });
        this.actor.hp = this.actor.health = 110;
        this.actor.mass = 1.3;
        this.actor.waitFor = 60;
        this.goal = { key: 'g_find', vars: {} };
        this.escapeT = 0;
        this.events.push({ type: 'stage', key: 'g_chase', vars: {} });
        break;
      }
      case 'escort': {
        this.clock = Infinity;
        const from = this.place(st.from), to = this.place(st.to);
        this.actor = sim.addActor('escort', 'cars:SUV', 0xf2f2f0, from, routeAi(to, 11, false), { top: 18, accel: 5 });
        this.actor.hp = this.actor.health = 220;
        this.actor.mass = 2.2;
        this.actor.waitFor = 30;
        this.escortStars = st.stars;
        this.markers = [{ x: to.x, z: to.z, kind: 'drop' }];
        this.goal = { key: 'g_escort', vars: { place: 'pl_' + st.to } };
        this.events.push({ type: 'stage', key: 'g_escort', vars: { place: 'pl_' + st.to } });
        break;
      }
      case 'swap':
        this.events.push({ type: 'swap', car: st.car });
        sim.forceStars(st.stars);
        this.next();
        break;
    }
  }

  private next(): void {
    this.stage++;
    if (!this.def || this.stage >= this.def.stages.length) { this.finish(); return; }
    this.enter();
  }

  private finish(): void {
    if (this.over) return;
    const def = this.def!, sim = this.sim;
    const hpLeft = sim.player.health / sim.player.hp;
    const clockOk = def.star2 > 0 ? this.clock !== Infinity && this.clock >= def.star2 * this.tune.time : this.stars2();
    this.rating = 1 + (clockOk ? 1 : 0) + (hpLeft >= 0.7 && (this.cargo === null || this.cargo >= 60) ? 1 : 0);
    const bonus = Math.round((this.clock !== Infinity ? this.clock * 8 : 0) + hpLeft * 200 + (this.rating - 1) * def.pay * 0.15);
    this.cash = def.pay + bonus;
    this.over = 'done';
    this.markers = [];
    this.nav = null;
    this.events.push({ type: 'done' });
  }

  /** ★★ of a job without a clock: tail without much suspicion, getaways and escorts quickly. */
  private stars2(): boolean {
    const def = this.def!;
    if (def.stages.some((s) => s.type === 'tail')) return this.suspicion < 50;
    if (def.stages.some((s) => s.type === 'escort')) return (this.sawDamage ?? 0) < 0.5;
    return this.sim.time < 150 + def.stages.length * 30;
  }

  fail(reason: EndReason): void {
    if (this.over) return;
    this.over = reason;
    this.events.push({ type: 'fail', key: 'f_' + reason });
  }

  // ---------------------------------------------------------------- every frame

  update(dt: number): void {
    const sim = this.sim;
    if (this.over) return;
    if (sim.busted) { this.end('busted'); return; }
    if (sim.wrecked) { this.end('wrecked'); return; }
    if (this.clock !== Infinity) {
      this.clock -= dt;
      if (this.clock <= 0) { this.clock = 0; this.end(this.mode === 'roam' ? 'shift' : this.mode === 'rush' ? 'shift' : 'time'); return; }
    }
    this.stageT += dt;
    this.cargoHits();
    if (this.mode === 'story') this.storyStep(dt);
    else if (this.mode === 'getaway') this.getawayStep(dt);
    else this.sideStep(dt);
  }

  private end(reason: EndReason): void {
    if (this.mode === 'story') this.fail(reason);
    else {
      // modes end with what was earned; busted costs a fine
      if (reason === 'busted' && this.mode !== 'getaway') this.cash = Math.round(this.cash * 0.75);
      this.over = reason;
      this.events.push({ type: reason === 'shift' ? 'done' : 'fail', key: 'f_' + reason } as JobEvent);
    }
  }

  /** Crashes hurt fragile cargo and the passenger's nerves (red lights and the pavement too). */
  private cargoHits(): void {
    if (this.cargo === null) return;
    for (const e of this.sim.events) {
      let hit = 0;
      if (e.type === 'crash') hit = e.impact * (this.cargoKind === 'fragile' ? 3.6 : 2.2);
      else if (e.type === 'land') hit = e.impact * 3;
      else if (this.cargoKind === 'nervous' && e.type === 'redLight') hit = 8;
      else if (this.cargoKind === 'nervous' && e.type === 'kerb') hit = 6;
      else if (this.cargoKind === 'nervous' && e.type === 'scrape') hit = 1.5;
      if (hit > 0.5) {
        this.cargo = Math.max(0, this.cargo - hit);
        this.events.push({ type: 'cargo', left: this.cargo });
        if (this.cargo <= 0) { this.fail('cargo'); return; }
      }
    }
  }

  private storyStep(dt: number): void {
    const st = this.st, sim = this.sim, p = sim.player;
    if (!st) return;
    switch (st.type) {
      case 'goto': {
        const s = this.place(st.to);
        this.nav = { x: s.x, z: s.z };
        if (sim.inMarker(s.x, s.z)) {
          if (st.act === 'pickup' || st.act === 'passenger') this.events.push({ type: 'pickup', x: s.x, z: s.z });
          else if (st.act === 'deliver') this.events.push({ type: 'deliver', x: s.x, z: s.z, pay: 0 });
          if (st.act === 'deliver') { this.cargo = null; this.cargoKind = null; }
          this.next();
        }
        break;
      }
      case 'checkpoints': {
        const c = this.checkList[0];
        if (!c) { this.next(); break; }
        this.markers = this.checkList.slice(0, 2).map((s, i) => ({ x: s.x, z: s.z, kind: 'check', next: i === 1 }));
        this.nav = { x: c.x, z: c.z };
        this.goal.vars.n = this.checkList.length;
        if (Math.hypot(p.x - c.x, p.z - c.z) < 8) {
          this.checkList.shift();
          this.clock += 4;
          this.events.push({ type: 'checkpoint', left: this.checkList.length, x: c.x, z: c.z });
          if (!this.checkList.length) this.next();
        }
        break;
      }
      case 'lose':
        this.nav = null;
        this.markers = [];
        if (sim.stars === 0 && this.stageT > 1) this.next();
        break;
      case 'tail': {
        const a = this.actor!;
        this.nav = { x: a.x, z: a.z };
        this.markers = [{ x: a.x, z: a.z, kind: 'target' }];
        if (a.waitFor > 0) break;
        if (this.goal.key !== 'g_tail') { this.goal = { key: 'g_tail', vars: {} }; this.events.push({ type: 'stage', key: 'g_tail', vars: {} }); }
        const d = Math.hypot(a.x - p.x, a.z - p.z);
        // too close and in its mirrors: suspicion; too far: losing it
        // in its mirrors and close: suspicion grows (faster right behind or alongside); out of sight it fades
        const behind = ((p.x - a.x) * Math.sin(a.h) + (p.z - a.z) * Math.cos(a.h)) < -3;
        const seen = d < 30 && sim.city.los(a.x, a.z, p.x, p.z);
        this.tailT += dt;
        if (this.tailT < 5) { /* it is just pulling out: a moment to fall in behind */ }
        else if (seen && d < 12) this.suspicion += 18 * dt * this.tune.suspicion;
        else if (seen && d < 20 && !behind) this.suspicion += 14 * dt * this.tune.suspicion;
        else if (seen && d < 18) this.suspicion += 8 * dt * this.tune.suspicion;
        else this.suspicion = Math.max(0, this.suspicion - 5 * dt);
        for (const e of sim.events) if (e.type === 'crash' || e.type === 'horn') { if (d < 40) this.suspicion += 10 * this.tune.suspicion; }
        if (d > 100) { this.tailFar += dt; if (this.tailFar > 12) { this.fail('lost'); break; } } else this.tailFar = 0;
        if (this.suspicion >= 100) { this.fail('spotted'); break; }
        if (a.arrived) this.next();
        break;
      }
      case 'chase': {
        const a = this.actor!;
        this.nav = { x: a.x, z: a.z };
        this.markers = [{ x: a.x, z: a.z, kind: 'target' }];
        const d = Math.hypot(a.x - p.x, a.z - p.z);
        if (a.disabled) { sim.removeCar(a); this.actor = null; this.next(); break; }
        if (a.waitFor > 0) break;
        if (this.goal.key !== 'g_chase') { this.goal = { key: 'g_chase', vars: {} }; this.events.push({ type: 'stage', key: 'g_chase', vars: {} }); }
        if (d > 160) { this.escapeT += dt; if (this.escapeT > 8) this.fail('escaped'); } else this.escapeT = 0;
        break;
      }
      case 'escort': {
        const a = this.actor!;
        const to = this.place(st.to);
        this.nav = { x: a.x, z: a.z };
        this.markers = [{ x: to.x, z: to.z, kind: 'drop' }, { x: a.x, z: a.z, kind: 'target' }];
        this.sawDamage = 1 - a.health / a.hp;
        if (a.waitFor > 0) { this.nav = { x: a.x, z: a.z }; break; }
        if (this.escortStars) {
          // it drives off and the police come for it
          sim.copTarget = a;
          sim.forceStars(this.escortStars);
          sim.minStars = this.escortStars;
          this.escortStars = 0;
        }
        if (a.health <= 0 || a.disabled) { this.fail('escort'); break; }
        if (Math.hypot(a.x - to.x, a.z - to.z) < 9) {
          sim.copTarget = sim.player; sim.minStars = 0;
          sim.removeCar(a); this.actor = null;
          sim.loseThem();
          this.events.push({ type: 'deliver', x: to.x, z: to.z, pay: 0 });
          this.next();
        }
        break;
      }
      case 'swap':
        break;
    }
    void dt;
  }

  // ---------------------------------------------------------------- free roam and rush

  private refillPhones(): void {
    const sim = this.sim, p = sim.player;
    while (this.phones.length < (this.mode === 'rush' ? 2 : 3)) this.phones.push(sim.city.spotAway(p.x, p.z, 50, 260, sim.rnd, [...this.phones, ...this.fares]));
    if (this.mode === 'roam' && sim.opt.car === 'taxi') while (this.fares.length < 2) this.fares.push(sim.city.spotAway(p.x, p.z, 40, 220, sim.rnd, [...this.phones, ...this.fares]));
  }

  private sideStep(dt: number): void {
    const sim = this.sim, p = sim.player;
    const places = sim.city.places;
    this.markers = [];
    if (this.side) {
      const s = this.side;
      this.markers.push({ x: s.to.x, z: s.to.z, kind: 'drop' });
      this.nav = { x: s.to.x, z: s.to.z };
      s.time -= dt;
      this.goal = { key: s.kind === 'fare' ? 'g_fare' : 'g_side', vars: { place: s.to.name ? 'pl_' + s.to.name : '' } };
      if (sim.inMarker(s.to.x, s.to.z)) {
        const late = s.time < 0;
        const pay = Math.round(late ? s.pay * 0.4 : s.pay + Math.max(0, s.time) * 4);
        this.cash += pay;
        this.deliveries++;
        this.events.push({ type: 'deliver', x: s.to.x, z: s.to.z, pay });
        if (this.mode === 'rush') { const bonus = Math.round(14 * this.tune.time); this.clock += bonus; this.events.push({ type: 'time', n: bonus }); }
        this.side = null;
        this.refillPhones();
      }
    } else {
      this.nav = null;
      this.goal = { key: this.mode === 'rush' ? 'g_rush' : 'g_roam', vars: {} };
      let best = Infinity;
      for (const ph of this.phones) {
        this.markers.push({ x: ph.x, z: ph.z, kind: 'phone' });
        const d = Math.hypot(ph.x - p.x, ph.z - p.z);
        if (d < best) { best = d; this.nav = { x: ph.x, z: ph.z }; }
        if (sim.inMarker(ph.x, ph.z)) { this.takeJob('delivery', ph); return; }
      }
      for (const f of this.fares) {
        this.markers.push({ x: f.x, z: f.z, kind: 'fare' });
        if (sim.inMarker(f.x, f.z)) { this.takeJob('fare', f); return; }
      }
    }
    if (this.mode === 'roam') {
      const spray = places.get('spray')!, garage = places.get('garage')!;
      this.markers.push({ x: spray.x, z: spray.z, kind: 'spray' }, { x: garage.x, z: garage.z, kind: 'garage' });
      sim.city.ramps.forEach((r, i) => { if (!this.jumpsDone.has(i)) this.markers.push({ x: r.x - Math.sin(r.rot) * (r.len / 2 + 8), z: r.z - Math.cos(r.rot) * (r.len / 2 + 8), kind: 'stunt' }); });
      // the shops work once the car has driven off from where the shift began
      if (!this.armed && Math.hypot(p.x - garage.x, p.z - garage.z) > 20 && Math.hypot(p.x - spray.x, p.z - spray.z) > 20) this.armed = true;
      if (this.armed && sim.inMarker(spray.x, spray.z, 6)) this.spray();
      if (this.armed && sim.inMarker(garage.x, garage.z, 6)) this.garage();
      for (const e of sim.events) if (e.type === 'jump' && e.dist > 12) {
        let near = -1, nd = Infinity;
        sim.city.ramps.forEach((r, i) => { const d = Math.hypot(r.x - p.x, r.z - p.z); if (d < nd) { nd = d; near = i; } });
        if (near >= 0 && nd < 60 && !this.jumpsDone.has(near)) {
          this.jumpsDone.add(near);
          const pay = Math.round(150 + e.dist * 12);
          this.cash += pay;
          this.events.push({ type: 'cash', n: pay, key: 'c_stunt' });
        }
      }
    }
  }

  private takeJob(kind: 'delivery' | 'fare', at: Spot): void {
    const sim = this.sim;
    if (kind === 'delivery') this.phones = this.phones.filter((s) => s !== at); else this.fares = this.fares.filter((s) => s !== at);
    const to = sim.city.spotAway(at.x, at.z, 140, 360, sim.rnd, [at]);
    const route = sim.city.route(at.x, at.z, to.x, to.z);
    const time = Math.round((route.len / 11 + 14) * this.tune.time);
    const pay = Math.round((kind === 'fare' ? 60 : 90) + route.len * (kind === 'fare' ? 0.55 : 0.7));
    this.side = { kind, to, time, pay, from: at };
    this.events.push({ type: 'pickup', x: at.x, z: at.z });
    this.events.push({ type: 'stage', key: kind === 'fare' ? 'g_fare' : 'g_side', vars: { place: to.name ? 'pl_' + to.name : '' } });
  }

  private sprayT = 0;
  private spray(): void {
    const sim = this.sim;
    if (sim.time - this.sprayT < 6) return;
    this.sprayT = sim.time;
    if (sim.stars === 0) { this.events.push({ type: 'warn', key: 'w_noHeat' }); return; }
    if (sim.seen) { this.events.push({ type: 'warn', key: 'w_seen' }); return; }
    sim.coolDown();
    this.cash = Math.max(0, this.cash - 250);
    this.events.push({ type: 'cash', n: -250, key: 'c_spray' });
  }

  private garageT = 0;
  private garage(): void {
    const sim = this.sim, p = sim.player;
    if (sim.time - this.garageT < 6) return;
    this.garageT = sim.time;
    const missing = p.hp - p.health;
    if (missing < 1) { this.events.push({ type: 'warn', key: 'w_noRepair' }); return; }
    const cost = Math.min(this.cash, Math.round(missing * 6));
    const fix = cost / 6;
    p.health = Math.min(p.hp, p.health + fix);
    sim.repair(p, p.health / p.hp);
    this.cash -= cost;
    this.events.push({ type: 'cash', n: -cost, key: 'c_repair' });
  }

  // ---------------------------------------------------------------- getaway

  private getawayStep(dt: number): void {
    const sim = this.sim;
    this.survived += dt;
    const want = clamp(2 + Math.floor(this.survived / 45), 2, 5);
    sim.minStars = want;
    if (sim.stars < want) sim.forceStars(want);
    this.cash = Math.round(this.survived * 10 + sim.stats.takedowns * 150);
    this.nav = null;
    this.markers = [];
  }

  /** The rewarded continue: back in the run (car mended, the heat cooled, a little time). */
  revive(): void {
    const sim = this.sim;
    sim.busted = false; sim.wrecked = false; sim.bust = 0;
    sim.repair(sim.player, 0.6);
    if (this.mode !== 'getaway') sim.coolDown();
    else for (const c of [...sim.cars]) if (c.role === 'cop' && Math.hypot(c.x - sim.player.x, c.z - sim.player.z) < 60) sim.removeCar(c);
    this.over = null;
    if (this.clock !== Infinity && this.clock < 20) this.clock = 20;
    // a lose stage that brought the heat back: the stage starts over
    const st = this.st;
    if (st?.type === 'lose') sim.forceStars(Math.max(1, st.stars - 1));
  }

  /** The sequence position of a story job (for the HUD: "2/4"). */
  get stageLabel(): string { return this.def ? `${Math.min(this.stage + 1, this.def.stages.length)}/${this.def.stages.length}` : ''; }
}

// ------------------------------------------------------------------ the AI of story cars

/** Drives a car along the roads to a spot at a speed (keeping right), stopping at red lights if `lawful`. */
export function routeAi(to: Spot, speed: number, lawful: boolean): (sim: Sim, c: Car, dt: number) => void {
  return (sim, c, dt) => {
    const d = Math.hypot(to.x - c.x, to.z - c.z);
    if (d < 7) { c.arrived = true; sim.removeCar(c); return; }
    const [ax, az] = sim.pathAim(c, to.x, to.z, dt);
    let v = speed;
    if (lawful) {
      const n = sim.city.nearestNode(c.x, c.z);
      const dn = Math.hypot(n.x - c.x, n.z - c.z);
      const ahead = (n.x - c.x) * Math.sin(c.h) + (n.z - c.z) * Math.cos(c.h) > 0;
      if (n.light && ahead && dn < 22 && dn > 9) {
        const horizontal = Math.abs(Math.sin(c.h)) > Math.abs(Math.cos(c.h));
        const st = sim.city.lightState(n.id, sim.time);
        if ((horizontal ? st.ew : st.ns) !== 2) v = 0;
      }
    }
    if (d < 25) v = Math.min(v, 7);
    // a little to the right of the route (its own lane)
    const sh = Math.sin(c.h), ch = Math.cos(c.h);
    sim.driveCar(c, sim.steerTo(c, ax - ch * 1.2, az + sh * 1.2, v, dt), dt);
  };
}

/** Flees: picks far spots away from the player and floors it there. */
export function fleeAi(): (sim: Sim, c: Car, dt: number) => void {
  let goal: Spot | null = null;
  return (sim, c, dt) => {
    const p = sim.player;
    if (!goal || Math.hypot(goal.x - c.x, goal.z - c.z) < 20) {
      // somewhere on the far side from the player
      const ax = c.x + (c.x - p.x), az = c.z + (c.z - p.z);
      goal = sim.city.spotAway(ax, az, 0, 220, sim.rnd);
      c.path = [];
    }
    const [tx, tz] = sim.pathAim(c, goal.x, goal.z, dt);
    sim.driveCar(c, sim.steerTo(c, tx, tz, 40, dt), dt);
  };
}

