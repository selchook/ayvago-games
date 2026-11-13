// Team kits, the sky colour and the game-state → figure-state mapping shared by the menu's
// attract game and the Play scene.
import type { Game, Player } from './sim';
import type { FigState } from './players';
import type { Kit } from './players';

export const SKY_FOG = 0xf0c8a4;

/** Kits: 0 = the player's crew (orange), the rest the rival crews in ladder order, then online blue. */
export const KITS: Kit[] = [
  { shirt: 0xff7a1a, shorts: 0x2b2f4a, trim: 0xffb347 },
  { shirt: 0x2f7fe0, shorts: 0xf2f2f2, trim: 0x7fd3ff },
  { shirt: 0x8a4fe0, shorts: 0x2a1f40, trim: 0xd2a8ff },
  { shirt: 0x1fa65a, shorts: 0xf2f2f2, trim: 0x8dffb6 },
  { shirt: 0xe23a3a, shorts: 0x1c1c22, trim: 0xff9a9a },
  { shirt: 0x19b5b0, shorts: 0x0f3a3a, trim: 0x8ffff8 },
  { shirt: 0x26262c, shorts: 0xd4a017, trim: 0xffd23f },
];
/** Online: the host's team orange, the guest's blue. */
export const ONLINE_KITS: [Kit, Kit] = [KITS[0], KITS[1]];

export const hex = (c: number) => '#' + c.toString(16).padStart(6, '0');

/** How a simulated player looks this frame. */
export function figState(g: Game, p: Player, mood = 0): FigState {
  const h = g.holder();
  const guard = !!h && h.team !== p.team && Math.hypot(h.x - p.x, h.z - p.z) < 2.2;
  return {
    x: p.x, z: p.z, face: p.face, lift: p.lift, act: p.act, actT: p.actT, spd: Math.hypot(p.vx, p.vz), turbo: p.turbo,
    mood: g.phase === 'final' ? (g.winner === p.team ? 1 : 2) : mood, guard, kind: p.kind,
  };
}
