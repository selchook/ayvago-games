// Input for the events: each event names its actions (LEFT/RIGHT, RUN/JUMP, STROKE/BREATHE,
// SHOOT) with their keys and, on touch screens, big round thumb buttons in the bottom corners.
// Several fingers work at once; every press is counted, so quick taps are never lost between
// frames. Archery also reads a finger dragged anywhere else on the screen to aim.
import Phaser from 'phaser';
import { txt } from '@core';

export interface PadButton {
  id: string;
  label: string;
  x: number;
  y: number;
  r?: number;
  color: number;
  /** KeyboardEvent.code values that press this action. */
  keys: string[];
  /** Keys only: no button on touch screens. */
  hidden?: boolean;
}

const DEPTH = 9400;
const PAUSE_ZONE = 130;

interface Visual {
  def: PadButton;
  ring: Phaser.GameObjects.Arc;
  label: Phaser.GameObjects.Text;
}

export class Pad {
  readonly touch: boolean;
  private defs: PadButton[] = [];
  private visuals: Visual[] = [];
  private presses = new Map<string, number>();
  private releases = new Map<string, number>();
  private keyDown = new Map<string, Set<string>>();
  private fingers = new Map<number, string>();
  private tapCount = 0;
  private dragId = -1;
  private last = { x: 0, y: 0 };
  /** Accumulated drag since the last read (game px). */
  dragX = 0;
  dragY = 0;
  dragging = false;
  /** Aim drags are read only while this is on. */
  dragArea = false;
  enabled = true;

  constructor(private scene: Phaser.Scene) {
    this.touch = scene.sys.game.device.input.touch;
    scene.input.addPointer(3);
    const kb = scene.input.keyboard;
    kb?.addCapture('SPACE,LEFT,RIGHT,UP,DOWN,ENTER');
    kb?.on('keydown', this.onKeyDown, this);
    kb?.on('keyup', this.onKeyUp, this);
    scene.input.on('pointerdown', this.onDown, this);
    scene.input.on('pointermove', this.onMove, this);
    scene.input.on('pointerup', this.onUp, this);
    scene.input.on('pointerupoutside', this.onUp, this);
    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      kb?.off('keydown', this.onKeyDown, this);
      kb?.off('keyup', this.onKeyUp, this);
    });
  }

  /** The buttons of the current event (replaces the previous set). */
  set(defs: PadButton[]): void {
    this.visuals.forEach((v) => { v.ring.destroy(); v.label.destroy(); });
    this.visuals = [];
    this.defs = defs;
    this.reset();
    if (!this.touch) return;
    for (const def of defs) {
      if (def.hidden) continue;
      const r = def.r ?? 92;
      const ring = this.scene.add.circle(def.x, def.y, r, def.color, 0.38).setStrokeStyle(5, 0xffffff, 0.7).setDepth(DEPTH).setScrollFactor(0);
      const label = txt(this.scene, def.x, def.y, def.label, { title: true, size: def.label.length > 6 ? 22 : 28, strokeThickness: 5 }).setDepth(DEPTH + 1).setScrollFactor(0);
      this.visuals.push({ def, ring, label });
    }
  }

  setVisible(v: boolean): void {
    this.visuals.forEach((o) => { o.ring.setVisible(v); o.label.setVisible(v); });
  }

  /** Forgets every press, release and held key (between phases). */
  reset(): void {
    this.presses.clear();
    this.releases.clear();
    this.tapCount = 0;
    this.dragX = this.dragY = 0;
  }

  /** True once per press of the action since the last call. */
  pressed(id: string): boolean {
    const n = this.presses.get(id) ?? 0;
    if (n <= 0) return false;
    this.presses.set(id, n - 1);
    return true;
  }

  released(id: string): boolean {
    const n = this.releases.get(id) ?? 0;
    if (n <= 0) return false;
    this.releases.set(id, n - 1);
    return true;
  }

  isDown(id: string): boolean {
    if ((this.keyDown.get(id)?.size ?? 0) > 0) return true;
    for (const b of this.fingers.values()) if (b === id) return true;
    return false;
  }

  /** Any tap on the screen or Space / Enter since the last call (to go on from a card). */
  tapped(): boolean {
    const t = this.tapCount > 0;
    this.tapCount = 0;
    return t;
  }

  private hit(x: number, y: number): PadButton | null {
    let best: PadButton | null = null, bd = Infinity;
    for (const d of this.defs) {
      if (d.hidden) continue;
      const r = (d.r ?? 92) * 1.3;
      const dist = Math.hypot(x - d.x, y - d.y);
      if (dist < r && dist < bd) { best = d; bd = dist; }
    }
    return best;
  }

  private press(id: string): void {
    this.presses.set(id, (this.presses.get(id) ?? 0) + 1);
    const v = this.visuals.find((o) => o.def.id === id);
    if (v) {
      v.ring.setFillStyle(v.def.color, 0.75);
      this.scene.tweens.add({ targets: [v.ring, v.label], scale: 0.9, duration: 50, yoyo: true });
    }
  }

  private release(id: string): void {
    this.releases.set(id, (this.releases.get(id) ?? 0) + 1);
    if (!this.isDown(id)) {
      const v = this.visuals.find((o) => o.def.id === id);
      v?.ring.setFillStyle(v.def.color, 0.38);
    }
  }

  private onKeyDown(e: KeyboardEvent): void {
    if (e.repeat || !this.enabled) return;
    if (e.code === 'Space' || e.code === 'Enter') this.tapCount++;
    for (const d of this.defs) {
      if (!d.keys.includes(e.code)) continue;
      const set = this.keyDown.get(d.id) ?? new Set<string>();
      const was = set.size > 0;
      set.add(e.code);
      this.keyDown.set(d.id, set);
      if (!was) this.press(d.id);
    }
  }

  private onKeyUp(e: KeyboardEvent): void {
    for (const d of this.defs) {
      const set = this.keyDown.get(d.id);
      if (!set?.has(e.code)) continue;
      set.delete(e.code);
      if (!set.size) this.release(d.id);
    }
  }

  private onDown(p: Phaser.Input.Pointer): void {
    if (!this.enabled) return;
    const { width } = this.scene.scale;
    if (p.x > width - PAUSE_ZONE && p.y < PAUSE_ZONE) return;
    this.tapCount++;
    const b = this.touch ? this.hit(p.x, p.y) : null;
    if (b) {
      this.fingers.set(p.id, b.id);
      this.press(b.id);
      return;
    }
    if (this.dragArea && this.dragId < 0) {
      this.dragId = p.id;
      this.dragging = true;
      this.last = { x: p.x, y: p.y };
    }
  }

  private onMove(p: Phaser.Input.Pointer): void {
    if (p.id !== this.dragId) return;
    this.dragX += p.x - this.last.x;
    this.dragY += p.y - this.last.y;
    this.last = { x: p.x, y: p.y };
  }

  private onUp(p: Phaser.Input.Pointer): void {
    const b = this.fingers.get(p.id);
    if (b) {
      this.fingers.delete(p.id);
      this.release(b);
    }
    if (p.id === this.dragId) {
      this.dragId = -1;
      this.dragging = false;
    }
  }

  /** Reads and clears the drag. */
  takeDrag(): { x: number; y: number } {
    const d = { x: this.dragX, y: this.dragY };
    this.dragX = this.dragY = 0;
    return d;
  }
}
