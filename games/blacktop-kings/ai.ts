// The computer players: the rival crew, the human's two teammates, both teams behind the menu,
// and (through bot.ts) the balance bots. One function decides what an AI player wants this step;
// the simulation then applies it exactly like a person's input.
//
//   - Ball handler: takes the ball back behind the arc when it must, drives an open lane for a
//     dunk, shoots when open, passes to the open teammate, crosses over a close defender, and
//     always gets a shot up before the shot clock runs out.
//   - Off the ball: spreads to spots round the arc, cuts to the rim now and then, sets screens on
//     the ball handler's defender and crashes the boards on a shot.
//   - Defence: man to man (slot against slot), between the man and the hoop; reaches for steals,
//     jumps to contest shots and dunks, boxes out on the rebound.
import { DUNK_R, HOOP_X, HOOP_Z, SPOTS, TIP_SPOTS, hoopDist, isThree, outsideSpot } from './court';
import { PEAK, idle, type Game, type Intent, type Player } from './sim';

export interface AiLevel {
  /** Running speed (× the base). */
  speed: number;
  /** Seconds between the ball handler's decisions and before a defender reacts. */
  react: number;
  /** Spread of the shot release around the top of the jump (s). */
  sigma: number;
  /** Shooting odds (× the base). */
  aim: number;
  /** Steal and interception keenness (× the base). */
  steal: number;
  /** Block success (× the base). */
  block: number;
  /** Gap kept to the ball handler (m). */
  gap: number;
  /** How readily the handler passes, drives, shoots threes and crosses over (0..1). */
  pass: number;
  drive: number;
  three: number;
  cross: number;
  /** Chance a crossover does not floor this player (× the base stumble chance). */
  balance: number;
}

/** The rival crews, easiest first; Easy stops at the third and slows every value (see TUNING). */
export const LEVELS: AiLevel[] = [
  { speed: 0.84, react: 0.42, sigma: 0.13, aim: 0.86, steal: 0.45, block: 0.45, gap: 1.75, pass: 0.45, drive: 0.35, three: 0.3, cross: 0.15, balance: 1.15 },
  { speed: 0.88, react: 0.36, sigma: 0.11, aim: 0.9, steal: 0.58, block: 0.55, gap: 1.6, pass: 0.5, drive: 0.45, three: 0.35, cross: 0.2, balance: 1.05 },
  { speed: 0.92, react: 0.3, sigma: 0.09, aim: 0.94, steal: 0.7, block: 0.65, gap: 1.45, pass: 0.55, drive: 0.55, three: 0.4, cross: 0.25, balance: 0.95 },
  { speed: 0.96, react: 0.25, sigma: 0.075, aim: 0.98, steal: 0.82, block: 0.75, gap: 1.3, pass: 0.6, drive: 0.6, three: 0.45, cross: 0.3, balance: 0.85 },
  { speed: 0.99, react: 0.21, sigma: 0.06, aim: 1.0, steal: 0.92, block: 0.85, gap: 1.2, pass: 0.6, drive: 0.65, three: 0.5, cross: 0.35, balance: 0.75 },
  { speed: 1.02, react: 0.18, sigma: 0.05, aim: 1.03, steal: 1.0, block: 0.95, gap: 1.1, pass: 0.65, drive: 0.7, three: 0.55, cross: 0.4, balance: 0.65 },
];

/** The human's teammates: helpful, not stars. */
export const MATES: AiLevel = { speed: 0.95, react: 0.26, sigma: 0.08, aim: 0.96, steal: 0.7, block: 0.7, gap: 1.35, pass: 0.55, drive: 0.5, three: 0.4, cross: 0.25, balance: 0.9 };

/** Easy: a softer copy of a level (slower, later, wilder shots, fewer steals and blocks). */
export function easier(l: AiLevel): AiLevel {
  return {
    ...l, speed: l.speed * 0.9, react: l.react * 1.45, sigma: l.sigma * 1.4, aim: l.aim * 0.9, steal: l.steal * 0.55,
    block: l.block * 0.55, gap: l.gap + 0.35, cross: l.cross * 0.6, balance: l.balance * 1.25,
  };
}

const gauss = (r: () => number) => {
  const u = Math.max(1e-6, r()), v = r();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
};

function toward(it: Intent, p: Player, x: number, z: number, slow = 0.35): Intent {
  const dx = x - p.x, dz = z - p.z, d = Math.hypot(dx, dz);
  if (d < slow) { it.mx = 0; it.mz = 0; return it; }
  const k = Math.min(1, d / 1.2);
  it.mx = (dx / d) * k; it.mz = (dz / d) * k;
  return it;
}

/** No defender closer than `clear` to the line from the player to the rim. */
export function laneOpen(g: Game, p: Player, clear = 1.05): boolean {
  const ax = p.x, az = p.z, bx = HOOP_X - 0.4, bz = HOOP_Z;
  const lx = bx - ax, lz = bz - az, l2 = lx * lx + lz * lz || 1;
  for (const q of g.p) {
    if (q.team === p.team) continue;
    const t = Math.max(0, Math.min(1, ((q.x - ax) * lx + (q.z - az) * lz) / l2));
    const d = Math.hypot(ax + lx * t - q.x, az + lz * t - q.z);
    if (d < clear) return false;
  }
  return true;
}

export function aiIntent(g: Game, p: Player, lv: AiLevel, dt: number): Intent {
  const it = idle();
  const b = g.ball;
  if (g.phase === 'tip') return tipAi(g, p, lv, it);
  if (p.act === 'shot') { it.release = -1; return it; }
  const own = b.state === 'held' && b.holder >= 0 ? g.p[b.holder].team : b.state === 'pass' ? b.lastTeam : -1;
  if (b.state === 'held' && b.holder === p.id) return handler(g, p, lv, it, dt);
  if (b.state === 'pass' && b.receiver === p.id) {
    // run to where the pass will arrive
    return toward(it, p, b.x1, b.z1, 0.1);
  }
  if (b.state === 'loose' || b.state === 'shot' || b.state === 'rattle' || b.state === 'dead') return looseBall(g, p, lv, it);
  if (own === p.team) return offBall(g, p, lv, it, dt);
  return defend(g, p, lv, it, dt);
}

function tipAi(g: Game, p: Player, lv: AiLevel, it: Intent): Intent {
  const b = g.ball;
  if (p.slot !== 0) return it;
  if (b.vy > 0 && p.aiJumpAt < 0) p.aiJumpAt = g.t + 0.2 + lv.react * 0.6 + g.rnd() * 0.35;
  if (p.aiJumpAt > 0 && g.t >= p.aiJumpAt && p.act === 'free') { it.jump = true; p.aiJumpAt = -1; }
  const s = TIP_SPOTS[p.team][p.slot];
  return toward(it, p, s.x, s.z);
}

// ------------------------------------------------------------------ with the ball

function handler(g: Game, p: Player, lv: AiLevel, it: Intent, dt: number): Intent {
  const r = g.rnd;
  p.aiT -= dt;
  const d = hoopDist(p.x, p.z);
  const open = g.openness(p);
  if (!g.cleared) {
    // take it back behind the arc first, quickly if someone is close
    const s = outsideSpot(p.x, p.z, 1.1);
    p.aiGoalX = s.x; p.aiGoalZ = s.z; p.aiMode = 0;
    it.turbo = open < 2 && p.stamina > 30;
    if (open < 1.1 && p.stamina > 40 && r() < lv.cross * dt * 3) it.cross = true;
    else if (open < 1.0 && r() < lv.pass * dt * 1.5) it.pass = bestReceiver(g, p);
    return toward(it, p, s.x, s.z, 0.2);
  }
  if (p.aiT <= 0) {
    p.aiT = lv.react * (0.7 + r() * 0.6);
    const lane = laneOpen(g, p);
    const late = g.shotClock < 2.6;
    const range = d < 7.6;
    if (d < DUNK_R && (lane || open > 1.0 || late)) { it.shoot = true; it.hold = -1; }
    else if (late) shootNow(g, p, lv, it);
    else if (lane && d < 7.5 && r() < lv.drive) { p.aiMode = 1; p.aiGoalX = HOOP_X - 1.2; p.aiGoalZ = HOOP_Z + (p.z - HOOP_Z) * 0.15; }
    else if (open > 2.1 && range && (isThree(p.x, p.z) ? r() < lv.three + 0.15 : r() < 0.7)) shootNow(g, p, lv, it);
    else if (open < 1.3 && p.stamina > 35 && r() < lv.cross) it.cross = true;
    else if (r() < lv.pass) {
      const to = bestReceiver(g, p);
      if (to >= 0 && g.openness(g.p[to]) > open + 0.3) it.pass = to;
    }
    if (it.pass < -1 && !it.shoot && !it.cross && p.aiMode !== 1) {
      // probe: a spot near the arc or the elbow
      const s = SPOTS[Math.floor(r() * SPOTS.length)];
      p.aiGoalX = s.x; p.aiGoalZ = s.z; p.aiMode = 2;
    }
    if (it.shoot && it.hold < 0 && d >= DUNK_R) it.hold = PEAK + gauss(r) * lv.sigma;
    if (it.shoot || it.pass > -2 || it.cross) return it;
  }
  if (p.aiMode === 1) {
    it.turbo = p.stamina > 15;
    if (d < DUNK_R * 0.95) { it.shoot = true; it.hold = -1; return it; }
    if (!laneOpen(g, p, 0.7) && r() < dt * 3) p.aiMode = 2;
  }
  return toward(it, p, p.aiGoalX, p.aiGoalZ, 0.3);
}

function shootNow(g: Game, p: Player, lv: AiLevel, it: Intent): void {
  it.shoot = true;
  it.hold = hoopDist(p.x, p.z) < DUNK_R ? -1 : PEAK + gauss(g.rnd) * lv.sigma;
}

/** The teammate most worth passing to (open, not too far from the hoop), or -1. */
export function bestReceiver(g: Game, p: Player): number {
  let best = -1, bs = -1e9;
  for (const q of g.p) {
    if (q.team !== p.team || q.id === p.id) continue;
    const s = Math.min(3.5, g.openness(q)) * 1.2 - Math.max(0, hoopDist(q.x, q.z) - 7.5) * 0.6 - Math.hypot(q.x - p.x, q.z - p.z) * 0.08;
    if (s > bs) { bs = s; best = q.id; }
  }
  return best;
}

// ------------------------------------------------------------------ off the ball

function offBall(g: Game, p: Player, lv: AiLevel, it: Intent, dt: number): Intent {
  const r = g.rnd;
  const h = g.holder();
  p.aiSpotT -= dt;
  if (p.aiSpotT <= 0 || p.aiSpot < 0) {
    p.aiSpotT = 2.2 + r() * 2.2;
    const roll = r();
    if (h && g.cleared && roll < 0.18) p.aiMode = 3;               // cut to the rim
    else if (h && roll < 0.33) p.aiMode = 4;                       // set a screen
    else p.aiMode = 0;
    // a free spot away from the ball and from teammates
    let best = 0, bs = -1e9;
    for (let i = 0; i < SPOTS.length; i++) {
      const s = SPOTS[i];
      let score = r() * 1.5 + (s.three ? 0.8 : 0);
      for (const q of g.p) {
        if (q.team !== p.team || q.id === p.id) continue;
        const dq = Math.hypot(q.x - s.x, q.z - s.z);
        score -= Math.max(0, 4 - dq) * (q.id === h?.id ? 1.2 : 0.8);
        if (q.aiSpot === i && q.id !== h?.id) score -= 5;
      }
      if (score > bs) { bs = score; best = i; }
    }
    p.aiSpot = best;
  }
  let gx = SPOTS[p.aiSpot].x, gz = SPOTS[p.aiSpot].z;
  if (p.aiMode === 3) { gx = HOOP_X - 1.1; gz = HOOP_Z + Math.sign(p.z || 1) * 0.9; it.turbo = p.stamina > 40; }
  else if (p.aiMode === 4 && h) {
    // stand next to the handler's defender, on the hoop side
    const d = g.p.find((q) => q.team !== p.team && q.slot === h.slot);
    if (d) {
      const sx = d.x - h.x, sz = d.z - h.z, sl = Math.hypot(sx, sz) || 1;
      gx = d.x + (sz / sl) * 0.65; gz = d.z - (sx / sl) * 0.65;
    }
  }
  if (h) it.face = Math.atan2(h.x - p.x, h.z - p.z);
  return toward(it, p, gx, gz, 0.3);
}

// ------------------------------------------------------------------ defence

function defend(g: Game, p: Player, lv: AiLevel, it: Intent, dt: number): Intent {
  const r = g.rnd;
  const man = g.p.find((q) => q.team !== p.team && q.slot === p.slot)!;
  const h = g.holder();
  const onBall = h?.id === man.id;
  const mx = HOOP_X - man.x, mz = HOOP_Z - man.z, ml = Math.hypot(mx, mz) || 1;
  // further off the ball, closer to the hoop the nearer the man is to it
  const gap = onBall ? lv.gap * (g.cleared ? 1 : 1.6) : lv.gap + 1.1;
  const gx = man.x + (mx / ml) * Math.min(gap, ml * 0.6), gz = man.z + (mz / ml) * Math.min(gap, ml * 0.6);
  toward(it, p, gx, gz, 0.15);
  const far = Math.hypot(gx - p.x, gz - p.z);
  it.turbo = far > 2.5 && p.stamina > 25;
  it.face = Math.atan2(man.x - p.x, man.z - p.z);
  const dm = Math.hypot(man.x - p.x, man.z - p.z);
  if (onBall && h) {
    if (dm < 1.35 && p.stealCd <= 0 && r() < lv.steal * dt * 0.9) it.steal = true;
    if ((h.act === 'shot' && dm < 2.1) || (h.act === 'dunk' && dm < 2.6)) scheduleJump(g, p, lv, h.act === 'dunk' ? 0.12 : 0.18);
  } else if (h && (h.act === 'dunk' || h.act === 'shot')) {
    // help on a drive: the defender nearest the rim jumps at the dunk
    const dh = Math.hypot(h.x - p.x, h.z - p.z);
    if (dh < 1.8) scheduleJump(g, p, lv, 0.1);
  }
  if (p.aiJumpAt > 0 && g.t >= p.aiJumpAt) { it.jump = true; p.aiJumpAt = -1; }
  return it;
}

function scheduleJump(g: Game, p: Player, lv: AiLevel, base: number): void {
  if (p.aiJumpAt > 0 || p.act !== 'free') return;
  if (g.rnd() > Math.min(0.92, 0.45 + lv.block * 0.45)) { p.aiJumpAt = g.t + 9; return; } // caught flat-footed this time
  p.aiJumpAt = g.t + base + lv.react * 0.5 + (g.rnd() - 0.5) * 0.12;
}

// ------------------------------------------------------------------ rebounds and the ball after a basket

function looseBall(g: Game, p: Player, lv: AiLevel, it: Intent): Intent {
  const b = g.ball;
  if (p.aiJumpAt > g.t + 5) p.aiJumpAt = -1;
  if (b.inTeam >= 0 || b.state === 'dead') {
    const team = b.inTeam >= 0 ? b.inTeam : 1 - b.lastTeam;
    if (p.team === team) {
      if (g.inbounder(team) === p.id) { it.turbo = true; return toward(it, p, b.x, b.z, 0.05); }
      const s = SPOTS[p.slot === 1 ? 1 : 2];
      return toward(it, p, s.x - 1.2, s.z);
    }
    // the scoring team gets back on defence
    const man = g.p.find((q) => q.team !== p.team && q.slot === p.slot)!;
    return toward(it, p, (man.x + HOOP_X) / 2, man.z * 0.6);
  }
  // where the ball will come down
  let lx = b.x, lz = b.z;
  if (b.state === 'shot') { lx = HOOP_X - 0.9; lz = HOOP_Z + (b.z0 - HOOP_Z) * 0.25; }
  else if (b.vy > -6) {
    const tt = Math.max(0, (b.vy + Math.sqrt(Math.max(0, b.vy * b.vy + 2 * 11 * Math.max(0, b.y - 1.6)))) / 11);
    lx = b.x + b.vx * tt; lz = b.z + b.vz * tt;
  }
  // the two nearest of each team crash, the third stays back
  const mates = g.p.filter((q) => q.team === p.team).sort((a, c) => Math.hypot(a.x - lx, a.z - lz) - Math.hypot(c.x - lx, c.z - lz));
  if (mates.indexOf(p) < 2 || b.state === 'loose') {
    it.turbo = p.stamina > 20;
    toward(it, p, lx, lz, 0.05);
    const d = Math.hypot(b.x - p.x, b.z - p.z);
    if (b.state === 'loose' && d < 1.1 && b.y > 2.0 && b.y < 3.3 && b.vy < 1 && p.act === 'free' && g.rnd() < 0.5 + lv.block * 0.3) it.jump = true;
    return it;
  }
  const s = SPOTS[0];
  return toward(it, p, s.x + 1, s.z + (p.slot - 1) * 2);
}
