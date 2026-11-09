// Car controls for touch screens: steer left / right under the left thumb, GAS, BRAKE and NITRO
// under the right one. Every finger is read on every frame, so any mix of buttons can be held
// at once (steer + gas, gas + nitro) and a thumb may slide from one button onto the next.
import { Phaser, txt, t } from '@core';

type Zone = 'left' | 'right' | 'gas' | 'brake' | 'nitro';

const DEPTH = 9400;
const STEER_Y = 606;
const STEER_R = 78;
const LEFT_X = 106;
const RIGHT_X = 276;
const GAS = { x: 1180, y: 566, w: 150, h: 220 };
const BRAKE = { x: 1018, y: 610, w: 132, h: 132 };
const NITRO = { x: 1018, y: 448, r: 64 };

interface Btn {
  zone: Zone;
  root: Phaser.GameObjects.Container;
  face: Phaser.GameObjects.Graphics;
  draw: (g: Phaser.GameObjects.Graphics, down: boolean) => void;
  down: boolean;
}

export class TouchPad {
  /** -1 (left) .. 1 (right). */
  steer = 0;
  gas = false;
  brake = false;
  private nitroHit = false;
  private held = new Map<number, Zone | null>();
  private btns: Btn[] = [];
  private nitroCount!: Phaser.GameObjects.Text;
  readonly root: Phaser.GameObjects.Container;

  constructor(private scene: Phaser.Scene) {
    scene.input.addPointer(3);
    this.root = scene.add.container(0, 0).setDepth(DEPTH).setScrollFactor(0);
    const arrow = (dir: number) => (g: Phaser.GameObjects.Graphics, down: boolean) => {
      g.clear();
      g.fillStyle(0x0b1020, down ? 0.55 : 0.35).fillCircle(0, 0, STEER_R);
      g.lineStyle(5, 0xffffff, down ? 0.95 : 0.55).strokeCircle(0, 0, STEER_R);
      g.fillStyle(0xffffff, down ? 1 : 0.85);
      g.fillTriangle(dir * 34, 0, -dir * 20, -32, -dir * 20, 32);
    };
    const pedal = (w: number, h: number, color: number) => (g: Phaser.GameObjects.Graphics, down: boolean) => {
      g.clear();
      g.fillStyle(color, down ? 0.75 : 0.4).fillRoundedRect(-w / 2, -h / 2, w, h, 26);
      g.lineStyle(5, 0xffffff, down ? 0.95 : 0.55).strokeRoundedRect(-w / 2, -h / 2, w, h, 26);
      // tread lines on the pedal
      g.lineStyle(4, 0xffffff, down ? 0.4 : 0.22);
      for (let k = 0; k < 3; k++) g.lineBetween(-w / 2 + 28, h / 2 - 28 - k * 16, w / 2 - 28, h / 2 - 28 - k * 16);
    };
    const nitro = (g: Phaser.GameObjects.Graphics, down: boolean) => {
      g.clear();
      g.fillStyle(0xff7a1a, down ? 0.8 : 0.42).fillCircle(0, 0, NITRO.r);
      g.lineStyle(5, 0xffffff, down ? 0.95 : 0.6).strokeCircle(0, 0, NITRO.r);
      g.fillStyle(0xffd23f, down ? 1 : 0.9).fillTriangle(-12, 6, 6, -26, 0, 0).fillTriangle(12, -6, -6, 26, 0, 0);
    };
    this.add('left', LEFT_X, STEER_Y, arrow(-1));
    this.add('right', RIGHT_X, STEER_Y, arrow(1));
    this.add('gas', GAS.x, GAS.y, pedal(GAS.w, GAS.h, 0x2fae5a), t('gas'), -40);
    this.add('brake', BRAKE.x, BRAKE.y, pedal(BRAKE.w, BRAKE.h, 0xe8402f), t('brake'), -22);
    const n = this.add('nitro', NITRO.x, NITRO.y, nitro);
    this.nitroCount = txt(scene, 40, 44, '', { title: true, size: 26, color: '#ffffff', strokeThickness: 6 }).setOrigin(0.5);
    n.root.add(this.nitroCount);
  }

  private add(zone: Zone, x: number, y: number, draw: Btn['draw'], label?: string, ly = 0): Btn {
    const face = this.scene.add.graphics();
    const root = this.scene.add.container(x, y, [face]);
    if (label) root.add(txt(this.scene, 0, ly, label, { title: true, size: label.length > 4 ? 22 : 26, color: '#ffffff', strokeThickness: 5 }).setOrigin(0.5));
    draw(face, false);
    this.root.add(root);
    const b: Btn = { zone, root, face, draw, down: false };
    this.btns.push(b);
    return b;
  }

  private zoneAt(x: number, y: number): Zone | null {
    // generous areas around the drawn buttons, so a thumb that drifts a little still counts
    if (y > STEER_Y - STEER_R - 40 && x < RIGHT_X + STEER_R + 50) return x < (LEFT_X + RIGHT_X) / 2 ? 'left' : 'right';
    if (Math.hypot(x - NITRO.x, y - NITRO.y) < NITRO.r + 18) return 'nitro';
    if (x > GAS.x - GAS.w / 2 - 8 && y > GAS.y - GAS.h / 2 - 20) return 'gas';
    if (x > BRAKE.x - BRAKE.w / 2 - 30 && y > BRAKE.y - BRAKE.h / 2 - 16) return 'brake';
    return null;
  }

  /** Reads every finger on the screen. Call once per frame. */
  update(): void {
    let l = false, r = false, gas = false, brake = false, nitro = false;
    const seen = new Set<number>();
    for (const p of this.scene.input.manager.pointers) {
      if (!p || !p.isDown) continue;
      seen.add(p.id);
      const z = this.root.visible ? this.zoneAt(p.x, p.y) : null;
      const before = this.held.get(p.id);
      if (z === 'nitro' && before !== 'nitro') this.nitroHit = true;
      this.held.set(p.id, z);
      if (z === 'left') l = true;
      else if (z === 'right') r = true;
      else if (z === 'gas') gas = true;
      else if (z === 'brake') brake = true;
      else if (z === 'nitro') nitro = true;
    }
    for (const id of [...this.held.keys()]) if (!seen.has(id)) this.held.delete(id);
    this.steer = (r ? 1 : 0) - (l ? 1 : 0);
    // a thumb on NITRO keeps the gas on: firing the boost never lifts off the pedal
    this.gas = gas || nitro;
    this.brake = brake;
    const state: Record<Zone, boolean> = { left: l, right: r, gas, brake, nitro };
    for (const b of this.btns) {
      const d = state[b.zone];
      if (d === b.down) continue;
      b.down = d;
      b.draw(b.face, d);
      b.root.setScale(d ? 0.94 : 1);
    }
  }

  /** True once per finger landing (or sliding) on NITRO. */
  takeNitro(): boolean {
    const v = this.nitroHit;
    this.nitroHit = false;
    return v;
  }

  setNitro(n: number): void {
    this.nitroCount.setText(`×${n}`);
    const b = this.btns.find((x) => x.zone === 'nitro');
    b?.root.setAlpha(n > 0 ? 1 : 0.5);
  }

  setVisible(v: boolean): void {
    this.root.setVisible(v);
    if (!v) {
      this.steer = 0;
      this.gas = this.brake = false;
      this.nitroHit = false;
    }
  }

  /** World positions of the button groups, for the first-race hint. */
  static readonly anchors = {
    steer: { x: (LEFT_X + RIGHT_X) / 2, y: STEER_Y - STEER_R },
    pedals: { x: 1050, y: NITRO.y - NITRO.r - 6 },
  };

  /** A short pulse on every button (first race). */
  pulse(): void {
    this.btns.forEach((b, i) => {
      this.scene.tweens.add({ targets: b.root, scale: { from: 1, to: 1.12 }, duration: 260, yoyo: true, repeat: 2, delay: 120 * i });
    });
  }
}
