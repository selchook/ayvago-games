// Last Convoy: the survivors' portraits, the weapons, the zombies, the dogs, the vehicles and a few
// props shown in the 2D screens are the kit's own models, rendered once offline into one sprite
// sheet (public/assets/quaternius/zombie-kit/icons.png, 128 px frames in ICON_KEYS order) by
// make-icons.mjs, which calls `renderIconSheet()` in the running game (dev server) and saves what it
// returns. The game loads the sheet like any image, under the intro.
import Phaser from 'phaser';
import { THREE, model, modelClips } from '@core/three';
import { asset } from '@core';
import { kk, partsOf } from './kit';

export const ICON = 128;
export const ICON_COLS = 8;
export const ICON_KEYS = [
  'hero-matt', 'hero-sam', 'hero-shaun', 'hero-lis', 'body-matt', 'body-sam', 'body-shaun', 'body-lis',
  'w-pistol', 'w-smg', 'w-shotgun', 'w-rifle', 'w-axe', 'w-knife', 'w-spear', 'w-guitar',
  'w-bat-barbed', 'w-bat-saw', 'z-basic', 'z-runner', 'z-arm', 'z-chubby', 'dog-shepherd', 'dog-pug',
  'v-pickup', 'v-pickup-armored', 'v-truck', 'v-truck-armored', 'v-sports', 'v-sports-armored', 'chest', 'chest-special',
  'town-sign', 'water-tower', 'container-red', 'barrel', 'z-crawler', 'cone-2', 'traffic-barrier-1', 'tyres',
] as const;
export type IconKey = (typeof ICON_KEYS)[number];
export const ICON_SHEET = 'lc-icons';
export const iconFrame = (k: string): number => Math.max(0, (ICON_KEYS as readonly string[]).indexOf(k));

export function loadIcons(load: Phaser.Loader.LoaderPlugin): void {
  load.spritesheet(ICON_SHEET, asset('quaternius/zombie-kit/icons.png'), { frameWidth: ICON, frameHeight: ICON });
}

/** A model icon at a size. */
export function modelIcon(scene: Phaser.Scene, x: number, y: number, key: string, size: number): Phaser.GameObjects.Image {
  return scene.add.image(x, y, ICON_SHEET, iconFrame(key)).setDisplaySize(size, size);
}

const W_MESH: Record<string, string> = { 'w-pistol': 'pistol', 'w-smg': 'smg', 'w-shotgun': 'shotgun', 'w-rifle': 'rifle', 'w-axe': 'axe', 'w-knife': 'knife', 'w-spear': 'spear', 'w-guitar': 'guitar', 'w-bat-barbed': 'bat-barbed', 'w-bat-saw': 'bat-saw' };

/** Rigged icons: the file, the meshes to show, the clip and time, head and shoulders or the whole figure. */
const RIG: Record<string, { file: string; show?: string[]; clip: string; t: number; head?: boolean; yaw?: number }> = {
  'hero-matt': { file: 'heroes', show: ['h-matt'], clip: 'Idle', t: 0.2, head: true },
  'hero-sam': { file: 'heroes', show: ['h-sam'], clip: 'Idle', t: 0.2, head: true },
  'hero-shaun': { file: 'heroes', show: ['h-shaun'], clip: 'Idle', t: 0.2, head: true },
  'hero-lis': { file: 'heroes', show: ['h-lis', 'shoulder'], clip: 'Idle', t: 0.2, head: true },
  'body-matt': { file: 'heroes', show: ['h-matt', 'shotgun'], clip: 'Idle_Gun', t: 0.3 },
  'body-sam': { file: 'heroes', show: ['h-sam', 'rifle'], clip: 'Idle_Gun', t: 0.3 },
  'body-shaun': { file: 'heroes', show: ['h-shaun', 'smg'], clip: 'Idle_Gun', t: 0.3 },
  'body-lis': { file: 'heroes', show: ['h-lis', 'shoulder', 'guitar'], clip: 'Idle', t: 0.3 },
  'z-basic': { file: 'zombie-basic', clip: 'Idle_Attack', t: 0.4 },
  'z-runner': { file: 'zombie-ribcage', clip: 'Run', t: 0.2 },
  'z-crawler': { file: 'zombie-ribcage', clip: 'Crawl', t: 0.5, yaw: 0.9 },
  'z-arm': { file: 'zombie-arm', clip: 'Idle', t: 0.3 },
  'z-chubby': { file: 'zombie-chubby', clip: 'Idle_Attack', t: 0.4 },
  'dog-shepherd': { file: 'dog-shepherd', clip: 'Idle', t: 0.5, yaw: 0.9 },
  'dog-pug': { file: 'dog-pug', clip: 'Idle', t: 0.5, yaw: 0.9 },
};

/** Renders every icon with the game's renderer into one canvas and returns it as a PNG data URL. */
export function renderIconSheet(renderer: THREE.WebGLRenderer): string {
  const keys = ICON_KEYS as readonly string[];
  const rows = Math.ceil(keys.length / ICON_COLS);
  const sheet = document.createElement('canvas');
  sheet.width = ICON * ICON_COLS;
  sheet.height = ICON * rows;
  const g = sheet.getContext('2d')!;
  const S = ICON * 2;
  const rt = new THREE.WebGLRenderTarget(S, S, { samples: 4, colorSpace: THREE.SRGBColorSpace });
  const px = new Uint8Array(S * S * 4);
  const tmp = document.createElement('canvas');
  tmp.width = tmp.height = S;
  const tg = tmp.getContext('2d')!;
  const cam = new THREE.PerspectiveCamera(26, 1, 0.05, 200);
  const old = { target: renderer.getRenderTarget(), color: renderer.getClearColor(new THREE.Color()), alpha: renderer.getClearAlpha() };
  keys.forEach((key, i) => {
    const scene = new THREE.Scene();
    scene.add(new THREE.HemisphereLight(0xfff4e8, 0x6a5a5a, 2.3));
    const sun = new THREE.DirectionalLight(0xffffff, 1.6);
    sun.position.set(-1, 2, 2.5);
    scene.add(sun);
    const rig = RIG[key];
    let obj: THREE.Object3D;
    let mixer: THREE.AnimationMixer | null = null;
    const mats: THREE.Material[] = [];
    const lit = () => { const m = new THREE.MeshLambertMaterial({ vertexColors: true }); mats.push(m); return m; };
    if (rig) {
      obj = model(kk(rig.file), { shadows: false });
      obj.traverse((o) => { if ((o as THREE.Mesh).isMesh) { o.visible = !rig.show || rig.show.includes(o.name); (o as THREE.Mesh).material = lit(); } });
      mixer = new THREE.AnimationMixer(obj);
      const clip = modelClips(kk(rig.file)).find((c) => c.name === rig.clip);
      if (clip) { mixer.clipAction(clip).play(); mixer.update(rig.t); }
    } else if (W_MESH[key]) {
      const root = model(kk('heroes'), { shadows: false });
      const w = root.getObjectByName(W_MESH[key]) as THREE.Mesh;
      const inner = new THREE.Mesh(w.geometry, lit());
      // the weapon's side to the camera: its longest axis across the frame, the next one up
      w.geometry.computeBoundingBox();
      const sz = w.geometry.boundingBox!.getSize(new THREE.Vector3());
      const axes = [new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, 0, 1)];
      const order = [0, 1, 2].sort((a, b) => [sz.x, sz.y, sz.z][b] - [sz.x, sz.y, sz.z][a]);
      const third = new THREE.Vector3().crossVectors(axes[order[0]], axes[order[1]]);
      const basis = new THREE.Matrix4().makeBasis(axes[order[0]], axes[order[1]], third).transpose();
      inner.quaternion.setFromRotationMatrix(basis);
      const tilt = new THREE.Group();
      tilt.add(inner);
      tilt.rotation.z = Math.PI / 5;
      obj = tilt;
    } else {
      obj = new THREE.Group();
      const file = key.startsWith('v-') ? 'vehicles:' + key.slice(2) : 'props:' + key;
      for (const p of partsOf(file)) {
        const m = new THREE.Mesh(p.geo, p.material === 'head' ? new THREE.MeshBasicMaterial({ color: 0xfff6d8 }) : p.material === 'brake' ? new THREE.MeshBasicMaterial({ color: 0xff3a2a }) : lit());
        m.applyMatrix4(p.mat);
        obj.add(m);
      }
    }
    const wrap = new THREE.Group();
    wrap.add(obj);
    if (!W_MESH[key]) obj.rotation.y = rig?.yaw ?? 0.5;
    scene.add(wrap);
    wrap.updateMatrixWorld(true);
    const box = new THREE.Box3();
    obj.traverse((o) => { if ((o as THREE.Mesh).isMesh && o.visible) box.expandByObject(o, true); });
    const c = box.getCenter(new THREE.Vector3());
    let size = box.getSize(new THREE.Vector3()).length();
    if (rig?.head) {
      const hgt = box.max.y - box.min.y;
      c.set(c.x, box.min.y + hgt * 0.78, c.z);
      size = hgt * 0.55;
      obj.rotation.y = 0.35;
    }
    const pitch = W_MESH[key] ? 0.25 : 0.35;
    const dist = (size / 2) / Math.tan(THREE.MathUtils.degToRad(13)) * 0.98;
    cam.position.set(c.x, c.y + Math.sin(pitch) * dist, c.z + Math.cos(pitch) * dist);
    cam.lookAt(c);
    renderer.setRenderTarget(rt);
    renderer.setClearColor(0x000000, 0);
    renderer.clear();
    renderer.render(scene, cam);
    renderer.readRenderTargetPixels(rt, 0, 0, S, S, px);
    const img = tg.createImageData(S, S);
    for (let y = 0; y < S; y++) img.data.set(px.subarray((S - 1 - y) * S * 4, (S - y) * S * 4), y * S * 4);
    tg.putImageData(img, 0, 0);
    const col = i % ICON_COLS, row = Math.floor(i / ICON_COLS);
    g.save();
    g.shadowColor = 'rgba(10,6,4,0.55)';
    g.shadowBlur = 6;
    g.shadowOffsetY = 3;
    g.drawImage(tmp, col * ICON + 4, row * ICON + 2, ICON - 8, ICON - 8);
    g.restore();
    for (const m of mats) m.dispose();
    obj.traverse((o) => { if ((o as THREE.SkinnedMesh).isSkinnedMesh) (o as THREE.SkinnedMesh).skeleton.dispose(); });
    mixer?.stopAllAction();
  });
  renderer.setRenderTarget(old.target);
  renderer.setClearColor(old.color, old.alpha);
  rt.dispose();
  return sheet.toDataURL('image/png');
}
