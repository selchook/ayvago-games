// Snack Shack: UI icons rendered once from the real 3D models (order bubbles, the day intro and the
// upgrade cards) with the shared three.js renderer into Phaser canvas textures.
import Phaser from 'phaser';
import { THREE } from '@core/three';
import { foodGeo, furnGeo, foodMat, furnMat, type FoodModel, type FurnitureModel } from './kit';
import { ITEM_MODEL, ITEM_SCALE } from './diner';
import { ITEMS, type Item, type UpgradeId } from './sim';

export const itemThumb = (it: Item) => 'ss-item-' + it;
export const upgradeThumb = (id: UpgradeId) => 'ss-up-' + id;

const UPGRADE_LOOK: Record<UpgradeId, { food?: FoodModel; furn?: FurnitureModel; yaw?: number }> = {
  patience: { furn: 'stoolBar' },
  grill: { furn: 'kitchenStove' },
  seat: { furn: 'stoolBar', yaw: 0.6 },
  plate: { food: 'plate' },
  timer: { furn: 'kitchenMicrowave' },
  drinks: { food: 'soda' },
  fryer: { food: 'fries' },
};

/** Renders every icon the game needs that is not in the texture cache yet. */
export function makeThumbs(scene: Phaser.Scene, renderer: THREE.WebGLRenderer): void {
  const ts = new THREE.Scene();
  ts.add(new THREE.HemisphereLight(0xffffff, 0x8899aa, 2.0));
  const sun = new THREE.DirectionalLight(0xffffff, 2.2);
  sun.position.set(-2, 4, 3);
  ts.add(sun);
  const cam = new THREE.PerspectiveCamera(26, 1, 0.01, 100);
  const canvas = renderer.domElement;
  const prevVp = renderer.getViewport(new THREE.Vector4());
  const prevClear = renderer.getClearColor(new THREE.Color());
  const prevAlpha = renderer.getClearAlpha();
  const prevShadow = renderer.shadowMap.enabled;
  renderer.shadowMap.enabled = false;
  renderer.setScissorTest(true);

  // every icon goes into its own cell of one render, then one read-back of the canvas: reading a
  // WebGL canvas is slow on software renderers, so it happens once, not once per icon
  const jobs: { key: string; obj: THREE.Object3D; fill: number }[] = [];
  const shoot = (key: string, obj: THREE.Object3D, fill = 1) => {
    if (!scene.textures.exists(key)) jobs.push({ key, obj, fill });
  };

  for (const it of ITEMS) {
    const m = new THREE.Mesh(foodGeo(ITEM_MODEL[it]), foodMat());
    m.scale.setScalar(ITEM_SCALE[it]);
    m.rotation.y = it === 'hotdog' ? 0.5 : 0.2;
    shoot(itemThumb(it), m, 1.05);
  }
  for (const [id, look] of Object.entries(UPGRADE_LOOK) as [UpgradeId, (typeof UPGRADE_LOOK)[UpgradeId]][]) {
    const m = look.food ? new THREE.Mesh(foodGeo(look.food), foodMat()) : new THREE.Mesh(furnGeo(look.furn!), furnMat());
    m.rotation.y = look.yaw ?? 0;
    shoot(upgradeThumb(id), m, 1.05);
  }
  const S = 112;
  const cols = Math.max(1, Math.floor(canvas.width / S));
  renderer.setScissor(0, 0, canvas.width, canvas.height);
  renderer.setViewport(0, 0, canvas.width, canvas.height);
  renderer.setClearColor(0x000000, 0);
  renderer.clear();
  jobs.forEach(({ obj, fill }, i) => {
    const cx = (i % cols) * S, cy = Math.floor(i / cols) * S;
    ts.add(obj);
    obj.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(obj);
    const c = box.getCenter(new THREE.Vector3());
    const r = box.getSize(new THREE.Vector3()).length() / 2;
    const dist = (r / Math.sin(THREE.MathUtils.degToRad(13))) / fill;
    cam.position.copy(c).addScaledVector(new THREE.Vector3(0.7, 0.75, 1.8).normalize(), dist);
    cam.lookAt(c);
    cam.near = dist / 20;
    cam.far = dist * 4;
    cam.updateProjectionMatrix();
    renderer.setViewport(cx, cy, S, S);
    renderer.setScissor(cx, cy, S, S);
    renderer.render(ts, cam);
    ts.remove(obj);
  });
  if (jobs.length) {
    const rows = Math.ceil(jobs.length / cols);
    const sheet = document.createElement('canvas');
    sheet.width = cols * S;
    sheet.height = rows * S;
    // GL rows count from the bottom of the canvas
    sheet.getContext('2d')!.drawImage(canvas, 0, canvas.height - rows * S, cols * S, rows * S, 0, 0, cols * S, rows * S);
    jobs.forEach(({ key }, i) => {
      const cx = (i % cols) * S, row = Math.floor(i / cols);
      const cv = document.createElement('canvas');
      cv.width = cv.height = S;
      cv.getContext('2d')!.drawImage(sheet, cx, (rows - 1 - row) * S, S, S, 0, 0, S, S);
      scene.textures.addCanvas(key, cv);
    });
  }

  renderer.setScissorTest(false);
  renderer.setViewport(prevVp);
  renderer.setClearColor(prevClear, prevAlpha);
  renderer.shadowMap.enabled = prevShadow;
}
