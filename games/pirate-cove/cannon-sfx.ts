// The gun deck's sound: a broadside is several real cannon shots (Tito Tank's cannon2), fired one
// after another with their own pitch, a falling whistle on long shots, and on impact a boom with
// a wood crack (ship), stone (fort) or the double explosion (a sinking or a fort's collapse).
// Every play goes through the core's sfx (mute switch, panning, compressor); this mixer staggers
// the guns and caps how many cannon shots sound at once, so a big fight never clips.
import Phaser from 'phaser';
import { playSfx } from '@core';

/** Gap between the guns of one broadside, ms (random within). */
export const GUN_GAP: [number, number] = [65, 115];
/** Cannon shots that may sound at once (the loud first ~0.6 s of each). */
const MAX_SHOTS = 6;
const SHOT_WINDOW = 600;
/** Impact booms within this window count together (three balls into one hull = one big hit). */
const MAX_BOOMS = 2;
const BOOM_WINDOW = 140;
const BOOMS = ['boom1', 'boom2', 'boom3'];

export interface GunLog { at: number; game: number; volley: number; gun: number; key: string; rate: number; volume: number; pan: number }

export class CannonSfx {
  /** Every shot played (tests read the timing of a broadside). */
  log: GunLog[] = [];
  private shots: number[] = [];
  private booms: number[] = [];
  private volleyN = 0;
  private lastBoom = -1;
  /** Game time in ms (the scene clock the guns are timed on), for the log. */
  private gameMs = 0;

  constructor(private scene: Phaser.Scene) {}

  /**
   * Random firing offsets (ms) for the `n` guns of one broadside: the first fires now, each next
   * one GUN_GAP later; and a pitch per gun, all different, ±5-8 % around 1.
   */
  plan(n: number): { delay: number; rate: number }[] {
    const rates = Phaser.Utils.Array.Shuffle([0.93, 1, 1.065, 0.965, 1.035].slice(0, Math.max(1, n)));
    const out: { delay: number; rate: number }[] = [];
    let d = 0;
    for (let i = 0; i < n; i++) {
      if (i) d += Phaser.Math.Between(GUN_GAP[0], GUN_GAP[1]);
      out.push({ delay: d, rate: rates[i % rates.length] + (Math.random() - 0.5) * 0.02 });
    }
    return out;
  }

  /** Advances the log's game clock (call once per update). */
  tick(dtMs: number): void {
    this.gameMs += dtMs;
  }

  /** A new broadside starts (the player's alternate between two copies of the shot, so a second
   * broadside never cuts the tail of the first). */
  volley(): number {
    return ++this.volleyN;
  }

  /**
   * One gun fires. `mine`: the player's (full level, never dropped); else an enemy gun at
   * `dist` from the player: quieter with distance, lower, and dropped when the sea is already loud.
   */
  shot(o: { mine: boolean; x: number; rate: number; gun: number; volley: number; dist?: number; fort?: boolean }): void {
    const now = performance.now();
    this.shots = this.shots.filter((t) => now - t < SHOT_WINDOW);
    const busy = this.shots.length;
    let key: string, volume: number, rate = o.rate;
    if (o.mine) {
      key = o.volley % 2 ? 'cannon' : 'cannonB';
      // the first gun is the loudest; the others sit a touch under it
      volume = (o.gun === 0 ? 0.88 : 0.8) / (1 + Math.max(0, busy - 2) * 0.12);
    } else {
      if (busy >= MAX_SHOTS) return;
      const d = o.dist ?? 30;
      const near = Phaser.Math.Clamp(1 - (d - 12) / 60, 0.3, 1);
      // distant guns and forts: the shorter, duller shot; close ones the same gun, pitched down
      const far = o.fort || d > 42;
      key = far ? 'cannonFar' : 'cannonFoe';
      rate *= far ? 0.97 : 0.88;
      volume = (far ? 0.55 : 0.6) * near / (1 + busy * 0.15);
    }
    this.shots.push(now);
    const pan = this.panOf(o.x);
    playSfx(this.scene, key, { volume, rate, x: o.x });
    this.log.push({ at: Math.round(now), game: Math.round(this.gameMs), volley: o.volley, gun: o.gun, key, rate: +rate.toFixed(3), volume: +volume.toFixed(2), pan: +pan.toFixed(2) });
    if (this.log.length > 60) this.log.shift();
  }

  /** The falling whistle of a ball in flight, timed to end as it lands (`flight` seconds). */
  whistle(flight: number, x: number, volume: number): void {
    if (flight < 1) return;
    const after = Math.max(0.12, flight - 0.95);
    this.scene.time.delayedCall(after * 1000, () => playSfx(this.scene, 'whistle', { volume, x }));
  }

  /** A ball strikes a hull: a boom (one of three) with the wood cracking under it. */
  hullHit(x: number, volume = 1, wood = true): void {
    if (this.boomed()) {
      playSfx(this.scene, 'hit', { volume: 0.55 * volume, x });
      return;
    }
    let i = Math.floor(Math.random() * BOOMS.length);
    if (i === this.lastBoom) i = (i + 1) % BOOMS.length;
    this.lastBoom = i;
    playSfx(this.scene, BOOMS[i], { volume: 0.72 * volume, x });
    if (wood) playSfx(this.scene, 'hit', { volume: 0.7 * volume, x });
  }

  /** A ball strikes stone (a fort, an island's rocks). */
  stoneHit(x: number, volume = 1): void {
    playSfx(this.scene, 'stone', { volume: 0.75 * volume, x });
    if (!this.boomed()) playSfx(this.scene, BOOMS[Math.floor(Math.random() * BOOMS.length)], { volume: 0.45 * volume, rate: 0.9, x });
  }

  /** A ship goes down or a fort falls: the double explosion (and the long rumble for big ones). */
  sinking(x: number, big = false): void {
    playSfx(this.scene, 'boomDouble', { volume: 0.95, x });
    playSfx(this.scene, big ? 'bigBoom' : 'sink', { volume: big ? 0.75 : 0.5, x });
  }

  private boomed(): boolean {
    const now = performance.now();
    this.booms = this.booms.filter((t) => now - t < BOOM_WINDOW);
    if (this.booms.length >= MAX_BOOMS) return true;
    this.booms.push(now);
    return false;
  }

  private panOf(x: number): number {
    const w = this.scene.scale.width;
    return w > 0 ? Phaser.Math.Clamp((x / w) * 2 - 1, -1, 1) * 0.6 : 0;
  }
}
