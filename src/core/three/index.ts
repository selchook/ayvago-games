// 3D runtime for Ayvago games: three.js draws the world, Phaser keeps everything else.
//
// Import from '@core/three' (never from '@core'), so only 3D games bundle three.js.
//
// How it fits together:
//   - three.js renders into its own off-screen WebGL canvas, once per frame, after the game's
//     update. Phaser shows that canvas as an image at depth WORLD_DEPTH, under the HUD and UI.
//   - Everything the core provides keeps working unchanged: the Ayvago intro, menu, pause,
//     result screen, HUD, Controls, i18n, music and the GHA protocol.
//   - Models are GLB files loaded by the Phaser loader in preload (they count towards the
//     boot progress) and parsed before the menu opens; model(key) returns a fresh copy.
//   - One three.js renderer serves the whole game: a restart reuses it, so WebGL contexts
//     never pile up.
import Phaser from 'phaser';
import * as THREE from 'three';
import { GLTFLoader, type GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { kenney } from '../assets';
import { addBootWork } from '../scenes';

export { THREE };

/** Depth of the 3D image in the Phaser scene: below game sprites, HUD and overlays. */
export const WORLD_DEPTH = -100;

// ---------------------------------------------------------------- models

const models = new Map<string, GLTF>();
const loader = new GLTFLoader();

/** URL of a model in a Kenney 3D kit: kenney3d('car-kit', 'race') → …/car-kit/models/gltf_format/race.glb */
export const kenney3d = (kit: string, name: string): string => kenney(`${kit}/models/gltf_format/${name.toLowerCase()}.glb`);

/**
 * Queues a GLB in a preload. The file goes through the Phaser loader (boot progress, errors)
 * and is parsed before the menu opens.
 */
export function loadModel(load: Phaser.Loader.LoaderPlugin, key: string, url: string): void {
  if (models.has(key)) return;
  const cacheKey = 'glb:' + key;
  load.binary(cacheKey, url);
  load.once(`filecomplete-binary-${cacheKey}`, (_k: string, _t: string, data: ArrayBuffer) => {
    addBootWork(new Promise<void>((resolve) => {
      loader.parse(data, '', (gltf) => {
        models.set(key, gltf);
        resolve();
      }, (err) => {
        console.error('[ayvago] model failed to parse:', key, err);
        resolve();
      });
    }));
  });
}

/** Shortcut: loadKenney3d(load, 'car', 'car-kit', 'race'). */
export function loadKenney3d(load: Phaser.Loader.LoaderPlugin, key: string, kit: string, name: string): void {
  loadModel(load, key, kenney3d(kit, name));
}

/** A new copy of a loaded model (skinned meshes keep their own skeleton). */
export function model(key: string, opts: { shadows?: boolean } = {}): THREE.Object3D {
  const gltf = models.get(key);
  if (!gltf) throw new Error(`[ayvago] model "${key}" is not loaded`);
  const obj = cloneSkinned(gltf.scene);
  const cast = opts.shadows ?? true;
  obj.traverse((o) => {
    if ((o as THREE.Mesh).isMesh) {
      o.castShadow = cast;
      o.receiveShadow = true;
    }
  });
  return obj;
}

/**
 * Moves a model inside a wrapper so its footprint is centred on x/z and it stands on y = 0
 * (Kenney kits put pivots in a corner). Returns the wrapper.
 */
export function grounded(obj: THREE.Object3D): THREE.Group {
  const box = new THREE.Box3().setFromObject(obj);
  const c = box.getCenter(new THREE.Vector3());
  obj.position.sub(new THREE.Vector3(c.x, box.min.y, c.z));
  const g = new THREE.Group();
  g.add(obj);
  return g;
}

/** The animation clips that came with a model (for THREE.AnimationMixer). */
export const modelClips = (key: string): THREE.AnimationClip[] => models.get(key)?.animations ?? [];

/** Size of a model's bounding box, in model units. */
export function modelSize(key: string): THREE.Vector3 {
  return new THREE.Box3().setFromObject(model(key, { shadows: false })).getSize(new THREE.Vector3());
}

// ---------------------------------------------------------------- the world

export interface World3DOptions {
  /** Vertical field of view in degrees (default 55). */
  fov?: number;
  near?: number;
  far?: number;
  /** Sky colour; null leaves the 3D image transparent over what Phaser draws below it. */
  background?: number | null;
  /** Linear fog: colour, start and end distance. */
  fog?: { color: number; near: number; far: number };
  /** Soft shadows from the sun (default true). */
  shadows?: boolean;
  /** Render scale: 1 matches the game's 720×1280 (or 1280×720) pixels; lower is cheaper (default 1). */
  quality?: number;
}

interface Shared {
  renderer: THREE.WebGLRenderer;
  canvas: HTMLCanvasElement;
  textureKey: string;
}
const shared = new WeakMap<Phaser.Game, Shared>();

function sharedRenderer(game: Phaser.Game, w: number, h: number): Shared {
  let s = shared.get(game);
  if (s && s.canvas.width === w && s.canvas.height === h) return s;
  if (s) {
    s.renderer.dispose();
    game.textures.remove(s.textureKey);
  }
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(1);
  renderer.setSize(w, h, false);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.NoToneMapping;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  s = { renderer, canvas, textureKey: `__world3d_${w}x${h}` };
  const tex = game.textures.create(s.textureKey, canvas as unknown as HTMLImageElement, w, h);
  tex?.add('__BASE', 0, 0, 0, w, h);
  shared.set(game, s);
  return s;
}

/**
 * A three.js world inside a Phaser scene. Create it in createGame() (or a menu decor); it renders
 * itself after every update of that scene and cleans up when the scene shuts down.
 */
export class World3D {
  readonly scene = new THREE.Scene();
  readonly camera: THREE.PerspectiveCamera;
  readonly renderer: THREE.WebGLRenderer;
  /** The sun (a directional light with shadows), set by addLights(). */
  sun: THREE.DirectionalLight | null = null;
  /** Called before each render with the frame time in seconds (mixers, spinning coins …). */
  onFrame: ((dt: number) => void) | null = null;
  private image: Phaser.GameObjects.Image;
  private texture: Phaser.Textures.Texture;
  private last = 0;

  constructor(private host: Phaser.Scene, opts: World3DOptions = {}) {
    const { width, height } = host.scale;
    const q = Phaser.Math.Clamp(opts.quality ?? 1, 0.4, 1);
    const w = Math.round(width * q), h = Math.round(height * q);
    const s = sharedRenderer(host.game, w, h);
    this.renderer = s.renderer;
    this.renderer.shadowMap.enabled = opts.shadows ?? true;
    this.texture = host.textures.get(s.textureKey);
    this.camera = new THREE.PerspectiveCamera(opts.fov ?? 55, width / height, opts.near ?? 0.1, opts.far ?? 400);
    if (opts.background !== null) this.scene.background = new THREE.Color(opts.background ?? 0x87ceeb);
    if (opts.fog) this.scene.fog = new THREE.Fog(opts.fog.color, opts.fog.near, opts.fog.far);
    this.image = host.add.image(0, 0, s.textureKey).setOrigin(0).setDisplaySize(width, height).setDepth(WORLD_DEPTH).setScrollFactor(0);

    const step = (time: number) => {
      const dt = this.last ? Math.min(0.05, (time - this.last) / 1000) : 0;
      this.last = time;
      this.onFrame?.(dt);
      this.render();
    };
    host.events.on(Phaser.Scenes.Events.POST_UPDATE, step);
    host.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      host.events.off(Phaser.Scenes.Events.POST_UPDATE, step);
      this.dispose();
    });
    this.render();
  }

  /** Sky light plus a sun with soft shadows over an area of `extent` units around the target. */
  addLights(o: { sky?: number; ground?: number; ambient?: number; sun?: number; intensity?: number; dir?: [number, number, number]; extent?: number } = {}): THREE.DirectionalLight {
    this.scene.add(new THREE.HemisphereLight(o.sky ?? 0xdff3ff, o.ground ?? 0x7a6a55, o.ambient ?? 1.6));
    const sun = new THREE.DirectionalLight(o.sun ?? 0xffffff, o.intensity ?? 2.2);
    const [x, y, z] = o.dir ?? [-0.5, 1, 0.4];
    sun.position.set(x, y, z).normalize().multiplyScalar(40);
    sun.castShadow = true;
    const e = o.extent ?? 20;
    Object.assign(sun.shadow.camera, { left: -e, right: e, top: e, bottom: -e, near: 1, far: 120 });
    sun.shadow.mapSize.set(1024, 1024);
    sun.shadow.bias = -0.0008;
    sun.shadow.normalBias = 0.02;
    this.scene.add(sun, sun.target);
    this.sun = sun;
    return sun;
  }

  /** Keeps the sun's shadow box centred on a moving point (the player). */
  followSun(p: THREE.Vector3): void {
    if (!this.sun) return;
    const off = this.sun.position.clone().sub(this.sun.target.position);
    this.sun.target.position.copy(p);
    this.sun.position.copy(p).add(off);
  }

  /** Projects a world point to game pixels (for popups and HUD markers over 3D objects). */
  toScreen(p: THREE.Vector3): { x: number; y: number; visible: boolean } {
    const v = p.clone().project(this.camera);
    const { width, height } = this.host.scale;
    return { x: (v.x + 1) / 2 * width, y: (1 - v.y) / 2 * height, visible: v.z < 1 };
  }

  /** Draws the world now (it also draws itself after every scene update). */
  render(): void {
    this.renderer.render(this.scene, this.camera);
    // The texture upload must happen in the same frame as the render (the drawing buffer is
    // not preserved).
    this.texture.source[0].update();
  }

  private dispose(): void {
    this.image.destroy();
    this.scene.traverse((o) => {
      // models share geometry with the parsed originals: only free per-world materials
      const m = o as THREE.Mesh;
      if (m.isMesh && m.userData.ownMaterial) (m.material as THREE.Material).dispose();
    });
    this.scene.clear();
    this.onFrame = null;
  }
}
