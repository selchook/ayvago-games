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

function mp(): Multiplayer | null {
  const m = sdk.adapter?.multiplayer ?? null;
  if (m && m.active && wired !== m) {
    wired = m;
    m.onMove((raw) => {
      const msg = raw as { t?: unknown; d?: unknown } | null;
      if (!msg || typeof msg.t !== 'string') return;
      handlers.get(msg.t)?.forEach((h) => {
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
  send(type: string, data?: unknown): void {
    mp()?.send({ t: type, d: data });
  },
  /** Listens for one message type; returns an unsubscribe function. */
  on(type: string, handler: NetHandler): () => void {
    mp();
    let set = handlers.get(type);
    if (!set) handlers.set(type, (set = new Set()));
    set.add(handler);
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
