import { ArcadeScene, Controls, burst } from '@core';

export class PlayScene extends ArcadeScene {
  private controls!: Controls;
  private player!: Phaser.GameObjects.Rectangle;

  createGame(): void {
    const { width, height } = this.scale;
    this.controls = new Controls(this, { joystick: true, buttons: ['A'] });
    this.player = this.add.rectangle(width / 2, height * 0.8, 60, 60, 0xec3013);
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
