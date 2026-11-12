// A simple tower-defense autopilot on the pure simulation: builds where a tower covers the most
// route, mixes tower kinds (anti-air before flying waves), upgrades the busiest towers and starts
// waves. Used by the headless balance check and by the in-game test hook (`testAuto`).
import { Sim, TOWERS, ENEMIES, METEOR, parseWave, type TowerKind, type Tower } from './sim';

interface Spot { c: number; r: number; ground: number; air: number }

export class Bot {
  private spots: Spot[] = [];
  private thinkT = 0;
  /** What the bot did last (the test hook shows it). */
  last = '';

  constructor(private sim: Sim, private opts: { early?: boolean; meteor?: boolean } = {}) {
    const m = sim.map;
    const samples = (routes: typeof m.routes) => {
      const pts: { x: number; z: number }[] = [];
      for (const r of routes) for (let d = 0; d < r.len; d += 0.25) { const p = r.at(d); pts.push({ x: p.x, z: p.z }); }
      return pts;
    };
    const g = samples(m.routes), a = samples(m.airRoutes);
    for (let r = 0; r < m.H; r++) for (let c = 0; c < m.W; c++) {
      if (!m.buildable(c, r)) continue;
      const x = c - (m.W - 1) / 2, z = r - (m.H - 1) / 2;
      const count = (pts: typeof g, R: number) => pts.filter((p) => (p.x - x) ** 2 + (p.z - z) ** 2 <= R * R).length;
      this.spots.push({ c, r, ground: count(g, 2.6), air: count(a, 2.4) });
    }
  }

  private upcomingAir(): boolean {
    const s = this.sim;
    for (let w = s.wave; w <= Math.min(s.totalWaves, s.wave + 2); w++) {
      const def = s.map.def.waves[w - 1];
      if (def && parseWave(def).some((g) => ENEMIES[g.kind].flying)) return true;
    }
    return false;
  }

  private pickKind(): TowerKind {
    const s = this.sim;
    const n = (k: TowerKind) => s.towers.filter((t) => t.kind === k).length;
    const air = n('ballista') + n('turret') * 1.6;
    if (this.upcomingAir() && air < 2 + s.wave * 0.35) return n('turret') <= n('ballista') ? 'turret' : 'ballista';
    if (n('ballista') === 0) return 'ballista';
    if (n('cannon') < Math.ceil(n('ballista') * 0.8)) return 'cannon';
    if (s.wave >= 4 && n('catapult') < Math.floor(s.towers.length / 4)) return 'catapult';
    return 'ballista';
  }

  private bestSpot(kind: TowerKind): Spot | null {
    let best: Spot | null = null, bestV = -1;
    const air = kind === 'turret';
    for (const sp of this.spots) {
      if (!this.sim.canBuild(sp.c, sp.r)) continue;
      const v = air ? sp.air * 2 + sp.ground : sp.ground + (TOWERS[kind].air ? sp.air * 0.3 : 0);
      if (v > bestV) { bestV = v; best = sp; }
    }
    return best;
  }

  private bestUpgrade(): Tower | null {
    let best: Tower | null = null, bestV = -1;
    for (const t of this.sim.towers) {
      const cost = this.sim.upgradeCost(t);
      if (cost === null) continue;
      const sp = this.spots.find((p) => p.c === t.c && p.r === t.r);
      const v = (sp ? sp.ground + sp.air : 1) / (t.tier + 1);
      if (v > bestV) { bestV = v; best = t; }
    }
    return best;
  }

  /** Drops the meteor on the thickest crowd (or a boss half way down the path). */
  private meteor(): void {
    const s = this.sim;
    if (!s.meteorReady()) return;
    let best: { x: number; z: number } | null = null, bestV = 0;
    for (const e of s.enemies) {
      if (!e.alive) continue;
      const k = e.d / e.route.len;
      let v = ENEMIES[e.kind].boss && k > 0.45 ? 6 : 0;
      for (const o of s.enemies) if (o.alive && Math.hypot(o.x - e.x, o.z - e.z) < METEOR.radius * 0.8) v += 1 + (o.d / o.route.len);
      if (v > bestV) { bestV = v; best = s.predict(e, METEOR.fall); }
    }
    if (best && bestV >= 6) { s.castMeteor(best.x, best.z); this.last = 'meteor'; }
  }

  /** Call every frame with the simulated time step. */
  update(dt: number): void {
    const s = this.sim;
    if (s.over) return;
    this.thinkT -= dt;
    if (this.thinkT > 0) return;
    this.thinkT = 0.4;
    if (this.opts.meteor !== false) this.meteor();
    const kind = this.pickKind();
    const want = 3 + s.wave * 0.45;
    const up = this.bestUpgrade();
    const buildFirst = s.towers.length < want || !up;
    if (buildFirst) {
      const sp = this.bestSpot(kind);
      if (sp && s.gold >= TOWERS[kind].tiers[0].cost) {
        s.build(kind, sp.c, sp.r);
        this.last = `build ${kind} ${sp.c},${sp.r}`;
      }
    } else if (up && s.gold >= (s.upgradeCost(up) ?? 1e9)) {
      s.upgrade(up);
      this.last = `upgrade ${up.kind} → ${up.tier + 1}`;
    }
    if (s.wave === 0 && s.towers.length >= 2 && s.gold < 70) s.callWave();
    if (this.opts.early && s.countdown > 0 && s.countdown < s.tune.countdown - 4 && s.gold < 60) s.callWave();
  }
}
