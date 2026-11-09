// Golden Podium: one cup session of five events against three rivals, then the medal table and
// the podium ceremony. The 3D world (venues, athletes) lives for the whole session; each event
// is a small state machine in events/*.ts driven from here.
import Phaser from 'phaser';
import {
  ArcadeScene, t, isEasy, playerCharacter, otherCharacters, characterName, burst, flash, shake, txt,
  type CharacterId,
} from '@core';
import { World3D, THREE } from '@core/three';
import { Athlete } from './athlete';
import { ordinal } from './strings';
import { buildVenues, TEAM_COLORS, type Venues } from './stadium';
import { Pad } from './pad';
import { Particles3D, Confetti } from './fx3d';
import { CrowdLoop } from './crowd-audio';
import { EventCard, ResultsBoard, MedalTable, callout, type Panel, type ResultLine, type TableLine } from './panels';
import {
  EVENTS, type EventId, basePoints, beatsRecord, ranking, markText, MEDAL_BONUS, RECORD_BONUS, RECORDS, RIVAL_FORM,
} from './scoring';
import { SportEvent } from './events/base';
import { Sprint, SPRINT_TUNE } from './events/sprint';
import { Hurdles, HURDLES_TUNE } from './events/hurdles';
import { LongJump, LONGJUMP_TUNE } from './events/longjump';
import { Swim, SWIM_TUNE } from './events/swim';
import { Archery, ARCHERY_TUNE } from './events/archery';

export interface Entrant {
  id: CharacterId;
  name: string;
  color: number;
  player: boolean;
  /** 0 = in top form … 1 = off day; set per event around the rival's base level. */
  base: number;
  athlete: Athlete;
  medals: [number, number, number];
  total: number;
}

/** The hint line: one line, clear of the thumb buttons (x 58–242 and 1038–1222, y 498–682). */
const HINT_Y = 686;
const HINT_W_TOUCH = 760;
const HINT_W_KEYS = 1180;

type Phase = 'card' | 'event' | 'results' | 'table' | 'podium' | 'end';

const MAKERS: Record<EventId, new (s: PlayScene) => SportEvent> = {
  sprint: Sprint, hurdles: Hurdles, longjump: LongJump, swim: Swim, archery: Archery,
};

export class PlayScene extends ArcadeScene {
  world!: World3D;
  venues!: Venues;
  pad!: Pad;
  fx!: Particles3D;
  confetti!: Confetti;
  crowdLoop!: CrowdLoop;
  entrants: Entrant[] = [];
  easy = false;
  /** Game-time scale (slow motion). */
  slow = 1;
  private slowTarget = 1;
  private slowUntil = 0;
  private camPos = new THREE.Vector3();
  private camLook = new THREE.Vector3();
  private camPosT = new THREE.Vector3();
  private camLookT = new THREE.Vector3();
  private camK = 4;
  private fovT = 50;
  phase: Phase = 'card';
  eventIndex = 0;
  event: SportEvent | null = null;
  /** The screen on top (event card, results, medal table), if any. */
  panel: Panel | null = null;
  /** Event widgets (cleared when the event ends). */
  ui!: Phaser.GameObjects.Container;
  private hintText!: Phaser.GameObjects.Text;
  private clock = 0;
  private podiumTime = 0;
  private podiumMedals: { img: Phaser.GameObjects.Image; e: Entrant; y: number }[] = [];
  private podiumOrder: Entrant[] = [];
  private podiumDone = false;
  private skipKey: ((e: KeyboardEvent) => void) | null = null;

  createGame(): void {
    this.easy = isEasy();
    this.slow = this.slowTarget = 1;
    this.slowUntil = 0;
    this.phase = 'card';
    this.eventIndex = 0;
    this.event = null;
    this.panel = null;
    this.clock = 0;
    this.podiumTime = 0;
    this.podiumMedals = [];
    this.podiumOrder = [];
    this.podiumDone = false;
    this.skipKey = null;

    this.world = new World3D(this, { fov: 50, background: 0x8fd0ff, fog: { color: 0xcfeaff, near: 90, far: 330 }, far: 800 });
    this.world.addLights({ sky: 0xeaf6ff, ground: 0x7a8a5a, ambient: 1.7, intensity: 2.5, dir: [-0.45, 1, 0.55], extent: 30 });
    this.venues = buildVenues(this.world.scene, t('cup'));
    this.fx = new Particles3D(this.world.scene);
    this.pad = new Pad(this);
    this.crowdLoop = new CrowdLoop(this);

    // the player and three rivals with team colours; rivals differ in class
    const me = playerCharacter();
    const rivals = otherCharacters(me);
    Phaser.Utils.Array.Shuffle(rivals);
    const bases = [0.08, 0.4, 0.72];
    this.entrants = [me, ...rivals.slice(0, 3)].map((id, i) => ({
      id,
      name: i === 0 ? t('you') : characterName(id),
      color: TEAM_COLORS[i],
      player: i === 0,
      base: i === 0 ? 0 : bases[i - 1],
      athlete: new Athlete(this, id, TEAM_COLORS[i]),
      medals: [0, 0, 0] as [number, number, number],
      total: 0,
    }));
    this.confetti = new Confetti(this.venues.track, this.venues.podium.position.clone(), 7);

    this.ui = this.add.container(0, 0).setDepth(9000);
    this.hintText = txt(this, 640, HINT_Y, '', { size: 21, color: '#ffffff', strokeThickness: 5 }).setDepth(9000).setAlpha(0);
    this.hud.setCenter('');
    this.world.onFrame = (dt) => this.frame(dt);

    this.startEvent(0);
    // test hook: the running cup (Playwright checks read events, marks and tuning from here)
    (window as unknown as { __gp?: unknown }).__gp = this;
  }

  /** The tuning of this run, Normal or Easy (for tests: compare the two). */
  get tune() {
    const d = this.easy ? 'easy' : 'normal';
    return {
      difficulty: d,
      sprint: SPRINT_TUNE[d], hurdles: HURDLES_TUNE[d], longjump: LONGJUMP_TUNE[d], swim: SWIM_TUNE[d], archery: ARCHERY_TUNE[d],
      rivals: Object.fromEntries(EVENTS.map((e) => [e, RIVAL_FORM[e][d]])),
    };
  }

  // ---------------------------------------------------------------- helpers for events

  get player(): Entrant {
    return this.entrants[0];
  }

  /** Shows one venue and puts every athlete in it. */
  useVenue(v: THREE.Group): void {
    for (const g of [this.venues.track, this.venues.pool, this.venues.range]) g.visible = g === v;
    for (const e of this.entrants) {
      v.add(e.athlete.root);
      e.athlete.root.visible = true;
      e.athlete.setSwim(false);
      e.athlete.showMarks(true);
      e.athlete.lift = 0;
      e.athlete.setTint(0xffffff);
    }
    this.fx.clear();
  }

  /**
   * The event's own right-hand HUD text (race clock, archery time). Ignored once the event has
   * ended, so a race still running behind the results board cannot write over the next screen.
   */
  eventHud(text: string): void {
    if (this.phase === 'event' || text === '') this.hud.setRight(this.phase === 'event' ? text : '');
  }

  /** Moves the camera smoothly towards a position, looking at a point (venue coordinates). */
  camTo(pos: THREE.Vector3, look: THREE.Vector3, k = 4, venue?: THREE.Group): void {
    const o = (venue ?? this.venueOf()).position;
    this.camPosT.copy(pos).add(o);
    this.camLookT.copy(look).add(o);
    this.camK = k;
  }

  /** Cuts the camera to a shot at once. */
  cut(pos: THREE.Vector3, look: THREE.Vector3, venue?: THREE.Group): void {
    this.camTo(pos, look, 4, venue);
    this.camPos.copy(this.camPosT);
    this.camLook.copy(this.camLookT);
    this.applyCam();
  }

  fov(f: number, now = false): void {
    this.fovT = f;
    if (now) {
      this.world.camera.fov = f;
      this.world.camera.updateProjectionMatrix();
    }
  }

  private venueOf(): THREE.Group {
    const v = this.venues;
    return v.pool.visible ? v.pool : v.range.visible ? v.range : v.track;
  }

  /** Slow motion: game time runs at `scale` for `ms` real milliseconds. */
  slowMo(scale: number, ms: number): void {
    this.slowTarget = scale;
    this.slow = Math.min(this.slow, scale + 0.2);
    this.slowUntil = this.clock + ms / 1000;
  }

  /** Game pixels of a point in the current venue. */
  screenOf(p: THREE.Vector3): { x: number; y: number; visible: boolean } {
    return this.world.toScreen(p.clone().add(this.venueOf().position));
  }

  /** A floating word over a point of the venue. */
  popAt(p: THREE.Vector3, s: string, color = '#ffffff', size = 30): void {
    const sp = this.screenOf(p);
    if (!sp.visible) return;
    const text = txt(this, sp.x, sp.y, s, { title: true, size, color, strokeThickness: 6 }).setDepth(9050);
    text.setScale(0.5);
    this.tweens.add({ targets: text, scale: 1, duration: 180, ease: 'Back.easeOut' });
    this.tweens.add({ targets: text, y: sp.y - 60, alpha: 0, delay: 500, duration: 500, onComplete: () => text.destroy() });
  }

  call(s: string, color?: string, o?: { y?: number; size?: number; hold?: number }): void {
    callout(this, s, color, o);
  }

  /** 3D particles at a point of the current venue. */
  emit(p: THREE.Vector3, n: number, colors: number[], o?: Parameters<Particles3D['emit']>[3]): void {
    this.fx.emit(p.clone().add(this.venueOf().position), n, colors, o);
  }

  burstAt(p: THREE.Vector3, colors: number[], n = 16): void {
    const sp = this.screenOf(p);
    if (sp.visible) burst(this, sp.x, sp.y, colors, n, 220);
  }

  cheer(level = 1, roar = true): void {
    for (const c of this.venues.crowds) c.crowd.cheer(level);
    if (roar) this.sfx('roar', { volume: 0.35 + level * 0.45 });
    this.crowdLoop.level(0.18 + level * 0.25, 300);
    this.time.delayedCall(1800, () => this.crowdLoop.level(0.18, 1500));
  }

  shake(i = 0.006, ms = 200): void {
    shake(this, i, ms);
  }

  flash(c = 0xffffff, alpha = 0.3): void {
    flash(this, c, 120, alpha);
  }

  // ---------------------------------------------------------------- the session

  private startEvent(i: number): void {
    this.eventIndex = i;
    this.teardownEventUi(true);
    this.ui.setVisible(true);
    this.slow = this.slowTarget = 1;
    const id = EVENTS[i];
    const ev = new MAKERS[id](this);
    this.event = ev;
    ev.setup();
    this.hud.setCenter(`${i + 1}/5 · ${t('ev_' + id)}`);
    this.pad.set([]);
    this.hintText.setAlpha(0);
    this.phase = 'card';
    const touch = this.pad.touch;
    const rec = RECORDS[id];
    this.panel = new EventCard(this, {
      n: i + 1,
      name: t('ev_' + id),
      hint: t(`h_${id}_${touch ? 't' : 'k'}`),
      record: `${t('record').replace('!', '')}: ${markText(id, rec)}`,
      picture: ev.picture(),
      touch,
      swim: id === 'swim',
    }, () => this.beginEvent());
  }

  private beginEvent(): void {
    if (!this.event || this.isOver) return;
    this.phase = 'event';
    this.pad.set(this.event.buttons());
    this.pad.reset();
    this.showHint(t(`h_${this.event.id}_${this.pad.touch ? 't' : 'k'}`));
    this.event.begin();
  }

  /** Called by an event when every mark is in. */
  finishEvent(): void {
    if (this.phase !== 'event' || !this.event) return;
    this.phase = 'results';
    const ev = this.event;
    const marks = ev.marks();
    this.time.delayedCall(ev.resultDelay, () => this.showResults(ev.id, marks));
  }

  private showResults(id: EventId, marks: number[]): void {
    // the event's HUD, buttons and hint go before the board (the race behind it may still run)
    this.teardownEventUi(false);
    const places = ranking(id, marks);
    const lines: ResultLine[] = this.entrants.map((e, i) => {
      const record = beatsRecord(id, marks[i]);
      const pts = basePoints(id, marks[i]);
      const valid = !Number.isNaN(marks[i]);
      const bonus = valid ? MEDAL_BONUS[places[i]] + (record ? RECORD_BONUS : 0) : 0;
      if (valid && places[i] < 3) e.medals[places[i]]++;
      e.total += pts + bonus;
      return { id: e.id, name: e.name, color: e.color, player: e.player, place: places[i], mark: markText(id, marks[i]), points: pts, bonus, record };
    });
    const mine = lines[0];
    this.setScore(this.player.total);
    const last = this.eventIndex === EVENTS.length - 1;
    // the player's medal: fanfare and confetti for gold
    const valid = !Number.isNaN(marks[0]);
    if (valid && mine.place === 0) {
      this.sfx('gold', { volume: 0.8, exact: true });
      this.cheer(1);
      burst(this, 640, 120, [0xffd23f, 0xffffff, 0xff6b4a], 40, 320);
    } else if (valid && mine.place < 3) {
      this.sfx('medal', { volume: 0.7, exact: true });
      this.cheer(0.6);
    } else this.sfx('lose', { volume: 0.5 });
    if (mine.record) this.time.delayedCall(900, () => { this.sfx('record', { volume: 0.7 }); callout(this, t('record'), '#ffd23f', { y: 678, size: 34, hold: 1600 }); });
    this.panel = new ResultsBoard(this, t('ev_' + id), lines, this.player.total, last, () => {
      this.event?.cleanup();
      this.event = null;
      if (last) this.showTable();
      else this.startEvent(this.eventIndex + 1);
    });
  }

  /**
   * Takes down an event's HUD: its widgets (hidden, or destroyed once the event is over), its
   * touch buttons, the aim drag, the hint and the right-hand HUD slot.
   */
  private teardownEventUi(destroy: boolean): void {
    if (destroy) this.ui.removeAll(true);
    this.ui.setVisible(false);
    this.pad.set([]);
    this.pad.dragArea = false;
    this.hintText.setAlpha(0);
    this.hud.setRight('');
  }

  /**
   * The event's one-line hint at the bottom: on touch screens between the thumb buttons, shrunk
   * to fit when a language runs long.
   */
  private showHint(s: string): void {
    const maxW = this.pad.touch ? HINT_W_TOUCH : HINT_W_KEYS;
    this.hintText.setScale(1).setText(s).setAlpha(0.95);
    if (this.hintText.width > maxW) this.hintText.setScale(maxW / this.hintText.width);
  }

  private standings(): Entrant[] {
    return [...this.entrants].sort((a, b) => b.total - a.total || (a.player ? -1 : b.player ? 1 : 0));
  }

  private showTable(): void {
    this.phase = 'table';
    this.teardownEventUi(true);
    this.hud.setCenter(t('medalTable'));
    const order = this.standings();
    const lines: TableLine[] = order.map((e) => ({ id: e.id, name: e.name, color: e.color, player: e.player, medals: e.medals, total: e.total }));
    this.sfx('tick');
    this.panel = new MedalTable(this, lines, () => this.startPodium(order));
  }

  private startPodium(order: Entrant[]): void {
    this.phase = 'podium';
    this.teardownEventUi(true);
    this.podiumOrder = order;
    this.podiumTime = 0;
    this.hud.setCenter(t('podium'));
    this.useVenue(this.venues.track);
    const pod = this.venues.podium.position;
    const xs = [0, -2.1, 2.1], hs = [1.0, 0.7, 0.45];
    order.forEach((e, i) => {
      const a = e.athlete;
      a.setSwim(false);
      a.showMarks(i === 3, i === 3);
      if (i < 3) {
        a.root.position.set(pod.x + xs[i], hs[i], pod.z);
        a.setPose(i === 0 ? 'cheer1' : 'stand');
      } else {
        a.root.position.set(pod.x + 4.6, 0, pod.z + 0.6);
        a.setPose('stand');
      }
      a.sync();
    });
    this.cut(new THREE.Vector3(pod.x + 0.4, 2.6, pod.z + 11), new THREE.Vector3(pod.x, 1.6, pod.z), this.venues.track);
    this.camTo(new THREE.Vector3(pod.x, 2.3, pod.z + 7.2), new THREE.Vector3(pod.x, 1.9, pod.z), 0.6, this.venues.track);
    this.fov(46);
    this.confetti.start();
    this.cheer(1);
    this.crowdLoop.level(0.4, 500);
    this.sfx('podium', { volume: 0.8, exact: true });
    // medals above the top three
    this.podiumMedals = order.slice(0, 3).map((e, i) => {
      const img = this.add.image(0, 0, ['medal-gold', 'medal-silver', 'medal-bronze'][i]).setDepth(9050).setScale(0).setAlpha(0);
      this.tweens.add({ targets: img, scale: 1.0, alpha: 1, delay: 900 + (2 - i) * 450, duration: 400, ease: 'Back.easeOut', onStart: () => this.sfx('tick') });
      return { img, e, y: hs[i] };
    });
    const place = order.findIndex((e) => e.player);
    const title = place === 0 ? t('champion') : t('placeTitle', { n: ordinal(place + 1) });
    this.time.delayedCall(2200, () => {
      if (this.isOver) return;
      const big = txt(this, 640, 150, title, { title: true, size: 66, color: place === 0 ? '#ffd23f' : '#ffffff', strokeThickness: 10 }).setDepth(9100).setScale(0.3);
      this.tweens.add({ targets: big, scale: 1, duration: 400, ease: 'Back.easeOut' });
      if (place === 0) burst(this, 640, 150, [0xffd23f, 0xffffff], 50, 380);
      this.podiumDone = true;
    });
    const end = () => {
      if (this.isOver || this.phase === 'end') return;
      this.phase = 'end';
      this.endGame({ win: place === 0, title, delay: 300 });
    };
    this.time.delayedCall(6500, end);
    this.skipKey = (e: KeyboardEvent) => { if (this.podiumDone && (e.code === 'Space' || e.code === 'Enter')) end(); };
    this.input.keyboard?.on('keydown', this.skipKey);
    this.input.on('pointerup', () => { if (this.podiumDone) end(); });
  }

  // ---------------------------------------------------------------- frame

  updateGame(_time: number, delta: number): void {
    const rdt = delta / 1000;
    this.clock += rdt;
    if (this.clock > this.slowUntil) this.slowTarget = 1;
    this.slow += (this.slowTarget - this.slow) * Math.min(1, rdt * 6);
    const dt = rdt * this.slow;
    if (this.phase === 'event' && this.event) this.event.update(dt, rdt);
    else if (this.event && this.phase === 'results') this.event.update(dt, rdt);
    else if (this.event && this.phase === 'card') this.event.idle(rdt);
    if (this.phase === 'podium' || this.phase === 'end') this.updatePodium(rdt);
    for (const e of this.entrants) e.athlete.sync();
  }

  private updatePodium(dt: number): void {
    this.podiumTime += dt;
    const k = Math.floor(this.podiumTime * 3);
    this.podiumOrder.forEach((e, i) => {
      if (i === 0) e.athlete.setPose(k % 2 ? 'cheer2' : 'cheer1');
      else if (i < 3 && this.podiumTime > 1.6) e.athlete.setPose((k + i) % 2 ? 'cheer1' : 'stand');
      else if (i === 3) e.athlete.setPose('stand');
    });
    for (const m of this.podiumMedals) {
      const p = m.e.athlete.root.position.clone().add(new THREE.Vector3(0, 2.25, 0));
      const sp = this.world.toScreen(p.add(this.venues.track.position));
      m.img.setPosition(sp.x, sp.y + Math.sin(this.podiumTime * 3) * 4);
    }
  }

  /** Runs every rendered frame (also while paused panels are up): camera, crowd, effects. */
  private frame(dt: number): void {
    if (!this.world) return;
    const k = 1 - Math.exp(-this.camK * dt);
    this.camPos.lerp(this.camPosT, k);
    this.camLook.lerp(this.camLookT, k);
    const cam = this.world.camera;
    if (Math.abs(cam.fov - this.fovT) > 0.01) {
      cam.fov += (this.fovT - cam.fov) * Math.min(1, dt * 3.5);
      cam.updateProjectionMatrix();
    }
    this.applyCam();
    const time = performance.now() / 1000;
    for (const c of this.venues.crowds) if (c.venue.visible) c.crowd.update(dt, time);
    this.fx.update(dt * this.slow);
    this.confetti.update(dt, time);
    this.event?.frame(dt, time);
  }

  private applyCam(): void {
    this.world.camera.position.copy(this.camPos);
    this.world.camera.lookAt(this.camLook);
    this.world.followSun(this.camLook);
  }
}
