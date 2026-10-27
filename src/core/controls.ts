import Phaser from 'phaser';

export interface ControlsOptions {
  /** Floating virtual joystick on the left half of the screen (touch devices). */
  joystick?: boolean;
  /** On-screen action buttons on the right (touch devices): ['A'] or ['A', 'B']. */
  buttons?: Array<'A' | 'B'>;
  /** Force on-screen controls even without a touch screen (tests/demo). */
  forceTouchUi?: boolean;
}

/**
 * Unified input: keyboard (arrows/WASD, Space/Z = A, X/Shift = B) + touch joystick/buttons.
 * Read `axisX/axisY` (-1..1), `left/right/up/down` (held), `a/b` (held),
 * and `justA()/justB()` (pressed this frame) from the scene's update loop.
 */
export class Controls {
  axisX = 0;
  axisY = 0;
  a = false;
  b = false;
  private prevA = false;
  private prevB = false;
  private pressedA = false;
  private pressedB = false;
  private keys: Record<string, Phaser.Input.Keyboard.Key> = {};
  private stick = { active: false, id: -1, ox: 0, oy: 0, x: 0, y: 0 };
  private touchA = false;
  private touchB = false;
  private base?: Phaser.GameObjects.Arc;
  private knob?: Phaser.GameObjects.Arc;
  readonly touchUi: boolean;

  constructor(private scene: Phaser.Scene, private o: ControlsOptions = {}) {
    const kb = scene.input.keyboard;
    if (kb) {
      const K = Phaser.Input.Keyboard.KeyCodes;
      const map: Record<string, number> = {
        left: K.LEFT, right: K.RIGHT, up: K.UP, down: K.DOWN,
        a2: K.A, d: K.D, w: K.W, s: K.S, space: K.SPACE, z: K.Z, x: K.X, shift: K.SHIFT, enter: K.ENTER,
      };
      for (const [n, c] of Object.entries(map)) this.keys[n] = kb.addKey(c, true, false);
    }
    this.touchUi = !!o.forceTouchUi || scene.sys.game.device.input.touch;
    if (this.touchUi && (o.joystick || o.buttons?.length)) this.buildTouch();
    scene.events.on(Phaser.Scenes.Events.PRE_UPDATE, this.poll, this);
    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => scene.events.off(Phaser.Scenes.Events.PRE_UPDATE, this.poll, this));
  }

  get left(): boolean { return this.axisX < -0.3; }
  get right(): boolean { return this.axisX > 0.3; }
  get up(): boolean { return this.axisY < -0.3; }
  get down(): boolean { return this.axisY > 0.3; }

  justA(): boolean { return this.pressedA; }
  justB(): boolean { return this.pressedB; }

  private down_(n: string): boolean {
    return !!this.keys[n]?.isDown;
  }

  private poll(): void {
    let x = 0, y = 0;
    if (this.down_('left') || this.down_('a2')) x -= 1;
    if (this.down_('right') || this.down_('d')) x += 1;
    if (this.down_('up') || this.down_('w')) y -= 1;
    if (this.down_('down') || this.down_('s')) y += 1;
    if (this.stick.active) {
      const dx = this.stick.x - this.stick.ox, dy = this.stick.y - this.stick.oy;
      const r = 70, len = Math.hypot(dx, dy);
      if (len > 8) {
        const k = Math.min(1, len / r) / len;
        x = dx * k; y = dy * k;
      }
    }
    this.axisX = Phaser.Math.Clamp(x, -1, 1);
    this.axisY = Phaser.Math.Clamp(y, -1, 1);
    this.a = this.down_('space') || this.down_('z') || this.down_('enter') || this.touchA;
    this.b = this.down_('x') || this.down_('shift') || this.touchB;
    this.pressedA = this.a && !this.prevA;
    this.pressedB = this.b && !this.prevB;
    this.prevA = this.a;
    this.prevB = this.b;
  }

  private buildTouch(): void {
    const s = this.scene;
    const { width, height } = s.scale;
    s.input.addPointer(2);
    const depth = 9500;
    if (this.o.joystick) {
      this.base = s.add.circle(0, 0, 80, 0xffffff, 0.12).setStrokeStyle(4, 0xffffff, 0.35).setScrollFactor(0).setDepth(depth).setVisible(false);
      this.knob = s.add.circle(0, 0, 38, 0xffffff, 0.35).setScrollFactor(0).setDepth(depth).setVisible(false);
      s.input.on('pointerdown', (p: Phaser.Input.Pointer) => {
        if (this.stick.active || p.x > width * 0.5 && this.o.buttons?.length) return;
        this.stick = { active: true, id: p.id, ox: p.x, oy: p.y, x: p.x, y: p.y };
        this.base!.setPosition(p.x, p.y).setVisible(true);
        this.knob!.setPosition(p.x, p.y).setVisible(true);
      });
      s.input.on('pointermove', (p: Phaser.Input.Pointer) => {
        if (!this.stick.active || p.id !== this.stick.id) return;
        this.stick.x = p.x; this.stick.y = p.y;
        const dx = p.x - this.stick.ox, dy = p.y - this.stick.oy, len = Math.hypot(dx, dy), r = 70;
        const k = len > r ? r / len : 1;
        this.knob!.setPosition(this.stick.ox + dx * k, this.stick.oy + dy * k);
      });
      const up = (p: Phaser.Input.Pointer) => {
        if (p.id !== this.stick.id) return;
        this.stick.active = false; this.stick.id = -1;
        this.base!.setVisible(false); this.knob!.setVisible(false);
      };
      s.input.on('pointerup', up);
      s.input.on('pointerupoutside', up);
    }
    const btns = this.o.buttons ?? [];
    btns.forEach((name, i) => {
      const bx = width - 110 - (btns.length - 1 - i) * 0, by = height - 130 - i * 170;
      const c = s.add.circle(bx, by, 72, name === 'A' ? 0xec3013 : 0x3ee6ff, 0.35)
        .setStrokeStyle(5, 0xffffff, 0.6).setScrollFactor(0).setDepth(depth).setInteractive();
      s.add.text(bx, by, name, { fontFamily: '"Press Start 2P"', fontSize: '34px', color: '#ffffff' })
        .setOrigin(0.5).setScrollFactor(0).setDepth(depth + 1).setAlpha(0.8);
      const set = (v: boolean) => {
        if (name === 'A') this.touchA = v; else this.touchB = v;
        c.setFillStyle(name === 'A' ? 0xec3013 : 0x3ee6ff, v ? 0.7 : 0.35);
      };
      c.on('pointerdown', () => set(true));
      c.on('pointerup', () => set(false));
      c.on('pointerout', () => set(false));
    });
  }
}
