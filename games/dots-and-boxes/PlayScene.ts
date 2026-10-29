import Phaser from 'phaser';
import { ArcadeScene, burst, shake, flash, popup, txt, t, rng, net } from '@core';
import { B, LINES, BOXES, LEVELS, choose, completes, isH, hLine, vLine } from './ai';

const CELL = 120;
const BX = (720 - B * CELL) / 2;   // first dot x
const BY = 330;                    // first dot y
const ME = 0x3ee6ff, THEM = 0xff4fa3;
const ME_S = '#3ee6ff', THEM_S = '#ff4fa3';

type State = 'player' | 'ai' | 'busy';
/** Online move message: line + move number (guards against stale messages after a rematch). */
interface LineMsg { l: number; n: number }

export class PlayScene extends ArcadeScene {
  private lines = new Uint8Array(LINES);
  private owner: number[] = [];          // per box: 0 none, 1 me, 2 them
  private lineGfx: Array<Phaser.GameObjects.Rectangle | null> = [];
  private boxGfx: Phaser.GameObjects.GameObject[] = [];
  private state: State = 'busy';
  private hover = -1;
  private hoverBar!: Phaser.GameObjects.Rectangle;
  private keyCur = { r: 0, c: 0, h: true };
  private status!: Phaser.GameObjects.Text;
  private info!: Phaser.GameObjects.Text;
  private banner!: Phaser.GameObjects.Text;
  private myCount!: Phaser.GameObjects.Text;
  private theirCount!: Phaser.GameObjects.Text;
  private dots: Phaser.GameObjects.Arc[] = [];
  private level = 0;
  private lives = 3;
  private streak = 0;
  private round = 0;
  private chain = 0;
  private online = false;
  private moveNo = 0;
  private inbox: LineMsg[] = [];

  createGame(): void {
    const { width } = this.scale;
    this.lines = new Uint8Array(LINES);
    this.owner = new Array(BOXES).fill(0);
    this.lineGfx = new Array(LINES).fill(null);
    this.boxGfx = []; this.dots = [];
    this.state = 'busy'; this.hover = -1; this.keyCur = { r: 0, c: 0, h: true };
    this.level = 0; this.lives = 3; this.streak = 0; this.round = 0; this.chain = 0;
    this.online = net.active;
    this.moveNo = 0; this.inbox = [];
    this.useHud = !this.online;
    this.cameras.main.setBackgroundColor('#0f1029');

    // backdrop: faint grid + empty line slots
    const S = B * CELL;
    const g = this.add.graphics();
    g.fillStyle(0x000000, 0.35).fillRoundedRect(BX - 40, BY - 40, S + 80, S + 80, 22);
    g.lineStyle(3, 0x2b2f6a).strokeRoundedRect(BX - 40, BY - 40, S + 80, S + 80, 22);
    g.lineStyle(4, 0x23264f, 1);
    for (let l = 0; l < LINES; l++) {
      const [x1, y1, x2, y2] = this.ends(l);
      for (let k = 0; k < 5; k++) {
        const a = 0.18 + k * 0.15, b2 = a + 0.08;
        g.lineBetween(x1 + (x2 - x1) * a, y1 + (y2 - y1) * a, x1 + (x2 - x1) * b2, y1 + (y2 - y1) * b2);
      }
    }
    this.hoverBar = this.add.rectangle(0, 0, 1, 1, 0xffffff, 0.35).setDepth(8).setVisible(false);
    this.makeMarks();
    this.tweens.add({ targets: this.hoverBar, alpha: 0.15, duration: 420, yoyo: true, repeat: -1 });
    for (let r = 0; r <= B; r++) for (let c = 0; c <= B; c++) {
      this.add.image(BX + c * CELL, BY + r * CELL, 'glow').setDisplaySize(52, 52).setTint(0x8f9bff).setAlpha(0.35).setBlendMode('ADD').setDepth(9);
      this.dots.push(this.add.circle(BX + c * CELL, BY + r * CELL, 10, 0xf3f2f2).setStrokeStyle(3, 0x9aa4ff).setDepth(12));
    }

    this.status = txt(this, width / 2, 140, '', { title: true, size: 26, color: '#ffd23f' }).setDepth(30);
    this.info = txt(this, width / 2, 196, '', { size: 30, color: '#9aa4ff' }).setDepth(30);
    this.banner = txt(this, width / 2, BY + S / 2, '', { title: true, size: 50, strokeThickness: 10 }).setDepth(40).setVisible(false);

    // score panel
    const py = BY + S + 120;
    this.add.rectangle(width / 2, py, S + 40, 120, 0x000000, 0.4).setStrokeStyle(3, 0x2b2f6a);
    this.add.rectangle(BX + 30, py, 44, 44, ME, 0.6).setStrokeStyle(4, ME);
    const peer = clip(net.peerName || t('opponent'), 10);
    txt(this, BX + 70, py - 22, t('you'), { title: true, size: 16, color: ME_S }).setOrigin(0, 0.5);
    this.myCount = txt(this, BX + 70, py + 18, '0', { title: true, size: 32 }).setOrigin(0, 0.5);
    this.add.rectangle(BX + S - 30, py, 44, 44, THEM, 0.6).setStrokeStyle(4, THEM);
    txt(this, BX + S - 70, py - 22, this.online ? peer : t('cpu'), { title: true, size: 16, color: THEM_S }).setOrigin(1, 0.5);
    this.theirCount = txt(this, BX + S - 70, py + 18, '0', { title: true, size: 32 }).setOrigin(1, 0.5);
    txt(this, width / 2, py, '/ 25', { title: true, size: 18, color: '#5a5f9a' });
    const touch = this.sys.game.device.input.touch;
    txt(this, width / 2, py + 110, touch ? t('touchHint') : t('keysHint'), { size: 24, color: '#8890c8', wrap: 660 });

    // pointer: nearest line under the finger / mouse
    this.input.on('pointermove', (p: Phaser.Input.Pointer) => this.setHover(this.lineAt(p.x, p.y)));
    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => {
      const l = this.lineAt(p.x, p.y);
      if (l < 0) return;
      this.setHover(l);
      this.playerLine(l);
    });
    // keyboard: arrows move a line cursor, X flips it between horizontal and vertical, Space draws
    const kb = this.input.keyboard;
    const mv = (dr: number, dc: number) => {
      const k = this.keyCur;
      k.r = Phaser.Math.Clamp(k.r + dr, 0, k.h ? B : B - 1);
      k.c = Phaser.Math.Clamp(k.c + dc, 0, k.h ? B - 1 : B);
      this.setHover(k.h ? hLine(k.r, k.c) : vLine(k.r, k.c));
      if (this.state === 'player') this.sfx('move', { volume: 0.3 });
    };
    const flip = () => {
      const k = this.keyCur;
      k.h = !k.h;
      k.r = Math.min(k.r, k.h ? B : B - 1); k.c = Math.min(k.c, k.h ? B - 1 : B);
      mv(0, 0);
    };
    kb?.on('keydown-LEFT', () => mv(0, -1)); kb?.on('keydown-A', () => mv(0, -1));
    kb?.on('keydown-RIGHT', () => mv(0, 1)); kb?.on('keydown-D', () => mv(0, 1));
    kb?.on('keydown-UP', () => mv(-1, 0)); kb?.on('keydown-W', () => mv(-1, 0));
    kb?.on('keydown-DOWN', () => mv(1, 0)); kb?.on('keydown-S', () => mv(1, 0));
    kb?.on('keydown-X', flip); kb?.on('keydown-SHIFT', flip); kb?.on('keydown-TAB', flip);
    kb?.addCapture('TAB');   // Tab is a game key here, not browser focus navigation
    for (const k of ['SPACE', 'ENTER', 'Z']) kb?.on(`keydown-${k}`, () => { if (this.hover >= 0) this.playerLine(this.hover); else mv(0, 0); });

    if (this.online) {
      net.onScene(this, 'ln', (d: LineMsg) => {
        if (!d || typeof d.l !== 'number') return;
        this.inbox.push(d);
        this.takeRemote();
      });
    }
    this.startRound();
  }

  /** Owner marks: a ring for you, a cross for the other side (generated once). */
  private makeMarks(): void {
    if (this.textures.exists('mark-me')) return;
    const g = this.make.graphics({ x: 0, y: 0 }, false);
    g.lineStyle(12, 0xffffff).strokeCircle(32, 32, 24);
    g.generateTexture('mark-me', 64, 64);
    g.clear();
    g.lineStyle(12, 0xffffff).lineBetween(10, 10, 54, 54).lineBetween(54, 10, 10, 54);
    g.generateTexture('mark-them', 64, 64);
    g.destroy();
  }

  /** Line end points in world coordinates. */
  private ends(l: number): [number, number, number, number] {
    if (isH(l)) {
      const r = Math.floor(l / B), c = l % B;
      return [BX + c * CELL, BY + r * CELL, BX + (c + 1) * CELL, BY + r * CELL];
    }
    const k = l - 30, r = Math.floor(k / (B + 1)), c = k % (B + 1);
    return [BX + c * CELL, BY + r * CELL, BX + c * CELL, BY + (r + 1) * CELL];
  }

  private lineAt(x: number, y: number): number {
    let best = -1, bd = CELL * 0.48;
    for (let l = 0; l < LINES; l++) {
      const [x1, y1, x2, y2] = this.ends(l);
      // distance to the segment, with the dots themselves a little less attractive
      const mx = (x1 + x2) / 2, my = (y1 + y2) / 2;
      const along = isH(l) ? Math.abs(x - mx) : Math.abs(y - my);
      const across = isH(l) ? Math.abs(y - my) : Math.abs(x - mx);
      if (along > CELL / 2) continue;
      const d = across + along * 0.3;
      if (d < bd) { bd = d; best = l; }
    }
    return best;
  }

  private setHover(l: number): void {
    this.hover = l;
    if (l < 0 || this.lines[l] || this.state !== 'player') { this.hoverBar.setVisible(false); return; }
    const [x1, y1, x2, y2] = this.ends(l);
    this.hoverBar.setPosition((x1 + x2) / 2, (y1 + y2) / 2).setScale(isH(l) ? CELL - 20 : 14, isH(l) ? 14 : CELL - 20).setVisible(true);
    if (isH(l)) { this.keyCur = { r: Math.floor(l / B), c: l % B, h: true }; }
    else { const k = l - 30; this.keyCur = { r: Math.floor(k / (B + 1)), c: k % (B + 1), h: false }; }
  }

  private takeRemote(): void {
    // a chain of extra moves arrives as several messages in a row: apply them strictly in move
    // order, keep any that arrive ahead of their turn, drop only stale ones
    this.inbox = this.inbox.filter((d) => d.n >= this.moveNo).sort((a, b) => a.n - b.n);
    while (this.state === 'ai' && !this.isOver && this.inbox.length && this.inbox[0].n === this.moveNo) {
      const d = this.inbox.shift()!;
      if (d.l < 0 || d.l >= LINES || this.lines[d.l]) continue;
      this.draw(d.l, 2);
    }
  }

  private count(who: number): number { return this.owner.filter((o) => o === who).length; }

  private updateHud(): void {
    this.myCount.setText(String(this.count(1)));
    this.theirCount.setText(String(this.count(2)));
    if (this.online) { this.info.setText(t('vs', { name: net.peerName || t('opponent') })); return; }
    this.hud.setRight(`${t('lives')} ${Math.max(0, this.lives)}`);
    // the level sits in the info line: the HUD centre slot collides with LIVES in English
    this.info.setText(`${t('lv', { n: this.level + 1 })} · ${t('rival', { name: t('d' + this.level) })} · ${t('streak', { n: this.streak })}`);
  }

  private startRound(): void {
    this.round++;
    this.updateHud();
    const first = this.online ? net.myTurnFirst : this.round % 2 === 1;
    this.time.delayedCall(300, () => this.setTurn(first ? 'player' : 'ai', false));
  }

  private setTurn(s: State, again: boolean): void {
    if (this.isOver) return;
    const was = this.state;
    this.state = s;
    if (s === 'player') {
      this.status.setText(again ? t('again') : t('yourTurn')).setColor(ME_S);
      this.tweens.add({ targets: this.status, scale: { from: 1.25, to: 1 }, duration: 260, ease: 'Back.easeOut' });
      if (this.online && this.moveNo > 0 && !again && was !== 'player') this.sfx('turn', { volume: 0.45 });
      this.setHover(this.hover);
      return;
    }
    this.hoverBar.setVisible(false);
    this.status.setText(this.online ? t('theirTurn') : t('aiTurn')).setColor(THEM_S);
    if (this.online) this.takeRemote();
    else this.time.delayedCall(again ? rng.int(260, 420) : rng.int(420, 700), () => this.aiMove());
  }

  private playerLine(l: number): void {
    if (this.state !== 'player' || this.isOver) return;
    if (this.lines[l]) {
      this.sfx('error', { volume: 0.45 });
      return;
    }
    if (this.online) net.send('ln', { l, n: this.moveNo } satisfies LineMsg);
    this.draw(l, 1);
  }

  private aiMove(): void {
    if (this.isOver || this.state !== 'ai') return;
    const l = choose(this.lines, LEVELS[Math.min(this.level, LEVELS.length - 1)]);
    if (l < 0) return;
    this.draw(l, 2);
  }

  private draw(l: number, who: number): void {
    const done = completes(this.lines, l);
    this.lines[l] = 1;
    this.moveNo++;
    this.state = 'busy';
    this.hoverBar.setVisible(false);
    const [x1, y1, x2, y2] = this.ends(l);
    const color = who === 1 ? ME : THEM;
    const h = isH(l);
    const bar = this.add.rectangle((x1 + x2) / 2, (y1 + y2) / 2, h ? CELL : 12, h ? 12 : CELL, color).setDepth(10);
    const glow = this.add.rectangle(bar.x, bar.y, h ? CELL : 30, h ? 30 : CELL, color, 0.25).setDepth(9).setBlendMode('ADD');
    this.lineGfx[l] = bar;
    if (h) { bar.scaleX = 0; glow.scaleX = 0; } else { bar.scaleY = 0; glow.scaleY = 0; }
    this.tweens.add({ targets: [bar, glow], scaleX: 1, scaleY: 1, duration: 140, ease: 'Quad.easeOut' });
    this.sfxAt('line', bar.x, { volume: 0.5 });
    // light the two dots
    for (const [dx, dy] of [[x1, y1], [x2, y2]]) {
      const d = this.dots.find((o) => o.x === dx && o.y === dy);
      if (d) this.tweens.add({ targets: d, scale: 1.5, duration: 90, yoyo: true });
    }
    this.time.delayedCall(170, () => {
      if (this.isOver) return;
      if (done.length) {
        this.chain++;
        done.forEach((b, k) => this.claim(b, who, k));
        this.updateHud();
        if (this.owner.every((o) => o)) { this.time.delayedCall(400, () => this.finishRound()); return; }
        this.setTurn(who === 1 ? 'player' : 'ai', true);
      } else {
        this.chain = 0;
        this.setTurn(who === 1 ? 'ai' : 'player', false);
      }
    });
  }

  private claim(b: number, who: number, k: number): void {
    this.owner[b] = who;
    const r = Math.floor(b / B), c = b % B;
    const x = BX + c * CELL + CELL / 2, y = BY + r * CELL + CELL / 2;
    const color = who === 1 ? ME : THEM;
    const fill = this.add.rectangle(x, y, CELL - 22, CELL - 22, color, 0.45).setStrokeStyle(4, color).setDepth(5).setScale(0);
    const mark = this.add.image(x, y, who === 1 ? 'mark-me' : 'mark-them').setDisplaySize(54, 54).setDepth(6).setScale(0).setAlpha(0.9);
    this.boxGfx.push(fill, mark);
    this.tweens.add({ targets: fill, scale: 1, duration: 260, ease: 'Back.easeOut', delay: k * 80 });
    this.tweens.add({ targets: mark, scale: 54 / mark.width, angle: 360, duration: 380, ease: 'Back.easeOut', delay: k * 80 + 60 });
    burst(this, x, y, [color, 0xffffff], 14, 220);
    // a chain of boxes climbs in pitch
    this.sfxAt('box', x, { volume: 0.55, rate: 1 + Math.min(this.chain + k, 10) * 0.06 });
    if (who === 1) {
      if (!this.online) this.addScore(10 + Math.max(0, this.chain - 1) * 5);
      popup(this, x, y - 30, this.chain > 1 ? `x${this.chain}` : '+1', ME_S, 26);
    } else popup(this, x, y - 30, '+1', THEM_S, 26);
    if (this.chain >= 4 && k === 0) shake(this, 0.004 * Math.min(this.chain, 8), 120);
  }

  private showBanner(s: string, color: string): void {
    this.banner.setText(s).setColor(color).setVisible(true).setAlpha(1).setScale(0.3);
    this.tweens.add({ targets: this.banner, scale: 1, duration: 400, ease: 'Back.easeOut' });
  }

  private finishRound(): void {
    if (this.isOver) return;
    this.state = 'busy';
    this.status.setText('');
    this.hoverBar.setVisible(false);
    const me = this.count(1), them = this.count(2);
    const cx = this.scale.width / 2;
    const win = me > them;
    if (win) {
      this.showBanner(t('roundWin'), '#5dff7a'); flash(this, 0x5dff7a, 150);
      this.time.delayedCall(300, () => this.sfx('win'));
      for (let k = 0; k < 6; k++) this.time.delayedCall(k * 120, () => burst(this, rng.int(BX, BX + B * CELL), rng.int(BY, BY + B * CELL), [ME, 0xffd23f, 0xffffff], 20, 300));
    } else if (them > me) {
      this.showBanner(t('roundLose'), '#ec3013'); flash(this, 0xec3013, 200); shake(this, 0.02, 350);
      this.time.delayedCall(300, () => this.sfx('lose'));
    } else { this.showBanner(t('roundDraw'), '#3ee6ff'); this.sfx('draw'); }

    if (this.online) {
      this.setScore(me * 10);
      this.endGame({ win, title: win ? t('youWin') : them > me ? t('youLose') : t('draw'), draw: me === them, delay: 2000 });
      return;
    }
    if (win) {
      this.streak++;
      this.addScore(100 * (this.level + 1) + (me - them) * 10 + this.streak * 25, cx, BY - 30);
      this.level = Math.min(this.level + 1, LEVELS.length - 1);
    } else if (them > me) { this.lives--; this.streak = 0; }
    this.updateHud();
    if (this.lives <= 0) { this.endGame({ delay: 2000 }); return; }
    this.time.delayedCall(2200, () => this.clearBoard());
  }

  private clearBoard(): void {
    if (this.isOver) return;
    this.tweens.add({ targets: this.banner, alpha: 0, duration: 250, onComplete: () => this.banner.setVisible(false) });
    this.sfx('clear', { volume: 0.5 });
    const objs = [...this.boxGfx, ...this.lineGfx.filter((o): o is Phaser.GameObjects.Rectangle => !!o)];
    // the glow rectangles have no handle; collect every depth-9 rectangle as well
    this.children.list.forEach((o) => { if (o instanceof Phaser.GameObjects.Rectangle && o.depth === 9) objs.push(o); });
    objs.forEach((o) => this.tweens.add({ targets: o, alpha: 0, scale: 0.2, duration: 300, delay: rng.int(0, 250), onComplete: () => o.destroy() }));
    this.lines.fill(0); this.owner.fill(0); this.lineGfx.fill(null); this.boxGfx = [];
    this.chain = 0;
    this.time.delayedCall(700, () => { if (!this.isOver) this.startRound(); });
  }

  updateGame(): void {
    /* turn-based: driven by input, timers and tweens */
  }
}

function clip(s: string, n: number): string {
  return s.length > n ? s.slice(0, n - 1) + '…' : s;
}
