// Blacktop Kings: 3-on-3 street ball on one hoop.
//
// Solo: a ladder of rival crews, each one tougher; win a game to meet the next crew, lose one and
// the run is over. Online (two players): each player runs a crew of three, the teammates are the
// host's AI. The host simulates the match (sim.ts) with both players' inputs and sends compact
// snapshots ~20 times a second; the guest sends its input (stick, buttons as press counters, the
// shot's hold time) and draws the host's snapshots interpolated 110 ms in the past, with its own
// player predicted locally and pulled back towards the host's position (as head-soccer does).
import Phaser from 'phaser';
import {
  ArcadeScene, Controls, net, t, txt, isEasy, flash, playerCharacter, peerCharacter,
  hudChip, hudText, HudChip, HUD_ROW_Y, HUD_ROW2_Y, HUD_GAP, HUD_MARGIN, isModalOpen,
} from '@core';
import { World3D, MINI_MALES, miniKey } from '@core/three';
import { Game, NO_INPUT, PEAK, PERFECT, GOOD, SHOT_AUTO, RUN, TURBO, PHASES, type Input, type Ev, type Phase } from './sim';
import { encodeSnap, EventLog, SnapBuffer, emptyIn, PER_PLAYER, type Snap, type InMsg } from './netcode';
import { DUNK_R, HOOP_X, HOOP_Z, RIM_Y, BOUNDS, hoopDist, isCleared } from './court';
import { MATES } from './ai';
import { D_HANG, D_POWER } from './moves';
import { TUNING, rivalLevel, type Tuning } from './tuning';
import { CourtView, CAM_FOV, type ViewState } from './view';
import { charKey } from './kit';
import { CrowdLoop, makeSounds } from './crowd';
import { KITS, ONLINE_KITS, SKY_FOG, figState, hex } from './look';
import type { Kit } from './players';

const STEP = 1 / 60;
const SEND_MS = 50;              // ~20 snapshots a second
const INTERP_MS = 110;           // the guest draws the host's world this far in the past
const SEND_MIN_MS = 25;          // the guest sends an input change at once, at most this often
const EV_KEEP_MS = 700;          // events ride along in every snapshot for this long
const SNAP_PX = 2.5;             // a prediction this far off (m) jumps to the host's position
const CREWS = 6;

interface Edges { shootDown: boolean; shootUp: number; pass: boolean; passTo: number; jump: boolean; action: boolean; swap: boolean }
const noEdges = (): Edges => ({ shootDown: false, shootUp: -1, pass: false, passTo: -1, jump: false, action: false, swap: false });

export class PlayScene extends ArcadeScene {
  world!: World3D;
  view!: CourtView;
  g!: Game;
  private online = false;
  private host = true;
  /** The local person's team. */
  private me: 0 | 1 = 0;
  private crew = 0;
  tune: Tuning = TUNING.normal;
  private acc = 0;
  private slow = 1;
  private slowT = 0;
  private overT = -1;
  private endedRound = false;
  private crowdLoop!: CrowdLoop;
  // input
  private controls!: Controls;
  private keys: Record<string, Phaser.Input.Keyboard.Key> = {};
  private edges: Edges = noEdges();
  private holdStart = -1;
  /** Seconds SHOOT has been held, counted in game time (frames are clamped like the simulation's). */
  private holdT = 0;
  private aWas = false;
  private bWas = false;
  private turboTouch = false;
  private actionTouch = false;
  private btnLabels: Phaser.GameObjects.Text[] = [];
  private labelSide = -1;
  // HUD
  private sideMe!: HudChip;
  private sideThem!: HudChip;
  private scoreMe!: Phaser.GameObjects.Text;
  private scoreThem!: Phaser.GameObjects.Text;
  private nameThem!: Phaser.GameObjects.Text;
  private nameMe!: Phaser.GameObjects.Text;
  private clockChip!: HudChip;
  private shotChip!: HudChip;
  private turboChip!: HudChip;
  private fireChips: HudChip[] = [];
  private turboBar!: Phaser.GameObjects.Graphics;
  private meter!: Phaser.GameObjects.Graphics;
  private meterMsg!: Phaser.GameObjects.Text;
  private banner!: Phaser.GameObjects.Text;
  private sub!: Phaser.GameObjects.Text;
  private hint!: Phaser.GameObjects.Text;
  private lastTick = -1;
  private lastShotTick = -1;
  private meterShow = 0;
  // online
  private sendT = 0;
  private remote: InMsg = emptyIn();
  private seen: InMsg = emptyIn();
  private remoteAt = 0;
  private evLog = new EventLog(EV_KEEP_MS);
  private sent: InMsg = emptyIn();
  private counters = { sd: 0, su: 0, sh: 0, ps: 0, pt: -1, jp: 0, ac: 0, sw: 0 };
  private sentLog: Array<{ q: number; at: number }> = [];
  private buf = new SnapBuffer(INTERP_MS);
  private guestPhase: Phase = 'tip';
  private guestScore: [number, number] = [0, 0];
  private pred = { id: -1, x: 0, z: 0, vx: 0, vz: 0, face: 0 };
  private predHist: Array<{ at: number; x: number; z: number }> = [];
  private predFix = { x: 0, z: 0 };
  /** Max frame-to-frame jump of the drawn ball (the sync test reads it). */
  ballJump = 0;
  get snapCount(): number { return this.buf.count; }
  private vs!: ViewState;

  createGame(): void {
    makeSounds(this.game);
    this.online = net.active;
    this.host = net.isHost;
    this.me = this.online && !this.host ? 1 : 0;
    this.tune = isEasy() ? TUNING.easy : TUNING.normal;
    this.crew = 0; this.acc = 0; this.slow = 1; this.slowT = 0; this.overT = -1; this.endedRound = false;
    this.edges = noEdges(); this.holdStart = -1; this.aWas = false; this.bWas = false; this.turboTouch = false; this.actionTouch = false;
    this.btnLabels = []; this.fireChips = []; this.labelSide = -1; this.lastTick = -1; this.lastShotTick = -1; this.meterShow = 0;
    this.sendT = 0; this.remoteAt = 0; this.evLog = new EventLog(EV_KEEP_MS); this.buf = new SnapBuffer(INTERP_MS);
    this.remote = emptyIn(); this.seen = emptyIn(); this.sent = emptyIn();
    this.counters = { sd: 0, su: 0, sh: 0, ps: 0, pt: -1, jp: 0, ac: 0, sw: 0 };
    this.sentLog = []; this.guestPhase = 'tip'; this.guestScore = [0, 0];
    this.pred = { id: -1, x: 0, z: 0, vx: 0, vz: 0, face: 0 }; this.predHist = []; this.predFix = { x: 0, z: 0 };
    this.ballJump = 0; this.ballSpeed = 0; this.lastBall = null; this.pendingEv = []; this.holdT = 0; this.lastHold = 0;

    this.world = new World3D(this, { fov: CAM_FOV, near: 0.3, far: 220, background: SKY_FOG, fog: { color: SKY_FOG, near: 45, far: 140 } });
    this.world.addLights({ ambient: 1.55, intensity: 2.3, extent: 13, dir: [-0.45, 1, 0.6], sky: 0xe6f0ff, ground: 0x6d6255, sun: 0xfff1dc });
    const kits: [Kit, Kit] = this.online ? ONLINE_KITS : [KITS[0], KITS[1]];
    this.view = new CourtView(this.world, kits, this.figureKeys(0), false);
    this.view.onDribble = (x) => this.sfxAt('dribble', this.view.screen(x, 0, 0).x, { volume: 0.32 });
    this.crowdLoop = new CrowdLoop(this, 0.14);
    this.vs = { p: [], ball: { x: 4, y: 1.2, z: 0, state: 'tip', holder: -1 }, fire: [false, false], ctrl: [-1, -1], me: this.me, takeBack: false };

    this.buildHud(kits);
    this.setupInput();
    if (this.online) this.setupOnline();
    this.startGame();
  }

  /** Model keys of the six ballers: the player's own character first on its team. */
  private figureKeys(crew: number): string[] {
    const mine = charKey(playerCharacter());
    const theirs = charKey(peerCharacter());
    const pool = MINI_MALES.map((m) => miniKey(m)).filter((k) => k !== mine && k !== theirs);
    if (this.online) {
      const host = this.host ? mine : theirs, guest = this.host ? theirs : mine;
      return [host, pool[0], pool[1], guest, pool[2], pool[3]];
    }
    const r = (i: number) => pool[(crew * 2 + i + 2) % pool.length];
    return [mine, pool[0], pool[1], crew === 0 ? theirs : r(0), r(1), r(2)];
  }

  // ------------------------------------------------------------------ flow

  private startGame(): void {
    this.endedRound = false;
    this.overT = -1;
    if (this.online) {
      if (this.host) this.g = new Game({ seed: net.seed || 1, ai: [null, null], mates: MATES });
      this.nameThem.setText(clip(net.peerName || t('opponent'), 14));
      this.showBanner(t('tipoff'), '#ffd23f', t('vs', { name: net.peerName || t('opponent') }));
    } else {
      this.g = new Game({ seed: (Date.now() & 0xffff) + this.crew * 977, ai: [null, rivalLevel(this.tune, this.crew)], mates: MATES });
      const name = t('crew' + (this.crew % CREWS));
      this.nameThem.setText(clip(name, 22));
      this.showBanner(t('gameN', { n: this.crew + 1 }), '#ffd23f', t('vsCrew', { name }));
    }
    this.placeBoard();
    this.time.delayedCall(1400, () => { if (this.phaseNow() === 'tip' && !this.isOver) this.showBanner(t('tipoff'), '#ffd23f', t('tipHint')); });
  }

  private phaseNow(): Phase {
    return this.online && !this.host ? this.guestPhase : this.g.phase;
  }

  /** Solo: the next crew comes on (new kits and faces for the rival team). */
  private nextCrew(): void {
    this.crew++;
    const kit = KITS[1 + (this.crew % CREWS)];
    this.view.setTeam(1, kit, this.figureKeys(this.crew).slice(3));
    this.nameThem.setColor(hex(kit.trim));
    this.cameras.main.flash(300, 255, 255, 255);
    this.startGame();
  }

  // ------------------------------------------------------------------ the loop

  updateGame(_time: number, delta: number): void {
    const dt = delta / 1000;
    if (this.holdStart >= 0) this.holdT += dt * (this.online && !this.host ? 1 : this.slow);
    this.readInput();
    if (this.online && !this.host) { this.guestUpdate(dt); return; }
    // slow motion after a slam
    if (this.slowT > 0) { this.slowT -= dt; if (this.slowT <= 0) this.slow = 1; }
    this.acc += dt * this.slow;
    let first = true;
    while (this.acc >= STEP) {
      this.acc -= STEP;
      const local = this.localInput(first);
      const remote = this.online ? this.remoteInput(first) : null;
      first = false;
      const inputs: [Input | null, Input | null] = this.online ? [local, remote] : [local, null];
      this.g.step(STEP, inputs);
      for (const e of this.g.events) {
        this.react(e);
        if (this.online) this.evLog.add(e, this.time.now);
      }
    }
    this.fillView();
    this.view.update(dt, this.vs);
    this.hudFrame(this.g.score, this.g.clock, this.g.shotClock, this.g.overtime, this.g.p[this.g.ctrl[this.me]]?.stamina ?? 100);
    this.drawMeter(dt);
    if (this.online) {
      const now = this.time.now;
      if (now - this.sendT >= SEND_MS) { this.sendT = now - Math.min(SEND_MS, now - this.sendT - SEND_MS); this.sendSnap(); }
    }
    if (this.g.phase === 'final') this.finalFrame(dt);
  }

  private fillView(): void {
    const g = this.g, vs = this.vs;
    vs.p = g.p.map((p) => figState(g, p));
    const b = g.ball;
    vs.ball = { x: b.x, y: b.y, z: b.z, state: b.state, holder: b.holder };
    vs.fire = g.fire;
    vs.ctrl = [g.ctrl[0], g.ctrl[1]];
    if (!this.online) vs.ctrl[1] = -1;
    vs.me = this.me;
    vs.takeBack = g.phase === 'play' && g.offence === this.me && !g.cleared && b.state === 'held';
    this.trackBall();
  }

  /** Records how far the drawn ball moves per frame, and how fast that is in real time (sync checks). */
  private trackBall(): void {
    const p = this.view.ballPos, last = this.lastBall;
    if (last) {
      const d = Math.hypot(p.x - last.x, p.y - last.y, p.z - last.z);
      const real = Math.max(1 / 60, this.game.loop.rawDelta / 1000);
      this.ballJump = Math.max(this.ballJump, d);
      this.ballSpeed = Math.max(this.ballSpeed, d / real);
    }
    this.lastBall = { x: p.x, y: p.y, z: p.z };
  }

  private lastBall: { x: number; y: number; z: number } | null = null;
  /** Highest speed (m/s, real time) of the drawn ball between two frames: a teleport shows up here. */
  ballSpeed = 0;

  /** The current rival crew's AI (solo), for tests comparing Easy with Normal. */
  ai(): ReturnType<typeof rivalLevel> {
    return rivalLevel(this.tune, this.crew);
  }

  private finalFrame(_dt: number): void {
    if (this.endedRound) return;
    this.endedRound = true;
    const g = this.g;
    const win = g.winner === this.me;
    if (this.online) { this.sendSnap(); this.endOnline(g.winner, g.score); return; }
    if (win) {
      const margin = g.score[0] - g.score[1];
      this.addScore(200 + 100 * this.crew + 10 * margin, 640, 300);
      this.showBanner(t('youWonGame'), '#5dff7a', t('nextCrew'));
      this.sfx('win', { volume: 0.7, exact: true });
      this.view.fx.confetti(HOOP_X - 4, 0, 90);
      this.view.crowd.cheer(1.2);
      this.time.delayedCall(4200, () => { if (!this.isOver) this.nextCrew(); });
    } else {
      this.showBanner(t('youLostGame'), '#ff5a5a', '');
      this.sfx('lose', { volume: 0.7, exact: true });
      this.endGame({ win: false, delay: 2600 });
    }
  }

  private endOnline(winner: number, score: [number, number]): void {
    const win = winner === this.me;
    this.setScore(score[this.me] * 10 + (win ? 300 : 0));
    this.showBanner(win ? t('youWonGame') : t('youLostGame'), win ? '#5dff7a' : '#ff5a5a', '');
    this.sfx(win ? 'win' : 'lose', { volume: 0.7, exact: true });
    if (win) this.view.fx.confetti(HOOP_X - 4, 0, 90);
    this.endGame({ win, title: win ? t('youWin') : t('youLose'), delay: 2600 });
  }

  // ------------------------------------------------------------------ events: sound and juice

  private react(e: Ev): void {
    const g = this.online && !this.host ? null : this.g;
    const v = this.view;
    const pTeam = e.p >= 0 ? (e.p < 3 ? 0 : 1) : -1;
    const mine = pTeam === this.me;
    const at = (id: number) => (id >= 0 && this.vs.p[id] ? this.vs.p[id] : null);
    const sx = (x: number) => v.screen(x, 0, 0).x;
    const rim = v.screen(HOOP_X, RIM_Y + 0.6, HOOP_Z);
    switch (e.k) {
      case 'shoot': { const p = at(e.p); if (p) this.sfxAt('jump', sx(p.x), { volume: 0.35 }); break; }
      case 'release': {
        const p = at(e.p);
        if (p) this.sfxAt('whoosh', sx(p.x), { volume: 0.4 });
        if (mine && this.isLocal(e.p)) this.meterResult(e.a);
        else if (e.a === 3 && p) this.pop(t('perfect'), p.x, 2.9, p.z, '#7dff9a', 26);
        break;
      }
      case 'swish':
        v.swish(e.a === 1);
        this.sfxAt('swishNet', rim.x, { volume: 0.85 });
        if (e.a === 1) this.popScreen(t('swish'), this.scale.width / 2, 300, '#ffffff', 40);
        break;
      case 'make': {
        if (e.a === 1) { v.swish(false); this.sfxAt('swishNet', rim.x, { volume: 0.7 }); break; }
        const pts = e.a;
        this.pop('+' + pts, HOOP_X - 0.6, RIM_Y + 1.8, HOOP_Z, mine ? '#ffd23f' : '#9fd6ff', 46);
        if (pts === 3) this.pop(t('three'), HOOP_X - 1.6, RIM_Y + 2.4, HOOP_Z, '#ffd23f', 30);
        this.sfx(mine ? 'score' : 'concede', { volume: 0.6, exact: true });
        if (pts === 3) this.sfx('three', { volume: 0.5 });
        this.sfx('roar', { volume: mine ? 0.55 : 0.35 });
        v.crowd.cheer(mine ? 1 : 0.6);
        v.fx.burst(HOOP_X, RIM_Y - 0.2, HOOP_Z, mine ? [0xffd23f, 0xff7a1a, 0xffffff] : [0x7fd3ff, 0xffffff], 26, 4);
        v.shake(0.06);
        this.bumpScore(pTeam);
        if (!this.online && mine && g) this.addScore(pts * 10);
        break;
      }
      case 'rim':
        // the sound by how hard it hit: a soft roll on the rim or a clang
        v.rimHit(e.a);
        this.sfxAt(e.a > 0.45 ? 'rimHard' : 'rim', rim.x, { volume: 0.2 + 0.65 * e.a });
        break;
      case 'board': v.boardHit(e.a); this.sfxAt('board', rim.x, { volume: 0.2 + 0.5 * (e.a || 0.5) }); break;
      case 'bank':
        v.swish(false);
        this.sfxAt('swishNet', rim.x, { volume: 0.7 });
        this.popScreen(t('bank'), this.scale.width / 2, 300, '#9fe8ff', 40);
        break;
      case 'airball': this.pop(t('airball'), HOOP_X - 1, RIM_Y + 1, HOOP_Z, '#ff9a9a', 28); this.sfx('ooh', { volume: 0.4 }); break;
      case 'miss': if (!e.a) this.sfx('ooh', { volume: 0.25 }); else this.sfx('ooh', { volume: 0.45 }); break;
      case 'dunk': {
        const p = at(e.p);
        if (p) this.sfxAt('jump', sx(p.x), { volume: 0.5 });
        v.dunkCam(true, e.a);
        this.crowdLoop.level(0.3, 300);
        break;
      }
      case 'slam': {
        this.sfx('slam', { volume: 0.9 });
        this.sfx('boom', { volume: 0.5 });
        this.sfx('roar', { volume: 0.7 });
        // the rim is yanked down, the net whips, the crowd goes up
        const kind = e.a | 0;
        v.slam(kind === D_POWER || kind === D_HANG ? 1.3 : 1);
        v.shake(0.35);
        v.fx.burst(HOOP_X, RIM_Y, HOOP_Z, [0xffd23f, 0xffffff, 0xff7a1a], 50, 6);
        v.crowd.cheer(1.4);
        this.popScreen(t('dunk' + kind), this.scale.width / 2, 250, '#ffd23f', 50);
        flash(this, 0xffffff, 120, 0.35);
        if (!this.online || this.host) { this.slow = 0.3; this.slowT = 0.5; }
        this.time.delayedCall(kind === D_HANG ? 1700 : 1150, () => { v.dunkCam(false); this.crowdLoop.level(0.14, 900); });
        break;
      }
      case 'block': {
        const p = at(e.p);
        this.sfx('blockHit', { volume: 0.85 });
        this.sfx('roar', { volume: 0.45 });
        v.shake(0.2);
        if (p) { this.pop(t('blocked'), p.x, 3.3, p.z, mine ? '#5dff7a' : '#ff9a5a', 40); v.fx.burst(v.ballPos.x, v.ballPos.y, v.ballPos.z, [0xffffff, 0x7fd3ff], 22, 4); }
        v.dunkCam(false);
        v.crowd.cheer(0.9);
        break;
      }
      case 'steal':
      case 'intercept': {
        const p = at(e.p);
        this.sfx('steal', { volume: 0.7 });
        if (p) this.pop(mine ? t('stealYou') : t('stolen'), p.x, 2.8, p.z, mine ? '#5dff7a' : '#ff9a5a', 34);
        v.fx.burst(v.ballPos.x, v.ballPos.y, v.ballPos.z, [0xffffff, 0xffd23f], 14, 3);
        v.crowd.cheer(0.5);
        break;
      }
      case 'pass': { const p = at(e.p); if (p) this.sfxAt('whoosh', sx(p.x), { volume: 0.25 }); break; }
      case 'tip':
        if (this.phaseNow() !== 'final') this.hideBanner();
        this.sfxAt('catch', sx(v.ballPos.x), { volume: 0.4 });
        break;
      case 'catch': case 'pickup': this.sfxAt('catch', sx(v.ballPos.x), { volume: 0.3 }); break;
      case 'cross': {
        const p = at(e.p);
        if (p) {
          this.sfxAt('cross', sx(p.x), { volume: 0.4 });
          this.sfxAt('squeak', sx(p.x), { volume: 0.3 });
          v.fx.dust(p.x, p.z, 5);
          // the local player sees the name of his move
          if (this.isLocal(e.p)) this.pop(t('move' + (e.a & 7)), p.x, 2.7, p.z, '#ffffff', 22);
        }
        break;
      }
      case 'ankles': {
        const q = at(e.p);
        if (q) {
          this.pop(pTeam === this.me ? t('anklesYou') : t('ankles'), q.x, 2.9, q.z, pTeam === this.me ? '#ff9a5a' : '#ffd23f', 36);
          v.fx.dust(q.x, q.z, 12);
          v.nudge(q.x, 1, q.z, 1.1);
          v.shake(0.08);
        }
        this.sfx('ooh', { volume: 0.5 });
        v.crowd.cheer(0.7);
        break;
      }
      case 'needClear':
        if (mine) { this.sfx('error', { volume: 0.5 }); this.flashHint(); }
        break;
      case 'cleared': if (mine) this.sfx('tick', { volume: 0.25 }); break;
      case 'shotClock':
        this.sfx('buzzer', { volume: 0.7, exact: true });
        this.pop(t('shotClock'), HOOP_X - 3, 3.2, 0, '#ff5a5a', 36);
        break;
      case 'fire':
        this.sfx('fire', { volume: 0.7 });
        this.sfx('fireUp', { volume: 0.6, exact: true });
        this.showBanner(t('onFire'), '#ff9a2e', '');
        this.time.delayedCall(1300, () => { if (!this.isOver && this.phaseNow() !== 'final') this.hideBanner(); });
        v.crowd.cheer(1);
        break;
      case 'fireOut': this.notice(t('fireOut')); break;
      case 'toss': this.sfx('whistle', { volume: 0.5, exact: true }); break;
      case 'jump': { const p = at(e.p); if (p) this.sfxAt('jump', sx(p.x), { volume: 0.25 }); break; }
      case 'land': { const p = at(e.p); if (p) v.fx.dust(p.x, p.z, 4); break; }
      case 'squeak': { const p = at(e.p); if (p) this.sfxAt('squeak', sx(p.x), { volume: 0.35 }); break; }
      case 'bounce': this.sfxAt('bounce', sx(v.ballPos.x), { volume: 0.2 + e.a * 0.4 }); break;
      case 'overtime':
        this.sfx('buzzer', { volume: 0.6, exact: true });
        this.showBanner(t('overtime'), '#ffd23f', t('nextWins'));
        this.time.delayedCall(1800, () => { if (!this.isOver && this.phaseNow() !== 'final') this.hideBanner(); });
        break;
      case 'clockOut': this.sfx('buzzer', { volume: 0.6, exact: true }); break;
      case 'switch': if (mine) this.sfx('switch', { volume: 0.3 }); break;
      default: break;
    }
  }

  /** True when the player id is the one this screen controls. */
  private isLocal(id: number): boolean {
    return this.vs.ctrl[this.me] === id;
  }

  /** A big word at a place on the screen (dunk names). */
  private popScreen(s: string, x: number, y: number, color: string, size: number): void {
    const o = txt(this, x, y, s, { title: true, size, color, strokeThickness: 9 }).setDepth(71).setScale(0.3).setAngle(-4);
    this.tweens.add({ targets: o, scale: 1, angle: 0, duration: 300, ease: 'Back.easeOut' });
    this.tweens.add({ targets: o, y: o.y - 40, alpha: 0, delay: 1000, duration: 450, onComplete: () => o.destroy() });
  }

  private pop(s: string, x: number, y: number, z: number, color: string, size: number): void {
    const p = this.view.screen(x, y, z);
    const o = txt(this, Phaser.Math.Clamp(p.x, 120, 1160), Phaser.Math.Clamp(p.y, 140, 600), s, { title: true, size, color, strokeThickness: 8 }).setDepth(70).setScale(0.3);
    this.tweens.add({ targets: o, scale: 1, duration: 260, ease: 'Back.easeOut' });
    this.tweens.add({ targets: o, y: o.y - 50, alpha: 0, delay: 650, duration: 450, onComplete: () => o.destroy() });
  }

  // ------------------------------------------------------------------ HUD

  private buildHud(kits: [Kit, Kit]): void {
    const W = this.scale.width;
    this.nameMe = hudText(this, this.online ? t('you') : t('home'), 22, hex(kits[this.me].trim));
    this.nameThem = hudText(this, '', 22, hex(kits[1 - this.me].trim));
    this.scoreMe = hudText(this, '0', 32);
    this.scoreThem = hudText(this, '0', 32);
    this.clockChip = hudChip(this, W / 2, HUD_ROW_Y, { align: 'center', text: '3:00', size: 26, color: '#ffd23f', minWidth: 104 });
    this.sideMe = hudChip(this, W / 2, HUD_ROW_Y, { align: 'right', items: [this.nameMe, this.scoreMe] });
    this.sideThem = hudChip(this, W / 2, HUD_ROW_Y, { align: 'left', items: [this.scoreThem, this.nameThem] });
    this.shotChip = hudChip(this, W / 2, HUD_ROW2_Y, { align: 'center', label: t('shotClockLabel'), text: '14', size: 24, minWidth: 104 });
    // a flame tag under each side while that crew is on fire
    this.fireChips = [
      hudChip(this, this.shotChip.left - HUD_GAP, HUD_ROW2_Y, { align: 'right', text: t('onFire'), size: 20, color: '#ffb02e' }),
      hudChip(this, this.shotChip.right + HUD_GAP, HUD_ROW2_Y, { align: 'left', text: t('onFire'), size: 20, color: '#ffb02e' }),
    ];
    for (const c of this.fireChips) c.setVisible(false);
    this.turboBar = this.add.graphics();
    const barHolder = this.add.rectangle(0, 0, 120, 14, 0x000000, 0).setOrigin(0, 0.5);
    this.turboChip = hudChip(this, HUD_MARGIN, HUD_ROW2_Y, { align: 'left', label: t('turbo'), items: [barHolder] });
    this.turboChip.add(this.turboBar);
    this.turboBar.setPosition(barHolder.x, barHolder.y);
    this.meter = this.add.graphics().setDepth(65);
    this.meterMsg = txt(this, 0, 0, '', { title: true, size: 22, strokeThickness: 6 }).setDepth(66).setVisible(false);
    this.banner = txt(this, W / 2, 196, '', { title: true, size: 54, strokeThickness: 10 }).setDepth(60).setVisible(false);
    this.sub = txt(this, W / 2, 252, '', { size: 28, color: '#ffffff' }).setDepth(60).setVisible(false);
    this.hint = txt(this, W / 2, 668, t('takeBack'), { title: true, size: 26, color: '#ffd23f', strokeThickness: 7 }).setDepth(60).setVisible(false);
    this.placeBoard();
  }

  private placeBoard(): void {
    this.sideThem.layout();
    this.sideMe.layout().setAnchor(this.clockChip.left - HUD_GAP, HUD_ROW_Y);
    this.sideThem.setAnchor(this.clockChip.right + HUD_GAP, HUD_ROW_Y);
  }

  private bumpScore(team: number): void {
    const o = team === this.me ? this.scoreMe : this.scoreThem;
    this.tweens.killTweensOf(o);
    o.setScale(1.8);
    this.tweens.add({ targets: o, scale: 1, duration: 500, ease: 'Back.easeOut' });
  }

  private hudFrame(score: [number, number], clock: number, shot: number, ot: boolean, stamina: number): void {
    const me = this.me;
    const a = String(score[me]), b = String(score[1 - me]);
    if (this.scoreMe.text !== a || this.scoreThem.text !== b) { this.scoreMe.setText(a); this.scoreThem.setText(b); this.placeBoard(); }
    // the clock (OT after it ran out level)
    const c = Math.ceil(Math.max(0, clock));
    const ct = ot ? 'OT' : `${Math.floor(c / 60)}:${String(c % 60).padStart(2, '0')}`;
    if (this.clockChip.text.text !== ct) { this.clockChip.setText(ct); this.placeBoard(); }
    this.clockChip.setTextColor(c <= 10 && !ot ? '#ff5a5a' : '#ffd23f');
    const ph = this.phaseNow();
    if (c <= 5 && c > 0 && c !== this.lastTick && ph === 'play') { this.lastTick = c; this.sfx('tick', { volume: 0.35, exact: true }); }
    const s = Math.ceil(Math.max(0, shot));
    const st = String(s);
    if (this.shotChip.text.text !== st) this.shotChip.setText(st);
    this.shotChip.setTextColor(s <= 5 ? '#ff5a5a' : '#ffffff');
    if (s <= 3 && s > 0 && s !== this.lastShotTick && ph === 'play') {
      this.lastShotTick = s;
      this.tweens.add({ targets: this.shotChip, scale: { from: 1.25, to: 1 }, duration: 220 });
    }
    // stamina
    const g = this.turboBar;
    g.clear();
    g.fillStyle(0x000000, 0.35).fillRoundedRect(0, -7, 120, 14, 7);
    const k = Phaser.Math.Clamp(stamina / 100, 0, 1);
    g.fillStyle(k < 0.25 ? 0xff5a5a : 0x5dff7a, 1).fillRoundedRect(0, -7, Math.max(10, 120 * k), 14, 7);
    // the take-back hint
    this.hint.setVisible(this.vs.takeBack && Math.floor(this.time.now / 450) % 2 === 0);
    // fire: the team chip glows
    const fireMe = this.vs.fire[me], fireThem = this.vs.fire[1 - me];
    const flick = Math.floor(this.time.now / 160) % 2 ? '#ffb02e' : '#ff5a1f';
    this.scoreMe.setColor(fireMe ? flick : '#ffffff');
    this.scoreThem.setColor(fireThem ? flick : '#ffffff');
    this.fireChips[0].setVisible(fireMe).setTextColor(flick);
    this.fireChips[1].setVisible(fireThem).setTextColor(flick);
    this.updateLabels();
  }

  private flashHint(): void {
    this.hint.setVisible(true).setScale(1.25);
    this.tweens.add({ targets: this.hint, scale: 1, duration: 300 });
  }

  private showBanner(s: string, color: string, sub: string): void {
    this.tweens.killTweensOf([this.banner, this.sub]);
    this.banner.setText(s).setColor(color).setVisible(true).setAlpha(1).setScale(0.3);
    this.tweens.add({ targets: this.banner, scale: 1, duration: 380, ease: 'Back.easeOut' });
    this.sub.setText(sub).setVisible(!!sub).setAlpha(1);
  }

  private hideBanner(): void {
    this.tweens.add({ targets: [this.banner, this.sub], alpha: 0, duration: 250, onComplete: () => { this.banner.setVisible(false); this.sub.setVisible(false); } });
  }

  // ------------------------------------------------------------------ the shot meter

  /** Does the local player hold the ball now (and would SHOOT start a jump shot)? */
  private localShooter(): { x: number; z: number; lift: number } | null {
    const id = this.vs.ctrl[this.me];
    if (id < 0 || this.vs.ball.holder !== id || this.vs.ball.state !== 'held') return null;
    const p = this.vs.p[id];
    return p;
  }

  private drawMeter(dt: number): void {
    const m = this.meter;
    m.clear();
    const shooting = this.holdStart >= 0;
    const id = this.vs.ctrl[this.me];
    const p = id >= 0 ? this.vs.p[id] : null;
    if (shooting && p && p.act === 'shot') this.meterShow = 0.6;
    else this.meterShow = Math.max(0, this.meterShow - dt);
    if (!p || (!shooting && this.meterShow <= 0) || this.meterShow <= 0) return;
    const s = this.view.screen(p.x, 2.2 + p.lift, p.z);
    const x = s.x + 46, y = s.y - 40, H = 120, Wd = 18;
    const h = shooting ? this.holdT : this.lastHold;
    const fill = h <= PEAK ? h / PEAK : Math.max(0, 1 - (h - PEAK) / (SHOT_AUTO - PEAK));
    m.fillStyle(0x000000, 0.55).fillRoundedRect(x - 4, y - 4, Wd + 8, H + 8, 8);
    // the sweet spot at the top: perfect (green) inside good (yellow)
    const good = (GOOD / PEAK) * H, perf = (PERFECT / PEAK) * H;
    m.fillStyle(0xffd23f, 0.45).fillRect(x, y, Wd, good);
    m.fillStyle(0x5dff7a, 0.9).fillRect(x, y, Wd, perf);
    const over = h > PEAK;
    m.fillStyle(over ? 0xff5a5a : 0xffffff, 0.95).fillRect(x + 3, y + H - H * fill, Wd - 6, H * fill);
    m.lineStyle(2, 0xffffff, 0.8).strokeRoundedRect(x - 4, y - 4, Wd + 8, H + 8, 8);
  }

  private lastHold = 0;

  private meterResult(q: number): void {
    const id = this.vs.ctrl[this.me];
    const p = id >= 0 ? this.vs.p[id] : null;
    if (!p) return;
    const s = this.view.screen(p.x, 2.6 + p.lift, p.z);
    const msg = q === 3 ? t('perfect') : q === 2 ? t('good') : this.lastHold < PEAK ? t('early') : t('late');
    const col = q === 3 ? '#5dff7a' : q === 2 ? '#ffd23f' : '#ff7a7a';
    if (q === 3) this.sfx('perfect', { volume: 0.5, exact: true });
    const o = this.meterMsg;
    this.tweens.killTweensOf(o);
    o.setText(msg).setColor(col).setPosition(s.x + 56, s.y - 72).setVisible(true).setAlpha(1).setScale(0.5);
    this.tweens.add({ targets: o, scale: 1, duration: 200, ease: 'Back.easeOut' });
    this.tweens.add({ targets: o, alpha: 0, y: o.y - 30, delay: 600, duration: 400, onComplete: () => o.setVisible(false) });
  }

  // ------------------------------------------------------------------ input

  private setupInput(): void {
    const W = this.scale.width, H = this.scale.height;
    const kb = this.input.keyboard;
    if (kb) {
      const K = Phaser.Input.Keyboard.KeyCodes;
      for (const [n, c] of Object.entries({ j: K.J, k: K.K, l: K.L, q: K.Q, space: K.SPACE, z: K.Z, x: K.X, shift: K.SHIFT, enter: K.ENTER })) this.keys[n] = kb.addKey(c, true, false);
      kb.on('keydown-J', (ev: KeyboardEvent) => { if (!ev.repeat && !isModalOpen(this)) this.shootPress(); });
      kb.on('keyup-J', () => this.shootRelease());
      kb.on('keydown-K', (ev: KeyboardEvent) => { if (!ev.repeat) this.passPress(-1); });
      kb.on('keydown-Q', (ev: KeyboardEvent) => { if (!ev.repeat) this.edges.swap = true; });
      kb.on('keydown-SPACE', (ev: KeyboardEvent) => { if (!ev.repeat) this.actionPress(); });
    }
    // touch: the core stick on the left; SHOOT (A) and PASS (B) from the core, TURBO and
    // CROSS / STEAL as two more round buttons beside them
    const spots: Record<'A' | 'B', [number, number]> = { A: [W - 112, H - 118], B: [W - 268, H - 78] };
    this.controls = new Controls(this, { joystick: true, buttons: ['A', 'B'], buttonPos: spots, buttonScale: 1.05 });
    if (this.controls.touchUi) {
      this.input.addPointer(3);
      const letters = this.children.list.filter((o) => o instanceof Phaser.GameObjects.Text && (o.text === 'A' || o.text === 'B')) as Phaser.GameObjects.Text[];
      for (const l of letters) l.setText('');
      const label = (x: number, y: number) => {
        const o = txt(this, x, y, '', { title: true, size: 20, strokeThickness: 5 }).setDepth(9502).setScrollFactor(0);
        this.btnLabels.push(o);
        return o;
      };
      label(spots.A[0], spots.A[1]);
      label(spots.B[0], spots.B[1]);
      const extra = (x: number, y: number, color: number, set: (v: boolean) => void) => {
        const c = this.add.circle(x, y, 60, color, 0.35).setStrokeStyle(5, 0xffffff, 0.6).setScrollFactor(0).setDepth(9500).setInteractive();
        const on = (v: boolean) => { set(v); c.setFillStyle(color, v ? 0.7 : 0.35); };
        c.on('pointerdown', () => on(true));
        c.on('pointerup', () => on(false));
        c.on('pointerout', () => on(false));
        label(x, y);
      };
      extra(W - 92, H - 296, 0x5dff7a, (v) => { this.turboTouch = v; });
      extra(W - 250, H - 236, 0xffd23f, (v) => { if (v && !this.actionTouch) this.actionPress(); this.actionTouch = v; });
    }
    // mouse: a click on a teammate passes to him
    this.input.on('pointerdown', (p: Phaser.Input.Pointer, over: Phaser.GameObjects.GameObject[]) => {
      if (p.wasTouch || over.length || isModalOpen(this)) return;
      const id = this.vs.ctrl[this.me];
      if (id < 0 || this.vs.ball.holder !== id) return;
      let best = -1, bd = 90;
      for (let i = this.me * 3; i < this.me * 3 + 3; i++) {
        if (i === id) continue;
        const q = this.vs.p[i], s = this.view.screen(q.x, 1, q.z);
        const d = Math.hypot(s.x - p.x, s.y - p.y);
        if (d < bd) { bd = d; best = i; }
      }
      if (best >= 0) this.passPress(best);
    });
  }

  /** Offence or defence from this screen's point of view (for the buttons). */
  private onOffence(): boolean {
    const b = this.vs.ball;
    if (b.holder >= 0) return (b.holder < 3 ? 0 : 1) === this.me;
    const off = this.online && !this.host ? this.latestSnap()?.of ?? -1 : this.g?.offence ?? -1;
    return off === this.me;
  }

  private updateLabels(): void {
    if (!this.btnLabels.length) return;
    const side = this.onOffence() ? 1 : 0;
    if (side === this.labelSide) return;
    this.labelSide = side;
    const [a, b, c, d] = this.btnLabels;
    a.setText(side ? t('shoot') : t('jump'));
    b.setText(side ? t('pass') : t('swap'));
    c.setText(t('turbo'));
    d.setText(side ? t('cross') : t('steal'));
  }

  private shootPress(): void {
    this.edges.shootDown = true;
    this.counters.sd++;
    const sh = this.localShooter();
    // a jump shot shows the meter; a dunk (near the rim) does not need one, nor a shot the
    // game refuses (the ball must go back behind the arc first)
    const refused = sh && this.vs.takeBack && !isCleared(sh.x, sh.z);
    if (sh && !refused && hoopDist(sh.x, sh.z) >= DUNK_R) { this.holdStart = this.time.now; this.holdT = 0; }
    else this.holdStart = -1;
  }

  private shootRelease(): void {
    if (this.holdStart < 0) return;
    const h = this.holdT;
    this.lastHold = h;
    this.holdStart = -1;
    this.edges.shootUp = h;
    this.counters.su++;
    this.counters.sh = Math.round(h * 1000);
  }

  private passPress(to: number): void {
    if (this.onOffence()) { this.edges.pass = true; this.edges.passTo = to; this.counters.ps++; this.counters.pt = to; }
    else { this.edges.swap = true; this.counters.sw++; }
  }

  private actionPress(): void {
    // Space on defence: a jump when the shooter is in the air or a rebound is up high, else a steal
    if (!this.onOffence()) {
      const b = this.vs.ball;
      const h = b.holder >= 0 ? this.vs.p[b.holder] : null;
      if ((h && (h.act === 'shot' || h.act === 'dunk')) || ((b.state === 'loose' || b.state === 'shot') && b.y > 2)) {
        this.edges.jump = true; this.counters.jp++; return;
      }
    }
    this.edges.action = true;
    this.counters.ac++;
  }

  private readInput(): void {
    const c = this.controls;
    // the core's A and B are held by touch (or by its own keys, which this game reads itself)
    const keyA = this.keys.space?.isDown || this.keys.z?.isDown || this.keys.enter?.isDown;
    const keyB = this.keys.x?.isDown || this.keys.shift?.isDown;
    const a = c.a && !keyA, b = c.b && !keyB;
    if (a && !this.aWas) this.shootPress();
    if (!a && this.aWas) this.shootRelease();
    if (b && !this.bWas) this.passPress(-1);
    this.aWas = a; this.bWas = b;
    // a held shot lets go by itself when the jump comes down
    if (this.holdStart >= 0 && this.holdT > SHOT_AUTO + 0.08) this.shootRelease();
  }

  private stick(): { x: number; z: number } {
    const c = this.controls;
    let x = c.axisX, z = c.axisY;
    const m = Math.hypot(x, z);
    if (m < 0.18) { x = 0; z = 0; }
    return { x: Math.round(x * 10) / 10, z: Math.round(z * 10) / 10 };
  }

  private turboHeld(): boolean {
    return !!this.keys.l?.isDown || this.turboTouch;
  }

  private localInput(first: boolean): Input {
    if (isModalOpen(this)) return { ...NO_INPUT };
    const s = this.stick();
    const inp: Input = { ...NO_INPUT, mx: s.x, mz: s.z, turbo: this.turboHeld() };
    if (first) {
      const e = this.edges;
      inp.shootDown = e.shootDown; inp.shootUp = e.shootUp; inp.pass = e.pass; inp.passTo = e.passTo;
      inp.jump = e.jump; inp.action = e.action; inp.swap = e.swap;
      this.edges = noEdges();
    }
    return inp;
  }

  // ------------------------------------------------------------------ online: host

  private setupOnline(): void {
    if (this.host) {
      net.onScene(this, 'in', (d: InMsg) => {
        if (!d || typeof d.x !== 'number') return;
        const q = Number.isFinite(d.q) ? Number(d.q) : this.remote.q;
        if (q !== this.remote.q) this.remoteAt = this.time.now;
        this.remote = {
          x: Phaser.Math.Clamp(Number(d.x) || 0, -1, 1), z: Phaser.Math.Clamp(Number(d.z) || 0, -1, 1), tb: d.tb ? 1 : 0,
          sd: Number(d.sd) || 0, su: Number(d.su) || 0, sh: Number(d.sh) || 0, ps: Number(d.ps) || 0, pt: Number.isFinite(d.pt) ? Number(d.pt) : -1,
          jp: Number(d.jp) || 0, ac: Number(d.ac) || 0, sw: Number(d.sw) || 0, q,
        };
      });
    } else {
      net.onScene(this, 'st', (d: Snap) => {
        if (!d || !Array.isArray(d.p) || !Array.isArray(d.b)) return;
        this.buf.push(d, this.time.now);
        this.onSnapEvents(d);
        this.reconcile(d);
      });
    }
  }

  /** The guest's input this step, as the host's simulation needs it (edges from the counters). */
  private remoteInput(first: boolean): Input {
    const r = this.remote, s = this.seen;
    const inp: Input = { ...NO_INPUT, mx: r.x, mz: r.z, turbo: !!r.tb };
    if (!first) return inp;
    if (r.sd > s.sd) inp.shootDown = true;
    if (r.su > s.su) inp.shootUp = r.sh / 1000;
    if (r.ps > s.ps) { inp.pass = true; inp.passTo = r.pt >= 3 && r.pt < 6 ? r.pt : -1; }
    if (r.jp > s.jp) inp.jump = true;
    if (r.ac > s.ac) inp.action = true;
    if (r.sw > s.sw) inp.swap = true;
    this.seen = { ...r };
    return inp;
  }

  private sendSnap(): void {
    const now = this.time.now;
    net.send('st', encodeSnap(this.g, now, this.evLog.recent(now), this.remote.q, now - this.remoteAt));
  }

  // ------------------------------------------------------------------ online: guest

  private latestSnap(): Snap | null {
    return this.buf.latest;
  }

  private onSnapEvents(d: Snap): void {
    if (this.isOver) return;
    for (const e of this.buf.newEvents(d)) if (e.k !== 'end') this.pendingEv.push(e);
    this.guestScore = [d.s[0], d.s[1]];
    const ph: Phase = PHASES[d.ph] ?? 'play';
    this.guestPhase = ph;
    if (ph === 'final' && d.w >= 0 && !this.endedRound) {
      this.endedRound = true;
      this.time.delayedCall(INTERP_MS + 50, () => this.endOnline(d.w, [d.s[0], d.s[1]]));
    }
  }

  private pendingEv: Ev[] = [];

  private guestUpdate(dt: number): void {
    const now = this.time.now;
    // input: a change goes out at once (so the host plays the same timeline as the prediction),
    // otherwise ~20 times a second; presses ride as counters so none is lost
    const s = this.stick();
    const c = this.counters;
    const want: InMsg = { x: s.x, z: s.z, tb: this.turboHeld() ? 1 : 0, sd: c.sd, su: c.su, sh: c.sh, ps: c.ps, pt: c.pt, jp: c.jp, ac: c.ac, sw: c.sw, q: this.sent.q };
    const changed = want.x !== this.sent.x || want.z !== this.sent.z || want.tb !== this.sent.tb || want.sd !== this.sent.sd || want.su !== this.sent.su
      || want.ps !== this.sent.ps || want.jp !== this.sent.jp || want.ac !== this.sent.ac || want.sw !== this.sent.sw;
    if (isModalOpen(this)) { want.x = 0; want.z = 0; }
    if ((changed && now - this.sendT >= SEND_MIN_MS) || now - this.sendT >= SEND_MS) {
      this.sendT = now;
      want.q = this.sent.q + 1;
      this.sent = want;
      this.sentLog.push({ q: want.q, at: now });
      if (this.sentLog.length > 120) this.sentLog.shift();
      net.send('in', want);
    }
    this.edges = noEdges();
    const smp = this.buf.sample(now);
    if (!smp) return;
    const vs = this.vs;
    vs.p = smp.p;
    vs.ball = smp.ball;
    vs.fire = smp.fire;
    vs.ctrl = smp.ctrl;
    vs.me = 1;
    const latest = this.latestSnap()!;
    vs.takeBack = smp.phase === 'play' && latest.of === 1 && !latest.cl && vs.ball.state === 'held';
    this.predictOwn(dt, latest);
    // events (sounds, effects) once the drawn world reaches them
    for (const e of this.pendingEv.splice(0)) this.react(e);
    this.view.update(dt, vs);
    this.trackBall();
    this.hudFrame(this.guestScore, latest.c / 10, latest.sc / 10, !!latest.ot, latest.st);
    this.drawMeter(dt);
  }

  /**
   * Guest: its own player moves at once with its stick (the host's answer comes a round trip
   * later); reconcile() pulls the prediction towards the host's positions. Only while the player
   * runs freely: jumps, shots, dunks and stumbles are drawn from the host's snapshots.
   */
  private predictOwn(dt: number, latest: Snap): void {
    const id = latest.ct[1];
    const vs = this.vs;
    const fs = id >= 0 ? vs.p[id] : null;
    const free = !!fs && (fs.act === 'free' || fs.act === 'pass' || fs.act === 'steal') && this.guestPhase === 'play';
    const now = this.time.now;
    if (!fs || !free || id !== this.pred.id) {
      this.pred = { id: free ? id : -1, x: fs?.x ?? 0, z: fs?.z ?? 0, vx: 0, vz: 0, face: fs?.face ?? 0 };
      this.predHist = [];
      this.predFix = { x: 0, z: 0 };
      return;
    }
    const p = this.pred;
    const s = this.stick();
    const m = Math.min(1, Math.hypot(s.x, s.z));
    const turbo = this.turboHeld() && latest.st > 1 && m > 0.2;
    const has = vs.ball.holder === id;
    const sp = RUN * (turbo ? TURBO : 1) * (has ? 0.94 : 1) * (fs.act === 'pass' ? 0.6 : fs.act === 'steal' ? 0.45 : 1);
    const n = Math.max(1, Math.hypot(s.x, s.z));
    const tvx = m > 0.05 ? (s.x / n) * sp : 0, tvz = m > 0.05 ? (s.z / n) * sp : 0;
    const kk = Math.min(1, dt * 11);
    p.vx += (tvx - p.vx) * kk; p.vz += (tvz - p.vz) * kk;
    p.x = Phaser.Math.Clamp(p.x + p.vx * dt, BOUNDS.x0, BOUNDS.x1);
    p.z = Phaser.Math.Clamp(p.z + p.vz * dt, BOUNDS.z0, BOUNDS.z1);
    // ease in the correction from the last snapshot
    const f = Math.min(1, dt * 10);
    const cx = this.predFix.x * f, cz = this.predFix.z * f;
    this.predFix.x -= cx; this.predFix.z -= cz;
    p.x += cx; p.z += cz;
    for (const h of this.predHist) { h.x += cx; h.z += cz; }
    this.predHist.push({ at: now, x: p.x, z: p.z });
    while (this.predHist.length > 2 && now - this.predHist[0].at > 2000) this.predHist.shift();
    const spd = Math.hypot(p.vx, p.vz);
    if (spd > 1.2) {
      let d = Math.atan2(p.vx, p.vz) - p.face;
      while (d > Math.PI) d -= Math.PI * 2;
      while (d < -Math.PI) d += Math.PI * 2;
      p.face += d * Math.min(1, dt * 12);
    } else p.face = fs.face;
    fs.x = p.x; fs.z = p.z; fs.spd = spd; fs.turbo = turbo; fs.face = p.face;
  }

  /** Guest: compares the host's position of our player with where we predicted it back then. */
  private reconcile(d: Snap): void {
    const id = d.ct[1];
    if (this.isOver || id !== this.pred.id || id < 0 || !this.predHist.length) return;
    const sent = this.sentLog.find((e) => e.q === d.a);
    if (!sent) return;
    const at = Math.min(this.time.now, sent.at + Math.max(0, d.ia || 0));
    const hist = this.predHist;
    if (at < hist[0].at) return;
    let j = hist.length - 1;
    while (j > 0 && hist[j - 1].at > at) j--;
    const h1 = hist[j], h0 = hist[Math.max(0, j - 1)];
    const u = h1.at > h0.at ? Phaser.Math.Clamp((at - h0.at) / (h1.at - h0.at), 0, 1) : 1;
    const hx = d.p[id * PER_PLAYER] / 100, hz = d.p[id * PER_PLAYER + 1] / 100;
    const ex = hx - (h0.x + (h1.x - h0.x) * u), ez = hz - (h0.z + (h1.z - h0.z) * u);
    if (Math.hypot(ex, ez) > SNAP_PX) {
      this.pred.x += ex; this.pred.z += ez;
      for (const e of hist) { e.x += ex; e.z += ez; }
      this.predFix = { x: 0, z: 0 };
      return;
    }
    this.predFix = { x: Math.abs(ex) < 0.03 ? 0 : ex, z: Math.abs(ez) < 0.03 ? 0 : ez };
  }
}

function clip(s: string, n: number): string {
  return s.length > n ? s.slice(0, n - 1) + '…' : s;
}

