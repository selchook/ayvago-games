// Online play. The platform owns the room and the connection; a game only exchanges small JSON
// messages with the other players through the adapter (GHA_MOVE_OUT / GHA_MOVE_IN).
// Two-player rooms (protocol 2.1) and, since protocol 2.3, tables of up to four seats: the
// platform lists the seats (`net.seats`, bots included) and says which seat sent each message;
// the host's game plays the bot seats. Protocol 2.7 adds the table's settings (`net.table`: hands
// per match, seconds per turn, bots allowed) and host hand-over: when the host's page is gone the
// platform makes another seated player the host (`net.hostSeat`, `net.onHostChange`), and
// `net.isHost` follows it, so the new host's game takes over the bots and the resyncs.
//
// Every message is { t: type, d: payload }. Types starting with "__" belong to the core flow
// (round start, back to menu); games use their own short types ('move', 'input', 'state', …).
// Seats: the host (playerIndex 0) created the room; at a table the host may later sit elsewhere.
// In real-time games the host runs the authoritative simulation and the guest sends its input;
// turn-based games alternate seats.
import Phaser from 'phaser';
import type { Multiplayer, SeatInfo, TableSettings } from './ayvago/adapter';
import { sdk } from './sdk';

/** `from` is the sender's seat (the other player in a two-player room). */
export type NetHandler = (data: any, from: number) => void;

const handlers = new Map<string, Set<NetHandler>>();
const leaveHandlers = new Set<(seat: number) => void>();
const joinHandlers = new Set<(name: string, seat: number) => void>();
const hostHandlers = new Set<(hostSeat: number) => void>();
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
const early = new Map<string, Array<[unknown, number]>>();
const EARLY_LIMIT = 64;

function mp(): Multiplayer | null {
  const m = sdk.adapter?.multiplayer ?? null;
  if (m && m.active && wired !== m) {
    wired = m;
    m.onMove((raw, from) => {
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
        queue.push([msg.d, from]);
        if (queue.length > EARLY_LIMIT) queue.shift();
        early.set(msg.t, queue);
        return;
      }
      listeners?.forEach((h) => {
        try {
          h(msg.d, from);
        } catch (error) {
          console.error('[ayvago] net handler failed', msg.t, error);
        }
      });
    });
    m.onPeerLeave((seat) => leaveHandlers.forEach((h) => h(seat)));
    m.onPeerJoin((name, seat) => joinHandlers.forEach((h) => h(name, seat)));
    // Protocol 2.7: isHost and hostSeat already hold the new values when this runs.
    m.onHostChange((seat) => hostHandlers.forEach((h) => {
      try {
        h(seat);
      } catch (error) {
        console.error('[ayvago] host change handler failed', error);
      }
    }));
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
  /**
   * The room creator (seat 0), or at a table the current host after a hand-over (protocol 2.7).
   * Read it when acting, not once: it changes with GHA_HOST_CHANGE. Solo play counts as host.
   */
  get isHost(): boolean {
    return mp()?.isHost ?? true;
  },
  /** Protocol 2.7: the host's seat (0 in two-player rooms, solo and before any hand-over). */
  get hostSeat(): number {
    return mp()?.hostSeat ?? 0;
  },
  /**
   * Protocol 2.7: the table's settings (hands per match, seconds per turn, bots allowed); null in
   * two-player rooms, solo play and on platforms before 2.7 (use the game's own defaults then).
   */
  get table(): TableSettings | null {
    return mp()?.table?.settings ?? null;
  },
  /** 0 = host, 1 = guest. */
  get seat(): 0 | 1 {
    return (mp()?.playerIndex ?? 0) === 1 ? 1 : 0;
  },
  get peerName(): string {
    return mp()?.peerName ?? '';
  },
  /** Protocol 2.3: true at a table (up to four seats, bots allowed). */
  get isTable(): boolean {
    return (mp()?.seats.length ?? 0) > 0;
  },
  /** Protocol 2.3: every seat at the table in order; empty in two-player rooms and solo. */
  get seats(): readonly SeatInfo[] {
    return mp()?.seats ?? [];
  },
  /** This player's seat index (0 = host; up to 3 at a table). */
  get playerIndex(): number {
    return mp()?.playerIndex ?? 0;
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
        for (const [data, from] of waiting) {
          try {
            handler(data, from);
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
  onPeerLeave(scene: Phaser.Scene, handler: (seat: number) => void): void {
    mp();
    leaveHandlers.add(handler);
    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => leaveHandlers.delete(handler));
  },
  onPeerJoin(scene: Phaser.Scene, handler: (name: string, seat: number) => void): void {
    mp();
    joinHandlers.add(handler);
    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => joinHandlers.delete(handler));
  },
  /**
   * Protocol 2.7, tables: another player became the host (GHA_HOST_CHANGE). `net.isHost` and
   * `net.hostSeat` already hold the new values. The new host's game takes over what the host did
   * (bots, absent seats, resyncs, starting the next round); a game that lost the host role stops.
   */
  onHostChange(scene: Phaser.Scene, handler: (hostSeat: number) => void): void {
    mp();
    hostHandlers.add(handler);
    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => hostHandlers.delete(handler));
  },
};
