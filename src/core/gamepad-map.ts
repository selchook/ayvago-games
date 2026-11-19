// The gamepad's mapping onto keys, without the browser: snapshots of the pad in, key edges out.
// src/core/gamepad.ts polls the pad and dispatches the edges as keyboard events; this file has no
// imports so the unit test (scripts/gamepad-unit.ts) runs it in Node.

/** A pad control in the browser's "standard" layout (Xbox names; Cross/Circle/Square/Triangle on PlayStation). */
export type PadButton =
  | 'a' | 'b' | 'x' | 'y' | 'lb' | 'rb' | 'lt' | 'rt' | 'back' | 'start' | 'ls' | 'rs'
  | 'up' | 'down' | 'left' | 'right';

type Letter = 'A' | 'B' | 'C' | 'D' | 'E' | 'F' | 'G' | 'H' | 'I' | 'J' | 'K' | 'L' | 'M' | 'N' | 'O' | 'P' | 'Q' | 'R' | 'S' | 'T' | 'U' | 'V' | 'W' | 'X' | 'Y' | 'Z';
type Digit = '0' | '1' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9';

/** A key the pad can press, by its `KeyboardEvent.code`. */
export type PadKey =
  | `Key${Letter}` | `Digit${Digit}`
  | 'ArrowUp' | 'ArrowDown' | 'ArrowLeft' | 'ArrowRight'
  | 'Space' | 'Enter' | 'Escape' | 'Tab' | 'Backspace' | 'ShiftLeft' | 'ControlLeft' | 'AltLeft'
  | 'Minus' | 'Equal' | 'Slash' | 'Delete';

/** Per-game override (GameDefinition.gamepad): another key for a control, or null for none. */
export type PadOverrides = Partial<Record<PadButton, PadKey | null>>;

/**
 * Where the pad is: 'play' while the Play scene runs with no overlay of its own open, 'pause' on
 * the core pause screen, 'menu' everywhere else (the menu, result screen, a game's own screens,
 * the intro).
 */
export type PadContext = 'play' | 'menu' | 'pause';

/** The `key` and legacy `keyCode` of each code (Phaser reads `keyCode`; games read `code` or `key`). */
export function keyInfo(code: PadKey): { key: string; keyCode: number } {
  if (code.startsWith('Key')) return { key: code.slice(3).toLowerCase(), keyCode: code.charCodeAt(3) };
  if (code.startsWith('Digit')) return { key: code.slice(5), keyCode: code.charCodeAt(5) };
  return SPECIAL[code as keyof typeof SPECIAL];
}

const SPECIAL = {
  ArrowUp: { key: 'ArrowUp', keyCode: 38 }, ArrowDown: { key: 'ArrowDown', keyCode: 40 },
  ArrowLeft: { key: 'ArrowLeft', keyCode: 37 }, ArrowRight: { key: 'ArrowRight', keyCode: 39 },
  Space: { key: ' ', keyCode: 32 }, Enter: { key: 'Enter', keyCode: 13 }, Escape: { key: 'Escape', keyCode: 27 },
  Tab: { key: 'Tab', keyCode: 9 }, Backspace: { key: 'Backspace', keyCode: 8 }, ShiftLeft: { key: 'Shift', keyCode: 16 },
  ControlLeft: { key: 'Control', keyCode: 17 }, AltLeft: { key: 'Alt', keyCode: 18 },
  Minus: { key: '-', keyCode: 189 }, Equal: { key: '=', keyCode: 187 }, Slash: { key: '/', keyCode: 191 }, Delete: { key: 'Delete', keyCode: 46 },
} as const;

/** Standard-layout button index of each control. */
export const PAD_INDEX: Record<PadButton, number> = {
  a: 0, b: 1, x: 2, y: 3, lb: 4, rb: 5, lt: 6, rt: 7, back: 8, start: 9, ls: 10, rs: 11,
  up: 12, down: 13, left: 14, right: 15,
};

export const PAD_BUTTONS = Object.keys(PAD_INDEX) as PadButton[];
const DIRS: PadButton[] = ['up', 'down', 'left', 'right'];

/**
 * The default keys during play. They follow the keys most games already read: Space is the main
 * action, X the second one (core Controls' B, undo / swap / flag in the puzzles), J and K the
 * attack and dodge of the action games, Q / E / L their skills, potion or cards, Z core Controls'
 * other A key (fire, nitro, undo), C camera / hold / cards, B a bell or toggle, M the map.
 */
export const PAD_PLAY: Record<PadButton, PadKey> = {
  a: 'Space', b: 'KeyX', x: 'KeyJ', y: 'KeyK', lb: 'KeyQ', rb: 'KeyE', lt: 'KeyL', rt: 'KeyZ',
  back: 'KeyM', start: 'Escape', ls: 'KeyC', rs: 'KeyB',
  up: 'ArrowUp', down: 'ArrowDown', left: 'ArrowLeft', right: 'ArrowRight',
};

/** On screens: A confirms (Enter), B goes back (Escape), Start confirms, or resumes from the pause. */
export const PAD_MENU: Partial<Record<PadButton, PadKey>> = { a: 'Enter', b: 'Escape', start: 'Enter' };
export const PAD_PAUSE: Partial<Record<PadButton, PadKey>> = { a: 'Enter', b: 'Escape', start: 'Escape' };

/** Stick: an axis presses its arrow beyond PRESS and lets go under RELEASE (hysteresis). */
export const STICK_PRESS = 0.35;
export const STICK_RELEASE = 0.25;
/**
 * The other axis must stay under this share of the pressed one for a single arrow: tan 22.5°
 * splits the stick into eight equal sectors; once held, an arrow keeps until tan 16.7°.
 */
const SECTOR_PRESS = 0.414;
const SECTOR_RELEASE = 0.3;
/** Buttons (analog triggers too) press at half way and let go under a quarter. */
const BUTTON_PRESS = 0.5;
const BUTTON_RELEASE = 0.25;
/** A held direction repeats like a keyboard key: first after REPEAT_DELAY, then every REPEAT_EVERY ms. */
export const REPEAT_DELAY = 500;
export const REPEAT_EVERY = 100;
/** Radial deadzone of the analog API (padAxes). */
export const ANALOG_DEADZONE = 0.15;

/** One reading of the pad (all connected pads merged): button values 0..1 and axes -1..1. */
export interface PadSnapshot {
  buttons: number[];
  axes: number[];
}

export interface KeyEdge {
  type: 'keydown' | 'keyup';
  code: PadKey;
  repeat: boolean;
}

/** Merges several pads into one reading: the strongest value of every button and axis wins. */
export function mergePads(pads: PadSnapshot[]): PadSnapshot {
  const buttons: number[] = [], axes: number[] = [];
  for (const p of pads) {
    p.buttons.forEach((v, i) => { buttons[i] = Math.max(buttons[i] ?? 0, v); });
    p.axes.forEach((v, i) => { if (Math.abs(v) > Math.abs(axes[i] ?? 0)) axes[i] = v; else axes[i] ??= 0; });
  }
  return { buttons, axes };
}

export interface PadAxes {
  /** Left stick, -1 (left / up) .. 1 (right / down), with a radial deadzone. */
  lx: number; ly: number;
  /** Right stick. */
  rx: number; ry: number;
  /** Triggers, 0 .. 1. */
  lt: number; rt: number;
}

export const NO_AXES: Readonly<PadAxes> = Object.freeze({ lx: 0, ly: 0, rx: 0, ry: 0, lt: 0, rt: 0 });

function radial(x: number, y: number): [number, number] {
  const len = Math.hypot(x, y);
  if (len <= ANALOG_DEADZONE) return [0, 0];
  const k = Math.min(1, (len - ANALOG_DEADZONE) / (1 - ANALOG_DEADZONE)) / len;
  return [x * k, y * k];
}

/** The analog reading: both sticks with a radial deadzone (rescaled to reach 1), the triggers. */
export function analogAxes(s: PadSnapshot | null): PadAxes {
  if (!s) return { ...NO_AXES };
  const [lx, ly] = radial(s.axes[0] ?? 0, s.axes[1] ?? 0);
  const [rx, ry] = radial(s.axes[2] ?? 0, s.axes[3] ?? 0);
  const trig = (v: number) => (v < 0.05 ? 0 : Math.min(1, v));
  return { lx, ly, rx, ry, lt: trig(s.buttons[6] ?? 0), rt: trig(s.buttons[7] ?? 0) };
}

/** One stick direction with hysteresis: `v` along it, `o` the other axis. */
function stickOn(v: number, o: number, was: boolean): boolean {
  const a = Math.abs(o);
  return was ? v > STICK_RELEASE && v >= a * SECTOR_RELEASE : v > STICK_PRESS && v >= a * SECTOR_PRESS;
}

/**
 * Turns pad readings into key edges. Every control is a logical button (the D-pad and the left
 * stick are one set of arrows) that remembers the key it pressed, so a context change between
 * press and release still releases the right key. Keys are counted: two controls on one key press
 * it once and release it when both are up.
 */
export class PadMapper {
  private on = new Map<PadButton, boolean>();
  private stick = { up: false, down: false, left: false, right: false };
  private dpad = new Map<PadButton, boolean>();
  private held = new Map<PadButton, PadKey>();
  private count = new Map<PadKey, number>();
  /** Controls still held when everything was released: ignored until they come up once. */
  private blocked = new Set<PadButton>();
  private repeatDir: PadButton | null = null;
  private repeatAt = 0;

  constructor(private overrides: PadOverrides = {}) {}

  setOverrides(o: PadOverrides | undefined): void {
    this.overrides = o ?? {};
  }

  /** The key a control presses in a context (null: nothing). */
  keyFor(b: PadButton, ctx: PadContext): PadKey | null {
    if (ctx === 'play') return b in this.overrides ? this.overrides[b] ?? null : PAD_PLAY[b];
    return (ctx === 'pause' ? PAD_PAUSE : PAD_MENU)[b] ?? PAD_PLAY[b];
  }

  /** Keys the pad holds down right now. */
  heldKeys(): PadKey[] {
    return [...this.count.keys()];
  }

  /** Which logical controls are down in this reading. */
  private read(s: PadSnapshot): Map<PadButton, boolean> {
    const lx = s.axes[0] ?? 0, ly = s.axes[1] ?? 0;
    const st = this.stick;
    st.right = stickOn(lx, ly, st.right);
    st.left = stickOn(-lx, ly, st.left);
    st.down = stickOn(ly, lx, st.down);
    st.up = stickOn(-ly, lx, st.up);
    const out = new Map<PadButton, boolean>();
    for (const b of PAD_BUTTONS) {
      const v = s.buttons[PAD_INDEX[b]] ?? 0;
      let down = this.on.get(b) ? v > BUTTON_RELEASE : v >= BUTTON_PRESS;
      if (b === 'up' || b === 'down' || b === 'left' || b === 'right') {
        // the D-pad's own state, then the stick on top
        const pad = (this.dpad.get(b) ? v > BUTTON_RELEASE : v >= BUTTON_PRESS);
        this.dpad.set(b, pad);
        down = pad || st[b];
      }
      out.set(b, down);
    }
    return out;
  }

  private press(b: PadButton, ctx: PadContext, edges: KeyEdge[]): void {
    const code = this.keyFor(b, ctx);
    if (!code) return;
    this.held.set(b, code);
    const n = this.count.get(code) ?? 0;
    this.count.set(code, n + 1);
    if (n === 0) edges.push({ type: 'keydown', code, repeat: false });
  }

  private release(b: PadButton, edges: KeyEdge[]): void {
    const code = this.held.get(b);
    if (!code) return;
    this.held.delete(b);
    const n = (this.count.get(code) ?? 1) - 1;
    if (n > 0) this.count.set(code, n);
    else {
      this.count.delete(code);
      edges.push({ type: 'keyup', code, repeat: false });
    }
  }

  /** One frame: the edges to dispatch for this reading (null: no pad). `now` in ms. */
  update(s: PadSnapshot | null, ctx: PadContext, now: number): KeyEdge[] {
    if (!s) return this.releaseAll(false);
    const next = this.read(s);
    const edges: KeyEdge[] = [];
    // releases first: a key moving from one control to another goes up before it goes down again
    for (const b of PAD_BUTTONS) {
      const down = next.get(b)!;
      if (!down && this.blocked.has(b)) this.blocked.delete(b);
      if (!down && this.on.get(b)) {
        this.release(b, edges);
        if (this.repeatDir === b) this.repeatDir = null;
      }
    }
    for (const b of PAD_BUTTONS) {
      const down = next.get(b)!;
      if (down && !this.on.get(b) && !this.blocked.has(b)) {
        this.press(b, ctx, edges);
        if (DIRS.includes(b) && this.held.has(b)) { this.repeatDir = b; this.repeatAt = now + REPEAT_DELAY; }
      }
    }
    for (const b of PAD_BUTTONS) this.on.set(b, next.get(b)! && !this.blocked.has(b));
    // the newest held direction repeats, like a held key on a keyboard
    const rd = this.repeatDir;
    if (rd && this.held.has(rd) && now >= this.repeatAt) {
      edges.push({ type: 'keydown', code: this.held.get(rd)!, repeat: true });
      this.repeatAt = Math.max(this.repeatAt + REPEAT_EVERY, now + REPEAT_EVERY * 0.5);
    }
    return edges;
  }

  /**
   * Lets go of every key (pad gone, page hidden, focus lost, an ad on screen). With `latch`, a
   * control still held stays ignored until it comes up, so nothing presses again by itself.
   */
  releaseAll(latch = true): KeyEdge[] {
    const edges: KeyEdge[] = [];
    for (const b of [...this.held.keys()]) this.release(b, edges);
    if (latch) {
      for (const b of PAD_BUTTONS) if (this.on.get(b)) this.blocked.add(b);
    } else {
      this.blocked.clear();
      this.stick = { up: false, down: false, left: false, right: false };
      this.dpad.clear();
    }
    this.on.clear();
    this.repeatDir = null;
    return edges;
  }
}
