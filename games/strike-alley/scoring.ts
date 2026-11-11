// Ten-pin scoring: ten frames, strikes (10 + the next two balls), spares (10 + the next ball),
// and the tenth frame's bonus balls (a strike there earns two more, a spare one more).

export const FRAMES = 10;

export class ScoreSheet {
  /** Pins knocked down by each ball, frame by frame. */
  frames: number[][] = Array.from({ length: FRAMES }, () => []);

  /** Index of the frame being bowled (FRAMES when the game is over). */
  get frame(): number {
    for (let i = 0; i < FRAMES; i++) if (!this.frameDone(i)) return i;
    return FRAMES;
  }

  /** Ball number within the current frame (0, 1 or 2). */
  get ball(): number {
    const f = this.frame;
    return f < FRAMES ? this.frames[f].length : 0;
  }

  get over(): boolean {
    return this.frame >= FRAMES;
  }

  frameDone(i: number): boolean {
    const r = this.frames[i];
    if (i < FRAMES - 1) return r[0] === 10 || r.length === 2;
    if (r.length < 2) return false;
    if (r[0] === 10 || r[0] + r[1] === 10) return r.length === 3;
    return true;
  }

  /** Pins standing before the next ball: 10 for a fresh rack, else what the last ball left. */
  pinsUp(): number {
    const f = this.frame;
    if (f >= FRAMES) return 0;
    const r = this.frames[f];
    if (r.length === 0) return 10;
    if (f < FRAMES - 1) return 10 - r[0];
    // tenth frame
    if (r.length === 1) return r[0] === 10 ? 10 : 10 - r[0];
    // third ball: a fresh rack after X X or a spare; else what the second ball left after X
    if (r[0] === 10) return r[1] === 10 ? 10 : 10 - r[1];
    return 10;
  }

  /** True when the next ball gets a fresh rack. */
  freshRack(): boolean {
    return this.pinsUp() === 10;
  }

  /** Records a ball; returns what it was. */
  add(pins: number): 'strike' | 'spare' | 'open' | 'ball' {
    const f = this.frame;
    if (f >= FRAMES) throw new Error('game over');
    const up = this.pinsUp();
    pins = Math.max(0, Math.min(up, Math.round(pins)));
    const fresh = up === 10;
    this.frames[f].push(pins);
    if (fresh && pins === 10) return 'strike';
    if (!fresh && pins === up) return 'spare';
    return this.frameDone(f) ? 'open' : 'ball';
  }

  /** Flat list of every ball bowled. */
  rolls(): number[] {
    return this.frames.flat();
  }

  /** Running totals per frame (null while a frame's bonus balls are still to come). */
  totals(): (number | null)[] {
    const out: (number | null)[] = [];
    const rolls = this.rolls();
    let i = 0, sum = 0;
    for (let f = 0; f < FRAMES; f++) {
      const r = this.frames[f];
      if (!r.length) { out.push(null); continue; }
      if (f === FRAMES - 1) {
        if (!this.frameDone(f)) { out.push(null); continue; }
        sum += r.reduce((a, b) => a + b, 0);
        out.push(sum);
        continue;
      }
      if (r[0] === 10) {
        if (rolls.length < i + 3) { out.push(null); i += 1; continue; }
        sum += 10 + rolls[i + 1] + rolls[i + 2];
        i += 1;
      } else if (r.length === 2 && r[0] + r[1] === 10) {
        if (rolls.length < i + 3) { out.push(null); i += 2; continue; }
        sum += 10 + rolls[i + 2];
        i += 2;
      } else if (r.length === 2) {
        sum += r[0] + r[1];
        i += 2;
      } else {
        out.push(null);
        i += r.length;
        continue;
      }
      out.push(sum);
    }
    // a later total can never show while an earlier one is pending
    for (let f = 1; f < FRAMES; f++) if (out[f - 1] === null) out[f] = null;
    return out;
  }

  /** The score so far (the last known running total, or every pin counted so far). */
  total(): number {
    const t = this.totals();
    for (let f = FRAMES - 1; f >= 0; f--) if (t[f] !== null) return t[f]!;
    return 0;
  }

  /** The marks of a frame's boxes: 'X', '/', '-', digits ('' for not bowled). */
  marks(f: number): string[] {
    const r = this.frames[f];
    const n = (v: number) => (v === 0 ? '-' : String(v));
    if (f < FRAMES - 1) {
      if (r[0] === 10) return ['', 'X'];
      return [r[0] === undefined ? '' : n(r[0]), r[1] === undefined ? '' : r[0] + r[1] === 10 ? '/' : n(r[1])];
    }
    const out = ['', '', ''];
    if (r[0] !== undefined) out[0] = r[0] === 10 ? 'X' : n(r[0]);
    if (r[1] !== undefined) {
      if (r[0] === 10) out[1] = r[1] === 10 ? 'X' : n(r[1]);
      else out[1] = r[0] + r[1] === 10 ? '/' : n(r[1]);
    }
    if (r[2] !== undefined) {
      const freshThird = (r[0] === 10 && r[1] === 10) || (r[0] !== 10 && r[0] + r[1] === 10);
      if (freshThird) out[2] = r[2] === 10 ? 'X' : n(r[2]);
      else out[2] = r[1] + r[2] === 10 ? '/' : n(r[2]);
    }
    return out;
  }

  /** Strikes bowled in a row up to the last ball (for DOUBLE / TURKEY call-outs). */
  streak(): number {
    let s = 0;
    // walk the balls backwards; only first balls on a fresh rack can be strikes
    const marks: string[] = [];
    for (let f = 0; f < FRAMES; f++) for (const m of this.marks(f)) if (m) marks.push(m);
    for (let i = marks.length - 1; i >= 0 && marks[i] === 'X'; i--) s++;
    return s;
  }

  /** Counts for the summary. */
  stats(): { strikes: number; spares: number; opens: number } {
    let strikes = 0, spares = 0, opens = 0;
    for (let f = 0; f < FRAMES; f++) {
      const m = this.marks(f);
      strikes += m.filter((x) => x === 'X').length;
      spares += m.filter((x) => x === '/').length;
      if (this.frameDone(f) && !m.includes('X') && !m.includes('/')) opens++;
    }
    return { strikes, spares, opens };
  }
}
