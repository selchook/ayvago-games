// Long jump: tap RUN for speed down the runway, press JUMP at the board (over the line is a
// foul), keep holding to raise the take-off angle and let go near 45°. Three jumps; the best
// counts. The flight plays in slow motion.
import Phaser from 'phaser';
import { t, txt } from '@core';
import { THREE } from '@core/three';
import { SportEvent, Cadence, stride } from './base';
import { BOARD_X, JUMP_Z } from '../stadium';
import { Meter, hexs } from '../panels';
import { rivalMark, type EventId } from '../scoring';
import { metres, num } from '../strings';
import { box } from '../look';
import type { PadButton } from '../pad';

export const LONGJUMP_TUNE = {
  normal: { useful: 5.0, vmax: 10.6, acc: 1.25, angleRate: 78, eff: 0.78, foulSlack: 0.1 },
  easy: { useful: 4.2, vmax: 10.6, acc: 1.45, angleRate: 52, eff: 0.8, foulSlack: 0.25 },
};
const RUNUP = 34;
const G = 9.81;

type State = 'ready' | 'run' | 'angle' | 'flight' | 'land' | 'over';

export class LongJump extends SportEvent {
  readonly id: EventId = 'longjump';
  private state: State = 'ready';
  private attempt = 0;
  private x = 0;
  private v = 0;
  private t = 0;
  private stateT = 0;
  private cad = new Cadence();
  private angle = 0;
  private takeoffX = 0;
  private takeV = 0;
  private landX = 0;
  private flightT = 1;
  private peak = 1;
  private foul = false;
  private mine: number[] = [];
  private rivals: number[][] = [];
  private meter!: Meter;
  private gauge!: Phaser.GameObjects.Graphics;
  private gaugeText!: Phaser.GameObjects.Text;
  private board!: Phaser.GameObjects.Container;
  private boardRows: Phaser.GameObjects.Text[] = [];
  private zone: THREE.Mesh | null = null;

  private get tune() {
    return this.easy ? LONGJUMP_TUNE.easy : LONGJUMP_TUNE.normal;
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

  setup(): void {
    const s = this.s;
    s.useVenue(s.venues.track);
    s.entrants.forEach((e, i) => {
      const a = e.athlete;
      if (i === 0) a.root.position.set(BOARD_X - RUNUP, 0, JUMP_Z);
      else a.root.position.set(BOARD_X + 11.6 + i * 0.95, 0, JUMP_Z - 2.25 - (i % 2) * 0.35);
      a.setPose(i === 0 ? 'stand' : 'front');
    });
    s.cut(new THREE.Vector3(BOARD_X + 6, 2.6, JUMP_Z + 9), new THREE.Vector3(BOARD_X + 2, 0.6, JUMP_Z));
    s.fov(50, true);
    // the rivals' three jumps: one is their mark, the others shorter or fouls
    this.rivals = [];
    for (let i = 1; i < 4; i++) {
      const best = rivalMark('longjump', s.entrants[i].base + (Math.random() - 0.5) * 0.6, this.easy);
      const k = (Math.random() * 3) | 0;
      this.rivals[i] = [0, 1, 2].map((j) => (j === k ? best : Math.random() < 0.18 ? NaN : Math.round((best - 0.05 - Math.random() * 0.4) * 100) / 100));
    }
    if (this.easy) {
      // Easy: the last metre before the board is marked
      this.zone = box(1.0, 0.012, 1.3, 0x7dff9a, BOARD_X - 0.7, 0.012, JUMP_Z, 'none');
      (this.zone.material as THREE.MeshLambertMaterial).transparent = true;
      (this.zone.material as THREE.MeshLambertMaterial).opacity = 0.5;
      s.venues.track.add(this.zone);
    }
  }

  idle(): void {
    this.s.camTo(new THREE.Vector3(BOARD_X + 3, 2.4, JUMP_Z + 8.5), new THREE.Vector3(BOARD_X + 1, 0.6, JUMP_Z), 0.5);
  }

  begin(): void {
    const s = this.s;
    this.meter = new Meter(s, 640, 636, 340, t('speed'));
    this.gauge = s.add.graphics().setDepth(9000);
    this.gaugeText = txt(s, 640, 330, '', { title: true, size: 30, color: '#ffffff' }).setDepth(9001);
    this.board = s.add.container(0, 0).setDepth(9000);
    const bg = s.add.graphics().fillStyle(0x0b1028, 0.72).fillRoundedRect(1004, 128, 252, 200, 22);
    this.board.add([bg, txt(s, 1130, 152, t('best'), { size: 18, color: '#9fb3d9', strokeThickness: 0 })]);
    this.boardRows = s.entrants.map((e, i) => {
      const y = 190 + i * 38;
      this.board.add(s.add.circle(1028, y, 8, e.color).setStrokeStyle(2, 0xffffff));
      this.board.add(txt(s, 1044, y, e.name, { size: 20, color: e.player ? '#3ee6ff' : '#ffffff', strokeThickness: 3 }).setOrigin(0, 0.5));
      const v = txt(s, 1240, y, '–', { title: true, size: 20, color: '#ffffff', strokeThickness: 3 }).setOrigin(1, 0.5);
      this.board.add(v);
      return v;
    });
    s.ui.add([this.meter.root, this.gauge, this.gaugeText, this.board]);
    this.attempt = 0;
    this.mine = [];
    this.nextAttempt();
  }

  private nextAttempt(): void {
    const s = this.s;
    this.attempt++;
    this.state = 'ready';
    this.stateT = 0;
    this.x = BOARD_X - RUNUP;
    this.v = 0;
    this.t = 0;
    this.foul = false;
    this.cad.reset();
    s.pad.reset();
    const a = s.player.athlete;
    a.root.position.set(this.x, 0, JUMP_Z);
    a.lift = 0;
    a.setPose('stand');
    this.gauge.clear();
    this.gaugeText.setText('');
    this.meter.set(0);
    s.call(t('attempt', { n: this.attempt }), '#ffffff', { size: 48, hold: 900 });
    s.cut(new THREE.Vector3(this.x - 1, 2.6, JUMP_Z + 7.5), new THREE.Vector3(this.x + 5, 0.9, JUMP_Z));
    s.crowdLoop.level(0.12, 600);
  }

  update(dt: number, rdt: number): void {
    const s = this.s;
    const tn = this.tune;
    const a = s.player.athlete;
    this.stateT += rdt;
    this.t += dt;
    if (this.state === 'ready' || this.state === 'run') {
      let taps = 0;
      while (s.pad.pressed('RUN')) taps++;
      if (taps && this.state === 'ready') {
        this.state = 'run';
        this.t = 0;
        this.v = 2;
      }
      for (let k = 0; k < taps; k++) this.cad.tap(this.t);
      if (taps) s.sfx('step', { volume: 0.22 });
      if (this.state === 'run' && s.pad.pressed('J')) {
        // the take-off is where the athlete is when JUMP lands, before this frame's stride
        this.takeoff();
      } else if (this.state === 'run') {
        const target = tn.vmax * stride(this.cad.rate(this.t), tn.useful, this.cad.evenness());
        this.v += (target - this.v) * Math.min(1, dt * (target > this.v ? tn.acc : 1.2));
        this.x += this.v * dt;
        a.run(this.x, 1.15);
        this.meter.set(this.v / tn.vmax);
        if (this.x > BOARD_X + 0.6) {
          // ran through the board
          this.foul = true;
          this.mine.push(NaN);
          this.takeoffX = this.x;
          this.landX = this.x + 1.2;
          this.state = 'land';
          this.stateT = 0;
          a.setPose('skid');
          this.callFoul();
        }
      } else {
        while (s.pad.pressed('J')) { /* not yet */ }
      }
      s.camTo(new THREE.Vector3(this.x + 1, 3.0, JUMP_Z + 9), new THREE.Vector3(this.x + 5.5, 0.8, JUMP_Z), 5);
    } else if (this.state === 'angle') {
      // the take-off: hold to raise the angle (in real time; the world runs slowly meanwhile)
      this.angle = Math.min(80, this.angle + tn.angleRate * rdt);
      this.x += this.v * dt * 0.6;
      a.lift = Math.min(0.5, this.stateT * 0.9);
      this.drawGauge();
      if (!s.pad.isDown('J') || this.angle >= 80) this.launch();
      s.camTo(new THREE.Vector3(this.x + 0.5, 2.2, JUMP_Z + 6.5), new THREE.Vector3(this.x + 3, 1.0, JUMP_Z), 4);
    } else if (this.state === 'flight') {
      const p = Math.min(1, this.t / this.flightT);
      this.x = this.takeoffX + (this.landX - this.takeoffX) * p;
      a.lift = 0.5 * (1 - p) + 4 * this.peak * p * (1 - p);
      a.setPose(p < 0.55 ? 'jump' : 'fall');
      s.camTo(new THREE.Vector3(this.x + 0.5, 2.0 + a.lift * 0.6, JUMP_Z + 7.4), new THREE.Vector3(this.x + 2.2, 0.9 + a.lift * 0.75, JUMP_Z), 5);
      if (p >= 1) this.land();
    } else if (this.state === 'land') {
      if (this.foul && this.x < this.landX) {
        this.x = Math.min(this.landX, this.x + Math.max(1, this.v *= 0.9) * dt);
        a.setPose('skid');
      }
      s.camTo(new THREE.Vector3(this.landX - 1.5, 1.9, JUMP_Z + 6), new THREE.Vector3(this.landX - 2, 0.3, JUMP_Z), 3);
      if (this.stateT > 2.4) this.afterJump();
    }
    a.root.position.x = this.x;
    s.entrants.forEach((e, i) => {
      if (i > 0) e.athlete.setPose(this.state === 'land' && !this.foul && this.stateT > 0.4 ? (Math.floor(this.stateT * 3 + i) % 2 ? 'cheer1' : 'front') : 'front');
    });
  }

  private takeoff(): void {
    const s = this.s;
    this.takeoffX = this.x;
    this.takeV = this.v;
    this.foul = this.x > BOARD_X + this.tune.foulSlack;
    this.state = 'angle';
    this.stateT = 0;
    this.angle = 8;
    s.player.athlete.setPose('jump');
    s.sfx('jump', { volume: 0.6 });
    s.slowMo(0.22, 4000);
    this.meter.set(0);
    if (this.foul) this.callFoul();
    else {
      const gap = BOARD_X - this.x;
      if (gap < 0.12) s.popAt(new THREE.Vector3(BOARD_X, 1.8, JUMP_Z + 0.6), t('perfect'), '#7dff9a', 22);
    }
  }

  private callFoul(): void {
    const s = this.s;
    s.sfx('whistle', { volume: 0.8 });
    s.call(t('foul'), '#ff6b4a', { size: 64, hold: 1200 });
    s.shake(0.004, 160);
  }

  private launch(): void {
    const tn = this.tune;
    const th = Phaser.Math.DegToRad(this.angle);
    const dist = tn.eff * (this.takeV * this.takeV / G) * Math.sin(2 * th);
    this.takeoffX = this.x;
    this.landX = this.takeoffX + Math.max(0.6, dist);
    this.flightT = 0.45 + 0.75 * Math.sin(th) + dist * 0.02;
    this.peak = Math.min(2.0, 0.25 + (dist * Math.tan(th)) / 6);
    this.state = 'flight';
    this.t = 0;
    this.stateT = 0;
    this.s.slowMo(0.45, 2600);
    this.gaugeText.setText(t('angle', { a: Math.round(this.angle) }));
    this.s.tweens.add({ targets: [this.gaugeText, this.gauge], alpha: 0, delay: 700, duration: 300, onComplete: () => { this.gauge.clear(); this.gauge.setAlpha(1); this.gaugeText.setText('').setAlpha(1); } });
  }

  private land(): void {
    const s = this.s;
    this.state = 'land';
    this.stateT = 0;
    const a = s.player.athlete;
    a.lift = 0;
    a.setPose('duck');
    const inPit = this.landX > BOARD_X + 0.5;
    s.emit(new THREE.Vector3(this.landX, 0.1, JUMP_Z), 26, [0xe8cf95, 0xd9b979, 0xfff2cc], { speed: 2.2, up: 2.6, life: 0.7, size: 0.16 });
    s.sfx(inPit ? 'sand' : 'step', { volume: 0.8 });
    s.shake(0.004, 140);
    if (this.foul) {
      this.mine.push(NaN);
      return;
    }
    const mark = Math.round((this.landX - BOARD_X) * 100) / 100;
    this.mine.push(mark);
    s.popAt(new THREE.Vector3(this.landX, 1.6, JUMP_Z), metres(mark), '#ffd23f', 40);
    const best = Math.max(...this.mine.filter((m) => !Number.isNaN(m)));
    const lead = [1, 2, 3].every((i) => !(Math.max(...this.rivals[i].filter((m) => !Number.isNaN(m))) > best));
    s.cheer(mark >= 8 ? 1 : mark >= 7.2 ? 0.7 : 0.4);
    if (lead && mark === best) s.sfx('clear', { volume: 0.5 });
  }

  private afterJump(): void {
    const s = this.s;
    const r = this.attempt - 1;
    // this round's rival jumps go up on the board
    const bests = [this.mine, ...this.rivals.slice(1)].map((list, i) => {
      const done = i === 0 ? list : list.slice(0, r + 1);
      const valid = done.filter((m) => !Number.isNaN(m));
      return valid.length ? Math.max(...valid) : NaN;
    });
    bests.forEach((b, i) => this.boardRows[i].setText(Number.isNaN(b) ? (i === 0 && this.mine.length ? 'X' : '–') : num(b, 2)));
    for (let i = 1; i < 4; i++) {
      const m = this.rivals[i][r];
      const row = this.boardRows[i];
      row.setColor(Number.isNaN(m) ? '#ff9a7a' : '#7dff9a');
      s.tweens.add({ targets: row, scale: 1.25, duration: 160, yoyo: true, delay: i * 180, onComplete: () => row.setColor('#ffffff') });
    }
    s.sfx('tick', { volume: 0.5 });
    if (this.attempt >= 3) {
      this.state = 'over';
      this.resultDelay = 900;
      s.finishEvent();
    } else this.nextAttempt();
  }

  private drawGauge(): void {
    const g = this.gauge;
    const cx = 640, cy = 300, r = 120;
    g.clear();
    const D = Phaser.Math.DegToRad;
    g.fillStyle(0x0b1028, 0.7).slice(cx, cy, r + 14, D(-90), D(0), false).fillPath();
    const zone = this.easy ? [34, 56] : [39, 51];
    g.fillStyle(0x7dff9a, 0.6).slice(cx, cy, r, D(-zone[1]), D(-zone[0]), false).fillPath();
    g.lineStyle(2, 0xffffff, 0.4).beginPath().arc(cx, cy, r, D(-90), D(0), false).strokePath();
    const a = Phaser.Math.DegToRad(-this.angle);
    g.lineStyle(7, 0xffd23f, 1).lineBetween(cx, cy, cx + Math.cos(a) * r, cy + Math.sin(a) * r);
    g.fillStyle(0xffffff, 1).fillCircle(cx, cy, 8);
    this.gaugeText.setPosition(cx + 70, cy + 30).setText(`${Math.round(this.angle)}°`).setColor(hexs(this.angle >= zone[0] && this.angle <= zone[1] ? 0x7dff9a : 0xffffff));
  }

  marks(): number[] {
    const best = (list: number[]) => {
      const v = list.filter((m) => !Number.isNaN(m));
      return v.length ? Math.max(...v) : NaN;
    };
    return [best(this.mine), best(this.rivals[1]), best(this.rivals[2]), best(this.rivals[3])];
  }

  cleanup(): void {
    if (this.zone) this.s.venues.track.remove(this.zone);
    this.s.player.athlete.lift = 0;
  }
}
