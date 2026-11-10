// Archery: six arrows at a target 50 m away. The view zooms in over the bow; the sight sways
// with the archer's breathing and the wind blows the arrow sideways in flight, one ring per
// wind point. Aim with a drag or the arrow keys, SHOOT to release. Rings score 1–10.
import Phaser from 'phaser';
import { t, txt } from '@core';
import { THREE } from '@core/three';
import { SportEvent } from './base';
import { FACE_R, RANGE, TARGET_Y, rangeZ } from '../stadium';
import { hexs } from '../panels';
import { rivalMark, type EventId } from '../scoring';
import { mesh, lambert } from '../look';
import type { PadButton } from '../pad';
import type { Shot } from '../portraits';

export const ARCHERY_TUNE = {
  normal: { sway: 0.085, maxWind: 4, drift: 0.06, aimSpeed: 0.32, ghost: false, time: 15 },
  easy: { sway: 0.045, maxWind: 2, drift: 0.06, aimSpeed: 0.28, ghost: true, time: 20 },
};
const RING = FACE_R / 10;
const FLIGHT = 0.55;
const ZOOM_FOV = 3.4;
const PX_PER_M = 720 / (2 * RANGE * Math.tan(Phaser.Math.DegToRad(ZOOM_FOV / 2)));
// the sight line, in front of the archer's bow
const EYE = new THREE.Vector3(1.3, 1.55, 0);
/** Archers stand side-on, the left (bow) side towards the targets. */
const ARCHER_YAW = Math.PI / 2;

type State = 'wide' | 'aim' | 'flight' | 'hit' | 'over';

export class Archery extends SportEvent {
  readonly id: EventId = 'archery';
  private state: State = 'wide';
  private n = 0;
  private stT = 0;
  private aim = { x: 0, y: 0 };
  private sway = { x: 0, y: 0 };
  private ph = [0, 0, 0, 0];
  private wind = 0;
  private shot = { x: 0, y: 0 };
  private mine: number[] = [];
  private rivalArrows: number[][] = [];
  private arrows: THREE.Object3D[] = [];
  private flying: THREE.Object3D | null = null;
  private reticle!: Phaser.GameObjects.Graphics;
  private windText!: Phaser.GameObjects.Text;
  private windArrow!: Phaser.GameObjects.Graphics;
  private board!: Phaser.GameObjects.Container;
  private boardRows: Phaser.GameObjects.Text[] = [];
  private arrowText!: Phaser.GameObjects.Text;
  private group = new THREE.Group();

  private get tune() {
    return this.easy ? ARCHERY_TUNE.easy : ARCHERY_TUNE.normal;
  }

  buttons(): PadButton[] {
    return [
      { id: 'SHOOT', label: t('b_shoot'), x: 1130, y: 590, color: 0xff6b4a, keys: ['Space', 'Enter', 'KeyZ'] },
      { id: 'AL', label: '', x: 0, y: 0, color: 0, keys: ['ArrowLeft', 'KeyA'], hidden: true },
      { id: 'AR', label: '', x: 0, y: 0, color: 0, keys: ['ArrowRight', 'KeyD'], hidden: true },
      { id: 'AU', label: '', x: 0, y: 0, color: 0, keys: ['ArrowUp', 'KeyW'], hidden: true },
      { id: 'AD', label: '', x: 0, y: 0, color: 0, keys: ['ArrowDown', 'KeyS'], hidden: true },
    ];
  }

  picture(): Shot {
    return { clip: 'holding-right', at: 0, yaw: Math.PI / 2 - 0.5, bow: true };
  }

  private z0(i = 0): number {
    return rangeZ(i);
  }

  setup(): void {
    const s = this.s;
    s.useVenue(s.venues.range);
    s.entrants.forEach((e, i) => {
      const a = e.athlete;
      a.root.position.set(-0.4, 0, this.z0(i));
      // side-on to the targets (facing the camera side), the bow arm out towards them
      a.face(ARCHER_YAW).holdBow(true);
      a.play('holding-right', { fade: 0 });
    });
    s.venues.range.add(this.group);
    this.wideShot(true);
    s.fov(50, true);
    // the rivals' six arrows, adding up to their mark
    this.rivalArrows = [];
    for (let i = 1; i < 4; i++) {
      const total = rivalMark('archery', s.entrants[i].base + (Math.random() - 0.5) * 0.6, this.easy);
      const list = Array.from({ length: 6 }, () => Math.round(total / 6));
      let diff = total - list.reduce((a, b) => a + b, 0);
      for (let k = 0; diff !== 0 && k < 200; k++) {
        const j = (Math.random() * 6) | 0;
        const step = Math.sign(diff);
        if (list[j] + step >= 3 && list[j] + step <= 10) { list[j] += step; diff -= step; }
      }
      // some spread: move a point from one arrow to another now and then
      for (let k = 0; k < 3; k++) {
        const a = (Math.random() * 6) | 0, b = (Math.random() * 6) | 0;
        if (list[a] < 10 && list[b] > 4) { list[a]++; list[b]--; }
      }
      this.rivalArrows[i] = list;
    }
  }

  private wideShot(now = false): void {
    // from the side: the archers face the camera, bow arms out towards the targets
    const pos = new THREE.Vector3(-2.6, 2.3, this.z0(0) + 5.6), look = new THREE.Vector3(9, 1.2, this.z0(1.4));
    if (now) this.s.cut(pos, look);
    else this.s.camTo(pos, look, 3);
  }

  idle(): void {
    this.s.camTo(new THREE.Vector3(-2.2, 2.2, this.z0(0) + 5.2), new THREE.Vector3(9, 1.2, this.z0(1.4)), 0.4);
  }

  begin(): void {
    const s = this.s;
    s.pad.dragArea = true;
    this.reticle = s.add.graphics().setDepth(9000);
    this.windArrow = s.add.graphics().setDepth(9000);
    this.windText = txt(s, 160, 150, '', { title: true, size: 22 }).setDepth(9001);
    this.arrowText = txt(s, 640, 88, '', { title: true, size: 24 }).setDepth(9001);
    this.board = s.add.container(0, 0).setDepth(9000);
    const bg = s.add.graphics().fillStyle(0x0b1028, 0.72).fillRoundedRect(1004, 128, 252, 200, 22);
    this.board.add([bg, txt(s, 1130, 152, t('total'), { size: 18, color: '#9fb3d9', strokeThickness: 0 })]);
    this.boardRows = s.entrants.map((e, i) => {
      const y = 190 + i * 38;
      this.board.add(s.add.circle(1028, y, 8, e.color).setStrokeStyle(2, 0xffffff));
      this.board.add(txt(s, 1044, y, e.name, { size: 20, color: e.player ? '#3ee6ff' : '#ffffff', strokeThickness: 3 }).setOrigin(0, 0.5));
      const v = txt(s, 1240, y, '0', { title: true, size: 20, strokeThickness: 3 }).setOrigin(1, 0.5);
      this.board.add(v);
      return v;
    });
    s.ui.add([this.reticle, this.windArrow, this.windText, this.arrowText, this.board]);
    this.n = 0;
    this.mine = [];
    this.nextArrow();
  }

  private nextArrow(): void {
    const s = this.s;
    this.n++;
    this.state = 'wide';
    this.stT = 0;
    const m = this.tune.maxWind;
    this.wind = Math.round((Math.random() * 2 - 1) * m);
    if (this.n === 1) this.wind = Math.sign(this.wind || 1) * Math.min(1, m);
    this.aim = { x: 0, y: 0 };
    this.ph = [Math.random() * 6, Math.random() * 6, Math.random() * 6, Math.random() * 6];
    this.arrowText.setText(t('arrow', { n: this.n }));
    this.drawWind();
    this.reticle.clear();
    this.wideShot();
    s.fov(50);
    s.pad.reset();
    s.crowdLoop.level(0.08, 600);
  }

  private drawWind(): void {
    const g = this.windArrow;
    g.clear();
    const w = this.wind;
    g.fillStyle(0x0b1028, 0.65).fillRoundedRect(30, 82, 260, 92, 22);
    this.windText.setText(`${t('wind')} ${Math.abs(w)}`).setColor(w === 0 ? '#ffffff' : '#7ee6ff');
    if (w !== 0) {
      const len = 30 + Math.abs(w) * 18, cx = 160, cy = 112, d = Math.sign(w);
      g.lineStyle(8, 0x7ee6ff, 1).lineBetween(cx - (len / 2) * d, cy, cx + (len / 2) * d, cy);
      g.fillStyle(0x7ee6ff, 1).fillTriangle(cx + (len / 2 + 16) * d, cy, cx + (len / 2) * d, cy - 13, cx + (len / 2) * d, cy + 13);
    }
    // the flags on the range lean with the wind
    for (const f of this.s.venues.windFlags) {
      f.rotation.y = w >= 0 ? 0 : Math.PI;
      f.scale.set(1, 1, 0.35 + Math.abs(w) * 0.25);
    }
  }

  update(dt: number, rdt: number): void {
    const s = this.s;
    const tn = this.tune;
    this.stT += rdt;
    if (this.state === 'wide') {
      while (s.pad.pressed('SHOOT')) { /* not yet */ }
      s.pad.takeDrag();
      if (this.stT > 1.3) {
        this.state = 'aim';
        this.stT = 0;
        const z = this.z0(0);
        s.camTo(EYE.clone().setZ(z), new THREE.Vector3(RANGE, TARGET_Y, z), 3.2);
        s.fov(ZOOM_FOV);
        s.sfx('nock', { volume: 0.5 });
      }
    } else if (this.state === 'aim') {
      // sway: breathing and the hands, growing after a long hold
      const tired = 1 + Math.max(0, this.stT - 7) * 0.25;
      const A = tn.sway * tired, T = this.stT, p = this.ph;
      this.sway.x = A * (0.6 * Math.sin(T * 1.7 + p[0]) + 0.4 * Math.sin(T * 3.3 + p[1]));
      this.sway.y = A * (0.6 * Math.sin(T * 1.3 + p[2]) + 0.4 * Math.sin(T * 2.7 + p[3]));
      const kx = (s.pad.isDown('AR') ? 1 : 0) - (s.pad.isDown('AL') ? 1 : 0);
      const ky = (s.pad.isDown('AU') ? 1 : 0) - (s.pad.isDown('AD') ? 1 : 0);
      this.aim.x += kx * tn.aimSpeed * rdt;
      this.aim.y += ky * tn.aimSpeed * rdt;
      const d = s.pad.takeDrag();
      this.aim.x += d.x / PX_PER_M;
      this.aim.y -= d.y / PX_PER_M;
      this.aim.x = Phaser.Math.Clamp(this.aim.x, -1, 1);
      this.aim.y = Phaser.Math.Clamp(this.aim.y, -1, 1);
      const left = tn.time - this.stT;
      s.eventHud(`${t('timeLeft')} ${Math.max(0, Math.ceil(left))}`);
      this.drawReticle(this.stT > 0.5);
      if ((s.pad.pressed('SHOOT') && this.stT > 0.5) || left <= 0) this.release();
    } else if (this.state === 'flight') {
      const p = Math.min(1, this.stT / FLIGHT);
      const f = this.flying!;
      const z = this.z0(0);
      const from = new THREE.Vector3(EYE.x + 0.3, EYE.y - 0.1, z + 0.12);
      const to = new THREE.Vector3(RANGE - 0.05, TARGET_Y + this.shot.y, z + this.shot.x);
      f.position.lerpVectors(from, to, p);
      f.position.y += Math.sin(p * Math.PI) * 0.25;
      f.visible = p > 0.35;
      if (p >= 1) this.impact();
    } else if (this.state === 'hit') {
      // the bows come up again for the next arrow; a cheer for a ten
      for (const e of s.entrants) if (!e.athlete.busy && e.athlete.clip === 'holding-right-shoot') e.athlete.play('holding-right', { fade: 0.25 });
      if (this.stT > 1.5) {
        if (this.n >= 6) {
          this.state = 'over';
          this.wideShot();
          this.s.fov(50);
          this.reticle.clear();
          this.resultDelay = 1300;
          s.finishEvent();
        } else this.nextArrow();
      }
    }
    void dt;
  }

  private target(x: number, y: number): THREE.Vector3 {
    return new THREE.Vector3(RANGE, TARGET_Y + y, this.z0(0) + x);
  }

  private drawReticle(show: boolean): void {
    const g = this.reticle;
    g.clear();
    if (!show) return;
    const p = this.s.screenOf(this.target(this.aim.x + this.sway.x, this.aim.y + this.sway.y));
    const r = 26;
    g.lineStyle(7, 0x000000, 0.35).strokeCircle(p.x, p.y, r);
    g.lineStyle(3, 0xffffff, 1).strokeCircle(p.x, p.y, r);
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) g.lineBetween(p.x + dx * (r - 10), p.y + dy * (r - 10), p.x + dx * (r + 14), p.y + dy * (r + 14));
    g.fillStyle(0xff3b3b, 1).fillCircle(p.x, p.y, 3.5);
    if (this.tune.ghost && this.wind !== 0) {
      // Easy: where the wind will carry the arrow
      const q = this.s.screenOf(this.target(this.aim.x + this.sway.x + this.wind * this.tune.drift, this.aim.y + this.sway.y));
      g.lineStyle(2, 0x7ee6ff, 0.9).strokeCircle(q.x, q.y, 9);
      g.lineStyle(2, 0x7ee6ff, 0.5).lineBetween(p.x, p.y, q.x, q.y);
    }
  }

  private makeArrow(): THREE.Group {
    const a = new THREE.Group();
    const shaft = mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.75, 6), lambert(0xf3f2f2), 'none');
    shaft.rotation.z = Math.PI / 2;
    shaft.position.x = -0.37;
    const nock = mesh(new THREE.BoxGeometry(0.12, 0.05, 0.004), lambert(0xff4fa3), 'none');
    nock.position.x = -0.68;
    const nock2 = nock.clone();
    nock2.rotation.x = Math.PI / 2;
    a.add(shaft, nock, nock2);
    return a;
  }

  private release(): void {
    const s = this.s;
    const jitter = () => (Math.random() - 0.5) * 0.012;
    this.shot = {
      x: this.aim.x + this.sway.x + this.wind * this.tune.drift + jitter(),
      y: this.aim.y + this.sway.y + jitter(),
    };
    this.state = 'flight';
    this.stT = 0;
    this.reticle.clear();
    this.flying = this.makeArrow();
    this.flying.visible = false;
    this.group.add(this.flying);
    this.arrows.push(this.flying);
    s.sfx('release', { volume: 0.6 });
    s.player.athlete.play('holding-right-shoot', { fade: 0.05 });
    s.eventHud('');
  }

  private impact(): void {
    const s = this.s;
    this.state = 'hit';
    this.stT = 0;
    const r = Math.hypot(this.shot.x, this.shot.y);
    const score = r > FACE_R ? 0 : Math.min(10, 10 - Math.floor(r / RING));
    this.mine.push(score);
    const f = this.flying!;
    f.rotation.set((Math.random() - 0.5) * 0.1, (Math.random() - 0.5) * 0.1, (Math.random() - 0.5) * 0.1);
    s.sfx(score > 0 ? 'thud' : 'ground', { volume: 0.8 });
    const p = this.target(this.shot.x, this.shot.y + 0.12);
    if (score === 10) {
      s.call(t('bullseye'), '#ffd23f', { y: 200, size: 56 });
      s.sfx('bull', { volume: 0.6 });
      s.cheer(1);
      s.burstAt(p, [0xffd23f, 0xffffff], 22);
      s.shake(0.004, 140);
    } else if (score === 0) {
      s.call(t('missed'), '#ff9a7a', { y: 200, size: 50 });
    } else {
      if (score >= 8) s.cheer(0.5, false);
      s.burstAt(p, [0xffffff, 0xffd23f], 10);
    }
    s.popAt(p, String(score), score >= 9 ? '#ffd23f' : '#ffffff', 46);
    // the rivals shoot alongside: their arrows appear in their targets
    for (let i = 1; i < 4; i++) {
      s.entrants[i].athlete.play('holding-right-shoot', { fade: 0.05 });
      const sc = this.rivalArrows[i][this.n - 1];
      const rr = (10 - sc + 0.15 + Math.random() * 0.7) * RING;
      const ang = Math.random() * Math.PI * 2;
      const a = this.makeArrow();
      a.position.set(RANGE - 0.05, TARGET_Y + Math.sin(ang) * rr, this.z0(i) + Math.cos(ang) * rr);
      a.rotation.set((Math.random() - 0.5) * 0.1, (Math.random() - 0.5) * 0.1, (Math.random() - 0.5) * 0.1);
      this.group.add(a);
      this.arrows.push(a);
    }
    const totals = [this.sum(this.mine), ...[1, 2, 3].map((i) => this.sum(this.rivalArrows[i].slice(0, this.n)))];
    totals.forEach((v, i) => {
      const row = this.boardRows[i];
      row.setText(String(v)).setColor(hexs(i === 0 ? 0x3ee6ff : 0xffffff));
      s.tweens.add({ targets: row, scale: 1.25, duration: 140, yoyo: true, delay: i * 120 });
    });
  }

  private sum(list: number[]): number {
    return list.reduce((a, b) => a + b, 0);
  }

  marks(): number[] {
    return [this.sum(this.mine), ...[1, 2, 3].map((i) => this.sum(this.rivalArrows[i]))];
  }

  cleanup(): void {
    for (const e of this.s.entrants) e.athlete.holdBow(false);
    this.s.pad.dragArea = false;
    this.s.eventHud('');
    this.s.venues.range.remove(this.group);
  }
}
