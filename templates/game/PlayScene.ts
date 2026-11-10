import { ArcadeScene, Controls, burst } from '@core';

export class PlayScene extends ArcadeScene {
  private controls!: Controls;
  private player!: Phaser.GameObjects.Rectangle;

  createGame(): void {
    const { width, height } = this.scale;
    this.controls = new Controls(this, { joystick: true, buttons: ['A'] });
    this.player = this.add.rectangle(width / 2, height * 0.8, 60, 60, 0xec3013);
    // HUD: score is automatic; lives, level and other readouts go in chips, never bare text:
    // this.hud.setLives(3); this.hud.setLevel(1); this.hud.setRight('0:30');
    // hudChip(this, HUD_MARGIN, HUD_ROW2_Y, { icon: 'coin', text: '0' }) for anything else.
  }

  updateGame(_time: number, delta: number): void {
    const dt = delta / 1000;
    this.player.x += this.controls.axisX * 500 * dt;
    if (this.controls.justA()) {
      this.addScore(10, this.player.x, this.player.y - 60);
      burst(this, this.player.x, this.player.y, 0xffd23f);
      this.sfx('blip');
    }
    if (this.elapsed > 30) this.endGame();
  }
}
