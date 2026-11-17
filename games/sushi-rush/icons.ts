// Sushi Rush: the dish, ingredient and station icons are the kit's own models, rendered once
// offline into one sprite sheet (public/assets/quaternius/sushi-kit/icons.png, 128 px frames in
// ICON_KEYS order) by make-icons.mjs, which calls `renderIconSheet()` in the running game (dev
// server) and saves what it returns. The game loads the sheet like any image, under the intro.
import Phaser from 'phaser';
import { THREE, model, modelClips } from '@core/three';
import { asset } from '@core';
import { sk } from './kit';

export const ICON = 128;
export const ICON_COLS = 8;
/** The sheet's frames, in order: a model key per frame. */
export const ICON_KEYS = [
  'maguro-nigiri', 'salmon-nigiri', 'ebi-nigiri', 'octopus-nigiri', 'onigiri', 'roll', 'salmon-roll', 'urchin-roll',
  'ramen', 'udon', 'gyoza', 'chukaman', 'dango', 'rice', 'nori', 'tuna',
  'salmon-fish', 'cucumber', 'ebi', 'tentacle', 'urchin', 'fridge', 'knives', 'board',
  'pot1', 'steamer', 'bell', 'lantern', 'stool', 'bottle', 'plate', 'sakura-flower',
  'fish-fillet', 'salmon', 'cucumber-cut', 'tamago-nigiri', 'wasabi', 'bowl', 'cutting-table', 'sakura-tree',
  'chef-panda', 'chef-cyan', 'chef-blond', 'chef-purple', 'chef-grey', 'critic',
] as const;
export type IconKey = (typeof ICON_KEYS)[number];
export const ICON_SHEET = 'sr-icons';
export const iconFrame = (k: IconKey): number => ICON_KEYS.indexOf(k);

export function loadIcons(load: Phaser.Loader.LoaderPlugin): void {
  load.spritesheet(ICON_SHEET, asset('quaternius/sushi-kit/icons.png'), { frameWidth: ICON, frameHeight: ICON });
}

/** How each icon is posed (yaw, a zoom, the pitch of the view). */
const POSE: Partial<Record<IconKey, { yaw?: number; zoom?: number; pitch?: number }>> = {
  'maguro-nigiri': { yaw: Math.PI / 2 + 0.5 }, 'salmon-nigiri': { yaw: Math.PI / 2 + 0.5 }, 'ebi-nigiri': { yaw: Math.PI / 2 + 0.5 },
  'octopus-nigiri': { yaw: Math.PI / 2 + 0.5 }, 'tamago-nigiri': { yaw: Math.PI / 2 + 0.5 },
  ramen: { pitch: 0.75 }, udon: { pitch: 0.75 }, nori: { pitch: 0.9 }, plate: { pitch: 0.8 }, bowl: { pitch: 0.6 },
  fridge: { yaw: 0.35, pitch: 0.2 }, stool: { pitch: 0.35 }, lantern: { pitch: 0.15 }, bell: { pitch: 0.2 }, 'sakura-tree': { pitch: 0.2 },
  tuna: { yaw: 0.3, pitch: 0.4 }, 'salmon-fish': { yaw: 0.3, pitch: 0.4 }, cucumber: { yaw: 0.5 }, tentacle: { yaw: 0.4 },
  'cutting-table': { pitch: 0.7 }, board: { pitch: 0.7 },
};

/**
 * Renders every icon with the game's renderer into one canvas and returns it as a PNG data URL
 * (called by make-icons.mjs; never during play).
 */
export function renderIconSheet(renderer: THREE.WebGLRenderer): string {
  const rows = Math.ceil(ICON_KEYS.length / ICON_COLS);
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
  const cam = new THREE.PerspectiveCamera(26, 1, 0.05, 100);
  const old = { target: renderer.getRenderTarget(), color: renderer.getClearColor(new THREE.Color()), alpha: renderer.getClearAlpha() };
  ICON_KEYS.forEach((key, i) => {
    const scene = new THREE.Scene();
    scene.add(new THREE.HemisphereLight(0xfff4e0, 0x8a6a50, 2.4));
    const sun = new THREE.DirectionalLight(0xffffff, 1.5);
    sun.position.set(-1, 2, 2.5);
    scene.add(sun);
    const chef = key.startsWith('chef-') || key === 'critic';
    const who = key === 'critic' ? 'panda' : key.slice(5);
    const obj = model(sk(chef ? (who === 'panda' ? 'panda' : 'rabbits') : key), { shadows: false });
    let mixer: THREE.AnimationMixer | null = null;
    if (chef) {
      const keep = who === 'panda' ? (key === 'critic' ? ['body'] : ['body', 'band']) : ['r-' + who];
      obj.traverse((o) => { if ((o as THREE.Mesh).isMesh) o.visible = keep.includes(o.name); });
      mixer = new THREE.AnimationMixer(obj);
      const clip = modelClips(sk(who === 'panda' ? 'panda' : 'rabbits')).find((c) => c.name === (key === 'critic' ? 'Yes' : 'Idle'));
      if (clip) { mixer.clipAction(clip).play(); mixer.update(key === 'critic' ? 0.5 : 0.3); }
      obj.updateMatrixWorld(true);
    }
    obj.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh) {
        const glow = (Array.isArray(m.material) ? m.material[0] : m.material)?.name === 'glow';
        m.material = glow ? new THREE.MeshBasicMaterial({ vertexColors: true }) : new THREE.MeshLambertMaterial({ vertexColors: true });
      }
    });
    const pose = POSE[key] ?? {};
    obj.rotation.y = pose.yaw ?? 0.45;
    const wrap = new THREE.Group();
    wrap.add(obj);
    scene.add(wrap);
    const box = new THREE.Box3().setFromObject(wrap, true);
    const c = box.getCenter(new THREE.Vector3());
    let size = box.getSize(new THREE.Vector3()).length();
    if (chef) {
      // head and shoulders
      const hgt = box.max.y - box.min.y;
      c.set(0, box.min.y + hgt * 0.72, 0);
      size = hgt * 0.62;
      obj.rotation.y = 0.35;
    }
    const pitch = pose.pitch ?? 0.5;
    const dist = (size / 2) / Math.tan(THREE.MathUtils.degToRad(13)) * 0.98 / (pose.zoom ?? 1);
    cam.position.set(c.x, c.y + Math.sin(pitch) * dist, c.z + Math.cos(pitch) * dist);
    cam.lookAt(c);
    renderer.setRenderTarget(rt);
    renderer.setClearColor(0x000000, 0);
    renderer.clear();
    renderer.render(scene, cam);
    renderer.readRenderTargetPixels(rt, 0, 0, S, S, px);
    const img = tg.createImageData(S, S);
    // flip vertically (GL rows start at the bottom)
    for (let y = 0; y < S; y++) img.data.set(px.subarray((S - 1 - y) * S * 4, (S - y) * S * 4), y * S * 4);
    tg.putImageData(img, 0, 0);
    const col = i % ICON_COLS, row = Math.floor(i / ICON_COLS);
    // a soft shadow under the model, then the model
    g.save();
    g.shadowColor = 'rgba(40,20,10,0.45)';
    g.shadowBlur = 6;
    g.shadowOffsetY = 3;
    g.drawImage(tmp, col * ICON + 4, row * ICON + 2, ICON - 8, ICON - 8);
    g.restore();
    obj.traverse((o) => { const m = o as THREE.Mesh; if (m.isMesh) (m.material as THREE.Material).dispose(); if ((o as THREE.SkinnedMesh).isSkinnedMesh) (o as THREE.SkinnedMesh).skeleton.dispose(); });
    mixer?.stopAllAction();
  });
  renderer.setRenderTarget(old.target);
  renderer.setClearColor(old.color, old.alpha);
  rt.dispose();
  return sheet.toDataURL('image/png');
}
