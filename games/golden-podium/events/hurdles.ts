// 100 m hurdles: tap RUN in rhythm and JUMP just before each of the ten hurdles. A jump too
// early or too late knocks the hurdle down and costs speed; no jump at all costs more.
import { t } from '@core';
import { THREE } from '@core/three';
import { Sprint } from './sprint';
import { canvasTex, type Athlete } from '../athlete';
import { box, mesh } from '../look';
import { LANE_W } from '../stadium';
import type { EventId } from '../scoring';
import type { PadButton } from '../pad';

export const HURDLES_TUNE = {
  // window: the part of the flight in which the hurdle may pass under the athlete
  normal: { useful: 5.0, vmax: 8.7, acc: 1.6, window: [0.3, 0.72], hitSlow: 0.62, noJump: 0.45 },
  easy: { useful: 4.2, vmax: 8.7, acc: 1.8, window: [0.14, 0.86], hitSlow: 0.76, noJump: 0.6 },
};
const AIR = 0.5;
const HURDLE_H = 0.84;
export const HURDLE_X = Array.from({ length: 10 }, (_, k) => 13 + k * 8.5);

interface Hurdle {
  g: THREE.Group;
  bar: THREE.Mesh;
  x: number;
  lane: number;
  down: boolean;
}

export class Hurdles extends Sprint {
  readonly id: EventId = 'hurdles';
  protected tau = 1.25;
  private group = new THREE.Group();
  private hurdles: Hurdle[] = [];
  private airStart = -1;
  private prevNow = 0;
  private next = 0;
  private rivalKnock: boolean[][] = [];
  private barMat!: THREE.MeshLambertMaterial;
  private glowMat!: THREE.MeshLambertMaterial;

  protected get tune() {
    return this.easy ? HURDLES_TUNE.easy : HURDLES_TUNE.normal;
  }

  buttons(): PadButton[] {
    return [
      { id: 'RUN', label: t('b_run'), x: 150, y: 590, color: 0x22c3b5, keys: ['ArrowLeft', 'ArrowRight', 'KeyA', 'KeyD'] },
      { id: 'J', label: t('b_jump'), x: 1130, y: 590, color: 0xff6b4a, keys: ['Space', 'ArrowUp', 'KeyW', 'Enter'] },
    ];
  }

  picture(): string {
    return `ch-${this.s.player.id}-jump`;
  }

  protected placeExtras(): void {
    const stripes = canvasTex('hurdlebar', 128, 16, (c) => {
      for (let i = 0; i < 8; i++) {
        c.fillStyle = i % 2 ? '#201e1d' : '#ffffff';
        c.fillRect(i * 16, 0, 16, 16);
      }
    });
    this.barMat = new THREE.MeshLambertMaterial({ map: stripes });
    this.glowMat = new THREE.MeshLambertMaterial({ color: 0x7dff9a, emissive: 0x2a8a3a });
    this.hurdles = [];
    for (let lane = 0; lane < 4; lane++) {
      for (const hx of HURDLE_X) {
        const g = new THREE.Group();
        const w = LANE_W * 0.82;
        for (const sd of [-1, 1]) {
          g.add(box(0.05, HURDLE_H, 0.05, 0xdfe3ea, 0, HURDLE_H / 2, sd * w / 2, 'cast'));
          g.add(box(0.7, 0.05, 0.06, 0x8a8f9e, -0.33, 0.025, sd * w / 2, 'cast'));
        }
        const bar = mesh(new THREE.BoxGeometry(0.04, 0.12, w), this.barMat, 'cast');
        bar.userData.ownMaterial = false;
        bar.position.y = HURDLE_H - 0.06;
        g.add(bar);
        g.position.set(hx, 0, this.lane(lane));
        this.group.add(g);
        this.hurdles.push({ g, bar, x: hx, lane, down: false });
      }
    }
    this.s.venues.track.add(this.group);
    // which hurdles each rival clips (they lose the time in their mark already)
    this.rivalKnock = [0, 1, 2, 3].map(() => HURDLE_X.map(() => Math.random() < 0.12));
  }

  protected reset(): void {
    super.reset();
    this.airStart = -1;
    this.prevNow = 0;
    this.next = 0;
    for (const h of this.hurdles) {
      h.down = false;
      h.g.rotation.z = 0;
    }
  }

  /** Every RUN press counts (no alternation in the hurdles). */
  protected runTaps(): number {
    let n = 0;
    while (this.s.pad.pressed('RUN')) n++;
    return n;
  }

  protected jumpTapsEarly(): number {
    while (this.s.pad.pressed('J')) { /* ignored before the gun */ }
    return 0;
  }

  private get air(): boolean {
    return this.airStart >= 0;
  }

  protected playerInput(now: number): void {
    while (this.s.pad.pressed('J')) {
      if (!this.air && this.moved) {
        this.airStart = now;
        this.s.sfx('jump', { volume: 0.45 });
      }
    }
    if (this.air && now - this.airStart >= AIR) {
      this.airStart = -1;
      this.v *= 0.985;
      this.s.sfx('step', { volume: 0.35 });
    }
    const a = this.s.player.athlete;
    a.lift = this.air ? Math.sin(((now - this.airStart) / AIR) * Math.PI) * 0.78 : 0;
    this.hitT -= Math.max(0, now - this.prevNow);
    this.prevNow = now;
  }

  protected speedCap(): number {
    return this.hitT > 0 ? 0.6 : 1;
  }

  protected afterMove(prev: number, x: number, now: number): void {
    const tn = this.tune;
    // Easy: the next hurdle lights up while a jump now would clear it
    const nextH = HURDLE_X[this.next];
    if (nextH !== undefined) {
      const h = this.hurdles[this.next];
      if (this.easy) {
        const reach = Math.max(0.5, this.v * AIR);
        const ph = (nextH - x) / reach;
        h.bar.material = !this.air && ph >= tn.window[0] && ph <= tn.window[1] ? this.glowMat : this.barMat;
      }
      if (prev < nextH && x >= nextH) {
        h.bar.material = this.barMat;
        this.next++;
        const p = new THREE.Vector3(nextH, 1.2, this.lane(0));
        const phase = this.air ? (now - this.airStart) / AIR : -1;
        if (phase >= tn.window[0] && phase <= tn.window[1]) {
          this.s.sfx('clear', { volume: 0.3 });
          this.s.popAt(p.clone().setY(2.6), t('clear'), '#7dff9a', 20);
        } else {
          this.knock(h, true);
          this.v *= this.air ? tn.hitSlow : tn.noJump;
          this.hitT = 0.35;
          this.s.popAt(p.clone().setY(2.6), t('hit'), '#ff9a7a', 22);
          this.s.shake(0.005, 160);
        }
      }
    }
  }

  private knock(h: Hurdle, loud: boolean): void {
    if (h.down) return;
    h.down = true;
    this.s.sfx('hurdle', { volume: loud ? 0.7 : 0.3 });
    const g = h.g;
    const t0 = { r: 0 };
    this.s.tweens.add({ targets: t0, r: 1, duration: 260, ease: 'Quad.easeIn', onUpdate: () => { g.rotation.z = -1.45 * t0.r; } });
    if (loud) this.s.emit(new THREE.Vector3(h.x, 0.2, g.position.z), 8, [0xc8553d, 0xe0a080], { speed: 1.6, up: 1.5, life: 0.5, size: 0.14 });
  }

  protected animate(i: number, a: Athlete, speed: number, x: number): void {
    if (i === 0) {
      if (this.air) a.setPose('jump');
      else if (this.hitT > 0) a.setPose('hit');
      else a.run(x, 1.1);
      return;
    }
    // rivals hop each hurdle (2.3 m before to 2.3 m after it)
    let lift = 0;
    for (let k = 0; k < HURDLE_X.length; k++) {
      const d = x - (HURDLE_X[k] - 2.3);
      if (d >= 0 && d <= 4.6) {
        lift = Math.sin((d / 4.6) * Math.PI) * 0.75;
        if (d > 2.3 && this.rivalKnock[i][k]) this.knock(this.hurdles[i * HURDLE_X.length + k], false);
      }
    }
    a.lift = lift;
    if (lift > 0.05) a.setPose('jump');
    else a.run(x, 1.1);
    void speed;
  }

  cleanup(): void {
    super.cleanup();
    this.s.venues.track.remove(this.group);
    for (const e of this.s.entrants) e.athlete.lift = 0;
    this.barMat.dispose();
    this.glowMat.dispose();
  }
}
