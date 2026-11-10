// Pictures of the 3D athletes for the screens over the world (the event card, the results board,
// the medal table): the model is posed with one of its clips, drawn once by the game's three.js
// renderer and copied into a Phaser texture. No sprite art.
import Phaser from 'phaser';
import { THREE } from '@core/three';
import { Athlete, type Clip } from './athlete';

export interface Shot {
  clip: Clip;
  /** Point in the clip, 0..1. */
  at?: number;
  /** Turn of the athlete (0 = to the right of the picture, π/2 = facing the viewer). */
  yaw?: number;
  /** Bust (head and shoulders) or the whole body. */
  bust?: boolean;
  swim?: boolean;
  bow?: boolean;
  w?: number;
  h?: number;
}

let stage: { scene: THREE.Scene; cam: THREE.PerspectiveCamera } | null = null;

function makeStage() {
  // the same kind of lights and fog as the venues, so the athletes' shaders are shared
  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(0xffffff, 500, 1000);
  scene.add(new THREE.HemisphereLight(0xeaf6ff, 0x8a7a66, 2.0));
  const sun = new THREE.DirectionalLight(0xffffff, 2.2);
  sun.position.set(2, 4, 5);
  sun.castShadow = true;
  sun.shadow.mapSize.set(256, 256);
  Object.assign(sun.shadow.camera, { left: -2, right: 2, top: 2, bottom: -2, near: 0.5, far: 20 });
  scene.add(sun);
  const cam = new THREE.PerspectiveCamera(30, 1, 0.1, 50);
  return { scene, cam };
}

/**
 * Draws a model in a pose into the texture `key` (once; later calls return the key at once).
 * `renderer` is the game's three.js renderer (World3D.renderer).
 */
export function portrait(phaser: Phaser.Scene, renderer: THREE.WebGLRenderer, key: string, modelKey: string, shot: Shot): string {
  if (phaser.textures.exists(key)) return key;
  const w = shot.w ?? 128, h = shot.h ?? 128;
  stage ??= makeStage();
  const { scene, cam } = stage;
  const a = new Athlete(modelKey, 0xffffff);
  a.showMarks(false);
  a.face(shot.yaw ?? Math.PI / 2 - 0.35);
  if (shot.bow) a.holdBow(true);
  scene.add(a.root);
  if (shot.swim) {
    a.setSwim(true);
    a.setStroke(1);
    a.update(0.35);
  } else {
    a.play(shot.clip, { fade: 0, at: shot.at ?? 0.3 });
    a.update(0);
  }
  // frame the posed body (its skinned vertices), a little from above and the side
  a.root.updateMatrixWorld(true);
  const box = new THREE.Box3();
  const full = new THREE.Box3().setFromObject(a.body, true);
  if (shot.bust) {
    // head and shoulders: the top 60% of the body
    box.copy(full);
    box.min.y = full.max.y - (full.max.y - full.min.y) * 0.6;
  } else box.copy(full);
  const c = box.getCenter(new THREE.Vector3());
  const size = box.getSize(new THREE.Vector3());
  cam.aspect = w / h;
  cam.fov = 26;
  const tan = Math.tan(THREE.MathUtils.degToRad(cam.fov / 2));
  const fit = Math.max(size.y, size.x / cam.aspect) * 0.56 / tan + size.z / 2;
  const dir = new THREE.Vector3(0.12, 0.22, 1).normalize();
  cam.position.copy(c).addScaledVector(dir, fit);
  cam.lookAt(c);
  cam.updateProjectionMatrix();

  // draw into the bottom-left corner of the shared canvas and read the pixels back at once
  // (a CPU copy: drawing the WebGL canvas into a 2D canvas stalls badly on some GPUs)
  const prevClear = renderer.getClearColor(new THREE.Color());
  const prevAlpha = renderer.getClearAlpha();
  const vp = renderer.getViewport(new THREE.Vector4());
  renderer.setViewport(0, 0, w, h);
  renderer.setScissor(0, 0, w, h);
  renderer.setScissorTest(true);
  renderer.setClearColor(0x000000, 0);
  renderer.clear();
  renderer.render(scene, cam);
  const gl = renderer.getContext();
  const px = new Uint8Array(w * h * 4);
  gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, px);
  const out = document.createElement('canvas');
  out.width = w;
  out.height = h;
  const g = out.getContext('2d')!;
  const img = g.createImageData(w, h);
  for (let y = 0; y < h; y++) {
    // GL rows run bottom-up; the drawing buffer holds premultiplied colour
    const src = (h - 1 - y) * w * 4, dst = y * w * 4;
    for (let x = 0; x < w * 4; x += 4) {
      const a = px[src + x + 3];
      const k = a ? 255 / a : 0;
      img.data[dst + x] = Math.min(255, px[src + x] * k);
      img.data[dst + x + 1] = Math.min(255, px[src + x + 1] * k);
      img.data[dst + x + 2] = Math.min(255, px[src + x + 2] * k);
      img.data[dst + x + 3] = a;
    }
  }
  g.putImageData(img, 0, 0);
  renderer.setScissorTest(false);
  renderer.setViewport(vp);
  renderer.setClearColor(prevClear, prevAlpha);
  scene.remove(a.root);
  a.dispose();
  phaser.textures.addCanvas(key, out);
  return key;
}
