import Phaser from 'phaser';

/**
 * A top-down ship that rolls (banks) into sideways motion with a pseudo-3D look.
 *
 * The hull texture is split down the fuselage into a left and a right half. Rolling
 * narrows both halves (cos of the roll), foreshortens the wing that dips away from the
 * camera, enlarges the one that rises towards it, darkens the dipping wing and puts a
 * sheen on the rising one. A small yaw into the turn finishes it, so the wings dip
 * instead of the sprite spinning. Engine flames sit on the halves and follow the bank,
 * and a short exhaust trail is left behind.
 *
 * The bank is driven by the ship's real sideways speed, measured from its position every
 * frame, so keyboard, joystick, touch drag and any tilt input all bank it the same way.
 */
export interface BankedShipOptions {
  scale?: number;
  depth?: number;
  /** Largest roll in radians (default 0.85, about 49 degrees). */
  maxRoll?: number;
  /** Sideways speed in px/s that gives the full roll (default 420). */
  fullSpeed?: number;
  /** Engine flames in texture pixels relative to the hull centre; `s` scales the flame. */
  flames: { x: number; y: number; s: number }[];
  /** Flame textures, alternated for flicker (tip pointing down). */
  flameKeys: string[];
  /** Tints of the exhaust trail particles. */
  trailTints: number[];
  /** Lifespan of a trail puff in ms (default 260). */
  trailLife?: number;
}

type Img = Phaser.GameObjects.Image;

const DOT = 'bank-dot';
const SHADE = 0x4e5478;

export class BankedShip {
  x: number;
  y: number;
  readonly root: Phaser.GameObjects.Container;
  private left: Img;
  private right: Img;
  private sheenL: Img;
  private sheenR: Img;
  private flames: { img: Img; x: number; y: number; s: number }[] = [];
  private trail: Phaser.GameObjects.Particles.ParticleEmitter;
  private scale: number;
  private maxRoll: number;
  private fullSpeed: number;
  private flameKeys: string[];
  private roll = 0;
  private vx = 0;
  private vy = 0;
  private lastX: number;
  private lastY: number;
  private flick = 0;
  private trailX: number | null = null;
  private trailY: number | null = null;

  constructor(private scene: Phaser.Scene, x: number, y: number, key: string, o: BankedShipOptions) {
    this.x = this.lastX = x;
    this.y = this.lastY = y;
    this.scale = o.scale ?? 1;
    this.maxRoll = o.maxRoll ?? 0.85;
    this.fullSpeed = o.fullSpeed ?? 420;
    this.flameKeys = o.flameKeys;

    const tex = scene.textures.get(key);
    const src = tex.getSourceImage() as { width: number; height: number };
    const half = Math.floor(src.width / 2);
    if (!tex.has('bankL')) tex.add('bankL', 0, 0, 0, half, src.height);
    if (!tex.has('bankR')) tex.add('bankR', 0, half, 0, src.width - half, src.height);
    if (!scene.textures.exists(DOT)) {
      const g = scene.make.graphics({ x: 0, y: 0 }, false);
      for (let r = 8; r > 0; r--) g.fillStyle(0xffffff, 0.14 + (8 - r) * 0.1).fillCircle(8, 8, r);
      g.generateTexture(DOT, 16, 16);
      g.destroy();
    }

    this.trail = scene.add.particles(0, 0, DOT, {
      emitting: false, lifespan: o.trailLife ?? 260, speedY: { min: 150, max: 210 }, speedX: { min: -10, max: 10 },
      scale: { start: 0.55 * this.scale, end: 0.05 }, alpha: { start: 0.55, end: 0 }, tint: o.trailTints, blendMode: 'ADD',
    }).setDepth((o.depth ?? 10) - 1);

    this.root = scene.add.container(x, y).setDepth(o.depth ?? 10);
    for (const f of o.flames) {
      const img = scene.add.image(0, 0, o.flameKeys[0]).setOrigin(0.5, 0.1).setBlendMode(Phaser.BlendModes.ADD);
      this.flames.push({ img, x: f.x, y: f.y, s: f.s });
      this.root.add(img);
    }
    this.left = scene.add.image(0, 0, key, 'bankL').setOrigin(1, 0.5);
    this.right = scene.add.image(0, 0, key, 'bankR').setOrigin(0, 0.5);
    this.sheenL = scene.add.image(0, 0, key, 'bankL').setOrigin(1, 0.5).setTintFill(0xffffff).setBlendMode(Phaser.BlendModes.ADD).setAlpha(0);
    this.sheenR = scene.add.image(0, 0, key, 'bankR').setOrigin(0, 0.5).setTintFill(0xffffff).setBlendMode(Phaser.BlendModes.ADD).setAlpha(0);
    this.root.add([this.left, this.right, this.sheenL, this.sheenR]);
    this.apply();
  }

  get visible(): boolean { return this.root.visible; }

  setPosition(x: number, y = this.y): this {
    this.x = this.lastX = x;
    this.y = this.lastY = y;
    this.vx = this.vy = 0;
    this.roll = 0;
    this.trailX = this.trailY = null;
    this.apply();
    return this;
  }

  setVisible(v: boolean): this { this.root.setVisible(v); return this; }

  setAlpha(a: number): this { this.root.setAlpha(a); return this; }

  /** Current roll, -1 (banked left) .. 1 (banked right). */
  get bank(): number { return this.roll; }

  /** Call once per frame after the ship has moved. */
  update(dt: number): void {
    if (dt > 0) {
      const k = Math.min(1, dt * 16);
      this.vx += ((this.x - this.lastX) / dt - this.vx) * k;
      this.vy += ((this.y - this.lastY) / dt - this.vy) * k;
    }
    this.lastX = this.x;
    this.lastY = this.y;
    const target = Phaser.Math.Clamp(this.vx / this.fullSpeed, -1, 1);
    // quick into the bank, a little slower back to level
    const rate = Math.abs(target) > Math.abs(this.roll) ? 13 : 7;
    this.roll += (target - this.roll) * (1 - Math.exp(-rate * dt));
    if (Math.abs(this.roll) < 0.001) this.roll = 0;

    this.flick -= dt;
    if (this.flick <= 0) {
      this.flick = 0.05;
      const key = this.flameKeys[Math.floor(Math.random() * this.flameKeys.length)];
      for (const f of this.flames) f.img.setTexture(key).setData('j', 0.85 + Math.random() * 0.3);
    }
    this.apply();

    if (this.root.visible) {
      // puffs spread along the path since last frame keep the trail continuous
      const cos = Math.cos(this.root.rotation), sin = Math.sin(this.root.rotation);
      for (const f of this.flames) {
        if (f.s < 0.8) continue;
        const lx = f.img.x, ly = f.img.y + f.img.displayHeight * 0.55;
        const wx = this.x + lx * cos - ly * sin, wy = this.y + lx * sin + ly * cos;
        const px = this.trailX ?? wx, py = this.trailY ?? wy;
        const n = Phaser.Math.Clamp(Math.ceil(Math.hypot(wx - px, wy - py) / 5), 1, 8);
        for (let i = 1; i <= n; i++) this.trail.emitParticleAt(px + ((wx - px) * i) / n, py + ((wy - py) * i) / n, 1);
        this.trailX = wx; this.trailY = wy;
      }
    } else this.trailX = this.trailY = null;
  }

  private apply(): void {
    const th = this.roll * this.maxRoll;
    const s = Math.sin(th), c = Math.cos(th);
    const b = this.scale;
    // right wing dips when rolling right (s > 0): it gets narrower, shorter and darker
    const lx = b * c * (1 + 0.22 * s), rx = b * c * (1 - 0.22 * s);
    const ly = b * (1 + 0.03 * s), ry = b * (1 - 0.03 * s);
    this.left.setScale(lx, ly);
    this.right.setScale(rx, ry);
    this.sheenL.setScale(lx, ly);
    this.sheenR.setScale(rx, ry);
    const dip = Math.abs(s);
    const shade = Phaser.Display.Color.Interpolate.ColorWithColor(
      Phaser.Display.Color.ValueToColor(0xffffff), Phaser.Display.Color.ValueToColor(SHADE), 100, Math.round(dip * 100));
    const shadeHex = Phaser.Display.Color.GetColor(shade.r, shade.g, shade.b);
    this.left.setTint(s < 0 ? shadeHex : 0xffffff);
    this.right.setTint(s > 0 ? shadeHex : 0xffffff);
    this.sheenL.setAlpha(s > 0 ? dip * 0.38 : 0);
    this.sheenR.setAlpha(s < 0 ? dip * 0.38 : 0);
    this.root.setPosition(this.x, this.y).setRotation(this.roll * 0.1);

    // flames ride on their half of the hull; the far one shrinks and dims
    const thrust = Phaser.Math.Clamp(1 - this.vy / 900, 0.75, 1.35);
    for (const f of this.flames) {
      const side = f.x < 0 ? -1 : f.x > 0 ? 1 : 0;
      const hx = side < 0 ? lx : side > 0 ? rx : b * c;
      const hy = side < 0 ? ly : side > 0 ? ry : b;
      const far = side * s;              // > 0: this flame's wing dips away
      const j = (f.img.getData('j') as number | undefined) ?? 1;
      f.img.setPosition(f.x * hx, f.y * hy);
      f.img.setScale(f.s * b * c * (1 - 0.25 * far), f.s * b * j * thrust * (1 - 0.2 * far));
      f.img.setAlpha(1 - 0.35 * Math.max(0, far));
    }
  }

  destroy(): void {
    this.trail.destroy();
    this.root.destroy();
  }
}
