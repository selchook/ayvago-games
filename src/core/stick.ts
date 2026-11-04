import type { Controls } from './controls';

export type Dir4 = 'left' | 'right' | 'up' | 'down';

/**
 * Grid reading of the touch stick (`new Controls(scene, { joystick: true })`), for games that
 * move on a grid: snakes, mazes, Sokoban, frog hops.
 *
 * - Reads the stick only: the game's own keyboard handlers stay exactly as they were.
 * - Dead zone with hysteresis: a direction engages past 40% of the stick's reach and lets go
 *   below 28%, so a resting thumb never jitters.
 * - Axis lock: once a direction is held, the other axis must clearly win (35% more) before the
 *   direction changes, so a thumb near the diagonal never flickers between two turns.
 *
 * Call `update(delta)` once per frame, then read `held`, `pressed` (entered this frame) or
 * `step` (pressed, then repeated while held: for games that move one cell at a time).
 */
export class StickDir {
  held: Dir4 | null = null;
  pressed: Dir4 | null = null;
  step: Dir4 | null = null;
  private holdMs = 0;
  private nextMs = 0;
  private latched = false;

  constructor(
    private controls: Controls,
    /** First repeat after this many ms of holding, then one step every `rate` ms. */
    private delay = 260,
    private rate = 150,
  ) {}

  /** True while a thumb is on the stick. */
  get active(): boolean {
    return this.controls.stickActive;
  }

  /** Change the hold repeat timing (for example when the game speeds up). */
  setRepeat(delay: number, rate: number): void { this.delay = delay; this.rate = rate; }

  /** Forget the current hold, so the next push counts as a new press. */
  reset(): void { this.held = null; this.pressed = null; this.step = null; this.holdMs = 0; }

  /** Ignore the stick until the thumb lets go or returns to the centre (after a death, a level). */
  latch(): void { this.reset(); this.latched = true; }

  update(delta: number): void {
    const prev = this.held;
    let cur: Dir4 | null = null;
    if (this.active) {
      const x = this.controls.axisX, y = this.controls.axisY;
      const ax = Math.abs(x), ay = Math.abs(y), mag = Math.max(ax, ay);
      if (mag >= (prev ? 0.28 : 0.4)) {
        let horizontal = ax >= ay;
        if (prev) horizontal = prev === 'left' || prev === 'right' ? ax * 1.35 >= ay : ax > ay * 1.35;
        cur = horizontal ? (x < 0 ? 'left' : 'right') : (y < 0 ? 'up' : 'down');
      }
    }
    if (this.latched) {
      if (cur) { this.held = null; this.pressed = null; this.step = null; return; }
      this.latched = false;
    }
    this.held = cur;
    this.pressed = cur && cur !== prev ? cur : null;
    this.step = null;
    if (!cur) { this.holdMs = 0; return; }
    if (this.pressed) {
      this.holdMs = 0; this.nextMs = this.delay; this.step = cur;
      return;
    }
    this.holdMs += delta;
    if (this.holdMs >= this.nextMs) { this.nextMs += this.rate; this.step = cur; }
  }
}
