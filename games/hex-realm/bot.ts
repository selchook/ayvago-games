// Hex Realm: the autopilot. In battle it plays like a player of a given skill: it closes in (or
// keeps its distance with a bow or a staff), swings its combo, steps out of the red zones and rolls
// through blows when it sees them (late and not always, when casual), uses its skills and drinks
// potions. On the map it follows the tracked quest, rests and shops at the village when hurt,
// equips what is better, spends talent points and fights camps when it is behind in level.
// Used for the menu's live backdrop, the store art's stage and the headless balance (balance.ts).
import { CLASS, PLACE_LEVEL, TALENT_IDS, TALENT_MAX, SLOTS, type TalentId } from './defs';
import { NO_INPUT, faceOf, makeRng, type Battle, type Input } from './battle';
import { CAMPS, PLACE_HEX, START, hexDist } from './hexmap';
import type { Campaign } from './campaign';
import { itemScore } from './campaign';

export interface Skill {
  /** Seconds before it reacts to a new warning. */
  react: number;
  /** Chance it gets out of a warning at all. */
  dodge: number;
  /** Chance per second it uses a ready skill when it makes sense. */
  skills: number;
  /** Health fraction under which it drinks. */
  potion: number;
  /** How well it keeps its distance with a ranged class (0–1). */
  kite: number;
  /** Levels it wants over a place before going in. */
  margin: number;
}

export const SKILL: Record<'casual' | 'good', Skill> = {
  casual: { react: 0.42, dodge: 0.6, skills: 0.5, potion: 0.3, kite: 0.4, margin: 1 },
  good: { react: 0.14, dodge: 0.93, skills: 2, potion: 0.42, kite: 0.9, margin: 0 },
};

export class BattleBot {
  private rng: () => number;
  private seen = new Map<number, number>();
  private escaping = 0;
  private escDir = 0;
  private atkHold = 0;
  constructor(private b: Battle, private sk: Skill, seed: number) { this.rng = makeRng(seed * 31 + 7); }

  input(dt: number): Input {
    const b = this.b, h = b.hero;
    if (h.state === 'dead' || b.over) return NO_INPUT;
    const inp: Input = { ...NO_INPUT };
    const cls = CLASS[h === b.hero ? b.st.cls : b.st.cls];
    // danger: warnings that cover the hero
    let danger: { x: number; z: number; left: number } | null = null;
    for (const z of b.zones) {
      if (z.side !== 'foe' || z.done) continue;
      if (!this.seen.has(z.id)) this.seen.set(z.id, b.time + this.sk.react * (0.6 + this.rng() * 0.8) + (this.rng() > this.sk.dodge ? 99 : 0));
      if (b.time < this.seen.get(z.id)!) continue;
      const dx = h.x - z.x, dz = h.z - z.z;
      let inside = false;
      if (z.shape === 'circle') inside = Math.hypot(dx, dz) < z.r + 0.6;
      else if (z.shape === 'ring') { const d = Math.hypot(dx, dz); inside = d < z.r + 0.5 && d > z.a - 0.5; }
      else if (z.shape === 'cone') inside = Math.hypot(dx, dz) < z.r + 0.6;
      else { const ux = Math.sin(z.ang), uz = Math.cos(z.ang); const along = dx * ux + dz * uz; inside = along > -0.6 && along < z.len + 0.6 && Math.abs(dx * uz - dz * ux) < z.a / 2 + 0.7; }
      if (inside && (!danger || z.delay < danger.left)) danger = { x: z.shape === 'line' ? h.x - Math.cos(z.ang) : z.x, z: z.shape === 'line' ? h.z + Math.sin(z.ang) : z.z, left: z.delay };
    }
    for (const s of b.shots) {
      if (s.side !== 'foe') continue;
      const dx = h.x - s.x, dz = h.z - s.z, d = Math.hypot(dx, dz);
      if (d < 3 && (dx * s.vx + dz * s.vz) > 0 && this.rng() < this.sk.dodge * dt * 8) danger = { x: s.x, z: s.z, left: d / Math.hypot(s.vx, s.vz) };
    }
    if (danger) {
      const away = faceOf(h.x - danger.x, h.z - danger.z);
      if (this.escaping <= 0) { this.escaping = 0.5; this.escDir = away + (this.rng() - 0.5) * 0.6; }
      inp.mx = Math.sin(this.escDir); inp.mz = Math.cos(this.escDir);
      if (danger.left < 0.4 && h.dodgeCd <= 0) inp.dodge = true;
    }
    this.escaping -= dt;
    // potion
    if (h.hp < b.st.maxHp * this.sk.potion && h.potions > 0) inp.potion = true;
    // the nearest foe
    let best = null as null | (typeof b.foes)[number], bd = Infinity;
    for (const f of b.foes) {
      if (f.state === 'dead' || f.state === 'spawn') continue;
      const d = Math.hypot(f.x - h.x, f.z - h.z);
      if (d < bd) { bd = d; best = f; }
    }
    if (!best) {
      // pick up the drops, step on the shrine
      const t = b.shrine ?? b.drops[0];
      if (t && !danger) { const dx = t.x - h.x, dz = t.z - h.z, d = Math.hypot(dx, dz); if (d > 0.3) { inp.mx = dx / d; inp.mz = dz / d; } }
      return inp;
    }
    const dx = best.x - h.x, dz = best.z - h.z;
    if (!danger) {
      if (cls.ranged) {
        const want = 6;
        if (bd > want + 1.5) { inp.mx = dx / bd; inp.mz = dz / bd; }
        else if (bd < want - 2 && this.rng() < this.sk.kite) { inp.mx = -dx / bd; inp.mz = -dz / bd; }
        if (bd < 11) { this.atkHold -= dt; if (this.atkHold <= 0) { inp.attack = true; this.atkHold = 0.12; } }
      } else {
        if (bd > best.radius + 1.2) { inp.mx = dx / bd; inp.mz = dz / bd; }
        if (bd < best.radius + 2.2) { this.atkHold -= dt; if (this.atkHold <= 0) { inp.attack = true; this.atkHold = 0.1; } }
      }
      // the shrine, when it is close
      if (b.shrine && Math.hypot(b.shrine.x - h.x, b.shrine.z - h.z) < 4) { const sx = b.shrine.x - h.x, sz = b.shrine.z - h.z, sd = Math.hypot(sx, sz); inp.mx = sx / sd; inp.mz = sz / sd; }
    }
    // skills
    const near = b.foes.filter((f) => f.state !== 'dead' && Math.hypot(f.x - h.x, f.z - h.z) < 6).length;
    const roll = this.rng() < this.sk.skills * dt;
    if (roll && h.skillCd[0] <= 0 && (near >= 1 || bd < 8)) inp.skill1 = true;
    else if (roll && h.skillCd[1] <= 0) {
      const id = cls.skills[1].id;
      const ok = id === 'heal' ? h.hp < b.st.maxHp * 0.7 : id === 'smoke' ? near >= 2 || h.hp < b.st.maxHp * 0.5 : near >= 2 || best.boss;
      if (ok) inp.skill2 = true;
    }
    return inp;
  }
}

/** The campaign's autopilot: where to go next and what to do in the village. */
export class MapBot {
  constructor(private c: Campaign, private sk: Skill) {}

  /** The village: rest, equip the best, spend points, buy potions, upgrade the weapon. */
  village(): void {
    const c = this.c;
    c.rest();
    for (const it of [...c.s.bag].sort((a, b) => itemScore(b) - itemScore(a))) if (c.better(it)) c.equip(it.id);
    for (const it of [...c.s.bag]) if (!c.better(it)) c.sell(it.id);
    this.talents();
    while (c.s.potions < c.s.potionMax && c.buyPotion()) { /* buy */ }
    if (c.beltPrice() !== null && c.s.gold > (c.beltPrice() ?? 0) + 120) c.buyBelt();
    for (const slot of SLOTS) while (c.s.gold > 150 && c.upgrade(slot)) { /* upgrade */ }
    c.s.market.forEach((it, i) => { if (c.better(it) && c.s.gold >= c.marketPrice(it) + 40) { c.buy(i); c.equip(it.id); } });
  }

  talents(): void {
    const c = this.c;
    const order: TalentId[] = ['might', 'vigor', 'skill1', 'focus', 'precision', 'skill2', 'potion', 'fortune'];
    while (c.s.points > 0) {
      const t = order.find((id) => c.s.talents[id] < TALENT_MAX[id]) ?? TALENT_IDS[0];
      if (!c.spendTalent(t)) break;
    }
  }

  /** The hex to head for. */
  goal(): [number, number] {
    const c = this.c, s = c.s;
    const [pc, pr] = s.pos;
    const hurt = s.hp < c.maxHp * 0.5 || (s.potions === 0 && s.gold >= 25);
    if (hurt && hexDist(pc, pr, START[0], START[1]) > 0) return START;
    const target = c.trackedHex();
    const q = c.tracked();
    const place = q ? (q === 'tower' && !s.staff ? 'fort' : ({ farm: 'farm', mine: 'mine', staff: 'fort', tower: 'tower', port: 'port', castle: 'castle' } as const)[q]) : 'castle';
    const need = PLACE_LEVEL[place] + this.sk.margin + s.cycle * 9;
    if (s.level < need - 1) {
      // too weak: a camp on this side of the river, else wild hexes near the village
      const camp = CAMPS.find((cp) => !s.camps.includes(cp.id) && cp.level <= s.level + 1 && (c.bridgeOpen() || cp.hex[1] > 4));
      if (camp) return camp.hex;
      const wild = c.map.hexes.filter((h) => c.canPass(h) && !h.place && !h.road && h.r > 8 && ['forest', 'hill'].includes(h.terrain));
      const pick = wild[(s.steps * 7 + s.battles * 3) % wild.length];
      if (pick) return [pick.c, pick.r];
    }
    return target ?? PLACE_HEX.village;
  }
}
