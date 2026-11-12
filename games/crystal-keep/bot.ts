// A simple tower-defense autopilot on the pure simulation: builds where a tower covers the most
// route, mixes tower kinds (anti-air before flying waves), upgrades the busiest towers and starts
// waves; drafts power cards with a simple score and uses the equipped powers. Used by the headless
// balance check, the menu's live battle and the in-game test hook (`testAuto`).
import { Sim, TOWERS, ENEMIES, METEOR, parseWave, type TowerKind, type Tower, type CardId, type Enemy } from './sim';
import { rollDraft } from './cards';

interface Spot { c: number; r: number; ground: number; air: number }

export class Bot {
  private spots: Spot[] = [];
  private thinkT = 0;
  /** What the bot did last (the test hook shows it). */
  last = '';

  constructor(private sim: Sim, private opts: { early?: boolean; meteor?: boolean; powers?: boolean; drafts?: boolean } = {}) {
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

  /** How much a card is worth to this build right now (higher is better). */
  cardValue(id: CardId): number {
    const s = this.sim;
    const n = (k: TowerKind) => s.towers.filter((t) => t.kind === k).reduce((a, t) => a + 1 + t.tier, 0);
    const early = s.wave < s.totalWaves * 0.6;
    const hurt = 1 - s.lives / s.maxLives;
    const v: Record<CardId, number> = {
      ballistaMastery: 1.2 * n('ballista'), siegeEngineer: 1.1 * (n('cannon') + n('catapult')), overclock: 1.5 * n('turret'),
      eagleEye: 1 + s.towers.length * 0.7, goldRush: early ? 6 : 2, goldRain: 4.5, salvage: 1, interest: early ? 5 : 1.5,
      cheapMasonry: early ? 6.5 : 2, crystalShield: 3 + hurt * 10, regeneration: 2 + hurt * 5, frostAura: 4.5, thorns: 3.5,
      weakeningCurse: 5, quickRecharge: 2 + s.powers.length * 1.5, deepFreeze: 4, overcharge: 4.5, veterans: 4, goldenTouch: 3,
      meteorStorm: 6, chainReaction: 8, criticalStrikes: 8, armourPiercer: 3 + (n('ballista') + n('turret')) * 0.8,
    };
    return v[id];
  }

  /** A draft: rolls the offer, rerolls a weak one, takes the best card. */
  draft(): void {
    const s = this.sim;
    let offer = rollDraft(s);
    let rerolls = s.talents.rerolls;
    const best = (o: CardId[]) => o.reduce((a, b) => (this.cardValue(b) > this.cardValue(a) ? b : a), o[0]);
    while (rerolls > 0 && offer.length && this.cardValue(best(offer)) < 5) { offer = rollDraft(s); rerolls--; }
    if (!offer.length) { s.drafts = Math.max(0, s.drafts - 1); return; }
    const pick = best(offer);
    s.pickCard(pick);
    this.picks.push(pick);
    this.last = 'card ' + pick;
  }
  /** Cards the bot took (the balance report lists them). */
  picks: CardId[] = [];

  /** The crowd around an enemy (for the area powers), weighted by how far along it is. */
  private crowd(e: Enemy, r: number): number {
    let v = 0;
    for (const o of this.sim.enemies) if (o.alive && Math.hypot(o.x - e.x, o.z - e.z) < r) v += 1 + (o.d / o.route.len);
    return v;
  }

  private powers(): void {
    const s = this.sim;
    const alive = s.enemies.filter((e) => e.alive);
    if (!alive.length) return;
    const front = alive.reduce((a, b) => (b.d / b.route.len > a.d / a.route.len ? b : a));
    const boss = alive.find((e) => ENEMIES[e.kind].boss && e.d / e.route.len > 0.4);
    if (s.powerReady('frost')) {
      let best: Enemy | null = null, bestV = 0;
      for (const e of alive) {
        const v = this.crowd(e, s.powerRadius('frost')) * (e.d / e.route.len > 0.45 ? 1.3 : 0.7) + (ENEMIES[e.kind].boss && e.d / e.route.len > 0.6 ? 6 : 0);
        if (v > bestV) { bestV = v; best = e; }
      }
      if (best && bestV >= 7) { s.castPower('frost', best.x, best.z); this.last = 'frost'; }
    }
    if (s.powerReady('lightning') && (alive.length >= 5 || boss || front.d / front.route.len > 0.75)) { s.castPower('lightning'); this.last = 'lightning'; }
    if (s.powerReady('knights')) {
      const near = alive.filter((e) => !ENEMIES[e.kind].flying && e.d / e.route.len > 0.55).length;
      if (near >= 4 || (front.d / front.route.len > 0.82 && !ENEMIES[front.kind].flying)) { s.castPower('knights'); this.last = 'knights'; }
    }
  }

  /** Call every frame with the simulated time step. */
  update(dt: number): void {
    const s = this.sim;
    if (s.over) return;
    if (s.drafts > 0 && this.opts.drafts !== false) this.draft();
    this.thinkT -= dt;
    if (this.thinkT > 0) return;
    this.thinkT = 0.4;
    if (this.opts.meteor !== false) this.meteor();
    if (this.opts.powers !== false) this.powers();
    const kind = this.pickKind();
    const want = 3 + s.wave * 0.45;
    const up = this.bestUpgrade();
    const buildFirst = s.towers.length < want || !up;
    if (buildFirst) {
      const sp = this.bestSpot(kind);
      if (sp && s.gold >= s.buildCost(kind)) {
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
