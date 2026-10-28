// Online two-player play. The platform owns the room and the connection; a game only exchanges
// small JSON messages with the other player through the adapter (GHA_MOVE_OUT / GHA_MOVE_IN).
//
// Every message is { t: type, d: payload }. Types starting with "__" belong to the core flow
// (round start, back to menu); games use their own short types ('move', 'input', 'state', …).
// Seats: the host (playerIndex 0) created the room. In real-time games the host runs the
// authoritative simulation and the guest sends its input; turn-based games alternate seats.
import Phaser from 'phaser';
import type { Multiplayer } from './ayvago/adapter';
import { sdk } from './sdk';

export type NetHandler = (data: any) => void;

const handlers = new Map<string, Set<NetHandler>>();
const leaveHandlers = new Set<() => void>();
const joinHandlers = new Set<(name: string) => void>();
let wired: Multiplayer | null = null;
let roundSeed = 0;
// Turn order (a platform rule for every online game): the room's host takes the first turn of
// the first round; after that the previous round's winner does, and after a draw the player who
// did not start the last round.
let roundStarter: 0 | 1 = 0;
let nextStarter: 0 | 1 = 0;
// A round start that arrived before anyone listened (the guest still in the intro); the
// guest's menu picks it up as soon as it opens.
let pendingStart: { seed?: number; starter?: number } | null = null;
// Game messages that arrived while nothing listened for their type, e.g. the host's first move
// landing before the guest's Play scene has started. Delivered to the first listener; dropped
// when a new round starts or the players go back to the menu.
const early = new Map<string, unknown[]>();
const EARLY_LIMIT = 64;

function mp(): Multiplayer | null {
  const m = sdk.adapter?.multiplayer ?? null;
  if (m && m.active && wired !== m) {
    wired = m;
    m.onMove((raw) => {
      const msg = raw as { t?: unknown; d?: unknown } | null;
      if (!msg || typeof msg.t !== 'string') return;
      if (msg.t === '__start' || msg.t === '__menu') {
        pendingStart = null;
        early.clear();
      }
      const listeners = handlers.get(msg.t);
      if (msg.t === '__start' && !listeners?.size) pendingStart = (msg.d ?? {}) as { seed?: number; starter?: number };
      if (!msg.t.startsWith('__') && !listeners?.size) {
        const queue = early.get(msg.t) ?? [];
        queue.push(msg.d);
        if (queue.length > EARLY_LIMIT) queue.shift();
        early.set(msg.t, queue);
        return;
      }
      listeners?.forEach((h) => {
        try {
          h(msg.d);
        } catch (error) {
          console.error('[ayvago] net handler failed', msg.t, error);
        }
      });
    });
    m.onPeerLeave(() => leaveHandlers.forEach((h) => h()));
    m.onPeerJoin((name) => joinHandlers.forEach((h) => h(name)));
  }
  return m && m.active ? m : null;
}

/** Connects to the adapter's move stream; launch() calls it so no early message is missed. */
export function wireNet(): void {
  mp();
}

export const net = {
  /** True in an online match started by the platform. */
  get active(): boolean {
    return mp() !== null;
  },
  /** The room creator (seat 0). Solo play counts as host. */
  get isHost(): boolean {
    return mp()?.isHost ?? true;
  },
  /** 0 = host, 1 = guest. */
  get seat(): 0 | 1 {
    return (mp()?.playerIndex ?? 0) === 1 ? 1 : 0;
  },
  get peerName(): string {
    return mp()?.peerName ?? '';
  },
  /** Shared random seed of the current round (set by the host when the round starts). */
  get seed(): number {
    return roundSeed;
  },
  setSeed(seed: number): void {
    roundSeed = seed >>> 0;
  },
  /** Seat that takes the first turn (or serve) of the current round. */
  get starter(): 0 | 1 {
    return roundStarter;
  },
  /** True when this player takes the first turn of the current round. */
  get myTurnFirst(): boolean {
    return net.seat === roundStarter;
  },
  /** Applies a round start from the host: the shared seed and who starts. */
  applyStart(d: { seed?: number; starter?: number } | null | undefined): void {
    roundSeed = (d?.seed ?? 0) >>> 0;
    roundStarter = d?.starter === 1 ? 1 : 0;
  },
  /** Records the round's result (from this player's side); it decides who starts the next one. */
  recordResult(outcome: 'win' | 'lose' | 'draw'): void {
    const other = (s: 0 | 1): 0 | 1 => (s === 0 ? 1 : 0);
    nextStarter = outcome === 'draw' ? other(roundStarter) : outcome === 'win' ? net.seat : other(net.seat);
  },
  /** Seat that starts the next round (host side, when it sends "__start"). */
  get nextStarter(): 0 | 1 {
    return nextStarter;
  },
  /** The host's round start that arrived before the menu was listening, if any (read once). */
  takePendingStart(): { seed?: number; starter?: number } | null {
    const start = pendingStart;
    pendingStart = null;
    return start;
  },
  send(type: string, data?: unknown): void {
    mp()?.send({ t: type, d: data });
  },
  /** Listens for one message type; returns an unsubscribe function. */
  on(type: string, handler: NetHandler): () => void {
    mp();
    let set = handlers.get(type);
    if (!set) handlers.set(type, (set = new Set()));
    set.add(handler);
    const waiting = early.get(type);
    if (waiting) {
      early.delete(type);
      // After the caller's create() has finished setting up its state.
      setTimeout(() => {
        if (!set.has(handler)) return;
        for (const data of waiting) {
          try {
            handler(data);
          } catch (error) {
            console.error('[ayvago] net handler failed', type, error);
          }
        }
      }, 0);
    }
    return () => set.delete(handler);
  },
  /** Like on(), removed automatically when the scene shuts down (restart, scene change). */
  onScene(scene: Phaser.Scene, type: string, handler: NetHandler): void {
    const off = net.on(type, handler);
    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, off);
  },
  onPeerLeave(scene: Phaser.Scene, handler: () => void): void {
    mp();
    leaveHandlers.add(handler);
    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => leaveHandlers.delete(handler));
  },
  onPeerJoin(scene: Phaser.Scene, handler: (name: string) => void): void {
    mp();
    joinHandlers.add(handler);
    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => joinHandlers.delete(handler));
  },
};
