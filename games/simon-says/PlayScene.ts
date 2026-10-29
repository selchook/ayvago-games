import Phaser from 'phaser';
import { ArcadeScene, burst, shake, flash, popup, txt, t, isMuted } from '@core';

const CX = 360, CY = 660;
const R_OUT = 310, R_IN = 120;
// pad order: 0 top (green), 1 right (red), 2 bottom (blue), 3 left (yellow)
const DIM = [0x1f8a2c, 0x9a1818, 0x1846a8, 0xa88a00];
const LIT = [0x7dff8a, 0xff6a5a, 0x6ab0ff, 0xffee55];
const FREQ = [659.25, 440, 329.63, 554.37];
const KEYS: string[][] = [['UP', 'W', 'ONE'], ['RIGHT', 'D', 'TWO'], ['DOWN', 'S', 'THREE'], ['LEFT', 'A', 'FOUR']];

type State = 'show' | 'input' | 'busy';

export class PlayScene extends ArcadeScene {
  private lit: Phaser.GameObjects.Graphics[] = [];
  private seq: number[] = [];
  private pos = 0;
  private round = 0;
  private lives = 3;
  private state: State = 'busy';
  private timeLeft = 0;
  private hurried = false;
  private timeMax = 3;
  private mistakesThisRound = 0;
  private ring!: Phaser.GameObjects.Graphics;
  private centerTxt!: Phaser.GameObjects.Text;
  private status!: Phaser.GameObjects.Text;
  private progress!: Phaser.GameObjects.Text;

  createGame(): void {
    this.seq = []; this.pos = 0; this.round = 0; this.lives = 3; this.state = 'busy';
    this.timeLeft = 0; this.timeMax = 3; this.mistakesThisRound = 0; this.lit = [];
    this.cameras.main.setBackgroundColor('#141018');

    this.add.circle(CX, CY + 10, R_OUT + 26, 0x000000, 0.5);
    this.add.circle(CX, CY, R_OUT + 26, 0x222026).setStrokeStyle(6, 0x3a3640);
    for (let i = 0; i < 4; i++) {
      const base = this.add.graphics({ x: CX, y: CY });
      this.drawPad(base, i, DIM[i]);
      const l = this.add.graphics({ x: CX, y: CY }).setAlpha(0).setDepth(2);
      this.drawPad(l, i, LIT[i]);
      this.lit.push(l);
    }
    this.add.circle(CX, CY, R_IN - 8, 0x0e0c12).setStrokeStyle(8, 0x3a3640).setDepth(3);
    this.ring = this.add.graphics({ x: CX, y: CY }).setDepth(4);
    txt(this, CX, CY - 46, t('round'), { title: true, size: 18, color: '#9a94a8' }).setDepth(5);
    this.centerTxt = txt(this, CX, CY + 12, '0', { title: true, size: 52, color: '#ffd23f' }).setDepth(5);
    this.status = txt(this, CX, 200, '', { title: true, size: 34, color: '#f3f2f2' });
    this.progress = txt(this, CX, 1090, '', { title: true, size: 30, color: '#f3f2f2' });
    txt(this, CX, 1180, t('keys'), { size: 26, color: '#6f6880' });

    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => {
      const dx = p.x - CX, dy = p.y - CY, r = Math.hypot(dx, dy);
      if (r < R_IN || r > R_OUT + 20) return;
      const a = Phaser.Math.RadToDeg(Math.atan2(dy, dx));     // -180..180, 0 = right
      const pad = a >= -135 && a < -45 ? 0 : a >= -45 && a < 45 ? 1 : a >= 45 && a < 135 ? 2 : 3;
      this.press(pad);
    });
    KEYS.forEach((ks, pad) => ks.forEach((k) => this.input.keyboard?.on(`keydown-${k}`, () => this.press(pad))));

    this.updateHud();
    this.time.delayedCall(700, () => this.nextRound());
  }

  private drawPad(g: Phaser.GameObjects.Graphics, i: number, color: number): void {
    const gap = 0.07;
    const a1 = Phaser.Math.DegToRad(-135 + i * 90) + gap, a2 = Phaser.Math.DegToRad(-45 + i * 90) - gap;
    g.fillStyle(color);
    g.beginPath();
    g.arc(0, 0, R_OUT, a1, a2, false);
    g.arc(0, 0, R_IN + 14, a2 - 0.06, a1 + 0.06, true);
    g.closePath();
    g.fillPath();
    g.lineStyle(4, 0x000000, 0.35);
    g.strokePath();
  }

  private updateHud(): void {
    this.hud.setRight(`${t('lives')} ${Math.max(0, this.lives)}`);
    this.centerTxt.setText(String(this.round));
  }

  private stepMs(): number {
    return Math.max(170, 520 - this.round * 24);
  }

  /** Synth tone through Phaser's Web Audio graph (so host mute applies); falls back to a sample. */
  private tone(freq: number, ms: number, type: OscillatorType = 'square', vol = 0.12): void {
    if (isMuted()) return;
    const sm = this.sound as Phaser.Sound.WebAudioSoundManager;
    const ctx = sm.context;
    if (!ctx || !sm.destination) { this.sfx('pad', { rate: freq / 440, volume: 0.5 }); return; }
    try {
      const now = ctx.currentTime, osc = ctx.createOscillator(), gain = ctx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, now);
      gain.gain.setValueAtTime(0, now);
      gain.gain.linearRampToValueAtTime(vol, now + 0.01);
      gain.gain.setValueAtTime(vol, now + ms / 1000 * 0.8);
      gain.gain.linearRampToValueAtTime(0, now + ms / 1000);
      osc.connect(gain).connect(sm.destination);
      osc.start(now);
      osc.stop(now + ms / 1000 + 0.02);
    } catch { /* audio unavailable */ }
  }

  private flashPad(pad: number, ms: number): void {
    const l = this.lit[pad];
    this.tweens.killTweensOf(l);
    l.setAlpha(1).setScale(1.03);
    this.tweens.add({ targets: l, alpha: 0, scale: 1, duration: ms, delay: ms * 0.6, ease: 'Quad.easeIn' });
    this.tone(FREQ[pad], ms * 1.1);
  }

  private nextRound(): void {
    if (this.isOver) return;
    this.round++;
    this.seq.push(Phaser.Math.Between(0, 3));
    this.mistakesThisRound = 0;
    if (this.round > 1 && this.round % 5 === 1) {
      popup(this, CX, 300, t('speedUp'), '#ff4fa3', 30);
      this.sfx('levelup', { volume: 0.55, exact: true });
    }
    this.updateHud();
    this.playSequence();
  }

  private playSequence(): void {
    this.state = 'show';
    this.ring.clear();
    this.status.setText(t('watch')).setColor('#ffd23f');
    this.progress.setText('');
    const step = this.stepMs();
    this.seq.forEach((pad, i) => this.time.delayedCall(500 + i * step * 1.5, () => {
      if (!this.isOver) this.flashPad(pad, step);
    }));
    this.time.delayedCall(500 + this.seq.length * step * 1.5 + 100, () => {
      if (this.isOver) return;
      this.state = 'input';
      this.pos = 0;
      this.timeMax = Math.max(1.8, 3.2 - this.round * 0.05);
      this.timeLeft = this.timeMax;
      this.hurried = false;
      this.sfx('go', { volume: 0.3, exact: true });
      this.status.setText(t('yourTurn')).setColor('#5dff7a');
      this.progress.setText(`0 / ${this.seq.length}`);
    });
  }

  private press(pad: number): void {
    if (this.state !== 'input' || this.isOver) return;
    this.flashPad(pad, 220);
    const a = Phaser.Math.DegToRad(-90 + pad * 90);
    const px = CX + Math.cos(a) * (R_IN + R_OUT) / 2, py = CY + Math.sin(a) * (R_IN + R_OUT) / 2;
    if (pad !== this.seq[this.pos]) return this.mistake(t('wrong'));
    burst(this, px, py, [LIT[pad], 0xffffff], 12, 220);
    this.addScore(5 * this.round, px, py);
    this.pos++;
    this.timeLeft = this.timeMax;
    this.hurried = false;
    this.progress.setText(`${this.pos} / ${this.seq.length}`);
    if (this.pos >= this.seq.length) {
      this.state = 'busy';
      this.ring.clear();
      const bonus = 20 * this.round + (this.mistakesThisRound ? 0 : 10 * this.round);
      this.time.delayedCall(300, () => {
        if (this.isOver) return;
        this.addScore(bonus, CX, CY - 140);
        if (!this.mistakesThisRound && this.round >= 3) popup(this, CX, 300, t('perfect'), '#5dff7a', 30);
        this.sfx('round', { volume: 0.55, exact: true });
        if (!this.mistakesThisRound && this.round >= 3) this.time.delayedCall(380, () => this.sfx('perfect', { volume: 0.45, exact: true }));
        burst(this, CX, CY, [0xffd23f, 0x5dff7a, 0x3ee6ff, 0xff4fa3], 30, 360);
        this.tweens.add({ targets: this.centerTxt, scale: 1.4, duration: 150, yoyo: true });
      });
      this.time.delayedCall(1200, () => this.nextRound());
    }
  }

  private mistake(msg: string): void {
    this.state = 'busy';
    this.ring.clear();
    this.lives--;
    this.mistakesThisRound++;
    this.updateHud();
    this.tone(90, 600, 'sawtooth', 0.15);
    this.sfx('buzz', { volume: 0.5 });
    shake(this, 0.02, 350);
    flash(this, 0xec3013, 200);
    this.status.setText(msg).setColor('#ec3013');
    this.lit.forEach((l) => { l.setAlpha(0.6); this.tweens.add({ targets: l, alpha: 0, duration: 500 }); });
    if (this.lives <= 0) { this.endGame({ delay: 1200 }); return; }
    // replay the same sequence
    this.time.delayedCall(1300, () => { if (!this.isOver) this.playSequence(); });
  }

  updateGame(_time: number, delta: number): void {
    if (this.state !== 'input') return;
    this.timeLeft -= delta / 1000;
    const f = Math.max(0, this.timeLeft / this.timeMax);
    this.ring.clear();
    this.ring.lineStyle(10, f > 0.35 ? 0x5dff7a : 0xec3013, 0.9);
    this.ring.beginPath();
    this.ring.arc(0, 0, R_IN - 22, -Math.PI / 2, -Math.PI / 2 + f * Math.PI * 2, false);
    this.ring.strokePath();
    if (f <= 0.35 && !this.hurried && this.timeLeft > 0) { this.hurried = true; this.sfx('hurry', { volume: 0.3 }); }
    if (this.timeLeft <= 0) this.mistake(t('tooSlow'));
  }
}
