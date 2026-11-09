// Athletes are the platform characters drawn as camera-facing sprites in the 3D stadium: every
// move is one of the character's own poses (walk1/walk2 to run, jump, fall, swim1/swim2, hold1,
// cheer1/cheer2 …), never extra limbs. A soft blob shadow and a thin ring in the team colour sit
// under the feet.
import Phaser from 'phaser';
import { CHARACTER_FRAME, type CharacterId } from '@core';
import { THREE } from '@core/three';

/** Poses loaded for every character (textures `ch-<id>-<pose>`). */
export const POSES = [
  'stand', 'front', 'walk1', 'walk2', 'jump', 'fall', 'hit', 'duck', 'skid', 'swim1', 'swim2',
  'hold1', 'cheer1', 'cheer2', 'slide', 'back',
] as const;
export type Pose = (typeof POSES)[number] | 'bow';

/** Height of a standing athlete in metres. */
export const ATHLETE_H = 1.8;
const PX = ATHLETE_H / CHARACTER_FRAME.standHeight;   // metres per frame pixel
export const SPRITE_W = CHARACTER_FRAME.width * PX;
export const SPRITE_H = CHARACTER_FRAME.height * PX;
const FEET = 1 - CHARACTER_FRAME.originY;              // anchor at the feet

const textures = new Map<string, THREE.Texture>();

/** A three.js texture made from a Phaser texture (shared by every world of the game). */
export function tex3(scene: Phaser.Scene, key: string): THREE.Texture {
  let tx = textures.get(key);
  if (tx) return tx;
  const src = scene.textures.get(key).getSourceImage() as HTMLImageElement | HTMLCanvasElement;
  tx = new THREE.Texture(src as HTMLImageElement);
  tx.colorSpace = THREE.SRGBColorSpace;
  tx.anisotropy = 4;
  tx.needsUpdate = true;
  textures.set(key, tx);
  return tx;
}

/** A canvas texture made once (track markings, target faces, banners …). */
export function canvasTex(key: string, w: number, h: number, draw: (g: CanvasRenderingContext2D) => void, repeat?: [number, number]): THREE.Texture {
  let tx = textures.get(key);
  if (tx) return tx;
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  draw(c.getContext('2d')!);
  tx = new THREE.CanvasTexture(c);
  tx.colorSpace = THREE.SRGBColorSpace;
  tx.anisotropy = 8;
  if (repeat) {
    tx.wrapS = tx.wrapT = THREE.RepeatWrapping;
    tx.repeat.set(repeat[0], repeat[1]);
  }
  textures.set(key, tx);
  return tx;
}

/** A soft round shadow. */
export function blobTexture(): THREE.Texture {
  return canvasTex('blob', 128, 128, (g) => {
    const gr = g.createRadialGradient(64, 64, 4, 64, 64, 62);
    gr.addColorStop(0, 'rgba(0,0,0,0.55)');
    gr.addColorStop(0.6, 'rgba(0,0,0,0.28)');
    gr.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = gr;
    g.fillRect(0, 0, 128, 128);
  });
}

/**
 * The `hold1` pose with a bow in the outstretched hand (a tool meeting the character's own
 * hand, as in games/archery). Made once per character on a canvas the size of the frame.
 */
export function bowTexture(scene: Phaser.Scene, id: CharacterId): string {
  const key = `ch-${id}-bow`;
  if (scene.textures.exists(key)) return key;
  const src = scene.textures.get(`ch-${id}-hold1`).getSourceImage() as HTMLImageElement;
  const W = CHARACTER_FRAME.width, H = CHARACTER_FRAME.height;
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const g = c.getContext('2d')!;
  g.drawImage(src, 0, 0);
  // the outstretched fist of hold1 sits near (124, 106) on the frame
  const gx = 126, gy = 106;
  g.lineCap = 'round';
  g.strokeStyle = 'rgba(255,255,255,0.85)';
  g.lineWidth = 1.5;
  g.beginPath();
  g.moveTo(gx - 4, gy - 40);
  g.lineTo(gx - 4, gy + 40);
  g.stroke();
  g.strokeStyle = '#6b3d1f';
  g.lineWidth = 6;
  g.beginPath();
  g.moveTo(gx - 4, gy - 40);
  g.quadraticCurveTo(gx + 22, gy, gx - 4, gy + 40);
  g.stroke();
  g.strokeStyle = '#c98a4b';
  g.lineWidth = 2.5;
  g.beginPath();
  g.moveTo(gx - 3, gy - 38);
  g.quadraticCurveTo(gx + 19, gy, gx - 3, gy + 38);
  g.stroke();
  // the fist again on top of the grip, so the hand holds the bow
  g.drawImage(src, gx - 12, gy - 11, 24, 22, gx - 12, gy - 11, 24, 22);
  scene.textures.addCanvas(key, c);
  return key;
}

export class Athlete {
  readonly root = new THREE.Group();
  readonly sprite: THREE.Sprite;
  private mat: THREE.SpriteMaterial;
  private shadow: THREE.Mesh;
  private ring: THREE.Mesh;
  pose: Pose = 'stand';
  /** Extra height of the body above the root (jumps, dives); the shadow stays on the ground. */
  lift = 0;
  private bob = 0;

  constructor(private scene: Phaser.Scene, readonly id: CharacterId, readonly color: number, scale = 1) {
    this.mat = new THREE.SpriteMaterial({ map: tex3(scene, `ch-${id}-stand`), alphaTest: 0.5, transparent: false });
    this.sprite = new THREE.Sprite(this.mat);
    this.sprite.center.set(0.5, FEET);
    this.sprite.scale.set(SPRITE_W * scale, SPRITE_H * scale, 1);
    this.sprite.userData.ownMaterial = true;
    this.shadow = new THREE.Mesh(new THREE.PlaneGeometry(1.1 * scale, 0.55 * scale), new THREE.MeshBasicMaterial({ map: blobTexture(), transparent: true, depthWrite: false }));
    this.shadow.rotation.x = -Math.PI / 2;
    this.shadow.position.y = 0.02;
    this.shadow.userData.ownMaterial = true;
    this.ring = new THREE.Mesh(new THREE.RingGeometry(0.34 * scale, 0.42 * scale, 32), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.75, depthWrite: false }));
    this.ring.rotation.x = -Math.PI / 2;
    this.ring.scale.set(1.4, 0.8, 1);
    this.ring.position.y = 0.025;
    this.ring.userData.ownMaterial = true;
    this.root.add(this.shadow, this.ring, this.sprite);
  }

  setPose(p: Pose): this {
    if (p === this.pose) return this;
    this.pose = p;
    this.mat.map = tex3(this.scene, p === 'bow' ? bowTexture(this.scene, this.id) : `ch-${this.id}-${p}`);
    return this;
  }

  /** Lays the sprite flat for swimming (head forward, to +x on screen) or stands it up. */
  setSwim(on: boolean): void {
    this.mat.rotation = on ? -Math.PI / 2 : 0;
    this.sprite.center.set(0.5, on ? 0.5 : FEET);
  }

  showMarks(shadow: boolean, ring = shadow): void {
    this.shadow.visible = shadow;
    this.ring.visible = ring;
  }

  /** Running cycle by distance: one pose change every `stride` metres, with a small bounce. */
  run(dist: number, stride = 1.05): void {
    const phase = dist / stride;
    this.setPose(Math.floor(phase) % 2 ? 'walk2' : 'walk1');
    this.bob = Math.abs(Math.sin(phase * Math.PI)) * 0.06;
  }

  still(): void {
    this.bob = 0;
  }

  /** Puts the sprite at the root plus lift/bounce; call after moving the root. */
  sync(): void {
    this.sprite.position.y = this.lift + this.bob;
    const s = Phaser.Math.Clamp(1 - this.lift * 0.25, 0.45, 1);
    this.shadow.scale.set(s, s, 1);
  }

  setTint(c: number): void {
    this.mat.color.setHex(c);
  }
}
