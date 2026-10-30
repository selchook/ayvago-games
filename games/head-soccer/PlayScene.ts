import Phaser from 'phaser';
import {
  ArcadeScene, CHARACTER_FRAME, burst, shake, flash, txt, t, rng, net, loadCharacter, otherCharacters, playerCharacter,
} from '@core';
import {
  W, GROUND, GOAL_W, GOAL_TOP, BALL_R, CHAR_SCALE, KICK_T, AI_LEVELS,
  newWorld, resetPlayers, dropBall, step, think, type World, type Input, type Events,
} from './sim';
import { makeTextures, drawPitch, drawNets } from './art';

const MATCH_S = 60;
const SEND_MS = 50;              // ~20 messages per second each way
const INTERP_MS = 110;           // the guest draws the host's world this far in the past
const READY_S = 1.1;
const GOAL_S = 2.3;
export const POSES = ['stand', 'walk1', 'walk2', 'jump', 'hit'] as const;

type Phase = 'ready' | 'play' | 'goal' | 'end';
const PHASES: Phase[] = ['ready', 'play', 'goal', 'end'];

/** Host -> guest snapshot (host coordinates). */
interface Snap {
  t: number;
  b: number[];                    // x, y, vx, vy, angle*100
  p: number[][];                  // x, y, vx, vy, kickT*1000 (-1 idle), ground, mood
  s: [number, number];
  c: number;                      // tenths of a second left
  ph: number;
  gg: number;                     // golden goal
  ev: number[];
  gn: number;                     // goals so far (triggers the goal effects)
  w: number;                      // winner when the match ended (0 / 1), else -1
}
/** Guest -> host input: direction (guest's own view), jump held, kick presses so far. */
interface InMsg { x: number; u: number; k: number }

interface ViewPlayer { x: number; y: number; vx: number; vy: number; kickT: number; ground: boolean; face: 1 | -1; mood: number }

export class PlayScene extends ArcadeScene {
  private world!: World;
  private phase: Phase = 'ready';
  private phaseT = 0;
  private clock = MATCH_S;
  private golden = false;
  private goals: [number, number] = [0, 0];
  private goalCount = 0;
  private winner = -1;
  private kickoffSide: 0 | 1 = 0;
  private mood: [number, number] = [0, 0];         // 0 normal, 1 celebrating, 2 sad
  private level = 0;
  private matchNo = 0;
  private rivalPrefix = 'p2';
  private online = false;
  private host = true;
  // input
  private keys!: Record<string, Phaser.Input.Keyboard.Key>;
  private touchUi = false;
  private touchBtns: Array<{ id: string; x: number; y: number; r: number; g: Phaser.GameObjects.Arc }> = [];
  private kickPresses = 0;
  private kickWas = false;
  private kickQueued = false;
  private jumpQueued = false;
  private aiT = 0;
  private aiIn: Input = { x: 0, jump: false, kick: false };
  // online
  private sendT = 0;
  private remote: InMsg = { x: 0, u: 0, k: 0 };
  private remoteKicks = 0;
  private snaps: Array<{ s: Snap; at: number }> = [];
  private offset = Number.NaN;
  private lastEv: number[] = [];
  private lastGoals = 0;
  // drawing
  private sprites: Phaser.GameObjects.Image[] = [];
  private boots: Phaser.GameObjects.Image[] = [];
  private shadows: Phaser.GameObjects.Ellipse[] = [];
  private ball!: Phaser.GameObjects.Image;
  private ballShadow!: Phaser.GameObjects.Ellipse;
  private trail!: Phaser.GameObjects.Particles.ParticleEmitter;
  private walkT: [number, number] = [0, 0];
  private scoreMe!: Phaser.GameObjects.Text;
  private scoreThem!: Phaser.GameObjects.Text;
  private clockText!: Phaser.GameObjects.Text;
  private nameThem!: Phaser.GameObjects.Text;
  private banner!: Phaser.GameObjects.Text;
  private sub!: Phaser.GameObjects.Text;
  private lastTick = -1;
  private epoch = 0;

  createGame(): void {
    makeTextures(this);
    this.epoch++;
    this.world = newWorld();
    this.phase = 'ready'; this.phaseT = 0; this.clock = MATCH_S; this.golden = false; this.goals = [0, 0]; this.goalCount = 0; this.winner = -1;
    this.kickoffSide = 0; this.mood = [0, 0]; this.level = 0; this.matchNo = 0; this.rivalPrefix = 'p2';
    this.online = net.active; this.host = net.isHost;
    this.kickPresses = 0; this.kickWas = false; this.kickQueued = false; this.jumpQueued = false; this.aiT = 0; this.aiIn = { x: 0, jump: false, kick: false };
    this.sendT = 0; this.remote = { x: 0, u: 0, k: 0 }; this.remoteKicks = 0; this.snaps = []; this.offset = Number.NaN;
    this.lastEv = []; this.lastGoals = 0; this.walkT = [0, 0]; this.lastTick = -1;
    this.sprites = []; this.boots = []; this.shadows = []; this.touchBtns = [];

    drawPitch(this);
    for (let i = 0; i < 2; i++) {
      this.shadows.push(this.add.ellipse(0, GROUND + 4, 96, 18, 0x000000, 0.3).setDepth(2));
      this.sprites.push(this.add.image(0, GROUND, 'p1-stand').setOrigin(0.5, CHARACTER_FRAME.originY).setScale(CHAR_SCALE).setDepth(10 + i));
      this.boots.push(this.add.image(0, 0, 'hs-boot').setOrigin(0.35, 0.03).setDepth(12 + i).setVisible(false));
    }
    this.sprites[1].setTexture('p2-stand').setFlipX(true);
    this.ballShadow = this.add.ellipse(0, GROUND + 4, 48, 12, 0x000000, 0.3).setDepth(2);
    this.trail = this.add.particles(0, 0, 'hs-dot', {
      speed: 0, lifespan: 220, scale: { start: 2.6, end: 0 }, alpha: { start: 0.5, end: 0 }, tint: 0xffd23f, frequency: 18, emitting: false,
    }).setDepth(14);
    this.ball = this.add.image(W / 2, 200, 'hs-ball').setDepth(15);
    drawNets(this, 20);

    // scoreboard
    const sb = this.add.graphics().setDepth(30);
    sb.fillStyle(0x000000, 0.6).fillRoundedRect(W / 2 - 250, 10, 500, 92, 14);
    sb.lineStyle(3, 0xffd23f, 0.8).strokeRoundedRect(W / 2 - 250, 10, 500, 92, 14);
    txt(this, W / 2 - 170, 36, t('you'), { title: true, size: 16, color: '#ff7a4a' }).setDepth(31);
    this.nameThem = txt(this, W / 2 + 170, 36, '', { size: 22, color: '#7fd8ff' }).setDepth(31);
    this.scoreMe = txt(this, W / 2 - 110, 66, '0', { title: true, size: 40, color: '#ffffff' }).setDepth(31);
    this.scoreThem = txt(this, W / 2 + 110, 66, '0', { title: true, size: 40, color: '#ffffff' }).setDepth(31);
    this.clockText = txt(this, W / 2, 56, '1:00', { title: true, size: 24, color: '#ffd23f' }).setDepth(31);
    this.banner = txt(this, W / 2, 230, '', { title: true, size: 60, strokeThickness: 10 }).setDepth(60).setVisible(false);
    this.sub = txt(this, W / 2, 300, '', { size: 30, color: '#ffffff' }).setDepth(60).setVisible(false);

    this.setupInput();
    if (this.online) this.setupOnline();
    this.nameThem.setText(this.online ? clip(net.peerName || t('opponent'), 12) : t('d0'));
    this.startMatch();
  }

  // ---------------------------------------------------------------- input
  private setupInput(): void {
    const kb = this.input.keyboard;
    const K = Phaser.Input.Keyboard.KeyCodes;
    this.keys = {};
    if (kb) {
      const map: Record<string, number> = { left: K.LEFT, right: K.RIGHT, up: K.UP, a: K.A, d: K.D, w: K.W, space: K.SPACE, z: K.Z, k: K.K };
      for (const [n, c] of Object.entries(map)) this.keys[n] = kb.addKey(c, true, false);
      // quick taps can start and end between two frames: latch them
      for (const k of ['SPACE', 'Z', 'K']) kb.on(`keydown-${k}`, () => { this.kickQueued = true; });
      for (const k of ['UP', 'W']) kb.on(`keydown-${k}`, () => { this.jumpQueued = true; });
    }
    this.touchUi = this.sys.game.device.input.touch || new URLSearchParams(location.search).has('touch');
    if (!this.touchUi) return;
    this.input.addPointer(3);
    const mk = (id: string, x: number, y: number, r: number, color: number, draw: (g: Phaser.GameObjects.Graphics) => void) => {
      const g = this.add.circle(x, y, r, color, 0.28).setStrokeStyle(5, 0xffffff, 0.55).setDepth(9500);
      const ic = this.add.graphics().setDepth(9501);
      ic.fillStyle(0xffffff, 0.85);
      draw(ic);
      this.touchBtns.push({ id, x, y, r, g });
    };
    mk('left', 84, 664, 56, 0x3ee6ff, (g) => g.fillTriangle(60, 664, 100, 640, 100, 688));
    mk('right', 218, 664, 56, 0x3ee6ff, (g) => g.fillTriangle(242, 664, 202, 640, 202, 688));
    mk('jump', 1062, 664, 56, 0x5dff7a, (g) => g.fillTriangle(1062, 638, 1036, 684, 1088, 684));
    mk('kick', 1196, 640, 66, 0xec3013, () => undefined);
    this.add.image(1196, 640, 'hs-boot').setDepth(9501).setAngle(-60).setScale(1.2).setAlpha(0.9);
  }

  /** The local player's input this frame (in its own view: +x is towards the rival goal). */
  private readInput(): Input {
    const k = this.keys;
    const down = (n: string) => !!k[n]?.isDown;
    let x = 0, jump = down('up') || down('w') || this.jumpQueued, kick = down('space') || down('z') || down('k');
    const tapped = this.kickQueued;
    this.kickQueued = false;
    this.jumpQueued = false;
    if (down('left') || down('a')) x -= 1;
    if (down('right') || down('d')) x += 1;
    if (this.touchUi) {
      const held = new Set<string>();
      for (const p of this.input.manager.pointers) {
        if (!p.isDown) continue;
        for (const b of this.touchBtns) if (Math.hypot(p.x - b.x, p.y - b.y) < b.r + 26) held.add(b.id);
      }
      for (const b of this.touchBtns) b.g.setFillStyle(b.g.fillColor, held.has(b.id) ? 0.6 : 0.28);
      if (held.has('left')) x -= 1;
      if (held.has('right')) x += 1;
      if (held.has('jump')) jump = true;
      if (held.has('kick')) kick = true;
    }
    const press = (kick && !this.kickWas) || tapped;
    this.kickWas = kick;
    if (press) this.kickPresses++;
    return { x: Phaser.Math.Clamp(x, -1, 1), jump, kick: press };
  }

  // ---------------------------------------------------------------- match flow (solo + host)
  private startMatch(): void {
    this.matchNo++;
    this.goals = [0, 0]; this.goalCount = 0; this.clock = MATCH_S; this.golden = false; this.winner = -1; this.lastTick = -1;
    this.kickoffSide = this.online ? (net.starter as 0 | 1) : 0;
    if (!this.online) {
      const lv = AI_LEVELS[Math.min(this.level, AI_LEVELS.length - 1)];
      this.world.p[1].speed = lv.speed;
      this.nameThem.setText(t('d' + Math.min(this.level, AI_LEVELS.length - 1)));
      this.hud.setRight(t('matchN', { n: this.matchNo }));
    }
    this.updateScoreboard();
    const intro = this.online ? t('vs', { name: net.peerName || t('opponent') }) : t('matchIntro', { n: this.matchNo, name: t('d' + Math.min(this.level, AI_LEVELS.length - 1)) });
    this.showBanner(this.online ? t('kickoff') : t('matchN', { n: this.matchNo }), '#ffd23f', intro);
    this.ensureRival(() => this.kickoff());
  }

  /** Solo: every new match brings a different rival character (loaded on demand). */
  private ensureRival(then: () => void): void {
    if (this.online || this.matchNo === 1) { this.rivalPrefix = 'p2'; then(); return; }
    const pool = otherCharacters(playerCharacter());
    const id = pool[(this.matchNo - 1) % pool.length];
    const prefix = `r-${id}`;
    const epoch = this.epoch;
    const use = () => {
      if (epoch !== this.epoch || this.isOver) return;     // the scene restarted meanwhile
      this.rivalPrefix = this.textures.exists(`${prefix}-stand`) ? prefix : 'p2';
      then();
    };
    if (this.textures.exists(`${prefix}-stand`)) { use(); return; }
    loadCharacter(this.load, { id, prefix, poses: POSES });
    this.load.once(Phaser.Loader.Events.COMPLETE, use);
    this.load.start();
  }

  private kickoff(): void {
    if (this.isOver) return;
    resetPlayers(this.world);
    if (!this.online) this.world.p[1].speed = AI_LEVELS[Math.min(this.level, AI_LEVELS.length - 1)].speed;
    dropBall(this.world, this.kickoffSide);
    this.mood = [0, 0];
    this.phase = 'ready';
    this.phaseT = 0;
    this.trail.stop();
    this.ball.setScale(0);
    this.tweens.add({ targets: this.ball, scale: 1, duration: 300, ease: 'Back.easeOut' });
  }

  private onGoal(scorer: 0 | 1): void {
    this.goals[scorer]++;
    this.goalCount++;
    this.phase = 'goal';
    this.phaseT = 0;
    this.mood = scorer === 0 ? [1, 2] : [2, 1];
    this.kickoffSide = scorer === 0 ? 1 : 0;
    const mine = this.online ? scorer === (this.host ? 0 : 1) : scorer === 0;
    if (!this.online || this.host) {
      if (scorer === 0) this.addScore(100, this.world.b.x < W / 2 ? 200 : W - 200, 380);
    }
    this.goalFx(mine, this.viewX(this.world.b.x));
    this.updateScoreboard();
  }

  private finishMatch(): void {
    const leftWins = this.goals[0] > this.goals[1];
    this.phase = 'end';
    this.winner = leftWins ? 0 : 1;
    this.trail.stop();
    this.sfx('whistle', { volume: 0.6, exact: true });
    if (this.online) {
      this.sendSnap();
      this.endOnline();
      return;
    }
    if (leftWins) {
      const diff = this.goals[0] - this.goals[1];
      this.addScore(300 + 100 * this.level + 50 * diff, W / 2, 360);
      this.showBanner(t('matchWin'), '#5dff7a', t('nextRival'));
      flash(this, 0x5dff7a, 160);
      this.time.delayedCall(300, () => this.sfx('win', { volume: 0.7, exact: true }));
      this.mood = [1, 2];
      this.level++;
      this.time.delayedCall(3000, () => { if (!this.isOver) this.startMatch(); });
    } else {
      this.showBanner(t('matchLose'), '#ff4f5e', '');
      this.mood = [2, 1];
      this.time.delayedCall(300, () => this.sfx('lose', { volume: 0.7, exact: true }));
      this.time.delayedCall(2000, () => this.hideBanner());
      this.endGame({ win: false, delay: 2400 });
    }
  }

  /** Both sides of an online match: the host decided the winner. */
  private endOnline(): void {
    const me = this.host ? 0 : 1;
    const win = this.winner === me;
    this.setScore(this.goals[me] * 100 + (win ? 300 : 0));
    this.showBanner(win ? t('matchWin') : t('matchLose'), win ? '#5dff7a' : '#ff4f5e', '');
    this.time.delayedCall(300, () => this.sfx(win ? 'win' : 'lose', { volume: 0.7, exact: true }));
    this.time.delayedCall(2000, () => this.hideBanner());
    this.endGame({ win, title: win ? t('youWin') : t('youLose'), delay: 2400 });
  }

  // ---------------------------------------------------------------- loop
  updateGame(_time: number, delta: number): void {
    const dt = delta / 1000;
    const local = this.readInput();
    if (this.online && !this.host) { this.guestUpdate(local); return; }

    // inputs in world terms: player 0 is the local player (host / solo)
    let other: Input;
    if (this.online) {
      const k = this.remote.k > this.remoteKicks;
      this.remoteKicks = this.remote.k;
      other = { x: -this.remote.x, jump: !!this.remote.u, kick: k };
    } else {
      this.aiT -= dt;
      const lv = AI_LEVELS[Math.min(this.level, AI_LEVELS.length - 1)];
      if (this.aiT <= 0 && this.phase !== 'end') {
        this.aiT = lv.think;
        this.aiIn = this.phase === 'play' || this.phase === 'goal' ? think(this.world, 1, lv, Math.random) : { x: 0, jump: false, kick: false };
      }
      other = this.aiIn;
      this.aiIn = { ...this.aiIn, kick: false };
    }
    const frozen = this.phase === 'ready' || this.phase === 'end';
    const inputs: [Input, Input] = frozen ? [{ x: 0, jump: false, kick: false }, { x: 0, jump: false, kick: false }] : [local, other];
    this.phaseT += dt;
    if (this.phase === 'ready') {
      if (this.phaseT >= READY_S) {
        this.phase = 'play';
        this.sfx('whistle', { volume: 0.5, exact: true });
        this.hideBanner();
      }
    } else if (this.phase !== 'end') {
      // hold the ball in the air until the kickoff; then simulate
      const scored = step(this.world, inputs, dt);
      if (this.phase === 'play') {
        if (scored >= 0) this.onGoal(scored as 0 | 1);
        else if (!this.golden) {
          this.clock -= dt;
          if (this.clock <= 0) {
            this.clock = 0;
            if (this.goals[0] !== this.goals[1]) this.finishMatch();
            else {
              this.golden = true;
              this.showBanner(t('golden'), '#ffd23f', t('goldenSub'));
              this.sfx('whistle', { volume: 0.5, exact: true });
              this.time.delayedCall(1500, () => this.hideBanner());
            }
          }
        }
      } else if (this.phase === 'goal' && this.phaseT >= GOAL_S) {
        if (this.golden || (this.clock <= 0 && this.goals[0] !== this.goals[1])) this.finishMatch();
        else this.kickoff();
      }
    }
    if (this.phase === 'ready') {
      // everyone waits on their spot until the whistle
      resetPlayers(this.world);
      if (!this.online) this.world.p[1].speed = AI_LEVELS[Math.min(this.level, AI_LEVELS.length - 1)].speed;
    }
    this.effects(this.world.ev);
    this.render(this.viewPlayers(), this.world.b.x, this.world.b.y, this.world.b.vx, this.world.b.vy, this.world.b.a, dt);
    this.updateClock();
    if (this.online) {
      const now = this.time.now;
      if (now - this.sendT >= SEND_MS) {
        this.sendT = now - Math.min(SEND_MS, now - this.sendT - SEND_MS);
        this.sendSnap();
      }
    }
  }

  /** The two players as drawn on this screen: the local player first (always on the left). */
  private viewPlayers(): [ViewPlayer, ViewPlayer] {
    const v = (i: 0 | 1): ViewPlayer => {
      const p = this.world.p[i];
      return { x: p.x, y: p.y, vx: p.vx, vy: p.vy, kickT: p.kickT, ground: p.ground, face: p.face, mood: this.mood[i] };
    };
    return [v(0), v(1)];
  }

  private viewX(x: number): number {
    return this.online && !this.host ? W - x : x;
  }

  // ---------------------------------------------------------------- drawing
  private render(pl: [ViewPlayer, ViewPlayer], bx: number, by: number, bvx: number, bvy: number, ba: number, dt: number): void {
    for (const i of [0, 1] as const) {
      const p = pl[i], s = this.sprites[i], boot = this.boots[i];
      const prefix = i === 0 ? 'p1' : this.rivalPrefix;
      let pose: string;
      if (p.mood === 2) pose = 'hit';
      else if (!p.ground) pose = 'jump';
      else if (Math.abs(p.vx) > 10) {
        this.walkT[i] += dt * Math.abs(p.vx) / 60;
        pose = Math.floor(this.walkT[i]) % 2 ? 'walk2' : 'walk1';
      } else pose = p.mood === 1 && Math.floor(this.time.now / 220) % 2 ? 'jump' : 'stand';
      const hop = p.mood === 1 && p.ground ? -Math.abs(Math.sin(this.time.now / 140)) * 26 : 0;
      s.setTexture(`${prefix}-${pose}`).setPosition(p.x, p.y + hop).setFlipX(p.face < 0);
      s.setAngle(p.ground ? 0 : Phaser.Math.Clamp(p.vx * 0.012, -6, 6));
      const sh = this.shadows[i];
      const air = Math.max(0, GROUND - p.y);
      sh.setPosition(p.x, GROUND + 4).setScale(Math.max(0.4, 1 - air / 400)).setAlpha(0.3 * Math.max(0.3, 1 - air / 300));
      if (p.kickT >= 0) {
        const q = Phaser.Math.Clamp(p.kickT / KICK_T, 0, 1);
        const e = q < 0.35 ? -q / 0.35 * 0.3 : (q - 0.35) / 0.65;      // a little wind-up, then the swing
        const a = Phaser.Math.Linear(30, -105, Phaser.Math.Easing.Cubic.Out(Math.max(0, e))) + (e < 0 ? -e * 80 : 0);
        boot.setVisible(true).setPosition(p.x - p.face * 6, p.y - 58).setFlipX(p.face < 0).setAngle(p.face > 0 ? a : -a);
      } else boot.setVisible(false);
    }
    this.ball.setPosition(bx, by).setRotation(ba);
    const air = Math.max(0, GROUND - BALL_R - by);
    this.ballShadow.setPosition(bx, GROUND + 4).setScale(Math.max(0.3, 1 - air / 500)).setAlpha(0.3 * Math.max(0.25, 1 - air / 400));
    const fast = Math.hypot(bvx, bvy) > 820;
    this.trail.setPosition(bx, by);
    if (fast && !this.trail.emitting) this.trail.start();
    else if (!fast && this.trail.emitting) this.trail.stop();
  }

  private updateScoreboard(): void {
    const me = this.online && !this.host ? 1 : 0;
    this.scoreMe.setText(String(this.goals[me]));
    this.scoreThem.setText(String(this.goals[1 - me]));
  }

  private updateClock(): void {
    if (this.golden) { this.clockText.setText(t('goldenShort')).setColor('#ffd23f').setFontSize(16); return; }
    const c = Math.ceil(Math.max(0, this.clock));
    this.clockText.setText(`${Math.floor(c / 60)}:${String(c % 60).padStart(2, '0')}`).setFontSize(24);
    this.clockText.setColor(c <= 10 ? '#ff4f5e' : '#ffd23f');
    if (c <= 5 && c > 0 && c !== this.lastTick && (this.phase === 'play')) {
      this.lastTick = c;
      this.sfx('tick', { volume: 0.4, exact: true });
      this.tweens.add({ targets: this.clockText, scale: { from: 1.4, to: 1 }, duration: 250 });
    }
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

  private goalFx(mine: boolean, x: number): void {
    const gx = x < W / 2 ? GOAL_W / 2 : W - GOAL_W / 2;
    burst(this, gx, (GOAL_TOP + GROUND) / 2, mine ? [0xffd23f, 0xff7a4a, 0xffffff] : [0x3ee6ff, 0xffffff], 50, 520);
    shake(this, 0.02, 400);
    flash(this, mine ? 0xffd23f : 0x3ee6ff, 160);
    this.sfx(mine ? 'goal' : 'concede', { volume: 0.75, exact: true });
    this.showBanner(t('goalBanner'), mine ? '#ffd23f' : '#7fd8ff', mine ? t('goalYou') : t('goalThem'));
    this.time.delayedCall(1700, () => { if (this.phase !== 'end' && !this.isOver) this.hideBanner(); });
    const txtObj = mine ? this.scoreMe : this.scoreThem;
    txtObj.setScale(2);
    this.tweens.add({ targets: txtObj, scale: 1, duration: 600, ease: 'Back.easeOut' });
    if (mine) for (let k = 0; k < 5; k++) this.time.delayedCall(k * 140, () => burst(this, rng.int(200, W - 200), rng.int(120, 300), [0xffd23f, 0xff4fa3, 0x5dff7a, 0x3ee6ff], 18, 260));
  }

  /** Sounds and sparks for what happened since the last frame (counters from the simulation). */
  private effects(ev: Events | number[]): void {
    const now = Array.isArray(ev) ? ev : [...ev.kick, ...ev.swing, ...ev.head, ...ev.jump, ev.post, ev.bounce];
    const prev = this.lastEv.length ? this.lastEv : now;
    const grew = (k: number) => now[k] > prev[k];
    const bx = this.ball.x, by = this.ball.y;
    for (const i of [0, 1]) {
      // view index: on the guest's screen the host's player is on the right
      const local = this.online && !this.host ? 1 - i : i;
      const px = this.sprites[local]?.x ?? bx;
      if (grew(i)) {
        this.sfxAt('kick', bx, { volume: 0.8 });
        burst(this, bx, by, [0xffffff, 0xffd23f], 14, 300);
        shake(this, 0.006, 100);
      }
      if (grew(2 + i)) this.sfxAt('swing', px, { volume: 0.35 });
      if (grew(4 + i)) { this.sfxAt('head', bx, { volume: 0.6 }); burst(this, bx, by, [0xffffff], 8, 200); }
      if (grew(6 + i)) this.sfxAt('jump', px, { volume: 0.35 });
    }
    if (grew(8)) { this.sfxAt('post', bx, { volume: 0.7 }); shake(this, 0.008, 140); burst(this, bx, by - 20, [0xffffff, 0xcccccc], 10, 220); }
    if (grew(9)) this.sfxAt('bounce', bx, { volume: 0.35 });
    this.lastEv = now.slice();
  }

  // ---------------------------------------------------------------- online
  // Host: simulates everything with the guest's input ('in') and sends snapshots ('st').
  // Guest: sends its input and draws the host's world mirrored (each player sees themselves on
  // the left), interpolated INTERP_MS behind.
  private setupOnline(): void {
    if (this.host) {
      net.onScene(this, 'in', (d: InMsg) => {
        if (!d || typeof d.x !== 'number') return;
        this.remote = { x: Phaser.Math.Clamp(d.x, -1, 1), u: d.u ? 1 : 0, k: Number(d.k) || 0 };
      });
    } else {
      net.onScene(this, 'st', (d: Snap) => {
        if (!d || !Array.isArray(d.b) || !Array.isArray(d.p)) return;
        const at = this.time.now;
        const off = at - d.t;
        // the smallest delay seen (drifting up slowly) maps host time to ours
        this.offset = Number.isNaN(this.offset) ? off : Math.min(off, this.offset + 2);
        this.snaps.push({ s: d, at });
        if (this.snaps.length > 40) this.snaps.shift();
        this.onSnapEvents(d);
      });
    }
  }

  private sendSnap(): void {
    const r = Math.round, w = this.world;
    const ev = w.ev;
    net.send('st', {
      t: Math.round(this.time.now),
      b: [r(w.b.x), r(w.b.y), r(w.b.vx), r(w.b.vy), r(w.b.a * 100)],
      p: w.p.map((p, i) => [r(p.x), r(p.y), r(p.vx), r(p.vy), p.kickT < 0 ? -1 : r(p.kickT * 1000), p.ground ? 1 : 0, this.mood[i]]),
      s: [this.goals[0], this.goals[1]],
      c: Math.ceil(this.clock * 10),
      ph: PHASES.indexOf(this.phase),
      gg: this.golden ? 1 : 0,
      ev: [...ev.kick, ...ev.swing, ...ev.head, ...ev.jump, ev.post, ev.bounce],
      gn: this.goalCount,
      w: this.winner,
    } satisfies Snap);
  }

  /** Guest: discrete things in a snapshot (goals, clock, phase, the end). */
  private onSnapEvents(d: Snap): void {
    if (this.isOver) return;
    const prevPhase = this.phase;
    this.phase = PHASES[d.ph] ?? 'play';
    this.clock = d.c / 10;
    if (d.gg && !this.golden) {
      this.golden = true;
      this.showBanner(t('golden'), '#ffd23f', t('goldenSub'));
      this.sfx('whistle', { volume: 0.5, exact: true });
      this.time.delayedCall(1500, () => this.hideBanner());
    }
    if (d.gn > this.lastGoals) {
      this.lastGoals = d.gn;
      const scorer: 0 | 1 = d.s[0] > this.goals[0] ? 0 : 1;
      this.goals = [d.s[0], d.s[1]];
      if (scorer === 1) this.addScore(100);
      this.goalFx(scorer === 1, W - d.b[0]);
      this.updateScoreboard();
    }
    if (prevPhase === 'ready' && this.phase === 'play') { this.sfx('whistle', { volume: 0.5, exact: true }); this.hideBanner(); }
    if (prevPhase !== 'ready' && this.phase === 'ready') this.ball.setScale(1);
    if (this.phase === 'end' && d.w >= 0) {
      this.winner = d.w;
      this.goals = [d.s[0], d.s[1]];
      this.updateScoreboard();
      this.sfx('whistle', { volume: 0.6, exact: true });
      this.endOnline();
    }
  }

  private guestUpdate(local: Input): void {
    const now = this.time.now;
    if (now - this.sendT >= SEND_MS) {
      this.sendT = now - Math.min(SEND_MS, now - this.sendT - SEND_MS);
      net.send('in', { x: local.x, u: local.jump ? 1 : 0, k: this.kickPresses } satisfies InMsg);
    }
    if (!this.snaps.length) return;
    const target = now - this.offset - INTERP_MS;     // host time to draw
    let a = this.snaps[0], b = a;
    for (let i = this.snaps.length - 1; i >= 0; i--) {
      if (this.snaps[i].s.t <= target) { a = this.snaps[i]; b = this.snaps[i + 1] ?? a; break; }
    }
    const span = b.s.t - a.s.t;
    const k = span > 0 ? Phaser.Math.Clamp((target - a.s.t) / span, 0, 1) : 0;
    const L = (x: number, y: number) => x + (y - x) * k;
    const mirror = (i: 0 | 1): ViewPlayer => {
      const pa = a.s.p[i], pb = b.s.p[i];
      return {
        x: W - L(pa[0], pb[0]), y: L(pa[1], pb[1]), vx: -L(pa[2], pb[2]), vy: L(pa[3], pb[3]),
        kickT: (k < 0.5 ? pa[4] : pb[4]) / 1000, ground: !!(k < 0.5 ? pa[5] : pb[5]), face: i === 1 ? 1 : -1, mood: pb[6],
      };
    };
    const ba = a.s.b, bb = b.s.b;
    // jumps across a reset (kickoff) are not smoothed
    const jumpy = Math.abs(ba[0] - bb[0]) > 300 || Math.abs(ba[1] - bb[1]) > 300;
    const bx = W - (jumpy ? bb[0] : L(ba[0], bb[0])), by = jumpy ? bb[1] : L(ba[1], bb[1]);
    const latest = this.snaps[this.snaps.length - 1].s;
    this.effects(latest.ev);
    this.render([mirror(1), mirror(0)], bx, by, -L(ba[2], bb[2]), L(ba[3], bb[3]), -L(ba[4], bb[4]) / 100, this.game.loop.delta / 1000);
    this.updateClock();
  }
}

function clip(s: string, n: number): string {
  return s.length > n ? s.slice(0, n - 1) + '…' : s;
}

