import type Phaser from 'phaser';
import { isModalOpen } from './modal';
import { adBusy } from './ads';
import {
  PadMapper, analogAxes, keyInfo, mergePads, NO_AXES,
  type KeyEdge, type PadAxes, type PadContext, type PadKey, type PadOverrides, type PadSnapshot,
} from './gamepad-map';

/**
 * Gamepad support for every game, with no per-game code: the pad is polled once per frame and
 * turned into the keyboard events the games already read (the table in gamepad-map.ts).
 *
 * - The events are real `KeyboardEvent`s with `key`, `code`, `keyCode` and `which` set, dispatched
 *   on the focused element so they bubble through `document` to `window`, where Phaser's
 *   KeyboardManager listens: `addKey` / `createCursorKeys` state, `keydown-X` events, `JustDown`
 *   and DOM listeners on `window` or `document` all see them like real keys.
 * - The pad keeps its own set of held keys. A key the keyboard holds too goes up only when both
 *   let go (a real keyup is held back while the pad still holds the key, and the other way round).
 * - Everything the pad holds is released when it disconnects, the page is hidden, the window
 *   loses focus or an ad break takes the screen; a control still held then is ignored until it
 *   comes up, so no key sticks and nothing presses by itself.
 * - With no pad nothing runs: no frame loop, just the connect listeners.
 */

export type InputMode = 'gamepad' | 'keyboard' | 'touch';

const mapper = new PadMapper();
const ours = new WeakSet<Event>();
/** Codes the real keyboard holds (from its own events). */
const kbHeld = new Set<string>();
/** Codes the pad holds down, as the page sees them. */
const padHeld = new Set<string>();
const modeListeners = new Set<(m: InputMode) => void>();
let started = false;
let game: Phaser.Game | null = null;
let raf = 0;
let snap: PadSnapshot | null = null;
let connected = false;
let mode: InputMode = 'keyboard';

/** Whether a gamepad is connected (and has been seen by the page: browsers show a pad after a button press). */
export function padConnected(): boolean {
  return connected;
}

/** The analog sticks (radial deadzone) and triggers of the connected pads; zeros without one. */
export function padAxes(): PadAxes {
  return snap ? analogAxes(snap) : { ...NO_AXES };
}

/** How the player plays right now: 'gamepad' after pad input, 'keyboard' / 'touch' after those. */
export function inputMode(): InputMode {
  return mode;
}

/** Calls `cb` when the input mode changes; returns the unsubscribe. */
export function onInputMode(cb: (m: InputMode) => void): () => void {
  modeListeners.add(cb);
  return () => modeListeners.delete(cb);
}

function setMode(m: InputMode): void {
  if (m === mode) return;
  mode = m;
  modeListeners.forEach((cb) => cb(m));
  window.dispatchEvent(new CustomEvent('ayvago:inputmode', { detail: m }));
}

/**
 * A short rumble on every connected pad that can (Chrome / Edge `vibrationActuator`); does
 * nothing elsewhere. `strength` 0..1.
 */
export function padRumble(ms: number, strength = 0.6): void {
  if (!connected) return;
  const s = Math.max(0, Math.min(1, strength));
  for (const p of pads()) {
    const act = (p as Gamepad & { vibrationActuator?: { playEffect?: (t: string, o: object) => Promise<unknown> } }).vibrationActuator;
    act?.playEffect?.('dual-rumble', { duration: Math.max(0, ms), strongMagnitude: s, weakMagnitude: Math.min(1, s * 0.8) })?.catch?.(() => undefined);
  }
}

function pads(): Gamepad[] {
  try {
    return Array.from(navigator.getGamepads?.() ?? []).filter((p): p is Gamepad => !!p && p.connected !== false);
  } catch {
    // a frame without the `gamepad` permission throws
    return [];
  }
}

function reading(p: Gamepad): PadSnapshot {
  return {
    buttons: Array.from(p.buttons ?? [], (b) => (typeof b === 'number' ? b : b.value || (b.pressed ? 1 : 0))),
    axes: Array.from(p.axes ?? []),
  };
}

/** Where the pad is, from the running scenes. */
function context(): PadContext {
  const scenes = game?.scene;
  if (!scenes) return 'menu';
  if (scenes.keys['Pause']?.sys.isActive()) return 'pause';
  const play = scenes.keys['Play'];
  if (!play || !play.sys.isActive() || isModalOpen(play)) return 'menu';
  return 'play';
}

function dispatch(type: 'keydown' | 'keyup', code: PadKey, repeat: boolean): void {
  const { key, keyCode } = keyInfo(code);
  const ev = new KeyboardEvent(type, { key, code, repeat, bubbles: true, cancelable: true, composed: true });
  // Chrome ignores keyCode / which in the event init; Phaser reads keyCode
  Object.defineProperty(ev, 'keyCode', { get: () => keyCode });
  Object.defineProperty(ev, 'which', { get: () => keyCode });
  ours.add(ev);
  const focused = document.activeElement;
  const target = focused && focused !== document.documentElement && document.contains(focused) ? focused : document.body ?? document;
  target.dispatchEvent(ev);
}

function apply(edges: KeyEdge[]): void {
  for (const e of edges) {
    if (e.type === 'keydown') {
      if (!e.repeat) padHeld.add(e.code);
      // a key the keyboard already holds is down for the page: no second keydown
      if (kbHeld.has(e.code)) continue;
      dispatch('keydown', e.code, e.repeat);
    } else {
      if (!padHeld.delete(e.code)) continue;
      if (!kbHeld.has(e.code)) dispatch('keyup', e.code, false);
    }
  }
}

/** Lets go of everything the pad holds (latched: held controls wait until they come up). */
function releasePad(): void {
  apply(mapper.releaseAll(true));
}

function tick(): void {
  raf = 0;
  const list = pads();
  if (!list.length) {
    apply(mapper.releaseAll(false));
    snap = null;
    connected = false;
    return;
  }
  if (!connected) {
    connected = true;
    setMode('gamepad');
  }
  if (document.hidden) return releasePad();
  snap = mergePads(list.map(reading));
  if (adBusy()) releasePad();
  else {
    const edges = mapper.update(snap, context(), performance.now());
    if (edges.some((e) => e.type === 'keydown' && !e.repeat)) setMode('gamepad');
    apply(edges);
  }
  raf = requestAnimationFrame(tick);
}

function wake(): void {
  if (raf || document.hidden) return;
  if (pads().length) raf = requestAnimationFrame(tick);
}

function onKey(e: KeyboardEvent): void {
  if (ours.has(e)) return;
  setMode('keyboard');
  if (e.type === 'keydown') {
    const was = kbHeld.has(e.code);
    kbHeld.add(e.code);
    // the pad already holds this key down: for the page it is a repeat, not a new press
    if (!was && !e.repeat && padHeld.has(e.code)) e.stopImmediatePropagation();
  } else {
    kbHeld.delete(e.code);
    // the pad still holds it: the key stays down until the pad lets go
    if (padHeld.has(e.code)) e.stopImmediatePropagation();
  }
}

/**
 * Starts the gamepad layer (from launch(), before the intro so a press can skip it). Safe to
 * call more than once.
 */
export function startGamepad(): void {
  if (started || typeof window === 'undefined' || typeof navigator === 'undefined' || !('getGamepads' in navigator)) return;
  started = true;
  if (window.matchMedia?.('(pointer: coarse)').matches) mode = 'touch';
  window.addEventListener('gamepadconnected', wake);
  window.addEventListener('gamepaddisconnected', () => {
    if (raf) cancelAnimationFrame(raf);
    raf = 0;
    tick();
  });
  // capture on window: before Phaser's and the games' own listeners
  window.addEventListener('keydown', onKey, true);
  window.addEventListener('keyup', onKey, true);
  window.addEventListener('pointerdown', (e) => setMode(e.pointerType === 'mouse' ? 'keyboard' : 'touch'), true);
  window.addEventListener('blur', () => {
    kbHeld.clear();
    releasePad();
  });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) releasePad();
    else wake();
  });
  wake();
}

/** Hands the layer the running game (for the context: play, pause or a screen) and the game's own mapping. */
export function attachGamepad(g: Phaser.Game, overrides?: PadOverrides): void {
  game = g;
  mapper.setOverrides(overrides);
}

/** Test hook: the keys the pad holds and the context it maps for. */
export function padDebug(): { held: string[]; context: PadContext; connected: boolean; mode: InputMode } {
  return { held: [...padHeld], context: context(), connected, mode };
}
